import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlayer } from '../src/game.js';
import { loadLegacyCatalog, MAGNET_CATALOG } from '../src/legacy-catalog.js';
import { createApp } from '../src/server.js';
import { hashPassword, SqliteStore } from '../src/store.js';

const bootstrapCatalog = loadLegacyCatalog();

function inventoryQuantity(store, playerId, cityId, itemId) {
  return Number(store.database.prepare(`
    SELECT quantity FROM inventory WHERE player_id = ? AND city_id = ? AND item_id = ?
  `).get(playerId, cityId, itemId)?.quantity ?? 0);
}

function redLandVehicle(catalog) {
  return catalog.vehicles.find((vehicle) => vehicle.routeType === 0
    && catalog.byId.get(vehicle.itemId)?.rarity >= 4 && vehicle.capacity >= 3);
}

function compatibleLandFittings(catalog, vehicle) {
  const allowed = catalog.settings.arms_rarities_by_vehicle_rarity[
    catalog.byId.get(vehicle.itemId).rarity
  ];
  return {
    mod: catalog.mods.find((entry) => allowed.includes(catalog.byId.get(entry.itemId).rarity)),
    weapon: catalog.weapons.find((entry) => allowed.includes(catalog.byId.get(entry.itemId).rarity))
  };
}

function shipFixture(catalog) {
  const ship = catalog.vehicles.find((vehicle) => vehicle.ship?.cannonPortals >= 1);
  const allowed = catalog.settings.arms_rarities_by_vehicle_rarity[
    catalog.byId.get(ship.itemId).rarity
  ];
  const cannons = catalog.cannons.filter((entry) =>
    allowed.includes(catalog.byId.get(entry.itemId).rarity)).slice(0, 2);
  assert.equal(cannons.length, 2, 'fixture requires two compatible cannons');
  return { ship, cannons };
}

function multiPortalShipFixture(catalog) {
  const ship = catalog.vehicles.find((vehicle) => vehicle.ship?.cannonPortals >= 3);
  const allowed = catalog.settings.arms_rarities_by_vehicle_rarity[
    catalog.byId.get(ship.itemId).rarity
  ];
  const cannons = catalog.cannons.filter((entry) =>
    allowed.includes(catalog.byId.get(entry.itemId).rarity)).slice(0, 2);
  assert.equal(cannons.length, 2, 'fixture requires two compatible cannons');
  return { ship, cannons };
}

function ordinaryRedCargo(catalog) {
  return catalog.items.find((item) => item.rarity === 0
    && !catalog.vehicleByItemId.has(item.id)
    && !catalog.modByItemId.has(item.id)
    && !catalog.weaponByItemId.has(item.id)
    && !catalog.boxes.some((entry) => entry.itemId === item.id));
}

function inputTag(html, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return html.match(new RegExp(`<input(?=[^>]*\\bname="${escaped}")[^>]*>`, 'u'))?.[0] ?? '';
}

function previewToken(html) {
  const tag = inputTag(html, 'previewToken');
  assert.ok(tag, 'valid preview should include a binding token');
  const value = /\bvalue="([^"]+)"/u.exec(tag)?.[1];
  assert.ok(value, 'preview binding token should have a value');
  return value;
}

async function startServer(context, store, now = 2000) {
  const server = createApp({ store, now: () => now, liveUpdateDebounceMs: 0 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => {
    await new Promise((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()));
    store.close();
  });
  return `http://127.0.0.1:${server.address().port}`;
}

async function login(base, name, password) {
  const response = await fetch(`${base}/login`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ name, password })
  });
  assert.equal(response.status, 303);
  return response.headers.get('set-cookie').split(';')[0];
}

