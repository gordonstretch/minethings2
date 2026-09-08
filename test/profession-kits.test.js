import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createPlayer } from '../src/game.js';
import { loadLegacyCatalog } from '../src/legacy-catalog.js';
import { createApp } from '../src/server.js';
import { hashPassword, SqliteStore } from '../src/store.js';

const catalog = loadLegacyCatalog();

test('rental-only migration preserves players while retiring kits and mine trading', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-rental-economy-'));
  const databaseFile = path.join(directory, 'game.sqlite');
  let store = new SqliteStore(databaseFile);
  context.after(() => {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  store.seedCatalog(catalog);
  store.ensureWorldMaps(1_000);
  const player = store.addPlayer(createPlayer(
    'Lease Migrator', '', 'hash', store.loadCatalog(), 1_000, () => 0.5
  ));
  store.database.prepare('UPDATE players SET credits = 100, item_limit = 999 WHERE id = ?')
    .run(player.id);
  store.database.prepare(`
    UPDATE mines SET rental_until = 0, source_kind = 'profession-kit' WHERE player_id = ?
  `).run(player.id);
  store.database.prepare('UPDATE profession_mine_kits SET enabled = 1').run();
  store.database.prepare(`
    INSERT INTO player_crypto_balances (player_id, crypto_type_id, quantity)
    VALUES (?, 1, 0)
  `).run(player.id);
  store.database.prepare(`
    INSERT INTO mine_market_orders
      (player_id, city_id, mine_type_id, side, price_units, crypto_type_id,
       crypto_quantity, crypto_price_units, quantity, created_at)
    VALUES (?, 1, 4, 'buy', 10000, 1, 2, 5000, 3, 1000)
  `).run(player.id);
  store.database.exec(`
    DROP TABLE player_containers;
    CREATE TABLE player_containers (
      player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
      container_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (player_id, container_id)
    );
  `);
  store.database.prepare(`
    INSERT INTO player_containers (player_id, container_id, quantity) VALUES (?, 8, 3)
  `).run(player.id);
  store.database.prepare('UPDATE catalog_containers SET credits = 9, capacity = 25 WHERE id = 8').run();
  store.database.prepare(`
    UPDATE catalog_mine_types SET credit_cost = 425, rent_cost = 28, refundable = 1
    WHERE id = 4
  `).run();
  store.database.prepare(
    "DELETE FROM schema_migrations WHERE name = 'rental-only-economy-v1'"
  ).run();
  store.close();

  const beforeMigration = Date.now();
  store = new SqliteStore(databaseFile);
  const migrated = store.playerById(player.id, beforeMigration);
  assert.equal(migrated.credits, 118);
  assert.ok(migrated.mines.every((mine) => mine.rentalUntil >= beforeMigration
    + 364 * 24 * 60 * 60 * 1000));
  assert.ok(migrated.mines.every((mine) => mine.sourceKind === 'ordinary'));
  assert.equal(migrated.cryptoBalances[1], 6);
  assert.equal(store.database.prepare('SELECT COUNT(*) AS count FROM mine_market_orders').get().count, 0);
  assert.equal(store.database.prepare(
    'SELECT COUNT(*) AS count FROM profession_mine_kits WHERE enabled = 1'
  ).get().count, 0);
  assert.equal(store.database.prepare(
    'SELECT quantity FROM player_containers WHERE player_id = ? AND container_id = 8'
  ).get(player.id).quantity, 1);
  assert.throws(() => store.database.prepare(`
    UPDATE player_containers SET quantity = 2 WHERE player_id = ? AND container_id = 8
  `).run(player.id), /CHECK constraint failed/u);
  const migratedMineType = store.database.prepare(`
    SELECT credit_cost, rent_cost, refundable FROM catalog_mine_types WHERE id = 4
  `).get();
  assert.deepEqual([...Object.values(migratedMineType)], [0, 9, 0]);
  const migratedContainer = store.database.prepare(`
    SELECT credits, capacity FROM catalog_containers WHERE id = 8
  `).get();
  assert.deepEqual([...Object.values(migratedContainer)], [3, 45]);
  assert.equal(store.database.prepare('SELECT item_limit FROM players WHERE id = ?')
    .get(player.id).item_limit, 545);
});

test('profession kits and mine purchase routes are retired from player and admin UI', async (context) => {
  const store = new SqliteStore(':memory:');
  store.seedCatalog(catalog);
  store.ensureWorldMaps(1_000);
  const liveCatalog = store.loadCatalog();
  const password = 'rental only password';
  const player = store.addPlayer(createPlayer(
    'Rental Operator', '', hashPassword(password), liveCatalog, 1_000, () => 0.5
  ));
  const server = createApp({ store, catalog: liveCatalog, adminNames: player.name });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => {
    await new Promise((resolve, reject) => server.close(
      (error) => error ? reject(error) : resolve()
    ));
    store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${base}/login`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ name: player.name, password })
  });
  const cookie = login.headers.get('set-cookie').split(';')[0];

  const shop = await (await fetch(`${base}/credits`, { headers: { cookie } })).text();
  assert.doesNotMatch(shop, /Profession Kits|profession-kits/u);
  const adminPage = await (await fetch(`${base}/admin/payments`, {
    headers: { cookie }
  })).text();
  assert.doesNotMatch(adminPage, /Profession Kits|profession-mine-kits/u);

  for (const route of [
    '/credits/profession-kits/1/claim',
    '/admin/profession-mine-kits/1',
    '/market/mines/4/buy',
    `/mines/${player.mines[0].id}/sell`
  ]) {
    const response = await fetch(`${base}${route}`, {
      method: 'POST', redirect: 'manual', headers: { cookie }
    });
    assert.equal(response.status, 410, route);
  }
});
