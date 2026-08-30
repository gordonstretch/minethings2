import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { BAIT_ICON_ITEM_IDS, baitIconPath } from '../src/bait-icons.js';
import { CANNON_ICON_ITEM_IDS, cannonIconPath } from '../src/cannon-icons.js';
import { loadLegacyCatalog } from '../src/legacy-catalog.js';
import { createApp } from '../src/server.js';
import { SqliteStore } from '../src/store.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FAMILIES = [
  {
    name: 'Bait', mineTypeId: 14, ids: [310, 311, 312, 313, 314, 315],
    directory: 'bait', source: 'bait-svg', pathFor: baitIconPath
  },
  {
    name: 'Cannon', mineTypeId: 13,
    ids: [
      301, 302, 303, 304, 305, 306, 307, 308, 309,
      1074, 1075, 1076, 1077, 1078, 1079, 1091, 1092, 1093, 1094, 1095, 1096,
      1107, 1269, 1270, 1271
    ],
    directory: 'cannons', source: 'cannon-svg', pathFor: cannonIconPath
  }
];

function geometrySignature(svg) {
  return svg.replace(/<title\b[^>]*>[^]*?<\/title>/gu, '')
    .replace(/<desc\b[^>]*>[^]*?<\/desc>/gu, '')
    .replace(/\s(?:fill|stroke|stroke-width|stroke-linecap|stroke-linejoin|opacity|transform)="[^"]*"/gu, '')
    .replace(/\s+/gu, ' ').trim();
}

test('Bait and Cannon icon paths expose exact catalogue allowlists', () => {
  assert.deepEqual(BAIT_ICON_ITEM_IDS, FAMILIES[0].ids);
  assert.deepEqual(CANNON_ICON_ITEM_IDS, FAMILIES[1].ids);
  assert.equal(Object.isFrozen(BAIT_ICON_ITEM_IDS), true);
  assert.equal(Object.isFrozen(CANNON_ICON_ITEM_IDS), true);
  for (const family of FAMILIES) {
    for (const itemId of family.ids) assert.ok(family.pathFor(itemId)?.endsWith(`item-${itemId}.svg`));
  }
  for (const invalid of [null, undefined, '', 0, 300, 316, 1073, 1272, 1.5, NaN, Infinity]) {
    assert.equal(baitIconPath(invalid), null, `bait ${String(invalid)}`);
    assert.equal(cannonIconPath(invalid), null, `cannon ${String(invalid)}`);
  }
});

test('Bait and Cannon SVGs are exact, accessible, safe, and geometrically distinct', () => {
  const catalog = loadLegacyCatalog();
  const signatures = new Set();
  for (const family of FAMILIES) {
    const directory = path.join(ROOT, 'public', 'img', 'items', family.directory);
    assert.deepEqual(fs.readdirSync(directory).sort(),
      family.ids.map((itemId) => `item-${itemId}.svg`).sort());
    for (const itemId of family.ids) {
      const filename = path.join(directory, `item-${itemId}.svg`);
      const svg = fs.readFileSync(filename, 'utf8');
      assert.match(svg, /^<svg\b[^>]*\bxmlns="http:\/\/www\.w3\.org\/2000\/svg"/u, filename);
      assert.match(svg, /\bviewBox="0 0 128 128"/u, filename);
      assert.match(svg, /\brole="img"/u, filename);
      assert.match(svg, /\baria-labelledby="title desc"/u, filename);
      assert.equal(svg.match(/<title id="title">([^<]+)<\/title>/u)?.[1],
        catalog.byId.get(itemId).name, filename);
      assert.ok((svg.match(/<desc id="desc">([^<]+)<\/desc>/u)?.[1]?.length ?? 0) >= 30,
        filename);
      assert.doesNotMatch(svg,
        /<!DOCTYPE|<!ENTITY|<\s*(?:script|foreignObject|iframe|object|embed|image)\b/iu,
        filename);
      assert.doesNotMatch(svg, /\b(?:href|xlink:href|on[a-z]+)\s*=/iu, filename);
      assert.match(svg, /<\/svg>\s*$/u, filename);
      signatures.add(geometrySignature(svg));
    }
  }
  assert.equal(signatures.size, BAIT_ICON_ITEM_IDS.length + CANNON_ICON_ITEM_IDS.length,
    'every Bait and Cannon item must have its own geometry');
});

test('maps intact and damaged Bait and Cannon finds to matching SVG artwork', () => {
  const catalog = loadLegacyCatalog();
  for (const family of FAMILIES) {
    const intact = catalog.items.filter((item) => item.mineTypeId === family.mineTypeId
      && item.repairedItemId === null);
    const damaged = catalog.items.filter((item) => item.mineTypeId === family.mineTypeId
      && item.repairedItemId !== null);
    assert.equal(intact.length, family.ids.length, `${family.name} intact count`);
    assert.equal(damaged.length, family.ids.length, `${family.name} damaged count`);
    for (const itemId of family.ids) {
      const item = catalog.byId.get(itemId);
      const expected = family.pathFor(itemId);
      assert.deepEqual({
        icon: item.icon, iconSource: item.iconSource,
        largeImage: item.largeImage, hasLargeImage: item.hasLargeImage
      }, {
        icon: expected, iconSource: family.source,
        largeImage: expected, hasLargeImage: true
      });
      const counterpart = damaged.filter((candidate) => candidate.repairedItemId === itemId);
      assert.equal(counterpart.length, 1, `${family.name} damaged counterpart ${itemId}`);
      assert.equal(counterpart[0].icon, expected);
      assert.equal(counterpart[0].iconSource, `damaged-${family.source}`);
      assert.equal(counterpart[0].largeImage, expected);
      assert.equal(counterpart[0].hasLargeImage, true);
    }
  }
});

