import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPlayer } from '../src/game.js';
import { loadLegacyCatalog } from '../src/legacy-catalog.js';
import { createApp } from '../src/server.js';
import { hashPassword, SqliteStore } from '../src/store.js';

const catalog = loadLegacyCatalog();
const password = 'casino rendered audit password';
const machines = [
  { slug: 'thing-o-matic', theme: 'thing-o-matic', cells: 9, path: '/casino' },
  { slug: 'bromo-sporefall', theme: 'bromo-sporefall', cells: 9,
    path: '/casino?machine=bromo-sporefall' },
  { slug: 'kings-lockbox', theme: 'kings-lockbox', cells: 9,
    path: '/casino?machine=kings-lockbox' },
  { slug: 'tzolkin-worldwheel-seven', theme: 'regional', cells: 24,
    path: '/casino?machine=tzolkin-worldwheel-seven' }
];
const regionalMachines = [
  { regionId: 1, slug: 'cinderwake-fuse-five', cells: 12, columns: 6, rows: 2,
    symbolCount: 6 },
  { regionId: 2, slug: 'ashfall-spore-ring', cells: 20, columns: 5, rows: 4,
    symbolCount: 7 },
  { regionId: 3, slug: 'stormcrag-timber-twins', cells: 18, columns: 6, rows: 3,
    symbolCount: 6 },
  { regionId: 4, slug: 'emberdeep-three-verses', cells: 20, columns: 4, rows: 5,
    symbolCount: 7 },
  { regionId: 5, slug: 'frostmere-aurora-mirror', cells: 24, columns: 6, rows: 4,
    symbolCount: 8 },
  { regionId: 6, slug: 'brimstone-furnace-four', cells: 25, columns: 5, rows: 5,
    symbolCount: 6 },
  { regionId: 7, slug: 'tzolkin-worldwheel-seven', cells: 24, columns: 8, rows: 3,
    symbolCount: 8 }
];
const viewports = [
  { name: 'desktop', width: 1600, height: 1000 },
  { name: 'mobile', width: 390, height: 844 }
];
let directory;
let server;
let base;

test.beforeAll(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-casino-rendered-'));
  const databaseFile = path.join(directory, 'audit.sqlite');
  const store = new SqliteStore(databaseFile);
  store.seedCatalog(catalog);
  store.ensureWorldMaps(1_000);
  for (const machine of regionalMachines) {
    const player = store.addPlayer(createPlayer(
      `CasinoAudit${machine.regionId}`, '', hashPassword(password), catalog, 1000, () => 0.5
    ));
    store.database.prepare(`
      UPDATE players SET city_id = (SELECT capital_city_id FROM world_maps WHERE id = ?)
      WHERE id = ?
    `).run(machine.regionId, player.id);
  }
  store.close();
  server = createApp({ databaseFile, legacyJsonFile: null });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  if (server) {
    await new Promise((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()));
  }
  if (directory) {
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
});

async function login(page, playerName = 'CasinoAudit7') {
  await page.goto(base);
  await page.locator('form[action="/login"] input[name="name"]').fill(playerName);
  await page.locator('form[action="/login"] input[name="password"]').fill(password);
  await page.locator('form[action="/login"] button').click();
  await expect(page).toHaveURL(`${base}/`);
}

