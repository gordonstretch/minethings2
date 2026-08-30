import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BROMO_SPOREFALL_KEY,
  BROMO_SPOREFALL_RULES,
  CASINO_MACHINE_KEYS,
  CASINO_MACHINE_REGISTRY,
  KINGS_LOCKBOX_KEY,
  KINGS_LOCKBOX_RULES,
  THING_O_MATIC_KEY,
  casinoMachineByKey,
  evaluateBromoSporefallGrid,
  requireCasinoMachine,
  resolveBromoSporefallPull,
  resolveCasinoMachinePull,
  resolveKingsLockboxPull,
  validateBromoSporefallRules,
  validateCasinoMachineRules,
  validateKingsLockboxRules
} from '../src/casino-machines.js';
import { LEGACY_CASINO_SLOT_RULES } from '../src/legacy-catalog.js';

function sequence(values) {
  return () => {
    assert.ok(values.length, 'the machine should not request excess randomness');
    return values.shift();
  };
}

function assertSharedOutcome(result, machineKey) {
  assert.equal(result.machineKey, machineKey);
  assert.equal(result.grid.length, 9);
  assert.equal(result.grids.length, result.frames.length);
  assert.deepEqual(result.grids, result.frames.map((frame) => frame.grid));
  assert.ok(Array.isArray(result.wins));
  assert.ok(Number.isSafeInteger(result.multiplier));
  assert.equal(typeof result.jackpot, 'boolean');
  assert.equal(typeof result.replayKind, 'string');
  assert.equal(typeof result.label, 'string');
  assert.ok(Number.isSafeInteger(result.holdMs));
  for (const frame of result.frames) {
    assert.equal(frame.grid.length, 9);
    assert.ok(Array.isArray(frame.wins));
    assert.ok(Number.isSafeInteger(frame.multiplier));
    assert.equal(typeof frame.jackpot, 'boolean');
    assert.equal(frame.replayKind, result.replayKind);
    assert.equal(typeof frame.label, 'string');
    assert.ok(Number.isSafeInteger(frame.holdMs));
  }
}

test('registers immutable machine definitions and adapts the Thing-O-Matic engine', () => {
  assert.deepEqual(CASINO_MACHINE_KEYS, [
    THING_O_MATIC_KEY, BROMO_SPOREFALL_KEY, KINGS_LOCKBOX_KEY
  ]);
  assert.ok(Object.isFrozen(CASINO_MACHINE_REGISTRY));
  assert.equal(casinoMachineByKey(BROMO_SPOREFALL_KEY).defaultRules,
    BROMO_SPOREFALL_RULES);
  assert.equal(casinoMachineByKey(KINGS_LOCKBOX_KEY).defaultRules,
    KINGS_LOCKBOX_RULES);
  assert.equal(casinoMachineByKey('missing-machine'), null);
  assert.throws(() => requireCasinoMachine('missing-machine'), /does not exist/);
  assert.equal(
    validateCasinoMachineRules(THING_O_MATIC_KEY, LEGACY_CASINO_SLOT_RULES).version,
    LEGACY_CASINO_SLOT_RULES.version
  );

  const values = [0.5, ...Array(9).fill(0)];
  const result = resolveCasinoMachinePull(
    THING_O_MATIC_KEY, LEGACY_CASINO_SLOT_RULES, sequence(values)
  );
  assert.equal(values.length, 0);
  assertSharedOutcome(result, THING_O_MATIC_KEY);
  assert.deepEqual(result.grid, Array(9).fill(2));
  assert.equal(result.multiplier, 16);
  assert.equal(result.replayKind, 'bonus-spin');
  assert.equal(result.frames[0].label, 'Paid spin');
  assert.equal(result.frames[0].holdMs, 3000);
});

test('scores connected Sporefall matches by count and cascade depth', () => {
  const grid = [1434, 1434, 1434, 1435, 1436, 1437, 1438, 1439, 1435];
  const opening = evaluateBromoSporefallGrid(grid);
  assert.equal(opening.jackpot, false);
  assert.deepEqual(opening.winningCells, [0, 1, 2]);
  assert.equal(opening.wins.length, 1);
  assert.equal(opening.wins[0].kind, 'cascade-match');
  assert.equal(opening.wins[0].itemId, 1434);
  assert.equal(opening.wins[0].multiplier, 1);
  assert.equal(opening.multiplier, 1);

  const thirdDrop = evaluateBromoSporefallGrid(grid, BROMO_SPOREFALL_RULES, 2);
  assert.equal(thirdDrop.cascadeMultiplier, 3);
  assert.equal(thirdDrop.multiplier, 3);

  const disconnected = evaluateBromoSporefallGrid([
    1434, 1435, 1436,
    1437, 1434, 1438,
    1439, 1435, 1434
  ]);
  assert.equal(disconnected.multiplier, 0,
    'matching shrooms must touch orthogonally to form a cluster');

  const jackpot = evaluateBromoSporefallGrid(Array(9).fill(1439));
  assert.equal(jackpot.jackpot, true);
  assert.equal(jackpot.baseMultiplier, 30);
  assert.equal(jackpot.jackpotMultiplier, 1000);
  assert.equal(jackpot.multiplier, 1030);
});

