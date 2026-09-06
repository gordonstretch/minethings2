import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { loadLegacyCatalog, MAGNET_CATALOG } from '../src/legacy-catalog.js';
import { MOD_ICON_ITEM_IDS, modIconPath } from '../src/mod-icons.js';
import { OIL_ICON_ITEM_IDS, oilIconPath } from '../src/oil-icons.js';
import { ORE_ICON_ITEM_IDS, oreIconPath } from '../src/ore-icons.js';
import { createApp } from '../src/server.js';
import { SqliteStore } from '../src/store.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ITEM_ASSET_ROOT = path.join(ROOT, 'public', 'img', 'items');
const EXPECTED_OIL_ITEM_IDS = Object.freeze([1294]);
const EXPECTED_ORE_ITEM_IDS = Object.freeze([368]);
const EXPECTED_MOD_ITEM_IDS = Object.freeze(
  Array.from({ length: 72 }, (_, index) => 1108 + index)
);
const EXPECTED_MOD_COMPONENTS = Object.freeze([
  '90mm Gun',
  'Ammunition Rack',
  'Brake Coolers',
  'Bushings',
  'Chain Gun',
  'Coil Lift',
  'Door Panels',
  'Drive Shaft',
  'Flame Exhaust',
  'Forged Wheels',
  'Grill Guard',
  'Gun Rack',
  'Gun Turret',
  'High Load Tires',
  'HUD',
  'Missile Turret',
  'Power Inverter',
  'Quick Shift',
  'Range Finder',
  'Rear Plates',
  'Roll Bar',
  'Roof Plate',
  'Sensor Array',
  'Sensor Module',
  'Skid Plate',
  'Spoiler',
  'Sway Bars',
  'Tactical Display',
  'Window Guards'
]);
const MOD_TIER_PRESENTATION = Object.freeze({
  1: Object.freeze({ material: 'Tin', accent: '#d8be32' }),
  2: Object.freeze({ material: 'Aluminum', accent: '#698b18' }),
  3: Object.freeze({ material: 'Iron', accent: '#799c9c' }),
  4: Object.freeze({ material: 'Titanium', accent: '#e32121' }),
  5: Object.freeze({ material: 'Tungsten', accent: '#a64891' }),
  6: Object.freeze({ material: 'Carbon', accent: '#f79721' })
});
const ALL_MOD_ACCENTS = Object.values(MOD_TIER_PRESENTATION).map((tier) => tier.accent);
const MATERIAL_PREFIX = /^(?:Tin|Aluminum|Iron|Titanium|Tungsten|Carbon) /u;

const FAMILIES = Object.freeze([
  Object.freeze({
    name: 'Oil', directory: 'oil', ids: EXPECTED_OIL_ITEM_IDS,
    pathFor: oilIconPath, source: 'oil-svg', mineTypeId: 25
  }),
  Object.freeze({
    name: 'Ore', directory: 'ore', ids: EXPECTED_ORE_ITEM_IDS,
    pathFor: oreIconPath, source: 'ore-svg', mineTypeId: 16
  }),
  Object.freeze({
    name: 'Mods', directory: 'mods', ids: EXPECTED_MOD_ITEM_IDS,
    pathFor: modIconPath, source: 'mod-svg', mineTypeId: 24
  })
]);

function assetFilename(family, itemId) {
  return path.join(ITEM_ASSET_ROOT, family.directory, `item-${itemId}.svg`);
}

function readAsset(family, itemId) {
  return fs.readFileSync(assetFilename(family, itemId), 'utf8');
}

function geometrySignature(svg) {
  return svg
    .replace(/<title\b[^>]*>[^]*?<\/title>/gu, '')
    .replace(/<desc\b[^>]*>[^]*?<\/desc>/gu, '')
    .replace(/\s(?:fill|stroke|stroke-width|stroke-linecap|stroke-linejoin|fill-opacity|stroke-opacity)="[^"]*"/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
}

function componentName(itemName) {
  return String(itemName).replace(MATERIAL_PREFIX, '');
}

function damagedCounterpart(catalog, itemId) {
  const matches = catalog.items.filter((item) => item.repairedItemId === itemId);
  assert.equal(matches.length, 1, `damaged counterpart for item ${itemId}`);
  return matches[0];
}

function artFor(store, itemId) {
  return { ...store.database.prepare(`
    SELECT icon, icon_source, large_image_filename, large_image, has_large_image
    FROM catalog_items WHERE id = ?
  `).get(itemId) };
}

