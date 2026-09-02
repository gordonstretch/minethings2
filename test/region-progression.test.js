import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlayer } from '../src/game.js';
import { loadLegacyCatalog } from '../src/legacy-catalog.js';
import { createApp } from '../src/server.js';
import { SqliteStore } from '../src/store.js';

test('connects Lahar Rest by road before its Ships Mine opens the Aso sea network',
  (context) => {
    const store = new SqliteStore(':memory:');
    context.after(() => store.close());
    store.seedCatalog(loadLegacyCatalog());
    store.ensureWorldMaps(1_000);
    const catalog = store.loadCatalog();
    const aso = catalog.maps.find((map) => map.slug === 'aso');
    const city = (name) => catalog.cities.find((candidate) =>
      candidate.mapId === aso.id && candidate.name === name);
    const cinderwake = city('Cinderwake');
    const sulfurCrown = city('Sulfur Crown');
    const laharRest = city('Lahar Rest');
    const land = Number(catalog.settings.route_type_ids.land);
    const sea = Number(catalog.settings.route_type_ids.sea);
    const routeBetween = (first, second, type) => catalog.routes.find((route) =>
      route.type === type && !route.interMap
      && ((route.city1Id === first.id && route.city2Id === second.id)
        || (route.city1Id === second.id && route.city2Id === first.id)));

    const directRoad = routeBetween(cinderwake, laharRest, land);
    assert.equal(directRoad?.length, 600);
    assert.equal(routeBetween(sulfurCrown, laharRest, land)?.length, 325);
    const shipsMine = catalog.mineTypes.find((mineType) => mineType.name === 'Ships');
    assert.ok(shipsMine);
    assert.ok(catalog.cityMineTypes.some((availability) =>
      availability.cityId === laharRest.id && availability.mineTypeId === shipsMine.id));

    const player = store.addPlayer(createPlayer(
      'Lahar Road Tester', '', 'hash', catalog, 1_000, () => 0.5
    ));
    const landVehicle = catalog.vehicles.find((vehicle) => vehicle.routeType === land);
    store.database.prepare(`
      INSERT INTO inventory (player_id, city_id, item_id, quantity) VALUES (?, ?, ?, 1)
    `).run(player.id, cinderwake.id, landVehicle.itemId);
    const vehicleId = store.activateVehicle(player.id, landVehicle.itemId);
    assert.ok(store.routesForVehicle(player.id, vehicleId, 1_000)
      .some((route) => route.id === directRoad.id));
    const journey = store.sendVehicle(player.id, vehicleId, directRoad.id, 1_001,
      { travelOrder: 'peaceful' });
    store.settleVehicles(journey.arrivesAt);
    assert.ok(store.knownCityIds(player.id, journey.arrivesAt).includes(laharRest.id));

    store.changeCity(player.id, laharRest.id, journey.arrivesAt + 1);
    const ship = catalog.vehicles.find((vehicle) => vehicle.routeType === sea);
    store.database.prepare(`
      INSERT INTO inventory (player_id, city_id, item_id, quantity) VALUES (?, ?, ?, 1)
    `).run(player.id, laharRest.id, ship.itemId);
    const shipId = store.activateVehicle(player.id, ship.itemId);
    assert.ok(store.routesForVehicle(player.id, shipId, journey.arrivesAt + 1)
      .some((route) => route.type === sea && route.originCityId === laharRest.id));

    const routeCount = catalog.routes.length;
    store.ensureWorldMaps(2_000);
    assert.equal(store.loadCatalog().routes.length, routeCount);
    assert.equal(store.database.prepare(`
      SELECT COUNT(*) AS count FROM schema_migrations
      WHERE name = 'aso-lahar-land-access-v1'
    `).get().count, 1);
  });

