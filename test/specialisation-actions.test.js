import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlayer } from '../src/game.js';
import { loadLegacyCatalog } from '../src/legacy-catalog.js';
import { SqliteStore } from '../src/store.js';

const catalog = loadLegacyCatalog();

function addMelds(store, playerId, count) {
  const insert = store.database.prepare(
    'INSERT INTO player_melds (player_id, meld_id, created_at) VALUES (?, ?, 1)'
  );
  for (const meld of catalog.melds.slice(0, count)) insert.run(playerId, meld.id);
}

test('lets every specialisation travel, order, fish, work, hire, manufacture, and operate the Oil Field', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);

  const land = catalog.vehicles.find((vehicle) => catalog.byId.get(vehicle.itemId)?.name === 'Donkey');
  const ship = catalog.vehicles.find((vehicle) => catalog.byId.get(vehicle.itemId)?.name === 'Outrigger');
  const aircraft = catalog.vehicles.find((vehicle) =>
    catalog.byId.get(vehicle.itemId)?.name === 'Search Plane');
  const bait = catalog.items.find((item) =>
    item.mineTypeId === 14 && item.rarity === 1 && !item.repairedItemId);
  const cargo = catalog.items.find((item) => item.mineTypeId === 1 && item.rarity === 1
    && !catalog.vehicleByItemId.has(item.id));
  const ore = catalog.items.find((item) => item.name === 'Ore Crate');
  const pump = catalog.machines.find((machine) =>
    machine.type === 'pump' && catalog.byId.get(machine.itemId)?.rarity === 1);
  const pad = catalog.machines.find((machine) =>
    machine.type === 'pad' && catalog.byId.get(machine.itemId)?.rarity === 1);
  const flower = catalog.machines.find((machine) => machine.type === 'flower');
  const bomber = catalog.items.find((item) => item.name === 'Bomber');
  const oil = catalog.items.find((item) => item.name === 'Oil');
  assert.ok(land && ship && aircraft && bait && cargo && ore && pump && pad && flower
    && bomber && oil);

  const employer = store.addPlayer(
    createPlayer('Matrix Employer', '', 'hash', catalog, 1000, () => 0.5)
  );
  const expectedLandDuration = Math.ceil(400 / land.speed * 60 * 60 * 1000);
  const expectedSeaDuration = Math.ceil(200 / ship.speed * 60 * 60 * 1000);
  const expectedAirDuration = Math.ceil(300 / aircraft.speed * 60 * 60 * 1000);

  for (const specialisation of catalog.specialisations) {
    const player = createPlayer(
      'Matrix ' + specialisation.id, '', 'hash', catalog, 1000, () => 0.5
    );
    player.profession = specialisation.id;
    player.inventory[land.itemId] = 1;
    player.inventory[ship.itemId] = 1;
    player.inventory[aircraft.itemId] = 1;
    player.inventory[bait.id] = 1;
    player.inventory[cargo.id] = (player.inventory[cargo.id] ?? 0) + 1;
    player.inventory[ore.id] = 25;
    player.inventoryByCity[2] = {
      [pump.itemId]: 1,
      [pad.itemId]: 1,
      [flower.itemId]: 1,
      [bomber.id]: 1
    };
    const saved = store.addPlayer(player);
    addMelds(store, saved.id, 50);

    const hireling = store.addPlayer(createPlayer(
      'Hire ' + specialisation.id, '', 'hash', catalog, 1000, () => 0.5
    ));
    addMelds(store, hireling.id, 10);
    assert.equal(store.hireWorker(saved.id, hireling.id, 1100).playerId, hireling.id);
    assert.equal(store.hireWorker(employer.id, saved.id, 1100).playerId, saved.id);

    const factory = store.buildFactory(saved.id, 1200);
    const assignedFactory = store.assignFactoryWorker(saved.id, factory.id, hireling.id, 1200);
    assert.ok(assignedFactory.workers.some((worker) => worker.playerId === hireling.id));
    const factoryRate = assignedFactory.rate;
    assert.equal(factoryRate, specialisation.id === 9 ? 1.2 : 1);
    const workerCph = store.database.prepare(
      'SELECT cph FROM workers WHERE player_id = ?'
    ).get(saved.id).cph;
    assert.equal(workerCph, specialisation.id === 8 ? 6 : 5);

    const landId = store.activateVehicle(saved.id, land.itemId);
    const shipId = store.activateVehicle(saved.id, ship.itemId);
    const aircraftId = store.activateVehicle(saved.id, aircraft.itemId);
    store.setVehicleCargo(saved.id, landId, { [cargo.id]: 1 });
    store.setVehicleCargo(saved.id, shipId, { [bait.id]: 1 });
    const landTrip = store.sendVehicle(saved.id, landId, 1, 2000, {
      travelOrder: 'pillage'
    });
    const seaTrip = store.sendVehicle(saved.id, shipId, 4, 2000, {
      travelOrder: 'patrol'
    });
    const airTrip = store.sendVehicle(saved.id, aircraftId, 8, 2000, {
      travelOrder: 'peaceful'
    });
    assert.equal(landTrip.duration, specialisation.id === 1
      ? Math.ceil(expectedLandDuration / 1.2) : expectedLandDuration);
    assert.equal(seaTrip.duration, specialisation.id === 4
      ? Math.ceil(expectedSeaDuration / 1.2) : expectedSeaDuration);
    assert.equal(airTrip.duration, specialisation.id === 10
      ? Math.ceil(expectedAirDuration / 1.2) : expectedAirDuration);
    assert.equal(store.vehicleDetails(saved.id, landId, 2001).travelOrder, 'pillage');
    assert.equal(store.vehicleDetails(saved.id, shipId, 2001).travelOrder, 'patrol');

    store.database.prepare(
      'UPDATE player_ship_state SET next_fish_location = 100 WHERE vehicle_id = ?'
    ).run(shipId);
    store.vehiclesForPlayer(saved.id, seaTrip.arrivesAt + 1);
    assert.equal(store.database.prepare(`
      SELECT COUNT(*) AS count FROM vehicle_events
      WHERE player_id = ? AND vehicle_id = ? AND event_type = 'fished'
    `).get(saved.id, shipId).count, 1);
    assert.equal(store.database.prepare(`
      SELECT payload_json FROM live_update_events
      WHERE scope = ? AND event_type = 'items-found'
    `).all(`player:${saved.id}`).map((event) => JSON.parse(event.payload_json))
      .filter((payload) => payload.source === 'fishing')
      .reduce((sum, payload) => sum + Number(payload.quantity), 0), 1);

    const field = store.oilField(saved.id, 1000);
    const hex = field.hexes.find((entry) => entry.available === 1 && !entry.machine);
    assert.ok(hex);
    store.deployOilMachine(saved.id, hex.id, pad.id, 0, 1000);
    const lifeSeconds = store.database.prepare(
      'SELECT life_seconds FROM oil_machines WHERE player_id = ?'
    ).get(saved.id).life_seconds;
    assert.equal(lifeSeconds,
      Math.round(0.5 * 24 * 60 * 60 * (specialisation.id === 10 ? 1.2 : 1)));
    assert.equal(store.queueOilMachine(saved.id, hex.id, pump.id, 0, 1001), pump.id);
    assert.equal(store.database.prepare(
      'SELECT machine_id FROM oil_machine_queue WHERE player_id = ?'
    ).get(saved.id).machine_id, pump.id);
    store.database.prepare('UPDATE oil_hexes SET barrels = 1 WHERE id = ?').run(hex.id);
    assert.equal(store.claimOilBarrel(saved.id, hex.id, 1002), oil.id);
    assert.equal(store.database.prepare(`
      SELECT quantity FROM inventory WHERE player_id = ? AND city_id = 2 AND item_id = ?
    `).get(saved.id, oil.id).quantity, 1);
    assert.ok(store.bombOilHex(saved.id, hex.id, flower.id, 1003).damageSeconds > 0);
  }
});

