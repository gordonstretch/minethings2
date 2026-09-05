import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { GADGET_ICON_ITEM_IDS, gadgetIconPath } from '../src/gadget-icons.js';
import { loadLegacyCatalog } from '../src/legacy-catalog.js';
import { createApp } from '../src/server.js';
import { SqliteStore } from '../src/store.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GADGET_ASSET_DIRECTORY = path.join(ROOT, 'public', 'img', 'items', 'gadgets');
const EXPECTED_GADGET_ITEM_IDS = [
  ...Array.from({ length: 24 }, (_, index) => 253 + index),
  742, 743,
  ...Array.from({ length: 12 }, (_, index) => 1404 + index),
  1589, 1590, 1591, 1592
];
const EXPECTED_DAMAGED_PAIRS = [
  ...Array.from({ length: 24 }, (_, index) => [611 + index, 253 + index]),
  [759, 742], [760, 743],
  ...Array.from({ length: 12 }, (_, index) => [1418 + index, 1404 + index]),
  [1593, 1589], [1594, 1590], [1595, 1591], [1596, 1592]
];

function gadgetGeometrySignature(svg) {
  return svg
    .replace(/<title\b[^>]*>[^]*?<\/title>/gu, '')
    .replace(/<desc\b[^>]*>[^]*?<\/desc>/gu, '')
    .replace(/<defs\b[^>]*>[^]*?<\/defs>/gu, '')
    .replace(/\s(?:fill|stroke|stroke-width|stroke-linecap|stroke-linejoin|opacity)="[^"]*"/gu,
      '')
    .replace(/\s+/gu, ' ')
    .trim();
}

test('gadget icon paths cover the exact 42-item catalogue allowlist', () => {
  assert.deepEqual(GADGET_ICON_ITEM_IDS, EXPECTED_GADGET_ITEM_IDS);
  assert.equal(Object.isFrozen(GADGET_ICON_ITEM_IDS), true);
  for (const itemId of EXPECTED_GADGET_ITEM_IDS) {
    assert.equal(gadgetIconPath(itemId), `/node/gadgets/gadget-${itemId}.svg`);
  }
  assert.equal(gadgetIconPath('253'), '/node/gadgets/gadget-253.svg');
  for (const invalid of [
    null, undefined, '', 0, 252, 277, 741, 744, 1403, 1416, 1588, 1593,
    253.5, NaN, Infinity, 'Tin Whetting Stone'
  ]) assert.equal(gadgetIconPath(invalid), null, String(invalid));
});

test('all gadget SVG assets have exact inventory, accessible metadata, and distinct geometry',
  () => {
    const expectedFiles = EXPECTED_GADGET_ITEM_IDS
      .map((itemId) => `gadget-${itemId}.svg`).sort();
    assert.deepEqual(fs.readdirSync(GADGET_ASSET_DIRECTORY).sort(), expectedFiles);

    const catalog = loadLegacyCatalog();
    const geometrySignatures = new Set();
    for (const itemId of EXPECTED_GADGET_ITEM_IDS) {
      const item = catalog.byId.get(itemId);
      assert.ok(item, `catalog item ${itemId}`);
      const filename = path.join(GADGET_ASSET_DIRECTORY, `gadget-${itemId}.svg`);
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
      geometrySignatures.add(gadgetGeometrySignature(svg));
    }
    assert.equal(geometrySignatures.size, EXPECTED_GADGET_ITEM_IDS.length,
      'every gadget activator must have its own geometry, not merely different text or paint');
  });

