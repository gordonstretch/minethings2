import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SqliteStore } from '../src/store.js';
import { armsRarities, combatClass } from '../src/vehicle-combat.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const execute = process.argv.includes('--execute');
const waveArgument = process.argv.find((argument) => argument.startsWith('--wave='));
const wave = waveArgument ? Number(waveArgument.slice('--wave='.length)) : 1;
if (!Number.isSafeInteger(wave) || wave < 1 || wave > 99) {
  throw new Error('Wave must be a whole number from 1 to 99.');
}
const databaseArgument = process.argv.find((argument) => argument.startsWith('--database='));
const databaseFile = databaseArgument
  ? path.resolve(databaseArgument.slice('--database='.length))
  : path.join(root, 'data', 'minethings.sqlite');
const exercisePrefix = wave === 1 ? 'War Trial' : `War Trial W${wave}`;
const now = Date.now();
const store = new SqliteStore(databaseFile, { busyTimeoutMs: 1000 });

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

function eligiblePlayers() {
  const players = store.database.prepare(`
    SELECT players.id, players.name, players.city_id, catalog_cities.name AS city_name,
      players.authority, players.created_at,
      COALESCE(SUM(inventory.quantity), 0) AS inventory_items,
      (SELECT COUNT(*) FROM player_vehicles
       WHERE player_vehicles.player_id = players.id) AS vehicles,
      (SELECT COUNT(*) FROM player_vehicles
       WHERE player_vehicles.player_id = players.id
         AND player_vehicles.status = 'traveling') AS traveling_vehicles
    FROM players
    JOIN catalog_cities ON catalog_cities.id = players.city_id
    LEFT JOIN inventory ON inventory.player_id = players.id
    WHERE players.is_npc = 0 AND players.suspended = 0
    GROUP BY players.id
    ORDER BY players.id
  `).all();
  return players.filter((player) => {
    try {
      const capacity = store.inventoryCapacity(player.id, now);
      player.item_limit = capacity.itemLimit;
      player.item_count = capacity.itemCount;
      return capacity.itemCount <= capacity.itemLimit
        + Number(setting('travel_inventory_overage_limit'));
    } catch {
      return false;
    }
  });
}

function routeName(route) {
  return `${route.city1_name} - ${route.city2_name}`;
}

function quietSeaRoutes(count, hazards, weather) {
  const seaType = Number(setting('route_type_ids').sea);
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
  `).all(seaType).filter((route) => !hazardousRoutes.has(Number(route.id))
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
  const eligible = eligiblePlayers();
  const offset = (wave - 1) % eligible.length;
  const players = [...eligible.slice(offset), ...eligible.slice(0, offset)];
  if (players.length < 2) throw new Error('At least two eligible existing players are required.');
  const duelPairCount = Math.min(2, Math.floor(players.length / 2));
  const duelRoutes = quietSeaRoutes(duelPairCount, hazards, weather);
  if (duelRoutes.length < duelPairCount) {
    throw new Error(`Only ${duelRoutes.length} quiet, snow-free sea routes are available for ${duelPairCount} duels.`);
  }
  const seaType = Number(setting('route_type_ids').sea);
  const champion = strongestVehicle(seaType, 6);
  if (!champion) throw new Error('No top-tier ship is available.');
  const cannon = strongestArm(champion, 'cannon');
  if (!cannon) throw new Error('No compatible top-tier cannon is available.');
  const duels = duelRoutes.map((route, index) => ({
    route,
    first: { player: players[index * 2], cityId: Number(route.city1_id), order: 'patrol' },
    second: { player: players[index * 2 + 1], cityId: Number(route.city2_id), order: 'pillage' },
    vehicle: champion,
    cannon
  }));
  const hazardJobs = [];
  let playerIndex = duelPairCount * 2;
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
    hazardJobs.push({
      hazardType: 'creature', hazard: creature, player: players[playerIndex++ % players.length],
      cityId, vehicle, arm: strongestArm(vehicle, kind), kind
    });
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
    hazardJobs.push({
      hazardType: 'ghost', hazard: ghost, player: players[playerIndex++ % players.length],
      cityId, vehicle, arm: strongestArm(vehicle, kind), kind
    });
  }
  return { weather, hazards, players, duels, hazardJobs };
}

function grantVehicle(player, vehicle, cityId, name, arm, kind) {
  const inserted = store.database.prepare(`
    INSERT INTO player_vehicles
      (player_id, vehicle_type_id, item_id, city_id, name, rating)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(player.id, vehicle.vehicle_type_id, vehicle.item_id, cityId, name,
    Number(setting('vehicle_starting_rating')));
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
  return {
    databaseFile,
    mode: execute ? 'execute' : 'dry-run',
    wave,
    exercisePrefix,
    players: plan.players.map((player) => ({
      id: player.id, name: player.name, city: player.city_name,
      inventory: `${player.item_count}/${player.item_limit}`,
      vehicles: player.vehicles, traveling: player.traveling_vehicles
    })),
    duels: plan.duels.map((duel) => ({
      routeId: duel.route.id, route: routeName(duel.route), distance: duel.route.length,
      ship: duel.vehicle.name, cannon: duel.cannon.name,
      cannonPortals: duel.vehicle.cannon_portals,
      cannonballs: (Number(duel.vehicle.capacity) - Number(duel.vehicle.cannon_portals))
        * Number(setting('shots_per_crate')),
      players: [duel.first.player.name, duel.second.player.name]
    })),
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
    hazardJobs: plan.hazardJobs.map((job) => ({
      type: job.hazardType, id: job.hazard.id,
      target: job.hazard.name ?? job.hazard.creature_type,
      player: job.player.name, transport: job.vehicle.name,
      arm: job.arm?.name ?? null, route: routeName(job.hazard)
    }))
  };
}

