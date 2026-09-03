import assert from 'node:assert/strict';
import test from 'node:test';
import { randomDwarfTier } from '../src/dwarves.js';
import {
  BOLT_BOX_CATALOG, ELECTRONICS_CATALOG, INVENTORY_CAPACITY_RULES, loadLegacyCatalog, parseValues,
  RELICS_CATALOG, SHROOM_CATALOG,
  WISDOM_CATALOG, WOOD_CATALOG
} from '../src/legacy-catalog.js';

test('parses MySQL values including escaped apostrophes and nulls', () => {
  assert.deepEqual(parseValues("(1, 'Tzolk\\'in', NULL),\n(2, '50\\\" HDTV', 3)"), [
    [1, "Tzolk'in", null],
    [2, '50" HDTV', 3]
  ]);
});

test('loads the playable catalog from the legacy dump', () => {
  const catalog = loadLegacyCatalog();
  assert.equal(catalog.items.length, 1555);
  assert.equal(catalog.discoverableItems.length, 844);
  assert.equal(catalog.cities[0].name, "Tzolk'in");
  assert.equal(catalog.mineTypes.find((type) => type.id === 1).name, 'Starter');
  assert.deepEqual(catalog.mineTypes.filter((type) => [1, 4, 5].includes(type.id))
    .map((type) => type.icon), [
    '/node/mines/mine-1.svg', '/node/mines/mine-4.svg', '/node/mines/mine-5.svg'
  ]);
  assert.equal(catalog.byId.get(1).name, 'Sneakers');
  assert.ok(catalog.byMineType.get(1).get(1).length > 0);
  assert.equal(catalog.routes.length, 12);
  assert.equal(catalog.cityMineTypes.length, 15);
  assert.deepEqual(catalog.mineTypesByCity.get(2).map((mineType) => mineType.name), ['Bugs', 'Machines', 'Music']);
  assert.ok(catalog.vehicles.length > 50);
  assert.ok(catalog.vehicleByItemId.size > 50);
  const welcomePack = catalog.settings.starter_welcome_pack;
  const welcomeVehicle = catalog.vehicleByItemId.get(welcomePack.vehicleItemId);
  assert.equal(catalog.byId.get(welcomePack.vehicleItemId).name, 'Camel');
  assert.equal(catalog.byId.get(welcomePack.vehicleItemId).rarity, 1);
  assert.equal(welcomeVehicle.routeType, catalog.settings.route_type_ids.land);
  assert.equal(welcomePack.dwarfItemId, 1348);
  assert.equal(catalog.byId.get(welcomePack.dwarfItemId).name, 'Green Dwarf');
  assert.equal(catalog.dwarfTiers.find((tier) => tier.itemId === welcomePack.dwarfItemId)?.rarity, 2);
  assert.deepEqual(welcomePack.gadgetItemIds.map((itemId) => {
    const item = catalog.byId.get(itemId);
    const gadget = catalog.gadgetItemByItemId.get(itemId)?.gadget;
    return { name: item?.name, rarity: item?.rarity, behavior: gadget?.behaviorKey };
  }), [
    { name: 'Tin Shield', rarity: 1, behavior: 'shield' },
    { name: 'Tin Turbo Engine', rarity: 1, behavior: 'turbo' },
    { name: 'Tin Radar', rarity: 1, behavior: 'radar' }
  ]);
  assert.deepEqual(welcomePack.itemGrants.map((grant) => ({
    name: catalog.byId.get(grant.itemId)?.name,
    quantity: grant.quantity,
    machine: catalog.machineByItemId.get(grant.itemId)?.type ?? null,
    explosive: catalog.explosiveByItemId.has(grant.itemId)
  })), [
    { name: 'Tin Pad', quantity: 1, machine: 'pad', explosive: false },
    { name: 'Tin Pump', quantity: 1, machine: 'pump', explosive: false },
    { name: 'Tin Pipe200', quantity: 4, machine: 'pipe200', explosive: false },
    { name: 'M-80', quantity: 5, machine: null, explosive: true }
  ]);
  assert.deepEqual(welcomePack.rentalMineTypeIds, [4, 5]);
  assert.deepEqual(welcomePack.rentalMineTypeIds.map((mineTypeId) =>
    catalog.mineTypes.find((mineType) => mineType.id === mineTypeId)?.name),
  ['Equipment', 'Vehicles']);
  assert.deepEqual({
    cryptoTypeId: welcomePack.cryptoTypeId,
    cryptoQuantity: welcomePack.cryptoQuantity,
    casinoVoucherCryptoTypeId: welcomePack.casinoVoucherCryptoTypeId,
    casinoVoucherQuantity: welcomePack.casinoVoucherQuantity
  }, {
    cryptoTypeId: 1, cryptoQuantity: 5,
    casinoVoucherCryptoTypeId: 1, casinoVoucherQuantity: 100
  });
  assert.equal(catalog.equipment.length, 43);
  assert.equal(catalog.explosives.length, 6);
  assert.equal(catalog.robots.length, 28);
  assert.equal(catalog.equipmentByItemId.get(51).bucketsPerHour, 1);
  assert.equal(catalog.explosiveByItemId.get(277).buckets, 91);
  assert.equal(catalog.robotByItemId.get(340).model, 3);
  assert.equal(catalog.byId.get(51).icon, '/node/equipment/equipment-51.svg?v=2');
  assert.equal(catalog.byId.get(277).icon, '/node/explosives/explosive-277.svg');
  assert.equal(catalog.byId.get(340).icon, '/legacy/img/equipment/src/MR3.png');
  assert.equal(catalog.byId.get(358).icon, '/legacy/img/icons/I4.png');
  assert.equal(catalog.items.find((item) => item.name === 'Search Plane').icon,
    '/node/vehicles/vehicle-737.svg');
  assert.match(catalog.byId.get(catalog.machineById.get(6).itemId).icon,
    /^\/node\/machine-icons\/pump-[0-6]\.svg$/);
  const avatar = catalog.avatarElements[0];
  assert.equal(catalog.byId.get(avatar.itemId).icon,
    `/node/avatars/avatar-${avatar.itemId}.svg?v=2`);
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
  assert.equal(catalog.melds.length, 221);
  assert.equal(catalog.meldRequirements.length, 782);
  assert.equal(catalog.gadgets.length, 13);
  assert.equal(catalog.gadgetItems.length, 38);
  assert.equal(catalog.factoryActions.length, 21);
  const boltBox = catalog.byId.get(catalog.settings.bolt_box_item_id);
  const boltBoxAction = catalog.factoryActions.find((action) =>
    action.outputItemId === boltBox.id);
  assert.equal(boltBox.name, BOLT_BOX_CATALOG.items[0].name);
  assert.equal(boltBox.canFind, false);
  assert.equal(boltBoxAction.outputQuantity, 1);
  assert.equal(catalog.settings.bolts_per_box, 20);
  assert.deepEqual(catalog.settings.factory_worker_bot_tiers.map((tier) => ({
    id: tier.id, cph: tier.cph, costGold: tier.costGold
  })), [
    { id: 1, cph: 25, costGold: 1000 },
    { id: 2, cph: 100, costGold: 5000 },
    { id: 3, cph: 400, costGold: 25000 }
  ]);
  assert.equal(catalog.machineTypes.length, 33);
  assert.equal(catalog.machines.length, 46);
  assert.equal(catalog.machineById.get(6).type, 'pump');
  assert.equal(catalog.meldById.get(52).name, 'Sunday');
  assert.equal(catalog.gadgetItemByItemId.get(265).gadget.name, 'hammer');
  assert.equal(catalog.avatarElementTypes.length, 7);
  assert.equal(catalog.avatarElements.length, 156);
  assert.equal(catalog.avatarElementByItemId.get(avatar.itemId).id, avatar.id);
  assert.equal(catalog.avatarElementTypeById.get(avatar.typeId).name, 'Borders');
  assert.equal(catalog.stones.length, 69);
  assert.equal(catalog.stones[0].name, 'Chatted');
  assert.equal(catalog.stones.at(-1).name, 'Completionist');
  assert.equal(catalog.stones.find((stone) => stone.name === 'Jackpotted').rarity, 6);
  assert.equal(catalog.settings.starter_item_limit, INVENTORY_CAPACITY_RULES.base);
  assert.equal(catalog.containers.reduce((sum, container) => sum + container.capacity, 0),
    INVENTORY_CAPACITY_RULES.maximum - INVENTORY_CAPACITY_RULES.base);
  assert.deepEqual(catalog.containers.map(({ id, capacity }) => ({ id, capacity })),
    Object.entries(INVENTORY_CAPACITY_RULES.containerCapacities)
      .map(([id, capacity]) => ({ id: Number(id), capacity })));

  const shrooms = catalog.items.filter((item) =>
    item.mineTypeId === SHROOM_CATALOG.mineType.id);
  assert.equal(catalog.mineTypes.find((mineType) =>
    mineType.id === SHROOM_CATALOG.mineType.id).name, 'Shrooms');
  assert.equal(shrooms.length, 30);
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((rarity) =>
    shrooms.filter((item) => item.rarity === rarity).length), [5, 5, 5, 5, 5, 5]);
  assert.deepEqual(shrooms.map((item) => item.icon),
    SHROOM_CATALOG.items.map((item) => item.icon));
  assert.ok(shrooms.every((item) => item.canFind && item.hasLargeImage
    && item.description.length > 20));
  assert.deepEqual(catalog.melds.filter((meld) =>
    meld.mineTypeId === SHROOM_CATALOG.mineType.id).map((meld) => meld.rarity),
  [1, 2, 3, 4, 5, 6]);
  assert.equal(new Set(SHROOM_CATALOG.meldRequirements.map((requirement) =>
    requirement.itemId)).size, 30);
  assert.ok(shrooms.filter((item) => item.rarity >= 5).every((item) =>
    /magic|magical/u.test(item.description)));

  const wood = catalog.items.filter((item) =>
    item.mineTypeId === WOOD_CATALOG.mineType.id);
  assert.equal(catalog.mineTypes.find((mineType) =>
    mineType.id === WOOD_CATALOG.mineType.id).name, 'Wood');
  assert.equal(wood.length, 30);
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((rarity) =>
    wood.filter((item) => item.rarity === rarity).length), [5, 5, 5, 5, 5, 5]);
  assert.ok(wood.every((item) => item.hasLargeImage && item.description.length > 20));
  assert.deepEqual(wood.filter((item) => item.rarity === 1 && item.canFind)
    .map((item) => item.id), [WOOD_CATALOG.screwItemId]);
  assert.ok(wood.filter((item) => item.rarity > 1).every((item) => item.canFind));
  assert.ok(wood.filter((item) => item.rarity >= 5).every((item) =>
    /magic|magical/u.test(item.description)));
  assert.equal(catalog.byId.get(WOOD_CATALOG.screwItemId).name, 'Wood Screws');
  const woodMelds = catalog.melds.filter((meld) =>
    meld.mineTypeId === WOOD_CATALOG.mineType.id);
  assert.deepEqual(woodMelds.map((meld) => meld.rarity), [1, 2, 3, 4, 5, 6]);
  assert.ok(woodMelds.every((meld) => meld.requirements.some((requirement) =>
    requirement.itemId === WOOD_CATALOG.screwItemId)));
  assert.ok(woodMelds.every((meld) => meld.requirements.some((requirement) =>
    requirement.itemId === WOOD_CATALOG.boltItemId
      && requirement.count >= 3 && requirement.count <= 8)));
  assert.ok(woodMelds.every((meld) => meld.requirements.every((requirement) =>
    requirement.itemId === WOOD_CATALOG.boltItemId
      || catalog.byId.get(requirement.itemId)?.canFind)));

  const wisdom = catalog.items.filter((item) =>
    item.mineTypeId === WISDOM_CATALOG.mineType.id);
  assert.equal(catalog.mineTypes.find((mineType) =>
    mineType.id === WISDOM_CATALOG.mineType.id).name, 'Wisdom');
  assert.equal(wisdom.length, 30);
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((rarity) =>
    wisdom.filter((item) => item.rarity === rarity).length), [5, 5, 5, 5, 5, 5]);
  assert.ok(wisdom.every((item) => item.canFind && item.hasLargeImage
    && item.description.split('\n').length === 3
    && item.description.split('\n').every((line) => line.length > 0)));
  const wisdomMelds = catalog.melds.filter((meld) =>
    meld.mineTypeId === WISDOM_CATALOG.mineType.id);
  assert.deepEqual(wisdomMelds.map((meld) => meld.rarity), [1, 2, 3, 4, 5, 6]);
  assert.ok(wisdomMelds.every((meld) => meld.requirements.length === 5));
  assert.deepEqual(wisdom.filter((item) => item.rarity === 6).map((item) => item.name),
    ['Invisible Cartel', 'Oilfield Deluge', 'Guild Puppeteer',
      'Exploit Cartographer', 'Ashen Empire']);

  const electronics = catalog.items.filter((item) =>
    item.mineTypeId === ELECTRONICS_CATALOG.mineType.id);
  assert.equal(catalog.mineTypes.find((mineType) =>
    mineType.id === ELECTRONICS_CATALOG.mineType.id).name, 'Electronic Devices');
  assert.equal(electronics.length, 30);
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((rarity) =>
    electronics.filter((item) => item.rarity === rarity).length), [5, 5, 5, 5, 5, 5]);
  assert.ok(electronics.every((item) => item.canFind && item.hasLargeImage
    && item.iconSource === 'electronics-svg' && item.description.length > 20));
  const electronicsMelds = catalog.melds.filter((meld) =>
    meld.mineTypeId === ELECTRONICS_CATALOG.mineType.id);
  assert.deepEqual(electronicsMelds.map((meld) => meld.rarity), [1, 2, 3, 4, 5, 6]);
  assert.ok(electronicsMelds.every((meld) => meld.requirements.length === 5));
  assert.equal(new Set(ELECTRONICS_CATALOG.meldRequirements.map((requirement) =>
    requirement.itemId)).size, 30);

  const relics = catalog.items.filter((item) =>
    item.mineTypeId === RELICS_CATALOG.mineType.id);
  assert.equal(catalog.mineTypes.find((mineType) =>
    mineType.id === RELICS_CATALOG.mineType.id).name, 'Relics');
  assert.equal(relics.length, 30);
  assert.deepEqual([1, 2, 3, 4, 5, 6].map((rarity) =>
    relics.filter((item) => item.rarity === rarity).length), [5, 5, 5, 5, 5, 5]);
  assert.ok(relics.every((item) => item.canFind && item.hasLargeImage
    && item.iconSource === 'relic-svg' && item.description.length > 20));
  assert.ok(relics.every((item) => !/definitely cursed|is cursed/iu.test(item.description)));
  assert.ok(relics.some((item) => /warning|discouraged|curse|unverified/iu.test(item.description)));
  const relicMelds = catalog.melds.filter((meld) =>
    meld.mineTypeId === RELICS_CATALOG.mineType.id);
  assert.deepEqual(relicMelds.map((meld) => meld.rarity), [1, 2, 3, 4, 5, 6]);
  assert.ok(relicMelds.every((meld) => meld.requirements.length === 5));
  assert.equal(new Set(RELICS_CATALOG.meldRequirements.map((requirement) =>
    requirement.itemId)).size, 30);
});
