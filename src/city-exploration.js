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

const REGION_ARCHITECTURE = Object.freeze({
  aso: Object.freeze({
    style: 'Aso volcanic-industrial classicism',
    material: 'mirror-black basalt, firebrick, and riveted copper-black iron',
    ornament: 'sunbursts cut through with oil-pipe geometry',
    details: Object.freeze(['derrick cross-bracing', 'pressure dials', 'ash gutters',
      'riveted inspection hatches'])
  }),
  bromo: Object.freeze({
    style: 'Bromo ash-and-mycelium expressionism',
    material: 'porous pumice, smoke-fired brick, and laminated mushroom timber',
    ornament: 'gilled arches, spore rosettes, and lantern niches',
    details: Object.freeze(['mushroom-cap corbels', 'spore lanterns', 'deep ash eaves',
      'woven vent screens'])
  }),
  calbuco: Object.freeze({
    style: 'Calbuco rainwork monumentalism',
    material: 'storm-dark timber, blue copper, river stone, and glazed cobalt tile',
    ornament: 'watercourses traced as branching leaves and hammer marks',
    details: Object.freeze(['exposed timber trusses', 'rain chains', 'copper gutters',
      'stepped water stairs'])
  }),
  dempo: Object.freeze({
    style: 'Dempo thermal mountain architecture',
    material: 'columnar basalt, pale ice glass, and heat-blued steel',
    ornament: 'snow lines interrupted by glowing furnace seams',
    details: Object.freeze(['snow-shedding buttresses', 'thermal flues', 'ice-glass screens',
      'basalt stair plinths'])
  }),
  ebeko: Object.freeze({
    style: 'Ebeko polar relay modernism',
    material: 'frosted glass, insulated brass, dark cedar, and enamelled steel',
    ornament: 'signal bars, aurora chevrons, and repeating circuit knots',
    details: Object.freeze(['insulated relay housings', 'steam-return pipes',
      'frosted observation panes', 'signal vanes'])
  }),
  fogo: Object.freeze({
    style: 'Fogo Atlantic volcanic baroque',
    material: 'red scoria, smoke-grey render, relic bronze, and salt-white stone',
    ornament: 'flame finials, wave scrolls, and empty reliquary frames',
    details: Object.freeze(['lava-cooling vents', 'relic niches', 'ash screens',
      'ocean-facing buttresses'])
  }),
  gallego: Object.freeze({
    style: 'Gallego tidal cosmopolitan masonry',
    material: 'honey limestone, coral concrete, dark teak, and turquoise ceramic',
    ornament: 'tide calendars, star courses, and interlocking canal lines',
    details: Object.freeze(['coral latticework', 'tide clocks', 'canal arches',
      'inlaid route stars'])
  })
});

function landmarkDefinition(kind, name, form, silhouette, symmetry, storeys, bays, roof,
  setting, description, details) {
  return Object.freeze({
    kind, name, form, silhouette, symmetry, storeys, bays, roof, setting, description,
    details: Object.freeze(details)
  });
}

