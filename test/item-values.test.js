import assert from 'node:assert/strict';
import test from 'node:test';
import {
  indexCatalog, LEGACY_ITEM_VALUE_RULES, loadLegacyCatalog
} from '../src/legacy-catalog.js';

function item(id, name, rarity, mineTypeId) {
  return {
    id,
    name,
    rarity,
    mineTypeId,
    repairedItemId: null,
    canFind: true
  };
}

function pricedCatalog(overrides = {}) {
  const { settings = {}, ...catalogOverrides } = overrides;
  return indexCatalog({
    validateReferences: false,
    mineTypes: [],
    cities: [],
    items: [],
    settings: {
      item_value_excluded_mine_type_ids: [],
      item_value_rules: structuredClone(LEGACY_ITEM_VALUE_RULES),
      oil_item_id: 1294,
      avatar_background_type_id: 2,
      machine_life_days: [0, 0.5, 3, 6, 9, 12, 15],
      machine_power: [0, 1, 1, 2, 2, 3, 3],
      day_ms: 86400000,
      rarity_roll_base: 7,
      factory_worker_bot_contract_duration_ms: 10 * 60 * 60 * 1000,
      factory_worker_bot_tiers: [{ id: 1, name: 'Test worker', cph: 10, costGold: 100 }],
      ...settings
    },
    ...catalogOverrides
  });
}

function targetValueForMelds(recipeSpecs) {
  const meldRequirements = [];
  const melds = recipeSpecs.map((spec, index) => {
    const meldId = index + 1;
    const requirements = [{
      id: meldRequirements.length + 1,
      meldId,
      itemId: 1,
      count: spec.targetCount
    }];
    if (!spec.sole) {
      requirements.push({
        id: meldRequirements.length + 2,
        meldId,
        itemId: 2,
        count: 1
      });
    }
    meldRequirements.push(...requirements);
    return {
      id: meldId,
      name: `Recipe ${meldId}`,
      rarity: 2,
      requirements
    };
  });
  return pricedCatalog({
    items: [item(1, 'Target', 1, 1), item(2, 'Support', 1, 1)],
    melds,
    meldRequirements
  }).byId.get(1).goldValue;
}

test('prices bait from the average value of the fish it can catch', () => {
  const catalog = pricedCatalog({
    items: [
      item(100, 'Squid', 6, 14),
      item(101, 'First legendary fish', 6, 15),
      item(102, 'Second legendary fish', 6, 15)
    ],
    equipment: [{ id: 1, itemId: 102, typeId: 1, bucketsPerHour: 10, rarity: 6 }]
  });
  const fish = [catalog.byId.get(101), catalog.byId.get(102)];
  const averageFishValue = fish.reduce((sum, candidate) => sum + candidate.goldValue, 0) / fish.length;
  assert.equal(averageFishValue, 8404.25);
  assert.equal(catalog.byId.get(100).goldValue, 11344.9875);
});

test('prices Dwarves from their expected lifetime findings and stable item IDs', () => {
  const valueWithFinding = (findingId, findingName) => pricedCatalog({
    mineTypes: [{ id: 1, name: 'Useful things' }, { id: 23, name: 'Dwarves' }],
    cities: [{ id: 1, name: 'Test city' }],
    cityMineTypes: [{ id: 1, cityId: 1, mineTypeId: 1 }],
    dwarfTiers: [{
      itemId: 1073, rarity: 4, minimumFindRarity: 2, maximumFindRarity: 4,
      disappearanceChance: 0.05, stowawayWeight: 4
    }],
    items: [
      item(1073, 'Red Dwarf', 4, 23),
      item(findingId, findingName, 4, 1)
    ]
  }).byId.get(1073).goldValue;

  const ordinaryFinds = valueWithFinding(2000, 'Ordinary find');
  const valuableFinds = valueWithFinding(368, 'Renamed utility item');
  assert.equal(ordinaryFinds, 2200.9163);
  assert.equal(valuableFinds, 2250.9163);
  assert.ok(valuableFinds > ordinaryFinds);
});

