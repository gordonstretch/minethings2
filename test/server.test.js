import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { createPlayer } from '../src/game.js';
import {
  BOLT_BOX_CATALOG, ELECTRONICS_CATALOG, LEGACY_STARTER_WELCOME_PACK, loadLegacyCatalog, RELICS_CATALOG,
  SHROOM_CATALOG, WISDOM_CATALOG, WOOD_CATALOG
} from '../src/legacy-catalog.js';
import { LEGAL_VERSION, sellerConfiguration } from '../src/legal.js';
import {
  battlePage, botBuildComicNotice, casinoPage, createApp, findingNoticeItems
} from '../src/server.js';
import { hashPassword, SHUTTLE_OIL_CATEGORY_ID, SqliteStore } from '../src/store.js';

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

test('gives all thirteen miner-bot purchases their ordered comic lesson', () => {
  const lines = [
    'MineThings 2 is a pretty complicated game.',
    'It starts slow. Speed it up by making Stones.',
    'It is a socioeconomic simulation, really.',
    'With shinies.',
    'There is a lot of room for people behaving badly.',
    'And even more room for cooperation.',
    'And outright aggression.',
    'Stay safe out there. Be prepared.',
    'Luck plays a part; but fortune favours the brave.',
    'A route is an invitation, a risk, and occasionally an ambush.',
    'The machines run alone. The world only works when people show up.',
    'Decide what sort of miner the bot is waking up beside.',
    'Now make some history the Council cannot tidy away.'
  ];
  for (const [index, expected] of lines.entries()) {
    const notice = botBuildComicNotice({
      label: `Part ${index + 1}`, bph: index + 1,
      botPartNumber: index + 1, botPartTotal: lines.length,
      botCompleted: index === lines.length - 1,
      stone: index === lines.length - 1 ? { name: 'Assembled' } : null
    }, 2000 + index);
    assert.equal(notice.text, expected);
    assert.equal(notice.step, index + 1);
    assert.equal(notice.total, 13);
  }
});

