import crypto from 'node:crypto';

function freeze(values) {
  return Object.freeze(values);
}

function digestIndex(seed, label, length) {
  const digest = crypto.createHash('sha256').update(`${seed}\u0000${label}`).digest();
  return digest.readUInt32BE(0) % length;
}

function pick(seed, label, values) {
  return values[digestIndex(seed, label, values.length)];
}

function requiredText(context, key) {
  const value = String(context?.[key] ?? '').trim();
  if (!value) throw new Error(`World chat announcement requires ${key}.`);
  return value;
}

function requiredNumber(context, key) {
  const value = Number(context?.[key]);
  if (!Number.isFinite(value)) throw new Error(`World chat announcement requires ${key}.`);
  return value;
}

function possessive(value) {
  return /s$/iu.test(value) ? `${value}'` : `${value}'s`;
}

function capitalise(value) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

function articleFor(value) {
  return /^[aeiou]/iu.test(value) ? 'an' : 'a';
}

function renderTemplate(seed, family, templates, context) {
  return pick(seed, `${family}:template`, templates)(context);
}

const DWARF_CAPTURE_TEMPLATES = freeze([
  ({ player, captured, place }) => `${player} captured ${captured} while mining ${place}.`,
  ({ player, captured, place }) => `${player} found ${captured} hiding in the workings ${place}.`,
  ({ player, captured, place }) => `${possessive(player)} mining crew secured ${captured} ${place}.`,
  ({ player, captured, place }) => `Mine watch reports ${player} recovered ${captured} ${place}.`,
  ({ player, captured, place }) => `${player} coaxed ${captured} out of the rock ${place}.`,
  ({ player, captured, place }) => `${possessive(player)} latest shift ended with ${captured} in custody ${place}.`,
  ({ player, captured, place }) => `Unexpected company for ${player}: ${captured} recovered ${place}.`,
  ({ player, captured, place }) => `${player} brought ${captured} blinking into daylight ${place}.`
]);

const DWARF_STOWAWAY_TEMPLATES = freeze([
  ({ dwarf, origin, destination, player, vehicle }) => `A ${dwarf} stowaway was seen leaving ${origin} for ${destination} aboard ${possessive(player)} ${vehicle}.`,
  ({ dwarf, origin, destination, player, vehicle }) => `Departure watch at ${origin} spotted a ${dwarf} hiding aboard ${possessive(player)} ${vehicle}, bound for ${destination}.`,
  ({ dwarf, origin, destination, player, vehicle }) => `One passenger was not on the manifest: a ${dwarf} left ${origin} for ${destination} in ${possessive(player)} ${vehicle}.`,
  ({ dwarf, origin, destination, player, vehicle }) => `A ${dwarf} slipped out of ${origin} aboard ${possessive(player)} ${vehicle}. The vehicle is heading for ${destination}.`,
  ({ dwarf, origin, destination, player, vehicle }) => `${possessive(player)} ${vehicle} departed ${origin} for ${destination} with a concealed ${dwarf} aboard.`,
  ({ dwarf, origin, destination, player, vehicle }) => `Stowaway report: a ${dwarf} is travelling from ${origin} to ${destination} aboard ${possessive(player)} ${vehicle}.`,
  ({ dwarf, origin, destination, player, vehicle }) => `A small figure boarded at ${origin}: a ${dwarf}, now bound for ${destination} with ${possessive(player)} ${vehicle}.`,
  ({ dwarf, origin, destination, player, vehicle }) => `The cargo moved at ${origin}. A ${dwarf} is riding ${possessive(player)} ${vehicle} toward ${destination}.`
]);

const SHIP_SUNK_TEMPLATES = freeze([
  ({ lost, route }) => `${lost} sunk on the ${route} route.`,
  ({ lost, route }) => `The ${route} route claimed ${lost}.`,
  ({ lost, route }) => `${lost} went down before completing the ${route} crossing.`,
  ({ lost, route }) => `Wreck report from the ${route} route: ${lost} lost.`,
  ({ lost, route }) => `No arrival for ${lost}; it sank on the ${route} route.`,
  ({ lost, route }) => `The water closed over ${lost} on the ${route} route.`,
  ({ lost, route }) => `${lost} will not reach port. It sank along the ${route} route.`,
  ({ lost, route }) => `A new wreck marks the ${route} route: ${lost}.`
]);

