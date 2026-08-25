const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const GOLD_UNITS_PER_GOLD = 10000;

export const CRYPTO_MARKET_RANGES = Object.freeze({
  day: Object.freeze({ durationMs: DAY_MS, bucketMs: HOUR_MS }),
  week: Object.freeze({ durationMs: 7 * DAY_MS, bucketMs: 6 * HOUR_MS }),
  month: Object.freeze({ durationMs: 30 * DAY_MS, bucketMs: DAY_MS }),
  year: Object.freeze({ durationMs: 365 * DAY_MS, bucketMs: 7 * DAY_MS })
});

function safeInteger(value, label, { minimum = Number.MIN_SAFE_INTEGER } = {}) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum) {
    throw new TypeError(`${label} must be a safe integer${minimum > Number.MIN_SAFE_INTEGER ? ` of at least ${minimum}` : ''}.`);
  }
  return parsed;
}

function safeNumberFromBigInt(value, label) {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) {
    throw new RangeError(`${label} is outside JavaScript's safe integer range.`);
  }
  return number;
}

function normalizeNow(now) {
  return safeInteger(now instanceof Date ? now.getTime() : now, 'now');
}

function normalizeSale(row, index) {
  if (!row || typeof row !== 'object') {
    throw new TypeError(`sales[${index}] must be an object.`);
  }
  return Object.freeze({
    ...row,
    id: safeInteger(row.id, `sales[${index}].id`, { minimum: 0 }),
    priceUnits: safeInteger(row.price_units, `sales[${index}].price_units`, { minimum: 1 }),
    quantity: safeInteger(row.quantity, `sales[${index}].quantity`, { minimum: 1 }),
    createdAt: safeInteger(row.created_at, `sales[${index}].created_at`)
  });
}

function normalizeOrder(row, index) {
  if (!row || typeof row !== 'object') {
    throw new TypeError(`orders[${index}] must be an object.`);
  }
  const side = row.side === 'buy' || row.side === 'bid'
    ? 'buy'
    : row.side === 'sell' || row.side === 'ask' || row.side === 'listing'
      ? 'sell'
      : null;
  if (!side) throw new TypeError(`orders[${index}].side must be buy/bid or sell/ask/listing.`);
  const rawCreatedAt = row.created_at ?? row.createdAt;
  return Object.freeze({
    ...row,
    id: safeInteger(row.id, `orders[${index}].id`, { minimum: 0 }),
    side,
    priceUnits: safeInteger(row.price_units, `orders[${index}].price_units`, { minimum: 1 }),
    quantity: safeInteger(row.quantity, `orders[${index}].quantity`, { minimum: 1 }),
    createdAt: rawCreatedAt === undefined
      ? null
      : safeInteger(rawCreatedAt, `orders[${index}].created_at`)
  });
}

function compareTimedRows(left, right) {
  return left.createdAt - right.createdAt || left.id - right.id || left.inputIndex - right.inputIndex;
}

function weightedAverageUnits(rows) {
  if (rows.length === 0) return null;
  let notional = 0n;
  let volume = 0n;
  for (const row of rows) {
    const quantity = BigInt(row.quantity);
    notional += BigInt(row.priceUnits) * quantity;
    volume += quantity;
  }
  // Round half-up to the nearest 1/10,000th of a gold piece. Prices and all
  // persisted values remain integer gold units even when the exact mean falls
  // between two units.
  return safeNumberFromBigInt((notional + volume / 2n) / volume, 'VWAP');
}

function totalVolume(rows) {
  let volume = 0n;
  for (const row of rows) volume += BigInt(row.quantity);
  return safeNumberFromBigInt(volume, 'Trade volume');
}

