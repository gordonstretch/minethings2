import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createPlayer } from '../src/game.js';
import { SqliteStore, hashPassword } from '../src/store.js';
import { travelSpeedMultiplier } from '../src/specialisations.js';
import { armsRarities, combatClass } from '../src/vehicle-combat.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const execute = process.argv.includes('--execute');
const verbose = process.argv.includes('--verbose');
const waveArgument = process.argv.find((argument) => argument.startsWith('--wave='));
const wave = waveArgument ? Number(waveArgument.slice('--wave='.length)) : 1;
if (!Number.isSafeInteger(wave) || wave < 1 || wave > 99) {
  throw new Error('Wave must be a whole number from 1 to 99.');
}
const fightsArgument = process.argv.find(
  (argument) => argument.startsWith('--fights-per-permutation=')
);
const fightsPerPermutation = fightsArgument
  ? Number(fightsArgument.slice('--fights-per-permutation='.length)) : 5;
if (!Number.isSafeInteger(fightsPerPermutation)
  || fightsPerPermutation < 5 || fightsPerPermutation > 20) {
  throw new Error('Fights per permutation must be a whole number from 5 to 20.');
}
const databaseArgument = process.argv.find((argument) => argument.startsWith('--database='));
const databaseFile = databaseArgument
  ? path.resolve(databaseArgument.slice('--database='.length))
  : path.join(root, 'data', 'minethings.sqlite');
const exercisePrefix = wave === 1 ? 'War Trial' : `War Trial W${wave}`;
const exercisePlayerNames = [`${exercisePrefix} Red`, `${exercisePrefix} Blue`];
const exercisePlayerCapacityMargin = 5;
const now = Date.now();
const store = new SqliteStore(databaseFile, { busyTimeoutMs: 1000 });

const aggressionPermutations = Object.freeze([
  Object.freeze({
    key: 'aggressor-vs-defender', aggressive: [true, false],
    orders: ['pillage', 'peaceful'], aggressiveVsSentry: [false, false]
  }),
  Object.freeze({
    key: 'defender-vs-aggressor', aggressive: [false, true],
    orders: ['peaceful', 'pillage'], aggressiveVsSentry: [false, false]
  }),
  Object.freeze({
    key: 'mutual-aggression', aggressive: [true, true],
    orders: ['patrol', 'pillage'], aggressiveVsSentry: [true, true]
  })
]);

function setting(key) {
  return store.loadCatalog().settings[key];
}

function currentWeatherByCity() {
  return new Map(store.database.prepare(`
    SELECT catalog_cities.id AS city_id, world_maps.name AS map_name,
      world_weather_slots.condition
    FROM catalog_cities
    JOIN world_maps ON world_maps.id = catalog_cities.map_id
    JOIN world_event_clock ON world_event_clock.id = 1
    JOIN world_weather_slots ON world_weather_slots.map_id = world_maps.id
      AND world_weather_slots.slot_at = world_event_clock.last_slot_at
  `).all().map((row) => [Number(row.city_id), row]));
}

