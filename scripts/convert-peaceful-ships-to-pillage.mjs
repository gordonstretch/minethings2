import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SqliteStore } from '../src/store.js';
import { combatRarities } from '../src/vehicle-combat.js';
import { travelCombatBonuses } from '../src/specialisations.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const execute = process.argv.includes('--execute');
const databaseArgument = process.argv.find((argument) => argument.startsWith('--database='));
const databaseFile = databaseArgument
  ? path.resolve(databaseArgument.slice('--database='.length))
  : path.join(root, 'data', 'minethings.sqlite');
const store = new SqliteStore(databaseFile, { busyTimeoutMs: 1000 });

function settings() {
  return store.loadCatalog().settings;
}

function specialisations() {
  const bonuses = new Map();
  for (const row of store.database.prepare(`
    SELECT * FROM catalog_specialisation_bonuses
    ORDER BY specialisation_id, bonus_key
  `).all()) {
    if (!bonuses.has(row.specialisation_id)) bonuses.set(row.specialisation_id, {});
    bonuses.get(row.specialisation_id)[row.bonus_key] = row.bonus;
  }
  return store.database.prepare(
    'SELECT * FROM catalog_specialisations ORDER BY id'
  ).all().map((row) => ({
    id: row.id,
    name: row.name,
    melds: row.required_melds,
    bonus: row.bonus_description,
    bonuses: bonuses.get(row.id)
  }));
}

function peacefulShips() {
  return store.database.prepare(`
    SELECT player_vehicles.id, player_vehicles.player_id,
      players.name AS player_name,
      COALESCE(NULLIF(player_vehicles.name, ''), catalog_items.name) AS vehicle_name,
      catalog_items.rarity, player_vehicles.route_id,
      player_vehicles.profession, player_vehicles.offense_bonus_factor,
      city1.name AS city1_name, city2.name AS city2_name
    FROM player_vehicles
    JOIN players ON players.id = player_vehicles.player_id
    JOIN catalog_vehicles ON catalog_vehicles.id = player_vehicles.vehicle_type_id
    JOIN catalog_items ON catalog_items.id = player_vehicles.item_id
    JOIN catalog_routes ON catalog_routes.id = player_vehicles.route_id
    JOIN catalog_cities AS city1 ON city1.id = catalog_routes.city1_id
    JOIN catalog_cities AS city2 ON city2.id = catalog_routes.city2_id
    WHERE player_vehicles.status = 'traveling'
      AND catalog_vehicles.route_type = ?
      AND player_vehicles.travel_order = 'peaceful'
    ORDER BY player_vehicles.route_id, player_vehicles.id
  `).all(Number(settings().route_type_ids.sea));
}

function grouped(rows, key, label) {
  return [...rows.reduce((groups, row) => {
    const value = key(row);
    groups.set(value, (groups.get(value) ?? 0) + 1);
    return groups;
  }, new Map())].map(([name, count]) => ({ [label]: name, count }));
}

function report(rows, extra = {}) {
  return {
    databaseFile,
    mode: execute ? 'execute' : 'dry-run',
    changed: rows.length,
    warTrialShips: rows.filter((row) => row.vehicle_name.startsWith('War Trial')).length,
    byPlayer: grouped(rows, (row) => row.player_name, 'player'),
    byRoute: grouped(rows,
      (row) => `${row.city1_name} - ${row.city2_name} (#${row.route_id})`, 'route'),
    ...extra
  };
}

try {
  if (!execute) {
    process.stdout.write(`${JSON.stringify(report(peacefulShips()), null, 2)}\n`);
  } else {
    const now = Date.now();
    store.settleVehicles(now);
    const rows = peacefulShips();
    const classRules = settings().combat_class_by_rarity;
    const professionRules = specialisations();
    const plannedBefore = store.database.prepare(
      "SELECT COUNT(*) AS count FROM vehicle_encounters WHERE status = 'planned'"
    ).get().count;
    const update = store.database.prepare(`
      UPDATE player_vehicles
      SET travel_order = 'pillage', aggressive = 1,
        aggressive_mask = ?, aggressive_vs_sentry = 0,
        offense_bonus_factor = offense_bonus_factor + ?
      WHERE id = ? AND status = 'traveling' AND travel_order = 'peaceful'
    `);
    let active = false;
    try {
      store.database.exec('BEGIN IMMEDIATE');
      active = true;
      for (const ship of rows) {
        const mask = combatRarities(ship.rarity, classRules)
          .reduce((value, rarity) => value | (1 << rarity), 0);
        const bonuses = travelCombatBonuses(
          ship.profession, 'sea', 'pillage', professionRules
        );
        const result = update.run(mask, bonuses.offense, ship.id);
        if (result.changes !== 1) {
          throw new Error(`Ship ${ship.id} changed while orders were being updated.`);
        }
      }
      store.database.exec('COMMIT');
      active = false;
    } catch (error) {
      if (active) store.database.exec('ROLLBACK');
      throw error;
    }
    store.settleVehicles(now);
    const plannedAfter = store.database.prepare(
      "SELECT COUNT(*) AS count FROM vehicle_encounters WHERE status = 'planned'"
    ).get().count;
    const peacefulRemaining = peacefulShips().length;
    process.stdout.write(`${JSON.stringify(report(rows, {
      peacefulRemaining,
      plannedEncountersBefore: plannedBefore,
      plannedEncountersAfter: plannedAfter,
      newlyPlannedEncounters: Math.max(0, plannedAfter - plannedBefore)
    }), null, 2)}\n`);
  }
} finally {
  store.close();
}
