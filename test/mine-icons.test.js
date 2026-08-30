import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadLegacyCatalog } from '../src/legacy-catalog.js';
import {
  MAP_MINE_TYPE_IDS, mineIconPath, mineMapIconPath, OIL_FIELD_MAP_ICON_PATH,
  STARTER_MINE_TYPE_IDS
} from '../src/mine-icons.js';
import { createApp } from '../src/server.js';
import { SqliteStore } from '../src/store.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSET_DIRECTORY = path.join(ROOT, 'public', 'img', 'items', 'mines');
const MAP_ASSET_DIRECTORY = path.join(ROOT, 'public', 'img', 'map-icons');

test('starter-pack mine types use their dedicated SVG artwork', () => {
  assert.deepEqual(STARTER_MINE_TYPE_IDS, [1, 4, 5]);
  assert.equal(Object.isFrozen(STARTER_MINE_TYPE_IDS), true);
  assert.equal(mineIconPath('1'), '/node/mines/mine-1.svg');
  assert.equal(mineIconPath(4), '/node/mines/mine-4.svg');
  assert.equal(mineIconPath(5), '/node/mines/mine-5.svg');
  for (const invalid of [null, undefined, '', 0, 2, 3, 6, 1.5, NaN, Infinity]) {
    assert.equal(mineIconPath(invalid), null, String(invalid));
  }

  const catalog = loadLegacyCatalog();
  for (const mineTypeId of STARTER_MINE_TYPE_IDS) {
    assert.equal(catalog.mineTypes.find((mineType) => mineType.id === mineTypeId)?.icon,
      mineIconPath(mineTypeId));
  }
  assert.equal(catalog.mineTypes.find((mineType) => mineType.id === 6)?.icon,
    '/legacy/img/icons/M6L6.png');
});

test('starter-pack mine SVGs are accessible, safe, and geometrically distinct', () => {
  assert.deepEqual(fs.readdirSync(ASSET_DIRECTORY).sort(),
    STARTER_MINE_TYPE_IDS.map((mineTypeId) => `mine-${mineTypeId}.svg`));
  const signatures = new Set();
  const names = new Map([[1, 'Starter Mine'], [4, 'Equipment Mine'], [5, 'Vehicles Mine']]);
  for (const mineTypeId of STARTER_MINE_TYPE_IDS) {
    const filename = path.join(ASSET_DIRECTORY, `mine-${mineTypeId}.svg`);
    const svg = fs.readFileSync(filename, 'utf8');
    assert.match(svg, /^<svg\b[^>]*\bxmlns="http:\/\/www\.w3\.org\/2000\/svg"/u, filename);
    assert.match(svg, /\bviewBox="0 0 128 128"/u, filename);
    assert.match(svg, /\brole="img"/u, filename);
    assert.match(svg, /\baria-labelledby="title desc"/u, filename);
    assert.ok(svg.includes(`<title id="title">${names.get(mineTypeId)}</title>`), filename);
    assert.equal((svg.match(/<desc\b/gu) ?? []).length, 1, filename);
    assert.doesNotMatch(svg, /<!DOCTYPE|<!ENTITY|<\s*(?:script|foreignObject|image)\b/iu, filename);
    assert.doesNotMatch(svg, /\b(?:href|xlink:href|on[a-z]+)\s*=/iu, filename);
    signatures.add(svg.replace(/<title\b[^>]*>[^]*?<\/title>/gu, '')
      .replace(/<desc\b[^>]*>[^]*?<\/desc>/gu, '').replace(/\s+/gu, ' ').trim());
  }
  assert.equal(signatures.size, STARTER_MINE_TYPE_IDS.length);
});

test('serves only the dedicated starter-pack mine SVG routes', async (context) => {
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
  for (const mineTypeId of STARTER_MINE_TYPE_IDS) {
    const response = await fetch(`${base}${mineIconPath(mineTypeId)}`);
    assert.equal(response.status, 200, String(mineTypeId));
    assert.match(response.headers.get('content-type'), /^image\/svg\+xml\b/u);
    assert.ok((await response.text()).includes(`<title id="title">`));
  }
  assert.equal((await fetch(`${base}/node/mines/mine-6.svg`)).status, 404);
  assert.equal((await fetch(`${base}/node/mines/mine-anything.svg`)).status, 404);
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