function activeHazards() {
  const creatures = store.database.prepare(`
    SELECT world_creatures.id, world_creatures.creature_type,
      world_creatures.rarity, world_creatures.hp, world_creatures.max_hp,
      world_creatures.location, world_creatures.destination_city_id,
      catalog_routes.id AS route_id, catalog_routes.type AS route_type,
      catalog_routes.length, catalog_routes.city1_id, catalog_routes.city2_id,
      city1.name AS city1_name, city2.name AS city2_name,
      world_maps.name AS map_name
    FROM world_creatures
    JOIN catalog_routes ON catalog_routes.id = world_creatures.route_id
    JOIN catalog_cities AS city1 ON city1.id = catalog_routes.city1_id
    JOIN catalog_cities AS city2 ON city2.id = catalog_routes.city2_id
    JOIN world_maps ON world_maps.id = world_creatures.map_id
    WHERE world_creatures.status = 'active'
    ORDER BY world_creatures.id
  `).all();
  const ghosts = store.database.prepare(`
    SELECT ghost_vehicles.id, ghost_vehicles.ghost_kind, ghost_vehicles.rarity,
      ghost_vehicles.route_id, ghost_vehicles.vehicle_id,
      player_vehicles.name, player_vehicles.status,
      player_vehicles.origin_city_id, player_vehicles.destination_city_id,
      player_vehicles.departed_at, player_vehicles.arrives_at,
      catalog_routes.type AS route_type, catalog_routes.length,
      catalog_routes.city1_id, catalog_routes.city2_id,
      city1.name AS city1_name, city2.name AS city2_name
    FROM ghost_vehicles
    JOIN player_vehicles ON player_vehicles.id = ghost_vehicles.vehicle_id
    JOIN catalog_routes ON catalog_routes.id = ghost_vehicles.route_id
    JOIN catalog_cities AS city1 ON city1.id = catalog_routes.city1_id
    JOIN catalog_cities AS city2 ON city2.id = catalog_routes.city2_id
    WHERE ghost_vehicles.defeated_at IS NULL AND ghost_vehicles.vehicle_id IS NOT NULL
    ORDER BY ghost_vehicles.id
  `).all();
  return { creatures, ghosts };
}

function plannedExercisePlayers() {
  const catalog = store.loadCatalog();
  const starterCityId = Number(setting('starter_city_id'));
  const starterCity = catalog.cities.find((city) => Number(city.id) === starterCityId);
  const profession = Number(setting('default_specialisation_id'));
  return exercisePlayerNames.map((name, index) => ({
    id: -(index + 1),
    name,
    city_id: starterCityId,
    city_name: starterCity?.name ?? `City ${starterCityId}`,
    authority: 0,
    created_at: now,
    profession,
    turbo_active: false,
    item_limit: 0,
    item_count: 0,
    vehicles: 0,
    traveling_vehicles: 0,
    exercise_vehicle_slots: Number.MAX_SAFE_INTEGER,
    exercise_vehicles: 0
  }));
}

function finalizeExercisePlayerCapacity(players) {
  for (const player of players) {
    player.item_limit = player.exercise_vehicles + exercisePlayerCapacityMargin;
    player.exercise_vehicle_slots = exercisePlayerCapacityMargin;
  }
}

function provisionExercisePlayers(players) {
  const existing = store.database.prepare(`
    SELECT id, name FROM players WHERE name IN (?, ?) ORDER BY id
  `).all(...exercisePlayerNames);
  if (existing.length) {
    throw new Error(`Dedicated exercise player already exists for wave ${wave}: ${
      existing.map((player) => player.name).join(', ')}. Use --wave=${nextExerciseWave()}.`);
  }
  const catalog = store.loadCatalog();
  for (const planned of players) {
    const player = createPlayer(
      planned.name,
      '',
      hashPassword(crypto.randomUUID()),
      catalog,
      now,
      () => 0.5
    );
    Object.assign(player, {
      description: `Dedicated automated combat exercise account for ${exercisePrefix}.`,
      itemLimit: planned.item_limit,
      publishFindings: false,
      showMines: false,
      mines: [],
      nextMineId: 1,
      inventory: {},
      inventoryByCity: { [player.cityId]: {} },
      discoveries: []
    });
    const saved = store.addPlayer(player);
    Object.assign(planned, {
      id: saved.id,
      city_id: saved.cityId,
      city_name: catalog.cities.find((city) => Number(city.id) === Number(saved.cityId))?.name
        ?? planned.city_name,
      created_at: saved.createdAt,
      profession: saved.profession,
      item_count: 0,
      vehicles: 0,
      traveling_vehicles: 0
    });
  }
}

function routeName(route) {
  return `${route.city1_name} - ${route.city2_name}`;
}

