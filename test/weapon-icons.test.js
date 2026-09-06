import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadLegacyCatalog } from '../src/legacy-catalog.js';
import { createApp } from '../src/server.js';
import { SqliteStore } from '../src/store.js';
import { WEAPON_ICON_ITEM_IDS, weaponIconPath } from '../src/weapon-icons.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEAPON_ASSET_DIRECTORY = path.join(ROOT, 'public', 'img', 'items', 'weapons');
const EXPECTED_WEAPON_ITEM_IDS = Array.from({ length: 30 }, (_, index) => 157 + index);

test('weapon icon paths cover only the complete stable weapon item range', () => {
  assert.deepEqual(WEAPON_ICON_ITEM_IDS, EXPECTED_WEAPON_ITEM_IDS);
  assert.equal(Object.isFrozen(WEAPON_ICON_ITEM_IDS), true);
  for (const itemId of EXPECTED_WEAPON_ITEM_IDS) {
    assert.equal(weaponIconPath(itemId), `/node/weapons/weapon-${itemId}.svg`);
  }
  assert.equal(weaponIconPath('186'), '/node/weapons/weapon-186.svg');
  for (const invalid of [null, undefined, '', 156, 187, 157.5, NaN, Infinity, 'Fire Axe']) {
    assert.equal(weaponIconPath(invalid), null, String(invalid));
  }
});

test('all weapon SVG assets are distinct, accessible, and self-contained', () => {
  const expectedFiles = EXPECTED_WEAPON_ITEM_IDS.map((itemId) => `weapon-${itemId}.svg`);
  assert.deepEqual(fs.readdirSync(WEAPON_ASSET_DIRECTORY).sort(), expectedFiles);

  const catalog = loadLegacyCatalog();
  const titles = new Set();
  for (const itemId of EXPECTED_WEAPON_ITEM_IDS) {
    const item = catalog.byId.get(itemId);
    assert.ok(item, `catalog item ${itemId}`);
    const filename = path.join(WEAPON_ASSET_DIRECTORY, `weapon-${itemId}.svg`);
    const svg = fs.readFileSync(filename, 'utf8');
    assert.match(svg, /^<svg\b[^>]*\bxmlns="http:\/\/www\.w3\.org\/2000\/svg"/u, filename);
    assert.match(svg, /\bviewBox="0 0 128 128"/u, filename);
    assert.match(svg, /\brole="img"/u, filename);
    assert.match(svg, /\baria-labelledby="title desc"/u, filename);
    assert.equal((svg.match(/<title\b/gu) ?? []).length, 1, `${filename} title count`);
    assert.equal((svg.match(/<desc\b/gu) ?? []).length, 1, `${filename} description count`);
    const title = svg.match(/<title id="title">([^<]+)<\/title>/u)?.[1];
    const description = svg.match(/<desc id="desc">([^<]+)<\/desc>/u)?.[1];
    assert.equal(title, item.name, `${filename} title`);
    assert.ok(description && description.length >= 20, `${filename} description`);
    titles.add(title);

    assert.doesNotMatch(svg, /<!DOCTYPE|<!ENTITY/iu, filename);
    assert.doesNotMatch(svg, /<\s*(?:script|foreignObject|iframe|object|embed|image)\b/iu,
      filename);
    assert.doesNotMatch(svg, /\b(?:href|xlink:href)\s*=/iu, filename);
    assert.doesNotMatch(svg, /\bon[a-z]+\s*=/iu, filename);
    assert.doesNotMatch(svg, /(?:javascript|data):/iu, filename);
    assert.match(svg, /<\/svg>\s*$/u, filename);
  }
  assert.equal(titles.size, EXPECTED_WEAPON_ITEM_IDS.length);
});

test('fresh catalogs map intact and damaged weapons to their dedicated SVGs', () => {
  const catalog = loadLegacyCatalog();
  const weaponItemIds = new Set(catalog.weapons.map((weapon) => weapon.itemId));
  assert.deepEqual([...weaponItemIds].sort((first, second) => first - second),
    EXPECTED_WEAPON_ITEM_IDS);

  const damagedWeapons = catalog.items.filter((item) =>
    item.repairedItemId !== null && weaponItemIds.has(item.repairedItemId));
  assert.equal(damagedWeapons.length, EXPECTED_WEAPON_ITEM_IDS.length);
  for (const itemId of EXPECTED_WEAPON_ITEM_IDS) {
    const expectedIcon = weaponIconPath(itemId);
    const item = catalog.byId.get(itemId);
    assert.deepEqual({
      icon: item.icon,
      iconSource: item.iconSource,
      largeImage: item.largeImage,
      hasLargeImage: item.hasLargeImage
    }, {
      icon: expectedIcon,
      iconSource: 'weapon-svg',
      largeImage: expectedIcon,
      hasLargeImage: true
    });
    const damaged = damagedWeapons.filter((candidate) => candidate.repairedItemId === itemId);
    assert.equal(damaged.length, 1, `damaged counterpart for ${item.name}`);
    assert.deepEqual({
      icon: damaged[0].icon,
      iconSource: damaged[0].iconSource,
      largeImage: damaged[0].largeImage,
      hasLargeImage: damaged[0].hasLargeImage
    }, {
      icon: expectedIcon,
      iconSource: 'damaged-weapon-svg',
      largeImage: expectedIcon,
      hasLargeImage: true
    });
  }
});

