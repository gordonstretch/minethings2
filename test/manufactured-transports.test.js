import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createPlayer } from '../src/game.js';
import {
  loadLegacyCatalog, MANUFACTURED_TRANSPORT_CATALOG
} from '../src/legacy-catalog.js';
import { SqliteStore } from '../src/store.js';
import { vehicleIconPath } from '../src/vehicle-icons.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BOOTSTRAP_CATALOG = loadLegacyCatalog();
const OIL_TANKER_ITEM_ID = 1584;
const TRAIN_CARRIAGE_ITEM_ID = 1585;

function createWorldStore(context) {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(BOOTSTRAP_CATALOG);
  store.ensureWorldMaps(1000);
  store.database.prepare(`
    UPDATE world_weather_slots SET condition = 'clear'
    WHERE slot_at = (SELECT last_slot_at FROM world_event_clock WHERE id = 1)
  `).run();
  return { store, catalog: store.loadCatalog() };
}

function stock(store, playerId, cityId, itemId, quantity) {
  store.database.prepare(`
    INSERT INTO inventory (player_id, city_id, item_id, quantity)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (player_id, city_id, item_id)
    DO UPDATE SET quantity = inventory.quantity + excluded.quantity
  `).run(playerId, cityId, itemId, quantity);
}

function mapCapital(store, slug) {
  const row = store.database.prepare(`
    SELECT world_maps.id AS map_id, world_maps.capital_city_id AS city_id
    FROM world_maps WHERE world_maps.slug = ?
  `).get(slug);
  assert.ok(row?.city_id, `${slug} has a regional capital`);
  return { mapId: Number(row.map_id), cityId: Number(row.city_id) };
}

test('defines the two manufactured transports, actions, SVGs, stats, and policies exactly', () => {
  assert.deepEqual(MANUFACTURED_TRANSPORT_CATALOG.vehicles, [
    {
      id: 78, itemId: OIL_TANKER_ITEM_ID, speed: 40, capacity: 100,
      capacityCap: 100, routeType: 1, cargoPolicy: 'oil-only', routePolicy: 'standard'
    },
    {
      id: 79, itemId: TRAIN_CARRIAGE_ITEM_ID, speed: 200, capacity: 200,
      capacityCap: 200, routeType: 0, cargoPolicy: 'any-item', routePolicy: 'capital-link'
    }
  ]);
  assert.deepEqual(MANUFACTURED_TRANSPORT_CATALOG.ships,
    [{ id: 58, vehicleId: 78, cannonPortals: 0, hull: 750, crew: 20 }]);
  assert.deepEqual(MANUFACTURED_TRANSPORT_CATALOG.lands,
    [{ id: 36, vehicleId: 79, attack: 0.5, armor: 300 }]);
  assert.deepEqual(MANUFACTURED_TRANSPORT_CATALOG.factoryActions, [
    {
      id: 20, name: 'Build Oil Tanker', ore: 40, components: 60000,
      actionKind: 'item', outputItemId: OIL_TANKER_ITEM_ID, outputQuantity: 1
    },
    {
      id: 21, name: 'Build Train Carriage', ore: 75, components: 120000,
      actionKind: 'item', outputItemId: TRAIN_CARRIAGE_ITEM_ID, outputQuantity: 1
    }
  ]);

  const catalog = BOOTSTRAP_CATALOG;
  const expected = [
    [OIL_TANKER_ITEM_ID, 'Oil Tanker', 'oil-only', 'standard', 100, 40],
    [TRAIN_CARRIAGE_ITEM_ID, 'Train Carriage', 'any-item', 'capital-link', 200, 200]
  ];
  for (const [itemId, name, cargoPolicy, routePolicy, capacity, speed] of expected) {
    const item = catalog.byId.get(itemId);
    const vehicle = catalog.vehicleByItemId.get(itemId);
    const icon = vehicleIconPath(itemId);
    assert.ok(item && vehicle, `${name} belongs to the indexed catalog`);
    assert.deepEqual({
      name: item.name, rarity: item.rarity, canFind: item.canFind,
      icon: item.icon, iconSource: item.iconSource, largeImage: item.largeImage,
      hasLargeImage: item.hasLargeImage
    }, {
      name, rarity: 0, canFind: false,
      icon, iconSource: 'vehicle-svg', largeImage: icon, hasLargeImage: true
    });
    assert.deepEqual({
      cargoPolicy: vehicle.cargoPolicy, routePolicy: vehicle.routePolicy,
      capacity: vehicle.capacity, capacityCap: vehicle.capacityCap, speed: vehicle.speed
    }, { cargoPolicy, routePolicy, capacity, capacityCap: capacity, speed });
    assert.equal(catalog.factoryOutputItemIds.has(itemId), true);

    const svgPath = path.join(ROOT, 'public', 'img', 'items', 'vehicles',
      `vehicle-${itemId}.svg`);
    const svg = fs.readFileSync(svgPath, 'utf8');
    assert.match(svg, /viewBox="0 0 128 128"/u);
    assert.match(svg, new RegExp(`<title id="title">${name}</title>`, 'u'));
    assert.match(svg, /aria-labelledby="title desc"/u);
  }

  const damaged = MANUFACTURED_TRANSPORT_CATALOG.items.filter(
    (item) => item.repairedItemId !== null
  );
  assert.deepEqual(damaged.map((item) => ({
    id: item.id, repairedItemId: item.repairedItemId, canFind: item.canFind,
    icon: item.icon
  })), [
    {
      id: 1586, repairedItemId: OIL_TANKER_ITEM_ID, canFind: false,
      icon: vehicleIconPath(OIL_TANKER_ITEM_ID)
    },
    {
      id: 1587, repairedItemId: TRAIN_CARRIAGE_ITEM_ID, canFind: false,
      icon: vehicleIconPath(TRAIN_CARRIAGE_ITEM_ID)
    }
  ]);
});

