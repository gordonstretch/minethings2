import { test, expect } from '@playwright/test';
import { createPlayer } from '../src/game.js';
import { loadLegacyCatalog } from '../src/legacy-catalog.js';
import { createApp } from '../src/server.js';
import { hashPassword, SqliteStore } from '../src/store.js';

const catalog = loadLegacyCatalog();
const password = 'item card audit password';
let store;
let server;
let base;
let detailItem;
let vehicleId;
let playerId;

test.beforeAll(async () => {
  store = new SqliteStore(':memory:');
  store.seedCatalog(catalog);
  const player = store.addPlayer(createPlayer('CardAuditor', '', hashPassword(password), catalog, 1000, () => 0.5));
  playerId = player.id;
  const home = player.inventoryByCity[player.homeCityId];
  const add = (itemId, quantity = 1) => { home[itemId] = (home[itemId] ?? 0) + quantity; };
  for (const entry of [
    catalog.equipment.find((candidate) => catalog.byId.get(candidate.itemId)?.rarity === 6),
    catalog.explosives.find((candidate) => catalog.byId.get(candidate.itemId)?.rarity === 6),
    catalog.gadgetItems.find((candidate) => catalog.byId.get(candidate.itemId)?.rarity === 5),
    catalog.vehicles.find((candidate) => candidate.routeType === 0),
    catalog.boxes.find((candidate) => catalog.byId.get(candidate.itemId)?.rarity === 4)
  ].filter(Boolean)) add(entry.itemId, 2);
  const commonExplosive = catalog.explosives.find((candidate) =>
    catalog.byId.get(candidate.itemId)?.rarity === 1);
  home[commonExplosive.itemId] = 150;
  for (const element of catalog.avatarElements.filter((candidate) => candidate.typeId <= 3).slice(0, 3)) add(element.itemId);
  detailItem = catalog.items.find((item) => item.rarity === 6 && item.repairedItemId === null);
  add(detailItem.id);
  add(catalog.dwarfTiers[0].itemId);
  const damagedEquipment = catalog.items.find((item) =>
    item.repairedItemId && catalog.equipmentByItemId.has(item.repairedItemId));
  add(damagedEquipment.id);
  const oilCityId = 2;
  player.inventoryByCity[oilCityId] ??= {};
  for (const machine of catalog.machines.filter((candidate) => ['pump', 'power', 'flower'].includes(candidate.type))) {
    player.inventoryByCity[oilCityId][machine.itemId] = 1;
  }
  for (const name of ['Helicopter', 'Search Plane', 'Bomber']) {
    const item = catalog.items.find((candidate) => candidate.name === name);
    if (item) {
      player.inventoryByCity[oilCityId][item.id] = 1;
      add(item.id);
    }
  }
  player.inventory = home;
  store.savePlayer(player);
  store.database.prepare(`
    INSERT INTO discoveries
      (player_id, position, item_id, mine_id, city_id, found_at, exploded, dwarfed)
    VALUES (?, ?, ?, 0, 1, ?, 0, 1)
  `).run(player.id, 100, detailItem.id, 1999);
  const vehicleItemId = catalog.vehicles.find((candidate) => candidate.routeType === 0).itemId;
  player.knownCityIds = [player.cityId, 4];
  player.inventoryByCity[4] = { [vehicleItemId]: 3 };
  player.inventory = home;
  store.savePlayer(player);
  store.database.prepare(
    'INSERT OR IGNORE INTO known_cities (player_id, city_id) VALUES (?, 4)'
  ).run(player.id);
  vehicleId = store.activateVehicle(player.id, vehicleItemId);
  server = createApp({ store, catalog, now: () => 2000 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  if (server) await new Promise((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve()));
  store.close();
});

async function login(page) {
  await page.goto(base);
  await page.locator('form[action="/login"] input[name="name"]').fill('CardAuditor');
  await page.locator('form[action="/login"] input[name="password"]').fill(password);
  await page.locator('form[action="/login"] button').click();
}

async function expectLinkedCards(page, route) {
  await page.goto(`${base}${route}`);
  const cards = page.locator('article.item-card[data-item-id]');
  await expect(cards, `${route} should render item cards`).not.toHaveCount(0);
  expect(await cards.evaluateAll((entries) => entries.every((card) => {
    const link = card.querySelector(':scope > a.item-card-link');
    return link?.getAttribute('href') === `/items/${card.dataset.itemId}`;
  })), `${route} should link every item card to its detail page`).toBe(true);
  expect(await page.locator('img').evaluateAll((images) =>
    images.filter((image) => !image.complete || image.naturalWidth === 0).map((image) => image.src))).toEqual([]);
  expect(await page.locator('body').evaluate((body) =>
    body.scrollWidth > document.documentElement.clientWidth + 1), `${route} should not overflow the viewport`).toBe(false);
}

test('renders item records exclusively as linked cards with large detail artwork', async ({ page }) => {
  await login(page);
  for (const route of ['/inventory', '/exchange', '/mines/1/equipment', '/gadgets', '/melds/52',
    '/avatar', '/vehicles', `/vehicles/${vehicleId}`, '/vehicles/boxes', '/factories', '/dwarves',
    '/miners/CardAuditor']) {
    await expectLinkedCards(page, route);
  }
  await page.goto(`${base}/oil-field`);
  await expect(page.locator('#oil-board-status')).toContainText('Oil Field ready');
  await expect(page.locator('select[name="machineId"]')).toHaveCount(0);
  await expect(page.locator('.oil-rack-machine').first()).toBeVisible();
  await page.goto(`${base}/inventory`);
  expect(await page.locator('.inventory-item-card').count()).toBeGreaterThan(0);
  await expect(page.locator('.inventory-item-card .item-card-actions > .item-actions')).toHaveCount(0);
  const specificInventoryItems = [
    catalog.equipment.find((candidate) => catalog.byId.get(candidate.itemId)?.rarity === 6),
    catalog.explosives.find((candidate) => catalog.byId.get(candidate.itemId)?.rarity === 6),
    catalog.avatarElements.filter((candidate) => candidate.typeId <= 3)[0]
  ].map((entry) => catalog.byId.get(entry.itemId));
  for (const item of specificInventoryItems) {
    const icon = item.icon;
    expect(await page.locator(`.inventory-item-card img[src="${icon}"]`).count()).toBeGreaterThan(0);
  }
  expect(await page.locator('.inventory-item-card.item-card-damaged').count()).toBeGreaterThan(0);
  await page.goto(`${base}/dwarves`);
  expect(await page.locator('.dwarf-findings, #dwarf-findings-feed').count()).toBe(0);
  await page.goto(`${base}/avatar`);
  await expect(page.locator('select[name^="type_"]')).toHaveCount(0);
  await page.goto(`${base}/factories`);
  await expect(page.locator('select[name="itemId"]')).toHaveCount(0);
  await page.goto(`${base}/mines/1/equipment`);
  await expect(page.locator('.loadout-item, .fitting-choice, .detonator.unavailable')).toHaveCount(0);

  await page.goto(`${base}/items/${detailItem.id}`);
  const artwork = page.locator('.detail-art .detail-image');
  await expect(artwork).toBeVisible();
  const box = await artwork.boundingBox();
  expect(box.width).toBeGreaterThanOrEqual(285);
  expect(box.height).toBeGreaterThanOrEqual(225);
  await expect(page.locator('.detail-art .detail-icon')).toHaveCount(0);
});

test('keeps unavailable stored vehicle cards legible at a compact desktop width', async ({ page }) => {
  await page.setViewportSize({ width: 910, height: 733 });
  await login(page);
  store.changeCity(playerId, 4, 2000);
  try {
    await page.goto(`${base}/vehicles`);
    const cards = page.locator('.stored-vehicle-grid .item-card');
    await expect(cards).toHaveCount(1);
    const card = cards.first();
    await expect(card.getByText(/no valid routes from Belfort/i)).toBeVisible();
    const layout = await card.evaluate((element) => {
      const link = element.querySelector('.item-card-link').getBoundingClientRect();
      const copy = element.querySelector('.item-card-copy').getBoundingClientRect();
      const actions = element.querySelector('.item-card-actions').getBoundingClientRect();
      const bounds = element.getBoundingClientRect();
      return {
        actionBelowCopy: actions.top >= link.bottom - 1,
        copyWidth: copy.width,
        cardHeight: bounds.height,
        actionInsideCard: actions.right <= bounds.right + 1
          && actions.bottom <= bounds.bottom + 1
      };
    });
    expect(layout.actionBelowCopy).toBe(true);
    expect(layout.copyWidth).toBeGreaterThan(150);
    expect(layout.cardHeight).toBeLessThan(180);
    expect(layout.actionInsideCard).toBe(true);
    expect(await page.locator('body').evaluate((body) =>
      body.scrollWidth > document.documentElement.clientWidth + 1)).toBe(false);
  } finally {
    store.changeCity(playerId, 1, 2001);
  }
});

test('keeps all four detonation quantities at the bottom of each explosive card', async ({ page }) => {
  await login(page);
  await page.goto(`${base}/mines/1/equipment`);
  const commonExplosive = catalog.explosives.find((candidate) =>
    catalog.byId.get(candidate.itemId)?.rarity === 1);
  const card = page.locator(`.detonator-grid .item-card[data-item-id="${commonExplosive.itemId}"]`);
  await expect(card).toBeVisible();
  const buttons = card.locator('.detonator-option');
  await expect(buttons).toHaveCount(4);
  await expect(card.getByRole('button', { name: `Detonate 1 ${catalog.byId.get(commonExplosive.itemId).name}` })).toBeEnabled();
  await expect(card.getByRole('button', { name: `Detonate 10 ${catalog.byId.get(commonExplosive.itemId).name}` })).toBeEnabled();
  await expect(card.getByRole('button', { name: `Detonate 100 ${catalog.byId.get(commonExplosive.itemId).name}` })).toBeEnabled();
  await expect(card.getByRole('button', { name: `Detonate the maximum of 150 ${catalog.byId.get(commonExplosive.itemId).name}` })).toBeEnabled();
  expect(await card.evaluate((element) => {
    const actions = element.querySelector('.item-card-actions');
    const link = element.querySelector('.item-card-link');
    const cardBox = element.getBoundingClientRect();
    const actionBox = actions.getBoundingClientRect();
    return actionBox.top >= link.getBoundingClientRect().bottom
      && cardBox.bottom - actionBox.bottom < 12;
  })).toBe(true);
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'detonation-options-audit.png', fullPage: false });
});
