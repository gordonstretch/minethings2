import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  AVATAR_ICON_ITEM_IDS, AVATAR_ICON_VERSION, avatarIconPath
} from '../src/avatar-icons.js';
import {
  EQUIPMENT_ICON_ITEM_IDS, EQUIPMENT_ICON_VERSION, equipmentIconPath
} from '../src/equipment-icons.js';
import { loadLegacyCatalog } from '../src/legacy-catalog.js';
import { createApp } from '../src/server.js';
import { SqliteStore } from '../src/store.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AVATAR_ASSETS = path.join(ROOT, 'public', 'img', 'items', 'avatars');
const EQUIPMENT_ASSETS = path.join(ROOT, 'public', 'img', 'items', 'equipment');

function geometrySignature(svg) {
  return svg
    .replace(/<title\b[^>]*>[^]*?<\/title>/gu, '')
    .replace(/<desc\b[^>]*>[^]*?<\/desc>/gu, '')
    .replace(/<defs\b[^>]*>[^]*?<\/defs>/gu, '')
    .replace(/\s(?:fill|stroke|stroke-width|stroke-linecap|stroke-linejoin|opacity)="[^"]*"/gu,
      '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function assertSafeSvg(filename, title) {
  const svg = fs.readFileSync(filename, 'utf8');
  assert.match(svg, /^<svg\b[^>]*\bxmlns="http:\/\/www\.w3\.org\/2000\/svg"/u, filename);
  assert.match(svg, /\bviewBox="0 0 128 128"/u, filename);
  assert.match(svg, /\brole="img"/u, filename);
  assert.match(svg, /\baria-labelledby="title desc"/u, filename);
  assert.equal(svg.match(/<title id="title">([^<]+)<\/title>/u)?.[1], title, filename);
  assert.ok((svg.match(/<desc id="desc">([^<]+)<\/desc>/u)?.[1]?.length ?? 0) >= 20,
    filename);
  assert.doesNotMatch(svg, /<!DOCTYPE|<!ENTITY/iu, filename);
  assert.doesNotMatch(svg, /<\s*(?:script|foreignObject|iframe|object|embed|image)\b/iu, filename);
  assert.doesNotMatch(svg, /\b(?:href|xlink:href)\s*=/iu, filename);
  assert.doesNotMatch(svg, /\bon[a-z]+\s*=/iu, filename);
  assert.doesNotMatch(svg, /(?:javascript|data):/iu, filename);
  assert.doesNotMatch(svg,
    /<rect x="4" y="4" width="120" height="120" rx="21"/u,
    `${filename} must not use the old framed icon tile`);
  assert.match(svg, /<\/svg>\s*$/u, filename);
  return svg;
}

test('avatar and equipment icon helpers expose only exact catalog allowlists', () => {
  assert.deepEqual(EQUIPMENT_ICON_ITEM_IDS, [
    ...Array.from({ length: 42 }, (_, index) => 51 + index), 730
  ]);
  assert.deepEqual(AVATAR_ICON_ITEM_IDS,
    Array.from({ length: 156 }, (_, index) => 761 + index));
  assert.equal(Object.isFrozen(EQUIPMENT_ICON_ITEM_IDS), true);
  assert.equal(Object.isFrozen(AVATAR_ICON_ITEM_IDS), true);
  assert.equal(EQUIPMENT_ICON_VERSION, 2);
  assert.equal(AVATAR_ICON_VERSION, 2);
  for (const itemId of EQUIPMENT_ICON_ITEM_IDS) {
    assert.equal(equipmentIconPath(itemId),
      `/node/equipment/equipment-${itemId}.svg?v=2`);
  }
  for (const itemId of AVATAR_ICON_ITEM_IDS) {
    assert.equal(avatarIconPath(itemId), `/node/avatars/avatar-${itemId}.svg?v=2`);
  }
  for (const invalid of [null, undefined, '', 0, 50, 93, 729, 731, 760, 917, 1.5, NaN]) {
    assert.equal(equipmentIconPath(invalid), null, `equipment ${invalid}`);
    assert.equal(avatarIconPath(invalid), null, `avatar ${invalid}`);
  }
});

