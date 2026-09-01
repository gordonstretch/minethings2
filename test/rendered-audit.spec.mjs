import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createPlayer } from '../src/game.js';
import { loadLegacyCatalog } from '../src/legacy-catalog.js';
import { createApp } from '../src/server.js';
import { hashPassword, SqliteStore } from '../src/store.js';

const catalog = loadLegacyCatalog();
const password = 'rendered audit password';
const oilRackDescription = 'Database item description for the Flower deployment bomb.';
let directory;
let databaseFile;
let server;
let base;
let vehicleId;
let shipVehicleId;
let battleId;
let detailItemId;
let traderListingItemId;
let recyclableItemName;
let bountyMessageId;
let occasionPlayerId;
let occasionItem;
let visualMapId;
let visualCapitalCityId;
let oilDirectionalMachineName;

function addVehicle(store, player, vehicleType) {
  player.inventory[vehicleType.itemId] = 1;
  store.savePlayer(player);
  return store.activateVehicle(player.id, vehicleType.itemId);
}

test.beforeAll(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-rendered-'));
  databaseFile = path.join(directory, 'audit.sqlite');
  const store = new SqliteStore(databaseFile);
  store.seedCatalog(catalog);
  const tooltipMachine = catalog.machines.find((machine) => machine.type === 'flower');
  store.database.prepare('UPDATE catalog_items SET description = ? WHERE id = ?')
    .run(oilRackDescription, tooltipMachine.itemId);
  const landVehicle = catalog.vehicles.find((vehicle) => vehicle.routeType === 0
    && vehicle.land?.attack > 0 && vehicle.land?.armor > 0 && catalog.byId.get(vehicle.itemId)?.rarity >= 4
    && catalog.routes.some((route) => route.open && route.type === 0
      && route.city1Id !== route.city2Id && (route.city1Id === 1 || route.city2Id === 1)));

  const visual = store.addPlayer(createPlayer('VisualAudit', '', hashPassword(password), catalog, 1000, () => 0.5));
  visual.profession = 1;
  visual.credits = 1000;
  const mod = catalog.mods.find((entry) => catalog.byId.get(entry.itemId)?.rarity === 1);
  const weapon = catalog.weapons.find((entry) => catalog.byId.get(entry.itemId)?.rarity === 1);
  const cargo = catalog.items.find((item) => item.rarity === 4 && !catalog.vehicleByItemId.has(item.id));
  detailItemId = cargo.id;
  visual.inventory[mod.itemId] = 1;
  visual.inventory[weapon.itemId] = 1;
  visual.inventory[cargo.id] = 2;
  const ammoBox = catalog.boxes[0];
  visual.inventory[ammoBox.itemId] = 1;
  store.savePlayer(visual);
  vehicleId = addVehicle(store, visual, landVehicle);
  const ghostFleet = store.addPlayer(createPlayer(
    'Visual Ghost Fleet', '', hashPassword(password), catalog, 1000, () => 0.5
  ));
  addVehicle(store, ghostFleet, landVehicle);
  store.database.prepare('UPDATE players SET is_npc = 1 WHERE id = ?').run(ghostFleet.id);
  store.fitVehicleLoadout(visual.id, vehicleId, [mod.id], [weapon.id]);
  store.setVehicleCargo(visual.id, vehicleId, { [cargo.id]: 1 });
  const shipType = catalog.vehicles.find((vehicle) => vehicle.ship?.cannonPortals > 0);
  const shipRarities = catalog.settings.arms_rarities_by_vehicle_rarity[
    catalog.byId.get(shipType.itemId).rarity
  ];
  const cannon = catalog.cannons.find((entry) =>
    shipRarities.includes(catalog.byId.get(entry.itemId).rarity));
  const ammunition = catalog.cannonballs[0];
  const shipOwner = store.playerById(visual.id);
  shipOwner.inventory[shipType.itemId] = 1;
  shipOwner.inventory[cannon.itemId] = 2;
  shipOwner.inventory[ammunition.itemId] = 2;
  shipOwner.inventory[Number(catalog.settings.block_and_tackle_item_id)] = 1;
  store.savePlayer(shipOwner);
  shipVehicleId = store.activateVehicle(visual.id, shipType.itemId);
  store.attachShipCannon(visual.id, shipVehicleId, cannon.id);
  store.loadShipAmmo(visual.id, shipVehicleId, ammunition.type);
  const avatarPicks = [1, 19, 37].map((id) => catalog.avatarElements.find((element) => element.id === id));
  const withAvatarItems = store.playerById(visual.id);
  for (const pick of avatarPicks) withAvatarItems.inventory[pick.itemId] = 1;
  for (const tier of catalog.dwarfTiers) withAvatarItems.inventory[tier.itemId] = 1;
  store.savePlayer(withAvatarItems);
  store.saveAvatar(visual.id, avatarPicks.map((pick) => pick.id), catalog.avatarElements.map((element) => ({
    ...element, rarity: catalog.byId.get(element.itemId)?.rarity ?? 0
  })));

  const trader = store.addPlayer(createPlayer('RenderTrader', '', hashPassword(password), catalog, 1000, () => 0.5));
  trader.profession = 1;
  traderListingItemId = Number(Object.keys(trader.inventory)[0]);
  store.savePlayer(trader);
  store.placeSellOrder(trader.id, traderListingItemId,
    store.marketForItem(traderListingItemId, trader.cityId).listingStartPrice, 1, 1400);
  store.sendMessage(trader.id, 'VisualAudit', 'Rendered inbox audit message', Date.now());
  const bountyPools = [6, 5, 4, 3, 2, 1, 0].map((rarity) =>
    catalog.items.filter((item) => item.canFind && item.repairedItemId === null
      && item.rarity === rarity).sort((first, second) => first.name.localeCompare(second.name)));
  const bountyItems = [];
  while (bountyItems.length < 37 && bountyPools.some((pool) => pool.length)) {
    for (const pool of bountyPools) if (pool.length && bountyItems.length < 37) bountyItems.push(pool.shift());
  }
  const bounty = bountyItems.map((item) => ({
      itemId: item.id, name: item.name, rarity: item.rarity, quantity: 1
    }));
  const bountyText = bounty.map((item) => `1× ${item.name}`).join(', ');
  bountyMessageId = Number(store.database.prepare(`
    INSERT INTO messages
      (sender_id, recipient_id, message_type, subject, body, details_json, is_read, created_at)
    VALUES (NULL, ?, 'Vehicle', 'Kraken defeated', ?, ?, 1, ?)
  `).run(visual.id,
    `Your Krakenbreaker dealt 244 damage to the Kraken and took 24 damage. You defeated it. The remaining 37 cargo slots were filled with bounty: ${bountyText}.`,
    JSON.stringify({
      event: 'world-creature-combat', defeated: true, rewards: bounty,
      creatureName: 'Legendary Kraken', vehicleName: 'Krakenbreaker',
      damage: 244, counterDamage: 24, hp: 0,
      starting: { creatureHp: 244, creatureMaxHp: 244,
        vehicle: { hull: 80, maxHull: 80 } },
      ending: { creatureHp: 0, vehicle: { hull: 56, maxHull: 80 } },
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
      actions: [{ label: 'Manage vehicle', path: `/vehicles/${shipVehicleId}` }]
    }),
    Date.now()).lastInsertRowid);
  const robber = store.addPlayer(createPlayer('RenderRobber', '', hashPassword(password), catalog, 1000, () => 0.5));
  robber.profession = 2;
  const traderVehicle = addVehicle(store, trader, landVehicle);
  const robberVehicle = addVehicle(store, robber, landVehicle);
  const route = store.routesForVehicle(trader.id, traderVehicle, 2000)[0];
  store.sendVehicle(trader.id, traderVehicle, route.id, 2000);
  store.sendVehicle(robber.id, robberVehicle, route.id, 2000, {
    aggressiveMask: 1 << catalog.byId.get(landVehicle.itemId).rarity
  });
  const plannedBattle = store.database.prepare(`
    SELECT id, encounter_at FROM vehicle_encounters
    WHERE status = 'planned'
      AND ((vehicle1_id = ? AND vehicle2_id = ?)
        OR (vehicle1_id = ? AND vehicle2_id = ?))
    ORDER BY encounter_at, id LIMIT 1
  `).get(traderVehicle, robberVehicle, robberVehicle, traderVehicle);
  if (!plannedBattle) throw new Error('Rendered audit battle was not scheduled.');
  store.settleVehicles(plannedBattle.encounter_at);
  battleId = store.database.prepare(
    'SELECT battle_id FROM vehicle_encounters WHERE id = ?'
  ).get(plannedBattle.id)?.battle_id;
  if (!battleId) throw new Error('Rendered audit battle did not resolve.');

  const pilot = store.addPlayer(createPlayer('OilAudit', '', hashPassword(password), catalog, 1000, () => 0.5));
  const pump = catalog.machines.find((machine) => machine.type === 'pump'
    && catalog.byId.get(machine.itemId)?.rarity === 1);
  const power = catalog.machines.find((machine) => machine.type === 'power'
    && catalog.byId.get(machine.itemId)?.rarity === 1);
  oilDirectionalMachineName = catalog.byId.get(power.itemId).name;
  const flower = catalog.machines.find((machine) => machine.type === 'flower');
  const bomber = catalog.items.find((item) => item.name === 'Bomber');
  const searchPlane = catalog.items.find((item) => item.name === 'Search Plane');
  const helicopter = catalog.items.find((item) => item.name === 'Helicopter');
  pilot.profession = 10;
  pilot.cityId = 2;
  pilot.inventoryByCity[2] = {
    [pump.itemId]: 1,
    [power.itemId]: 2,
    [flower.itemId]: 1,
    [bomber.id]: 1,
    [searchPlane.id]: 1,
    [helicopter.id]: 1
  };
  pilot.inventory = pilot.inventoryByCity[2];
  store.savePlayer(pilot);
  const oilSetupTime = Date.now();
  const field = store.oilField(pilot.id, oilSetupTime);
  store.deployOilMachine(pilot.id, field.hexes.find((hex) => hex.x === 0 && hex.y === 0).id, pump.id, 0, oilSetupTime);
  store.deployOilMachine(pilot.id, field.hexes.find((hex) => hex.x === 0 && hex.y === -1).id, power.id, 0, oilSetupTime);
  const spillHex = field.hexes.find((hex) => hex.x === 2 && hex.y === 0);
  store.database.prepare('UPDATE oil_hexes SET oil_units = ? WHERE id = ?')
    .run(Number(catalog.settings.oil_spill_units) * 4, spillHex.id);

  const customer = store.addPlayer(createPlayer('RenderCustomer', '', hashPassword(password), catalog, 1000, () => 0.5));
  const fundedCustomer = store.playerById(customer.id);
  fundedCustomer.gold = 100;
  store.savePlayer(fundedCustomer);
  store.database.prepare(`
    UPDATE dwarf_state
    SET next_find_at = 2000, next_competition_at = 9999999999999,
      next_stowaway_at = 9999999999999 WHERE id = 1
  `).run();
  store.runDwarfUpdate(2000, () => 0.5);
  store.database.prepare(`
    UPDATE dwarf_state SET next_find_at = 9999999999999, next_stowaway_at = 9999999999999
    WHERE id = 1
  `).run();

  const occasion = store.addPlayer(createPlayer(
    'OccasionAudit', '', hashPassword(password), catalog, 1000, () => 0.5
  ));
  occasionPlayerId = occasion.id;
  store.updateAccount(occasion.id, { email: '', publishFindings: false, showMines: true });
  occasionItem = catalog.items.find((item) => item.canFind && item.rarity === 6);

  const recycler = store.addPlayer(createPlayer(
    'RecyclingAudit', '', hashPassword(password), catalog, 1000, () => 0.5
  ));
  const recyclable = catalog.items.find((item) => item.canFind && item.rarity > 0
    && !catalog.factoryOutputItemIds.has(item.id));
  recyclableItemName = recyclable.name;
  const protectedOutput = [...catalog.factoryOutputItemIds]
    .map((id) => catalog.byId.get(id)).find(Boolean);
  const recyclerState = store.playerById(recycler.id);
  recyclerState.gold = 20_000_000;
  recyclerState.inventory[recyclable.id] = 60;
  recyclerState.inventory[protectedOutput.id] = 1;
  recyclerState.protectedInventoryByCity ??= {};
  recyclerState.protectedInventoryByCity[recycler.cityId] ??= {};
  recyclerState.protectedInventoryByCity[recycler.cityId][protectedOutput.id] = 1;
  store.savePlayer(recyclerState);
  store.database.prepare(`
    INSERT INTO recycling_scraps (player_id, city_id, quantity) VALUES (?, ?, 1500)
  `).run(recycler.id, recycler.cityId);
  store.database.prepare(`
    INSERT INTO factories
      (owner_id, operator_id, city_id, built, factory_action_id, item_id,
       components_done, last_event_at, completion_at, rental_expires, created_at)
    VALUES (?, ?, ?, 1, NULL, NULL, 0, 1000, NULL, NULL, 1000)
  `).run(recycler.id, recycler.id, recycler.cityId);
  const responsive = store.addPlayer(createPlayer(
    'ResponsiveAudit', '', hashPassword(password), catalog, 1000, () => 0.5
  ));
  store.database.prepare('UPDATE players SET authority = 5 WHERE id = ?').run(responsive.id);
  store.addChat(trader.id, 'Quietly checking the frequency.', Date.now() - 1);
  store.addChat(responsive.id, 'The old chat colours are back.', Date.now());
  const responsiveRare = catalog.items.find((item) => item.canFind && item.rarity === 5);
  store.database.prepare(`
    INSERT INTO world_chat_announcements
      (event_key, announcement_type, body, path, created_at)
    VALUES ('rendered-rare-chat', 'rare-purple', ?, ?, ?)
  `).run(`ResponsiveAudit found a ${responsiveRare.rarityName} ${responsiveRare.name} in Tzolk'in.`,
    `/items/${responsiveRare.id}`, Date.now());
  const responsiveDwarf = catalog.dwarfByRarity.get(1);
  store.database.prepare(`
    INSERT INTO world_chat_announcements
      (event_key, announcement_type, body, path, created_at)
    VALUES ('rendered-dwarf-chat', 'dwarf-capture',
      'ResponsiveAudit captured a Yellow Dwarf while mining in Tzolk''in.', ?, ?)
  `).run(`/items/${responsiveDwarf.itemId}`, Date.now());
  store.database.prepare(`
    INSERT INTO world_chat_announcements (event_key, body, path, created_at)
    VALUES ('rendered-world-chat',
      'Kraken sighted between Kemet and Belfort, moving toward Kemet.',
      '/events', ?)
  `).run(Date.now() + 1);
  store.ensureWorldMaps(Date.now());
  const cryptoCopyState = createPlayer(
    'CryptoCopyAudit', '', hashPassword(password), store.loadCatalog(), 1000, () => 0.5
  );
  cryptoCopyState.gold = 100;
  const cryptoCopy = store.addPlayer(cryptoCopyState);
  store.database.prepare(`
    INSERT INTO player_crypto_balances (player_id, crypto_type_id, quantity)
    VALUES (?, 1, 4)
  `).run(responsive.id);
  const cryptoNow = Date.now();
  const insertCryptoSale = store.database.prepare(`
    INSERT INTO crypto_market_sales
      (buyer_id, seller_id, crypto_type_id, price_units, quantity, created_at)
    VALUES (?, ?, 1, ?, ?, ?)
  `);
  insertCryptoSale.run(cryptoCopy.id, responsive.id, 10 * 10000, 2, cryptoNow - 4000);
  insertCryptoSale.run(cryptoCopy.id, responsive.id, 12 * 10000, 3, cryptoNow - 3000);
  insertCryptoSale.run(cryptoCopy.id, responsive.id, 8 * 10000, 1, cryptoNow - 2000);
  insertCryptoSale.run(cryptoCopy.id, responsive.id, 11 * 10000, 4, cryptoNow - 1000);
  store.placeCryptoOrder(responsive.id, 1, 'sell', 12, 2, cryptoNow);
  store.placeCryptoOrder(cryptoCopy.id, 1, 'buy', 9, 3, cryptoNow + 1);
  for (const [type, routeType, rarity] of [
    ['white_whale', catalog.settings.route_type_ids.sea, 6],
    ['t_rex', catalog.settings.route_type_ids.land, 1]
  ]) {
    const eventRoute = store.database.prepare(`
      SELECT catalog_routes.id, city1.map_id AS map1_id, city2.map_id AS map2_id,
        catalog_routes.city1_id, catalog_routes.city2_id
      FROM catalog_routes
      JOIN catalog_cities AS city1 ON city1.id = catalog_routes.city1_id
      JOIN catalog_cities AS city2 ON city2.id = catalog_routes.city2_id
      WHERE catalog_routes.is_open = 1 AND catalog_routes.type = ?
        AND catalog_routes.length > 0
        AND (catalog_routes.city1_id = 1 OR catalog_routes.city2_id = 1)
      ORDER BY catalog_routes.id LIMIT 1
    `).get(routeType);
    const mapId = eventRoute.city1_id === 1 ? eventRoute.map1_id : eventRoute.map2_id;
    store.adminSpawnWorldCreature(
      responsive.id, type, mapId, eventRoute.id, Date.now() + rarity, rarity
    );
  }
  store.provisionGhostHunterFleets(Date.now() + 2);
  for (const [kind, routeType] of [['rider', catalog.settings.route_type_ids.land],
    ['ship', catalog.settings.route_type_ids.sea]]) {
    const grant = store.database.prepare(`
      SELECT * FROM ghost_hunter_grants
      WHERE player_id = ? AND route_type = ? AND rarity = 1
    `).get(responsive.id, routeType);
    const ghostRoute = store.database.prepare(`
      SELECT id FROM catalog_routes WHERE is_open = 1 AND type = ? AND length > 0
        AND (city1_id = ? OR city2_id = ?) ORDER BY id LIMIT 1
    `).get(routeType, grant.city_id, grant.city_id);
    store.adminRaiseGhost(responsive.id, kind, ghostRoute.id, 1, Date.now() + 3);
  }
  store.database.prepare('UPDATE mines SET next_find_at = 9999999999999').run();
  visualMapId = store.database.prepare(
    'SELECT map_id FROM catalog_cities WHERE id = ?'
  ).get(visual.cityId).map_id;
  const creatureRoutes = [
    ['t_rex', catalog.settings.route_type_ids.land],
    ['kraken', catalog.settings.route_type_ids.sea]
  ];
  const insertCreature = store.database.prepare(`
    INSERT INTO world_creatures
      (creature_type, rarity, map_id, route_id, location, spawn_location,
       destination_city_id, hp, max_hp, awakened_at, moved_at, rating)
    VALUES (?, 6, ?, ?, ?, ?, ?, 250, 250, ?, ?, 1600)
  `);
  for (const [creatureType, routeType] of creatureRoutes) {
    const creatureRoute = catalog.routes.find((route) => route.open
      && route.type === routeType && route.city1Id !== route.city2Id);
    const creatureMapId = store.database.prepare(
      'SELECT map_id FROM catalog_cities WHERE id = ?'
    ).get(creatureRoute.city1Id).map_id;
    const location = Number(creatureRoute.length) / 2;
    const awakenedAt = Date.now();
    insertCreature.run(creatureType, creatureMapId, creatureRoute.id,
      location, location, creatureRoute.city1Id, awakenedAt, awakenedAt);
  }
  visualCapitalCityId = store.loadCatalog().maps
    .find((map) => map.id === visualMapId)?.capitalCityId;
  const visualWeather = store.currentWeatherForMap(visualMapId, Date.now());
  store.database.prepare(`
    UPDATE world_weather_slots
    SET condition = 'snow', temperature_c = -3, wind_kph = 18, rainfall_mm = 3.5
    WHERE slot_at = ?
  `).run(visualWeather.startsAt);
  store.database.prepare(`
    UPDATE world_weather_slots
    SET condition = 'hurricane', temperature_c = 25, wind_kph = 170, rainfall_mm = 42
    WHERE map_id = ? AND slot_at = ?
  `).run(visualMapId, visualWeather.startsAt);
  store.close();

  server = createApp({ databaseFile, legacyJsonFile: null });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

async function login(page, name) {
  await page.goto(base);
  await page.locator('form[action="/login"] input[name="name"]').fill(name);
  await page.locator('form[action="/login"] input[name="password"]').fill(password);
  await page.locator('form[action="/login"] button').click();
  await expect(page).toHaveURL(`${base}/`);
}

async function assertHealthyRender(page) {
  const broken = await page.locator('img').evaluateAll((images) => images
    .filter((image) => !image.complete || image.naturalWidth === 0).map((image) => image.src));
  expect(broken).toEqual([]);
  const overflow = await page.locator('body').evaluate((body) => {
    const viewport = document.documentElement.clientWidth;
    const offenders = [...body.querySelectorAll('*')].map((element) => {
      const box = element.getBoundingClientRect();
      return { tag: element.tagName, className: element.className, right: Math.round(box.right),
        width: Math.round(box.width) };
    }).filter((entry) => entry.right > viewport + 1).slice(0, 8);
    const scrollContainers = [...body.querySelectorAll('*')].map((element) => ({
      tag: element.tagName, id: element.id, className: element.className,
      action: element.getAttribute('action'), heading: element.querySelector(':scope > h2')?.textContent,
      client: element.clientWidth, scroll: element.scrollWidth,
      overflow: getComputedStyle(element).overflowX
    })).filter((entry) => entry.scroll > entry.client + 1).slice(0, 12);
    return { present: body.scrollWidth > viewport + 1, viewport, body: body.scrollWidth,
      bodyOverflow: getComputedStyle(body).overflowX, offenders, scrollContainers };
  });
  expect(overflow.present, JSON.stringify(overflow)).toBe(false);
}

async function headingWrapState(locator) {
  return locator.evaluate((heading) => {
    const walker = document.createTreeWalker(heading, NodeFilter.SHOW_TEXT);
    let textNode = walker.nextNode();
    while (textNode && !textNode.textContent.trim()) textNode = walker.nextNode();
    if (!textNode) return { words: [], lines: 0, overflow: false };
    const text = textNode.textContent;
    const lineTops = (range) => [...range.getClientRects()]
      .filter((rectangle) => rectangle.width > 0 && rectangle.height > 0)
      .map((rectangle) => Math.round(rectangle.top * 2) / 2);
    const wordStates = [...text.matchAll(/\S+/gu)].map((match) => {
      const range = document.createRange();
      range.setStart(textNode, match.index);
      range.setEnd(textNode, match.index + match[0].length);
      return { word: match[0], lines: new Set(lineTops(range)).size };
    });
    const whole = document.createRange();
    whole.selectNodeContents(heading);
    const style = getComputedStyle(heading);
    return {
      words: wordStates,
      lines: new Set(lineTops(whole)).size,
      overflow: heading.scrollWidth > heading.clientWidth + 1,
      overflowWrap: style.overflowWrap,
      wordBreak: style.wordBreak
    };
  });
}

test('renders sidebar weather with the same label and value treatment as location', async ({ page }) => {
  await login(page, 'VisualAudit');
  for (const [width, screenshot] of [
    [1440, 'sidebar-weather-audit-desktop.png'],
    [360, 'sidebar-weather-audit-mobile.png']
  ]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${base}/inventory`);
    if (width <= 820) await page.locator('#player-nav-toggle').click();

    const context = page.locator('.sidebar-context');
    const region = context.locator('.sidebar-location-value').filter({ hasText: /^Region/ });
    const weather = context.locator('.sidebar-weather');
    await expect(context).toBeVisible();
    await expect(weather).toBeVisible();
    await expect(weather.locator(':scope > span')).toHaveText('Weather');
    await expect(weather.locator(':scope > a')).toHaveAttribute('aria-label', 'Weather: Hurricane');
    await expect(weather.locator(':scope > a > span').last()).toHaveText('Hurricane');
    await expect(weather.locator('.sidebar-weather-icon')).toHaveText('🌀');
    await expect(weather).not.toHaveClass(/weather-hurricane/u);

    const typography = async (row) => row.evaluate((element) => {
      const label = getComputedStyle(element.querySelector(':scope > span'));
      const value = getComputedStyle(element.querySelector(':scope > a'));
      return {
        label: [label.fontFamily, label.fontSize, label.fontWeight, label.letterSpacing,
          label.textTransform],
        value: [value.fontFamily, value.fontSize, value.fontWeight, value.letterSpacing,
          value.textTransform, value.textDecorationLine, value.textDecorationThickness]
      };
    });
    expect(await typography(weather)).toEqual(await typography(region));
    expect(await weather.evaluate((element) => getComputedStyle(element).backgroundImage)).toBe('none');
    await assertHealthyRender(page);
    await context.screenshot({ path: path.resolve(screenshot) });
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${base}/events`);
  await expect(page.locator('.weather-card.weather-hurricane').first()).toBeVisible();
  await expect(page.locator('.weather-card.weather-hurricane').first())
    .toHaveCSS('color', 'rgb(245, 243, 255)');
  await expect(page.locator('.weather-card.weather-hurricane').first())
    .toContainText('42 mm precipitation');
  await expect(page.locator('.weather-card.weather-hurricane').first())
    .not.toContainText('Changes in');
  await page.locator('.weather-card.weather-hurricane').first()
    .screenshot({ path: path.resolve('weather-hurricane-card-audit.png') });
  await page.screenshot({ path: path.resolve('weather-hurricane-audit.png'), fullPage: false });

  const weatherDatabase = new DatabaseSync(databaseFile);
  weatherDatabase.prepare(`
    UPDATE world_weather_slots
    SET condition = 'snow', temperature_c = -3, wind_kph = 18, rainfall_mm = 3.5
    WHERE map_id = ? AND slot_at = (SELECT last_slot_at FROM world_event_clock WHERE id = 1)
  `).run(visualMapId);
  weatherDatabase.close();
  await page.goto(`${base}/inventory`);
  await expect(page.locator('.sidebar-weather > a')).toHaveAttribute('aria-label', 'Weather: Snow');
  await expect(page.locator('.sidebar-weather-icon')).toHaveText('❄');
  await page.goto(`${base}/events`);
  await expect(page.locator('.weather-card.weather-snow').first()).toBeVisible();
  await expect(page.locator('.weather-card.weather-snow').first())
    .toHaveCSS('color', 'rgb(36, 57, 67)');
  await expect(page.locator('.weather-card.weather-snow').first())
    .toContainText('3.5 mm precipitation');
  await assertHealthyRender(page);
  await page.screenshot({ path: path.resolve('weather-snow-audit.png'), fullPage: false });
});

test('renders one fixed regional capital without a home chooser', async ({ page }) => {
  await login(page, 'VisualAudit');
  await page.goto(`${base}/map`);
  expect(Number.isSafeInteger(visualCapitalCityId)).toBeTruthy();
  await expect(page.locator(
    `.route-map .map-city-capital[data-city-id="${visualCapitalCityId}"]`
  )).toHaveCount(1);
  await expect(page.locator('.route-map .map-city-nameplate')).toHaveCount(5);
  await expect(page.locator('.route-map .map-city-nameplate-inlay')).toHaveCount(5);
  await expect(page.locator('.route-map .map-city-nameplate-tail')).toHaveCount(5);
  await expect(page.locator('.route-map .map-city-label-rivet')).toHaveCount(10);
  await expect(page.locator('.route-map .map-city-rank')).toHaveCount(1);
  expect(await page.locator('.route-map .map-city').evaluateAll((cities) =>
    cities.every((city) => {
      const name = city.querySelector('.map-city-name');
      const plate = city.querySelector('.map-city-nameplate');
      const label = city.querySelector('.map-city-label');
      const halo = city.querySelector('.map-city-halo');
      if (!name || !plate || !label || !halo) return false;
      const nameBounds = name.getBBox();
      const plateBounds = plate.getBBox();
      const labelBounds = label.getBBox();
      const haloBounds = halo.getBBox();
      return plateBounds.x <= nameBounds.x - 6
        && plateBounds.x + plateBounds.width >= nameBounds.x + nameBounds.width + 6
        && plateBounds.y <= nameBounds.y - 3
        && plateBounds.y + plateBounds.height >= nameBounds.y + nameBounds.height + 3
        && labelBounds.y + labelBounds.height <= haloBounds.y - 3;
    })
  )).toBeTruthy();
  await expect(page.locator('.route-map .map-oil-field-icon')).toHaveCount(1);
  await expect(page.locator('.route-map .map-oil-field-icon title'))
    .toHaveText('Oil Field in Burgundy');
  await expect(page.locator('.city-card[data-oil-field="true"] .city-oil-field-operation'))
    .toContainText('Oil Field');
  const capitalMarker = page.locator('.route-map .map-capital-star-marker');
  await expect(capitalMarker).toHaveCount(1);
  await expect(capitalMarker).toHaveCSS('fill', 'rgb(23, 18, 11)');
  const capitalCard = page.locator(
    `.city-card.capital[data-city-id="${visualCapitalCityId}"]`
  );
  await expect(capitalCard).toHaveCount(1);
  await expect(capitalCard).toContainText('Regional capital');
  expect(await capitalCard.evaluate((card) => {
    const badge = card.querySelector('.city-capital-badge');
    if (!badge) return false;
    const cardBounds = card.getBoundingClientRect();
    const badgeBounds = badge.getBoundingClientRect();
    return badgeBounds.left >= cardBounds.left
      && badgeBounds.right <= cardBounds.right
      && badgeBounds.top >= cardBounds.top
      && badgeBounds.bottom <= cardBounds.bottom;
  })).toBeTruthy();
  await expect(page.locator('a[href="/move"], form[action="/move"]')).toHaveCount(0);
  await assertHealthyRender(page);
  await page.screenshot({ path: path.resolve('regional-capital-audit-desktop.png'), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/map`);
  await expect(page.locator('.route-map .map-city-capital')).toHaveCount(1);
  await expect(page.locator('.city-card.capital')).toHaveCount(1);
  await assertHealthyRender(page);
  await page.screenshot({ path: path.resolve('regional-capital-audit-mobile.png'), fullPage: true });
});

test('keeps undiscovered currencies out of the player-facing exchange', async ({ page }) => {
  await login(page, 'CryptoCopyAudit');
  for (const [width, screenshot] of [
    [1440, 'crypto-copy-audit-desktop.png'],
    [360, 'crypto-copy-audit-mobile.png']
  ]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${base}/crypto`);
    await expect(page.getByRole('heading', { name: 'Crypto Exchange' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Aso Coin' })).toBeVisible();
    await expect(page.getByText('Read the charts, set your price, and trade when the market moves your way.'))
      .toBeVisible();
    await expect(page.locator('.crypto-discovery-note'))
      .toHaveText('Keep exploring. The exchange grows with your journey.');
    await expect(page.locator('.crypto-price-line')).not.toHaveCount(0);
    await expect(page.locator('.crypto-price-area')).not.toHaveCount(0);
    await expect(page.locator('.crypto-price-reference')).not.toHaveCount(0);
    await expect(page.locator('.crypto-candle, .crypto-volume-bar')).toHaveCount(0);
    await expect(page.locator('.crypto-chart-stats')).toContainText('Volume 10');
    await expect(page.locator('.crypto-chart-stats')).toContainText('VWAP 10.8g');
    await expect(page.locator('.crypto-quote-strip')).toContainText('11g');
    await expect(page.locator('.market-dealing-desk .market-ticket')).toHaveCount(4);
    await expect(page.locator('body')).not.toContainText(
      /Bromo Byte|Calbuco Cash|Dempo Digital|Ebeko Ether|Fogo Fund|Gallego Goldchain/u
    );
    await assertHealthyRender(page);
    await page.screenshot({ path: path.resolve(screenshot), fullPage: true });
  }
});

test('renders typed live findings as a compact linked top-right list', async ({ page }) => {
  await login(page, 'OccasionAudit');
  const sources = ['mine', 'new-mine', 'explosives', 'dwarf', 'fishing', 'salvage'];
  const external = new DatabaseSync(databaseFile);
  const insertEvent = external.prepare(`
    INSERT INTO live_update_events (scope, changed_at, event_type, payload_json)
    VALUES (?, ?, 'items-found', '{}')
  `);
  const updatePayload = external.prepare(
    'UPDATE live_update_events SET payload_json = ? WHERE id = ?'
  );
  external.exec('BEGIN IMMEDIATE');
  try {
    for (const [index, source] of sources.entries()) {
      const result = insertEvent.run(`player:${occasionPlayerId}`, Date.now() + index);
      const eventId = Number(result.lastInsertRowid);
      updatePayload.run(JSON.stringify({
        eventId, itemId: occasionItem.id, name: occasionItem.name, icon: occasionItem.icon,
        rarity: occasionItem.rarity, rarityName: occasionItem.rarityName, quantity: 1,
        source, sourceName: catalog.settings.finding_source_names[source],
        cityId: 1, cityName: "Tzolk'in", foundAt: Date.now() + index,
        autoRecycled: false, path: `/items/${occasionItem.id}`
      }), eventId);
    }
    external.exec('COMMIT');
  } catch (error) {
    external.exec('ROLLBACK');
    external.close();
    throw error;
  }
  external.close();

  const notice = page.locator('#flash-dialog');
  await expect(notice).toBeVisible();
  await expect(notice.locator('#flash-dialog-title')).toHaveText('Things found');
  await expect(notice.locator('#flash-dialog-message')).toHaveText('Found 6 new things.');
  const rows = notice.locator('#flash-dialog-items > .flash-item');
  await expect(rows).toHaveCount(sources.length);
  const links = rows.locator('.flash-item-link');
  await expect(links).toHaveCount(sources.length);
  expect(await links.evaluateAll((entries, href) =>
    entries.every((entry) => entry.getAttribute('href') === href), `/items/${occasionItem.id}`))
    .toBe(true);
  const metadata = await rows.locator('small').allTextContents();
  for (const source of sources) {
    expect(metadata.filter((text) => text.split(' · ')
      .includes(catalog.settings.finding_source_names[source]))).toHaveLength(1);
  }
  const broken = await rows.locator('img').evaluateAll((images) => images
    .filter((image) => !image.complete || image.naturalWidth === 0).map((image) => image.src));
  expect(broken).toEqual([]);
  const box = await notice.boundingBox();
  expect(box).toBeTruthy();
  expect(box.width).toBeLessThanOrEqual(500);
  expect(await notice.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: path.resolve('finding-notice-audit.png'), fullPage: false });
  await notice.getByRole('button', { name: 'Dismiss notification' }).click();
  await expect(notice).not.toBeVisible();
  await page.reload();
  await expect(page.locator('#flash-dialog')).not.toBeVisible();
  await expect(page.locator('#finding-dialog')).toHaveCount(0);
});

test('renders recycling, Ore refining, protected outputs, bots, and the simplified Dwarf page', async ({ page }) => {
  await login(page, 'RecyclingAudit');
  await page.goto(`${base}/inventory`);
  await expect(page.getByRole('heading', { name: 'Ore recycling' })).toBeVisible();
  await expect(page.getByText('1,500 Ore scraps')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Refine Ore' })).toBeEnabled();
  await expect(page.getByRole('button', { name: /Recycle · 1 scraps each/ }).first()).toBeEnabled();
  await expect(page.getByRole('button', { name: /Recycle all/ }).first()).toBeEnabled();
  await expect(page.getByTitle('Every stored copy was factory-made and can never be recycled.').first())
    .toBeDisabled();
  await assertHealthyRender(page);
  await page.screenshot({ path: path.resolve('recycling-audit-inventory.png'), fullPage: true });

  await page.goto(`${base}/mines/auto-recycle`);
  await expect(page.getByRole('heading', { name: 'Auto-Recycle' })).toBeVisible();
  const submit = page.getByRole('button', { name: 'Recycle selected into Ore scraps' });
  const ordinaryRow = page.locator('.auto-recycle-row').filter({ hasText: recyclableItemName });
  await expect(ordinaryRow).toBeVisible();
  const checkboxes = page.locator('.auto-recycle-row input[type="checkbox"]');
  for (let index = 0; index < await checkboxes.count(); index += 1) {
    if (await checkboxes.nth(index).isChecked()) await checkboxes.nth(index).uncheck();
  }
  await expect(submit).toBeDisabled();
  await ordinaryRow.getByRole('checkbox').check();
  await expect(ordinaryRow.getByRole('spinbutton')).toBeEnabled();
  await expect(submit).toBeEnabled();
  await assertHealthyRender(page);

  await page.goto(`${base}/factories`);
  await expect(page.getByRole('heading', { name: 'Hire a Factory Worker bot' })).toBeVisible();
  await expect(page.getByText('Worker Bot Mk III')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Hire · 25000g' })).toBeEnabled();
  await assertHealthyRender(page);
  await page.screenshot({ path: path.resolve('recycling-audit-factories.png'), fullPage: true });

  await page.goto(`${base}/dwarves`);
  await expect(page.getByRole('heading', { name: 'Dwarves', exact: true })).toBeVisible();
  await expect(page.locator('.dwarf-findings, #dwarf-findings-feed, .dwarf-competition')).toHaveCount(0);
});

test('renders shop, profiles, stats, inbox controls, vehicle management, ratings, and battle reports with original imagery', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });

  await login(page, 'VisualAudit');
  await page.goto(`${base}/professions`);
  await expect(page.locator('.profession-card')).toHaveCount(20);
  await expect(page.getByText(/Every miner may use every game system, while specialisations grant bonuses\./))
    .toBeVisible();
  await page.goto(`${base}/factories`);
  await expect(page.locator('form[action="/factories/build"]')).toBeVisible();
  await expect(page.getByRole('button', { name: /Build factory/ })).toBeVisible();
  await page.goto(`${base}/market`);
  await expect(page.getByRole('heading', { name: 'Inventory containers' })).toBeVisible();
  await assertHealthyRender(page);
  await page.screenshot({ path: path.resolve('migration-audit-shop.png'), fullPage: true });
  const mineMarketPath = await page.getByRole('link', { name: 'Gold market' }).first().getAttribute('href');
  await page.goto(`${base}${mineMarketPath}`);
  for (const heading of ['List mines', 'Place bid', 'Listings', 'Bids', 'Recent sales']) {
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }
  const selectedMineTypeId = Number(mineMarketPath.split('/').at(-1));
  await expect(page.locator(
    `img[src="${catalog.mineTypes.find((entry) => entry.id === selectedMineTypeId).icon}"]`
  )).toBeVisible();
  await assertHealthyRender(page);
  await page.screenshot({ path: path.resolve('migration-audit-mine-market.png'), fullPage: true });

  await page.goto(`${base}/miners/VisualAudit`);
  await expect(page.locator('.avatar-stack img')).toHaveCount(3);
  await expect(page.locator('img[src="/img/icons/icon_profileimage.png"]')).toBeVisible();
  await assertHealthyRender(page);
  await page.goto(`${base}/miners/RenderTrader`);
  await expect(page.locator('img[src="/img/icons/icon_message.png"]')).toBeVisible();
  await expect(page.locator('img[src="/img/icons/icon_gold.png"]')).toHaveCount(0);
  await expect(page.locator('form#gold-gift')).toHaveCount(0);
  await expect(page.locator('img[src="/img/icons/icon_listing.png"]')).toBeVisible();
  await assertHealthyRender(page);
  await page.getByRole('link', { name: 'Listings and bids' }).click();
  await expect(page.getByRole('heading', { name: "RenderTrader's Listings and Bids" })).toBeVisible();
  await expect(page.getByText(catalog.byId.get(traderListingItemId).name, { exact: true })).toBeVisible();
  await assertHealthyRender(page);
  await page.goto(`${base}/items/${detailItemId}`);
  await expect(page.locator('.detail-art img[src="/img/border.png"]')).toHaveCount(0);
  await expect(page.locator(`.detail-art img[src="${catalog.byId.get(detailItemId).icon}"]`)).toBeVisible();
  await assertHealthyRender(page);
  await page.goto(`${base}/avatar`);
  await expect(page.getByRole('heading', { name: 'Avatar Editor' })).toBeVisible();
  await assertHealthyRender(page);
  await page.goto(`${base}/stats`);
  await expect(page.getByRole('heading', { name: 'Server Stats' })).toBeVisible();
  await assertHealthyRender(page);

  await page.goto(`${base}/dwarves`);
  await expect(page.getByRole('heading', { name: 'Dwarves', exact: true })).toBeVisible();
  await expect(page.locator('.dwarf-rules .item')).toHaveCount(6);
  await expect(page.locator('.dwarf-rules .item').first()).toContainText('Orange Dwarf');
  await expect(page.locator('.dwarf-rules .item').last()).toContainText('Yellow Dwarf');
  await expect(page.locator('.dwarf-findings, #dwarf-findings-feed')).toHaveCount(0);
  await assertHealthyRender(page);
  await page.goto(`${base}/items/1433`);
  await expect(page.getByRole('heading', { name: 'Orange Dwarf' })).toBeVisible();
  await expect(page.locator('.detail-image[data-large-image="original"]'))
    .toHaveAttribute('src', '/node/dwarf-images/dwarf-6.png');
  await expect(page.locator('.item-stats')).toContainText('Legendary to Exceptional');
  await expect(page.locator('.item-stats')).toContainText('5% after each find');
  await assertHealthyRender(page);
  await page.goto(`${base}/dwarves`);
  await page.screenshot({ path: path.resolve('migration-audit-dwarves.png'), fullPage: true });

  await page.goto(`${base}/map`);
  expect(Number.isSafeInteger(visualCapitalCityId)).toBeTruthy();
  await expect(page.locator('.route-map svg')).toBeVisible();
  await expect(page.locator('.route-map .route, .route-map .inter-map-route')).toHaveCount(0);
  await expect(page.locator('.route-map .map-city')).toHaveCount(catalog.cities.length);
  await expect(page.locator(
    `.route-map .map-city-capital[data-city-id="${visualCapitalCityId}"]`
  )).toHaveCount(1);
  await expect(page.locator('.route-map .map-mine-icon')).toHaveCount(catalog.cityMineTypes.length);
  await expect(page.locator('.city-mines img')).toHaveCount(catalog.cityMineTypes.length);
  await expect(page.locator('.route-map .map-background')).toBeVisible();
  await expect(page.locator('.route-list .route-summary')).toHaveCount(catalog.routes.length);
  await expect(page.locator('.route-map .map-city-current')).toBeVisible();
  const capitalCard = page.locator(
    `.city-card.capital[data-city-id="${visualCapitalCityId}"]`
  );
  await expect(capitalCard).toHaveCount(1);
  await expect(capitalCard).toContainText('Regional capital');
  await expect(page.locator('a[href="/move"], form[action="/move"]')).toHaveCount(0);
  await assertHealthyRender(page);
  await page.screenshot({ path: path.resolve('migration-audit-city-map.png'), fullPage: true });

  await page.goto(`${base}/containers`);
  await expect(page.getByRole('heading', { name: 'Inventory containers' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Buy' }).first()).toBeEnabled();
  await assertHealthyRender(page);
  await page.screenshot({ path: path.resolve('migration-audit-containers.png'), fullPage: true });

  await page.goto(`${base}/vehicles/boxes`);
  await expect(page.getByRole('heading', { name: 'Open ammo boxes' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open box' }).first()).toBeEnabled();
  await assertHealthyRender(page);
  await page.screenshot({ path: path.resolve('migration-audit-ammo-boxes.png'), fullPage: true });

  await page.goto(`${base}/messages?filter=unread`);
  await expect(page.getByText('Rendered inbox audit message')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mark read' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete' }).first()).toBeVisible();
  await assertHealthyRender(page);
  await page.screenshot({ path: path.resolve('migration-audit-messages.png'), fullPage: true });
  await page.locator('.message-actions').first().getByRole('button', { name: 'Mark read' }).click();
  await expect(page.locator('#flash-dialog-message')).toHaveText('1 message updated.');
  await page.locator('#flash-dialog button').click();

  await page.goto(`${base}/messages/view/${bountyMessageId}`);
  await expect(page.getByRole('heading', { name: 'Kraken defeated' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Combat phases' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cannon round 1' })).toBeVisible();
  await expect(page.getByText(/Tentacle smash dealt 24 damage to hull/)).toBeVisible();
  await expect(page.getByText(/cannot board a world creature/)).toBeVisible();
  await expect(page.locator('.message-item-group').getByRole('heading', { name: 'Bounty' })).toBeVisible();
  await expect(page.locator('.message-item')).toHaveCount(37);
  await expect(page.locator('.message-item img')).toHaveCount(37);
  await expect(page.locator('.message-item a')).toHaveCount(37);
  await expect(page.locator('.message-detail-body')).not.toContainText('filled with bounty:');
  for (const width of [360, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await assertHealthyRender(page);
  }
  await page.screenshot({ path: path.resolve('migration-audit-kraken-bounty.png'), fullPage: true });

  await page.goto(`${base}/vehicles/${vehicleId}`);
  await expect(page.locator('.vehicle-hero .item-card-featured .item-card-art'))
    .toHaveCSS('background-image', 'none');
  for (const heading of ['Manage vehicle', 'Oil', 'Send', 'History']) {
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }
  await expect(page.getByRole('heading', { name: 'Current loadout' })).toBeVisible();
  await expect(page.getByText('1 fitted', { exact: true })).toHaveCount(2);
  await expect(page.getByRole('link', { name: 'Manage cargo' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Customize mods and weapons' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cargo', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: 'Manage cargo' }).click();
  await expect(page.getByRole('heading', { name: 'Cargo', exact: true })).toBeVisible();
  await expect(page.getByText(/Choose the complete cargo manifest/)).toBeVisible();
  await expect(page.getByRole('button', {
    name: 'Take as much of the rarest things as we can'
  })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Preview cargo' })).toBeVisible();
  await page.getByRole('button', {
    name: 'Take as much of the rarest things as we can'
  }).click();
  await expect(page.getByRole('heading', { name: 'Proposed loadout' })).toBeVisible();
  await expect(page.getByText(/exact proposal is ready to commit/i)).toBeVisible();
  await page.goto(`${base}/vehicles/${vehicleId}/customize`);
  await expect(page.getByRole('heading', { name: 'Mods', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Weapons', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Preview loadout' }).click();
  await expect(page.getByRole('heading', { name: 'Proposed loadout' })).toBeVisible();
  await expect(page.getByText(/exact proposal is ready to commit/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Commit this exact loadout' })).toBeVisible();
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await assertHealthyRender(page);
  }
  await assertHealthyRender(page);
  await page.screenshot({ path: path.resolve('migration-audit-vehicle.png'), fullPage: true });

  await page.goto(`${base}/vehicles/${shipVehicleId}/customize`);
  await expect(page.getByRole('heading', { name: 'Current loadout' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Ship cannons 1\/\d+ portals occupied/ })).toBeVisible();
  await expect(page.getByText('Fitted in portal 1')).toBeVisible();
  await expect(page.getByRole('heading', { name: /Ammunition \d+ shots loaded/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Proposed complete cannon set' })).toBeVisible();
  const completeCannonQuantity = page.locator(
    'form[data-live-preview-form] input[name^="cannon_"]'
  ).first();
  await expect(completeCannonQuantity).toHaveValue('1');
  await expect(page.locator('form[action$="/cannons/detach"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Preview cannon loadout' }).click();
  await expect(page.getByRole('heading', { name: 'Proposed loadout' })).toBeVisible();
  await expect(page.getByText(/exact proposal is ready to commit/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Commit this exact loadout' })).toBeVisible();
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await assertHealthyRender(page);
  }
  await page.screenshot({ path: path.resolve('migration-audit-ship-loadout.png'), fullPage: true });

  await page.goto(`${base}/ratings?class=4`);
  await expect(page.getByRole('heading', { name: 'Vehicle rankings' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View season prizes' })).toBeVisible();
  await expect(page.getByText(/participates automatically from its live rating/)).toBeVisible();
  expect(await page.locator('.ratings-list').getByText(/Event creature/).count())
    .toBeGreaterThanOrEqual(2);
  expect(await page.locator('.ratings-list').getByText(/NPC fleet/).count())
    .toBeGreaterThanOrEqual(1);
  await expect(page.getByText(/Legendary T-Rex #/)).toBeVisible();
  await expect(page.getByText(/Legendary Kraken #/)).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await assertHealthyRender(page);
  await page.screenshot({ path: path.resolve('ratings-audit-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 360, height: 900 });
  await assertHealthyRender(page);
  await page.screenshot({ path: path.resolve('ratings-audit-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('link', { name: 'View season prizes' }).click();
  await expect(page.getByRole('heading', { name: 'Season prizes' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Fight upward' })).toBeVisible();
  await expect(page.locator(
    '.combat-prize-list a[href="/items/1402"], .combat-prize-list a[href="/items/1403"]'
  )).toHaveCount(2);
  await assertHealthyRender(page);

  await page.locator('form[action="/logout"] button').click();
  await login(page, 'RenderRobber');
  await page.goto(`${base}/battles/${battleId}`);
  await expect(page.locator('.battle-summary').getByText('Rating', { exact: false })).toBeVisible();
  await assertHealthyRender(page);
  await page.screenshot({ path: path.resolve('migration-audit-battle.png'), fullPage: true });

  await page.locator('form[action="/logout"] button').click();
  await login(page, 'OilAudit');
  await page.goto(`${base}/oil-field`);
  for (const heading of ['Oil Field', 'Machine field', 'Instructions', 'Your field events']) {
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
  }
  for (const removedText of ['Machine parts in the Oil Field city', 'Keyboard and form controls', 'Deployed machines']) {
    await expect(page.getByText(removedText, { exact: true })).toHaveCount(0);
  }
  const oilBoardShell = page.locator('.oil-field-board-shell');
  await expect(oilBoardShell).toHaveAttribute('data-hex-count', '469');
  await expect(oilBoardShell).toHaveCSS('overflow-y', 'hidden');
  expect(await oilBoardShell.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(true);
  await expect(page.locator('#board svg')).toBeVisible();
  await expect(page.locator('#board')).toHaveAttribute('data-renderer', 'svgjs');
  await expect(page.locator('#board svg')).toHaveAttribute('data-renderer', 'svgjs');
  await expect(page.locator('#oil-toggle-renderer')).toHaveText('Renderer: SVG.js');
  await expect(page.locator('#board svg')).toHaveAttribute('width', '1000');
  await expect(page.locator('#board .oil-rack-caption')).toContainText('MACHINE RACK');
  await expect(page.locator('#board .oil-rack-slot')).toHaveCount(0);
  await expect(page.locator('#board .oil-rack-label')).toHaveCount(2);
  await expect(page.locator('#board image.oil-rack-machine-icon')).toHaveCount(2);
  const escapedDirectionalName = oilDirectionalMachineName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const directionalCandidate = page.locator('#board').getByRole('button', {
    name: new RegExp(`^Select ${escapedDirectionalName}\\.`)
  });
  await expect(directionalCandidate).toHaveCount(1);
  const directionTarget = page.locator('#board .oil-hex-shape[data-hex-x="1"][data-hex-y="0"]');
  const directionTargetId = await directionTarget.getAttribute('data-hex-id');
  await directionalCandidate.dispatchEvent('click');
  await directionTarget.dispatchEvent('click');
  await page.evaluate(() => {
    window.dialog.machine.rotateRight();
    window.dialog.machine.rotateRight();
  });
  expect(await page.evaluate(() => ({
    point: window.dialog.machine.point,
    transform: window.dialog.machine.rackIcon.node.getAttribute('transform')
  }))).toMatchObject({ point: 2, transform: expect.stringContaining('rotate(120 ') });
  await Promise.all([
    page.waitForNavigation(),
    page.evaluate(() => window.dialog.Deploy(false))
  ]);
  expect(await page.evaluate((hexId) => {
    const machine = window.boardMachines.find((candidate) =>
      String(candidate.hm?.HexesMachine?.hex_id) === String(hexId));
    return machine ? {
      point: Number(machine.point),
      transforms: machine.set.elements.map((element) => element.node.getAttribute('transform'))
    } : null;
  }, directionTargetId)).toMatchObject({
    point: 2,
    transforms: expect.arrayContaining([expect.stringContaining('rotate(120 ')])
  });
  await expect(page.locator('#board .oil-rack-label')).toHaveCount(1);
  const rackIcon = page.locator('#board image.oil-rack-machine-icon');
  await expect(rackIcon).toHaveCount(1);
  await expect(rackIcon).toHaveAttribute('href', /\/node\/machine-icons\/flower-\d+\.svg/);
  await expect(rackIcon).toHaveAttribute('width', '30');
  await expect(rackIcon).toHaveAttribute('height', '30');
  expect(await rackIcon.evaluate((icon) => ({
    width: Number(icon.getAttribute('width')),
    height: Number(icon.getAttribute('height')),
    hexDiameter: Number(window.hexDiameter)
  }))).toEqual({ width: 30, height: 30, hexDiameter: 30 });
  expect(await page.evaluate(() => [...new Set(window.OilRackLayout(12)
    .map((position) => position.zone))])).toEqual(['top', 'left', 'right']);
  await expect(page.locator('#board .oil-hex-shape')).toHaveCount(469);
  await expect(page.locator('#board .oil-machine-shape').first()).toBeVisible();
  await expect(page.locator('#board .oil-slick').first()).toBeVisible();
  await expect(page.locator('#board .oil-slick').first()).toHaveAttribute('stroke', '#ffc34d');
  await expect(page.locator('#board .oil-volume-badge').first()).toBeVisible();
  await expect(page.locator('#board .oil-volume-label').first()).toHaveText(/^\d+(?:\.\d+)?L$/);
  const spillTarget = page.locator('#board .oil-spill-hex[data-hex-x="2"][data-hex-y="0"]');
  await expect(spillTarget).toHaveAttribute('data-oil-spill', 'true');
  await expect(page.locator('#board .oil-spill-ring[data-hex-id]')).toBeVisible();
  await expect(page.locator('#board .oil-spill-label[data-hex-id]')).toHaveText('SPILL');
  const oilLabelBox = await page.locator('#board .oil-volume-label').first().boundingBox();
  expect(oilLabelBox).toBeTruthy();
  expect(oilLabelBox.width).toBeGreaterThan(20);
  expect(oilLabelBox.height).toBeGreaterThan(8);
  expect(await page.locator('#board svg').evaluate((svg) => {
    const label = svg.querySelector('.oil-volume-label');
    const machines = [...svg.querySelectorAll('.oil-machine-shape')];
    const lastMachine = machines[machines.length - 1];
    return Boolean(label && lastMachine
      && (lastMachine.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING));
  })).toBe(true);
  await expect(page.locator('#oil-board-status')).toContainText('Oil Field ready');
  const centerHex = page.locator('#board .oil-hex-shape[data-hex-x="0"][data-hex-y="0"]');
  await centerHex.hover();
  expect(await page.evaluate(() => window.popup === null)).toBe(true);
  const hexSummary = page.locator('#oil-hex-summary');
  await expect(hexSummary).toBeHidden();
  await centerHex.click();
  await expect(hexSummary).toBeVisible();
  await expect(hexSummary.getByRole('heading', { name: 'Hex (0,0)', exact: true })).toBeVisible();
  await expect(hexSummary.locator('.item-card[data-item-id]')).toBeVisible();
  await expect(hexSummary.getByRole('heading', { name: 'Machine operation', exact: true })).toBeVisible();
  await expect(hexSummary.getByRole('heading', { name: 'Oil on hex', exact: true })).toBeVisible();
  await expect(hexSummary.getByText('Available oil', { exact: true })).toBeVisible();
  await expect(hexSummary.getByText('Life remaining', { exact: true })).toBeVisible();
  await hexSummary.screenshot({ path: path.resolve('migration-audit-oil-summary.png') });
  await hexSummary.getByRole('button', { name: 'Close hex summary', exact: true }).click();
  await expect(hexSummary).toBeHidden();
  await expect(page.locator('#oil-board-status')).toContainText('Hex summary closed');
  await expect(page.getByText('Field access active')).toBeVisible();
  const volumeLabelsButton = page.locator('#oil-toggle-volume-labels');
  await expect(volumeLabelsButton).toHaveText('Hide oil volume labels');
  await volumeLabelsButton.click();
  await expect(page.locator('#board .oil-volume-halo').first()).toBeHidden();
  await expect(page.locator('#board .oil-slick').first()).toBeHidden();
  await expect(page.locator('#board .oil-volume-badge').first()).toBeHidden();
  await expect(page.locator('#board .oil-volume-label').first()).toBeHidden();
  await expect(page.locator('#board .oil-spill-ring[data-hex-id]')).toBeVisible();
  await expect(page.locator('#board .oil-spill-label[data-hex-id]')).toBeVisible();
  await expect(page.locator('#oil-board-status')).toContainText('Oil volume labels hidden');
  await page.screenshot({ path: path.resolve('migration-audit-oil-field-labels-hidden.png'), fullPage: true });
  await volumeLabelsButton.click();
  await expect(page.locator('#board .oil-volume-halo').first()).toBeVisible();
  await expect(page.locator('#board .oil-slick').first()).toBeVisible();
  await expect(page.locator('#board .oil-volume-label').first()).toBeVisible();
  await page.locator('#oil-toggle-animation').click();
  await expect(page.locator('#oil-board-status')).toContainText('Animations are paused');
  await expect(page.locator('#board .oil-machine-shape').first()).toBeVisible();
  await page.locator('#oil-toggle-animation').click();
  await expect(page.locator('#oil-board-status')).toContainText('animations are playing');
  await page.locator('#oil-toggle-colors').click();
  await expect(page.locator('#oil-board-status')).toContainText('machine rarity');
  await page.locator('#oil-toggle-queued').click();
  await expect(page.locator('#oil-toggle-queued')).toHaveText('Show deployed');
  await page.locator('#oil-toggle-queued').click();
  await expect(page.locator('#oil-toggle-queued')).toHaveText('Show queued');
  const rackBomb = page.locator(`#board [aria-label*="${oilRackDescription}"]`);
  await expect(rackBomb).toBeVisible();
  await expect(rackBomb).toHaveAttribute('data-rack-zone', 'top');
  await expect(rackBomb).toHaveAttribute('stroke', 'none');
  await rackBomb.hover();
  const rackTooltip = page.locator('#oil-machine-tooltip');
  await expect(rackTooltip).toBeVisible();
  await expect(rackTooltip).toContainText(oilRackDescription);
  await expect(rackTooltip).toContainText('P =');
  const bombBox = await rackBomb.boundingBox();
  const spillBox = await spillTarget.boundingBox();
  expect(bombBox).toBeTruthy();
  expect(bombBox.width).toBeGreaterThanOrEqual(36);
  expect(spillBox).toBeTruthy();
  await page.mouse.move(bombBox.x + bombBox.width / 2, bombBox.y + bombBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(spillBox.x + spillBox.width / 2, spillBox.y + spillBox.height / 2, { steps: 12 });
  await expect(page.locator('#board')).toHaveClass(/oil-machine-drag-active/);
  await expect(spillTarget).toHaveClass(/oil-drop-target-spill/);
  await expect(page.locator('#board .oil-spill-ring[data-hex-id]')).toBeVisible();
  await page.mouse.up();
  await expect(page.locator('#board')).not.toHaveClass(/oil-machine-drag-active/);
  await expect(page.locator('#oil-board-status')).toContainText('Selected Oil spill at hex (2,0)');
  await expect(page.locator('#board svg')).toContainText('Rotate');
  await expect(page.locator('#board svg')).toContainText('Bomb');
  await assertHealthyRender(page);
  await page.screenshot({ path: path.resolve('migration-audit-oil-field.png'), fullPage: true });

  await Promise.all([
    page.waitForNavigation(),
    page.locator('#oil-toggle-renderer').click()
  ]);
  await expect(page.locator('#board')).toHaveAttribute('data-renderer', 'raphael');
  await expect(page.locator('#oil-toggle-renderer')).toHaveText('Renderer: Raphael');
  await expect(page.locator('#oil-board-status')).toContainText('ready with Raphael');
  await expect(page.locator('#board .oil-hex-shape')).toHaveCount(469);
  await Promise.all([
    page.waitForNavigation(),
    page.locator('#oil-toggle-renderer').click()
  ]);
  await expect(page.locator('#board')).toHaveAttribute('data-renderer', 'svgjs');
  await expect(page.locator('#oil-toggle-renderer')).toHaveText('Renderer: SVG.js');
  await expect(page.locator('#oil-board-status')).toContainText('ready with SVG.js');
  await expect(page.locator('#board .oil-hex-shape')).toHaveCount(469);

  await page.locator('form[action="/logout"] button').click();
  await login(page, 'RenderCustomer');
  await page.goto(`${base}/miners/OilAudit`);
  await expect(page.getByRole('link', { name: 'Send message' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Listings and bids' })).toBeVisible();
  await expect(page.getByText('Send gold', { exact: true })).toHaveCount(0);
  await expect(page.locator('form#gold-gift')).toHaveCount(0);
  await assertHealthyRender(page);
  await page.screenshot({ path: path.resolve('migration-audit-player-profile.png'), fullPage: true });
  expect(errors).toEqual([]);
});

test('keeps page titles readable across shell breakpoints', async ({ page }) => {
  await login(page, 'VisualAudit');
  for (const width of [1281, 1181, 1180, 901, 900, 821, 820, 520, 360]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [route, title] of [['/containers', 'Inventory containers'], ['/messages', 'Messages']]) {
      await page.goto(`${base}${route}`);
      const heading = page.locator('.page-title h1');
      await expect(heading).toHaveText(title);
      const state = await headingWrapState(heading);
      expect(state.words.every((word) => word.lines === 1), JSON.stringify({ width, route, state })).toBe(true);
      expect(state.overflow, JSON.stringify({ width, route, state })).toBe(false);
      expect(state.overflowWrap).toBe('break-word');
      expect(state.wordBreak).toBe('normal');
      if (title === 'Messages' || width >= 820) expect(state.lines).toBe(1);
      else expect(state.lines).toBeLessThanOrEqual(2);
      const overlap = await page.locator('.page-title').evaluate((titleBlock) => {
        const first = titleBlock.firstElementChild?.getBoundingClientRect();
        const second = titleBlock.children[1]?.getBoundingClientRect();
        if (!first || !second) return false;
        return first.left < second.right && first.right > second.left
          && first.top < second.bottom && first.bottom > second.top;
      });
      expect(overlap, `${title} overlaps its companion at ${width}px`).toBe(false);
      await assertHealthyRender(page);
    }
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${base}/messages`);
  await expect(page.locator('.page-title > a.button')).toHaveCSS('background-color', 'rgb(61, 66, 62)');
});

test('renders the MineThings 2 rebirth landing cleanly at every viewport', async ({ page }) => {
  test.setTimeout(120_000);
  const errors = [];
  const failedResponses = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', (response) => {
    const requestUrl = new URL(response.url());
    if (requestUrl.origin === base && response.status() >= 400) {
      failedResponses.push(`${response.status()} ${requestUrl.pathname}`);
    }
  });

  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(base);
    await expect(page).toHaveTitle('MineThings 2 · The world digs back');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 }))
      .toContainText(/From the ashes.*MineThings 2/su);
    const registration = page.locator('form[action="/register"]');
    const returning = page.locator('form[action="/login"]');
    await expect(registration).toHaveAttribute('aria-labelledby', 'landing-register-title');
    await expect(returning).toHaveAttribute('aria-labelledby', 'landing-login-title');
    await expect(registration.getByLabel('Miner name')).toBeVisible();
    await expect(registration.getByLabel('Email')).toBeVisible();
    await expect(registration.getByLabel('Password')).toBeVisible();
    await expect(registration.getByLabel(/Terms and Privacy Notice/)).toBeVisible();
    await expect(returning.getByLabel('Miner name')).toBeVisible();
    await expect(returning.getByLabel('Password')).toBeVisible();
    await expect(page.locator('.landing-archive-card img')).toBeVisible();
    await expect(page.locator('.landing-map-frame img')).toBeVisible();
    await expect(page.locator('.landing-map-frame img')).toHaveAttribute('src', '/node/maps/aso.png');
    expect(await page.locator('[id]').evaluateAll((elements) => {
      const ids = elements.map((element) => element.id);
      return new Set(ids).size === ids.length;
    })).toBe(true);
    await assertHealthyRender(page);
    expect(await page.evaluate(() => ({
      viewport: document.documentElement.clientWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth
    }))).toEqual({ viewport: width, document: width, body: width });

    const registrationBox = await registration.boundingBox();
    const returningBox = await returning.boundingBox();
    expect(registrationBox).toBeTruthy();
    expect(returningBox).toBeTruthy();
    if (width === 360) {
      expect(registrationBox.y + registrationBox.height).toBeLessThanOrEqual(returningBox.y + 1);
      const compactControls = await page.locator(
        '.landing-auth-card input:not([type="checkbox"]), .landing-auth-card button'
      ).evaluateAll((controls) => controls.map((control) => control.getBoundingClientRect().height));
      expect(compactControls.every((height) => height >= 44)).toBe(true);
      await page.screenshot({ path: path.resolve('landing-audit-mobile.png'), fullPage: true });
    }
    if (width === 1440) {
      expect(registrationBox.x + registrationBox.width).toBeLessThanOrEqual(returningBox.x + 2);
      await page.screenshot({ path: path.resolve('landing-audit-desktop.png'), fullPage: true });
    }
  }

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(base);
  await page.keyboard.press('Tab');
  const skipLink = page.locator('.skip-link');
  await expect(skipLink).toBeFocused();
  await expect(skipLink).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page.locator('#content')).toBeFocused();
  await page.locator('.landing-shell footer a[href="/history"]').click();
  await expect(page).toHaveURL(`${base}/history`);
  await expect(page.getByRole('heading', { name: 'History', exact: true })).toBeVisible();
  await expect(page.locator('.editorial-switcher a[aria-current="page"]')).toHaveText('History');
  await page.goto(base);
  await page.locator('.landing-shell footer a[href="/legal"]').click();
  await expect(page).toHaveURL(`${base}/legal`);
  await expect(page.getByRole('heading', { name: 'Legal', exact: true })).toBeVisible();
  await expect(page.locator('.editorial-switcher a[aria-current="page"]')).toHaveText('Legal');
  for (const route of ['/history', '/legal']) {
    for (const width of [360, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${base}${route}`);
      const title = page.locator('.editorial-page > .page-title');
      await expect(title).toBeVisible();
      await expect(page.locator('.editorial-hero')).toHaveCount(0);
      await expect(page.locator('.editorial-facts > div')).toHaveCount(3);
      await expect(page.locator('.article-index')).toBeVisible();
      const indexTargetHeights = await page.locator('.article-index a').evaluateAll((links) =>
        links.map((link) => link.getBoundingClientRect().height));
      expect(indexTargetHeights.every((height) => height >= 44)).toBe(true);
      await assertHealthyRender(page);
      if (width === 360) {
        await page.screenshot({
          path: path.resolve(route === '/history' ? 'history-audit-mobile.png' : 'legal-audit-mobile.png'),
          fullPage: true
        });
      }
    }
  }
  expect(errors).toEqual([]);
  expect(failedResponses).toEqual([]);
});

test('keeps an unverified registration locked until its email link is confirmed', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto(base);
  const email = page.locator('form[action="/register"] input[name="email"]');
  await expect(email).toHaveAttribute('required', '');
  await page.locator('form[action="/register"] input[name="name"]').fill('EmailVisualAudit');
  await email.fill('email-visual@example.test');
  await page.locator('form[action="/register"] input[name="password"]').fill(password);
  await page.locator('form[action="/register"] input[name="acceptTerms"]').check();
  await page.getByRole('button', { name: 'Create my miner' }).click();
  await expect(page).toHaveURL(`${base}/verify-email`);
  await expect(page.getByRole('heading', { name: 'Verify your email' })).toBeVisible();
  await page.goto(base);
  await expect(page).toHaveURL(`${base}/verify-email`);
  await expect(page.getByText('email-visual@example.test')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(360);
  await page.getByRole('link', { name: 'Open verification link' }).click();
  await expect(page.getByRole('heading', { name: 'Confirm your email' })).toBeVisible();
  await page.getByRole('button', { name: 'Verify email and unlock account' }).click();
  await expect(page).toHaveURL(`${base}/`);
  await expect(page.getByRole('heading', { name: /EmailVisualAudit.*mines/ })).toBeVisible();
});

test('keeps core journeys clean, responsive, and keyboard navigable', async ({ page }) => {
  test.setTimeout(300_000);
  const errors = [];
  const failedResponses = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', (response) => {
    const requestUrl = new URL(response.url());
    if (requestUrl.origin === base && response.status() >= 400) {
      failedResponses.push(`${response.status()} ${requestUrl.pathname}`);
    }
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  await login(page, 'ResponsiveAudit');
  await page.goto(`${base}/admin/world`);
  await expect(page.getByRole('heading', { name: 'Current weather period' })).toBeVisible();
  const creatureForms = page.locator('form[action="/admin/world/creatures"]');
  await expect(creatureForms).toHaveCount(2);
  await expect(creatureForms.locator('select[name="type"] option')).toHaveCount(6);
  await expect(creatureForms.locator('select[name="rarity"] option')).toHaveCount(12);
  await expect(creatureForms.locator('option[value="white_whale"]')).toHaveText('White Whale');
  await expect(creatureForms.locator('option[value="orca_pod"]')).toHaveText('Orca Pod');
  await expect(creatureForms.locator('option[value="elephant_herd"]')).toHaveText('Elephant Herd');
  await expect(creatureForms.locator('option[value="t_rex"]')).toHaveText('T-Rex');
  await expect(page.locator('form[action="/admin/world/ghosts"]')).toHaveCount(2);
  await expect(page.locator('form[action="/admin/world/ghost-fleets"]')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Transports in transit' })).toBeVisible();
  const trafficRows = page.locator('.admin-traffic-table tbody tr');
  const trafficCount = await trafficRows.count();
  expect(trafficCount).toBeGreaterThanOrEqual(4);
  await expect(page.locator('.admin-traffic-table').getByText('The Restless Dead').first()).toBeVisible();
  await expect(page.locator('.admin-traffic-table').getByText('Legendary White Whale').first()).toBeVisible();
  await expect(page.locator('.admin-traffic-table').getByText('Common T-Rex').first()).toBeVisible();
  await expect(page.locator('.admin-traffic-progress')).toHaveCount(trafficCount);
  await expect(page.locator('form[action="/admin/world/weather"]')).not.toHaveCount(0);
  await assertHealthyRender(page);
  await page.screenshot({ path: path.resolve('migration-audit-admin-world.png'), fullPage: true });
  await page.goto(`${base}/events`);
  expect(await page.locator('.creature-card').count()).toBeGreaterThanOrEqual(2);
  await expect(page.locator('.creature-card.rarity-6').getByRole('heading', {
    name: 'Legendary White Whale'
  })).toBeVisible();
  await expect(page.locator('.creature-card.rarity-1').getByRole('heading', {
    name: 'Common T-Rex'
  })).toBeVisible();
  await expect(page.locator('.creature-card .threat-mark img')).toHaveCount(2);
  await expect(page.getByText(/Drops up to .* Ore|bounty slots|combat class/i))
    .toHaveCount(0);
  await expect(page.locator('.ghost-card')).toHaveCount(2);
  await expect(page.getByRole('heading', { name: 'The restless dead' })).toBeVisible();
  await expect(page.getByText(/Pillage|attack patrols/i)).toHaveCount(0);
  expect(await page.locator('.threat-card').first().evaluate((card) =>
    getComputedStyle(card).gridTemplateColumns)).toMatch(/^82px /u);
  expect(await page.locator('.threat-mark img').evaluateAll((images) => images.every((image) => {
    const imageBox = image.getBoundingClientRect();
    const railBox = image.closest('.threat-mark').getBoundingClientRect();
    return Math.round(imageBox.width) === 64 && Math.round(imageBox.height) === 64
      && imageBox.left >= railBox.left && imageBox.right <= railBox.right;
  }))).toBe(true);
  await expect(page.locator('.ghost-card h3').first()).toHaveCSS('color', 'rgb(246, 241, 232)');
  await expect(page.locator('.ghost-card .threat-facts dd').first())
    .toHaveCSS('color', 'rgb(215, 211, 202)');
  await expect(page.locator('.ghost-card .threat-condition').first())
    .toHaveText(/^(Unhurt|Wounded|Seriously wounded)$/u);
  await expect(page.locator('link[rel="stylesheet"][href^="/app.css"]'))
    .toHaveAttribute('href', /\/app\.css\?v=[0-9a-f]{12}/u);
  await assertHealthyRender(page);
  await page.screenshot({ path: path.resolve('migration-audit-ghost-routes.png'), fullPage: true });
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto(`${base}/events`);
  expect(await page.locator('.threat-card').first().evaluate((card) =>
    getComputedStyle(card).gridTemplateColumns)).toMatch(/^66px /u);
  expect(await page.locator('.threat-mark img').evaluateAll((images) => images.every((image) => {
    const box = image.getBoundingClientRect();
    return Math.round(box.width) === 52 && Math.round(box.height) === 52;
  }))).toBe(true);
  await assertHealthyRender(page);
  await page.screenshot({ path: path.resolve('migration-audit-ghost-routes-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${base}/chat`);
  const chatLog = page.locator('#chat-log');
  await expect(page.locator('.chat-page > .page-title')).toBeVisible();
  await expect(page.locator('.chat-console')).toBeVisible();
  await expect(page.locator('.chat-sidecar')).toBeVisible();
  await expect(page.locator('#chat-live-status')).toContainText('Live');
  await expect(chatLog).toHaveCSS('overflow-y', 'auto');
  expect(await chatLog.locator('.chat-row').evaluateAll((rows) => {
    const first = rows[0].getBoundingClientRect();
    const second = rows[1].getBoundingClientRect();
    return Math.round(second.top - first.bottom);
  })).toBe(0);
  await expect.poll(() => chatLog.evaluate((element) =>
    Math.round(element.scrollHeight - element.scrollTop - element.clientHeight)))
    .toBeLessThanOrEqual(1);
  await expect(page.locator('.chat-row-player')).toHaveCount(2);
  expect(await page.locator('.chat-row-world').count()).toBeGreaterThanOrEqual(3);
  await expect(page.getByText('Restless dead', { exact: true }).first()).toBeVisible();
  await expect(page.locator('.chat-row-rare, .chat-rare-item')).toHaveCount(0);
  await expect(page.getByText(/ResponsiveAudit found a Fabled/)).toHaveCount(0);
  await expect(page.locator('.chat-row-dwarf')).toHaveCount(1);
  await expect(page.getByText(/ResponsiveAudit captured a Yellow Dwarf/)).toBeVisible();
  await expect(page.locator('.chat-row-dwarf .chat-dwarf-item'))
    .toHaveAttribute('href', `/items/${catalog.dwarfByRarity.get(1).itemId}`);
  await expect(page.locator('.chat-row-dwarf .chat-dwarf-item img')).toBeVisible();
  await expect(page.locator('.chat-row-dwarf .chat-dwarf-item img'))
    .toHaveCSS('border-top-width', '0px');
  await expect(page.locator('.chat-row-dwarf .chat-dwarf-item img'))
    .toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('.chat-row-dwarf .chat-dwarf-item'))
    .toHaveCSS('color', 'rgb(51, 54, 47)');
  await expect(page.locator('.chat-row-world:not(.chat-row-dwarf) .chat-world-message').first())
    .toHaveCSS('font-weight', '400');
  await expect(page.locator('.chat-row-dwarf .chat-world-message'))
    .toHaveCSS('font-weight', '400');
  expect(await page.locator('.chat-row-world').evaluateAll((rows) =>
    rows.every((row) => row.querySelectorAll('a').length === 1))).toBe(true);
  const ignoreAction = page.getByRole('button', { name: 'Ignore RenderTrader in public chat' });
  await expect(ignoreAction).toBeVisible();
  await expect(ignoreAction).toHaveCSS('border-top-width', '0px');
  await expect(page.locator('.chat-row-player'))
    .toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('.chat-row-world').first())
    .toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('.chat-row-dwarf'))
    .toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(page.locator('.chat-speaker')).toHaveCSS('color', 'rgb(0, 0, 0)');
  await expect(page.locator('.chat-message')).toHaveCSS('color', 'rgb(51, 54, 47)');
  await expect(page.locator('.chat-row time').first()).toHaveAttribute('datetime', /T/);
  await assertHealthyRender(page);
  await page.screenshot({ path: path.resolve('migration-audit-public-chat.png'), fullPage: true });
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto(`${base}/chat`);
  await expect(page.locator('.chat-send')).toBeVisible();
  expect((await page.locator('.chat-send').boundingBox()).width).toBeGreaterThan(250);
  await assertHealthyRender(page);
  await page.screenshot({ path: path.resolve('migration-audit-public-chat-mobile.png'), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${base}/exchange`);
  await expect(page.locator('.market-controls')).toBeVisible();
  await expect(page.locator('.market-item-card')).not.toHaveCount(0);
  await expect(page.locator('.market-buy-form button').first()).toBeVisible();
  await page.screenshot({ path: path.resolve('market-audit-desktop.png'), fullPage: true });
  await page.setViewportSize({ width: 360, height: 900 });
  await assertHealthyRender(page);
  await page.screenshot({ path: path.resolve('market-audit-mobile.png'), fullPage: true });
  const journeys = [
    '/', '/inventory', '/exchange', '/market', '/factories', '/vehicles', '/events', '/map',
    '/messages', '/chat', '/account', '/admin', '/admin/world', '/oil-field'
  ];
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const journey of journeys) {
      await page.goto(`${base}${journey}`, { waitUntil: 'domcontentloaded' });
      await assertHealthyRender(page);
      expect(await page.evaluate(() => ({
        viewport: document.documentElement.clientWidth,
        document: document.documentElement.scrollWidth,
        body: document.body.scrollWidth
      }))).toEqual({ viewport: width, document: width, body: width });
    }
  }
  await page.setViewportSize({ width: 360, height: 900 });
  await page.goto(`${base}/inventory`);
  const playerNavigationToggle = page.locator('#player-nav-toggle');
  await expect(playerNavigationToggle).toBeVisible();
  await expect(playerNavigationToggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#player-nav-panel')).toBeHidden();
  await playerNavigationToggle.click();
  await expect(playerNavigationToggle).toHaveAttribute('aria-expanded', 'true');
  await expect(page.locator('#player-nav-panel')).toBeVisible();
  await expect(page.locator('#navlist a[aria-current="page"]')).toHaveText('Things');
  const navigationHeights = await page.locator('#navlist a').evaluateAll((links) =>
    links.map((link) => link.getBoundingClientRect().height));
  expect(navigationHeights.every((height) => height >= 44)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('#player-nav-panel')).toBeHidden();
  await expect(playerNavigationToggle).toBeFocused();
  const skipLink = page.locator('.skip-link');
  await skipLink.focus();
  await expect(skipLink).toBeVisible();
  const unnamedControls = await page.locator(
    'a[href], button, input:not([type="hidden"]), select, textarea'
  ).evaluateAll((controls) => controls.filter((control) => {
    const rectangle = control.getBoundingClientRect();
    if (!rectangle.width || !rectangle.height) return false;
    const imageAlternative = [...control.querySelectorAll('img')]
      .some((image) => image.getAttribute('alt'));
    return !(control.getAttribute('aria-label') || control.getAttribute('title')
      || control.textContent.trim() || imageAlternative || control.labels?.length);
  }).map((control) => control.outerHTML));
  expect(unnamedControls).toEqual([]);
  await page.screenshot({ path: path.resolve('production-mobile-audit.png'), fullPage: true });
  expect(errors).toEqual([]);
  expect(failedResponses).toEqual([]);
});
