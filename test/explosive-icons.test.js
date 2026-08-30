import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { EXPLOSIVE_ICON_ITEM_IDS, explosiveIconPath } from '../src/explosive-icons.js';
import { loadLegacyCatalog } from '../src/legacy-catalog.js';
import { createApp } from '../src/server.js';
import { SqliteStore } from '../src/store.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSET_DIRECTORY = path.join(ROOT, 'public', 'img', 'items', 'explosives');
const EXPECTED_ITEM_IDS = [277, 278, 279, 280, 281, 282];

test('explosive icon paths cover only the six stable explosive items', () => {
  assert.deepEqual(EXPLOSIVE_ICON_ITEM_IDS, EXPECTED_ITEM_IDS);
  assert.equal(Object.isFrozen(EXPLOSIVE_ICON_ITEM_IDS), true);
  for (const itemId of EXPECTED_ITEM_IDS) {
    assert.equal(explosiveIconPath(itemId), `/node/explosives/explosive-${itemId}.svg`);
  }
  assert.equal(explosiveIconPath('282'), '/node/explosives/explosive-282.svg');
  for (const invalid of [null, undefined, '', 276, 283, 277.5, NaN, Infinity, 'TNT']) {
    assert.equal(explosiveIconPath(invalid), null, String(invalid));
  }
});

test('all explosive SVG assets are distinct, accessible, and self-contained', () => {
  const expectedFiles = EXPECTED_ITEM_IDS.map((itemId) => `explosive-${itemId}.svg`);
  assert.deepEqual(fs.readdirSync(ASSET_DIRECTORY).sort(), expectedFiles);
  const catalog = loadLegacyCatalog();
  const svgBodies = new Set();
  for (const itemId of EXPECTED_ITEM_IDS) {
    const item = catalog.byId.get(itemId);
    const filename = path.join(ASSET_DIRECTORY, `explosive-${itemId}.svg`);
    const svg = fs.readFileSync(filename, 'utf8');
    assert.match(svg, /^<svg\b[^>]*\bxmlns="http:\/\/www\.w3\.org\/2000\/svg"/u, filename);
    assert.match(svg, /\bviewBox="0 0 128 128"/u, filename);
    assert.match(svg, /\brole="img"/u, filename);
    assert.match(svg, /\baria-labelledby="title desc"/u, filename);
    assert.equal((svg.match(/<title\b/gu) ?? []).length, 1, `${filename} title count`);
    assert.equal((svg.match(/<desc\b/gu) ?? []).length, 1, `${filename} description count`);
    assert.match(svg, new RegExp(`<title id="title">${item.name}</title>`, 'u'), filename);
    assert.ok(svg.match(/<desc id="desc">([^<]+)<\/desc>/u)?.[1].length >= 20, filename);
    assert.doesNotMatch(svg, /<!DOCTYPE|<!ENTITY/iu, filename);
    assert.doesNotMatch(svg, /<\s*(?:script|foreignObject|iframe|object|embed|image)\b/iu, filename);
    assert.doesNotMatch(svg, /\b(?:href|xlink:href)\s*=/iu, filename);
    assert.doesNotMatch(svg, /\bon[a-z]+\s*=/iu, filename);
    assert.doesNotMatch(svg, /(?:javascript|data):/iu, filename);
    assert.match(svg, /<\/svg>\s*$/u, filename);
    svgBodies.add(svg.replace(/<title[^]*?<\/desc>/u, ''));
  }
  assert.equal(svgBodies.size, EXPECTED_ITEM_IDS.length);
});

test('fresh catalogs map intact and damaged explosives to their dedicated SVGs', () => {
  const catalog = loadLegacyCatalog();
  const explosiveItemIds = new Set(catalog.explosives.map((explosive) => explosive.itemId));
  assert.deepEqual([...explosiveItemIds].sort((a, b) => a - b), EXPECTED_ITEM_IDS);
  const damaged = catalog.items.filter((item) =>
    item.repairedItemId !== null && explosiveItemIds.has(item.repairedItemId));
  assert.equal(damaged.length, EXPECTED_ITEM_IDS.length);
  for (const itemId of EXPECTED_ITEM_IDS) {
    const expectedIcon = explosiveIconPath(itemId);
    const item = catalog.byId.get(itemId);
    assert.deepEqual({
      icon: item.icon, iconSource: item.iconSource,
      largeImage: item.largeImage, hasLargeImage: item.hasLargeImage
    }, {
      icon: expectedIcon, iconSource: 'explosive-svg',
      largeImage: expectedIcon, hasLargeImage: true
    });
    const counterpart = damaged.filter((candidate) => candidate.repairedItemId === itemId);
    assert.equal(counterpart.length, 1, `damaged counterpart for ${item.name}`);
    assert.deepEqual({
      icon: counterpart[0].icon, iconSource: counterpart[0].iconSource,
      largeImage: counterpart[0].largeImage, hasLargeImage: counterpart[0].hasLargeImage
    }, {
      icon: expectedIcon, iconSource: 'damaged-explosive-svg',
      largeImage: expectedIcon, hasLargeImage: true
    });
  }
});