test('starts new miners in Aso and reveals Bromo only after gateway arrival', async (context) => {
  const store = new SqliteStore(':memory:');
  let currentTime = 1000;
  const server = createApp({ store, now: () => currentTime, random: () => 0.5 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => {
    await new Promise((resolve, reject) => server.close((error) =>
      error ? reject(error) : resolve()));
    store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  const registration = await fetch(`${base}/register`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      name: 'Aso Gateway Starter', email: 'aso-starter@example.test',
      password: 'gateway progression password', acceptTerms: '1'
    })
  });
  assert.equal(registration.status, 303);
  const cookie = registration.headers.get('set-cookie').split(';')[0];
  const player = store.findPlayer('Aso Gateway Starter', currentTime);
  assert.ok(player);

  const starter = store.database.prepare(`
    SELECT catalog_cities.id, catalog_cities.name, world_maps.name AS map_name
    FROM catalog_cities
    JOIN world_maps ON world_maps.id = catalog_cities.map_id
    WHERE catalog_cities.id = ?
  `).get(player.cityId);
  assert.deepEqual({ ...starter }, { id: player.cityId, name: 'Cinderwake', map_name: 'Aso' });
  assert.equal(player.homeCityId, player.cityId);
  assert.deepEqual(store.database.prepare(`
    SELECT city_id FROM known_cities WHERE player_id = ? ORDER BY city_id
  `).all(player.id).map((row) => row.city_id), [player.cityId]);
  store.database.prepare('UPDATE players SET email_verified_at = ? WHERE id = ?')
    .run(currentTime, player.id);

  const catalog = store.loadCatalog();
  const landType = Number(catalog.settings.route_type_ids.land);
  const gateway = store.adminInterMapRoutes().find((route) =>
    route.map1_name === 'Aso' && route.map2_name === 'Bromo' && route.type === landType);
  assert.ok(gateway, 'Aso has a land gateway to Bromo');
  store.adminSetInterMapRoute(player.id, gateway.id, true, ++currentTime);

  const vehicleType = catalog.vehicles.find((vehicle) => vehicle.routeType === landType);
  assert.ok(vehicleType, 'a land vehicle can use the gateway');
  store.database.prepare(`
    INSERT INTO inventory (player_id, city_id, item_id, quantity) VALUES (?, ?, ?, 1)
    ON CONFLICT (player_id, city_id, item_id)
      DO UPDATE SET quantity = quantity + 1
  `).run(player.id, player.cityId, vehicleType.itemId);
  const vehicleId = store.activateVehicle(player.id, vehicleType.itemId);
  assert.ok(store.routesForVehicle(player.id, vehicleId, currentTime)
    .some((route) => route.id === gateway.id));

  const hiddenMap = await (await fetch(`${base}/map`, { headers: { cookie } })).text();
  assert.match(hiddenMap, /Aso opportunities/);
  assert.match(hiddenMap, /Undiscovered region/);
  assert.doesNotMatch(hiddenMap, /Complete this gateway route|Bring an idle|expedition reward/iu);
  assert.doesNotMatch(hiddenMap, /href="\/map\?world=bromo"/);
  assert.doesNotMatch(hiddenMap,
    /\bBromo\b|Ashfall|Tengger Gate|Sandsea|Ember Market|Craterwatch/);
  const forcedHiddenMap = await (await fetch(`${base}/map?world=bromo`, {
    headers: { cookie }
  })).text();
  assert.match(forcedHiddenMap, /Aso opportunities/);
  assert.doesNotMatch(forcedHiddenMap, /\bBromo\b|Ashfall/);
  const hiddenFleet = await (await fetch(`${base}/vehicles`, {
    headers: { cookie }
  })).text();
  assert.match(hiddenFleet, /★ Undiscovered regional capital · GATEWAY/);
  assert.doesNotMatch(hiddenFleet, /\bBromo\b|Ashfall/);

  store.database.prepare('UPDATE catalog_routes SET is_inter_map = 0 WHERE id = ?')
    .run(gateway.id);
  assert.throws(() => store.sendVehicle(player.id, vehicleId, gateway.id, currentTime, {
    travelOrder: 'peaceful'
  }), /Only a gateway route can cross/);
  store.database.prepare('UPDATE catalog_routes SET is_inter_map = 1 WHERE id = ?')
    .run(gateway.id);

  currentTime += 1;
  const journey = store.sendVehicle(player.id, vehicleId, gateway.id, currentTime,
    { travelOrder: 'peaceful' });
  assert.deepEqual(store.knownCityIds(player.id, currentTime), [player.cityId]);
  const inFlightMap = await (await fetch(`${base}/map`, { headers: { cookie } })).text();
  assert.doesNotMatch(inFlightMap, /href="\/map\?world=bromo"/);
  const inFlightVehicle = await (await fetch(`${base}/vehicles/${vehicleId}`, {
    headers: { cookie }
  })).text();
  assert.match(inFlightVehicle, /★ Undiscovered regional capital · GATEWAY/);
  assert.doesNotMatch(inFlightVehicle, /\bBromo\b|Ashfall/);

  store.settleVehicles(journey.arrivesAt);
  currentTime = journey.arrivesAt;
  const destination = catalog.cities.find((city) => city.name === 'Ashfall');
  assert.ok(destination);
  assert.deepEqual(store.knownCityIds(player.id, currentTime).sort((a, b) => a - b),
    [player.cityId, destination.id].sort((a, b) => a - b));

  const discoveredMap = await (await fetch(`${base}/map?world=bromo`, {
    headers: { cookie }
  })).text();
  assert.match(discoveredMap, /href="\/map\?world=bromo"/);
  assert.match(discoveredMap, /Bromo opportunities/);
  assert.match(discoveredMap, /Ashfall/);
  assert.doesNotMatch(discoveredMap, /href="\/map\?world=calbuco"/);
});
