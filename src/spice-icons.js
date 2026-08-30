export const SPICE_ICON_ITEM_IDS = Object.freeze(Array.from({ length: 36 }, (_, index) => 103 + index));

const SPICE_ICON_ITEM_ID_SET = new Set(SPICE_ICON_ITEM_IDS);

export function spiceIconPath(itemId) {
  const id = Number(itemId);
  if (!Number.isSafeInteger(id) || !SPICE_ICON_ITEM_ID_SET.has(id)) return null;
  return `/node/spices/item-${id}.svg`;
}
