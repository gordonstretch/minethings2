import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { backup as sqliteBackup, DatabaseSync } from 'node:sqlite';

const execFileAsync = promisify(execFile);
const BACKUP_NAME_PATTERN = /^minethings2-\d{8}T\d{9}Z-[a-f0-9]{8}\.sqlite$/u;
const PENDING_RESTORE_NAME = '.pending-database-restore.json';

function compactTimestamp(value) {
  return new Date(value).toISOString().replace(/[-:.]/gu, '');
}

function ensureBackupDirectory(backupDirectory) {
  fs.mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(backupDirectory, 0o700); } catch {}
}

function backupPath(backupDirectory, fileName) {
  if (!BACKUP_NAME_PATTERN.test(String(fileName))) {
    throw new Error('That database backup name is not valid.');
  }
  const resolvedDirectory = path.resolve(backupDirectory);
  const resolvedFile = path.resolve(resolvedDirectory, fileName);
  if (path.dirname(resolvedFile) !== resolvedDirectory) {
    throw new Error('That database backup path is not valid.');
  }
  return resolvedFile;
}

function metadataPath(databaseBackupPath) {
  return `${databaseBackupPath}.json`;
}

function readJsonFile(filename) {
  try {
    return JSON.parse(fs.readFileSync(filename, 'utf8'));
  } catch {
    return null;
  }
}

