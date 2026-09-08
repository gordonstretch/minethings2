import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createPlayer } from '../src/game.js';
import { loadLegacyCatalog } from '../src/legacy-catalog.js';
import { createApp } from '../src/server.js';
import { hashPassword, SqliteStore } from '../src/store.js';

const password = 'live browser audit password';
let directory;
let databaseFile;
let server;
let store;
let base;
let playerId;
let cityId;
let itemId;
let initialQuantity;
let loadoutVehicleId;
let loadoutModId;
let loadoutWeaponId;

test.beforeAll(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-live-browser-'));
  databaseFile = path.join(directory, 'game.sqlite');
  store = new SqliteStore(databaseFile);
  const catalog = loadLegacyCatalog();
  store.seedCatalog(catalog);
  const player = store.addPlayer(createPlayer(
    'LivePageAudit', '', hashPassword(password), catalog, 1000, () => 0.5
  ));
  store.database.prepare('UPDATE mines SET next_find_at = 9999999999999 WHERE player_id = ?')
    .run(player.id);
  playerId = player.id;
  cityId = player.cityId;
  const inventory = store.playerById(player.id, 1000).inventoryByCity[cityId];
  itemId = Number(Object.keys(inventory)[0]);
  initialQuantity = inventory[itemId];
  const landVehicle = catalog.vehicles.find((vehicle) => vehicle.routeType === 0
    && catalog.byId.get(vehicle.itemId)?.rarity >= 4 && vehicle.capacity >= 3);
  const allowedFittingRarities = catalog.settings.arms_rarities_by_vehicle_rarity[
    catalog.byId.get(landVehicle.itemId).rarity
  ];
  const mod = catalog.mods.find((entry) =>
    allowedFittingRarities.includes(catalog.byId.get(entry.itemId).rarity));
  const weapon = catalog.weapons.find((entry) =>
    allowedFittingRarities.includes(catalog.byId.get(entry.itemId).rarity));
  const loadoutOwner = store.playerById(player.id, 1000);
  loadoutOwner.profession = 1;
  loadoutOwner.inventory[landVehicle.itemId] = 1;
  loadoutOwner.inventory[mod.itemId] = 1;
  loadoutOwner.inventory[weapon.itemId] = 1;
  loadoutOwner.inventory[Number(catalog.settings.bolt_item_id)] = 100;
  store.savePlayer(loadoutOwner);
  loadoutVehicleId = store.activateVehicle(player.id, landVehicle.itemId);
  loadoutModId = mod.id;
  loadoutWeaponId = weapon.id;
  server = createApp({ store, catalog, now: () => 2000, liveUpdateDebounceMs: 5 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  store.close();
  fs.rmSync(directory, { recursive: true, force: true });
});

async function login(page) {
  await page.goto(base);
  const registrationName = page.locator('form[action="/register"] input[name="name"]');
  await registrationName.fill('هومة من ق');
  expect(await registrationName.evaluate((input) => ({
    mismatch: input.validity.patternMismatch,
    valid: input.checkValidity()
  }))).toEqual({ mismatch: false, valid: true });
  await registrationName.fill('Invalid\u202eMiner');
  expect(await registrationName.evaluate((input) => input.validity.patternMismatch)).toBe(true);
  const form = page.locator('form[action="/login"]');
  await form.locator('input[name="name"]').fill('LivePageAudit');
  await form.locator('input[name="password"]').fill(password);
  await form.locator('button').click();
  await expect(page).toHaveURL(`${base}/`);
}

test('patches database changes in place and preserves unfinished forms', async ({ page }) => {
  test.setTimeout(30_000);
  await login(page);
  await page.goto(`${base}/inventory`);
  await expect(page.locator('.live-update-status')).toHaveCount(0);
  await page.evaluate(() => { window.__liveDocumentIdentity = 'same-document'; });

  let external = new DatabaseSync(databaseFile);
  external.prepare(`
    UPDATE inventory SET quantity = quantity + 1
    WHERE player_id = ? AND city_id = ? AND item_id = ?
  `).run(playerId, cityId, itemId);
  external.close();

  await expect(page.locator(`[data-item-id="${itemId}"]`).first())
    .toContainText(`${initialQuantity + 1} owned`);
  expect(await page.evaluate(() => window.__liveDocumentIdentity)).toBe('same-document');
  await page.waitForTimeout(250);
  const settledRevision = store.latestLiveUpdateId();
  await page.waitForTimeout(500);
  expect(store.latestLiveUpdateId()).toBe(settledRevision);

  await page.goto(`${base}/account`);
  await page.evaluate(() => { window.__liveDocumentIdentity = 'account-document'; });
  const email = page.locator('input[name="email"]');
  await email.fill('unsaved@example.test');
  external = new DatabaseSync(databaseFile);
  external.prepare('UPDATE players SET credits = credits + 5 WHERE id = ?').run(playerId);
  external.close();

  await expect(email).toHaveValue('unsaved@example.test');
  expect(await page.evaluate(() => window.__liveDocumentIdentity)).toBe('account-document');
  await page.waitForTimeout(250);
  const accountRevision = store.latestLiveUpdateId();
  await page.waitForTimeout(500);
  expect(store.latestLiveUpdateId()).toBe(accountRevision);
});

test('preserves added journey legs when a live update races the route picker', async ({ page }) => {
  await login(page);
  await page.goto(`${base}/vehicles/${loadoutVehicleId}`);
  const planner = page.locator('[data-journey-planner]');
  await planner.getByRole('button', { name: 'Add onward leg' }).click();
  const onward = planner.locator('[data-journey-legs] select');
  await expect(onward).toHaveCount(1);
  const selectedRoute = await onward.inputValue();
  await expect(planner).toHaveAttribute('data-live-dirty', 'true');

  const external = new DatabaseSync(databaseFile);
  external.prepare('UPDATE players SET credits = credits + 1 WHERE id = ?').run(playerId);
  external.close();

  await expect(onward).toHaveCount(1);
  await expect(onward).toHaveValue(selectedRoute);
});

test('preserves an exact loadout preview across SSE and invalidates it on edit', async ({ page }) => {
  await login(page);
  await page.goto(`${base}/vehicles/${loadoutVehicleId}/customize`);
  const form = page.locator('[data-live-preview-form]');
  await form.locator(`input[name="mod_${loadoutModId}"]`).check();
  await form.locator(`input[name="weapon_${loadoutWeaponId}"]`).fill('1');
  await form.getByRole('button', { name: 'Preview loadout' }).click();

  const token = page.locator('[data-preview-binding][name="previewToken"]');
  await expect(token).toHaveCount(1);
  const tokenValue = await token.inputValue();
  await expect(page.locator('[data-live-preview-panel]'))
    .toContainText(/ready to commit/i);
  await expect(page.locator('[data-preview-commit]')).toBeVisible();
  await page.evaluate(() => { window.__loadoutPreviewDocument = 'same-document'; });

  let external = new DatabaseSync(databaseFile);
  const firstLiveName = 'Preview live one';
  external.prepare('UPDATE player_vehicles SET name = ? WHERE id = ?')
    .run(firstLiveName, loadoutVehicleId);
  external.close();

  await expect(page.locator('.vehicle-hero')).toContainText(firstLiveName);
  await expect(page.locator('.vehicle-hero')).not.toContainText(/rating\s+[\d,.]+/i);
  await expect(token).toHaveValue(tokenValue);
  await expect(page.locator('[data-preview-commit]')).toBeVisible();
  expect(await page.evaluate(() => window.__loadoutPreviewDocument)).toBe('same-document');

  const proposedWeapon = form.locator(`input[name="weapon_${loadoutWeaponId}"]`);
  await proposedWeapon.fill('0');
  await expect(page.locator('[data-preview-binding][name="previewToken"]')).toHaveCount(0);
  await expect(page.locator('[data-preview-commit]')).toHaveCount(0);
  await expect(page.locator('[data-live-preview-panel]')).toHaveAttribute('data-preview-stale', 'true');
  await expect(page.locator('[data-live-preview-panel]')).toContainText('Preview stale');

  external = new DatabaseSync(databaseFile);
  const staleLiveName = 'Preview live two';
  external.prepare('UPDATE player_vehicles SET name = ? WHERE id = ?')
    .run(staleLiveName, loadoutVehicleId);
  external.close();

  await expect(page.locator('.vehicle-hero')).toContainText(staleLiveName);
  await expect(page.locator('.vehicle-hero')).not.toContainText(/rating\s+[\d,.]+/i);
  await expect(proposedWeapon).toHaveValue('0');
  await expect(page.locator('[data-preview-binding][name="previewToken"]')).toHaveCount(0);
  await expect(page.locator('[data-preview-commit]')).toHaveCount(0);
  await expect(page.locator('[data-live-preview-panel]')).toContainText('Preview stale');
});

test('keeps an edited invalid preview stale through a later live update', async ({ page }) => {
  await login(page);
  await page.goto(`${base}/vehicles/${loadoutVehicleId}/customize`);
  const form = page.locator('[data-live-preview-form]');
  const proposedWeapon = form.locator(`input[name="weapon_${loadoutWeaponId}"]`);
  await proposedWeapon.evaluate((element) => element.removeAttribute('max'));
  await proposedWeapon.fill('999');
  await form.getByRole('button', { name: 'Preview loadout' }).click();
  await expect(page.locator('[data-live-preview-panel]')).toContainText(/cannot (?:be )?commit/i);
  await expect(page.locator('[data-preview-binding][name="previewToken"]')).toHaveCount(0);

  const invalidWeapon = page.locator('[data-live-preview-form]')
    .locator(`input[name="weapon_${loadoutWeaponId}"]`);
  await invalidWeapon.fill('998');
  await expect(page.locator('[data-live-preview-panel]')).toHaveAttribute('data-preview-stale', 'true');
  await expect(page.locator('[data-live-preview-panel]')).toContainText('Preview stale');

  const external = new DatabaseSync(databaseFile);
  const invalidLiveName = 'Invalid live preview';
  external.prepare('UPDATE player_vehicles SET name = ? WHERE id = ?')
    .run(invalidLiveName, loadoutVehicleId);
  external.close();

  await expect(page.locator('.vehicle-hero')).toContainText(invalidLiveName);
  await expect(page.locator('.vehicle-hero')).not.toContainText(/rating\s+[\d,.]+/i);
  await expect(invalidWeapon).toHaveValue('998');
  await expect(page.locator('[data-preview-binding][name="previewToken"]')).toHaveCount(0);
  await expect(page.locator('[data-preview-commit]')).toHaveCount(0);
  await expect(page.locator('[data-live-preview-panel]')).toContainText('Preview stale');
});

test('filters chat by multiple rating tiers, regions, and world events', async ({ page }) => {
  store.database.exec('DELETE FROM world_chat_announcements; DELETE FROM chats;');
  const vehicle = store.database.prepare(
    'SELECT item_id FROM player_vehicles WHERE id = ?'
  ).get(loadoutVehicleId);
  const owner = store.playerById(playerId, 2000, { settle: false });
  owner.inventory[vehicle.item_id] = (owner.inventory[vehicle.item_id] ?? 0) + 1;
  store.savePlayer(owner);
  const rankOneVehicleId = store.activateVehicle(playerId, vehicle.item_id, 1900);
  store.database.prepare('UPDATE player_vehicles SET rating = 1600 WHERE id = ?')
    .run(loadoutVehicleId);
  store.database.prepare('UPDATE player_vehicles SET rating = 1810 WHERE id = ?')
    .run(rankOneVehicleId);
  const insertAnnouncement = store.database.prepare(`
    INSERT INTO world_chat_announcements (event_key, body, path, created_at)
    VALUES (?, ?, '/events', ?)
  `);
  insertAnnouncement.run(
    `ship-sunk:${loadoutVehicleId}:filter-rank-6`, 'Rank 6 combat notice.', 1901
  );
  insertAnnouncement.run(
    `ship-sunk:${rankOneVehicleId}:filter-rank-1`, 'Rank 1 combat notice.', 1902
  );
  store.addChat(playerId, 'Regional miner chatter.', 1903);

  await login(page);
  await page.goto(`${base}/chat`);
  const rankOne = page.locator('[data-chat-rating-tier][value="1"]');
  const rankSix = page.locator('[data-chat-rating-tier][value="6"]');
  const hideWorldEvents = page.locator('[data-chat-hide-world-events]');
  await expect(page.locator('input[data-chat-rating-tier]')).toHaveCount(6);
  await expect(rankOne.locator('xpath=..')).toContainText('Yours');
  await expect(rankSix.locator('xpath=..')).toContainText('Yours');
  await expect(hideWorldEvents).toBeChecked();
  await expect(page.getByText('Rank 1 combat notice.', { exact: true })).toBeHidden();
  await expect(page.getByText('Regional miner chatter.', { exact: true })).toBeVisible();
  await hideWorldEvents.uncheck();

  await rankOne.check();
  await expect(page.getByText('Rank 1 combat notice.', { exact: true })).toBeVisible();
  await expect(page.getByText('Rank 6 combat notice.', { exact: true })).toBeHidden();
  await rankSix.check();
  await expect(page.getByText('Rank 1 combat notice.', { exact: true })).toBeVisible();
  await expect(page.getByText('Rank 6 combat notice.', { exact: true })).toBeVisible();

  await rankOne.uncheck();
  await rankSix.uncheck();
  await hideWorldEvents.check();
  await expect(page.getByText('Rank 1 combat notice.', { exact: true })).toBeHidden();
  await expect(page.getByText('Regional miner chatter.', { exact: true })).toBeVisible();
  await hideWorldEvents.uncheck();

  const hideRegion = page.locator('[data-chat-hidden-region]').first();
  await hideRegion.check();
  await expect(page.getByText('Regional miner chatter.', { exact: true })).toBeHidden();
  await page.locator('[data-chat-filter-reset]').click();
  await expect(hideWorldEvents).toBeChecked();
  await expect(page.getByText('Regional miner chatter.', { exact: true })).toBeVisible();

  await rankOne.check();
  const external = new DatabaseSync(databaseFile);
  external.prepare(`
    INSERT INTO world_chat_announcements (event_key, body, path, created_at)
    VALUES (?, 'Later Rank 6 combat notice.', '/events', 1904)
  `).run(`ship-sunk:${loadoutVehicleId}:filter-live-rank-6`);
  external.close();
  await expect(page.getByText('Later Rank 6 combat notice.', { exact: true })).toBeHidden();
  await expect(rankOne).toBeChecked();
  await expect(rankSix).not.toBeChecked();
});

test('follows live chat at the bottom without yanking a reader who scrolled up', async ({ page }) => {
  await login(page);
  let external = new DatabaseSync(databaseFile);
  const insertSeed = external.prepare(`
    INSERT INTO world_chat_announcements (event_key, body, path, created_at)
    VALUES (?, ?, '/events', ?)
  `);
  for (let index = 0; index < 24; index += 1) {
    insertSeed.run(`live-chat-seed-${index}`, `Earlier world event ${index + 1}.`, 2100 + index);
  }
  external.close();
  await page.goto(`${base}/chat`);
  const chatLog = page.locator('#chat-log');
  await page.locator('[data-chat-hide-world-events]').uncheck();
  await expect(page.locator('.chat-page > .page-title')).toBeVisible();
  await expect(page.locator('.chat-console')).toBeVisible();
  await expect(page.locator('#chat-live-status')).toContainText('Live');
  await expect(page.locator('.chat-row-world').filter({ hasText: 'Earlier world event' })).toHaveCount(24);
  const distanceFromBottom = () => chatLog.evaluate((element) =>
    Math.round(element.scrollHeight - element.scrollTop - element.clientHeight));
  await expect.poll(distanceFromBottom).toBeLessThanOrEqual(1);
  const draft = page.locator('input[name="body"]');
  await draft.fill('Do not lose this message');
  await page.evaluate(() => { window.__liveDocumentIdentity = 'chat-document'; });
  await chatLog.evaluate((element) => {
    element.scrollTop = 0;
    element.dispatchEvent(new Event('scroll'));
  });
  await expect.poll(() => chatLog.evaluate((element) => element.scrollTop)).toBe(0);

  external = new DatabaseSync(databaseFile);
  external.prepare(`
    INSERT INTO world_chat_announcements (event_key, body, path, created_at)
    VALUES ('live-world-event', 'A Kraken has awakened at sea.', '/events', 3000)
  `).run();
  external.close();

  await expect(page.getByText('A Kraken has awakened at sea.', { exact: true })).toBeVisible();
  await expect(draft).toHaveValue('Do not lose this message');
  expect(await page.evaluate(() => window.__liveDocumentIdentity)).toBe('chat-document');
  expect(await chatLog.evaluate((element) => element.scrollTop)).toBe(0);

  await chatLog.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    element.dispatchEvent(new Event('scroll'));
  });
  await expect.poll(distanceFromBottom).toBeLessThanOrEqual(1);
  external = new DatabaseSync(databaseFile);
  const yellowDwarfItemId = external.prepare(`
    SELECT item_id FROM catalog_dwarf_tiers WHERE rarity = 1
  `).get().item_id;
  const yellowDwarf = external.prepare(`
    SELECT catalog_items.name, catalog_items.icon, catalog_items.rarity,
      catalog_rarities.name AS rarity_name, catalog_cities.name AS city_name
    FROM catalog_items
    JOIN catalog_rarities ON catalog_rarities.id = catalog_items.rarity
    JOIN catalog_cities ON catalog_cities.id = ?
    WHERE catalog_items.id = ?
  `).get(cityId, yellowDwarfItemId);
  const findingEvent = external.prepare(`
    INSERT INTO live_update_events (scope, changed_at, event_type, payload_json)
    VALUES (?, 3001, 'items-found', '{}')
  `).run(`player:${playerId}`);
  const findingPayload = {
    eventId: Number(findingEvent.lastInsertRowid), itemId: yellowDwarfItemId,
    name: yellowDwarf.name, icon: yellowDwarf.icon, rarity: yellowDwarf.rarity,
    rarityName: yellowDwarf.rarity_name, quantity: 1,
    source: 'dwarf-capture', sourceName: 'Dwarf capture', cityId,
    cityName: yellowDwarf.city_name, foundAt: 3001, autoRecycled: false,
    path: `/items/${yellowDwarfItemId}`
  };
  external.prepare('UPDATE live_update_events SET payload_json = ? WHERE id = ?')
    .run(JSON.stringify(findingPayload), findingPayload.eventId);
  external.prepare(`
    INSERT INTO world_chat_announcements
      (event_key, announcement_type, body, path, created_at)
    VALUES ('live-dwarf-capture', 'dwarf-capture', ?, ?, 3001)
  `).run(`LivePageAudit captured a Yellow Dwarf while mining in ${yellowDwarf.city_name}.`,
    findingPayload.path);
  external.close();
  const findingNotice = page.locator('#flash-dialog');
  await expect(findingNotice).toBeVisible();
  const foundDwarf = findingNotice.locator(`.flash-item[data-item-id="${yellowDwarfItemId}"]`);
  await expect(foundDwarf).toContainText('Yellow Dwarf');
  await expect(foundDwarf).toContainText('Dwarf capture');
  await expect(foundDwarf.locator('.flash-item-link')).toHaveAttribute('href', findingPayload.path);
  await expect(foundDwarf.locator('img')).toBeVisible();
  const liveDwarf = page.locator('.chat-row-dwarf');
  await expect(liveDwarf).toContainText('LivePageAudit captured a Yellow Dwarf');
  await expect(liveDwarf.locator('.chat-dwarf-item img')).toBeVisible();
  await expect.poll(distanceFromBottom).toBeLessThanOrEqual(1);

  await draft.fill('Sent without replacing the page');
  await page.locator('#chat-compose-form').evaluate((form) => form.requestSubmit());
  await expect(page.getByText('Sent without replacing the page', { exact: true })).toBeVisible();
  await expect(draft).toHaveValue('');
  await expect(draft).toBeFocused();
  expect(await page.evaluate(() => window.__liveDocumentIdentity)).toBe('chat-document');
  await expect.poll(distanceFromBottom).toBeLessThanOrEqual(1);
});

test('keeps the Oil Field board stable instead of live-rebuilding an active placement surface', async ({ page }) => {
  await login(page);
  await page.goto(`${base}/oil-field`);
  await expect(page.locator('#board svg')).toBeVisible();
  await expect(page.locator('.live-update-status')).toHaveCount(0);
  await page.evaluate(() => {
    window.__oilBoardNode = document.querySelector('#board svg');
    window.__oilContentUpdates = 0;
    document.addEventListener('minethings:content-updated', () => {
      window.__oilContentUpdates += 1;
    });
  });

  const external = new DatabaseSync(databaseFile);
  external.prepare(`
    UPDATE oil_field_state
    SET oil_spill_progress_ms = oil_spill_progress_ms + 1
    WHERE id = 1
  `).run();
  external.close();
  await page.waitForTimeout(500);

  expect(await page.evaluate(() => window.__oilBoardNode === document.querySelector('#board svg')))
    .toBe(true);
  expect(await page.evaluate(() => window.__oilContentUpdates)).toBe(0);
});
