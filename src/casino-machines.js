import { resolveCasinoPull, validateCasinoRules } from './casino.js';

const GRID_SIZE = 9;
const MAXIMUM_CASCADES = 12;
const MAXIMUM_LOCKBOX_RESPINS = 24;
const MAXIMUM_HOLD_MS = 10_000;
const THING_O_MATIC_HOLD_MS = 3_000;
const MAXIMUM_REGIONAL_GRID_SIZE = 25;
const MAXIMUM_REGIONAL_PATTERNS = 24;

export const THING_O_MATIC_KEY = 'thing-o-matic';
export const BROMO_SPOREFALL_KEY = 'bromo-sporefall';
export const KINGS_LOCKBOX_KEY = 'kings-lockbox';

const REGIONAL_SYMBOL_CURVES = Object.freeze({
  6: Object.freeze({
    weights: Object.freeze([48, 25, 13, 7, 4, 3]),
    payouts: Object.freeze([1, 2, 4, 8, 16, 32])
  }),
  7: Object.freeze({
    weights: Object.freeze([52, 29, 16, 9, 5, 3, 1]),
    payouts: Object.freeze([1, 2, 3, 5, 8, 16, 40])
  }),
  8: Object.freeze({
    weights: Object.freeze([55, 32, 19, 11, 7, 4, 2, 1]),
    payouts: Object.freeze([1, 2, 3, 5, 8, 13, 21, 42])
  })
});

function regionalPatternRules({
  symbolItemIds, gridColumns, gridRows, winPatterns, jackpotBonusMultiplier
}) {
  const curve = REGIONAL_SYMBOL_CURVES[symbolItemIds.length];
  if (!curve) throw new Error('Regional casino cabinets need six, seven, or eight symbols.');
  return deepFreeze({
    version: 2,
    symbolItemIds: [...symbolItemIds],
    symbolWeightsByItemId: Object.fromEntries(symbolItemIds.map(
      (itemId, index) => [itemId, curve.weights[index]]
    )),
    payoutMultipliersByItemId: Object.fromEntries(symbolItemIds.map(
      (itemId, index) => [itemId, curve.payouts[index]]
    )),
    gridColumns,
    gridRows,
    gridSize: gridColumns * gridRows,
    winPatterns,
    jackpotItemId: symbolItemIds.at(-1),
    jackpotBonusMultiplier,
    jackpotChanceDenominator: 100000,
    holdMs: 650,
    minimumGoldWager: 1,
    maximumGoldWager: 1000,
    minimumCryptoWager: 1,
    maximumCryptoWager: 1000,
    historyLimit: 20
  });
}

