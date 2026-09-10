import crypto from 'node:crypto';

export const COUNCIL_REPUTATION_MAX_GRADE = 64;
export const COUNCIL_MISSION_OFFER_COUNT = 4;
export const COUNCIL_MISSION_ACTIVE_LIMIT = 2;
export const COUNCIL_MISSION_RECENT_TEMPLATE_WINDOW = 20;
export const COUNCIL_MISSION_OFFER_LIFETIME_MS = 48 * 60 * 60 * 1000;

const TITLE_BANDS = Object.freeze([
  Object.freeze([
    'Person on File', 'Provisionally Noted Person', 'Noted Person, Acting',
    'Registered Nuisance', 'Registered Nuisance Second Class',
    'Registered Nuisance First Class', 'Senior Registered Nuisance',
    'Registered Nuisance, Confirmed'
  ]),
  Object.freeze([
    'Assistant Supervised Asset', 'Deputy Assistant Supervised Asset',
    'Supervised Asset, Temporary', 'Supervised Asset', 'Useful Offender, Acting',
    'Useful Offender', 'Useful Offender with Filing Privileges',
    'Senior Useful Offender'
  ]),
  Object.freeze([
    'Auxiliary Civic Burden', 'Deputy Civic Burden', 'Principal Deputy Civic Burden',
    'Civic Burden in Good Standing', 'Assistant Source of Modest Value',
    'Source of Modest Value', 'Senior Source of Modest Value',
    'Source of Modest Value, Recorded'
  ]),
  Object.freeze([
    'Associate Person of Conditional Merit',
    'Senior Associate Person of Conditional Merit',
    'Acting Person of Conditional Merit', 'Person of Conditional Merit',
    'Person of Conditional Merit, Second Schedule',
    'Person of Conditional Merit, First Schedule',
    'Principal Person of Conditional Merit', 'Merit Holder, Provisional'
  ]),
  Object.freeze([
    'Assistant to the Regional Subcommittee',
    'Deputy Assistant to the Regional Subcommittee',
    'Regional Subcommittee Liaison, Acting', 'Regional Subcommittee Liaison',
    'Regional Subcommittee Adjacent Person',
    'Senior Regional Subcommittee Adjacent Person',
    'Principal Regional Subcommittee Adjacent Person',
    'Regional Subcommittee Burden, Decorated'
  ]),
  Object.freeze([
    'Council-Adjacent Person, Temporary', 'Council-Adjacent Person',
    'Deputy Council-Adjacent Person', 'Senior Deputy Council-Adjacent Person',
    'Assistant Adjacent Councillor', 'Deputy Adjacent Councillor',
    'Deputy Adjacent Councillor, Without Voting Rights',
    'Principal Non-Voting Adjacent Councillor'
  ]),
  Object.freeze([
    'Administrative Burden, Acting', 'Administrative Burden',
    'Dependable Administrative Burden', 'Senior Administrative Burden',
    'Exemplary Administrative Burden, Probationary',
    'Acting Exemplary Administrative Burden', 'Exemplary Administrative Burden',
    'Exemplary Administrative Burden, Confirmed'
  ]),
  Object.freeze([
    'Holder of the Council\'s Attention', 'Bearer of the Beige Obligation',
    'Senior Bearer of the Beige Obligation', 'Keeper of the Duplicate Form',
    'Principal Keeper of the Duplicate Form', 'Decorated Source of Paperwork',
    'Most Decorated Source of Paperwork',
    'Most Exemplary Administrative Burden'
  ])
]);

export const COUNCIL_TITLES = Object.freeze([
  'Unprocessed Individual', ...TITLE_BANDS.flat()
]);

export const COUNCIL_BADGES = Object.freeze([
  Object.freeze({
    key: 'pending-tab', name: 'Bent Identity Tab', mark: 'PENDING',
    description: 'A dented grey tab with an adhesive stain and no straight edges.'
  }),
  Object.freeze({
    key: 'beige-square', name: 'Beige Enamel Square', mark: 'NOTED',
    description: 'A beige square whose enamel has pooled noticeably in one corner.'
  }),
  Object.freeze({
    key: 'brown-cog', name: 'Brown Cog of Usefulness', mark: 'USEFUL',
    description: 'A brown cog stamped USEFUL at an angle that suggests uncertainty.'
  }),
  Object.freeze({
    key: 'mustard-rosette', name: 'Mustard Rosette', mark: 'MERIT?',
    description: 'A mustard rosette with two damp, unequal ribbons.'
  }),
  Object.freeze({
    key: 'sludge-seal', name: 'Sludge-Green Double Seal', mark: 'FILED',
    description: 'Two sludge-green seals attached to the same unnecessary backing plate.'
  }),
  Object.freeze({
    key: 'maroon-medallion', name: 'Maroon Adjacent Medallion', mark: 'NEARLY',
    description: 'A heavy maroon disc signifying proximity to somebody important.'
  }),
  Object.freeze({
    key: 'pewter-obligation', name: 'Pewter Obligation', mark: 'BURDEN',
    description: 'A pewter plaque suspended from regulation brown webbing.'
  }),
  Object.freeze({
    key: 'pigeon-sunburst', name: 'Great Pigeon Sunburst', mark: 'EXEMPLARY',
    description: 'An oversized sunburst bearing a disappointed pigeon and three redundant seals.'
  })
]);

