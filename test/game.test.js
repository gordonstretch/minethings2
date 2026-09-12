import assert from 'node:assert/strict';
import test from 'node:test';
import {
  activeMineLimit, assignRobot, claimMine, createPlayer, detonateExplosive, equipMine,
  expireRentalMines, findItem, mineBucketsPerHour, mineIntervalMs, oilMineBot, prioritizeMine, rentMine,
  mineRentalOffers, mineShiftAt, refreshMineActivity, sellItem, setMineMode,
  synchronizeMineSchedules, updateMineShiftRoster,
  unassignRobot, unequipMine
} from '../src/game.js';
import { loadLegacyCatalog } from '../src/legacy-catalog.js';

const catalog = loadLegacyCatalog();
const FIND_INTERVAL_MS = catalog.settings.find_interval_ms;
const predictableRandom = () => 0.5;

test('fails when authoritative catalog settings are missing instead of using code defaults', () => {
  const incomplete = { ...catalog, settings: { ...catalog.settings } };
  delete incomplete.settings.starter_credits;
  assert.throws(() => createPlayer('No Defaults', '', 'hash', incomplete, 1000, predictableRandom),
    /Missing catalog setting: starter_credits/);
});

test('finds the highest configured rarity when a mine has nothing at the standard minimum', () => {
  const ore = { id: 999, rarity: 0 };
  const oreOnlyCatalog = {
    ...catalog,
    byMineType: new Map([[999, new Map([[0, [ore]]])]]),
    settings: { ...catalog.settings, standard_find_min_rarity: 1 }
  };

  assert.equal(findItem(oreOnlyCatalog, 999, predictableRandom), ore);
});

test('creates a miner with a starter mine and five finds', () => {
  const player = createPlayer('Ada', '', 'hash', catalog, 1000, predictableRandom);
  assert.equal(player.gold, 5);
  assert.equal(player.mines.length, 1);
  assert.equal(player.discoveries.length, 5);
  assert.equal(Object.values(player.inventory).reduce((total, count) => total + count, 0), 5);
});

test('creates miners with the live default specialisation', () => {
  const liveCatalog = { ...catalog, settings: { ...catalog.settings, default_specialisation_id: 2 } };
  const player = createPlayer('Live Default', '', 'hash', liveCatalog, 1000, predictableRandom);
  assert.equal(player.profession, 2);
});

test('collects timed findings and persists them in inventory', () => {
  const player = createPlayer('Ada', '', 'hash', catalog, 1000, predictableRandom);
  const result = claimMine(player, catalog, 1, 1000 + FIND_INTERVAL_MS, predictableRandom);
  assert.equal(result.finds.length, 1);
  assert.equal(player.discoveries.length, 6);
  assert.throws(() => claimMine(player, catalog, 1, 1000 + FIND_INTERVAL_MS, predictableRandom), /still digging/);
  player.batteryExpiresAt = 1000;
  assert.throws(() => claimMine(player, catalog, 1, 1001 + FIND_INTERVAL_MS, predictableRandom), /battery/);
});

test('occasionally captures a Dwarf while mining and keeps it in the mine city', () => {
  const eventCatalog = {
    ...catalog,
    settings: { ...catalog.settings, mining_dwarf_capture_chance: 1 }
  };
  const player = createPlayer('Dwarf Catcher', '', 'hash', eventCatalog, 1000, predictableRandom);
  const result = claimMine(
    player, eventCatalog, 1, 1000 + FIND_INTERVAL_MS, predictableRandom
  );
  assert.ok(result.capturedDwarf);
  assert.equal(eventCatalog.dwarfByItemId.has(result.capturedDwarf.itemId), true);
  assert.equal(player.inventoryByCity[player.cityId][result.capturedDwarf.itemId], 1);
  assert.equal(result.capturedDwarf.recycled, false);
});

