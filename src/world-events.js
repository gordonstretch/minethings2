import { seededRandom } from './vehicle-combat.js';

const SYNODIC_MONTH_MS = 29.530588853 * 24 * 60 * 60 * 1000;
// A well-established new moon epoch. This is intentionally a gameplay clock,
// not an ephemeris: it remains deterministic and sufficiently close for the
// eight familiar visible phases.
const NEW_MOON_EPOCH_MS = Date.UTC(2000, 0, 6, 18, 14);

const PHASES = Object.freeze([
  { name: 'New Moon', icon: '🌑', krakenWake: 2, landWhaleWake: 0.75, dwarfCapture: 0.75,
    stormDamage: 1.25, creatureDamage: 1, treasure: 1,
    effect: 'Kraken wake twice as often; other creatures are quieter and storms strike ships 25% harder.' },
  { name: 'Waxing Crescent', icon: '🌒', krakenWake: 1, landWhaleWake: 1,
    dwarfCapture: 1.25, stormDamage: 1, creatureDamage: 1, treasure: 1,
    effect: 'Mining is 25% more likely to uncover a captive Dwarf.' },
  { name: 'First Quarter', icon: '🌓', krakenWake: 1, landWhaleWake: 1,
    dwarfCapture: 1, stormDamage: 1, creatureDamage: 1.2, treasure: 1,
    effect: 'Vehicles deal 20% more damage when hunting world creatures.' },
  { name: 'Waxing Gibbous', icon: '🌔', krakenWake: 1, landWhaleWake: 1.5,
    dwarfCapture: 1.5, stormDamage: 1, creatureDamage: 1, treasure: 1,
    effect: 'Dwarf captures and non-Kraken creature appearances are 50% more likely.' },
  { name: 'Full Moon', icon: '🌕', krakenWake: 1, landWhaleWake: 4,
    dwarfCapture: 2, stormDamage: 1, creatureDamage: 1, treasure: 2,
    effect: 'Non-Kraken creatures appear four times as often, Dwarf captures double, and creature treasure strongly favors rarer things.' },
  { name: 'Waning Gibbous', icon: '🌖', krakenWake: 1, landWhaleWake: 1,
    dwarfCapture: 1, stormDamage: 1, creatureDamage: 1, treasure: 1.5,
    effect: 'Defeated creature bounties favor rarer things.' },
  { name: 'Last Quarter', icon: '🌗', krakenWake: 1, landWhaleWake: 1,
    dwarfCapture: 1, stormDamage: 0.75, creatureDamage: 1.2, treasure: 1,
    effect: 'Storm damage falls by 25%; hunters deal 20% more creature damage.' },
  { name: 'Waning Crescent', icon: '🌘', krakenWake: 1.5, landWhaleWake: 1,
    dwarfCapture: 1.25, stormDamage: 1.1, creatureDamage: 1, treasure: 1,
    effect: 'Kraken and captive Dwarves are 25–50% more common, but storms hit 10% harder.' }
]);

export function moonPhaseAt(now = Date.now()) {
  const cycles = (Number(now) - NEW_MOON_EPOCH_MS) / SYNODIC_MONTH_MS;
  const fraction = ((cycles % 1) + 1) % 1;
  const index = Math.floor((fraction * 8) + 0.5) % 8;
  const phase = PHASES[index];
  return {
    ...phase,
    index,
    fraction,
    ageDays: fraction * 29.530588853,
    nextPhaseAt: Number(now) + ((1 / 8 - ((fraction + 1 / 16) % (1 / 8))) % (1 / 8))
      * SYNODIC_MONTH_MS
  };
}

export function weatherSlotAt(now, slotMs) {
  return Math.floor(Number(now) / Number(slotMs)) * Number(slotMs);
}

export function worldCreatureRollInterval(settings, random = Math.random) {
  const minimum = Number(settings?.world_creature_roll_min_interval_ms);
  const maximum = Number(settings?.world_creature_roll_max_interval_ms);
  if (!Number.isSafeInteger(minimum) || minimum < 60 * 1000
    || !Number.isSafeInteger(maximum) || maximum < minimum
    || maximum > 45 * 60 * 1000) {
    throw new Error('Invalid world creature roll interval settings.');
  }
  const roll = Math.max(0, Math.min(1 - Number.EPSILON, Number(random())));
  if (!Number.isFinite(roll)) throw new Error('Invalid world creature interval roll.');
  return minimum + Math.floor(roll * (maximum - minimum + 1));
}

export function cambridgeWeatherAt(mapId, slotAt, settings) {
  const climate = settings.weather_cambridge_monthly;
  const stormChances = settings.weather_storm_chance_by_month;
  if (!Array.isArray(climate) || climate.length !== 12
    || !Array.isArray(stormChances) || stormChances.length !== 12) {
    throw new Error('Invalid Cambridge weather settings.');
  }
  const date = new Date(Number(slotAt));
  const month = date.getUTCMonth();
  const normal = climate[month];
  const random = seededRandom('cambridge-weather', Number(mapId), Number(slotAt));
  const stormChance = Number(stormChances[month]);
  const daysInMonth = new Date(Date.UTC(date.getUTCFullYear(), month + 1, 0)).getUTCDate();
  const rainChance = Math.min(0.8, Number(normal.rainDays) / daysInMonth * 0.5);
  const roll = random();
  const condition = roll < stormChance ? 'storm'
    : roll < stormChance + rainChance ? 'rain'
      : roll < stormChance + rainChance + 0.45 ? 'cloud' : 'clear';
  const hour = date.getUTCHours() + 3;
  const warmth = (Math.cos((hour - 14) / 24 * Math.PI * 2) + 1) / 2;
  const temperatureC = Number(normal.minC)
    + (Number(normal.maxC) - Number(normal.minC)) * warmth + (random() - 0.5) * 3;
  const windKph = condition === 'storm' ? 45 + random() * 45
    : condition === 'rain' ? 18 + random() * 25 : 5 + random() * 20;
  return {
    mapId: Number(mapId), slotAt: Number(slotAt),
    endsAt: Number(slotAt) + Number(settings.weather_slot_ms),
    condition, temperatureC: Math.round(temperatureC * 10) / 10,
    windKph: Math.round(windKph), rainfallMm: condition === 'storm'
      ? Math.round((3 + random() * 12) * 10) / 10
      : condition === 'rain' ? Math.round((0.5 + random() * 4) * 10) / 10 : 0,
    climate: normal
  };
}
