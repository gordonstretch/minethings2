export const STARTER_MINE_TYPE_IDS = Object.freeze([1, 4, 5]);
export const SHOP_MINE_TYPE_IDS = Object.freeze([
  1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 21, 24, 25
]);

// Every live mine type receives a purpose-built symbol for the regional map. Keep
// these paths separate from the editable catalog artwork: the map needs a coherent
// cartographic language even when an administrator gives a mine custom market art.
export const MAP_MINE_TYPE_IDS = Object.freeze([
  1, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  21, 22, 23, 24, 25, 26, 27, 28, 29, 30
]);

export const OIL_FIELD_MAP_ICON_PATH = '/node/map-icons/oil-field.svg';

const STARTER_MINE_TYPE_ID_SET = new Set(STARTER_MINE_TYPE_IDS);
const SHOP_MINE_TYPE_ID_SET = new Set(SHOP_MINE_TYPE_IDS);
const MAP_MINE_TYPE_ID_SET = new Set(MAP_MINE_TYPE_IDS);

export function mineIconPath(mineTypeId) {
  const id = Number(mineTypeId);
  if (!Number.isSafeInteger(id) || !STARTER_MINE_TYPE_ID_SET.has(id)) return null;
  return `/node/mines/mine-${id}.svg`;
}

export function mineShopIconPath(mineTypeId) {
  const id = Number(mineTypeId);
  if (!Number.isSafeInteger(id) || !SHOP_MINE_TYPE_ID_SET.has(id)) return null;
  return `/node/mines/mine-${id}.svg`;
}

export function mineMapIconPath(mineTypeId) {
  const id = Number(mineTypeId);
  if (!Number.isSafeInteger(id) || !MAP_MINE_TYPE_ID_SET.has(id)) return null;
  return `/node/map-icons/mine-${id}.svg`;
}