async function expectNoHorizontalOverflow(page) {
  expect(await page.locator('body').evaluate((body) =>
    body.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
}

test('keeps every casino machine distinct and aligned at desktop and mobile sizes', async ({ page }, testInfo) => {
  await login(page);

  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const themeSignatures = [];

    for (const machine of machines) {
      await test.step(`${machine.slug} at ${viewport.name} size`, async () => {
        await page.goto(`${base}${machine.path}`);

        const casinoPage = page.locator(`.casino-page.casino-theme-${machine.theme}`);
        const cabinet = page.locator(
          `#casino-machine[data-casino-machine="${machine.slug}"]`
        );
        const picker = page.locator(
          'nav.casino-floor[aria-label="Choose a casino machine"]'
        );
        const pickerLinks = picker.locator('a.casino-floor-card');
        const currentChoice = picker.locator(
          'a.casino-floor-card[aria-current="page"].is-current'
        );

        await expect(casinoPage).toHaveCount(1);
        await expect(casinoPage.locator(':scope > .page-title')).toBeVisible();
        await expect(page.locator('.casino-hero')).toHaveCount(0);
        await expect(page.locator('#casino-machine')).toHaveCount(1);
        await expect(cabinet).toHaveCount(1);
        await expect(cabinet.locator('[data-casino-cell]')).toHaveCount(machine.cells);
        await expect(picker).toHaveCount(1);
        await expect(pickerLinks).toHaveCount(4);
        await expect(currentChoice).toHaveCount(1);
        await expect(currentChoice).toHaveClass(/\bis-current\b/u);
        await expect(casinoPage.locator(':scope > .casino-stats dt')).toHaveCount(4);
        await expect(casinoPage.getByText('Global spins', { exact: true })).toBeVisible();

        const linkedSlugs = await pickerLinks.evaluateAll((links) => links.map((link) =>
          new URL(link.href).searchParams.get('machine') ?? 'thing-o-matic').sort());
        expect(linkedSlugs).toEqual(machines.map(({ slug }) => slug).sort());
        expect(await currentChoice.evaluate((link) =>
          new URL(link.href).searchParams.get('machine') ?? 'thing-o-matic')).toBe(machine.slug);

        const layout = await casinoPage.evaluate((element) => {
          const content = element.closest('#content');
          const title = element.querySelector(':scope > .page-title');
          const cabinetElement = element.querySelector(':scope > .casino-machine');
          const stats = element.querySelector(':scope > .casino-stats');
          const boxes = Object.fromEntries(
            [...Object.entries({ content, page: element, title, cabinet: cabinetElement, stats })]
              .map(([key, target]) => [key, target.getBoundingClientRect()])
          );
          const contentStyle = getComputedStyle(content);
          const pageStyle = getComputedStyle(element);
          const cabinetStyle = getComputedStyle(cabinetElement);
          return {
            expectedLeft: boxes.content.left + Number.parseFloat(contentStyle.paddingLeft),
            expectedRight: boxes.content.right - Number.parseFloat(contentStyle.paddingRight),
            pageLeft: boxes.page.left,
            pageRight: boxes.page.right,
            pageWidth: boxes.page.width,
            titleWidth: boxes.title.width,
            cabinetLeft: boxes.cabinet.left,
            cabinetRight: boxes.cabinet.right,
            cabinetWidth: boxes.cabinet.width,
            statsWidth: boxes.stats.width,
            pageBackground: pageStyle.backgroundImage,
            themeSignature: [
              cabinetStyle.backgroundImage,
              cabinetStyle.backgroundColor,
              cabinetStyle.borderTopColor,
              cabinetStyle.borderRightColor,
              cabinetStyle.borderBottomColor,
              cabinetStyle.borderLeftColor,
              cabinetStyle.boxShadow
            ].join('|')
          };
        });
        expect(Math.abs(layout.pageLeft - layout.expectedLeft)).toBeLessThanOrEqual(1);
        expect(Math.abs(layout.pageRight - layout.expectedRight)).toBeLessThanOrEqual(1);
        expect(Math.abs(layout.cabinetLeft - layout.pageLeft)).toBeLessThanOrEqual(1);
        expect(Math.abs(layout.cabinetRight - layout.pageRight)).toBeLessThanOrEqual(1);
        expect(Math.abs(layout.cabinetWidth - layout.pageWidth)).toBeLessThanOrEqual(1);
        expect(Math.abs(layout.statsWidth - layout.pageWidth)).toBeLessThanOrEqual(1);
        expect(Math.abs(layout.titleWidth - layout.pageWidth)).toBeLessThanOrEqual(1);
        if (viewport.name === 'desktop') expect(layout.cabinetWidth).toBeGreaterThan(860);
        expect(layout.pageBackground).toBe('none');
        themeSignatures.push(layout.themeSignature);

        await expectNoHorizontalOverflow(page);
        await page.screenshot({
          path: testInfo.outputPath(`casino-${machine.slug}-${viewport.name}.png`),
          fullPage: true
        });
      });
    }

    expect(new Set(themeSignatures).size).toBe(machines.length);
  }
});

test('renders all seven regional cabinets with distinct shapes and mixed symbol art', async ({ browser }, testInfo) => {
  for (const viewport of viewports) {
    const visualSignatures = [];
    for (const machine of regionalMachines) {
      await test.step(`${machine.slug} at ${viewport.name} size`, async () => {
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height }
        });
        const page = await context.newPage();
        try {
          await login(page, `CasinoAudit${machine.regionId}`);
          await page.goto(`${base}/casino?machine=${machine.slug}`);
          const cabinet = page.locator(
            `#casino-machine[data-casino-machine="${machine.slug}"]`
          );
          const grid = cabinet.locator('.casino-reel-grid');
          const cells = grid.locator('[data-casino-cell]');

          await expect(cabinet).toHaveCount(1);
          await expect(cells).toHaveCount(machine.cells);
          await expect(grid).toHaveAttribute('data-casino-columns', String(machine.columns));
          await expect(grid).toHaveAttribute('data-casino-rows', String(machine.rows));
          const icons = await cells.locator('img').evaluateAll((images) =>
            [...new Set(images.map((image) => image.getAttribute('src')))]);
          expect(icons.length).toBe(machine.symbolCount);

          visualSignatures.push(await cabinet.evaluate((element) => {
            const cabinetStyle = getComputedStyle(element);
            const screenStyle = getComputedStyle(element.querySelector('.casino-screen-frame'));
            const cellStyle = getComputedStyle(element.querySelector('.casino-reel-cell'));
            return [
              cabinetStyle.backgroundImage, cabinetStyle.borderRadius,
              cabinetStyle.borderTopWidth, screenStyle.backgroundImage,
              screenStyle.borderRadius, cellStyle.backgroundImage, cellStyle.borderRadius
            ].join('|');
          }));

          await expectNoHorizontalOverflow(page);
          await page.screenshot({
            path: testInfo.outputPath(`casino-regional-${machine.regionId}-${viewport.name}.png`),
            fullPage: true
          });
        } finally {
          await context.close();
        }
      });
    }
    expect(new Set(visualSignatures).size).toBe(regionalMachines.length);
  }
});
