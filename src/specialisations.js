export function specialisation(id, entries) {
  if (!Array.isArray(entries) || !entries.length) {
    throw new Error('Missing catalog specialisation data.');
  }
  const result = entries.find((entry) => Number(entry.id) === Number(id));
  if (!result) throw new Error(`Missing catalog specialisation: ${id}.`);
  return result;
}

export function specialisationBonus(id, key, entries) {
  const entry = specialisation(id, entries);
  if (!entry.bonuses || !Object.hasOwn(entry.bonuses, key)) {
    throw new Error(`Missing catalog specialisation bonus ${key} for specialisation ${id}.`);
  }
  const value = Number(entry.bonuses[key]);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid catalog specialisation bonus ${key} for specialisation ${id}.`);
  }
  return value;
}

export function specialisationMultiplier(id, key, entries) {
  return 1 + specialisationBonus(id, key, entries);
}

export function travelSpeedMultiplier(id, routeBehavior, loaded, entries) {
  if (routeBehavior === 'air') return specialisationMultiplier(id, 'aircraftSpeed', entries);
  if (!loaded) return 1;
  if (routeBehavior === 'land') return specialisationMultiplier(id, 'loadedLandSpeed', entries);
  if (routeBehavior === 'sea') return specialisationMultiplier(id, 'loadedSeaSpeed', entries);
  return 1;
}

export function travelCombatBonuses(id, routeBehavior, order, entries) {
  if (!['peaceful', 'pillage', 'patrol'].includes(order)) {
    throw new Error(`Unknown travel order: ${order}.`);
  }
  const normalizedOrder = order;
  if (routeBehavior === 'land') {
    return {
      offense: normalizedOrder === 'pillage' ? specialisationBonus(id, 'landPillageOffense', entries) : 0,
      defense: normalizedOrder === 'patrol' ? specialisationBonus(id, 'landPatrolDefense', entries) : 0
    };
  }
  if (routeBehavior === 'sea') {
    return {
      offense: normalizedOrder === 'pillage' ? specialisationBonus(id, 'seaPillageOffense', entries) : 0,
      defense: normalizedOrder === 'patrol' ? specialisationBonus(id, 'seaPatrolDefense', entries) : 0
    };
  }
  return { offense: 0, defense: 0 };
}
