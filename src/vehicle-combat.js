export function combatClass(rarity, classByRarity) {
  if (!Array.isArray(classByRarity)) throw new Error('Missing combat class rules.');
  const value = Number(classByRarity[Number(rarity)]);
  if (!Number.isFinite(value)) throw new Error(`Missing combat class for rarity ${rarity}.`);
  return value;
}

export function combatRarities(rarity, classByRarity) {
  const targetClass = combatClass(rarity, classByRarity);
  return classByRarity.map((entry, index) => ({ entry, index }))
    .filter(({ entry }) => Number(entry) === targetClass).map(({ index }) => index);
}

export function armsRarities(rarity, rules) {
  if (!Array.isArray(rules?.arms_rarities_by_vehicle_rarity)) {
    throw new Error('Missing vehicle arms compatibility rules.');
  }
  const rarities = rules.arms_rarities_by_vehicle_rarity[Number(rarity)];
  if (!Array.isArray(rarities)) throw new Error(`Missing vehicle arms rule for rarity ${rarity}.`);
  return rarities;
}

export function cargoRarities(rarity, rules) {
  if (!Array.isArray(rules?.cargo_rarities_by_vehicle_rarity)) {
    throw new Error('Missing vehicle cargo compatibility rules.');
  }
  const rarities = rules.cargo_rarities_by_vehicle_rarity[Number(rarity)];
  if (!Array.isArray(rarities)) throw new Error(`Missing vehicle cargo rule for rarity ${rarity}.`);
  return rarities;
}

export function compatibleCargoAllowed({
  routeType, aircraftType = null, vehicleRarity,
  itemId = null, itemRarity, mineTypeId = null,
  isVehicle = false, isAmmoBox = false, isWeapon = false,
  isCannonball = false, isBomb = false
}, rules) {
  const routeTypes = rules?.route_type_ids;
  const aircraftRoles = rules?.aircraft_role_ids;
  if (!routeTypes || !aircraftRoles || !Array.isArray(rules?.fishing_mine_type_ids)
    || !Array.isArray(rules?.fishing_cargo_extra_rarities)
    || !Array.isArray(rules?.oil_cargo_vehicle_rarities)) {
    throw new Error('Missing vehicle role or fishing cargo mappings.');
  }
  if (Number(routeType) === Number(routeTypes.air)) {
    return Number(aircraftType) === Number(aircraftRoles.bomber) && isBomb;
  }

  const arms = armsRarities(vehicleRarity, rules);
  const cargo = cargoRarities(vehicleRarity, rules);
  if ((isVehicle || isAmmoBox) && !(itemRarity === 0 && cargo.includes(0))) return false;
  const weaponClass = arms.includes(itemRarity)
    && (isWeapon || (Number(routeType) === Number(routeTypes.sea) && isCannonball));
  const cargoClass = cargo.includes(itemRarity)
    || (rules.oil_cargo_vehicle_rarities.includes(vehicleRarity)
      && Number(itemId) === Number(rules.oil_item_id));
  const fishingItem = Number(routeType) === Number(routeTypes.sea)
    && rules.fishing_mine_type_ids.includes(Number(mineTypeId))
    && (cargoClass || rules.fishing_cargo_extra_rarities.includes(itemRarity));
  return cargoClass || weaponClass || fishingItem;
}

export function seededRandom(...values) {
  let state = 0x811c9dc5;
  for (const value of values.join(':')) {
    state ^= value.charCodeAt(0);
    state = Math.imul(state, 0x01000193);
  }
  return () => {
    state += 0x6d2b79f5;
    let result = state;
    result = Math.imul(result ^ result >>> 15, result | 1);
    result ^= result + Math.imul(result ^ result >>> 7, result | 61);
    return ((result ^ result >>> 14) >>> 0) / 4294967296;
  };
}

function activeVehicle(aggressive, source) {
  return {
    aggressive: Boolean(aggressive),
    baseAggressive: Boolean(aggressive),
    attack: Math.max(0, Number(source.attack)),
    armor: Math.max(0, Number(source.armor)),
    baseArmor: Math.max(0, Number(source.armor)),
    offense: Math.max(0, Number(source.offense)),
    defense: Math.max(0, Number(source.defense)),
    dodge: Math.max(0, Number(source.dodge))
  };
}

