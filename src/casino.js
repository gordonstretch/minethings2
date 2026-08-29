const GRID_SIZE = 9;

function wholeNumber(value, label, minimum = 0) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < minimum) {
    throw new Error(`Invalid casino ${label}.`);
  }
  return number;
}

export function validateCasinoRules(rules) {
  if (!rules || typeof rules !== 'object' || Array.isArray(rules)) {
    throw new Error('Invalid casino rules.');
  }
  const symbolItemIds = [...new Set((rules.symbolItemIds ?? [])
    .map((itemId) => wholeNumber(itemId, 'symbol item ID', 1)))];
  if (symbolItemIds.length < 2) throw new Error('The casino needs at least two reel symbols.');

  const symbolIds = new Set(symbolItemIds);
  const regularSymbolWeight = wholeNumber(
    rules.regularSymbolWeight, 'regular symbol weight', 1
  );
  const bonusIds = new Set();
  const bonusSymbols = (rules.bonusSymbols ?? []).map((symbol, index) => {
    const id = String(symbol?.id ?? '').trim();
    if (!/^[a-z][a-z0-9-]{1,30}$/.test(id) || bonusIds.has(id)) {
      throw new Error(`Invalid casino bonus symbol ${index + 1}.`);
    }
    bonusIds.add(id);
    const name = String(symbol?.name ?? '').trim();
    const glyph = String(symbol?.glyph ?? '').trim();
    const description = String(symbol?.description ?? '').trim();
    if (!name || !glyph || glyph.length > 3 || !description) {
      throw new Error(`Casino bonus symbol ${id} is incomplete.`);
    }
    return {
      id, name, glyph, description,
      weight: wholeNumber(symbol.weight, `${id} weight`, 1),
      respins: wholeNumber(symbol.respins, `${id} respins`, 1),
      winMultiplierBonus: wholeNumber(
        symbol.winMultiplierBonus, `${id} win multiplier bonus`
      )
    };
  });
  if (bonusSymbols.length < 2) throw new Error('The casino needs at least two bonus symbols.');
  const jackpotItemId = wholeNumber(rules.jackpotItemId, 'jackpot item ID', 1);
  if (!symbolIds.has(jackpotItemId)) throw new Error('The jackpot item is not a reel symbol.');

  const payoutMultipliersByItemId = {};
  for (const [itemIdValue, multiplierValue] of Object.entries(
    rules.payoutMultipliersByItemId ?? {}
  )) {
    const itemId = wholeNumber(itemIdValue, 'payout item ID', 1);
    const multiplier = wholeNumber(multiplierValue, 'payout multiplier', 1);
    if (!symbolIds.has(itemId)) throw new Error(`Casino payout item ${itemId} is not a reel symbol.`);
    payoutMultipliersByItemId[itemId] = multiplier;
  }
  if (!payoutMultipliersByItemId[jackpotItemId]) {
    throw new Error('The jackpot symbol needs a line payout.');
  }

  const explosiveScatterCountFactors = {};
  for (const [countValue, factorValue] of Object.entries(
    rules.explosiveScatterCountFactors ?? {}
  )) {
    const count = wholeNumber(countValue, 'explosive scatter count', 5);
    if (count > GRID_SIZE) throw new Error('Invalid casino explosive scatter count.');
    explosiveScatterCountFactors[count] = wholeNumber(
      factorValue, 'explosive scatter factor', 1
    );
  }
  for (let count = 5; count <= GRID_SIZE; count += 1) {
    if (!explosiveScatterCountFactors[count]) {
      throw new Error(`Casino explosive scatter needs a payout for ${count} symbols.`);
    }
  }

  const cellSignatures = new Set();
  const paylines = (rules.paylines ?? []).map((payline, index) => {
    const cells = (payline?.cells ?? []).map((cell) => wholeNumber(cell, 'payline cell'));
    if (cells.length !== 3 || new Set(cells).size !== 3
      || cells.some((cell) => cell >= GRID_SIZE)) {
      throw new Error(`Invalid casino payline ${index + 1}.`);
    }
    const signature = cells.join(',');
    if (cellSignatures.has(signature)) throw new Error('Casino paylines must be unique.');
    cellSignatures.add(signature);
    const name = String(payline?.name ?? '').trim();
    if (!name) throw new Error(`Casino payline ${index + 1} needs a name.`);
    return { name, cells };
  });
  if (!paylines.length) throw new Error('The casino needs at least one payline.');

  return {
    version: wholeNumber(rules.version, 'rules version', 1),
    symbolItemIds,
    regularSymbolWeight,
    maximumBonusSpins: wholeNumber(rules.maximumBonusSpins, 'maximum bonus spins', 1),
    bonusSymbols,
    ordinaryMultiplier: wholeNumber(rules.ordinaryMultiplier, 'ordinary multiplier', 1),
    payoutMultipliersByItemId,
    explosiveScatterCountFactors,
    jackpotItemId,
    jackpotBonusMultiplier: wholeNumber(rules.jackpotBonusMultiplier,
      'jackpot bonus multiplier', 1),
    jackpotChanceDenominator: wholeNumber(rules.jackpotChanceDenominator,
      'jackpot chance denominator', 2),
    paylines,
    minimumGoldWager: wholeNumber(rules.minimumGoldWager, 'minimum gold wager', 1),
    maximumGoldWager: wholeNumber(rules.maximumGoldWager, 'maximum gold wager', 1),
    minimumCryptoWager: wholeNumber(rules.minimumCryptoWager, 'minimum crypto wager', 1),
    maximumCryptoWager: wholeNumber(rules.maximumCryptoWager, 'maximum crypto wager', 1),
    historyLimit: wholeNumber(rules.historyLimit, 'history limit', 1)
  };
}