test('auto-recycles a naturally found copy even when factories can make the same item type', () => {
  const player = createPlayer('Ada', '', 'hash', catalog, 1000, predictableRandom);
  const itemId = player.discoveries[0].itemId;
  const before = player.inventory[itemId];
  player.recycleItemIds = [itemId];

  const result = claimMine(player, catalog, 1, 1000 + FIND_INTERVAL_MS, predictableRandom);

  assert.equal(result.finds.length, 1);
  assert.equal(result.finds[0].itemId, itemId);
  assert.equal(result.finds[0].recycled, true);
  assert.equal(player.inventory[itemId], before);
  assert.equal(player.oreScrapsByCity[player.cityId],
    Number(catalog.settings.recycling_scraps_by_rarity[catalog.byId.get(itemId).rarity]));
});

test('holds mine findings while the player is over its configured inventory limit', () => {
  const player = createPlayer('Packed Miner', '', 'hash', catalog, 1000, predictableRandom);
  player.itemCount = 51;
  player.itemLimit = 50;
  const nextFindAt = player.mines[0].nextFindAt;
  assert.throws(() => claimMine(player, catalog, 1, nextFindAt, predictableRandom),
    /Reduce your inventory/);
  assert.equal(player.mines[0].nextFindAt, nextFindAt);
});

test('switches a mine from things to legacy-style gold production', () => {
  const player = createPlayer('Ada', '', 'hash', catalog, 1000, predictableRandom);
  player.profession = 1;
  setMineMode(player, 1, false);
  const result = claimMine(player, catalog, 1, 1000 + FIND_INTERVAL_MS, predictableRandom);
  assert.equal(result.gold, 3);
  assert.equal(result.finds.length, 0);
  assert.equal(player.gold, 8);
});

test('switches any mine to crypto production without using inventory capacity', () => {
  const player = createPlayer('Crypto Ada', '', 'hash', catalog, 1000, predictableRandom);
  setMineMode(player, 1, 'crypto', 1);
  const result = claimMine(player, catalog, 1, 1000 + FIND_INTERVAL_MS, predictableRandom);
  assert.deepEqual(result.crypto, { cryptoTypeId: 1, quantity: 1 });
  assert.equal(player.cryptoBalances[1], 1);
  assert.equal(result.finds.length, 0);
});

test('sells discoveries and rents affordable mines', () => {
  const player = createPlayer('Ada', '', 'hash', catalog, 1000, predictableRandom);
  const itemId = Number(Object.keys(player.inventory)[0]);
  const oldCredits = player.credits;
  const value = sellItem(player, catalog, itemId);
  assert.equal(player.credits, oldCredits + value);
  player.credits = 1000;
  const mine = rentMine(player, catalog, 4, 1000, predictableRandom);
  assert.equal(mine.mineTypeId, 4);
  assert.equal(player.mines.length, 2);
  assert.equal(player.credits, 991);
});

test('only rents mine types offered by the current city', () => {
  const player = createPlayer('City Shopper', '', 'hash', catalog, 1000, predictableRandom);
  player.credits = 10000;
  assert.throws(() => rentMine(player, catalog, 5, 1000, predictableRandom), /not available in this city/);

  player.cityId = 3;
  const mine = rentMine(player, catalog, 5, 2000, predictableRandom);
  assert.equal(mine.cityId, 3);
  assert.equal(mine.mineTypeId, 5);
});

test('prioritizes the active mine set and oils a bot for five days', () => {
  const player = createPlayer('Ada', '', 'hash', catalog, 1000, predictableRandom);
  const mineType = catalog.mineTypes.find((entry) => entry.rentCost > 0 && catalog.byMineType.has(entry.id));
  player.credits = mineType.rentCost * 4;
  rentMine(player, catalog, mineType.id, 2000, predictableRandom);
  rentMine(player, catalog, mineType.id, 3000, predictableRandom);
  const fourth = rentMine(player, catalog, mineType.id, 4000, predictableRandom);
  assert.equal(fourth.active, false);

  prioritizeMine(player, catalog, fourth.id, 5000);
  assert.equal(fourth.priority, 1);
  assert.equal(fourth.active, true);
  assert.equal(player.mines.filter((mine) => mine.active).length, 3);

  const oil = catalog.items.find((item) => item.name === 'Oil');
  player.inventoryByCity[player.cityId][oil.id] = 1;
  const before = mineBucketsPerHour(catalog, fourth, player, 5000);
  oilMineBot(player, catalog, fourth.id, 5000);
  assert.equal(mineBucketsPerHour(catalog, fourth, player, 5000), before + 10);
  assert.equal(fourth.oilExpiresAt, 5000 + 5 * 24 * 60 * 60 * 1000);
  assert.equal(player.inventoryByCity[player.cityId][oil.id], undefined);
});

