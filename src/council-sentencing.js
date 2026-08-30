import crypto from 'node:crypto';

const NOUN_GROUPS = Object.freeze({
  vehicle: Object.freeze([
    'clown car', 'ceremonial wheelbarrow', 'municipal unicycle', 'clockwork taxi',
    'folding tram', 'submersible bicycle', 'provisional ambulance', 'velvet canoe',
    'left-handed bus', 'parade float', 'librarian’s scooter', 'single-use gondola'
  ]),
  instrument: Object.freeze([
    'astrolabe', 'compass', 'sundial', 'barometer', 'sextant', 'hourglass',
    'tuning fork', 'weather vane', 'slide rule', 'spirit level', 'metronome',
    'ceremonial abacus'
  ]),
  music: Object.freeze([
    'accordion', 'kazoo', 'triangle', 'bassoon', 'hurdy-gurdy', 'pocket organ',
    'municipal gong', 'silent trumpet', 'provisional harp', 'clockwork banjo'
  ]),
  document: Object.freeze([
    'timetable', 'bookmark', 'library card', 'parking permit', 'weather licence',
    'map drawn by a goose', 'Möbius ticket', 'provisional passport', 'blank affidavit',
    'receipt for Tuesday', 'annotated menu', 'certificate of adequate elbows'
  ]),
  food: Object.freeze([
    'sandwich', 'cucumber', 'biscuit', 'turnip', 'jam tart', 'boiled sweet',
    'custard slice', 'pickled walnut', 'ceremonial sausage', 'emergency scone',
    'municipal pear', 'licensed crumpet'
  ]),
  beverage: Object.freeze([
    'cup of tea', 'pot of cocoa', 'jug of lemonade', 'bottle of rainwater',
    'flask of weak coffee', 'glass of ceremonial cordial', 'mug of onion broth',
    'decanter of provisional milk'
  ]),
  garment: Object.freeze([
    'cardigan', 'sock', 'corrective hat', 'left glove', 'ceremonial shoe',
    'municipal scarf', 'licensed waistcoat', 'provisional mitten', 'rain bonnet',
    'pair of regulation trousers'
  ]),
  animal: Object.freeze([
    'pigeon', 'goose', 'moth', 'badger', 'snail', 'stoat', 'newt', 'alpaca',
    'administrative ferret', 'junior duck', 'unionised vole', 'licensed bee'
  ]),
  plant: Object.freeze([
    'mushroom', 'fern', 'cactus', 'daffodil', 'bonsai', 'cabbage', 'topiary rabbit',
    'potted nettle', 'committee-approved leek', 'emotionally available pebblewort'
  ]),
  civic: Object.freeze([
    'traffic cone', 'public bench', 'bollard', 'signpost', 'lamp post', 'postbox',
    'park gate', 'decorative elbow', 'portable horizon', 'registered puddle',
    'statue of an unknown aunt', 'queue barrier'
  ]),
  tool: Object.freeze([
    'teaspoon', 'ladder', 'spanner', 'broom', 'trowel', 'plunger', 'rubber stamp',
    'spirit duplicator', 'left-handed hammer', 'collapsible rake', 'polite saw',
    'government-issue whisk'
  ]),
  container: Object.freeze([
    'teapot', 'lunchbox', 'suitcase', 'jam jar', 'hatbox', 'watering can',
    'picnic hamper', 'filing cabinet', 'portable cupboard', 'emergency bucket'
  ])
});

const NOUN_ENTRIES = Object.freeze(Object.entries(NOUN_GROUPS).flatMap(([kind, phrases]) =>
  phrases.map((phrase) => Object.freeze({ phrase, kind }))));

export const COUNCIL_NOUNS = Object.freeze(NOUN_ENTRIES.map((entry) => entry.phrase));

function verb(gerund, kinds, options = {}) {
  return Object.freeze({
    gerund,
    kinds: Object.freeze(kinds),
    prefix: options.prefix ?? '',
    suffix: options.suffix ?? ''
  });
}

