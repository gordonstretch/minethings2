import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COUNCIL_CHARGE_ACTS, COUNCIL_CHARGE_CIRCUMSTANCES,
  COUNCIL_CHARGE_CONDITIONS, COUNCIL_CHARGE_POSSIBILITIES,
  COUNCIL_NOUNS, COUNCIL_SENTENCES, COUNCIL_VERBS, generateCouncilDocket
} from '../src/council-sentencing.js';

test('builds thousands of stable, harmless Council offences', () => {
  assert.ok(COUNCIL_CHARGE_POSSIBILITIES > 10_000_000);
  assert.ok(COUNCIL_NOUNS.length >= 100);
  assert.ok(COUNCIL_VERBS.length >= 50);
  assert.equal(new Set(COUNCIL_NOUNS).size, COUNCIL_NOUNS.length);
  assert.equal(new Set(COUNCIL_VERBS).size, COUNCIL_VERBS.length);
  assert.ok(Object.isFrozen(COUNCIL_NOUNS));
  assert.ok(Object.isFrozen(COUNCIL_VERBS));
  assert.ok(Object.isFrozen(COUNCIL_CHARGE_ACTS));
  assert.ok(Object.isFrozen(COUNCIL_CHARGE_CIRCUMSTANCES));
  assert.ok(Object.isFrozen(COUNCIL_CHARGE_CONDITIONS));
  assert.ok(Object.isFrozen(COUNCIL_SENTENCES));

  const first = generateCouncilDocket('miner:7:registration:1000');
  assert.deepEqual(generateCouncilDocket('miner:7:registration:1000'), first);
  assert.match(first.docketId, /^[A-F0-9]{12}$/u);
  assert.ok(first.charges.length >= 3 && first.charges.length <= 5);
  assert.equal(new Set(first.charges).size, first.charges.length);
  assert.ok(first.charges.every((charge) => charge.includes(' while ') && charge.endsWith('.')));
  assert.ok(COUNCIL_SENTENCES.includes(first.sentence));
  assert.notDeepEqual(generateCouncilDocket('miner:8:registration:1000'), first);
  assert.throws(() => generateCouncilDocket(''), /seed is required/u);
});

test('substitutes only nouns that serve each verb context', () => {
  assert.ok(COUNCIL_CHARGE_ACTS.includes('Driving a clown car'));
  assert.ok(COUNCIL_CHARGE_ACTS.includes('Consulting an astrolabe'));
  assert.ok(COUNCIL_CHARGE_ACTS.includes('Watering a fern'));
  assert.ok(COUNCIL_CHARGE_CONDITIONS.includes('addressing a pigeon by its first name'));
  assert.equal(COUNCIL_CHARGE_ACTS.includes('Driving a sandwich'), false);
  assert.equal(COUNCIL_CHARGE_ACTS.includes('Watering a timetable'), false);
  assert.equal(COUNCIL_CHARGE_CONDITIONS.includes('brewing a traffic cone'), false);

  for (let index = 0; index < 1_000; index += 1) {
    const docket = generateCouncilDocket(`context-audit:${index}`);
    for (const charge of docket.charges) {
      assert.equal(/Driving (?:a|an) (?:sandwich|astrolabe|fern)/u.test(charge), false);
      assert.equal(/Watering (?:a|an) (?:timetable|vehicle|teapot)/u.test(charge), false);
      assert.equal(/Brewing (?:a|an) (?:traffic cone|pigeon|cardigan)/u.test(charge), false);
    }
  }
});

test('Council docket generation produces broad variation between miners', () => {
  const dockets = Array.from({ length: 500 }, (_, index) =>
    generateCouncilDocket(`new-miner:${index}:1700000000000`));
  const chargeSets = new Set(dockets.map((docket) => docket.charges.join('\n')));
  const sentences = new Set(dockets.map((docket) => docket.sentence));
  assert.ok(chargeSets.size > 475);
  assert.ok(sentences.size >= 12);
});
