import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlayer } from '../src/game.js';
import { loadLegacyCatalog } from '../src/legacy-catalog.js';
import {
  COUNCIL_BADGES, COUNCIL_MISSION_TEMPLATES, COUNCIL_REPUTATION_MAX_GRADE,
  COUNCIL_TITLES, councilRankFor, prepareCouncilMission
} from '../src/council-missions.js';
import { createApp } from '../src/server.js';
import { hashPassword, SqliteStore } from '../src/store.js';

const catalog = loadLegacyCatalog();

function councilFixture(name = 'Council Mission Tester') {
  const store = new SqliteStore(':memory:');
  store.seedCatalog(catalog);
  const player = store.addPlayer(createPlayer(
    name, '', hashPassword('correct horse paperwork'), catalog, 1000, () => 0.5
  ));
  return { store, player };
}

test('uses 64 square-threshold title grades and eight deliberately ugly badges', () => {
  assert.equal(COUNCIL_REPUTATION_MAX_GRADE, 64);
  assert.equal(COUNCIL_TITLES.length, 65);
  assert.equal(new Set(COUNCIL_TITLES).size, COUNCIL_TITLES.length);
  assert.equal(COUNCIL_BADGES.length, 8);
  assert.ok(COUNCIL_MISSION_TEMPLATES.filter((mission) =>
    mission.eligibility === 'always').length >= 4,
  'even an empty account can receive four orders');
  assert.ok(COUNCIL_MISSION_TEMPLATES.some((mission) => mission.difficulty === 'directive'));
  for (let grade = 0; grade <= 64; grade += 1) {
    const standing = councilRankFor(grade ** 2, true);
    assert.equal(standing.grade, grade);
    assert.equal(standing.title, COUNCIL_TITLES[grade]);
    if (grade < 64) assert.equal(standing.nextReputation, (grade + 1) ** 2);
  }
  const final = councilRankFor(4096, true);
  assert.equal(final.final, true);
  assert.equal(final.badge.name, 'Great Pigeon Sunburst');
  assert.equal(final.nextReputation, null);
});

test('offers several distinct casino, crypto-market, and route-patrol orders', () => {
  const casinoOrders = COUNCIL_MISSION_TEMPLATES.filter((mission) =>
    mission.objectiveKey === 'casino_pull');
  const cryptoOrders = COUNCIL_MISSION_TEMPLATES.filter((mission) =>
    mission.objectiveKey === 'crypto_order');
  const patrolOrders = COUNCIL_MISSION_TEMPLATES.filter((mission) =>
    mission.objectiveKey === 'vehicle_patrol');
  assert.ok(casinoOrders.length >= 3);
  assert.ok(cryptoOrders.length >= 3);
  assert.ok(patrolOrders.length >= 3);
  assert.equal(new Set(casinoOrders.map((mission) => mission.title)).size,
    casinoOrders.length);
  assert.equal(new Set(cryptoOrders.map((mission) => mission.title)).size,
    cryptoOrders.length);
  assert.equal(new Set(patrolOrders.map((mission) => mission.title)).size,
    patrolOrders.length);

  const buyOrder = cryptoOrders.find((mission) => mission.key === 'crypto-buy-orders');
  const sellOrder = cryptoOrders.find((mission) => mission.key === 'crypto-sell-orders');
  assert.deepEqual(prepareCouncilMission(buyOrder,
    { cityId: 1, cityName: 'Obsidian Quay' }, 'buy').details.filter, { side: 'buy' });
  assert.deepEqual(prepareCouncilMission(sellOrder,
    { cityId: 1, cityName: 'Obsidian Quay' }, 'sell').details.filter, { side: 'sell' });
});