function summarizeTrades(rows, previousSale = null) {
  if (rows.length === 0) {
    return Object.freeze({
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
  }

  let highUnits = rows[0].priceUnits;
  let lowUnits = rows[0].priceUnits;
  for (const row of rows) {
    highUnits = Math.max(highUnits, row.priceUnits);
    lowUnits = Math.min(lowUnits, row.priceUnits);
  }
  const closeUnits = rows.at(-1).priceUnits;
  const changeUnits = previousSale ? closeUnits - previousSale.priceUnits : null;

  return Object.freeze({
    openUnits: rows[0].priceUnits,
    highUnits,
    lowUnits,
    closeUnits,
    volume: totalVolume(rows),
    tradeCount: rows.length,
    vwapUnits: weightedAverageUnits(rows),
    changeUnits,
    changePercent: previousSale
      ? (changeUnits / previousSale.priceUnits) * 100
      : null
  });
}

function buildBuckets(rows, windowStart, windowEnd, rangeConfig) {
  if (rows.length === 0) return Object.freeze([]);
  const bucketCount = Math.ceil(rangeConfig.durationMs / rangeConfig.bucketMs);
  const grouped = new Map();

  for (const row of rows) {
    // A sale exactly at the right-hand boundary belongs to the final visible
    // bucket, not to a synthetic bucket beyond the selected window.
    const rawIndex = Math.floor((row.createdAt - windowStart) / rangeConfig.bucketMs);
    const bucketIndex = Math.min(bucketCount - 1, Math.max(0, rawIndex));
    const group = grouped.get(bucketIndex) ?? [];
    group.push(row);
    grouped.set(bucketIndex, group);
  }

  return Object.freeze([...grouped.entries()].sort(([left], [right]) => left - right)
    .map(([bucketIndex, trades]) => {
      const metrics = summarizeTrades(trades);
      return Object.freeze({
        index: bucketIndex,
        startAt: windowStart + bucketIndex * rangeConfig.bucketMs,
        endAt: Math.min(windowStart + (bucketIndex + 1) * rangeConfig.bucketMs, windowEnd),
        ...metrics
      });
    }));
}

function bestQuote(orders, side) {
  const candidates = orders.filter((order) => order.side === side);
  if (candidates.length === 0) return null;
  const bestPrice = side === 'buy'
    ? Math.max(...candidates.map((order) => order.priceUnits))
    : Math.min(...candidates.map((order) => order.priceUnits));
  const atBest = candidates.filter((order) => order.priceUnits === bestPrice)
    .sort(compareTimedRows);

  return Object.freeze({
    priceUnits: bestPrice,
    quantity: totalVolume(atBest),
    orderCount: atBest.length,
    orderIds: Object.freeze(atBest.map((order) => order.id))
  });
}

/**
 * Produce a point-in-time analytics snapshot for one crypto currency.
 *
 * `sales` must contain raw database-shaped rows with `id`, `price_units`,
 * `quantity`, and `created_at`. `orders` uses the same price/time names plus a
 * buy/bid or sell/ask/listing `side`. A supplied `status` other than `open` is
 * ignored. Results use integer units where 10,000 units equal one gold piece.
 */
export function analyzeCryptoMarket({ sales = [], orders = [], range = 'day', now = Date.now() } = {}) {
  if (!Array.isArray(sales)) throw new TypeError('sales must be an array.');
  if (!Array.isArray(orders)) throw new TypeError('orders must be an array.');
  const rangeConfig = CRYPTO_MARKET_RANGES[range];
  if (!rangeConfig) throw new RangeError(`Unknown crypto market range: ${range}`);

  const endAt = normalizeNow(now);
  const startAt = endAt - rangeConfig.durationMs;
  const completedSales = sales.map((row, inputIndex) => ({
    ...normalizeSale(row, inputIndex), inputIndex
  })).filter((sale) => sale.createdAt <= endAt).sort(compareTimedRows);
  const periodSales = completedSales.filter((sale) => sale.createdAt >= startAt);
  const previousSale = completedSales.filter((sale) => sale.createdAt < startAt).at(-1) ?? null;
  const latestSale = completedSales.at(-1) ?? null;
  const openOrders = orders.map((row, inputIndex) => ({
    ...normalizeOrder(row, inputIndex), inputIndex
  })).filter((order) => (order.status === undefined || order.status === 'open')
    && (order.createdAt === null || order.createdAt <= endAt));
  const bestBid = bestQuote(openOrders, 'buy');
  const bestAsk = bestQuote(openOrders, 'sell');

  return Object.freeze({
    range,
    goldScale: GOLD_UNITS_PER_GOLD,
    window: Object.freeze({
      startAt,
      endAt,
      durationMs: rangeConfig.durationMs,
      bucketMs: rangeConfig.bucketMs
    }),
    currentPriceUnits: latestSale?.priceUnits ?? null,
    latestSale,
    previousSale,
    period: summarizeTrades(periodSales, previousSale),
    quotes: Object.freeze({
      bestBid,
      bestAsk,
      spreadUnits: bestBid && bestAsk ? bestAsk.priceUnits - bestBid.priceUnits : null
    }),
    buckets: buildBuckets(periodSales, startAt, endAt, rangeConfig)
  });
}

