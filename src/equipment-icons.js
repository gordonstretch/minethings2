export const EQUIPMENT_ICON_ITEM_IDS = Object.freeze([
  ...Array.from({ length: 42 }, (_, index) => 51 + index),
  730
]);
export const EQUIPMENT_ICON_VERSION = 2;

const EQUIPMENT_ICON_ITEM_ID_SET = new Set(EQUIPMENT_ICON_ITEM_IDS);

export function equipmentIconPath(itemId) {
  const id = Number(itemId);
  if (!Number.isSafeInteger(id) || !EQUIPMENT_ICON_ITEM_ID_SET.has(id)) return null;
  return `/node/equipment/equipment-${id}.svg?v=${EQUIPMENT_ICON_VERSION}`;
}
