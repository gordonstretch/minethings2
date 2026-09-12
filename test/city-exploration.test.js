import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createPlayer } from '../src/game.js';
import {
  CITY_ENCOUNTER_CHANCE, CITY_LOCATION_REWARD_SCRAPS, CITY_NOTICE_REWARD_SCRAPS,
  CITY_EATEN_ACTOR_RESPAWN_STEPS, CITY_ORE_SCRAP_COUNT, CITY_POWER_DURATION_STEPS,
  CITY_POWER_UP_COUNT, CITY_STREET_DEAD_PAUSE_MS, advanceCityStreetActors,
  generateCityInterior, generateCityStreetActors, isWalkable
} from '../src/city-exploration.js';
import { CITY_COMPLETION_STONE, HOME_STONE, loadLegacyCatalog } from '../src/legacy-catalog.js';
import { createApp } from '../src/server.js';
import { CITY_BAR_PRESENCE_TTL_MS, hashPassword, SqliteStore } from '../src/store.js';

const context = {
  cityId: 6, cityName: 'Cinderwake', mapId: 1, mapName: 'Aso', mapSlug: 'aso',
  isCapital: true, hasPlayerHome: true, hasMarket: true, hasOilField: true,
  routeTypes: [0, 1, 2], mineTypeNames: ['Spices', 'Weapons', 'Bugs']
};

test('city encounters use the deliberately rare one-fiftieth roll rate', () => {
  assert.equal(CITY_ENCOUNTER_CHANCE, 0.0024);
});

function reachable(interior) {
  const visited = new Set([`${interior.start.x},${interior.start.y}`]);
  const queue = [{ ...interior.start }];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const next = { x: current.x + dx, y: current.y + dy };
      const key = `${next.x},${next.y}`;
      if (!isWalkable(interior, next.x, next.y) || visited.has(key)) continue;
      visited.add(key);
      queue.push(next);
    }
  }
  return { visited, queue };
}

function pathBetween(interior, origin, target) {
  const originKey = `${origin.x},${origin.y}`;
  const targetKey = `${target.x},${target.y}`;
  const queue = [{ ...origin }];
  const previous = new Map([[originKey, null]]);
  for (let index = 0; index < queue.length && !previous.has(targetKey); index += 1) {
    const current = queue[index];
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const next = { x: current.x + dx, y: current.y + dy };
      const nextKey = `${next.x},${next.y}`;
      if (!isWalkable(interior, next.x, next.y) || previous.has(nextKey)) continue;
      previous.set(nextKey, current);
      queue.push(next);
    }
  }
  assert.ok(previous.has(targetKey), 'target should be connected to the street network');
  const path = [];
  for (let cursor = target; `${cursor.x},${cursor.y}` !== originKey;
    cursor = previous.get(`${cursor.x},${cursor.y}`)) path.push(cursor);
  return path.reverse();
}

test('city interiors are deterministic connected street networks with city-specific destinations and lore', () => {
  const first = generateCityInterior(context);
  const second = generateCityInterior(context);
  const outpost = generateCityInterior({
    ...context, cityId: 2, cityName: 'Blackglass', isCapital: false,
    hasPlayerHome: false, hasMarket: false, hasOilField: false, routeTypes: [0]
  });
  assert.deepEqual(first, second);
  assert.notDeepEqual(first.rows, outpost.rows);
  assert.equal(first.size, 35);
  assert.equal(isWalkable(first, first.start.x, first.start.y), true);
  const { visited } = reachable(first);
  const openCells = first.rows.reduce((sum, row) =>
    sum + [...row].filter((cell) => cell === '.').length, 0);
  const streetEdges = [...visited].reduce((sum, coordinate) => {
    const [x, y] = coordinate.split(',').map(Number);
    return sum + Number(isWalkable(first, x + 1, y))
      + Number(isWalkable(first, x, y + 1));
  }, 0);
  const junctions = [...visited].filter((coordinate) => {
    const [x, y] = coordinate.split(',').map(Number);
    return [[0, -1], [1, 0], [0, 1], [-1, 0]].filter(([dx, dy]) =>
      isWalkable(first, x + dx, y + dy)).length >= 3;
  }).length;
  assert.equal(visited.size, openCells);
  assert.ok(streetEdges - openCells + 1 >= 20, 'city streets should offer many route loops');
  assert.ok(junctions >= 20, 'city streets should have recognisable junctions');
  assert.ok(first.rows.filter((row) => [...row].filter((cell) => cell === '.').length >= 30).length >= 5,
    'several cross streets should run across the city');
  const locations = [...first.points, ...first.signs, ...first.scraps, ...first.powerUps];
  assert.equal(new Set(locations.map((entry) => `${entry.x},${entry.y}`)).size, locations.length);
  for (const location of locations) assert.ok(visited.has(`${location.x},${location.y}`));
  assert.deepEqual(first.points.map((point) => point.key), [
    'mines', 'mine-shop', 'vehicle-yard', 'market', 'harbour', 'airfield',
    'oil-field', 'factory-quarter', 'mill-yard', 'casino', 'player-home',
    'dwarf-park', 'city-landmark', 'bar'
  ]);
  assert.equal(first.signs.length, 8);
  assert.ok(first.signs.every((sign) => sign.text.length > 30));
  assert.equal(first.scraps.length, CITY_ORE_SCRAP_COUNT);
  assert.ok(first.scraps.every((scrap) => scrap.quantity === 1));
  assert.equal(first.powerUps.length, CITY_POWER_UP_COUNT);
  assert.match(first.appearance.landmark.name, /Cinderwake/);
  assert.deepEqual(outpost.points.map((point) => point.key), [
    'mines', 'mine-shop', 'vehicle-yard', 'dwarf-park', 'city-landmark', 'bar'
  ]);
});