const VERB_RULES = Object.freeze([
  verb('driving', ['vehicle']), verb('parking', ['vehicle']),
  verb('reversing', ['vehicle']), verb('piloting', ['vehicle']),
  verb('towing', ['vehicle']), verb('washing', ['vehicle', 'tool', 'container']),
  verb('operating', ['vehicle', 'instrument', 'tool']),
  verb('calibrating', ['instrument']), verb('consulting', ['instrument', 'document']),
  verb('winding', ['instrument', 'music']), verb('tuning', ['music']),
  verb('playing', ['music']), verb('silencing', ['music']),
  verb('reading', ['document']), verb('filing', ['document']),
  verb('stamping', ['document']), verb('notarising', ['document']),
  verb('underlining', ['document']), verb('annotating', ['document']),
  verb('folding', ['document', 'garment']), verb('ironing', ['document', 'garment']),
  verb('wearing', ['garment']), verb('mending', ['garment']),
  verb('registering', ['garment', 'vehicle', 'animal', 'tool']),
  verb('licensing', ['vehicle', 'instrument', 'tool', 'container']),
  verb('declaring', ['food', 'garment', 'tool', 'container']),
  verb('carrying', ['food', 'beverage', 'document', 'tool', 'container']),
  verb('transporting', ['food', 'beverage', 'animal', 'plant', 'container']),
  verb('borrowing', ['vehicle', 'instrument', 'music', 'document', 'tool', 'container']),
  verb('confiscating', ['vehicle', 'instrument', 'document', 'food', 'garment', 'tool']),
  verb('displaying', ['instrument', 'document', 'food', 'garment', 'plant', 'civic']),
  verb('misplacing', ['instrument', 'document', 'food', 'garment', 'tool', 'container']),
  verb('concealing', ['document', 'food', 'garment', 'tool', 'container']),
  verb('balancing', ['food', 'instrument', 'tool', 'container', 'civic']),
  verb('polishing', ['instrument', 'music', 'civic', 'tool', 'container']),
  verb('sharpening', ['tool']), verb('measuring', ['food', 'garment', 'civic', 'tool']),
  verb('buttering', ['food']), verb('toasting', ['food']),
  verb('slicing', ['food']), verb('refrigerating', ['food', 'beverage']),
  verb('seasoning', ['food']), verb('brewing', ['beverage']),
  verb('decanting', ['beverage']), verb('stirring', ['beverage']),
  verb('feeding', ['animal']), verb('grooming', ['animal']),
  verb('interviewing', ['animal', 'plant']), verb('saluting', ['animal', 'plant', 'civic']),
  verb('escorting', ['animal', 'plant', 'food', 'container']),
  verb('chaperoning', ['animal', 'plant', 'food', 'beverage']),
  verb('watering', ['plant']), verb('pruning', ['plant']),
  verb('addressing', ['animal', 'plant', 'civic', 'garment'], { suffix: ' by its first name' }),
  verb('arguing', ['instrument', 'animal', 'plant', 'civic'], { prefix: 'with ' }),
  verb('queueing', ['animal', 'plant', 'civic'], { prefix: 'behind ' }),
  verb('whispering', ['instrument', 'animal', 'plant', 'civic'], { prefix: 'to ' }),
  verb('conspiring', ['instrument', 'animal', 'plant', 'civic'], { prefix: 'with ' }),
  verb('failing to salute', ['animal', 'plant', 'civic']),
  verb('attempting to licence', ['vehicle', 'instrument', 'tool', 'container']),
  verb('using', ['instrument', 'document', 'garment', 'tool'], { suffix: ' for conversational purposes' })
]);

export const COUNCIL_VERBS = Object.freeze(VERB_RULES.map((entry) => entry.gerund));

function articleFor(phrase) {
  if (/^(?:uni(?:cycle|form)|useful|European|one\b)/iu.test(phrase)) return 'a';
  return /^(?:[aeiou]|honest\b|hour)/iu.test(phrase) ? 'an' : 'a';
}

function renderClause(rule, noun) {
  return `${rule.gerund} ${rule.prefix}${articleFor(noun.phrase)} ${noun.phrase}${rule.suffix}`;
}

const COUNCIL_CONTEXTUAL_CLAUSES = Object.freeze(VERB_RULES.flatMap((rule) =>
  NOUN_ENTRIES.filter((noun) => rule.kinds.includes(noun.kind))
    .map((noun) => Object.freeze({
      verb: rule.gerund,
      noun: noun.phrase,
      text: renderClause(rule, noun)
    }))));

function capitalise(value) {
  return `${value.charAt(0).toUpperCase()}${value.slice(1)}`;
}

export const COUNCIL_CHARGE_ACTS = Object.freeze(
  COUNCIL_CONTEXTUAL_CLAUSES.map((clause) => capitalise(clause.text))
);

