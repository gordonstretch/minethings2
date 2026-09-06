import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createPlayer } from '../src/game.js';
import {
  ADDITIONAL_STONE_CATALOG, ASO_DISCOVERY_STONE, CITY_COMPLETION_STONE,
  EXPANDED_STONE_CATALOG, HOME_DISPLAY_STONE, HOME_STONE, loadLegacyCatalog,
  STARTER_BOT_STONE
} from '../src/legacy-catalog.js';
import { SqliteStore } from '../src/store.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('adds 27 varied Stones for the expanded game systems', () => {
  const catalog = loadLegacyCatalog();
  assert.equal(EXPANDED_STONE_CATALOG.length, 27);
  assert.equal(catalog.stones.length, 81);
  assert.deepEqual(new Set(EXPANDED_STONE_CATALOG.map((stone) => stone.id)).size, 27);
  assert.deepEqual(new Set(EXPANDED_STONE_CATALOG.map((stone) => stone.rank)).size, 27);
  assert.deepEqual(new Set(EXPANDED_STONE_CATALOG.map((stone) => stone.behaviorKey)).size, 27);
  assert.deepEqual([...new Set(EXPANDED_STONE_CATALOG.map((stone) => stone.rarity))].sort(),
    [1, 2, 3, 4, 5, 6]);

  const storeSource = fs.readFileSync(path.join(ROOT, 'src', 'store.js'), 'utf8');
  for (const stone of EXPANDED_STONE_CATALOG) {
    if (stone.id === CITY_COMPLETION_STONE.id) {
      assert.match(storeSource, /#awardCityCompletionStone\(/u,
        'Completionist must have a per-city successful-action award hook');
      continue;
    }
    assert.match(storeSource,
      new RegExp(`awardStone\\([^\\n]+['"]${stone.behaviorKey}['"]`, 'u'),
      `${stone.name} must have a successful-action award hook`);
  }
});

test('adds 12 attainable Stones for ordinary play', () => {
  const catalog = loadLegacyCatalog();
  assert.equal(ADDITIONAL_STONE_CATALOG.length, 12);
  assert.equal(catalog.stones.length, 81);
  assert.equal(new Set(ADDITIONAL_STONE_CATALOG.map((stone) => stone.id)).size, 12);
  assert.equal(new Set(ADDITIONAL_STONE_CATALOG.map((stone) => stone.rank)).size, 12);
  assert.equal(new Set(ADDITIONAL_STONE_CATALOG.map((stone) => stone.behaviorKey)).size, 12);
  assert.deepEqual([...new Set(ADDITIONAL_STONE_CATALOG.map((stone) => stone.rarity))].sort(),
    [1, 2, 3, 4]);

  const storeSource = fs.readFileSync(path.join(ROOT, 'src', 'store.js'), 'utf8');
  for (const stone of ADDITIONAL_STONE_CATALOG) {
    assert.match(storeSource,
      new RegExp(`awardStone\\([^\\n]+['"]${stone.behaviorKey}['"]`, 'u'),
      `${stone.name} must have a successful-action award hook`);
  }
});

test('all additional Stones can be cleared once and retain their catalog rarity', (context) => {
  const catalog = loadLegacyCatalog();
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const player = store.addPlayer(
    createPlayer('Everyday Stone Keeper', '', 'hash', catalog, 1000, () => 0.5)
  );
  for (const [index, definition] of ADDITIONAL_STONE_CATALOG.entries()) {
    const awarded = store.awardStone(player.id, definition.behaviorKey, 2000 + index);
    assert.equal(awarded.id, definition.id);
    assert.equal(awarded.rarity, definition.rarity);
    assert.equal(store.awardStone(player.id, definition.behaviorKey, 3000 + index), null);
  }
  assert.equal(store.stonesForPlayer(player.id).earned.length, 12);
});