test('fresh catalogs map every intact and damaged gadget to its dedicated SVG', () => {
  const catalog = loadLegacyCatalog();
  const gadgetItemIds = [...new Set(catalog.gadgetItems.map((entry) => entry.itemId))]
    .sort((first, second) => first - second);
  assert.deepEqual(gadgetItemIds, EXPECTED_GADGET_ITEM_IDS);

  const gadgetItemIdSet = new Set(EXPECTED_GADGET_ITEM_IDS);
  const gadgets = catalog.items.filter((item) => gadgetItemIdSet.has(item.id));
  const damagedGadgets = catalog.items.filter((item) =>
    gadgetItemIdSet.has(item.repairedItemId));
  assert.equal(gadgets.length, EXPECTED_GADGET_ITEM_IDS.length);
  assert.equal(damagedGadgets.length, EXPECTED_DAMAGED_PAIRS.length);
  assert.deepEqual(damagedGadgets
    .map((item) => [item.id, item.repairedItemId])
    .sort((first, second) => first[0] - second[0]), EXPECTED_DAMAGED_PAIRS);

  for (const item of gadgets) {
    const expectedIcon = gadgetIconPath(item.id);
    assert.deepEqual({
      icon: item.icon,
      iconSource: item.iconSource,
      largeImage: item.largeImage,
      hasLargeImage: item.hasLargeImage
    }, {
      icon: expectedIcon,
      iconSource: 'gadget-svg',
      largeImage: expectedIcon,
      hasLargeImage: true
    });
    const damaged = damagedGadgets.filter((candidate) =>
      candidate.repairedItemId === item.id);
    assert.equal(damaged.length, 1, `damaged counterpart for item ${item.id}`);
    assert.deepEqual({
      icon: damaged[0].icon,
      iconSource: damaged[0].iconSource,
      largeImage: damaged[0].largeImage,
      hasLargeImage: damaged[0].hasLargeImage
    }, {
      icon: expectedIcon,
      iconSource: 'damaged-gadget-svg',
      largeImage: expectedIcon,
      hasLargeImage: true
    });
  }
});

test('serves every gadget SVG, supports HEAD and item details, and rejects gaps',
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

    await Promise.all(EXPECTED_GADGET_ITEM_IDS.map(async (itemId) => {
      const response = await fetch(`${base}${gadgetIconPath(itemId)}`);
      assert.equal(response.status, 200, String(itemId));
      assert.match(response.headers.get('content-type'), /^image\/svg\+xml\b/u, String(itemId));
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.ok(Number(response.headers.get('content-length')) > 0, String(itemId));
      assert.ok(response.headers.get('etag'), String(itemId));
      assert.ok((await response.text()).includes(
        `<title id="title">${catalog.byId.get(itemId).name}</title>`
      ), String(itemId));
    }));

    const head = await fetch(`${base}/node/gadgets/gadget-253.svg`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.match(head.headers.get('content-type'), /^image\/svg\+xml\b/u);
    assert.ok(Number(head.headers.get('content-length')) > 0);
    assert.equal(await head.text(), '');

    for (const itemId of [253, 255, 257, 259, 261, 263, 265, 267, 269, 271,
      273, 275, 742, 1404, 1415, 1589, 1592]) {
      const response = await fetch(`${base}/items/${itemId}`);
      assert.equal(response.status, 200, String(itemId));
      const html = await response.text();
      assert.ok(html.includes(`class="detail-image" src="${gadgetIconPath(itemId)}"`),
        String(itemId));
      assert.ok(html.includes('data-large-image="original"'), String(itemId));
    }

    for (const [damagedItemId, intactItemId] of [
      [611, 253], [759, 742], [1429, 1415], [1593, 1589], [1596, 1592]
    ]) {
      const response = await fetch(`${base}/items/${damagedItemId}`);
      assert.equal(response.status, 200, String(damagedItemId));
      const html = await response.text();
      assert.match(html, /class="detail rarity-\d+ detail-damaged"/u);
      assert.ok(html.includes(
        `class="detail-image" src="${gadgetIconPath(intactItemId)}"`
      ), String(damagedItemId));
    }

    for (const invalidPath of [
      '/node/gadgets/gadget-0.svg',
      '/node/gadgets/gadget-252.svg',
      '/node/gadgets/gadget-277.svg',
      '/node/gadgets/gadget-741.svg',
      '/node/gadgets/gadget-744.svg',
      '/node/gadgets/gadget-1403.svg',
      '/node/gadgets/gadget-1416.svg',
      '/node/gadgets/gadget-611.svg',
      '/node/gadgets/gadget-253.png',
      '/node/gadgets/gadget-253.svg/extra',
      '/node/gadgets/not-a-gadget.svg'
    ]) assert.equal((await fetch(`${base}${invalidPath}`)).status, 404, invalidPath);
  });

