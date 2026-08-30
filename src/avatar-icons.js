export const AVATAR_ICON_ITEM_IDS = Object.freeze(
  Array.from({ length: 156 }, (_, index) => 761 + index)
);
export const AVATAR_ICON_VERSION = 2;

const AVATAR_ICON_ITEM_ID_SET = new Set(AVATAR_ICON_ITEM_IDS);

export function avatarIconPath(itemId) {
  const id = Number(itemId);
  if (!Number.isSafeInteger(id) || !AVATAR_ICON_ITEM_ID_SET.has(id)) return null;
  return `/node/avatars/avatar-${id}.svg?v=${AVATAR_ICON_VERSION}`;
}
