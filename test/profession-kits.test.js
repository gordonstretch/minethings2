import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlayer, sellMine } from '../src/game.js';
import { loadLegacyCatalog } from '../src/legacy-catalog.js';
import { createApp } from '../src/server.js';
import { hashPassword, SqliteStore } from '../src/store.js';

const catalog = loadLegacyCatalog();

test('profession kits grant fixed Aso mine collections once and become paid automatically', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(catalog);
  store.ensureWorldMaps(1_000);
  const liveCatalog = store.loadCatalog();
  const player = store.addPlayer(createPlayer(
    'Kit Tester', '', 'hash', liveCatalog, 1_000, () => 0.5
  ));

  const initialKits = store.professionMineKits(player.id, Date.now(), true);
  assert.deepEqual(initialKits.map((kit) => kit.name), [
    "Fisher's Kit", "Haulier's Kit", "Oil Worker's Kit", "Route Warden's Kit",
    "Maker's Kit"
  ]);
  assert.ok(initialKits.every((kit) => kit.free && kit.inAso && !kit.claimedAt));
  assert.deepEqual(initialKits.find((kit) => kit.slug === 'fisher').mines
    .map((mine) => [mine.name, mine.cityName]), [
    ['Bait', 'Lahar Rest'], ['Ships', 'Lahar Rest']
  ]);

  const fisher = initialKits.find((kit) => kit.slug === 'fisher');
  const creditsBefore = player.credits;
  const freeClaim = store.claimProfessionMineKit(
    player.id, fisher.id, liveCatalog, fisher.freeUntil - 1, () => 0.5
  );
  assert.equal(freeClaim.priceCredits, 0);
  assert.equal(freeClaim.mines.length, 2);
  assert.equal(freeClaim.findingEvents.reduce(
    (total, finding) => total + Number(finding.quantity), 0
  ), 10);
  const afterFreeClaim = store.playerById(player.id, fisher.freeUntil - 1);
  assert.equal(afterFreeClaim.credits, creditsBefore);
  const granted = afterFreeClaim.mines.filter((mine) => mine.sourceKind === 'profession-kit');
  assert.equal(granted.length, 2);
  const grantForSale = { ...afterFreeClaim, cityId: granted[0].cityId };
  assert.throws(
    () => sellMine(grantForSale, liveCatalog, granted[0].id),
    /Profession Kit mines are permanent grants/
  );
  assert.throws(
    () => store.claimProfessionMineKit(
      player.id, fisher.id, liveCatalog, fisher.freeUntil - 1, () => 0.5
    ),
    /already claimed/
  );

  const haulier = initialKits.find((kit) => kit.slug === 'haulier');
  const paidKit = store.adminUpdateProfessionMineKit(player.id, haulier.id, {
    name: haulier.name, description: haulier.description,
    priceCredits: 25, freeUntil: 0, enabled: true
  }, fisher.freeUntil);
  assert.equal(paidKit.priceCredits, 25);
  assert.equal(paidKit.free, false);
  const beforePaid = store.playerById(player.id, fisher.freeUntil).credits;
  const paidClaim = store.claimProfessionMineKit(
    player.id, haulier.id, liveCatalog, fisher.freeUntil, () => 0.5
  );
  assert.equal(paidClaim.priceCredits, 25);
  assert.equal(paidClaim.mines.length, 3);
  assert.equal(store.playerById(player.id, fisher.freeUntil).credits, beforePaid - 25);

  const bromoCity = store.database.prepare(`
    SELECT catalog_cities.id
    FROM catalog_cities JOIN world_maps ON world_maps.id = catalog_cities.map_id
    WHERE world_maps.slug = 'bromo' ORDER BY catalog_cities.id LIMIT 1
  `).get();
  store.database.prepare('UPDATE players SET city_id = ? WHERE id = ?')
    .run(bromoCity.id, player.id);
  const maker = initialKits.find((kit) => kit.slug === 'maker');
  assert.throws(
    () => store.claimProfessionMineKit(
      player.id, maker.id, liveCatalog, fisher.freeUntil, () => 0.5
    ),
    /only be claimed while you are in Aso/
  );
});

test('credits and admin screens publish and operate profession kit offers', async (context) => {
  const store = new SqliteStore(':memory:');
  store.seedCatalog(catalog);
  store.ensureWorldMaps(1_000);
  const liveCatalog = store.loadCatalog();
  const firstOffer = store.professionMineKits(null, Date.now(), true)[0];
  const requestTime = firstOffer.freeUntil - 1_000;
  const password = 'profession kit password';
  const player = store.addPlayer(createPlayer(
    'Kit Operator', '', hashPassword(password), liveCatalog,
    requestTime - 1_000, () => 0.5
  ));
  const server = createApp({
    store, catalog: liveCatalog, now: () => requestTime,
    adminNames: player.name
  });
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
  assert.equal(login.status, 303);
  const cookie = login.headers.get('set-cookie').split(';')[0];

  const shop = await (await fetch(`${base}/credits`, { headers: { cookie } })).text();
  assert.match(shop, /Profession Kits/u);
  assert.match(shop, /Fisher&#39;s Kit/u);
  assert.match(shop, /Oil Worker&#39;s Kit/u);
  assert.match(shop, /Free now/u);
  assert.match(shop, /permanent, non-refundable mines/u);
  assert.match(shop, /Lahar Rest/u);

  const fisher = store.professionMineKits(player.id, requestTime, true)
    .find((kit) => kit.slug === 'fisher');
  const claim = await fetch(`${base}/credits/profession-kits/${fisher.id}/claim`, {
    method: 'POST', redirect: 'manual', headers: { cookie }
  });
  assert.equal(claim.status, 303);
  assert.equal(claim.headers.get('location'), '/credits');
  assert.equal(store.professionMineKits(player.id, requestTime, true)
    .find((kit) => kit.id === fisher.id).pricePaid, 0);

  const adminPage = await (await fetch(`${base}/admin/payments`, {
    headers: { cookie }
  })).text();
  assert.match(adminPage, /A future free-until date makes a kit free/u);
  assert.match(adminPage, /type="datetime-local"/u);
  const haulier = store.professionMineKits(player.id, requestTime, false)
    .find((kit) => kit.slug === 'haulier');
  const update = await fetch(`${base}/admin/profession-mine-kits/${haulier.id}`, {
    method: 'POST', redirect: 'manual', headers: {
      cookie, 'content-type': 'application/x-www-form-urlencoded'
    }, body: new URLSearchParams({
      name: haulier.name, description: haulier.description,
      priceCredits: '31', freeUntil: '', enabled: '1'
    })
  });
  assert.equal(update.status, 303);
  assert.equal(update.headers.get('location'), '/admin/payments');
  const paidShop = await (await fetch(`${base}/credits`, { headers: { cookie } })).text();
  assert.match(paidShop, /Buy for 31 credits/u);
});
