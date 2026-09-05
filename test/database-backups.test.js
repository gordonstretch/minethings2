import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import {
  applyPendingDatabaseRestore, createDatabaseBackup, deleteDatabaseBackup,
  listDatabaseBackups, pendingDatabaseRestore, stageDatabaseRestore,
  verifyDatabaseBackup
} from '../src/database-backups.js';

function createMineThingsFixture(filename, marker) {
  const database = new DatabaseSync(filename);
  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE players (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE catalog_items (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE fixture_state (value TEXT NOT NULL);
  `);
  database.prepare('INSERT INTO players (name) VALUES (?)').run('Backup Admin');
  database.prepare('INSERT INTO catalog_items (name) VALUES (?)').run('Stone');
  database.prepare('INSERT INTO fixture_state (value) VALUES (?)').run(marker);
  return database;
}

test('creates, lists, deletes, and safely restores SQLite database backups', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-backups-'));
  const databaseFile = path.join(directory, 'live.sqlite');
  const backupDirectory = path.join(directory, 'backups');
  context.after(() => fs.rmSync(directory, { recursive: true, force: true }));

  let database = createMineThingsFixture(databaseFile, 'before');
  const first = await createDatabaseBackup({
    database,
    databaseFile,
    backupDirectory,
    reason: 'Test backup',
    createdBy: 'Backup Admin',
    createdAt: 1000
  });
  assert.equal(verifyDatabaseBackup(path.join(backupDirectory, first.fileName)), true);
  assert.deepEqual(listDatabaseBackups(backupDirectory).map((entry) => ({
    fileName: entry.fileName,
    reason: entry.reason,
    createdBy: entry.createdBy
  })), [{ fileName: first.fileName, reason: 'Test backup', createdBy: 'Backup Admin' }]);
  assert.throws(() => deleteDatabaseBackup(backupDirectory, '../live.sqlite'),
    /backup name is not valid/u);

  database.prepare('UPDATE fixture_state SET value = ?').run('after');
  stageDatabaseRestore({
    backupDirectory,
    fileName: first.fileName,
    requestedBy: 'Backup Admin',
    requestedAt: 2000
  });
  assert.equal(pendingDatabaseRestore(backupDirectory).fileName, first.fileName);
  assert.throws(() => deleteDatabaseBackup(backupDirectory, first.fileName),
    /awaiting restoration/u);
  database.close();

  const restored = await applyPendingDatabaseRestore({ databaseFile, backupDirectory });
  assert.equal(restored.applied, true);
  assert.equal(restored.fileName, first.fileName);
  assert.equal(pendingDatabaseRestore(backupDirectory), null);
  database = new DatabaseSync(databaseFile, { readOnly: true });
  assert.equal(database.prepare('SELECT value FROM fixture_state').get().value, 'before');
  database.close();

  const backups = listDatabaseBackups(backupDirectory);
  assert.equal(backups.length, 2, 'startup creates an additional backup of the replaced database');
  const automatic = backups.find((entry) => entry.fileName !== first.fileName);
  assert.match(automatic.reason, /Automatic safety backup before restoring/u);
  const automaticDatabase = new DatabaseSync(
    path.join(backupDirectory, automatic.fileName), { readOnly: true }
  );
  assert.equal(automaticDatabase.prepare('SELECT value FROM fixture_state').get().value, 'after');
  automaticDatabase.close();

  deleteDatabaseBackup(backupDirectory, first.fileName);
  assert.equal(listDatabaseBackups(backupDirectory).some((entry) =>
    entry.fileName === first.fileName), false);
});