const TRANSPORT_DESTROYED_TEMPLATES = Object.freeze({
  land: freeze([
    ({ player, vehicle, route, cause }) => `${possessive(player)} ${vehicle} was destroyed on the ${route} route during ${cause}.`,
    ({ player, vehicle, route, cause }) => `Transport lost: ${possessive(player)} ${vehicle} did not survive ${cause} on the ${route} route.`,
    ({ player, vehicle, route, cause }) => `A new wreck marks the ${route} route. ${possessive(player)} ${vehicle} was destroyed during ${cause}.`,
    ({ player, vehicle, route, cause }) => `${capitalise(cause)} destroyed ${possessive(player)} ${vehicle} on the ${route} route.`,
    ({ player, vehicle, route, cause }) => `No arrival for ${possessive(player)} ${vehicle}; ${cause} ended its journey on the ${route} route.`,
    ({ player, vehicle, route, cause }) => `Route watch confirms the destruction of ${possessive(player)} ${vehicle} on ${route} during ${cause}.`
  ]),
  air: freeze([
    ({ player, vehicle, route, cause }) => `${possessive(player)} ${vehicle} was shot down over ${route} during ${cause}.`,
    ({ player, vehicle, route, cause }) => `Aircraft lost: ${possessive(player)} ${vehicle} came down over ${route} during ${cause}.`,
    ({ player, vehicle, route, cause }) => `Airfield watch lost contact with ${possessive(player)} ${vehicle} over ${route}. Cause: ${capitalise(cause)}.`,
    ({ player, vehicle, route, cause }) => `${capitalise(cause)} brought down ${possessive(player)} ${vehicle} over ${route}.`,
    ({ player, vehicle, route, cause }) => `${possessive(player)} ${vehicle} will not complete its sortie over ${route}; it was lost during ${cause}.`,
    ({ player, vehicle, route, cause }) => `Wreck recovery has begun for ${possessive(player)} ${vehicle}, shot down over ${route} during ${cause}.`
  ])
});

const GHOST_RISEN_OPENINGS = freeze([
  ({ ghost, route }) => `${ghost} has risen on the ${route} route.`,
  ({ ghost, route }) => `The wreck called ${ghost} is moving again along the ${route} route.`,
  ({ ghost, route }) => `${ghost} has returned to the ${route} route.`,
  ({ ghost, route }) => `Route watch reports ${ghost} active on the ${route} route.`,
  ({ ghost, route }) => `The ${route} route has given back ${ghost}.`,
  ({ ghost, route }) => `Something wearing the shape of ${ghost} now haunts the ${route} route.`
]);

const GHOST_RISEN_WARNINGS = Object.freeze({
  land: freeze([
    'The road remembers.', 'Drivers should keep their distance.',
    'Its last journey is not over.', 'Road traffic is advised to turn back.',
    'The dead have right of way.', 'The next set of tracks may not be living ones.'
  ]),
  sea: freeze([
    'The water remembers.', 'Sailors should keep their distance.',
    'Its last voyage is not over.', 'Sea traffic is advised to turn back.',
    'The dead have right of way.', 'The next wake may belong to no living ship.'
  ])
});

const GHOST_DEFEATED_TEMPLATES = freeze([
  ({ player, vehicle, ghost }) => `${possessive(player)} ${vehicle} banished ${ghost}.`,
  ({ player, vehicle, ghost }) => `${ghost} met its end again at the hands of ${possessive(player)} ${vehicle}.`,
  ({ player, vehicle, ghost }) => `${possessive(player)} ${vehicle} sent ${ghost} back into silence.`,
  ({ player, vehicle, ghost }) => `Route watch confirms ${possessive(player)} ${vehicle} laid ${ghost} to rest.`,
  ({ player, vehicle, ghost }) => `${ghost} has been driven from the route by ${possessive(player)} ${vehicle}.`,
  ({ player, vehicle, ghost }) => `${possessive(player)} ${vehicle} ended the second journey of ${ghost}.`,
  ({ player, vehicle, ghost }) => `The road is quieter: ${possessive(player)} ${vehicle} banished ${ghost}.`,
  ({ player, vehicle, ghost }) => `${ghost} is a wreck once more, courtesy of ${possessive(player)} ${vehicle}.`
]);