const REGIONAL_MACHINE_BLUEPRINTS = [
  {
    key: 'cinderwake-fuse-five', name: 'Cinderwake Powder Line',
    regionId: 1, regionName: 'Aso', regionSlug: 'aso',
    rules: regionalPatternRules({
      symbolItemIds: [277, 162, 167, 172, 177, 182], gridColumns: 6, gridRows: 2,
      winPatterns: [
        { name: 'Upper short fuse', cells: [0, 1, 2], factor: 1 },
        { name: 'Upper long fuse', cells: [3, 4, 5], factor: 1 },
        { name: 'Lower short fuse', cells: [6, 7, 8], factor: 1 },
        { name: 'Lower long fuse', cells: [9, 10, 11], factor: 1 },
        { name: 'Left magazine', cells: [0, 1, 6, 7], factor: 3 },
        { name: 'Centre magazine', cells: [2, 3, 8, 9], factor: 3 },
        { name: 'Right magazine', cells: [4, 5, 10, 11], factor: 3 },
        { name: 'Everything goes up', cells: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], factor: 12 }
      ],
      jackpotBonusMultiplier: 750
    })
  },
  {
    key: 'ashfall-spore-ring', name: 'Ashfall Spore Ring',
    regionId: 2, regionName: 'Bromo', regionSlug: 'bromo',
    rules: regionalPatternRules({
      symbolItemIds: [1434, 207, 312, 1437, 328, 1438, 1439], gridColumns: 5, gridRows: 4,
      winPatterns: [
        { name: 'Canopy', cells: [0, 1, 2, 3, 4], factor: 5 },
        { name: 'High garden', cells: [5, 6, 7, 8, 9], factor: 5 },
        { name: 'Low garden', cells: [10, 11, 12, 13, 14], factor: 5 },
        { name: 'Root bed', cells: [15, 16, 17, 18, 19], factor: 5 },
        { name: 'First rain', cells: [0, 5, 10, 15], factor: 3 },
        { name: 'Second rain', cells: [1, 6, 11, 16], factor: 3 },
        { name: 'Third rain', cells: [2, 7, 12, 17], factor: 3 },
        { name: 'Fourth rain', cells: [3, 8, 13, 18], factor: 3 },
        { name: 'Fifth rain', cells: [4, 9, 14, 19], factor: 3 },
        { name: 'Falling spores', cells: [0, 6, 12, 18], factor: 4 },
        { name: 'Rising spores', cells: [4, 8, 12, 16], factor: 4 },
        { name: 'Four winds', cells: [0, 4, 15, 19], factor: 6 },
        { name: 'Taproot', cells: [7, 11, 12, 13, 17], factor: 5 }
      ],
      jackpotBonusMultiplier: 900
    })
  },
  {
    key: 'stormcrag-timber-twins', name: 'Stormcrag Thunder Rack',
    regionId: 3, regionName: 'Calbuco', regionSlug: 'calbuco',
    rules: regionalPatternRules({
      symbolItemIds: [1468, 151, 1474, 233, 1484, 1489], gridColumns: 6, gridRows: 3,
      winPatterns: [
        { name: 'Post one', cells: [0, 6, 12], factor: 2 },
        { name: 'Post two', cells: [1, 7, 13], factor: 2 },
        { name: 'Post three', cells: [2, 8, 14], factor: 2 },
        { name: 'Post four', cells: [3, 9, 15], factor: 2 },
        { name: 'Post five', cells: [4, 10, 16], factor: 2 },
        { name: 'Post six', cells: [5, 11, 17], factor: 2 },
        { name: 'Cloud beam', cells: [0, 1, 2, 3, 4, 5], factor: 7 },
        { name: 'Thunder beam', cells: [6, 7, 8, 9, 10, 11], factor: 7 },
        { name: 'Valley beam', cells: [12, 13, 14, 15, 16, 17], factor: 7 },
        { name: 'Falling brace', cells: [0, 7, 14], factor: 3 },
        { name: 'Rising brace', cells: [5, 10, 15], factor: 3 }
      ],
      jackpotBonusMultiplier: 1000
    })
  },
  {
    key: 'emberdeep-three-verses', name: 'Emberdeep Five Verses',
    regionId: 4, regionName: 'Dempo', regionSlug: 'dempo',
    rules: regionalPatternRules({
      symbolItemIds: [1494, 127, 238, 1504, 115, 1514, 1519], gridColumns: 4, gridRows: 5,
      winPatterns: [
        { name: 'First verse', cells: [0, 1, 2, 3], factor: 3 },
        { name: 'Second verse', cells: [4, 5, 6, 7], factor: 3 },
        { name: 'Third verse', cells: [8, 9, 10, 11], factor: 3 },
        { name: 'Fourth verse', cells: [12, 13, 14, 15], factor: 3 },
        { name: 'Final verse', cells: [16, 17, 18, 19], factor: 3 },
        { name: 'Patient reading', cells: [0, 4, 8, 12, 16], factor: 6 },
        { name: 'Weather reading', cells: [1, 5, 9, 13, 17], factor: 6 },
        { name: 'Route reading', cells: [2, 6, 10, 14, 18], factor: 6 },
        { name: 'Secret reading', cells: [3, 7, 11, 15, 19], factor: 6 },
        { name: 'Descending season', cells: [0, 5, 10, 15], factor: 4 },
        { name: 'Ascending season', cells: [3, 6, 9, 12], factor: 4 },
        { name: 'Second descent', cells: [4, 9, 14, 19], factor: 4 },
        { name: 'Second ascent', cells: [7, 10, 13, 16], factor: 4 }
      ],
      jackpotBonusMultiplier: 1250
    })
  },
  {
    key: 'frostmere-aurora-mirror', name: 'Frostmere Aurora Wall',
    regionId: 5, regionName: 'Ebeko', regionSlug: 'ebeko',
    rules: regionalPatternRules({
      symbolItemIds: [1524, 253, 265, 1132, 266, 1355, 1549, 1361], gridColumns: 6, gridRows: 4,
      winPatterns: [
        { name: 'Upper aurora', cells: [0, 1, 2, 3, 4, 5], factor: 7 },
        { name: 'High aurora', cells: [6, 7, 8, 9, 10, 11], factor: 7 },
        { name: 'Low aurora', cells: [12, 13, 14, 15, 16, 17], factor: 7 },
        { name: 'Lower aurora', cells: [18, 19, 20, 21, 22, 23], factor: 7 },
        { name: 'Circuit one', cells: [0, 6, 12, 18], factor: 4 },
        { name: 'Circuit two', cells: [1, 7, 13, 19], factor: 4 },
        { name: 'Circuit three', cells: [2, 8, 14, 20], factor: 4 },
        { name: 'Circuit four', cells: [3, 9, 15, 21], factor: 4 },
        { name: 'Circuit five', cells: [4, 10, 16, 22], factor: 4 },
        { name: 'Circuit six', cells: [5, 11, 17, 23], factor: 4 },
        { name: 'Falling pulse', cells: [0, 7, 14, 21], factor: 5 },
        { name: 'Rising pulse', cells: [5, 10, 15, 20], factor: 5 },
        { name: 'Cold core', cells: [8, 9, 14, 15], factor: 5 }
      ],
      jackpotBonusMultiplier: 1500
    })
  },
  {
    key: 'brimstone-furnace-four', name: 'Brimstone Grand Furnace',
    regionId: 6, regionName: 'Fogo', regionSlug: 'fogo',
    rules: regionalPatternRules({
      symbolItemIds: [1554, 304, 1564, 308, 1574, 1579], gridColumns: 5, gridRows: 5,
      winPatterns: [
        { name: 'Crown course', cells: [0, 1, 2, 3, 4], factor: 5 },
        { name: 'Ash course', cells: [5, 6, 7, 8, 9], factor: 5 },
        { name: 'Fire course', cells: [10, 11, 12, 13, 14], factor: 5 },
        { name: 'Iron course', cells: [15, 16, 17, 18, 19], factor: 5 },
        { name: 'Foundation course', cells: [20, 21, 22, 23, 24], factor: 5 },
        { name: 'Flue one', cells: [0, 5, 10, 15, 20], factor: 5 },
        { name: 'Flue two', cells: [1, 6, 11, 16, 21], factor: 5 },
        { name: 'Flue three', cells: [2, 7, 12, 17, 22], factor: 5 },
        { name: 'Flue four', cells: [3, 8, 13, 18, 23], factor: 5 },
        { name: 'Flue five', cells: [4, 9, 14, 19, 24], factor: 5 },
        { name: 'Pouring channel', cells: [0, 6, 12, 18, 24], factor: 6 },
        { name: 'Cooling channel', cells: [4, 8, 12, 16, 20], factor: 6 },
        { name: 'North-west crucible', cells: [0, 1, 5, 6], factor: 3 },
        { name: 'North-east crucible', cells: [3, 4, 8, 9], factor: 3 },
        { name: 'South-west crucible', cells: [15, 16, 20, 21], factor: 3 },
        { name: 'South-east crucible', cells: [18, 19, 23, 24], factor: 3 },
        { name: 'Molten heart', cells: [7, 11, 12, 13, 17], factor: 7 }
      ],
      jackpotBonusMultiplier: 2000
    })
  },
  {
    key: 'tzolkin-worldwheel-seven', name: "Tzolk'in Worldwheel",
    regionId: 7, regionName: 'Gallego', regionSlug: 'gallego',
    rules: regionalPatternRules({
      symbolItemIds: [154, 283, 151, 148, 292, 295, 1584, 1585], gridColumns: 8, gridRows: 3,
      winPatterns: [
        { name: 'Gate one', cells: [0, 8, 16], factor: 2 },
        { name: 'Gate two', cells: [1, 9, 17], factor: 2 },
        { name: 'Gate three', cells: [2, 10, 18], factor: 2 },
        { name: 'Gate four', cells: [3, 11, 19], factor: 2 },
        { name: 'Gate five', cells: [4, 12, 20], factor: 2 },
        { name: 'Gate six', cells: [5, 13, 21], factor: 2 },
        { name: 'Gate seven', cells: [6, 14, 22], factor: 2 },
        { name: 'Gate eight', cells: [7, 15, 23], factor: 2 },
        { name: 'Dawn circuit', cells: [0, 1, 2, 3, 4, 5, 6, 7], factor: 9 },
        { name: 'Noon circuit', cells: [8, 9, 10, 11, 12, 13, 14, 15], factor: 9 },
        { name: 'Dusk circuit', cells: [16, 17, 18, 19, 20, 21, 22, 23], factor: 9 },
        { name: 'Westbound local', cells: [8, 9, 10], factor: 1 },
        { name: 'Capital express', cells: [10, 11, 12], factor: 1 },
        { name: 'Eastbound local', cells: [13, 14, 15], factor: 1 },
        { name: 'World corners', cells: [0, 7, 16, 23], factor: 5 }
      ],
      jackpotBonusMultiplier: 2500
    })
  }
];

