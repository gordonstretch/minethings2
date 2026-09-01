export const CITY_MAZE_SIZE = 35;
export const CITY_EXPLORATION_VERSION = 3;
export const CITY_ENCOUNTER_GRACE_STEPS = 5;
export const CITY_ENCOUNTER_COOLDOWN_STEPS = 7;
// Street incidents should punctuate a journey, not interrupt every short walk.
export const CITY_ENCOUNTER_CHANCE = 0.12 / 50;
export const CITY_ORE_SCRAP_COUNT = 96;
export const CITY_POWER_UP_COUNT = 4;
export const CITY_POWER_DURATION_STEPS = 20;
export const CITY_EATEN_ACTOR_RESPAWN_STEPS = 6;
export const CITY_NOTICE_REWARD_SCRAPS = 20;
export const CITY_LOCATION_REWARD_SCRAPS = 20;
export const CITY_STREET_DEAD_PAUSE_MS = 1800;

export const CITY_STREET_DWARVES = Object.freeze([
  { rarity: 1, name: 'Yellow Dwarf', colour: '#f0df35', attack: 'bite' },
  { rarity: 2, name: 'Green Dwarf', colour: '#78bd46', attack: 'pickpocket' },
  { rarity: 3, name: 'Blue Dwarf', colour: '#66b9df', attack: 'bite' },
  { rarity: 4, name: 'Red Dwarf', colour: '#e75b4d', attack: 'pickpocket' },
  { rarity: 5, name: 'Purple Dwarf', colour: '#bd79c9', attack: 'bite' },
  { rarity: 6, name: 'Orange Dwarf', colour: '#f49a28', attack: 'pickpocket' }
]);

const CITY_STREET_DEAD = Object.freeze([
  { name: 'Restless Miner', colour: '#a8c9bd' },
  { name: 'Road Wraith', colour: '#82a5a4' },
  { name: 'Unquiet Porter', colour: '#c4d8c8' }
]);

const REGION_APPEARANCES = Object.freeze({
  aso: {
    motif: 'ember', void: '#090a08', wall: '#49372d', wallEdge: '#9a7048',
    wallAlt: '#211f1b', street: '#272824', streetEdge: '#75664f', route: '#d47b2b',
    point: '#183746', pointRing: '#69bdc9', sign: '#f2bc35', accent: '#e86f20'
  },
  bromo: {
    motif: 'ash', void: '#0d0d0c', wall: '#5b554d', wallEdge: '#aaa08e',
    wallAlt: '#2e2c29', street: '#33322f', streetEdge: '#77746d', route: '#c7b466',
    point: '#303c3c', pointRing: '#9fb1a9', sign: '#d9ca54', accent: '#d79a31'
  },
  calbuco: {
    motif: 'river', void: '#061014', wall: '#42513b', wallEdge: '#84966d',
    wallAlt: '#18352d', street: '#26352f', streetEdge: '#547568', route: '#55a9be',
    point: '#123b54', pointRing: '#72d0df', sign: '#e4c64b', accent: '#3d9ab5'
  },
  dempo: {
    motif: 'frost', void: '#07121b', wall: '#6d8390', wallEdge: '#c4e3ec',
    wallAlt: '#2c4351', street: '#243944', streetEdge: '#7794a3', route: '#8de0eb',
    point: '#16354b', pointRing: '#bbf6f5', sign: '#e9d875', accent: '#68c8dd'
  },
  ebeko: {
    motif: 'steam', void: '#08100e', wall: '#4d5237', wallEdge: '#9a9565',
    wallAlt: '#24352d', street: '#29342f', streetEdge: '#61736b', route: '#7eb6ad',
    point: '#163f43', pointRing: '#79d1c2', sign: '#d8b950', accent: '#a47637'
  },
  fogo: {
    motif: 'sand', void: '#130d08', wall: '#755133', wallEdge: '#c7945d',
    wallAlt: '#3b2b22', street: '#40352d', streetEdge: '#8d7764', route: '#e0b15e',
    point: '#174854', pointRing: '#62c4c8', sign: '#efc656', accent: '#d98235'
  },
  gallego: {
    motif: 'lagoon', void: '#041116', wall: '#456247', wallEdge: '#8fb57b',
    wallAlt: '#193b37', street: '#223a38', streetEdge: '#4e817d', route: '#56cfca',
    point: '#123f5b', pointRing: '#74e1df', sign: '#f0cf54', accent: '#d5a943'
  }
});