test('SVGs are safe, unframed, and equipment tiers reuse strong type silhouettes', () => {
  const catalog = loadLegacyCatalog();
  assert.deepEqual(fs.readdirSync(EQUIPMENT_ASSETS).sort(),
    EQUIPMENT_ICON_ITEM_IDS.map((id) => `equipment-${id}.svg`).sort());
  assert.deepEqual(fs.readdirSync(AVATAR_ASSETS).sort(),
    AVATAR_ICON_ITEM_IDS.map((id) => `avatar-${id}.svg`).sort());

  const equipmentGeometryByType = new Map();
  for (const itemId of EQUIPMENT_ICON_ITEM_IDS) {
    const svg = assertSafeSvg(
      path.join(EQUIPMENT_ASSETS, `equipment-${itemId}.svg`),
      catalog.byId.get(itemId).name
    );
    const equipment = catalog.equipmentByItemId.get(itemId);
    const type = catalog.equipmentTypeById.get(equipment.typeId).name;
    const signature = geometrySignature(svg);
    if (equipmentGeometryByType.has(type)) {
      assert.equal(signature, equipmentGeometryByType.get(type),
        `${catalog.byId.get(itemId).name} must reuse the ${type} silhouette`);
    } else {
      equipmentGeometryByType.set(type, signature);
    }
    assert.ok(svg.includes(catalog.settings.rarity_color_hexes[equipment.rarity]),
      `${catalog.byId.get(itemId).name} must use its tier colour`);
  }
  assert.deepEqual([...equipmentGeometryByType.keys()].sort(), [
    'Boots', 'Cart', 'Drill', 'Hardhat', 'Light', 'Pickaxe', 'Tool Belt'
  ]);

  const avatarGeometry = new Set();
  for (const itemId of AVATAR_ICON_ITEM_IDS) {
    const svg = assertSafeSvg(
      path.join(AVATAR_ASSETS, `avatar-${itemId}.svg`),
      catalog.byId.get(itemId).name
    );
    avatarGeometry.add(geometrySignature(svg));
  }
  assert.equal(avatarGeometry.size, AVATAR_ICON_ITEM_IDS.length,
    'avatar things need distinguishable geometry, not only different paint');
});

test('catalog item art uses SVGs while compositor layer metadata keeps legacy PNG filenames', () => {
  const catalog = loadLegacyCatalog();
  for (const entry of catalog.equipment) {
    const item = catalog.byId.get(entry.itemId);
    assert.deepEqual({
      icon: item.icon, source: item.iconSource, largeImage: item.largeImage,
      hasLargeImage: item.hasLargeImage
    }, {
      icon: equipmentIconPath(item.id), source: 'equipment-svg',
      largeImage: equipmentIconPath(item.id), hasLargeImage: true
    });
  }
  for (const element of catalog.avatarElements) {
    const item = catalog.byId.get(element.itemId);
    assert.deepEqual({
      icon: item.icon, source: item.iconSource, largeImage: item.largeImage,
      hasLargeImage: item.hasLargeImage
    }, {
      icon: avatarIconPath(item.id), source: 'avatar-svg',
      largeImage: avatarIconPath(item.id), hasLargeImage: true
    });
    assert.match(element.filename, /^[A-Z]{32}\.png$/u,
      `avatar ${element.id} must retain its compositing PNG`);
    assert.ok(fs.existsSync(path.join(
      ROOT, 'td', 'public_html', 'app', 'webroot', 'img', 'avatars', 'src',
      element.filename
    )), element.filename);
  }

  const damaged = catalog.items.filter((item) =>
    EQUIPMENT_ICON_ITEM_IDS.includes(item.repairedItemId)
      || AVATAR_ICON_ITEM_IDS.includes(item.repairedItemId));
  assert.equal(damaged.length, EQUIPMENT_ICON_ITEM_IDS.length + AVATAR_ICON_ITEM_IDS.length);
  for (const item of damaged) {
    const repaired = catalog.byId.get(item.repairedItemId);
    assert.equal(item.icon, repaired.icon, item.name);
    assert.equal(item.largeImage, repaired.largeImage, item.name);
    assert.equal(item.iconSource, `damaged-${repaired.iconSource}`, item.name);
  }
});