test('fresh stores persist transport policies, caps, and the oil-hold backstop', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());

  const columns = new Map(store.database.prepare('PRAGMA table_info(catalog_vehicles)')
    .all().map((column) => [column.name, column]));
  for (const name of ['cargo_policy', 'route_policy', 'capacity_cap']) {
    assert.equal(columns.has(name), true, `fresh catalog_vehicles has ${name}`);
  }
  assert.equal(columns.get('cargo_policy').notnull, 1);
  assert.equal(columns.get('route_policy').notnull, 1);
  assert.equal(columns.get('capacity_cap').notnull, 0);
  assert.deepEqual(store.database.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'trigger' AND name LIKE 'player_vehicle_cargo_%'
    ORDER BY name
  `).all().map((row) => row.name), [
    'player_vehicle_cargo_capacity_insert',
    'player_vehicle_cargo_capacity_update',
    'player_vehicle_cargo_policy_insert',
    'player_vehicle_cargo_policy_update'
  ]);

  store.seedCatalog(BOOTSTRAP_CATALOG);
  assert.deepEqual(store.database.prepare(`
    SELECT item_id, speed, capacity, cargo_policy, route_policy, capacity_cap
    FROM catalog_vehicles WHERE item_id IN (?, ?) ORDER BY item_id
  `).all(OIL_TANKER_ITEM_ID, TRAIN_CARRIAGE_ITEM_ID).map((row) => ({ ...row })), [
    {
      item_id: OIL_TANKER_ITEM_ID, speed: 40, capacity: 100,
      cargo_policy: 'oil-only', route_policy: 'standard', capacity_cap: 100
    },
    {
      item_id: TRAIN_CARRIAGE_ITEM_ID, speed: 200, capacity: 200,
      cargo_policy: 'any-item', route_policy: 'capital-link', capacity_cap: 200
    }
  ]);
});

test('migrates a populated v115 catalog to v116 exactly once', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-transports-v115-'));
  const databaseFile = path.join(directory, 'game.sqlite');
  let store = new SqliteStore(databaseFile);
  context.after(() => {
    try { store.close(); } catch {}
    fs.rmSync(directory, { recursive: true, force: true });
  });
  store.seedCatalog(BOOTSTRAP_CATALOG);
  store.close();

  const legacy = new DatabaseSync(databaseFile);
  legacy.exec(`
    DROP TRIGGER player_vehicle_cargo_capacity_insert;
    DROP TRIGGER player_vehicle_cargo_capacity_update;
    DROP TRIGGER player_vehicle_cargo_policy_insert;
    DROP TRIGGER player_vehicle_cargo_policy_update;
    DELETE FROM catalog_factory_actions WHERE id IN (20, 21);
    DELETE FROM catalog_lands WHERE id = 36;
    DELETE FROM catalog_ships WHERE id = 58;
    DELETE FROM catalog_vehicles WHERE id IN (78, 79);
    DELETE FROM catalog_items WHERE id IN (1584, 1585, 1586, 1587);
    ALTER TABLE catalog_vehicles DROP COLUMN capacity_cap;
    ALTER TABLE catalog_vehicles DROP COLUMN route_policy;
    ALTER TABLE catalog_vehicles DROP COLUMN cargo_policy;
    PRAGMA user_version = 115;
  `);
  assert.equal(legacy.prepare('PRAGMA user_version').get().user_version, 115);
  assert.equal(legacy.prepare(`
    SELECT COUNT(*) AS count FROM catalog_items WHERE id BETWEEN 1584 AND 1587
  `).get().count, 0);
  legacy.close();

  store = new SqliteStore(databaseFile);
  assert.equal(store.database.prepare('PRAGMA user_version').get().user_version, 130);
  const columns = new Map(store.database.prepare('PRAGMA table_info(catalog_vehicles)')
    .all().map((column) => [column.name, column]));
  assert.deepEqual([...columns.keys()].filter((name) =>
    ['cargo_policy', 'route_policy', 'capacity_cap'].includes(name)).sort(),
  ['capacity_cap', 'cargo_policy', 'route_policy']);
  assert.deepEqual(store.database.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'trigger' AND name LIKE 'player_vehicle_cargo_%'
    ORDER BY name
  `).all().map((row) => row.name), [
    'player_vehicle_cargo_capacity_insert',
    'player_vehicle_cargo_capacity_update',
    'player_vehicle_cargo_policy_insert',
    'player_vehicle_cargo_policy_update'
  ]);

  const migratedItems = store.database.prepare(`
    SELECT id, name, rarity, mine_type_id, repaired_item_id, can_find, icon,
      icon_source, is_damaged, large_image, has_large_image, gold_value_units
    FROM catalog_items WHERE id BETWEEN 1584 AND 1587 ORDER BY id
  `).all().map((row) => ({ ...row }));
  assert.deepEqual(migratedItems, MANUFACTURED_TRANSPORT_CATALOG.items.map((item) => ({
    id: item.id,
    name: item.name,
    rarity: item.rarity,
    mine_type_id: item.mineTypeId,
    repaired_item_id: item.repairedItemId,
    can_find: item.canFind ? 1 : 0,
    icon: item.icon,
    icon_source: item.iconSource,
    is_damaged: item.damaged ? 1 : 0,
    large_image: item.largeImage,
    has_large_image: item.hasLargeImage ? 1 : 0,
    gold_value_units: item.goldValueUnits
  })));
  assert.deepEqual(store.database.prepare(`
    SELECT id, item_id, speed, capacity, route_type, cargo_policy, route_policy,
      capacity_cap FROM catalog_vehicles WHERE id IN (78, 79) ORDER BY id
  `).all().map((row) => ({ ...row })), MANUFACTURED_TRANSPORT_CATALOG.vehicles.map(
    (vehicle) => ({
      id: vehicle.id,
      item_id: vehicle.itemId,
      speed: vehicle.speed,
      capacity: vehicle.capacity,
      route_type: vehicle.routeType,
      cargo_policy: vehicle.cargoPolicy,
      route_policy: vehicle.routePolicy,
      capacity_cap: vehicle.capacityCap
    })
  ));
  assert.deepEqual(store.database.prepare(`
    SELECT id, vehicle_id, attack, armor FROM catalog_lands WHERE id = 36
  `).all().map((row) => ({ ...row })), [
    { id: 36, vehicle_id: 79, attack: 0.5, armor: 300 }
  ]);
  assert.deepEqual(store.database.prepare(`
    SELECT id, vehicle_id, cannon_portals, hull, crew FROM catalog_ships WHERE id = 58
  `).all().map((row) => ({ ...row })), [
    { id: 58, vehicle_id: 78, cannon_portals: 0, hull: 750, crew: 20 }
  ]);
  assert.deepEqual(store.database.prepare(`
    SELECT id, name, ore, components, action_kind, output_item_id, output_quantity
    FROM catalog_factory_actions WHERE id IN (20, 21) ORDER BY id
  `).all().map((row) => ({ ...row })), MANUFACTURED_TRANSPORT_CATALOG.factoryActions.map(
    (action) => ({
      id: action.id,
      name: action.name,
      ore: action.ore,
      components: action.components,
      action_kind: action.actionKind,
      output_item_id: action.outputItemId,
      output_quantity: action.outputQuantity
    })
  ));
  assert.deepEqual({ ...store.database.prepare(`
    SELECT cargo_policy, route_policy, capacity_cap
    FROM catalog_vehicles WHERE id = 73
  `).get() }, { cargo_policy: 'standard', route_policy: 'standard', capacity_cap: null });
  const migratedCatalog = store.loadCatalog();
  assert.equal(migratedCatalog.vehicleByItemId.get(OIL_TANKER_ITEM_ID).cargoPolicy,
    'oil-only');
  assert.equal(migratedCatalog.vehicleByItemId.get(TRAIN_CARRIAGE_ITEM_ID).routePolicy,
    'capital-link');

  const revision = store.database.prepare(
    'SELECT revision FROM catalog_cache_revision WHERE id = 1'
  ).get().revision;
  const rowCounts = {
    items: store.database.prepare(`
      SELECT COUNT(*) AS count FROM catalog_items WHERE id BETWEEN 1584 AND 1587
    `).get().count,
    vehicles: store.database.prepare(`
      SELECT COUNT(*) AS count FROM catalog_vehicles WHERE id IN (78, 79)
    `).get().count,
    actions: store.database.prepare(`
      SELECT COUNT(*) AS count FROM catalog_factory_actions WHERE id IN (20, 21)
    `).get().count
  };
  store.close();
  store = new SqliteStore(databaseFile);
  assert.equal(store.database.prepare('PRAGMA user_version').get().user_version, 130);
  assert.equal(store.database.prepare(
    'SELECT revision FROM catalog_cache_revision WHERE id = 1'
  ).get().revision, revision, 'reopening v116 does not replay the migration');
  assert.deepEqual({
    items: store.database.prepare(`
      SELECT COUNT(*) AS count FROM catalog_items WHERE id BETWEEN 1584 AND 1587
    `).get().count,
    vehicles: store.database.prepare(`
      SELECT COUNT(*) AS count FROM catalog_vehicles WHERE id IN (78, 79)
    `).get().count,
    actions: store.database.prepare(`
      SELECT COUNT(*) AS count FROM catalog_factory_actions WHERE id IN (20, 21)
    `).get().count
  }, rowCounts);
  assert.deepEqual(rowCounts, { items: 4, vehicles: 2, actions: 2 });
});

