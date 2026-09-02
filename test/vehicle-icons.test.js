import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createPlayer } from '../src/game.js';
import { loadLegacyCatalog } from '../src/legacy-catalog.js';
import { createApp } from '../src/server.js';
import { SqliteStore } from '../src/store.js';
import {
  AIR_VEHICLE_ICON_ITEM_IDS,
  LAND_VEHICLE_ICON_ITEM_IDS,
  SEA_VEHICLE_ICON_ITEM_IDS,
  VEHICLE_ICON_ITEM_IDS,
  vehicleIconPath
} from '../src/vehicle-icons.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VEHICLE_ASSET_DIRECTORY = path.join(ROOT, 'public', 'img', 'items', 'vehicles');
const EXPECTED_LAND_VEHICLE_ITEM_IDS = [
  5, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153,
  154, 155, 156, 217, 218, 219, 220, 221, 222, 1253, 1254, 1255, 1256, 1257, 1258,
  1265, 1403, 1585
];
const EXPECTED_SEA_VEHICLE_ITEM_IDS = [
  283, 284, 285, 289, 290, 291, 292, 293, 294, 295, 296, 297, 298, 299, 300,
  731, 733, 734, 735, 736, 1087, 1088, 1089, 1090, 1266, 1390, 1391, 1392,
  1393, 1394, 1395, 1402, 1584
];
const EXPECTED_AIR_VEHICLE_ITEM_IDS = [737, 738, 739];
const EXPECTED_VEHICLE_ITEM_IDS = [
  ...EXPECTED_LAND_VEHICLE_ITEM_IDS,
  ...EXPECTED_SEA_VEHICLE_ITEM_IDS,
  ...EXPECTED_AIR_VEHICLE_ITEM_IDS
].sort((first, second) => first - second);

function vehicleGeometrySignature(svg) {
  return svg
    .replace(/<title\b[^>]*>[^]*?<\/title>/gu, '')
    .replace(/<desc\b[^>]*>[^]*?<\/desc>/gu, '')
    .replace(/<defs\b[^>]*>[^]*?<\/defs>/gu, '')
    .replace(/\s(?:fill|stroke|stroke-width|stroke-linecap|stroke-linejoin|opacity)="[^"]*"/gu,
      '')
    .replace(/\s+/gu, ' ')
    .trim();
}

test('vehicle icon paths cover the exact 70-item land, sea, and air allowlist', () => {
  assert.deepEqual(LAND_VEHICLE_ICON_ITEM_IDS, EXPECTED_LAND_VEHICLE_ITEM_IDS);
  assert.deepEqual(SEA_VEHICLE_ICON_ITEM_IDS, EXPECTED_SEA_VEHICLE_ITEM_IDS);
  assert.deepEqual(AIR_VEHICLE_ICON_ITEM_IDS, EXPECTED_AIR_VEHICLE_ITEM_IDS);
  assert.deepEqual(VEHICLE_ICON_ITEM_IDS, EXPECTED_VEHICLE_ITEM_IDS);
  assert.equal(VEHICLE_ICON_ITEM_IDS.length, 70);
  for (const itemIds of [
    LAND_VEHICLE_ICON_ITEM_IDS,
    SEA_VEHICLE_ICON_ITEM_IDS,
    AIR_VEHICLE_ICON_ITEM_IDS,
    VEHICLE_ICON_ITEM_IDS
  ]) assert.equal(Object.isFrozen(itemIds), true);

  for (const itemId of EXPECTED_VEHICLE_ITEM_IDS) {
    assert.equal(vehicleIconPath(itemId), `/node/vehicles/vehicle-${itemId}.svg`);
  }
  assert.equal(vehicleIconPath('739'), '/node/vehicles/vehicle-739.svg');
  assert.equal(vehicleIconPath('1584'), '/node/vehicles/vehicle-1584.svg');
  for (const invalid of [
    null, undefined, '', 4, 6, 138, 286, 287, 288, 730, 732, 740, 1404, 1583, 1586,
    5.5, NaN, Infinity, 'Camel'
  ]) assert.equal(vehicleIconPath(invalid), null, String(invalid));
});

