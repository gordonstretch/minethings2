export const MUSIC_ICON_ITEM_IDS = Object.freeze(
  Array.from({ length: 30 }, (_, index) => 223 + index)
);

const MUSIC_ICON_ITEM_ID_SET = new Set(MUSIC_ICON_ITEM_IDS);

export function musicIconPath(itemId) {
  const id = Number(itemId);
  if (!Number.isSafeInteger(id) || !MUSIC_ICON_ITEM_ID_SET.has(id)) return null;
  return `/node/music/music-${id}.svg`;
}