test('city bars isolate live visits by city and hide conversation from before entry', () => {
  const store = new SqliteStore(':memory:');
  store.seedCatalog(loadLegacyCatalog());
  store.ensureWorldMaps();
  const catalog = store.loadCatalog();
  const first = store.addPlayer(createPlayer(
    'Bar First', '', 'hash', catalog, 1000, () => 0.5
  ));
  const second = store.addPlayer(createPlayer(
    'Bar Second', '', 'hash', catalog, 1000, () => 0.5
  ));
  const elsewhere = store.addPlayer(createPlayer(
    'Bar Elsewhere', '', 'hash', catalog, 1000, () => 0.5
  ));
  const otherCity = catalog.cities.find((city) => Number(city.id) !== Number(first.cityId));
  assert.ok(otherCity);
  store.database.prepare('UPDATE players SET city_id = ? WHERE id = ?')
    .run(otherCity.id, elsewhere.id);

  const firstVisit = store.enterCityBar(first.id, 10_000);
  const beforeArrival = store.addCityBarChat(
    first.id, firstVisit.visitToken, 'Before you arrived.', 10_000
  );
  const secondVisit = store.enterCityBar(second.id, 10_000);
  assert.equal(secondVisit.messages.length, 0,
    'a same-millisecond arrival must still not inherit earlier conversation');
  assert.deepEqual(secondVisit.participants.map((entry) => entry.playerName),
    ['Bar First', 'Bar Second']);

  const reply = store.addCityBarChat(
    second.id, secondVisit.visitToken, 'Now we can talk.', 10_001
  );
  const firstState = store.cityBarState(first.id, firstVisit.visitToken, 10_002);
  assert.deepEqual(firstState.messages.map((entry) => entry.id),
    [beforeArrival.message.id, reply.message.id]);
  const elsewhereVisit = store.enterCityBar(elsewhere.id, 10_002);
  assert.equal(elsewhereVisit.city.cityId, Number(otherCity.id));
  assert.deepEqual(elsewhereVisit.participants.map((entry) => entry.playerName), ['Bar Elsewhere']);
  assert.equal(elsewhereVisit.messages.length, 0);
  assert.equal(store.database.prepare('SELECT COUNT(*) AS count FROM chats').get().count, 0,
    'bar speech must never leak into Worldwire');

  assert.equal(store.leaveCityBar(second.id, secondVisit.visitToken), true);
  assert.throws(() => store.addCityBarChat(
    second.id, secondVisit.visitToken, 'From the pavement.', 10_003
  ), /inside this bar/);
  const freshSecondVisit = store.enterCityBar(second.id, 10_004);
  assert.throws(() => store.cityBarState(
    second.id, freshSecondVisit.visitToken,
    10_004 + CITY_BAR_PRESENCE_TTL_MS + 1
  ), /no longer in this bar/);
  assert.ok(store.database.prepare('PRAGMA table_info(city_bar_presence)').all()
    .some((column) => column.name === 'entered_after_chat_id'));
  store.close();
});

test('every Dwarf colour and the restless dead persist as roaming city actors', () => {
  const interior = generateCityInterior(context);
  const actors = generateCityStreetActors(interior, context);
  assert.deepEqual(actors.filter((actor) => actor.kind === 'dwarf').map((actor) => actor.name), [
    'Yellow Dwarf', 'Green Dwarf', 'Blue Dwarf', 'Red Dwarf', 'Purple Dwarf', 'Orange Dwarf'
  ]);
  assert.equal(actors.filter((actor) => actor.kind === 'dead').length, 3);
  assert.equal(new Set(actors.map((actor) => `${actor.x},${actor.y}`)).size, actors.length);
  assert.ok(actors.every((actor) => isWalkable(interior, actor.x, actor.y)));
});

