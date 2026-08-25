import assert from 'node:assert/strict';
import test from 'node:test';
import { indexCatalog, loadLegacyCatalog } from '../src/legacy-catalog.js';
import {
  cambridgeWeatherAt, moonPhaseAt, weatherChangeInterval, weatherSlotAt,
  worldCreatureRollInterval
} from '../src/world-events.js';

const catalog = loadLegacyCatalog();

function sequenceRandom(...rolls) {
  let index = 0;
  return () => {
    assert.ok(index < rolls.length, 'weather generator requested an unexpected random roll');
    return rolls[index++];
  };
}

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

test('turns only cold rain into snow and only warm storms into hurricanes', () => {
  const at = Date.UTC(2026, 7, 15, 12);
  const hurricaneRoll = catalog.settings.weather_hurricane_chance_by_month[7] / 2;
  const rainRoll = catalog.settings.weather_storm_chance_by_month[7] + 0.01;
  const hurricaneSettings = {
    ...catalog.settings,
    weather_snow_max_temperature_c: -50,
    weather_hurricane_min_temperature_c: -40
  };
  const warmStorm = cambridgeWeatherAt(1, at, hurricaneSettings,
    sequenceRandom(hurricaneRoll, 0.5, 0.5, 0.5));
  assert.equal(warmStorm.condition, 'hurricane');
  assert.ok(warmStorm.windKph >= 120 && warmStorm.windKph <= 220);
  assert.ok(warmStorm.rainfallMm >= 15 && warmStorm.rainfallMm <= 60);
  const ordinaryStorm = cambridgeWeatherAt(1, at, {
    ...hurricaneSettings,
    weather_hurricane_min_temperature_c: warmStorm.temperatureC + 0.1
  }, sequenceRandom(hurricaneRoll, 0.5, 0.5, 0.5));
  assert.equal(ordinaryStorm.condition, 'storm');

  const snowSettings = {
    ...catalog.settings,
    weather_snow_max_temperature_c: 60,
    weather_hurricane_min_temperature_c: 61
  };
  const coldRain = cambridgeWeatherAt(1, at, snowSettings,
    sequenceRandom(rainRoll, 0.5, 0.5, 0.5));
  assert.equal(coldRain.condition, 'snow');
  assert.ok(coldRain.windKph >= 5 && coldRain.windKph <= 30);
  assert.ok(coldRain.rainfallMm >= 0.5 && coldRain.rainfallMm <= 6);
  const ordinaryRain = cambridgeWeatherAt(1, at, {
    ...snowSettings,
    weather_snow_max_temperature_c: coldRain.temperatureC - 0.1
  }, sequenceRandom(rainRoll, 0.5, 0.5, 0.5));
  assert.equal(ordinaryRain.condition, 'rain');

  assert.equal(cambridgeWeatherAt(1, at, {
    ...hurricaneSettings,
    weather_hurricane_chance_by_month: Array(12).fill(0)
  }, sequenceRandom(hurricaneRoll, 0.5, 0.5, 0.5)).condition, 'storm');
});

test('catalog validates snow and hurricane climate rules', () => {
  assert.equal(catalog.settings.weather_snow_max_temperature_c, 2);
  assert.equal(catalog.settings.weather_hurricane_min_temperature_c, 18);
  assert.equal(catalog.settings.weather_hurricane_chance_by_month.length, 12);
  assert.equal(catalog.settings.hurricane_ship_damage_min_ratio, 0.15);
  assert.equal(catalog.settings.hurricane_ship_damage_max_ratio, 0.35);
  assert.equal(catalog.settings.hurricane_vehicle_damage_chance, 0.65);
  assert.ok(catalog.settings.weather_hurricane_chance_by_month.every(
    (chance, month) => chance <= catalog.settings.weather_storm_chance_by_month[month]
  ));
  const invalidSettings = [
    { weather_snow_max_temperature_c: 19 },
    { weather_hurricane_min_temperature_c: -51 },
    { weather_hurricane_chance_by_month: Array(11).fill(0) },
    { weather_hurricane_chance_by_month: [1, ...Array(11).fill(0)] },
    { hurricane_ship_damage_min_ratio: -0.01 },
    { hurricane_ship_damage_min_ratio: 0.5, hurricane_ship_damage_max_ratio: 0.49 },
    { hurricane_ship_damage_max_ratio: 1.01 },
    { hurricane_vehicle_damage_chance: 1.01 }
  ];
  for (const replacement of invalidSettings) {
    const input = structuredClone(catalog);
    input.settings = { ...input.settings, ...replacement };
    assert.throws(() => indexCatalog(input), /Invalid world event settings/);
  }
});

test('chooses weather change intervals across the inclusive 30-minute-to-8-hour range', () => {
  const settings = {
    weather_change_min_interval_ms: 30 * 60 * 1000,
    weather_change_max_interval_ms: 8 * 60 * 60 * 1000
  };
  assert.equal(weatherChangeInterval(settings, () => 0), 30 * 60 * 1000);
  assert.equal(weatherChangeInterval(settings, () => 1 - Number.EPSILON),
    8 * 60 * 60 * 1000);
  for (let index = 0; index < 100; index += 1) {
    const interval = weatherChangeInterval(settings, () => index / 100);
    assert.ok(Number.isSafeInteger(interval));
    assert.ok(interval >= 30 * 60 * 1000 && interval <= 8 * 60 * 60 * 1000);
  }
});

test('validates weather change interval settings and random rolls', () => {
  const valid = {
    weather_change_min_interval_ms: 30 * 60 * 1000,
    weather_change_max_interval_ms: 8 * 60 * 60 * 1000
  };
  const invalidSettings = [
    { ...valid, weather_change_min_interval_ms: 30 * 60 * 1000 - 1 },
    { ...valid, weather_change_min_interval_ms: 8 * 60 * 60 * 1000 + 1 },
    { ...valid, weather_change_max_interval_ms: 30 * 60 * 1000 - 1 },
    { ...valid, weather_change_max_interval_ms: 8 * 60 * 60 * 1000 + 1 },
    { ...valid, weather_change_min_interval_ms: 30 * 60 * 1000 + 0.5 },
    { ...valid, weather_change_max_interval_ms: Number.MAX_SAFE_INTEGER + 1 },
    { weather_change_max_interval_ms: valid.weather_change_max_interval_ms },
    { weather_change_min_interval_ms: valid.weather_change_min_interval_ms }
  ];
  for (const settings of invalidSettings) {
    assert.throws(() => weatherChangeInterval(settings, () => 0),
      /Invalid weather change interval settings/);
  }
  for (const roll of [-Number.EPSILON, 1, Number.POSITIVE_INFINITY, Number.NaN]) {
    assert.throws(() => weatherChangeInterval(valid, () => roll),
      /Invalid weather change interval roll/);
  }
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