test('creates more deterministic fishing opportunities for Fishermen', () => {
  const catches = (profession) => {
    const store = new SqliteStore(':memory:');
    try {
      store.seedCatalog(catalog);
      const ship = [...catalog.vehicles].filter((vehicle) => vehicle.routeType === 1)
        .sort((first, second) => second.capacity - first.capacity)[0];
      const bait = catalog.items.find((item) =>
        item.mineTypeId === 14 && item.rarity === 1 && !item.repairedItemId);
      const player = createPlayer('Opportunity Test', '', 'hash', catalog, 1000, () => 0.5);
      player.profession = profession;
      player.inventory[ship.itemId] = 1;
      player.inventory[bait.id] = 40;
      const saved = store.addPlayer(player);
      const shipId = store.activateVehicle(saved.id, ship.itemId);
      store.setVehicleCargo(saved.id, shipId, { [bait.id]: 40 });
      const route = store.routesForVehicle(saved.id, shipId, 2000)
        .find((entry) => entry.type === 1);
      const trip = store.sendVehicle(saved.id, shipId, route.id, 2000);
      store.vehiclesForPlayer(saved.id, trip.arrivesAt + 1);
      return store.database.prepare(
        "SELECT COUNT(*) AS count FROM vehicle_events WHERE event_type = 'fished'"
      ).get().count;
    } finally {
      store.close();
    }
  };
  assert.ok(catches(7) > catches(0));
});

