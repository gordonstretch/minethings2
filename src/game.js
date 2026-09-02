import { specialisationBonus } from './specialisations.js';

function setting(catalog, key) {
  if (!Object.hasOwn(catalog?.settings ?? {}, key)) {
    throw new Error(`Missing catalog setting: ${key}.`);
  }
  return catalog.settings[key];
}

function chooseRarity(catalog, rarities, random = Math.random, minRarity = null) {
  minRarity ??= Number(setting(catalog, 'standard_find_min_rarity'));
  const configured = [...rarities.keys()].sort((a, b) => a - b);
  const available = configured.filter((rarity) => rarity >= minRarity);
  if (!available.length) return configured.at(-1) ?? null;
  const maximumRarity = Math.max(...catalog.rarities.map((rarity) => rarity.id));
  const rollBase = Number(setting(catalog, 'rarity_roll_base'));
  for (let attempts = 0; attempts < Number(setting(catalog, 'rarity_roll_attempts')); attempts += 1) {
    const roll = Math.floor(random() * (rollBase ** (maximumRarity - minRarity))) + 1;
    for (let exponent = 0; exponent <= maximumRarity - minRarity; exponent += 1) {
      if (roll <= rollBase ** exponent) {
        const rarity = maximumRarity - exponent;
        if (rarities.has(rarity)) return rarity;
        break;
      }
    }
  }
  return available.sort((a, b) => a - b)[0];
}

export function findItem(catalog, mineTypeId, random = Math.random) {
  const rarities = catalog.byMineType.get(mineTypeId);
  if (!rarities) throw new Error('This mine has no discoverable items.');
  const rarity = chooseRarity(catalog, rarities, random);
  const candidates = rarity === null ? null : rarities.get(rarity);
  if (!candidates?.length) throw new Error('This mine has no discoverable items.');
  return candidates[Math.floor(random() * candidates.length)];
}

export function findDamagedItem(catalog, mineTypeId, random = Math.random) {
  const rarities = catalog.damagedByMineType.get(mineTypeId);
  if (!rarities) return null;
  const rarity = chooseRarity(catalog, rarities, random,
    Number(setting(catalog, 'damaged_find_min_rarity')));
  if (rarity === null) return null;
  const candidates = rarities.get(rarity);
  return candidates[Math.floor(random() * candidates.length)];
}

export function findGold(catalog, random = Math.random) {
  let maximum = Number(setting(catalog, 'gold_find_base_maximum'));
  const sides = Number(setting(catalog, 'gold_find_bonus_roll_sides'));
  const rounds = Number(setting(catalog, 'gold_find_bonus_rounds'));
  const hit = Number(setting(catalog, 'gold_find_bonus_roll_hit'));
  const multiplier = Number(setting(catalog, 'gold_find_bonus_multiplier'));
  for (let index = 0; index < rounds; index += 1) {
    if (Math.floor(random() * sides) + 1 === hit) maximum *= multiplier;
    else break;
  }
  return Math.floor(random() * maximum) + 1;
}

function recordItem(player, catalog, mine, item, foundAt, exploded = false) {
  const inventory = player.inventoryByCity
    ? (player.inventoryByCity[mine.cityId] ??= {})
    : player.inventory;
  const recycled = player.recycleItemIds?.includes(item.id) ?? false;
  if (recycled) {
    const scraps = Number(setting(catalog, 'recycling_scraps_by_rarity')[item.rarity]);
    player.oreScrapsByCity ??= {};
    player.oreScrapsByCity[mine.cityId] = (player.oreScrapsByCity[mine.cityId] ?? 0) + scraps;
  } else inventory[item.id] = (inventory[item.id] ?? 0) + 1;
  const discovery = { itemId: item.id, mineId: mine.id, cityId: mine.cityId, foundAt, exploded, recycled };
  player.discoveries.unshift(discovery);
  return discovery;
}

