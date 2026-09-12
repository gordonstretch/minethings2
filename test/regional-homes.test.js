import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createPlayer } from '../src/game.js';
import { loadLegacyCatalog, SAFE_TRAVEL_KIT_CATALOG } from '../src/legacy-catalog.js';
import { SqliteStore } from '../src/store.js';

function regionalFixture(context, name) {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(loadLegacyCatalog());
  store.ensureWorldMaps(1000);
  const catalog = store.loadCatalog();
  const player = store.addPlayer(createPlayer(name, '', 'hash', catalog, 1000, () => 0.5));
  const map = (slug) => catalog.maps.find((candidate) => candidate.slug === slug);
  const cities = (slug) => catalog.cities.filter((city) => city.mapId === map(slug).id);
  return { store, catalog, player, map, cities };
}

function revealCity(store, playerId, cityId) {
  store.database.prepare(
    'INSERT OR IGNORE INTO known_cities (player_id, city_id) VALUES (?, ?)'
  ).run(playerId, cityId);
}

function addInventory(store, playerId, cityId, itemId, quantity) {
  store.database.prepare(`
    INSERT INTO inventory (player_id, city_id, item_id, quantity)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (player_id, city_id, item_id) DO UPDATE SET
      quantity = quantity + excluded.quantity
  `).run(playerId, cityId, itemId, quantity);
}

function isolateMeld(store, catalog, playerId) {
  const meld = catalog.melds.find((candidate) =>
    candidate.public && candidate.requirements.length >= 2);
  assert.ok(meld, 'the catalog needs a public meld with at least two requirements');
  const own = store.database.prepare(
    'INSERT INTO player_melds (player_id, meld_id, created_at) VALUES (?, ?, 1)'
  );
  for (const candidate of catalog.melds) {
    if (candidate.public && candidate.id !== meld.id) own.run(playerId, candidate.id);
  }
  return meld;
}

function capitalFor(catalog, slug) {
  const map = catalog.maps.find((candidate) => candidate.slug === slug);
  assert.ok(map, `the ${slug} region should exist`);
  const city = catalog.cities.find((candidate) => candidate.id === map.capitalCityId);
  assert.equal(city?.mapId, map.id, `${slug}'s capital should belong to the region`);
  return city;
}

test('derives the same fixed capital for every miner in each discovered region', (context) => {
  const { store, player, map, cities } = regionalFixture(
    context, 'Regional Capital Keeper'
  );
  const bromo = map('bromo');
  const bromoCapital = capitalFor(store.loadCatalog(), 'bromo');
  const bromoOutpost = cities('bromo').find((city) => city.id !== bromoCapital.id);
  assert.ok(bromoOutpost);
  revealCity(store, player.id, bromoCapital.id);
  revealCity(store, player.id, bromoOutpost.id);
  store.changeCity(player.id, bromoOutpost.id, 1200);

  const restored = store.playerById(player.id, 1300, { settle: false });
  assert.deepEqual(Object.fromEntries(store.loadCatalog().maps.map((region) => [
    region.slug, region.capitalCityId
  ])), {
    aso: 6,
    bromo: 7,
    calbuco: 8,
    dempo: 9,
    ebeko: 10,
    fogo: 11,
    gallego: 1
  });
  assert.equal(restored.regionHomes[bromo.id], bromoCapital.id);
  assert.equal(restored.currentRegionHomeCityId, bromoCapital.id);
  assert.equal(Object.keys(restored.regionHomes).length, 2);
});

