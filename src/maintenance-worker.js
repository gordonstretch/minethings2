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
  try {
    // Refresh the versioned catalog/settings snapshot before scheduled game work.
    store.loadCatalog();
    const world = store.settleWorldEvents(message.now);
    const dwarf = store.runDwarfUpdate(message.now, Math.random);
    const vehicles = store.settleVehicles(message.now);
    const factories = store.settleFactories(message.now);
    const oil = store.settleOilField(message.now);
    const messages = store.expireMessages(message.now);
    parentPort.postMessage({
      type: 'tick-complete',
      durationMs: performance.now() - started,
      dwarf,
      world,
      vehicles,
      factories,
      oil,
      messages
    });
  } catch (error) {
    parentPort.postMessage({
      type: 'tick-error',
      durationMs: performance.now() - started,
      error: {
        name: error?.name ?? 'Error',
        message: error?.message ?? String(error),
        code: error?.code
      }
    });
  }
});