test('factories expose and produce both protected manufactured transports', (context) => {
  const { store, catalog } = createWorldStore(context);
  const playerDraft = createPlayer('Transport Foundry', '', 'hash', catalog, 1000, () => 0.5);
  playerDraft.gold = 2_000_000;
  const oreItemId = Number(catalog.settings.ore_item_id);
  playerDraft.inventory[oreItemId] = 200;
  playerDraft.inventoryByCity = { [playerDraft.cityId]: playerDraft.inventory };
  const player = store.addPlayer(playerDraft);

  // Keep this test about manufacturing rather than premium-worker contract expiry.
  store.database.prepare(`
    UPDATE catalog_settings SET value_json = ?
    WHERE key = 'factory_worker_bot_contract_duration_ms'
  `).run(JSON.stringify(1_000_000_000_000));

  const startedAt = 2000;
  const factory = store.buildFactory(player.id, startedAt);
  const bot = store.hireFactoryWorkerBot(player.id, factory.id, 3, startedAt);
  assert.equal(bot.cph, 400);
  const buildAction = catalog.factoryActions.find((action) => action.actionKind === 'build');
  const builtAt = startedAt + Math.ceil(buildAction.components / bot.cph * 3_600_000) + 1;
  assert.equal(store.factoriesForPlayer(player.id, builtAt).completions[0].actionName,
    buildAction.name);

  let now = builtAt;
  for (const actionId of [20, 21]) {
    const action = catalog.factoryActionById.get(actionId);
    assert.ok(action, `factory action ${actionId} is available`);
    assert.equal(store.startFactoryAction(player.id, factory.id, actionId, null, now).enqueued,
      false);
    now += Math.ceil(action.components / bot.cph * 3_600_000) + 1;
    const completion = store.factoriesForPlayer(player.id, now).completions[0];
    assert.equal(completion.actionName, action.name);
  }

  const restored = store.playerById(player.id);
  for (const itemId of [OIL_TANKER_ITEM_ID, TRAIN_CARRIAGE_ITEM_ID]) {
    assert.equal(restored.inventoryByCity[player.cityId][itemId], 1);
    assert.equal(restored.protectedInventoryByCity[player.cityId][itemId], 1);
  }
});

