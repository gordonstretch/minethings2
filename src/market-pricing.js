export const GOLD_PRICE_SCALE = 10_000;
export const MIN_MARKET_PRICE_UNITS = 100;

export const LEGACY_MARKET_PRICE_LADDER = Object.freeze([
  { priceUnits: 100, jumpUnits: 100 },
  { priceUnits: 2_000, jumpUnits: 200 },
  { priceUnits: 5_000, jumpUnits: 500 },
  { priceUnits: 10_000, jumpUnits: 1_000 },
  { priceUnits: 50_000, jumpUnits: 5_000 },
  { priceUnits: 100_000, jumpUnits: 10_000 },
  { priceUnits: 700_000, jumpUnits: 20_000 },
  { priceUnits: 1_700_000, jumpUnits: 50_000 },
  { priceUnits: 3_800_000, jumpUnits: 100_000 },
  { priceUnits: 7_400_000, jumpUnits: 200_000 },
  { priceUnits: 11_000_000, jumpUnits: 250_000 },
  { priceUnits: 19_000_000, jumpUnits: 500_000 },
  { priceUnits: 40_000_000, jumpUnits: 1_000_000 },
  { priceUnits: 76_000_000, jumpUnits: 2_000_000 },
  { priceUnits: 110_000_000, jumpUnits: 2_500_000 },
  { priceUnits: 185_000_000, jumpUnits: 5_000_000 },
  { priceUnits: 370_000_000, jumpUnits: 10_000_000 }
].map(Object.freeze));

function isPriceUnits(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function assertPriceUnits(value, name = 'priceUnits') {
  if (!isPriceUnits(value)) {
    throw new TypeError(`${name} must be a non-negative safe integer`);
  }
}

function optionalLimit(value, name) {
  if (value === false || value === null || value === undefined) return null;
  assertPriceUnits(value, name);
  return value;
}

function phpRoundIntegerRatio(numerator, denominator) {
  const direction = Math.sign(numerator);
  return direction * Math.floor((Math.abs(numerator) / denominator) + 0.5);
}

function tierIndexFor(priceUnits) {
  let index = 0;
  for (let candidate = 1; candidate < LEGACY_MARKET_PRICE_LADDER.length; candidate += 1) {
    if (priceUnits < LEGACY_MARKET_PRICE_LADDER[candidate].priceUnits) break;
    index = candidate;
  }
  return index;
}

/** Return the legacy tick tier selected for this exact input price. */
export function legacyMarketPriceTier(priceUnits) {
  assertPriceUnits(priceUnits);
  return LEGACY_MARKET_PRICE_LADDER[tierIndexFor(priceUnits)];
}

/**
 * Integer-unit equivalent of LimitOrder::RoundPrice.
 *
 * The optional limits reproduce the legacy inclusive guards: an upward round
 * that reaches maxPriceUnits is moved down one tick, and a downward round that
 * reaches minPriceUnits is moved up one tick.
 */
export function roundLegacyMarketPriceUnits(
  priceUnits,
  { maxPriceUnits = null, minPriceUnits = null } = {}
) {
  assertPriceUnits(priceUnits);
  const maxUnits = optionalLimit(maxPriceUnits, 'maxPriceUnits');
  const minUnits = optionalLimit(minPriceUnits, 'minPriceUnits');
  const tier = legacyMarketPriceTier(priceUnits);
  const delta = priceUnits - tier.priceUnits;
  let roundedPriceUnits = tier.priceUnits
    + phpRoundIntegerRatio(delta, tier.jumpUnits) * tier.jumpUnits;
  let alternativePriceUnits = roundedPriceUnits;

  if (roundedPriceUnits !== priceUnits) {
    if (
      priceUnits < roundedPriceUnits
      && maxUnits !== null
      && roundedPriceUnits >= maxUnits
    ) {
      roundedPriceUnits -= tier.jumpUnits;
    } else if (
      priceUnits > roundedPriceUnits
      && minUnits !== null
      && roundedPriceUnits <= minUnits
    ) {
      roundedPriceUnits += tier.jumpUnits;
    }

    alternativePriceUnits = priceUnits > roundedPriceUnits
      ? roundedPriceUnits + tier.jumpUnits
      : roundedPriceUnits - tier.jumpUnits;
  }

  return { roundedPriceUnits, alternativePriceUnits };
}

/** Whether a price is positive, at least 0.01g, and exactly on the legacy ladder. */
export function isValidMarketPriceUnits(priceUnits) {
  if (!isPriceUnits(priceUnits) || priceUnits < MIN_MARKET_PRICE_UNITS) return false;
  return roundLegacyMarketPriceUnits(priceUnits).roundedPriceUnits === priceUnits;
}

/**
 * Return inclusive ladder bounds around a price. An exact ladder price is both
 * bounds; a value below 0.01g has no valid lower bound.
 */
export function marketPriceBoundsUnits(priceUnits) {
  assertPriceUnits(priceUnits);
  if (priceUnits < MIN_MARKET_PRICE_UNITS) {
    return { lowerPriceUnits: null, upperPriceUnits: MIN_MARKET_PRICE_UNITS };
  }

  const tier = legacyMarketPriceTier(priceUnits);
  const delta = priceUnits - tier.priceUnits;
  const lowerPriceUnits = tier.priceUnits + Math.floor(delta / tier.jumpUnits) * tier.jumpUnits;
  const upperPriceUnits = lowerPriceUnits === priceUnits
    ? priceUnits
    : lowerPriceUnits + tier.jumpUnits;
  return { lowerPriceUnits, upperPriceUnits };
}

/**
 * Return the nearest strict valid prices below and above a price. For an
 * off-ladder input these are its bounds; for an exact input they are adjacent
 * ticks. There is no lower alternative beneath the 0.01g market minimum.
 */
export function adjacentValidMarketPriceUnits(priceUnits) {
  assertPriceUnits(priceUnits);
  if (priceUnits < MIN_MARKET_PRICE_UNITS) {
    return { lowerPriceUnits: null, upperPriceUnits: MIN_MARKET_PRICE_UNITS };
  }

  const bounds = marketPriceBoundsUnits(priceUnits);
  if (bounds.lowerPriceUnits !== priceUnits) return bounds;

  const tierIndex = tierIndexFor(priceUnits);
  const tier = LEGACY_MARKET_PRICE_LADDER[tierIndex];
  const previousJump = priceUnits === tier.priceUnits && tierIndex > 0
    ? LEGACY_MARKET_PRICE_LADDER[tierIndex - 1].jumpUnits
    : tier.jumpUnits;
  return {
    lowerPriceUnits: priceUnits === MIN_MARKET_PRICE_UNITS
      ? null
      : priceUnits - previousJump,
    upperPriceUnits: priceUnits + tier.jumpUnits
  };
}

/** Return the smallest valid listing price at or above an established minimum. */
export function roundListingMinimumUpUnits(minimumPriceUnits) {
  assertPriceUnits(minimumPriceUnits, 'minimumPriceUnits');
  if (minimumPriceUnits <= MIN_MARKET_PRICE_UNITS) return MIN_MARKET_PRICE_UNITS;
  return marketPriceBoundsUnits(minimumPriceUnits).upperPriceUnits;
}