function quietCombatRoutes(routeType, count, hazards, weather) {
  const hazardousRoutes = new Set([
    ...hazards.creatures.map((entry) => Number(entry.route_id)),
    ...hazards.ghosts.map((entry) => Number(entry.route_id))
  ]);
  return store.database.prepare(`
    SELECT catalog_routes.*, city1.name AS city1_name,
      city2.name AS city2_name, world1.name AS map1_name, world2.name AS map2_name
    FROM catalog_routes
    JOIN catalog_cities AS city1 ON city1.id = catalog_routes.city1_id
    JOIN catalog_cities AS city2 ON city2.id = catalog_routes.city2_id
    JOIN world_maps AS world1 ON world1.id = city1.map_id
    JOIN world_maps AS world2 ON world2.id = city2.map_id
    WHERE catalog_routes.type = ? AND catalog_routes.is_open = 1
      AND catalog_routes.length > 0 AND catalog_routes.city1_id <> catalog_routes.city2_id
      AND NOT EXISTS (
        SELECT 1 FROM player_vehicles
        WHERE player_vehicles.route_id = catalog_routes.id
          AND player_vehicles.status = 'traveling'
      )
    ORDER BY catalog_routes.length, catalog_routes.id
  `).all(Number(routeType)).filter((route) => !hazardousRoutes.has(Number(route.id))
    && weather.get(Number(route.city1_id))?.condition !== 'snow'
    && weather.get(Number(route.city2_id))?.condition !== 'snow').slice(0, count);
}

function strongestVehicle(routeType, targetRarity) {
  const classRules = setting('combat_class_by_rarity');
  const targetClass = combatClass(targetRarity, classRules);
  return store.database.prepare(`
    SELECT catalog_vehicles.id AS vehicle_type_id, catalog_vehicles.item_id,
      catalog_vehicles.speed, catalog_vehicles.capacity, catalog_vehicles.route_type,
      catalog_items.name, catalog_items.rarity,
      catalog_lands.attack, catalog_lands.armor,
      catalog_ships.cannon_portals, catalog_ships.hull, catalog_ships.crew
    FROM catalog_vehicles
    JOIN catalog_items ON catalog_items.id = catalog_vehicles.item_id
    LEFT JOIN catalog_lands ON catalog_lands.vehicle_id = catalog_vehicles.id
    LEFT JOIN catalog_ships ON catalog_ships.vehicle_id = catalog_vehicles.id
    WHERE catalog_vehicles.route_type = ?
    ORDER BY catalog_items.rarity DESC,
      (COALESCE(catalog_ships.hull, 0) + COALESCE(catalog_ships.crew, 0)
       + COALESCE(catalog_lands.attack, 0) + COALESCE(catalog_lands.armor, 0)) DESC,
      catalog_vehicles.speed DESC, catalog_vehicles.id
  `).all(Number(routeType)).find((vehicle) => combatClass(vehicle.rarity, classRules)
    === targetClass);
}

function strongestVehicleForClass(routeType, classValue) {
  const classRules = setting('combat_class_by_rarity');
  return store.database.prepare(`
    SELECT catalog_vehicles.id AS vehicle_type_id, catalog_vehicles.item_id,
      catalog_vehicles.speed, catalog_vehicles.capacity, catalog_vehicles.route_type,
      catalog_items.name, catalog_items.rarity,
      catalog_lands.attack, catalog_lands.armor,
      catalog_ships.cannon_portals, catalog_ships.hull, catalog_ships.crew
    FROM catalog_vehicles
    JOIN catalog_items ON catalog_items.id = catalog_vehicles.item_id
    LEFT JOIN catalog_lands ON catalog_lands.vehicle_id = catalog_vehicles.id
    LEFT JOIN catalog_ships ON catalog_ships.vehicle_id = catalog_vehicles.id
    WHERE catalog_vehicles.route_type = ?
    ORDER BY catalog_items.rarity DESC,
      (COALESCE(catalog_ships.hull, 0) + COALESCE(catalog_ships.crew, 0)
       + COALESCE(catalog_lands.attack, 0) + COALESCE(catalog_lands.armor, 0)) DESC,
      catalog_vehicles.speed DESC, catalog_vehicles.id
  `).all(Number(routeType)).find((vehicle) =>
    combatClass(vehicle.rarity, classRules) === Number(classValue));
}

