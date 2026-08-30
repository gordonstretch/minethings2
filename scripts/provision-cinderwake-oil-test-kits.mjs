import path from 'node:path';
import { SqliteStore } from '../src/store.js';

const databaseFile = path.resolve(process.argv[2] ?? 'data/minethings.sqlite');
const store = new SqliteStore(databaseFile, { legacyJsonFile: null });

try {
  store.ensureWorldMaps();
  const applied = store.provisionCinderwakeOilFieldTestKits();
  const migration = store.database.prepare(`
    SELECT applied_at, details_json FROM schema_migrations
    WHERE name = 'cinderwake-oil-field-test-kits-v1'
  `).get();
  console.log(JSON.stringify({
    databaseFile,
    applied,
    details: migration ? JSON.parse(migration.details_json) : null
  }, null, 2));
} finally {
  store.close();
}