// These are authored civic works rather than interchangeable names assembled at runtime.
// The compact drafting data is consumed by the landmark renderer and is deliberately stable:
// city interiors are persisted, so changing it should never reshuffle streets or destinations.
const CITY_LANDMARKS = Object.freeze({
  Cinderwake: landmarkDefinition('spire', 'Cinderwake Derrick Basilica',
    'derrick-basilica', 'a cathedral nave shouldering a skeletal extraction tower', 'axial', 6, 7,
    'a saw-toothed copper roof around an open derrick crown', 'on a raised oil-dark civic apron',
    'A working derrick rises through a processional basilica, turning pipes, gantries, and pressure vessels into civic columns.',
    ['flying pipe buttresses', 'a crown of counterweighted walking beams', 'a glazed gauge rose', 'flare-stack pinnacles']),
  'Obsidian Quay': landmarkDefinition('arcade', 'Obsidian Quay Tideglass Customs Arcade',
    'customs-arcade', 'a long sea wall pierced by tall customs arches', 'axial', 3, 11,
    'a low lantern roof behind a crenellated parapet', 'built directly into the black quay wall',
    'Customs halls, tide gates, and a covered merchants\' walk form one precise waterfront facade reflected in the harbour.',
    ['eleven pointed inspection arches', 'tide-height rulers', 'suspended cargo scales', 'glass customs booths']),
  'Sulfur Crown': landmarkDefinition('rotunda', 'Sulfur Crown Fumarole Observatory',
    'fumarole-observatory', 'concentric terraces surrounding a vented copper dome', 'radial', 4, 12,
    'a split dome venting a permanent white plume', 'straddling the lip of a living fumarole',
    'A ring observatory turns volcanic breath through calibrated chambers before releasing it from a divided dome.',
    ['radial instrument galleries', 'twelve wind chimneys', 'sulfur crystal screens', 'external spiral stairs']),
  'Lahar Rest': landmarkDefinition('bridge', 'Lahar Rest Nine-Channel Hospice',
    'channel-hospice', 'an inhabited bridge carried across nine spillways', 'bilateral', 4, 9,
    'nine linked pitched roofs with deep rain eaves', 'spanning the old lahar diversion channels',
    'A fortified hospice bridges the flood works so travellers can shelter above the channels when the mountain begins to move.',
    ['nine masonry spillway arches', 'covered refuge balconies', 'flood-bell turrets', 'debris-deflecting cutwaters']),
  Blackglass: landmarkDefinition('tower', 'Blackglass Mirror-Basalt Hall',
    'mirror-basalt-hall', 'three offset monoliths framing a narrow atrium', 'asymmetric', 7, 5,
    'knife-edged terraces stepping toward the sea', 'set in a court of polished volcanic glass',
    'Three polished basalt slabs lean together without touching, enclosing a civic hall made bright by reflected sky.',
    ['mirror-cut wall planes', 'suspended council chamber', 'slit clerestories', 'black-glass reflecting pool']),

  Ashfall: landmarkDefinition('rotunda', 'Ashfall Spore Lantern Parliament',
    'spore-parliament', 'a broad gilled dome above a circular debating chamber', 'radial', 3, 16,
    'a layered cap roof ringed with breathing lanterns', 'within a sunken garden of pale fungus',
    'The parliamentary chamber is grown around a stone drum; its breathing roof filters ash and glows as debates run late.',
    ['sixteen gill ribs', 'bioluminescent voting lamps', 'spore-filter cupolas', 'root-bound public benches']),
  'Tengger Gate': landmarkDefinition('arch', 'Tengger Gate Twin-Caldera Gatehouse',
    'caldera-gatehouse', 'two hollow cones joined by a monumental road arch', 'bilateral', 5, 3,
    'paired crater roofs with smoking oculi', 'commanding the pass between ash ridges',
    'Paired gate towers imitate neighbouring volcanoes and hold the roadway beneath a bridge crowded with watch rooms.',
    ['crater oculi', 'layered pumice voussoirs', 'portcullis counterweights', 'ash-measuring staffs']),
  Sandsea: landmarkDefinition('arcade', 'Sandsea Wind-Carved Caravanserai',
    'wind-carved-caravanserai', 'a low square fortress enclosing a forest of shade vaults', 'quadrilateral', 2, 13,
    'four scooped wind towers above a flat court roof', 'half-buried in migrating grey dunes',
    'A caravan court turns abrasive winds through sculpted towers, cooling workshops and continually redrawing its exterior.',
    ['wind-scoop towers', 'thirteen shaded trade bays', 'sand-trap screens', 'mushroom-timber loading doors']),
  'Ember Market': landmarkDefinition('tower', 'Ember Market Hanging Kiln Exchange',
    'hanging-kiln-exchange', 'stacked market decks clustered around a furnace tower', 'asymmetric', 6, 8,
    'a crown of suspended bottle kilns', 'over a crowded intersection of covered lanes',
    'Kilns hang from an iron trading tower so their heat rises clear of the market while wares descend by chain lift.',
    ['suspended bottle kilns', 'external goods hoists', 'ticker-bell balconies', 'heat-shield awnings']),
  Craterwatch: landmarkDefinition('aqueduct', 'Craterwatch Ringwall Observatory',
    'ringwall-observatory', 'an open circular wall interrupted by three tall sighting piers', 'radial', 3, 18,
    'a narrow covered walk following the crater rim', 'wrapped around the highest inhabited crater',
    'An inhabited survey ring encircles the crater, aligning its piers with vents, stars, and roads that have not yet opened.',
    ['three meridian piers', 'eighteen observation bays', 'hinged sighting bridges', 'engraved eruption chronicle']),

  Stormcrag: landmarkDefinition('tower', 'Stormcrag Tempest Bell Citadel',
    'tempest-bell-citadel', 'a battered sea keep carrying an enormous open bell frame', 'axial', 7, 5,
    'a copper storm hood split around the bell', 'anchored to a cliff above the harbour',
    'A cliff citadel braces the harbour bell between rain towers, giving storms a structure large enough to play.',
    ['storm-chain flying buttresses', 'five weather balconies', 'lightning combs', 'a tide-driven bell wheel']),
  Llanquihue: landmarkDefinition('rotunda', 'Llanquihue Lake-Stair Conservatory',
    'lake-stair-conservatory', 'a glass drum descending in terraces into the lake', 'radial', 4, 10,
    'a shallow faceted glass dome', 'where garden terraces meet deep blue water',
    'A botanical rotunda steps below the waterline, joining rain gardens, public baths, and submerged viewing rooms.',
    ['ten radial winter gardens', 'submerged cobalt windows', 'overflow stair cascades', 'reed-filter colonnades']),
  'Ashen Harbor': landmarkDefinition('arcade', 'Ashen Harbor Drowned Foundry Loggia',
    'drowned-foundry-loggia', 'a roofless furnace hall standing on tidal arcades', 'axial', 3, 9,
    'an exposed truss roof carrying cranes instead of tiles', 'over the flooded remains of the first foundry',
    'The old foundry floor lies beneath the tide while its arcades, cranes, and furnace stacks continue as a public quay.',
    ['tidal casting pits', 'nine blue-copper arches', 'travelling roof cranes', 'water-cooled furnace stacks']),
  Rainforge: landmarkDefinition('bridge', 'Rainforge Cascade Hammerhall',
    'cascade-hammerhall', 'a stepped industrial hall bridging a vertical watercourse', 'axial', 5, 7,
    'descending copper roofs that channel rain to the forge', 'built across a natural cascade',
    'Water falls through seven hammer stages beneath a public hall whose roof, gutters, and machinery form one continuous section.',
    ['seven water hammers', 'open gear galleries', 'rain-chain colonnade', 'spray-cooled clerestory']),
  'Cobalt Ridge': landmarkDefinition('aqueduct', 'Cobalt Ridge Blue Ore Viaduct',
    'ore-viaduct', 'a tall procession of tapering arches carrying workshops', 'axial', 4, 14,
    'a serrated line of glazed cobalt workshops', 'following the knife edge of the ridge',
    'A mineral railway, water channel, and chain of narrow workshops share a viaduct visible from every approach.',
    ['fourteen tapering stone arches', 'ore-drop chutes', 'cobalt tile friezes', 'cantilevered survey platforms']),

  Emberdeep: landmarkDefinition('rotunda', 'Emberdeep Inverted Hearth Monastery',
    'inverted-hearth-monastery', 'a descending octagonal monastery around a glowing central shaft', 'radial', 6, 8,
    'a low snow roof surrounding an open thermal oculus', 'excavated into warm rock below the square',
    'Monastic galleries descend toward a communal hearth, exposing a complete architectural section from the street above.',
    ['eight descending cloisters', 'thermal prayer flues', 'hanging basalt stairs', 'an ice-rimmed central oculus']),
  'Sumatran Reach': landmarkDefinition('bridge', 'Sumatran Reach Cloudstep Audience Hall',
    'cloudstep-audience-hall', 'a long hall hopping between three mountain pinnacles', 'asymmetric', 4, 12,
    'three steep roofs linked by glass wind bridges', 'suspended above a permanent cloud deck',
    'Council chambers occupy three separate crags connected by enclosed bridges whose floors reveal the cloud below.',
    ['twelve wind-braced bays', 'glass-bottom bridges', 'pinnacle anchor chains', 'cloud-catching roof fins']),
  'Basalt Steps': landmarkDefinition('tower', 'Basalt Steps Thousand-Tread Ziggurat',
    'thousand-tread-ziggurat', 'a broad stepped mountain of civic chambers', 'axial', 9, 9,
    'a flat furnace court above nine receding terraces', 'rising from a field of natural basalt columns',
    'Natural columns and fitted masonry merge into a terraced civic mountain whose ramps measure exactly one thousand treads.',
    ['processional switchback ramps', 'columnar-basalt retaining walls', 'thermal rest chambers', 'a summit beacon court']),
  Cloudforest: landmarkDefinition('arcade', 'Cloudforest Canopy Archive',
    'canopy-archive', 'slender archive towers joined high above the forest floor', 'asymmetric', 8, 6,
    'leaf-thin roofs draining toward a central mist cistern', 'threaded through living cloudforest trunks',
    'Books and weather records occupy bridge rooms suspended between protected trees, leaving the forest floor unbroken.',
    ['tree-cradling collars', 'six high bridge stacks', 'mist-catching roof nets', 'counterweighted spiral lifts']),
  'Furnace Bay': landmarkDefinition('arch', 'Furnace Bay Thermal Drydock Cathedral',
    'thermal-drydock-cathedral', 'a pointed drydock nave enclosed by furnace towers', 'axial', 6, 7,
    'a ribbed retractable roof over the dock void', 'cut into the steaming edge of the bay',
    'A monumental drydock borrows cathedral proportions, using geothermal heat to dry hulls beneath retractable steel ribs.',
    ['seven ship-rib arches', 'paired furnace towers', 'floodgate rose window', 'steam-condensing gargoyles']),

  Frostmere: landmarkDefinition('tower', 'Frostmere Aurora Relay Palace',
    'aurora-relay-palace', 'a low palace pierced by a single luminous signal mast', 'axial', 5, 15,
    'a shallow insulated roof beneath an open relay crown', 'at the centre of a frozen signal court',
    'Public rooms wrap a relay mast whose glass fins translate auroral light into messages no operator admits sending.',
    ['fifteen enamelled signal bays', 'aurora-glass fins', 'heated public arcades', 'a brass waveguide crown']),
  'Kuril Haven': landmarkDefinition('aqueduct', 'Kuril Haven Steamglass Breakwater',
    'steamglass-breakwater', 'a curving inhabited wall of glass-faced caissons', 'curvilinear', 3, 12,
    'a continuous wave roof punctuated by steam chimneys', 'sweeping around the icebound harbour',
    'A civic breakwater contains baths, signal rooms, and heated arcades behind glass panels clouded by every arriving wave.',
    ['twelve wave caissons', 'heated lookout bays', 'ice-breaking cutwaters', 'condensation channels']),
  Snowmelt: landmarkDefinition('spire', 'Snowmelt Thawwater Clocktower',
    'thawwater-clocktower', 'a slender water clock stepped above public cisterns', 'axial', 8, 4,
    'a four-faced clock crown beneath a needle finial', 'where every meltwater channel converges',
    'Seasonal meltwater descends through visible gauges, driving a clock whose face changes scale between winter and spring.',
    ['glass water columns', 'four season dials', 'overflow chime bowls', 'heated maintenance galleries']),
  Steamward: landmarkDefinition('rotunda', 'Steamward Great Condenser Forum',
    'condenser-forum', 'a circular forum surrounded by rising condenser fins', 'radial', 4, 20,
    'an open ring roof crossed by steam pipes', 'above the junction of the district heating mains',
    'Twenty copper condenser towers make a civic forum from the region\'s exhaust, filling its centre with warm artificial rain.',
    ['twenty radial condenser fins', 'overhead steam manifold', 'rain-catching council benches', 'pressure-relief sculptures']),
  Northglass: landmarkDefinition('arch', 'Northglass Polar Prism Keep',
    'polar-prism-keep', 'a severe keep split by a full-height crystalline arch', 'bilateral', 7, 6,
    'two dark roof slabs framing a faceted prism', 'on the last ridge before the polar ice',
    'Twin cedar-and-steel towers hold a vast glass prism that bends the low sun through every occupied floor.',
    ['full-height prism arch', 'six heated bridge chambers', 'faceted solar screens', 'snow-cornice cutters']),

  Brimstone: landmarkDefinition('rotunda', 'Brimstone Cinder Archive Pantheon',
    'archive-pantheon', 'a heavy drum and coffered dome ringed by archive towers', 'radial', 5, 12,
    'a vented relic-bronze dome dusted in pale ash', 'at the head of the old processional road',
    'A domed archive stores objects in deep wall niches while its central floor records every eruption as a new inlaid ring.',
    ['twelve archive exedrae', 'coffered smoke vents', 'eruption-ring pavement', 'bronze catalogue doors']),
  Caldera: landmarkDefinition('bridge', 'Caldera Suspended Crater Amphitheatre',
    'crater-amphitheatre', 'crescent seating hung from cables inside a crater wall', 'radial', 7, 14,
    'a floating canvas corona above the open arena', 'suspended over an active caldera throat',
    'An amphitheatre hangs within the crater on immense chains, using the volcano itself as stage, orchestra, and warning system.',
    ['fourteen cable masts', 'chain-hung seating crescents', 'retractable ash canopy', 'seismic tuning forks']),
  Mosteiros: landmarkDefinition('arcade', 'Mosteiros Black Cloister of Returned Things',
    'relic-cloister', 'a square arcaded monastery crowded with mismatched chapels', 'quadrilateral', 3, 16,
    'steep tiled walks surrounding an open relic court', 'among old lava walls above the western shore',
    'Recovered structures from lost settlements form a cloister in which no two arches, columns, or doors quite agree.',
    ['sixteen mismatched arches', 'labelled relic niches', 'salvaged column capitals', 'a tide-polished central court']),
  Lavafields: landmarkDefinition('aqueduct', 'Lavafields Ember Aqueduct',
    'ember-aqueduct', 'a long double arcade carrying water above glowing lava cuts', 'axial', 3, 17,
    'an open maintenance walk lined with heat shields', 'crossing the fractured eastern lava plain',
    'Cold water and public footways share a monumental arcade whose lowest piers disappear into still-warm fissures.',
    ['seventeen heat-jointed arches', 'ceramic expansion rollers', 'glowing inspection wells', 'wave-scroll water spouts']),
  'Porto Cinza': landmarkDefinition('spire', 'Porto Cinza Ash-Sail Harbour Tower',
    'ash-sail-harbour-tower', 'a harbour tower wrapped by three rigid sail planes', 'asymmetric', 9, 5,
    'three bronze sail roofs turning around a signal lantern', 'on the outermost ash-grey mole',
    'Rigid metal sails wrap a harbour tower, sheltering signal rooms while presenting a different profile to every vessel.',
    ['three riveted sail planes', 'five harbour clocks', 'external lantern stair', 'salt-catching relief panels']),

  "Tzolk'in": landmarkDefinition('bridge', "Tzolk'in Calendar Causeway",
    'calendar-causeway', 'a stepped ceremonial bridge punctuated by calendar towers', 'axial', 5, 13,
    'flat observatory roofs aligned to seasonal sunrise', 'crossing the capital lagoon on massive piers',
    'A civic causeway doubles as a calendar: thirteen towers, tidal stairs, and shadow lines mark every permitted departure.',
    ['thirteen calendar towers', 'tide-cut staircases', 'obsidian shadow rails', 'turquoise route mosaics']),
  Burgundy: landmarkDefinition('tower', 'Burgundy Vine-Gear Hotel de Ville',
    'vine-gear-town-hall', 'a many-gabled town hall clustered around an open clock cage', 'axial', 6, 9,
    'steep slate gables climbing toward a wrought gear crown', 'fronting a narrow canal square',
    'A mercantile town hall binds stone gables, timber galleries, and a giant exposed civic clock with curling metal vines.',
    ['nine carved merchant bays', 'open escapement clock', 'vine-scroll iron balconies', 'canal-side loading arcade']),
  Kemet: landmarkDefinition('arch', 'Kemet Solar Pylon Library',
    'solar-pylon-library', 'two battered pylons framing a narrow sunlit court', 'bilateral', 5, 10,
    'flat reading terraces beneath a suspended sun disc', 'aligned with the longest canal in the city',
    'Paired archive pylons focus noon light into an open reading court, illuminating one route tablet at a time.',
    ['ten recessed archive bays', 'suspended bronze sun disc', 'lotus-form ventilation grilles', 'star-chart parapets']),
  Belfort: landmarkDefinition('spire', 'Belfort Route-Keeper Belfry',
    'route-keeper-belfry', 'a fortified civic block rising to a perforated bell tower', 'axial', 8, 6,
    'a steep pyramidal cap above an open timber bell cage', 'where three old roads meet the canal wall',
    'An armoury-like belfry holds route bells of different metals, each sounded by a mechanism connected to a city gate.',
    ['six route bell chambers', 'lion-headed counterweights', 'gate-linked rodwork', 'machicolated public gallery']),
  'San Juan': landmarkDefinition('arcade', 'San Juan Coral Fort of Seven Tides',
    'coral-tide-fort', 'a star fort softened by deep arcades and tidal gardens', 'radial', 4, 7,
    'seven low bastion roofs around a central lantern court', 'occupying a reef at the harbour entrance',
    'A seven-pointed sea fort opens its lower arcades to each tide, filling defensive courts with gardens, fish, and reflected light.',
    ['seven tide bastions', 'coral-concrete casemates', 'floodable garden courts', 'a teak signal lantern'])
});

