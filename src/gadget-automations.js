export const GADGET_AUTOMATION_REPLACEMENTS = Object.freeze([
  Object.freeze({
    gadgetId: 5,
    legacyBehaviorKey: 'ledger',
    legacyDisplayName: 'Ledger',
    behaviorKey: 'autoloader',
    displayName: 'Autoloader',
    description: 'Keeps up to ten ships supplied with selected ammunition from stock in their port cities, taking one task per interval in round-robin order.'
  }),
  Object.freeze({
    gadgetId: 6,
    legacyBehaviorKey: 'calculator',
    legacyDisplayName: 'Calculator',
    behaviorKey: 'autolister',
    displayName: 'Autolister',
    description: 'Lists every unlisted found or factory-made Thing of up to ten selected types in their cities at configured markups over each Thing\'s local reference price, taking one task per interval in round-robin order.'
  }),
  Object.freeze({
    gadgetId: 11,
    legacyBehaviorKey: 'spreadsheet',
    legacyDisplayName: 'Spreadsheet',
    behaviorKey: 'automaker',
    displayName: 'Automaker',
    description: 'Feeds selected manufactured items into up to ten owned factory queues, taking one task per interval in round-robin order.'
  }),
  Object.freeze({
    gadgetId: 12,
    legacyBehaviorKey: 'medal_detector',
    legacyDisplayName: 'Meldal Detector',
    behaviorKey: 'automelder',
    displayName: 'Automelder',
    description: 'Stages available recipe things for up to ten selected Melds from regional capitals, taking one task per interval in round-robin order.'
  })
]);

export const GADGET_AUTOMATION_BEHAVIOR_KEYS = Object.freeze(
  GADGET_AUTOMATION_REPLACEMENTS.map((replacement) => replacement.behaviorKey)
);

export const GADGET_AUTOMATION_INTERVAL_MINUTES = Object.freeze([5, 15, 60, 360, 1440]);
export const DEFAULT_GADGET_AUTOMATION_INTERVAL_MINUTES = 15;
export const MAX_AUTOLISTER_MARKUP_PERCENT = 1000;
export const GADGET_AUTOMATION_MAX_TASKS = 10;
export const MAX_AUTOLOADER_CRATES_PER_TASK = 1000;

export const GADGET_AUTOMATION_LEGENDARY_ITEMS = Object.freeze([
  Object.freeze({ gadgetId: 5, gadgetItemId: 40, itemId: 1589, damagedItemId: 1593,
    marketableId: 1589, mineTypeId: 10 }),
  Object.freeze({ gadgetId: 6, gadgetItemId: 41, itemId: 1590, damagedItemId: 1594,
    marketableId: 1590, mineTypeId: 20 }),
  Object.freeze({ gadgetId: 11, gadgetItemId: 42, itemId: 1591, damagedItemId: 1595,
    marketableId: 1591, mineTypeId: 10 }),
  Object.freeze({ gadgetId: 12, gadgetItemId: 43, itemId: 1592, damagedItemId: 1596,
    marketableId: 1592, mineTypeId: 10 })
]);

export function gadgetAutomationReplacement(behaviorKey) {
  return GADGET_AUTOMATION_REPLACEMENTS.find(
    (replacement) => replacement.behaviorKey === behaviorKey
  ) ?? null;
}

export function applyGadgetAutomationCatalog(gadgets, gadgetItems, items) {
  const replacementByGadgetId = new Map(
    GADGET_AUTOMATION_REPLACEMENTS.map((replacement) => [replacement.gadgetId, replacement])
  );
  for (const gadget of gadgets) {
    const replacement = replacementByGadgetId.get(Number(gadget.id));
    if (!replacement) continue;
    Object.assign(gadget, {
      name: replacement.behaviorKey,
      behaviorKey: replacement.behaviorKey,
      displayName: replacement.displayName,
      description: replacement.description,
      hasPage: true
    });
  }

  const replacementByItemId = new Map();
  for (const link of gadgetItems) {
    const replacement = replacementByGadgetId.get(Number(link.gadgetId));
    if (replacement) replacementByItemId.set(Number(link.itemId), replacement);
  }
  for (const item of items) {
    const replacement = replacementByItemId.get(Number(item.id))
      ?? replacementByItemId.get(Number(item.repairedItemId));
    if (!replacement) continue;
    const damagedPrefix = item.name.startsWith('Damaged ') ? 'Damaged ' : '';
    const cleanName = damagedPrefix ? item.name.slice(damagedPrefix.length) : item.name;
    const material = cleanName.endsWith(replacement.legacyDisplayName)
      ? cleanName.slice(0, -replacement.legacyDisplayName.length).trim()
      : cleanName.split(' ')[0];
    const promotedCalculator = [276, 634].includes(Number(item.id));
    item.name = `${damagedPrefix}${promotedCalculator ? 'Tungsten' : material} ${replacement.displayName}`;
    if (promotedCalculator) item.rarity = 5;
  }

  const damagedDescription = 'This is a damaged item. It cannot be used or sold in its current state. It must be repaired at a factory.';
  for (const specification of GADGET_AUTOMATION_LEGENDARY_ITEMS) {
    const replacement = replacementByGadgetId.get(specification.gadgetId);
    const icon = `/node/gadgets/gadget-${specification.itemId}.svg`;
    if (!gadgetItems.some((entry) => Number(entry.itemId) === specification.itemId)) {
      gadgetItems.push({
        id: specification.gadgetItemId,
        gadgetId: specification.gadgetId,
        itemId: specification.itemId
      });
    }
    if (!items.some((item) => Number(item.id) === specification.itemId)) {
      items.push({
        id: specification.itemId,
        name: `Legendary ${replacement.displayName}`,
        rarity: 6,
        description: `${replacement.description} Legendary machinery can sustain the full ten-task round-robin queue.`,
        marketableId: specification.marketableId,
        mineTypeId: specification.mineTypeId,
        repairedItemId: null,
        canFind: true,
        icon,
        iconSource: 'gadget-svg',
        damaged: false,
        largeImageFilename: null,
        largeImage: icon,
        hasLargeImage: true
      });
    }
    if (!items.some((item) => Number(item.id) === specification.damagedItemId)) {
      items.push({
        id: specification.damagedItemId,
        name: `Damaged Legendary ${replacement.displayName}`,
        rarity: 6,
        description: damagedDescription,
        marketableId: null,
        mineTypeId: specification.mineTypeId,
        repairedItemId: specification.itemId,
        canFind: true,
        icon,
        iconSource: 'damaged-gadget-svg',
        damaged: true,
        largeImageFilename: null,
        largeImage: icon,
        hasLargeImage: true
      });
    }
  }
  return { gadgets, gadgetItems, items };
}