test('Oil Tanker activates with 750 hull and accepts exactly 100 Oil barrels only', (context) => {
  const { store, catalog } = createWorldStore(context);
  const player = store.addPlayer(createPlayer(
    'Tanker Captain', '', 'hash', catalog, 1000, () => 0.5
  ));
  const oilItemId = Number(catalog.settings.oil_item_id);
  const nonOilItem = catalog.items.find((item) => item.id !== oilItemId
    && item.repairedItemId === null && !catalog.vehicleByItemId.has(item.id));
  assert.ok(nonOilItem);
  stock(store, player.id, player.cityId, OIL_TANKER_ITEM_ID, 1);
  stock(store, player.id, player.cityId, oilItemId, 101);
  stock(store, player.id, player.cityId, nonOilItem.id, 1);

  const vehicleId = store.activateVehicle(player.id, OIL_TANKER_ITEM_ID, 2000);
  const tanker = store.vehicleDetails(player.id, vehicleId, 2000);
  assert.deepEqual({
    cargoPolicy: tanker.cargoPolicy, capacity: tanker.capacity,
    capacityCap: tanker.capacityCap, hull: tanker.ship.hull,
    maximumHull: tanker.ship.max_hull, cannonPortals: tanker.shipDefinition.cannonPortals
  }, {
    cargoPolicy: 'oil-only', capacity: 100, capacityCap: 100,
    hull: 750, maximumHull: 750, cannonPortals: 0
  });

  const fullHold = store.previewVehicleCargo(player.id, vehicleId, { [oilItemId]: 100 });
  assert.equal(fullHold.valid, true);
  assert.equal(fullHold.cargoSize, 100);
  assert.equal(fullHold.capacity, 100);
  const overfull = store.previewVehicleCargo(player.id, vehicleId, { [oilItemId]: 101 });
  assert.equal(overfull.valid, false);
  assert.match(overfull.reasons.join(' '), /capacity/i);
  const wrongCargo = store.previewVehicleCargo(player.id, vehicleId, { [nonOilItem.id]: 1 });
  assert.equal(wrongCargo.valid, false);
  assert.match(wrongCargo.reasons.join(' '), /not physically compatible/i);
  assert.throws(() => store.setVehicleCargo(player.id, vehicleId, { [nonOilItem.id]: 1 }),
    /not physically compatible/i);
  assert.throws(() => store.database.prepare(`
    INSERT INTO player_vehicle_cargo (vehicle_id, item_id, quantity) VALUES (?, ?, 1)
  `).run(vehicleId, nonOilItem.id), /tanker hold accepts only barrels of Oil/i);

  assert.equal(store.setVehicleCargo(player.id, vehicleId, { [oilItemId]: 100 }), 100);
  assert.throws(() => store.setVehicleCargo(player.id, vehicleId, { [oilItemId]: 101 }),
    /capacity/i);
  assert.equal(store.vehicleDetails(player.id, vehicleId, 2000).cargoSize, 100);
});