test('serves standalone SVGs and leaves avatar and miner PNG dressing in rendered pages',
  async (context) => {
    const catalog = loadLegacyCatalog();
    const store = new SqliteStore(':memory:');
    store.seedCatalog(catalog);
    const server = createApp({ store, catalog, backgroundMaintenance: false });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    context.after(async () => {
      await new Promise((resolve, reject) =>
        server.close((error) => error ? reject(error) : resolve()));
      store.close();
    });
    const base = `http://127.0.0.1:${server.address().port}`;

    for (const [itemId, icon] of [
      [51, equipmentIconPath(51)], [730, equipmentIconPath(730)],
      [761, avatarIconPath(761)], [916, avatarIconPath(916)]
    ]) {
      const response = await fetch(`${base}${icon}`);
      assert.equal(response.status, 200, String(itemId));
      assert.match(response.headers.get('content-type'), /^image\/svg\+xml\b/u);
      assert.ok((await response.text()).includes(
        `<title id="title">${catalog.byId.get(itemId).name}</title>`
      ));
      const detail = await fetch(`${base}/items/${itemId}`);
      assert.equal(detail.status, 200);
      assert.ok((await detail.text()).includes(`class="detail-image" src="${icon}"`));
    }

    for (const invalid of [
      '/node/equipment/equipment-50.svg', '/node/equipment/equipment-51.png',
      '/node/avatars/avatar-760.svg', '/node/avatars/avatar-761.svg/extra'
    ]) assert.equal((await fetch(`${base}${invalid}`)).status, 404, invalid);

    const source = fs.readFileSync(path.join(ROOT, 'src', 'server.js'), 'utf8');
    const equipmentRenderer = source.slice(source.indexOf('function equipmentBot'),
      source.indexOf('function avatarStack'));
    const avatarRenderer = source.slice(source.indexOf('function avatarStack'),
      source.indexOf('function cityName'));
    assert.match(equipmentRenderer, /\/img\/equipment\/src\/Bot\.png/u);
    assert.match(equipmentRenderer, /\/img\/equipment\/src\/\$\{filename\}/u);
    assert.match(avatarRenderer,
      /\/img\/avatars\/src\/\$\{encodeURIComponent\(layer\.filename\)\}/u);
    assert.doesNotMatch(equipmentRenderer, /\/node\/equipment\//u);
    assert.doesNotMatch(avatarRenderer, /\/node\/avatars\//u);
  });

test('existing databases migrate only legacy avatar and equipment item presentation art',
  (context) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-layer-icons-'));
    const databaseFile = path.join(directory, 'game.sqlite');
    let store = new SqliteStore(databaseFile);
    context.after(() => {
      if (store) store.close();
      fs.rmSync(directory, { recursive: true, force: true });
    });
    store.seedCatalog(loadLegacyCatalog());

    const legacy = [
      [51, 'equipment'], [415, 'damaged-equipment'],
      [730, 'mine-rarity'], [747, 'damaged-mine-rarity'],
      [761, 'avatar'], [1072, 'damaged-avatar']
    ];
    const setArt = store.database.prepare(`
      UPDATE catalog_items SET icon = '/legacy/item.png', icon_source = ?,
        large_image_filename = 'legacy.png', large_image = '/legacy/large.png',
        has_large_image = 0 WHERE id = ?
    `);
    for (const [id, source] of legacy) setArt.run(source, id);
    const custom = {
      id: 52, icon: '/custom/equipment.svg', source: 'database',
      filename: 'custom.svg', large: '/custom/equipment-large.svg'
    };
    store.database.prepare(`
      UPDATE catalog_items SET icon = ?, icon_source = ?, large_image_filename = ?,
        large_image = ?, has_large_image = 1 WHERE id = ?
    `).run(custom.icon, custom.source, custom.filename, custom.large, custom.id);
    const staleVersionedArt = [
      [53, '/node/equipment/equipment-53.svg', 'equipment-svg'],
      [797, '/node/avatars/avatar-797.svg', 'avatar-svg']
    ];
    for (const [id, icon, source] of staleVersionedArt) {
      store.database.prepare(`
        UPDATE catalog_items SET icon = ?, icon_source = ?, large_image = ?
        WHERE id = ?
      `).run(icon, source, icon, id);
    }
    store.database.prepare(`DELETE FROM schema_migrations
      WHERE name IN ('equipment-svg-icons-v1', 'avatar-svg-icons-v1')`).run();
    store.close(); store = null;

    store = new SqliteStore(databaseFile);
    const art = store.database.prepare(`SELECT icon, icon_source, large_image_filename,
      large_image, has_large_image FROM catalog_items WHERE id = ?`);
    for (const [id, repairedId, expectedPath, expectedSource] of [
      [51, null, equipmentIconPath(51), 'equipment-svg'],
      [415, 51, equipmentIconPath(51), 'damaged-equipment-svg'],
      [730, null, equipmentIconPath(730), 'equipment-svg'],
      [747, 730, equipmentIconPath(730), 'damaged-equipment-svg'],
      [761, null, avatarIconPath(761), 'avatar-svg'],
      [1072, 761, avatarIconPath(761), 'damaged-avatar-svg'],
      [53, null, equipmentIconPath(53), 'equipment-svg'],
      [797, null, avatarIconPath(797), 'avatar-svg']
    ]) {
      assert.deepEqual({ ...art.get(id) }, {
        icon: expectedPath, icon_source: expectedSource, large_image_filename: null,
        large_image: expectedPath, has_large_image: 1
      }, String(repairedId ?? id));
    }
    assert.deepEqual({ ...art.get(custom.id) }, {
      icon: custom.icon, icon_source: custom.source,
      large_image_filename: custom.filename, large_image: custom.large, has_large_image: 1
    });
    for (const name of [
      'equipment-svg-icons-v1', 'avatar-svg-icons-v1',
      'avatar-equipment-unframed-svg-icons-v2'
    ]) {
      const migration = store.database.prepare(
        'SELECT details_json FROM schema_migrations WHERE name = ?'
      ).get(name);
      assert.ok(migration, name);
    }
  });
