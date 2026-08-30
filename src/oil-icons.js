export const OIL_ICON_ITEM_IDS = Object.freeze([1294]);

const OIL_ICON_ITEM_ID_SET = new Set(OIL_ICON_ITEM_IDS);

export function oilIconPath(itemId) {
  const id = Number(itemId);
  if (!Number.isSafeInteger(id) || !OIL_ICON_ITEM_ID_SET.has(id)) return null;
  return `/node/oil/item-${id}.svg`;
}