const CITY_ARCHITECTURES = Object.freeze([
  { roofPattern: 'courtyard', streetMarking: 'single', district: 'Courtyard wards' },
  { roofPattern: 'vents', streetMarking: 'double', district: 'Machine terraces' },
  { roofPattern: 'ridge', streetMarking: 'broken', district: 'Ridge-roof quarter' },
  { roofPattern: 'lanterns', streetMarking: 'studs', district: 'Lantern streets' },
  { roofPattern: 'tiles', streetMarking: 'crossings', district: 'Tiled old town' }
]);

const CITY_LANDMARK_FORMS = Object.freeze([
  { kind: 'spire', noun: 'Needle Spire', shape: 'a narrow tower balanced above a public arch' },
  { kind: 'arch', noun: 'Impossible Arch', shape: 'an arch whose unsupported middle hangs over the street' },
  { kind: 'rotunda', noun: 'Sunken Rotunda', shape: 'a circular hall descending around an open civic hearth' },
  { kind: 'bridge', noun: 'High Bridge', shape: 'an inhabited bridge joining two otherwise unrelated roofs' },
  { kind: 'tower', noun: 'Turning Tower', shape: 'a many-sided tower whose upper rooms follow the sun' },
  { kind: 'arcade', noun: 'Whisper Arcade', shape: 'a colonnade that carries a whisper from end to end' },
  { kind: 'aqueduct', noun: 'Dry Aqueduct', shape: 'an elevated channel built to carry light instead of water' }
]);

const CITY_LANDMARK_MATERIALS = Object.freeze([
  { adjective: 'Counterweighted', material: 'blackened iron and pale Council stone' },
  { adjective: 'Glassbound', material: 'coloured glass held in riveted salvage frames' },
  { adjective: 'Ash-Crowned', material: 'fired brick dusted with the region’s oldest ash' },
  { adjective: 'Root-Woven', material: 'living timber pinned through reclaimed masonry' },
  { adjective: 'Star-Marked', material: 'blue-black blocks scored with obsolete route maps' }
]);

function cityLandmark(context) {
  const index = Math.max(0, Number(context.cityId) - 1);
  const form = CITY_LANDMARK_FORMS[index % CITY_LANDMARK_FORMS.length];
  const material = CITY_LANDMARK_MATERIALS[
    Math.floor(index / CITY_LANDMARK_FORMS.length) % CITY_LANDMARK_MATERIALS.length
  ];
  return {
    kind: form.kind,
    name: `${context.cityName} ${material.adjective} ${form.noun}`,
    material: material.material,
    description: `${form.shape[0].toUpperCase()}${form.shape.slice(1)}, built from ${material.material}.`
  };
}

function cityAppearance(context) {
  const region = REGION_APPEARANCES[context.mapSlug] ?? REGION_APPEARANCES.aso;
  const architecture = CITY_ARCHITECTURES[(Number(context.cityId) - 1)
    % CITY_ARCHITECTURES.length];
  return {
    ...region, ...architecture, landmark: cityLandmark(context),
    signature: `${context.mapSlug}-${context.cityId}`
  };
}

const REGION_LORE = {
  aso: [
    'Aso was the first region to reopen. Every road out of its capital still carries the Council’s inventory marks.',
    'Cinderwake’s oil crews insist the black rain predates the field. The Council insists the opposite.',
    'Old route stones show vehicle classes that no surviving catalogue admits ever existed.'
  ],
  bromo: [
    'Bromo’s spores are counted as weather until they begin answering questions.',
    'The first Shroom miners followed lanterns underground. None of the lanterns belonged to them.',
    'Local surveyors measure tunnels twice: once before moonrise and once after they move.'
  ],
  calbuco: [
    'Calbuco’s sawyers plant one iron nail for every tree felled. Some have grown into hinges.',
    'The oldest mills here were rebuilt around machinery recovered from Old Earth freight vaults.',
    'Wood Screws are legal tender in three workshops and grounds for a duel in a fourth.'
  ],
  dempo: [
    'Dempo records public notices as three lines. Longer truths are considered structurally unsafe.',
    'Wisdom miners leave blank tablets in the rain and collect whatever the water writes.',
    'The mountain keeps an echo of every false prophecy, but charges admission to hear one.'
  ],
  ebeko: [
    'Ebeko’s relay towers still receive machine chatter from addresses erased before the Banishing.',
    'A green lamp means power. A blue lamp means thought. An unlit lamp may mean either is hiding.',
    'Electronic Devices were once repaired here by listening for which component lied.'
  ],
  fogo: [
    'Fogo’s relic vaults were built with doors on both sides and no agreed interior.',
    'The ash archive lists objects that have not yet been manufactured.',
    'Miners are advised not to return a Relic to any pedestal that already knows their name.'
  ],
  gallego: [
    'Gallego’s surviving streets were laid over older streets, which were laid over an argument.',
    'The first miners marked safe tunnels in orange. Later miners learned the marks were invitations.',
    'Stormcrag’s harbour bell rings once for arrivals, twice for wrecks, and sometimes three times.'
  ]
};

