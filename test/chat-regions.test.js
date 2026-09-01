import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createPlayer } from '../src/game.js';
import { loadLegacyCatalog } from '../src/legacy-catalog.js';
import { SqliteStore } from '../src/store.js';

const legacyCatalog = loadLegacyCatalog();

function seededStore(filename = ':memory:') {
  const store = new SqliteStore(filename);
  store.seedCatalog(legacyCatalog);
  store.ensureWorldMaps(1000);
  return store;
}

function addMiner(store, name, now = 1000) {
  return store.addPlayer(createPlayer(
    name, '', 'hash', store.loadCatalog(), now, () => 0.5
  ));
}

test('chat keeps immutable sender regions and reveals only known-region traffic', (context) => {
  const store = seededStore();
  context.after(() => store.close());
  const viewer = addMiner(store, 'Regional Viewer');
  const speaker = addMiner(store, 'Regional Speaker');
  const localCity = store.database.prepare(`
    SELECT catalog_cities.id, catalog_cities.map_id, world_maps.name AS map_name
    FROM catalog_cities JOIN world_maps ON world_maps.id = catalog_cities.map_id
    WHERE catalog_cities.id = ?
  `).get(viewer.cityId);
  const remoteCity = store.database.prepare(`
    SELECT catalog_cities.id, catalog_cities.map_id, world_maps.name AS map_name
    FROM catalog_cities JOIN world_maps ON world_maps.id = catalog_cities.map_id
    WHERE catalog_cities.map_id <> ? ORDER BY world_maps.sort_order, catalog_cities.id LIMIT 1
  `).get(localCity.map_id);
  assert.ok(remoteCity);

  store.database.exec('DELETE FROM world_chat_announcements; DELETE FROM chats;');
  store.database.prepare(
    'INSERT OR IGNORE INTO known_cities (player_id, city_id) VALUES (?, ?)'
  ).run(speaker.id, remoteCity.id);
  store.database.prepare('UPDATE players SET city_id = ? WHERE id = ?')
    .run(remoteCity.id, speaker.id);
  const remotePost = store.addChat(speaker.id, 'Remote regional signal', 2000);
  assert.equal(remotePost.mapId, remoteCity.map_id);
  assert.equal(remotePost.mapName, remoteCity.map_name);

  store.database.prepare('UPDATE players SET city_id = ? WHERE id = ?')
    .run(localCity.id, speaker.id);
  store.addChat(speaker.id, 'Local regional signal', 1004);
  store.database.prepare(`
    INSERT INTO chats (player_id, body, color, map_id, created_at)
    VALUES (?, 'Legacy global signal', '55666b', NULL, 1002)
  `).run(speaker.id);
  const legacyAnnouncement = store.database.prepare(`
    INSERT INTO world_chat_announcements
      (event_key, body, path, announcement_type, map_id, created_at)
    VALUES ('legacy-global-region-chat', 'Legacy global event', '/events', 'world', ?, 1003)
  `).run(remoteCity.map_id);
  assert.ok(legacyAnnouncement.changes);
  const remoteAnnouncement = store.database.prepare(`
    INSERT INTO world_chat_announcements
      (event_key, body, path, announcement_type, created_at)
    VALUES ('remote-region-chat', 'Remote regional event', '/events', 'world', 2001)
  `).run();
  store.database.prepare(`
    INSERT INTO world_chat_announcement_regions (announcement_id, map_id) VALUES (?, ?)
  `).run(Number(remoteAnnouncement.lastInsertRowid), remoteCity.map_id);

  const visibleBeforeDiscovery = store.recentChats(null, viewer.id, 0);
  assert.deepEqual(visibleBeforeDiscovery.map((entry) => entry.body), [
    'Legacy global signal', 'Legacy global event', 'Local regional signal'
  ]);
  assert.deepEqual(visibleBeforeDiscovery.map((entry) => entry.mapIds), [
    [], [], [localCity.map_id]
  ]);
  assert.deepEqual(store.recentChats(2, viewer.id, 0).map((entry) => entry.body), [
    'Legacy global event', 'Local regional signal'
  ], 'hidden recent traffic does not consume the visible result limit');
  assert.deepEqual(store.recentChats(null, null, 0).map((entry) => entry.body), [
    'Legacy global signal', 'Legacy global event', 'Local regional signal',
    'Remote regional signal', 'Remote regional event'
  ], 'a null viewer retains the unfiltered internal view');
  assert.equal(store.database.prepare('SELECT map_id FROM chats WHERE id = ?')
    .get(remotePost.id).map_id, remoteCity.map_id,
  'moving later does not reclassify an existing post');

  store.database.prepare(
    'INSERT OR IGNORE INTO known_cities (player_id, city_id) VALUES (?, ?)'
  ).run(viewer.id, remoteCity.id);
  assert.deepEqual(store.recentChats(null, viewer.id, 0).map((entry) => entry.body), [
    'Legacy global signal', 'Legacy global event', 'Local regional signal',
    'Remote regional signal', 'Remote regional event'
  ]);
  const visibleAfterDiscovery = store.recentChats(null, viewer.id, 0);
  assert.deepEqual(visibleAfterDiscovery.slice(-2).map((entry) => entry.mapIds), [
    [remoteCity.map_id], [remoteCity.map_id]
  ]);
});