test('allows three active mines per discovered region and four with Remote Control', () => {
  const homeCities = catalog.cities.map((city) => ({ ...city, mapId: 1 }));
  const remoteCity = { ...homeCities[0], id: 999, mapId: 2, name: 'Test frontier' };
  const regionalCatalog = { ...catalog, cities: [...homeCities, remoteCity] };
  const player = createPlayer(
    'Regional Miner', '', 'hash', regionalCatalog, 1000, predictableRandom
  );
  const mineType = regionalCatalog.mineTypes.find(
    (entry) => entry.rentCost > 0 && regionalCatalog.byMineType.has(entry.id)
  );
  assert.ok(mineType);
  player.knownCityIds = [player.cityId, remoteCity.id];
  player.credits = mineType.rentCost * 10;

  for (let index = 0; index < 6; index += 1) {
    rentMine(player, regionalCatalog, mineType.id, 2000 + index, predictableRandom);
  }
  assert.equal(activeMineLimit(player, regionalCatalog, 3000), 6);
  assert.equal(player.mines.filter((mine) => mine.active).length, 6);

  player.gadgets = [{ behaviorKey: 'control', expiresAt: 10000 }];
  prioritizeMine(player, regionalCatalog, player.mines.at(-1).id, 3000);
  assert.equal(activeMineLimit(player, regionalCatalog, 3000), 8);
  assert.equal(player.mines.filter((mine) => mine.active).length, 7);
  rentMine(player, regionalCatalog, mineType.id, 3001, predictableRandom);
  const ninth = rentMine(player, regionalCatalog, mineType.id, 3002, predictableRandom);
  assert.equal(player.mines.filter((mine) => mine.active).length, 8);
  assert.equal(ninth.active, false);
});

test('runs a global three-shift mine roster without exceeding the active allowance', () => {
  const player = createPlayer('Shift Foreman', '', 'hash', catalog,
    Date.parse('2026-09-12T00:00:00.000Z'), predictableRandom);
  const mineType = catalog.mineTypes.find(
    (entry) => entry.rentCost > 0 && catalog.byMineType.has(entry.id)
  );
  player.credits = mineType.rentCost * 10;
  for (let index = 0; index < 4; index += 1) {
    rentMine(player, catalog, mineType.id,
      Date.parse('2026-09-12T00:01:00.000Z') + index, predictableRandom);
  }
  const [first, second, third, fourth, fifth] = player.mines;
  const order = player.mines.map((mine) => mine.id);
  const masks = new Map([
    [first.id, 0b001], [second.id, 0b111], [third.id, 0b111],
    [fourth.id, 0b111], [fifth.id, 0b111]
  ]);
  const night = Date.parse('2026-09-12T01:00:00.000Z');
  const day = Date.parse('2026-09-12T09:00:00.000Z');
  assert.equal(mineShiftAt(night).index, 0);
  assert.equal(mineShiftAt(day).index, 1);
  updateMineShiftRoster(player, catalog, order, masks, night);
  assert.deepEqual(player.mines.filter((mine) => mine.active).map((mine) => mine.id),
    [first.id, second.id, third.id]);
  assert.equal(player.mines.filter((mine) => mine.active).length, 3);

  refreshMineActivity(player, catalog, day);
  assert.deepEqual(player.mines.filter((mine) => mine.active).map((mine) => mine.id),
    [second.id, third.id, fourth.id]);
  assert.equal(player.mines.filter((mine) => mine.active).length, 3);

  updateMineShiftRoster(player, catalog,
    [fifth.id, first.id, second.id, third.id, fourth.id], masks, day);
  assert.deepEqual(player.mines.filter((mine) => mine.active).map((mine) => mine.id),
    [fifth.id, second.id, third.id]);
  assert.equal(player.mines.filter((mine) => mine.active).length, 3);
});

