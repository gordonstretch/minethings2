import { test, expect } from '@playwright/test';
import { createPlayer } from '../src/game.js';
import { loadLegacyCatalog } from '../src/legacy-catalog.js';
import { createApp } from '../src/server.js';
import { hashPassword, SqliteStore } from '../src/store.js';

const password = 'bar rendered audit password';
let store;
let server;
let base;
let player;

test.beforeAll(async () => {
  store = new SqliteStore(':memory:');
  store.seedCatalog(loadLegacyCatalog());
  store.ensureWorldMaps();
  const catalog = store.loadCatalog();
  player = store.addPlayer(createPlayer(
    'Bar Render Audit', '', hashPassword(password), catalog, Date.now(), () => 0.5
  ));
  store.database.prepare('UPDATE players SET email_verified_at = 1 WHERE id = ?')
    .run(player.id);
  server = createApp({ store, random: () => 0.99 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  if (server) {
    await new Promise((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()));
  }
  store?.close();
});

async function login(page) {
  await page.goto(base);
  await page.locator('form[action="/login"] input[name="name"]').fill(player.name);
  await page.locator('form[action="/login"] input[name="password"]').fill(password);
  await page.locator('form[action="/login"] button').click();
  await expect(page).toHaveURL(`${base}/`);
}

test('renders a responsive, borderless local bar and posts to its live room', async ({ page }) => {
  await login(page);
  for (const width of [1440, 360]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(`${base}/explore/bar`);
    await expect(page.getByRole('heading', { level: 1, name: / Bar$/u })).toBeVisible();
    await expect(page.getByText('Presence is the lock.')).toBeVisible();
    await expect(page.locator('#bar-participants li')).toHaveCount(1);
    await expect(page.locator('.bar-person-link')).toHaveCSS('border-top-width', '0px');
    await expect(page.locator('.bar-chat-log')).toHaveCSS('overflow-y', 'auto');
    expect(await page.evaluate(() => document.body.scrollWidth)).toBe(width);
  }
  await page.locator('#bar-message').fill('Quiet table, serious business.');
  await page.getByRole('button', { name: 'Say it' }).click();
  await expect(page.locator('.bar-message p')).toHaveText('Quiet table, serious business.');
  await expect(page.locator('.bar-speaker-link')).toHaveCSS('border-top-width', '0px');
});
