export const WEAPON_ICON_ITEM_IDS = Object.freeze(
  Array.from({ length: 30 }, (_, index) => 157 + index)
);

const WEAPON_ICON_ITEM_ID_SET = new Set(WEAPON_ICON_ITEM_IDS);

export function weaponIconPath(itemId) {
  const id = Number(itemId);
  if (!Number.isSafeInteger(id) || !WEAPON_ICON_ITEM_ID_SET.has(id)) return null;
  return `/node/weapons/weapon-${id}.svg`;
}
