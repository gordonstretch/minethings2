export const EXPLOSIVE_ICON_ITEM_IDS = Object.freeze(
  Array.from({ length: 6 }, (_, index) => 277 + index)
);

const EXPLOSIVE_ICON_ITEM_ID_SET = new Set(EXPLOSIVE_ICON_ITEM_IDS);

export function explosiveIconPath(itemId) {
  const id = Number(itemId);
  if (!Number.isSafeInteger(id) || !EXPLOSIVE_ICON_ITEM_ID_SET.has(id)) return null;
  return `/node/explosives/explosive-${id}.svg`;
}