function captureDwarf(player, catalog, mine, now, random) {
  const tiers = catalog.dwarfTiers ?? [];
  if (!tiers.length) return null;
  const totalWeight = tiers.reduce((sum, tier) => sum + Number(tier.stowawayWeight ?? 1), 0);
  let roll = random() * totalWeight;
  let tier = tiers[0];
  for (const candidate of tiers) {
    tier = candidate;
    roll -= Number(candidate.stowawayWeight ?? 1);
    if (roll < 0) break;
  }
  const item = catalog.byId.get(tier.itemId);
  if (!item) throw new Error(`Missing captive Dwarf item ${tier.itemId}.`);
  const inventory = player.inventoryByCity
    ? (player.inventoryByCity[mine.cityId] ??= {}) : player.inventory;
  inventory[item.id] = (inventory[item.id] ?? 0) + 1;
  const discovery = {
    itemId: item.id, mineId: mine.id, cityId: mine.cityId,
    foundAt: now - 0.75, exploded: false, recycled: false, capturedDwarf: true
  };
  player.discoveries.unshift(discovery);
  return discovery;
}

export function giveFinds(player, catalog, mine, quantity, now = Date.now(), random = Math.random, options = {}) {
  const discoveries = [];
  for (let index = 0; index < quantity; index += 1) {
    const item = findItem(catalog, mine.mineTypeId, random);
    discoveries.push(recordItem(player, catalog, mine, item, now - index, Boolean(options.exploded)));
    const robot = options.allowRobot === false ? null : catalog.robotByItemId.get(mine.robotItemId);
    if (robot && mine.mineThings !== false
      && random() < Number(setting(catalog, 'robot_damaged_chance_per_model')) * robot.model) {
      const damaged = findDamagedItem(catalog, mine.mineTypeId, random);
      if (damaged) discoveries.push(recordItem(player, catalog, mine, damaged, now - index - 0.5, Boolean(options.exploded)));
    }
  }
  if (mine.cityId === player.cityId) player.inventory = player.inventoryByCity?.[mine.cityId] ?? player.inventory;
  player.discoveries = player.discoveries.slice(0,
    Number(setting(catalog, 'discovery_history_limit')));
  return discoveries;
}

export function createPlayer(name, email, passwordHash, catalog, now = Date.now(), random = Math.random) {
  const findIntervalMs = Number(setting(catalog, 'find_interval_ms'));
  const configuredMaps = [...(catalog.maps ?? [])];
  const firstMap = configuredMaps.find((map) => String(map.slug).toLowerCase() === 'aso'
    || String(map.name).toLowerCase() === 'aso')
    ?? configuredMaps.sort((first, second) =>
      Number(first.sortOrder) - Number(second.sortOrder) || Number(first.id) - Number(second.id))[0];
  const firstMapCities = firstMap
    ? (catalog.cities ?? []).filter((city) => Number(city.mapId) === Number(firstMap.id)) : [];
  const capitalCity = firstMapCities.find((city) =>
    Number(city.id) === Number(firstMap?.capitalCityId));
  const gatewayCity = firstMapCities.find((city) => (catalog.routes ?? []).some((route) =>
    route.interMap && (Number(route.city1Id) === Number(city.id)
      || Number(route.city2Id) === Number(city.id))));
  const cityId = Number(capitalCity?.id ?? gatewayCity?.id ?? firstMapCities[0]?.id
    ?? setting(catalog, 'starter_city_id'));
  const mine = {
    id: 1, mineTypeId: Number(setting(catalog, 'starter_mine_type_id')), cityId,
    active: true, mineThings: true,
    priority: 1, oilExpiresAt: 0, rentalUntil: 0, nextFindAt: now + findIntervalMs, equipment: {}, robotItemId: null
  };
  const player = {
    name, email, passwordHash, description: '',
    credits: Number(setting(catalog, 'starter_credits')),
    gold: Number(setting(catalog, 'starter_gold')), cityId, homeCityId: cityId,
    itemLimit: Number(setting(catalog, 'starter_item_limit')),
    profession: Number(setting(catalog, 'default_specialisation_id')),
    publishFindings: true, showMines: true, recycleItemIds: [], oreScrapsByCity: {},
    nextMineId: 2,
    batteryExpiresAt: now + Number(setting(catalog, 'starter_battery_duration_ms')),
    mines: [mine], inventory: {}, discoveries: [], createdAt: now
  };
  giveFinds(player, catalog, mine, Number(setting(catalog, 'starter_find_count')), now, random);
  player.inventoryByCity = { [player.cityId]: player.inventory };
  return player;
}

