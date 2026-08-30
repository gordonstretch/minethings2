import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { BUG_ICON_ITEM_IDS, bugIconPath } from '../src/bug-icons.js';
import { loadLegacyCatalog } from '../src/legacy-catalog.js';
import { createApp } from '../src/server.js';
import { SqliteStore } from '../src/store.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUG_ASSET_DIRECTORY = path.join(ROOT, 'public', 'img', 'items', 'bugs');
const EXPECTED_BUG_ITEM_IDS = Array.from({ length: 30 }, (_, index) => 187 + index);

function bugGeometrySignature(svg) {
  return svg
    .replace(/<title\b[^>]*>[^]*?<\/title>/gu, '')
    .replace(/<desc\b[^>]*>[^]*?<\/desc>/gu, '')
    .replace(/<defs\b[^>]*>[^]*?<\/defs>/gu, '')
    .replace(/\s(?:fill|stroke|stroke-width|stroke-linecap|stroke-linejoin|opacity)="[^"]*"/gu,
      '')
    .replace(/\s+/gu, ' ')
    .trim();
}

test('bug icon paths cover the exact 30-item catalogue allowlist', () => {
  assert.deepEqual(BUG_ICON_ITEM_IDS, EXPECTED_BUG_ITEM_IDS);
  assert.equal(Object.isFrozen(BUG_ICON_ITEM_IDS), true);
  for (const itemId of EXPECTED_BUG_ITEM_IDS) {
    assert.equal(bugIconPath(itemId), `/node/bugs/bug-${itemId}.svg`);
  }
  assert.equal(bugIconPath('187'), '/node/bugs/bug-187.svg');
  for (const invalid of [
    null, undefined, '', 0, 186, 217, 187.5, NaN, Infinity, 'Black Widow'
  ]) assert.equal(bugIconPath(invalid), null, String(invalid));
});

test('all bug SVG assets have exact inventory, accessible metadata, and distinct geometry',
  () => {
    const expectedFiles = EXPECTED_BUG_ITEM_IDS.map((itemId) => `bug-${itemId}.svg`).sort();
    assert.deepEqual(fs.readdirSync(BUG_ASSET_DIRECTORY).sort(), expectedFiles);

    const catalog = loadLegacyCatalog();
    const geometrySignatures = new Set();
    for (const itemId of EXPECTED_BUG_ITEM_IDS) {
      const item = catalog.byId.get(itemId);
      assert.ok(item, `catalog item ${itemId}`);
      const filename = path.join(BUG_ASSET_DIRECTORY, `bug-${itemId}.svg`);
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
      geometrySignatures.add(bugGeometrySignature(svg));
    }
    assert.equal(geometrySignatures.size, EXPECTED_BUG_ITEM_IDS.length,
      'every bug must have its own geometry, not merely different text or paint');
  });

test('fresh catalogs map every intact and damaged bug to its dedicated SVG', () => {
  const catalog = loadLegacyCatalog();
  const bugItemIds = new Set(EXPECTED_BUG_ITEM_IDS);
  const bugs = catalog.items.filter((item) => bugItemIds.has(item.id));
  const damagedBugs = catalog.items.filter((item) => bugItemIds.has(item.repairedItemId));
  assert.equal(bugs.length, EXPECTED_BUG_ITEM_IDS.length);
  assert.equal(damagedBugs.length, EXPECTED_BUG_ITEM_IDS.length);

  for (const item of bugs) {
    const expectedIcon = bugIconPath(item.id);
    assert.deepEqual({
      icon: item.icon,
      iconSource: item.iconSource,
      largeImage: item.largeImage,
      hasLargeImage: item.hasLargeImage
    }, {
      icon: expectedIcon,
      iconSource: 'bug-svg',
      largeImage: expectedIcon,
      hasLargeImage: true
    });
    const damaged = damagedBugs.filter((candidate) => candidate.repairedItemId === item.id);
    assert.equal(damaged.length, 1, `damaged counterpart for item ${item.id}`);
    assert.deepEqual({
      icon: damaged[0].icon,
      iconSource: damaged[0].iconSource,
      largeImage: damaged[0].largeImage,
      hasLargeImage: damaged[0].hasLargeImage
    }, {
      icon: expectedIcon,
      iconSource: 'damaged-bug-svg',
      largeImage: expectedIcon,
      hasLargeImage: true
    });
  }
});

