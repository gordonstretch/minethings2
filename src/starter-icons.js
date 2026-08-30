export const STARTER_ICON_ITEM_IDS = Object.freeze([
  1, 2, 3, 4, 6, 7, 8, 9, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
  24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 41, 42,
  43, 44, 45, 46, 47, 48, 95, 96, 100, 101, 102
]);

const STARTER_ICON_ITEM_ID_SET = new Set(STARTER_ICON_ITEM_IDS);

export function starterIconPath(itemId) {
  const id = Number(itemId);
  if (!Number.isSafeInteger(id) || !STARTER_ICON_ITEM_ID_SET.has(id)) return null;
  return `/node/starter/item-${id}.svg`;
}