test('defines mine-output, shuttle, convoy, weapon, and modification orders', () => {
  const context = { cityId: 1, cityName: 'Obsidian Quay' };
  const expected = new Map([
    ['mine-gold', ['mine_mode', { cityId: 1, mode: 'gold' }]],
    ['mine-crypto', ['mine_mode', { cityId: 1, mode: 'crypto' }]],
    ['mine-ore', ['mine_mode', { cityId: 1, mode: 'ore' }]],
    ['establish-shuttle', ['vehicle_shuttle', { cityId: 1 }]],
    ['launch-convoy', ['vehicle_convoy', { cityId: 1 }]],
    ['fit-vehicle-weapon', ['vehicle_weapon_attach', { cityId: 1 }]],
    ['fit-vehicle-mod', ['vehicle_mod_attach', { cityId: 1 }]]
  ]);
  for (const [key, [objectiveKey, filter]] of expected) {
    const template = COUNCIL_MISSION_TEMPLATES.find((entry) => entry.key === key);
    assert.ok(template, `${key} should be a Council order`);
    assert.equal(template.objectiveKey, objectiveKey);
    assert.deepEqual(prepareCouncilMission(template, context, key).details.filter, filter);
  }
});

test('fitting a mod and weapon completes both matching Council orders', (context) => {
  const { store, player } = councilFixture('Council Vehicle Fitter');
  context.after(() => store.close());
  const vehicleType = catalog.vehicles.find((vehicle) => vehicle.routeType === 0
    && catalog.byId.get(vehicle.itemId)?.rarity >= 4 && vehicle.capacity >= 3);
  const mod = catalog.mods.find((entry) => catalog.byId.get(entry.itemId)?.rarity === 1);
  const weapon = catalog.weapons.find((entry) =>
    catalog.byId.get(entry.itemId)?.rarity === 1);
  assert.ok(vehicleType && mod && weapon);
  player.inventory[vehicleType.itemId] = 1;
  player.inventory[mod.itemId] = 1;
  player.inventory[weapon.itemId] = 1;
  store.savePlayer(player);
  const vehicleId = store.activateVehicle(player.id, vehicleType.itemId);
  const now = Date.UTC(2026, 8, 18, 9);
  const [modMission, weaponMission] = store.councilMissionBoard(player.id, now).offered;
  for (const [mission, objectiveKey] of [
    [modMission, 'vehicle_mod_attach'], [weaponMission, 'vehicle_weapon_attach']
  ]) {
    store.database.prepare(`
      UPDATE council_missions SET objective_key = ?, target_quantity = 1,
        details_json = ?, progress = 0 WHERE id = ?
    `).run(objectiveKey, JSON.stringify({ filter: { cityId: player.cityId } }), mission.id);
    store.acceptCouncilMission(player.id, mission.id, now + 1);
  }

  store.fitVehicleLoadout(player.id, vehicleId, [mod.id], [weapon.id], now + 2);
  const completedIds = new Set(store.councilMissionBoard(player.id, now + 3).history
    .filter((mission) => mission.status === 'completed').map((mission) => mission.id));
  assert.equal(completedIds.has(modMission.id), true);
  assert.equal(completedIds.has(weaponMission.id), true);
});