test('charged Ore cores briefly make roaming Dwarves and the dead edible', () => {
  const store = new SqliteStore(':memory:');
  store.seedCatalog(loadLegacyCatalog());
  store.ensureWorldMaps();
  const catalog = store.loadCatalog();
  const player = store.addPlayer(createPlayer(
    'Ore Powered', '', 'hash', catalog, 1000, () => 0.5
  ));
  const initial = store.cityExploration(player.id);
  const core = initial.interior.powerUps[0];
  const path = pathBetween(initial.interior, initial.position, core);
  const origin = path.at(-2) ?? initial.position;
  const actors = [{
    id: 'power-dwarf', kind: 'dwarf', rarity: 1, name: 'Yellow Dwarf',
    colour: '#f0df35', attack: 'bite', x: core.x, y: core.y,
    originX: core.x, originY: core.y, state: 'roaming', cooldownUntilStep: 0
  }, {
    id: 'power-dead', kind: 'dead', name: 'Road Wraith', colour: '#82a5a4',
    x: core.x, y: core.y, originX: core.x, originY: core.y,
    state: 'roaming', cooldownUntilStep: 0
  }];
  store.database.prepare(`
    INSERT INTO city_exploration
      (player_id, city_id, x, y, steps, last_encounter_step, pending_encounter_json,
        street_actors_json, updated_at)
    VALUES (?, ?, ?, ?, 10, 0, NULL, ?, 1)
  `).run(player.id, player.cityId, origin.x, origin.y, JSON.stringify(actors));
  const powered = store.moveInCity(
    player.id, core.x, core.y, 2, () => 0.99, core.x, core.y
  );
  assert.equal(powered.powerUp.key, core.key);
  assert.equal(powered.powerRemainingSteps, CITY_POWER_DURATION_STEPS);
  assert.deepEqual(powered.streetEvents.map((event) => event.kind),
    ['power-up', 'eaten', 'eaten']);
  assert.equal(powered.streetActors.length, 0);
  assert.equal(powered.progress.powerUpsCollected, 1);
  const stored = JSON.parse(store.database.prepare(`
    SELECT street_actors_json FROM city_exploration WHERE player_id = ? AND city_id = ?
  `).get(player.id, player.cityId).street_actors_json);
  assert.ok(stored.every((actor) => actor.state === 'gone'
    && actor.goneUntilStep === powered.powerUntilStep + CITY_EATEN_ACTOR_RESPAWN_STEPS));
  assert.equal(store.cityExploration(player.id).powerRemainingSteps, CITY_POWER_DURATION_STEPS);
  const respawned = advanceCityStreetActors(
    initial.interior, stored, powered.powerUntilStep + CITY_EATEN_ACTOR_RESPAWN_STEPS
  );
  assert.ok(respawned.actors.every((actor) => actor.state === 'roaming'));
  store.close();
});

test('street Dwarves steal loose Things and restless dead briefly stop a journey', () => {
  const store = new SqliteStore(':memory:');
  store.seedCatalog(loadLegacyCatalog());
  store.ensureWorldMaps();
  const catalog = store.loadCatalog();
  const player = store.addPlayer(createPlayer(
    'Unsafe Streets', '', 'hash', catalog, 1000, () => 0.5
  ));
  const initial = store.cityExploration(player.id);
  const firstTarget = [[0, -1], [1, 0], [0, 1], [-1, 0]]
    .map(([dx, dy]) => ({ x: initial.position.x + dx, y: initial.position.y + dy }))
    .find((cell) => isWalkable(initial.interior, cell.x, cell.y));
  const looseThing = store.database.prepare(`
    SELECT inventory.item_id, inventory.quantity FROM inventory
    WHERE inventory.player_id = ? AND inventory.city_id = ?
      AND inventory.item_id NOT IN (SELECT item_id FROM catalog_dwarf_tiers)
    ORDER BY inventory.item_id LIMIT 1
  `).get(player.id, player.cityId);
  const thief = {
    id: 'test-thief', kind: 'dwarf', rarity: 2, name: 'Green Dwarf', colour: '#78bd46',
    attack: 'pickpocket', x: firstTarget.x, y: firstTarget.y,
    originX: firstTarget.x, originY: firstTarget.y, state: 'roaming', cooldownUntilStep: 0
  };
  store.database.prepare(`
    INSERT INTO city_exploration
      (player_id, city_id, x, y, steps, last_encounter_step, pending_encounter_json,
        street_actors_json, updated_at)
    VALUES (?, ?, ?, ?, 0, 0, NULL, ?, 1)
  `).run(player.id, player.cityId, initial.position.x, initial.position.y,
    JSON.stringify([thief]));
  const theft = store.moveInCity(
    player.id, firstTarget.x, firstTarget.y, 2, () => 0.99, firstTarget.x, firstTarget.y
  );
  assert.equal(theft.streetEvents[0].kind, 'pickpocket');
  assert.equal(theft.streetEvents[0].stolenItem.itemId, looseThing.item_id);
  assert.equal(theft.streetActors[0].state, 'fleeing');
  assert.equal(store.database.prepare(`
    SELECT COALESCE(quantity, 0) AS quantity FROM inventory
    WHERE player_id = ? AND city_id = ? AND item_id = ?
  `).get(player.id, player.cityId, looseThing.item_id)?.quantity ?? 0, looseThing.quantity - 1);

  const secondTarget = [[0, -1], [1, 0], [0, 1], [-1, 0]]
    .map(([dx, dy]) => ({ x: firstTarget.x + dx, y: firstTarget.y + dy }))
    .find((cell) => isWalkable(initial.interior, cell.x, cell.y));
  const dead = {
    id: 'test-dead', kind: 'dead', name: 'Road Wraith', colour: '#82a5a4',
    x: secondTarget.x, y: secondTarget.y, originX: secondTarget.x, originY: secondTarget.y,
    state: 'roaming', cooldownUntilStep: 0
  };
  store.database.prepare(`
    UPDATE city_exploration SET street_actors_json = ? WHERE player_id = ? AND city_id = ?
  `).run(JSON.stringify([dead]), player.id, player.cityId);
  const blocked = store.moveInCity(
    player.id, secondTarget.x, secondTarget.y, 3, () => 0.99, secondTarget.x, secondTarget.y
  );
  assert.equal(blocked.streetEvents[0].kind, 'dead');
  assert.equal(blocked.streetEvents[0].pauseMs, CITY_STREET_DEAD_PAUSE_MS);
  store.close();
});

