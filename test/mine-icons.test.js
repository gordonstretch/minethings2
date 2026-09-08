import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadLegacyCatalog } from '../src/legacy-catalog.js';
import {
  MAP_MINE_TYPE_IDS, mineIconPath, mineMapIconPath, mineShopIconPath,
  OIL_FIELD_MAP_ICON_PATH, SHOP_MINE_TYPE_IDS, STARTER_MINE_TYPE_IDS
} from '../src/mine-icons.js';
import { createApp } from '../src/server.js';
import { SqliteStore } from '../src/store.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSET_DIRECTORY = path.join(ROOT, 'public', 'img', 'items', 'mines');
const MAP_ASSET_DIRECTORY = path.join(ROOT, 'public', 'img', 'map-icons');

test('mine shop path helpers expose the exact supported mine-type allowlists', () => {
  const expectedShopMineTypeIds = [1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 21, 24, 25];
  assert.deepEqual(STARTER_MINE_TYPE_IDS, [1, 4, 5]);
  assert.deepEqual(SHOP_MINE_TYPE_IDS, expectedShopMineTypeIds);
  assert.equal(Object.isFrozen(STARTER_MINE_TYPE_IDS), true);
  assert.equal(Object.isFrozen(SHOP_MINE_TYPE_IDS), true);
  assert.equal(mineIconPath('1'), '/node/mines/mine-1.svg');
  assert.equal(mineIconPath(4), '/node/mines/mine-4.svg');
  assert.equal(mineIconPath(5), '/node/mines/mine-5.svg');
  for (const invalid of [null, undefined, '', 0, 2, 3, 6, 1.5, NaN, Infinity]) {
    assert.equal(mineIconPath(invalid), null, String(invalid));
  }

  for (const mineTypeId of expectedShopMineTypeIds) {
    assert.equal(mineShopIconPath(String(mineTypeId)),
      `/node/mines/mine-${mineTypeId}.svg`);
  }
  for (const invalid of [
    null, undefined, '', 0, 2, 3, 15, 16, 17, 18, 19, 20, 22, 23,
    26, 30, 31, -1, 1.5, NaN, Infinity, {}, [], 'mine'
  ]) {
    assert.equal(mineShopIconPath(invalid), null, String(invalid));
  }

  const catalog = loadLegacyCatalog();
  for (const mineTypeId of expectedShopMineTypeIds) {
    assert.equal(catalog.mineTypes.find((mineType) => mineType.id === mineTypeId)?.icon,
      mineShopIconPath(mineTypeId));
  }
  for (const mineType of catalog.mineTypes.filter((candidate) => candidate.rentCost > 0)) {
    assert.doesNotMatch(mineType.icon,
      /^\/legacy\/img\/icons\/M\d+L\d+\.(?:gif|png)$/u, mineType.name);
  }
});

test('all dedicated mine shop SVGs are exact, accessible, safe, and geometrically distinct', () => {
  assert.deepEqual(fs.readdirSync(ASSET_DIRECTORY).sort(),
    SHOP_MINE_TYPE_IDS.map((mineTypeId) => `mine-${mineTypeId}.svg`).sort());
  const catalog = loadLegacyCatalog();
  const names = new Map(catalog.mineTypes.map((mineType) =>
    [mineType.id, `${mineType.name} Mine`]));
  const signatures = new Set();
  for (const mineTypeId of SHOP_MINE_TYPE_IDS) {
    const filename = path.join(ASSET_DIRECTORY, `mine-${mineTypeId}.svg`);
    const svg = fs.readFileSync(filename, 'utf8');
    assert.match(svg, /^<svg\b[^>]*\bxmlns="http:\/\/www\.w3\.org\/2000\/svg"/u, filename);
    assert.match(svg, /\bviewBox="0 0 128 128"/u, filename);
    assert.match(svg, /\brole="img"/u, filename);
    assert.match(svg, /\baria-labelledby="title desc"/u, filename);
    assert.ok(svg.includes(`<title id="title">${names.get(mineTypeId)}</title>`), filename);
    assert.equal((svg.match(/<desc\b/gu) ?? []).length, 1, filename);
    assert.doesNotMatch(svg,
      /<!DOCTYPE|<!ENTITY|<\s*(?:script|foreignObject|iframe|object|embed|image|text)\b/iu,
      filename);
    assert.doesNotMatch(svg, /\b(?:href|xlink:href|on[a-z]+)\s*=/iu, filename);
    assert.doesNotMatch(svg, /(?:javascript|data):/iu, filename);
    assert.match(svg, /<\/svg>\s*$/u, filename);
    signatures.add(svg.replace(/<title\b[^>]*>[^]*?<\/title>/gu, '')
      .replace(/<desc\b[^>]*>[^]*?<\/desc>/gu, '').replace(/\s+/gu, ' ').trim());
  }
  assert.equal(signatures.size, SHOP_MINE_TYPE_IDS.length);
});