export const REGIONAL_CASINO_MACHINES = deepFreeze(REGIONAL_MACHINE_BLUEPRINTS.map(
  (machine) => ({
    ...machine,
    rulesSettingKey: `casino_${machine.key.replaceAll('-', '_')}_rules`,
    mechanic: 'regional-pattern'
  })
));

export const REGIONAL_CASINO_MACHINE_KEYS = Object.freeze(
  REGIONAL_CASINO_MACHINES.map((machine) => machine.key)
);

export const REGIONAL_CASINO_RULE_SETTINGS = deepFreeze(Object.fromEntries(
  REGIONAL_CASINO_MACHINES.map((machine) => [machine.rulesSettingKey, machine.rules])
));

const BROMO_SPOREFALL_ITEM_IDS = Object.freeze([1434, 1435, 1436, 1437, 1438, 1439]);
const KINGS_LOCKBOX_COLLECTIBLE_ITEM_IDS = Object.freeze([
  1555, 1560, 1566, 1570, 1577, 1582
]);
const KINGS_LOCKBOX_DUD_ITEM_ID = 1554;
const KINGS_LOCKBOX_ITEM_IDS = Object.freeze([
  KINGS_LOCKBOX_DUD_ITEM_ID, ...KINGS_LOCKBOX_COLLECTIBLE_ITEM_IDS
]);

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

export const BROMO_SPOREFALL_RULES = deepFreeze({
  version: 1,
  symbolItemIds: [...BROMO_SPOREFALL_ITEM_IDS],
  symbolWeightsByItemId: {
    1434: 1, 1435: 1, 1436: 1, 1437: 1, 1438: 1, 1439: 1
  },
  payoutMultipliersByItemId: {
    1434: 1, 1435: 1, 1436: 1, 1437: 2, 1438: 3, 1439: 5
  },
  minimumMatchCount: 3,
  matchCountFactors: { 3: 1, 4: 1, 5: 2, 6: 3, 7: 4, 8: 5, 9: 6 },
  cascadeMultiplierStep: 1,
  maximumCascades: 6,
  jackpotItemId: 1439,
  jackpotBonusMultiplier: 1000,
  jackpotChanceDenominator: 100000,
  holdMs: 700,
  minimumGoldWager: 1,
  maximumGoldWager: 1000,
  minimumCryptoWager: 1,
  maximumCryptoWager: 1000,
  historyLimit: 20
});

export const KINGS_LOCKBOX_RULES = deepFreeze({
  version: 1,
  symbolItemIds: [...KINGS_LOCKBOX_ITEM_IDS],
  dudItemId: KINGS_LOCKBOX_DUD_ITEM_ID,
  collectibleItemIds: [...KINGS_LOCKBOX_COLLECTIBLE_ITEM_IDS],
  symbolWeightsByItemId: {
    1554: 93, 1555: 2, 1560: 1, 1566: 1, 1570: 1, 1577: 1, 1582: 1
  },
  payoutMultipliersByItemId: {
    1555: 1, 1560: 2, 1566: 5, 1570: 10, 1577: 25, 1582: 75
  },
  triggerMinimum: 3,
  respinAttempts: 3,
  maximumRespins: 12,
  jackpotBonusMultiplier: 500,
  holdMs: 900,
  minimumGoldWager: 1,
  maximumGoldWager: 1000,
  minimumCryptoWager: 1,
  maximumCryptoWager: 1000,
  historyLimit: 20
});

function wholeNumber(value, label, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum || number > maximum) {
    throw new Error(`Invalid casino ${label}.`);
  }
  return number;
}

function safeSum(values, label) {
  let total = 0;
  for (const value of values) {
    total += value;
    if (!Number.isSafeInteger(total)) throw new Error(`The casino ${label} is too large.`);
  }
  return total;
}

function safeProduct(values, label) {
  let total = 1;
  for (const value of values) {
    total *= value;
    if (!Number.isSafeInteger(total)) throw new Error(`The casino ${label} is too large.`);
  }
  return total;
}