async function postForm(base, path, cookie, fields, referer = path) {
  return fetch(`${base}${path}`, {
    method: 'POST', redirect: 'manual',
    headers: {
      cookie, referer: `${base}${referer}`,
      'content-type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams(fields)
  });
}

test('previews cargo without mutation and reports a truthful capacity breakdown', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(bootstrapCatalog);
  const catalog = store.loadCatalog();
  const vehicle = redLandVehicle(catalog);
  const cargo = ordinaryRedCargo(catalog);
  assert.ok(vehicle && cargo);
  const player = store.addPlayer(createPlayer(
    'Cargo Preview', '', 'hash', catalog, 1000, () => 0.5
  ));
  player.inventory[vehicle.itemId] = 1;
  player.inventory[cargo.id] = vehicle.capacity + 2;
  store.savePlayer(player);
  const vehicleId = store.activateVehicle(player.id, vehicle.itemId);

  const invalid = store.previewVehicleCargo(player.id, vehicleId,
    { [cargo.id]: vehicle.capacity + 1 });
  assert.equal(invalid.valid, false);
  assert.match(invalid.reasons.join(' '), /capacity|fit/i);
  assert.equal(store.vehicleDetails(player.id, vehicleId, 2000).cargoSize, 0,
    'invalid preview must not mutate cargo');
  assert.equal(inventoryQuantity(store, player.id, player.cityId, cargo.id), vehicle.capacity + 2);

  const valid = store.previewVehicleCargo(player.id, vehicleId, { [cargo.id]: 2 });
  assert.equal(valid.valid, true);
  assert.equal(valid.changed, true);
  assert.equal(valid.cargoSize, 2);
  const requiredBreakdownFields = [
    'ammunition', 'available', 'base', 'cannons', 'cargo', 'cargoLimit',
    'mods', 'used', 'weapons'
  ];
  for (const field of requiredBreakdownFields) {
    assert.equal(Object.hasOwn(valid.capacityBreakdown, field), true,
      `capacity breakdown should include ${field}`);
  }
  assert.equal(valid.capacityBreakdown.cargoLimit,
    valid.capacityBreakdown.base + valid.capacityBreakdown.mods
      - valid.capacityBreakdown.weapons - valid.capacityBreakdown.cannons
      - valid.capacityBreakdown.ammunition);
  assert.equal(valid.capacityBreakdown.used,
    valid.capacityBreakdown.weapons + valid.capacityBreakdown.cannons
      + valid.capacityBreakdown.ammunition + valid.capacityBreakdown.cargo);
  assert.equal(valid.capacityBreakdown.available,
    valid.capacityBreakdown.cargoLimit - valid.capacityBreakdown.cargo);
  assert.equal(valid.capacityBreakdown.total,
    valid.capacityBreakdown.base + valid.capacityBreakdown.modAdjustment);
  assert.equal(valid.capacityBreakdown.free,
    valid.capacityBreakdown.total - valid.capacityBreakdown.fittingSlots
      - valid.capacityBreakdown.ammunitionSlots - valid.capacityBreakdown.cargoSlots);
  assert.equal(store.vehicleDetails(player.id, vehicleId, 2000).cargoSize, 0,
    'valid preview must not mutate cargo');

  store.setVehicleCargo(player.id, vehicleId, { [cargo.id]: 2 });
  assert.equal(store.vehicleDetails(player.id, vehicleId, 2000).cargoSize, 2);
});

test('treats ship cannon quantities as a complete replaceable and removable loadout', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(bootstrapCatalog);
  const catalog = store.loadCatalog();
  const { ship, cannons: [first, second] } = shipFixture(catalog);
  const tackleId = Number(catalog.settings.block_and_tackle_item_id);
  const ammunition = catalog.cannonballs[0];
  const player = store.addPlayer(createPlayer(
    'Complete Ship Loadout', '', 'hash', catalog, 1000, () => 0.5
  ));
  player.inventory[ship.itemId] = 1;
  player.inventory[first.itemId] = 1;
  player.inventory[second.itemId] = 1;
  player.inventory[tackleId] = 2;
  player.inventory[ammunition.itemId] = 1;
  store.savePlayer(player);
  const vehicleId = store.activateVehicle(player.id, ship.itemId);
  store.fitShipLoadout(player.id, vehicleId, [first.id]);

  const replacement = store.previewShipLoadout(player.id, vehicleId, [second.id]);
  assert.equal(replacement.valid, true);
  assert.equal(replacement.changed, true);
  assert.deepEqual(replacement.desiredCannonIds, [second.id]);
  assert.equal(replacement.additions[0].id, second.id);
  assert.equal(replacement.removals[0].id, first.id);
  assert.equal(replacement.tackleRequired, 1);
  assert.equal(store.vehicleDetails(player.id, vehicleId, 2000).cannons[0].id, first.id,
    'replacement preview must not mutate the fitted cannon');

  store.fitShipLoadout(player.id, vehicleId, [second.id]);
  assert.deepEqual(store.vehicleDetails(player.id, vehicleId, 2000).cannons.map((entry) => entry.id),
    [second.id]);
  assert.equal(inventoryQuantity(store, player.id, player.cityId, first.itemId), 1);
  assert.equal(inventoryQuantity(store, player.id, player.cityId, tackleId), 1);

  store.loadShipAmmo(player.id, vehicleId, ammunition.type, 1);
  const loadedRemoval = store.previewShipLoadout(player.id, vehicleId, []);
  assert.equal(loadedRemoval.valid, false,
    'removing every cannon must not implicitly discard loaded ammunition');
  assert.match(loadedRemoval.reasons.join(' '), /ammunition|unload/i);
  const ammunitionRule = catalog.settings.ammunition_rules[ammunition.type];
  assert.equal(store.vehicleDetails(player.id, vehicleId, 2000).ship[ammunitionRule.storageField],
    Number(catalog.settings.shots_per_crate));
  store.unloadShipAmmo(player.id, vehicleId);

  const removal = store.previewShipLoadout(player.id, vehicleId, []);
  assert.equal(removal.valid, true);
  assert.equal(removal.removals[0].id, second.id);
  store.fitShipLoadout(player.id, vehicleId, []);
  assert.deepEqual(store.vehicleDetails(player.id, vehicleId, 2000).cannons, []);
  assert.equal(inventoryQuantity(store, player.id, player.cityId, second.itemId), 1);
  assert.equal(inventoryQuantity(store, player.id, player.cityId, tackleId), 0);
});