test('ignores historical regional-home rows and rejects attempts to move a capital', (context) => {
  const { store, catalog, player, map, cities } = regionalFixture(
    context, 'Immutable Regional Capital'
  );
  const aso = map('aso');
  const capital = capitalFor(catalog, 'aso');
  const forgedHome = cities('aso').find((city) => city.id !== capital.id);
  assert.ok(forgedHome);
  store.database.prepare(`
    INSERT INTO player_region_homes (player_id, map_id, city_id, chosen_at)
    VALUES (?, ?, ?, 800)
    ON CONFLICT (player_id, map_id) DO UPDATE SET city_id = excluded.city_id
  `).run(player.id, aso.id, forgedHome.id);
  const rowBefore = { ...store.database.prepare(`
    SELECT map_id, city_id, chosen_at FROM player_region_homes
    WHERE player_id = ? AND map_id = ?
  `).get(player.id, aso.id) };

  const restored = store.playerById(player.id, 1200, { settle: false });
  assert.equal(restored.regionHomes[aso.id], capital.id);
  assert.deepEqual(restored.regionHomeCityIds, [capital.id]);
  assert.equal(restored.currentRegionHomeCityId, capital.id);
  assert.throws(
    () => store.moveHomeCity(player.id, capital.id, 1300),
    /Regional capitals are fixed/
  );
  assert.deepEqual({ ...store.database.prepare(`
    SELECT map_id, city_id, chosen_at FROM player_region_homes
    WHERE player_id = ? AND map_id = ?
  `).get(player.id, aso.id) }, rowBefore,
  'reading or trying to move a capital must not rewrite historical player state');
});

test('stages and creates melds only while standing in the fixed regional capital', (context) => {
  const { store, catalog, player, cities } = regionalFixture(
    context, 'Regional Meld Maker'
  );
  const home = capitalFor(catalog, 'bromo');
  const away = cities('bromo').find((city) => city.id !== home.id);
  assert.ok(away);
  revealCity(store, player.id, home.id);
  revealCity(store, player.id, away.id);
  const meld = isolateMeld(store, catalog, player.id);
  for (const requirement of meld.requirements) {
    addInventory(store, player.id, home.id, requirement.itemId, requirement.count);
    addInventory(store, player.id, away.id, requirement.itemId, requirement.count + 2);
  }
  const stagedRequirement = meld.requirements[0];

  store.changeCity(player.id, away.id, 1400);
  assert.throws(
    () => store.stageMeldItem(player.id, stagedRequirement.itemId, 1401),
    /region.*capital/i
  );
  assert.throws(
    () => store.createMeld(player.id, meld.id, 1402),
    /region.*capital/i
  );

  store.changeCity(player.id, home.id, 1500);
  const staged = store.stageMeldItem(player.id, stagedRequirement.itemId, 1501);
  assert.equal(staged.deposited, true);
  assert.equal(store.database.prepare(`
    SELECT quantity FROM inventory WHERE player_id = ? AND city_id = ? AND item_id = ?
  `).get(player.id, home.id, stagedRequirement.itemId)?.quantity ?? 0,
  stagedRequirement.count - 1);
  assert.equal(store.database.prepare(`
    SELECT quantity FROM meld_stash WHERE player_id = ? AND item_id = ?
  `).get(player.id, stagedRequirement.itemId).quantity, 1);

  store.changeCity(player.id, away.id, 1600);
  assert.throws(
    () => store.createMeld(player.id, meld.id, 1601),
    /region.*capital/i
  );
  store.changeCity(player.id, home.id, 1700);
  assert.equal(store.createMeld(player.id, meld.id, 1701).id, meld.id);

  const restored = store.playerById(player.id, 1701, { settle: false });
  assert.ok(restored.meldIds.includes(meld.id));
  for (const requirement of meld.requirements) {
    assert.equal(restored.inventoryByCity[home.id]?.[requirement.itemId] ?? 0, 0);
    assert.equal(restored.inventoryByCity[away.id][requirement.itemId], requirement.count + 2);
  }
});

