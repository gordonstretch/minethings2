import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createPlayer } from '../src/game.js';
import {
  EXPANDED_STONE_CATALOG, HOME_STONE, loadLegacyCatalog, STARTER_BOT_STONE
} from '../src/legacy-catalog.js';
import { SqliteStore } from '../src/store.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('adds 24 varied Stones for the expanded game systems', () => {
  const catalog = loadLegacyCatalog();
  assert.equal(EXPANDED_STONE_CATALOG.length, 24);
  assert.equal(catalog.stones.length, 66);
  assert.deepEqual(new Set(EXPANDED_STONE_CATALOG.map((stone) => stone.id)).size, 24);
  assert.deepEqual(new Set(EXPANDED_STONE_CATALOG.map((stone) => stone.rank)).size, 24);
  assert.deepEqual(new Set(EXPANDED_STONE_CATALOG.map((stone) => stone.behaviorKey)).size, 24);
  assert.deepEqual([...new Set(EXPANDED_STONE_CATALOG.map((stone) => stone.rarity))].sort(),
    [1, 2, 3, 4, 5, 6]);

  const storeSource = fs.readFileSync(path.join(ROOT, 'src', 'store.js'), 'utf8');
  for (const stone of EXPANDED_STONE_CATALOG) {
    assert.match(storeSource,
      new RegExp(`awardStone\\([^\\n]+['"]${stone.behaviorKey}['"]`, 'u'),
      `${stone.name} must have a successful-action award hook`);
  }
});

test('all expanded Stones can be cleared once and retain their catalog rarity', (context) => {
  const catalog = loadLegacyCatalog();
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const player = store.addPlayer(
    createPlayer('New Stone Keeper', '', 'hash', catalog, 1000, () => 0.5)
  );
  for (const [index, definition] of EXPANDED_STONE_CATALOG.entries()) {
    const awarded = store.awardStone(player.id, definition.behaviorKey, 2000 + index);
    assert.equal(awarded.id, definition.id);
    assert.equal(awarded.rarity, definition.rarity);
    assert.equal(store.awardStone(player.id, definition.behaviorKey, 3000 + index), null);
  }
  assert.equal(store.stonesForPlayer(player.id).earned.length, 24);
});

test('existing worlds gain expanded Stones without losing original progress', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-expanded-stones-'));
  const databaseFile = path.join(directory, 'game.sqlite');
  let store = new SqliteStore(databaseFile);
  context.after(() => {
    if (store) store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const catalog = loadLegacyCatalog();
  store.seedCatalog(catalog);
  const player = store.addPlayer(
    createPlayer('Old Stone Keeper', '', 'hash', catalog, 1000, () => 0.5)
  );
  store.awardStone(player.id, 'Chatted', 2000);
  store.database.prepare('DELETE FROM catalog_stones WHERE id >= 43').run();
  store.database.prepare("DELETE FROM schema_migrations WHERE name = 'expanded-stones-v1'").run();
  store.close();
  store = null;

  store = new SqliteStore(databaseFile);
  assert.equal(store.database.prepare('SELECT COUNT(*) AS count FROM catalog_stones').get().count, 66);
  assert.deepEqual(store.stonesForPlayer(player.id).earned.map((stone) => stone.behaviorKey),
    ['Chatted']);
  const migration = store.database.prepare(`
    SELECT details_json FROM schema_migrations WHERE name = 'expanded-stones-v1'
  `).get();
  assert.deepEqual(JSON.parse(migration.details_json), { stones: 24, changes: 24 });
});

test('existing completed starter bots gain the Assembled Stone on upgrade', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-starter-bot-stone-'));
  const databaseFile = path.join(directory, 'game.sqlite');
  let store = new SqliteStore(databaseFile);
  context.after(() => {
    if (store) store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const catalog = loadLegacyCatalog();
  store.seedCatalog(catalog);
  const player = store.addPlayer(
    createPlayer('Old Bot Builder', '', 'hash', catalog, 1000, () => 0.5)
  );
  const insertPart = store.database.prepare(`
    INSERT INTO player_bot_parts (player_id, part_id, purchased_at) VALUES (?, ?, ?)
  `);
  for (const part of catalog.botParts) insertPart.run(player.id, part.id, 2000);
  store.database.prepare(
    'DELETE FROM catalog_stones WHERE id = ?'
  ).run(STARTER_BOT_STONE.id);
  store.database.prepare(`
    INSERT OR REPLACE INTO schema_migrations (name, applied_at, details_json)
    VALUES ('expanded-stones-v1', 2000, '{}')
  `).run();
  store.database.prepare(
    "DELETE FROM schema_migrations WHERE name = 'starter-bot-stone-v1'"
  ).run();
  store.close();
  store = null;

  store = new SqliteStore(databaseFile);
  const assembled = store.stonesForPlayer(player.id).earned.find(
    (stone) => stone.behaviorKey === STARTER_BOT_STONE.behaviorKey
  );
  assert.equal(assembled?.id, STARTER_BOT_STONE.id);
  assert.equal(store.recentMessages(player.id, 'all', 'Stone').filter((message) =>
    message.details.behaviorKey === STARTER_BOT_STONE.behaviorKey).length, 1);
  const migration = store.database.prepare(`
    SELECT details_json FROM schema_migrations WHERE name = 'starter-bot-stone-v1'
  `).get();
  assert.deepEqual(JSON.parse(migration.details_json), {
    stoneId: STARTER_BOT_STONE.id,
    stoneInserted: 1,
    requiredParts: catalog.botParts.length,
    retroactiveAwards: 1
  });
});

test('existing players who reached home gain the Homed Stone on upgrade', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-home-stone-'));
  const databaseFile = path.join(directory, 'game.sqlite');
  let store = new SqliteStore(databaseFile);
  context.after(() => {
    if (store) store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const catalog = loadLegacyCatalog();
  store.seedCatalog(catalog);
  const player = store.addPlayer(
    createPlayer('Old Home Finder', '', 'hash', catalog, 1000, () => 0.5)
  );
  store.database.prepare(`
    INSERT INTO city_exploration_progress
      (player_id, city_id, progress_type, entry_key, completed_at)
    VALUES (?, ?, 'location', 'player-home', 2000)
  `).run(player.id, player.cityId);
  store.database.prepare('DELETE FROM catalog_stones WHERE id = ?').run(HOME_STONE.id);
  store.database.prepare(`
    INSERT OR REPLACE INTO schema_migrations (name, applied_at, details_json)
    VALUES ('expanded-stones-v1', 2000, '{}')
  `).run();
  store.database.prepare("DELETE FROM schema_migrations WHERE name = 'home-stone-v1'").run();
  store.close();
  store = null;

  store = new SqliteStore(databaseFile);
  const homed = store.stonesForPlayer(player.id).earned.find(
    (stone) => stone.behaviorKey === HOME_STONE.behaviorKey
  );
  assert.equal(homed?.id, HOME_STONE.id);
  assert.equal(store.recentMessages(player.id, 'all', 'Stone').filter((message) =>
    message.details.behaviorKey === HOME_STONE.behaviorKey).length, 1);
  const migration = store.database.prepare(`
    SELECT details_json FROM schema_migrations WHERE name = 'home-stone-v1'
  `).get();
  assert.deepEqual(JSON.parse(migration.details_json), {
    stoneId: HOME_STONE.id, stoneInserted: 1, retroactiveAwards: 1
  });
});
