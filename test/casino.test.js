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

test('scores explosive matches and reserves the jackpot for nine BLU-82s', () => {
  const diagonal = evaluateCasinoGrid(
    [282, 2, 1434, 1464, 282, 1494, 1524, 1554, 282],
    LEGACY_CASINO_SLOT_RULES
  );
  assert.equal(diagonal.jackpot, false);
  assert.equal(diagonal.wins.length, 1);
  assert.equal(diagonal.wins[0].name, 'Downhill diagonal');
  assert.equal(diagonal.multiplier, 80);

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
  assert.throws(() => validateCasinoRules({ ...LEGACY_CASINO_SLOT_RULES, paylines: [] }),
    /at least one payline/);
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
  const values = [
    0.5, 0.98, ...Array(8).fill(0.01),
    0.5, 0.98, ...Array(8).fill(0.01),
    0.5, ...Array(9).fill(0.01)
  ];
  const result = resolveCasinoPull(LEGACY_CASINO_SLOT_RULES, () => {
    assert.ok(values.length, 'nested free respins must remain finite');
    return values.shift();
  });

  assert.equal(values.length, 0);
  assert.equal(result.frames.length, 3);
  assert.equal(result.bonusSpinsAwarded, 2);
  assert.equal(result.frames[0].bonusSpinsAwarded, 1);
  assert.equal(result.frames[1].bonusSpinsAwarded, 1,
    'the first free respin awards the second free respin');
  assert.equal(result.frames[2].bonusSpinsAwarded, 0);
});