test('refills only winning Sporefall cells and stops on a settled grid', () => {
  const values = [
    0.5,
    0.05, 0.05, 0.05, 0.2, 0.2, 0.4, 0.4, 0.55, 0.7,
    0.9, 0.55, 0.7
  ];
  const result = resolveBromoSporefallPull(
    BROMO_SPOREFALL_RULES, sequence(values)
  );
  assert.equal(values.length, 0);
  assertSharedOutcome(result, BROMO_SPOREFALL_KEY);
  assert.equal(result.frames.length, 2);
  assert.equal(result.cascades, 1);
  assert.equal(result.multiplier, 1);
  assert.equal(result.terminationReason, 'settled');
  assert.deepEqual(result.frames[0].clearedCells, [0, 1, 2]);
  assert.deepEqual(result.frames[1].refilledCells, [0, 1, 2]);
  assert.deepEqual(result.frames[1].grid.slice(3), result.frames[0].grid.slice(3));
  assert.deepEqual(result.frames.map((frame) => frame.label), [
    'Initial drop', 'Cascade 1'
  ]);
});

test('bounds Sporefall at six refills and stops a jackpot without another cascade', () => {
  const capValues = [0.5, ...Array(9 + (9 * 6)).fill(0.01)];
  const capped = resolveBromoSporefallPull(
    BROMO_SPOREFALL_RULES, sequence(capValues)
  );
  assert.equal(capValues.length, 0);
  assert.equal(capped.frames.length, 7);
  assert.equal(capped.cascades, 6);
  assert.equal(capped.multiplier, 168);
  assert.equal(capped.terminationReason, 'cascade-cap');

  const jackpotValues = [0];
  const jackpot = resolveBromoSporefallPull(
    BROMO_SPOREFALL_RULES, sequence(jackpotValues)
  );
  assert.equal(jackpotValues.length, 0);
  assert.equal(jackpot.frames.length, 1);
  assert.equal(jackpot.jackpot, true);
  assert.equal(jackpot.forcedJackpot, true);
  assert.equal(jackpot.multiplier, 1030);
  assert.equal(jackpot.terminationReason, 'jackpot');
});

test('rejects malformed Sporefall rules, grids, and randomness', () => {
  assert.throws(() => validateBromoSporefallRules({
    ...BROMO_SPOREFALL_RULES,
    symbolItemIds: [1435, 1434, 1436, 1437, 1438, 1439]
  }), /Sporefall symbols/);
  assert.throws(() => validateBromoSporefallRules({
    ...BROMO_SPOREFALL_RULES, maximumCascades: 13
  }), /maximum cascades/);
  assert.throws(() => validateBromoSporefallRules({
    ...BROMO_SPOREFALL_RULES, holdMs: 10001
  }), /frame hold/);
  assert.throws(() => validateBromoSporefallRules({
    ...BROMO_SPOREFALL_RULES,
    symbolWeightsByItemId: Object.fromEntries(
      BROMO_SPOREFALL_RULES.symbolItemIds.map((itemId) => [itemId, Number.MAX_SAFE_INTEGER])
    )
  }), /symbol weight is too large/);
  assert.throws(() => evaluateBromoSporefallGrid(Array(9).fill(1554)),
    /unknown symbol/);
  assert.throws(() => resolveBromoSporefallPull(BROMO_SPOREFALL_RULES, () => 1),
    /random source returned an invalid value/);
});

test("requires three relics before the King's Lockbox opens", () => {
  const values = [0.94, 0.955, ...Array(7).fill(0.1)];
  const result = resolveKingsLockboxPull(KINGS_LOCKBOX_RULES, sequence(values));
  assert.equal(values.length, 0);
  assertSharedOutcome(result, KINGS_LOCKBOX_KEY);
  assert.equal(result.featureTriggered, false);
  assert.equal(result.frames.length, 1);
  assert.equal(result.multiplier, 0);
  assert.equal(result.wins.length, 0);
  assert.deepEqual(result.lockedCells, []);
  assert.equal(result.terminationReason, 'not-triggered');
});