test('adds each cleared-stone bonus to the top mine in every regional home city', () => {
  const homeCities = catalog.cities.map((city) => ({ ...city, mapId: 1 }));
  const remoteCapital = { ...homeCities[0], id: 999, mapId: 2, name: 'Remote capital' };
  const remoteOutpost = { ...homeCities[1], id: 1000, mapId: 2, name: 'Remote outpost' };
  const regionalCatalog = {
    ...catalog,
    cities: [...homeCities, remoteCapital, remoteOutpost],
    maps: [
      { id: 1, capitalCityId: catalog.settings.starter_city_id },
      { id: 2, capitalCityId: remoteCapital.id }
    ]
  };
  const player = createPlayer(
    'Stone Miner', '', 'hash', regionalCatalog, 1000, predictableRandom
  );
  const before = mineBucketsPerHour(regionalCatalog, player.mines[0], player, 1000);
  player.stoneCount = 4;
  assert.equal(mineBucketsPerHour(regionalCatalog, player.mines[0], player, 1000),
    before + 2);
  const remoteHomeMine = {
    ...structuredClone(player.mines[0]), id: 2,
    cityId: remoteCapital.id, priority: 2
  };
  const remoteOutpostMine = {
    ...structuredClone(player.mines[0]), id: 3, cityId: remoteOutpost.id, priority: 3
  };
  const secondRemoteHomeMine = {
    ...structuredClone(player.mines[0]), id: 4,
    cityId: remoteCapital.id, priority: 4
  };
  player.mines.push(remoteHomeMine, remoteOutpostMine, secondRemoteHomeMine);
  player.stoneCount = 0;
  const remoteHomeBase = mineBucketsPerHour(regionalCatalog, remoteHomeMine, player, 1000);
  const remoteOutpostBase = mineBucketsPerHour(
    regionalCatalog, remoteOutpostMine, player, 1000
  );
  const secondRemoteHomeBase = mineBucketsPerHour(
    regionalCatalog, secondRemoteHomeMine, player, 1000
  );
  player.stoneCount = 4;
  assert.equal(mineBucketsPerHour(regionalCatalog, remoteHomeMine, player, 1000),
    remoteHomeBase + 2);
  assert.equal(mineBucketsPerHour(regionalCatalog, remoteOutpostMine, player, 1000),
    remoteOutpostBase);
  assert.equal(mineBucketsPerHour(regionalCatalog, secondRemoteHomeMine, player, 1000),
    secondRemoteHomeBase, 'only the top mine in a regional home city receives the bonus');
  player.homeCityId = 2;
  assert.equal(mineBucketsPerHour(regionalCatalog, player.mines[0], player, 1000), before + 2,
    'the obsolete single-home field cannot remove a regional-capital bonus');
});

test('offers progressively cheaper mine rentals and expires them', () => {
  const player = createPlayer('Ada', '', 'hash', catalog, 1000, predictableRandom);
  const type = catalog.mineTypes.find((entry) => entry.rentCost > 0
    && catalog.byMineType.has(entry.id));
  const offers = mineRentalOffers(catalog, type);
  assert.deepEqual(offers.map(({ key, label, priceCredits }) => ({ key, label, priceCredits })), [
    { key: 'fortnight', label: '2 weeks', priceCredits: type.rentCost },
    { key: 'quarter', label: '3 months', priceCredits: type.rentCost * 5 },
    { key: 'year', label: '1 year', priceCredits: type.rentCost * 18 }
  ]);
  assert.ok(offers[0].priceCredits / offers[0].durationMs
    > offers[1].priceCredits / offers[1].durationMs);
  assert.ok(offers[1].priceCredits / offers[1].durationMs
    > offers[2].priceCredits / offers[2].durationMs);
  player.credits = offers[1].priceCredits;
  const rental = rentMine(player, catalog, type.id, 3000, predictableRandom,
    { termKey: 'quarter' });
  assert.equal(rental.rentalUntil, 3000 + 90 * 24 * 60 * 60 * 1000);
  assert.equal(player.credits, 0);
  assert.equal(expireRentalMines(player, rental.rentalUntil), 2);
  assert.equal(player.mines.length, 0);
});

