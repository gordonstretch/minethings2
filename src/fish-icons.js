export const FISH_ICON_ITEM_IDS = Object.freeze([
  316, 317, 318, 319, 320, 321, 322, 323,
  324, 325, 326, 327, 328, 329, 330, 331,
  332, 333, 334, 335, 336, 337, 338, 339
]);

const FISH_ICON_ITEM_ID_SET = new Set(FISH_ICON_ITEM_IDS);

export function fishIconPath(itemId) {
  const id = Number(itemId);
  if (!Number.isSafeInteger(id) || !FISH_ICON_ITEM_ID_SET.has(id)) return null;
  return `/node/fish/item-${id}.svg`;
}
