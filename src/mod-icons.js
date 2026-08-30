export const MOD_ICON_ITEM_IDS = Object.freeze(
  Array.from({ length: 72 }, (_, index) => 1108 + index)
);

const MOD_ICON_ITEM_ID_SET = new Set(MOD_ICON_ITEM_IDS);

export function modIconPath(itemId) {
  const id = Number(itemId);
  if (!Number.isSafeInteger(id) || !MOD_ICON_ITEM_ID_SET.has(id)) return null;
  return `/node/mods/item-${id}.svg`;
}
