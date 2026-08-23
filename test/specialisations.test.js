import assert from 'node:assert/strict';
import test from 'node:test';
import {
  specialisationBonus, specialisationMultiplier,
  travelCombatBonuses, travelSpeedMultiplier
} from '../src/specialisations.js';
import { loadLegacyCatalog } from '../src/legacy-catalog.js';

const SPECIALISATIONS = loadLegacyCatalog().specialisations;

test('defines every profession as a bonus-only specialisation without Banker', () => {
  assert.deepEqual(SPECIALISATIONS.map((entry) => entry.id), [...Array(11).keys()]);
  assert.equal(SPECIALISATIONS.some((entry) => entry.name === 'Banker'), false);
  const bonusKeys = Object.keys(SPECIALISATIONS[0].bonuses);
  assert.ok(bonusKeys.length > 0);
  for (const entry of SPECIALISATIONS) {
    assert.deepEqual(Object.keys(entry.bonuses), bonusKeys);
    assert.ok(Object.values(entry.bonuses).some((value) => value === 0.2));
    for (const key of bonusKeys) {
      const expected = entry.bonuses[key];
      assert.ok(expected === 0 || expected === 0.2);
      assert.equal(specialisationBonus(entry.id, key, SPECIALISATIONS), expected);
      assert.equal(specialisationMultiplier(entry.id, key, SPECIALISATIONS), 1 + expected);
    }
  }
});

test('applies travel bonuses only to the matching route, load, and order snapshot', () => {
  assert.equal(travelSpeedMultiplier(1, 'land', true, SPECIALISATIONS), 1.2);
  assert.equal(travelSpeedMultiplier(1, 'land', false, SPECIALISATIONS), 1);
  assert.equal(travelSpeedMultiplier(4, 'sea', true, SPECIALISATIONS), 1.2);
  assert.equal(travelSpeedMultiplier(10, 'air', false, SPECIALISATIONS), 1.2);
  assert.deepEqual(travelCombatBonuses(2, 'land', 'pillage', SPECIALISATIONS), { offense: 0.2, defense: 0 });
  assert.deepEqual(travelCombatBonuses(3, 'land', 'patrol', SPECIALISATIONS), { offense: 0, defense: 0.2 });
  assert.deepEqual(travelCombatBonuses(5, 'sea', 'pillage', SPECIALISATIONS), { offense: 0.2, defense: 0 });
  assert.deepEqual(travelCombatBonuses(6, 'sea', 'patrol', SPECIALISATIONS), { offense: 0, defense: 0.2 });
  assert.deepEqual(travelCombatBonuses(2, 'land', 'peaceful', SPECIALISATIONS), { offense: 0, defense: 0 });
  assert.throws(() => travelSpeedMultiplier(1, 'land', true), /Missing catalog specialisation data/);
});
