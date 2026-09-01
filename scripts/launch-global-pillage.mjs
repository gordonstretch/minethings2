import crypto from 'node:crypto';
import path from 'node:path';
import { SqliteStore } from '../src/store.js';

const databaseFile = path.resolve(process.argv[2] ?? 'data/minethings.sqlite');
const store = new SqliteStore(databaseFile, { legacyJsonFile: null });

try {
  const launchedAt = Date.now();
  const routeTypes = store.loadCatalog().settings.route_type_ids;
  const candidates = store.database.prepare(`
    SELECT player_vehicles.id, player_vehicles.player_id,
      players.name AS player_name,
      COALESCE(NULLIF(player_vehicles.name, ''), catalog_items.name) AS vehicle_name,
      catalog_items.name AS item_name,
      catalog_vehicles.route_type
    FROM player_vehicles
    JOIN players ON players.id = player_vehicles.player_id
    JOIN catalog_vehicles ON catalog_vehicles.id = player_vehicles.vehicle_type_id
    JOIN catalog_items ON catalog_items.id = player_vehicles.item_id
    WHERE players.is_npc = 0
      AND player_vehicles.status = 'idle'
      AND player_vehicles.city_id IS NOT NULL
      AND catalog_vehicles.route_type IN (?, ?)
    ORDER BY players.name COLLATE NOCASE, player_vehicles.id
  `).all(Number(routeTypes.land), Number(routeTypes.sea));
  const routeDetails = store.database.prepare(`
    SELECT catalog_routes.id, catalog_routes.type,
      city1.name AS city1_name, city2.name AS city2_name
    FROM catalog_routes
    JOIN catalog_cities AS city1 ON city1.id = catalog_routes.city1_id
    JOIN catalog_cities AS city2 ON city2.id = catalog_routes.city2_id
    WHERE catalog_routes.id = ?
  `);
  const launched = [];
  const skipped = [];

  for (const [index, vehicle] of candidates.entries()) {
    const departureTime = launchedAt + index;
    try {
      const routes = store.routesForVehicle(vehicle.player_id, vehicle.id, departureTime)
        .filter((route) => !route.mission);
      if (!routes.length) {
        skipped.push({
          vehicleId: vehicle.id,
          player: vehicle.player_name,
          vehicle: vehicle.vehicle_name,
          reason: 'No compatible open route from its current city.'
        });
        continue;
      }
      const route = routes[crypto.randomInt(routes.length)];
      const journey = store.sendVehicle(
        vehicle.player_id,
        vehicle.id,
        route.id,
        departureTime,
        { travelOrder: 'pillage' }
      );
      const details = routeDetails.get(route.id);
      launched.push({
        vehicleId: vehicle.id,
        player: vehicle.player_name,
        vehicle: vehicle.vehicle_name,
        kind: Number(vehicle.route_type) === Number(routeTypes.sea) ? 'ship' : 'land',
        routeId: route.id,
        route: details ? `${details.city1_name} ↔ ${details.city2_name}` : `#${route.id}`,
        arrivesAt: journey.arrivesAt
      });
    } catch (error) {
      skipped.push({
        vehicleId: vehicle.id,
        player: vehicle.player_name,
        vehicle: vehicle.vehicle_name,
        reason: error.message
      });
    }
  }

  process.stdout.write(`${JSON.stringify({
    databaseFile,
    launchedAt,
    eligibleIdleTransports: candidates.length,
    launched: launched.length,
    skipped: skipped.length,
    journeys: launched,
    exclusions: skipped
  }, null, 2)}\n`);
} finally {
  store.close();
}