test('all vehicle SVG assets have exact inventory, accessible metadata, and distinct geometry',
  () => {
    const expectedFiles = EXPECTED_VEHICLE_ITEM_IDS
      .map((itemId) => `vehicle-${itemId}.svg`).sort();
    assert.deepEqual(fs.readdirSync(VEHICLE_ASSET_DIRECTORY).sort(), expectedFiles);

    const catalog = loadLegacyCatalog();
    const geometrySignatures = new Set();
    for (const itemId of EXPECTED_VEHICLE_ITEM_IDS) {
      const item = catalog.byId.get(itemId);
      assert.ok(item, `catalog item ${itemId}`);
      const filename = path.join(VEHICLE_ASSET_DIRECTORY, `vehicle-${itemId}.svg`);
      const svg = fs.readFileSync(filename, 'utf8');
      assert.match(svg, /^<svg\b[^>]*\bxmlns="http:\/\/www\.w3\.org\/2000\/svg"/u,
        filename);
      assert.match(svg, /\bviewBox="0 0 128 128"/u, filename);
      assert.match(svg, /\brole="img"/u, filename);
      assert.match(svg, /\baria-labelledby="title desc"/u, filename);
      assert.equal((svg.match(/<title\b/gu) ?? []).length, 1, `${filename} title count`);
      assert.equal((svg.match(/<desc\b/gu) ?? []).length, 1, `${filename} description count`);
      const title = svg.match(/<title id="title">([^<]+)<\/title>/u)?.[1];
      const description = svg.match(/<desc id="desc">([^<]+)<\/desc>/u)?.[1];
      assert.equal(title, item.name, `${filename} title`);
      assert.ok(description && description.length >= 20, `${filename} description`);

      assert.doesNotMatch(svg, /<!DOCTYPE|<!ENTITY/iu, filename);
      assert.doesNotMatch(svg, /<\s*(?:script|foreignObject|iframe|object|embed|image)\b/iu,
        filename);
      assert.doesNotMatch(svg, /\b(?:href|xlink:href)\s*=/iu, filename);
      assert.doesNotMatch(svg, /\bon[a-z]+\s*=/iu, filename);
      assert.doesNotMatch(svg, /(?:javascript|data):/iu, filename);
      assert.doesNotMatch(svg, /@import|url\(\s*["']?(?:https?:|\/\/)/iu, filename);
      assert.match(svg, /<\/svg>\s*$/u, filename);
      geometrySignatures.add(vehicleGeometrySignature(svg));
    }
    assert.equal(geometrySignatures.size, EXPECTED_VEHICLE_ITEM_IDS.length,
      'every vehicle must have its own geometry, not merely different accessible text');
  });

test('fresh catalogs map every intact and damaged vehicle to its dedicated SVG', () => {
  const catalog = loadLegacyCatalog();
  const vehicleItemIds = new Set(catalog.vehicles.map((vehicle) => vehicle.itemId));
  assert.deepEqual([...vehicleItemIds].sort((first, second) => first - second),
    EXPECTED_VEHICLE_ITEM_IDS);

  const damagedVehicles = catalog.items.filter((item) =>
    item.repairedItemId !== null && vehicleItemIds.has(item.repairedItemId));
  assert.equal(damagedVehicles.length, EXPECTED_VEHICLE_ITEM_IDS.length);
  const distinctIcons = new Set();
  for (const itemId of EXPECTED_VEHICLE_ITEM_IDS) {
    const expectedIcon = vehicleIconPath(itemId);
    const item = catalog.byId.get(itemId);
    distinctIcons.add(item.icon);
    assert.deepEqual({
      icon: item.icon,
      iconSource: item.iconSource,
      largeImage: item.largeImage,
      hasLargeImage: item.hasLargeImage
    }, {
      icon: expectedIcon,
      iconSource: 'vehicle-svg',
      largeImage: expectedIcon,
      hasLargeImage: true
    });
    const damaged = damagedVehicles.filter((candidate) => candidate.repairedItemId === itemId);
    assert.equal(damaged.length, 1, `damaged counterpart for item ${itemId}`);
    assert.deepEqual({
      icon: damaged[0].icon,
      iconSource: damaged[0].iconSource,
      largeImage: damaged[0].largeImage,
      hasLargeImage: damaged[0].hasLargeImage
    }, {
      icon: expectedIcon,
      iconSource: 'damaged-vehicle-svg',
      largeImage: expectedIcon,
      hasLargeImage: true
    });
  }
  assert.equal(distinctIcons.size, EXPECTED_VEHICLE_ITEM_IDS.length);
});

test('serves all vehicle SVGs, supports HEAD and land-sea-air details, and rejects gaps',
  async (context) => {
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

    await Promise.all(EXPECTED_VEHICLE_ITEM_IDS.map(async (itemId) => {
      const response = await fetch(`${base}${vehicleIconPath(itemId)}`);
      assert.equal(response.status, 200, String(itemId));
      assert.match(response.headers.get('content-type'), /^image\/svg\+xml\b/u, String(itemId));
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.ok(Number(response.headers.get('content-length')) > 0, String(itemId));
      assert.ok(response.headers.get('etag'), String(itemId));
      assert.ok((await response.text()).includes(
        `<title id="title">${catalog.byId.get(itemId).name}</title>`
      ), String(itemId));
    }));

    const head = await fetch(`${base}/node/vehicles/vehicle-5.svg`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.match(head.headers.get('content-type'), /^image\/svg\+xml\b/u);
    assert.ok(Number(head.headers.get('content-length')) > 0);
    assert.equal(await head.text(), '');

    for (const itemId of [154, 283, 737, 1584, 1585]) {
      const response = await fetch(`${base}/items/${itemId}`);
      assert.equal(response.status, 200, String(itemId));
      const html = await response.text();
      assert.ok(html.includes(`class="detail-image" src="${vehicleIconPath(itemId)}"`),
        String(itemId));
      assert.ok(html.includes('data-large-image="original"'), String(itemId));
    }

    for (const invalidPath of [
      '/node/vehicles/vehicle-4.svg',
      '/node/vehicles/vehicle-6.svg',
      '/node/vehicles/vehicle-138.svg',
      '/node/vehicles/vehicle-286.svg',
      '/node/vehicles/vehicle-740.svg',
      '/node/vehicles/vehicle-1404.svg',
      '/node/vehicles/vehicle-1583.svg',
      '/node/vehicles/vehicle-1586.svg',
      '/node/vehicles/vehicle-5.png',
      '/node/vehicles/vehicle-5.svg/extra',
      '/node/vehicles/not-a-vehicle.svg'
    ]) assert.equal((await fetch(`${base}${invalidPath}`)).status, 404, invalidPath);
  });

test('existing catalogs migrate representative vehicle art and preserve custom and nonvehicle art',
  (context) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-vehicle-icons-'));
    const databaseFile = path.join(directory, 'game.sqlite');
    let store = new SqliteStore(databaseFile);
    context.after(() => {
      if (store) store.close();
      fs.rmSync(directory, { recursive: true, force: true });
    });
    store.seedCatalog(loadLegacyCatalog());

    const representativePairs = [
      { intact: 154, damaged: 512, source: 'mine-rarity', damagedSource: 'damaged-mine-rarity' },
      { intact: 283, damaged: 642, source: 'mine-rarity', damagedSource: 'damaged-mine-rarity' },
      { intact: 737, damaged: 754, source: 'marketable', damagedSource: 'damaged-marketable' }
    ];
    const setLegacyArt = store.database.prepare(`
      UPDATE catalog_items
      SET icon = '/legacy/vehicle.png', icon_source = ?,
        large_image_filename = 'legacy-vehicle.png',
        large_image = '/legacy/vehicle-large.png', has_large_image = 0
      WHERE id = ?
    `);
    for (const pair of representativePairs) {
      setLegacyArt.run(pair.source, pair.intact);
      setLegacyArt.run(pair.damagedSource, pair.damaged);
    }

    const customRows = [
      {
        id: 155, icon: '/database/custom-vehicle.svg', source: 'database',
        filename: 'custom-vehicle.svg', largeImage: '/database/custom-vehicle-large.svg'
      },
      {
        id: 513, icon: '/database/custom-damaged-vehicle.svg', source: 'damaged-database',
        filename: 'custom-damaged-vehicle.svg',
        largeImage: '/database/custom-damaged-vehicle-large.svg'
      },
      {
        id: 1, icon: '/database/nonvehicle.svg', source: 'mine-rarity',
        filename: 'nonvehicle.svg', largeImage: '/database/nonvehicle-large.svg'
      }
    ];
    const setCustomArt = store.database.prepare(`
      UPDATE catalog_items
      SET icon = ?, icon_source = ?, large_image_filename = ?, large_image = ?,
        has_large_image = 1
      WHERE id = ?
    `);
    for (const row of customRows) {
      setCustomArt.run(row.icon, row.source, row.filename, row.largeImage, row.id);
    }
    store.close();
    store = null;

    store = new SqliteStore(databaseFile);
    const selectArt = store.database.prepare(`
      SELECT icon, icon_source, large_image_filename, large_image, has_large_image
      FROM catalog_items WHERE id = ?
    `);
    for (const pair of representativePairs) {
      assert.deepEqual({ ...selectArt.get(pair.intact) }, {
        icon: vehicleIconPath(pair.intact),
        icon_source: 'vehicle-svg',
        large_image_filename: null,
        large_image: vehicleIconPath(pair.intact),
        has_large_image: 1
      });
      assert.deepEqual({ ...selectArt.get(pair.damaged) }, {
        icon: vehicleIconPath(pair.intact),
        icon_source: 'damaged-vehicle-svg',
        large_image_filename: null,
        large_image: vehicleIconPath(pair.intact),
        has_large_image: 1
      });
    }
    for (const row of customRows) {
      assert.deepEqual({ ...selectArt.get(row.id) }, {
        icon: row.icon,
        icon_source: row.source,
        large_image_filename: row.filename,
        large_image: row.largeImage,
        has_large_image: 1
      });
    }

    const selectMigration = store.database.prepare(`
      SELECT applied_at, details_json
      FROM schema_migrations WHERE name = 'vehicle-svg-icons-v1'
    `);
    const migration = { ...selectMigration.get() };
    assert.deepEqual(JSON.parse(migration.details_json), {
      icons: EXPECTED_VEHICLE_ITEM_IDS.length,
      intactChanges: representativePairs.length,
      damagedChanges: representativePairs.length
    });
  assert.equal(store.database.prepare('PRAGMA user_version').get().user_version, 130);

    store.close();
    store = null;
    store = new SqliteStore(databaseFile);
    assert.deepEqual({ ...store.database.prepare(`
      SELECT applied_at, details_json
      FROM schema_migrations WHERE name = 'vehicle-svg-icons-v1'
    `).get() }, migration);
    assert.equal(store.database.prepare(`
      SELECT COUNT(*) AS count FROM schema_migrations WHERE name = 'vehicle-svg-icons-v1'
    `).get().count, 1);
    assert.deepEqual({ ...store.database.prepare(`
      SELECT icon, icon_source, large_image_filename, large_image, has_large_image
      FROM catalog_items WHERE id = 155
    `).get() }, {
      icon: customRows[0].icon,
      icon_source: customRows[0].source,
      large_image_filename: customRows[0].filename,
      large_image: customRows[0].largeImage,
      has_large_image: 1
    });
  });

test('activated public vehicles retain their catalog SVG icon', (context) => {
  const catalog = loadLegacyCatalog();
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  const player = createPlayer('Vehicle Icon Driver', '', 'hash', catalog, 1000, () => 0.5);
  const expectedItemIds = new Set(EXPECTED_VEHICLE_ITEM_IDS);
  const vehicleType = catalog.vehicles.find((vehicle) =>
    expectedItemIds.has(vehicle.itemId)
    && catalog.routes.some((route) => route.open && route.type === vehicle.routeType
      && route.city1Id !== route.city2Id
      && (route.city1Id === player.cityId || route.city2Id === player.cityId)));
  assert.ok(vehicleType, 'a route-compatible allowlisted vehicle');
  player.inventory = { [vehicleType.itemId]: 1 };
  player.inventoryByCity = { [player.cityId]: player.inventory };
  const saved = store.addPlayer(player);
  const vehicleId = store.activateVehicle(saved.id, vehicleType.itemId, 1000);
  const expectedIcon = vehicleIconPath(vehicleType.itemId);
  assert.equal(store.vehicleDetails(saved.id, vehicleId, 2000).icon, expectedIcon);
  assert.equal(store.vehiclesForPlayer(saved.id, 2000)[0].icon, expectedIcon);
});