function openTrackedStore(openStores, databaseFile) {
  const store = new SqliteStore(databaseFile);
  openStores.add(store);
  return store;
}

function closeTrackedStore(openStores, store) {
  if (!store) return;
  store.close();
  openStores.delete(store);
}

test('Oil, Ore, and Mod path helpers expose only their exact stable allowlists', () => {
  assert.deepEqual(OIL_ICON_ITEM_IDS, EXPECTED_OIL_ITEM_IDS);
  assert.deepEqual(ORE_ICON_ITEM_IDS, EXPECTED_ORE_ITEM_IDS);
  assert.deepEqual(MOD_ICON_ITEM_IDS, EXPECTED_MOD_ITEM_IDS);
  for (const ids of [OIL_ICON_ITEM_IDS, ORE_ICON_ITEM_IDS, MOD_ICON_ITEM_IDS]) {
    assert.equal(Object.isFrozen(ids), true);
  }

  for (const family of FAMILIES) {
    for (const itemId of family.ids) {
      assert.equal(family.pathFor(itemId),
        `/node/${family.directory}/item-${itemId}.svg`, `${family.name} ${itemId}`);
    }
  }
  assert.equal(oilIconPath('1294'), '/node/oil/item-1294.svg');
  assert.equal(oreIconPath('368'), '/node/ore/item-368.svg');
  assert.equal(modIconPath('1179'), '/node/mods/item-1179.svg');

  const invalidCases = [null, undefined, '', 0, -1, 1.5, NaN, Infinity, {}, [], 'thing'];
  for (const invalid of invalidCases) {
    assert.equal(oilIconPath(invalid), null, `Oil invalid ${String(invalid)}`);
    assert.equal(oreIconPath(invalid), null, `Ore invalid ${String(invalid)}`);
    assert.equal(modIconPath(invalid), null, `Mod invalid ${String(invalid)}`);
  }
  for (const invalid of [1293, 1295, 1343, 368, 1108]) assert.equal(oilIconPath(invalid), null);
  for (const invalid of [367, 369, 726, 1294, 1108]) assert.equal(oreIconPath(invalid), null);
  for (const invalid of [368, 1107, 1180, 1181, 1294]) assert.equal(modIconPath(invalid), null);
});

test('all 74 Oil, Ore, and Mod SVG assets are exact, accessible, and self-contained', () => {
  const catalog = loadLegacyCatalog();
  let assetCount = 0;
  for (const family of FAMILIES) {
    const expectedFiles = family.ids.map((itemId) => `item-${itemId}.svg`).sort();
    const directory = path.join(ITEM_ASSET_ROOT, family.directory);
    assert.deepEqual(fs.readdirSync(directory).sort(), expectedFiles, family.name);
    for (const itemId of family.ids) {
      assetCount += 1;
      const filename = assetFilename(family, itemId);
      const svg = readAsset(family, itemId);
      assert.match(svg, /^<svg\b[^>]*\bxmlns="http:\/\/www\.w3\.org\/2000\/svg"/u,
        filename);
      assert.match(svg, /\bviewBox="0 0 128 128"/u, filename);
      assert.match(svg, /\brole="img"/u, filename);
      assert.match(svg, /\baria-labelledby="title desc"/u, filename);
      assert.match(svg,
        /<g stroke="#292d29" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">/u,
        filename);
      assert.equal((svg.match(/<title\b/gu) ?? []).length, 1, `${filename} title count`);
      assert.equal((svg.match(/<desc\b/gu) ?? []).length, 1, `${filename} desc count`);
      assert.equal(svg.match(/<title id="title">([^<]+)<\/title>/u)?.[1],
        catalog.byId.get(itemId).name, `${filename} title`);
      assert.ok((svg.match(/<desc id="desc">([^<]+)<\/desc>/u)?.[1]?.length ?? 0) >= 45,
        `${filename} description`);
      assert.doesNotMatch(svg, /<!DOCTYPE|<!ENTITY/iu, filename);
      assert.doesNotMatch(svg,
        /<\s*(?:script|foreignObject|iframe|object|embed|image)\b/iu, filename);
      assert.doesNotMatch(svg, /\b(?:href|xlink:href|on[a-z]+)\s*=/iu, filename);
      assert.doesNotMatch(svg, /(?:javascript|data):/iu, filename);
      assert.match(svg, /<\/svg>\s*$/u, filename);
    }
  }
  assert.equal(assetCount, 74);
});

