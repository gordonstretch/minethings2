import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_ROOT = path.join(ROOT, 'data');
const DEFAULT_DATABASE = path.join(DATA_ROOT, 'minethings.sqlite');

const PRESERVED_TABLES = new Set([
  'admin_audit_log',
  'credit_bundles',
  'credit_ledger',
  'credit_purchases',
  'email_verification_tokens',
  'external_auth_identities',
  'legacy_bank_settlements',
  'legal_acceptances',
  'mines',
  'payment_webhook_events',
  'players',
  'schema_migrations',
  'world_maps'
]);

const REQUIRED_PRESERVED_TABLES = new Set([
  'credit_bundles',
  'credit_ledger',
  'credit_purchases',
  'external_auth_identities',
  'legal_acceptances',
  'mines',
  'payment_webhook_events',
  'players',
  'schema_migrations',
  'world_maps'
]);

const REINITIALIZED_TABLES = new Set(['casino_global_stats', 'oil_hexes']);

function parseArguments(argv) {
  const apply = argv.includes('--apply');
  const restorePreserved = argv.includes('--restore-preserved');
  const databaseIndex = argv.indexOf('--database');
  const database = databaseIndex === -1 ? DEFAULT_DATABASE : argv[databaseIndex + 1];
  if (!database) throw new Error('--database requires a path.');
  const backupIndex = argv.indexOf('--backup');
  const backup = backupIndex === -1 ? null : argv[backupIndex + 1];
  if (backupIndex !== -1 && !backup) throw new Error('--backup requires a path.');
  if (restorePreserved && (!apply || !backup)) {
    throw new Error('--restore-preserved requires both --apply and --backup.');
  }
  return {
    apply,
    database: path.resolve(ROOT, database),
    backup: backup ? path.resolve(ROOT, backup) : null,
    restorePreserved
  };
}

function assertInsideDataRoot(filename) {
  const relative = path.relative(DATA_ROOT, filename);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`The reset database must be a file beneath ${DATA_ROOT}.`);
  }
}

function quoteIdentifier(identifier) {
  return `"${String(identifier).replaceAll('"', '""')}"`;
}