test('establishing a shuttle and launching a convoy complete matching Council orders',
  (context) => {
    const { store, player } = councilFixture('Council Transport Organiser');
    context.after(() => store.close());
    const vehicleType = catalog.vehicles.find((vehicle) => vehicle.routeType !== 2
      && vehicle.capacity > 0 && catalog.byId.has(vehicle.itemId)
      && catalog.routes.some((route) => route.open && route.type === vehicle.routeType
        && route.city1Id !== route.city2Id
        && [route.city1Id, route.city2Id].includes(player.cityId)));
    assert.ok(vehicleType);
    player.inventory[vehicleType.itemId] = 3;
    store.savePlayer(player);
    const vehicleIds = Array.from({ length: 3 }, () =>
      store.activateVehicle(player.id, vehicleType.itemId));
    const now = Date.UTC(2026, 8, 19, 9);
    const route = store.routesForVehicle(player.id, vehicleIds[0], now)[0];
    assert.ok(route);
    const [shuttleMission, convoyMission] = store.councilMissionBoard(player.id, now).offered;
    for (const [mission, objectiveKey] of [
      [shuttleMission, 'vehicle_shuttle'], [convoyMission, 'vehicle_convoy']
    ]) {
      store.database.prepare(`
        UPDATE council_missions SET objective_key = ?, target_quantity = 1,
          details_json = ?, progress = 0 WHERE id = ?
      `).run(objectiveKey, JSON.stringify({ filter: { cityId: player.cityId } }), mission.id);
      store.acceptCouncilMission(player.id, mission.id, now + 1);
    }

    store.startVehicleShuttle(player.id, vehicleIds[0], route.id, now + 2);
    store.startVehicleConvoy(player.id, vehicleIds.slice(1), route.id, 0, now + 3);
    const completedIds = new Set(store.councilMissionBoard(player.id, now + 4).history
      .filter((mission) => mission.status === 'completed').map((mission) => mission.id));
    assert.equal(completedIds.has(shuttleMission.id), true);
    assert.equal(completedIds.has(convoyMission.id), true);
  });

test('changing a mine output completes the matching order but resubmitting it does not',
  async (context) => {
    const { store, player } = councilFixture('Council Mine Reclassifier');
    const mine = player.mines.find((entry) => entry.active
      && Number(entry.cityId) === Number(player.cityId));
    assert.ok(mine);
    mine.mineThings = true;
    mine.cryptoTypeId = null;
    store.savePlayer(player);
    const mineType = catalog.mineTypes.find((entry) => entry.id === mine.mineTypeId);
    const targetMode = mineType.hasOre ? 'ore' : 'gold';
    const now = 2000;
    const firstMission = store.councilMissionBoard(player.id, now).offered[0];
    const prepareMission = (mission) => {
      store.database.prepare(`
        UPDATE council_missions SET objective_key = 'mine_mode', target_quantity = 1,
          details_json = ?, progress = 0 WHERE id = ?
      `).run(JSON.stringify({ filter: { cityId: player.cityId, mode: targetMode } }),
        mission.id);
      store.acceptCouncilMission(player.id, mission.id, now + 1);
    };
    prepareMission(firstMission);
    const server = createApp({ store, now: () => now + 2, random: () => 0.5 });
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
      body: new URLSearchParams({ name: player.name, password: 'correct horse paperwork' })
    });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const switchOutput = await fetch(`${base}/mines/${mine.id}/mode`, {
      method: 'POST', redirect: 'manual', headers: {
        cookie, 'content-type': 'application/x-www-form-urlencoded'
      }, body: new URLSearchParams({ mode: 'resource' })
    });
    assert.equal(switchOutput.status, 303);
    assert.equal(store.councilMissionBoard(player.id, now + 3).history
      .find((entry) => entry.id === firstMission.id)?.status, 'completed');

    const secondMission = store.councilMissionBoard(player.id, now + 3).offered[0];
    prepareMission(secondMission);
    const resubmit = await fetch(`${base}/mines/${mine.id}/mode`, {
      method: 'POST', redirect: 'manual', headers: {
        cookie, 'content-type': 'application/x-www-form-urlencoded'
      }, body: new URLSearchParams({ mode: 'resource' })
    });
    assert.equal(resubmit.status, 303);
    assert.equal(store.councilMissionBoard(player.id, now + 4).active
      .find((entry) => entry.id === secondMission.id)?.progress, 0);
  });