test('all expanded Stones can be cleared once and retain their catalog rarity', (context) => {
  const catalog = loadLegacyCatalog();
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const player = store.addPlayer(
    createPlayer('New Stone Keeper', '', 'hash', catalog, 1000, () => 0.5)
  );
  const ordinaryStones = EXPANDED_STONE_CATALOG.filter(
    (stone) => stone.id !== CITY_COMPLETION_STONE.id
  );
  for (const [index, definition] of ordinaryStones.entries()) {
    const awarded = store.awardStone(player.id, definition.behaviorKey, 2000 + index);
    assert.equal(awarded.id, definition.id);
    assert.equal(awarded.rarity, definition.rarity);
    assert.equal(store.awardStone(player.id, definition.behaviorKey, 3000 + index), null);
  }
  assert.equal(store.stonesForPlayer(player.id).earned.length, 26);
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
  assert.equal(store.database.prepare('SELECT COUNT(*) AS count FROM catalog_stones').get().count, 81);
  assert.deepEqual(store.stonesForPlayer(player.id).earned.map((stone) => stone.behaviorKey),
    ['Chatted']);
  const migration = store.database.prepare(`
    SELECT details_json FROM schema_migrations WHERE name = 'expanded-stones-v1'
  `).get();
  assert.deepEqual(JSON.parse(migration.details_json), { stones: 27, changes: 27 });
});

