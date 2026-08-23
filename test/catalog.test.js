import assert from 'node:assert/strict';
import test from 'node:test';
import { randomDwarfTier } from '../src/dwarves.js';
import { loadLegacyCatalog, parseValues } from '../src/legacy-catalog.js';

test('parses MySQL values including escaped apostrophes and nulls', () => {
  assert.deepEqual(parseValues("(1, 'Tzolk\\'in', NULL),\n(2, '50\\\" HDTV', 3)"), [
    [1, "Tzolk'in", null],
    [2, '50" HDTV', 3]
  ]);
});

test('loads the playable catalog from the legacy dump', () => {
  const catalog = loadLegacyCatalog();
  assert.equal(catalog.items.length, 1400);
  assert.equal(catalog.discoverableItems.length, 698);
  assert.equal(catalog.cities[0].name, "Tzolk'in");
  assert.equal(catalog.mineTypes.find((type) => type.id === 1).name, 'Starter');
  assert.equal(catalog.byId.get(1).name, 'Sneakers');
  assert.ok(catalog.byMineType.get(1).get(1).length > 0);
  assert.equal(catalog.routes.length, 12);
  assert.equal(catalog.cityMineTypes.length, 15);
  assert.deepEqual(catalog.mineTypesByCity.get(2).map((mineType) => mineType.name), ['Bugs', 'Machines', 'Music']);
  assert.ok(catalog.vehicles.length > 50);
  assert.ok(catalog.vehicleByItemId.size > 50);
  assert.equal(catalog.equipment.length, 43);
  assert.equal(catalog.explosives.length, 6);
  assert.equal(catalog.robots.length, 28);
  assert.equal(catalog.equipmentByItemId.get(51).bucketsPerHour, 1);
  assert.equal(catalog.explosiveByItemId.get(277).buckets, 91);
  assert.equal(catalog.robotByItemId.get(340).model, 3);
  assert.equal(catalog.byId.get(51).icon, '/legacy/img/equipment/src/FlimsyDrill.png');
  assert.equal(catalog.byId.get(277).icon, '/legacy/img/explosives/explosive1.png');
  assert.equal(catalog.byId.get(340).icon, '/legacy/img/equipment/src/MR3.png');
  assert.equal(catalog.byId.get(358).icon, '/legacy/img/icons/I4.png');
  assert.equal(catalog.items.find((item) => item.name === 'Search Plane').icon, '/legacy/img/icons/I5.png');
  assert.match(catalog.byId.get(catalog.machineById.get(6).itemId).icon,
    /^\/node\/machine-icons\/pump-[0-6]\.svg$/);
  const avatar = catalog.avatarElements[0];
  assert.equal(catalog.byId.get(avatar.itemId).icon,
    `/legacy/img/avatars/src/${encodeURIComponent(avatar.filename)}`);
  const damagedEquipment = catalog.items.find((item) => item.repairedItemId === 51);
  assert.equal(damagedEquipment.icon, catalog.byId.get(51).icon);
  assert.equal(damagedEquipment.damaged, true);
  assert.equal(catalog.damagedItems.length, 694);
  assert.ok(catalog.items.every((item) => Number.isFinite(item.goldValue) && item.goldValue > 0));
  assert.ok(catalog.byId.get(catalog.machineById.get(6).itemId).goldValue
    > catalog.items.find((item) => item.name === 'Tin Pipe200').goldValue,
  'same-rarity items should differ according to utility');
  assert.equal(damagedEquipment.goldValue,
    Math.max(catalog.settings.item_value_rules.rarityMinimumGold[damagedEquipment.rarity],
      Math.round(catalog.byId.get(51).goldValue * 0.3 * 10000) / 10000));
  assert.deepEqual(catalog.dwarfTiers.map((tier) => catalog.byId.get(tier.itemId)?.name),
    ['Yellow Dwarf', 'Green Dwarf', 'Blue Dwarf', 'Red Dwarf', 'Purple Dwarf', 'Orange Dwarf']);
  assert.ok(catalog.dwarfTiers.every((tier) => {
    const dwarf = catalog.byId.get(tier.itemId);
    return dwarf?.rarity === tier.rarity
      && dwarf.icon === `/legacy/img/icons/M23L${tier.rarity}.png`
      && dwarf.largeImage === `/node/dwarf-images/dwarf-${tier.rarity}.png`
      && dwarf.hasLargeImage;
  }));
  assert.deepEqual([16, 40, 52, 58, 61, 62.5]
    .map((roll) => randomDwarfTier(catalog.dwarfTiers, () => roll / 63).rarity),
  [1, 2, 3, 4, 5, 6]);
  assert.throws(() => randomDwarfTier(undefined), /Missing catalog Dwarf tier data/);
  assert.equal(catalog.melds.length, 191);
  assert.equal(catalog.meldRequirements.length, 620);
  assert.equal(catalog.gadgets.length, 13);
  assert.equal(catalog.gadgetItems.length, 38);
  assert.equal(catalog.factoryActions.length, 17);
  assert.equal(catalog.machineTypes.length, 33);
  assert.equal(catalog.machines.length, 46);
  assert.equal(catalog.machineById.get(6).type, 'pump');
  assert.equal(catalog.meldById.get(52).name, 'Sunday');
  assert.equal(catalog.gadgetItemByItemId.get(265).gadget.name, 'hammer');
  assert.equal(catalog.avatarElementTypes.length, 7);
  assert.equal(catalog.avatarElements.length, 156);
  assert.equal(catalog.avatarElementByItemId.get(avatar.itemId).id, avatar.id);
  assert.equal(catalog.avatarElementTypeById.get(avatar.typeId).name, 'Borders');
  assert.equal(catalog.stones.length, 42);
  assert.equal(catalog.stones[0].name, 'Chatted');
  assert.equal(catalog.stones.at(-1).rarity, 6);
});
