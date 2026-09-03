import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadLegacyCatalog } from '../src/legacy-catalog.js';
import { createApp } from '../src/server.js';
import { STARTER_ICON_ITEM_IDS, starterIconPath } from '../src/starter-icons.js';
import { SqliteStore } from '../src/store.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSET_DIRECTORY = path.join(ROOT, 'public', 'img', 'items', 'starter');
const EXPECTED_IDS = [
  1, 2, 3, 4, 6, 7, 8, 9, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
  24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 41, 42,
  43, 44, 45, 46, 47, 48, 95, 96, 100, 101, 102
];

function geometrySignature(svg) {
  return svg.replace(/<title\b[^>]*>[^]*?<\/title>/gu, '')
    .replace(/<desc\b[^>]*>[^]*?<\/desc>/gu, '')
    .replace(/\s(?:fill|stroke|stroke-width|stroke-linecap|stroke-linejoin|opacity|transform)="[^"]*"/gu, '')
    .replace(/\s+/gu, ' ').trim();
}

test('Starter item icon paths cover every non-vehicle intact find', () => {
  assert.deepEqual(STARTER_ICON_ITEM_IDS, EXPECTED_IDS);
  assert.equal(Object.isFrozen(STARTER_ICON_ITEM_IDS), true);
  for (const itemId of EXPECTED_IDS) {
    assert.equal(starterIconPath(itemId), `/node/starter/item-${itemId}.svg`);
  }
  for (const invalid of [null, undefined, '', 0, 5, 10, 11, 49, 103, 1.5, NaN, Infinity]) {
    assert.equal(starterIconPath(invalid), null, String(invalid));
  }
});

test('all Starter item SVGs have exact inventory, accessible metadata, and distinct geometry', () => {
  assert.deepEqual(fs.readdirSync(ASSET_DIRECTORY).sort(),
    EXPECTED_IDS.map((itemId) => `item-${itemId}.svg`).sort());
  const catalog = loadLegacyCatalog();
  const signatures = new Set();
  for (const itemId of EXPECTED_IDS) {
    const item = catalog.byId.get(itemId);
    const filename = path.join(ASSET_DIRECTORY, `item-${itemId}.svg`);
    const svg = fs.readFileSync(filename, 'utf8');
    assert.match(svg, /^<svg\b[^>]*\bxmlns="http:\/\/www\.w3\.org\/2000\/svg"/u, filename);
    assert.match(svg, /\bviewBox="0 0 128 128"/u, filename);
    assert.match(svg, /\brole="img"/u, filename);
    assert.match(svg, /\baria-labelledby="title desc"/u, filename);
    assert.equal(svg.match(/<title id="title">([^<]+)<\/title>/u)?.[1], item.name,
      filename);
    assert.ok((svg.match(/<desc id="desc">([^<]+)<\/desc>/u)?.[1]?.length ?? 0) >= 30,
      filename);
    assert.doesNotMatch(svg, /<!DOCTYPE|<!ENTITY|<\s*(?:script|foreignObject|iframe|object|embed|image)\b/iu,
      filename);
    assert.doesNotMatch(svg, /\b(?:href|xlink:href|on[a-z]+)\s*=/iu, filename);
    assert.match(svg, /<\/svg>\s*$/u, filename);
    signatures.add(geometrySignature(svg));
  }
  assert.equal(signatures.size, EXPECTED_IDS.length,
    'every Starter find must have its own silhouette, not merely different paint or metadata');
});

test('maps intact and damaged Starter finds to their object-specific artwork', () => {
  const catalog = loadLegacyCatalog();
  const intact = catalog.items.filter((item) => item.mineTypeId === 1
    && item.repairedItemId === null && item.canFind);
  const damaged = catalog.items.filter((item) => item.mineTypeId === 1
    && item.repairedItemId !== null);
  assert.equal(intact.length, 50);
  assert.equal(damaged.length, 50);
  assert.equal(catalog.byId.get(5).icon, '/node/vehicles/vehicle-5.svg');
  assert.equal(catalog.byId.get(5).iconSource, 'vehicle-svg');
  for (const itemId of EXPECTED_IDS) {
    const item = catalog.byId.get(itemId);
    assert.deepEqual({
      icon: item.icon, iconSource: item.iconSource,
      largeImage: item.largeImage, hasLargeImage: item.hasLargeImage
    }, {
      icon: starterIconPath(itemId), iconSource: 'starter-svg',
      largeImage: starterIconPath(itemId), hasLargeImage: true
    });
    const counterpart = damaged.filter((candidate) => candidate.repairedItemId === itemId);
    assert.equal(counterpart.length, 1, `damaged counterpart for Starter item ${itemId}`);
    assert.equal(counterpart[0].icon, item.icon);
    assert.equal(counterpart[0].iconSource, 'damaged-starter-svg');
    assert.equal(counterpart[0].largeImage, item.largeImage);
    assert.equal(counterpart[0].hasLargeImage, true);
  }
  const damagedMule = damaged.find((item) => item.repairedItemId === 5);
  assert.equal(damagedMule.icon, '/node/vehicles/vehicle-5.svg');
  assert.equal(damagedMule.iconSource, 'damaged-vehicle-svg');
});