test('migrates legacy Bait and Cannon tiles once without replacing custom art', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-bait-cannon-icons-'));
  const databaseFile = path.join(directory, 'minethings.sqlite');
  let store = new SqliteStore(databaseFile);
  context.after(() => {
    if (store) store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  store.seedCatalog(loadLegacyCatalog());
  const migrationCases = [
    {
      name: 'bait-svg-icons-v1', mineTypeId: 14, family: FAMILIES[0],
      pairs: [[310, 668], [315, 673]], custom: [[311, 669]]
    },
    {
      name: 'cannon-svg-icons-v1', mineTypeId: 13, family: FAMILIES[1],
      pairs: [[301, 641], [304, 662], [1095, 1105], [1271, 1320]],
      custom: [[305, 663]]
    }
  ];
  const setArt = store.database.prepare(`
    UPDATE catalog_items
    SET icon = ?, icon_source = ?, large_image_filename = ?,
      large_image = ?, has_large_image = ? WHERE id = ?
  `);
  for (const migrationCase of migrationCases) {
    for (const [intactId, damagedId] of migrationCase.pairs) {
      const legacy = `/legacy/img/icons/M${migrationCase.mineTypeId}L1.png`;
      setArt.run(legacy, 'mine-rarity', null, legacy, 0, intactId);
      setArt.run(legacy, 'damaged-mine-rarity', null, legacy, 0, damagedId);
    }
    for (const [intactId, damagedId] of migrationCase.custom) {
      setArt.run(`/custom/${intactId}.svg`, 'mine-rarity', `${intactId}.svg`,
        `/custom/${intactId}-large.svg`, 1, intactId);
      setArt.run(`/custom/${damagedId}.svg`, 'damaged-mine-rarity', `${damagedId}.svg`,
        `/custom/${damagedId}-large.svg`, 1, damagedId);
    }
  }
  store.close();
  store = new SqliteStore(databaseFile);
  const artFor = (itemId) => ({ ...store.database.prepare(`
    SELECT icon, icon_source, large_image_filename, large_image, has_large_image
    FROM catalog_items WHERE id = ?
  `).get(itemId) });
  for (const migrationCase of migrationCases) {
    for (const [intactId, damagedId] of migrationCase.pairs) {
      const icon = migrationCase.family.pathFor(intactId);
      assert.deepEqual(artFor(intactId), {
        icon, icon_source: migrationCase.family.source,
        large_image_filename: null, large_image: icon, has_large_image: 1
      });
      assert.deepEqual(artFor(damagedId), {
        icon, icon_source: `damaged-${migrationCase.family.source}`,
        large_image_filename: null, large_image: icon, has_large_image: 1
      });
    }
    for (const [intactId, damagedId] of migrationCase.custom) {
      assert.deepEqual(artFor(intactId), {
        icon: `/custom/${intactId}.svg`, icon_source: 'mine-rarity',
        large_image_filename: `${intactId}.svg`,
        large_image: `/custom/${intactId}-large.svg`, has_large_image: 1
      });
      assert.deepEqual(artFor(damagedId), {
        icon: `/custom/${damagedId}.svg`, icon_source: 'damaged-mine-rarity',
        large_image_filename: `${damagedId}.svg`,
        large_image: `/custom/${damagedId}-large.svg`, has_large_image: 1
      });
    }
    assert.deepEqual(JSON.parse(store.database.prepare(`
      SELECT details_json FROM schema_migrations WHERE name = ?
    `).get(migrationCase.name).details_json), {
      icons: migrationCase.family.ids.length,
      intactChanges: migrationCase.pairs.length,
      damagedChanges: migrationCase.pairs.length
    });
  }
  store.close();
  store = new SqliteStore(databaseFile);
  for (const migrationCase of migrationCases) {
    assert.equal(store.database.prepare(`
      SELECT COUNT(*) AS count FROM schema_migrations WHERE name = ?
    `).get(migrationCase.name).count, 1);
  }
});

test('serves all Bait and Cannon SVGs and rejects gaps', async (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-bait-cannon-server-'));
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
  await Promise.all(FAMILIES.flatMap((family) => family.ids.map(async (itemId) => {
    const response = await fetch(`${base}${family.pathFor(itemId)}`);
    assert.equal(response.status, 200, `${family.name} ${itemId}`);
    assert.match(response.headers.get('content-type'), /^image\/svg\+xml\b/u);
    assert.ok((await response.text()).includes('<title id="title">'));
  })));
  assert.equal((await fetch(`${base}/node/bait/item-309.svg`)).status, 404);
  assert.equal((await fetch(`${base}/node/cannons/item-310.svg`)).status, 404);
});