const BADGE_GRADE_THRESHOLDS = Object.freeze([0, 9, 17, 25, 33, 41, 49, 64]);

export function councilRankFor(reputationValue = 0, enrolled = false) {
  const reputation = Math.max(0, Math.floor(Number(reputationValue) || 0));
  const grade = Math.min(COUNCIL_REPUTATION_MAX_GRADE, Math.floor(Math.sqrt(reputation)));
  const nextGrade = grade >= COUNCIL_REPUTATION_MAX_GRADE ? null : grade + 1;
  let badgeTier = 0;
  for (let index = 0; index < BADGE_GRADE_THRESHOLDS.length; index += 1) {
    if (grade >= BADGE_GRADE_THRESHOLDS[index]) badgeTier = index;
  }
  return Object.freeze({
    enrolled: Boolean(enrolled), reputation, grade,
    title: COUNCIL_TITLES[grade],
    nextTitle: nextGrade === null ? null : COUNCIL_TITLES[nextGrade],
    nextReputation: nextGrade === null ? null : nextGrade ** 2,
    badgeTier, badge: COUNCIL_BADGES[badgeTier],
    final: grade === COUNCIL_REPUTATION_MAX_GRADE
  });
}

export const COUNCIL_MISSION_DIFFICULTIES = Object.freeze({
  // One refined Ore consumes 1,000 scraps and is worth at least 8g. These
  // awards keep scraps as the majority of value without quietly paying tens of Gold.
  petty: Object.freeze({ key: 'petty', label: 'Petty order', scraps: 20,
    goldUnits: 200, reputation: 1, activeLifetimeMs: 2 * 24 * 60 * 60 * 1000 }),
  routine: Object.freeze({ key: 'routine', label: 'Routine order', scraps: 50,
    goldUnits: 800, reputation: 2, activeLifetimeMs: 3 * 24 * 60 * 60 * 1000 }),
  serious: Object.freeze({ key: 'serious', label: 'Serious order', scraps: 100,
    goldUnits: 2500, reputation: 3, activeLifetimeMs: 5 * 24 * 60 * 60 * 1000 }),
  hazard: Object.freeze({ key: 'hazard', label: 'Hazard order', scraps: 200,
    goldUnits: 7500, reputation: 5, activeLifetimeMs: 7 * 24 * 60 * 60 * 1000 }),
  directive: Object.freeze({ key: 'directive', label: 'Regional directive', scraps: 400,
    goldUnits: 9500, reputation: 8, activeLifetimeMs: 10 * 24 * 60 * 60 * 1000 })
});

export function stableCouncilNumber(seed, label, maximum) {
  if (!Number.isSafeInteger(maximum) || maximum < 1) throw new Error('Invalid Council range.');
  const digest = crypto.createHash('sha256').update(`${seed}\u0000${label}`).digest();
  return digest.readUInt32BE(0) % maximum;
}

export function councilOfferCycle(timestamp = Date.now()) {
  return new Date(Number(timestamp)).toISOString().slice(0, 10);
}

function amount(seed, label, minimum, maximum) {
  return minimum + stableCouncilNumber(seed, label, maximum - minimum + 1);
}

function localFilter(context) {
  return { cityId: Number(context.cityId) };
}

function simpleTemplate(definition) {
  return Object.freeze({ ...definition, prepare: (context, seed) => {
    const targetQuantity = typeof definition.target === 'function'
      ? definition.target(seed) : Number(definition.target ?? 1);
    return {
      title: typeof definition.title === 'function'
        ? definition.title(context, seed) : definition.title,
      briefing: typeof definition.briefing === 'function'
        ? definition.briefing(context, targetQuantity, seed) : definition.briefing,
      targetQuantity,
      details: {
        actionPath: definition.actionPath,
        filter: definition.local === false ? {} : localFilter(context)
      }
    };
  } });
}