function tableNames(database) {
  return database.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
    ORDER BY name
  `).all().map((row) => row.name);
}

function countRows(database, table) {
  return Number(database.prepare(
    `SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)}`
  ).get().count);
}

function tableDigest(database, table, orderBy, columns = '*') {
  const rows = database.prepare(
    `SELECT ${columns} FROM ${quoteIdentifier(table)} ORDER BY ${orderBy}`
  ).all();
  return crypto.createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

function tableDigestExcluding(database, table, orderBy, excludedColumns) {
  const excluded = new Set(excludedColumns);
  const columns = database.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all()
    .map((column) => column.name)
    .filter((column) => !excluded.has(column))
    .map(quoteIdentifier)
    .join(', ');
  return tableDigest(database, table, orderBy, columns);
}

function catalogSetting(database, key) {
  const row = database.prepare('SELECT value_json FROM catalog_settings WHERE key = ?').get(key);
  if (!row) throw new Error(`Required catalog setting is missing: ${key}.`);
  return JSON.parse(row.value_json);
}

function classifiedTables(database) {
  const tables = tableNames(database);
  const preserved = tables.filter((table) =>
    table.startsWith('catalog_') || PRESERVED_TABLES.has(table));
  const reset = tables.filter((table) => !preserved.includes(table));
  const missing = [...REQUIRED_PRESERVED_TABLES].filter((table) => !tables.includes(table));
  if (missing.length) {
    throw new Error(`Required preserved tables are missing: ${missing.join(', ')}.`);
  }
  const resetSet = new Set(reset);
  const unsafeReferences = preserved.flatMap((table) =>
    database.prepare(`PRAGMA foreign_key_list(${quoteIdentifier(table)})`).all()
      .filter((foreignKey) => resetSet.has(foreignKey.table))
      .map((foreignKey) => `${table} -> ${foreignKey.table}`));
  if (unsafeReferences.length) {
    throw new Error(`Preserved tables depend on reset tables: ${unsafeReferences.join(', ')}.`);
  }
  return { tables, preserved, reset };
}

function countsFor(database, tables) {
  return Object.fromEntries(tables.map((table) => [table, countRows(database, table)]));
}

function timestampForFilename(date = new Date()) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/u, 'Z');
}

function rebuildMinimumCityKnowledge(database) {
  database.exec(`
    INSERT OR IGNORE INTO known_cities (player_id, city_id)
    SELECT id, city_id FROM players
    UNION
    SELECT id, home_city_id FROM players
    UNION
    SELECT player_id, city_id FROM mines;

    INSERT OR IGNORE INTO known_cities (player_id, city_id)
    SELECT player_maps.player_id, world_maps.capital_city_id
    FROM (
      SELECT players.id AS player_id, catalog_cities.map_id
      FROM players
      JOIN catalog_cities ON catalog_cities.id = players.city_id
      UNION
      SELECT players.id AS player_id, catalog_cities.map_id
      FROM players
      JOIN catalog_cities ON catalog_cities.id = players.home_city_id
      UNION
      SELECT mines.player_id, catalog_cities.map_id
      FROM mines
      JOIN catalog_cities ON catalog_cities.id = mines.city_id
    ) AS player_maps
    JOIN world_maps ON world_maps.id = player_maps.map_id
    WHERE world_maps.capital_city_id IS NOT NULL;
  `);
}

function printPlan(databaseFile, classification, counts, apply) {
  const sum = (tables) => tables.reduce((total, table) => total + counts[table], 0);
  console.log(`Database: ${databaseFile}`);
  console.log(`Mode: ${apply ? 'apply' : 'dry run'}`);
  console.log(`Preserve: ${classification.preserved.length} tables, ${sum(classification.preserved)} rows`);
  for (const table of classification.preserved) {
    console.log(`  KEEP  ${table}: ${counts[table]}`);
  }
  console.log(`Reset: ${classification.reset.length} tables, ${sum(classification.reset)} rows`);
  for (const table of classification.reset) {
    console.log(`  ${REINITIALIZED_TABLES.has(table) ? 'RESET' : 'CLEAR'} ${table}: ${counts[table]}`);
  }
}

function main() {
  const options = parseArguments(process.argv.slice(2));
  const resetAt = Date.now();
  assertInsideDataRoot(options.database);
  if (options.backup) assertInsideDataRoot(options.backup);
  if (!fs.existsSync(options.database) || !fs.statSync(options.database).isFile()) {
    throw new Error(`Database not found: ${options.database}`);
  }

  let database = new DatabaseSync(options.database);
  database.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 10000;');
  const classification = classifiedTables(database);
  const beforeCounts = countsFor(database, classification.tables);
  printPlan(options.database, classification, beforeCounts, options.apply);
  if (!options.apply) {
    database.close();
    console.log('No changes made. Pass --apply to perform this exact reset.');
    return;
  }

  const currentPreserved = {
    players: beforeCounts.players,
    mines: beforeCounts.mines,
    playersDigest: tableDigest(database, 'players', 'id'),
    minesDigest: tableDigest(database, 'mines', 'player_id, id')
  };
  const checkpoint = database.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get();
  if (Number(checkpoint.busy) !== 0) {
    database.close();
    throw new Error('The live database is still busy; stop every server process before applying.');
  }
  database.close();

  const backupDirectory = path.join(DATA_ROOT, 'backups');
  fs.mkdirSync(backupDirectory, { recursive: true });
  const backupFile = options.backup ?? path.join(
    backupDirectory,
    `minethings-before-player-state-reset-${timestampForFilename()}.sqlite`
  );
  if (options.backup) {
    if (!fs.existsSync(backupFile) || !fs.statSync(backupFile).isFile()) {
      throw new Error(`Existing backup not found: ${backupFile}`);
    }
  } else {
    fs.copyFileSync(options.database, backupFile, fs.constants.COPYFILE_EXCL);
  }
  const backupDatabase = new DatabaseSync(backupFile, { readOnly: true });
  const reportBeforeCounts = countsFor(backupDatabase, classification.tables);
  const backupIntegrity = backupDatabase.prepare('PRAGMA integrity_check').get().integrity_check;
  const backupPreserved = {
    players: countRows(backupDatabase, 'players'),
    mines: countRows(backupDatabase, 'mines'),
    playersDigest: tableDigest(backupDatabase, 'players', 'id'),
    minesDigest: tableDigest(backupDatabase, 'mines', 'player_id, id')
  };
  const backupStableDigests = {
    players: tableDigestExcluding(backupDatabase, 'players', 'id', ['gold_updated_at']),
    mines: tableDigestExcluding(backupDatabase, 'mines', 'player_id, id', ['next_find_at'])
  };
  const backupMatchesCurrent = backupPreserved.players === currentPreserved.players
    && backupPreserved.mines === currentPreserved.mines
    && backupPreserved.playersDigest === currentPreserved.playersDigest
    && backupPreserved.minesDigest === currentPreserved.minesDigest;
  backupDatabase.close();
  if (backupIntegrity !== 'ok' || (!options.restorePreserved && !backupMatchesCurrent)) {
    throw new Error('The pre-reset backup did not pass its integrity and preservation checks.');
  }
  const expectedPreserved = options.restorePreserved ? backupPreserved : currentPreserved;

  database = new DatabaseSync(options.database);
  database.exec('PRAGMA busy_timeout = 10000; PRAGMA foreign_keys = OFF;');
  if (options.restorePreserved) {
    database.prepare('ATTACH DATABASE ? AS reset_backup').run(backupFile);
  }
  database.exec('BEGIN IMMEDIATE;');
  try {
    const orderedResetTables = classification.reset
      .filter((table) => table !== 'live_update_events')
      .concat(classification.reset.includes('live_update_events') ? ['live_update_events'] : []);
    for (const table of orderedResetTables) {
      if (REINITIALIZED_TABLES.has(table)) continue;
      database.exec(`DELETE FROM ${quoteIdentifier(table)};`);
    }
    if (classification.reset.includes('oil_hexes')) {
      database.exec(`
        UPDATE oil_hexes
        SET build_tier = available, oil_units = 0, barrel_units = 0, barrels = 0;
      `);
    }
    if (classification.reset.includes('casino_global_stats')) {
      database.exec(`
        DELETE FROM casino_global_stats;
        INSERT INTO casino_global_stats (id, spin_count) VALUES (1, 0);
      `);
    }
    if (options.restorePreserved) {
      const accountTables = classification.preserved.filter((table) =>
        !table.startsWith('catalog_') && table !== 'players' && table !== 'mines');
      for (const table of accountTables) {
        database.exec(`DELETE FROM ${quoteIdentifier(table)};`);
      }
      database.exec('DELETE FROM mines; DELETE FROM players;');
      database.exec('INSERT INTO players SELECT * FROM reset_backup.players;');
      database.exec('INSERT INTO mines SELECT * FROM reset_backup.mines;');
      for (const table of accountTables) {
        database.exec(
          `INSERT INTO ${quoteIdentifier(table)} SELECT * FROM reset_backup.${quoteIdentifier(table)};`
        );
      }
    }
    const findIntervalMs = Number(catalogSetting(database, 'find_interval_ms'));
    if (!Number.isSafeInteger(findIntervalMs) || findIntervalMs <= 0) {
      throw new Error('find_interval_ms must be a positive whole number.');
    }
    database.prepare('UPDATE players SET gold_updated_at = ?').run(resetAt);
    database.prepare('UPDATE mines SET next_find_at = ?').run(resetAt + findIntervalMs);
    if (classification.reset.includes('known_cities')) rebuildMinimumCityKnowledge(database);
    if (classification.reset.includes('live_update_events')) {
      database.exec('DELETE FROM live_update_events;');
    }
    const deleteSequence = database.prepare('DELETE FROM sqlite_sequence WHERE name = ?');
    for (const table of classification.reset) {
      if (!REINITIALIZED_TABLES.has(table)) deleteSequence.run(table);
    }
    database.exec('COMMIT; PRAGMA foreign_keys = ON;');
  } catch (error) {
    try { database.exec('ROLLBACK;'); } catch {}
    database.close();
    throw error;
  }
  if (options.restorePreserved) database.exec('DETACH DATABASE reset_backup;');

  const after = {
    players: countRows(database, 'players'),
    mines: countRows(database, 'mines'),
    playersDigest: tableDigest(database, 'players', 'id'),
    minesDigest: tableDigest(database, 'mines', 'player_id, id')
  };
  const stableDigests = {
    players: tableDigestExcluding(database, 'players', 'id', ['gold_updated_at']),
    mines: tableDigestExcluding(database, 'mines', 'player_id, id', ['next_find_at'])
  };
  const schedulesReinitialized = countRows(database, 'players') === Number(
    database.prepare('SELECT COUNT(*) AS count FROM players WHERE gold_updated_at = ?').get(resetAt).count
  ) && countRows(database, 'mines') === Number(
    database.prepare('SELECT COUNT(*) AS count FROM mines WHERE next_find_at = ?')
      .get(resetAt + Number(catalogSetting(database, 'find_interval_ms'))).count
  );
  if (after.players !== expectedPreserved.players || after.mines !== expectedPreserved.mines
    || stableDigests.players !== backupStableDigests.players
    || stableDigests.mines !== backupStableDigests.mines || !schedulesReinitialized) {
    database.close();
    throw new Error('The reset changed preserved player or mine records; restore the backup.');
  }

  const foreignKeyFailures = database.prepare('PRAGMA foreign_key_check').all();
  const integrity = database.prepare('PRAGMA integrity_check').get().integrity_check;
  if (foreignKeyFailures.length || integrity !== 'ok') {
    database.close();
    throw new Error(`Database validation failed: ${foreignKeyFailures.length} foreign-key errors; integrity ${integrity}.`);
  }

  const expectedNonEmpty = new Set(['known_cities', ...REINITIALIZED_TABLES]);
  const unexpectedRows = classification.reset
    .map((table) => [table, countRows(database, table)])
    .filter(([table, count]) => count > 0 && !expectedNonEmpty.has(table));
  if (unexpectedRows.length) {
    database.close();
    throw new Error(`Reset tables still contain rows: ${JSON.stringify(unexpectedRows)}.`);
  }

  database.exec('VACUUM; PRAGMA wal_checkpoint(TRUNCATE);');
  const afterCounts = countsFor(database, classification.tables);
  const report = {
    completedAt: new Date().toISOString(),
    database: options.database,
    backup: backupFile,
    restoredPreservedFromBackup: options.restorePreserved,
    reinitialized: [...REINITIALIZED_TABLES],
    playerAndMineSchedulesReinitializedAt: resetAt,
    preserved: classification.preserved,
    reset: classification.reset,
    beforeCounts: reportBeforeCounts,
    afterCounts,
    players: after.players,
    mines: after.mines,
    derivedKnownCities: afterCounts.known_cities ?? 0,
    foreignKeyFailures: 0,
    integrity
  };
  const reportFile = path.join(
    backupDirectory,
    `player-state-reset-${timestampForFilename()}.json`
  );
  fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
  database.close();

  console.log(`Reset complete: ${after.players} players and ${after.mines} mines preserved; volatile schedules reinitialized.`);
  console.log(`Derived city access rows: ${report.derivedKnownCities}.`);
  console.log(`Backup: ${backupFile}`);
  console.log(`Report: ${reportFile}`);
  console.log('Integrity: ok; foreign keys: ok.');
}

try {
  main();
} catch (error) {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
}