test('all catalog cities have unique layouts and map-derived regional architecture', () => {
  const store = new SqliteStore(':memory:');
  store.seedCatalog(loadLegacyCatalog());
  store.ensureWorldMaps();
  const catalog = store.loadCatalog();
  const layouts = [];
  const appearances = [];
  for (const city of catalog.cities) {
    const map = catalog.maps.find((entry) => entry.id === city.mapId);
    const interior = generateCityInterior({
      cityId: city.id, cityName: city.name, mapId: map.id, mapName: map.name,
      mapSlug: map.slug, isCapital: city.id === map.capitalCityId,
      hasPlayerHome: city.id === map.capitalCityId, hasMarket: city.hasMarket,
      hasOilField: false, routeTypes: [], mineTypeNames: []
    });
    assert.equal(interior.scraps.length, CITY_ORE_SCRAP_COUNT);
    assert.equal(interior.powerUps.length, CITY_POWER_UP_COUNT);
    layouts.push(interior.rows.join('\n'));
    appearances.push(interior.appearance);
  }
  assert.equal(new Set(layouts).size, catalog.cities.length);
  assert.equal(new Set(appearances.map((entry) => entry.signature)).size, catalog.cities.length);
  assert.equal(new Set(appearances.map((entry) => entry.motif)).size, catalog.maps.length);
  assert.equal(new Set(appearances.map((entry) => entry.roofPattern)).size, 5);
  assert.equal(new Set(appearances.map((entry) => entry.landmark.name)).size,
    catalog.cities.length);
  assert.equal(new Set(appearances.map((entry) => entry.landmark.kind)).size, 7);
  assert.equal(new Set(appearances.map((entry) => entry.landmark.form)).size,
    catalog.cities.length, 'every catalog city has its own authored architectural form');
  assert.equal(new Set(appearances.map((entry) => entry.landmark.style)).size,
    catalog.maps.length, 'each region supplies a distinctive architectural tradition');
  assert.equal(new Set(appearances.map((entry) => entry.landmark.detailSeed)).size,
    catalog.cities.length, 'line-art detail placement has a stable city-specific seed');
  assert.ok(appearances.every(({ landmark }) =>
    typeof landmark.material === 'string' && landmark.material.length > 30
    && typeof landmark.silhouette === 'string' && landmark.silhouette.length > 30
    && typeof landmark.roof === 'string' && landmark.roof.length > 20
    && typeof landmark.setting === 'string' && landmark.setting.length > 20
    && typeof landmark.ornament === 'string' && landmark.ornament.length > 20
    && Number.isInteger(landmark.storeys) && landmark.storeys >= 2
    && Number.isInteger(landmark.bays) && landmark.bays >= 3
    && landmark.details.length === 8
    && new Set(landmark.details).size === 8
    && landmark.description.length > 150));
  assert.deepEqual(appearances.filter((entry) => [6, 7, 8, 9, 10, 11, 1]
    .includes(Number(entry.signature.split('-').at(-1))))
    .map((entry) => entry.landmark.name).sort(), [
    'Ashfall Spore Lantern Parliament',
    'Brimstone Cinder Archive Pantheon',
    'Cinderwake Derrick Basilica',
    'Emberdeep Inverted Hearth Monastery',
    'Frostmere Aurora Relay Palace',
    'Stormcrag Tempest Bell Citadel',
    "Tzolk'in Calendar Causeway"
  ].sort());
  store.close();
});

test('regional-capital homes reserve displayed things and return them intact', () => {
  const store = new SqliteStore(':memory:');
  store.seedCatalog(loadLegacyCatalog());
  store.ensureWorldMaps();
  const catalog = store.loadCatalog();
  const player = store.addPlayer(createPlayer(
    'House Proud', '', 'hash', catalog, 1000, () => 0.5
  ));
  const home = store.cityHome(player.id);
  assert.equal(home.slots.length, 3);
  assert.equal(home.slots.every((entry) => entry.item === null), true);
  assert.equal(store.enterCityHome(player.id, 1500).stone, null,
    'opening a guessed home URL does not replace finding the dwelling on foot');
  assert.equal(store.cityExploration(player.id).interior.points.some(
    (point) => point.key === 'player-home' && point.href === '/explore/home'
  ), true);
  const item = home.availableItems[0];
  const beforeCapacity = store.inventoryCapacity(player.id);
  store.database.prepare(`
    INSERT INTO protected_inventory (player_id, city_id, item_id, quantity)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(player_id, city_id, item_id) DO UPDATE SET quantity = excluded.quantity
  `).run(player.id, player.cityId, item.itemId, item.quantity);
  const displayed = store.setCityHomeDisplay(player.id, 2, item.itemId, 2000);
  assert.equal(displayed.slots[1].item.itemId, item.itemId);
  assert.equal(displayed.storageThingCount, home.storageThingCount - 1);
  assert.equal(store.inventoryCapacity(player.id).itemCount, beforeCapacity.itemCount);
  assert.equal(store.database.prepare(`
    SELECT protected FROM player_home_displays
    WHERE player_id = ? AND city_id = ? AND slot = 2
  `).get(player.id, player.cityId).protected, 1);
  const removed = store.setCityHomeDisplay(player.id, 2, '', 3000);
  assert.equal(removed.slots[1].item, null);
  assert.equal(removed.storageThingCount, home.storageThingCount);
  assert.equal(store.database.prepare(`
    SELECT quantity FROM protected_inventory
    WHERE player_id = ? AND city_id = ? AND item_id = ?
  `).get(player.id, player.cityId, item.itemId).quantity, item.quantity);
  assert.equal(store.inventoryCapacity(player.id).itemCount, beforeCapacity.itemCount);
  store.close();
});