test('shows the city-style comic burst only after a successful bot-part purchase',
  async (context) => {
    const catalog = loadLegacyCatalog();
    const store = new SqliteStore(':memory:');
    store.seedCatalog(catalog);
    const password = 'comic bot password';
    const player = store.addPlayer(createPlayer(
      'Comic Bot Builder', '', hashPassword(password), catalog, 1000, () => 0.5
    ));
    store.database.prepare(`
      UPDATE players SET email_verified_at = 1, gold_units = 10000 WHERE id = ?
    `).run(player.id);
    const server = createApp({ store, now: () => 5000, random: () => 0.99 });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    context.after(async () => {
      await new Promise((resolve, reject) => server.close(
        (error) => error ? reject(error) : resolve()
      ));
      store.close();
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const login = await fetch(`${base}/login`, {
      method: 'POST', redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ name: player.name, password })
    });
    const cookie = login.headers.get('set-cookie').split(';')[0];

    const initial = await (await fetch(base, { headers: { cookie } })).text();
    assert.match(initial, /id="bot-build-burst"[^>]+data-active="0"/u);
    const purchase = await fetch(`${base}/bot-parts/1/buy`, {
      method: 'POST', redirect: 'manual', headers: { cookie }
    });
    assert.equal(purchase.status, 303);
    assert.equal(purchase.headers.get('location'), '/');
    const reveal = await (await fetch(base, { headers: { cookie } })).text();
    assert.match(reveal, /id="bot-build-burst"[^>]+data-active="1"/u);
    assert.match(reveal, /SPARK!/u);
    assert.match(reveal, /MineThings 2 is a pretty complicated game\./u);
    assert.match(reveal, /Part 1 of 13/u);
    assert.match(reveal, /Chest installed/u);
    assert.match(reveal, /\/node\/bot-build-burst\.js\?v=20260902a/u);

    const consumed = await (await fetch(base, { headers: { cookie } })).text();
    assert.match(consumed, /id="bot-build-burst"[^>]+data-active="0"/u);
    assert.doesNotMatch(consumed, /Don&#39;t be fooled/u);
    const client = await (await fetch(`${base}/node/bot-build-burst.js`)).text();
    assert.match(client, /minethings:bot-build-part/u);
    assert.match(client, /12000/u);
  });

test('renders chain-escape battle reports with accurate counts and clean numbers', () => {
  const report = {
    vehicleId: 174,
    aggressive: false,
    won: true,
    tied: false,
    ratingBefore: 1600,
    ratingAfter: 1605,
    opponent: {
      aggressive: true,
      player_name: 'The Restless Dead',
      vehicle_name: 'Champion'
    },
    details: {
      type: 'ship',
      vehicleIds: [155, 174],
      result: {
        winner: 2,
        chainEscape: true,
        starting: [
          { hull: 188, speed: 44.800000000000004, crew: 65 },
          { hull: 144, speed: 56, crew: 65 }
        ],
        ships: [
          { hull: 188, speed: 44.800000000000004, crew: 65 },
          { hull: 144, speed: 56, crew: 65 }
        ],
        shots: [
          [{ round: 1, portal: 1, cannonName: 'Hydra', type: 1, hit: false,
            damage: 4, damageField: 'hull',
            targetAfter: { hull: 144, speed: 56, crew: 65 } }],
          [{ round: 1, portal: 1, cannonName: 'Hydra', type: 1, hit: false,
            damage: 5, damageField: 'hull',
            targetAfter: { hull: 188, speed: 44.800000000000004, crew: 65 } }]
        ],
        casualties: [[], []],
        boardingRounds: [],
        repairs: [null, {
          hull: 0, speed: 0, crew: 0,
          ending: { hull: 144, speed: 56, crew: 65 }
        }]
      }
    }
  };

  const html = battlePage(report);
  assert.match(html, /Your ship fired 1 cannon shot and landed 0 hits\./);
  assert.match(html, /188 hull \/ 44\.8 speed \/ 65 crew/);
  assert.match(html, /No crew were lost\./);
  assert.match(html, /Your faster ship escaped the pursuing enemy before boarding could begin\./);
  assert.match(html, /You won\./);
  assert.doesNotMatch(html, /44\.800000000000004|Chain-shot damage|repairs restored 0/);
});

test('floors legacy negative land stats in complete battle reports', () => {
  const html = battlePage({
    vehicleId: 10,
    aggressive: false,
    won: false,
    tied: false,
    ratingBefore: 1600,
    ratingAfter: 1595,
    opponent: {
      aggressive: true,
      player_name: 'The Restless Dead',
      vehicle_name: 'Wraith Champion'
    },
    details: {
      type: 'land2',
      vehicleIds: [10, 20],
      starting: [
        { attack: -5, armor: -1, offense: -2.55, defense: -12, dodge: -15 },
        { attack: 1.53, armor: 981, offense: 0, defense: 0, dodge: 0 }
      ],
      result: {
        winner: 2,
        rounds: 0,
        finalBlow: -1,
        ending: [{ attack: -5, armor: -1 }, { attack: 1.53, armor: 981 }],
        roundLog: []
      }
    }
  });

  assert.match(html,
    /started with 0 base attack, 0 armour, 0 aggressive power, 0 defensive power, and 0 dodge/u);
  assert.match(html, /it had 0 base attack and 0 armour/u);
  assert.match(html, /final blow dealt 0 damage/u);
  assert.doesNotMatch(html, /-\d+(?:\.\d+)? (?:base attack|armour|aggressive power|defensive power|dodge|damage)/u);
});

test('limits recent discoveries to the mines displayed in the current city', async (context) => {
  const store = new SqliteStore(':memory:');
  store.seedCatalog(loadLegacyCatalog());
  store.ensureWorldMaps(1000);
  const catalog = store.loadCatalog();
  const password = 'local discovery password';
  const player = store.addPlayer(createPlayer(
    'Local Discoverer', '', hashPassword(password), catalog, 1000, () => 0.5
  ));
  const displayedMine = store.database.prepare(`
    SELECT id, mine_type_id FROM mines WHERE player_id = ? ORDER BY id LIMIT 1
  `).get(player.id);
  const otherCity = catalog.cities.find((city) => city.id !== player.cityId);
  const otherMineType = catalog.mineTypes.find((type) => type.id !== displayedMine.mine_type_id);
  const hiddenMineId = displayedMine.id + 1;
  store.database.prepare(`
    INSERT INTO mines
      (player_id, id, mine_type_id, city_id, active, mine_things, priority,
       oil_expires_at, rental_until, next_find_at)
    VALUES (?, ?, ?, ?, 0, 1, 2, 0, 0, 999999)
  `).run(player.id, hiddenMineId, otherMineType.id, otherCity.id);
  store.database.prepare('UPDATE players SET next_mine_id = ? WHERE id = ?')
    .run(hiddenMineId + 1, player.id);

  const localItem = catalog.items.at(-1);
  const remoteItem = catalog.items.at(-2);
  const discoveryLimit = Number(catalog.settings.home_recent_discovery_limit);
  store.database.prepare('DELETE FROM discoveries WHERE player_id = ?').run(player.id);
  const insertDiscovery = store.database.prepare(`
    INSERT INTO discoveries
      (player_id, position, item_id, mine_id, city_id, found_at, exploded, dwarfed)
    VALUES (?, ?, ?, ?, ?, ?, 0, 0)
  `);
  for (let position = 0; position < discoveryLimit; position += 1) {
    insertDiscovery.run(
      player.id, position, remoteItem.id, hiddenMineId, otherCity.id, 2000 - position
    );
  }
  insertDiscovery.run(
    player.id, discoveryLimit, localItem.id, displayedMine.id, player.cityId, 1000
  );

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
  const home = await (await fetch(base, { headers: { cookie } })).text();
  const recent = home.match(
    /<h2>Recent discoveries<\/h2><div class="item-grid">([\s\S]*?)<\/div><\/section>/u
  );
  assert.ok(recent, 'the current-city discovery panel is rendered');
  assert.ok(recent[1].includes(localItem.name), 'a discovery from a displayed mine is shown');
  assert.ok(!recent[1].includes(remoteItem.name), 'a discovery from a mine in another city is hidden');
});

test('shows the staged ore-thief operation only on the Airfield page', async (context) => {
  const store = new SqliteStore(':memory:');
  store.seedCatalog(loadLegacyCatalog());
  store.ensureWorldMaps(1000);
  const catalog = store.loadCatalog();
  const password = 'ore thief briefing password';
  const operationRoute = catalog.routes.find((route) => route.open
    && route.type === catalog.settings.route_type_ids.air
    && route.city1Id === route.city2Id);
  const missionCity = catalog.cities.find((city) => city.id === operationRoute.city1Id);
  const draft = createPlayer(
    'Ore Thief Briefer', '', hashPassword(password), catalog, 1000, () => 0.5
  );
  draft.cityId = missionCity.id;
  draft.knownCityIds = [...new Set([...(draft.knownCityIds ?? []), missionCity.id])];
  draft.inventoryByCity[missionCity.id] = {
    [catalog.settings.search_plane_item_id]: 1,
    [catalog.settings.bomber_item_id]: 1,
    [catalog.settings.helicopter_item_id]: 1
  };
  draft.inventory = draft.inventoryByCity[missionCity.id];
  const player = store.addPlayer(draft);

  store.database.prepare('DELETE FROM thief_bases').run();
  assert.equal(store.database.prepare('SELECT COUNT(*) AS count FROM thief_bases').get().count, 0);

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
  const getHtml = async (pathname) => {
    const response = await fetch(`${base}${pathname}`, { headers: { cookie } });
    assert.equal(response.status, 200);
    return response.text();
  };

  const fleetHtml = await getHtml('/vehicles');
  assert.doesNotMatch(fleetHtml, /class="ore-thief-operation"|Ore-thief base/);
  assert.equal(store.database.prepare('SELECT COUNT(*) AS count FROM thief_bases').get().count, 0,
    'ordinary server startup and fleet views do not synthesize operation state');

  const hiddenHtml = await getHtml('/explore/airfield');
  assert.equal(store.database.prepare('SELECT COUNT(*) AS count FROM thief_bases').get().count, 1,
    'opening the Airfield repairs a missing operation singleton');
  assert.match(hiddenHtml, /class="ore-thief-operation"/);
  assert.match(hiddenHtml, /Location unknown/);
  assert.match(hiddenHtml, /SEARCH OPEN/);
  assert.match(hiddenHtml, /Search Plane[\s\S]*Bomber[\s\S]*Helicopter/);
  assert.match(hiddenHtml, /Every bomb aboard is dropped/);

  const baseId = store.database.prepare('SELECT id FROM thief_bases ORDER BY id DESC LIMIT 1')
    .get().id;
  store.database.prepare(`
    INSERT INTO thief_base_discoveries (base_id, player_id, discovered_at)
    VALUES (?, ?, ?)
  `).run(baseId, player.id, 2100);
  store.database.prepare(`
    UPDATE thief_bases SET buckets = 777, damaged = 1 WHERE id = ?
  `).run(baseId);
  const locatedHtml = await getHtml('/explore/airfield');
  assert.match(locatedHtml, /STRIKE OPEN/);
  assert.match(locatedHtml, /777 defensive buckets remain; the base is damaged/);

  store.database.prepare(`
    UPDATE thief_bases SET buckets = 0, destroyed_at = 2200, ore = 123 WHERE id = ?
  `).run(baseId);
  const recoveryHtml = await getHtml('/explore/airfield');
  assert.match(recoveryHtml, /RECOVERY OPEN/);
  assert.match(recoveryHtml, /123 stolen Ore crates remain/);

  assert.match(recoveryHtml, /Ore-thief operation/);
  assert.match(recoveryHtml, /Search, bombing, and recovery/);
  assert.doesNotMatch(recoveryHtml, /Oil-field mission circuit/);
  const guideHtml = await getHtml('/guide');
  assert.match(guideHtml, /Ore-thief operations/);
  assert.match(guideHtml, /fresh hidden base forms/);
});

test('renders chain-shot escape losses and total crew recovery from the viewer perspective', () => {
  const report = {
    vehicleId: 10,
    aggressive: true,
    won: false,
    tied: false,
    ratingBefore: 1600,
    ratingAfter: 1595,
    opponent: { aggressive: false, player_name: 'Defender', vehicle_name: 'Clipper' },
    details: {
      type: 'ship',
      vehicleIds: [10, 20],
      result: {
        winner: 2,
        chainEscape: true,
        starting: [
          { hull: 100, speed: 56, crew: 65 },
          { hull: 100, speed: 56, crew: 65 }
        ],
        ships: [
          { hull: 100, speed: 50, crew: 60 },
          { hull: 100, speed: 56, crew: 65 }
        ],
        shots: [[], [
          { round: 1, portal: 1, cannonName: 'Hydra', type: 2, hit: true,
            damage: 6, damageField: 'speed',
            targetAfter: { hull: 100, speed: 50, crew: 65 } }
        ]],
        casualties: [[], []],
        boardingRounds: [],
        repairs: [{
          hull: 0, speed: 0.200000000000003, crew: 2,
          ending: { hull: 100, speed: 50.2, crew: 62 }
        }, null]
      }
    }
  };

  const html = battlePage(report);
  assert.match(html, /Your ship fired 0 cannon shots and landed 0 hits\./);
  assert.match(html, /5 crew members were lost\./);
  assert.match(html, /An enemy chain shot slowed your ship, letting the faster enemy escape before boarding could begin\./);
  assert.match(html, /After combat, repairs restored 0\.2 speed; 2 crew members returned to duty\./);
  assert.match(html, /You lost\./);
  assert.doesNotMatch(html, /0\.200000000000003/);
});

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
  assert.match(factoriesHtml, /href="\/factories" aria-current="page">Factories \(1\)<\/a>/u);
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

test('renders mill reinforcement queues and returns reserved Wood Screws on cancellation',
  async (context) => {
    const store = new SqliteStore(':memory:');
    store.seedCatalog(loadLegacyCatalog());
    store.ensureWorldMaps(1000);
    const catalog = store.loadCatalog();
    const password = 'mill queue password';
    const player = store.addPlayer(createPlayer(
      'Mill Queue Operator', '', hashPassword(password), catalog, 1000, () => 0.5
    ));
    const capitalCityId = store.database.prepare(
      'SELECT capital_city_id FROM world_maps WHERE sort_order = 3'
    ).get().capital_city_id;
    store.database.prepare('UPDATE players SET city_id = ? WHERE id = ?')
      .run(capitalCityId, player.id);
    store.database.prepare(
      'INSERT OR IGNORE INTO known_cities (player_id, city_id) VALUES (?, ?)'
    ).run(player.id, capitalCityId);
    const wood = WOOD_CATALOG.items.find((item) => item.id !== WOOD_CATALOG.screwItemId);
    const vehicle = catalog.vehicles.find((entry) => entry.routeType === 0);
    const stock = store.database.prepare(`
      INSERT INTO inventory (player_id, city_id, item_id, quantity) VALUES (?, ?, ?, ?)
    `);
    stock.run(player.id, capitalCityId, wood.id, 2);
    stock.run(player.id, capitalCityId, WOOD_CATALOG.screwItemId, 8);
    stock.run(player.id, capitalCityId, vehicle.itemId, 2);
    const firstVehicleId = store.activateVehicle(player.id, vehicle.itemId, 1000);
    const secondVehicleId = store.activateVehicle(player.id, vehicle.itemId, 1000);
    const millId = Number(store.database.prepare(`
      INSERT INTO factories
        (owner_id, operator_id, city_id, built, factory_action_id, item_id,
         components_done, last_event_at, completion_at, facility_kind, created_at)
      VALUES (?, ?, ?, 1, NULL, NULL, 0, 1000, NULL, 'mill', 1000)
    `).run(player.id, player.id, capitalCityId).lastInsertRowid);
    store.startMillReinforcement(player.id, millId, firstVehicleId, wood.id, 1100);
    const queued = store.startMillReinforcement(
      player.id, millId, secondVehicleId, wood.id, 1101);

    const server = createApp({ store, now: () => 1200 });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    context.after(async () => {
      await new Promise((resolve, reject) =>
        server.close((error) => error ? reject(error) : resolve()));
      store.close();
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const login = await fetch(`${base}/login`, {
      method: 'POST', redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ name: player.name, password })
    });
    const cookie = login.headers.get('set-cookie').split(';')[0];

    const millsHtml = await (await fetch(`${base}/mills`, { headers: { cookie } })).text();
    assert.match(millsHtml, /href="\/vehicles">Fleet \(2\)<\/a>/u);
    assert.match(millsHtml, /href="\/mills" aria-current="page">Mills \(1\)<\/a>/u);
    assert.match(millsHtml, /Reinforcement queue <span>1\/10<\/span>/);
    assert.match(millsHtml, /4 Wood Screws reserved/);
    assert.match(millsHtml, />Add to queue<\/button>/);
    assert.match(millsHtml, new RegExp(
      `/mills/${millId}/queue/${queued.queuedJob.id}/cancel`
    ));

    const cancelled = await fetch(
      `${base}/mills/${millId}/queue/${queued.queuedJob.id}/cancel`,
      { method: 'POST', redirect: 'manual', headers: { cookie } }
    );
    assert.equal(cancelled.status, 303);
    const inventory = store.playerById(player.id).inventory;
    assert.equal(inventory[wood.id], 1);
    assert.equal(inventory[WOOD_CATALOG.screwItemId], 4);
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
  const expiredStream = await fetch(
    `${base}/api/live-updates?since=28101203&topics=catalog%2Cworld`
  );
  assert.equal(expiredStream.status, 200);
  assert.match(expiredStream.headers.get('content-type'), /text\/event-stream/);
  assert.equal(await expiredStream.text(),
    'event: session-ended\ndata: {"location":"/"}\n\n');
  assert.match(expiredStream.headers.get('set-cookie'), /mt_session=;.*Max-Age=0/u);
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

  const maintenanceMethods = [
    'settleMines', 'runBumUpdate', 'runDwarfUpdate', 'settleFactories',
    'sendDailyFindingDigests', 'expireMessages'
  ];
  const originalMaintenance = new Map(maintenanceMethods.map((method) =>
    [method, store[method]]));
  const maintenanceCalls = [];
  for (const method of maintenanceMethods) {
    store[method] = () => {
      maintenanceCalls.push(method);
      throw new Error(`Live fragment unexpectedly called ${method}.`);
    };
  }
  const liveFragment = await fetch(`${base}/inventory`, {
    headers: { cookie, 'x-minethings-live-update': '1' }
  });
  for (const [method, implementation] of originalMaintenance) store[method] = implementation;
  assert.equal(liveFragment.status, 200);
  assert.deepEqual(maintenanceCalls, [],
    'live document refreshes must not run foreground maintenance');

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
  store.database.prepare(`
    INSERT INTO live_update_events (scope, changed_at) VALUES ('topic:market', 2000)
  `).run();
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
  assert.match(body, /id: \d+\nevent: change/);
  assert.match(body, /topic:market/);
  assert.doesNotMatch(body, new RegExp(`player:${player.id}`),
    'private background writes must not rebuild market pages');

  const client = await (await fetch(`${base}/node/live-updates.js`)).text();
  assert.match(client, /morphNode/);
  assert.match(client, /data-live-dirty/);
  assert.match(client, /data-journey-planner/);
  assert.match(client,
    /contentMorphEnabled[\s\S]*?casino\|oil-field\|explore[\s\S]*?window\.location\.pathname/u,
    'client-owned casino, Oil Field, and city exploration state must survive live updates');
  assert.doesNotMatch(client, /location\.reload|location\.replace/);
  assert.match(client, /addEventListener\('session-ended'/u);
  assert.match(client, /stream\.close\(\)/u);
  assert.match(client, /window\.location\.assign\(destination\)/u);
  assert.match(client, /addEventListener\('maintenance'/u);
  assert.match(client, /addEventListener\('presence'/u);
});

test('server listening does not synchronously advance gameplay state', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-quiet-start-'));
  const databaseFile = path.join(directory, 'quiet-start.sqlite');
  const store = new SqliteStore(databaseFile, { legacyJsonFile: null });
  store.seedCatalog(loadLegacyCatalog());
  store.ensureWorldMaps(1000);
  store.database.exec('DELETE FROM live_update_events;');

  const settlementMethods = [
    'settleFactories', 'settleOilField', 'settleWorldEvents', 'settleMines'
  ];
  const calls = [];
  for (const method of settlementMethods) {
    store[method] = () => {
      calls.push(method);
      throw new Error(`Server startup unexpectedly called ${method}.`);
    };
  }

  const server = createApp({
    store, backgroundMaintenance: true, maintenanceIntervalMs: 1000
  });
  context.after(async () => {
    if (server.listening) {
      await new Promise((resolve, reject) =>
        server.close((error) => error ? reject(error) : resolve()));
    }
    store.close();
    await new Promise((resolve) => setTimeout(resolve, 1500));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  assert.deepEqual(calls, [], 'listening only schedules the first maintenance cycle');
  assert.equal(store.database.prepare(
    'SELECT COUNT(*) AS count FROM live_update_events'
  ).get().count, 0, 'idempotent world setup emits no synthetic live updates');
});

test('creates unique world maps and lets an administrator open their varied gateway routes', () => {
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
  assert.equal(live.maps.every((map) => Number.isSafeInteger(map.capitalCityId)), true,
    'every region exposes its fixed capital through the catalog');
  assert.equal(live.cities.length, 35);
  assert.equal(new Set(live.cities.map((city) => city.name)).size, live.cities.length);
  const regionalFields = store.database.prepare(`
    SELECT world_maps.name AS map_name, catalog_cities.name AS city_name,
      COUNT(*) AS hex_count
    FROM oil_hexes
    JOIN catalog_cities ON catalog_cities.id = oil_hexes.city_id
    JOIN world_maps ON world_maps.id = catalog_cities.map_id
    GROUP BY world_maps.id, oil_hexes.city_id
    ORDER BY world_maps.sort_order
  `).all();
  assert.deepEqual(regionalFields.map((field) => field.map_name),
    ['Aso', 'Calbuco', 'Ebeko', 'Gallego']);
  assert.equal(regionalFields.length, Math.round(live.maps.length / 2));
  assert.equal(regionalFields.every((field) => field.hex_count === 469), true);
  assert.equal(regionalFields.find((field) => field.map_name === 'Gallego').city_name, 'Burgundy',
    'the original field city is preserved');
  for (const map of live.maps) {
    const cities = live.cities.filter((city) => city.mapId === map.id);
    assert.equal(cities.some((city) => city.id === map.capitalCityId), true,
      `${map.name} capital should belong to that region`);
    const regionalMineTypeIds = cities.flatMap((city) =>
      live.mineTypesByCity.get(city.id).map((mineType) => mineType.id));
    const mineTypeIds = new Set(regionalMineTypeIds);
    assert.equal(cities.length, 5, `${map.name} should have five cities`);
    const expectedMineTypes = ['Bromo', 'Calbuco', 'Dempo', 'Ebeko', 'Fogo'].includes(map.name)
      ? 16 : 15;
    assert.equal(mineTypeIds.size, expectedMineTypes,
      `${map.name} should support ${expectedMineTypes} mine types`);
    assert.equal(regionalMineTypeIds.length, mineTypeIds.size,
      `${map.name} should advertise each mine type in only one city`);
    assert.equal(live.routes.filter((candidate) => !candidate.interMap
      && cities.some((city) => city.id === candidate.city1Id)
      && cities.some((city) => city.id === candidate.city2Id)).length,
    map.name === 'Gallego' ? 12 : map.name === 'Aso' ? 13 : 11,
    `${map.name} should have a local travel network`);
  }
  store.ensureWorldMaps(1500);
  assert.equal(store.loadCatalog().cities.length, 35, 'the region migration should be idempotent');
  assert.equal(store.database.prepare('SELECT COUNT(*) AS count FROM oil_hexes').get().count,
    4 * 469, 'regional Oil Field generation should be idempotent');
  const routes = store.adminInterMapRoutes();
  assert.equal(routes.length, 18);
  assert.equal(routes.every((route) => !route.open
    && route.length >= 10450 && route.length <= 11300), true);
  assert.equal(new Set(routes.map((route) => route.length)).size, 6,
    'each regional gateway corridor has its own shorter distance');
  for (const map1 of live.maps.slice(0, -1)) {
    const corridor = routes.filter((route) => route.map1_name === map1.name);
    assert.equal(new Set(corridor.map((route) => route.length)).size, 1,
      'land, sea, and air share the same geographic corridor distance');
  }
  assert.ok(store.database.prepare(`
    SELECT 1 FROM schema_migrations WHERE name = 'varied-gateway-route-lengths-v1'
  `).get());
  const seaType = live.settings.route_type_ids.sea;
  const route = routes.find((entry) => entry.map1_name === 'Aso'
    && entry.map2_name === 'Bromo' && entry.type === seaType);
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
    live.cities.find((city) => city.name === 'Ashfall').id);
  assert.equal(store.routesForVehicle(administrator.id, vehicleId, journey.arrivesAt)
    .some((entry) => entry.id === route.id), true);
  store.close();
});

test('keeps every open gateway destination hidden until its route is completed', async (context) => {
  const store = new SqliteStore(':memory:');
  store.seedCatalog(loadLegacyCatalog());
  store.ensureWorldMaps(1000);
  const catalog = store.loadCatalog();
  const password = 'regional explorer password';
  const player = store.addPlayer(createPlayer(
    'Regional Explorer', '', hashPassword(password), catalog, 1000, () => 0.5
  ));
  const gatewayRoutes = store.adminInterMapRoutes().filter((entry) => entry.map1_name === 'Aso'
    && entry.map2_name === 'Bromo');
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
  const originalSingleRouteLookup = store.routesForVehicle.bind(store);
  let singleRouteLookups = 0;
  store.routesForVehicle = (...args) => {
    singleRouteLookups += 1;
    return originalSingleRouteLookup(...args);
  };
  const aso = await (await fetch(`${base}/map`, { headers: { cookie } })).text();
  assert.match(aso, /Aso opportunities/);
  assert.match(aso, /Undiscovered region/);
  assert.doesNotMatch(aso, /href="\/map\?world=bromo"/);
  assert.doesNotMatch(aso, /Ashfall|Bromo opportunities/);
  for (const { vehicleId, route } of gatewayVehicles) {
    assert.doesNotMatch(aso, new RegExp(`action="/vehicles/${vehicleId}/send"`));
    assert.doesNotMatch(aso, new RegExp(
      `<input type="hidden" name="routeId" value="${route.id}">`
    ));
  }
  assert.doesNotMatch(aso, /Bring an idle|Complete this gateway route|expedition reward/iu);
  const forcedBromo = await (await fetch(`${base}/map?world=bromo`, { headers: { cookie } })).text();
  assert.equal(singleRouteLookups, 0, 'map should not request routes one vehicle at a time');
  store.routesForVehicle = originalSingleRouteLookup;
  assert.match(forcedBromo, /Aso opportunities/);
  assert.doesNotMatch(forcedBromo, /Ashfall|Bromo opportunities/);
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

test('renders fixed regional capitals and retires the regional-home chooser', async (context) => {
  const store = new SqliteStore(':memory:');
  store.seedCatalog(loadLegacyCatalog());
  store.ensureWorldMaps(1000);
  const catalog = store.loadCatalog();
  const password = 'fixed regional capital password';
  const player = store.addPlayer(createPlayer(
    'Capital Resident', '', hashPassword(password), catalog, 1000, () => 0.5
  ));
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
  const sidecarRows = () => store.database.prepare(`
    SELECT map_id, city_id, chosen_at FROM player_region_homes
    WHERE player_id = ? ORDER BY map_id
  `).all(player.id).map((row) => ({ ...row }));
  const homesBefore = sidecarRows();
  const calbuco = catalog.maps.find((map) => map.slug === 'calbuco');
  const calbucoCapital = catalog.cities.find((city) => city.id === calbuco.capitalCityId);
  store.database.prepare(
    'INSERT OR IGNORE INTO known_cities (player_id, city_id) VALUES (?, ?)'
  ).run(player.id, calbucoCapital.id);

  const mapResponse = await fetch(`${base}/map`, { headers: { cookie } });
  assert.equal(mapResponse.status, 200);
  const mapHtml = await mapResponse.text();
  assert.match(mapHtml, /Regional capital/u);
  const localRouteSection = mapHtml.match(
    /<section><h2>Local route network<\/h2><ul class="route-list">([\s\S]*?)<\/ul><\/section>/u
  )?.[1] ?? '';
  assert.doesNotMatch(localRouteSection, /\[object Object\]/u);
  const playerMapId = catalog.cities.find((city) => city.id === player.cityId).mapId;
  const firstLocalRoute = catalog.routes.find((route) => route.open
    && catalog.cities.some((city) => city.mapId === playerMapId && city.id === route.city1Id)
    && catalog.cities.some((city) => city.mapId === playerMapId && city.id === route.city2Id));
  assert.ok(firstLocalRoute);
  for (const cityId of [firstLocalRoute.city1Id, firstLocalRoute.city2Id]) {
    const cityName = catalog.cities.find((city) => city.id === cityId).name;
    assert.ok(localRouteSection.includes(cityName), `${cityName} is rendered as a route endpoint`);
  }
  assert.match(mapHtml, /class="capital-city-icon"[^>]*>★<\/span>Cinderwake/u);
  assert.doesNotMatch(mapHtml, /map-capital-(?:badge|label)|map-gateway-label/u,
    'gateway state uses the shared marker rather than a detached label');
  assert.equal((mapHtml.match(/class="map-city-nameplate"/gu) ?? []).length, 5,
    'every city name has a contrast background');
  assert.equal((mapHtml.match(/class="map-city-nameplate-inlay"/gu) ?? []).length, 5,
    'every city nameplate has the same inset frame');
  assert.equal((mapHtml.match(/class="map-city-nameplate-tail"/gu) ?? []).length, 5,
    'every compact nameplate points to its city marker');
  assert.equal((mapHtml.match(/class="map-city-label-rivet"/gu) ?? []).length, 10,
    'every compact nameplate has matching cartographic rivets');
  assert.equal((mapHtml.match(/class="map-city-rank"/gu) ?? []).length, 1,
    'the capital carries its rank within the unified nameplate treatment');
  assert.equal((mapHtml.match(/class="map-capital-star-marker"/gu) ?? []).length, 1,
    'the capital star has its own contrast marker');
  assert.equal([...mapHtml.matchAll(/class="[^"]*\bmap-city-capital\b[^"]*"/gu)].length, 1,
    'the viewed region has one capital marker');
  assert.equal((mapHtml.match(/class="map-resource-icon map-oil-field-icon"/gu) ?? []).length, 1,
    'Aso exposes its Oil Field as a separate regional operation');
  assert.match(mapHtml, new RegExp(
    `class="[^"]*map-city-capital[^"]*" data-city-id="${player.cityId}" data-oil-field="true"`
  ), 'the Aso Oil Field is attached to Cinderwake');
  const currentMapId = catalog.cities.find((city) => city.id === player.cityId).mapId;
  const expectedMapMineTypeIds = catalog.cities.filter((city) => city.mapId === currentMapId)
    .flatMap((city) => catalog.mineTypesByCity.get(city.id).map((mineType) => mineType.id))
    .sort((first, second) => first - second);
  const renderedMapMineTypeIds = [...mapHtml.matchAll(
    /<g class="map-resource-icon map-mine-icon" data-mine-type-id="(\d+)"/gu
  )]
    .map((match) => Number(match[1])).sort((first, second) => first - second);
  assert.deepEqual(renderedMapMineTypeIds, expectedMapMineTypeIds,
    'the map emits one normalized symbol for every configured city-mine association');
  assert.equal(new Set(renderedMapMineTypeIds).size, renderedMapMineTypeIds.length,
    'a mine type appears only once in the rendered region');
  for (const mineTypeId of renderedMapMineTypeIds) {
    assert.match(mapHtml, new RegExp(`href="/node/map-icons/mine-${mineTypeId}\\.svg"`));
  }
  assert.equal([...mapHtml.matchAll(/class="city-card [^"]*\bcapital\b[^"]*"/gu)].length, 1,
    'the viewed region has one capital card');
  assert.doesNotMatch(mapHtml, /(?:href|action)="\/move"/u);
  const calbucoMap = await (await fetch(`${base}/map?world=calbuco`, {
    headers: { cookie }
  })).text();
  assert.match(calbucoMap, new RegExp(
    `class="[^"]*map-city-gateway[^"]*" data-city-id="${calbucoCapital.id}"`
  ));
  assert.doesNotMatch(calbucoMap, /class="map-gateway-label"/u);
  assert.match(calbucoMap, new RegExp(
    `class="[^"]*map-city-capital[^"]*" data-city-id="${calbucoCapital.id}" data-oil-field="true"`
  ), 'Calbuco marks its regional Oil Field at Stormcrag');

  const gallego = catalog.maps.find((map) => map.slug === 'gallego');
  const gallegoCapital = catalog.cities.find((city) => city.id === gallego.capitalCityId);
  const gallegoOilFieldCityId = store.oilFieldCityIds().find((cityId) =>
    catalog.cities.find((city) => city.id === cityId)?.mapId === gallego.id);
  store.database.prepare(
    'INSERT OR IGNORE INTO known_cities (player_id, city_id) VALUES (?, ?)'
  ).run(player.id, gallegoCapital.id);
  store.database.exec('UPDATE catalog_routes SET is_open = 1 WHERE is_inter_map = 1');
  const gallegoMap = await (await fetch(`${base}/map?world=gallego`, {
    headers: { cookie }
  })).text();
  const corridorSection = gallegoMap.match(
    /<section><h2>Inter-map corridors<\/h2><ul class="route-list">([\s\S]*?)<\/ul><\/section>/u
  )?.[1] ?? '';
  const gallegoCityIds = new Set(catalog.cities
    .filter((city) => city.mapId === gallego.id).map((city) => city.id));
  const visibleCorridors = catalog.routes.filter((route) => route.interMap
    && (gallegoCityIds.has(route.city1Id) || gallegoCityIds.has(route.city2Id)));
  assert.equal((corridorSection.match(/class="route-summary route-/gu) ?? []).length,
    visibleCorridors.length, 'every open corridor uses one compact route row');
  assert.doesNotMatch(corridorSection,
    /<form|<button|gateway-departures|Bring an idle|cities ·|mine types|expedition reward/iu,
    'inter-map corridors do not recommend or dispatch vehicles from the map');
  assert.match(corridorSection,
    /<span>[^<]+<\/span><strong>[^<]+ ↔ [^<]+<\/strong><small>[\d,]+ km · open<\/small>/u,
    'inter-map corridors share the regular route summary structure');
  store.database.exec('UPDATE catalog_routes SET is_open = 0 WHERE is_inter_map = 1');
  assert.match(gallegoMap, new RegExp(
    `class="[^"]*map-city-(?:known|unknown)[^"]*" data-city-id="${gallegoOilFieldCityId}" data-oil-field="true"`
  ), 'Gallego marks the Oil Field at Burgundy even though its capital is Tzolk\'in');
  assert.doesNotMatch(gallegoMap, new RegExp(
    `class="[^"]*map-city-capital[^"]*" data-city-id="${gallegoCapital.id}" data-oil-field="true"`
  ));

  const bromo = catalog.maps.find((map) => map.slug === 'bromo');
  store.database.prepare(
    'INSERT OR IGNORE INTO known_cities (player_id, city_id) VALUES (?, ?)'
  ).run(player.id, bromo.capitalCityId);
  const bromoMap = await (await fetch(`${base}/map?world=bromo`, {
    headers: { cookie }
  })).text();
  assert.doesNotMatch(bromoMap, /class="map-resource-icon map-oil-field-icon"/u,
    'regions without an Oil Field do not receive a false marker');

  const build = catalog.factoryActions.find((action) => action.actionKind === 'build');
  store.database.prepare(`
    INSERT INTO inventory (player_id, city_id, item_id, quantity) VALUES (?, ?, ?, ?)
    ON CONFLICT (player_id, city_id, item_id) DO UPDATE SET quantity = excluded.quantity
  `).run(player.id, calbucoCapital.id, catalog.settings.ore_item_id, build.ore);
  store.changeCity(player.id, calbucoCapital.id, 1900);
  const factories = await (await fetch(`${base}/factories`, { headers: { cookie } })).text();
  assert.match(factories, /Every regional capital is one of your home cities/u);
  assert.match(factories,
    /form method="post" action="\/factories\/build"><button >Build factory/u);
  const construction = await fetch(`${base}/factories/build`, {
    method: 'POST', redirect: 'manual', headers: { cookie }
  });
  assert.equal(construction.status, 303);
  assert.equal(store.database.prepare(
    'SELECT city_id FROM factories WHERE owner_id = ? ORDER BY id DESC LIMIT 1'
  ).get(player.id).city_id, calbucoCapital.id);

  const aso = catalog.maps.find((map) => map.slug === 'aso');
  const asoCapital = catalog.cities.find((city) => city.id === aso.capitalCityId);
  const landType = catalog.settings.route_type_ids.land;
  const returnRoute = catalog.routes.find((route) => route.open && route.type === landType
    && (route.city1Id === asoCapital.id || route.city2Id === asoCapital.id));
  const outpostId = returnRoute.city1Id === asoCapital.id
    ? returnRoute.city2Id : returnRoute.city1Id;
  store.database.prepare(
    'INSERT OR IGNORE INTO known_cities (player_id, city_id) VALUES (?, ?)'
  ).run(player.id, outpostId);
  store.changeCity(player.id, outpostId, 1950);
  const landVehicle = catalog.vehicles.find((vehicle) => vehicle.routeType === landType);
  store.database.prepare(`
    INSERT INTO inventory (player_id, city_id, item_id, quantity) VALUES (?, ?, ?, 1)
  `).run(player.id, outpostId, landVehicle.itemId);
  const vehicleId = store.activateVehicle(player.id, landVehicle.itemId);
  const fleetHtml = await (await fetch(`${base}/vehicles`, { headers: { cookie } })).text();
  assert.match(fleetHtml, new RegExp(
    `<option value="${returnRoute.id}">★ ${asoCapital.name} · CAPITAL · ${returnRoute.length.toLocaleString('en-GB')} km`
  ), 'route dropdowns identify a regional capital before departure');

  for (const [method, body] of [
    ['GET', undefined],
    ['POST', new URLSearchParams({ cityId: String(player.cityId) })]
  ]) {
    const response = await fetch(`${base}/move`, {
      method, redirect: 'manual', headers: {
        cookie, ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {})
      }, body
    });
    assert.equal(response.status, 410);
    assert.equal(response.headers.get('location'), null);
    assert.match(await response.text(), /regional capital/iu);
  }
  assert.deepEqual(sidecarRows(), homesBefore,
    'retired chooser requests must not rewrite historical regional-home rows');
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

test('signs in and registers miners through the local Google OAuth flow', async (context) => {
  const catalog = loadLegacyCatalog();
  const store = new SqliteStore(':memory:');
  store.seedCatalog(catalog);
  const existing = store.addPlayer(createPlayer(
    'Existing Google Miner', 'existing.google@example.com', hashPassword('existing password'),
    catalog, 1000, () => 0.5
  ));
  const profiles = new Map([
    ['existing-code', {
      subject: 'google-existing-subject', email: 'existing.google@example.com',
      name: 'Existing Person', picture: ''
    }],
    ['new-code', {
      subject: 'google-new-subject', email: 'new.google@example.com',
      name: 'Google Prospector', picture: ''
    }]
  ]);
  const exchanges = [];
  const googleAuthClient = {
    authorizationUrl({ state, nonce, codeChallenge }) {
      assert.match(state, /^[A-Za-z0-9_-]{40,}$/u);
      assert.match(nonce, /^[A-Za-z0-9_-]{40,}$/u);
      assert.match(codeChallenge, /^[A-Za-z0-9_-]{40,}$/u);
      return `https://accounts.google.test/authorize?state=${encodeURIComponent(state)}`;
    },
    async exchangeCode(code, protections) {
      exchanges.push({ code, protections });
      const profile = profiles.get(code);
      if (!profile) throw new Error('Unknown fake code.');
      return profile;
    }
  };
  const server = createApp({
    store,
    now: () => 2000,
    googleAuth: {
      enabled: true,
      clientId: 'test-client.apps.googleusercontent.com',
      clientSecret: 'test-secret',
      publicOrigin: 'http://127.0.0.1:3000'
    },
    googleAuthClient
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const landing = await (await fetch(base)).text();
  assert.match(landing, /href="\/auth\/google"/);
  assert.match(landing, /Continue with Google/);
  assert.match(landing, /Green Dwarf/);

  const beginExisting = await fetch(`${base}/auth/google`, { redirect: 'manual' });
  assert.equal(beginExisting.status, 303);
  const existingState = new URL(beginExisting.headers.get('location')).searchParams.get('state');
  const existingCallback = await fetch(
    `${base}/auth/google/callback?state=${encodeURIComponent(existingState)}&code=existing-code`,
    { redirect: 'manual' }
  );
  assert.equal(existingCallback.status, 303);
  assert.equal(existingCallback.headers.get('location'), '/');
  const existingCookie = existingCallback.headers.get('set-cookie').split(';')[0];
  assert.equal(store.externalIdentityForPlayer(existing.id, 'google').subject,
    'google-existing-subject');
  const existingHome = await (await fetch(base, { headers: { cookie: existingCookie } })).text();
  assert.match(existingHome, /Existing Google Miner/);
  const replay = await fetch(
    `${base}/auth/google/callback?state=${encodeURIComponent(existingState)}&code=existing-code`,
    { redirect: 'manual' }
  );
  assert.equal(replay.status, 400);

  const beginNew = await fetch(`${base}/auth/google`, { redirect: 'manual' });
  const newState = new URL(beginNew.headers.get('location')).searchParams.get('state');
  const newCallback = await fetch(
    `${base}/auth/google/callback?state=${encodeURIComponent(newState)}&code=new-code`,
    { redirect: 'manual' }
  );
  assert.equal(newCallback.status, 303);
  assert.equal(newCallback.headers.get('location'), '/auth/google/register');
  const signupCookie = newCallback.headers.get('set-cookie').split(';')[0];
  const registrationPage = await fetch(`${base}/auth/google/register`, {
    headers: { cookie: signupCookie }
  });
  assert.equal(registrationPage.status, 200);
  const registrationHtml = await registrationPage.text();
  assert.match(registrationHtml, /new\.google@example\.com/);
  assert.match(registrationHtml, /value="Google Prospector"/);

  const registration = await fetch(`${base}/auth/google/register`, {
    method: 'POST', redirect: 'manual',
    headers: { cookie: signupCookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      name: 'Google Prospector', password: 'google backup password', acceptTerms: '1'
    })
  });
  assert.equal(registration.status, 303);
  assert.equal(registration.headers.get('location'), '/');
  const created = store.findPlayer('Google Prospector', 2000);
  assert.equal(created.email, 'new.google@example.com');
  assert.equal(created.emailVerified, true);
  assert.equal(created.termsVersion, LEGAL_VERSION);
  assert.equal(created.inventory[154],
    created.discoveries.filter((finding) => finding.itemId === 154).length + 1);
  assert.equal(created.inventory[LEGACY_STARTER_WELCOME_PACK.dwarfItemId],
    created.discoveries.filter((finding) =>
      finding.itemId === LEGACY_STARTER_WELCOME_PACK.dwarfItemId).length + 1);
  for (const gadgetItemId of LEGACY_STARTER_WELCOME_PACK.gadgetItemIds) {
    assert.equal(created.inventory[gadgetItemId],
      created.discoveries.filter((finding) => finding.itemId === gadgetItemId).length + 1);
  }
  assert.deepEqual(created.mines.filter((mine) => mine.rentalUntil > 0)
    .map((mine) => mine.mineTypeId), [4, 5]);
  assert.equal(created.cryptoBalances[1], 5);
  assert.equal(store.casinoState(created.id).currencies.find((currency) =>
    currency.id === 1).voucherQuantity, 100);
  assert.equal(store.externalIdentityForPlayer(created.id, 'google').subject,
    'google-new-subject');
  const googleWelcomeMessages = store.recentMessages(created.id, 'all', 'Admin')
    .filter((message) => message.details.event === 'registration-welcome');
  assert.equal(googleWelcomeMessages.length, 1);
  assert.equal(googleWelcomeMessages[0].senderName, 'The Council');
  assert.equal(googleWelcomeMessages[0].subject,
    'Notice of banishment and estate disposition');
  assert.equal(googleWelcomeMessages[0].kept, true);
  assert.equal(googleWelcomeMessages[0].read, false);
  assert.match(googleWelcomeMessages[0].body, /To Google Prospector,/);
  assert.match(googleWelcomeMessages[0].body, /found guilty/u);
  assert.match(googleWelcomeMessages[0].body, /banished permanently to Old Earth/u);
  assert.match(googleWelcomeMessages[0].body, /1 x Green Dwarf/);
  assert.match(googleWelcomeMessages[0].body, /1 x Yellow Tin Turbo Engine/);
  assert.match(googleWelcomeMessages[0].body, /Equipment Mine rental/);
  assert.match(googleWelcomeMessages[0].body, /100 ASO casino voucher/);
  assert.match(googleWelcomeMessages[0].body, /Terms of provisional survival:/);
  assert.equal(exchanges.length, 2);
  assert.ok(exchanges.every((entry) => entry.protections.codeVerifier
    && entry.protections.nonce));
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
  assert.equal((await fetch(`${base}/admin/travelling`, {
    headers: { cookie: subjectCookie }
  })).status, 404);
  const dashboard = await fetch(`${base}/admin`, { headers: { cookie: adminCookie } });
  assert.equal(dashboard.status, 200);
  const dashboardHtml = await dashboard.text();
  assert.match(dashboardHtml, /Administration/);
  assert.match(dashboardHtml, /href="\/admin\/travelling"[^>]*>Travelling things<\/a>/);

  const allRoutes = store.adminRoutes();
  assert.equal(allRoutes.length, liveCatalog.routes.length);
  assert.deepEqual(allRoutes.map((route) => route.city1_name),
    [...allRoutes].sort((first, second) => first.map1_name.localeCompare(second.map1_name)
      || first.city1_name.localeCompare(second.city1_name)
      || first.map2_name.localeCompare(second.map2_name)
      || first.city2_name.localeCompare(second.city2_name)
      || first.type - second.type || first.id - second.id).map((route) => route.city1_name));
  const routesPage = await fetch(`${base}/admin/routes`, { headers: { cookie: adminCookie } });
  assert.equal(routesPage.status, 200);
  const routesHtml = await routesPage.text();
  assert.match(routesHtml, /Complete world network/);
  assert.match(routesHtml, /Mission · #/);
  const interRegionStart = routesHtml.indexOf('data-route-scope="inter-region"');
  const regionalStart = routesHtml.indexOf('data-route-scope="regional"');
  assert.ok(regionalStart >= 0 && interRegionStart > regionalStart,
    'inter-region routes should have the final route section');
  const regionalHtml = routesHtml.slice(regionalStart, interRegionStart);
  const interRegionHtml = routesHtml.slice(interRegionStart);
  for (const route of allRoutes.filter((candidate) => candidate.interMap)) {
    assert.match(interRegionHtml, new RegExp(`action="/admin/routes/${route.id}"`));
    assert.doesNotMatch(regionalHtml, new RegExp(`action="/admin/routes/${route.id}"`));
  }
  for (const route of allRoutes.filter((candidate) => !candidate.interMap)) {
    assert.match(regionalHtml, new RegExp(`action="/admin/routes/${route.id}"`));
    assert.doesNotMatch(interRegionHtml, new RegExp(`action="/admin/routes/${route.id}"`));
  }

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
  assert.match(worldHtml, /<option value="snow"[^>]*>Snow<\/option>/);
  assert.match(worldHtml, /<option value="hurricane"[^>]*>Hurricane<\/option>/);
  assert.match(worldHtml, /data-temperature="24" data-wind="170" data-rainfall="50"/);
  assert.match(worldHtml, /Precipitation mm/);
  assert.match(worldHtml, /Release Sea creature/);
  assert.match(worldHtml, /Release Land creature/);
  for (const name of ['Kraken', 'White Whale', 'Orca Pod', 'Land Whale', 'Elephant Herd', 'T-Rex']) {
    assert.match(worldHtml, new RegExp(name));
  }
  for (const color of ['Yellow', 'Green', 'Blue', 'Red', 'Purple', 'Orange']) {
    assert.match(worldHtml, new RegExp(color));
  }
  assert.match(worldHtml, /Creature rarity/);
  assert.match(worldHtml, /Common · Tier 1/);
  assert.match(worldHtml, /Legendary · Tier 6/);
  assert.doesNotMatch(worldHtml, /Transports in transit|Traveling creatures/);
  const travellingPage = await fetch(`${base}/admin/travelling`, {
    headers: { cookie: adminCookie }
  });
  assert.equal(travellingPage.status, 200);
  const travellingHtml = await travellingPage.text();
  assert.match(travellingHtml, /<h1>Travelling things<\/h1>/);
  assert.match(travellingHtml, /Creatures on the move/);
  assert.match(travellingHtml, /Vehicles in transit/);
  const weatherScript = await fetch(`${base}/node/admin-weather.js`);
  assert.equal(weatherScript.status, 200);
  assert.match(await weatherScript.text(), /selected\.dataset\.temperature/);

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
  const legendaryWhale = store.adminWorldEventControls(2000).creatures.find((entry) =>
    entry.creature_type === 'white_whale' && entry.rarity === 6
      && entry.route_id === seaRoute.id);
  assert.equal(legendaryWhale.name, 'Legendary White Whale');
  assert.equal(legendaryWhale.rarity_name, 'Legendary');

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

test('publishes live maintenance warnings and counts recently active signed-in miners',
  async (context) => {
    const catalog = loadLegacyCatalog();
    const store = new SqliteStore(':memory:');
    store.seedCatalog(catalog);
    store.ensureWorldMaps(1000);
    const password = 'maintenance console password';
    const administrator = store.addPlayer(createPlayer(
      'Maintenance Admin', '', hashPassword(password), catalog, 1000, () => 0.5
    ));
    const subject = store.addPlayer(createPlayer(
      'Maintenance Miner', '', hashPassword(password), catalog, 1000, () => 0.5
    ));
    let currentTime = 100000;
    const server = createApp({
      store, catalog: store.loadCatalog(), now: () => currentTime,
      adminNames: administrator.name
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    context.after(async () => {
      await new Promise((resolve, reject) =>
        server.close((error) => error ? reject(error) : resolve()));
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

    const initialDashboard = await (await fetch(`${base}/admin`, {
      headers: { cookie: adminCookie }
    })).text();
    assert.match(initialDashboard, /<strong data-active-users>2<\/strong>/u);
    assert.match(initialDashboard, /Seen in the last 5 minutes/u);
    assert.match(initialDashboard, /value="30"/u);

    const forbidden = await fetch(`${base}/admin/maintenance`, {
      method: 'POST', redirect: 'manual', headers: {
        cookie: subjectCookie, 'content-type': 'application/x-www-form-urlencoded'
      }, body: new URLSearchParams({ minutes: '30', message: 'Not authorised' })
    });
    assert.equal(forbidden.status, 404);

    const controller = new AbortController();
    const stream = await fetch(`${base}/api/live-updates?topics=catalog`, {
      headers: { cookie: subjectCookie }, signal: controller.signal
    });
    const reader = stream.body.getReader();
    const decoder = new TextDecoder();
    let events = '';
    const readUntil = async (pattern) => {
      const deadline = Date.now() + 3000;
      while (!pattern.test(events) && Date.now() < deadline) {
        const result = await Promise.race([
          reader.read(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Maintenance SSE timeout')), 500))
        ]);
        if (result.done) break;
        events += decoder.decode(result.value, { stream: true });
      }
      assert.match(events, pattern);
    };
    await readUntil(/event: maintenance\ndata: \{"active":false\}/u);

    const message = 'You will be temporarily logged out. Finish <important> work.';
    const warning = await fetch(`${base}/admin/maintenance`, {
      method: 'POST', redirect: 'manual', headers: {
        cookie: adminCookie, 'content-type': 'application/x-www-form-urlencoded'
      }, body: new URLSearchParams({ minutes: '30', message })
    });
    assert.equal(warning.status, 303);
    assert.equal(warning.headers.get('location'), '/admin');
    await readUntil(/event: maintenance\ndata: \{"active":true,"shutdownAt":1900000/u);
    controller.abort();

    const minerPage = await (await fetch(`${base}/inventory`, {
      headers: { cookie: subjectCookie }
    })).text();
    assert.match(minerPage,
      /id="maintenance-banner"[^>]*data-shutdown-at="1900000"(?![^>]*hidden)/u);
    assert.match(minerPage, /Maintenance shutdown <span data-maintenance-countdown>in 30 minutes/u);
    assert.match(minerPage,
      /You will be temporarily logged out\. Finish &lt;important&gt; work\./u);
    assert.doesNotMatch(minerPage, /Finish <important> work/u);

    currentTime += 6 * 60 * 1000;
    const laterDashboard = await (await fetch(`${base}/admin`, {
      headers: { cookie: adminCookie }
    })).text();
    assert.match(laterDashboard, /<strong data-active-users>1<\/strong>/u,
      'the viewing administrator remains active while the idle miner expires from presence');

    const cancelled = await fetch(`${base}/admin/maintenance/cancel`, {
      method: 'POST', redirect: 'manual', headers: { cookie: adminCookie }
    });
    assert.equal(cancelled.status, 303);
    const clearedPage = await (await fetch(`${base}/inventory`, {
      headers: { cookie: subjectCookie }
    })).text();
    assert.match(clearedPage, /id="maintenance-banner"[^>]*hidden/u);
    assert.doesNotMatch(clearedPage, /Finish &lt;important&gt; work/u);
    assert.deepEqual(store.adminAuditLog(2).map((entry) => entry.action),
      ['maintenance-warning-removed', 'maintenance-warning-published']);
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
  const vehicleClass = catalog.settings.combat_class_by_rarity[
    catalog.byId.get(vehicleType.itemId)?.rarity
  ];
  const sameClassVehicleType = catalog.vehicles.find((vehicle) => vehicle.routeType === 0
    && vehicle.itemId !== vehicleType.itemId
    && catalog.settings.combat_class_by_rarity[catalog.byId.get(vehicle.itemId)?.rarity]
      === vehicleClass);
  const otherVehicleType = catalog.vehicles.find((vehicle) => vehicle.routeType === 0
    && catalog.settings.combat_class_by_rarity[catalog.byId.get(vehicle.itemId)?.rarity]
      !== vehicleClass);
  assert.ok(route && vehicleType && sameClassVehicleType && otherVehicleType);
  const player = createPlayer(
    'Creature Interceptor', '', hashPassword(password), catalog, 1000, () => 0.5
  );
  player.profession = 1;
  player.inventory[vehicleType.itemId] = 1;
  player.inventory[sameClassVehicleType.itemId] = 1;
  player.inventory[otherVehicleType.itemId] = 1;
  const saved = store.addPlayer(player);
  const vehicleId = store.activateVehicle(saved.id, vehicleType.itemId);
  const sameClassVehicleId = store.activateVehicle(saved.id, sameClassVehicleType.itemId);
  const otherVehicleId = store.activateVehicle(saved.id, otherVehicleType.itemId);
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
  const remoteRoute = store.database.prepare(`
    SELECT catalog_routes.*
    FROM catalog_routes
    JOIN catalog_cities city1 ON city1.id = catalog_routes.city1_id
    JOIN catalog_cities city2 ON city2.id = catalog_routes.city2_id
    WHERE city1.map_id = ? AND city2.map_id = ? AND catalog_routes.type IN (?, ?)
      AND catalog_routes.city1_id NOT IN (
        SELECT city_id FROM known_cities WHERE player_id = ?
      )
      AND catalog_routes.city2_id NOT IN (
        SELECT city_id FROM known_cities WHERE player_id = ?
      )
    ORDER BY catalog_routes.id LIMIT 1
  `).get(mapId, mapId, catalog.settings.route_type_ids.land,
    catalog.settings.route_type_ids.sea, saved.id, saved.id);
  assert.ok(remoteRoute, 'the fixture needs a route whose endpoints remain undiscovered');
  const remoteCreatureType = Number(remoteRoute.type) === Number(catalog.settings.route_type_ids.sea)
    ? 'white_whale' : 'land_whale';
  const remoteCreatureId = Number(store.database.prepare(`
    INSERT INTO world_creatures
      (creature_type, rarity, map_id, route_id, location, destination_city_id,
       hp, max_hp, awakened_at, moved_at, speed)
    VALUES (?, 1, ?, ?, ?, ?, 170, 170, 2000, 2000, 18.7)
  `).run(remoteCreatureType, mapId, remoteRoute.id, remoteRoute.length / 2,
    remoteRoute.city2_id).lastInsertRowid);
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
  assert.match(html, /<h2>Route threats<\/h2>/);
  assert.match(html, /class="threat-card creature-card/);
  assert.match(html, /src="\/node\/creatures\/land-whale\.svg"/);
  assert.match(html, new RegExp(`class="threat-mark" href="/events/creatures/${creatureId}"`));
  assert.match(html, new RegExp(
    `class="creature-record-link" href="/events/creatures/${creatureId}">${
      catalog.rarities.find((rarity) => rarity.id === catalog.byId.get(vehicleType.itemId).rarity).name
    } Land Whale</a>`
  ));
  assert.match(html, new RegExp(`/events/creatures/${creatureId}/attack`));
  assert.match(html, new RegExp(`id="creature-${remoteCreatureId}"`),
    'a threat announced within a known region must not be hidden by unknown route endpoints');
  assert.match(html, new RegExp(
    `class="creature-record-link" href="/events/creatures/${remoteCreatureId}"`
  ));
  const originCityName = store.database.prepare(
    'SELECT name FROM catalog_cities WHERE id = ?'
  ).get(saved.cityId).name;
  for (const [id, definition] of [
    [vehicleId, vehicleType], [sameClassVehicleId, sameClassVehicleType]
  ]) {
    const item = catalog.byId.get(definition.itemId);
    const rarityName = catalog.rarities.find((rarity) => rarity.id === item.rarity).name;
    const renderedCityName = originCityName.replaceAll("'", '&#39;');
    const expectedOption = `<option value="${id}">${item.name} · ${rarityName} · ${renderedCityName} · #${id}</option>`;
    assert.ok(html.includes(
      expectedOption
    ), `missing ${expectedOption}; rendered ${html.match(/<option[^>]*>[^<]*<\/option>/gu)?.join(' ')}`);
  }
  assert.doesNotMatch(html, new RegExp(`<option value="${otherVehicleId}">`));
  assert.doesNotMatch(html, /12\.0 km\/h toward|bounty slots|combat class|Drops up to/i);
  const creatureArt = await fetch(`${base}/node/creatures/land-whale.svg`);
  assert.equal(creatureArt.status, 200);
  assert.match(creatureArt.headers.get('content-type'), /image\/svg\+xml/);
  assert.match(await creatureArt.text(), /<title[^>]*>Land Whale<\/title>/);

  const details = await fetch(`${base}/events/creatures/${creatureId}`, {
    headers: { cookie }
  });
  assert.equal(details.status, 200);
  const detailsHtml = await details.text();
  assert.match(detailsHtml, new RegExp(`<h1>${
    catalog.rarities.find((rarity) =>
      rarity.id === catalog.byId.get(vehicleType.itemId).rarity).name
  } Land Whale</h1>`));
  assert.match(detailsHtml, /Living-threat record/);
  assert.match(detailsHtml, /Terrestrial leviathan/);
  assert.match(detailsHtml, /Observed behaviour/);
  assert.match(detailsHtml, /Reported recovery/);
  assert.match(detailsHtml, /<dt>Health<\/dt><dd>140 \/ 140<\/dd>/);
  assert.match(detailsHtml, /Eligible vehicle tiers:/);
  assert.match(detailsHtml, new RegExp(`/events/creatures/${creatureId}/attack`));

  const remoteDetails = await fetch(`${base}/events/creatures/${remoteCreatureId}`, {
    headers: { cookie }
  });
  assert.equal(remoteDetails.status, 200,
    'the chat destination for a known-region threat must open its detailed record');

  store.database.prepare('UPDATE world_creatures SET hp = 100 WHERE id = ?').run(creatureId);
  const woundedHtml = await (await fetch(`${base}/events`, { headers: { cookie } })).text();
  assert.match(woundedHtml, /threat-condition-wounded">Wounded</);
  store.database.prepare('UPDATE world_creatures SET hp = 50 WHERE id = ?').run(creatureId);
  const seriouslyWoundedHtml = await (await fetch(`${base}/events`, {
    headers: { cookie }
  })).text();
  assert.match(seriouslyWoundedHtml,
    /threat-condition-seriously-wounded">Seriously wounded</);

  const rejectedAttack = await fetch(`${base}/events/creatures/${creatureId}/attack`, {
    method: 'POST', redirect: 'manual', headers: {
      cookie, 'content-type': 'application/x-www-form-urlencoded'
    }, body: new URLSearchParams({ vehicleId: String(otherVehicleId) })
  });
  assert.equal(rejectedAttack.status, 303);
  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count FROM world_creature_pursuits
    WHERE creature_id = ? AND vehicle_id = ?
  `).get(creatureId, otherVehicleId).count, 0);
  const attack = await fetch(`${base}/events/creatures/${creatureId}/attack`, {
    method: 'POST', redirect: 'manual', headers: {
      cookie, 'content-type': 'application/x-www-form-urlencoded'
    }, body: new URLSearchParams({ vehicleId: String(sameClassVehicleId) })
  });
  assert.equal(attack.status, 303);
  assert.equal(attack.headers.get('location'), '/events');
  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count FROM world_creature_pursuits
    WHERE creature_id = ? AND vehicle_id = ? AND status = 'pursuing'
  `).get(creatureId, sameClassVehicleId).count, 1);
  assert.equal(store.database.prepare(
    'SELECT COUNT(*) AS count FROM world_creature_attacks WHERE creature_id = ?'
  ).get(creatureId).count, 0);
  const vehicles = await fetch(`${base}/vehicles`, { headers: { cookie } });
  assert.equal(vehicles.status, 200);
  const vehiclesHtml = await vehicles.text();
  assert.match(vehiclesHtml, new RegExp(`Pursuing ${
    catalog.rarities.find((rarity) =>
      rarity.id === catalog.byId.get(vehicleType.itemId).rarity).name
  } Land Whale`));
  assert.match(vehiclesHtml, /Intercepts in/);
  const vehicle = await fetch(`${base}/vehicles/${sameClassVehicleId}`, { headers: { cookie } });
  assert.equal(vehicle.status, 200);
  assert.match(await vehicle.text(), /Interception in/);
});

test('offers every tier-compatible endpoint transport on restless-dead cards', async (context) => {
  const catalog = loadLegacyCatalog();
  const store = new SqliteStore(':memory:');
  store.seedCatalog(catalog);
  store.ensureWorldMaps(1000);
  const password = 'ghost shortcut password';
  const routeType = catalog.settings.route_type_ids.land;
  const route = catalog.routes.find((entry) => entry.open && entry.type === routeType
    && entry.city1Id !== entry.city2Id && [entry.city1Id, entry.city2Id].includes(1));
  const vehicleType = catalog.vehicles.find((vehicle) => vehicle.routeType === routeType
    && catalog.byId.get(vehicle.itemId)?.rarity === 3);
  const vehicleClass = catalog.settings.combat_class_by_rarity[
    catalog.byId.get(vehicleType.itemId)?.rarity
  ];
  const sameClassVehicleType = catalog.vehicles.find((vehicle) => vehicle.routeType === routeType
    && vehicle.itemId !== vehicleType.itemId
    && catalog.settings.combat_class_by_rarity[catalog.byId.get(vehicle.itemId)?.rarity]
      === vehicleClass);
  const otherVehicleType = catalog.vehicles.find((vehicle) => vehicle.routeType === routeType
    && catalog.byId.get(vehicle.itemId)?.rarity === 6);
  assert.ok(route && vehicleType && sameClassVehicleType && otherVehicleType);
  const player = createPlayer(
    'Ghost Shortcut Hunter', '', hashPassword(password), catalog, 1000, () => 0.5
  );
  player.inventory[vehicleType.itemId] = 1;
  player.inventory[sameClassVehicleType.itemId] = 1;
  player.inventory[otherVehicleType.itemId] = 1;
  const saved = store.addPlayer(player);
  const vehicleId = store.activateVehicle(saved.id, vehicleType.itemId);
  const sameClassVehicleId = store.activateVehicle(saved.id, sameClassVehicleType.itemId);
  const otherVehicleId = store.activateVehicle(saved.id, otherVehicleType.itemId);
  const administrator = store.addPlayer(createPlayer(
    'Ghost Shortcut Admin', '', 'hash', catalog, 1000, () => 0.5
  ));
  const ghost = store.adminRaiseGhost(administrator.id, 'rider', route.id, 2, 3000);
  const ghostSourceIcon = store.database.prepare(`
    SELECT catalog_items.icon FROM ghost_vehicles
    JOIN catalog_items ON catalog_items.id = ghost_vehicles.source_item_id
    WHERE ghost_vehicles.id = ?
  `).get(ghost.id).icon;
  const ghostVehicle = store.database.prepare(
    'SELECT destination_city_id FROM player_vehicles WHERE id = ?'
  ).get(ghost.vehicleId);
  store.database.prepare('UPDATE player_vehicles SET city_id = ? WHERE id = ?')
    .run(ghostVehicle.destination_city_id, vehicleId);
  store.database.prepare('UPDATE player_vehicles SET city_id = ? WHERE id = ?')
    .run(ghostVehicle.destination_city_id, sameClassVehicleId);
  store.database.prepare('UPDATE player_vehicles SET city_id = ? WHERE id = ?')
    .run(ghostVehicle.destination_city_id, otherVehicleId);
  store.database.prepare(`
    INSERT OR IGNORE INTO known_cities (player_id, city_id) VALUES (?, ?)
  `).run(saved.id, ghostVehicle.destination_city_id);
  const server = createApp({ store, catalog: store.loadCatalog(), now: () => 3001 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  store.worldEventStatus(saved.id, 3001);
  store.database.prepare(`
    UPDATE world_weather_slots SET condition = 'clear'
    WHERE slot_at = (SELECT last_slot_at FROM world_event_clock WHERE id = 1)
  `).run();
  context.after(async () => {
    await new Promise((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()));
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
  assert.match(html, new RegExp(`/events/ghosts/${ghost.id}/attack`));
  assert.match(html, new RegExp(`href="/events/ghosts/${ghost.id}"`));
  assert.doesNotMatch(html, /Recently banished|Recent creature outcomes|Your attacks/u);
  assert.match(html, new RegExp(
    `class="spectral-transport spectral-rider"[^>]*><img src="${ghostSourceIcon}`
  ));
  assert.doesNotMatch(html, /src="\/node\/events\/wraith-rider\.svg"/);
  assert.match(html, new RegExp(`>${ghost.name}</a>`));
  assert.match(html, /threat-condition-unhurt">Unhurt</);
  const routeRegion = store.database.prepare(`
    SELECT world_maps.name FROM catalog_cities
    JOIN world_maps ON world_maps.id = catalog_cities.map_id
    WHERE catalog_cities.id = ?
  `).get(route.city1Id);
  assert.match(html, new RegExp(`<dt>Region</dt><dd>${routeRegion.name}</dd>`));
  assert.match(html, new RegExp(`<option value="${vehicleId}">`));
  assert.match(html, new RegExp(`<option value="${sameClassVehicleId}">`));
  assert.doesNotMatch(html, new RegExp(`<option value="${otherVehicleId}">`));
  const endpointName = store.database.prepare(
    'SELECT name FROM catalog_cities WHERE id = ?'
  ).get(ghostVehicle.destination_city_id).name;
  assert.ok(html.includes(`${endpointName} · #${vehicleId}</option>`));
  assert.ok(html.includes(`${endpointName} · #${sameClassVehicleId}</option>`));

  const details = await fetch(`${base}/events/ghosts/${ghost.id}`, { headers: { cookie } });
  assert.equal(details.status, 200);
  const detailsHtml = await details.text();
  assert.match(detailsHtml, new RegExp(`<h1>${ghost.name}</h1>`));
  assert.match(detailsHtml, new RegExp(`<dt>Region</dt><dd>${routeRegion.name}</dd>`));
  assert.match(detailsHtml, /Unhurt and patrolling/);
  assert.match(detailsHtml, /What came back/);
  assert.match(detailsHtml, /Reported bounty/);
  assert.match(detailsHtml, new RegExp(`/events/ghosts/${ghost.id}/attack`));
  assert.match(detailsHtml, new RegExp(
    `class="ghost-record-spectre spectral-transport spectral-rider"><img src="${ghostSourceIcon}`
  ));

  store.database.prepare('UPDATE player_vehicles SET damaged = 1 WHERE id = ?')
    .run(ghost.vehicleId);
  const woundedEventsHtml = await (await fetch(`${base}/events`, {
    headers: { cookie }
  })).text();
  assert.match(woundedEventsHtml, new RegExp(
    `href="/events/ghosts/${ghost.id}"[\\s\\S]*?threat-condition-wounded">Wounded`
  ));
  const woundedDetailsHtml = await (await fetch(`${base}/events/ghosts/${ghost.id}`, {
    headers: { cookie }
  })).text();
  assert.match(woundedDetailsHtml, /Wounded and patrolling/);

  const icon = await fetch(`${base}/node/events/wraith-rider.svg`);
  assert.equal(icon.status, 200);
  assert.match(icon.headers.get('content-type'), /^image\/svg\+xml/);
  assert.match(await icon.text(), /<title id="title">Wraith Rider<\/title>/);
  const shipIcon = await fetch(`${base}/node/events/ghost-ship.svg`);
  assert.equal(shipIcon.status, 200);
  assert.match(await shipIcon.text(), /<title id="title">Ghost Ship<\/title>/);

  const attack = await fetch(`${base}/events/ghosts/${ghost.id}/attack`, {
    method: 'POST', redirect: 'manual', headers: {
      cookie, referer: `${base}/events`, 'content-type': 'application/x-www-form-urlencoded'
    }, body: new URLSearchParams({ vehicleId: String(sameClassVehicleId) })
  });
  assert.equal(attack.status, 303);
  assert.equal(attack.headers.get('location'), '/events');
  const plannedEncounter = store.database.prepare(`
    SELECT 1 FROM vehicle_encounters
    WHERE status = 'planned'
      AND ((vehicle1_id = ? AND vehicle2_id = ?)
        OR (vehicle1_id = ? AND vehicle2_id = ?))
  `).get(sameClassVehicleId, ghost.vehicleId, ghost.vehicleId, sameClassVehicleId);
  const hunter = store.database.prepare(
    'SELECT status, route_id, travel_order FROM player_vehicles WHERE id = ?'
  ).get(sameClassVehicleId);
  assert.ok(plannedEncounter);
  assert.equal(hunter.status, 'traveling');
  assert.equal(hunter.route_id, route.id);
  assert.equal(hunter.travel_order, 'peaceful');
});

test('groups compact finding notices from rarest to commonest', () => {
  const catalog = loadLegacyCatalog();
  const rare = catalog.items.find((item) => item.rarity === 6);
  const common = catalog.items.find((item) => item.rarity === 1);
  const notices = findingNoticeItems([
    { itemId: common.id, foundAt: 1000 },
    { itemId: rare.id, recycled: true, count: 2, foundAt: 1001 },
    { itemId: rare.id, recycled: true, foundAt: 1002 }
  ], catalog, { source: 'mine', cityId: 1 });

  assert.deepEqual(notices.map((notice) => ({
    itemId: notice.itemId,
    rarity: notice.rarity,
    quantity: notice.quantity,
    source: notice.source,
    cityId: notice.cityId,
    autoRecycled: notice.autoRecycled,
    foundAt: notice.foundAt
  })), [
    {
      itemId: rare.id, rarity: 6, quantity: 3, source: 'mine', cityId: 1,
      autoRecycled: true, foundAt: 1002
    },
    {
      itemId: common.id, rarity: 1, quantity: 1, source: 'mine', cityId: 1,
      autoRecycled: false, foundAt: 1000
    }
  ]);
  assert.equal(notices[0].path, `/items/${rare.id}`);
  assert.equal(notices[0].cityName, "Tzolk'in");
  assert.ok(notices.every((notice) => notice.icon && notice.rarityName && notice.sourceName));
});

test('shows one consolidated things-found catch-up after login', async (context) => {
  const catalog = loadLegacyCatalog();
  const store = new SqliteStore(':memory:');
  store.seedCatalog(catalog);
  const password = 'offline findings password';
  const player = store.addPlayer(createPlayer(
    'Offline Prospector', '', hashPassword(password), catalog, 1000, () => 0.5
  ));
  const common = catalog.items.find((item) => item.canFind && item.rarity === 1);
  const rare = catalog.items.find((item) => item.canFind && item.rarity === 6);
  store.mutatePlayer(player.id, () => null, () => ({
    source: 'mine', recordedAt: 2002,
    findings: [
      { itemId: common.id, quantity: 2, cityId: player.cityId, foundAt: 2000 },
      {
        itemId: rare.id, quantity: 1, cityId: player.cityId, foundAt: 2001,
        recycled: true
      },
      { cryptoTypeId: 1, quantity: 5, cityId: player.cityId, foundAt: 2002 }
    ]
  }), 2002);

  const server = createApp({ store, catalog, now: () => 3000 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const signIn = async () => {
    const response = await fetch(`${base}/login`, {
      method: 'POST', redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ name: player.name, password })
    });
    assert.equal(response.status, 303);
    return response.headers.get('set-cookie').split(';')[0];
  };

  const cookie = await signIn();
  const home = await (await fetch(base, { headers: { cookie } })).text();
  assert.match(home, /Things found while you were away/);
  assert.match(home, /Since you were last online, your operation found 8 things\./);
  assert.match(home, new RegExp(`data-item-id="${rare.id}"[^>]*data-quantity="1"`));
  assert.match(home, /Auto-recycled into Ore scraps/);
  assert.match(home, /data-item-id="crypto-1"[^>]*data-quantity="5"/);

  await fetch(`${base}/logout`, { method: 'POST', redirect: 'manual', headers: { cookie } });
  const secondCookie = await signIn();
  const secondHome = await (await fetch(base, { headers: { cookie: secondCookie } })).text();
  assert.doesNotMatch(secondHome, /Things found while you were away/,
    'the same catch-up is not shown at the next login');
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

  const originalSingleRouteLookup = store.routesForVehicle.bind(store);
  let singleRouteLookups = 0;
  store.routesForVehicle = (...args) => {
    singleRouteLookups += 1;
    return originalSingleRouteLookup(...args);
  };
  const vehicles = await fetch(`${base}/vehicles`, {
    redirect: 'manual', headers: { cookie, referer: `${base}/vehicles` }
  });
  store.routesForVehicle = originalSingleRouteLookup;
  assert.equal(vehicles.status, 200);
  assert.equal(singleRouteLookups, 0, 'fleet should not request routes one vehicle at a time');
  assert.equal(vehicles.headers.get('location'), null);
  assert.match(await vehicles.text(), /Traveling to/);

  const details = await fetch(`${base}/vehicles/${vehicleId}`, {
    redirect: 'manual', headers: { cookie, referer: `${base}/vehicles/${vehicleId}` }
  });
  assert.equal(details.status, 200);
  assert.equal(details.headers.get('location'), null);
  const detailsHtml = await details.text();
  assert.match(detailsHtml, /Traveling to <strong>★ Undiscovered regional capital · GATEWAY/);
  assert.doesNotMatch(detailsHtml, new RegExp(destination.name));
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

test('lists inter-region vehicle routes last and cycles unaltered transports through storage', async (context) => {
  const bootstrapCatalog = loadLegacyCatalog();
  const store = new SqliteStore(':memory:');
  store.seedCatalog(bootstrapCatalog);
  store.ensureWorldMaps(1000);
  const capitals = store.database.prepare(`
    SELECT capital_city_id FROM world_maps ORDER BY sort_order, id LIMIT 2
  `).all();
  store.database.prepare(`
    INSERT INTO catalog_routes
      (city1_id, city2_id, length, type, is_open, is_inter_map)
    VALUES (?, ?, 10500, 0, 1, 1)
  `).run(capitals[0].capital_city_id, capitals[1].capital_city_id);
  const catalog = store.loadCatalog();
  const password = 'fleet deactivation password';
  const region = catalog.maps.find((entry) => entry.slug === 'aso');
  const capitalId = Number(region.capitalCityId);
  const routeType = [...new Set(catalog.routes.filter((route) => route.open
    && [route.city1Id, route.city2Id].includes(capitalId)).map((route) => route.type))]
    .find((type) => {
      const routes = catalog.routes.filter((route) => route.open && route.type === type
        && [route.city1Id, route.city2Id].includes(capitalId));
      return routes.some((route) => route.interMap) && routes.some((route) => !route.interMap)
        && catalog.vehicles.some((vehicle) => vehicle.routeType === type
          && vehicle.routePolicy !== 'capital-link');
    });
  const vehicleType = catalog.vehicles.find((vehicle) => vehicle.routeType === routeType
    && vehicle.routePolicy !== 'capital-link');
  assert.ok(region && Number.isSafeInteger(routeType) && vehicleType);
  const player = createPlayer('Fleet Deactivator', '', hashPassword(password), catalog, 1000,
    () => 0.5);
  player.cityId = capitalId;
  player.knownCityIds = [capitalId];
  player.inventoryByCity = { [capitalId]: { [vehicleType.itemId]: 1 } };
  player.inventory = player.inventoryByCity[capitalId];
  const saved = store.addPlayer(player);
  const vehicleId = store.activateVehicle(saved.id, vehicleType.itemId, 1000);
  const routes = store.routesForVehicle(saved.id, vehicleId, 2000);
  const firstInterRegion = routes.findIndex((route) => route.interMap);
  const finalRegional = routes.findLastIndex((route) => !route.interMap);
  assert.ok(firstInterRegion > finalRegional && finalRegional >= 0,
    'every regional route should precede every inter-region route');

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
  const fleetHtml = await (await fetch(`${base}/vehicles`, { headers: { cookie } })).text();
  assert.match(fleetHtml, new RegExp(
    `action="/vehicles/${vehicleId}/store"><button class="secondary">Deactivate</button>`
  ));
  const regionalPosition = fleetHtml.indexOf(`value="${routes[finalRegional].id}"`);
  const interRegionPosition = fleetHtml.indexOf(`value="${routes[firstInterRegion].id}"`);
  assert.ok(regionalPosition >= 0 && interRegionPosition > regionalPosition);

  const deactivate = await fetch(`${base}/vehicles/${vehicleId}/store`, {
    method: 'POST', redirect: 'manual', headers: { cookie }
  });
  assert.equal(deactivate.status, 303);
  assert.equal(deactivate.headers.get('location'), '/vehicles#stored-vehicle-things');
  assert.equal(store.vehiclesForPlayer(saved.id, 2000, { settle: false }).length, 0);
  assert.equal(store.playerById(saved.id, 2000, { settle: false }).inventory[vehicleType.itemId], 1);
  const storedHtml = await (await fetch(`${base}/vehicles`, { headers: { cookie } })).text();
  assert.match(storedHtml, new RegExp(`action="/vehicles/activate/${vehicleType.itemId}"`));

  const reactivate = await fetch(`${base}/vehicles/activate/${vehicleType.itemId}`, {
    method: 'POST', redirect: 'manual', headers: { cookie }
  });
  assert.equal(reactivate.status, 303);
  assert.equal(store.vehiclesForPlayer(saved.id, 2000, { settle: false }).length, 1);
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
  const bonusMaximumHull = ship.ship.hull + 32;
  const currentHull = ship.ship.hull + 8;
  store.database.prepare(`
    UPDATE player_ship_state SET hull = ?, max_hull = ? WHERE vehicle_id = ?
  `).run(currentHull, bonusMaximumHull, vehicleId);
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

  const fleetHtml = await (await fetch(`${base}/vehicles`, { headers: { cookie } })).text();
  assert.match(fleetHtml, new RegExp(
    `/vehicles/${vehicleId}/customize#ammunition[^>]*>Load ammunition</a>`
  ));

  const statusResponse = await fetch(`${base}/vehicles/${vehicleId}`, { headers: { cookie } });
  const statusHtml = await statusResponse.text();
  assert.equal(statusResponse.status, 200);
  const descriptionPosition = statusHtml.indexOf('class="vehicle-hero"');
  const sendPosition = statusHtml.indexOf('class="vehicle-send-panel"');
  const loadoutPosition = statusHtml.indexOf('id="vehicle-loadout-heading"');
  assert.ok(descriptionPosition >= 0 && sendPosition > descriptionPosition
    && loadoutPosition > sendPosition,
  'Send appears directly after the vehicle description and before the long loadout');
  assert.match(statusHtml, /data-journey-planner/);
  assert.match(statusHtml, /Add onward leg/);
  assert.match(statusHtml, /data-journey-routes/);
  assert.match(statusHtml, /Combat targets are limited automatically to this vehicle's tier/);
  assert.match(statusHtml, /Also engage patrols in this tier/);
  assert.doesNotMatch(statusHtml, /Engage vehicles of these rarities|name="attack_\d+"/);
  assert.match(statusHtml, new RegExp(`/vehicles/${vehicleId}/customize#ammunition`));
  assert.match(statusHtml, /Load ammunition or change cannons/);
  assert.match(statusHtml, /\/node\/vehicle-journey\.js/);
  const journeyClient = await (await fetch(`${base}/node/vehicle-journey.js`)).text();
  assert.match(journeyClient, /journeyRoute_/);
  assert.match(journeyClient, /form\.dataset\.liveDirty = 'true'/);
  assert.match(journeyClient, /minethings:content-updated/);

  const response = await fetch(`${base}/vehicles/${vehicleId}/customize`, { headers: { cookie } });
  const html = await response.text();
  assert.equal(response.status, 200);
  assert.match(html, /<h2>Ship cannons <small>0\/\d+ portals occupied<\/small><\/h2>/);
  assert.match(html, /<h2 id="vehicle-loadout-heading">Current loadout<\/h2>/);
  assert.match(html, new RegExp(`<dt>Hull<\\/dt><dd>${currentHull}\\/${bonusMaximumHull}<\\/dd>`));
  assert.match(html, /Choose the complete cannon set you want fitted/);
  assert.match(html, /ammunition remains aboard/);
  assert.match(html, /Commit cannon changes before loading ammunition/);
  assert.match(html, /id="ammunition"/);
  assert.match(html, /shared ammunition hold/);
  assert.match(html, /Attach a cannon first/);
  assert.match(html, /Choose a proposed quantity below, preview the cannon loadout, then commit it/);
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
  assert.equal(attach.headers.get('location'), `/vehicles/${vehicleId}/customize#ammunition`);
  const armedHtml = await (await fetch(`${base}/vehicles/${vehicleId}/customize`, {
    headers: { cookie }
  })).text();
  assert.match(armedHtml, new RegExp(`action="/vehicles/${vehicleId}/ammo"`));
  assert.match(armedHtml, /Fitted in portal 1/);
  assert.match(armedHtml, /1\/\d+ portals occupied/);
  assert.match(armedHtml, /<dt>Cannons used<\/dt><dd>1<\/dd>/);
  assert.match(armedHtml, /name="quantity" min="1" max="3" value="1"/);
  assert.match(armedHtml, /Load 12 Cannonballs/);
  const load = await fetch(`${base}/vehicles/${vehicleId}/ammo`, {
    method: 'POST', redirect: 'manual', headers: {
      cookie, 'content-type': 'application/x-www-form-urlencoded'
    }, body: new URLSearchParams({ type: String(ammunition.type), quantity: '2' })
  });
  assert.equal(load.status, 303);
  assert.equal(load.headers.get('location'), `/vehicles/${vehicleId}/customize#ammunition`);
  const rule = catalog.settings.ammunition_rules[ammunition.type];
  assert.equal(store.vehicleDetails(saved.id, vehicleId, 2000).ship[rule.storageField],
    Number(catalog.settings.shots_per_crate) * 2);
  const loadedHtml = await (await fetch(`${base}/vehicles/${vehicleId}/customize`, {
    headers: { cookie }
  })).text();
  assert.match(loadedHtml, /<dt>Cannons used<\/dt><dd>1<\/dd>/);
  assert.match(loadedHtml, /<dt>Ammunition used<\/dt><dd>2<\/dd>/);
  assert.doesNotMatch(loadedHtml,
    /<dt>(?:Weapons|Cannons|Ammunition|Cargo) used<\/dt><dd>−/);
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
  assert.match(html, /name="intent" value="rarest"/);
  assert.match(html, /Take as much of the rarest things as we can/);
  const rarestPreview = await fetch(`${base}/vehicles/${vehicleId}/cargo`, {
    method: 'POST', redirect: 'manual', headers: {
      cookie, 'content-type': 'application/x-www-form-urlencoded'
    }, body: new URLSearchParams({ intent: 'rarest' })
  });
  assert.equal(rarestPreview.status, 200);
  const rarestPreviewHtml = await rarestPreview.text();
  assert.match(rarestPreviewHtml, /exact proposal is ready to commit/i);
  for (const item of [catalog.byId.get(storedVehicle.itemId), catalog.byId.get(ammoBox.itemId), ordinary]) {
    assert.match(rarestPreviewHtml,
      new RegExp(`name="cargo_${item.id}"[^>]*value="1"`));
  }
  assert.equal(store.vehicleDetails(saved.id, vehicleId, 2000).cargoSize, 0);
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

test('keeps vehicle management city-scoped while Things shows every stored city', async (context) => {
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
  assert.match(tzolkinVehicles,
    /<span>1 idle vehicle &middot; 1 thing stored<\/span>/);
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
  assert.match(kemetVehicles,
    /<span>1 idle vehicle &middot; 2 things stored<\/span>/);
  const kemetDetail = await (await fetch(`${base}/vehicles/${kemetShip}/cargo`, {
    headers: { cookie }
  })).text();
  assert.match(kemetDetail, new RegExp(`name="cargo_${kemetThing.id}"`));
  assert.doesNotMatch(kemetDetail, new RegExp(`name="cargo_${squid.id}"`));

  const kemetThings = await (await fetch(`${base}/inventory`, { headers: { cookie } })).text();
  assert.match(kemetThings, new RegExp(`data-item-id="${kemetThing.id}"`));
  assert.match(kemetThings, new RegExp(`data-item-id="${squid.id}"`));
  assert.match(kemetThings, /class="inventory-city current" data-city-id="3"/);
  assert.match(kemetThings,
    /data-city-id="1"[\s\S]*?<p class="eyebrow">Regional capital<\/p><h3><span class="capital-city-icon"[^>]*>★<\/span>Tzolk&#39;in<\/h3>/u);
  assert.match(kemetThings,
    /data-city-id="3"[\s\S]*?<p class="eyebrow">City<\/p><h3>Kemet<\/h3>/u);
  assert.ok(kemetThings.indexOf('data-city-id="3"') < kemetThings.indexOf('data-city-id="1"'),
    'the current city is first');
  await fetch(`${base}/cities/1/select`, {
    method: 'POST', redirect: 'manual', headers: { cookie, referer: `${base}/inventory` }
  });
  const tzolkinThings = await (await fetch(`${base}/inventory`, { headers: { cookie } })).text();
  assert.match(tzolkinThings, new RegExp(`data-item-id="${squid.id}"`));
  assert.match(tzolkinThings, new RegExp(`data-item-id="${kemetThing.id}"`));
  assert.match(tzolkinThings, /class="inventory-city current" data-city-id="1"/);
  assert.ok(tzolkinThings.indexOf('data-city-id="1"') < tzolkinThings.indexOf('data-city-id="3"'),
    'switching cities moves the newly current city to the front');
});

test('groups vehicles in other cities by region and orders cities within each region',
  async (context) => {
    const store = new SqliteStore(':memory:');
    store.seedCatalog(loadLegacyCatalog());
    store.ensureWorldMaps(1000);
    const catalog = store.loadCatalog();
    const password = 'regional vehicle order password';
    const [firstRegion, secondRegion] = catalog.maps;
    const firstRegionCities = catalog.cities.filter((city) => city.mapId === firstRegion.id)
      .sort((first, second) => first.name.localeCompare(second.name, 'en')).slice(0, 2);
    const secondRegionCity = catalog.cities.filter((city) => city.mapId === secondRegion.id)
      .sort((first, second) => first.name.localeCompare(second.name, 'en'))[0];
    const currentCity = catalog.cities.find((city) => city.id === 1);
    const transport = catalog.vehicles.find((entry) =>
      catalog.byId.get(entry.itemId)?.rarity === 1);
    assert.ok(firstRegion && secondRegion && firstRegionCities.length === 2
      && secondRegionCity && currentCity && transport);

    const remoteCities = [secondRegionCity, ...[...firstRegionCities].reverse()];
    const player = createPlayer(
      'Regional Vehicle Order', '', hashPassword(password), catalog, 1000, () => 0.5
    );
    player.cityId = currentCity.id;
    player.homeCityId = currentCity.id;
    player.knownCityIds = [currentCity.id, ...remoteCities.map((city) => city.id)];
    player.inventoryByCity = Object.fromEntries([
      [currentCity.id, {}],
      ...remoteCities.map((city) => [city.id, { [transport.itemId]: 1 }])
    ]);
    player.inventory = player.inventoryByCity[currentCity.id];
    const saved = store.addPlayer(player);
    for (const [index, city] of remoteCities.entries()) {
      store.changeCity(saved.id, city.id, 1100 + index);
      store.activateVehicle(saved.id, transport.itemId);
    }
    store.changeCity(saved.id, currentCity.id, 1200);

    const server = createApp({ store, now: () => 2000 });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    context.after(async () => {
      await new Promise((resolve, reject) =>
        server.close((error) => error ? reject(error) : resolve()));
      store.close();
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const login = await fetch(`${base}/login`, {
      method: 'POST', redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ name: player.name, password })
    });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const html = await (await fetch(`${base}/vehicles`, { headers: { cookie } })).text();
    const firstRegionIndex = html.indexOf(`data-region-id="${firstRegion.id}"`);
    const secondRegionIndex = html.indexOf(`data-region-id="${secondRegion.id}"`);
    assert.ok(firstRegionIndex >= 0 && secondRegionIndex > firstRegionIndex,
      'vehicle regions follow world-map order rather than activation or city-name order');
    const firstRegionHtml = html.slice(firstRegionIndex, secondRegionIndex);
    assert.ok(firstRegionHtml.indexOf(firstRegionCities[0].name)
      < firstRegionHtml.indexOf(firstRegionCities[1].name),
      'cities are alphabetical inside their vehicle region');
  });

test('starts, presents, and safely cancels a repeating vehicle shuttle', async (context) => {
  const catalog = loadLegacyCatalog();
  const store = new SqliteStore(':memory:');
  store.seedCatalog(catalog);
  const password = 'shuttle controller password';
  const landType = Number(catalog.settings.route_type_ids.land);
  const vehicleType = catalog.vehicles.find((vehicle) => vehicle.routeType === landType
    && catalog.byId.get(vehicle.itemId).rarity >= 4 && vehicle.capacity >= 2
    && catalog.routes.some((route) => route.open
      && route.type === landType && route.city1Id !== route.city2Id
      && [route.city1Id, route.city2Id].includes(1)));
  const cargoThing = catalog.items.find((item) => item.rarity === 6
    && item.mineTypeId === WOOD_CATALOG.mineType.id
    && item.id !== vehicleType.itemId && !catalog.vehicleByItemId.has(item.id)
    && !catalog.boxByItemId.has(item.id));
  assert.ok(vehicleType && cargoThing);
  const player = createPlayer(
    'Shuttle Controller', '', hashPassword(password), catalog, 1000, () => 0.5
  );
  player.inventory = { [vehicleType.itemId]: 1, [cargoThing.id]: 3 };
  player.inventoryByCity = { [player.cityId]: player.inventory };
  const saved = store.addPlayer(player);
  const vehicleId = store.activateVehicle(saved.id, vehicleType.itemId);
  const route = store.routesForVehicle(saved.id, vehicleId, 1900)
    .find((entry) => !entry.mission && entry.destinationCityId !== player.cityId);
  assert.ok(route);

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

  const setupHtml = await (await fetch(`${base}/vehicles/${vehicleId}`, {
    headers: { cookie }
  })).text();
  assert.match(setupHtml, /<h2>Set up a shuttle<\/h2>/u);
  assert.match(setupHtml, new RegExp(
    `action="/vehicles/${vehicleId}/shuttle"[\\s\\S]*?name="routeId"[\\s\\S]*?value="${route.id}"`,
    'u'
  ));
  assert.match(setupHtml, /<fieldset><legend>Cargo categories<\/legend>/u);
  assert.match(setupHtml,
    /<label>Order<select name="travelOrder"><option value="peaceful" selected>Peaceful<\/option><option value="pillage">Pillage<\/option><option value="patrol">Patrol<\/option><\/select><\/label>/u);
  assert.match(setupHtml, /chosen order applies on both the loaded outbound leg and the empty return leg/u);
  assert.match(setupHtml,
    /type="button" data-shuttle-deselect-all[^>]*>Deselect all<\/button>/u);
  assert.match(setupHtml, /<script src="\/node\/vehicle-shuttle\.js\?v=20260901a" defer><\/script>/u);
  assert.match(setupHtml,
    new RegExp(`name="category_${WOOD_CATALOG.mineType.id}" value="1"`, 'u'));
  assert.match(setupHtml,
    new RegExp(`name="category_${WISDOM_CATALOG.mineType.id}" value="1"`, 'u'));
  assert.match(setupHtml,
    new RegExp(`name="category_${SHUTTLE_OIL_CATEGORY_ID}" value="1"[^>]*> Oil`, 'u'));
  const shuttleCategoryInputs = [...setupHtml.matchAll(
    /<input[^>]+name="category_-?\d+"[^>]*>/gu
  )].map((match) => match[0]);
  assert.ok(shuttleCategoryInputs.length > 1);
  assert.ok(shuttleCategoryInputs.every((input) => /\schecked(?:\s|>)/u.test(input)),
    'every available shuttle mine category starts selected');
  assert.match(setupHtml, /Every category is selected\. Untick anything/u);
  assert.match(setupHtml, /Protected factory output is never loaded/u);
  assert.match(setupHtml, /Deactivated transports can travel as ordinary cargo/u);
  assert.match(setupHtml, /Oil Field machine parts stay in their Oil Field home city/u);

  store.database.prepare(`
    INSERT INTO player_vehicle_cargo (vehicle_id, item_id, quantity) VALUES (?, ?, 1)
  `).run(vehicleId, cargoThing.id);
  const loadedHtml = await (await fetch(`${base}/vehicles/${vehicleId}`, {
    headers: { cookie }
  })).text();
  assert.doesNotMatch(loadedHtml, new RegExp(`action="/vehicles/${vehicleId}/shuttle"`, 'u'),
    'shuttle setup is unavailable until the manual cargo hold is empty');
  store.database.prepare('DELETE FROM player_vehicle_cargo WHERE vehicle_id = ?').run(vehicleId);

  const missingCategories = await fetch(`${base}/vehicles/${vehicleId}/shuttle`, {
    method: 'POST', redirect: 'manual', headers: {
      cookie, referer: `${base}/vehicles/${vehicleId}`,
      'content-type': 'application/x-www-form-urlencoded'
    }, body: new URLSearchParams({ routeId: String(route.id) })
  });
  assert.equal(missingCategories.status, 303);
  assert.equal(missingCategories.headers.get('location'), `/vehicles/${vehicleId}`);
  const unchanged = store.vehicleDetails(saved.id, vehicleId, 2000);
  assert.equal(unchanged.status, 'idle');
  assert.equal(unchanged.shuttle, null, 'an invalid submission creates no shuttle contract');
  const rejectedHtml = await (await fetch(`${base}/vehicles/${vehicleId}`, {
    headers: { cookie }
  })).text();
  assert.match(rejectedHtml, /Choose at least one cargo category/u);

  const start = await fetch(`${base}/vehicles/${vehicleId}/shuttle`, {
    method: 'POST', redirect: 'manual', headers: {
      cookie, 'content-type': 'application/x-www-form-urlencoded'
    }, body: new URLSearchParams({
      routeId: String(route.id),
      travelOrder: 'pillage',
      [`category_${WOOD_CATALOG.mineType.id}`]: '1',
      [`category_${WISDOM_CATALOG.mineType.id}`]: '1'
    })
  });
  assert.equal(start.status, 303);
  assert.equal(start.headers.get('location'), `/vehicles/${vehicleId}`);
  const active = store.vehicleDetails(saved.id, vehicleId, 2000);
  assert.equal(active.status, 'traveling');
  assert.ok(active.shuttle);
  assert.equal(active.travelOrder, 'pillage');
  assert.equal(active.shuttle.travelOrder, 'pillage');
  assert.deepEqual(active.shuttle.mineTypeIds,
    [WOOD_CATALOG.mineType.id, WISDOM_CATALOG.mineType.id]);

  const activeHtml = await (await fetch(`${base}/vehicles/${vehicleId}`, {
    headers: { cookie }
  })).text();
  assert.match(activeHtml,
    /<dt>Cargo categories<\/dt><dd>Wood and Wisdom<\/dd>/u);
  assert.match(activeHtml, /<dt>Order<\/dt><dd>Pillage<\/dd>/u);
  const loadedCargo = active.cargo.find((entry) => entry.itemId === cargoThing.id);
  assert.ok(loadedCargo);
  assert.match(activeHtml,
    /<h3 id="vehicle-cargo-manifest-heading">Transport cargo <small>Read-only<\/small><\/h3>/u);
  assert.match(activeHtml, new RegExp(
    `data-item-id="${cargoThing.id}"[\\s\\S]*?<td data-label="Loaded">${loadedCargo.quantity}<\\/td>`,
    'u'
  ));
  const cargoManifest = /<section class="vehicle-cargo-manifest"[\s\S]*?<\/section>/u
    .exec(activeHtml)?.[0];
  assert.ok(cargoManifest);
  assert.doesNotMatch(cargoManifest, /<input/u);
  assert.match(activeHtml, /SHUTTLE · Outbound/u);
  assert.match(activeHtml,
    new RegExp(`action="/vehicles/${vehicleId}/shuttle/cancel"[\\s\\S]*?Cancel shuttle after this leg`, 'u'));
  assert.doesNotMatch(activeHtml, new RegExp(`action="/vehicles/${vehicleId}/send"`, 'u'));
  assert.doesNotMatch(activeHtml, new RegExp(`href="/vehicles/${vehicleId}/cargo"`, 'u'));
  const fleetHtml = await (await fetch(`${base}/vehicles`, { headers: { cookie } })).text();
  assert.match(fleetHtml, /SHUTTLE · Outbound/u);
  assert.match(fleetHtml, /class="eyebrow vehicle-shuttle-badge">SHUTTLE<\/span>/u);
  assert.match(fleetHtml, new RegExp(`action="/vehicles/${vehicleId}/shuttle/cancel"`, 'u'));
  const cargoWhileActive = await fetch(`${base}/vehicles/${vehicleId}/cargo`, {
    redirect: 'manual', headers: { cookie }
  });
  assert.equal(cargoWhileActive.status, 303);
  assert.equal(cargoWhileActive.headers.get('location'), `/vehicles/${vehicleId}`);

  const cancel = await fetch(`${base}/vehicles/${vehicleId}/shuttle/cancel`, {
    method: 'POST', redirect: 'manual', headers: { cookie }
  });
  assert.equal(cancel.status, 303);
  assert.equal(cancel.headers.get('location'), `/vehicles/${vehicleId}`);
  const finishingLeg = store.vehicleDetails(saved.id, vehicleId, 2000);
  assert.equal(finishingLeg.status, 'traveling');
  assert.equal(finishingLeg.shuttle, null);
});

test('shows Things only in the current region, ordered by city, rarity, and item type', async (context) => {
  const store = new SqliteStore(':memory:');
  store.seedCatalog(loadLegacyCatalog());
  store.ensureWorldMaps(1000);
  const catalog = store.loadCatalog();
  const password = 'global inventory order password';
  const [firstRegion, secondRegion] = catalog.maps;
  const firstRegionCities = catalog.cities.filter((city) => city.mapId === firstRegion.id)
    .sort((first, second) => first.name.localeCompare(second.name, 'en'));
  const secondRegionCity = catalog.cities.filter((city) => city.mapId === secondRegion.id)
    .sort((first, second) => first.name.localeCompare(second.name, 'en'))[0];
  const [firstCity, secondCity] = firstRegionCities;
  const commonVehicle = catalog.vehicles.find((entry) =>
    catalog.byId.get(entry.itemId)?.rarity === 1);
  const commonGadget = catalog.gadgetItems.find((entry) =>
    catalog.byId.get(entry.itemId)?.rarity === 1);
  const rareItem = catalog.items.find((item) => item.rarity === 6
    && item.id !== commonVehicle.itemId && item.id !== commonGadget.itemId);
  const outsideOnlyItem = catalog.items.find((item) => item.rarity === 5
    && item.id !== commonVehicle.itemId && item.id !== commonGadget.itemId);
  const typedCommonItems = [
    {
      item: catalog.byId.get(commonVehicle.itemId),
      type: catalog.settings.item_type_labels[
        commonVehicle.routeType === catalog.settings.route_type_ids.land ? 'landVehicle'
          : commonVehicle.routeType === catalog.settings.route_type_ids.sea ? 'ship' : 'aircraft'
      ]
    },
    { item: catalog.byId.get(commonGadget.itemId), type: catalog.settings.item_type_labels.gadget }
  ].sort((first, second) => first.type.localeCompare(second.type, 'en'));
  assert.ok(firstCity && secondCity && secondRegionCity && rareItem && outsideOnlyItem);

  const player = createPlayer(
    'Global Inventory Order', '', hashPassword(password), catalog, 1000, () => 0.5
  );
  player.cityId = firstCity.id;
  player.homeCityId = firstCity.id;
  player.knownCityIds = [firstCity.id, secondCity.id, secondRegionCity.id];
  player.inventoryByCity = {
    [firstCity.id]: {
      [rareItem.id]: 1,
      [typedCommonItems[0].item.id]: 1,
      [typedCommonItems[1].item.id]: 1
    },
    [secondCity.id]: { [rareItem.id]: 1 },
    [secondRegionCity.id]: { [outsideOnlyItem.id]: 1 }
  };
  player.inventory = player.inventoryByCity[player.cityId];
  store.addPlayer(player);

  const server = createApp({ store, now: () => 2000 });
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
  const html = await (await fetch(`${base}/inventory`, { headers: { cookie } })).text();

  const firstRegionMarker = `data-region-id="${firstRegion.id}"`;
  const secondRegionMarker = `data-region-id="${secondRegion.id}"`;
  assert.ok(html.includes(firstRegionMarker));
  assert.equal(html.includes(secondRegionMarker), false);
  assert.equal(html.includes(`data-city-id="${secondRegionCity.id}"`), false);
  assert.equal(html.includes(`data-item-id="${outsideOnlyItem.id}"`), false);
  assert.match(html, new RegExp(`Only physical things in ${firstRegion.name} are shown`, 'u'));
  const firstRegionHtml = html.slice(html.indexOf(firstRegionMarker));
  const firstCityMarker = `data-city-id="${firstCity.id}"`;
  const secondCityMarker = `data-city-id="${secondCity.id}"`;
  assert.ok(firstRegionHtml.indexOf(firstCityMarker) < firstRegionHtml.indexOf(secondCityMarker));
  const firstCityHtml = firstRegionHtml.slice(
    firstRegionHtml.indexOf(firstCityMarker), firstRegionHtml.indexOf(secondCityMarker)
  );
  const rareMarker = `data-item-id="${rareItem.id}"`;
  const firstTypeMarker = `data-item-id="${typedCommonItems[0].item.id}"`;
  const secondTypeMarker = `data-item-id="${typedCommonItems[1].item.id}"`;
  assert.ok(firstCityHtml.indexOf(rareMarker) < firstCityHtml.indexOf(firstTypeMarker));
  assert.ok(firstCityHtml.indexOf(firstTypeMarker) < firstCityHtml.indexOf(secondTypeMarker));
  assert.ok(firstCityHtml.includes(typedCommonItems[0].type));
  assert.ok(firstCityHtml.includes(typedCommonItems[1].type));
});

test('opens the original local order book from Your Things and preserves listed stock', async (context) => {
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
  const marketValue = store.marketForItem(item.id, player.cityId);
  const minimumPrice = marketValue.minimumPrice;
  const listingPrice = marketValue.listingStartPrice;

  const beforeHtml = await (await fetch(`${base}/inventory`, { headers: { cookie } })).text();
  assert.match(beforeHtml, /Live Database Thing/);
  assert.match(beforeHtml, /Live Database Rarity/);
  assert.match(beforeHtml, new RegExp(`href="/market/items/${item.id}"`));
  assert.match(beforeHtml, /Open local market/);
  assert.doesNotMatch(beforeHtml, new RegExp(`action="/inventory/${item.id}/list"`));
  assert.match(beforeHtml, new RegExp(
    `class="inventory-meld-form" method="post" action="/inventory/${item.id}/meld"><button class="secondary"[^>]*>Meld</button>`
  ));
  assert.match(beforeHtml, new RegExp(
    `class="recycle-all-form" method="post" action="/inventory/${item.id}/recycle"><input type="hidden" name="quantity" value="5"><button class="secondary">Recycle all`
  ));
  assert.doesNotMatch(beforeHtml, /Salvage/);
  assert.doesNotMatch(beforeHtml, new RegExp(`/inventory/${item.id}/sell`));

  const machineHtml = await (await fetch(`${base}/items/${pumpItem.id}`, { headers: { cookie } })).text();
  assert.match(machineHtml, /Live database pump description/);
  assert.match(machineHtml, new RegExp(`href="/market/items/${pumpItem.id}"`));
  assert.match(machineHtml, new RegExp(
    `<dt>Power \\(P\\)</dt><dd>${catalog.settings.machine_power[pumpItem.rarity] * 7} kW</dd>`
  ));
  store.database.prepare(`
    UPDATE catalog_settings
    SET value_json = '["#000000","#123456","#234567","#345678","#456789","#56789a","#6789ab"]'
    WHERE key = 'rarity_color_hexes'
  `).run();
  const machineIconResponse = await fetch(`${base}/node/machine-icons/pump-1.svg`);
  const machineIconEtag = machineIconResponse.headers.get('etag');
  const machineIcon = await machineIconResponse.text();
  assert.equal(machineIconResponse.headers.get('cache-control'),
    'public, max-age=604800, stale-while-revalidate=86400');
  assert.ok(machineIconEtag);
  assert.match(machineIcon, /fill="#123456"/);
  assert.match(machineIcon, /<title>Live Database Pump machine<\/title>/);
  assert.match(machineIcon, /<circle r="6"\/>/);
  const cachedMachineIcon = await fetch(`${base}/node/machine-icons/pump-1.svg`, {
    headers: { 'if-none-match': machineIconEtag }
  });
  assert.equal(cachedMachineIcon.status, 304);
  assert.equal(cachedMachineIcon.headers.get('cache-control'),
    'public, max-age=604800, stale-while-revalidate=86400');
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
  assert.equal(listing.headers.get('location'), `/market/items/${item.id}`);
  assert.equal(store.marketForItem(item.id, player.cityId).listings.length, 0,
    'the retired inventory shortcut must not bypass price selection');

  const placedListing = await fetch(`${base}/market/items/${item.id}/listings`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      cookie,
      referer: `${base}/market/items/${item.id}`,
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ price: String(listingPrice), quantity: '3' })
  });
  assert.equal(placedListing.status, 303);
  assert.equal(placedListing.headers.get('location'), `/market/items/${item.id}`);
  assert.equal(store.playerById(saved.id).inventory[item.id], 5);
  assert.equal(store.inventoryCapacity(saved.id).itemCount, 5);
  const market = store.marketForItem(item.id, player.cityId, saved.id);
  assert.equal(market.listings.length, 1);
  assert.equal(market.listings[0].quantity, 3);
  assert.equal(market.listings[0].price, listingPrice);
  const afterHtml = await (await fetch(`${base}/inventory`, { headers: { cookie } })).text();
  assert.match(afterHtml, /Listed things remain in that city and still use inventory capacity/);
  assert.match(afterHtml, new RegExp(`href="/market/items/${item.id}"`));
  const exchangeHtml = await (await fetch(`${base}/exchange`, { headers: { cookie } })).text();
  const unlistedCardHtml = exchangeHtml.match(new RegExp(
    `<article[^>]*data-item-id="${item.id}"[\\s\\S]*?</article>`
  ))?.[0];
  assert.ok(unlistedCardHtml);
  assert.match(unlistedCardHtml, new RegExp(
    `href="/market/items/${item.id}#place-bid">Bid</a>`
  ));
  assert.doesNotMatch(unlistedCardHtml, /Collectible|No current listing/);
  assert.doesNotMatch(exchangeHtml, /Open order book|Order book/);
  const listerMeldNeeds = store.remainingMeldItemNeeds(saved.id);
  const meldableKnownItemId = store.playerById(saved.id).discoveries
    .map((entry) => entry.itemId).find((itemId) => Number(listerMeldNeeds[itemId]) > 0);
  assert.ok(meldableKnownItemId, 'the player should know a Thing needed by an unfinished Meld');
  const meldableCardHtml = exchangeHtml.match(new RegExp(
    `<article[^>]*data-item-id="${meldableKnownItemId}"[\\s\\S]*?</article>`
  ))?.[0];
  assert.match(meldableCardHtml, /class="market-meldable-badge"[^>]*>Meldable<\/span>/);
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
  assert.match(buyerExchangeHtml, new RegExp(
    `action="/market/items/${item.id}/buy-now"[\\s\\S]*?<button>Buy now</button>`
  ));
  assert.match(buyerExchangeHtml, new RegExp(
    `href="/market/items/${item.id}#place-bid">Bid</a>`
  ));
  assert.doesNotMatch(buyerExchangeHtml, /Open order book|Order book/);
  const knownUnlistedItemId = buyer.discoveries.find((entry) => entry.itemId !== item.id)?.itemId;
  assert.ok(knownUnlistedItemId, 'buyer should know an unlisted item');
  assert.match(buyerExchangeHtml, new RegExp(
    `href="/market/items/${knownUnlistedItemId}#place-bid">Bid</a>`
  ));
  const bidPageHtml = await (await fetch(`${base}/market/items/${knownUnlistedItemId}`, {
    headers: { cookie: buyerCookie }
  })).text();
  assert.match(bidPageHtml, /<form id="place-bid" class="market-ticket"/);
  const buyerKnownIds = new Set(buyer.discoveries.map((entry) => entry.itemId));
  const unknownItem = catalog.items.find((entry) => entry.id !== item.id && !buyerKnownIds.has(entry.id));
  assert.ok(unknownItem, 'catalog should retain undiscovered items');
  assert.doesNotMatch(buyerExchangeHtml, new RegExp(`/market/items/${unknownItem.id}(?:#|\")`));
  const filteredExchangeHtml = await (await fetch(
    `${base}/exchange?type=definitely-not-a-type&sort=price-asc`,
    { headers: { cookie: buyerCookie } }
  )).text();
  assert.match(filteredExchangeHtml, /No matching known item markets/);
  assert.match(filteredExchangeHtml, /value="price-asc" selected/);

  const listAll = await fetch(`${base}/market/items/${item.id}/listings`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      cookie,
      referer: `${base}/market/items/${item.id}`,
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ price: String(listingPrice), quantity: '2' })
  });
  assert.equal(listAll.status, 303);
  assert.equal(store.playerById(saved.id).inventory[item.id], 5);
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
  assert.equal(liveStarter.inventory[154],
    liveStarter.discoveries.filter((finding) => finding.itemId === 154).length + 1);
  assert.equal(liveStarter.inventory[LEGACY_STARTER_WELCOME_PACK.dwarfItemId],
    liveStarter.discoveries.filter((finding) =>
      finding.itemId === LEGACY_STARTER_WELCOME_PACK.dwarfItemId).length + 1);
  for (const gadgetItemId of LEGACY_STARTER_WELCOME_PACK.gadgetItemIds) {
    assert.equal(liveStarter.inventory[gadgetItemId],
      liveStarter.discoveries.filter((finding) => finding.itemId === gadgetItemId).length + 1);
  }
  assert.deepEqual(liveStarter.mines.filter((mine) => mine.rentalUntil > 0)
    .map((mine) => mine.mineTypeId), [4, 5]);
  assert.equal(liveStarter.cryptoBalances[1], 5);
  assert.equal(store.casinoState(liveStarter.id).currencies.find((currency) =>
    currency.id === 1).voucherQuantity, 100);
  const [welcome] = store.recentMessages(liveStarter.id, 'all', 'Admin')
    .filter((message) => message.details.event === 'registration-welcome');
  assert.ok(welcome, 'registration creates the welcome inbox message before email verification');
  assert.equal(welcome.kept, true);
  assert.equal(welcome.read, false);
  assert.equal(welcome.details.grants.credits, 4321);
  assert.equal(welcome.details.grants.initialDiscoveries, 2);
  assert.equal(welcome.details.grants.itemLimit, 73);
  assert.equal(welcome.details.grants.casinoVoucherQuantity, 100);
  assert.deepEqual(welcome.details.grants.gadgets.map((gadget) => gadget.itemId),
    LEGACY_STARTER_WELCOME_PACK.gadgetItemIds);
  assert.deepEqual(welcome.details.grants.rentalMines.map((mine) => mine.mineTypeId), [4, 5]);
  assert.match(welcome.body, /4,321 credits and 5g/);
  assert.match(welcome.body, /2 initial discoveries/);
  assert.match(welcome.body, /Capacity for 73 Things/);
  const starterCookie = registration.headers.get('set-cookie').split(';')[0];
  assert.equal((await fetch(base, {
    redirect: 'manual', headers: { cookie: starterCookie }
  })).headers.get('location'), '/verify-email');
  await verifyDevelopmentEmail(base, starterCookie);
  assert.equal(store.playerById(liveStarter.id).emailVerified, true);
  assert.equal(store.registrationWelcomePrompt(liveStarter.id)?.id, welcome.id);
  const starterHtml = await (await fetch(base, { headers: { cookie: starterCookie } })).text();
  assert.match(starterHtml, /Email verified\. Your miner is unlocked\./u);
  assert.match(starterHtml, /class="starter-mail-prompt"/u);
  assert.match(starterHtml, /You've got mail/u);
  assert.match(starterHtml, /Incoming Council transmission/u);
  assert.match(starterHtml, /action="\/messages\/welcome\/ignore"/u);
  assert.match(starterHtml, new RegExp(`href="/messages/view/${welcome.id}"`, 'u'));
  assert.match(starterHtml, />Ignore</u);
  assert.match(starterHtml, />Read message</u);
  assert.doesNotMatch(starterHtml, /data-poll-|finding-queue\.js/);
  const inbox = await fetch(`${base}/messages?type=Admin`, {
    headers: { cookie: starterCookie }
  });
  assert.equal(inbox.status, 200);
  const inboxHtml = await inbox.text();
  assert.match(inboxHtml, /Notice of banishment and estate disposition/);
  assert.match(inboxHtml, /The Council/);
  assert.match(inboxHtml, /Kept/);
  const ignored = await fetch(`${base}/messages/welcome/ignore`, {
    method: 'POST', redirect: 'manual',
    headers: { cookie: starterCookie, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ messageId: String(welcome.id) })
  });
  assert.equal(ignored.status, 303);
  assert.equal(ignored.headers.get('location'), '/');
  const ignoredHomeHtml = await (await fetch(base, {
    headers: { cookie: starterCookie }
  })).text();
  assert.doesNotMatch(ignoredHomeHtml, /class="starter-mail-prompt"/u);
  const detail = await fetch(`${base}/messages/view/${welcome.id}`, {
    headers: { cookie: starterCookie }
  });
  assert.equal(detail.status, 200);
  const detailHtml = await detail.text();
  assert.match(detailHtml, /<dt>From<\/dt><dd>The Council<\/dd>/u);
  assert.match(detailHtml, /To Live Starter,/);
  assert.match(detailHtml, /Sentence proposed:/);
  assert.match(detailHtml, /banished permanently to Old Earth/);
  assert.match(detailHtml, /paid for by your dissolved estate/);
  assert.match(detailHtml, /1 x Yellow Tin Shield/);
  assert.match(detailHtml, /Terms of provisional survival:/);
  assert.match(detailHtml, /Create your starter miner bot/);
  assert.match(detailHtml, /Assembled/);
  assert.match(detailHtml, /Kept: this message will not expire/);
  for (const path of ['/', '/inventory', '/dwarves', '/gadgets', '/vehicles', '/casino', '/map', '/exchange', '/crypto', '/guide']) {
    assert.match(detailHtml, new RegExp(`href="${path.replace('/', '\\/')}"`));
  }
  assert.equal(store.recentMessages(liveStarter.id, 'unread', 'Admin').length, 0);
});

test('breaks factory-made Bolt boxes down from local inventory', async (context) => {
  const catalog = loadLegacyCatalog();
  const store = new SqliteStore(':memory:');
  store.seedCatalog(catalog);
  const password = 'bolt box password';
  const box = BOLT_BOX_CATALOG.items[0];
  const player = createPlayer(
    'Bolt Box Opener', '', hashPassword(password), catalog, 1000, () => 0.5
  );
  player.inventory[box.id] = 2;
  player.inventoryByCity = { [player.cityId]: player.inventory };
  const saved = store.addPlayer(player);
  store.database.prepare(`
    INSERT INTO protected_inventory (player_id, city_id, item_id, quantity)
    VALUES (?, ?, ?, 2)
  `).run(saved.id, saved.cityId, box.id);
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
  const beforeHtml = await (await fetch(`${base}/inventory`, { headers: { cookie } })).text();
  assert.match(beforeHtml, new RegExp(
    `class="bolt-box-breakdown-form" method="post" action="/inventory/${box.id}/break-down"`
  ));
  assert.match(beforeHtml, /max="2" value="1" required><button>Break down · 20 Bolts each/u);

  const response = await fetch(`${base}/inventory/${box.id}/break-down`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      cookie,
      referer: `${base}/inventory`,
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({ quantity: '2' })
  });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/inventory');
  const restored = store.playerById(saved.id);
  assert.equal(restored.inventory[box.id], undefined);
  assert.equal(restored.inventory[BOLT_BOX_CATALOG.boltItemId], 40);
  assert.equal(restored.protectedInventoryByCity[saved.cityId][BOLT_BOX_CATALOG.boltItemId], 40);
  const afterHtml = await (await fetch(`${base}/inventory`, { headers: { cookie } })).text();
  assert.match(afterHtml, /2 boxes broken down into 40 Bolts/u);
});

test('disables city and crypto Sell now tickets without local stock and renders a price line', async (context) => {
  const catalog = loadLegacyCatalog();
  const store = new SqliteStore(':memory:');
  store.seedCatalog(catalog);
  const password = 'sell ticket password';
  const item = catalog.items.find((candidate) => candidate.repairedItemId === null);
  const sellerState = createPlayer(
    'Sell Ticket Seller', '', hashPassword(password), catalog, 1000, () => 0.5
  );
  sellerState.inventory = {};
  sellerState.inventoryByCity = { 1: {}, 2: { [item.id]: 2 } };
  sellerState.knownCityIds = [1, 2];
  const seller = store.addPlayer(sellerState);
  const bidderState = createPlayer(
    'Sell Ticket Bidder', '', hashPassword(password), catalog, 1000, () => 0.5
  );
  bidderState.gold = 100;
  const bidder = store.addPlayer(bidderState);
  store.placeBuyOrder(bidder.id, item.id, 1, 3, 2000);
  store.placeCryptoOrder(bidder.id, 1, 'buy', 2, 3, 2001);
  const currentTime = 100 * 86400000;
  const insertSale = store.database.prepare(`
    INSERT INTO crypto_market_sales
      (buyer_id, seller_id, crypto_type_id, price_units, quantity, created_at)
    VALUES (?, ?, 1, ?, ?, ?)
  `);
  insertSale.run(bidder.id, seller.id, 10 * 10000, 2, currentTime - 4000);
  insertSale.run(bidder.id, seller.id, 12 * 10000, 3, currentTime - 3000);
  insertSale.run(bidder.id, seller.id, 8 * 10000, 1, currentTime - 2000);
  insertSale.run(bidder.id, seller.id, 11 * 10000, 4, currentTime - 1000);
  const server = createApp({ store, now: () => currentTime });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${base}/login`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ name: seller.name, password })
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];

  const emptyItemHtml = await (await fetch(`${base}/market/items/${item.id}`, {
    headers: { cookie }
  })).text();
  const emptyItemSell = emptyItemHtml.match(new RegExp(
    `<form[^>]*method="post" action="/market/items/${item.id}/sell-now">[\\s\\S]*?</form>`
  ))?.[0];
  assert.ok(emptyItemSell);
  assert.match(emptyItemSell, /name="quantity"[^>]* disabled/);
  assert.match(emptyItemSell, /<button disabled/);
  const sellerCityName = catalog.cities.find((city) => city.id === seller.cityId).name
    .replaceAll('&', '&amp;').replaceAll("'", '&#39;');
  assert.ok(emptyItemHtml.includes(`<strong>0</strong> in ${sellerCityName}`));

  const emptyCryptoHtml = await (await fetch(`${base}/crypto`, { headers: { cookie } })).text();
  const emptyCryptoSell = emptyCryptoHtml.match(
    /<form[^>]*method="post" action="\/crypto\/1\/sell-now">[\s\S]*?<\/form>/
  )?.[0];
  assert.ok(emptyCryptoSell);
  assert.match(emptyCryptoSell, /name="quantity"[^>]* disabled/);
  assert.match(emptyCryptoSell, /<button disabled/);
  assert.match(emptyCryptoHtml, /class="crypto-price-line" d="M [^"]+ L /);
  assert.match(emptyCryptoHtml, /class="crypto-price-area"/);
  assert.match(emptyCryptoHtml, /class="crypto-price-reference"/);
  assert.doesNotMatch(emptyCryptoHtml, /crypto-candle|crypto-volume-bar/);
  assert.match(emptyCryptoHtml, /Volume <strong>10<\/strong>/);
  assert.match(emptyCryptoHtml, /VWAP <strong>10\.8g<\/strong>/);
  assert.match(emptyCryptoHtml, /<dt>Last sale<\/dt><dd>11g<\/dd>/);

  store.database.prepare(`
    INSERT INTO inventory (player_id, city_id, item_id, quantity) VALUES (?, 1, ?, 1)
  `).run(seller.id, item.id);
  store.database.prepare(`
    INSERT INTO player_crypto_balances (player_id, crypto_type_id, quantity)
    VALUES (?, 1, 1)
  `).run(seller.id);
  const stockedItemHtml = await (await fetch(`${base}/market/items/${item.id}`, {
    headers: { cookie }
  })).text();
  const stockedItemSell = stockedItemHtml.match(new RegExp(
    `<form[^>]*method="post" action="/market/items/${item.id}/sell-now">[\\s\\S]*?</form>`
  ))?.[0];
  assert.ok(stockedItemSell);
  assert.match(stockedItemSell, /name="quantity" min="1" max="1"/);
  assert.doesNotMatch(stockedItemSell, /<button disabled/);
  const stockedCryptoHtml = await (await fetch(`${base}/crypto`, { headers: { cookie } })).text();
  const stockedCryptoSell = stockedCryptoHtml.match(
    /<form[^>]*method="post" action="\/crypto\/1\/sell-now">[\s\S]*?<\/form>/
  )?.[0];
  assert.ok(stockedCryptoSell);
  assert.match(stockedCryptoSell, /name="quantity" min="1" max="1"/);
  assert.doesNotMatch(stockedCryptoSell, /<button disabled/);
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
  const exchangeHtml = await (await fetch(`${base}/exchange`, { headers: { cookie } })).text();
  const unneededCardHtml = exchangeHtml.match(new RegExp(
    `<article[^>]*data-item-id="${itemId}"[\\s\\S]*?</article>`
  ))?.[0];
  assert.ok(unneededCardHtml);
  assert.match(unneededCardHtml, new RegExp(
    `href="/market/items/${itemId}#place-bid">Bid</a>`
  ));
  assert.doesNotMatch(unneededCardHtml, /market-meldable-badge|Meldable/);

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
  assert.match(quietHtml, /id="flash-dialog-message"[^>]*><\/p>/);

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
      cookie, referer: `${base}/mines/1/explosives`,
      'content-type': 'application/x-www-form-urlencoded'
    }, body: new URLSearchParams({ itemId: String(blu82.id), count: '1' })
  });
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/mines/1/explosives?detonated=1');
  assert.equal(hydrations, 0);
  assert.equal(rewrites, 0);
  assert.equal(store.database.prepare(
    'SELECT quantity FROM inventory WHERE player_id = 1 AND city_id = 1 AND item_id = ?'
  ).get(blu82.id), undefined);
  assert.equal(store.database.prepare(
    'SELECT COUNT(*) AS count FROM discoveries WHERE player_id = 1'
  ).get().count, 100);
  const explosiveFindings = store.database.prepare(`
    SELECT payload_json FROM live_update_events
    WHERE scope = 'player:1' AND event_type = 'items-found'
    ORDER BY id
  `).all().map((row) => JSON.parse(row.payload_json))
    .filter((finding) => finding.source === 'explosives');
  const explosiveFinding = explosiveFindings[0];
  assert.ok(explosiveFinding, 'the detonation records a structured live finding event');
  const reveal = await fetch(`${base}/mines/1/explosives?detonated=1`, {
    headers: { cookie }
  });
  const revealHtml = await reveal.text();
  assert.equal(reveal.status, 200);
  assert.doesNotMatch(revealHtml, /id="finding-dialog"|finding-queue\.js/);
  assert.match(revealHtml, new RegExp(
    `<aside id="flash-dialog" class="flash-notice"[^>]+data-notice-key="findings:${
      explosiveFindings.map((finding) => finding.eventId).join(',')}"`
  ));
  assert.match(revealHtml, /<strong id="flash-dialog-title">Things found<\/strong>/);
  assert.match(revealHtml, /<p id="flash-dialog-message"[^>]*>\d+ things? found and processed\.<\/p>/);
  assert.match(revealHtml, /<ul id="flash-dialog-items" class="flash-item-list" aria-label="Items found">/);
  assert.match(revealHtml, new RegExp(
    `<li class="flash-item rarity-${explosiveFinding.rarity}" data-item-id="${explosiveFinding.itemId}"[^>]*data-finding-event-ids="[^"]*${explosiveFinding.eventId}[^"]*"[^>]*>`
  ));
  assert.match(revealHtml, new RegExp(
    `<a class="flash-item-link" href="/items/${explosiveFinding.itemId}"><img src="[^"]+" alt="">`
  ));
  assert.match(revealHtml, new RegExp(
    `<strong>${explosiveFinding.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}<\\/strong>`
  ));
  assert.match(revealHtml, new RegExp(
    explosiveFinding.rarityName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  ));
  assert.match(revealHtml, /Explosives|Detonation/);
  assert.match(revealHtml, /Added to your things/);
  assert.match(revealHtml, /aria-label="Quantity \d+">(?:×|&times;|&#215;)\d+<\/b>/);
  assert.doesNotMatch(revealHtml, /Detonation (?:cleared|mined)/);
  assert.equal(explosiveFinding.cityName, "Tzolk'in");
});

test('retires finding polls, acknowledgements, reports, and manual collection', async (context) => {
  const catalog = loadLegacyCatalog();
  const store = new SqliteStore(':memory:');
  store.seedCatalog(catalog);
  const password = 'retired finding flow password';
  const player = createPlayer('Automatic Finder', '', hashPassword(password), catalog, 1000,
    () => 0.5);
  player.mines[0].nextFindAt = 200000;
  store.addPlayer(player);
  const server = createApp({ store, now: () => 100000 });
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

  const home = await (await fetch(base, { headers: { cookie } })).text();
  assert.doesNotMatch(home,
    /finding-dialog|finding-occasion-card|finding-queue\.js|data-poll-|Collect findings/);
  assert.match(home, /<aside id="flash-dialog" class="flash-notice"/);
  assert.match(home, /<ul id="flash-dialog-items" class="flash-item-list"/);
  assert.match(home, /\/node\/flash-modal\.js/);
  assert.match(home, /\/node\/live-updates\.js/);

  const flashModal = await (await fetch(`${base}/node/flash-modal.js`)).text();
  assert.ok(flashModal.includes('\\u2694\\uFE0F'));
  assert.ok(flashModal.includes('\\u2192'));
  assert.ok(flashModal.includes('\\u00d7'));
  assert.match(flashModal, /nextDocument\.querySelector\('#left'\)/u,
    'same-page actions refresh contextual sidebar counts');
  assert.match(flashModal, /minethings:content-updated/u,
    'sidebar replacement notifies navigation and other client enhancements');
  assert.doesNotMatch(flashModal, /â|Â|Ã/u);

  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count FROM sqlite_schema
    WHERE type = 'table' AND name = 'finding_queue'
  `).get().count, 0);
  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count FROM catalog_settings
    WHERE key LIKE 'finding_poll_%' OR key IN ('finding_debounce_ms', 'finding_lease_ms')
  `).get().count, 0);

  const retiredRequests = [
    fetch(`${base}/api/findings`, { headers: { cookie } }),
    fetch(`${base}/api/findings/ack`, {
      method: 'POST', headers: { cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ token: 'retired' })
    }),
    fetch(`${base}/node/finding-queue.js`, { headers: { cookie } }),
    fetch(`${base}/mines/1/claim`, { method: 'POST', headers: { cookie } })
  ];
  for (const response of await Promise.all(retiredRequests)) assert.equal(response.status, 404);
});

test('settles mines without collection and keeps retired finding reports off the Dwarf page', async (context) => {
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

  const itemCountBefore = Object.values(store.playerById(saved.id).inventoryByCity[1])
    .reduce((sum, quantity) => sum + quantity, 0);
  assert.equal((await fetch(`${base}/dwarves/findings`, { headers: { cookie } })).status, 404);
  const settledPlayer = store.playerById(saved.id);
  const itemCountAfter = Object.values(settledPlayer.inventoryByCity[1])
    .reduce((sum, quantity) => sum + quantity, 0);
  assert.ok(itemCountAfter > itemCountBefore, 'a due mine settles without a collection request');
  assert.ok(settledPlayer.mines[0].nextFindAt > 2000);
  const mineFinding = store.database.prepare(`
    SELECT payload_json FROM live_update_events
    WHERE scope = ? AND event_type = 'items-found'
    ORDER BY id DESC
  `).all(`player:${saved.id}`).map((row) => JSON.parse(row.payload_json))
    .find((finding) => finding.source === 'mine');
  assert.ok(mineFinding, 'automatic settlement emits the structured finding event used by SSE');

  const minePageHtml = await (await fetch(base, { headers: { cookie } })).text();
  assert.doesNotMatch(minePageHtml,
    /id="finding-dialog"|finding-occasion-card|finding-queue\.js|Collect findings/);

  const rare = catalog.items.find((item) => item.rarity === 6);
  const green = catalog.items.find((item) => item.rarity === 2);

  const localMarket = store.marketForItem(rare.id, saved.cityId);
  const localMarketValue = localMarket.fixedPrice;
  const marketHtml = await (await fetch(`${base}/market/items/${rare.id}`, {
    headers: { cookie }
  })).text();
  assert.match(marketHtml, new RegExp(`minimum price <strong>${localMarketValue}g</strong>`));
  assert.match(marketHtml, new RegExp(
    `action="/market/items/${rare.id}/bids"[\\s\\S]*?name="price" min="${localMarket.listingStartPrice}"`
  ));
  assert.match(marketHtml, /name="price"/);
  assert.match(marketHtml, /Place bid/);
  assert.match(marketHtml, /Place listing/);
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
  assert.doesNotMatch(dwarfPageHtml,
    /\b5%|disappearance risk|chance to disappear|database-configured|random delay/i);

  const dwarfItemId = catalog.dwarfTiers[0].itemId;
  store.database.prepare('UPDATE catalog_items SET description = ? WHERE id = ?').run(
    'A useful little miner. After each find this Yellow Dwarf has a 5% chance to disappear. Keep watch.',
    dwarfItemId
  );
  const dwarfDetailHtml = await (await fetch(`${base}/items/${dwarfItemId}`, {
    headers: { cookie }
  })).text();
  const dwarfMarketHtml = await (await fetch(`${base}/market/items/${dwarfItemId}`, {
    headers: { cookie }
  })).text();
  for (const html of [dwarfDetailHtml, dwarfMarketHtml]) {
    assert.match(html, /A useful little miner/);
    assert.match(html, /Keep watch/);
    assert.doesNotMatch(html,
      /\b5%|disappearance risk|chance to disappear|random delay|0(?:â€“|–|-)1 minute/i);
  }
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
  assert.match(firstCityHtml, /href="\/mines\/1\/equipment">Equip your miner<\/a>/);
  assert.match(firstCityHtml, /href="\/mines\/1\/explosives">Mine with explosives<\/a>/);
  assert.doesNotMatch(firstCityHtml, /\/mines\/2\/equipment/);
  assert.doesNotMatch(firstCityHtml, /\/mines\/2\/explosives/);

  const select = await fetch(`${base}/cities/2/select`, {
    method: 'POST', redirect: 'manual', headers: { cookie }
  });
  assert.equal(select.status, 303);
  const secondCityHtml = await (await fetch(`${base}/`, { headers: { cookie } })).text();
  assert.match(secondCityHtml, /Mines in Burgundy/);
  assert.match(secondCityHtml, /\/mines\/2\/equipment/);
  assert.match(secondCityHtml, /\/mines\/2\/explosives/);
  assert.doesNotMatch(secondCityHtml, /\/mines\/1\/equipment/);
  assert.doesNotMatch(secondCityHtml, /\/mines\/1\/explosives/);

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
  const remoteExplosives = await fetch(`${base}/mines/2/explosives`, {
    redirect: 'manual', headers: { cookie }
  });
  assert.equal(remoteExplosives.status, 303);
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
  const addGraceMeld = store.database.prepare(
    'INSERT INTO player_melds (player_id, meld_id, created_at) VALUES (?, ?, 1000)'
  );
  for (const meld of catalog.melds.slice(0, 20)) addGraceMeld.run(grace.id, meld.id);
  // This fixture advances several weeks to exercise mailbox expiry. Its focus is
  // message rendering, so do not let synthetic 1970 starter finds create an
  // unrelated overdue daily digest during that jump.
  store.database.prepare('DELETE FROM finding_events').run();
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
  const reportShipItem = catalog.items.find((item) => item.name === 'Champion');
  assert.ok(reportShipItem && catalog.vehicleByItemId.get(reportShipItem.id)?.ship);
  const krakenMessageId = Number(store.database.prepare(`
    INSERT INTO messages
      (sender_id, recipient_id, message_type, subject, body, details_json, is_read, created_at)
    VALUES (NULL, ?, 'Vehicle', 'Kraken defeated', ?, ?, 1, 2600)
  `).run(ada.id,
    `Your Krakenbreaker dealt 244 damage to the Kraken and took 24 damage. You defeated it. The remaining 6 cargo slots were filled with bounty: ${bountyList}.`,
    JSON.stringify({
      event: 'world-creature-combat', defeated: true, rewards: rewardItems,
      creatureName: 'Legendary Kraken', creatureType: 'kraken', creatureRarity: 6,
      vehicleName: 'Krakenbreaker', vehicleItemId: reportShipItem.id,
      vehicleIcon: reportShipItem.icon,
      damage: 244, counterDamage: 24, hp: 0,
      vehicleRatingBefore: 1600, vehicleRatingAfter: 1605,
      creatureRatingBefore: 1600, creatureRatingAfter: 1595,
      starting: { creatureHp: 244, creatureMaxHp: 244,
        vehicle: { hull: 80, maxHull: 80,
          ammunition: { massives: 6, chain_shots: 2, grape_shots: 1 } } },
      ending: { creatureHp: 0, vehicle: { hull: 56, maxHull: 80,
        ammunition: { massives: 5, chain_shots: 2, grape_shots: 1 } } },
      phases: [{
        kind: 'cannon', round: 1,
        creatureBefore: { hp: 244, maxHp: 244 },
        creatureAfter: { hp: 0, maxHp: 244 },
        vehicleBefore: { hull: 80, maxHull: 80 },
        vehicleAfter: { hull: 56, maxHull: 80 },
        vehicleAttacks: [{
          kind: 'cannon', portal: 1, cannonName: 'Thunder',
          ammunitionType: 1, ammunitionName: 'Cannonball', accuracy: 0.6,
          hit: true, critical: true, damage: 244
        }],
        creatureAttack: { name: 'Tentacle smash', target: 'hull', damage: 24 }
      }],
      skippedPhases: [{ kind: 'boarding',
        reason: 'Boarding was skipped because a ship crew cannot board a world creature.' }],
      actions: [{ label: 'Manage vehicle', path: '/vehicles/41' }]
    })
  ).lastInsertRowid);
  const orangeFinding = catalog.items.find((item) => item.rarity === 6);
  const purpleFinding = catalog.items.find((item) => item.rarity === 5);
  const greenFinding = catalog.items.find((item) => item.rarity === 2);
  const findingsMessageId = Number(store.database.prepare(`
    INSERT INTO messages
      (sender_id, recipient_id, message_type, subject, body, details_json, is_read, created_at)
    VALUES (NULL, ?, 'Findings', 'Daily findings · 24 August', ?, ?, 1, 2700)
  `).run(ada.id,
    'Your mines found 8 things yesterday: 4 were kept and 4 were auto-recycled.',
    JSON.stringify({
      event: 'daily-findings-digest', dayKey: '2026-08-24',
      totalQuantity: 10, thingQuantity: 8, cryptoQuantity: 2,
      keptQuantity: 4, autoRecycledQuantity: 4,
      dwarfQuantity: 3, dwarfKeptQuantity: 2, dwarfAutoRecycledQuantity: 1,
      distinctItemCount: 3, locationCount: 2, bestRarityName: orangeFinding.rarityName,
      keptFindings: [
        { itemId: orangeFinding.id, quantity: 1 },
        { itemId: purpleFinding.id, quantity: 1 },
        { itemId: orangeFinding.id, quantity: 2 }
      ],
      autoRecycledFindings: [{ itemId: greenFinding.id, quantity: 4 }],
      cryptoFindings: [{
        cryptoTypeId: 1, name: 'Aso Coin', icon: '/node/crypto/aso.svg',
        rarity: 1, rarityName: 'Crypto coin', quantity: 2, path: '/crypto'
      }],
      locationCounts: [
        {
          cityId: ada.cityId,
          cityName: catalog.cities.find((city) => city.id === ada.cityId).name,
          quantity: 9, thingQuantity: 7, cryptoQuantity: 2
        },
        {
          cityId: null, cityName: catalog.settings.location_labels.atSea,
          quantity: 1, thingQuantity: 1, cryptoQuantity: 0
        }
      ],
      actions: [
        { label: 'View your Dwarves', path: '/dwarves' },
        { label: 'View your things', path: '/inventory' },
        { label: 'Review auto-recycle', path: '/mines/auto-recycle' },
        { label: 'View your crypto', path: '/crypto' }
      ]
    })
  ).lastInsertRowid);
  const dwarfFindingsMessageId = Number(store.database.prepare(`
    INSERT INTO messages
      (sender_id, recipient_id, message_type, subject, body, details_json, is_read, created_at)
    VALUES (NULL, ?, 'Findings', 'Dwarf report · Green Dwarf scarpered', ?, ?, 1, 2725)
  `).run(ada.id,
    'A Dwarf has scarpered. Before leaving, your Dwarves found 3 things.',
    JSON.stringify({
      event: 'dwarf-departure-report', departedAt: 2725,
      totalQuantity: 3, thingQuantity: 3, keptQuantity: 2,
      autoRecycledQuantity: 1, distinctItemCount: 2,
      locationCount: 1, bestRarityName: orangeFinding.rarityName,
      departedQuantity: 1,
      departedDwarves: [{
        itemId: 391, name: 'Green Dwarf', icon: '/node/favicon.svg',
        rarity: 2, rarityName: 'Green', cityId: ada.cityId,
        cityName: catalog.cities.find((city) => city.id === ada.cityId).name,
        quantity: 1
      }],
      keptFindings: [{ itemId: orangeFinding.id, quantity: 2 }],
      autoRecycledFindings: [{ itemId: greenFinding.id, quantity: 1 }],
      locationCounts: [{
        cityId: ada.cityId,
        cityName: catalog.cities.find((city) => city.id === ada.cityId).name,
        quantity: 3, thingQuantity: 3, cryptoQuantity: 0
      }],
      systemSenderName: 'Dwarf Foreman',
      actions: [
        { label: 'View your Dwarves', path: '/dwarves' },
        { label: 'View your things', path: '/inventory' },
        { label: 'Review auto-recycle', path: '/mines/auto-recycle' }
      ]
    })
  ).lastInsertRowid);
  const archivedFindingMessageId = Number(store.database.prepare(`
    INSERT INTO messages
      (sender_id, recipient_id, message_type, subject, body, details_json, is_read, created_at)
    VALUES (NULL, ?, 'Findings', 'Archived finding snapshot', ?, ?, 1, 2750)
  `).run(ada.id, 'A catalog-retired finding is preserved below.', JSON.stringify({
    event: 'daily-findings-digest', totalQuantity: 1, keptQuantity: 1,
    autoRecycledQuantity: 0, distinctItemCount: 1,
    keptFindings: [{
      itemId: 999999, name: 'Retired Test Relic', icon: '/node/favicon.svg',
      rarity: 5, rarityName: 'Purple', quantity: 1,
      status: 'Loaded into ship cargo'
    }]
  })).lastInsertRowid);

  const originalMessageForPlayer = store.messageForPlayer.bind(store);
  store.messageForPlayer = (playerId, messageId) => {
    const message = originalMessageForPlayer(playerId, messageId);
    if (messageId !== vehicleMessageId) return message;
    return {
      ...message,
      details: {
        ...message.details,
        event: 'vehicle-combat', battleId: 41, battleType: 'land2', side: 0,
        outcome: 'won', aggressive: true, opponentAggressive: false,
        ratingBefore: 1600, ratingAfter: 1612, encounterLocation: 42,
        combatDuration: 60000,
        starting: [
          { attack: 12, armor: 14, offense: 3, defense: 2, dodge: 1 },
          { attack: 8, armor: 10, offense: -2.55, defense: -12, dodge: -15 }
        ],
        result: {
          ending: [{ attack: 12, armor: 14 }, { attack: 5, armor: 0 }],
          roundLog: [{
            round: 1,
            before: [{ aggressive: true }, { aggressive: false }],
            reductions: [
              { side: 0, opponent: 1, attackBefore: 8, attackAfter: 5 },
              { side: 1, opponent: 0, attackBefore: 12, attackAfter: 12 }
            ],
            blows: [{ side: 0, opponent: 1, damage: 12, armorBefore: 10, armorAfter: 0 }]
          }]
        },
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
  assert.match(inboxHtml,
    /<aside id="left"[\s\S]*?<a class="text-link" href="\/vehicles">Fleet \(\d+\)<\/a>/u);
  assert.doesNotMatch(inboxHtml, /<aside id="left"[\s\S]*?<a class="text-link" href="\/vehicles">Vehicles<\/a>/u);
  assert.match(inboxHtml, /data-message-select-all[^>]*aria-label="Select all visible messages"/u);
  assert.match(inboxHtml, /data-message-select[^>]*aria-label="Select message from/u);
  assert.match(inboxHtml, /data-message-selected-count>0<\/strong>/u);
  assert.match(inboxHtml, /<script src="\/node\/messages\.js" defer><\/script>/u);
  assert.match(inboxHtml, /class="player-meld-vital" style="--miner-chat-color:#55666b"><dt>Melds<\/dt><dd>0<\/dd>/u);
  for (const label of ['PM', 'Findings', 'Vehicle', 'City', 'Machine', 'Market', 'Factory']) {
    assert.match(inboxHtml, new RegExp(`>${label}<\\/a>`));
  }
  assert.match(inboxHtml, new RegExp(`href="/messages/view/${vehicleMessageId}"`));
  assert.match(inboxHtml, new RegExp(`href="/messages/${encodeURIComponent(grace.name)}"`));
  assert.match(inboxHtml, /28-day mailbox/);
  assert.match(inboxHtml, />Keep<\/button>/);
  assert.match(inboxHtml, /Deletes 29\/01\/1970/);

  const minersHtml = await (await fetch(`${base}/miners`, { headers: { cookie } })).text();
  const graceRank = 'class="miner-meld-rank" style="--miner-chat-color:#6c6c00" aria-label="Meld rank 1, 20 melds"';
  const adaRank = 'class="miner-meld-rank" style="--miner-chat-color:#55666b" aria-label="Meld rank 2, 0 melds"';
  assert.ok(minersHtml.indexOf(graceRank) < minersHtml.indexOf(adaRank));
  assert.match(minersHtml, /Community · ranked by Melds/u);
  const searchedMinersHtml = await (await fetch(`${base}/miners?q=Typed%20Inbox%20Ada`, {
    headers: { cookie }
  })).text();
  assert.match(searchedMinersHtml, /aria-label="Meld rank 2, 0 melds"/u);

  const meldsHtml = await (await fetch(`${base}/melds`, { headers: { cookie } })).text();
  assert.match(meldsHtml, /If you want to be respected around here, you are going to need Melds\./u);
  assert.match(meldsHtml, /Lots of Melds\. Make them, climb the ranks, and become famous\./u);
  assert.match(meldsHtml, /<h3>Glowing examples<\/h3>/u);
  const graceLeader = `href="/miners/${encodeURIComponent(grace.name)}">${grace.name}</a><span class="meld-leader-total"><strong>20</strong><small>Melds`;
  const adaLeader = `href="/miners/${encodeURIComponent(ada.name)}">${ada.name}</a><span class="meld-leader-total"><strong>0</strong><small>Melds`;
  assert.ok(meldsHtml.indexOf(graceLeader) < meldsHtml.indexOf(adaLeader));
  assert.match(meldsHtml, /style="--miner-chat-color:#6c6c00"><span class="meld-leader-rank">#1<\/span>/u);
  assert.match(minersHtml, /class="miner-meld-total"><strong>20<\/strong><small>Melds<\/small>/u);

  const findingsInbox = await fetch(
    `${base}/messages?filter=all&type=Findings`, { headers: { cookie } }
  );
  assert.equal(findingsInbox.status, 200);
  const findingsInboxHtml = await findingsInbox.text();
  assert.match(findingsInboxHtml, /Daily findings · 24 August/);
  assert.match(findingsInboxHtml, /Dwarf report · Green Dwarf scarpered/);
  assert.match(findingsInboxHtml, /Your mines found 8 things yesterday/);
  assert.match(findingsInboxHtml, /<time datetime="1970-01-01T00:00:02\.700Z">/);
  assert.match(findingsInboxHtml,
    /class="active" href="\/messages\?filter=all&type=Findings">Findings<\/a>/);
  assert.doesNotMatch(findingsInboxHtml, /The Wayfarer arrived|City report/);

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
  assert.match(detailHtml, /<h3>Land combat rounds<\/h3>/);
  assert.match(detailHtml,
    /opponent opened with 8 base attack, 10 armour, 0 aggressive power, 0 defensive power, and 0 dodge/u);
  assert.doesNotMatch(detailHtml, /-2\.55 aggressive power|-12 defensive power|-15 dodge/u);
  assert.match(detailHtml, /<td>Your vehicle<\/td><td>Aggressive<\/td>/);
  assert.match(detailHtml, /<td>12<\/td><td>10 → 0<\/td>/);
  assert.match(detailHtml, /Rating 1,600 → 1,612/);
  assert.doesNotMatch(detailHtml, /href="\/\/example\.test/);
  assert.doesNotMatch(detailHtml, /href="https:\/\/example\.test/);
  assert.match(detailHtml, /Messages \(2\)/);
  assert.match(detailHtml, /Keep this message/);

  const krakenDetail = await fetch(`${base}/messages/view/${krakenMessageId}`, {
    headers: { cookie }
  });
  assert.equal(krakenDetail.status, 200);
  const krakenHtml = await krakenDetail.text();
  assert.match(krakenHtml, /<h2>Combat phases<\/h2>/);
  assert.match(krakenHtml, /<h2>Opening state<\/h2>/);
  assert.match(krakenHtml, /<h2>Closing state<\/h2>/);
  assert.ok(krakenHtml.indexOf('<h2>Opening state</h2>')
    < krakenHtml.indexOf('<h2>Combat phases</h2>'));
  assert.ok(krakenHtml.indexOf('<h2>Combat phases</h2>')
    < krakenHtml.indexOf('<h2>Closing state</h2>'));
  assert.match(krakenHtml, new RegExp(`src="${reportShipItem.icon}"`, 'u'));
  assert.match(krakenHtml, /src="\/node\/creatures\/kraken\.svg"/u);
  assert.match(krakenHtml, /<dt>Cannonball ammunition<\/dt><dd>6 shots/u);
  assert.match(krakenHtml, /<dt>Cannonball ammunition<\/dt><dd>5 shots/u);
  assert.doesNotMatch(krakenHtml, /massives/u);
  assert.match(krakenHtml, /<dt>Rating<\/dt><dd>1,600<\/dd>/u);
  assert.match(krakenHtml, /<dt>Rating<\/dt><dd>1,605<\/dd>/u);
  assert.match(krakenHtml, /<h3>Cannon round 1<\/h3>/);
  assert.match(krakenHtml, /Thunder/);
  assert.match(krakenHtml, /Critical hit for 244 damage/);
  assert.match(krakenHtml, /Tentacle smash/);
  assert.match(krakenHtml, /damage to hull \(80 → 56\)/);
  assert.match(krakenHtml, /<h3>Boarding<\/h3>/);
  assert.match(krakenHtml, /cannot board a world creature/);
  assert.match(krakenHtml, /<h2 id="message-items-\d+-0">Bounty<\/h2><span>6 things<\/span>/);
  assert.doesNotMatch(krakenHtml, /filled with bounty:/);
  for (const reward of rewardItems) {
    const item = catalog.byId.get(reward.itemId);
    assert.ok(krakenHtml.includes(`class="message-item rarity-${item.rarity}"`));
    assert.ok(krakenHtml.includes(`href="/items/${item.id}"`));
    assert.ok(krakenHtml.includes(`src="${item.icon}"`));
    assert.ok(krakenHtml.includes(`<strong>${item.name}</strong>`));
  }

  const findingsDetail = await fetch(`${base}/messages/view/${findingsMessageId}`, {
    headers: { cookie }
  });
  assert.equal(findingsDetail.status, 200);
  const findingsHtml = await findingsDetail.text();
  assert.match(findingsHtml, /aria-label="Findings summary"/);
  assert.match(findingsHtml, /<dt>Things found<\/dt><dd><strong>8<\/strong><\/dd>/);
  assert.match(findingsHtml, /<dt>Kept<\/dt><dd><strong>4<\/strong><\/dd>/);
  assert.match(findingsHtml, /<dt>Auto-recycled<\/dt><dd><strong>4<\/strong><\/dd>/);
  assert.match(findingsHtml, /<dt>Crypto found<\/dt><dd><strong>2<\/strong><\/dd>/);
  assert.match(findingsHtml, /<dt>Found by Dwarves<\/dt><dd><strong>3<\/strong><\/dd>/);
  assert.match(findingsHtml, /<dt>Distinct things<\/dt><dd><strong>3<\/strong><\/dd>/);
  assert.match(findingsHtml, /<h2 id="message-locations-\d+">Found locations<\/h2>/);
  assert.match(findingsHtml, /7 things · 2 crypto coins/);
  assert.match(findingsHtml, new RegExp(catalog.settings.location_labels.atSea));
  assert.match(findingsHtml,
    /<h2 id="message-items-\d+-0">Added to your things<\/h2><span>4 things<\/span>/);
  assert.match(findingsHtml,
    /<h2 id="message-items-\d+-1">Auto-recycled into Ore scraps<\/h2><span>4 things<\/span>/);
  assert.match(findingsHtml,
    /<h2 id="message-items-\d+-2">Added to your crypto things<\/h2><span>2 coins<\/span>/);
  assert.match(findingsHtml, /href="\/crypto"><img src="\/node\/crypto\/aso\.svg"/);
  assert.match(findingsHtml, /<strong>Aso Coin<\/strong>/);
  for (const finding of [orangeFinding, purpleFinding, greenFinding]) {
    assert.ok(findingsHtml.includes(`class="message-item rarity-${finding.rarity}"`));
    assert.ok(findingsHtml.includes(`href="/items/${finding.id}"`));
    assert.ok(findingsHtml.includes(`src="${finding.icon}"`));
    assert.ok(findingsHtml.includes(`<strong>${finding.name}</strong>`));
  }
  assert.ok(findingsHtml.indexOf(orangeFinding.name) < findingsHtml.indexOf(purpleFinding.name),
    'kept findings are ordered by descending rarity');
  assert.match(findingsHtml, /<b aria-label="Quantity 3">3×<\/b>/);
  assert.match(findingsHtml, /<b aria-label="Quantity 4">4×<\/b>/);
  assert.match(findingsHtml, /href="\/dwarves">View your Dwarves<\/a>/);
  assert.match(findingsHtml, /href="\/inventory">View your things<\/a>/);
  assert.match(findingsHtml, /href="\/mines\/auto-recycle">Review auto-recycle<\/a>/);
  assert.match(findingsHtml, /href="\/crypto">View your crypto<\/a>/);

  const dwarfFindingsDetail = await fetch(
    `${base}/messages/view/${dwarfFindingsMessageId}`, { headers: { cookie } }
  );
  assert.equal(dwarfFindingsDetail.status, 200);
  const dwarfFindingsHtml = await dwarfFindingsDetail.text();
  assert.match(dwarfFindingsHtml, /<dt>From<\/dt><dd>Dwarf Foreman<\/dd>/);
  assert.match(dwarfFindingsHtml, /aria-label="Dwarf findings summary"/);
  assert.match(dwarfFindingsHtml, /<dt>Dwarf finds<\/dt><dd><strong>3<\/strong><\/dd>/);
  assert.match(dwarfFindingsHtml, /<dt>Kept<\/dt><dd><strong>2<\/strong><\/dd>/);
  assert.match(dwarfFindingsHtml,
    /<dt>Auto-recycled<\/dt><dd><strong>1<\/strong><\/dd>/);
  assert.doesNotMatch(dwarfFindingsHtml, /<dt>Crypto found<\/dt>/);
  assert.match(dwarfFindingsHtml,
    /<h2 id="message-locations-\d+">Dwarf work locations<\/h2>/);
  assert.match(dwarfFindingsHtml,
    /<h2 id="message-items-\d+-0">Dwarf finds added to your things<\/h2><span>2 things<\/span>/);
  assert.match(dwarfFindingsHtml,
    /<h2 id="message-items-\d+-1">Dwarf finds auto-recycled into Ore scraps<\/h2><span>1 thing<\/span>/);
  assert.match(dwarfFindingsHtml, /href="\/dwarves">View your Dwarves<\/a>/);
  assert.match(dwarfFindingsHtml, /href="\/inventory">View your things<\/a>/);
  assert.match(dwarfFindingsHtml,
    /href="\/mines\/auto-recycle">Review auto-recycle<\/a>/);

  const archivedFindingDetail = await fetch(
    `${base}/messages/view/${archivedFindingMessageId}`, { headers: { cookie } }
  );
  assert.equal(archivedFindingDetail.status, 200);
  const archivedFindingHtml = await archivedFindingDetail.text();
  assert.match(archivedFindingHtml, /Loaded into ship cargo/);
  assert.match(archivedFindingHtml, /class="message-item rarity-5"/);
  assert.match(archivedFindingHtml, /href="\/items\/999999"/);
  assert.match(archivedFindingHtml, /src="\/node\/favicon\.svg"/);
  assert.match(archivedFindingHtml, /<strong>Retired Test Relic<\/strong>/);

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
  const protectedInbox = await fetch(`${base}/messages?filter=all&type=Vehicle`, {
    headers: { cookie }
  });
  const protectedInboxHtml = await protectedInbox.text();
  assert.match(protectedInboxHtml, /0 messages updated\. 1 kept message was not deleted\./);
  assert.match(protectedInboxHtml,
    /value="delete" disabled title="Stop keeping this message before deleting it">Delete<\/button>/);
  currentTime = 3000 + Number(catalog.settings.message_retention_ms) + 1;
  await fetch(`${base}/messages`, { headers: { cookie } });
  assert.deepEqual(store.database.prepare(
    'SELECT id, is_kept, is_deleted FROM messages WHERE recipient_id = ? ORDER BY id'
  ).all(ada.id).map((row) => [row.id, row.is_kept, row.is_deleted]),
  [[vehicleMessageId, 1, 0]]);
});

test('conceals casino outcomes and disables manual pulls throughout free spins', (context) => {
  const catalog = loadLegacyCatalog();
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const player = store.addPlayer(createPlayer(
    'Unspoiled Reels', '', 'hash', catalog, 1000, () => 0.5
  ));
  store.database.prepare('UPDATE players SET gold_units = ? WHERE id = ?')
    .run(100 * 10000, player.id);
  const randomValues = [
    0.5, 0.98, ...Array(8).fill(0.01),
    0.5, ...Array(9).fill(0.01)
  ];
  const spin = store.spinCasino(player.id, 'gold', 1, () => randomValues.shift(), 2000);
  const html = casinoPage(store.casinoState(player.id, spin.id));
  const visibleReels = html.slice(
    html.indexOf('<div class="casino-reel-grid"'),
    html.indexOf('<form class="casino-controls"')
  );

  assert.equal(spin.frames.length, 2);
  assert.match(html, /<dt>Global spins<\/dt><dd>1<\/dd>/u);
  assert.match(visibleReels, /data-casino-bonus="shift-bell"/u,
    'first paint shows the paid frame rather than the already-resolved final frame');
  assert.match(html,
    /<section class="casino-result is-replaying" data-casino-outcome="is-win"/u);
  assert.match(html, /id="casino-replay-status">Free spins starting&hellip;<\/p>/u);
  assert.match(html,
    /<button class="casino-pull" id="casino-pull" disabled><span>Free spins running<\/span>/u);
  assert.match(html, /data-casino-concealed>Free spins in play<\/span>/u);
  assert.equal((html.match(/data-casino-concealed/gu) ?? []).length, 4,
    'outcome-sensitive headline stats and ledger values remain concealed');
  assert.doesNotMatch(html, /casino-machine has-jackpot/u);
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
    '/app.css', '/node/navigation.js', '/node/messages.js', '/node/casino.js', '/node/favicon.svg',
    '/node/landing-rebirth.jpg', '/img/home_bg.jpg', '/node/map-background.png',
    '/node/maps/aso.png', '/node/shrooms/mine.svg', '/node/wood/mine.svg',
    '/node/wisdom/mine.svg', '/node/electronics/mine.svg', '/node/relics/mine.svg',
    '/node/mines/mine-1.svg', '/node/mines/mine-4.svg', '/node/mines/mine-5.svg',
    ...SHROOM_CATALOG.items.map((item) => item.icon),
    ...WOOD_CATALOG.items.map((item) => item.icon),
    ...WISDOM_CATALOG.items.map((item) => item.icon),
    ...ELECTRONICS_CATALOG.items.map((item) => item.icon),
    ...RELICS_CATALOG.items.map((item) => item.icon)
  ]) {
    const response = await fetch(`${base}${asset}`);
    assert.equal(response.status, 200, asset);
    assert.ok(Number(response.headers.get('content-length')) > 0, asset);
    if (asset === '/app.css') assert.equal(response.headers.get('cache-control'), 'no-cache');
    if (/\.(?:jpg|png|svg)$/u.test(asset)) {
      assert.match(response.headers.get('content-type'), /^image\//u, asset);
      assert.equal(response.headers.get('cache-control'),
        'public, max-age=604800, stale-while-revalidate=86400', asset);
    }
  }
  const visualContractCss = await (await fetch(`${base}/app.css`)).text();
  assert.match(visualContractCss, /\.text-link:any-link \{[^}]*text-decoration-line: underline/u);
  assert.doesNotMatch(visualContractCss,
    /a:any-link \{ border: 0 !important; text-decoration: none !important; \}/u);
  for (const source of ['../src/server.js', '../src/email.js']) {
    const markup = fs.readFileSync(new URL(source, import.meta.url), 'utf8');
    assert.equal(
      [...markup.matchAll(/<a\b(?=[^>]*\bhref\s*=)(?![^>]*\bclass\s*=)[^>]*>/giu)].length,
      0, `${source} must not emit classless anchors`
    );
  }
  assert.doesNotMatch(visualContractCss,
    /\.chat-page \.chat-row \{[^}]*\bbackground\s*:/su);
  assert.doesNotMatch(visualContractCss,
    /\.chat-page \.chat-row-world \{[^}]*\bbackground\s*:/su);
  assert.doesNotMatch(visualContractCss, /\.chat-page \.chat-row-dwarf \{/u);
  assert.match(visualContractCss, /\.chat-world-message \{[^}]*font-weight:\s*400/su);
  assert.match(visualContractCss,
    /\.chat-dwarf-item img \{[^}]*background:\s*transparent;[^}]*border:\s*0;/su);
  assert.match(visualContractCss, /\.chat-ignore-action \{[^}]*border:\s*0/su);
  assert.match(visualContractCss,
    /\.spectral-transport img \{[^}]*mix-blend-mode:\s*screen;[^}]*filter:\s*var\(--spectral-filter\)/su);
  assert.match(visualContractCss, /\.spectral-transport\.spectral-rider \{/u);
  assert.match(visualContractCss,
    /\.city-landmark-art \{[^}]*width:\s*100%;[^}]*height:\s*auto;/su,
    'architectural SVGs preserve their viewBox proportions');
  for (const region of ['aso', 'bromo', 'calbuco', 'dempo', 'ebeko', 'fogo', 'gallego']) {
    assert.match(visualContractCss,
      new RegExp(`\\.city-landmark-page\\.region-${region} \\.city-landmark-scene \\{`, 'u'),
      `${region} landmarks have a region-specific gallery palette`);
  }
  assert.match(visualContractCss,
    /@media \(forced-colors: active\) \{[^}]*\.city-landmark-scene \{/su,
    'landmark line art remains legible in forced-colours mode');
  assert.match(visualContractCss, /@media \(prefers-reduced-motion: reduce\)/u);
  assert.match(visualContractCss, /button\.link \{[^}]*border:\s*0[^}]*box-shadow:\s*none/su);
  assert.match(visualContractCss, /--rarity-link-color:/u);
  assert.match(visualContractCss,
    /grid-template-areas: "screen controls" "result controls"/u,
    'casino controls stay pinned to the right of both the reels and result');
  assert.match(visualContractCss,
    /\.casino-controls \{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/su,
    'casino bet sits beneath the stake currency selector');
  assert.equal(
    (visualContractCss.match(/\.casino-controls \{[^}]*grid-template-columns:/gu) ?? []).length,
    1,
    'responsive rules must preserve the vertical casino control stack'
  );
  assert.match(visualContractCss, /text-underline-offset: \.2em/u);
  const wisdomDetail = await fetch(`${base}/items/${WISDOM_CATALOG.items[0].id}`);
  assert.equal(wisdomDetail.status, 200);
  const wisdomDetailHtml = await wisdomDetail.text();
  assert.match(wisdomDetailHtml,
    /Let quiet drills turn<br>Charged hours gather small things<br>Return with full hands/u);
  const electronicsDetail = await fetch(`${base}/items/${ELECTRONICS_CATALOG.items[0].id}`);
  assert.equal(electronicsDetail.status, 200);
  assert.match(await electronicsDetail.text(), /one day become gadgets/u);
  assert.equal((await fetch(`${base}/portal/img/colors.jpg`)).status, 404);
  assert.equal((await fetch(`${base}/app/webroot/index.php`)).status, 404);
  const cachedAsset = await fetch(`${base}/node/favicon.svg`);
  assert.ok(cachedAsset.headers.get('etag'));
  const notModified = await fetch(`${base}/node/favicon.svg`, {
    headers: { 'if-none-match': cachedAsset.headers.get('etag') }
  });
  assert.equal(notModified.status, 304);
  assert.equal(notModified.headers.get('cache-control'),
    'public, max-age=604800, stale-while-revalidate=86400');
  const headImage = await fetch(`${base}/node/favicon.svg`, { method: 'HEAD' });
  assert.equal(headImage.status, 200);
  assert.ok(Number(headImage.headers.get('content-length')) > 0);
  assert.equal(await headImage.text(), '');

  const registrationPage = await fetch(base);
  const registrationHtml = await registrationPage.text();
  assert.equal(registrationPage.status, 200);
  assert.match(registrationPage.headers.get('content-type'), /^text\/html/u);
  assert.match(registrationHtml, /<body class="landing-body">/u);
  assert.match(registrationHtml, /href="\/app\.css\?v=[0-9a-f]{12}"/u);
  assert.doesNotMatch(registrationHtml, /href="\/app\.css\?v=20260824a"/u);
  assert.match(registrationHtml, /class="rebirth-landing"/u);
  assert.match(registrationHtml, /id="landing-title"[^>]*>.*From the ashes/su);
  assert.match(registrationHtml, /MineThings <em>2<\/em>/u);
  assert.match(registrationHtml,
    /class="landing-map-frame"><img src="\/node\/maps\/aso\.png" alt="Map of Aso showing its five connected cities">/u);
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

  const legacyHelp = await fetch(`${base}/help`, { redirect: 'manual' });
  assert.equal(legacyHelp.status, 303);
  assert.equal(legacyHelp.headers.get('location'), '/guide');
  const publicGuide = await fetch(`${base}/guide`);
  assert.equal(publicGuide.status, 200);
  const publicGuideHtml = await publicGuide.text();
  assert.match(publicGuideHtml, /<h1>Field guide<\/h1>/u);
  assert.match(publicGuideHtml, /You do not get help\./u);
  assert.match(publicGuideHtml, /<h2 id="guide-systems-heading">Operations handbook<\/h2>/u);
  assert.match(publicGuideHtml, /<span>Systems<\/span><strong>12<\/strong>/u);
  for (const system of [
    ['home-cities', 'Home cities'], ['city-interiors', 'City interiors'],
    ['city-bars', 'City bars'],
    ['casino-circuit', 'Casino circuit'],
    ['factories', 'Factories'], ['mills', 'Mills'], ['oil-field', 'Oil Field'],
    ['ore-thief-operations', 'Ore-thief operations'],
    ['manufactured-transports', 'Oil Tanker and Train Carriage'],
    ['transport-orders', 'Peaceful, Patrol, and Pillage'],
    ['shuttles', 'Automatic shuttles'],
    ['world-threats', 'Living threats and restless dead']
  ]) {
    assert.match(publicGuideHtml,
      new RegExp(`id="guide-${system[0]}"[\\s\\S]*?<h3>${system[1]}<\\/h3>`, 'u'));
  }
  assert.match(publicGuideHtml, /100 Oil barrels only; 40 km\/h at sea; 750 hull/u);
  assert.match(publicGuideHtml, /200 loaded things at 200 km\/h/u);
  assert.match(publicGuideHtml, /gateway rails between regional capitals/u);
  assert.match(publicGuideHtml, /a faster Peaceful craft eludes a lone living aggressor/u);
  assert.match(publicGuideHtml, /Guard and Bounty Hunter specialisations/u);
  assert.match(publicGuideHtml, /Keep free capacity for stolen cargo and fittings/u);
  assert.match(publicGuideHtml, /chain shot attacks speed, and grape shot attacks crew/u);
  assert.match(publicGuideHtml, /Every region receives its own creature roll every 1m to 10m/u);
  assert.match(publicGuideHtml, /Kraken.*Land Whale.*White Whale.*Orca Pod.*Elephant Herd.*T-Rex/su);
  assert.match(publicGuideHtml,
    /Destroyed road vehicles and sunken ships remain as route wrecks/u);
  assert.match(publicGuideHtml, /<strong>1,555 things<\/strong>/u);
  const expectedGuideCategories = 18 + catalog.mineTypes.length;
  assert.match(publicGuideHtml,
    new RegExp(`<span>Categories<\\/span><strong>${expectedGuideCategories}<\\/strong>`, 'u'));
  assert.match(publicGuideHtml, /<span>Coverage<\/span><strong>Every thing<\/strong>/u);
  assert.match(publicGuideHtml, /<strong>How to read this guide\.<\/strong>/u);
  assert.match(publicGuideHtml, /game created by Japhet Stevens.*restored and maintained by Serif/su);
  assert.doesNotMatch(publicGuideHtml, /Jahet\s+Stevens/u);
  assert.match(publicGuideHtml, /stable catalogue identities/u);
  assert.equal((publicGuideHtml.match(/class="glossary-entry"/gu) ?? []).length,
    expectedGuideCategories);
  assert.equal((publicGuideHtml.match(/<dt>Useful for<\/dt>/gu) ?? []).length,
    expectedGuideCategories);
  for (const mineType of catalog.mineTypes) {
    assert.match(publicGuideHtml, new RegExp(`id="mine-category-${mineType.id}"`, 'u'),
      `${mineType.name} needs a Field guide mine entry`);
  }
  assert.match(publicGuideHtml, /<h3>Aircraft<\/h3>/u);
  assert.match(publicGuideHtml, /<h3>Collectible<\/h3>/u);
  assert.match(publicGuideHtml, /<h3>Oil Field machine<\/h3>/u);
  assert.match(publicGuideHtml, /<h3>Shrooms mine<\/h3>/u);
  assert.match(publicGuideHtml, /Bromo-only fungi/u);
  assert.match(publicGuideHtml, /<h3>Wood mine<\/h3>/u);
  assert.match(publicGuideHtml, /Calbuco-only timber/u);
  assert.match(publicGuideHtml, /<h3>Wisdom mine<\/h3>/u);
  assert.match(publicGuideHtml, /Dempo-only tactical haiku/u);
  assert.match(publicGuideHtml, /<h3>Electronic Devices mine<\/h3>/u);
  assert.match(publicGuideHtml, /Ebeko-only components/u);
  assert.match(publicGuideHtml, /<h3>Relics mine<\/h3>/u);
  assert.match(publicGuideHtml, /Fogo-only remains/u);
  assert.match(publicGuideHtml, /curse remain unverified/u);
  assert.doesNotMatch(publicGuideHtml, /their direct gameplay effects/u,
    'every current mine category should have a purpose written for it');
  assert.doesNotMatch(publicGuideHtml, /class="glossary-browse"/u);

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
  assert.match(dashboardHtml, /discovered regions currently support 3 active mines/);
  assert.match(dashboardHtml, /<body class="game-body authenticated-body">/u);
  assert.match(dashboardHtml, /id="logo" class="site-wordmark"/u);
  assert.match(dashboardHtml, /<strong>Mine Things<\/strong><small>The world digs back<\/small>/u);
  assert.match(dashboardHtml, /<li class="home"><a class="text-link" href="\/" aria-current="page"><span aria-hidden="true">01<\/span>Mines<\/a>/u);
  assert.match(dashboardHtml, /href="\/" aria-current="page">Mines \(\d+\)<\/a>/u);
  assert.match(dashboardHtml, /id="player-nav-toggle"[^>]*aria-controls="player-nav-panel"/u);
  assert.doesNotMatch(dashboardHtml, /class="player-location"/u);
  assert.match(dashboardHtml, /class="sidebar-location-heading">You are here:<\/p>/u);
  assert.match(dashboardHtml, /class="sidebar-location-value"><span>Region<\/span> <a class="text-link" href="\/map\?world=aso">Aso<\/a>/u);
  assert.match(dashboardHtml, /class="sidebar-location-value"><span>City<\/span> <a class="text-link" href="\/map\?world=aso#city-6"><span class="capital-city-icon"[^>]*>★<\/span>Cinderwake<\/a>/u);
  assert.equal((dashboardHtml.match(/class="sidebar-location-value sidebar-weather"/gu) ?? []).length, 1);
  assert.match(dashboardHtml, /class="sidebar-location-value sidebar-weather"><span>Weather<\/span> <a class="text-link" href="\/events" aria-label="Weather: (?:Clear|Cloudy|Rain|Storm|Snow|Hurricane)"><span class="sidebar-weather-icon" aria-hidden="true">(?:&#9728;|&#9729;|&#127783;|&#9928;|&#10052;|&#127744;)<\/span><span>(?:Clear|Cloudy|Rain|Storm|Snow|Hurricane)<\/span><\/a><\/div>/u);
  assert.match(dashboardHtml, /class="side-nav-group"><h2>Extraction<\/h2>/u);
  assert.match(dashboardHtml, /class="side-nav-group"><h2>World<\/h2>/u);
  assert.match(dashboardHtml, /href="\/inventory">Things \(\d+\)<\/a>/u);
  assert.match(dashboardHtml, /href="\/dwarves">Dwarves \(\d+\)<\/a>/u);
  assert.match(dashboardHtml, /href="\/gadgets">Gadgets \(\d+\)<\/a>/u);
  assert.match(dashboardHtml, /href="\/melds">Melds \(\d+\)<\/a>/u);
  assert.match(dashboardHtml, /href="\/vehicles">Fleet \(1\)<\/a>/u);
  assert.match(dashboardHtml, /href="\/factories">Factories \(0\)<\/a>/u);
  assert.match(dashboardHtml, /href="\/mills">Mills \(0\)<\/a>/u);
  assert.match(dashboardHtml, /href="\/oil-field">Oil Field \(1\)<\/a>/u);
  assert.match(dashboardHtml, /href="\/casino">Casino<\/a>/u);
  assert.match(dashboardHtml, /class="site-footer"/u);
  assert.match(dashboardHtml, /\/node\/navigation\.js/u);
  assert.match(dashboardHtml, /href="\/node\/favicon\.svg" type="image\/svg\+xml"/u);
  assert.doesNotMatch(dashboardHtml, /styles10\.css|button_logout\.jpg|home_h\.gif|id="preloader"|image-button/u);
  assert.match(dashboardHtml, /class="skip-link" href="#content"/);
  assert.match(dashboardHtml, /equipment\/src\/Bot\.png/);
  assert.match(dashboardHtml, /top mine in every regional home city/u);

  const authenticatedGuide = await fetch(`${base}/guide`, { headers: { cookie } });
  assert.equal(authenticatedGuide.status, 200);
  const authenticatedGuideHtml = await authenticatedGuide.text();
  assert.match(authenticatedGuideHtml, /href="\/guide" aria-current="page">Field guide<\/a>/u);
  assert.equal((authenticatedGuideHtml.match(/class="glossary-browse"/gu) ?? []).length, 18);
  assert.match(authenticatedGuideHtml, /href="\/exchange\?type=aircraft"/u);
  assert.match(authenticatedGuideHtml, /href="\/items\/\d+">/u);
  for (const href of ['/map', '/explore', '/factories', '/mills', '/oil-field', '/vehicles', '/events']) {
    assert.match(authenticatedGuideHtml,
      new RegExp(`class="text-link guide-system-link" href="${href}"`, 'u'));
  }

  const navigationClient = await (await fetch(`${base}/node/navigation.js`)).text();
  assert.match(navigationClient, /matchMedia\('\(max-width: 820px\)'\)/u);
  assert.match(navigationClient, /aria-expanded/u);
  assert.match(navigationClient, /event\.key !== 'Escape'/u);
  assert.match(navigationClient, /minethings:content-updated/u);

  const messagesClient = await (await fetch(`${base}/node/messages.js`)).text();
  assert.match(messagesClient, /\.indeterminate =/u);
  assert.match(messagesClient, /minethings:content-updated/u);

  const inventory = await fetch(`${base}/inventory`, { headers: { cookie } });
  assert.equal(inventory.status, 200);
  const inventoryHtml = await inventory.text();
  assert.match(inventoryHtml, /5 owned/);
  assert.match(inventoryHtml, /class="item-card-link thing-link rarity-[0-6]"/u);
  assert.match(inventoryHtml,
    /href="\/inventory" aria-current="page">Things \(\d+\)<\/a>/u);
  assert.equal((inventoryHtml.match(/class="sidebar-location-value sidebar-weather"/gu) ?? []).length, 1,
    'current weather remains in the shared location panel on every game page');

  const cryptoExchange = await fetch(`${base}/crypto`, { headers: { cookie } });
  assert.equal(cryptoExchange.status, 200);
  const cryptoHtml = await cryptoExchange.text();
  assert.match(cryptoHtml, /Aso Coin/u);
  assert.match(cryptoHtml, /Read the charts, set your price, and trade when the market moves your way\./u);
  assert.match(cryptoHtml, /Keep exploring\. The exchange grows with your journey\./u);
  assert.doesNotMatch(cryptoHtml,
    /Reach later worlds|Bromo Byte|Calbuco Cash|Dempo Digital|Ebeko Ether|Fogo Fund|Gallego Goldchain/u);
  assert.doesNotMatch(cryptoHtml, />BRO<|>CAL<|>DEM<|>EBE<|>FOG<|>GAL</u);

  const casino = await fetch(`${base}/casino`, { headers: { cookie } });
  assert.equal(casino.status, 200);
  const casinoHtml = await casino.text();
  assert.match(casinoHtml, /The Quiet Shift Casino/u);
  assert.match(casinoHtml, /THE THING-O-MATIC/u);
  assert.equal((casinoHtml.match(/data-casino-cell="\d"/gu) ?? []).length, 9);
  assert.equal((casinoHtml.match(/data-casino-bonus="[a-z-]+"/gu) ?? []).length, 3);
  assert.equal((casinoHtml.match(/class="casino-paylines"/gu) ?? []).length, 1);
  assert.match(casinoHtml, /Shift Bell/u);
  assert.match(casinoHtml, /Twin Drill/u);
  assert.match(casinoHtml, /Golden Fuse/u);
  assert.match(casinoHtml, /up to 8 free respins/u);
  assert.match(casinoHtml, /Lines, explosive matches, and scatters/u);
  assert.match(casinoHtml,
    /Three or four copies of the same explosive anywhere on the reels also pay a flat 1&times; award/u);
  assert.match(casinoHtml,
    /<strong>3 matching<\/strong><span>Flat 1&times; payout<\/span>/u);
  assert.doesNotMatch(casinoHtml,
    /<strong>2 matching<\/strong><span>Flat 1&times; payout<\/span>/u);
  assert.match(casinoHtml, /Five or more pay a rarity-scaled scatter award/u);
  assert.match(casinoHtml, /<small>3 on a line<\/small>/u);
  assert.match(casinoHtml, /Nine BLU-82s/u);
  assert.match(casinoHtml, /1 in 100,000/u);
  assert.match(casinoHtml, /value="gold"/u);
  assert.match(casinoHtml, /value="crypto:1"/u);
  assert.match(casinoHtml, /including 100 voucher/u);
  assert.match(casinoHtml, /src="\/node\/casino\.js\?v=/u);
  assert.match(casinoHtml, /href="\/casino" aria-current="page">Casino<\/a>/u);
  assert.ok(casinoHtml.indexOf('class="casino-screen-frame"')
    < casinoHtml.indexOf('class="casino-controls"'));
  assert.ok(casinoHtml.indexOf('class="casino-controls"')
    < casinoHtml.indexOf('class="casino-ready"'),
  'controls remain before the explanation when the cabinet stacks on narrow screens');
  const casinoClient = await (await fetch(`${base}/node/casino.js`)).text();
  assert.match(casinoClient, /replayFrames\.length > 1/u);
  assert.match(casinoClient, /Bonus spin \$\{index\} of \$\{replayFrames\.length - 1\}/u);
  assert.match(casinoClient, /pull\.disabled = replaying \|\|/u);
  assert.match(casinoClient, /querySelectorAll\('\[data-casino-reveal\]'\)/u);
  assert.match(casinoClient, /frameHoldMs\(frame\)/u);
  assert.match(casinoClient, /MAXIMUM_FRAME_HOLD_MS = 5000/u,
    'server-provided replay timing is bounded in the browser');

  const pull = await fetch(`${base}/casino/spin`, {
    method: 'POST', redirect: 'manual', headers: {
      cookie, 'content-type': 'application/x-www-form-urlencoded', referer: `${base}/casino`
    }, body: new URLSearchParams({ currency: 'gold', wager: '1' })
  });
  assert.equal(pull.status, 303);
  assert.match(pull.headers.get('location'), /^\/casino\?spin=\d+$/u);
  const casinoResult = await fetch(`${base}${pull.headers.get('location')}`, {
    headers: { cookie }
  });
  const casinoResultHtml = await casinoResult.text();
  assert.equal(casinoResult.status, 200);
  assert.match(casinoResultHtml, /9 winning awards/u);
  assert.match(casinoResultHtml, /39&times; payout/u);
  assert.match(casinoResultHtml, /<details class="casino-result-details"><summary>View 9 award details/u);
  assert.match(casinoResultHtml, /9 matching explosives/u);
  assert.equal((casinoResultHtml.match(/data-winning="true"/gu) ?? []).length, 9);
  assert.match(casinoResultHtml, /M-80/u);
  assert.match(casinoResultHtml, /<option value="gold" selected/u);
  assert.match(casinoResultHtml, /id="casino-wager"[^>]*value="1"/u);

  const cryptoPull = await fetch(`${base}/casino/spin`, {
    method: 'POST', redirect: 'manual', headers: {
      cookie, 'content-type': 'application/x-www-form-urlencoded', referer: `${base}/casino`
    }, body: new URLSearchParams({ currency: 'crypto:1', wager: '2' })
  });
  assert.equal(cryptoPull.status, 303);
  const rememberedCasino = await fetch(`${base}${cryptoPull.headers.get('location')}`, {
    headers: { cookie }
  });
  const rememberedCasinoHtml = await rememberedCasino.text();
  assert.match(rememberedCasinoHtml, /<option value="crypto:1" selected/u);
  assert.match(rememberedCasinoHtml, /id="casino-wager"[^>]*value="2"/u);

  const loadout = await fetch(`${base}/mines/1/equipment`, { headers: { cookie } });
  assert.equal(loadout.status, 200);
  const loadoutHtml = await loadout.text();
  assert.match(loadoutHtml, /Equip your miner/);
  assert.match(loadoutHtml,
    /href="\/mines\/1\/equipment" aria-current="page">Equip your miner<\/a>/);
  assert.match(loadoutHtml, /href="\/mines\/1\/explosives">Mine with explosives<\/a>/);
  assert.match(loadoutHtml, /equipment\/src\/NoBoots\.png/);
  assert.match(loadoutHtml, /Miner robots in this city/);
  assert.doesNotMatch(loadoutHtml, /detonator-grid|Detonate explosives/);
  const explosivesPage = await fetch(`${base}/mines/1/explosives`, { headers: { cookie } });
  assert.equal(explosivesPage.status, 200);
  const explosivesHtml = await explosivesPage.text();
  assert.match(explosivesHtml, /Mine with explosives/);
  assert.match(explosivesHtml,
    /href="\/mines\/1\/explosives" aria-current="page">Mine with explosives<\/a>/);
  assert.match(explosivesHtml, /href="\/mines\/1\/equipment">Equip your miner<\/a>/);
  assert.match(explosivesHtml, /item-card-compact item-card-unavailable/);
  assert.match(explosivesHtml, /href="\/items\/282"/);
  assert.doesNotMatch(explosivesHtml, /Miner robots in this city|Equipment in this city/);

  const gadgets = await fetch(`${base}/gadgets`, { headers: { cookie } });
  assert.equal(gadgets.status, 200);
  const gadgetsHtml = await gadgets.text();
  assert.match(gadgetsHtml, /Boosts equipment by 25%/);
  assert.match(gadgetsHtml,
    /<p class="gadget-description">Vehicles: Adds 10% to weapon offensive power\.\nShips: Each shot has \+10% chance of doing double damage\.\nAircraft: 40% higher bomb damage\.\nGadget must be active before sending\.<\/p>/u);
  assert.doesNotMatch(gadgetsHtml, /&lt;br\s*\/?&gt;/iu);

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
  assert.match(professionsHtml, /of 216 public Melds/);
  assert.match(professionsHtml, /Meldwright/);

  const worldEvents = await fetch(`${base}/events`, { headers: { cookie } });
  assert.equal(worldEvents.status, 200);
  const worldEventsHtml = await worldEvents.text();
  assert.match(worldEventsHtml, /World Events/);
  assert.match(worldEventsHtml, /Lunar influence/);
  assert.doesNotMatch(worldEventsHtml, /Cambridge 1991-2020 baseline|metoffice\.gov\.uk/);
  assert.match(worldEventsHtml, /Route threats/);
  assert.match(worldEventsHtml, /Read the sky before you send anything beyond the city/);
  assert.doesNotMatch(worldEventsHtml, /Changes in \d/);
  assert.doesNotMatch(worldEventsHtml,
    /Snow blocks departures|Hurricanes damage travelling land vehicles and ships/);

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
  assert.match(oilFieldHtml, /id="oil-board-navigation" class="oil-board-navigation"/);
  assert.match(oilFieldHtml, /id="oil-center-board" class="secondary" aria-controls="board">Centre field/);
  assert.match(oilFieldHtml, /aria-describedby="oil-board-help"/);
  assert.match(oilFieldHtml, /id="oil-toggle-renderer"/);
  assert.match(oilFieldHtml, /\/node\/svgjs\.min\.js\?v=3\.2\.7/);
  assert.match(oilFieldHtml, /\/node\/oil-field-renderers\.js/);
  assert.match(oilFieldHtml, /\/js\/machines11\.js/);
  assert.match(oilFieldHtml, /\/node\/oil-field\.js/);
  assert.doesNotMatch(oilFieldHtml, /Machine parts in the Oil Field city/);
  assert.doesNotMatch(oilFieldHtml, /Keyboard and form controls/);
  assert.doesNotMatch(oilFieldHtml, /Deployed machines/);
  assert.match(oilFieldHtml, /Live Scout/);
  assert.match(oilFieldHtml, /Live Striker/);
  assert.match(oilFieldHtml, /Live Lifter/);
  assert.match(oilFieldHtml, /barrel of Live Crude/);
  for (const packer of catalog.machines.filter((machine) => machine.rules.canPack)) {
    assert.match(oilFieldHtml, new RegExp(catalog.byId.get(packer.itemId).name));
  }
  const playerRegionDatabase = new DatabaseSync(databaseFile);
  let originalPlayerCityId;
  try {
    originalPlayerCityId = playerRegionDatabase.prepare(
      "SELECT city_id FROM players WHERE name = 'Ada'"
    ).get().city_id;
    playerRegionDatabase.prepare(`
      UPDATE players SET city_id = (SELECT id FROM catalog_cities WHERE name = 'Ashfall')
      WHERE name = 'Ada'
    `).run();
  } finally {
    playerRegionDatabase.close();
  }
  const unavailableOilFieldHtml = await (await fetch(
    `${base}/oil-field`, { headers: { cookie } }
  )).text();
  assert.match(unavailableOilFieldHtml, /No Oil Field in Bromo/);
  assert.doesNotMatch(unavailableOilFieldHtml, /class="oil-field-board-shell"/);
  const restorePlayerRegionDatabase = new DatabaseSync(databaseFile);
  try {
    restorePlayerRegionDatabase.prepare(
      "UPDATE players SET city_id = ? WHERE name = 'Ada'"
    ).run(originalPlayerCityId);
  } finally {
    restorePlayerRegionDatabase.close();
  }
  const oilFieldClient = await fetch(`${base}/node/oil-field.js`);
  const oilFieldClientText = await oilFieldClient.text();
  assert.match(oilFieldClientText, /the barrels will remain here and can then be claimed/);
  assert.match(oilFieldClientText, /Field centred on hex \(0,0\)/);
  const rendererClient = await fetch(`${base}/node/oil-field-renderers.js`);
  assert.equal(rendererClient.status, 200);
  assert.match(await rendererClient.text(), /SvgJsRenderer/);
  const svgJsClient = await fetch(`${base}/node/svgjs.min.js`);
  assert.equal(svgJsClient.status, 200);
  assert.match(await svgJsClient.text(), /@svgdotjs\/svg\.js v3\.2\.7/);
  const vacuum = catalog.machines.find((machine) => machine.type === 'vacuum');
  const vacuumItem = await fetch(`${base}/items/${vacuum.itemId}`, { headers: { cookie } });
  const vacuumHtml = await vacuumItem.text();
  assert.match(vacuumHtml, /class="detail-image[^"]*" src="\/node\/machine-icons\/vacuum-[0-6]\.svg"/);
  assert.doesNotMatch(vacuumHtml, /class="detail-icon"/);
  assert.doesNotMatch(vacuumHtml, /class="detail-frame"|src="\/img\/border\.png"/);
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
  assert.match(chatHtml, /class="chat-page"/);
  assert.match(chatHtml, /class="page-title"[^>]*><div><p class="eyebrow">Discovered regions/);
  assert.doesNotMatch(chatHtml, /chat-page-title|chat-title-mark/);
  assert.match(chatHtml, /id="chat-live-status" class="chat-live-status"/);
  assert.match(chatHtml, /class="chat-workspace"/);
  assert.match(chatHtml, /class="chat-console" aria-labelledby="chat-console-title"/);
  assert.match(chatHtml, /id="chat-compose-form" class="chat-compose"/);
  assert.match(chatHtml, /id="chat-log" class="chat-list" role="log"/);
  assert.match(chatHtml, /id="chat-filters" class="chat-filter-card" data-chat-filters/);
  assert.equal(chatHtml.match(/<input[^>]+data-chat-rating-tier/g)?.length, 6);
  assert.match(chatHtml, /Rating tiers/);
  assert.match(chatHtml, /No selection shows every tier/);
  assert.match(chatHtml, /data-chat-hide-world-events/);
  assert.match(chatHtml, /Hide world events/);
  assert.match(chatHtml, /data-chat-hidden-region/);
  assert.match(chatHtml, /Hide regions/);
  assert.match(chatHtml, /src="\/node\/chat-filters\.js/);
  assert.match(chatHtml, /class="chat-row chat-row-player" style="--chat-color:#abcdef"/);
  assert.match(chatHtml, /data-chat-row data-chat-kind="player" data-chat-map-ids="\d+"/);
  assert.match(chatHtml, /class="chat-speaker"/);
  assert.match(chatHtml, /class="chat-message"/);
  assert.match(chatHtml, /<time datetime="1970-01-01T00:00:01\.000Z"/);
  assert.match(chatHtml, /class="chat-row chat-row-world"/);
  assert.match(chatHtml, /Kraken sighted near Kemet\./);
  assert.match(chatHtml, /class="chat-identity chat-world-identity"/);
  assert.match(chatHtml, /class="chat-world-kind">Worldwire<\/span>/);
  assert.match(chatHtml,
    /class="chat-world-message" href="\/events">Kraken sighted near Kemet\.<\/a>/);
  assert.doesNotMatch(chatHtml, /chat-world-badge|chat-world-link/u);
  assert.doesNotMatch(chatHtml, /chat-row-rare|chat-rare-item/);
  assert.doesNotMatch(chatHtml, /Ada found a Legendary thing\./);
  assert.match(chatHtml, /class="chat-row chat-row-world chat-row-dwarf rarity-1"/);
  assert.match(chatHtml, /class="chat-world-kind">Dwarf found<\/span>/);
  assert.match(chatHtml, new RegExp(
    `class="chat-world-message chat-dwarf-item rarity-1" href="/items/${yellowDwarf.id}"`
  ));
  assert.ok(chatHtml.includes(`src="${yellowDwarf.icon}"`));
  assert.match(chatHtml, /Ada captured a Yellow Dwarf while mining/);
  const renderedWorldRows = [...chatHtml.matchAll(
    /<article id="chat-entry-world-\d+"[\s\S]*?<\/article>/gu
  )].map((match) => match[0]);
  const krakenRow = renderedWorldRows.find((row) => row.includes('Kraken sighted near Kemet.'));
  const dwarfRow = renderedWorldRows.find((row) => row.includes('Ada captured a Yellow Dwarf'));
  assert.ok(krakenRow && dwarfRow);
  assert.equal([...krakenRow.matchAll(/<a\b/gu)].length, 1,
    'a world announcement should expose one details link');
  assert.equal([...dwarfRow.matchAll(/<a\b/gu)].length, 1,
    'a Dwarf announcement should expose one item link');
  assert.doesNotMatch(chatHtml, /This announcement is more than a day old/);
  assert.doesNotMatch(chatHtml, /chat-color-abcdef/);
  const chatFiltersClient = await fetch(`${base}/node/chat-filters.js`);
  assert.equal(chatFiltersClient.status, 200);
  const chatFiltersSource = await chatFiltersClient.text();
  assert.match(chatFiltersSource, /ratingTiers\.size > 0/);
  assert.match(chatFiltersSource, /data-chat-hide-world-events/);
  assert.match(chatFiltersSource, /data-chat-hidden-region/);

  const moderationDatabase = new DatabaseSync(databaseFile);
  moderationDatabase.prepare("UPDATE players SET chat_banned = 1 WHERE name = 'Ada'").run();
  moderationDatabase.close();
  const bannedChat = await fetch(`${base}/chat`, { headers: { cookie } });
  const bannedChatHtml = await bannedChat.text();
  assert.match(bannedChatHtml, /class="chat-compose chat-compose-locked"/);
  assert.match(bannedChatHtml, /Your account is not permitted to use public chat/);
  assert.doesNotMatch(bannedChatHtml, /id="chat-compose-form"/);
  const restoreChatDatabase = new DatabaseSync(databaseFile);
  restoreChatDatabase.prepare("UPDATE players SET chat_banned = 0 WHERE name = 'Ada'").run();
  restoreChatDatabase.close();

  const banks = await fetch(`${base}/banks`, { headers: { cookie } });
  assert.equal(banks.status, 410);
  assert.match(await banks.text(), /Banking has been removed/);

  const creditShop = await fetch(`${base}/market`, { headers: { cookie } });
  const creditShopHtml = await creditShop.text();
  assert.match(creditShopHtml, /Buy with Crypto/);
  assert.doesNotMatch(creditShopHtml, />Gold market<\/a>/u);
  assert.match(creditShopHtml, /Buy a new mine in Cinderwake/);
  const creditShopMineIcons = [...creditShopHtml.matchAll(
    /<article class="shop-card"><img src="([^"]+)" alt="">/gu
  )].map((match) => match[1]);
  assert.deepEqual(creditShopMineIcons.toSorted(), [
    '/live-database-mine-icon.svg',
    '/node/mines/mine-4.svg',
    '/node/mines/mine-5.svg'
  ].toSorted(), 'every Cinderwake mine shop card uses its current catalog artwork');
  for (const icon of creditShopMineIcons) {
    assert.doesNotMatch(icon, /^\/legacy\/img\/icons\/M\d+L\d+\.(?:gif|png)$/u,
      `mine shop card still uses legacy artwork: ${icon}`);
  }
  assert.match(creditShopHtml, /src="\/live-database-mine-icon\.svg"/);
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
  assert.match(mineMarketHtml, /Buy or sell an entire mine for one cryptocurrency/);
  assert.match(mineMarketHtml, /worth at least 10000g per mine/);
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
  assert.doesNotMatch(profileHtml, /Send gold|gold-gift/);

  const account = await fetch(`${base}/account`, { headers: { cookie } });
  assert.equal(account.status, 200);
  const accountHtml = await account.text();
  assert.match(accountHtml, /Change password/);
  assert.doesNotMatch(accountHtml, /publishFindings|Announce my Purple and Orange finds/);
  const accountUpdate = await fetch(`${base}/account/privacy`, {
    method: 'POST', redirect: 'manual', headers: {
      cookie, 'content-type': 'application/x-www-form-urlencoded'
    }, body: new URLSearchParams({ showMines: 'on' })
  });
  assert.equal(accountUpdate.status, 303);
  const privateProfile = await fetch(`${base}/miners/Ada`, { headers: { cookie } });
  const privateProfileHtml = await privateProfile.text();
  assert.doesNotMatch(privateProfileHtml, /controls chat announcements|announce Purple and Orange finds/);
  assert.match(privateProfileHtml, /matching things/);
  assert.match(privateProfileHtml, /Green Dwarf/);

  const itemInventory = await fetch(`${base}/inventory`, { headers: { cookie } });
  await itemInventory.text();
  const itemId = catalog.items.find((item) => item.canFind
    && !catalog.factoryOutputItemIds.has(item.id)).id;
  const recycleSettings = await fetch(`${base}/items/${itemId}`, { headers: { cookie } });
  const recycleSettingsHtml = await recycleSettings.text();
  assert.match(recycleSettingsHtml, /Auto-recycle/);
  assert.match(recycleSettingsHtml, /Your stored inventory/);
  assert.match(recycleSettingsHtml, /<dt>Stored total<\/dt>/);
  assert.match(recycleSettingsHtml, /<dt>Stored in Cinderwake/);
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
  const graceProfile = await (await fetch(`${base}/miners/Grace`, {
    headers: { cookie }
  })).text();
  assert.match(graceProfile, /Send message/);
  assert.doesNotMatch(graceProfile, /Send gold|gold-gift/);
  const goldUnitsFor = (name) => {
    const database = new DatabaseSync(databaseFile, { readOnly: true });
    try {
      return database.prepare('SELECT gold_units FROM players WHERE name = ?').get(name).gold_units;
    } finally {
      database.close();
    }
  };
  const adaGoldBefore = goldUnitsFor('Ada');
  const graceGoldBefore = goldUnitsFor('Grace');
  const retiredGoldGift = await fetch(`${base}/miners/Grace/gold-gift`, {
    method: 'POST', redirect: 'manual', headers: {
      cookie, 'content-type': 'application/x-www-form-urlencoded'
    }, body: new URLSearchParams({ amount: '1', note: 'must stay put' })
  });
  assert.equal(retiredGoldGift.status, 410);
  assert.match(await retiredGoldGift.text(), /Gold transfers are disabled/);
  assert.equal(goldUnitsFor('Ada'), adaGoldBefore);
  assert.equal(goldUnitsFor('Grace'), graceGoldBefore);
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
  const ratingsHtml = await ratings.text();
  assert.match(ratingsHtml, /Live combat ranks/);
  assert.match(ratingsHtml, /href="\/ratings\/prizes"/);
  assert.match(ratingsHtml, /participates automatically from its live rating/);
  assert.match(ratingsHtml, /Every resolved vehicle or creature fight/);
  assert.doesNotMatch(ratingsHtml, /trial waves/i);
  const seasonPrizes = await fetch(`${base}/ratings/prizes`, { headers: { cookie } });
  assert.equal(seasonPrizes.status, 200);
  const seasonPrizesHtml = await seasonPrizes.text();
  assert.match(seasonPrizesHtml, /Season prizes/);
  assert.match(seasonPrizesHtml, /Fight upward/);
  assert.match(seasonPrizesHtml, /Champion/);
  assert.match(seasonPrizesHtml, /Chopper/);
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
  assert.equal([...mapHtml.matchAll(/class="[^"]*\bmap-mine-icon\b[^"]*"/g)].length,
    expectedCatalog.cityMineTypes.length);
  assert.equal([...mapHtml.matchAll(/<ul class="city-mines">/g)].length, expectedCatalog.cities.length);
  assert.match(mapHtml, /class="map-background"[^>]+href="\/node\/maps\/aso\.png"/);
  assert.match(mapHtml, /map-city-current/);
  assert.match(mapHtml, /<script src="\/node\/map\.js\?v=20260821a" defer><\/script>/);
  const mapScript = await fetch(`${base}/node/map.js`);
  assert.equal(mapScript.status, 200);
  const mapBackground = await fetch(`${base}/node/maps/aso.png`);
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
    [itemId(catalog.vehicles.find((entry) => entry.land)), ['Route type', 'Speed', 'Capacity', 'Base attack', 'Armor']],
    [itemId(catalog.vehicles.find((entry) => entry.ship)), ['Route type', 'Speed', 'Capacity', 'Cannon ports', 'Hull', 'Crew']],
    [itemId(catalog.vehicles.find((entry) => entry.aircraft)), ['Route type', 'Speed', 'Capacity', 'Aircraft role']],
    [itemId(catalog.weapons[0]), ['Aggressive power', 'Defensive power']],
    [itemId(catalog.mods[0]), ['Capacity modifier', 'Base attack modifier', 'Armor modifier', 'Aggressive power modifier', 'Defensive power modifier', 'Dodge modifier']],
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
  assert.match(damagedHtml,
    new RegExp(`<a class="thing-link rarity-${catalog.byId.get(equipment.itemId).rarity}" href="/items/${equipment.itemId}">`));

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
  const explosivesHtml = await page('/mines/1/explosives');
  const gadgetsHtml = await page('/gadgets');
  const vehiclesHtml = await page('/vehicles');
  const avatarHtml = await page('/avatar');
  for (const [label, html] of [['inventory', inventoryHtml], ['mine loadout', loadoutHtml],
    ['mine explosives', explosivesHtml],
    ['gadgets', gadgetsHtml], ['vehicles', vehiclesHtml], ['avatar', avatarHtml]]) {
    assertItemCardsClickable(html, label);
  }
  assert.doesNotMatch(loadoutHtml, /class="loadout-item"/);
  assert.doesNotMatch(loadoutHtml, /detonator-grid|name="count"/);
  assert.doesNotMatch(explosivesHtml, /\/equipment\/\d+\/(?:equip|unequip)|\/robots\//);
  assert.doesNotMatch(avatarHtml, /<select name="type_/);

  assertBefore(inventoryHtml, `data-item-id="${ordinaryRare.id}"`,
    `data-item-id="${ordinaryCommon.id}"`, 'inventory');
  marketSeller.inventory[ordinaryCommon.id] = 1;
  marketSeller.inventory[ordinaryRare.id] = 1;
  marketSeller.inventoryByCity[marketSeller.cityId] = marketSeller.inventory;
  store.savePlayer(marketSeller);
  store.placeSellOrder(marketSeller.id, ordinaryCommon.id,
    store.marketForItem(ordinaryCommon.id, marketSeller.cityId).listingStartPrice, 1, 2000);
  store.placeSellOrder(marketSeller.id, ordinaryRare.id,
    store.marketForItem(ordinaryRare.id, marketSeller.cityId).listingStartPrice, 1, 2001);
  const exchange = await page('/exchange');
  assertItemCardsClickable(exchange, 'exchange');
  const exchangeRarities = [...exchange.matchAll(/<article class="item rarity-(\d+)[^"]*"/g)]
    .map((match) => Number(match[1]));
  assert.ok(exchangeRarities.length > 1);
  assert.ok(exchangeRarities.every((rarity, index) => index === 0 || exchangeRarities[index - 1] >= rarity));
  assertBefore(loadoutHtml, `/equipment/${equipmentRare.itemId}/equip`,
    `/equipment/${equipmentCommon.itemId}/equip`, 'mine equipment');
  assertBefore(explosivesHtml, `value="${explosiveRare.itemId}"`,
    `value="${explosiveCommon.itemId}"`, 'explosives');
  const commonExplosiveCard = explosivesHtml.match(new RegExp(
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
  assert.match(vehiclesHtml, /class="item-grid stored-vehicle-grid"/,
    'stored vehicle things should use their dedicated responsive layout');
  assert.match(vehiclesHtml, /<form method="post" action="\/vehicles\/activate-all"><button[^>]*>Activate all \(\d+\)<\/button><\/form>/,
    'stored vehicle things should offer one city-scoped activate-all action');
  assertBefore(avatarHtml, `name="type_${avatarType.id}" value="${avatarRare.id}"`,
    `name="type_${avatarType.id}" value="${avatarCommon.id}"`, 'avatar items');
});

test('activates capital-local gadget stock only while the miner is in that capital', async (context) => {
  const store = new SqliteStore(':memory:');
  store.seedCatalog(loadLegacyCatalog());
  store.ensureWorldMaps(1000);
  const catalog = store.loadCatalog();
  const password = 'capital gadget password';
  const itemId = 265;
  const item = catalog.byId.get(itemId);
  const currentMap = catalog.maps.find((map) => map.slug === 'aso');
  const capital = catalog.cities.find((city) => city.id === currentMap.capitalCityId);
  const outpost = catalog.cities.find((city) =>
    city.mapId === currentMap.id && city.id !== capital.id);
  assert.ok(item && capital && outpost);
  const player = createPlayer('Regional Gadgeteer', '', hashPassword(password), catalog, 1000,
    () => 0.5);
  delete player.inventoryByCity[capital.id][itemId];
  player.knownCityIds = [capital.id, outpost.id];
  player.cityId = outpost.id;
  player.inventoryByCity[capital.id][itemId] = 1;
  player.inventoryByCity[outpost.id] = { [itemId]: 2 };
  player.inventory = player.inventoryByCity[outpost.id];
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

  const outpostHtml = await (await fetch(`${base}/gadgets`, { headers: { cookie } })).text();
  assert.match(outpostHtml, /effect applies globally/u);
  assert.match(outpostHtml, new RegExp(`href="/items/${item.id}"`));
  assert.match(outpostHtml, new RegExp(`1 in ${capital.name}[^0-9]+2 elsewhere`));
  assert.match(outpostHtml, new RegExp(
    `Travel to the regional capital, <strong>${capital.name}</strong>, to activate gadgets stored there`
  ));
  assert.match(outpostHtml, new RegExp(
    `action="/gadgets/${itemId}/activate"[\\s\\S]*?<button disabled>Activate one</button>`
  ));

  store.changeCity(saved.id, capital.id, 2100);
  const capitalHtml = await (await fetch(`${base}/gadgets`, { headers: { cookie } })).text();
  assert.match(capitalHtml, new RegExp(`1 in ${capital.name}[^0-9]+2 elsewhere`));
  assert.doesNotMatch(capitalHtml, /Travel to the regional capital/u);
  assert.match(capitalHtml, new RegExp(
    `action="/gadgets/${itemId}/activate"[\\s\\S]*?<button >Activate one</button>`
  ));

  const activation = await fetch(`${base}/gadgets/${itemId}/activate`, {
    method: 'POST', redirect: 'manual', headers: { cookie }
  });
  assert.equal(activation.status, 303);
  assert.equal(activation.headers.get('location'), '/gadgets');
  assert.equal(store.database.prepare(
    'SELECT quantity FROM inventory WHERE player_id = ? AND city_id = ? AND item_id = ?'
  ).get(saved.id, capital.id, itemId), undefined);
  assert.equal(store.database.prepare(
    'SELECT quantity FROM inventory WHERE player_id = ? AND city_id = ? AND item_id = ?'
  ).get(saved.id, outpost.id, itemId).quantity, 2);

  const after = await (await fetch(`${base}/gadgets`, { headers: { cookie } })).text();
  assert.match(after, /active globally for/u);
  assert.match(after, /<h2>Active globally \(1\)<\/h2>/u);
  assert.match(after, new RegExp(
    `The navigation count is 1 active plus 0 activator items stored in ${capital.name}`
  ));
  assert.ok(after.indexOf('<h2>Active globally (1)</h2>')
    < after.indexOf('<h2>Other gadgets</h2>'),
  'active gadgets must be presented before the rest of the gadget catalogue');
  assert.match(after, new RegExp(`href="/items/${item.id}"`));
  assert.match(after, new RegExp(`0 in ${capital.name}[^0-9]+2 elsewhere`));
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
  assert.equal(sellerConfiguration({}, {}).operatorName, 'Serif');
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
  const assertEditorialIndex = (html, label) => {
    const fragments = [...html.matchAll(/<a class="text-link" href="#([^"]+)">/gu)]
      .map((match) => match[1]);
    const sectionIds = [...html.matchAll(/<section id="([^"]+)"/gu)].map((match) => match[1]);
    assert.ok(fragments.length > 0, `${label} should expose an anchored section index`);
    assert.equal(new Set(fragments).size, fragments.length, `${label} index fragments must be unique`);
    assert.equal(new Set(sectionIds).size, sectionIds.length, `${label} section IDs must be unique`);
    for (const fragment of fragments) assert.ok(sectionIds.includes(fragment), `${label} is missing #${fragment}`);
  };
  assert.match(history, /<body class="game-body public-body">/u);
  assert.match(history, /class="node-wrapper game-shell public-shell"/u);
  assert.match(history, /class="site-wordmark"/u);
  assert.match(history, /class="editorial-switcher"[^>]*>.*href="\/history" aria-current="page"/su);
  assert.match(history, /class="page-title"[^>]*>.*MineThings archive .* Record 01/su);
  assert.doesNotMatch(history, /editorial-hero/u);
  assert.match(history, /class="editorial-facts" aria-label="History at a glance"/u);
  assert.match(history, /class="editorial-layout"/u);
  assert.match(history, /The story of MineThings/);
  assert.match(history, /players rebuilt the interface around themselves/u);
  assert.match(history, /On 11 June 2010, the first Lazy Newb Pack/u);
  assert.match(history, /Together with Dwarf Therapist's tabular labour interface, it provides a useful parallel/u);
  assert.match(history, /Bay 12's 2006 development log<\/a>.*8 August 2006 public Dwarf Fortress release/u);
  assert.match(history, /bay12games\.com\/dwarves\/dev_2006\.html/u);
  assert.match(history, /github\.com\/Dwarf-Therapist\/Manual/u);
  assert.match(history, /dwarffortresswiki\.org\/index\.php\/Utility:Lazy_Newb_Pack/u);
  assert.match(history, /href="#first-restoration">2019–2020 .* First revival<\/a>/u);
  assert.match(history, /<section id="first-restoration">/u);
  assert.match(history, /November 2019.*10 February 2020.*Serif's first restoration attempt fails/su);
  assert.match(history, /public record confirms the failed attempt and its date range but leaves the successor unnamed/u);
  assert.match(history, /Serif identifies himself as that successor/u);
  assert.match(history, /first-hand operator testimony, not independently established fact/u);
  assert.match(history, /4 January 2023.*20 February 2024.*Mini MineThings/su);
  assert.match(history, /On 20 February 2024, a Newgrounds commenter explicitly thanked its author for reviving the game/u);
  assert.match(history, /AI-assisted development/);
  assert.match(history, /href="#rebuilding">29–30 August 2026<\/a>/u);
  assert.match(history, /<section id="rebuilding">/u);
  assert.match(history, /href="#continuation">31 August–2 September 2026<\/a>/u);
  assert.match(history, /<section id="continuation">/u);
  assert.match(history, /31 August 2026.*2 September 2026.*Serif makes the restored world inhabitable/su);
  assert.match(history, /explorable city interiors/u);
  assert.match(history, /Oil Tanker carries up to 100 barrels/u);
  assert.match(history, /Wraith Riders or Ghost Ships may rise/u);
  assert.match(history, /permanently unique docket number/u);
  assert.match(history, /distinct casino cabinet for every region/u);
  assert.match(history, /<section id="sources" class="source-notes"><h2><time datetime="2026-09-02">2 September 2026<\/time>/u);
  assert.match(history, /<time datetime="2026-08-22">By 22 August 2026<\/time>: months of reconstruction/u);
  assert.match(history, /current Git record begins on 23 August with one large restoration snapshot/u);
  assert.match(history, /both preservation and continuation/u);
  assert.match(history, /<section id="reflection">/u);
  assert.match(history, /<figure class="history-quote"><blockquote>/u);
  assert.match(history, /MineThings folk were a weird community\./u);
  assert.match(history, /But it stuck.*in people.s heads\./u);
  assert.match(history, /I really want to bring this legacy forward/u);
  assert.match(history, /Serif, original player and current restoration operator/u);
  assert.match(history, /Japhet Stevens put a huge amount of effort/u);
  assert.doesNotMatch(history, /Jahet\s+Stevens/u);
  assert.match(history, /tagracat\.wordpress\.com/u);
  assert.match(history, /newgrounds\.com/u);
  assert.match(history, /browsermmorpg\.com/);
  assert.match(history, /arstechnica\.com/);
  assert.match(history, /bitcointalk\.org/);
  assert.match(history, /openuserjs\.org/);
  assert.match(history, /operator-supplied population claim/);
  assert.match(history, /not verified unique-player totals/);
  assert.doesNotMatch(history, /styles10\.css|home_h\.gif|button_logout\.jpg|id="preloader"/u);
  assertEditorialIndex(history, 'History');
  assert.ok(
    history.indexOf('On 11 June 2010') < history.indexOf('On 7 October 2010')
      && history.indexOf('On 7 October 2010') < history.indexOf('An Ars Technica discussion begun on 20 October 2010'),
    'The player-built interface account should remain internally chronological'
  );
  const timelineMatch = history.match(/<div class="editorial-copy history-timeline">([\s\S]*?)<\/div><\/div>\s*<\/article>/u);
  assert.ok(timelineMatch, 'History should expose a timeline container');
  const timelineSections = [...timelineMatch[1].matchAll(/<section id="([^"]+)"[^>]*>([\s\S]*?)<\/section>/gu)];
  assert.ok(timelineSections.length > 0, 'History should contain dated timeline sections');
  const timelineDates = timelineSections.map(([, id, section]) => {
    const headingDate = section.match(/<h2><time datetime="(\d{4}(?:-\d{2})?(?:-\d{2})?)">/u);
    assert.ok(headingDate, `History section #${id} should begin its heading with a clear date`);
    const value = headingDate[1];
    return value.length === 4 ? `${value}-01-01` : value.length === 7 ? `${value}-01` : value;
  });
  assert.deepEqual(timelineDates, [...timelineDates].sort(), 'History sections should appear in chronological order');
  const legal = await (await fetch(`${base}/legal`)).text();
  assert.match(legal, /<body class="game-body public-body">/u);
  assert.match(legal, /class="editorial-switcher"[^>]*>.*href="\/legal" aria-current="page"/su);
  assert.match(legal, /class="page-title"[^>]*>.*MineThings archive .* Record 02/su);
  assert.doesNotMatch(legal, /editorial-hero/u);
  assert.match(legal, /class="editorial-facts" aria-label="Legal document status"/u);
  assert.match(legal, /class="legal-summary" role="note"/u);
  assert.match(legal, /<section id="operator"><h2>1\. Operator and status<\/h2>/u);
  assert.match(legal, /<section id="privacy"><h2>5\. Privacy<\/h2>/u);
  assert.match(legal, /<section id="rights"><h2>6\. Rights and submitted content<\/h2>/u);
  assert.match(legal, /original game was created by <strong>Japhet Stevens<\/strong>/u);
  assert.doesNotMatch(legal, /Jahet\s+Stevens/u);
  assert.match(legal, /You may object at any time to processing based on legitimate interests/u);
  assert.match(legal, /Information Commissioner.s Office/u);
  assert.match(legal, /class="editorial-document-note"/u);
  assert.match(legal, /Test Seller/);
  assert.match(legal, /Nothing excludes or limits liability/);
  assertEditorialIndex(legal, 'Legal');
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
  assert.match(await download.text(), new RegExp(`Terms version: ${LEGAL_VERSION}`, 'u'));

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