export function hasActiveGadget(player, behaviorKey, now = Date.now()) {
  return Boolean(player?.gadgets?.some(
    (gadget) => gadget.behaviorKey === behaviorKey && gadget.expiresAt > now
  ));
}

export function activeMineLimit(player, catalog, now = Date.now()) {
  const cityMapIds = new Map((catalog.cities ?? []).map((city) => [
    Number(city.id), Number(city.mapId)
  ]));
  const knownCityIds = new Set([
    ...(player?.knownCityIds ?? []),
    ...(player?.mines ?? []).map((mine) => mine.cityId),
    player?.cityId, player?.homeCityId
  ].map(Number).filter(Number.isSafeInteger));
  const regionCount = Math.max(1, new Set([...knownCityIds]
    .map((cityId) => cityMapIds.get(cityId)).filter(Number.isSafeInteger)).size);
  const perRegion = Number(setting(catalog, hasActiveGadget(player, 'control', now)
    ? 'control_active_mine_limit' : 'active_mine_limit'));
  return regionCount * perRegion;
}

export function mineBucketsPerHour(catalog, mine, player = null, now = Date.now()) {
  const activeLimit = activeMineLimit(player, catalog, now);
  if (mine.priority > activeLimit) {
    return Number(setting(catalog, 'inactive_mine_buckets_per_hour'))
      + (mine.oilExpiresAt > now ? Number(setting(catalog, 'mine_oil_buckets_per_hour')) : 0);
  }
  const regionalHomeCityIds = new Set([
    ...(catalog.maps ?? []).map((map) => map.capitalCityId),
    ...(player?.regionHomeCityIds ?? []),
    ...(player?.regionCapitalCityIds ?? [])
  ].map(Number).filter(Number.isSafeInteger));
  if (!regionalHomeCityIds.size && Number.isSafeInteger(Number(player?.homeCityId))) {
    regionalHomeCityIds.add(Number(player.homeCityId));
  }
  const isTopHomeMine = player && regionalHomeCityIds.has(Number(mine.cityId))
    && !(player.mines ?? []).some((candidate) => candidate.id !== mine.id && candidate.cityId === mine.cityId
      && (candidate.priority ?? candidate.id) < (mine.priority ?? mine.id));
  const homeStoneBonus = isTopHomeMine
    ? (player.stoneCount ?? 0) * Number(setting(catalog, 'stone_buckets_per_hour')) : 0;
  const equipmentRate = Object.values(mine.equipment ?? {}).reduce((total, itemId) => {
    const equipment = catalog.equipmentByItemId.get(Number(itemId));
    if (!equipment) throw new Error(`Missing catalog mining equipment: ${itemId}.`);
    return total + equipment.bucketsPerHour;
  }, 0);
  const equipmentMultiplier = hasActiveGadget(player, 'hammer', now)
    ? Number(setting(catalog, 'hammer_equipment_multiplier')) : 1;
  if (!Array.isArray(catalog.botParts)) throw new Error('Missing catalog bot-part data.');
  const partsRate = catalog.botParts.filter((part) => player?.botPartIds?.includes(part.id))
    .reduce((total, part) => total + part.bph, 0);
  return Number(setting(catalog, 'base_buckets_per_hour')) + homeStoneBonus + partsRate
    + equipmentRate * equipmentMultiplier
    + (mine.oilExpiresAt > now ? Number(setting(catalog, 'mine_oil_buckets_per_hour')) : 0);
}