const WEATHER_OBSERVATION_TEMPLATES = freeze([
  ({ map, condition, temperature, wind, rainfall }) => `Weather on ${map}: ${condition}; ${temperature} C, winds ${wind} km/h, rainfall ${rainfall} mm.`,
  ({ map, condition, temperature, wind, rainfall }) => `${map} now reports ${condition}: ${temperature} C, ${wind} km/h winds and ${rainfall} mm rainfall.`,
  ({ map, condition, temperature, wind, rainfall }) => `Fresh reading for ${map}: ${condition}, ${temperature} C, wind ${wind} km/h, rain ${rainfall} mm.`,
  ({ map, condition, temperature, wind, rainfall }) => `Conditions changed over ${map}. Expect ${condition} at ${temperature} C, with ${wind} km/h winds and ${rainfall} mm rainfall.`,
  ({ map, condition, temperature, wind, rainfall }) => `The ${map} weather station records ${condition}: ${temperature} C; wind ${wind} km/h; rainfall ${rainfall} mm.`,
  ({ map, condition, temperature, wind, rainfall }) => `New skies over ${map}: ${condition}. Temperature ${temperature} C, winds ${wind} km/h, rainfall ${rainfall} mm.`
]);

const STORM_WARNING_TEMPLATES = freeze([
  ({ map, wind, rainfall }) => `Storm warning for ${map}: winds ${wind} km/h and precipitation ${rainfall} mm. Ships at sea may suffer hull damage.`,
  ({ map, wind, rainfall }) => `${map} storm watch: ${wind} km/h winds, ${rainfall} mm precipitation. Ships at sea are at risk.`,
  ({ map, wind, rainfall }) => `The barometers have turned in ${map}. A ${wind} km/h storm with ${rainfall} mm precipitation threatens ships at sea.`,
  ({ map, wind, rainfall }) => `Rough weather over ${map}: winds ${wind} km/h, precipitation ${rainfall} mm. Exposed ships may take hull damage.`,
  ({ map, wind, rainfall }) => `Sea warning, ${map}: the storm brings ${wind} km/h winds and ${rainfall} mm precipitation. Hull damage is possible.`,
  ({ map, wind, rainfall }) => `A storm has closed around ${map}: ${wind} km/h winds and ${rainfall} mm precipitation. Ships should seek shelter.`
]);

const SNOW_WARNING_TEMPLATES = freeze([
  ({ map }) => `Snow in ${map}: vehicle departures are suspended until conditions improve.`,
  ({ map }) => `${map} is under snow. No vehicles may depart until the roads and runways clear.`,
  ({ map }) => `Snow has stopped departures across ${map}; idle vehicles must remain where they are.`,
  ({ map }) => `Whiteout notice for ${map}: all vehicle departures are temporarily suspended.`,
  ({ map }) => `The routes out of ${map} are snowbound. Departures will resume when conditions improve.`,
  ({ map }) => `Snow closes ${map} to new vehicle departures. Travellers already moving continue at their own risk.`
]);

const HURRICANE_WARNING_TEMPLATES = freeze([
  ({ map }) => `Hurricane warning for ${map}: all land vehicles and ships already travelling are at risk of damage.`,
  ({ map }) => `${map} is under a hurricane warning. Travelling land vehicles and ships may be damaged.`,
  ({ map }) => `A hurricane is crossing ${map}; every land vehicle and ship already underway is exposed.`,
  ({ map }) => `Extreme-weather alert for ${map}: hurricane conditions threaten land and sea traffic in motion.`,
  ({ map }) => `Hurricane conditions have reached ${map}. Vehicles on the road and ships at sea are at risk.`,
  ({ map }) => `The wind has become dangerous in ${map}. A hurricane may damage travelling land vehicles and ships.`
]);

