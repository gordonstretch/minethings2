import assert from 'node:assert/strict';
import test from 'node:test';
import {
  generateWorldChatAnnouncement, WORLD_CHAT_ANNOUNCEMENT_FAMILIES
} from '../src/world-chat-announcements.js';

const CASES = Object.freeze({
  'dwarf-capture': {
    context: { playerName: 'Ada', dwarfName: 'Orange Dwarf', count: 1, cityName: 'Cinderwake' },
    required: ['Ada', 'Orange Dwarf', 'Cinderwake']
  },
  'dwarf-stowaway': {
    context: {
      dwarfName: 'Green Dwarf', originName: 'Cinderwake', destinationName: 'Blackglass',
      playerName: 'Ada', vehicleName: 'Road Hunter'
    },
    required: ['Green Dwarf', 'Cinderwake', 'Blackglass', 'Ada', 'Road Hunter']
  },
  'ship-sunk': {
    context: { lostItems: '2× Cannon, Schooner', routeName: 'Kemet-Belfort' },
    required: ['2× Cannon, Schooner', 'Kemet-Belfort']
  },
  'transport-destroyed': {
    context: {
      transportKind: 'land', playerName: 'Ada', vehicleName: 'Road Hunter',
      routeName: 'Cinderwake-Blackglass', causeName: 'combat with a Highwayman'
    },
    required: ['Ada', 'Road Hunter', 'Cinderwake-Blackglass', 'combat with a Highwayman']
  },
  'ghost-risen': {
    context: { ghostName: 'Ghost Schooner', ghostKind: 'ship', routeName: 'Kemet-Belfort' },
    required: ['Ghost Schooner', 'Kemet-Belfort']
  },
  'ghost-defeated': {
    context: { playerName: 'Ada', vehicleName: 'Patrol Boat', ghostName: 'Ghost Schooner' },
    required: ['Ada', 'Patrol Boat', 'Ghost Schooner']
  },
  'weather-observation': {
    context: { mapName: 'Aso', condition: 'rain', temperatureC: 12, windKph: 42, rainfallMm: 7 },
    required: ['Aso', 'rain', '12', '42', '7']
  },
  'storm-warning': {
    context: { mapName: 'Aso', windKph: 80, rainfallMm: 12 },
    required: ['Aso', '80', '12']
  },
  'snow-warning': { context: { mapName: 'Aso' }, required: ['Aso'] },
  'hurricane-warning': { context: { mapName: 'Aso' }, required: ['Aso'] },
  'creature-sighting': {
    context: {
      creatureName: 'Common Orca Pod', routeName: 'Sulfur Crown-Lahar Rest',
      destinationName: 'Sulfur Crown'
    },
    required: ['Common Orca Pod', 'Sulfur Crown-Lahar Rest', 'Sulfur Crown']
  },
  'creature-escaped': {
    context: { creatureName: 'Common Orca Pod', destinationName: 'Sulfur Crown' },
    required: ['Common Orca Pod', 'Sulfur Crown']
  },
  'moon-phase': {
    context: { moonName: 'Full Moon', effect: 'Dwarf captures double.' },
    required: ['Full Moon', 'Dwarf captures double.']
  },
  'route-closed': {
    context: {
      routeName: 'Cinderwake ↔ Blackglass', routeMode: 'land', activeJourneys: 3
    },
    required: ['Cinderwake', 'Blackglass', 'land', '3']
  },
  'route-reopened': {
    context: { routeName: 'Cinderwake ↔ Blackglass', routeMode: 'land' },
    required: ['Cinderwake', 'Blackglass', 'land']
  },
  'creature-defeated': {
    context: {
      playerName: 'Ada', vehicleName: 'Patrol Boat', creatureName: 'Common Orca Pod',
      rewardSummary: 'recovered 3 Ore'
    },
    required: ['Ada', 'Patrol Boat', 'Common Orca Pod', 'recovered 3 Ore']
  }
});

