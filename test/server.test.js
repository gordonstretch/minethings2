import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { createPlayer } from '../src/game.js';
import { loadLegacyCatalog } from '../src/legacy-catalog.js';
import { createApp, describeFinds } from '../src/server.js';
import { hashPassword, SqliteStore } from '../src/store.js';

async function verifyDevelopmentEmail(base, cookie) {
  const pending = await fetch(`${base}/verify-email`, { headers: { cookie } });
  assert.equal(pending.status, 200);
  const pendingHtml = await pending.text();
  const tokenMatch = pendingHtml.match(/\/verify-email\?token=([A-Za-z0-9_-]{40,128})/u);
  assert.ok(tokenMatch, 'development verification link is visible');
  const confirmation = await fetch(`${base}/verify-email?token=${tokenMatch[1]}`, {
    headers: { cookie }
  });
  assert.equal(confirmation.status, 200);
  assert.match(await confirmation.text(), /Confirm your email/);
  const verified = await fetch(`${base}/verify-email/confirm`, {
    method: 'POST', redirect: 'manual',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token: tokenMatch[1] })
  });
  assert.equal(verified.status, 303);
  assert.equal(verified.headers.get('location'), '/');
  return tokenMatch[1];
}

test('renders and operates persistent factory production queues', async (context) => {
  const store = new SqliteStore(':memory:');
  store.seedCatalog(loadLegacyCatalog());
  const catalog = store.loadCatalog();
  const password = 'factory queue password';
  const player = store.addPlayer(createPlayer(
    'Factory Queue Operator', '', hashPassword(password), catalog, 1000, () => 0.5
  ));
  const stocked = store.playerById(player.id);
  stocked.inventory[368] = 20;
  store.savePlayer(stocked);
  const factoryId = Number(store.database.prepare(`
    INSERT INTO factories
      (owner_id, operator_id, city_id, built, factory_action_id, item_id,
       components_done, last_event_at, completion_at, rental_expires, created_at)
    VALUES (?, ?, ?, 1, NULL, NULL, 0, 1000, NULL, NULL, 1000)
  `).run(player.id, player.id, player.cityId).lastInsertRowid);
  const flower = catalog.factoryActions.find((action) => action.name === 'Flower');
  const thumper = catalog.factoryActions.find((action) => action.name === 'Thumper');
  const cannonballs = catalog.factoryActions.find((action) => action.name === '20 Boxes Cannonballs');
  store.startFactoryAction(player.id, factoryId, flower.id, null, 1100);
  const queuedThumper = store.startFactoryAction(player.id, factoryId, thumper.id, null, 1101);
  const queuedCannonballs = store.startFactoryAction(player.id, factoryId, cannonballs.id, null, 1102);
  const server = createApp({ store, now: () => 1200 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${base}/login`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ name: player.name, password })
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];

  const factoriesHtml = await (await fetch(`${base}/factories`, { headers: { cookie } })).text();
  assert.match(factoriesHtml, /Production queue <span>2\/10<\/span>/);
  assert.match(factoriesHtml, /Inputs are reserved as soon as a job is queued/);
  assert.match(factoriesHtml, new RegExp(
    `/factories/${factoryId}/queue/${queuedThumper.queuedJob.id}/cancel`
  ));
  assert.match(factoriesHtml, />Add to queue<\/button>/);

  const reordered = await fetch(
    `${base}/factories/${factoryId}/queue/${queuedCannonballs.queuedJob.id}/up`,
    { method: 'POST', redirect: 'manual', headers: { cookie } }
  );
  assert.equal(reordered.status, 303);
  assert.deepEqual(store.factoriesForPlayer(player.id, 1200).factories[0].queue
    .map((job) => job.actionName), ['20 Boxes Cannonballs', 'Thumper']);
  const cancelled = await fetch(
    `${base}/factories/${factoryId}/queue/${queuedThumper.queuedJob.id}/cancel`,
    { method: 'POST', redirect: 'manual', headers: { cookie } }
  );
  assert.equal(cancelled.status, 303);
  assert.deepEqual(store.factoriesForPlayer(player.id, 1200).factories[0].queue
    .map((job) => job.actionName), ['20 Boxes Cannonballs']);
});

test('streams scoped database changes to live pages without reload code', async (context) => {
  const store = new SqliteStore(':memory:');
  store.seedCatalog(loadLegacyCatalog());
  const catalog = store.loadCatalog();
  const password = 'live update password';
  const player = store.addPlayer(createPlayer(
    'Live Browser', '', hashPassword(password), catalog, 1000, () => 0.5
  ));
  const server = createApp({ store, catalog, now: () => 2000, liveUpdateDebounceMs: 0 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${base}/login`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ name: player.name, password })
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const inventory = await (await fetch(`${base}/inventory`, { headers: { cookie } })).text();
  const revision = Number(/data-live-revision="(\d+)"/.exec(inventory)?.[1]);
  assert.ok(Number.isSafeInteger(revision));
  assert.match(inventory, /\/node\/live-updates\.js/);

  const controller = new AbortController();
  const stream = await fetch(
    `${base}/api/live-updates?since=${revision}&topics=catalog,market`,
    { headers: { cookie }, signal: controller.signal }
  );
  assert.equal(stream.status, 200);
  assert.match(stream.headers.get('content-type'), /text\/event-stream/);
  const reader = stream.body.getReader();
  const decoder = new TextDecoder();
  let body = '';
  const changed = store.playerById(player.id, 2000);
  changed.credits += 7;
  store.savePlayer(changed);
  const deadline = Date.now() + 3000;
  while (!body.includes('event: change') && Date.now() < deadline) {
    const result = await Promise.race([
      reader.read(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('SSE timeout')), 500))
    ]);
    if (result.done) break;
    body += decoder.decode(result.value, { stream: true });
  }
  controller.abort();
  assert.match(body, /event: change/);
  assert.match(body, new RegExp(`player:${player.id}`));

  const client = await (await fetch(`${base}/node/live-updates.js`)).text();
  assert.match(client, /morphNode/);
  assert.match(client, /data-live-dirty/);
  assert.doesNotMatch(client, /location\.reload|location\.replace/);
});

test('creates unique world maps and lets an administrator open their long routes', () => {
  const store = new SqliteStore(':memory:');
  const catalog = loadLegacyCatalog();
  store.seedCatalog(catalog);
  store.ensureWorldMaps(1000);
  const administrator = store.addPlayer(createPlayer(
    'World Builder', '', hashPassword('world builder password'), store.loadCatalog(), 1000, () => 0.5
  ));
  const live = store.loadCatalog();
  assert.deepEqual(live.maps.map((map) => map.name),
    ['Aso', 'Bromo', 'Calbuco', 'Dempo', 'Ebeko', 'Fogo', 'Gallego']);
  assert.equal(live.cities.length, 35);
  assert.equal(new Set(live.cities.map((city) => city.name)).size, live.cities.length);
  for (const map of live.maps) {
    const cities = live.cities.filter((city) => city.mapId === map.id);
    const mineTypeIds = new Set(cities.flatMap((city) =>
      live.mineTypesByCity.get(city.id).map((mineType) => mineType.id)));
    assert.equal(cities.length, 5, `${map.name} should have five cities`);
    assert.equal(mineTypeIds.size, 15, `${map.name} should support fifteen mine types`);
    assert.equal(live.routes.filter((candidate) => !candidate.interMap
      && cities.some((city) => city.id === candidate.city1Id)
      && cities.some((city) => city.id === candidate.city2Id)).length,
    map.name === 'Gallego' ? 12 : 11, `${map.name} should have a local travel network`);
  }
  store.ensureWorldMaps(1500);
  assert.equal(store.loadCatalog().cities.length, 35, 'the region migration should be idempotent');
  const routes = store.adminInterMapRoutes();
  assert.equal(routes.length, 18);
  assert.equal(routes.every((route) => !route.open && route.length === 12000), true);
  const seaType = live.settings.route_type_ids.sea;
  const route = routes.find((entry) => entry.map1_name === 'Fogo'
    && entry.map2_name === 'Gallego' && entry.type === seaType);
  store.adminSetInterMapRoute(administrator.id, route.id, true, 2000);
  assert.equal(store.adminInterMapRoutes().find((entry) => entry.id === route.id).open, true);
  assert.equal(store.adminAuditLog()[0].action, 'route-opened');
  const ship = live.vehicles.find((vehicle) => vehicle.routeType === seaType);
  store.database.prepare(`
    INSERT INTO inventory (player_id, city_id, item_id, quantity) VALUES (?, ?, ?, 1)
  `).run(administrator.id, administrator.cityId, ship.itemId);
  const vehicleId = store.activateVehicle(administrator.id, ship.itemId);
  assert.equal(store.routesForVehicle(administrator.id, vehicleId, 2100)
    .some((entry) => entry.id === route.id), true);
  const journey = store.sendVehicle(administrator.id, vehicleId, route.id, 2200,
    { travelOrder: 'peaceful' });
  assert.equal(store.vehicleDetails(administrator.id, vehicleId, 2201).status, 'traveling');
  store.settleVehicles(journey.arrivesAt);
  assert.equal(store.vehicleDetails(administrator.id, vehicleId, journey.arrivesAt).cityId,
    live.cities.find((city) => city.name === 'Brimstone').id);
  assert.equal(store.routesForVehicle(administrator.id, vehicleId, journey.arrivesAt)
    .some((entry) => entry.id === route.id), true);
  store.close();
});

test('reveals and previews only maps connected by open corridors', async (context) => {
  const store = new SqliteStore(':memory:');
  store.seedCatalog(loadLegacyCatalog());
  store.ensureWorldMaps(1000);
  const catalog = store.loadCatalog();
  const password = 'regional explorer password';
  const player = store.addPlayer(createPlayer(
    'Regional Explorer', '', hashPassword(password), catalog, 1000, () => 0.5
  ));
  const gatewayRoutes = store.adminInterMapRoutes().filter((entry) => entry.map1_name === 'Fogo'
    && entry.map2_name === 'Gallego');
  assert.deepEqual(new Set(gatewayRoutes.map((route) => route.type)),
    new Set(Object.values(catalog.settings.route_type_ids)));
  const gatewayVehicles = gatewayRoutes.map((route, index) => {
    store.adminSetInterMapRoute(player.id, route.id, true, 1100 + index);
    const definition = catalog.vehicles.find((vehicle) => vehicle.routeType === route.type);
    store.database.prepare(`
      INSERT INTO inventory (player_id, city_id, item_id, quantity) VALUES (?, ?, ?, 1)
      ON CONFLICT(player_id, city_id, item_id) DO UPDATE SET quantity = quantity + 1
    `).run(player.id, player.cityId, definition.itemId);
    const vehicleId = store.activateVehicle(player.id, definition.itemId);
    assert.ok(store.routesForVehicle(player.id, vehicleId, 1190)
      .some((candidate) => candidate.id === route.id));
    return { vehicleId, route };
  });
  const insertMeld = store.database.prepare(
    'INSERT INTO player_melds (player_id, meld_id, created_at) VALUES (?, ?, 1190)'
  );
  for (const meld of catalog.melds.slice(0, 10)) insertMeld.run(player.id, meld.id);
  const server = createApp({ store, now: () => 1200 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${base}/login`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ name: player.name, password })
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const gallego = await (await fetch(`${base}/map`, { headers: { cookie } })).text();
  assert.match(gallego, /href="\/map\?world=fogo"/);
  assert.doesNotMatch(gallego, /href="\/map\?world=calbuco"/);
  for (const { vehicleId, route } of gatewayVehicles) {
    assert.match(gallego, new RegExp(`action="/vehicles/${vehicleId}/send"`));
    assert.match(gallego, new RegExp(
      `<input type="hidden" name="routeId" value="${route.id}">`
    ));
  }
  const fogo = await (await fetch(`${base}/map?world=fogo`, { headers: { cookie } })).text();
  assert.match(fogo, /Fogo opportunities/);
  assert.match(fogo, /<strong>5 cities<\/strong> support <strong>15 mine types<\/strong>/);
  for (const city of ['Brimstone', 'Caldera', 'Mosteiros', 'Lavafields', 'Porto Cinza']) {
    assert.match(fogo, new RegExp(city));
  }
  for (const { vehicleId, route } of gatewayVehicles) {
    const departure = await fetch(`${base}/vehicles/${vehicleId}/send`, {
      method: 'POST', redirect: 'manual', headers: {
        cookie, 'content-type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({ routeId: String(route.id), travelOrder: 'peaceful' })
    });
    assert.equal(departure.status, 303);
    assert.equal(store.vehicleDetails(player.id, vehicleId, 1200).status, 'traveling');
  }
});

test('enables secure sessions and bounded connections in production', async (context) => {
  const catalog = loadLegacyCatalog();
  const store = new SqliteStore(':memory:');
  store.seedCatalog(catalog);
  const password = 'production session password';
  const player = store.addPlayer(createPlayer(
    'Production Miner', '', hashPassword(password), catalog, 1000, () => 0.5
  ));
  const server = createApp({
    store, catalog, production: true, now: () => 2000, authFailureLimit: 2,
    emailClient: { async sendVerification() {} }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${base}/login`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ name: player.name, password })
  });
  assert.match(login.headers.get('set-cookie'), /; Secure; Max-Age=/);
  assert.equal(server.requestTimeout, 15000);
  assert.equal(server.headersTimeout, 10000);
  assert.equal(server.keepAliveTimeout, 5000);
  assert.equal(server.maxRequestsPerSocket, 1000);
  const crossSite = await fetch(`${base}/login`, {
    method: 'POST', redirect: 'manual',
    headers: {
      'content-type': 'application/x-www-form-urlencoded',
      'sec-fetch-site': 'cross-site'
    },
    body: new URLSearchParams({ name: player.name, password })
  });
  assert.equal(crossSite.status, 403);
  const wrongLogin = () => fetch(`${base}/login`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ name: player.name, password: 'wrong password' })
  });
  assert.equal((await wrongLogin()).status, 400);
  assert.equal((await wrongLogin()).status, 400);
  assert.equal((await wrongLogin()).status, 429);
  const malformedCookie = await fetch(`${base}/health`, {
    headers: { cookie: 'mt_session=%E0%A4%A' }
  });
  assert.equal(malformedCookie.status, 200);
  const oversized = await fetch(`${base}/login`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `name=${'x'.repeat(70 * 1024)}`
  });
  assert.equal(oversized.status, 400);
});

test('refuses production startup without mandatory email delivery configuration', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(loadLegacyCatalog());
  assert.throws(() => createApp({
    store, production: true,
    email: { host: '', from: '', publicOrigin: '' }
  }), /Mandatory email verification is not configured: SMTP host, sender address, public origin/);
});