function ratingTiers(routeType, classValue) {
  return store.database.prepare(`
    SELECT rank, min_rating, max_rating FROM catalog_tiers
    WHERE route_type = ? AND combat_class = ? ORDER BY rank
  `).all(Number(routeType), Number(classValue)).map((tier) => ({
    rank: Number(tier.rank),
    rating: tier.min_rating !== null && tier.max_rating !== null
      ? Math.floor((Number(tier.min_rating) + Number(tier.max_rating)) / 2)
      : tier.min_rating !== null ? Number(tier.min_rating) : Number(tier.max_rating)
  }));
}

function playerTravelSpeed(player, routeBehavior, vehicle) {
  const turboBonus = player.turbo_active ? Number(setting('turbo_speed_bonus')) : 0;
  return (Number(vehicle.speed) + turboBonus) * travelSpeedMultiplier(
    Number(player.profession), routeBehavior, false, store.loadCatalog().specialisations
  );
}

function combatants(players, startIndex, permutation, routeBehavior, vehicle) {
  const rotated = [...players.slice(startIndex % players.length),
    ...players.slice(0, startIndex % players.length)];
  for (const first of rotated) {
    if (first.exercise_vehicle_slots < 1) continue;
    for (const second of rotated) {
      if (first.id === second.id || second.exercise_vehicle_slots < 1) continue;
      const firstSpeed = playerTravelSpeed(first, routeBehavior, vehicle);
      const secondSpeed = playerTravelSpeed(second, routeBehavior, vehicle);
      if (permutation.aggressive[0] && !permutation.aggressive[1]
        && firstSpeed < secondSpeed) continue;
      if (!permutation.aggressive[0] && permutation.aggressive[1]
        && secondSpeed < firstSpeed) continue;
      first.exercise_vehicle_slots -= 1;
      first.exercise_vehicles += 1;
      second.exercise_vehicle_slots -= 1;
      second.exercise_vehicles += 1;
      return [first, second];
    }
  }
  throw new Error(`No capacity-safe player pairing can guarantee ${permutation.key} combat.`);
}

function reserveHunter(players, startIndex) {
  for (let offset = 0; offset < players.length; offset += 1) {
    const player = players[(startIndex + offset) % players.length];
    if (player.exercise_vehicle_slots < 1) continue;
    player.exercise_vehicle_slots -= 1;
    player.exercise_vehicles += 1;
    return player;
  }
  throw new Error('The dedicated exercise players do not have enough capacity for every hunter.');
}

function strongestArm(vehicle, kind) {
  const allowed = armsRarities(vehicle.rarity, store.loadCatalog().settings);
  if (kind === 'cannon') {
    return store.database.prepare(`
      SELECT catalog_cannons.*, catalog_items.name, catalog_items.rarity
      FROM catalog_cannons
      JOIN catalog_items ON catalog_items.id = catalog_cannons.item_id
      ORDER BY (catalog_cannons.damage * catalog_cannons.rate_of_fire) DESC,
        catalog_cannons.damage DESC, catalog_cannons.id
    `).all().find((arm) => allowed.includes(arm.rarity));
  }
  return store.database.prepare(`
    SELECT catalog_weapons.*, catalog_items.name, catalog_items.rarity
    FROM catalog_weapons
    JOIN catalog_items ON catalog_items.id = catalog_weapons.item_id
    ORDER BY (catalog_weapons.offense + catalog_weapons.defense) DESC,
      catalog_weapons.offense DESC, catalog_weapons.id
  `).all().find((arm) => allowed.includes(arm.rarity));
}

