import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPlayer } from '../src/game.js';
import { loadLegacyCatalog } from '../src/legacy-catalog.js';
import { createApp } from '../src/server.js';
import { hashPassword, SqliteStore } from '../src/store.js';

const catalog = loadLegacyCatalog();
const password = 'meld reveal audit password';
const meld = catalog.melds.find((candidate) => candidate.public
  && candidate.requirements.reduce((sum, requirement) => sum + requirement.count, 0) > 1);
let directory;
let server;
let base;

function inventoryForMeld() {
  const inventory = {};
  for (const requirement of meld.requirements) {
    inventory[requirement.itemId] = (inventory[requirement.itemId] ?? 0) + requirement.count;
  }
  return inventory;
}

test.beforeAll(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-meld-reveal-'));
  const databaseFile = path.join(directory, 'audit.sqlite');
  const store = new SqliteStore(databaseFile);
  store.seedCatalog(catalog);

  const maker = createPlayer('MeldRevealAudit', '', hashPassword(password), catalog, 1000, () => 0.5);
  maker.inventory = inventoryForMeld();
  maker.inventoryByCity = { [maker.cityId]: maker.inventory };
  const savedMaker = store.addPlayer(maker);

  const requirement = meld.requirements[0];
  const storer = createPlayer('MeldStorageAudit', '', hashPassword(password), catalog, 1000, () => 0.5);
  storer.inventory = { [requirement.itemId]: 1 };
  storer.inventoryByCity = { [storer.cityId]: storer.inventory };
  const savedStorer = store.addPlayer(storer);
  const ownMeld = store.database.prepare(
    'INSERT INTO player_melds (player_id, meld_id, created_at) VALUES (?, ?, 1)'
  );
  for (const candidate of catalog.melds.filter((entry) => entry.public && entry.id !== meld.id)) {
    ownMeld.run(savedStorer.id, candidate.id);
  }
  store.close();

  server = createApp({ databaseFile, legacyJsonFile: null });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  fs.rmSync(directory, { recursive: true, force: true });
});

async function login(page, name) {
  await page.goto(base);
  await page.locator('form[action="/login"] input[name="name"]').fill(name);
  await page.locator('form[action="/login"] input[name="password"]').fill(password);
  await page.locator('form[action="/login"] button').click();
  await expect(page).toHaveURL(`${base}/`);
}

test('renders Meld creation as an occasion while storage remains quiet', async ({ page }) => {
  await login(page, 'MeldRevealAudit');
  await page.goto(`${base}/melds/${meld.id}`);
  await page.getByRole('button', { name: /Create from storage and .+ things/ }).click();
  const dialog = page.locator('#meld-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'A new Meld is born!' })).toBeVisible();
  await expect(dialog.getByRole('heading', { name: meld.name })).toBeVisible();
  await expect(dialog.locator('.meld-component-art')).toHaveCount(Math.min(6, meld.requirements.length));
  await expect(dialog.locator('.meld-reveal-recipe li')).toHaveCount(meld.requirements.length);
  await expect(dialog.getByRole('link', { name: 'Full Meld details' })).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Meld collection' })).toBeVisible();
  const visualStyle = await dialog.evaluate((element) => {
    const styleOf = (selector) => getComputedStyle(element.querySelector(selector));
    const dialogStyle = getComputedStyle(element);
    return {
      dialogRadius: dialogStyle.borderRadius,
      dialogAccent: dialogStyle.borderLeftWidth,
      headerAlignment: styleOf('.meld-dialog-head').textAlign,
      markRadius: styleOf('.meld-occasion-mark').borderRadius,
      cardRadius: styleOf('.meld-occasion-card').borderRadius,
      titleTransform: styleOf('.meld-dialog-head h2').textTransform
    };
  });
  expect(visualStyle).toEqual({
    dialogRadius: '0px', dialogAccent: '6px', headerAlignment: 'left',
    markRadius: '0px', cardRadius: '0px', titleTransform: 'uppercase'
  });
  const brokenImages = await dialog.locator('img').evaluateAll((images) => images
    .filter((image) => !image.complete || image.naturalWidth === 0).map((image) => image.src));
  expect(brokenImages).toEqual([]);
  expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.waitForTimeout(750);
  await page.screenshot({ path: path.resolve('meld-occasion-audit.png'), fullPage: false });
  await dialog.getByRole('button', { name: 'Behold the Meld' }).click();
  await expect(dialog).not.toBeVisible();

  await page.context().clearCookies();
  await login(page, 'MeldStorageAudit');
  await page.goto(`${base}/inventory`);
  await page.getByRole('button', { name: 'Meld', exact: true }).click();
  await expect(page.locator('.quiet-notice')).toContainText('moved to capacity-free Meld storage');
  await expect(page.locator('#meld-dialog')).toHaveCount(0);
  await expect(page.locator('#flash-dialog')).not.toBeVisible();
});