test('uses the global Meld stash with loose inventory from the active regional capital', (context) => {
  const { store, catalog, player, cities } = regionalFixture(
    context, 'Legacy Stash Regional Melder'
  );
  const bromoHome = capitalFor(catalog, 'bromo');
  const bromoAway = cities('bromo').find((city) => city.id !== bromoHome.id);
  assert.ok(bromoAway);
  revealCity(store, player.id, bromoHome.id);
  revealCity(store, player.id, bromoAway.id);
  const meld = isolateMeld(store, catalog, player.id);
  const [storedRequirement, ...localRequirements] = meld.requirements;
  const legacyHomeCityId = store.database.prepare(
    'SELECT home_city_id FROM players WHERE id = ?'
  ).get(player.id).home_city_id;

  assert.equal(new Set(store.database.prepare('PRAGMA table_info(meld_stash)')
    .all().map((column) => column.name)).has('city_id'), false);
  store.database.prepare(`
    INSERT INTO meld_stash (player_id, item_id, quantity, stored_at)
    VALUES (?, ?, ?, 900)
  `).run(player.id, storedRequirement.itemId, storedRequirement.count);
  for (const requirement of meld.requirements) {
    addInventory(store, player.id, legacyHomeCityId,
      requirement.itemId, requirement.count + 3);
    addInventory(store, player.id, bromoAway.id,
      requirement.itemId, requirement.count + 5);
  }
  for (const requirement of localRequirements) {
    addInventory(store, player.id, bromoHome.id, requirement.itemId, requirement.count);
  }
  const legacyBefore = structuredClone(
    store.playerById(player.id, 1400, { settle: false }).inventoryByCity[legacyHomeCityId]
  );
  const awayBefore = structuredClone(
    store.playerById(player.id, 1400, { settle: false }).inventoryByCity[bromoAway.id]
  );

  store.changeCity(player.id, bromoHome.id, 1450);
  assert.equal(store.createMeld(player.id, meld.id, 1500).id, meld.id);
  const restored = store.playerById(player.id, 1500, { settle: false });
  assert.equal(restored.meldStash[storedRequirement.itemId] ?? 0, 0);
  for (const requirement of localRequirements) {
    assert.equal(restored.inventoryByCity[bromoHome.id]?.[requirement.itemId] ?? 0, 0);
  }
  assert.deepEqual(restored.inventoryByCity[legacyHomeCityId], legacyBefore,
  'legacy-home inventory must not be remotely consumed');
  assert.deepEqual(restored.inventoryByCity[bromoAway.id], awayBefore,
  'non-home inventory in the active region must not be consumed');
});

test('builds and operates factories from every discovered regional capital', (context) => {
  const { store, catalog, player, cities } = regionalFixture(
    context, 'Regional Factory Owner'
  );
  const asoHome = capitalFor(catalog, 'aso');
  const bromoHome = capitalFor(catalog, 'bromo');
  const bromoOutpost = cities('bromo').find((city) => city.id !== bromoHome.id);
  const build = catalog.factoryActions.find((action) => action.actionKind === 'build');
  const production = catalog.factoryActions.find((action) =>
    action.actionKind === 'item' && action.ore > 0);
  assert.ok(bromoOutpost && build && production);
  revealCity(store, player.id, bromoHome.id);
  revealCity(store, player.id, bromoOutpost.id);
  addInventory(store, player.id, bromoHome.id, catalog.settings.ore_item_id,
    build.ore + production.ore);

  store.changeCity(player.id, bromoHome.id, 1200);
  assert.notEqual(store.playerById(player.id, 1200, { settle: false }).homeCityId,
    bromoHome.id, 'the historical single-home field remains non-authoritative');
  const bromoFactory = store.buildFactory(player.id, 1201);
  assert.equal(bromoFactory.cityId, bromoHome.id);
  store.database.prepare(`
    UPDATE factories SET built = 1, factory_action_id = NULL WHERE id = ?
  `).run(bromoFactory.id);
  assert.equal(store.startFactoryAction(
    player.id, bromoFactory.id, production.id, null, 1202
  ).actionId, production.id);

  store.changeCity(player.id, bromoOutpost.id, 1300);
  addInventory(store, player.id, bromoOutpost.id, catalog.settings.ore_item_id, build.ore);
  assert.throws(() => store.buildFactory(player.id, 1301), /regional capital/i);

  store.changeCity(player.id, asoHome.id, 1400);
  addInventory(store, player.id, asoHome.id, catalog.settings.ore_item_id, build.ore);
  assert.equal(store.buildFactory(player.id, 1401).cityId, asoHome.id);
});

