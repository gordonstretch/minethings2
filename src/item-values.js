import { dwarfFindRange, dwarfTierForItem } from './dwarves.js';

function itemValueRules(catalog) {
  const rules = catalog.settings?.item_value_rules;
  if (!rules || typeof rules !== 'object' || !Array.isArray(rules.rarityMinimumGold)
    || !rules.utilityGoldByItemId || typeof rules.utilityGoldByItemId !== 'object'
    || Array.isArray(rules.utilityGoldByItemId)) {
    throw new Error('Missing catalog setting: item_value_rules.');
  }
  return rules;
}

function requiredNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Invalid item valuation rule: ${label}.`);
  return number;
}

function requiredPositiveNumber(value, label) {
  const number = requiredNumber(value, label);
  if (number <= 0) throw new Error(`Invalid item valuation rule: ${label}.`);
  return number;
}

function requiredCollection(catalog, key) {
  const value = catalog?.[key];
  if (!Array.isArray(value)) throw new Error(`Missing catalog collection for item valuation: ${key}.`);
  return value;
}

function rarityMinimumGold(rules, rarity) {
  return requiredNumber(rules.rarityMinimumGold[rarity], `rarityMinimumGold[${rarity}]`);
}

function roundedGold(value) {
  return Math.max(0.0001, Math.round(value * 10000) / 10000);
}

function recipeDemandGold(catalog, itemId, rules) {
  let recipeBreadth = 0;
  let requiredUnits = 0;
  let soleIngredientDemand = 0;
  for (const requirement of requiredCollection(catalog, 'meldRequirements')) {
    if (requirement.itemId !== itemId) continue;
    const meld = catalog.meldById.get(requirement.meldId);
    if (!meld) throw new Error(`Missing meld ${requirement.meldId} for item valuation.`);
    const meldRarity = requiredNumber(meld.rarity, `meld[${meld.id}].rarity`);
    if (meldRarity < 0) throw new Error(`Invalid item valuation rule: meld[${meld.id}].rarity.`);
    const rarityWeight = 1 + meldRarity * requiredNumber(
      rules.recipe.rarityWeightPerTier, 'recipe.rarityWeightPerTier'
    );
    recipeBreadth += rarityWeight;
    const requirementCount = requiredNumber(requirement.count,
      `meldRequirement[${requirement.id}].count`);
    if (!Number.isSafeInteger(requirementCount) || requirementCount < 1) {
      throw new Error(`Invalid item valuation rule: meldRequirement[${requirement.id}].count.`);
    }
    requiredUnits += requirementCount * rarityWeight;
    if (!Array.isArray(meld.requirements)) {
      throw new Error(`Missing requirements for meld ${meld.id} during item valuation.`);
    }
    if (meld.requirements.length === 1) {
      const soleMultiplier = requirement.count === 1
        ? requiredNumber(rules.recipe.singleUnitSoleMultiplier, 'recipe.singleUnitSoleMultiplier')
        : 1;
      soleIngredientDemand += rarityWeight * soleMultiplier;
    }
  }
  if (!recipeBreadth) return 0;
  return Math.log2(1 + recipeBreadth) * requiredNumber(rules.recipe.breadth, 'recipe.breadth')
    + Math.log2(1 + requiredUnits) * requiredNumber(rules.recipe.requiredUnits, 'recipe.requiredUnits')
    + soleIngredientDemand * requiredNumber(rules.recipe.soleIngredient, 'recipe.soleIngredient');
}

function minimumWorkerGoldPerComponent(catalog) {
  const tiers = catalog.settings?.factory_worker_bot_tiers;
  if (!Array.isArray(tiers) || !tiers.length) {
    throw new Error('Missing catalog setting: factory_worker_bot_tiers.');
  }
  const contractHours = requiredPositiveNumber(
    catalog.settings?.factory_worker_bot_contract_duration_ms,
    'factory_worker_bot_contract_duration_ms'
  ) / 3600000;
  return Math.min(...tiers.map((tier, index) => {
    const cph = requiredPositiveNumber(tier?.cph, `factory_worker_bot_tiers[${index}].cph`);
    const costGold = requiredPositiveNumber(
      tier?.costGold, `factory_worker_bot_tiers[${index}].costGold`
    );
    return costGold / (cph * contractHours);
  }));
}

export function factoryProductionFloorGold(catalog, action) {
  const rules = itemValueRules(catalog);
  const oreGold = requiredPositiveNumber(rules.oreCrateGold, 'oreCrateGold');
  const oreShare = requiredNumber(rules.factory?.oreInputValueShare,
    'factory.oreInputValueShare');
  const workerShare = requiredNumber(rules.factory?.workerCostShare,
    'factory.workerCostShare');
  if (oreShare < 0 || workerShare < 0) {
    throw new Error('Invalid item valuation rule: factory cost shares.');
  }
  const outputQuantity = requiredNumber(action?.outputQuantity ?? 1, 'factory.outputQuantity');
  if (!Number.isSafeInteger(outputQuantity) || outputQuantity < 1) {
    throw new Error('Invalid item valuation rule: factory.outputQuantity.');
  }
  const ore = requiredNumber(action?.ore, 'factory.ore');
  const components = requiredNumber(action?.components, 'factory.components');
  if (ore < 0 || components < 0) throw new Error('Invalid factory production cost.');
  const batchCost = ore * oreGold * oreShare
    + components * minimumWorkerGoldPerComponent(catalog) * workerShare;
  return Math.ceil(batchCost / outputQuantity);
}

function factoryCostGold(catalog, item) {
  const actions = requiredCollection(catalog, 'factoryActions').filter(
    (candidate) => candidate.outputItemId === item.id
  );
  return actions.length
    ? Math.min(...actions.map((action) => factoryProductionFloorGold(catalog, action)))
    : 0;
}

function oilReturnGold(liters, rules) {
  return liters / requiredNumber(rules.oilLitersPerBarrel, 'oilLitersPerBarrel')
    * requiredNumber(rules.oilBarrelGold, 'oilBarrelGold');
}

function oilMachinePotentialGold(catalog, type, rarity, rules) {
  const machineRule = rules.machine?.[type];
  if (!machineRule) throw new Error(`Missing item valuation rule for Oil Field machine ${type}.`);
  const share = requiredNumber(machineRule.realizableShare, `machine.${type}.realizableShare`);
  if (machineRule.fixedLiters !== undefined) {
    return oilReturnGold(requiredNumber(machineRule.fixedLiters, `machine.${type}.fixedLiters`), rules)
      * share;
  }

  const lifeDays = requiredNumber(
    catalog.settings?.machine_life_days?.[rarity], `machine_life_days[${rarity}]`
  );
  const lifeHours = lifeDays * requiredNumber(catalog.settings?.day_ms, 'day_ms') / 3600000;
  if (machineRule.barrelsPerHour !== undefined) {
    return lifeHours * requiredNumber(machineRule.barrelsPerHour, `machine.${type}.barrelsPerHour`)
      * requiredNumber(rules.oilBarrelGold, 'oilBarrelGold') * share;
  }
  const power = requiredNumber(catalog.settings?.machine_power?.[rarity], `machine_power[${rarity}]`);
  let litersPerHour = power * requiredNumber(
    machineRule.litersPerPowerHour, `machine.${type}.litersPerPowerHour`
  );
  if (machineRule.fixedLitersPerHour !== undefined) {
    litersPerHour += requiredNumber(machineRule.fixedLitersPerHour,
      `machine.${type}.fixedLitersPerHour`);
  }
  return oilReturnGold(litersPerHour * lifeHours, rules) * share;
}

function directItemGoldValue(catalog, item, rules) {
  if (item.id === Number(catalog.settings.oil_item_id)) {
    return requiredNumber(rules.oilBarrelGold, 'oilBarrelGold');
  }
  if (item.id === Number(catalog.settings.ore_item_id)) {
    return requiredPositiveNumber(rules.oreCrateGold, 'oreCrateGold');
  }
  let value = rarityMinimumGold(rules, item.rarity);
  value += recipeDemandGold(catalog, item.id, rules);
  if (Object.prototype.hasOwnProperty.call(rules.utilityGoldByItemId, item.id)) {
    value += requiredNumber(rules.utilityGoldByItemId[item.id], `utilityGoldByItemId[${item.id}]`);
  }

  const equipment = catalog.equipmentByItemId.get(item.id);
  if (equipment) value += equipment.bucketsPerHour
    * requiredNumber(rules.equipmentBucketsPerHour, 'equipmentBucketsPerHour');

  const explosive = catalog.explosiveByItemId.get(item.id);
  if (explosive) value += explosive.buckets * requiredNumber(rules.explosiveBuckets, 'explosiveBuckets');

  const robot = catalog.robotByItemId.get(item.id);
  if (robot) value += robot.model * requiredNumber(rules.robotModel, 'robotModel');

  const vehicle = catalog.vehicleByItemId.get(item.id);
  if (vehicle) {
    value += vehicle.speed * requiredNumber(rules.vehicle.speed, 'vehicle.speed')
      + vehicle.capacity * requiredNumber(rules.vehicle.capacity, 'vehicle.capacity');
    if (vehicle.land) {
      value += vehicle.land.attack * requiredNumber(rules.vehicle.landAttack, 'vehicle.landAttack')
        + vehicle.land.armor * requiredNumber(rules.vehicle.landArmor, 'vehicle.landArmor');
    }
    if (vehicle.ship) {
      value += vehicle.ship.cannonPortals
        * requiredNumber(rules.vehicle.shipCannonPortals, 'vehicle.shipCannonPortals')
        + vehicle.ship.hull * requiredNumber(rules.vehicle.shipHull, 'vehicle.shipHull')
        + vehicle.ship.crew * requiredNumber(rules.vehicle.shipCrew, 'vehicle.shipCrew');
    }
    if (vehicle.aircraft) {
      value += requiredNumber(
        rules.vehicle.aircraftRole?.[vehicle.aircraft.type],
        `vehicle.aircraftRole[${vehicle.aircraft.type}]`
      );
    }
  }

  const weapon = catalog.weaponByItemId.get(item.id);
  if (weapon) value += (weapon.offense + weapon.defense)
    * requiredNumber(rules.weaponStat, 'weaponStat');

  const mod = catalog.modByItemId.get(item.id);
  if (mod) {
    value += Math.max(0,
      mod.capacity * requiredNumber(rules.mod.capacity, 'mod.capacity')
      + mod.attack * requiredNumber(rules.mod.attack, 'mod.attack')
      + mod.armor * requiredNumber(rules.mod.armor, 'mod.armor')
      + mod.offense * requiredNumber(rules.mod.offense, 'mod.offense')
      + mod.defense * requiredNumber(rules.mod.defense, 'mod.defense')
      + mod.dodge * requiredNumber(rules.mod.dodge, 'mod.dodge'));
  }

  const cannon = catalog.cannonByItemId.get(item.id);
  if (cannon) {
    value += cannon.damage * requiredNumber(rules.cannon.damage, 'cannon.damage')
      + cannon.rateOfFire * requiredNumber(rules.cannon.rateOfFire, 'cannon.rateOfFire');
  }

  if (catalog.cannonballByItemId.has(item.id)) {
    value += requiredNumber(rules.cannonball, 'cannonball');
  }

  const bomb = catalog.bombByItemId.get(item.id);
  if (bomb) value += bomb.buckets * requiredNumber(rules.bombBuckets, 'bombBuckets');

  if (catalog.boxByItemId.has(item.id)) value += requiredNumber(rules.box, 'box');

  const gadget = catalog.gadgetItemByItemId.get(item.id)?.gadget;
  if (gadget) {
    value += requiredNumber(
      rules.gadgetUtilityGold?.[gadget.behaviorKey] ?? rules.gadgetDefaultUtilityGold,
      `gadgetUtilityGold.${gadget.behaviorKey}`
    );
  }

  const machine = catalog.machineByItemId.get(item.id);
  if (machine) value += oilMachinePotentialGold(catalog, machine.type, item.rarity, rules);

  const avatar = catalog.avatarElementByItemId.get(item.id);
  if (avatar) {
    value += avatar.typeId === Number(catalog.settings.avatar_background_type_id)
      ? requiredNumber(rules.avatar.backgroundBase, 'avatar.backgroundBase')
        + item.rarity * requiredNumber(rules.avatar.backgroundPerRarity, 'avatar.backgroundPerRarity')
      : requiredNumber(rules.avatar.other, 'avatar.other');
  }

  return roundedGold(Math.max(value, factoryCostGold(catalog, item)));
}

function averageGoldValue(items) {
  if (!items.length) return 0;
  return items.reduce((sum, item) => sum + item.goldValue, 0) / items.length;
}

function addBaitPotential(catalog, rules) {
  const baitItems = catalog.items.filter((item) => item.repairedItemId === null
    && item.mineTypeId === Number(rules.baitMineTypeId));
  if (!baitItems.length) return;
  const fishByRarity = catalog.byMineType.get(Number(rules.fishMineTypeId));
  if (!(fishByRarity instanceof Map)) {
    throw new Error(`Missing discoverable fish catalog for mine type ${rules.fishMineTypeId}.`);
  }
  for (const bait of baitItems) {
    const fish = fishByRarity.get(bait.rarity) ?? [];
    const expectedCatchValue = averageGoldValue(fish);
    bait.goldValue = roundedGold(bait.goldValue + expectedCatchValue
      * requiredNumber(rules.baitCatchValueShare, 'baitCatchValueShare'));
  }
}

function expectedMineFindingGold(catalog, mineTypeId, minimum, maximum) {
  const itemsByRarity = catalog.byMineType.get(mineTypeId);
  if (!itemsByRarity) return null;
  const weightedRarities = [];
  const rarityRollBase = requiredNumber(catalog.settings?.rarity_roll_base, 'rarity_roll_base');
  for (let rarity = maximum; rarity >= minimum; rarity -= 1) {
    const candidates = itemsByRarity.get(rarity) ?? [];
    if (!candidates.length) continue;
    const difference = maximum - rarity;
    const weight = difference === 0
      ? 1
      : (rarityRollBase - 1) * (rarityRollBase ** (difference - 1));
    weightedRarities.push({ value: averageGoldValue(candidates), weight });
  }
  if (!weightedRarities.length) return null;
  const totalWeight = weightedRarities.reduce((sum, entry) => sum + entry.weight, 0);
  return weightedRarities.reduce((sum, entry) => sum + entry.value * entry.weight, 0) / totalWeight;
}

function expectedDwarfFindingGold(catalog, dwarfRarity, rules) {
  const { minimum, maximum } = dwarfFindRange(dwarfRarity, catalog.dwarfTiers);
  const excludedMineTypeIds = new Set(
    catalog.settings.item_value_excluded_mine_type_ids.map(Number)
  );
  const cityValues = [];
  for (const city of catalog.cities) {
    if (!(catalog.mineTypesByCity instanceof Map) || !catalog.mineTypesByCity.has(city.id)) {
      throw new Error(`Missing mine availability for city ${city.id} during item valuation.`);
    }
    const mineValues = catalog.mineTypesByCity.get(city.id)
      .filter((mineType) => !excludedMineTypeIds.has(mineType.id))
      .map((mineType) => expectedMineFindingGold(catalog, mineType.id, minimum, maximum))
      .filter((value) => value !== null);
    if (mineValues.length) {
      cityValues.push(mineValues.reduce((sum, value) => sum + value, 0) / mineValues.length);
    }
  }
  if (!cityValues.length) return 0;
  const typicalCityValue = cityValues.reduce((sum, value) => sum + value, 0) / cityValues.length;
  const bestCityValue = Math.max(...cityValues);
  return typicalCityValue * requiredNumber(rules.dwarfTypicalCityShare, 'dwarfTypicalCityShare')
    + bestCityValue * requiredNumber(rules.dwarfBestCityShare, 'dwarfBestCityShare');
}

function addDwarfPotential(catalog, rules) {
  const dwarfTiers = requiredCollection(catalog, 'dwarfTiers');
  if (!dwarfTiers.length) return;
  for (const item of catalog.items) {
    if (item.repairedItemId !== null) continue;
    const dwarf = dwarfTierForItem(item.id, dwarfTiers);
    if (!dwarf) continue;
    const expectedLifetimeFinds = 1 / dwarf.disappearanceChance;
    const expectedFindValue = expectedDwarfFindingGold(catalog, dwarf.rarity, rules);
    item.goldValue = roundedGold(item.goldValue + expectedFindValue * expectedLifetimeFinds
      * requiredNumber(rules.dwarfLifetimeOutputShare, 'dwarfLifetimeOutputShare'));
  }
}

export function assignItemGoldValues(catalog) {
  const rules = itemValueRules(catalog);
  for (const item of catalog.items) {
    if (item.repairedItemId === null) item.goldValue = directItemGoldValue(catalog, item, rules);
  }
  addBaitPotential(catalog, rules);
  addDwarfPotential(catalog, rules);
  for (const item of catalog.items) {
    if (item.repairedItemId === null) continue;
    const intact = catalog.byId.get(item.repairedItemId);
    if (!intact) throw new Error(`Missing intact catalog item ${item.repairedItemId}.`);
    const discountedValue = intact.goldValue
      * requiredNumber(rules.repairedItemValueShare, 'repairedItemValueShare');
    item.goldValue = roundedGold(Math.max(
      rarityMinimumGold(rules, item.rarity), discountedValue
    ));
  }
  return catalog;
}

export function itemGoldValueUnits(item) {
  const goldValue = Number(item?.goldValue);
  if (!Number.isFinite(goldValue) || goldValue <= 0) {
    throw new Error(`Invalid gold value for catalog item ${item?.id ?? 'unknown'}.`);
  }
  const units = Math.max(1, Math.round(goldValue * 10000));
  return units > 10000 ? Math.floor(units / 10000) * 10000 : units;
}
