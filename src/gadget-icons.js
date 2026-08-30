export const GADGET_ICON_ITEM_IDS = Object.freeze([
  ...Array.from({ length: 24 }, (_, index) => 253 + index),
  742, 743,
  ...Array.from({ length: 12 }, (_, index) => 1404 + index)
]);

const GADGET_ICON_ITEM_ID_SET = new Set(GADGET_ICON_ITEM_IDS);

export function gadgetIconPath(itemId) {
  const id = Number(itemId);
  if (!Number.isSafeInteger(id) || !GADGET_ICON_ITEM_ID_SET.has(id)) return null;
  return `/node/gadgets/gadget-${id}.svg`;
}