test('fits a Magnet to a ship with one Bolt and returns only the Magnet on removal',
  (context) => {
    const store = new SqliteStore(':memory:');
    context.after(() => store.close());
    store.seedCatalog(bootstrapCatalog);
    const catalog = store.loadCatalog();
    const { ship } = shipFixture(catalog);
    const boltItemId = Number(catalog.settings.bolt_item_id);
    const magnetItemId = Number(catalog.settings.magnet_item_id);
    const player = store.addPlayer(createPlayer(
      'Magnetic Sailor', '', 'hash', catalog, 1000, () => 0.5
    ));
    player.inventory[ship.itemId] = 1;
    player.inventory[magnetItemId] = 1;
    store.savePlayer(player);
    const vehicleId = store.activateVehicle(player.id, ship.itemId);

    const cargoPreview = store.previewVehicleCargo(player.id, vehicleId, {
      [magnetItemId]: 1
    });
    assert.equal(cargoPreview.valid, false);
    assert.match(cargoPreview.reasons.join(' '), /fitted with a Bolt/u);
    const noBolt = store.previewShipLoadout(
      player.id, vehicleId, [], [MAGNET_CATALOG.mod.id]
    );
    assert.equal(noBolt.valid, false);
    assert.match(noBolt.reasons.join(' '), /Need 1 Bolt/u);
    store.database.prepare(`
      INSERT INTO inventory (player_id, city_id, item_id, quantity) VALUES (?, ?, ?, 1)
    `).run(player.id, player.cityId, boltItemId);
    const preview = store.previewShipLoadout(
      player.id, vehicleId, [], [MAGNET_CATALOG.mod.id]
    );
    assert.equal(preview.valid, true);
    assert.equal(preview.boltsRequired, 1);
    assert.deepEqual(preview.modsAdded, ['Magnet']);
    store.fitShipLoadout(player.id, vehicleId, [], [MAGNET_CATALOG.mod.id]);
    assert.equal(store.vehicleDetails(player.id, vehicleId, 2000).mods[0].itemId,
      magnetItemId);
    assert.equal(inventoryQuantity(store, player.id, player.cityId, magnetItemId), 0);
    assert.equal(inventoryQuantity(store, player.id, player.cityId, boltItemId), 0);

    const removal = store.previewShipLoadout(player.id, vehicleId, [], []);
    assert.equal(removal.valid, true);
    assert.equal(removal.boltsRequired, 0);
    assert.deepEqual(removal.modsRemoved, ['Magnet']);
    store.fitShipLoadout(player.id, vehicleId, [], []);
    assert.equal(store.vehicleDetails(player.id, vehicleId, 2000).mods.length, 0);
    assert.equal(inventoryQuantity(store, player.id, player.cityId, magnetItemId), 1);
    assert.equal(inventoryQuantity(store, player.id, player.cityId, boltItemId), 0);
  });