test('Oil Tanker is omitted from tiered sea-threat hunts', (context) => {
  const { store, catalog } = createWorldStore(context);
  const player = store.addPlayer(createPlayer(
    'Tanker Hunter', '', 'hash', catalog, 1000, () => 0.5
  ));
  const seaRouteType = Number(catalog.settings.route_type_ids.sea);
  const route = catalog.routes.find((entry) => entry.open && entry.type === seaRouteType
    && entry.city1Id !== entry.city2Id
    && [entry.city1Id, entry.city2Id].includes(player.cityId));
  assert.ok(route);
  stock(store, player.id, player.cityId, OIL_TANKER_ITEM_ID, 1);
  const tankerId = store.activateVehicle(player.id, OIL_TANKER_ITEM_ID, 2000);
  const mapId = store.database.prepare(
    'SELECT map_id FROM catalog_cities WHERE id = ?'
  ).get(player.cityId).map_id;
  const creatureId = Number(store.database.prepare(`
    INSERT INTO world_creatures
      (creature_type, rarity, map_id, route_id, location, destination_city_id,
       hp, max_hp, awakened_at, moved_at, speed)
    VALUES ('kraken', 6, ?, ?, ?, ?, 180, 180, 3000, 3000, 18)
  `).run(mapId, route.id, route.length / 2, player.cityId).lastInsertRowid);

  const creature = store.worldEventStatus(player.id, 3001).creatures
    .find((entry) => entry.id === creatureId);
  assert.ok(creature);
  assert.equal(creature.attackOptions.some((entry) => entry.vehicleId === tankerId), false,
    'an Unranked Oil Tanker has no compatible world-threat combat tier');
});