export function mineIntervalMs(catalog, mine, player = null, now = Date.now()) {
  const bucketsPerThing = Number(setting(catalog, 'buckets_per_thing'));
  return Math.round((bucketsPerThing / mineBucketsPerHour(catalog, mine, player, now)) * 60 * 60 * 1000);
}

export function claimMine(player, catalog, mineId, now = Date.now(), random = Math.random) {
  const mine = mineInCurrentCity(player, mineId);
  if (!mine.cryptoTypeId && Number.isFinite(player.itemCount) && Number.isFinite(player.itemLimit)
    && player.itemCount > player.itemLimit) {
    throw new Error('Reduce your inventory before your mines can add more things.');
  }
  if ((player.batteryExpiresAt ?? 0) <= now) throw new Error('Your bot battery is empty. Visit Mines to recharge it.');
  if (mine.nextFindAt > now) throw new Error('Your miners are still digging.');
  const interval = mineIntervalMs(catalog, mine, player, now);
  const quantity = Math.min(Number(setting(catalog, 'max_offline_finds')),
    Math.floor((now - mine.nextFindAt) / interval) + 1);
  let finds = [];
  let gold = 0;
  let crypto = null;
  if (mine.cryptoTypeId) {
    const cryptoTypeId = Number(mine.cryptoTypeId);
    player.cryptoBalances ??= {};
    player.cryptoBalances[cryptoTypeId] = Number(player.cryptoBalances[cryptoTypeId] ?? 0) + quantity;
    crypto = { cryptoTypeId, quantity };
  } else if (mine.mineThings !== false) {
    finds = giveFinds(player, catalog, mine, quantity, now, random);
  } else {
    const mineType = catalog.mineTypes.find((candidate) => candidate.id === mine.mineTypeId);
    const oreMineTypeId = Number(setting(catalog, 'ore_mine_type_id'));
    if (mineType?.hasOre && catalog.byMineType.has(oreMineTypeId)) {
      finds = giveFinds(player, catalog, { ...mine, mineTypeId: oreMineTypeId }, quantity, now, random);
    } else if (!specialisationBonus(player.profession, 'mineGold', catalog.specialisations)) {
      for (let index = 0; index < quantity; index += 1) gold += findGold(catalog, random);
      player.gold += gold;
    }
  }
  const phase = moonPhaseAt(now);
  const captureChance = Number(setting(catalog, 'mining_dwarf_capture_chance'))
    * phase.dwarfCapture;
  const combinedCaptureChance = 1 - ((1 - captureChance) ** quantity);
  const capturedDwarf = random() < combinedCaptureChance
    ? captureDwarf(player, catalog, mine, now, random) : null;
  if (capturedDwarf) finds.push(capturedDwarf);
  if (Number.isFinite(player.itemCount)) {
    player.itemCount += finds.filter((finding) => !finding.recycled).length;
  }
  mine.nextFindAt += quantity * interval;
  if (mine.nextFindAt <= now) mine.nextFindAt = now + interval;
  return { finds, gold, crypto, capturedDwarf, moonPhase: phase.name };
}

export function setMineMode(player, mineId, mode, cryptoTypeId = null) {
  const mine = mineInCurrentCity(player, mineId);
  mine.mineThings = mode === true || mode === 'things';
  mine.cryptoTypeId = mode === 'crypto' ? Number(cryptoTypeId) : null;
  return mine;
}

export function prioritizeMine(player, catalog, mineId, now = Date.now()) {
  const target = mineInCurrentCity(player, mineId, false);
  const ordered = [target, ...player.mines.filter((mine) => mine.id !== mineId)
    .sort((a, b) => (a.priority ?? a.id) - (b.priority ?? b.id) || a.id - b.id)];
  const activeLimit = activeMineLimit(player, catalog, now);
  ordered.forEach((mine, index) => {
    const wasActive = mine.active;
    mine.priority = index + 1;
    mine.active = index < activeLimit;
    if (!wasActive && mine.active) mine.nextFindAt = Math.max(mine.nextFindAt, now + mineIntervalMs(catalog, mine, player, now));
  });
  player.mines = ordered;
  return target;
}