test('serves only the dedicated mine shop SVG routes for GET and HEAD', async (context) => {
  const store = new SqliteStore(':memory:');
  store.seedCatalog(loadLegacyCatalog());
  const server = createApp({ store, backgroundMaintenance: false });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => {
    await new Promise((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()));
    store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const mineTypeId of SHOP_MINE_TYPE_IDS) {
    const response = await fetch(`${base}${mineShopIconPath(mineTypeId)}`);
    assert.equal(response.status, 200, String(mineTypeId));
    assert.match(response.headers.get('content-type'), /^image\/svg\+xml\b/u);
    assert.ok((await response.text()).includes(`<title id="title">`));

    const head = await fetch(`${base}${mineShopIconPath(mineTypeId)}`, { method: 'HEAD' });
    assert.equal(head.status, 200, `HEAD ${mineTypeId}`);
    assert.match(head.headers.get('content-type'), /^image\/svg\+xml\b/u);
    assert.ok(Number(head.headers.get('content-length')) > 0, `HEAD ${mineTypeId} length`);
    assert.equal(await head.text(), '', `HEAD ${mineTypeId} body`);
  }
  for (const invalid of [
    'mine-2.svg', 'mine-3.svg', 'mine-15.svg', 'mine-20.svg', 'mine-22.svg',
    'mine-23.svg', 'mine-26.svg', 'mine-31.svg', 'mine-01.svg', 'mine-anything.svg'
  ]) {
    assert.equal((await fetch(`${base}/node/mines/${invalid}`)).status, 404, invalid);
  }
});