test('reorders duplicate cannons without tackle and counts only complete ammunition crates',
  (context) => {
    const store = new SqliteStore(':memory:');
    context.after(() => store.close());
    store.seedCatalog(bootstrapCatalog);
    const catalog = store.loadCatalog();
    const { ship, cannons: [first, second] } = multiPortalShipFixture(catalog);
    const tackleId = Number(catalog.settings.block_and_tackle_item_id);
    const ammunition = catalog.cannonballs[0];
    const player = store.addPlayer(createPlayer(
      'Ordered Ship Loadout', '', 'hash', catalog, 1000, () => 0.5
    ));
    player.inventory[ship.itemId] = 1;
    player.inventory[first.itemId] = 2;
    player.inventory[second.itemId] = 1;
    player.inventory[tackleId] = 1;
    player.inventory[ammunition.itemId] = 1;
    store.savePlayer(player);
    const vehicleId = store.activateVehicle(player.id, ship.itemId);
    store.fitShipLoadout(player.id, vehicleId, [first.id, first.id, second.id]);

    const reorder = store.previewShipLoadout(
      player.id, vehicleId, [second.id, first.id, first.id]
    );
    assert.equal(reorder.valid, true);
    assert.equal(reorder.additions.length, 0);
    assert.equal(reorder.removals.length, 0);
    assert.ok(reorder.moved.length > 0, 'portal-order changes should be reported as moves');
    assert.equal(reorder.tackleRequired, 0);
    store.fitShipLoadout(player.id, vehicleId, [second.id, first.id, first.id]);
    assert.deepEqual(store.vehicleDetails(player.id, vehicleId, 2000).cannons
      .sort((left, right) => left.portal - right.portal).map((entry) => entry.id),
    [second.id, first.id, first.id]);
    assert.equal(inventoryQuantity(store, player.id, player.cityId, tackleId), 1);

    store.loadShipAmmo(player.id, vehicleId, ammunition.type, 1);
    const ammunitionRule = catalog.settings.ammunition_rules[ammunition.type];
    store.database.prepare(`
      UPDATE player_ship_state SET ${ammunitionRule.storageField} = 1 WHERE vehicle_id = ?
    `).run(vehicleId);
    const details = store.vehicleDetails(player.id, vehicleId, 2000);
    assert.equal(details.capacityBreakdown.ammunition, 0,
      'the original rules count only complete ammunition crates');
    assert.equal(details.capacityBreakdown.ammunitionSlots, 0);
    assert.equal(details.capacityBreakdown.free,
      details.capacityBreakdown.total - details.capacityBreakdown.fittingSlots
        - details.capacityBreakdown.ammunitionSlots - details.capacityBreakdown.cargoSlots);
  });