test('secures and operates the modern administration console', async (context) => {
  const catalog = loadLegacyCatalog();
  const store = new SqliteStore(':memory:');
  store.seedCatalog(catalog);
  store.ensureWorldMaps(1000);
  const liveCatalog = store.loadCatalog();
  const password = 'admin console password';
  const administrator = store.addPlayer(createPlayer('Console Admin', '', hashPassword(password), catalog, 1000, () => 0.5));
  const subject = store.addPlayer(createPlayer('Console Subject', '', hashPassword(password), catalog, 1000, () => 0.5));
  const server = createApp({ store, catalog: liveCatalog, now: () => 2000, adminNames: 'Console Admin' });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = async (name) => {
    const response = await fetch(`${base}/login`, {
      method: 'POST', redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ name, password })
    });
    return response.headers.get('set-cookie').split(';')[0];
  };
  const adminCookie = await login(administrator.name);
  const subjectCookie = await login(subject.name);
  assert.equal((await fetch(`${base}/admin`, { headers: { cookie: subjectCookie } })).status, 404);
  assert.equal((await fetch(`${base}/admin/world`, { headers: { cookie: subjectCookie } })).status, 404);
  const dashboard = await fetch(`${base}/admin`, { headers: { cookie: adminCookie } });
  assert.equal(dashboard.status, 200);
  assert.match(await dashboard.text(), /Administration/);

  const worldControls = store.adminWorldEventControls(2000);
  const seaType = liveCatalog.settings.map_route_types.findIndex((type) => type.name === 'sea');
  const landType = liveCatalog.settings.map_route_types.findIndex((type) => type.name === 'land');
  const seaRoute = worldControls.routes.find((route) => route.type === seaType);
  const landRoute = worldControls.routes.find((route) => route.type === landType);
  assert.ok(seaRoute && landRoute);
  const worldPage = await fetch(`${base}/admin/world`, { headers: { cookie: adminCookie } });
  assert.equal(worldPage.status, 200);
  const worldHtml = await worldPage.text();
  assert.match(worldHtml, /Change current weather/);
  assert.match(worldHtml, /Release Sea creature/);
  assert.match(worldHtml, /Release Land creature/);
  for (const name of ['Kraken', 'White Whale', 'Orca Pod', 'Land Whale', 'Elephant Herd', 'T-Rex']) {
    assert.match(worldHtml, new RegExp(name));
  }
  for (const color of ['Yellow', 'Green', 'Blue', 'Red', 'Purple', 'Orange']) {
    assert.match(worldHtml, new RegExp(color));
  }

  const weather = await fetch(`${base}/admin/world/weather`, {
    method: 'POST', redirect: 'manual', headers: {
      cookie: adminCookie, 'content-type': 'application/x-www-form-urlencoded'
    }, body: new URLSearchParams({
      mapId: String(seaRoute.map1_id), condition: 'storm', temperatureC: '8.5',
      windKph: '90', rainfallMm: '24.5'
    })
  });
  assert.equal(weather.status, 303);
  assert.equal(weather.headers.get('location'), '/admin/world');
  const currentWeather = store.adminWorldEventControls(2000).weather
    .find((entry) => entry.mapId === seaRoute.map1_id);
  assert.deepEqual([
    currentWeather.condition, currentWeather.temperatureC,
    currentWeather.windKph, currentWeather.rainfallMm
  ], ['storm', 8.5, 90, 24.5]);

  const spawned = await fetch(`${base}/admin/world/creatures`, {
    method: 'POST', redirect: 'manual', headers: {
      cookie: adminCookie, 'content-type': 'application/x-www-form-urlencoded'
    }, body: new URLSearchParams({
      type: 'white_whale', rarity: '6',
      mapId: String(seaRoute.map1_id), routeId: String(seaRoute.id)
    })
  });
  assert.equal(spawned.status, 303);
  assert.equal(spawned.headers.get('location'), '/admin/world');
  assert.equal(store.adminWorldEventControls(2000).creatures.some((entry) =>
    entry.creature_type === 'white_whale' && entry.rarity === 6
      && entry.route_id === seaRoute.id), true);

  const whale = await fetch(`${base}/admin/world/creatures`, {
    method: 'POST', redirect: 'manual', headers: {
      cookie: adminCookie, 'content-type': 'application/x-www-form-urlencoded'
    }, body: new URLSearchParams({
      type: 't_rex', rarity: '4',
      mapId: String(landRoute.map1_id), routeId: String(landRoute.id)
    })
  });
  assert.equal(whale.status, 303);
  assert.equal(store.adminWorldEventControls(2000).creatures.some((entry) =>
    entry.creature_type === 't_rex' && entry.rarity === 4
      && entry.route_id === landRoute.id), true);

  const grant = await fetch(`${base}/admin/players/${subject.id}/grant`, {
    method: 'POST', redirect: 'manual', headers: {
      cookie: adminCookie, 'content-type': 'application/x-www-form-urlencoded'
    }, body: new URLSearchParams({ kind: 'credits', amount: '25' })
  });
  assert.equal(grant.status, 303);
  assert.equal(store.playerById(subject.id, 2000).credits, subject.credits + 25);

  await fetch(`${base}/admin/players/${subject.id}/moderation`, {
    method: 'POST', redirect: 'manual', headers: {
      cookie: adminCookie, 'content-type': 'application/x-www-form-urlencoded'
    }, body: new URLSearchParams({ field: 'chat', enabled: '1' })
  });
  assert.throws(() => store.addChat(subject.id, 'No longer allowed', 2000), /not permitted/);

  await fetch(`${base}/admin/announcement`, {
    method: 'POST', redirect: 'manual', headers: {
      cookie: adminCookie, 'content-type': 'application/x-www-form-urlencoded'
    }, body: new URLSearchParams({ subject: 'Maintenance', body: 'Brief restart soon.' })
  });
  const adminMessages = store.recentMessages(subject.id, 'all', 'Admin');
  assert.equal(adminMessages.some((message) => message.subject === 'Maintenance'), true);
  assert.ok(adminMessages.some((message) => message.details.event === 'administrator-grant'));
  assert.ok(adminMessages.some((message) => message.details.event === 'moderation-updated'));
  assert.deepEqual(store.adminAuditLog().map((entry) => entry.action).slice(0, 6),
    ['broadcast', 'chat-enabled', 'grant-credits',
      'world-creature-spawned', 'world-creature-spawned', 'weather-overridden']);
});

test('renders moving creatures and sends vehicles to future interception points', async (context) => {
  const catalog = loadLegacyCatalog();
  const store = new SqliteStore(':memory:');
  store.seedCatalog(catalog);
  store.ensureWorldMaps(1000);
  const password = 'creature interception password';
  const route = catalog.routes.find((entry) => entry.open && entry.type === 0
    && entry.city1Id !== entry.city2Id && [entry.city1Id, entry.city2Id].includes(1));
  const vehicleType = catalog.vehicles.find((vehicle) => vehicle.routeType === 0);
  assert.ok(route && vehicleType);
  const player = createPlayer(
    'Creature Interceptor', '', hashPassword(password), catalog, 1000, () => 0.5
  );
  player.profession = 1;
  player.inventory[vehicleType.itemId] = 1;
  const saved = store.addPlayer(player);
  const vehicleId = store.activateVehicle(saved.id, vehicleType.itemId);
  const mapId = store.database.prepare(
    'SELECT map_id FROM catalog_cities WHERE id = 1'
  ).get().map_id;
  const creatureId = Number(store.database.prepare(`
    INSERT INTO world_creatures
      (creature_type, rarity, map_id, route_id, location, destination_city_id,
       hp, max_hp, awakened_at, moved_at, speed)
    VALUES ('land_whale', ?, ?, ?, ?, ?, 140, 140, 2000, 2000, 12)
  `).run(catalog.byId.get(vehicleType.itemId).rarity,
    mapId, route.id, route.length / 2, route.city1Id).lastInsertRowid);
  const server = createApp({ store, catalog: store.loadCatalog(), now: () => 2000 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${base}/login`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ name: saved.name, password })
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];

  const events = await fetch(`${base}/events`, { headers: { cookie } });
  assert.equal(events.status, 200);
  const html = await events.text();
  assert.match(html, /Tiered creatures travel as live route actors/);
  assert.match(html, /12\.0 km\/h toward/);
  assert.match(html, new RegExp(`/events/creatures/${creatureId}/attack`));
  assert.match(html, /bounty slots/);

  const attack = await fetch(`${base}/events/creatures/${creatureId}/attack`, {
    method: 'POST', redirect: 'manual', headers: {
      cookie, 'content-type': 'application/x-www-form-urlencoded'
    }, body: new URLSearchParams({ vehicleId: String(vehicleId) })
  });
  assert.equal(attack.status, 303);
  assert.equal(attack.headers.get('location'), '/events');
  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count FROM world_creature_pursuits
    WHERE creature_id = ? AND vehicle_id = ? AND status = 'pursuing'
  `).get(creatureId, vehicleId).count, 1);
  assert.equal(store.database.prepare(
    'SELECT COUNT(*) AS count FROM world_creature_attacks WHERE creature_id = ?'
  ).get(creatureId).count, 0);
  const vehicles = await fetch(`${base}/vehicles`, { headers: { cookie } });
  assert.equal(vehicles.status, 200);
  const vehiclesHtml = await vehicles.text();
  assert.match(vehiclesHtml, new RegExp(`Pursuing ${
    catalog.settings.rarity_color_names[catalog.byId.get(vehicleType.itemId).rarity]
  } Land Whale`));
  assert.match(vehiclesHtml, /Intercepts in/);
  const vehicle = await fetch(`${base}/vehicles/${vehicleId}`, { headers: { cookie } });
  assert.equal(vehicle.status, 200);
  assert.match(await vehicle.text(), /Interception in/);
});

test('names grouped mine findings from rarest to commonest', () => {
  const catalog = loadLegacyCatalog();
  const rare = catalog.items.find((item) => item.rarity === 6);
  const common = catalog.items.find((item) => item.rarity === 1);
  assert.equal(describeFinds([
    { itemId: common.id },
    { itemId: rare.id, recycled: true, count: 2 }
  ], catalog), `2× ${rare.name} (auto-recycled) and ${common.name}`);
});

test('turns maintenance lock contention into a recoverable in-page response', async (context) => {
  const catalog = loadLegacyCatalog();
  const store = new SqliteStore(':memory:');
  store.seedCatalog(catalog);
  const password = 'soft lock password';
  const player = createPlayer('Soft Lock HTTP', '', hashPassword(password), catalog, 1000, () => 0.5);
  store.addPlayer(player);
  const server = createApp({ store, catalog, now: () => 2000 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${base}/login`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ name: player.name, password })
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const originalRunBumUpdate = store.runBumUpdate;
  store.runBumUpdate = () => {
    const error = new Error('The game database is temporarily busy. Please try that action again.');
    error.code = 'SQLITE_BUSY_TIMEOUT';
    throw error;
  };

  const contended = await fetch(`${base}/inventory`, {
    redirect: 'manual', headers: { cookie, referer: `${base}/inventory` }
  });
  assert.equal(contended.status, 503);
  assert.equal(contended.headers.get('location'), null);
  const contendedHtml = await contended.text();
  assert.match(contendedHtml, /id="flash-dialog"/);
  assert.match(contendedHtml, /temporarily busy/);

  store.runBumUpdate = originalRunBumUpdate;
  const recovered = await fetch(`${base}/inventory`, { headers: { cookie } });
  assert.equal(recovered.status, 200);
});

test('renders an armed ship on an inter-map voyage without treating its null city as a port', async (context) => {
  const bootstrapCatalog = loadLegacyCatalog();
  const store = new SqliteStore(':memory:');
  store.seedCatalog(bootstrapCatalog);
  store.ensureWorldMaps(1000);
  const catalog = store.loadCatalog();
  const password = 'traveling vehicle password';
  const vehicleType = catalog.vehicles.find((vehicle) => vehicle.routeType === 1
    && vehicle.ship?.cannonPortals > 0);
  const allowedRarities = catalog.settings.arms_rarities_by_vehicle_rarity[
    catalog.byId.get(vehicleType.itemId).rarity
  ];
  const cannon = catalog.cannons.find((entry) =>
    allowedRarities.includes(catalog.byId.get(entry.itemId).rarity));
  const player = createPlayer('Traveling Vehicle', '', hashPassword(password), catalog, 1000, () => 0.5);
  player.inventory = { [vehicleType.itemId]: 1, [cannon.itemId]: 1 };
  player.inventoryByCity = { [player.cityId]: player.inventory };
  const saved = store.addPlayer(player);
  const vehicleId = store.activateVehicle(saved.id, vehicleType.itemId);
  store.attachShipCannon(saved.id, vehicleId, cannon.id);
  const origin = catalog.cities.find((city) => city.id === player.cityId);
  const destination = catalog.cities.find((city) => city.mapId !== origin.mapId);
  assert.ok(destination, 'Expected an inter-map destination city.');
  store.database.prepare(`
    UPDATE player_vehicles
    SET status = 'traveling', city_id = NULL, origin_city_id = ?,
      destination_city_id = ?, departed_at = ?, arrives_at = ?
    WHERE id = ?
  `).run(player.cityId, destination.id, 1500, 5000, vehicleId);

  const server = createApp({ store, catalog, now: () => 2000 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${base}/login`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ name: player.name, password })
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];

  const vehicles = await fetch(`${base}/vehicles`, {
    redirect: 'manual', headers: { cookie, referer: `${base}/vehicles` }
  });
  assert.equal(vehicles.status, 200);
  assert.equal(vehicles.headers.get('location'), null);
  assert.match(await vehicles.text(), /Traveling to/);

  const details = await fetch(`${base}/vehicles/${vehicleId}`, {
    redirect: 'manual', headers: { cookie, referer: `${base}/vehicles/${vehicleId}` }
  });
  assert.equal(details.status, 200);
  assert.equal(details.headers.get('location'), null);
  const detailsHtml = await details.text();
  assert.match(detailsHtml, new RegExp(`Traveling to <strong>${destination.name}`));
  assert.match(detailsHtml, /Cannon portals/);
  assert.doesNotMatch(detailsHtml, /Missing catalog city/);

  const originalVehiclesForPlayer = store.vehiclesForPlayer;
  store.vehiclesForPlayer = () => { throw new Error('Vehicle page failure.'); };
  const failed = await fetch(`${base}/vehicles`, {
    redirect: 'manual', headers: { cookie, referer: `${base}/vehicles` }
  });
  store.vehiclesForPlayer = originalVehiclesForPlayer;
  assert.equal(failed.status, 500);
  assert.equal(failed.headers.get('location'), null);
  assert.match(await failed.text(), /Vehicle page failure/);
});

test('renders cannon controls for an idle ship in port', async (context) => {
  const catalog = loadLegacyCatalog();
  const store = new SqliteStore(':memory:');
  store.seedCatalog(catalog);
  const password = 'ship fittings password';
  const ship = catalog.vehicles.find((vehicle) => vehicle.ship?.cannonPortals > 0);
  const shipItem = catalog.byId.get(ship.itemId);
  const allowedRarities = catalog.settings.arms_rarities_by_vehicle_rarity[shipItem.rarity];
  const cannon = catalog.cannons.find((entry) =>
    allowedRarities.includes(catalog.byId.get(entry.itemId).rarity));
  const ammunition = catalog.cannonballs[0];
  const player = createPlayer('Ship Fittings', '', hashPassword(password), catalog, 1000, () => 0.5);
  player.inventory = { [ship.itemId]: 1, [cannon.itemId]: 1, [ammunition.itemId]: 3 };
  player.inventoryByCity = { [player.cityId]: player.inventory };
  const saved = store.addPlayer(player);
  const vehicleId = store.activateVehicle(saved.id, ship.itemId);
  const server = createApp({ store, catalog, now: () => 2000 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${base}/login`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ name: player.name, password })
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];

  const response = await fetch(`${base}/vehicles/${vehicleId}/customize`, { headers: { cookie } });
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /<h2>Ship cannons <small>0\/\d+ portals occupied<\/small><\/h2>/);
  assert.match(html, /<h2 id="vehicle-loadout-heading">Current loadout<\/h2>/);
  assert.match(html, /Choose the complete cannon set you want fitted/);
  assert.match(html, /ammunition remains aboard/);
  assert.match(html, /Attach a cannon first/);
  assert.match(html, new RegExp(`action="/vehicles/${vehicleId}/customize"`));
  assert.match(html, /Preview cannon loadout/);
  const preview = await fetch(`${base}/vehicles/${vehicleId}/customize`, {
    method: 'POST', redirect: 'manual', headers: {
      cookie, 'content-type': 'application/x-www-form-urlencoded'
    }, body: new URLSearchParams({ [`cannon_${cannon.id}`]: '1', intent: 'preview' })
  });
  assert.equal(preview.status, 200);
  const previewHtml = await preview.text();
  assert.match(previewHtml, /exact proposal is ready to commit/i);
  assert.match(previewHtml, /Commit this exact loadout/);
  const previewToken = /name="previewToken" value="([^"]+)"/u.exec(previewHtml)?.[1];
  assert.ok(previewToken);
  assert.equal(store.vehicleDetails(saved.id, vehicleId, 2000).cannons.length, 0);
  const attach = await fetch(`${base}/vehicles/${vehicleId}/customize`, {
    method: 'POST', redirect: 'manual', headers: {
      cookie, 'content-type': 'application/x-www-form-urlencoded'
    }, body: new URLSearchParams({
      [`cannon_${cannon.id}`]: '1', intent: 'commit', previewToken
    })
  });
  assert.equal(attach.status, 303);
  assert.equal(attach.headers.get('location'), `/vehicles/${vehicleId}`);
  const armedHtml = await (await fetch(`${base}/vehicles/${vehicleId}/customize`, {
    headers: { cookie }
  })).text();
  assert.match(armedHtml, new RegExp(`action="/vehicles/${vehicleId}/ammo"`));
  assert.match(armedHtml, /Fitted in portal 1/);
  assert.match(armedHtml, /1\/\d+ portals occupied/);
  assert.match(armedHtml, /name="quantity" min="1" max="3" value="1"/);
  assert.match(armedHtml, /Load 12 Cannonballs/);
  const load = await fetch(`${base}/vehicles/${vehicleId}/ammo`, {
    method: 'POST', redirect: 'manual', headers: {
      cookie, 'content-type': 'application/x-www-form-urlencoded'
    }, body: new URLSearchParams({ type: String(ammunition.type), quantity: '2' })
  });
  assert.equal(load.status, 303);
  assert.equal(load.headers.get('location'), `/vehicles/${vehicleId}/customize`);
  const rule = catalog.settings.ammunition_rules[ammunition.type];
  assert.equal(store.vehicleDetails(saved.id, vehicleId, 2000).ship[rule.storageField],
    Number(catalog.settings.shots_per_crate) * 2);
});

test('offers all Unranked things as cargo in Red-and-above vehicles', async (context) => {
  const catalog = loadLegacyCatalog();
  const store = new SqliteStore(':memory:');
  store.seedCatalog(catalog);
  const password = 'red cargo password';
  const vehicle = catalog.vehicles.find((entry) => entry.routeType === 0
    && catalog.byId.get(entry.itemId).rarity >= 4 && entry.capacity >= 3);
  const storedVehicle = catalog.vehicles.find((entry) =>
    catalog.byId.get(entry.itemId).rarity === 0);
  const ammoBox = catalog.boxes.find((entry) => catalog.byId.get(entry.itemId).rarity === 0);
  const ordinary = catalog.items.find((item) => item.rarity === 0
    && !catalog.vehicleByItemId.has(item.id)
    && !catalog.boxes.some((entry) => entry.itemId === item.id));
  assert.ok(vehicle && storedVehicle && ammoBox && ordinary);
  const player = createPlayer('Red Cargo', '', hashPassword(password), catalog, 1000, () => 0.5);
  player.inventory = {
    [vehicle.itemId]: 1, [storedVehicle.itemId]: 1, [ammoBox.itemId]: 1, [ordinary.id]: 1
  };
  player.inventoryByCity = { [player.cityId]: player.inventory };
  const saved = store.addPlayer(player);
  const vehicleId = store.activateVehicle(saved.id, vehicle.itemId);
  const server = createApp({ store, catalog, now: () => 2000 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${base}/login`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ name: player.name, password })
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const html = await (await fetch(`${base}/vehicles/${vehicleId}/cargo`, { headers: { cookie } })).text();
  for (const item of [catalog.byId.get(storedVehicle.itemId), catalog.byId.get(ammoBox.itemId), ordinary]) {
    assert.match(html, new RegExp(`name="cargo_${item.id}"`));
  }
  const cargoFields = {
    [`cargo_${storedVehicle.itemId}`]: '1', [`cargo_${ammoBox.itemId}`]: '1',
    [`cargo_${ordinary.id}`]: '1'
  };
  const preview = await fetch(`${base}/vehicles/${vehicleId}/cargo`, {
    method: 'POST', redirect: 'manual', headers: {
      cookie, 'content-type': 'application/x-www-form-urlencoded'
    }, body: new URLSearchParams({ ...cargoFields, intent: 'preview' })
  });
  assert.equal(preview.status, 200);
  const previewHtml = await preview.text();
  assert.match(previewHtml, /exact proposal is ready to commit/i);
  const previewToken = /name="previewToken" value="([^"]+)"/u.exec(previewHtml)?.[1];
  assert.ok(previewToken);
  assert.equal(store.vehicleDetails(saved.id, vehicleId, 2000).cargoSize, 0);
  const cargo = await fetch(`${base}/vehicles/${vehicleId}/cargo`, {
    method: 'POST', redirect: 'manual', headers: {
      cookie, 'content-type': 'application/x-www-form-urlencoded'
    }, body: new URLSearchParams({
      ...cargoFields, intent: 'commit', previewToken
    })
  });
  assert.equal(cargo.status, 303);
  assert.equal(cargo.headers.get('location'), `/vehicles/${vehicleId}`);
  assert.equal(store.vehicleDetails(saved.id, vehicleId, 2000).cargoSize, 3);
});