export const COUNCIL_MISSION_TEMPLATES = Object.freeze([
  simpleTemplate({ key: 'recycle-things', family: 'recycling', eligibility: 'hasRecyclable',
    department: 'Office of Strategic Clutter', objectiveKey: 'recycle', difficulty: 'routine',
    title: 'Reduction of Unauthorised Objects', target: (seed) => amount(seed, 'target', 3, 8),
    briefing: (context, target) => `Recycle ${target} Things in ${context.cityName}. Their previous usefulness has been revoked.`,
    actionPath: '/inventory' }),
  simpleTemplate({ key: 'refine-ore', family: 'recycling', eligibility: 'hasRefinableScraps',
    department: 'Mineral Reconstitution Desk', objectiveKey: 'refine_ore', difficulty: 'serious',
    title: 'Mandatory Reassembly of Dust', target: (seed) => amount(seed, 'target', 1, 3),
    briefing: (context, target) => `Refine ${target} Ore from local scraps in ${context.cityName}.`,
    actionPath: '/inventory' }),
  simpleTemplate({ key: 'read-notices', family: 'cartography', eligibility: 'always',
    department: 'Office of Public Notice Awareness', objectiveKey: 'explore_sign', difficulty: 'petty',
    title: 'Evidence of Having Read the Evidence', target: (seed) => amount(seed, 'target', 1, 3),
    briefing: (context, target) => `Read ${target} previously unread Council notice${target === 1 ? '' : 's'} while exploring ${context.cityName}.`,
    actionPath: '/explore' }),
  simpleTemplate({ key: 'collect-street-scraps', family: 'cartography', eligibility: 'always',
    department: 'Pavement Mineral Recovery Unit', objectiveKey: 'explore_scrap', difficulty: 'routine',
    title: 'Loose Ore Is a Trip Hazard', target: (seed) => amount(seed, 'target', 4, 10),
    briefing: (context, target) => `Recover ${target} Street Ore scraps from ${context.cityName}.`,
    actionPath: '/explore' }),
  simpleTemplate({ key: 'inspect-locations', family: 'cartography', eligibility: 'always',
    department: 'Approximate Distances Committee', objectiveKey: 'explore_location', difficulty: 'routine',
    title: 'Inspection of Places Alleged to Exist', target: (seed) => amount(seed, 'target', 1, 3),
    briefing: (context, target) => `Visit ${target} previously unrecorded marked location${target === 1 ? '' : 's'} in ${context.cityName}.`,
    actionPath: '/explore' }),
  simpleTemplate({ key: 'walk-streets', family: 'civic-footwork', eligibility: 'always',
    department: 'Municipal Perambulation Directorate', objectiveKey: 'explore_step',
    difficulty: 'directive', title: 'Grand Pavement Usage Audit',
    target: (seed) => amount(seed, 'target', 24, 40),
    briefing: (context, target) => `Walk ${target} street sections in ${context.cityName}. Repeated use of the same pavement remains administratively valid.`,
    actionPath: '/explore' }),
  simpleTemplate({ key: 'reprioritise-mine', family: 'mining', eligibility: 'hasMine',
    department: 'Excavation Order Alignment Board', objectiveKey: 'mine_priority', difficulty: 'petty',
    title: 'Correction of Underground Priorities', target: 1,
    briefing: (context) => `Change which mine receives top priority in ${context.cityName}. The previous ordering has become unfashionable.`,
    actionPath: '/' }),
  simpleTemplate({ key: 'oil-mine', family: 'mining', eligibility: 'hasMineOil',
    department: 'Department of Productive Lubrication', objectiveKey: 'mine_oil', difficulty: 'routine',
    title: 'Compulsory Reduction of Squeaking', target: 1,
    briefing: (context) => `Oil a miner bot in ${context.cityName}. Silence will be taken as compliance.`,
    actionPath: '/' }),
  simpleTemplate({ key: 'equip-mine', family: 'mining', eligibility: 'hasMineEquipment',
    department: 'Personal Excavation Standards Office', objectiveKey: 'mine_equip', difficulty: 'routine',
    title: 'Demonstration of Approved Equipment', target: 1,
    briefing: (context) => `Fit one piece of equipment to an active mine in ${context.cityName}.`,
    actionPath: '/' }),
  simpleTemplate({ key: 'detonate-mine', family: 'mining', eligibility: 'hasExplosives',
    department: 'Department of Productive Damage', objectiveKey: 'mine_detonate', difficulty: 'serious',
    title: 'Subterranean Noise Compliance Trial', target: (seed) => amount(seed, 'target', 1, 3),
    briefing: (context, target) => `Consume ${target} explosive${target === 1 ? '' : 's'} in the mines of ${context.cityName}.`,
    actionPath: '/' }),
  simpleTemplate({ key: 'display-thing', family: 'domestic', eligibility: 'hasDisplayCandidate',
    department: 'Domestic Standards Inspectorate', objectiveKey: 'home_display', difficulty: 'petty',
    title: 'Proof of Taste, However Doubtful', target: 1,
    briefing: () => 'Place a Thing on a display plinth in one of your Council-standard dwellings.',
    actionPath: '/explore/home', local: false }),
  simpleTemplate({ key: 'create-meld', family: 'metallurgy', eligibility: 'hasMeldOpportunity',
    department: 'Office of Permanent Combinations', objectiveKey: 'meld_create', difficulty: 'serious',
    title: 'Irreversible Administrative Combination', target: 1,
    briefing: () => 'Complete one Meld. The Council accepts no responsibility for permanence.',
    actionPath: '/melds', local: false }),
  simpleTemplate({ key: 'activate-gadget', family: 'administration', eligibility: 'hasGadgetActivator',
    department: 'Temporary Advantages Licensing Desk', objectiveKey: 'gadget_activate', difficulty: 'routine',
    title: 'Activation of a Licensed Impropriety', target: 1,
    briefing: () => 'Activate one Gadget. Its expiration has already been scheduled.',
    actionPath: '/gadgets', local: false }),
  simpleTemplate({ key: 'start-factory-work', family: 'industry', eligibility: 'hasFactory',
    department: 'Emergency Manufacturing Board', objectiveKey: 'factory_start', difficulty: 'serious',
    title: 'Evidence of Useful Employment', target: 1,
    briefing: (context) => `Start or queue one manufacturing or repair job in ${context.cityName}.`,
    actionPath: '/factories' }),
  simpleTemplate({ key: 'hire-worker', family: 'industry', eligibility: 'hasFactory',
    department: 'Labour Reallocation Subcommittee', objectiveKey: 'worker_hire', difficulty: 'routine',
    title: 'Temporary Employment Rectification', target: 1,
    briefing: (context) => `Hire one available worker in ${context.cityName}.`,
    actionPath: '/factories' }),
  simpleTemplate({ key: 'deploy-oil-machine', family: 'petroleum', eligibility: 'hasOilMachine',
    department: 'Petroleum Mismanagement Authority', objectiveKey: 'oil_deploy', difficulty: 'serious',
    title: 'Installation of Necessary Pipework', target: 1,
    briefing: (context) => `Deploy one machine in the ${context.cityName} Oil Field.`,
    actionPath: '/oil-field' }),
  simpleTemplate({ key: 'claim-oil', family: 'petroleum', eligibility: 'hasOilClaim',
    department: 'Barrel Contents Verification Office', objectiveKey: 'oil_claim', difficulty: 'hazard',
    title: 'Recovery of Properly Rounded Petroleum', target: (seed) => amount(seed, 'target', 1, 3),
    briefing: (context, target) => `Claim ${target} barrel${target === 1 ? '' : 's'} of Oil from the ${context.cityName} field.`,
    actionPath: '/oil-field' }),
  simpleTemplate({ key: 'dispatch-peacefully', family: 'logistics', eligibility: 'hasVehicle',
    department: 'Bureau of Necessary Journeys', objectiveKey: 'vehicle_send', difficulty: 'routine',
    title: 'Movement Without Official Hostility', target: 1,
    briefing: (context) => `Dispatch one vehicle peacefully from ${context.cityName}.`,
    actionPath: '/vehicles', prepare: undefined }),
  simpleTemplate({ key: 'dispatch-patrol', family: 'hazards', eligibility: 'hasVehicle',
    department: 'Office of Large and Unlicensed Animals', objectiveKey: 'vehicle_patrol', difficulty: 'hazard',
    title: 'Visible Preparedness Demonstration', target: 1,
    briefing: (context) => `Send one compatible vehicle from ${context.cityName} under patrol orders.`,
    actionPath: '/vehicles' }),
  simpleTemplate({ key: 'place-listing', family: 'markets', eligibility: 'hasListable',
    department: 'Local Exchange Observation Bureau', objectiveKey: 'market_listing', difficulty: 'petty',
    title: 'Public Declaration of a Price', target: 1,
    briefing: (context) => `Place one Thing listing in the ${context.cityName} market. It may be cancelled after inspection.`,
    actionPath: '/exchange' })
]);

export function prepareCouncilMission(template, context, seed) {
  const prepared = template.prepare(context, seed);
  if (template.key === 'dispatch-peacefully') {
    prepared.details.filter.travelOrder = 'peaceful';
  }
  return prepared;
}