test('makes damaged transports recovery-only without trapping their loadout', (context) => {
  const store = new SqliteStore(':memory:');
  context.after(() => store.close());
  store.seedCatalog(bootstrapCatalog);
  const catalog = store.loadCatalog();
  const land = redLandVehicle(catalog);
  const { mod } = compatibleLandFittings(catalog, land);
  const cargo = ordinaryRedCargo(catalog);
  const { ship, cannons: [cannon, alternateCannon] } = shipFixture(catalog);
  const ammunition = catalog.cannonballs[0];
  const tackleId = Number(catalog.settings.block_and_tackle_item_id);
  assert.ok(land && mod && cargo && ship && cannon && ammunition);
  const player = store.addPlayer(createPlayer(
    'Recovery Only', '', 'hash', catalog, 1000, () => 0.5
  ));
  player.inventory[land.itemId] = 1;
  player.inventory[mod.itemId] = 2;
  player.inventory[cargo.id] = 2;
  player.inventory[ship.itemId] = 1;
  player.inventory[cannon.itemId] = 1;
  player.inventory[alternateCannon.itemId] = 1;
  player.inventory[ammunition.itemId] = 2;
  player.inventory[tackleId] = 1;
  player.inventory[Number(catalog.settings.bolt_item_id)] = 100;
  store.savePlayer(player);

  const landId = store.activateVehicle(player.id, land.itemId);
  store.fitVehicleLoadout(player.id, landId, [mod.id], []);
  store.setVehicleCargo(player.id, landId, { [cargo.id]: 1 });
  store.database.prepare('UPDATE player_vehicles SET damaged = 1 WHERE id = ?').run(landId);

  assert.equal(store.previewVehicleCargo(player.id, landId, {}).valid, true,
    'damaged vehicle may preview unloading cargo');
  store.setVehicleCargo(player.id, landId, {});
  assert.equal(store.previewVehicleFittings(player.id, landId, [], []).valid, true,
    'damaged vehicle may preview removing fittings');
  store.fitVehicleLoadout(player.id, landId, [], []);
  const cargoAddition = store.previewVehicleCargo(player.id, landId, { [cargo.id]: 1 });
  assert.equal(cargoAddition.valid, false);
  assert.match(cargoAddition.reasons.join(' '), /damaged|recovery|repair/i);
  assert.throws(() => store.setVehicleCargo(player.id, landId, { [cargo.id]: 1 }),
    /damaged|recovery|repair/i);
  const fittingAddition = store.previewVehicleFittings(player.id, landId, [mod.id], []);
  assert.equal(fittingAddition.valid, false);
  assert.throws(() => store.fitVehicleLoadout(player.id, landId, [mod.id], []),
    /damaged|recovery|repair/i);

  const shipId = store.activateVehicle(player.id, ship.itemId);
  store.fitShipLoadout(player.id, shipId, [cannon.id]);
  store.loadShipAmmo(player.id, shipId, ammunition.type, 1);
  store.database.prepare('UPDATE player_vehicles SET damaged = 1 WHERE id = ?').run(shipId);
  assert.throws(() => store.loadShipAmmo(player.id, shipId, ammunition.type, 1),
    /damaged|recovery|repair/i);
  const replacement = store.previewShipLoadout(player.id, shipId, [alternateCannon.id]);
  assert.equal(replacement.valid, false);
  assert.match(replacement.reasons.join(' '), /damaged|recovery|repair/i);
  assert.throws(() => store.fitShipLoadout(player.id, shipId, [alternateCannon.id]),
    /damaged|recovery|repair/i);
  assert.doesNotThrow(() => store.unloadShipAmmo(player.id, shipId),
    'damaged ship may unload ammunition');
  assert.equal(store.previewShipLoadout(player.id, shipId, []).valid, true,
    'damaged ship may preview removing its cannon');
  store.fitShipLoadout(player.id, shipId, []);
  assert.deepEqual(store.vehicleDetails(player.id, shipId, 2000).cannons, []);
});