test('Oil and Ore are unique while Mods reuse exactly 29 component geometry masters', () => {
  const catalog = loadLegacyCatalog();
  const oilSignature = geometrySignature(readAsset(FAMILIES[0], 1294));
  const oreSignature = geometrySignature(readAsset(FAMILIES[1], 368));
  assert.notEqual(oilSignature, oreSignature);

  const signaturesByComponent = new Map();
  const componentsBySignature = new Map();
  for (const itemId of EXPECTED_MOD_ITEM_IDS) {
    const component = componentName(catalog.byId.get(itemId).name);
    const signature = geometrySignature(readAsset(FAMILIES[2], itemId));
    if (!signaturesByComponent.has(component)) signaturesByComponent.set(component, new Set());
    signaturesByComponent.get(component).add(signature);
    if (!componentsBySignature.has(signature)) componentsBySignature.set(signature, new Set());
    componentsBySignature.get(signature).add(component);
  }

  assert.deepEqual([...signaturesByComponent.keys()].sort(), [...EXPECTED_MOD_COMPONENTS].sort());
  assert.equal(componentsBySignature.size, 29);
  for (const [component, signatures] of signaturesByComponent) {
    assert.equal(signatures.size, 1, `${component} must retain one geometry master`);
  }
  for (const [signature, components] of componentsBySignature) {
    assert.equal(components.size, 1,
      `one geometry master was shared across ${[...components].join(', ')}: ${signature}`);
  }
  assert.equal(componentsBySignature.has(oilSignature), false);
  assert.equal(componentsBySignature.has(oreSignature), false);
});

test('every Mod uses its required material name and tier accent colour', () => {
  const catalog = loadLegacyCatalog();
  for (const itemId of EXPECTED_MOD_ITEM_IDS) {
    const item = catalog.byId.get(itemId);
    const tier = MOD_TIER_PRESENTATION[item.rarity];
    assert.ok(tier, `tier palette for ${item.name}`);
    assert.match(item.name, new RegExp(`^${tier.material} `, 'u'));
    const svg = readAsset(FAMILIES[2], itemId);
    const presentAccents = ALL_MOD_ACCENTS.filter((accent) => svg.includes(accent));
    assert.deepEqual(presentAccents, [tier.accent], `${item.name} tier accent`);
  }
});

test('fresh catalogs map all intact and damaged Oil, Ore, and Mod items to SVG art', () => {
  const catalog = loadLegacyCatalog();
  assert.deepEqual(catalog.mods.map((mod) => mod.itemId), [
    ...EXPECTED_MOD_ITEM_IDS,
    MAGNET_CATALOG.items[0].id
  ],
    'every live Mod record must have deliberate artwork');
  assert.deepEqual({
    icon: catalog.byId.get(MAGNET_CATALOG.items[0].id).icon,
    iconSource: catalog.byId.get(MAGNET_CATALOG.items[0].id).iconSource,
    largeImage: catalog.byId.get(MAGNET_CATALOG.items[0].id).largeImage,
    hasLargeImage: catalog.byId.get(MAGNET_CATALOG.items[0].id).hasLargeImage
  }, {
    icon: '/node/equipment/magnet.svg',
    iconSource: 'equipment-svg',
    largeImage: '/node/equipment/magnet.svg',
    hasLargeImage: true
  }, 'Magnet uses its dedicated utility-fitting artwork');
  for (const family of FAMILIES) {
    const familyIdSet = new Set(family.ids);
    const damagedItems = catalog.items.filter((item) =>
      item.repairedItemId !== null && familyIdSet.has(item.repairedItemId));
    assert.equal(damagedItems.length, family.ids.length, `${family.name} damaged count`);
    for (const itemId of family.ids) {
      const icon = family.pathFor(itemId);
      const item = catalog.byId.get(itemId);
      assert.equal(item.mineTypeId, family.mineTypeId, item.name);
      assert.deepEqual({
        icon: item.icon, iconSource: item.iconSource,
        largeImage: item.largeImage, hasLargeImage: item.hasLargeImage
      }, {
        icon, iconSource: family.source, largeImage: icon, hasLargeImage: true
      }, item.name);

      const damaged = damagedCounterpart(catalog, itemId);
      assert.deepEqual({
        icon: damaged.icon, iconSource: damaged.iconSource,
        largeImage: damaged.largeImage, hasLargeImage: damaged.hasLargeImage
      }, {
        icon, iconSource: `damaged-${family.source}`,
        largeImage: icon, hasLargeImage: true
      }, damaged.name);
    }
  }
});