test('Train Carriage activates and travels only on inter-region capital rails at 200 km/h',
  (context) => {
    const { store, catalog } = createWorldStore(context);
    const landRouteType = Number(catalog.settings.route_type_ids.land);
    const aso = mapCapital(store, 'aso');
    const outpost = store.database.prepare(`
      SELECT id FROM catalog_cities
      WHERE map_id = ? AND id <> ? ORDER BY id LIMIT 1
    `).get(aso.mapId, aso.cityId);
    assert.ok(outpost);
    const gateway = store.database.prepare(`
      SELECT catalog_routes.*
      FROM catalog_routes
      JOIN catalog_cities AS city1 ON city1.id = catalog_routes.city1_id
      JOIN catalog_cities AS city2 ON city2.id = catalog_routes.city2_id
      WHERE catalog_routes.is_inter_map = 1 AND catalog_routes.type = ?
        AND (catalog_routes.city1_id = ? OR catalog_routes.city2_id = ?)
        AND city1.map_id <> city2.map_id
      ORDER BY catalog_routes.id LIMIT 1
    `).get(landRouteType, aso.cityId, aso.cityId);
    assert.ok(gateway, 'Aso has a capital-to-capital land gateway');
    store.database.prepare('UPDATE catalog_routes SET is_open = 1 WHERE id = ?')
      .run(gateway.id);

    const outpostDraft = createPlayer('Outpost Rail Test', '', 'hash', catalog, 1000, () => 0.5);
    outpostDraft.cityId = Number(outpost.id);
    outpostDraft.inventory = { [TRAIN_CARRIAGE_ITEM_ID]: 1 };
    outpostDraft.inventoryByCity = { [outpost.id]: outpostDraft.inventory };
    const outpostPlayer = store.addPlayer(outpostDraft);
    const unavailable = store.vehicleActivationAvailability(
      outpostPlayer.id, TRAIN_CARRIAGE_ITEM_ID
    );
    assert.equal(unavailable.allowed, false);
    assert.match(unavailable.reason, /regional capital with an open gateway rail/i);
    assert.throws(() => store.activateVehicle(outpostPlayer.id, TRAIN_CARRIAGE_ITEM_ID),
      /regional capital with an open gateway rail/i);

    const player = store.addPlayer(createPlayer(
      'Capital Rail Test', '', 'hash', catalog, 1000, () => 0.5
    ));
    assert.equal(player.cityId, aso.cityId);
    const arbitraryItem = catalog.items.find((item) => item.rarity === 6
      && item.repairedItemId === null && item.id !== TRAIN_CARRIAGE_ITEM_ID);
    assert.ok(arbitraryItem, 'a high-rarity arbitrary cargo fixture exists');
    stock(store, player.id, player.cityId, TRAIN_CARRIAGE_ITEM_ID, 1);
    stock(store, player.id, player.cityId, arbitraryItem.id, 201);
    const vehicleId = store.activateVehicle(player.id, TRAIN_CARRIAGE_ITEM_ID, 2000);

    const localRoute = store.database.prepare(`
      SELECT * FROM catalog_routes
      WHERE type = ? AND is_open = 1 AND is_inter_map = 0
        AND (city1_id = ? OR city2_id = ?) AND city1_id <> city2_id
      ORDER BY id LIMIT 1
    `).get(landRouteType, aso.cityId, aso.cityId);
    assert.ok(localRoute);
    store.database.prepare('UPDATE catalog_routes SET is_inter_map = 1 WHERE id = ?')
      .run(localRoute.id);
    assert.throws(() => store.sendVehicle(player.id, vehicleId, localRoute.id, 2000, {
      skipStowaway: true,
      skipVehicleEncounterPlanning: true,
      skipCreatureEncounterPlanning: true
    }), /gateway rails between regional capitals/i,
    'a forged inter-map flag cannot turn a local route into capital rail');

    const routes = store.routesForVehicle(player.id, vehicleId, 2000);
    assert.ok(routes.length > 0);
    assert.equal(routes.some((route) => route.id === localRoute.id), false);
    for (const route of routes) {
      const endpoints = store.database.prepare(`
        SELECT city1.map_id AS map1_id, city2.map_id AS map2_id,
          map1.capital_city_id AS capital1_id, map2.capital_city_id AS capital2_id,
          catalog_routes.is_inter_map
        FROM catalog_routes
        JOIN catalog_cities AS city1 ON city1.id = catalog_routes.city1_id
        JOIN world_maps AS map1 ON map1.id = city1.map_id
        JOIN catalog_cities AS city2 ON city2.id = catalog_routes.city2_id
        JOIN world_maps AS map2 ON map2.id = city2.map_id
        WHERE catalog_routes.id = ?
      `).get(route.id);
      assert.equal(Boolean(endpoints.is_inter_map), true);
      assert.notEqual(endpoints.map1_id, endpoints.map2_id);
      assert.equal(route.originCityId, endpoints.capital1_id === aso.cityId
        ? endpoints.capital1_id : endpoints.capital2_id);
      assert.deepEqual(
        [route.originCityId, route.destinationCityId].sort((a, b) => a - b),
        [endpoints.capital1_id, endpoints.capital2_id].sort((a, b) => a - b)
      );
    }

    const fullLoad = store.previewVehicleCargo(
      player.id, vehicleId, { [arbitraryItem.id]: 200 }
    );
    assert.equal(fullLoad.valid, true);
    assert.equal(fullLoad.capacity, 200);
    assert.equal(fullLoad.cargoSize, 200);
    const overfull = store.previewVehicleCargo(
      player.id, vehicleId, { [arbitraryItem.id]: 201 }
    );
    assert.equal(overfull.valid, false);
    assert.match(overfull.reasons.join(' '), /capacity/i);
    assert.equal(store.setVehicleCargo(
      player.id, vehicleId, { [arbitraryItem.id]: 200 }
    ), 200);

    const route = routes.find((candidate) => candidate.id === gateway.id);
    assert.ok(route);
    const departedAt = 3000;
    const journey = store.sendVehicle(player.id, vehicleId, route.id, departedAt, {
      skipStowaway: true,
      skipVehicleEncounterPlanning: true,
      skipCreatureEncounterPlanning: true
    });
    const expectedDuration = Math.max(Number(catalog.settings.minimum_travel_duration_ms),
      Math.ceil(route.length / 200 * 3_600_000));
    assert.equal(journey.duration, expectedDuration);
    const traveling = store.vehicleDetails(player.id, vehicleId, departedAt);
    assert.equal(traveling.baseSpeed, 200);
    assert.equal(traveling.speed, 200);
    assert.equal(traveling.routePolicy, 'capital-link');
    assert.equal(traveling.cargoPolicy, 'any-item');
    assert.equal(traveling.capacity, 200);
  });