function writeJsonAtomically(filename, value) {
  const temporary = `${filename}.${crypto.randomUUID()}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, filename);
  try { fs.chmodSync(filename, 0o600); } catch {}
}

export function defaultBackupDirectory(databaseFile) {
  return path.join(path.dirname(path.resolve(databaseFile)), 'backups');
}

export function verifyDatabaseBackup(filename) {
  let database;
  try {
    database = new DatabaseSync(filename, { readOnly: true });
    const results = database.prepare('PRAGMA integrity_check').all();
    if (results.length !== 1 || results[0].integrity_check !== 'ok') {
      throw new Error('SQLite integrity check failed.');
    }
    const requiredTables = new Set(database.prepare(`
      SELECT name FROM sqlite_master
      WHERE type = 'table' AND name IN ('players', 'catalog_items')
    `).all().map((row) => row.name));
    if (!requiredTables.has('players') || !requiredTables.has('catalog_items')) {
      throw new Error('The file is not a MineThings 2 database.');
    }
    return true;
  } finally {
    database?.close();
  }
}

export async function createDatabaseBackup({
  database, databaseFile, backupDirectory = defaultBackupDirectory(databaseFile),
  reason = 'Manual backup', createdBy = null, createdAt = Date.now()
}) {
  if (!database || !databaseFile || databaseFile === ':memory:') {
    throw new Error('Database backups require a persistent SQLite database.');
  }
  ensureBackupDirectory(backupDirectory);
  const fileName = `minethings2-${compactTimestamp(createdAt)}-${crypto.randomBytes(4).toString('hex')}.sqlite`;
  const destination = backupPath(backupDirectory, fileName);
  const temporary = `${destination}.${crypto.randomUUID()}.tmp`;
  try {
    await sqliteBackup(database, temporary);
    try { fs.chmodSync(temporary, 0o600); } catch {}
    verifyDatabaseBackup(temporary);
    fs.renameSync(temporary, destination);
    const stats = fs.statSync(destination);
    const metadata = {
      formatVersion: 1,
      fileName,
      createdAt: Number(createdAt),
      createdBy: createdBy ? String(createdBy) : null,
      reason: String(reason),
      size: stats.size
    };
    writeJsonAtomically(metadataPath(destination), metadata);
    return metadata;
  } catch (error) {
    try { fs.unlinkSync(temporary); } catch {}
    throw error;
  }
}

export function listDatabaseBackups(backupDirectory) {
  if (!backupDirectory || !fs.existsSync(backupDirectory)) return [];
  return fs.readdirSync(backupDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && BACKUP_NAME_PATTERN.test(entry.name))
    .map((entry) => {
      const filename = backupPath(backupDirectory, entry.name);
      const stats = fs.statSync(filename);
      const metadata = readJsonFile(metadataPath(filename)) ?? {};
      return {
        fileName: entry.name,
        createdAt: Number(metadata.createdAt) || stats.mtimeMs,
        createdBy: metadata.createdBy ? String(metadata.createdBy) : null,
        reason: metadata.reason ? String(metadata.reason) : 'Database backup',
        size: stats.size
      };
    })
    .sort((first, second) => second.createdAt - first.createdAt
      || second.fileName.localeCompare(first.fileName));
}

export function pendingDatabaseRestore(backupDirectory) {
  const marker = readJsonFile(path.join(backupDirectory, PENDING_RESTORE_NAME));
  if (!marker || !BACKUP_NAME_PATTERN.test(String(marker.fileName))) return null;
  return marker;
}

export function deleteDatabaseBackup(backupDirectory, fileName) {
  const selected = backupPath(backupDirectory, fileName);
  const pending = pendingDatabaseRestore(backupDirectory);
  if (pending?.fileName === fileName) {
    throw new Error('That backup is awaiting restoration and cannot be deleted.');
  }
  if (!fs.existsSync(selected)) throw new Error('That database backup no longer exists.');
  fs.unlinkSync(selected);
  try { fs.unlinkSync(metadataPath(selected)); } catch {}
}

export function stageDatabaseRestore({ backupDirectory, fileName, requestedBy, requestedAt = Date.now() }) {
  ensureBackupDirectory(backupDirectory);
  const selected = backupPath(backupDirectory, fileName);
  if (!fs.existsSync(selected)) throw new Error('That database backup no longer exists.');
  verifyDatabaseBackup(selected);
  const marker = {
    formatVersion: 1,
    fileName,
    requestedAt: Number(requestedAt),
    requestedBy: String(requestedBy ?? '')
  };
  writeJsonAtomically(path.join(backupDirectory, PENDING_RESTORE_NAME), marker);
  return marker;
}

function archiveFailedRestoreMarker(backupDirectory, marker, error) {
  const failedName = `.failed-database-restore-${compactTimestamp(Date.now())}.json`;
  writeJsonAtomically(path.join(backupDirectory, failedName), {
    ...marker,
    failedAt: Date.now(),
    error: error.message
  });
  try { fs.unlinkSync(path.join(backupDirectory, PENDING_RESTORE_NAME)); } catch {}
}

export async function applyPendingDatabaseRestore({ databaseFile, backupDirectory }) {
  const marker = pendingDatabaseRestore(backupDirectory);
  if (!marker) return null;
  const source = backupPath(backupDirectory, marker.fileName);
  const token = crypto.randomUUID();
  const restoreTemporary = `${databaseFile}.${token}.restore-tmp`;
  const displaced = [databaseFile, `${databaseFile}-wal`, `${databaseFile}-shm`]
    .map((filename) => ({ filename, retired: `${filename}.${token}.restore-old` }))
    .filter((entry) => fs.existsSync(entry.filename));
  let liveDatabase;
  let replacementInstalled = false;
  try {
    verifyDatabaseBackup(source);
    if (fs.existsSync(databaseFile)) {
      liveDatabase = new DatabaseSync(databaseFile);
      await createDatabaseBackup({
        database: liveDatabase,
        databaseFile,
        backupDirectory,
        reason: `Automatic safety backup before restoring ${marker.fileName}`,
        createdBy: marker.requestedBy
      });
      liveDatabase.close();
      liveDatabase = null;
    }
    fs.copyFileSync(source, restoreTemporary, fs.constants.COPYFILE_EXCL);
    try { fs.chmodSync(restoreTemporary, 0o600); } catch {}
    verifyDatabaseBackup(restoreTemporary);
    for (const entry of displaced) fs.renameSync(entry.filename, entry.retired);
    fs.renameSync(restoreTemporary, databaseFile);
    replacementInstalled = true;
    verifyDatabaseBackup(databaseFile);
    fs.unlinkSync(path.join(backupDirectory, PENDING_RESTORE_NAME));
    for (const entry of displaced) {
      try { fs.unlinkSync(entry.retired); } catch {}
    }
    return { applied: true, ...marker };
  } catch (error) {
    try { liveDatabase?.close(); } catch {}
    try { fs.unlinkSync(restoreTemporary); } catch {}
    if (replacementInstalled) {
      try { fs.unlinkSync(databaseFile); } catch {}
    }
    if (!fs.existsSync(databaseFile)) {
      const original = displaced.find((entry) => entry.filename === databaseFile
        && fs.existsSync(entry.retired));
      if (original) fs.renameSync(original.retired, original.filename);
    }
    for (const entry of displaced.filter((candidate) => candidate.filename !== databaseFile)) {
      if (!fs.existsSync(entry.filename) && fs.existsSync(entry.retired)) {
        fs.renameSync(entry.retired, entry.filename);
      }
    }
    archiveFailedRestoreMarker(backupDirectory, marker, error);
    return { applied: false, ...marker, error: error.message };
  }
}

async function runDeploymentCommand(command, arguments_, repositoryRoot) {
  try {
    return await execFileAsync(command, arguments_, {
      cwd: repositoryRoot,
      timeout: 5 * 60 * 1000,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true
    });
  } catch (error) {
    const detail = String(error.stderr || error.stdout || error.message).trim()
      .replace(/(https?:\/\/)[^\s/@]+@/giu, '$1***@')
      .slice(-1000);
    throw new Error(`${command} ${arguments_.join(' ')} failed${detail ? `: ${detail}` : '.'}`);
  }
}

export async function updateRepository(repositoryRoot) {
  const git = await runDeploymentCommand('git', ['pull', '--ff-only'], repositoryRoot);
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const npm = await runDeploymentCommand(npmCommand,
    ['install', '--omit=dev', '--no-audit', '--no-fund'], repositoryRoot);
  return {
    git: String(git.stdout || git.stderr || '').trim(),
    npm: String(npm.stdout || npm.stderr || '').trim()
  };
}