function record(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Invalid casino ${label}.`);
  }
  return value;
}

function exactItemIds(value, expected, label) {
  if (!Array.isArray(value) || value.length !== expected.length) {
    throw new Error(`Invalid casino ${label}.`);
  }
  const itemIds = value.map((itemId) => wholeNumber(itemId, `${label} item ID`, 1));
  if (itemIds.some((itemId, index) => itemId !== expected[index])) {
    throw new Error(`Invalid casino ${label}.`);
  }
  return itemIds;
}

function integerMap(value, itemIds, label, minimum = 1) {
  const source = record(value, label);
  const expectedKeys = new Set(itemIds.map(String));
  const keys = Object.keys(source);
  if (keys.length !== expectedKeys.size || keys.some((key) => !expectedKeys.has(key))) {
    throw new Error(`Invalid casino ${label}.`);
  }
  const result = {};
  for (const itemId of itemIds) {
    result[itemId] = wholeNumber(source[itemId], `${label} for item ${itemId}`, minimum);
  }
  return result;
}

function countFactorMap(value, minimumCount, label) {
  const counts = Array.from(
    { length: GRID_SIZE - minimumCount + 1 }, (_, index) => minimumCount + index
  );
  return integerMap(value, counts, label);
}

function stakeRules(rules) {
  const minimumGoldWager = wholeNumber(rules.minimumGoldWager, 'minimum gold wager', 1);
  const maximumGoldWager = wholeNumber(rules.maximumGoldWager, 'maximum gold wager', 1);
  const minimumCryptoWager = wholeNumber(rules.minimumCryptoWager, 'minimum crypto wager', 1);
  const maximumCryptoWager = wholeNumber(rules.maximumCryptoWager, 'maximum crypto wager', 1);
  if (minimumGoldWager > maximumGoldWager || minimumCryptoWager > maximumCryptoWager) {
    throw new Error('Invalid casino wager range.');
  }
  return {
    minimumGoldWager,
    maximumGoldWager,
    minimumCryptoWager,
    maximumCryptoWager,
    historyLimit: wholeNumber(rules.historyLimit, 'history limit', 1, 100)
  };
}

function randomUnit(random) {
  const value = Number(random());
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new Error('The casino random source returned an invalid value.');
  }
  return value;
}

function weightedRoll(rules, random) {
  const totalWeight = safeSum(
    rules.symbolItemIds.map((itemId) => rules.symbolWeightsByItemId[itemId]),
    'symbol weight'
  );
  let roll = randomUnit(random) * totalWeight;
  for (const itemId of rules.symbolItemIds) {
    const weight = rules.symbolWeightsByItemId[itemId];
    if (roll < weight) return itemId;
    roll -= weight;
  }
  return rules.symbolItemIds.at(-1);
}

function cleanGrid(grid, allowedItemIds, label) {
  if (!Array.isArray(grid) || grid.length !== GRID_SIZE) {
    throw new Error(`A ${label} spin must contain nine symbols.`);
  }
  const allowed = new Set(allowedItemIds);
  return grid.map((value) => {
    const itemId = wholeNumber(value, `${label} grid item ID`, 1);
    if (!allowed.has(itemId)) throw new Error(`The ${label} spin contains an unknown symbol.`);
    return itemId;
  });
}

function normalizedResult(machineKey, label, replayKind, holdMs, outcome) {
  const frames = outcome.frames;
  return {
    ...outcome,
    machineKey,
    grid: [...outcome.grid],
    grids: frames.map((frame) => [...frame.grid]),
    replayKind,
    label,
    holdMs
  };
}

export function validateBromoSporefallRules(configuredRules) {
  const rules = record(configuredRules, 'Bromo Sporefall rules');
  const symbolItemIds = exactItemIds(
    rules.symbolItemIds, BROMO_SPOREFALL_ITEM_IDS, 'Bromo Sporefall symbols'
  );
  const minimumMatchCount = wholeNumber(
    rules.minimumMatchCount, 'Bromo Sporefall minimum match count', 3, GRID_SIZE
  );
  if (minimumMatchCount !== 3) {
    throw new Error('Bromo Sporefall requires three matching symbols.');
  }
  const jackpotItemId = wholeNumber(rules.jackpotItemId, 'Bromo Sporefall jackpot item', 1);
  if (jackpotItemId !== BROMO_SPOREFALL_ITEM_IDS.at(-1)) {
    throw new Error('Invalid casino Bromo Sporefall jackpot item.');
  }
  const symbolWeightsByItemId = integerMap(
    rules.symbolWeightsByItemId, symbolItemIds, 'Bromo Sporefall symbol weights'
  );
  safeSum(
    symbolItemIds.map((itemId) => symbolWeightsByItemId[itemId]),
    'Bromo Sporefall symbol weight'
  );
  return {
    version: wholeNumber(rules.version, 'Bromo Sporefall rules version', 1),
    symbolItemIds,
    symbolWeightsByItemId,
    payoutMultipliersByItemId: integerMap(
      rules.payoutMultipliersByItemId, symbolItemIds, 'Bromo Sporefall payouts'
    ),
    minimumMatchCount,
    matchCountFactors: countFactorMap(
      rules.matchCountFactors, minimumMatchCount, 'Bromo Sporefall match factors'
    ),
    cascadeMultiplierStep: wholeNumber(
      rules.cascadeMultiplierStep, 'Bromo Sporefall cascade multiplier step', 1, 10
    ),
    maximumCascades: wholeNumber(
      rules.maximumCascades, 'Bromo Sporefall maximum cascades', 1, MAXIMUM_CASCADES
    ),
    jackpotItemId,
    jackpotBonusMultiplier: wholeNumber(
      rules.jackpotBonusMultiplier, 'Bromo Sporefall jackpot multiplier', 1
    ),
    jackpotChanceDenominator: wholeNumber(
      rules.jackpotChanceDenominator, 'Bromo Sporefall jackpot chance', 2
    ),
    holdMs: wholeNumber(rules.holdMs, 'Bromo Sporefall frame hold', 0, MAXIMUM_HOLD_MS),
    ...stakeRules(rules)
  };
}

function evaluateSporefallGrid(grid, rules, cascadeIndex) {
  const clean = cleanGrid(grid, rules.symbolItemIds, 'Bromo Sporefall');
  const cascadeMultiplier = 1 + cascadeIndex * rules.cascadeMultiplierStep;
  const wins = [];
  const visited = new Set();
  for (let start = 0; start < GRID_SIZE; start += 1) {
    if (visited.has(start)) continue;
    const itemId = clean[start];
    const pending = [start];
    const cells = [];
    visited.add(start);
    while (pending.length) {
      const cell = pending.pop();
      cells.push(cell);
      const row = Math.floor(cell / 3);
      const column = cell % 3;
      const neighbours = [
        row > 0 ? cell - 3 : -1,
        row < 2 ? cell + 3 : -1,
        column > 0 ? cell - 1 : -1,
        column < 2 ? cell + 1 : -1
      ];
      for (const neighbour of neighbours) {
        if (neighbour < 0 || visited.has(neighbour) || clean[neighbour] !== itemId) continue;
        visited.add(neighbour);
        pending.push(neighbour);
      }
    }
    cells.sort((first, second) => first - second);
    if (cells.length < rules.minimumMatchCount) continue;
    const multiplier = safeProduct([
      rules.payoutMultipliersByItemId[itemId],
      rules.matchCountFactors[cells.length],
      cascadeMultiplier
    ], 'Bromo Sporefall multiplier');
    wins.push({
      kind: 'cascade-match',
      name: `${cells.length} connected shrooms`,
      cells,
      itemId,
      count: cells.length,
      cascadeIndex,
      cascadeMultiplier,
      multiplier
    });
  }
  const winningCells = [...new Set(wins.flatMap((win) => win.cells))].sort((a, b) => a - b);
  const baseMultiplier = safeSum(
    wins.map((win) => win.multiplier), 'Bromo Sporefall multiplier'
  );
  const jackpot = clean.every((itemId) => itemId === rules.jackpotItemId);
  const jackpotMultiplier = jackpot ? rules.jackpotBonusMultiplier : 0;
  return {
    grid: clean,
    wins,
    winningCells,
    cascadeIndex,
    cascadeMultiplier,
    baseMultiplier,
    jackpotMultiplier,
    multiplier: safeSum(
      [baseMultiplier, jackpotMultiplier], 'Bromo Sporefall multiplier'
    ),
    jackpot
  };
}

export function evaluateBromoSporefallGrid(
  grid, configuredRules = BROMO_SPOREFALL_RULES, cascadeIndex = 0
) {
  const rules = validateBromoSporefallRules(configuredRules);
  const cleanCascadeIndex = wholeNumber(
    cascadeIndex, 'Bromo Sporefall cascade index', 0, rules.maximumCascades
  );
  return evaluateSporefallGrid(grid, rules, cleanCascadeIndex);
}

export function resolveBromoSporefallPull(
  configuredRules = BROMO_SPOREFALL_RULES, random = Math.random
) {
  const rules = validateBromoSporefallRules(configuredRules);
  if (typeof random !== 'function') throw new Error('The casino needs a random source.');
  const forcedJackpot = randomUnit(random) < 1 / rules.jackpotChanceDenominator;
  let grid = forcedJackpot
    ? Array(GRID_SIZE).fill(rules.jackpotItemId)
    : Array.from({ length: GRID_SIZE }, () => weightedRoll(rules, random));
  const frames = [];
  const wins = [];
  let refilledCells = [];
  let terminationReason = 'settled';

  for (let cascadeIndex = 0; cascadeIndex <= rules.maximumCascades; cascadeIndex += 1) {
    const evaluated = evaluateSporefallGrid(grid, rules, cascadeIndex);
    const frameIndex = frames.length;
    const frameWins = evaluated.wins.map((win) => ({
      ...win, frameIndex, spinIndex: frameIndex
    }));
    frames.push({
      ...evaluated,
      wins: frameWins,
      frameIndex,
      spinIndex: frameIndex,
      replayKind: 'cascade',
      label: cascadeIndex === 0 ? 'Initial drop' : `Cascade ${cascadeIndex}`,
      holdMs: rules.holdMs,
      refilledCells: [...refilledCells],
      clearedCells: [...evaluated.winningCells],
      bonusSymbols: [],
      bonusSpinsAwarded: 0
    });
    wins.push(...frameWins);
    if (evaluated.jackpot) {
      terminationReason = 'jackpot';
      break;
    }
    if (!evaluated.winningCells.length) {
      terminationReason = 'settled';
      break;
    }
    if (cascadeIndex === rules.maximumCascades) {
      terminationReason = 'cascade-cap';
      break;
    }
    refilledCells = [...evaluated.winningCells];
    const winning = new Set(evaluated.winningCells);
    grid = evaluated.grid.map((itemId, cell) =>
      winning.has(cell) ? weightedRoll(rules, random) : itemId);
  }

  const multiplier = safeSum(
    frames.map((frame) => frame.multiplier), 'Bromo Sporefall pull multiplier'
  );
  const jackpot = frames.some((frame) => frame.jackpot);
  const outcome = {
    frames,
    grid: frames.at(-1).grid,
    wins,
    winningCells: [...frames.at(-1).winningCells],
    multiplier,
    baseMultiplier: multiplier - (jackpot ? rules.jackpotBonusMultiplier : 0),
    jackpotMultiplier: jackpot ? rules.jackpotBonusMultiplier : 0,
    jackpot,
    forcedJackpot,
    cascades: frames.length - 1,
    maximumCascades: rules.maximumCascades,
    terminationReason,
    bonusSymbols: [],
    bonusSpinsAwarded: 0,
    bonusWinMultiplier: 1
  };
  return normalizedResult(
    BROMO_SPOREFALL_KEY, 'Bromo Sporefall', 'cascade', rules.holdMs, outcome
  );
}

export function validateKingsLockboxRules(configuredRules) {
  const rules = record(configuredRules, "King's Lockbox rules");
  const symbolItemIds = exactItemIds(
    rules.symbolItemIds, KINGS_LOCKBOX_ITEM_IDS, "King's Lockbox symbols"
  );
  const collectibleItemIds = exactItemIds(
    rules.collectibleItemIds,
    KINGS_LOCKBOX_COLLECTIBLE_ITEM_IDS,
    "King's Lockbox collectible symbols"
  );
  const dudItemId = wholeNumber(rules.dudItemId, "King's Lockbox dud item", 1);
  if (dudItemId !== KINGS_LOCKBOX_DUD_ITEM_ID) {
    throw new Error("Invalid casino King's Lockbox dud item.");
  }
  const triggerMinimum = wholeNumber(
    rules.triggerMinimum, "King's Lockbox trigger minimum", 3, GRID_SIZE
  );
  if (triggerMinimum !== 3) throw new Error("King's Lockbox requires three relics to open.");
  const symbolWeightsByItemId = integerMap(
    rules.symbolWeightsByItemId, symbolItemIds, "King's Lockbox symbol weights"
  );
  safeSum(
    symbolItemIds.map((itemId) => symbolWeightsByItemId[itemId]),
    "King's Lockbox symbol weight"
  );
  return {
    version: wholeNumber(rules.version, "King's Lockbox rules version", 1),
    symbolItemIds,
    dudItemId,
    collectibleItemIds,
    symbolWeightsByItemId,
    payoutMultipliersByItemId: integerMap(
      rules.payoutMultipliersByItemId, collectibleItemIds, "King's Lockbox payouts"
    ),
    triggerMinimum,
    respinAttempts: wholeNumber(
      rules.respinAttempts, "King's Lockbox respin attempts", 1, 10
    ),
    maximumRespins: wholeNumber(
      rules.maximumRespins, "King's Lockbox maximum respins", 1,
      MAXIMUM_LOCKBOX_RESPINS
    ),
    jackpotBonusMultiplier: wholeNumber(
      rules.jackpotBonusMultiplier, "King's Lockbox jackpot multiplier", 1
    ),
    holdMs: wholeNumber(rules.holdMs, "King's Lockbox frame hold", 0, MAXIMUM_HOLD_MS),
    ...stakeRules(rules)
  };
}

function lockboxWins(grid, cells, rules, frameIndex) {
  return cells.map((cell) => ({
    kind: 'locked-relic',
    name: 'Relic locked',
    cells: [cell],
    itemId: grid[cell],
    count: 1,
    frameIndex,
    spinIndex: frameIndex,
    multiplier: rules.payoutMultipliersByItemId[grid[cell]]
  }));
}

export function resolveKingsLockboxPull(
  configuredRules = KINGS_LOCKBOX_RULES, random = Math.random
) {
  const rules = validateKingsLockboxRules(configuredRules);
  if (typeof random !== 'function') throw new Error('The casino needs a random source.');
  const collectibleIds = new Set(rules.collectibleItemIds);
  let grid = Array.from({ length: GRID_SIZE }, () => weightedRoll(rules, random));
  const initiallyRevealed = grid.flatMap((itemId, cell) =>
    collectibleIds.has(itemId) ? [cell] : []);
  const featureTriggered = initiallyRevealed.length >= rules.triggerMinimum;
  let lockedCells = featureTriggered ? [...initiallyRevealed] : [];
  let remainingAttempts = featureTriggered ? rules.respinAttempts : 0;
  let respinsUsed = 0;
  const frames = [];
  const wins = [];

  const addFrame = (newlyLockedCells, label, jackpotBonus = 0) => {
    const frameIndex = frames.length;
    const frameWins = lockboxWins(grid, newlyLockedCells, rules, frameIndex);
    const baseMultiplier = safeSum(
      frameWins.map((win) => win.multiplier), "King's Lockbox multiplier"
    );
    const jackpot = lockedCells.length === GRID_SIZE;
    frames.push({
      grid: [...grid],
      wins: frameWins,
      winningCells: [...newlyLockedCells],
      multiplier: safeSum(
        [baseMultiplier, jackpotBonus], "King's Lockbox multiplier"
      ),
      baseMultiplier,
      jackpotMultiplier: jackpotBonus,
      jackpot,
      frameIndex,
      spinIndex: frameIndex,
      replayKind: 'hold-respin',
      label,
      holdMs: rules.holdMs,
      lockedCells: [...lockedCells],
      newlyLockedCells: [...newlyLockedCells],
      remainingAttempts,
      respinIndex: respinsUsed,
      bonusSymbols: [],
      bonusSpinsAwarded: 0
    });
    wins.push(...frameWins);
  };

  const initialJackpot = featureTriggered && lockedCells.length === GRID_SIZE;
  addFrame(
    featureTriggered ? initiallyRevealed : [],
    'Initial reveal',
    initialJackpot ? rules.jackpotBonusMultiplier : 0
  );

  while (featureTriggered && lockedCells.length < GRID_SIZE
    && remainingAttempts > 0 && respinsUsed < rules.maximumRespins) {
    respinsUsed += 1;
    const previouslyLocked = new Set(lockedCells);
    grid = grid.map((itemId, cell) =>
      previouslyLocked.has(cell) ? itemId : weightedRoll(rules, random));
    const newlyLockedCells = grid.flatMap((itemId, cell) =>
      !previouslyLocked.has(cell) && collectibleIds.has(itemId) ? [cell] : []);
    lockedCells = [...lockedCells, ...newlyLockedCells].sort((a, b) => a - b);
    remainingAttempts = newlyLockedCells.length
      ? rules.respinAttempts : remainingAttempts - 1;
    const jackpot = lockedCells.length === GRID_SIZE;
    addFrame(
      newlyLockedCells,
      `Lockbox respin ${respinsUsed}`,
      jackpot ? rules.jackpotBonusMultiplier : 0
    );
  }

  const jackpot = featureTriggered && lockedCells.length === GRID_SIZE;
  const terminationReason = !featureTriggered
    ? 'not-triggered'
    : jackpot
      ? 'vault-filled'
      : respinsUsed >= rules.maximumRespins && remainingAttempts > 0
        ? 'respin-cap' : 'attempts-exhausted';
  const multiplier = safeSum(
    frames.map((frame) => frame.multiplier), "King's Lockbox pull multiplier"
  );
  const jackpotMultiplier = jackpot ? rules.jackpotBonusMultiplier : 0;
  const outcome = {
    frames,
    grid: frames.at(-1).grid,
    wins,
    winningCells: [...lockedCells],
    multiplier,
    baseMultiplier: multiplier - jackpotMultiplier,
    jackpotMultiplier,
    jackpot,
    forcedJackpot: false,
    featureTriggered,
    lockedCells: [...lockedCells],
    remainingAttempts,
    respinsUsed,
    maximumRespins: rules.maximumRespins,
    terminationReason,
    bonusSymbols: [],
    bonusSpinsAwarded: 0,
    bonusWinMultiplier: 1
  };
  return normalizedResult(
    KINGS_LOCKBOX_KEY, "The King's Lockbox", 'hold-respin', rules.holdMs, outcome
  );
}

function regionalMachineBlueprint(machineKey) {
  const key = String(machineKey ?? '').trim();
  return REGIONAL_CASINO_MACHINES.find((machine) => machine.key === key) ?? null;
}

export function validateRegionalCasinoRules(machineKey, configuredRules) {
  const blueprint = regionalMachineBlueprint(machineKey);
  if (!blueprint) throw new Error('That regional casino machine does not exist.');
  const expected = blueprint.rules;
  const rules = record(configuredRules, `${blueprint.name} rules`);
  const symbolItemIds = exactItemIds(
    rules.symbolItemIds, expected.symbolItemIds, `${blueprint.name} symbols`
  );
  const gridColumns = wholeNumber(
    rules.gridColumns, `${blueprint.name} reel count`, 1, 8
  );
  const gridRows = wholeNumber(
    rules.gridRows, `${blueprint.name} row count`, 1, 5
  );
  const gridSize = safeProduct([gridColumns, gridRows], `${blueprint.name} grid size`);
  if (gridSize > MAXIMUM_REGIONAL_GRID_SIZE || gridSize !== Number(rules.gridSize)) {
    throw new Error(`Invalid casino ${blueprint.name} grid size.`);
  }
  if (gridColumns !== expected.gridColumns || gridRows !== expected.gridRows) {
    throw new Error(`Invalid casino ${blueprint.name} cabinet shape.`);
  }
  const symbolWeightsByItemId = integerMap(
    rules.symbolWeightsByItemId, symbolItemIds, `${blueprint.name} symbol weights`
  );
  safeSum(symbolItemIds.map((itemId) => symbolWeightsByItemId[itemId]),
    `${blueprint.name} symbol weight`);
  const sourcePatterns = Array.isArray(rules.winPatterns) ? rules.winPatterns : [];
  if (!sourcePatterns.length || sourcePatterns.length > MAXIMUM_REGIONAL_PATTERNS) {
    throw new Error(`Invalid casino ${blueprint.name} win patterns.`);
  }
  const signatures = new Set();
  const names = new Set();
  const winPatterns = sourcePatterns.map((source, index) => {
    const pattern = record(source, `${blueprint.name} pattern ${index + 1}`);
    const name = String(pattern.name ?? '').trim();
    if (!name || names.has(name.toLowerCase())) {
      throw new Error(`Invalid casino ${blueprint.name} pattern name.`);
    }
    names.add(name.toLowerCase());
    if (!Array.isArray(pattern.cells)) {
      throw new Error(`Invalid casino ${blueprint.name} pattern cells.`);
    }
    const cells = pattern.cells.map((cell) => wholeNumber(
      cell, `${blueprint.name} pattern cell`, 0, gridSize - 1
    ));
    if (cells.length < 2 || cells.length > gridSize || new Set(cells).size !== cells.length) {
      throw new Error(`Invalid casino ${blueprint.name} pattern cells.`);
    }
    const signature = [...cells].sort((first, second) => first - second).join(',');
    if (signatures.has(signature)) {
      throw new Error(`Casino ${blueprint.name} win patterns must be unique.`);
    }
    signatures.add(signature);
    return {
      name, cells,
      factor: wholeNumber(pattern.factor, `${blueprint.name} pattern factor`, 1, 20)
    };
  });
  const jackpotItemId = wholeNumber(rules.jackpotItemId, `${blueprint.name} jackpot item`, 1);
  if (jackpotItemId !== symbolItemIds.at(-1)) {
    throw new Error(`Invalid casino ${blueprint.name} jackpot item.`);
  }
  return {
    version: wholeNumber(rules.version, `${blueprint.name} rules version`, 1),
    symbolItemIds,
    symbolWeightsByItemId,
    payoutMultipliersByItemId: integerMap(
      rules.payoutMultipliersByItemId, symbolItemIds, `${blueprint.name} payouts`
    ),
    gridColumns,
    gridRows,
    gridSize,
    winPatterns,
    jackpotItemId,
    jackpotBonusMultiplier: wholeNumber(
      rules.jackpotBonusMultiplier, `${blueprint.name} jackpot multiplier`, 1
    ),
    jackpotChanceDenominator: wholeNumber(
      rules.jackpotChanceDenominator, `${blueprint.name} jackpot chance`, 2
    ),
    holdMs: wholeNumber(rules.holdMs, `${blueprint.name} frame hold`, 0, MAXIMUM_HOLD_MS),
    ...stakeRules(rules)
  };
}

function evaluateRegionalGrid(machine, grid, rules) {
  if (!Array.isArray(grid) || grid.length !== rules.gridSize) {
    throw new Error(`A ${machine.name} spin must contain ${rules.gridSize} symbols.`);
  }
  const allowed = new Set(rules.symbolItemIds);
  const clean = grid.map((value) => {
    const itemId = wholeNumber(value, `${machine.name} grid item ID`, 1);
    if (!allowed.has(itemId)) throw new Error(`The ${machine.name} spin contains an unknown symbol.`);
    return itemId;
  });
  const wins = [];
  for (const pattern of rules.winPatterns) {
    const itemId = clean[pattern.cells[0]];
    if (!pattern.cells.every((cell) => clean[cell] === itemId)) continue;
    wins.push({
      kind: 'regional-pattern', name: pattern.name, cells: [...pattern.cells], itemId,
      count: pattern.cells.length,
      multiplier: safeProduct([
        rules.payoutMultipliersByItemId[itemId], pattern.factor
      ], `${machine.name} pattern multiplier`)
    });
  }
  const baseMultiplier = safeSum(
    wins.map((win) => win.multiplier), `${machine.name} multiplier`
  );
  const jackpot = clean.every((itemId) => itemId === rules.jackpotItemId);
  const jackpotMultiplier = jackpot ? rules.jackpotBonusMultiplier : 0;
  return {
    grid: clean,
    wins,
    winningCells: [...new Set(wins.flatMap((win) => win.cells))]
      .sort((first, second) => first - second),
    baseMultiplier,
    jackpotMultiplier,
    multiplier: safeSum([baseMultiplier, jackpotMultiplier], `${machine.name} multiplier`),
    jackpot
  };
}

export function evaluateRegionalCasinoGrid(machineKey, grid, configuredRules = null) {
  const machine = regionalMachineBlueprint(machineKey);
  if (!machine) throw new Error('That regional casino machine does not exist.');
  const rules = validateRegionalCasinoRules(machine.key, configuredRules ?? machine.rules);
  return evaluateRegionalGrid(machine, grid, rules);
}

export function resolveRegionalCasinoPull(machineKey, configuredRules = null, random = Math.random) {
  const machine = regionalMachineBlueprint(machineKey);
  if (!machine) throw new Error('That regional casino machine does not exist.');
  const rules = validateRegionalCasinoRules(machine.key, configuredRules ?? machine.rules);
  if (typeof random !== 'function') throw new Error('The casino needs a random source.');
  const forcedJackpot = randomUnit(random) < 1 / rules.jackpotChanceDenominator;
  const grid = forcedJackpot
    ? Array(rules.gridSize).fill(rules.jackpotItemId)
    : Array.from({ length: rules.gridSize }, () => weightedRoll(rules, random));
  const evaluated = evaluateRegionalGrid(machine, grid, rules);
  const frame = {
    ...evaluated,
    frameIndex: 0,
    spinIndex: 0,
    replayKind: 'regional-pattern',
    label: 'Final stop',
    holdMs: rules.holdMs,
    bonusSymbols: [],
    bonusSpinsAwarded: 0
  };
  return normalizedResult(machine.key, machine.name, 'regional-pattern', rules.holdMs, {
    ...evaluated,
    frames: [frame],
    forcedJackpot,
    terminationReason: evaluated.jackpot ? 'jackpot' : 'settled',
    bonusSymbols: [],
    bonusSpinsAwarded: 0,
    bonusWinMultiplier: 1
  });
}

export function resolveThingOMaticPull(configuredRules, random = Math.random) {
  const rules = validateCasinoRules(configuredRules);
  const resolved = resolveCasinoPull(rules, random);
  const bonusFrameCount = Math.max(0, resolved.frames.length - 1);
  const frames = resolved.frames.map((frame, frameIndex) => ({
    ...frame,
    wins: frame.wins.map((win) => ({ ...win, frameIndex, spinIndex: frameIndex })),
    frameIndex,
    spinIndex: frameIndex,
    replayKind: 'bonus-spin',
    label: frameIndex === 0
      ? 'Paid spin' : `Bonus spin ${frameIndex} of ${bonusFrameCount}`,
    holdMs: THING_O_MATIC_HOLD_MS
  }));
  const wins = frames.flatMap((frame) => frame.wins);
  return normalizedResult(
    THING_O_MATIC_KEY,
    'The Thing-O-Matic',
    'bonus-spin',
    THING_O_MATIC_HOLD_MS,
    { ...resolved, frames, wins, grid: frames.at(-1).grid }
  );
}

const registry = {
  [THING_O_MATIC_KEY]: {
    key: THING_O_MATIC_KEY,
    name: 'The Thing-O-Matic',
    mechanic: 'lines-respins',
    rulesSettingKey: 'casino_slot_rules',
    defaultRules: null,
    validateRules: validateCasinoRules,
    resolvePull: resolveThingOMaticPull
  },
  [BROMO_SPOREFALL_KEY]: {
    key: BROMO_SPOREFALL_KEY,
    name: 'Bromo Sporefall',
    mechanic: 'cascade',
    rulesSettingKey: 'casino_bromo_sporefall_rules',
    defaultRules: BROMO_SPOREFALL_RULES,
    validateRules: validateBromoSporefallRules,
    resolvePull: resolveBromoSporefallPull
  },
  [KINGS_LOCKBOX_KEY]: {
    key: KINGS_LOCKBOX_KEY,
    name: "The King's Lockbox",
    mechanic: 'hold-respin',
    rulesSettingKey: 'casino_kings_lockbox_rules',
    defaultRules: KINGS_LOCKBOX_RULES,
    validateRules: validateKingsLockboxRules,
    resolvePull: resolveKingsLockboxPull
  }
};

for (const regional of REGIONAL_CASINO_MACHINES) {
  registry[regional.key] = {
    key: regional.key,
    name: regional.name,
    mechanic: regional.mechanic,
    regionId: regional.regionId,
    regionName: regional.regionName,
    regionSlug: regional.regionSlug,
    rulesSettingKey: regional.rulesSettingKey,
    defaultRules: regional.rules,
    validateRules: (rules) => validateRegionalCasinoRules(regional.key, rules),
    resolvePull: (rules, random) => resolveRegionalCasinoPull(regional.key, rules, random)
  };
}

export const CASINO_MACHINE_REGISTRY = deepFreeze(registry);
export const CASINO_MACHINE_KEYS = Object.freeze(Object.keys(CASINO_MACHINE_REGISTRY));

export function casinoMachineByKey(machineKey) {
  const key = String(machineKey ?? '').trim();
  return Object.hasOwn(CASINO_MACHINE_REGISTRY, key)
    ? CASINO_MACHINE_REGISTRY[key] : null;
}

export function requireCasinoMachine(machineKey) {
  const machine = casinoMachineByKey(machineKey);
  if (!machine) throw new Error('That casino machine does not exist.');
  return machine;
}

export function casinoMachineAvailableInRegion(machineKey, regionId) {
  const machine = requireCasinoMachine(machineKey);
  return machine.regionId === undefined || machine.regionId === null
    || Number(machine.regionId) === Number(regionId);
}

export function validateCasinoMachineRules(machineKey, configuredRules) {
  return requireCasinoMachine(machineKey).validateRules(configuredRules);
}

export function resolveCasinoMachinePull(machineKey, configuredRules, random = Math.random) {
  return requireCasinoMachine(machineKey).resolvePull(configuredRules, random);
}
