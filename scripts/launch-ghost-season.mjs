import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SqliteStore } from '../src/store.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const databaseFile = process.argv[2]
  ? path.resolve(process.argv[2]) : path.join(root, 'data', 'minethings.sqlite');
const playerName = process.argv[3] ?? 'cockwomble2';
const store = new SqliteStore(databaseFile);

try {
  const player = store.database.prepare(
    'SELECT id FROM players WHERE name = ? COLLATE NOCASE AND is_npc = 0'
  ).get(playerName);
  const administrator = store.database.prepare(`
    SELECT id FROM players WHERE authority > 0 AND is_npc = 0
    ORDER BY authority DESC, id LIMIT 1
  `).get();
  if (!player) throw new Error(`Miner not found: ${playerName}`);
  if (!administrator) throw new Error('No administrator account exists.');
  const routeTypes = store.loadCatalog().settings.route_type_ids;
  const targets = [
    ['rider', routeTypes.land, 1], ['rider', routeTypes.land, 6],
    ['ship', routeTypes.sea, 1], ['ship', routeTypes.sea, 6]
  ];
  const launched = [];
  for (const [kind, routeType, rarity] of targets) {
    const grant = store.database.prepare(`
      SELECT city_id FROM ghost_hunter_grants
      WHERE player_id = ? AND route_type = ? AND rarity = ?
    `).get(player.id, routeType, rarity);
    if (!grant) throw new Error(`No tier ${rarity} ${kind} hunter exists for ${playerName}.`);
    const routes = store.database.prepare(`
      SELECT id FROM catalog_routes
      WHERE is_open = 1 AND type = ? AND length > 0
        AND (city1_id = ? OR city2_id = ?) ORDER BY id
    `).all(routeType, grant.city_id, grant.city_id);
    let ghost = null;
    for (const route of routes) {
      const existing = store.database.prepare(`
        SELECT ghost_vehicles.*, player_vehicles.name,
          city1.name AS city1_name, city2.name AS city2_name
        FROM ghost_vehicles
        JOIN player_vehicles ON player_vehicles.id = ghost_vehicles.vehicle_id
        JOIN catalog_routes ON catalog_routes.id = ghost_vehicles.route_id
        JOIN catalog_cities AS city1 ON city1.id = catalog_routes.city1_id
        JOIN catalog_cities AS city2 ON city2.id = catalog_routes.city2_id
        WHERE ghost_vehicles.route_id = ? AND ghost_vehicles.ghost_kind = ?
          AND ghost_vehicles.rarity = ? AND ghost_vehicles.defeated_at IS NULL
      `).get(route.id, kind, rarity);
      if (existing) {
        ghost = { name: existing.name, routeName: `${existing.city1_name}-${existing.city2_name}`,
          bounty: JSON.parse(existing.bounty_json) };
        break;
      }
      try {
        ghost = store.adminRaiseGhost(
          administrator.id, kind, route.id, rarity, Date.now() + launched.length
        );
        break;
      } catch (error) {
        if (!/already has a ghost/.test(error.message)) throw error;
      }
    }
    if (!ghost) throw new Error(`No route is available for the tier ${rarity} ${kind}.`);
    launched.push({ name: ghost.name, route: ghost.routeName, tier: rarity,
      bounty: ghost.bounty.reduce((sum, item) => sum + item.quantity, 0) });
  }
  process.stdout.write(`${JSON.stringify({ playerName, launched }, null, 2)}\n`);
} finally {
  store.close();
}
