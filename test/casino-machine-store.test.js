import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  BROMO_SPOREFALL_KEY, KINGS_LOCKBOX_KEY, REGIONAL_CASINO_MACHINES,
  THING_O_MATIC_KEY
} from '../src/casino-machines.js';
import { createPlayer } from '../src/game.js';
import { loadLegacyCatalog } from '../src/legacy-catalog.js';
import { SqliteStore } from '../src/store.js';

const GOLD_SCALE = 10_000;
const catalog = loadLegacyCatalog();

function storeFixture(context, prefix) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const fixture = {
    databaseFile: path.join(directory, 'game.sqlite'),
    store: null
  };
  fixture.store = new SqliteStore(fixture.databaseFile);
  context.after(() => {
    try { fixture.store?.close(); } catch {}
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return fixture;
}

function addCasinoPlayer(store, name) {
  store.seedCatalog(catalog);
  const player = store.addPlayer(createPlayer(
    name, '', 'hash', catalog, 1_000, () => 0.5
  ));
  store.database.prepare('UPDATE players SET gold_units = ? WHERE id = ?')
    .run(10_000 * GOLD_SCALE, player.id);
  return player;
}

function assertMachineSchema(store) {
  const machineKey = store.database.prepare('PRAGMA table_info(casino_spins)')
    .all().find((column) => column.name === 'machine_key');
  assert.ok(machineKey, 'casino spins should identify their machine');
  assert.equal(machineKey.type, 'TEXT');
  assert.equal(machineKey.notnull, 1);
  assert.equal(machineKey.dflt_value, "'thing-o-matic'");

  const indexes = store.database.prepare('PRAGMA index_list(casino_spins)').all();
  assert.ok(indexes.some((index) => index.name === 'casino_spins_player_machine_recent'));
  assert.deepEqual(
    store.database.prepare('PRAGMA index_info(casino_spins_player_machine_recent)')
      .all().map((column) => column.name),
    ['player_id', 'machine_key', 'created_at', 'id']
  );
  const globalStats = store.database.prepare(`
    SELECT id, spin_count FROM casino_global_stats
  `).get();
  assert.equal(globalStats.id, 1);
  assert.ok(Number.isSafeInteger(Number(globalStats.spin_count))
    && Number(globalStats.spin_count) >= 0);
  assert.ok(store.database.prepare(`
    SELECT 1 FROM sqlite_master
    WHERE type = 'trigger' AND name = 'casino_global_spin_count_after_insert'
  `).get());
}

function weightedValue(rules, itemId) {
  const weights = rules.symbolItemIds.map((id) => Number(rules.symbolWeightsByItemId[id]));
  const itemIndex = rules.symbolItemIds.indexOf(itemId);
  assert.notEqual(itemIndex, -1, `item ${itemId} should be on this machine's reel`);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const preceding = weights.slice(0, itemIndex).reduce((sum, weight) => sum + weight, 0);
  return (preceding + weights[itemIndex] / 2) / total;
}

function sequenceRandom(values, fallback = 0.5) {
  let index = 0;
  return () => index < values.length ? values[index++] : fallback;
}

function sporefallRandom(rules) {
  const [a, b, c, d, e, f] = rules.symbolItemIds;
  const initialGrid = [a, a, a, b, c, d, e, f, b];
  const settledRefill = [c, d, e];
  return sequenceRandom([
    0.5,
    ...initialGrid.map((itemId) => weightedValue(rules, itemId)),
    ...settledRefill.map((itemId) => weightedValue(rules, itemId))
  ]);
}

function lockboxRandom(rules) {
  const relic = rules.collectibleItemIds[0];
  const dud = rules.dudItemId;
  const initialGrid = [relic, relic, relic, dud, dud, dud, dud, dud, dud];
  const dudRespins = Array(Number(rules.maximumRespins) * 6).fill(dud);
  return sequenceRandom(
    [...initialGrid, ...dudRespins].map((itemId) => weightedValue(rules, itemId))
  );
}

function validGoldWager(rules, offset) {
  return Math.min(
    Number(rules.maximumGoldWager), Number(rules.minimumGoldWager) + offset
  );
}

function replayProjection(spin) {
  return spin.frames.map((frame) => ({
    replayKind: frame.replayKind,
    label: frame.label,
    holdMs: frame.holdMs,
    lockedCells: frame.lockedCells ?? null,
    remainingAttempts: frame.remainingAttempts ?? null,
    clearedCells: frame.clearedCells ?? null,
    refilledCells: frame.refilledCells ?? null,
    newlyLockedCells: frame.newlyLockedCells ?? null,
    grid: frame.grid.map((symbol) => ({ id: symbol.id, position: symbol.position }))
  }));
}

function assertMachineStats(state, spins, globalSpinCount) {
  assert.deepEqual(state.stats, {
    spinCount: spins.length,
    jackpotCount: spins.filter((spin) => spin.jackpot).length,
    bestMultiplier: Math.max(...spins.map((spin) => spin.multiplier)),
    globalSpinCount
  });
}

function settlementSnapshot(store, playerId) {
  return {
    player: store.database.prepare(`
      SELECT gold_units, gold_updated_at FROM players WHERE id = ?
    `).get(playerId),
    spinCount: store.database.prepare(`
      SELECT COUNT(*) AS count FROM casino_spins WHERE player_id = ?
    `).get(playerId).count,
    globalSpinCount: store.database.prepare(`
      SELECT spin_count FROM casino_global_stats WHERE id = 1
    `).get().spin_count
  };
}

test('publishes every settled casino jackpot to global Worldwire exactly once', (context) => {
  const fixture = storeFixture(context, 'minethings-casino-jackpot-chat-');
  const player = addCasinoPlayer(fixture.store, 'Jackpot Witness');
  const wager = Number(fixture.store.casinoState(player.id).rules.minimumGoldWager);
  const spin = fixture.store.spinCasino(player.id, 'gold', wager, () => 0, 2_000);
  assert.equal(spin.jackpot, true);

  const announcement = fixture.store.database.prepare(`
    SELECT id, body, path FROM world_chat_announcements WHERE event_key = ?
  `).get(`casino-jackpot:${spin.id}`);
  assert.ok(announcement);
  assert.match(announcement.body, /Jackpot Witness/u);
  assert.match(announcement.body, /Thing-O-Matic/u);
  assert.match(announcement.body, new RegExp(`${spin.multiplier.toLocaleString('en-GB')}\u00d7`, 'u'));
  assert.match(announcement.body, new RegExp(`${spin.payout.toLocaleString('en-GB')}g`, 'u'));
  assert.equal(announcement.path, '/casino');
  assert.equal(fixture.store.database.prepare(`
    SELECT COUNT(*) AS count FROM world_chat_announcement_regions
    WHERE announcement_id = ?
  `).get(announcement.id).count, 0, 'jackpots are global rather than region-gated');
  assert.equal(fixture.store.recentChats().filter((chat) =>
    chat.eventKey === `casino-jackpot:${spin.id}`).length, 1);
});

test('fresh and migrated casino schemas default legacy spins to Thing-O-Matic', (context) => {
  const fixture = storeFixture(context, 'minethings-casino-machine-schema-');
  const player = addCasinoPlayer(fixture.store, 'Machine Schema');

  assertMachineSchema(fixture.store);

  fixture.store.database.exec(`
    DROP INDEX casino_spins_player_machine_recent;
    ALTER TABLE casino_spins DROP COLUMN machine_key;
  `);
  fixture.store.database.prepare(`
    INSERT INTO casino_spins
      (player_id, currency_kind, crypto_type_id, wager_units, payout_units,
       multiplier, grid_json, wins_json, jackpot, created_at)
    VALUES (?, 'gold', NULL, ?, 0, 0, '[]', '[]', 0, ?)
  `).run(player.id, GOLD_SCALE, 2_000);

  fixture.store.close();
  fixture.store = new SqliteStore(fixture.databaseFile);

  assertMachineSchema(fixture.store);
  assert.equal(fixture.store.database.prepare(`
    SELECT machine_key FROM casino_spins WHERE player_id = ?
  `).get(player.id).machine_key, THING_O_MATIC_KEY);
  assert.ok(fixture.store.database.prepare(`
    SELECT 1 FROM schema_migrations WHERE name = 'casino-machine-floor-v6'
  `).get());
});

test('machine histories, statistics, last bets, and selected spins stay isolated after reopen',
  (context) => {
    const fixture = storeFixture(context, 'minethings-casino-machine-ledger-');
    const player = addCasinoPlayer(fixture.store, 'Machine Ledger');
    const initialThing = fixture.store.casinoState(player.id);
    const initialSporefall = fixture.store.casinoMachineState(
      player.id, BROMO_SPOREFALL_KEY
    );
    const initialLockbox = fixture.store.casinoState(
      player.id, null, KINGS_LOCKBOX_KEY
    );
    const thingWager = validGoldWager(initialThing.rules, 0);
    const sporefallWager = validGoldWager(initialSporefall.rules, 1);
    const lockboxWager = validGoldWager(initialLockbox.rules, 2);

    const thing = fixture.store.spinCasino(
      player.id, 'gold', thingWager, () => 0.5, 2_000
    );
    const sporefall = fixture.store.spinCasino(
      player.id, 'gold', sporefallWager,
      sporefallRandom(initialSporefall.rules), 3_000, BROMO_SPOREFALL_KEY
    );
    const lockbox = fixture.store.spinCasinoMachine(
      player.id, KINGS_LOCKBOX_KEY, 'gold', lockboxWager,
      lockboxRandom(initialLockbox.rules), 4_000
    );

    assert.equal(thing.machineKey, THING_O_MATIC_KEY);
    assert.equal(sporefall.machineKey, BROMO_SPOREFALL_KEY);
    assert.equal(lockbox.machineKey, KINGS_LOCKBOX_KEY);
    assert.ok(sporefall.frames.length > 1, 'the connected shrooms should cascade once');
    assert.ok(lockbox.frames.length > 1, 'three revealed relics should start respins');
    assert.ok(sporefall.frames.every((frame) => frame.replayKind === 'cascade'));
    assert.ok(lockbox.frames.every((frame) => frame.replayKind === 'hold-respin'));
    assert.ok(lockbox.frames.every((frame) => Array.isArray(frame.lockedCells)));
    assert.ok(lockbox.frames.every((frame) => Number.isSafeInteger(frame.remainingAttempts)));

    const thingState = fixture.store.casinoState(player.id);
    const sporefallState = fixture.store.casinoState(
      player.id, sporefall.id, BROMO_SPOREFALL_KEY
    );
    const lockboxState = fixture.store.casinoMachineState(
      player.id, KINGS_LOCKBOX_KEY, lockbox.id
    );
    assert.deepEqual(thingState.recentSpins.map((spin) => spin.id), [thing.id]);
    assert.deepEqual(sporefallState.recentSpins.map((spin) => spin.id), [sporefall.id]);
    assert.deepEqual(lockboxState.recentSpins.map((spin) => spin.id), [lockbox.id]);
    assert.deepEqual(thingState.lastBet, { currency: 'gold', wager: thingWager });
    assert.deepEqual(sporefallState.lastBet, { currency: 'gold', wager: sporefallWager });
    assert.deepEqual(lockboxState.lastBet, { currency: 'gold', wager: lockboxWager });
    assertMachineStats(thingState, [thing], 3);
    assertMachineStats(sporefallState, [sporefall], 3);
    assertMachineStats(lockboxState, [lockbox], 3);

    const expectedCounts = new Map([
      [THING_O_MATIC_KEY, 1], [BROMO_SPOREFALL_KEY, 1], [KINGS_LOCKBOX_KEY, 1],
      ['tzolkin-worldwheel-seven', 0]
    ]);
    for (const state of [thingState, sporefallState, lockboxState]) {
      assert.deepEqual(
        new Map(state.machines.map((machine) => [machine.key, machine.spinCount])),
        expectedCounts
      );
    }
    assert.equal(
      fixture.store.casinoState(player.id, sporefall.id, THING_O_MATIC_KEY).selectedSpin,
      null
    );
    assert.equal(
      fixture.store.casinoMachineState(
        player.id, KINGS_LOCKBOX_KEY, sporefall.id
      ).selectedSpin,
      null
    );
    assert.equal(sporefallState.selectedSpin.id, sporefall.id);
    assert.equal(lockboxState.selectedSpin.id, lockbox.id);

    const sporefallReplay = replayProjection(sporefall);
    const lockboxReplay = replayProjection(lockbox);
    fixture.store.close();
    fixture.store = new SqliteStore(fixture.databaseFile);

    const reopenedSporefall = fixture.store.casinoState(
      player.id, sporefall.id, BROMO_SPOREFALL_KEY
    ).selectedSpin;
    const reopenedLockbox = fixture.store.casinoMachineState(
      player.id, KINGS_LOCKBOX_KEY, lockbox.id
    ).selectedSpin;
    assert.deepEqual(replayProjection(reopenedSporefall), sporefallReplay);
    assert.deepEqual(replayProjection(reopenedLockbox), lockboxReplay);
  });

test('counts every successful machine request globally and keeps the all-time total',
  (context) => {
    const fixture = storeFixture(context, 'minethings-casino-global-count-');
    const first = addCasinoPlayer(fixture.store, 'Global Spinner One');
    const second = fixture.store.addPlayer(createPlayer(
      'Global Spinner Two', '', 'hash', catalog, 1_000, () => 0.5
    ));
    fixture.store.database.prepare('UPDATE players SET gold_units = ? WHERE id = ?')
      .run(10_000 * GOLD_SCALE, second.id);

    fixture.store.spinCasino(first.id, 'gold', 1, () => 0.5, 2_000);
    fixture.store.spinCasinoMachine(
      second.id, BROMO_SPOREFALL_KEY, 'gold', 1, () => 0.5, 3_000
    );
    assert.equal(fixture.store.casinoState(first.id).stats.globalSpinCount, 2);
    assert.equal(fixture.store.casinoState(
      second.id, null, KINGS_LOCKBOX_KEY
    ).stats.globalSpinCount, 2);

    fixture.store.database.prepare('DELETE FROM players WHERE id = ?').run(second.id);
    assert.equal(fixture.store.database.prepare(`
      SELECT COUNT(*) AS count FROM casino_spins
    `).get().count, 1, 'the deleted miner ledger should follow the player');
    assert.equal(fixture.store.casinoState(first.id).stats.globalSpinCount, 2,
      'the house counter must retain spins whose player ledger no longer exists');
  });

test('recovers a missing global counter from the spin ledger without blocking the casino',
  (context) => {
    const fixture = storeFixture(context, 'minethings-casino-global-recovery-');
    const player = addCasinoPlayer(fixture.store, 'Counter Recovery Spinner');

    fixture.store.spinCasino(player.id, 'gold', 1, () => 0.5, 2_000);
    fixture.store.spinCasino(player.id, 'gold', 1, () => 0.5, 3_000);
    fixture.store.database.prepare('DELETE FROM casino_global_stats WHERE id = 1').run();

    assert.equal(fixture.store.casinoState(player.id).stats.globalSpinCount, 2,
      'the casino page should fall back to its surviving ledger');
    fixture.store.spinCasino(player.id, 'gold', 1, () => 0.5, 4_000);
    assert.equal(fixture.store.casinoState(player.id).stats.globalSpinCount, 3);
    assert.equal(fixture.store.database.prepare(`
      SELECT spin_count FROM casino_global_stats WHERE id = 1
    `).get().spin_count, 3, 'the insert trigger should recreate the singleton accurately');
  });

test('backfills the global counter from historical machine ledgers', (context) => {
  const fixture = storeFixture(context, 'minethings-casino-global-backfill-');
  const player = addCasinoPlayer(fixture.store, 'Historical Spinner');
  fixture.store.spinCasino(player.id, 'gold', 1, () => 0.5, 2_000);
  fixture.store.database.exec(`
    DROP TRIGGER casino_global_spin_count_after_insert;
    DROP TABLE casino_global_stats;
    DELETE FROM schema_migrations WHERE name = 'casino-global-spin-count-v1';
  `);
  fixture.store.close();
  fixture.store = new SqliteStore(fixture.databaseFile);

  assert.equal(fixture.store.casinoState(player.id).stats.globalSpinCount, 1);
  const migration = fixture.store.database.prepare(`
    SELECT details_json FROM schema_migrations
    WHERE name = 'casino-global-spin-count-v1'
  `).get();
  assert.deepEqual(JSON.parse(migration.details_json), {
    historicalSpins: 1, spinCount: 1
  });
});

test('offers exactly one local cabinet per region and rejects remote regional play', (context) => {
  const fixture = storeFixture(context, 'minethings-casino-regional-floor-');
  const player = addCasinoPlayer(fixture.store, 'Regional Spinner');
  fixture.store.ensureWorldMaps(1_000);
  const houseKeys = [THING_O_MATIC_KEY, BROMO_SPOREFALL_KEY, KINGS_LOCKBOX_KEY];
  const setRegion = fixture.store.database.prepare(`
    UPDATE players SET city_id = (SELECT capital_city_id FROM world_maps WHERE id = ?)
    WHERE id = ?
  `);

  for (const local of REGIONAL_CASINO_MACHINES) {
    setRegion.run(local.regionId, player.id);
    const floor = fixture.store.casinoState(player.id);
    assert.deepEqual(floor.machines.map((machine) => machine.key),
      [...houseKeys, local.key]);
    const localState = fixture.store.casinoMachineState(player.id, local.key);
    assert.equal(localState.machine.regionId, local.regionId);
    assert.equal(localState.machine.regionName, local.regionName);
    assert.equal(localState.rules.gridSize,
      local.rules.gridColumns * local.rules.gridRows);
    const remote = REGIONAL_CASINO_MACHINES.find(
      (machine) => machine.regionId !== local.regionId
    );
    assert.throws(() => fixture.store.casinoState(player.id, null, remote.key),
      /only operates in/iu);
  }

  const aso = REGIONAL_CASINO_MACHINES.find((machine) => machine.regionId === 1);
  setRegion.run(aso.regionId, player.id);
  const spin = fixture.store.spinCasinoMachine(
    player.id, aso.key, 'gold', 1, () => 0.5, 5_000
  );
  assert.equal(spin.machineKey, aso.key);
  assert.equal(spin.grid.length, aso.rules.gridSize);

  setRegion.run(2, player.id);
  const before = settlementSnapshot(fixture.store, player.id);
  let randomCalls = 0;
  assert.throws(() => fixture.store.spinCasinoMachine(
    player.id, aso.key, 'gold', 1,
    () => { randomCalls += 1; return 0.5; }, 6_000
  ), /only operates in Aso/iu);
  assert.equal(randomCalls, 0);
  assert.deepEqual(settlementSnapshot(fixture.store, player.id), before);

  fixture.store.close();
  fixture.store = new SqliteStore(fixture.databaseFile);
  assert.ok(fixture.store.database.prepare(`
    SELECT 1 FROM schema_migrations WHERE name = 'casino-regional-circuit-v2'
  `).get());
  for (const machine of REGIONAL_CASINO_MACHINES) {
    assert.ok(fixture.store.database.prepare(`
      SELECT 1 FROM catalog_settings WHERE key = ?
    `).get(machine.rulesSettingKey));
  }
});

test('upgrades an existing regional casino circuit to the larger mixed-art cabinets', (context) => {
  const fixture = storeFixture(context, 'minethings-casino-regional-v2-');
  const machine = REGIONAL_CASINO_MACHINES[0];
  fixture.store.seedCatalog(catalog);
  fixture.store.database.prepare(`
    UPDATE catalog_settings SET value_json = '{}' WHERE key = ?
  `).run(machine.rulesSettingKey);
  fixture.store.database.prepare(`
    DELETE FROM schema_migrations WHERE name = 'casino-regional-circuit-v2'
  `).run();
  fixture.store.close();
  fixture.store = new SqliteStore(fixture.databaseFile);

  const migrated = JSON.parse(fixture.store.database.prepare(`
    SELECT value_json FROM catalog_settings WHERE key = ?
  `).get(machine.rulesSettingKey).value_json);
  assert.deepEqual(migrated, machine.rules);
  assert.ok(fixture.store.database.prepare(`
    SELECT 1 FROM schema_migrations WHERE name = 'casino-regional-circuit-v2'
  `).get());
});

test('unknown machines and failed random sources roll back the whole settlement', (context) => {
  const fixture = storeFixture(context, 'minethings-casino-machine-rollback-');
  const player = addCasinoPlayer(fixture.store, 'Machine Rollback');
  const before = settlementSnapshot(fixture.store, player.id);
  let randomCalls = 0;

  assert.throws(() => fixture.store.spinCasino(
    player.id, 'gold', 1,
    () => { randomCalls += 1; return 0.5; },
    2_000, 'missing-machine'
  ), /casino machine does not exist/i);
  assert.equal(randomCalls, 0, 'machine validation should happen before requesting randomness');
  assert.deepEqual(settlementSnapshot(fixture.store, player.id), before);

  assert.throws(() => fixture.store.spinCasino(
    player.id, 'gold', 1, () => 1, 3_000, BROMO_SPOREFALL_KEY
  ), /random source returned an invalid value/i);
  assert.deepEqual(settlementSnapshot(fixture.store, player.id), before);
});