const CREATURE_SIGHTING_TEMPLATES = freeze([
  ({ creature, route, destination }) => `${creature} sighted on the ${route} route, moving toward ${destination}.`,
  ({ creature, route, destination }) => `Route scouts report ${creature} on the ${route} route, heading for ${destination}.`,
  ({ creature, route, destination }) => `${creature} has entered the ${route} route and is moving toward ${destination}.`,
  ({ creature, route, destination }) => `Traffic warning: ${creature} is travelling the ${route} route toward ${destination}.`,
  ({ creature, route, destination }) => `Movement on the ${route} route resolved into ${creature}, bound for ${destination}.`,
  ({ creature, route, destination }) => `Watch the approaches to ${destination}: ${creature} is coming along the ${route} route.`,
  ({ creature, route, destination }) => `Route hazard confirmed: ${creature} is loose on the ${route} route and moving toward ${destination}.`,
  ({ creature, route, destination }) => `The ${route} route is no longer clear. ${creature} is advancing toward ${destination}.`
]);

const CREATURE_ESCAPED_TEMPLATES = freeze([
  ({ creature, destination }) => `${creature} reached ${destination} and escaped the hunters.`,
  ({ creature, destination }) => `The hunt is over: ${creature} made it to ${destination}.`,
  ({ creature, destination }) => `${creature} slipped through the cordon and reached ${destination}.`,
  ({ creature, destination }) => `Too late at ${destination}. ${creature} arrived and escaped.`,
  ({ creature, destination }) => `Hunters lost ${creature} at ${destination}.`,
  ({ creature, destination }) => `${destination} reports an arrival but no capture: ${creature} escaped.`,
  ({ creature, destination }) => `${creature} outran the hunt and vanished into ${destination}.`,
  ({ creature, destination }) => `The trail ends at ${destination}; ${creature} is gone.`
]);

const MOON_PHASE_TEMPLATES = freeze([
  ({ name, effect }) => `${name}: ${effect}`,
  ({ name, effect }) => `Moon watch records ${name}. ${effect}`,
  ({ name, effect }) => `The sky has entered ${name}. ${effect}`,
  ({ name, effect }) => `${name} now hangs over Old Earth. ${effect}`,
  ({ name, effect }) => `Lunar notice: ${name}. ${effect}`,
  ({ name, effect }) => `A change above: ${name}. ${effect}`
]);

const CREATURE_DEFEATED_TEMPLATES = freeze([
  ({ player, vehicle, creature }) => `${possessive(player)} ${vehicle} defeated the ${creature}.`,
  ({ player, vehicle, creature }) => `The ${creature} fell to ${possessive(player)} ${vehicle}.`,
  ({ player, vehicle, creature }) => `${possessive(player)} ${vehicle} cleared the ${creature} from the route.`,
  ({ player, vehicle, creature }) => `Hunt complete: ${possessive(player)} ${vehicle} brought down the ${creature}.`,
  ({ player, vehicle, creature }) => `The ${creature} will trouble the route no longer; ${possessive(player)} ${vehicle} stopped it.`,
  ({ player, vehicle, creature }) => `Route watch credits ${possessive(player)} ${vehicle} with defeating the ${creature}.`,
  ({ player, vehicle, creature }) => `${possessive(player)} ${vehicle} won its encounter with the ${creature}.`,
  ({ player, vehicle, creature }) => `The hunt for the ${creature} ended with ${possessive(player)} ${vehicle} victorious.`
]);

const ROUTE_CLOSED_TEMPLATES = freeze([
  ({ mode, route, traffic }) => `The ${mode} route ${route} has closed to new departures. ${traffic}`,
  ({ mode, route, traffic }) => `Route closure: no new ${mode} traffic may enter ${route}. ${traffic}`,
  ({ mode, route, traffic }) => `${route} is now closed to departing ${mode} traffic. ${traffic}`,
  ({ mode, route, traffic }) => `Departure control has closed the ${mode} route ${route}. ${traffic}`,
  ({ mode, route, traffic }) => `Travel warning for ${route}: the ${mode} route is closed. ${traffic}`,
  ({ mode, route, traffic }) => `The gates are shut on the ${mode} route ${route}. ${traffic}`
]);