test('binds land and cargo commits to an exact one-use server preview', async (context) => {
  const store = new SqliteStore(':memory:');
  store.seedCatalog(bootstrapCatalog);
  const catalog = store.loadCatalog();
  const password = 'bound preview password';
  const vehicle = redLandVehicle(catalog);
  const { mod, weapon } = compatibleLandFittings(catalog, vehicle);
  const cargo = ordinaryRedCargo(catalog);
  assert.ok(vehicle && mod && weapon && cargo);
  const player = store.addPlayer(createPlayer(
    'Bound Preview', '', hashPassword(password), catalog, 1000, () => 0.5
  ));
  player.inventory[vehicle.itemId] = 1;
  player.inventory[mod.itemId] = 1;
  player.inventory[weapon.itemId] = 1;
  player.inventory[cargo.id] = 3;
  player.inventory[Number(catalog.settings.bolt_item_id)] = 100;
  store.savePlayer(player);
  const vehicleId = store.activateVehicle(player.id, vehicle.itemId);
  const base = await startServer(context, store);
  const cookie = await login(base, player.name, password);
  const customizePath = `/vehicles/${vehicleId}/customize`;
  const initialHtml = await (await fetch(`${base}${customizePath}`, {
    headers: { cookie }
  })).text();
  assert.match(initialHtml, /class="combat-stat-board"/u);
  assert.match(initialHtml, /Current fitted totals/u);
  for (const stat of ['attack', 'armor', 'offense', 'defense', 'dodge']) {
    assert.match(initialHtml, new RegExp(`data-combat-stat="${stat}"`, 'u'));
  }
  const modEffects = initialHtml.match(new RegExp(
    `<section class="mod-effects" data-mod-effects="${mod.id}"[^>]*>([\\s\\S]*?)<\\/section>`,
    'u'
  ));
  assert.ok(modEffects, 'the selectable mod must show its effects as a distinct list');
  for (const [stat, label] of [
    ['capacity', 'Capacity'], ['attack', 'Base attack'], ['armor', 'Armour'],
    ['offense', 'Aggressive power'], ['defense', 'Defensive power'], ['dodge', 'Dodge']
  ]) {
    assert.match(modEffects[1], new RegExp(
      `data-mod-stat="${stat}"[^>]*><span>${label}<\\/span><strong[^>]*>[+\\-0-9.]+<\\/strong>`,
      'u'
    ), `${label} must be listed even when its modifier is zero`);
  }

  const retiredDirectFit = await postForm(base, `/vehicles/${vehicleId}/mods`, cookie, {
    [`mod_${mod.id}`]: 'on'
  }, customizePath);
  assert.equal(retiredDirectFit.status, 303);
  assert.equal(store.vehicleDetails(player.id, vehicleId, 2000).mods.length, 0,
    'retired direct fitting routes must not bypass preview binding');

  const preview = await postForm(base, customizePath, cookie, {
    [`mod_${mod.id}`]: 'on', [`weapon_${weapon.id}`]: '1', intent: 'preview'
  });
  assert.equal(preview.status, 200);
  const previewHtml = await preview.text();
  const token = previewToken(previewHtml);
  assert.match(previewHtml, /data-live-preview-scope/u);
  assert.match(previewHtml, /data-live-preview-panel/u);
  assert.match(previewHtml, /data-live-preview-form/u);
  assert.match(previewHtml, /data-preview-commit/u);
  assert.match(previewHtml, /Proposed fitted totals/u);
  assert.equal([...previewHtml.matchAll(/class="combat-stat-board"/gu)].length, 2,
    'current and proposed combat states are presented side by side in the preview flow');
  assert.equal(store.vehicleDetails(player.id, vehicleId, 2000).mods.length, 0);

  const changedCommit = await postForm(base, customizePath, cookie, {
    [`mod_${mod.id}`]: 'on', intent: 'commit', previewToken: token
  }, customizePath);
  assert.equal(changedCommit.status, 303);
  assert.equal(store.vehicleDetails(player.id, vehicleId, 2000).mods.length, 0,
    'changed fields must not commit');
  const mismatchPage = await (await fetch(`${base}${customizePath}`, { headers: { cookie } })).text();
  assert.match(mismatchPage, /changed after it was previewed/i);

  const consumedCommit = await postForm(base, customizePath, cookie, {
    [`mod_${mod.id}`]: 'on', [`weapon_${weapon.id}`]: '1',
    intent: 'commit', previewToken: token
  }, customizePath);
  assert.equal(consumedCommit.status, 303);
  assert.equal(store.vehicleDetails(player.id, vehicleId, 2000).mods.length, 0,
    'a failed/tampered token must be consumed');
  const consumedPage = await (await fetch(`${base}${customizePath}`, { headers: { cookie } })).text();
  assert.match(consumedPage, /Preview this loadout again/i);

  const freshPreviewHtml = await (await postForm(base, customizePath, cookie, {
    [`mod_${mod.id}`]: 'on', [`weapon_${weapon.id}`]: '1', intent: 'preview'
  })).text();
  const freshToken = previewToken(freshPreviewHtml);
  const committed = await postForm(base, customizePath, cookie, {
    [`mod_${mod.id}`]: 'on', [`weapon_${weapon.id}`]: '1',
    intent: 'commit', previewToken: freshToken
  }, customizePath);
  assert.equal(committed.status, 303);
  const fitted = store.vehicleDetails(player.id, vehicleId, 2000);
  assert.deepEqual(fitted.mods.map((entry) => entry.id), [mod.id]);
  assert.deepEqual(fitted.weapons.map((entry) => entry.id), [weapon.id]);

  const cargoPath = `/vehicles/${vehicleId}/cargo`;
  const invalidCargo = await postForm(base, cargoPath, cookie, {
    [`cargo_${cargo.id}`]: '999', intent: 'preview'
  });
  assert.equal(invalidCargo.status, 200);
  const invalidCargoHtml = await invalidCargo.text();
  assert.match(invalidCargoHtml, /cannot be committed|cannot commit/i);
  assert.match(invalidCargoHtml, /available|capacity/i);
  assert.equal(inputTag(invalidCargoHtml, 'previewToken'), '',
    'an invalid proposal must not receive a commit token');
  assert.equal(store.vehicleDetails(player.id, vehicleId, 2000).cargoSize, 0);

  const cargoPreview = await postForm(base, cargoPath, cookie, {
    [`cargo_${cargo.id}`]: '2', intent: 'preview'
  });
  assert.equal(cargoPreview.status, 200);
  const cargoPreviewHtml = await cargoPreview.text();
  const cargoToken = previewToken(cargoPreviewHtml);
  assert.match(cargoPreviewHtml, /Proposed cargo/i);
  assert.equal(store.vehicleDetails(player.id, vehicleId, 2000).cargoSize, 0);

  await postForm(base, cargoPath, cookie, {
    [`cargo_${cargo.id}`]: '1', intent: 'commit', previewToken: cargoToken
  }, cargoPath);
  assert.equal(store.vehicleDetails(player.id, vehicleId, 2000).cargoSize, 0,
    'cargo commit must exactly match its preview');

  const validCargoHtml = await (await postForm(base, cargoPath, cookie, {
    [`cargo_${cargo.id}`]: '2', intent: 'preview'
  })).text();
  const validCargoToken = previewToken(validCargoHtml);
  const savedCargo = await postForm(base, cargoPath, cookie, {
    [`cargo_${cargo.id}`]: '2', intent: 'commit', previewToken: validCargoToken
  }, cargoPath);
  assert.equal(savedCargo.status, 303);
  assert.equal(store.vehicleDetails(player.id, vehicleId, 2000).cargoSize, 2);
});

