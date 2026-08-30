export const CANNON_ICON_ITEM_IDS = Object.freeze([
  301, 302, 303, 304, 305, 306, 307, 308, 309,
  1074, 1075, 1076, 1077, 1078, 1079, 1091, 1092, 1093, 1094, 1095, 1096,
  1107, 1269, 1270, 1271
]);

const CANNON_ICON_ITEM_ID_SET = new Set(CANNON_ICON_ITEM_IDS);

export function cannonIconPath(itemId) {
  const id = Number(itemId);
  if (!Number.isSafeInteger(id) || !CANNON_ICON_ITEM_ID_SET.has(id)) return null;
  return `/node/cannons/item-${id}.svg`;
}