export function oilMineBot(player, catalog, mineId, now = Date.now()) {
  const mine = mineInCurrentCity(player, mineId);
  const oil = catalog.byId.get(Number(setting(catalog, 'oil_item_id')));
  if (!oil) throw new Error('Oil is missing from the catalog.');
  changeLocalItem(player, mine.cityId, oil.id, -1);
  mine.oilExpiresAt = Math.max(now, mine.oilExpiresAt ?? 0)
    + Number(setting(catalog, 'mine_oil_duration_ms'));
  return mine;
}

function mineTypeAvailableInCity(catalog, mineTypeId, cityId) {
  if (!(catalog.mineTypesByCity instanceof Map) || !catalog.mineTypesByCity.has(cityId)) {
    throw new Error(`Missing catalog mine availability for city ${cityId}.`);
  }
  return catalog.mineTypesByCity.get(cityId).some((mineType) => mineType.id === mineTypeId);
}

export function buyMine(player, catalog, mineTypeId, now = Date.now(), random = Math.random) {
  const mineType = catalog.mineTypes.find((candidate) => candidate.id === mineTypeId);
  if (!mineType || mineType.creditCost <= 0 || !catalog.byMineType.has(mineTypeId)) throw new Error('That mine is not for sale.');
  if (!mineTypeAvailableInCity(catalog, mineTypeId, player.cityId)) {
    throw new Error('That mine is not available in this city.');
  }
  if (player.credits < mineType.creditCost) throw new Error('You do not have enough credits.');
  player.credits -= mineType.creditCost;
  const mine = {
    id: player.nextMineId++, mineTypeId, cityId: player.cityId,
    active: player.mines.filter((candidate) => candidate.active).length
      < activeMineLimit(player, catalog, now),
    mineThings: true, priority: player.mines.length + 1, oilExpiresAt: 0, rentalUntil: 0,
    nextFindAt: now + Number(setting(catalog, 'find_interval_ms')), equipment: {}, robotItemId: null
  };
  player.mines.push(mine);
  giveFinds(player, catalog, mine, Number(setting(catalog, 'starter_find_count')), now, random);
  return mine;
}

export function rentMine(player, catalog, mineTypeId, now = Date.now(), random = Math.random,
  options = {}) {
  const mineType = catalog.mineTypes.find((candidate) => candidate.id === mineTypeId);
  if (!mineType || mineType.rentCost <= 0 || !catalog.byMineType.has(mineTypeId)) throw new Error('That mine cannot be rented.');
  if (!mineTypeAvailableInCity(catalog, mineTypeId, player.cityId)) {
    throw new Error('That mine is not available in this city.');
  }
  const waiveCost = options?.waiveCost === true;
  if (!waiveCost && player.credits < mineType.rentCost) {
    throw new Error('You do not have enough credits.');
  }
  if (!waiveCost) player.credits -= mineType.rentCost;
  const mine = {
    id: player.nextMineId++, mineTypeId, cityId: player.cityId,
    active: player.mines.filter((candidate) => candidate.active).length
      < activeMineLimit(player, catalog, now),
    mineThings: true, priority: player.mines.length + 1, oilExpiresAt: 0,
    rentalUntil: now + Number(setting(catalog, 'mine_rental_duration_ms')),
    nextFindAt: now + Number(setting(catalog, 'find_interval_ms')), equipment: {}, robotItemId: null
  };
  player.mines.push(mine);
  giveFinds(player, catalog, mine, Number(setting(catalog, 'starter_find_count')), now, random);
  return mine;
}

