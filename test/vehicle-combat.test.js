import assert from 'node:assert/strict';
import test from 'node:test';
import { expectedValue, fightShips, ratingPair } from '../src/vehicle-combat.js';
import { loadLegacyCatalog } from '../src/legacy-catalog.js';

test('requires database-supplied vehicle rating and ammunition rules', () => {
  assert.throws(() => expectedValue(0), /Missing vehicle rating expectation rules/);
  assert.throws(() => expectedValue(50, [[0, 0.5], [0, 0.6]]),
    /thresholds must start at zero and increase/);
  assert.throws(() => expectedValue(50, [[0, 0.5], [100, 1.5]]),
    /Invalid vehicle rating expectation point/);
  assert.throws(() => ratingPair(1600, 1600, 0, [[0, 0.5], [1000, 1]]),
    /Missing vehicle rating K factor/);
  assert.throws(() => fightShips({}, false, {}, false, () => 0.5, undefined, {}),
    /Missing ammunition rules/);
  const catalog = loadLegacyCatalog();
  const incompleteShip = {
    speed: 1, hull: 1, crew: 0, cannons: [], crewWeapons: [],
    massives: 0, chainShots: 0, grapeShots: 0
  };
  assert.throws(() => fightShips(incompleteShip, false, incompleteShip, false, () => 0.5,
    catalog.settings.ammunition_rules, catalog.settings), /critical-hit chance/);
});

test('uses the live cannon firing-round and critical-damage mappings', () => {
  const catalog = loadLegacyCatalog();
  const combatRules = {
    ...catalog.settings,
    ship_cannon_rounds_by_rate: { 1: [3] },
    ship_critical_damage_multiplier: 3
  };
  const ship = (armed) => ({
    speed: 10, hull: 100, crew: 1, massives: armed ? 3 : 0,
    chainShots: 0, grapeShots: 0,
    cannons: armed ? [{ id: 1, portal: 1, name: 'Test cannon', rarity: 1,
      damage: 1, rateOfFire: 1 }] : [],
    crewWeapons: [], critChance: armed ? 1 : 0
  });
  assert.throws(() => fightShips(ship(true), true, ship(false), true, () => 0,
    catalog.settings.ammunition_rules,
    { ...combatRules, ship_cannon_rounds_by_rate: {} }), /Missing ship firing-round rule/);
  const result = fightShips(ship(true), true, ship(false), true, () => 0,
    catalog.settings.ammunition_rules, combatRules);
  assert.deepEqual(result.shots[0].map((shot) => shot.round), [3]);
  assert.equal(result.shots[0][0].damage, 3);
});

test('fires rate-three cannons in every ship combat round', () => {
  const catalog = loadLegacyCatalog();
  const ship = (armed) => ({
    speed: 10, hull: 100, crew: 1, massives: armed ? 3 : 0,
    chainShots: 0, grapeShots: 0,
    cannons: armed ? [{ id: 1, portal: 1, name: 'Fast cannon', rarity: 1,
      damage: 1, rateOfFire: 3 }] : [],
    crewWeapons: [], critChance: 0
  });

  assert.deepEqual(catalog.settings.ship_cannon_rounds_by_rate[3], [1, 2, 3]);
  const result = fightShips(ship(true), true, ship(false), true, () => 0,
    catalog.settings.ammunition_rules, catalog.settings);
  assert.deepEqual(result.shots[0].map((shot) => shot.round), [1, 2, 3]);
});

test('records simultaneous cannon damage, running state, and mutual sinking', () => {
  const catalog = loadLegacyCatalog();
  const ammunition = {
    ...catalog.settings.ammunition_rules,
    1: { ...catalog.settings.ammunition_rules[1], accuracy: 1 }
  };
  const ship = () => ({
    speed: 10, hull: 1, crew: 1, massives: 1, chainShots: 0, grapeShots: 0,
    cannons: [{ id: 1, portal: 1, name: 'Test cannon', rarity: 1,
      damage: 1, rateOfFire: 3 }],
    crewWeapons: [], critChance: 0
  });
  const result = fightShips(ship(), true, ship(), false, () => 0,
    ammunition, catalog.settings);
  assert.equal(result.winner, 0);
  assert.deepEqual(result.ships.map((entry) => entry.hull), [0, 0]);
  assert.deepEqual(result.starting.map((entry) => entry.hull), [1, 1]);
  assert.equal(result.portalRounds.length, 1);
  assert.deepEqual(result.portalRounds[0].after.map((entry) => entry.hull), [0, 0]);
  assert.deepEqual(result.shots.map((shots) => shots[0].targetAfter.hull), [0, 0]);
});

test('records chain-shot escape after sail damage and crew losses before boarding', () => {
  const catalog = loadLegacyCatalog();
  const ammunition = {
    ...catalog.settings.ammunition_rules,
    2: { ...catalog.settings.ammunition_rules[2], accuracy: 1 },
    3: { ...catalog.settings.ammunition_rules[3], accuracy: 1 }
  };
  const unarmed = {
    speed: 10, hull: 20, crew: 1, massives: 0, chainShots: 0, grapeShots: 0,
    cannons: [], crewWeapons: [], critChance: 0
  };
  const chainDefender = {
    ...structuredClone(unarmed), chainShots: 1,
    cannons: [{ id: 2, portal: 1, name: 'Chain cannon', rarity: 1,
      damage: 2, rateOfFire: 3 }]
  };
  const escape = fightShips(unarmed, true, chainDefender, false, () => 0,
    ammunition, catalog.settings);
  assert.equal(escape.chainEscape, true);
  assert.equal(escape.winner, 2);
  assert.equal(escape.ships[0].speed, 8);
  assert.equal(escape.shots[1][0].damageField, 'speed');

  const grapeAttacker = {
    ...structuredClone(unarmed), grapeShots: 1,
    cannons: [{ id: 3, portal: 1, name: 'Grape cannon', rarity: 1,
      damage: 2, rateOfFire: 3 }]
  };
  const crewKill = fightShips(grapeAttacker, true, unarmed, false, () => 0,
    ammunition, catalog.settings);
  assert.equal(crewKill.cannonPhaseCrew[1], 0);
  assert.equal(crewKill.cannonPhaseEnding[1].crew, 0);
});