test('makes workers available in each regional capital they have discovered', (context) => {
  const { store, catalog, player: employer } = regionalFixture(
    context, 'Regional Factory Employer'
  );
  const worker = store.addPlayer(createPlayer(
    'Regional Factory Worker', '', 'hash', catalog, 1000, () => 0.5
  ));
  const bromoHome = capitalFor(catalog, 'bromo');
  revealCity(store, employer.id, bromoHome.id);
  revealCity(store, worker.id, bromoHome.id);
  store.changeCity(employer.id, bromoHome.id, 1100);
  const ownMeld = store.database.prepare(
    'INSERT INTO player_melds (player_id, meld_id, created_at) VALUES (?, ?, 1000)'
  );
  for (const meld of catalog.melds.slice(0, 10)) ownMeld.run(worker.id, meld.id);

  assert.ok(store.availableWorkers(bromoHome.id, 1200)
    .some((candidate) => candidate.id === worker.id));
  store.hireWorker(employer.id, worker.id, 1201);
  const factoryId = Number(store.database.prepare(`
    INSERT INTO factories
      (owner_id, operator_id, city_id, built, factory_action_id, item_id,
       components_done, last_event_at, completion_at, created_at)
    VALUES (?, ?, ?, 1, NULL, NULL, 0, 1201, NULL, 1201)
  `).run(employer.id, employer.id, bromoHome.id).lastInsertRowid);
  store.assignFactoryWorker(employer.id, factoryId, worker.id, 1202);
  const employee = store.employees(employer.id, 1202)[0];
  assert.ok(employee.homeCityIds.includes(capitalFor(catalog, 'aso').id));
  assert.ok(employee.homeCityIds.includes(bromoHome.id));
  assert.equal(employee.factoryId, factoryId);
});

