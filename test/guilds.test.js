import assert from 'node:assert/strict';
import test from 'node:test';
import { createPlayer } from '../src/game.js';
import { loadLegacyCatalog } from '../src/legacy-catalog.js';
import { createApp } from '../src/server.js';
import { hashPassword, SqliteStore } from '../src/store.js';

function guildFixture() {
  const store = new SqliteStore(':memory:');
  store.seedCatalog(loadLegacyCatalog());
  store.ensureWorldMaps(1000);
  const catalog = store.loadCatalog();
  const password = 'guild test password';
  const players = ['Guild Founder', 'Guild Member', 'Guild Outsider'].map((name) =>
    store.addPlayer(createPlayer(name, '', hashPassword(password), catalog, 1000, () => 0.5)));
  store.database.prepare(
    'UPDATE players SET gold_units = ?, gold_updated_at = ? WHERE id = ?'
  ).run(250 * 10000, 1000, players[0].id);
  return { store, catalog, password, players };
}

test('guilds are leaderless, open membership collectives costing 100g', () => {
  const { store, players } = guildFixture();
  try {
    const [founder, member, outsider] = players;
    const guild = store.createGuild(founder.id, '  Deep   Delvers  ', 2000);
    assert.deepEqual(guild, { id: guild.id, name: 'Deep Delvers', costGold: 100 });
    assert.equal(store.playerById(founder.id).gold, 150);

    const schemaColumns = [
      ...store.database.prepare('PRAGMA table_info(guilds)').all(),
      ...store.database.prepare('PRAGMA table_info(guild_members)').all()
    ].map((column) => column.name);
    assert.equal(schemaColumns.some((name) => /leader|owner|role|rank/iu.test(name)), false);
    assert.throws(() => store.createGuild(member.id, 'deep delvers', 2001), /already taken/);

    store.joinGuild(member.id, guild.id, 2002);
    store.joinGuild(outsider.id, guild.id, 2003);
    assert.throws(() => store.createGuild(member.id, 'Another Guild', 2004), /current guild/);
    assert.deepEqual(store.guildForPlayer(founder.id).members.map((entry) => entry.name),
      ['Guild Founder', 'Guild Member', 'Guild Outsider']);

    store.leaveGuild(founder.id);
    store.leaveGuild(member.id);
    store.leaveGuild(outsider.id);
    const empty = store.guildDirectory(founder.id).guilds.find((entry) => entry.id === guild.id);
    assert.equal(empty.memberCount, 0);
    store.joinGuild(founder.id, guild.id, 2005);
    assert.equal(store.guildForPlayer(founder.id).name, 'Deep Delvers');
  } finally {
    store.close();
  }
});