test('renders a complete ship editor and recovery-only damaged controls', async (context) => {
  const store = new SqliteStore(':memory:');
  store.seedCatalog(bootstrapCatalog);
  const catalog = store.loadCatalog();
  const password = 'ship editor password';
  const { ship, cannons: [first, second] } = shipFixture(catalog);
  const tackleId = Number(catalog.settings.block_and_tackle_item_id);
  const ammunition = catalog.cannonballs[0];
  const player = store.addPlayer(createPlayer(
    'Ship Editor', '', hashPassword(password), catalog, 1000, () => 0.5
  ));
  player.inventory[ship.itemId] = 1;
  player.inventory[first.itemId] = 1;
  player.inventory[second.itemId] = 1;
  player.inventory[tackleId] = 2;
  player.inventory[ammunition.itemId] = 2;
  player.inventory[Number(catalog.settings.magnet_item_id)] = 1;
  player.inventory[Number(catalog.settings.bolt_item_id)] = 1;
  store.savePlayer(player);
  const vehicleId = store.activateVehicle(player.id, ship.itemId);
  store.fitShipLoadout(player.id, vehicleId, [first.id]);
  const base = await startServer(context, store);
  const cookie = await login(base, player.name, password);
  const path = `/vehicles/${vehicleId}/customize`;

  const editorHtml = await (await fetch(`${base}${path}`, { headers: { cookie } })).text();
  assert.doesNotMatch(editorHtml, /action="\/vehicles\/\d+\/cannons\/detach"/u);
  assert.doesNotMatch(editorHtml, />Detach all/u);
  assert.match(editorHtml, /Ship fittings and cannons/u);
  assert.match(editorHtml, /\/node\/equipment\/magnet\.svg/u);
  assert.match(inputTag(editorHtml, `mod_${MAGNET_CATALOG.mod.id}`), /type="checkbox"/u);
  assert.match(editorHtml, /Fitting a Magnet consumes the Magnet and one Bolt/u);
  assert.match(inputTag(editorHtml, `cannon_${first.id}`), /value="1"/u,
    'the fitted cannon is part of the proposed complete set');
  for (const label of ['Base', 'Cannons', 'Ammunition', 'Cargo', 'Free']) {
    assert.match(editorHtml, new RegExp(label, 'i'), `capacity breakdown should show ${label}`);
  }
  assert.match(editorHtml, /Limit|Total/i, 'capacity breakdown should identify its usable limit');

  const retiredDirectCannon = await postForm(base, `/vehicles/${vehicleId}/cannons`, cookie, {
    cannonId: String(second.id)
  }, path);
  assert.equal(retiredDirectCannon.status, 303);
  assert.deepEqual(store.vehicleDetails(player.id, vehicleId, 2000).cannons.map((entry) => entry.id),
    [first.id], 'retired direct cannon routes must not bypass complete-loadout preview');

  const replacementHtml = await (await postForm(base, path, cookie, {
    [`cannon_${second.id}`]: '1', intent: 'preview'
  })).text();
  const token = previewToken(replacementHtml);
  assert.match(replacementHtml, new RegExp(catalog.byId.get(first.itemId).name, 'u'));
  assert.match(replacementHtml, new RegExp(catalog.byId.get(second.itemId).name, 'u'));
  const committed = await postForm(base, path, cookie, {
    [`cannon_${second.id}`]: '1', intent: 'commit', previewToken: token
  }, path);
  assert.equal(committed.status, 303);
  assert.deepEqual(store.vehicleDetails(player.id, vehicleId, 2000).cannons.map((entry) => entry.id),
    [second.id]);

  store.loadShipAmmo(player.id, vehicleId, ammunition.type, 1);
  store.database.prepare('UPDATE player_vehicles SET damaged = 1 WHERE id = ?').run(vehicleId);
  const damagedHtml = await (await fetch(`${base}${path}`, { headers: { cookie } })).text();
  assert.match(damagedHtml, /recovery|remove|unload/i);
  assert.match(damagedHtml, /city repair underway/i);
  assert.doesNotMatch(inputTag(damagedHtml, `cannon_${second.id}`), /disabled/u,
    'the currently fitted cannon control must allow removal');
  assert.match(inputTag(damagedHtml, `cannon_${first.id}`), /disabled/u,
    'a damaged ship must not allow a cannon addition');
  const ammoLoadForm = damagedHtml.match(new RegExp(
    `<form[^>]+action="/vehicles/${vehicleId}/ammo"[\\s\\S]*?</form>`, 'u'))?.[0] ?? '';
  assert.match(ammoLoadForm, /<button[^>]*disabled/u);
  const ammoUnloadForm = damagedHtml.match(new RegExp(
    `<form[^>]+action="/vehicles/${vehicleId}/ammo/unload"[\\s\\S]*?</form>`, 'u'))?.[0] ?? '';
  assert.doesNotMatch(ammoUnloadForm, /<button[^>]*disabled/u,
    'a damaged ship must still allow unloading');
  const statusHtml = await (await fetch(`${base}/vehicles/${vehicleId}`, {
    headers: { cookie }
  })).text();
  const storeForm = statusHtml.match(new RegExp(
    `<form[^>]+action="/vehicles/${vehicleId}/store"[\\s\\S]*?</form>`, 'u'))?.[0] ?? '';
  assert.match(storeForm, /repairs complete|city repair/i);
  assert.match(storeForm, /<button[^>]*disabled/u,
    'damage must not be cleared by packing the vehicle back into inventory');
});