test('legacy mine shop icons migrate once while custom catalog artwork survives', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-mine-shop-icons-'));
  const databaseFile = path.join(directory, 'catalog.sqlite');
  const openStores = new Set();
  const openStore = () => {
    const store = new SqliteStore(databaseFile);
    openStores.add(store);
    return store;
  };
  const closeStore = (store) => {
    store.close();
    openStores.delete(store);
  };
  context.after(() => {
    for (const store of openStores) store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  let store = openStore();
  store.seedCatalog(loadLegacyCatalog());
  const setIcon = store.database.prepare(
    'UPDATE catalog_mine_types SET icon = ? WHERE id = ?'
  );
  for (const [index, mineTypeId] of SHOP_MINE_TYPE_IDS.entries()) {
    const extension = index % 2 === 0 ? 'png' : 'gif';
    setIcon.run(`/legacy/img/icons/M${mineTypeId}L6.${extension}`, mineTypeId);
  }
  const customMineTypeId = 25;
  const customIcon = '/custom/machines-mine.svg';
  setIcon.run(customIcon, customMineTypeId);
  closeStore(store);

  store = openStore();
  for (const mineTypeId of SHOP_MINE_TYPE_IDS) {
    const icon = store.database.prepare(
      'SELECT icon FROM catalog_mine_types WHERE id = ?'
    ).get(mineTypeId).icon;
    assert.equal(icon, mineTypeId === customMineTypeId
      ? customIcon : mineShopIconPath(mineTypeId), String(mineTypeId));
  }
  const migration = { ...store.database.prepare(`
    SELECT applied_at, details_json FROM schema_migrations
    WHERE name = 'mine-shop-svg-icons-v1'
  `).get() };
  assert.deepEqual(JSON.parse(migration.details_json), {
    icons: SHOP_MINE_TYPE_IDS.length,
    changes: SHOP_MINE_TYPE_IDS.length - 1
  });
  closeStore(store);

  store = openStore();
  assert.deepEqual({ ...store.database.prepare(`
    SELECT applied_at, details_json FROM schema_migrations
    WHERE name = 'mine-shop-svg-icons-v1'
  `).get() }, migration);
  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count FROM schema_migrations
    WHERE name = 'mine-shop-svg-icons-v1'
  `).get().count, 1);
  assert.equal(store.database.prepare(
    'SELECT icon FROM catalog_mine_types WHERE id = ?'
  ).get(customMineTypeId).icon, customIcon);
});

test('defines one normalized map symbol for every live mine type', () => {
  const catalog = loadLegacyCatalog();
  const catalogMineTypeIds = catalog.mineTypes.map((mineType) => mineType.id);
  assert.deepEqual(MAP_MINE_TYPE_IDS, catalogMineTypeIds);
  assert.equal(Object.isFrozen(MAP_MINE_TYPE_IDS), true);
  for (const mineTypeId of MAP_MINE_TYPE_IDS) {
    assert.equal(mineMapIconPath(String(mineTypeId)),
      `/node/map-icons/mine-${mineTypeId}.svg`);
  }
  for (const invalid of [null, undefined, '', 0, 2, 3, 31, 1.5, NaN, Infinity]) {
    assert.equal(mineMapIconPath(invalid), null, String(invalid));
  }
  assert.equal(OIL_FIELD_MAP_ICON_PATH, '/node/map-icons/oil-field.svg');
});

test('map mine and Oil Field SVGs are safe, accessible, and visually distinct', () => {
  const expectedFiles = [
    ...MAP_MINE_TYPE_IDS.map((mineTypeId) => `mine-${mineTypeId}.svg`),
    'oil-field.svg'
  ].sort();
  assert.deepEqual(fs.readdirSync(MAP_ASSET_DIRECTORY).sort(), expectedFiles);
  const expectedTitles = new Map(loadLegacyCatalog().mineTypes
    .map((mineType) => [mineType.id, `${mineType.name} Mine`]));
  const signatures = new Set();
  for (const filename of expectedFiles) {
    const svg = fs.readFileSync(path.join(MAP_ASSET_DIRECTORY, filename), 'utf8');
    assert.match(svg, /^<svg\b[^>]*\bxmlns="http:\/\/www\.w3\.org\/2000\/svg"/u, filename);
    assert.match(svg, /\bviewBox="0 0 64 64"/u, filename);
    assert.match(svg, /\brole="img"/u, filename);
    assert.match(svg, /\baria-labelledby="title desc"/u, filename);
    const idMatch = /^mine-(\d+)\.svg$/u.exec(filename);
    const title = idMatch ? expectedTitles.get(Number(idMatch[1])) : 'Oil Field';
    assert.ok(svg.includes(`<title id="title">${title}</title>`), filename);
    assert.equal((svg.match(/<desc\b/gu) ?? []).length, 1, filename);
    assert.doesNotMatch(svg, /<!DOCTYPE|<!ENTITY|<\s*(?:script|foreignObject|image|text)\b/iu,
      filename);
    assert.doesNotMatch(svg, /\b(?:href|xlink:href|on[a-z]+)\s*=/iu, filename);
    signatures.add(svg.replace(/<title\b[^>]*>[^]*?<\/title>/gu, '')
      .replace(/<desc\b[^>]*>[^]*?<\/desc>/gu, '').replace(/\s+/gu, ' ').trim());
  }
  assert.equal(signatures.size, expectedFiles.length);
});

test('serves the complete normalized city-map icon family', async (context) => {
  const store = new SqliteStore(':memory:');
  store.seedCatalog(loadLegacyCatalog());
  const server = createApp({ store, backgroundMaintenance: false });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => {
    await new Promise((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()));
    store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const mineTypeId of MAP_MINE_TYPE_IDS) {
    const response = await fetch(`${base}${mineMapIconPath(mineTypeId)}`);
    assert.equal(response.status, 200, String(mineTypeId));
    assert.match(response.headers.get('content-type'), /^image\/svg\+xml\b/u);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.ok((await response.text()).includes('<desc id="desc">'));
  }
  const oilField = await fetch(`${base}${OIL_FIELD_MAP_ICON_PATH}`);
  assert.equal(oilField.status, 200);
  assert.match(oilField.headers.get('content-type'), /^image\/svg\+xml\b/u);
  for (const invalid of ['mine-2.svg', 'mine-3.svg', 'mine-31.svg', 'mine-anything.svg']) {
    assert.equal((await fetch(`${base}/node/map-icons/${invalid}`)).status, 404, invalid);
  }
});