function offense(vehicle, opponentDodge) {
  return vehicle.aggressive ? Math.max(0, vehicle.offense - opponentDodge) : 0;
}

function defense(vehicle, opponentDodge) {
  return vehicle.aggressive ? 0 : Math.max(0, vehicle.defense - opponentDodge);
}

function attack(vehicle, opponentDodge) {
  return offense(vehicle, opponentDodge) + vehicle.attack;
}

export function fightLand(stats1, aggressive1, stats2, aggressive2, random = Math.random, rules) {
  if (!rules) throw new Error('Missing land combat rules.');
  const vehicles = [activeVehicle(aggressive1, stats1), activeVehicle(aggressive2, stats2)];
  if (!vehicles.some((vehicle, index) => attack(vehicle, vehicles[(index + 1) % 2].dodge) > 0)) {
    return { winner: 0, rounds: 0, finalBlow: 0, ending: vehicles, roundLog: [] };
  }
  const alternate = vehicles[0].aggressive && vehicles[1].aggressive;
  let active = random() < 0.5 ? 0 : 1;
  let rounds = 0;
  let finalBlow = 0;
  const roundLog = [];
  while (vehicles[0].armor > 0 && vehicles[1].armor > 0
    && rounds < Number(rules.land_combat_max_rounds)) {
    rounds += 1;
    if (alternate) {
      vehicles[active].aggressive = false;
      active = (active + 1) % 2;
      vehicles[active].aggressive = vehicles[active].baseAggressive;
    }
    const before = vehicles.map((vehicle) => ({
      attack: vehicle.attack, armor: vehicle.armor, aggressive: vehicle.aggressive
    }));
    const reductions = [];
    for (let side = 0; side < 2; side += 1) {
      const opponent = (side + 1) % 2;
      const attackBefore = vehicles[opponent].attack;
      const reduced = Math.max(Number(rules.land_combat_minimum_attack), vehicles[opponent].attack
        - defense(vehicles[side], vehicles[opponent].dodge));
      vehicles[opponent].attack = Math.min(vehicles[opponent].attack, reduced);
      reductions.push({ side, opponent, attackBefore, attackAfter: vehicles[opponent].attack });
    }
    const order = vehicles[0].aggressive ? [0, 1] : [1, 0];
    const blows = [];
    for (const side of order) {
      const opponent = (side + 1) % 2;
      const blow = attack(vehicles[side], vehicles[opponent].dodge);
      if (blow > 0) finalBlow = blow;
      const armorBefore = vehicles[opponent].armor;
      vehicles[opponent].armor = Math.max(0, vehicles[opponent].armor - blow);
      blows.push({ side, opponent, damage: blow, armorBefore,
        armorAfter: vehicles[opponent].armor });
      if (vehicles[opponent].armor === 0) break;
    }
    roundLog.push({ round: rounds, before, reductions, blows,
      after: vehicles.map((vehicle) => ({
        attack: vehicle.attack, armor: vehicle.armor, aggressive: vehicle.aggressive
      })) });
  }
  const alive = vehicles.map((vehicle) => vehicle.armor > 0);
  const winner = alive[0] === alive[1] ? 0 : alive[0] ? 1 : 2;
  return { winner, rounds, finalBlow, ending: vehicles, roundLog };
}

export function expectedValue(difference, table) {
  if (!Array.isArray(table) || table.length < 2) {
    throw new Error('Missing vehicle rating expectation rules.');
  }
  const points = table.map((entry, index) => {
    if (!Array.isArray(entry) || entry.length !== 2) {
      throw new Error(`Invalid vehicle rating expectation point ${index}.`);
    }
    const threshold = Number(entry[0]);
    const expectation = Number(entry[1]);
    if (!Number.isFinite(threshold) || threshold < 0
      || !Number.isFinite(expectation) || expectation < 0 || expectation > 1) {
      throw new Error(`Invalid vehicle rating expectation point ${index}.`);
    }
    return [threshold, expectation];
  });
  if (points[0][0] !== 0
    || points.some((entry, index) => index > 0 && entry[0] <= points[index - 1][0])) {
    throw new Error('Vehicle rating expectation thresholds must start at zero and increase.');
  }
  const absolute = Math.abs(difference);
  let expected;
  if (absolute >= points.at(-1)[0]) {
    expected = points.at(-1)[1];
  } else {
    const upperIndex = points.findIndex((entry) => entry[0] > absolute);
    const previous = points[upperIndex - 1];
    const current = points[upperIndex];
    const portion = (absolute - previous[0]) / (current[0] - previous[0]);
    expected = previous[1] + portion * (current[1] - previous[1]);
  }
  if (difference > 0) expected = 1 - expected;
  return expected;
}