test('Train Carriage is omitted from incompatible Ghost Rider hunt shortcuts', (context) => {
  const { store, catalog } = createWorldStore(context);
  const landRouteType = Number(catalog.settings.route_type_ids.land);
  const capital = mapCapital(store, 'aso');
  const gateway = store.database.prepare(`
    SELECT id FROM catalog_routes
    WHERE type = ? AND is_inter_map = 1
      AND (city1_id = ? OR city2_id = ?) AND city1_id <> city2_id
    ORDER BY id LIMIT 1
  `).get(landRouteType, capital.cityId, capital.cityId);
  const localRoute = store.database.prepare(`
    SELECT id FROM catalog_routes
    WHERE type = ? AND is_inter_map = 0
      AND (city1_id = ? OR city2_id = ?) AND city1_id <> city2_id
    ORDER BY id LIMIT 1
  `).get(landRouteType, capital.cityId, capital.cityId);
  assert.ok(gateway && localRoute);
  store.database.prepare('UPDATE catalog_routes SET is_open = 1 WHERE id IN (?, ?)')
    .run(gateway.id, localRoute.id);

  const player = store.addPlayer(createPlayer(
    'Rail Ghost Hunter', '', 'hash', catalog, 1000, () => 0.5
  ));
  stock(store, player.id, player.cityId, TRAIN_CARRIAGE_ITEM_ID, 1);
  const trainId = store.activateVehicle(player.id, TRAIN_CARRIAGE_ITEM_ID, 2000);

  // Match the isolated fixture's combat tier so this verifies route policy specifically.
  store.database.prepare('UPDATE catalog_items SET rarity = 1 WHERE id = ?')
    .run(TRAIN_CARRIAGE_ITEM_ID);
  const ghost = store.adminRaiseGhost(player.id, 'rider', localRoute.id, 1, 3000);
  const visible = store.worldEventStatus(player.id, 3001).ghosts
    .find((entry) => entry.id === ghost.id);
  assert.ok(visible);
  assert.equal(visible.attackOptions.some((option) => option.vehicleId === trainId), false,
    'capital-link trains must not be offered for hunts on local roads');
});

