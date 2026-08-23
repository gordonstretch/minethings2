import assert from 'node:assert/strict';
import test from 'node:test';
import { loadLegacyCatalog } from '../src/legacy-catalog.js';
import {
  cambridgeWeatherAt, moonPhaseAt, weatherSlotAt, worldCreatureRollInterval
} from '../src/world-events.js';

const catalog = loadLegacyCatalog();

test('derives stable eight-phase lunar effects from real time', () => {
  const newMoon = moonPhaseAt(Date.UTC(2000, 0, 6, 18, 14));
  assert.equal(newMoon.name, 'New Moon');
  assert.equal(newMoon.krakenWake, 2);
  const fullMoon = moonPhaseAt(Date.UTC(2000, 0, 6, 18, 14)
    + 29.530588853 / 2 * 24 * 60 * 60 * 1000);
  assert.equal(fullMoon.name, 'Full Moon');
  assert.equal(fullMoon.landWhaleWake, 4);
  assert.equal(fullMoon.dwarfCapture, 2);
});

test('generates deterministic seasonal weather from Cambridge climate normals', () => {
  const slotMs = Number(catalog.settings.weather_slot_ms);
  const winterAt = weatherSlotAt(Date.UTC(2026, 0, 15, 12), slotMs);
  const summerAt = weatherSlotAt(Date.UTC(2026, 6, 15, 12), slotMs);
  const winter = cambridgeWeatherAt(1, winterAt, catalog.settings);
  const repeated = cambridgeWeatherAt(1, winterAt, catalog.settings);
  const summer = cambridgeWeatherAt(1, summerAt, catalog.settings);
  assert.deepEqual(repeated, winter);
  assert.ok(summer.climate.maxC > winter.climate.maxC);
  assert.equal(winter.endsAt - winter.slotAt, slotMs);
});

test('chooses natural creature roll intervals across the inclusive 1-to-45-minute range', () => {
  assert.equal(worldCreatureRollInterval(catalog.settings, () => 0), 60 * 1000);
  assert.equal(worldCreatureRollInterval(
    catalog.settings, () => 1 - Number.EPSILON
  ), 45 * 60 * 1000);
  for (let index = 0; index <= 100; index += 1) {
    const interval = worldCreatureRollInterval(catalog.settings, () => index / 100);
    assert.ok(Number.isSafeInteger(interval));
    assert.ok(interval >= 60 * 1000 && interval <= 45 * 60 * 1000);
  }
});