test('successful casino pulls and crypto orders advance Council work automatically',
  (context) => {
    const { store, player } = councilFixture('Council Vice Compliance Tester');
    context.after(() => store.close());
    const now = Date.UTC(2026, 8, 16, 9);
    const board = store.councilMissionBoard(player.id, now);
    const [casinoMission, cryptoMission] = board.offered;
    store.database.prepare(`
      UPDATE council_missions
      SET objective_key = ?, target_quantity = 1, details_json = '{}', progress = 0
      WHERE id = ?
    `).run('casino_pull', casinoMission.id);
    store.database.prepare(`
      UPDATE council_missions
      SET objective_key = ?, target_quantity = 1,
        details_json = '{"filter":{"side":"sell"}}', progress = 0
      WHERE id = ?
    `).run('crypto_order', cryptoMission.id);
    store.acceptCouncilMission(player.id, casinoMission.id, now + 1);
    store.acceptCouncilMission(player.id, cryptoMission.id, now + 2);

    const voucher = { crypto_type_id: 1, quantity: 2 };
    store.database.prepare(`
      INSERT INTO casino_vouchers (player_id, crypto_type_id, quantity)
      VALUES (?, ?, ?)
    `).run(player.id, voucher.crypto_type_id, voucher.quantity);
    store.database.prepare(`
      INSERT INTO player_crypto_balances (player_id, crypto_type_id, quantity)
      VALUES (?, 1, 2)
      ON CONFLICT (player_id, crypto_type_id) DO UPDATE SET quantity = 2
    `).run(player.id);
    assert.throws(() => store.spinCasino(
      player.id, `crypto:${voucher.crypto_type_id}`, 0,
      () => 0.5, now + 3
    ));
    store.spinCasino(player.id, `crypto:${voucher.crypto_type_id}`, 1,
      () => 0.5, now + 4);
    assert.equal(store.councilMissionBoard(player.id, now + 5).history
      .find((mission) => mission.id === casinoMission.id)?.status, 'completed');

    assert.throws(() => store.placeCryptoOrder(player.id, 1, 'sell', 0, 1, now + 6));
    store.placeCryptoOrder(player.id, 1, 'sell', 1, 1, now + 7);
    assert.equal(store.councilMissionBoard(player.id, now + 8).history
      .find((mission) => mission.id === cryptoMission.id)?.status, 'completed');
  });

test('generates varied orders and pays scraps, fractional Gold, reputation, and no Credits',
  (context) => {
    const { store, player } = councilFixture();
    context.after(() => store.close());
    const offeredAt = Date.UTC(2026, 8, 10, 9);
    const board = store.councilMissionBoard(player.id, offeredAt);
    assert.equal(board.offered.length, 4);
    assert.equal(new Set(board.offered.map((mission) => mission.family)).size, 4);
    assert.equal(board.active.length, 0);
    assert.equal(board.standing.enrolled, false);
    assert.ok(board.offered.every((mission) => mission.rewardScraps > 0));
    assert.ok(board.offered.every((mission) => mission.rewardScraps <= 400));
    assert.ok(board.offered.every((mission) => mission.rewardGold > 0
      && mission.rewardGold < 1));

    store.database.prepare('UPDATE council_missions SET reward_scraps = 8000 WHERE id = ?')
      .run(board.offered[0].id);
    const rebalanced = store.councilMissionBoard(player.id, offeredAt + 1);
    assert.ok(rebalanced.offered.find((mission) =>
      mission.id === board.offered[0].id).rewardScraps <= 400,
    'outstanding orders adopt the corrected reward scale');

    const selected = board.offered.find((mission) => mission.objectiveKey !== 'delivery');
    const accepted = store.acceptCouncilMission(player.id, selected.id, offeredAt + 1000);
    assert.equal(accepted.status, 'active');
    assert.equal(store.councilStanding(player.id).enrolled, true);
    const before = store.playerById(player.id, offeredAt + 1000, { settle: false });
    const beforeScraps = before.oreScrapsByCity[before.cityId] ?? 0;
    const progressContext = { ...accepted.details.filter,
      cityId: accepted.details.filter?.cityId ?? before.cityId,
      quantity: accepted.targetQuantity };
    const completed = store.advanceCouncilMissions(
      player.id, accepted.objectiveKey, progressContext, offeredAt + 2000
    );
    assert.equal(completed.length, 1);
    assert.equal(completed[0].mission.status, 'completed');

    const after = store.playerById(player.id, offeredAt + 2000, { settle: false });
    assert.equal(after.credits, before.credits, 'Council work never creates paid Credits');
    assert.equal(after.gold, before.gold + accepted.rewardGold);
    assert.equal(after.oreScrapsByCity[before.cityId] - beforeScraps,
      accepted.rewardScraps);
    assert.equal(after.council.reputation, accepted.rewardReputation);
    assert.equal(after.council.completedMissions, 1);
    assert.equal(store.advanceCouncilMissions(
      player.id, accepted.objectiveKey, progressContext, offeredAt + 3000
    ).length, 0, 'a completed order cannot pay twice');
    const message = store.recentMessages(player.id).find((entry) =>
      entry.details?.event === 'council-mission-completed');
    assert.equal(message.senderName, 'The Council');
    assert.match(message.body, /no additional privileges|deposited/u);
  });

