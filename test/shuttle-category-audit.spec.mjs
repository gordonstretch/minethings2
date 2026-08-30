import { expect, test } from '@playwright/test';
import { createPlayer } from '../src/game.js';
import {
  loadLegacyCatalog, WOOD_CATALOG
} from '../src/legacy-catalog.js';
import { createApp } from '../src/server.js';
import { hashPassword, SqliteStore } from '../src/store.js';

const catalog = loadLegacyCatalog();
const password = 'shuttle browser test password';
let store;
let server;
let base;
let playerId;
let vehicleId;
let routeId;

test.beforeAll(async () => {
  store = new SqliteStore(':memory:');
  store.seedCatalog(catalog);
  const landType = Number(catalog.settings.route_type_ids.land);
  const vehicleType = catalog.vehicles.find((vehicle) => vehicle.routeType === landType
    && vehicle.capacity >= 2 && catalog.byId.get(vehicle.itemId)?.rarity >= 4
    && catalog.routes.some((route) => route.open && route.type === landType
      && route.city1Id !== route.city2Id && [route.city1Id, route.city2Id].includes(1)));
  const wood = catalog.items.find((item) => item.mineTypeId === WOOD_CATALOG.mineType.id
    && item.rarity === 6);
  if (!vehicleType || !wood) throw new Error('Shuttle browser fixture is incomplete.');
  const player = createPlayer(
    'Shuttle Browser', '', hashPassword(password), catalog, 1000, () => 0.5
  );
  player.inventory = { [vehicleType.itemId]: 1, [wood.id]: 2 };
  player.inventoryByCity = { [player.cityId]: player.inventory };
  const saved = store.addPlayer(player);
  playerId = saved.id;
  vehicleId = store.activateVehicle(saved.id, vehicleType.itemId);
  routeId = store.routesForVehicle(saved.id, vehicleId, 1900)
    .find((route) => !route.mission && route.destinationCityId !== player.cityId)?.id;
  if (!routeId) throw new Error('Shuttle browser fixture has no route.');
  server = createApp({ store, catalog, now: () => 2000 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  await new Promise((resolve, reject) =>
    server.close((error) => error ? reject(error) : resolve()));
  store.close();
});

test('all shuttle mine categories default selected and can be narrowed', async ({ page }) => {
  await page.goto(base);
  await page.locator('form[action="/login"] input[name="name"]').fill('Shuttle Browser');
  await page.locator('form[action="/login"] input[name="password"]').fill(password);
  await page.locator('form[action="/login"] button').click();
  await page.goto(`${base}/vehicles/${vehicleId}`);

  const categories = page.locator('.vehicle-shuttle-categories input[type="checkbox"]');
  expect(await categories.count()).toBeGreaterThan(1);
  expect(await categories.evaluateAll((inputs) =>
    inputs.filter((input) => input.checked).length)).toBe(await categories.count());

  await categories.evaluateAll((inputs, selectedName) => {
    for (const input of inputs) input.checked = input.name === selectedName;
  }, `category_${WOOD_CATALOG.mineType.id}`);
  await page.locator('form.vehicle-shuttle-form select[name="routeId"]')
    .selectOption(String(routeId));
  await page.getByRole('button', { name: 'Start shuttle' }).click();

  await expect(page).toHaveURL(`${base}/vehicles/${vehicleId}`);
  await expect(page.getByText('Cargo categories').locator('..'))
    .toContainText('Wood');
  expect(store.vehicleDetails(playerId, vehicleId, 2000).shuttle.mineTypeIds)
    .toEqual([WOOD_CATALOG.mineType.id]);
});