test('rare findings stay out of chat while weather announcements carry region mappings', (context) => {
  const store = seededStore();
  context.after(() => store.close());
  const miner = addMiner(store, 'Regional Herald');
  const administrator = addMiner(store, 'Regional Administrator');
  store.database.prepare('UPDATE players SET authority = 5 WHERE id = ?').run(administrator.id);
  const city = store.database.prepare(
    'SELECT id, map_id FROM catalog_cities WHERE id = ?'
  ).get(miner.cityId);
  const rareItems = store.database.prepare(`
    SELECT catalog_items.id, catalog_items.rarity
    FROM catalog_items
    WHERE catalog_items.rarity IN (5, 6) AND catalog_items.can_find = 1
      AND NOT EXISTS (
        SELECT 1 FROM catalog_dwarf_tiers
        WHERE catalog_dwarf_tiers.item_id = catalog_items.id
      )
    ORDER BY catalog_items.rarity, catalog_items.id
  `).all();
  const fabled = rareItems.find((item) => item.rarity === 5);
  const legendary = rareItems.find((item) => item.rarity === 6);
  assert.ok(fabled && legendary);
  store.database.exec('DELETE FROM world_chat_announcements;');

  store.savePlayer(store.playerById(miner.id, 2000, { settle: false }), {
    source: 'mine', recordedAt: 2000,
    findings: [{ itemId: fabled.id, quantity: 1, cityId: city.id, foundAt: 2000 }]
  });

  const otherMap = store.database.prepare(`
    SELECT id FROM world_maps WHERE id <> ? ORDER BY sort_order, id LIMIT 1
  `).get(city.map_id);
  assert.ok(otherMap);
  store.savePlayer(store.playerById(miner.id, 2100, { settle: false }), {
    source: 'salvage', recordedAt: 2100,
    findings: [{
      itemId: legendary.id, quantity: 1, cityId: null,
      mapIds: [city.map_id, otherMap.id], foundAt: 2100,
      status: 'Loaded into ship cargo'
    }]
  });
  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count FROM world_chat_announcements
    WHERE announcement_type IN ('rare-purple', 'rare-orange')
      OR event_key LIKE 'rare-finding:%'
  `).get().count, 0);
  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count
    FROM world_chat_announcement_regions
    JOIN world_chat_announcements
      ON world_chat_announcements.id = world_chat_announcement_regions.announcement_id
    WHERE world_chat_announcements.event_key LIKE 'rare-finding:%'
  `).get().count, 0);

  const fabledDwarf = store.database.prepare(`
    SELECT catalog_items.id, catalog_items.name
    FROM catalog_items
    JOIN catalog_dwarf_tiers ON catalog_dwarf_tiers.item_id = catalog_items.id
    WHERE catalog_items.rarity = 5
  `).get();
  assert.ok(fabledDwarf);
  store.database.prepare(`
    INSERT INTO world_chat_announcements
      (event_key, body, path, announcement_type, created_at)
    VALUES ('legacy-fabled-dwarf', ?, ?, 'dwarf-capture', 2200)
  `).run(`Regional Herald captured a ${fabledDwarf.name}.`, `/items/${fabledDwarf.id}`);
  assert.equal(store.recentChats(null, miner.id, 0)
    .some((entry) => entry.body.includes(fabledDwarf.name)), false,
  'legacy Fabled capture announcements stay hidden');

  store.adminSetWeather(administrator.id, city.map_id, {
    condition: 'storm', temperatureC: 9, windKph: 80, rainfallMm: 45
  }, 3000);
  const weatherRegion = store.database.prepare(`
    SELECT world_chat_announcement_regions.map_id
    FROM world_chat_announcements
    JOIN world_chat_announcement_regions
      ON world_chat_announcement_regions.announcement_id = world_chat_announcements.id
    WHERE world_chat_announcements.event_key LIKE 'world-weather:%'
    ORDER BY world_chat_announcements.id DESC LIMIT 1
  `).get();
  assert.equal(weatherRegion?.map_id, city.map_id);
});

test('v96 migration preserves legacy chat rows without assigning regions', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-chat-v95-'));
  const databaseFile = path.join(directory, 'game.sqlite');
  let store = seededStore(databaseFile);
  context.after(() => {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const miner = addMiner(store, 'Legacy Chat Miner');
  const mapId = store.database.prepare(
    'SELECT map_id FROM catalog_cities WHERE id = ?'
  ).get(miner.cityId).map_id;
  store.database.exec('DELETE FROM world_chat_announcements; DELETE FROM chats;');
  store.database.prepare(`
    INSERT INTO chats (player_id, body, color, map_id, created_at)
    VALUES (?, 'Unscoped v95 chat', '55666b', NULL, 1000)
  `).run(miner.id);
  store.database.prepare(`
    INSERT INTO world_chat_announcements
      (event_key, body, path, announcement_type, map_id, created_at)
    VALUES ('unscoped-v95-event', 'Unscoped v95 event', '/events', 'world', ?, 1001)
  `).run(mapId);
  store.database.exec(`
    DROP TABLE world_chat_announcement_regions;
    PRAGMA user_version = 95;
  `);
  store.close();

  store = new SqliteStore(databaseFile);
  assert.equal(store.database.prepare('PRAGMA user_version').get().user_version, 126);
  assert.deepEqual({ ...store.database.prepare(
    "SELECT body, map_id FROM chats WHERE body = 'Unscoped v95 chat'"
  ).get() }, { body: 'Unscoped v95 chat', map_id: null });
  assert.deepEqual({ ...store.database.prepare(`
    SELECT body, map_id FROM world_chat_announcements WHERE event_key = 'unscoped-v95-event'
  `).get() }, { body: 'Unscoped v95 event', map_id: mapId });
  assert.equal(store.database.prepare(
    'SELECT COUNT(*) AS count FROM world_chat_announcement_regions'
  ).get().count, 0, 'migration does not infer or backfill old announcement regions');
  assert.deepEqual(store.recentChats(null, miner.id, 0).map((entry) => entry.body), [
    'Unscoped v95 chat', 'Unscoped v95 event'
  ]);
});