const ROUTE_REOPENED_TEMPLATES = freeze([
  ({ mode, route }) => `The ${mode} route ${route} has reopened to departures.`,
  ({ mode, route }) => `Route clear: ${mode} traffic may depart along ${route} again.`,
  ({ mode, route }) => `${route} is open once more to departing ${mode} traffic.`,
  ({ mode, route }) => `Departure control has reopened the ${mode} route ${route}.`,
  ({ mode, route }) => `Travel notice for ${route}: the ${mode} route is open again.`,
  ({ mode, route }) => `The gates are open again on the ${mode} route ${route}.`
]);

const REWARD_SENTENCES = freeze([
  (reward) => `${capitalise(reward)}.`,
  (reward) => `The crew ${reward}.`,
  (reward) => `The crew also ${reward}.`,
  (reward) => `After the fight, the crew ${reward}.`
]);

export const WORLD_CHAT_ANNOUNCEMENT_FAMILIES = freeze([
  'dwarf-capture', 'dwarf-stowaway', 'ship-sunk', 'transport-destroyed',
  'ghost-risen', 'ghost-defeated',
  'weather-observation', 'storm-warning', 'snow-warning', 'hurricane-warning',
  'creature-sighting', 'creature-escaped', 'moon-phase', 'creature-defeated',
  'route-closed', 'route-reopened'
]);

const FAMILY_SET = new Set(WORLD_CHAT_ANNOUNCEMENT_FAMILIES);