test('legacy Oil, Ore, and Mod artwork migrates once and guarded custom paths survive',
  (context) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-resource-icons-'));
    const openStores = new Set();
    context.after(() => {
      for (const store of openStores) store.close();
      fs.rmSync(directory, { recursive: true, force: true });
    });

    const catalog = loadLegacyCatalog();
    const defaultDatabase = path.join(directory, 'default.sqlite');
    let store = openTrackedStore(openStores, defaultDatabase);
    store.seedCatalog(catalog);
    const setArt = store.database.prepare(`
      UPDATE catalog_items
      SET icon = ?, icon_source = ?, large_image_filename = ?,
        large_image = ?, has_large_image = ?
      WHERE id = ?
    `);
    for (const family of FAMILIES) {
      for (const itemId of family.ids) {
        const item = catalog.byId.get(itemId);
        const damaged = damagedCounterpart(catalog, itemId);
        const legacy = `/legacy/img/icons/M${family.mineTypeId}L${item.rarity}.png`;
        setArt.run(legacy, 'mine-rarity', `thing${itemId}.png`, legacy, 0, itemId);
        setArt.run(legacy, 'damaged-mine-rarity', `thing${itemId}.png`, legacy, 0,
          damaged.id);
      }
    }
    closeTrackedStore(openStores, store);

    store = openTrackedStore(openStores, defaultDatabase);
    for (const family of FAMILIES) {
      for (const itemId of family.ids) {
        const icon = family.pathFor(itemId);
        const damaged = damagedCounterpart(catalog, itemId);
        assert.deepEqual(artFor(store, itemId), {
          icon, icon_source: family.source, large_image_filename: null,
          large_image: icon, has_large_image: 1
        }, `${family.name} intact ${itemId}`);
        assert.deepEqual(artFor(store, damaged.id), {
          icon, icon_source: `damaged-${family.source}`, large_image_filename: null,
          large_image: icon, has_large_image: 1
        }, `${family.name} damaged ${damaged.id}`);
      }
      assert.deepEqual(JSON.parse(store.database.prepare(`
        SELECT details_json FROM schema_migrations WHERE name = ?
      `).get(`${family.source}-icons-v1`).details_json), {
        icons: family.ids.length,
        intactChanges: family.ids.length,
        damagedChanges: family.ids.length
      });
    }
    const migrationsBeforeRestart = Object.fromEntries(FAMILIES.map((family) => [
      family.source,
      { ...store.database.prepare(`
        SELECT applied_at, details_json FROM schema_migrations WHERE name = ?
      `).get(`${family.source}-icons-v1`) }
    ]));
    closeTrackedStore(openStores, store);
    store = openTrackedStore(openStores, defaultDatabase);
    for (const family of FAMILIES) {
      assert.deepEqual({ ...store.database.prepare(`
        SELECT applied_at, details_json FROM schema_migrations WHERE name = ?
      `).get(`${family.source}-icons-v1`) }, migrationsBeforeRestart[family.source]);
      assert.equal(store.database.prepare(`
        SELECT COUNT(*) AS count FROM schema_migrations WHERE name = ?
      `).get(`${family.source}-icons-v1`).count, 1);
    }
    closeTrackedStore(openStores, store);

    const customDatabase = path.join(directory, 'custom.sqlite');
    store = openTrackedStore(openStores, customDatabase);
    store.seedCatalog(loadLegacyCatalog());
    const setCustomArt = store.database.prepare(`
      UPDATE catalog_items
      SET icon = ?, icon_source = ?, large_image_filename = ?,
        large_image = ?, has_large_image = ?
      WHERE id = ?
    `);
    const customRows = [];
    for (const family of FAMILIES) {
      const itemId = family.ids[0];
      const damagedId = damagedCounterpart(catalog, itemId).id;
      const customIcon = {
        icon: `/custom/${family.directory}-${itemId}.svg`, icon_source: 'mine-rarity',
        large_image_filename: `${family.directory}-${itemId}.svg`,
        large_image: `/custom/${family.directory}-${itemId}-large.svg`, has_large_image: 1
      };
      setCustomArt.run(customIcon.icon, customIcon.icon_source,
        customIcon.large_image_filename, customIcon.large_image,
        customIcon.has_large_image, itemId);
      customRows.push({ id: itemId, expected: customIcon });

      const damaged = catalog.byId.get(damagedId);
      const customLargeImage = {
        icon: `/legacy/img/icons/M${family.mineTypeId}L${damaged.rarity}.png`,
        icon_source: 'damaged-mine-rarity',
        large_image_filename: `${family.directory}-${damagedId}.svg`,
        large_image: `/custom/${family.directory}-${damagedId}-large.svg`, has_large_image: 1
      };
      setCustomArt.run(customLargeImage.icon, customLargeImage.icon_source,
        customLargeImage.large_image_filename, customLargeImage.large_image,
        customLargeImage.has_large_image, damagedId);
      customRows.push({ id: damagedId, expected: customLargeImage });
    }
    closeTrackedStore(openStores, store);
    store = openTrackedStore(openStores, customDatabase);
    for (const row of customRows) assert.deepEqual(artFor(store, row.id), row.expected);
    for (const family of FAMILIES) {
      assert.deepEqual(JSON.parse(store.database.prepare(`
        SELECT details_json FROM schema_migrations WHERE name = ?
      `).get(`${family.source}-icons-v1`).details_json), {
        icons: family.ids.length, intactChanges: 0, damagedChanges: 0
      });
    }
  });

