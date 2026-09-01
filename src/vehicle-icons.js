export const LAND_VEHICLE_ICON_ITEM_IDS = Object.freeze([
  5, 139, 140, 141, 142, 143, 144, 145, 146, 147, 148, 149, 150, 151, 152, 153,
  154, 155, 156, 217, 218, 219, 220, 221, 222, 1253, 1254, 1255, 1256, 1257, 1258,
  1265, 1403, 1585
]);

export const SEA_VEHICLE_ICON_ITEM_IDS = Object.freeze([
  283, 284, 285, 289, 290, 291, 292, 293, 294, 295, 296, 297, 298, 299, 300,
  731, 733, 734, 735, 736, 1087, 1088, 1089, 1090, 1266, 1390, 1391, 1392,
  1393, 1394, 1395, 1402, 1584
]);

export const AIR_VEHICLE_ICON_ITEM_IDS = Object.freeze([737, 738, 739]);

export const VEHICLE_ICON_ITEM_IDS = Object.freeze([
  ...LAND_VEHICLE_ICON_ITEM_IDS,
  ...SEA_VEHICLE_ICON_ITEM_IDS,
  ...AIR_VEHICLE_ICON_ITEM_IDS
].sort((first, second) => first - second));

const VEHICLE_ICON_ITEM_ID_SET = new Set(VEHICLE_ICON_ITEM_IDS);

export function vehicleIconPath(itemId) {
  const id = Number(itemId);
  if (!Number.isSafeInteger(id) || !VEHICLE_ICON_ITEM_ID_SET.has(id)) return null;
  return `/node/vehicles/vehicle-${id}.svg`;
}