function createPlan() {
  const weather = currentWeatherByCity();
  const hazards = activeHazards();
  const players = plannedExercisePlayers();
  const routeTypeIds = setting('route_type_ids');
  const combatRoutes = [
    { key: 'land', id: Number(routeTypeIds.land) },
    { key: 'sea', id: Number(routeTypeIds.sea) }
  ].map((type) => ({
    ...type,
    routes: quietCombatRoutes(type.id, fightsPerPermutation, hazards, weather)
  }));
  for (const type of combatRoutes) {
    if (type.routes.length < fightsPerPermutation) {
      throw new Error(`Only ${type.routes.length} quiet, snow-free ${type.key} routes are available; ${
        fightsPerPermutation} are required.`);
    }
  }
  const combatClasses = [...new Set(store.database.prepare(`
    SELECT combat_class FROM catalog_tiers
    WHERE route_type IN (?, ?) ORDER BY combat_class
  `).all(...combatRoutes.map((type) => type.id)).map((row) => Number(row.combat_class)))];
  const pvpFights = [];
  let playerIndex = 0;
  for (const type of combatRoutes) {
    for (const classValue of combatClasses) {
      const vehicle = strongestVehicleForClass(type.id, classValue);
      if (!vehicle) {
        throw new Error(`No ${type.key} vehicle exists for combat class ${classValue}.`);
      }
      const kind = type.key === 'sea' ? 'cannon' : 'weapon';
      const arm = strongestArm(vehicle, kind);
      if (!arm) {
        throw new Error(`No compatible ${kind} exists for ${vehicle.name}.`);
      }
      const tiers = ratingTiers(type.id, classValue);
      if (tiers.length !== 6 || tiers.some((tier, index) =>
        tier.rank !== index + 1 || !Number.isFinite(tier.rating))) {
        throw new Error(`Combat class ${classValue} ${type.key} ratings must define ranks 1 to 6.`);
      }
      for (const permutation of aggressionPermutations) {
        for (const tier of tiers) {
          const permutationKey = `${type.key}:class-${classValue}:rank-${tier.rank}:${
            permutation.key}`;
          for (let repetition = 1; repetition <= fightsPerPermutation; repetition += 1) {
            const [firstPlayer, secondPlayer] = combatants(
              players, playerIndex, permutation, type.key, vehicle
            );
            playerIndex += 2;
            pvpFights.push({
              permutationKey, routeType: type, classValue, tier, permutation, repetition,
              route: type.routes[repetition - 1], vehicle, arm, kind,
              first: {
                player: firstPlayer, cityId: Number(type.routes[repetition - 1].city1_id),
                order: permutation.orders[0],
                aggressiveVsSentry: permutation.aggressiveVsSentry[0]
              },
              second: {
                player: secondPlayer, cityId: Number(type.routes[repetition - 1].city2_id),
                order: permutation.orders[1],
                aggressiveVsSentry: permutation.aggressiveVsSentry[1]
              }
            });
          }
        }
      }
    }
  }
  const seaType = Number(setting('route_type_ids').sea);
  const hazardJobs = [];
  for (const creature of hazards.creatures) {
    const destination = Number(creature.destination_city_id);
    const alternate = destination === Number(creature.city1_id)
      ? Number(creature.city2_id) : Number(creature.city1_id);
    const cityId = weather.get(destination)?.condition !== 'snow' ? destination
      : weather.get(alternate)?.condition !== 'snow' ? alternate : null;
    if (!cityId) throw new Error(`${creature.creature_type} ${creature.id} is snowbound.`);
    const vehicle = strongestVehicle(creature.route_type, creature.rarity);
    if (!vehicle) throw new Error(`No compatible hunter exists for creature ${creature.id}.`);
    const kind = Number(creature.route_type) === seaType ? 'cannon' : 'weapon';
    for (let attempt = 1; attempt <= fightsPerPermutation; attempt += 1) {
      hazardJobs.push({
        hazardType: 'creature', hazard: creature,
        player: reserveHunter(players, playerIndex++),
        cityId, vehicle, arm: strongestArm(vehicle, kind), kind, attempt
      });
    }
  }
  for (const ghost of hazards.ghosts) {
    const preferred = Number(ghost.destination_city_id || ghost.city2_id);
    const alternate = preferred === Number(ghost.city1_id)
      ? Number(ghost.city2_id) : Number(ghost.city1_id);
    const cityId = weather.get(preferred)?.condition !== 'snow' ? preferred
      : weather.get(alternate)?.condition !== 'snow' ? alternate : null;
    if (!cityId) throw new Error(`${ghost.name} is snowbound.`);
    const vehicle = strongestVehicle(ghost.route_type, ghost.rarity);
    if (!vehicle) throw new Error(`No compatible hunter exists for ghost ${ghost.id}.`);
    const kind = Number(ghost.route_type) === seaType ? 'cannon' : 'weapon';
    for (let attempt = 1; attempt <= fightsPerPermutation; attempt += 1) {
      hazardJobs.push({
        hazardType: 'ghost', hazard: ghost,
        player: reserveHunter(players, playerIndex++),
        cityId, vehicle, arm: strongestArm(vehicle, kind), kind, attempt
      });
    }
  }
  finalizeExercisePlayerCapacity(players);
  return { weather, hazards, players, pvpFights, hazardJobs };
}