test('acceptance recognises a qualifying city visit made while the order was offered',
  (context) => {
    const { store, player } = councilFixture('Council Prior Work Tester');
    context.after(() => store.close());
    const offeredAt = Date.UTC(2026, 8, 13, 9);
    const mission = store.councilMissionBoard(player.id, offeredAt).offered[0];
    store.database.prepare(`
      UPDATE council_missions
      SET objective_key = 'explore_location', target_quantity = 1,
        details_json = ?, progress = 0
      WHERE id = ?
    `).run(JSON.stringify({ actionPath: '/explore', filter: { cityId: player.cityId } }),
      mission.id);
    store.database.prepare(`
      INSERT INTO city_exploration_progress
        (player_id, city_id, progress_type, entry_key, completed_at)
      VALUES (?, ?, 'location', 'council-prior-work-test', ?)
    `).run(player.id, player.cityId, offeredAt + 500);

    const accepted = store.acceptCouncilMission(player.id, mission.id, offeredAt + 1000);
    assert.equal(accepted.status, 'completed');
    assert.equal(store.councilStanding(player.id).completedMissions, 1);
  });

test('automatic Meld completion advances its Council order from the shared store path',
  (context) => {
    const store = new SqliteStore(':memory:');
    context.after(() => store.close());
    store.seedCatalog(catalog);
    const meld = catalog.meldById.get(52);
    const playerState = createPlayer(
      'Council Automatic Melder', '', 'hash', catalog, 1000, () => 0.5
    );
    playerState.inventory = {};
    for (const requirement of meld.requirements) {
      playerState.inventory[requirement.itemId] =
        (playerState.inventory[requirement.itemId] ?? 0) + requirement.count;
    }
    playerState.inventoryByCity = { [playerState.cityId]: playerState.inventory };
    const player = store.addPlayer(playerState);
    const ownMeld = store.database.prepare(
      'INSERT INTO player_melds (player_id, meld_id, created_at) VALUES (?, ?, 1)'
    );
    for (const candidate of catalog.melds.filter((entry) =>
      entry.public && entry.id !== meld.id)) ownMeld.run(player.id, candidate.id);

    const now = Date.UTC(2026, 8, 14, 9);
    const mission = store.councilMissionBoard(player.id, now).offered[0];
    store.database.prepare(`
      UPDATE council_missions
      SET objective_key = 'meld_create', target_quantity = 1,
        details_json = '{}', progress = 0
      WHERE id = ?
    `).run(mission.id);
    store.acceptCouncilMission(player.id, mission.id, now + 1);
    const created = [];
    for (const requirement of meld.requirements) {
      for (let quantity = 0; quantity < requirement.count; quantity += 1) {
        created.push(...store.stageMeldItem(
          player.id, requirement.itemId, now + 2 + created.length
        ).createdMelds);
      }
    }

    assert.deepEqual(created.map((entry) => entry.id), [meld.id]);
    assert.equal(store.councilMissionBoard(player.id, now + 100).history
      .find((entry) => entry.id === mission.id)?.status, 'completed');
  });