test('meld demand rewards recipe breadth, required quantity, and sole ingredients', () => {
  const oneRecipeTwoUnits = targetValueForMelds([{ targetCount: 2 }]);
  const twoRecipesOneUnitEach = targetValueForMelds([
    { targetCount: 1 },
    { targetCount: 1 }
  ]);
  assert.ok(twoRecipesOneUnitEach > oneRecipeTwoUnits,
    'being required by more distinct melds should increase value');

  assert.ok(targetValueForMelds([{ targetCount: 5 }])
    > targetValueForMelds([{ targetCount: 1 }]),
  'requiring more units should increase value');

  assert.ok(targetValueForMelds([{ targetCount: 1, sole: true }])
    > targetValueForMelds([{ targetCount: 1 }]),
  'being the sole ingredient in a meld should add a premium');
});

test('enforces rarity floors and prices Oil Field returns and defenses', () => {
  const catalog = loadLegacyCatalog();
  const rarityMinimumGold = catalog.settings.item_value_rules.rarityMinimumGold;
  const oilBarrelGold = catalog.settings.item_value_rules.oilBarrelGold;
  assert.deepEqual(rarityMinimumGold,
    [0.01, 0.5833, 4.0833, 28.5833, 200.0833, 1400.5833, 8403.5]);
  assert.ok(catalog.items.every((candidate) =>
    candidate.goldValue >= rarityMinimumGold[candidate.rarity]));
  assert.ok(catalog.items.filter((candidate) => candidate.rarity === 5)
    .every((candidate) => candidate.goldValue >= rarityMinimumGold[5]));
  assert.ok(catalog.items.filter((candidate) => candidate.rarity === 6)
    .every((candidate) => candidate.goldValue >= rarityMinimumGold[6]));

  const oil = catalog.byId.get(catalog.settings.oil_item_id);
  assert.equal(oil.goldValue, oilBarrelGold);
  const ore = catalog.byId.get(catalog.settings.ore_item_id);
  assert.equal(ore.goldValue, 10);

  const workerHours = catalog.settings.factory_worker_bot_contract_duration_ms / 3600000;
  const cheapestWorkerGoldPerComponent = Math.min(
    ...catalog.settings.factory_worker_bot_tiers.map(
      (tier) => tier.costGold / (tier.cph * workerHours)
    )
  );
  for (const action of catalog.factoryActions.filter(
    (candidate) => candidate.actionKind === 'item'
  )) {
    const expectedFloor = Math.ceil((
      action.ore * catalog.settings.item_value_rules.oreCrateGold
      + action.components * cheapestWorkerGoldPerComponent
    ) / action.outputQuantity);
    assert.ok(catalog.byId.get(action.outputItemId).goldValue >= expectedFloor,
      `${action.name} should cover Ore and the cheapest Worker Bot contract`);
  }

  const machineItem = (type) => {
    const machine = catalog.machines.find((candidate) => candidate.type === type);
    assert.ok(machine, `Expected ${type} machine`);
    return catalog.byId.get(machine.itemId);
  };
  const pads = catalog.machines.filter((candidate) => candidate.type === 'pad')
    .map((candidate) => catalog.byId.get(candidate.itemId))
    .sort((first, second) => first.rarity - second.rarity);
  assert.ok(pads[1].goldValue > pads[0].goldValue);
  assert.ok(pads[2].goldValue > pads[1].goldValue);
  assert.ok(pads[2].goldValue > oilBarrelGold);

  const defenseDrone = machineItem('drone');
  const flak = machineItem('flak');
  const otherTierFourMachines = catalog.machines
    .map((machine) => catalog.byId.get(machine.itemId))
    .filter((candidate) => candidate.rarity === 4 && candidate.id !== defenseDrone.id);
  const otherTierFiveMachines = catalog.machines
    .map((machine) => catalog.byId.get(machine.itemId))
    .filter((candidate) => candidate.rarity === 5 && candidate.id !== flak.id);
  assert.ok(defenseDrone.goldValue > Math.max(...otherTierFourMachines.map((item) => item.goldValue)));
  assert.ok(flak.goldValue > Math.max(...otherTierFiveMachines.map((item) => item.goldValue)));
});

test('uses database-shaped valuation rules and factory output IDs instead of names', () => {
  const rules = structuredClone(LEGACY_ITEM_VALUE_RULES);
  rules.oreCrateGold = 12;
  const catalog = pricedCatalog({
    settings: { item_value_rules: rules },
    items: [item(9000, 'Completely renamed output', 1, 1)],
    factoryActions: [{
      id: 1, name: 'Also renamed', ore: 3, components: 20, actionKind: 'item',
      outputItemId: 9000, outputQuantity: 2
    }]
  });
  assert.equal(catalog.byId.get(9000).goldValue, 28);
});
