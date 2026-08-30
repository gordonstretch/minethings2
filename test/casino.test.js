import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evaluateCasinoGrid, resolveCasinoPull, resolveCasinoSpin, validateCasinoRules
} from '../src/casino.js';
import { LEGACY_CASINO_SLOT_RULES } from '../src/legacy-catalog.js';

test('scores every row, reel, and diagonal on a full ordinary Thing screen', () => {
  const result = evaluateCasinoGrid(Array(9).fill(2), LEGACY_CASINO_SLOT_RULES);
  assert.equal(result.jackpot, false);
  assert.equal(result.wins.length, 8);
  assert.equal(result.multiplier, 16);
  assert.deepEqual(result.winningCells, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
});

test('requires three explosives for a fixed match award and stacks completed lines', () => {
  const singletons = evaluateCasinoGrid(
    [277, 278, 2, 1434, 1464, 1494, 1524, 1554, 279],
    LEGACY_CASINO_SLOT_RULES
  );
  assert.equal(singletons.multiplier, 0,
    'different explosive types do not form a match');

  const pair = evaluateCasinoGrid(
    [278, 278, 2, 1434, 1464, 1494, 1524, 1554, 277],
    LEGACY_CASINO_SLOT_RULES
  );
  assert.equal(pair.wins.length, 0);
  assert.equal(pair.lineMultiplier, 0);
  assert.equal(pair.scatterMultiplier, 0);
  assert.equal(pair.multiplier, 0);

  const multipleMatches = evaluateCasinoGrid(
    [277, 277, 278, 278, 279, 277, 279, 278, 277],
    LEGACY_CASINO_SLOT_RULES
  );
  assert.deepEqual(multipleMatches.wins.map((win) => [win.itemId, win.count, win.multiplier]), [
    [277, 4, 1], [278, 3, 1]
  ]);
  assert.equal(multipleMatches.lineMultiplier, 0);
  assert.equal(multipleMatches.scatterMultiplier, 2);
  assert.equal(multipleMatches.multiplier, 2);

  const completedLine = evaluateCasinoGrid(
    [277, 277, 277, 2, 1434, 1464, 1494, 1524, 1554],
    LEGACY_CASINO_SLOT_RULES
  );
  assert.deepEqual(completedLine.wins.map((win) => [win.kind, win.multiplier]), [
    ['line', 3], ['scatter', 1]
  ]);
  assert.equal(completedLine.lineMultiplier, 3);
  assert.equal(completedLine.scatterMultiplier, 1);
  assert.equal(completedLine.multiplier, 4);
});

test('scores explosive matches and reserves the jackpot for nine BLU-82s', () => {
  const diagonal = evaluateCasinoGrid(
    [282, 2, 1434, 1464, 282, 1494, 1524, 1554, 282],
    LEGACY_CASINO_SLOT_RULES
  );
  assert.equal(diagonal.jackpot, false);
  assert.equal(diagonal.wins.length, 2);
  assert.equal(diagonal.wins[0].name, 'Downhill diagonal');
  assert.equal(diagonal.wins[1].name, '3 matching explosives');
  assert.equal(diagonal.multiplier, 81);

  const scatter = evaluateCasinoGrid(
    [277, 277, 2, 277, 1434, 277, 1464, 277, 1494],
    LEGACY_CASINO_SLOT_RULES
  );
  assert.equal(scatter.jackpot, false);
  assert.equal(scatter.wins.length, 1);
  assert.equal(scatter.wins[0].kind, 'scatter');
  assert.equal(scatter.wins[0].name, '5 matching explosives');
  assert.equal(scatter.lineMultiplier, 0);
  assert.equal(scatter.scatterMultiplier, 3);
  assert.equal(scatter.multiplier, 3);

  const jackpot = evaluateCasinoGrid(Array(9).fill(282), LEGACY_CASINO_SLOT_RULES);
  assert.equal(jackpot.jackpot, true);
  assert.equal(jackpot.wins.length, 9);
  assert.equal(jackpot.lineMultiplier, 640);
  assert.equal(jackpot.scatterMultiplier, 400);
  assert.equal(jackpot.jackpotMultiplier, 1000);
  assert.equal(jackpot.multiplier, 2040);
});

test('resolves the published jackpot trigger and rejects malformed randomness', () => {
  const jackpot = resolveCasinoSpin(LEGACY_CASINO_SLOT_RULES, () => 0);
  assert.equal(jackpot.forcedJackpot, true);
  assert.equal(jackpot.multiplier, 2040);
  assert.deepEqual(jackpot.grid, Array(9).fill(282));
  assert.throws(() => resolveCasinoSpin(LEGACY_CASINO_SLOT_RULES, () => 1),
    /random source returned an invalid value/);
  assert.throws(() => validateCasinoRules({
    ...LEGACY_CASINO_SLOT_RULES, explosiveSmallMatchMultiplier: 0
  }), /small explosive match multiplier/);
  assert.throws(() => validateCasinoRules({ ...LEGACY_CASINO_SLOT_RULES, paylines: [] }),
    /at least one payline/);
  assert.throws(() => validateCasinoRules({
    ...LEGACY_CASINO_SLOT_RULES, explosiveSmallMatchMinimum: 1
  }), /small explosive match minimum/);
  assert.throws(() => validateCasinoRules({
    ...LEGACY_CASINO_SLOT_RULES, explosiveSmallMatchMinimum: 5
  }), /must stay below scatter payouts/);
});

test('stacks multiple bonus symbols into bounded free respins and pull-wide winnings', () => {
  const values = [
    0.5, 0.98, 0.988, 0.996, ...Array(6).fill(0.01),
    ...Array.from({ length: 4 }, () => [0.5, ...Array(9).fill(0.01)]).flat()
  ];
  const result = resolveCasinoPull(LEGACY_CASINO_SLOT_RULES, () => {
    assert.ok(values.length, 'the pull should not request excess randomness');
    return values.shift();
  });
  assert.equal(values.length, 0);
  assert.deepEqual(result.frames[0].grid.slice(0, 3), [
    'shift-bell', 'twin-drill', 'golden-fuse'
  ]);
  assert.equal(result.frames[0].bonusSymbols.length, 3);
  assert.equal(result.bonusSpinsAwarded, 4);
  assert.equal(result.frames.length, 5);
  assert.equal(result.baseMultiplier, 68);
  assert.equal(result.bonusWinMultiplier, 2);
  assert.equal(result.multiplier, 136);
});

test('lets a free respin award another free respin without extending past the cap', () => {
  const values = Array.from(
    { length: LEGACY_CASINO_SLOT_RULES.maximumBonusSpins + 1 },
    () => [0.5, 0.98, ...Array(8).fill(0.01)]
  ).flat();
  const result = resolveCasinoPull(LEGACY_CASINO_SLOT_RULES, () => {
    assert.ok(values.length, 'nested free respins must remain finite');
    return values.shift();
  });

  assert.equal(values.length, 0);
  assert.equal(result.frames.length, LEGACY_CASINO_SLOT_RULES.maximumBonusSpins + 1);
  assert.equal(result.bonusSpinsAwarded, LEGACY_CASINO_SLOT_RULES.maximumBonusSpins);
  assert.deepEqual(result.frames.map((frame) => frame.bonusSpinsAwarded), [
    ...Array(LEGACY_CASINO_SLOT_RULES.maximumBonusSpins).fill(1), 0
  ], 'each free respin can award the next one, but the final frame cannot exceed the cap');
});