export function evaluateCasinoGrid(grid, configuredRules) {
  const rules = validateCasinoRules(configuredRules);
  if (!Array.isArray(grid) || grid.length !== GRID_SIZE) {
    throw new Error('A casino spin must contain nine symbols.');
  }
  const allowed = new Set(rules.symbolItemIds);
  const bonusById = new Map(rules.bonusSymbols.map((symbol) => [symbol.id, symbol]));
  const cleanGrid = grid.map((value) => {
    const bonusId = String(value);
    if (bonusById.has(bonusId)) return bonusId;
    const itemId = wholeNumber(value, 'grid item ID', 1);
    if (!allowed.has(itemId)) throw new Error('The casino spin contains an unknown symbol.');
    return itemId;
  });

  const wins = [];
  let lineMultiplier = 0;
  for (const payline of rules.paylines) {
    const itemId = cleanGrid[payline.cells[0]];
    if (typeof itemId !== 'number') continue;
    if (!payline.cells.every((cell) => cleanGrid[cell] === itemId)) continue;
    const multiplier = rules.payoutMultipliersByItemId[itemId]
      ?? rules.ordinaryMultiplier;
    wins.push({
      kind: 'line', name: payline.name, cells: [...payline.cells], itemId, multiplier
    });
    lineMultiplier += multiplier;
  }
  const bonusSymbols = cleanGrid.flatMap((symbolId, cell) => {
    const symbol = bonusById.get(symbolId);
    return symbol ? [{ ...symbol, cell }] : [];
  });
  const respinsGranted = bonusSymbols.reduce((total, symbol) => total + symbol.respins, 0);
  const winMultiplierBonus = bonusSymbols.reduce(
    (total, symbol) => total + symbol.winMultiplierBonus, 0
  );
  let scatterMultiplier = 0;
  for (const [itemIdValue, baseMultiplier] of Object.entries(
    rules.payoutMultipliersByItemId
  )) {
    const itemId = Number(itemIdValue);
    const cells = cleanGrid.flatMap((gridItemId, index) =>
      gridItemId === itemId ? [index] : []);
    const factor = rules.explosiveScatterCountFactors[cells.length];
    if (!factor) continue;
    const multiplier = baseMultiplier * factor;
    wins.push({
      kind: 'scatter', name: `${cells.length} matching explosives`, cells,
      itemId, count: cells.length, multiplier
    });
    scatterMultiplier += multiplier;
  }
  const jackpot = cleanGrid.every((itemId) => itemId === rules.jackpotItemId);
  const jackpotMultiplier = jackpot ? rules.jackpotBonusMultiplier : 0;
  return {
    grid: cleanGrid,
    wins,
    winningCells: [...new Set(wins.flatMap((win) => win.cells))].sort((a, b) => a - b),
    jackpot,
    bonusSymbols,
    respinsGranted,
    winMultiplierBonus,
    lineMultiplier,
    scatterMultiplier,
    jackpotMultiplier,
    multiplier: lineMultiplier + scatterMultiplier + jackpotMultiplier
  };
}