try {
  if (execute) store.settleWorldEvents(now);
  const plan = createPlan();
  const output = summary(plan);
  if (!execute) {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    process.exitCode = 0;
  } else {
    const existing = store.database.prepare(`
      SELECT COUNT(*) AS count FROM player_vehicles WHERE name LIKE ?
    `).get(`${exercisePrefix} %`).count;
    if (existing) throw new Error(`${existing} existing ${exercisePrefix} vehicles make this run ambiguous.`);
    const launches = [];
    let sequence = 1;
    for (const duel of plan.duels) {
      const firstId = grantVehicle(duel.first.player, duel.vehicle, duel.first.cityId,
        `${exercisePrefix} ${sequence++}`, duel.cannon, 'cannon');
      const secondId = grantVehicle(duel.second.player, duel.vehicle, duel.second.cityId,
        `${exercisePrefix} ${sequence++}`, duel.cannon, 'cannon');
      const firstLaunch = store.sendVehicle(duel.first.player.id, firstId, duel.route.id, now, {
        travelOrder: duel.first.order, aggressiveVsSentry: true
      });
      const secondLaunch = store.sendVehicle(duel.second.player.id, secondId, duel.route.id, now, {
        travelOrder: duel.second.order, aggressiveVsSentry: true
      });
      const encounter = store.database.prepare(`
        SELECT id, encounter_at, encounter_location, status
        FROM vehicle_encounters
        WHERE status = 'planned' AND route_id = ?
          AND ((vehicle1_id = ? AND vehicle2_id = ?)
            OR (vehicle1_id = ? AND vehicle2_id = ?))
        ORDER BY id DESC LIMIT 1
      `).get(duel.route.id, firstId, secondId, secondId, firstId);
      if (!encounter) throw new Error(`No duel was planned on ${routeName(duel.route)}.`);
      launches.push({
        kind: 'duel', route: routeName(duel.route),
        vehicles: [firstId, secondId], players: [duel.first.player.name, duel.second.player.name],
        encounterId: encounter.id, encounterAt: encounter.encounter_at,
        arrivalsAt: [firstLaunch.arrivesAt, secondLaunch.arrivesAt]
      });
    }
    for (const job of plan.hazardJobs) {
      const vehicleId = grantVehicle(job.player, job.vehicle, job.cityId,
        `${exercisePrefix} ${sequence++}`, job.arm, job.kind);
      if (job.hazardType === 'creature') {
        const pursuit = store.attackWorldCreature(job.player.id, job.hazard.id, vehicleId, now);
        launches.push({
          kind: 'creature-hunt', target: job.hazard.creature_type,
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
        launches.push({
          kind: encounter ? 'ghost-hunt' : 'ghost-hunt-reinforcement', target: job.hazard.name,
          targetId: job.hazard.id, player: job.player.name, vehicleId,
          encounterId: encounter?.id ?? null, encounterAt: encounter?.encounter_at ?? null,
          arrivesAt: launch.arrivesAt, route: routeName(job.hazard)
        });
      }
    }
    output.launches = launches;
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
  }
} finally {
  store.close();
}