test('generates stable context-safe copy for every world-chat announcement family', () => {
  assert.ok(Object.isFrozen(WORLD_CHAT_ANNOUNCEMENT_FAMILIES));
  assert.equal(new Set(WORLD_CHAT_ANNOUNCEMENT_FAMILIES).size,
    WORLD_CHAT_ANNOUNCEMENT_FAMILIES.length);
  assert.deepEqual([...WORLD_CHAT_ANNOUNCEMENT_FAMILIES].sort(), Object.keys(CASES).sort());

  for (const family of WORLD_CHAT_ANNOUNCEMENT_FAMILIES) {
    const { context, required } = CASES[family];
    const seed = `${family}:stable-event`;
    const message = generateWorldChatAnnouncement(family, seed, context);
    assert.equal(generateWorldChatAnnouncement(family, seed, context), message);
    assert.ok(/[.!?]$/u.test(message), `${family} should produce a complete sentence`);
    assert.doesNotMatch(message, /undefined|null|\[object Object\]/u);
    for (const value of required) {
      assert.ok(message.toLocaleLowerCase('en-GB').includes(value.toLocaleLowerCase('en-GB')),
        `${family} should preserve ${value}`);
    }
  }

  assert.match(generateWorldChatAnnouncement('dwarf-capture', 'orange-one',
    CASES['dwarf-capture'].context), /an Orange Dwarf/u);
  assert.match(generateWorldChatAnnouncement('snow-warning', 'snow-one',
    CASES['snow-warning'].context), /depart/iu);
  assert.match(generateWorldChatAnnouncement('storm-warning', 'storm-one',
    CASES['storm-warning'].context), /ship/iu);
  assert.match(generateWorldChatAnnouncement('hurricane-warning', 'hurricane-one',
    CASES['hurricane-warning'].context), /(?:land|road).*(?:ship|sea)|(?:ship|sea).*(?:land|road)/iu);
  assert.match(generateWorldChatAnnouncement('route-closed', 'route-closed-one', {
    ...CASES['route-closed'].context, activeJourneys: 0
  }), /No journeys are underway/u);
});

test('mixes announcement phrasing broadly while event seeds remain deterministic', () => {
  for (const family of WORLD_CHAT_ANNOUNCEMENT_FAMILIES) {
    const messages = new Set(Array.from({ length: 500 }, (_, index) =>
      generateWorldChatAnnouncement(family, `${family}:event:${index}`, CASES[family].context)));
    assert.ok(messages.size >= 6, `${family} should expose at least six phrasings`);
  }

  const risen = new Set(Array.from({ length: 500 }, (_, index) =>
    generateWorldChatAnnouncement('ghost-risen', `ghost:${index}:risen`,
      CASES['ghost-risen'].context)));
  const victories = new Set(Array.from({ length: 500 }, (_, index) =>
    generateWorldChatAnnouncement('creature-defeated', `creature:${index}:defeated`,
      CASES['creature-defeated'].context)));
  assert.ok(risen.size > 25, 'ghost openings and warnings should combine');
  assert.ok(victories.size > 20, 'victory reports and reward lines should combine');
});

test('rejects unknown families and incomplete announcement context', () => {
  assert.throws(() => generateWorldChatAnnouncement('gossip', 'seed', {}),
    /Unknown world chat announcement family/u);
  assert.throws(() => generateWorldChatAnnouncement('creature-sighting', '',
    CASES['creature-sighting'].context), /seed is required/u);
  assert.throws(() => generateWorldChatAnnouncement('creature-sighting', 'seed', {}),
    /requires creatureName/u);
  assert.throws(() => generateWorldChatAnnouncement('dwarf-capture', 'seed', {
    playerName: 'Ada', dwarfName: 'Green Dwarf', count: 0
  }), /positive count/u);
  assert.throws(() => generateWorldChatAnnouncement('transport-destroyed', 'seed', {
    ...CASES['transport-destroyed'].context, transportKind: 'sea'
  }), /land or air transport kind/u);
});