test('equips original mining gear and robots from city inventory', () => {
  const player = createPlayer('Ada', '', 'hash', catalog, 1000, predictableRandom);
  player.inventory[51] = 1;
  player.inventory[340] = 1;
  equipMine(player, catalog, 1, 51);
  assignRobot(player, catalog, 1, 340);
  assert.equal(player.mines[0].equipment[4], 51);
  assert.equal(player.mines[0].robotItemId, 340);
  assert.equal(mineBucketsPerHour(catalog, player.mines[0]), 31);
  assert.ok(mineIntervalMs(catalog, player.mines[0]) < FIND_INTERVAL_MS);
  player.gadgets = [{ behaviorKey: 'hammer', expiresAt: 10000 }];
  assert.equal(mineBucketsPerHour(catalog, player.mines[0], player, 2000), 31.25);
  assert.equal(player.inventory[51], undefined);
  assert.equal(player.inventory[340], undefined);
  unequipMine(player, catalog, 1, 4);
  unassignRobot(player, catalog, 1);
  assert.equal(player.inventory[51], 1);
  assert.equal(player.inventory[340], 1);
});

test('rebases the remaining mine cycle when its production rate changes', () => {
  const now = 10_000;
  const player = createPlayer('Rate Keeper', '', 'hash', catalog, 1000, predictableRandom);
  const mine = player.mines[0];
  const oldInterval = mine.cycleIntervalMs;
  mine.nextFindAt = now + Math.round(oldInterval / 2);
  player.inventoryByCity[player.cityId][51] = 1;

  equipMine(player, catalog, mine.id, 51, now);

  const fasterInterval = mineIntervalMs(catalog, mine, player, now);
  assert.equal(mine.cycleIntervalMs, fasterInterval);
  assert.equal(mine.nextFindAt - now, Math.round(fasterInterval / 2));

  player.stoneCount = 2;
  const beforeStone = mine.nextFindAt;
  const beforeStoneInterval = mine.cycleIntervalMs;
  synchronizeMineSchedules(player, catalog, now);
  const stoneInterval = mineIntervalMs(catalog, mine, player, now);
  assert.equal(mine.nextFindAt - now,
    Math.round((beforeStone - now) * stoneInterval / beforeStoneInterval));
});

test('starts newly rented mines on their actual production interval', () => {
  const now = 20_000;
  const player = createPlayer('Fast Buyer', '', 'hash', catalog, 1000, predictableRandom);
  player.botPartIds = catalog.botParts.slice(0, 4).map((part) => part.id);
  player.credits = 10_000;
  const mineType = catalog.mineTypes.find((entry) =>
    entry.rentCost > 0 && catalog.byMineType.has(entry.id)
      && catalog.mineTypesByCity.get(player.cityId).some((offered) => offered.id === entry.id));

  const mine = rentMine(player, catalog, mineType.id, now, predictableRandom);
  const interval = mineIntervalMs(catalog, mine, player, now);

  assert.equal(mine.cycleIntervalMs, interval);
  assert.equal(mine.nextFindAt, now + interval);
  assert.ok(interval < FIND_INTERVAL_MS);
});

test('detonates legacy explosives for immediate mine output', () => {
  const player = createPlayer('Ada', '', 'hash', catalog, 1000, predictableRandom);
  player.inventory[277] = 1;
  const before = player.discoveries.length;
  const result = detonateExplosive(player, catalog, 1, 277, 1, 2000, predictableRandom);
  assert.equal(result.outputCount, 1);
  assert.equal(result.finds.length, 1);
  assert.equal(result.finds[0].exploded, true);
  assert.equal(player.discoveries.length, before + 1);
  assert.equal(player.inventory[277], undefined);
});