const COMMON_LORE = [
  ({ cityName }) => `By Council order, all distances inside ${cityName} are approximate until observed.`,
  ({ cityName }) => `${cityName} civic notice: unattended Dwarves are neither lost property nor municipal staff.`,
  ({ mapName }) => `Regional ordinance ${mapName}-7: ghosts using marked crossings retain no right of way.`,
  () => 'Old Earth lies beyond every sentence the Council hands down, but no approved map shows the return route.',
  () => 'The city beneath this city remains closed for improvements. Hammering from below is administrative.',
  () => 'Miners rebuilt the world around the interface they needed. The streets have been adapting ever since.',
  () => 'Report moving signs to the Department of Fixed Objects. Do not follow them into alleys.',
  () => 'Vehicles depart by route. Wrecks sometimes depart by other means.'
];

const ENCOUNTERS = [
  {
    key: 'ore-spill', title: 'An unattended ore spill',
    text: 'A split handcart has scattered useful fragments across the passage. Its owner is nowhere obvious.',
    options: [
      { id: 'salvage', label: 'Salvage the fragments' },
      { id: 'mark', label: 'Mark it for the road crew' }
    ],
    resolve(choice, roll) {
      if (choice === 'mark') return {
        text: 'A road crew arrives with suspicious speed and gives you a stamped receipt.',
        reward: { kind: 'credits', quantity: 2, label: '2 credits' }
      };
      return roll < 0.72 ? {
        text: 'You recover a pocketful of clean Ore scraps before the cart settles.',
        reward: { kind: 'scraps', quantity: 25, label: '25 Ore scraps' }
      } : { text: 'The cart shifts. You step away with dignity and all your fingers.', reward: null };
    }
  },
  {
    key: 'council-inspector', title: 'A Council inspector',
    text: 'An official blocks the alley and asks to see your provisional pavement licence.',
    options: [
      { id: 'comply', label: 'Present your docket number' },
      { id: 'improvise', label: 'Invent a pavement licence' }
    ],
    resolve(choice, roll) {
      if (choice === 'comply') return {
        text: 'Your sentence is entirely in order. The inspector apologises and stamps your docket sideways.',
        reward: { kind: 'credits', quantity: 1, label: '1 administrative credit' }
      };
      return roll < 0.38 ? {
        text: 'The licence is so implausible that it qualifies as a new permit class.',
        reward: { kind: 'credits', quantity: 4, label: '4 credits' }
      } : { text: 'The inspector confiscates the imaginary licence. You are free to go.', reward: null };
    }
  },
  {
    key: 'restless-shadow', title: 'A shadow moving against the lamps',
    text: 'Something road-shaped follows the wall without making a sound. It has not noticed that you noticed.',
    options: [
      { id: 'confront', label: 'Stand your ground' },
      { id: 'detour', label: 'Take the long way round' }
    ],
    resolve(choice, roll) {
      if (choice === 'detour') return {
        text: 'You retreat through three respectable alleys. The shadow chooses a less cautious traveller.',
        reward: null
      };
      return roll < 0.55 ? {
        text: 'It folds into an old route token and goes still in your hand.',
        reward: { kind: 'credits', quantity: 5, label: '5 salvage credits' }
      } : { text: 'It remembers having wheels. You escape before it remembers having teeth.', reward: null };
    }
  },
  {
    key: 'dwarf-guide', title: 'A Dwarf with a hand-drawn map',
    text: 'A soot-covered Dwarf offers a shortcut. The map is detailed, confident, and upside down.',
    options: [
      { id: 'follow', label: 'Follow the map' },
      { id: 'trade', label: 'Buy a useful annotation' }
    ],
    resolve(choice, roll) {
      if (choice === 'trade') return {
        text: 'The annotation reads “YOU ARE HERE, PROBABLY.” It is oddly reassuring.',
        reward: { kind: 'scraps', quantity: 10, label: '10 Ore scraps found under the map' }
      };
      return roll < 0.64 ? {
        text: 'The shortcut reaches the same alley from a more profitable direction.',
        reward: { kind: 'credits', quantity: 3, label: '3 credits' }
      } : { text: 'After one complete circle, the Dwarf declares the expedition a survey.', reward: null };
    }
  }
];

