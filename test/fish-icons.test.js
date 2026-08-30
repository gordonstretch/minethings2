import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { FISH_ICON_ITEM_IDS, fishIconPath } from '../src/fish-icons.js';
import { loadLegacyCatalog } from '../src/legacy-catalog.js';
import { createApp } from '../src/server.js';
import { SqliteStore } from '../src/store.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSET_DIRECTORY = path.join(ROOT, 'public', 'img', 'items', 'fish');
const EXPECTED_IDS = [
  316, 317, 318, 319, 320, 321, 322, 323,
  324, 325, 326, 327, 328, 329, 330, 331,
  332, 333, 334, 335, 336, 337, 338, 339
];

function geometrySignature(svg) {
  return svg.replace(/<title\b[^>]*>[^]*?<\/title>/gu, '')
    .replace(/<desc\b[^>]*>[^]*?<\/desc>/gu, '')
    .replace(/\s(?:fill|stroke|stroke-width|stroke-linecap|stroke-linejoin|opacity|transform)="[^"]*"/gu, '')
    .replace(/\s+/gu, ' ').trim();
}

test('Fish icon paths cover the complete 24-species catalogue', () => {
  assert.deepEqual(FISH_ICON_ITEM_IDS, EXPECTED_IDS);
  assert.equal(Object.isFrozen(FISH_ICON_ITEM_IDS), true);
  for (const itemId of EXPECTED_IDS) {
    assert.equal(fishIconPath(itemId), `/node/fish/item-${itemId}.svg`);
  }
  for (const invalid of [null, undefined, '', 0, 315, 340, 674, 1.5, NaN, Infinity]) {
    assert.equal(fishIconPath(invalid), null, String(invalid));
  }
});

test('every Fish SVG is accessible, safe, and anatomically distinct', () => {
  assert.deepEqual(fs.readdirSync(ASSET_DIRECTORY).sort(),
    EXPECTED_IDS.map((itemId) => `item-${itemId}.svg`).sort());
  const catalog = loadLegacyCatalog();
  const signatures = new Set();
  for (const itemId of EXPECTED_IDS) {
    const filename = path.join(ASSET_DIRECTORY, `item-${itemId}.svg`);
    const svg = fs.readFileSync(filename, 'utf8');
    assert.match(svg, /^<svg\b[^>]*\bxmlns="http:\/\/www\.w3\.org\/2000\/svg"/u, filename);
    assert.match(svg, /\bviewBox="0 0 128 128"/u, filename);
    assert.match(svg, /\brole="img"/u, filename);
    assert.match(svg, /\baria-labelledby="title desc"/u, filename);
    assert.equal(svg.match(/<title id="title">([^<]+)<\/title>/u)?.[1],
      catalog.byId.get(itemId).name, filename);
    assert.ok((svg.match(/<desc id="desc">([^<]+)<\/desc>/u)?.[1]?.length ?? 0) >= 50,
      filename);
    assert.doesNotMatch(svg,
      /<!DOCTYPE|<!ENTITY|<\s*(?:script|foreignObject|iframe|object|embed|image)\b/iu,
      filename);
    assert.doesNotMatch(svg, /\b(?:href|xlink:href|on[a-z]+)\s*=/iu, filename);
    assert.match(svg, /<\/svg>\s*$/u, filename);
    signatures.add(geometrySignature(svg));
  }
  assert.equal(signatures.size, EXPECTED_IDS.length,
    'every species must differ in geometry, not only colour or metadata');
});

test('maps every intact and damaged Fish to its species artwork', () => {
  const catalog = loadLegacyCatalog();
  const intact = catalog.items.filter((item) => item.mineTypeId === 15
    && item.repairedItemId === null);
  const damaged = catalog.items.filter((item) => item.mineTypeId === 15
    && item.repairedItemId !== null);
  assert.equal(intact.length, EXPECTED_IDS.length);
  assert.equal(damaged.length, EXPECTED_IDS.length);
  for (const itemId of EXPECTED_IDS) {
    const item = catalog.byId.get(itemId);
    const icon = fishIconPath(itemId);
    assert.deepEqual({
      icon: item.icon, iconSource: item.iconSource,
      largeImage: item.largeImage, hasLargeImage: item.hasLargeImage
    }, {
      icon, iconSource: 'fish-svg', largeImage: icon, hasLargeImage: true
    });
    const counterpart = damaged.filter((candidate) => candidate.repairedItemId === itemId);
    assert.equal(counterpart.length, 1, `damaged counterpart for Fish item ${itemId}`);
    assert.equal(counterpart[0].icon, icon);
    assert.equal(counterpart[0].iconSource, 'damaged-fish-svg');
    assert.equal(counterpart[0].largeImage, icon);
    assert.equal(counterpart[0].hasLargeImage, true);
  }
});

