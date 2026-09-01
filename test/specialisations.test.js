import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  specialisationBonus, specialisationMultiplier,
  travelCombatBonuses, travelSpeedMultiplier
} from '../src/specialisations.js';
import { loadLegacyCatalog } from '../src/legacy-catalog.js';
import { SqliteStore } from '../src/store.js';

const SPECIALISATIONS = loadLegacyCatalog().specialisations;

test('defines every profession as a bonus-only specialisation without Banker', () => {
  assert.deepEqual(SPECIALISATIONS.map((entry) => entry.id), [...Array(20).keys()]);
  assert.equal(SPECIALISATIONS.some((entry) => entry.name === 'Banker'), false);
  assert.deepEqual(SPECIALISATIONS.filter((entry) => entry.melds >= 60)
    .map((entry) => entry.melds), [60, 75, 90, 110, 130, 155, 180, 200, 216]);
  assert.equal(SPECIALISATIONS.at(-1).name, 'Meldwright');
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
  assert.ok(Object.values(SPECIALISATIONS.at(-1).bonuses).every((value) => value === 0.2));
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

test('migrates the prestige ladder into an existing catalog exactly once', (context) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'minethings-specialisations-'));
  const databaseFile = path.join(directory, 'game.sqlite');
  let store = new SqliteStore(databaseFile);
  context.after(() => {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  store.seedCatalog(loadLegacyCatalog());
  store.database.prepare(
    'DELETE FROM catalog_specialisation_bonuses WHERE specialisation_id >= 11'
  ).run();
  store.database.prepare('DELETE FROM catalog_specialisations WHERE id >= 11').run();
  store.database.exec('PRAGMA user_version = 116');
  store.close();

  store = new SqliteStore(databaseFile);
  assert.equal(store.database.prepare('PRAGMA user_version').get().user_version, 126);
  assert.deepEqual(store.loadCatalog().specialisations.slice(11).map((entry) => [
    entry.name, entry.melds
  ]), [
    ['Pit Boss', 60], ['Caravaneer', 75], ['Marshal', 90], ['Marauder', 110],
    ['Harpooner', 130], ['Foreman', 155], ['Storm Pilot', 180],
    ['Wayfinder', 200], ['Meldwright', 216]
  ]);
  assert.equal(store.database.prepare(`
    SELECT COUNT(*) AS count FROM catalog_specialisation_bonuses
    WHERE specialisation_id BETWEEN 11 AND 19
  `).get().count, 9 * Object.keys(SPECIALISATIONS[0].bonuses).length);
  store.close();

  store = new SqliteStore(databaseFile);
  assert.equal(store.loadCatalog().specialisations.length, 20);
});
