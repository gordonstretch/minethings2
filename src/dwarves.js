function requireTiers(tiers) {
  if (!Array.isArray(tiers) || !tiers.length) throw new Error('Missing catalog Dwarf tier data.');
  return tiers;
}

export function dwarfTierForItem(itemId, tiers) {
  return requireTiers(tiers).find((tier) => Number(tier.itemId) === Number(itemId)) ?? null;
}

export function dwarfTierForRarity(rarity, tiers) {
  return requireTiers(tiers).find((tier) => Number(tier.rarity) === Number(rarity)) ?? null;
}

export function dwarfFindRange(rarity, tiers) {
  const tier = dwarfTierForRarity(rarity, tiers);
  if (!tier) throw new Error(`Missing catalog Dwarf tier: ${rarity}.`);
  return { maximum: tier.maximumFindRarity, minimum: tier.minimumFindRarity };
}

export function randomDwarfTier(tiers, random = Math.random) {
  const available = requireTiers(tiers);
  const totalWeight = available.reduce((sum, tier) => sum + tier.stowawayWeight, 0);
  if (!(totalWeight > 0)) throw new Error('Catalog Dwarf stowaway weights must be positive.');
  let roll = random() * totalWeight;
  for (const tier of available) {
    if (roll < tier.stowawayWeight) return tier;
    roll -= tier.stowawayWeight;
  }
  return available.at(-1);
}
