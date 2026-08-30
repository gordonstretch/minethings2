import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadLegacyCatalog } from '../src/legacy-catalog.js';
import { createApp } from '../src/server.js';
import { SPICE_ICON_ITEM_IDS, spiceIconPath } from '../src/spice-icons.js';
import { SqliteStore } from '../src/store.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSET_DIRECTORY = path.join(ROOT, 'public', 'img', 'items', 'spices');
const EXPECTED_IDS = Array.from({ length: 36 }, (_, index) => 103 + index);

function geometrySignature(svg) {
  return svg.replace(/<title\b[^>]*>[^]*?<\/title>/gu, '')
    .replace(/<desc\b[^>]*>[^]*?<\/desc>/gu, '')
    .replace(/\s(?:fill|stroke|stroke-width|stroke-linecap|stroke-linejoin|opacity|transform)="[^"]*"/gu, '')
    .replace(/\s+/gu, ' ').trim();
}

test('Spice icon paths cover all 36 intact catalogue items', () => {
  assert.deepEqual(SPICE_ICON_ITEM_IDS, EXPECTED_IDS);
  assert.equal(Object.isFrozen(SPICE_ICON_ITEM_IDS), true);
  for (const itemId of EXPECTED_IDS) {
    assert.equal(spiceIconPath(itemId), `/node/spices/item-${itemId}.svg`);
  }
  for (const invalid of [null, undefined, '', 0, 102, 139, 461, 1.5, NaN, Infinity]) {
    assert.equal(spiceIconPath(invalid), null, String(invalid));
  }
});

test('every Spice SVG is accessible, safe, and botanically distinct', () => {
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
    assert.ok((svg.match(/<desc id="desc">([^<]+)<\/desc>/u)?.[1]?.length ?? 0) >= 45,
      filename);
    assert.doesNotMatch(svg,
      /<!DOCTYPE|<!ENTITY|<\s*(?:script|foreignObject|iframe|object|embed|image)\b/iu,
      filename);
    assert.doesNotMatch(svg, /\b(?:href|xlink:href|on[a-z]+)\s*=/iu, filename);
    assert.match(svg, /<\/svg>\s*$/u, filename);
    signatures.add(geometrySignature(svg));
  }
  assert.equal(signatures.size, EXPECTED_IDS.length,
    'every spice must differ in geometry, not merely colour or metadata');
});

test('maps all intact and damaged Spices to matching object-specific artwork', () => {
  const catalog = loadLegacyCatalog();
  const intact = catalog.items.filter((item) => item.mineTypeId === 6
    && item.repairedItemId === null);
  const damaged = catalog.items.filter((item) => item.mineTypeId === 6
    && item.repairedItemId !== null);
  assert.equal(intact.length, EXPECTED_IDS.length);
  assert.equal(damaged.length, EXPECTED_IDS.length);
  for (const itemId of EXPECTED_IDS) {
    const item = catalog.byId.get(itemId);
    const icon = spiceIconPath(itemId);
    assert.deepEqual({
      icon: item.icon, iconSource: item.iconSource,
      largeImage: item.largeImage, hasLargeImage: item.hasLargeImage
    }, {
      icon, iconSource: 'spice-svg', largeImage: icon, hasLargeImage: true
    });
    const counterpart = damaged.filter((candidate) => candidate.repairedItemId === itemId);
    assert.equal(counterpart.length, 1, `damaged counterpart for Spice item ${itemId}`);
    assert.equal(counterpart[0].icon, icon);
    assert.equal(counterpart[0].iconSource, 'damaged-spice-svg');
    assert.equal(counterpart[0].largeImage, icon);
    assert.equal(counterpart[0].hasLargeImage, true);
  }
});

test('migrates legacy Spice tiles once and preserves custom botanical artwork', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-spice-icons-'));
  const databaseFile = path.join(directory, 'minethings.sqlite');
  let store = new SqliteStore(databaseFile);
  context.after(() => {
    if (store) store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  store.seedCatalog(loadLegacyCatalog());
  const representativePairs = [
    [103, 461], [109, 467], [122, 480], [127, 485], [136, 494], [138, 496]
  ];
  const setArt = store.database.prepare(`
    UPDATE catalog_items
    SET icon = ?, icon_source = ?, large_image_filename = ?,
      large_image = ?, has_large_image = ? WHERE id = ?
  `);
  for (const [intactId, damagedId] of representativePairs) {
    setArt.run('/legacy/img/icons/M6L1.png', 'mine-rarity', null,
      '/legacy/img/icons/M6L1.png', 0, intactId);
    setArt.run('/legacy/img/icons/M6L1.png', 'damaged-mine-rarity', null,
      '/legacy/img/icons/M6L1.png', 0, damagedId);
  }
  const custom = [
    { id: 104, source: 'mine-rarity' },
    { id: 462, source: 'damaged-mine-rarity' }
  ];
  for (const row of custom) {
    setArt.run(`/custom/spice-${row.id}.svg`, row.source, `spice-${row.id}.svg`,
      `/custom/spice-${row.id}-large.svg`, 1, row.id);
  }
  store.close();
  store = new SqliteStore(databaseFile);
  const artFor = (itemId) => ({ ...store.database.prepare(`
    SELECT icon, icon_source, large_image_filename, large_image, has_large_image
    FROM catalog_items WHERE id = ?
  `).get(itemId) });
  for (const [intactId, damagedId] of representativePairs) {
    const icon = spiceIconPath(intactId);
    assert.deepEqual(artFor(intactId), {
      icon, icon_source: 'spice-svg', large_image_filename: null,
      large_image: icon, has_large_image: 1
    });
    assert.deepEqual(artFor(damagedId), {
      icon, icon_source: 'damaged-spice-svg', large_image_filename: null,
      large_image: icon, has_large_image: 1
    });
  }
  for (const row of custom) {
    assert.deepEqual(artFor(row.id), {
      icon: `/custom/spice-${row.id}.svg`, icon_source: row.source,
      large_image_filename: `spice-${row.id}.svg`,
      large_image: `/custom/spice-${row.id}-large.svg`, has_large_image: 1
    });
  }
  const migration = { ...store.database.prepare(`
    SELECT applied_at, details_json FROM schema_migrations WHERE name = 'spice-svg-icons-v1'
  `).get() };
  assert.deepEqual(JSON.parse(migration.details_json), {
    icons: EXPECTED_IDS.length,
    intactChanges: representativePairs.length,
    damagedChanges: representativePairs.length
  });
  store.close();
  store = new SqliteStore(databaseFile);
  assert.deepEqual({ ...store.database.prepare(`
    SELECT applied_at, details_json FROM schema_migrations WHERE name = 'spice-svg-icons-v1'
  `).get() }, migration);
});

test('serves the complete Spice rack and rejects uncatalogued paths', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-spice-server-'));
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
    const response = await fetch(`${base}${spiceIconPath(itemId)}`);
    assert.equal(response.status, 200, String(itemId));
    assert.match(response.headers.get('content-type'), /^image\/svg\+xml\b/u);
    assert.ok((await response.text()).includes('<title id="title">'));
  }));
  assert.equal((await fetch(`${base}/node/spices/item-102.svg`)).status, 404);
  assert.equal((await fetch(`${base}/node/spices/item-461.svg`)).status, 404);
});