test('keeps Things and idle vehicle management scoped to their actual cities', async (context) => {
  const catalog = loadLegacyCatalog();
  const store = new SqliteStore(':memory:');
  store.seedCatalog(catalog);
  const password = 'city inventory audit password';
  const ship = catalog.vehicles.find((entry) => entry.routeType === 1
    && catalog.byId.get(entry.itemId).rarity === 6);
  const squid = catalog.items.find((item) => item.name === 'Squid');
  const kemetThing = catalog.items.find((item) => item.rarity === 6 && item.id !== squid.id
    && !catalog.vehicleByItemId.has(item.id));
  assert.ok(ship && squid && kemetThing);
  const player = createPlayer('City Inventory Audit', '', hashPassword(password), catalog, 1000,
    () => 0.5);
  player.knownCityIds = [1, 3];
  player.inventoryByCity = {
    1: { [ship.itemId]: 1, [squid.id]: 2 },
    3: { [ship.itemId]: 1, [kemetThing.id]: 1 }
  };
  player.inventory = player.inventoryByCity[1];
  const saved = store.addPlayer(player);
  const tzolkinShip = store.activateVehicle(saved.id, ship.itemId);
  store.renameVehicle(saved.id, tzolkinShip, 'Tzolk\'in Champion');
  store.changeCity(saved.id, 3, 1100);
  const kemetShip = store.activateVehicle(saved.id, ship.itemId);
  store.renameVehicle(saved.id, kemetShip, 'Kemet Champion');
  store.changeCity(saved.id, 1, 1200);

  const server = createApp({ store, catalog, now: () => 2000 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${base}/login`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ name: player.name, password })
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];

  const tzolkinVehicles = await (await fetch(`${base}/vehicles`, { headers: { cookie } })).text();
  assert.match(tzolkinVehicles, /Vehicles in Tzolk/);
  assert.match(tzolkinVehicles, new RegExp(`href="/vehicles/${tzolkinShip}"`));
  assert.doesNotMatch(tzolkinVehicles, new RegExp(`href="/vehicles/${kemetShip}"`));
  assert.match(tzolkinVehicles, /Vehicles in other cities/);
  assert.match(tzolkinVehicles, /action="\/cities\/3\/select"/);

  const localDetail = await (await fetch(`${base}/vehicles/${tzolkinShip}/cargo`, {
    headers: { cookie }
  })).text();
  assert.match(localDetail, new RegExp(`name="cargo_${squid.id}"`));
  assert.doesNotMatch(localDetail, new RegExp(`name="cargo_${kemetThing.id}"`));
  const remoteDetail = await (await fetch(`${base}/vehicles/${kemetShip}`, {
    headers: { cookie }
  })).text();
  assert.match(remoteDetail, /Switch city to manage this vehicle/);
  assert.doesNotMatch(remoteDetail, /name="cargo_/);

  const selectKemet = await fetch(`${base}/cities/3/select`, {
    method: 'POST', redirect: 'manual', headers: { cookie, referer: `${base}/vehicles` }
  });
  assert.equal(selectKemet.headers.get('location'), '/vehicles');
  const kemetVehicles = await (await fetch(`${base}/vehicles`, { headers: { cookie } })).text();
  assert.match(kemetVehicles, /Vehicles in Kemet/);
  assert.match(kemetVehicles, new RegExp(`href="/vehicles/${kemetShip}"`));
  assert.doesNotMatch(kemetVehicles, new RegExp(`href="/vehicles/${tzolkinShip}"`));
  const kemetDetail = await (await fetch(`${base}/vehicles/${kemetShip}/cargo`, {
    headers: { cookie }
  })).text();
  assert.match(kemetDetail, new RegExp(`name="cargo_${kemetThing.id}"`));
  assert.doesNotMatch(kemetDetail, new RegExp(`name="cargo_${squid.id}"`));

  const kemetThings = await (await fetch(`${base}/inventory`, { headers: { cookie } })).text();
  assert.match(kemetThings, new RegExp(`data-item-id="${kemetThing.id}"`));
  assert.doesNotMatch(kemetThings, new RegExp(`data-item-id="${squid.id}"`));
  await fetch(`${base}/cities/1/select`, {
    method: 'POST', redirect: 'manual', headers: { cookie, referer: `${base}/inventory` }
  });
  const tzolkinThings = await (await fetch(`${base}/inventory`, { headers: { cookie } })).text();
  assert.match(tzolkinThings, new RegExp(`data-item-id="${squid.id}"`));
  assert.doesNotMatch(tzolkinThings, new RegExp(`data-item-id="${kemetThing.id}"`));
});

test('lists a chosen inventory quantity without leaving Your Things', async (context) => {
  const catalog = loadLegacyCatalog();
  const store = new SqliteStore(':memory:');
  store.seedCatalog(catalog);
  const password = 'inline listing password';
  const item = catalog.items.find((candidate) => candidate.mineTypeId === 5
    && candidate.repairedItemId === null);
  const player = createPlayer('Inline Lister', '', hashPassword(password), catalog, 1000, () => 0.5);
  player.inventory = { [item.id]: 5 };
  player.inventoryByCity = { [player.cityId]: player.inventory };
  const saved = store.addPlayer(player);
  const buyerState = createPlayer('Inline Buyer', '', hashPassword(password), catalog, 1000, () => 0.5);
  buyerState.gold = 2000;
  const buyer = store.addPlayer(buyerState);
  const server = createApp({ store, now: () => 2000 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${base}/login`, {
    method: 'POST',
    redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ name: player.name, password })
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  store.database.prepare(`
    UPDATE catalog_items SET name = 'Live Database Thing', gold_value_units = 7770000 WHERE id = ?
  `).run(item.id);
  store.database.prepare("UPDATE catalog_rarities SET name = 'Live Database Rarity' WHERE id = ?")
    .run(item.rarity);
  const pump = catalog.machines.find((entry) => entry.type === 'pump');
  const pumpItem = catalog.byId.get(pump.itemId);
  store.database.prepare(`
    UPDATE catalog_machine_types
    SET name = 'Live Database Pump', description = 'Live database pump description',
      display_power_multiplier = 7
    WHERE id = ?
  `).run(pump.machineTypeId);
  const dwarf = catalog.dwarfTiers[0];
  store.database.prepare(`
    UPDATE catalog_dwarf_tiers
    SET minimum_find_rarity = 5, maximum_find_rarity = 6 WHERE rarity = ?
  `).run(dwarf.rarity);
  const fixedPrice = store.marketForItem(item.id, player.cityId).fixedPrice;

  const beforeHtml = await (await fetch(`${base}/inventory`, { headers: { cookie } })).text();
  assert.match(beforeHtml, /Live Database Thing/);
  assert.match(beforeHtml, /Live Database Rarity/);
  assert.match(beforeHtml, new RegExp(`action="/inventory/${item.id}/list"`));
  assert.match(beforeHtml, new RegExp(`List at ${fixedPrice}g each`));
  assert.match(beforeHtml, /name="quantity" min="1" max="5" value="1"/);
  assert.match(beforeHtml, new RegExp(
    `class="inventory-list-all-form" method="post" action="/inventory/${item.id}/list"><input type="hidden" name="quantity" value="5"><button class="secondary">List all</button>`
  ));
  assert.match(beforeHtml, new RegExp(
    `class="inventory-meld-form" method="post" action="/inventory/${item.id}/meld"><button class="secondary"[^>]*>Meld</button>`
  ));
  assert.match(beforeHtml, new RegExp(
    `class="recycle-all-form" method="post" action="/inventory/${item.id}/recycle"><input type="hidden" name="quantity" value="5"><button class="secondary">Recycle all`
  ));
  assert.doesNotMatch(beforeHtml, /Salvage/);
  assert.doesNotMatch(beforeHtml, new RegExp(`href="/market/items/${item.id}"`));
  assert.doesNotMatch(beforeHtml, new RegExp(`/inventory/${item.id}/sell`));

  const machineHtml = await (await fetch(`${base}/items/${pumpItem.id}`, { headers: { cookie } })).text();
  assert.match(machineHtml, /Live database pump description/);
  assert.match(machineHtml, new RegExp(
    `<dt>Power \\(P\\)</dt><dd>${catalog.settings.machine_power[pumpItem.rarity] * 7} kW</dd>`
  ));
  store.database.prepare(`
    UPDATE catalog_settings
    SET value_json = '["#000000","#123456","#234567","#345678","#456789","#56789a","#6789ab"]'
    WHERE key = 'rarity_color_hexes'
  `).run();
  const machineIcon = await (await fetch(`${base}/node/machine-icons/pump-1.svg`)).text();
  assert.match(machineIcon, /fill="#123456"/);
  assert.match(machineIcon, /<title>Live Database Pump machine<\/title>/);
  assert.match(machineIcon, /<circle r="6"\/>/);
  const dwarfHtml = await (await fetch(`${base}/items/${dwarf.itemId}`, { headers: { cookie } })).text();
  assert.match(dwarfHtml, /Live Database Rarity to Fabled/);

  const listing = await fetch(`${base}/inventory/${item.id}/list`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      cookie,
      referer: `${base}/inventory`,
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ quantity: '3' })
  });
  assert.equal(listing.status, 303);
  assert.equal(listing.headers.get('location'), '/inventory');
  assert.equal(store.playerById(saved.id).inventory[item.id], 2);
  assert.equal(store.inventoryCapacity(saved.id).itemCount, 2);
  const market = store.marketForItem(item.id, player.cityId);
  assert.equal(market.listings.length, 1);
  assert.equal(market.listings[0].quantity, 3);
  assert.equal(market.listings[0].price, fixedPrice);
  const afterHtml = await (await fetch(`${base}/inventory`, { headers: { cookie } })).text();
  assert.match(afterHtml, /3 things are now listed on the local market/);
  assert.match(afterHtml, /name="quantity" min="1" max="2" value="1"/);
  assert.match(afterHtml, /class="inventory-list-all-form"[^>]*><input type="hidden" name="quantity" value="2">/);
  const exchangeHtml = await (await fetch(`${base}/exchange`, { headers: { cookie } })).text();
  assert.doesNotMatch(exchangeHtml, new RegExp(`href="/market/items/${item.id}"`));
  assert.match(exchangeHtml, /No matching items are available to buy/);
  const buyerLogin = await fetch(`${base}/login`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ name: buyer.name, password })
  });
  const buyerCookie = buyerLogin.headers.get('set-cookie').split(';')[0];
  const buyerExchangeHtml = await (await fetch(`${base}/exchange`, {
    headers: { cookie: buyerCookie }
  })).text();
  assert.match(buyerExchangeHtml, /class="market-controls"/);
  assert.match(buyerExchangeHtml, /name="type"/);
  assert.match(buyerExchangeHtml, /name="sort"/);
  assert.match(buyerExchangeHtml, /3 available/);
  assert.doesNotMatch(buyerExchangeHtml, /3 owned/);
  assert.doesNotMatch(buyerExchangeHtml, /fixed value/);
  assert.match(buyerExchangeHtml, new RegExp(`href="/market/items/${item.id}"`));
  assert.match(buyerExchangeHtml, new RegExp(
    `action="/market/orders/${market.listings[0].id}/buy"[\\s\\S]*?<button>Buy</button>`
  ));
  const unlistedItem = catalog.items.find((entry) => entry.id !== item.id);
  assert.doesNotMatch(buyerExchangeHtml, new RegExp(`href="/market/items/${unlistedItem.id}"`));
  const filteredExchangeHtml = await (await fetch(
    `${base}/exchange?type=definitely-not-a-type&sort=price-asc`,
    { headers: { cookie: buyerCookie } }
  )).text();
  assert.match(filteredExchangeHtml, /No matching items are available to buy/);
  assert.match(filteredExchangeHtml, /value="price-asc" selected/);

  const listAll = await fetch(`${base}/inventory/${item.id}/list`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      cookie,
      referer: `${base}/inventory`,
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ quantity: '2' })
  });
  assert.equal(listAll.status, 303);
  assert.equal(store.playerById(saved.id).inventory[item.id] ?? 0, 0);
  assert.equal(store.marketForItem(item.id, player.cityId).listings
    .reduce((sum, entry) => sum + entry.quantity, 0), 5);

  store.database.prepare(
    "UPDATE catalog_settings SET value_json = '4321' WHERE key = 'starter_credits'"
  ).run();
  store.database.prepare(
    "UPDATE catalog_settings SET value_json = '2' WHERE key = 'starter_find_count'"
  ).run();
  const updateSetting = store.database.prepare(
    'UPDATE catalog_settings SET value_json = ? WHERE key = ?'
  );
  updateSetting.run('73', 'starter_item_limit');
  updateSetting.run('111', 'finding_poll_min_interval_ms');
  updateSetting.run('2222', 'finding_poll_empty_interval_ms');
  updateSetting.run('9999', 'finding_poll_max_interval_ms');
  updateSetting.run('4321', 'session_max_age_seconds');
  const registration = await fetch(`${base}/register`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      name: 'Live Starter', email: 'live-starter@example.test',
      password: 'live database starter password', acceptTerms: '1'
    })
  });
  assert.equal(registration.status, 303);
  assert.match(registration.headers.get('set-cookie'), /Max-Age=4321/);
  const liveStarter = store.findPlayer('Live Starter');
  assert.equal(liveStarter.credits, 4321);
  assert.equal(liveStarter.baseItemLimit, 73);
  assert.equal(liveStarter.discoveries.length, 2);
  const starterCookie = registration.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(base, {
    redirect: 'manual', headers: { cookie: starterCookie }
  })).headers.get('location'), '/verify-email');
  await verifyDevelopmentEmail(base, starterCookie);
  const starterHtml = await (await fetch(base, { headers: { cookie: starterCookie } })).text();
  assert.match(starterHtml, /data-poll-min-interval="111"/);
  assert.match(starterHtml, /data-poll-empty-interval="2222"/);
  assert.match(starterHtml, /data-poll-max-interval="9999"/);
});