function randomUnit(random) {
  const value = Number(random());
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    throw new Error('The casino random source returned an invalid value.');
  }
  return value;
}

export function resolveCasinoSpin(configuredRules, random = Math.random) {
  const rules = validateCasinoRules(configuredRules);
  if (typeof random !== 'function') throw new Error('The casino needs a random source.');
  const forcedJackpot = randomUnit(random) < 1 / rules.jackpotChanceDenominator;
  const regularWeightTotal = rules.symbolItemIds.length * rules.regularSymbolWeight;
  const totalWeight = regularWeightTotal
    + rules.bonusSymbols.reduce((total, symbol) => total + symbol.weight, 0);
  const rollSymbol = () => {
    let roll = randomUnit(random) * totalWeight;
    if (roll < regularWeightTotal) {
      return rules.symbolItemIds[Math.floor(roll / rules.regularSymbolWeight)];
    }
    roll -= regularWeightTotal;
    for (const symbol of rules.bonusSymbols) {
      if (roll < symbol.weight) return symbol.id;
      roll -= symbol.weight;
    }
    return rules.bonusSymbols.at(-1).id;
  };
  const grid = forcedJackpot
    ? Array(GRID_SIZE).fill(rules.jackpotItemId)
    : Array.from({ length: GRID_SIZE }, rollSymbol);
  return { ...evaluateCasinoGrid(grid, rules), forcedJackpot };
}

export function resolveCasinoPull(configuredRules, random = Math.random) {
  const rules = validateCasinoRules(configuredRules);
  if (typeof random !== 'function') throw new Error('The casino needs a random source.');
  const frames = [];
  let pendingSpins = 1;
  let bonusSpinsAwarded = 0;
  while (pendingSpins > 0) {
    pendingSpins -= 1;
    const frame = resolveCasinoSpin(rules, random);
    const remaining = rules.maximumBonusSpins - bonusSpinsAwarded;
    const awarded = Math.max(0, Math.min(frame.respinsGranted, remaining));
    bonusSpinsAwarded += awarded;
    pendingSpins += awarded;
    frames.push({ ...frame, spinIndex: frames.length, bonusSpinsAwarded: awarded });
  }
  const baseMultiplier = frames.reduce((total, frame) => total + frame.multiplier, 0);
  const bonusWinMultiplier = 1 + frames.reduce(
    (total, frame) => total + frame.winMultiplierBonus, 0
  );
  const wins = frames.flatMap((frame) => frame.wins.map((win) => ({
    ...win, spinIndex: frame.spinIndex
  })));
  const bonusSymbols = frames.flatMap((frame) => frame.bonusSymbols.map((symbol) => ({
    ...symbol, spinIndex: frame.spinIndex
  })));
  return {
    frames,
    grid: frames.at(-1).grid,
    wins,
    bonusSymbols,
    bonusSpinsAwarded,
    baseMultiplier,
    bonusWinMultiplier,
    multiplier: baseMultiplier * bonusWinMultiplier,
    jackpot: frames.some((frame) => frame.jackpot),
    forcedJackpot: frames.some((frame) => frame.forcedJackpot)
  };
}