test('migrates legacy Starter art once while preserving custom artwork', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-starter-migration-'));
  const databaseFile = path.join(directory, 'minethings.sqlite');
  let store = new SqliteStore(databaseFile);
  context.after(() => {
    if (store) store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  store.seedCatalog(loadLegacyCatalog());
  const representativePairs = [[1, 369], [42, 407], [101, 459]];
  const setLegacy = store.database.prepare(`
    UPDATE catalog_items
    SET icon = ?, icon_source = ?, large_image_filename = NULL,
      large_image = ?, has_large_image = 0
    WHERE id = ?
  `);
  for (const [intactId, damagedId] of representativePairs) {
    setLegacy.run('/legacy/img/icons/M1L1.png', 'mine-rarity',
      '/legacy/img/icons/M1L1.png', intactId);
    setLegacy.run('/legacy/img/icons/M1L1.png', 'damaged-mine-rarity',
      '/legacy/img/icons/M1L1.png', damagedId);
  }
  const customRows = [
    { id: 4, source: 'database', icon: '/database/custom-basketball-shoes.svg' },
    { id: 372, source: 'damaged-database', icon: '/database/custom-damaged-shoes.svg' }
  ];
  for (const row of customRows) {
    setLegacy.run(row.icon, row.source, row.icon, row.id);
  }
  store.close();
  store = new SqliteStore(databaseFile);
  const artFor = (itemId) => ({ ...store.database.prepare(`
    SELECT icon, icon_source, large_image_filename, large_image, has_large_image
    FROM catalog_items WHERE id = ?
  `).get(itemId) });
  for (const [intactId, damagedId] of representativePairs) {
    assert.deepEqual(artFor(intactId), {
      icon: starterIconPath(intactId), icon_source: 'starter-svg',
      large_image_filename: null, large_image: starterIconPath(intactId), has_large_image: 1
    });
    assert.deepEqual(artFor(damagedId), {
      icon: starterIconPath(intactId), icon_source: 'damaged-starter-svg',
      large_image_filename: null, large_image: starterIconPath(intactId), has_large_image: 1
    });
  }
  for (const row of customRows) {
    assert.deepEqual(artFor(row.id), {
      icon: row.icon, icon_source: row.source,
      large_image_filename: null, large_image: row.icon, has_large_image: 0
    });
  }
  const migration = { ...store.database.prepare(`
    SELECT applied_at, details_json FROM schema_migrations
    WHERE name = 'starter-item-svg-icons-v1'
  `).get() };
  assert.deepEqual(JSON.parse(migration.details_json), {
    icons: EXPECTED_IDS.length,
    intactChanges: representativePairs.length,
    damagedChanges: representativePairs.length
  });
  store.close();
  store = new SqliteStore(databaseFile);
  assert.deepEqual({ ...store.database.prepare(`
    SELECT applied_at, details_json FROM schema_migrations
    WHERE name = 'starter-item-svg-icons-v1'
  `).get() }, migration);
  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count FROM schema_migrations
    WHERE name = 'starter-item-svg-icons-v1'
  `).get().count, 1);
});

test('serves every Starter item SVG and rejects uncatalogued paths', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-starter-icons-'));
  const server = createApp({
    databaseFile: path.join(directory, 'minethings.sqlite'),
    legacyJsonFile: null, backgroundMaintenance: false
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => {
    await new Promise((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  await Promise.all(EXPECTED_IDS.map(async (itemId) => {
    const response = await fetch(`${base}${starterIconPath(itemId)}`);
    assert.equal(response.status, 200, String(itemId));
    assert.match(response.headers.get('content-type'), /^image\/svg\+xml\b/u);
    assert.ok((await response.text()).includes('<title id="title">'));
  }));
  assert.equal((await fetch(`${base}/node/starter/item-5.svg`)).status, 404);
  assert.equal((await fetch(`${base}/node/starter/item-999.svg`)).status, 404);
});