test('snapshots travel and Oil Field bonuses before a specialisation switch', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const land = catalog.vehicles.find((vehicle) => catalog.byId.get(vehicle.itemId)?.name === 'Donkey');
  const cargo = catalog.items.find((item) => item.mineTypeId === 1 && item.rarity === 1
    && !catalog.vehicleByItemId.has(item.id));
  const trader = createPlayer('Snapshot Trader', '', 'hash', catalog, 1000, () => 0.5);
  trader.profession = 1;
  trader.inventory[land.itemId] = 1;
  trader.inventory[cargo.id] = (trader.inventory[cargo.id] ?? 0) + 1;
  const savedTrader = store.addPlayer(trader);
  const vehicleId = store.activateVehicle(savedTrader.id, land.itemId);
  store.setVehicleCargo(savedTrader.id, vehicleId, { [cargo.id]: 1 });
  const trip = store.sendVehicle(savedTrader.id, vehicleId, 1, 2000);
  const snapshottedSpeed = store.vehicleDetails(savedTrader.id, vehicleId, 2001).speed;
  assert.equal(snapshottedSpeed, land.speed * 1.2);
  assert.equal(store.changeProfession(savedTrader.id, 0).name, 'Bum');
  assert.equal(store.vehicleDetails(savedTrader.id, vehicleId, 2002).speed, snapshottedSpeed);
  assert.equal(store.vehicleDetails(savedTrader.id, vehicleId, 2002).profession, 1);
  assert.equal(trip.duration, Math.ceil(400 / snapshottedSpeed * 60 * 60 * 1000));

  const pump = catalog.machines.find((machine) =>
    machine.type === 'pump' && catalog.byId.get(machine.itemId)?.rarity === 1);
  const pad = catalog.machines.find((machine) =>
    machine.type === 'pad' && catalog.byId.get(machine.itemId)?.rarity === 1);
  const pilot = createPlayer('Snapshot Pilot', '', 'hash', catalog, 1000, () => 0.5);
  pilot.profession = 10;
  pilot.inventoryByCity[2] = { [pump.itemId]: 1, [pad.itemId]: 1 };
  const savedPilot = store.addPlayer(pilot);
  const hex = store.oilField(savedPilot.id, 1000).hexes
    .find((entry) => entry.available === 1 && !entry.machine);
  store.deployOilMachine(savedPilot.id, hex.id, pump.id, 0, 1000);
  store.queueOilMachine(savedPilot.id, hex.id, pad.id, 0, 1001);
  assert.equal(store.database.prepare(
    'SELECT life_bonus_factor FROM oil_machine_queue WHERE player_id = ?'
  ).get(savedPilot.id).life_bonus_factor, 0.2);
  const lifeBeforeSwitch = store.database.prepare(
    'SELECT life_seconds FROM oil_machines WHERE player_id = ?'
  ).get(savedPilot.id).life_seconds;
  assert.equal(store.changeProfession(savedPilot.id, 0).name, 'Bum');
  assert.equal(store.database.prepare(
    'SELECT life_seconds FROM oil_machines WHERE player_id = ?'
  ).get(savedPilot.id).life_seconds, lifeBeforeSwitch);
  assert.equal(lifeBeforeSwitch, Math.round(0.5 * 1.2 * 24 * 60 * 60));
  const replacementAt = 1000 + lifeBeforeSwitch * 1000 + 1;
  const replaced = store.oilField(savedPilot.id, replacementAt).hexes
    .find((entry) => entry.id === hex.id).machine;
  assert.equal(replaced.type, 'pad');
  assert.equal(store.database.prepare(
    'SELECT life_seconds FROM oil_machines WHERE player_id = ?'
  ).get(savedPilot.id).life_seconds, Math.round(0.5 * 1.2 * 24 * 60 * 60));
});

test('uses live database vehicle speed rules without restarting', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const land = catalog.vehicles.find((vehicle) => catalog.byId.get(vehicle.itemId)?.name === 'Donkey');
  const oilItemId = Number(catalog.settings.oil_item_id);
  const player = createPlayer('Live Speed Rules', '', 'hash', catalog, 1000, () => 0.5);
  player.inventory[land.itemId] = 1;
  player.inventory[oilItemId] = 1;
  const saved = store.addPlayer(player);
  const vehicleId = store.activateVehicle(saved.id, land.itemId);
  store.loadVehicleOil(saved.id, vehicleId);
  store.database.prepare(
    "UPDATE catalog_settings SET value_json = '37' WHERE key = 'vehicle_oil_speed_bonus'"
  ).run();

  const trip = store.sendVehicle(saved.id, vehicleId, 1, 2000);
  const speed = land.speed + 37;
  assert.equal(store.vehicleDetails(saved.id, vehicleId, 2001).speed, speed);
  assert.equal(trip.duration, Math.ceil(400 / speed * 60 * 60 * 1000));
});