function hashSeed(...parts) {
  let hash = 2166136261;
  for (const character of parts.join('|')) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let state = seed || 0x6d2b79f5;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function shuffled(values, random) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

function streetAxes(size, center, random) {
  const axes = new Set([2, center, size - 3]);
  for (const direction of [-1, 1]) {
    let position = center;
    while (true) {
      position += direction * (5 + Math.floor(random() * 3));
      if (position <= 4 || position >= size - 5) break;
      axes.add(position);
    }
  }
  return [...axes].sort((first, second) => first - second);
}

function cityStreetGrid(size, start, random) {
  const grid = Array.from({ length: size }, () => Array(size).fill('#'));
  const avenues = streetAxes(size, start.x, random);
  const crossStreets = streetAxes(size, start.y, random);
  const open = (x, y) => {
    if (x > 0 && x < size - 1 && y > 0 && y < size - 1) grid[y][x] = '.';
  };

  for (const x of avenues) {
    for (let y = 1; y < size - 1; y += 1) open(x, y);
  }
  for (const y of crossStreets) {
    for (let x = 1; x < size - 1; x += 1) open(x, y);
  }

  // Smaller lanes interrupt some large blocks without turning the plan into a dungeon.
  for (let column = 0; column < avenues.length - 1; column += 1) {
    for (let row = 0; row < crossStreets.length - 1; row += 1) {
      const left = avenues[column];
      const right = avenues[column + 1];
      const top = crossStreets[row];
      const bottom = crossStreets[row + 1];
      if (right - left < 4 || bottom - top < 4 || random() >= 0.48) continue;
      if (random() < 0.5) {
        const alleyY = top + 1 + Math.floor(random() * (bottom - top - 1));
        for (let x = left; x <= right; x += 1) open(x, alleyY);
      } else {
        const alleyX = left + 1 + Math.floor(random() * (right - left - 1));
        for (let y = top; y <= bottom; y += 1) open(alleyX, y);
      }
    }
  }

  // Every city begins at a recognisable civic square where two main roads meet.
  for (let y = start.y - 1; y <= start.y + 1; y += 1) {
    for (let x = start.x - 1; x <= start.x + 1; x += 1) open(x, y);
  }
  return grid;
}

function distancesFrom(grid, start) {
  const distances = new Map([[`${start.x},${start.y}`, 0]]);
  const queue = [start];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index];
    const distance = distances.get(`${current.x},${current.y}`);
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const x = current.x + dx;
      const y = current.y + dy;
      const key = `${x},${y}`;
      if (grid[y]?.[x] !== '.' || distances.has(key)) continue;
      distances.set(key, distance + 1);
      queue.push({ x, y });
    }
  }
  return distances;
}

function locationCandidates(grid, start, random) {
  const distances = distancesFrom(grid, start);
  return shuffled([...distances].map(([key, distance]) => {
    const [x, y] = key.split(',').map(Number);
    const exits = [[0, -1], [1, 0], [0, 1], [-1, 0]].filter(([dx, dy]) =>
      grid[y + dy]?.[x + dx] === '.').length;
    return { x, y, distance, exits };
  }).filter((cell) => cell.distance >= 5), random)
    .sort((first, second) => second.distance - first.distance || first.exits - second.exits);
}