export function generateWorldChatAnnouncement(familyValue, seedValue, context = {}) {
  const family = String(familyValue ?? '').trim();
  const seed = String(seedValue ?? '').trim();
  if (!FAMILY_SET.has(family)) throw new Error(`Unknown world chat announcement family: ${family}.`);
  if (!seed) throw new Error('World chat announcement seed is required.');

  if (family === 'dwarf-capture') {
    const player = requiredText(context, 'playerName');
    const dwarf = requiredText(context, 'dwarfName');
    const count = requiredNumber(context, 'count');
    if (!Number.isSafeInteger(count) || count < 1) {
      throw new Error('World chat announcement requires a positive count.');
    }
    const cityName = context.cityName === null || context.cityName === undefined
      ? '' : String(context.cityName).trim();
    return renderTemplate(seed, family, DWARF_CAPTURE_TEMPLATES, {
      player, captured: count === 1 ? `${articleFor(dwarf)} ${dwarf}` : `${count} × ${dwarf}`,
      place: cityName ? `in ${cityName}` : 'at sea'
    });
  }
  if (family === 'dwarf-stowaway') {
    return renderTemplate(seed, family, DWARF_STOWAWAY_TEMPLATES, {
      dwarf: requiredText(context, 'dwarfName'),
      origin: requiredText(context, 'originName'),
      destination: requiredText(context, 'destinationName'),
      player: requiredText(context, 'playerName'),
      vehicle: requiredText(context, 'vehicleName')
    });
  }
  if (family === 'ship-sunk') {
    return renderTemplate(seed, family, SHIP_SUNK_TEMPLATES, {
      lost: requiredText(context, 'lostItems'), route: requiredText(context, 'routeName')
    });
  }
  if (family === 'transport-destroyed') {
    const kind = String(context.transportKind ?? '').trim();
    if (!Object.hasOwn(TRANSPORT_DESTROYED_TEMPLATES, kind)) {
      throw new Error('World chat announcement requires a land or air transport kind.');
    }
    return renderTemplate(seed, `${family}:${kind}`, TRANSPORT_DESTROYED_TEMPLATES[kind], {
      player: requiredText(context, 'playerName'),
      vehicle: requiredText(context, 'vehicleName'),
      route: requiredText(context, 'routeName'),
      cause: requiredText(context, 'causeName')
    });
  }
  if (family === 'ghost-risen') {
    const kind = context.ghostKind === 'ship' ? 'sea' : 'land';
    const values = {
      ghost: requiredText(context, 'ghostName'), route: requiredText(context, 'routeName')
    };
    const opening = pick(seed, `${family}:opening`, GHOST_RISEN_OPENINGS)(values);
    const warning = pick(seed, `${family}:warning`, GHOST_RISEN_WARNINGS[kind]);
    return `${opening} ${warning}`;
  }
  if (family === 'ghost-defeated') {
    return renderTemplate(seed, family, GHOST_DEFEATED_TEMPLATES, {
      player: requiredText(context, 'playerName'),
      vehicle: requiredText(context, 'vehicleName'),
      ghost: requiredText(context, 'ghostName')
    });
  }
  if (family === 'weather-observation') {
    return renderTemplate(seed, family, WEATHER_OBSERVATION_TEMPLATES, {
      map: requiredText(context, 'mapName'), condition: requiredText(context, 'condition'),
      temperature: requiredNumber(context, 'temperatureC'),
      wind: requiredNumber(context, 'windKph'), rainfall: requiredNumber(context, 'rainfallMm')
    });
  }
  if (family === 'storm-warning') {
    return renderTemplate(seed, family, STORM_WARNING_TEMPLATES, {
      map: requiredText(context, 'mapName'), wind: requiredNumber(context, 'windKph'),
      rainfall: requiredNumber(context, 'rainfallMm')
    });
  }
  if (family === 'snow-warning') {
    return renderTemplate(seed, family, SNOW_WARNING_TEMPLATES, {
      map: requiredText(context, 'mapName')
    });
  }
  if (family === 'hurricane-warning') {
    return renderTemplate(seed, family, HURRICANE_WARNING_TEMPLATES, {
      map: requiredText(context, 'mapName')
    });
  }
  if (family === 'creature-sighting') {
    return renderTemplate(seed, family, CREATURE_SIGHTING_TEMPLATES, {
      creature: requiredText(context, 'creatureName'),
      route: requiredText(context, 'routeName'),
      destination: requiredText(context, 'destinationName')
    });
  }
  if (family === 'creature-escaped') {
    return renderTemplate(seed, family, CREATURE_ESCAPED_TEMPLATES, {
      creature: requiredText(context, 'creatureName'),
      destination: requiredText(context, 'destinationName')
    });
  }
  if (family === 'moon-phase') {
    return renderTemplate(seed, family, MOON_PHASE_TEMPLATES, {
      name: requiredText(context, 'moonName'), effect: requiredText(context, 'effect')
    });
  }
  if (family === 'route-closed') {
    const journeyCount = requiredNumber(context, 'activeJourneys');
    if (!Number.isSafeInteger(journeyCount) || journeyCount < 0) {
      throw new Error('World chat announcement requires a non-negative journey count.');
    }
    return renderTemplate(seed, family, ROUTE_CLOSED_TEMPLATES, {
      mode: requiredText(context, 'routeMode'),
      route: requiredText(context, 'routeName'),
      traffic: journeyCount
        ? `${journeyCount} journey${journeyCount === 1 ? '' : 's'} already underway may finish.`
        : 'No journeys are underway.'
    });
  }
  if (family === 'route-reopened') {
    return renderTemplate(seed, family, ROUTE_REOPENED_TEMPLATES, {
      mode: requiredText(context, 'routeMode'),
      route: requiredText(context, 'routeName')
    });
  }
  const values = {
    player: requiredText(context, 'playerName'),
    vehicle: requiredText(context, 'vehicleName'),
    creature: requiredText(context, 'creatureName')
  };
  const outcome = renderTemplate(seed, family, CREATURE_DEFEATED_TEMPLATES, values);
  const reward = String(context.rewardSummary ?? '').trim();
  if (!reward) return outcome;
  return `${outcome} ${pick(seed, `${family}:reward`, REWARD_SENTENCES)(reward)}`;
}
