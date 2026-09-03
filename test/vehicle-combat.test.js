import assert from 'node:assert/strict';
import test from 'node:test';
import {
  compatibleCargoAllowed, expectedValue, fightLand, fightShips, ratingPair
} from '../src/vehicle-combat.js';
import { loadLegacyCatalog } from '../src/legacy-catalog.js';

test('applies the optional vehicle cargo policy without changing standard compatibility', () => {
  const rules = {
    route_type_ids: { land: 1, sea: 2, air: 3 },
    aircraft_role_ids: { bomber: 1 },
    fishing_mine_type_ids: [],
    fishing_cargo_extra_rarities: [],
    oil_cargo_vehicle_rarities: [],
    oil_item_id: 8127,
    arms_rarities_by_vehicle_rarity: [[1]],
    cargo_rarities_by_vehicle_rarity: [[0, 6]]
  };
  const ordinaryCargo = {
    routeType: 2, vehicleRarity: 0, itemId: 99, itemRarity: 0
  };

  assert.equal(compatibleCargoAllowed(ordinaryCargo, rules), true);
  assert.equal(compatibleCargoAllowed({ ...ordinaryCargo, cargoPolicy: 'standard' }, rules), true);
  assert.equal(compatibleCargoAllowed({ ...ordinaryCargo, cargoPolicy: null }, rules), true);
  assert.equal(compatibleCargoAllowed({ ...ordinaryCargo, cargoPolicy: 'oil-only' }, rules), false);
  assert.equal(compatibleCargoAllowed({
    ...ordinaryCargo, itemId: rules.oil_item_id, itemRarity: 6, cargoPolicy: 'oil-only'
  }, rules), true);
  assert.equal(compatibleCargoAllowed({
    routeType: 3, aircraftType: 1, vehicleRarity: 0, itemId: 99, itemRarity: 0,
    isBomb: true, cargoPolicy: 'oil-only'
  }, rules), false);
  assert.equal(compatibleCargoAllowed({
    ...ordinaryCargo, itemId: 901, itemRarity: 6, isVehicle: true,
    cargoPolicy: 'any-item'
  }, rules), true);
  assert.equal(compatibleCargoAllowed({
    ...ordinaryCargo, itemId: 901, itemRarity: 6, isVehicle: true
  }, rules), true, 'a packed transport follows ordinary cargo rarity compatibility');
  assert.equal(compatibleCargoAllowed({
    ...ordinaryCargo, itemId: 902, itemRarity: 5, isVehicle: true
  }, rules), false, 'a packed transport cannot bypass carrier rarity compatibility');
  assert.equal(compatibleCargoAllowed({
    ...ordinaryCargo, itemId: 903, itemRarity: 6, isAmmoBox: true
  }, rules), false, 'ammunition boxes retain their special transport restriction');
  assert.throws(() => compatibleCargoAllowed({
    ...ordinaryCargo, cargoPolicy: 'anything-goes'
  }, rules), /Unknown vehicle cargo policy anything-goes/);
  assert.throws(() => compatibleCargoAllowed({
    ...ordinaryCargo, cargoPolicy: 'oil-only'
  }, { ...rules, oil_item_id: null }), /Missing oil cargo item mapping/);
});

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

test('vehicle reinforcement absorbs structural damage before it is destroyed', () => {
  const catalog = loadLegacyCatalog();
  const land = fightLand(
    { attack: 4, armor: 8, offense: 0, defense: 0, dodge: 0, reinforcement: 3 },
    true,
    { attack: 4, armor: 1, offense: 0, defense: 0, dodge: 0, reinforcement: 0 },
    true, () => 0, catalog.settings
  );
  const received = land.roundLog.flatMap((round) => round.blows)
    .find((blow) => blow.opponent === 0);
  assert.equal(received.absorbed, 3);
  assert.equal(received.penetratingDamage, 1);
  assert.equal(received.armorAfter, 7);
  assert.equal(land.ending[0].reinforcement, 0);

  const ammunition = {
    ...catalog.settings.ammunition_rules,
    1: { ...catalog.settings.ammunition_rules[1], accuracy: 1 }
  };
  const armed = {
    speed: 10, hull: 10, crew: 1, reinforcement: 2,
    massives: 1, chainShots: 0, grapeShots: 0,
    cannons: [{ id: 1, portal: 1, name: 'Test cannon', rarity: 1,
      damage: 3, rateOfFire: 1 }], crewWeapons: [], critChance: 0
  };
  const ships = fightShips(armed, true, structuredClone(armed), true, () => 0,
    ammunition, { ...catalog.settings, ship_cannon_rounds_by_rate: { 1: [1] } });
  assert.deepEqual(ships.ships.map((ship) => ship.reinforcement), [0, 0]);
  assert.deepEqual(ships.ships.map((ship) => ship.hull), [9, 9]);
  assert.deepEqual(ships.shots.map((shots) => shots[0].absorbed), [2, 2]);
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

test('requires in-battle sail damage before a faster defender can chain-escape', () => {
  const catalog = loadLegacyCatalog();
  const ammunition = {
    ...catalog.settings.ammunition_rules,
    1: { ...catalog.settings.ammunition_rules[1], accuracy: 0 }
  };
  const ship = (speed) => ({
    speed, hull: 20, crew: 1, massives: 3, chainShots: 0, grapeShots: 0,
    cannons: [{ id: 1, portal: 1, name: 'Test cannon', rarity: 1,
      damage: 2, rateOfFire: 3 }],
    crewWeapons: [], critChance: 0
  });

  const result = fightShips(ship(8), true, ship(10), false, () => 0,
    ammunition, catalog.settings);

  assert.equal(result.chainEscape, false);
  assert.deepEqual(result.shots.map((shots) => shots.length), [3, 3]);
  assert.ok(result.shots.flat().every((shot) => shot.type === 1 && !shot.hit));
  assert.deepEqual(result.cannonPhaseEnding.map((entry) => entry.speed), [8, 10]);
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
  assert.equal(escape.shots[1][0].type, 2);
  assert.equal(escape.shots[1][0].hit, true);
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
