import assert from 'node:assert/strict';
import test from 'node:test';
import {
  adjacentValidMarketPriceUnits,
  GOLD_PRICE_SCALE,
  isValidMarketPriceUnits,
  LEGACY_MARKET_PRICE_LADDER,
  marketPriceBoundsUnits,
  MIN_MARKET_PRICE_UNITS,
  roundLegacyMarketPriceUnits,
  roundListingMinimumUpUnits
} from '../src/market-pricing.js';

test('uses the exact legacy gold scale and tiered tick ladder', () => {
  assert.equal(GOLD_PRICE_SCALE, 10_000);
  assert.equal(MIN_MARKET_PRICE_UNITS, 100);
  assert.deepEqual(LEGACY_MARKET_PRICE_LADDER, [
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
  ]);
});

test('validates exact ticks on both sides of every tier boundary', () => {
  assert.equal(isValidMarketPriceUnits(0), false);
  assert.equal(isValidMarketPriceUnits(99), false);
  assert.equal(isValidMarketPriceUnits(100), true);

  for (let index = 1; index < LEGACY_MARKET_PRICE_LADDER.length; index += 1) {
    const previous = LEGACY_MARKET_PRICE_LADDER[index - 1];
    const current = LEGACY_MARKET_PRICE_LADDER[index];
    assert.equal(isValidMarketPriceUnits(current.priceUnits), true);
    assert.equal(isValidMarketPriceUnits(current.priceUnits - previous.jumpUnits), true);
    assert.equal(isValidMarketPriceUnits(current.priceUnits - 1), false);
    assert.equal(isValidMarketPriceUnits(current.priceUnits + 1), false);
    assert.equal(isValidMarketPriceUnits(current.priceUnits + current.jumpUnits), true);
  }

  assert.equal(isValidMarketPriceUnits(380_000_000), true);
  assert.equal(isValidMarketPriceUnits(379_000_000), false);
  assert.equal(isValidMarketPriceUnits(1.5), false);
  assert.equal(isValidMarketPriceUnits('100'), false);
});

test('reproduces legacy RoundPrice rounding and alternatives at boundaries', () => {
  assert.deepEqual(roundLegacyMarketPriceUnits(2_100), {
    roundedPriceUnits: 2_200,
    alternativePriceUnits: 2_000
  });
  assert.deepEqual(roundLegacyMarketPriceUnits(2_001), {
    roundedPriceUnits: 2_000,
    alternativePriceUnits: 2_200
  });
  assert.deepEqual(roundLegacyMarketPriceUnits(1_999), {
    roundedPriceUnits: 2_000,
    alternativePriceUnits: 1_900
  });
  assert.deepEqual(roundLegacyMarketPriceUnits(2_000), {
    roundedPriceUnits: 2_000,
    alternativePriceUnits: 2_000
  });
  assert.deepEqual(roundLegacyMarketPriceUnits(50), {
    roundedPriceUnits: 0,
    alternativePriceUnits: 100
  });
});

test('reproduces the legacy inclusive max and min rounding guards', () => {
  assert.deepEqual(roundLegacyMarketPriceUnits(1_950, { maxPriceUnits: 2_000 }), {
    roundedPriceUnits: 1_900,
    alternativePriceUnits: 2_000
  });
  assert.deepEqual(roundLegacyMarketPriceUnits(2_050, { minPriceUnits: 2_000 }), {
    roundedPriceUnits: 2_200,
    alternativePriceUnits: 2_000
  });
  assert.deepEqual(roundLegacyMarketPriceUnits(1_950, { maxPriceUnits: 2_001 }), {
    roundedPriceUnits: 2_000,
    alternativePriceUnits: 1_900
  });
  assert.deepEqual(roundLegacyMarketPriceUnits(2_050, { minPriceUnits: 1_999 }), {
    roundedPriceUnits: 2_000,
    alternativePriceUnits: 2_200
  });
});

test('returns inclusive bounds and strict adjacent alternatives', () => {
  assert.deepEqual(marketPriceBoundsUnits(2_100), {
    lowerPriceUnits: 2_000,
    upperPriceUnits: 2_200
  });
  assert.deepEqual(marketPriceBoundsUnits(2_000), {
    lowerPriceUnits: 2_000,
    upperPriceUnits: 2_000
  });
  assert.deepEqual(marketPriceBoundsUnits(50), {
    lowerPriceUnits: null,
    upperPriceUnits: 100
  });

  assert.deepEqual(adjacentValidMarketPriceUnits(2_100), {
    lowerPriceUnits: 2_000,
    upperPriceUnits: 2_200
  });
  assert.deepEqual(adjacentValidMarketPriceUnits(2_000), {
    lowerPriceUnits: 1_900,
    upperPriceUnits: 2_200
  });
  assert.deepEqual(adjacentValidMarketPriceUnits(5_000), {
    lowerPriceUnits: 4_800,
    upperPriceUnits: 5_500
  });
  assert.deepEqual(adjacentValidMarketPriceUnits(100), {
    lowerPriceUnits: null,
    upperPriceUnits: 200
  });
});

test('rounds established listing minimums upward onto the ladder', () => {
  assert.equal(roundListingMinimumUpUnits(0), 100);
  assert.equal(roundListingMinimumUpUnits(50), 100);
  assert.equal(roundListingMinimumUpUnits(100), 100);
  assert.equal(roundListingMinimumUpUnits(101), 200);
  assert.equal(roundListingMinimumUpUnits(1_999), 2_000);
  assert.equal(roundListingMinimumUpUnits(2_000), 2_000);
  assert.equal(roundListingMinimumUpUnits(2_001), 2_200);
  assert.equal(roundListingMinimumUpUnits(4_999), 5_000);
  assert.equal(roundListingMinimumUpUnits(5_001), 5_500);
  assert.equal(roundListingMinimumUpUnits(370_000_001), 380_000_000);
});

test('rejects non-integer unit inputs for rounding operations', () => {
  assert.throws(() => roundLegacyMarketPriceUnits(-1), /non-negative safe integer/);
  assert.throws(() => marketPriceBoundsUnits(1.5), /non-negative safe integer/);
  assert.throws(() => roundListingMinimumUpUnits(Number.MAX_SAFE_INTEGER + 1), /safe integer/);
});
