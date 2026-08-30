export const ORE_ICON_ITEM_IDS = Object.freeze([368]);

const ORE_ICON_ITEM_ID_SET = new Set(ORE_ICON_ITEM_IDS);

export function oreIconPath(itemId) {
  const id = Number(itemId);
  if (!Number.isSafeInteger(id) || !ORE_ICON_ITEM_ID_SET.has(id)) return null;
  return `/node/ore/item-${id}.svg`;
}