test('holds relics, resets attempts on a new lock, and exhausts three misses', () => {
  const values = [
    0.94, 0.955, 0.965, ...Array(6).fill(0.1),
    0.975, ...Array(5).fill(0.1),
    ...Array(5).fill(0.1),
    0.985, ...Array(4).fill(0.1),
    ...Array(4).fill(0.1),
    ...Array(4).fill(0.1),
    ...Array(4).fill(0.1)
  ];
  const result = resolveKingsLockboxPull(KINGS_LOCKBOX_RULES, sequence(values));
  assert.equal(values.length, 0);
  assertSharedOutcome(result, KINGS_LOCKBOX_KEY);
  assert.equal(result.featureTriggered, true);
  assert.equal(result.respinsUsed, 6);
  assert.equal(result.frames.length, 7);
  assert.equal(result.multiplier, 43);
  assert.equal(result.remainingAttempts, 0);
  assert.equal(result.terminationReason, 'attempts-exhausted');
  assert.deepEqual(result.lockedCells, [0, 1, 2, 3, 4]);
  assert.deepEqual(result.frames.map((frame) => frame.remainingAttempts), [
    3, 3, 2, 3, 2, 1, 0
  ]);
  assert.deepEqual(result.frames.map((frame) => frame.newlyLockedCells), [
    [0, 1, 2], [3], [], [4], [], [], []
  ]);
  for (const frame of result.frames) {
    assert.deepEqual(frame.grid.slice(0, 3), [1555, 1560, 1566]);
  }
  for (const frame of result.frames.slice(2)) assert.equal(frame.grid[3], 1570);
  for (const frame of result.frames.slice(4)) assert.equal(frame.grid[4], 1577);
});

test("awards the King's Lockbox jackpot for a full initial vault", () => {
  const values = Array(9).fill(0.94);
  const result = resolveKingsLockboxPull(KINGS_LOCKBOX_RULES, sequence(values));
  assert.equal(values.length, 0);
  assert.equal(result.frames.length, 1);
  assert.equal(result.featureTriggered, true);
  assert.equal(result.jackpot, true);
  assert.equal(result.baseMultiplier, 9);
  assert.equal(result.jackpotMultiplier, 500);
  assert.equal(result.multiplier, 509);
  assert.deepEqual(result.lockedCells, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(result.terminationReason, 'vault-filled');
});

test('enforces an absolute Lockbox respin cap even when a relic resets attempts', () => {
  const rules = { ...KINGS_LOCKBOX_RULES, maximumRespins: 2 };
  const values = [
    0.94, 0.955, 0.965, ...Array(6).fill(0.1),
    0.975, ...Array(5).fill(0.1),
    ...Array(5).fill(0.1)
  ];
  const result = resolveKingsLockboxPull(rules, sequence(values));
  assert.equal(values.length, 0);
  assert.equal(result.frames.length, 3);
  assert.equal(result.respinsUsed, 2);
  assert.equal(result.remainingAttempts, 2);
  assert.equal(result.terminationReason, 'respin-cap');
  assert.deepEqual(result.lockedCells, [0, 1, 2, 3]);
});

test('rejects malformed Lockbox rules and randomness', () => {
  assert.throws(() => validateKingsLockboxRules({
    ...KINGS_LOCKBOX_RULES,
    collectibleItemIds: [1560, 1555, 1566, 1570, 1577, 1582]
  }), /collectible symbols/);
  assert.throws(() => validateKingsLockboxRules({
    ...KINGS_LOCKBOX_RULES, maximumRespins: 25
  }), /maximum respins/);
  assert.throws(() => validateKingsLockboxRules({
    ...KINGS_LOCKBOX_RULES,
    payoutMultipliersByItemId: { ...KINGS_LOCKBOX_RULES.payoutMultipliersByItemId, 1554: 1 }
  }), /Lockbox payouts/);
  assert.throws(() => validateKingsLockboxRules({
    ...KINGS_LOCKBOX_RULES,
    symbolWeightsByItemId: Object.fromEntries(
      KINGS_LOCKBOX_RULES.symbolItemIds.map((itemId) => [itemId, Number.MAX_SAFE_INTEGER])
    )
  }), /symbol weight is too large/);
  assert.throws(() => resolveKingsLockboxPull(KINGS_LOCKBOX_RULES, () => 1),
    /random source returned an invalid value/);
});