const FALLBACK_LANDMARKS = Object.freeze([
  Object.freeze({ kind: 'spire', form: 'needle-spire', noun: 'Survey Spire' }),
  Object.freeze({ kind: 'arch', form: 'civic-arch', noun: 'Council Arch' }),
  Object.freeze({ kind: 'rotunda', form: 'civic-rotunda', noun: 'Assembly Rotunda' }),
  Object.freeze({ kind: 'bridge', form: 'inhabited-bridge', noun: 'High Bridge' }),
  Object.freeze({ kind: 'tower', form: 'civic-tower', noun: 'Route Tower' }),
  Object.freeze({ kind: 'arcade', form: 'civic-arcade', noun: 'Public Arcade' }),
  Object.freeze({ kind: 'aqueduct', form: 'civic-aqueduct', noun: 'Light Aqueduct' })
]);

function cityLandmark(context) {
  const cityId = Math.max(1, Number(context.cityId) || 1);
  const regional = REGION_ARCHITECTURE[context.mapSlug] ?? REGION_ARCHITECTURE.aso;
  const authored = Object.hasOwn(CITY_LANDMARKS, context.cityName)
    ? CITY_LANDMARKS[context.cityName] : null;
  const fallback = FALLBACK_LANDMARKS[(cityId - 1) % FALLBACK_LANDMARKS.length];
  const landmark = authored ?? {
    ...fallback, name: `${context.cityName} ${fallback.noun}`,
    silhouette: 'a carefully proportioned public monument above the surrounding roofs',
    symmetry: 'axial', storeys: 4, bays: 7, roof: 'a deeply modelled civic roof',
    setting: 'at the meeting of the city\'s oldest streets',
    description: 'A singular public work assembled from regional craft and recovered Council plans.',
    details: ['survey marks', 'public stairs', 'deep window reveals', 'a route marker crown']
  };
  return {
    kind: landmark.kind,
    name: landmark.name,
    material: regional.material,
    description: `${landmark.description} It is built from ${regional.material}, with ${regional.ornament}.`,
    form: landmark.form,
    style: regional.style,
    silhouette: landmark.silhouette,
    symmetry: landmark.symmetry,
    storeys: landmark.storeys,
    bays: landmark.bays,
    roof: landmark.roof,
    setting: landmark.setting,
    ornament: regional.ornament,
    details: [...regional.details, ...landmark.details],
    detailSeed: hashSeed('city-landmark-detail', context.mapSlug ?? 'aso', cityId,
      context.cityName ?? 'Unknown')
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
    description: 'A pocket of grass where young Dwarves practise biting, pickpocketing, ambushes, and games with no agreed rules.'
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