function dismantleMine(player, mine) {
  for (const itemId of Object.values(mine.equipment ?? {})) changeLocalItem(player, mine.cityId, Number(itemId), 1);
  if (mine.robotItemId) changeLocalItem(player, mine.cityId, mine.robotItemId, 1);
  player.mines = player.mines.filter((candidate) => candidate.id !== mine.id);
  player.mines.sort((a, b) => (a.priority ?? a.id) - (b.priority ?? b.id))
    .forEach((candidate, index) => { candidate.priority = index + 1; });
}

export function sellMine(player, catalog, mineId) {
  const mine = mineInCurrentCity(player, mineId, false);
  if (mine.rentalUntil) throw new Error('That mine cannot be sold.');
  if (mine.sourceKind === 'profession-kit') {
    throw new Error('Profession Kit mines are permanent grants and cannot be sold.');
  }
  const ownedMines = player.mines.filter((candidate) => !candidate.rentalUntil);
  if (ownedMines.length <= Number(setting(catalog, 'minimum_permanent_mines'))) {
    throw new Error('You cannot sell your last permanent mine.');
  }
  const mineType = catalog.mineTypes.find((candidate) => candidate.id === mine.mineTypeId);
  if (!mineType?.refundable) throw new Error('That mine is not refundable.');
  dismantleMine(player, mine);
  const refund = mineRefundCredits(catalog, mineType);
  player.credits += refund;
  return refund;
}

export function mineRefundCredits(catalog, mineType) {
  const ratio = Number(catalog.settings?.mine_credit_refund_ratio);
  if (!Number.isFinite(ratio) || ratio < 0 || ratio > 1) {
    throw new Error('Invalid mine credit refund ratio.');
  }
  return Math.floor(Number(mineType?.creditCost ?? 0) * ratio);
}

export function expireRentalMines(player, now = Date.now()) {
  const expired = player.mines.filter((mine) => mine.rentalUntil && mine.rentalUntil <= now);
  for (const mine of expired) dismantleMine(player, mine);
  return expired.length;
}

function mineInCurrentCity(player, mineId, requireActive = true) {
  const mine = player.mines.find((candidate) => candidate.id === mineId
    && (!requireActive || candidate.active));
  if (!mine) throw new Error('Mine not found.');
  if (mine.cityId !== player.cityId) throw new Error('Travel to this mine’s city before changing its loadout.');
  return mine;
}

function localInventory(player, cityId) {
  if (!player.inventoryByCity) player.inventoryByCity = { [player.cityId]: player.inventory };
  const inventory = (player.inventoryByCity[cityId] ??= {});
  if (cityId === player.cityId) player.inventory = inventory;
  return inventory;
}

function changeLocalItem(player, cityId, itemId, amount) {
  const inventory = localInventory(player, cityId);
  const quantity = (inventory[itemId] ?? 0) + amount;
  if (quantity < 0) throw new Error('You do not own enough of that item in this city.');
  if (quantity) inventory[itemId] = quantity;
  else delete inventory[itemId];
}

export function equipMine(player, catalog, mineId, itemId) {
  const mine = mineInCurrentCity(player, mineId);
  const equipment = catalog.equipmentByItemId.get(itemId);
  if (!equipment) throw new Error('That item is not mining equipment.');
  changeLocalItem(player, mine.cityId, itemId, -1);
  mine.equipment ??= {};
  const replacedItemId = mine.equipment[equipment.typeId];
  if (replacedItemId) changeLocalItem(player, mine.cityId, replacedItemId, 1);
  mine.equipment[equipment.typeId] = itemId;
  return { mine, replacedItemId };
}

export function unequipMine(player, catalog, mineId, typeId) {
  const mine = mineInCurrentCity(player, mineId);
  const itemId = mine.equipment?.[typeId];
  if (!itemId || catalog.equipmentByItemId.get(itemId)?.typeId !== typeId) throw new Error('That equipment slot is empty.');
  delete mine.equipment[typeId];
  changeLocalItem(player, mine.cityId, itemId, 1);
  return itemId;
}