test('serves all 74 GET and HEAD routes, rejects invalid assets, and renders item details',
  async (context) => {
    const store = new SqliteStore(':memory:');
    const catalog = loadLegacyCatalog();
    store.seedCatalog(catalog);
    const server = createApp({ store, backgroundMaintenance: false });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    context.after(async () => {
      await new Promise((resolve, reject) =>
        server.close((error) => error ? reject(error) : resolve()));
      store.close();
    });
    const base = `http://127.0.0.1:${server.address().port}`;
    const assets = FAMILIES.flatMap((family) =>
      family.ids.map((itemId) => ({ family, itemId, route: family.pathFor(itemId) })));
    assert.equal(assets.length, 74);

    await Promise.all(assets.map(async ({ itemId, route }) => {
      const response = await fetch(`${base}${route}`);
      assert.equal(response.status, 200, route);
      assert.match(response.headers.get('content-type'), /^image\/svg\+xml\b/u, route);
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff', route);
      assert.ok(Number(response.headers.get('content-length')) > 0, route);
      assert.ok(response.headers.get('etag'), route);
      assert.match(await response.text(), new RegExp(
        `<title id="title">${catalog.byId.get(itemId).name}</title>`, 'u'
      ), route);

      const head = await fetch(`${base}${route}`, { method: 'HEAD' });
      assert.equal(head.status, 200, `HEAD ${route}`);
      assert.match(head.headers.get('content-type'), /^image\/svg\+xml\b/u, route);
      assert.equal(head.headers.get('x-content-type-options'), 'nosniff', route);
      assert.ok(Number(head.headers.get('content-length')) > 0, route);
      assert.equal(await head.text(), '', route);
    }));

    for (const invalidPath of [
      '/node/oil/item-1293.svg',
      '/node/oil/item-1343.svg',
      '/node/oil/item-1294.png',
      '/node/oil/item-1294.svg/extra',
      '/node/ore/item-367.svg',
      '/node/ore/item-726.svg',
      '/node/ore/not-an-item.svg',
      '/node/mods/item-1107.svg',
      '/node/mods/item-1180.svg',
      '/node/mods/item-1181.svg',
      '/node/mods/item-1108.png',
      '/node/mods/item-1108.svg/extra'
    ]) {
      assert.equal((await fetch(`${base}${invalidPath}`)).status, 404, invalidPath);
      assert.equal((await fetch(`${base}${invalidPath}`, { method: 'HEAD' })).status, 404,
        `HEAD ${invalidPath}`);
    }

    for (const family of FAMILIES) {
      const itemId = family.ids[0];
      const item = catalog.byId.get(itemId);
      const damaged = damagedCounterpart(catalog, itemId);
      const routePattern = family.pathFor(itemId).replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
      const intactHtml = await (await fetch(`${base}/items/${itemId}`)).text();
      assert.doesNotMatch(intactHtml, /detail-image-fallback/u, item.name);
      assert.match(intactHtml, new RegExp(
        `class="detail-image" src="${routePattern}"[^>]+data-large-image="original"`, 'u'
      ), item.name);

      const damagedHtml = await (await fetch(`${base}/items/${damaged.id}`)).text();
      assert.doesNotMatch(damagedHtml, /detail-image-fallback/u, damaged.name);
      assert.match(damagedHtml, new RegExp(
        `class="detail rarity-${damaged.rarity} detail-damaged"[^]*class="detail-image" src="${routePattern}"[^>]+data-large-image="original"`,
        'u'
      ), damaged.name);
    }
  });