test('existing catalogs migrate legacy gadget art while preserving custom and nongadget art',
  (context) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-gadget-icons-'));
    const databaseFile = path.join(directory, 'game.sqlite');
    let store = new SqliteStore(databaseFile);
    context.after(() => {
      if (store) store.close();
      fs.rmSync(directory, { recursive: true, force: true });
    });
    store.seedCatalog(loadLegacyCatalog());
    const originalUserVersion = store.database.prepare('PRAGMA user_version').get().user_version;

    const representativePairs = [
      { intact: 253, damaged: 611 },
      { intact: 276, damaged: 634 },
      { intact: 742, damaged: 759 },
      { intact: 1415, damaged: 1429 }
    ];
    const setLegacyArt = store.database.prepare(`
      UPDATE catalog_items
      SET icon = '/legacy/gadget.png', icon_source = ?,
        large_image_filename = 'legacy-gadget.png',
        large_image = '/legacy/gadget-large.png', has_large_image = 0
      WHERE id = ?
    `);
    for (const pair of representativePairs) {
      setLegacyArt.run('mine-rarity', pair.intact);
      setLegacyArt.run('damaged-mine-rarity', pair.damaged);
    }

    const customRows = [
      {
        id: 254, icon: '/database/custom-gadget.svg', source: 'database',
        filename: 'custom-gadget.svg', largeImage: '/database/custom-gadget-large.svg'
      },
      {
        id: 612, icon: '/database/custom-damaged-gadget.svg', source: 'damaged-database',
        filename: 'custom-damaged-gadget.svg',
        largeImage: '/database/custom-damaged-gadget-large.svg'
      },
      {
        id: 1, icon: '/database/nongadget.svg', source: 'mine-rarity',
        filename: 'nongadget.svg', largeImage: '/database/nongadget-large.svg'
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
        icon: gadgetIconPath(pair.intact),
        icon_source: 'gadget-svg',
        large_image_filename: null,
        large_image: gadgetIconPath(pair.intact),
        has_large_image: 1
      });
      assert.deepEqual({ ...selectArt.get(pair.damaged) }, {
        icon: gadgetIconPath(pair.intact),
        icon_source: 'damaged-gadget-svg',
        large_image_filename: null,
        large_image: gadgetIconPath(pair.intact),
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

    const migration = { ...store.database.prepare(`
      SELECT applied_at, details_json
      FROM schema_migrations WHERE name = 'gadget-svg-icons-v1'
    `).get() };
    assert.deepEqual(JSON.parse(migration.details_json), {
      icons: EXPECTED_GADGET_ITEM_IDS.length,
      intactChanges: representativePairs.length,
      damagedChanges: representativePairs.length
    });
    assert.equal(store.database.prepare('PRAGMA user_version').get().user_version,
      originalUserVersion);

    store.close();
    store = null;
    store = new SqliteStore(databaseFile);
    assert.deepEqual({ ...store.database.prepare(`
      SELECT applied_at, details_json
      FROM schema_migrations WHERE name = 'gadget-svg-icons-v1'
    `).get() }, migration);
    assert.equal(store.database.prepare(`
      SELECT COUNT(*) AS count FROM schema_migrations WHERE name = 'gadget-svg-icons-v1'
    `).get().count, 1);
    assert.deepEqual({ ...store.database.prepare(`
      SELECT icon, icon_source, large_image_filename, large_image, has_large_image
      FROM catalog_items WHERE id = ?
    `).get(customRows[0].id) }, {
      icon: customRows[0].icon,
      icon_source: customRows[0].source,
      large_image_filename: customRows[0].filename,
      large_image: customRows[0].largeImage,
      has_large_image: 1
    });
  });