test('serves every bug SVG, supports HEAD and item details, and rejects gaps',
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

    await Promise.all(EXPECTED_BUG_ITEM_IDS.map(async (itemId) => {
      const response = await fetch(`${base}${bugIconPath(itemId)}`);
      assert.equal(response.status, 200, String(itemId));
      assert.match(response.headers.get('content-type'), /^image\/svg\+xml\b/u, String(itemId));
      assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
      assert.ok(Number(response.headers.get('content-length')) > 0, String(itemId));
      assert.ok(response.headers.get('etag'), String(itemId));
      assert.ok((await response.text()).includes(
        `<title id="title">${catalog.byId.get(itemId).name}</title>`
      ), String(itemId));
    }));

    const head = await fetch(`${base}/node/bugs/bug-187.svg`, { method: 'HEAD' });
    assert.equal(head.status, 200);
    assert.match(head.headers.get('content-type'), /^image\/svg\+xml\b/u);
    assert.ok(Number(head.headers.get('content-length')) > 0);
    assert.equal(await head.text(), '');

    for (const itemId of [187, 192, 197, 202, 207, 212]) {
      const response = await fetch(`${base}/items/${itemId}`);
      assert.equal(response.status, 200, String(itemId));
      const html = await response.text();
      assert.ok(html.includes(`class="detail-image" src="${bugIconPath(itemId)}"`),
        String(itemId));
      assert.ok(html.includes('data-large-image="original"'), String(itemId));
    }

    for (const invalidPath of [
      '/node/bugs/bug-0.svg',
      '/node/bugs/bug-186.svg',
      '/node/bugs/bug-217.svg',
      '/node/bugs/bug-187.png',
      '/node/bugs/bug-187.svg/extra',
      '/node/bugs/not-a-bug.svg'
    ]) assert.equal((await fetch(`${base}${invalidPath}`)).status, 404, invalidPath);
  });

test('existing catalogs migrate legacy bug art while preserving custom and nonbug art',
  (context) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-bug-icons-'));
    const databaseFile = path.join(directory, 'game.sqlite');
    let store = new SqliteStore(databaseFile);
    context.after(() => {
      if (store) store.close();
      fs.rmSync(directory, { recursive: true, force: true });
    });
    store.seedCatalog(loadLegacyCatalog());
    const originalUserVersion = store.database.prepare('PRAGMA user_version').get().user_version;

    const representativePairs = [
      { intact: 187, damaged: 545 },
      { intact: 200, damaged: 558 },
      { intact: 216, damaged: 574 }
    ];
    const setLegacyArt = store.database.prepare(`
      UPDATE catalog_items
      SET icon = '/legacy/bug.png', icon_source = ?,
        large_image_filename = 'legacy-bug.png',
        large_image = '/legacy/bug-large.png', has_large_image = 0
      WHERE id = ?
    `);
    for (const pair of representativePairs) {
      setLegacyArt.run('mine-rarity', pair.intact);
      setLegacyArt.run('damaged-mine-rarity', pair.damaged);
    }

    const customRows = [
      {
        id: 188, icon: '/database/custom-bug.svg', source: 'database',
        filename: 'custom-bug.svg', largeImage: '/database/custom-bug-large.svg'
      },
      {
        id: 546, icon: '/database/custom-damaged-bug.svg', source: 'damaged-database',
        filename: 'custom-damaged-bug.svg', largeImage: '/database/custom-damaged-bug-large.svg'
      },
      {
        id: 1, icon: '/database/nonbug.svg', source: 'mine-rarity',
        filename: 'nonbug.svg', largeImage: '/database/nonbug-large.svg'
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
        icon: bugIconPath(pair.intact),
        icon_source: 'bug-svg',
        large_image_filename: null,
        large_image: bugIconPath(pair.intact),
        has_large_image: 1
      });
      assert.deepEqual({ ...selectArt.get(pair.damaged) }, {
        icon: bugIconPath(pair.intact),
        icon_source: 'damaged-bug-svg',
        large_image_filename: null,
        large_image: bugIconPath(pair.intact),
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
      FROM schema_migrations WHERE name = 'bug-svg-icons-v1'
    `);
    const migration = { ...selectMigration.get() };
    assert.deepEqual(JSON.parse(migration.details_json), {
      icons: EXPECTED_BUG_ITEM_IDS.length,
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
      FROM schema_migrations WHERE name = 'bug-svg-icons-v1'
    `).get() }, migration);
    assert.equal(store.database.prepare(`
      SELECT COUNT(*) AS count FROM schema_migrations WHERE name = 'bug-svg-icons-v1'
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