function chooseLocations(candidates, count, occupied, minimumSpacing = 4) {
  const selected = [];
  for (const candidate of candidates) {
    if (selected.length >= count) break;
    if ([...occupied, ...selected].some((other) =>
      Math.abs(other.x - candidate.x) + Math.abs(other.y - candidate.y) < minimumSpacing)) continue;
    selected.push(candidate);
  }
  if (selected.length < count) {
    for (const candidate of candidates) {
      if (selected.length >= count) break;
      if (![...occupied, ...selected].some((other) =>
        other.x === candidate.x && other.y === candidate.y)) selected.push(candidate);
    }
  }
  return selected;
}

function streetPath(interior, start, target) {
  const originKey = `${start.x},${start.y}`;
  const targetKey = `${target.x},${target.y}`;
  const queue = [{ x: start.x, y: start.y }];
  const previous = new Map([[originKey, null]]);
  for (let index = 0; index < queue.length && !previous.has(targetKey); index += 1) {
    const current = queue[index];
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const next = { x: current.x + dx, y: current.y + dy };
      const nextKey = `${next.x},${next.y}`;
      if (!isWalkable(interior, next.x, next.y) || previous.has(nextKey)) continue;
      previous.set(nextKey, current);
      queue.push(next);
    }
  }
  if (!previous.has(targetKey)) return [];
  const path = [];
  let cursor = { x: target.x, y: target.y };
  while (`${cursor.x},${cursor.y}` !== originKey) {
    path.push(cursor);
    cursor = previous.get(`${cursor.x},${cursor.y}`);
  }
  return path.reverse();
}

export function generateCityStreetActors(interior, context) {
  const random = seededRandom(hashSeed('city-street-actors', CITY_EXPLORATION_VERSION,
    context.cityId, context.mapSlug ?? 'unknown'));
  const distances = distancesFrom(interior.rows.map((row) => [...row]), interior.start);
  const occupied = new Set([
    `${interior.start.x},${interior.start.y}`,
    ...interior.points.map((point) => `${point.x},${point.y}`),
    ...interior.signs.map((sign) => `${sign.x},${sign.y}`),
    ...interior.scraps.map((scrap) => `${scrap.x},${scrap.y}`),
    ...(interior.powerUps ?? []).map((powerUp) => `${powerUp.x},${powerUp.y}`)
  ]);
  const candidates = shuffled([...distances].map(([coordinate, distance]) => {
    const [x, y] = coordinate.split(',').map(Number);
    return { x, y, distance };
  }).filter((cell) => cell.distance >= 7 && !occupied.has(`${cell.x},${cell.y}`)), random);
  if (candidates.length < CITY_STREET_DWARVES.length + CITY_STREET_DEAD.length) return [];
  const locations = candidates.slice(0, CITY_STREET_DWARVES.length + CITY_STREET_DEAD.length);
  const dwarves = CITY_STREET_DWARVES.map((dwarf, index) => ({
    id: `dwarf-${dwarf.rarity}`, kind: 'dwarf', ...dwarf,
    x: locations[index].x, y: locations[index].y,
    originX: locations[index].x, originY: locations[index].y,
    state: 'roaming', cooldownUntilStep: 0
  }));
  const dead = CITY_STREET_DEAD.map((creature, index) => {
    const location = locations[CITY_STREET_DWARVES.length + index];
    return {
      id: `dead-${index + 1}`, kind: 'dead', ...creature,
      x: location.x, y: location.y, originX: location.x, originY: location.y,
      state: 'roaming', cooldownUntilStep: 0
    };
  });
  return [...dwarves, ...dead];
}