test('existing worlds gain additional Stones without losing original progress', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-additional-stones-'));
  const databaseFile = path.join(directory, 'game.sqlite');
  let store = new SqliteStore(databaseFile);
  context.after(() => {
    if (store) store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const catalog = loadLegacyCatalog();
  store.seedCatalog(catalog);
  const player = store.addPlayer(
    createPlayer('Returning Stone Keeper', '', 'hash', catalog, 1000, () => 0.5)
  );
  store.awardStone(player.id, 'Chatted', 2000);
  store.database.prepare('DELETE FROM catalog_stones WHERE id >= 70').run();
  store.database.prepare("DELETE FROM schema_migrations WHERE name = 'additional-stones-v1'").run();
  store.close();
  store = null;

  store = new SqliteStore(databaseFile);
  assert.equal(store.database.prepare('SELECT COUNT(*) AS count FROM catalog_stones').get().count, 81);
  assert.deepEqual(store.stonesForPlayer(player.id).earned.map((stone) => stone.behaviorKey),
    ['Chatted']);
  const migration = store.database.prepare(`
    SELECT details_json FROM schema_migrations WHERE name = 'additional-stones-v1'
  `).get();
  assert.deepEqual(JSON.parse(migration.details_json), {
    stones: 12,
    changes: 12,
    retroactiveAwards: { Scavenged: 0, Informed: 0, Sightseen: 0 }
  });
});

test('existing city exploration earns the three durable everyday Stones on upgrade', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-city-stones-'));
  const databaseFile = path.join(directory, 'game.sqlite');
  let store = new SqliteStore(databaseFile);
  context.after(() => {
    if (store) store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const catalog = loadLegacyCatalog();
  store.seedCatalog(catalog);
  const player = store.addPlayer(
    createPlayer('Experienced Explorer', '', 'hash', catalog, 1000, () => 0.5)
  );
  const insert = store.database.prepare(`
    INSERT INTO city_exploration_progress
      (player_id, city_id, progress_type, entry_key, completed_at)
    VALUES (?, ?, ?, ?, 2000)
  `);
  insert.run(player.id, player.cityId, 'scrap', 'old-scrap');
  insert.run(player.id, player.cityId, 'sign', 'old-sign');
  insert.run(player.id, player.cityId, 'location', 'old-location');
  store.database.prepare('DELETE FROM catalog_stones WHERE id >= 70').run();
  store.database.prepare("DELETE FROM schema_migrations WHERE name = 'additional-stones-v1'").run();
  store.close();
  store = null;

  store = new SqliteStore(databaseFile);
  const earned = new Set(store.stonesForPlayer(player.id).earned.map(
    (stone) => stone.behaviorKey
  ));
  assert.equal(earned.has('Scavenged'), true);
  assert.equal(earned.has('Informed'), true);
  assert.equal(earned.has('Sightseen'), true);
  const migration = store.database.prepare(`
    SELECT details_json FROM schema_migrations WHERE name = 'additional-stones-v1'
  `).get();
  assert.deepEqual(JSON.parse(migration.details_json).retroactiveAwards,
    { Scavenged: 1, Informed: 1, Sightseen: 1 });
});

test('existing complete city records gain one Completionist Stone per city on upgrade',
  (context) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-city-completion-'));
    const databaseFile = path.join(directory, 'game.sqlite');
    let store = new SqliteStore(databaseFile);
    context.after(() => {
      if (store) store.close();
      fs.rmSync(directory, { recursive: true, force: true });
    });
    const catalog = loadLegacyCatalog();
    store.seedCatalog(catalog);
    store.ensureWorldMaps(1000);
    const player = store.addPlayer(
      createPlayer('Old City Completionist', '', 'hash', catalog, 1000, () => 0.5)
    );
    const city = store.cityExploration(player.id);
    const insert = store.database.prepare(`
      INSERT INTO city_exploration_progress
        (player_id, city_id, progress_type, entry_key, completed_at)
      VALUES (?, ?, ?, ?, 2000)
    `);
    for (const sign of city.interior.signs) {
      insert.run(player.id, city.city.cityId, 'sign', sign.key);
    }
    for (const point of city.interior.points) {
      insert.run(player.id, city.city.cityId, 'location', point.key);
    }
    for (const scrap of city.interior.scraps) {
      insert.run(player.id, city.city.cityId, 'scrap', scrap.key);
    }
    store.database.prepare(`
      INSERT OR REPLACE INTO schema_migrations (name, applied_at, details_json)
      VALUES ('expanded-stones-v1', 2000, '{}')
    `).run();
    store.database.prepare('DELETE FROM catalog_stones WHERE id = ?')
      .run(CITY_COMPLETION_STONE.id);
    store.database.prepare("DELETE FROM schema_migrations WHERE name = 'city-completion-stone-v1'")
      .run();
    store.close();
    store = null;

    store = new SqliteStore(databaseFile);
    const completion = store.stonesForPlayer(player.id).earned.find(
      (stone) => stone.id === CITY_COMPLETION_STONE.id
    );
    assert.equal(completion?.earnedCount, 1);
    assert.equal(store.playerById(player.id).cityCompletionStoneCount, 1);
    assert.equal(store.recentMessages(player.id, 'all', 'Stone').filter((message) =>
      message.details.behaviorKey === CITY_COMPLETION_STONE.behaviorKey).length, 1);
    const migration = store.database.prepare(`
      SELECT details_json FROM schema_migrations WHERE name = 'city-completion-stone-v1'
    `).get();
    assert.deepEqual(JSON.parse(migration.details_json), {
      stoneId: CITY_COMPLETION_STONE.id,
      stoneInserted: 1,
      candidateCities: 1,
      retroactiveAwards: 1
    });
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

test('displaying a Thing at home clears the Displayed Stone once', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(loadLegacyCatalog());
  store.ensureWorldMaps(1000);
  const catalog = store.loadCatalog();
  const player = store.addPlayer(
    createPlayer('Home Curator', '', 'hash', catalog, 1000, () => 0.5)
  );
  const itemId = Number(Object.entries(player.inventory).find(([, quantity]) => quantity > 0)[0]);

  const displayed = store.setCityHomeDisplay(player.id, 1, itemId, 2000);
  assert.equal(displayed.stone?.id, HOME_DISPLAY_STONE.id);
  assert.equal(store.stonesForPlayer(player.id).earned.filter(
    (stone) => stone.id === HOME_DISPLAY_STONE.id
  ).length, 1);
  assert.equal(store.setCityHomeDisplay(player.id, 1, itemId, 3000).stone, null);
});

test('discovering the last unknown Aso city clears the Mapped Stone', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(loadLegacyCatalog());
  store.ensureWorldMaps(1000);
  const catalog = store.loadCatalog();
  const aso = catalog.maps.find((map) => map.slug === 'aso');
  const asoCityIds = catalog.cities.filter((city) => city.mapId === aso.id)
    .map((city) => city.id);
  const originId = Number(aso.capitalCityId);
  const vehicleType = catalog.vehicleByItemId.get(
    catalog.settings.starter_welcome_pack.vehicleItemId
  );
  const route = catalog.routes.find((candidate) => candidate.open
    && Number(candidate.type) === Number(vehicleType.routeType)
    && Number(candidate.city1Id) !== Number(candidate.city2Id)
    && [candidate.city1Id, candidate.city2Id].includes(originId)
    && asoCityIds.includes(candidate.city1Id) && asoCityIds.includes(candidate.city2Id));
  assert.ok(route);
  const destinationId = Number(route.city1Id) === originId
    ? Number(route.city2Id) : Number(route.city1Id);
  const draft = createPlayer('Aso Mapper', '', 'hash', catalog, 1000, () => 0.5);
  draft.knownCityIds = asoCityIds.filter((cityId) => Number(cityId) !== destinationId);
  draft.inventoryByCity[originId][vehicleType.itemId]
    = Number(draft.inventoryByCity[originId][vehicleType.itemId] ?? 0) + 1;
  draft.inventory = draft.inventoryByCity[originId];
  const player = store.addPlayer(draft);
  const vehicleId = store.activateVehicle(player.id, vehicleType.itemId);
  const trip = store.sendVehicle(player.id, vehicleId, route.id, 2000, {
    travelOrder: 'peaceful'
  });

  assert.equal(store.stonesForPlayer(player.id).earned.some(
    (stone) => stone.id === ASO_DISCOVERY_STONE.id
  ), false);
  store.settleVehicles(trip.arrivesAt);
  assert.equal(store.stonesForPlayer(player.id).earned.some(
    (stone) => stone.id === ASO_DISCOVERY_STONE.id
  ), true);
});

test('existing exhibitors and complete Aso explorers gain both new Stones on upgrade',
  (context) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-home-progress-stones-'));
    const databaseFile = path.join(directory, 'game.sqlite');
    let store = new SqliteStore(databaseFile);
    context.after(() => {
      if (store) store.close();
      fs.rmSync(directory, { recursive: true, force: true });
    });
    store.seedCatalog(loadLegacyCatalog());
    store.ensureWorldMaps(1000);
    const catalog = store.loadCatalog();
    const player = store.addPlayer(
      createPlayer('Old Aso Curator', '', 'hash', catalog, 1000, () => 0.5)
    );
    const itemId = Number(Object.entries(player.inventory).find(([, quantity]) => quantity > 0)[0]);
    store.database.prepare(`
      INSERT INTO player_home_displays
        (player_id, city_id, slot, item_id, protected, added_at)
      VALUES (?, ?, 1, ?, 0, 2000)
    `).run(player.id, player.cityId, itemId);
    store.database.prepare(`
      INSERT OR IGNORE INTO known_cities (player_id, city_id)
      SELECT ?, catalog_cities.id FROM catalog_cities
      JOIN world_maps ON world_maps.id = catalog_cities.map_id
      WHERE world_maps.slug = 'aso'
    `).run(player.id);
    store.database.prepare(`
      DELETE FROM catalog_stones WHERE id IN (?, ?)
    `).run(HOME_DISPLAY_STONE.id, ASO_DISCOVERY_STONE.id);
    store.database.prepare(`
      INSERT OR REPLACE INTO schema_migrations (name, applied_at, details_json)
      VALUES ('expanded-stones-v1', 2000, '{}')
    `).run();
    store.database.prepare(`
      DELETE FROM schema_migrations WHERE name = 'home-display-and-aso-map-stones-v1'
    `).run();
    store.close();
    store = null;

    store = new SqliteStore(databaseFile);
    assert.deepEqual(store.stonesForPlayer(player.id).earned.filter((stone) =>
      [HOME_DISPLAY_STONE.id, ASO_DISCOVERY_STONE.id].includes(stone.id)
    ).map((stone) => stone.id), [HOME_DISPLAY_STONE.id, ASO_DISCOVERY_STONE.id]);
    const migration = store.database.prepare(`
      SELECT details_json FROM schema_migrations
      WHERE name = 'home-display-and-aso-map-stones-v1'
    `).get();
    assert.deepEqual(JSON.parse(migration.details_json), {
      stoneIds: [HOME_DISPLAY_STONE.id, ASO_DISCOVERY_STONE.id],
      stoneInsertions: 2, retroactiveDisplayed: 1, retroactiveMapped: 1
    });
  });