export const COUNCIL_CHARGE_CIRCUMSTANCES = Object.freeze([
  'beneath a ceremonial umbrella', 'during an unscheduled Tuesday',
  'within seven metres of a municipal turnip', 'on the quiet side of the moon',
  'inside a lift travelling sideways', 'before the third breakfast bell',
  'in a hat registered as a dwelling', 'across a freshly painted longitude',
  'beside an emotionally significant traffic cone', 'during official nap weather',
  'with both elbows declared', 'in the presence of a junior cloud',
  'within a provisional picnic zone', 'on a carpet facing magnetic north',
  'under an assumed shoe size', 'near an unlicensed echo',
  'at a velocity reserved for librarians', 'with a borrowed shadow',
  'inside a non-conforming gazebo', 'between two legally distinct puddles',
  'after the authorised kettle hour', 'while facing the scenic direction',
  'in a queue of fewer than one person', 'during a strictly ornamental emergency',
  'beyond the jurisdiction of the nearest doormat', 'under committee-approved moonlight',
  'before a quorum of empty chairs', 'at the wrong end of a one-ended corridor',
  'inside the municipal whispering radius', 'during a temporary shortage of north',
  'without first consulting the decorative clock', 'on a day provisionally identified as Thursday'
]);

export const COUNCIL_CHARGE_CONDITIONS = Object.freeze(
  COUNCIL_CONTEXTUAL_CLAUSES.map((clause) => clause.text)
);

export const COUNCIL_SENTENCES = Object.freeze([
  "four years' provisional service",
  'death, suspended until the paperwork can be located',
  'ceremonial dismemberment from the Guild of Members',
  'three consecutive lifetimes of useful employment',
  'compulsory ownership of an apologetic wheelbarrow',
  'seven years beneath a corrective hat',
  'permanent reassignment to the Department of Loose Ends',
  'a sternly worded eternity',
  'twelve thousand hours of supervised tea',
  'loss of all privileges relating to Wednesdays',
  'public demotion to provisional mammal',
  'forty seasons of municipal humming',
  'indefinite service at the pleasure of the nearest committee',
  'banishment beyond the respectable planets',
  'one hundred years of remedial cartography',
  'confiscation of every second shadow',
  'six months attached to a travelling subcommittee',
  'mandatory reflection in a non-reflective waistcoat',
  'revocation of the right to stand diagonally',
  'nine generations of supervised queueing',
  'transportation to the least convenient hemisphere',
  'perpetual responsibility for an unclaimed traffic cone',
  'forty-two appeals, all scheduled yesterday',
  'community service in a community yet to be designated'
]);

export const COUNCIL_CHARGE_POSSIBILITIES = COUNCIL_CHARGE_ACTS.length
  * COUNCIL_CHARGE_CIRCUMSTANCES.length * COUNCIL_CHARGE_CONDITIONS.length;

function digestIndex(seed, label, length) {
  const digest = crypto.createHash('sha256').update(`${seed}\u0000${label}`).digest();
  return digest.readUInt32BE(0) % length;
}

function contextualClause(seed, label) {
  return COUNCIL_CONTEXTUAL_CLAUSES[
    digestIndex(seed, label, COUNCIL_CONTEXTUAL_CLAUSES.length)
  ];
}

export function generateCouncilDocket(seedValue) {
  const seed = String(seedValue ?? '').trim();
  if (!seed) throw new Error('A Council docket seed is required.');
  const chargeCount = 3 + digestIndex(seed, 'charge-count', 3);
  const charges = [];
  const used = new Set();
  for (let index = 0; charges.length < chargeCount; index += 1) {
    const act = contextualClause(seed, `act:${index}`);
    const circumstance = COUNCIL_CHARGE_CIRCUMSTANCES[
      digestIndex(seed, `circumstance:${index}`, COUNCIL_CHARGE_CIRCUMSTANCES.length)
    ];
    let condition = contextualClause(seed, `condition:${index}`);
    for (let offset = 1; condition.verb === act.verb || condition.noun === act.noun; offset += 1) {
      condition = COUNCIL_CONTEXTUAL_CLAUSES[
        (digestIndex(seed, `condition:${index}`, COUNCIL_CONTEXTUAL_CLAUSES.length) + offset)
          % COUNCIL_CONTEXTUAL_CLAUSES.length
      ];
    }
    const charge = `${capitalise(act.text)} ${circumstance} while ${condition.text}.`;
    if (used.has(charge)) continue;
    used.add(charge);
    charges.push(charge);
  }
  const sentence = COUNCIL_SENTENCES[
    digestIndex(seed, 'sentence', COUNCIL_SENTENCES.length)
  ];
  const docketId = crypto.createHash('sha256').update(`council-docket\u0000${seed}`).digest('hex')
    .slice(0, 12).toUpperCase();
  return { docketId, charges, sentence };
}