export function advanceCityStreetActors(interior, streetActors, step) {
  const actors = streetActors.map((actor) => ({ ...actor }));
  const movements = [];
  const escapes = [];
  for (const actor of actors) {
    const from = { x: Number(actor.x), y: Number(actor.y) };
    if (actor.state === 'gone') {
      if (Number(actor.goneUntilStep ?? Infinity) > step) {
        movements.push({ actorId: actor.id, from, to: from });
        continue;
      }
      actor.state = 'roaming';
      actor.x = Number(actor.originX);
      actor.y = Number(actor.originY);
      delete actor.targetKey;
      delete actor.goneUntilStep;
    }
    if (!isWalkable(interior, actor.x, actor.y)) {
      actor.x = interior.start.x;
      actor.y = interior.start.y;
    }
    if (actor.state === 'fleeing') {
      const target = interior.points.find((point) => point.key === actor.targetKey);
      const route = target ? streetPath(interior, actor, target) : [];
      if (route.length) {
        actor.x = route[0].x;
        actor.y = route[0].y;
      }
      if (!target || (actor.x === target.x && actor.y === target.y)) {
        const targetLabel = target?.label ?? 'transport yard';
        actor.state = 'gone';
        actor.goneUntilStep = step + 24;
        escapes.push({ actor: { ...actor }, targetLabel });
      }
    } else if (actor.kind !== 'dead' || step % 2 === 0) {
      const neighbours = [[0, -1], [1, 0], [0, 1], [-1, 0]]
        .map(([dx, dy]) => ({ x: actor.x + dx, y: actor.y + dy }))
        .filter((cell) => isWalkable(interior, cell.x, cell.y));
      if (neighbours.length) {
        const random = seededRandom(hashSeed('city-street-step', actor.id, step,
          actor.x, actor.y, interior.version));
        const next = neighbours[Math.floor(random() * neighbours.length)];
        actor.x = next.x;
        actor.y = next.y;
      }
    }
    movements.push({ actorId: actor.id, from, to: { x: actor.x, y: actor.y } });
  }
  return { actors, movements, escapes };
}

function pointDefinitions(context) {
  const routeTypes = new Set(context.routeTypes ?? []);
  const landmark = cityLandmark(context);
  const points = [
    { key: 'mines', label: 'Mine workings', shortLabel: 'Mines', glyph: 'M', href: '/',
      description: `Visit and manage mines based in ${context.cityName}.` },
    { key: 'mine-shop', label: 'Mine Shop', shortLabel: 'Mine shop', glyph: 'S', href: '/market',
      description: 'Buy or rent one of the mine types offered by this city.' },
    { key: 'vehicle-yard', label: 'Vehicle departure area', shortLabel: 'Departure', glyph: 'V', href: '/explore/departures',
      description: 'Fit cargo, choose a route, and send a transport out of the city.' }
  ];
  if (context.hasMarket) points.push({
    key: 'market', label: 'Local market', shortLabel: 'Market', glyph: '$', href: '/exchange',
    description: 'Trade things with miners using this city’s order books.'
  });
  if (routeTypes.has(1)) points.push({
    key: 'harbour', label: 'Harbour', shortLabel: 'Harbour', glyph: 'H', href: '/explore/harbour',
    description: 'Reach the quays, armed ships, cargo holds, and open sea routes.'
  });
  if (routeTypes.has(2)) points.push({
    key: 'airfield', label: 'Airfield', shortLabel: 'Airfield', glyph: 'A', href: '/explore/airfield',
    description: 'Reach aircraft, regional flights, and the search, bombing, and recovery sorties against the ore thieves.'
  });
  if (context.hasOilField) points.push({
    key: 'oil-field', label: 'Oil Field gate', shortLabel: 'Oil field', glyph: 'O', href: '/oil-field',
    description: 'Enter the regional machine grid and operate the field.'
  });
  if (context.isCapital) points.push(
    { key: 'factory-quarter', label: 'Factory quarter', shortLabel: 'Factories', glyph: 'F', href: '/factories',
      description: 'Build, repair, manufacture, and organise the regional workforce.' },
    { key: 'mill-yard', label: 'Mill yard', shortLabel: 'Mills', glyph: 'W', href: '/mills',
      description: 'Build mills and reinforce vehicles with worked Wood.' },
    { key: 'casino', label: 'Casino', shortLabel: 'Casino', glyph: 'C', href: '/casino',
      description: 'Find the Thing-O-Matic and the city’s newer machines.' }
  );
  if (context.hasPlayerHome) points.push({
    key: 'player-home', label: 'Your home', shortLabel: 'home', glyph: '⌂',
    href: '/explore/home',
    description: `Your Council-standard dwelling and local storage in ${context.cityName}.`
  });
  points.push({
    key: 'dwarf-park', label: `${context.cityName} Young Dwarves’ Park`,
    shortLabel: 'park', glyph: '♣', href: '/explore/park',
    description: 'A pocket of grass, climbing frames, and young Dwarves inventing games with no agreed rules.'
  });
  points.push({
    key: 'city-landmark', label: landmark.name, shortLabel: 'landmark', glyph: '◆',
    href: '/explore/landmark', description: landmark.description
  });
  points.push({
    key: 'bar', label: 'The Bar', shortLabel: 'bar', glyph: 'B', href: '/explore/bar',
    description: `Meet and talk only with the miners currently inside ${context.cityName}’s bar.`
  });
  return points;
}