test('keeps an unneeded Meld-button item in Things and explains why', async (context) => {
  const catalog = loadLegacyCatalog();
  const store = new SqliteStore(':memory:');
  store.seedCatalog(catalog);
  const password = 'unneeded meld password';
  const player = createPlayer('Meld Messenger', '', hashPassword(password), catalog, 1000, () => 0.5);
  const itemId = Number(Object.keys(player.inventory)[0]);
  const saved = store.addPlayer(player);
  const ownMeld = store.database.prepare(
    'INSERT INTO player_melds (player_id, meld_id, created_at) VALUES (?, ?, 1)'
  );
  for (const meld of catalog.melds.filter((entry) => entry.public)) ownMeld.run(saved.id, meld.id);
  const server = createApp({ store, catalog, now: () => 2000 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${base}/login`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ name: player.name, password })
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const before = store.playerById(saved.id).inventory[itemId];

  const disabledHtml = await (await fetch(`${base}/inventory`, { headers: { cookie } })).text();
  assert.match(disabledHtml, new RegExp(
    `action="/inventory/${itemId}/meld"><button class="secondary"[^>]* disabled>Meld</button>`
  ));
  assert.match(disabledHtml, /is not needed for any remaining meld/);

  const response = await fetch(`${base}/inventory/${itemId}/meld`, {
    method: 'POST', redirect: 'manual',
    headers: { cookie, referer: `${base}/inventory` }
  });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/inventory');
  assert.equal(store.playerById(saved.id).inventory[itemId], before);
  const html = await (await fetch(`${base}/inventory`, { headers: { cookie } })).text();
  assert.match(html, new RegExp(
    `${catalog.byId.get(itemId).name} is not needed for any remaining meld`
  ));
});

test('keeps Meld storage quiet and gives every created Meld a detailed occasion reveal', async (context) => {
  const catalog = loadLegacyCatalog();
  const store = new SqliteStore(':memory:');
  store.seedCatalog(catalog);
  const publicMelds = catalog.melds.filter((entry) => entry.public);
  const quietMeld = publicMelds.find((meld) =>
    meld.requirements.reduce((sum, requirement) => sum + requirement.count, 0) > 1);
  assert.ok(quietMeld);
  const sharedPair = publicMelds.flatMap((first, firstIndex) =>
    publicMelds.slice(firstIndex + 1).map((second) => ({ first, second })))
    .find(({ first, second }) => first.requirements.some((requirement) =>
      second.requirements.some((candidate) => candidate.itemId === requirement.itemId)));
  assert.ok(sharedPair);
  const password = 'meld occasion password';

  const ownEveryOtherMeld = (playerId, allowedIds) => {
    const insert = store.database.prepare(
      'INSERT INTO player_melds (player_id, meld_id, created_at) VALUES (?, ?, 1)'
    );
    for (const meld of publicMelds) {
      if (!allowedIds.has(meld.id)) insert.run(playerId, meld.id);
    }
  };
  const addPlayerWithInventory = (name, inventory) => {
    const player = createPlayer(name, '', hashPassword(password), catalog, 1000, () => 0.5);
    player.inventory = inventory;
    player.inventoryByCity = { [player.cityId]: player.inventory };
    return { player, saved: store.addPlayer(player) };
  };

  const quietRequirement = quietMeld.requirements[0];
  const quiet = addPlayerWithInventory('Quiet Meld Storage', { [quietRequirement.itemId]: 1 });
  ownEveryOtherMeld(quiet.saved.id, new Set([quietMeld.id]));

  const combined = new Map();
  for (const meld of [sharedPair.first, sharedPair.second]) {
    for (const requirement of meld.requirements) {
      combined.set(requirement.itemId, (combined.get(requirement.itemId) ?? 0) + requirement.count);
    }
  }
  const sharedItemId = sharedPair.first.requirements.find((requirement) =>
    sharedPair.second.requirements.some((candidate) => candidate.itemId === requirement.itemId)).itemId;
  const automatic = addPlayerWithInventory('Automatic Meld Occasion', { [sharedItemId]: 1 });
  ownEveryOtherMeld(automatic.saved.id, new Set([sharedPair.first.id, sharedPair.second.id]));
  const insertStash = store.database.prepare(
    'INSERT INTO meld_stash (player_id, item_id, quantity, stored_at) VALUES (?, ?, ?, 1)'
  );
  for (const [itemId, count] of combined) {
    const staged = count - (itemId === sharedItemId ? 1 : 0);
    if (staged > 0) insertStash.run(automatic.saved.id, itemId, staged);
  }

  const manualInventory = {};
  for (const requirement of quietMeld.requirements) {
    manualInventory[requirement.itemId] = (manualInventory[requirement.itemId] ?? 0)
      + requirement.count;
  }
  const manual = addPlayerWithInventory('Manual Meld Occasion', manualInventory);

  const server = createApp({ store, catalog, now: () => 2000 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const loginAs = async (name) => {
    const login = await fetch(`${base}/login`, {
      method: 'POST', redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ name, password })
    });
    return login.headers.get('set-cookie').split(';')[0];
  };

  const quietCookie = await loginAs(quiet.player.name);
  const quietDeposit = await fetch(`${base}/inventory/${quietRequirement.itemId}/meld`, {
    method: 'POST', redirect: 'manual', headers: { cookie: quietCookie }
  });
  assert.equal(quietDeposit.status, 303);
  const quietHtml = await (await fetch(`${base}/inventory`, { headers: { cookie: quietCookie } })).text();
  assert.match(quietHtml, /class="quiet-notice"/);
  assert.match(quietHtml, /moved to capacity-free Meld storage/);
  assert.doesNotMatch(quietHtml, /id="meld-dialog"/);
  assert.match(quietHtml, /id="flash-dialog-message"><\/p>/);

  const automaticCookie = await loginAs(automatic.player.name);
  const automaticDeposit = await fetch(`${base}/inventory/${sharedItemId}/meld`, {
    method: 'POST', redirect: 'manual', headers: { cookie: automaticCookie }
  });
  assert.equal(automaticDeposit.status, 303);
  const automaticHtml = await (await fetch(`${base}/inventory`, {
    headers: { cookie: automaticCookie }
  })).text();
  assert.match(automaticHtml, /id="meld-dialog"/);
  assert.match(automaticHtml, /2 new Melds are born!/);
  assert.equal((automaticHtml.match(/class="meld-occasion-card rarity-/g) ?? []).length, 2);
  for (const meld of [sharedPair.first, sharedPair.second]) {
    assert.match(automaticHtml, new RegExp(`href="/melds/${meld.id}"`));
    assert.match(automaticHtml, new RegExp(meld.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(automaticHtml, /The completed recipe/);
  assert.match(automaticHtml, /Full Meld details/);
  assert.match(automaticHtml, /Meld collection/);
  const spentRevealHtml = await (await fetch(`${base}/inventory`, {
    headers: { cookie: automaticCookie }
  })).text();
  assert.doesNotMatch(spentRevealHtml, /id="meld-dialog"/);

  const manualCookie = await loginAs(manual.player.name);
  const manualCreation = await fetch(`${base}/melds/${quietMeld.id}/create`, {
    method: 'POST', redirect: 'manual', headers: { cookie: manualCookie }
  });
  assert.equal(manualCreation.status, 303);
  assert.equal(manualCreation.headers.get('location'), `/melds/${quietMeld.id}`);
  const manualHtml = await (await fetch(`${base}/melds/${quietMeld.id}`, {
    headers: { cookie: manualCookie }
  })).text();
  assert.match(manualHtml, /id="meld-dialog"/);
  assert.match(manualHtml, /A new Meld is born!/);
  assert.match(manualHtml, /class="meld-reveal-recipe"/);
  assert.doesNotMatch(manualHtml, /meld created from your home-city things/);
});

test('uses the targeted no-hydration path for BLU-82 detonations', async (context) => {
  const catalog = loadLegacyCatalog();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-blast-route-'));
  const store = new SqliteStore(path.join(directory, 'game.sqlite'));
  store.seedCatalog(catalog);
  const password = 'blast route password';
  const blu82 = catalog.items.find((item) => item.name === 'BLU-82');
  const blaster = createPlayer('Route Blaster', '', hashPassword(password), catalog, 1000, () => 0.5);
  blaster.inventory[blu82.id] = 1;
  store.addPlayer(blaster);
  const server = createApp({ store, random: () => 0.5, now: () => 2000 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${base}/login`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ name: 'Route Blaster', password })
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  let hydrations = 0;
  let rewrites = 0;
  const hydrate = store.playerById.bind(store);
  const rewrite = store.savePlayer.bind(store);
  store.playerById = (...args) => { hydrations += 1; return hydrate(...args); };
  store.savePlayer = (...args) => { rewrites += 1; return rewrite(...args); };

  const response = await fetch(`${base}/mines/1/detonate`, {
    method: 'POST', redirect: 'manual', headers: {
      cookie, referer: `${base}/mines/1/equipment`,
      'content-type': 'application/x-www-form-urlencoded'
    }, body: new URLSearchParams({ itemId: String(blu82.id), count: '1' })
  });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/mines/1/equipment?detonated=1');
  assert.equal(hydrations, 0);
  assert.equal(rewrites, 0);
  assert.equal(store.database.prepare(
    'SELECT quantity FROM inventory WHERE player_id = 1 AND city_id = 1 AND item_id = ?'
  ).get(blu82.id), undefined);
  assert.equal(store.database.prepare(
    'SELECT COUNT(*) AS count FROM discoveries WHERE player_id = 1'
  ).get().count, 100);
  const reveal = await fetch(`${base}/mines/1/equipment?detonated=1`, {
    headers: { cookie }
  });
  const revealHtml = await reveal.text();
  assert.equal(reveal.status, 200);
  assert.match(revealHtml, /id="finding-dialog"/);
  assert.match(revealHtml, /id="flash-dialog-message"><\/p>/);
  assert.doesNotMatch(revealHtml, /Detonation (?:cleared|mined)/);
  const delivery = store.leaseFindings(1, '', 32001);
  assert.equal(delivery.state, 'ready');
  const explosiveFinding = delivery.findings.find((finding) => finding.source === 'explosives');
  assert.ok(explosiveFinding);
  assert.equal(explosiveFinding.cityName, "Tzolk'in");
  assert.equal(store.acknowledgeFindings(1, delivery.token) > 0, true);
});

test('serves finding polls and acknowledgements before the expensive request prelude', async (context) => {
  const catalog = loadLegacyCatalog();
  const store = new SqliteStore(':memory:');
  store.seedCatalog(catalog);
  const password = 'finding fast path password';
  const player = createPlayer('Finding Fast Path', '', hashPassword(password), catalog, 1000,
    () => 0.5);
  const saved = store.addPlayer(player);
  store.database.prepare('DELETE FROM finding_queue WHERE player_id = ?').run(saved.id);
  const server = createApp({ store, now: () => 100000 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  const calls = { catalog: 0, player: 0, bum: 0, dwarf: 0, validation: 0 };
  const loadCatalog = store.loadCatalog.bind(store);
  const playerById = store.playerById.bind(store);
  const runBumUpdate = store.runBumUpdate.bind(store);
  const runDwarfUpdate = store.runDwarfUpdate.bind(store);
  const hasPlayer = store.hasPlayer.bind(store);
  store.loadCatalog = (...args) => { calls.catalog += 1; return loadCatalog(...args); };
  store.playerById = (...args) => { calls.player += 1; return playerById(...args); };
  store.runBumUpdate = (...args) => { calls.bum += 1; return runBumUpdate(...args); };
  store.runDwarfUpdate = (...args) => { calls.dwarf += 1; return runDwarfUpdate(...args); };
  store.hasPlayer = (...args) => { calls.validation += 1; return hasPlayer(...args); };
  const resetCalls = () => {
    calls.catalog = 0;
    calls.player = 0;
    calls.bum = 0;
    calls.dwarf = 0;
    calls.validation = 0;
  };
  const assertSkippedPrelude = () => {
    assert.equal(calls.player, 0, 'finding APIs must not hydrate the full player');
    assert.equal(calls.bum, 0, 'finding APIs must not run the global Bum update');
    assert.equal(calls.dwarf, 0, 'finding APIs must not run the global Dwarf update');
  };

  resetCalls();
  const anonymous = await fetch(`${base}/api/findings`, { redirect: 'manual' });
  assert.equal(anonymous.status, 303);
  assert.equal(anonymous.headers.get('location'), '/');
  assert.deepEqual(calls, { catalog: 0, player: 0, bum: 0, dwarf: 0, validation: 0 });

  const login = await fetch(`${base}/login`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ name: player.name, password })
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];

  resetCalls();
  const emptyResponse = await fetch(`${base}/api/findings`, { headers: { cookie } });
  assert.equal(emptyResponse.status, 200);
  assert.equal((await emptyResponse.json()).state, 'empty');
  assert.equal(calls.catalog, 0, 'an empty poll must not load the catalog');
  assert.equal(calls.validation, 1, 'the fast path still validates the session subject');
  assertSkippedPrelude();

  resetCalls();
  const emptyAcknowledgement = await fetch(`${base}/api/findings/ack`, {
    method: 'POST', headers: {
      cookie, 'content-type': 'application/x-www-form-urlencoded'
    }, body: new URLSearchParams({ token: '00000000-0000-4000-8000-000000000000' })
  });
  assert.deepEqual(await emptyAcknowledgement.json(), { acknowledged: 0 });
  assert.equal(calls.catalog, 0, 'acknowledgement must not load the catalog');
  assert.equal(calls.validation, 1);
  assertSkippedPrelude();

  const item = catalog.items.find((candidate) => candidate.rarity === 6);
  store.database.prepare(`
    INSERT INTO finding_queue
      (player_id, item_id, quantity, source, city_id, found_at, queued_at, auto_recycled)
    VALUES (?, ?, 1, 'mine', 1, 1000, -100000, 0)
  `).run(saved.id, item.id);
  resetCalls();
  const readyResponse = await fetch(`${base}/api/findings`, { headers: { cookie } });
  const ready = await readyResponse.json();
  assert.equal(ready.state, 'ready');
  assert.match(ready.html, /finding-occasion-card/);
  assert.equal(calls.catalog, 1, 'HTML rendering loads the catalog only for a ready delivery');
  assertSkippedPrelude();

  resetCalls();
  const leasedResponse = await fetch(`${base}/api/findings`, { headers: { cookie } });
  assert.equal((await leasedResponse.json()).state, 'leased');
  assert.equal(calls.catalog, 0, 'observing another tab\'s lease must not load the catalog');
  assertSkippedPrelude();

  resetCalls();
  const resumedResponse = await fetch(
    `${base}/api/findings?lease=${encodeURIComponent(ready.token)}`, { headers: { cookie } }
  );
  assert.equal((await resumedResponse.json()).state, 'ready');
  assert.equal(calls.catalog, 1, 'resumed ready findings still need the HTML catalog');
  assertSkippedPrelude();

  resetCalls();
  const acknowledgement = await fetch(`${base}/api/findings/ack`, {
    method: 'POST', headers: {
      cookie, 'content-type': 'application/x-www-form-urlencoded'
    }, body: new URLSearchParams({ token: ready.token })
  });
  assert.deepEqual(await acknowledgement.json(), { acknowledged: 1 });
  assert.equal(calls.catalog, 0);
  assertSkippedPrelude();

  const invalid = await fetch(`${base}/api/findings?lease=${'x'.repeat(101)}`, {
    redirect: 'manual', headers: { cookie, referer: `${base}/` }
  });
  assert.equal(invalid.status, 303);
  assert.equal(invalid.headers.get('location'), '/');
  const followUpPoll = await fetch(`${base}/api/findings`, { headers: { cookie } });
  assert.equal((await followUpPoll.json()).state, 'empty');
  const home = await (await fetch(base, { headers: { cookie } })).text();
  assert.match(home, /Invalid finding lease\./,
    'a background finding poll must not consume a pending page flash');
});