test('street Ore, landmark visits, and notice reading persist and award completion once', () => {
  const store = new SqliteStore(':memory:');
  store.seedCatalog(loadLegacyCatalog());
  store.ensureWorldMaps();
  const catalog = store.loadCatalog();
  const player = store.addPlayer(createPlayer(
    'City Completionist', '', 'hash', catalog, 1000, () => 0.5
  ));
  const initial = store.cityExploration(player.id);
  let position = initial.position;
  let currentTime = 10_000;
  const locationRewards = [];
  const completionStones = [];
  const walk = (target) => {
    let result = null;
    for (const step of pathBetween(initial.interior, position, target)) {
      result = store.moveInCity(
        player.id, step.x, step.y, currentTime++, () => 0.99, target.x, target.y
      );
      position = result.position;
      locationRewards.push(...result.rewards);
      if (result.stone) completionStones.push(result.stone);
    }
    return result;
  };
  const firstScrap = initial.interior.scraps[0];
  const firstPickup = walk(firstScrap);
  assert.equal(firstPickup.pickup.key, firstScrap.key);
  const adjacent = [[0, -1], [1, 0], [0, 1], [-1, 0]]
    .map(([dx, dy]) => ({ x: firstScrap.x + dx, y: firstScrap.y + dy }))
    .find((entry) => isWalkable(initial.interior, entry.x, entry.y));
  walk(adjacent);
  assert.equal(walk(firstScrap).pickup, null, 'a street scrap cannot be collected twice');

  for (const point of initial.interior.points) walk(point);
  let progress = store.cityExploration(player.id).progress;
  assert.equal(progress.locationsVisited, progress.totalLocations);
  assert.equal(progress.locationRewardEarned, true);
  assert.deepEqual(locationRewards.map((reward) => reward.quantity), [CITY_LOCATION_REWARD_SCRAPS]);

  assert.throws(() => store.readCityExplorationSign(player.id, 'sign-1', currentTime++),
    /Stand beside that notice/);
  const noticeRewards = [];
  for (const sign of initial.interior.signs) {
    walk(sign);
    const read = store.readCityExplorationSign(player.id, sign.key, currentTime++);
    assert.equal(read.firstRead, true);
    noticeRewards.push(...read.rewards);
    if (read.stone) completionStones.push(read.stone);
  }
  const repeated = store.readCityExplorationSign(
    player.id, initial.interior.signs.at(-1).key, currentTime++
  );
  assert.equal(repeated.firstRead, false);
  assert.deepEqual(repeated.rewards, []);
  progress = repeated.progress;
  assert.equal(progress.signsRead, progress.totalSigns);
  assert.equal(progress.noticeRewardEarned, true);
  assert.deepEqual(noticeRewards.map((reward) => reward.quantity), [CITY_NOTICE_REWARD_SCRAPS]);

  for (const scrap of initial.interior.scraps) walk(scrap);
  progress = store.cityExploration(player.id).progress;
  assert.equal(progress.scrapsCollected, progress.totalScraps);
  const ordinaryExplorationStones = new Set(store.stonesForPlayer(player.id).earned.map(
    (stone) => stone.behaviorKey
  ));
  assert.equal(ordinaryExplorationStones.has('Scavenged'), true);
  assert.equal(ordinaryExplorationStones.has('Sightseen'), true);
  assert.equal(ordinaryExplorationStones.has('Informed'), true);
  assert.deepEqual(completionStones.map((stone) => stone.id), [CITY_COMPLETION_STONE.id]);
  assert.equal(completionStones[0].cityId, player.cityId);
  const completedAgain = walk(initial.interior.scraps[0]);
  assert.equal(completedAgain?.stone ?? null, null);
  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count FROM city_completion_stones WHERE player_id = ?
  `).get(player.id).count, 1);

  const secondCity = catalog.cities.find((city) => Number(city.id) !== Number(player.cityId));
  store.database.prepare('UPDATE players SET city_id = ? WHERE id = ?')
    .run(secondCity.id, player.id);
  const second = store.cityExploration(player.id);
  const finalSign = second.interior.signs.at(-1);
  const insertProgress = store.database.prepare(`
    INSERT INTO city_exploration_progress
      (player_id, city_id, progress_type, entry_key, completed_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const sign of second.interior.signs.slice(0, -1)) {
    insertProgress.run(player.id, second.city.cityId, 'sign', sign.key, currentTime++);
  }
  for (const point of second.interior.points) {
    insertProgress.run(player.id, second.city.cityId, 'location', point.key, currentTime++);
  }
  for (const scrap of second.interior.scraps) {
    insertProgress.run(player.id, second.city.cityId, 'scrap', scrap.key, currentTime++);
  }
  store.database.prepare(`
    INSERT INTO city_exploration
      (player_id, city_id, x, y, steps, last_encounter_step, updated_at)
    VALUES (?, ?, ?, ?, 0, 0, ?)
  `).run(player.id, second.city.cityId, finalSign.x, finalSign.y, currentTime++);
  const secondCompletion = store.readCityExplorationSign(
    player.id, finalSign.key, currentTime++
  );
  assert.equal(secondCompletion.stone?.id, CITY_COMPLETION_STONE.id);
  assert.equal(secondCompletion.stone?.cityId, second.city.cityId);
  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count FROM city_completion_stones WHERE player_id = ?
  `).get(player.id).count, 2);
  assert.equal(store.playerById(player.id).stoneCount, 5);
  const balance = store.database.prepare(`
    SELECT quantity FROM recycling_scraps WHERE player_id = ? AND city_id = ?
  `).get(player.id, initial.city.cityId).quantity;
  assert.equal(balance, progress.scrapsCollected
    + CITY_LOCATION_REWARD_SCRAPS + CITY_NOTICE_REWARD_SCRAPS);
  assert.equal(store.database.prepare('PRAGMA user_version').get().user_version, 142);
  store.close();
});

test('walking is persisted, adjacent-only, and encounter rewards cannot be replayed', () => {
  const store = new SqliteStore(':memory:');
  store.seedCatalog(loadLegacyCatalog());
  store.ensureWorldMaps();
  const catalog = store.loadCatalog();
  const player = store.addPlayer(createPlayer(
    'Street Delver', '', 'hash', catalog, 1000, () => 0.5
  ));
  const initial = store.cityExploration(player.id);
  const { queue } = reachable(initial.interior);
  const target = queue.find((cell) =>
    Math.abs(cell.x - initial.position.x) + Math.abs(cell.y - initial.position.y) > 1);
  assert.throws(() => store.moveInCity(player.id, target.x, target.y), /one open street/);
  assert.throws(() => store.moveInCity(player.id, initial.position.x + 1,
    initial.position.y + 1), /one open street/);

  const previous = new Map([[`${initial.position.x},${initial.position.y}`, null]]);
  const pathQueue = [{ ...initial.position }];
  let distant = null;
  for (let index = 0; index < pathQueue.length && !distant; index += 1) {
    const current = pathQueue[index];
    const distance = (() => {
      let value = 0;
      let cursor = current;
      while (previous.get(`${cursor.x},${cursor.y}`)) {
        cursor = previous.get(`${cursor.x},${cursor.y}`);
        value += 1;
      }
      return value;
    })();
    if (distance >= 7) {
      distant = current;
      break;
    }
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const next = { x: current.x + dx, y: current.y + dy };
      const nextKey = `${next.x},${next.y}`;
      if (!isWalkable(initial.interior, next.x, next.y) || previous.has(nextKey)) continue;
      previous.set(nextKey, current);
      pathQueue.push(next);
    }
  }
  const path = [];
  for (let cursor = distant; previous.get(`${cursor.x},${cursor.y}`);
    cursor = previous.get(`${cursor.x},${cursor.y}`)) path.push(cursor);
  path.reverse();
  let movement;
  const intendedDestination = queue.at(-1);
  for (const step of path) movement = store.moveInCity(
    player.id, step.x, step.y, 2000 + path.indexOf(step), () => 0,
    intendedDestination.x, intendedDestination.y
  );
  assert.equal(movement.steps, 7);
  assert.equal(movement.pendingEncounter.key, 'ore-spill');
  assert.deepEqual(movement.pendingEncounter.destination, intendedDestination);
  assert.deepEqual(
    store.cityExploration(player.id).pendingEncounter.destination,
    intendedDestination,
    'the route must survive a refresh while the encounter is open'
  );
  assert.throws(() => store.moveInCity(player.id, path[5].x, path[5].y),
    /Resolve the street encounter/);

  const before = store.database.prepare(
    'SELECT COALESCE(quantity, 0) AS quantity FROM recycling_scraps WHERE player_id = ? AND city_id = ?'
  ).get(player.id, player.cityId)?.quantity ?? 0;
  const resolved = store.resolveCityExplorationEncounter(
    player.id, movement.pendingEncounter.id, 'salvage', 3000, () => 0
  );
  assert.equal(resolved.outcome.reward.quantity, 25);
  assert.equal(resolved.balances.scraps, before + 25);
  assert.throws(() => store.resolveCityExplorationEncounter(
    player.id, movement.pendingEncounter.id, 'salvage', 3001, () => 0
  ), /no longer waiting/);
  assert.deepEqual(store.cityExploration(player.id).position, path.at(-1));
  assert.equal(store.database.prepare(
    'SELECT COUNT(*) AS count FROM city_exploration_encounters WHERE player_id = ?'
  ).get(player.id).count, 1);
  store.close();
});

test('the authenticated city page exposes a centered mouse-driven street plan', async (t) => {
  const store = new SqliteStore(':memory:');
  store.seedCatalog(loadLegacyCatalog());
  const catalog = store.loadCatalog();
  const password = 'street maze password';
  const player = store.addPlayer(createPlayer(
    'Canvas Walker', '', hashPassword(password), catalog, 1000, () => 0.5
  ));
  store.database.prepare('UPDATE players SET email_verified_at = 1 WHERE id = ?').run(player.id);
  const server = createApp({ store, now: () => 5000, random: () => 0.99 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
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
  const page = await fetch(`${base}/explore`, { headers: { cookie } });
  const html = await page.text();
  assert.equal(page.status, 200);
  assert.match(html, /Walk Tzolk&#39;in/);
  assert.match(html, /id="city-explore-map"/);
  assert.match(html, /id="city-sign-dialog"/);
  assert.match(html, /id="city-encounter-dialog"/);
  assert.match(html, /id="city-street-burst"/);
  assert.match(html, /\/node\/city-explore\.js/);
  assert.match(html, /Vehicle departure area/);
  assert.match(html, /Your home/);
  assert.match(html, /The Bar/);
  assert.match(html, /id="city-explore-notices">0\/8/);
  assert.match(html, /id="city-explore-scraps">0\/96/);
  assert.match(html, /id="city-explore-power">Dormant/);
  assert.match(html, /Young Dwarves’ Park/);
  assert.match(html, /Charged Ore core/);
  const barPage = await fetch(`${base}/explore/bar`, { headers: { cookie } });
  const barHtml = await barPage.text();
  assert.equal(barPage.status, 200);
  assert.match(barHtml, /The Tzolk&#39;in Bar/);
  assert.match(barHtml, /Private local conversation/);
  assert.match(barHtml, /Presence is the lock/);
  assert.match(barHtml, /\/node\/bar-chat\.js/);
  const barData = JSON.parse(barHtml.match(
    /<script id="bar-chat-data" type="application\/json">([^<]+)<\/script>/
  )[1]);
  const spoken = await fetch(`${base}/api/bar/messages`, {
    method: 'POST', headers: {
      cookie, 'content-type': 'application/json', accept: 'application/json'
    }, body: JSON.stringify({ visitToken: barData.visitToken, body: 'Table for two.' })
  });
  assert.equal(spoken.status, 200);
  assert.equal((await spoken.json()).message.body, 'Table for two.');
  const heard = await fetch(`${base}/api/bar?visitToken=${encodeURIComponent(
    barData.visitToken
  )}&afterId=0`, { headers: { cookie, accept: 'application/json' } });
  const heardJson = await heard.json();
  assert.equal(heard.status, 200);
  assert.deepEqual(heardJson.messages.map((message) => message.body), ['Table for two.']);
  assert.equal(store.database.prepare('SELECT COUNT(*) AS count FROM chats').get().count, 0);
  // A second tab using the same login must not evict this active bar visit merely by
  // requesting some other page.
  await fetch(`${base}/explore`, { headers: { cookie } });
  const afterUnrelatedRequest = await fetch(`${base}/api/bar?visitToken=${encodeURIComponent(
    barData.visitToken
  )}`, { headers: { cookie, accept: 'application/json' } });
  assert.equal(afterUnrelatedRequest.status, 200);
  // Navigating away from the bar itself still closes the room immediately.
  await fetch(`${base}/explore`, {
    headers: { cookie, referer: `${base}/explore/bar` }
  });
  const outside = await fetch(`${base}/api/bar?visitToken=${encodeURIComponent(
    barData.visitToken
  )}`, { headers: { cookie, accept: 'application/json' } });
  assert.equal(outside.status, 409);
  store.database.prepare(`
    INSERT INTO city_exploration_progress
      (player_id, city_id, progress_type, entry_key, completed_at)
    VALUES (?, ?, 'location', 'player-home', 4999)
  `).run(player.id, player.cityId);
  const homePage = await fetch(`${base}/explore/home`, { headers: { cookie } });
  const homeHtml = await homePage.text();
  assert.equal(homePage.status, 200);
  assert.match(homeHtml, /The Homed Stone is cleared/);
  assert.equal(store.stonesForPlayer(player.id).earned.some(
    (stone) => stone.id === HOME_STONE.id
  ), true);
  assert.match(homeHtml, /Council-standard dwelling/);
  assert.match(homeHtml, /Access your things/);
  assert.match(homeHtml, /class="home-mail-terminal" href="\/messages"/);
  assert.match(homeHtml, /Your private correspondence/);
  assert.match(homeHtml, /id="home-dream-open"[^>]*>Lie down and dream/);
  assert.match(homeHtml, /id="home-dream-dialog"/);
  assert.match(homeHtml, /dreams in Legendary/);
  assert.match(homeHtml, /src="\/node\/home\/bed\.svg"/);
  assert.match(homeHtml, /src="\/node\/home\/bed-dream\.svg"/);
  assert.doesNotMatch(homeHtml, /home-bed-mattress|home-bed-quilt|home-bed-footboard/);
  assert.equal((homeHtml.match(/data-dream-slot/gu) ?? []).length, 8);
  assert.match(homeHtml, /id="home-dream-data" type="application\/json"/);
  assert.match(homeHtml, /\/node\/home-dream\.js/);
  assert.match(homeHtml, /Dwelling market · Coming soon/);
  for (const [path, title] of [
    ['/node/home/bed.svg', 'Council-standard wooden bed'],
    ['/node/home/bed-dream.svg', 'A miner sleeping in a Council-standard bed']
  ]) {
    const bedArt = await fetch(`${base}${path}`);
    assert.equal(bedArt.status, 200);
    assert.match(bedArt.headers.get('content-type'), /image\/svg\+xml/u);
    const bedSvg = await bedArt.text();
    assert.match(bedSvg, new RegExp(`<title id="title">${title}</title>`));
    assert.match(bedSvg, /viewBox="0 0 720 300"/u);
  }
  for (const [path, title] of [
    ['/explore/departures', 'Vehicle departure area'],
    ['/explore/harbour', 'Harbour'],
    ['/explore/airfield', 'Airfield']
  ]) {
    const facility = await fetch(`${base}${path}`, { headers: { cookie } });
    const facilityHtml = await facility.text();
    assert.equal(facility.status, 200);
    assert.match(facilityHtml, new RegExp(`<h1>${title}</h1>`));
    assert.match(facilityHtml, /Live board/);
    assert.match(facilityHtml, /Return to the streets/);
  }
  for (const [path, expected] of [
    ['/explore/park', /Young Dwarves playing/],
    ['/explore/landmark', /One of one/]
  ]) {
    const civicPlace = await fetch(`${base}${path}`, { headers: { cookie } });
    const civicHtml = await civicPlace.text();
    assert.equal(civicPlace.status, 200);
    assert.match(civicHtml, expected);
    assert.match(civicHtml, /Return to the streets/);
    if (path === '/explore/park') {
      assert.match(civicHtml,
        /<svg class="dwarf-park-art dwarf-park-art-[a-z]+"[^>]+role="img"/u);
      assert.equal((civicHtml.match(/data-tendency=/gu) ?? []).length, 6);
      assert.match(civicHtml, /The nursery of future public hazards/u);
      assert.match(civicHtml, /CHOMP![\s\S]*YOINK![\s\S]*THWACK![\s\S]*PING!/u);
      assert.doesNotMatch(civicHtml, /class="park-young-dwarf/u);
    } else {
      assert.match(civicHtml,
        /<svg class="city-landmark-art city-landmark-art-[a-z]+"[^>]+role="img"/u);
      assert.match(civicHtml, /data-architectural-form="[a-z-]+"/u);
      assert.ok((civicHtml.match(/<(?:path|circle|ellipse)\b/gu) ?? []).length >= 35);
      assert.doesNotMatch(civicHtml, /class="landmark-structure"/u);
    }
  }
  const script = await fetch(`${base}/node/city-explore.js`);
  assert.equal(script.status, 200);
  const source = await script.text();
  assert.match(source, /canvas\.addEventListener\('click'/);
  assert.match(source, /showSign\(sign\)/);
  assert.match(source, /postJson\('\/explore\/sign'/);
  assert.match(source, /sign\.y === y && !readSigns\.has\(sign\.key\)/,
    'read notices must disappear from the street plan and its interactions');
  assert.doesNotMatch(source, /Read again|Notice read/);
  assert.match(source, /Picked up \$\{result\.pickup\.label\}/);
  const dreamScript = await fetch(`${base}/node/home-dream.js`);
  assert.equal(dreamScript.status, 200);
  const dreamSource = await dreamScript.text();
  assert.match(dreamSource, /dialog\.showModal\(\)/);
  assert.match(dreamSource, /setInterval\(changeThing, 2200\)/);
  const barScript = await fetch(`${base}/node/bar-chat.js`);
  assert.equal(barScript.status, 200);
  const barSource = await barScript.text();
  assert.match(barSource, /setInterval\(refresh, 5000\)/);
  assert.match(barSource, /\/api\/bar\/messages/);
  assert.match(source, /drawStreetCharacter/);
  assert.match(source, /drawRoof/);
  assert.match(source, /drawStreetActor/);
  assert.match(source, /powerUpAt/);
  assert.match(source, /result\.powerUntilStep/);
  assert.match(source, /showStreetEvents/);
  assert.match(source, /streetBurstDisplayMs = 2600/);
  assert.match(source, /destinationX: journeyTarget\.x/);
  assert.match(source, /encounterDialog\.addEventListener\('close', resumeJourney\)/);
  assert.doesNotMatch(source, /keydown/);
  const liveUpdates = await (await fetch(`${base}/node/live-updates.js`)).text();
  assert.match(liveUpdates, /casino\|oil-field\|explore/,
    'live reconciliation must not replace an active encounter dialog');
  const explorerCss = fs.readFileSync('public/app.css', 'utf8');
  assert.match(explorerCss, /The street plan keeps the miner fixed/);
  assert.match(explorerCss, /\.city-street-burst::before[^}]+clip-path:/u,
    'the burst silhouette should live behind its content so it cannot clip text');
  assert.doesNotMatch(explorerCss, /\.city-street-burst \{[^}]+clip-path:/u,
    'the popup itself must not clip long messages');
  assert.match(explorerCss, /\.city-street-burst span \{[^}]+overflow-wrap: anywhere/u);
});
