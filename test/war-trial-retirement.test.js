import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createPlayer } from '../src/game.js';
import { loadLegacyCatalog } from '../src/legacy-catalog.js';
import { SqliteStore } from '../src/store.js';

const catalog = loadLegacyCatalog();

test('retires live War Trial fixtures while preserving ordinary craft and history', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-war-trial-'));
  const databaseFile = path.join(directory, 'game.sqlite');
  let store = new SqliteStore(databaseFile);
  context.after(() => {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  store.seedCatalog(catalog);
  const player = store.addPlayer(createPlayer(
    'Trial Retirement', '', 'hash', catalog, 1000, () => 0.5
  ));
  const land = catalog.vehicles.find((vehicle) => vehicle.routeType === 0);
  const route = catalog.routes.find((entry) => entry.type === 0);
  assert.ok(land && route);
  const insertVehicle = store.database.prepare(`
    INSERT INTO player_vehicles
      (player_id, vehicle_type_id, item_id, city_id, name, rating)
    VALUES (?, ?, ?, ?, ?, 1600)
  `);
  const trialVehicleId = Number(insertVehicle.run(
    player.id, land.id, land.itemId, player.cityId, 'War Trial W8 42'
  ).lastInsertRowid);
  const ordinaryVehicleId = Number(insertVehicle.run(
    player.id, land.id, land.itemId, player.cityId, 'Useful Cart'
  ).lastInsertRowid);
  const ghostVehicleId = Number(insertVehicle.run(
    player.id, land.id, land.itemId, player.cityId, 'Wraith War Trial W8'
  ).lastInsertRowid);
  store.database.prepare(`
    INSERT INTO ghost_vehicles
      (vehicle_id, source_vehicle_id, source_player_id, source_item_id,
       source_vehicle_name, ghost_kind, route_id, rarity, risen_at, bounty_json)
    VALUES (?, ?, ?, ?, ?, 'rider', ?, 1, 1001, '[]')
  `).run(ghostVehicleId, trialVehicleId, player.id, land.itemId,
    'War Trial W8 42', route.id);
  store.database.prepare(`
    INSERT INTO ghost_vehicles
      (vehicle_id, source_vehicle_id, source_player_id, source_item_id,
       source_vehicle_name, ghost_kind, route_id, rarity, risen_at, defeated_at,
       bounty_json)
    VALUES (NULL, 999999, ?, ?, ?, 'rider', ?, 1, 900, 950, '[]')
  `).run(player.id, land.itemId, 'War Trial W7 9', route.id);
  store.database.prepare(`
    INSERT INTO dwarf_stowaways
      (rarity, item_id, vehicle_id, host_player_id, status, created_at, attached_at)
    VALUES (1, 1430, ?, ?, 'aboard', 900, 1000)
  `).run(trialVehicleId, player.id);
  store.database.prepare(`
    INSERT INTO vehicle_events
      (vehicle_id, player_id, event_type, route_id, details_json, created_at)
    VALUES (?, ?, 'arrived', ?, '{"historical":true}', 1100)
  `).run(trialVehicleId, player.id, route.id);
  store.database.exec('PRAGMA user_version = 117');
  store.close();

  store = new SqliteStore(databaseFile);
  assert.equal(store.database.prepare('PRAGMA user_version').get().user_version, 142);
  assert.equal(store.database.prepare(
    "SELECT COUNT(*) AS count FROM player_vehicles WHERE name LIKE 'War Trial %'"
  ).get().count, 0);
  assert.equal(store.database.prepare(
    'SELECT COUNT(*) AS count FROM player_vehicles WHERE id = ?'
  ).get(ghostVehicleId).count, 0);
  assert.equal(store.database.prepare(
    'SELECT COUNT(*) AS count FROM player_vehicles WHERE id = ?'
  ).get(ordinaryVehicleId).count, 1);
  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count FROM ghost_vehicles
    WHERE defeated_at IS NULL AND source_vehicle_name LIKE 'War Trial %'
  `).get().count, 0);
  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count FROM ghost_vehicles
    WHERE defeated_at IS NOT NULL AND source_vehicle_name = 'War Trial W7 9'
  `).get().count, 1);
  assert.deepEqual({ ...store.database.prepare(`
    SELECT item_id, vehicle_id, host_player_id, captor_player_id, status
    FROM dwarf_stowaways
  `).get() }, {
    item_id: null, vehicle_id: null, host_player_id: null,
    captor_player_id: null, status: 'waiting'
  });
  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count FROM vehicle_events
    WHERE vehicle_id = ? AND details_json = '{"historical":true}'
  `).get(trialVehicleId).count, 1);

  store.close();
  store = new SqliteStore(databaseFile);
  assert.equal(store.database.prepare(
    'SELECT COUNT(*) AS count FROM player_vehicles WHERE id = ?'
  ).get(ordinaryVehicleId).count, 1);
});
