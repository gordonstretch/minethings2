import { parentPort, workerData } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
import { SqliteStore } from './store.js';

if (!parentPort) throw new Error('The maintenance worker requires a parent thread.');

const store = new SqliteStore(workerData.databaseFile, {
  busyTimeoutMs: workerData.busyTimeoutMs
});

parentPort.on('message', (message) => {
  if (message?.type === 'close') {
    store.close();
    parentPort.postMessage({ type: 'closed' });
    parentPort.close();
    return;
  }
  if (message?.type !== 'tick') return;

  const started = performance.now();
  const results = {
    mines: null, dwarf: null, world: null, vehicles: null,
    factories: null, gadgets: null, oil: null, findingDigests: null, messages: null
  };
  let failure = null;
  try {
    // Refresh the versioned catalog/settings snapshot before scheduled game work.
    store.loadCatalog();
    results.mines = store.settleMines(message.now, Math.random);
    results.world = store.settleWorldEvents(message.now);
    results.dwarf = store.runDwarfUpdate(message.now, Math.random);
    results.vehicles = store.settleVehicles(message.now);
    results.factories = store.settleFactories(message.now);
    results.gadgets = store.settleGadgetAutomations(message.now);
    // Field views project continuous rates and mutating actions settle exactly.
    // Persisting the background snapshot once a minute avoids five-second write churn.
    results.oil = store.settleOilField(message.now, { minimumIntervalMs: 60000 });
  } catch (error) {
    failure = error;
  }
  // Inbox delivery is independent of the simulation systems above. A broken
  // vehicle or world event must not starve already-recorded daily summaries.
  try {
    results.findingDigests = store.sendDailyFindingDigests(message.now);
  } catch (error) {
    failure ??= error;
  }
  try {
    results.messages = store.expireMessages(message.now);
  } catch (error) {
    failure ??= error;
  }
  if (!failure) {
    parentPort.postMessage({
      type: 'tick-complete',
      durationMs: performance.now() - started,
      ...results
    });
  } else {
    parentPort.postMessage({
      type: 'tick-error',
      durationMs: performance.now() - started,
      error: {
        name: failure?.name ?? 'Error',
        message: failure?.message ?? String(failure),
        code: failure?.code
      },
      findingDigests: results.findingDigests
    });
  }
});
