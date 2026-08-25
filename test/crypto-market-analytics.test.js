import assert from 'node:assert/strict';
import test from 'node:test';
import {
  analyzeCryptoMarket, CRYPTO_MARKET_RANGES, GOLD_UNITS_PER_GOLD
} from '../src/crypto-market-analytics.js';

const GOLD = GOLD_UNITS_PER_GOLD;
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function sale(id, gold, quantity, createdAt) {
  return { id, price_units: gold * GOLD, quantity, created_at: createdAt };
}

test('calculates period OHLC, executed volume, VWAP, and change from the prior sale', () => {
  const now = 100 * DAY;
  const start = now - DAY;
  const result = analyzeCryptoMarket({
    range: 'day',
    now,
    sales: [
      sale(1, 9, 5, start - 1),
      sale(2, 10, 2, start + HOUR),
      sale(3, 12, 3, start + 2 * HOUR),
      sale(4, 8, 1, start + 3 * HOUR),
      sale(5, 11, 4, start + 4 * HOUR)
    ]
  });

  assert.equal(result.currentPriceUnits, 11 * GOLD);
  assert.equal(result.latestSale.id, 5);
  assert.equal(result.previousSale.id, 1);
  assert.deepEqual(result.period, {
    openUnits: 10 * GOLD,
    highUnits: 12 * GOLD,
    lowUnits: 8 * GOLD,
    closeUnits: 11 * GOLD,
    volume: 10,
    tradeCount: 4,
    vwapUnits: 108000,
    changeUnits: 2 * GOLD,
    changePercent: (2 / 9) * 100
  });
});

test('keeps the genuine latest sale even when the selected window has no trades', () => {
  const now = 50 * DAY;
  const oldSale = sale(7, 3, 2, now - 2 * DAY);
  const result = analyzeCryptoMarket({ sales: [oldSale], range: 'day', now });

  assert.equal(result.latestSale.id, 7);
  assert.equal(result.currentPriceUnits, 3 * GOLD);
  assert.equal(result.previousSale.id, 7);
  assert.deepEqual(result.period, {
    openUnits: null,
    highUnits: null,
    lowUnits: null,
    closeUnits: null,
    volume: 0,
    tradeCount: 0,
    vwapUnits: null,
    changeUnits: null,
    changePercent: null
  });
  assert.deepEqual(result.buckets, []);
});

test('excludes future sales and orders and orders equal timestamps by numeric id', () => {
  const now = 20 * DAY;
  const time = now - HOUR;
  const result = analyzeCryptoMarket({
    now,
    sales: [
      sale(9, 9, 1, time),
      sale(5, 5, 1, time),
      sale(2, 2, 1, time),
      sale(10, 99, 1, now + 1)
    ],
    orders: [
      { id: 1, side: 'buy', price_units: 7 * GOLD, quantity: 1, created_at: now + 1 },
      { id: 2, side: 'buy', price_units: 6 * GOLD, quantity: 1, created_at: now }
    ]
  });

  assert.equal(result.period.openUnits, 2 * GOLD);
  assert.equal(result.period.closeUnits, 9 * GOLD);
  assert.equal(result.latestSale.id, 9);
  assert.equal(result.period.highUnits, 9 * GOLD);
  assert.equal(result.quotes.bestBid.priceUnits, 6 * GOLD);
});

test('includes the left and right window boundaries and finds the strictly prior sale', () => {
  const now = 12 * DAY;
  const start = now - DAY;
  const result = analyzeCryptoMarket({
    now,
    sales: [
      sale(1, 4, 1, start - 1),
      sale(2, 5, 1, start),
      sale(3, 6, 1, now)
    ]
  });

  assert.equal(result.previousSale.id, 1);
  assert.equal(result.period.tradeCount, 2);
  assert.equal(result.period.openUnits, 5 * GOLD);
  assert.equal(result.period.closeUnits, 6 * GOLD);
  assert.equal(result.buckets[0].index, 0);
  assert.equal(result.buckets.at(-1).index, 23);
});