test('reveals every finding source globally and keeps live findings off the Dwarf page', async (context) => {
  const catalog = loadLegacyCatalog();
  const store = new SqliteStore(':memory:');
  store.seedCatalog(catalog);
  const password = 'finding cards password';
  const player = createPlayer('Finding Cards', '', hashPassword(password), catalog, 1000, () => 0.5);
  player.mines[0].nextFindAt = 1000;
  const saved = store.addPlayer(player);
  const server = createApp({ store, catalog, random: () => 0.5, now: () => 2000 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${base}/login`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ name: player.name, password })
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];

  const claim = await fetch(`${base}/mines/1/claim`, {
    method: 'POST', redirect: 'manual', headers: { cookie }
  });
  assert.equal(claim.status, 303);
  assert.equal((await fetch(`${base}/dwarves/findings`, { headers: { cookie } })).status, 404);
  const minePageHtml = await (await fetch(base, { headers: { cookie } })).text();
  assert.match(minePageHtml, /id="finding-dialog"/);
  const delivery = store.leaseFindings(saved.id, '', 32001);
  assert.equal(delivery.state, 'ready');
  assert.ok(delivery.findings.some((finding) => finding.source === 'mine'));
  assert.ok(delivery.findings.every((finding, index, findings) =>
    index === 0 || findings[index - 1].rarity >= finding.rarity));
  assert.equal(store.leaseFindings(saved.id, '', 32002).state, 'leased');
  assert.equal(store.leaseFindings(saved.id, delivery.token, 32002).token, delivery.token);
  assert.equal(store.acknowledgeFindings(saved.id, delivery.token) > 0, true);

  const rare = catalog.items.find((item) => item.rarity === 6);
  const green = catalog.items.find((item) => item.rarity === 2);
  const insertOccasion = store.database.prepare(`
    INSERT INTO finding_queue
      (player_id, item_id, quantity, source, city_id, found_at, queued_at, auto_recycled)
    VALUES (?, ?, 1, ?, 1, ?, -100000, 0)
  `);
  const findingSources = ['mine', 'new-mine', 'explosives', 'dwarf', 'fishing', 'salvage'];
  findingSources.forEach((source, index) => insertOccasion.run(saved.id, rare.id, source, 1000 + index));
  const occasionResponse = await fetch(`${base}/api/findings`, { headers: { cookie } });
  const occasionDelivery = await occasionResponse.json();
  assert.equal(occasionResponse.status, 200);
  assert.equal(occasionDelivery.state, 'ready');
  assert.equal((occasionDelivery.html.match(/class="finding-occasion-card discovery-item-card/g) ?? []).length,
    findingSources.length);
  for (const source of findingSources) {
    assert.match(occasionDelivery.html, new RegExp(`data-finding-source="${source}"`));
  }
  assert.match(occasionDelivery.html, new RegExp(`<img src="${rare.largeImage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`));
  assert.match(occasionDelivery.html, /class="finding-facts"/);
  assert.match(occasionDelivery.html, /Full item details/);
  assert.match(occasionDelivery.html, /View inventory/);
  assert.match(occasionDelivery.html, /Open market/);
  assert.equal(store.acknowledgeFindings(saved.id, occasionDelivery.token), findingSources.length);

  const localMarketValue = store.marketForItem(rare.id, saved.cityId).fixedPrice;
  const marketHtml = await (await fetch(`${base}/market/items/${rare.id}`, {
    headers: { cookie }
  })).text();
  assert.match(marketHtml, new RegExp(`fixed local value is <strong>${localMarketValue}g</strong>`));
  assert.doesNotMatch(marketHtml, /name="price"/);
  store.database.prepare('DELETE FROM discoveries WHERE player_id = ?').run(saved.id);
  const insert = store.database.prepare(`
    INSERT INTO discoveries
      (player_id, position, item_id, mine_id, city_id, found_at, exploded, dwarfed)
    VALUES (?, ?, ?, 0, 1, ?, 0, 1)
  `);
  insert.run(saved.id, 0, green.id, 1999);
  insert.run(saved.id, 1, rare.id, 1998);

  const dwarfPageHtml = await (await fetch(`${base}/dwarves`, { headers: { cookie } })).text();
  assert.doesNotMatch(dwarfPageHtml, /dwarf-findings-feed|Live discoveries|Trash competition/);
  assert.match(dwarfPageHtml, /Your working Dwarves/);
  assert.equal((await fetch(`${base}/node/dwarf-findings.js`)).status, 404);
});

test('switches city-scoped mine views and rejects cross-city detonations', async (context) => {
  const catalog = loadLegacyCatalog();
  const store = new SqliteStore(':memory:');
  store.seedCatalog(catalog);
  const password = 'city scope password';
  const explosive = catalog.items.find((item) => item.name === 'BLU-82');
  const player = createPlayer('City Miner', '', hashPassword(password), catalog, 1000, () => 0.5);
  player.knownCityIds = [1, 2];
  player.mines.push({
    ...structuredClone(player.mines[0]), id: 2, mineTypeId: explosive.mineTypeId, cityId: 2,
    priority: 2, nextFindAt: 5000, equipment: {}, robotItemId: null
  });
  player.nextMineId = 3;
  player.inventoryByCity[2] = { [explosive.id]: 1 };
  const saved = store.addPlayer(player);
  const server = createApp({ store, random: () => 0.5, now: () => 2000 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${base}/login`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ name: player.name, password })
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];

  const firstCityHtml = await (await fetch(`${base}/`, { headers: { cookie } })).text();
  assert.match(firstCityHtml, /Mines in Tzolk/);
  assert.match(firstCityHtml, /\/mines\/1\/equipment/);
  assert.doesNotMatch(firstCityHtml, /\/mines\/2\/equipment/);

  const select = await fetch(`${base}/cities/2/select`, {
    method: 'POST', redirect: 'manual', headers: { cookie }
  });
  assert.equal(select.status, 303);
  const secondCityHtml = await (await fetch(`${base}/`, { headers: { cookie } })).text();
  assert.match(secondCityHtml, /Mines in Burgundy/);
  assert.match(secondCityHtml, /\/mines\/2\/equipment/);
  assert.doesNotMatch(secondCityHtml, /\/mines\/1\/equipment/);

  await fetch(`${base}/cities/1/select`, { method: 'POST', redirect: 'manual', headers: { cookie } });
  const before = store.database.prepare(
    'SELECT quantity FROM inventory WHERE player_id = ? AND city_id = 2 AND item_id = ?'
  ).get(saved.id, explosive.id).quantity;
  const blast = await fetch(`${base}/mines/2/detonate`, {
    method: 'POST', redirect: 'manual', headers: {
      cookie, referer: `${base}/`, 'content-type': 'application/x-www-form-urlencoded'
    }, body: new URLSearchParams({ itemId: String(explosive.id), count: '1' })
  });
  assert.equal(blast.status, 303);
  assert.equal(store.database.prepare(
    'SELECT quantity FROM inventory WHERE player_id = ? AND city_id = 2 AND item_id = ?'
  ).get(saved.id, explosive.id).quantity, before);
  const rejectedHtml = await (await fetch(`${base}/`, { headers: { cookie } })).text();
  assert.match(rejectedHtml, /Travel to this mine’s city before detonating explosives/);

  store.database.prepare('UPDATE catalog_mine_types SET name = ? WHERE id = ?')
    .run('Database Explosives', explosive.mineTypeId);
  const filteredProfile = await (await fetch(
    `${base}/miners/City%20Miner?city=2&function=Boosts`,
    { headers: { cookie } }
  )).text();
  assert.match(filteredProfile, /1 matching things · 6 globally/);
  assert.match(filteredProfile, new RegExp(explosive.name));
  assert.match(filteredProfile, /value="2" selected>Burgundy/);
  assert.match(filteredProfile, /Database Explosives/);

  const remoteLoadout = await fetch(`${base}/mines/2/equipment`, {
    redirect: 'manual', headers: { cookie }
  });
  assert.equal(remoteLoadout.status, 303);
});

test('provides a typed inbox and safe full views for system messages', async (context) => {
  const catalog = loadLegacyCatalog();
  const store = new SqliteStore(':memory:');
  store.seedCatalog(catalog);
  const password = 'typed inbox password';
  const ada = store.addPlayer(createPlayer(
    'Typed Inbox Ada', '', hashPassword(password), catalog, 1000, () => 0.5
  ));
  const grace = store.addPlayer(createPlayer(
    'Typed Inbox Grace', '', hashPassword(password), catalog, 1000, () => 0.5
  ));
  const privateMessageId = store.sendMessage(
    grace.id, ada.name, 'A private conversation remains private', 2000
  );
  const longReport = `Arrived safely <script>alert('no')</script>.\n${'Cargo accounted for. '.repeat(12)}TAIL OF REPORT\n[rrl=vehicles/41]Open journey[/rrl]\n[rrl=https://example.test]Unsafe destination[/rrl]`;
  const vehicleMessageId = Number(store.database.prepare(`
    INSERT INTO messages
      (sender_id, recipient_id, message_type, subject, body, created_at)
    VALUES (NULL, ?, 'Vehicle', 'The Wayfarer arrived', ?, 3000)
  `).run(ada.id, longReport).lastInsertRowid);
  store.database.prepare(`
    INSERT INTO messages
      (sender_id, recipient_id, message_type, subject, body, created_at)
    VALUES (NULL, ?, 'City', 'City report', 'A city changed.', 2500)
  `).run(ada.id);
  const rewardItems = [6, 5, 2].map((rarity, index) => {
    const item = catalog.items.find((candidate) => candidate.rarity === rarity);
    return { itemId: item.id, name: item.name, rarity: item.rarity, quantity: index + 1 };
  });
  const bountyList = rewardItems.map((item) => `${item.quantity}× ${item.name}`).join(', ');
  const krakenMessageId = Number(store.database.prepare(`
    INSERT INTO messages
      (sender_id, recipient_id, message_type, subject, body, details_json, is_read, created_at)
    VALUES (NULL, ?, 'Vehicle', 'Kraken defeated', ?, ?, 1, 2600)
  `).run(ada.id,
    `Your Krakenbreaker dealt 244 damage to the Kraken and took 24 damage. You defeated it. The remaining 6 cargo slots were filled with bounty: ${bountyList}.`,
    JSON.stringify({ event: 'world-creature-combat', defeated: true, rewards: rewardItems,
      actions: [{ label: 'Manage vehicle', path: '/vehicles/41' }] })
  ).lastInsertRowid);

  const originalMessageForPlayer = store.messageForPlayer.bind(store);
  store.messageForPlayer = (playerId, messageId) => {
    const message = originalMessageForPlayer(playerId, messageId);
    if (messageId !== vehicleMessageId) return message;
    return {
      ...message,
      details: {
        ...message.details,
        actions: [
          { label: 'Manage the Wayfarer', path: '/vehicles/41' },
          { label: 'Protocol-relative escape', path: '//example.test/escape' },
          { label: 'External escape', path: 'https://example.test/escape' }
        ]
      }
    };
  };

  let currentTime = 4000;
  const server = createApp({ store, catalog, now: () => currentTime });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${base}/login`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ name: ada.name, password })
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];

  const inbox = await fetch(`${base}/messages`, { headers: { cookie } });
  assert.equal(inbox.status, 200);
  const inboxHtml = await inbox.text();
  assert.match(inboxHtml, /<p class="eyebrow">Inbox<\/p><h1>Messages<\/h1>/);
  assert.doesNotMatch(inboxHtml, /Private messages/);
  for (const label of ['PM', 'Vehicle', 'City', 'Machine', 'Market', 'Factory']) {
    assert.match(inboxHtml, new RegExp(`>${label}<\\/a>`));
  }
  assert.match(inboxHtml, new RegExp(`href="/messages/view/${vehicleMessageId}"`));
  assert.match(inboxHtml, new RegExp(`href="/messages/${encodeURIComponent(grace.name)}"`));
  assert.match(inboxHtml, /28-day mailbox/);
  assert.match(inboxHtml, />Keep<\/button>/);
  assert.match(inboxHtml, /Deletes 29\/01\/1970/);

  const vehicleInbox = await fetch(
    `${base}/messages?filter=unread&type=Vehicle`, { headers: { cookie } }
  );
  assert.equal(vehicleInbox.status, 200);
  const vehicleInboxHtml = await vehicleInbox.text();
  assert.match(vehicleInboxHtml, /The Wayfarer arrived/);
  assert.doesNotMatch(vehicleInboxHtml, /City report/);
  assert.doesNotMatch(vehicleInboxHtml, /A private conversation remains private/);
  assert.match(vehicleInboxHtml, /href="\/messages\?filter=unread&type=City"/);

  const detail = await fetch(`${base}/messages/view/${vehicleMessageId}`, { headers: { cookie } });
  assert.equal(detail.status, 200);
  const detailHtml = await detail.text();
  assert.match(detailHtml, /TAIL OF REPORT/);
  assert.match(detailHtml, /&lt;script&gt;alert\(&#39;no&#39;\)&lt;\/script&gt;/);
  assert.doesNotMatch(detailHtml, /<script>alert/);
  assert.match(detailHtml, /href="\/vehicles\/41">Open journey<\/a>/);
  assert.match(detailHtml, /href="\/vehicles\/41">Manage the Wayfarer<\/a>/);
  assert.doesNotMatch(detailHtml, /href="\/\/example\.test/);
  assert.doesNotMatch(detailHtml, /href="https:\/\/example\.test/);
  assert.match(detailHtml, /Messages \(2\)/);
  assert.match(detailHtml, /Keep this message/);

  const krakenDetail = await fetch(`${base}/messages/view/${krakenMessageId}`, {
    headers: { cookie }
  });
  assert.equal(krakenDetail.status, 200);
  const krakenHtml = await krakenDetail.text();
  assert.match(krakenHtml, /<h2 id="message-items-\d+-0">Bounty<\/h2><span>6 things<\/span>/);
  assert.doesNotMatch(krakenHtml, /filled with bounty:/);
  for (const reward of rewardItems) {
    const item = catalog.byId.get(reward.itemId);
    assert.ok(krakenHtml.includes(`class="message-item rarity-${item.rarity}"`));
    assert.ok(krakenHtml.includes(`href="/items/${item.id}"`));
    assert.ok(krakenHtml.includes(`src="${item.icon}"`));
    assert.ok(krakenHtml.includes(`<strong>${item.name}</strong>`));
  }

  const keep = await fetch(`${base}/messages/actions`, {
    method: 'POST', redirect: 'manual', headers: {
      cookie, 'content-type': 'application/x-www-form-urlencoded'
    }, body: new URLSearchParams({
      [`message_${vehicleMessageId}`]: '1', action: 'keep', filter: 'all', type: 'Vehicle'
    })
  });
  assert.equal(keep.status, 303);
  assert.equal(store.messageForPlayer(ada.id, vehicleMessageId).kept, true);

  const privateDetail = await fetch(`${base}/messages/view/${privateMessageId}`, {
    redirect: 'manual', headers: { cookie }
  });
  assert.equal(privateDetail.status, 303);
  assert.equal(privateDetail.headers.get('location'), `/messages/${encodeURIComponent(grace.name)}`);

  const bulkAction = await fetch(`${base}/messages/actions`, {
    method: 'POST', redirect: 'manual', headers: {
      cookie, 'content-type': 'application/x-www-form-urlencoded'
    }, body: new URLSearchParams({
      [`message_${vehicleMessageId}`]: '1', action: 'delete', filter: 'unread', type: 'Vehicle'
    })
  });
  assert.equal(bulkAction.status, 303);
  assert.equal(bulkAction.headers.get('location'), '/messages?filter=unread&type=Vehicle');
  currentTime = 3000 + Number(catalog.settings.message_retention_ms) + 1;
  await fetch(`${base}/messages`, { headers: { cookie } });
  assert.deepEqual(store.database.prepare(
    'SELECT id, is_kept, is_deleted FROM messages WHERE recipient_id = ? ORDER BY id'
  ).all(ada.id).map((row) => [row.id, row.is_kept, row.is_deleted]),
  [[vehicleMessageId, 1, 1]]);
});

test('supports registration and authenticated play pages', async (context) => {
  const catalog = loadLegacyCatalog();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-'));
  const databaseFile = path.join(directory, 'minethings.sqlite');
  const server = createApp({ databaseFile, legacyJsonFile: null, random: () => 0.5, now: () => 1000 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 200);
  assert.ok((await health.json()).items > 300);
  assert.equal(health.headers.get('cache-control'), 'no-store');
  assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(health.headers.get('x-frame-options'), 'DENY');
  assert.match(health.headers.get('content-security-policy'), /object-src 'none'/);

  for (const asset of [
    '/img/home.gif', '/css/styles10.css', '/app/webroot/img/footer.jpg',
    '/node/landing-rebirth.jpg', '/img/home_bg.jpg', '/node/map-background.png'
  ]) {
    const response = await fetch(`${base}${asset}`);
    assert.equal(response.status, 200, asset);
    assert.ok(Number(response.headers.get('content-length')) > 0, asset);
    if (/\.(?:jpg|png)$/u.test(asset)) assert.match(response.headers.get('content-type'), /^image\//u, asset);
  }
  assert.equal((await fetch(`${base}/portal/img/colors.jpg`)).status, 404);
  assert.equal((await fetch(`${base}/app/webroot/index.php`)).status, 404);
  const cachedAsset = await fetch(`${base}/img/home.gif`);
  assert.ok(cachedAsset.headers.get('etag'));
  const notModified = await fetch(`${base}/img/home.gif`, {
    headers: { 'if-none-match': cachedAsset.headers.get('etag') }
  });
  assert.equal(notModified.status, 304);

  const registrationPage = await fetch(base);
  const registrationHtml = await registrationPage.text();
  assert.equal(registrationPage.status, 200);
  assert.match(registrationPage.headers.get('content-type'), /^text\/html/u);
  assert.match(registrationHtml, /<body class="landing-body">/u);
  assert.match(registrationHtml, /class="rebirth-landing"/u);
  assert.match(registrationHtml, /id="landing-title"[^>]*>.*From the ashes/su);
  assert.match(registrationHtml, /MineThings <em>2<\/em>/u);
  assert.match(registrationHtml, /href="\/history">Become part of internet history/u);
  assert.match(registrationHtml, /class="skip-link" href="#content"/u);
  assert.equal((registrationHtml.match(/<main id="content"/gu) ?? []).length, 1);
  assert.match(registrationHtml,
    /<form class="landing-auth-card landing-register-card" method="post" action="\/register" aria-labelledby="landing-register-title">/u);
  assert.match(registrationHtml,
    /<form id="returning-miner" class="landing-auth-card landing-login-card" method="post" action="\/login" aria-labelledby="landing-login-title">/u);
  assert.match(registrationHtml, /name="email"[^>]*autocomplete="email"[^>]*required/u);
  assert.match(registrationHtml, /name="acceptTerms" value="1" required/u);
  assert.match(registrationHtml, /href="\/legal" target="_blank" rel="noopener">Terms and Privacy Notice/u);
  assert.doesNotMatch(registrationHtml, /id="left"/u);
  assert.doesNotMatch(registrationHtml, /live-updates\.js/u);
  const landingIds = [...registrationHtml.matchAll(/\sid="([^"]+)"/gu)].map((match) => match[1]);
  assert.equal(new Set(landingIds).size, landingIds.length, 'guest landing IDs must be unique');
  assert.match(registrationHtml,
    /pattern="\[\\p\{L\}\\p\{M\}\\p\{N\}\\p\{P\}\\p\{S\} \]\+"/);

  const registration = await fetch(`${base}/register`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ name: 'Ada', email: 'ada@example.test', password: 'correct horse', acceptTerms: '1' })
  });
  assert.equal(registration.status, 303);
  assert.equal(registration.headers.get('location'), '/verify-email');
  const cookie = registration.headers.get('set-cookie').split(';')[0];
  const lockedHome = await fetch(base, { redirect: 'manual', headers: { cookie } });
  assert.equal(lockedHome.status, 303);
  assert.equal(lockedHome.headers.get('location'), '/verify-email');
  const verificationToken = await verifyDevelopmentEmail(base, cookie);
  const replay = await fetch(`${base}/verify-email/confirm`, {
    method: 'POST', redirect: 'manual',
    headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token: verificationToken })
  });
  assert.equal(replay.status, 400);
  const missingEmailRegistration = await fetch(`${base}/register`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      name: 'No Email', password: 'missing email password', acceptTerms: '1'
    })
  });
  assert.equal(missingEmailRegistration.status, 400);
  const duplicateEmailRegistration = await fetch(`${base}/register`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      name: 'Duplicate Email', email: 'ADA@EXAMPLE.TEST',
      password: 'duplicate email password', acceptTerms: '1'
    })
  });
  assert.equal(duplicateEmailRegistration.status, 400);

  const unicodeName = 'هومة من ق';
  const unicodeRegistration = await fetch(`${base}/register`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      name: unicodeName, email: 'unicode@example.test',
      password: 'unicode miner password', acceptTerms: '1'
    })
  });
  assert.equal(unicodeRegistration.status, 303);
  const unicodeLogin = await fetch(`${base}/login`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ name: unicodeName, password: 'unicode miner password' })
  });
  assert.equal(unicodeLogin.status, 303);
  assert.equal(unicodeLogin.headers.get('location'), '/verify-email');
  const unsafeUnicodeRegistration = await fetch(`${base}/register`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      name: 'Bad\u202eName', email: 'unsafe@example.test',
      password: 'unicode miner password', acceptTerms: '1'
    })
  });
  assert.equal(unsafeUnicodeRegistration.status, 400);

  const dashboard = await fetch(base, { headers: { cookie } });
  assert.equal(dashboard.status, 200);
  const dashboardHtml = await dashboard.text();
  assert.doesNotMatch(dashboardHtml, /class="rebirth-landing"/u);
  assert.match(dashboardHtml, /Ada’s mines/);
  assert.match(dashboardHtml, /id="logo"/);
  assert.match(dashboardHtml, /class="home"/);
  assert.match(dashboardHtml, /href="\/" aria-current="page">Mines<\/a>/);
  assert.match(dashboardHtml, /class="skip-link" href="#content"/);
  assert.match(dashboardHtml, /equipment\/src\/Bot\.png/);

  const inventory = await fetch(`${base}/inventory`, { headers: { cookie } });
  assert.equal(inventory.status, 200);
  const inventoryHtml = await inventory.text();
  assert.match(inventoryHtml, /5 owned/);
  assert.match(inventoryHtml, /href="\/inventory" aria-current="page">Things<\/a>/);

  const loadout = await fetch(`${base}/mines/1/equipment`, { headers: { cookie } });
  assert.equal(loadout.status, 200);
  const loadoutHtml = await loadout.text();
  assert.match(loadoutHtml, /Bot loadout/);
  assert.match(loadoutHtml, /equipment\/src\/NoBoots\.png/);
  assert.match(loadoutHtml, /item-card-compact item-card-unavailable/);
  assert.match(loadoutHtml, /href="\/items\/282"/);

  const gadgets = await fetch(`${base}/gadgets`, { headers: { cookie } });
  assert.equal(gadgets.status, 200);
  assert.match(await gadgets.text(), /Boosts equipment by 25%/);

  const melds = await fetch(`${base}/melds?q=Sunday`, { headers: { cookie } });
  assert.equal(melds.status, 200);
  assert.match(await melds.text(), /Sunday/);

  const meld = await fetch(`${base}/melds/52`, { headers: { cookie } });
  assert.equal(meld.status, 200);
  assert.match(await meld.text(), /Recipe/);

  const titleDatabase = new DatabaseSync(databaseFile);
  titleDatabase.prepare(`
    UPDATE specialisation_tenure SET active_ms = ?
    WHERE player_id = (SELECT id FROM players WHERE name = 'Ada') AND specialisation_id = 0
  `).run(1044 * Number(catalog.settings.day_ms));
  titleDatabase.close();
  const professions = await fetch(`${base}/professions`, { headers: { cookie } });
  assert.equal(professions.status, 200);
  const professionsHtml = await professions.text();
  assert.match(professionsHtml, /Grandmaster Bum/);
  assert.match(professionsHtml, /1,044 charged days/);
  assert.match(professionsHtml, /Highest legacy title earned/);
  assert.match(professionsHtml, /switching preserves progress/);

  const worldEvents = await fetch(`${base}/events`, { headers: { cookie } });
  assert.equal(worldEvents.status, 200);
  const worldEventsHtml = await worldEvents.text();
  assert.match(worldEventsHtml, /World Events/);
  assert.match(worldEventsHtml, /Lunar influence/);
  assert.match(worldEventsHtml, /Cambridge 1991-2020 baseline/);
  assert.match(worldEventsHtml, /Storms can damage or sink ships/);

  const factories = await fetch(`${base}/factories`, { headers: { cookie } });
  assert.equal(factories.status, 200);
  const factoriesHtml = await factories.text();
  assert.match(factoriesHtml, /Build factory/);
  assert.match(factoriesHtml, /\/market\/factories\/rental/);
  const factoryRentalMarket = await fetch(`${base}/market/factories/rental`, { headers: { cookie } });
  assert.equal(factoryRentalMarket.status, 200);
  const factoryRentalHtml = await factoryRentalMarket.text();
  assert.match(factoryRentalHtml, /240h 0m/);
  assert.match(factoryRentalHtml, /src="\/legacy\/img\/icons\/I2\.png"/);
  const factorySaleMarket = await fetch(`${base}/market/factories/sale`, { headers: { cookie } });
  assert.equal(factorySaleMarket.status, 200);
  assert.match(await factorySaleMarket.text(), /Buy and sell whole built factories/);

  const catalogDatabase = new DatabaseSync(databaseFile);
  try {
    const renameItem = catalogDatabase.prepare('UPDATE catalog_items SET name = ? WHERE id = ?');
    renameItem.run('Live Scout', Number(catalog.settings.search_plane_item_id));
    renameItem.run('Live Striker', Number(catalog.settings.bomber_item_id));
    renameItem.run('Live Lifter', Number(catalog.settings.helicopter_item_id));
    renameItem.run('Live Crude', Number(catalog.settings.oil_item_id));
    catalogDatabase.prepare('UPDATE catalog_mine_types SET icon = ? WHERE id = ?')
      .run('/live-database-mine-icon.svg', Number(catalog.settings.starter_mine_type_id));
    const updateSetting = catalogDatabase.prepare(
      'UPDATE catalog_settings SET value_json = ? WHERE key = ?'
    );
    updateSetting.run(JSON.stringify({ sale: 'Live Foundry', rental: 'Live Foundry Lease' }),
      'factory_market_names');
    updateSetting.run(JSON.stringify('/live-database-factory-icon.svg'), 'factory_market_icon');
    const statsLabels = structuredClone(catalog.settings.public_stats_labels);
    statsLabels.sections.gold = 'Live Bullion';
    statsLabels.rows.activeGold = 'Live active bullion';
    updateSetting.run(JSON.stringify(statsLabels), 'public_stats_labels');
  } finally {
    catalogDatabase.close();
  }
  const liveFactoryRentalHtml = await (await fetch(
    `${base}/market/factories/rental`, { headers: { cookie } }
  )).text();
  assert.match(liveFactoryRentalHtml, /Live Foundry Lease/);
  assert.match(liveFactoryRentalHtml, /src="\/live-database-factory-icon\.svg"/);
  const liveFactorySaleHtml = await (await fetch(
    `${base}/market/factories/sale`, { headers: { cookie } }
  )).text();
  assert.match(liveFactorySaleHtml, /Live Foundry/);
  assert.match(liveFactorySaleHtml, /src="\/live-database-factory-icon\.svg"/);
  const oilField = await fetch(`${base}/oil-field`, { headers: { cookie } });
  assert.equal(oilField.status, 200);
  const oilFieldHtml = await oilField.text();
  assert.match(oilFieldHtml, /Pump, pipe, and pack 159 litres/);
  assert.match(oilFieldHtml, /class="oil-field-board-shell" data-hex-count="469"/);
  assert.match(oilFieldHtml, /\/js\/machines11\.js/);
  assert.match(oilFieldHtml, /\/node\/oil-field\.js/);
  assert.match(oilFieldHtml, /Queue a replacement/);
  assert.match(oilFieldHtml, /Bomb a hex/);
  assert.match(oilFieldHtml, /Live Scout/);
  assert.match(oilFieldHtml, /Live Striker/);
  assert.match(oilFieldHtml, /Live Lifter/);
  assert.match(oilFieldHtml, /barrel of Live Crude/);
  for (const packer of catalog.machines.filter((machine) => machine.rules.canPack)) {
    assert.match(oilFieldHtml, new RegExp(catalog.byId.get(packer.itemId).name));
  }
  const oilFieldClient = await fetch(`${base}/node/oil-field.js`);
  assert.match(await oilFieldClient.text(), /the barrels will remain here and can then be claimed/);
  const vacuum = catalog.machines.find((machine) => machine.type === 'vacuum');
  const vacuumItem = await fetch(`${base}/items/${vacuum.itemId}`, { headers: { cookie } });
  const vacuumHtml = await vacuumItem.text();
  assert.match(vacuumHtml, /class="detail-image[^"]*" src="\/node\/machine-icons\/vacuum-[0-6]\.svg"/);
  assert.doesNotMatch(vacuumHtml, /class="detail-icon"/);
  assert.match(vacuumHtml, /3 × \(10 \+ floor\(melds \/ 10\)\) L\/h/);
  assert.match(vacuumHtml, /<dt>Power \(P\)<\/dt><dd>3 kW<\/dd>/);
  assert.match(vacuumHtml, /<dt>Lifespan<\/dt><dd>12 days<\/dd>/);

  const chatPost = await fetch(`${base}/chat`, {
    method: 'POST', redirect: 'manual', headers: {
      cookie, 'content-type': 'application/x-www-form-urlencoded'
    }, body: new URLSearchParams({ body: '<b>Hello miners</b>' })
  });
  assert.equal(chatPost.status, 303);
  const liveDatabase = new DatabaseSync(databaseFile);
  liveDatabase.prepare(
    "UPDATE catalog_settings SET value_json = '37' WHERE key = 'chat_message_max_length'"
  ).run();
  liveDatabase.prepare("UPDATE chats SET color = 'abcdef'").run();
  liveDatabase.prepare(`
    INSERT INTO world_chat_announcements (event_key, body, path, created_at)
    VALUES ('test-world-chat', 'Kraken sighted near Kemet.', '/events', 2000)
  `).run();
  liveDatabase.prepare(`
    INSERT INTO world_chat_announcements (event_key, body, path, created_at)
    VALUES ('expired-world-chat', 'This announcement is more than a day old.', '/events', ?)
  `).run(1000 - Number(catalog.settings.chat_history_window_ms) - 1);
  const rareChatItem = catalog.items.find((item) => item.rarity === 6);
  liveDatabase.prepare(`
    INSERT INTO world_chat_announcements
      (event_key, announcement_type, body, path, created_at)
    VALUES ('test-rare-chat', 'rare-orange', 'Ada found a Legendary thing.', ?, 2001)
  `).run(`/items/${rareChatItem.id}`);
  const yellowDwarf = catalog.byId.get(catalog.dwarfByRarity.get(1).itemId);
  liveDatabase.prepare(`
    INSERT INTO world_chat_announcements
      (event_key, announcement_type, body, path, created_at)
    VALUES ('test-dwarf-chat', 'dwarf-capture',
      'Ada captured a Yellow Dwarf while mining in Tzolk''in.', ?, 2002)
  `).run(`/items/${yellowDwarf.id}`);
  liveDatabase.close();
  const chat = await fetch(`${base}/chat`, { headers: { cookie } });
  assert.equal(chat.status, 200);
  const chatHtml = await chat.text();
  assert.match(chatHtml, /&lt;b&gt;Hello miners&lt;\/b&gt;/);
  assert.doesNotMatch(chatHtml, /<b>Hello miners<\/b>/);
  assert.match(chatHtml, /maxlength="37"/);
  assert.match(chatHtml, /Showing the latest 24 hours/);
  assert.match(chatHtml, /id="chat-log" class="chat-list" role="log"/);
  assert.match(chatHtml, /class="chat-row chat-row-player" style="--chat-color:#abcdef"/);
  assert.match(chatHtml, /class="chat-speaker"/);
  assert.match(chatHtml, /class="chat-message"/);
  assert.match(chatHtml, /class="chat-row chat-row-world"/);
  assert.match(chatHtml, /Kraken sighted near Kemet\./);
  assert.match(chatHtml, /class="chat-world-link" href="\/events">Details<\/a>/);
  assert.match(chatHtml, new RegExp(`class="chat-world-message chat-rare-item rarity-6" href="/items/${rareChatItem.id}"`));
  assert.ok(chatHtml.includes(`src="${rareChatItem.icon}"`));
  assert.match(chatHtml, /Ada found a Legendary thing\./);
  assert.match(chatHtml, /class="chat-row chat-row-world chat-row-dwarf rarity-1"/);
  assert.match(chatHtml, /Dwarf captured/);
  assert.match(chatHtml, new RegExp(
    `class="chat-world-message chat-dwarf-item rarity-1" href="/items/${yellowDwarf.id}"`
  ));
  assert.ok(chatHtml.includes(`src="${yellowDwarf.icon}"`));
  assert.match(chatHtml, /Ada captured a Yellow Dwarf while mining/);
  assert.doesNotMatch(chatHtml, /This announcement is more than a day old/);
  assert.doesNotMatch(chatHtml, /chat-color-abcdef/);

  const banks = await fetch(`${base}/banks`, { headers: { cookie } });
  assert.equal(banks.status, 410);
  assert.match(await banks.text(), /Banking has been removed/);

  const creditShop = await fetch(`${base}/market`, { headers: { cookie } });
  const creditShopHtml = await creditShop.text();
  assert.match(creditShopHtml, /Gold market/);
  assert.match(creditShopHtml, /Buy a new mine in Tzolk&#39;in/);
  assert.match(creditShopHtml, /M4L6\.png/);
  assert.match(creditShopHtml, /M14L6\.png/);
  assert.match(creditShopHtml, /src="\/live-database-mine-icon\.svg"/);
  assert.doesNotMatch(creditShopHtml, /M5L6\.png/);
  assert.match(creditShopHtml, /\+240h 0m · 9 credits/);
  const batteryExtension = await fetch(`${base}/market/battery-extension`, {
    method: 'POST', redirect: 'manual', headers: { cookie }
  });
  assert.equal(batteryExtension.status, 303);
  const extendedState = await (await fetch(`${base}/api/state`, { headers: { cookie } })).json();
  assert.equal(extendedState.player.credits, 91);
  assert.equal(extendedState.player.batteryExpiresAt, 1000 + 20 * 60 * 60 * 1000 + 10 * 24 * 60 * 60 * 1000);
  const mineMarketPath = creditShopHtml.match(/href="(\/market\/mines\/\d+)"/)[1];
  const mineMarket = await fetch(`${base}${mineMarketPath}`, { headers: { cookie } });
  const mineMarketHtml = await mineMarket.text();
  assert.equal(mineMarket.status, 200);
  assert.match(mineMarketHtml, /Buy or sell an entire mine for gold/);
  const mineMarketTypeId = Number(mineMarketPath.split('/').pop());
  const mineMarketIcon = catalog.mineTypes.find((entry) => entry.id === mineMarketTypeId).icon;
  assert.match(mineMarketHtml, new RegExp(`src="${mineMarketIcon.replace(/[.*+?^$()|[\]\\]/g, '\\$&')}"`));

  for (const asset of ['/img/equipment/src/Bot.png', '/img/equipment/src/FlimsyBoots.png',
    '/img/equipment/src/MR3.png', '/img/explosives/explosion.png', '/img/explosives/explosive1.png']) {
    const response = await fetch(`${base}${asset}`);
    assert.equal(response.status, 200, asset);
    assert.ok(Number(response.headers.get('content-length')) > 0, asset);
  }

  const markets = await fetch(`${base}/exchange`, { headers: { cookie } });
  assert.equal(markets.status, 200);
  assert.match(await markets.text(), /Item markets/);

  const profile = await fetch(`${base}/miners/Ada`, { headers: { cookie } });
  assert.equal(profile.status, 200);
  const profileHtml = await profile.text();
  assert.match(profileHtml, /Miner profile/);
  assert.match(profileHtml, /Grandmaster Bum/);

  const account = await fetch(`${base}/account`, { headers: { cookie } });
  assert.equal(account.status, 200);
  assert.match(await account.text(), /Change password/);
  const accountUpdate = await fetch(`${base}/account/privacy`, {
    method: 'POST', redirect: 'manual', headers: {
      cookie, 'content-type': 'application/x-www-form-urlencoded'
    }, body: new URLSearchParams({ showMines: 'on' })
  });
  assert.equal(accountUpdate.status, 303);
  const privateProfile = await fetch(`${base}/miners/Ada`, { headers: { cookie } });
  const privateProfileHtml = await privateProfile.text();
  assert.match(privateProfileHtml, /controls chat announcements, not profile inventory/);
  assert.match(privateProfileHtml, /5 matching things/);

  const itemInventory = await fetch(`${base}/inventory`, { headers: { cookie } });
  await itemInventory.text();
  const itemId = catalog.items.find((item) => item.canFind
    && !catalog.factoryOutputItemIds.has(item.id)).id;
  const recycleSettings = await fetch(`${base}/items/${itemId}`, { headers: { cookie } });
  const recycleSettingsHtml = await recycleSettings.text();
  assert.match(recycleSettingsHtml, /Auto-recycle/);
  assert.match(recycleSettingsHtml, /Your stored inventory/);
  assert.match(recycleSettingsHtml, /<dt>Stored total<\/dt>/);
  assert.match(recycleSettingsHtml, /<dt>Stored in Tzolk/);
  const saveRecycleSettings = await fetch(`${base}/items/${itemId}/recycle-settings`, {
    method: 'POST', redirect: 'manual', headers: {
      cookie, 'content-type': 'application/x-www-form-urlencoded'
    }, body: new URLSearchParams({ recycleDamagedOnFind: 'on' })
  });
  assert.equal(saveRecycleSettings.status, 303);
  const savedRecycleSettings = await fetch(`${base}/items/${itemId}`, { headers: { cookie } });
  assert.match(await savedRecycleSettings.text(), /name="recycleDamagedOnFind" checked/);

  const avatar = await fetch(`${base}/avatar`, { headers: { cookie } });
  assert.equal(avatar.status, 200);
  assert.match(await avatar.text(), /Avatar Editor/);

  const stats = await fetch(`${base}/stats`, { headers: { cookie } });
  assert.equal(stats.status, 200);
  const statsHtml = await stats.text();
  assert.match(statsHtml, /Active population/);
  assert.match(statsHtml, /<h2>Live Bullion<\/h2>/);
  assert.match(statsHtml, /<th>Live active bullion<\/th><td>[\d,.]+g<\/td>/);

  const messages = await fetch(`${base}/messages`, { headers: { cookie } });
  assert.equal(messages.status, 200);
  assert.match(await messages.text(), /<p class="eyebrow">Inbox<\/p><h1>Messages<\/h1>/);

  const graceRegistration = await fetch(`${base}/register`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ name: 'Grace', email: 'grace@example.test', password: 'correct horse', acceptTerms: '1' })
  });
  const graceCookie = graceRegistration.headers.get('set-cookie').split(';')[0];
  await verifyDevelopmentEmail(base, graceCookie);
  await fetch(`${base}/messages/Ada`, {
    method: 'POST', redirect: 'manual', headers: {
      cookie: graceCookie, 'content-type': 'application/x-www-form-urlencoded'
    }, body: new URLSearchParams({ body: 'Inbox controls test' })
  });
  const unreadInbox = await fetch(`${base}/messages?filter=unread`, { headers: { cookie } });
  const unreadHtml = await unreadInbox.text();
  assert.match(unreadHtml, /Inbox controls test/);
  assert.match(unreadHtml, /Mark read/);
  const messageId = unreadHtml.match(/name="message_(\d+)"/)[1];
  const deleted = await fetch(`${base}/messages/actions`, {
    method: 'POST', redirect: 'manual', headers: {
      cookie, 'content-type': 'application/x-www-form-urlencoded'
    }, body: new URLSearchParams({ [`message_${messageId}`]: '1', action: 'delete', filter: 'all' })
  });
  assert.equal(deleted.status, 303);
  const deletedInbox = await fetch(`${base}/messages?filter=deleted`, { headers: { cookie } });
  const deletedHtml = await deletedInbox.text();
  assert.match(deletedHtml, /Inbox controls test/);
  assert.match(deletedHtml, /Restore/);

  const blockGrace = await fetch(`${base}/messages/Grace/block`, {
    method: 'POST', redirect: 'manual', headers: {
      cookie, 'content-type': 'application/x-www-form-urlencoded'
    }, body: new URLSearchParams({ blocked: '1' })
  });
  assert.equal(blockGrace.status, 303);
  const blockedConversation = await fetch(`${base}/messages/Ada`, { headers: { cookie: graceCookie } });
  assert.match(await blockedConversation.text(), /blocked your private messages/);
  const unblockGrace = await fetch(`${base}/messages/Grace/block`, {
    method: 'POST', redirect: 'manual', headers: {
      cookie, 'content-type': 'application/x-www-form-urlencoded'
    }, body: new URLSearchParams({ blocked: '0' })
  });
  assert.equal(unblockGrace.status, 303);

  const vehicles = await fetch(`${base}/vehicles`, { headers: { cookie } });
  assert.equal(vehicles.status, 200);
  assert.match(await vehicles.text(), /Vehicles in/);
  const boxes = await fetch(`${base}/vehicles/boxes`, { headers: { cookie } });
  assert.equal(boxes.status, 200);
  assert.match(await boxes.text(), /8 crates/);
  const ratings = await fetch(`${base}/ratings`, { headers: { cookie } });
  assert.equal(ratings.status, 200);
  assert.match(await ratings.text(), /PvP ranks/);
  const containers = await fetch(`${base}/containers`, { headers: { cookie } });
  assert.equal(containers.status, 200);
  assert.match(await containers.text(), /Inventory containers/);
  const rankImage = await fetch(`${base}/img/rankings/R6C1.png`);
  assert.equal(rankImage.status, 200);
  assert.ok(Number(rankImage.headers.get('content-length')) > 0);

  const map = await fetch(`${base}/map`, { headers: { cookie } });
  assert.equal(map.status, 200);
  const mapHtml = await map.text();
  const expectedCatalog = loadLegacyCatalog();
  assert.match(mapHtml, /<svg[^>]+aria-labelledby="route-map-title route-map-description"/);
  assert.equal([...mapHtml.matchAll(/class="route route-/g)].length, 0);
  assert.equal([...mapHtml.matchAll(/class="map-city /g)].length, expectedCatalog.cities.length);
  assert.equal([...mapHtml.matchAll(/class="map-mine-icon"/g)].length, expectedCatalog.cityMineTypes.length);
  assert.equal([...mapHtml.matchAll(/<ul class="city-mines">/g)].length, expectedCatalog.cities.length);
  assert.match(mapHtml, /class="map-background"[^>]+href="\/node\/map-background\.png"/);
  assert.match(mapHtml, /map-city-current/);
  assert.match(mapHtml, /<script src="\/node\/map\.js\?v=20260821a" defer><\/script>/);
  const mapScript = await fetch(`${base}/node/map.js`);
  assert.equal(mapScript.status, 200);
  const mapBackground = await fetch(`${base}/node/map-background.png`);
  assert.equal(mapBackground.status, 200);

  const passwordChange = await fetch(`${base}/account/password`, {
    method: 'POST', redirect: 'manual', headers: {
      cookie, 'content-type': 'application/x-www-form-urlencoded'
    }, body: new URLSearchParams({ oldPassword: 'correct horse', password: 'correct badger', confirmPassword: 'correct badger' })
  });
  assert.equal(passwordChange.status, 303);
  const relogin = await fetch(`${base}/login`, {
    method: 'POST', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ name: 'Ada', password: 'correct badger' })
  });
  assert.equal(relogin.status, 303);
  const reloginCookie = relogin.headers.get('set-cookie').split(';')[0];
  const emailChange = await fetch(`${base}/account/email`, {
    method: 'POST', redirect: 'manual', headers: {
      cookie: reloginCookie, 'content-type': 'application/x-www-form-urlencoded'
    }, body: new URLSearchParams({
      email: 'ada-new@example.test', password: 'correct badger'
    })
  });
  assert.equal(emailChange.status, 303);
  assert.equal(emailChange.headers.get('location'), '/verify-email');
  assert.equal((await fetch(base, {
    redirect: 'manual', headers: { cookie: reloginCookie }
  })).headers.get('location'), '/verify-email');
  await verifyDevelopmentEmail(base, reloginCookie);

  assert.equal(fs.readFileSync(databaseFile, 'utf8').slice(0, 15), 'SQLite format 3');
});

test('renders complete item stats for every legacy item subtype', async (context) => {
  const catalog = loadLegacyCatalog();
  const store = new SqliteStore(':memory:');
  store.seedCatalog(catalog);
  const server = createApp({ store, now: () => 2000 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const itemId = (entry) => {
    assert.ok(entry, 'Expected representative catalog subtype');
    return entry.itemId;
  };
  const cases = [
    [itemId(catalog.vehicles.find((entry) => entry.land)), ['Route type', 'Speed', 'Capacity', 'Attack', 'Armor']],
    [itemId(catalog.vehicles.find((entry) => entry.ship)), ['Route type', 'Speed', 'Capacity', 'Cannon ports', 'Hull', 'Crew']],
    [itemId(catalog.vehicles.find((entry) => entry.aircraft)), ['Route type', 'Speed', 'Capacity', 'Aircraft role']],
    [itemId(catalog.weapons[0]), ['Offense', 'Defense']],
    [itemId(catalog.mods[0]), ['Capacity modifier', 'Attack modifier', 'Armor modifier', 'Offense modifier', 'Defense modifier', 'Dodge modifier']],
    [itemId(catalog.cannons[0]), ['Damage', 'Rate of fire']],
    [itemId(catalog.cannonballs[0]), ['Ammunition type', 'Shots per crate']],
    [itemId(catalog.bombs[0]), ['Bomb damage']],
    [itemId(catalog.boxes[0]), ['Ammunition type', 'Crates per box', 'Shots per box']],
    [itemId(catalog.equipment[0]), ['Equipment slot', 'Mining-rate bonus']],
    [itemId(catalog.explosives[0]), ['Explosive power']],
    [itemId(catalog.robots[0]), ['Robot model', 'Damaged-find chance']],
    [itemId(catalog.gadgetItems.find((entry) => entry.gadgetId === catalog.gadgetByName.get('hammer').id)),
      ['Gadget type', 'Lifespan', 'Effect', 'Primary bonus']],
    [itemId(catalog.machines.find((entry) => entry.type === 'vacuum')), ['Machine type', 'Power (P)', 'Lifespan']],
    [itemId(catalog.avatarElements.find((entry) => entry.typeId === 2)),
      ['Avatar element type', 'Gender compatibility', 'Inventory rule', 'Background inventory bonus']]
  ];
  const coreLabels = ['Rarity', 'Item type', 'Mine category', 'Condition', 'Discoverable',
    'Base gold value', 'Origin cities', 'Marketable'];
  for (const [id, labels] of cases) {
    const response = await fetch(`${base}/items/${id}`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /<section class="item-stats"/);
    for (const label of [...coreLabels, ...labels]) {
      assert.ok(html.includes(`<dt>${label}</dt>`), `${catalog.byId.get(id).name} is missing ${label}`);
    }
  }

  const equipment = catalog.equipment[0];
  const damagedEquipment = catalog.items.find((entry) => entry.repairedItemId === equipment.itemId);
  assert.ok(damagedEquipment, 'Expected damaged equipment counterpart');
  const damagedHtml = await (await fetch(`${base}/items/${damagedEquipment.id}`)).text();
  assert.match(damagedHtml, /<dt>Condition<\/dt><dd>Damaged<\/dd>/);
  assert.match(damagedHtml, /<dt>Equipment slot<\/dt>/);
  assert.match(damagedHtml, new RegExp(`<a href="/items/${equipment.itemId}">`));

  const itemTypeLabels = structuredClone(catalog.settings.item_type_labels);
  itemTypeLabels.landVehicle = 'Live road machine';
  store.database.prepare('UPDATE catalog_settings SET value_json = ? WHERE key = ?')
    .run(JSON.stringify(itemTypeLabels), 'item_type_labels');
  const landVehicle = catalog.vehicles.find((entry) => entry.land);
  const liveTypeHtml = await (await fetch(`${base}/items/${landVehicle.itemId}`)).text();
  assert.match(liveTypeHtml, /<dt>Item type<\/dt><dd>Live road machine<\/dd>/);
});

test('renders item collections from highest rarity to lowest rarity', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-rarity-order-'));
  const databaseFile = path.join(directory, 'minethings.sqlite');
  const catalog = loadLegacyCatalog();
  const store = new SqliteStore(databaseFile);
  store.seedCatalog(catalog);
  const password = 'rarity order password';
  const player = store.addPlayer(createPlayer('Rarity Auditor', '', hashPassword(password), catalog, 1000, () => 0.5));
  const marketSeller = store.addPlayer(createPlayer(
    'Rarity Seller', '', hashPassword(password), catalog, 1000, () => 0.5
  ));
  const catalogEntry = (entries, rarity) => entries.find((entry) => catalog.byId.get(entry.itemId)?.rarity === rarity);
  const ordinaryCommon = catalog.items.find((item) => item.rarity === 1);
  const ordinaryRare = catalog.items.find((item) => item.rarity === 6);
  const equipmentCommon = catalogEntry(catalog.equipment, 1);
  const equipmentRare = catalogEntry(catalog.equipment, 6);
  const explosiveCommon = catalogEntry(catalog.explosives, 1);
  const explosiveRare = catalogEntry(catalog.explosives, 6);
  const vehicleCommon = catalogEntry(catalog.vehicles, 1);
  const vehicleRare = catalogEntry(catalog.vehicles, 6);
  const gadget = catalog.gadgets.find((entry) => {
    const rarities = catalog.gadgetItems.filter((item) => item.gadgetId === entry.id)
      .map((item) => catalog.byId.get(item.itemId)?.rarity);
    return rarities.includes(1) && rarities.includes(5);
  });
  const gadgetCommon = catalog.gadgetItems.find((entry) => entry.gadgetId === gadget.id
    && catalog.byId.get(entry.itemId)?.rarity === 1);
  const gadgetRare = catalog.gadgetItems.find((entry) => entry.gadgetId === gadget.id
    && catalog.byId.get(entry.itemId)?.rarity === 5);
  const avatarType = catalog.avatarElementTypes[0];
  const avatarCommon = catalog.avatarElements.find((entry) => entry.typeId === avatarType.id
    && catalog.byId.get(entry.itemId)?.rarity === 1);
  const avatarRare = catalog.avatarElements.find((entry) => entry.typeId === avatarType.id
    && catalog.byId.get(entry.itemId)?.rarity === 6);
  for (const itemId of [ordinaryCommon.id, ordinaryRare.id, equipmentCommon.itemId,
    equipmentRare.itemId, explosiveCommon.itemId, explosiveRare.itemId, vehicleCommon.itemId,
    vehicleRare.itemId, gadgetCommon.itemId, gadgetRare.itemId, avatarCommon.itemId, avatarRare.itemId]) {
    player.inventory[itemId] = 1;
  }
  player.inventory[explosiveCommon.itemId] = 150;
  player.inventoryByCity[player.cityId] = player.inventory;
  store.savePlayer(player);

  const server = createApp({ store, catalog, now: () => 2000 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${base}/login`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ name: player.name, password })
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const page = async (route) => (await fetch(`${base}${route}`, { headers: { cookie } })).text();
  const assertBefore = (html, earlier, later, label) => {
    assert.ok(html.indexOf(earlier) >= 0, `${label}: missing rare marker ${earlier}`);
    assert.ok(html.indexOf(later) >= 0, `${label}: missing common marker ${later}`);
    assert.ok(html.indexOf(earlier) < html.indexOf(later), `${label}: rare item must render first`);
  };
  const assertItemCardsClickable = (html, label) => {
    const cards = [...html.matchAll(/<article class="[^"]*item-card[^"]*" data-item-id="(\d+)"[^>]*>([\s\S]*?)<\/article>/g)];
    assert.ok(cards.length > 0, `${label}: expected item cards`);
    for (const [, itemId, card] of cards) {
      assert.match(card, new RegExp(`href="/items/${itemId}"`), `${label}: item ${itemId} must link to its detail page`);
    }
  };

  const inventoryHtml = await page('/inventory');
  const loadoutHtml = await page('/mines/1/equipment');
  const gadgetsHtml = await page('/gadgets');
  const vehiclesHtml = await page('/vehicles');
  const avatarHtml = await page('/avatar');
  for (const [label, html] of [['inventory', inventoryHtml], ['mine loadout', loadoutHtml],
    ['gadgets', gadgetsHtml], ['vehicles', vehiclesHtml], ['avatar', avatarHtml]]) {
    assertItemCardsClickable(html, label);
  }
  assert.doesNotMatch(loadoutHtml, /class="loadout-item"/);
  assert.doesNotMatch(avatarHtml, /<select name="type_/);

  assertBefore(inventoryHtml, `/items/${ordinaryRare.id}`, `/items/${ordinaryCommon.id}`, 'inventory');
  marketSeller.inventory[ordinaryCommon.id] = 1;
  marketSeller.inventory[ordinaryRare.id] = 1;
  marketSeller.inventoryByCity[marketSeller.cityId] = marketSeller.inventory;
  store.savePlayer(marketSeller);
  store.placeSellOrder(marketSeller.id, ordinaryCommon.id, 1, 2000);
  store.placeSellOrder(marketSeller.id, ordinaryRare.id, 1, 2001);
  const exchange = await page('/exchange');
  assertItemCardsClickable(exchange, 'exchange');
  const exchangeRarities = [...exchange.matchAll(/<article class="item rarity-(\d+)[^"]*"/g)]
    .map((match) => Number(match[1]));
  assert.ok(exchangeRarities.length > 1);
  assert.ok(exchangeRarities.every((rarity, index) => index === 0 || exchangeRarities[index - 1] >= rarity));
  assertBefore(loadoutHtml, `/equipment/${equipmentRare.itemId}/equip`,
    `/equipment/${equipmentCommon.itemId}/equip`, 'mine equipment');
  assertBefore(loadoutHtml, `value="${explosiveRare.itemId}"`,
    `value="${explosiveCommon.itemId}"`, 'explosives');
  const commonExplosiveCard = loadoutHtml.match(new RegExp(
    `<article class="[^"]*item-card[^"]*" data-item-id="${explosiveCommon.itemId}"[\\s\\S]*?</article>`
  ))?.[0];
  assert.ok(commonExplosiveCard, 'common explosive card should render');
  assert.equal((commonExplosiveCard.match(/name="count"/g) ?? []).length, 4);
  assert.match(commonExplosiveCard, /name="count" value="1"/);
  assert.match(commonExplosiveCard, /name="count" value="10"/);
  assert.match(commonExplosiveCard, /name="count" value="100"/);
  assert.match(commonExplosiveCard, /name="count" value="150"[^>]*><span>Max<\/span><small>150<\/small>/);
  assert.doesNotMatch(commonExplosiveCard, /type="number"/);
  assertBefore(gadgetsHtml, `/gadgets/${gadgetRare.itemId}/activate`,
    `/gadgets/${gadgetCommon.itemId}/activate`, 'gadget activators');
  assertBefore(vehiclesHtml, `/vehicles/activate/${vehicleRare.itemId}`,
    `/vehicles/activate/${vehicleCommon.itemId}`, 'vehicle items');
  assertBefore(avatarHtml, `name="type_${avatarType.id}" value="${avatarRare.id}"`,
    `name="type_${avatarType.id}" value="${avatarCommon.id}"`, 'avatar items');
});

test('shows gadget stock by home-city availability and consumes only the home copy', async (context) => {
  const catalog = loadLegacyCatalog();
  const store = new SqliteStore(':memory:');
  store.seedCatalog(catalog);
  const password = 'home gadget password';
  const itemId = 265;
  const item = catalog.byId.get(itemId);
  const player = createPlayer('Remote Gadgeteer', '', hashPassword(password), catalog, 1000, () => 0.5);
  delete player.inventoryByCity[1][itemId];
  player.knownCityIds = [1, 2];
  player.cityId = 2;
  player.inventoryByCity[1][itemId] = 1;
  player.inventoryByCity[2] = { [itemId]: 2 };
  player.inventory = player.inventoryByCity[2];
  const saved = store.addPlayer(player);
  const server = createApp({ store, catalog, now: () => 2000 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${base}/login`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ name: player.name, password })
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];

  const before = await (await fetch(`${base}/gadgets`, { headers: { cookie } })).text();
  assert.match(before, /Gadget items must be in your home city to activate/);
  assert.match(before, new RegExp(`href="/items/${item.id}"`));
  assert.match(before, /1 at home · 2 elsewhere/);
  assert.match(before, /You have 2 gadget items outside your home city/);

  const activation = await fetch(`${base}/gadgets/${itemId}/activate`, {
    method: 'POST', redirect: 'manual', headers: { cookie }
  });
  assert.equal(activation.status, 303);
  assert.equal(store.database.prepare(
    'SELECT quantity FROM inventory WHERE player_id = ? AND city_id = 1 AND item_id = ?'
  ).get(saved.id, itemId), undefined);
  assert.equal(store.database.prepare(
    'SELECT quantity FROM inventory WHERE player_id = ? AND city_id = 2 AND item_id = ?'
  ).get(saved.id, itemId).quantity, 2);

  const after = await (await fetch(`${base}/gadgets`, { headers: { cookie } })).text();
  assert.match(after, new RegExp(`href="/items/${item.id}"`));
  assert.match(after, /0 at home · 2 elsewhere/);
  assert.match(after, new RegExp(`action="/gadgets/${itemId}/activate"[\\s\\S]*?<button disabled>`));
});

test('hides arms from public profiles while the Armory gadget is active', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-armory-'));
  const databaseFile = path.join(directory, 'minethings.sqlite');
  const catalog = loadLegacyCatalog();
  const store = new SqliteStore(databaseFile);
  store.seedCatalog(catalog);
  const password = 'armory test password';
  const viewer = store.addPlayer(createPlayer('Armory Viewer', '', hashPassword(password), catalog, 1000, () => 0.5));
  const subject = store.addPlayer(createPlayer('Armory Owner', '', hashPassword(password), catalog, 1000, () => 0.5));
  const weapon = catalog.weapons.find((entry) => catalog.byId.get(entry.itemId)?.rarity === 1);
  const mod = catalog.mods.find((entry) => catalog.byId.get(entry.itemId)?.rarity === 1);
  const ordinary = catalog.items.find((item) => item.rarity === 4
    && !catalog.weaponByItemId.has(item.id) && !catalog.modByItemId.has(item.id)
    && !catalog.cannonByItemId.has(item.id) && !catalog.cannonballByItemId.has(item.id)
    && !catalog.boxByItemId.has(item.id));
  const armory = catalog.gadgetByName.get('armory');
  const activator = catalog.gadgetItems.find((entry) => entry.gadgetId === armory.id);
  subject.inventory[weapon.itemId] = 1;
  subject.inventory[mod.itemId] = 1;
  subject.inventory[ordinary.id] = 1;
  subject.inventory[activator.itemId] = 1;
  store.savePlayer(subject);
  store.activateGadget(subject.id, activator.itemId, 1000);

  const server = createApp({ store, now: () => 2000 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  store.database.prepare(`
    UPDATE catalog_gadgets SET name = ?, display_name = ? WHERE behavior_key = ?
  `).run('secure_vault', 'Secure Vault', 'armory');
  const login = await fetch(`${base}/login`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ name: viewer.name, password })
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const profile = await fetch(`${base}/miners/${encodeURIComponent(subject.name)}`, { headers: { cookie } });
  const html = await profile.text();
  assert.equal(profile.status, 200);
  assert.ok(html.includes('An active Secure Vault conceals'));
  assert.ok(html.includes(ordinary.name));
  assert.ok(!html.includes(weapon.name));
  assert.ok(!html.includes(mod.name));
});

test('returns 410 for every retired banking route', async (context) => {
  const catalog = loadLegacyCatalog();
  const store = new SqliteStore(':memory:');
  store.seedCatalog(catalog);
  const password = 'retired banking password';
  const player = store.addPlayer(createPlayer('Former Customer', '', hashPassword(password), catalog, 1000, () => 0.5));
  const server = createApp({ store, catalog, now: () => 6000 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${base}/login`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ name: player.name, password })
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  for (const route of ['/banks', '/banks/history', '/banks/view/Former%20Banker', '/banks/applications/1/accept']) {
    const response = await fetch(`${base}${route}`, { headers: { cookie } });
    assert.equal(response.status, 410);
    assert.match(await response.text(), /Banking has been removed/);
  }
});

test('publishes the history and legal record and completes an idempotent PayPal credit lifecycle', async (context) => {
  const catalog = loadLegacyCatalog();
  const store = new SqliteStore(':memory:');
  store.seedCatalog(catalog);
  const password = 'payment lifecycle password';
  const player = store.addPlayer(createPlayer(
    'PayPal Miner', '', hashPassword(password), catalog, 1000, () => 0.5
  ));
  const startingCredits = player.credits;
  const paypalClient = {
    async createOrder(purchase) {
      return {
        order: { id: `ORDER-${purchase.id}` },
        approveUrl: `https://paypal.example.test/approve?token=ORDER-${purchase.id}`
      };
    },
    async captureOrder(orderId, purchaseId) {
      return {
        id: orderId, status: 'COMPLETED',
        purchase_units: [{
          reference_id: `purchase-${purchaseId}`,
          invoice_id: `MT-${purchaseId}`,
          custom_id: String(purchaseId),
          amount: { value: '1.99', currency_code: 'GBP' },
          payments: { captures: [{
            id: `CAPTURE-${purchaseId}`, status: 'COMPLETED',
            amount: { value: '1.99', currency_code: 'GBP' }
          }] }
        }]
      };
    },
    async verifyWebhook() { return true; }
  };
  const server = createApp({
    store, catalog, now: () => 5000, adminNames: player.name, paypalClient,
    paypal: {
      enabled: true, environment: 'sandbox', clientId: 'sandbox-id',
      clientSecret: 'sandbox-secret', publicOrigin: 'http://127.0.0.1'
    },
    seller: {
      operatorName: 'Anonymous Miner', legalName: 'Test Seller',
      legalAddress: '1 Test Street, London', legalEmail: 'seller@example.test'
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  const history = await (await fetch(`${base}/history`)).text();
  assert.match(history, /The story of MineThings/);
  assert.match(history, /Operator-supplied account—not independently documented/);
  assert.match(history, /original successor was the player <strong>gordonstretch<\/strong>/);
  assert.match(history, /AI-assisted development/);
  assert.match(history, /browsermmorpg\.com/);
  assert.match(history, /arstechnica\.com/);
  assert.match(history, /bitcointalk\.org/);
  assert.match(history, /openuserjs\.org/);
  assert.match(history, /operator-supplied population claim/);
  assert.match(history, /not verified unique-player totals/);
  const legal = await (await fetch(`${base}/legal`)).text();
  assert.match(legal, /Test Seller/);
  assert.match(legal, /Nothing excludes or limits liability/);
  const rejectedRegistration = await fetch(`${base}/register`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ name: 'No Terms', password: 'long enough password' })
  });
  assert.equal(rejectedRegistration.status, 400);

  const login = await fetch(`${base}/login`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ name: player.name, password })
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];
  const shop = await (await fetch(`${base}/credits`, { headers: { cookie } })).text();
  assert.match(shop, /100 credits/);
  assert.match(shop, /£1\.99/);
  const bundleId = store.creditBundles()[0].id;
  const create = await fetch(`${base}/credits/paypal/orders`, {
    method: 'POST', redirect: 'manual', headers: {
      cookie, 'content-type': 'application/x-www-form-urlencoded'
    }, body: new URLSearchParams({
      bundleId: String(bundleId), acceptPaymentTerms: '1', immediateDelivery: '1'
    })
  });
  assert.equal(create.status, 303);
  assert.match(create.headers.get('location'), /^https:\/\/paypal\.example\.test\/approve/);
  const purchase = store.playerCreditPurchases(player.id)[0];
  const returned = await fetch(`${base}/credits/paypal/return?token=${purchase.providerOrderId}`, {
    headers: { cookie }, redirect: 'manual'
  });
  assert.equal(returned.status, 303);
  assert.equal(returned.headers.get('location'), `/credits/receipts/${purchase.id}`);
  assert.equal(store.playerById(player.id).credits, startingCredits + 100);
  const receipt = await (await fetch(`${base}/credits/receipts/${purchase.id}`, {
    headers: { cookie }
  })).text();
  assert.match(receipt, new RegExp(`Receipt MT-${purchase.id}`));
  assert.match(receipt, /CAPTURE-/);
  const download = await fetch(`${base}/credits/receipts/${purchase.id}.txt`, { headers: { cookie } });
  assert.match(download.headers.get('content-disposition'), /attachment/);
  assert.match(await download.text(), /Terms version: 2026-08-23/);

  const reversalEvent = {
    id: 'WH-REFUND-1', event_type: 'PAYMENT.CAPTURE.REFUNDED',
    resource: {
      amount: { value: '1.99', currency_code: 'GBP' },
      supplementary_data: { related_ids: { capture_id: `CAPTURE-${purchase.id}` } }
    }
  };
  const webhook = () => fetch(`${base}/webhooks/paypal`, {
    method: 'POST', headers: {
      'content-type': 'application/json', 'sec-fetch-site': 'cross-site'
    }, body: JSON.stringify(reversalEvent)
  });
  assert.equal((await webhook()).status, 200);
  assert.equal(store.playerById(player.id).credits, startingCredits);
  const duplicate = await (await webhook()).json();
  assert.equal(duplicate.duplicate, true);
  assert.equal(store.playerById(player.id).credits, startingCredits);
  const admin = await (await fetch(`${base}/admin/payments`, { headers: { cookie } })).text();
  assert.match(admin, /Credits and PayPal/);
  assert.match(admin, /refunded/);
});