export function ratingPair(rating1, rating2, winner, table, kFactor) {
  if (!Number.isFinite(Number(kFactor))) throw new Error('Missing vehicle rating K factor.');
  const score1 = winner === 1 ? 1 : winner === 2 ? 0 : 0.5;
  const expectation1 = expectedValue(rating2 - rating1, table);
  return [
    rating1 + kFactor * (score1 - expectation1),
    rating2 + kFactor * ((1 - score1) - (1 - expectation1))
  ];
}

export function fightShips(ship1, aggressive1, ship2, aggressive2, random = Math.random,
  ammoRules, combatRules) {
  if (!ammoRules || typeof ammoRules !== 'object') throw new Error('Missing ammunition rules.');
  if (!combatRules) throw new Error('Missing ship combat rules.');
  if (!combatRules.ship_cannon_rounds_by_rate
    || typeof combatRules.ship_cannon_rounds_by_rate !== 'object') {
    throw new Error('Missing ship cannon firing-round rules.');
  }
  const criticalDamageMultiplier = Number(combatRules.ship_critical_damage_multiplier);
  const unarmedCrewStrength = Number(combatRules.ship_unarmed_crew_strength);
  if (!Number.isFinite(criticalDamageMultiplier) || criticalDamageMultiplier < 0
    || !Number.isFinite(unarmedCrewStrength) || unarmedCrewStrength < 0) {
    throw new Error('Invalid ship critical or crew-strength rules.');
  }
  const ships = [structuredClone(ship1), structuredClone(ship2)];
  for (const [index, ship] of ships.entries()) {
    const critChance = Number(ship.critChance);
    if (!Number.isFinite(critChance) || critChance < 0 || critChance > 1) {
      throw new Error(`Invalid ship critical-hit chance for side ${index + 1}.`);
    }
    ship.critChance = critChance;
  }
  const starting = structuredClone(ships);
  const aggressions = [Boolean(aggressive1), Boolean(aggressive2)];
  const shots = [[], []];
  const portalRounds = [];
  let winner = 0;
  let chainEscape = false;
  const portals = Math.max(ships[0].cannons.length, ships[1].cannons.length);
  outer: for (let round = 1; round <= Number(combatRules.ship_cannon_rounds); round += 1) {
    for (let portal = 1; portal <= portals; portal += 1) {
      const reports = [{ hull: 0, speed: 0, crew: 0 }, { hull: 0, speed: 0, crew: 0 }];
      const before = ships.map((ship) => ({ hull: ship.hull, speed: ship.speed, crew: ship.crew }));
      const fired = [null, null];
      for (let side = 0; side < 2; side += 1) {
        const cannon = ships[side].cannons.find((entry) => entry.portal === portal);
        if (!cannon) continue;
        const firingRounds = combatRules.ship_cannon_rounds_by_rate[cannon.rateOfFire];
        if (!Array.isArray(firingRounds)) {
          throw new Error(`Missing ship firing-round rule for rate ${cannon.rateOfFire}.`);
        }
        if (!firingRounds.includes(round)) continue;
        const available = Object.entries(ammoRules).filter(([, ammo]) => ships[side][ammo.field] > 0);
        const total = available.reduce((sum, [, ammo]) => sum + ships[side][ammo.field], 0);
        if (!total) continue;
        let pick = Math.floor(random() * total) + 1;
        let type = Number(available[0][0]);
        for (const [candidate, ammo] of available) {
          pick -= ships[side][ammo.field];
          if (pick <= 0) { type = Number(candidate); break; }
        }
        const ammo = ammoRules[type];
        ships[side][ammo.field] -= 1;
        let damage = Math.floor(cannon.damage);
        if (random() < cannon.damage - damage) damage += 1;
        if (random() < ships[side].critChance) damage *= criticalDamageMultiplier;
        const hit = random() < ammo.accuracy;
        if (hit) reports[side][ammo.damageField] = damage;
        const shot = { round, portal, cannonId: cannon.id, cannonName: cannon.name,
          cannonRarity: cannon.rarity, rateOfFire: cannon.rateOfFire, cannonDamage: cannon.damage,
          type, damageField: ammo.damageField, hit, damage };
        shots[side].push(shot);
        fired[side] = shot;
      }
      for (let side = 0; side < 2; side += 1) {
        const incoming = reports[(side + 1) % 2];
        ships[side].hull = Math.max(0, ships[side].hull - incoming.hull);
        ships[side].speed = Math.max(0, ships[side].speed - incoming.speed);
        ships[side].crew = Math.max(0, ships[side].crew - incoming.crew);
      }
      const after = ships.map((ship) => ({ hull: ship.hull, speed: ship.speed, crew: ship.crew }));
      for (let side = 0; side < 2; side += 1) {
        if (!fired[side]) continue;
        const opponent = (side + 1) % 2;
        fired[side].targetBefore = before[opponent];
        fired[side].targetAfter = after[opponent];
      }
      if (fired.some(Boolean)) portalRounds.push({ round, portal, before, after,
        shots: fired.map((shot) => shot ? { ...shot } : null) });
      if (!ships[0].hull || !ships[1].hull) {
        winner = !ships[0].hull && !ships[1].hull ? 0 : !ships[0].hull ? 2 : 1;
        break outer;
      }
      if (aggressions[0] !== aggressions[1]) {
        const aggressor = aggressions[0] ? 0 : 1;
        const defender = (aggressor + 1) % 2;
        const aggressorSailsDamaged = ships[aggressor].speed < starting[aggressor].speed;
        if (aggressorSailsDamaged
          && ships[aggressor].speed * Number(combatRules.ship_chain_escape_speed_ratio)
          < ships[defender].speed) {
          winner = defender + 1;
          chainEscape = true;
          break outer;
        }
      }
    }
  }
  const cannonPhaseEnding = ships.map((ship) => ({
    hull: ship.hull, speed: ship.speed, crew: ship.crew
  }));
  const cannonPhaseCrew = ships.map((ship) => ship.crew);
  const casualties = [[], []];
  const boardingRounds = [];
  if (!winner && ships[0].hull && ships[1].hull && !chainEscape) {
    const crews = ships.map((ship) => {
      const weapons = [...ship.crewWeapons].sort((a, b) =>
        (b?.strength ?? unarmedCrewStrength) - (a?.strength ?? unarmedCrewStrength));
      return Array.from({ length: ship.crew }, (_, index) => weapons[index] ?? null);
    });
    for (let round = 1; round <= Number(combatRules.ship_boarding_max_rounds); round += 1) {
      const strength = crews.map((crew) => crew.reduce(
        (sum, weapon) => sum + (weapon?.strength ?? unarmedCrewStrength), 0));
      if (!strength[0] && !strength[1]) break;
      const boardingRatio = Number(combatRules.ship_boarding_strength_ratio);
      if (strength[0] >= strength[1] * boardingRatio) {
        boardingRounds.push({ round, strength, winner: 1, casualtySide: null });
        winner = 1; break;
      }
      if (strength[1] >= strength[0] * boardingRatio) {
        boardingRounds.push({ round, strength, winner: 2, casualtySide: null });
        winner = 2; break;
      }
      const indices = crews.map((crew) => Math.floor(random() * crew.length));
      const powers = indices.map(
        (index, side) => crews[side][index]?.strength ?? unarmedCrewStrength);
      const loser = powers[0] === powers[1] ? (random() < 0.5 ? 0 : 1) : powers[0] > powers[1] ? 1 : 0;
      const [lost] = crews[loser].splice(indices[loser], 1);
      const casualty = { round, weaponId: lost?.id ?? null, weaponName: lost?.name ?? null,
        rarity: lost?.rarity ?? null };
      casualties[loser].push(casualty);
      boardingRounds.push({ round, strength, winner: 0, casualtySide: loser + 1,
        weaponId: casualty.weaponId, weaponName: casualty.weaponName,
        rarity: casualty.rarity });
    }
    ships[0].crew = crews[0].length;
    ships[1].crew = crews[1].length;
  }
  return { winner, ships, starting, shots, portalRounds, cannonPhaseEnding,
    cannonPhaseCrew, boardingRounds, casualties, chainEscape };
}