test('builds only nonempty OHLCV buckets at the documented range resolutions', () => {
  const now = 500 * DAY;
  const expectations = {
    day: HOUR,
    week: 6 * HOUR,
    month: DAY,
    year: 7 * DAY
  };

  for (const [range, bucketMs] of Object.entries(expectations)) {
    const { durationMs } = CRYPTO_MARKET_RANGES[range];
    const start = now - durationMs;
    const result = analyzeCryptoMarket({
      range,
      now,
      sales: [
        sale(1, 2, 2, start + 1),
        sale(2, 4, 3, start + Math.floor(bucketMs / 2)),
        sale(3, 3, 5, start + 2 * bucketMs + 1)
      ]
    });

    assert.equal(result.window.bucketMs, bucketMs, range);
    assert.equal(result.buckets.length, 2, range);
    assert.deepEqual(result.buckets.map((bucket) => bucket.index), [0, 2], range);
    assert.deepEqual(result.buckets[0], {
      index: 0,
      startAt: start,
      endAt: start + bucketMs,
      openUnits: 2 * GOLD,
      highUnits: 4 * GOLD,
      lowUnits: 2 * GOLD,
      closeUnits: 4 * GOLD,
      volume: 5,
      tradeCount: 2,
      vwapUnits: 32000,
      changeUnits: null,
      changePercent: null
    }, range);
  }
});

test('aggregates depth at the best bid and ask and calculates the spread', () => {
  const now = 5 * DAY;
  const result = analyzeCryptoMarket({
    now,
    orders: [
      { id: 8, side: 'bid', price_units: 5 * GOLD, quantity: 2, created_at: now - 1 },
      { id: 3, side: 'buy', price_units: 5 * GOLD, quantity: 4, created_at: now - 2 },
      { id: 2, side: 'buy', price_units: 4 * GOLD, quantity: 20, created_at: now - 3 },
      { id: 4, side: 'ask', price_units: 7 * GOLD, quantity: 3, created_at: now - 4 },
      { id: 5, side: 'listing', price_units: 8 * GOLD, quantity: 10, created_at: now - 5 },
      { id: 6, side: 'sell', price_units: 6 * GOLD, quantity: 99, created_at: now - 6, status: 'cancelled' }
    ]
  });

  assert.deepEqual(result.quotes.bestBid, {
    priceUnits: 5 * GOLD,
    quantity: 6,
    orderCount: 2,
    orderIds: [3, 8]
  });
  assert.deepEqual(result.quotes.bestAsk, {
    priceUnits: 7 * GOLD,
    quantity: 3,
    orderCount: 1,
    orderIds: [4]
  });
  assert.equal(result.quotes.spreadUnits, 2 * GOLD);
});

test('represents an empty market without inventing price, quotes, or buckets', () => {
  const result = analyzeCryptoMarket({ now: 0 });
  assert.equal(result.currentPriceUnits, null);
  assert.equal(result.latestSale, null);
  assert.equal(result.previousSale, null);
  assert.equal(result.quotes.bestBid, null);
  assert.equal(result.quotes.bestAsk, null);
  assert.equal(result.quotes.spreadUnits, null);
  assert.deepEqual(result.buckets, []);
});

test('rounds a sub-unit VWAP half-up while retaining integer gold units', () => {
  const result = analyzeCryptoMarket({
    now: DAY,
    sales: [
      { id: 1, price_units: 1, quantity: 1, created_at: DAY - 2 },
      { id: 2, price_units: 2, quantity: 1, created_at: DAY - 1 }
    ]
  });
  assert.equal(result.period.vwapUnits, 2);
});

test('rejects unknown ranges and malformed market rows', () => {
  assert.throws(() => analyzeCryptoMarket({ range: 'decade', now: 0 }), /Unknown crypto market range/);
  assert.throws(() => analyzeCryptoMarket({ now: 0, sales: [sale(1, 1, 0, 0)] }), /quantity/);
  assert.throws(() => analyzeCryptoMarket({ now: 0, orders: [{
    id: 1, side: 'hold', price_units: GOLD, quantity: 1, created_at: 0
  }] }), /side/);
});