export function generateCityInterior(context) {
  const cityId = Number(context?.cityId);
  if (!Number.isSafeInteger(cityId) || cityId < 1) throw new Error('Invalid exploration city.');
  const size = CITY_MAZE_SIZE;
  const start = { x: Math.floor(size / 2), y: Math.floor(size / 2) };
  const random = seededRandom(hashSeed('city-interior', CITY_EXPLORATION_VERSION,
    cityId, context.mapSlug ?? 'unknown'));
  const grid = cityStreetGrid(size, start, random);

  const candidates = locationCandidates(grid, start, random);
  const definitions = pointDefinitions(context);
  const pointLocations = chooseLocations(candidates, definitions.length, [start]);
  const points = definitions.map((point, index) => ({ ...point, ...pointLocations[index] }));
  const loreContext = { cityName: context.cityName, mapName: context.mapName };
  const lore = [
    ...(REGION_LORE[context.mapSlug] ?? []),
    ...COMMON_LORE.map((entry) => entry(loreContext)),
    ...(context.mineTypeNames ?? []).slice(0, 3).map((name) =>
      `${name} miners maintain these passages. They accept no responsibility for discoveries made above ground.`)
  ];
  const signCount = Math.min(8, lore.length);
  const signLocations = chooseLocations(candidates, signCount, [start, ...pointLocations], 3);
  const signs = shuffled(lore, random).slice(0, signLocations.length).map((text, index) => ({
    key: `sign-${index + 1}`, title: `${context.cityName} notice ${index + 1}`,
    text, x: signLocations[index].x, y: signLocations[index].y
  }));
  const powerUpLocations = chooseLocations(
    candidates, CITY_POWER_UP_COUNT, [start, ...pointLocations, ...signLocations], 7
  );
  const powerUps = powerUpLocations.map((location, index) => ({
    key: `power-up-${index + 1}`, label: 'Charged Ore core', x: location.x, y: location.y
  }));
  const streetCells = shuffled([...distancesFrom(grid, start)].map(([coordinate, distance]) => {
    const [x, y] = coordinate.split(',').map(Number);
    return { x, y, distance };
  }).filter((cell) => cell.distance > 0), random);
  const scrapLocations = chooseLocations(streetCells, CITY_ORE_SCRAP_COUNT,
    [start, ...pointLocations, ...signLocations, ...powerUpLocations], 1);
  const scraps = scrapLocations.map((location, index) => ({
    key: `ore-scrap-${index + 1}`, quantity: 1, x: location.x, y: location.y
  }));
  return {
    version: CITY_EXPLORATION_VERSION,
    size, start, rows: grid.map((row) => row.join('')), points, signs, scraps, powerUps,
    appearance: cityAppearance(context)
  };
}

export function isWalkable(interior, x, y) {
  return Number.isInteger(x) && Number.isInteger(y) && interior.rows[y]?.[x] === '.';
}

export function rollCityEncounter(random = Math.random) {
  const roll = Number(random());
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new Error('Invalid encounter roll.');
  const encounter = ENCOUNTERS[Math.floor(roll * ENCOUNTERS.length)];
  return {
    key: encounter.key, title: encounter.title, text: encounter.text,
    options: encounter.options.map((option) => ({ ...option }))
  };
}

export function resolveCityEncounter(encounterKey, choiceId, random = Math.random) {
  const encounter = ENCOUNTERS.find((candidate) => candidate.key === encounterKey);
  if (!encounter) throw new Error('That street encounter no longer exists.');
  const choice = encounter.options.find((candidate) => candidate.id === choiceId);
  if (!choice) throw new Error('Choose one of the available responses.');
  const roll = Number(random());
  if (!Number.isFinite(roll) || roll < 0 || roll >= 1) throw new Error('Invalid encounter roll.');
  return { choiceId: choice.id, choiceLabel: choice.label, ...encounter.resolve(choice.id, roll) };
}
