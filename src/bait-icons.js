export const BAIT_ICON_ITEM_IDS = Object.freeze([310, 311, 312, 313, 314, 315]);

const BAIT_ICON_ITEM_ID_SET = new Set(BAIT_ICON_ITEM_IDS);

export function baitIconPath(itemId) {
  const id = Number(itemId);
  if (!Number.isSafeInteger(id) || !BAIT_ICON_ITEM_ID_SET.has(id)) return null;
  return `/node/bait/item-${id}.svg`;
}