function grantVehicle(player, vehicle, cityId, name, arm, kind,
  rating = Number(setting('vehicle_starting_rating'))) {
  const inserted = store.database.prepare(`
    INSERT INTO player_vehicles
      (player_id, vehicle_type_id, item_id, city_id, name, rating)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(player.id, vehicle.vehicle_type_id, vehicle.item_id, cityId, name, rating);
  const vehicleId = Number(inserted.lastInsertRowid);
  store.database.prepare(
    'INSERT OR IGNORE INTO known_cities (player_id, city_id) VALUES (?, ?)'
  ).run(player.id, cityId);
  if (kind === 'cannon') {
    if (!arm) throw new Error(`No cannon is available for ${name}.`);
    const portals = Math.min(Number(vehicle.cannon_portals), Number(vehicle.capacity));
    const fit = store.database.prepare(`
      INSERT INTO player_ship_cannons (vehicle_id, cannon_id, portal)
      VALUES (?, ?, ?)
    `);
    for (let portal = 1; portal <= portals; portal += 1) fit.run(vehicleId, arm.id, portal);
    const shots = Math.max(0, Number(vehicle.capacity) - portals)
      * Number(setting('shots_per_crate'));
    store.database.prepare(`
      INSERT INTO player_ship_state
        (vehicle_id, crew, hull, massives, chain_shots, grape_shots,
         max_hull, docked_at)
      VALUES (?, ?, ?, ?, 0, 0, ?, ?)
    `).run(vehicleId, vehicle.crew, vehicle.hull, shots, vehicle.hull, now);
  } else {
    if (!arm) throw new Error(`No weapon is available for ${name}.`);
    const weaponCount = Math.max(1, Math.min(8, Number(vehicle.capacity)));
    const fit = store.database.prepare(
      'INSERT INTO player_vehicle_weapons (vehicle_id, weapon_id) VALUES (?, ?)'
    );
    for (let index = 0; index < weaponCount; index += 1) fit.run(vehicleId, arm.id);
  }
  return vehicleId;
}

function summary(plan) {
  const pvpPermutations = new Map();
  for (const fight of plan.pvpFights) {
    const entry = pvpPermutations.get(fight.permutationKey) ?? {
      key: fight.permutationKey,
      routeType: fight.routeType.key,
      combatClass: fight.classValue,
      ratingRank: fight.tier.rank,
      startingRating: fight.tier.rating,
      aggression: fight.permutation.aggressive,
      orders: fight.permutation.orders,
      vehicle: fight.vehicle.name,
      arm: fight.arm.name,
      fights: 0,
      routes: []
    };
    entry.fights += 1;
    if (!entry.routes.some((route) => route.id === fight.route.id)) {
      entry.routes.push({ id: fight.route.id, name: routeName(fight.route) });
    }
    pvpPermutations.set(fight.permutationKey, entry);
  }
  const hazardTargets = new Map();
  for (const job of plan.hazardJobs) {
    const key = `${job.hazardType}:${job.hazard.id}`;
    const entry = hazardTargets.get(key) ?? {
      type: job.hazardType,
      id: job.hazard.id,
      target: job.hazard.name ?? job.hazard.creature_type,
      rarity: Number(job.hazard.rarity),
      route: routeName(job.hazard),
      attempts: 0
    };
    entry.attempts += 1;
    hazardTargets.set(key, entry);
  }
  return {
    databaseFile,
    mode: execute ? 'execute' : 'dry-run',
    wave,
    exercisePrefix,
    fightsPerPermutation,
    coverage: {
      routeTypes: [...new Set(plan.pvpFights.map((fight) => fight.routeType.key))],
      combatClasses: [...new Set(plan.pvpFights.map((fight) => fight.classValue))],
      ratingRanks: [...new Set(plan.pvpFights.map((fight) => fight.tier.rank))],
      aggression: aggressionPermutations.map((entry) => ({
        key: entry.key, aggressive: entry.aggressive, orders: entry.orders
      })),
      permutations: pvpPermutations.size,
      pvpFights: plan.pvpFights.length,
      pvpVehicles: plan.pvpFights.length * 2,
      excluded: [
        'Aircraft: the combat planner deliberately excludes air routes.',
        'Peaceful versus peaceful: no fight is scheduled.'
      ],
      supplementalActiveHazardTargets: hazardTargets.size,
      supplementalHazardAttempts: plan.hazardJobs.length
    },
    players: plan.players.map((player) => ({
      id: player.id > 0 ? player.id : null, name: player.name, city: player.city_name,
      dedicated: true,
      inventory: `${player.item_count}/${player.item_limit}`,
      vehicles: player.vehicles, traveling: player.traveling_vehicles,
      exerciseVehicles: player.exercise_vehicles,
      remainingExerciseSlots: player.exercise_vehicle_slots
    })),
    pvpPermutations: verbose ? [...pvpPermutations.values()] : undefined,
    hazards: {
      creatures: plan.hazards.creatures.map((hazard) => ({
        id: hazard.id, type: hazard.creature_type, rarity: hazard.rarity,
        hp: `${hazard.hp}/${hazard.max_hp}`, route: routeName(hazard)
      })),
      ghosts: plan.hazards.ghosts.map((hazard) => ({
        id: hazard.id, name: hazard.name, kind: hazard.ghost_kind,
        rarity: hazard.rarity, route: routeName(hazard), status: hazard.status
      }))
    },
    hazardTargets: [...hazardTargets.values()]
  };
}

function existingExerciseVehicles() {
  const namePrefix = `${exercisePrefix} `;
  return store.database.prepare(`
    SELECT id, name, status FROM player_vehicles
    WHERE name LIKE ? ORDER BY id
  `).all(`${namePrefix}%`).filter((vehicle) =>
    /^\d+$/.test(vehicle.name.slice(namePrefix.length)));
}

function nextExerciseWave() {
  const waves = store.database.prepare(`
    SELECT name FROM player_vehicles WHERE name LIKE 'War Trial %'
    UNION ALL
    SELECT name FROM players WHERE name LIKE 'War Trial %'
  `).all().map(({ name }) => {
    const match = /^War Trial(?: W(\d+))? (?:\d+|Red|Blue)$/.exec(name);
    return match ? Number(match[1] ?? 1) : 0;
  });
  return Math.max(0, ...waves) + 1;
}

try {
  if (execute) {
    const existing = existingExerciseVehicles();
    if (existing.length) {
      throw new Error(`${existing.length} existing vehicles belong to wave ${wave} (${
        exercisePrefix}). Use --wave=${nextExerciseWave()} to create the next wave.`);
    }
    store.settleWorldEvents(now);
  }
  const plan = createPlan();
  if (execute) provisionExercisePlayers(plan.players);
  const output = summary(plan);
  if (!execute) {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    process.exitCode = 0;
  } else {
    const pvpLaunches = new Map();
    const hazardLaunches = [];
    let sequence = 1;
    for (const fight of plan.pvpFights) {
      const firstId = grantVehicle(fight.first.player, fight.vehicle, fight.first.cityId,
        `${exercisePrefix} ${sequence++}`, fight.arm, fight.kind, fight.tier.rating);
      const secondId = grantVehicle(fight.second.player, fight.vehicle, fight.second.cityId,
        `${exercisePrefix} ${sequence++}`, fight.arm, fight.kind, fight.tier.rating);
      store.sendVehicle(
        fight.first.player.id, firstId, fight.route.id, now, {
          travelOrder: fight.first.order,
          aggressiveVsSentry: fight.first.aggressiveVsSentry
        }
      );
      store.sendVehicle(
        fight.second.player.id, secondId, fight.route.id, now, {
          travelOrder: fight.second.order,
          aggressiveVsSentry: fight.second.aggressiveVsSentry
        }
      );
      const encounter = store.database.prepare(`
        SELECT id, encounter_at, encounter_location, status
        FROM vehicle_encounters
        WHERE status = 'planned' AND route_id = ?
          AND ((vehicle1_id = ? AND vehicle2_id = ?)
            OR (vehicle1_id = ? AND vehicle2_id = ?))
        ORDER BY id DESC LIMIT 1
      `).get(fight.route.id, firstId, secondId, secondId, firstId);
      if (!encounter) {
        throw new Error(`No ${fight.permutationKey} fight ${fight.repetition} was planned on ${
          routeName(fight.route)}.`);
      }
      const aggregate = pvpLaunches.get(fight.permutationKey) ?? {
        key: fight.permutationKey,
        count: 0,
        firstVehicleId: firstId,
        lastVehicleId: secondId,
        encounterIds: []
      };
      aggregate.count += 1;
      aggregate.lastVehicleId = secondId;
      aggregate.encounterIds.push(Number(encounter.id));
      pvpLaunches.set(fight.permutationKey, aggregate);
    }
    if (pvpLaunches.size !== output.coverage.permutations
      || [...pvpLaunches.values()].some((entry) => entry.count < fightsPerPermutation)) {
      throw new Error('The launched PvP matrix does not satisfy its permutation coverage.');
    }
    for (const job of plan.hazardJobs) {
      const vehicleId = grantVehicle(job.player, job.vehicle, job.cityId,
        `${exercisePrefix} ${sequence++}`, job.arm, job.kind);
      if (job.hazardType === 'creature') {
        const pursuit = store.attackWorldCreature(job.player.id, job.hazard.id, vehicleId, now);
        hazardLaunches.push({
          kind: 'creature-hunt', attempt: job.attempt,
          target: job.hazard.creature_type,
          targetId: job.hazard.id, player: job.player.name, vehicleId,
          pursuitId: pursuit.pursuitId, encounterAt: pursuit.encounterAt,
          route: routeName(job.hazard)
        });
      } else {
        const launch = store.sendVehicle(job.player.id, vehicleId, job.hazard.route_id, now, {
          travelOrder: 'peaceful'
        });
        const encounter = store.database.prepare(`
          SELECT id, encounter_at, encounter_location, status
          FROM vehicle_encounters
          WHERE status = 'planned'
            AND (vehicle1_id = ? OR vehicle2_id = ?)
          ORDER BY id DESC LIMIT 1
        `).get(vehicleId, vehicleId);
        hazardLaunches.push({
          kind: encounter ? 'ghost-hunt' : 'ghost-hunt-reinforcement',
          attempt: job.attempt, target: job.hazard.name,
          targetId: job.hazard.id, player: job.player.name, vehicleId,
          encounterId: encounter?.id ?? null, encounterAt: encounter?.encounter_at ?? null,
          arrivesAt: launch.arrivesAt, route: routeName(job.hazard)
        });
      }
    }
    const pvpLaunchDetails = [...pvpLaunches.values()];
    output.launches = {
      pvp: verbose ? pvpLaunchDetails : {
        permutations: pvpLaunchDetails.length,
        fights: pvpLaunchDetails.reduce((sum, entry) => sum + entry.count, 0),
        firstVehicleId: pvpLaunchDetails[0]?.firstVehicleId ?? null,
        lastVehicleId: pvpLaunchDetails.at(-1)?.lastVehicleId ?? null
      },
      hazards: verbose ? hazardLaunches : {
        attempts: hazardLaunches.length,
        directEncounters: hazardLaunches.filter((entry) =>
          entry.kind === 'creature-hunt' || entry.kind === 'ghost-hunt').length,
        reinforcements: hazardLaunches.filter((entry) =>
          entry.kind === 'ghost-hunt-reinforcement').length,
        firstVehicleId: hazardLaunches[0]?.vehicleId ?? null,
        lastVehicleId: hazardLaunches.at(-1)?.vehicleId ?? null
      },
      totalVehicles: sequence - 1
    };
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  }
} finally {
  store.close();
}