test('queued Train Carriage legs cannot substitute a destination outside their rail route',
  (context) => {
    const { store, catalog } = createWorldStore(context);
    const landRouteType = Number(catalog.settings.route_type_ids.land);
    const rails = store.database.prepare(`
      SELECT catalog_routes.id, catalog_routes.city1_id, catalog_routes.city2_id
      FROM catalog_routes
      JOIN catalog_cities AS city1 ON city1.id = catalog_routes.city1_id
      JOIN world_maps AS map1 ON map1.id = city1.map_id
      JOIN catalog_cities AS city2 ON city2.id = catalog_routes.city2_id
      JOIN world_maps AS map2 ON map2.id = city2.map_id
      WHERE catalog_routes.type = ? AND catalog_routes.is_inter_map = 1
        AND city1.map_id <> city2.map_id
        AND catalog_routes.city1_id = map1.capital_city_id
        AND catalog_routes.city2_id = map2.capital_city_id
      ORDER BY catalog_routes.id
    `).all(landRouteType);
    let chain = null;
    for (const first of rails) {
      for (const second of rails) {
        if (first.id === second.id) continue;
        const shared = [first.city1_id, first.city2_id]
          .find((cityId) => cityId === second.city1_id || cityId === second.city2_id);
        if (!shared) continue;
        const origin = first.city1_id === shared ? first.city2_id : first.city1_id;
        const destination = second.city1_id === shared ? second.city2_id : second.city1_id;
        if (origin !== destination) {
          chain = { first, second, origin, shared, destination };
          break;
        }
      }
      if (chain) break;
    }
    assert.ok(chain, 'the regional capital network contains a two-leg rail chain');
    store.database.prepare('UPDATE catalog_routes SET is_open = 1 WHERE id IN (?, ?)')
      .run(chain.first.id, chain.second.id);

    const playerDraft = createPlayer('Queued Rail Guard', '', 'hash', catalog, 1000, () => 0.5);
    playerDraft.cityId = Number(chain.origin);
    playerDraft.homeCityId = Number(chain.origin);
    playerDraft.inventory = {};
    playerDraft.inventoryByCity = { [chain.origin]: playerDraft.inventory };
    const player = store.addPlayer(playerDraft);
    store.database.prepare(`
      INSERT OR IGNORE INTO known_cities (player_id, city_id) VALUES (?, ?)
    `).run(player.id, chain.shared);
    stock(store, player.id, chain.origin, TRAIN_CARRIAGE_ITEM_ID, 1);
    const trainId = store.activateVehicle(player.id, TRAIN_CARRIAGE_ITEM_ID, 2000);
    const journey = store.sendVehicle(player.id, trainId, chain.first.id, 3000, {
      additionalRouteIds: [chain.second.id], skipStowaway: true,
      skipVehicleEncounterPlanning: true, skipCreatureEncounterPlanning: true
    });
    const queued = store.database.prepare(`
      SELECT * FROM player_vehicle_journey_legs WHERE vehicle_id = ? AND position = 1
    `).get(trainId);
    assert.equal(queued.route_id, chain.second.id);
    assert.equal(queued.origin_city_id, chain.shared);
    assert.equal(queued.destination_city_id, chain.destination);

    const forgedCity = store.database.prepare(`
      SELECT id FROM catalog_cities
      WHERE id NOT IN (SELECT capital_city_id FROM world_maps)
        AND id NOT IN (?, ?, ?)
      ORDER BY id LIMIT 1
    `).get(chain.origin, chain.shared, chain.destination);
    assert.ok(forgedCity);
    store.database.prepare(`
      UPDATE player_vehicle_journey_legs SET destination_city_id = ?
      WHERE vehicle_id = ? AND position = 1
    `).run(forgedCity.id, trainId);

    try {
      store.vehicleDetails(player.id, trainId, journey.arrivesAt);
    } catch {
      // Rejecting a corrupt queued leg is valid; parking safely at the reached
      // capital is also valid. It must never depart toward the forged city.
    }
    const after = store.database.prepare(`
      SELECT city_id, origin_city_id, destination_city_id
      FROM player_vehicles WHERE id = ?
    `).get(trainId);
    assert.notEqual(after.city_id, forgedCity.id);
    assert.notEqual(after.destination_city_id, forgedCity.id,
      'a persisted destination must be the opposite endpoint of its queued route');
  });

test('database cargo writes cannot exceed manufactured transport capacity caps', (context) => {
  const { store, catalog } = createWorldStore(context);
  const player = store.addPlayer(createPlayer(
    'Raw Freight Guard', '', 'hash', catalog, 1000, () => 0.5
  ));
  store.database.prepare('UPDATE catalog_routes SET is_open = 1').run();
  stock(store, player.id, player.cityId, OIL_TANKER_ITEM_ID, 1);
  stock(store, player.id, player.cityId, TRAIN_CARRIAGE_ITEM_ID, 1);
  const tankerId = store.activateVehicle(player.id, OIL_TANKER_ITEM_ID, 2000);
  const trainId = store.activateVehicle(player.id, TRAIN_CARRIAGE_ITEM_ID, 2000);
  const oilItemId = Number(catalog.settings.oil_item_id);
  const ordinaryItems = catalog.items.filter((item) => item.id !== oilItemId
    && item.repairedItemId === null).slice(0, 2);
  assert.equal(ordinaryItems.length, 2);

  const insertCargo = store.database.prepare(`
    INSERT INTO player_vehicle_cargo (vehicle_id, item_id, quantity) VALUES (?, ?, ?)
  `);
  insertCargo.run(tankerId, oilItemId, 100);
  assert.throws(() => store.database.prepare(`
    UPDATE player_vehicle_cargo SET quantity = 101
    WHERE vehicle_id = ? AND item_id = ?
  `).run(tankerId, oilItemId));
  store.database.prepare('DELETE FROM player_vehicle_cargo WHERE vehicle_id = ?').run(tankerId);
  assert.throws(() => insertCargo.run(tankerId, oilItemId, 101));

  insertCargo.run(trainId, ordinaryItems[0].id, 200);
  assert.throws(() => store.database.prepare(`
    UPDATE player_vehicle_cargo SET quantity = 201
    WHERE vehicle_id = ? AND item_id = ?
  `).run(trainId, ordinaryItems[0].id));
  assert.throws(() => insertCargo.run(trainId, ordinaryItems[1].id, 1),
    'the cap applies to the sum of every cargo row aboard the train');
});