test('reconciles a Meld completion already recorded after order acceptance', (context) => {
  const { store, player } = councilFixture('Council Meld Reconciliation Tester');
  context.after(() => store.close());
  const now = Date.UTC(2026, 8, 15, 9);
  const mission = store.councilMissionBoard(player.id, now).offered[0];
  store.database.prepare(`
    UPDATE council_missions
    SET objective_key = 'meld_create', target_quantity = 1,
      details_json = '{}', progress = 0
    WHERE id = ?
  `).run(mission.id);
  store.acceptCouncilMission(player.id, mission.id, now + 1);
  const meld = catalog.melds.find((entry) => entry.public);
  store.database.prepare(
    'INSERT INTO player_melds (player_id, meld_id, created_at) VALUES (?, ?, ?)'
  ).run(player.id, meld.id, now + 2);

  store.refreshCouncilMissionOffers(player.id, now + 3);
  assert.equal(store.councilMissionBoard(player.id, now + 3).history
    .find((entry) => entry.id === mission.id)?.status, 'completed');
});

test('limits active paperwork and guarantees a useful administrative error by completion 50',
  (context) => {
    const { store, player } = councilFixture('Council Error Tester');
    context.after(() => store.close());
    const now = Date.UTC(2026, 8, 11, 9);
    const board = store.councilMissionBoard(player.id, now);
    store.database.prepare(`
      INSERT INTO council_reputation
        (player_id, reputation, completed_missions, enrolled_at, updated_at)
      VALUES (?, 49, 49, ?, ?)
    `).run(player.id, now - 1000, now - 1000);
    const first = store.acceptCouncilMission(player.id, board.offered[0].id, now + 1);
    assert.ok(first.accidentalItemId, 'the fiftieth completion has a pity-protected error');
    store.acceptCouncilMission(player.id, board.offered[1].id, now + 2);
    assert.throws(
      () => store.acceptCouncilMission(player.id, board.offered[2].id, now + 3),
      /Only 2 Council orders/u
    );
  });

test('serves the Council office and makes an enrolled badge public on the miner profile',
  async (context) => {
    const { store, player } = councilFixture('Council Web Tester');
    const now = Date.UTC(2026, 8, 12, 9);
    const server = createApp({ store, now: () => now, random: () => 0.5 });
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
      body: new URLSearchParams({ name: player.name, password: 'correct horse paperwork' })
    });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const home = await (await fetch(base, { headers: { cookie } })).text();
    assert.match(home, /Council \(4\)/u);
    assert.match(home, /Council orders \(4\)/u);
    assert.match(home, /Miners \(1\)/u);
    const officeResponse = await fetch(`${base}/council`, { headers: { cookie } });
    assert.equal(officeResponse.status, 200);
    const office = await officeResponse.text();
    assert.match(office, /Council service orders/u);
    assert.match(office, /Available orders/u);
    assert.match(office, /0<\/strong> Credits/u);
    assert.doesNotMatch(office, /Inspect all 64|Provisionally Noted Person/u);
    const missionId = Number(office.match(/\/council\/missions\/(\d+)\/accept/u)?.[1]);
    assert.ok(missionId);
    const accepted = await fetch(`${base}/council/missions/${missionId}/accept`, {
      method: 'POST', redirect: 'manual', headers: { cookie }
    });
    assert.equal(accepted.status, 303);
    assert.equal(accepted.headers.get('location'), '/council');
    const afterAccept = await (await fetch(`${base}/council`, { headers: { cookie } })).text();
    assert.match(afterAccept, /Council \(3\)/u);
    assert.match(afterAccept, /Council orders \(3\)/u);
    const profile = await (await fetch(
      `${base}/miners/${encodeURIComponent(player.name)}`, { headers: { cookie } }
    )).text();
    assert.match(profile, /Compulsory Council standing/u);
    assert.match(profile, /Bent Identity Tab/u);
  });