test('serves every allowlisted weapon SVG and rejects invalid weapon asset routes', async (context) => {
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

  for (const itemId of EXPECTED_WEAPON_ITEM_IDS) {
    const response = await fetch(`${base}${weaponIconPath(itemId)}`);
    assert.equal(response.status, 200, String(itemId));
    assert.match(response.headers.get('content-type'), /^image\/svg\+xml\b/u, String(itemId));
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(Number(response.headers.get('content-length')) > 0, String(itemId));
    assert.ok(response.headers.get('etag'), String(itemId));
    assert.match(await response.text(), new RegExp(
      `<title id="title">${catalog.byId.get(itemId).name}</title>`, 'u'
    ), String(itemId));
  }

  const head = await fetch(`${base}/node/weapons/weapon-157.svg`, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.ok(Number(head.headers.get('content-length')) > 0);
  assert.equal(await head.text(), '');

  const intactDetail = await (await fetch(`${base}/items/157`)).text();
  assert.match(intactDetail,
    /class="detail-image" src="\/node\/weapons\/weapon-157\.svg"[^>]+data-large-image="original"/u);
  const damagedDetail = await (await fetch(`${base}/items/515`)).text();
  assert.match(damagedDetail,
    /class="detail rarity-1 detail-damaged"[^]*class="detail-image" src="\/node\/weapons\/weapon-157\.svg"/u);

  for (const invalidPath of [
    '/node/weapons/weapon-156.svg',
    '/node/weapons/weapon-187.svg',
    '/node/weapons/weapon-157.png',
    '/node/weapons/weapon-157.svg/extra',
    '/node/weapons/not-a-weapon.svg'
  ]) {
    assert.equal((await fetch(`${base}${invalidPath}`)).status, 404, invalidPath);
  }
});

test('existing catalogs migrate legacy weapon art without replacing custom database art',
  (context) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-weapon-icons-'));
    const databaseFile = path.join(directory, 'game.sqlite');
    let store = new SqliteStore(databaseFile);
    context.after(() => {
      if (store) store.close();
      fs.rmSync(directory, { recursive: true, force: true });
    });
    store.seedCatalog(loadLegacyCatalog());

    const legacyItemId = 157;
    const legacyDamagedItemId = 515;
    const customItemId = 158;
    store.database.prepare(`
      UPDATE catalog_items
      SET icon = '/legacy/img/icons/M7L1.png', icon_source = 'mine-rarity',
        large_image_filename = NULL, large_image = '/legacy/img/icons/M7L1.png',
        has_large_image = 0
      WHERE id = ?
    `).run(legacyItemId);
    store.database.prepare(`
      UPDATE catalog_items
      SET icon = '/legacy/img/icons/M7L1.png', icon_source = 'damaged-mine-rarity',
        large_image_filename = NULL, large_image = '/legacy/img/icons/M7L1.png',
        has_large_image = 0
      WHERE id = ?
    `).run(legacyDamagedItemId);
    store.database.prepare(`
      UPDATE catalog_items
      SET icon = '/database/custom-weapon.svg', icon_source = 'database',
        large_image_filename = 'custom-weapon.svg',
        large_image = '/database/custom-weapon-large.svg', has_large_image = 1
      WHERE id = ?
    `).run(customItemId);
    store.close();
    store = null;

    store = new SqliteStore(databaseFile);
    const migrated = store.database.prepare(`
      SELECT icon, icon_source, large_image_filename, large_image, has_large_image
      FROM catalog_items WHERE id = ?
    `);
    assert.deepEqual({ ...migrated.get(legacyItemId) }, {
      icon: weaponIconPath(legacyItemId),
      icon_source: 'weapon-svg',
      large_image_filename: null,
      large_image: weaponIconPath(legacyItemId),
      has_large_image: 1
    });
    assert.deepEqual({ ...migrated.get(legacyDamagedItemId) }, {
      icon: weaponIconPath(legacyItemId),
      icon_source: 'damaged-weapon-svg',
      large_image_filename: null,
      large_image: weaponIconPath(legacyItemId),
      has_large_image: 1
    });
    assert.deepEqual({ ...migrated.get(customItemId) }, {
      icon: '/database/custom-weapon.svg',
      icon_source: 'database',
      large_image_filename: 'custom-weapon.svg',
      large_image: '/database/custom-weapon-large.svg',
      has_large_image: 1
    });
    const migration = store.database.prepare(`
      SELECT details_json FROM schema_migrations WHERE name = 'weapon-svg-icons-v1'
    `).get();
    assert.deepEqual(JSON.parse(migration.details_json), {
      icons: EXPECTED_WEAPON_ITEM_IDS.length,
      intactChanges: 1,
      damagedChanges: 1
    });
  assert.equal(store.database.prepare('PRAGMA user_version').get().user_version, 138);
  });