test('v94 migration adds fixed capitals without rewriting legacy miner data', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-regional-v94-'));
  const databaseFile = path.join(directory, 'game.sqlite');
  let store = new SqliteStore(databaseFile);
  context.after(() => {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  store.seedCatalog(loadLegacyCatalog());
  store.ensureWorldMaps(1000);
  const catalog = store.loadCatalog();
  const player = store.addPlayer(createPlayer(
    'Untouched Legacy Miner', '', 'hash', catalog, 1000, () => 0.5
  ));
  const remoteCity = catalog.cities.find((city) => city.mapId !== 1);
  const stashItem = catalog.melds.find((meld) => meld.public)?.requirements[0].itemId;
  assert.ok(remoteCity && stashItem);
  revealCity(store, player.id, remoteCity.id);
  store.database.prepare(`
    INSERT INTO meld_stash (player_id, item_id, quantity, stored_at)
    VALUES (?, ?, 3, 1400)
  `).run(player.id, stashItem);

  store.database.exec(`
    DELETE FROM player_region_homes;
    DROP INDEX IF EXISTS chats_map_recent;
    DROP INDEX IF EXISTS world_chat_announcements_map_recent;
    DROP TABLE world_chat_announcement_regions;
    DROP TABLE player_region_homes;
    ALTER TABLE chats DROP COLUMN map_id;
    ALTER TABLE world_chat_announcements DROP COLUMN map_id;
    PRAGMA user_version = 94;
  `);
  const playerBefore = { ...store.database.prepare(
    'SELECT * FROM players WHERE id = ?'
  ).get(player.id) };
  const knownBefore = store.database.prepare(
    'SELECT city_id FROM known_cities WHERE player_id = ? ORDER BY city_id'
  ).all(player.id).map((entry) => entry.city_id);
  const inventoryBefore = store.database.prepare(`
    SELECT city_id, item_id, quantity FROM inventory
    WHERE player_id = ? ORDER BY city_id, item_id
  `).all(player.id).map((entry) => ({ ...entry }));
  const stashBefore = store.database.prepare(`
    SELECT item_id, quantity, stored_at FROM meld_stash
    WHERE player_id = ? ORDER BY item_id
  `).all(player.id).map((entry) => ({ ...entry }));
  store.close();

  store = new SqliteStore(databaseFile);
  assert.equal(store.database.prepare('PRAGMA user_version').get().user_version, 142);
  store.ensureWorldMaps(2000);
  const migratedCatalog = store.loadCatalog();
  assert.deepEqual({ ...store.database.prepare(
    'SELECT * FROM players WHERE id = ?'
  ).get(player.id) }, playerBefore);
  assert.deepEqual(store.database.prepare(
    'SELECT city_id FROM known_cities WHERE player_id = ? ORDER BY city_id'
  ).all(player.id).map((entry) => entry.city_id), knownBefore);
  const inventoryAfter = store.database.prepare(`
    SELECT city_id, item_id, quantity FROM inventory
    WHERE player_id = ? ORDER BY city_id, item_id
  `).all(player.id).map((entry) => ({ ...entry }));
  assert.deepEqual(inventoryAfter, [...inventoryBefore, {
    city_id: playerBefore.city_id,
    item_id: SAFE_TRAVEL_KIT_CATALOG.itemId,
    quantity: 1
  }].sort((first, second) => first.city_id - second.city_id || first.item_id - second.item_id));
  assert.deepEqual(store.database.prepare(`
    SELECT item_id, quantity, stored_at FROM meld_stash
    WHERE player_id = ? ORDER BY item_id
  `).all(player.id).map((entry) => ({ ...entry })), stashBefore);
  assert.equal(store.database.prepare(
    'SELECT COUNT(*) AS count FROM player_region_homes'
  ).get().count, 0, 'migration does not backfill a regional home row');
  assert.equal(store.playerById(player.id, 2000, { settle: false }).currentRegionHomeCityId,
    capitalFor(migratedCatalog, 'aso').id,
  'the fixed capital is derived without backfilling a regional-home row');
});

test('v99 adds only regional-capital catalog metadata before world bootstrap', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-capital-v99-'));
  const databaseFile = path.join(directory, 'game.sqlite');
  let store = new SqliteStore(databaseFile);
  context.after(() => {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  store.seedCatalog(loadLegacyCatalog());
  store.ensureWorldMaps(1000);
  const catalog = store.loadCatalog();
  const player = store.addPlayer(createPlayer(
    'Capital Migration Miner', '', 'hash', catalog, 1000, () => 0.5
  ));
  const playerBefore = { ...store.database.prepare(
    'SELECT * FROM players WHERE id = ?'
  ).get(player.id) };
  const knownBefore = store.database.prepare(
    'SELECT city_id FROM known_cities WHERE player_id = ? ORDER BY city_id'
  ).all(player.id).map((entry) => entry.city_id);

  store.database.exec(`
    ALTER TABLE world_maps DROP COLUMN capital_city_id;
    PRAGMA user_version = 98;
  `);
  store.close();

  store = new SqliteStore(databaseFile);
  assert.equal(store.database.prepare('PRAGMA user_version').get().user_version, 142);
  assert.ok(store.database.prepare('PRAGMA table_info(world_maps)').all()
    .some((column) => column.name === 'capital_city_id'));
  assert.deepEqual({ ...store.database.prepare(
    'SELECT * FROM players WHERE id = ?'
  ).get(player.id) }, playerBefore);
  assert.deepEqual(store.database.prepare(
    'SELECT city_id FROM known_cities WHERE player_id = ? ORDER BY city_id'
  ).all(player.id).map((entry) => entry.city_id), knownBefore);
  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count FROM world_maps WHERE capital_city_id IS NOT NULL
  `).get().count, 0, 'the schema migration does not choose capitals by rewriting player state');

  store.ensureWorldMaps(2000);
  assert.equal(store.loadCatalog().maps.every((map) => Number.isSafeInteger(map.capitalCityId)), true);
});
