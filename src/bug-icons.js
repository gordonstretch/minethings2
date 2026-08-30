export const BUG_ICON_ITEM_IDS = Object.freeze(
  Array.from({ length: 30 }, (_, index) => 187 + index)
);

const BUG_ICON_ITEM_ID_SET = new Set(BUG_ICON_ITEM_IDS);

export function bugIconPath(itemId) {
  const id = Number(itemId);
  if (!Number.isSafeInteger(id) || !BUG_ICON_ITEM_ID_SET.has(id)) return null;
  return `/node/bugs/bug-${id}.svg`;
}