test('quantity-only ship commits preserve the portal order of an unchanged mixed set',
  async (context) => {
    const store = new SqliteStore(':memory:');
    store.seedCatalog(bootstrapCatalog);
    const catalog = store.loadCatalog();
    const password = 'stable portal order password';
    const { ship, cannons: [first, second] } = multiPortalShipFixture(catalog);
    const tackleId = Number(catalog.settings.block_and_tackle_item_id);
    const player = store.addPlayer(createPlayer(
      'Stable Portal Order', '', hashPassword(password), catalog, 1000, () => 0.5
    ));
    player.inventory[ship.itemId] = 1;
    player.inventory[first.itemId] = 2;
    player.inventory[second.itemId] = 1;
    player.inventory[tackleId] = 1;
    store.savePlayer(player);
    const vehicleId = store.activateVehicle(player.id, ship.itemId);
    const originalOrder = [second.id, first.id, first.id];
    store.fitShipLoadout(player.id, vehicleId, originalOrder);
    const base = await startServer(context, store);
    const cookie = await login(base, player.name, password);
    const path = `/vehicles/${vehicleId}/customize`;

    const previewHtml = await (await postForm(base, path, cookie, {
      [`cannon_${first.id}`]: '2', [`cannon_${second.id}`]: '1', intent: 'preview'
    })).text();
    const token = previewToken(previewHtml);
    assert.doesNotMatch(previewHtml, /Move .* from portal/iu,
      'an unchanged multiset must not propose gratuitous portal moves');
    assert.deepEqual(store.vehicleDetails(player.id, vehicleId, 2000).cannons
      .sort((left, right) => left.portal - right.portal).map((entry) => entry.id), originalOrder);

    const committed = await postForm(base, path, cookie, {
      [`cannon_${first.id}`]: '2', [`cannon_${second.id}`]: '1',
      intent: 'commit', previewToken: token
    }, path);
    assert.equal(committed.status, 303);
    assert.deepEqual(store.vehicleDetails(player.id, vehicleId, 2000).cannons
      .sort((left, right) => left.portal - right.portal).map((entry) => entry.id), originalOrder);
    assert.equal(inventoryQuantity(store, player.id, player.cityId, tackleId), 1,
      'preserving portal order must not consume tackle');
  });
