import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import {
  assignRobot, buyMine, claimMine, createPlayer, expireRentalMines,
  equipMine, mineBucketsPerHour, mineIntervalMs,
  mineRefundCredits, oilMineBot, prioritizeMine, rentMine, sellMine, setMineMode,
  unassignRobot, unequipMine
} from './game.js';
import { loadLegacyCatalog } from './legacy-catalog.js';
import { machineIconSvg } from './item-icons.js';
import { SqliteStore, hashPasswordAsync, verifyPasswordAsync } from './store.js';
import { specialisationMultiplier } from './specialisations.js';
import { armsRarities, compatibleCargoAllowed } from './vehicle-combat.js';
import { LEGAL_VERSION, LEGAL_VERSIONS, sellerConfiguration } from './legal.js';
import { EmailClient, emailConfiguration, emailReadiness } from './email.js';
import { PreviewBindingRegistry } from './preview-bindings.js';
import {
  PayPalClient, paypalConfiguration, paypalOrderSummary, paypalReadiness
} from './paypal.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_ROOT = path.join(ROOT, 'public');
const LEGACY_ROOT = path.join(ROOT, 'td', 'public_html', 'app', 'webroot');
const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'], ['.gif', 'image/gif'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.ico', 'image/x-icon'],
  ['.svg', 'image/svg+xml; charset=utf-8'], ['.webp', 'image/webp'], ['.woff2', 'font/woff2']
]);
const SECURITY_HEADERS = Object.freeze({
  'Content-Security-Policy': "default-src 'self'; base-uri 'none'; object-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self'; form-action 'self'; frame-ancestors 'none'",
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(), geolocation=(), microphone=()',
  'Referrer-Policy': 'same-origin',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY'
});

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
}

function normalizeMinerName(value) {
  return String(value ?? '').normalize('NFC').trim();
}

function formatDuration(milliseconds) {
  if (milliseconds <= 0) return 'ready now';
  const minutes = Math.ceil(milliseconds / 60000);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function formatGold(value) {
  return Number(value).toFixed(4).replace(/\.?0+$/, '');
}

function catalogRoleId(catalog, settingKey, behaviorKey) {
  const id = Number(catalog.settings?.[settingKey]?.[behaviorKey]);
  if (!Number.isSafeInteger(id) || id < 0) {
    throw new Error(`Invalid ${settingKey} behavior mapping: ${behaviorKey}.`);
  }
  return id;
}

function positiveCatalogInteger(catalog, key) {
  const value = Number(catalog.settings?.[key]);
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error('Invalid positive-integer catalog setting: ' + key + '.');
  }
  return value;
}

function catalogArrayNumber(settings, key, index) {
  const values = settings?.[key];
  if (!Array.isArray(values)) throw new Error(`Invalid array catalog setting: ${key}.`);
  const value = Number(values[Number(index)]);
  if (!Number.isFinite(value)) throw new Error(`Missing numeric catalog setting: ${key}[${index}].`);
  return value;
}

function catalogItemForSetting(catalog, key) {
  const itemId = Number(catalog.settings?.[key]);
  const item = catalog.byId.get(itemId);
  if (!Number.isSafeInteger(itemId) || !item) {
    throw new Error(`Missing catalog item configured by ${key}.`);
  }
  return item;
}

function catalogItemForId(catalog, itemId, context = 'item') {
  const item = catalog.byId.get(Number(itemId));
  if (!item) throw new Error(`Missing catalog item ${itemId} for ${context}.`);
  return item;
}

function catalogCollection(catalog, key) {
  const value = catalog?.[key];
  if (!Array.isArray(value)) throw new Error(`Missing catalog collection: ${key}.`);
  return value;
}

function catalogObjectSetting(catalog, key) {
  const value = catalog.settings?.[key];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Missing object catalog setting: ${key}.`);
  }
  return value;
}

function catalogSettingString(catalog, key, ...path) {
  let value = catalogObjectSetting(catalog, key);
  for (const segment of path) value = value?.[segment];
  if (typeof value !== 'string') {
    throw new Error(`Missing catalog string setting: ${key}.${path.join('.')}.`);
  }
  return value;
}

function catalogGadgetForBehavior(catalog, behaviorKey) {
  const gadget = catalog.gadgetByBehaviorKey.get(behaviorKey);
  if (!gadget) throw new Error(`Missing catalog gadget behavior: ${behaviorKey}.`);
  return gadget;
}

function catalogSpecialisationForBonus(catalog, bonusKey) {
  const specialisation = catalog.specialisations.find((entry) =>
    Object.hasOwn(entry.bonuses ?? {}, bonusKey)
      && Number.isFinite(Number(entry.bonuses[bonusKey]))
      && Number(entry.bonuses[bonusKey]) !== 0);
  if (!specialisation) throw new Error(`Missing catalog specialisation bonus: ${bonusKey}.`);
  return specialisation;
}

function catalogCityForId(catalog, cityId) {
  const city = catalog.cities.find((entry) => Number(entry.id) === Number(cityId));
  if (!city) throw new Error(`Missing catalog city: ${cityId}.`);
  return city;
}

function catalogMineTypeForId(catalog, mineTypeId) {
  const mineType = catalog.mineTypes.find((entry) => Number(entry.id) === Number(mineTypeId));
  if (!mineType) throw new Error(`Missing catalog mine type: ${mineTypeId}.`);
  return mineType;
}

function catalogRarityName(catalog, rarity) {
  const entry = catalog.rarityById.get(Number(rarity));
  if (!entry) throw new Error(`Missing catalog rarity: ${rarity}.`);
  return entry.name;
}

function vehicleRarities(catalog) {
  const ids = new Set(catalog.vehicles.map((vehicle) =>
    catalogItemForId(catalog, vehicle.itemId, `vehicle ${vehicle.id}`).rarity));
  return catalog.rarities.filter((rarity) => ids.has(rarity.id));
}

function catalogEquipmentTypeForId(catalog, typeId) {
  const entry = catalog.equipmentTypeById.get(Number(typeId));
  if (!entry) throw new Error(`Missing catalog equipment type: ${typeId}.`);
  return entry;
}

function catalogLabel(catalog, domain, id) {
  const value = catalog.labels?.[domain]?.[Number(id)];
  if (typeof value !== 'string') throw new Error(`Missing catalog label: ${domain}[${id}].`);
  return value;
}

function catalogSpecialisationForId(catalog, id) {
  const value = catalog.specialisationById.get(Number(id));
  if (!value) throw new Error(`Missing catalog specialisation: ${id}.`);
  return value;
}

function joinedNames(names) {
  if (names.length < 2) return names[0] ?? '';
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

function sessionCookie(id, catalog, secure = false) {
  return 'mt_session=' + id + '; HttpOnly; SameSite=Lax; Path=/; '
    + (secure ? 'Secure; ' : '') + 'Max-Age='
    + positiveCatalogInteger(catalog, 'session_max_age_seconds');
}

function clearSessionCookie(secure = false) {
  return 'mt_session=; HttpOnly; SameSite=Lax; Path=/; '
    + (secure ? 'Secure; ' : '') + 'Max-Age=0';
}

function cookies(request) {
  const result = Object.create(null);
  for (const part of (request.headers.cookie ?? '').split(';').filter(Boolean)) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    try {
      result[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1));
    } catch {
      // Ignore a malformed cookie instead of failing the whole request.
    }
  }
  return result;
}

function requestDestination(request, fallback = '/') {
  try {
    const pathname = new URL(request.headers.referer).pathname;
    return pathname.startsWith('/') ? pathname : fallback;
  } catch {
    return fallback;
  }
}

function redirect(response, location, cookie) {
  const headers = { Location: location, 'Cache-Control': 'no-store' };
  if (cookie) headers['Set-Cookie'] = cookie;
  response.writeHead(303, headers).end();
}

function responseHtml(response, status, html) {
  response.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(html);
}

function responseJson(response, status, value) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  }).end(JSON.stringify(value));
}

function responseText(response, status, text, filename = null) {
  const headers = { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' };
  if (filename) headers['Content-Disposition'] = `attachment; filename="${filename}"`;
  response.writeHead(status, headers).end(text);
}

function responseRequestError(response, error, player = null) {
  const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
  const busy = error?.code === 'SQLITE_BUSY_TIMEOUT' || error?.code === 'SQLITE_BUSY';
  responseHtml(response, busy ? 503 : 500, layout(
    busy ? 'Database busy' : 'Could not load page',
    `<section class="error"><h1>${busy ? 'The database is busy' : 'Could not load this page'}</h1><p>Please try again.</p></section>`,
    player, message
  ));
}

async function readForm(request) {
  let raw = '';
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > 64 * 1024) throw new Error('Request is too large.');
  }
  return Object.fromEntries(new URLSearchParams(raw));
}

async function readJson(request, maximumBytes = 256 * 1024) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > maximumBytes) throw new Error('Request is too large.');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return { raw, value: JSON.parse(raw) };
}

function staticFile(request, response, root, relativePath,
  cacheControl = 'public, max-age=3600') {
  if (!['GET', 'HEAD'].includes(request.method)) return false;
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(relativePath);
  } catch {
    return false;
  }
  const filename = path.resolve(root, `.${decodedPath}`);
  if (filename !== root && !filename.startsWith(`${root}${path.sep}`)) return false;
  try {
    const stats = fs.statSync(filename);
    if (!stats.isFile()) return false;
    const contentType = MIME_TYPES.get(path.extname(filename).toLowerCase());
    if (!contentType) return false;
    const etag = `"${stats.size.toString(16)}-${Math.trunc(stats.mtimeMs).toString(16)}"`;
    const headers = {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': cacheControl,
      ETag: etag,
      'Last-Modified': stats.mtime.toUTCString()
    };
    if (request.headers['if-none-match'] === etag) {
      delete headers['Content-Length'];
      response.writeHead(304, headers).end();
      return true;
    }
    response.writeHead(200, headers);
    if (request.method === 'HEAD') {
      response.end();
      return true;
    }
    fs.createReadStream(filename).pipe(response);
    return true;
  } catch {
    return false;
  }
}

function meldRevealPayload(createdMelds, catalog) {
  return createdMelds.map((created) => {
    const meld = catalog.meldById.get(Number(created.id));
    if (!meld) throw new Error(`Missing catalog meld: ${created.id}.`);
    const requirements = meld.requirements.map((requirement) => {
      const item = catalogItemForId(catalog, requirement.itemId, `meld ${meld.id}`);
      return {
        itemId: item.id, name: item.name, count: requirement.count,
        icon: item.icon, largeImage: item.largeImage, rarityName: item.rarityName
      };
    });
    return {
      id: meld.id, name: meld.name, rarity: meld.rarity,
      rarityName: catalogRarityName(catalog, meld.rarity),
      mineTypeName: catalogMineTypeForId(catalog, meld.mineTypeId).name,
      componentCount: requirements.reduce((sum, requirement) => sum + requirement.count, 0),
      requirements
    };
  });
}

function meldRevealHtml(melds) {
  if (!Array.isArray(melds) || !melds.length) return '';
  const cards = melds.map((meld) => {
    const artwork = meld.requirements.slice(0, 6).map((requirement, index) =>
      `<span class="meld-component-art meld-component-art-${index + 1}"><img src="${escapeHtml(requirement.largeImage || requirement.icon)}" alt=""><strong>${requirement.count.toLocaleString('en-GB')}×</strong></span>`
    ).join('');
    const recipe = meld.requirements.map((requirement) =>
      `<li><img src="${escapeHtml(requirement.icon)}" alt=""><span><strong>${escapeHtml(requirement.name)}</strong><small>${escapeHtml(requirement.rarityName)}</small></span><b>${requirement.count.toLocaleString('en-GB')}×</b></li>`
    ).join('');
    return `<article class="meld-occasion-card rarity-${meld.rarity}">
      <div class="meld-occasion-art" aria-label="Artwork made from the Meld's recipe components"><span class="meld-forge-ring" aria-hidden="true">✦</span>${artwork}</div>
      <div class="meld-occasion-copy">
        <div class="meld-badges"><span class="meld-created-badge"><span aria-hidden="true">⚒</span> Meld forged</span><span class="meld-rarity-badge">${escapeHtml(meld.rarityName)}</span></div>
        <p class="meld-kicker">The components have become something greater</p>
        <h3><a href="/melds/${meld.id}">${escapeHtml(meld.name)}</a></h3>
        <p class="meld-description">A permanent new Meld has joined your collection. Its recipe is complete and its power is now yours.</p>
        <dl class="meld-facts"><div><dt><span aria-hidden="true">◆</span> Rarity</dt><dd>${escapeHtml(meld.rarityName)}</dd></div><div><dt><span aria-hidden="true">⛏</span> Mine family</dt><dd>${escapeHtml(meld.mineTypeName)}</dd></div><div><dt><span aria-hidden="true">◈</span> Components</dt><dd>${meld.componentCount.toLocaleString('en-GB')} things fused</dd></div><div><dt><span aria-hidden="true">✦</span> Recipe</dt><dd>${meld.requirements.length.toLocaleString('en-GB')} distinct things</dd></div></dl>
        <div class="meld-reveal-recipe"><h4><span aria-hidden="true">⚙</span> The completed recipe</h4><ul>${recipe}</ul></div>
        <div class="meld-links"><a class="button" href="/melds/${meld.id}"><span aria-hidden="true">◆</span> Full Meld details</a><a class="button secondary" href="/melds"><span aria-hidden="true">◈</span> Meld collection</a></div>
      </div>
    </article>`;
  }).join('');
  const count = melds.length;
  return `<dialog id="meld-dialog" class="meld-dialog" aria-labelledby="meld-dialog-title" aria-describedby="meld-dialog-intro">
    <div class="meld-dialog-head"><span class="meld-occasion-mark" aria-hidden="true">⚒</span><div><p class="eyebrow">A moment for the chronicles</p><h2 id="meld-dialog-title" tabindex="-1">${count === 1 ? 'A new Meld is born!' : `${count} new Melds are born!`}</h2><p id="meld-dialog-intro">The forge is quiet again. Behold what your collection has become.</p></div></div>
    <div class="meld-reveal-grid">${cards}</div>
    <div class="meld-dialog-foot"><p>Your new ${count === 1 ? 'Meld is' : 'Melds are'} permanent and ready to shape your miner's future.</p><button id="meld-dialog-ack" type="button"><span aria-hidden="true">✦</span> Behold the ${count === 1 ? 'Meld' : 'Melds'}</button></div>
  </dialog><script src="/node/meld-modal.js" defer></script>`;
}

function layout(title, content, player, flash) {
  const isLandingPage = !player && title === 'Home';
  const documentTitle = isLandingPage
    ? 'MineThings 2 · The world digs back'
    : `${escapeHtml(title)} · MineThings`;
  const description = isLandingPage
    ? 'MineThings 2 revives the persistent mining, trading and social experiment that began in 2009. Stake your claim and help write its next chapter.'
    : 'MineThings - collect valuable things in real time and trade with other miners.';
  const preloader = ['home', 'miners', 'mines', 'map', 'shop', 'forums', 'recruit', 'help']
    .map((name) => `<img src="/img/${name}_h.gif" alt="">`).join('');
  const currentPath = player?.currentPath ?? '';
  const isCurrent = (prefixes, exact = false) => prefixes.some((prefix) => exact
    ? currentPath === prefix : currentPath === prefix || currentPath.startsWith(`${prefix}/`));
  const currentAttribute = (prefixes, exact = false) => isCurrent(prefixes, exact)
    ? ' aria-current="page"' : '';
  const topNavigation = `<nav id="navcontainer" aria-label="Primary"><ul id="nav">
    <li class="city-name"><span>${player ? escapeHtml(player.cityName) : 'MineThings'}</span></li>
    <li class="home"><a href="/" aria-label="Home"${currentAttribute(['/'], true)}></a></li>
    <li class="miners"><a href="/miners" aria-label="Miners"${currentAttribute(['/miners'])}></a></li>
    <li class="mines"><a id="markettab" href="/exchange" aria-label="Markets"${currentAttribute(['/exchange', '/market/items', '/market/mines', '/market/factories'])}></a></li>
    <li class="map"><a id="citytab" href="/map" aria-label="Map"${currentAttribute(['/map', '/cities', '/move'])}></a></li>
    <li class="shop"><a href="/market" aria-label="Shop"${currentAttribute(['/market'], true)}></a></li>
    <li class="recruit"><a href="/miners" aria-label="Recruit"></a></li>
    <li class="forums"><a href="/messages" aria-label="Messages"${currentAttribute(['/messages'])}></a></li>
    <li class="help"><a href="/help" aria-label="Help"${currentAttribute(['/help'])}></a></li>
  </ul></nav>`;
  const login = player ? `<div id="login"><div class="logged-in"><strong><a href="/miners/${encodeURIComponent(player.name)}">${escapeHtml(player.name)}</a></strong> | ${formatGold(player.gold)}g | ${player.credits}c | Batteries: ${formatDuration(player.batteryRemaining ?? 0)}</div><form method="post" action="/logout"><button class="image-button" aria-label="Log out"><img src="/img/button_logout.jpg" alt="Log out"></button></form></div>`
    : '<div id="login"><span class="register">Not a member? Register below.</span></div>';
  const sideLink = (href, label, prefixes = [href], exact = false) => {
    const active = isCurrent(prefixes, exact);
    return `<li${active ? ' class="current"' : ''}><a href="${href}"${active ? ' aria-current="page"' : ''}>${label}</a></li>`;
  };
  const sideNavigation = player ? `<nav id="left" aria-label="Player"><ul id="navlist">
    ${sideLink('/', 'Mines', ['/'], true)}${sideLink('/inventory', 'Things', ['/inventory', '/items'])}
    ${sideLink('/dwarves', 'Dwarves')}${sideLink('/gadgets', 'Gadgets')}${sideLink('/melds', 'Melds')}${sideLink('/vehicles', 'Vehicles')}${sideLink('/ratings', 'Ratings')}${sideLink('/containers', 'Containers')}
    ${sideLink('/oil-field', 'Oil Field')}${sideLink('/events', 'World Events')}${sideLink('/factories', 'Factories')}${sideLink('/professions', 'Specialisation')}
    ${sideLink('/chat', 'Chat')}${sideLink('/messages', `Messages${player.unreadMessages ? ` (${player.unreadMessages})` : ''}`)}
    ${sideLink('/stats', 'Server Stats')}${sideLink('/credits', 'Buy credits')}${player.authority > 0 ? sideLink('/admin', 'Administration') : ''}
    ${sideLink(`/miners/${encodeURIComponent(player.name)}`, 'Profile', ['/miners'])}${sideLink('/account', 'Account')}
  </ul></nav>` : '';
  const flashDialog = `<div id="flash-dialog" class="flash-notice" role="status" aria-live="polite" hidden><span class="flash-notice-mark" aria-hidden="true">✓</span><p id="flash-dialog-message">${flash ? escapeHtml(flash) : ''}</p><button type="button" aria-label="Dismiss notification">×</button></div><script src="/node/flash-modal.js?v=20260823a" defer></script>`;
  const findingDialog = player ? '<dialog id="finding-dialog" class="finding-dialog" aria-labelledby="finding-dialog-title" aria-describedby="finding-dialog-intro finding-dialog-status" data-poll-min-interval="' + player.findingPollMinIntervalMs + '" data-poll-empty-interval="' + player.findingPollEmptyIntervalMs + '" data-poll-max-interval="' + player.findingPollMaxIntervalMs + '"><div class="finding-dialog-head"><span class="finding-occasion-mark" aria-hidden="true">✦</span><div><p id="finding-dialog-eyebrow" class="eyebrow">Mining report</p><h2 id="finding-dialog-title" tabindex="-1">New things found</h2><p id="finding-dialog-intro">Your latest finds are ready to review.</p></div></div><div id="finding-dialog-cards" class="finding-grid"></div><div class="finding-dialog-foot"><p id="finding-dialog-status" class="muted">Your discoveries are safe until you acknowledge them.</p><button id="finding-dialog-ack" type="button"><span aria-hidden="true">⛏</span> Keep digging</button></div></dialog><script src="/node/finding-queue.js?v=20260823a" defer></script>' : '';
  const quietNotice = player?.quietNotice
    ? `<p class="quiet-notice" role="status"><span aria-hidden="true">✓</span> ${escapeHtml(player.quietNotice)}</p>` : '';
  const meldDialog = meldRevealHtml(player?.meldReveal);
  const liveRevision = typeof player?.liveUpdateRevision === 'function'
    ? player.liveUpdateRevision() : Number(player?.liveUpdateRevision ?? 0);
  const liveUpdates = player
    ? `<script src="/node/live-updates.js?v=20260823b" data-live-revision="${Number(liveRevision)}" defer></script>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${description}"><meta name="theme-color" content="${isLandingPage ? '#0b0d0c' : '#5e5a57'}"><title>${documentTitle}</title><link rel="icon" href="/img/favicon.ico"><link rel="stylesheet" href="/css/styles10.css"><link rel="stylesheet" href="/app.css?v=20260823i"></head><body${isLandingPage ? ' class="landing-body"' : ''}><a class="skip-link" href="#content">Skip to game content</a><div id="preloader">${preloader}</div><div id="wrapper" class="node-wrapper${isLandingPage ? ' landing-shell' : ''}"><header class="game-header"><a id="logo" href="/" aria-label="MineThings home"></a>${login}</header>${topNavigation}<div id="divwrapper" class="node-content-wrap${player ? '' : ' guest-content'}">${sideNavigation}<main id="content" tabindex="-1">${quietNotice}${content}</main></div><footer><p>© 4024 MineThings.com · Node.js + SQLite revival · <a href="/history">History</a> · <a href="/legal">Legal</a></p></footer></div>${flashDialog}${findingDialog}${meldDialog}${liveUpdates}</body></html>`;
}

function itemCard(item, countOrOptions = null, legacyAction = '') {
  if (!item || typeof item.rarityName !== 'string') {
    throw new Error(`Missing indexed catalog item data: ${item?.id ?? 'unknown'}.`);
  }
  const options = countOrOptions && typeof countOrOptions === 'object'
    ? countOrOptions : { count: countOrOptions, action: legacyAction };
  const count = options.count ?? null;
  const metadata = [item.rarityName];
  if (options.showFixedValue !== false && Number.isFinite(item.goldValue)) metadata.push(`${formatGold(item.goldValue)}g fixed value`);
  if (count !== null) metadata.push(`${count} ${options.countLabel ?? 'owned'}`);
  if (options.meta) metadata.push(...(Array.isArray(options.meta) ? options.meta : [options.meta]));
  const classes = [
    'item', `rarity-${item.rarity}`, 'item-card',
    options.compact ? 'item-card-compact' : '',
    options.featured ? 'item-card-featured' : '',
    options.unavailable ? 'item-card-unavailable' : '',
    item.damaged || item.repairedItemId !== null ? 'item-card-damaged' : '',
    options.className ?? ''
  ].filter(Boolean).join(' ');
  const image = options.image ?? item.icon;
  const href = options.href ?? `/items/${item.id}`;
  const description = options.description
    ? `<p class="item-card-description">${escapeHtml(options.description)}</p>` : '';
  const details = options.details ? `<div class="item-card-details">${options.details}</div>` : '';
  const action = options.action ? `<div class="item-card-actions">${options.action}</div>` : '';
  return `<article class="${classes}" data-item-id="${item.id}" data-rarity="${item.rarity}">
    <a class="item-card-link" href="${escapeHtml(href)}" aria-label="View ${escapeHtml(item.name)} details">
      <span class="item-card-art"><img src="${image}" alt="${escapeHtml(item.name)}"></span>
      <span class="item-card-copy"><strong>${escapeHtml(item.name)}</strong><small>${metadata.map(escapeHtml).join(' · ')}</small>${description}</span>
    </a>${details}${action}
  </article>`;
}

function compareItemsByRarity(first, second) {
  return Number(second?.rarity ?? -1) - Number(first?.rarity ?? -1)
    || String(first?.name ?? '').localeCompare(String(second?.name ?? ''))
    || Number(first?.id ?? 0) - Number(second?.id ?? 0);
}

function itemMarketType(item, catalog) {
  const labels = catalog.settings.item_type_labels;
  const intact = item.repairedItemId ? catalog.byId.get(item.repairedItemId) : item;
  if (!intact || !labels || typeof labels !== 'object') throw new Error('Missing item market type data.');
  const vehicle = catalog.vehicleByItemId.get(intact.id);
  if (vehicle) {
    const key = vehicle.routeType === catalogRoleId(catalog, 'route_type_ids', 'land') ? 'landVehicle'
      : vehicle.routeType === catalogRoleId(catalog, 'route_type_ids', 'sea') ? 'ship' : 'aircraft';
    return { key, label: labels[key] };
  }
  const machine = catalog.machineByItemId.get(intact.id);
  if (machine) {
    const key = machine.rules.isBomb ? 'oilFieldBomb' : 'oilFieldMachine';
    return { key, label: labels[key] };
  }
  const matches = [
    ['weapon', catalog.weaponByItemId], ['vehicleModification', catalog.modByItemId],
    ['cannon', catalog.cannonByItemId], ['ammunitionCrate', catalog.cannonballByItemId],
    ['aircraftBomb', catalog.bombByItemId], ['ammunitionBox', catalog.boxByItemId],
    ['miningEquipment', catalog.equipmentByItemId], ['explosive', catalog.explosiveByItemId],
    ['minerRobot', catalog.robotByItemId], ['dwarfMiner', catalog.dwarfByItemId],
    ['gadget', catalog.gadgetItemByItemId], ['avatarElement', catalog.avatarElementByItemId]
  ];
  const match = matches.find(([, index]) => index.has(intact.id));
  const key = match?.[0] ?? 'collectible';
  return { key, label: labels[key] };
}

function signedStat(value) {
  const number = Number(value);
  const rounded = Math.round((number + Number.EPSILON) * 1000) / 1000;
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

function cleanLegacyText(value) {
  return String(value ?? '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function itemDetailStatGroups(item, catalog, player = null) {
  const itemTypeLabels = catalog.settings.item_type_labels;
  if (!itemTypeLabels || typeof itemTypeLabels !== 'object' || Array.isArray(itemTypeLabels)) {
    throw new Error('Missing catalog setting: item_type_labels.');
  }
  const itemTypeLabel = (key) => {
    const value = itemTypeLabels[key];
    if (typeof value !== 'string' || !value) {
      throw new Error(`Missing catalog item-type label: ${key}.`);
    }
    return value;
  };
  const intactItem = item.repairedItemId ? catalog.byId.get(item.repairedItemId) : item;
  if (!intactItem) throw new Error(`Missing intact catalog item: ${item.repairedItemId}.`);
  const statItem = intactItem;
  const damagedItem = item.repairedItemId
    ? item : catalog.items.find((candidate) => candidate.repairedItemId === item.id);
  const vehicle = catalog.vehicleByItemId.get(statItem.id);
  const weapon = catalog.weaponByItemId.get(statItem.id);
  const mod = catalog.modByItemId.get(statItem.id);
  const cannon = catalog.cannonByItemId.get(statItem.id);
  const cannonball = catalog.cannonballByItemId.get(statItem.id);
  const bomb = catalog.bombByItemId.get(statItem.id);
  const box = catalog.boxByItemId.get(statItem.id);
  const equipment = catalog.equipmentByItemId.get(statItem.id);
  const explosive = catalog.explosiveByItemId.get(statItem.id);
  const robot = catalog.robotByItemId.get(statItem.id);
  const dwarf = catalog.dwarfByItemId.get(statItem.id);
  const gadgetItem = catalog.gadgetItemByItemId.get(statItem.id);
  const machine = catalog.machineByItemId.get(statItem.id);
  const avatarElement = catalog.avatarElementByItemId.get(statItem.id);
  const machineInfo = machine ? machineDescription(
    catalog.machineTypeById.get(machine.machineTypeId), item.rarity, catalog.settings
  ) : null;
  const itemTypes = [];
  if (vehicle) {
    const landRouteType = catalogRoleId(catalog, 'route_type_ids', 'land');
    const seaRouteType = catalogRoleId(catalog, 'route_type_ids', 'sea');
    const airRouteType = catalogRoleId(catalog, 'route_type_ids', 'air');
    const vehicleTypeKey = vehicle.routeType === landRouteType ? 'landVehicle'
      : vehicle.routeType === seaRouteType ? 'ship'
        : vehicle.routeType === airRouteType ? 'aircraft' : null;
    if (!vehicleTypeKey) throw new Error(`Missing vehicle route-type mapping: ${vehicle.routeType}.`);
    itemTypes.push(itemTypeLabel(vehicleTypeKey));
  }
  if (weapon) itemTypes.push(itemTypeLabel('weapon'));
  if (mod) itemTypes.push(itemTypeLabel('vehicleModification'));
  if (cannon) itemTypes.push(itemTypeLabel('cannon'));
  if (cannonball) itemTypes.push(itemTypeLabel('ammunitionCrate'));
  if (bomb) itemTypes.push(itemTypeLabel('aircraftBomb'));
  if (box) itemTypes.push(itemTypeLabel('ammunitionBox'));
  if (equipment) itemTypes.push(itemTypeLabel('miningEquipment'));
  if (explosive) itemTypes.push(itemTypeLabel('explosive'));
  if (robot) itemTypes.push(itemTypeLabel('minerRobot'));
  if (dwarf) itemTypes.push(itemTypeLabel('dwarfMiner'));
  if (gadgetItem) itemTypes.push(itemTypeLabel('gadget'));
  if (machine) itemTypes.push(itemTypeLabel(
    machine.rules.isBomb ? 'oilFieldBomb' : 'oilFieldMachine'
  ));
  if (avatarElement) itemTypes.push(itemTypeLabel('avatarElement'));
  if (!itemTypes.length) itemTypes.push(itemTypeLabel('collectible'));

  const mineType = catalogMineTypeForId(catalog, item.mineTypeId);
  const originCities = catalog.cityMineTypes
    .filter((entry) => entry.mineTypeId === item.mineTypeId)
    .map((entry) => catalogCityForId(catalog, entry.cityId).name);
  const coreRows = [
    { label: 'Rarity', value: catalogRarityName(catalog, item.rarity) },
    { label: 'Item type', value: itemTypes.join(' · ') },
    { label: 'Mine category', value: mineType.name },
    { label: 'Condition', value: item.repairedItemId ? 'Damaged' : 'Intact' },
    { label: 'Discoverable', value: item.canFind ? 'Yes' : 'No' },
    { label: 'Base gold value', value: `${formatGold(item.goldValue)}g` },
    { label: 'Origin cities', value: originCities.length ? originCities.join(', ') : 'No fixed origin' },
    { label: 'Marketable', value: 'Yes' }
  ];
  if (item.repairedItemId && intactItem) {
    coreRows.push({ label: 'Intact counterpart', html: `<a href="/items/${intactItem.id}">${escapeHtml(intactItem.name)}</a>` });
  } else if (damagedItem) {
    coreRows.push({ label: 'Damaged counterpart', html: `<a href="/items/${damagedItem.id}">${escapeHtml(damagedItem.name)}</a>` });
  }

  const gameplayRows = [];
  if (vehicle) {
    gameplayRows.push(
      { label: 'Route type', value: catalogLabel(catalog, 'route_type', vehicle.routeType) },
      { label: 'Speed', value: vehicle.speed },
      { label: 'Capacity', value: vehicle.capacity }
    );
    if (vehicle.land) gameplayRows.push(
      { label: 'Attack', value: vehicle.land.attack },
      { label: 'Armor', value: vehicle.land.armor }
    );
    if (vehicle.ship) gameplayRows.push(
      { label: 'Cannon ports', value: vehicle.ship.cannonPortals },
      { label: 'Hull', value: vehicle.ship.hull },
      { label: 'Crew', value: vehicle.ship.crew }
    );
    if (vehicle.aircraft) gameplayRows.push(
      { label: 'Aircraft role', value: catalogLabel(catalog, 'aircraft_role', vehicle.aircraft.type) }
    );
  }
  if (weapon) gameplayRows.push(
    { label: 'Offense', value: weapon.offense }, { label: 'Defense', value: weapon.defense }
  );
  if (mod) gameplayRows.push(
    { label: 'Capacity modifier', value: signedStat(mod.capacity) },
    { label: 'Attack modifier', value: signedStat(mod.attack) },
    { label: 'Armor modifier', value: signedStat(mod.armor) },
    { label: 'Offense modifier', value: signedStat(mod.offense) },
    { label: 'Defense modifier', value: signedStat(mod.defense) },
    { label: 'Dodge modifier', value: signedStat(mod.dodge) }
  );
  if (cannon) gameplayRows.push(
    { label: 'Damage', value: cannon.damage }, { label: 'Rate of fire', value: cannon.rateOfFire }
  );
  if (cannonball) gameplayRows.push(
    { label: 'Ammunition type', value: catalogLabel(catalog, 'ammunition_type', cannonball.type) },
    { label: 'Shots per crate', value: catalog.settings.shots_per_crate }
  );
  if (bomb) {
    gameplayRows.push({ label: 'Bomb damage', value: `${Number(bomb.buckets).toLocaleString('en-GB')} buckets` });
    if (bomb.description) gameplayRows.push({ label: 'Bomb effect', value: cleanLegacyText(bomb.description) });
  }
  if (box) gameplayRows.push(
    { label: 'Ammunition type', value: catalogLabel(catalog, 'ammunition_type', box.type) },
    { label: 'Crates per box', value: catalog.settings.ammo_box_crates },
    { label: 'Shots per box', value: catalog.settings.ammo_box_crates * catalog.settings.shots_per_crate }
  );
  if (equipment) gameplayRows.push(
    { label: 'Equipment slot', value: catalogEquipmentTypeForId(catalog, equipment.typeId).name },
    { label: 'Mining-rate bonus', value: `+${equipment.bucketsPerHour} buckets/hour` }
  );
  if (explosive) gameplayRows.push(
    { label: 'Explosive power', value: `${Number(explosive.buckets).toLocaleString('en-GB')} buckets` }
  );
  if (robot) gameplayRows.push(
    { label: 'Robot model', value: `MR${robot.model}` },
    { label: 'Damaged-find chance', value: `${formatGold(robot.model
      * Number(catalog.settings.robot_damaged_chance_per_model) * 100)}% per result` }
  );
  if (dwarf) {
    const range = {
      minimum: dwarf.minimumFindRarity,
      maximum: dwarf.maximumFindRarity
    };
    const findQuality = range.minimum === range.maximum
      ? catalog.rarityNames[range.maximum]
      : `${catalog.rarityNames[range.maximum]} to ${catalog.rarityNames[range.minimum]}`;
    gameplayRows.push(
      { label: 'Find interval', value: `Randomly within ${formatDuration(Number(catalog.settings.dwarf_find_max_delay_ms))}` },
      { label: 'Find quality', value: findQuality },
      { label: 'Disappearance risk', value: `${dwarf.disappearanceChance * 100}% after each find` },
      { label: 'Working location', value: 'The city where this Dwarf is stored' },
      { label: 'Stowaway rule', value: 'May board a compatible land or sea vehicle of a matching combat class' }
    );
  }
  if (gadgetItem?.gadget) {
    const gadget = gadgetItem.gadget;
    const gadgetBonuses = catalog.settings.gadget_primary_bonuses;
    if (!gadgetBonuses || typeof gadgetBonuses !== 'object' || Array.isArray(gadgetBonuses)) {
      throw new Error('Invalid catalog setting: gadget_primary_bonuses.');
    }
    gameplayRows.push(
      { label: 'Gadget type', value: gadget.displayName },
      { label: 'Lifespan', value:
        `${catalogArrayNumber(catalog.settings, 'gadget_lifespan_days', item.rarity)} days` },
      { label: 'Effect', value: cleanLegacyText(gadget.description) }
    );
    if (gadgetBonuses[gadget.behaviorKey]) gameplayRows.push({
      label: 'Primary bonus', value: gadgetBonuses[gadget.behaviorKey]
    });
  }
  if (machine && machineInfo) gameplayRows.push(
    { label: 'Machine type', value: catalog.machineTypeById.get(machine.machineTypeId).name },
    { label: 'Power (P)', value: `${machineInfo.power} kW` },
    { label: 'Lifespan', value: `${formatGold(machineInfo.lifeDays)} days` }
  );
  if (avatarElement) {
    const elementType = catalog.avatarElementTypeById.get(avatarElement.typeId);
    if (!elementType) throw new Error(`Missing avatar element type: ${avatarElement.typeId}.`);
    gameplayRows.push(
      { label: 'Avatar element type', value: elementType.name },
      { label: 'Gender compatibility', value: catalogLabel(catalog, 'avatar_gender', avatarElement.gender) },
      { label: 'Inventory rule', value: 'Does not count toward inventory while used in an avatar' }
    );
    if (avatarElement.typeId === Number(catalog.settings.avatar_background_type_id)) gameplayRows.push(
      { label: 'Background inventory bonus', value:
        `+${Number(catalog.settings.avatar_capacity_base_bonus)
          + Number(catalog.settings.avatar_capacity_per_rarity) * item.rarity} inventory spaces when used` }
    );
  }

  const groups = [{ title: 'Core item stats', rows: coreRows }];
  if (gameplayRows.length) groups.push({ title: 'Gameplay stats', rows: gameplayRows });
  if (player) {
    const inventoryByCity = player.inventoryByCity ?? { [player.cityId]: player.inventory ?? {} };
    const stored = catalog.cities.map((city) => ({
      city, quantity: Number(inventoryByCity[city.id]?.[item.id] ?? 0)
    }));
    const current = stored.find((entry) => entry.city.id === player.cityId);
    if (!current) throw new Error(`Missing catalog city: ${player.cityId}.`);
    const total = stored.reduce((sum, entry) => sum + entry.quantity, 0);
    const locationRows = [
      { label: 'Stored total', value: total },
      { label: `Stored in ${current.city.name}`, value: current.quantity },
      ...stored.filter((entry) => entry.city.id !== player.cityId && entry.quantity > 0)
        .map((entry) => ({ label: `Stored in ${entry.city.name}`, value: entry.quantity }))
    ];
    groups.push({ title: 'Your stored inventory', rows: locationRows });
  }
  return groups;
}

function itemDetailStats(item, catalog, player = null) {
  const groups = itemDetailStatGroups(item, catalog, player).map((group) => {
    const rows = group.rows.map((row) => `<div><dt>${escapeHtml(row.label)}</dt><dd>${row.html ?? escapeHtml(row.value)}</dd></div>`).join('');
    return `<section class="item-stat-section"><h3>${escapeHtml(group.title)}</h3><dl class="item-stat-grid">${rows}</dl></section>`;
  }).join('');
  return `<section class="item-stats" aria-labelledby="item-stats-heading"><h2 id="item-stats-heading">Item stats</h2>${groups}</section>`;
}

function compareCatalogEntriesByRarity(catalog, itemId = (entry) => entry.itemId) {
  return (first, second) => compareItemsByRarity(
    catalog.byId.get(Number(itemId(first))), catalog.byId.get(Number(itemId(second)))
  );
}

function findingCards(finds, catalog, metadata = {}) {
  const grouped = new Map();
  for (const find of finds ?? []) {
    const item = catalog.byId.get(Number(find.itemId));
    if (!item) throw new Error(`Missing catalog item: ${find.itemId}.`);
    const count = Number(find.count ?? 1);
    const cityId = find.cityId ?? metadata.cityId ?? null;
    const cityName = cityId === null
      ? (metadata.cityName ?? catalogSettingString(catalog, 'location_labels', 'atSea'))
      : catalogCityForId(catalog, cityId).name;
    const foundAt = find.foundAt ?? metadata.foundAt ?? null;
    const sourceKey = find.source ?? metadata.source
      ?? (find.dwarfed ? 'dwarf' : find.exploded ? 'explosives' : 'mine');
    const source = catalog.settings.finding_source_names?.[sourceKey];
    if (typeof source !== 'string') throw new Error(`Missing finding source name: ${sourceKey}.`);
    const moment = metadata.groupByMoment ? foundAt : '';
    const key = `${item.id}:${cityId ?? ""}:${source}:${moment ?? ""}`;
    const entry = grouped.get(key) ?? {
      item, count: 0, recycled: 0, cityName, foundAt, source
    };
    entry.count += count;
    if (find.recycled) entry.recycled += count;
    grouped.set(key, entry);
  }
  return [...grouped.values()]
    .sort((first, second) => compareItemsByRarity(first.item, second.item)
      || Number(second.foundAt ?? 0) - Number(first.foundAt ?? 0))
    .map((entry) => {
      const description = entry.item.description;
      const quantity = entry.count > 1 ? `${entry.count} found` : '1 found';
      const recycling = entry.recycled === entry.count ? ' · auto-recycled'
        : entry.recycled ? ` · ${entry.recycled} auto-recycled` : '';
      const timestamp = entry.foundAt === null ? '' : `<time datetime="${new Date(entry.foundAt).toISOString()}">${escapeHtml(new Date(entry.foundAt).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" }))}</time>`;
      const details = `<dl class="discovery-item-card-meta"><div><dt>Source</dt><dd>${escapeHtml(entry.source)}</dd></div><div><dt>City</dt><dd>${escapeHtml(entry.cityName)}</dd></div><div><dt>Result</dt><dd>${quantity}${recycling}</dd></div>${timestamp ? `<div><dt>Found</dt><dd>${timestamp}</dd></div>` : ''}</dl>`;
      return itemCard(entry.item, {
        featured: true,
        className: 'discovery-item-card',
        meta: `${entry.source} discovery`,
        description,
        details
      });
    }).join('');
}

function findingQueueHtml(findings, catalog) {
  const sourceNames = catalogObjectSetting(catalog, 'finding_source_names');
  const sourceIcons = {
    mine: '⛏',
    'new-mine': '✦',
    explosives: '✹',
    dwarf: '◆',
    fishing: '◉',
    salvage: '⚓'
  };
  return findings.map((finding) => {
    const item = catalog.byId.get(Number(finding.itemId));
    if (!item) throw new Error(`Missing catalog item: ${finding.itemId}.`);
    const source = sourceNames[finding.source];
    if (typeof source !== 'string') throw new Error(`Missing finding source name: ${finding.source}.`);
    const sourceIcon = sourceIcons[finding.source];
    if (typeof sourceIcon !== 'string') throw new Error(`Missing finding source icon: ${finding.source}.`);
    const mineType = catalogMineTypeForId(catalog, item.mineTypeId);
    const quantity = Number(finding.quantity);
    const status = finding.autoRecycled ? 'Automatically recycled into Ore scraps' : 'Stored in your city inventory';
    const totalValue = item.goldValue * quantity;
    const foundAt = new Date(finding.foundAt);
    return `<article class="finding-occasion-card discovery-item-card rarity-${item.rarity}" data-item-id="${item.id}" data-rarity="${item.rarity}" data-finding-source="${escapeHtml(finding.source)}">
      <div class="finding-occasion-art">
        <span class="finding-rarity-burst" aria-hidden="true"></span>
        <img src="${escapeHtml(item.largeImage)}" alt="${escapeHtml(item.name)}">
        <span class="finding-quantity" aria-label="Quantity ${quantity.toLocaleString('en-GB')}">×${quantity.toLocaleString('en-GB')}</span>
      </div>
      <div class="finding-occasion-copy">
        <div class="finding-badges"><span class="finding-source-badge"><span class="finding-source-icon" aria-hidden="true">${sourceIcon}</span>${escapeHtml(source)}</span><span class="finding-rarity-badge"><span aria-hidden="true">★</span>${escapeHtml(item.rarityName)}</span></div>
        <p class="finding-kicker">You discovered</p>
        <h3><a href="/items/${item.id}">${escapeHtml(item.name)}</a></h3>
        <p class="finding-description">${escapeHtml(item.description)}</p>
        <dl class="finding-facts">
          <div><dt><span aria-hidden="true">${sourceIcon}</span> Source</dt><dd>${escapeHtml(source)}</dd></div>
          <div><dt><span aria-hidden="true">⌖</span> Location</dt><dd>${escapeHtml(finding.cityName)}</dd></div>
          <div><dt><span aria-hidden="true">◆</span> Rarity</dt><dd>${escapeHtml(item.rarityName)}</dd></div>
          <div><dt><span aria-hidden="true">▦</span> Category</dt><dd>${escapeHtml(mineType.name)} Mine</dd></div>
          <div><dt><span aria-hidden="true">×</span> Quantity</dt><dd>${quantity.toLocaleString('en-GB')}</dd></div>
          <div><dt><span aria-hidden="true">✓</span> Status</dt><dd>${status}</dd></div>
          <div><dt><span aria-hidden="true">●</span> Fixed value</dt><dd>${formatGold(item.goldValue)}g each · ${formatGold(totalValue)}g total</dd></div>
          <div><dt><span aria-hidden="true">◷</span> Found</dt><dd><time datetime="${foundAt.toISOString()}">${escapeHtml(foundAt.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }))}</time></dd></div>
        </dl>
        <nav class="finding-links" aria-label="Actions for ${escapeHtml(item.name)}">
          <a class="button" href="/items/${item.id}"><span aria-hidden="true">⌕</span> Full item details</a>
          <a class="button secondary" href="/inventory"><span aria-hidden="true">▣</span> View inventory</a>
          <a class="button secondary" href="/market/items/${item.id}"><span aria-hidden="true">⇄</span> Open market</a>
        </nav>
      </div>
    </article>`;
  }).join('');
}

export function describeFinds(finds, catalog) {
  const grouped = new Map();
  for (const find of finds) {
    const entry = grouped.get(find.itemId)
      ?? { itemId: find.itemId, item: catalog.byId.get(find.itemId), count: 0, recycled: 0 };
    const count = Number(find.count ?? 1);
    entry.count += count;
    if (find.recycled) entry.recycled += count;
    grouped.set(find.itemId, entry);
  }
  const labels = [...grouped.values()].sort((first, second) =>
    compareItemsByRarity(first.item, second.item)).map((entry) => {
    const quantity = entry.count > 1 ? `${entry.count}× ` : '';
    const recycled = entry.recycled === entry.count ? ' (auto-recycled)' : '';
    if (!entry.item) throw new Error(`Missing catalog item: ${entry.itemId}.`);
    return `${quantity}${entry.item.name}${recycled}`;
  });
  if (labels.length < 2) return labels[0] ?? 'nothing';
  return `${labels.slice(0, -1).join(', ')} and ${labels.at(-1)}`;
}

function equipmentBot(mine, catalog, compact = false) {
  const layers = [`<img src="/img/equipment/src/Bot.png" alt="Miner bot with equipment">`];
  for (const { id: typeId, name: typeName } of catalog.equipmentTypes) {
    const equipment = catalog.equipmentByItemId.get(Number(mine.equipment?.[typeId]));
    const adjective = equipment ? catalog.equipmentRarityAdjectives[equipment.rarity] : 'No';
    const filename = encodeURIComponent(`${adjective}${typeName}.png`);
    layers.push(`<img src="/img/equipment/src/${filename}" alt="" aria-hidden="true">`);
  }
  const robot = catalog.robotByItemId.get(mine.robotItemId);
  if (robot && robot.model >= 3 && robot.model <= 20) {
    layers.push(`<img src="/img/equipment/src/MR${robot.model}.png" alt="" aria-hidden="true">`);
  }
  return `<div class="equipment-bot${compact ? ' compact' : ''}">${layers.join('')}</div>`;
}

function avatarStack(layers, label = 'Profile avatar') {
  if (!layers?.length) return '<div class="avatar-empty">No avatar</div>';
  return `<div class="avatar-stack" role="img" aria-label="${escapeHtml(label)}">${layers
    .sort((a, b) => a.typeId - b.typeId)
    .map((layer) => `<img src="/img/avatars/src/${encodeURIComponent(layer.filename)}" alt="" aria-hidden="true">`).join('')}</div>`;
}

function landingPage(catalog) {
  const nameMinimum = Number(catalog.settings.miner_name_min_length);
  const nameMaximum = Number(catalog.settings.miner_name_max_length);
  const passwordMinimum = Number(catalog.settings.password_min_length);
  return `<div class="rebirth-landing">
    <header class="landing-masthead">
      <a class="landing-wordmark" href="/" aria-label="MineThings 2 home"><span class="landing-mark" aria-hidden="true"></span><span><strong>Mine Things</strong><small>Second life · same strange world</small></span><b aria-hidden="true">2</b></a>
      <nav class="landing-nav" aria-label="Welcome"><a href="/history">Our history</a><a href="#returning-miner">Log in</a><a class="landing-nav-cta" href="#join">Stake your claim</a></nav>
    </header>

    <section class="landing-hero" aria-labelledby="landing-title">
      <div class="landing-hero-inner">
        <p class="landing-era" aria-label="MineThings: 2009 to 2020 to reborn"><span>2009</span><i aria-hidden="true"></i><span>2020</span><i aria-hidden="true"></i><strong>Reborn</strong></p>
        <p class="landing-kicker">The original persistent economy // rebuilt</p>
        <h1 id="landing-title"><span>From the ashes</span><span class="landing-title-echo">of the ashes of Yellowstone</span><span class="landing-title-return">comes <strong>MineThings <em>2</em>.</strong></span></h1>
        <p class="landing-lead">Yellowstone buried one civilisation. Time buried one of the web’s strangest games. We dug it up twice.</p>
        <p class="landing-deck">The slow-burn economic and social experiment that began in 2009 is back—restored, expanded and alive.</p>
        <div class="landing-hero-actions"><a class="landing-button landing-button-primary" href="#join">Stake your claim <span aria-hidden="true">→</span></a><a class="landing-history-link" href="/history">Become part of internet history <span aria-hidden="true">↗</span></a></div>
      </div>
      <p class="landing-field-note"><span>World status</span><strong>Online after a six-year silence</strong></p>
    </section>

    <section class="landing-manifesto" aria-label="What makes MineThings different">
      <article><span>01</span><div><h2>The mines never sleep.</h2><p>The buried world keeps producing while you are away.</p></div></article>
      <article><span>02</span><div><h2>The market remembers.</h2><p>Things exist somewhere. Scarcity, distance and player prices matter.</p></div></article>
      <article><span>03</span><div><h2>The world has teeth.</h2><p>Travel armed. Weather, pirates, ghosts and creatures share the routes.</p></div></article>
    </section>

    <section class="landing-origin" aria-labelledby="landing-origin-title">
      <div class="landing-origin-copy">
        <p class="landing-section-label">A web original, unearthed</p>
        <h2 id="landing-origin-title">Not a reboot with the serial numbers filed off.</h2>
        <p>The original MineThings survived in code, catalogues, player guides, userscripts and the memories of the people who inhabited it. This restoration carries that machinery forward—and finally has the tools to push the experiment somewhere new.</p>
        <ol class="landing-timeline">
          <li><time datetime="2009">2009</time><span><strong>The experiment begins.</strong> A persistent world of mines, local markets and player-made value appears on the web.</span></li>
          <li><time datetime="2020">2020</time><span><strong>The machinery stops.</strong> The original service closes, but its codebase and community memory survive.</span></li>
          <li class="is-now"><time datetime="2026">Now</time><span><strong>The world digs back.</strong> Old systems return. Maps connect. Events unfold live. The next chapter belongs to its players.</span></li>
        </ol>
        <a class="landing-text-link" href="/history">Read the whole improbable history <span aria-hidden="true">→</span></a>
      </div>
      <figure class="landing-archive-card"><div><img src="/img/home_bg.jpg" alt="Original MineThings artwork reading ‘It’s the year 4024. Stake your claim.’"><span>Archive signal // recovered</span></div><figcaption>The invitation that started it all—preserved from the original game.</figcaption></figure>
    </section>

    <section class="landing-world" aria-labelledby="landing-world-title">
      <header><p class="landing-section-label">Geography is gameplay</p><h2 id="landing-world-title">One world. Many cities. No universal price.</h2><p>Mine where the things are. Trade where they are scarce. Fit a vehicle or ship, load the cargo and cross routes that can be profitable, dangerous—or both.</p></header>
      <div class="landing-map-frame"><img src="/node/map-background.png" alt="Illustrated MineThings map showing the connected cities of Burgundy, Belfort, Tzolk’in, Kemet and San Juan"><p><span>Live world map</span><strong>Distance creates opportunity.</strong></p></div>
      <ul class="landing-world-principles"><li><strong>Dig weird.</strong><span>Thousands of things, from useful machinery to glorious nonsense.</span></li><li><strong>Trade smart.</strong><span>Player markets turn location and rarity into a living economy.</span></li><li><strong>Travel prepared.</strong><span>Customise transports, carry cargo and survive what waits between cities.</span></li><li><strong>Change the story.</strong><span>Factories, professions, chat and world events make every miner consequential.</span></li></ul>
    </section>

    <section id="join" class="landing-join" aria-labelledby="landing-join-title">
      <header class="landing-join-intro"><p class="landing-section-label">The next chapter needs miners</p><h2 id="landing-join-title">Stake a claim in internet history.</h2><p>Choose a name, verify your email and start digging. The mine is automatic. What you do with what comes out of it is entirely human.</p><ul><li>Persistent mining</li><li>Player-run markets</li><li>Connected worlds</li><li>Live events</li></ul></header>
      <div class="landing-auth-grid">
        <form class="landing-auth-card landing-register-card" method="post" action="/register" aria-labelledby="landing-register-title">
          <p class="landing-card-label"><span>01</span> New miner</p><h3 id="landing-register-title">Enter the world</h3><p>Your name will be part of the economy—and perhaps its history.</p>
          <label><span>Miner name</span><input name="name" minlength="${nameMinimum}" maxlength="${nameMaximum}" pattern="[\\p{L}\\p{M}\\p{N}\\p{P}\\p{S} ]+" autocomplete="username" aria-describedby="miner-name-help" required></label><small id="miner-name-help">${nameMinimum}–${nameMaximum} characters. Unicode names are welcome.</small>
          <label><span>Email</span><input type="email" name="email" maxlength="${Number(catalog.settings.email_max_length)}" autocomplete="email" aria-describedby="miner-email-help" required></label><small id="miner-email-help">Verification is mandatory. Your mine remains locked until you confirm this address.</small>
          <label><span>Password</span><input type="password" name="password" minlength="${passwordMinimum}" autocomplete="new-password" required></label>
          <label class="check-row"><input type="checkbox" name="acceptTerms" value="1" required><span>I accept the <a href="/legal" target="_blank" rel="noopener">Terms and Privacy Notice</a> (version ${LEGAL_VERSION}).</span></label>
          <button class="landing-submit">Create my miner <span aria-hidden="true">→</span></button>
        </form>
        <form id="returning-miner" class="landing-auth-card landing-login-card" method="post" action="/login" aria-labelledby="landing-login-title">
          <p class="landing-card-label"><span>02</span> Returning miner</p><h3 id="landing-login-title">The mine kept working.</h3><p>Come back and see what surfaced while you were gone.</p>
          <label><span>Miner name</span><input name="name" autocomplete="username" required></label>
          <label><span>Password</span><input type="password" name="password" autocomplete="current-password" required></label>
          <button class="landing-submit">Return to my mine <span aria-hidden="true">→</span></button>
          <p class="landing-login-note">No daily streaks. No energy panic. MineThings was built for patient obsession.</p>
        </form>
      </div>
    </section>
  </div>`;
}

function emailVerificationPage(player, status, developmentUrl, currentTime) {
  const sent = status?.sentAt
    ? `<p class="verification-sent">A verification email was sent on ${new Date(status.sentAt).toLocaleString('en-GB')}.</p>`
    : status?.deliveryError
      ? '<p class="capacity-warning">The last delivery failed. You can try again below.</p>' : '';
  const wait = status?.canResendAt > currentTime
    ? `<p class="muted">You can request another message in ${formatDuration(status.canResendAt - currentTime)}.</p>` : '';
  const address = player.email
    ? `<strong>${escapeHtml(player.email)}</strong>` : '<strong>No email address set</strong>';
  const preview = developmentUrl
    ? `<aside class="development-verification"><strong>Development mail preview</strong><p>SMTP is not configured in this non-production server. Use this link to complete the same single-use verification flow:</p><a class="button secondary" href="${escapeHtml(developmentUrl)}">Open verification link</a></aside>` : '';
  return `<section class="verification-card"><p class="eyebrow">Account security</p><h1>Verify your email</h1><p>Email verification is required before this miner can enter the game.</p><div class="verification-address"><span>Current address</span>${address}</div>${sent}${wait}${preview}
    ${player.email ? `<form method="post" action="/verify-email/resend"><button${status?.canResendAt > currentTime ? ' disabled' : ''}>Send another verification email</button></form>` : ''}
    <details${player.email ? '' : ' open'}><summary>Use a different email address</summary><form method="post" action="/verify-email/email"><label>Email<input type="email" name="email" maxlength="254" autocomplete="email" required></label><label>Current password<input type="password" name="password" autocomplete="current-password" required></label><button>Save and verify this address</button></form></details>
    <form method="post" action="/logout"><button class="secondary">Log out</button></form>
  </section>`;
}

function emailConfirmationPage(verification, token) {
  if (!verification) {
    return `<section class="verification-card"><p class="eyebrow">Account security</p><h1>Link unavailable</h1><p>This verification link is invalid, expired, superseded, or has already been used.</p><a class="button" href="/">Return to sign in</a></section>`;
  }
  return `<section class="verification-card"><p class="eyebrow">Account security</p><h1>Confirm your email</h1><p>Unlock <strong>${escapeHtml(verification.minerName)}</strong> by confirming <strong>${escapeHtml(verification.email)}</strong>.</p><form method="post" action="/verify-email/confirm"><input type="hidden" name="token" value="${escapeHtml(token)}"><button>Verify email and unlock account</button></form><p class="muted">This is a single-use confirmation. No game access is granted until you press the button.</p></section>`;
}

function emailVerifiedPage(minerName) {
  return `<section class="verification-card verification-complete"><p class="eyebrow">Account security</p><h1>Email verified</h1><p>${escapeHtml(minerName)} is unlocked. You can now sign in and enter the game.</p><a class="button" href="/">Continue to MineThings</a></section>`;
}

function dashboardPage(player, catalog, now) {
  const recent = player.discoveries.slice(0, Number(catalog.settings.home_recent_discovery_limit))
    .map((entry) => catalogItemForId(catalog, entry.itemId, 'recent discovery'))
    .sort(compareItemsByRarity).map((item) => itemCard(item)).join('');
  const localMines = player.mines.filter((mine) => mine.cityId === player.cityId);
  const mines = localMines.map((mine) => {
    const type = catalogMineTypeForId(catalog, mine.mineTypeId);
    const remaining = mine.nextFindAt - now;
    const resource = type.hasOre ? 'ore' : 'gold';
    const continuousGold = Boolean(
      catalogSpecialisationForId(catalog, player.profession).bonuses.mineGold
    )
      && mine.mineThings === false && !type.hasOre;
    const mineGoldMultiplier = specialisationMultiplier(player.profession, 'mineGold', catalog.specialisations);
    const miningStatus = continuousGold
      ? `Mining <strong>gold continuously</strong> · ${formatGold(mineBucketsPerHour(catalog, mine, player, now) * Number(catalog.settings.mine_gold_per_bucket) * mineGoldMultiplier)} gold/hr · ${formatGold((mineGoldMultiplier - 1) * 100)}% specialisation bonus`
      : `Mining <strong>${mine.mineThings === false ? resource : 'things'}</strong> · ${formatGold(mineBucketsPerHour(catalog, mine, player, now))} buckets/hr · next result: <strong>${formatDuration(remaining)}</strong>`;
    const oilItem = catalogItemForSetting(catalog, 'oil_item_id');
    const oilOwned = player.inventoryByCity[mine.cityId]?.[oilItem.id] ?? 0;
    const permanentCount = player.mines.filter((candidate) => !candidate.rentalUntil).length;
  return `<article class="mine${mine.active ? '' : ' inactive'}">${equipmentBot(mine, catalog, true)}<div><h3><span class="mine-priority">${mine.priority}</span> ${escapeHtml(type.name)} Mine</h3><p>${mine.active ? miningStatus : '<strong>Paused by the active-mine limit.</strong>'}${mine.oilExpiresAt > now ? ` · oiled for ${formatDuration(mine.oilExpiresAt - now)}` : ''}${mine.rentalUntil ? ` · rental expires in ${formatDuration(mine.rentalUntil - now)}` : ''}</p>${mine.active ? `<a href="/mines/${mine.id}/equipment">Equipment &amp; explosives</a>` : ''}</div><div class="mine-actions"><form method="post" action="/mines/${mine.id}/prioritize"><button class="secondary" ${mine.priority === 1 ? 'disabled' : ''}>Make top</button></form>${mine.active ? `<form method="post" action="/mines/${mine.id}/mode"><input type="hidden" name="mineThings" value="${mine.mineThings === false ? '1' : '0'}"><button class="secondary">Mine ${mine.mineThings === false ? 'things' : resource}</button></form><form method="post" action="/mines/${mine.id}/oil"><button class="secondary" ${oilOwned < 1 ? 'disabled' : ''}>Oil bot</button></form>${continuousGold ? '' : `<form method="post" action="/mines/${mine.id}/claim"><button ${remaining > 0 ? 'disabled' : ''}>Collect findings</button></form>`}` : ''}${!mine.rentalUntil && type.refundable ? `<form method="post" action="/mines/${mine.id}/sell"><button class="secondary" ${permanentCount <= Number(catalog.settings.minimum_permanent_mines) ? 'disabled' : ''}>Resell for ${mineRefundCredits(catalog, type)}c</button></form>` : ''}</div></article>`;
  }).join('');
  const capacityWarning = player.itemCount > player.itemLimit
    ? `<p class="capacity-warning">You are ${player.itemCount - player.itemLimit} things over your ${player.itemLimit}-thing limit. <a href="/mines/auto-recycle">Open Auto-Recycle</a>.</p>` : '';
  const ownedParts = new Set(player.botPartIds);
  const partImage = `/img/equipment/botparts/bot${catalog.botParts.filter((part) => ownedParts.has(part.id)).map((part) => part.name).join('')}.png`;
  const partRows = catalog.botParts.map((part) => {
    const owned = ownedParts.has(part.id);
    const available = !part.prerequisiteId || ownedParts.has(part.prerequisiteId);
    return `<li><span>${escapeHtml(part.label)} · +${formatGold(part.bph)} bph · ${formatGold(part.cost)}g</span>${owned ? '<strong class="active-state">Built</strong>' : `<form method="post" action="/bot-parts/${part.id}/buy"><button ${!available || player.gold < part.cost ? 'disabled' : ''}>Buy</button></form>`}</li>`;
  }).join('');
  const botBuilder = ownedParts.size < catalog.botParts.length ? `<section class="bot-builder"><div><h2>Build your miner bot</h2><p>Each original machine part permanently improves every standard mine.</p><ul>${partRows}</ul></div><img src="${partImage}" alt="Partially assembled miner bot"></section>` : '';
  const ownedStones = new Set(player.stoneIds);
  const nextStones = catalogCollection(catalog, 'stones').filter((stone) => !ownedStones.has(stone.id))
    .slice(0, Number(catalog.settings.home_next_stone_limit))
    .map((stone) => `<img src="/img/icons/stone${stone.rarity}.png" alt="${escapeHtml(stone.name)}" title="${escapeHtml(`${stone.name}: ${stone.description}. ${formatGold(catalog.settings.stone_buckets_per_hour)} bph.`)}">`).join('');
  const stones = `<section class="stone-progress"><div><h2>Clear stones</h2><p>${player.stoneCount} cleared · +${formatGold(player.stoneCount * Number(catalog.settings.stone_buckets_per_hour))} buckets/hr on the top mine in your home city.</p></div><div class="stone-icons">${nextStones || '<strong>Every stone cleared.</strong>'}</div><a href="/stones">View all</a></section>`;
  return `<section class="page-title"><div><p class="eyebrow">Welcome back</p><h1>${escapeHtml(player.name)}’s mines</h1></div><p>Showing mines in ${escapeHtml(player.cityName)}. Each active mine uncovers a thing about every ${formatDuration(Number(catalog.settings.find_interval_ms))}, including while you are away.</p></section>${capacityWarning}${botBuilder}${stones}<section><h2>Mines in ${escapeHtml(player.cityName)}</h2><div class="mine-list">${mines || '<p>No mines are based in this city.</p>'}</div></section><section><h2>Recent discoveries</h2><div class="item-grid">${recent || '<p>Your first discovery is still beneath the soil.</p>'}</div></section>`;
}

function stonesPage(player, catalog) {
  const owned = new Set(player.stoneIds);
  const stoneBph = Number(catalog.settings.stone_buckets_per_hour);
  const rows = catalogCollection(catalog, 'stones').map((stone) => `<article class="stone-card${owned.has(stone.id) ? ' earned' : ''}"><img src="/img/icons/stone${stone.rarity}.png" alt=""><div><h3>${escapeHtml(stone.name)}</h3><p>${escapeHtml(stone.description)}</p><small>Rank ${stone.rank} · ${owned.has(stone.id) ? 'Cleared' : 'Not yet cleared'} · +${formatGold(stoneBph)} bph</small></div></article>`).join('');
  return `<section class="page-title"><div><p class="eyebrow">Mine achievements</p><h1>Stones</h1></div><a href="/">Back to mines</a></section><p>Each cleared stone permanently adds ${formatGold(stoneBph)} bucket per hour to the top mine in your home city.</p><div class="stone-grid">${rows}</div>`;
}

function mineEquipmentPage(player, catalog, mine, currentTime, detonated = false) {
  const type = catalogMineTypeForId(catalog, mine.mineTypeId);
  const inventory = player.inventoryByCity[mine.cityId] ?? {};
  const equippedRows = catalog.equipmentTypes.map(({ id: typeId, name: typeName }) => {
    const itemId = Number(mine.equipment?.[typeId]);
    const item = catalog.byId.get(itemId);
    const equipment = catalog.equipmentByItemId.get(itemId);
    return item
      ? `<li>${itemCard(item, { compact: true, meta: [typeName, `+${equipment.bucketsPerHour} buckets/hr`], action: `<form method="post" action="/mines/${mine.id}/equipment/${typeId}/unequip"><button class="secondary">Remove</button></form>` })}</li>`
      : `<li class="empty-slot"><strong>${escapeHtml(typeName)}:</strong> <span class="muted">empty</span></li>`;
  }).join('');
  const availableEquipment = catalog.equipment.filter((entry) => (inventory[entry.itemId] ?? 0) > 0)
    .sort(compareCatalogEntriesByRarity(catalog))
    .map((entry) => {
      const item = catalog.byId.get(entry.itemId);
      return itemCard(item, { count: inventory[item.id], compact: true,
        meta: [catalog.equipmentTypeNames[entry.typeId], `+${entry.bucketsPerHour} buckets/hr`],
        action: `<form method="post" action="/mines/${mine.id}/equipment/${item.id}/equip"><button>Equip</button></form>` });
    }).join('');
  const robot = catalog.robotByItemId.get(mine.robotItemId);
  const robotItem = robot ? catalog.byId.get(robot.itemId) : null;
  const availableRobots = catalog.robots.filter((entry) => (inventory[entry.itemId] ?? 0) > 0)
    .sort(compareCatalogEntriesByRarity(catalog)).map((entry) => {
      const item = catalog.byId.get(entry.itemId);
      return itemCard(item, { count: inventory[item.id], compact: true, meta: `MR${entry.model}`,
        action: `<form method="post" action="/mines/${mine.id}/robots/${item.id}/assign"><button>Assign</button></form>` });
    }).join('');
  const explosives = [...catalog.explosives].sort(compareCatalogEntriesByRarity(catalog)).map((entry) => {
    const item = catalog.byId.get(entry.itemId);
    const owned = inventory[item.id] ?? 0;
    const safetyLimit = catalog.rarityById.get(item.rarity)?.maxExplosives ?? 0;
    const maximum = Math.min(owned, safetyLimit);
    const option = (label, quantity, showMaximum = false) => {
      const disabled = quantity < 1 || quantity > maximum;
      const ariaQuantity = showMaximum ? `the maximum of ${maximum.toLocaleString('en-GB')}`
        : quantity.toLocaleString('en-GB');
      return `<button class="detonator-option${showMaximum ? ' detonator-option-max' : ''}" type="submit" name="count" value="${quantity}" aria-label="Detonate ${ariaQuantity} ${escapeHtml(item.name)}"${disabled ? ' disabled' : ''}><span>${label}</span>${showMaximum ? `<small>${maximum.toLocaleString('en-GB')}</small>` : ''}</button>`;
    };
    const action = `<form class="detonator-form" method="post" action="/mines/${mine.id}/detonate"><input type="hidden" name="itemId" value="${item.id}"><div class="detonator-options" role="group" aria-label="Detonate ${escapeHtml(item.name)} quantity">${option('1', 1)}${option('10', 10)}${option('100', 100)}${option('Max', maximum, true)}</div></form>`;
    return itemCard(item, { count: owned, compact: true, unavailable: !owned,
      meta: [`${entry.buckets.toLocaleString('en')} buckets`, owned ? 'Ready' : 'None in this city'],
      action });
  }).join('');
  return `<section class="page-title"><div><p class="eyebrow">${escapeHtml(type.name)} mine</p><h1>Bot loadout</h1></div><p>${formatGold(mineBucketsPerHour(catalog, mine, player, currentTime))} buckets/hr · about one result every ${formatDuration(mineIntervalMs(catalog, mine, player, currentTime))}.</p></section>
    ${detonated ? '<figure class="explosion-result"><img src="/img/explosives/explosion.png" alt="Explosion"><figcaption>Detonation complete.</figcaption></figure>' : ''}
    <section class="loadout-layout"><div>${equipmentBot(mine, catalog)}</div><div><h2>Equipped</h2><ul class="equipped-list">${equippedRows}</ul><h3>Miner robot</h3>${robotItem ? itemCard(robotItem, { compact: true, meta: `MR${robot.model}`, action: `<form method="post" action="/mines/${mine.id}/robots/unassign"><button class="secondary">Remove</button></form>` }) : '<p class="muted">No miner robot assigned.</p>'}</div></section>
    <section><h2>Equipment in this city</h2><div class="loadout-list">${availableEquipment || '<p>No spare equipment is stored in this city.</p>'}</div></section>
    <section><h2>Miner robots in this city</h2><p>Assigned robots can uncover damaged things, using ${formatGold(Number(catalog.settings.robot_damaged_chance_per_model) * 100)}% × model probability.</p><div class="loadout-list">${availableRobots || '<p>No spare miner robots are stored in this city.</p>'}</div></section>
    <section><h2>Detonate explosives</h2><p>Explosives consume local inventory and mine instantly at ±${formatGold(Number(catalog.settings.explosive_power_variation) * 100)}% of their original bucket power. Equipment does not affect detonations.</p><div class="detonator-grid">${explosives}</div></section>
    <p><a href="/">Back to mines</a></p>`;
}

function gadgetsPage(player, catalog, currentTime) {
  const active = new Map(player.gadgets.map((gadget) => [gadget.id, gadget]));
  const homeInventory = player.inventoryByCity[player.homeCityId] ?? {};
  const foreignInventory = Object.entries(player.inventoryByCity)
    .filter(([cityId]) => Number(cityId) !== player.homeCityId)
    .reduce((totals, [, inventory]) => {
      for (const [itemId, quantity] of Object.entries(inventory)) {
        totals[itemId] = (totals[itemId] ?? 0) + quantity;
      }
      return totals;
    }, {});
  const gadgetItemIds = new Set(catalog.gadgetItems.map((entry) => entry.itemId));
  const foreignGadgetCount = Object.entries(foreignInventory)
    .filter(([itemId]) => gadgetItemIds.has(Number(itemId)))
    .reduce((total, [, quantity]) => total + quantity, 0);
  const rows = catalog.gadgets.map((gadget) => {
    const session = active.get(gadget.id);
    const itemRows = catalog.gadgetItems.filter((entry) => entry.gadgetId === gadget.id)
      .sort(compareCatalogEntriesByRarity(catalog)).map((entry) => {
      const item = catalog.byId.get(entry.itemId);
      const atHome = homeInventory[item.id] ?? 0;
      const elsewhere = foreignInventory[item.id] ?? 0;
      if (!atHome && !elsewhere) return '';
      return itemCard(item, { count: atHome + elsewhere, compact: true,
        meta: [`${atHome} at home`, ...(elsewhere ? [`${elsewhere} elsewhere`] : [])],
        action: `<form method="post" action="/gadgets/${item.id}/activate"><button ${atHome ? '' : 'disabled'}>Activate one</button></form>` });
    }).filter(Boolean).join('');
    const openPage = gadget.hasPage && session?.expiresAt > currentTime
      ? `<a class="button secondary" href="/gadgets/${gadget.behaviorKey.replaceAll('_', '-')}">Open ${escapeHtml(gadget.displayName)}</a>` : '';
    return `<article class="gadget-card"><div><h3>${escapeHtml(gadget.displayName)}</h3><p>${escapeHtml(gadget.description)}</p>${session?.expiresAt > currentTime
      ? `<strong class="active-state">Active for ${formatDuration(session.expiresAt - currentTime)}</strong>${openPage}`
      : '<span class="muted">Inactive</span>'}</div><div class="gadget-activators">${itemRows || '<span class="muted">No activator items owned.</span>'}</div></article>`;
  }).join('');
  const foreignNotice = foreignGadgetCount
    ? `<p class="capacity-warning">You have ${foreignGadgetCount} gadget ${foreignGadgetCount === 1 ? 'item' : 'items'} outside your home city. Bring ${foreignGadgetCount === 1 ? 'it' : 'them'} home to activate ${foreignGadgetCount === 1 ? 'it' : 'them'}.</p>` : '';
  return `<section class="page-title"><div><p class="eyebrow">Machines</p><h1>Gadgets</h1></div><p>Gadget items must be in your home city to activate. Each adds its original rarity-based lifespan to the current session.</p></section>${foreignNotice}
    <div class="gadget-list">${rows}</div>`;
}

function ledgerPage(report, catalog) {
  const gadgetName = catalogGadgetForBehavior(catalog, 'ledger').displayName;
  const months = report.months.map((month) => `<option value="${month.offset}"${month.offset === report.offset ? ' selected' : ''}>${month.label}</option>`).join('');
  const rows = [...report.rows].sort((first, second) =>
    compareItemsByRarity(catalog.byId.get(first.itemId), catalog.byId.get(second.itemId))
      || Number(second.createdAt) - Number(first.createdAt)).map((sale) => {
    const item = catalog.byId.get(sale.itemId);
    if (!item) throw new Error(`Missing catalog item: ${sale.itemId}.`);
    return `<tr><td>${sale.action}</td><td>${itemCard(item, { compact: true })}</td><td>${sale.quantity} × ${formatGold(sale.price)}g</td><td>${new Date(sale.createdAt).toLocaleDateString('en-CA')}</td></tr>`;
  }).join('');
  return `<section class="page-title"><div><p class="eyebrow">${escapeHtml(gadgetName)} gadget</p><h1>Purchases and sales</h1></div><a href="/gadgets">Back to gadgets</a></section>
    <form class="market-search" method="get"><label>Month<select name="month">${months}</select></label><button>Go</button></form>
    <table><tbody><tr><th>Total purchases</th><td>${formatGold(report.totalPurchases)}g</td></tr><tr><th>Total sales</th><td>${formatGold(report.totalSales)}g</td></tr><tr><th>Profit from sales</th><td>${formatGold(report.profit)}g</td></tr></tbody></table>
    <table><thead><tr><th>Action</th><th>Thing</th><th>Quantity and price</th><th>Date</th></tr></thead><tbody>${rows || '<tr><td colspan="4">No transactions in this month.</td></tr>'}</tbody></table>`;
}

function medalDetectorPage(melds, catalog) {
  const gadgetName = catalogGadgetForBehavior(catalog, 'medal_detector').displayName;
  const rows = melds.map((meld) => `<tr><td><a href="/melds/${meld.id}">${escapeHtml(meld.name)}</a></td><td>${formatGold(meld.price)}g</td></tr>`).join('');
  return `<section class="page-title"><div><p class="eyebrow">${escapeHtml(gadgetName)} gadget</p><h1>Cheapest incomplete melds</h1></div><a href="/gadgets">Back to gadgets</a></section>
    <p>Prices account for all things you own and the cheapest listings in your current city, matching the original detector.</p>
    <table><thead><tr><th>Meld</th><th>Price</th></tr></thead><tbody>${rows || '<tr><td colspan="2">Not enough local listing data to price a meld.</td></tr>'}</tbody></table>`;
}

function spreadsheetPage(report, selectedCities, selectedRarities, sort, catalog) {
  const gadgetName = catalogGadgetForBehavior(catalog, 'spreadsheet').displayName;
  const chosenCities = new Set(selectedCities.map(Number));
  const chosenRarities = new Set(selectedRarities.map(Number));
  const cityInputs = report.cities.map((city) => `<label class="check-option"><input type="checkbox" name="city" value="${city.city_id}"${!selectedCities.length || chosenCities.has(city.city_id) ? ' checked' : ''}>${escapeHtml(city.name)}</label>`).join('');
  const colors = catalog.settings.rarity_color_names;
  const rarityInputs = colors.map((name, rarity) => `<label class="check-option"><input type="checkbox" name="rarity" value="${rarity}"${!selectedRarities.length || chosenRarities.has(rarity) ? ' checked' : ''}>${name}</label>`).join('');
  const rows = [...report.rows].sort((first, second) =>
    compareItemsByRarity(catalog.byId.get(first.itemId), catalog.byId.get(second.itemId))
      || Number(second[sort]) - Number(first[sort])).map((trade) => {
    const item = catalog.byId.get(trade.itemId);
    if (!item) throw new Error(`Missing catalog item: ${trade.itemId}.`);
    return `<tr><td>${itemCard(item, { compact: true })}</td><td>${escapeHtml(trade.buyCity)}</td><td>${formatGold(trade.buyPrice)}g</td><td>${escapeHtml(trade.sellCity)}</td><td>${formatGold(trade.sellPrice)}g</td><td>${formatGold(trade.profit)}g</td><td>${trade.percent}%</td></tr>`;
  }).join('');
  return `<section class="page-title"><div><p class="eyebrow">${escapeHtml(gadgetName)} gadget</p><h1>Profitable intercity trades</h1></div><a href="/gadgets">Back to gadgets</a></section>
    <p>Things available to buy immediately in one known city and sell immediately in another are listed below.</p>
    <form class="report-filter" method="get"><fieldset><legend>Sort</legend><label><input type="radio" name="sort" value="profit"${sort !== 'percent' ? ' checked' : ''}>Profit</label><label><input type="radio" name="sort" value="percent"${sort === 'percent' ? ' checked' : ''}>Percent</label></fieldset><fieldset><legend>Cities</legend>${cityInputs}</fieldset><fieldset><legend>Rarities</legend>${rarityInputs}</fieldset><button>Apply filter</button></form>
    <table><thead><tr><th>Thing</th><th>Buy city</th><th>Listing</th><th>Sell city</th><th>Bid</th><th>Profit</th><th>Percent</th></tr></thead><tbody>${rows || '<tr><td colspan="7">No profitable immediate trades match this filter.</td></tr>'}</tbody></table>`;
}

function calculatorPage(categories, catalog) {
  const gadgetName = catalogGadgetForBehavior(catalog, 'calculator').displayName;
  const sections = categories.map((category) => `<section><h2>${escapeHtml(category.name)}</h2><table><thead><tr><th>Description</th><th>Value</th></tr></thead><tbody>${category.stats.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${typeof value === 'number' ? value.toLocaleString('en-GB') : escapeHtml(value)}</td></tr>`).join('')}</tbody></table></section>`).join('');
  return `<section class="page-title"><div><p class="eyebrow">${escapeHtml(gadgetName)} gadget</p><h1>Miner statistics</h1></div><a href="/gadgets">Back to gadgets</a></section>${sections}`;
}

function meldRequirements(meld, player, catalog) {
  const inventory = player.inventoryByCity[player.homeCityId] ?? {};
  const storage = player.meldStash ?? {};
  return [...meld.requirements].sort(compareCatalogEntriesByRarity(catalog)).map((requirement) => {
    const item = catalog.byId.get(requirement.itemId);
    const stored = storage[requirement.itemId] ?? 0;
    const atHome = inventory[requirement.itemId] ?? 0;
    if (!item) throw new Error(`Missing catalog item: ${requirement.itemId}.`);
    return `<li class="${stored + atHome >= requirement.count ? 'met' : 'missing'}">${itemCard(item, { compact: true, meta: [`${requirement.count} required`, `${stored} in Meld storage`, `${atHome} in home city`] })}</li>`;
  }).join('');
}

function meldsPage(player, catalog, query = '') {
  const needle = query.trim().toLocaleLowerCase('en');
  const owned = new Set(player.meldIds);
  const broken = new Set(player.brokenMeldIds);
  const matching = catalog.melds.filter((meld) => meld.public && (!needle || meld.name.toLocaleLowerCase('en').includes(needle)))
    .sort(compareItemsByRarity);
  const resultLimit = Number(catalog.settings.meld_search_result_limit);
  const cards = matching.slice(0, resultLimit).map((meld) => `<article class="meld-card rarity-${meld.rarity}"><div><h3><a href="/melds/${meld.id}">${escapeHtml(meld.name)}</a></h3><small>${escapeHtml(catalogRarityName(catalog, meld.rarity))} · ${meld.requirements.reduce((sum, requirement) => sum + requirement.count, 0)} things</small></div>${owned.has(meld.id) ? '<strong class="active-state">Owned</strong>' : broken.has(meld.id) ? '<strong class="capacity-warning">Broken · dismantle</strong>' : '<a class="button secondary" href="/melds/' + meld.id + '">View recipe</a>'}</article>`).join('');
  const storedCards = Object.entries(player.meldStash ?? {})
    .map(([itemId, quantity]) => {
      const item = catalog.byId.get(Number(itemId));
      if (!item) throw new Error(`Missing catalog item: ${itemId}.`);
      return [item, quantity];
    })
    .sort(([first], [second]) => compareItemsByRarity(first, second))
    .map(([item, quantity]) => itemCard(item, {
      count: quantity, meta: 'Stored outside inventory capacity'
    })).join('');
  return `<section class="page-title"><div><p class="eyebrow">Collections</p><h1>Melds</h1></div><p>You own <strong>${owned.size}</strong> melds${broken.size ? ` and have <strong>${broken.size}</strong> broken melds` : ''}. Use the Meld button in Your Things to stage recipe items. Completed melds are created automatically.</p></section>
    <section class="meld-storage"><h2>Meld storage</h2><p>These things do not count toward inventory capacity.</p><div class="item-grid">${storedCards || '<p>No things are staged for melds.</p>'}</div></section>
    <form class="market-search" method="get" action="/melds"><label>Find a meld<input name="q" value="${escapeHtml(query)}" placeholder="Meld name"></label><button>Search</button></form>
    <div class="meld-list">${cards || '<p>No matching melds.</p>'}</div>${matching.length > resultLimit ? `<p>Showing the first ${resultLimit} matches.</p>` : ''}`;
}

function meldDetailPage(player, catalog, meld) {
  const owned = player.meldIds.includes(meld.id);
  const broken = player.brokenMeldIds.includes(meld.id);
  const previousHomeName = player.previousHomeCityId === null
    ? 'your former home city' : catalogCityForId(catalog, player.previousHomeCityId).name;
  return `<section class="page-title"><div><p class="eyebrow">${escapeHtml(catalogRarityName(catalog, meld.rarity))} meld</p><h1>${escapeHtml(meld.name)}</h1></div><p>Use Meld buttons in Your Things to move recipe items into capacity-free Meld storage. Home-city things can still be used for manual creation.</p></section>
    <section class="meld-recipe"><h2>Recipe</h2><ul>${meldRequirements(meld, player, catalog)}</ul>${broken
      ? `<div class="broken-meld"><p>Moving nullified this meld in ${escapeHtml(previousHomeName)}. Dismantle it to return every recipe thing to that city.</p><form method="post" action="/melds/${meld.id}/deconstruct"><button>Dismantle meld</button></form></div>`
      : owned
      ? '<p class="active-state">You own this meld.</p>'
      : `<form class="meld-create-form" method="post" action="/melds/${meld.id}/create"><button>Create from storage and home-city things</button></form>`}</section><p><a href="/melds">Back to melds</a></p>`;
}

function professionsPage(player, catalog) {
  const current = catalogSpecialisationForId(catalog, player.profession);
  const tenureById = new Map(player.specialisationTenure.map(
    (entry) => [entry.specialisationId, entry]
  ));
  const currentTenure = tenureById.get(player.profession);
  const cards = catalog.specialisations.map((profession) => {
    const tenure = tenureById.get(profession.id);
    const progress = tenure.nextTitle
      ? `${tenure.remainingDays.toLocaleString('en-GB')} charged days to ${escapeHtml(tenure.nextTitle)}`
      : 'Highest legacy title earned';
    return `<article class="profession-card${profession.id === player.profession ? ' current' : ''}"><div><h3>${escapeHtml(tenure.title)} ${escapeHtml(profession.name)}</h3><p>${tenure.activeDays.toLocaleString('en-GB')} charged days · ${progress}</p><p>${profession.melds} melds required · ${escapeHtml(profession.bonus)}</p></div>${profession.id === player.profession
    ? '<strong class="active-state">Current</strong>'
    : `<form method="post" action="/professions/${profession.id}"><button ${player.meldIds.length < profession.melds ? 'disabled' : ''}>Choose</button></form>`}</article>`;
  }).join('');
  return `<section class="page-title"><div><p class="eyebrow">Specialisation</p><h1>Specialisations</h1></div><p>Current title: <strong>${escapeHtml(currentTenure.title)} ${escapeHtml(current.name)}</strong> · ${player.meldIds.length} melds. Titles measure charged battery time in each specialisation separately; switching preserves progress. Every miner may use every game system, while specialisations grant bonuses.</p></section><div class="profession-grid">${cards}</div>`;
}

function factoriesPage(player, catalog, factoryState, employees, availableWorkers, currentTime) {
  const oreItem = catalogItemForSetting(catalog, 'ore_item_id');
  const oilItem = catalogItemForSetting(catalog, 'oil_item_id');
  const ore = player.inventory[oreItem.id] ?? 0;
  const oil = player.inventory[oilItem.id] ?? 0;
  const homeOil = player.inventoryByCity[player.homeCityId]?.[oilItem.id] ?? 0;
  const damaged = Object.entries(player.inventory).map(([itemId, count]) => [catalog.byId.get(Number(itemId)), count])
    .filter(([item, count]) => item?.repairedItemId && count > 0)
    .sort(([first], [second]) => compareItemsByRarity(first, second));
  const damagedCards = damaged.map(([item, count]) => itemCard(item, {
    count, compact: true, className: 'item-card-picker',
    meta: 'Damaged · repair candidate',
    action: `<label><input type="radio" name="itemId" value="${item.id}"> Use for repair</label>`
  })).join('');
  const localEmployees = employees.filter((employee) => employee.homeCityId === player.cityId);
  const idleEmployees = localEmployees.filter((employee) => !employee.factoryId);
  const cards = factoryState.factories.map((factory) => {
    const canControl = factory.operatorId === player.id;
    const own = factory.ownerId === player.id;
    const rented = factory.ownerId !== factory.operatorId;
    const actionOptions = catalog.factoryActions
      .filter((action) => action.actionKind !== 'build'
        && (!rented || action.actionKind === 'repair'))
      .map((action) => `<option value="${action.id}">${escapeHtml(action.name)} · ${action.ore} ore · ${action.components.toLocaleString('en')} components</option>`).join('');
    const progress = factory.components ? Math.min(100, factory.componentsDone / factory.components * 100) : 0;
    const workers = factory.workers.map((worker) => worker.isBot
      ? `<li><strong>🤖 ${escapeHtml(worker.name)}</strong> · ${worker.cph} cph · contract ${formatDuration(worker.expiresAt - currentTime)} left</li>`
      : `<li><a href="/miners/${encodeURIComponent(worker.name)}">${escapeHtml(worker.name)}</a> · ${worker.cph} cph${worker.oiled ? ' · oiled' : ''}${canControl ? `<div><form method="post" action="/workers/${worker.playerId}/idle"><button class="link">idle</button></form>${worker.oiled ? '' : `<form method="post" action="/workers/${worker.playerId}/oil"><button class="link" ${oil < 1 ? 'disabled' : ''}>oil</button></form>`}</div>` : ''}</li>`).join('');
    const assign = canControl && idleEmployees.length
      && factory.workers.length < Number(catalog.settings.factory_max_workers)
      ? `<form class="factory-assign" method="post" action="/factories/${factory.id}/assign"><label>Assign worker<select name="workerId">${idleEmployees.map((worker) => `<option value="${worker.playerId}">${escapeHtml(worker.name)} · ${worker.cph} cph</option>`).join('')}</select></label><button>Assign</button></form>` : '';
    const progressDetails = factory.actionId
      ? `<div class="factory-progress"><div style="width:${progress.toFixed(2)}%"></div></div><p>${progress.toFixed(1)}% · ${factory.rate} cph${factory.completionAt ? ` · ${formatDuration(factory.completionAt - currentTime)} remaining` : ' · waiting for workers'}</p>`
      : '';
    const queueRows = factory.queue.map((job, index) => `<li><div><strong>${index + 1}. ${escapeHtml(job.actionName)}</strong><small>${job.oreReserved} ore reserved${job.itemName ? ` · ${escapeHtml(job.itemName)} reserved` : ''} · ${Number(job.components).toLocaleString('en')} components</small></div>${canControl ? `<div class="factory-queue-actions"><form method="post" action="/factories/${factory.id}/queue/${job.id}/up"><button class="link" aria-label="Move ${escapeHtml(job.actionName)} up"${index === 0 ? ' disabled' : ''}>↑</button></form><form method="post" action="/factories/${factory.id}/queue/${job.id}/down"><button class="link" aria-label="Move ${escapeHtml(job.actionName)} down"${index === factory.queue.length - 1 ? ' disabled' : ''}>↓</button></form><form method="post" action="/factories/${factory.id}/queue/${job.id}/cancel"><button class="link">Cancel</button></form></div>` : ''}</li>`).join('');
    const queue = factory.built
      ? `<section class="factory-queue"><h4>Production queue <span>${factory.queue.length}/${factory.queueLimit}</span></h4><p>Inputs are reserved as soon as a job is queued.</p><ol>${queueRows || '<li class="muted">No jobs waiting.</li>'}</ol></section>`
      : '';
    const queueFull = factory.queue.length >= factory.queueLimit;
    const activeLimitReached = !factory.actionId && own
      && factoryState.activeCount >= factoryState.maximumActive;
    const production = canControl && factory.built
      ? `<form class="factory-action" method="post" action="/factories/${factory.id}/start"><label>Add production job<select name="actionId" required><option value="">Choose action</option>${actionOptions}</select></label><fieldset class="item-picker"><legend>Damaged item (Repair only)</legend><label class="item-picker-none"><input type="radio" name="itemId" value="" checked> No repair item</label><div class="item-picker-grid">${damagedCards || '<p>No damaged items available.</p>'}</div></fieldset><button${queueFull || activeLimitReached ? ' disabled' : ''}>${factory.actionId || factory.queue.length ? 'Add to queue' : 'Start action'}</button></form>${queueFull ? '<p class="capacity-warning">The production queue is full.</p>' : activeLimitReached ? `<p class="capacity-warning">You already have ${factoryState.maximumActive} active factories.</p>` : ''}`
      : '';
    const activeCancel = canControl && factory.actionId
      ? `<form method="post" action="/factories/${factory.id}/cancel"><button class="secondary">Cancel active job and refund inputs</button></form>`
      : '';
    const demolish = canControl && own && factory.built && !factory.actionId && !factory.queue.length
      ? `<form method="post" action="/factories/${factory.id}/demolish"><button class="secondary">Demolish for ore refund</button></form>`
      : '';
    const controls = `${progressDetails}${activeCancel}${queue}${production}${demolish}`;
    const rentalStatus = rented ? (canControl
      ? `<p>Rented from <a href="/miners/${encodeURIComponent(factory.ownerName)}">${escapeHtml(factory.ownerName)}</a> · ${formatDuration(factory.rentalExpires - currentTime)} left · repair only.</p>`
      : `<p>Rented to <a href="/miners/${encodeURIComponent(factory.operatorName)}">${escapeHtml(factory.operatorName)}</a> · ${formatDuration(factory.rentalExpires - currentTime)} left.</p>`) : '';
    const botHire = canControl && factory.workers.length < Number(catalog.settings.factory_max_workers)
      ? `<div class="factory-bot-market"><h4>Hire a Factory Worker bot</h4><p>Premium automation contracts last ${formatDuration(Number(catalog.settings.factory_worker_bot_contract_duration_ms))}.</p>${catalog.settings.factory_worker_bot_tiers.map((tier) => `<form method="post" action="/factories/${factory.id}/hire-bot"><input type="hidden" name="tierId" value="${tier.id}"><span><strong>🤖 ${escapeHtml(tier.name)}</strong> · ${tier.cph} cph</span><button${player.gold < tier.costGold ? ' disabled' : ''}>Hire · ${formatGold(tier.costGold)}g</button></form>`).join('')}</div>` : '';
    return `<article class="factory-card"><header><h3>Factory ${factory.id}</h3><span>${factory.built ? 'Built' : 'Under construction'}${factory.actionName ? ` · ${escapeHtml(factory.actionName)}` : ' · Idle'}</span></header>${rentalStatus}${controls}<h4>Workers</h4><ul>${workers || '<li class="muted">No workers assigned.</li>'}</ul>${assign}${botHire}</article>`;
  }).join('');
  const workerRows = localEmployees.map((worker) => `<li>${escapeHtml(worker.name)} · ${worker.cph} cph${worker.oiled ? ' · oiled' : ''} · ${formatDuration(worker.expiresAt - currentTime)} left</li>`).join('');
  const contractDuration = formatDuration(Number(catalog.settings.worker_contract_duration_ms));
  const candidates = availableWorkers.filter((worker) => worker.id !== player.id).map((worker) =>
    `<article class="worker-card"><span><strong>${escapeHtml(worker.name)}</strong> · ${worker.cph} cph</span><form method="post" action="/workers/${worker.id}/hire"><button>Hire ${contractDuration}</button></form></article>`).join('');
  const build = catalog.factoryActions.find((action) => action.actionKind === 'build');
  const resourceCards = [oreItem, oilItem].sort(compareItemsByRarity)
    .map((item) => itemCard(item, {
      count: item.id === oreItem.id ? ore : oil, compact: true, meta: 'In this city'
    })).join('');
  const selfWorker = player.worker ? `<section class="worker-self"><h2>Your worker</h2><p>${player.worker.cph} components per hour${player.worker.oiled ? ' · oiled' : ''}${player.worker.employerId !== player.id ? ' · currently employed' : ' · available for hire'}</p>${!player.worker.oiled && player.worker.employerId === player.id ? `<form method="post" action="/workers/${player.id}/oil"><button ${homeOil < 1 ? 'disabled' : ''}>Oil yourself for +${formatGold(Number(catalog.settings.worker_oil_cph_bonus))} cph</button></form>` : ''}</section>` : '';
  return `<section class="page-title"><div><p class="eyebrow">Manufacturing</p><h1>Factories</h1></div><p>Production resources are stored per city.</p></section>
    <div class="item-grid factory-resources">${resourceCards}</div>
    ${selfWorker}
    <section><h2>Your workforce</h2><ul>${workerRows || '<li>No employees under contract.</li>'}</ul><div class="worker-market">${candidates || '<p>No free workers are based in this city.</p>'}</div></section>
    <section><h2>Local factories</h2><div class="factory-list">${cards || '<p>No factories here.</p>'}</div></section>
    <form method="post" action="/factories/build"><button ${ore < build.ore || factoryState.activeCount >= factoryState.maximumActive ? 'disabled' : ''}>Build factory · ${build.ore} ore</button></form>
    <p><a href="/market/factories/rental">Rent Factory</a> · <a href="/market/factories/sale">Buy/Sell Factory</a></p>`;
}

function chatPage(player, chats, ignores, catalog, appearance, historyWindowMs) {
  const historyHours = Number(historyWindowMs) / (60 * 60 * 1000);
  if (!Number.isFinite(historyHours) || historyHours <= 0) {
    throw new Error('The chat history window is invalid.');
  }
  const rows = chats.map((chat) => {
    const sentAt = new Date(chat.createdAt).toLocaleString('en-GB');
    const rowId = `chat-entry-${chat.kind === 'player' ? 'player' : 'world'}-${Number(chat.id)}`;
    if (chat.kind !== 'player') {
      const rare = chat.kind === 'rare-purple' || chat.kind === 'rare-orange';
      const dwarfCapture = chat.kind === 'dwarf-capture';
      const badge = chat.kind === 'rare-purple' ? 'Purple find'
        : chat.kind === 'rare-orange' ? 'Orange find'
          : dwarfCapture ? 'Dwarf captured' : 'World event';
      const itemMatch = rare || dwarfCapture
        ? String(chat.path ?? '').match(/^\/items\/(\d+)$/) : null;
      const item = itemMatch ? catalog.byId.get(Number(itemMatch[1])) : null;
      const classes = rare ? `chat-row-rare ${chat.kind}`
        : dwarfCapture ? `chat-row-world chat-row-dwarf rarity-${item?.rarity ?? 0}`
          : 'chat-row-world';
      const itemClass = rare ? 'chat-rare-item' : 'chat-dwarf-item';
      const message = item
        ? `<a class="chat-world-message ${itemClass} rarity-${item.rarity}" href="/items/${item.id}"><img src="${escapeHtml(item.icon)}" alt=""><span>${escapeHtml(chat.body)}</span></a>`
        : `<span class="chat-world-message">${escapeHtml(chat.body)}</span>`;
      return `<article id="${rowId}" class="chat-row ${classes}" data-chat-created-at="${Number(chat.createdAt)}"><a class="chat-world-badge" href="${escapeHtml(chat.path)}">${badge}</a>${message}<time>${sentAt}</time>${item ? '' : `<a class="chat-world-link" href="${escapeHtml(chat.path)}">Details</a>`}</article>`;
    }
    const color = /^[0-9a-f]{6}$/i.test(String(chat.color))
      ? String(chat.color).toLowerCase() : '55666b';
    return `<article id="${rowId}" class="chat-row chat-row-player" style="--chat-color:#${color}" data-chat-created-at="${Number(chat.createdAt)}"><a class="chat-speaker" href="/miners/${encodeURIComponent(chat.playerName)}">${escapeHtml(chat.playerName)}</a><span class="chat-message">${escapeHtml(chat.body)}</span><time>${sentAt}</time>${chat.playerId === player.id ? '' : `<form method="post" action="/chat/ignores/${chat.playerId}"><input type="hidden" name="ignored" value="1"><button class="link">Ignore</button></form>`}</article>`;
  }).join('');
  const ignoredRows = ignores.map((ignored) => `<li><a href="/miners/${encodeURIComponent(ignored.name)}">${escapeHtml(ignored.name)}</a><form method="post" action="/chat/ignores/${ignored.id}"><input type="hidden" name="ignored" value="0"><button class="link">Unignore</button></form></li>`).join('');
  const colorPicker = appearance.canChooseColor
    ? `<div class="chat-color-control"><label class="chat-color-picker">Your colour<input type="color" name="color" value="#${appearance.color}" aria-describedby="chat-color-help"></label><small id="chat-color-help">Remembered after sending.</small></div>`
    : `<div class="chat-color-control"><small>Your colour advances with melds (${appearance.meldCount}/${appearance.customMinimumMelds} for a custom colour).</small></div>`;
  return `<section class="page-title"><div><p class="eyebrow">Community</p><h1>Public chat</h1></div><p>Showing the latest ${historyHours.toLocaleString('en-GB')} hours. Miner colours follow the original meld tiers; world events, captured Dwarves, and opted-in Purple or Orange discoveries arrive live.</p></section><div id="chat-log" class="chat-list" role="log" aria-label="Public chat messages" aria-live="polite" aria-relevant="additions text" tabindex="0">${rows || '<p>No visible chat messages yet.</p>'}</div><form class="chat-compose" method="post" action="/chat"><label>Message<input name="body" maxlength="${Number(catalog.settings.chat_message_max_length)}" required></label>${colorPicker}<button>Send</button></form><details class="chat-ignores"><summary>Ignored miners (${ignores.length})</summary><ul>${ignoredRows || '<li>Nobody ignored.</li>'}</ul></details>`;
}

function localItemGoldValue(item, catalog, cityId) {
  const origins = catalogCollection(catalog, 'cityMineTypes')
    .filter((entry) => entry.mineTypeId === item.mineTypeId);
  const outsideOrigin = origins.length > 0
    && !origins.some((entry) => entry.cityId === cityId);
  const baseUnits = Math.max(1, Math.round(Number(item.goldValue) * 10000));
  const multiplier = Number(catalog.settings.foreign_market_price_multiplier);
  return (outsideOrigin ? Math.round(baseUnits * multiplier) : baseUnits) / 10000;
}

function inventoryPage(player, catalog, meldItemNeeds = {}) {
  const entries = Object.entries(player.inventory).map(([id, count]) => [catalog.byId.get(Number(id)), count])
    .filter(([item]) => item).sort(([first], [second]) => compareItemsByRarity(first, second));
  const cards = entries.map(([item, count]) => {
    const localValue = localItemGoldValue(item, catalog, player.cityId);
    const meldNeed = meldItemNeeds[item.id] ?? 0;
    const meldAtHome = player.cityId === player.homeCityId;
    const meldDisabled = !meldAtHome || meldNeed < 1;
    const meldTitle = !meldAtHome
      ? 'Meld storage is only available for things in your home city.'
      : meldNeed < 1
        ? `${item.name} is not needed for any remaining meld.`
        : `Move one ${item.name} to Meld storage.`;
    const protectedCount = player.protectedInventoryByCity?.[player.cityId]?.[item.id] ?? 0;
    const recyclableCount = Math.max(0, count - protectedCount);
    const scrapsEach = Number(catalog.settings.recycling_scraps_by_rarity[item.rarity]);
    const recycleDisabled = recyclableCount < 1;
    const recycleTitle = recycleDisabled
      ? 'Every stored copy was factory-made and can never be recycled.'
      : protectedCount
        ? `${protectedCount} factory-made ${protectedCount === 1 ? 'copy is' : 'copies are'} protected.`
        : '';
    return itemCard(item, {
      count,
      className: 'inventory-item-card',
      meta: protectedCount ? `${protectedCount} factory-made ${protectedCount === 1 ? 'copy' : 'copies'} protected` : null,
      action: `<form class="inventory-list-form" method="post" action="/inventory/${item.id}/list"><label>List quantity<input aria-label="Number of ${escapeHtml(item.name)} to list" type="number" name="quantity" min="1" max="${count}" value="1" required></label><button>List at ${formatGold(localValue)}g each</button></form><form class="inventory-list-all-form" method="post" action="/inventory/${item.id}/list"><input type="hidden" name="quantity" value="${count}"><button class="secondary">List all</button></form><form class="inventory-meld-form" method="post" action="/inventory/${item.id}/meld"><button class="secondary" title="${escapeHtml(meldTitle)}"${meldDisabled ? ' disabled' : ''}>Meld</button></form><form class="recycle-form" method="post" action="/inventory/${item.id}/recycle"><input aria-label="Number of ${escapeHtml(item.name)} to recycle" type="number" name="quantity" min="1" max="${Math.max(1, recyclableCount)}" value="1" required${recycleDisabled ? ' disabled' : ''}><button class="secondary"${recycleDisabled ? ` disabled title="${escapeHtml(recycleTitle)}"` : recycleTitle ? ` title="${escapeHtml(recycleTitle)}"` : ''}>Recycle · ${scrapsEach.toLocaleString('en-GB')} scraps each</button></form><form class="recycle-all-form" method="post" action="/inventory/${item.id}/recycle"><input type="hidden" name="quantity" value="${recyclableCount}"><button class="secondary"${recycleDisabled ? ` disabled title="${escapeHtml(recycleTitle)}"` : ''}>Recycle all · ${(recyclableCount * scrapsEach).toLocaleString('en-GB')} scraps</button></form>`
    });
  }).join('');
  const scraps = player.oreScrapsByCity?.[player.cityId] ?? 0;
  const scrapsPerOre = Number(catalog.settings.recycling_scraps_per_ore);
  return `<section class="page-title"><div><p class="eyebrow">Inventory</p><h1>Your things</h1></div><p>${player.itemCount}/${player.itemLimit} things. Recycle unwanted finds into useful Ore scraps.</p></section><section class="recycling-bank"><h2>Ore recycling</h2><p><strong>${scraps.toLocaleString('en-GB')} Ore scraps</strong> in this city · ${scrapsPerOre.toLocaleString('en-GB')} scraps make 1 Ore.</p><form method="post" action="/inventory/refine-ore"><label>Ore to refine<input type="number" name="quantity" min="1" max="${Math.floor(scraps / scrapsPerOre)}" value="1" required></label><button${scraps < scrapsPerOre ? ' disabled' : ''}>Refine Ore</button></form></section><p>Listed things move straight into the local market, stop counting toward inventory capacity, and return to this city if you cancel the listing.</p>${player.itemCount > player.itemLimit ? '<p><a class="button" href="/mines/auto-recycle">Auto-Recycle</a></p>' : ''}<div class="item-grid">${cards || '<p>You do not own any things yet.</p>'}</div>`;
}

function dwarvesPage(report, catalog, currentTime) {
  const maximumDelay = formatDuration(Number(catalog.settings.dwarf_find_max_delay_ms));
  const tierRules = [...catalog.dwarfTiers].sort((first, second) => second.rarity - first.rarity)
    .map((dwarf) => {
      const maximum = catalogRarityName(catalog, dwarf.maximumFindRarity);
      const minimum = catalogRarityName(catalog, dwarf.minimumFindRarity);
      return `${dwarf.name} finds ${maximum}${maximum === minimum ? ' only' : ` to ${minimum}`}`;
    }).join('; ');
  const risks = [...new Set(catalog.dwarfTiers.map((dwarf) => dwarf.disappearanceChance))];
  const riskCopy = risks.length === 1
    ? `Every Dwarf has a ${formatGold(risks[0] * 100)}% chance to disappear after each find.`
    : 'Each Dwarf tier has the disappearance risk shown on its card.';
  const dwarfRows = [...report.dwarves].sort(compareItemsByRarity).map((dwarf) => {
    const item = catalog.byId.get(dwarf.itemId);
    if (!item) throw new Error(`Missing catalog item: ${dwarf.itemId}.`);
    const risk = dwarf.disappearanceChance === null ? '' : ` · ${dwarf.disappearanceChance * 100}% disappearance risk`;
    return itemCard(item, { count: dwarf.quantity, meta: `Working in ${dwarf.cityName}${risk}` });
  }).join('');
  return `<section class="page-title"><div><p class="eyebrow">${catalog.dwarfTiers.length} rarity tiers</p><h1>Dwarves</h1></div><p>Every stored Dwarf finds one thing in its database-configured rarity range, using only mine types sold in its city, after a random delay within ${maximumDelay}.</p></section>
    <section class="dwarf-rules"><h2>Your working Dwarves</h2><div class="item-grid">${dwarfRows || '<p>You do not have a Dwarf stored in a city.</p>'}</div><p>${riskCopy} ${escapeHtml(tierRules)}.</p></section>
    <section><h2>Stowaways</h2><p>Dwarves of every rarity may stow away on a departing land or sea vehicle with free cargo space and a matching combat class. Higher-rarity stowaways are progressively rarer. An uncaptured Dwarf leaves at arrival; one pillaged by an opponent stays with its captor. Dwarves drown with a sinking ship.</p></section>`;
}

function autoRecyclePage(report, catalog) {
  const rows = [...report.candidates].sort(compareItemsByRarity).map((candidate) => itemCard({
    id: candidate.itemId, name: candidate.itemName, rarity: candidate.rarity,
    rarityName: catalogRarityName(catalog, candidate.rarity), icon: candidate.icon
  }, { count: candidate.owned, compact: true, className: 'auto-recycle-row item-card-picker',
    meta: [candidate.cityName, `${candidate.scrapsEach.toLocaleString('en-GB')} scraps each`,
      `${candidate.recyclable} recyclable`, ...(candidate.protected ? [`${candidate.protected} factory-made protected`] : []),
      ...(candidate.averagePrice === null ? [] : [`average ${formatGold(candidate.averagePrice)}g`])],
    action: `<div class="auto-recycle-choice"><label class="checkbox-line"><input type="checkbox" name="recycle_${candidate.cityId}_${candidate.itemId}" value="1"${candidate.suggested ? ' checked' : ''}> Select</label><label>Quantity<input type="number" name="quantity_${candidate.cityId}_${candidate.itemId}" min="1" max="${candidate.recyclable}" value="${candidate.suggested || 1}" required></label></div>`
  })).join('');
  const status = report.overBy
    ? `You have ${report.itemCount}/${report.itemLimit} things and need to remove ${report.overBy}. The lowest-value candidates are preselected.`
    : `You have ${report.itemCount}/${report.itemLimit} things and are within your limit. You can still recycle any unwanted stored things below.`;
  const hasSuggested = report.candidates.some((candidate) => candidate.suggested > 0);
  const lockedDetails = [report.protectedStored ? `${report.protectedStored} factory-made stored` : '',
    report.fittedOrCargo ? `${report.fittedOrCargo} fitted to mines or carried by vehicles` : ''].filter(Boolean).join(' and ');
  return `<section class="page-title"><div><p class="eyebrow">Inventory control</p><h1>Auto-Recycle</h1></div><a href="/inventory">Back to things</a></section><p>${status}</p>
    ${rows ? `<form class="auto-recycle-form" method="post" action="/mines/auto-recycle"><div class="auto-recycle-list">${rows}</div><button id="auto-recycle-submit"${hasSuggested ? '' : ' disabled'}>Recycle selected into Ore scraps</button></form><script src="/node/auto-recycle.js" defer></script>` : '<p>No recyclable things are stored in any city.</p>'}
    ${report.unresolved ? `<p class="capacity-warning">Even after recycling every available stored thing, you would remain ${report.unresolved} over the limit${lockedDetails ? ` because ${escapeHtml(lockedDetails)} things cannot be recycled here` : ''}.</p>` : ''}`;
}

function marketPage(player, catalog) {
  const warehouseName = catalogGadgetForBehavior(catalog, 'warehouse').displayName;
  const cityName = catalogCityForId(catalog, player.cityId).name;
  if (!(catalog.mineTypesByCity instanceof Map) || !catalog.mineTypesByCity.has(player.cityId)) {
    throw new Error(`Missing catalog mine availability for city ${player.cityId}.`);
  }
  const availableMineTypes = catalog.mineTypesByCity.get(player.cityId);
  const mines = availableMineTypes.filter((type) => type.creditCost > 0 && catalog.byMineType.has(type.id)).map((type) => `<article class="shop-card"><img src="${escapeHtml(type.icon)}" alt=""><div><h3>${escapeHtml(type.name)} Mine</h3><p>${type.creditCost} credits to buy · ${type.rentCost} credits for ${formatDuration(Number(catalog.settings.mine_rental_duration_ms))} · ${catalog.settings.starter_find_count} discoveries included</p></div><div><a class="button secondary" href="/market/mines/${type.id}">Gold market</a><form method="post" action="/market/mines/${type.id}/buy"><button ${player.credits < type.creditCost ? 'disabled' : ''}>Buy</button></form><form method="post" action="/market/mines/${type.id}/rent"><button class="secondary" ${player.credits < type.rentCost ? 'disabled' : ''}>Rent</button></form></div></article>`).join('');
  const containers = (player.containers ?? []).map((container) => `<article class="container-card"><div><h3>${escapeHtml(container.name)}</h3><p>+${container.capacity} permanent inventory capacity · ${container.owned} owned</p></div><form method="post" action="/market/containers/${container.id}/buy"><button ${player.credits < container.credits ? 'disabled' : ''}>Buy for ${container.credits} credits</button></form></article>`).join('');
  return `<section class="page-title"><div><p class="eyebrow">Mine shop</p><h1>Credits shop</h1></div><p>You have <strong>${player.credits} credits</strong>.</p></section>
    <section><h2>Buy a new mine in ${escapeHtml(cityName)}</h2><p>Mine types vary by city. Each mine includes ${catalog.settings.starter_find_count} waiting discoveries; active-mine limits still apply.</p><div class="shop-grid">${mines || '<p>No mines are sold in this city.</p>'}</div></section>
    <section><h2>Inventory containers</h2><p>The original container rule grants each type's capacity once; duplicate purchases remain owned but add no further capacity. Current capacity: <strong>${player.itemCount}/${player.itemLimit}</strong>${player.warehouseBonus ? ` including +${player.warehouseBonus} from an active ${escapeHtml(warehouseName)}` : ''}.</p><div class="container-grid">${containers}</div></section>
    <section class="battery-extension"><h2>Battery extension</h2><p>This purchase is optional: visiting Mines still recharges batteries for free. Each purchase first restores the normal meld-scaled charge when eligible, then adds ${formatDuration(Number(catalog.settings.battery_extension_ms))}.</p><form method="post" action="/market/battery-extension"><strong>+${formatDuration(Number(catalog.settings.battery_extension_ms))} · ${catalog.settings.battery_extension_cost_credits} credits</strong><button ${player.credits < Number(catalog.settings.battery_extension_cost_credits) || player.batteryRemaining <= 0 ? 'disabled' : ''}>Buy extension</button></form></section>`;
}

function exchangePage(player, catalog, purchaseListings, filters = {}) {
  const query = String(filters.query ?? '');
  const selectedType = String(filters.type ?? '');
  const selectedSort = ['recommended', 'rarity', 'price-asc', 'price-desc', 'name']
    .includes(filters.sort) ? filters.sort : 'recommended';
  const needle = query.trim().toLocaleLowerCase('en');
  const typedListings = purchaseListings.map((listing) => {
    const item = catalog.byId.get(listing.itemId);
    return item ? { ...listing, item, itemType: itemMarketType(item, catalog) } : null;
  }).filter(Boolean);
  const types = [...new Map(typedListings.map((listing) =>
    [listing.itemType.key, listing.itemType.label])).entries()]
    .sort((first, second) => first[1].localeCompare(second[1], 'en'));
  const compareName = (first, second) => first.item.name.localeCompare(second.item.name, 'en')
    || first.item.id - second.item.id;
  const sorters = {
    recommended: (first, second) => Number(second.item.rarity) - Number(first.item.rarity)
      || Number(first.price > player.gold) - Number(second.price > player.gold) || first.price - second.price
      || second.totalQuantity - first.totalQuantity || compareName(first, second),
    rarity: (first, second) => compareItemsByRarity(first.item, second.item) || first.price - second.price,
    'price-asc': (first, second) => first.price - second.price || compareName(first, second),
    'price-desc': (first, second) => second.price - first.price || compareName(first, second),
    name: compareName
  };
  const listings = typedListings.filter((listing) =>
    (!needle || listing.item.name.toLocaleLowerCase('en').includes(needle))
      && (!selectedType || listing.itemType.key === selectedType)
  ).sort(sorters[selectedSort]);
  const cards = listings.map((listing) => itemCard(listing.item, {
    count: listing.totalQuantity, countLabel: 'available', compact: true,
    showFixedValue: false, className: 'market-item-card',
    meta: [listing.itemType.label, `${formatGold(listing.price)}g each`, `Seller: ${listing.sellerName}`],
    action: `<form class="market-buy-form" method="post" action="/market/orders/${listing.orderId}/buy"><label><span>Qty</span><input type="number" name="quantity" min="1" max="${listing.orderQuantity}" value="1" aria-label="${escapeHtml(listing.item.name)} quantity"></label><button${player.gold < listing.price ? ' disabled' : ''}>Buy</button></form><a class="market-order-book" href="/market/items/${listing.item.id}">Order book</a>`
  })).join('');
  const typeOptions = types.map(([key, label]) => `<option value="${escapeHtml(key)}"${selectedType === key ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('');
  return `<section class="page-title"><div><p class="eyebrow">Local exchange</p><h1>Item markets</h1></div><p>Buy local stock in ${escapeHtml(catalogCityForId(catalog, player.cityId).name)}. You have <strong>${formatGold(player.gold)}g</strong>.</p></section>
    <form class="market-controls" method="get" action="/exchange"><label>Find<input name="q" value="${escapeHtml(query)}" placeholder="Item name"></label><label>Item type<select name="type"><option value="">All types</option>${typeOptions}</select></label><label>Sort<select name="sort"><option value="recommended"${selectedSort === 'recommended' ? ' selected' : ''}>Recommended</option><option value="rarity"${selectedSort === 'rarity' ? ' selected' : ''}>Rarity</option><option value="price-asc"${selectedSort === 'price-asc' ? ' selected' : ''}>Price: low to high</option><option value="price-desc"${selectedSort === 'price-desc' ? ' selected' : ''}>Price: high to low</option><option value="name"${selectedSort === 'name' ? ' selected' : ''}>Name</option></select></label><button>Apply</button>${query || selectedType || selectedSort !== 'recommended' ? '<a class="button secondary" href="/exchange">Reset</a>' : ''}</form>
    <p class="market-result-count"><strong>${listings.length}</strong> purchasable item type${listings.length === 1 ? '' : 's'}${purchaseListings.length !== listings.length ? ` from ${purchaseListings.length}` : ''}.</p>
    <div class="item-grid market-item-grid">${cards || '<p>No matching items are available to buy in this city.</p>'}</div>`;
}

function itemMarketPage(player, item, market, cityName) {
  const owned = player.inventory[item.id] ?? 0;
  const localPrice = market.fixedPrice;
  const priceExplanation = market.premium
    ? `This is outside the item’s origin cities, so the local price is ${formatGold((market.multiplier - 1) * 100)}% above its ${formatGold(market.basePrice)}g base value.`
    : market.hasOrigin ? 'This is an origin city, so the base value applies.'
      : 'This item has no fixed origin, so its base value applies in every city.';
  const orderRows = (orders, action, label) => orders.map((order) => `<tr><td>${escapeHtml(order.playerName)}</td><td>${order.quantity}</td><td>${formatGold(order.price)}g</td><td>${order.playerId === player.id
    ? `<form method="post" action="/market/orders/${order.id}/cancel"><button class="secondary">Cancel</button></form>`
    : `<form class="inline-order" method="post" action="/market/orders/${order.id}/${action}"><input type="number" name="quantity" min="1" max="${order.quantity}" value="1" aria-label="Quantity"><button>${label}</button></form>`}</td></tr>`).join('');
  const sales = market.sales.map((sale) => `<tr><td>${escapeHtml(sale.buyerName)}</td><td>${escapeHtml(sale.sellerName)}</td><td>${sale.quantity}</td><td>${formatGold(sale.price)}g</td></tr>`).join('');
  return `<section class="page-title"><div><p class="eyebrow">${escapeHtml(cityName)} market</p><h1>Item market</h1></div><p>You own <strong>${owned}</strong>, have <strong>${formatGold(player.gold)}g</strong>, and the fixed local value is <strong>${formatGold(localPrice)}g</strong>. ${priceExplanation}</p></section>
    <div class="item-market-subject">${itemCard(item, { count: owned, featured: true, description: item.description })}</div>
    <section class="trade-forms">
      <form method="post" action="/market/items/${item.id}/listings"><h2>List items</h2><p>Fixed local price: <strong>${formatGold(localPrice)}g each</strong>. Listed things move into market escrow and no longer count toward your inventory limit.</p><label>Quantity<input type="number" name="quantity" min="1" max="${owned}" value="1" required></label><button ${owned < 1 ? 'disabled' : ''}>Place listing</button></form>
      <form method="post" action="/market/items/${item.id}/bids"><h2>Place bid</h2><p>Fixed local price: <strong>${formatGold(localPrice)}g each</strong>.</p><label>Quantity<input type="number" name="quantity" min="1" value="1" required></label><button>Place bid</button></form>
    </section>
    <section><h2>Listings</h2><div class="table-scroll"><table><thead><tr><th>Seller</th><th>Quantity</th><th>Each</th><th></th></tr></thead><tbody>${orderRows(market.listings, 'buy', 'Buy') || '<tr><td colspan="4">No listings.</td></tr>'}</tbody></table></div></section>
    <section><h2>Bids</h2><div class="table-scroll"><table><thead><tr><th>Buyer</th><th>Quantity</th><th>Each</th><th></th></tr></thead><tbody>${orderRows(market.bids, 'sell', 'Sell') || '<tr><td colspan="4">No bids.</td></tr>'}</tbody></table></div></section>
    <section><h2>Recent sales</h2><div class="table-scroll"><table><thead><tr><th>Buyer</th><th>Seller</th><th>Quantity</th><th>Each</th></tr></thead><tbody>${sales || '<tr><td colspan="4">No sales yet.</td></tr>'}</tbody></table></div></section>`;
}

function mineMarketPage(player, market, cityName) {
  const orderRows = (orders, action, label) => orders.map((order) => `<tr><td>${escapeHtml(order.playerName)}</td><td>${order.quantity}</td><td>${formatGold(order.price)}g</td><td>${order.playerId === player.id
    ? `<form method="post" action="/market/mine-orders/${order.id}/cancel"><button class="secondary">Cancel</button></form>`
    : `<form class="inline-order" method="post" action="/market/mine-orders/${order.id}/${action}"><input type="number" name="quantity" min="1" max="${order.quantity}" value="1" aria-label="Quantity"><button>${label}</button></form>`}</td></tr>`).join('');
  const sales = market.sales.map((sale) => `<tr><td>${escapeHtml(sale.buyerName)}</td><td>${escapeHtml(sale.sellerName)}</td><td>${sale.quantity}</td><td>${formatGold(sale.price)}g</td></tr>`).join('');
  return `<section class="page-title"><div><p class="eyebrow">${escapeHtml(cityName)} mine market</p><h1><img class="table-icon" src="${escapeHtml(market.icon)}" alt=""> ${escapeHtml(market.name)} Mine</h1></div><p>You own <strong>${market.owned}</strong> here, may list <strong>${market.sellable}</strong>, and have <strong>${formatGold(player.gold)}g</strong>.</p></section>
    <p>Buy or sell an entire mine for gold. A miner must always keep at least one permanent mine. Purchased mines retain installed equipment, reset to things mode, and join the buyer's priority queue.</p>
    <section class="trade-forms">
      <form method="post" action="/market/mines/${market.mineTypeId}/listings"><h2>List mines</h2><label>Price per mine (gold)<input type="number" name="price" min="0.0001" step="0.0001" required></label><label>Quantity<input type="number" name="quantity" min="1" max="${market.sellable}" value="1" required></label><button ${market.sellable < 1 ? 'disabled' : ''}>Place listing</button></form>
      <form method="post" action="/market/mines/${market.mineTypeId}/bids"><h2>Place bid</h2><label>Price per mine (gold)<input type="number" name="price" min="0.0001" step="0.0001" required></label><label>Quantity<input type="number" name="quantity" min="1" value="1" required></label><button>Place bid</button></form>
    </section>
    <section><h2>Listings</h2><div class="table-scroll"><table><thead><tr><th>Seller</th><th>Quantity</th><th>Each</th><th></th></tr></thead><tbody>${orderRows(market.listings, 'buy', 'Buy') || '<tr><td colspan="4">No listings.</td></tr>'}</tbody></table></div></section>
    <section><h2>Bids</h2><div class="table-scroll"><table><thead><tr><th>Buyer</th><th>Quantity</th><th>Each</th><th></th></tr></thead><tbody>${orderRows(market.bids, 'sell', 'Sell') || '<tr><td colspan="4">No bids.</td></tr>'}</tbody></table></div></section>
    <section><h2>Recent sales</h2><div class="table-scroll"><table><thead><tr><th>Buyer</th><th>Seller</th><th>Quantity</th><th>Each</th></tr></thead><tbody>${sales || '<tr><td colspan="4">No sales yet.</td></tr>'}</tbody></table></div></section>`;
}

function factoryMarketPage(player, market, cityName, catalog) {
  const rental = market.marketType === 'rental';
  const noun = rental ? 'rental' : 'factory';
  const names = catalog.settings.factory_market_names;
  const icon = catalog.settings.factory_market_icon;
  if (!names || typeof names !== 'object' || Array.isArray(names)
    || typeof names[market.marketType] !== 'string' || !names[market.marketType]
    || typeof icon !== 'string' || !icon) {
    throw new Error('Invalid factory market presentation settings.');
  }
  const title = names[market.marketType];
  const orderRows = (orders, action, label) => orders.map((order) => `<tr><td>${escapeHtml(order.playerName)}</td><td>${order.quantity}</td><td>${formatGold(order.price)}g</td><td>${order.playerId === player.id
    ? `<form method="post" action="/market/factory-orders/${order.id}/cancel"><button class="secondary">Cancel</button></form>`
    : `<form class="inline-order" method="post" action="/market/factory-orders/${order.id}/${action}"><input type="number" name="quantity" min="1" max="${order.quantity}" value="1" aria-label="Quantity"><button>${label}</button></form>`}</td></tr>`).join('');
  const sales = market.sales.map((sale) => `<tr><td>${escapeHtml(sale.buyerName)}</td><td>${escapeHtml(sale.sellerName)}</td><td>${sale.quantity}</td><td>${formatGold(sale.price)}g</td></tr>`).join('');
  const manufacturer = catalogSpecialisationForBonus(catalog, 'factoryThroughput');
  const instructions = rental
    ? `Rent a built, idle factory for ${formatDuration(Number(catalog.settings.factory_rental_duration_ms))}. Rentals include no ore or workers, can only repair damaged things, and return automatically to their owner. An unfinished repair is canceled at expiry and its ore and damaged thing are returned to the renter. Any owner may list an idle factory from their home city.`
    : `Buy and sell whole built factories. A factory must be idle and under its owner’s control before it can be listed or transferred. Every specialisation can build and operate factories; ${escapeHtml(manufacturer.name)} works ${formatGold(Number(manufacturer.bonuses.factoryThroughput) * 100)}% faster.`;
  return `<section class="page-title"><div><p class="eyebrow">${escapeHtml(cityName)} factory market</p><h1><img class="table-icon" src="${escapeHtml(icon)}" alt=""> ${escapeHtml(title)}</h1></div><p>You ${rental ? 'currently rent' : 'own'} <strong>${market.owned}</strong> here, may list <strong>${market.sellable}</strong>, and have <strong>${formatGold(player.gold)}g</strong>.</p></section>
    <p>${instructions}</p>
    <section class="trade-forms">
      <form method="post" action="/market/factories/${market.marketType}/listings"><h2>List ${rental ? 'rentals' : 'factories'}</h2><label>Price per ${noun} (gold)<input type="number" name="price" min="0.0001" step="0.0001" required></label><label>Quantity<input type="number" name="quantity" min="1" max="${market.sellable}" value="1" required></label><button ${market.sellable < 1 ? 'disabled' : ''}>Place listing</button></form>
      <form method="post" action="/market/factories/${market.marketType}/bids"><h2>Place bid</h2><label>Price per ${noun} (gold)<input type="number" name="price" min="0.0001" step="0.0001" required></label><label>Quantity<input type="number" name="quantity" min="1" value="1" required></label><button>Place bid</button></form>
    </section>
    <section><h2>Listings</h2><div class="table-scroll"><table><thead><tr><th>Seller</th><th>Quantity</th><th>Each</th><th></th></tr></thead><tbody>${orderRows(market.listings, 'buy', rental ? 'Rent' : 'Buy') || '<tr><td colspan="4">No listings.</td></tr>'}</tbody></table></div></section>
    <section><h2>Bids</h2><div class="table-scroll"><table><thead><tr><th>Buyer</th><th>Quantity</th><th>Each</th><th></th></tr></thead><tbody>${orderRows(market.bids, 'sell', rental ? 'Rent out' : 'Sell') || '<tr><td colspan="4">No bids.</td></tr>'}</tbody></table></div></section>
    <section><h2>Recent contracts</h2><div class="table-scroll"><table><thead><tr><th>Buyer</th><th>Seller</th><th>Quantity</th><th>Each</th></tr></thead><tbody>${sales || '<tr><td colspan="4">No contracts yet.</td></tr>'}</tbody></table></div></section>
    <p><a href="/factories">Back to factories</a></p>`;
}

function playerMarketPage(market, cityName, catalog) {
  const rows = (side) => market.orders.filter((order) => order.side === side)
    .sort(compareItemsByRarity).map((order) => {
      const subject = order.itemId
        ? itemCard({ id: order.itemId, name: order.name, rarity: order.rarity,
          rarityName: catalogRarityName(catalog, order.rarity), icon: order.icon }, {
          compact: true, action: `<a class="button secondary" href="${order.href}">Market</a>`
        })
        : `<a class="market-subject" href="${order.href}"><img class="table-icon" src="${order.icon}" alt=""> ${escapeHtml(order.name)}</a>`;
      return `<tr><td>${subject}</td><td>${order.quantity}</td><td>${formatGold(order.price)}g</td></tr>`;
    }).join('');
  return `<section class="page-title"><div><p class="eyebrow">${escapeHtml(cityName)} market</p><h1>${escapeHtml(market.ownerName)}'s Listings and Bids</h1></div><a href="/miners/${encodeURIComponent(market.ownerName)}">Back to profile</a></section>
    <section><h2>Listings</h2><div class="table-scroll"><table><thead><tr><th>Market</th><th>Quantity</th><th>Each</th></tr></thead><tbody>${rows('sell') || '<tr><td colspan="3">No listings in this city.</td></tr>'}</tbody></table></div></section>
    <section><h2>Bids</h2><div class="table-scroll"><table><thead><tr><th>Market</th><th>Quantity</th><th>Each</th></tr></thead><tbody>${rows('buy') || '<tr><td colspan="3">No bids in this city.</td></tr>'}</tbody></table></div></section>`;
}

function minersPage(player, miners, catalog, query = '', ignores = []) {
  const ignoredIds = new Set(ignores.map((ignored) => ignored.id));
  const cards = miners.map((miner) => `<article class="miner-card"><div><h3><a href="/miners/${encodeURIComponent(miner.name)}">${escapeHtml(miner.name)}</a></h3><p>${escapeHtml(catalogCityForId(catalog, miner.cityId).name)} · ${miner.mineCount} mines · ${miner.itemCount} things</p></div><div class="miner-actions"><a class="button secondary" href="/messages/${encodeURIComponent(miner.name)}">Message</a>${miner.id === player.id ? '' : `<form method="post" action="/chat/ignores/${miner.id}"><input type="hidden" name="ignored" value="${ignoredIds.has(miner.id) ? '0' : '1'}"><button class="secondary">${ignoredIds.has(miner.id) ? 'Unignore chat' : 'Ignore chat'}</button></form>`}</div></article>`).join('');
  return `<section class="page-title"><div><p class="eyebrow">Community</p><h1>Miners</h1></div><p>Find other miners, inspect their discoveries, and start a private conversation.</p></section>
    <form class="market-search" method="get" action="/miners"><label>Find a miner<input name="q" value="${escapeHtml(query)}" placeholder="Miner name"></label><button>Search</button></form>
    <div class="miner-list">${cards || '<p>No matching miners.</p>'}</div>`;
}

function statsPage(stats) {
  const sections = stats.map(({ heading, rows, valueFormat }) => `<section class="stats-section"><h2>${escapeHtml(heading)}</h2><table><tbody>${rows.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${typeof value === 'number' && valueFormat === 'gold' ? `${formatGold(value)}g` : escapeHtml(value)}</td></tr>`).join('')}</tbody></table></section>`).join('');
  return `<section class="page-title"><div><p class="eyebrow">Public data</p><h1>Server Stats</h1></div><p>Live statistics based on miners whose batteries are charged.</p></section><div class="stats-grid">${sections}</div>`;
}

function adminTabs() {
  return '<nav class="rating-tabs" aria-label="Administration"><a href="/admin">Dashboard</a><a href="/admin/players">Miners</a><a href="/admin/routes">World routes</a><a href="/admin/world">World events</a><a href="/admin/payments">Payments</a><a href="/admin/announcement">Announcement</a><a href="/admin/audit">Audit log</a></nav>';
}

function adminDashboardPage(data) {
  const cards = [
    ['Miners', data.players], ['Active batteries', data.active], ['Suspended', data.suspended],
    ['Credits in circulation', data.credits], ['Gold in circulation', `${formatGold(data.gold)}g`],
    ['Item orders', data.item_orders], ['Mine orders', data.mine_orders],
    ['Factory orders', data.factory_orders], ['Recorded item sales', data.item_sales]
  ].map(([label, value]) => `<article><strong>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span></article>`).join('');
  return `${adminTabs()}<section class="page-title"><div><p class="eyebrow">Operations</p><h1>Administration</h1></div><p>The useful legacy controls, rebuilt against the live SQLite game with an audit trail.</p></section><div class="admin-metrics">${cards}</div>`;
}

function adminPlayersPage(players, query = '') {
  const rows = players.map((subject) => `<tr><td><a href="/admin/players/${subject.id}">${escapeHtml(subject.name)}</a>${subject.authority > 0 ? ' <strong>Admin</strong>' : ''}</td><td>${escapeHtml(subject.email || 'Not supplied')}<br><small>${subject.email_verified_at === null ? 'Verification pending' : 'Verified'}</small></td><td>${subject.mine_count}</td><td>${subject.item_count}</td><td>${subject.credits}c / ${formatGold(subject.gold)}g</td><td>${subject.suspended ? 'Suspended' : subject.chatBanned || subject.pmBanned ? 'Restricted' : subject.email_verified_at === null ? 'Email locked' : 'Active'}</td></tr>`).join('');
  return `${adminTabs()}<section class="page-title"><div><p class="eyebrow">Moderation</p><h1>Miners</h1></div></section><form class="market-search" method="get"><label>Search<input name="q" value="${escapeHtml(query)}" placeholder="Name or email"></label><button>Search</button></form><div class="table-scroll"><table><thead><tr><th>Miner</th><th>Email</th><th>Mines</th><th>Things</th><th>Balance</th><th>Status</th></tr></thead><tbody>${rows || '<tr><td colspan="6">No matching miners.</td></tr>'}</tbody></table></div>`;
}

function adminPlayerPage(subject, catalog) {
  const moderation = (field, active, label) => `<form method="post" action="/admin/players/${subject.id}/moderation"><input type="hidden" name="field" value="${field}"><input type="hidden" name="enabled" value="${active ? 0 : 1}"><button class="${active ? 'secondary' : ''}">${active ? `Lift ${label}` : label}</button></form>`;
  const itemOptions = catalog.items.map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('');
  return `${adminTabs()}<section class="page-title"><div><p class="eyebrow">Miner administration</p><h1>${escapeHtml(subject.name)}</h1></div><a href="/miners/${encodeURIComponent(subject.name)}">Public profile</a></section><div class="admin-metrics"><article><strong>${subject.credits}</strong><span>Credits</span></article><article><strong>${formatGold(subject.gold)}g</strong><span>Gold</span></article><article><strong>${subject.mine_count}</strong><span>Mines</span></article><article><strong>${subject.item_count}</strong><span>Things</span></article></div><section><h2>Email access</h2><p>${escapeHtml(subject.email || 'No address supplied')} · <strong>${subject.email_verified_at === null ? 'Verification pending — game locked' : `Verified ${new Date(subject.email_verified_at).toLocaleString('en-GB')}`}</strong></p></section><section><h2>Moderation</h2><div class="admin-actions">${moderation('suspended', Boolean(subject.suspended), 'Suspend account')}${moderation('chat', Boolean(subject.chat_banned), 'Ban public chat')}${moderation('pm', Boolean(subject.pm_banned), 'Ban private messages')}</div></section><section><h2>Grants</h2><div class="trade-forms"><form method="post" action="/admin/players/${subject.id}/grant"><input type="hidden" name="kind" value="credits"><label>Credits<input type="number" name="amount" min="1" required></label><button>Grant credits</button></form><form method="post" action="/admin/players/${subject.id}/grant"><input type="hidden" name="kind" value="gold"><label>Gold (whole units)<input type="number" name="amount" min="1" required></label><button>Grant gold</button></form><form method="post" action="/admin/players/${subject.id}/grant"><input type="hidden" name="kind" value="item"><label>Thing<select name="itemId">${itemOptions}</select></label><label>Quantity<input type="number" name="amount" min="1" required></label><button>Grant thing</button></form></div></section>`;
}

function adminAnnouncementPage() {
  return `${adminTabs()}<section class="page-title"><div><p class="eyebrow">Global message</p><h1>Send announcement</h1></div><p>Delivered as an Admin message to every miner’s inbox.</p></section><form class="account-grid" method="post" action="/admin/announcement"><label>Subject<input name="subject" maxlength="120" required></label><label>Message<textarea name="body" maxlength="4000" rows="10" required></textarea></label><button>Send to every miner</button></form>`;
}

function adminAuditPage(entries) {
  const rows = entries.map((entry) => `<tr><td>${new Date(entry.created_at).toLocaleString('en-GB')}</td><td>${escapeHtml(entry.administrator_name)}</td><td>${escapeHtml(entry.action)}</td><td>${escapeHtml(entry.subject_name ?? 'All miners')}</td><td>${escapeHtml(entry.details)}</td></tr>`).join('');
  return `${adminTabs()}<section class="page-title"><div><p class="eyebrow">Accountability</p><h1>Audit log</h1></div></section><div class="table-scroll"><table><thead><tr><th>When</th><th>Administrator</th><th>Action</th><th>Subject</th><th>Details</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No administrative actions yet.</td></tr>'}</tbody></table></div>`;
}

function adminRoutesPage(routes, catalog) {
  const routeTypes = catalog.settings.map_route_types;
  const rows = routes.map((route) => {
    const type = routeTypes[route.type]?.label ?? `Type ${route.type}`;
    return `<tr><td><strong>${escapeHtml(route.map1_name)}</strong><br><small>${escapeHtml(route.city1_name)}</small></td><td><strong>${escapeHtml(route.map2_name)}</strong><br><small>${escapeHtml(route.city2_name)}</small></td><td>${escapeHtml(type)}</td><td>${Number(route.length).toLocaleString('en-GB')} km</td><td><strong>${route.open ? 'Open' : 'Closed'}</strong></td><td><form method="post" action="/admin/routes/${route.id}"><input type="hidden" name="open" value="${route.open ? 0 : 1}"><button class="${route.open ? 'secondary' : ''}">${route.open ? 'Close route' : 'Open route'}</button></form></td></tr>`;
  }).join('');
  return `${adminTabs()}<section class="page-title"><div><p class="eyebrow">World network</p><h1>Inter-map routes</h1></div><p>Closed corridors cannot be selected for travel. Opening one affects new departures immediately; vehicles already underway continue normally.</p></section><div class="table-scroll"><table><thead><tr><th>From</th><th>To</th><th>Mode</th><th>Distance</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function adminWorldEventsPage(state, catalog, currentTime) {
  const conditions = [
    ['clear', 'Clear'], ['cloud', 'Cloud'], ['rain', 'Rain'], ['storm', 'Storm']
  ];
  const weatherForms = state.weather.map((entry) => `<form method="post" action="/admin/world/weather"><input type="hidden" name="mapId" value="${entry.mapId}"><h3>${escapeHtml(entry.mapName)}</h3><label>Condition<select name="condition">${conditions.map(([value, label]) => `<option value="${value}"${entry.condition === value ? ' selected' : ''}>${label}</option>`).join('')}</select></label><label>Temperature C<input type="number" name="temperatureC" min="-50" max="60" step="0.1" value="${entry.temperatureC}" required></label><label>Wind km/h<input type="number" name="windKph" min="0" max="300" step="1" value="${entry.windKph}" required></label><label>Rainfall mm<input type="number" name="rainfallMm" min="0" max="500" step="0.1" value="${entry.rainfallMm}" required></label><button>Change current weather</button></form>`).join('');
  const mapOptions = state.maps.map((map) =>
    `<option value="${map.id}">${escapeHtml(map.name)}</option>`).join('');
  const routeTypeId = (name) => catalog.settings.map_route_types
    .findIndex((entry) => entry.name === name);
  const routeOptions = (name) => state.routes.filter((route) => route.type === routeTypeId(name))
    .map((route) => `<option value="${route.id}">${escapeHtml(route.map1_name)}: ${escapeHtml(route.city1_name)} to ${escapeHtml(route.map2_name)}: ${escapeHtml(route.city2_name)} (${Number(route.length).toLocaleString('en-GB')} km)</option>`).join('');
  const creatureTiers = catalog.rarities.filter((rarity) =>
    Number(catalog.settings.world_creature_tier_weights[rarity.id]) > 0);
  const tierOptions = creatureTiers.map((rarity) =>
    `<option value="${rarity.id}">${escapeHtml(catalog.settings.rarity_color_names[rarity.id])} · Tier ${rarity.id}</option>`).join('');
  const creatureOptions = (routeType) => Object.entries(
    catalog.settings.world_creature_route_types
  ).filter(([, behavior]) => behavior === routeType).map(([type]) =>
    `<option value="${escapeHtml(type)}">${escapeHtml(catalog.settings.world_creature_names[type])}</option>`).join('');
  const creatureForm = (label, routeType) => `<form method="post" action="/admin/world/creatures"><h3>Release ${label}</h3><label>Species<select name="type" required>${creatureOptions(routeType)}</select></label><label>Creature tier<select name="rarity" required>${tierOptions}</select></label><label>World map<select name="mapId">${mapOptions}</select></label><label>Open ${routeType} route<select name="routeId" required>${routeOptions(routeType)}</select></label><button>Release creature</button></form>`;
  const creatureRows = state.creatures.map((creature) => {
    const distance = creature.destination_city_id
      ? (Number(creature.destination_city_id) === Number(creature.city1_id)
        ? Number(creature.location) : Number(creature.length) - Number(creature.location))
      : 0;
    const reward = creature.reward_type === 'ore'
      ? `${Number(creature.ore_drop).toLocaleString('en-GB')} Ore`
      : 'Treasure hold';
    return `<tr class="rarity-${creature.rarity}"><td><span class="creature-table-icon" aria-hidden="true">${escapeHtml(creature.icon)}</span> <strong>${escapeHtml(creature.name)}</strong><br><small>${escapeHtml(creature.rarity_name)} · ${escapeHtml(reward)}</small></td><td>${escapeHtml(creature.map_name)}</td><td>${escapeHtml(creature.city1_name)} to ${escapeHtml(creature.city2_name)}</td><td>${Math.round(Number(creature.location)).toLocaleString('en-GB')} / ${Number(creature.length).toLocaleString('en-GB')} km</td><td>${Number(creature.speed).toFixed(1)} km/h</td><td>${Math.round(Number(creature.hp))} / ${Math.round(Number(creature.max_hp))}</td><td>${escapeHtml(creature.destination_city_name)} in ${formatDuration(Math.max(0, Number(creature.arrives_at) - currentTime))}</td><td>${Number(creature.pursuer_count)}</td></tr>`;
  }).join('');
  const ghostForm = (kind, label, routeType) => `<form method="post" action="/admin/world/ghosts"><input type="hidden" name="kind" value="${kind}"><h3>Raise ${label}</h3><label>Open ${routeType} route<select name="routeId" required>${routeOptions(routeType)}</select></label><label>Vehicle tier<select name="rarity">${tierOptions}</select></label><button>Raise ${label}</button></form>`;
  const ghostRows = state.ghosts.map((ghost) => `<tr><td>${escapeHtml(ghost.name)}</td><td>${ghost.ghost_kind === 'ship' ? 'Ghost Ship' : 'Ghost Rider'}</td><td>Tier ${ghost.rarity}</td><td>${escapeHtml(ghost.routeName)}</td><td>${new Date(ghost.risen_at).toLocaleString('en-GB')}</td></tr>`).join('');
  const namedCounts = (names) => {
    const counts = new Map();
    for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
    return [...counts].map(([name, count]) => `${count > 1 ? `${count}× ` : ''}${escapeHtml(name)}`);
  };
  const trafficRows = state.transports.map((transport) => {
    const type = catalog.settings.map_route_types[transport.routeType]?.label
      ?? `Type ${transport.routeType}`;
    const order = catalog.settings.travel_order_names[transport.travelOrder]
      ?? transport.travelOrder;
    const engaged = vehicleRarities(catalog).filter(
      (rarity) => transport.aggressiveMask & (1 << rarity.id)
    ).map((rarity) => rarity.name);
    const cargoQuantity = transport.cargo.reduce(
      (sum, item) => sum + Number(item.quantity), 0);
    const fittings = namedCounts([
      ...transport.mods, ...transport.weapons, ...transport.cannons
    ]);
    const cargo = transport.cargo.map((item) =>
      `<li><a href="/items/${item.itemId}">${item.quantity > 1 ? `${item.quantity}× ` : ''}${escapeHtml(item.name)}</a></li>`).join('');
    const owner = transport.npc ? `<strong>${escapeHtml(transport.playerName)}</strong>`
      : `<a href="/admin/players/${transport.playerId}">${escapeHtml(transport.playerName)}</a>`;
    const flags = [transport.ghostId ? (transport.ghostKind === 'ship' ? 'Ghost Ship' : 'Ghost Rider') : '',
      transport.creatureId ? `Pursuing ${transport.creatureName}` : '',
      transport.interMap ? 'Inter-map' : '', transport.damaged ? 'Damaged' : '',
      transport.aircraftDestroyed ? 'Shot down' : ''].filter(Boolean);
    const origin = transport.originMapName === transport.destinationMapName
      ? transport.originName : `${transport.originMapName} / ${transport.originName}`;
    const destination = transport.originMapName === transport.destinationMapName
      ? transport.destinationName : `${transport.destinationMapName} / ${transport.destinationName}`;
    const loadoutSummary = `${cargoQuantity} cargo · ${fittings.length} fitting type${fittings.length === 1 ? '' : 's'}${transport.ammunition ? ` · ${transport.ammunition} shots` : ''}`;
    const loadout = `<details><summary>${escapeHtml(loadoutSummary)}</summary>${cargo ? `<strong>Cargo</strong><ul>${cargo}</ul>` : '<p>No cargo.</p>'}${fittings.length ? `<strong>Fittings</strong><ul>${fittings.map((name) => `<li>${name}</li>`).join('')}</ul>` : '<p>No fittings.</p>'}</details>`;
    return `<tr${transport.ghostId ? ' class="admin-traffic-ghost"' : ''}><td>${owner}<br><small>#${transport.playerId}</small></td><td><img class="table-icon" src="${escapeHtml(transport.icon)}" alt=""> <a href="/items/${transport.itemId}"><strong>${escapeHtml(transport.vehicleName)}</strong></a><br><small>${escapeHtml(transport.itemName)} · Tier ${transport.rarity}${flags.length ? ` · ${escapeHtml(flags.join(' · '))}` : ''}</small>${loadout}</td><td><strong>${escapeHtml(origin ?? 'Unknown')}</strong> → <strong>${escapeHtml(destination ?? 'Unknown')}</strong><br><small>${escapeHtml(type)} · ${Number(transport.length ?? 0).toLocaleString('en-GB')} km · ${Number(transport.speed).toFixed(1)} km/h</small></td><td><div class="admin-traffic-progress"><span style="width:${(transport.progress * 100).toFixed(1)}%"></span></div><strong>${(transport.progress * 100).toFixed(1)}%</strong><br><small>ETA ${new Date(transport.arrivesAt).toLocaleString('en-GB')} · ${formatDuration(Math.max(0, transport.arrivesAt - currentTime))}</small></td><td><strong>${escapeHtml(order)}</strong>${engaged.length ? `<br><small>Engages ${escapeHtml(engaged.join(', '))}${transport.aggressiveVsSentry ? ' + patrols' : ''}</small>` : ''}</td></tr>`;
  }).join('');
  const creatureTrafficRows = state.creatures.map((creature) => {
    const routeType = catalog.settings.map_route_types[creature.route_type]?.label
      ?? `Type ${creature.route_type}`;
    const reward = creature.reward_type === 'ore'
      ? `${Number(creature.ore_drop).toLocaleString('en-GB')} Ore drop`
      : 'Treasure bounty';
    return `<tr class="admin-traffic-creature rarity-${creature.rarity}"><td><strong>World event</strong><br><small>Route actor #${creature.id}</small></td><td><span class="creature-table-icon" aria-hidden="true">${escapeHtml(creature.icon)}</span> <strong>${escapeHtml(creature.name)}</strong><br><small>${escapeHtml(creature.rarity_name)} · ${escapeHtml(reward)} · ${Math.round(Number(creature.hp))}/${Math.round(Number(creature.max_hp))} health</small></td><td><strong>${escapeHtml(creature.city1_name)}</strong> ↔ <strong>${escapeHtml(creature.city2_name)}</strong><br><small>${escapeHtml(routeType)} · ${Number(creature.length).toLocaleString('en-GB')} km · ${Number(creature.speed).toFixed(1)} km/h toward ${escapeHtml(creature.destination_city_name)}</small></td><td><div class="admin-traffic-progress"><span style="width:${(creature.progress * 100).toFixed(1)}%"></span></div><strong>${(creature.progress * 100).toFixed(1)}%</strong><br><small>ETA ${new Date(creature.arrives_at).toLocaleString('en-GB')} · ${formatDuration(Math.max(0, creature.arrives_at - currentTime))}</small></td><td><strong>Advance</strong><br><small>${Number(creature.pursuer_count)} hunter${Number(creature.pursuer_count) === 1 ? '' : 's'} pursuing</small></td></tr>`;
  }).join('');
  const activeTransportCount = state.transports.length + state.creatures.length;
  const allTrafficRows = `${trafficRows}${creatureTrafficRows}`;
  return `${adminTabs()}<section class="page-title"><div><p class="eyebrow">Live world control</p><h1>World control</h1></div><a href="/events">Player view</a></section>
    <section><h2>The restless dead</h2><p>Ghosts normally rise from vehicles destroyed in combat, storms, or creature attacks. Administrative ghosts use the same route movement, combat classes, patrol orders, and spectral bounty.</p><div class="trade-forms">${ghostForm('rider', 'Ghost Rider', 'land')}${ghostForm('ship', 'Ghost Ship', 'sea')}</div><div class="table-scroll"><table><thead><tr><th>Name</th><th>Kind</th><th>Tier</th><th>Route</th><th>Risen</th></tr></thead><tbody>${ghostRows || '<tr><td colspan="5">No ghosts currently haunt the routes.</td></tr>'}</tbody></table></div></section>
    <section><div class="section-heading"><div><h2>Ghost-hunter test fleet</h2><p>${Number(state.hunterFleets.players)} miners currently hold ${Number(state.hunterFleets.vehicles)} provisioned craft.</p></div></div><p>Give every real account one fully armed land vehicle and ship at each of the six tiers, distributed among random compatible cities. The operation is idempotent.</p><form method="post" action="/admin/world/ghost-fleets"><button>Provision all hunter fleets</button></form></section>
    <section id="traffic"><div class="section-heading"><div><p class="eyebrow">Administrator only</p><h2>Transports in transit</h2><p>${activeTransportCount} active journey${activeTransportCount === 1 ? '' : 's'}, including player, ghost, and creature route actors. This board updates when transport state changes.</p></div></div><div class="table-scroll"><table class="admin-traffic-table"><thead><tr><th>Owner</th><th>Transport and loadout</th><th>Journey</th><th>Progress</th><th>Orders</th></tr></thead><tbody>${allTrafficRows || '<tr><td colspan="5">No transports are currently in transit.</td></tr>'}</tbody></table></div></section>
    <section><div class="section-heading"><div><h2>Current weather slot</h2><p>${new Date(state.slotAt).toLocaleString('en-GB')} - ${new Date(state.slotAt + state.slotMs).toLocaleString('en-GB')} | ${formatDuration(state.slotAt + state.slotMs - currentTime)} remaining</p></div></div><div class="trade-forms">${weatherForms}</div></section>
    <section><h2>Release a world creature</h2><p>Choose a sea or land species and an explicit Yellow-through-Orange tier. Every creature follows the same open-route movement, combat-class interception, live transit, and killer-only reward process.</p><div class="trade-forms">${creatureForm('Sea creature', 'sea')}${creatureForm('Land creature', 'land')}</div></section>
    <section><h2>Traveling creatures</h2><div class="table-scroll"><table><thead><tr><th>Creature</th><th>Map</th><th>Route</th><th>Position</th><th>Speed</th><th>Health</th><th>Heading for</th><th>Attackers</th></tr></thead><tbody>${creatureRows || '<tr><td colspan="8">No creatures are currently active.</td></tr>'}</tbody></table></div></section>`;
}

function profilePage(subject, catalog, ownProfile, currentTime, filters = {}, knownCityIds = []) {
  const armoryGadget = catalogGadgetForBehavior(catalog, 'armory');
  const armory = subject.gadgets.some(
    (gadget) => gadget.behaviorKey === armoryGadget?.behaviorKey
      && gadget.expiresAt > currentTime
  );
  const hiddenByArmory = (item) => armory && (
    catalog.weaponByItemId.has(item.id) || catalog.modByItemId.has(item.id)
    || catalog.cannonByItemId.has(item.id) || catalog.cannonballByItemId.has(item.id)
    || catalog.boxByItemId.has(item.id)
  );
  const requestedCityId = String(filters.cityId ?? '').trim();
  const requestedMineTypeId = String(filters.mineTypeId ?? '').trim();
  const selectedCityId = requestedCityId && Number.isSafeInteger(Number(requestedCityId))
    ? Number(requestedCityId) : null;
  const selectedMineTypeId = requestedMineTypeId
    && Number.isSafeInteger(Number(requestedMineTypeId)) ? Number(requestedMineTypeId) : null;
  const functionMineGroups = catalog.settings.profile_function_mine_type_ids;
  if (!functionMineGroups || typeof functionMineGroups !== 'object') {
    throw new Error('Missing catalog setting: profile_function_mine_type_ids.');
  }
  const functionNames = Object.keys(functionMineGroups);
  const selectedFunction = functionNames.includes(filters.functionName)
    ? filters.functionName : '';
  const selectedFunctionMineTypes = selectedFunction ? functionMineGroups[selectedFunction] : [];
  if (!Array.isArray(selectedFunctionMineTypes)) {
    throw new Error('Invalid profile mine-type group: ' + selectedFunction + '.');
  }
  const functionMineTypeIds = new Set(
    selectedFunctionMineTypes.map(Number).filter(Number.isSafeInteger)
  );
  const totals = new Map();
  for (const [cityId, cityInventory] of Object.entries(subject.inventoryByCity)) {
    if (selectedCityId && Number(cityId) !== selectedCityId) continue;
    for (const [itemId, count] of Object.entries(cityInventory)) {
      const item = catalog.byId.get(Number(itemId));
      if (!item || hiddenByArmory(item)) continue;
      if (selectedMineTypeId && item.mineTypeId !== selectedMineTypeId) continue;
      if (selectedFunction && !functionMineTypeIds.has(item.mineTypeId)) continue;
      totals.set(item.id, (totals.get(item.id) ?? 0) + count);
    }
  }
  const inventory = [...totals].map(([itemId, count]) => [catalog.byId.get(itemId), count])
    .sort(([first], [second]) => compareItemsByRarity(first, second));
  const visibleInventory = filters.loadAll ? inventory
    : inventory.slice(0, Number(catalog.settings.profile_inventory_page_size));
  const things = visibleInventory.map(([item, count]) => itemCard(item, count)).join('');
  const globalCount = Object.values(subject.inventoryByCity).reduce((total, cityInventory) =>
    total + Object.values(cityInventory).reduce((cityTotal, count) => cityTotal + count, 0), 0);
  const filteredCount = inventory.reduce((total, [, count]) => total + count, 0);
  const cityOptions = catalog.cities.filter((city) => knownCityIds.includes(city.id))
    .map((city) => `<option value="${city.id}"${selectedCityId === city.id ? ' selected' : ''}>${escapeHtml(city.name)}</option>`).join('');
  const hiddenMineTypeIds = new Set(
    catalog.settings.profile_hidden_mine_type_ids.map(Number)
  );
  const mineOptions = catalog.mineTypes.filter((mineType) => !hiddenMineTypeIds.has(mineType.id))
    .sort((first, second) => first.name.localeCompare(second.name))
    .map((mineType) => `<option value="${mineType.id}"${selectedMineTypeId === mineType.id ? ' selected' : ''}>${escapeHtml(mineType.name)}</option>`).join('');
  const inventoryFilters = `<form class="profile-inventory-filter" method="get"><label>Function<select name="function"><option value="">All</option>${functionNames.map((name) => `<option${selectedFunction === name ? ' selected' : ''}>${escapeHtml(name)}</option>`).join('')}</select></label><label>Mine<select name="mineType"><option value="">All</option>${mineOptions}</select></label><label>City<select name="city"><option value="">All discovered cities</option>${cityOptions}</select></label><label class="checkbox-line"><input type="checkbox" name="all" value="1"${filters.loadAll ? ' checked' : ''}> Show every item type</label><button>Filter</button></form>`;
  const description = subject.description
    ? `<p class="profile-description">${escapeHtml(subject.description)}</p>`
    : '<p class="profile-description muted">This miner has not written a profile yet.</p>';
  const editor = ownProfile
    ? `<div class="profile-tools"><a class="profile-action" href="#profile-description"><img src="/img/icons/icon_profileimage.png" alt=""> Change description</a><a class="profile-action" href="/miners/${encodeURIComponent(subject.name)}/market"><img src="/img/icons/icon_listing.png" alt=""> Listings and bids</a></div><form id="profile-description" class="profile-editor" method="post" action="/profile"><label>Profile description<textarea name="description" maxlength="${Number(catalog.settings.profile_description_max_length)}" rows="6">${escapeHtml(subject.description)}</textarea></label><button>Save profile</button></form>`
    : `<div class="profile-tools"><a class="profile-action" href="/messages/${encodeURIComponent(subject.name)}"><img src="/img/icons/icon_message.png" alt=""> Send message</a><a class="profile-action" href="#gold-gift"><img src="/img/icons/icon_gold.png" alt=""> Send gold</a><a class="profile-action" href="/miners/${encodeURIComponent(subject.name)}/market"><img src="/img/icons/icon_listing.png" alt=""> Listings and bids</a></div><form id="gold-gift" class="profile-editor" method="post" action="/miners/${encodeURIComponent(subject.name)}/gold-gift"><h2>Send gold</h2><label>Amount<input type="number" name="amount" min="0.0001" step="0.0001" required></label><label>Note<input name="note" maxlength="${Number(catalog.settings.gold_transfer_note_max_length)}"></label><button>Send gift</button></form>`;
  const profession = catalogSpecialisationForId(catalog, subject.profession);
  const mines = subject.showMines === false ? '' : subject.mines.map((mine) => {
    const type = catalogMineTypeForId(catalog, mine.mineTypeId);
    return `<li><img class="table-icon" src="${escapeHtml(type.icon)}" alt=""> ${escapeHtml(type.name)} Mine · ${escapeHtml(catalogCityForId(catalog, mine.cityId).name)}</li>`;
  }).join('');
  return `<section class="page-title"><div><p class="eyebrow">Miner profile</p><h1>${escapeHtml(subject.name)}</h1></div>${editor}</section>
    <section class="profile-about">${avatarStack(subject.avatarLayers, `${subject.name} avatar`)}<div><h2>About</h2><p><strong>${escapeHtml(subject.professionTitle)} ${escapeHtml(profession.name)}</strong> · ${subject.meldIds.length} melds · <a href="/melds/compare/${encodeURIComponent(subject.name)}">Compare melds</a></p>${description}${ownProfile ? '<p><a class="button secondary" href="/avatar">Edit avatar</a></p>' : ''}</div></section>
    ${subject.showMines === false ? '' : `<section><h2>Mines</h2><ul>${mines || '<li>No mines.</li>'}</ul></section>`}
    <section><h2>Inventory</h2><p>${filteredCount} matching things · ${globalCount} globally. The “announce Purple and Orange finds” account setting controls chat announcements, not profile inventory.</p>${inventoryFilters}${armory ? `<p class="muted">An active ${escapeHtml(armoryGadget.displayName)} conceals this miner’s weapons and fittings.</p>` : ''}<div class="item-grid">${things || '<p>No matching things.</p>'}</div>${!filters.loadAll && inventory.length > visibleInventory.length ? `<p><a href="?function=${encodeURIComponent(selectedFunction)}&mineType=${selectedMineTypeId ?? ''}&city=${selectedCityId ?? ''}&all=1">Show ${inventory.length - visibleInventory.length} more item types</a></p>` : ''}</section>`;
}

function accountPage(player, catalog) {
  const passwordMinimum = Number(catalog.settings.password_min_length);
  return `<section class="page-title"><div><p class="eyebrow">Miner settings</p><h1>Account</h1></div><a href="/miners/${encodeURIComponent(player.name)}">View profile</a></section>
    <section class="account-grid">
      <form method="post" action="/account/password"><h2>Change password</h2><label>Old password<input type="password" name="oldPassword" autocomplete="current-password" required></label><label>New password<input type="password" name="password" minlength="${passwordMinimum}" autocomplete="new-password" required></label><label>Confirm new password<input type="password" name="confirmPassword" minlength="${passwordMinimum}" autocomplete="new-password" required></label><button>Change password</button></form>
      <form method="post" action="/account/email"><h2>Verified email</h2><p><strong class="verified-state">Verified</strong> ${escapeHtml(player.email)}</p><p>Changing this address locks the account until the replacement address is verified.</p><label>New email<input type="email" name="email" maxlength="${Number(catalog.settings.email_max_length)}" value="${escapeHtml(player.email)}" autocomplete="email" required></label><label>Current password<input type="password" name="password" autocomplete="current-password" required></label><button>Change and verify email</button></form>
      <form method="post" action="/account/privacy"><h2>Privacy</h2><label class="checkbox-line"><input type="checkbox" name="publishFindings"${player.publishFindings ? ' checked' : ''}> Announce my Purple and Orange finds in chat</label><label class="checkbox-line"><input type="checkbox" name="showMines"${player.showMines ? ' checked' : ''}> Show mines in profile</label><button>Save privacy settings</button></form>
    </section>`;
}

function avatarEditorPage(player, catalog) {
  const selected = new Map(player.avatarLayers.map((layer) => [layer.typeId, layer.id]));
  const availableItems = player.inventoryByCity[player.homeCityId] ?? {};
  const existingIds = new Set(player.avatarLayers.map((layer) => layer.id));
  const requiredTypeIds = new Set(catalog.settings.avatar_required_type_ids.map(Number));
  const groups = catalog.avatarElementTypes.map((type) => {
    const choices = catalog.avatarElements.filter((element) => element.typeId === type.id
      && ((availableItems[element.itemId] ?? 0) > 0 || existingIds.has(element.id)))
      .map((element) => ({ ...element, item: catalog.byId.get(element.itemId) })).filter((element) => element.item)
      .sort((a, b) => compareItemsByRarity(a.item, b.item));
    const required = requiredTypeIds.has(type.id);
    const options = choices.map((element) => itemCard(element.item, {
      compact: true, className: 'item-card-picker',
      meta: type.name,
      action: `<label><input type="radio" name="type_${type.id}" value="${element.id}"${selected.get(type.id) === element.id ? ' checked' : ''}${required ? ' required' : ''}> Use</label>`
    })).join('');
    const none = required ? '' : `<label class="item-picker-none"><input type="radio" name="type_${type.id}" value=""${selected.has(type.id) ? '' : ' checked'}> No ${escapeHtml(type.name.toLowerCase())}</label>`;
    return `<fieldset class="item-picker avatar-item-picker"><legend>${escapeHtml(type.name)}</legend>${none}<div class="item-picker-grid">${options || '<p>No matching avatar items in your home city.</p>'}</div></fieldset>`;
  }).join('');
  return `<section class="page-title"><div><p class="eyebrow">Profile</p><h1>Avatar Editor</h1></div><a href="/miners/${encodeURIComponent(player.name)}">Back to profile</a></section>
    <section class="avatar-editor">${avatarStack(player.avatarLayers, 'Current avatar')}<form method="post" action="/avatar"><p>Avatar things must be stored in your home city. A border, background, and model are required; gendered layers must match.</p>${groups}<button>Save avatar</button></form></section>`;
}

function meldComparisonPage(player, other, catalog) {
  const own = new Set(player.meldIds);
  const theirs = new Set(other.meldIds);
  const rows = catalog.melds.filter((meld) => meld.public && (own.has(meld.id) || theirs.has(meld.id)))
    .map((meld) => `<tr><td><a href="/melds/${meld.id}">${escapeHtml(meld.name)}</a></td><td>${own.has(meld.id) ? 'Yes' : '—'}</td><td>${theirs.has(meld.id) ? 'Yes' : '—'}</td></tr>`).join('');
  return `<section class="page-title"><div><p class="eyebrow">Meld comparison</p><h1>${escapeHtml(player.name)} and ${escapeHtml(other.name)}</h1></div><a href="/miners/${encodeURIComponent(other.name)}">Back to profile</a></section><table><thead><tr><th>Meld</th><th>You</th><th>${escapeHtml(other.name)}</th></tr></thead><tbody>${rows || '<tr><td colspan="3">Neither miner has a public meld yet.</td></tr>'}</tbody></table>`;
}

const MESSAGE_TYPE_FILTERS = [
  ['all', 'All'], ['PM', 'PM'], ['Market', 'Market'], ['Vehicle', 'Vehicle'],
  ['City', 'City'], ['Factory', 'Factory'], ['Transfer', 'Transfer'],
  ['Stone', 'Stone'], ['Machine', 'Machine'], ['Admin', 'Admin']
];

function normalizedMessageTypeFilter(value) {
  const requested = String(value ?? 'all');
  return MESSAGE_TYPE_FILTERS.find(([type]) => type.toLowerCase() === requested.toLowerCase())?.[0]
    ?? 'all';
}

function messagesPath(filter = 'all', type = 'all') {
  const query = new URLSearchParams({ filter, type });
  return `/messages?${query}`;
}

function messagesPage(player, messages, catalog, filter = 'all', type = 'all') {
  const retentionMs = Number(catalog.settings.message_retention_ms);
  const retentionDays = Math.round(retentionMs / (24 * 60 * 60 * 1000));
  const stateFilters = [['all', 'All'], ['unread', 'Unread'], ['deleted', 'Deleted']]
    .map(([value, label]) => `<a class="${filter === value ? 'active' : ''}" href="${messagesPath(value, type)}">${label}</a>`).join('');
  const typeFilters = MESSAGE_TYPE_FILTERS
    .map(([value, label]) => `<a class="${type === value ? 'active' : ''}" href="${messagesPath(filter, value)}">${label}</a>`).join('');
  const rows = messages.map((message) => {
    const other = message.senderName || 'MineThings';
    const privateMessage = !message.system && message.messageType === 'PM';
    const sender = privateMessage
      ? `<a href="/messages/${encodeURIComponent(other)}">${escapeHtml(other)}</a>`
      : escapeHtml(other);
    const subject = message.subject || `${message.messageType} message`;
    const heading = privateMessage
      ? `From ${sender}`
      : `<span class="message-type">${escapeHtml(message.messageType)}</span><a class="message-subject" href="/messages/view/${message.id}">${escapeHtml(subject)}</a>`;
    const nextReadAction = message.read ? 'unread' : 'read';
    const nextReadLabel = message.read ? 'Mark unread' : 'Mark read';
    const retention = message.kept
      ? '<span class="message-kept">Kept</span>'
      : `<span class="message-expiry">Deletes ${new Date(message.createdAt + retentionMs).toLocaleDateString('en-GB')}</span>`;
    return `<article class="message-row ${!message.read ? 'unread' : ''}${message.kept ? ' kept' : ''}">
      <input type="checkbox" name="message_${message.id}" value="1" form="message-bulk" aria-label="Select message from ${escapeHtml(other)}">
      <div class="message-summary"><strong>${heading}</strong><span class="message-preview">${escapeHtml(message.body.slice(
        0, Number(catalog.settings.message_preview_length)))}</span></div>
      <time>${new Date(message.createdAt).toLocaleString('en-GB')}<small>${retention}</small></time>
      <form class="message-actions" method="post" action="/messages/actions">
        <input type="hidden" name="message_${message.id}" value="1"><input type="hidden" name="filter" value="${filter}"><input type="hidden" name="type" value="${escapeHtml(type)}">
        <button class="link-button" name="action" value="${nextReadAction}">${nextReadLabel}</button>
        <button class="link-button" name="action" value="${message.kept ? 'unkeep' : 'keep'}">${message.kept ? 'Stop keeping' : 'Keep'}</button>
        <button class="link-button" name="action" value="${message.deleted ? 'restore' : 'delete'}">${message.deleted ? 'Restore' : 'Delete'}</button>
      </form>
    </article>`;
  }).join('');
  const emptyDescription = [filter === 'all' ? '' : filter, type === 'all' ? '' : type]
    .filter(Boolean).join(' ');
  return `<section class="page-title"><div><p class="eyebrow">Inbox</p><h1>Messages</h1></div><a class="button secondary" href="/miners">Message a miner</a></section>
    <p class="message-retention-notice"><strong>${retentionDays}-day mailbox:</strong> messages are permanently deleted ${retentionDays} days after they are sent unless you mark them Keep.</p>
    <div class="message-filter-groups">
      <div><strong>Status</strong><nav class="message-filters" aria-label="Message status">${stateFilters}</nav></div>
      <div><strong>Type</strong><nav class="message-filters" aria-label="Message type">${typeFilters}</nav></div>
    </div>
    <form id="message-bulk" class="message-bulk" method="post" action="/messages/actions">
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="type" value="${escapeHtml(type)}">
      <span>Selected:</span><button name="action" value="read">Mark read</button><button name="action" value="unread">Mark unread</button>
      <button name="action" value="keep">Keep</button><button name="action" value="unkeep">Stop keeping</button>
      <button name="action" value="${filter === 'deleted' ? 'restore' : 'delete'}">${filter === 'deleted' ? 'Restore' : 'Delete'}</button>
    </form>
    <div class="message-list">${rows || `<p>No ${emptyDescription ? `${escapeHtml(emptyDescription)} ` : ''}messages.</p>`}</div>`;
}

function safeInternalMessagePath(value, allowLegacyRelative = false) {
  const path = String(value ?? '').trim();
  if (!path || /[\\\u0000-\u001f\u007f]/.test(path) || /(?:^|\/)\.\.(?:\/|$)/.test(path)) return null;
  if (path.startsWith('/') && !path.startsWith('//')) return path;
  if (allowLegacyRelative && /^[A-Za-z0-9][A-Za-z0-9/_?=&%#.+~-]*$/.test(path)
      && !path.includes('//')) return `/${path}`;
  return null;
}

function messageBodyHtml(body) {
  const text = String(body ?? '');
  const linkPattern = /\[rrl=([^\]\r\n]+)\]([\s\S]*?)\[\/rrl\]/gi;
  let html = '';
  let offset = 0;
  for (const match of text.matchAll(linkPattern)) {
    html += escapeHtml(text.slice(offset, match.index));
    const path = safeInternalMessagePath(match[1], true);
    html += path
      ? `<a href="${escapeHtml(path)}">${escapeHtml(match[2])}</a>`
      : escapeHtml(match[2]);
    offset = match.index + match[0].length;
  }
  return html + escapeHtml(text.slice(offset));
}

function messageItemGroups(message, catalog) {
  const details = message.details && typeof message.details === 'object' ? message.details : {};
  const groups = [];
  const addGroup = (label, entries) => {
    if (!Array.isArray(entries)) return;
    const quantities = new Map();
    for (const entry of entries) {
      const itemId = Number(typeof entry === 'object' && entry !== null
        ? (entry.itemId ?? entry.item_id ?? entry.id) : entry);
      const quantity = Number(typeof entry === 'object' && entry !== null
        ? (entry.quantity ?? entry.count ?? 1) : 1);
      const item = catalog.byId.get(itemId);
      if (!item || !Number.isFinite(quantity) || quantity <= 0) continue;
      quantities.set(itemId, (quantities.get(itemId) ?? 0) + Math.floor(quantity));
    }
    const items = [...quantities].map(([itemId, quantity]) => ({
      item: catalog.byId.get(itemId), quantity
    })).sort((first, second) => compareItemsByRarity(first.item, second.item));
    if (items.length) groups.push({ label, items });
  };

  if (details.event === 'world-creature-combat') addGroup('Bounty', details.rewards);
  if (details.event === 'ghost-defeated') addGroup('Spectral bounty', details.rewards);
  if (details.event === 'pillage') addGroup('Stolen cargo', details.items);
  if (details.event === 'sunk') {
    addGroup('Lost cannons', details.losses?.cannons);
    addGroup('Lost cargo', details.losses?.cargo);
  }
  if (details.event === 'arrived') {
    addGroup('Delivered cargo', details.cargo);
    addGroup('Caught during the journey', details.catches);
    addGroup('Captured stowaways', details.capturedStowaways);
    addGroup('Escaped stowaways', details.escapedStowaways);
  }
  if (details.event === 'shot-down') addGroup('Lost cargo', details.cargo);
  if (details.event === 'map-discovered' && details.itemId) {
    addGroup('Expedition reward', [{ itemId: details.itemId, quantity: 1 }]);
  }
  if (details.event === 'administrator-grant' && details.kind === 'item') {
    addGroup('Granted item', [{ itemId: details.itemId, quantity: details.quantity }]);
  }
  if (details.event === 'factory-action-completed') addGroup('Factory output', details.items);
  if (details.event === 'machine-bombed' && details.itemId) {
    addGroup('Damaged machine', [{ itemId: details.itemId, quantity: 1 }]);
  }
  if (details.event === 'market-sale') {
    let itemId = Number(details.itemId);
    if (!catalog.byId.has(itemId)) {
      const itemAction = (Array.isArray(details.actions) ? details.actions : [])
        .map((action) => String(action?.path ?? '').match(/^\/market\/items\/(\d+)$/))
        .find(Boolean);
      itemId = Number(itemAction?.[1]);
    }
    if (catalog.byId.has(itemId)) {
      addGroup(details.role === 'seller' ? 'Sold item' : 'Purchased item',
        [{ itemId, quantity: details.quantity }]);
    }
  }
  return groups;
}

function conciseMessageBody(message) {
  const details = message.details && typeof message.details === 'object' ? message.details : {};
  const body = String(message.body ?? '');
  if (details.event === 'world-creature-combat' && Array.isArray(details.rewards)
      && details.rewards.length) {
    const marker = 'You defeated it.';
    const markerAt = body.indexOf(marker);
    const quantity = details.rewards.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0);
    if (markerAt >= 0) {
      return `${body.slice(0, markerAt + marker.length)} ${quantity} bounty thing${quantity === 1 ? '' : 's'} filled the remaining cargo space and ${quantity === 1 ? 'is' : 'are'} shown below.`;
    }
  }
  if (details.event === 'arrived' && details.vehicleName && details.destinationCityName) {
    const delivered = Array.isArray(details.cargo)
      ? details.cargo.reduce((sum, item) => sum + Number(item.quantity ?? 0), 0) : 0;
    const caught = Array.isArray(details.catches)
      ? details.catches.reduce((sum, item) => sum + Number(item.quantity ?? 1), 0) : 0;
    const battles = new Map();
    for (const event of Array.isArray(details.journeyEvents) ? details.journeyEvents : []) {
      if (['won', 'lost', 'tied'].includes(event.type)) {
        battles.set(event.type, (battles.get(event.type) ?? 0) + 1);
      }
    }
    const notes = [];
    if (caught) notes.push(`caught ${caught} thing${caught === 1 ? '' : 's'}`);
    if (battles.size) notes.push([...battles].map(([outcome, count]) =>
      `${count} battle${count === 1 ? '' : 's'} ${outcome}`).join(', '));
    const escaped = Array.isArray(details.escapedStowaways) ? details.escapedStowaways.length : 0;
    const captured = Array.isArray(details.capturedStowaways) ? details.capturedStowaways.length : 0;
    if (escaped) notes.push(`${escaped} stowaway${escaped === 1 ? '' : 's'} escaped`);
    if (captured) notes.push(`${captured} stowaway${captured === 1 ? '' : 's'} captured`);
    return `Your ${details.vehicleName} arrived in ${details.destinationCityName} after ${formatDuration(Number(details.durationMs ?? 0))}. ${delivered ? `Delivered ${delivered} cargo thing${delivered === 1 ? '' : 's'}, shown below.` : 'No cargo was delivered.'} ${notes.length ? `Along the way: ${notes.join('; ')}.` : 'The journey was uneventful.'}`;
  }
  return body;
}

function messageItemGroupsHtml(message, catalog) {
  const groups = messageItemGroups(message, catalog);
  if (!groups.length) return '';
  return `<div class="message-item-groups">${groups.map((group, groupIndex) => {
    const total = group.items.reduce((sum, entry) => sum + entry.quantity, 0);
    return `<section class="message-item-group" aria-labelledby="message-items-${message.id}-${groupIndex}"><header><h2 id="message-items-${message.id}-${groupIndex}">${escapeHtml(group.label)}</h2><span>${total.toLocaleString('en-GB')} thing${total === 1 ? '' : 's'}</span></header><ul>${group.items.map(({ item, quantity }) => `<li class="message-item rarity-${item.rarity}"><a href="/items/${item.id}"><img src="${escapeHtml(item.icon)}" alt=""><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.rarityName)}</small></span><b>${quantity.toLocaleString('en-GB')}×</b></a></li>`).join('')}</ul></section>`;
  }).join('')}</div>`;
}

function messageDetailPage(message, catalog) {
  const type = message.messageType || 'Message';
  const subject = message.subject || `${type} message`;
  const detailActions = Array.isArray(message.details?.actions) ? message.details.actions : [];
  const exposedActions = [
    ...detailActions.map((action) => ({ label: action.label, path: action.path })),
    ...(Array.isArray(message.actionLinks) ? message.actionLinks
      .map((action) => ({ label: action.label, path: action.href })) : []),
    ...(Array.isArray(message.links) ? message.links
      .map((action) => ({ label: action.label, path: action.href ?? action.path })) : [])
  ];
  const seen = new Set();
  const actions = exposedActions.map((action) => {
    const path = safeInternalMessagePath(action.path);
    const label = String(action.label ?? '').trim();
    if (!path || !label || seen.has(`${path}\u0000${label}`)) return '';
    seen.add(`${path}\u0000${label}`);
    return `<a class="button secondary" href="${escapeHtml(path)}">${escapeHtml(label)}</a>`;
  }).join('');
  const sender = message.senderName || 'MineThings';
  const retentionMs = Number(catalog.settings.message_retention_ms);
  const retention = message.kept
    ? '<strong class="message-kept">Kept: this message will not expire.</strong>'
    : `<span class="message-expiry">Permanently deletes on ${new Date(message.createdAt + retentionMs).toLocaleString('en-GB')}.</span>`;
  return `<section class="page-title"><div><p class="eyebrow">${escapeHtml(type)}</p><h1>${escapeHtml(subject)}</h1></div><a href="/messages">Back to messages</a></section>
    <article class="message-detail">
      <dl class="message-detail-meta"><div><dt>From</dt><dd>${escapeHtml(sender)}</dd></div><div><dt>Sent</dt><dd><time datetime="${new Date(message.createdAt).toISOString()}">${new Date(message.createdAt).toLocaleString('en-GB')}</time></dd></div><div><dt>Retention</dt><dd>${retention}</dd></div></dl>
      <div class="message-detail-body">${messageBodyHtml(conciseMessageBody(message))}</div>
      ${messageItemGroupsHtml(message, catalog)}
      ${actions ? `<nav class="message-detail-actions" aria-label="Message actions">${actions}</nav>` : ''}
      <form class="message-detail-retention" method="post" action="/messages/actions"><input type="hidden" name="message_${message.id}" value="1"><input type="hidden" name="filter" value="all"><input type="hidden" name="type" value="${escapeHtml(type)}"><button name="action" value="${message.kept ? 'unkeep' : 'keep'}">${message.kept ? 'Stop keeping this message' : 'Keep this message'}</button></form>
    </article>`;
}

function conversationPage(conversation, catalog) {
  const retentionDays = Math.round(Number(catalog.settings.message_retention_ms) / (24 * 60 * 60 * 1000));
  const messages = conversation.messages.map((message) => `<article class="message-bubble${message.kept ? ' kept' : ''}"><header><strong>${escapeHtml(message.senderName)}</strong><time>${new Date(message.createdAt).toLocaleString('en-GB')}</time>${message.kept ? '<span class="message-kept">Kept</span>' : ''}</header><p>${escapeHtml(message.body)}</p></article>`).join('');
  const block = `<form method="post" action="/messages/${encodeURIComponent(conversation.other.name)}/block"><input type="hidden" name="blocked" value="${conversation.blockedOther ? '0' : '1'}"><button class="secondary">${conversation.blockedOther ? 'Unblock messages from' : 'Block messages from'} ${escapeHtml(conversation.other.name)}</button></form>`;
  const compose = conversation.blockedByOther
    ? '<p class="capacity-warning">This miner has blocked your private messages.</p>'
    : conversation.blockedOther
      ? '<p>Unblock this miner before sending another message.</p>'
      : `<form class="message-compose" method="post" action="/messages/${encodeURIComponent(conversation.other.name)}"><label>Message<textarea name="body" maxlength="${Number(catalog.settings.private_message_max_length)}" rows="5" required></textarea></label><button>Send message</button></form>`;
  return `<section class="page-title"><div><p class="eyebrow">Conversation</p><h1>${escapeHtml(conversation.other.name)}</h1></div><div><a href="/miners/${encodeURIComponent(conversation.other.name)}">View profile</a>${block}</div></section>
    <p class="message-retention-notice">Private messages also expire after ${retentionDays} days. Received messages can be protected from your <a href="/messages?type=PM">Inbox</a>.</p>
    <div class="conversation">${messages || '<p>No messages in this conversation yet.</p>'}</div>
    ${compose}`;
}

function rankBadge(tierRank, vehicleCount, catalog) {
  if (!tierRank) return '';
  const step = Number(catalog.settings.rank_badge_vehicle_count_step);
  const maximum = Number(catalog.settings.rank_badge_vehicle_count_maximum);
  const count = Math.min(maximum,
    vehicleCount > step ? Math.floor(vehicleCount / step) * step : Math.max(1, vehicleCount));
  return `<a class="rank-badge" href="/ratings"><img src="/img/rankings/R${tierRank}C${count}.png" alt="Rank ${tierRank}"></a>`;
}

function radarText(route, catalog) {
  if (!route.radar) return '';
  return ` · ${catalogGadgetForBehavior(catalog, 'radar').displayName}: ${
    route.radar.map((entry) => `${entry.label} ${entry.count}`).join(', ')}`;
}

function vehiclesPage(player, catalog, vehicles, now, thiefBase = null) {
  const searchPlaneName = catalogItemForSetting(catalog, 'search_plane_item_id').name;
  const bomberName = catalogItemForSetting(catalog, 'bomber_item_id').name;
  const helicopterName = catalogItemForSetting(catalog, 'helicopter_item_id').name;
  const availableItems = Object.entries(player.inventory)
    .map(([itemId, count]) => [catalog.byId.get(Number(itemId)), count])
    .filter(([item, count]) => item && count > 0 && catalog.vehicleByItemId.has(item.id))
    .sort(([first], [second]) => compareItemsByRarity(first, second));
  const activate = availableItems.map(([item, count]) => itemCard(item, count,
    `<form method="post" action="/vehicles/activate/${item.id}"><button>Activate</button></form>`)).join('');
  const currentCity = catalogCityForId(catalog, player.cityId);
  const vehicleCard = (vehicle) => {
    const vehicleItem = catalog.byId.get(vehicle.itemId);
    if (!vehicleItem) throw new Error(`Missing catalog item: ${vehicle.itemId}.`);
    const destination = vehicle.destinationCityId == null ? null
      : catalogCityForId(catalog, vehicle.destinationCityId);
    if (vehicle.status === 'traveling') {
      if (vehicle.originCityId !== vehicle.destinationCityId && !destination) {
        throw new Error(`Missing destination city for vehicle ${vehicle.id}.`);
      }
      const destinationLabel = vehicle.originCityId === vehicle.destinationCityId
        ? 'ore-thief mission' : destination.name;
      const journey = vehicle.creaturePursuit
        ? [`Pursuing ${vehicle.creaturePursuit.creatureName}`,
          `Intercepts in ${formatDuration(vehicle.creaturePursuit.encounterAt - now)} at ${Math.round(vehicle.creaturePursuit.encounterLocation).toLocaleString('en-GB')} km`]
        : [`Traveling to ${destinationLabel}`, `Arrives in ${formatDuration(vehicle.arrivesAt - now)}`];
      return itemCard(vehicleItem, { meta: [vehicle.name, ...journey],
        action: `${rankBadge(vehicle.rank, 1, catalog)}<a class="button secondary" href="/vehicles/${vehicle.id}">Manage</a>` });
    }
    const city = catalogCityForId(catalog, vehicle.cityId);
    const routes = vehicle.routes.map((route) => {
      const routeDestination = catalogCityForId(catalog, route.destinationCityId);
      const destinationMap = catalog.maps?.find((map) => map.id === routeDestination.mapId);
      const interMap = destinationMap && routeDestination.mapId !== city.mapId;
      const destinationLabel = interMap
        ? `${destinationMap.name} / ${routeDestination.name} · INTER-MAP`
        : routeDestination.name;
      return `<option value="${route.id}">${route.mission ? 'Ore-thief mission' : `${escapeHtml(destinationLabel)} · ${Number(route.length).toLocaleString('en-GB')} km`}${escapeHtml(radarText(route, catalog))}</option>`;
    }).join('');
    const status = vehicle.aircraftDestroyed ? '<strong class="capacity-warning">Shot down by the ore thieves</strong>'
      : `${escapeHtml(city.name)} · speed ${vehicle.speed} · ${vehicle.cargoSize}/${vehicle.capacity} capacity · rating ${Math.round(vehicle.rating)}`;
    return itemCard(vehicleItem, { meta: vehicle.name, details: `<p class="item-card-status">${status}</p>`,
      action: `${rankBadge(vehicle.rank, 1, catalog)}<a class="button secondary" href="/vehicles/${vehicle.id}">Manage</a>${routes ? `<form method="post" action="/vehicles/${vehicle.id}/send"><label>Route<select name="routeId">${routes}</select></label><button>Send</button></form>` : '<span>No compatible route here.</span>'}` });
  };
  const localVehicles = vehicles.filter((vehicle) => vehicle.status !== 'traveling'
    && vehicle.cityId === player.cityId).sort(compareItemsByRarity).map(vehicleCard).join('');
  const travelingVehicles = vehicles.filter((vehicle) => vehicle.status === 'traveling')
    .sort(compareItemsByRarity).map(vehicleCard).join('');
  const elsewhereByCity = new Map();
  for (const vehicle of vehicles.filter((entry) => entry.status !== 'traveling'
    && entry.cityId !== player.cityId)) {
    if (!elsewhereByCity.has(vehicle.cityId)) elsewhereByCity.set(vehicle.cityId, []);
    elsewhereByCity.get(vehicle.cityId).push(vehicle);
  }
  const elsewhere = [...elsewhereByCity].map(([cityId, entries]) => ({
    city: catalogCityForId(catalog, cityId), count: entries.length
  })).sort((first, second) => first.city.name.localeCompare(second.city.name))
    .map(({ city, count }) => `<li><strong>${escapeHtml(city.name)}</strong><span>${count} idle vehicle${count === 1 ? '' : 's'}</span><form method="post" action="/cities/${city.id}/select"><button>Switch to ${escapeHtml(city.name)}</button></form></li>`).join('');
  const missionStatus = !thiefBase ? '' : thiefBase.discovered
    ? `<section class="mission-status"><h2>Ore-thief base</h2><p>${thiefBase.destroyed
      ? `Destroyed · ${thiefBase.ore} ore crates remain for ${escapeHtml(helicopterName)} aircraft.`
      : `${Math.round(thiefBase.distance)} km away · ${thiefBase.buckets.toLocaleString('en-GB')} defensive buckets remain${thiefBase.damaged ? ' · damaged' : ''}.`}</p></section>`
    : `<section class="mission-status"><h2>Ore-thief base</h2><p>Location unknown. Send a ${escapeHtml(searchPlaneName)} on the mission route from the ore city; use a ${escapeHtml(bomberName)} or ${escapeHtml(helicopterName)} after it is found.</p></section>`;
  return `<section class="page-title"><div><img class="legacy-title-image" src="/img/vehicles.gif" alt=""><h1>Vehicles in ${escapeHtml(currentCity.name)}</h1></div><p>Idle vehicles and stored vehicle things are city-local. Traveling vehicles remain visible while underway.</p></section>
    ${missionStatus}
    <section><h2>Idle vehicles in ${escapeHtml(currentCity.name)}</h2><div class="vehicle-list">${localVehicles || `<p>No idle vehicles in ${escapeHtml(currentCity.name)}.</p>`}</div></section>
    ${travelingVehicles ? `<section><h2>Vehicles underway</h2><div class="vehicle-list">${travelingVehicles}</div></section>` : ''}
    ${elsewhere ? `<section><h2>Vehicles in other cities</h2><p>Switch city to manage cargo and fittings stored there.</p><ul class="vehicle-location-list">${elsewhere}</ul></section>` : ''}
    <section><h2>Stored vehicle things in ${escapeHtml(currentCity.name)}</h2><div class="item-grid">${activate || `<p>No stored vehicles in ${escapeHtml(currentCity.name)}.</p>`}</div></section>`;
}

function remoteVehiclePage(player, catalog, vehicle) {
  const selectedCity = catalogCityForId(catalog, player.cityId);
  const vehicleCity = catalogCityForId(catalog, vehicle.cityId);
  return `<section class="page-title"><div><p class="eyebrow">Vehicle in ${escapeHtml(vehicleCity.name)}</p><h1>${escapeHtml(vehicle.name)}</h1></div><a href="/vehicles">Back to ${escapeHtml(selectedCity.name)} vehicles</a></section>
    <section class="city-scope-warning"><h2>Switch city to manage this vehicle</h2><p>You are viewing ${escapeHtml(selectedCity.name)}, but ${escapeHtml(vehicle.name)} and its loadout are in ${escapeHtml(vehicleCity.name)}. Only things stored in the vehicle's city can be loaded.</p><form method="post" action="/cities/${vehicleCity.id}/select"><button>Switch to ${escapeHtml(vehicleCity.name)}</button></form></section>`;
}

function capacityBudgetHtml(breakdown, heading = 'Capacity budget') {
  if (!breakdown) return '';
  const base = Number(breakdown.base ?? 0);
  const mods = Number(breakdown.modAdjustment ?? breakdown.mods ?? 0);
  const weapons = Number(breakdown.weapons ?? 0);
  const cannons = Number(breakdown.cannons ?? 0);
  const ammunition = Number(breakdown.ammunitionSlots ?? breakdown.ammunition ?? 0);
  const cargo = Number(breakdown.cargoSlots ?? breakdown.cargo ?? 0);
  const total = Number(breakdown.total ?? base + mods);
  const free = Number(breakdown.free ?? total - weapons - cannons - ammunition - cargo);
  const signed = (value) => value > 0 ? `+${value}` : String(value);
  const debit = (value) => value ? `−${value}` : '0';
  return `<section class="capacity-budget${free < 0 ? ' capacity-over' : ''}" aria-label="${escapeHtml(heading)}">
    <header><h3>${escapeHtml(heading)}</h3><strong>${free} free</strong></header>
    <dl>
      <div><dt>Base</dt><dd>${base}</dd></div>
      <div><dt>Mods</dt><dd>${signed(mods)}</dd></div>
      <div><dt>Weapons</dt><dd>${debit(weapons)}</dd></div>
      <div><dt>Cannons</dt><dd>${debit(cannons)}</dd></div>
      <div><dt>Ammunition</dt><dd>${debit(ammunition)}</dd></div>
      <div><dt>Cargo</dt><dd>${debit(cargo)}</dd></div>
      <div class="capacity-total"><dt>Total / free</dt><dd>${total} / ${free}</dd></div>
    </dl>
  </section>`;
}

function vehicleDetailPage(player, catalog, vehicle, routes, now, view = 'status', preview = null,
  selections = {}, previewToken = '') {
  const destination = vehicle.destinationCityId == null ? null
    : catalogCityForId(catalog, vehicle.destinationCityId);
  const local = player.inventoryByCity[vehicle.cityId] ?? {};
  const vehicleItem = catalog.byId.get(vehicle.itemId);
  if (!vehicleItem) throw new Error(`Missing catalog item for vehicle: ${vehicle.itemId}.`);
  const events = vehicle.events.map((event) => `<tr><td>${new Date(event.createdAt).toLocaleString('en-GB')}</td><td>${escapeHtml(event.type)}</td><td>${event.otherPlayerName ? `${escapeHtml(event.otherPlayerName)} · ${escapeHtml(event.otherVehicleName)}` : ''}</td><td>${event.battleId ? `<a href="/battles/${event.battleId}">Battle report</a>` : ''}</td></tr>`).join('');
  if (vehicle.status === 'traveling') {
    const freeCapacity = Math.max(0, vehicle.capacity - vehicle.cargoSize);
    const loadedCargoThings = vehicle.cargo.reduce((sum, entry) => sum + entry.quantity, 0);
    const cannonPortals = vehicle.shipDefinition?.cannonPortals ?? 0;
    const ammoOverview = vehicle.ship ? catalog.cannonballs.map((definition) => {
      const item = catalog.byId.get(definition.itemId);
      const rule = catalog.settings.ammunition_rules?.[definition.type];
      if (!item || !rule?.storageField) {
        throw new Error(`Missing ammunition display data for type ${definition.type}.`);
      }
      return `${item.name}: ${vehicle.ship[rule.storageField]} shots`;
    }).join(' · ') : '';
    const underwayRows = [
      ['Cargo', `${loadedCargoThings} thing${loadedCargoThings === 1 ? '' : 's'} loaded`],
      ...(vehicle.type === 'land' ? [
        ['Mods', `${vehicle.mods.length} fitted`],
        ['Weapons', `${vehicle.weapons.length} fitted`],
        ['Combat', `attack ${signedStat(vehicle.combatStats.attack)} · armor ${signedStat(vehicle.combatStats.armor)} · offense ${signedStat(vehicle.combatStats.offense)} · defense ${signedStat(vehicle.combatStats.defense)} · dodge ${signedStat(vehicle.combatStats.dodge)}`]
      ] : []),
      ...(vehicle.type === 'sea' ? [
        ['Cannon portals', `${vehicle.cannons.length}/${cannonPortals} occupied`],
        ['Ammunition', ammoOverview || 'No ammunition hold']
      ] : [])
    ];
    const underwayLoadout = `<section class="vehicle-loadout" aria-labelledby="vehicle-loadout-heading"><h2 id="vehicle-loadout-heading">Current loadout</h2>${capacityBudgetHtml(vehicle.capacityBreakdown, 'Capacity at departure')}<dl>${underwayRows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl></section>`;
    const journeyGadgets = [
      vehicle.turbo ? catalogGadgetForBehavior(catalog, 'turbo').displayName : '',
      vehicle.offenseBonusFactor ? catalogGadgetForBehavior(catalog, 'sharpener').displayName : '',
      vehicle.defenseBonusFactor ? catalogGadgetForBehavior(catalog, 'shield').displayName : '',
      vehicle.binoculars ? catalogGadgetForBehavior(catalog, 'binoculars').displayName : ''
    ].filter(Boolean);
    if (vehicle.originCityId !== vehicle.destinationCityId && !destination) {
      throw new Error(`Missing destination city for vehicle ${vehicle.id}.`);
    }
    const destinationLabel = vehicle.originCityId === vehicle.destinationCityId
      ? 'the ore-thief mission' : destination.name;
    const journeyStatus = vehicle.creaturePursuit
      ? `Pursuing <strong>${escapeHtml(vehicle.creaturePursuit.creatureName)}</strong>. Interception in ${formatDuration(vehicle.creaturePursuit.encounterAt - now)} at ${Math.round(vehicle.creaturePursuit.encounterLocation).toLocaleString('en-GB')} km along the route.`
      : `Traveling to <strong>${escapeHtml(destinationLabel)}</strong>. Arrival in ${formatDuration(vehicle.arrivesAt - now)}.`;
    return `<section class="page-title"><div><p class="eyebrow">Vehicle status</p><h1>${rankBadge(vehicle.rank, 1, catalog)}${escapeHtml(vehicle.name)}</h1></div><a href="/vehicles">Back to vehicles</a></section><section class="vehicle-hero">${itemCard(vehicleItem, { featured: true, meta: vehicle.name })}<p>${journeyStatus}${journeyGadgets.length ? ` Journey gadgets: ${escapeHtml(journeyGadgets.join(', '))}.` : ''} Loadout is read-only while underway.</p></section>${underwayLoadout}<table><thead><tr><th>When</th><th>Event</th><th>Encounter</th><th></th></tr></thead><tbody>${events}</tbody></table>`;
  }
  const oilItem = catalogItemForSetting(catalog, 'oil_item_id');
  const boltItem = catalogItemForSetting(catalog, 'bolt_item_id');
  const blockAndTackleItem = catalogItemForSetting(catalog, 'block_and_tackle_item_id');
  const airRouteType = catalogRoleId(catalog, 'route_type_ids', 'air');
  const ammoBoxItemIds = new Set(catalog.boxes.map((box) => box.itemId));
  const boltsAvailable = local[boltItem.id] ?? 0;
  const blockAndTacklesAvailable = local[blockAndTackleItem.id] ?? 0;
  const boltCost = (rarity) => Math.max(0,
    Number(rarity) - Number(catalog.settings.mod_bolt_free_rarity))
    * Number(catalog.settings.mod_bolts_per_rarity);
  const cargoById = new Map(vehicle.cargo.map((entry) => [entry.itemId, entry]));
  const cargoChoices = new Map();
  for (const [itemId, quantity] of Object.entries(local)) {
    const item = catalog.byId.get(Number(itemId));
    if (item && quantity > 0 && compatibleCargoAllowed({
      routeType: vehicle.routeType,
      aircraftType: vehicle.aircraftType, vehicleRarity: vehicle.rarity,
      itemId: item.id, itemRarity: item.rarity, mineTypeId: item.mineTypeId,
      isVehicle: catalog.vehicleByItemId.has(item.id), isAmmoBox: ammoBoxItemIds.has(item.id),
      isWeapon: catalog.weaponByItemId.has(item.id),
      isCannonball: catalog.cannonballByItemId.has(item.id),
      isBomb: catalog.bombByItemId.has(item.id)
    }, catalog.settings)) {
      cargoChoices.set(item.id, { item, quantity });
    }
  }
  for (const cargo of vehicle.cargo) {
    const item = catalog.byId.get(cargo.itemId);
    if (!item) throw new Error(`Missing catalog item: ${cargo.itemId}.`);
    cargoChoices.set(cargo.itemId, {
      item, quantity: (local[cargo.itemId] ?? 0) + cargo.quantity
    });
  }
  const selectedCargo = new Map(Object.entries(selections.cargo ?? Object.fromEntries(
    vehicle.cargo.map((entry) => [entry.itemId, entry.quantity])
  )).map(([itemId, quantity]) => [Number(itemId), Number(quantity)]));
  const cargoRows = [...cargoChoices.values()]
    .sort((first, second) => compareItemsByRarity(first.item, second.item))
    .map(({ item }) => {
      const loaded = cargoById.get(item.id)?.quantity ?? 0;
      const availableHere = local[item.id] ?? 0;
      const maximum = vehicle.damaged ? loaded : availableHere + loaded;
      return `<tr><td data-label="Thing">${itemCard(item, { compact: true })}</td><td data-label="Available here">${availableHere}</td><td data-label="Proposed cargo"><label class="visually-hidden" for="cargo-${item.id}">${escapeHtml(item.name)} proposed cargo quantity</label><input id="cargo-${item.id}" aria-label="${escapeHtml(item.name)} proposed cargo quantity" type="number" name="cargo_${item.id}" min="0" max="${maximum}" value="${selectedCargo.get(item.id) ?? 0}"${vehicle.damaged && !loaded ? ' disabled' : ''}></td></tr>`;
    }).join('');
  const fittedMods = new Set(vehicle.mods.map((entry) => entry.id));
  const selectedMods = new Set(selections.modIds ?? vehicle.mods.map((entry) => entry.id));
  const armsAllowed = new Set(armsRarities(vehicle.rarity, catalog.settings));
  const modChoices = catalog.mods.filter((mod) => {
    const item = catalog.byId.get(mod.itemId);
    return item && armsAllowed.has(item.rarity)
      && (fittedMods.has(mod.id) || selectedMods.has(mod.id) || (local[mod.itemId] ?? 0) > 0);
  }).sort(compareCatalogEntriesByRarity(catalog)).map((mod) => {
    const item = catalog.byId.get(mod.itemId);
    const fitted = fittedMods.has(mod.id);
    const selected = selectedMods.has(mod.id);
    const cost = boltCost(item.rarity);
    return itemCard(item, { compact: true, className: 'item-card-picker',
      meta: [fitted ? 'Fitted now' : `${local[mod.itemId] ?? 0} available in ${catalogCityForId(catalog, vehicle.cityId).name}`,
        `capacity ${signedStat(mod.capacity)}`, `attack ${signedStat(mod.attack)}`,
        `armor ${signedStat(mod.armor)}`, fitted ? 'Removal returns this mod' : `${cost} ${boltItem.name}${cost === 1 ? '' : 's'} to fit`],
      action: `<label><input type="checkbox" name="mod_${mod.id}"${selected ? ' checked' : ''}${vehicle.damaged && !fitted ? ' disabled' : ''}> ${fitted ? 'Keep fitted' : 'Fit this mod'}</label>` });
  }).join('');
  const fittedWeaponCounts = new Map();
  for (const weapon of vehicle.weapons) fittedWeaponCounts.set(weapon.id, (fittedWeaponCounts.get(weapon.id) ?? 0) + 1);
  const selectedWeaponCounts = new Map();
  for (const id of selections.weaponIds ?? vehicle.weapons.map((entry) => entry.id)) {
    selectedWeaponCounts.set(id, (selectedWeaponCounts.get(id) ?? 0) + 1);
  }
  const weaponChoices = catalog.weapons.filter((weapon) => {
    const item = catalog.byId.get(weapon.itemId);
    return item && armsAllowed.has(item.rarity)
      && (fittedWeaponCounts.has(weapon.id) || selectedWeaponCounts.has(weapon.id)
        || (local[weapon.itemId] ?? 0) > 0);
  }).sort(compareCatalogEntriesByRarity(catalog)).map((weapon) => {
    const item = catalog.byId.get(weapon.itemId);
    const fitted = fittedWeaponCounts.get(weapon.id) ?? 0;
    const maximum = vehicle.damaged ? fitted : fitted + (local[weapon.itemId] ?? 0);
    const selected = selectedWeaponCounts.get(weapon.id) ?? 0;
    const cost = boltCost(item.rarity);
    return itemCard(item, { compact: true, className: 'item-card-picker',
      meta: [`${fitted} fitted now`, `${local[weapon.itemId] ?? 0} available in ${catalogCityForId(catalog, vehicle.cityId).name}`,
        '1 capacity each', `offense +${weapon.offense}`, `defense +${weapon.defense}`,
        `${cost} ${boltItem.name}${cost === 1 ? '' : 's'} per new fitting`],
      action: `<label>Proposed quantity<input aria-label="${escapeHtml(item.name)} proposed quantity" type="number" name="weapon_${weapon.id}" min="0" max="${maximum}" value="${selected}"${vehicle.damaged && !fitted ? ' disabled' : ''}></label>` });
  }).join('');
  const cannonPortals = vehicle.shipDefinition?.cannonPortals ?? 0;
  const cannonPortalsRemaining = Math.max(0, cannonPortals - vehicle.cannons.length);
  const fittedCannonCounts = new Map();
  for (const cannon of vehicle.cannons) {
    fittedCannonCounts.set(cannon.id, (fittedCannonCounts.get(cannon.id) ?? 0) + 1);
  }
  const selectedCannonCounts = new Map();
  for (const id of selections.cannonIds ?? vehicle.cannons.map((entry) => entry.id)) {
    selectedCannonCounts.set(id, (selectedCannonCounts.get(id) ?? 0) + 1);
  }
  const cannonChoices = catalog.cannons.filter((cannon) => {
    const item = catalog.byId.get(cannon.itemId);
    return item && armsAllowed.has(item.rarity)
      && ((local[cannon.itemId] ?? 0) > 0 || fittedCannonCounts.has(cannon.id));
  }).sort(compareCatalogEntriesByRarity(catalog)).map((cannon) => {
    const item = catalog.byId.get(cannon.itemId);
    const count = local[cannon.itemId] ?? 0;
    const fitted = fittedCannonCounts.get(cannon.id) ?? 0;
    const maximum = vehicle.damaged ? fitted : fitted + count;
    const selected = selectedCannonCounts.get(cannon.id) ?? 0;
    return itemCard(item, { count, compact: true,
      meta: [`${fitted} fitted now`, `${count} available in ${catalogCityForId(catalog, vehicle.cityId).name}`, `${cannon.damage} damage`, `Rate of fire ${cannon.rateOfFire}`, 'Uses 1 capacity'],
      action: `<label>Proposed quantity<input aria-label="${escapeHtml(item.name)} proposed quantity" type="number" name="cannon_${cannon.id}" min="0" max="${maximum}" value="${selected}"${vehicle.damaged && !fitted ? ' disabled' : ''}></label>` });
  }).join('');
  const attachedCannons = [...vehicle.cannons].sort((first, second) => first.portal - second.portal)
    .map((cannon) => {
      const item = catalog.byId.get(cannon.itemId);
      if (!item) throw new Error(`Missing catalog item: ${cannon.itemId}.`);
      return `<li>${itemCard(item, { compact: true,
        meta: [`Fitted in portal ${cannon.portal}`, `${cannon.damage} damage`,
          `Rate of fire ${cannon.rateOfFire}`, 'Uses 1 capacity'] })}</li>`;
    }).join('');
  const shotsPerCrate = Number(catalog.settings.shots_per_crate);
  let totalLoadedShots = 0;
  let totalLooseShots = 0;
  const ammo = vehicle.ship ? catalog.cannonballs.map((definition) => ({
    type: definition.type, definition, item: catalog.byId.get(definition.itemId),
    rule: catalog.settings.ammunition_rules?.[definition.type]
  })).sort((first, second) => compareItemsByRarity(first.item, second.item))
    .map(({ type, item, rule }) => {
    if (!item) throw new Error(`Missing catalog ammunition item for type ${type}.`);
    const count = local[item.id] ?? 0;
    const freeSlots = Math.max(0, vehicle.capacity - vehicle.cargoSize);
    const maximum = Math.min(count, freeSlots);
    if (!rule?.storageField) throw new Error(`Missing ammunition rule for type ${type}.`);
    const loadedShots = Number(vehicle.ship[rule.storageField]);
    totalLoadedShots += loadedShots;
    const fullCrates = Math.floor(loadedShots / shotsPerCrate);
    const looseShots = loadedShots % shotsPerCrate;
    totalLooseShots += looseShots;
    const disabledReason = !vehicle.cannons.length ? 'Attach a cannon first'
      : vehicle.damaged ? 'Damaged ship: unloading only'
      : !count ? `No crates in ${catalogCityForId(catalog, vehicle.cityId).name}`
        : !freeSlots ? 'No free capacity' : '';
    return itemCard(item, { count, compact: true,
      meta: [`${loadedShots} shots loaded`, `${fullCrates} complete crate${fullCrates === 1 ? '' : 's'}${looseShots ? ` + ${looseShots} loose shot${looseShots === 1 ? '' : 's'}` : ''}`,
        `${Math.round(Number(rule.accuracy) * 100)}% accuracy`, `Targets ${rule.damageField}`,
        `${freeSlots} free capacity`, disabledReason].filter(Boolean),
      action: `<form method="post" action="/vehicles/${vehicle.id}/ammo"><input type="hidden" name="type" value="${type}"><label>${escapeHtml(item.name)} crates<input aria-label="${escapeHtml(item.name)} crates to load" type="number" name="quantity" min="1" max="${Math.max(1, maximum)}" value="1" ${maximum && vehicle.cannons.length && !vehicle.damaged ? '' : 'disabled'}></label><button ${!maximum || !vehicle.cannons.length || vehicle.damaged ? 'disabled' : ''}>Load ${escapeHtml(item.name)}</button></form>` });
  }).join('') : '';
  const freeCapacity = Math.max(0, vehicle.capacity - vehicle.cargoSize);
  const loadedCargoThings = vehicle.cargo.reduce((sum, entry) => sum + entry.quantity, 0);
  const fittedWeaponTotal = vehicle.weapons.length;
  const ammoOverview = vehicle.ship ? catalog.cannonballs.map((definition) => {
    const item = catalog.byId.get(definition.itemId);
    const rule = catalog.settings.ammunition_rules?.[definition.type];
    if (!item || !rule?.storageField) throw new Error(`Missing ammunition display data for type ${definition.type}.`);
    return `${item.name}: ${vehicle.ship[rule.storageField]} shots`;
  }).join(' · ') : '';
  const loadoutRows = [
    ['Cargo', `${loadedCargoThings} thing${loadedCargoThings === 1 ? '' : 's'} loaded`],
    ...(vehicle.type === 'land' ? [
      ['Mods', `${vehicle.mods.length} fitted`],
      ['Weapons', `${fittedWeaponTotal} fitted`],
      ['Bolts here', String(boltsAvailable)],
      ['Combat', `attack ${signedStat(vehicle.combatStats.attack)} · armor ${signedStat(vehicle.combatStats.armor)} · offense ${signedStat(vehicle.combatStats.offense)} · defense ${signedStat(vehicle.combatStats.defense)} · dodge ${signedStat(vehicle.combatStats.dodge)}`]
    ] : []),
    ...(vehicle.type === 'sea' ? [
      ['Cannon portals', `${vehicle.cannons.length}/${cannonPortals} occupied · ${cannonPortalsRemaining} free`],
      ['Ammunition', ammoOverview || 'No ammunition hold'],
      ['Hull', `${vehicle.ship?.hull ?? 0}/${vehicle.shipDefinition?.hull ?? 0}`],
      ['Crew', `${vehicle.ship?.crew ?? 0}/${vehicle.shipDefinition?.crew ?? 0}`],
      ['Block and Tackle here', String(blockAndTacklesAvailable)]
    ] : [])
  ];
  const loadoutOverview = `<section class="vehicle-loadout" aria-labelledby="vehicle-loadout-heading"><h2 id="vehicle-loadout-heading">Current loadout</h2>${capacityBudgetHtml(vehicle.capacityBreakdown, 'Current capacity')}<dl>${loadoutRows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>${vehicle.damaged ? '<p class="capacity-warning"><strong>Damaged — recovery only.</strong> You may unload cargo, ammunition and fittings, but cannot add anything or travel until this vehicle has been emptied and stored.</p>' : ''}</section>`;
  const previewChanges = [];
  if (preview) {
    if (preview.modsAdded?.length) previewChanges.push(`Fit mods: ${preview.modsAdded.join(', ')}`);
    if (preview.modsRemoved?.length) previewChanges.push(`Remove mods: ${preview.modsRemoved.join(', ')}`);
    if (preview.weaponsAdded?.length) previewChanges.push(`Fit weapons: ${preview.weaponsAdded.join(', ')}`);
    if (preview.weaponsRemoved?.length) previewChanges.push(`Remove weapons: ${preview.weaponsRemoved.join(', ')}`);
    if (view === 'cargo') {
      for (const entry of preview.additions ?? []) previewChanges.push(`Load ${entry.quantity}× ${entry.name}`);
      for (const entry of preview.removals ?? []) previewChanges.push(`Unload ${entry.quantity}× ${entry.name}`);
    } else if (vehicle.type === 'sea') {
      for (const entry of preview.additions ?? []) previewChanges.push(`Fit ${entry.name} in portal ${entry.portal}`);
      for (const entry of preview.removals ?? []) previewChanges.push(`Return ${entry.name} from portal ${entry.portal}`);
      for (const entry of preview.moved ?? []) previewChanges.push(`Move ${entry.name} from portal ${entry.fromPortal} to ${entry.toPortal}`);
    }
  }
  const previewFacts = preview ? [
    ...(preview.combatStats ? [['Combat', `attack ${signedStat(preview.combatStats.attack)} · armor ${signedStat(preview.combatStats.armor)} · offense ${signedStat(preview.combatStats.offense)} · defense ${signedStat(preview.combatStats.defense)} · dodge ${signedStat(preview.combatStats.dodge)}`]] : []),
    ...(Number.isFinite(preview.boltsRequired) ? [['Bolts', `${preview.boltsRequired} required · ${preview.boltsAvailable} here`]] : []),
    ...(Number.isFinite(preview.portalsAfter) ? [['Cannon portals', `${preview.portalsAfter}/${preview.totalPortals} occupied after commit`], ['Combined cannon damage', String(preview.damageAfter)]] : []),
    ...(preview.tackleRequired ? [['Removal equipment', `${preview.tackleRequired} Block and Tackle consumed · ${preview.tackleAvailable} here`]] : [])
  ] : [];
  const previewPanel = preview ? `<section class="loadout-preview ${preview.valid ? 'preview-valid' : 'preview-invalid'}" aria-live="polite" data-live-preview-panel><h2>Proposed loadout</h2><p class="preview-verdict">${preview.valid ? 'This exact proposal is ready to commit. The vehicle remains unchanged until then.' : 'This proposal cannot be committed. The vehicle remains unchanged.'}</p>${capacityBudgetHtml(preview.capacityBreakdown, 'Proposed capacity')}<dl>${previewFacts.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>${previewChanges.length ? `<ul>${previewChanges.map((change) => `<li>${escapeHtml(change)}</li>`).join('')}</ul>` : '<p>No loadout changes selected.</p>'}${preview.reasons.length ? `<ul class="capacity-warning">${preview.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join('')}</ul>` : ''}</section>` : '';
  const routeOptions = routes.map((route) => {
    const routeDestination = catalogCityForId(catalog, route.destinationCityId);
    const destinationMap = catalog.maps?.find((map) => map.id === routeDestination.mapId);
    const originMapId = catalogCityForId(catalog, vehicle.cityId).mapId;
    const label = destinationMap && routeDestination.mapId !== originMapId
      ? `${destinationMap.name} / ${routeDestination.name} · INTER-MAP`
      : routeDestination.name;
    return `<option value="${route.id}">${route.mission ? 'Ore-thief mission' : `${escapeHtml(label)} · ${Number(route.length).toLocaleString('en-GB')} km`}${escapeHtml(radarText(route, catalog))}</option>`;
  }).join('');
  const travelOrderNames = catalog.settings.travel_order_names;
  if (!travelOrderNames || typeof travelOrderNames !== 'object' || Array.isArray(travelOrderNames)) {
    throw new Error('Invalid catalog setting: travel_order_names.');
  }
  const travelOrderOptions = ['peaceful', 'pillage', 'patrol'].map((order) => {
    const label = travelOrderNames[order];
    if (typeof label !== 'string' || !label) throw new Error(`Missing travel-order name: ${order}.`);
    return `<option value="${order}">${escapeHtml(label)}</option>`;
  }).join('');
  if (vehicle.aircraftDestroyed) {
    return `<section class="page-title"><div><p class="eyebrow">Aircraft lost</p><h1>${escapeHtml(vehicle.name)}</h1></div><a href="/vehicles">Back to vehicles</a></section><section class="vehicle-hero">${itemCard(vehicleItem, { featured: true, meta: vehicle.name })}<p class="capacity-warning">This aircraft was shot down by the ore thieves. Its cargo was lost.</p></section>${loadoutOverview}<table><thead><tr><th>When</th><th>Event</th><th>Encounter</th><th></th></tr></thead><tbody>${events || '<tr><td colspan="4">No mission history.</td></tr>'}</tbody></table>`;
  }
  const city = catalogCityForId(catalog, vehicle.cityId);
  const previewBindingInput = previewToken
    ? `<input type="hidden" name="previewToken" value="${escapeHtml(previewToken)}" data-preview-binding>` : '';
  const commitButton = preview?.valid
    ? '<button class="commit-loadout" name="intent" value="commit" data-preview-commit>Commit this exact loadout</button>' : '';
  const landFittings = vehicle.type === 'land' ? `<section class="vehicle-fittings"><div id="vehicle-loadout-editor" data-live-preview-scope>${previewPanel}<form method="post" action="/vehicles/${vehicle.id}/customize" data-live-preview-form>${previewBindingInput}<h2>Mods</h2><p>Choose the complete proposed mod set. New fittings consume the mod and ${escapeHtml(boltItem.name)}s only when you commit; removed mods return to ${escapeHtml(city.name)}.</p><div class="fitting-grid">${modChoices || '<p>No compatible mods fitted or available in this city.</p>'}</div><h2>Weapons</h2><p>Choose the complete proposed weapon set. Each weapon uses one capacity. Preview evaluates mods and weapons together.</p><div class="fitting-grid">${weaponChoices || '<p>No compatible weapons fitted or available in this city.</p>'}</div><div class="customization-actions"><button name="intent" value="preview">Preview loadout</button>${commitButton}</div></form></div></section>` : '';
  const fullAmmoCrates = (totalLoadedShots - totalLooseShots) / shotsPerCrate;
  const unloadWarning = totalLooseShots
    ? `<label class="danger-confirm"><input type="checkbox" name="confirmLoss" value="yes" required> Discard ${totalLooseShots} loose shot${totalLooseShots === 1 ? '' : 's'} that cannot make a complete crate.</label>` : '';
  const shipFittings = vehicle.type === 'sea' ? `<section class="vehicle-fittings"><h2>Ship cannons <small>${vehicle.cannons.length}/${cannonPortals} portals occupied</small></h2><p>Choose the complete cannon set you want fitted. Existing cannons can be kept, returned or replaced in one preview. Any removal consumes one ${escapeHtml(blockAndTackleItem.name)}; ammunition remains aboard.</p><ul class="fitted-cannon-list">${attachedCannons || '<li>No cannons attached.</li>'}</ul><div id="vehicle-loadout-editor" data-live-preview-scope>${previewPanel}<form method="post" action="/vehicles/${vehicle.id}/customize" data-live-preview-form>${previewBindingInput}<h3>Proposed complete cannon set</h3><div class="fitting-grid">${cannonChoices || '<p>No compatible cannons fitted or available in this city.</p>'}</div><div class="customization-actions"><button name="intent" value="preview">Preview cannon loadout</button>${commitButton}</div></form></div><h2>Ammunition <small>${totalLoadedShots} shots loaded</small></h2><p><a href="/vehicles/boxes?vehicleId=${vehicle.id}">Open ammunition boxes into crates</a>, then load those crates here. Ammunition cards show accuracy and the part of an enemy ship they damage.</p><div class="stacked-actions">${ammo}</div><form class="ammo-unload" method="post" action="/vehicles/${vehicle.id}/ammo/unload"><p>Unload ${fullAmmoCrates} complete crate${fullAmmoCrates === 1 ? '' : 's'} to ${escapeHtml(city.name)}.${totalLooseShots ? ` ${totalLooseShots} loose shot${totalLooseShots === 1 ? '' : 's'} cannot be repacked.` : ' No shots will be lost.'}</p>${unloadWarning}<button class="secondary"${totalLoadedShots ? '' : ' disabled'}>Unload all ammunition</button></form></section>` : '';
  const hasStoredLoadout = vehicle.cargoSize > 0 || vehicle.mods.length > 0
    || vehicle.weapons.length > 0 || vehicle.cannons.length > 0 || totalLoadedShots > 0;
  const pageTitle = `<section class="page-title"><div><p class="eyebrow">${escapeHtml(vehicle.type)} in ${escapeHtml(city.name)} ${rankBadge(vehicle.rank, 1, catalog)}</p><h1>${escapeHtml(vehicle.name)}</h1></div><a href="${view === 'status' ? '/vehicles' : `/vehicles/${vehicle.id}`}">${view === 'status' ? 'Back to vehicles' : 'Back to vehicle status'}</a></section>`;
  const hero = `<section class="vehicle-hero vehicle-hero-compact">${itemCard(vehicleItem, { compact: true, meta: vehicle.name })}<div><p>Speed ${vehicle.speed} · cargo ${vehicle.cargoSize}/${vehicle.capacity} · ${vehicle.capacityBreakdown?.free ?? freeCapacity} total capacity free · rating ${Math.round(vehicle.rating)}${vehicle.rank ? ` · tier ${vehicle.rank}` : ''}${vehicle.damaged ? ' · DAMAGED' : ''}</p></div></section>`;
  if (view === 'cargo') {
    return `${pageTitle}${hero}${loadoutOverview}<section><h2>Cargo</h2><p>Choose the complete cargo manifest, preview its capacity and combat effects, then commit that exact proposal. Carried land weapons contribute offense and defense; they are still cargo, not fitted weapons. Cannons and ammunition carried as cargo cannot fire.</p><div id="vehicle-loadout-editor" data-live-preview-scope>${previewPanel}<form method="post" action="/vehicles/${vehicle.id}/cargo" data-live-preview-form>${previewBindingInput}<div class="table-scroll"><table class="cargo-loadout-table"><thead><tr><th>Thing</th><th>Available here</th><th>Proposed cargo</th></tr></thead><tbody>${cargoRows || '<tr><td colspan="3">No compatible cargo in this city.</td></tr>'}</tbody></table></div><div class="customization-actions"><button name="intent" value="preview">Preview cargo</button>${commitButton}</div></form></div></section>`;
  }
  if (view === 'customize') {
    return `${pageTitle}${hero}${loadoutOverview}${landFittings}${shipFittings}`;
  }
  return `${pageTitle}
    <section class="vehicle-hero">${itemCard(vehicleItem, { featured: true, meta: vehicle.name })}<div><p>Speed ${vehicle.speed} · cargo ${vehicle.cargoSize}/${vehicle.capacity} · ${vehicle.capacityBreakdown?.free ?? freeCapacity} total capacity free · rating ${Math.round(vehicle.rating)}${vehicle.rank ? ` · tier ${vehicle.rank}` : ''}${vehicle.damaged ? ' · DAMAGED' : ''}</p><form class="inline-order" method="post" action="/vehicles/${vehicle.id}/rename"><input name="name" maxlength="${Number(catalog.settings.vehicle_name_max_length)}" value="${escapeHtml(vehicle.customName)}" placeholder="Custom name"><button>Rename</button></form></div></section>${loadoutOverview}
    <section class="vehicle-manage-actions"><h2>Manage vehicle</h2><p>${vehicle.type === 'air' ? 'Cargo has its own focused screen.' : 'Cargo and customization are separate so you can focus on one job at a time.'}</p><div class="button-row"><a class="button" href="/vehicles/${vehicle.id}/cargo">Manage cargo</a>${vehicle.type === 'air' ? '' : `<a class="button" href="/vehicles/${vehicle.id}/customize">Customize ${vehicle.type === 'sea' ? 'cannons and ammunition' : 'mods and weapons'}</a>`}</div></section>
    <section><h2>Oil</h2>${oilItem ? itemCard(oilItem, { count: local[oilItem.id] ?? 0, compact: true, meta: [`${vehicle.oiledTrips} boosted trips loaded`, `${vehicle.tripsStolen} stolen trips`], action: `<form method="post" action="/vehicles/${vehicle.id}/oil"><button ${vehicle.routeType === airRouteType || !(local[oilItem.id] ?? 0) ? 'disabled' : ''}>Load one barrel</button></form>${vehicle.tripsStolen ? `<form method="post" action="/vehicles/${vehicle.id}/oil/unload"><button class="secondary">Reclaim a barrel</button></form>` : ''}` }) : ''}</section>
    <section><h2>Send</h2>${routeOptions ? `<form class="vehicle-send" method="post" action="/vehicles/${vehicle.id}/send"><label>Route<select name="routeId"${vehicle.damaged ? ' disabled' : ''}>${routeOptions}</select></label>${vehicle.routeType === airRouteType ? '<input type="hidden" name="travelOrder" value="peaceful">' : `<label>Order<select name="travelOrder"${vehicle.damaged ? ' disabled' : ''}>${travelOrderOptions}</select></label><fieldset${vehicle.damaged ? ' disabled' : ''}><legend>Engage vehicles of these rarities</legend>${vehicleRarities(catalog).map((entry) => `<label><input type="checkbox" name="attack_${entry.id}"${vehicle.aggressiveMask & (1 << entry.id) ? ' checked' : ''}>${escapeHtml(entry.name)}</label>`).join('')}<label><input type="checkbox" name="attackSentry"${vehicle.aggressiveVsSentry ? ' checked' : ''}>Also engage patrols</label></fieldset>`}<button${vehicle.damaged ? ' disabled' : ''}>Send</button></form>` : '<p>No compatible routes from this city.</p>'}</section>
    <section><h2>History</h2><table><thead><tr><th>When</th><th>Event</th><th>Encounter</th><th></th></tr></thead><tbody>${events || '<tr><td colspan="4">No journeys yet.</td></tr>'}</tbody></table></section>
    <form method="post" action="/vehicles/${vehicle.id}/store">${hasStoredLoadout ? '<p>Unload cargo and remove every fitting, cannon, and ammunition shot before storing this vehicle as a thing.</p>' : ''}<button class="secondary"${hasStoredLoadout ? ' disabled' : ''}>Store as item</button></form>`;
}

function battlePage(report) {
  const reportNumber = (value, label) => {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`Battle report is missing ${label}.`);
    return number;
  };
  if (!report.opponent || typeof report.opponent.player_name !== 'string') {
    throw new Error('Battle report is missing its opponent record.');
  }
  const result = report.details.result;
  const outcome = report.tied ? 'Tie' : report.won ? 'Victory' : 'Defeat';
  if (!result || !Array.isArray(report.details.vehicleIds)) {
    throw new Error('Battle report is missing its recorded result.');
  }
  const side = report.details.vehicleIds.indexOf(report.vehicleId);
  if (side < 0) throw new Error('Battle report does not identify your vehicle.');
  const enemyAggressive = Boolean(report.opponent.aggressive);
  let details = '';
  if (report.details.type === 'land2') {
    const start = report.details.starting?.[side];
    const end = result.ending?.[side];
    if (!start || !end) throw new Error('Battle report is missing land-combat state.');
    details = `<h2>Land battle</h2><p>Your vehicle started with ${reportNumber(start.attack, 'starting attack')} attack, ${reportNumber(start.armor, 'starting armor')} armor, ${reportNumber(start.offense, 'starting offense')} offense, ${reportNumber(start.defense, 'starting defense')} defense, and ${reportNumber(start.dodge, 'starting dodge')} dodge. After ${reportNumber(result.rounds, 'round count')} rounds, it had ${reportNumber(end.attack, 'ending attack')} attack and ${reportNumber(end.armor, 'ending armor')} armor. The final blow dealt ${reportNumber(result.finalBlow, 'final blow')} damage.</p>`;
  } else if (report.details.type === 'ship') {
    const ship = result.ships?.[side];
    const shots = result.shots?.[side];
    const casualtiesForSide = result.casualties?.[side];
    if (!ship || !Array.isArray(shots) || !Array.isArray(casualtiesForSide)) {
      throw new Error('Battle report is missing ship-combat state.');
    }
    const hits = shots.filter((shot) => shot.hit).length;
    details = `<h2>Cannon and crew battle</h2><p>Your ship fired ${shots.length} cannon shots and landed ${hits}. It finished with ${reportNumber(ship.hull, 'ending hull')} hull, ${reportNumber(ship.speed, 'ending speed')} speed, and ${reportNumber(ship.crew, 'ending crew')} crew; ${casualtiesForSide.length} crew were lost.${result.chainEscape ? ' Chain-shot damage allowed the faster ship to escape.' : ''}</p>`;
  } else {
    throw new Error(`Unknown battle report type: ${report.details.type}.`);
  }
  const opponentVehicleName = typeof report.opponent.vehicle_name === 'string'
    ? report.opponent.vehicle_name : 'Vehicle data unavailable';
  return `<section class="page-title"><div><p class="eyebrow">Battle report</p><h1>${outcome}</h1></div><a href="/vehicles">Back to vehicles</a></section>
    <section class="battle-summary"><h2>${escapeHtml(report.opponent.player_name)}'s ${escapeHtml(opponentVehicleName)}</h2>
    <p>Your vehicle was <strong>${report.aggressive ? 'aggressive' : 'defensive'}</strong>; the enemy was <strong>${enemyAggressive ? 'aggressive' : 'defensive'}</strong>.</p>${details}
    <p class="battle-outcome">${report.tied ? 'You tied.' : report.won ? 'You won.' : 'You lost.'}</p><p>Rating ${Math.round(report.ratingBefore)} → <strong>${Math.round(report.ratingAfter)}</strong></p></section>`;
}

function ratingsPage(report, catalog) {
  const sections = report.ratings.map((group) => `<section><h2>${escapeHtml(
    catalogLabel(catalog, 'vehicle_type', group.routeType))} ranks</h2><ol class="ratings-list">${group.players.map((entry) =>
    `<li><span>${entry.rank}.</span>${rankBadge(entry.tierRank, entry.vehicleCount, catalog)}<a href="/miners/${encodeURIComponent(entry.name)}">${escapeHtml(entry.name)}</a><small>${entry.meldCount} melds · ${Math.round(entry.rating)} rating · ${entry.vehicleCount} vehicles</small></li>`).join('') || '<li>No rated vehicles.</li>'}</ol></section>`).join('');
  const classes = [...new Set(catalog.settings.combat_class_by_rarity.map(Number)
    .filter((value) => value > 0))];
  const tabs = classes.map((combatClassValue) => {
    const rarities = catalog.settings.combat_class_by_rarity
      .map((value, rarity) => ({ value: Number(value), rarity }))
      .filter((entry) => entry.value === combatClassValue)
      .map((entry) => catalog.settings.rarity_color_names[entry.rarity]);
    const label = rarities.length > 1 ? `${rarities[0]}–${rarities.at(-1)}` : rarities[0];
    return `<a href="/ratings?class=${combatClassValue}">${escapeHtml(label)}</a>`;
  }).join('');
  return `<section class="page-title"><div><p class="eyebrow">PvP ranks</p><h1>Vehicle rankings</h1></div><a href="/vehicles">Back to vehicles</a></section><nav class="rating-tabs">${tabs}</nav>
    <p>Each vehicle earns its own combat rating. A miner's strongest vehicle determines the badge tier, and the number of vehicles in that color expands the badge.</p><div class="ratings-grid">${sections}</div>`;
}

function ammoBoxesPage(player, catalog, vehicleId = null) {
  const query = Number.isSafeInteger(vehicleId) && vehicleId > 0
    ? `?vehicleId=${vehicleId}` : '';
  const backHref = query ? `/vehicles/${vehicleId}/customize` : '/vehicles';
  const backLabel = query ? 'Back to ship loadout' : 'Back to vehicles';
  const rows = [...catalog.boxes].sort(compareCatalogEntriesByRarity(catalog)).map((box) => {
    const boxItem = catalog.byId.get(box.itemId);
    const ammo = catalog.cannonballByType.get(box.type);
    const ammoItem = catalog.byId.get(ammo.itemId);
    const boxes = player.inventory[box.itemId] ?? 0;
    const crates = player.inventory[ammo.itemId] ?? 0;
    return `<tr><td>${itemCard(boxItem, { count: boxes, compact: true })}</td><td>${itemCard(ammoItem, { count: crates, compact: true })}</td><td><form method="post" action="/vehicles/boxes/${box.type}/open${query}"><label>${escapeHtml(boxItem.name)} boxes<input aria-label="${escapeHtml(boxItem.name)} boxes to open" type="number" name="quantity" min="1" max="${Math.max(1, boxes)}" value="1" ${boxes ? '' : 'disabled'}></label><button ${boxes ? '' : 'disabled'}>Open boxes</button></form></td></tr>`;
  }).join('');
  return `<section class="page-title"><div><p class="eyebrow">Ship ammunition</p><h1>Open ammo boxes</h1></div><a href="${backHref}">${backLabel}</a></section>
    <p>Each box opens into ${catalog.settings.ammo_box_crates} crates, with ${catalog.settings.shots_per_crate} shots per crate. Opened crates cannot be repacked.</p><table><thead><tr><th>Boxes</th><th>Crates</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}

function containersPage(data) {
  const rows = data.containers.map((container) => `<tr><td>${escapeHtml(container.name)}</td><td>+${container.capacity}</td><td>${container.quantity}</td><td>${container.credits} credits</td><td><form method="post" action="/containers/${container.id}/buy"><button ${data.credits < container.credits ? 'disabled' : ''}>Buy</button></form></td></tr>`).join('');
  return `<section class="page-title"><div><p class="eyebrow">Credits shop</p><h1>Inventory containers</h1></div><p>${data.credits} credits · base inventory limit ${data.itemLimit}</p></section>
    <p>Each container type permanently adds its capacity once. Extra copies remain owned but do not increase your limit again.</p><table><thead><tr><th>Name</th><th>Capacity</th><th>Owned</th><th>Price</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}

function machineDescription(machineType, rarity, settings = {}) {
  if (!machineType) throw new Error('Missing Oil Field machine type.');
  const multiplier = Number(machineType.displayPowerMultiplier);
  if (!Number.isFinite(multiplier)) throw new Error('Invalid machine display-power multiplier.');
  return {
    text: machineType.description,
    power: catalogArrayNumber(settings, 'machine_power', rarity) * multiplier,
    lifeDays: catalogArrayNumber(settings, 'machine_life_days', rarity)
  };
}

function originalOilFieldState(player, field, catalog, currentTime) {
  const machines = {};
  const machineTypes = {};
  const addMachine = (machine) => {
    if (!machine || machines[machine.id]) return;
    const typeId = machine.machineTypeId ?? machine.type;
    if (!machine.typeName) throw new Error(`Missing Oil Field machine type name for ${machine.id}.`);
    machineTypes[typeId] = machine.typeName;
    machines[machine.id] = {
      Machine: { id: machine.id, item_id: machine.itemId, machine_type_id: typeId },
      MachineType: { id: typeId, name: machine.typeName },
      Item: {
        id: machine.itemId, name: machine.name, icon: machine.icon,
        rarity: String(machine.rarity)
      }
    };
  };
  for (const machine of field.ownedMachines) addMachine(machine);
  for (const hex of field.hexes) {
    addMachine(hex.machine ? { ...hex.machine, id: hex.machine.machineId } : null);
    addMachine(hex.queuedMachine ? { ...hex.queuedMachine, id: hex.queuedMachine.machineId } : null);
  }
  const updateTime = currentTime / 1000;
  const hexes = field.hexes.map((hex) => ({
    Hex: { id: hex.id, x: hex.x, y: hex.y, available: hex.available },
    HexesMachine: hex.machine ? {
      id: hex.machine.id, hex_id: hex.id, machine_id: hex.machine.machineId,
      rarity: String(hex.machine.rarity), miner_id: hex.machine.playerId,
      point: hex.machine.point, power: hex.machine.power,
      life: hex.machine.lifeRemaining / 1000, life_rate: hex.machine.lifeRate,
      life_update_time: updateTime, animation_rate: hex.machine.animationRate,
      animation_flag: hex.machine.animationFlag, created: hex.machine.deployedAt / 1000
    } : null,
    QueuedMachine: hex.queuedMachine ? {
      hex_id: hex.id, machine_id: hex.queuedMachine.machineId,
      miner_id: hex.queuedMachine.playerId, point: hex.queuedMachine.point
    } : null,
    Oil: hex.oilLiters === null ? null : {
      oil: hex.oilLiters * Number(catalog.settings.oil_units_per_liter), oil_rate: hex.oilRate,
      oil_update_time: updateTime,
      barrel_oil: hex.barrelProgressLiters * Number(catalog.settings.oil_units_per_liter),
      barrel_oil_rate: hex.barrelRate, barrel_oil_update_time: updateTime,
      barrels: hex.barrels
    }
  }));
  const miners = Object.fromEntries(field.hexes.flatMap((hex) => [hex.machine, hex.queuedMachine])
    .filter(Boolean).map((machine) => [machine.playerId, machine.ownerName]));
  const ownedMachines = field.ownedMachines.map((machine) => ({
    ...machines[machine.id], count: machine.quantity,
    MachineType: { id: machine.machineTypeId ?? machine.type, name: machine.typeName }
  }));
  const machineItemNames = (predicate) => catalog.machines.filter(predicate).map((machine) => {
    const item = catalog.byId.get(machine.itemId);
    if (!item) throw new Error(`Missing catalog item ${machine.itemId} for Oil Field machine.`);
    return item.name;
  });
  return {
    hexes, machines, miners, machineTypes, ownedMachines, minerId: player.id,
    hasHeli: field.hasHelicopter, hasBomber: field.hasBomber,
    unitsPerBarrel: catalog.settings.oil_units_per_barrel,
    unitsPerLiter: catalog.settings.oil_units_per_liter,
    oilBuildTiers: catalog.settings.oil_build_tier_ids,
    oilspill: catalog.settings.oil_spill_units,
    directionNames: catalog.settings.oil_direction_names,
    rarityNames: catalog.settings.rarity_color_names,
    bombMachineTypeIds: catalog.machines.filter((machine) => machine.rules.isBomb)
      .map((machine) => machine.machineTypeId),
    packingMachineTypeIds: catalog.machines.filter((machine) => machine.rules.canPack)
      .map((machine) => machine.machineTypeId),
    pipeMachineTypeIds: catalog.machines.filter((machine) => machine.rules.showsPipeFlow)
      .map((machine) => machine.machineTypeId),
    labels: {
      helicopter: catalogItemForSetting(catalog, 'helicopter_item_id').name,
      searchPlane: catalogItemForSetting(catalog, 'search_plane_item_id').name,
      bomber: catalogItemForSetting(catalog, 'bomber_item_id').name,
      oil: catalogItemForSetting(catalog, 'oil_item_id').name,
      bombs: machineItemNames((machine) => machine.rules.isBomb),
      packers: machineItemNames((machine) => machine.rules.canPack),
      cranes: machineItemNames((machine) => machine.type === 'crane')
    },
    animate: true, timeLastChecked: 0, generatedAt: currentTime
  };
}

function originalOilFieldPage(player, field, catalog, currentTime) {
  const state = originalOilFieldState(player, field, catalog, currentTime);
  const city = catalog.cities.find((candidate) => candidate.id === field.cityId);
  if (!city) throw new Error(`Missing Oil Field city ${field.cityId}.`);
  const cityName = city.name;
  const labels = state.labels;
  const bombNames = joinedNames(labels.bombs);
  const packerNames = joinedNames(labels.packers);
  const craneNames = joinedNames(labels.cranes);
  const directions = catalog.settings.oil_direction_names
    .map((direction, point) => `<option value="${point}">${direction}</option>`).join('');
  const unavailableBuildTier = Number(catalog.settings.oil_build_tier_ids.unavailable);
  const deployHexes = field.hexes.filter((hex) => hex.available !== unavailableBuildTier
    && (!hex.machine || hex.machine.playerId === player.id))
    .map((hex) => `<option value="${hex.id}">${hex.x},${hex.y}${hex.machine ? ' · occupied (replace)' : ''}${hex.available === Number(catalog.settings.oil_build_tier_ids.helicopter) ? ' · helicopter row' : ''}</option>`).join('');
  const machineParts = field.ownedMachines.filter((machine) => !machine.isBomb)
    .sort(compareItemsByRarity)
  const bombParts = field.ownedMachines.filter((machine) => machine.isBomb)
    .sort(compareItemsByRarity)
  const machineItem = (machine) => {
    const item = catalog.byId.get(machine.itemId);
    if (!item) throw new Error(`Missing catalog item: ${machine.itemId}.`);
    return item;
  };
  const inventoryCards = [...machineParts, ...bombParts].sort(compareItemsByRarity)
    .map((machine) => itemCard(machineItem(machine), { count: machine.quantity, compact: true, meta: machine.type })).join('');
  const pickerCards = (machines, label) => machines.map((machine) => itemCard(machineItem(machine), {
    count: machine.quantity, compact: true, className: 'item-card-picker', meta: machine.type,
    action: `<label><input type="radio" name="machineId" value="${machine.id}" required> ${label}</label>`
  })).join('');
  const machinePickerCards = pickerCards(machineParts, 'Select');
  const bombPickerCards = pickerCards(bombParts, 'Select');
  const ownHexes = field.hexes.filter((hex) => hex.machine?.playerId === player.id)
    .sort((first, second) => compareItemsByRarity(first.machine, second.machine))
    .map((hex) => `<option value="${hex.id}">${hex.x},${hex.y}</option>`).join('');
  const bombTargets = field.hexes.filter((hex) => hex.machine || Number(hex.oilLiters) > 0)
    .map((hex) => `<option value="${hex.id}">${hex.x},${hex.y}${hex.machine ? ' · occupied' : ' · oil spill'}</option>`).join('');
  const machineRows = field.hexes.filter((hex) => hex.machine)
    .sort((first, second) => compareItemsByRarity(first.machine, second.machine))
    .map((hex) => {
      const machine = hex.machine;
      const canClaim = machine.playerId === player.id && machine.canPack;
      const needsPacker = machine.playerId === player.id && !canClaim && hex.barrels > 0;
      const oil = hex.oilLiters === null ? `hidden without a ${labels.searchPlane}`
        : `${formatGold(hex.oilLiters)}L · ${hex.barrels} barrels · ${formatGold(hex.barrelProgressLiters)}/${formatGold(Number(catalog.settings.oil_units_per_barrel) / Number(catalog.settings.oil_units_per_liter))}L packing`;
      const deployedCard = itemCard(machineItem(machine), { compact: true, meta: 'Deployed' });
      const queuedCard = hex.queuedMachine
        ? itemCard(machineItem(hex.queuedMachine), { compact: true, meta: 'Queued replacement' }) : '';
      return `<tr><td>${hex.x},${hex.y}</td><td><div class="oil-machine-cards">${deployedCard}${queuedCard}</div></td><td>${escapeHtml(machine.ownerName)}</td><td>${formatGold(machine.power)} kW · ${formatDuration(machine.lifeRemaining)}</td><td>${oil}</td><td>${canClaim ? `<form method="post" action="/oil-field/${hex.id}/claim"><button ${hex.barrels < 1 ? 'disabled' : ''}>Claim barrel</button></form>` : needsPacker ? '<small>Replace with a packing machine to claim.</small>' : ''}</td></tr>`;
    }).join('');
  const eventRows = field.events.map((event) => `<tr><td>${new Date(event.createdAt).toLocaleString('en-GB')}</td><td>${escapeHtml(event.type)}</td><td>${event.hexId}</td><td>${event.otherPlayerName ? escapeHtml(event.otherPlayerName) : ''}</td><td>${event.details.litersLost ? `${event.details.litersLost}L burned` : escapeHtml(event.details.name ?? event.details.type ?? '')}</td></tr>`).join('');
  const stats = field.stats ? `<section><h2>${escapeHtml(catalogGadgetForBehavior(catalog, 'ledger').displayName)} field report</h2><div class="table-scroll"><table><thead><tr><th>Miner</th><th>Machines</th><th>Oil</th><th>Pumping</th><th>Packing</th><th>Barrels</th></tr></thead><tbody>${field.stats.map((entry) => `<tr><td><a href="/miners/${encodeURIComponent(entry.name)}">${escapeHtml(entry.name)}</a> (${entry.meldCount})</td><td>${entry.machines}</td><td>${entry.oilLiters}L</td><td>${entry.pumpingLitersPerHour}L/h</td><td>${entry.packingLitersPerHour}L/h</td><td>${entry.barrels}</td></tr>`).join('')}</tbody></table></div></section>` : '';
  const serializedState = escapeHtml(JSON.stringify(state));
  const litersPerBarrel = Number(catalog.settings.oil_units_per_barrel)
    / Number(catalog.settings.oil_units_per_liter);
  return `<section class="page-title"><div><p class="eyebrow">Original machine board</p><h1>Oil Field</h1></div><p>Pump, pipe, and pack ${formatGold(litersPerBarrel)} litres into each barrel of ${escapeHtml(labels.oil)}. Fight for the field with the original machines.</p></section>
    <section class="oil-summary"><p>The shared field is in <strong>${escapeHtml(cityName)}</strong>. Drag a machine from the rack onto a hex, rotate it, then deploy, replace, queue, or bomb.</p><strong class="active-state">Field access active</strong></section>
    <p class="oil-aircraft">${escapeHtml(labels.helicopter)}: <strong>${field.hasHelicopter ? 'ready' : 'missing'}</strong> · ${escapeHtml(labels.searchPlane)}: <strong>${field.hasSearchPlane ? 'revealing all oil' : 'other miners’ oil hidden'}</strong> · ${escapeHtml(labels.bomber)}: <strong>${field.hasBomber ? 'ready' : 'missing'}</strong></p>
    <section><h2>Machine parts in the Oil Field city</h2><p>These are the item records represented by the draggable machine rack below.</p><div class="item-grid oil-machine-inventory">${inventoryCards || '<p>No machine parts are stored in the field city.</p>'}</div></section>
    <section class="oil-original-panel" aria-labelledby="oil-board-heading"><div class="oil-board-heading"><div><h2 id="oil-board-heading">Machine field</h2><p>${field.hexes.length} hexes · radius ${Number(catalog.settings.oil_field_max_radius)} · original vector machines and live effects</p></div><div class="oil-board-controls"><button type="button" id="oil-toggle-queued">Show queued</button><button type="button" id="oil-toggle-animation">Pause animation</button><button type="button" id="oil-toggle-colors">Rarity colours</button></div></div>
      <div class="oil-legend" aria-label="Board legend"><span class="oil-key oil-key-own">Your machine</span><span class="oil-key oil-key-rival">Other machine</span><span class="oil-key oil-key-build">Buildable</span><span class="oil-key oil-key-heli">${escapeHtml(labels.helicopter)} row</span><span class="oil-key oil-key-oil">${escapeHtml(labels.oil)}</span><span class="oil-key oil-key-spill">${escapeHtml(labels.oil)} spill</span><span class="oil-key oil-key-closed">Unavailable</span></div>
      <p id="oil-board-status" class="oil-board-status" role="status">Loading the original Oil Field…</p>
      <div class="oil-field-board-shell" data-hex-count="${field.hexes.length}" data-machine-count="${field.hexes.filter((hex) => hex.machine).length}"><div id="board" aria-label="Interactive Oil Field hex board"></div></div>
      <textarea id="oil-field-state" hidden>${serializedState}</textarea>
    </section>
    ${stats}
    <section class="oil-instructions"><h2>Instructions</h2><ul><li>Drag a machine onto a hex, or click it and then click its destination.</li><li>Use the on-board L and R controls before deploying. Once deployed or queued, it cannot be moved or rotated.</li><li>Blue hexes are buildable. The outer blue row requires a ${escapeHtml(labels.helicopter)} in ${escapeHtml(cityName)}.</li><li>Drop onto your own machine to replace it immediately or queue its successor.</li><li>Drop ${escapeHtml(bombNames)} bombs onto a machine or oil spill; a ${escapeHtml(labels.bomber)} is required.</li><li>Click any hex to open its full summary. Only ${escapeHtml(packerNames)} can release completed barrels. Barrels stolen by ${escapeHtml(craneNames)} remain on their hex when you replace the machine with one of those packing machines.</li></ul></section>
    <details class="oil-form-controls"><summary>Keyboard and form controls</summary><section><h2>Deploy a machine</h2><form class="oil-card-form" method="post" action="/oil-field/deploy"><fieldset class="item-picker"><legend>Machine item</legend><div class="item-picker-grid">${machinePickerCards || '<p>No deployable machine items.</p>'}</div></fieldset><div class="oil-form-fields"><label>Available hex<select name="hexId" required>${deployHexes}</select></label><label>Direction<select name="point">${directions}</select></label><button ${!machinePickerCards || !deployHexes ? 'disabled' : ''}>Deploy</button></div></form></section>
    <section class="oil-advanced"><div><h2>Queue a replacement</h2><form class="oil-card-form" method="post" action="/oil-field/queue"><fieldset class="item-picker"><legend>Machine item</legend><div class="item-picker-grid">${machinePickerCards || '<p>No deployable machine items.</p>'}</div></fieldset><div class="oil-form-fields"><label>Your deployed hex<select name="hexId" required>${ownHexes}</select></label><label>Direction<select name="point">${directions}</select></label><button ${!machinePickerCards || !ownHexes ? 'disabled' : ''}>Queue</button></div></form></div><div><h2>Bomb a hex</h2><form class="oil-card-form" method="post" action="/oil-field/bomb"><fieldset class="item-picker"><legend>Bomb item</legend><div class="item-picker-grid">${bombPickerCards || '<p>No bomb items.</p>'}</div></fieldset><div class="oil-form-fields"><label>Target<select name="hexId" required>${bombTargets}</select></label><button ${!field.hasBomber || !bombPickerCards || !bombTargets ? 'disabled' : ''}>Bomb</button></div></form></div></section></details>
    <section><h2>Deployed machines</h2><div class="table-scroll"><table><thead><tr><th>Hex</th><th>Machine</th><th>Operator</th><th>Power/life</th><th>Oil</th><th></th></tr></thead><tbody>${machineRows || '<tr><td colspan="6">The field is empty.</td></tr>'}</tbody></table></div></section>
    <section><h2>Your field events</h2><div class="table-scroll"><table><thead><tr><th>When</th><th>Event</th><th>Hex</th><th>Other miner</th><th>Details</th></tr></thead><tbody>${eventRows || '<tr><td colspan="5">No field events yet.</td></tr>'}</tbody></table></div></section>
    <script src="/js/raphael2.1.2.js" defer></script><script src="/js/machines11.js" defer></script><script src="/node/oil-field.js?v=20260822b" defer></script>`;
}

function mapPage(player, catalog, knownCityIds, vehicles = [], requestedMapSlug = '') {
  const currentCity = catalogCityForId(catalog, player.cityId);
  const playerMap = catalog.maps.find((map) => map.id === currentCity.mapId)
    ?? { id: currentCity.mapId, name: 'Gallego', slug: 'gallego' };
  const known = new Set(knownCityIds);
  const visibleMapIds = new Set(catalog.cities.filter((city) => known.has(city.id)).map((city) => city.mapId));
  visibleMapIds.add(playerMap.id);
  for (const route of catalog.routes.filter((entry) => entry.open && entry.interMap)) {
    const city1 = catalogCityForId(catalog, route.city1Id);
    const city2 = catalogCityForId(catalog, route.city2Id);
    if (visibleMapIds.has(city1.mapId)) visibleMapIds.add(city2.mapId);
    if (visibleMapIds.has(city2.mapId)) visibleMapIds.add(city1.mapId);
  }
  const requestedMap = catalog.maps.find((map) => map.slug === requestedMapSlug
    && visibleMapIds.has(map.id));
  const currentMap = requestedMap ?? playerMap;
  const mapCities = catalog.cities.filter((city) => city.mapId === currentMap.id);
  const mapCityIds = new Set(mapCities.map((city) => city.id));
  const mapRoutes = catalog.routes.filter((route) => route.open
    && mapCityIds.has(route.city1Id) && mapCityIds.has(route.city2Id));
  const mapMineTypes = new Map(mapCities.flatMap((city) =>
    catalog.mineTypesByCity.get(city.id).map((mineType) => [mineType.id, mineType])));
  const interMapRoutes = catalog.routes.filter((route) => route.open && route.interMap
    && (mapCityIds.has(route.city1Id) || mapCityIds.has(route.city2Id)));
  if (!(catalog.mineTypesByCity instanceof Map)) {
    throw new Error('Missing catalog city-mine availability data.');
  }
  const availableMinesForCity = (cityId) => {
    if (!catalog.mineTypesByCity.has(cityId)) {
      throw new Error(`Missing catalog mine availability for city ${cityId}.`);
    }
    return catalog.mineTypesByCity.get(cityId);
  };
  const routeTypes = catalog.settings.map_route_types;
  const routeType = (id) => {
    const value = routeTypes?.[Number(id)];
    if (!value || typeof value.name !== 'string' || typeof value.label !== 'string') {
      throw new Error(`Missing map route type: ${id}.`);
    }
    return value;
  };
  const surfaceRouteTypeIds = [
    catalogRoleId(catalog, 'route_type_ids', 'land'),
    catalogRoleId(catalog, 'route_type_ids', 'sea')
  ];
  const fixedPositions = new Map(Object.entries(catalog.settings.map_city_positions)
    .map(([cityId, position]) => [Number(cityId), position]));
  const positions = new Map(mapCities.map((city) => {
    const position = fixedPositions.get(city.id) ?? { x: city.mapX, y: city.mapY };
    if (!position || !Number.isFinite(Number(position.x)) || !Number.isFinite(Number(position.y))) {
      throw new Error(`Missing map position for city ${city.id}.`);
    }
    return [city.id, position];
  }));
  const terrain = '<image class="map-background" href="/node/map-background.png" x="0" y="0" width="900" height="600" preserveAspectRatio="xMidYMid slice" />';
  const cityNodes = mapCities.map((city) => {
    const position = positions.get(city.id);
    const cityState = city.id === player.cityId ? 'current' : known.has(city.id) ? 'known' : 'unknown';
    const availableMines = availableMinesForCity(city.id);
    const trayWidth = Math.max(42, availableMines.length * 34 + 8);
    const iconStart = -((availableMines.length * 34 - 4) / 2);
    const mineIcons = availableMines.map((mineType, index) => `<g class="map-mine-icon" transform="translate(${iconStart + index * 34} 29)"><title>${escapeHtml(`${mineType.name} Mine available in ${city.name}`)}</title><image href="${escapeHtml(mineType.icon)}" width="30" height="30" /></g>`).join('');
    const mineNames = availableMines.map((mineType) => `${mineType.name} Mine`).join(', ');
    const label = escapeHtml(`${city.name}: ${cityState} city. Mines available: ${mineNames || 'none'}`);
    const gateway = interMapRoutes.some((route) => route.city1Id === city.id || route.city2Id === city.id);
    const node = `<g class="map-city map-city-${cityState}${gateway ? ' map-city-gateway' : ''}" data-city-id="${city.id}" transform="translate(${position.x} ${position.y})"><circle class="map-city-halo" r="25" /><circle class="map-city-pin" r="13" /><text class="map-city-name" text-anchor="middle" y="-24">${escapeHtml(city.name)}</text>${gateway ? '<text class="map-gateway-label" text-anchor="middle" y="-42">GATEWAY</text>' : ''}<g class="map-city-mines"><rect x="${-trayWidth / 2}" y="25" width="${trayWidth}" height="38" rx="8" />${mineIcons}</g></g>`;
    return known.has(city.id) && city.id !== player.cityId
      ? `<a class="map-city-link" href="#city-${city.id}" data-city-select="/cities/${city.id}/select" aria-label="${label}. Switch to this city">${node}</a>`
      : `<g role="group" aria-label="${label}">${node}</g>`;
  }).join('');
  const routeRows = mapRoutes.map((route) => {
    const type = routeType(route.type);
    const city1 = catalogCityForId(catalog, route.city1Id).name;
    const city2 = catalogCityForId(catalog, route.city2Id).name;
    return `<li class="route-summary route-${type.name}"><span>${type.label}</span><strong>${escapeHtml(city1)} ↔ ${escapeHtml(city2)}</strong><small>${route.length ? `${route.length} km` : 'Ore-thief mission'} · ${route.open ? 'open' : 'closed'}</small></li>`;
  }).join('');
  const cities = mapCities.map((city) => {
    const availableMines = availableMinesForCity(city.id);
    const surfaceTypes = surfaceRouteTypeIds.map((routeTypeId) => ({
      routeType: routeTypeId, type: routeType(routeTypeId)
    }))
      .filter(({ type, routeType }) => type && catalog.routes.some((route) =>
        route.open && route.type === routeType
          && (route.city1Id === city.id || route.city2Id === city.id)))
      .map(({ type }) => type);
    const offers = surfaceTypes.length
      ? surfaceTypes.map((type) => `<span class="route-offer route-offer-${type.name}">${type.label}</span>`).join('')
      : '<span class="route-offer route-offer-none">No open surface routes</span>';
    const mineList = availableMines.map((mineType) => `<li><img src="${escapeHtml(mineType.icon)}" alt=""><span><strong>${escapeHtml(mineType.name)}</strong> Mine</span></li>`).join('');
    const status = known.has(city.id) ? (city.id === player.cityId
      ? (city.id === player.homeCityId ? 'Current city · home' : 'Current city')
      : city.id === player.homeCityId ? 'Discovered · home' : 'Discovered') : 'Undiscovered';
    return `<article id="city-${city.id}" class="city-card ${known.has(city.id) ? 'known' : 'unknown'}${city.id === player.cityId ? ' current' : ''}" data-city-id="${city.id}"><h3>${escapeHtml(city.name)}</h3><p class="city-status">${status}</p><p class="city-routes"><strong>Routes</strong>${offers}</p><h4>Mines available</h4><ul class="city-mines">${mineList || '<li>None</li>'}</ul>${known.has(city.id) && city.id !== player.cityId ? `<form method="post" action="/cities/${city.id}/select"><button>View this city</button></form>` : ''}${city.id === player.cityId && city.id !== player.homeCityId ? '<a class="button secondary" href="/move">Make this my home</a>' : ''}</article>`;
  }).join('');
  const mapTabs = catalog.maps.filter((map) => visibleMapIds.has(map.id))
    .map((map) => `<a href="/map?world=${encodeURIComponent(map.slug)}" class="${map.id === currentMap.id ? 'active' : ''}">${escapeHtml(map.name)}</a>`).join('');
  const exits = interMapRoutes.map((route) => {
    const fromHere = mapCityIds.has(route.city1Id);
    const local = catalogCityForId(catalog, fromHere ? route.city1Id : route.city2Id);
    const remote = catalogCityForId(catalog, fromHere ? route.city2Id : route.city1Id);
    const remoteMap = catalog.maps.find((map) => map.id === remote.mapId);
    const remoteCities = catalog.cities.filter((city) => city.mapId === remote.mapId);
    const remoteMineTypeIds = new Set(remoteCities.flatMap((city) =>
      catalog.mineTypesByCity.get(city.id).map((mineType) => mineType.id)));
    const remoteDiscovered = remoteCities.some((city) => known.has(city.id));
    const type = routeType(route.type);
    const eligible = vehicles.filter((vehicle) => vehicle.status === 'idle'
      && vehicle.cityId === local.id && vehicle.routeType === route.type
      && vehicle.routes.some((candidate) => candidate.id === route.id));
    const departures = eligible.length
      ? `<div class="gateway-departures">${eligible.map((vehicle) => `<form method="post" action="/vehicles/${vehicle.id}/send"><input type="hidden" name="routeId" value="${route.id}"><input type="hidden" name="travelOrder" value="peaceful"><button>Send ${escapeHtml(vehicle.name)}</button></form>`).join('')}</div>`
      : `<small>Bring an idle ${escapeHtml(type.label.toLowerCase())} vehicle to ${escapeHtml(local.name)} to travel.</small>`;
    return `<li class="route-summary route-${type.name}"><span>${type.label}</span><strong>${escapeHtml(local.name)} → ${escapeHtml(remoteMap.name)} · ${escapeHtml(remote.name)}</strong><small>${Number(route.length).toLocaleString('en-GB')} km · ${remoteCities.length} cities · ${remoteMineTypeIds.size} mine types${remoteDiscovered ? '' : ' · expedition reward available'}</small>${departures}</li>`;
  }).join('');
  const exitsSection = exits
    ? `<section><h2>Inter-map corridors</h2><ul class="route-list">${exits}</ul></section>` : '';
  return `<nav class="world-map-tabs" aria-label="World maps">${mapTabs}</nav><section class="page-title"><div><p class="eyebrow">${escapeHtml(currentMap.name)} map</p><h1>Cities</h1></div><p>Vehicles reveal cities and maps when they complete a route.</p></section><section class="map-opportunities"><h2>${escapeHtml(currentMap.name)} opportunities</h2><p><strong>${mapCities.length} cities</strong> support <strong>${mapMineTypes.size} mine types</strong>, independent city markets, factories, workers, and local vehicle networks. Establishing production early creates supply where few miners have inventory.</p><p>${[...mapMineTypes.values()].map((mineType) => escapeHtml(mineType.name)).join(' · ')}</p></section>
    <figure class="route-map"><svg viewBox="0 0 900 600" role="img" aria-labelledby="route-map-title route-map-description"><title id="route-map-title">MineThings cities and gateways</title><desc id="route-map-description">An illustrated island map with clickable city names, available mine types, and gateway cities. Route details are listed below the map.</desc>${terrain}<g class="city-layer">${cityNodes}</g></svg><figcaption><span class="city-key city-key-current">Current city</span><span class="city-key city-key-unknown">Undiscovered</span><span class="mine-key">Mine types available</span><span class="mine-key">Gateway to another map</span></figcaption></figure>
    <section><h2>Local route network</h2><ul class="route-list">${routeRows || '<li>No routes are currently available.</li>'}</ul></section>${exitsSection}
    <section><h2>Choose a city</h2><div class="city-grid">${cities}</div></section><script src="/node/map.js?v=20260821a" defer></script>`;
}

function legacyWorldEventsPage(player, catalog, status, vehicles, currentTime) {
  const weatherPresentation = {
    clear: ['☀️', 'Clear'], cloud: ['☁️', 'Cloudy'], rain: ['🌧️', 'Rain'], storm: ['⛈️', 'Storm']
  };
  const weather = status.weather.map((entry) => {
    const [icon, label] = weatherPresentation[entry.condition] ?? ['?', entry.condition];
    return `<article class="weather-card weather-${entry.condition}"><span class="weather-icon">${icon}</span><div><h3>${escapeHtml(entry.mapName)}</h3><p><strong>${escapeHtml(label)}</strong> · ${entry.temperatureC.toFixed(1)}°C · ${entry.windKph} km/h wind${entry.rainfallMm ? ` · ${entry.rainfallMm} mm rain` : ''}</p><small>Changes in ${formatDuration(entry.endsAt - currentTime)}</small></div></article>`;
  }).join('');
  const active = status.creatures.filter((creature) => creature.status === 'active');
  const creatureCards = active.map((creature) => {
    const eligible = vehicles.filter((vehicle) => vehicle.status === 'idle'
      && vehicle.routeType === creature.routeType
      && [creature.city1Id, creature.city2Id].includes(vehicle.cityId));
    const remaining = Math.min(creature.location, creature.length - creature.location);
    const hunt = eligible.length ? `<form method="post" action="/events/creatures/${creature.id}/attack"><label>Attacking vehicle<select name="vehicleId" required>${eligible.map((vehicle) => `<option value="${vehicle.id}">${escapeHtml(vehicle.name)}</option>`).join('')}</select></label><button>Send to intercept</button></form>`
      : '<p class="muted">Move a compatible idle vehicle to either end of this route to hunt it.</p>';
    return `<article class="creature-card creature-${creature.type} rarity-${creature.rarity}"><header><span class="creature-icon">${escapeHtml(creature.icon)}</span><div><p class="eyebrow">${escapeHtml(creature.mapName)}</p><h3>${escapeHtml(creature.name)}</h3></div></header><p><strong>${escapeHtml(creature.routeName)}</strong> · ${Math.round(creature.location).toLocaleString('en-GB')} km along the route</p><p>Moving toward <strong>${escapeHtml(creature.destinationCityName)}</strong> · about ${Math.ceil(remaining).toLocaleString('en-GB')} km remain.</p><div class="creature-health"><span style="width:${Math.max(0, creature.hp / creature.maxHp * 100)}%"></span></div><p>${Math.ceil(creature.hp)}/${Math.ceil(creature.maxHp)} health · ${creature.attackCount} attacks</p>${hunt}</article>`;
  }).join('');
  const recent = status.creatures.filter((creature) => creature.status !== 'active')
    .map((creature) => `<tr><td>${new Date(creature.resolvedAt).toLocaleString('en-GB')}</td><td>${escapeHtml(creature.name)}</td><td>${escapeHtml(creature.routeName)}</td><td>${creature.status === 'defeated' ? 'Defeated' : `Reached ${escapeHtml(creature.destinationCityName)}`}</td></tr>`).join('');
  const attacks = status.attacks.map((attack) => `<tr><td>${new Date(attack.createdAt).toLocaleString('en-GB')}</td><td>${escapeHtml(attack.name)}</td><td>${attack.damage}</td><td>${attack.counterDamage}</td><td>${attack.defeated ? `Defeated${attack.rewards.length ? ` · ${attack.rewards.map((item) => escapeHtml(item.name)).join(', ')}` : ''}` : 'Wounded'}</td></tr>`).join('');
  return `<section class="page-title"><div><p class="eyebrow">Living world</p><h1>World Events</h1></div><p>Weather follows Cambridge's season but storms are intentionally much more frequent. Events settle in the background even when nobody is viewing this page.</p></section>
    <section class="moon-card"><span class="moon-icon">${status.moon.icon}</span><div><p class="eyebrow">Lunar influence</p><h2>${escapeHtml(status.moon.name)}</h2><p>${escapeHtml(status.moon.effect)}</p><small>About ${status.moon.ageDays.toFixed(1)} lunar days old · next phase in ${formatDuration(status.moon.nextPhaseAt - currentTime)}</small></div></section>
    <section><div class="section-heading"><div><p class="eyebrow">Current conditions</p><h2>Weather</h2></div><a href="${escapeHtml(status.climateSource)}" rel="external noreferrer">Cambridge 1991–2020 baseline</a></div><div class="weather-grid">${weather || '<p>Discover a world to receive its weather.</p>'}</div><p class="muted">Storms can damage or sink ships already at sea and may wake a Kraken.</p></section>
    <section><p class="eyebrow">Route threats</p><h2>Active creatures</h2><div class="creature-grid">${creatureCards || '<p>No event creatures are currently active on your known routes.</p>'}</div></section>
    <section><h2>Recent creature outcomes</h2><div class="table-scroll"><table><thead><tr><th>When</th><th>Creature</th><th>Route</th><th>Outcome</th></tr></thead><tbody>${recent || '<tr><td colspan="4">No recent outcomes.</td></tr>'}</tbody></table></div></section>
    <section><h2>Your hunts</h2><div class="table-scroll"><table><thead><tr><th>When</th><th>Creature</th><th>Damage dealt</th><th>Damage taken</th><th>Outcome</th></tr></thead><tbody>${attacks || '<tr><td colspan="5">You have not hunted a world creature yet.</td></tr>'}</tbody></table></div></section>`;
}

function worldEventsPage(player, catalog, status, vehicles, currentTime) {
  const weatherPresentation = {
    clear: ['&#9728;', 'Clear'], cloud: ['&#9729;', 'Cloudy'],
    rain: ['&#127783;', 'Rain'], storm: ['&#9928;', 'Storm']
  };
  const weather = status.weather.map((entry) => {
    const [icon, label] = weatherPresentation[entry.condition] ?? ['?', entry.condition];
    return `<article class="weather-card weather-${entry.condition}"><span class="weather-icon">${icon}</span><div><h3>${escapeHtml(entry.mapName)}</h3><p><strong>${escapeHtml(label)}</strong> | ${entry.temperatureC.toFixed(1)}&deg;C | ${entry.windKph} km/h wind${entry.rainfallMm ? ` | ${entry.rainfallMm} mm rain` : ''}</p><small>Changes in ${formatDuration(entry.endsAt - currentTime)}</small></div></article>`;
  }).join('');
  const active = status.creatures.filter((creature) => creature.status === 'active');
  const creatureCards = active.map((creature) => {
    const attackOptions = creature.attackOptions ?? [];
    const hunterTiers = creature.hunterRarities.map(
      (rarity) => catalog.settings.rarity_color_names[rarity]
    ).join(' / ');
    const rewardDescription = creature.rewardType === 'ore'
      ? `Drops up to ${Number(creature.oreDrop).toLocaleString('en-GB')} Ore for the killer's free cargo space.`
      : 'The killing vehicle fills every remaining cargo slot with treasure.';
    const pursuitRows = (creature.pursuers ?? []).map((pursuit) =>
      `<li><strong>${pursuit.own ? 'Your ' : `${escapeHtml(pursuit.playerName)}'s `}${escapeHtml(pursuit.vehicleName)}</strong> will intercept at ${Math.round(pursuit.encounterLocation).toLocaleString('en-GB')} km in ${formatDuration(pursuit.encounterAt - currentTime)}.</li>`
    ).join('');
    const attack = attackOptions.length
      ? `<form method="post" action="/events/creatures/${creature.id}/attack"><label>Attacking vehicle<select name="vehicleId" required>${attackOptions.map((option) => `<option value="${option.vehicleId}">${escapeHtml(option.vehicleName)} | ${Number(option.speed).toFixed(1)} km/h | intercept in ${formatDuration(option.encounterAt - currentTime)} | ${option.freeCapacity} bounty slots</option>`).join('')}</select></label><button>Send to intercept</button></form>`
      : '<p class="muted">No compatible idle vehicle can reach it before it enters the city.</p>';
    return `<article class="creature-card creature-${creature.type} rarity-${creature.rarity}"><header><span class="creature-icon">${escapeHtml(creature.icon)}</span><div><p class="eyebrow">${escapeHtml(creature.mapName)} · ${escapeHtml(creature.rarityName)}</p><h3>${escapeHtml(creature.name)}</h3></div></header><dl><div><dt>Route</dt><dd>${escapeHtml(creature.routeName)}</dd></div><div><dt>Position</dt><dd>${Math.round(creature.location).toLocaleString('en-GB')} / ${Number(creature.length).toLocaleString('en-GB')} km</dd></div><div><dt>Movement</dt><dd>${Number(creature.speed).toFixed(1)} km/h toward ${escapeHtml(creature.destinationCityName)}</dd></div><div><dt>Arrival</dt><dd>${formatDuration(creature.arrivesAt - currentTime)}</dd></div><div><dt>Combat class</dt><dd>${escapeHtml(hunterTiers)} vehicles</dd></div><div><dt>Drop</dt><dd>${escapeHtml(creature.rewardType === 'ore' ? `${creature.oreDrop} Ore` : 'Treasure')}</dd></div></dl><div class="creature-health"><span style="width:${Math.max(0, creature.hp / creature.maxHp * 100)}%"></span></div><p>${Math.ceil(creature.hp)}/${Math.ceil(creature.maxHp)} health | ${creature.attackCount} completed attack${creature.attackCount === 1 ? '' : 's'}</p>${pursuitRows ? `<h4>Vehicles underway</h4><ul>${pursuitRows}</ul>` : ''}${attack}<p class="muted">${escapeHtml(rewardDescription)}</p></article>`;
  }).join('');
  const recent = status.creatures.filter((creature) => creature.status !== 'active')
    .map((creature) => `<tr><td>${new Date(creature.resolvedAt).toLocaleString('en-GB')}</td><td>${escapeHtml(creature.name)}</td><td>${escapeHtml(creature.routeName)}</td><td>${creature.status === 'defeated' ? 'Defeated by a vehicle' : `Entered ${escapeHtml(creature.destinationCityName)}`}</td></tr>`).join('');
  const attacks = status.attacks.map((attackEntry) => {
    const rewardQuantity = attackEntry.rewards.reduce(
      (sum, item) => sum + Number(item.quantity ?? 0), 0
    );
    const reward = attackEntry.rewardType === 'ore'
      ? `${rewardQuantity} Ore` : `${rewardQuantity} treasure item${rewardQuantity === 1 ? '' : 's'}`;
    return `<tr><td>${new Date(attackEntry.createdAt).toLocaleString('en-GB')}</td><td>${escapeHtml(attackEntry.name)}</td><td>${attackEntry.damage}</td><td>${attackEntry.counterDamage}</td><td>${attackEntry.defeated ? `Killing blow | ${escapeHtml(reward)}` : 'Wounded'}</td></tr>`;
  }).join('');
  const activeGhosts = (status.ghosts ?? []).filter((ghost) => !ghost.defeatedAt);
  const ghostCards = activeGhosts.map((ghost) => {
    const progress = ghost.arrivesAt > ghost.departedAt
      ? Math.max(0, Math.min(100, (currentTime - ghost.departedAt)
        / (ghost.arrivesAt - ghost.departedAt) * 100)) : 0;
    const bountyCount = ghost.bounty.reduce(
      (sum, item) => sum + Number(item.quantity ?? 0), 0);
    return `<article class="ghost-card ghost-${ghost.kind}"><header><img src="${escapeHtml(ghost.icon)}" alt=""><div><p class="eyebrow">${ghost.kind === 'ship' ? 'Ghost Ship' : 'Ghost Rider'} | Tier ${ghost.rarity}</p><h3>${escapeHtml(ghost.name)}</h3></div></header><p><strong>${escapeHtml(ghost.routeName)}</strong></p><div class="ghost-route-progress"><span style="width:${progress.toFixed(1)}%"></span></div><p>Patrolling at ${Number(ghost.speed).toFixed(1)} km/h | ${bountyCount} spectral bounty thing${bountyCount === 1 ? '' : 's'} aboard</p><p class="muted">Send a land vehicle or ship in the same combat class on <strong>Pillage</strong> orders. The ghost patrol will engage it; “attack patrols” lets your hunter strike first.</p></article>`;
  }).join('');
  const recentGhosts = (status.ghosts ?? []).filter((ghost) => ghost.defeatedAt)
    .map((ghost) => `<tr><td>${new Date(ghost.defeatedAt).toLocaleString('en-GB')}</td><td>${escapeHtml(ghost.name)}</td><td>${escapeHtml(ghost.routeName)}</td><td>${ghost.defeatedByName ? `Banished by ${escapeHtml(ghost.defeatedByName)}` : 'Banished'}${ghost.defeatedBattleId ? ` | <a href="/battles/${ghost.defeatedBattleId}">battle report</a>` : ''}</td></tr>`).join('');
  return `<section class="page-title"><div><p class="eyebrow">Living world</p><h1>World Events</h1></div><p>Tiered creatures travel as live route actors. A matching land vehicle or ship must physically intercept one before it enters the city.</p></section>
    <section class="moon-card"><span class="moon-icon">${status.moon.icon}</span><div><p class="eyebrow">Lunar influence</p><h2>${escapeHtml(status.moon.name)}</h2><p>${escapeHtml(status.moon.effect)}</p><small>About ${status.moon.ageDays.toFixed(1)} lunar days old | next phase in ${formatDuration(status.moon.nextPhaseAt - currentTime)}</small></div></section>
    <section><div class="section-heading"><div><p class="eyebrow">Current conditions</p><h2>Weather</h2></div><a href="${escapeHtml(status.climateSource)}" rel="external noreferrer">Cambridge 1991-2020 baseline</a></div><div class="weather-grid">${weather || '<p>Discover a world to receive its weather.</p>'}</div><p class="muted">Storms can damage or sink ships already at sea and may wake a Kraken.</p></section>
    <section><p class="eyebrow">Route traffic</p><h2>Traveling creatures</h2><div class="creature-grid">${creatureCards || '<p>No event creatures are currently traveling on your known routes.</p>'}</div></section>
    <section class="ghost-section"><p class="eyebrow">The restless dead</p><h2>Haunted routes</h2><p>Destroyed vehicles and sunken ships may rise again, stronger and hungry for cargo. They patrol forever until another miner banishes them.</p><div class="ghost-grid">${ghostCards || '<p>No ghosts currently haunt your known routes.</p>'}</div></section>
    <section><h2>Recently banished</h2><div class="table-scroll"><table><thead><tr><th>When</th><th>Ghost</th><th>Route</th><th>Outcome</th></tr></thead><tbody>${recentGhosts || '<tr><td colspan="4">No ghosts have been banished recently.</td></tr>'}</tbody></table></div></section>
    <section><h2>Recent creature outcomes</h2><div class="table-scroll"><table><thead><tr><th>When</th><th>Creature</th><th>Route</th><th>Outcome</th></tr></thead><tbody>${recent || '<tr><td colspan="4">No recent outcomes.</td></tr>'}</tbody></table></div></section>
    <section><h2>Your attacks</h2><div class="table-scroll"><table><thead><tr><th>When</th><th>Creature</th><th>Damage dealt</th><th>Damage taken</th><th>Outcome</th></tr></thead><tbody>${attacks || '<tr><td colspan="5">You have not attacked a world creature yet.</td></tr>'}</tbody></table></div></section>`;
}

function movePage(player, catalog, currentTime) {
  const city = catalogCityForId(catalog, player.cityId);
  const home = catalogCityForId(catalog, player.homeCityId);
  const defaultSpecialisation = catalogSpecialisationForId(
    catalog, catalog.settings.default_specialisation_id
  );
  const moveCooldown = Number(catalog.settings.home_move_cooldown_ms);
  const cooldown = Math.max(0, (player.lastMovedAt ?? 0) + moveCooldown - currentTime);
  return `<section class="page-title"><div><p class="eyebrow">Relocation</p><h1>Move to ${escapeHtml(city.name)}</h1></div><a href="/map">Back to map</a></section>
    <section class="move-warning"><p>Would you like to make <strong>${escapeHtml(city.name)}</strong> your new home?</p><p>Moving:</p><ul><li>Changes your home city from ${escapeHtml(home.name)}.</li><li>Nullifies every meld so each can be dismantled back into its original things in your former home city.</li><li>Resets your meld count and specialisation to ${escapeHtml(defaultSpecialisation.name)}.</li><li>Dismantles your avatar into its component things in your former home city.</li><li>Prevents another move for ${formatDuration(moveCooldown)}.</li></ul><p>You cannot move while employed, working, or while a factory you own is busy or rented.</p>${player.brokenMeldIds.length ? '<p class="capacity-warning">Deconstruct all existing broken melds before moving again.</p>' : cooldown ? `<p class="capacity-warning">You can move again in ${formatDuration(cooldown)}.</p>` : `<form method="post" action="/move"><input type="hidden" name="cityId" value="${player.cityId}"><button>Move to ${escapeHtml(city.name)}</button></form>`}</section>`;
}

function historyPage() {
  return `<article class="editorial-page history-page">
    <header class="page-title"><div><p class="eyebrow">An independent restoration</p><h1>The story of MineThings</h1></div><p>A strange, patient browser world about digging up our own civilisation—and the long route that brought it back.</p></header>
    <nav class="article-index" aria-label="History sections"><a href="#beginnings">Beginnings</a><a href="#world">The world</a><a href="#players">Players</a><a href="#economy">Bitcoin</a><a href="#community">Community tools</a><a href="#shutdown">Shutdown</a><a href="#restoration">Restoration</a><a href="#legacy">Legacy</a><a href="#sources">Sources</a></nav>
    <section id="beginnings"><p class="source-kind">Public record</p><h2>2009: a world under the ash</h2><p>MineThings appeared in browser-game directories in October 2009. Its premise skipped two thousand years beyond the Yellowstone eruption: humanity had returned to a buried Earth and made an economy from whatever its miners could recover. It was free to play, persistent, deliberately slow and more interested in ownership and trade than in a conventional quest line.</p></section>
    <section id="world"><p class="source-kind">Public record and surviving code</p><h2>A game made from distance</h2><p>Mines kept working while their owners were away. Things existed in particular cities, local markets developed different shortages, and vehicles made geography matter. Land vehicles, ships and aircraft carried cargo; weapons, modifications, piracy, professions, factories, melds and the shared Oil Field gradually turned an idle collection game into an intricate social simulation.</p><p>The surviving PHP, MySQL and Python code corroborates the dense mechanics described by contemporary players: city-scoped possessions, batteries, rarity tiers, player-priced markets, combat and an unusually uncompromising economy.</p></section>
    <section id="players"><p class="source-kind">Contemporary player record</p><h2>2010: fascinating, slow and sometimes awkward</h2><p>An Ars Technica discussion begun on 20 October 2010 preserves something directory listings cannot: disagreement among actual players. They described starter mines, rarity tiers, melding, buying and renting mines, discovering towns, moving goods, and the dangers of pirates and highwaymen. They also argued about the very slow opening pace, paid acceleration and an interface whose controls were not always obvious.</p><p>The thread records separate Aso and Bromo servers with different worlds and economies. Veterans could make Aso easier through cheap equipment and loans; the newer Bromo offered a more even race to discover items. That tension—between patient discovery, social cooperation, economic advantage and deliberate inconvenience—was central to MineThings rather than incidental to it.</p></section>
    <section id="economy"><p class="source-kind">Contemporary public record</p><h2>2011: experiments in value and Bitcoin</h2><p>Players set auction prices rather than selling into a universal shop. Scarcity emerged from where people mined, travelled and chose to specialise. Optional purchases supported the service, and MineThings was documented as accepting Bitcoin by March 2011, very early in the currency's history.</p><p>A BitcoinTalk promotion on 1 July offered an in-game starter pack and credited MineThings with introducing its author to Bitcoin. The apparent MineThings operator account, <strong>nextnonce</strong>, joined the discussion alongside existing players. On 29 August that account announced that MineThings had removed PayPal and moved exclusively to Bitcoin, claiming approximately 1,500 active players. The number is historically useful but remains an operator-supplied population claim, not an independently audited count. Replies welcomed the experiment while warning that obtaining Bitcoin was difficult and that the game's public explanation of payments and premium content was thin.</p></section>
    <section id="community"><p class="source-kind">Surviving community artefacts</p><h2>Players rebuilt the interface around themselves</h2><p>MineThings attracted players willing to write browser userscripts for it. OpenUserJS preserves tools for the transport page, chat, messages and reclaiming wasted screen space. The transport extension added sorting, filtering, colour coding, ETA calculations, radar and gadget details, dynamic updates, journey statistics and event histories. The messages extension added automatic checking, filtering and different views. A smaller 2016 “Machine Owners” script grouped machines by owner.</p><p>OpenUserJS currently records 17,520 installations for the transport script, 10,009 for chat, 11,039 for screen-space changes, 8,594 for messages and 170 for Machine Owners. These are platform installation counters—not verified unique-player totals—but they demonstrate sustained circulation and a technically engaged community. They also preserve details of the information players needed badly enough to build for themselves.</p></section>
    <section id="shutdown"><p class="source-kind">Public record</p><h2>2020: the machinery stops</h2><p>By 2020 the eleven-year-old service depended on an ageing CakePHP 1.2, PHP, MySQL, Python and CentOS stack. A server upgrade broke parts of the game, support had become exhausting, and the monthly infrastructure bill was difficult to justify. The owner publicly described choosing a player-programmer as a possible successor, but the available discussion did not name that person. MineThings closed in March 2020.</p><p>The community continued to remember it. Mini MineThings was later published as a small memorial, and abandoned-game discussions kept returning to its mix of idling, logistics and human economics.</p></section>
    <section id="restoration"><p class="source-kind operator-account">Operator-supplied account—not independently documented</p><h2>gordonstretch and the codebase</h2><p>The current operator confirms that the unnamed original successor was the player <strong>gordonstretch</strong>, and that gordonstretch is the person operating this restoration. The private codebase was transferred for the attempted succession. The first port proved substantially larger than could be completed in the time then available, so the revival stalled. Public sources document the attempted succession, but they do not independently establish the successor's identity or the private transfer; those details are recorded here as gordonstretch's first-hand account.</p><p class="source-kind">Repository evidence</p><p>The code and database snapshots did survive. Today, AI-assisted development has made the full migration practical. This restoration is a new Node.js and SQLite implementation built from those materials: the old application is preserved as evidence, never executed by the public server. The current game keeps the original catalogue and systems while repairing security, consolidating the old servers into connected worlds, and making long-neglected state visible again.</p></section>
    <section id="legacy"><p class="source-kind">Reception and legacy evidence</p><h2>The loop people remembered</h2><p>A 2012 MartialTalk recommendation names Japhet as the creator, but because it came from a friend it is useful biographical testimony rather than independent reporting. A 2011 AnandTech mention shows the game travelling by ordinary word of mouth, while a surviving catalogue classifies it as a browser-based science-fiction title published by MineThings; the origin of that catalogue's 7.8 rating is unknown.</p><p>After closure, players still tried to identify or replace it. A 2021 identification thread named MineThings as a remembered browser mining game. Requests in 2021 and 2023 grouped it with loot, scavenging and collection games and remembered its automatic, randomized acquisition and crafting. These recollections show what endured in memory; they are not treated as authoritative records of the original mechanics.</p></section>
    <section id="sources" class="source-notes"><h2>Sources and provenance</h2><ol>
      <li><a href="https://browsermmorpg.com/game-mine-things--335" rel="external noreferrer">BrowserMMORPG listing</a>—listing date, setting and original overview.</li>
      <li><a href="https://almostidle.com/game/minethings" rel="external noreferrer">Almost Idle</a>—persistent mining, towns, vehicles and professions.</li>
      <li><a href="https://arstechnica.com/civis/threads/mine-things-your-browser-based-epic-item-generator-game.1125701/" rel="external noreferrer">Ars Technica OpenForum discussion</a>—contemporary player reception, mechanics, servers, pacing and interface criticism.</li>
      <li><a href="https://forums.f13.net/index.php?topic=22458.msg1288528" rel="external noreferrer">f13 player guide and discussion</a>—player-documented strategy, markets, maps, vehicles and piracy.</li>
      <li><a href="https://uniformlyuninformative.wordpress.com/2010/10/07/minethings-screen-scraper/" rel="external noreferrer">2010 economic-simulation account</a>—player auctions and emergent prices.</li>
      <li><a href="https://en.bitcoin.it/wiki/MineThings" rel="external noreferrer">Bitcoin Wiki record</a>—optional purchases and the March 2011 Bitcoin announcement.</li>
      <li><a href="https://bitcointalk.org/index.php?topic=24930.0%3Bwap" rel="external noreferrer">BitcoinTalk starter-pack discussion</a>—the 1 July 2011 promotion, players and apparent operator participation.</li>
      <li><a href="https://bitcointalk.org/index.php?topic=40042.0" rel="external noreferrer">BitcoinTalk “all-in” announcement</a>—the 29 August 2011 PayPal withdrawal and operator claim of roughly 1,500 active players.</li>
      <li><a href="https://openuserjs.org/?orderBy=updated&amp;orderDir=asc&amp;p=50&amp;version=23.05.13" rel="external noreferrer">OpenUserJS MineThings extensions</a>—transport, radar, gadgets, journey history, chat, layout and message tooling.</li>
      <li><a href="https://openuserjs.org/?limit=bktxxvsgrqlztl&amp;p=192" rel="external noreferrer">OpenUserJS Machine Owners</a>—a 2016 machine-ownership analysis tool.</li>
      <li><a href="https://www.martialtalk.com/threads/mine-things-free-browser-game.104152/" rel="external noreferrer">MartialTalk recommendation</a>—promotional testimony naming Japhet and describing once-daily play.</li>
      <li><a href="https://forums.anandtech.com/threads/new-browser-game.2167073/" rel="external noreferrer">AnandTech mention</a>—a small contemporary word-of-mouth recommendation.</li>
      <li><a href="https://github.com/eru-iluvatar/thud/blob/master/thud.xml" rel="external noreferrer">thud game-catalogue record</a>—browser, science-fiction and publisher classification; rating provenance unknown.</li>
      <li><a href="https://www.reddit.com/r/incremental_games/comments/f1tqlo" rel="external noreferrer">2020 shutdown discussion</a>—technical state, succession attempt and closure.</li>
      <li><a href="https://yyyeeeeeyyy.itch.io/mini-minethings" rel="external noreferrer">Mini MineThings</a>—a community memorial after closure.</li>
      <li><a href="https://www.reddit.com/r/tipofmyjoystick/comments/rbl577" rel="external noreferrer">2021 identification thread</a>—residual recognition after shutdown.</li>
      <li><a href="https://www.reddit.com/r/gamingsuggestions/comments/lbbijg" rel="external noreferrer">2021 similar-games request</a>—later memory of automatic randomized loot and crafting.</li>
      <li><a href="https://www.reddit.com/r/AndroidGaming/comments/10d7hts" rel="external noreferrer">2023 AndroidGaming reminiscence</a>—later classification as a scavenging and item-collection game.</li>
    </ol><p>Public sources were last reviewed on 22 August 2026. Repository evidence means the archived source and SQL material shipped with this restoration. Operator-supplied history is first-hand testimony from gordonstretch and is labelled separately where public records do not corroborate it.</p></section>
  </article>`;
}

function legalPage(seller, paymentConfig) {
  const version = LEGAL_VERSIONS[LEGAL_VERSION];
  const sellerDetails = seller.legalName && seller.legalAddress && seller.legalEmail
    ? `<dl class="legal-identity"><dt>Legal seller</dt><dd>${escapeHtml(seller.legalName)}</dd><dt>Geographic address</dt><dd>${escapeHtml(seller.legalAddress)}</dd><dt>Contact</dt><dd><a href="mailto:${escapeHtml(seller.legalEmail)}">${escapeHtml(seller.legalEmail)}</a></dd></dl>`
    : `<p class="legal-notice"><strong>Real-money checkout is not available.</strong> The operator's legal name, geographic address and contact email have not been configured for publication.</p>`;
  return `<article class="editorial-page legal-page"><header class="page-title"><div><p class="eyebrow">Version ${LEGAL_VERSION}</p><h1>${escapeHtml(version.title)}</h1></div><p>Effective ${escapeHtml(version.effectiveDate)} · governed by the law of England and Wales</p></header>
    <p class="legal-summary">These terms allocate risk as far as the law permits. They do not remove consumer rights or liabilities that cannot lawfully be excluded.</p>
    <section><h2>1. Operator and status</h2><p>MineThings is an unofficial, independently operated restoration presented under the name <strong>${escapeHtml(seller.operatorName)}</strong>. It is not endorsed by or affiliated with the original creator, previous operators, PayPal or any owner of third-party names or artwork. Those rights remain with their respective owners.</p>${sellerDetails}</section>
    <section><h2>2. Accounts and acceptable use</h2><p>You must provide accurate registration information, protect your password and use only accounts you are authorised to control. Do not exploit vulnerabilities, automate abusive traffic, interfere with other miners, launder value, harass people, or transmit unlawful material. Accounts may be restricted or closed where reasonably necessary for security, abuse prevention or operation of the service.</p></section>
    <section><h2>3. Experimental service</h2><p>The restoration is provided on an experimental, as-available basis. Game rules, balancing and availability may change. No promise is made that the service will be uninterrupted, error-free, permanently available, or that game data can always be preserved.</p></section>
    <section><h2>4. Credits and payments</h2><p>Credits are a limited, revocable licence to use designated features inside MineThings. They are not money, stored value, an investment, property transferable outside the game, or redeemable for cash. Prices are shown in GBP inclusive of applicable taxes unless stated otherwise. PayPal processes payment details; MineThings does not receive or store your card number.</p><p>Credits are supplied immediately after PayPal reports a completed capture. Checkout asks for express consent to immediate digital supply and acknowledgement of the effect on the statutory cancellation period. This does not remove rights arising from faulty, misdescribed or undelivered digital content. Refunds and charge reversals remove the corresponding credits; the balance may become negative and credit spending is then disabled until restored.</p><p>Receipts and the accepted terms version remain available in purchase history. Contact the seller before initiating a dispute where practical.</p></section>
    <section><h2>5. Privacy</h2><p>MineThings stores account name, mandatory verified email, a one-way password hash, verification-token hashes and delivery audit data, game activity, security/session information, and—when payments are used—PayPal order and capture identifiers, amount, currency, status, consent and audit entries. Email is used to verify account ownership and deliver essential security messages. PayPal independently processes payment and payer information under its own privacy terms.</p><p>Data is retained while the account or associated legal/audit need continues, then deleted or anonymised when reasonably possible. You may contact the published seller address to request access, correction or deletion, subject to legal and fraud-prevention retention requirements.</p></section>
    <section><h2>6. Liability</h2><p>To the fullest extent permitted by law, the operator is not liable for indirect or consequential loss, lost game progress, lost opportunities, loss caused by user equipment or third-party services, or events outside reasonable control. For loss that may lawfully be limited, aggregate liability is capped at the greater of £100 and the amount you paid to MineThings in the preceding 12 months.</p><p>Nothing excludes or limits liability for death or personal injury caused by negligence, fraud or fraudulent misrepresentation, breach of rights that cannot be excluded under consumer law, or any other liability the law does not permit to be excluded.</p></section>
    <section><h2>7. Changes and disputes</h2><p>New terms apply when accepted at registration or checkout; a receipt records the applicable version. Material changes will be identified by a new version and effective date. Courts in England and Wales have jurisdiction, without depriving consumers of any mandatory right to bring proceedings elsewhere.</p></section>
    <p class="muted">Payment mode: ${escapeHtml(paymentConfig.environment)}. This page is operational information, not legal advice to the operator.</p>
  </article>`;
}

function formatMoneyMinor(amountMinor, currency = 'GBP') {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(Number(amountMinor) / 100);
}

function creditsPage(player, bundles, purchases, readiness, paymentConfig) {
  const unavailable = readiness.ready ? '' : `<p class="legal-notice"><strong>Checkout unavailable.</strong> ${escapeHtml(readiness.missing.join(', '))}.</p>`;
  const bundleCards = bundles.map((bundle) => `<article class="credit-bundle"><p class="eyebrow">${escapeHtml(bundle.name)}</p><strong>${bundle.credits.toLocaleString('en-GB')} credits</strong><span>${escapeHtml(formatMoneyMinor(bundle.amountMinor, bundle.currency))}</span><form method="post" action="/credits/paypal/orders"><input type="hidden" name="bundleId" value="${bundle.id}"><label class="check-row"><input type="checkbox" name="acceptPaymentTerms" value="1" required><span>I accept the <a href="/legal" target="_blank" rel="noopener">payment terms</a> (version ${LEGAL_VERSION}).</span></label><label class="check-row"><input type="checkbox" name="immediateDelivery" value="1" required><span>Supply my credits immediately; I understand this affects my 14-day cancellation right.</span></label><button${readiness.ready ? '' : ' disabled'}>Continue to PayPal</button></form></article>`).join('');
  const history = purchases.map((purchase) => `<tr><td><a href="/credits/receipts/${purchase.id}">MT-${purchase.id}</a></td><td>${new Date(purchase.createdAt).toLocaleString('en-GB')}</td><td>${escapeHtml(purchase.bundleName)}</td><td>${escapeHtml(formatMoneyMinor(purchase.amountMinor, purchase.currency))}</td><td><span class="payment-status payment-${escapeHtml(purchase.status)}">${escapeHtml(purchase.status)}</span></td></tr>`).join('');
  return `<section class="page-title"><div><p class="eyebrow">Optional support</p><h1>Buy credits</h1></div><p>Balance: <strong>${player.credits.toLocaleString('en-GB')} credits</strong> · ${escapeHtml(paymentConfig.environment)} checkout</p></section>${unavailable}<section><h2>Credit bundles</h2><p>PayPal hosts the approval step. MineThings never sees your card details.</p><div class="credit-bundles">${bundleCards}</div></section><section><h2>Purchase history</h2><div class="table-scroll"><table><thead><tr><th>Receipt</th><th>Created</th><th>Bundle</th><th>Paid</th><th>Status</th></tr></thead><tbody>${history || '<tr><td colspan="5">No purchases yet.</td></tr>'}</tbody></table></div></section>`;
}

function receiptPage(purchase) {
  return `<article class="receipt"><header class="page-title"><div><p class="eyebrow">Permanent purchase record</p><h1>Receipt MT-${purchase.id}</h1></div><a class="button secondary" href="/credits/receipts/${purchase.id}.txt">Download receipt</a></header><dl class="receipt-grid"><dt>Miner</dt><dd>${escapeHtml(purchase.playerName)}</dd><dt>Created</dt><dd>${new Date(purchase.createdAt).toLocaleString('en-GB')}</dd><dt>Status</dt><dd>${escapeHtml(purchase.status)}</dd><dt>Bundle</dt><dd>${escapeHtml(purchase.bundleName)}</dd><dt>Credits</dt><dd>${purchase.credits.toLocaleString('en-GB')}</dd><dt>Amount</dt><dd>${escapeHtml(formatMoneyMinor(purchase.amountMinor, purchase.currency))}</dd><dt>PayPal order</dt><dd>${escapeHtml(purchase.providerOrderId || 'Not assigned')}</dd><dt>PayPal capture</dt><dd>${escapeHtml(purchase.providerCaptureId || 'Not captured')}</dd><dt>Terms accepted</dt><dd>Version ${escapeHtml(purchase.termsVersion)} at ${new Date(purchase.consentedAt).toLocaleString('en-GB')}</dd><dt>Seller</dt><dd>${escapeHtml(purchase.sellerName || 'Not configured')}<br>${escapeHtml(purchase.sellerAddress)}<br>${escapeHtml(purchase.sellerEmail)}</dd></dl><p><a href="/legal">Read the current Legal page</a> · <a href="/credits">Back to credit purchases</a></p></article>`;
}

function receiptText(purchase) {
  return `MineThings receipt MT-${purchase.id}\n\nMiner: ${purchase.playerName}\nCreated: ${new Date(purchase.createdAt).toISOString()}\nStatus: ${purchase.status}\nBundle: ${purchase.bundleName}\nCredits: ${purchase.credits}\nAmount: ${(purchase.amountMinor / 100).toFixed(2)} ${purchase.currency}\nPayPal order: ${purchase.providerOrderId || 'Not assigned'}\nPayPal capture: ${purchase.providerCaptureId || 'Not captured'}\nTerms version: ${purchase.termsVersion}\nImmediate delivery consent: ${new Date(purchase.consentedAt).toISOString()}\nSeller: ${purchase.sellerName}\nAddress: ${purchase.sellerAddress}\nContact: ${purchase.sellerEmail}\n`;
}

function verifyCapturedOrder(order, purchase) {
  const summary = paypalOrderSummary(order);
  if (summary.orderId !== purchase.providerOrderId
    || summary.customId !== String(purchase.id)
    || summary.invoiceId !== `MT-${purchase.id}`
    || summary.amountMinor !== purchase.amountMinor
    || summary.currency !== purchase.currency
    || summary.captureStatus !== 'COMPLETED'
    || !summary.captureId) {
    throw new Error('PayPal capture details did not match this credit purchase.');
  }
  return summary;
}

function adminPaymentsPage(bundles, purchases) {
  const bundleRows = bundles.map((bundle) => { const formId = `bundle-${bundle.id}`; return `<tr><td><input form="${formId}" name="name" value="${escapeHtml(bundle.name)}" maxlength="80" required></td><td><input form="${formId}" type="number" name="credits" value="${bundle.credits}" min="1" required></td><td><input form="${formId}" type="number" name="amountMinor" value="${bundle.amountMinor}" min="1" required> pence</td><td><label class="check-row"><input form="${formId}" type="checkbox" name="enabled" value="1"${bundle.enabled ? ' checked' : ''}><span>Enabled</span></label></td><td><form id="${formId}" method="post" action="/admin/credit-bundles/${bundle.id}"><button>Save</button></form></td></tr>`; }).join('');
  const purchaseRows = purchases.map((purchase) => `<tr><td><a href="/admin/players/${purchase.playerId}">${escapeHtml(purchase.playerName)}</a></td><td>MT-${purchase.id}</td><td>${escapeHtml(purchase.bundleName)}</td><td>${escapeHtml(formatMoneyMinor(purchase.amountMinor, purchase.currency))}</td><td>${escapeHtml(purchase.status)}</td><td>${escapeHtml(purchase.providerOrderId || '—')}</td><td>${escapeHtml(purchase.reviewReason || '')}</td></tr>`).join('');
  return `${adminTabs()}<section class="page-title"><div><p class="eyebrow">Payment operations</p><h1>Credits and PayPal</h1></div><p>Bundle changes affect new orders only. Every purchase keeps its original price and credit snapshot.</p></section><section><h2>Bundles</h2><div class="table-scroll"><table class="bundle-admin-table"><thead><tr><th>Name</th><th>Credits</th><th>Price</th><th>State</th><th></th></tr></thead><tbody>${bundleRows}</tbody></table></div></section><section><h2>Recent purchases</h2><div class="table-scroll"><table><thead><tr><th>Miner</th><th>Receipt</th><th>Bundle</th><th>Amount</th><th>Status</th><th>Order</th><th>Review</th></tr></thead><tbody>${purchaseRows || '<tr><td colspan="7">No purchases yet.</td></tr>'}</tbody></table></div></section>`;
}

function helpPage(catalog) {
  const settings = catalog.settings;
  const factorySpecialist = catalogSpecialisationForBonus(catalog, 'factoryThroughput');
  const pilot = catalogSpecialisationForBonus(catalog, 'aircraftSpeed');
  const dwarfRisks = [...new Set(catalog.dwarfTiers.map((entry) => entry.disappearanceChance))];
  const dwarfRisk = dwarfRisks.length === 1
    ? `${formatGold(dwarfRisks[0] * 100)}%` : 'the risk shown for its tier';
  const searchPlane = catalogItemForSetting(catalog, 'search_plane_item_id').name;
  const bomber = catalogItemForSetting(catalog, 'bomber_item_id').name;
  const helicopter = catalogItemForSetting(catalog, 'helicopter_item_id').name;
  const oil = catalogItemForSetting(catalog, 'oil_item_id').name;
  const bombNames = joinedNames(catalog.machines.filter((entry) => entry.rules?.isBomb)
    .map((entry) => catalogItemForId(catalog, entry.itemId, `Oil Field machine ${entry.id}`).name));
  const shield = catalogGadgetForBehavior(catalog, 'shield').displayName;
  const litersPerBarrel = Number(settings.oil_units_per_barrel)
    / Number(settings.oil_units_per_liter);
  const shotDown = Number(settings.aircraft_shot_down_chance);
  const shieldedShotDown = Math.max(0, shotDown - Number(settings.aircraft_shield_offset));
  return `<section class="page-title"><div><img class="legacy-title-image" src="/img/help-page.gif" alt=""><h1>Help</h1></div></section>
    <section class="help-copy"><h2>Mine things</h2><p>Your mines work every ${formatDuration(Number(settings.find_interval_ms))} while you are away. Switch a mine between things and its gold or ore resource.</p>
    <h2>Trade</h2><p>Every thing has a fixed, utility-adjusted base gold value. Local listings and bids use that value automatically, with a ${formatGold((Number(settings.foreign_market_price_multiplier) - 1) * 100)}% premium in cities that do not offer the item’s mine type. Items without a fixed origin use their base value everywhere. Listed things move into city-local market escrow, stop counting toward inventory capacity, and return to that city if canceled.</p>
    <h2>Factories</h2><p>Every miner can build and operate factories in their home city, with at most ${settings.max_active_factories} owner-operated factories active at once and ${settings.factory_max_workers} workers assigned to each. ${escapeHtml(factorySpecialist.name)}-specialised factories produce ${formatGold(Number(factorySpecialist.bonuses.factoryThroughput) * 100)}% more throughput. Built, idle factories can be bought, sold, or listed for a ${formatDuration(Number(settings.factory_rental_duration_ms))} rental. Anyone may rent one, hire workers for it, and use it only to repair damaged things. At expiry, workers are idled and the factory returns to its owner; unfinished repair ore and the damaged thing return to the renter.</p>
    <h2>Travel</h2><p>Activate a vehicle thing, choose a compatible land, sea, or air route, and wait for it to arrive. Arrivals reveal new cities on the map.</p>
    <h2>Weather, moon, creatures, and ghosts</h2><p>Each world receives a new six-hour weather period based on the time-of-year at Cambridge, with storms made deliberately more frequent. Natural creature activity is rolled globally at a random interval between ${formatDuration(Number(settings.world_creature_roll_min_interval_ms))} and ${formatDuration(Number(settings.world_creature_roll_max_interval_ms))}; storms make a Kraken eligible for those rolls. Kraken, Land Whales, White Whales, Orca Pods, Elephant Herds, and T-Rex appear from Yellow through Orange and travel toward the nearest city as live route traffic. Send a land vehicle or ship in the same combat class from either endpoint; combat starts only when they physically meet. White Whales, Orca Pods, Elephant Herds, and T-Rex drop tier-scaled Ore, while Kraken and Land Whales retain treasure bounty. Destroyed land vehicles and sunken ships may rise as Ghost Riders or Ghost Ships. They patrol the route of their death and attack pillagers in their combat class. The lunar phase changes storms, creature activity, combat, treasure, Dwarf captures, and ghost risings. See <a href="/events">World Events</a> for the live effects.</p>
    <h2>Dwarves</h2><p>After a random delay within ${formatDuration(Number(settings.dwarf_find_max_delay_ms))}, each Dwarf stored in a city finds one thing in its configured rarity range, using only that city's mine types. Every Dwarf has ${dwarfRisk} chance to disappear after each find and may stow away on a compatible land or sea journey. Mining can also uncover a captive Dwarf; it immediately joins that city's inventory and begins finding things in the normal Dwarf cycle.</p>
    <h2>Aircraft and the ore thieves</h2><p>Every specialisation can fly ore-thief missions from the city where ore is mined; ${escapeHtml(pilot.name)} flies ${formatGold(Number(pilot.bonuses.aircraftSpeed) * 100)}% faster. ${escapeHtml(searchPlane)} missions take ${formatDuration(Number(settings.aircraft_search_duration_ms))} before speed bonuses. Once the location is known, ${escapeHtml(bomber)} aircraft can attack it, and ${escapeHtml(helicopter)} aircraft recover ore after its destruction.</p><p>Aircraft approaching the base have a ${formatGold(shotDown * 100)}% chance of being shot down, reduced to ${formatGold(shieldedShotDown * 100)}% by an active ${escapeHtml(shield)}. A lost aircraft also loses its cargo. Every ${settings.aircraft_melds_per_slot} melds permits one aircraft in flight at a time.</p>
    <h2>Oil Field</h2><p>Every miner can operate the field. ${escapeHtml(helicopter)} aircraft deploy machines on the outer field, ${escapeHtml(searchPlane)} aircraft reveal other miners’ oil, and ${escapeHtml(bomber)} aircraft attack occupied hexes with ${escapeHtml(bombNames)} bombs. ${escapeHtml(pilot.name)}-specialised deployments last ${formatGold(Number(pilot.bonuses.oilMachineLife) * 100)}% longer. Pumps, power networks, pipes, and pads turn ${formatGold(litersPerBarrel)} litres into each ${escapeHtml(oil)} barrel.</p></section>`;
}

export function createApp(options = {}) {
  const ownsStore = !options.store;
  const store = options.store ?? new SqliteStore(options.databaseFile ?? path.join(ROOT, 'data', 'minethings.sqlite'), {
    legacyJsonFile: options.legacyJsonFile ?? path.join(ROOT, 'data', 'players.json')
  });
  let initialCatalog = options.catalog;
  if (!initialCatalog) {
    initialCatalog = store.loadCatalog();
    if (!initialCatalog) {
      store.seedCatalog(loadLegacyCatalog(options.sqlPath));
      initialCatalog = store.loadCatalog();
    }
  }
  if (!options.catalog) {
    store.ensureWorldMaps();
    initialCatalog = store.loadCatalog();
  }
  if (!initialCatalog) throw new Error('The live database does not contain a game catalog.');
  const production = options.production ?? process.env.NODE_ENV === 'production';
  const secureCookies = options.secureCookies ?? production;
  const paymentConfig = paypalConfiguration(options.paypal ?? {});
  const seller = sellerConfiguration(options.seller ?? {});
  const paymentReadiness = paypalReadiness(paymentConfig, seller);
  const paypalClient = options.paypalClient ?? new PayPalClient(paymentConfig);
  const emailConfig = emailConfiguration(options.email ?? {});
  const emailStatus = emailReadiness(emailConfig, production);
  if (production && !options.emailClient && !emailStatus.ready) {
    throw new Error(`Mandatory email verification is not configured: ${emailStatus.missing.join(', ')}.`);
  }
  const emailClient = options.emailClient ?? (emailStatus.ready ? new EmailClient(emailConfig) : null);
  const configuredAdministrators = options.adminNames ?? process.env.MINETHINGS_ADMINS ?? '';
  for (const name of String(configuredAdministrators).split(',').map((entry) => entry.trim()).filter(Boolean)) {
    store.database.prepare('UPDATE players SET authority = MAX(authority, 5) WHERE name = ? COLLATE NOCASE')
      .run(name);
  }
  const now = options.now ?? Date.now;
  const random = options.random ?? Math.random;
  const previewBindings = new PreviewBindingRegistry({ now });
  store.expireMessages(now());
  const sessions = new Map();
  const previewKey = (kind, vehicleId) => `${kind}:${vehicleId}`;
  const rememberedPreview = (session, kind, vehicleId) => {
    const key = previewKey(kind, vehicleId);
    const record = session?.loadoutPreviews?.get(key) ?? null;
    if (record?.expiresAt <= now()) {
      session.loadoutPreviews.delete(key);
      return null;
    }
    return record;
  };
  const rememberPreview = (sessionId, session, playerId, vehicleId, kind,
    selections, preview) => {
    if (!session) throw new Error('Your session has expired. Sign in and preview this loadout again.');
    session.loadoutPreviews ??= new Map();
    const issued = preview.valid ? previewBindings.issue({
      subject: sessionId, playerId, resourceId: vehicleId, kind, selections
    }) : { token: '', issuedAt: now(), expiresAt: now() + 15 * 60 * 1000 };
    const record = { preview, selections, token: issued.token, expiresAt: issued.expiresAt };
    session.loadoutPreviews.set(previewKey(kind, vehicleId), record);
    return record;
  };
  const consumePreview = (sessionId, session, playerId, vehicleId, kind,
    selections, token) => {
    session?.loadoutPreviews?.delete(previewKey(kind, vehicleId));
    return previewBindings.consume(String(token ?? ''), {
      subject: sessionId, playerId, resourceId: vehicleId, kind, selections
    });
  };
  const requestedMaintenanceIntervalMs = Number(options.maintenanceIntervalMs ?? 5000);
  const maintenanceIntervalMs = Number.isFinite(requestedMaintenanceIntervalMs)
    ? Math.max(1000, Math.min(60000, Math.round(requestedMaintenanceIntervalMs))) : 5000;
  const requestTimeoutMs = Math.max(5000, Math.min(120000,
    Math.round(Number(options.requestTimeoutMs ?? 15000)) || 15000));
  const headersTimeoutMs = Math.max(5000, Math.min(requestTimeoutMs,
    Math.round(Number(options.headersTimeoutMs ?? 10000)) || 10000));
  const keepAliveTimeoutMs = Math.max(1000, Math.min(headersTimeoutMs - 1000,
    Math.round(Number(options.keepAliveTimeoutMs ?? 5000)) || 5000));
  const authFailureLimit = Math.max(2, Math.min(100,
    Math.round(Number(options.authFailureLimit ?? 10)) || 10));
  const authFailureWindowMs = Math.max(60000, Math.min(24 * 60 * 60 * 1000,
    Math.round(Number(options.authFailureWindowMs ?? 5 * 60 * 1000)) || 5 * 60 * 1000));
  const authFailures = new Map();
  const authKey = (request) => request.socket.remoteAddress ?? 'unknown';
  const recentAuthFailures = (request, currentTime) => {
    const key = authKey(request);
    const recent = (authFailures.get(key) ?? [])
      .filter((attemptedAt) => attemptedAt > currentTime - authFailureWindowMs);
    if (recent.length) authFailures.set(key, recent);
    else authFailures.delete(key);
    return recent;
  };
  const recordAuthFailure = (request, currentTime) => {
    const key = authKey(request);
    authFailures.set(key, [...recentAuthFailures(request, currentTime), currentTime]);
    if (authFailures.size > 10000) authFailures.delete(authFailures.keys().next().value);
  };
  const sendEmailVerification = async (playerId, request, session, issuedAt = now()) => {
    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const verification = store.issueEmailVerification(playerId, tokenHash, issuedAt);
    const requestOrigin = `${secureCookies ? 'https' : 'http'}://${request.headers.host ?? '127.0.0.1'}`;
    const origin = emailConfig.publicOrigin || requestOrigin;
    const verificationUrl = `${origin}/verify-email?token=${encodeURIComponent(token)}`;
    try {
      if (emailClient) {
        await emailClient.sendVerification({
          email: verification.email,
          minerName: verification.minerName,
          verificationUrl,
          expiresIn: formatDuration(verification.expiresAt - issuedAt)
        });
      } else if (!production && session) {
        session.developmentVerificationUrl = `/verify-email?token=${encodeURIComponent(token)}`;
      } else {
        throw new Error('Email delivery is not configured.');
      }
      store.recordEmailVerificationDelivery(verification.id, '', issuedAt);
      return verification;
    } catch (error) {
      store.recordEmailVerificationDelivery(verification.id, error.message, issuedAt);
      throw new Error('The verification email could not be sent. Check the address or try again later.');
    }
  };
  const backgroundMaintenanceEnabled = options.backgroundMaintenance ?? (
    ownsStore && !options.now && !options.random && store.filename !== ':memory:'
  );
  let maintenanceWorker = null;
  let maintenanceTimer = null;
  let maintenanceRunning = false;
  let maintenanceBusy = false;
  let wakeLiveUpdates = () => {};

  const startBackgroundMaintenance = () => {
    if (!backgroundMaintenanceEnabled || maintenanceRunning
      || typeof store.filename !== 'string' || store.filename === ':memory:') return;
    // Pay any historical catch-up cost before accepting traffic. Subsequent ticks
    // run on another thread and Oil Field GETs consume a read-only projection.
    store.settleFactories(now());
    store.settleOilField(now());
    store.settleWorldEvents(now());
    maintenanceWorker = new Worker(new URL('./maintenance-worker.js', import.meta.url), {
      workerData: { databaseFile: store.filename, busyTimeoutMs: 250 },
      execArgv: process.execArgv.filter((argument) => !argument.startsWith('--input-type'))
    });
    maintenanceRunning = true;
    maintenanceWorker.unref();
    const requestMaintenance = () => {
      if (!maintenanceRunning || maintenanceBusy) return;
      maintenanceBusy = true;
      maintenanceWorker.postMessage({ type: 'tick', now: now() });
    };
    maintenanceWorker.on('message', (message) => {
      if (message?.type === 'tick-complete' || message?.type === 'tick-error') {
        maintenanceBusy = false;
      }
      if (message?.type === 'tick-complete') wakeLiveUpdates();
      if (message?.type === 'tick-error'
        && !['SQLITE_BUSY', 'SQLITE_BUSY_TIMEOUT'].includes(message.error?.code)) {
        console.error(`Background maintenance failed: ${message.error?.message ?? 'unknown error'}`);
      }
    });
    maintenanceWorker.on('error', (error) => {
      maintenanceBusy = false;
      maintenanceRunning = false;
      console.error(`Background maintenance worker failed: ${error.message}`);
    });
    maintenanceWorker.on('exit', () => {
      maintenanceBusy = false;
      maintenanceRunning = false;
    });
    maintenanceTimer = setInterval(requestMaintenance, maintenanceIntervalMs);
    maintenanceTimer.unref();
    requestMaintenance();
  };

  const liveClients = new Set();
  let liveCursor = store.latestLiveUpdateId();
  const requestedLiveDebounceMs = Number(options.liveUpdateDebounceMs ?? 15);
  const liveDebounceMs = Number.isFinite(requestedLiveDebounceMs)
    ? Math.max(0, Math.min(250, Math.round(requestedLiveDebounceMs))) : 15;
  const allowedLiveTopics = new Set([
    'catalog', 'market', 'factories', 'chat', 'oil', 'vehicles', 'world',
    'payments', 'messages', 'players', 'stats', 'all'
  ]);
  let liveWakeTimer = null;
  let liveDrainRunning = false;
  let liveDrainAgain = false;
  let livePrunedAt = liveCursor;
  let liveDatabaseWatcher = null;
  let unsubscribeLiveWake = () => {};
  let liveUpdatesClosed = false;
  const sendLiveEvent = (client, event, payload) => {
    if (client.response.destroyed || client.response.writableEnded) {
      liveClients.delete(client);
      return;
    }
    try {
      client.response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
    } catch {
      liveClients.delete(client);
    }
  };
  const relevantLiveScopes = (client, events) => [...new Set(events
    .map((entry) => entry.scope)
    .filter((scope) => client.all || client.scopes.has(scope)))];
  const scheduleLiveDrain = (delay = liveDebounceMs) => {
    if (liveUpdatesClosed) return;
    if (liveDrainRunning) {
      liveDrainAgain = true;
      return;
    }
    if (liveWakeTimer) return;
    liveWakeTimer = setTimeout(drainLiveUpdates, Math.max(0, delay));
    liveWakeTimer.unref();
  };
  const drainLiveUpdates = () => {
    liveWakeTimer = null;
    if (liveDrainRunning) {
      liveDrainAgain = true;
      return;
    }
    liveDrainRunning = true;
    try {
      let events;
      do {
        events = store.liveUpdatesAfter(liveCursor);
        if (!events.length) break;
        liveCursor = events.at(-1).id;
        for (const client of liveClients) {
          const scopes = relevantLiveScopes(client, events);
          if (scopes.length) sendLiveEvent(client, 'change', { revision: liveCursor, scopes });
        }
      } while (events.length >= 2000);
      if (liveCursor > 10000 && liveCursor - livePrunedAt >= 1000) {
        store.pruneLiveUpdates(liveCursor - 10000);
        livePrunedAt = liveCursor;
      }
    } catch (error) {
      if (['SQLITE_BUSY', 'SQLITE_BUSY_TIMEOUT'].includes(error?.code)) liveDrainAgain = true;
      else console.error(`Live update dispatch failed: ${error.message}`);
    } finally {
      liveDrainRunning = false;
      if (liveDrainAgain) {
        liveDrainAgain = false;
        scheduleLiveDrain(50);
      }
    }
  };
  wakeLiveUpdates = scheduleLiveDrain;
  unsubscribeLiveWake = store.onLiveUpdateWake(scheduleLiveDrain);
  if (typeof store.filename === 'string' && store.filename !== ':memory:') {
    const databaseFile = path.resolve(store.filename);
    const databaseDirectory = path.dirname(databaseFile);
    const databaseName = path.basename(databaseFile);
    // The WAL and main file record durable changes. Do not watch -shm: readers
    // may touch its transient coordination state and wake themselves in a loop.
    const watchedNames = new Set([databaseName, `${databaseName}-wal`]);
    try {
      liveDatabaseWatcher = fs.watch(databaseDirectory, { persistent: false }, (_event, filename) => {
        if (filename === null || watchedNames.has(path.basename(String(filename)))) {
          scheduleLiveDrain();
        }
      });
      liveDatabaseWatcher.on('error', (error) => {
        console.error(`SQLite live-update file watch failed: ${error.message}`);
      });
    } catch (error) {
      console.error(`Could not watch SQLite live-update files: ${error.message}`);
    }
  }
  // Close the tiny startup gap between taking the cursor and installing both wake sources.
  scheduleLiveDrain(0);
  const liveHeartbeatTimer = setInterval(() => {
    for (const client of liveClients) {
      if (client.response.destroyed || client.response.writableEnded) liveClients.delete(client);
      else client.response.write(': keep-alive\n\n');
    }
  }, 20000);
  liveHeartbeatTimer.unref();

  const openLiveUpdates = (request, response, session, url) => {
    if (!session || !store.hasPlayer(session.playerId) || !store.isEmailVerified(session.playerId)) {
      response.writeHead(401, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Sign in required');
      return;
    }
    const requestedTopics = String(url.searchParams.get('topics') ?? '')
      .split(',').map((topic) => topic.trim()).filter((topic) => allowedLiveTopics.has(topic));
    const player = store.database.prepare('SELECT authority FROM players WHERE id = ?')
      .get(session.playerId);
    const client = {
      response,
      scopes: new Set([`player:${session.playerId}`,
        ...requestedTopics.map((topic) => `topic:${topic}`)]),
      all: requestedTopics.includes('all') && player?.authority > 0
    };
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    response.write('retry: 2000\n\n');
    const since = Math.max(0, Number(url.searchParams.get('since')) || 0);
    liveClients.add(client);
    const missed = store.liveUpdatesAfter(since, 10000);
    const missedScopes = relevantLiveScopes(client, missed);
    if (missedScopes.length) {
      sendLiveEvent(client, 'change', {
        revision: missed.at(-1).id, scopes: missedScopes
      });
    } else {
      sendLiveEvent(client, 'ready', { revision: store.latestLiveUpdateId() });
    }
    const remove = () => liveClients.delete(client);
    request.once('close', remove);
    response.once('close', remove);
  };

  const applyPayPalWebhook = (event, payloadHash) => {
    const type = String(event?.event_type ?? '');
    const resource = event?.resource ?? {};
    const related = resource.supplementary_data?.related_ids ?? {};
    const orderId = related.order_id ?? (type.startsWith('CHECKOUT.ORDER.') ? resource.id : '');
    const captureId = related.capture_id
      ?? (type.startsWith('PAYMENT.CAPTURE.') && type !== 'PAYMENT.CAPTURE.REFUNDED'
        ? resource.id : '');
    let purchase = orderId ? store.creditPurchaseByOrder(orderId) : null;
    if (!purchase && captureId) purchase = store.creditPurchaseByCapture(captureId);
    let outcome = 'ignored';
    if (type === 'PAYMENT.CAPTURE.COMPLETED') {
      if (!purchase) throw new Error('Completed PayPal capture has no matching purchase.');
      const amountMinor = Math.round(Number(resource.amount?.value) * 100);
      if (amountMinor !== purchase.amountMinor || resource.amount?.currency_code !== purchase.currency) {
        store.setCreditPurchaseStatus(purchase.id, 'review', now(), 'Webhook amount or currency mismatch.');
        outcome = 'review';
      } else {
        store.completeCreditPurchase(purchase.id, resource.id, now());
        outcome = 'completed';
      }
    } else if (type === 'PAYMENT.CAPTURE.REFUNDED' || type === 'PAYMENT.CAPTURE.REVERSED') {
      if (!purchase) throw new Error('PayPal reversal has no matching purchase.');
      const amountMinor = Math.round(Number(resource.amount?.value) * 100);
      if (amountMinor !== purchase.amountMinor || resource.amount?.currency_code !== purchase.currency) {
        store.setCreditPurchaseStatus(purchase.id, 'review', now(), 'Partial or mismatched PayPal reversal.');
        outcome = 'review';
      } else {
        store.reverseCreditPurchase(purchase.id,
          type.endsWith('REFUNDED') ? 'refund' : 'reversal', now());
        outcome = type.endsWith('REFUNDED') ? 'refunded' : 'reversed';
      }
    } else if (purchase && type === 'CHECKOUT.ORDER.APPROVED') {
      store.setCreditPurchaseStatus(purchase.id, 'approved', now());
      outcome = 'approved';
    } else if (purchase && type === 'PAYMENT.CAPTURE.PENDING') {
      store.setCreditPurchaseStatus(purchase.id, 'pending', now());
      outcome = 'pending';
    } else if (purchase && type === 'PAYMENT.CAPTURE.DENIED') {
      store.setCreditPurchaseStatus(purchase.id, 'denied', now());
      outcome = 'denied';
    }
    const inserted = store.recordPaymentWebhook(event.id, type, payloadHash,
      purchase?.id ?? null, outcome, now());
    return { duplicate: !inserted, outcome };
  };

  const server = http.createServer(async (request, response) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
      response.setHeader(name, value);
    }
    response.setHeader('Cache-Control', 'no-store');
    let url;
    try {
      url = new URL(request.url, 'http://localhost');
    } catch {
      response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Bad request');
      return;
    }
    if (request.method === 'POST' && url.pathname === '/webhooks/paypal') {
      try {
        const { raw, value: event } = await readJson(request);
        const verified = await paypalClient.verifyWebhook(request.headers, event);
        if (!verified) {
          responseJson(response, 400, { accepted: false });
          return;
        }
        const result = applyPayPalWebhook(event,
          crypto.createHash('sha256').update(raw).digest('hex'));
        responseJson(response, 200, { accepted: true, ...result });
      } catch (error) {
        responseJson(response, error instanceof SyntaxError ? 400 : 500,
          { accepted: false, error: error.message });
      }
      return;
    }
    if (request.method === 'POST' && request.headers['sec-fetch-site'] === 'cross-site') {
      responseHtml(response, 403, layout('Request blocked',
        '<section class="error"><h1>Request blocked</h1><p>Return to MineThings and try that action again.</p></section>',
        null));
      return;
    }
    if (url.pathname.startsWith('/legacy/')) {
      if (!staticFile(request, response, LEGACY_ROOT, url.pathname.slice('/legacy'.length))) response.writeHead(404).end('Not found');
      return;
    }
    if (url.pathname.startsWith('/css/img/')) {
      if (!staticFile(request, response, LEGACY_ROOT, url.pathname.slice('/css'.length))) response.writeHead(404).end('Not found');
      return;
    }
    if (/^\/(img|css|js)\//.test(url.pathname)) {
      if (!staticFile(request, response, LEGACY_ROOT, url.pathname)) response.writeHead(404).end('Not found');
      return;
    }
    if (url.pathname.startsWith('/app/webroot/')) {
      if (!staticFile(request, response, LEGACY_ROOT, url.pathname.slice('/app/webroot'.length))) response.writeHead(404).end('Not found');
      return;
    }
    if (url.pathname.startsWith('/app/img/')) {
      if (!staticFile(request, response, LEGACY_ROOT, url.pathname.slice('/app'.length))) response.writeHead(404).end('Not found');
      return;
    }
    if (url.pathname === '/node/finding-queue.js') {
      if (!staticFile(request, response, PUBLIC_ROOT, '/finding-queue.js', 'no-store')) response.writeHead(404).end('Not found');
      return;
    }
    if (url.pathname === '/node/live-updates.js') {
      if (!staticFile(request, response, PUBLIC_ROOT, '/live-updates.js', 'no-store')) response.writeHead(404).end('Not found');
      return;
    }
    if (url.pathname === '/node/flash-modal.js') {
      if (!staticFile(request, response, PUBLIC_ROOT, '/flash-modal.js', 'no-store')) response.writeHead(404).end('Not found');
      return;
    }
    if (url.pathname === '/node/meld-modal.js') {
      if (!staticFile(request, response, PUBLIC_ROOT, '/meld-modal.js', 'no-store')) response.writeHead(404).end('Not found');
      return;
    }
    if (url.pathname === '/node/auto-recycle.js') {
      if (!staticFile(request, response, PUBLIC_ROOT, '/auto-recycle.js', 'no-store')) response.writeHead(404).end('Not found');
      return;
    }
    if (url.pathname === '/node/map.js') {
      if (!staticFile(request, response, PUBLIC_ROOT, '/map.js', 'no-store')) response.writeHead(404).end('Not found');
      return;
    }
    if (url.pathname === '/node/map-background.png') {
      if (!staticFile(request, response, PUBLIC_ROOT, '/img/map-background.png')) response.writeHead(404).end('Not found');
      return;
    }
    if (url.pathname === '/node/landing-rebirth.jpg') {
      if (!staticFile(request, response, PUBLIC_ROOT, '/img/landing-rebirth.jpg')) response.writeHead(404).end('Not found');
      return;
    }
    if (/^\/node\/dwarf-images\/dwarf-\d+\.png$/.test(url.pathname)) {
      const relativePath = url.pathname.replace('/node/dwarf-images', '/img/items/dwarves');
      if (!staticFile(request, response, PUBLIC_ROOT, relativePath)) response.writeHead(404).end('Not found');
      return;
    }
    if (url.pathname === '/node/oil-field.js') {
      if (!staticFile(request, response, PUBLIC_ROOT, '/oil-field.js', 'no-store')) response.writeHead(404).end('Not found');
      return;
    }
    const machineIconMatch = /^\/node\/machine-icons\/(.+)-(\d+)\.svg$/.exec(url.pathname);
    if (request.method === 'GET' && machineIconMatch) {
      const iconCatalog = options.catalog ?? store.loadCatalog();
      const type = decodeURIComponent(machineIconMatch[1]);
      const machineType = iconCatalog?.machineTypes.find((entry) => entry.behaviorKey === type);
      const svg = machineType ? machineIconSvg(
        machineType.behaviorKey, Number(machineIconMatch[2]),
        iconCatalog.settings.rarity_color_hexes, machineType.name
      ) : null;
      if (!svg) {
        response.writeHead(404).end('Not found');
      } else {
        response.writeHead(200, {
          'Content-Type': 'image/svg+xml; charset=utf-8',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff'
        }).end(svg);
      }
      return;
    }
    if (url.pathname === '/app.css') {
      if (!staticFile(request, response, PUBLIC_ROOT, '/app.css')) response.writeHead(404).end('Not found');
      return;
    }

    const sessionId = cookies(request).mt_session;
    const session = sessions.get(sessionId);
    if (request.method === 'GET' && url.pathname === '/api/live-updates') {
      openLiveUpdates(request, response, session, url);
      return;
    }
    const liveFragment = request.method === 'GET'
      && request.headers['x-minethings-live-update'] === '1';
    const findingPoll = request.method === 'GET' && url.pathname === '/api/findings';
    const findingAcknowledgement = request.method === 'POST'
      && url.pathname === '/api/findings/ack';
    if (findingPoll || findingAcknowledgement) {
      if (!session) {
        redirect(response, '/');
        return;
      }
      try {
        // Finding polls run continuously in every authenticated tab. Validate
        // only the session subject here; do not hydrate their entire game state
        // or consume page notices that this JSON response cannot display.
        if (!store.hasPlayer(session.playerId) || !store.isEmailVerified(session.playerId)) {
          redirect(response, '/');
          return;
        }
        if (findingPoll) {
          const delivery = store.leaseFindings(
            session.playerId, url.searchParams.get('lease') ?? '', now()
          );
          if (delivery.state !== 'ready') {
            responseJson(response, 200, delivery);
            return;
          }
          const findingCatalog = options.catalog ?? store.loadCatalog();
          if (!findingCatalog) {
            responseHtml(response, 503, layout('Catalog unavailable',
              '<section class="error"><h1>Catalog unavailable</h1><p>The live database does not contain a game catalog.</p></section>',
              null));
            return;
          }
          responseJson(response, 200, {
            ...delivery, html: findingQueueHtml(delivery.findings, findingCatalog)
          });
          return;
        }
        const form = await readForm(request);
        const acknowledged = store.acknowledgeFindings(session.playerId, form.token);
        responseJson(response, 200, { acknowledged });
      } catch (error) {
        const destination = requestDestination(request);
        if (request.method === 'GET' && destination === url.pathname) {
          responseRequestError(response, error);
        } else {
          session.flash = error.message;
          redirect(response, destination);
        }
      }
      return;
    }

    // loadCatalog returns the current versioned snapshot. The store reuses it
    // until either this connection or another SQLite connection changes catalog data.
    const catalog = options.catalog ?? store.loadCatalog();
    if (!catalog) {
      responseHtml(response, 503, layout('Catalog unavailable',
        '<section class="error"><h1>Catalog unavailable</h1><p>The live database does not contain a game catalog.</p></section>',
        null));
      return;
    }

    if (session && store.isEmailVerified(session.playerId)
      && request.method === 'POST' && /^\/mines\/\d+\/detonate$/.test(url.pathname)) {
      const mineId = Number(url.pathname.split('/')[2]);
      try {
        const form = await readForm(request);
        store.detonateMine(
          session.playerId, mineId, Number(form.itemId), Number(form.count), catalog, now(), random
        );
        redirect(response, `/mines/${mineId}/equipment?detonated=1`);
      } catch (error) {
        session.flash = error.message;
        const destination = requestDestination(request);
        redirect(response, destination);
      }
      return;
    }
    let player;
    let flash;
    try {
      if (session && !maintenanceRunning) {
        store.runBumUpdate(now(), random);
        store.runDwarfUpdate(now(), random);
        store.settleFactories(now());
        store.expireMessages(now());
      }
      player = session
        ? store.playerById(session.playerId, now(), { settle: !liveFragment }) : null;
      if (player?.suspended) {
        if (sessionId) previewBindings.revokeSubject(sessionId);
        sessions.delete(sessionId);
        player = null;
      }
      if (player) {
        player.currentPath = url.pathname;
        player.cityName = catalogCityForId(catalog, player.cityId).name;
        player.batteryRemaining = Math.max(0, player.batteryExpiresAt - now());
        player.findingPollMinIntervalMs =
          positiveCatalogInteger(catalog, 'finding_poll_min_interval_ms');
        player.findingPollEmptyIntervalMs =
          positiveCatalogInteger(catalog, 'finding_poll_empty_interval_ms');
        player.findingPollMaxIntervalMs =
          positiveCatalogInteger(catalog, 'finding_poll_max_interval_ms');
        player.liveUpdateRevision = () => store.latestLiveUpdateId();
      }
      flash = liveFragment ? undefined : session?.flash;
      if (session && !liveFragment) {
        delete session.flash;
        if (player) {
          player.quietNotice = session.quietNotice;
          player.meldReveal = session.meldReveal;
        }
        delete session.quietNotice;
        delete session.meldReveal;
      }
    } catch (error) {
      const destination = requestDestination(request);
      if (request.method === 'GET' && destination === url.pathname) {
        responseRequestError(response, error);
      } else if (session) {
        session.flash = error.message;
        redirect(response, destination);
      } else {
        responseHtml(response, 400, layout('Try again', `<section class="error"><h1>Could not do that</h1><p>${escapeHtml(error.message)}</p><a href="/">Try again</a></section>`, null));
      }
      return;
    }
    const verificationPaths = new Set([
      '/verify-email', '/verify-email/resend', '/verify-email/email',
      '/verify-email/confirm', '/logout', '/legal', '/history', '/health'
    ]);
    if (player && !player.emailVerified && !verificationPaths.has(url.pathname)) {
      redirect(response, '/verify-email');
      return;
    }
    const setFlash = (message) => { if (session) session.flash = message; };
    const setQuietNotice = (message) => { if (session) session.quietNotice = message; };
    const setMeldReveal = (melds) => {
      if (session && melds.length) session.meldReveal = meldRevealPayload(melds, catalog);
    };
    const requirePlayer = () => {
      if (player) return true;
      redirect(response, '/');
      return false;
    };
    const requireAdmin = () => {
      if (player?.authority > 0) return true;
      responseHtml(response, 404, layout('Not found', '<section class="page-title"><h1>That tunnel goes nowhere.</h1><a href="/">Return home</a></section>', player));
      return false;
    };

    try {
      if (request.method === 'GET' && url.pathname === '/health') {
        response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ status: 'ok', items: catalog.items.length, players: store.countPlayers() }));
      } else if (request.method === 'GET' && url.pathname === '/history') {
        responseHtml(response, 200, layout('History', historyPage(), player, flash));
      } else if (request.method === 'GET' && url.pathname === '/legal') {
        responseHtml(response, 200, layout('Legal', legalPage(seller, paymentConfig), player, flash));
      } else if (request.method === 'GET' && url.pathname === '/verify-email') {
        const token = String(url.searchParams.get('token') ?? '');
        if (token) {
          const tokenHash = /^[A-Za-z0-9_-]{40,128}$/u.test(token)
            ? crypto.createHash('sha256').update(token).digest('hex') : '';
          const verification = tokenHash ? store.previewEmailVerification(tokenHash, now()) : null;
          responseHtml(response, verification ? 200 : 400, layout(
            verification ? 'Confirm email' : 'Link unavailable',
            emailConfirmationPage(verification, token), null
          ));
        } else if (!player) {
          redirect(response, '/');
        } else if (player.emailVerified) {
          redirect(response, '/');
        } else {
          responseHtml(response, 200, layout('Verify email', emailVerificationPage(
            player, store.emailVerificationStatus(player.id, now()),
            session?.developmentVerificationUrl ?? '', now()
          ), null, flash));
        }
      } else if (request.method === 'POST' && url.pathname === '/verify-email/confirm') {
        const form = await readForm(request);
        const token = String(form.token ?? '');
        const tokenHash = /^[A-Za-z0-9_-]{40,128}$/u.test(token)
          ? crypto.createHash('sha256').update(token).digest('hex') : '';
        let verification;
        try {
          verification = store.verifyEmailToken(tokenHash, now());
        } catch {
          responseHtml(response, 400, layout('Link unavailable',
            emailConfirmationPage(null, ''), null));
          return;
        }
        if (session?.playerId === verification.playerId) {
          delete session.developmentVerificationUrl;
          session.flash = `Email verified. Your starter mine and ${catalog.settings.starter_find_count} discoveries are ready.`;
          redirect(response, '/');
        } else {
          responseHtml(response, 200, layout('Email verified',
            emailVerifiedPage(verification.minerName), null));
        }
      } else if (request.method === 'POST' && url.pathname === '/verify-email/resend') {
        if (!player || player.emailVerified) {
          redirect(response, '/');
          return;
        }
        try {
          await sendEmailVerification(player.id, request, session, now());
          session.flash = 'A new verification email has been sent.';
        } catch (error) {
          session.flash = error.message;
        }
        redirect(response, '/verify-email');
      } else if (request.method === 'POST' && url.pathname === '/verify-email/email') {
        if (!player || player.emailVerified) {
          redirect(response, '/');
          return;
        }
        const form = await readForm(request);
        if (!await verifyPasswordAsync(form.password, player.passwordHash)) {
          session.flash = 'The current password is incorrect.';
          redirect(response, '/verify-email');
          return;
        }
        try {
          store.changePlayerEmail(player.id, form.email, now());
          delete session.developmentVerificationUrl;
          await sendEmailVerification(player.id, request, session, now());
          session.flash = 'Email updated. A verification message has been sent.';
        } catch (error) {
          session.flash = error.message;
        }
        redirect(response, '/verify-email');
      } else if (request.method === 'GET' && url.pathname === '/') {
        if (player) {
          let battery = { expiresAt: player.batteryExpiresAt };
          if (!liveFragment) {
            if (expireRentalMines(player, now())) store.savePlayer(player);
            battery = store.rechargeBattery(player.id, now());
            player = store.playerById(player.id, now());
          }
          player.currentPath = url.pathname;
          player.cityName = catalogCityForId(catalog, player.cityId).name;
          player.batteryRemaining = Math.max(0, battery.expiresAt - now());
          player.findingPollMinIntervalMs =
            positiveCatalogInteger(catalog, 'finding_poll_min_interval_ms');
          player.findingPollEmptyIntervalMs =
            positiveCatalogInteger(catalog, 'finding_poll_empty_interval_ms');
          player.findingPollMaxIntervalMs =
            positiveCatalogInteger(catalog, 'finding_poll_max_interval_ms');
          player.liveUpdateRevision = () => store.latestLiveUpdateId();
        }
        responseHtml(response, 200, layout('Home', player
          ? dashboardPage(player, catalog, now()) : landingPage(catalog), player, flash));
      } else if (request.method === 'POST' && url.pathname === '/register') {
        const form = await readForm(request);
        if (form.acceptTerms !== '1') throw new Error('You must accept the Terms and Privacy Notice to register.');
        const name = normalizeMinerName(form.name);
        const email = String(form.email ?? '').trim().toLowerCase();
        const nameMinimum = Number(catalog.settings.miner_name_min_length);
        const nameMaximum = Number(catalog.settings.miner_name_max_length);
        const nameLength = [...name].length;
        if (!/^[\p{L}\p{M}\p{N}\p{P}\p{S} ]+$/u.test(name)
          || nameLength < nameMinimum || nameLength > nameMaximum) {
          throw new Error(`Miner names must be ${nameMinimum}–${nameMaximum} visible Unicode characters. Control, formatting, and unusual whitespace characters are not allowed.`);
        }
        const passwordMinimum = Number(catalog.settings.password_min_length);
        if (String(form.password ?? '').length < passwordMinimum) {
          throw new Error(`Passwords must contain at least ${passwordMinimum} characters.`);
        }
        if (store.findPlayer(name, now())) throw new Error('That miner name is already taken.');
        if (store.emailInUse(email)) throw new Error('That email address is already used by another miner.');
        const registeredAt = now();
        const saved = store.addPlayer(createPlayer(
          name, email, await hashPasswordAsync(form.password), catalog, registeredAt, random
        ), { version: LEGAL_VERSION, acceptedAt: registeredAt });
        const id = crypto.randomBytes(32).toString('base64url');
        const newSession = { playerId: saved.id, flash: 'Check your email to unlock this miner.' };
        sessions.set(id, newSession);
        try {
          await sendEmailVerification(saved.id, request, newSession, registeredAt);
        } catch (error) {
          newSession.flash = error.message;
        }
        redirect(response, '/verify-email', sessionCookie(id, catalog, secureCookies));
      } else if (request.method === 'POST' && url.pathname === '/login') {
        const form = await readForm(request);
        const attemptedAt = now();
        if (recentAuthFailures(request, attemptedAt).length >= authFailureLimit) {
          const error = new Error('Too many failed sign-in attempts. Wait a few minutes and try again.');
          error.statusCode = 429;
          throw error;
        }
        const found = store.findPlayer(normalizeMinerName(form.name), now());
        if (!found || !await verifyPasswordAsync(form.password, found.passwordHash)) {
          recordAuthFailure(request, attemptedAt);
          throw new Error('The miner name or password is incorrect.');
        }
        if (found.suspended) throw new Error('This miner account is suspended.');
        authFailures.delete(authKey(request));
        const id = crypto.randomBytes(32).toString('base64url');
        sessions.set(id, { playerId: found.id });
        redirect(response, found.emailVerified ? '/' : '/verify-email',
          sessionCookie(id, catalog, secureCookies));
      } else if (request.method === 'POST' && url.pathname === '/logout') {
        if (sessionId) previewBindings.revokeSubject(sessionId);
        sessions.delete(sessionId);
        redirect(response, '/', clearSessionCookie(secureCookies));
      } else if (request.method === 'GET' && url.pathname === '/inventory') {
        if (requirePlayer()) responseHtml(response, 200, layout('Things', inventoryPage(
          player, catalog, store.remainingMeldItemNeeds(player.id)
        ), player, flash));
      } else if (request.method === 'GET' && url.pathname === '/dwarves') {
        if (requirePlayer()) responseHtml(response, 200,
          layout('Dwarves', dwarvesPage(store.dwarfStatus(player.id), catalog, now()), player, flash));
      } else if (request.method === 'GET' && url.pathname === '/stones') {
        if (requirePlayer()) responseHtml(response, 200, layout('Stones', stonesPage(player, catalog), player, flash));
      } else if (request.method === 'GET' && url.pathname === '/mines/auto-recycle') {
        if (requirePlayer()) responseHtml(response, 200, layout('Auto-Recycle', autoRecyclePage(store.autoRecycleCandidates(player.id, now()), catalog), player, flash));
      } else if (request.method === 'POST' && url.pathname === '/mines/auto-recycle') {
        if (!requirePlayer()) return;
        const form = await readForm(request);
        const selections = Object.keys(form).filter((key) => /^recycle_\d+_\d+$/.test(key)).map((key) => {
          const [, cityId, itemId] = key.split('_');
          return { cityId, itemId, quantity: form[`quantity_${cityId}_${itemId}`] };
        });
        const result = store.autoRecycle(player.id, selections, now());
        setFlash(`${result.items} ${result.items === 1 ? 'thing' : 'things'} recycled into ${result.scraps.toLocaleString('en-GB')} Ore scraps.`);
        redirect(response, '/inventory');
      } else if (request.method === 'GET' && url.pathname === '/gadgets') {
        if (requirePlayer()) responseHtml(response, 200, layout('Gadgets', gadgetsPage(player, catalog, now()), player, flash));
      } else if (request.method === 'POST' && /^\/gadgets\/\d+\/activate$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const itemId = Number(url.pathname.split('/')[2]);
        const gadget = store.activateGadget(player.id, itemId, now());
        store.awardStone(player.id, 'Hacked', now());
        if (gadget.expiresAt >= now() + Number(catalog.settings.cracked_gadget_duration_ms)) {
          store.awardStone(player.id, 'Cracked', now());
        }
        setFlash(`${gadget.displayName} active for ${formatDuration(gadget.expiresAt - now())}.`);
        redirect(response, '/gadgets');
      } else if (request.method === 'GET' && url.pathname === '/gadgets/ledger') {
        if (!requirePlayer()) return;
        const gadget = catalogGadgetForBehavior(catalog, 'ledger');
        responseHtml(response, 200, layout(gadget.displayName,
          ledgerPage(store.ledgerReport(player.id, url.searchParams.get('month'), now()), catalog), player, flash));
      } else if (request.method === 'GET' && url.pathname === '/gadgets/medal-detector') {
        if (!requirePlayer()) return;
        const gadget = catalogGadgetForBehavior(catalog, 'medal_detector');
        responseHtml(response, 200, layout(gadget.displayName,
          medalDetectorPage(store.medalDetectorReport(player.id, now()), catalog), player, flash));
      } else if (request.method === 'GET' && url.pathname === '/gadgets/spreadsheet') {
        if (!requirePlayer()) return;
        const cityIds = url.searchParams.getAll('city');
        const rarities = url.searchParams.getAll('rarity');
        const sort = url.searchParams.get('sort') === 'percent' ? 'percent' : 'profit';
        const report = store.spreadsheetReport(player.id, { cityIds, rarities, sort }, now());
        const gadget = catalogGadgetForBehavior(catalog, 'spreadsheet');
        responseHtml(response, 200, layout(gadget.displayName,
          spreadsheetPage(report, cityIds, rarities, sort, catalog), player, flash));
      } else if (request.method === 'GET' && url.pathname === '/gadgets/calculator') {
        if (!requirePlayer()) return;
        const gadget = catalogGadgetForBehavior(catalog, 'calculator');
        responseHtml(response, 200, layout(gadget.displayName,
          calculatorPage(store.calculatorReport(player.id, now()), catalog), player, flash));
      } else if (request.method === 'GET' && url.pathname === '/melds') {
        if (requirePlayer()) responseHtml(response, 200,
          layout('Melds', meldsPage(player, catalog, url.searchParams.get('q') ?? ''), player, flash));
      } else if (request.method === 'GET' && /^\/melds\/\d+$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const meld = catalog.meldById.get(Number(url.pathname.split('/')[2]));
        if (!meld?.public) throw new Error('Meld not found.');
        responseHtml(response, 200, layout(meld.name, meldDetailPage(player, catalog, meld), player, flash));
      } else if (request.method === 'POST' && /^\/melds\/\d+\/create$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const meld = store.createMeld(player.id, Number(url.pathname.split('/')[2]), now());
        store.awardStone(player.id, 'Melded', now());
        if (meld.rarity >= Number(catalog.settings.achievement_high_rarity_minimum)) {
          store.awardStone(player.id, 'Fused', now());
        }
        setMeldReveal([meld]);
        redirect(response, `/melds/${meld.id}`);
      } else if (request.method === 'POST' && /^\/melds\/\d+\/deconstruct$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const result = store.deconstructMeld(player.id, Number(url.pathname.split('/')[2]));
        const city = catalogCityForId(catalog, result.cityId);
        setFlash(`${result.name} dismantled into ${result.restored} things in ${city.name}.`);
        redirect(response, '/melds');
      } else if (request.method === 'GET' && url.pathname === '/professions') {
        if (requirePlayer()) responseHtml(response, 200, layout('Specialisations', professionsPage(player, catalog), player, flash));
      } else if (request.method === 'POST' && /^\/professions\/\d+$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const profession = store.changeProfession(player.id, Number(url.pathname.split('/')[2]), now());
        setFlash(`Specialisation changed to ${profession.name}.`);
        redirect(response, '/professions');
      } else if (request.method === 'GET' && url.pathname === '/factories') {
        if (!requirePlayer()) return;
        const currentTime = now();
        const factoryState = store.factoriesForPlayer(player.id, currentTime);
        const completionFlash = factoryState.completions
          .map((completion) => `${completion.actionName} complete`).join(' · ');
        responseHtml(response, 200, layout('Factories', factoriesPage(player, catalog,
          factoryState, store.employees(player.id, currentTime),
          store.availableWorkers(player.cityId, currentTime), currentTime), player,
        [flash, completionFlash].filter(Boolean).join(' · ')));
      } else if (request.method === 'POST' && url.pathname === '/factories/build') {
        if (!requirePlayer()) return;
        store.buildFactory(player.id, now());
        setFlash('Factory construction started. Assign workers to produce its components.');
        redirect(response, '/factories');
      } else if (request.method === 'POST' && /^\/factories\/\d+\/start$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const factoryId = Number(url.pathname.split('/')[2]);
        const form = await readForm(request);
        const factory = store.startFactoryAction(player.id, factoryId, Number(form.actionId),
          form.itemId ? Number(form.itemId) : null, now());
        setFlash(factory.enqueued
          ? `${factory.queuedJob.actionName} added to factory ${factory.id}'s queue.`
          : `${factory.actionName} started.`);
        redirect(response, '/factories');
      } else if (request.method === 'POST' && /^\/factories\/\d+\/assign$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const factoryId = Number(url.pathname.split('/')[2]);
        const form = await readForm(request);
        store.assignFactoryWorker(player.id, factoryId, Number(form.workerId), now());
        setFlash('Worker assigned.');
        redirect(response, '/factories');
      } else if (request.method === 'POST' && /^\/factories\/\d+\/hire-bot$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const factoryId = Number(url.pathname.split('/')[2]);
        const form = await readForm(request);
        const bot = store.hireFactoryWorkerBot(player.id, factoryId, Number(form.tierId), now());
        setFlash(`${bot.name} hired at ${bot.cph} cph for ${formatGold(bot.costGold)}g.`);
        redirect(response, '/factories');
      } else if (request.method === 'POST' && /^\/factories\/\d+\/(cancel|demolish)$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const parts = url.pathname.split('/');
        if (parts[3] === 'cancel') {
          const actionName = store.cancelFactoryAction(player.id, Number(parts[2]), now());
          setFlash(`${actionName} canceled; ore and any repair item were returned.`);
        } else {
          store.demolishFactory(player.id, Number(parts[2]), now());
          setFlash('Factory demolished; construction ore returned.');
        }
        redirect(response, '/factories');
      } else if (request.method === 'POST'
        && /^\/factories\/\d+\/queue\/\d+\/(cancel|up|down)$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const parts = url.pathname.split('/');
        const factoryId = Number(parts[2]);
        const queueId = Number(parts[4]);
        if (parts[5] === 'cancel') {
          const actionName = store.cancelFactoryQueueJob(player.id, factoryId, queueId, now());
          setFlash(`${actionName} removed from the queue; all reserved inputs were returned.`);
        } else {
          store.reorderFactoryQueueJob(player.id, factoryId, queueId, parts[5], now());
          setFlash(`Factory queue reordered.`);
        }
        redirect(response, '/factories');
      } else if (request.method === 'POST' && /^\/workers\/\d+\/hire$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const worker = store.hireWorker(player.id, Number(url.pathname.split('/')[2]), now());
        store.awardStone(worker.playerId, 'Worked', now());
        setFlash(`${worker.name} hired for ${formatDuration(worker.expiresAt - now())} at ${worker.cph} cph.`);
        redirect(response, '/factories');
      } else if (request.method === 'POST' && /^\/workers\/\d+\/(idle|oil)$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const parts = url.pathname.split('/');
        if (parts[3] === 'oil') {
          store.oilWorker(player.id, Number(parts[2]), now());
          setFlash('Worker oiled for +1 cph.');
        } else {
          store.idleFactoryWorker(player.id, Number(parts[2]), now());
          setFlash('Worker returned to the idle pool.');
        }
        redirect(response, '/factories');
      } else if (request.method === 'GET' && url.pathname === '/events') {
        if (!requirePlayer()) return;
        const eventTime = now();
        const vehicles = store.vehiclesForPlayer(player.id, eventTime);
        const status = store.worldEventStatus(player.id, eventTime);
        responseHtml(response, 200, layout('World Events',
          worldEventsPage(player, catalog, status, vehicles, eventTime), player, flash));
      } else if (request.method === 'POST'
        && /^\/events\/creatures\/\d+\/(?:attack|hunt)$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const creatureId = Number(url.pathname.split('/')[3]);
        const form = await readForm(request);
        const result = store.attackWorldCreature(
          player.id, creatureId, Number(form.vehicleId), now()
        );
        setFlash(`${result.vehicleName} is underway to attack the ${result.creatureName}. Expected interception in ${formatDuration(result.duration)} at ${Math.round(result.encounterLocation).toLocaleString('en-GB')} km along the route.`);
        redirect(response, '/events');
      } else if (request.method === 'GET' && url.pathname === '/vehicles') {
        if (!requirePlayer()) return;
        const vehicles = store.vehiclesForPlayer(player.id, now());
        for (const vehicle of vehicles) vehicle.routes = store.routesForVehicle(player.id, vehicle.id, now());
        const thiefBase = store.thiefBaseStatus(player.id);
        responseHtml(response, 200, layout('Vehicles',
          vehiclesPage(player, catalog, vehicles, now(), thiefBase), player, flash));
      } else if (request.method === 'GET' && url.pathname === '/vehicles/boxes') {
        if (!requirePlayer()) return;
        const requestedVehicleId = Number(url.searchParams.get('vehicleId'));
        let vehicleId = null;
        if (Number.isSafeInteger(requestedVehicleId) && requestedVehicleId > 0) {
          try {
            const vehicle = store.vehicleDetails(player.id, requestedVehicleId, now());
            if (vehicle.type === 'sea' && vehicle.status === 'idle' && vehicle.cityId === player.cityId) {
              vehicleId = vehicle.id;
            }
          } catch {
            // Ignore a stale return target; the ammunition page remains usable.
          }
        }
        responseHtml(response, 200, layout('Ammunition boxes',
          ammoBoxesPage(player, catalog, vehicleId), player, flash));
      } else if (request.method === 'POST' && /^\/vehicles\/boxes\/\d+\/open$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const form = await readForm(request);
        const opened = store.openAmmoBox(player.id, Number(url.pathname.split('/')[3]),
          Number(form.quantity ?? 1));
        setFlash(`${opened.boxes} ammunition box${opened.boxes === 1 ? '' : 'es'} opened into ${opened.crates} crates.`);
        const vehicleId = Number(url.searchParams.get('vehicleId'));
        redirect(response, Number.isSafeInteger(vehicleId) && vehicleId > 0
          ? `/vehicles/boxes?vehicleId=${vehicleId}` : '/vehicles/boxes');
      } else if (request.method === 'GET' && /^\/vehicles\/\d+\/(cargo|customize)$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const parts = url.pathname.split('/');
        const vehicleId = Number(parts[2]);
        const view = parts[3];
        const vehicle = store.vehicleDetails(player.id, vehicleId, now());
        if (vehicle.status !== 'idle' || vehicle.cityId !== player.cityId) {
          redirect(response, `/vehicles/${vehicleId}`);
          return;
        }
        const kind = view === 'cargo' ? 'cargo' : vehicle.type === 'sea' ? 'ship' : 'land';
        const previewState = rememberedPreview(session, kind, vehicleId);
        responseHtml(response, 200, layout(`${view === 'cargo' ? 'Cargo' : 'Customize'} · ${vehicle.name}`,
          vehicleDetailPage(player, catalog, vehicle, [], now(), view,
            previewState?.preview ?? null, previewState?.selections ?? {},
            previewState?.token ?? ''), player, flash));
      } else if (request.method === 'GET' && /^\/vehicles\/\d+$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const vehicleId = Number(url.pathname.split('/')[2]);
        const vehicle = store.vehicleDetails(player.id, vehicleId, now());
        if (vehicle.status !== 'traveling' && vehicle.cityId !== player.cityId) {
          responseHtml(response, 200, layout(vehicle.name,
            remoteVehiclePage(player, catalog, vehicle), player, flash));
          return;
        }
        const routes = store.routesForVehicle(player.id, vehicleId, now());
        responseHtml(response, 200, layout(vehicle.name, vehicleDetailPage(player, catalog, vehicle, routes, now()), player, flash));
      } else if (request.method === 'POST' && /^\/vehicles\/activate\/\d+$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const itemId = Number(url.pathname.split('/').pop());
        if (!catalog.vehicleByItemId.has(itemId)) throw new Error('That item is not a vehicle.');
        store.activateVehicle(player.id, itemId);
        setFlash('Vehicle activated in this city.');
        redirect(response, '/vehicles');
      } else if (request.method === 'POST' && /^\/vehicles\/\d+\/send$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const vehicleId = Number(url.pathname.split('/')[2]);
        const form = await readForm(request);
        let aggressiveMask = 0;
        for (const rarity of vehicleRarities(catalog).map((entry) => entry.id)) {
          if (form[`attack_${rarity}`] === 'on') aggressiveMask |= 1 << rarity;
        }
        const journey = store.sendVehicle(player.id, vehicleId, Number(form.routeId), now(), {
          travelOrder: form.travelOrder, aggressiveMask,
          aggressiveVsSentry: form.attackSentry === 'on'
        });
        store.awardStone(player.id, 'Travelled', now());
        const destinationName = journey.mission ? 'the ore-thief mission'
          : catalogCityForId(catalog, journey.destinationCityId).name;
        setFlash(`Vehicle sent to ${destinationName}; travel time ${formatDuration(journey.duration)}.${journey.battleId ? ' An encounter occurred.' : ''}`);
        redirect(response, journey.battleId ? `/battles/${journey.battleId}` : `/vehicles/${vehicleId}`);
      } else if (request.method === 'POST' && /^\/vehicles\/\d+\/rename$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const vehicleId = Number(url.pathname.split('/')[2]);
        const form = await readForm(request);
        store.renameVehicle(player.id, vehicleId, form.name);
        setFlash('Vehicle renamed.');
        redirect(response, `/vehicles/${vehicleId}`);
      } else if (request.method === 'POST' && /^\/vehicles\/\d+\/cargo$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const vehicleId = Number(url.pathname.split('/')[2]);
        const form = await readForm(request);
        const vehicle = store.vehicleDetails(player.id, vehicleId, now());
        if (vehicle.status !== 'idle' || vehicle.cityId !== player.cityId) {
          throw new Error('Only an idle vehicle in your selected city can change cargo.');
        }
        const cargo = Object.fromEntries(Object.entries(form)
          .filter(([key]) => /^cargo_\d+$/.test(key))
          .map(([key, value]) => {
            const quantity = Number(value);
            if (!Number.isSafeInteger(quantity) || quantity < 0) {
              throw new Error('Cargo quantities must be whole numbers.');
            }
            return [key.slice(6), quantity];
          }).sort(([first], [second]) => Number(first) - Number(second)));
        const selections = { cargo };
        if (form.intent === 'commit') {
          consumePreview(sessionId, session, player.id, vehicleId, 'cargo', selections,
            form.previewToken);
          store.setVehicleCargo(player.id, vehicleId, cargo);
          setFlash('Cargo loadout committed.');
          redirect(response, `/vehicles/${vehicleId}`);
          return;
        }
        if (form.intent !== 'preview') throw new Error('Preview this cargo before committing it.');
        const preview = store.previewVehicleCargo(player.id, vehicleId, cargo);
        const previewState = rememberPreview(sessionId, session, player.id, vehicleId,
          'cargo', selections, preview);
        responseHtml(response, 200, layout(`Preview cargo · ${vehicle.name}`,
          vehicleDetailPage(player, catalog, vehicle, [], now(), 'cargo', preview, selections,
            previewState.token), player, flash));
      } else if (request.method === 'POST' && /^\/vehicles\/\d+\/customize$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const vehicleId = Number(url.pathname.split('/')[2]);
        const form = await readForm(request);
        const vehicle = store.vehicleDetails(player.id, vehicleId, now());
        if (vehicle.status !== 'idle' || vehicle.cityId !== player.cityId) {
          throw new Error('Only an idle vehicle in your selected city can be customized.');
        }
        const expandCounts = (prefix) => {
          const ids = [];
          for (const [key, value] of Object.entries(form).filter(([key]) => new RegExp(`^${prefix}_\\d+$`).test(key))) {
            const count = prefix === 'mod' ? (value === 'on' ? 1 : 0) : Number(value);
            if (!Number.isSafeInteger(count) || count < 0) throw new Error('Fitting counts must be whole numbers.');
            for (let index = 0; index < count; index += 1) ids.push(Number(key.slice(prefix.length + 1)));
          }
          return ids;
        };
        const completeCannonSet = (requestedIds) => {
          const remaining = new Map();
          for (const id of requestedIds) remaining.set(id, (remaining.get(id) ?? 0) + 1);
          const desired = [];
          for (const cannon of [...vehicle.cannons].sort((first, second) => first.portal - second.portal)) {
            const count = remaining.get(cannon.id) ?? 0;
            if (!count) continue;
            desired.push(cannon.id);
            remaining.set(cannon.id, count - 1);
          }
          for (const id of requestedIds) {
            const count = remaining.get(id) ?? 0;
            if (!count) continue;
            desired.push(id);
            remaining.set(id, count - 1);
          }
          return desired;
        };
        const selections = vehicle.type === 'land'
          ? {
              modIds: expandCounts('mod').sort((first, second) => first - second),
              weaponIds: expandCounts('weapon').sort((first, second) => first - second)
            }
          : { cannonIds: completeCannonSet(expandCounts('cannon')) };
        const kind = vehicle.type === 'sea' ? 'ship' : 'land';
        if (form.intent === 'commit') {
          consumePreview(sessionId, session, player.id, vehicleId, kind, selections,
            form.previewToken);
          if (vehicle.type === 'land') {
            store.fitVehicleLoadout(player.id, vehicleId, selections.modIds, selections.weaponIds);
            setFlash('Mod and weapon loadout committed together.');
          } else if (vehicle.type === 'sea') {
            store.fitShipLoadout(player.id, vehicleId, selections.cannonIds);
            setFlash('Complete cannon loadout committed.');
          } else {
            throw new Error('This vehicle has no customizable fittings.');
          }
          redirect(response, `/vehicles/${vehicleId}`);
          return;
        }
        if (form.intent !== 'preview') throw new Error('Preview this loadout before committing it.');
        const preview = vehicle.type === 'land'
          ? store.previewVehicleFittings(player.id, vehicleId, selections.modIds, selections.weaponIds)
          : store.previewShipLoadout(player.id, vehicleId, selections.cannonIds);
        const previewState = rememberPreview(sessionId, session, player.id, vehicleId,
          kind, selections, preview);
        responseHtml(response, 200, layout(`Preview · ${vehicle.name}`,
          vehicleDetailPage(player, catalog, vehicle, [], now(), 'customize', preview, selections,
            previewState.token), player, flash));
      } else if (request.method === 'POST' && /^\/vehicles\/\d+\/(mods|weapons)$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        throw new Error('This legacy fitting route is retired. Preview the complete loadout first.');
      } else if (request.method === 'POST' && /^\/vehicles\/\d+\/cannons$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        throw new Error('This legacy cannon route is retired. Preview the complete cannon loadout first.');
      } else if (request.method === 'POST' && /^\/vehicles\/\d+\/cannons\/detach$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        throw new Error('Detach all is retired. Preview the complete cannon loadout instead.');
      } else if (request.method === 'POST' && /^\/vehicles\/\d+\/ammo$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const vehicleId = Number(url.pathname.split('/')[2]);
        const form = await readForm(request);
        const vehicle = store.vehicleDetails(player.id, vehicleId, now());
        if (vehicle.status !== 'idle' || vehicle.cityId !== player.cityId) {
          throw new Error('Only a ship in your selected city can load ammunition.');
        }
        const quantity = Number(form.quantity ?? 1);
        store.loadShipAmmo(player.id, vehicleId, Number(form.type), quantity);
        session?.loadoutPreviews?.delete(previewKey('ship', vehicleId));
        setFlash(`${quantity} ammunition crate${quantity === 1 ? '' : 's'} loaded.`);
        redirect(response, `/vehicles/${vehicleId}/customize`);
      } else if (request.method === 'POST' && /^\/vehicles\/\d+\/ammo\/unload$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const vehicleId = Number(url.pathname.split('/')[2]);
        const form = await readForm(request);
        const vehicle = store.vehicleDetails(player.id, vehicleId, now());
        if (vehicle.status !== 'idle' || vehicle.cityId !== player.cityId || !vehicle.ship) {
          throw new Error('Only a ship in your selected city can unload ammunition.');
        }
        const ammunition = catalog.cannonballs.map((definition) => {
          const rule = catalog.settings.ammunition_rules?.[definition.type];
          if (!rule?.storageField) throw new Error(`Missing ammunition rule for type ${definition.type}.`);
          const shots = Number(vehicle.ship[rule.storageField] ?? 0);
          return { crates: Math.floor(shots / Number(catalog.settings.shots_per_crate)),
            loose: shots % Number(catalog.settings.shots_per_crate) };
        });
        const crates = ammunition.reduce((sum, entry) => sum + entry.crates, 0);
        const loose = ammunition.reduce((sum, entry) => sum + entry.loose, 0);
        if (loose && form.confirmLoss !== 'yes') {
          throw new Error(`Confirm that ${loose} loose shot${loose === 1 ? '' : 's'} will be discarded.`);
        }
        store.unloadShipAmmo(player.id, vehicleId);
        session?.loadoutPreviews?.delete(previewKey('ship', vehicleId));
        setFlash(`${crates} complete ammunition crate${crates === 1 ? '' : 's'} returned to inventory.${loose ? ` ${loose} loose shot${loose === 1 ? '' : 's'} discarded.` : ' No shots lost.'}`);
        redirect(response, `/vehicles/${vehicleId}/customize`);
      } else if (request.method === 'POST' && /^\/vehicles\/\d+\/oil$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const vehicleId = Number(url.pathname.split('/')[2]);
        store.loadVehicleOil(player.id, vehicleId);
        setFlash('Vehicle oiled for its original rarity-based trip allowance.');
        redirect(response, `/vehicles/${vehicleId}`);
      } else if (request.method === 'POST' && /^\/vehicles\/\d+\/oil\/unload$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const vehicleId = Number(url.pathname.split('/')[2]);
        store.unloadVehicleOil(player.id, vehicleId);
        setFlash(`A stolen barrel of ${catalogItemForSetting(catalog, 'oil_item_id').name} was reclaimed.`);
        redirect(response, `/vehicles/${vehicleId}`);
      } else if (request.method === 'POST' && /^\/vehicles\/\d+\/store$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        store.storeVehicle(player.id, Number(url.pathname.split('/')[2]));
        setFlash('Vehicle returned to local inventory.');
        redirect(response, '/vehicles');
      } else if (request.method === 'GET' && /^\/battles\/\d+$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const report = store.battleReport(player.id, Number(url.pathname.split('/')[2]));
        responseHtml(response, 200, layout('Battle report', battlePage(report), player, flash));
      } else if (request.method === 'GET' && url.pathname === '/ratings') {
        if (!requirePlayer()) return;
        responseHtml(response, 200, layout('Ratings',
          ratingsPage(store.vehicleRatings(url.searchParams.get('class')), catalog), player, flash));
      } else if (request.method === 'GET' && url.pathname === '/containers') {
        if (!requirePlayer()) return;
        responseHtml(response, 200, layout('Containers', containersPage(store.containersForPlayer(player.id)), player, flash));
      } else if (request.method === 'POST' && /^\/containers\/\d+\/buy$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const container = store.buyContainer(player.id, Number(url.pathname.split('/')[2]));
        store.awardStone(player.id, 'Expanded', now());
        setFlash(`${container.name} purchased. Inventory capacity is now ${container.itemLimit}.`);
        redirect(response, '/containers');
      } else if (request.method === 'GET' && url.pathname === '/oil-field') {
        if (!requirePlayer()) return;
        const requestedAt = now();
        const field = maintenanceRunning
          ? store.oilFieldView(player.id, requestedAt) : store.oilField(player.id, requestedAt);
        responseHtml(response, 200,
          layout('Oil Field', originalOilFieldPage(player, field, catalog, requestedAt), player, flash));
      } else if (request.method === 'POST' && url.pathname === '/oil-field/deploy') {
        if (!requirePlayer()) return;
        const form = await readForm(request);
        store.deployOilMachine(player.id, Number(form.hexId), Number(form.machineId), Number(form.point), now());
        setFlash('Machine deployed in the Oil Field.');
        redirect(response, '/oil-field');
      } else if (request.method === 'POST' && url.pathname === '/oil-field/queue') {
        if (!requirePlayer()) return;
        const form = await readForm(request);
        store.queueOilMachine(player.id, Number(form.hexId), Number(form.machineId), Number(form.point), now());
        setFlash('Replacement machine queued.');
        redirect(response, '/oil-field');
      } else if (request.method === 'POST' && url.pathname === '/oil-field/bomb') {
        if (!requirePlayer()) return;
        const form = await readForm(request);
        const result = store.bombOilHex(player.id, Number(form.hexId), Number(form.machineId), now());
        setFlash(`Bomb dropped: ${Math.round(result.damageSeconds / 3600)} machine-hours damaged and ${formatGold(result.litersLost)}L of oil burned.`);
        redirect(response, '/oil-field');
      } else if (request.method === 'POST' && /^\/oil-field\/\d+\/claim$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        store.claimOilBarrel(player.id, Number(url.pathname.split('/')[2]), now());
        setFlash(`${catalogItemForSetting(catalog, 'oil_item_id').name} barrel moved to your city inventory.`);
        redirect(response, '/oil-field');
      } else if (request.method === 'GET' && url.pathname === '/map') {
        if (!requirePlayer()) return;
        const vehicles = store.vehiclesForPlayer(player.id, now());
        for (const vehicle of vehicles) {
          vehicle.routes = store.routesForVehicle(player.id, vehicle.id, now());
        }
        responseHtml(response, 200, layout('Map', mapPage(player, catalog,
          store.knownCityIds(player.id, now()), vehicles,
          url.searchParams.get('world') ?? ''), player, flash));
      } else if (request.method === 'GET' && url.pathname === '/move') {
        if (!requirePlayer()) return;
        if (player.cityId === player.homeCityId) throw new Error('Travel to another discovered city before moving home.');
        responseHtml(response, 200, layout('Move home', movePage(player, catalog, now()), player, flash));
      } else if (request.method === 'POST' && url.pathname === '/move') {
        if (!requirePlayer()) return;
        const form = await readForm(request);
        const result = store.moveHomeCity(player.id, Number(form.cityId), now());
        store.awardStone(player.id, 'Moved', now());
        const city = catalogCityForId(catalog, result.homeCityId);
        setFlash(`You now live in ${city.name}. ${result.brokenMeldCount} melds were nullified.`);
        redirect(response, '/melds');
      } else if (request.method === 'POST' && /^\/cities\/\d+\/select$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const cityId = Number(url.pathname.split('/')[2]);
        store.changeCity(player.id, cityId, now());
        const city = catalogCityForId(catalog, cityId);
        setFlash(`Now viewing ${city.name}.`);
        redirect(response, requestDestination(request, '/'));
      } else if (request.method === 'GET' && url.pathname === '/credits') {
        if (requirePlayer()) responseHtml(response, 200, layout('Buy credits', creditsPage(
          player, store.creditBundles(true), store.playerCreditPurchases(player.id),
          paymentReadiness, paymentConfig
        ), player, flash));
      } else if (request.method === 'POST' && url.pathname === '/credits/paypal/orders') {
        if (!requirePlayer()) return;
        if (!paymentReadiness.ready) {
          throw new Error(`Checkout is unavailable: ${paymentReadiness.missing.join(', ')}.`);
        }
        const form = await readForm(request);
        if (form.acceptPaymentTerms !== '1' || form.immediateDelivery !== '1') {
          throw new Error('Accept the payment terms and immediate delivery statement to continue.');
        }
        const purchase = store.createCreditPurchase(player.id, Number(form.bundleId), {
          termsVersion: LEGAL_VERSION,
          sellerName: seller.legalName,
          sellerAddress: seller.legalAddress,
          sellerEmail: seller.legalEmail
        }, now());
        try {
          const created = await paypalClient.createOrder(purchase);
          const approval = new URL(created.approveUrl);
          if (approval.protocol !== 'https:') throw new Error('PayPal returned an unsafe approval address.');
          store.setCreditPurchaseOrder(purchase.id, player.id, created.order.id, now());
          redirect(response, approval.href);
        } catch (error) {
          store.setCreditPurchaseStatus(purchase.id, 'failed', now(), error.message);
          throw error;
        }
      } else if (request.method === 'GET' && url.pathname === '/credits/paypal/return') {
        if (!requirePlayer()) return;
        const orderId = String(url.searchParams.get('token') ?? '');
        const purchase = store.creditPurchaseByOrder(orderId);
        if (!purchase || purchase.playerId !== player.id) throw new Error('Credit purchase not found.');
        if (purchase.status !== 'completed') {
          const captured = await paypalClient.captureOrder(orderId, purchase.id);
          try {
            const summary = verifyCapturedOrder(captured, purchase);
            store.completeCreditPurchase(purchase.id, summary.captureId, now());
          } catch (error) {
            store.setCreditPurchaseStatus(purchase.id, 'review', now(), error.message);
            throw error;
          }
        }
        setFlash(`${purchase.credits} credits added. Receipt MT-${purchase.id} is ready.`);
        redirect(response, `/credits/receipts/${purchase.id}`);
      } else if (request.method === 'GET' && url.pathname === '/credits/paypal/cancel') {
        if (!requirePlayer()) return;
        const orderId = String(url.searchParams.get('token') ?? '');
        const purchase = store.creditPurchaseByOrder(orderId);
        if (purchase?.playerId === player.id) {
          store.setCreditPurchaseStatus(purchase.id, 'cancelled', now());
        }
        setFlash('PayPal checkout was cancelled. No credits were added.');
        redirect(response, '/credits');
      } else if (request.method === 'GET' && /^\/credits\/receipts\/\d+\.txt$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const purchaseId = Number(url.pathname.match(/\d+/)[0]);
        const purchase = store.creditPurchase(purchaseId, player.id);
        if (!purchase) throw new Error('Receipt not found.');
        responseText(response, 200, receiptText(purchase), `minethings-receipt-MT-${purchase.id}.txt`);
      } else if (request.method === 'GET' && /^\/credits\/receipts\/\d+$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const purchase = store.creditPurchase(Number(url.pathname.split('/').pop()), player.id);
        if (!purchase) throw new Error('Receipt not found.');
        responseHtml(response, 200, layout(`Receipt MT-${purchase.id}`, receiptPage(purchase), player, flash));
      } else if (request.method === 'GET' && url.pathname === '/help') {
        responseHtml(response, 200, layout('Help', helpPage(catalog), player, flash));
      } else if (request.method === 'GET' && url.pathname === '/market') {
        if (requirePlayer()) responseHtml(response, 200, layout('Shop', marketPage(player, catalog), player, flash));
      } else if (request.method === 'GET' && url.pathname === '/exchange') {
        if (requirePlayer()) responseHtml(response, 200, layout('Markets', exchangePage(
          player, catalog, store.purchasableItemListings(player.cityId, player.id), {
            query: url.searchParams.get('q') ?? '', type: url.searchParams.get('type') ?? '',
            sort: url.searchParams.get('sort') ?? 'recommended'
          }
        ), player, flash));
      } else if (request.method === 'GET' && url.pathname === '/miners') {
        if (!requirePlayer()) return;
        responseHtml(response, 200, layout('Miners', minersPage(player,
          store.listMiners(url.searchParams.get('q') ?? ''), catalog,
          url.searchParams.get('q') ?? '', store.chatIgnores(player.id)), player, flash));
      } else if (request.method === 'GET' && /^\/miners\/[^/]+\/market$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const name = decodeURIComponent(url.pathname.slice('/miners/'.length, -'/market'.length));
        const market = store.playerMarket(name, player.cityId);
        const cityName = catalogCityForId(catalog, player.cityId).name;
        responseHtml(response, 200, layout(`${market.ownerName}'s market`, playerMarketPage(market, cityName, catalog), player, flash));
      } else if (request.method === 'POST' && /^\/miners\/[^/]+\/gold-gift$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const name = decodeURIComponent(url.pathname.slice('/miners/'.length, -'/gold-gift'.length));
        const form = await readForm(request);
        const transfer = store.transferGold(player.id, name, form.amount, form.note, now());
        setFlash(`Sent ${formatGold(transfer.amount)}g to ${transfer.recipientName}.`);
        redirect(response, `/miners/${encodeURIComponent(transfer.recipientName)}`);
      } else if (request.method === 'GET' && /^\/miners\/[^/]+$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const name = decodeURIComponent(url.pathname.slice('/miners/'.length));
        const subject = store.findPlayer(name, now());
        if (!subject) throw new Error('Miner not found.');
        responseHtml(response, 200, layout(subject.name, profilePage(
          subject, catalog, subject.id === player.id, now(), {
            cityId: url.searchParams.get('city'), mineTypeId: url.searchParams.get('mineType'),
            functionName: url.searchParams.get('function'), loadAll: url.searchParams.get('all') === '1'
          }, player.knownCityIds
        ), player, flash));
      } else if (request.method === 'POST' && url.pathname === '/profile') {
        if (!requirePlayer()) return;
        const form = await readForm(request);
        const description = String(form.description ?? '').trim();
        store.updateDescription(player.id, description);
        const personalized = store.playerById(player.id, now());
        if (personalized.description && personalized.avatarLayers.length) store.awardStone(player.id, 'Personalized', now());
        setFlash('Profile updated.');
        redirect(response, `/miners/${encodeURIComponent(player.name)}`);
      } else if (request.method === 'GET' && url.pathname === '/account') {
        if (requirePlayer()) responseHtml(response, 200, layout('Account', accountPage(player, catalog), player, flash));
      } else if (request.method === 'POST' && url.pathname === '/account') {
        if (!requirePlayer()) return;
        const form = await readForm(request);
        store.updatePrivacy(player.id, {
          publishFindings: form.publishFindings === 'on',
          showMines: form.showMines === 'on'
        });
        setFlash('Privacy settings saved.');
        redirect(response, '/account');
      } else if (request.method === 'POST' && url.pathname === '/account/privacy') {
        if (!requirePlayer()) return;
        const form = await readForm(request);
        store.updatePrivacy(player.id, {
          publishFindings: form.publishFindings === 'on',
          showMines: form.showMines === 'on'
        });
        setFlash('Privacy settings saved.');
        redirect(response, '/account');
      } else if (request.method === 'POST' && url.pathname === '/account/email') {
        if (!requirePlayer()) return;
        const form = await readForm(request);
        if (!await verifyPasswordAsync(form.password, player.passwordHash)) {
          throw new Error('The current password is incorrect.');
        }
        const changed = store.changePlayerEmail(player.id, form.email, now());
        if (!changed.changed) {
          setFlash('That is already your verified email address.');
          redirect(response, '/account');
          return;
        }
        delete session.developmentVerificationUrl;
        try {
          await sendEmailVerification(player.id, request, session, now());
          session.flash = 'New address saved. Verify it to unlock your account.';
        } catch (error) {
          session.flash = error.message;
        }
        redirect(response, '/verify-email');
      } else if (request.method === 'POST' && url.pathname === '/account/password') {
        if (!requirePlayer()) return;
        const form = await readForm(request);
        if (form.password !== form.confirmPassword) throw new Error('New passwords do not match.');
        await store.changePasswordAsync(player.id, form.oldPassword, form.password);
        setFlash('Password changed.');
        redirect(response, '/account');
      } else if (request.method === 'GET' && url.pathname === '/avatar') {
        if (!requirePlayer()) return;
        responseHtml(response, 200, layout('Avatar Editor', avatarEditorPage(player, catalog), player, flash));
      } else if (request.method === 'POST' && url.pathname === '/avatar') {
        if (!requirePlayer()) return;
        const form = await readForm(request);
        const selectedIds = Object.entries(form).filter(([key, value]) => /^type_\d+$/.test(key) && value !== '')
          .map(([, value]) => Number(value));
        const enriched = catalog.avatarElements.map((element) => ({
          ...element, rarity: catalogItemForId(
            catalog, element.itemId, `avatar element ${element.id}`
          ).rarity
        }));
        store.saveAvatar(player.id, selectedIds, enriched);
        const personalized = store.playerById(player.id, now());
        if (personalized.description && personalized.avatarLayers.length) store.awardStone(player.id, 'Personalized', now());
        setFlash('Avatar updated. Its items no longer count toward inventory capacity.');
        redirect(response, `/miners/${encodeURIComponent(player.name)}`);
      } else if (request.method === 'GET' && /^\/melds\/compare\/[^/]+$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const name = decodeURIComponent(url.pathname.slice('/melds/compare/'.length));
        const other = store.findPlayer(name, now());
        if (!other) throw new Error('Miner not found.');
        responseHtml(response, 200, layout('Compare melds', meldComparisonPage(player, other, catalog), player, flash));
      } else if (request.method === 'GET' && url.pathname === '/messages') {
        if (!requirePlayer()) return;
        const filter = ['all', 'unread', 'deleted'].includes(url.searchParams.get('filter')) ? url.searchParams.get('filter') : 'all';
        const type = normalizedMessageTypeFilter(url.searchParams.get('type'));
        responseHtml(response, 200, layout('Messages', messagesPage(
          player, store.recentMessages(player.id, filter, type), catalog, filter, type), player, flash));
      } else if (request.method === 'GET' && url.pathname === '/stats') {
        if (!requirePlayer()) return;
        responseHtml(response, 200, layout('Server Stats', statsPage(store.publicStats(now())), player, flash));
      } else if (request.method === 'GET' && url.pathname === '/admin') {
        if (!requireAdmin()) return;
        responseHtml(response, 200, layout('Administration', adminDashboardPage(store.adminOverview(now())), player, flash));
      } else if (request.method === 'GET' && url.pathname === '/admin/payments') {
        if (!requireAdmin()) return;
        responseHtml(response, 200, layout('Admin · Payments', adminPaymentsPage(
          store.creditBundles(false), store.adminCreditPurchases()
        ), player, flash));
      } else if (request.method === 'POST' && /^\/admin\/credit-bundles\/\d+$/.test(url.pathname)) {
        if (!requireAdmin()) return;
        const form = await readForm(request);
        const bundle = store.adminUpdateCreditBundle(player.id,
          Number(url.pathname.split('/').pop()), {
            name: form.name, credits: form.credits, amountMinor: form.amountMinor,
            enabled: form.enabled === '1'
          }, now());
        setFlash(`${bundle.name} updated.`);
        redirect(response, '/admin/payments');
      } else if (request.method === 'GET' && url.pathname === '/admin/players') {
        if (!requireAdmin()) return;
        const query = url.searchParams.get('q') ?? '';
        responseHtml(response, 200, layout('Admin · Miners', adminPlayersPage(store.adminPlayers(query), query), player, flash));
      } else if (request.method === 'GET' && url.pathname === '/admin/routes') {
        if (!requireAdmin()) return;
        responseHtml(response, 200, layout('Admin · World routes',
          adminRoutesPage(store.adminInterMapRoutes(), catalog), player, flash));
      } else if (request.method === 'POST' && /^\/admin\/routes\/\d+$/.test(url.pathname)) {
        if (!requireAdmin()) return;
        const form = await readForm(request);
        const route = store.adminSetInterMapRoute(
          player.id, Number(url.pathname.split('/').pop()), form.open === '1', now()
        );
        setFlash(`${route.city1_name} ↔ ${route.city2_name} is now ${form.open === '1' ? 'open' : 'closed'}.`);
        redirect(response, '/admin/routes');
      } else if (request.method === 'GET' && url.pathname === '/admin/world') {
        if (!requireAdmin()) return;
        const eventTime = now();
        responseHtml(response, 200, layout('Admin Â· World events', adminWorldEventsPage(
          store.adminWorldEventControls(eventTime), catalog, eventTime
        ), player, flash));
      } else if (request.method === 'POST' && url.pathname === '/admin/world/creatures') {
        if (!requireAdmin()) return;
        const form = await readForm(request);
        const creature = store.adminSpawnWorldCreature(
          player.id, form.type, form.mapId, form.routeId, now(), form.rarity
        );
        setFlash(`${creature.name} released on ${creature.routeName} in ${creature.mapName}.`);
        redirect(response, '/admin/world');
      } else if (request.method === 'POST' && url.pathname === '/admin/world/ghosts') {
        if (!requireAdmin()) return;
        const form = await readForm(request);
        const ghost = store.adminRaiseGhost(
          player.id, form.kind, form.routeId, form.rarity, now()
        );
        setFlash(`${ghost.name} now haunts ${ghost.routeName}.`);
        redirect(response, '/admin/world');
      } else if (request.method === 'POST' && url.pathname === '/admin/world/ghost-fleets') {
        if (!requireAdmin()) return;
        const result = store.adminProvisionGhostHunterFleets(player.id, now());
        setFlash(`${result.vehicles} armed hunter craft provisioned across ${result.players} miners.`);
        redirect(response, '/admin/world');
      } else if (request.method === 'POST' && url.pathname === '/admin/world/weather') {
        if (!requireAdmin()) return;
        const form = await readForm(request);
        const weather = store.adminSetWeather(player.id, form.mapId, {
          condition: form.condition, temperatureC: form.temperatureC,
          windKph: form.windKph, rainfallMm: form.rainfallMm
        }, now());
        setFlash(`${weather.mapName} weather changed to ${weather.condition}.${
          weather.shipsHit ? ` ${weather.shipsHit} ship${weather.shipsHit === 1 ? '' : 's'} struck.` : ''}`);
        redirect(response, '/admin/world');
      } else if (request.method === 'GET' && /^\/admin\/players\/\d+$/.test(url.pathname)) {
        if (!requireAdmin()) return;
        const subject = store.adminPlayer(Number(url.pathname.split('/').pop()));
        if (!subject) throw new Error('Miner not found.');
        responseHtml(response, 200, layout(`Admin · ${subject.name}`, adminPlayerPage(subject, catalog), player, flash));
      } else if (request.method === 'POST' && /^\/admin\/players\/\d+\/moderation$/.test(url.pathname)) {
        if (!requireAdmin()) return;
        const subjectId = Number(url.pathname.split('/')[3]);
        const form = await readForm(request);
        const name = store.adminSetModeration(player.id, subjectId, form.field, form.enabled === '1', now());
        setFlash(`${name}'s moderation settings were updated.`);
        redirect(response, `/admin/players/${subjectId}`);
      } else if (request.method === 'POST' && /^\/admin\/players\/\d+\/grant$/.test(url.pathname)) {
        if (!requireAdmin()) return;
        const subjectId = Number(url.pathname.split('/')[3]);
        const form = await readForm(request);
        const name = store.adminGrant(player.id, subjectId, form.kind, form.amount, form.itemId, now());
        setFlash(`Grant delivered to ${name}.`);
        redirect(response, `/admin/players/${subjectId}`);
      } else if (request.method === 'GET' && url.pathname === '/admin/announcement') {
        if (!requireAdmin()) return;
        responseHtml(response, 200, layout('Admin · Announcement', adminAnnouncementPage(), player, flash));
      } else if (request.method === 'POST' && url.pathname === '/admin/announcement') {
        if (!requireAdmin()) return;
        const form = await readForm(request);
        const count = store.adminBroadcast(player.id, form.subject, form.body, now());
        setFlash(`Announcement sent to ${count} miner${count === 1 ? '' : 's'}.`);
        redirect(response, '/admin/announcement');
      } else if (request.method === 'GET' && url.pathname === '/admin/audit') {
        if (!requireAdmin()) return;
        responseHtml(response, 200, layout('Admin · Audit log', adminAuditPage(store.adminAuditLog()), player, flash));
      } else if (request.method === 'POST' && url.pathname === '/messages/actions') {
        if (!requirePlayer()) return;
        const form = await readForm(request);
        const messageIds = Object.keys(form).filter((key) => /^message_\d+$/.test(key)).map((key) => Number(key.slice(8)));
        const changed = store.updateMessages(player.id, messageIds, form.action);
        setFlash(`${changed} message${changed === 1 ? '' : 's'} updated.`);
        const filter = ['all', 'unread', 'deleted'].includes(form.filter) ? form.filter : 'all';
        const type = normalizedMessageTypeFilter(form.type);
        redirect(response, messagesPath(filter, type));
      } else if (request.method === 'GET' && /^\/messages\/view\/\d+$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const message = store.messageForPlayer(player.id, Number(url.pathname.split('/')[3]));
        if (!message.read && !message.deleted) {
          player.unreadMessages = Math.max(0, Number(player.unreadMessages ?? 0) - 1);
        }
        if (!message.system && message.messageType === 'PM' && message.senderName) {
          redirect(response, `/messages/${encodeURIComponent(message.senderName)}`);
          return;
        }
        responseHtml(response, 200, layout(message.subject || 'Message',
          messageDetailPage(message, catalog), player, flash));
      } else if (request.method === 'GET' && url.pathname === '/chat') {
        if (!requirePlayer()) return;
        const historyWindowMs = Number(catalog.settings.chat_history_window_ms);
        if (!Number.isFinite(historyWindowMs) || historyWindowMs <= 0) {
          throw new Error('The chat history window is invalid.');
        }
        const chatAt = now();
        responseHtml(response, 200, layout('Public chat', chatPage(
          player, store.recentChats(null, player.id, chatAt - historyWindowMs),
          store.chatIgnores(player.id), catalog, store.chatAppearance(player.id), historyWindowMs
        ), player, flash));
      } else if (request.method === 'POST' && url.pathname === '/chat') {
        if (!requirePlayer()) return;
        const form = await readForm(request);
        store.addChat(player.id, form.body, now(), form.color || null);
        store.awardStone(player.id, 'Chatted', now());
        redirect(response, '/chat');
      } else if (request.method === 'POST' && /^\/chat\/ignores\/\d+$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const form = await readForm(request);
        const result = store.setChatIgnore(
          player.id, Number(url.pathname.split('/')[3]), form.ignored === '1', now()
        );
        setFlash(`${result.name} ${result.ignored ? 'ignored in public chat' : 'removed from your chat ignore list'}.`);
        redirect(response, requestDestination(request, '/chat'));
      } else if (/^\/banks(?:\/|$)/.test(url.pathname)) {
        responseHtml(response, 410, layout('Banking removed', '<section class="page-title"><div><p class="eyebrow">Gone</p><h1>Banking has been removed</h1></div></section><p>Old banking accounts and contracts were settled during migration. Send gold gifts from a miner profile.</p>', player, flash));
      } else if (request.method === 'POST' && /^\/messages\/[^/]+\/block$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const name = decodeURIComponent(url.pathname.slice('/messages/'.length, -'/block'.length));
        const form = await readForm(request);
        const result = store.setMessageBlock(player.id, name, form.blocked === '1', now());
        setFlash(result.blocked ? `Messages from ${result.name} blocked.` : `Messages from ${result.name} unblocked.`);
        redirect(response, `/messages/${encodeURIComponent(result.name)}`);
      } else if (request.method === 'GET' && /^\/messages\/[^/]+$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const name = decodeURIComponent(url.pathname.slice('/messages/'.length));
        responseHtml(response, 200, layout(`Messages with ${name}`, conversationPage(
          store.conversation(player.id, name), catalog
        ), player, flash));
      } else if (request.method === 'POST' && /^\/messages\/[^/]+$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const name = decodeURIComponent(url.pathname.slice('/messages/'.length));
        const form = await readForm(request);
        const body = String(form.body ?? '').trim();
        store.sendMessage(player.id, name, body, now());
        setFlash('Message sent.');
        redirect(response, `/messages/${encodeURIComponent(name)}`);
      } else if (request.method === 'GET' && /^\/market\/factories\/(sale|rental)$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const marketType = url.pathname.split('/').pop();
        const currentTime = now();
        const market = store.factoryMarket(marketType, player.cityId, player.id, currentTime);
        const cityName = catalogCityForId(catalog, player.cityId).name;
        const factoryName = catalog.settings.factory_market_names?.[marketType];
        if (typeof factoryName !== 'string' || !factoryName) {
          throw new Error(`Missing factory market name: ${marketType}.`);
        }
        responseHtml(response, 200, layout(`${factoryName} Market`,
          factoryMarketPage(player, market, cityName, catalog), player, flash));
      } else if (request.method === 'GET' && /^\/market\/mines\/\d+$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const mineTypeId = Number(url.pathname.split('/').pop());
        const market = store.mineMarket(mineTypeId, player.cityId, player.id);
        const cityName = catalogCityForId(catalog, player.cityId).name;
        responseHtml(response, 200, layout(`${market.name} Mine Market`,
          mineMarketPage(player, market, cityName), player, flash));
      } else if (request.method === 'GET' && /^\/market\/items\/\d+$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const item = catalog.byId.get(Number(url.pathname.split('/').pop()));
        if (!item) throw new Error('Item not found.');
        const market = store.marketForItem(item.id, player.cityId);
        const cityName = catalogCityForId(catalog, player.cityId).name;
        responseHtml(response, 200, layout(`${item.name} market`, itemMarketPage(player, item, market, cityName), player, flash));
      } else if (request.method === 'GET' && /^\/items\/\d+$/.test(url.pathname)) {
        const item = catalog.byId.get(Number(url.pathname.split('/').pop()));
        if (!item) throw new Error('Item not found.');
        const statItem = item.repairedItemId
          ? catalogItemForId(catalog, item.repairedItemId, `repaired item ${item.id}`) : item;
        const machine = catalog.machineByItemId.get(statItem.id);
        const machineInfo = machine ? machineDescription(
          catalog.machineTypeById.get(machine.machineTypeId), item.rarity, catalog.settings
        ) : null;
        const normal = item.repairedItemId ? catalog.byId.get(item.repairedItemId) : item;
        const damagedItem = item.repairedItemId ? item : catalog.items.find((candidate) => candidate.repairedItemId === item.id);
        const recycleSettings = player && normal ? `<form class="recycle-settings" method="post" action="/items/${normal.id}/recycle-settings"><h2>Auto-recycle findings</h2><p>Factory-made copies remain protected; this setting applies only when you find the item.</p><label class="checkbox-line"><input type="checkbox" name="recycleOnFind"${player.recycleItemIds.includes(normal.id) ? ' checked' : ''}> Automatically recycle this item upon finding</label>${damagedItem ? `<label class="checkbox-line"><input type="checkbox" name="recycleDamagedOnFind"${player.recycleItemIds.includes(damagedItem.id) ? ' checked' : ''}> Automatically recycle its damaged version upon finding</label>` : ''}<button>Save recycling settings</button></form>` : '';
        const description = machineInfo ? machineInfo.text : item.description;
        const content = `<section class="detail rarity-${item.rarity}${item.damaged ? ' detail-damaged' : ''}" data-item-id="${item.id}"><div class="detail-art"><img class="detail-frame" src="/img/border.png" alt=""><img class="detail-image${item.hasLargeImage ? '' : ' detail-image-fallback'}" src="${item.largeImage}" alt="${escapeHtml(item.name)}" data-large-image="${item.hasLargeImage ? 'original' : 'fallback'}"></div><div class="detail-copy"><p class="eyebrow">${escapeHtml(item.rarityName)}</p><h1>${escapeHtml(item.name)}</h1><p>${escapeHtml(description)}</p>${itemDetailStats(item, catalog, player)}<a href="${player ? '/inventory' : '/'}">Back</a></div></section>${recycleSettings}`;
        responseHtml(response, 200, layout(item.name, content, player, flash));
      } else if (request.method === 'POST' && /^\/items\/\d+\/recycle-settings$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const item = catalog.byId.get(Number(url.pathname.split('/')[2]));
        if (!item) throw new Error('Item not found.');
        const normal = item.repairedItemId ? catalog.byId.get(item.repairedItemId) : item;
        const damaged = catalog.items.find((candidate) => candidate.repairedItemId === normal.id);
        const form = await readForm(request);
        store.updateRecyclePreferencePair(player.id, normal.id, damaged?.id,
          form.recycleOnFind === 'on', form.recycleDamagedOnFind === 'on', now());
        setFlash('Auto-recycle settings saved.');
        redirect(response, `/items/${normal.id}`);
      } else if (request.method === 'GET' && /^\/mines\/\d+\/equipment$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const mineId = Number(url.pathname.split('/')[2]);
        const mine = player.mines.find((candidate) => candidate.id === mineId
          && candidate.active && candidate.cityId === player.cityId);
        if (!mine) throw new Error('Mine not found.');
        responseHtml(response, 200, layout('Bot loadout',
          mineEquipmentPage(player, catalog, mine, now(),
            url.searchParams.get('detonated') === '1'), player, flash));
      } else if (request.method === 'POST' && /^\/mines\/\d+\/equipment\/\d+\/equip$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const parts = url.pathname.split('/');
        const result = equipMine(player, catalog, Number(parts[2]), Number(parts[4]));
        store.savePlayer(player);
        const item = catalog.byId.get(Number(parts[4]));
        setFlash(`${item.name} equipped${result.replacedItemId ? '; the previous item returned to local inventory' : ''}.`);
        redirect(response, `/mines/${parts[2]}/equipment`);
      } else if (request.method === 'POST' && /^\/mines\/\d+\/equipment\/\d+\/unequip$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const parts = url.pathname.split('/');
        const itemId = unequipMine(player, catalog, Number(parts[2]), Number(parts[4]));
        store.savePlayer(player);
        setFlash(`${catalog.byId.get(itemId).name} returned to local inventory.`);
        redirect(response, `/mines/${parts[2]}/equipment`);
      } else if (request.method === 'POST' && /^\/mines\/\d+\/robots\/\d+\/assign$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const parts = url.pathname.split('/');
        const result = assignRobot(player, catalog, Number(parts[2]), Number(parts[4]));
        store.savePlayer(player);
        const robot = catalog.robotByItemId.get(Number(parts[4]));
        setFlash(`MR${robot.model} assigned${result.replacedItemId ? '; the previous robot returned to local inventory' : ''}.`);
        redirect(response, `/mines/${parts[2]}/equipment`);
      } else if (request.method === 'POST' && /^\/mines\/\d+\/robots\/unassign$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const mineId = Number(url.pathname.split('/')[2]);
        const itemId = unassignRobot(player, catalog, mineId);
        store.savePlayer(player);
        setFlash(`${catalog.byId.get(itemId).name} returned to local inventory.`);
        redirect(response, `/mines/${mineId}/equipment`);
      } else if (request.method === 'POST' && /^\/mines\/\d+\/detonate$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const mineId = Number(url.pathname.split('/')[2]);
        const form = await readForm(request);
        store.detonateMine(
          player.id, mineId, Number(form.itemId), Number(form.count), catalog, now(), random
        );
        redirect(response, `/mines/${mineId}/equipment?detonated=1`);
      } else if (request.method === 'POST' && /^\/mines\/\d+\/claim$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const mineId = Number(url.pathname.split('/')[2]);
        const claimingMine = player.mines.find((candidate) => candidate.id === mineId);
        const result = claimMine(player, catalog, mineId, now(), random);
        store.savePlayer(player, { source: 'mine', findings: result.finds, queuedAt: now() });
        const claimingType = catalog.mineTypes.find((candidate) => candidate.id === claimingMine?.mineTypeId);
        if (claimingMine?.mineThings === false && claimingType?.hasOre && result.finds.length) {
          store.awardStone(player.id, 'Extracted', now());
        }
        if (result.finds.length && claimingMine?.mineThings !== false) {
          const equipment = Object.values(claimingMine.equipment ?? {})
            .map((itemId) => {
              const entry = catalog.equipmentByItemId.get(Number(itemId));
              if (!entry) throw new Error(`Missing catalog mining equipment: ${itemId}.`);
              return entry;
            });
          if (equipment.length === catalog.equipmentTypes.length) {
            store.awardStone(player.id, 'Equipped', now());
            const rarities = new Set(equipment.map((entry) => entry.rarity));
            if (rarities.size === 1
              && equipment[0].rarity >= Number(catalog.settings.achievement_high_rarity_minimum)) {
              store.awardStone(player.id, 'Decked', now());
            }
          }
          const dwarf = catalog.dwarfByItemId.get(Number(claimingMine.robotItemId));
          if (dwarf?.rarity === Number(catalog.settings.dwarf_exploitation_rarity)) {
            store.awardStone(player.id, 'Exploited', now());
          }
        }
        const capturedTier = result.capturedDwarf
          ? catalog.dwarfByItemId.get(result.capturedDwarf.itemId) : null;
        if (capturedTier?.rarity === Number(catalog.settings.dwarf_exploitation_rarity)) {
          store.awardStone(player.id, 'Exploited', now());
        }
        const captureNote = result.capturedDwarf
          ? ` A ${catalog.byId.get(result.capturedDwarf.itemId).name} was caught and will now mine in this city. (${result.moonPhase})`
          : '';
        setFlash((result.gold
          ? `You mined ${formatGold(result.gold)}g!`
          : `You uncovered ${result.finds.length} ${result.finds.length === 1 ? 'thing' : 'things'}: ${describeFinds(result.finds, catalog)}!`) + captureNote);
        redirect(response, '/');
      } else if (request.method === 'POST' && /^\/mines\/\d+\/prioritize$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const mine = prioritizeMine(player, catalog, Number(url.pathname.split('/')[2]), now());
        store.savePlayer(player);
        const type = catalogMineTypeForId(catalog, mine.mineTypeId);
        setFlash(`${type.name} is now top priority.`);
        redirect(response, '/');
      } else if (request.method === 'POST' && /^\/mines\/\d+\/oil$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const mine = oilMineBot(player, catalog, Number(url.pathname.split('/')[2]), now());
        store.savePlayer(player);
        setFlash(`Bot oiled for ${formatDuration(Number(catalog.settings.mine_oil_duration_ms))}. It now mines ${formatGold(Number(catalog.settings.mine_oil_buckets_per_hour))} extra buckets per hour.`);
        redirect(response, '/');
      } else if (request.method === 'POST' && /^\/bot-parts\/\d+\/buy$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const part = store.buyBotPart(player.id, Number(url.pathname.split('/')[2]), now());
        setFlash(`${part.label} installed. All standard mines gain ${formatGold(part.bph)} buckets per hour.`);
        redirect(response, '/');
      } else if (request.method === 'POST' && /^\/mines\/\d+\/mode$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const mineId = Number(url.pathname.split('/')[2]);
        const form = await readForm(request);
        const mine = setMineMode(player, mineId, form.mineThings === '1');
        store.savePlayer(player);
        const type = catalogMineTypeForId(catalog, mine.mineTypeId);
        setFlash(mine.mineThings ? 'This mine will now uncover things.' : `This mine will now extract ${type.hasOre ? 'ore' : 'gold'}.`);
        redirect(response, '/');
      } else if (request.method === 'POST' && /^\/market\/factories\/(sale|rental)\/(listings|bids)$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const parts = url.pathname.split('/');
        const form = await readForm(request);
        const orderId = parts[4] === 'listings'
          ? store.placeFactorySellOrder(player.id, parts[3], form.price, form.quantity, now())
          : store.placeFactoryBuyOrder(player.id, parts[3], form.price, form.quantity, now());
        setFlash(`Factory ${parts[3]} ${parts[4] === 'listings' ? 'listing' : 'bid'} #${orderId} placed.`);
        redirect(response, `/market/factories/${parts[3]}`);
      } else if (request.method === 'POST' && /^\/market\/factory-orders\/\d+\/(cancel|buy|sell)$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const parts = url.pathname.split('/');
        const orderId = Number(parts[3]);
        if (parts[4] === 'cancel') {
          store.cancelFactoryMarketOrder(player.id, orderId);
          setFlash('Factory market order cancelled.');
        } else {
          const form = await readForm(request);
          const result = parts[4] === 'buy'
            ? store.buyFactoryListing(player.id, orderId, form.quantity, now())
            : store.sellFactoryToBid(player.id, orderId, form.quantity, now());
          setFlash(parts[4] === 'buy'
            ? `${result.marketType === 'rental' ? 'Rented' : 'Purchased'} ${result.quantity} factory${result.quantity === 1 ? '' : 's'} for ${formatGold(result.cost)}g.`
            : `${result.marketType === 'rental' ? 'Rented out' : 'Sold'} ${result.quantity} factory${result.quantity === 1 ? '' : 's'} for ${formatGold(result.proceeds)}g.`);
        }
        redirect(response, requestDestination(request, '/factories'));
      } else if (request.method === 'POST' && /^\/market\/mines\/\d+\/(listings|bids)$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const parts = url.pathname.split('/');
        const form = await readForm(request);
        const orderId = parts[4] === 'listings'
          ? store.placeMineSellOrder(player.id, Number(parts[3]), form.price, form.quantity, now())
          : store.placeMineBuyOrder(player.id, Number(parts[3]), form.price, form.quantity, now());
        setFlash(`${parts[4] === 'listings' ? 'Mine listing' : 'Mine bid'} #${orderId} placed.`);
        redirect(response, `/market/mines/${parts[3]}`);
      } else if (request.method === 'POST' && /^\/market\/mine-orders\/\d+\/(cancel|buy|sell)$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const parts = url.pathname.split('/');
        const orderId = Number(parts[3]);
        if (parts[4] === 'cancel') {
          store.cancelMineMarketOrder(player.id, orderId);
          setFlash('Mine market order cancelled.');
        } else {
          const form = await readForm(request);
          const result = parts[4] === 'buy'
            ? store.buyMineListing(player.id, orderId, form.quantity, now())
            : store.sellMineToBid(player.id, orderId, form.quantity, now());
          if (parts[4] === 'buy') store.awardStone(player.id, 'Invested', now());
          setFlash(parts[4] === 'buy'
            ? `Purchased ${result.quantity} mine${result.quantity === 1 ? '' : 's'} for ${formatGold(result.cost)}g.`
            : `Sold ${result.quantity} mine${result.quantity === 1 ? '' : 's'} for ${formatGold(result.proceeds)}g.`);
        }
        redirect(response, requestDestination(request, '/market'));
      } else if (request.method === 'POST' && /^\/market\/mines\/\d+\/buy$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const mineTypeId = Number(url.pathname.split('/')[3]);
        const mine = buyMine(player, catalog, mineTypeId, now(), random);
        store.savePlayer(player, {
          source: 'new-mine',
          findings: player.discoveries.filter((finding) => finding.mineId === mine.id),
          queuedAt: now()
        });
        store.awardStone(player.id, 'Invested', now());
        const type = catalog.mineTypes.find((candidate) => candidate.id === mine.mineTypeId);
        setFlash(`${type.name} Mine purchased with ${catalog.settings.starter_find_count} discoveries.`);
        redirect(response, '/');
      } else if (request.method === 'POST' && /^\/market\/mines\/\d+\/rent$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const mineTypeId = Number(url.pathname.split('/')[3]);
        const mine = rentMine(player, catalog, mineTypeId, now(), random);
        store.savePlayer(player, {
          source: 'new-mine',
          findings: player.discoveries.filter((finding) => finding.mineId === mine.id),
          queuedAt: now()
        });
        store.awardStone(player.id, 'Invested', now());
        const type = catalog.mineTypes.find((candidate) => candidate.id === mine.mineTypeId);
        setFlash(`${type.name} Mine rented for ${formatDuration(Number(catalog.settings.mine_rental_duration_ms))} with ${catalog.settings.starter_find_count} discoveries.`);
        redirect(response, '/');
      } else if (request.method === 'POST' && /^\/mines\/\d+\/sell$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const refund = sellMine(player, catalog, Number(url.pathname.split('/')[2]));
        store.savePlayer(player);
        setFlash(`Mine resold for ${refund} credits.`);
        redirect(response, '/');
      } else if (request.method === 'POST' && /^\/market\/containers\/\d+\/buy$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const container = store.buyContainer(player.id, Number(url.pathname.split('/')[3]));
        store.awardStone(player.id, 'Expanded', now());
        setFlash(`${container.name} purchased. Inventory capacity is now ${container.itemLimit}.`);
        redirect(response, '/market');
      } else if (request.method === 'POST' && url.pathname === '/market/battery-extension') {
        if (!requirePlayer()) return;
        const extension = store.extendBattery(player.id, now());
        setFlash(`Battery life extended by ${extension.days} days for ${extension.cost} credits.`);
        redirect(response, '/market');
      } else if (request.method === 'POST' && /^\/market\/items\/\d+\/(listings|bids)$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const parts = url.pathname.split('/');
        const item = catalog.byId.get(Number(parts[3]));
        if (!item) throw new Error('Item not found.');
        const form = await readForm(request);
        if (parts[4] === 'listings') {
          store.placeSellOrder(player.id, item.id, form.quantity, now());
          setFlash('Your listing is now on the local market.');
        } else {
          store.placeBuyOrder(player.id, item.id, form.quantity, now());
          setFlash('Your gold is reserved and your bid is now on the local market.');
        }
        redirect(response, `/market/items/${item.id}`);
      } else if (request.method === 'POST' && /^\/market\/orders\/\d+\/(cancel|buy|sell)$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const parts = url.pathname.split('/');
        const orderId = Number(parts[3]);
        const action = parts[4];
        if (action === 'cancel') {
          store.cancelMarketOrder(player.id, orderId);
          setFlash('Market order canceled and escrow returned.');
        } else {
          const form = await readForm(request);
          if (action === 'buy') {
            const cost = store.buyListing(player.id, orderId, form.quantity, now());
            setFlash(`Purchase complete for ${formatGold(cost)}g.`);
          } else {
            const proceeds = store.sellToBid(player.id, orderId, form.quantity, now());
            store.awardStone(player.id, 'Liquidated', now());
            setFlash(`Sale complete for ${formatGold(proceeds)}g.`);
          }
        }
        const destination = requestDestination(request, '/exchange');
        redirect(response, destination);
      } else if (request.method === 'POST' && /^\/inventory\/\d+\/list$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const itemId = Number(url.pathname.split('/')[2]);
        const item = catalog.byId.get(itemId);
        if (!item) throw new Error('Item not found.');
        const form = await readForm(request);
        const quantity = Number(form.quantity);
        store.placeSellOrder(player.id, itemId, quantity, now());
        setFlash(`${quantity} ${quantity === 1 ? 'thing is' : 'things are'} now listed on the local market at ${formatGold(localItemGoldValue(item, catalog, player.cityId))}g each.`);
        redirect(response, '/inventory');
      } else if (request.method === 'POST' && /^\/inventory\/\d+\/meld$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const itemId = Number(url.pathname.split('/')[2]);
        const result = store.stageMeldItem(player.id, itemId, now());
        if (!result.deposited) {
          setFlash(`${result.itemName} is not needed for any remaining meld.`);
        } else {
          const parts = [`${result.itemName} moved to capacity-free Meld storage.`];
          if (result.noMoreNeeded) {
            parts.push(`No more ${result.itemName} is needed for any remaining meld.`);
          }
          setQuietNotice(parts.join(' '));
          setMeldReveal(result.createdMelds);
        }
        redirect(response, '/inventory');
      } else if (request.method === 'POST' && url.pathname === '/inventory/refine-ore') {
        if (!requirePlayer()) return;
        const form = await readForm(request);
        const result = store.refineOreScraps(player.id, form.quantity);
        setFlash(`${result.scraps.toLocaleString('en-GB')} Ore scraps refined into ${result.ore.toLocaleString('en-GB')} Ore.`);
        redirect(response, '/inventory');
      } else if (request.method === 'POST' && /^\/inventory\/\d+\/recycle$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const itemId = Number(url.pathname.split('/')[2]);
        const form = await readForm(request);
        const result = store.recycleInventory(player.id, player.cityId, itemId, form.quantity, now());
        setFlash(`${result.quantity} ${result.quantity === 1 ? 'thing' : 'things'} recycled into ${result.scraps.toLocaleString('en-GB')} Ore scraps.`);
        redirect(response, '/inventory');
      } else if (request.method === 'GET' && url.pathname === '/api/state') {
        if (!requirePlayer()) return;
        response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(JSON.stringify({ player: { ...player, passwordHash: undefined }, findIntervalMs: catalog.settings.find_interval_ms }));
      } else {
        responseHtml(response, 404, layout('Not found', '<section class="page-title"><h1>That tunnel goes nowhere.</h1><a href="/">Return home</a></section>', player));
      }
    } catch (error) {
      const destination = requestDestination(request);
      if (request.method === 'GET' && destination === url.pathname) {
        responseRequestError(response, error, player);
      } else if (session) {
        setFlash(error.message);
        redirect(response, destination);
      } else {
        const statusCode = Number.isSafeInteger(error?.statusCode)
          && error.statusCode >= 400 && error.statusCode < 500 ? error.statusCode : 400;
        responseHtml(response, statusCode, layout('Try again', `<section class="error"><h1>Could not do that</h1><p>${escapeHtml(error.message)}</p><a href="/">Try again</a></section>`, null));
      }
    }
  });
  server.requestTimeout = requestTimeoutMs;
  // A process that cannot bind must never start a free-running simulation
  // worker against the shared database. This also makes repeated `npm start`
  // attempts exit cleanly after EADDRINUSE instead of becoming hidden writers.
  server.once('listening', startBackgroundMaintenance);
  server.headersTimeout = headersTimeoutMs;
  server.keepAliveTimeout = keepAliveTimeoutMs;
  server.maxRequestsPerSocket = 1000;
  const closeServer = server.close.bind(server);
  server.close = (callback) => {
    for (const client of liveClients) client.response.end();
    liveClients.clear();
    return closeServer(callback);
  };
  server.on('clientError', (error, socket) => {
    if (!socket.writable) return;
    const status = error.code === 'HPE_HEADER_OVERFLOW' ? '431 Request Header Fields Too Large'
      : '400 Bad Request';
    socket.end(`HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  });
  server.once('close', () => {
    liveUpdatesClosed = true;
    if (liveWakeTimer) clearTimeout(liveWakeTimer);
    unsubscribeLiveWake();
    if (liveDatabaseWatcher) liveDatabaseWatcher.close();
    clearInterval(liveHeartbeatTimer);
    if (maintenanceTimer) clearInterval(maintenanceTimer);
    if (maintenanceWorker) {
      const wasRunning = maintenanceRunning;
      maintenanceRunning = false;
      if (wasRunning) maintenanceWorker.postMessage({ type: 'close' });
      const forcedTermination = setTimeout(() => maintenanceWorker.terminate(), 1000);
      forcedTermination.unref();
      maintenanceWorker.once('exit', () => clearTimeout(forcedTermination));
    }
    if (ownsStore) store.close();
  });
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 3000);
  const host = process.env.HOST ?? '127.0.0.1';
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be a whole number between 1 and 65535.');
  }
  const server = createApp({ databaseFile: process.env.DATABASE_FILE });
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`${signal} received; finishing active requests.`);
    const forcedClose = setTimeout(() => server.closeAllConnections(), 10000);
    forcedClose.unref();
    server.close((error) => {
      clearTimeout(forcedClose);
      if (error) {
        console.error(`Shutdown failed: ${error.message}`);
        process.exitCode = 1;
      }
    });
    server.closeIdleConnections();
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
  server.on('error', (error) => {
    console.error(`MineThings server error: ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(port, host, () => console.log(`MineThings is running at http://${host}:${port}`));
}