test('migrates legacy Fish tiles once while preserving custom species art', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-fish-icons-'));
  const databaseFile = path.join(directory, 'minethings.sqlite');
  let store = new SqliteStore(databaseFile);
  context.after(() => {
    if (store) store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  store.seedCatalog(loadLegacyCatalog());
  const representativePairs = [[316, 674], [325, 683], [333, 691], [339, 697]];
  const setArt = store.database.prepare(`
    UPDATE catalog_items
    SET icon = ?, icon_source = ?, large_image_filename = ?,
      large_image = ?, has_large_image = ? WHERE id = ?
  `);
  for (const [intactId, damagedId] of representativePairs) {
    setArt.run('/legacy/img/icons/M15L1.png', 'mine-rarity', null,
      '/legacy/img/icons/M15L1.png', 0, intactId);
    setArt.run('/legacy/img/icons/M15L1.png', 'damaged-mine-rarity', null,
      '/legacy/img/icons/M15L1.png', 0, damagedId);
  }
  const custom = [
    { id: 322, source: 'mine-rarity' },
    { id: 680, source: 'damaged-mine-rarity' }
  ];
  for (const row of custom) {
    setArt.run(`/custom/fish-${row.id}.svg`, row.source, `fish-${row.id}.svg`,
      `/custom/fish-${row.id}-large.svg`, 1, row.id);
  }
  store.close();
  store = new SqliteStore(databaseFile);
  const artFor = (itemId) => ({ ...store.database.prepare(`
    SELECT icon, icon_source, large_image_filename, large_image, has_large_image
    FROM catalog_items WHERE id = ?
  `).get(itemId) });
  for (const [intactId, damagedId] of representativePairs) {
    const icon = fishIconPath(intactId);
    assert.deepEqual(artFor(intactId), {
      icon, icon_source: 'fish-svg', large_image_filename: null,
      large_image: icon, has_large_image: 1
    });
    assert.deepEqual(artFor(damagedId), {
      icon, icon_source: 'damaged-fish-svg', large_image_filename: null,
      large_image: icon, has_large_image: 1
    });
  }
  for (const row of custom) {
    assert.deepEqual(artFor(row.id), {
      icon: `/custom/fish-${row.id}.svg`, icon_source: row.source,
      large_image_filename: `fish-${row.id}.svg`,
      large_image: `/custom/fish-${row.id}-large.svg`, has_large_image: 1
    });
  }
  const migration = { ...store.database.prepare(`
    SELECT applied_at, details_json FROM schema_migrations WHERE name = 'fish-svg-icons-v1'
  `).get() };
  assert.deepEqual(JSON.parse(migration.details_json), {
    icons: EXPECTED_IDS.length,
    intactChanges: representativePairs.length,
    damagedChanges: representativePairs.length
  });
  store.close();
  store = new SqliteStore(databaseFile);
  assert.deepEqual({ ...store.database.prepare(`
    SELECT applied_at, details_json FROM schema_migrations WHERE name = 'fish-svg-icons-v1'
  `).get() }, migration);
});

test('serves the complete Fish shoal and rejects uncatalogued paths', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-fish-server-'));
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
    const response = await fetch(`${base}${fishIconPath(itemId)}`);
    assert.equal(response.status, 200, String(itemId));
    assert.match(response.headers.get('content-type'), /^image\/svg\+xml\b/u);
    assert.ok((await response.text()).includes('<title id="title">'));
  }));
  assert.equal((await fetch(`${base}/node/fish/item-315.svg`)).status, 404);
  assert.equal((await fetch(`${base}/node/fish/item-674.svg`)).status, 404);
});
