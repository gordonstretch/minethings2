import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlayer } from '../src/game.js';
import { loadLegacyCatalog } from '../src/legacy-catalog.js';
import { createApp } from '../src/server.js';
import { hashPassword, SqliteStore } from '../src/store.js';

const MACHINE_CASES = [
  {
    key: 'thing-o-matic', path: '/casino', href: '/casino',
    copy: [/THE THING-O-MATIC/u, /Lines, explosive matches, and scatters/u,
      /Nine BLU-82s/u]
  },
  {
    key: 'bromo-sporefall', path: '/casino?machine=bromo-sporefall',
    href: '/casino?machine=bromo-sporefall',
    copy: [/BROMO SPOREFALL/u, /connect/iu, /compost/iu, /cascade/iu,
      /Nine Crowns of Bromo/u]
  },
  {
    key: 'kings-lockbox', path: '/casino?machine=kings-lockbox',
    href: '/casino?machine=kings-lockbox',
    copy: [/THE KING&#39;S LOCKBOX/u, /Every locked relic pays/u,
      /Soot-Clogged Coins never pay/u, /Fill all nine locks/u]
  }
];

const THING_ONLY_COPY = /THE THING-O-MATIC|BLU-82|Shift Bell|Twin Drill|Golden Fuse|free respins?|Pull the lever|explosive matches/iu;

function fragment(html, opening, closing) {
  const start = html.indexOf(opening);
  assert.notEqual(start, -1, `Missing ${opening}`);
  const end = html.indexOf(closing, start);
  assert.notEqual(end, -1, `Missing ${closing} after ${opening}`);
  return html.slice(start, end + closing.length);
}

function deterministicRandom(seed = 0x5eed1234) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

test('serves and keeps each casino machine in its own HTTP and ledger scope', async (context) => {
  const catalog = loadLegacyCatalog();
  const store = new SqliteStore(':memory:');
  store.seedCatalog(catalog);
  const password = 'casino machine server password';
  const player = store.addPlayer(createPlayer(
    'Machine Contract Miner', '', hashPassword(password), catalog, 1000, () => 0.5
  ));
  store.database.prepare('UPDATE players SET gold_units = ? WHERE id = ?')
    .run(100 * 10000, player.id);

  const server = createApp({
    store, random: deterministicRandom(), now: () => 2000
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => {
    await new Promise((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve()));
    store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = await fetch(`${base}/login`, {
    method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ name: player.name, password })
  });
  assert.equal(login.status, 303);
  const cookie = login.headers.get('set-cookie')?.split(';')[0];
  assert.ok(cookie, 'login should establish a session');

  for (const machine of MACHINE_CASES) {
    const response = await fetch(`${base}${machine.path}`, { headers: { cookie } });
    assert.equal(response.status, 200, machine.key);
    const html = await response.text();
    const floor = fragment(html, '<nav class="casino-floor"', '</nav>');
    const machineContent = fragment(
      html, '<article class="casino-machine', '<section class="casino-history"'
    );

    assert.equal((floor.match(/class="casino-floor-card(?: is-current)?"/gu) ?? []).length,
      3, `${machine.key} should show all three choices`);
    assert.equal((floor.match(/class="casino-floor-card is-current"/gu) ?? []).length,
      1, `${machine.key} should have one current choice`);
    assert.equal((floor.match(/aria-current="page"/gu) ?? []).length,
      1, `${machine.key} should expose one current choice`);
    assert.ok(floor.includes(
      `class="casino-floor-card is-current" href="${machine.href}" aria-current="page"`
    ), `${machine.key} should mark its own picker card current`);
    assert.equal((html.match(/data-casino-cell="\d"/gu) ?? []).length,
      9, `${machine.key} should render one nine-cell cabinet`);
    assert.equal((html.match(/id="casino-machine"/gu) ?? []).length, 1);
    assert.match(html, new RegExp(
      `class="casino-page casino-theme-${machine.key}"[\\s\\S]*data-casino-machine="${machine.key}"`,
      'u'
    ));
    assert.match(html, new RegExp(
      `<input type="hidden" name="machine" value="${machine.key}">`, 'u'
    ));
    for (const copy of machine.copy) assert.match(machineContent, copy, machine.key);
    if (machine.key === 'thing-o-matic') {
      assert.match(machineContent, /Original house machine/u);
      assert.match(machineContent, /class="casino-line-bank" aria-label="Eight active paylines"/u);
      assert.match(machineContent, /<strong>8 active lines<\/strong><span>3 rows<\/span><span>3 columns<\/span><span>2 diagonals<\/span>/u);
    }
    if (machine.key !== 'thing-o-matic') {
      assert.doesNotMatch(machineContent, THING_ONLY_COPY,
        `${machine.key} should not inherit Thing-O-Matic copy`);
      assert.doesNotMatch(machineContent, /<ol class="casino-paylines"/u,
        `${machine.key} should not inherit Thing-O-Matic paylines`);
      assert.doesNotMatch(machineContent, /casino-line-bank|Original house machine/u,
        `${machine.key} should not inherit Thing-O-Matic cabinet details`);
    }
  }

  const pull = await fetch(`${base}/casino/spin`, {
    method: 'POST', redirect: 'manual',
    headers: {
      cookie, 'content-type': 'application/x-www-form-urlencoded',
      referer: `${base}/casino?machine=bromo-sporefall`
    },
    body: new URLSearchParams({
      machine: 'bromo-sporefall', currency: 'gold', wager: '1'
    })
  });
  assert.equal(pull.status, 303);
  const location = pull.headers.get('location');
  assert.match(location, /^\/casino\?machine=bromo-sporefall&spin=\d+$/u);
  const spinId = Number(new URL(location, base).searchParams.get('spin'));
  assert.ok(Number.isSafeInteger(spinId) && spinId > 0);

  const selectedResponse = await fetch(`${base}${location}`, { headers: { cookie } });
  assert.equal(selectedResponse.status, 200);
  const selectedHtml = await selectedResponse.text();
  assert.match(selectedHtml, /<section class="casino-result /u);
  assert.match(selectedHtml, new RegExp(
    `href="/casino\\?machine=bromo-sporefall&amp;spin=${spinId}"`, 'u'
  ));

  const crossMachineResponse = await fetch(
    `${base}/casino?machine=kings-lockbox&spin=${spinId}`, { headers: { cookie } }
  );
  assert.equal(crossMachineResponse.status, 200);
  const crossMachineHtml = await crossMachineResponse.text();
  assert.doesNotMatch(crossMachineHtml, /<section class="casino-result /u);
  assert.doesNotMatch(crossMachineHtml, new RegExp(`[?&]spin=${spinId}(?:&amp;|")`, 'u'));
  assert.match(crossMachineHtml,
    /<p class="casino-ready" id="casino-status" role="status">/u);
});