test('guild bank enforces 1,000 things and first-come-first-served withdrawals', () => {
  const { store, catalog, players } = guildFixture();
  try {
    const [founder, member, outsider] = players;
    const guild = store.createGuild(founder.id, 'Common Stores', 2000);
    store.joinGuild(member.id, guild.id, 2001);
    const itemId = catalog.items[0].id;
    const cityId = store.playerById(founder.id).cityId;
    store.database.prepare('DELETE FROM inventory WHERE player_id IN (?, ?) AND item_id = ?')
      .run(founder.id, member.id, itemId);
    store.database.prepare(
      'INSERT INTO inventory (player_id, city_id, item_id, quantity) VALUES (?, ?, ?, ?)'
    ).run(founder.id, cityId, itemId, 1000);
    store.database.prepare(
      'INSERT INTO inventory (player_id, city_id, item_id, quantity) VALUES (?, ?, ?, ?)'
    ).run(member.id, cityId, itemId, 1);

    assert.equal(store.depositGuildItem(founder.id, itemId, 1000, 2002).used, 1000);
    assert.throws(() => store.depositGuildItem(member.id, itemId, 1, 2003), /at most 1000/);
    assert.throws(() => store.database.prepare(`
      UPDATE guild_inventory SET quantity = 1001 WHERE guild_id = ? AND item_id = ?
    `).run(guild.id, itemId), /at most 1000/);
    assert.throws(() => store.guildBank(outsider.id), /Join a guild/);

    const currentCity = catalog.cities.find((city) => city.id === cityId);
    const currentRegion = catalog.maps.find((map) => map.id === currentCity.mapId);
    const outpost = catalog.cities.find((city) =>
      city.mapId === currentCity.mapId && city.id !== currentRegion.capitalCityId);
    assert.ok(outpost, 'the starter region has an outpost for location checks');
    store.database.prepare('UPDATE players SET city_id = ? WHERE id = ?')
      .run(outpost.id, member.id);
    store.database.prepare(`
      INSERT INTO inventory (player_id, city_id, item_id, quantity) VALUES (?, ?, ?, 1)
      ON CONFLICT (player_id, city_id, item_id) DO UPDATE SET quantity = quantity + 1
    `).run(member.id, outpost.id, itemId);
    assert.equal(store.guildBank(member.id).canTransfer, false);
    assert.throws(() => store.depositGuildItem(member.id, itemId, 1, 2004),
      /region's capital/);
    assert.throws(() => store.withdrawGuildItem(member.id, itemId, 1, 2004),
      /region's capital/);
    store.database.prepare('UPDATE players SET city_id = ? WHERE id = ?')
      .run(cityId, member.id);

    store.withdrawGuildItem(member.id, itemId, 700, 2004);
    store.withdrawGuildItem(founder.id, itemId, 300, 2005);
    assert.throws(() => store.withdrawGuildItem(member.id, itemId, 1, 2006),
      /already been withdrawn/);
    assert.equal(store.guildBank(founder.id).guild.itemCount, 0);
    assert.equal(store.database.prepare(`
      SELECT quantity FROM inventory WHERE player_id = ? AND city_id = ? AND item_id = ?
    `).get(member.id, cityId, itemId).quantity, 701);
  } finally {
    store.close();
  }
});

test('guild chat is visible only to current guild members', () => {
  const { store, players } = guildFixture();
  try {
    const [founder, member, outsider] = players;
    const guild = store.createGuild(founder.id, 'Quiet Frequency', 2000);
    store.joinGuild(member.id, guild.id, 2001);
    store.addGuildChat(founder.id, 'First private signal', 3000);
    const state = store.recentGuildChats(member.id, 0);
    assert.equal(state.chats.length, 1);
    assert.equal(state.chats[0].body, 'First private signal');
    assert.throws(() => store.recentGuildChats(outsider.id, 0), /Join a guild/);
    assert.throws(() => store.addGuildChat(outsider.id, 'Let me in', 3001), /Join a guild/);
  } finally {
    store.close();
  }
});

test('guild pages expose creation, membership, chat, and bank operations', async (context) => {
  const { store, catalog, password, players } = guildFixture();
  const [founder, member] = players;
  const server = createApp({ store, catalog, now: () => 5000 });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    store.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const login = async (name) => {
    const response = await fetch(`${base}/login`, {
      method: 'POST', redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ name, password })
    });
    return response.headers.get('set-cookie').split(';')[0];
  };
  const founderCookie = await login(founder.name);
  const memberCookie = await login(member.name);

  const directory = await fetch(`${base}/guilds`, { headers: { cookie: founderCookie } });
  assert.equal(directory.status, 200);
  const directoryHtml = await directory.text();
  assert.match(directoryHtml, /Leaderless groups/);
  assert.match(directoryHtml, /class="page-title"[^>]*><div><p class="eyebrow">Player collectives/);
  assert.doesNotMatch(directoryHtml, /guild-title|chat-page-title/);
  assert.match(directoryHtml, /Start guild[^<]*&middot; 100g|Start guild/);

  const created = await fetch(`${base}/guilds/create`, {
    method: 'POST', redirect: 'manual', headers: {
      cookie: founderCookie, 'content-type': 'application/x-www-form-urlencoded'
    }, body: new URLSearchParams({ name: 'HTTP Guild' })
  });
  assert.equal(created.status, 303);
  const guildId = store.guildForPlayer(founder.id).id;
  const joined = await fetch(`${base}/guilds/${guildId}/join`, {
    method: 'POST', redirect: 'manual', headers: { cookie: memberCookie }
  });
  assert.equal(joined.status, 303);

  const posted = await fetch(`${base}/guilds/chat`, {
    method: 'POST', redirect: 'manual', headers: {
      cookie: memberCookie, 'content-type': 'application/x-www-form-urlencoded'
    }, body: new URLSearchParams({ body: 'Guild route works' })
  });
  assert.equal(posted.status, 303);
  const chat = await fetch(`${base}/guilds/chat`, { headers: { cookie: founderCookie } });
  assert.equal(chat.status, 200);
  const chatHtml = await chat.text();
  assert.match(chatHtml, /Guild route works/);
  assert.match(chatHtml, /<h1>Guild chat<\/h1>/);
  assert.doesNotMatch(chatHtml, /chat-page-title|chat-title-mark/);

  const bank = await fetch(`${base}/guilds/bank`, { headers: { cookie: memberCookie } });
  assert.equal(bank.status, 200);
  const bankHtml = await bank.text();
  assert.match(bankHtml, /Guild bank transfers are available/);
  assert.match(bankHtml, /<h1>Guild bank<\/h1>/);

  const memberCity = catalog.cities.find((city) => city.id === store.playerById(member.id).cityId);
  const memberRegion = catalog.maps.find((map) => map.id === memberCity.mapId);
  const outpost = catalog.cities.find((city) =>
    city.mapId === memberCity.mapId && city.id !== memberRegion.capitalCityId);
  store.database.prepare('UPDATE players SET city_id = ? WHERE id = ?').run(outpost.id, member.id);
  const lockedBank = await fetch(`${base}/guilds/bank`, { headers: { cookie: memberCookie } });
  const lockedHtml = await lockedBank.text();
  assert.match(lockedHtml, /Transfers locked/);
  assert.doesNotMatch(lockedHtml, /action="\/guilds\/bank\/(?:deposit|withdraw)"/);
});