export function assignRobot(player, catalog, mineId, itemId) {
  const mine = mineInCurrentCity(player, mineId);
  if (!catalog.robotByItemId.has(itemId)) throw new Error('That item is not a miner robot.');
  changeLocalItem(player, mine.cityId, itemId, -1);
  const replacedItemId = mine.robotItemId;
  if (replacedItemId) changeLocalItem(player, mine.cityId, replacedItemId, 1);
  mine.robotItemId = itemId;
  return { mine, replacedItemId };
}

export function unassignRobot(player, catalog, mineId) {
  const mine = mineInCurrentCity(player, mineId);
  if (!mine.robotItemId || !catalog.robotByItemId.has(mine.robotItemId)) throw new Error('This mine has no miner robot.');
  const itemId = mine.robotItemId;
  mine.robotItemId = null;
  changeLocalItem(player, mine.cityId, itemId, 1);
  return itemId;
}

export function detonateExplosive(player, catalog, mineId, explosiveItemId, count, now = Date.now(), random = Math.random) {
  const mine = mineInCurrentCity(player, mineId);
  const explosive = catalog.explosiveByItemId.get(explosiveItemId);
  const item = catalog.byId.get(explosiveItemId);
  const quantityUsed = Number(count);
  if (!explosive || !item) throw new Error('That item is not an explosive.');
  if (!Number.isSafeInteger(quantityUsed) || quantityUsed < 1) throw new Error('Choose a positive whole number of explosives.');
  const rarity = catalog.rarityById.get(item.rarity);
  if (!rarity) throw new Error(`Missing catalog rarity: ${item.rarity}.`);
  if (quantityUsed > rarity.maxExplosives) {
    throw new Error('That detonation exceeds the legacy safety limit for this explosive.');
  }
  changeLocalItem(player, mine.cityId, explosiveItemId, -quantityUsed);

  const variation = Number(setting(catalog, 'explosive_power_variation'));
  const low = Math.floor(explosive.buckets * (1 - variation));
  const high = Math.floor(explosive.buckets * (1 + variation));
  const unitBuckets = low + Math.floor(random() * (high - low + 1));
  const buckets = quantityUsed * unitBuckets;
  const bucketsPerThing = Number(setting(catalog, 'buckets_per_thing'));
  let outputCount = Math.floor(buckets / bucketsPerThing);
  if (random() * bucketsPerThing < buckets - outputCount * bucketsPerThing) outputCount += 1;

  let finds = [];
  let gold = 0;
  if (mine.mineThings !== false) {
    finds = giveFinds(player, catalog, mine, outputCount, now, random, { exploded: true, allowRobot: false });
  } else {
    const mineType = catalog.mineTypes.find((candidate) => candidate.id === mine.mineTypeId);
    const oreMineTypeId = Number(setting(catalog, 'ore_mine_type_id'));
    if (mineType?.hasOre && catalog.byMineType.has(oreMineTypeId)) {
      finds = giveFinds(player, catalog, { ...mine, mineTypeId: oreMineTypeId }, outputCount, now, random,
        { exploded: true, allowRobot: false });
    } else {
      for (let index = 0; index < outputCount; index += 1) gold += findGold(catalog, random);
      player.gold += gold;
    }
  }
  return { explosive, quantityUsed, buckets, outputCount, finds, gold };
}

export function sellItem(player, catalog, itemId) {
  const item = catalog.byId.get(itemId);
  if (!item || !player.inventory[itemId]) throw new Error('You do not own that item.');
  player.inventory[itemId] -= 1;
  if (player.inventory[itemId] === 0) delete player.inventory[itemId];
  const rarity = catalog.rarityById.get(item.rarity);
  if (!rarity) throw new Error(`Missing catalog rarity: ${item.rarity}.`);
  const value = rarity.saleValue;
  player.credits += value;
  return value;
}
import { moonPhaseAt } from './world-events.js';