test('serves every allowlisted explosive SVG and rejects invalid asset routes', async (context) => {
  const catalog = loadLegacyCatalog();
  const store = new SqliteStore(':memory:');
  store.seedCatalog(catalog);
  const server = createApp({ store, backgroundMaintenance: false });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => {
    await new Promise((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()));
    store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const itemId of EXPECTED_ITEM_IDS) {
    const response = await fetch(`${base}${explosiveIconPath(itemId)}`);
    assert.equal(response.status, 200, String(itemId));
    assert.match(response.headers.get('content-type'), /^image\/svg\+xml\b/u, String(itemId));
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(Number(response.headers.get('content-length')) > 0, String(itemId));
    assert.ok(response.headers.get('etag'), String(itemId));
  }
  const head = await fetch(`${base}/node/explosives/explosive-277.svg`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.ok(Number(head.headers.get('content-length')) > 0);
  assert.equal(await head.text(), '');
  const intactDetail = await (await fetch(`${base}/items/277`)).text();
  assert.match(intactDetail,
    /class="detail-image" src="\/node\/explosives\/explosive-277\.svg"[^>]+data-large-image="original"/u);
  const damagedDetail = await (await fetch(`${base}/items/635`)).text();
  assert.match(damagedDetail,
    /class="detail rarity-1 detail-damaged"[^]*class="detail-image" src="\/node\/explosives\/explosive-277\.svg"/u);
  for (const invalidPath of [
    '/node/explosives/explosive-276.svg',
    '/node/explosives/explosive-283.svg',
    '/node/explosives/explosive-277.png',
    '/node/explosives/explosive-277.svg/extra',
    '/node/explosives/not-an-explosive.svg'
  ]) {
    assert.equal((await fetch(`${base}${invalidPath}`)).status, 404, invalidPath);
  }
});

test('existing catalogs migrate legacy explosive art without replacing custom database art',
  (context) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-explosive-icons-'));
    const databaseFile = path.join(directory, 'game.sqlite');
    let store = new SqliteStore(databaseFile);
    context.after(() => {
      if (store) store.close();
      fs.rmSync(directory, { recursive: true, force: true });
    });
    store.seedCatalog(loadLegacyCatalog());
    const legacyItemId = 277;
    const legacyDamagedItemId = 635;
    const customItemId = 278;
    const update = store.database.prepare(`
      UPDATE catalog_items
      SET icon = ?, icon_source = ?, large_image_filename = NULL,
        large_image = ?, has_large_image = 0
      WHERE id = ?
    `);
    update.run('/legacy/img/explosives/explosive1.png', 'explosive',
      '/legacy/img/explosives/explosive1.png', legacyItemId);
    update.run('/legacy/img/explosives/explosive1.png', 'damaged-explosive',
      '/legacy/img/explosives/explosive1.png', legacyDamagedItemId);
    store.database.prepare(`
      UPDATE catalog_items
      SET icon = '/database/custom-explosive.svg', icon_source = 'database',
        large_image_filename = 'custom-explosive.svg',
        large_image = '/database/custom-explosive-large.svg', has_large_image = 1
      WHERE id = ?
    `).run(customItemId);
    store.database.prepare(
      "DELETE FROM schema_migrations WHERE name = 'explosive-svg-icons-v1'"
    ).run();
    store.close();
    store = null;

    store = new SqliteStore(databaseFile);
    const migrated = store.database.prepare(`
      SELECT icon, icon_source, large_image_filename, large_image, has_large_image
      FROM catalog_items WHERE id = ?
    `);
    assert.deepEqual({ ...migrated.get(legacyItemId) }, {
      icon: explosiveIconPath(legacyItemId), icon_source: 'explosive-svg',
      large_image_filename: null, large_image: explosiveIconPath(legacyItemId), has_large_image: 1
    });
    assert.deepEqual({ ...migrated.get(legacyDamagedItemId) }, {
      icon: explosiveIconPath(legacyItemId), icon_source: 'damaged-explosive-svg',
      large_image_filename: null, large_image: explosiveIconPath(legacyItemId), has_large_image: 1
    });
    assert.deepEqual({ ...migrated.get(customItemId) }, {
      icon: '/database/custom-explosive.svg', icon_source: 'database',
      large_image_filename: 'custom-explosive.svg',
      large_image: '/database/custom-explosive-large.svg', has_large_image: 1
    });
    const migration = store.database.prepare(`
      SELECT details_json FROM schema_migrations WHERE name = 'explosive-svg-icons-v1'
    `).get();
    assert.deepEqual(JSON.parse(migration.details_json), {
      icons: EXPECTED_ITEM_IDS.length, intactChanges: 1, damagedChanges: 1
    });
  });
