import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { Worker } from 'node:worker_threads';
import { buyMine, claimMine, createPlayer, detonateExplosive } from '../src/game.js';
import {
  ELECTRONICS_CATALOG, LEGACY_STARTER_WELCOME_PACK, loadLegacyCatalog, RELICS_CATALOG,
  SHROOM_CATALOG, WISDOM_CATALOG, WOOD_CATALOG
} from '../src/legacy-catalog.js';
import { roundListingMinimumUpUnits } from '../src/market-pricing.js';
import {
  hashPassword, hashPasswordAsync, SqliteStore, verifyPassword, verifyPasswordAsync
} from '../src/store.js';

const catalog = loadLegacyCatalog();

function resolveNextVehicleEncounter(store) {
  const previousBattleId = store.database.prepare(
    'SELECT COALESCE(MAX(id), 0) AS id FROM vehicle_battles'
  ).get().id;
  const planned = store.database.prepare(`
    SELECT id, encounter_at FROM vehicle_encounters
    WHERE status = 'planned' ORDER BY encounter_at, id LIMIT 1
  `).get();
  assert.ok(planned, 'an encounter should be physically scheduled');
  store.settleVehicles(planned.encounter_at);
  const resolved = store.database.prepare(
    'SELECT * FROM vehicle_encounters WHERE id = ?'
  ).get(planned.id);
  const battleId = resolved?.battle_id ?? store.database.prepare(
    'SELECT id FROM vehicle_battles WHERE id > ? ORDER BY id LIMIT 1'
  ).get(previousBattleId)?.id;
  assert.ok(battleId, 'the scheduled encounter should produce a battle');
  return { ...resolved, battle_id: battleId };
}

function setCurrentWeatherCondition(store, mapId, condition) {
  store.database.exec('PRAGMA ignore_check_constraints = ON');
  try {
    const changed = store.database.prepare(`
      UPDATE world_weather_slots SET condition = ?
      WHERE map_id = ? AND slot_at = (
        SELECT last_slot_at FROM world_event_clock WHERE id = 1
      )
    `).run(condition, mapId);
    assert.equal(changed.changes, 1, 'the current regional weather should exist');
  } finally {
    store.database.exec('PRAGMA ignore_check_constraints = OFF');
  }
}

test('waits for SQLite writers and reports an exhausted lock without leaking a transaction', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-lock-'));
  const databaseFile = path.join(directory, 'lock.sqlite');
  const store = new SqliteStore(databaseFile, { busyTimeoutMs: 25 });
  const blocker = new DatabaseSync(databaseFile);
  context.after(() => {
    try { blocker.exec('ROLLBACK'); } catch {}
    blocker.close();
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  store.seedCatalog(catalog);
  const player = store.addPlayer(createPlayer('Lock Tester', '', 'hash', catalog, 1000, () => 0.5));
  // An idle game connection must never prevent another connection becoming the writer.
  blocker.exec('PRAGMA busy_timeout = 25; BEGIN IMMEDIATE;');

  assert.throws(
    () => store.setRecyclePreferences(player.id, [], 2000),
    (error) => error.code === 'SQLITE_BUSY_TIMEOUT' && /temporarily busy/.test(error.message)
  );
  blocker.exec('ROLLBACK');
  assert.deepEqual(store.setRecyclePreferences(player.id, [], 2001), []);
  assert.equal(store.database.prepare('PRAGMA wal_autocheckpoint').get().wal_autocheckpoint, 250);
  assert.equal(store.database.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
  assert.equal(store.database.prepare('PRAGMA locking_mode').get().locking_mode, 'normal');
});

test('brief SQLite writer contention clears without failing the game action', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-soft-lock-'));
  const databaseFile = path.join(directory, 'soft-lock.sqlite');
  const store = new SqliteStore(databaseFile, { busyTimeoutMs: 1000 });
  store.seedCatalog(catalog);
  const player = store.addPlayer(createPlayer('Soft Lock Tester', '', 'hash', catalog, 1000, () => 0.5));
  const worker = new Worker(`
    const { parentPort, workerData } = require('node:worker_threads');
    const { DatabaseSync } = require('node:sqlite');
    const database = new DatabaseSync(workerData);
    database.exec('PRAGMA busy_timeout = 1000; BEGIN IMMEDIATE;');
    parentPort.postMessage('locked');
    setTimeout(() => {
      database.exec('ROLLBACK');
      database.close();
      parentPort.postMessage('released');
    }, 100);
  `, { eval: true, workerData: databaseFile });
  context.after(async () => {
    await worker.terminate();
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  await new Promise((resolve, reject) => {
    worker.once('message', resolve);
    worker.once('error', reject);
  });

  assert.deepEqual(store.setRecyclePreferences(player.id, [], 2000), []);
});

test('ordinary reads do not request the SQLite writer lock', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-read-lock-'));
  const databaseFile = path.join(directory, 'read-lock.sqlite');
  const store = new SqliteStore(databaseFile, { busyTimeoutMs: 25 });
  store.seedCatalog(catalog);
  store.database.prepare(`
    UPDATE dwarf_state
    SET next_find_at = 999999, next_competition_at = 999999, next_stowaway_at = 999999
    WHERE id = 1
  `).run();
  const independentWriter = new DatabaseSync(databaseFile);
  independentWriter.exec('PRAGMA busy_timeout = 0; BEGIN IMMEDIATE;');
  context.after(() => {
    try { independentWriter.exec('ROLLBACK'); } catch {}
    independentWriter.close();
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const update = store.runDwarfUpdate(1000, () => 0.5);
  assert.equal(update.nextFindAt, 999999);
  assert.equal(store.database.prepare('SELECT COUNT(*) AS count FROM catalog_items').get().count > 0, true);
});

test('loads a read-only fleet snapshot while background maintenance owns the writer', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-fleet-read-lock-'));
  const databaseFile = path.join(directory, 'fleet-read-lock.sqlite');
  const store = new SqliteStore(databaseFile, { busyTimeoutMs: 25 });
  store.seedCatalog(catalog);
  const player = createPlayer('Fleet Snapshot Lock', '', 'hash', catalog, 1000, () => 0.5);
  const vehicleType = catalog.vehicles.find((vehicle) =>
    catalog.byId.has(vehicle.itemId)
    && catalog.routes.some((route) => route.open && route.type === vehicle.routeType
      && route.city1Id !== route.city2Id
      && (route.city1Id === player.cityId || route.city2Id === player.cityId)));
  assert.ok(vehicleType);
  player.inventory = { [vehicleType.itemId]: 1 };
  player.inventoryByCity = { [player.cityId]: player.inventory };
  const saved = store.addPlayer(player);
  const vehicleId = store.activateVehicle(saved.id, vehicleType.itemId);
  const independentWriter = new DatabaseSync(databaseFile);
  independentWriter.exec('PRAGMA busy_timeout = 0; BEGIN IMMEDIATE;');
  context.after(() => {
    try { independentWriter.exec('ROLLBACK'); } catch {}
    independentWriter.close();
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const vehicles = store.vehiclesForPlayer(saved.id, 2000, {
    includeRoutes: true, settle: false
  });
  assert.equal(vehicles.length, 1);
  assert.equal(vehicles[0].id, vehicleId);
  assert.ok(vehicles[0].routes.length > 0);
});

test('bounds the default SQLite wait so contention cannot freeze the server', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  assert.equal(store.database.prepare('PRAGMA busy_timeout').get().timeout, 250);
});

test('releases the SQLite writer after a game action throws', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-rollback-lock-'));
  const databaseFile = path.join(directory, 'rollback.sqlite');
  const store = new SqliteStore(databaseFile, { busyTimeoutMs: 25 });
  const independentWriter = new DatabaseSync(databaseFile);
  context.after(() => {
    independentWriter.close();
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  store.seedCatalog(catalog);
  const player = store.addPlayer(createPlayer('Rollback Lock Tester', '', 'hash', catalog, 1000, () => 0.5));
  const itemId = catalog.items.find((item) => !catalog.factoryOutputItemIds.has(item.id)).id;
  store.setRecyclePreferences(player.id, [itemId], 2000);

  assert.throws(() => store.setRecyclePreferences(player.id, [itemId, 999999999], 2001), /Item not found/);
  assert.deepEqual(
    store.database.prepare(
      'SELECT item_id FROM recycle_preferences WHERE player_id = ? ORDER BY item_id'
    ).all(player.id).map((row) => row.item_id),
    [itemId]
  );
  independentWriter.exec('PRAGMA busy_timeout = 0; BEGIN IMMEDIATE; COMMIT;');
});

test('closing a store releases an accidentally open writer transaction', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-close-lock-'));
  const databaseFile = path.join(directory, 'close.sqlite');
  const store = new SqliteStore(databaseFile);
  const independentWriter = new DatabaseSync(databaseFile);
  context.after(() => {
    independentWriter.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  store.database.exec('BEGIN IMMEDIATE');
  store.close();
  independentWriter.exec('PRAGMA busy_timeout = 0; BEGIN IMMEDIATE; COMMIT;');
});

function oilMachine(type, rarity = null) {
  return catalog.machines.find((machine) => machine.type === type
    && (rarity === null || catalog.byId.get(machine.itemId)?.rarity === rarity));
}

function addOilPlayer(store, name, itemCounts = new Map(), options = {}) {
  const player = createPlayer(name, '', 'hash', catalog, 1000, () => 0.5);
  player.profession = options.profession ?? 10;
  player.cityId = options.cityId ?? 2;
  player.inventoryByCity[2] = {};
  for (const [item, quantity] of itemCounts) player.inventoryByCity[2][item.id] = quantity;
  player.inventory = player.inventoryByCity[player.cityId] ?? {};
  return store.addPlayer(player);
}

function fieldHex(field, x, y) {
  return field.hexes.find((hex) => hex.x === x && hex.y === y);
}

function oilLitersInDatabase(store, hexId) {
  return store.database.prepare('SELECT oil_units FROM oil_hexes WHERE id = ?').get(hexId).oil_units / 180;
}

test('keeps asynchronous password hashing compatible without blocking server callers', async () => {
  const synchronous = hashPassword('correct horse battery', 'fixed-salt');
  const asynchronous = await hashPasswordAsync('correct horse battery', 'fixed-salt');
  assert.equal(asynchronous, synchronous);
  assert.equal(await verifyPasswordAsync('correct horse battery', synchronous), true);
  assert.equal(await verifyPasswordAsync('wrong password', synchronous), false);
});

test('detonates BLU-82 atomically without rewriting unrelated player state', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const blu82 = catalog.items.find((item) => item.name === 'BLU-82');
  const base = createPlayer('Atomic Blaster', '', 'hash', catalog, 1000, () => 0.5);
  base.inventory[blu82.id] = 1;
  const expected = structuredClone(base);
  const expectedResult = detonateExplosive(expected, catalog, 1, blu82.id, 1, 2000, () => 0.5);
  const saved = store.addPlayer(base);
  const findingRevision = store.latestLiveUpdateId();

  const detonationStarted = performance.now();
  const actual = store.detonateMine(saved.id, 1, blu82.id, 1, catalog, 2000, () => 0.5);
  assert.ok(performance.now() - detonationStarted < 5000,
    'grouped explosive persistence stays bounded at legacy BLU-82 scale');
  const restored = store.playerById(saved.id, 2000);
  assert.equal(actual.buckets, expectedResult.buckets);
  assert.equal(actual.outputCount, expectedResult.outputCount);
  assert.equal(actual.findCount, expectedResult.finds.length);
  assert.equal(actual.finds.reduce((sum, group) => sum + group.count, 0), expectedResult.finds.length);
  assert.equal(actual.findingEvents.reduce((sum, event) => sum + event.quantity, 0),
    actual.findCount, 'reported explosive findings match the number actually found');
  assert.ok(actual.findingEvents.every((event) => Number.isSafeInteger(event.eventId)));
  assert.deepEqual(restored.inventory, expected.inventory);
  assert.deepEqual(restored.discoveries, expected.discoveries.map(({ recycled: _recycled, ...discovery }) => discovery));
  assert.equal(restored.mines.length, base.mines.length);
  assert.ok(store.stonesForPlayer(saved.id).earned.some((stone) => stone.name === 'Detonated'));
  assert.ok(store.stonesForPlayer(saved.id).earned.some((stone) => stone.name === 'Demolished'));
  const findingEvents = store.liveUpdatesAfter(findingRevision).filter((event) =>
    event.scope === `player:${saved.id}` && event.eventType === 'items-found'
      && event.payload.source === 'explosives');
  assert.equal(findingEvents.length, actual.finds.length,
    'explosive findings are published immediately by item group');
  assert.ok(findingEvents.every((event) => event.payload.quantity >= 1
    && event.payload.path === `/items/${event.payload.itemId}`));

  const generatedItemId = actual.finds[0].itemId;
  const generatedBeforeRecycle = restored.inventory[generatedItemId] ?? 0;
  store.database.prepare(`
    INSERT INTO inventory (player_id, city_id, item_id, quantity) VALUES (?, ?, ?, 1)
  `).run(saved.id, restored.cityId, blu82.id);
  assert.deepEqual(store.setRecyclePreferences(saved.id, [generatedItemId], 2500), [generatedItemId]);
  const recycleRevision = store.latestLiveUpdateId();
  const protectedFinds = store.detonateMine(saved.id, 1, blu82.id, 1, catalog, 3000, () => 0.5);
  assert.equal(protectedFinds.finds.reduce((sum, group) => sum + group.count, 0), protectedFinds.findCount);
  assert.ok(protectedFinds.finds.every((group) => group.recycled));
  assert.equal(store.playerById(saved.id, 3000).inventory[generatedItemId] ?? 0,
    generatedBeforeRecycle);
  const recycleEvents = store.liveUpdatesAfter(recycleRevision).filter((event) =>
    event.eventType === 'items-found' && event.payload.source === 'explosives');
  assert.equal(recycleEvents.length, protectedFinds.finds.length);
  assert.ok(recycleEvents.every((event) => event.payload.autoRecycled));
});

test('publishes grouped findings immediately without a lease or acknowledgement queue', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const saved = store.addPlayer(createPlayer('Immediate Finder', '', 'hash', catalog, 1000, () => 0.5));
  const common = catalog.items.find((item) => item.rarity === 1);
  const rare = catalog.items.find((item) => item.rarity === 6);
  const revision = store.latestLiveUpdateId();
  store.savePlayer(store.playerById(saved.id), {
    source: 'explosives', recordedAt: 31000, findings: [
      { itemId: common.id, quantity: 1, cityId: saved.cityId, foundAt: 1000 },
      { itemId: rare.id, quantity: 2, cityId: saved.cityId, foundAt: 30000 },
      { itemId: rare.id, quantity: 3, cityId: saved.cityId, foundAt: 31000 }
    ]
  });

  const events = store.liveUpdatesAfter(revision).filter((event) =>
    event.scope === `player:${saved.id}` && event.eventType === 'items-found');
  assert.equal(events.length, 2);
  assert.equal(events.find((event) => event.payload.itemId === rare.id).payload.quantity, 5);
  assert.equal(events.find((event) => event.payload.itemId === common.id).payload.quantity, 1);
  assert.ok(events.every((event) => event.changedAt === 31000));
  assert.equal(store.database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'finding_queue'"
  ).get(), undefined);
  assert.equal(typeof store.leaseFindings, 'undefined');
  assert.equal(typeof store.acknowledgeFindings, 'undefined');
});

test('settles due local and remote mines once and publishes their immediate findings', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const player = createPlayer('Automatic Miner', '', 'hash', catalog, 1000, () => 0.5);
  const localMine = player.mines[0];
  const remoteCity = catalog.cities.find((city) => city.id !== player.cityId);
  const remoteMineType = catalog.mineTypes.find((type) => type.id !== localMine.mineTypeId
    && catalog.byMineType.get(type.id)?.size);
  assert.ok(remoteCity && remoteMineType);
  localMine.nextFindAt = 2000;
  player.mines.push({
    ...structuredClone(localMine), id: 2, mineTypeId: remoteMineType.id,
    cityId: remoteCity.id, priority: 2, nextFindAt: 2000
  });
  player.nextMineId = 3;
  player.inventoryByCity[remoteCity.id] = {};
  const saved = store.addPlayer(player);
  store.setRecyclePreferences(saved.id,
    [...catalog.byMineType.get(remoteMineType.id).values()].flat().map((item) => item.id), 1999);
  const before = store.playerById(saved.id, 1999, { settle: false });
  const beforeDiscoveries = before.discoveries.length;
  const beforeLocalItems = Object.values(before.inventoryByCity[player.cityId])
    .reduce((sum, quantity) => sum + quantity, 0);
  const revision = store.latestLiveUpdateId();

  const settled = store.settleMines(2000, () => 0.5);
  assert.deepEqual(settled, { players: 1, mines: 2, findings: 2, gold: 0, dwarves: 0 });
  const restored = store.playerById(saved.id, 2000, { settle: false });
  assert.equal(restored.discoveries.length, beforeDiscoveries + 2);
  assert.equal(Object.values(restored.inventoryByCity[player.cityId])
    .reduce((sum, quantity) => sum + quantity, 0), beforeLocalItems + 1);
  assert.equal(Object.values(restored.inventoryByCity[remoteCity.id] ?? {})
    .reduce((sum, quantity) => sum + quantity, 0), 0,
  'the remote mine\'s auto-recycled find never enters inventory');
  assert.ok(restored.mines.every((mine) => mine.nextFindAt > 2000));
  const events = store.liveUpdatesAfter(revision).filter((event) =>
    event.scope === `player:${saved.id}` && event.eventType === 'items-found');
  assert.equal(events.length, 2);
  assert.deepEqual(new Set(events.map((event) => event.payload.cityId)),
    new Set([player.cityId, remoteCity.id]));
  assert.equal(events.find((event) => event.payload.cityId === remoteCity.id)
    .payload.autoRecycled, true);

  const nextClocks = restored.mines.map((mine) => mine.nextFindAt);
  assert.deepEqual(store.settleMines(2000),
    { players: 0, mines: 0, findings: 0, gold: 0, dwarves: 0 });
  const unchanged = store.playerById(saved.id, 2000, { settle: false });
  assert.equal(unchanged.discoveries.length, restored.discoveries.length);
  assert.deepEqual(unchanged.mines.map((mine) => mine.nextFindAt), nextClocks);
  assert.equal(store.liveUpdatesAfter(revision).filter((event) =>
    event.eventType === 'items-found').length, 2);

  store.database.prepare(`
    UPDATE mines SET rental_until = 2500, next_find_at = 999999
    WHERE player_id = ? AND id = 2
  `).run(saved.id);
  assert.deepEqual(store.settleMines(2500),
    { players: 1, mines: 0, findings: 0, gold: 0, dwarves: 0 });
  assert.equal(store.playerById(saved.id, 2500, { settle: false })
    .mines.some((mine) => mine.id === 2), false,
  'expired rentals are removed even when they are not due to find');
});

test('uses the live database label in immediate finding events without a city', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const saved = store.addPlayer(createPlayer('Open Water Finder', '', 'hash', catalog, 1000,
    () => 0.5));
  store.database.prepare(
    'UPDATE catalog_settings SET value_json = ? WHERE key = ?'
  ).run(JSON.stringify({ atSea: 'Live open water' }), 'location_labels');
  const revision = store.latestLiveUpdateId();
  store.savePlayer(store.playerById(saved.id), {
    source: 'salvage', recordedAt: 1000,
    findings: [{ itemId: catalog.items[0].id, quantity: 1, cityId: null, foundAt: 1000 }]
  });

  const event = store.liveUpdatesAfter(revision).find((entry) => entry.eventType === 'items-found');
  assert.equal(event.payload.cityId, null);
  assert.equal(event.payload.cityName, 'Live open water');
});

test('fresh transactional player mutations cannot overwrite a background mine settlement', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const player = createPlayer('Concurrent Miner', '', 'hash', catalog, 1000, () => 0.5);
  player.mines[0].nextFindAt = 2000;
  const saved = store.addPlayer(player);
  const staleRequest = store.playerById(saved.id, 1999, { settle: false });

  store.settleMines(2000, () => 0.5);
  const settled = store.playerById(saved.id, 2000, { settle: false });
  staleRequest.description = 'Changed by an older request';
  store.mutatePlayer(saved.id, (current) => {
    current.description = staleRequest.description;
  }, null, 2001);

  const restored = store.playerById(saved.id, 2001, { settle: false });
  assert.equal(restored.description, staleRequest.description);
  assert.deepEqual(restored.inventoryByCity, settled.inventoryByCity);
  assert.deepEqual(restored.discoveries, settled.discoveries);
  assert.deepEqual(restored.mines.map((mine) => mine.nextFindAt),
    settled.mines.map((mine) => mine.nextFindAt));
});

test('persists new-mine findings with the mine and inventory mutation', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const saved = store.addPlayer(createPlayer('Queued Mine Buyer', '', 'hash', catalog, 1000, () => 0.5));
  const buyer = store.playerById(saved.id, 1000);
  buyer.credits = 1000;
  const mine = buyMine(buyer, catalog, 4, 2000, () => 0.5);
  const findings = buyer.discoveries.filter((finding) => finding.mineId === mine.id);
  const revision = store.latestLiveUpdateId();
  store.savePlayer(buyer, { source: 'new-mine', findings, queuedAt: 2000 });

  const events = store.liveUpdatesAfter(revision).filter((event) =>
    event.eventType === 'items-found' && event.payload.source === 'new-mine');
  assert.equal(events.reduce((sum, event) => sum + event.payload.quantity, 0), 5);
  const restored = store.playerById(saved.id, 32000);
  assert.ok(restored.mines.some((entry) => entry.id === mine.id));
  assert.equal(Object.values(restored.inventory).reduce((sum, quantity) => sum + quantity, 0), 10);
});

test('buckets durable findings by their Europe/London day and never digests the current day', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const createdAt = Date.parse('2026-08-23T12:00:00.000Z');
  const player = store.addPlayer(createPlayer(
    'London Day Miner', '', 'hash', catalog, createdAt, () => 0.5
  ));
  store.database.prepare('DELETE FROM finding_events WHERE player_id = ?').run(player.id);

  const item = catalog.items.find((candidate) => candidate.canFind && candidate.rarity === 1);
  const beforeLondonMidnight = Date.parse('2026-08-23T22:59:59.999Z');
  const atLondonMidnight = Date.parse('2026-08-23T23:00:00.000Z');
  store.savePlayer(store.playerById(player.id, atLondonMidnight, { settle: false }), {
    source: 'mine', recordedAt: atLondonMidnight + 1,
    findings: [
      {
        itemId: item.id, quantity: 1, cityId: player.cityId,
        foundAt: beforeLondonMidnight
      },
      {
        itemId: item.id, quantity: 2, cityId: player.cityId,
        foundAt: atLondonMidnight
      }
    ]
  });

  const rows = store.database.prepare(`
    SELECT day_key, quantity, found_at FROM finding_events
    WHERE player_id = ? ORDER BY found_at
  `).all(player.id).map((row) => ({ ...row }));
  assert.deepEqual(rows, [
    { day_key: '2026-08-23', quantity: 1, found_at: beforeLondonMidnight },
    { day_key: '2026-08-24', quantity: 2, found_at: atLondonMidnight }
  ]);

  const first = store.sendDailyFindingDigests(atLondonMidnight);
  assert.equal(first.currentDayKey, '2026-08-24');
  assert.equal(first.calendarZone, 'Europe/London');
  assert.equal(first.messages, 1);
  assert.equal(first.findings, 1);
  assert.deepEqual(first.deliveries.map((delivery) => [
    delivery.dayKey, delivery.sequence, delivery.totalQuantity
  ]), [['2026-08-23', 1, 1]]);
  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count FROM finding_events
    WHERE player_id = ? AND day_key = '2026-08-24' AND delivery_id IS NULL
  `).get(player.id).count, 1, 'the current London day remains open');
  assert.equal(store.sendDailyFindingDigests(atLondonMidnight + 1).messages, 0);

  const nextLondonMidnight = Date.parse('2026-08-24T23:00:00.000Z');
  const second = store.sendDailyFindingDigests(nextLondonMidnight);
  assert.equal(second.currentDayKey, '2026-08-25');
  assert.deepEqual(second.deliveries.map((delivery) => [
    delivery.dayKey, delivery.sequence, delivery.totalQuantity
  ]), [['2026-08-24', 1, 2]]);
  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count FROM finding_events
    WHERE player_id = ? AND delivery_id IS NULL
  `).get(player.id).count, 0);
});

test('builds rich idempotent daily findings digests and supplements late findings', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const foundAt = Date.parse('2026-08-24T12:00:00.000Z');
  const digestAt = Date.parse('2026-08-25T00:00:00.000Z');
  const player = store.addPlayer(createPlayer(
    'Digest Miner', '', 'hash', catalog, foundAt, () => 0.5
  ));
  store.database.prepare('DELETE FROM finding_events WHERE player_id = ?').run(player.id);
  const kept = catalog.items.find((item) => item.canFind && item.rarity === 1);
  const bounty = catalog.items.find((item) => item.canFind && item.rarity === 6);

  store.savePlayer(store.playerById(player.id, foundAt, { settle: false }), {
    source: 'mine', recordedAt: digestAt,
    findings: [
      { itemId: kept.id, quantity: 2, cityId: player.cityId, foundAt },
      {
        itemId: kept.id, quantity: 3, cityId: player.cityId,
        foundAt: foundAt + 1, recycled: true
      },
      {
        itemId: bounty.id, quantity: 1, cityId: null, foundAt: foundAt + 2,
        source: 'creature-bounty', sourceName: 'Creature bounty',
        status: 'Loaded into vehicle cargo'
      },
      { cryptoTypeId: 1, quantity: 4, cityId: player.cityId, foundAt: foundAt + 3 }
    ]
  });

  const durableRows = store.database.prepare(`
    SELECT item_id, quantity, city_id, city_name, source, source_name,
      auto_recycled, status, day_key, calendar_zone
    FROM finding_events WHERE player_id = ? ORDER BY id
  `).all(player.id);
  assert.equal(durableRows.length, 4);
  assert.deepEqual(durableRows.map((row) => [row.item_id, row.quantity, row.auto_recycled]), [
    [kept.id, 2, 0], [kept.id, 3, 1], [bounty.id, 1, 0], [-1, 4, 0]
  ]);
  assert.equal(durableRows[2].city_id, null);
  assert.equal(durableRows[2].city_name, catalog.settings.location_labels.atSea);
  assert.equal(durableRows[2].source, 'creature-bounty');
  assert.equal(durableRows[2].source_name, 'Creature bounty');
  assert.equal(durableRows[2].status, 'Loaded into vehicle cargo');
  assert.ok(durableRows.every((row) => row.day_key === '2026-08-24'
    && row.calendar_zone === 'Europe/London'));

  const first = store.sendDailyFindingDigests(digestAt);
  assert.equal(first.messages, 1);
  assert.equal(first.findings, 10);
  assert.deepEqual(first.deliveries.map((delivery) => ({
    dayKey: delivery.dayKey, sequence: delivery.sequence,
    totalQuantity: delivery.totalQuantity
  })), [{ dayKey: '2026-08-24', sequence: 1, totalQuantity: 10 }]);
  assert.deepEqual(store.sendDailyFindingDigests(digestAt), {
    currentDayKey: '2026-08-25', calendarZone: 'Europe/London',
    messages: 0, findings: 0, deliveries: []
  });

  const firstMessage = store.recentMessages(player.id, 'all', 'Findings')[0];
  assert.equal(firstMessage.messageType, 'Findings');
  assert.match(firstMessage.subject, /^Daily findings/);
  assert.equal(firstMessage.details.event, 'daily-findings-digest');
  assert.equal(firstMessage.details.dayKey, '2026-08-24');
  assert.equal(firstMessage.details.sequence, 1);
  assert.equal(firstMessage.details.supplemental, false);
  assert.equal(firstMessage.details.totalQuantity, 10);
  assert.equal(firstMessage.details.thingQuantity, 6);
  assert.equal(firstMessage.details.cryptoQuantity, 4);
  assert.equal(firstMessage.details.keptQuantity, 3);
  assert.equal(firstMessage.details.autoRecycledQuantity, 3);
  assert.equal(firstMessage.details.distinctItemCount, 2);
  assert.equal(firstMessage.details.distinctCryptoCount, 1);
  assert.equal(firstMessage.details.locationCount, 2);
  assert.equal(firstMessage.details.bestRarityName, bounty.rarityName);
  assert.deepEqual(firstMessage.details.keptFindings.map((entry) => [
    entry.itemId, entry.quantity
  ]).sort((left, right) => left[0] - right[0]), [
    [kept.id, 2], [bounty.id, 1]
  ].sort((left, right) => left[0] - right[0]));
  assert.deepEqual(firstMessage.details.autoRecycledFindings.map((entry) => [
    entry.itemId, entry.quantity
  ]), [[kept.id, 3]]);
  assert.deepEqual(firstMessage.details.cryptoFindings.map((entry) => [
    entry.cryptoTypeId, entry.name, entry.quantity, entry.path
  ]), [[1, 'Aso Coin', 4, '/crypto']]);
  assert.deepEqual(new Map(firstMessage.details.sourceCounts.map((entry) => [
    entry.source, entry.quantity
  ])), new Map([['mine', 9], ['creature-bounty', 1]]));
  assert.deepEqual(new Map(firstMessage.details.locationCounts.map((entry) => [
    entry.cityName, entry.quantity
  ])), new Map([[catalog.cities.find((city) => city.id === player.cityId).name, 9],
    [catalog.settings.location_labels.atSea, 1]]));
  assert.deepEqual(firstMessage.details.locationCounts.map((entry) => [
    entry.cityName, entry.thingQuantity, entry.cryptoQuantity
  ]), [
    [catalog.cities.find((city) => city.id === player.cityId).name, 5, 4],
    [catalog.settings.location_labels.atSea, 1, 0]
  ].sort((left, right) => left[0].localeCompare(right[0], 'en-GB')));
  const firstDelivery = store.database.prepare(`
    SELECT * FROM finding_digest_deliveries
    WHERE player_id = ? AND day_key = '2026-08-24' AND sequence = 1
  `).get(player.id);
  assert.equal(firstDelivery.message_id, firstMessage.id);
  assert.deepEqual(JSON.parse(firstDelivery.details_json), firstMessage.details);
  assert.equal(store.database.prepare(`
    SELECT COUNT(DISTINCT delivery_id) AS count FROM finding_events WHERE player_id = ?
  `).get(player.id).count, 1);

  const lateFoundAt = foundAt + 60 * 60 * 1000;
  store.savePlayer(store.playerById(player.id, digestAt, { settle: false }), {
    source: 'salvage', recordedAt: digestAt + 1,
    findings: [{
      itemId: bounty.id, quantity: 2, cityId: null, foundAt: lateFoundAt,
      status: 'Loaded into ship cargo'
    }]
  });
  const supplemental = store.sendDailyFindingDigests(digestAt + 2);
  assert.deepEqual(supplemental.deliveries.map((delivery) => [
    delivery.dayKey, delivery.sequence, delivery.totalQuantity
  ]), [['2026-08-24', 2, 2]]);
  assert.equal(store.sendDailyFindingDigests(digestAt + 3).messages, 0);

  const deliveries = store.database.prepare(`
    SELECT sequence, details_json FROM finding_digest_deliveries
    WHERE player_id = ? AND day_key = '2026-08-24' ORDER BY sequence
  `).all(player.id);
  assert.equal(deliveries.length, 2);
  assert.equal(JSON.parse(deliveries[0].details_json).totalQuantity, 10,
    'the first delivery remains an immutable snapshot');
  const additional = JSON.parse(deliveries[1].details_json);
  assert.equal(additional.sequence, 2);
  assert.equal(additional.supplemental, true);
  assert.equal(additional.totalQuantity, 2);
  assert.deepEqual(additional.sourceCounts.map((entry) => [entry.source, entry.quantity]),
    [['salvage', 2]]);
  const messages = store.recentMessages(player.id, 'all', 'Findings');
  assert.equal(messages.length, 2);
  assert.match(messages[0].subject, /^Additional findings/);
});

test('delivers old-zone rows after a setting change and preserves retired item snapshots', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const foundAt = Date.parse('2026-08-24T12:00:00.000Z');
  const player = store.addPlayer(createPlayer(
    'Zone Change Miner', '', 'hash', catalog, foundAt, () => 0.5
  ));
  store.database.prepare('DELETE FROM finding_events WHERE player_id = ?').run(player.id);
  const item = catalog.items.find((candidate) => candidate.canFind && candidate.rarity === 2);
  store.savePlayer(store.playerById(player.id, foundAt, { settle: false }), {
    source: 'mine', recordedAt: foundAt,
    findings: [{ itemId: item.id, quantity: 1, cityId: player.cityId, foundAt }]
  });

  store.database.prepare(`
    UPDATE catalog_settings SET value_json = '"UTC"'
    WHERE key = 'daily_findings_timezone'
  `).run();
  const changedZoneDelivery = store.sendDailyFindingDigests(
    Date.parse('2026-08-25T00:00:00.000Z')
  );
  assert.equal(changedZoneDelivery.messages, 1);
  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count FROM finding_events
    WHERE player_id = ? AND calendar_zone = 'Europe/London' AND delivery_id IS NULL
  `).get(player.id).count, 0, 'changing the setting cannot strand an old-zone row');

  store.database.prepare(`
    UPDATE catalog_settings SET value_json = '"Not/A_Time_Zone"'
    WHERE key = 'daily_findings_timezone'
  `).run();
  const archivedItemId = 999999;
  const archivedFoundAt = Date.parse('2026-08-25T12:00:00.000Z');
  assert.doesNotThrow(() => store.savePlayer(
    store.playerById(player.id, archivedFoundAt, { settle: false }), {
      source: 'mine', recordedAt: archivedFoundAt,
      findings: [{
        itemId: archivedItemId, name: 'Archived Test Relic',
        icon: '/node/favicon.svg', rarity: 5, rarityName: 'Purple',
        quantity: 2, cityId: player.cityId, foundAt: archivedFoundAt
      }]
    }
  ), 'a bad presentation time-zone setting must not roll back a find');
  const archivedRow = store.database.prepare(`
    SELECT * FROM finding_events WHERE player_id = ? AND item_id = ?
  `).get(player.id, archivedItemId);
  assert.equal(archivedRow.item_name, 'Archived Test Relic');
  assert.equal(archivedRow.calendar_zone, 'Europe/London');
  assert.equal(store.liveUpdatesAfter(0).some((event) =>
    event.eventType === 'items-found' && event.payload.itemId === archivedItemId), false,
  'a retired item has no immediate catalog-backed popup');

  const archivedDelivery = store.sendDailyFindingDigests(
    Date.parse('2026-08-25T23:00:00.000Z')
  );
  assert.equal(archivedDelivery.messages, 1);
  const archivedMessage = store.recentMessages(player.id, 'all', 'Findings')[0];
  assert.deepEqual(archivedMessage.details.keptFindings.map((entry) => ({
    itemId: entry.itemId, name: entry.name, icon: entry.icon,
    rarity: entry.rarity, rarityName: entry.rarityName, quantity: entry.quantity
  })), [{
    itemId: archivedItemId, name: 'Archived Test Relic', icon: '/node/favicon.svg',
    rarity: 5, rarityName: 'Purple', quantity: 2
  }]);
});

test('maintenance still delivers recorded findings when another subsystem fails', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-digest-worker-'));
  const databaseFile = path.join(directory, 'game.sqlite');
  const store = new SqliteStore(databaseFile, { busyTimeoutMs: 1000 });
  store.seedCatalog(catalog);
  const foundAt = Date.parse('2026-08-24T12:00:00.000Z');
  const player = store.addPlayer(createPlayer(
    'Resilient Digest Miner', '', 'hash', catalog, foundAt, () => 0.5
  ));
  // Force the world-event phase, which precedes digest delivery, to fail.
  store.database.exec('DROP TABLE world_creature_roll_clock');
  const worker = new Worker(new URL('../src/maintenance-worker.js', import.meta.url), {
    workerData: { databaseFile, busyTimeoutMs: 1000 }
  });
  context.after(async () => {
    await worker.terminate();
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const tick = await new Promise((resolve, reject) => {
    worker.once('message', resolve);
    worker.once('error', reject);
    worker.postMessage({ type: 'tick', now: Date.parse('2026-08-25T00:00:00.000Z') });
  });
  assert.equal(tick.type, 'tick-error');
  assert.equal(tick.findingDigests.messages, 1);
  assert.equal(store.recentMessages(player.id, 'all', 'Findings').length, 1);
  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count FROM finding_events
    WHERE player_id = ? AND day_key < '2026-08-25' AND delivery_id IS NULL
  `).get(player.id).count, 0);
});

test('creates the v89 findings ledger and digest schema on a fresh database', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  assert.equal(store.database.prepare('PRAGMA user_version').get().user_version, 112);
  const findingColumns = store.database.prepare('PRAGMA table_info(finding_events)')
    .all().map((column) => column.name);
  assert.deepEqual(findingColumns, [
    'id', 'player_id', 'item_id', 'item_name', 'item_icon', 'rarity', 'rarity_name',
    'quantity', 'city_id', 'city_name', 'source', 'source_name', 'found_at', 'recorded_at',
    'day_key', 'calendar_zone', 'auto_recycled', 'status', 'delivery_id'
  ]);
  assert.deepEqual(store.database.prepare('PRAGMA table_info(finding_digest_deliveries)')
    .all().map((column) => column.name), [
    'id', 'player_id', 'day_key', 'calendar_zone', 'sequence', 'message_id',
    'sent_at', 'details_json'
  ]);
  for (const index of ['finding_events_unsent_day', 'finding_events_player_time',
    'finding_digest_deliveries_player_day']) {
    assert.ok(store.database.prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = ?"
    ).get(index), `${index} is present`);
  }
  assert.equal(JSON.parse(store.database.prepare(`
    SELECT value_json FROM catalog_settings WHERE key = 'daily_findings_timezone'
  `).get().value_json), 'Europe/London');
  assert.equal(JSON.parse(store.database.prepare(`
    SELECT value_json FROM catalog_settings WHERE key = 'daily_findings_digest_batch_size'
  `).get().value_json), 100);
  assert.equal(store.database.prepare('PRAGMA foreign_key_check').get(), undefined);
});

test('migrates v109 databases to the starter welcome-pack setting without backfilling miners', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-welcome-pack-v109-'));
  const databaseFile = path.join(directory, 'game.sqlite');
  let store = new SqliteStore(databaseFile);
  context.after(() => {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  store.seedCatalog(catalog);
  const existing = store.addPlayer(createPlayer(
    'Existing Miner', '', 'hash', catalog, 1000, () => 0.5
  ));
  store.database.prepare(
    'DELETE FROM inventory WHERE player_id = ? AND item_id = ?'
  ).run(existing.id, LEGACY_STARTER_WELCOME_PACK.vehicleItemId);
  store.database.prepare(
    'DELETE FROM player_crypto_balances WHERE player_id = ? AND crypto_type_id = ?'
  ).run(existing.id, LEGACY_STARTER_WELCOME_PACK.cryptoTypeId);
  store.database.exec(`
    DELETE FROM catalog_settings WHERE key = 'starter_welcome_pack';
    PRAGMA user_version = 109;
  `);
  store.close();

  store = new SqliteStore(databaseFile);
  assert.equal(store.database.prepare('PRAGMA user_version').get().user_version, 112);
  assert.deepEqual(JSON.parse(store.database.prepare(`
    SELECT value_json FROM catalog_settings WHERE key = 'starter_welcome_pack'
  `).get().value_json), LEGACY_STARTER_WELCOME_PACK);
  const unchanged = store.playerById(existing.id);
  assert.equal(unchanged.inventory[LEGACY_STARTER_WELCOME_PACK.vehicleItemId], undefined);
  assert.equal(unchanged.cryptoBalances[LEGACY_STARTER_WELCOME_PACK.cryptoTypeId], undefined);
});

test('migrates v103 databases to the creature attack-name catalog setting', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-creature-attacks-v103-'));
  const databaseFile = path.join(directory, 'game.sqlite');
  let store = new SqliteStore(databaseFile);
  context.after(() => {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  store.seedCatalog(catalog);
  store.database.exec(`
    DELETE FROM catalog_settings WHERE key = 'world_creature_attack_names';
    PRAGMA user_version = 103;
  `);
  store.close();

  store = new SqliteStore(databaseFile);
  assert.equal(store.database.prepare('PRAGMA user_version').get().user_version, 112);
  const attackNames = JSON.parse(store.database.prepare(`
    SELECT value_json FROM catalog_settings WHERE key = 'world_creature_attack_names'
  `).get().value_json);
  assert.deepEqual(attackNames, catalog.settings.world_creature_attack_names);
  assert.deepEqual(store.loadCatalog().settings.world_creature_attack_names, attackNames);
  assert.ok(store.database.prepare('PRAGMA table_info(world_creatures)').all()
    .some((column) => column.name === 'rating'));
  const creatureAttackColumns = new Set(store.database.prepare(
    'PRAGMA table_info(world_creature_attacks)'
  ).all().map((column) => column.name));
  for (const column of ['vehicle_rating_before', 'vehicle_rating_after',
    'creature_rating_before', 'creature_rating_after']) {
    assert.ok(creatureAttackColumns.has(column), `${column} is present`);
  }
});

test('migrates a v88 database to the durable findings digest schema exactly once', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-findings-v88-'));
  const databaseFile = path.join(directory, 'game.sqlite');
  let store = new SqliteStore(databaseFile);
  context.after(() => {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  store.seedCatalog(catalog);
  const player = store.addPlayer(createPlayer(
    'Version Eighty Eight', '', 'hash', catalog, 1000, () => 0.5
  ));
  const liveMarker = store.database.prepare(`
    INSERT INTO live_update_events (scope, changed_at, event_type, payload_json)
    VALUES ('player:test', 1234, 'migration-marker', '{"preserved":true}')
  `).run();
  const liveMarkerId = Number(liveMarker.lastInsertRowid);
  store.database.exec(`
    DROP TABLE finding_events;
    DROP TABLE finding_digest_deliveries;
    DELETE FROM catalog_settings WHERE key IN (
      'daily_findings_timezone', 'daily_findings_digest_batch_size'
    );
    PRAGMA user_version = 88;
  `);
  store.close();

  store = new SqliteStore(databaseFile);
  assert.equal(store.database.prepare('PRAGMA user_version').get().user_version, 112);
  assert.ok(store.database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'finding_events'"
  ).get());
  assert.ok(store.database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'finding_digest_deliveries'"
  ).get());
  assert.equal(store.database.prepare('SELECT COUNT(*) AS count FROM finding_events').get().count, 0,
    'migration does not pretend transient v88 events were durable findings');
  assert.deepEqual({ ...store.database.prepare(`
    SELECT scope, changed_at, event_type, payload_json
    FROM live_update_events WHERE id = ?
  `).get(liveMarkerId) }, {
    scope: 'player:test', changed_at: 1234, event_type: 'migration-marker',
    payload_json: '{"preserved":true}'
  }, 'existing live-update transport history is preserved');
  assert.equal(store.playerById(player.id, 1000, { settle: false }).name, 'Version Eighty Eight');
  assert.equal(JSON.parse(store.database.prepare(`
    SELECT value_json FROM catalog_settings WHERE key = 'daily_findings_timezone'
  `).get().value_json), 'Europe/London');
  store.close();

  store = new SqliteStore(databaseFile);
  assert.equal(store.database.prepare('PRAGMA user_version').get().user_version, 112);
  assert.equal(store.database.prepare(
    "SELECT COUNT(*) AS count FROM catalog_settings WHERE key LIKE 'daily_findings_%'"
  ).get().count, 2, 'reopening v89 does not replay the migration');
  assert.equal(store.database.prepare(
    'SELECT COUNT(*) AS count FROM finding_digest_deliveries'
  ).get().count, 0);
});

test('persists normalized player state in SQLite', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-store-'));
  const databaseFile = path.join(directory, 'game.sqlite');
  const store = new SqliteStore(databaseFile);
  context.after(() => {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const saved = store.addPlayer(createPlayer('Ada', 'ada@example.test', 'hash', catalog, 1000, () => 0.5));
  saved.credits = 321;
  store.savePlayer(saved);

  const restored = store.findPlayer('aDA');
  assert.equal(store.countPlayers(), 1);
  assert.equal(restored.credits, 321);
  assert.equal(restored.mines.length, 1);
  assert.equal(restored.discoveries.length, 5);
  assert.equal(Object.values(restored.inventory).reduce((total, count) => total + count, 0), 5);
  assert.equal(fs.readFileSync(databaseFile, 'utf8').slice(0, 15), 'SQLite format 3');
});

test('migrates legacy state and all live catalog data to the current schema', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-discovery-city-'));
  const databaseFile = path.join(directory, 'game.sqlite');
  let store = new SqliteStore(databaseFile);
  context.after(() => {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  store.seedCatalog(catalog);
  const saved = store.addPlayer(createPlayer('City History', '', 'hash', catalog, 1000, () => 0.5));
  store.database.exec(`
    DROP INDEX IF EXISTS discoveries_player_dwarf_found;
    ALTER TABLE discoveries DROP COLUMN city_id;
    ALTER TABLE catalog_gadgets DROP COLUMN behavior_key;
    ALTER TABLE catalog_stones DROP COLUMN behavior_key;
    ALTER TABLE catalog_stones DROP COLUMN rarity;
    ALTER TABLE catalog_factory_actions DROP COLUMN award_stone_behavior_key;
    PRAGMA user_version = 29;
  `);
  store.close();

  store = new SqliteStore(databaseFile);
  assert.equal(store.database.prepare('PRAGMA user_version').get().user_version, 112);
  for (const table of ['catalog_rarities', 'catalog_equipment_types', 'catalog_bot_parts',
    'catalog_specialisations', 'catalog_specialisation_bonuses', 'catalog_dwarf_tiers',
    'catalog_settings', 'catalog_labels', 'external_auth_identities', 'combat_seasons',
    'combat_season_results']) {
    assert.ok(store.database.prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?"
    ).get(table), `${table} is present`);
  }
  assert.ok(store.database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'meld_stash'"
  ).get());
  assert.ok(store.database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'protected_inventory'"
  ).get());
  assert.ok(store.database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'factory_queue'"
  ).get());
  assert.ok(store.database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'specialisation_tenure'"
  ).get());
  assert.ok(store.database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'live_update_events'"
  ).get());
  const liveUpdateColumns = new Set(store.database.prepare(
    'PRAGMA table_info(live_update_events)'
  ).all().map((column) => column.name));
  assert.ok(liveUpdateColumns.has('event_type'));
  assert.ok(liveUpdateColumns.has('payload_json'));
  assert.equal(store.database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'finding_queue'"
  ).get(), undefined);
  assert.ok(store.database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'mines_due_settlement'"
  ).get());
  assert.ok(store.database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'world_chat_announcements'"
  ).get());
  assert.ok(new Set(store.database.prepare('PRAGMA table_info(players)').all()
    .map((column) => column.name)).has('chat_color'));
  assert.ok(new Set(store.database.prepare('PRAGMA table_info(world_chat_announcements)').all()
    .map((column) => column.name)).has('announcement_type'));
  assert.equal(store.database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'trigger' AND name = 'rare_finding_chat_announcement'"
  ).get(), undefined);
  const migratedChatWindow = JSON.parse(store.database.prepare(`
    SELECT value_json FROM catalog_settings WHERE key = 'chat_history_window_ms'
  `).get().value_json);
  const migratedFindingSources = JSON.parse(store.database.prepare(`
    SELECT value_json FROM catalog_settings WHERE key = 'finding_source_names'
  `).get().value_json);
  assert.equal(migratedChatWindow, 24 * 60 * 60 * 1000);
  assert.equal(migratedFindingSources['dwarf-capture'], 'Dwarf capture');
  for (const key of [
    'finding_debounce_ms', 'finding_lease_ms', 'finding_lease_token_max_length',
    'finding_poll_min_interval_ms', 'finding_poll_empty_interval_ms',
    'finding_poll_max_interval_ms'
  ]) {
    assert.equal(store.database.prepare(
      'SELECT 1 FROM catalog_settings WHERE key = ?'
    ).get(key), undefined, `${key} is retired`);
  }
  for (const table of ['world_weather_slots', 'world_creatures',
    'world_creature_attacks', 'vehicle_weather_exposure', 'world_creature_roll_clock']) {
    assert.ok(store.database.prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?"
    ).get(table), `${table} is present`);
  }
  const migratedTenure = store.database.prepare(`
    SELECT specialisation_id, active_ms FROM specialisation_tenure WHERE player_id = ?
  `).get(saved.id);
  assert.equal(migratedTenure.specialisation_id, saved.profession);
  assert.equal(migratedTenure.active_ms, 0);
  assert.equal(JSON.parse(store.database.prepare(
    "SELECT value_json FROM catalog_settings WHERE key = 'factory_queue_limit'"
  ).get().value_json), 10);
  const messageColumns = new Set(store.database.prepare('PRAGMA table_info(messages)').all()
    .map((column) => column.name));
  assert.ok(messageColumns.has('details_json'));
  assert.ok(messageColumns.has('dedupe_key'));
  assert.ok(messageColumns.has('is_kept'));
  assert.ok(store.database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'messages_system_dedupe'"
  ).get());
  assert.ok(store.database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'messages_expiry'"
  ).get());
  assert.equal(JSON.parse(store.database.prepare(
    "SELECT value_json FROM catalog_settings WHERE key = 'message_retention_ms'"
  ).get().value_json), 28 * 24 * 60 * 60 * 1000);
  assert.doesNotMatch(store.database.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'dwarf_stowaways'"
  ).get().sql, /rarity\s+BETWEEN/i);
  for (const table of ['oil_machines', 'oil_machine_queue']) {
    assert.doesNotMatch(store.database.prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?"
    ).get(table).sql, /point\s+BETWEEN/i);
  }
  store.database.prepare(
    "INSERT INTO dwarf_stowaways (rarity, status, created_at) VALUES (91, 'waiting', 1)"
  ).run();
  assert.ok(store.database.prepare('PRAGMA table_info(discoveries)').all()
    .some((column) => column.name === 'city_id'));
  assert.ok(store.database.prepare('PRAGMA table_info(catalog_items)').all()
    .some((column) => column.name === 'gold_value_units'));
  for (const column of ['icon_source', 'is_damaged', 'large_image_filename', 'large_image', 'has_large_image']) {
    assert.ok(store.database.prepare('PRAGMA table_info(catalog_items)').all()
      .some((entry) => entry.name === column));
  }
  for (const column of ['description', 'display_power_multiplier']) {
    assert.ok(store.database.prepare('PRAGMA table_info(catalog_machine_types)').all()
      .some((entry) => entry.name === column));
  }
  assert.ok(store.database.prepare('PRAGMA table_info(catalog_gadgets)').all()
    .some((entry) => entry.name === 'behavior_key'));
  assert.equal(store.database.prepare(
    "SELECT behavior_key FROM catalog_gadgets WHERE name = 'hammer'"
  ).get().behavior_key, 'hammer');
  assert.equal(store.database.prepare(
    "SELECT behavior_key FROM catalog_stones WHERE name = 'Chatted'"
  ).get().behavior_key, 'Chatted');
  assert.ok(store.database.prepare('PRAGMA table_info(catalog_stones)').all()
    .some((entry) => entry.name === 'rarity'));
  for (const column of ['minimum_find_rarity', 'maximum_find_rarity']) {
    assert.ok(store.database.prepare('PRAGMA table_info(catalog_dwarf_tiers)').all()
      .some((entry) => entry.name === column));
  }
  for (const column of ['action_kind', 'output_item_id', 'output_quantity', 'meld_id',
    'award_stone_behavior_key']) {
    assert.ok(store.database.prepare('PRAGMA table_info(catalog_factory_actions)').all()
      .some((entry) => entry.name === column));
  }
  const pumpDescription = store.database.prepare(
    "SELECT description FROM catalog_machine_types WHERE name = 'pump'"
  ).get().description;
  assert.match(pumpDescription, /Pumps oil from the ground/);
  store.database.prepare(
    "UPDATE catalog_machine_types SET description = 'Live custom pump rule' WHERE name = 'pump'"
  ).run();
  store.database.prepare(`
    UPDATE catalog_dwarf_tiers
    SET minimum_find_rarity = 6, maximum_find_rarity = 6 WHERE rarity = 1
  `).run();
  store.close();
  store = new SqliteStore(databaseFile);
  assert.equal(store.database.prepare(
    "SELECT description FROM catalog_machine_types WHERE name = 'pump'"
  ).get().description, 'Live custom pump rule');
  const preservedDwarfRange = store.database.prepare(`
    SELECT minimum_find_rarity, maximum_find_rarity
    FROM catalog_dwarf_tiers WHERE rarity = 1
  `).get();
  assert.equal(preservedDwarfRange.minimum_find_rarity, 6);
  assert.equal(preservedDwarfRange.maximum_find_rarity, 6);
  for (const key of ['oil_item_id', 'ore_item_id', 'bolt_item_id',
    'block_and_tackle_item_id', 'search_plane_item_id', 'bomber_item_id',
    'helicopter_item_id', 'profile_function_mine_type_ids',
    'profile_hidden_mine_type_ids', 'item_value_excluded_mine_type_ids', 'item_value_rules',
    'route_type_ids', 'aircraft_role_ids', 'dwarf_excluded_mine_type_ids',
    'miner_name_min_length', 'miner_name_max_length', 'password_min_length',
    'profile_description_max_length', 'email_max_length', 'gold_transfer_note_max_length',
    'private_message_max_length', 'vehicle_name_max_length', 'chat_history_window_ms',
    'oil_build_tier_ids',
    'oil_helicopter_build_ring_width', 'oil_network_iterations', 'oil_network_source_units',
    'bait_mine_type_id', 'fish_mine_type_id', 'fishing_salvage_distance',
    'default_specialisation_id', 'specialisation_titles', 'weather_slot_ms',
    'weather_change_min_interval_ms', 'weather_change_max_interval_ms',
    'world_creature_roll_min_interval_ms', 'world_creature_roll_max_interval_ms',
    'weather_cambridge_monthly', 'weather_storm_chance_by_month',
    'weather_snow_max_temperature_c', 'weather_hurricane_min_temperature_c',
    'weather_hurricane_chance_by_month', 'hurricane_ship_damage_min_ratio',
    'hurricane_ship_damage_max_ratio', 'hurricane_vehicle_damage_chance',
    'mining_dwarf_capture_chance', 'avatar_any_gender_id',
    'starter_item_limit', 'session_max_age_seconds',
    'dwarf_find_min_delay_ms', 'vehicle_starting_rating',
    'combat_season_months', 'combat_season_places', 'combat_season_prizes',
    'aircraft_shot_down_event_offset_ms', 'ship_critical_damage_multiplier',
    'ship_unarmed_crew_strength',
    'home_recent_discovery_limit', 'home_next_stone_limit', 'meld_search_result_limit',
    'item_search_result_limit', 'profile_inventory_page_size', 'message_preview_length',
    'dwarf_findings_feed_limit', 'dwarf_findings_poll_interval_ms',
    'gadget_report_result_limit', 'factory_market_history_limit',
    'item_market_history_limit', 'mine_market_history_limit', 'oil_event_history_limit',
    'vehicle_event_history_limit', 'miner_search_result_limit', 'message_list_limit',
    'conversation_message_limit', 'stats_new_player_window_ms', 'stats_battle_window_ms',
    'standard_find_min_rarity', 'gold_find_bonus_roll_hit', 'minimum_permanent_mines',
    'fishing_cargo_extra_rarities', 'ship_cannon_rounds_by_rate',
    'ship_meld_min_rarity', 'land_meld_armor_bonus',
    'rank_badge_vehicle_count_step', 'rank_badge_vehicle_count_maximum',
    'ledger_report_labels', 'item_type_labels', 'location_labels']) {
    assert.ok(store.database.prepare('SELECT 1 FROM catalog_settings WHERE key = ?').get(key),
      `${key} is present`);
  }
  assert.ok(store.playerById(saved.id).discoveries.every((finding) => finding.cityId === saved.cityId));
});

test('migrates v84 creatures and their pursuit history into tiered route actors', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-creature-v84-'));
  const databaseFile = path.join(directory, 'creatures.sqlite');
  let store = new SqliteStore(databaseFile);
  context.after(() => {
    try { store.close(); } catch {}
    fs.rmSync(directory, { recursive: true, force: true });
  });
  store.seedCatalog(catalog);
  store.ensureWorldMaps(1000);
  const route = catalog.routes.find((entry) => entry.open && entry.type === 0
    && entry.city1Id !== entry.city2Id && [entry.city1Id, entry.city2Id].includes(1));
  const vehicleType = catalog.vehicles.find((vehicle) => vehicle.routeType === 0);
  const state = createPlayer('V84 Creature Hunter', '', 'hash', catalog, 1000, () => 0.5);
  state.inventory[vehicleType.itemId] = 1;
  const player = store.addPlayer(state);
  const vehicleId = store.activateVehicle(player.id, vehicleType.itemId);
  const mapId = store.database.prepare(
    'SELECT map_id FROM catalog_cities WHERE id = ?'
  ).get(route.city1Id).map_id;
  store.close();

  const legacy = new DatabaseSync(databaseFile);
  legacy.exec(`
    PRAGMA foreign_keys = OFF;
    DROP TABLE world_creature_attacks;
    DROP TABLE world_creature_pursuits;
    DROP TABLE world_creatures;
    CREATE TABLE world_creatures (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      creature_type TEXT NOT NULL CHECK (creature_type IN ('kraken', 'land_whale')),
      map_id INTEGER NOT NULL, route_id INTEGER NOT NULL REFERENCES catalog_routes(id),
      location REAL NOT NULL, destination_city_id INTEGER NOT NULL,
      hp REAL NOT NULL CHECK (hp >= 0), max_hp REAL NOT NULL CHECK (max_hp > 0),
      status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'defeated', 'escaped')),
      awakened_at INTEGER NOT NULL, moved_at INTEGER NOT NULL, resolved_at INTEGER,
      defeated_by_player_id INTEGER REFERENCES players(id),
      defeated_by_vehicle_id INTEGER REFERENCES player_vehicles(id), speed REAL
    );
    CREATE TABLE world_creature_attacks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      creature_id INTEGER NOT NULL REFERENCES world_creatures(id) ON DELETE CASCADE,
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      vehicle_id INTEGER NOT NULL, damage REAL NOT NULL CHECK (damage >= 0),
      counter_damage REAL NOT NULL CHECK (counter_damage >= 0),
      defeated INTEGER NOT NULL CHECK (defeated IN (0, 1)),
      reward_json TEXT NOT NULL DEFAULT '[]', created_at INTEGER NOT NULL,
      UNIQUE (creature_id, vehicle_id)
    );
    CREATE TABLE world_creature_pursuits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      creature_id INTEGER NOT NULL REFERENCES world_creatures(id) ON DELETE CASCADE,
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      vehicle_id INTEGER NOT NULL REFERENCES player_vehicles(id) ON DELETE CASCADE,
      launched_at INTEGER NOT NULL, encounter_at INTEGER NOT NULL,
      encounter_location REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pursuing'
        CHECK (status IN ('pursuing', 'resolved', 'missed', 'cancelled')),
      resolved_at INTEGER
    );
  `);
  legacy.prepare(`
    INSERT INTO world_creatures
      (id, creature_type, map_id, route_id, location, destination_city_id,
       hp, max_hp, awakened_at, moved_at, speed)
    VALUES (7, 'land_whale', ?, ?, 10, ?, 100, 140, 1000, 2000, 12)
  `).run(mapId, route.id, route.city1Id);
  legacy.prepare(`
    INSERT INTO world_creature_attacks
      (id, creature_id, player_id, vehicle_id, damage, counter_damage,
       defeated, reward_json, created_at)
    VALUES (8, 7, ?, ?, 40, 3, 0, '[]', 1500)
  `).run(player.id, vehicleId);
  legacy.prepare(`
    INSERT INTO world_creature_pursuits
      (id, creature_id, player_id, vehicle_id, launched_at, encounter_at,
       encounter_location, status)
    VALUES (9, 7, ?, ?, 1800, 3000, 5, 'pursuing')
  `).run(player.id, vehicleId);
  for (const key of [
    'world_creature_icons', 'world_creature_route_types',
    'world_creature_reward_types', 'world_creature_wake_chances',
    'world_creature_tier_weights', 'world_creature_tier_hp_multipliers',
    'world_creature_tier_speed_multipliers', 'world_creature_tier_damage_multipliers',
    'world_creature_tier_ore_drops'
  ]) legacy.prepare('DELETE FROM catalog_settings WHERE key = ?').run(key);
  for (const [key, value] of Object.entries({
    world_creature_names: { kraken: 'Kraken', land_whale: 'Land Whale' },
    world_creature_hp: { kraken: 180, land_whale: 140 },
    world_creature_speed_kph: { kraken: 18, land_whale: 12 },
    world_creature_counter_damage_ratio: { kraken: 0.16, land_whale: 0.3 }
  })) legacy.prepare(
    'UPDATE catalog_settings SET value_json = ? WHERE key = ?'
  ).run(JSON.stringify(value), key);
  legacy.exec('PRAGMA user_version = 84; PRAGMA foreign_keys = ON;');
  legacy.close();

  store = new SqliteStore(databaseFile);
  assert.equal(store.database.prepare('PRAGMA user_version').get().user_version, 112);
  assert.equal(store.database.prepare('PRAGMA foreign_key_check').get(), undefined);
  const creature = store.database.prepare('SELECT * FROM world_creatures WHERE id = 7').get();
  assert.equal(creature.rarity, 1);
  assert.ok(creature.spawn_location > creature.location);
  assert.ok(creature.arrives_at > creature.moved_at);
  assert.equal(store.database.prepare(
    'SELECT creature_id FROM world_creature_attacks WHERE id = 8'
  ).get().creature_id, 7);
  assert.equal(store.database.prepare(
    'SELECT creature_id FROM world_creature_pursuits WHERE id = 9'
  ).get().creature_id, 7);
  assert.equal(store.loadCatalog().settings.world_creature_names.t_rex, 'T-Rex');
  const before = store.latestLiveUpdateId();
  store.database.prepare(`
    INSERT INTO world_creatures
      (creature_type, rarity, map_id, route_id, location, destination_city_id,
       hp, max_hp, awakened_at, moved_at, speed)
    VALUES ('t_rex', 6, ?, ?, 20, ?, 1, 1, 4000, 4000, 20)
  `).run(mapId, route.id, route.city1Id);
  assert.ok(store.liveUpdatesAfter(before).some((event) => event.scope === 'topic:world'));
});

test('records scoped live updates for application and direct database writes', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-live-updates-'));
  const databaseFile = path.join(directory, 'game.sqlite');
  const store = new SqliteStore(databaseFile);
  context.after(() => {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  store.seedCatalog(catalog);
  const player = store.addPlayer(createPlayer(
    'Live Scope', '', 'hash', catalog, 1000, () => 0.5
  ));
  let wakeCount = 0;
  const unsubscribe = store.onLiveUpdateWake(() => { wakeCount += 1; });
  let revision = store.latestLiveUpdateId();

  store.playerById(player.id, 2000, { settle: false });
  assert.equal(store.latestLiveUpdateId(), revision,
    'read-only live hydration does not create its own update event');
  assert.equal(wakeCount, 0, 'read-only live hydration does not wake clients');

  const saved = store.playerById(player.id, 1000);
  saved.credits += 1;
  store.savePlayer(saved);
  assert.equal(wakeCount, 1, 'a committed application transaction emits one wake');
  let events = store.liveUpdatesAfter(revision);
  assert.ok(events.some((event) => event.scope === `player:${player.id}`));
  assert.ok(events.some((event) => event.scope === 'topic:stats'));
  revision = store.latestLiveUpdateId();

  const external = new DatabaseSync(databaseFile);
  external.prepare('UPDATE catalog_items SET description = description WHERE id = ?')
    .run(catalog.items[0].id);
  external.prepare('UPDATE inventory SET quantity = quantity + 1 WHERE player_id = ?')
    .run(player.id);
  external.close();
  events = store.liveUpdatesAfter(revision);
  assert.ok(events.some((event) => event.scope === 'topic:catalog'));
  assert.ok(events.some((event) => event.scope === `player:${player.id}`));

  store.database.exec('BEGIN IMMEDIATE');
  store.database.prepare('UPDATE players SET credits = credits + 1 WHERE id = ?').run(player.id);
  assert.equal(wakeCount, 1, 'an uncommitted write does not emit');
  store.database.exec('ROLLBACK');
  assert.equal(wakeCount, 1, 'a rolled-back write never emits');
  store.database.exec('BEGIN IMMEDIATE');
  store.database.prepare('UPDATE players SET credits = credits + 1 WHERE id = ?').run(player.id);
  store.database.prepare('UPDATE players SET credits = credits + 1 WHERE id = ?').run(player.id);
  store.database.exec('COMMIT');
  assert.equal(wakeCount, 2, 'a multi-write commit emits once');
  unsubscribe();
});

test('caches catalog and settings until same-connection or external catalog data changes', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-catalog-cache-'));
  const databaseFile = path.join(directory, 'game.sqlite');
  const store = new SqliteStore(databaseFile);
  context.after(() => {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  store.seedCatalog(catalog);

  const first = store.loadCatalog();
  assert.strictEqual(store.loadCatalog(), first);

  let individualSettingQueries = 0;
  const trackedPrepare = store.database.prepare.bind(store.database);
  store.database.prepare = (sql) => {
    if (/SELECT value_json FROM catalog_settings WHERE key = \?/u.test(String(sql))) {
      individualSettingQueries += 1;
    }
    return trackedPrepare(sql);
  };
  const player = store.addPlayer(
    createPlayer('Catalog Cache', '', 'hash', catalog, 1000, () => 0.5)
  );
  store.inventoryCapacity(player.id, 2000);
  assert.equal(individualSettingQueries, 0);
  assert.strictEqual(store.loadCatalog(), first,
    'ordinary player writes must not invalidate the catalog snapshot');

  const item = first.items[0];
  store.database.prepare('UPDATE catalog_items SET name = ? WHERE id = ?')
    .run('Same connection catalog name', item.id);
  const sameConnection = store.loadCatalog();
  assert.notStrictEqual(sameConnection, first);
  assert.equal(sameConnection.byId.get(item.id).name, 'Same connection catalog name');
  assert.strictEqual(store.loadCatalog(), sameConnection);

  const external = new DatabaseSync(databaseFile);
  external.prepare('UPDATE catalog_settings SET value_json = ? WHERE key = ?')
    .run('12345', 'session_max_age_seconds');
  external.close();
  const externallyChanged = store.loadCatalog();
  assert.notStrictEqual(externallyChanged, sameConnection);
  assert.equal(externallyChanged.settings.session_max_age_seconds, 12345);
  assert.strictEqual(store.loadCatalog(), externallyChanged);
});

test('raises existing and new starter capacity to 5000 while preserving container bonuses', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-capacity-v69-'));
  const databaseFile = path.join(directory, 'game.sqlite');
  let store = new SqliteStore(databaseFile);
  context.after(() => {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  store.seedCatalog(catalog);
  const existing = store.addPlayer(
    createPlayer('Existing Capacity', '', 'hash', catalog, 1000, () => 0.5)
  );
  const containerOwner = store.addPlayer(
    createPlayer('Container Capacity', '', 'hash', catalog, 1000, () => 0.5)
  );
  const chest = catalog.containers.find((container) => container.name === 'Chest');
  store.buyContainer(containerOwner.id, chest.id);
  store.database.exec(`
    UPDATE players SET item_limit = item_limit - 4950;
    UPDATE catalog_settings SET value_json = '73' WHERE key = 'starter_item_limit';
    PRAGMA user_version = 67;
  `);
  store.close();

  store = new SqliteStore(databaseFile);
  assert.equal(store.database.prepare('PRAGMA user_version').get().user_version, 112);
  assert.equal(store.database.prepare(
    "SELECT value_json FROM catalog_settings WHERE key = 'starter_item_limit'"
  ).get().value_json, '5000');
  assert.equal(store.playerById(existing.id).baseItemLimit, 5000);
  assert.equal(store.playerById(containerOwner.id).baseItemLimit, 5025);
  const liveCatalog = store.loadCatalog();
  const newcomer = store.addPlayer(
    createPlayer('New Capacity', '', 'hash', liveCatalog, 2000, () => 0.5)
  );
  assert.equal(store.playerById(newcomer.id).baseItemLimit, 5000);

  store.close();
  store = new SqliteStore(databaseFile);
  assert.equal(store.playerById(containerOwner.id).baseItemLimit, 5025);
});

test('removes legacy Oil Field tier constraints during migration', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-oil-tier-schema-'));
  const databaseFile = path.join(directory, 'game.sqlite');
  const legacy = new DatabaseSync(databaseFile);
  legacy.exec(`
    CREATE TABLE oil_hexes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      city_id INTEGER NOT NULL DEFAULT 2,
      x INTEGER NOT NULL,
      y INTEGER NOT NULL,
      available INTEGER NOT NULL CHECK (available IN (1, 2)),
      build_tier INTEGER NOT NULL DEFAULT 1 CHECK (build_tier BETWEEN 0 AND 2),
      oil_units REAL NOT NULL DEFAULT 0,
      barrel_units REAL NOT NULL DEFAULT 0,
      barrels INTEGER NOT NULL DEFAULT 0,
      UNIQUE (city_id, x, y)
    );
    INSERT INTO oil_hexes (city_id, x, y, available, build_tier) VALUES (2, 0, 0, 1, 1);
    PRAGMA user_version = 58;
  `);
  legacy.close();
  const store = new SqliteStore(databaseFile);
  context.after(() => {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const sql = store.database.prepare(
    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'oil_hexes'"
  ).get().sql;
  assert.doesNotMatch(sql,
    /available\s+IN\s*\(|build_tier\s+BETWEEN|build_tier\s+INTEGER\s+NOT\s+NULL\s+DEFAULT/i);
  store.database.prepare(
    'INSERT INTO oil_hexes (city_id, x, y, available, build_tier) VALUES (2, 99, 99, 91, 92)'
  ).run();
  assert.equal(store.database.prepare('PRAGMA user_version').get().user_version, 112);
  const remapped = store.database.prepare(
    'SELECT available, build_tier FROM oil_hexes WHERE x = 99 AND y = 99'
  ).get();
  assert.equal(remapped.available, 91);
  assert.equal(remapped.build_tier, 92);
});

test('uses remapped live Oil Field tiers and starter capacity', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const update = store.database.prepare(
    'UPDATE catalog_settings SET value_json = ? WHERE key = ?'
  );
  update.run('73', 'starter_item_limit');
  update.run('{"unavailable":90,"local":91,"helicopter":92}', 'oil_build_tier_ids');
  update.run('1777', 'vehicle_starting_rating');
  update.run('17', 'dwarf_find_min_delay_ms');
  update.run('17', 'dwarf_find_max_delay_ms');
  const liveCatalog = store.loadCatalog();
  const player = store.addPlayer(
    createPlayer('Live Tier Miner', '', 'hash', liveCatalog, 1000, () => 0.5)
  );
  assert.equal(store.playerById(player.id).baseItemLimit, 73);
  const field = store.oilField(player.id, 2000);
  assert.equal(fieldHex(field, 0, 0).available, 91);
  assert.ok(field.hexes.some((hex) => hex.available === 92));
  assert.ok(field.hexes.some((hex) => hex.available === 90));
  const vehicleItem = liveCatalog.items.find((item) => liveCatalog.vehicleByItemId.has(item.id));
  store.database.prepare(
    'INSERT INTO inventory (player_id, city_id, item_id, quantity) VALUES (?, ?, ?, 1) '
      + 'ON CONFLICT(player_id, city_id, item_id) DO UPDATE SET quantity = quantity + 1'
  ).run(player.id, player.cityId, vehicleItem.id);
  const vehicleId = store.activateVehicle(player.id, vehicleItem.id);
  assert.equal(store.vehicleDetails(player.id, vehicleId, 2000).rating, 1777);
  store.database.prepare(
    'UPDATE dwarf_state SET next_find_at = 2000, next_competition_at = 9999999999, '
      + 'next_stowaway_at = 9999999999 WHERE id = 1'
  ).run();
  assert.equal(store.runDwarfUpdate(2000, () => 0).nextFindAt, 2017);
});

test('applies live database profile and message limits without restarting', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const sender = store.addPlayer(createPlayer('Limit Sender', '', 'hash', catalog, 1000, () => 0.5));
  const recipient = store.addPlayer(createPlayer('Limit Recipient', '', 'hash', catalog, 1000, () => 0.5));
  const update = store.database.prepare(
    'UPDATE catalog_settings SET value_json = ? WHERE key = ?'
  );
  for (const key of ['profile_description_max_length', 'private_message_max_length',
    'gold_transfer_note_max_length', 'email_max_length']) update.run('4', key);

  assert.throws(() => store.updateDescription(sender.id, '12345'), /4 characters/);
  store.updateDescription(sender.id, '1234');
  assert.equal(store.playerById(sender.id).description, '1234');
  assert.throws(() => store.sendMessage(sender.id, recipient.name, '12345', 2000), /1–4/);
  assert.ok(store.sendMessage(sender.id, recipient.name, '1234', 2000));
  assert.throws(() => store.transferGold(sender.id, recipient.name, 0.1, '12345', 2000),
    /gold transfers are disabled/i);
  assert.throws(() => store.updateAccount(sender.id, {
    email: 'a@b.c', publishFindings: true, showMines: true
  }), /valid email/);
});

test('does not restore deleted live catalog data from code on restart', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-live-authority-'));
  const databaseFile = path.join(directory, 'game.sqlite');
  let store = new SqliteStore(databaseFile);
  context.after(() => {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  store.seedCatalog(catalog);
  store.database.prepare(
    "DELETE FROM catalog_settings WHERE key = 'factory_market_icon'"
  ).run();
  store.close();

  store = new SqliteStore(databaseFile);
  assert.equal(store.database.prepare(
    "SELECT value_json FROM catalog_settings WHERE key = 'factory_market_icon'"
  ).get(), undefined);
  assert.throws(() => store.loadCatalog(), /factory market presentation/);
});

test('does not treat a deliberately emptied item catalog as an unseeded database', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-empty-authority-'));
  const databaseFile = path.join(directory, 'game.sqlite');
  let store = new SqliteStore(databaseFile);
  context.after(() => {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  store.seedCatalog(catalog);
  store.database.prepare('DELETE FROM catalog_items').run();
  store.close();

  store = new SqliteStore(databaseFile);
  assert.equal(store.hasCatalog(), true);
  assert.equal(store.database.prepare('SELECT COUNT(*) AS count FROM catalog_items').get().count, 0);
  assert.throws(() => store.loadCatalog(), /Missing catalog/);
});

test('a schema upgrade adds only new settings and does not replay old catalog backfills', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-v65-authority-'));
  const databaseFile = path.join(directory, 'game.sqlite');
  let store = new SqliteStore(databaseFile);
  context.after(() => {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  store.seedCatalog(catalog);
  store.database.exec(`
    DELETE FROM catalog_settings
    WHERE key IN ('factory_market_icon', 'public_stats_labels', 'calculator_report_labels',
      'ledger_report_labels', 'item_type_labels', 'location_labels');
    PRAGMA user_version = 64;
  `);
  store.close();

  store = new SqliteStore(databaseFile);
  assert.equal(store.database.prepare('PRAGMA user_version').get().user_version, 112);
  assert.equal(store.database.prepare(
    "SELECT value_json FROM catalog_settings WHERE key = 'factory_market_icon'"
  ).get(), undefined);
  assert.equal(store.database.prepare(
    "SELECT value_json FROM catalog_settings WHERE key = 'public_stats_labels'"
  ).get(), undefined);
  assert.equal(store.database.prepare(
    "SELECT value_json FROM catalog_settings WHERE key = 'calculator_report_labels'"
  ).get(), undefined);
  assert.ok(store.database.prepare(
    "SELECT value_json FROM catalog_settings WHERE key = 'ledger_report_labels'"
  ).get());
  assert.ok(store.database.prepare(
    "SELECT value_json FROM catalog_settings WHERE key = 'item_type_labels'"
  ).get());
  assert.ok(store.database.prepare(
    "SELECT value_json FROM catalog_settings WHERE key = 'location_labels'"
  ).get());
  assert.throws(() => store.loadCatalog(), /factory market presentation/);
});

test('rejects deleted required catalog references instead of inventing replacements', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const avatar = catalog.avatarElements[0];
  store.database.prepare('DELETE FROM catalog_items WHERE id = ?').run(avatar.itemId);
  assert.throws(() => store.loadCatalog(), /Missing (?:catalog item|repaired catalog item)/);
});

test('rejects incomplete bootstrap catalogs instead of seeding synthetic defaults', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  for (const key of ['vehicles', 'rarities', 'equipmentTypes', 'botParts',
    'specialisations', 'dwarfTiers']) {
    assert.throws(() => store.seedCatalog({ ...catalog, [key]: undefined }),
      new RegExp(`Missing catalog collection: ${key}`));
  }
  assert.throws(() => store.seedCatalog({ ...catalog, rarities: [] }),
    /Missing catalog collection: rarities/);
  for (const key of ['settings', 'labels']) {
    assert.throws(() => store.seedCatalog({ ...catalog, [key]: undefined }),
      new RegExp(`Missing catalog ${key}`));
  }
  const machineTypes = catalog.machineTypes.map((entry, index) =>
    index ? entry : { ...entry, rules: undefined });
  assert.throws(() => store.seedCatalog({ ...catalog, machineTypes }),
    /incomplete behavior data/);
});

test('uses supplied bootstrap authority instead of migration defaults', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  const supplied = {
    ...catalog,
    rarities: catalog.rarities.map((entry, index) =>
      index ? entry : { ...entry, name: 'Supplied rarity' }),
    equipmentTypes: catalog.equipmentTypes.map((entry, index) =>
      index ? entry : { ...entry, name: 'Supplied equipment slot' }),
    botParts: catalog.botParts.map((entry, index) =>
      index ? entry : { ...entry, label: 'Supplied bot part', cost: 0.4321 }),
    specialisations: catalog.specialisations.map((entry, index) => index ? entry : {
      ...entry, bonuses: { ...entry.bonuses, mineGold: 0.41 }
    }),
    dwarfTiers: catalog.dwarfTiers.map((entry, index) => index ? entry : {
      ...entry, minimumFindRarity: 4, maximumFindRarity: 6,
      disappearanceChance: 0.23
    }),
    settings: {
      ...catalog.settings, shots_per_crate: 23,
      location_labels: { atSea: 'Supplied open water' }
    },
    labels: {
      ...catalog.labels,
      route_type: { ...catalog.labels.route_type, 0: 'Supplied route type' }
    }
  };

  store.seedCatalog(supplied);
  const loaded = store.loadCatalog();
  assert.equal(loaded.rarities[0].name, 'Supplied rarity');
  assert.equal(loaded.equipmentTypeNames[1], 'Supplied equipment slot');
  assert.equal(loaded.botPartById.get(1).label, 'Supplied bot part');
  assert.equal(loaded.botPartById.get(1).cost, 0.4321);
  assert.equal(loaded.specialisationById.get(0).bonuses.mineGold, 0.41);
  assert.equal(loaded.dwarfByRarity.get(1).minimumFindRarity, 4);
  assert.equal(loaded.dwarfByRarity.get(1).maximumFindRarity, 6);
  assert.equal(loaded.dwarfByRarity.get(1).disappearanceChance, 0.23);
  assert.equal(loaded.settings.shots_per_crate, 23);
  assert.equal(loaded.settings.location_labels.atSea, 'Supplied open water');
  assert.equal(loaded.labels.route_type[0], 'Supplied route type');
});

test('imports the former JSON player store once', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-import-'));
  const databaseFile = path.join(directory, 'game.sqlite');
  const jsonFile = path.join(directory, 'players.json');
  const player = { ...createPlayer('Grace', '', 'hash', catalog, 2000, () => 0.5), id: 7 };
  fs.writeFileSync(jsonFile, JSON.stringify({ nextPlayerId: 8, players: [player] }));
  const store = new SqliteStore(databaseFile, { legacyJsonFile: jsonFile });
  context.after(() => {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  assert.equal(store.playerById(7).name, 'Grace');
  assert.equal(store.countPlayers(), 1);
});

test('uses original player-priced item listings, bids, and best-price FIFO fills', (context) => {
  const roundedGold = (value) => Math.round(value * 10000) / 10000;
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const item = catalog.items.find((candidate) => {
    const market = store.marketForItem(candidate.id, 1);
    return market.minimumPrice > 0.01 && market.minimumPrice < 1;
  });
  assert.ok(item, 'the catalog should include a sub-one-gold item market');
  const seller = createPlayer('Seller', '', 'hash', catalog, 3000, () => 0.5);
  seller.inventory[item.id] = 2;
  seller.inventoryByCity[1] = seller.inventory;
  const savedSeller = store.addPlayer(seller);
  const secondSeller = createPlayer('Second Seller', '', 'hash', catalog, 3000, () => 0.5);
  secondSeller.inventory[item.id] = 2;
  secondSeller.inventoryByCity[1] = secondSeller.inventory;
  const savedSecondSeller = store.addPlayer(secondSeller);
  const expensiveSeller = createPlayer('Expensive Seller', '', 'hash', catalog, 3000, () => 0.5);
  expensiveSeller.inventory[item.id] = 1;
  expensiveSeller.inventoryByCity[1] = expensiveSeller.inventory;
  const savedExpensiveSeller = store.addPlayer(expensiveSeller);
  const buyer = store.addPlayer(createPlayer('Buyer', '', 'hash', catalog, 3000, () => 0.5));
  buyer.gold = 100;
  store.savePlayer(buyer);
  const lowBidder = store.addPlayer(createPlayer('Low Bidder', '', 'hash', catalog, 3000, () => 0.5));
  lowBidder.gold = 100;
  store.savePlayer(lowBidder);
  const itemId = item.id;
  const sellerStartingCapacity = store.inventoryCapacity(savedSeller.id).itemCount;
  const secondStartingCapacity = store.inventoryCapacity(savedSecondSeller.id).itemCount;
  const askPrice = 2;

  assert.throws(() => store.placeSellOrder(
    savedSeller.id, itemId, 0.01, 1, 3500
  ), /must be at least/);
  assert.throws(() => store.placeSellOrder(
    savedSeller.id, itemId, 1.91, 1, 3500
  ), /between market ticks.*Try/);
  const listingId = store.placeSellOrder(savedSeller.id, itemId, askPrice, 2, 4000);
  const secondListingId = store.placeSellOrder(
    savedSecondSeller.id, itemId, askPrice, 2, 4001
  );
  const expensiveListingId = store.placeSellOrder(
    savedExpensiveSeller.id, itemId, 3, 1, 4002
  );
  assert.throws(() => store.placeBuyOrder(
    savedSeller.id, itemId, askPrice, 1, 4003
  ), /Cancel or move your existing listing first/);
  assert.deepEqual(store.listedItemIds(1), [itemId]);
  assert.deepEqual(store.purchasableItemListings(1, savedSeller.id).map((listing) =>
    listing.orderId), [secondListingId]);
  assert.deepEqual(store.purchasableItemListings(1, buyer.id).map((listing) => ({
    itemId: listing.itemId, orderId: listing.orderId, orderQuantity: listing.orderQuantity,
    totalQuantity: listing.totalQuantity, sellerName: listing.sellerName
  })), [{ itemId, orderId: listingId, orderQuantity: 2, totalQuantity: 4,
    sellerName: savedSeller.name }]);
  assert.equal(store.playerById(savedSeller.id).inventory[itemId], 2,
    'a listing must not escrow stock');
  assert.equal(store.inventoryCapacity(savedSeller.id).itemCount, sellerStartingCapacity,
    'listed stock must still consume capacity');

  const purchase = store.buyItemNow(buyer.id, itemId, askPrice, 3, 5000);
  assert.deepEqual(purchase.fills.map((fill) => [fill.orderId, fill.quantity]), [
    [listingId, 2], [secondListingId, 1]
  ]);
  assert.equal(purchase.gold, 6);
  assert.equal(store.playerById(savedSeller.id).inventory[itemId] ?? 0, 0);
  assert.equal(store.playerById(savedSecondSeller.id).inventory[itemId], 1);
  assert.equal(store.inventoryCapacity(savedSeller.id).itemCount, sellerStartingCapacity - 2);
  assert.equal(store.inventoryCapacity(savedSecondSeller.id).itemCount, secondStartingCapacity - 1);
  assert.equal(store.playerById(buyer.id).gold, 94);
  assert.equal(purchase.fills.some((fill) => fill.orderId === expensiveListingId), false,
    'Buy now must not consume a more expensive listing while the best ask has stock');
  store.cancelMarketOrder(savedExpensiveSeller.id, expensiveListingId);

  const goldBeforeBid = store.playerById(buyer.id).gold;
  assert.throws(() => store.placeBuyOrder(
    lowBidder.id, itemId, 0.01, 1, 5998
  ), /Bids for this item must be at least/);
  store.placeBuyOrder(lowBidder.id, itemId, 1.8, 1, 5999);
  const bidId = store.placeBuyOrder(buyer.id, itemId, 1.9, 2, 6000);
  assert.equal(store.playerById(buyer.id).gold, goldBeforeBid,
    'a bid must not escrow gold');
  assert.throws(() => store.placeSellOrder(
    savedSecondSeller.id, itemId, 1.9, 1, 6001
  ), /Use Sell now/);
  const sale = store.sellItemNow(savedSecondSeller.id, itemId, 1.9, 1, 7000);
  assert.equal(sale.gold, 1.9);
  assert.deepEqual(store.listedItemIds(1), [],
    'selling listed stock must trim the seller’s remaining listing');
  store.cancelMarketOrder(buyer.id, bidId);
  assert.equal(store.playerById(buyer.id).gold, roundedGold(94 - 1.9),
    'cancelling an unescrowed bid must not refund it again');
  const staleBidder = store.addPlayer(createPlayer(
    'Stale Item Bidder', '', 'hash', catalog, 3000, () => 0.5
  ));
  staleBidder.gold = 10;
  store.savePlayer(staleBidder);
  store.placeBuyOrder(staleBidder.id, itemId, 2.2, 1, 7100);
  store.placeBuyOrder(staleBidder.id, itemId, 1.9, 1, 7101);
  store.database.prepare('UPDATE players SET gold_units = 0 WHERE id = ?').run(staleBidder.id);
  assert.throws(() => store.sellItemNow(
    savedExpensiveSeller.id, itemId, 2.2, 1, 7200
  ), /best bid has moved to 1\.8g/);
  assert.equal(store.marketForItem(itemId, 1).bids.some(
    (openBid) => openBid.playerId === staleBidder.id
  ), false, 'one reconciliation must remove every unfunded bid for this item');
  assert.equal(store.sellItemNow(savedExpensiveSeller.id, itemId, 1.8, 1, 7201).gold, 1.8);
  assert.equal(store.marketForItem(itemId, 1).sales.length, 4);
  for (const participant of [savedSeller, savedSecondSeller, buyer]) {
    const messages = store.recentMessages(participant.id, 'all', 'Market');
    assert.ok(messages.length >= 1);
    assert.ok(messages.every((message) => message.details.event === 'market-sale'));
    assert.ok(messages.every((message) =>
      message.actionLinks.some((action) => action.href === `/market/items/${itemId}`)));
  }
});

test('uses the foreign fixed value as the local minimum for listings and bids', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const item = catalog.items.find((candidate) => candidate.mineTypeId === 1
    && candidate.repairedItemId === null);
  const player = createPlayer('Foreign Lister', '', 'hash', catalog, 1000, () => 0.5);
  player.cityId = 2;
  player.knownCityIds = [1, 2];
  player.inventoryByCity[2] = { [item.id]: 3 };
  player.inventory = player.inventoryByCity[2];
  player.gold = 100;
  const saved = store.addPlayer(player);
  const normalizedBase = item.goldValue > 1 ? Math.floor(item.goldValue) : item.goldValue;
  const premiumCalculated = Math.round(normalizedBase * 10000 * 1.4) / 10000;
  const premiumValue = premiumCalculated > 1 ? Math.floor(premiumCalculated) : premiumCalculated;

  const foreignMarket = store.marketForItem(item.id, 2);
  assert.equal(foreignMarket.basePrice, normalizedBase);
  assert.equal(foreignMarket.fixedPrice, premiumValue);
  assert.equal(foreignMarket.premium, true);
  const listingPrice = roundListingMinimumUpUnits(
    Math.round(foreignMarket.minimumPrice * 10000)
  ) / 10000;
  const listingId = store.placeSellOrder(saved.id, item.id, listingPrice, 2, 2000);
  assert.equal(store.marketForItem(item.id, 2).listings[0].price, listingPrice);
  store.cancelMarketOrder(saved.id, listingId);
  assert.equal(store.playerById(saved.id).inventory[item.id], 3);

  const goldBeforeBid = store.playerById(saved.id).gold;
  assert.throws(() => store.placeBuyOrder(saved.id, item.id, 0.01, 1, 3000),
    /Bids for this item must be at least/);
  const bidId = store.placeBuyOrder(saved.id, item.id, listingPrice, 1, 3001);
  assert.equal(store.marketForItem(item.id, 2).bids[0].price, listingPrice,
    'the local item minimum must also be the bid floor');
  assert.equal(store.playerById(saved.id).gold, goldBeforeBid);
  store.cancelMarketOrder(saved.id, bidId);
  assert.equal(store.playerById(saved.id).gold, goldBeforeBid);
  assert.equal(store.marketForItem(item.id, 1).fixedPrice, normalizedBase);
  assert.equal(store.marketForItem(item.id, 1).premium, false);

  store.database.prepare(
    "UPDATE catalog_settings SET value_json = '1.75' WHERE key = 'foreign_market_price_multiplier'"
  ).run();
  const liveDatabasePrice = store.marketForItem(item.id, 2);
  assert.equal(liveDatabasePrice.fixedPrice,
    Math.floor(Math.round(normalizedBase * 10000 * 1.75) / 10000));
  assert.equal(liveDatabasePrice.multiplier, 1.75);
});

test('cancels legacy item bids below the local minimum on restart', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-item-bid-floor-'));
  const databaseFile = path.join(directory, 'game.sqlite');
  let store = new SqliteStore(databaseFile);
  context.after(() => {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  store.seedCatalog(catalog);
  const item = catalog.items.find((candidate) =>
    store.marketForItem(candidate.id, 1).minimumPrice > 0.01);
  const bidder = store.addPlayer(createPlayer(
    'Legacy Low Bidder', '', 'hash', catalog, 1000, () => 0.5
  ));
  bidder.gold = 100;
  store.savePlayer(bidder);
  const market = store.marketForItem(item.id, 1);
  const insert = store.database.prepare(`
    INSERT INTO market_orders
      (player_id, city_id, item_id, side, price_units, quantity, created_at)
    VALUES (?, 1, ?, 'buy', ?, 1, ?)
  `);
  insert.run(bidder.id, item.id, 100, 2000);
  insert.run(bidder.id, item.id, Math.round(market.listingStartPrice * 10000), 2001);
  store.close();

  store = new SqliteStore(databaseFile);
  assert.deepEqual(store.marketForItem(item.id, 1).bids.map((bid) => bid.price),
    [market.listingStartPrice]);
  const migration = store.database.prepare(`
    SELECT details_json FROM schema_migrations WHERE name = 'item-bid-minimum-v1'
  `).get();
  assert.deepEqual(JSON.parse(migration.details_json), { cancelled: 1 });
  assert.equal(store.playerById(bidder.id).gold, 100,
    'cancelling an unescrowed legacy bid must not change gold');
});

test('trades crypto through original limit orders and reports executed-sale OHLCV', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const firstSeller = store.addPlayer(createPlayer(
    'Crypto Seller One', '', 'hash', catalog, 3000, () => 0.5
  ));
  const secondSeller = store.addPlayer(createPlayer(
    'Crypto Seller Two', '', 'hash', catalog, 3000, () => 0.5
  ));
  const expensiveSeller = store.addPlayer(createPlayer(
    'Crypto Expensive Seller', '', 'hash', catalog, 3000, () => 0.5
  ));
  const buyer = store.addPlayer(createPlayer(
    'Crypto Buyer', '', 'hash', catalog, 3000, () => 0.5
  ));
  store.database.prepare(
    'UPDATE players SET gold_units = ? WHERE id = ?'
  ).run(100 * 10000, buyer.id);
  const setBalance = store.database.prepare(`
    INSERT INTO player_crypto_balances (player_id, crypto_type_id, quantity)
    VALUES (?, 1, ?)
  `);
  setBalance.run(firstSeller.id, 2);
  setBalance.run(secondSeller.id, 2);
  setBalance.run(expensiveSeller.id, 1);

  assert.throws(() => store.placeCryptoOrder(
    firstSeller.id, 1, 'sell', 0.9, 1, 4000
  ), /at least 1 gold/);
  assert.throws(() => store.placeCryptoOrder(
    firstSeller.id, 1, 'sell', 3.01, 1, 4000
  ), /between market ticks/);
  const firstListing = store.placeCryptoOrder(
    firstSeller.id, 1, 'sell', 3, 2, 4000
  );
  const secondListing = store.placeCryptoOrder(
    secondSeller.id, 1, 'sell', 3, 2, 4001
  );
  const expensiveListing = store.placeCryptoOrder(
    expensiveSeller.id, 1, 'sell', 4, 1, 4002
  );
  assert.throws(() => store.placeCryptoOrder(
    firstSeller.id, 1, 'buy', 3, 1, 4003
  ), /Cancel or move your existing listing first/);
  assert.equal(store.playerById(firstSeller.id).cryptoBalances[1], 2,
    'listing crypto must not escrow it');
  assert.equal(store.cryptoExchange(firstSeller.id, 'day', 5000)
    .currencies[0].availableToList, 0);

  const purchase = store.buyCryptoNow(buyer.id, 1, 3, 3, 5000);
  assert.deepEqual(purchase.fills.map((fill) => [fill.orderId, fill.quantity]), [
    [firstListing.id, 2], [secondListing.id, 1]
  ]);
  assert.equal(store.playerById(firstSeller.id).cryptoBalances[1] ?? 0, 0);
  assert.equal(store.playerById(secondSeller.id).cryptoBalances[1], 1);
  assert.equal(store.playerById(buyer.id).cryptoBalances[1], 3);
  assert.equal(store.playerById(buyer.id).gold, 91);
  assert.equal(purchase.fills.some((fill) => fill.orderId === expensiveListing.id), false,
    'Buy now must not consume a more expensive crypto listing while the best ask has stock');
  store.cancelCryptoOrder(expensiveSeller.id, expensiveListing.id);

  const beforeBid = store.playerById(buyer.id).gold;
  const lowBidder = store.addPlayer(createPlayer(
    'Crypto Low Bidder', '', 'hash', catalog, 3000, () => 0.5
  ));
  lowBidder.gold = 100;
  store.savePlayer(lowBidder);
  store.placeCryptoOrder(lowBidder.id, 1, 'buy', 1, 1, 5999);
  const bid = store.placeCryptoOrder(buyer.id, 1, 'buy', 2, 2, 6000);
  assert.equal(store.playerById(buyer.id).gold, beforeBid,
    'crypto bids must not escrow gold');
  assert.throws(() => store.placeCryptoOrder(
    secondSeller.id, 1, 'sell', 2, 1, 6001
  ), /Use Sell now/);
  const sale = store.sellCryptoNow(secondSeller.id, 1, 2, 1, 7000);
  assert.equal(sale.gold, 2);
  assert.equal(store.playerById(secondSeller.id).cryptoBalances[1] ?? 0, 0);
  assert.equal(store.cryptoExchange(secondSeller.id, 'day', 8000)
    .currencies[0].listings.length, 0,
  'selling wallet stock must trim the seller’s listing');
  store.cancelCryptoOrder(buyer.id, bid.id);
  assert.equal(store.playerById(buyer.id).gold, 89,
    'cancelling an unescrowed crypto bid must not refund it again');
  const staleBidder = store.addPlayer(createPlayer(
    'Stale Crypto Bidder', '', 'hash', catalog, 3000, () => 0.5
  ));
  staleBidder.gold = 10;
  store.savePlayer(staleBidder);
  store.placeCryptoOrder(staleBidder.id, 1, 'buy', 2.5, 1, 7100);
  store.placeCryptoOrder(staleBidder.id, 1, 'buy', 1.5, 1, 7101);
  store.database.prepare('UPDATE players SET gold_units = 0 WHERE id = ?').run(staleBidder.id);
  assert.throws(() => store.sellCryptoNow(
    expensiveSeller.id, 1, 2.5, 1, 7200
  ), /best bid has moved to 1g/);
  assert.equal(store.cryptoExchange(expensiveSeller.id, 'day', 7201).currencies[0].bids.some(
    (openBid) => openBid.playerId === staleBidder.id
  ), false, 'one reconciliation must remove every unfunded crypto bid');
  assert.equal(store.sellCryptoNow(expensiveSeller.id, 1, 1, 1, 7202).gold, 1);

  const now = 100 * 86400000;
  const start = now - 86400000;
  const insertSale = store.database.prepare(`
    INSERT INTO crypto_market_sales
      (buyer_id, seller_id, crypto_type_id, price_units, quantity, created_at)
    VALUES (?, ?, 1, ?, ?, ?)
  `);
  insertSale.run(buyer.id, firstSeller.id, 9 * 10000, 5, start - 1);
  insertSale.run(buyer.id, firstSeller.id, 10 * 10000, 2, start + 1000);
  insertSale.run(buyer.id, firstSeller.id, 12 * 10000, 3, start + 2000);
  insertSale.run(buyer.id, firstSeller.id, 8 * 10000, 1, start + 3000);
  insertSale.run(buyer.id, firstSeller.id, 11 * 10000, 4, start + 4000);
  insertSale.run(buyer.id, firstSeller.id, 99 * 10000, 1, now + 1);
  const market = store.cryptoExchange(buyer.id, 'day', now).currencies[0];
  assert.equal(market.analytics.currentPriceUnits, 11 * 10000);
  assert.deepEqual(market.analytics.period, {
    openUnits: 10 * 10000,
    highUnits: 12 * 10000,
    lowUnits: 8 * 10000,
    closeUnits: 11 * 10000,
    volume: 10,
    tradeCount: 4,
    vwapUnits: 108000,
    changeUnits: 2 * 10000,
    changePercent: (2 / 9) * 100
  });
  assert.ok(market.analytics.buckets.length > 0);
});

test('repairs the missing rate-three ship firing schedule exactly once', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-ship-rounds-'));
  const databaseFile = path.join(directory, 'ship-rounds.sqlite');
  let store = new SqliteStore(databaseFile);
  store.seedCatalog(catalog);
  context.after(() => {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  store.database.prepare(`
    UPDATE catalog_settings SET value_json = ?
    WHERE key = 'ship_cannon_rounds_by_rate'
  `).run(JSON.stringify({ 1: [2], 2: [1, 3] }));
  store.database.prepare(
    "DELETE FROM schema_migrations WHERE name = 'ship-firing-rounds-rate-3-v1'"
  ).run();
  store.close();

  store = new SqliteStore(databaseFile);
  const repaired = JSON.parse(store.database.prepare(`
    SELECT value_json FROM catalog_settings WHERE key = 'ship_cannon_rounds_by_rate'
  `).get().value_json);
  assert.deepEqual(repaired, { 1: [2], 2: [1, 3], 3: [1, 2, 3] });
  assert.ok(store.database.prepare(`
    SELECT 1 FROM schema_migrations WHERE name = 'ship-firing-rounds-rate-3-v1'
  `).get());

  repaired[3] = [2];
  store.database.prepare(`
    UPDATE catalog_settings SET value_json = ?
    WHERE key = 'ship_cannon_rounds_by_rate'
  `).run(JSON.stringify(repaired));
  store.close();
  store = new SqliteStore(databaseFile);
  const reopened = JSON.parse(store.database.prepare(`
    SELECT value_json FROM catalog_settings WHERE key = 'ship_cannon_rounds_by_rate'
  `).get().value_json);
  assert.deepEqual(reopened[3], [2]);
});

test('repairs ghost maximum hulls and historical chain-escape events exactly once', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-combat-consistency-'));
  const databaseFile = path.join(directory, 'combat.sqlite');
  let store = new SqliteStore(databaseFile);
  store.seedCatalog(catalog);
  context.after(() => {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const administrator = store.addPlayer(createPlayer(
    'Combat Migration Admin', '', 'hash', catalog, 1000, () => 0.5
  ));
  const opponent = store.addPlayer(createPlayer(
    'Combat Migration Opponent', '', 'hash', catalog, 1000, () => 0.5
  ));
  const route = catalog.routes.find((entry) => entry.open && entry.type === 1
    && entry.length > 0 && entry.city1Id !== entry.city2Id);
  assert.ok(route);
  const ghost = store.adminRaiseGhost(administrator.id, 'ship', route.id, 2, 2000);
  const ghostState = store.database.prepare(`
    SELECT player_ship_state.*, catalog_ships.hull AS catalog_hull
    FROM player_ship_state
    JOIN player_vehicles ON player_vehicles.id = player_ship_state.vehicle_id
    JOIN catalog_ships ON catalog_ships.vehicle_id = player_vehicles.vehicle_type_id
    WHERE player_ship_state.vehicle_id = ?
  `).get(ghost.vehicleId);
  const ghostCombatBonus = JSON.parse(store.database.prepare(`
    SELECT value_json FROM catalog_settings WHERE key = 'ghost_combat_bonus'
  `).get().value_json);
  const spectralMaxHull = Math.round(ghostState.catalog_hull * (1 + ghostCombatBonus));
  assert.equal(ghostState.hull, spectralMaxHull);
  assert.equal(ghostState.max_hull, spectralMaxHull);
  assert.ok(spectralMaxHull > ghostState.catalog_hull);
  const damagedHull = spectralMaxHull - 7;
  store.database.prepare(`
    UPDATE player_ship_state SET hull = ?, max_hull = ? WHERE vehicle_id = ?
  `).run(damagedHull, ghostState.catalog_hull, ghost.vehicleId);

  const battleId = Number(store.database.prepare(`
    INSERT INTO vehicle_battles
      (route_id, route_type, combat_class, winner_vehicle_id, is_tie, details_json, created_at)
    VALUES (?, 1, 2, 9002, 0, ?, 3000)
  `).run(route.id, JSON.stringify({ type: 'ship', result: { chainEscape: true } }))
    .lastInsertRowid);
  const insertSide = store.database.prepare(`
    INSERT INTO vehicle_battle_sides
      (battle_id, vehicle_id, vehicle_item_id, player_id, opponent_vehicle_id,
       aggressive, won, rating_before, rating_after)
    VALUES (?, ?, NULL, ?, ?, ?, ?, 1600, ?)
  `);
  insertSide.run(battleId, 9001, administrator.id, 9002, 1, 0, 1595);
  insertSide.run(battleId, 9002, opponent.id, 9001, 0, 1, 1605);
  const insertEvent = store.database.prepare(`
    INSERT INTO vehicle_events
      (vehicle_id, player_id, event_type, route_id, battle_id, created_at)
    VALUES (?, ?, 'tied', ?, ?, 3000)
  `);
  insertEvent.run(9001, administrator.id, route.id, battleId);
  insertEvent.run(9002, opponent.id, route.id, battleId);
  const insertLiveUpdate = store.database.prepare(`
    INSERT INTO live_update_events (scope, changed_at, event_type, payload_json)
    VALUES (?, 3000, 'battle-complete', ?)
  `);
  insertLiveUpdate.run(`player:${administrator.id}`,
    JSON.stringify({ battleId, outcome: 'tied' }));
  insertLiveUpdate.run(`player:${opponent.id}`,
    JSON.stringify({ battleId, outcome: 'tied' }));
  store.database.prepare(
    "DELETE FROM schema_migrations WHERE name = 'vehicle-combat-consistency-v1'"
  ).run();
  store.close();

  store = new SqliteStore(databaseFile);
  const repairedState = store.database.prepare(`
    SELECT hull, max_hull FROM player_ship_state WHERE vehicle_id = ?
  `).get(ghost.vehicleId);
  assert.equal(repairedState.hull, damagedHull, 'migration must preserve current damage');
  assert.equal(repairedState.max_hull, spectralMaxHull);
  assert.deepEqual(store.database.prepare(`
    SELECT vehicle_id, event_type FROM vehicle_events WHERE battle_id = ? ORDER BY vehicle_id
  `).all(battleId).map((event) => [event.vehicle_id, event.event_type]), [
    [9001, 'lost'],
    [9002, 'won']
  ]);
  const migration = store.database.prepare(`
    SELECT details_json FROM schema_migrations WHERE name = 'vehicle-combat-consistency-v1'
  `).get();
  assert.deepEqual(JSON.parse(migration.details_json), {
    ghostMaxHullsUpdated: 1,
    chainEscapeEventsUpdated: 2,
    chainEscapeLiveUpdatesUpdated: 2
  });
  assert.deepEqual(store.database.prepare(`
    SELECT scope, json_extract(payload_json, '$.outcome') AS outcome
    FROM live_update_events WHERE event_type = 'battle-complete' ORDER BY scope
  `).all().map((event) => [event.scope, event.outcome]), [
    [`player:${administrator.id}`, 'lost'],
    [`player:${opponent.id}`, 'won']
  ]);
  assert.equal(store.database.prepare('PRAGMA foreign_key_check').get(), undefined);

  store.database.prepare(`
    UPDATE player_ship_state SET max_hull = ? WHERE vehicle_id = ?
  `).run(ghostState.catalog_hull, ghost.vehicleId);
  store.database.prepare(
    "UPDATE vehicle_events SET event_type = 'tied' WHERE battle_id = ?"
  ).run(battleId);
  store.database.prepare(`
    UPDATE live_update_events SET payload_json = json_set(payload_json, '$.outcome', 'tied')
    WHERE event_type = 'battle-complete'
  `).run();
  store.close();
  store = new SqliteStore(databaseFile);
  assert.equal(store.database.prepare(`
    SELECT max_hull FROM player_ship_state WHERE vehicle_id = ?
  `).get(ghost.vehicleId).max_hull, ghostState.catalog_hull);
  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count FROM vehicle_events WHERE battle_id = ? AND event_type = 'tied'
  `).get(battleId).count, 2);
  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count FROM live_update_events
    WHERE event_type = 'battle-complete'
      AND json_extract(payload_json, '$.outcome') = 'tied'
  `).get().count, 2);
});

test('converts existing escrowed item and crypto orders to open orders exactly once', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-open-orders-'));
  const databaseFile = path.join(directory, 'market.sqlite');
  let store = new SqliteStore(databaseFile);
  store.seedCatalog(catalog);
  const seller = store.addPlayer(createPlayer(
    'Escrow Seller', '', 'hash', catalog, 3000, () => 0.5
  ));
  const buyer = store.addPlayer(createPlayer(
    'Escrow Buyer', '', 'hash', catalog, 3000, () => 0.5
  ));
  const itemId = Number(Object.keys(store.playerById(seller.id).inventory)[0]);
  const sellerItemBefore = store.playerById(seller.id).inventory[itemId];
  store.database.prepare(`
    UPDATE inventory SET quantity = quantity - 2
    WHERE player_id = ? AND city_id = 1 AND item_id = ?
  `).run(seller.id, itemId);
  store.database.prepare(`
    INSERT INTO market_orders
      (player_id, city_id, item_id, side, price_units, quantity, created_at)
    VALUES (?, 1, ?, 'sell', 19100, 2, 1000)
  `).run(seller.id, itemId);
  store.database.prepare(
    'UPDATE players SET gold_units = 923600 WHERE id = ?'
  ).run(buyer.id);
  store.database.prepare(`
    INSERT INTO market_orders
      (player_id, city_id, item_id, side, price_units, quantity, created_at)
    VALUES (?, 1, ?, 'buy', 19100, 2, 1001)
  `).run(buyer.id, itemId);
  store.database.prepare(`
    INSERT INTO player_crypto_balances (player_id, crypto_type_id, quantity)
    VALUES (?, 1, 3)
  `).run(seller.id);
  store.database.prepare(`
    INSERT INTO crypto_market_orders
      (player_id, crypto_type_id, side, price_units, quantity, created_at)
    VALUES (?, 1, 'sell', 19100, 2, 1002)
  `).run(seller.id);
  store.database.prepare(`
    INSERT INTO crypto_market_orders
      (player_id, crypto_type_id, side, price_units, quantity, created_at)
    VALUES (?, 1, 'buy', 19100, 2, 1003)
  `).run(buyer.id);
  store.database.prepare(
    "DELETE FROM schema_migrations WHERE name = 'open-limit-orders-v1'"
  ).run();
  store.close();

  store = new SqliteStore(databaseFile);
  context.after(() => {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  assert.equal(store.playerById(seller.id).inventory[itemId], sellerItemBefore);
  assert.equal(store.playerById(seller.id).cryptoBalances[1], 5);
  assert.equal(store.playerById(buyer.id).gold, 100);
  store.close();
  store = new SqliteStore(databaseFile);
  assert.equal(store.playerById(seller.id).inventory[itemId], sellerItemBefore);
  assert.equal(store.playerById(seller.id).cryptoBalances[1], 5);
  assert.equal(store.playerById(buyer.id).gold, 100);
  assert.equal(store.buyItemNow(buyer.id, itemId, 1.91, 1, 2000).price, 1.91);
  assert.equal(store.sellItemNow(seller.id, itemId, 1.91, 1, 2001).price, 1.91);
  assert.equal(store.buyCryptoNow(buyer.id, 1, 1.91, 1, 2002).price, 1.91);
  assert.equal(store.sellCryptoNow(seller.id, 1, 1.91, 1, 2003).price, 1.91);
});

test('trades whole mines in one crypto above the live 10,000g floor', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const seller = store.addPlayer(createPlayer('Mine Seller', '', 'hash', catalog, 1000, () => 0.5));
  const buyer = store.addPlayer(createPlayer('Mine Buyer', '', 'hash', catalog, 1000, () => 0.5));
  const mineType = catalog.mineTypes.find((entry) => entry.creditCost > 0
    && catalog.byMineType.has(entry.id) && entry.id !== seller.mines[0].mineTypeId);
  const stocked = store.playerById(seller.id);
  stocked.credits = mineType.creditCost * 2;
  buyMine(stocked, catalog, mineType.id, 1100, () => 0.5);
  buyMine(stocked, catalog, mineType.id, 1200, () => 0.5);
  store.savePlayer(stocked);
  const coinSeller = store.playerById(seller.id);
  coinSeller.cryptoBalances[1] = 1;
  store.savePlayer(coinSeller);
  const funded = store.playerById(buyer.id);
  funded.gold = 100;
  funded.cryptoBalances[1] = 50000;
  store.savePlayer(funded);
  store.placeCryptoOrder(seller.id, 1, 'sell', 2, 1, 1500);
  store.buyCryptoNow(buyer.id, 1, 2, 1, 1600);

  assert.throws(() => store.placeMineSellOrder(seller.id, mineType.id, 1, 4999, 1, 1900),
    /at least 10,000g/);
  const listing = store.placeMineSellOrder(seller.id, mineType.id, 1, 5000, 2, 2000);
  const market = store.mineMarket(mineType.id, 1, buyer.id, 2001);
  assert.equal(market.listings[0].quantity, 2);
  assert.equal(market.listings[0].cryptoSymbol, 'ASO');
  assert.equal(market.listings[0].currentGoldValue, 10000);
  assert.throws(() => store.placeMineSellOrder(seller.id, mineType.id, 1, 6000, 1, 2100),
    /enough unlisted mines/);
  const priceSeller = store.addPlayer(createPlayer('Price Seller', '', 'hash', catalog, 2150, () => 0.5));
  const priceBuyer = store.addPlayer(createPlayer('Price Buyer', '', 'hash', catalog, 2150, () => 0.5));
  const pricedCoins = store.playerById(priceSeller.id);
  pricedCoins.cryptoBalances[1] = 2;
  store.savePlayer(pricedCoins);
  const priceFunds = store.playerById(priceBuyer.id);
  priceFunds.gold = 10;
  store.savePlayer(priceFunds);
  store.placeCryptoOrder(priceSeller.id, 1, 'sell', 1, 1, 2200);
  store.buyCryptoNow(priceBuyer.id, 1, 1, 1, 2300);
  assert.throws(() => store.buyMineListing(buyer.id, listing, 1, 2400),
    /at least 10,000g/);
  store.placeCryptoOrder(priceSeller.id, 1, 'sell', 2, 1, 2500);
  store.buyCryptoNow(priceBuyer.id, 1, 2, 1, 2600);
  const purchase = store.buyMineListing(buyer.id, listing, 1, 3000);
  assert.equal(purchase.cryptoQuantity, 5000);
  assert.equal(purchase.currency.symbol, 'ASO');
  assert.equal(store.playerById(seller.id).cryptoBalances[1], 5000);
  assert.equal(store.playerById(buyer.id).cryptoBalances[1], 45001);
  assert.equal(store.playerById(buyer.id).mines.filter((mine) => mine.mineTypeId === mineType.id).length, 1);
  assert.equal(store.mineMarket(mineType.id, 1, buyer.id, 3001).sales.length, 1);

  store.cancelMineMarketOrder(seller.id, listing);
  const bid = store.placeMineBuyOrder(buyer.id, mineType.id, 1, 5000, 1, 4000);
  assert.equal(store.playerById(buyer.id).cryptoBalances[1], 40001);
  const sale = store.sellMineToBid(seller.id, bid, 1, 5000);
  assert.equal(sale.cryptoQuantity, 5000);
  assert.equal(store.playerById(seller.id).cryptoBalances[1], 10000);
  assert.equal(store.playerById(buyer.id).mines.filter((mine) => mine.mineTypeId === mineType.id).length, 2);
  assert.equal(store.playerById(seller.id).mines.filter((mine) => !mine.rentalUntil).length, 1);
  assert.equal(store.mineMarket(mineType.id, 1, buyer.id, 5001).sales.length, 2);
  const sellerMineMessages = store.recentMessages(seller.id, 'all', 'Market').filter((message) =>
    message.actionLinks.some((action) => action.href === `/market/mines/${mineType.id}`));
  const buyerMineMessages = store.recentMessages(buyer.id, 'all', 'Market').filter((message) =>
    message.actionLinks.some((action) => action.href === `/market/mines/${mineType.id}`));
  assert.equal(sellerMineMessages.length, 2);
  assert.equal(buyerMineMessages.length, 2);

  const refundableBid = store.placeMineBuyOrder(buyer.id, mineType.id, 1, 5000, 1, 6000);
  assert.equal(store.playerById(buyer.id).cryptoBalances[1], 35001);
  store.cancelMineMarketOrder(buyer.id, refundableBid);
  assert.equal(store.playerById(buyer.id).cryptoBalances[1], 40001);
});

test('v107 refunds legacy mine-bid gold before replacing the open order book', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-mine-crypto-migration-'));
  const databaseFile = path.join(directory, 'game.sqlite');
  let store = new SqliteStore(databaseFile);
  context.after(() => {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  store.seedCatalog(catalog);
  const bidder = store.addPlayer(createPlayer('Legacy Mine Bidder', '', 'hash', catalog, 1000, () => 0.5));
  const funded = store.playerById(bidder.id);
  funded.gold = 100;
  store.savePlayer(funded);
  const mineType = catalog.mineTypes.find((entry) => entry.creditCost > 0);
  store.database.prepare(`
    INSERT INTO mine_market_orders
      (player_id, city_id, mine_type_id, side, price_units, quantity, created_at)
    VALUES (?, 1, ?, 'buy', 100000, 2, 2000)
  `).run(bidder.id, mineType.id);
  store.database.prepare('UPDATE players SET gold_units = gold_units - 200000 WHERE id = ?')
    .run(bidder.id);
  store.database.exec('PRAGMA user_version = 106');
  store.close();

  store = new SqliteStore(databaseFile);
  assert.equal(store.database.prepare('PRAGMA user_version').get().user_version, 112);
  assert.equal(store.playerById(bidder.id).gold, 100);
  assert.equal(store.database.prepare('SELECT COUNT(*) AS count FROM mine_market_orders').get().count, 0);
  const columns = store.database.prepare('PRAGMA table_info(mine_market_orders)')
    .all().map((column) => column.name);
  assert.ok(columns.includes('crypto_type_id'));
  assert.ok(columns.includes('crypto_quantity'));
  assert.ok(columns.includes('crypto_price_units'));
});

test('v108 and v109 install Shrooms and restrict their mine to Bromo cities', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-shrooms-migration-'));
  const databaseFile = path.join(directory, 'game.sqlite');
  let store = new SqliteStore(databaseFile);
  context.after(() => {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  store.seedCatalog(catalog);
  store.ensureWorldMaps(1000);
  store.database.prepare(
    "DELETE FROM schema_migrations WHERE name = 'shrooms-bromo-v1'"
  ).run();
  store.database.prepare(
    'DELETE FROM catalog_city_mine_types WHERE mine_type_id = ?'
  ).run(SHROOM_CATALOG.mineType.id);
  store.database.prepare(
    'DELETE FROM catalog_meld_requirements WHERE meld_id BETWEEN 234 AND 239'
  ).run();
  store.database.prepare(
    'DELETE FROM catalog_melds WHERE mine_type_id = ?'
  ).run(SHROOM_CATALOG.mineType.id);
  store.database.prepare(
    'DELETE FROM catalog_items WHERE mine_type_id = ?'
  ).run(SHROOM_CATALOG.mineType.id);
  store.database.prepare(
    'DELETE FROM catalog_mine_types WHERE id = ?'
  ).run(SHROOM_CATALOG.mineType.id);
  store.database.exec('PRAGMA user_version = 107');
  store.close();

  store = new SqliteStore(databaseFile);
  assert.equal(store.database.prepare('PRAGMA user_version').get().user_version, 112);
  assert.deepEqual(store.database.prepare(`
    SELECT name, rarity, icon, can_find, has_large_image
    FROM catalog_items WHERE mine_type_id = ? ORDER BY rarity
  `).all(SHROOM_CATALOG.mineType.id).map((item) => ({ ...item })),
  SHROOM_CATALOG.items.map((item) => ({
    name: item.name,
    rarity: item.rarity,
    icon: item.icon,
    can_find: 1,
    has_large_image: 1
  })));
  assert.equal(store.database.prepare(
    'SELECT COUNT(*) AS count FROM catalog_melds WHERE mine_type_id = ?'
  ).get(SHROOM_CATALOG.mineType.id).count, 6);
  assert.equal(store.database.prepare(
    'SELECT COUNT(*) AS count FROM catalog_meld_requirements WHERE id BETWEEN 1701 AND 1735'
  ).get().count, 35);
  const availability = store.database.prepare(`
    SELECT world_maps.slug AS map_slug, catalog_cities.name AS city_name
    FROM catalog_city_mine_types
    JOIN catalog_cities ON catalog_cities.id = catalog_city_mine_types.city_id
    JOIN world_maps ON world_maps.id = catalog_cities.map_id
    WHERE catalog_city_mine_types.mine_type_id = ?
    ORDER BY catalog_cities.id
  `).all(SHROOM_CATALOG.mineType.id);
  assert.equal(availability.length, 5);
  assert.ok(availability.every((entry) => entry.map_slug === 'bromo'));
  assert.deepEqual(availability.map((entry) => entry.city_name),
    ['Ashfall', 'Tengger Gate', 'Sandsea', 'Ember Market', 'Craterwatch']);
  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count
    FROM catalog_city_mine_types
    JOIN catalog_cities ON catalog_cities.id = catalog_city_mine_types.city_id
    JOIN world_maps ON world_maps.id = catalog_cities.map_id
    WHERE catalog_city_mine_types.mine_type_id = ? AND world_maps.slug <> 'bromo'
  `).get(SHROOM_CATALOG.mineType.id).count, 0);
});

test('v109 expands an existing six-item Shroom mine to five finds per tier', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-shrooms-expansion-'));
  const databaseFile = path.join(directory, 'game.sqlite');
  let store = new SqliteStore(databaseFile);
  context.after(() => {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  store.seedCatalog(catalog);
  store.ensureWorldMaps(1000);
  store.database.prepare(
    'DELETE FROM catalog_meld_requirements WHERE id BETWEEN 1712 AND 1735'
  ).run();
  store.database.prepare(
    'DELETE FROM catalog_items WHERE id BETWEEN 1440 AND 1463'
  ).run();
  store.database.exec('PRAGMA user_version = 108');
  store.close();

  store = new SqliteStore(databaseFile);
  assert.equal(store.database.prepare('PRAGMA user_version').get().user_version, 112);
  assert.deepEqual(store.database.prepare(`
    SELECT rarity, COUNT(*) AS count
    FROM catalog_items WHERE mine_type_id = ?
    GROUP BY rarity ORDER BY rarity
  `).all(SHROOM_CATALOG.mineType.id).map((entry) => [entry.rarity, entry.count]),
  [[1, 5], [2, 5], [3, 5], [4, 5], [5, 5], [6, 5]]);
  assert.equal(store.database.prepare(
    'SELECT COUNT(*) AS count FROM catalog_meld_requirements WHERE id BETWEEN 1701 AND 1735'
  ).get().count, 35);
  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count FROM catalog_items
    WHERE mine_type_id = ? AND rarity >= 5 AND description NOT LIKE '%magic%'
  `).get(SHROOM_CATALOG.mineType.id).count, 0);
});

test('installs Wood finds and hardware Melds only in Calbuco', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-wood-migration-'));
  const databaseFile = path.join(directory, 'game.sqlite');
  let store = new SqliteStore(databaseFile);
  context.after(() => {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  store.seedCatalog(catalog);
  store.ensureWorldMaps(1000);
  store.database.prepare(
    "DELETE FROM schema_migrations WHERE name IN ('wood-catalog-v1', 'wood-calbuco-v1')"
  ).run();
  store.database.prepare(
    'DELETE FROM catalog_city_mine_types WHERE mine_type_id = ?'
  ).run(WOOD_CATALOG.mineType.id);
  store.database.prepare(
    'DELETE FROM catalog_meld_requirements WHERE id BETWEEN 1736 AND 1776'
  ).run();
  store.database.prepare(
    'DELETE FROM catalog_melds WHERE mine_type_id = ?'
  ).run(WOOD_CATALOG.mineType.id);
  store.database.prepare(
    'DELETE FROM catalog_items WHERE mine_type_id = ?'
  ).run(WOOD_CATALOG.mineType.id);
  store.database.prepare(
    'DELETE FROM catalog_mine_types WHERE id = ?'
  ).run(WOOD_CATALOG.mineType.id);
  store.close();

  store = new SqliteStore(databaseFile);
  assert.equal(store.database.prepare('PRAGMA user_version').get().user_version, 112);
  assert.deepEqual(store.database.prepare(`
    SELECT name, rarity, icon, can_find, has_large_image
    FROM catalog_items WHERE mine_type_id = ? ORDER BY rarity, id
  `).all(WOOD_CATALOG.mineType.id).map((item) => ({ ...item })),
  WOOD_CATALOG.items.map((item) => ({
    name: item.name,
    rarity: item.rarity,
    icon: item.icon,
    can_find: 1,
    has_large_image: 1
  })));
  assert.equal(store.database.prepare(
    'SELECT COUNT(*) AS count FROM catalog_melds WHERE mine_type_id = ?'
  ).get(WOOD_CATALOG.mineType.id).count, 6);
  assert.equal(store.database.prepare(
    'SELECT COUNT(*) AS count FROM catalog_meld_requirements WHERE id BETWEEN 1736 AND 1776'
  ).get().count, 41);
  const woodMeldHardware = store.database.prepare(`
    SELECT catalog_melds.id,
      SUM(CASE WHEN catalog_meld_requirements.item_id = ? THEN 1 ELSE 0 END) AS screws,
      SUM(CASE WHEN catalog_meld_requirements.item_id = ?
        AND catalog_meld_requirements.quantity BETWEEN 3 AND 8 THEN 1 ELSE 0 END) AS bolts
    FROM catalog_melds
    JOIN catalog_meld_requirements ON catalog_meld_requirements.meld_id = catalog_melds.id
    WHERE catalog_melds.mine_type_id = ?
    GROUP BY catalog_melds.id ORDER BY catalog_melds.id
  `).all(WOOD_CATALOG.screwItemId, WOOD_CATALOG.boltItemId, WOOD_CATALOG.mineType.id);
  assert.equal(woodMeldHardware.length, 6);
  assert.ok(woodMeldHardware.every((meld) => meld.screws === 1 && meld.bolts === 1));
  const availability = store.database.prepare(`
    SELECT world_maps.slug AS map_slug, catalog_cities.name AS city_name
    FROM catalog_city_mine_types
    JOIN catalog_cities ON catalog_cities.id = catalog_city_mine_types.city_id
    JOIN world_maps ON world_maps.id = catalog_cities.map_id
    WHERE catalog_city_mine_types.mine_type_id = ?
    ORDER BY catalog_cities.id
  `).all(WOOD_CATALOG.mineType.id);
  assert.ok(availability.length > 0);
  assert.ok(availability.every((entry) => entry.map_slug === 'calbuco'));
  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count FROM catalog_items
    WHERE mine_type_id = ? AND rarity >= 5 AND description NOT LIKE '%magic%'
  `).get(WOOD_CATALOG.mineType.id).count, 0);
});

test('installs three-line Wisdom haiku and Melds only in Dempo', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-wisdom-migration-'));
  const databaseFile = path.join(directory, 'game.sqlite');
  let store = new SqliteStore(databaseFile);
  context.after(() => {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  store.seedCatalog(catalog);
  store.ensureWorldMaps(1000);
  store.database.prepare(
    "DELETE FROM schema_migrations WHERE name IN ('wisdom-catalog-v1', 'wisdom-dempo-v1')"
  ).run();
  store.database.prepare(
    'DELETE FROM catalog_city_mine_types WHERE mine_type_id = ?'
  ).run(WISDOM_CATALOG.mineType.id);
  store.database.prepare(
    'DELETE FROM catalog_meld_requirements WHERE id BETWEEN 1777 AND 1806'
  ).run();
  store.database.prepare(
    'DELETE FROM catalog_melds WHERE mine_type_id = ?'
  ).run(WISDOM_CATALOG.mineType.id);
  store.database.prepare(
    'DELETE FROM catalog_items WHERE mine_type_id = ?'
  ).run(WISDOM_CATALOG.mineType.id);
  store.database.prepare(
    'DELETE FROM catalog_mine_types WHERE id = ?'
  ).run(WISDOM_CATALOG.mineType.id);
  store.close();

  store = new SqliteStore(databaseFile);
  assert.equal(store.database.prepare('PRAGMA user_version').get().user_version, 112);
  const wisdomItems = store.database.prepare(`
    SELECT name, rarity, description, icon, can_find, has_large_image
    FROM catalog_items WHERE mine_type_id = ? ORDER BY rarity, id
  `).all(WISDOM_CATALOG.mineType.id);
  assert.equal(wisdomItems.length, 30);
  assert.ok(wisdomItems.every((item) => item.can_find === 1 && item.has_large_image === 1
    && item.description.split('\n').length === 3));
  assert.deepEqual(wisdomItems.map((item) => item.icon),
    WISDOM_CATALOG.items.map((item) => item.icon));
  assert.equal(store.database.prepare(
    'SELECT COUNT(*) AS count FROM catalog_melds WHERE mine_type_id = ?'
  ).get(WISDOM_CATALOG.mineType.id).count, 6);
  assert.equal(store.database.prepare(
    'SELECT COUNT(*) AS count FROM catalog_meld_requirements WHERE id BETWEEN 1777 AND 1806'
  ).get().count, 30);
  const availability = store.database.prepare(`
    SELECT world_maps.slug AS map_slug
    FROM catalog_city_mine_types
    JOIN catalog_cities ON catalog_cities.id = catalog_city_mine_types.city_id
    JOIN world_maps ON world_maps.id = catalog_cities.map_id
    WHERE catalog_city_mine_types.mine_type_id = ?
  `).all(WISDOM_CATALOG.mineType.id);
  assert.ok(availability.length > 0);
  assert.ok(availability.every((entry) => entry.map_slug === 'dempo'));
  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count
    FROM catalog_city_mine_types
    JOIN catalog_cities ON catalog_cities.id = catalog_city_mine_types.city_id
    JOIN world_maps ON world_maps.id = catalog_cities.map_id
    WHERE catalog_city_mine_types.mine_type_id = ? AND world_maps.slug <> 'dempo'
  `).get(WISDOM_CATALOG.mineType.id).count, 0);
});

test('installs Electronic Devices and their Melds only in Ebeko', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-electronics-migration-'));
  const databaseFile = path.join(directory, 'game.sqlite');
  let store = new SqliteStore(databaseFile);
  context.after(() => {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  store.seedCatalog(catalog);
  store.ensureWorldMaps(1000);
  store.database.prepare(
    "DELETE FROM schema_migrations WHERE name IN ('electronics-catalog-v1', 'electronics-ebeko-v1')"
  ).run();
  store.database.prepare(
    'DELETE FROM catalog_city_mine_types WHERE mine_type_id = ?'
  ).run(ELECTRONICS_CATALOG.mineType.id);
  store.database.prepare(
    'DELETE FROM catalog_meld_requirements WHERE id BETWEEN 1807 AND 1836'
  ).run();
  store.database.prepare(
    'DELETE FROM catalog_melds WHERE mine_type_id = ?'
  ).run(ELECTRONICS_CATALOG.mineType.id);
  store.database.prepare(
    'DELETE FROM catalog_items WHERE mine_type_id = ?'
  ).run(ELECTRONICS_CATALOG.mineType.id);
  store.database.prepare(
    'DELETE FROM catalog_mine_types WHERE id = ?'
  ).run(ELECTRONICS_CATALOG.mineType.id);
  store.close();

  store = new SqliteStore(databaseFile);
  assert.equal(store.database.prepare('PRAGMA user_version').get().user_version, 112);
  const electronicsItems = store.database.prepare(`
    SELECT name, rarity, description, icon, icon_source, can_find, has_large_image
    FROM catalog_items WHERE mine_type_id = ? ORDER BY rarity, id
  `).all(ELECTRONICS_CATALOG.mineType.id);
  assert.equal(electronicsItems.length, 30);
  assert.ok(electronicsItems.every((item) => item.can_find === 1
    && item.has_large_image === 1 && item.icon_source === 'electronics-svg'
    && item.description.length > 20));
  assert.deepEqual(electronicsItems.map((item) => item.icon),
    ELECTRONICS_CATALOG.items.map((item) => item.icon));
  assert.equal(store.database.prepare(
    'SELECT COUNT(*) AS count FROM catalog_melds WHERE mine_type_id = ?'
  ).get(ELECTRONICS_CATALOG.mineType.id).count, 6);
  assert.equal(store.database.prepare(
    'SELECT COUNT(*) AS count FROM catalog_meld_requirements WHERE id BETWEEN 1807 AND 1836'
  ).get().count, 30);
  const availability = store.database.prepare(`
    SELECT world_maps.slug AS map_slug
    FROM catalog_city_mine_types
    JOIN catalog_cities ON catalog_cities.id = catalog_city_mine_types.city_id
    JOIN world_maps ON world_maps.id = catalog_cities.map_id
    WHERE catalog_city_mine_types.mine_type_id = ?
  `).all(ELECTRONICS_CATALOG.mineType.id);
  assert.equal(availability.length, 5);
  assert.ok(availability.every((entry) => entry.map_slug === 'ebeko'));
  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count
    FROM catalog_city_mine_types
    JOIN catalog_cities ON catalog_cities.id = catalog_city_mine_types.city_id
    JOIN world_maps ON world_maps.id = catalog_cities.map_id
    WHERE catalog_city_mine_types.mine_type_id = ? AND world_maps.slug <> 'ebeko'
  `).get(ELECTRONICS_CATALOG.mineType.id).count, 0);
});

test('installs ominous Relics and their Melds only in Fogo', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-relics-migration-'));
  const databaseFile = path.join(directory, 'game.sqlite');
  let store = new SqliteStore(databaseFile);
  context.after(() => {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  store.seedCatalog(catalog);
  store.ensureWorldMaps(1000);
  store.database.prepare(
    "DELETE FROM schema_migrations WHERE name IN ('relics-catalog-v1', 'relics-fogo-v1')"
  ).run();
  store.database.prepare(
    'DELETE FROM catalog_city_mine_types WHERE mine_type_id = ?'
  ).run(RELICS_CATALOG.mineType.id);
  store.database.prepare(
    'DELETE FROM catalog_meld_requirements WHERE id BETWEEN 1837 AND 1866'
  ).run();
  store.database.prepare(
    'DELETE FROM catalog_melds WHERE mine_type_id = ?'
  ).run(RELICS_CATALOG.mineType.id);
  store.database.prepare(
    'DELETE FROM catalog_items WHERE mine_type_id = ?'
  ).run(RELICS_CATALOG.mineType.id);
  store.database.prepare(
    'DELETE FROM catalog_mine_types WHERE id = ?'
  ).run(RELICS_CATALOG.mineType.id);
  store.close();

  store = new SqliteStore(databaseFile);
  assert.equal(store.database.prepare('PRAGMA user_version').get().user_version, 112);
  const relicItems = store.database.prepare(`
    SELECT name, rarity, description, icon, icon_source, can_find, has_large_image
    FROM catalog_items WHERE mine_type_id = ? ORDER BY rarity, id
  `).all(RELICS_CATALOG.mineType.id);
  assert.equal(relicItems.length, 30);
  assert.ok(relicItems.every((item) => item.can_find === 1
    && item.has_large_image === 1 && item.icon_source === 'relic-svg'
    && item.description.length > 20));
  assert.deepEqual(relicItems.map((item) => item.icon),
    RELICS_CATALOG.items.map((item) => item.icon));
  assert.equal(store.database.prepare(
    'SELECT COUNT(*) AS count FROM catalog_melds WHERE mine_type_id = ?'
  ).get(RELICS_CATALOG.mineType.id).count, 6);
  assert.equal(store.database.prepare(
    'SELECT COUNT(*) AS count FROM catalog_meld_requirements WHERE id BETWEEN 1837 AND 1866'
  ).get().count, 30);
  const availability = store.database.prepare(`
    SELECT world_maps.slug AS map_slug
    FROM catalog_city_mine_types
    JOIN catalog_cities ON catalog_cities.id = catalog_city_mine_types.city_id
    JOIN world_maps ON world_maps.id = catalog_cities.map_id
    WHERE catalog_city_mine_types.mine_type_id = ?
  `).all(RELICS_CATALOG.mineType.id);
  assert.equal(availability.length, 5);
  assert.ok(availability.every((entry) => entry.map_slug === 'fogo'));
  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count
    FROM catalog_city_mine_types
    JOIN catalog_cities ON catalog_cities.id = catalog_city_mine_types.city_id
    JOIN world_maps ON world_maps.id = catalog_cities.map_id
    WHERE catalog_city_mine_types.mine_type_id = ? AND world_maps.slug <> 'fogo'
  `).get(RELICS_CATALOG.mineType.id).count, 0);
});

test('seeds and reloads the legacy gameplay catalog from SQLite', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const restored = store.loadCatalog();

  assert.equal(restored.items.length, catalog.items.length);
  assert.equal(restored.byId.get(1).goldValue, Math.floor(catalog.byId.get(1).goldValue));
  assert.equal(restored.byId.get(1).iconSource, catalog.byId.get(1).iconSource);
  assert.equal(restored.byId.get(1).largeImage, catalog.byId.get(1).largeImage);
  assert.equal(restored.byId.get(1).name, 'Sneakers');
  assert.equal(restored.mineTypes.find((mineType) => mineType.id === 1).name, 'Starter');
  assert.equal(restored.cities[0].name, "Tzolk'in");
  assert.ok(restored.byMineType.get(1).get(1).length > 0);
  assert.equal(restored.routes.length, catalog.routes.length);
  assert.equal(restored.cityMineTypes.length, catalog.cityMineTypes.length);
  assert.deepEqual(restored.mineTypesByCity.get(5).map((mineType) => mineType.name), ['Cannons', 'Ships', 'Spices']);
  assert.equal(restored.vehicles.length, catalog.vehicles.length);
  assert.equal(restored.equipment.length, 43);
  assert.equal(restored.explosives.length, 6);
  assert.equal(restored.robots.length, 28);
  assert.equal(restored.melds.length, 221);
  assert.equal(restored.meldRequirements.length, 786);
  assert.equal(restored.gadgets.length, 13);
  assert.equal(restored.gadgetItems.length, 38);
  assert.equal(restored.factoryActions.length, 18);
  assert.equal(restored.factoryActions.find((action) => action.id === 1).actionKind, 'build');
  assert.deepEqual(
    restored.factoryActions.filter((action) => action.id >= 15 && action.id <= 17)
      .map((action) => action.outputQuantity),
    [20, 20, 20]
  );
  assert.equal(restored.weapons.length, 30);
  assert.equal(restored.mods.length, 72);
  assert.equal(restored.rarities.length, 7);
  assert.equal(restored.equipmentTypes.length, 7);
  assert.equal(restored.botParts.length, 13);
  assert.equal(restored.specialisations.length, 11);
  assert.equal(restored.dwarfTiers.length, 6);
  assert.deepEqual(
    restored.dwarfTiers.map((tier) => [tier.minimumFindRarity, tier.maximumFindRarity]),
    [[1, 1], [1, 2], [1, 3], [2, 4], [3, 5], [4, 6]]
  );
  assert.equal(restored.settings.shots_per_crate, 12);
  assert.match(restored.machineTypeById.get(
    restored.machineTypes.find((entry) => entry.name === 'pump').id
  ).description, /Pumps oil from the ground/);

  store.database.prepare(`
    UPDATE catalog_items
    SET name = 'Database Sneakers', gold_value_units = 1234567,
      icon = '/database/icon.png', icon_source = 'database',
      large_image = '/database/large.png', has_large_image = 1
    WHERE id = 1
  `).run();
  store.database.prepare("UPDATE catalog_rarities SET name = 'Database rarity' WHERE id = 1").run();
  store.database.prepare("UPDATE catalog_equipment_types SET name = 'Database slot' WHERE id = 1").run();
  store.database.prepare("UPDATE catalog_bot_parts SET label = 'Database part', cost_units = 1234 WHERE id = 1").run();
  store.database.prepare("UPDATE catalog_specialisations SET name = 'Database Bum' WHERE id = 0").run();
  store.database.prepare(`
    UPDATE catalog_specialisation_bonuses SET bonus = 0.37
    WHERE specialisation_id = 0 AND bonus_key = 'mineGold'
  `).run();
  store.database.prepare('UPDATE catalog_dwarf_tiers SET disappearance_chance = 0.17 WHERE rarity = 1').run();
  store.database.prepare(`
    UPDATE catalog_dwarf_tiers
    SET minimum_find_rarity = 5, maximum_find_rarity = 6 WHERE rarity = 1
  `).run();
  store.database.prepare("UPDATE catalog_settings SET value_json = '19' WHERE key = 'shots_per_crate'").run();
  store.database.prepare("UPDATE catalog_labels SET name = 'Database routes' WHERE domain = 'route_type' AND id = 0").run();
  store.database.prepare(`
    UPDATE catalog_machine_types
    SET description = 'Database machine description', display_power_multiplier = 7
    WHERE name = 'pump'
  `).run();
  const authoritativeCatalog = store.loadCatalog();
  const authoritative = authoritativeCatalog.byId.get(1);
  assert.equal(authoritative.name, 'Database Sneakers');
  assert.equal(authoritative.goldValue, 123.4567);
  assert.equal(authoritative.icon, '/database/icon.png');
  assert.equal(authoritative.iconSource, 'database');
  assert.equal(authoritative.largeImage, '/database/large.png');
  assert.equal(authoritative.hasLargeImage, true);
  assert.equal(authoritative.rarityName, 'Database rarity');
  assert.equal(authoritativeCatalog.equipmentTypeNames[1], 'Database slot');
  assert.equal(authoritativeCatalog.botPartById.get(1).label, 'Database part');
  assert.equal(authoritativeCatalog.botPartById.get(1).cost, 0.1234);
  assert.equal(authoritativeCatalog.specialisationById.get(0).name, 'Database Bum');
  assert.equal(authoritativeCatalog.specialisationById.get(0).bonuses.mineGold, 0.37);
  assert.equal(authoritativeCatalog.dwarfByRarity.get(1).disappearanceChance, 0.17);
  assert.equal(authoritativeCatalog.dwarfByRarity.get(1).minimumFindRarity, 5);
  assert.equal(authoritativeCatalog.dwarfByRarity.get(1).maximumFindRarity, 6);
  assert.equal(authoritativeCatalog.settings.shots_per_crate, 19);
  assert.equal(authoritativeCatalog.labels.route_type[0], 'Database routes');
  const authoritativePump = authoritativeCatalog.machineTypes.find((entry) => entry.name === 'pump');
  assert.equal(authoritativePump.description, 'Database machine description');
  assert.equal(authoritativePump.displayPowerMultiplier, 7);
  assert.equal(restored.cannons.length, 18);
  assert.equal(restored.containers.length, 8);
  assert.equal(restored.tiers.length, 36);
  assert.equal(restored.avatarElementTypes.length, 7);
  assert.equal(restored.avatarElements.length, 156);
  assert.equal(restored.stones.length, 42);
});

test('loads machine rules when optional fixed pipe power is omitted', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);

  const row = store.database.prepare(`
    SELECT id, rules_json FROM catalog_machine_types WHERE behavior_key = 'pump'
  `).get();
  const rules = JSON.parse(row.rules_json);
  delete rules.fixedPipePower;
  store.database.prepare(`
    UPDATE catalog_machine_types SET rules_json = ? WHERE id = ?
  `).run(JSON.stringify(rules), row.id);

  const loaded = store.loadCatalog();
  assert.equal(loaded.machineTypeById.get(row.id).rules.fixedPipePower, null);
});

test('applies live database rule edits to write-side gameplay without restarting', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const box = catalog.boxes[0];
  const ammo = catalog.cannonballByType.get(box.type);
  const dwarf = catalog.dwarfTiers[0];
  const player = createPlayer('Live Rules', '', 'hash', catalog, 1000, () => 0.5);
  player.inventory[box.itemId] = 2;
  player.inventory[dwarf.itemId] = 1;
  const vehicle = catalog.vehicles.find((entry) => entry.routeType === 0);
  const databaseFuel = catalog.items.find((item) => item.repairedItemId === null
    && item.id !== vehicle.itemId && item.id !== box.itemId && item.id !== dwarf.itemId);
  player.inventory[vehicle.itemId] = 1;
  player.inventory[databaseFuel.id] = 1;
  const saved = store.addPlayer(player);

  store.database.prepare('UPDATE catalog_bot_parts SET cost_units = 1234 WHERE id = 1').run();
  store.buyBotPart(saved.id, 1, 2000);
  assert.equal(store.playerById(saved.id, 2000).gold, 4.8766);

  store.database.prepare('UPDATE catalog_specialisations SET required_melds = 999 WHERE id = 1').run();
  assert.throws(() => store.changeProfession(saved.id, 1, 2000), /999 melds/);

  store.database.prepare('UPDATE catalog_dwarf_tiers SET disappearance_chance = 0.17 WHERE rarity = 1').run();
  assert.equal(store.dwarfStatus(saved.id).dwarves.find((entry) => entry.itemId === dwarf.itemId)
    .disappearanceChance, 0.17);

  store.database.prepare("UPDATE catalog_settings SET value_json = '9' WHERE key = 'ammo_box_crates'").run();
  assert.equal(store.openAmmoBox(saved.id, box.type, 2).crates, 18);
  assert.equal(store.playerById(saved.id).inventory[ammo.itemId], 18);

  const activeVehicleId = store.activateVehicle(saved.id, vehicle.itemId);
  store.database.prepare('UPDATE catalog_settings SET value_json = ? WHERE key = ?')
    .run(JSON.stringify(databaseFuel.id), 'oil_item_id');
  store.database.prepare("UPDATE catalog_items SET name = 'Database-defined vehicle fuel' WHERE id = ?")
    .run(databaseFuel.id);
  assert.equal(store.loadVehicleOil(saved.id, activeVehicleId),
    catalog.settings.trips_per_oil[catalog.byId.get(vehicle.itemId).rarity]);
  assert.equal(store.playerById(saved.id).inventory[databaseFuel.id] ?? 0, 0);
});

test('creates melds and activates legacy-duration gadgets atomically', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const player = store.addPlayer(createPlayer('Ada', '', 'hash', catalog, 1000, () => 0.5));
  const meld = catalog.meldById.get(52);
  for (const requirement of meld.requirements) player.inventory[requirement.itemId] = requirement.count;
  player.inventory[265] = 1;
  store.savePlayer(player);

  assert.equal(store.createMeld(player.id, meld.id, 2000).name, 'Sunday');
  const gadget = store.activateGadget(player.id, 265, 3000);
  assert.equal(gadget.name, 'hammer');
  assert.equal(gadget.behaviorKey, 'hammer');
  assert.equal(gadget.expiresAt, 3000 + 3.5 * 24 * 60 * 60 * 1000);
  const restored = store.playerById(player.id);
  assert.ok(restored.meldIds.includes(meld.id));
  assert.equal(restored.gadgets[0].name, 'hammer');
  assert.equal(restored.gadgets[0].behaviorKey, 'hammer');
  assert.equal(restored.inventory[265], undefined);
  for (const requirement of meld.requirements) assert.equal(restored.inventory[requirement.itemId], undefined);
});

test('refreshes the regional mine allowance when Remote Control starts and expires', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  store.ensureWorldMaps(1000);
  const worldCatalog = store.loadCatalog();
  const player = createPlayer(
    'Regional Controller', '', 'hash', worldCatalog, 1000, () => 0.5
  );
  const homeMapId = worldCatalog.cities.find((city) => city.id === player.cityId).mapId;
  const remoteCity = worldCatalog.cities.find((city) => city.mapId !== homeMapId);
  const mineType = worldCatalog.mineTypes.find(
    (entry) => entry.creditCost > 0 && worldCatalog.byMineType.has(entry.id)
  );
  const control = worldCatalog.gadgetByBehaviorKey.get('control');
  const activator = worldCatalog.gadgetItems.find((entry) => entry.gadgetId === control.id);
  assert.ok(remoteCity && mineType && activator);
  player.knownCityIds = [player.cityId, remoteCity.id];
  player.credits = mineType.creditCost * 10;
  player.inventory[activator.itemId] = 1;
  for (let index = 0; index < 7; index += 1) {
    buyMine(player, worldCatalog, mineType.id, 2000 + index, () => 0.5);
  }
  const saved = store.addPlayer(player);
  assert.equal(store.playerById(saved.id, 3000, { settle: false })
    .mines.filter((mine) => mine.active).length, 6);

  const gadget = store.activateGadget(saved.id, activator.itemId, 3000);
  assert.equal(store.playerById(saved.id, 3000, { settle: false })
    .mines.filter((mine) => mine.active).length, 8);

  store.settleMines(gadget.expiresAt + 1, () => 0.5);
  assert.equal(store.playerById(saved.id, gadget.expiresAt + 1, { settle: false })
    .mines.filter((mine) => mine.active).length, 6);
});

test('keeps gadget behavior live when editable gadget names change', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const warehouse = catalog.gadgetByBehaviorKey.get('warehouse');
  const activator = catalog.gadgetItems.find((entry) => entry.gadgetId === warehouse.id);
  const player = createPlayer('Renamed Gadget Tester', '', 'hash', catalog, 1000, () => 0.5);
  player.inventory[activator.itemId] = 1;
  const saved = store.addPlayer(player);
  store.activateGadget(saved.id, activator.itemId, 2000);

  store.database.prepare(`
    UPDATE catalog_gadgets SET name = ?, display_name = ? WHERE behavior_key = ?
  `).run('expanded_storehouse', 'Expanded Storehouse', 'warehouse');

  const liveCatalog = store.loadCatalog();
  assert.equal(liveCatalog.gadgetByBehaviorKey.get('warehouse').name, 'expanded_storehouse');
  assert.equal(store.playerById(saved.id, 3000).gadgets[0].behaviorKey, 'warehouse');
  assert.equal(store.inventoryCapacity(saved.id, 3000).warehouseBonus,
    Number(liveCatalog.settings.warehouse_capacity_bonus));
});

test('activates gadgets only from home-city inventory while visiting another city', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const itemId = 265;
  const player = createPlayer('Traveling Hacker', '', 'hash', catalog, 1000, () => 0.5);
  delete player.inventoryByCity[1][itemId];
  player.knownCityIds = [1, 2];
  player.cityId = 2;
  player.inventoryByCity[2] = { [itemId]: 2 };
  player.inventory = player.inventoryByCity[2];
  const saved = store.addPlayer(player);

  assert.throws(() => store.activateGadget(saved.id, itemId, 2000), /home city/);
  assert.equal(store.playerById(saved.id, 2000).inventory[itemId], 2);
  assert.equal(store.playerById(saved.id, 2000).gadgets.length, 0);

  store.database.prepare(`
    INSERT INTO inventory (player_id, city_id, item_id, quantity) VALUES (?, 1, ?, 1)
  `).run(saved.id, itemId);
  assert.equal(store.activateGadget(saved.id, itemId, 3000).name, 'hammer');
  const restored = store.playerById(saved.id, 3000);
  assert.equal(restored.inventoryByCity[1]?.[itemId], undefined);
  assert.equal(restored.inventoryByCity[2][itemId], 2);
  assert.equal(restored.gadgets[0].name, 'hammer');
});

test('creates melds from the fixed regional capital only while the miner is there', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  store.ensureWorldMaps(1000);
  const worldCatalog = store.loadCatalog();
  const aso = worldCatalog.maps.find((map) => map.slug === 'aso');
  const capitalCityId = aso.capitalCityId;
  const awayCityId = worldCatalog.cities.find((city) =>
    city.mapId === aso.id && city.id !== capitalCityId).id;
  const meld = worldCatalog.meldById.get(52);
  const player = createPlayer('Remote Melder', '', 'hash', worldCatalog, 1000, () => 0.5);
  player.knownCityIds = [capitalCityId, awayCityId];
  player.cityId = awayCityId;
  player.inventoryByCity[awayCityId] = {};
  for (const requirement of meld.requirements) {
    player.inventoryByCity[capitalCityId][requirement.itemId] =
      (player.inventoryByCity[capitalCityId][requirement.itemId] ?? 0) + requirement.count;
    player.inventoryByCity[awayCityId][requirement.itemId] = requirement.count + 3;
  }
  player.inventory = player.inventoryByCity[awayCityId];
  const saved = store.addPlayer(player);
  const capitalBefore = structuredClone(
    store.playerById(saved.id).inventoryByCity[capitalCityId]
  );
  const outpostBefore = structuredClone(
    store.playerById(saved.id).inventoryByCity[awayCityId]
  );

  assert.throws(() => store.createMeld(saved.id, meld.id, 1999), /region.*capital/i);
  store.changeCity(saved.id, capitalCityId, 2000);
  assert.equal(store.createMeld(saved.id, meld.id, 2001).name, meld.name);
  const restored = store.playerById(saved.id, 2001);
  for (const requirement of meld.requirements) {
    assert.equal(restored.inventoryByCity[capitalCityId]?.[requirement.itemId] ?? 0,
      (capitalBefore[requirement.itemId] ?? 0) - requirement.count);
    assert.equal(restored.inventoryByCity[awayCityId][requirement.itemId],
      outpostBefore[requirement.itemId], 'outpost inventory must not be remotely consumed');
  }
});

test('stages needed items outside inventory capacity and creates melds without finding events', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const meld = catalog.meldById.get(52);
  const requirementIds = new Set(meld.requirements.map((requirement) => requirement.itemId));
  const unneededItem = catalog.items.find((item) => !requirementIds.has(item.id));
  const player = createPlayer('Automatic Melder', '', 'hash', catalog, 1000, () => 0.5);
  player.inventory = { [unneededItem.id]: 1 };
  for (const requirement of meld.requirements) {
    player.inventory[requirement.itemId] =
      (player.inventory[requirement.itemId] ?? 0) + requirement.count;
  }
  player.inventoryByCity = { [player.cityId]: player.inventory };
  const saved = store.addPlayer(player);
  const ownMeld = store.database.prepare(
    'INSERT INTO player_melds (player_id, meld_id, created_at) VALUES (?, ?, 1)'
  );
  for (const candidate of catalog.melds.filter((entry) => entry.public && entry.id !== meld.id)) {
    ownMeld.run(saved.id, candidate.id);
  }
  const findingRevision = store.latestLiveUpdateId();

  const initialCapacity = store.inventoryCapacity(saved.id).itemCount;
  const rejected = store.stageMeldItem(saved.id, unneededItem.id, 2000);
  assert.equal(rejected.deposited, false);
  assert.equal(rejected.noMoreNeeded, true);
  assert.equal(store.playerById(saved.id).inventory[unneededItem.id], 1);

  const created = [];
  for (const requirement of meld.requirements) {
    for (let quantity = 0; quantity < requirement.count; quantity += 1) {
      const result = store.stageMeldItem(saved.id, requirement.itemId, 2001 + created.length);
      assert.equal(result.deposited, true);
      created.push(...result.createdMelds);
    }
  }
  const restored = store.playerById(saved.id);
  assert.deepEqual(created.map((entry) => entry.id), [meld.id]);
  assert.ok(restored.meldIds.includes(meld.id));
  assert.deepEqual(restored.meldStash, {});
  assert.equal(store.inventoryCapacity(saved.id).itemCount, 1);
  assert.ok(initialCapacity > store.inventoryCapacity(saved.id).itemCount);
  assert.equal(store.liveUpdatesAfter(findingRevision)
    .filter((event) => event.eventType === 'items-found').length, 0,
  'meld completion does not masquerade as a newly found item');
  assert.ok(store.stonesForPlayer(saved.id).earned.some((stone) => stone.name === 'Melded'));
});

test('only stages Meld items while the player is in the regional capital', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  store.ensureWorldMaps(1000);
  const worldCatalog = store.loadCatalog();
  const aso = worldCatalog.maps.find((map) => map.slug === 'aso');
  const capitalCityId = aso.capitalCityId;
  const awayCityId = worldCatalog.cities.find((city) =>
    city.mapId === aso.id && city.id !== capitalCityId).id;
  const meld = worldCatalog.meldById.get(52);
  const requirement = meld.requirements[0];
  const player = createPlayer(
    'Traveling Melder', '', 'hash', worldCatalog, 1000, () => 0.5
  );
  player.cityId = awayCityId;
  player.knownCityIds = [capitalCityId, awayCityId];
  player.inventoryByCity = {
    [capitalCityId]: {}, [awayCityId]: { [requirement.itemId]: 1 }
  };
  player.inventory = player.inventoryByCity[awayCityId];
  const saved = store.addPlayer(player);
  const ownMeld = store.database.prepare(
    'INSERT INTO player_melds (player_id, meld_id, created_at) VALUES (?, ?, 1)'
  );
  for (const candidate of worldCatalog.melds.filter(
    (entry) => entry.public && entry.id !== meld.id
  )) {
    ownMeld.run(saved.id, candidate.id);
  }

  assert.ok(store.remainingMeldItemNeeds(saved.id)[requirement.itemId] > 0);
  assert.throws(
    () => store.stageMeldItem(saved.id, requirement.itemId, 2000),
    /region.*capital/i
  );
  const restored = store.playerById(saved.id);
  assert.equal(restored.inventoryByCity[awayCityId][requirement.itemId], 1);
  assert.deepEqual(restored.meldStash, {});
});

test('awards each original stone once and persists achievement progress', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const player = store.addPlayer(createPlayer('Stone Keeper', '', 'hash', catalog, 1000, () => 0.5));

  store.database.prepare(
    "UPDATE catalog_stones SET name = 'Conversationalist' WHERE behavior_key = 'Chatted'"
  ).run();
  store.database.prepare(
    "UPDATE catalog_stones SET rarity = 6 WHERE behavior_key = 'Chatted'"
  ).run();
  const awarded = store.awardStone(player.id, 'Chatted', 2000);
  assert.equal(awarded.rarity, 6);
  assert.equal(awarded.name, 'Conversationalist');
  assert.equal(awarded.behaviorKey, 'Chatted');
  assert.equal(store.awardStone(player.id, 'Chatted', 3000), null);
  assert.equal(store.playerById(player.id, 3000).stoneCount, 1);
  const progress = store.stonesForPlayer(player.id);
  assert.equal(progress.earned.length, 1);
  assert.equal(progress.next.length, 41);
  assert.equal(progress.earned[0].name, 'Conversationalist');
  assert.equal(progress.earned[0].rarity, 6);
  const messages = store.recentMessages(player.id, 'all', 'Stone');
  assert.equal(messages.length, 1);
  assert.equal(messages[0].details.behaviorKey, 'Chatted');
  assert.ok(messages[0].actionLinks.some((action) => action.href === '/stones'));
});

test('enforces and renders the four original gadget reports from SQLite data', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const player = store.addPlayer(createPlayer('Reporter', '', 'hash', catalog, 1000, () => 0.5));
  for (const itemId of [261, 263, 273, 275]) player.inventory[itemId] = 1;
  store.savePlayer(player);

  assert.throws(() => store.ledgerReport(player.id, 0, 2000), /active ledger/);
  store.activateGadget(player.id, 261, 2000);
  store.activateGadget(player.id, 263, 2000);
  store.activateGadget(player.id, 273, 2000);
  store.activateGadget(player.id, 275, 2000);

  const ledger = store.ledgerReport(player.id, 0, 3000);
  assert.equal(ledger.months.length, 12);
  assert.equal(ledger.rows.length, 0);
  const counterparty = store.addPlayer(
    createPlayer('Report Counterparty', '', 'hash', catalog, 1000, () => 0.5)
  );
  const itemId = catalog.items[0].id;
  const insertSale = store.database.prepare(`
    INSERT INTO market_sales
      (buyer_id, seller_id, city_id, item_id, price_units, quantity, created_at)
    VALUES (?, ?, 1, ?, ?, ?, ?)
  `);
  insertSale.run(counterparty.id, player.id, itemId, 10000, 2, 2500);
  insertSale.run(player.id, counterparty.id, itemId, 30000, 1, 2600);
  store.database.prepare('UPDATE catalog_settings SET value_json = ? WHERE key = ?').run(
    JSON.stringify({ actions: { sale: 'Live disposal', purchase: 'Live acquisition' } }),
    'ledger_report_labels'
  );
  const liveLedger = store.ledgerReport(player.id, 0, 3000);
  assert.deepEqual(liveLedger.rows.map((row) => [row.kind, row.action]), [
    ['sale', 'Live disposal'], ['purchase', 'Live acquisition']
  ]);
  assert.equal(liveLedger.totalSales, 2);
  assert.equal(liveLedger.totalPurchases, 3);
  assert.equal(liveLedger.profit, -1);
  assert.deepEqual(store.medalDetectorReport(player.id, 3000), []);
  const spreadsheet = store.spreadsheetReport(player.id, {}, 3000);
  assert.equal(spreadsheet.cities.length, 1);
  assert.deepEqual(spreadsheet.rows, []);
  const calculator = store.calculatorReport(player.id, 3000);
  assert.deepEqual(calculator.map((category) => category.name), ['Findings', 'Things', 'Mines and vehicles']);
  assert.ok(calculator[1].stats.find(([label]) => label === 'Total things owned'));
  const calculatorLabels = structuredClone(catalog.settings.calculator_report_labels);
  calculatorLabels.sections.things = 'Live Inventory';
  calculatorLabels.rows.totalThings = 'Live total';
  calculatorLabels.suffixes.rarityOwned = ' live things';
  store.database.prepare('UPDATE catalog_settings SET value_json = ? WHERE key = ?')
    .run(JSON.stringify(calculatorLabels), 'calculator_report_labels');
  const liveCalculator = store.calculatorReport(player.id, 3000);
  assert.equal(liveCalculator[1].name, 'Live Inventory');
  assert.ok(liveCalculator[1].stats.some(([label]) => label === 'Live total'));
  assert.ok(liveCalculator[1].stats.some(([label]) => label.endsWith(' live things')));
});

test('persists mine equipment and robot assignments', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const player = store.addPlayer(createPlayer('Ada', '', 'hash', catalog, 1000, () => 0.5));
  player.mines[0].equipment = { 4: 51 };
  player.mines[0].robotItemId = 340;
  store.savePlayer(player);
  const restored = store.playerById(player.id);
  assert.deepEqual(restored.mines[0].equipment, { 4: 51 });
  assert.equal(restored.mines[0].robotItemId, 340);
});

test('persists mine priority and bot-oil expiry', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  const player = store.addPlayer(createPlayer('MineState', '', 'hash', catalog, 1000, () => 0.5));
  const saved = store.playerById(player.id);
  saved.mines[0].priority = 3;
  saved.mines[0].oilExpiresAt = 987654;
  store.savePlayer(saved);
  const restored = store.playerById(player.id).mines[0];
  assert.equal(restored.priority, 3);
  assert.equal(restored.oilExpiresAt, 987654);
});

test('recharges meld-scaled batteries and pauses mine time while empty', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  const player = store.addPlayer(createPlayer('BatteryBot', '', 'hash', catalog, 1000, () => 0.5));
  store.database.prepare('UPDATE players SET battery_expires_at = ? WHERE id = ?').run(2000, player.id);
  store.database.prepare('UPDATE mines SET next_find_at = ? WHERE player_id = ?').run(3000, player.id);
  const result = store.rechargeBattery(player.id, 5000);
  assert.equal(result.expiresAt, 5000 + 20 * 60 * 60 * 1000);
  assert.equal(store.playerById(player.id).mines[0].nextFindAt, 6000);
});

test('buys the original ten-day battery extension only while charged', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const player = store.addPlayer(createPlayer('Battery Buyer', '', 'hash', catalog, 1000, () => 0.5));
  store.database.prepare('UPDATE players SET battery_expires_at = ?, credits = 20 WHERE id = ?')
    .run(3000, player.id);

  const result = store.extendBattery(player.id, 2000);
  assert.equal(result.cost, 9);
  assert.equal(result.credits, 11);
  assert.equal(result.expiresAt, 2000 + 20 * 60 * 60 * 1000 + 10 * 24 * 60 * 60 * 1000);
  assert.equal(store.playerById(player.id, 2000).credits, 11);

  store.database.prepare('UPDATE players SET battery_expires_at = 1999 WHERE id = ?').run(player.id);
  assert.throws(() => store.extendBattery(player.id, 2000), /Recharge your current batteries/);
  assert.equal(store.playerById(player.id, 2000).credits, 11);
});

test('restores per-specialisation charged-time titles and preserves progress when switching', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const day = Number(catalog.settings.day_ms);
  const startedAt = 1000;
  const highwayman = createPlayer(
    'Tenured Highwayman', '', 'hash', catalog, startedAt, () => 0.5
  );
  highwayman.profession = 2;
  highwayman.batteryExpiresAt = startedAt + 1200 * day;
  const player = store.addPlayer(highwayman);
  const addMeld = store.database.prepare(
    'INSERT INTO player_melds (player_id, meld_id, created_at) VALUES (?, ?, ?)'
  );
  for (const meld of catalog.melds.slice(0, 30)) addMeld.run(player.id, meld.id, startedAt);

  let restored = store.playerById(player.id, startedAt + 3 * day);
  assert.equal(restored.professionTitle, 'New');
  assert.equal(restored.specialisationTenure.find((entry) =>
    entry.specialisationId === 2).activeDays, 3);

  store.changeProfession(player.id, 1, startedAt + 4 * day);
  store.changeProfession(player.id, 2, startedAt + 9 * day);
  restored = store.playerById(player.id, startedAt + 1049 * day);
  const highwaymanTenure = restored.specialisationTenure.find(
    (entry) => entry.specialisationId === 2
  );
  const traderTenure = restored.specialisationTenure.find(
    (entry) => entry.specialisationId === 1
  );
  assert.equal(highwaymanTenure.activeDays, 1044);
  assert.equal(highwaymanTenure.title, 'Grandmaster');
  assert.equal(highwaymanTenure.nextTitle, null);
  assert.equal(traderTenure.activeDays, 5);
  assert.equal(restored.professionTitle, 'Grandmaster');
});

test('counts only charged time toward specialisation tenure across an empty-battery gap', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const day = Number(catalog.settings.day_ms);
  const startedAt = 1000;
  const player = store.addPlayer(
    createPlayer('Battery Tenure', '', 'hash', catalog, startedAt, () => 0.5)
  );
  store.database.prepare('UPDATE players SET battery_expires_at = ? WHERE id = ?')
    .run(startedAt + 2 * day, player.id);

  let restored = store.playerById(player.id, startedAt + 5 * day);
  let tenure = restored.specialisationTenure.find((entry) => entry.specialisationId === 0);
  assert.equal(tenure.activeMs, 2 * day);
  store.rechargeBattery(player.id, startedAt + 5 * day);
  restored = store.playerById(player.id, startedAt + 6 * day);
  tenure = restored.specialisationTenure.find((entry) => entry.specialisationId === 0);
  assert.equal(tenure.activeMs, 2 * day + 20 * 60 * 60 * 1000);
  assert.equal(tenure.activeDays, 2);
  assert.equal(tenure.title, 'Newb');
});

test('purchases prerequisite-gated original bot parts with gold', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  const player = store.addPlayer(createPlayer('PartBuilder', '', 'hash', catalog, 1000, () => 0.5));
  store.database.prepare('UPDATE players SET gold_units = 10000 WHERE id = ?').run(player.id);
  assert.throws(() => store.buyBotPart(player.id, 3, 2000), /prerequisite/);
  assert.equal(store.buyBotPart(player.id, 1, 2000).name, 'chest');
  assert.equal(store.buyBotPart(player.id, 3, 3000).name, 'LUarm');
  const restored = store.playerById(player.id);
  assert.deepEqual(restored.botPartIds, [1, 3]);
  assert.equal(restored.gold, 0.9991);
  assert.throws(() => store.buyBotPart(player.id, 1, 4000), /already own/);
});

test('accrues Bum gold continuously while batteries are charged', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const bum = store.addPlayer(createPlayer('Continuous Bum', '', 'hash', catalog, 1000, () => 0.5));
  bum.mines[0].mineThings = false;
  store.savePlayer(bum);

  const afterOneHour = store.playerById(bum.id, 1000 + 60 * 60 * 1000);
  assert.equal(afterOneHour.gold, 6.224);
  const afterBatteryExpiry = store.playerById(bum.id, 1000 + 30 * 60 * 60 * 1000);
  assert.equal(afterBatteryExpiry.gold, 29.48);
});

test('settles automatic mine gold exactly at specialisation changes', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const hour = 60 * 60 * 1000;

  const entering = createPlayer('Entering Bum', '', 'hash', catalog, 1000, () => 0.5);
  entering.profession = 1;
  entering.mines[0].mineThings = false;
  const savedEntering = store.addPlayer(entering);
  store.changeProfession(savedEntering.id, 0, 1000 + hour);
  assert.equal(store.playerById(savedEntering.id, 1000 + 2 * hour).gold, 6.224,
    'time before becoming a Bum is not backdated');

  const leaving = createPlayer('Leaving Bum', '', 'hash', catalog, 1000, () => 0.5);
  leaving.mines[0].mineThings = false;
  const savedLeaving = store.addPlayer(leaving);
  store.changeProfession(savedLeaving.id, 1, 1000 + hour);
  assert.equal(store.playerById(savedLeaving.id, 1000 + 2 * hour).gold, 6.224,
    'earned Bum gold is retained and time after leaving is not included');
});

test('keeps the former Bum theft event retired under bonus-only specialisations', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const bum = store.addPlayer(createPlayer('Bonus Bum', '', 'hash', catalog, 1000, () => 0.5));
  assert.equal(store.runBumUpdate(2000, () => 0, true), null);
  assert.equal(store.database.prepare('SELECT COUNT(*) AS count FROM bum_thefts').get().count, 0);
  assert.equal(store.playerById(bum.id, 2000).profession, 0);
});

test('builds public server statistics from charged miners', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const player = store.addPlayer(createPlayer('Statistician', '', 'hash', catalog, 1000, () => 0.5));
  const stats = store.publicStats(2000);
  const rows = (report, key) => report.find((section) => section.key === key).rows;
  assert.equal(rows(stats, 'activeMiners')[0][1], 1);
  assert.equal(rows(stats, 'activeMines').find(([label]) => label === 'Total')[1], 1);
  assert.equal(rows(stats, 'specialisations').find(([label]) => label === 'Bum')[1], 1);
  store.database.prepare(`
    UPDATE catalog_specialisation_bonuses
    SET bonus = CASE WHEN specialisation_id = 0 THEN 0.2 ELSE 0 END
    WHERE bonus_key IN ('factoryThroughput', 'workerThroughput')
  `).run();
  assert.match(rows(store.publicStats(2000), 'cities')[0][1], /1 manufacturers · 1 workers/);
  store.database.prepare('UPDATE players SET battery_expires_at = 0 WHERE id = ?').run(player.id);
  assert.equal(rows(store.publicStats(2000), 'activeMiners')[0][1], 0);
  store.database.prepare('UPDATE players SET battery_expires_at = 9999 WHERE id = ?').run(player.id);
  const statsLabels = structuredClone(catalog.settings.public_stats_labels);
  statsLabels.sections.activeMiners = 'Live Miners';
  statsLabels.rows.activePopulation = 'Live population';
  statsLabels.mineModes.thingsPrefix = 'Live mining ';
  store.database.prepare('UPDATE catalog_settings SET value_json = ? WHERE key = ?')
    .run(JSON.stringify(statsLabels), 'public_stats_labels');
  const liveStats = store.publicStats(2000);
  assert.equal(liveStats.find((section) => section.key === 'activeMiners').heading, 'Live Miners');
  assert.equal(rows(liveStats, 'activeMiners')[0][0], 'Live population');
  assert.ok(rows(liveStats, 'activeMines').some(([label]) => label.startsWith('Live mining ')));
});

test('applies live database result and feed limits without restarting', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const sender = store.addPlayer(createPlayer('Limit Alpha', '', 'hash', catalog, 1000, () => 0.5));
  const recipient = store.addPlayer(createPlayer('Limit Beta', '', 'hash', catalog, 1000, () => 0.5));
  store.addPlayer(createPlayer('Limit Gamma', '', 'hash', catalog, 1000, () => 0.5));
  for (let index = 0; index < 3; index += 1) {
    store.sendMessage(sender.id, recipient.name, `Message ${index}`, 2000 + index);
  }
  store.database.exec(`
    UPDATE catalog_settings SET value_json = '1' WHERE key = 'miner_search_result_limit';
    UPDATE catalog_settings SET value_json = '1' WHERE key = 'message_list_limit';
    UPDATE catalog_settings SET value_json = '2' WHERE key = 'conversation_message_limit';
    UPDATE catalog_settings SET value_json = '1' WHERE key = 'dwarf_findings_feed_limit';
  `);
  store.database.prepare('UPDATE discoveries SET dwarfed = 1 WHERE player_id = ?').run(sender.id);

  assert.equal(store.listMiners('Limit').length, 1);
  assert.equal(store.recentMessages(recipient.id).length, 1);
  assert.equal(store.conversation(recipient.id, sender.name).messages.length, 2);
  assert.equal(store.dwarfStatus(sender.id).findings.length, 1);
});

test('equips owned avatar layers and applies the original background capacity bonus', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const player = store.addPlayer(createPlayer('AvatarMiner', '', 'hash', catalog, 1000, () => 0.5));
  const picks = [1, 19, 37].map((id) => catalog.avatarElements.find((element) => element.id === id));
  const stocked = store.playerById(player.id);
  for (const pick of picks) stocked.inventory[pick.itemId] = (stocked.inventory[pick.itemId] ?? 0) + 1;
  store.savePlayer(stocked);
  const enriched = catalog.avatarElements.map((element) => ({
    ...element, rarity: catalog.byId.get(element.itemId).rarity
  }));
  assert.equal(store.saveAvatar(player.id, picks.map((pick) => pick.id), enriched), 3);
  const restored = store.playerById(player.id);
  assert.equal(restored.avatarLayers.length, 3);
  assert.equal(restored.avatarBonus, 20 + 5 * catalog.byId.get(picks[1].itemId).rarity);
  assert.equal(restored.inventory[picks[0].itemId], undefined);
});

test('runs meld-gated factory construction and damaged-item repair with contracted workers', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const maker = store.addPlayer(createPlayer('Maker', '', 'hash', catalog, 1000, () => 0.5));
  const worker = store.addPlayer(createPlayer('Worker', '', 'hash', catalog, 1000, () => 0.5));
  const meldIds = catalog.melds.slice(0, 50).map((meld) => meld.id);
  const addMeld = store.database.prepare(
    'INSERT INTO player_melds (player_id, meld_id, created_at) VALUES (?, ?, ?)'
  );
  for (const meldId of meldIds) addMeld.run(maker.id, meldId, 1);
  for (const meldId of meldIds.slice(0, 10)) addMeld.run(worker.id, meldId, 1);
  assert.equal(store.changeProfession(maker.id, 9).name, 'Manufacturer');
  assert.equal(store.changeProfession(worker.id, 8).name, 'Worker');

  const stocked = store.playerById(maker.id);
  stocked.inventory[368] = 30;
  stocked.inventory[369] = 1;
  store.savePlayer(stocked);
  store.hireWorker(maker.id, worker.id, 1000);
  store.database.prepare('UPDATE workers SET cph = 100 WHERE player_id = ?').run(worker.id);
  const factory = store.buildFactory(maker.id, 1000);
  store.assignFactoryWorker(maker.id, factory.id, worker.id, 1000);

  const buildFinishedAt = 1000 + 90 * 60 * 60 * 1000;
  assert.equal(store.factoriesForPlayer(maker.id, buildFinishedAt).completions[0].actionName, 'Build');
  store.database.prepare("UPDATE catalog_factory_actions SET name = 'Live restoration' WHERE id = 8").run();
  store.startFactoryAction(maker.id, factory.id, 8, 369, buildFinishedAt);
  const repairFinishedAt = buildFinishedAt + 12.5 * 60 * 60 * 1000;
  assert.equal(store.factoriesForPlayer(maker.id, repairFinishedAt).completions[0].actionName,
    'Live restoration');
  store.database.prepare("UPDATE catalog_factory_actions SET name = 'Live aircraft output' WHERE id = 10").run();
  store.database.prepare("UPDATE catalog_items SET name = 'Live reconnaissance craft' WHERE id = 737").run();
  store.startFactoryAction(maker.id, factory.id, 10, null, repairFinishedAt);
  const aircraftFinishedAt = repairFinishedAt + 30 * 60 * 60 * 1000;
  assert.equal(store.factoriesForPlayer(maker.id, aircraftFinishedAt).completions[0].actionName,
    'Live aircraft output');
  const restored = store.playerById(maker.id);
  assert.equal(restored.inventory[369], undefined);
  assert.equal(restored.inventory[1], 1);
  assert.equal(restored.inventory[368], 3);
  assert.equal(restored.inventory[737], 1);
  assert.equal(restored.protectedInventoryByCity[restored.cityId][1], 1);
  assert.equal(restored.protectedInventoryByCity[restored.cityId][737], 1);
  assert.throws(() => store.recycleInventory(maker.id, restored.cityId, 737, 1),
    /factory-made items/);
  assert.ok(store.stonesForPlayer(maker.id).earned.some((stone) => stone.name === 'Produced'));
  assert.deepEqual(store.recentMessages(maker.id, 'all', 'Factory')
    .map((message) => message.details.actionName).sort(),
  ['Build', 'Live aircraft output', 'Live restoration']);
});

test('builds mills from Calbuco onward and turns Wood into vehicle reinforcement', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  store.ensureWorldMaps(1000);
  const maker = store.addPlayer(createPlayer(
    'Millwright', '', 'hash', catalog, 1000, () => 0.5
  ));
  const bromo = store.database.prepare(
    'SELECT id, capital_city_id FROM world_maps WHERE sort_order = 2'
  ).get();
  const calbuco = store.database.prepare(
    'SELECT id, capital_city_id FROM world_maps WHERE sort_order = 3'
  ).get();
  for (const map of [bromo, calbuco]) {
    store.database.prepare(`
      INSERT OR IGNORE INTO known_cities (player_id, city_id) VALUES (?, ?)
    `).run(maker.id, map.capital_city_id);
  }
  store.database.prepare('UPDATE players SET city_id = ? WHERE id = ?')
    .run(bromo.capital_city_id, maker.id);
  assert.throws(() => store.buildMill(maker.id, 1100), /Calbuco and later regions/);

  store.database.prepare('UPDATE players SET city_id = ? WHERE id = ?')
    .run(calbuco.capital_city_id, maker.id);
  store.database.prepare('UPDATE players SET gold_units = ? WHERE id = ?')
    .run(2_000_000 * 10000, maker.id);
  const wood = WOOD_CATALOG.items.find((item) => item.rarity === 1);
  const buildAction = catalog.factoryActions.find((action) => action.actionKind === 'build');
  const landVehicle = catalog.vehicles.find((vehicle) => vehicle.routeType === 0
    && catalog.byId.get(vehicle.itemId).rarity === 1);
  const stock = store.database.prepare(`
    INSERT INTO inventory (player_id, city_id, item_id, quantity) VALUES (?, ?, ?, ?)
    ON CONFLICT (player_id, city_id, item_id)
    DO UPDATE SET quantity = inventory.quantity + excluded.quantity
  `);
  stock.run(maker.id, calbuco.capital_city_id, Number(catalog.settings.ore_item_id), 20);
  stock.run(maker.id, calbuco.capital_city_id, wood.id, 1);
  stock.run(maker.id, calbuco.capital_city_id, landVehicle.itemId, 1);
  const mill = store.buildMill(maker.id, 2000);
  const millBot = store.hireMillWorkerBot(maker.id, mill.id, 3, 2000);
  assert.equal(millBot.cph, 400);
  assert.equal(store.millsForPlayer(maker.id, 2000).mills[0].rate, 400);
  assert.ok(store.millsForPlayer(maker.id, 2000).mills[0].workers[0].isBot);
  const builtAt = 2000 + (buildAction.components / millBot.cph) * 60 * 60 * 1000;
  assert.equal(store.millsForPlayer(maker.id, builtAt).completions[0].actionName, 'Build');
  const vehicleId = store.activateVehicle(maker.id, landVehicle.itemId, builtAt);
  store.startMillReinforcement(maker.id, mill.id, vehicleId, wood.id, builtAt);
  const reinforceAction = catalog.factoryActions.find((action) =>
    action.actionKind === 'reinforce');
  const finishedAt = builtAt
    + (reinforceAction.components / millBot.cph) * 60 * 60 * 1000;
  assert.equal(store.millsForPlayer(maker.id, finishedAt).completions[0].actionName,
    'Reinforce vehicle');
  const reinforced = store.database.prepare(`
    SELECT reinforcement_strength, reinforcement_max, reinforcement_item_id
    FROM player_vehicles WHERE id = ?
  `).get(vehicleId);
  assert.deepEqual({ ...reinforced }, {
    reinforcement_strength: 5, reinforcement_max: 5,
    reinforcement_item_id: wood.id
  });
  assert.throws(() => store.storeVehicle(maker.id, vehicleId), /reinforced vehicle/);
  store.millsForPlayer(maker.id, millBot.expiresAt + 1);
  const expiry = store.recentMessages(maker.id, 'all', 'Factory')
    .find((message) => message.details.event === 'factory-worker-bot-expired');
  assert.equal(expiry.details.facilityKind, 'mill');
  assert.equal(expiry.details.actions[0].path, '/mills');
});

test('blocks contracted workers from being assigned to a factory in another city', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const maker = store.addPlayer(createPlayer('Local Factory Maker', '', 'hash', catalog, 1000, () => 0.5));
  const worker = store.addPlayer(createPlayer('Remote Factory Worker', '', 'hash', catalog, 1000, () => 0.5));
  store.database.prepare('UPDATE players SET profession = 9, city_id = 2 WHERE id = ?').run(maker.id);
  store.database.prepare('UPDATE players SET profession = 8, home_city_id = 2, city_id = 2 WHERE id = ?').run(worker.id);
  for (const meld of catalog.melds.slice(0, 10)) {
    store.database.prepare(
      'INSERT INTO player_melds (player_id, meld_id, created_at) VALUES (?, ?, 1)'
    ).run(worker.id, meld.id);
  }
  store.changeProfession(worker.id, 8);
  store.hireWorker(maker.id, worker.id, 1000);
  store.database.prepare('UPDATE players SET city_id = 1 WHERE id = ?').run(maker.id);
  const factoryId = Number(store.database.prepare(`
    INSERT INTO factories
      (owner_id, operator_id, city_id, built, factory_action_id, item_id,
       components_done, last_event_at, completion_at, created_at)
    VALUES (?, ?, 1, 1, NULL, NULL, 0, 1000, NULL, 1000)
  `).run(maker.id, maker.id).lastInsertRowid);

  assert.throws(() => store.assignFactoryWorker(maker.id, factoryId, worker.id, 1100),
    /based in another city/);
  assert.equal(store.database.prepare(
    'SELECT factory_id FROM workers WHERE player_id = ?'
  ).get(worker.id).factory_id, null);
});

test('persists factory queues, reserves inputs, reorders jobs, and advances automatically', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-factory-queue-'));
  const databaseFile = path.join(directory, 'game.sqlite');
  let store = new SqliteStore(databaseFile);
  context.after(() => {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  store.seedCatalog(catalog);
  const maker = store.addPlayer(createPlayer('Queue Maker', '', 'hash', catalog, 1000, () => 0.5));
  const stocked = store.playerById(maker.id);
  stocked.inventory[368] = 20;
  store.savePlayer(stocked);
  const factoryId = Number(store.database.prepare(`
    INSERT INTO factories
      (owner_id, operator_id, city_id, built, factory_action_id, item_id,
       components_done, last_event_at, completion_at, rental_expires, created_at)
    VALUES (?, ?, ?, 1, NULL, NULL, 0, 1000, NULL, NULL, 1000)
  `).run(maker.id, maker.id, maker.cityId).lastInsertRowid);
  store.database.prepare(`
    INSERT INTO factory_worker_bots
      (employer_id, factory_id, city_id, tier_id, name, cph, contract_expires, created_at)
    VALUES (?, ?, ?, 1, 'Queue bot', 1000, 1000000000, 1000)
  `).run(maker.id, factoryId, maker.cityId);
  const flower = catalog.factoryActions.find((action) => action.name === 'Flower');
  const thumper = catalog.factoryActions.find((action) => action.name === 'Thumper');
  const cannonballs = catalog.factoryActions.find((action) => action.name === '20 Boxes Cannonballs');

  assert.equal(store.startFactoryAction(maker.id, factoryId, flower.id, null, 2000).enqueued, false);
  const queuedThumper = store.startFactoryAction(maker.id, factoryId, thumper.id, null, 2001);
  const queuedCannonballs = store.startFactoryAction(maker.id, factoryId, cannonballs.id, null, 2002);
  assert.equal(queuedThumper.enqueued, true);
  assert.deepEqual(queuedCannonballs.queue.map((job) => job.actionName),
    ['Thumper', '20 Boxes Cannonballs']);
  assert.equal(store.playerById(maker.id).inventory[368], 15);

  store.close();
  store = new SqliteStore(databaseFile);
  let factory = store.factoriesForPlayer(maker.id, 2003).factories[0];
  assert.deepEqual(factory.queue.map((job) => job.actionName),
    ['Thumper', '20 Boxes Cannonballs']);

  store.reorderFactoryQueueJob(maker.id, factoryId, queuedCannonballs.queuedJob.id, 'up', 2004);
  assert.deepEqual(store.factoriesForPlayer(maker.id, 2004).factories[0].queue
    .map((job) => job.actionName), ['20 Boxes Cannonballs', 'Thumper']);
  assert.equal(store.cancelFactoryQueueJob(
    maker.id, factoryId, queuedThumper.queuedJob.id, 2005), 'Thumper');
  assert.equal(store.playerById(maker.id).inventory[368], 18);

  assert.equal(store.cancelFactoryAction(maker.id, factoryId, 2006), 'Flower');
  factory = store.factoriesForPlayer(maker.id, 2006).factories[0];
  assert.equal(factory.actionName, '20 Boxes Cannonballs');
  assert.equal(factory.queue.length, 0);
  assert.equal(store.playerById(maker.id).inventory[368], 19);

  store.startFactoryAction(maker.id, factoryId, flower.id, null, 2007);
  const completion = store.factoriesForPlayer(maker.id, 4_000_000).completions[0];
  assert.equal(completion.actionName, '20 Boxes Cannonballs');
  assert.equal(completion.nextActionName, 'Flower');
  factory = store.factoriesForPlayer(maker.id, 4_000_000).factories[0];
  assert.equal(factory.actionName, 'Flower');
  assert.equal(factory.queue.length, 0);
  assert.equal(store.playerById(maker.id).inventory[1269], 20);
});

test('trades whole factories and refunds factory-bid escrow', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const seller = store.addPlayer(createPlayer('Factory Seller', '', 'hash', catalog, 1000, () => 0.5));
  const buyer = store.addPlayer(createPlayer('Factory Buyer', '', 'hash', catalog, 1000, () => 0.5));
  const funded = store.playerById(buyer.id);
  funded.gold = 100;
  store.savePlayer(funded);
  const factory = store.database.prepare(`
    INSERT INTO factories
      (owner_id, operator_id, city_id, built, factory_action_id, item_id,
        components_done, last_event_at, completion_at, rental_expires, created_at)
    VALUES (?, ?, 1, 1, NULL, NULL, 0, 1000, NULL, NULL, 1000)
  `).run(seller.id, seller.id);

  const refundableBid = store.placeFactoryBuyOrder(buyer.id, 'sale', 7, 1, 1500);
  assert.equal(store.playerById(buyer.id).gold, 93);
  store.cancelFactoryMarketOrder(buyer.id, refundableBid);
  assert.equal(store.playerById(buyer.id).gold, 100);

  const listing = store.placeFactorySellOrder(seller.id, 'sale', 12, 1, 2000);
  const purchase = store.buyFactoryListing(buyer.id, listing, 1, 3000);
  assert.equal(purchase.cost, 12);
  assert.deepEqual(purchase.factoryIds, [Number(factory.lastInsertRowid)]);
  const transferred = store.database.prepare('SELECT * FROM factories WHERE id = ?')
    .get(Number(factory.lastInsertRowid));
  assert.equal(transferred.owner_id, buyer.id);
  assert.equal(transferred.operator_id, buyer.id);
  assert.equal(store.playerById(seller.id).gold, 17);
  assert.equal(store.playerById(buyer.id).gold, 88);
  assert.equal(store.factoryMarket('sale', 1, buyer.id, 3000).sales.length, 1);
  for (const participant of [seller, buyer]) {
    const messages = store.recentMessages(participant.id, 'all', 'Market');
    assert.equal(messages.length, 1);
    assert.ok(messages[0].actionLinks.some((action) => action.href === '/market/factories/sale'));
  }
});

test('runs original ten-day repair-only factory rentals and returns unfinished work', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const owner = store.addPlayer(createPlayer('Rental Owner', '', 'hash', catalog, 1000, () => 0.5));
  const renter = store.addPlayer(createPlayer('Rental Renter', '', 'hash', catalog, 1000, () => 0.5));
  const oldWorker = store.addPlayer(createPlayer('Old Factory Worker', '', 'hash', catalog, 1000, () => 0.5));
  const renterWorker = store.addPlayer(createPlayer('Renter Worker', '', 'hash', catalog, 1000, () => 0.5));
  const addMeld = store.database.prepare(
    'INSERT INTO player_melds (player_id, meld_id, created_at) VALUES (?, ?, 1)'
  );
  for (const meld of catalog.melds.slice(0, 50)) addMeld.run(owner.id, meld.id);
  for (const worker of [oldWorker, renterWorker]) {
    for (const meld of catalog.melds.slice(0, 10)) addMeld.run(worker.id, meld.id);
  }
  store.changeProfession(owner.id, 9);
  store.changeProfession(oldWorker.id, 8);
  store.changeProfession(renterWorker.id, 8);
  const funded = store.playerById(renter.id);
  funded.gold = 100;
  funded.inventory[368] = 20;
  funded.inventory[369] = 2;
  store.savePlayer(funded);
  const inserted = store.database.prepare(`
    INSERT INTO factories
      (owner_id, operator_id, city_id, built, factory_action_id, item_id,
        components_done, last_event_at, completion_at, rental_expires, created_at)
    VALUES (?, ?, 1, 1, NULL, NULL, 0, 1000, NULL, NULL, 1000)
  `).run(owner.id, owner.id);
  const factoryId = Number(inserted.lastInsertRowid);
  store.hireWorker(owner.id, oldWorker.id, 1100);
  store.assignFactoryWorker(owner.id, factoryId, oldWorker.id, 1100);

  const listing = store.placeFactorySellOrder(owner.id, 'rental', 9, 1, 2000);
  const rental = store.buyFactoryListing(renter.id, listing, 1, 3000);
  assert.equal(rental.marketType, 'rental');
  let factory = store.database.prepare('SELECT * FROM factories WHERE id = ?').get(factoryId);
  assert.equal(factory.owner_id, owner.id);
  assert.equal(factory.operator_id, renter.id);
  assert.equal(factory.rental_expires, 3000 + 10 * 24 * 60 * 60 * 1000);
  assert.equal(store.database.prepare('SELECT factory_id FROM workers WHERE player_id = ?')
    .get(oldWorker.id).factory_id, null);

  store.hireWorker(renter.id, renterWorker.id, 3500);
  store.assignFactoryWorker(renter.id, factoryId, renterWorker.id, 3500);
  const nonRepair = catalog.factoryActions.find((action) =>
    !['Build', 'Repair'].includes(action.name));
  assert.throws(() => store.startFactoryAction(renter.id, factoryId, nonRepair.id, null, 4000),
    /Rented factories can only repair/);
  const repair = catalog.factoryActions.find((action) => action.name === 'Repair');
  store.startFactoryAction(renter.id, factoryId, repair.id, 369, 4000);
  const queuedRepair = store.startFactoryAction(renter.id, factoryId, repair.id, 369, 4001);
  assert.equal(queuedRepair.enqueued, true);
  assert.equal(store.playerById(renter.id).inventory[368], 20 - repair.ore * 2);
  assert.equal(store.playerById(renter.id).inventory[369], undefined);

  store.factoriesForPlayer(renter.id, factory.rental_expires + 1);
  factory = store.database.prepare('SELECT * FROM factories WHERE id = ?').get(factoryId);
  assert.equal(factory.owner_id, owner.id);
  assert.equal(factory.operator_id, owner.id);
  assert.equal(factory.rental_expires, null);
  assert.equal(factory.factory_action_id, null);
  assert.equal(store.database.prepare('SELECT factory_id FROM workers WHERE player_id = ?')
    .get(renterWorker.id).factory_id, null);
  assert.equal(store.playerById(renter.id).inventory[368], 20);
  assert.equal(store.playerById(renter.id).inventory[369], 2);
  assert.ok(store.recentMessages(owner.id, 'all', 'Factory')
    .some((message) => message.details.event === 'factory-rental-returned'));
  assert.ok(store.recentMessages(renter.id, 'all', 'Factory')
    .some((message) => message.details.event === 'factory-rental-expired'
      && message.details.queuedJobs === 1));
});

test('caps owner-operated factory actions at five without limiting ownership', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const maker = store.addPlayer(createPlayer('Five Factory Maker', '', 'hash', catalog, 1000, () => 0.5));
  const addMeld = store.database.prepare(
    'INSERT INTO player_melds (player_id, meld_id, created_at) VALUES (?, ?, 1)'
  );
  for (const meld of catalog.melds.slice(0, 50)) addMeld.run(maker.id, meld.id);
  store.changeProfession(maker.id, 9);
  const stocked = store.playerById(maker.id);
  stocked.inventory[368] = 100;
  store.savePlayer(stocked);
  const action = catalog.factoryActions.find((entry) =>
    !['Build', 'Repair', 'Bot'].includes(entry.name) && !entry.name.startsWith('Ore '));
  const insertActive = store.database.prepare(`
    INSERT INTO factories
      (owner_id, operator_id, city_id, built, factory_action_id, item_id,
        components_done, last_event_at, completion_at, rental_expires, created_at)
    VALUES (?, ?, 1, 1, ?, NULL, 0, 1000, NULL, NULL, ?)
  `);
  for (let index = 0; index < 5; index += 1) insertActive.run(maker.id, maker.id, action.id, 1000 + index);
  const idle = store.database.prepare(`
    INSERT INTO factories
      (owner_id, operator_id, city_id, built, factory_action_id, item_id,
        components_done, last_event_at, completion_at, rental_expires, created_at)
    VALUES (?, ?, 1, 1, NULL, NULL, 0, 1000, NULL, NULL, 2000)
  `).run(maker.id, maker.id);
  assert.equal(store.database.prepare('SELECT COUNT(*) AS count FROM factories WHERE owner_id = ?')
    .get(maker.id).count, 6);
  assert.throws(() => store.startFactoryAction(
    maker.id, Number(idle.lastInsertRowid), action.id, null, 3000), /maximum of 5 active/);
  store.database.prepare(
    `UPDATE factories SET factory_action_id = NULL
     WHERE id = (SELECT MIN(id) FROM factories WHERE owner_id = ? AND id <> ?)`
  ).run(maker.id, Number(idle.lastInsertRowid));
  assert.equal(store.startFactoryAction(
    maker.id, Number(idle.lastInsertRowid), action.id, null, 4000).actionId, action.id);
});

test('hires expensive Factory Worker bots that add throughput and expire cleanly', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const player = store.addPlayer(createPlayer('Bot Magnate', '', 'hash', catalog, 1000, () => 0.5));
  store.database.prepare('UPDATE players SET gold_units = ? WHERE id = ?')
    .run(20_000_000 * 10000, player.id);
  const factoryId = Number(store.database.prepare(`
    INSERT INTO factories
      (owner_id, operator_id, city_id, built, factory_action_id, item_id,
       components_done, last_event_at, completion_at, rental_expires, created_at)
    VALUES (?, ?, ?, 1, NULL, NULL, 0, 1000, NULL, NULL, 1000)
  `).run(player.id, player.id, player.cityId).lastInsertRowid);

  const bot = store.hireFactoryWorkerBot(player.id, factoryId, 3, 2000);
  assert.equal(bot.cph, 400);
  assert.equal(store.factoriesForPlayer(player.id, 2000).factories[0].rate, 400);
  assert.equal(store.playerById(player.id).gold, 19_000_000);
  assert.ok(store.factoriesForPlayer(player.id, 2000).factories[0].workers[0].isBot);

  store.factoriesForPlayer(player.id, bot.expiresAt + 1);
  assert.equal(store.database.prepare(
    'SELECT COUNT(*) AS count FROM factory_worker_bots WHERE factory_id = ?'
  ).get(factoryId).count, 0);
  assert.equal(store.factoriesForPlayer(player.id, bot.expiresAt + 1).factories[0].rate, 0);
  assert.equal(store.recentMessages(player.id, 'all', 'Factory')
    .filter((message) => message.details.event === 'factory-worker-bot-expired').length, 1);
});

test('lets an available Worker oil themself from their home-city inventory', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const player = store.addPlayer(createPlayer('Self Oiler', '', 'hash', catalog, 1000, () => 0.5));
  const oil = catalog.items.find((item) => item.name === 'Oil');
  player.inventory[oil.id] = 1;
  store.savePlayer(player);
  const insertMeld = store.database.prepare(
    'INSERT INTO player_melds (player_id, meld_id, created_at) VALUES (?, ?, 1000)'
  );
  for (const meld of catalog.melds.filter((candidate) => candidate.public).slice(0, 10)) insertMeld.run(player.id, meld.id);
  store.changeProfession(player.id, 8);

  assert.equal(store.oilWorker(player.id, player.id, 2000), true);
  const restored = store.playerById(player.id, 2000);
  assert.equal(restored.worker.oiled, true);
  assert.equal(restored.worker.cph, 2.2);
  assert.equal(restored.inventory[oil.id], undefined);
});

test('persists profiles and private conversations', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  const ada = store.addPlayer(createPlayer('Ada', '', 'hash', catalog, 1000, () => 0.5));
  const grace = store.addPlayer(createPlayer('Grace', '', 'hash', catalog, 1000, () => 0.5));
  const aaron = store.addPlayer(createPlayer('Aaron', '', 'hash', catalog, 1000, () => 0.5));
  const addMeld = store.database.prepare(
    'INSERT INTO player_melds (player_id, meld_id, created_at) VALUES (?, ?, 1000)'
  );
  for (const meld of catalog.melds.slice(0, 20)) addMeld.run(grace.id, meld.id);

  store.updateDescription(ada.id, 'Collector of old machines.');
  store.sendMessage(ada.id, 'Grace', 'Found anything interesting?', 2000);
  assert.equal(store.findPlayer('Ada').description, 'Collector of old machines.');
  assert.equal(store.playerById(grace.id).unreadMessages, 1);
  const conversation = store.conversation(grace.id, 'Ada');
  assert.equal(conversation.messages[0].body, 'Found anything interesting?');
  assert.equal(store.playerById(grace.id).unreadMessages, 0);
  const rankedMiners = store.listMiners();
  assert.deepEqual(rankedMiners.map((miner) => miner.name), ['Grace', 'Aaron', 'Ada']);
  assert.deepEqual(rankedMiners.map((miner) => [miner.meldRank, miner.meldCount]),
    [[1, 20], [2, 0], [2, 0]], 'equal Meld totals share a rank');
  assert.equal(rankedMiners[0].chatColor, store.chatAppearance(grace.id).color);
  assert.equal(rankedMiners[2].chatColor, store.chatAppearance(ada.id).color);
  assert.deepEqual(store.listMiners('', 1).map((miner) => miner.name), ['Grace']);
  assert.equal(store.listMiners('ad')[0].name, 'Ada');
  assert.equal(store.listMiners('ad')[0].meldRank, 2, 'search preserves the global Meld rank');
});

test('filters and bulk-updates the recipient inbox without removing conversations', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  const ada = store.addPlayer(createPlayer('InboxAda', '', 'hash', catalog, 1000, () => 0.5));
  const grace = store.addPlayer(createPlayer('InboxGrace', '', 'hash', catalog, 1000, () => 0.5));
  const first = store.sendMessage(ada.id, 'InboxGrace', 'First message', 2000);
  const second = store.sendMessage(ada.id, 'InboxGrace', 'Second message', 3000);

  assert.deepEqual(store.recentMessages(grace.id, 'unread').map((message) => message.id), [second, first]);
  store.updateMessages(grace.id, [first], 'read');
  assert.deepEqual(store.recentMessages(grace.id, 'unread').map((message) => message.id), [second]);
  store.updateMessages(grace.id, [second], 'delete');
  assert.deepEqual(store.recentMessages(grace.id, 'deleted').map((message) => message.id), [second]);
  assert.equal(store.playerById(grace.id).unreadMessages, 0);
  assert.equal(store.conversation(grace.id, 'InboxAda').messages.length, 2);
  store.updateMessages(grace.id, [second], 'restore');
  store.updateMessages(grace.id, [first], 'unread');
  assert.equal(store.recentMessages(grace.id, 'all').length, 2);
  assert.equal(store.playerById(grace.id).unreadMessages, 1);
  assert.throws(() => store.messageForPlayer(ada.id, first), /Message not found/);
  assert.equal(store.updateMessages(ada.id, [first], 'delete'), 0);
  store.updateMessages(grace.id, [first], 'keep');
  assert.equal(store.messageForPlayer(grace.id, first).kept, true);
  const retention = Number(catalog.settings.message_retention_ms);
  assert.equal(store.expireMessages(3000 + retention), 1);
  assert.deepEqual(store.recentMessages(grace.id).map((message) => message.id), [first]);
  assert.equal(store.conversation(grace.id, 'InboxAda').messages.length, 1);
  assert.throws(() => store.messageForPlayer(grace.id, second), /Message not found/);
  store.updateMessages(grace.id, [first], 'unkeep');
  assert.equal(store.expireMessages(2000 + retention), 1);
  assert.equal(store.recentMessages(grace.id).length, 0);
});

test('expires every inbox message type after 28 days unless the recipient keeps it', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  const player = store.addPlayer(createPlayer('ExpiryAudit', '', 'hash', catalog, 1000, () => 0.5));
  const messageTypes = [
    'PM', 'Vehicle', 'City', 'Machine', 'Market', 'Factory', 'Thing',
    'Stone', 'Bum', 'Transfer', 'Banking', 'Admin'
  ];
  const createdAt = 5000;
  const insert = store.database.prepare(`
    INSERT INTO messages
      (recipient_id, message_type, subject, body, is_kept, created_at)
    VALUES (?, ?, ?, 'Expiry audit', ?, ?)
  `);
  for (const messageType of messageTypes) {
    insert.run(player.id, messageType, `${messageType} message`, messageType === 'Thing' ? 1 : 0, createdAt);
  }
  insert.run(player.id, 'PM', 'Not old enough', 0, createdAt + 1);

  const retention = Number(catalog.settings.message_retention_ms);
  assert.equal(store.expireMessages(createdAt + retention), messageTypes.length - 1);
  const survivingMessages = store.database.prepare(`
    SELECT message_type, subject, is_kept FROM messages
    WHERE recipient_id = ? ORDER BY id
  `).all(player.id).map((message) => ({ ...message }));
  assert.deepEqual(survivingMessages, [
    { message_type: 'Thing', subject: 'Thing message', is_kept: 1 },
    { message_type: 'PM', subject: 'Not old enough', is_kept: 0 }
  ]);
  assert.equal(store.playerById(player.id).unreadMessages, 2);
});

test('recycles local inventory into Ore scraps and recommends low-value things when over capacity', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const player = store.addPlayer(createPlayer('TrashTester', '', 'hash', catalog, 1000, () => 0.5));
  store.database.prepare('UPDATE players SET item_limit = 50 WHERE id = ?').run(player.id);
  const stocked = store.playerById(player.id);
  const itemId = catalog.items.find((item) => item.rarity === 1
    && !catalog.factoryOutputItemIds.has(item.id)).id;
  stocked.inventory[itemId] = (stocked.inventory[itemId] ?? 0) + 60;
  store.savePlayer(stocked);

  const report = store.autoRecycleCandidates(player.id, 2000);
  assert.equal(report.overBy, 15);
  assert.equal(report.candidates.reduce((sum, entry) => sum + entry.suggested, 0), 15);
  const recycled = store.autoRecycle(player.id, report.candidates.map((entry) => ({
    cityId: entry.cityId, itemId: entry.itemId, quantity: entry.suggested
  })));
  assert.equal(recycled.items, 15);
  assert.ok(recycled.scraps >= 15);
  assert.equal(store.autoRecycleCandidates(player.id, 2000).overBy, 0);
  assert.ok(store.autoRecycleCandidates(player.id, 2000).candidates.some((entry) => entry.itemId === itemId),
    'Auto-Recycle keeps showing ordinary non-Dwarf candidates after capacity is resolved');
  assert.equal(store.recycleInventory(player.id, player.cityId, itemId, 1).quantity, 1);
  assert.throws(() => store.recycleInventory(player.id, 2, itemId, 1), /Travel/);
  store.database.prepare(`
    INSERT INTO recycling_scraps (player_id, city_id, quantity) VALUES (?, ?, 1000)
    ON CONFLICT (player_id, city_id) DO UPDATE SET quantity = 1000
  `).run(player.id, player.cityId);
  assert.deepEqual(store.refineOreScraps(player.id, 1), { ore: 1, scraps: 1000 });
  const oreItemId = Number(catalog.settings.ore_item_id);
  assert.equal(store.playerById(player.id).inventory[oreItemId], 1);

  const factoryOutput = [...catalog.factoryOutputItemIds]
    .map((id) => catalog.byId.get(id))
    .find((item) => item && !(item.id in store.playerById(player.id).inventory));
  store.database.prepare(`
    INSERT INTO inventory (player_id, city_id, item_id, quantity) VALUES (?, ?, ?, 1)
    ON CONFLICT (player_id, city_id, item_id) DO UPDATE SET quantity = quantity + 1
  `).run(player.id, player.cityId, factoryOutput.id);
  store.database.prepare(`
    INSERT INTO protected_inventory (player_id, city_id, item_id, quantity) VALUES (?, ?, ?, 1)
  `).run(player.id, player.cityId, factoryOutput.id);
  assert.throws(() => store.recycleInventory(player.id, player.cityId, factoryOutput.id, 1),
    /factory-made items/);

  store.database.prepare(`
    UPDATE inventory SET quantity = 2
    WHERE player_id = ? AND city_id = ? AND item_id = ?
  `).run(player.id, player.cityId, factoryOutput.id);
  const mixed = store.autoRecycleCandidates(player.id, 2000).candidates
    .find((entry) => entry.itemId === factoryOutput.id);
  assert.deepEqual({ owned: mixed.owned, protected: mixed.protected, recyclable: mixed.recyclable },
    { owned: 2, protected: 1, recyclable: 1 });
  assert.equal(store.recycleInventory(player.id, player.cityId, factoryOutput.id, 1).quantity, 1);
  assert.equal(store.playerById(player.id).protectedInventoryByCity[player.cityId][factoryOutput.id], 1);
  assert.throws(() => store.recycleInventory(player.id, player.cityId, factoryOutput.id, 1),
    /factory-made items/);
});

test('protects Unranked things from auto-recycle until every ranked thing is exhausted', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const player = store.addPlayer(createPlayer(
    'Unranked Keeper', '', 'hash', catalog, 1000, () => 0.5
  ));
  const yellow = catalog.items.find((item) => item.rarity === 1);
  const orange = catalog.items.find((item) => item.rarity === 6);
  const unranked = catalog.items.find((item) => item.rarity === 0);
  store.database.prepare('DELETE FROM inventory WHERE player_id = ?').run(player.id);
  const insert = store.database.prepare(`
    INSERT INTO inventory (player_id, city_id, item_id, quantity) VALUES (?, ?, ?, 1)
  `);
  for (const item of [yellow, orange, unranked]) {
    insert.run(player.id, player.cityId, item.id);
  }
  store.database.prepare('UPDATE players SET item_limit = 1 WHERE id = ?').run(player.id);

  const report = store.autoRecycleCandidates(player.id, 2000);
  const suggestion = new Map(report.candidates.map((candidate) => [
    candidate.itemId, candidate.suggested
  ]));
  assert.equal(report.overBy, 2);
  assert.equal(suggestion.get(yellow.id), 1);
  assert.equal(suggestion.get(orange.id), 1);
  assert.equal(suggestion.get(unranked.id), 0);
});

test('supports public chat while disabling player-to-player gold gifts', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const sender = store.addPlayer(createPlayer('Gift Sender', '', 'hash', catalog, 1000, () => 0.5));
  const recipient = store.addPlayer(createPlayer('Gift Recipient', '', 'hash', catalog, 1000, () => 0.5));
  const ratedVehicle = catalog.vehicles.find((vehicle) => vehicle.routeType === 0
    && catalog.byId.get(vehicle.itemId).rarity >= 4);
  sender.inventory[ratedVehicle.itemId] = 1;
  store.savePlayer(sender);
  const ratedVehicleId = store.activateVehicle(sender.id, ratedVehicle.itemId);
  store.database.prepare('UPDATE player_vehicles SET rating = 1810 WHERE id = ?')
    .run(ratedVehicleId);
  assert.deepEqual(store.chatRatingTiers(sender.id), [1]);
  store.database.prepare('UPDATE players SET gold_units = 1000000 WHERE id = ?').run(sender.id);

  assert.throws(() => store.transferGold(sender.id, recipient.name, 5, 'Thanks', 3000),
    /gold transfers are disabled/i);
  assert.equal(store.playerById(sender.id).gold, 100);
  assert.equal(store.playerById(recipient.id).gold, 5);
  assert.equal(store.database.prepare('SELECT COUNT(*) AS count FROM gold_transfers').get().count, 0);
  assert.equal(store.recentMessages(recipient.id, 'all', 'Transfer').length, 0);
  assert.equal(store.recentMessages(sender.id, 'all', 'Transfer').length, 0);

  store.addChat(sender.id, '<b>Hello miners</b>', 4000);
  const chat = store.recentChats()[0];
  assert.equal(chat.body, '<b>Hello miners</b>');
  assert.equal(chat.color, '55666b');

  store.database.prepare(
    "UPDATE catalog_settings SET value_json = '4' WHERE key = 'chat_message_max_length'"
  ).run();
  store.database.prepare(
    "UPDATE catalog_settings SET value_json = ? WHERE key = 'chat_color_thresholds'"
  ).run(JSON.stringify([{ minimumMelds: 0, color: 'abcdef' }]));
  store.database.prepare(
    "UPDATE catalog_settings SET value_json = '1' WHERE key = 'chat_page_size'"
  ).run();
  assert.throws(() => store.addChat(sender.id, '12345', 5000), /1–4 characters/);
  assert.equal(store.addChat(sender.id, 'Live', 5000).color, 'abcdef');
  assert.equal(store.recentChats().length, 1);

  store.database.prepare(`
    INSERT INTO player_melds (player_id, meld_id, created_at)
    SELECT ?, id, 6000 FROM catalog_melds ORDER BY id LIMIT 140
  `).run(sender.id);
  assert.equal(store.chatAppearance(sender.id).canChooseColor, true);
  assert.equal(store.addChat(sender.id, 'Tint', 6000, '#12Ab34').color, '12ab34');
  assert.equal(store.addChat(sender.id, 'More', 7000).color, '12ab34');
  assert.equal(store.playerById(sender.id).chatColor, '12ab34');
  assert.throws(() => store.addChat(sender.id, 'Nope', 8000, '#xyzxyz'),
    /valid six-digit chat color/);

  store.database.prepare(
    "UPDATE catalog_settings SET value_json = '4' WHERE key = 'chat_rate_max_messages'"
  ).run();
  assert.throws(() => store.addChat(sender.id, 'Rate', 7001), /Too many messages/);
  store.database.prepare(
    "UPDATE catalog_settings SET value_json = '0' WHERE key = 'chat_rate_max_messages'"
  ).run();
  assert.throws(() => store.addChat(sender.id, 'Rate', 5001), /Too many messages/);
});

test('returns every visible chat entry from the exact 24-hour history window', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const viewer = store.addPlayer(createPlayer('History Viewer', '', 'hash', catalog, 1000, () => 0.5));
  const speaker = store.addPlayer(createPlayer('History Speaker', '', 'hash', catalog, 1000, () => 0.5));
  const ignored = store.addPlayer(createPlayer('History Ignored', '', 'hash', catalog, 1000, () => 0.5));
  const historyWindowMs = Number(catalog.settings.chat_history_window_ms);
  const now = 200_000_000;
  const cutoff = now - historyWindowMs;
  const insertChat = store.database.prepare(`
    INSERT INTO chats (player_id, body, color, created_at) VALUES (?, ?, '55666b', ?)
  `);
  insertChat.run(speaker.id, 'Expired player', cutoff - 1);
  insertChat.run(speaker.id, 'Boundary player', cutoff);
  insertChat.run(speaker.id, 'Recent player', now - 2);
  insertChat.run(ignored.id, 'Ignored recent player', now - 3);
  store.setChatIgnore(viewer.id, ignored.id, true, now - 2);
  const insertWorld = store.database.prepare(`
    INSERT INTO world_chat_announcements (event_key, body, path, created_at)
    VALUES (?, ?, '/events', ?)
  `);
  insertWorld.run('expired-history-world', 'Expired world', cutoff - 1);
  insertWorld.run('boundary-history-world', 'Boundary world', cutoff + 1);
  insertWorld.run('recent-history-world', 'Recent world', now - 1);

  assert.equal(store.recentChats(1).length, 1);
  assert.deepEqual(store.recentChats(null, viewer.id, cutoff).map((entry) => entry.body), [
    'Boundary player', 'Boundary world', 'Recent player', 'Recent world'
  ]);
});

test('publishes deduplicated creature sightings and escapes to public chat', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  store.ensureWorldMaps();
  const administrator = store.addPlayer(
    createPlayer('World Herald', '', 'hash', catalog, 1000, () => 0.5)
  );
  const route = store.database.prepare(`
    SELECT catalog_routes.id, catalog_routes.length, catalog_routes.city1_id,
      city1.map_id, city1.name AS city1_name, city2.name AS city2_name
    FROM catalog_routes
    JOIN catalog_cities AS city1 ON city1.id = catalog_routes.city1_id
    JOIN catalog_cities AS city2 ON city2.id = catalog_routes.city2_id
    WHERE catalog_routes.is_open = 1 AND catalog_routes.type = 0
      AND catalog_routes.length > 0
    ORDER BY catalog_routes.id LIMIT 1
  `).get();
  const spawned = store.adminSpawnWorldCreature(
    administrator.id, 'land_whale', route.map_id, route.id, 1000
  );
  const sighting = store.recentChats().find((chat) => chat.kind === 'world');
  assert.ok(sighting);
  assert.match(sighting.body, /Land Whale sighted/);
  assert.match(sighting.body, new RegExp(route.city1_name));
  assert.equal(sighting.path, '/events');
  assert.deepEqual(sighting.mapIds, [route.map_id]);
  assert.equal(sighting.ratingTier, null, 'an unopposed creature sighting has no rating tier');
  const revision = store.latestLiveUpdateId();
  const creature = store.database.prepare(
    'SELECT location, destination_city_id, speed FROM world_creatures WHERE id = ?'
  ).get(spawned.id);
  const remaining = creature.destination_city_id === route.city1_id
    ? creature.location : route.length - creature.location;
  const arrival = 1000 + Math.ceil(remaining / creature.speed * 60 * 60 * 1000) + 1;
  store.settleWorldEvents(arrival);
  const announcements = store.recentChats().filter((chat) => chat.kind === 'world');
  assert.ok(announcements.some((chat) => /escaped the hunters/.test(chat.body)));
  assert.ok(store.liveUpdatesAfter(revision).some((event) => event.scope === 'topic:chat'));
  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count FROM world_chat_announcements
    WHERE event_key = ?
  `).get(`world-creature:${spawned.id}:escaped`).count, 1);
});

test('keeps Fabled and Legendary findings personal instead of publishing them to chat', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const player = store.addPlayer(createPlayer(
    'Rare Finder', '', hashPassword('rare password'), catalog, 1000, () => 0.5
  ));
  const fabled = catalog.items.find((item) => item.rarity === 5
    && !catalog.dwarfByItemId.has(item.id));
  const legendary = catalog.items.find((item) => item.rarity === 6
    && !catalog.dwarfByItemId.has(item.id));
  assert.ok(fabled && legendary);

  const findingRevision = store.latestLiveUpdateId();
  store.savePlayer(store.playerById(player.id), {
    source: 'mine', recordedAt: 2001, findings: [
      { itemId: fabled.id, quantity: 1, cityId: player.cityId, foundAt: 2000 },
      { itemId: legendary.id, quantity: 2, cityId: player.cityId, foundAt: 2001 }
    ]
  });

  const personalFindings = store.liveUpdatesAfter(findingRevision).filter((event) =>
    event.scope === `player:${player.id}` && event.eventType === 'items-found');
  assert.equal(personalFindings.length, 2);
  assert.deepEqual(personalFindings.map((event) => event.payload.itemId).sort((a, b) => a - b),
    [fabled.id, legendary.id].sort((a, b) => a - b));
  assert.deepEqual(personalFindings.map((event) => event.payload.rarity).sort((a, b) => a - b),
    [5, 6]);
  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count FROM world_chat_announcements
  `).get().count, 0);
  assert.equal(store.recentChats().length, 0);
});

test('announces lower-tier mining-captured Dwarves without publishing Fabled or Legendary captures', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const player = store.addPlayer(createPlayer(
    'Dwarf Captor', '', hashPassword('dwarf capture password'), catalog, 1000, () => 0.5
  ));
  const captured = catalog.dwarfTiers.map((tier, index) => ({
    itemId: tier.itemId,
    quantity: 1,
    cityId: player.cityId,
    foundAt: 2000 + index,
    capturedDwarf: true,
    recycled: false
  }));

  const findingRevision = store.latestLiveUpdateId();
  store.savePlayer(store.playerById(player.id), {
    source: 'mine', findings: captured, queuedAt: 2010
  });

  const findingEvents = store.liveUpdatesAfter(findingRevision).filter((event) =>
    event.scope === `player:${player.id}` && event.eventType === 'items-found');
  assert.equal(findingEvents.length, 6);
  assert.ok(findingEvents.every((event) => event.payload.source === 'dwarf-capture'));
  const announcements = store.database.prepare(`
    SELECT event_key, body, path, announcement_type
    FROM world_chat_announcements
    WHERE event_key LIKE 'dwarf-capture:%'
    ORDER BY created_at, id
  `).all();
  const publicTiers = catalog.dwarfTiers.filter((tier) => tier.rarity < 5);
  const privateTiers = catalog.dwarfTiers.filter((tier) => tier.rarity >= 5);
  assert.equal(announcements.length, publicTiers.length);
  assert.equal(new Set(announcements.map((announcement) => announcement.event_key)).size,
    publicTiers.length);
  for (const tier of publicTiers) {
    const announcement = announcements.find((entry) => entry.path === `/items/${tier.itemId}`);
    assert.ok(announcement, `${tier.name} is announced`);
    assert.equal(announcement.announcement_type, 'dwarf-capture');
    assert.match(announcement.body, new RegExp(`Dwarf Captor captured a ${tier.name}`));
  }
  for (const tier of privateTiers) {
    assert.equal(announcements.some((entry) => entry.path === `/items/${tier.itemId}`), false,
      `${tier.name} stays out of chat`);
  }
  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count FROM world_chat_announcements
    WHERE announcement_type LIKE 'rare-%'
  `).get().count, 0, 'Purple and Orange captures are not also generic rare finds');

  const ordinaryYellow = catalog.items.find((item) => item.rarity === 1
    && !catalog.dwarfByItemId.has(item.id));
  const ordinaryOrange = catalog.items.find((item) => item.rarity === 6
    && !catalog.dwarfByItemId.has(item.id));
  store.savePlayer(store.playerById(player.id), {
    source: 'mine', recordedAt: 2021, findings: [
      { itemId: ordinaryYellow.id, quantity: 1, cityId: player.cityId, foundAt: 2020 },
      {
        itemId: ordinaryOrange.id, quantity: 1, cityId: player.cityId,
        foundAt: 2021, capturedDwarf: true
      }
    ]
  });
  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count FROM world_chat_announcements
  `).get().count, publicTiers.length,
  'ordinary findings cannot masquerade as captured Dwarves');
});

test('carries a real mining capture through persistence into public chat', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const captureCatalog = {
    ...catalog,
    settings: { ...catalog.settings, mining_dwarf_capture_chance: 1 }
  };
  const saved = store.addPlayer(createPlayer(
    'Working Dwarf Captor', '', hashPassword('working dwarf password'),
    captureCatalog, 1000, () => 0
  ));
  const player = store.playerById(saved.id);
  const mine = player.mines[0];
  const claimedAt = mine.nextFindAt;

  const result = claimMine(player, captureCatalog, mine.id, claimedAt, () => 0);
  assert.ok(result.capturedDwarf);
  assert.equal(result.capturedDwarf.capturedDwarf, true);
  store.savePlayer(player, {
    source: 'mine', findings: result.finds, queuedAt: claimedAt
  });

  const announcement = store.database.prepare(`
    SELECT body, path, announcement_type FROM world_chat_announcements
    WHERE event_key LIKE 'dwarf-capture:%'
  `).get();
  assert.ok(announcement);
  assert.equal(announcement.announcement_type, 'dwarf-capture');
  assert.equal(announcement.path, `/items/${result.capturedDwarf.itemId}`);
  assert.match(announcement.body, /Working Dwarf Captor captured a Yellow Dwarf/);
});

test('settles and removes legacy banking exactly once without negative balances', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-bank-removal-'));
  const databaseFile = path.join(directory, 'game.sqlite');
  let store = new SqliteStore(databaseFile);
  context.after(() => {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  store.seedCatalog(catalog);
  const owner = store.addPlayer(createPlayer('Former Banker', '', 'hash', catalog, 1000, () => 0.5));
  const customer = store.addPlayer(createPlayer('Former Customer', '', 'hash', catalog, 1000, () => 0.5));
  store.database.prepare('UPDATE players SET gold_units = 3000, profession = 11 WHERE id = ?').run(owner.id);
  store.database.prepare('UPDATE players SET gold_units = 1000 WHERE id = ?').run(customer.id);
  store.database.exec(`
    CREATE TABLE banks (id INTEGER PRIMARY KEY, owner_id INTEGER NOT NULL);
    CREATE TABLE bank_accounts (id INTEGER PRIMARY KEY, bank_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL, balance_units INTEGER NOT NULL);
    CREATE TABLE banking_contracts (id INTEGER PRIMARY KEY, bank_id INTEGER NOT NULL,
      customer_id INTEGER NOT NULL, kind TEXT NOT NULL, status TEXT NOT NULL,
      balance_units INTEGER NOT NULL, interest_basis_points INTEGER NOT NULL,
      started_at INTEGER NOT NULL, balance_updated_at INTEGER NOT NULL);
    CREATE TABLE banking_applications (id INTEGER PRIMARY KEY, status TEXT NOT NULL,
      resolution TEXT, resolved_at INTEGER);
    INSERT INTO banks VALUES (1, 1);
    INSERT INTO bank_accounts VALUES (1, 1, 2, 5000);
    INSERT INTO banking_contracts VALUES
      (1, 1, 2, 'loan', 'active', 4000, 0, 1000, 1000),
      (2, 1, 2, 'deposit', 'active', 2000, 0, 1000, 1000);
    INSERT INTO banking_applications VALUES (1, 'pending', NULL, NULL);
    DELETE FROM schema_migrations WHERE name = 'remove-banking-v1';
    PRAGMA user_version = 62;
  `);
  store.close();

  store = new SqliteStore(databaseFile);
  const legacyTables = store.database.prepare(`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name IN
      ('banks', 'bank_accounts', 'banking_applications', 'banking_contracts',
       'banking_payments', 'garnishments')
  `).all();
  assert.deepEqual(legacyTables, []);
  assert.equal(store.playerById(owner.id).profession, 0);
  assert.ok(store.database.prepare('SELECT MIN(gold_units) AS amount FROM players').get().amount >= 0);
  assert.equal(store.database.prepare('SELECT COUNT(*) AS count FROM legacy_bank_settlements').get().count, 3);
  assert.equal(store.database.prepare('SELECT SUM(system_cover_units) AS amount FROM legacy_bank_settlements').get().amount, 2000);
  assert.deepEqual(store.database.prepare(`
    SELECT source_kind, source_id, payer_id, recipient_id, amount_units,
      payer_paid_units, system_cover_units
    FROM legacy_bank_settlements ORDER BY id
  `).all().map((row) => ({ ...row })), [
    { source_kind: 'instant', source_id: 1, payer_id: owner.id, recipient_id: customer.id,
      amount_units: 5000, payer_paid_units: 3000, system_cover_units: 2000 },
    { source_kind: 'loan', source_id: 1, payer_id: customer.id, recipient_id: owner.id,
      amount_units: 4000, payer_paid_units: 4000, system_cover_units: 0 },
    { source_kind: 'deposit', source_id: 2, payer_id: owner.id, recipient_id: customer.id,
      amount_units: 2000, payer_paid_units: 2000, system_cover_units: 0 }
  ]);
  const migration = store.database.prepare(
    "SELECT details_json FROM schema_migrations WHERE name = 'remove-banking-v1'"
  ).get();
  assert.deepEqual(JSON.parse(migration.details_json), {
    pendingApplications: 1, settlementCount: 3, systemCoverUnits: 2000
  });
  const balances = store.database.prepare('SELECT id, gold_units FROM players ORDER BY id').all();
  assert.deepEqual(balances.map((row) => ({ ...row })), [
    { id: owner.id, gold_units: 2000 },
    { id: customer.id, gold_units: 4000 }
  ]);
  store.close();
  store = new SqliteStore(databaseFile);
  assert.deepEqual(store.database.prepare('SELECT id, gold_units FROM players ORDER BY id').all(), balances);
  assert.equal(store.database.prepare('SELECT COUNT(*) AS count FROM legacy_bank_settlements').get().count, 3);
});

test('coalesces Oil Field views without writes and forces settlement before actions', (context) => {
  const store = new SqliteStore(':memory:', { oilFieldReadSettlementIntervalMs: 1000 });
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const pump = oilMachine('pump', 1);
  const pilot = addOilPlayer(store, 'Coalesced Field Pilot', new Map([
    [catalog.byId.get(pump.itemId), 2]
  ]));
  const initial = store.oilField(pilot.id, 1000);
  const center = fieldHex(initial, 0, 0);
  const north = fieldHex(initial, 0, 1);
  store.deployOilMachine(pilot.id, center.id, pump.id, 0, 1000);

  const changesBeforeReads = store.database.prepare('SELECT total_changes() AS count').get().count;
  const first = store.oilField(pilot.id, 1250);
  const second = store.oilField(pilot.id, 1999);
  const changesAfterReads = store.database.prepare('SELECT total_changes() AS count').get().count;
  assert.equal(changesAfterReads, changesBeforeReads);
  assert.equal(store.database.prepare(
    'SELECT last_settled_at FROM oil_field_state WHERE id = 1'
  ).get().last_settled_at, 1000);
  assert.equal(fieldHex(first, 0, 0).machine.lifeRemaining
    - fieldHex(second, 0, 0).machine.lifeRemaining, 749);

  store.deployOilMachine(pilot.id, north.id, pump.id, 0, 1999);
  assert.equal(store.database.prepare(
    'SELECT last_settled_at FROM oil_field_state WHERE id = 1'
  ).get().last_settled_at, 1999);
  assert.equal(store.oilField(pilot.id, 1999).hexes.filter((hex) => hex.machine).length, 2);
  const changesBeforeCleanSettlement = store.database.prepare(
    'SELECT total_changes() AS count'
  ).get().count;
  store.settleOilField(2000);
  const cleanSettlementChanges = store.database.prepare(
    'SELECT total_changes() AS count'
  ).get().count - changesBeforeCleanSettlement;
  assert.ok(cleanSettlementChanges > 0 && cleanSettlementChanges < 10,
    `clean settlement changed ${cleanSettlementChanges} rows`);
});

test('offers a strictly read-only Oil Field view for background settlement', (context) => {
  const store = new SqliteStore(':memory:', { oilFieldReadSettlementIntervalMs: 1000 });
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const pump = oilMachine('pump', 1);
  const viewer = addOilPlayer(store, 'Read-only Field Pilot', new Map([
    [catalog.byId.get(pump.itemId), 1]
  ]));
  const changesBeforeView = store.database.prepare('SELECT total_changes() AS count').get().count;

  const view = store.oilFieldView(viewer.id, 1000);

  assert.equal(store.database.prepare('SELECT total_changes() AS count').get().count,
    changesBeforeView);
  assert.equal(view.persistedAt, 0);
  assert.equal(view.asOf, 1000);
  assert.equal(view.needsSettlement, true);
  assert.deepEqual(store.settleOilField(1000), {
    settled: true, settledAt: 1000, oilSpillProgressMs: 1000
  });
  const settledView = store.oilFieldView(viewer.id, 1000);
  const center = fieldHex(settledView, 0, 0);
  assert.equal(center.machine, null);
  store.deployOilMachine(viewer.id, center.id, pump.id, 0, 1000);
  assert.equal(fieldHex(store.oilFieldView(viewer.id, 1000), 0, 0).machine.type, 'pump');
});

test('deploys original oil-field machines and packs claimable Oil barrels', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const pilot = store.addPlayer(createPlayer('Pilot', '', 'hash', catalog, 1000, () => 0.5));
  const addMeld = store.database.prepare(
    'INSERT INTO player_melds (player_id, meld_id, created_at) VALUES (?, ?, ?)'
  );
  for (const meld of catalog.melds.slice(0, 40)) addMeld.run(pilot.id, meld.id, 1);
  store.changeProfession(pilot.id, 10);
  store.database.prepare('UPDATE players SET city_id = 2 WHERE id = ?').run(pilot.id);
  const pumpPipe = catalog.machines.find((machine) => machine.type === 'pump-pipe');
  const pad = catalog.machines.find((machine) => machine.type === 'pad' && catalog.byId.get(machine.itemId).rarity === 1);
  const stocked = store.playerById(pilot.id);
  stocked.inventoryByCity[2] = { [pumpPipe.itemId]: 1, [pad.itemId]: 1 };
  stocked.cityId = 2;
  stocked.inventory = stocked.inventoryByCity[2];
  store.savePlayer(stocked);

  const field = store.oilField(pilot.id, 1000);
  assert.equal(field.hexes.length, 469);
  assert.equal(Math.max(...field.hexes.map((hex) =>
    Math.max(Math.abs(hex.x + hex.y), Math.abs(hex.x), Math.abs(hex.y)))), 12);
  const pumpHex = field.hexes.find((hex) => hex.x === 0 && hex.y === 0);
  const padHex = field.hexes.find((hex) => hex.x === 0 && hex.y === 1);
  store.deployOilMachine(pilot.id, pumpHex.id, pumpPipe.id, 0, 1000);
  store.deployOilMachine(pilot.id, padHex.id, pad.id, 0, 1000);
  const afterEightHours = store.oilField(pilot.id, 1000 + 8 * 60 * 60 * 1000);
  const packedHex = afterEightHours.hexes.find((hex) => hex.id === padHex.id);
  const animatedPump = afterEightHours.hexes.find((hex) => hex.id === pumpHex.id).machine;
  assert.equal(animatedPump.machineTypeId, pumpPipe.machineTypeId);
  assert.equal(typeof animatedPump.animationRate, 'number');
  assert.equal(typeof animatedPump.animationFlag, 'number');
  assert.equal(typeof animatedPump.lifeRate, 'number');
  assert.equal(packedHex.barrels, 1);
  assert.ok(packedHex.barrelProgressLiters >= 0);
  store.claimOilBarrel(pilot.id, padHex.id, 1000 + 8 * 60 * 60 * 1000);
  const oilItem = catalog.items.find((item) => item.name === 'Oil');
  assert.equal(store.playerById(pilot.id).inventoryByCity[2][oilItem.id], 1);

  store.database.prepare('UPDATE oil_hexes SET barrels = 3 WHERE id = ?').run(padHex.id);
  const allClaimed = store.claimOilBarrel(
    pilot.id, padHex.id, 1000 + 8 * 60 * 60 * 1000 + 1, true, true
  );
  assert.equal(allClaimed.claimedBarrels, 3);
  assert.equal(store.database.prepare('SELECT barrels FROM oil_hexes WHERE id = ?').get(padHex.id).barrels, 0);
  assert.equal(store.playerById(pilot.id).inventoryByCity[2][oilItem.id], 4);
});

test('refuses to activate a transport when its city has no valid route', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const player = store.addPlayer(createPlayer('Stranded Driver', '', 'hash', catalog, 1000, () => 0.5));
  const route = store.database.prepare(`
    SELECT catalog_routes.*
    FROM catalog_routes
    JOIN catalog_cities AS city1 ON city1.id = catalog_routes.city1_id
    JOIN catalog_cities AS city2 ON city2.id = catalog_routes.city2_id
    WHERE catalog_routes.is_open = 1
      AND catalog_routes.city1_id <> catalog_routes.city2_id
      AND catalog_routes.length > 0
      AND (catalog_routes.city1_id = ? OR catalog_routes.city2_id = ?)
      AND (city1.map_id = city2.map_id OR catalog_routes.is_inter_map = 1)
    ORDER BY catalog_routes.id
    LIMIT 1
  `).get(player.cityId, player.cityId);
  assert.ok(route);
  const vehicleType = catalog.vehicles.find((vehicle) => vehicle.routeType === route.type
    && catalog.byId.has(vehicle.itemId));
  assert.ok(vehicleType);
  player.inventory[vehicleType.itemId] = 1;
  store.savePlayer(player);

  store.database.prepare(`
    UPDATE catalog_routes SET is_open = 0
    WHERE type = ? AND (city1_id = ? OR city2_id = ?)
  `).run(route.type, player.cityId, player.cityId);
  const unavailable = store.vehicleActivationAvailability(player.id, vehicleType.itemId);
  assert.equal(unavailable.allowed, false);
  assert.match(unavailable.reason, /no valid routes/i);
  assert.throws(() => store.activateVehicle(player.id, vehicleType.itemId), /no valid routes/i);
  assert.equal(store.playerById(player.id).inventory[vehicleType.itemId], 1);
  assert.equal(store.vehiclesForPlayer(player.id).length, 0);

  store.database.prepare('UPDATE catalog_routes SET is_open = 1 WHERE id = ?').run(route.id);
  assert.equal(store.vehicleActivationAvailability(player.id, vehicleType.itemId).allowed, true);
  assert.ok(store.activateVehicle(player.id, vehicleType.itemId));
  assert.equal(store.playerById(player.id).inventory[vehicleType.itemId] ?? 0, 0);
});

test('activates vehicles, completes original routes, and discovers cities', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const player = store.addPlayer(createPlayer('Ada', '', 'hash', catalog, 1000, () => 0.5));
  const vehicleType = catalog.vehicles.find((vehicle) =>
    catalog.byId.has(vehicle.itemId)
    && catalog.routes.some((route) => route.open && route.type === vehicle.routeType
      && route.city1Id !== route.city2Id && (route.city1Id === 1 || route.city2Id === 1)));
  assert.ok(vehicleType);
  player.profession = vehicleType.routeType === 0 ? 1 : vehicleType.routeType === 1 ? 4 : 10;
  player.inventory[vehicleType.itemId] = 1;
  store.savePlayer(player);

  const vehicleId = store.activateVehicle(player.id, vehicleType.itemId);
  const routes = store.routesForVehicle(player.id, vehicleId, 2000);
  assert.ok(routes.length > 0);
  assert.ok(routes.every((route) => route.originCityId === player.cityId
    && route.type === vehicleType.routeType));
  const journey = store.sendVehicle(player.id, vehicleId, routes[0].id, 2000);
  assert.ok(store.stonesForPlayer(player.id).earned.some((stone) => stone.name === 'Travelled'));
  assert.equal(store.vehiclesForPlayer(player.id, 2000)[0].status, 'traveling');
  assert.ok(!store.knownCityIds(player.id, 2000).includes(journey.destinationCityId));

  assert.equal(store.vehiclesForPlayer(player.id, journey.arrivesAt)[0].status, 'idle');
  assert.ok(store.knownCityIds(player.id, journey.arrivesAt).includes(journey.destinationCityId));
  store.changeCity(player.id, journey.destinationCityId, journey.arrivesAt);
  assert.equal(store.playerById(player.id).cityId, journey.destinationCityId);
});

test('loads routes for a fleet with one settlement and reuses identical route queries', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const player = createPlayer('Bulk Fleet Routes', '', 'hash', catalog, 1000, () => 0.5);
  const vehicleType = catalog.vehicles.find((vehicle) =>
    catalog.byId.has(vehicle.itemId)
    && catalog.routes.some((route) => route.open && route.type === vehicle.routeType
      && route.city1Id !== route.city2Id
      && (route.city1Id === player.cityId || route.city2Id === player.cityId)));
  assert.ok(vehicleType);
  player.inventory = { [vehicleType.itemId]: 2 };
  player.inventoryByCity = { [player.cityId]: player.inventory };
  const saved = store.addPlayer(player);
  const firstVehicleId = store.activateVehicle(saved.id, vehicleType.itemId);
  const secondVehicleId = store.activateVehicle(saved.id, vehicleType.itemId);
  const expectedRoutes = store.routesForVehicle(saved.id, firstVehicleId, 2000);

  const originalPrepare = store.database.prepare.bind(store.database);
  let encounterPlannerPrepares = 0;
  let availableRoutePrepares = 0;
  store.database.prepare = (sql) => {
    const statement = String(sql);
    if (statement.includes('LEFT JOIN player_ship_state ON player_ship_state.vehicle_id')
      && statement.includes('ORDER BY player_vehicles.route_id, player_vehicles.id')) {
      encounterPlannerPrepares += 1;
    }
    if (statement.includes('SELECT catalog_routes.*, city1.map_id AS map1_id')) {
      availableRoutePrepares += 1;
    }
    return originalPrepare(sql);
  };
  let vehicles;
  try {
    vehicles = store.vehiclesForPlayer(saved.id, 2000, { includeRoutes: true });
  } finally {
    store.database.prepare = originalPrepare;
  }

  assert.equal(encounterPlannerPrepares, 1, 'the fleet request settles encounters once');
  assert.equal(availableRoutePrepares, 1, 'identical vehicle route sets are queried once');
  assert.deepEqual(vehicles.map((vehicle) => vehicle.id), [firstVehicleId, secondVehicleId]);
  assert.deepEqual(vehicles[0].routes, expectedRoutes);
  assert.deepEqual(vehicles[1].routes, expectedRoutes);
});

test('runs a validated multi-leg itinerary continuously and delivers cargo only at the final stop', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const player = store.addPlayer(createPlayer(
    'Onward Driver', '', 'hash', catalog, 1000, () => 0.5
  ));
  const destinationFor = (route, originCityId) => route.city1Id === originCityId
    ? route.city2Id : route.city1Id;
  const routePath = (routeType) => {
    const routes = catalog.routes.filter((route) => route.open && route.type === routeType
      && route.city1Id !== route.city2Id);
    const visit = (originCityId, path, used) => {
      if (path.length === 3) return path;
      for (const route of routes) {
        if (used.has(route.id)
          || (route.city1Id !== originCityId && route.city2Id !== originCityId)) continue;
        const result = visit(destinationFor(route, originCityId), [...path, route],
          new Set([...used, route.id]));
        if (result) return result;
      }
      return null;
    };
    return visit(player.cityId, [], new Set());
  };
  const vehicleType = catalog.vehicles.find((vehicle) =>
    catalog.byId.has(vehicle.itemId) && vehicle.capacity > 0 && routePath(vehicle.routeType));
  const path = routePath(vehicleType.routeType);
  assert.equal(path.length, 3);
  player.inventory[vehicleType.itemId] = 1;
  store.savePlayer(player);
  const vehicleId = store.activateVehicle(player.id, vehicleType.itemId);
  const cargoItem = catalog.items.find((item) => item.id !== vehicleType.itemId);
  store.database.prepare(`
    INSERT INTO player_vehicle_cargo (vehicle_id, item_id, quantity) VALUES (?, ?, 1)
  `).run(vehicleId, cargoItem.id);

  const firstDestination = destinationFor(path[0], player.cityId);
  const disconnected = catalog.routes.find((route) => route.open
    && route.type === vehicleType.routeType && route.city1Id !== route.city2Id
    && route.city1Id !== firstDestination && route.city2Id !== firstDestination);
  assert.ok(disconnected);
  assert.throws(() => store.sendVehicle(player.id, vehicleId, path[0].id, 1900, {
    travelOrder: 'peaceful', additionalRouteIds: [disconnected.id]
  }), /onward leg must use an open compatible route/i);
  assert.equal(store.vehicleDetails(player.id, vehicleId, 1900).status, 'idle');
  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count FROM player_vehicle_journey_legs WHERE vehicle_id = ?
  `).get(vehicleId).count, 0);

  const journey = store.sendVehicle(player.id, vehicleId, path[0].id, 2000, {
    travelOrder: 'peaceful', additionalRouteIds: path.slice(1).map((route) => route.id)
  });
  assert.equal(journey.itineraryLegCount, 3);
  assert.equal(journey.finalDestinationCityId,
    destinationFor(path[2], destinationFor(path[1], firstDestination)));
  let traveling = store.vehicleDetails(player.id, vehicleId, 2001);
  assert.deepEqual(traveling.queuedJourneyLegs.map((leg) => leg.routeId),
    path.slice(1).map((route) => route.id));

  traveling = store.vehicleDetails(player.id, vehicleId, journey.arrivesAt);
  assert.equal(traveling.status, 'traveling');
  assert.equal(traveling.routeId, path[1].id);
  assert.equal(traveling.departedAt, journey.arrivesAt,
    'the second leg starts at the exact first-leg arrival');
  assert.equal(traveling.cargo.find((item) => item.itemId === cargoItem.id)?.quantity, 1);
  assert.equal(traveling.queuedJourneyLegs.length, 1);

  const secondArrival = traveling.arrivesAt;
  traveling = store.vehicleDetails(player.id, vehicleId, secondArrival);
  assert.equal(traveling.status, 'traveling');
  assert.equal(traveling.routeId, path[2].id);
  assert.equal(traveling.departedAt, secondArrival,
    'the third leg starts at the exact second-leg arrival');
  assert.equal(traveling.queuedJourneyLegs.length, 0);

  const finalArrival = traveling.arrivesAt;
  const arrived = store.vehicleDetails(player.id, vehicleId, finalArrival);
  assert.equal(arrived.status, 'idle');
  assert.equal(arrived.cityId, journey.finalDestinationCityId);
  assert.equal(arrived.cargo.length, 0);
  assert.equal(store.database.prepare(`
    SELECT quantity FROM inventory WHERE player_id = ? AND city_id = ? AND item_id = ?
  `).get(player.id, journey.finalDestinationCityId, cargoItem.id)?.quantity, 1);
  const events = store.database.prepare(`
    SELECT event_type FROM vehicle_events WHERE vehicle_id = ? ORDER BY created_at, id
  `).all(vehicleId);
  assert.equal(events.filter((event) => event.event_type === 'departed').length, 3);
  assert.equal(events.filter((event) => event.event_type === 'arrived').length, 3);
});

test('blocks ordinary departures in snow before mutating the journey', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const departedAt = Date.UTC(2026, 7, 24, 10);
  store.ensureWorldMaps(departedAt);
  const player = store.addPlayer(
    createPlayer('Snowbound Driver', '', 'hash', catalog, departedAt, () => 0.5)
  );
  const route = catalog.routes.find((entry) => entry.open && entry.type === 0
    && entry.city1Id !== entry.city2Id && [entry.city1Id, entry.city2Id].includes(player.cityId));
  const vehicleType = catalog.vehicles.find((entry) => entry.routeType === route?.type
    && catalog.byId.has(entry.itemId));
  assert.ok(route && vehicleType);
  player.inventory[vehicleType.itemId] = 1;
  store.savePlayer(player);
  const vehicleId = store.activateVehicle(player.id, vehicleType.itemId);
  store.settleWorldEvents(departedAt);
  const origin = store.database.prepare(
    'SELECT map_id FROM catalog_cities WHERE id = ?'
  ).get(player.cityId);
  setCurrentWeatherCondition(store, origin.map_id, 'snow');

  assert.throws(
    () => store.sendVehicle(player.id, vehicleId, route.id, departedAt + 1),
    /cannot depart from .* while it is snowing/i
  );
  const vehicle = store.database.prepare(
    'SELECT status, city_id, route_id, departed_at FROM player_vehicles WHERE id = ?'
  ).get(vehicleId);
  assert.deepEqual({ ...vehicle }, {
    status: 'idle', city_id: player.cityId, route_id: null, departed_at: null
  });
  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count FROM vehicle_events
    WHERE vehicle_id = ? AND event_type = 'departed'
  `).get(vehicleId).count, 0);
});

test('blocks creature interception departures in snow without creating a pursuit', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const departedAt = Date.UTC(2026, 7, 24, 10);
  store.ensureWorldMaps(departedAt);
  const player = createPlayer(
    'Snowbound Hunter', '', 'hash', catalog, departedAt, () => 0.5
  );
  const route = catalog.routes.find((entry) => entry.open && entry.type === 0
    && entry.city1Id !== entry.city2Id && [entry.city1Id, entry.city2Id].includes(player.cityId));
  const vehicleType = catalog.vehicles.find((entry) => entry.routeType === route?.type
    && catalog.byId.has(entry.itemId));
  assert.ok(route && vehicleType);
  player.profession = 1;
  player.inventory[vehicleType.itemId] = 1;
  const saved = store.addPlayer(player);
  const vehicleId = store.activateVehicle(saved.id, vehicleType.itemId);
  store.settleWorldEvents(departedAt);
  const mapId = store.database.prepare(
    'SELECT map_id FROM catalog_cities WHERE id = ?'
  ).get(saved.cityId).map_id;
  const creatureId = Number(store.database.prepare(`
    INSERT INTO world_creatures
      (creature_type, rarity, map_id, route_id, location, destination_city_id,
       hp, max_hp, awakened_at, moved_at)
    VALUES ('land_whale', ?, ?, ?, 1, ?, 140, 140, ?, ?)
  `).run(catalog.byId.get(vehicleType.itemId).rarity, mapId, route.id,
    route.city1Id, departedAt, departedAt).lastInsertRowid);
  setCurrentWeatherCondition(store, mapId, 'snow');

  assert.throws(
    () => store.attackWorldCreature(saved.id, creatureId, vehicleId, departedAt + 1),
    /cannot depart from .* while it is snowing/i
  );
  assert.equal(store.database.prepare(
    'SELECT status FROM player_vehicles WHERE id = ?'
  ).get(vehicleId).status, 'idle');
  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count FROM world_creature_pursuits
    WHERE creature_id = ? OR vehicle_id = ?
  `).get(creatureId, vehicleId).count, 0);
  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count FROM vehicle_events
    WHERE vehicle_id = ? AND event_type = 'departed'
  `).get(vehicleId).count, 0);
});

test('persists random weather periods and collapses downtime to one change', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-weather-clock-'));
  const databaseFile = path.join(directory, 'game.sqlite');
  let store = new SqliteStore(databaseFile);
  context.after(() => {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  store.seedCatalog(catalog);
  const startedAt = Date.UTC(2026, 7, 24, 10);
  store.ensureWorldMaps(startedAt);
  const mapCount = store.database.prepare('SELECT COUNT(*) AS count FROM world_maps').get().count;

  const initial = store.settleWorldEvents(startedAt);
  let clock = { ...store.database.prepare('SELECT * FROM world_event_clock WHERE id = 1').get() };
  assert.equal(clock.last_slot_at, startedAt);
  assert.equal(clock.weather_sequence, 0);
  assert.equal(initial.weatherPeriods, mapCount);
  assert.ok(clock.next_weather_at - startedAt >= 30 * 60 * 1000);
  assert.ok(clock.next_weather_at - startedAt <= 8 * 60 * 60 * 1000);
  const firstBoundary = clock.next_weather_at;
  const firstMapId = store.database.prepare(
    'SELECT id FROM world_maps ORDER BY sort_order, id LIMIT 1'
  ).get().id;
  assert.equal(store.currentWeatherForMap(firstMapId, startedAt).endsAt, firstBoundary);
  const initialRows = store.database.prepare(
    'SELECT COUNT(*) AS count FROM world_weather_slots'
  ).get().count;

  store.close();
  store = new SqliteStore(databaseFile);
  assert.deepEqual({ ...store.database.prepare(
    'SELECT * FROM world_event_clock WHERE id = 1'
  ).get() }, clock, 'restart preserves the selected random boundary');
  assert.equal(store.settleWorldEvents(firstBoundary - 1).weatherPeriods, 0);
  assert.deepEqual({ ...store.database.prepare(
    'SELECT * FROM world_event_clock WHERE id = 1'
  ).get() }, clock, 'weather remains unchanged immediately before its boundary');

  const changed = store.settleWorldEvents(firstBoundary);
  clock = { ...store.database.prepare('SELECT * FROM world_event_clock WHERE id = 1').get() };
  assert.equal(changed.weatherPeriods, mapCount);
  assert.equal(clock.last_slot_at, firstBoundary);
  assert.equal(clock.weather_sequence, 1);
  assert.ok(clock.next_weather_at - firstBoundary >= 30 * 60 * 1000);
  assert.ok(clock.next_weather_at - firstBoundary <= 8 * 60 * 60 * 1000);
  assert.equal(store.database.prepare(
    'SELECT COUNT(*) AS count FROM world_weather_slots'
  ).get().count, initialRows + mapCount);

  const beforeDowntimeRows = store.database.prepare(
    'SELECT COUNT(*) AS count FROM world_weather_slots'
  ).get().count;
  const resumedAt = clock.next_weather_at + 7 * 24 * 60 * 60 * 1000;
  const resumed = store.settleWorldEvents(resumedAt);
  const resumedClock = store.database.prepare(
    'SELECT * FROM world_event_clock WHERE id = 1'
  ).get();
  assert.equal(resumed.weatherPeriods, mapCount);
  assert.equal(resumedClock.last_slot_at, resumedAt);
  assert.equal(resumedClock.weather_sequence, 2);
  assert.equal(store.database.prepare(
    'SELECT COUNT(*) AS count FROM world_weather_slots'
  ).get().count, beforeDowntimeRows + mapCount,
  'downtime creates one current period rather than replaying stale weather');
});

test('v97 adds a random weather clock without rewriting weather history', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-weather-v96-'));
  const databaseFile = path.join(directory, 'game.sqlite');
  let store = new SqliteStore(databaseFile);
  context.after(() => {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  store.seedCatalog(catalog);
  const now = Date.UTC(2026, 7, 24, 12);
  store.ensureWorldMaps(now);
  store.settleWorldEvents(now);
  const lastSlotAt = store.database.prepare(
    'SELECT last_slot_at FROM world_event_clock WHERE id = 1'
  ).get().last_slot_at;
  const weatherBefore = store.database.prepare(`
    SELECT map_id, slot_at, condition, temperature_c, wind_kph, rainfall_mm
    FROM world_weather_slots ORDER BY map_id, slot_at
  `).all().map((row) => ({ ...row }));
  store.database.exec(`
    DELETE FROM catalog_settings WHERE key IN
      ('weather_change_min_interval_ms', 'weather_change_max_interval_ms');
    ALTER TABLE world_event_clock DROP COLUMN next_weather_at;
    ALTER TABLE world_event_clock DROP COLUMN weather_sequence;
    PRAGMA user_version = 96;
  `);
  store.close();

  const migrationWorkers = Array.from({ length: 2 }, () => new Worker(`
    const { parentPort, workerData } = require('node:worker_threads');
    (async () => {
      try {
        const { SqliteStore } = await import(workerData.storeModule);
        const workerStore = new SqliteStore(workerData.databaseFile, { busyTimeoutMs: 1000 });
        workerStore.close();
        parentPort.postMessage({ ok: true });
      } catch (error) {
        parentPort.postMessage({ ok: false, message: error.message });
      }
    })();
  `, { eval: true, workerData: {
    databaseFile, storeModule: new URL('../src/store.js', import.meta.url).href
  } }));
  const migrationResults = await Promise.all(migrationWorkers.map((worker) =>
    new Promise((resolve, reject) => {
      worker.once('message', resolve);
      worker.once('error', reject);
    })));
  await Promise.all(migrationWorkers.map((worker) => worker.terminate()));
  assert.ok(migrationResults.every((result) => result.ok),
    migrationResults.map((result) => result.message).filter(Boolean).join('; '));

  store = new SqliteStore(databaseFile);
  assert.equal(store.database.prepare('PRAGMA user_version').get().user_version, 112);
  assert.deepEqual({ ...store.database.prepare(`
    SELECT last_slot_at, next_weather_at, weather_sequence
    FROM world_event_clock WHERE id = 1
  `).get() }, { last_slot_at: lastSlotAt, next_weather_at: null, weather_sequence: 0 });
  assert.deepEqual(store.database.prepare(`
    SELECT map_id, slot_at, condition, temperature_c, wind_kph, rainfall_mm
    FROM world_weather_slots ORDER BY map_id, slot_at
  `).all().map((row) => ({ ...row })), weatherBefore);
  assert.equal(JSON.parse(store.database.prepare(`
    SELECT value_json FROM catalog_settings WHERE key = 'weather_change_min_interval_ms'
  `).get().value_json), 30 * 60 * 1000);
  assert.equal(JSON.parse(store.database.prepare(`
    SELECT value_json FROM catalog_settings WHERE key = 'weather_change_max_interval_ms'
  `).get().value_json), 8 * 60 * 60 * 1000);
});

test('v98 adds Snow and Hurricane without rewriting weather history', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-weather-v97-'));
  const databaseFile = path.join(directory, 'game.sqlite');
  let store = new SqliteStore(databaseFile);
  context.after(() => {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  store.seedCatalog(catalog);
  const now = Date.UTC(2026, 7, 24, 12);
  store.ensureWorldMaps(now);
  store.settleWorldEvents(now);
  store.database.exec(`
    DROP TRIGGER IF EXISTS live_update_world_weather_slots_insert;
    DROP TRIGGER IF EXISTS live_update_world_weather_slots_update;
    DROP TRIGGER IF EXISTS live_update_world_weather_slots_delete;
    DROP INDEX IF EXISTS world_weather_recent;
    ALTER TABLE world_weather_slots RENAME TO world_weather_slots_v98;
    CREATE TABLE world_weather_slots (
      map_id INTEGER NOT NULL REFERENCES world_maps(id) ON DELETE CASCADE,
      slot_at INTEGER NOT NULL,
      condition TEXT NOT NULL CHECK (condition IN ('clear', 'cloud', 'rain', 'storm')),
      temperature_c REAL NOT NULL,
      wind_kph INTEGER NOT NULL,
      rainfall_mm REAL NOT NULL,
      PRIMARY KEY (map_id, slot_at)
    );
    INSERT INTO world_weather_slots
      (map_id, slot_at, condition, temperature_c, wind_kph, rainfall_mm)
    SELECT map_id, slot_at,
      CASE WHEN condition IN ('snow', 'hurricane') THEN 'clear' ELSE condition END,
      temperature_c, wind_kph, rainfall_mm
    FROM world_weather_slots_v98;
    DROP TABLE world_weather_slots_v98;
    CREATE INDEX world_weather_recent
      ON world_weather_slots (slot_at DESC, map_id);
    ALTER TABLE vehicle_weather_exposure DROP COLUMN effect_applied;
    DELETE FROM catalog_settings WHERE key IN (
      'weather_snow_max_temperature_c', 'weather_hurricane_min_temperature_c',
      'weather_hurricane_chance_by_month', 'hurricane_ship_damage_min_ratio',
      'hurricane_ship_damage_max_ratio', 'hurricane_vehicle_damage_chance'
    );
    PRAGMA user_version = 97;
  `);
  const weatherBefore = store.database.prepare(`
    SELECT map_id, slot_at, condition, temperature_c, wind_kph, rainfall_mm
    FROM world_weather_slots ORDER BY map_id, slot_at
  `).all().map((row) => ({ ...row }));
  const worldUpdatesBefore = store.database.prepare(`
    SELECT COUNT(*) AS count FROM live_update_events WHERE scope = 'topic:world'
  `).get().count;
  store.close();

  store = new SqliteStore(databaseFile);
  assert.equal(store.database.prepare('PRAGMA user_version').get().user_version, 112);
  assert.deepEqual(store.database.prepare(`
    SELECT map_id, slot_at, condition, temperature_c, wind_kph, rainfall_mm
    FROM world_weather_slots ORDER BY map_id, slot_at
  `).all().map((row) => ({ ...row })), weatherBefore);
  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count FROM live_update_events WHERE scope = 'topic:world'
  `).get().count, worldUpdatesBefore, 'the history copy emits no synthetic world updates');
  assert.ok(store.database.prepare(`
    SELECT 1 FROM pragma_table_info('vehicle_weather_exposure')
    WHERE name = 'effect_applied'
  `).get());
  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count FROM sqlite_master
    WHERE type = 'trigger' AND name LIKE 'live_update_world_weather_slots_%'
  `).get().count, 3);
  assert.ok(store.database.prepare(`
    SELECT 1 FROM sqlite_master
    WHERE type = 'index' AND name = 'world_weather_recent'
  `).get());
  const mapId = weatherBefore[0].map_id;
  store.database.prepare(`
    INSERT INTO world_weather_slots
      (map_id, slot_at, condition, temperature_c, wind_kph, rainfall_mm)
    VALUES (?, ?, 'snow', -2, 18, 3.5), (?, ?, 'hurricane', 25, 170, 42)
  `).run(mapId, now + 1, mapId, now + 2);
  assert.throws(() => store.database.prepare(`
    INSERT INTO world_weather_slots
      (map_id, slot_at, condition, temperature_c, wind_kph, rainfall_mm)
    VALUES (?, ?, 'sandstorm', 20, 30, 0)
  `).run(mapId, now + 3), /CHECK constraint failed/i);
  for (const key of [
    'weather_snow_max_temperature_c', 'weather_hurricane_min_temperature_c',
    'weather_hurricane_chance_by_month', 'hurricane_ship_damage_min_ratio',
    'hurricane_ship_damage_max_ratio', 'hurricane_vehicle_damage_chance'
  ]) {
    assert.ok(store.database.prepare(
      'SELECT 1 FROM catalog_settings WHERE key = ?'
    ).get(key), `${key} migrated`);
  }
});

test('an administrator weather override damages an exposed ship once per weather period', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  store.ensureWorldMaps();
  const shipType = catalog.vehicles.find((vehicle) => vehicle.routeType === 1
    && catalog.routes.some((route) => route.open && route.type === 1
      && route.city1Id !== route.city2Id && [route.city1Id, route.city2Id].includes(1)));
  assert.ok(shipType);
  const player = createPlayer('Storm Sailor', '', 'hash', catalog, 1000, () => 0.5);
  player.profession = 4;
  player.inventory[shipType.itemId] = 1;
  const saved = store.addPlayer(player);
  const vehicleId = store.activateVehicle(saved.id, shipType.itemId);
  const departedAt = Date.now();
  const route = store.routesForVehicle(saved.id, vehicleId, departedAt)[0];
  store.sendVehicle(saved.id, vehicleId, route.id, departedAt);
  const mapId = store.database.prepare(
    'SELECT map_id FROM catalog_cities WHERE id = ?'
  ).get(saved.cityId).map_id;
  const before = store.database.prepare(
    'SELECT hull FROM player_ship_state WHERE vehicle_id = ?'
  ).get(vehicleId).hull;
  const first = store.adminSetWeather(saved.id, mapId, {
    condition: 'storm', temperatureC: 7.5, windKph: 100, rainfallMm: 30
  }, departedAt + 2000);
  const scheduledBoundary = store.database.prepare(
    'SELECT next_weather_at FROM world_event_clock WHERE id = 1'
  ).get().next_weather_at;
  const after = store.database.prepare(
    'SELECT hull FROM player_ship_state WHERE vehicle_id = ?'
  ).get(vehicleId).hull;
  assert.equal(first.shipsHit, 1);
  assert.ok(after < before);
  const second = store.adminSetWeather(saved.id, mapId, {
    condition: 'storm', temperatureC: 8, windKph: 90, rainfallMm: 20
  }, departedAt + 3000);
  assert.equal(second.shipsHit, 0);
  assert.equal(store.database.prepare(
    'SELECT next_weather_at FROM world_event_clock WHERE id = 1'
  ).get().next_weather_at, scheduledBoundary, 'an override does not reset the random boundary');
  store.database.prepare(`
    UPDATE catalog_settings SET value_json = ?
    WHERE key = 'weather_storm_chance_by_month'
  `).run(JSON.stringify(Array(12).fill(0)));
  store.database.prepare(`
    UPDATE catalog_settings SET value_json = ?
    WHERE key = 'weather_hurricane_chance_by_month'
  `).run(JSON.stringify(Array(12).fill(0)));
  store.database.prepare(`
    UPDATE world_event_clock SET next_weather_at = ? WHERE id = 1
  `).run(departedAt + 5000);
  const third = store.adminSetWeather(saved.id, mapId, {
    condition: 'storm', temperatureC: 6, windKph: 80, rainfallMm: 16
  }, departedAt + 5000);
  assert.equal(third.shipsHit, 1, 'a new randomly scheduled period permits one new hit');
  // Isolate the unchanged weather period; the independent natural-creature
  // clock cannot be due less than a minute after it is first scheduled.
  store.database.prepare('DELETE FROM world_creatures').run();
  const revision = store.latestLiveUpdateId();
  store.settleWorldEvents(departedAt + 6000);
  assert.equal(store.liveUpdatesAfter(revision)
    .filter((event) => event.scope === 'topic:world').length, 0,
  'settling within an unchanged weather period does not announce a world change');
  assert.ok(store.vehicleDetails(saved.id, vehicleId, departedAt + 6000).ship.hull < after);
});

test('weather sinking immediately creates a complete wreck at the ship location', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  store.ensureWorldMaps();
  for (const [key, value] of [
    ['storm_ship_damage_min_ratio', 1], ['storm_ship_damage_max_ratio', 1],
    ['ghost_rise_chance', 0]
  ]) store.database.prepare(
    'UPDATE catalog_settings SET value_json = ? WHERE key = ?'
  ).run(JSON.stringify(value), key);
  const shipType = catalog.vehicles.find((vehicle) =>
    catalog.byId.get(vehicle.itemId)?.name === 'Outrigger');
  const cannon = catalog.cannons.find((entry) => catalog.byId.get(entry.itemId)?.rarity === 1);
  const cargo = catalog.items.find((item) => item.rarity === 1
    && !catalog.vehicleByItemId.has(item.id) && !catalog.weaponByItemId.has(item.id)
    && !catalog.cannonByItemId.has(item.id) && !catalog.cannonballByItemId.has(item.id));
  assert.ok(shipType && cannon && cargo);
  const sailor = store.addPlayer(createPlayer('Weather Wreck', '', 'hash', catalog, 1000, () => 0.5));
  sailor.inventory[shipType.itemId] = 1;
  sailor.inventory[cannon.itemId] = 1;
  sailor.inventory[cargo.id] = 1;
  store.savePlayer(sailor);
  const shipId = store.activateVehicle(sailor.id, shipType.itemId, 1000);
  store.attachShipCannon(sailor.id, shipId, cannon.id);
  store.setVehicleCargo(sailor.id, shipId, { [cargo.id]: 1 });
  const departedAt = Date.now();
  const route = store.routesForVehicle(sailor.id, shipId, departedAt)[0];
  store.sendVehicle(sailor.id, shipId, route.id, departedAt);
  store.database.prepare('UPDATE player_ship_state SET hull = 1 WHERE vehicle_id = ?').run(shipId);
  const mapId = store.database.prepare(
    'SELECT map_id FROM catalog_cities WHERE id = ?'
  ).get(sailor.cityId).map_id;
  const result = store.adminSetWeather(sailor.id, mapId, {
    condition: 'storm', temperatureC: 8, windKph: 100, rainfallMm: 30
  }, departedAt + 2000);
  assert.equal(result.shipsSunk, 1);
  assert.equal(store.database.prepare('SELECT 1 FROM player_vehicles WHERE id = ?').get(shipId), undefined);
  const wrecks = store.database.prepare(`
    SELECT item_id, location FROM sunken_items WHERE source_vehicle_id = ? ORDER BY item_id
  `).all(shipId);
  assert.deepEqual(wrecks.map((wreck) => wreck.item_id).sort((a, b) => a - b),
    [cannon.itemId, cargo.id].sort((a, b) => a - b));
  assert.ok(wrecks.every((wreck) => wreck.location === wrecks[0].location
    && wreck.location !== route.length * Number(catalog.settings.sunken_cargo_route_fraction)),
  'the wreck is placed at the exposed ship position rather than the route midpoint');
  const message = store.recentMessages(sailor.id, 'all', 'Vehicle')
    .find((entry) => entry.details.event === 'sunk');
  assert.equal(message.details.lostCannons, 1);
  assert.equal(message.details.lostCargo, 1);
  assert.ok(store.database.prepare(`
    SELECT 1 FROM vehicle_events WHERE vehicle_id = ? AND event_type = 'sunk'
      AND json_extract(details_json, '$.cause') = 'storm'
  `).get(shipId));
});

test('a hurricane damages travelling land vehicles and ships only once per period', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  store.ensureWorldMaps();
  store.database.prepare(`
    UPDATE catalog_settings SET value_json = '1'
    WHERE key = 'hurricane_vehicle_damage_chance'
  `).run();
  const departedAt = Date.now();
  const addTraveler = (name, routeType, profession) => {
    const player = createPlayer(name, '', 'hash', catalog, departedAt, () => 0.5);
    const vehicleType = catalog.vehicles.find((vehicle) => vehicle.routeType === routeType
      && catalog.byId.has(vehicle.itemId)
      && catalog.routes.some((route) => route.open && route.type === routeType
        && route.city1Id !== route.city2Id
        && [route.city1Id, route.city2Id].includes(player.cityId)));
    assert.ok(vehicleType);
    player.profession = profession;
    player.inventory[vehicleType.itemId] = 1;
    const saved = store.addPlayer(player);
    const vehicleId = store.activateVehicle(saved.id, vehicleType.itemId);
    const route = store.routesForVehicle(saved.id, vehicleId, departedAt)[0];
    assert.ok(route);
    store.sendVehicle(saved.id, vehicleId, route.id, departedAt);
    return { player: saved, vehicleId };
  };
  const driver = addTraveler('Hurricane Driver', 0, 1);
  const sailor = addTraveler('Hurricane Sailor', 1, 4);
  const mapId = store.database.prepare(`
    SELECT map_id FROM catalog_cities WHERE id = ?
  `).get(driver.player.cityId).map_id;
  const hullBefore = store.database.prepare(
    'SELECT hull FROM player_ship_state WHERE vehicle_id = ?'
  ).get(sailor.vehicleId).hull;

  const first = store.adminSetWeather(driver.player.id, mapId, {
    condition: 'hurricane', temperatureC: 24, windKph: 170, rainfallMm: 42
  }, departedAt + 2000);
  assert.equal(first.vehiclesDamaged, 1);
  assert.equal(first.shipsHit, 1);
  assert.equal(store.database.prepare(
    'SELECT damaged FROM player_vehicles WHERE id = ?'
  ).get(driver.vehicleId).damaged, 1);
  const hullAfter = store.database.prepare(
    'SELECT hull FROM player_ship_state WHERE vehicle_id = ?'
  ).get(sailor.vehicleId).hull;
  assert.ok(hullAfter < hullBefore);
  assert.deepEqual({ ...store.database.prepare(`
    SELECT condition, effect_applied FROM vehicle_weather_exposure
    WHERE vehicle_id = ?
  `).get(driver.vehicleId) }, { condition: 'hurricane', effect_applied: 1 });

  const repeated = store.adminSetWeather(driver.player.id, mapId, {
    condition: 'hurricane', temperatureC: 23, windKph: 160, rainfallMm: 35
  }, departedAt + 3000);
  assert.equal(repeated.vehiclesDamaged, 0);
  assert.equal(repeated.shipsHit, 0);
  store.adminSetWeather(driver.player.id, mapId, {
    condition: 'clear', temperatureC: 20, windKph: 8, rainfallMm: 0
  }, departedAt + 3500);
  const toggled = store.adminSetWeather(driver.player.id, mapId, {
    condition: 'hurricane', temperatureC: 25, windKph: 180, rainfallMm: 50
  }, departedAt + 4000);
  assert.equal(toggled.vehiclesDamaged, 0);
  assert.equal(toggled.shipsHit, 0);
  assert.equal(store.database.prepare(
    'SELECT hull FROM player_ship_state WHERE vehicle_id = ?'
  ).get(sailor.vehicleId).hull, hullAfter);
  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count FROM vehicle_events
    WHERE event_type = 'hurricane' AND vehicle_id IN (?, ?)
  `).get(driver.vehicleId, sailor.vehicleId).count, 2);
});

test('schedules natural creatures independently from variable weather periods', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const dueAt = Date.UTC(2026, 7, 23, 15, 17);
  store.ensureWorldMaps(dueAt);
  const weatherStartedAt = dueAt - 15 * 60 * 1000;
  const forcedChances = Object.fromEntries(
    Object.keys(catalog.settings.world_creature_wake_chances)
      .map((type) => [type, type === 't_rex' ? 1 : 0])
  );
  store.database.prepare(`
    UPDATE catalog_settings SET value_json = ?
    WHERE key = 'world_creature_wake_chances'
  `).run(JSON.stringify(forcedChances));
  const insertWeather = store.database.prepare(`
    INSERT OR REPLACE INTO world_weather_slots
      (map_id, slot_at, condition, temperature_c, wind_kph, rainfall_mm)
    VALUES (?, ?, 'clear', 18, 5, 0)
  `);
  for (const map of store.database.prepare('SELECT id FROM world_maps ORDER BY id').all()) {
    insertWeather.run(map.id, weatherStartedAt);
  }
  store.database.prepare(`
    UPDATE world_event_clock
    SET last_slot_at = ?, next_weather_at = ?, weather_sequence = 0 WHERE id = 1
  `).run(weatherStartedAt, dueAt + 30 * 60 * 1000);
  store.database.prepare(`
    UPDATE world_creature_roll_clock
    SET last_roll_at = NULL, next_roll_at = ?, roll_sequence = 0 WHERE id = 1
  `).run(dueAt);

  assert.equal(store.settleWorldEvents(dueAt - 1).naturalRolls, 0);
  assert.equal(store.database.prepare(
    'SELECT COUNT(*) AS count FROM world_creatures'
  ).get().count, 0);
  const revision = store.latestLiveUpdateId();
  const settled = store.settleWorldEvents(dueAt);
  assert.equal(settled.naturalRolls, 1);
  assert.equal(settled.creaturesAwakened, 1);
  assert.equal(settled.naturalRollCreatureType, 't_rex');
  const creature = store.database.prepare(`
    SELECT * FROM world_creatures WHERE awakened_at = ?
  `).get(dueAt);
  assert.ok(creature);
  assert.equal(creature.creature_type, 't_rex');
  const announcement = store.database.prepare(`
    SELECT * FROM world_chat_announcements WHERE event_key = ?
  `).get(`world-creature:${creature.id}:awakened`);
  assert.equal(announcement.announcement_type, 'world');
  assert.equal(announcement.path, '/events');
  assert.equal(announcement.created_at, dueAt);
  assert.match(announcement.body, /T-Rex sighted/);
  assert.ok(store.recentChats(null, null, dueAt - 1)
    .some((chat) => chat.id === announcement.id && chat.kind === 'world'));
  assert.ok(store.liveUpdatesAfter(revision).some((event) => event.scope === 'topic:chat'));
  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count FROM admin_audit_log WHERE action = 'world-creature-spawned'
  `).get().count, 0);
  const clock = store.database.prepare(
    'SELECT * FROM world_creature_roll_clock WHERE id = 1'
  ).get();
  assert.equal(clock.last_roll_at, dueAt);
  assert.ok(clock.next_roll_at - dueAt >= 60 * 1000);
  assert.ok(clock.next_roll_at - dueAt <= 45 * 60 * 1000);

  const repeated = store.settleWorldEvents(dueAt);
  assert.equal(repeated.naturalRolls, 0);
  assert.equal(store.database.prepare(
    'SELECT COUNT(*) AS count FROM world_creatures'
  ).get().count, 1);
  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count FROM world_chat_announcements WHERE event_key = ?
  `).get(`world-creature:${creature.id}:awakened`).count, 1);
});

test('persists natural roll timing and collapses downtime to one current roll', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-natural-roll-'));
  const databaseFile = path.join(directory, 'game.sqlite');
  let store = new SqliteStore(databaseFile);
  context.after(() => {
    try { store.close(); } catch {}
    fs.rmSync(directory, { recursive: true, force: true });
  });
  store.seedCatalog(catalog);
  const now = Date.UTC(2026, 7, 23, 16, 30);
  store.ensureWorldMaps(now);
  const forcedChances = Object.fromEntries(
    Object.keys(catalog.settings.world_creature_wake_chances)
      .map((type) => [type, type === 'elephant_herd' ? 1 : 0])
  );
  store.database.prepare(`
    UPDATE catalog_settings SET value_json = ?
    WHERE key = 'world_creature_wake_chances'
  `).run(JSON.stringify(forcedChances));
  const overdueAt = now - 7 * 24 * 60 * 60 * 1000;
  store.database.prepare(`
    UPDATE world_creature_roll_clock
    SET last_roll_at = NULL, next_roll_at = ?, roll_sequence = 0 WHERE id = 1
  `).run(overdueAt);
  store.close();

  store = new SqliteStore(databaseFile);
  assert.equal(store.database.prepare(`
    SELECT next_roll_at FROM world_creature_roll_clock WHERE id = 1
  `).get().next_roll_at, overdueAt, 'a restart preserves the already chosen due time');
  const settled = store.settleWorldEvents(now);
  assert.equal(settled.naturalRolls, 1);
  assert.equal(settled.creaturesAwakened, 1);
  const creature = store.database.prepare(
    'SELECT * FROM world_creatures WHERE awakened_at = ?'
  ).get(now);
  assert.ok(creature, 'the one catch-up encounter starts now rather than a week ago');
  const advanced = store.database.prepare(
    'SELECT * FROM world_creature_roll_clock WHERE id = 1'
  ).get();
  assert.equal(advanced.last_roll_at, now);
  assert.equal(advanced.roll_sequence, 1);
  assert.ok(advanced.next_roll_at - now >= 60 * 1000);
  assert.ok(advanced.next_roll_at - now <= 45 * 60 * 1000);
  store.close();

  store = new SqliteStore(databaseFile);
  const repeated = store.settleWorldEvents(now);
  assert.equal(repeated.naturalRolls, 0);
  assert.deepEqual({ ...store.database.prepare(
    'SELECT * FROM world_creature_roll_clock WHERE id = 1'
  ).get() }, { ...advanced });
  assert.equal(store.database.prepare(
    'SELECT COUNT(*) AS count FROM world_creatures'
  ).get().count, 1);
});

test('serializes one due natural roll across concurrent maintenance workers', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-natural-workers-'));
  const databaseFile = path.join(directory, 'game.sqlite');
  const store = new SqliteStore(databaseFile, { busyTimeoutMs: 1000 });
  store.seedCatalog(catalog);
  const dueAt = Date.UTC(2026, 7, 23, 17, 17);
  store.ensureWorldMaps(dueAt);
  const forcedChances = Object.fromEntries(
    Object.keys(catalog.settings.world_creature_wake_chances)
      .map((type) => [type, type === 'white_whale' ? 1 : 0])
  );
  store.database.prepare(`
    UPDATE catalog_settings SET value_json = ?
    WHERE key = 'world_creature_wake_chances'
  `).run(JSON.stringify(forcedChances));
  store.database.prepare(`
    UPDATE world_creature_roll_clock
    SET last_roll_at = NULL, next_roll_at = ?, roll_sequence = 0 WHERE id = 1
  `).run(dueAt);
  const workers = Array.from({ length: 2 }, () => new Worker(
    new URL('../src/maintenance-worker.js', import.meta.url), {
      workerData: { databaseFile, busyTimeoutMs: 1000 }
    }
  ));
  context.after(async () => {
    await Promise.all(workers.map((worker) => worker.terminate()));
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const completed = await Promise.all(workers.map((worker) => new Promise((resolve, reject) => {
    worker.once('message', resolve);
    worker.once('error', reject);
    worker.postMessage({ type: 'tick', now: dueAt });
  })));
  assert.ok(completed.every((tick) => tick.type === 'tick-complete'));
  assert.equal(completed.reduce(
    (total, tick) => total + tick.world.naturalRolls, 0
  ), 1);
  assert.equal(store.database.prepare(
    'SELECT roll_sequence FROM world_creature_roll_clock WHERE id = 1'
  ).get().roll_sequence, 1);
  const creature = store.database.prepare(
    'SELECT id FROM world_creatures WHERE awakened_at = ?'
  ).get(dueAt);
  assert.ok(creature);
  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count FROM world_chat_announcements WHERE event_key = ?
  `).get(`world-creature:${creature.id}:awakened`).count, 1);
});

test('moves creatures and resolves vehicle attacks only at a physical interception', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  store.ensureWorldMaps();
  const route = catalog.routes.find((entry) => entry.open && entry.type === 0
    && entry.city1Id !== entry.city2Id && [entry.city1Id, entry.city2Id].includes(1));
  const vehicleType = catalog.vehicles.find((vehicle) => vehicle.routeType === 0
    && catalog.byId.has(vehicle.itemId));
  assert.ok(route && vehicleType);
  const player = createPlayer('Whale Hunter', '', 'hash', catalog, 1000, () => 0.5);
  player.profession = 1;
  player.inventory[vehicleType.itemId] = 1;
  const saved = store.addPlayer(player);
  const vehicleId = store.activateVehicle(saved.id, vehicleType.itemId);
  const bountySlots = Math.min(3, store.vehicleDetails(saved.id, vehicleId, 2000).capacity);
  const filler = catalog.items.find((item) => item.canFind && item.repairedItemId === null
    && !catalog.vehicleByItemId.has(item.id));
  const initialCapacity = store.vehicleDetails(saved.id, vehicleId, 2000).capacity;
  if (initialCapacity > bountySlots) store.database.prepare(`
    INSERT INTO player_vehicle_cargo (vehicle_id, item_id, quantity) VALUES (?, ?, ?)
  `).run(vehicleId, filler.id, initialCapacity - bountySlots);
  const mapId = store.database.prepare(
    'SELECT map_id FROM catalog_cities WHERE id = 1'
  ).get().map_id;
  const creatureId = Number(store.database.prepare(`
    INSERT INTO world_creatures
      (creature_type, rarity, map_id, route_id, location, destination_city_id,
       hp, max_hp, awakened_at, moved_at)
    VALUES ('land_whale', ?, ?, ?, 1, ?, 1, 140, 2000, 2000)
  `).run(catalog.byId.get(vehicleType.itemId).rarity,
    mapId, route.id, route.city1Id).lastInsertRowid);

  const pursuit = store.attackWorldCreature(saved.id, creatureId, vehicleId, 2000);
  assert.ok(pursuit.encounterAt > 2000);
  assert.ok(pursuit.encounterLocation > 0 && pursuit.encounterLocation < route.length);
  assert.equal(store.vehiclesForPlayer(saved.id, 2000)[0].status, 'traveling');
  assert.equal(store.database.prepare(
    'SELECT status FROM world_creatures WHERE id = ?'
  ).get(creatureId).status, 'active');
  assert.equal(store.database.prepare(
    'SELECT COUNT(*) AS count FROM world_creature_attacks WHERE creature_id = ?'
  ).get(creatureId).count, 0, 'combat does not happen when the hunter leaves port');

  store.settleWorldEvents(pursuit.encounterAt - 1);
  assert.equal(store.database.prepare(
    'SELECT COUNT(*) AS count FROM world_creature_attacks WHERE creature_id = ?'
  ).get(creatureId).count, 0, 'combat waits until the route positions meet');
  const settled = store.settleWorldEvents(pursuit.encounterAt);
  assert.equal(settled.pursuitsResolved, 1);
  assert.equal(store.database.prepare(
    'SELECT status FROM world_creatures WHERE id = ?'
  ).get(creatureId).status, 'defeated');
  assert.equal(store.database.prepare(
    'SELECT COUNT(*) AS count FROM world_creature_attacks WHERE creature_id = ?'
  ).get(creatureId).count, 1);
  const ratedAttack = store.database.prepare(`
    SELECT vehicle_rating_before, vehicle_rating_after,
      creature_rating_before, creature_rating_after
    FROM world_creature_attacks WHERE creature_id = ?
  `).get(creatureId);
  assert.deepEqual({ ...ratedAttack }, {
    vehicle_rating_before: 1600,
    vehicle_rating_after: 1605,
    creature_rating_before: 1600,
    creature_rating_after: 1595
  });
  assert.equal(store.database.prepare(
    'SELECT rating FROM player_vehicles WHERE id = ?'
  ).get(vehicleId).rating, 1605);
  assert.equal(store.database.prepare(
    'SELECT rating FROM world_creatures WHERE id = ?'
  ).get(creatureId).rating, 1595);
  const combatClassValue = Number(catalog.settings.combat_class_by_rarity[
    catalog.byId.get(vehicleType.itemId).rarity
  ]);
  const liveRanks = store.combatSeasonReport(pursuit.encounterAt, combatClassValue)
    .ratings.find((group) => group.routeType === route.type).players;
  assert.ok(liveRanks.some((entry) => entry.name === saved.name
    && entry.rating === 1605));
  assert.ok(liveRanks.some((entry) => entry.creatureId === creatureId
    && entry.name.endsWith(`#${creatureId}`) && entry.rating === 1595));
  const rewards = JSON.parse(store.database.prepare(
    'SELECT reward_json FROM world_creature_attacks WHERE creature_id = ?'
  ).get(creatureId).reward_json);
  assert.equal(rewards.reduce((sum, reward) => sum + reward.quantity, 0), bountySlots,
    'the killing vehicle fills every remaining cargo slot with bounty');
  assert.equal(store.vehicleDetails(saved.id, vehicleId, pursuit.encounterAt).cargoSize,
    initialCapacity, 'bounty fills the vehicle exactly to its capacity');
  const combatReport = store.recentMessages(saved.id, 'all', 'Vehicle')
    .find((message) => message.details.event === 'world-creature-combat');
  assert.ok(combatReport);
  assert.equal(combatReport.details.rewardQuantity, bountySlots);
  assert.deepEqual(combatReport.details.rewards, rewards);
  assert.doesNotMatch(combatReport.body, /filled with bounty:/);
  const victory = store.recentChats().find((chat) => chat.kind === 'world'
    && /Whale Hunter's/.test(chat.body));
  assert.ok(victory);
  assert.match(victory.body, new RegExp(`defeated the ${
    catalog.rarities.find((rarity) =>
      rarity.id === catalog.byId.get(vehicleType.itemId).rarity).name
  } Land Whale`));
});

test('living route creatures ambush compatible peaceful traffic without a hunt action', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  store.ensureWorldMaps(1000);
  const landType = catalog.settings.route_type_ids.land;
  const route = catalog.routes.find((entry) => entry.open && entry.type === landType
    && entry.city1Id !== entry.city2Id && [entry.city1Id, entry.city2Id].includes(1));
  const vehicleType = catalog.vehicles.find((entry) => entry.routeType === landType
    && catalog.byId.get(entry.itemId)?.rarity === 1);
  assert.ok(route && vehicleType);
  const player = createPlayer('Ambushed Courier', '', 'hash', catalog, 1000, () => 0.5);
  player.inventory[vehicleType.itemId] = 1;
  const saved = store.addPlayer(player);
  const vehicleId = store.activateVehicle(saved.id, vehicleType.itemId);
  const originCityId = store.database.prepare(
    'SELECT city_id FROM player_vehicles WHERE id = ?'
  ).get(vehicleId).city_id;
  const destinationCityId = originCityId;
  const location = destinationCityId === route.city1Id
    ? route.length * 0.6 : route.length * 0.4;
  const speed = catalog.settings.world_creature_speed_kph.elephant_herd
    * catalog.settings.world_creature_tier_speed_multipliers[1];
  const distanceRemaining = destinationCityId === route.city1Id
    ? location : route.length - location;
  const awakenedAt = 2000;
  const arrivesAt = awakenedAt + Math.ceil(distanceRemaining / speed * 60 * 60 * 1000);
  const mapId = store.database.prepare(
    'SELECT map_id FROM catalog_cities WHERE id = ?'
  ).get(destinationCityId).map_id;
  const creatureId = Number(store.database.prepare(`
    INSERT INTO world_creatures
      (creature_type, rarity, map_id, route_id, location, spawn_location,
       destination_city_id, hp, max_hp, awakened_at, moved_at, arrives_at, speed)
    VALUES ('elephant_herd', 1, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?, ?)
  `).run(mapId, route.id, location, location, destinationCityId,
    awakenedAt, awakenedAt, arrivesAt, speed).lastInsertRowid);

  store.sendVehicle(saved.id, vehicleId, route.id, awakenedAt, {
    travelOrder: 'peaceful'
  });
  const pursuit = store.database.prepare(`
    SELECT * FROM world_creature_pursuits
    WHERE creature_id = ? AND vehicle_id = ? AND status = 'pursuing'
  `).get(creatureId, vehicleId);
  assert.ok(pursuit, 'the moving creature should schedule the physical crossing');
  assert.equal(pursuit.initiator, 'creature');
  assert.ok(pursuit.encounter_at > awakenedAt && pursuit.encounter_at < arrivesAt);

  store.settleWorldEvents(pursuit.encounter_at);
  const attack = store.database.prepare(`
    SELECT * FROM world_creature_attacks WHERE creature_id = ? AND vehicle_id = ?
  `).get(creatureId, vehicleId);
  assert.equal(attack.defeated, 1);
  assert.equal(attack.counter_damage, 1,
    'armor may reduce a hostile creature strike to a glancing hit, but not erase it');
  assert.equal(store.database.prepare(
    'SELECT damaged FROM player_vehicles WHERE id = ?'
  ).get(vehicleId).damaged, 1, 'the glancing hit persists as vehicle damage');
  const report = store.recentMessages(saved.id, 'all', 'Vehicle')
    .find((message) => message.details.creatureId === creatureId);
  assert.equal(report.details.initiator, 'creature');
  assert.equal(report.details.counterDamage, 1);
  assert.match(report.body, /ambushed your/i);
  assert.match(report.body, /took 1 damage/i);
  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count FROM world_creature_pursuits
    WHERE creature_id = ? AND vehicle_id = ?
  `).get(creatureId, vehicleId).count, 1, 'settlement must not plan a duplicate ambush');
});

test('spawns every world-creature species in every Common-through-Legendary rarity', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  store.ensureWorldMaps(1000);
  store.settleWorldEvents(1000);
  const administrator = store.addPlayer(
    createPlayer('Creature Curator', '', 'hash', catalog, 1000, () => 0.5)
  );
  const routeTypeId = (name) => catalog.settings.map_route_types
    .findIndex((entry) => entry.name === name);
  const routes = Object.fromEntries(['land', 'sea'].map((behavior) => {
    const route = catalog.routes.find((entry) => entry.open
      && entry.type === routeTypeId(behavior) && entry.city1Id !== entry.city2Id);
    assert.ok(route, `${behavior} route exists`);
    return [behavior, route];
  }));
  const creatureTypes = Object.entries(catalog.settings.world_creature_route_types);
  const tiers = catalog.rarities.filter((rarity) => rarity.id > 0
    && Number(catalog.settings.world_creature_tier_weights[rarity.id]) > 0);
  assert.equal(tiers.length, 6);
  assert.ok(tiers.slice(1).every((tier) =>
    catalog.settings.world_creature_tier_weights[1]
      > catalog.settings.world_creature_tier_weights[tier.id]),
  'Common has the greatest natural spawn weight');

  let spawnedAt = 2000;
  for (const [type, behavior] of creatureTypes) {
    const route = routes[behavior];
    const mapId = store.database.prepare(
      'SELECT map_id FROM catalog_cities WHERE id = ?'
    ).get(route.city1Id).map_id;
    for (const tier of tiers) {
      const spawned = store.adminSpawnWorldCreature(
        administrator.id, type, mapId, route.id, spawnedAt, tier.id
      );
      const row = store.database.prepare(`
        SELECT world_creatures.*, catalog_routes.type AS route_type
        FROM world_creatures JOIN catalog_routes ON catalog_routes.id = world_creatures.route_id
        WHERE world_creatures.id = ?
      `).get(spawned.id);
      assert.equal(row.creature_type, type);
      assert.equal(row.rarity, tier.id);
      assert.equal(row.route_type, routeTypeId(behavior));
      assert.equal(row.max_hp, Math.round(
        catalog.settings.world_creature_hp[type]
          * catalog.settings.world_creature_tier_hp_multipliers[tier.id]
      ));
      assert.equal(row.speed, catalog.settings.world_creature_speed_kph[type]
        * catalog.settings.world_creature_tier_speed_multipliers[tier.id]);
      assert.ok(row.spawn_location > 0 && row.spawn_location < route.length);
      assert.ok(row.arrives_at > row.awakened_at);
      assert.equal(spawned.name,
        `${tier.name} ${catalog.settings.world_creature_names[type]}`);
      assert.equal(spawned.rarityName, tier.name);
      assert.equal(spawned.rewardType,
        catalog.settings.world_creature_reward_types[type]);
      const announcement = store.database.prepare(`
        SELECT body, announcement_type FROM world_chat_announcements
        WHERE event_key = ?
      `).get(`world-creature:${spawned.id}:awakened`);
      assert.ok(announcement, `${spawned.name} is announced`);
      assert.equal(announcement.announcement_type, 'world');
      assert.match(announcement.body, new RegExp(spawned.name));
      assert.equal(store.database.prepare(`
        SELECT COUNT(*) AS count FROM world_chat_announcements WHERE event_key = ?
      `).get(`world-creature:${spawned.id}:awakened`).count, 1);
      if (type === creatureTypes[0][0] && tier.id === tiers[0].id) {
        const revision = store.latestLiveUpdateId();
        store.settleWorldEvents(spawnedAt + 1);
        const projected = store.database.prepare(
          'SELECT location, moved_at FROM world_creatures WHERE id = ?'
        ).get(spawned.id);
        assert.deepEqual({ ...projected }, { location: row.location, moved_at: row.moved_at },
        'position is projected from timestamps without per-tick database writes');
        assert.equal(store.liveUpdatesAfter(revision)
          .filter((event) => event.scope === 'topic:world').length, 0);
      }
      store.database.prepare(`
        UPDATE world_creatures SET status = 'escaped', resolved_at = ? WHERE id = ?
      `).run(spawnedAt, spawned.id);
      spawnedAt += 1;
    }
  }
  assert.throws(() => store.adminSpawnWorldCreature(
    administrator.id, 'dragon', 1, routes.land.id, spawnedAt, 1
  ), /Choose a world creature/);
  assert.throws(() => store.adminSpawnWorldCreature(
    administrator.id, 'white_whale', 1, routes.land.id, spawnedAt, 1
  ), /open sea route/);
});

test('new event creatures use physical route combat and drop tier-scaled Ore', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  store.ensureWorldMaps(1000);
  const landType = catalog.settings.map_route_types.findIndex((entry) => entry.name === 'land');
  const seaType = catalog.settings.map_route_types.findIndex((entry) => entry.name === 'sea');
  const routes = {
    land: catalog.routes.find((route) => route.open && route.type === landType
      && route.city1Id !== route.city2Id && [route.city1Id, route.city2Id].includes(1)),
    sea: catalog.routes.find((route) => route.open && route.type === seaType
      && route.city1Id !== route.city2Id && [route.city1Id, route.city2Id].includes(1))
  };
  const vehicleTypes = {
    land: catalog.vehicles.filter((vehicle) => vehicle.routeType === landType
      && catalog.byId.get(vehicle.itemId).rarity === 1)
      .sort((first, second) => second.speed - first.speed)[0],
    sea: catalog.vehicles.filter((vehicle) => vehicle.routeType === seaType
      && catalog.byId.get(vehicle.itemId).rarity === 1)
      .sort((first, second) => second.speed - first.speed)[0]
  };
  assert.ok(routes.land && routes.sea && vehicleTypes.land && vehicleTypes.sea);
  const player = createPlayer('Ore Beast Hunter', '', 'hash', catalog, 1000, () => 0.5);
  player.inventory[vehicleTypes.land.itemId] = 2;
  player.inventory[vehicleTypes.sea.itemId] = 2;
  const saved = store.addPlayer(player);
  const oreItemId = catalog.settings.ore_item_id;
  const species = [
    ['white_whale', 'sea'], ['orca_pod', 'sea'],
    ['elephant_herd', 'land'], ['t_rex', 'land']
  ];
  const attackNames = catalog.settings.world_creature_attack_names;
  let eventAt = 5000;
  for (const [type, behavior] of species) {
    const route = routes[behavior];
    const vehicleId = store.activateVehicle(saved.id, vehicleTypes[behavior].itemId);
    const destinationCityId = route.city1Id === saved.cityId ? route.city1Id : route.city2Id;
    const location = destinationCityId === route.city1Id
      ? route.length * 0.25 : route.length * 0.75;
    const mapId = store.database.prepare(
      'SELECT map_id FROM catalog_cities WHERE id = ?'
    ).get(destinationCityId).map_id;
    const creatureId = Number(store.database.prepare(`
      INSERT INTO world_creatures
        (creature_type, rarity, map_id, route_id, location, destination_city_id,
         hp, max_hp, awakened_at, moved_at, speed)
      VALUES (?, 1, ?, ?, ?, ?, 1, 1, ?, ?, ?)
    `).run(type, mapId, route.id, location, destinationCityId, eventAt, eventAt,
      catalog.settings.world_creature_speed_kph[type]
        * catalog.settings.world_creature_tier_speed_multipliers[1]).lastInsertRowid);
    const pursuit = store.attackWorldCreature(saved.id, creatureId, vehicleId, eventAt);
    assert.ok(pursuit.encounterAt > eventAt);
    store.settleWorldEvents(pursuit.encounterAt);
    const attack = store.database.prepare(`
      SELECT defeated, reward_json FROM world_creature_attacks
      WHERE creature_id = ? AND vehicle_id = ?
    `).get(creatureId, vehicleId);
    assert.equal(attack.defeated, 1);
    const rewards = JSON.parse(attack.reward_json);
    const expectedOre = Math.min(vehicleTypes[behavior].capacity,
      catalog.settings.world_creature_tier_ore_drops[1]);
    assert.deepEqual(rewards.map((reward) => [reward.itemId, reward.quantity]),
      [[oreItemId, expectedOre]]);
    assert.equal(store.vehicleDetails(saved.id, vehicleId, pursuit.encounterAt)
      .cargo.find((item) => item.itemId === oreItemId)?.quantity, expectedOre,
    'event Ore is loadable even in a Yellow vehicle');
    const report = store.recentMessages(saved.id, 'all', 'Vehicle')
      .find((message) => message.details.creatureId === creatureId);
    assert.equal(report.details.rewardType, 'ore');
    assert.ok(report.details.phases.length >= 1);
    assert.ok(report.details.phases.every((phase) =>
      phase.creatureAttack.name === attackNames[type]
        && phase.creatureAttack.damage >= 1));
    assert.equal(report.details.counterDamage,
      report.details.phases.reduce((sum, phase) => sum + phase.creatureAttack.damage, 0));
    if (behavior === 'sea') {
      assert.ok(report.details.phases.every((phase) => phase.kind === 'cannon'));
      assert.match(report.details.skippedPhases.find((phase) => phase.kind === 'boarding').reason,
        /cannot board a world creature/);
    } else {
      assert.deepEqual(report.details.phases.map((phase) => phase.kind), ['land']);
      assert.deepEqual(report.details.skippedPhases, []);
    }
    assert.match(report.body, /loaded .* Ore/);
    const arrivalAt = store.database.prepare(
      'SELECT arrives_at FROM player_vehicles WHERE id = ?'
    ).get(vehicleId).arrives_at;
    store.settleVehicles(arrivalAt);
    eventAt = arrivalAt + 1000;
  }
});

test('sea creatures counterattack every cannon round and skip boarding', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  store.ensureWorldMaps(1000);
  const seaType = catalog.settings.route_type_ids.sea;
  const route = catalog.routes.find((entry) => entry.open && entry.type === seaType
    && entry.city1Id !== entry.city2Id && [entry.city1Id, entry.city2Id].includes(1));
  const shipType = catalog.vehicles.filter((entry) => entry.routeType === seaType
    && catalog.byId.get(entry.itemId)?.rarity === 1)
    .sort((first, second) => second.ship.hull - first.ship.hull)[0];
  const cannon = catalog.cannons.find((entry) => entry.rateOfFire === 3
    && catalog.byId.get(entry.itemId)?.rarity === 1);
  const ammunition = catalog.cannonballByType.get(1);
  assert.ok(route && shipType && cannon && ammunition);
  const player = createPlayer('Orca Round Hunter', '', 'hash', catalog, 1000, () => 0.5);
  player.inventory[shipType.itemId] = 1;
  player.inventory[cannon.itemId] = 1;
  player.inventory[ammunition.itemId] = 1;
  const saved = store.addPlayer(player);
  const vehicleId = store.activateVehicle(saved.id, shipType.itemId);
  store.attachShipCannon(saved.id, vehicleId, cannon.id);
  store.loadShipAmmo(saved.id, vehicleId, 1);
  const destinationCityId = saved.cityId;
  const mapId = store.database.prepare(
    'SELECT map_id FROM catalog_cities WHERE id = ?'
  ).get(saved.cityId).map_id;
  const creatureId = Number(store.database.prepare(`
    INSERT INTO world_creatures
      (creature_type, rarity, map_id, route_id, location, destination_city_id,
       hp, max_hp, awakened_at, moved_at, speed)
    VALUES ('orca_pod', 1, ?, ?, ?, ?, 10000, 10000, 5000, 5000, ?)
  `).run(mapId, route.id, route.length / 2, destinationCityId,
    catalog.settings.world_creature_speed_kph.orca_pod).lastInsertRowid);

  const pursuit = store.attackWorldCreature(saved.id, creatureId, vehicleId, 5000);
  store.settleWorldEvents(pursuit.encounterAt);
  const report = store.recentMessages(saved.id, 'all', 'Vehicle')
    .find((message) => message.details.creatureId === creatureId);
  assert.equal(report.details.phases.length, 3);
  assert.equal(report.details.shotsFired, 3);
  assert.ok(report.details.phases.every((phase, index) =>
    phase.kind === 'cannon' && phase.round === index + 1
      && phase.vehicleAttacks.some((attack) => attack.kind === 'cannon')
      && phase.creatureAttack.name === 'Coordinated ram'
      && phase.creatureAttack.target === 'hull'
      && phase.creatureAttack.damage >= 1));
  assert.equal(report.details.counterDamage,
    report.details.phases.reduce((sum, phase) => sum + phase.creatureAttack.damage, 0));
  assert.equal(report.details.starting.vehicle.hull - report.details.ending.vehicle.hull,
    report.details.counterDamage);
  assert.match(report.details.skippedPhases[0].reason, /cannot board a world creature/);
});

test('grandfathers existing accounts into mandatory email verification', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-verified-'));
  const databaseFile = path.join(directory, 'verified.sqlite');
  let store = new SqliteStore(databaseFile);
  context.after(() => {
    try { store.close(); } catch {}
    fs.rmSync(directory, { recursive: true, force: true });
  });
  store.seedCatalog(catalog);
  const player = store.addPlayer(createPlayer(
    'Legacy Unverified', 'legacy@example.test', 'hash', catalog, 1000, () => 0.5
  ));
  store.database.prepare('UPDATE players SET email_verified_at = NULL WHERE id = ?').run(player.id);
  store.database.exec('PRAGMA user_version = 83');
  store.close();

  store = new SqliteStore(databaseFile);
  assert.ok(store.database.prepare(
    'SELECT email_verified_at FROM players WHERE id = ?'
  ).get(player.id).email_verified_at);
  assert.equal(store.database.prepare('PRAGMA user_version').get().user_version, 112);
});

test('provisions every miner with an idempotent all-tier ghost-hunter fleet', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const first = store.addPlayer(createPlayer('Ghost Hunter One', '', 'hash', catalog, 1000, () => 0.5));
  const second = store.addPlayer(createPlayer('Ghost Hunter Two', '', 'hash', catalog, 1000, () => 0.5));

  assert.deepEqual(store.provisionGhostHunterFleets(2000), { players: 2, vehicles: 24 });
  assert.deepEqual(store.provisionGhostHunterFleets(2001), { players: 2, vehicles: 0 });
  for (const player of [first, second]) {
    const grants = store.database.prepare(`
      SELECT ghost_hunter_grants.*, catalog_items.rarity,
        catalog_vehicles.route_type, catalog_ships.cannon_portals
      FROM ghost_hunter_grants
      JOIN player_vehicles ON player_vehicles.id = ghost_hunter_grants.vehicle_id
      JOIN catalog_items ON catalog_items.id = player_vehicles.item_id
      JOIN catalog_vehicles ON catalog_vehicles.id = player_vehicles.vehicle_type_id
      LEFT JOIN catalog_ships ON catalog_ships.vehicle_id = catalog_vehicles.id
      WHERE ghost_hunter_grants.player_id = ? ORDER BY route_type, rarity
    `).all(player.id);
    assert.equal(grants.length, 12);
    assert.deepEqual(new Set(grants.map((entry) => entry.rarity)), new Set([1, 2, 3, 4, 5, 6]));
    for (const grant of grants) {
      assert.ok(store.database.prepare(
        'SELECT 1 FROM known_cities WHERE player_id = ? AND city_id = ?'
      ).get(player.id, grant.city_id));
      if (grant.cannon_portals === null) {
        assert.ok(store.database.prepare(
          'SELECT COUNT(*) AS count FROM player_vehicle_weapons WHERE vehicle_id = ?'
        ).get(grant.vehicle_id).count > 0);
      } else {
        assert.equal(store.database.prepare(
          'SELECT COUNT(*) AS count FROM player_ship_cannons WHERE vehicle_id = ?'
        ).get(grant.vehicle_id).count, grant.cannon_portals);
      }
    }
  }
  assert.equal(store.recentMessages(first.id, 'all', 'Vehicle')
    .filter((message) => message.details.event === 'ghost-hunter-fleet').length, 1);
});

test('ghost patrols ambush peaceful traffic across their combat class at reduced force', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const administrator = store.addPlayer(createPlayer('Ghost Master', '', 'hash', catalog, 1000, () => 0.5));
  const hunter = store.addPlayer(createPlayer('Ghost Breaker', '', 'hash', catalog, 1000, () => 0.5));
  store.provisionGhostHunterFleets(2000);
  const grant = store.database.prepare(`
    SELECT * FROM ghost_hunter_grants
    WHERE player_id = ? AND route_type = ? AND rarity = 3
  `).get(hunter.id, catalog.settings.route_type_ids.land);
  const route = store.database.prepare(`
    SELECT * FROM catalog_routes WHERE is_open = 1 AND type = ? AND length > 0
      AND (city1_id = ? OR city2_id = ?) ORDER BY id LIMIT 1
  `).get(catalog.settings.route_type_ids.land, grant.city_id, grant.city_id);
  const ghost = store.adminRaiseGhost(administrator.id, 'rider', route.id, 2, 3000);
  assert.ok(ghost.vehicleId);
  assert.ok(ghost.bounty.reduce((sum, item) => sum + item.quantity, 0) > 0);
  const ghostVehicle = store.database.prepare(
    'SELECT * FROM player_vehicles WHERE id = ?'
  ).get(ghost.vehicleId);
  assert.ok(ghostVehicle.aggressive_mask & (1 << 3),
    'a tier-2 ghost must attack tier 3 in the same combat class');
  const unscaledGhostStats = store.vehicleDetails(
    ghostVehicle.player_id, ghost.vehicleId, 3001
  ).combatStats;
  assert.equal(store.worldEventStatus(hunter.id, 3001).ghosts.some(
    (entry) => entry.id === ghost.id && !entry.defeatedAt), true);

  const journey = store.sendVehicle(hunter.id, grant.vehicle_id, route.id, 3002, {
    travelOrder: 'peaceful'
  });
  const ghostEncounter = resolveNextVehicleEncounter(store);
  journey.battleId = ghostEncounter.battle_id;
  const traffic = store.adminWorldEventControls(3003).transports;
  const hunterTraffic = traffic.find((entry) => entry.id === grant.vehicle_id);
  assert.equal(hunterTraffic.playerName, 'Ghost Breaker');
  assert.equal(hunterTraffic.travelOrder, 'peaceful');
  assert.equal(hunterTraffic.aggressiveVsSentry, false);
  assert.ok(hunterTraffic.progress >= 0 && hunterTraffic.progress <= 1);
  assert.ok(hunterTraffic.weapons.length > 0);
  assert.ok(traffic.some((entry) => entry.npc && entry.ghostId) || !store.database.prepare(
    'SELECT 1 FROM ghost_vehicles WHERE id = ? AND vehicle_id IS NOT NULL'
  ).get(ghost.id));
  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count FROM vehicle_battle_sides
    WHERE battle_id = ? AND player_id = (SELECT id FROM players WHERE is_npc = 1)
  `).get(journey.battleId).count, 1);
  const ratingSides = store.database.prepare(`
    SELECT player_id, rating_before, rating_after FROM vehicle_battle_sides
    WHERE battle_id = ? ORDER BY player_id
  `).all(journey.battleId);
  assert.equal(ratingSides.length, 2);
  assert.ok(ratingSides.every((side) => side.rating_after !== side.rating_before),
    'both the player and NPC remain part of the shared combat rating exchange');
  const battleDetails = JSON.parse(store.database.prepare(
    'SELECT details_json FROM vehicle_battles WHERE id = ?'
  ).get(journey.battleId).details_json);
  assert.match(store.battleReport(hunter.id, journey.battleId).opponent.vehicle_name,
    /^Wraith /);
  assert.equal(battleDetails.ghostAttackForceRatio,
    catalog.settings.ghost_attack_force_ratio);
  const ghostSide = battleDetails.vehicleIds.indexOf(ghost.vehicleId);
  assert.ok(ghostSide >= 0);
  assert.equal(battleDetails.starting[ghostSide].attack,
    unscaledGhostStats.attack * catalog.settings.ghost_attack_force_ratio);
  assert.ok(
    battleDetails.starting[ghostSide].attack + battleDetails.starting[ghostSide].offense
      < unscaledGhostStats.attack + unscaledGhostStats.offense,
    'spectral base attack plus aggressive power must be below the physical fitted craft'
  );
  const liveGhost = store.database.prepare(
    'SELECT * FROM ghost_vehicles WHERE id = ?'
  ).get(ghost.id);
  if (liveGhost.vehicle_id) {
    store.database.prepare('UPDATE player_vehicles SET arrives_at = ? WHERE id = ?')
      .run(4000, liveGhost.vehicle_id);
    const before = store.database.prepare(
      'SELECT origin_city_id, destination_city_id FROM player_vehicles WHERE id = ?'
    ).get(liveGhost.vehicle_id);
    store.settleVehicles(4001);
    const after = store.database.prepare(
      'SELECT status, origin_city_id, destination_city_id, arrives_at FROM player_vehicles WHERE id = ?'
    ).get(liveGhost.vehicle_id);
    assert.equal(after.status, 'traveling');
    assert.equal(after.origin_city_id, before.destination_city_id);
    assert.equal(after.destination_city_id, before.origin_city_id);
    assert.ok(after.arrives_at > 4001);
  }
});

test('lets a ship intercept a traveling Kraken and gives bounty only to its killer', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  store.ensureWorldMaps();
  const route = catalog.routes.find((entry) => entry.open && entry.type === 1
    && entry.city1Id !== entry.city2Id && [entry.city1Id, entry.city2Id].includes(1));
  const shipType = catalog.vehicles.find((vehicle) => vehicle.routeType === 1
    && catalog.byId.has(vehicle.itemId));
  assert.ok(route && shipType);
  const player = createPlayer('Kraken Interceptor', '', 'hash', catalog, 1000, () => 0.5);
  player.profession = 4;
  player.inventory[shipType.itemId] = 1;
  const saved = store.addPlayer(player);
  const vehicleId = store.activateVehicle(saved.id, shipType.itemId);
  const rival = createPlayer('Late Kraken Hunter', '', 'hash', catalog, 1000, () => 0.5);
  rival.profession = 4;
  rival.inventory[shipType.itemId] = 1;
  const savedRival = store.addPlayer(rival);
  const rivalVehicleId = store.activateVehicle(savedRival.id, shipType.itemId);
  const capacity = store.vehicleDetails(saved.id, vehicleId, 3000).capacity;
  const mapId = store.database.prepare(
    'SELECT map_id FROM catalog_cities WHERE id = 1'
  ).get().map_id;
  const creatureId = Number(store.database.prepare(`
    INSERT INTO world_creatures
      (creature_type, map_id, route_id, location, destination_city_id,
       hp, max_hp, awakened_at, moved_at, speed)
    VALUES ('kraken', ?, ?, ?, ?, 1, 180, 3000, 3000, 18)
  `).run(mapId, route.id, route.length / 2, route.city1Id).lastInsertRowid);

  const pursuit = store.attackWorldCreature(saved.id, creatureId, vehicleId, 3000);
  const rivalPursuit = store.attackWorldCreature(
    savedRival.id, creatureId, rivalVehicleId, 3000
  );
  assert.ok(pursuit.encounterAt > 3000);
  assert.equal(store.database.prepare(
    'SELECT status FROM world_creature_pursuits WHERE id = ?'
  ).get(pursuit.pursuitId).status, 'pursuing');
  store.settleWorldEvents(pursuit.encounterAt);
  const attack = store.database.prepare(`
    SELECT defeated, reward_json FROM world_creature_attacks
    WHERE creature_id = ? AND player_id = ? AND vehicle_id = ?
  `).get(creatureId, saved.id, vehicleId);
  assert.equal(attack.defeated, 1);
  assert.equal(JSON.parse(attack.reward_json)
    .reduce((sum, reward) => sum + reward.quantity, 0), capacity);
  const defeated = store.database.prepare(`
    SELECT defeated_by_player_id, defeated_by_vehicle_id FROM world_creatures WHERE id = ?
  `).get(creatureId);
  assert.equal(defeated.defeated_by_player_id, saved.id);
  assert.equal(defeated.defeated_by_vehicle_id, vehicleId);
  assert.equal(store.database.prepare(
    'SELECT status FROM world_creature_pursuits WHERE id = ?'
  ).get(rivalPursuit.pursuitId).status, 'cancelled');
  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count FROM world_creature_attacks
    WHERE creature_id = ? AND player_id = ?
  `).get(creatureId, savedRival.id).count, 0,
  'a later attacker gets neither a combat result nor the killing vehicle bounty');
  assert.equal(store.vehicleDetails(
    savedRival.id, rivalVehicleId, rivalPursuit.encounterAt
  ).cargoSize, 0);
});

test('background-settles arrivals once with scheduled Vehicle and City reports', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-vehicle-worker-'));
  const databaseFile = path.join(directory, 'game.sqlite');
  const store = new SqliteStore(databaseFile, { busyTimeoutMs: 1000 });
  store.seedCatalog(catalog);
  const vehicleType = catalog.vehicles.find((vehicle) => vehicle.routeType === 0
    && vehicle.capacity >= 2 && catalog.byId.get(vehicle.itemId)?.rarity >= 4
    && catalog.routes.some((route) => route.open && route.type === 0
      && route.city1Id !== route.city2Id && (route.city1Id === 1 || route.city2Id === 1)));
  const cargo = catalog.items.find((item) => item.rarity === 4
    && !catalog.vehicleByItemId.has(item.id) && !catalog.weaponByItemId.has(item.id)
    && !catalog.boxByItemId.has(item.id));
  assert.ok(vehicleType && cargo);
  const player = store.addPlayer(createPlayer(
    'Background Courier', '', 'hash', catalog, 1000, () => 0.5
  ));
  player.profession = 1;
  player.inventory[vehicleType.itemId] = 1;
  player.inventory[cargo.id] = 2;
  store.savePlayer(player);
  const vehicleId = store.activateVehicle(player.id, vehicleType.itemId);
  store.setVehicleCargo(player.id, vehicleId, { [cargo.id]: 2 });
  const route = store.routesForVehicle(player.id, vehicleId, 2000)[0];
  const journey = store.sendVehicle(player.id, vehicleId, route.id, 2000);
  const workers = Array.from({ length: 2 }, () => new Worker(
    new URL('../src/maintenance-worker.js', import.meta.url), {
      workerData: { databaseFile, busyTimeoutMs: 1000 }
    }
  ));
  context.after(async () => {
    await Promise.all(workers.map((worker) => worker.terminate()));
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const ticks = workers.map((worker) => new Promise((resolve, reject) => {
    worker.once('message', resolve);
    worker.once('error', reject);
    worker.postMessage({ type: 'tick', now: journey.arrivesAt + 5000 });
  }));
  const completed = await Promise.all(ticks);
  assert.ok(completed.every((tick) => tick.type === 'tick-complete'));
  assert.equal(completed.reduce((sum, tick) => sum + tick.vehicles.arrived, 0), 1);

  const vehicleMessages = store.recentMessages(player.id, 'all', 'Vehicle');
  const cityMessages = store.recentMessages(player.id, 'all', 'City');
  assert.equal(vehicleMessages.length, 1);
  assert.equal(cityMessages.length, 1);
  const arrival = vehicleMessages[0];
  assert.equal(arrival.createdAt, journey.arrivesAt);
  assert.equal(arrival.details.event, 'arrived');
  assert.equal(arrival.details.destinationCityId, journey.destinationCityId);
  assert.deepEqual(arrival.details.cargo, [{ itemId: cargo.id, name: cargo.name, quantity: 2 }]);
  assert.match(arrival.body, /Delivered 2 cargo things, shown below/);
  assert.ok(arrival.actionLinks.some((action) => action.href === `/vehicles/${vehicleId}`));
  assert.equal(cityMessages[0].createdAt, journey.arrivesAt);
  assert.equal(cityMessages[0].details.cityId, journey.destinationCityId);
  assert.ok(cityMessages[0].actionLinks.some((action) => action.href === '/map'));
  assert.equal(store.playerById(player.id).inventoryByCity[journey.destinationCityId][cargo.id], 2);

  assert.deepEqual(store.settleVehicles(journey.arrivesAt + 10000), {
    playersProcessed: 0, aircraftResolved: 0, shipsProcessed: 0, arrived: 0, sunk: 0
  });
  assert.equal(store.recentMessages(player.id, 'all', 'Vehicle').length, 1);
  assert.equal(store.recentMessages(player.id, 'all', 'City').length, 1);
  const opened = store.messageForPlayer(player.id, arrival.id);
  assert.equal(opened.read, false);
  assert.equal(store.recentMessages(player.id, 'unread', 'Vehicle').length, 0);

  const emptyTick = await new Promise((resolve, reject) => {
    workers[0].once('message', resolve);
    workers[0].once('error', reject);
    workers[0].postMessage({ type: 'tick', now: journey.arrivesAt + 10000 });
  });
  assert.equal(emptyTick.type, 'tick-complete');
  assert.deepEqual(emptyTick.vehicles, {
    playersProcessed: 0, aircraftResolved: 0, shipsProcessed: 0, arrived: 0, sunk: 0
  });
});

test('background-settles factory completions and sends the report exactly once', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-factory-worker-'));
  const databaseFile = path.join(directory, 'game.sqlite');
  const store = new SqliteStore(databaseFile, { busyTimeoutMs: 1000 });
  store.seedCatalog(catalog);
  const player = store.addPlayer(createPlayer(
    'Background Manufacturer', '', 'hash', catalog, 1000, () => 0.5
  ));
  const action = catalog.factoryActions.find((entry) => entry.actionKind === 'build');
  const factoryId = Number(store.database.prepare(`
    INSERT INTO factories
      (owner_id, operator_id, city_id, built, factory_action_id, item_id,
        components_done, last_event_at, completion_at, rental_expires, created_at)
    VALUES (?, ?, ?, 0, ?, NULL, ?, 2000, 2000, NULL, 1000)
  `).run(player.id, player.id, player.cityId, action.id, action.components).lastInsertRowid);
  const worker = new Worker(new URL('../src/maintenance-worker.js', import.meta.url), {
    workerData: { databaseFile, busyTimeoutMs: 1000 }
  });
  context.after(async () => {
    await worker.terminate();
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const tick = (now) => new Promise((resolve, reject) => {
    worker.once('message', resolve);
    worker.once('error', reject);
    worker.postMessage({ type: 'tick', now });
  });

  const completed = await tick(3000);
  assert.equal(completed.type, 'tick-complete');
  assert.deepEqual(completed.factories, {
    factoriesProcessed: 1, completed: 1, rentalsExpired: 0
  });
  assert.equal(store.database.prepare('SELECT built FROM factories WHERE id = ?').get(factoryId).built, 1);
  const reports = store.recentMessages(player.id, 'all', 'Factory');
  assert.equal(reports.length, 1);
  assert.equal(reports[0].details.event, 'factory-action-completed');
  assert.equal(reports[0].details.factoryId, factoryId);

  const repeated = await tick(4000);
  assert.deepEqual(repeated.factories, {
    factoriesProcessed: 0, completed: 0, rentalsExpired: 0
  });
  assert.equal(store.recentMessages(player.id, 'all', 'Factory').length, 1);
});

test('reports an expired employment contract to both worker and employer exactly once', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const employer = store.addPlayer(createPlayer(
    'Contract Employer', '', 'hash', catalog, 1000, () => 0.5
  ));
  const worker = store.addPlayer(createPlayer(
    'Contract Worker', '', 'hash', catalog, 1000, () => 0.5
  ));
  const addMeld = store.database.prepare(
    'INSERT INTO player_melds (player_id, meld_id, created_at) VALUES (?, ?, 1000)'
  );
  for (const meld of catalog.melds.slice(0, 10)) addMeld.run(worker.id, meld.id);
  store.changeProfession(worker.id, 8, 1000);
  const contract = store.hireWorker(employer.id, worker.id, 2000);

  assert.deepEqual(store.settleFactories(contract.expiresAt), {
    factoriesProcessed: 0, completed: 0, rentalsExpired: 0
  });
  assert.equal(store.recentMessages(worker.id, 'all', 'Factory')
    .filter((message) => message.details.event === 'worker-contract-expired').length, 1);
  assert.equal(store.recentMessages(employer.id, 'all', 'Factory')
    .filter((message) => message.details.event === 'employee-contract-expired').length, 1);
  store.settleFactories(contract.expiresAt + 1);
  assert.equal(store.recentMessages(worker.id, 'all', 'Factory').length, 1);
  assert.equal(store.recentMessages(employer.id, 'all', 'Factory').length, 1);
});

test('uses live database route-role IDs instead of numeric JavaScript roles', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const route = catalog.routes.find((entry) => entry.open && entry.type === 0
    && entry.city1Id !== entry.city2Id && (entry.city1Id === 1 || entry.city2Id === 1));
  const vehicleType = catalog.vehicles.find((entry) => entry.routeType === 0
    && catalog.byId.has(entry.itemId));
  assert.ok(route && vehicleType);

  store.database.prepare('UPDATE catalog_settings SET value_json = ? WHERE key = ?')
    .run(JSON.stringify({ land: 9, sea: 1, air: 2 }), 'route_type_ids');
  store.database.prepare('UPDATE catalog_routes SET type = 9 WHERE id = ?').run(route.id);
  store.database.prepare('UPDATE catalog_vehicles SET route_type = 9 WHERE id = ?').run(vehicleType.id);

  const player = createPlayer('Live Route Roles', '', 'hash', catalog, 1000, () => 0.5);
  player.inventory[vehicleType.itemId] = 1;
  const saved = store.addPlayer(player);
  const vehicleId = store.activateVehicle(saved.id, vehicleType.itemId);
  assert.equal(store.vehiclesForPlayer(saved.id, 2000)[0].type, 'land');
  assert.ok(store.routesForVehicle(saved.id, vehicleId, 2000).some((entry) => entry.id === route.id));
});

test('lets Fisherman ships replace bait with equal-rarity fish while underway', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const ship = catalog.vehicles.find((vehicle) => vehicle.routeType === 1 && catalog.routes.some((route) =>
    route.open && route.type === 1 && (route.city1Id === 1 || route.city2Id === 1) && route.city1Id !== route.city2Id));
  const route = catalog.routes.find((entry) => entry.open && entry.type === 1
    && (entry.city1Id === 1 || entry.city2Id === 1) && entry.city1Id !== entry.city2Id);
  const lure = catalog.items.find((item) => item.mineTypeId === 14 && item.rarity === 1 && !item.repairedItemId);
  const fishItemIds = new Set(catalog.items.filter((item) => item.mineTypeId === 15)
    .map((item) => item.id));
  store.database.exec(`
    UPDATE catalog_items SET mine_type_id = CASE mine_type_id
      WHEN 14 THEN 15 WHEN 15 THEN 14 ELSE mine_type_id END;
    UPDATE catalog_settings SET value_json = '15' WHERE key = 'bait_mine_type_id';
    UPDATE catalog_settings SET value_json = '14' WHERE key = 'fish_mine_type_id';
  `);
  const player = store.addPlayer(createPlayer('Fisher', '', 'hash', catalog, 1000, () => 0.5));
  player.profession = 7;
  player.inventory[ship.itemId] = 1;
  player.inventory[lure.id] = 2;
  store.savePlayer(player);
  const vehicleId = store.activateVehicle(player.id, ship.itemId);
  store.setVehicleCargo(player.id, vehicleId, { [lure.id]: 2 });
  const trip = store.sendVehicle(player.id, vehicleId, route.id, 2000);
  const fishingState = store.database.prepare(
    'SELECT next_fish_location FROM player_ship_state WHERE vehicle_id = ?'
  ).get(vehicleId);
  const routeProgress = route.city1Id === 1
    ? fishingState.next_fish_location / route.length
    : (route.length - fishingState.next_fish_location) / route.length;
  const firstCatchAt = Math.ceil(2000 + routeProgress * trip.duration) + 1;
  const traveling = store.vehicleDetails(player.id, vehicleId, firstCatchAt);
  assert.equal(traveling.status, 'traveling');
  assert.equal(traveling.cargo.filter((item) => fishItemIds.has(item.itemId))
    .reduce((sum, item) => sum + item.quantity, 0), 1);
  assert.equal(traveling.cargo.find((item) => item.itemId === lure.id)?.quantity, 1);
  store.vehicleDetails(player.id, vehicleId, trip.arrivesAt + 1);
  const arrived = store.playerById(player.id);
  const fishCount = Object.entries(arrived.inventoryByCity[trip.destinationCityId] ?? {})
    .filter(([itemId]) => fishItemIds.has(Number(itemId)))
    .reduce((sum, [, count]) => sum + count, 0);
  assert.equal(fishCount, 2);
  assert.ok(store.stonesForPlayer(player.id).earned.some((stone) => stone.name === 'Fished'));
});

test('purchases original credit containers with one capacity bonus per type', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const player = store.addPlayer(createPlayer('Container Miner', '', 'hash', catalog, 1000, () => 0.5));
  const chest = catalog.containers.find((container) => container.name === 'Chest');
  const first = store.buyContainer(player.id, chest.id);
  const second = store.buyContainer(player.id, chest.id);
  assert.equal(first.itemLimit, 5025);
  assert.equal(second.itemLimit, 5025);
  assert.equal(second.quantity, 2);
  const restored = store.playerById(player.id);
  assert.equal(restored.itemLimit, 5025);
  assert.equal(restored.containers.find((container) => container.id === chest.id).owned, 2);
  assert.equal(restored.credits, 100 - chest.credits * 2);
});

test('fits vehicle cargo, mods, and weapons with original class limits', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const player = store.addPlayer(createPlayer('Driver', '', 'hash', catalog, 1000, () => 0.5));
  const vehicleType = catalog.vehicles.find((vehicle) => vehicle.routeType === 0
    && catalog.byId.get(vehicle.itemId)?.rarity >= 4 && vehicle.capacity >= 3);
  const mod = catalog.mods.find((entry) => catalog.byId.get(entry.itemId)?.rarity === 1);
  const weapon = catalog.weapons.find((entry) => catalog.byId.get(entry.itemId)?.rarity === 1);
  const cargo = catalog.items.find((item) => item.rarity === 4 && !catalog.vehicleByItemId.has(item.id)
    && item.id !== mod.itemId && item.id !== weapon.itemId);
  assert.ok(vehicleType && mod && weapon && cargo);
  player.profession = 1;
  player.inventory[vehicleType.itemId] = 1;
  player.inventory[mod.itemId] = 1;
  player.inventory[weapon.itemId] = 1;
  player.inventory[cargo.id] = 2;
  store.savePlayer(player);

  const vehicleId = store.activateVehicle(player.id, vehicleType.itemId);
  const preview = store.previewVehicleFittings(player.id, vehicleId, [mod.id], [weapon.id]);
  assert.equal(preview.valid, true);
  assert.equal(store.vehicleDetails(player.id, vehicleId, 2000).mods.length, 0);
  store.fitVehicleLoadout(player.id, vehicleId, [mod.id], [weapon.id]);
  store.setVehicleCargo(player.id, vehicleId, { [cargo.id]: 2 });
  const details = store.vehicleDetails(player.id, vehicleId, 2000);
  assert.equal(details.mods[0].id, mod.id);
  assert.equal(details.weapons[0].id, weapon.id);
  assert.equal(details.cargo[0].itemId, cargo.id);
  assert.equal(details.cargoSize, 2);
});

test('accounts for items and bolts across the complete land fitting lifecycle', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const player = store.addPlayer(createPlayer('Loadout Mechanic', '', 'hash', catalog, 1000, () => 0.5));
  const vehicleType = catalog.vehicles.find((vehicle) => vehicle.routeType === 0
    && catalog.byId.get(vehicle.itemId)?.rarity >= 4 && vehicle.capacity >= 2);
  const mod = catalog.mods.find((entry) => catalog.byId.get(entry.itemId)?.rarity === 2);
  const weapon = catalog.weapons.find((entry) => catalog.byId.get(entry.itemId)?.rarity === 2);
  const boltItemId = Number(catalog.settings.bolt_item_id);
  assert.ok(vehicleType && mod && weapon && boltItemId);
  player.inventory[vehicleType.itemId] = 1;
  player.inventory[mod.itemId] = 1;
  player.inventory[weapon.itemId] = 1;
  player.inventory[boltItemId] = 2;
  store.savePlayer(player);
  const vehicleId = store.activateVehicle(player.id, vehicleType.itemId);

  const invalidPreview = store.previewVehicleFittings(player.id, vehicleId, [mod.id], []);
  assert.equal(invalidPreview.valid, false);
  assert.match(invalidPreview.reasons.join(' '), /defense -2/);
  assert.equal(store.playerById(player.id).inventory[mod.itemId], 1);
  assert.throws(() => store.fitVehicleLoadout(player.id, vehicleId, [mod.id], []),
    /Combat stats cannot be negative: defense -2/);
  assert.equal(store.playerById(player.id).inventory[mod.itemId], 1);
  assert.equal(store.vehicleDetails(player.id, vehicleId, 2000).mods.length, 0);
  store.fitVehicleLoadout(player.id, vehicleId, [mod.id], [weapon.id]);
  let restored = store.playerById(player.id);
  assert.equal(restored.inventory[mod.itemId], undefined);
  assert.equal(restored.inventory[weapon.itemId], undefined);
  assert.equal(restored.inventory[boltItemId], undefined);
  assert.throws(() => store.storeVehicle(player.id, vehicleId), /Unload all cargo, fittings/);

  store.fitVehicleMods(player.id, vehicleId, [mod.id]);
  store.fitVehicleWeapons(player.id, vehicleId, [weapon.id]);
  assert.equal(store.vehicleDetails(player.id, vehicleId, 2000).mods.length, 1);
  assert.equal(store.vehicleDetails(player.id, vehicleId, 2000).weapons.length, 1);

  store.fitVehicleLoadout(player.id, vehicleId, [], []);
  restored = store.playerById(player.id);
  assert.equal(restored.inventory[mod.itemId], 1);
  assert.equal(restored.inventory[weapon.itemId], 1);
  assert.equal(restored.inventory[boltItemId], undefined);
  store.storeVehicle(player.id, vehicleId);
  assert.equal(store.playerById(player.id).inventory[vehicleType.itemId], 1);
});

test('resolves aggressive land encounters and records ratings and battle reports', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const vehicleType = catalog.vehicles.find((vehicle) => vehicle.routeType === 0
    && vehicle.land?.attack > 0 && vehicle.land?.armor > 0
    && catalog.routes.some((route) => route.open && route.type === 0
      && route.city1Id !== route.city2Id && (route.city1Id === 1 || route.city2Id === 1)));
  assert.ok(vehicleType);
  const trader = store.addPlayer(createPlayer('Trader', '', 'hash', catalog, 1000, () => 0.5));
  const highwayman = store.addPlayer(createPlayer('Highwayman', '', 'hash', catalog, 1000, () => 0.5));
  trader.profession = 1;
  highwayman.profession = 2;
  trader.inventory[vehicleType.itemId] = 1;
  highwayman.inventory[vehicleType.itemId] = 1;
  store.savePlayer(trader);
  store.savePlayer(highwayman);
  const traderVehicle = store.activateVehicle(trader.id, vehicleType.itemId);
  const robberVehicle = store.activateVehicle(highwayman.id, vehicleType.itemId);
  const route = store.routesForVehicle(trader.id, traderVehicle, 2000)[0];
  store.sendVehicle(trader.id, traderVehicle, route.id, 2000);
  const encounter = store.sendVehicle(highwayman.id, robberVehicle, route.id, 2000, {
    aggressiveMask: 1 << catalog.byId.get(vehicleType.itemId).rarity
  });
  assert.equal(encounter.battleId, null);
  const planned = store.database.prepare(
    "SELECT * FROM vehicle_encounters WHERE status = 'planned' ORDER BY id LIMIT 1"
  ).get();
  assert.ok(planned.encounter_at > 2000);
  store.settleVehicles(planned.encounter_at - 1);
  assert.equal(store.database.prepare('SELECT COUNT(*) AS count FROM vehicle_battles').get().count, 0);
  encounter.battleId = resolveNextVehicleEncounter(store).battle_id;
  const report = store.battleReport(highwayman.id, encounter.battleId);
  assert.equal(report.details.type, 'land2');
  assert.notEqual(report.ratingAfter, report.ratingBefore);
  const battleNotice = store.liveUpdatesAfter(Math.max(0, store.latestLiveUpdateId() - 20)).find((event) =>
    event.scope === `player:${highwayman.id}` && event.eventType === 'battle-complete');
  assert.ok(battleNotice);
  assert.equal(battleNotice.payload.battleId, encounter.battleId);
  assert.equal(battleNotice.payload.summary.kind, 'land');
  assert.ok(battleNotice.payload.summary.rounds > 0);
  assert.equal(battleNotice.payload.reportPath, `/battles/${encounter.battleId}`);
  store.database.prepare('UPDATE catalog_items SET name = ? WHERE id = ?')
    .run('Live Battle Vehicle', vehicleType.itemId);
  assert.equal(store.battleReport(highwayman.id, encounter.battleId).opponent.vehicle_name,
    'Live Battle Vehicle');
  const combatArrival = store.database.prepare(
    'SELECT MAX(arrives_at) AS arrives_at FROM player_vehicles WHERE id IN (?, ?)'
  ).get(traderVehicle, robberVehicle).arrives_at;
  store.vehiclesForPlayer(trader.id, combatArrival);
  store.vehiclesForPlayer(highwayman.id, combatArrival);
  store.storeVehicle(report.opponent.player_id, report.opponentVehicleId);
  assert.equal(store.battleReport(highwayman.id, encounter.battleId).opponent.vehicle_name,
    'Live Battle Vehicle');
  const ratings = store.vehicleRatings(catalog.byId.get(vehicleType.itemId).rarity >= 4 ? 4 : 2);
  assert.ok(ratings.ratings[0].players.some((entry) => entry.name === 'Highwayman'));
  const winnerId = report.won ? highwayman.id : trader.id;
  const winStone = catalog.byId.get(vehicleType.itemId).rarity === 1 ? 'Won Land' : 'Dominated Land';
  assert.ok(store.stonesForPlayer(winnerId).earned.some((stone) => stone.name === winStone));
});

test('routes oil-field power and deploys queued replacements after expiry', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const pilot = store.addPlayer(createPlayer('Power Pilot', '', 'hash', catalog, 1000, () => 0.5));
  const pump = catalog.machines.find((machine) => machine.type === 'pump'
    && catalog.byId.get(machine.itemId).rarity === 1);
  const power = catalog.machines.find((machine) => machine.type === 'power'
    && catalog.byId.get(machine.itemId).rarity === 1);
  const pad = catalog.machines.find((machine) => machine.type === 'pad'
    && catalog.byId.get(machine.itemId).rarity === 1);
  assert.ok(pump && power && pad);
  pilot.profession = 10;
  pilot.cityId = 2;
  pilot.inventoryByCity[2] = { [pump.itemId]: 1, [power.itemId]: 1, [pad.itemId]: 1 };
  pilot.inventory = pilot.inventoryByCity[2];
  store.savePlayer(pilot);

  const field = store.oilField(pilot.id, 1000);
  const pumpHex = field.hexes.find((hex) => hex.x === 0 && hex.y === 0);
  const powerHex = field.hexes.find((hex) => hex.x === 0 && hex.y === -1);
  store.deployOilMachine(pilot.id, pumpHex.id, pump.id, 0, 1000);
  store.deployOilMachine(pilot.id, powerHex.id, power.id, 0, 1000);
  const powered = store.oilField(pilot.id, 2000);
  assert.equal(powered.hexes.find((hex) => hex.id === pumpHex.id).machine.power, 2);

  store.queueOilMachine(pilot.id, pumpHex.id, pad.id, 0, 2000);
  const queuedMachine = store.oilField(pilot.id, 2000).hexes
    .find((hex) => hex.id === pumpHex.id).queuedMachine;
  assert.equal(queuedMachine.type, 'pad');
  assert.equal(queuedMachine.machineTypeId, pad.machineTypeId);
  const expiredAt = 1000 + 0.5 * 1.2 * 24 * 60 * 60 * 1000 + 1;
  const replaced = store.oilField(pilot.id, expiredAt);
  assert.equal(replaced.hexes.find((hex) => hex.id === pumpHex.id).machine.type, 'pad');
  assert.equal(replaced.hexes.find((hex) => hex.id === pumpHex.id).queuedMachine, null);
});

test('bombs oil machines and protects rival oil data without a Search Plane', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const victim = store.addPlayer(createPlayer('Field Owner', '', 'hash', catalog, 1000, () => 0.5));
  const attacker = store.addPlayer(createPlayer('Bomber Pilot', '', 'hash', catalog, 1000, () => 0.5));
  const pump = catalog.machines.find((machine) => machine.type === 'pump'
    && catalog.byId.get(machine.itemId).rarity === 3);
  const flower = catalog.machines.find((machine) => machine.type === 'flower');
  const bomber = catalog.items.find((item) => item.name === 'Bomber');
  const searchPlane = catalog.items.find((item) => item.name === 'Search Plane');
  assert.ok(pump && flower && bomber && searchPlane);
  for (const player of [victim, attacker]) {
    player.profession = 10;
    player.cityId = 2;
    player.inventoryByCity[2] = {};
    player.inventory = player.inventoryByCity[2];
  }
  victim.inventory[pump.itemId] = 1;
  attacker.inventory[flower.itemId] = 1;
  attacker.inventory[bomber.id] = 1;
  store.savePlayer(victim);
  store.savePlayer(attacker);

  const targetHex = store.oilField(victim.id, 1000).hexes.find((hex) => hex.x === 0 && hex.y === 0);
  store.deployOilMachine(victim.id, targetHex.id, pump.id, 0, 1000);
  assert.equal(store.oilField(attacker.id, 1500).hexes.find((hex) => hex.id === targetHex.id).oilLiters, null);
  const before = store.oilField(victim.id, 1500).hexes.find((hex) => hex.id === targetHex.id).machine.lifeRemaining;
  const result = store.bombOilHex(attacker.id, targetHex.id, flower.id, 2000);
  const after = store.oilField(victim.id, 2001).hexes.find((hex) => hex.id === targetHex.id).machine.lifeRemaining;
  assert.ok(result.damageSeconds >= 86400 && result.damageSeconds <= 3 * 86400);
  assert.ok(after < before - 86000 * 1000);
  assert.ok(store.oilField(victim.id, 2001).events.some((event) => event.type === 'bombed'));
  const notification = store.recentMessages(victim.id).find((message) => message.messageType === 'Machine');
  assert.equal(notification.subject, `Your ${catalog.byId.get(pump.itemId).name} was bombed`);
  assert.match(notification.body, /liters of oil were burned off the hex/);

  const equipped = store.playerById(attacker.id);
  equipped.inventoryByCity[2][searchPlane.id] = 1;
  equipped.inventory = equipped.inventoryByCity[2];
  store.savePlayer(equipped);
  assert.equal(typeof store.oilField(attacker.id, 2002).hexes.find((hex) => hex.id === targetHex.id).oilLiters, 'number');
});

test('flak blocks deployments and bombs while drones block bombs only', (context) => {
  const stores = [];
  context.after(() => stores.forEach((store) => store.close()));
  const pump = catalog.machines.find((machine) => machine.type === 'pump'
    && catalog.byId.get(machine.itemId).rarity === 1);
  const flower = catalog.machines.find((machine) => machine.type === 'flower');
  const bomber = catalog.items.find((item) => item.name === 'Bomber');
  assert.ok(pump && flower && bomber);

  for (const defenseType of ['flak', 'drone']) {
    const store = new SqliteStore(':memory:');
    stores.push(store);
    store.seedCatalog(catalog);
    const defense = catalog.machines.find((machine) => machine.type === defenseType);
    const owner = store.addPlayer(createPlayer(`${defenseType} Owner`, '', 'hash', catalog, 1000, () => 0.5));
    const attacker = store.addPlayer(createPlayer(`${defenseType} Attacker`, '', 'hash', catalog, 1000, () => 0.5));
    for (const player of [owner, attacker]) {
      player.profession = 10;
      player.cityId = 2;
      player.inventoryByCity[2] = {};
      player.inventory = player.inventoryByCity[2];
    }
    owner.inventory[defense.itemId] = 1;
    owner.inventory[pump.itemId] = 1;
    attacker.inventory[pump.itemId] = 1;
    attacker.inventory[flower.itemId] = 1;
    attacker.inventory[bomber.id] = 1;
    store.savePlayer(owner);
    store.savePlayer(attacker);

    const field = store.oilField(owner.id, 1000);
    const center = field.hexes.find((hex) => hex.x === 0 && hex.y === 0);
    const north = field.hexes.find((hex) => hex.x === 0 && hex.y === -1);
    const east = field.hexes.find((hex) => hex.x === 1 && hex.y === 0);
    store.deployOilMachine(owner.id, center.id, defense.id, 0, 1000);
    store.deployOilMachine(owner.id, north.id, pump.id, 0, 1000);

    assert.throws(() => store.bombOilHex(attacker.id, north.id, flower.id, 1100),
      /defenses destroyed the bomb/);
    if (defenseType === 'flak') {
      assert.throws(() => store.deployOilMachine(attacker.id, east.id, pump.id, 0, 1100),
        /flak prevents deployment/);
    } else {
      assert.doesNotThrow(() => store.deployOilMachine(attacker.id, east.id, pump.id, 0, 1100));
    }
  }
});

test('hostile oil machines damage targets while welders extend machine life', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const pump = catalog.machines.find((machine) => machine.type === 'pump'
    && catalog.byId.get(machine.itemId).rarity === 1);
  const pelter = catalog.machines.find((machine) => machine.type === 'pelter'
    && catalog.byId.get(machine.itemId).rarity === 1);
  const welder = catalog.machines.find((machine) => machine.type === 'welder');
  assert.ok(pump && pelter && welder);
  const owner = store.addPlayer(createPlayer('Repair Pilot', '', 'hash', catalog, 1000, () => 0.5));
  const attacker = store.addPlayer(createPlayer('Pelter Pilot', '', 'hash', catalog, 1000, () => 0.5));
  for (const player of [owner, attacker]) {
    player.profession = 10;
    player.cityId = 2;
    player.inventoryByCity[2] = {};
    player.inventory = player.inventoryByCity[2];
  }
  owner.inventory[pump.itemId] = 2;
  owner.inventory[welder.itemId] = 1;
  attacker.inventory[pelter.itemId] = 1;
  store.savePlayer(owner);
  store.savePlayer(attacker);

  const field = store.oilField(owner.id, 1000);
  const attackedHex = field.hexes.find((hex) => hex.x === 0 && hex.y === 0);
  const pelterHex = field.hexes.find((hex) => hex.x === 0 && hex.y === -1);
  const repairedHex = field.hexes.find((hex) => hex.x === 1 && hex.y === 0);
  const welderHex = field.hexes.find((hex) => hex.x === 1 && hex.y === -1);
  store.deployOilMachine(owner.id, attackedHex.id, pump.id, 0, 1000);
  store.deployOilMachine(attacker.id, pelterHex.id, pelter.id, 0, 1000);
  store.deployOilMachine(owner.id, repairedHex.id, pump.id, 0, 1000);
  store.deployOilMachine(owner.id, welderHex.id, welder.id, 0, 1000);
  const before = store.oilField(owner.id, 1000);
  const attackedBefore = before.hexes.find((hex) => hex.id === attackedHex.id).machine.lifeRemaining;
  const repairedBefore = before.hexes.find((hex) => hex.id === repairedHex.id).machine.lifeRemaining;

  const after = store.oilField(owner.id, 11000);
  const attackedAfter = after.hexes.find((hex) => hex.id === attackedHex.id).machine.lifeRemaining;
  const repairedAfter = after.hexes.find((hex) => hex.id === repairedHex.id).machine.lifeRemaining;
  assert.equal(attackedBefore - attackedAfter, 20000);
  assert.ok(repairedAfter > repairedBefore);
});

test('cranes steal one nearby oil barrel every five minutes', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const pump = catalog.machines.find((machine) => machine.type === 'pump'
    && catalog.byId.get(machine.itemId).rarity === 1);
  const crane = catalog.machines.find((machine) => machine.type === 'crane');
  assert.ok(pump && crane);
  const owner = store.addPlayer(createPlayer('Barrel Owner', '', 'hash', catalog, 1000, () => 0.5));
  const thief = store.addPlayer(createPlayer('Crane Pilot', '', 'hash', catalog, 1000, () => 0.5));
  for (const player of [owner, thief]) {
    player.profession = 10;
    player.cityId = 2;
    player.inventoryByCity[2] = {};
    player.inventory = player.inventoryByCity[2];
  }
  owner.inventory[pump.itemId] = 1;
  thief.inventory[crane.itemId] = 1;
  store.savePlayer(owner);
  store.savePlayer(thief);

  const field = store.oilField(owner.id, 1000);
  const source = field.hexes.find((hex) => hex.x === 0 && hex.y === 0);
  const destination = field.hexes.find((hex) => hex.x === 0 && hex.y === -1);
  store.deployOilMachine(owner.id, source.id, pump.id, 0, 1000);
  store.deployOilMachine(thief.id, destination.id, crane.id, 0, 1000);
  store.database.prepare('UPDATE oil_hexes SET barrels = 2 WHERE id = ?').run(source.id);

  store.oilField(thief.id, 601001);
  assert.equal(store.oilField(owner.id, 601001).hexes.find((hex) => hex.id === source.id).barrels, 0);
  assert.equal(store.oilField(thief.id, 601001).hexes.find((hex) => hex.id === destination.id).barrels, 2);

  // Catching up the rest of a day must not rebuild the 469-hex oil network for every theft.
  store.database.prepare('UPDATE oil_hexes SET barrels = 286 WHERE id = ?').run(source.id);
  store.database.prepare('UPDATE oil_machines SET life_seconds = 172800').run();
  const started = performance.now();
  store.oilField(thief.id, 1000 + 24 * 60 * 60 * 1000);
  const elapsed = performance.now() - started;
  assert.equal(store.oilField(owner.id, 1000 + 24 * 60 * 60 * 1000)
    .hexes.find((hex) => hex.id === source.id).barrels, 0);
  assert.equal(store.oilField(thief.id, 1000 + 24 * 60 * 60 * 1000)
    .hexes.find((hex) => hex.id === destination.id).barrels, 288);
  assert.ok(elapsed < 5000, `one-day crane settlement took ${Math.round(elapsed)}ms`);
});

test('routes every angled pipe from its legacy tail to its facing head', async (context) => {
  const cases = [
    ['pipe200', 1, 0], ['pipe400', 1, -1], ['pipe600', 0, -1],
    ['pipe800', -1, 0], ['pipe1000', -1, 1]
  ];
  for (const [type, sourceX, sourceY] of cases) {
    await context.test(type, () => {
      const store = new SqliteStore(':memory:');
      try {
        store.seedCatalog(catalog);
        const pipe = oilMachine(type, 1);
        const pilot = addOilPlayer(store, `${type} Pilot`, new Map([[catalog.byId.get(pipe.itemId), 1]]));
        const field = store.oilField(pilot.id, 1000);
        const machineHex = fieldHex(field, 0, 0);
        const source = fieldHex(field, sourceX, sourceY);
        const destination = fieldHex(field, 0, 1);
        store.deployOilMachine(pilot.id, machineHex.id, pipe.id, 0, 1000);
        store.database.prepare('UPDATE oil_hexes SET oil_units = 180000 WHERE id = ?').run(source.id);
        store.database.exec('UPDATE oil_hexes SET build_tier = 0');
        store.oilField(pilot.id, 3601000);
        assert.ok(Math.abs(oilLitersInDatabase(store, source.id) - 990) < 0.000001);
        assert.ok(Math.abs(oilLitersInDatabase(store, destination.id) - 10) < 0.000001);
      } finally {
        store.close();
      }
    });
  }
});

test('splits Double Power across empty outputs like the original wire graph', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const double = oilMachine('double');
  const pump = oilMachine('pump', 3);
  const pilot = addOilPlayer(store, 'Double Split Pilot', new Map([
    [catalog.byId.get(double.itemId), 1], [catalog.byId.get(pump.itemId), 1]
  ]));
  const field = store.oilField(pilot.id, 1000);
  const center = fieldHex(field, 0, 0);
  const north = fieldHex(field, 0, 1);
  store.deployOilMachine(pilot.id, center.id, double.id, 0, 1000);
  store.deployOilMachine(pilot.id, north.id, pump.id, 0, 1000);
  assert.equal(store.oilField(pilot.id, 1000).hexes.find((hex) => hex.id === north.id).machine.power, 4);
});

test('settles cyclic oil power graphs without recursively revisiting the cycle', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const pilot = addOilPlayer(store, 'Cyclic Power Pilot');
  const field = store.oilField(pilot.id, 1000);
  const double = oilMachine('double', 4);
  const power = oilMachine('power');
  const pump = oilMachine('pump');
  const insert = store.database.prepare(`
    INSERT INTO oil_machines
      (hex_id, player_id, machine_id, rarity, point, power, life_seconds, deployed_at)
    VALUES (?, ?, ?, ?, ?, 1, 1296000, 1000)
  `);
  const place = (x, y, machine, point) => insert.run(
    fieldHex(field, x, y).id, pilot.id, machine.id, catalog.byId.get(machine.itemId).rarity, point
  );

  // A -> B -> C -> A is a cycle. A's second Double Power output feeds the Pump.
  place(0, 0, double, 0);
  place(0, 1, power, 4);
  place(-1, 1, power, 2);
  place(1, 0, pump, 0);
  store.database.prepare('UPDATE oil_field_state SET last_settled_at = 1000 WHERE id = 1').run();

  const started = performance.now();
  const settled = store.oilField(pilot.id, 1001);
  const elapsed = performance.now() - started;
  const poweredPump = fieldHex(settled, 1, 0).machine;
  assert.equal(poweredPump.power, 5);
  assert.ok(Number.isFinite(poweredPump.power));
  assert.ok(elapsed < 5000, `cyclic power calculation took ${Math.round(elapsed)}ms`);
});

test('settles a fully drained oil hex without taking zero-length simulation steps', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const pipe = oilMachine('shortout');
  const pilot = addOilPlayer(store, 'Oil Depletion Pilot', new Map([
    [catalog.byId.get(pipe.itemId), 1]
  ]));
  const source = fieldHex(store.oilField(pilot.id, 1000), 0, 0);
  store.deployOilMachine(pilot.id, source.id, pipe.id, 0, 1000);
  store.database.prepare('UPDATE oil_hexes SET oil_units = ? WHERE id = ?')
    .run(7.257762011718746, source.id);
  store.database.prepare('UPDATE oil_field_state SET last_settled_at = 1000 WHERE id = 1').run();

  const started = performance.now();
  store.oilField(pilot.id, 61000);
  const elapsed = performance.now() - started;
  assert.equal(store.database.prepare('SELECT oil_units FROM oil_hexes WHERE id = ?').get(source.id).oil_units, 0);
  assert.ok(elapsed < 5000, `oil depletion settlement took ${Math.round(elapsed)}ms`);
});

test('preserves five-minute oil-spill cadence across frequent field views', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const viewer = addOilPlayer(store, 'Spill Clock Pilot');
  store.oilField(viewer.id, 1000);
  for (let minute = 1; minute <= 4; minute += 1) {
    store.oilField(viewer.id, 1000 + minute * 60000);
    assert.equal(store.database.prepare(
      'SELECT oil_spill_progress_ms FROM oil_field_state WHERE id = 1'
    ).get().oil_spill_progress_ms, 1000 + minute * 60000);
  }
  store.oilField(viewer.id, 300000);
  assert.equal(store.database.prepare(
    'SELECT oil_spill_progress_ms FROM oil_field_state WHERE id = 1'
  ).get().oil_spill_progress_ms, 0);
});

test('matches the original Vacuum and Horizon collection rates and radii', (context) => {
  for (const [type, expectedSources] of [['vacuum', 6], ['horizon', 18]]) {
    const store = new SqliteStore(':memory:');
    context.after(() => store.close());
    store.seedCatalog(catalog);
    const collector = oilMachine(type);
    const pilot = addOilPlayer(store, `${type} Collector`,
      new Map([[catalog.byId.get(collector.itemId), 1]]));
    const field = store.oilField(pilot.id, 1000);
    const center = fieldHex(field, 0, 0);
    store.deployOilMachine(pilot.id, center.id, collector.id, 0, 1000);
    const radius = type === 'vacuum' ? 1 : 2;
    const sources = field.hexes.filter((hex) => hex.id !== center.id
      && Math.max(Math.abs(hex.x + hex.y), Math.abs(hex.x), Math.abs(hex.y)) <= radius);
    assert.equal(sources.length, expectedSources);
    const seed = store.database.prepare('UPDATE oil_hexes SET oil_units = 18000 WHERE id = ?');
    for (const source of sources) seed.run(source.id);
    store.database.exec('UPDATE oil_hexes SET build_tier = 0');
    store.oilField(pilot.id, 3601000);
    for (const source of sources) {
      assert.ok(Math.abs(oilLitersInDatabase(store, source.id) - 70) < 0.000001,
        `${type} did not pull 30L/h from ${source.x},${source.y}`);
    }
    const centerRow = store.database.prepare(
      'SELECT oil_units, barrel_units FROM oil_hexes WHERE id = ?'
    ).get(center.id);
    assert.ok(Math.abs(centerRow.barrel_units / 180 - 60) < 0.000001);
    assert.ok(Math.abs(centerRow.oil_units / 180 - (type === 'vacuum' ? 120 : 480)) < 0.000001);
  }
});

test('makes Siphons choose the closest, fullest, unowned oil source', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const siphon = oilMachine('siphon');
  const pump = oilMachine('pump', 1);
  const pilot = addOilPlayer(store, 'Siphon Pilot', new Map([
    [catalog.byId.get(siphon.itemId), 1], [catalog.byId.get(pump.itemId), 1]
  ]));
  const field = store.oilField(pilot.id, 1000);
  const center = fieldHex(field, 0, 0);
  const ownedSource = fieldHex(field, 1, 0);
  const fullest = fieldHex(field, 1, -1);
  const other = fieldHex(field, -1, 0);
  const destination = fieldHex(field, 0, 1);
  store.deployOilMachine(pilot.id, center.id, siphon.id, 0, 1000);
  store.deployOilMachine(pilot.id, ownedSource.id, pump.id, 0, 1000);
  const seed = store.database.prepare('UPDATE oil_hexes SET oil_units = ? WHERE id = ?');
  seed.run(180000, ownedSource.id);
  seed.run(36000, fullest.id);
  seed.run(18000, other.id);
  store.database.exec('UPDATE oil_hexes SET build_tier = 0');
  store.oilField(pilot.id, 3601000);
  assert.ok(Math.abs(oilLitersInDatabase(store, ownedSource.id) - 1010) < 0.000001);
  assert.ok(Math.abs(oilLitersInDatabase(store, fullest.id) - 140) < 0.000001);
  assert.ok(Math.abs(oilLitersInDatabase(store, other.id) - 100) < 0.000001);
  assert.ok(Math.abs(oilLitersInDatabase(store, destination.id) - 60) < 0.000001);
});

test('shares a limited oil source proportionally between pipes', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const pump = oilMachine('pump', 1);
  const shortIn = oilMachine('shortin');
  const pilot = addOilPlayer(store, 'Sharing Pilot', new Map([
    [catalog.byId.get(pump.itemId), 1], [catalog.byId.get(shortIn.itemId), 2]
  ]));
  const field = store.oilField(pilot.id, 1000);
  const source = fieldHex(field, 0, 0);
  const north = fieldHex(field, 0, 1);
  const south = fieldHex(field, 0, -1);
  store.deployOilMachine(pilot.id, source.id, pump.id, 0, 1000);
  store.deployOilMachine(pilot.id, north.id, shortIn.id, 3, 1000);
  store.deployOilMachine(pilot.id, south.id, shortIn.id, 0, 1000);
  store.database.prepare('UPDATE oil_hexes SET oil_units = 0');
  store.database.exec('UPDATE oil_hexes SET build_tier = 0');
  store.oilField(pilot.id, 3601000);
  assert.ok(Math.abs(oilLitersInDatabase(store, north.id) - 5) < 0.001);
  assert.ok(Math.abs(oilLitersInDatabase(store, south.id) - 5) < 0.001);
});

test('runs queued machines for all elapsed time after the replaced machine expires', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const pump = oilMachine('pump', 1);
  const pad = oilMachine('pad', 1);
  const pilot = addOilPlayer(store, 'Queue Timing Pilot', new Map([
    [catalog.byId.get(pump.itemId), 1], [catalog.byId.get(pad.itemId), 1]
  ]));
  const center = fieldHex(store.oilField(pilot.id, 1000), 0, 0);
  store.deployOilMachine(pilot.id, center.id, pump.id, 0, 1000);
  store.queueOilMachine(pilot.id, center.id, pad.id, 0, 1000);
  store.database.exec('UPDATE oil_hexes SET build_tier = 0');
  const oneHourAfterExpiry = 1000 + (12 * 1.2 + 1) * 60 * 60 * 1000;
  const field = store.oilField(pilot.id, oneHourAfterExpiry);
  assert.equal(field.hexes.find((hex) => hex.id === center.id).machine.type, 'pad');
  const packed = store.database.prepare('SELECT barrel_units FROM oil_hexes WHERE id = ?').get(center.id);
  assert.ok(Math.abs(packed.barrel_units / 180 - 20) < 0.000001);
});

test('uses Flak coverage for build tiers and validates queued outer-row access', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const pump = oilMachine('pump', 1);
  const pad = oilMachine('pad', 1);
  const flak = oilMachine('flak');
  const helicopter = catalog.items.find((item) => item.name === 'Helicopter');
  const pilot = addOilPlayer(store, 'Flak Builder', new Map([
    [catalog.byId.get(pump.itemId), 2], [catalog.byId.get(pad.itemId), 1],
    [catalog.byId.get(flak.itemId), 1], [helicopter, 1]
  ]));
  let field = store.oilField(pilot.id, 1000);
  const center = fieldHex(field, 0, 0);
  store.deployOilMachine(pilot.id, center.id, pump.id, 0, 1000);
  field = store.oilField(pilot.id, 1000);
  const outerMachine = fieldHex(field, 2, 0);
  store.deployOilMachine(pilot.id, outerMachine.id, pump.id, 0, 1000);
  store.deployOilMachine(pilot.id, center.id, flak.id, 0, 1000);
  field = store.oilField(pilot.id, 1000);
  assert.equal(fieldHex(field, 1, 0).available, 1);
  assert.equal(fieldHex(field, 1, 1).available, 1);
  assert.equal(fieldHex(field, 3, 0).available, 2);
  store.database.prepare(
    'DELETE FROM inventory WHERE player_id = ? AND city_id = 2 AND item_id = ?'
  ).run(pilot.id, helicopter.id);
  store.database.prepare('UPDATE oil_hexes SET build_tier = 0 WHERE id = ?').run(outerMachine.id);
  assert.throws(() => store.queueOilMachine(pilot.id, outerMachine.id, pad.id, 0, 1000),
    /outside the available build radius/);
  store.database.prepare('UPDATE oil_hexes SET build_tier = 2 WHERE id = ?').run(outerMachine.id);
  assert.throws(() => store.queueOilMachine(pilot.id, outerMachine.id, pad.id, 0, 1000),
    /Helicopter is required/);
});

test('keeps Oil Field actions city-local while allowing another city to be selected', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const pump = oilMachine('pump', 1);
  const pad = oilMachine('pad', 1);
  const owner = addOilPlayer(store, 'Remote Pilot', new Map([
    [catalog.byId.get(pump.itemId), 1], [catalog.byId.get(pad.itemId), 2]
  ]), { cityId: 1 });
  const rival = addOilPlayer(store, 'Rival Pilot',
    new Map([[catalog.byId.get(pump.itemId), 1]]), { cityId: 1 });
  const center = fieldHex(store.oilField(owner.id, 1000), 0, 0);
  store.deployOilMachine(owner.id, center.id, pump.id, 0, 1000);
  assert.doesNotThrow(() => store.deployOilMachine(owner.id, center.id, pad.id, 0, 1000));
  assert.throws(() => store.deployOilMachine(rival.id, center.id, pump.id, 0, 1000), /field is taken/i);

  store.database.prepare('UPDATE oil_hexes SET oil_units = 18000, barrels = 1 WHERE id = ?').run(center.id);
  assert.equal(store.oilField(owner.id, 1000).stats, null);
  store.claimOilBarrel(owner.id, center.id, 1000);
  const oilItem = catalog.items.find((item) => item.name === 'Oil');
  assert.equal(store.database.prepare(
    'SELECT quantity FROM inventory WHERE player_id = ? AND city_id = 2 AND item_id = ?'
  ).get(owner.id, oilItem.id).quantity, 1);
  assert.equal(store.database.prepare(
    'SELECT COUNT(*) AS count FROM oil_uses WHERE player_id = ? AND extracted = 1'
  ).get(owner.id).count, 1);
  assert.ok(store.stonesForPlayer(owner.id).earned.some((stone) => stone.name === 'Barreled'));

  store.database.prepare('UPDATE players SET profession = 0 WHERE id = ?').run(owner.id);
  store.database.prepare('UPDATE oil_hexes SET barrels = 1 WHERE id = ?').run(center.id);
  assert.doesNotThrow(() => store.claimOilBarrel(owner.id, center.id, 1000));
  store.database.prepare('UPDATE players SET profession = 10 WHERE id = ?').run(owner.id);
  const ledger = catalog.gadgets.find((gadget) => gadget.name === 'ledger');
  store.database.prepare(
    'INSERT INTO player_gadgets (player_id, gadget_id, expires_at) VALUES (?, ?, ?)'
  ).run(owner.id, ledger.id, 100000);
  const report = store.oilField(owner.id, 1000).stats.find((entry) => entry.playerId === owner.id);
  assert.deepEqual({ machines: report.machines, oil: report.oilLiters, pumping: report.pumpingLitersPerHour,
    packing: report.packingLitersPerHour, barrels: report.barrels },
  { machines: 1, oil: 100, pumping: 0, packing: 20, barrels: 0 });
});

test('keeps each regional Oil Field independent and blocks remote operation', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  store.ensureWorldMaps(1000);
  const live = store.loadCatalog();
  const pump = oilMachine('pump', 1);
  const pumpItem = live.byId.get(pump.itemId);
  const addRegionalPilot = (name, mapName) => {
    const map = live.maps.find((candidate) => candidate.name === mapName);
    const player = createPlayer(name, '', 'hash', live, 1000, () => 0.5);
    player.cityId = map.capitalCityId;
    player.homeCityId = map.capitalCityId;
    player.inventoryByCity[map.capitalCityId] = { [pumpItem.id]: 1 };
    player.inventory = player.inventoryByCity[map.capitalCityId];
    return store.addPlayer(player);
  };
  const asoPilot = addRegionalPilot('Aso Oil Pilot', 'Aso');
  const calbucoPilot = addRegionalPilot('Calbuco Oil Pilot', 'Calbuco');
  const bromoPilot = addRegionalPilot('Bromo Oil Pilot', 'Bromo');
  const asoCenter = fieldHex(store.oilField(asoPilot.id, 1000), 0, 0);
  const calbucoCenter = fieldHex(store.oilField(calbucoPilot.id, 1000), 0, 0);

  assert.notEqual(asoCenter.id, calbucoCenter.id);
  store.deployOilMachine(asoPilot.id, asoCenter.id, pump.id, 0, 1000);
  store.deployOilMachine(calbucoPilot.id, calbucoCenter.id, pump.id, 0, 1000);
  assert.equal(fieldHex(store.oilField(asoPilot.id, 1000), 0, 0).machine.ownerName,
    'Aso Oil Pilot');
  assert.equal(fieldHex(store.oilField(calbucoPilot.id, 1000), 0, 0).machine.ownerName,
    'Calbuco Oil Pilot');
  assert.throws(() => store.deployOilMachine(asoPilot.id, calbucoCenter.id, pump.id, 0, 1000),
    /current region/);
  assert.deepEqual({
    available: store.oilField(bromoPilot.id, 1000).available,
    hexes: store.oilField(bromoPilot.id, 1000).hexes.length
  }, { available: false, hexes: 0 });
});

test('repairs missing legacy ship state before loading ammunition', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-ship-state-'));
  const databaseFile = path.join(directory, 'game.sqlite');
  let store = new SqliteStore(databaseFile);
  context.after(() => {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  store.seedCatalog(catalog);
  const shipDefinition = catalog.ships.find((ship) => ship.cannonPortals > 0);
  const shipType = catalog.vehicles.find((vehicle) => vehicle.id === shipDefinition.vehicleId);
  const allowed = catalog.settings.arms_rarities_by_vehicle_rarity[
    catalog.byId.get(shipType.itemId).rarity
  ];
  const cannon = catalog.cannons.find((entry) =>
    allowed.includes(catalog.byId.get(entry.itemId).rarity));
  const ammunition = catalog.cannonballs[0];
  const player = store.addPlayer(createPlayer(
    'Legacy Ship Gunner', '', 'hash', catalog, 1000, () => 0.5
  ));
  player.inventory[shipType.itemId] = 1;
  player.inventory[cannon.itemId] = 1;
  player.inventory[ammunition.itemId] = 2;
  store.savePlayer(player);
  const vehicleId = store.activateVehicle(player.id, shipType.itemId);
  store.database.prepare('DELETE FROM player_ship_state WHERE vehicle_id = ?').run(vehicleId);
  store.database.exec('PRAGMA user_version = 71');
  store.close();

  store = new SqliteStore(databaseFile);
  assert.equal(store.database.prepare('PRAGMA user_version').get().user_version, 112);
  assert.ok(store.vehicleDetails(player.id, vehicleId, 2000).ship);
  store.attachShipCannon(player.id, vehicleId, cannon.id);
  assert.equal(store.loadShipAmmo(player.id, vehicleId, ammunition.type, 2),
    Number(catalog.settings.shots_per_crate) * 2);
  assert.equal(store.playerById(player.id).inventory[ammunition.itemId], undefined);
});

test('loads and unloads ammunition through live database type mappings', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const shipDefinition = catalog.ships.find((ship) => ship.cannonPortals > 0);
  const shipType = catalog.vehicles.find((vehicle) => vehicle.id === shipDefinition?.vehicleId);
  const cannon = catalog.cannons.find((entry) => catalog.byId.get(entry.itemId).rarity === 1);
  const ammunition = catalog.cannonballByType.get(1);
  assert.ok(shipType && cannon && ammunition);
  const player = store.addPlayer(createPlayer('Mapped Gunner', '', 'hash', catalog, 1000, () => 0.5));
  player.inventory[shipType.itemId] = 1;
  player.inventory[cannon.itemId] = 1;
  player.inventory[ammunition.itemId] = 1;
  store.savePlayer(player);
  const vehicleId = store.activateVehicle(player.id, shipType.itemId);
  store.attachShipCannon(player.id, vehicleId, cannon.id);

  const rules = structuredClone(catalog.settings.ammunition_rules);
  [rules[1].field, rules[2].field] = [rules[2].field, rules[1].field];
  [rules[1].storageField, rules[2].storageField]
    = [rules[2].storageField, rules[1].storageField];
  store.database.prepare(`
    UPDATE catalog_settings SET value_json = ? WHERE key = 'ammunition_rules'
  `).run(JSON.stringify(rules));

  assert.equal(store.loadShipAmmo(player.id, vehicleId, 1),
    Number(catalog.settings.shots_per_crate));
  const state = store.database.prepare(
    'SELECT massives, chain_shots FROM player_ship_state WHERE vehicle_id = ?'
  ).get(vehicleId);
  assert.equal(state.massives, 0);
  assert.equal(state.chain_shots, Number(catalog.settings.shots_per_crate));
  assert.equal(store.vehicleDetails(player.id, vehicleId, 2000).ship.chain_shots,
    Number(catalog.settings.shots_per_crate));
  assert.equal(store.unloadShipAmmo(player.id, vehicleId)[1], 1);
  assert.equal(store.playerById(player.id).inventory[ammunition.itemId], 1);
});

test('reuses the first free cannon portal after a fitted cannon is pillaged', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const shipDefinition = catalog.ships.find((ship) => ship.cannonPortals >= 3);
  const shipType = catalog.vehicles.find((vehicle) => vehicle.id === shipDefinition?.vehicleId);
  const allowed = catalog.settings.arms_rarities_by_vehicle_rarity[
    catalog.byId.get(shipType.itemId).rarity
  ];
  const cannon = catalog.cannons.find((entry) =>
    allowed.includes(catalog.byId.get(entry.itemId).rarity));
  assert.ok(shipType && cannon);
  const player = store.addPlayer(createPlayer('Portal Repairer', '', 'hash', catalog, 1000, () => 0.5));
  player.inventory[shipType.itemId] = 1;
  player.inventory[cannon.itemId] = 4;
  store.savePlayer(player);
  const vehicleId = store.activateVehicle(player.id, shipType.itemId);
  assert.deepEqual([
    store.attachShipCannon(player.id, vehicleId, cannon.id),
    store.attachShipCannon(player.id, vehicleId, cannon.id),
    store.attachShipCannon(player.id, vehicleId, cannon.id)
  ], [1, 2, 3]);
  store.database.prepare(
    'DELETE FROM player_ship_cannons WHERE vehicle_id = ? AND portal = 2'
  ).run(vehicleId);
  assert.equal(store.attachShipCannon(player.id, vehicleId, cannon.id), 2);
  assert.deepEqual(store.vehicleDetails(player.id, vehicleId, 2000).cannons
    .map((entry) => entry.portal).sort(), [1, 2, 3]);
});

test('accounts for cannon, ammunition, and tackle across the ship fitting lifecycle', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const shipDefinition = catalog.ships.find((ship) => ship.cannonPortals > 0);
  const shipType = catalog.vehicles.find((vehicle) => vehicle.id === shipDefinition?.vehicleId);
  const allowed = catalog.settings.arms_rarities_by_vehicle_rarity[
    catalog.byId.get(shipType.itemId).rarity
  ];
  const cannon = catalog.cannons.find((entry) =>
    allowed.includes(catalog.byId.get(entry.itemId).rarity));
  const ammunition = catalog.cannonballs[0];
  const tackleItemId = Number(catalog.settings.block_and_tackle_item_id);
  assert.ok(shipType && cannon && ammunition && tackleItemId);
  const player = store.addPlayer(createPlayer('Ship Rigger', '', 'hash', catalog, 1000, () => 0.5));
  player.inventory[shipType.itemId] = 1;
  player.inventory[cannon.itemId] = 1;
  player.inventory[ammunition.itemId] = 1;
  store.savePlayer(player);
  const vehicleId = store.activateVehicle(player.id, shipType.itemId);
  store.attachShipCannon(player.id, vehicleId, cannon.id);
  store.loadShipAmmo(player.id, vehicleId, ammunition.type);
  assert.throws(() => store.detachShipCannons(player.id, vehicleId), /Block and Tackle/);
  assert.equal(store.vehicleDetails(player.id, vehicleId, 2000).cannons.length, 1);

  const supplied = store.playerById(player.id);
  supplied.inventory[tackleItemId] = 1;
  store.savePlayer(supplied);
  const ammoRule = catalog.settings.ammunition_rules[ammunition.type];
  store.database.prepare(`UPDATE player_ship_state SET ${ammoRule.storageField} = ? WHERE vehicle_id = ?`)
    .run(Number(catalog.settings.shots_per_crate) - 1, vehicleId);
  assert.throws(() => store.detachShipCannons(player.id, vehicleId),
    /Unload all ammunition/);
  assert.equal(store.vehicleDetails(player.id, vehicleId, 2000).cannons.length, 1);
  assert.equal(store.vehicleDetails(player.id, vehicleId, 2000).ship[ammoRule.storageField],
    Number(catalog.settings.shots_per_crate) - 1);
  assert.equal(store.playerById(player.id).inventory[tackleItemId], 1);
  store.unloadShipAmmo(player.id, vehicleId);
  assert.equal(store.detachShipCannons(player.id, vehicleId), 1);
  const restored = store.playerById(player.id);
  assert.equal(restored.inventory[cannon.itemId], 1);
  assert.equal(restored.inventory[ammunition.itemId], undefined);
  assert.equal(restored.inventory[tackleItemId], undefined);
  assert.equal(store.vehicleDetails(player.id, vehicleId, 2000).cannons.length, 0);
  assert.equal(store.vehicleDetails(player.id, vehicleId, 2000).ship[ammoRule.storageField], 0);
});

test('ship encounters consume loaded ammunition and produce battle reports', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const shipType = catalog.vehicles.find((vehicle) => catalog.byId.get(vehicle.itemId).name === 'Outrigger');
  const cannon = catalog.cannons.find((entry) => catalog.byId.get(entry.itemId).rarity === 1);
  const ammunition = catalog.cannonballByType.get(1);
  assert.ok(shipType && cannon && ammunition);
  const trader = store.addPlayer(createPlayer('Sea Trader', '', 'hash', catalog, 1000, () => 0.5));
  const pirate = store.addPlayer(createPlayer('Sea Pirate', '', 'hash', catalog, 1000, () => 0.5));
  trader.profession = 0;
  pirate.profession = 5;
  for (const player of [trader, pirate]) {
    player.inventory[shipType.itemId] = 1;
    player.inventory[cannon.itemId] = 1;
    player.inventory[ammunition.itemId] = 1;
    store.savePlayer(player);
  }
  const traderShip = store.activateVehicle(trader.id, shipType.itemId);
  const pirateShip = store.activateVehicle(pirate.id, shipType.itemId);
  for (const [player, ship] of [[trader, traderShip], [pirate, pirateShip]]) {
    store.attachShipCannon(player.id, ship, cannon.id);
    assert.equal(store.loadShipAmmo(player.id, ship, 1), 12);
  }
  const route = store.routesForVehicle(trader.id, traderShip, 2000)[0];
  store.sendVehicle(trader.id, traderShip, route.id, 2000);
  const encounter = store.sendVehicle(pirate.id, pirateShip, route.id, 2000, {
    aggressiveMask: 1 << catalog.byId.get(shipType.itemId).rarity
  });
  encounter.battleId = resolveNextVehicleEncounter(store).battle_id;
  const report = store.battleReport(pirate.id, encounter.battleId);
  assert.equal(report.details.type, 'ship');
  assert.ok(report.details.result.shots.flat().length > 0);
  const combatMessage = store.recentMessages(pirate.id, 'all', 'Vehicle')
    .find((message) => message.details.event === 'vehicle-combat'
      && message.details.battleId === encounter.battleId);
  assert.ok(combatMessage);
  assert.equal(combatMessage.details.side,
    report.details.vehicleIds.indexOf(pirateShip));
  assert.deepEqual(combatMessage.details.result.portalRounds,
    report.details.result.portalRounds);
  assert.deepEqual(combatMessage.details.result.boardingRounds,
    report.details.result.boardingRounds);
  assert.ok(combatMessage.details.actions.some((action) =>
    action.path === `/battles/${encounter.battleId}`));
  for (const [index, account] of [[0, trader], [1, pirate]]) {
    if (report.details.result.shots[index].length) {
      assert.ok(store.stonesForPlayer(account.id).earned.some((stone) => stone.name === 'Fired'));
    }
  }
  const remaining = [
    store.vehicleDetails(trader.id, traderShip, 2001).ship.massives,
    store.vehicleDetails(pirate.id, pirateShip, 2001).ship.massives
  ];
  assert.ok(remaining.some((shots) => shots < 12));
});

test('counts cannon crew losses in live ship-battle summaries', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  store.database.prepare(
    "UPDATE catalog_settings SET value_json = '0' WHERE key = 'ghost_rise_chance'"
  ).run();
  const ammunitionRules = structuredClone(catalog.settings.ammunition_rules);
  ammunitionRules[3].accuracy = 1;
  store.database.prepare(
    "UPDATE catalog_settings SET value_json = ? WHERE key = 'ammunition_rules'"
  ).run(JSON.stringify(ammunitionRules));
  const shipType = catalog.vehicles.find((vehicle) =>
    catalog.byId.get(vehicle.itemId)?.name === 'Outrigger');
  const cannon = catalog.cannons.find((entry) =>
    catalog.byId.get(entry.itemId)?.rarity === 1 && entry.damage >= 1);
  const grapeShot = catalog.cannonballByType.get(3);
  assert.ok(shipType && cannon && grapeShot);
  const defender = store.addPlayer(createPlayer(
    'Grape Target', '', 'hash', catalog, 1000, () => 0.5
  ));
  const attacker = store.addPlayer(createPlayer(
    'Grape Gunner', '', 'hash', catalog, 1000, () => 0.5
  ));
  defender.inventory[shipType.itemId] = 1;
  attacker.inventory[shipType.itemId] = 1;
  attacker.inventory[cannon.itemId] = 1;
  attacker.inventory[grapeShot.itemId] = 1;
  store.savePlayer(defender);
  store.savePlayer(attacker);
  const defenderShip = store.activateVehicle(defender.id, shipType.itemId, 1000);
  const attackerShip = store.activateVehicle(attacker.id, shipType.itemId, 1000);
  store.attachShipCannon(attacker.id, attackerShip, cannon.id);
  store.loadShipAmmo(attacker.id, attackerShip, 3);
  const route = store.routesForVehicle(defender.id, defenderShip, 2000)[0];
  store.sendVehicle(defender.id, defenderShip, route.id, 2000);
  store.sendVehicle(attacker.id, attackerShip, route.id, 2000, {
    aggressiveMask: 1 << catalog.byId.get(shipType.itemId).rarity
  });
  store.database.prepare(
    'UPDATE player_ship_state SET crew = 1 WHERE vehicle_id = ?'
  ).run(defenderShip);
  const updateCursor = store.latestLiveUpdateId();
  const encounter = resolveNextVehicleEncounter(store);
  const report = store.battleReport(defender.id, encounter.battle_id);
  const defenderSide = report.details.vehicleIds.indexOf(defenderShip);
  assert.equal(report.details.result.starting[defenderSide].crew, 1);
  assert.equal(report.details.result.ships[defenderSide].crew, 0);
  assert.equal(report.details.result.casualties[defenderSide].length, 0,
    'cannon casualties are separate from boarding casualty records');
  const battleUpdate = store.liveUpdatesAfter(updateCursor).find((event) =>
    event.scope === `player:${defender.id}` && event.eventType === 'battle-complete'
      && event.payload.battleId === encounter.battle_id);
  assert.ok(battleUpdate);
  assert.equal(battleUpdate.payload.summary.crewLost, 1);
});

test('cannon fire can mutually sink ships and immediately salvage every fitted cannon', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  store.database.prepare(
    "UPDATE catalog_settings SET value_json = '0' WHERE key = 'ghost_rise_chance'"
  ).run();
  const ammunitionRules = structuredClone(catalog.settings.ammunition_rules);
  ammunitionRules[1].accuracy = 1;
  store.database.prepare(`
    UPDATE catalog_settings SET value_json = ? WHERE key = 'ammunition_rules'
  `).run(JSON.stringify(ammunitionRules));
  const shipType = catalog.vehicles.find((vehicle) => vehicle.routeType === 1
    && catalog.byId.get(vehicle.itemId)?.name === 'Outrigger'
    && catalog.routes.some((route) => route.open && route.type === 1
      && route.city1Id !== route.city2Id && [route.city1Id, route.city2Id].includes(1)));
  const cannon = catalog.cannons.find((entry) =>
    catalog.byId.get(entry.itemId)?.rarity === 1 && entry.damage >= 1);
  const ammunition = catalog.cannonballByType.get(1);
  assert.ok(shipType && cannon && ammunition);
  const first = store.addPlayer(createPlayer('Mutual Broadside One', '', 'hash', catalog, 1000, () => 0.5));
  const second = store.addPlayer(createPlayer('Mutual Broadside Two', '', 'hash', catalog, 1000, () => 0.5));
  for (const player of [first, second]) {
    player.inventory[shipType.itemId] = 1;
    player.inventory[cannon.itemId] = 1;
    player.inventory[ammunition.itemId] = 1;
    store.savePlayer(player);
  }
  const firstShip = store.activateVehicle(first.id, shipType.itemId, 1000);
  const secondShip = store.activateVehicle(second.id, shipType.itemId, 1000);
  for (const [player, vehicleId] of [[first, firstShip], [second, secondShip]]) {
    store.attachShipCannon(player.id, vehicleId, cannon.id);
    store.loadShipAmmo(player.id, vehicleId, 1);
  }
  const route = store.routesForVehicle(first.id, firstShip, 2000)[0];
  store.sendVehicle(first.id, firstShip, route.id, 2000);
  store.sendVehicle(second.id, secondShip, route.id, 2000, {
    aggressiveMask: 1 << catalog.byId.get(shipType.itemId).rarity
  });
  store.database.prepare(
    'UPDATE player_ship_state SET hull = 1 WHERE vehicle_id IN (?, ?)'
  ).run(firstShip, secondShip);
  const encounter = resolveNextVehicleEncounter(store);
  const report = store.battleReport(first.id, encounter.battle_id);
  assert.equal(report.tied, true);
  assert.deepEqual(report.details.result.ships.map((ship) => ship.hull), [0, 0]);
  assert.equal(report.details.result.portalRounds[0].after[0].hull, 0);
  assert.equal(store.database.prepare(
    'SELECT COUNT(*) AS count FROM player_vehicles WHERE id IN (?, ?)'
  ).get(firstShip, secondShip).count, 0, 'sunk ships are removed during battle settlement');
  for (const [player, vehicleId] of [[first, firstShip], [second, secondShip]]) {
    assert.equal(store.database.prepare(`
      SELECT COUNT(*) AS count FROM sunken_items
      WHERE source_vehicle_id = ? AND item_id = ? AND location = ?
    `).get(vehicleId, cannon.itemId, report.details.encounterLocation).count, 1);
    assert.ok(store.stonesForPlayer(player.id).earned.some((stone) => stone.name === 'Sunk'));
    assert.ok(store.database.prepare(`
      SELECT 1 FROM vehicle_events WHERE vehicle_id = ? AND event_type = 'was-sunk'
    `).get(vehicleId));
  }
  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count FROM vehicle_encounters
    WHERE status = 'planned' AND (vehicle1_id IN (?, ?) OR vehicle2_id IN (?, ?))
  `).get(firstShip, secondShip, firstShip, secondShip).count, 0);
});

test('repairs one hull per port hour without restoring full hull on departure', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const shipType = catalog.vehicles.find((vehicle) => vehicle.routeType === 1
    && catalog.routes.some((route) => route.open && route.type === 1
      && route.city1Id !== route.city2Id && [route.city1Id, route.city2Id].includes(1)));
  assert.ok(shipType);
  const player = store.addPlayer(createPlayer('Patient Shipwright', '', 'hash', catalog, 1000, () => 0.5));
  player.inventory[shipType.itemId] = 1;
  store.savePlayer(player);
  const dockedAt = 1000;
  const vehicleId = store.activateVehicle(player.id, shipType.itemId, dockedAt);
  store.database.prepare(`
    UPDATE player_ship_state SET hull = ?, max_hull = ?, crew = 1, docked_at = ?
    WHERE vehicle_id = ?
  `).run(shipType.ship.hull - 10, shipType.ship.hull, dockedAt, vehicleId);
  const threeHours = dockedAt + 3 * 60 * 60 * 1000;
  const repaired = store.vehicleDetails(player.id, vehicleId, threeHours);
  assert.equal(repaired.ship.hull, shipType.ship.hull - 7);
  assert.equal(repaired.ship.crew, shipType.ship.crew, 'crew recruits fully in port');
  const route = store.routesForVehicle(player.id, vehicleId, threeHours)[0];
  store.sendVehicle(player.id, vehicleId, route.id, threeHours);
  const departed = store.database.prepare(
    'SELECT hull, max_hull, crew, docked_at FROM player_ship_state WHERE vehicle_id = ?'
  ).get(vehicleId);
  assert.equal(departed.hull, shipType.ship.hull - 7,
    'departure preserves unrepaired hull damage');
  assert.equal(departed.max_hull, shipType.ship.hull);
  assert.equal(departed.crew, shipType.ship.crew);
  assert.equal(departed.docked_at, null);
});

test('persists repaired sail damage, delays arrival, and records chain escape as a defensive win', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  store.database.prepare(
    "UPDATE catalog_settings SET value_json = '0' WHERE key = 'ghost_rise_chance'"
  ).run();
  const ammunitionRules = structuredClone(catalog.settings.ammunition_rules);
  ammunitionRules[2].accuracy = 1;
  store.database.prepare(
    "UPDATE catalog_settings SET value_json = ? WHERE key = 'ammunition_rules'"
  ).run(JSON.stringify(ammunitionRules));
  const shipType = catalog.vehicles.find((vehicle) => vehicle.routeType === 1
    && catalog.byId.get(vehicle.itemId)?.name === 'Outrigger'
    && catalog.routes.some((route) => route.open && route.type === 1
      && route.city1Id !== route.city2Id && [route.city1Id, route.city2Id].includes(1)));
  const cannon = catalog.cannons.find((entry) =>
    catalog.byId.get(entry.itemId)?.rarity === 1 && entry.damage >= 1);
  const chainShot = catalog.cannonballByType.get(2);
  assert.ok(shipType && cannon && chainShot);
  const pirate = store.addPlayer(createPlayer('Chain Pursuer', '', 'hash', catalog, 1000, () => 0.5));
  const defender = store.addPlayer(createPlayer('Chain Defender', '', 'hash', catalog, 1000, () => 0.5));
  pirate.inventory[shipType.itemId] = 1;
  defender.inventory[shipType.itemId] = 1;
  defender.inventory[cannon.itemId] = 1;
  defender.inventory[chainShot.itemId] = 1;
  store.savePlayer(pirate);
  store.savePlayer(defender);
  const pirateShip = store.activateVehicle(pirate.id, shipType.itemId, 1000);
  const defenderShip = store.activateVehicle(defender.id, shipType.itemId, 1000);
  store.attachShipCannon(defender.id, defenderShip, cannon.id);
  store.loadShipAmmo(defender.id, defenderShip, 2);
  const route = store.routesForVehicle(pirate.id, pirateShip, 2000)[0];
  const original = store.sendVehicle(pirate.id, pirateShip, route.id, 2000, {
    aggressiveMask: 1 << catalog.byId.get(shipType.itemId).rarity
  });
  store.sendVehicle(defender.id, defenderShip, route.id, 2000);
  const defenderHull = store.database.prepare(
    'SELECT hull FROM player_ship_state WHERE vehicle_id = ?'
  ).get(defenderShip).hull;
  store.database.prepare(
    'UPDATE player_ship_state SET max_hull = ? WHERE vehicle_id = ?'
  ).run(defenderHull - 5, defenderShip);
  const updateCursor = store.latestLiveUpdateId();
  const encounter = resolveNextVehicleEncounter(store);
  const report = store.battleReport(pirate.id, encounter.battle_id);
  assert.equal(report.details.result.chainEscape, true);
  assert.equal(report.tied, false);
  assert.equal(report.won, false);
  assert.ok(report.ratingAfter < report.ratingBefore);
  const defenderReport = store.battleReport(defender.id, encounter.battle_id);
  assert.equal(defenderReport.tied, false);
  assert.equal(defenderReport.won, true);
  assert.ok(defenderReport.ratingAfter > defenderReport.ratingBefore);
  const defenderSide = report.details.vehicleIds.indexOf(defenderShip);
  assert.ok(report.details.result.repairs.every((repair) => repair.hull >= 0));
  assert.ok(store.database.prepare(
    'SELECT max_hull FROM player_ship_state WHERE vehicle_id = ?'
  ).get(defenderShip).max_hull >= report.details.result.starting[defenderSide].hull);
  const pirateSide = report.details.vehicleIds.indexOf(pirateShip);
  const persisted = store.database.prepare(
    'SELECT speed, arrives_at FROM player_vehicles WHERE id = ?'
  ).get(pirateShip);
  assert.ok(persisted.speed < shipType.speed && persisted.speed > report.details.result.ships[pirateSide].speed,
    'the voyage keeps the 20% unrepaired sail damage');
  assert.ok(persisted.arrives_at > original.arrivesAt, 'combat and slower sails delay arrival');
  assert.equal(store.database.prepare(`
    SELECT event_type FROM vehicle_events WHERE vehicle_id = ? AND battle_id = ?
  `).get(pirateShip, encounter.battle_id).event_type, 'lost');
  assert.equal(store.database.prepare(`
    SELECT event_type FROM vehicle_events WHERE vehicle_id = ? AND battle_id = ?
  `).get(defenderShip, encounter.battle_id).event_type, 'won');
  const battleUpdates = store.liveUpdatesAfter(updateCursor).filter((event) =>
    event.eventType === 'battle-complete' && event.payload.battleId === encounter.battle_id);
  const updatesByScope = new Map(battleUpdates.map((event) => [event.scope, event.payload]));
  assert.equal(updatesByScope.get(`player:${pirate.id}`).outcome, 'lost');
  assert.equal(updatesByScope.get(`player:${defender.id}`).outcome, 'won');
  for (const payload of updatesByScope.values()) {
    assert.equal(payload.summary.chainEscape, true);
    assert.equal(payload.reportPath, `/battles/${encounter.battle_id}`);
  }
});

test('sinks ship cargo into the route and lets a Fisherman salvage it with bait', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const shipType = catalog.vehicles.find((vehicle) => vehicle.routeType === 1
    && catalog.byId.get(vehicle.itemId)?.rarity === 1
    && catalog.routes.some((route) => route.open && route.type === 1
      && route.city1Id !== route.city2Id && (route.city1Id === 1 || route.city2Id === 1)));
  const bait = catalog.items.find((item) => item.mineTypeId === 14 && item.rarity === 1);
  const treasure = catalog.items.find((item) => item.rarity === 1 && item.mineTypeId !== 14
    && item.mineTypeId !== 15 && !catalog.vehicleByItemId.has(item.id)
    && !catalog.boxByItemId.has(item.id));
  assert.ok(shipType && bait && treasure);
  const trader = store.addPlayer(createPlayer('Sunken Merchant', '', 'hash', catalog, 1000, () => 0.5));
  const pirate = store.addPlayer(createPlayer('Sinking Pirate', '', 'hash', catalog, 1000, () => 0.5));
  const fisher = store.addPlayer(createPlayer('Treasure Fisher', '', 'hash', catalog, 1000, () => 0.5));
  trader.profession = 4;
  pirate.profession = 5;
  fisher.profession = 7;
  trader.inventory[shipType.itemId] = 1;
  trader.inventory[treasure.id] = 1;
  pirate.inventory[shipType.itemId] = 1;
  fisher.inventory[shipType.itemId] = 1;
  fisher.inventory[bait.id] = 1;
  for (const player of [trader, pirate, fisher]) store.savePlayer(player);
  const traderShip = store.activateVehicle(trader.id, shipType.itemId);
  const pirateShip = store.activateVehicle(pirate.id, shipType.itemId);
  const fisherShip = store.activateVehicle(fisher.id, shipType.itemId);
  store.database.prepare('UPDATE player_vehicles SET oiled_trips = 1 WHERE id = ?').run(pirateShip);
  store.setVehicleCargo(trader.id, traderShip, { [treasure.id]: 1 });
  store.setVehicleCargo(fisher.id, fisherShip, { [bait.id]: 1 });
  const route = store.routesForVehicle(trader.id, traderShip, 2000)[0];
  const traderTrip = store.sendVehicle(trader.id, traderShip, route.id, 2000);
  store.database.prepare('UPDATE player_ship_state SET hull = 0 WHERE vehicle_id = ?').run(traderShip);
  const pirateTrip = store.sendVehicle(pirate.id, pirateShip, route.id, 2000, {
    aggressiveMask: 1 << catalog.byId.get(shipType.itemId).rarity
  });
  pirateTrip.battleId = resolveNextVehicleEncounter(store).battle_id;
  const sunkReport = store.recentMessages(trader.id, 'all', 'Vehicle')
    .find((message) => message.details.event === 'sunk');
  assert.ok(sunkReport);
  assert.equal(sunkReport.details.vehicleId, traderShip);
  assert.equal(sunkReport.details.battleId, pirateTrip.battleId);
  assert.match(sunkReport.details.routeName, /\u2013/);
  assert.equal(sunkReport.details.wreckLocation,
    store.battleReport(pirate.id, pirateTrip.battleId).details.encounterLocation);
  assert.equal(sunkReport.details.lostCannons, 0);
  assert.equal(sunkReport.details.lostCargo, 1);
  assert.equal(sunkReport.details.totalLost, 1);
  assert.match(sunkReport.body, /0 cannons and 1 cargo item were lost/);
  assert.equal(sunkReport.actionLinks.some((action) =>
    action.href === `/vehicles/${traderShip}`), false);
  assert.ok(sunkReport.actionLinks.some((action) =>
    action.href === `/battles/${pirateTrip.battleId}`));
  assert.equal(store.database.prepare(
    'SELECT COUNT(*) AS count FROM sunken_items WHERE route_id = ? AND item_id = ?'
  ).get(route.id, treasure.id).count, 1);
  const wreck = store.database.prepare(
    'SELECT location FROM sunken_items WHERE route_id = ? AND item_id = ?'
  ).get(route.id, treasure.id);
  const combatArrival = Math.max(traderTrip.arrivesAt, pirateTrip.arrivesAt) + 1;
  const salvageDirection = wreck.location + 1.2 < route.length ? 1 : -1;
  const boundaryLocation = wreck.location + salvageDirection;
  const boundaryWreck = store.database.prepare(`
    INSERT INTO sunken_items (item_id, route_id, location, source_vehicle_id, created_at)
    VALUES (?, ?, ?, NULL, ?)
  `).run(treasure.id, route.id, boundaryLocation, combatArrival);
  const distantWreck = store.database.prepare(`
    INSERT INTO sunken_items (item_id, route_id, location, source_vehicle_id, created_at)
    VALUES (?, ?, ?, NULL, ?)
  `).run(treasure.id, route.id, wreck.location + salvageDirection * 1.2, combatArrival);
  store.database.prepare('DELETE FROM sunken_items WHERE route_id = ? AND location = ?')
    .run(route.id, wreck.location);
  store.database.prepare(
    "UPDATE catalog_settings SET value_json = '1.1' WHERE key = 'fishing_salvage_distance'"
  ).run();

  store.vehiclesForPlayer(trader.id, combatArrival);
  store.vehiclesForPlayer(pirate.id, combatArrival);
  assert.equal(store.database.prepare('SELECT 1 FROM player_vehicles WHERE id = ?').get(traderShip), undefined);
  assert.equal(store.recentMessages(trader.id, 'all', 'Vehicle')
    .filter((message) => message.details.event === 'sunk').length, 1);
  const fishingRoute = store.routesForVehicle(fisher.id, fisherShip, combatArrival)
    .find((entry) => entry.id === route.id);
  const findingRevision = store.latestLiveUpdateId();
  const fishingTrip = store.sendVehicle(fisher.id, fisherShip, fishingRoute.id, combatArrival + 1);
  store.database.prepare(
    'UPDATE player_ship_state SET next_fish_location = ? WHERE vehicle_id = ?'
  ).run(wreck.location, fisherShip);
  store.vehiclesForPlayer(fisher.id, fishingTrip.arrivesAt + 1);
  const restored = store.playerById(fisher.id, fishingTrip.arrivesAt + 1);
  assert.equal(restored.inventoryByCity[fishingTrip.destinationCityId][treasure.id], 1);
  assert.equal(store.database.prepare('SELECT 1 FROM sunken_items WHERE id = ?')
    .get(Number(boundaryWreck.lastInsertRowid)), undefined);
  assert.ok(store.database.prepare('SELECT 1 FROM sunken_items WHERE id = ?')
    .get(Number(distantWreck.lastInsertRowid)));
  assert.equal(store.database.prepare('SELECT COUNT(*) AS count FROM sunken_items').get().count, 1);
  const earnedStones = store.stonesForPlayer(fisher.id).earned;
  assert.ok(!earnedStones.some((stone) => stone.name === 'Fished'));
  assert.ok(earnedStones.some((stone) => stone.name === 'Salvaged'));
  const salvageEvents = store.liveUpdatesAfter(findingRevision).filter((event) =>
    event.scope === `player:${fisher.id}` && event.eventType === 'items-found'
      && event.payload.source === 'salvage');
  assert.equal(salvageEvents.reduce((sum, event) => sum + event.payload.quantity, 0), 1);
  assert.equal(salvageEvents[0].payload.itemId, treasure.id);
  assert.equal(salvageEvents[0].payload.cityId, null);
  assert.equal(salvageEvents[0].payload.cityName, catalog.settings.location_labels.atSea);
  assert.equal(salvageEvents[0].payload.status, 'Loaded into ship cargo');
});

test('rejecting incompatible cargo rolls back the existing vehicle loadout', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const player = store.addPlayer(createPlayer('Cargo Guard', '', 'hash', catalog, 1000, () => 0.5));
  const vehicleType = catalog.vehicles.find((vehicle) => vehicle.routeType === 0
    && catalog.byId.get(vehicle.itemId).rarity >= 4 && vehicle.capacity >= 2);
  const cargo = catalog.items.find((item) => item.rarity === 4
    && !catalog.vehicleByItemId.has(item.id) && !catalog.boxes.some((box) => box.itemId === item.id));
  const incompatible = catalog.items.find((item) => item.rarity === 1
    && !catalog.weaponByItemId.has(item.id) && !catalog.vehicleByItemId.has(item.id));
  player.profession = 1;
  player.inventory[vehicleType.itemId] = 1;
  player.inventory[cargo.id] = 2;
  player.inventory[incompatible.id] = 1;
  store.savePlayer(player);
  const vehicleId = store.activateVehicle(player.id, vehicleType.itemId);
  store.setVehicleCargo(player.id, vehicleId, { [cargo.id]: 1 });

  assert.throws(() => store.setVehicleCargo(player.id, vehicleId, { [incompatible.id]: 1 }),
    /not physically compatible/);
  const details = store.vehicleDetails(player.id, vehicleId, 2000);
  const restored = store.playerById(player.id);
  assert.equal(details.cargo.length, 1);
  assert.equal(details.cargo[0].itemId, cargo.id);
  assert.equal(details.cargo[0].quantity, 1);
  assert.equal(restored.inventory[cargo.id], 1);
  assert.equal(restored.inventory[incompatible.id], 1);
});

test('builds a full cargo proposal from the rarest compatible things first', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const vehicleType = catalog.vehicles.find((vehicle) => vehicle.routeType === 0
    && catalog.byId.get(vehicle.itemId).rarity >= 4 && vehicle.capacity >= 10);
  const ordinaryAtRarity = (rarity) => catalog.items.find((item) => item.rarity === rarity
    && item.id !== vehicleType.itemId && !catalog.vehicleByItemId.has(item.id)
    && !catalog.boxes.some((box) => box.itemId === item.id));
  const legendary = ordinaryAtRarity(6);
  const fabled = ordinaryAtRarity(5);
  const rare = ordinaryAtRarity(4);
  const incompatible = ordinaryAtRarity(3);
  assert.ok(vehicleType && legendary && fabled && rare && incompatible);
  const player = createPlayer('Rarest Cargo', '', 'hash', catalog, 1000, () => 0.5);
  player.inventory = {
    [vehicleType.itemId]: 1, [legendary.id]: 2, [fabled.id]: 20,
    [rare.id]: 20, [incompatible.id]: 20
  };
  player.inventoryByCity = { [player.cityId]: player.inventory };
  const saved = store.addPlayer(player);
  const vehicleId = store.activateVehicle(saved.id, vehicleType.itemId);

  const proposal = store.rarestVehicleCargo(saved.id, vehicleId);

  assert.deepEqual(proposal, { [legendary.id]: 2, [fabled.id]: 8 });
  const preview = store.previewVehicleCargo(saved.id, vehicleId, proposal);
  assert.equal(preview.valid, true);
  assert.equal(preview.cargoSize, 10);
  assert.equal(preview.capacityBreakdown.free, 0);
});

function shuttleTestRig(store, name, originCityId = 1) {
  store.seedCatalog(catalog);
  const route = store.database.prepare(`
    SELECT * FROM catalog_routes
    WHERE is_open = 1 AND type = 0 AND city1_id <> city2_id
      AND (city1_id = ? OR city2_id = ?)
    ORDER BY id LIMIT 1
  `).get(originCityId, originCityId);
  const vehicleType = catalog.vehicles.find((vehicle) => vehicle.routeType === route?.type
    && vehicle.capacity === 10 && catalog.byId.get(vehicle.itemId)?.rarity === 6);
  assert.ok(route && vehicleType, 'shuttle tests require the original ten-slot land vehicle');
  const player = createPlayer(name, '', 'hash', catalog, 1000, () => 0.5);
  player.cityId = originCityId;
  player.homeCityId = originCityId;
  player.mines[0].cityId = originCityId;
  player.inventory = { [vehicleType.itemId]: 1 };
  player.inventoryByCity = { [originCityId]: player.inventory };
  const saved = store.addPlayer(player);
  const vehicleId = store.activateVehicle(saved.id, vehicleType.itemId);
  const destinationCityId = route.city1_id === originCityId ? route.city2_id : route.city1_id;
  return { player: saved, vehicleId, vehicleType, route, originCityId, destinationCityId };
}

function stockShuttleThing(store, playerId, cityId, itemId, quantity, protectedQuantity = 0) {
  store.database.prepare(`
    INSERT INTO inventory (player_id, city_id, item_id, quantity) VALUES (?, ?, ?, ?)
    ON CONFLICT (player_id, city_id, item_id) DO UPDATE SET quantity = excluded.quantity
  `).run(playerId, cityId, itemId, quantity);
  if (protectedQuantity) store.database.prepare(`
    INSERT INTO protected_inventory (player_id, city_id, item_id, quantity) VALUES (?, ?, ?, ?)
    ON CONFLICT (player_id, city_id, item_id) DO UPDATE SET quantity = excluded.quantity
  `).run(playerId, cityId, itemId, protectedQuantity);
}

function shuttleInventoryQuantity(store, playerId, cityId, itemId) {
  return Number(store.database.prepare(`
    SELECT quantity FROM inventory WHERE player_id = ? AND city_id = ? AND item_id = ?
  `).get(playerId, cityId, itemId)?.quantity ?? 0);
}

test('migrates v111 shuttle state with live updates exactly once', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-shuttle-migration-'));
  const databaseFile = path.join(directory, 'game.sqlite');
  let store = new SqliteStore(databaseFile);
  const rig = shuttleTestRig(store, 'Shuttle Migrator');
  store.close();
  const legacy = new DatabaseSync(databaseFile);
  legacy.exec(`
    DROP TABLE player_vehicle_shuttles;
    PRAGMA user_version = 111;
  `);
  legacy.close();
  context.after(() => {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  store = new SqliteStore(databaseFile);
  assert.equal(store.database.prepare('PRAGMA user_version').get().user_version, 112);
  assert.ok(store.database.prepare(`
    SELECT 1 FROM sqlite_master
    WHERE type = 'table' AND name = 'player_vehicle_shuttles'
  `).get());
  assert.ok(store.database.prepare(`
    SELECT 1 FROM sqlite_master
    WHERE type = 'index' AND name = 'player_vehicle_shuttles_owner'
  `).get());
  assert.deepEqual(store.database.prepare(`
    SELECT name FROM sqlite_master
    WHERE type = 'trigger' AND name LIKE 'live_update_player_vehicle_shuttles_%'
    ORDER BY name
  `).all().map((row) => row.name), [
    'live_update_player_vehicle_shuttles_delete',
    'live_update_player_vehicle_shuttles_insert',
    'live_update_player_vehicle_shuttles_update'
  ]);

  const previousEventId = Number(store.database.prepare(
    'SELECT COALESCE(MAX(id), 0) AS id FROM live_update_events'
  ).get().id);
  store.database.prepare(`
    INSERT INTO player_vehicle_shuttles
      (vehicle_id, player_id, route_id, origin_city_id, destination_city_id,
       created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 2000, 2000)
  `).run(rig.vehicleId, rig.player.id, rig.route.id,
    rig.originCityId, rig.destinationCityId);
  store.database.prepare(`
    UPDATE player_vehicle_shuttles SET paused_reason = 'waiting', updated_at = 2001
    WHERE vehicle_id = ?
  `).run(rig.vehicleId);
  store.database.prepare(
    'DELETE FROM player_vehicle_shuttles WHERE vehicle_id = ?'
  ).run(rig.vehicleId);
  const emittedScopes = store.database.prepare(`
    SELECT scope FROM live_update_events WHERE id > ? ORDER BY id
  `).all(previousEventId).map((row) => row.scope);
  assert.deepEqual(emittedScopes, [
    `player:${rig.player.id}`, 'topic:vehicles',
    `player:${rig.player.id}`, 'topic:vehicles',
    `player:${rig.player.id}`, 'topic:vehicles'
  ]);
  const eventCount = store.database.prepare(
    'SELECT COUNT(*) AS count FROM live_update_events'
  ).get().count;

  store.close();
  store = new SqliteStore(databaseFile);
  assert.equal(store.database.prepare('PRAGMA user_version').get().user_version, 112);
  assert.equal(store.database.prepare(
    'SELECT COUNT(*) AS count FROM live_update_events'
  ).get().count, eventCount, 'reopening v112 does not replay the shuttle migration');
});

test('an empty shuttle waits for eligible stock and resumes automatically', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  const rig = shuttleTestRig(store, 'Waiting Shuttle');

  const started = store.startVehicleShuttle(
    rig.player.id, rig.vehicleId, rig.route.id, 2000
  );
  let vehicle = store.database.prepare(
    'SELECT * FROM player_vehicles WHERE id = ?'
  ).get(rig.vehicleId);
  let shuttle = store.database.prepare(
    'SELECT * FROM player_vehicle_shuttles WHERE vehicle_id = ?'
  ).get(rig.vehicleId);
  assert.equal(started.paused, true);
  assert.match(started.reason, /No eligible things are available to load/i);
  assert.equal(vehicle.status, 'idle');
  assert.equal(vehicle.city_id, rig.originCityId);
  assert.match(shuttle.paused_reason, /No eligible things are available to load/i);

  const cargo = catalog.items.find((item) => item.rarity === 6
    && item.id !== rig.vehicleType.itemId && !catalog.vehicleByItemId.has(item.id)
    && !catalog.boxByItemId.has(item.id) && !catalog.factoryOutputItemIds.has(item.id));
  assert.ok(cargo);
  stockShuttleThing(store, rig.player.id, rig.originCityId, cargo.id, 4);
  store.settleVehicles(3000);

  vehicle = store.database.prepare('SELECT * FROM player_vehicles WHERE id = ?')
    .get(rig.vehicleId);
  shuttle = store.database.prepare(
    'SELECT * FROM player_vehicle_shuttles WHERE vehicle_id = ?'
  ).get(rig.vehicleId);
  assert.equal(vehicle.status, 'traveling');
  assert.equal(vehicle.origin_city_id, rig.originCityId);
  assert.equal(vehicle.destination_city_id, rig.destinationCityId);
  assert.equal(shuttle.paused_reason, '');
  assert.equal(shuttle.last_loaded_things, 4);
  assert.equal(store.vehicleDetails(rig.player.id, rig.vehicleId, 3001).cargoSize, 4);
});

test('retrying an unchanged empty shuttle does not emit another live update', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  const rig = shuttleTestRig(store, 'Quiet Waiting Shuttle');
  store.startVehicleShuttle(rig.player.id, rig.vehicleId, rig.route.id, 2000);
  const relevantCounts = () => Object.fromEntries(store.database.prepare(`
    SELECT scope, COUNT(*) AS count FROM live_update_events
    WHERE scope IN (?, 'topic:vehicles') GROUP BY scope ORDER BY scope
  `).all(`player:${rig.player.id}`).map((row) => [row.scope, Number(row.count)]));
  const beforeRetry = relevantCounts();
  const beforeReason = store.database.prepare(`
    SELECT paused_reason FROM player_vehicle_shuttles WHERE vehicle_id = ?
  `).get(rig.vehicleId).paused_reason;
  assert.match(beforeReason, /No eligible things are available to load/i);

  store.settleVehicles(2001);

  assert.equal(store.database.prepare(`
    SELECT paused_reason FROM player_vehicle_shuttles WHERE vehicle_id = ?
  `).get(rig.vehicleId).paused_reason, beforeReason);
  assert.deepEqual(relevantCounts(), beforeRetry,
    'an identical pause reason must not update the shuttle row or wake live clients');
});

test('a paused shuttle does not follow a catalog route whose endpoints have changed', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  const rig = shuttleTestRig(store, 'Retargeted Shuttle');
  store.startVehicleShuttle(rig.player.id, rig.vehicleId, rig.route.id, 2000);
  const replacement = store.database.prepare(`
    SELECT id FROM catalog_cities WHERE id NOT IN (?, ?) ORDER BY id LIMIT 1
  `).get(rig.originCityId, rig.destinationCityId);
  assert.ok(replacement);
  const endpointColumn = Number(rig.route.city1_id) === Number(rig.destinationCityId)
    ? 'city1_id' : 'city2_id';
  store.database.prepare(`
    UPDATE catalog_routes SET ${endpointColumn} = ? WHERE id = ?
  `).run(replacement.id, rig.route.id);
  const cargo = catalog.items.find((item) => item.rarity === 6
    && item.id !== rig.vehicleType.itemId && !catalog.vehicleByItemId.has(item.id)
    && !catalog.boxByItemId.has(item.id) && !catalog.factoryOutputItemIds.has(item.id));
  assert.ok(cargo);
  stockShuttleThing(store, rig.player.id, rig.originCityId, cargo.id, 5);

  store.settleVehicles(3000);

  const vehicle = store.database.prepare(
    'SELECT * FROM player_vehicles WHERE id = ?'
  ).get(rig.vehicleId);
  const shuttle = store.database.prepare(
    'SELECT * FROM player_vehicle_shuttles WHERE vehicle_id = ?'
  ).get(rig.vehicleId);
  assert.equal(vehicle.status, 'idle');
  assert.equal(vehicle.city_id, rig.originCityId);
  assert.match(shuttle.paused_reason, /route is no longer available/i);
  assert.equal(shuttle.last_loaded_things, 0);
  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count FROM player_vehicle_cargo WHERE vehicle_id = ?
  `).get(rig.vehicleId).count, 0);
  assert.equal(shuttleInventoryQuantity(
    store, rig.player.id, rig.originCityId, cargo.id
  ), 5, 'the contract must validate its original A-B endpoints before loading');
});

test('a shuttle waits above the configured inventory overage and resumes below it', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  const rig = shuttleTestRig(store, 'Overloaded Shuttle');
  store.database.prepare(`
    UPDATE catalog_settings SET value_json = '2'
    WHERE key = 'travel_inventory_overage_limit'
  `).run();
  store.database.prepare(
    'UPDATE players SET item_limit = 1 WHERE id = ?'
  ).run(rig.player.id);
  const cargo = catalog.items.find((item) => item.rarity === 6
    && item.id !== rig.vehicleType.itemId && !catalog.vehicleByItemId.has(item.id)
    && !catalog.boxByItemId.has(item.id) && !catalog.factoryOutputItemIds.has(item.id));
  assert.ok(cargo);
  stockShuttleThing(store, rig.player.id, rig.originCityId, cargo.id, 4);

  const started = store.startVehicleShuttle(
    rig.player.id, rig.vehicleId, rig.route.id, 2000
  );

  let vehicle = store.database.prepare('SELECT * FROM player_vehicles WHERE id = ?')
    .get(rig.vehicleId);
  let shuttle = store.database.prepare(
    'SELECT * FROM player_vehicle_shuttles WHERE vehicle_id = ?'
  ).get(rig.vehicleId);
  assert.equal(started.paused, true);
  assert.match(started.reason, /more than 2 things over the inventory limit/i);
  assert.equal(vehicle.status, 'idle');
  assert.equal(shuttle.last_loaded_things, 0);
  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count FROM player_vehicle_cargo WHERE vehicle_id = ?
  `).get(rig.vehicleId).count, 0);
  assert.equal(shuttleInventoryQuantity(
    store, rig.player.id, rig.originCityId, cargo.id
  ), 4);

  stockShuttleThing(store, rig.player.id, rig.originCityId, cargo.id, 2);
  const reducedCapacity = store.inventoryCapacity(rig.player.id, 3000);
  assert.equal(reducedCapacity.itemCount, 3);
  assert.equal(reducedCapacity.itemLimit, 1);
  store.settleVehicles(3000);

  vehicle = store.database.prepare('SELECT * FROM player_vehicles WHERE id = ?')
    .get(rig.vehicleId);
  shuttle = store.database.prepare(
    'SELECT * FROM player_vehicle_shuttles WHERE vehicle_id = ?'
  ).get(rig.vehicleId);
  assert.equal(vehicle.status, 'traveling');
  assert.equal(vehicle.origin_city_id, rig.originCityId);
  assert.equal(vehicle.destination_city_id, rig.destinationCityId);
  assert.equal(shuttle.paused_reason, '');
  assert.equal(shuttle.last_loaded_things, 2);
  assert.equal(store.vehicleDetails(rig.player.id, rig.vehicleId, 3001).cargoSize, 2);
});

test('a paused shuttle blocks manual travel, cargo changes, and storage', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  const rig = shuttleTestRig(store, 'Guarded Shuttle');
  store.startVehicleShuttle(rig.player.id, rig.vehicleId, rig.route.id, 2000);

  assert.throws(
    () => store.sendVehicle(rig.player.id, rig.vehicleId, rig.route.id, 2001),
    /Cancel this vehicle's shuttle route before sending it manually/i
  );
  assert.throws(
    () => store.setVehicleCargo(rig.player.id, rig.vehicleId, {}),
    /Cancel this vehicle's shuttle route before you change its cargo/i
  );
  assert.throws(
    () => store.storeVehicle(rig.player.id, rig.vehicleId),
    /Cancel this vehicle's shuttle route before you return it to inventory/i
  );
  assert.equal(store.database.prepare(
    'SELECT COUNT(*) AS count FROM player_vehicle_shuttles WHERE vehicle_id = ?'
  ).get(rig.vehicleId).count, 1);
  assert.equal(store.database.prepare(
    'SELECT status FROM player_vehicles WHERE id = ?'
  ).get(rig.vehicleId).status, 'idle');
});

test('snow pauses a shuttle turnaround after safely delivering its cargo', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  const rig = shuttleTestRig(store, 'Snowbound Shuttle');
  const departedAt = Date.UTC(2026, 7, 24, 10);
  store.ensureWorldMaps(departedAt);
  store.settleWorldEvents(departedAt);
  const originMapId = store.database.prepare(
    'SELECT map_id FROM catalog_cities WHERE id = ?'
  ).get(rig.originCityId).map_id;
  const destinationMapId = store.database.prepare(
    'SELECT map_id FROM catalog_cities WHERE id = ?'
  ).get(rig.destinationCityId).map_id;
  setCurrentWeatherCondition(store, originMapId, 'rain');
  const cargo = catalog.items.find((item) => item.rarity === 6
    && item.id !== rig.vehicleType.itemId && !catalog.vehicleByItemId.has(item.id)
    && !catalog.boxByItemId.has(item.id) && !catalog.factoryOutputItemIds.has(item.id));
  assert.ok(cargo);
  stockShuttleThing(store, rig.player.id, rig.originCityId, cargo.id, 6);
  store.startVehicleShuttle(
    rig.player.id, rig.vehicleId, rig.route.id, departedAt + 1
  );
  let vehicle = store.database.prepare(
    'SELECT * FROM player_vehicles WHERE id = ?'
  ).get(rig.vehicleId);
  const deliveredAt = vehicle.arrives_at;
  store.database.prepare(
    'UPDATE world_event_clock SET next_weather_at = ? WHERE id = 1'
  ).run(deliveredAt + 1000);
  setCurrentWeatherCondition(store, destinationMapId, 'snow');

  store.settleVehicles(deliveredAt);

  vehicle = store.database.prepare('SELECT * FROM player_vehicles WHERE id = ?')
    .get(rig.vehicleId);
  let shuttle = store.database.prepare(
    'SELECT * FROM player_vehicle_shuttles WHERE vehicle_id = ?'
  ).get(rig.vehicleId);
  assert.equal(vehicle.status, 'idle');
  assert.equal(vehicle.city_id, rig.destinationCityId);
  assert.equal(store.vehicleDetails(rig.player.id, rig.vehicleId, deliveredAt).cargoSize, 0);
  assert.equal(shuttle.deliveries, 1);
  assert.equal(shuttle.delivered_things, 6);
  assert.match(shuttle.paused_reason, /while it is snowing/i);
  assert.equal(shuttleInventoryQuantity(
    store, rig.player.id, rig.destinationCityId, cargo.id
  ), 6);

  setCurrentWeatherCondition(store, destinationMapId, 'rain');
  store.settleVehicles(deliveredAt + 1);
  vehicle = store.database.prepare('SELECT * FROM player_vehicles WHERE id = ?')
    .get(rig.vehicleId);
  shuttle = store.database.prepare(
    'SELECT * FROM player_vehicle_shuttles WHERE vehicle_id = ?'
  ).get(rig.vehicleId);
  assert.equal(vehicle.status, 'traveling');
  assert.equal(vehicle.origin_city_id, rig.destinationCityId);
  assert.equal(vehicle.destination_city_id, rig.originCityId);
  assert.equal(shuttle.paused_reason, '');
  assert.equal(shuttle.deliveries, 1, 'retrying the return does not count another delivery');
  assert.equal(shuttleInventoryQuantity(
    store, rig.player.id, rig.destinationCityId, cargo.id
  ), 6, 'retrying does not duplicate the delivered cargo');
});

test('a closed route pauses the return without rolling back a shuttle delivery', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  const rig = shuttleTestRig(store, 'Closed Route Shuttle');
  const cargo = catalog.items.find((item) => item.rarity === 6
    && item.id !== rig.vehicleType.itemId && !catalog.vehicleByItemId.has(item.id)
    && !catalog.boxByItemId.has(item.id) && !catalog.factoryOutputItemIds.has(item.id));
  assert.ok(cargo);
  stockShuttleThing(store, rig.player.id, rig.originCityId, cargo.id, 10);
  store.startVehicleShuttle(rig.player.id, rig.vehicleId, rig.route.id, 2000);
  let vehicle = store.database.prepare('SELECT * FROM player_vehicles WHERE id = ?')
    .get(rig.vehicleId);
  const deliveredAt = vehicle.arrives_at;
  store.database.prepare(
    'UPDATE catalog_routes SET is_open = 0 WHERE id = ?'
  ).run(rig.route.id);

  store.settleVehicles(deliveredAt);

  vehicle = store.database.prepare('SELECT * FROM player_vehicles WHERE id = ?')
    .get(rig.vehicleId);
  let shuttle = store.database.prepare(
    'SELECT * FROM player_vehicle_shuttles WHERE vehicle_id = ?'
  ).get(rig.vehicleId);
  assert.equal(vehicle.status, 'idle');
  assert.equal(vehicle.city_id, rig.destinationCityId);
  assert.equal(store.vehicleDetails(rig.player.id, rig.vehicleId, deliveredAt).cargoSize, 0);
  assert.equal(shuttle.deliveries, 1);
  assert.equal(shuttle.delivered_things, 10);
  assert.match(shuttle.paused_reason, /route is no longer available/i);
  assert.equal(shuttleInventoryQuantity(
    store, rig.player.id, rig.destinationCityId, cargo.id
  ), 10);

  store.database.prepare(
    'UPDATE catalog_routes SET is_open = 1 WHERE id = ?'
  ).run(rig.route.id);
  store.settleVehicles(deliveredAt + 1);
  vehicle = store.database.prepare('SELECT * FROM player_vehicles WHERE id = ?')
    .get(rig.vehicleId);
  shuttle = store.database.prepare(
    'SELECT * FROM player_vehicle_shuttles WHERE vehicle_id = ?'
  ).get(rig.vehicleId);
  assert.equal(vehicle.status, 'traveling');
  assert.equal(vehicle.origin_city_id, rig.destinationCityId);
  assert.equal(vehicle.destination_city_id, rig.originCityId);
  assert.equal(shuttle.paused_reason, '');
  assert.equal(shuttle.deliveries, 1);
  assert.equal(shuttleInventoryQuantity(
    store, rig.player.id, rig.destinationCityId, cargo.id
  ), 10);
});

test('shuttles fill from the rarest eligible stock without moving manufactured or Oil Field machine parts', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  const rig = shuttleTestRig(store, 'Selective Shuttle', 2);
  assert.ok(store.database.prepare('SELECT 1 FROM oil_hexes WHERE city_id = ? LIMIT 1')
    .get(rig.originCityId), 'Burgundy is the preserved Oil Field base');
  const intactMachine = catalog.machines.find((machine) => !machine.rules.isBomb
    && catalog.byId.get(machine.itemId)?.rarity === 6);
  const damagedMachine = catalog.items.find((item) => item.repairedItemId === intactMachine.itemId);
  const manufactured = [...catalog.factoryOutputItemIds].map((id) => catalog.byId.get(id))
    .find((item) => item?.rarity === 6 && !catalog.vehicleByItemId.has(item.id)
      && !catalog.boxByItemId.has(item.id) && !catalog.machineByItemId.has(item.id));
  const legendary = catalog.items.find((item) => item.rarity === 6
    && item.id !== rig.vehicleType.itemId && item.id !== manufactured.id
    && !catalog.factoryOutputItemIds.has(item.id) && !catalog.vehicleByItemId.has(item.id)
    && !catalog.boxByItemId.has(item.id));
  const fabled = catalog.items.find((item) => item.rarity === 5
    && !catalog.vehicleByItemId.has(item.id) && !catalog.boxByItemId.has(item.id)
    && !catalog.machineByItemId.has(item.id));
  assert.ok(damagedMachine && manufactured && legendary && fabled);
  stockShuttleThing(store, rig.player.id, rig.originCityId, legendary.id, 2);
  stockShuttleThing(store, rig.player.id, rig.originCityId, manufactured.id, 3, 2);
  stockShuttleThing(store, rig.player.id, rig.originCityId, damagedMachine.id, 1);
  stockShuttleThing(store, rig.player.id, rig.originCityId, fabled.id, 20);

  store.startVehicleShuttle(rig.player.id, rig.vehicleId, rig.route.id, 2000);

  const cargo = new Map(store.vehicleDetails(rig.player.id, rig.vehicleId, 2001).cargo
    .map((item) => [item.itemId, item.quantity]));
  assert.equal([...cargo.values()].reduce((sum, quantity) => sum + quantity, 0), 10);
  assert.equal(cargo.get(legendary.id), 2);
  assert.equal(cargo.get(manufactured.id), 1,
    'only the unprotected copy of a mixed manufactured item may move');
  assert.equal(cargo.has(damagedMachine.id), false,
    'a damaged item whose repaired identity is an Oil Field machine remains at its base');
  assert.equal(cargo.get(fabled.id), 7, 'the next rarity fills the remaining capacity');
  assert.equal(shuttleInventoryQuantity(store, rig.player.id, rig.originCityId, manufactured.id), 2);
  assert.equal(store.database.prepare(`
    SELECT quantity FROM protected_inventory
    WHERE player_id = ? AND city_id = ? AND item_id = ?
  `).get(rig.player.id, rig.originCityId, manufactured.id).quantity, 2);
  assert.equal(shuttleInventoryQuantity(
    store, rig.player.id, rig.originCityId, damagedMachine.id
  ), 1);
});

test('shuttles may carry normalized Oil Field machine parts away from non-field cities', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  const rig = shuttleTestRig(store, 'Machine Shuttle', 1);
  assert.equal(Boolean(store.database.prepare(
    'SELECT 1 FROM oil_hexes WHERE city_id = ? LIMIT 1'
  ).get(rig.originCityId)), false);
  const intactMachine = catalog.machines.find((machine) => !machine.rules.isBomb
    && catalog.byId.get(machine.itemId)?.rarity === 6);
  const damagedMachine = catalog.items.find((item) => item.repairedItemId === intactMachine.itemId);
  stockShuttleThing(store, rig.player.id, rig.originCityId, damagedMachine.id, 1);

  store.startVehicleShuttle(rig.player.id, rig.vehicleId, rig.route.id, 2000);

  assert.equal(store.vehicleDetails(rig.player.id, rig.vehicleId, 2001).cargo
    .find((item) => item.itemId === damagedMachine.id)?.quantity, 1);
});

test('starting a shuttle requires an empty cargo hold', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  const rig = shuttleTestRig(store, 'Loaded Shuttle');
  const cargo = catalog.items.find((item) => item.rarity === 6
    && item.id !== rig.vehicleType.itemId && !catalog.vehicleByItemId.has(item.id)
    && !catalog.boxByItemId.has(item.id));
  stockShuttleThing(store, rig.player.id, rig.originCityId, cargo.id, 1);
  store.setVehicleCargo(rig.player.id, rig.vehicleId, { [cargo.id]: 1 });

  assert.throws(
    () => store.startVehicleShuttle(rig.player.id, rig.vehicleId, rig.route.id, 2000),
    /empty|unload.*(?:cargo|vehicle)|cargo.*empty/i
  );
  assert.equal(store.vehicleDetails(rig.player.id, rig.vehicleId, 2000).status, 'idle');
  assert.equal(store.vehicleDetails(rig.player.id, rig.vehicleId, 2000).cargoSize, 1);
  assert.equal(store.database.prepare(
    'SELECT COUNT(*) AS count FROM player_vehicle_shuttles WHERE vehicle_id = ?'
  ).get(rig.vehicleId).count, 0);
});

test('shuttles unload outbound, return empty, and reload for the next delivery', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  const rig = shuttleTestRig(store, 'Repeating Shuttle');
  const cargo = catalog.items.find((item) => item.rarity === 6
    && item.id !== rig.vehicleType.itemId && !catalog.vehicleByItemId.has(item.id)
    && !catalog.boxByItemId.has(item.id));
  stockShuttleThing(store, rig.player.id, rig.originCityId, cargo.id, 25);
  store.startVehicleShuttle(rig.player.id, rig.vehicleId, rig.route.id, 2000);
  let vehicle = store.database.prepare('SELECT * FROM player_vehicles WHERE id = ?')
    .get(rig.vehicleId);
  const firstDeliveryAt = vehicle.arrives_at;
  assert.equal(vehicle.origin_city_id, rig.originCityId);
  assert.equal(vehicle.destination_city_id, rig.destinationCityId);
  assert.equal(shuttleInventoryQuantity(store, rig.player.id, rig.originCityId, cargo.id), 15);

  store.settleVehicles(firstDeliveryAt);
  vehicle = store.database.prepare('SELECT * FROM player_vehicles WHERE id = ?').get(rig.vehicleId);
  let shuttle = store.database.prepare(
    'SELECT * FROM player_vehicle_shuttles WHERE vehicle_id = ?'
  ).get(rig.vehicleId);
  assert.equal(vehicle.status, 'traveling', shuttle?.paused_reason);
  assert.equal(vehicle.origin_city_id, rig.destinationCityId);
  assert.equal(vehicle.destination_city_id, rig.originCityId);
  assert.equal(vehicle.departed_at, firstDeliveryAt);
  assert.equal(store.vehicleDetails(rig.player.id, rig.vehicleId, firstDeliveryAt).cargoSize, 0,
    'the return journey is empty');
  assert.equal(shuttleInventoryQuantity(
    store, rig.player.id, rig.destinationCityId, cargo.id
  ), 10);
  assert.equal(shuttle.deliveries, 1);
  assert.equal(shuttle.delivered_things, 10);
  const returnAt = vehicle.arrives_at;

  store.settleVehicles(returnAt);
  vehicle = store.database.prepare('SELECT * FROM player_vehicles WHERE id = ?').get(rig.vehicleId);
  assert.equal(vehicle.status, 'traveling');
  assert.equal(vehicle.origin_city_id, rig.originCityId);
  assert.equal(vehicle.destination_city_id, rig.destinationCityId);
  assert.equal(vehicle.departed_at, returnAt);
  assert.equal(store.vehicleDetails(rig.player.id, rig.vehicleId, returnAt).cargoSize, 10,
    'the next outbound journey reloads at the origin');
  assert.equal(shuttleInventoryQuantity(store, rig.player.id, rig.originCityId, cargo.id), 5);
  shuttle = store.database.prepare(
    'SELECT * FROM player_vehicle_shuttles WHERE vehicle_id = ?'
  ).get(rig.vehicleId);
  assert.equal(shuttle.last_loaded_things, 10);
});

test('cancelling a shuttle leaves its current leg in flight and stops after arrival', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  const rig = shuttleTestRig(store, 'Cancelled Shuttle');
  const cargo = catalog.items.find((item) => item.rarity === 6
    && item.id !== rig.vehicleType.itemId && !catalog.vehicleByItemId.has(item.id)
    && !catalog.boxByItemId.has(item.id));
  stockShuttleThing(store, rig.player.id, rig.originCityId, cargo.id, 10);
  store.startVehicleShuttle(rig.player.id, rig.vehicleId, rig.route.id, 2000);
  const before = store.database.prepare('SELECT * FROM player_vehicles WHERE id = ?')
    .get(rig.vehicleId);

  store.cancelVehicleShuttle(rig.player.id, rig.vehicleId, 2001);

  const cancelled = store.database.prepare('SELECT * FROM player_vehicles WHERE id = ?')
    .get(rig.vehicleId);
  assert.equal(cancelled.status, 'traveling');
  assert.equal(cancelled.destination_city_id, before.destination_city_id);
  assert.equal(cancelled.arrives_at, before.arrives_at);
  assert.equal(store.database.prepare(
    'SELECT COUNT(*) AS count FROM player_vehicle_shuttles WHERE vehicle_id = ?'
  ).get(rig.vehicleId).count, 0);

  store.settleVehicles(before.arrives_at);
  const arrived = store.vehicleDetails(rig.player.id, rig.vehicleId, before.arrives_at);
  assert.equal(arrived.status, 'idle');
  assert.equal(arrived.cityId, rig.destinationCityId);
  assert.equal(arrived.cargoSize, 0);
  assert.equal(shuttleInventoryQuantity(
    store, rig.player.id, rig.destinationCityId, cargo.id
  ), 10);
});

test('persists account privacy, recycle-on-find, and PM-block controls', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const ada = store.addPlayer(createPlayer('Account Ada', 'old@example.test', hashPassword('old password'), catalog, 1000, () => 0.5));
  const grace = store.addPlayer(createPlayer('Blocked Grace', '', hashPassword('grace password'), catalog, 1000, () => 0.5));
  const item = catalog.items.find((candidate) => candidate.canFind
    && !candidate.repairedItemId && !catalog.factoryOutputItemIds.has(candidate.id));
  const damaged = catalog.items.find((candidate) => candidate.repairedItemId === item.id);

  store.updateAccount(ada.id, { email: 'new@example.test', publishFindings: false, showMines: false });
  store.changePassword(ada.id, 'old password', 'new password');
  store.updateRecyclePreferencePair(ada.id, item.id, damaged?.id, true, Boolean(damaged), 2000);
  store.setMessageBlock(ada.id, grace.name, true, 2000);

  const restored = store.playerById(ada.id);
  assert.equal(restored.email, 'new@example.test');
  assert.equal(restored.publishFindings, false);
  assert.equal(restored.showMines, false);
  assert.equal(verifyPassword('new password', restored.passwordHash), true);
  assert.ok(restored.recycleItemIds.includes(item.id));
  if (damaged) assert.ok(restored.recycleItemIds.includes(damaged.id));
  assert.equal(store.conversation(ada.id, grace.name).blockedOther, true);
  assert.equal(store.conversation(grace.id, ada.name).blockedByOther, true);
  assert.throws(() => store.sendMessage(grace.id, ada.name, 'blocked', 3000), /blocked/);

  store.setMessageBlock(ada.id, grace.name, false, 3000);
  assert.doesNotThrow(() => store.sendMessage(grace.id, ada.name, 'allowed', 3001));
});

test('rejects moving a fixed regional capital without mutating miner state', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  store.ensureWorldMaps(1000);
  const worldCatalog = store.loadCatalog();
  const aso = worldCatalog.maps.find((map) => map.slug === 'aso');
  const capitalCityId = aso.capitalCityId;
  const outpostCityId = worldCatalog.cities.find((city) =>
    city.mapId === aso.id && city.id !== capitalCityId).id;
  const player = store.addPlayer(createPlayer(
    'Moving Miner', '', hashPassword('move password'), worldCatalog, 1000, () => 0.5
  ));
  const meld = worldCatalog.melds.find(
    (candidate) => candidate.public && candidate.requirements.length
  );
  const avatar = [1, 2, 3].map((typeId) =>
    worldCatalog.avatarElements.find((element) => element.typeId === typeId));
  for (const requirement of meld.requirements) {
    player.inventory[requirement.itemId] = (player.inventory[requirement.itemId] ?? 0) + requirement.count;
  }
  for (const element of avatar) player.inventory[element.itemId] = (player.inventory[element.itemId] ?? 0) + 1;
  player.profession = 1;
  store.savePlayer(player);
  store.createMeld(player.id, meld.id, 1500);
  store.saveAvatar(player.id, avatar.map((element) => element.id),
    worldCatalog.avatarElements.map((element) => ({
    ...element, rarity: worldCatalog.byId.get(element.itemId)?.rarity ?? 0
  })));
  store.database.prepare(
    'INSERT OR IGNORE INTO known_cities (player_id, city_id) VALUES (?, ?)'
  ).run(player.id, outpostCityId);
  store.changeCity(player.id, outpostCityId, 1900);
  const playerRowBefore = { ...store.database.prepare(
    'SELECT * FROM players WHERE id = ?'
  ).get(player.id) };
  const regionRowsBefore = store.database.prepare(`
    SELECT map_id, city_id, chosen_at FROM player_region_homes
    WHERE player_id = ? ORDER BY map_id
  `).all(player.id).map((row) => ({ ...row }));

  assert.throws(
    () => store.moveHomeCity(player.id, outpostCityId, 2000),
    /Regional capitals are fixed/
  );
  assert.deepEqual({ ...store.database.prepare(
    'SELECT * FROM players WHERE id = ?'
  ).get(player.id) }, playerRowBefore);
  assert.deepEqual(store.database.prepare(`
    SELECT map_id, city_id, chosen_at FROM player_region_homes
    WHERE player_id = ? ORDER BY map_id
  `).all(player.id).map((row) => ({ ...row })), regionRowsBefore);
  const restored = store.playerById(player.id, 2000);
  assert.equal(restored.homeCityId, capitalCityId);
  assert.equal(restored.currentRegionHomeCityId, capitalCityId);
  assert.equal(restored.profession, 1);
  assert.deepEqual(restored.meldIds, [meld.id]);
  assert.deepEqual(restored.brokenMeldIds, []);
  assert.equal(restored.avatarLayers.length, avatar.length);
});

test('allows physically compatible cargo regardless of specialisation', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const vehicleType = catalog.vehicles.find((vehicle) => vehicle.routeType === 0
    && catalog.byId.get(vehicle.itemId).rarity >= 4 && vehicle.capacity >= 3);
  const weapon = catalog.weapons.find((entry) => catalog.byId.get(entry.itemId).rarity === 1);
  const ordinaryCargo = catalog.items.find((item) => item.rarity === 4
    && !catalog.vehicleByItemId.has(item.id) && !catalog.weaponByItemId.has(item.id));
  const unrankedVehicle = catalog.vehicles.find((entry) =>
    catalog.byId.get(entry.itemId).rarity === 0);
  const ammoBox = catalog.boxes.find((entry) => catalog.byId.get(entry.itemId).rarity === 0);
  const unrankedThing = catalog.items.find((item) => item.rarity === 0
    && !catalog.vehicleByItemId.has(item.id)
    && !catalog.boxes.some((entry) => entry.itemId === item.id));
  assert.ok(vehicleType && weapon && ordinaryCargo && unrankedVehicle && ammoBox && unrankedThing);
  const highwayman = store.addPlayer(createPlayer('Cargo Highwayman', '', 'hash', catalog, 1000, () => 0.5));
  highwayman.profession = 2;
  highwayman.inventory[vehicleType.itemId] = 1;
  highwayman.inventory[weapon.itemId] = 1;
  highwayman.inventory[ordinaryCargo.id] = 1;
  highwayman.inventory[unrankedVehicle.itemId] = 1;
  highwayman.inventory[ammoBox.itemId] = 1;
  highwayman.inventory[unrankedThing.id] = 1;
  store.savePlayer(highwayman);
  const vehicleId = store.activateVehicle(highwayman.id, vehicleType.itemId);

  const armsRules = structuredClone(catalog.settings.arms_rarities_by_vehicle_rarity);
  armsRules[catalog.byId.get(vehicleType.itemId).rarity] = [];
  store.database.prepare(`
    UPDATE catalog_settings SET value_json = ? WHERE key = 'arms_rarities_by_vehicle_rarity'
  `).run(JSON.stringify(armsRules));
  assert.throws(() => store.setVehicleCargo(highwayman.id, vehicleId, { [weapon.itemId]: 1 }),
    /not physically compatible/);
  armsRules[catalog.byId.get(vehicleType.itemId).rarity] = [1];
  store.database.prepare(`
    UPDATE catalog_settings SET value_json = ? WHERE key = 'arms_rarities_by_vehicle_rarity'
  `).run(JSON.stringify(armsRules));
  assert.equal(store.setVehicleCargo(highwayman.id, vehicleId, { [weapon.itemId]: 1 }), 1);
  armsRules[catalog.byId.get(vehicleType.itemId).rarity]
    = catalog.settings.arms_rarities_by_vehicle_rarity[catalog.byId.get(vehicleType.itemId).rarity];
  store.database.prepare(`
    UPDATE catalog_settings SET value_json = ? WHERE key = 'arms_rarities_by_vehicle_rarity'
  `).run(JSON.stringify(armsRules));
  assert.equal(store.setVehicleCargo(highwayman.id, vehicleId, { [ordinaryCargo.id]: 1 }), 1);
  assert.equal(store.vehicleDetails(highwayman.id, vehicleId, 2000).cargo[0].itemId, ordinaryCargo.id);
  assert.equal(store.setVehicleCargo(highwayman.id, vehicleId, {
    [unrankedVehicle.itemId]: 1, [ammoBox.itemId]: 1, [unrankedThing.id]: 1
  }), 3);
  assert.deepEqual(new Set(store.vehicleDetails(highwayman.id, vehicleId, 2000).cargo
    .map((entry) => entry.itemId)), new Set([
    unrankedVehicle.itemId, ammoBox.itemId, unrankedThing.id
  ]));
});

test('allows every specialisation to set pillage orders', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const vehicleType = catalog.vehicles.find((vehicle) => vehicle.routeType === 0
    && catalog.routes.some((route) => route.open && route.type === 0
      && route.city1Id !== route.city2Id && (route.city1Id === 1 || route.city2Id === 1)));
  const trader = store.addPlayer(createPlayer('Peaceful Trader', '', 'hash', catalog, 1000, () => 0.5));
  trader.profession = 1;
  trader.inventory[vehicleType.itemId] = 1;
  store.savePlayer(trader);
  const vehicleId = store.activateVehicle(trader.id, vehicleType.itemId);
  const route = store.routesForVehicle(trader.id, vehicleId, 2000)[0];
  const trip = store.sendVehicle(trader.id, vehicleId, route.id, 2000, {
    travelOrder: 'pillage'
  });
  assert.ok(trip.arrivesAt > 2000);
  const traveling = store.vehicleDetails(trader.id, vehicleId, 2001);
  const rarity = catalog.byId.get(vehicleType.itemId).rarity;
  const targetClass = catalog.settings.combat_class_by_rarity[rarity];
  const expectedMask = catalog.settings.combat_class_by_rarity.reduce((mask, entry, index) =>
    Number(entry) === Number(targetClass) ? mask | (1 << index) : mask, 0);
  assert.equal(traveling.travelOrder, 'pillage');
  assert.equal(traveling.aggressive, true);
  assert.equal(traveling.aggressiveMask, expectedMask);
});

test('ignores caller rarity masks and targets the complete combat tier', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const classRules = catalog.settings.combat_class_by_rarity;
  const vehicleType = catalog.vehicles.find((vehicle) => {
    const rarity = catalog.byId.get(vehicle.itemId)?.rarity;
    const targetClass = classRules[rarity];
    return classRules.filter((entry) => Number(entry) === Number(targetClass)).length > 1
      && catalog.routes.some((route) => route.open && route.type === vehicle.routeType
        && route.city1Id !== route.city2Id && [route.city1Id, route.city2Id].includes(1));
  });
  assert.ok(vehicleType);
  const player = store.addPlayer(createPlayer('Tier Targeter', '', 'hash', catalog, 1000, () => 0.5));
  player.inventory[vehicleType.itemId] = 1;
  store.savePlayer(player);
  const vehicleId = store.activateVehicle(player.id, vehicleType.itemId);
  const route = store.routesForVehicle(player.id, vehicleId, 2000)[0];
  const rarity = catalog.byId.get(vehicleType.itemId).rarity;
  const targetClass = classRules[rarity];
  const outsideRarity = classRules.findIndex((entry) => Number(entry) !== Number(targetClass));
  store.sendVehicle(player.id, vehicleId, route.id, 2000, {
    travelOrder: 'pillage', aggressiveMask: 1 << outsideRarity
  });
  const traveling = store.vehicleDetails(player.id, vehicleId, 2001);
  const expectedMask = classRules.reduce((mask, entry, index) =>
    Number(entry) === Number(targetClass) ? mask | (1 << index) : mask, 0);
  assert.equal(traveling.aggressiveMask, expectedMask);
  assert.equal(Boolean(traveling.aggressiveMask & (1 << outsideRarity)), false);
});

test('derives legacy patrol orders from live specialisation bonus metadata', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const vehicleType = catalog.vehicles.find((vehicle) => vehicle.routeType === 0
    && catalog.routes.some((route) => route.open && route.type === 0
      && route.city1Id !== route.city2Id && (route.city1Id === 1 || route.city2Id === 1)));
  const patrol = store.addPlayer(createPlayer('Metadata Patrol', '', 'hash', catalog, 1000, () => 0.5));
  patrol.profession = 1;
  patrol.inventory[vehicleType.itemId] = 1;
  store.savePlayer(patrol);
  store.database.prepare(`
    UPDATE catalog_specialisation_bonuses SET bonus = 0.2
    WHERE specialisation_id = ? AND bonus_key = 'landPatrolDefense'
  `).run(patrol.profession);
  const vehicleId = store.activateVehicle(patrol.id, vehicleType.itemId);
  const route = store.routesForVehicle(patrol.id, vehicleId, 2000)[0];
  store.sendVehicle(patrol.id, vehicleId, route.id, 2000, {
    aggressiveMask: 1 << catalog.byId.get(vehicleType.itemId).rarity
  });
  assert.equal(store.vehicleDetails(patrol.id, vehicleId, 2001).travelOrder, 'patrol');
});

test('limits airborne Pilot vehicles to one per ten melds', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const aircraft = catalog.vehicles.find((vehicle) => vehicle.routeType === 2
    && catalog.routes.some((route) => route.open && route.type === 2
      && route.city1Id !== route.city2Id && (route.city1Id === 1 || route.city2Id === 1)));
  assert.ok(aircraft);
  const pilot = store.addPlayer(createPlayer('Flight Limit', '', 'hash', catalog, 1000, () => 0.5));
  pilot.profession = 10;
  pilot.inventory[aircraft.itemId] = 2;
  store.savePlayer(pilot);
  const addMeld = store.database.prepare(
    'INSERT INTO player_melds (player_id, meld_id, created_at) VALUES (?, ?, ?)'
  );
  for (const meld of catalog.melds.slice(0, 10)) addMeld.run(pilot.id, meld.id, 1000);
  const first = store.activateVehicle(pilot.id, aircraft.itemId);
  const second = store.activateVehicle(pilot.id, aircraft.itemId);
  const route = store.routesForVehicle(pilot.id, first, 2000)[0];
  store.sendVehicle(pilot.id, first, route.id, 2000);
  assert.throws(() => store.sendVehicle(pilot.id, second, route.id, 2000),
    /does not allow another aircraft/);
});

test('flies original Search Plane, Bomber, and Helicopter ore-thief missions', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const searchPlane = catalog.vehicles.find((vehicle) => catalog.byId.get(vehicle.itemId)?.name === 'Search Plane');
  const bomber = catalog.vehicles.find((vehicle) => catalog.byId.get(vehicle.itemId)?.name === 'Bomber');
  const helicopter = catalog.vehicles.find((vehicle) => catalog.byId.get(vehicle.itemId)?.name === 'Helicopter');
  const blu82 = catalog.items.find((item) => item.name === 'BLU-82');
  const ore = catalog.items.find((item) => item.name === 'Ore Crate');
  const gadgetItem = (name) => {
    const gadget = catalog.gadgetByName.get(name);
    return catalog.gadgetItems.filter((entry) => entry.gadgetId === gadget.id)
      .sort((first, second) => catalog.byId.get(second.itemId).rarity - catalog.byId.get(first.itemId).rarity)[0];
  };
  const turbo = gadgetItem('turbo');
  const sharpener = gadgetItem('sharpener');
  const shield = gadgetItem('shield');
  assert.ok(searchPlane && bomber && helicopter && blu82 && ore && turbo && sharpener && shield);
  const pilot = store.addPlayer(createPlayer('Mission Pilot', '', 'hash', catalog, 1000, () => 0.5));
  pilot.profession = 10;
  pilot.cityId = 3;
  pilot.inventoryByCity[3] = {
    [searchPlane.itemId]: 1, [bomber.itemId]: 1, [helicopter.itemId]: 1, [blu82.id]: 1
  };
  pilot.inventoryByCity[pilot.homeCityId][turbo.itemId] = 1;
  pilot.inventoryByCity[pilot.homeCityId][sharpener.itemId] = 1;
  pilot.inventoryByCity[pilot.homeCityId][shield.itemId] = 1;
  pilot.inventory = pilot.inventoryByCity[3];
  store.savePlayer(pilot);
  const addMeld = store.database.prepare(
    'INSERT INTO player_melds (player_id, meld_id, created_at) VALUES (?, ?, ?)'
  );
  for (const meld of catalog.melds.slice(0, 30)) addMeld.run(pilot.id, meld.id, 1000);
  store.activateGadget(pilot.id, turbo.itemId, 1000);
  store.activateGadget(pilot.id, sharpener.itemId, 1000);
  store.activateGadget(pilot.id, shield.itemId, 1000);
  store.database.prepare(`
    UPDATE thief_bases SET discovered_at = 1, damaged = 1, destroyed_at = 1, ore = 1
  `).run();

  const searchId = store.activateVehicle(pilot.id, searchPlane.itemId);
  let time = 2000;
  for (let attempt = 0; attempt < 20 && !store.thiefBaseStatus(pilot.id).discovered; attempt += 1) {
    const route = store.routesForVehicle(pilot.id, searchId, time).find((entry) => entry.mission);
    assert.ok(route);
    const trip = store.sendVehicle(pilot.id, searchId, route.id, time);
    assert.equal(trip.duration, Math.ceil(8 * 60 * 60 * 1000 / (1.1 * 1.2)));
    const inFlight = store.vehicleDetails(pilot.id, searchId, time);
    assert.equal(inFlight.turbo, true);
    assert.equal(inFlight.offenseBonusFactor, 0.1);
    assert.equal(inFlight.defenseBonusFactor, 0.1);
    time = trip.arrivesAt + 1;
    store.vehiclesForPlayer(pilot.id, time);
  }
  assert.equal(store.thiefBaseStatus(pilot.id).discovered, true);
  assert.ok(store.stonesForPlayer(pilot.id).earned.some((stone) => stone.name === 'Uncovered'));

  const baseId = store.thiefBaseStatus(pilot.id).id;
  store.database.prepare(`
    UPDATE thief_bases SET buckets = 12000, damaged = 0, destroyed_at = NULL,
      destroyer_id = NULL, ore = 0 WHERE id = ?
  `).run(baseId);
  store.database.prepare(`
    INSERT INTO bum_thefts (winner_id, loser_id, hoarder_id, quantity, created_at)
    VALUES (?, ?, ?, 500, ?)
  `).run(pilot.id, pilot.id, pilot.id, time);
  const bomberId = store.activateVehicle(pilot.id, bomber.itemId);
  store.setVehicleCargo(pilot.id, bomberId, { [blu82.id]: 1 });
  const bomberRoute = store.routesForVehicle(pilot.id, bomberId, time).find((entry) => entry.mission);
  const bombing = store.sendVehicle(pilot.id, bomberId, bomberRoute.id, time);
  time = bombing.arrivesAt + 1;
  store.vehiclesForPlayer(pilot.id, time);
  const destroyed = store.thiefBaseStatus(pilot.id);
  assert.equal(destroyed.destroyed, true);
  assert.equal(destroyed.buckets, 0);
  assert.equal(destroyed.ore, 10);
  assert.equal(store.database.prepare(
    'SELECT COUNT(*) AS count FROM player_vehicle_cargo WHERE vehicle_id = ?'
  ).get(bomberId).count, 0);

  const helicopterId = store.activateVehicle(pilot.id, helicopter.itemId);
  const helicopterRoute = store.routesForVehicle(pilot.id, helicopterId, time).find((entry) => entry.mission);
  const recovery = store.sendVehicle(pilot.id, helicopterId, helicopterRoute.id, time);
  time = recovery.arrivesAt + 1;
  const aircraft = store.vehiclesForPlayer(pilot.id, time).find((vehicle) => vehicle.id === helicopterId);
  assert.equal(store.thiefBaseStatus(pilot.id).ore, 6);
  const recovered = store.playerById(pilot.id, time).inventoryByCity[3][ore.id] ?? 0;
  assert.equal(recovered, aircraft.aircraftDestroyed ? 0 : 4);
});

test('reports a shot-down aircraft once when background mission settlement repeats', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const searchPlane = catalog.vehicles.find((vehicle) =>
    catalog.byId.get(vehicle.itemId)?.name === 'Search Plane');
  assert.ok(searchPlane);
  const pilot = store.addPlayer(createPlayer(
    'Message Test Pilot', '', 'hash', catalog, 1000, () => 0.5
  ));
  pilot.profession = 10;
  pilot.cityId = 3;
  pilot.inventoryByCity[3] = { [searchPlane.itemId]: 1 };
  pilot.inventory = pilot.inventoryByCity[3];
  store.savePlayer(pilot);
  const addMeld = store.database.prepare(
    'INSERT INTO player_melds (player_id, meld_id, created_at) VALUES (?, ?, ?)'
  );
  for (const meld of catalog.melds.slice(0, 10)) addMeld.run(pilot.id, meld.id, 1000);
  store.database.prepare(
    "UPDATE catalog_settings SET value_json = '1' WHERE key IN ('aircraft_search_chance', 'aircraft_shot_down_chance')"
  ).run();
  const vehicleId = store.activateVehicle(pilot.id, searchPlane.itemId);
  const route = store.routesForVehicle(pilot.id, vehicleId, 2000).find((entry) => entry.mission);
  const trip = store.sendVehicle(pilot.id, vehicleId, route.id, 2000);
  const eventAt = store.vehicleDetails(pilot.id, vehicleId, 2000).aircraftEventAt;

  const first = store.settleVehicles(eventAt);
  assert.equal(first.aircraftResolved, 1);
  assert.equal(store.vehicleDetails(pilot.id, vehicleId, eventAt).aircraftDestroyed, true);
  const reports = store.recentMessages(pilot.id, 'all', 'Vehicle')
    .filter((message) => message.details.event === 'shot-down');
  assert.equal(reports.length, 1);
  assert.equal(reports[0].details.vehicleId, vehicleId);
  assert.equal(reports[0].details.cargoLost, true);
  assert.ok(reports[0].actionLinks.some((action) => action.href === `/vehicles/${vehicleId}`));
  store.settleVehicles(trip.arrivesAt + 1);
  assert.equal(store.recentMessages(pilot.id, 'all', 'Vehicle')
    .filter((message) => message.details.event === 'shot-down').length, 1);
  assert.equal(store.recentMessages(pilot.id, 'all', 'City').length, 0);
});

test('excludes installed vehicle fittings from inventory and blocks travel 100 over limit', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const vehicleType = catalog.vehicles.find((vehicle) => vehicle.routeType === 0
    && catalog.byId.get(vehicle.itemId).rarity >= 4 && vehicle.capacity >= 3
    && catalog.routes.some((route) => route.open && route.type === 0
      && route.city1Id !== route.city2Id && (route.city1Id === 1 || route.city2Id === 1)));
  const mod = catalog.mods.find((entry) => catalog.byId.get(entry.itemId).rarity === 1);
  const weapon = catalog.weapons.find((entry) => catalog.byId.get(entry.itemId).rarity === 1);
  const excess = catalog.items.find((item) => item.rarity === 1
    && !catalog.vehicleByItemId.has(item.id) && item.id !== mod.itemId && item.id !== weapon.itemId);
  const player = store.addPlayer(createPlayer('Capacity Driver', '', 'hash', catalog, 1000, () => 0.5));
  store.database.prepare('UPDATE players SET item_limit = 50 WHERE id = ?').run(player.id);
  player.profession = 1;
  player.inventory[vehicleType.itemId] = 1;
  player.inventory[mod.itemId] = 1;
  player.inventory[weapon.itemId] = 1;
  player.inventory[excess.id] = 200;
  store.savePlayer(player);
  const before = store.inventoryCapacity(player.id, 2000).itemCount;
  const vehicleId = store.activateVehicle(player.id, vehicleType.itemId);
  store.fitVehicleMods(player.id, vehicleId, [mod.id]);
  store.fitVehicleWeapons(player.id, vehicleId, [weapon.id]);
  assert.equal(store.inventoryCapacity(player.id, 2000).itemCount, before - 2);
  const route = store.routesForVehicle(player.id, vehicleId, 2000)[0];
  assert.throws(() => store.sendVehicle(player.id, vehicleId, route.id, 2000),
    /more than 100 things over/);
});

test('snapshots travel gadgets, applies meld defenses, and reports radar and binocular data', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  store.database.prepare(`
    UPDATE catalog_settings SET value_json = '0'
    WHERE key = 'vehicle_combat_port_safe_zone_max_distance'
  `).run();
  const vehicleType = catalog.vehicles.find((vehicle) => vehicle.routeType === 0
    && vehicle.land?.attack > 0 && vehicle.land?.armor > 0
    && catalog.byId.get(vehicle.itemId).rarity >= 4 && vehicle.capacity >= 2
    && catalog.routes.some((route) => route.open && route.type === 0
      && route.city1Id !== route.city2Id && (route.city1Id === 1 || route.city2Id === 1)));
  const offensiveWeapon = catalog.weapons.find((entry) => {
    const item = catalog.byId.get(entry.itemId);
    return item?.rarity === 1 && entry.offense > 0;
  });
  const defensiveWeapon = catalog.weapons.find((entry) => {
    const item = catalog.byId.get(entry.itemId);
    return item?.rarity === 1 && entry.defense > 0;
  });
  assert.ok(vehicleType && offensiveWeapon && defensiveWeapon);

  const gadgetItem = (name) => {
    const gadget = catalog.gadgetByName.get(name);
    return catalog.gadgetItems.find((entry) => entry.gadgetId === gadget.id);
  };
  const attacker = store.addPlayer(createPlayer('Gadget Highwayman', '', 'hash', catalog, 1000, () => 0.5));
  const defender = store.addPlayer(createPlayer('Gadget Trader', '', 'hash', catalog, 1000, () => 0.5));
  attacker.profession = 2;
  defender.profession = 1;
  attacker.inventory[vehicleType.itemId] = 1;
  attacker.inventory[offensiveWeapon.itemId] = 1;
  defender.inventory[vehicleType.itemId] = 1;
  defender.inventory[defensiveWeapon.itemId] = 1;
  for (const name of ['sharpener', 'turbo', 'binoculars', 'radar']) {
    attacker.inventory[gadgetItem(name).itemId] = 1;
  }
  defender.inventory[gadgetItem('shield').itemId] = 1;
  store.savePlayer(attacker);
  store.savePlayer(defender);
  for (const name of ['sharpener', 'turbo', 'binoculars', 'radar']) {
    store.activateGadget(attacker.id, gadgetItem(name).itemId, 1000);
  }
  store.activateGadget(defender.id, gadgetItem('shield').itemId, 1000);
  const addMeld = store.database.prepare(
    'INSERT INTO player_melds (player_id, meld_id, created_at) VALUES (?, ?, ?)'
  );
  for (const meld of catalog.melds.slice(0, 10)) addMeld.run(attacker.id, meld.id, 1000);

  const attackerVehicle = store.activateVehicle(attacker.id, vehicleType.itemId);
  const defenderVehicle = store.activateVehicle(defender.id, vehicleType.itemId);
  store.fitVehicleWeapons(attacker.id, attackerVehicle, [offensiveWeapon.id]);
  store.fitVehicleWeapons(defender.id, defenderVehicle, [defensiveWeapon.id]);
  const route = store.routesForVehicle(defender.id, defenderVehicle, 2000)[0];
  store.sendVehicle(defender.id, defenderVehicle, route.id, 2000);

  const radar = store.routesForVehicle(attacker.id, attackerVehicle, 2001)
    .find((entry) => entry.id === route.id).radar;
  assert.equal(radar.find((entry) => entry.label === 'Peaceful').count, 1);
  const journey = store.sendVehicle(attacker.id, attackerVehicle, route.id, 2001, {
    aggressiveMask: 1 << catalog.byId.get(vehicleType.itemId).rarity
  });
  journey.battleId = resolveNextVehicleEncounter(store).battle_id;
  const attackerStatus = store.vehicleDetails(attacker.id, attackerVehicle, 2002);
  assert.equal(attackerStatus.speed, vehicleType.speed + 5);
  assert.equal(attackerStatus.turbo, true);
  assert.ok(Math.abs(attackerStatus.offenseBonusFactor - 0.3) < 1e-12);
  assert.equal(attackerStatus.binoculars, true);

  const report = store.battleReport(attacker.id, journey.battleId);
  const attackerSide = report.details.vehicleIds.indexOf(attackerVehicle);
  const defenderSide = report.details.vehicleIds.indexOf(defenderVehicle);
  assert.equal(report.details.starting[attackerSide].armor,
    vehicleType.land.armor + 10 * 0.5);
  assert.ok(Math.abs(report.details.starting[attackerSide].offense
    - offensiveWeapon.offense * 1.3) < 1e-12);
  assert.equal(report.details.starting[defenderSide].defense, defensiveWeapon.defense * 1.1);
  assert.ok(attackerStatus.events.some((event) =>
    event.battleId === journey.battleId && event.otherVehicleId === defenderVehicle));
  assert.ok(store.vehicleDetails(defender.id, defenderVehicle, 2002).events.some((event) =>
    event.battleId === journey.battleId && event.otherVehicleId === null));
});

test('pillages cargo, then oil, then one stealable fitting in the original order', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  store.database.prepare(`
    UPDATE catalog_settings SET value_json = '0' WHERE key = 'ghost_rise_chance'
  `).run();
  const robberType = catalog.vehicles.find((vehicle) => vehicle.routeType === 0
    && vehicle.land?.attack > 0 && vehicle.land?.armor > 0
    && catalog.byId.get(vehicle.itemId).rarity >= 4 && vehicle.capacity >= 10
    && catalog.routes.some((route) => route.open && route.type === 0
      && route.city1Id !== route.city2Id && (route.city1Id === 1 || route.city2Id === 1)));
  const robberClass = catalog.byId.get(robberType.itemId).rarity >= 4 ? 4 : 2;
  const traderType = catalog.vehicles.find((vehicle) => vehicle.routeType === 0
    && vehicle.land?.attack === 0 && vehicle.land?.armor > 0
    && (catalog.byId.get(vehicle.itemId).rarity >= 4 ? 4 : 2) === robberClass
    && vehicle.speed <= robberType.speed);
  const offensiveWeapon = catalog.weapons.find((entry) =>
    catalog.byId.get(entry.itemId)?.rarity === 1 && entry.offense > 0);
  const defensiveWeapon = catalog.weapons.find((entry) =>
    catalog.byId.get(entry.itemId)?.rarity === 1 && entry.defense > 0);
  const ordinaryCargo = catalog.items.find((item) => item.rarity === 4
    && !catalog.vehicleByItemId.has(item.id) && !catalog.weaponByItemId.has(item.id)
    && !catalog.modByItemId.has(item.id));
  assert.ok(robberType && traderType && offensiveWeapon && defensiveWeapon && ordinaryCargo);

  const highwayman = store.addPlayer(createPlayer('Ordered Pillager', '', 'hash', catalog, 1000, () => 0.5));
  const trader = store.addPlayer(createPlayer('Ordered Victim', '', 'hash', catalog, 1000, () => 0.5));
  highwayman.profession = 2;
  trader.profession = 1;
  highwayman.inventory[robberType.itemId] = 1;
  highwayman.inventory[offensiveWeapon.itemId] = 5;
  trader.inventory[traderType.itemId] = 1;
  trader.inventory[defensiveWeapon.itemId] = 1;
  store.savePlayer(highwayman);
  store.savePlayer(trader);
  const robberVehicle = store.activateVehicle(highwayman.id, robberType.itemId);
  const traderVehicle = store.activateVehicle(trader.id, traderType.itemId);
  store.fitVehicleWeapons(highwayman.id, robberVehicle, Array(5).fill(offensiveWeapon.id));
  store.fitVehicleWeapons(trader.id, traderVehicle, [defensiveWeapon.id]);

  const sendEncounter = (time) => {
    const route = store.routesForVehicle(trader.id, traderVehicle, time)[0];
    const victimTrip = store.sendVehicle(trader.id, traderVehicle, route.id, time);
    const robberTrip = store.sendVehicle(highwayman.id, robberVehicle, route.id, time, {
      aggressiveMask: 1 << catalog.byId.get(traderType.itemId).rarity
    });
    robberTrip.battleId = resolveNextVehicleEncounter(store).battle_id;
    assert.equal(store.battleReport(highwayman.id, robberTrip.battleId).won, true);
    return store.database.prepare(
      'SELECT MAX(arrives_at) AS arrives_at FROM player_vehicles WHERE id IN (?, ?)'
    ).get(traderVehicle, robberVehicle).arrives_at + 1;
  };

  store.database.prepare('UPDATE player_vehicles SET oiled_trips = 20 WHERE id IN (?, ?)')
    .run(traderVehicle, robberVehicle);
  let nextTime = sendEncounter(2000);
  let robber = store.vehicleDetails(highwayman.id, robberVehicle, 2001);
  assert.equal(robber.oiledTrips, 24);
  assert.equal(robber.tripsStolen, 5);
  assert.equal(store.vehicleDetails(trader.id, traderVehicle, 2001).oiledTrips, 14);

  store.vehiclesForPlayer(highwayman.id, nextTime);
  store.vehiclesForPlayer(trader.id, nextTime);
  store.database.prepare('UPDATE player_vehicles SET oiled_trips = 0 WHERE id = ?').run(traderVehicle);
  const secondStart = nextTime + 1;
  const secondArrival = sendEncounter(secondStart);
  robber = store.vehicleDetails(highwayman.id, robberVehicle, secondStart + 1);
  assert.ok(robber.cargo.some((entry) => entry.itemId === defensiveWeapon.itemId));
  assert.equal(store.vehicleDetails(trader.id, traderVehicle, secondStart + 1).weapons.length, 0);
  assert.equal(store.database.prepare(
    'SELECT journey_disarmed FROM player_vehicles WHERE id = ?'
  ).get(traderVehicle).journey_disarmed, 1,
  'losing a fitting prevents that vehicle from starting another fight this journey');

  nextTime = secondArrival;
  store.vehiclesForPlayer(highwayman.id, nextTime);
  store.vehiclesForPlayer(trader.id, nextTime);
  assert.equal(store.database.prepare(
    'SELECT journey_disarmed FROM player_vehicles WHERE id = ?'
  ).get(traderVehicle).journey_disarmed, 0, 'the disarm flag expires in port');
  const traderCity = store.vehicleDetails(trader.id, traderVehicle, nextTime).cityId;
  store.database.prepare(`
    INSERT INTO inventory (player_id, city_id, item_id, quantity) VALUES (?, ?, ?, 3)
    ON CONFLICT(player_id, city_id, item_id) DO UPDATE SET quantity = quantity + 3
  `).run(trader.id, traderCity, ordinaryCargo.id);
  store.setVehicleCargo(trader.id, traderVehicle, { [ordinaryCargo.id]: 3 });
  sendEncounter(nextTime + 1);
  robber = store.vehicleDetails(highwayman.id, robberVehicle, nextTime + 2);
  assert.equal(robber.cargo.find((entry) => entry.itemId === ordinaryCargo.id)?.quantity, 3);
  assert.equal(store.vehicleDetails(trader.id, traderVehicle, nextTime + 2).cargoSize, 0);
  const winnerReports = store.recentMessages(highwayman.id, 'all', 'Vehicle')
    .filter((message) => message.details.event === 'pillage');
  const loserReports = store.recentMessages(trader.id, 'all', 'Vehicle')
    .filter((message) => message.details.event === 'pillage');
  assert.equal(winnerReports.length, 3);
  assert.equal(loserReports.length, 3);
  assert.deepEqual(new Set(winnerReports.map((message) => message.details.kind)),
    new Set(['oil', 'weapon', 'cargo']));
  assert.ok(winnerReports.every((message) => message.details.outcome === 'won'
    && message.actionLinks.some((action) => action.href.startsWith('/battles/'))));
  assert.ok(loserReports.every((message) => message.details.outcome === 'lost'));
});

test('lets all six Dwarf rarities find city items after a random 0–7 minute delay with a 5% disappearance risk', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const player = createPlayer('Dwarf Miner', '', 'hash', catalog, 1000, () => 0.5);
  for (const tier of catalog.dwarfTiers) player.inventory[tier.itemId] = 1;
  const saved = store.addPlayer(player);
  const before = Object.values(saved.inventory).reduce((sum, quantity) => sum + quantity, 0);
  store.database.prepare(`
    UPDATE dwarf_state
    SET next_find_at = 2000, next_competition_at = 9999999999, next_stowaway_at = 9999999999
    WHERE id = 1
  `).run();

  const findingRevision = store.latestLiveUpdateId();
  const update = store.runDwarfUpdate(2000, () => 0.5);
  assert.equal(update.finds, 6);
  const findingEvents = store.liveUpdatesAfter(findingRevision).filter((event) =>
    event.scope === `player:${saved.id}` && event.eventType === 'items-found'
      && event.payload.source === 'dwarf');
  assert.equal(findingEvents.reduce((sum, event) => sum + event.payload.quantity, 0), 6);
  assert.equal(update.disappeared, 0);
  assert.equal(update.nextFindAt, 212001);
  let restored = store.playerById(saved.id, 2000);
  assert.equal(Object.values(restored.inventory).reduce((sum, quantity) => sum + quantity, 0), before + 6);
  const dwarfStatus = store.dwarfStatus(saved.id);
  assert.deepEqual(dwarfStatus.dwarves.map((dwarf) => dwarf.rarity), [6, 5, 4, 3, 2, 1]);
  assert.deepEqual(dwarfStatus.dwarves.map((dwarf) => dwarf.disappearanceChance),
    [0.05, 0.05, 0.05, 0.05, 0.05, 0.05]);
  assert.equal(dwarfStatus.findings.length, 6);
  assert.ok(dwarfStatus.findings.every((finding) =>
    finding.cityId === saved.cityId && finding.cityName === `Tzolk'in`));
  assert.deepEqual(dwarfStatus.findings.map((finding) => finding.rarity),
    [...dwarfStatus.findings.map((finding) => finding.rarity)].sort((first, second) => second - first));
  const dwarfFinds = restored.discoveries.filter((finding) => finding.dwarfed);
  assert.equal(dwarfFinds.length, 6);
  assert.ok(dwarfFinds.every((finding) => finding.cityId === saved.cityId));
  const cityMineTypes = new Set(catalog.cityMineTypes
    .filter((entry) => entry.cityId === saved.cityId).map((entry) => entry.mineTypeId));
  assert.ok(dwarfFinds.every((finding) => {
    const item = catalog.byId.get(finding.itemId);
    return item.rarity >= 1 && cityMineTypes.has(item.mineTypeId);
  }));

  store.database.prepare('UPDATE dwarf_state SET next_find_at = 3000 WHERE id = 1').run();
  const disappearance = store.runDwarfUpdate(3000, () => 0);
  assert.equal(disappearance.disappeared, 6);
  assert.equal(disappearance.nextFindAt, 3001);
  restored = store.playerById(saved.id, 3000);
  assert.ok(catalog.dwarfTiers.every((tier) => (restored.inventory[tier.itemId] ?? 0) === 0));
  assert.ok(store.stonesForPlayer(saved.id).earned.some((stone) => stone.name === 'Exploited'));
});

test('schedules Dwarf cycles across the complete 0–7 minute range', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  store.database.prepare(`
    UPDATE dwarf_state
    SET next_find_at = 2000, next_competition_at = 9999999999, next_stowaway_at = 9999999999
    WHERE id = 1
  `).run();

  const maximum = store.runDwarfUpdate(2000, () => 1 - Number.EPSILON);
  assert.equal(maximum.nextFindAt, 2000 + 7 * 60 * 1000);
  store.database.prepare('UPDATE dwarf_state SET next_find_at = 3000 WHERE id = 1').run();
  const immediate = store.runDwarfUpdate(3000, () => 0);
  assert.equal(immediate.nextFindAt, 3001);
});

test('uses each live database Dwarf rarity range when finding items', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const players = catalog.dwarfTiers.map((tier) => {
    const player = createPlayer(`Tier ${tier.rarity} Dwarf Miner`, '', 'hash', catalog, 1000, () => 0.5);
    player.inventory[tier.itemId] = 1;
    return { tier, player: store.addPlayer(player) };
  });
  store.database.prepare(`
    UPDATE catalog_dwarf_tiers
    SET minimum_find_rarity = 6, maximum_find_rarity = 6 WHERE rarity = 1
  `).run();
  store.database.prepare(`
    UPDATE dwarf_state
    SET next_find_at = 2000, next_competition_at = 9999999999, next_stowaway_at = 9999999999
    WHERE id = 1
  `).run();

  const update = store.runDwarfUpdate(2000, () => 0.5);
  assert.equal(update.finds, catalog.dwarfTiers.length);
  for (const { tier, player } of players) {
    const findings = store.playerById(player.id, 2000).discoveries.filter((finding) => finding.dwarfed);
    assert.equal(findings.length, 1);
    const item = catalog.byId.get(findings[0].itemId);
    const liveRange = store.database.prepare(`
      SELECT minimum_find_rarity AS minimum, maximum_find_rarity AS maximum
      FROM catalog_dwarf_tiers WHERE rarity = ?
    `).get(tier.rarity);
    assert.ok(item.rarity <= liveRange.maximum && item.rarity >= liveRange.minimum,
      `${tier.name} found rarity ${item.rarity}`);
    assert.ok(catalog.cityMineTypes.some((entry) =>
      entry.cityId === findings[0].cityId && entry.mineTypeId === item.mineTypeId));
  }
});

test('retires Dwarf trash competitions without affecting Dwarf work', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const first = store.addPlayer(createPlayer('First Pile', '', 'hash', catalog, 1000, () => 0.5));
  store.database.prepare(`
    UPDATE dwarf_state
    SET next_find_at = 9999999999, next_competition_at = 1000, next_stowaway_at = 9999999999
    WHERE id = 1
  `).run();
  store.runDwarfUpdate(1000, () => 0);
  const update = store.runDwarfUpdate(1000, () => 0);
  assert.equal(update.competitionId, undefined);
  assert.equal(store.dwarfStatus(first.id).competition, undefined);
  assert.equal(store.database.prepare(
    'SELECT COUNT(*) AS count FROM dwarf_competitions WHERE stopped_at IS NULL'
  ).get().count, 0);
});

test('attaches matching Dwarf stowaways to traders and lets uncaptured stowaways escape at arrival', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const vehicleType = catalog.vehicles.find((vehicle) => vehicle.routeType === 0 && vehicle.capacity > 0
    && catalog.byId.get(vehicle.itemId)?.rarity > 1
    && catalog.routes.some((route) => route.open && route.type === 0
      && route.city1Id !== route.city2Id && (route.city1Id === 1 || route.city2Id === 1)));
  assert.ok(vehicleType);
  const vehicleRarity = catalog.byId.get(vehicleType.itemId).rarity;
  const dwarfRarity = vehicleRarity;
  const dwarfItemId = catalog.dwarfTiers.find((tier) => tier.rarity === dwarfRarity).itemId;
  const player = createPlayer('Stowaway Host', '', 'hash', catalog, 1000, () => 0.5);
  player.profession = 1;
  player.inventory[vehicleType.itemId] = 1;
  const saved = store.addPlayer(player);
  const stowawayId = Number(store.database.prepare(`
    INSERT INTO dwarf_stowaways (rarity, status, created_at) VALUES (?, 'waiting', 1500)
  `).run(dwarfRarity).lastInsertRowid);
  const vehicleId = store.activateVehicle(saved.id, vehicleType.itemId);
  const route = store.routesForVehicle(saved.id, vehicleId, 2000)[0];
  const trip = store.sendVehicle(saved.id, vehicleId, route.id, 2000);
  assert.equal(trip.stowawayId, stowawayId);
  assert.equal(store.vehicleDetails(saved.id, vehicleId, 2001).cargo
    .find((item) => item.itemId === dwarfItemId)?.quantity, 1);

  store.vehicleDetails(saved.id, vehicleId, trip.arrivesAt + 1);
  const stowaway = store.database.prepare('SELECT * FROM dwarf_stowaways WHERE id = ?').get(stowawayId);
  assert.equal(stowaway.status, 'escaped');
  assert.equal(store.playerById(saved.id).inventoryByCity[trip.destinationCityId]?.[dwarfItemId] ?? 0, 0);
});

test('keeps a pillaged Dwarf stowaway with its captor at arrival', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  store.database.prepare(
    "UPDATE catalog_settings SET value_json = '0' WHERE key = 'ghost_rise_chance'"
  ).run();
  const robberType = catalog.vehicles.find((vehicle) => vehicle.routeType === 0
    && vehicle.land?.attack > 0 && vehicle.land?.armor > 0
    && catalog.byId.get(vehicle.itemId).rarity >= 4 && vehicle.capacity >= 10
    && catalog.routes.some((route) => route.open && route.type === 0
      && route.city1Id !== route.city2Id && (route.city1Id === 1 || route.city2Id === 1)));
  const traderType = catalog.vehicles.find((vehicle) => vehicle.routeType === 0
    && vehicle.land?.attack === 0 && vehicle.land?.armor > 0 && vehicle.capacity > 0
    && catalog.byId.get(vehicle.itemId).rarity >= 4 && vehicle.speed <= robberType.speed);
  const weapon = catalog.weapons.find((entry) =>
    catalog.byId.get(entry.itemId)?.rarity === 1 && entry.offense > 0);
  assert.ok(robberType && traderType && weapon);
  const robber = createPlayer('Dwarf Captor', '', 'hash', catalog, 1000, () => 0.5);
  const host = createPlayer('Dwarf Host', '', 'hash', catalog, 1000, () => 0.5);
  robber.profession = 2;
  host.profession = 1;
  robber.inventory[robberType.itemId] = 1;
  robber.inventory[weapon.itemId] = 5;
  host.inventory[traderType.itemId] = 1;
  const savedRobber = store.addPlayer(robber);
  const savedHost = store.addPlayer(host);
  const robberVehicle = store.activateVehicle(savedRobber.id, robberType.itemId);
  const hostVehicle = store.activateVehicle(savedHost.id, traderType.itemId);
  store.fitVehicleWeapons(savedRobber.id, robberVehicle, Array(5).fill(weapon.id));
  const stowawayId = Number(store.database.prepare(`
    INSERT INTO dwarf_stowaways (rarity, status, created_at) VALUES (4, 'waiting', 1500)
  `).run().lastInsertRowid);
  const route = store.routesForVehicle(savedHost.id, hostVehicle, 2000)[0];
  const hostTrip = store.sendVehicle(savedHost.id, hostVehicle, route.id, 2000);
  assert.equal(hostTrip.stowawayId, stowawayId);
  const robberTrip = store.sendVehicle(savedRobber.id, robberVehicle, route.id, 2000, {
    aggressiveMask: 1 << catalog.byId.get(traderType.itemId).rarity
  });
  robberTrip.battleId = resolveNextVehicleEncounter(store).battle_id;
  assert.equal(store.battleReport(savedRobber.id, robberTrip.battleId).won, true);
  let stowaway = store.database.prepare('SELECT * FROM dwarf_stowaways WHERE id = ?').get(stowawayId);
  assert.equal(stowaway.status, 'captured');
  assert.equal(stowaway.vehicle_id, robberVehicle);
  assert.equal(stowaway.captor_player_id, savedRobber.id);

  const robberArrival = store.database.prepare(
    'SELECT arrives_at FROM player_vehicles WHERE id = ?'
  ).get(robberVehicle).arrives_at;
  store.vehicleDetails(savedRobber.id, robberVehicle, robberArrival + 1);
  stowaway = store.database.prepare('SELECT * FROM dwarf_stowaways WHERE id = ?').get(stowawayId);
  assert.equal(stowaway.status, 'arrived');
  assert.equal(store.playerById(savedRobber.id).inventoryByCity[robberTrip.destinationCityId][1073], 1);
});

test('drowns Dwarves with a sinking ship instead of adding them to salvage', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const shipType = catalog.vehicles.find((vehicle) => vehicle.routeType === 1 && vehicle.capacity > 0
    && catalog.byId.get(vehicle.itemId)?.rarity >= 4
    && catalog.routes.some((route) => route.open && route.type === 1
      && route.city1Id !== route.city2Id && (route.city1Id === 1 || route.city2Id === 1)));
  assert.ok(shipType);
  const host = createPlayer('Drowning Host', '', 'hash', catalog, 1000, () => 0.5);
  const pirate = createPlayer('Drowning Pirate', '', 'hash', catalog, 1000, () => 0.5);
  host.profession = 4;
  pirate.profession = 5;
  host.inventory[shipType.itemId] = 1;
  pirate.inventory[shipType.itemId] = 1;
  const savedHost = store.addPlayer(host);
  const savedPirate = store.addPlayer(pirate);
  const hostShip = store.activateVehicle(savedHost.id, shipType.itemId);
  const pirateShip = store.activateVehicle(savedPirate.id, shipType.itemId);
  const stowawayId = Number(store.database.prepare(`
    INSERT INTO dwarf_stowaways (rarity, status, created_at) VALUES (4, 'waiting', 1500)
  `).run().lastInsertRowid);
  const route = store.routesForVehicle(savedHost.id, hostShip, 2000)[0];
  const hostTrip = store.sendVehicle(savedHost.id, hostShip, route.id, 2000);
  assert.equal(hostTrip.stowawayId, stowawayId);
  store.database.prepare('UPDATE player_ship_state SET hull = 0 WHERE vehicle_id = ?').run(hostShip);
  const pirateTrip = store.sendVehicle(savedPirate.id, pirateShip, route.id, 2000, {
    aggressiveMask: 1 << catalog.byId.get(shipType.itemId).rarity
  });
  pirateTrip.battleId = resolveNextVehicleEncounter(store).battle_id;
  assert.equal(store.database.prepare(
    'SELECT status FROM dwarf_stowaways WHERE id = ?'
  ).get(stowawayId).status, 'drowned');
  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count FROM sunken_items
    WHERE route_id = ? AND source_vehicle_id = ? AND item_id = 1073
  `).get(route.id, hostShip).count, 0);
});

test('preserves Crane-stolen barrels when replacing it with a packing machine', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const crane = oilMachine('crane', 6);
  const pad = oilMachine('pad', 2);
  const oil = catalog.items.find((item) => item.name === 'Oil');
  const pilot = addOilPlayer(store, 'Crane Barrel Pilot', new Map([
    [catalog.byId.get(crane.itemId), 1],
    [catalog.byId.get(pad.itemId), 1]
  ]));
  const hex = fieldHex(store.oilField(pilot.id, 1000), 0, 0);
  store.deployOilMachine(pilot.id, hex.id, crane.id, 0, 1000);
  store.database.prepare('UPDATE oil_hexes SET barrels = 3 WHERE id = ?').run(hex.id);

  assert.throws(() => store.claimOilBarrel(pilot.id, hex.id, 1001), /packing machine/);
  store.deployOilMachine(pilot.id, hex.id, pad.id, 0, 1002);
  for (let index = 0; index < 3; index += 1) {
    store.claimOilBarrel(pilot.id, hex.id, 1003 + index);
  }

  assert.equal(store.database.prepare('SELECT barrels FROM oil_hexes WHERE id = ?').get(hex.id).barrels, 0);
  assert.equal(store.playerById(pilot.id, 1006).inventoryByCity[2][oil.id], 3);
});

test('grants registered miners a yellow exploration vehicle and five ASO coins', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const playerState = createPlayer(
    'Welcome Miner', 'welcome@example.test', 'hash', catalog, 1000, () => 0.5
  );
  const initialVehicleCount = Number(
    playerState.inventory[LEGACY_STARTER_WELCOME_PACK.vehicleItemId] ?? 0
  );
  const player = store.addPlayer(playerState, {
    version: '2026-08-28', acceptedAt: 1000
  });
  const registered = store.playerById(player.id);

  assert.equal(registered.inventory[LEGACY_STARTER_WELCOME_PACK.vehicleItemId],
    initialVehicleCount + 1);
  assert.equal(registered.cryptoBalances[LEGACY_STARTER_WELCOME_PACK.cryptoTypeId], 5);
  const vehicleId = store.activateVehicle(
    player.id, LEGACY_STARTER_WELCOME_PACK.vehicleItemId
  );
  assert.ok(store.routesForVehicle(player.id, vehicleId, 1001).length > 0);
});

test('requires single-use email verification and invalidates links after an address change', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const player = store.addPlayer(createPlayer(
    'Email Gate', 'Miner@Example.test', 'hash', catalog, 1000, () => 0.5
  ), { version: '2026-08-23', acceptedAt: 1000 });
  assert.equal(player.email, 'Miner@Example.test');
  assert.equal(store.isEmailVerified(player.id), false);
  assert.equal(store.emailInUse('miner@example.test'), true);

  const firstHash = 'a'.repeat(64);
  const first = store.issueEmailVerification(player.id, firstHash, 1100);
  assert.equal(first.email, 'miner@example.test');
  assert.equal(first.expiresAt, 1100 + 24 * 60 * 60 * 1000);
  store.recordEmailVerificationDelivery(first.id, '', 1101);
  assert.equal(store.emailVerificationStatus(player.id, 1102).canResendAt, 61101);
  assert.throws(() => store.issueEmailVerification(player.id, 'b'.repeat(64), 1200),
    /Wait 60 seconds/);

  const secondHash = 'c'.repeat(64);
  const second = store.issueEmailVerification(player.id, secondHash, 61101);
  store.recordEmailVerificationDelivery(second.id, '', 61102);
  assert.equal(store.previewEmailVerification(firstHash, 61103), null);
  assert.equal(store.previewEmailVerification(secondHash, 61103).minerName, 'Email Gate');
  const verified = store.verifyEmailToken(secondHash, 61104);
  assert.equal(verified.email, 'miner@example.test');
  assert.equal(store.isEmailVerified(player.id), true);
  assert.throws(() => store.verifyEmailToken(secondHash, 61105), /invalid, expired, or.*used/);

  assert.equal(store.changePlayerEmail(player.id, 'replacement@example.test', 62000).changed, true);
  assert.equal(store.isEmailVerified(player.id), false);
  assert.equal(store.playerById(player.id).email, 'replacement@example.test');
  const expiredHash = 'd'.repeat(64);
  const expired = store.issueEmailVerification(player.id, expiredHash, 62001);
  assert.equal(store.previewEmailVerification(expiredHash, expired.expiresAt), null);
  assert.throws(() => store.verifyEmailToken(expiredHash, expired.expiresAt), /invalid, expired/);
});

test('records credit purchases idempotently and reverses the granted bundle once', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const player = store.addPlayer(createPlayer(
    'Credit Ledger', '', 'hash', catalog, 1000, () => 0.5
  ), { version: '2026-08-22', acceptedAt: 1000 });
  const bundles = store.creditBundles();
  assert.equal(store.database.prepare(
    "SELECT COUNT(*) AS count FROM legal_acceptances WHERE context = 'registration'"
  ).get().count, 1);
  assert.deepEqual(bundles.map((bundle) => [bundle.credits, bundle.amountMinor]),
    [[100, 199], [300, 499], [700, 999]]);

  const purchase = store.createCreditPurchase(player.id, bundles[0].id, {
    termsVersion: '2026-08-22', sellerName: 'Seller',
    sellerAddress: '1 Test Street', sellerEmail: 'seller@example.test'
  }, 2000);
  assert.equal(store.database.prepare(
    "SELECT COUNT(*) AS count FROM legal_acceptances WHERE context = 'credit-purchase'"
  ).get().count, 1);
  store.setCreditPurchaseOrder(purchase.id, player.id, 'ORDER-1', 2001);
  store.completeCreditPurchase(purchase.id, 'CAPTURE-1', 2002);
  store.completeCreditPurchase(purchase.id, 'CAPTURE-1', 2003);
  assert.equal(store.playerById(player.id).credits, player.credits + 100);
  assert.equal(store.database.prepare(
    "SELECT COUNT(*) AS count FROM credit_ledger WHERE kind = 'purchase'"
  ).get().count, 1);

  store.database.prepare('UPDATE players SET credits = 10 WHERE id = ?').run(player.id);
  store.reverseCreditPurchase(purchase.id, 'refund', 3000);
  store.reverseCreditPurchase(purchase.id, 'reversal', 3001);
  assert.equal(store.playerById(player.id).credits, -90);
  assert.equal(store.database.prepare(
    "SELECT COUNT(*) AS count FROM credit_ledger WHERE kind IN ('refund', 'reversal')"
  ).get().count, 1);
  assert.equal(store.creditPurchase(purchase.id).status, 'refunded');
  const delayed = store.createCreditPurchase(player.id, bundles[1].id, {
    termsVersion: '2026-08-22', sellerName: 'Seller',
    sellerAddress: '1 Test Street', sellerEmail: 'seller@example.test'
  }, 4000);
  store.setCreditPurchaseStatus(delayed.id, 'pending', 4001);
  store.setCreditPurchaseStatus(delayed.id, 'pending', 4002);
  store.setCreditPurchaseStatus(delayed.id, 'denied', 4003, 'PayPal denied the capture.');
  const messages = store.recentMessages(player.id, 'all', 'Admin');
  assert.deepEqual(messages.map((message) => message.details.event).sort(),
    ['credit-purchase-completed', 'credit-purchase-reversed',
      'credit-purchase-status', 'credit-purchase-status']);
  assert.equal(messages.filter((message) =>
    message.details.purchaseId === delayed.id && message.details.status === 'pending').length, 1);
  assert.ok(messages.every((message) => message.actionLinks.some((action) =>
    action.href === `/credits/receipts/${message.details.purchaseId}`)));
});

test('runs quarterly PvP seasons, awards scaled transport prizes, and resets ratings once', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const winners = Array.from({ length: 5 }, (_, index) => store.addPlayer(createPlayer(
    `Season Winner ${index + 1}`, '', 'hash', catalog, 1000 + index, () => 0.5
  )));
  const opponent = store.addPlayer(createPlayer(
    'Season Opponent', '', 'hash', catalog, 2000, () => 0.5
  ));
  const land = catalog.settings.route_type_ids.land;
  const sea = catalog.settings.route_type_ids.sea;
  const insertBattle = ({ at, routeType, combatClass, winner, loser, sequence, rating }) => {
    const winnerVehicleId = 10000 + sequence * 2;
    const loserVehicleId = winnerVehicleId + 1;
    const battle = store.database.prepare(`
      INSERT INTO vehicle_battles
        (route_id, route_type, combat_class, winner_vehicle_id, is_tie,
         details_json, created_at)
      VALUES (1, ?, ?, ?, 0, '{}', ?)
    `).run(routeType, combatClass, winnerVehicleId, at);
    const battleId = Number(battle.lastInsertRowid);
    const side = store.database.prepare(`
      INSERT INTO vehicle_battle_sides
        (battle_id, vehicle_id, vehicle_item_id, player_id, opponent_vehicle_id,
         aggressive, won, rating_before, rating_after)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)
    `);
    side.run(battleId, winnerVehicleId, 154, winner.id, loserVehicleId,
      1, rating - 10, rating);
    side.run(battleId, loserVehicleId, 155, loser.id, winnerVehicleId,
      0, 1600, 1590);
  };

  const q3Start = Date.UTC(2026, 6, 1);
  const q3End = Date.UTC(2026, 9, 1);
  store.ensureCombatSeason(q3Start);
  winners.forEach((winner, index) => insertBattle({
    at: q3Start + (index + 1) * 1000,
    routeType: land,
    combatClass: 1,
    winner,
    loser: opponent,
    sequence: index + 1,
    rating: 1900 - index * 25
  }));
  const ratedVehicle = catalog.vehicles.find((vehicle) => vehicle.itemId === 154);
  store.database.prepare(`
    INSERT INTO player_vehicles
      (id, player_id, vehicle_type_id, item_id, city_id, name, rating)
    VALUES (10002, ?, ?, ?, ?, 'Live season leader', 1950)
  `).run(winners[0].id, ratedVehicle.id, ratedVehicle.itemId, winners[0].cityId);
  const automatic = store.addPlayer(createPlayer(
    'Automatic Entrant', '', 'hash', catalog, 2500, () => 0.5
  ));
  const ghostFleet = store.addPlayer(createPlayer(
    'Automatic Ghost Fleet', '', 'hash', catalog, 2600, () => 0.5
  ));
  store.database.prepare('UPDATE players SET is_npc = 1 WHERE id = ?').run(ghostFleet.id);
  const addAutomaticVehicle = store.database.prepare(`
    INSERT INTO player_vehicles
      (id, player_id, vehicle_type_id, item_id, city_id, rating)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  addAutomaticVehicle.run(15000, automatic.id, ratedVehicle.id,
    ratedVehicle.itemId, automatic.cityId, 1640);
  addAutomaticVehicle.run(15001, ghostFleet.id, ratedVehicle.id,
    ratedVehicle.itemId, ghostFleet.cityId, 1630);
  const standings = store.combatSeasonReport(Date.UTC(2026, 7, 25), 1);
  const landStandings = standings.ratings.find((group) => group.routeType === land).players;
  assert.deepEqual(landStandings.slice(0, winners.length).map((entry) => entry.name),
    winners.map((winner) => winner.name));
  const zeroWinOpponent = landStandings.find((entry) => entry.name === opponent.name);
  assert.equal(zeroWinOpponent.wins, 0,
    'a zero-win combatant participates automatically');
  assert.equal(zeroWinOpponent.battles, 5);
  const automaticStanding = landStandings.find((entry) => entry.name === automatic.name);
  assert.equal(automaticStanding.wins, 0);
  assert.equal(automaticStanding.battles, 0,
    'a current zero-battle vehicle participates automatically');
  const ghostStanding = landStandings.find((entry) => entry.name === ghostFleet.name);
  assert.equal(ghostStanding.isNpc, true);
  assert.equal(ghostStanding.battles, 0, 'an NPC or ghost fleet participates automatically');
  assert.equal(landStandings[0].rating,
    1950, 'live standings use the participating vehicle current rating');
  assert.equal(standings.season.startsAt, q3Start);
  assert.equal(standings.season.endsAt, q3End);

  const activeVehicle = ratedVehicle;
  store.database.prepare(`
    INSERT INTO player_vehicles
      (player_id, vehicle_type_id, item_id, city_id, rating)
    VALUES (?, ?, ?, ?, 2000)
  `).run(winners[0].id, activeVehicle.id, activeVehicle.itemId, winners[0].cityId);
  const q3Result = store.settleCombatSeasons(q3End);
  assert.equal(q3Result.seasonsFinalized, 1);
  assert.equal(q3Result.prizesAwarded, 5);
  const expectedLandPrizes = [1256, 219, 149, 1257, 151];
  winners.forEach((winner, index) => {
    assert.equal(store.playerById(winner.id).inventory[expectedLandPrizes[index]], 1);
  });
  assert.equal(store.database.prepare(
    'SELECT rating FROM player_vehicles WHERE player_id = ?'
  ).get(winners[0].id).rating, 1600);
  assert.equal(store.database.prepare(
    'SELECT COUNT(*) AS count FROM combat_season_results WHERE season_id = ?'
  ).get('2026-S3').count, 5);
  assert.equal(store.recentMessages(winners[0].id, 'all', 'Vehicle')
    .filter((message) => message.details.event === 'combat-season-prize').length, 1);
  assert.deepEqual(store.settleCombatSeasons(q3End), {
    current: { id: '2026-S4', startsAt: q3End, endsAt: Date.UTC(2027, 0, 1), number: 4, year: 2026 },
    seasonsFinalized: 0,
    prizesAwarded: 0
  });

  const q4BattleAt = Date.UTC(2026, 11, 15);
  insertBattle({
    at: q4BattleAt, routeType: land, combatClass: 4,
    winner: winners[0], loser: opponent, sequence: 20, rating: 1810
  });
  insertBattle({
    at: q4BattleAt + 1, routeType: sea, combatClass: 4,
    winner: winners[0], loser: opponent, sequence: 21, rating: 1820
  });
  const yearEnd = Date.UTC(2027, 0, 1);
  const q4Result = store.settleCombatSeasons(yearEnd);
  assert.equal(q4Result.seasonsFinalized, 1);
  assert.equal(q4Result.prizesAwarded, 4,
    'a zero-win participant with a resolved battle remains prize eligible');
  const championInventory = store.playerById(winners[0].id).inventory;
  assert.equal(championInventory[1403], 1, 'land Champion is awarded unfitted');
  assert.equal(championInventory[1402], 1, 'ship Champion is awarded unfitted');
  const opponentInventory = store.playerById(opponent.id).inventory;
  assert.equal(opponentInventory[222], 1, 'the second-place land prize is awarded');
  assert.equal(opponentInventory[300], 1, 'the second-place ship prize is awarded');
  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count FROM player_vehicles
    WHERE player_id = ? AND item_id IN (1402, 1403)
  `).get(winners[0].id).count, 0);
  const latest = store.combatSeasonPrizes();
  assert.equal(latest.latestSeason.id, '2026-S4');
  assert.deepEqual(latest.latestResults.map((result) => result.prizeItemId).sort(),
    [1402, 1403, 222, 300]);
});

test('settles casino pulls atomically in gold or crypto and preserves the machine ledger', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-casino-'));
  const databaseFile = path.join(directory, 'game.sqlite');
  let store = new SqliteStore(databaseFile);
  context.after(() => {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  store.seedCatalog(catalog);
  const player = store.addPlayer(createPlayer(
    'Lucky Shift', '', 'hash', catalog, 1000, () => 0.5
  ));
  store.database.prepare('UPDATE players SET gold_units = ? WHERE id = ?')
    .run(100 * 10000, player.id);
  store.database.prepare(`
    INSERT INTO player_crypto_balances (player_id, crypto_type_id, quantity)
    VALUES (?, 1, 50)
  `).run(player.id);

  const sequence = (values) => () => {
    assert.ok(values.length, 'the spin should not request excess randomness');
    return values.shift();
  };
  const losingValues = [0.5, ...Array.from({ length: 9 }, (_, index) => (index + 0.1) / 12)];
  const loss = store.spinCasino(player.id, 'gold', 1, sequence(losingValues), 2000);
  assert.equal(loss.multiplier, 0);
  assert.equal(loss.payout, 0);
  assert.equal(store.casinoState(player.id).gold, 99);

  const win = store.spinCasino(
    player.id, 'gold', 2, sequence([0.5, ...Array(9).fill(0)]), 3000
  );
  assert.equal(win.multiplier, 16);
  assert.equal(win.wager, 2);
  assert.equal(win.payout, 32);
  assert.equal(win.wins.length, 8);
  assert.equal(store.casinoState(player.id).gold, 129);

  const bonusValues = [
    0.5, 0.98, ...Array(8).fill(0.01),
    0.5, ...Array(9).fill(0.01)
  ];
  const bonusSpin = store.spinCasino(
    player.id, 'gold', 1, sequence(bonusValues), 3500
  );
  assert.equal(bonusSpin.bonusSpinsAwarded, 1);
  assert.equal(bonusSpin.frames.length, 2);
  assert.equal(bonusSpin.bonusSymbols[0].name, 'Shift Bell');
  assert.equal(bonusSpin.multiplier, 26);
  assert.equal(bonusSpin.payout, 26);
  assert.equal(store.casinoState(player.id).gold, 154);

  const cryptoWin = store.spinCasino(
    player.id, 'crypto:1', 2, sequence([0.5, ...Array(9).fill(0)]), 4000
  );
  assert.equal(cryptoWin.currencySymbol, 'ASO');
  assert.equal(cryptoWin.payout, 32);
  const remembered = store.casinoState(player.id);
  assert.equal(remembered.currencies.find((coin) => coin.id === 1).quantity, 80);
  assert.deepEqual(remembered.lastBet, { currency: 'crypto:1', wager: 2 });

  const beforeRejected = store.database.prepare(
    'SELECT COUNT(*) AS count FROM casino_spins WHERE player_id = ?'
  ).get(player.id).count;
  assert.throws(() => store.spinCasino(player.id, 'crypto:1', 1000, () => 0.5, 5000),
    /enough crypto/);
  assert.equal(store.database.prepare(
    'SELECT COUNT(*) AS count FROM casino_spins WHERE player_id = ?'
  ).get(player.id).count, beforeRejected);
  assert.equal(store.casinoState(player.id).currencies.find((coin) => coin.id === 1).quantity, 80);

  store.close();
  store = new SqliteStore(databaseFile);
  const reopened = store.casinoState(player.id, bonusSpin.id);
  assert.equal(reopened.recentSpins.length, 4);
  assert.equal(reopened.selectedSpin.grid[0].name, 'Bolt');
  assert.equal(reopened.selectedSpin.wins.length, 13);
  assert.equal(reopened.selectedSpin.frames.length, 2);
  assert.equal(reopened.selectedSpin.bonusSpinsAwarded, 1);
  assert.equal(reopened.selectedSpin.bonusSymbols[0].name, 'Shift Bell');
  assert.deepEqual(reopened.lastBet, { currency: 'crypto:1', wager: 2 });
  assert.ok(store.database.prepare(
    "SELECT 1 FROM schema_migrations WHERE name = 'casino-slot-v1'"
  ).get());
  assert.ok(store.database.prepare(
    "SELECT 1 FROM schema_migrations WHERE name = 'casino-explosive-scatters-v2'"
  ).get());
  assert.ok(store.database.prepare(
    "SELECT 1 FROM schema_migrations WHERE name = 'casino-bonus-respins-v3'"
  ).get());
});
