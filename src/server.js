import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import {
  activeMineLimit, assignRobot, buyMine, createPlayer,
  equipMine, mineBucketsPerHour, mineIntervalMs,
  mineRefundCredits, oilMineBot, prioritizeMine, rentMine, sellMine, setMineMode,
  unassignRobot, unequipMine
} from './game.js';
import { loadLegacyCatalog } from './legacy-catalog.js';
import { REGIONAL_CASINO_MACHINES, THING_O_MATIC_KEY } from './casino-machines.js';
import { machineIconSvg } from './item-icons.js';
import { mineMapIconPath, OIL_FIELD_MAP_ICON_PATH } from './mine-icons.js';
import { renderCityLandmarkArt } from './city-landmark-art.js';
import { renderDwarfParkArt } from './dwarf-park-art.js';
import {
  CITY_VEHICLE_REPAIR_DURATION_MS, FACTORY_QUEUE_MAX_JOBS, SHUTTLE_OIL_CATEGORY_ID, SqliteStore,
  hashPasswordAsync, verifyPasswordAsync
} from './store.js';
import { specialisationMultiplier } from './specialisations.js';
import { cryptoType, cryptoTypesForMap } from './crypto.js';
import { armsRarities, compatibleCargoAllowed } from './vehicle-combat.js';
import { LEGAL_VERSION, LEGAL_VERSIONS, sellerConfiguration } from './legal.js';
import { EmailClient, emailConfiguration, emailReadiness } from './email.js';
import {
  GoogleAuthClient, googleAuthConfiguration, googleAuthReadiness, googlePkceChallenge
} from './google-auth.js';
import { PreviewBindingRegistry } from './preview-bindings.js';
import {
  PayPalClient, paypalConfiguration, paypalOrderSummary, paypalReadiness
} from './paypal.js';
import {
  applyPendingDatabaseRestore, createDatabaseBackup, defaultBackupDirectory,
  deleteDatabaseBackup, listDatabaseBackups, pendingDatabaseRestore,
  stageDatabaseRestore, updateRepository
} from './database-backups.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_ROOT = path.join(ROOT, 'public');
const LEGACY_ROOT = path.join(ROOT, 'td', 'public_html', 'app', 'webroot');
const SVGJS_ROOT = path.join(ROOT, 'node_modules', '@svgdotjs', 'svg.js', 'dist');
const APP_CSS_VERSION = crypto.createHash('sha256')
  .update(fs.readFileSync(path.join(PUBLIC_ROOT, 'app.css')))
  .digest('hex').slice(0, 12);
const BOT_BUILD_COMIC_LINES = Object.freeze([
  Object.freeze({ shout: 'SPARK!',
    text: 'MineThings 2 is a pretty complicated game.', colour: '#f3c33b' }),
  Object.freeze({ shout: 'CLANK!',
    text: 'It starts slow. Speed it up by making Stones.', colour: '#6ee5ff' }),
  Object.freeze({ shout: 'SYSTEMS!',
    text: 'It is a socioeconomic simulation, really.', colour: '#ef8f2f' }),
  Object.freeze({ shout: 'SHINY!', text: 'With shinies.', colour: '#e8d55a' }),
  Object.freeze({ shout: 'MISCHIEF!',
    text: 'There is a lot of room for people behaving badly.', colour: '#d9513f' }),
  Object.freeze({ shout: 'TOGETHER!',
    text: 'And even more room for cooperation.', colour: '#71c777' }),
  Object.freeze({ shout: 'CARNAGE!',
    text: 'And outright aggression.', colour: '#e35943' }),
  Object.freeze({ shout: 'ARMOUR UP!',
    text: 'Stay safe out there. Be prepared.', colour: '#74a6c8' }),
  Object.freeze({ shout: 'FORTUNE!',
    text: 'Luck plays a part; but fortune favours the brave.', colour: '#d3a64d' }),
  Object.freeze({ shout: 'ROUTES!',
    text: 'A route is an invitation, a risk, and occasionally an ambush.', colour: '#5bc5bd' }),
  Object.freeze({ shout: 'PEOPLE!',
    text: 'The machines run alone. The world only works when people show up.', colour: '#ad80ca' }),
  Object.freeze({ shout: 'ALMOST ALIVE!',
    text: 'Decide what sort of miner the bot is waking up beside.', colour: '#f0a451' }),
  Object.freeze({ shout: 'IT LIVES!',
    text: 'Now make some history the Council cannot tidy away.', colour: '#8ed85f' })
]);
const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'], ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'], ['.gif', 'image/gif'], ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.ico', 'image/x-icon'],
  ['.svg', 'image/svg+xml; charset=utf-8'], ['.webp', 'image/webp'], ['.woff2', 'font/woff2']
]);
const STATIC_ASSET_CACHE_CONTROL = 'public, max-age=3600';
const IMAGE_CACHE_CONTROL = 'public, max-age=604800, stale-while-revalidate=86400';
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

const WEATHER_PRESENTATION = Object.freeze({
  clear: ['&#9728;', 'Clear'],
  cloud: ['&#9729;', 'Cloudy'],
  rain: ['&#127783;', 'Rain'],
  snow: ['&#10052;', 'Snow'],
  storm: ['&#9928;', 'Storm'],
  hurricane: ['&#127744;', 'Hurricane']
});

function weatherPresentation(condition) {
  return WEATHER_PRESENTATION[condition] ?? ['?', String(condition ?? 'Unknown')];
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

const CAPITAL_CITY_ICON = '★';

function isRegionalCapital(catalog, cityId) {
  const city = catalogCityForId(catalog, cityId);
  const map = catalog.maps.find((entry) => Number(entry.id) === Number(city.mapId));
  return Boolean(map && Number(map.capitalCityId) === Number(city.id));
}

function cityChoiceLabel(catalog, cityId) {
  const city = catalogCityForId(catalog, cityId);
  return isRegionalCapital(catalog, city.id)
    ? `${CAPITAL_CITY_ICON} ${city.name} · CAPITAL` : city.name;
}

function playerDiscoveredMapIds(player, catalog) {
  const knownCities = new Set((player.knownCityIds ?? []).map(Number));
  return new Set(catalog.cities.filter((city) => knownCities.has(Number(city.id)))
    .map((city) => Number(city.mapId)));
}

function vehicleRouteDestinationLabel(player, catalog, originCityId, destinationCityId) {
  const origin = catalogCityForId(catalog, originCityId);
  const destination = catalogCityForId(catalog, destinationCityId);
  if (Number(origin.mapId) === Number(destination.mapId)) {
    return cityChoiceLabel(catalog, destination.id);
  }
  if (!playerDiscoveredMapIds(player, catalog).has(Number(destination.mapId))) {
    return `${CAPITAL_CITY_ICON} Undiscovered regional capital · GATEWAY`;
  }
  const destinationMap = catalog.maps.find((map) => Number(map.id) === Number(destination.mapId));
  if (!destinationMap) throw new Error(`Missing map for city ${destination.id}.`);
  return `${destinationMap.name} / ${cityChoiceLabel(catalog, destination.id)} · GATEWAY`;
}

function vehicleJourneyRouteGraph(player, catalog, vehicle) {
  const routePolicy = vehicle.routePolicy ?? 'standard';
  if (!['standard', 'capital-link'].includes(routePolicy)) {
    throw new Error(`Unknown vehicle route policy ${routePolicy}.`);
  }
  const discoveredMapIds = playerDiscoveredMapIds(player, catalog);
  const legs = [];
  for (const route of catalog.routes) {
    if (!route.open || Number(route.type) !== Number(vehicle.routeType)
      || Number(route.city1Id) === Number(route.city2Id)) continue;
    if (routePolicy === 'capital-link'
      && (!route.interMap || !isRegionalCapital(catalog, route.city1Id)
        || !isRegionalCapital(catalog, route.city2Id))) continue;
    for (const [originCityId, destinationCityId] of [
      [route.city1Id, route.city2Id], [route.city2Id, route.city1Id]
    ]) {
      const origin = catalogCityForId(catalog, originCityId);
      if (Number(originCityId) !== Number(vehicle.cityId)
        && !discoveredMapIds.has(Number(origin.mapId))) continue;
      const destinationLabel = vehicleRouteDestinationLabel(
        player, catalog, originCityId, destinationCityId
      );
      legs.push({
        routeId: route.id, originCityId, destinationCityId,
        interMap: Boolean(route.interMap),
        label: `${destinationLabel} · ${Number(route.length).toLocaleString('en-GB')} km`
      });
    }
  }
  return legs.sort((first, second) => Number(first.originCityId) - Number(second.originCityId)
    || Number(first.interMap) - Number(second.interMap)
    || first.label.localeCompare(second.label) || Number(first.routeId) - Number(second.routeId));
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

function googleSignupCookie(id, secure = false) {
  return 'mt_google_signup=' + id + '; HttpOnly; SameSite=Lax; Path=/auth/google; '
    + (secure ? 'Secure; ' : '') + 'Max-Age=600';
}

function clearGoogleSignupCookie(secure = false) {
  return 'mt_google_signup=; HttpOnly; SameSite=Lax; Path=/auth/google; '
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

function normalizedIpAddress(value) {
  let address = String(value ?? '').trim().toLowerCase();
  const zoneIndex = address.indexOf('%');
  if (zoneIndex >= 0) address = address.slice(0, zoneIndex);
  if (address.startsWith('::ffff:') && net.isIP(address.slice(7)) === 4) {
    address = address.slice(7);
  }
  return net.isIP(address) ? address : null;
}

function clientNetworkAddress(request) {
  const direct = normalizedIpAddress(request.socket.remoteAddress);
  if (!direct) return null;
  const trustedLocalProxy = direct === '127.0.0.1' || direct === '::1';
  if (!trustedLocalProxy) return direct;
  const realAddress = normalizedIpAddress(request.headers['x-real-ip']);
  if (realAddress) return realAddress;
  const forwarded = String(request.headers['x-forwarded-for'] ?? '')
    .split(',').map((entry) => normalizedIpAddress(entry)).filter(Boolean);
  return forwarded.at(-1) ?? direct;
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
  cacheControl = null) {
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
      'Cache-Control': cacheControl ?? (contentType.startsWith('image/')
        ? IMAGE_CACHE_CONTROL
        : STATIC_ASSET_CACHE_CONTROL),
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
        <h3><a class="text-link" href="/melds/${meld.id}">${escapeHtml(meld.name)}</a></h3>
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

export function findingNoticeItems(findings, catalog, metadata = {}) {
  if (!Array.isArray(findings) || !findings.length) return [];
  const sourceNames = catalogObjectSetting(catalog, 'finding_source_names');
  const grouped = new Map();
  for (const finding of findings) {
    const eventIds = [finding.eventId, finding.event_id, ...(finding.eventIds ?? [])]
      .map(Number).filter((id) => Number.isSafeInteger(id) && id > 0);
    if (finding.cryptoTypeId) {
      const currency = cryptoType(finding.cryptoTypeId);
      if (!currency) throw new Error(`Missing crypto type: ${finding.cryptoTypeId}.`);
      const quantity = Math.max(1, Math.floor(Number(finding.quantity ?? finding.count ?? 1)));
      const cityId = finding.cityId ?? metadata.cityId ?? null;
      const source = String(finding.source ?? metadata.source ?? 'mine');
      const sourceName = finding.sourceName ?? sourceNames[source];
      if (typeof sourceName !== 'string') {
        throw new Error(`Missing finding source name: ${source}.`);
      }
      const status = String(finding.status ?? metadata.status
        ?? 'Added to your crypto things').trim();
      const key = `crypto:${currency.id}:${cityId ?? ''}:${source}:${status}`;
      const entry = grouped.get(key) ?? {
        itemId: `crypto-${currency.id}`, name: currency.name, icon: currency.icon,
        rarity: currency.id, rarityName: 'Crypto coin', quantity: 0,
        source, sourceName, cityId,
        cityName: cityId === null
          ? catalogSettingString(catalog, 'location_labels', 'atSea')
          : catalogCityForId(catalog, Number(cityId)).name,
        foundAt: Number(finding.foundAt ?? metadata.foundAt ?? Date.now()),
        autoRecycled: false, status, path: '/crypto', eventIds: []
      };
      entry.quantity += quantity;
      for (const eventId of eventIds) {
        if (!entry.eventIds.includes(eventId)) entry.eventIds.push(eventId);
      }
      entry.foundAt = Math.max(entry.foundAt,
        Number(finding.foundAt ?? metadata.foundAt ?? entry.foundAt));
      grouped.set(key, entry);
      continue;
    }
    const item = catalogItemForId(catalog, Number(finding.itemId), 'finding notice');
    const quantity = Math.max(1, Math.floor(Number(
      finding.quantity ?? finding.count ?? 1
    )));
    const cityId = finding.cityId ?? metadata.cityId ?? null;
    const source = finding.capturedDwarf
      ? 'dwarf-capture' : String(finding.source ?? metadata.source ?? 'mine');
    const sourceName = finding.sourceName ?? sourceNames[source];
    if (typeof sourceName !== 'string') {
      throw new Error(`Missing finding source name: ${source}.`);
    }
    const autoRecycled = Boolean(finding.recycled ?? finding.autoRecycled);
    const status = String(finding.status ?? metadata.status ?? '').trim();
    const key = `${item.id}:${cityId ?? ''}:${source}:${autoRecycled ? 1 : 0}:${status}`;
    const entry = grouped.get(key) ?? {
      itemId: item.id, name: item.name, icon: item.icon,
      rarity: item.rarity, rarityName: item.rarityName, quantity: 0,
      source, sourceName, cityId,
      cityName: cityId === null
        ? catalogSettingString(catalog, 'location_labels', 'atSea')
        : catalogCityForId(catalog, Number(cityId)).name,
      foundAt: Number(finding.foundAt ?? metadata.foundAt ?? Date.now()),
      autoRecycled, status, path: `/items/${item.id}`, eventIds: []
    };
    entry.quantity += quantity;
    for (const eventId of eventIds) {
      if (!entry.eventIds.includes(eventId)) entry.eventIds.push(eventId);
    }
    entry.foundAt = Math.max(entry.foundAt, Number(finding.foundAt ?? entry.foundAt));
    grouped.set(key, entry);
  }
  return [...grouped.values()].sort((first, second) =>
    second.rarity - first.rarity || first.name.localeCompare(second.name));
}

function findingNoticeListHtml(items) {
  return items.map((item) => {
    const status = item.status || (item.autoRecycled
      ? 'Auto-recycled into Ore scraps' : 'Added to your things');
    const itemKey = [String(item.itemId), Number(item.rarity), item.sourceName,
      item.cityName, status].join('|');
    const eventIds = (item.eventIds ?? []).map(Number)
      .filter((id) => Number.isSafeInteger(id) && id > 0).join(',');
    const eventIdsAttribute = eventIds
      ? ` data-finding-event-ids="${escapeHtml(eventIds)}"` : '';
    return `<li class="flash-item rarity-${Number(item.rarity)}" data-item-id="${escapeHtml(String(item.itemId))}" data-item-key="${escapeHtml(itemKey)}" data-quantity="${Number(item.quantity)}"${eventIdsAttribute}><a class="flash-item-link" href="${escapeHtml(item.path)}"><img src="${escapeHtml(item.icon)}" alt=""><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.rarityName)} · ${escapeHtml(item.sourceName)} · ${escapeHtml(item.cityName)} · ${status}</small></span><b aria-label="Quantity ${Number(item.quantity).toLocaleString('en-GB')}">×${Number(item.quantity).toLocaleString('en-GB')}</b></a></li>`;
  }).join('');
}

export function botBuildComicNotice(part, createdAt) {
  const step = Number(part?.botPartNumber);
  const total = Number(part?.botPartTotal);
  if (!Number.isSafeInteger(step) || step < 1 || step > BOT_BUILD_COMIC_LINES.length
    || !Number.isSafeInteger(total) || total < step) return null;
  const line = BOT_BUILD_COMIC_LINES[step - 1];
  return {
    noticeKey: `bot-part:${step}:${Number(createdAt)}`,
    step,
    total,
    partLabel: String(part.label),
    bph: Number(part.bph),
    botCompleted: Boolean(part.botCompleted),
    stoneName: part.stone?.name ? String(part.stone.name) : '',
    ...line
  };
}

function layout(title, content, player, flash) {
  const isLandingPage = !player && title === 'Home';
  const documentTitle = isLandingPage
    ? 'MineThings 2 · The world digs back'
    : `${escapeHtml(title)} · MineThings 2`;
  const description = isLandingPage
    ? 'MineThings 2 revives the persistent mining, trading and social experiment that began in 2009. Stake your claim and help write its next chapter.'
    : 'MineThings 2 is a persistent world of automatic mines, local markets, dangerous routes and player-made history.';
  const currentPath = player?.currentPath ?? '';
  const isCurrent = (prefixes, exact = false) => prefixes.some((prefix) => exact
    ? currentPath === prefix : currentPath === prefix || currentPath.startsWith(`${prefix}/`));
  const currentAttribute = (prefixes, exact = false) => isCurrent(prefixes, exact)
    ? ' aria-current="page"' : '';
  const unseenLabel = (label, count) => {
    const total = Math.max(0, Number(count) || 0);
    return `${label}${total ? ` (${total.toLocaleString('en-GB')})` : ''}`;
  };
  const primaryLinks = [
    ['home', '/', 'Mines', ['/', '/mines'], false],
    ['things', '/inventory', 'Things', ['/inventory', '/items', '/dwarves', '/gadgets', '/melds', '/containers'], false],
    ['markets', '/exchange', 'Markets', ['/exchange', '/market'], false],
    ['map', '/map', 'World map', ['/map', '/cities'], false],
    ['explore', '/explore', 'Explore', ['/explore'], false],
    ['fleet', '/vehicles', 'Fleet', ['/vehicles', '/ratings', '/battles', '/ammo-boxes'], false],
    ['events', '/events', 'World events', ['/events'], false],
    ['chat', '/chat', unseenLabel('Chat', player?.unseenChatMessages), ['/chat'], false],
    ['casino', '/casino', 'Casino', ['/casino'], false],
    ['guilds', '/guilds', unseenLabel('Guilds', player?.unseenGuildChatMessages), ['/guilds'], false],
    ['messages', '/messages', `Messages${player?.unreadMessages ? ` (${player.unreadMessages})` : ''}`, ['/messages'], false]
  ];
  const playerNavigation = primaryLinks.map(([className, href, label, prefixes, exact], index) =>
    `<li class="${className}"><a class="text-link" href="${href}"${currentAttribute(prefixes, exact)}><span aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>${label}</a></li>`
  ).join('');
  const guestCurrent = (pageTitle) => title === pageTitle ? ' aria-current="page"' : '';
  const topNavigation = player
    ? `<nav id="navcontainer" aria-label="Primary"><ul id="nav">${playerNavigation}</ul></nav>`
    : `<nav id="navcontainer" class="guest-primary-nav" aria-label="Public"><ul id="nav"><li class="city-name"><span>Archive status</span><strong>World online</strong></li><li><a class="text-link" href="/history"${guestCurrent('History')}><span aria-hidden="true">01</span>History</a></li><li><a class="text-link" href="/legal"${guestCurrent('Legal')}><span aria-hidden="true">02</span>Legal</a></li><li><a class="text-link" href="/#returning-miner"><span aria-hidden="true">03</span>Log in</a></li><li><a class="text-link" href="/#join"><span aria-hidden="true">04</span>Stake a claim</a></li></ul></nav>`;
  const playerMeldCount = Number(player?.meldCount ?? player?.meldIds?.length ?? 0);
  const playerChatColor = /^[0-9a-f]{6}$/i.test(String(player?.effectiveChatColor ?? ''))
    ? String(player.effectiveChatColor).toLowerCase() : '55666b';
  const login = player ? `<div id="login" class="player-status"><a class="player-identity" href="/miners/${encodeURIComponent(player.name)}"><span>Miner</span><strong>${escapeHtml(player.name)}</strong></a><dl class="player-vitals"><div class="player-meld-vital" style="--miner-chat-color:#${playerChatColor}"><dt>Melds</dt><dd>${playerMeldCount.toLocaleString('en-GB')}</dd></div><div><dt>Gold</dt><dd>${formatGold(player.gold)}g</dd></div><div><dt>Credits</dt><dd>${player.credits}c</dd></div><div><dt>Battery</dt><dd>${formatDuration(player.batteryRemaining ?? 0)}</dd></div></dl><form method="post" action="/logout"><button class="logout-button">Log out <span aria-hidden="true">↗</span></button></form></div>`
    : '<div id="login" class="guest-actions"><a class="text-link" href="/#returning-miner">Log in</a><a class="button" href="/#join">Stake your claim</a></div>';
  const sideLink = (href, label, prefixes = [href], exact = false) => {
    const active = isCurrent(prefixes, exact);
    return `<li${active ? ' class="current"' : ''}><a class="text-link" href="${href}"${active ? ' aria-current="page"' : ''}>${label}</a></li>`;
  };
  const countedSideLabel = (label, countKey) => {
    const count = Number(player?.cityOperationCounts?.[countKey] ?? 0);
    return `${label} (${count.toLocaleString('en-GB')})`;
  };
  const sideGroup = (label, links) => `<section class="side-nav-group"><h2>${label}</h2><ul>${links.join('')}</ul></section>`;
  const [weatherIcon, weatherLabel] = weatherPresentation(player?.weather?.condition);
  const sidebarWeather = player?.weather
    ? `<div class="sidebar-location-value sidebar-weather"><span>Weather</span> <a class="text-link" href="/events" aria-label="Weather: ${escapeHtml(weatherLabel)}"><span class="sidebar-weather-icon" aria-hidden="true">${weatherIcon}</span><span>${escapeHtml(weatherLabel)}</span></a></div>`
    : '';
  const sidebarCapitalIcon = player
    && Number(player.cityId) === Number(player.currentRegionCapitalCityId)
    ? `<span class="capital-city-icon" title="Regional capital" aria-label="Regional capital">${CAPITAL_CITY_ICON}</span>` : '';
  const sideNavigation = player ? `<aside id="left" aria-label="Player navigation"><button id="player-nav-toggle" class="sidebar-toggle" type="button" aria-expanded="false" aria-controls="player-nav-panel"><span>Game menu</span><strong>All operations</strong><b aria-hidden="true">+</b></button><div id="player-nav-panel"><div class="sidebar-context"><p class="sidebar-location-heading">You are here:</p><div class="sidebar-location-value"><span>Region</span> <a class="text-link" href="/map?world=${encodeURIComponent(player.mapSlug)}">${escapeHtml(player.mapName)}</a></div><div class="sidebar-location-value"><span>City</span> <a class="text-link" href="/map?world=${encodeURIComponent(player.mapSlug)}#city-${player.cityId}">${sidebarCapitalIcon}${escapeHtml(player.cityName)}</a></div>${sidebarWeather}<a class="sidebar-map-link" href="/map">Open world map <span aria-hidden="true">→</span></a></div><nav id="navlist" aria-label="Game sections">
    ${sideGroup('Extraction', [sideLink('/', countedSideLabel('Mines', 'mines'), ['/'], true), sideLink('/inventory', countedSideLabel('Things', 'things'), ['/inventory', '/items']), sideLink('/dwarves', countedSideLabel('Dwarves', 'dwarves')), sideLink('/gadgets', countedSideLabel('Gadgets', 'gadgets')), sideLink('/melds', countedSideLabel('Melds', 'melds'))])}
    ${sideGroup('Industry', [sideLink('/vehicles', countedSideLabel('Fleet', 'fleet')), sideLink('/factories', countedSideLabel('Factories', 'factories')), sideLink('/mills', countedSideLabel('Mills', 'mills')), sideLink('/oil-field', countedSideLabel('Oil Field', 'oilFields')), sideLink('/containers', 'Containers'), sideLink('/market', 'Mine shop', ['/market'], true)])}
    ${sideGroup('World', [sideLink('/explore', 'Explore city'), sideLink('/exchange', 'Markets', ['/exchange', '/market/items', '/market/mines', '/market/factories']), sideLink('/crypto', 'Crypto Exchange'), sideLink('/map', 'World map', ['/map', '/cities']), sideLink('/events', 'World events')])}
    ${sideGroup('Network', [sideLink('/chat', unseenLabel('Chat', player.unseenChatMessages)), sideLink('/casino', 'Casino'), sideLink('/guilds', unseenLabel('Guilds', player.unseenGuildChatMessages)), sideLink('/messages', `Messages${player.unreadMessages ? ` (${player.unreadMessages})` : ''}`), sideLink('/miners', `Miners (${Number(player.minerCount).toLocaleString('en-GB')})`, ['/miners'], true), sideLink('/ratings', 'Ratings')])}
    ${sideGroup('Miner', [sideLink('/professions', 'Specialisation'), sideLink(`/miners/${encodeURIComponent(player.name)}`, 'Profile', [`/miners/${encodeURIComponent(player.name)}`], true), sideLink('/account', 'Account'), sideLink('/stats', 'Server stats'), sideLink('/guide', 'Field guide'), sideLink('/credits', 'Buy credits')])}
    ${player.authority > 0 ? sideGroup('Command', [sideLink('/admin', 'Administration')]) : ''}
  </nav></div></aside>` : '';
  const foundItems = Array.isArray(player?.findingNotice?.items)
    ? player.findingNotice.items : [];
  const foundQuantity = foundItems.reduce((sum, item) => sum + Number(item.quantity), 0);
  const noticeMessage = foundItems.length
    ? player?.findingNotice?.message
      ?? `${foundQuantity.toLocaleString('en-GB')} ${foundQuantity === 1 ? 'thing' : 'things'} found and processed.`
    : flash ?? '';
  const noticeKey = player?.findingNotice?.noticeKey ?? (flash ? `flash:${flash}` : '');
  const noticeTitle = foundItems.length
    ? player?.findingNotice?.title ?? 'Things found' : 'Update';
  const flashDialog = `<aside id="flash-dialog" class="flash-notice" hidden aria-labelledby="flash-dialog-title" data-notice-key="${escapeHtml(noticeKey)}"><header><span class="flash-notice-mark" aria-hidden="true">${foundItems.length ? '✦' : '✓'}</span><strong id="flash-dialog-title">${escapeHtml(noticeTitle)}</strong><button type="button" aria-label="Dismiss notification">×</button></header><p id="flash-dialog-message" role="status" aria-live="polite">${escapeHtml(noticeMessage)}</p><ul id="flash-dialog-items" class="flash-item-list" aria-label="${foundItems.length ? 'Items found' : 'Notification details'}">${findingNoticeListHtml(foundItems)}</ul></aside><script src="/node/flash-modal.js?v=20260831c" defer></script>`;
  const botBuildNotice = player?.botBuildNotice ?? null;
  const botBuildProgress = botBuildNotice
    ? `Part ${botBuildNotice.step} of ${botBuildNotice.total}` : '';
  const botBuildInstall = botBuildNotice
    ? `${botBuildNotice.partLabel} installed · +${formatGold(botBuildNotice.bph)} buckets/hr${
      botBuildNotice.botCompleted
        ? ` · ${botBuildNotice.stoneName || 'Assembled'} Stone cleared` : ''}`
    : '';
  const botBuildBurst = player
    ? `<aside id="bot-build-burst" class="city-street-burst bot-build-burst" data-active="${botBuildNotice ? '1' : '0'}" data-notice-key="${escapeHtml(botBuildNotice?.noticeKey ?? '')}" data-step="${Number(botBuildNotice?.step ?? 0)}" style="--bot-burst-colour:${escapeHtml(botBuildNotice?.colour ?? '#f3c33b')}" role="alertdialog" aria-live="assertive" aria-labelledby="bot-build-burst-shout" aria-describedby="bot-build-burst-text" hidden><button type="button" class="bot-build-burst-close" aria-label="Dismiss bot-building message">×</button><small id="bot-build-burst-progress" class="bot-build-burst-progress">${escapeHtml(botBuildProgress)}</small><strong id="bot-build-burst-shout">${escapeHtml(botBuildNotice?.shout ?? '')}</strong><span id="bot-build-burst-text">${escapeHtml(botBuildNotice?.text ?? '')}</span><small id="bot-build-burst-install" class="bot-build-burst-install">${escapeHtml(botBuildInstall)}</small></aside><script src="/node/bot-build-burst.js?v=20260902a" defer></script>`
    : '';
  const quietNotice = player?.quietNotice
    ? `<p class="quiet-notice" role="status"><span aria-hidden="true">✓</span> ${escapeHtml(player.quietNotice)}</p>` : '';
  const welcomeMail = player?.registrationWelcomeMail;
  const welcomeMailPrompt = welcomeMail
    ? `<aside class="starter-mail-prompt" role="dialog" aria-labelledby="starter-mail-title" aria-describedby="starter-mail-summary"><div class="starter-mail-seal" aria-hidden="true"><span>✉</span></div><div><p class="eyebrow">Incoming Council transmission</p><h2 id="starter-mail-title">You've got mail</h2><p id="starter-mail-summary">An official notice from <strong>${escapeHtml(welcomeMail.senderName)}</strong> is waiting. It concerns your sentence, dissolved estate, and new equipment.</p><div class="starter-mail-actions"><form method="post" action="/messages/welcome/ignore"><input type="hidden" name="messageId" value="${welcomeMail.id}"><button class="secondary">Ignore</button></form><a class="button" href="/messages/view/${welcomeMail.id}">Read message</a></div></div></aside>`
    : '';
  const meldDialog = meldRevealHtml(player?.meldReveal);
  const liveRevision = typeof player?.liveUpdateRevision === 'function'
    ? player.liveUpdateRevision() : Number(player?.liveUpdateRevision ?? 0);
  const liveUpdates = player
    ? `<script src="/node/live-updates.js?v=20260904a" data-live-revision="${Number(liveRevision)}" defer></script>` : '';
  const maintenanceNotice = player?.maintenanceNotice ?? null;
  const maintenanceBanner = player
    ? `<aside id="maintenance-banner" class="maintenance-banner" role="status" aria-live="assertive" data-shutdown-at="${Number(maintenanceNotice?.shutdownAt ?? 0)}"${maintenanceNotice ? '' : ' hidden'}><span class="maintenance-banner-mark" aria-hidden="true">!</span><div><strong>Maintenance shutdown <span data-maintenance-countdown>${escapeHtml(maintenanceNotice?.countdownLabel ?? '')}</span></strong><p data-maintenance-message>${escapeHtml(maintenanceNotice?.message ?? '')}</p></div></aside>`
    : '';
  const shellClass = isLandingPage ? 'landing-shell' : `game-shell${player ? ' authenticated-shell' : ' public-shell'}`;
  const bodyClass = isLandingPage ? 'landing-body' : `game-body${player ? ' authenticated-body' : ' public-body'}`;
  const wordmark = `<a id="logo" class="site-wordmark" href="/" aria-label="MineThings 2 home"><span class="site-mark" aria-hidden="true"></span><span><strong>Mine Things</strong><small>The world digs back</small></span><b aria-hidden="true">2</b></a>`;
  const footer = `<footer class="site-footer"><div class="footer-brand"><span class="site-mark" aria-hidden="true"></span><div><strong>MineThings 2</strong><span>Persistent since 2009. Reborn in 2026.</span></div></div><p>The patient economic and social experiment, alive again.</p><nav aria-label="Footer"><a class="text-link" href="/history">History</a><a class="text-link" href="/legal">Legal</a><a class="text-link" href="/guide">Field guide</a></nav></footer>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="${description}"><meta name="theme-color" content="#0b0d0c"><title>${documentTitle}</title><link rel="icon" href="/node/favicon.svg" type="image/svg+xml"><link rel="stylesheet" href="/app.css?v=${APP_CSS_VERSION}"></head><body class="${bodyClass}"><a class="skip-link" href="#content">Skip to main content</a>${maintenanceBanner}<div id="wrapper" class="node-wrapper ${shellClass}"><header class="game-header">${wordmark}${login}</header>${topNavigation}<div id="divwrapper" class="node-content-wrap${player ? '' : ' guest-content'}">${sideNavigation}<main id="content" tabindex="-1">${quietNotice}${content}</main></div>${footer}</div>${flashDialog}${botBuildBurst}${meldDialog}${welcomeMailPrompt}${liveUpdates}${player ? '<script src="/node/navigation.js?v=20260823a" defer></script>' : ''}</body></html>`;
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
    <a class="item-card-link thing-link rarity-${item.rarity}" href="${escapeHtml(href)}" aria-label="View ${escapeHtml(item.name)} details">
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

function combatStatsPanel(stats, context = 'Current combat state') {
  if (!stats) return '';
  const entries = [
    ['attack', 'Base attack', stats.attack, 'Always applied'],
    ['armor', 'Armour', stats.armor, 'Damage buffer'],
    ['offense', 'Aggressive', stats.offense, 'Pillaging power'],
    ['defense', 'Defensive', stats.defense, 'Patrolling power'],
    ['dodge', 'Dodge', stats.dodge, 'Avoidance']
  ];
  return `<section class="combat-stat-board" aria-label="${escapeHtml(context)}"><header><strong>Combat state</strong><span>${escapeHtml(context)}</span></header><dl>${entries.map(([key, label, value, note]) => `<div data-combat-stat="${key}"><dt>${label}</dt><dd><strong>${escapeHtml(signedStat(value))}</strong><small>${note}</small></dd></div>`).join('')}</dl></section>`;
}

function cleanLegacyText(value) {
  return String(value ?? '').replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function cleanLegacyMultilineText(value) {
  return String(value ?? '')
    .replace(/<br\s*\/?>/giu, '\n')
    .replace(/<[^>]+>/gu, ' ')
    .split(/\r?\n/gu)
    .map((line) => line.replace(/\s+/gu, ' ').trim())
    .filter(Boolean)
    .join('\n');
}

function playerFacingItemDescription(item, catalog) {
  const intactItem = item.repairedItemId ? catalog.byId.get(item.repairedItemId) : item;
  if (!intactItem || !catalog.dwarfByItemId.has(intactItem.id)) return item.description;
  return String(item.description ?? '')
    .replace(/\s*After each find this [^.]+ has a [\d.]+% chance to disappear\.\s*/giu, ' ')
    .replace(/ after a random delay of 0(?:â€“|–|-)1 minute/giu, '')
    .replace(/\s+/gu, ' ')
    .trim();
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
    coreRows.push({ label: 'Intact counterpart', html: `<a class="thing-link rarity-${intactItem.rarity}" href="/items/${intactItem.id}">${escapeHtml(intactItem.name)}</a>` });
  } else if (damagedItem) {
    coreRows.push({ label: 'Damaged counterpart', html: `<a class="thing-link rarity-${damagedItem.rarity}" href="/items/${damagedItem.id}">${escapeHtml(damagedItem.name)}</a>` });
  }

  const gameplayRows = [];
  if (vehicle) {
    gameplayRows.push(
      { label: 'Route type', value: catalogLabel(catalog, 'route_type', vehicle.routeType) },
      { label: 'Speed', value: vehicle.speed },
      { label: 'Capacity', value: vehicle.capacity }
    );
    if (vehicle.land) gameplayRows.push(
      { label: 'Base attack', value: vehicle.land.attack },
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
    { label: 'Aggressive power', value: weapon.offense },
    { label: 'Defensive power', value: weapon.defense }
  );
  if (mod) gameplayRows.push(
    { label: 'Capacity modifier', value: signedStat(mod.capacity) },
    { label: 'Base attack modifier', value: signedStat(mod.attack) },
    { label: 'Armor modifier', value: signedStat(mod.armor) },
    { label: 'Aggressive power modifier', value: signedStat(mod.offense) },
    { label: 'Defensive power modifier', value: signedStat(mod.defense) },
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
      { label: 'Find quality', value: findQuality },
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

function landingPage(catalog, googleLoginEnabled = false) {
  const nameMinimum = Number(catalog.settings.miner_name_min_length);
  const nameMaximum = Number(catalog.settings.miner_name_max_length);
  const passwordMinimum = Number(catalog.settings.password_min_length);
  const welcomePack = starterWelcomePackDetails(catalog);
  const googleSignInButton = '<a class="landing-google-button" href="/auth/google"><img src="/node/google-sign-in.png" width="360" height="80" alt="Sign in with Google"></a>';
  return `<div class="rebirth-landing">
    <header class="landing-masthead">
      <a class="landing-wordmark" href="/" aria-label="MineThings 2 home"><span class="landing-mark" aria-hidden="true"></span><span><strong>Mine Things</strong><small>Second life · same strange world</small></span><b aria-hidden="true">2</b></a>
      <nav class="landing-nav" aria-label="Welcome"><a class="text-link" href="/history">Our history</a><a class="text-link" href="#returning-miner">Log in</a><a class="landing-nav-cta" href="#join">Stake your claim</a></nav>
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
      <div class="landing-map-frame"><img src="/node/maps/aso.png" alt="Map of Aso showing its five connected cities"><p><span>Aso world map</span><strong>Distance creates opportunity.</strong></p></div>
      <ul class="landing-world-principles"><li><strong>Dig weird.</strong><span>Thousands of things, from useful machinery to glorious nonsense.</span></li><li><strong>Trade smart.</strong><span>Player markets turn location and rarity into a living economy.</span></li><li><strong>Travel prepared.</strong><span>Customise transports, carry cargo and survive what waits between cities.</span></li><li><strong>Change the story.</strong><span>Factories, professions, chat and world events make every miner consequential.</span></li></ul>
    </section>

    <section id="join" class="landing-join" aria-labelledby="landing-join-title">
      <header class="landing-join-intro"><p class="landing-section-label">The next chapter needs miners</p><h2 id="landing-join-title">Stake a claim in internet history.</h2><p>Choose a name, verify your email and start digging. Your welcome pack includes a ${escapeHtml(welcomePack.color)} ${escapeHtml(welcomePack.vehicle.name)}, a ${escapeHtml(welcomePack.dwarf.name)}, ${welcomePack.gadgets.map((gadget) => escapeHtml(gadget.name)).join(', ')}, complimentary ${welcomePack.rentalMineTypes.map((mineType) => `${escapeHtml(mineType.name)} Mine`).join(' and ')} rentals, ${welcomePack.cryptoQuantity} ${escapeHtml(welcomePack.currency.symbol)} and a ${welcomePack.casinoVoucherQuantity} ${escapeHtml(welcomePack.voucherCurrency.symbol)} casino voucher.</p><ul><li>Persistent mining</li><li>Player-run markets</li><li>Connected worlds</li><li>Live events</li></ul></header>
      <div class="landing-auth-grid">
        <form class="landing-auth-card landing-register-card" method="post" action="/register" aria-labelledby="landing-register-title">
          <p class="landing-card-label"><span>01</span> New miner</p><h3 id="landing-register-title">Enter the world</h3><p>Your name will be part of the economy—and perhaps its history.</p>
          ${googleLoginEnabled ? `${googleSignInButton}<p class="landing-google-note">New here? Google verifies your email first, then you choose your unique miner name.</p><div class="landing-auth-divider"><span>or register with email</span></div>` : ''}
          <label><span>Miner name</span><input name="name" minlength="${nameMinimum}" maxlength="${nameMaximum}" pattern="[\\p{L}\\p{M}\\p{N}\\p{P}\\p{S} ]+" autocomplete="username" aria-describedby="miner-name-help" required></label><small id="miner-name-help">${nameMinimum}–${nameMaximum} characters. Unicode names are welcome.</small>
          <label><span>Email</span><input type="email" name="email" maxlength="${Number(catalog.settings.email_max_length)}" autocomplete="email" aria-describedby="miner-email-help" required></label><small id="miner-email-help">Verification is mandatory. Your mine remains locked until you confirm this address.</small>
          <label><span>Password</span><input type="password" name="password" minlength="${passwordMinimum}" autocomplete="new-password" required></label>
          <label class="check-row"><input type="checkbox" name="acceptTerms" value="1" required><span>I accept the <a class="text-link" href="/legal" target="_blank" rel="noopener">Terms and Privacy Notice</a> (version ${LEGAL_VERSION}).</span></label>
          <button class="landing-submit">Create my miner <span aria-hidden="true">→</span></button>
        </form>
        <form id="returning-miner" class="landing-auth-card landing-login-card" method="post" action="/login" aria-labelledby="landing-login-title">
          <p class="landing-card-label"><span>02</span> Returning miner</p><h3 id="landing-login-title">The mine kept working.</h3><p>Come back and see what surfaced while you were gone.</p>
          <label><span>Miner name</span><input name="name" autocomplete="username" required></label>
          <label><span>Password</span><input type="password" name="password" autocomplete="current-password" required></label>
          <button class="landing-submit">Return to my mine <span aria-hidden="true">→</span></button>
          ${googleLoginEnabled ? `<div class="landing-auth-divider"><span>or</span></div>${googleSignInButton}` : ''}
          <p class="landing-login-note">No daily streaks. No energy panic. MineThings was built for patient obsession.</p>
        </form>
      </div>
    </section>
  </div>`;
}

function starterWelcomePackDetails(catalog) {
  const pack = catalog.settings.starter_welcome_pack;
  const vehicle = catalog.byId.get(Number(pack.vehicleItemId));
  const dwarf = catalog.byId.get(Number(pack.dwarfItemId));
  const gadgets = pack.gadgetItemIds.map((itemId) => catalog.byId.get(Number(itemId)));
  const rentalMineTypes = pack.rentalMineTypeIds.map((mineTypeId) =>
    catalog.mineTypes.find((mineType) => mineType.id === Number(mineTypeId)));
  const currency = cryptoType(pack.cryptoTypeId);
  const voucherCurrency = cryptoType(pack.casinoVoucherCryptoTypeId);
  const color = catalog.settings.rarity_color_names[vehicle.rarity].toLowerCase();
  return {
    vehicle, dwarf, gadgets, rentalMineTypes, currency, voucherCurrency, color,
    cryptoQuantity: Number(pack.cryptoQuantity),
    casinoVoucherQuantity: Number(pack.casinoVoucherQuantity)
  };
}

function googleRegistrationPage(profile, catalog) {
  const nameMinimum = Number(catalog.settings.miner_name_min_length);
  const nameMaximum = Number(catalog.settings.miner_name_max_length);
  const passwordMinimum = Number(catalog.settings.password_min_length);
  const suggestedName = normalizeMinerName(profile.name).slice(0, nameMaximum);
  return `<div class="oauth-registration-shell"><form class="landing-auth-card oauth-registration-card" method="post" action="/auth/google/register" aria-labelledby="google-registration-title">
    <p class="landing-card-label"><span>Google</span> New miner</p>
    <h1 id="google-registration-title">Choose your miner name</h1>
    <p>Google verified <strong>${escapeHtml(profile.email)}</strong>. Finish creating your MineThings identity.</p>
    <label><span>Miner name</span><input name="name" value="${escapeHtml(suggestedName)}" minlength="${nameMinimum}" maxlength="${nameMaximum}" pattern="[\\p{L}\\p{M}\\p{N}\\p{P}\\p{S} ]+" autocomplete="username" required></label>
    <small>${nameMinimum}–${nameMaximum} visible characters. This is the name other miners will see.</small>
    <label><span>Backup password</span><input type="password" name="password" minlength="${passwordMinimum}" autocomplete="new-password" required></label>
    <small>You can normally use Google; this password also keeps local sign-in available.</small>
    <label class="check-row"><input type="checkbox" name="acceptTerms" value="1" required><span>I accept the <a class="text-link" href="/legal" target="_blank" rel="noopener">Terms and Privacy Notice</a> (version ${LEGAL_VERSION}).</span></label>
    <button class="landing-submit">Create my miner <span aria-hidden="true">→</span></button>
    <a class="oauth-cancel-link" href="/">Cancel and return home</a>
  </form></div>`;
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
  const maximumActiveMines = activeMineLimit(player, catalog, now);
  const localMines = player.mines.filter((mine) => mine.cityId === player.cityId);
  const displayedMineIds = new Set(localMines.map((mine) => mine.id));
  const recent = player.discoveries.filter((entry) => displayedMineIds.has(entry.mineId))
    .slice(0, Number(catalog.settings.home_recent_discovery_limit))
    .map((entry) => catalogItemForId(catalog, entry.itemId, 'recent discovery'))
    .sort(compareItemsByRarity).map((item) => itemCard(item)).join('');
  const mines = localMines.map((mine) => {
    const type = catalogMineTypeForId(catalog, mine.mineTypeId);
    const mineCity = catalogCityForId(catalog, mine.cityId);
    const availableCrypto = cryptoTypesForMap(mineCity.mapId);
    const selectedCrypto = mine.cryptoTypeId ? cryptoType(mine.cryptoTypeId) : null;
    const remaining = mine.nextFindAt - now;
    const resource = type.hasOre ? 'ore' : 'gold';
    const continuousGold = Boolean(
      catalogSpecialisationForId(catalog, player.profession).bonuses.mineGold
    )
      && !mine.cryptoTypeId && mine.mineThings === false && !type.hasOre;
    const mineGoldMultiplier = specialisationMultiplier(player.profession, 'mineGold', catalog.specialisations);
    const miningStatus = selectedCrypto
      ? `Mining <strong>${escapeHtml(selectedCrypto.name)} (${escapeHtml(selectedCrypto.symbol)})</strong> · ${formatGold(mineBucketsPerHour(catalog, mine, player, now))} units/hr · next result: <strong>${formatDuration(remaining)}</strong>`
      : continuousGold
      ? `Mining <strong>gold continuously</strong> · ${formatGold(mineBucketsPerHour(catalog, mine, player, now) * Number(catalog.settings.mine_gold_per_bucket) * mineGoldMultiplier)} gold/hr · ${formatGold((mineGoldMultiplier - 1) * 100)}% specialisation bonus`
      : `Mining <strong>${mine.mineThings === false ? resource : 'things'}</strong> · ${formatGold(mineBucketsPerHour(catalog, mine, player, now))} buckets/hr · next result: <strong>${formatDuration(remaining)}</strong>`;
    const modeValue = selectedCrypto ? `crypto:${selectedCrypto.id}` : mine.mineThings === false ? 'resource' : 'things';
    const modeOptions = [['things', 'Things'], ['resource', type.hasOre ? 'Ore' : 'Gold'],
      ...availableCrypto.map((currency) => [`crypto:${currency.id}`, `${currency.name} (${currency.symbol})`])]
      .map(([value, label]) => `<option value="${value}"${value === modeValue ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('');
    const oilItem = catalogItemForSetting(catalog, 'oil_item_id');
    const oilOwned = player.inventoryByCity[mine.cityId]?.[oilItem.id] ?? 0;
    const permanentCount = player.mines.filter((candidate) => !candidate.rentalUntil).length;
  return `<article class="mine${mine.active ? '' : ' inactive'}">${equipmentBot(mine, catalog, true)}<div><h3><span class="mine-priority">${mine.priority}</span> ${escapeHtml(type.name)} Mine</h3><p>${mine.active ? miningStatus : '<strong>Paused by the active-mine limit.</strong>'}${mine.oilExpiresAt > now ? ` · oiled for ${formatDuration(mine.oilExpiresAt - now)}` : ''}${mine.rentalUntil ? ` · rental expires in ${formatDuration(mine.rentalUntil - now)}` : ''}${mine.sourceKind === 'profession-kit' ? ' · Profession Kit grant · non-refundable' : ''}</p>${mine.active ? `<div class="button-row mine-tool-links"><a class="button secondary" href="/mines/${mine.id}/explosives">Mine with explosives</a><a class="button secondary" href="/mines/${mine.id}/equipment">Equip your miner</a></div>` : ''}</div><div class="mine-actions"><form method="post" action="/mines/${mine.id}/prioritize"><button class="secondary" ${mine.priority === 1 ? 'disabled' : ''}>Make top</button></form>${mine.active ? `<form method="post" action="/mines/${mine.id}/mode"><label>Mine for<select name="mode">${modeOptions}</select></label><button class="secondary">Set mode</button></form><form method="post" action="/mines/${mine.id}/oil"><button class="secondary" ${oilOwned < 1 ? 'disabled' : ''}>Oil bot</button></form>` : ''}${!mine.rentalUntil && mine.sourceKind !== 'profession-kit' && type.refundable ? `<form method="post" action="/mines/${mine.id}/sell"><button class="secondary" ${permanentCount <= Number(catalog.settings.minimum_permanent_mines) ? 'disabled' : ''}>Resell for ${mineRefundCredits(catalog, type)}c</button></form>` : ''}</div></article>`;
  }).join('');
  const capacityWarning = player.itemCount > player.itemLimit
    ? `<p class="capacity-warning">You are ${player.itemCount - player.itemLimit} things over your ${player.itemLimit}-thing limit. <a class="text-link" href="/mines/auto-recycle">Open Auto-Recycle</a>.</p>` : '';
  const ownedParts = new Set(player.botPartIds);
  const partImage = `/img/equipment/botparts/bot${catalog.botParts.filter((part) => ownedParts.has(part.id)).map((part) => part.name).join('')}.png`;
  const partRows = catalog.botParts.map((part) => {
    const owned = ownedParts.has(part.id);
    const available = !part.prerequisiteId || ownedParts.has(part.prerequisiteId);
    return `<li><span>${escapeHtml(part.label)} · +${formatGold(part.bph)} bph · ${formatGold(part.cost)}g</span>${owned ? '<strong class="active-state">Built</strong>' : `<form method="post" action="/bot-parts/${part.id}/buy"><button ${!available || player.gold < part.cost ? 'disabled' : ''}>Buy</button></form>`}</li>`;
  }).join('');
  const botBuilder = ownedParts.size < catalog.botParts.length ? `<section class="bot-builder"><div><h2>Build your miner bot</h2><p>Each original machine part permanently improves every standard mine.</p><ul>${partRows}</ul></div><img src="${partImage}" alt="Partially assembled miner bot"></section>` : '';
  const ownedStones = new Set(player.stoneIds);
  const nextStones = catalogCollection(catalog, 'stones').filter((stone) =>
    !ownedStones.has(stone.id) || stone.behaviorKey === 'Completionist')
    .slice(0, Number(catalog.settings.home_next_stone_limit))
    .map((stone) => `<img src="/img/icons/stone${stone.rarity}.png" alt="${escapeHtml(stone.name)}" title="${escapeHtml(`${stone.name}: ${stone.description}. ${formatGold(catalog.settings.stone_buckets_per_hour)} bph.`)}">`).join('');
  const stones = `<section class="stone-progress"><div><h2>Clear stones</h2><p>${player.stoneCount} cleared · +${formatGold(player.stoneCount * Number(catalog.settings.stone_buckets_per_hour))} buckets/hr on the top mine in every regional home city.</p></div><div class="stone-icons">${nextStones || '<strong>Every stone cleared.</strong>'}</div><a class="text-link" href="/stones">View all</a></section>`;
  return `<section class="page-title"><div><p class="eyebrow">Welcome back</p><h1>${escapeHtml(player.name)}’s mines</h1></div><p>Showing mines in ${escapeHtml(player.cityName)}. Your discovered regions currently support ${maximumActiveMines.toLocaleString('en-GB')} active mines.</p></section>${capacityWarning}${botBuilder}${stones}<section><h2>Mines in ${escapeHtml(player.cityName)}</h2><div class="mine-list">${mines || '<p>No mines are based in this city.</p>'}</div></section><section><h2>Recent discoveries</h2><div class="item-grid">${recent || '<p>Your first discovery is still beneath the soil.</p>'}</div></section>`;
}

function stonesPage(player, catalog) {
  const owned = new Set(player.stoneIds);
  const stoneBph = Number(catalog.settings.stone_buckets_per_hour);
  const rows = catalogCollection(catalog, 'stones').map((stone) => {
    const completionCount = stone.behaviorKey === 'Completionist'
      ? Number(player.cityCompletionStoneCount ?? 0) : 0;
    const cleared = owned.has(stone.id);
    const status = stone.behaviorKey === 'Completionist'
      ? completionCount
        ? `Cleared in ${completionCount.toLocaleString('en-GB')} ${completionCount === 1 ? 'city' : 'cities'}`
        : 'No cities completed yet'
      : cleared ? 'Cleared' : 'Not yet cleared';
    const production = stone.behaviorKey === 'Completionist'
      ? `+${formatGold(stoneBph)} bph per completed city`
      : `+${formatGold(stoneBph)} bph`;
    return `<article class="stone-card${cleared ? ' earned' : ''}"><img src="/img/icons/stone${stone.rarity}.png" alt=""><div><h3>${escapeHtml(stone.name)}</h3><p>${escapeHtml(stone.description)}</p><small>Rank ${stone.rank} · ${status} · ${production}</small></div></article>`;
  }).join('');
  return `<section class="page-title"><div><p class="eyebrow">Mine achievements</p><h1>Stones</h1></div><a class="text-link" href="/">Back to mines</a></section><p>Each cleared stone permanently adds ${formatGold(stoneBph)} bucket per hour to the top mine in every regional home city, across all regions.</p><div class="stone-grid">${rows}</div>`;
}

function mineToolNavigation(mineId, currentPage) {
  const link = (page, label) => `<a class="button${currentPage === page ? '' : ' secondary'}" href="/mines/${mineId}/${page}"${currentPage === page ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<nav class="button-row mine-tool-navigation" aria-label="Mine tools">${link('explosives', 'Mine with explosives')}${link('equipment', 'Equip your miner')}</nav>`;
}

function mineEquipmentPage(player, catalog, mine, currentTime) {
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
  return `<section class="page-title"><div><p class="eyebrow">${escapeHtml(type.name)} mine</p><h1>Equip your miner</h1></div><p>${formatGold(mineBucketsPerHour(catalog, mine, player, currentTime))} buckets/hr · about one result every ${formatDuration(mineIntervalMs(catalog, mine, player, currentTime))}.</p></section>
    ${mineToolNavigation(mine.id, 'equipment')}
    <section class="loadout-layout"><div>${equipmentBot(mine, catalog)}</div><div><h2>Equipped</h2><ul class="equipped-list">${equippedRows}</ul><h3>Miner robot</h3>${robotItem ? itemCard(robotItem, { compact: true, meta: `MR${robot.model}`, action: `<form method="post" action="/mines/${mine.id}/robots/unassign"><button class="secondary">Remove</button></form>` }) : '<p class="muted">No miner robot assigned.</p>'}</div></section>
    <section><h2>Equipment in this city</h2><div class="loadout-list">${availableEquipment || '<p>No spare equipment is stored in this city.</p>'}</div></section>
    <section><h2>Miner robots in this city</h2><p>Higher-model mining robots are more likely to uncover damaged things.</p><div class="loadout-list">${availableRobots || '<p>No spare miner robots are stored in this city.</p>'}</div></section>
    <p><a class="text-link" href="/">Back to mines</a></p>`;
}

function mineExplosivesPage(player, catalog, mine, detonated = false) {
  const type = catalogMineTypeForId(catalog, mine.mineTypeId);
  const inventory = player.inventoryByCity[mine.cityId] ?? {};
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
  return `<section class="page-title"><div><p class="eyebrow">${escapeHtml(type.name)} mine</p><h1>Mine with explosives</h1></div><p>Choose a charge from the stock held in this city. Detonation mines immediately.</p></section>
    ${mineToolNavigation(mine.id, 'explosives')}
    ${detonated ? '<figure class="explosion-result"><img src="/img/explosives/explosion.png" alt="Explosion"><figcaption>Detonation complete.</figcaption></figure>' : ''}
    <section><h2>Explosives in this city</h2><p>Explosives consume local inventory and mine instantly at ±${formatGold(Number(catalog.settings.explosive_power_variation) * 100)}% of their original bucket power. Equipment does not affect detonations.</p><div class="detonator-grid">${explosives}</div></section>
    <p><a class="text-link" href="/">Back to mines</a></p>`;
}

function gadgetsPage(player, catalog, currentTime) {
  const active = new Map(player.gadgets.map((gadget) => [gadget.id, gadget]));
  const capitalCityId = player.currentRegionCapitalCityId;
  const capital = capitalCityId === null ? null : catalogCityForId(catalog, capitalCityId);
  const atCapital = Boolean(capital && Number(player.cityId) === Number(capital.id));
  const capitalInventory = capital ? (player.inventoryByCity[capital.id] ?? {}) : {};
  const outsideCapitalInventory = Object.entries(player.inventoryByCity)
    .filter(([cityId]) => Number(cityId) !== Number(capitalCityId))
    .reduce((totals, [, inventory]) => {
      for (const [itemId, quantity] of Object.entries(inventory)) {
        totals[itemId] = (totals[itemId] ?? 0) + quantity;
      }
      return totals;
    }, {});
  const gadgetItemIds = new Set(catalog.gadgetItems.map((entry) => entry.itemId));
  const capitalGadgetCount = Object.entries(capitalInventory)
    .filter(([itemId]) => gadgetItemIds.has(Number(itemId)))
    .reduce((total, [, quantity]) => total + quantity, 0);
  const outsideCapitalGadgetCount = Object.entries(outsideCapitalInventory)
    .filter(([itemId]) => gadgetItemIds.has(Number(itemId)))
    .reduce((total, [, quantity]) => total + quantity, 0);
  const renderGadget = (gadget) => {
    const session = active.get(gadget.id);
    const itemRows = catalog.gadgetItems.filter((entry) => entry.gadgetId === gadget.id)
      .sort(compareCatalogEntriesByRarity(catalog)).map((entry) => {
      const item = catalog.byId.get(entry.itemId);
      const inCapital = capitalInventory[item.id] ?? 0;
      const elsewhere = outsideCapitalInventory[item.id] ?? 0;
      if (!inCapital && !elsewhere) return '';
      return itemCard(item, { count: inCapital + elsewhere, compact: true,
        meta: [`${inCapital} in ${capital ? capital.name : 'regional capital'}`,
          ...(elsewhere ? [`${elsewhere} elsewhere`] : [])],
        action: `<form method="post" action="/gadgets/${item.id}/activate"><button ${
          atCapital && inCapital ? '' : 'disabled'}>Activate one</button></form>` });
    }).filter(Boolean).join('');
    const openPage = gadget.hasPage && session?.expiresAt > currentTime
      ? `<a class="button secondary" href="/gadgets/${gadget.behaviorKey.replaceAll('_', '-')}">Open ${escapeHtml(gadget.displayName)}</a>` : '';
    return `<article class="gadget-card"><div><h3>${escapeHtml(gadget.displayName)}</h3><p class="gadget-description">${escapeHtml(cleanLegacyMultilineText(gadget.description))}</p>${session?.expiresAt > currentTime
      ? `<strong class="active-state">Active for ${formatDuration(session.expiresAt - currentTime)}</strong>${openPage}`
      : '<span class="muted">Inactive</span>'}</div><div class="gadget-activators">${itemRows || '<span class="muted">No activator items owned.</span>'}</div></article>`;
  };
  const activeGadgets = catalog.gadgets.filter(
    (gadget) => active.get(gadget.id)?.expiresAt > currentTime
  );
  const inactiveGadgets = catalog.gadgets.filter(
    (gadget) => !(active.get(gadget.id)?.expiresAt > currentTime)
  );
  const activeRows = activeGadgets.map(renderGadget).join('');
  const inactiveRows = inactiveGadgets.map(renderGadget).join('');
  const locationNotice = atCapital ? '' : capital
    ? `<p class="capacity-warning">Travel to the regional capital, <strong>${escapeHtml(capital.name)}</strong>, to activate gadgets stored there.</p>`
    : '<p class="capacity-warning">This region has no available capital for gadget activation.</p>';
  const inventoryNotice = outsideCapitalGadgetCount
    ? `<p class="capacity-warning">You have ${outsideCapitalGadgetCount} gadget ${
      outsideCapitalGadgetCount === 1 ? 'item' : 'items'} outside ${
      capital ? escapeHtml(capital.name) : 'the current regional capital'}. To activate ${
      outsideCapitalGadgetCount === 1 ? 'it' : 'one'}, bring it to a regional capital and stand there with it.</p>` : '';
  const activeCount = activeGadgets.length;
  return `<section class="page-title"><div><p class="eyebrow">Machines</p><h1>Gadgets</h1></div><p>You and the gadget item must be in the current region’s capital to activate it. Once active, its effect applies globally. Each item adds its original rarity-based lifespan to the current session.</p></section>${locationNotice}${inventoryNotice}
    <section class="gadget-status-section gadget-active-section"><p class="eyebrow">Running now</p><h2>Active globally (${activeCount.toLocaleString('en-GB')})</h2><p>The navigation count is ${activeCount.toLocaleString('en-GB')} active plus ${capitalGadgetCount.toLocaleString('en-GB')} activator ${capitalGadgetCount === 1 ? 'item' : 'items'} stored in ${capital ? escapeHtml(capital.name) : 'the regional capital'}.</p>${activeRows
      ? `<div class="gadget-list">${activeRows}</div>`
      : '<p class="muted">No gadgets are active.</p>'}</section>
    <section class="gadget-status-section"><p class="eyebrow">Stored activators and catalogue</p><h2>Other gadgets</h2><div class="gadget-list">${inactiveRows || '<p class="muted">Every gadget is active.</p>'}</div></section>`;
}

function gadgetAutomationPage(report, catalog) {
  const intervalOptions = report.intervalOptions.map((minutes) => {
    const label = minutes < 60 ? `${minutes} minutes`
      : minutes < 1440 ? `${minutes / 60} hour${minutes === 60 ? '' : 's'}` : '24 hours';
    return `<option value="${minutes}"${Number(report.intervalMinutes) === Number(minutes)
      ? ' selected' : ''}>${label}</option>`;
  }).join('');
  const interval = `<label>Run interval<select name="intervalMinutes">${intervalOptions}</select></label>`;
  let controls = '';
  let hasChoices = true;
  if (report.behaviorKey === 'autoloader') {
    const ships = report.ships.map((ship) => `<option value="${ship.id}">${
      escapeHtml(ship.name)} · ${escapeHtml(ship.cityName)} · ${ship.cannons} cannon${ship.cannons === 1 ? '' : 's'} · ${escapeHtml(ship.status)}</option>`).join('');
    const ammunition = report.ammunition.map((ammo) => `<option value="${ammo.type}">${escapeHtml(ammo.name)}</option>`).join('');
    hasChoices = Boolean(ships && ammunition);
    controls = `<label>Ship<select name="vehicleId" required>${ships || '<option value="">No ships owned</option>'}</select></label><label>Cannon fodder<select name="ammoType" required>${ammunition}</select></label><label>Crates to load<input type="number" name="quantity" min="1" max="${report.maxLoadQuantity}" step="1" value="1" required></label>${interval}<p class="field-help">Each scheduled turn loads up to the chosen number of crates from stock in the configured port, then advances to the next task. Configured shuttles use the same quantity after landing and before their immediate next departure.</p>`;
  } else if (report.behaviorKey === 'autolister') {
    const stock = report.stockTypes.map((mineType) => {
      const city = report.cities.find(
        (candidate) => Number(candidate.id) === Number(mineType.cityId)
      );
      const value = `${mineType.cityId}:${mineType.id}`;
      return `<option value="${value}">${
        escapeHtml(mineType.name)} · ${escapeHtml(city?.name ?? `City ${mineType.cityId}`)} · ${
        Number(mineType.quantity).toLocaleString('en-GB')} Thing${Number(mineType.quantity) === 1 ? '' : 's'} across ${
        Number(mineType.itemCount).toLocaleString('en-GB')} kind${Number(mineType.itemCount) === 1 ? '' : 's'}</option>`;
    }).join('');
    hasChoices = Boolean(stock);
    controls = `<label>Thing type and location<select name="stockType" required>${stock || '<option value="">No marketable stock owned</option>'}</select></label><label>Markup over each Thing's local reference price (%)<input type="number" name="markupPercent" min="0" max="${report.maxMarkupPercent}" step="0.1" value="25" required></label>${interval}<p class="field-help">Each turn lists every unlisted Thing in one type-location task, then advances. Each kind is priced separately and rounded upward to the next valid market tick; existing listings keep their price.</p>`;
  } else if (report.behaviorKey === 'automaker') {
    const factories = report.factories.map((factory) => `<option value="${factory.id}">Factory #${factory.id} · ${
      escapeHtml(factory.cityName)} · ${factory.queuedJobs} queued</option>`).join('');
    const actions = report.actions.map((action) => `<option value="${action.id}">${
      escapeHtml(action.outputName)} · ${action.ore} Ore · ${action.outputQuantity} per job</option>`).join('');
    hasChoices = Boolean(factories && actions);
    controls = `<label>Factory<select name="factoryId" required>${factories || '<option value="">No completed owner-operated factories</option>'}</select></label><label>Product<select name="actionId" required>${actions || '<option value="">No manufactured products</option>'}</select></label>${interval}<p class="field-help">The Automaker reserves Ore and starts or queues one new job every interval. The task remains active after each job and repeats until you disable it. It waits when the ten-job queue is full, the factory limit is reached, or local Ore runs out.</p>`;
  } else {
    const capitals = report.cities.filter((city) => city.isCapital).map((city) => `<option value="${city.id}">${escapeHtml(city.name)}</option>`).join('');
    const melds = report.melds.map((meld) => `<option value="${meld.id}">${
      escapeHtml(meld.name)} · ${escapeHtml(catalogRarityName(catalog, meld.rarity))}</option>`).join('');
    hasChoices = Boolean(capitals && melds);
    controls = `<label>Regional capital<select name="cityId" required>${capitals || '<option value="">No known regional capital</option>'}</select></label><label>Target Meld<select name="meldId" required>${melds || '<option value="">No incomplete Melds</option>'}</select></label>${interval}<p class="field-help">The Automelder stages one locally available recipe thing per interval into global Meld storage. Normal automatic recipe completion still applies, so another ready Meld may assemble along the way.</p>`;
  }
  const taskSummary = (task) => {
    const city = report.cities.find((entry) => Number(entry.id) === Number(task.cityId));
    const cityName = city?.name ?? `City ${task.cityId}`;
    if (report.behaviorKey === 'autoloader') {
      const ship = report.ships.find((entry) => Number(entry.id) === Number(task.vehicleId));
      const ammo = report.ammunition.find((entry) => Number(entry.type) === Number(task.ammoType));
      const quantity = task.quantity === undefined
        ? 'fill available capacity'
        : `up to ${Number(task.quantity).toLocaleString('en-GB')} crate${Number(task.quantity) === 1 ? '' : 's'}`;
      return `${ship?.name ?? `Ship #${task.vehicleId}`} · ${cityName} · ${ammo?.name ?? `ammunition ${task.ammoType}`} · ${quantity}`;
    }
    if (report.behaviorKey === 'autolister') {
      const mineType = catalog.mineTypes.find(
        (entry) => Number(entry.id) === Number(task.mineTypeId)
      );
      return `${mineType?.name ?? `Thing type ${task.mineTypeId}`} · ${cityName} · ${task.markupPercent}% markup`;
    }
    if (report.behaviorKey === 'automaker') {
      const action = report.actions.find((entry) => Number(entry.id) === Number(task.actionId));
      return `Factory #${task.factoryId} · ${cityName} · ${action?.outputName ?? `product ${task.actionId}`}`;
    }
    return `${catalog.meldById.get(Number(task.meldId))?.name ?? `Meld ${task.meldId}`} · ${cityName}`;
  };
  const tasks = report.tasks.map((task, index) => `<li><div><strong>${index + 1}.</strong> ${escapeHtml(taskSummary(task))}${index === report.configuration?.cursor ? ' <span class="automation-next">Next</span>' : ''}</div><form method="post" action="/gadgets/${report.behaviorKey}/tasks/${index}/remove"><button class="secondary">Remove</button></form></li>`).join('');
  const queue = `<section class="gadget-automation-queue"><p class="eyebrow">Round-robin queue</p><h2>${report.tasks.length} of ${report.taskLimit} tasks</h2>${tasks ? `<ol>${tasks}</ol>` : '<p>No tasks configured yet.</p>'}</section>`;
  const stateAction = report.enabled
    ? `<form method="post" action="/gadgets/${report.behaviorKey}/disable"><button class="secondary">Disable automation</button></form>`
    : report.tasks.length
      ? `<form method="post" action="/gadgets/${report.behaviorKey}/enable"><button>Enable automation</button></form>`
      : '';
  const state = report.configuration
    ? `<section class="gadget-automation-state"><p class="eyebrow">Automation state</p><h2>${report.enabled ? 'Running' : 'Disabled'}</h2><dl><div><dt>Last attempt</dt><dd>${report.lastRunAt ? escapeHtml(formatDuration(report.generatedAt - report.lastRunAt)) + ' ago' : 'Not yet run'}</dd></div><div><dt>Next attempt</dt><dd>${report.enabled && report.nextRunAt ? escapeHtml(formatDuration(report.nextRunAt - report.generatedAt)) : 'Not scheduled'}</dd></div><div><dt>Result</dt><dd>${escapeHtml(report.lastStatus || 'Waiting for the first run.')}</dd></div></dl>${stateAction}</section>`
    : '<section class="gadget-automation-state"><p class="eyebrow">Automation state</p><h2>Not configured</h2><p>Choose what this gadget should operate below.</p></section>';
  const queueFull = report.tasks.length >= report.taskLimit;
  return `<section class="page-title"><div><p class="eyebrow">Active gadget machinery</p><h1>${escapeHtml(report.displayName)}</h1></div><a class="text-link" href="/gadgets">Back to gadgets</a></section><p>${escapeHtml(report.description)} One task runs per interval, in queue order.</p>${state}${queue}<section class="gadget-automation-config"><h2>Add a task</h2><form method="post" action="/gadgets/${report.behaviorKey}/configure">${controls}<button${hasChoices && !queueFull ? '' : ' disabled'}>${queueFull ? 'Queue full' : 'Add task'}</button></form></section>`;
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
  return `<section class="page-title"><div><p class="eyebrow">${escapeHtml(gadgetName)} gadget</p><h1>Purchases and sales</h1></div><a class="text-link" href="/gadgets">Back to gadgets</a></section>
    <form class="market-search" method="get"><label>Month<select name="month">${months}</select></label><button>Go</button></form>
    <table><tbody><tr><th>Total purchases</th><td>${formatGold(report.totalPurchases)}g</td></tr><tr><th>Total sales</th><td>${formatGold(report.totalSales)}g</td></tr><tr><th>Profit from sales</th><td>${formatGold(report.profit)}g</td></tr></tbody></table>
    <table><thead><tr><th>Action</th><th>Thing</th><th>Quantity and price</th><th>Date</th></tr></thead><tbody>${rows || '<tr><td colspan="4">No transactions in this month.</td></tr>'}</tbody></table>`;
}

function medalDetectorPage(melds, catalog) {
  const gadgetName = catalogGadgetForBehavior(catalog, 'medal_detector').displayName;
  const rows = melds.map((meld) => `<tr><td><a class="text-link" href="/melds/${meld.id}">${escapeHtml(meld.name)}</a></td><td>${formatGold(meld.price)}g</td></tr>`).join('');
  return `<section class="page-title"><div><p class="eyebrow">${escapeHtml(gadgetName)} gadget</p><h1>Cheapest incomplete melds</h1></div><a class="text-link" href="/gadgets">Back to gadgets</a></section>
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
  return `<section class="page-title"><div><p class="eyebrow">${escapeHtml(gadgetName)} gadget</p><h1>Profitable intercity trades</h1></div><a class="text-link" href="/gadgets">Back to gadgets</a></section>
    <p>Things available to buy immediately in one known city and sell immediately in another are listed below.</p>
    <form class="report-filter" method="get"><fieldset><legend>Sort</legend><label><input type="radio" name="sort" value="profit"${sort !== 'percent' ? ' checked' : ''}>Profit</label><label><input type="radio" name="sort" value="percent"${sort === 'percent' ? ' checked' : ''}>Percent</label></fieldset><fieldset><legend>Cities</legend>${cityInputs}</fieldset><fieldset><legend>Rarities</legend>${rarityInputs}</fieldset><button>Apply filter</button></form>
    <table><thead><tr><th>Thing</th><th>Buy city</th><th>Listing</th><th>Sell city</th><th>Bid</th><th>Profit</th><th>Percent</th></tr></thead><tbody>${rows || '<tr><td colspan="7">No profitable immediate trades match this filter.</td></tr>'}</tbody></table>`;
}

function calculatorPage(categories, catalog) {
  const gadgetName = catalogGadgetForBehavior(catalog, 'calculator').displayName;
  const sections = categories.map((category) => `<section><h2>${escapeHtml(category.name)}</h2><table><thead><tr><th>Description</th><th>Value</th></tr></thead><tbody>${category.stats.map(([label, value]) => `<tr><td>${escapeHtml(label)}</td><td>${typeof value === 'number' ? value.toLocaleString('en-GB') : escapeHtml(value)}</td></tr>`).join('')}</tbody></table></section>`).join('');
  return `<section class="page-title"><div><p class="eyebrow">${escapeHtml(gadgetName)} gadget</p><h1>Miner statistics</h1></div><a class="text-link" href="/gadgets">Back to gadgets</a></section>${sections}`;
}

function meldRequirements(meld, player, catalog) {
  const regionalCapitalCityId = player.currentRegionHomeCityId;
  const inventory = regionalCapitalCityId === null
    ? {} : (player.inventoryByCity[regionalCapitalCityId] ?? {});
  const storage = player.meldStash ?? {};
  return [...meld.requirements].sort(compareCatalogEntriesByRarity(catalog)).map((requirement) => {
    const item = catalog.byId.get(requirement.itemId);
    const stored = storage[requirement.itemId] ?? 0;
    const atHome = inventory[requirement.itemId] ?? 0;
    if (!item) throw new Error(`Missing catalog item: ${requirement.itemId}.`);
    return `<li class="${stored + atHome >= requirement.count ? 'met' : 'missing'}">${itemCard(item, { compact: true, meta: [`${requirement.count} required`, `${stored} in Meld storage`, `${atHome} in this region's capital`] })}</li>`;
  }).join('');
}

function meldStashProgress(meld, storage = {}) {
  const requiredByItemId = new Map();
  for (const requirement of meld.requirements) {
    requiredByItemId.set(requirement.itemId,
      (requiredByItemId.get(requirement.itemId) ?? 0) + requirement.count);
  }
  let required = 0;
  let staged = 0;
  for (const [itemId, quantity] of requiredByItemId) {
    required += quantity;
    staged += Math.min(quantity, Number(storage[itemId] ?? 0));
  }
  return { required, staged };
}

function meldsPage(player, catalog, query = '', leaders = []) {
  const needle = query.trim().toLocaleLowerCase('en');
  const owned = new Set(player.meldIds);
  const broken = new Set(player.brokenMeldIds);
  const matching = catalog.melds.map((meld) => ({
    meld,
    progress: meldStashProgress(meld, player.meldStash)
  })).filter(({ meld, progress }) => meld.public
    && (owned.has(meld.id) || broken.has(meld.id)
      || (progress.staged > 0 && progress.staged < progress.required))
    && (!needle || meld.name.toLocaleLowerCase('en').includes(needle)))
    .sort((first, second) => Number(first.meld.rarity) - Number(second.meld.rarity)
      || first.meld.name.localeCompare(second.meld.name, 'en')
      || Number(first.meld.id) - Number(second.meld.id));
  const cards = matching.map(({ meld, progress }) => {
    const state = owned.has(meld.id)
      ? '<strong class="active-state">Owned</strong>'
      : broken.has(meld.id)
        ? '<strong class="capacity-warning">Broken · dismantle</strong>'
        : `<a class="button secondary" href="/melds/${meld.id}">Continue meld</a>`;
    const progressText = owned.has(meld.id) || broken.has(meld.id)
      ? `${progress.required} things`
      : `${progress.staged} of ${progress.required} things staged`;
    return `<article class="meld-card rarity-${meld.rarity}"><div><h3><a class="text-link" href="/melds/${meld.id}">${escapeHtml(meld.name)}</a></h3><small>${escapeHtml(catalogRarityName(catalog, meld.rarity))} · ${progressText}</small></div>${state}</article>`;
  }).join('');
  const leaderCards = leaders.map((miner) => `<li style="--miner-chat-color:#${miner.chatColor}"><span class="meld-leader-rank">#${miner.meldRank}</span><a class="text-link" href="/miners/${encodeURIComponent(miner.name)}">${escapeHtml(miner.name)}</a><span class="meld-leader-total"><strong>${miner.meldCount.toLocaleString('en-GB')}</strong><small>Melds</small></span></li>`).join('');
  return `<section class="page-title"><div><p class="eyebrow">Collections</p><h1>Melds</h1></div><p>You own <strong>${owned.size}</strong> melds${broken.size ? ` and have <strong>${broken.size}</strong> broken melds` : ''}. Use the Meld button in Your Things to stage recipe items. Completed melds are created automatically.</p></section>
    <section class="meld-reputation"><div><p class="eyebrow">Reputation is forged</p><h2>If you want to be respected around here, you are going to need Melds.</h2><p>Lots of Melds. Make them, climb the ranks, and become famous.</p></div><aside><h3>Glowing examples</h3><p>The five most prolific Meld makers.</p><ol>${leaderCards || '<li>Nobody has made a Meld yet. The first legend could be you.</li>'}</ol></aside></section>
    <section><h2>Your Melds</h2><p>Owned, broken, and partially made Melds appear here. Unstarted recipes stay hidden. Because Meld storage is shared, a staged Thing can contribute to more than one recipe until a Meld consumes it.</p>
    <form class="market-search" method="get" action="/melds"><label>Filter your melds<input name="q" value="${escapeHtml(query)}" placeholder="Meld name"></label><button>Filter</button></form>
    <div class="meld-list">${cards || `<p>${needle ? 'No matching owned or started Melds.' : 'You do not own or have any Melds in progress yet.'}</p>`}</div></section>`;
}

function meldDetailPage(player, catalog, meld) {
  const owned = player.meldIds.includes(meld.id);
  const broken = player.brokenMeldIds.includes(meld.id);
  const regionalCapital = player.currentRegionHomeCityId === null
    ? null : catalogCityForId(catalog, player.currentRegionHomeCityId);
  const atRegionalCapital = regionalCapital && player.cityId === regionalCapital.id;
  const createAction = atRegionalCapital
    ? `<form class="meld-create-form" method="post" action="/melds/${meld.id}/create"><button>Create from storage and ${escapeHtml(regionalCapital.name)} things</button></form>`
    : regionalCapital
      ? `<p class="capacity-warning">Travel to the regional capital, <strong>${escapeHtml(regionalCapital.name)}</strong>, to create this Meld.</p>`
      : '<p class="capacity-warning">This region does not have an available capital.</p>';
  const previousHomeName = player.previousHomeCityId === null
    ? 'your former home city' : catalogCityForId(catalog, player.previousHomeCityId).name;
  return `<section class="page-title"><div><p class="eyebrow">${escapeHtml(catalogRarityName(catalog, meld.rarity))} meld</p><h1>${escapeHtml(meld.name)}</h1></div><p>Use Meld buttons in a regional capital to move recipe items into capacity-free Meld storage. That shared storage and things in your current region's capital can be used for manual creation.</p></section>
    <section class="meld-recipe"><h2>Recipe</h2><ul>${meldRequirements(meld, player, catalog)}</ul>${broken
      ? `<div class="broken-meld"><p>Moving nullified this meld in ${escapeHtml(previousHomeName)}. Dismantle it to return every recipe thing to that city.</p><form method="post" action="/melds/${meld.id}/deconstruct"><button>Dismantle meld</button></form></div>`
      : owned
      ? '<p class="active-state">You own this meld.</p>'
      : createAction}</section><p><a class="text-link" href="/melds">Back to melds</a></p>`;
}

function professionsPage(player, catalog) {
  const current = catalogSpecialisationForId(catalog, player.profession);
  const meldCount = player.meldIds.length;
  const publicMeldCount = catalog.melds.filter((meld) => meld.public).length;
  const specialisations = [...catalog.specialisations]
    .sort((first, second) => first.melds - second.melds || first.id - second.id);
  const next = specialisations.find((profession) => profession.melds > meldCount);
  const tenureById = new Map(player.specialisationTenure.map(
    (entry) => [entry.specialisationId, entry]
  ));
  const currentTenure = tenureById.get(player.profession);
  const cards = specialisations.map((profession) => {
    const tenure = tenureById.get(profession.id);
    const progress = tenure.nextTitle
      ? `${tenure.remainingDays.toLocaleString('en-GB')} charged days to ${escapeHtml(tenure.nextTitle)}`
      : 'Highest legacy title earned';
    return `<article class="profession-card${profession.id === player.profession ? ' current' : ''}"><div><h3>${escapeHtml(tenure.title)} ${escapeHtml(profession.name)}</h3><p>${tenure.activeDays.toLocaleString('en-GB')} charged days · ${progress}</p><p>${profession.melds} melds required · ${escapeHtml(profession.bonus)}</p></div>${profession.id === player.profession
    ? '<strong class="active-state">Current</strong>'
    : `<form method="post" action="/professions/${profession.id}"><button ${meldCount < profession.melds ? 'disabled' : ''}>Choose</button></form>`}</article>`;
  }).join('');
  const unlockProgress = next
    ? `Next unlock: ${escapeHtml(next.name)} at ${next.melds} Melds (${next.melds - meldCount} to go).`
    : `Every specialisation unlocked, including the ${publicMeldCount}-Meld capstone.`;
  return `<section class="page-title"><div><p class="eyebrow">Specialisation</p><h1>Specialisations</h1></div><p>Current title: <strong>${escapeHtml(currentTenure.title)} ${escapeHtml(current.name)}</strong> · ${meldCount} of ${publicMeldCount} public Melds. ${unlockProgress} Titles measure charged battery time in each specialisation separately; switching preserves progress. Every miner may use every game system, while specialisations grant bonuses.</p></section><div class="profession-grid">${cards}</div>`;
}

function factoriesPage(player, catalog, factoryState, employees, availableWorkers, currentTime) {
  const oreItem = catalogItemForSetting(catalog, 'ore_item_id');
  const oilItem = catalogItemForSetting(catalog, 'oil_item_id');
  const regionalCapital = player.currentRegionHomeCityId === null
    ? null : catalogCityForId(catalog, player.currentRegionHomeCityId);
  const atRegionalCapital = Boolean(regionalCapital && player.cityId === regionalCapital.id);
  const ore = player.inventory[oreItem.id] ?? 0;
  const oil = player.inventory[oilItem.id] ?? 0;
  const homeOil = regionalCapital
    ? (player.inventoryByCity[regionalCapital.id]?.[oilItem.id] ?? 0) : 0;
  const damaged = Object.entries(player.inventory).map(([itemId, count]) => [catalog.byId.get(Number(itemId)), count])
    .filter(([item, count]) => item?.repairedItemId && count > 0)
    .sort(([first], [second]) => compareItemsByRarity(first, second));
  const damagedCards = damaged.map(([item, count]) => itemCard(item, {
    count, compact: true, className: 'item-card-picker',
    meta: 'Damaged · repair candidate',
    action: `<label><input type="radio" name="itemId" value="${item.id}"> Use for repair</label>`
  })).join('');
  const localEmployees = employees.filter((employee) =>
    employee.homeCityIds.includes(player.cityId));
  const idleEmployees = localEmployees.filter((employee) => !employee.factoryId);
  const cards = factoryState.factories.map((factory) => {
    const canControl = factory.operatorId === player.id;
    const own = factory.ownerId === player.id;
    const rented = factory.ownerId !== factory.operatorId;
    const actionOptions = catalog.factoryActions
      .filter((action) => !['build', 'reinforce'].includes(action.actionKind)
        && (!rented || action.actionKind === 'repair'))
      .map((action) => `<option value="${action.id}">${escapeHtml(action.name)} · ${action.ore} ore · ${action.components.toLocaleString('en')} components</option>`).join('');
    const progress = factory.components ? Math.min(100, factory.componentsDone / factory.components * 100) : 0;
    const workers = factory.workers.map((worker) => worker.isBot
      ? `<li><strong>🤖 ${escapeHtml(worker.name)}</strong> · ${worker.cph} cph · contract ${formatDuration(worker.expiresAt - currentTime)} left</li>`
      : `<li><a class="text-link" href="/miners/${encodeURIComponent(worker.name)}">${escapeHtml(worker.name)}</a> · ${worker.cph} cph${worker.oiled ? ' · oiled' : ''}${canControl ? `<div><form method="post" action="/workers/${worker.playerId}/idle"><button class="link">idle</button></form>${worker.oiled ? '' : `<form method="post" action="/workers/${worker.playerId}/oil"><button class="link" ${oil < 1 ? 'disabled' : ''}>oil</button></form>`}</div>` : ''}</li>`).join('');
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
      ? `<p>Rented from <a class="text-link" href="/miners/${encodeURIComponent(factory.ownerName)}">${escapeHtml(factory.ownerName)}</a> · ${formatDuration(factory.rentalExpires - currentTime)} left · repair only.</p>`
      : `<p>Rented to <a class="text-link" href="/miners/${encodeURIComponent(factory.operatorName)}">${escapeHtml(factory.operatorName)}</a> · ${formatDuration(factory.rentalExpires - currentTime)} left.</p>`) : '';
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
  const buildNotice = atRegionalCapital ? '' : regionalCapital
    ? `<p class="capacity-warning">Factories can only be built in a regional capital. Travel to <a class="text-link" href="/map#city-${regionalCapital.id}">${escapeHtml(regionalCapital.name)}</a>, your home city in this region, to build one.</p>`
    : '<p class="capacity-warning">This region does not have an available capital.</p>';
  return `<section class="page-title"><div><p class="eyebrow">Manufacturing</p><h1>Factories</h1></div><p>Production resources are stored per city. Every regional capital is one of your home cities.</p></section>
    <div class="item-grid factory-resources">${resourceCards}</div>
    ${selfWorker}
    <section><h2>Your workforce</h2><ul>${workerRows || '<li>No employees under contract.</li>'}</ul><div class="worker-market">${candidates || '<p>No free workers are based in this city.</p>'}</div></section>
    <section><h2>Local factories</h2><div class="factory-list">${cards || '<p>No factories here.</p>'}</div></section>
    <form method="post" action="/factories/build"><button ${!atRegionalCapital || ore < build.ore || factoryState.activeCount >= factoryState.maximumActive ? 'disabled' : ''}>Build factory · ${build.ore} ore</button></form>${buildNotice}
    <p><a class="text-link" href="/market/factories/rental">Rent Factory</a> · <a class="text-link" href="/market/factories/sale">Buy/Sell Factory</a></p>`;
}

function millsPage(player, catalog, millState, employees, currentTime) {
  const oreItem = catalogItemForSetting(catalog, 'ore_item_id');
  const ore = player.inventory[oreItem.id] ?? 0;
  const build = catalog.factoryActions.find((action) => action.actionKind === 'build');
  const screwItem = catalog.byId.get(millState.screwItemId);
  const requiredScrews = millState.requiredScrews;
  const hasRequiredScrews = millState.screwQuantity >= requiredScrews;
  const localEmployees = employees.filter((employee) =>
    employee.homeCityIds.includes(player.cityId));
  const idleEmployees = localEmployees.filter((employee) => !employee.factoryId);
  const vehicleOptions = millState.vehicles.map((vehicle) =>
    `<option value="${vehicle.id}">${escapeHtml(vehicle.name)} · ${
      vehicle.type === 'sea' ? 'ship' : 'land vehicle'}</option>`).join('');
  const availableWood = millState.wood.filter((wood) =>
    wood.quantity >= 1 + (wood.id === millState.screwItemId ? requiredScrews : 0));
  const woodOptions = availableWood.map((wood) =>
    `<option value="${wood.id}">${escapeHtml(wood.name)} · rarity ${wood.rarity} · ${
      wood.strength} damage · ${wood.quantity} owned</option>`).join('');
  const woodCards = millState.wood.map((wood) => itemCard(catalog.byId.get(wood.id), {
    count: wood.quantity, compact: true,
    meta: `${wood.strength} reinforcement strength${wood.id === millState.screwItemId
      ? ` · ${requiredScrews} required per job` : ''} · In this city`
  })).join('');
  const cards = millState.mills.map((mill) => {
    const progress = mill.components
      ? Math.min(100, mill.componentsDone / mill.components * 100) : 0;
    const progressDetails = mill.actionId
      ? `<div class="factory-progress"><div style="width:${progress.toFixed(2)}%"></div></div><p>${progress.toFixed(1)}% · ${mill.rate} cph${mill.completionAt
        ? ` · ${formatDuration(mill.completionAt - currentTime)} remaining`
        : ' · waiting for workers'}</p>` : '';
    const job = mill.actionId && mill.targetVehicleName
      ? `<p>Reinforcing <strong>${escapeHtml(mill.targetVehicleName)}</strong> with ${
        escapeHtml(mill.itemName)}.</p>` : '';
    const workers = mill.workers.map((worker) => worker.isBot
      ? `<li><strong>🤖 ${escapeHtml(worker.name)}</strong> · ${worker.cph} cph · contract ${formatDuration(worker.expiresAt - currentTime)} left</li>`
      : `<li><a class="text-link" href="/miners/${encodeURIComponent(worker.name)}">${escapeHtml(worker.name)}</a> · ${worker.cph} cph<form method="post" action="/mills/workers/${worker.playerId}/idle"><button class="link">idle</button></form></li>`).join('');
    const assign = idleEmployees.length
      && mill.workers.length < Number(catalog.settings.factory_max_workers)
      ? `<form class="factory-assign" method="post" action="/mills/${mill.id}/assign"><label>Assign worker<select name="workerId">${idleEmployees.map((worker) =>
        `<option value="${worker.playerId}">${escapeHtml(worker.name)} · ${worker.cph} cph</option>`).join('')}</select></label><button>Assign</button></form>` : '';
    const botHire = mill.workers.length < Number(catalog.settings.factory_max_workers)
      ? `<div class="factory-bot-market"><h4>Hire a robot worker</h4><p>Automation contracts last ${formatDuration(Number(catalog.settings.factory_worker_bot_contract_duration_ms))} and contribute to construction or reinforcement work.</p>${catalog.settings.factory_worker_bot_tiers.map((tier) => `<form method="post" action="/mills/${mill.id}/hire-bot"><input type="hidden" name="tierId" value="${tier.id}"><span><strong>🤖 ${escapeHtml(tier.name)}</strong> · ${tier.cph} cph</span><button${player.gold < tier.costGold ? ' disabled' : ''}>Hire · ${formatGold(tier.costGold)}g</button></form>`).join('')}</div>` : '';
    const queueRows = mill.queue.map((queuedJob, index) => `<li><div><strong>${index + 1}. ${escapeHtml(queuedJob.targetVehicleName ?? 'Vehicle')}</strong><small>${escapeHtml(queuedJob.itemName)} · ${queuedJob.screwsReserved} ${escapeHtml(screwItem.name)} reserved · ${Number(queuedJob.components).toLocaleString('en')} components</small></div><div class="factory-queue-actions"><form method="post" action="/mills/${mill.id}/queue/${queuedJob.id}/up"><button class="link" aria-label="Move ${escapeHtml(queuedJob.targetVehicleName ?? 'vehicle')} up"${index === 0 ? ' disabled' : ''}>↑</button></form><form method="post" action="/mills/${mill.id}/queue/${queuedJob.id}/down"><button class="link" aria-label="Move ${escapeHtml(queuedJob.targetVehicleName ?? 'vehicle')} down"${index === mill.queue.length - 1 ? ' disabled' : ''}>↓</button></form><form method="post" action="/mills/${mill.id}/queue/${queuedJob.id}/cancel"><button class="link">Cancel</button></form></div></li>`).join('');
    const queue = mill.built
      ? `<section class="factory-queue"><h4>Reinforcement queue <span>${mill.queue.length}/${mill.queueLimit}</span></h4><p>Wood and screws are reserved as soon as a job is queued.</p><ol>${queueRows || '<li class="muted">No jobs waiting.</li>'}</ol></section>`
      : '';
    const queueFull = mill.queue.length >= mill.queueLimit;
    const reinforce = mill.built
      ? `<form class="factory-action" method="post" action="/mills/${mill.id}/reinforce"><label>Vehicle<select name="vehicleId" required><option value="">Choose vehicle</option>${vehicleOptions}</select></label><label>Wood<select name="woodItemId" required><option value="">Choose Wood</option>${woodOptions}</select></label><button${queueFull || !vehicleOptions || !woodOptions || !hasRequiredScrews ? ' disabled' : ''}>${mill.actionId || mill.queue.length ? 'Add to queue' : 'Start reinforcement'}</button></form>${!vehicleOptions
        ? '<p class="muted">No undamaged, unreinforced land vehicle or ship is available here.</p>' : ''}${!woodOptions
        ? '<p class="muted">No usable Wood is stored in this city.</p>' : ''}${!hasRequiredScrews
        ? `<p class="capacity-warning">Each reinforcement needs ${requiredScrews} ${escapeHtml(screwItem.name)}; ${millState.screwQuantity} available.</p>` : ''}${queueFull
        ? '<p class="capacity-warning">The reinforcement queue is full.</p>' : ''}` : '';
    const cancel = mill.actionId
      ? `<form method="post" action="/mills/${mill.id}/cancel"><button class="secondary">Cancel and refund inputs</button></form>` : '';
    const demolish = mill.built && !mill.actionId && !mill.queue.length
      ? `<form method="post" action="/mills/${mill.id}/demolish"><button class="secondary">Demolish for ore refund</button></form>` : '';
    return `<article class="factory-card"><header><h3>Mill ${mill.id}</h3><span>${mill.built
      ? mill.actionName ? escapeHtml(mill.actionName) : 'Idle'
      : 'Under construction'}</span></header>${job}${progressDetails}${cancel}${queue}${reinforce}${demolish}<h4>Workers</h4><ul>${workers || '<li class="muted">No workers assigned.</li>'}</ul>${assign}${botHire}</article>`;
  }).join('');
  const buildAllowed = millState.unlocked && millState.atRegionalCapital
    && !millState.mills.length && ore >= build.ore;
  const notice = !millState.unlocked
    ? '<p class="capacity-warning">Mills are unlocked in Calbuco and all later regions.</p>'
    : !millState.atRegionalCapital
      ? '<p class="capacity-warning">Mills can only be built and operated in this region’s capital city.</p>'
      : millState.mills.length ? '<p>You may own one mill in each eligible regional capital.</p>' : '';
  return `<section class="page-title"><div><p class="eyebrow">Woodworking</p><h1>Mills</h1></div><p>Turn one Wood thing and ${requiredScrews} ${escapeHtml(screwItem.name)} into a reinforcement layer for a land vehicle or ship. The layer absorbs structural damage first and is destroyed at zero strength.</p></section>
    <div class="item-grid factory-resources">${itemCard(oreItem, { count: ore, compact: true, meta: 'Construction · In this city' })}${woodCards}</div>
    ${notice}<section><h2>Local mills</h2><div class="factory-list">${cards || '<p>No mills here.</p>'}</div></section>
    <form method="post" action="/mills/build"><button${buildAllowed ? '' : ' disabled'}>Build mill · ${build.ore} ore</button></form>
    <p class="muted">Reinforcement protects hull or vehicle structure. It does not protect a ship’s sails or crew, cannot be stacked or topped up, and remains fitted until consumed.</p>`;
}

function chatAnnouncementLabel(chat) {
  const eventKey = String(chat.eventKey ?? '');
  if (chat.kind === 'dwarf-capture' || eventKey.startsWith('dwarf-capture:')) {
    return 'Dwarf found';
  }
  if (eventKey.startsWith('dwarf-stowaway:')) return 'Stowaway';
  if (eventKey.startsWith('ship-sunk:')) return 'Wreck report';
  if (eventKey.startsWith('transport-destroyed:')) return 'Transport lost';
  if (eventKey.startsWith('world-weather:')) return 'Weather';
  if (eventKey.startsWith('world-moon:')) return 'Moon watch';
  if (/^route:\d+:closed:/u.test(eventKey)) return 'Route closed';
  if (/^route:\d+:reopened:/u.test(eventKey)) return 'Route open';
  if (/^ghost:\d+:risen$/u.test(eventKey)) return 'Restless dead';
  if (/^ghost:\d+:defeated$/u.test(eventKey)) return 'Banished';
  if (/^world-creature:\d+:awakened$/u.test(eventKey)) return 'Sighting';
  if (/^world-creature:\d+:escaped$/u.test(eventKey)) return 'Escaped';
  if (/^world-creature:\d+:defeated$/u.test(eventKey)) return 'Hunt won';
  return 'Worldwire';
}

function chatPage(player, chats, ignores, catalog, appearance, historyWindowMs,
  playerRatingTiers = []) {
  const historyHours = Number(historyWindowMs) / (60 * 60 * 1000);
  if (!Number.isFinite(historyHours) || historyHours <= 0) {
    throw new Error('The chat history window is invalid.');
  }
  const appearanceColor = /^[0-9a-f]{6}$/i.test(String(appearance.color))
    ? String(appearance.color).toLowerCase() : '55666b';
  const rows = chats.map((chat) => {
    const sentDate = new Date(Number(chat.createdAt));
    const sentAt = sentDate.toLocaleString('en-GB');
    const sentDay = sentDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
    const sentTime = sentDate.toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit'
    });
    const timestamp = `<time datetime="${sentDate.toISOString()}" title="${escapeHtml(sentAt)}"><span>${escapeHtml(sentDay)}</span><strong>${escapeHtml(sentTime)}</strong></time>`;
    const rowId = `chat-entry-${chat.kind === 'player' ? 'player' : 'world'}-${Number(chat.id)}`;
    const mapIds = [...new Set((chat.mapIds ?? (chat.mapId === null ? [] : [chat.mapId]))
      .map(Number).filter(Number.isSafeInteger))].sort((first, second) => first - second);
    const rowMetadata = ` data-chat-row data-chat-kind="${escapeHtml(chat.kind)}" data-chat-map-ids="${mapIds.join(',')}"${Number(chat.ratingTier) > 0 ? ` data-chat-rating-tier="${Number(chat.ratingTier)}"` : ''}`;
    if (chat.kind !== 'player') {
      const dwarfCapture = chat.kind === 'dwarf-capture';
      const announcementLabel = chatAnnouncementLabel(chat);
      const itemMatch = dwarfCapture
        ? String(chat.path ?? '').match(/^\/items\/(\d+)$/) : null;
      const item = itemMatch ? catalog.byId.get(Number(itemMatch[1])) : null;
      const classes = dwarfCapture ? `chat-row-world chat-row-dwarf rarity-${item?.rarity ?? 0}`
        : 'chat-row-world';
      const label = `<span class="chat-world-kind">${escapeHtml(announcementLabel)}</span>`;
      const message = item
        ? `<a class="chat-world-message chat-dwarf-item rarity-${item.rarity}" href="/items/${item.id}"><img src="${escapeHtml(item.icon)}" alt=""><span>${escapeHtml(chat.body)}</span></a>`
        : `<a class="chat-world-message" href="${escapeHtml(chat.path)}">${escapeHtml(chat.body)}</a>`;
      return `<article id="${rowId}" class="chat-row ${classes}" data-chat-created-at="${Number(chat.createdAt)}"${rowMetadata}${chat.kind === 'world' ? ' hidden' : ''}><span class="chat-identity chat-world-identity"><i aria-hidden="true"></i>${label}</span>${message}${timestamp}</article>`;
    }
    const color = /^[0-9a-f]{6}$/i.test(String(chat.color))
      ? String(chat.color).toLowerCase() : '55666b';
    const speaker = escapeHtml(chat.playerName);
    const rowAction = chat.playerId === player.id
      ? '<span class="chat-row-owner">You</span>'
      : `<form method="post" action="/chat/ignores/${chat.playerId}"><input type="hidden" name="ignored" value="1"><button class="link chat-ignore-action" aria-label="Ignore ${speaker} in public chat">Ignore</button></form>`;
    return `<article id="${rowId}" class="chat-row chat-row-player" style="--chat-color:#${color}" data-chat-created-at="${Number(chat.createdAt)}"${rowMetadata}><span class="chat-identity"><i aria-hidden="true"></i><a class="chat-speaker" href="/miners/${encodeURIComponent(chat.playerName)}">${speaker}</a></span><span class="chat-message">${escapeHtml(chat.body)}</span>${timestamp}${rowAction}</article>`;
  }).join('');
  const ignoredRows = ignores.map((ignored) => `<li><a class="text-link" href="/miners/${encodeURIComponent(ignored.name)}">${escapeHtml(ignored.name)}</a><form method="post" action="/chat/ignores/${ignored.id}"><input type="hidden" name="ignored" value="0"><button class="link">Unignore</button></form></li>`).join('');
  const colorPicker = appearance.canChooseColor
    ? `<div class="chat-color-control" style="--chat-preview:#${appearanceColor}"><span class="chat-control-label">Signal colour</span><label class="chat-color-picker" for="chat-color"><input id="chat-color" type="color" name="color" value="#${appearanceColor}" aria-describedby="chat-color-help"><span>Choose colour</span></label><small id="chat-color-help">Saved when you transmit.</small></div>`
    : `<div class="chat-color-control" style="--chat-preview:#${appearanceColor}"><span class="chat-control-label">Signal colour</span><p><i aria-hidden="true"></i>Meld colour</p><small>Your signal advances with melds (${appearance.meldCount}/${appearance.customMinimumMelds} for a custom colour).</small></div>`;
  const composer = player.chatBanned
    ? `<div class="chat-compose chat-compose-locked" role="note"><div><span class="chat-control-label">Broadcast disabled</span><strong>Your account is not permitted to use public chat.</strong></div></div>`
    : `<form id="chat-compose-form" class="chat-compose" method="post" action="/chat"><label class="chat-message-control" for="chat-message"><span>Transmit from this region</span><input id="chat-message" name="body" maxlength="${Number(catalog.settings.chat_message_max_length)}" placeholder="What is happening out there?" autocomplete="off" required></label>${colorPicker}<button class="chat-send"><span>Send</span><b aria-hidden="true">&nearr;</b></button></form>`;
  const discoveredMapIds = playerDiscoveredMapIds(player, catalog);
  const regions = catalog.maps.filter((map) => discoveredMapIds.has(Number(map.id)))
    .sort((first, second) => Number(first.sortOrder) - Number(second.sortOrder)
      || first.name.localeCompare(second.name, 'en'));
  const regionFilters = regions.map((map) => `<label><input type="checkbox" value="${Number(map.id)}" data-chat-hidden-region> <span>${escapeHtml(map.name)}</span></label>`).join('');
  const fleetTiers = [...new Set(playerRatingTiers.map(Number)
    .filter((value) => Number.isFinite(value) && value > 0))].sort((first, second) => first - second);
  const ownedTiers = new Set(fleetTiers);
  const ratingTierFilters = Array.from({ length: 6 }, (_, index) => index + 1)
    .map((tier) => `<label><input type="checkbox" value="${tier}" data-chat-rating-tier> <span>Rank ${tier}${ownedTiers.has(tier) ? ' <small>Yours</small>' : ''}</span></label>`).join('');
  const defaultVisibleCount = chats.filter((chat) => chat.kind !== 'world').length;
  const filterPanel = `<section id="chat-filters" class="chat-filter-card" data-chat-filters data-chat-player-id="${Number(player.id)}"><p class="chat-side-label">Filter traffic</p><fieldset><legend>Rating tiers</legend><p>Select any combination. No selection shows every tier.</p><div class="chat-tier-filters">${ratingTierFilters}</div></fieldset><label class="chat-filter-toggle"><input type="checkbox" data-chat-hide-world-events checked><span><strong>Hide world events</strong><small>Keep miner chat and Dwarf captures.</small></span></label><fieldset><legend>Hide regions</legend><div class="chat-region-filters">${regionFilters || '<span>No discovered regions.</span>'}</div></fieldset><footer><span data-chat-filter-summary>${defaultVisibleCount.toLocaleString('en-GB')} of ${chats.length.toLocaleString('en-GB')} visible.</span><button class="link" type="button" data-chat-filter-reset>Reset</button></footer></section>`;
  const transmissionCount = `${defaultVisibleCount.toLocaleString('en-GB')} of ${chats.length.toLocaleString('en-GB')}`;
  const transmissionLabel = defaultVisibleCount === 1 ? 'transmission' : 'transmissions';
  return `<article class="chat-page">
    <section class="page-title"><div><p class="eyebrow">Discovered regions · open record</p><h1>Public chat</h1></div><p>This frequency combines miner talk and world events from the regions you have discovered.</p></section>
    <dl class="chat-facts"><div><dt>Channel status</dt><dd><span id="chat-live-status" class="chat-live-status" data-state="connecting" role="status" aria-live="polite"><i aria-hidden="true"></i><span data-live-label>Connecting</span></span></dd></div><div><dt>Open record</dt><dd>${historyHours.toLocaleString('en-GB')} hours</dd></div><div><dt>Traffic in view</dt><dd id="chat-traffic-count">${transmissionCount} ${transmissionLabel}</dd></div></dl>
    <div class="chat-workspace"><section class="chat-console" aria-labelledby="chat-console-title"><header class="chat-console-header"><div><p>MT2 // Worldwire</p><h2 id="chat-console-title">Open frequency</h2></div><p>Showing the latest ${historyHours.toLocaleString('en-GB')} hours. New traffic arrives live.</p></header><div id="chat-log" class="chat-list" role="log" aria-label="Public chat messages" aria-live="polite" aria-relevant="additions text" tabindex="0">${rows || '<div class="chat-empty" data-chat-unfiltered-empty><span aria-hidden="true">◇</span><h3>The frequency is quiet.</h3><p>Be the first miner to break the silence.</p></div>'}<div id="chat-filter-empty" class="chat-empty chat-filter-empty" hidden><span aria-hidden="true">◇</span><h3>No matching traffic.</h3><p>Change or reset your chat filters.</p></div></div>${composer}</section>
    <aside class="chat-sidecar" aria-label="Public chat controls">${filterPanel}<section class="chat-signal-card" style="--chat-preview:#${appearanceColor}"><p class="chat-side-label">Your signal</p><div><i aria-hidden="true"></i><strong>${escapeHtml(player.name)}</strong></div><p>${appearance.canChooseColor ? 'Custom colour unlocked. Choose it when you transmit.' : `Meld tier colour · ${appearance.meldCount}/${appearance.customMinimumMelds} melds`}</p></section><details class="chat-ignores"><summary><span><b>Channel controls</b><small>Ignored miners</small></span><strong>${ignores.length}</strong></summary><ul>${ignoredRows || '<li>Nobody ignored.</li>'}</ul></details><section class="chat-channel-note"><p class="chat-side-label">On this channel</p><p>World events and captured Dwarves from your discovered regions are public record.</p></section></aside></div>
  </article><script src="/node/chat-filters.js?v=20260905a" defer></script>`;
}

function legacyCasinoPage(state) {
  const { rules, symbols, selectedSpin } = state;
  const symbolById = new Map([...symbols, ...rules.bonusSymbols]
    .map((symbol) => [String(symbol.id), symbol]));
  const previewIds = [277, 'shift-bell', 278, 'twin-drill', 282, 'golden-fuse', 279, 1524, 280];
  const replaySourceFrames = selectedSpin?.frames?.length > 1 ? selectedSpin.frames : [];
  const initialFrame = replaySourceFrames[0] ?? selectedSpin;
  const grid = initialFrame?.grid?.length === 9
    ? initialFrame.grid : previewIds.map((symbolId) =>
      symbolById.get(String(symbolId)) ?? symbols[0]);
  const winningCells = new Set(replaySourceFrames.length
    ? (initialFrame.wins ?? []).flatMap((win) => win.cells ?? [])
    : selectedSpin?.winningCells ?? []);
  const cells = grid.map((symbol, index) => {
    const item = symbolById.get(String(symbol.id)) ?? symbol;
    const bonus = item.kind === 'bonus';
    const winning = winningCells.has(index);
    return `<div class="casino-reel-cell${bonus ? ` casino-bonus-cell casino-bonus-${escapeHtml(item.id)}` : ` rarity-${Number(item.rarity)}`}${winning ? ' is-winning' : ''}" data-casino-cell="${index}"${bonus ? ` data-casino-bonus="${escapeHtml(item.id)}"` : ''}${winning ? ' data-winning="true"' : ''}>
      <span class="casino-symbol-halo" aria-hidden="true"></span>
      ${bonus ? `<span class="casino-bonus-glyph" aria-hidden="true">${escapeHtml(item.glyph)}</span>` : `<img src="${escapeHtml(item.icon)}" alt="">`}
      <strong>${escapeHtml(item.name)}</strong><small>${bonus ? 'Bonus symbol' : escapeHtml(item.rarityName)}</small>
    </div>`;
  }).join('');
  const amount = (value, spin = selectedSpin) => spin?.currencyKind === 'gold'
    ? `${formatGold(value)}g`
    : `${Number(value).toLocaleString('en-GB')} ${escapeHtml(spin?.currencySymbol ?? '')}`;
  const frameCount = selectedSpin?.frames?.length || (selectedSpin ? 1 : 0);
  const replayFrames = replaySourceFrames.length
    ? replaySourceFrames.map((frame) => ({
      grid: frame.grid.map((symbol) => ({
        id: symbol.id, name: symbol.name, icon: symbol.icon,
        rarity: symbol.rarity, rarityName: symbol.rarityName,
        kind: symbol.kind, glyph: symbol.glyph
      })),
      winningCells: [...new Set((frame.wins ?? []).flatMap((win) => win.cells ?? []))],
      multiplier: frame.multiplier,
      bonusSpinsAwarded: frame.bonusSpinsAwarded,
      jackpot: frame.jackpot
    })) : [];
  const replayActive = replayFrames.length > 1;
  const replayData = replayFrames.length
    ? ` data-casino-frames="${escapeHtml(JSON.stringify(replayFrames))}"` : '';
  const bonusSummary = selectedSpin?.bonusSpinsAwarded
    ? `<div class="casino-bonus-summary"><strong>${selectedSpin.bonusSpinsAwarded} free respin${selectedSpin.bonusSpinsAwarded === 1 ? '' : 's'}</strong><span>${selectedSpin.bonusWinMultiplier > 1 ? `Golden Fuse raised all winnings to ${selectedSpin.bonusWinMultiplier}&times;` : 'Every bonus spin was included in this return.'}</span></div>` : '';
  const frameTrail = selectedSpin?.frames?.length > 1
    ? `<details class="casino-result-details"><summary>View ${selectedSpin.frames.length}-spin trail</summary><div class="casino-respin-trail">${selectedSpin.frames.map((frame, index) => {
      const bonuses = (frame.bonusSymbols ?? []).map((symbol) => symbol.name).join(' + ');
      return `<div${bonuses ? ' class="has-bonus"' : ''}><small>${index ? `Respin ${index}` : 'Paid spin'}</small><strong>${Number(frame.multiplier)}&times;</strong><span>${bonuses ? `${escapeHtml(bonuses)}${frame.bonusSpinsAwarded ? ` · +${frame.bonusSpinsAwarded}` : ''}` : 'No bonus symbol'}</span></div>`;
    }).join('')}</div></details>` : '';
  const resultOutcome = selectedSpin?.jackpot
    ? 'is-jackpot' : selectedSpin?.multiplier ? 'is-win' : 'is-loss';
  const result = selectedSpin ? `<section class="casino-result ${replayActive ? 'is-replaying' : resultOutcome}" data-casino-outcome="${resultOutcome}" aria-live="polite">
    <p class="casino-replay-status" id="casino-replay-status"${replayActive ? '>Free spins starting&hellip;' : ' hidden>'}</p>
    <p class="casino-result-kicker">${selectedSpin.jackpot ? 'Grand jackpot' : selectedSpin.multiplier ? `${selectedSpin.wins.length} winning award${selectedSpin.wins.length === 1 ? '' : 's'} across ${frameCount} spin${frameCount === 1 ? '' : 's'}` : selectedSpin.bonusSpinsAwarded ? `No win after ${selectedSpin.bonusSpinsAwarded} free respin${selectedSpin.bonusSpinsAwarded === 1 ? '' : 's'}` : 'No winning awards'}</p>
    <strong>${selectedSpin.jackpot ? 'THE MOUNTAIN MOVED' : selectedSpin.multiplier ? `${selectedSpin.multiplier}&times; payout` : 'The house keeps this one'}</strong>
    <span>Bet ${amount(selectedSpin.wager)} &middot; Returned ${amount(selectedSpin.payout)} &middot; ${selectedSpin.net >= 0 ? '+' : ''}${amount(selectedSpin.net)}</span>
    ${bonusSummary}${frameTrail}
    ${selectedSpin.wins.length ? `<details class="casino-result-details"><summary>View ${selectedSpin.wins.length} award detail${selectedSpin.wins.length === 1 ? '' : 's'}</summary><ul>${selectedSpin.wins.map((win) => `<li><b>${escapeHtml(win.name)}${frameCount > 1 ? ` <small>spin ${Number(win.spinIndex) + 1}</small>` : ''}</b><span>${escapeHtml(win.itemName)} &middot; ${Number(win.multiplier)}&times;</span></li>`).join('')}</ul></details>` : ''}
  </section>` : '<p class="casino-ready" id="casino-status" role="status">Nine windows. Eight lines. One pull.</p>';

  const goldMaximum = Math.max(0, Math.min(rules.maximumGoldWager, Math.floor(state.gold)));
  const rememberedCurrency = String(state.lastBet?.currency ?? 'gold');
  const rememberedCryptoId = Number(/^crypto:(\d+)$/.exec(rememberedCurrency)?.[1]);
  const rememberedCrypto = state.currencies.find((currency) =>
    currency.id === rememberedCryptoId);
  const selectedCurrency = rememberedCrypto ? `crypto:${rememberedCrypto.id}` : 'gold';
  const rememberedWager = Number.isSafeInteger(Number(state.lastBet?.wager))
    && Number(state.lastBet.wager) > 0 ? Number(state.lastBet.wager) : 1;
  const cryptoBalanceText = (currency) => `${currency.quantity.toLocaleString('en-GB')} ${
    escapeHtml(currency.symbol)} available${currency.voucherQuantity > 0
    ? `, including ${currency.voucherQuantity.toLocaleString('en-GB')} voucher` : ''}`;
  const initialMaximum = rememberedCrypto
    ? Math.min(rules.maximumCryptoWager, rememberedCrypto.quantity) : goldMaximum;
  const initialBalance = rememberedCrypto
    ? cryptoBalanceText(rememberedCrypto)
    : `${formatGold(state.gold)}g available`;
  const currencyOptions = [
    `<option value="gold"${selectedCurrency === 'gold' ? ' selected' : ''} data-balance="${formatGold(state.gold)}" data-max="${goldMaximum}" data-unit="gold">Gold &middot; ${formatGold(state.gold)}g available</option>`,
    ...state.currencies.map((currency) => `<option value="crypto:${currency.id}"${selectedCurrency === `crypto:${currency.id}` ? ' selected' : ''} data-balance="${currency.quantity}" data-voucher="${Number(currency.voucherQuantity ?? 0)}" data-max="${Math.min(rules.maximumCryptoWager, currency.quantity)}" data-unit="${escapeHtml(currency.symbol)}">${escapeHtml(currency.name)} (${escapeHtml(currency.symbol)}) &middot; ${cryptoBalanceText(currency)}</option>`)
  ].join('');
  const paytable = symbols.map((symbol) => {
    const multiplier = rules.payoutMultipliersByItemId[symbol.id] ?? rules.ordinaryMultiplier;
    const explosive = Object.hasOwn(rules.payoutMultipliersByItemId, symbol.id);
    return `<li class="rarity-${symbol.rarity}${symbol.id === rules.jackpotItemId ? ' is-top-symbol' : ''}"><img src="${escapeHtml(symbol.icon)}" alt=""><span><strong>${escapeHtml(symbol.name)}</strong><small>${explosive ? '3 on a line' : 'Mine Thing · 3 on a line'}</small></span><b>${multiplier}&times;</b></li>`;
  }).join('');
  const shortMatchAwards = Array.from(
    { length: 5 - rules.explosiveSmallMatchMinimum },
    (_, index) => rules.explosiveSmallMatchMinimum + index
  )
    .map((count) => `<li><strong>${count} matching</strong><span>Flat ${rules.explosiveSmallMatchMultiplier}&times; payout</span></li>`)
    .join('');
  const scatterAwards = Object.entries(rules.explosiveScatterCountFactors)
    .map(([count, factor]) => `<li><strong>${count} matching</strong><span>${factor}&times; that explosive&rsquo;s line payout</span></li>`).join('');
  const bonusPaytable = rules.bonusSymbols.map((symbol) => `<li class="casino-bonus-${escapeHtml(symbol.id)}"><span class="casino-bonus-glyph" aria-hidden="true">${escapeHtml(symbol.glyph)}</span><span><strong>${escapeHtml(symbol.name)}</strong><small>${escapeHtml(symbol.description)}</small></span></li>`).join('');
  const paylines = rules.paylines.map((line, index) => `<li><span>${String(index + 1).padStart(2, '0')}</span><strong>${escapeHtml(line.name)}</strong><small>${line.cells.map((cell) => cell + 1).join(' - ')}</small></li>`).join('');
  const concealDuringReplay = (finalMarkup, waitingMarkup = '&mdash;') => replayActive
    ? `<span data-casino-concealed>${waitingMarkup}</span><span data-casino-reveal hidden>${finalMarkup}</span>`
    : finalMarkup;
  const history = state.recentSpins.map((spin) => {
    const current = spin.id === selectedSpin?.id;
    const finalResult = spin.jackpot
      ? '<strong>JACKPOT</strong>' : spin.multiplier ? `${spin.multiplier}&times;` : '&mdash;';
    return `<tr${current ? ' class="is-current"' : ''}><td><a class="text-link" href="/casino?spin=${spin.id}">#${spin.id}</a></td><td>${new Date(spin.createdAt).toLocaleString('en-GB')}</td><td>${amount(spin.wager, spin)}</td><td>${current ? concealDuringReplay(finalResult, 'Free spins in play') : finalResult}</td><td>${current ? concealDuringReplay(amount(spin.payout, spin)) : amount(spin.payout, spin)}</td></tr>`;
  }).join('');

  return `<div class="casino-page">
    <section class="page-title"><div><p class="eyebrow">When the tunnels fall quiet</p><h1>The Quiet Shift Casino</h1></div><p>One machine, nine Things, and enough explosives to make probability nervous.</p></section>
    <dl class="casino-stats"><div><dt>Global spins</dt><dd>${Number(state.stats.globalSpinCount ?? state.stats.spinCount).toLocaleString('en-GB')}</dd></div><div><dt>Your pulls</dt><dd>${state.stats.spinCount.toLocaleString('en-GB')}</dd></div><div><dt>Best return</dt><dd>${concealDuringReplay(`${state.stats.bestMultiplier}&times;`, '?')}</dd></div><div><dt>Jackpots</dt><dd>${concealDuringReplay(state.stats.jackpotCount, '?')}</dd></div></dl>
    <article class="casino-machine${selectedSpin?.jackpot && !replayActive ? ' has-jackpot' : ''}" id="casino-machine"${replayData}${replayActive ? ' aria-busy="true"' : ''}>
      <div class="casino-marquee"><span aria-hidden="true"></span><p>THE THING-O-MATIC</p><strong>Lines · scatters · stacking respins</strong></div>
      <div class="casino-machine-body">
        <div class="casino-screen-frame"><div class="casino-reel-grid" aria-label="${replayActive ? 'Paid spin before free spins' : selectedSpin ? 'Final slot result' : 'Slot preview'}">${cells}</div><i class="casino-payline casino-payline-a" aria-hidden="true"></i><i class="casino-payline casino-payline-b" aria-hidden="true"></i></div>
        <form class="casino-controls" id="casino-spin-form" method="post" action="/casino/spin">
          <label><span>Stake currency</span><select id="casino-currency" name="currency">${currencyOptions}</select></label>
          <label><span>Bet</span><input id="casino-wager" type="number" name="wager" min="1" max="${Math.max(1, initialMaximum)}" step="1" value="${rememberedWager}" required inputmode="numeric"><small id="casino-balance">${initialBalance}</small></label>
          <button class="casino-pull" id="casino-pull"${initialMaximum < 1 || replayActive ? ' disabled' : ''}><span>${replayActive ? 'Free spins running' : 'Pull the lever'}</span><i aria-hidden="true"></i></button>
        </form>
        ${result}
      </div>
      <footer><span>MINIMUM 1</span><strong>PAYOUTS INCLUDE YOUR STAKE</strong><span>MAXIMUM 1,000</span></footer>
    </article>
    <section class="casino-bonus-rules"><div><p class="eyebrow">Special symbols</p><h2>The shift can keep going</h2><p>Every special symbol awards its effect independently. Multiple copies and different specials can land together; up to ${rules.maximumBonusSpins} free respins can be added to one paid pull.</p></div><ul>${bonusPaytable}</ul></section>
    <section class="casino-rules"><div><p class="eyebrow">Paytable</p><h2>Lines, explosive matches, and scatters</h2><p>Three matching symbols on any completed row, column, or diagonal pay the listed amount. Three or four copies of the same explosive anywhere on the reels also pay a flat ${rules.explosiveSmallMatchMultiplier}&times; award. Five or more pay a rarity-scaled scatter award. Line, match, scatter, jackpot, and respin awards all stack.</p><ul class="casino-paytable">${paytable}</ul><h3 class="casino-scatter-title">Explosive matches and scatters</h3><ul class="casino-scatter-paytable">${shortMatchAwards}${scatterAwards}</ul></div><aside><p class="eyebrow">Grand prize</p><h2>Nine BLU-82s</h2><p>Fill every window with the legendary explosive for a ${rules.jackpotBonusMultiplier.toLocaleString('en-GB')}&times; jackpot bonus, plus its eight line payouts and nine-symbol scatter award.</p><div class="casino-jackpot-odds"><span>Jackpot trigger</span><strong>1 in ${rules.jackpotChanceDenominator.toLocaleString('en-GB')}</strong><small>Every paid spin and free respin is independently resolved by the server.</small></div><ol class="casino-paylines">${paylines}</ol></aside></section>
    <section class="casino-history"><div class="section-heading"><div><p class="eyebrow">Machine ledger</p><h2>Recent pulls</h2></div></div><div class="table-scroll"><table><thead><tr><th>Pull</th><th>When</th><th>Bet</th><th>Result</th><th>Returned</th></tr></thead><tbody>${history || '<tr><td colspan="5">The reels are waiting for their first pull.</td></tr>'}</tbody></table></div></section>
  </div><script src="/node/casino.js?v=20260829f" defer></script>`;
}

const CASINO_PRESENTATIONS = Object.freeze({
  'thing-o-matic': Object.freeze({
    theme: 'thing-o-matic', pickerCopy: 'The original: eight lines, explosive matches, and stacking free respins.',
    pageCopy: 'Three house machines and one cabinet found only in this region.',
    previewIds: [277, 'shift-bell', 278, 'twin-drill', 282, 'golden-fuse', 279, 1524, 280],
    marquee: 'THE THING-O-MATIC', tagline: 'Lines · scatters · stacking respins',
    cabinetBadge: 'Original house machine',
    ready: 'Nine windows. Eight lines. One pull.', pullLabel: 'Pull the lever',
    replayStart: 'Free spins starting&hellip;', replayRunning: 'Free spins running',
    replayWaiting: 'Free spins in play', frameNoun: 'spin', jackpotResult: 'THE MOUNTAIN MOVED',
    featureEyebrow: 'Special symbols', featureTitle: 'The shift can keep going',
    rulesTitle: 'Lines, explosive matches, and scatters', jackpotTitle: 'Nine BLU-82s',
    topSymbolId: 282
  }),
  'bromo-sporefall': Object.freeze({
    theme: 'bromo-sporefall', pickerCopy: 'Connect shrooms, compost the cluster, and cascade again.',
    pageCopy: 'Three house machines and one cabinet found only in this region.',
    previewIds: [1434, 1435, 1434, 1436, 1437, 1438, 1439, 1435, 1436],
    marquee: 'BROMO SPOREFALL', tagline: 'Connect · compost · cascade',
    ready: 'Connect three matching shrooms. Fresh caps fall into their places.',
    pullLabel: 'Start the drop', replayStart: 'The spores are still falling&hellip;',
    replayRunning: 'Cascades resolving', replayWaiting: 'Cascade in play',
    frameNoun: 'drop', jackpotResult: 'THE CAVE BLOOMS',
    featureEyebrow: 'Cascade rules', featureTitle: 'Every match feeds the next fall',
    rulesTitle: 'Build connected shroom clusters', jackpotTitle: 'Nine Crowns of Bromo',
    topSymbolId: 1439
  }),
  'kings-lockbox': Object.freeze({
    theme: 'kings-lockbox', pickerCopy: 'Reveal relics, lock them in place, and respin the soot.',
    pageCopy: 'Three house machines and one cabinet found only in this region.',
    previewIds: [1555, 1554, 1560, 1554, 1554, 1554, 1566, 1554, 1554],
    marquee: "THE KING'S LOCKBOX", tagline: 'Three relics · hold · respin',
    ready: 'Reveal three relics to wake the lockbox. Soot-Clogged Coins are duds.',
    pullLabel: 'Open the lockbox', replayStart: 'The lockbox is opening&hellip;',
    replayRunning: 'Lockbox respins running', replayWaiting: 'Lockbox in play',
    frameNoun: 'reveal', jackpotResult: 'THE LOCKBOX OPENS',
    featureEyebrow: 'Lockbox rules', featureTitle: 'New relics reset the counter',
    rulesTitle: 'Every locked relic pays', jackpotTitle: 'Fill all nine locks',
    topSymbolId: 1582
  }),
  'cinderwake-fuse-five': Object.freeze({
    theme: 'regional', accent: '#ff9b21', shade: '#491309', metal: '#ffd06d',
    pickerCopy: 'Aso exclusive · two six-charge fuse banks packed with weapons and explosives.',
    pageCopy: 'The Aso floor adds a wide twelve-window powder magazine to the three travelling house machines.',
    previewIds: [277, 162, 167, 172, 177, 182, 162, 167, 172, 177, 182, 277],
    marquee: 'CINDERWAKE POWDER LINE', tagline: 'Six across · two fuse banks',
    cabinetBadge: 'Aso exclusive', ready: 'Twelve charges share one magazine. Complete a fuse, a powder bay, or ignite the lot.',
    pullLabel: 'Light the fuse', replayStart: '', replayRunning: 'Fuse burning',
    replayWaiting: 'Fuse in play', frameNoun: 'stop', jackpotResult: 'THE MAGAZINE GOES UP',
    featureEyebrow: 'Powder-line rules', featureTitle: 'Short fuses feed three much larger magazines',
    rulesTitle: 'Ignite one of eight named charges', jackpotTitle: 'Twelve Flame Throwers',
    topSymbolId: 182, glyphs: ['6×2', '▰', '✦']
  }),
  'ashfall-spore-ring': Object.freeze({
    theme: 'regional', accent: '#b9f06d', shade: '#3a174f', metal: '#76d692',
    pickerCopy: 'Bromo exclusive · a twenty-cell living garden of shrooms, bugs, bait, and fish.',
    pageCopy: 'The Bromo floor adds a four-tier living spore garden to the three travelling house machines.',
    previewIds: [1434, 207, 312, 1437, 328, 207, 312, 1437, 328, 1438, 312, 1437, 328, 1438, 1439, 1437, 328, 1438, 1439, 1434],
    marquee: 'ASHFALL SPORE RING', tagline: 'Five wide · four layers deep',
    cabinetBadge: 'Bromo exclusive', ready: 'Twenty living symbols wait beneath the ash. Grow a bed, call the rain, or close the ring.',
    pullLabel: 'Turn the ring', replayStart: '', replayRunning: 'Ring turning',
    replayWaiting: 'Ring in play', frameNoun: 'stop', jackpotResult: 'THE DESERT FLOWERS',
    featureEyebrow: 'Spore-ring rules', featureTitle: 'Beds, rain columns, diagonals, roots, and four winds',
    rulesTitle: 'Grow across thirteen named paths', jackpotTitle: 'Twenty Crowns of Bromo',
    topSymbolId: 1439, glyphs: ['5×4', '╳', '◇']
  }),
  'stormcrag-timber-twins': Object.freeze({
    theme: 'regional', accent: '#8bd8ff', shade: '#102b41', metal: '#c6a36a',
    pickerCopy: 'Calbuco exclusive · an eighteen-window storm rack built from timber, vehicles, and music.',
    pageCopy: 'The Calbuco floor adds a six-bay, three-storey timber rack to the three travelling house machines.',
    previewIds: [1468, 151, 1474, 233, 1484, 1489, 151, 1474, 233, 1484, 1489, 1468, 1474, 233, 1484, 1489, 1468, 151],
    marquee: 'STORMCRAG THUNDER RACK', tagline: 'Six posts · three storm beams',
    cabinetBadge: 'Calbuco exclusive', ready: 'Stand three matching Things into a post or carry one symbol along an entire storm beam.',
    pullLabel: 'Drop the timbers', replayStart: '', replayRunning: 'Timbers falling',
    replayWaiting: 'Rack in play', frameNoun: 'drop', jackpotResult: 'THE WORLD TREE FALLS',
    featureEyebrow: 'Timber-rack rules', featureTitle: 'Six quick posts support three enormous beams',
    rulesTitle: 'Raise posts, beams, and lightning braces', jackpotTitle: 'Eighteen Worldtree Heartwoods',
    topSymbolId: 1489, glyphs: ['6×3', '━', 'ϟ']
  }),
  'emberdeep-three-verses': Object.freeze({
    theme: 'regional', accent: '#ff7557', shade: '#3b1015', metal: '#e6b76b',
    pickerCopy: 'Dempo exclusive · a tall five-verse poet fed with Wisdom, spice, and music.',
    pageCopy: 'The Dempo floor adds a twenty-window mechanical poem tower to the three travelling house machines.',
    previewIds: [1494, 127, 238, 1504, 127, 238, 1504, 115, 238, 1504, 115, 1514, 1504, 115, 1514, 1519, 115, 1514, 1519, 1494],
    marquee: 'EMBERDEEP FIVE VERSES', tagline: 'Four words · five verses tall',
    cabinetBadge: 'Dempo exclusive', ready: 'Read across five verses, down four secret readings, or follow a season through the poem.',
    pullLabel: 'Compose a verse', replayStart: '', replayRunning: 'Ink moving',
    replayWaiting: 'Verse in play', frameNoun: 'verse', jackpotResult: 'THE FORBIDDEN VERSE',
    featureEyebrow: 'Poet-engine rules', featureTitle: 'Five horizontal verses conceal eight vertical and seasonal readings',
    rulesTitle: 'Complete one of thirteen readings', jackpotTitle: 'Twenty Invisible Cartels',
    topSymbolId: 1519, glyphs: ['三', '│', '／']
  }),
  'frostmere-aurora-mirror': Object.freeze({
    theme: 'regional', accent: '#72f1e2', shade: '#0b2541', metal: '#b6d9ed',
    pickerCopy: 'Ebeko exclusive · a twenty-four-node electronic sky of gadgets, mods, and machines.',
    pageCopy: 'The Ebeko floor adds a six-circuit aurora wall to the three travelling house machines.',
    previewIds: [1524, 253, 265, 1132, 266, 1355, 253, 265, 1132, 266, 1355, 1549, 265, 1132, 266, 1355, 1549, 1361, 1132, 266, 1355, 1549, 1361, 1524],
    marquee: 'FROSTMERE AURORA WALL', tagline: 'Six circuits · four bands of light',
    cabinetBadge: 'Ebeko exclusive', ready: 'Charge a complete circuit, span an aurora band, or bring the cold core online.',
    pullLabel: 'Charge the aurora', replayStart: '', replayRunning: 'Aurora charging',
    replayWaiting: 'Aurora in play', frameNoun: 'pulse', jackpotResult: 'THE SKY BECOMES A CIRCUIT',
    featureEyebrow: 'Aurora rules', featureTitle: 'Wide light bands cross six rigid vertical circuits',
    rulesTitle: 'Complete circuits, bands, pulses, and core', jackpotTitle: 'Twenty-four Horizons',
    topSymbolId: 1361, glyphs: ['6×4', '│', '⌒']
  }),
  'brimstone-furnace-four': Object.freeze({
    theme: 'regional', accent: '#ff4b21', shade: '#250706', metal: '#f2a23b',
    pickerCopy: 'Fogo exclusive · a full five-by-five furnace packed with relics and heavy cannon iron.',
    pageCopy: 'The Fogo floor adds a twenty-five-door square furnace to the three travelling house machines.',
    previewIds: [1554, 304, 1564, 308, 1574, 304, 1564, 308, 1574, 1579, 1564, 308, 1574, 1579, 1554, 308, 1574, 1579, 1554, 304, 1574, 1579, 1554, 304, 1564],
    marquee: 'BRIMSTONE GRAND FURNACE', tagline: 'Five by five · seventeen firing paths',
    cabinetBadge: 'Fogo exclusive', ready: 'Fire a course, clear a flue, fill a corner crucible, or strike the molten heart.',
    pullLabel: 'Fire the furnace', replayStart: '', replayRunning: 'Furnace firing',
    replayWaiting: 'Furnace in play', frameNoun: 'firing', jackpotResult: 'THE CLOSED EYE OPENS',
    featureEyebrow: 'Furnace rules', featureTitle: 'Courses and flues cross four crucibles around a molten heart',
    rulesTitle: 'Fill one of seventeen furnace paths', jackpotTitle: 'Twenty-five Throne-Shards',
    topSymbolId: 1579, glyphs: ['▦', '□', '◆']
  }),
  'tzolkin-worldwheel-seven': Object.freeze({
    theme: 'regional', accent: '#ffd454', shade: '#14303d', metal: '#e46f2d',
    pickerCopy: 'Gallego exclusive · an eight-gate transport board spanning road, rail, and sea.',
    pageCopy: 'The Gallego floor adds a panoramic twenty-four-window departure board to the three travelling house machines.',
    previewIds: [154, 283, 151, 148, 292, 295, 1584, 1585, 283, 151, 148, 292, 295, 1584, 1585, 154, 151, 148, 292, 295, 1584, 1585, 154, 283],
    marquee: "TZOLK'IN WORLDWHEEL", tagline: 'Eight gates · three world circuits',
    cabinetBadge: 'Gallego exclusive', ready: 'Line up a gate, catch a local, or send one transport around the entire world circuit.',
    pullLabel: 'Turn the worldwheel', replayStart: '', replayRunning: 'World turning',
    replayWaiting: 'Wheel in play', frameNoun: 'turn', jackpotResult: 'THE OLD WORLD TURNS',
    featureEyebrow: 'Worldwheel rules', featureTitle: 'Eight gates bind three complete transport circuits',
    rulesTitle: 'Match gates, locals, circuits, or corners', jackpotTitle: 'Twenty-four Train Carriages',
    topSymbolId: 1585, glyphs: ['8×3', '↔', '◎']
  })
});

export function casinoPage(state) {
  if (!state?.machine) return legacyCasinoPage(state);
  const { machine, rules, symbols, selectedSpin } = state;
  const presentation = CASINO_PRESENTATIONS[machine?.key]
    ?? CASINO_PRESENTATIONS[THING_O_MATIC_KEY];
  const isThingOMatic = machine.key === THING_O_MATIC_KEY;
  const isSporefall = machine.key === 'bromo-sporefall';
  const isLockbox = machine.key === 'kings-lockbox';
  const isRegional = machine.mechanic === 'regional-pattern';
  const bonusSymbols = Array.isArray(rules.bonusSymbols) ? rules.bonusSymbols : [];
  const symbolById = new Map([...symbols, ...bonusSymbols]
    .map((symbol) => [String(symbol.id), symbol]));
  const replaySourceFrames = selectedSpin?.frames?.length > 1 ? selectedSpin.frames : [];
  const initialFrame = replaySourceFrames[0] ?? selectedSpin;
  const expectedGridSize = Number(rules.gridSize ?? 9);
  const grid = initialFrame?.grid?.length === expectedGridSize
    ? initialFrame.grid : presentation.previewIds.map((symbolId) =>
      symbolById.get(String(symbolId)) ?? symbols[0]);
  const initialWinningCells = Array.isArray(initialFrame?.winningCells)
    ? initialFrame.winningCells
    : replaySourceFrames.length
      ? (initialFrame.wins ?? []).flatMap((win) => win.cells ?? [])
      : selectedSpin?.winningCells ?? [];
  const winningCells = new Set(initialWinningCells);
  const lockedCells = new Set(initialFrame?.lockedCells ?? []);
  const cells = grid.map((symbol, index) => {
    const item = symbolById.get(String(symbol.id)) ?? symbol;
    const bonus = item.kind === 'bonus';
    const winning = winningCells.has(index);
    const locked = lockedCells.has(index);
    const classes = [
      'casino-reel-cell',
      bonus ? 'casino-bonus-cell' : `rarity-${Number(item.rarity)}`,
      bonus ? `casino-bonus-${escapeHtml(item.id)}` : '',
      winning ? 'is-winning' : '', locked ? 'is-locked' : ''
    ].filter(Boolean).join(' ');
    const aria = [item.name, bonus ? 'Bonus symbol' : item.rarityName,
      winning ? 'Winning' : '', locked ? 'Locked' : ''].filter(Boolean).join(', ');
    return `<div class="${classes}" data-casino-cell="${index}"${bonus ? ` data-casino-bonus="${escapeHtml(item.id)}"` : ''}${winning ? ' data-winning="true"' : ''}${locked ? ' data-locked="true"' : ''} aria-label="${escapeHtml(aria)}">
      <span class="casino-symbol-halo" aria-hidden="true"></span>
      ${bonus ? `<span class="casino-bonus-glyph" aria-hidden="true">${escapeHtml(item.glyph)}</span>` : `<img src="${escapeHtml(item.icon)}" alt="">`}
      <strong>${escapeHtml(item.name)}</strong><small>${bonus ? 'Bonus symbol' : escapeHtml(item.rarityName)}</small>
    </div>`;
  }).join('');

  const amount = (value, spin = selectedSpin) => spin?.currencyKind === 'gold'
    ? `${formatGold(value)}g`
    : `${Number(value).toLocaleString('en-GB')} ${escapeHtml(spin?.currencySymbol ?? '')}`;
  const frameCount = selectedSpin?.frames?.length || (selectedSpin ? 1 : 0);
  const replayFrames = replaySourceFrames.map((frame) => ({
    grid: frame.grid.map((symbol) => ({
      id: symbol.id, name: symbol.name, icon: symbol.icon,
      rarity: symbol.rarity, rarityName: symbol.rarityName,
      kind: symbol.kind, glyph: symbol.glyph
    })),
    wins: frame.wins ?? [],
    winningCells: Array.isArray(frame.winningCells)
      ? frame.winningCells : [...new Set((frame.wins ?? []).flatMap((win) => win.cells ?? []))],
    multiplier: frame.multiplier, jackpot: frame.jackpot,
    bonusSpinsAwarded: frame.bonusSpinsAwarded,
    replayKind: frame.replayKind, label: frame.label, holdMs: frame.holdMs,
    lockedCells: frame.lockedCells, newlyLockedCells: frame.newlyLockedCells,
    refilledCells: frame.refilledCells, clearedCells: frame.clearedCells,
    remainingAttempts: frame.remainingAttempts
  }));
  const replayActive = replayFrames.length > 1;
  const replayData = replayFrames.length
    ? ` data-casino-frames="${escapeHtml(JSON.stringify(replayFrames))}"` : '';

  let outcomeSummary = '';
  if (isThingOMatic && selectedSpin?.bonusSpinsAwarded) {
    outcomeSummary = `<div class="casino-bonus-summary"><strong>${selectedSpin.bonusSpinsAwarded} free respin${selectedSpin.bonusSpinsAwarded === 1 ? '' : 's'}</strong><span>${selectedSpin.bonusWinMultiplier > 1 ? `Golden Fuse raised all winnings to ${selectedSpin.bonusWinMultiplier}&times;` : 'Every bonus spin was included in this return.'}</span></div>`;
  } else if (isSporefall && frameCount > 1) {
    outcomeSummary = `<div class="casino-bonus-summary"><strong>${frameCount - 1} cascade${frameCount === 2 ? '' : 's'}</strong><span>Only matching shrooms were composted; every survivor stayed put.</span></div>`;
  } else if (isLockbox && selectedSpin) {
    const lastFrame = selectedSpin.frames?.at(-1);
    const lockedCount = lastFrame?.lockedCells?.length ?? 0;
    if (lockedCount) outcomeSummary = `<div class="casino-bonus-summary"><strong>${lockedCount} relic${lockedCount === 1 ? '' : 's'} locked</strong><span>${lastFrame.remainingAttempts > 0 ? `${lastFrame.remainingAttempts} attempt${lastFrame.remainingAttempts === 1 ? '' : 's'} remained.` : 'The lockbox run is settled.'}</span></div>`;
  }

  const frameTrail = selectedSpin?.frames?.length > 1
    ? `<details class="casino-result-details"><summary>View ${selectedSpin.frames.length}-${escapeHtml(presentation.frameNoun)} trail</summary><div class="casino-respin-trail">${selectedSpin.frames.map((frame, index) => {
      const bonuses = (frame.bonusSymbols ?? []).map((symbol) => symbol.name).join(' + ');
      const label = frame.label ?? (index ? `${presentation.frameNoun} ${index + 1}` : `Initial ${presentation.frameNoun}`);
      const detail = isThingOMatic
        ? (bonuses ? `${escapeHtml(bonuses)}${frame.bonusSpinsAwarded ? ` · +${frame.bonusSpinsAwarded}` : ''}` : 'No bonus symbol')
        : isLockbox
          ? `${frame.lockedCells?.length ?? 0} locked · ${frame.remainingAttempts ?? 0} attempts left`
          : `${frame.clearedCells?.length ?? 0} composted`;
      return `<div${bonuses || frame.winningCells?.length ? ' class="has-bonus"' : ''}><small>${escapeHtml(label)}</small><strong>${Number(frame.multiplier)}&times;</strong><span>${detail}</span></div>`;
    }).join('')}</div></details>` : '';
  const resultOutcome = selectedSpin?.jackpot
    ? 'is-jackpot' : selectedSpin?.multiplier ? 'is-win' : 'is-loss';
  const resultKicker = selectedSpin?.jackpot
    ? 'Grand jackpot'
    : selectedSpin?.multiplier
      ? `${selectedSpin.wins.length} winning award${selectedSpin.wins.length === 1 ? '' : 's'} across ${frameCount} ${presentation.frameNoun}${frameCount === 1 ? '' : 's'}`
      : isThingOMatic && selectedSpin?.bonusSpinsAwarded
        ? `No win after ${selectedSpin.bonusSpinsAwarded} free respin${selectedSpin.bonusSpinsAwarded === 1 ? '' : 's'}`
        : 'No winning awards';
  const result = selectedSpin ? `<section class="casino-result ${replayActive ? 'is-replaying' : resultOutcome}" data-casino-outcome="${resultOutcome}" aria-live="polite">
    <p class="casino-replay-status" id="casino-replay-status"${replayActive ? `>${presentation.replayStart}` : ' hidden>'}</p>
    <p class="casino-result-kicker">${resultKicker}</p>
    <strong>${selectedSpin.jackpot ? presentation.jackpotResult : selectedSpin.multiplier ? `${selectedSpin.multiplier}&times; payout` : 'The house keeps this one'}</strong>
    <span>Bet ${amount(selectedSpin.wager)} &middot; Returned ${amount(selectedSpin.payout)} &middot; ${selectedSpin.net >= 0 ? '+' : ''}${amount(selectedSpin.net)}</span>
    ${outcomeSummary}${frameTrail}
    ${selectedSpin.wins.length ? `<details class="casino-result-details"><summary>View ${selectedSpin.wins.length} award detail${selectedSpin.wins.length === 1 ? '' : 's'}</summary><ul>${selectedSpin.wins.map((win) => `<li><b>${escapeHtml(win.name)}${frameCount > 1 ? ` <small>${escapeHtml(presentation.frameNoun)} ${Number(win.spinIndex ?? win.frameIndex ?? 0) + 1}</small>` : ''}</b><span>${escapeHtml(win.itemName)} &middot; ${Number(win.multiplier)}&times;</span></li>`).join('')}</ul></details>` : ''}
  </section>` : `<p class="casino-ready" id="casino-status" role="status">${escapeHtml(presentation.ready)}</p>`;

  const goldMaximum = Math.max(0, Math.min(rules.maximumGoldWager, Math.floor(state.gold)));
  const rememberedCurrency = String(state.lastBet?.currency ?? 'gold');
  const rememberedCryptoId = Number(/^crypto:(\d+)$/.exec(rememberedCurrency)?.[1]);
  const rememberedCrypto = state.currencies.find((currency) => currency.id === rememberedCryptoId);
  const selectedCurrency = rememberedCrypto ? `crypto:${rememberedCrypto.id}` : 'gold';
  const rememberedWager = Number.isSafeInteger(Number(state.lastBet?.wager))
    && Number(state.lastBet.wager) > 0 ? Number(state.lastBet.wager) : 1;
  const cryptoBalanceText = (currency) => `${currency.quantity.toLocaleString('en-GB')} ${
    escapeHtml(currency.symbol)} available${currency.voucherQuantity > 0
    ? `, including ${currency.voucherQuantity.toLocaleString('en-GB')} voucher` : ''}`;
  const initialMaximum = rememberedCrypto
    ? Math.min(rules.maximumCryptoWager, rememberedCrypto.quantity) : goldMaximum;
  const initialBalance = rememberedCrypto
    ? cryptoBalanceText(rememberedCrypto)
    : `${formatGold(state.gold)}g available`;
  const currencyOptions = [
    `<option value="gold"${selectedCurrency === 'gold' ? ' selected' : ''} data-balance="${formatGold(state.gold)}" data-max="${goldMaximum}" data-unit="gold">Gold &middot; ${formatGold(state.gold)}g available</option>`,
    ...state.currencies.map((currency) => `<option value="crypto:${currency.id}"${selectedCurrency === `crypto:${currency.id}` ? ' selected' : ''} data-balance="${currency.quantity}" data-voucher="${Number(currency.voucherQuantity ?? 0)}" data-max="${Math.min(rules.maximumCryptoWager, currency.quantity)}" data-unit="${escapeHtml(currency.symbol)}">${escapeHtml(currency.name)} (${escapeHtml(currency.symbol)}) &middot; ${cryptoBalanceText(currency)}</option>`)
  ].join('');

  const paytable = symbols.map((symbol) => {
    const multiplier = rules.payoutMultipliersByItemId?.[symbol.id];
    const thingExplosive = isThingOMatic
      && Object.hasOwn(rules.payoutMultipliersByItemId, symbol.id);
    const isDud = isLockbox && symbol.id === rules.dudItemId;
    const note = isThingOMatic
      ? (thingExplosive ? '3 on a line' : 'Mine Thing · 3 on a line')
      : isSporefall ? '3+ orthogonally connected'
        : isRegional ? 'Base award on any named pattern'
          : isDud ? 'Soot seal · no award' : 'Awarded when locked';
    const displayPayout = isDud ? 'DUD' : `${multiplier ?? rules.ordinaryMultiplier}&times;`;
    return `<li class="rarity-${symbol.rarity}${symbol.id === presentation.topSymbolId ? ' is-top-symbol' : ''}"><img src="${escapeHtml(symbol.icon)}" alt=""><span><strong>${escapeHtml(symbol.name)}</strong><small>${note}</small></span><b>${displayPayout}</b></li>`;
  }).join('');

  let secondaryPaytable = '';
  if (isThingOMatic) {
    const shortMatchAwards = Array.from(
      { length: 5 - rules.explosiveSmallMatchMinimum },
      (_, index) => rules.explosiveSmallMatchMinimum + index
    ).map((count) => `<li><strong>${count} matching</strong><span>Flat ${rules.explosiveSmallMatchMultiplier}&times; payout</span></li>`).join('');
    const scatterAwards = Object.entries(rules.explosiveScatterCountFactors)
      .map(([count, factor]) => `<li><strong>${count} matching</strong><span>${factor}&times; that explosive&rsquo;s line payout</span></li>`).join('');
    secondaryPaytable = `<h3 class="casino-scatter-title">Explosive matches and scatters</h3><ul class="casino-scatter-paytable">${shortMatchAwards}${scatterAwards}</ul>`;
  } else if (isSporefall) {
    secondaryPaytable = `<h3 class="casino-scatter-title">Match size</h3><ul class="casino-scatter-paytable">${Object.entries(rules.matchCountFactors).map(([count, factor]) => `<li><strong>${count} matching</strong><span>${factor}&times; the shroom&rsquo;s base award</span></li>`).join('')}</ul>`;
  } else if (isRegional) {
    secondaryPaytable = `<h3 class="casino-scatter-title">Named patterns</h3><ul class="casino-scatter-paytable">${rules.winPatterns.map((pattern) => `<li><strong>${escapeHtml(pattern.name)}</strong><span>Cells ${pattern.cells.map((cell) => cell + 1).join(' · ')} &middot; ${pattern.factor}&times; base</span></li>`).join('')}</ul>`;
  }

  let featureDescription;
  let featureCards;
  if (isThingOMatic) {
    featureDescription = `Every special symbol awards its effect independently. Multiple copies and different specials can land together; up to ${rules.maximumBonusSpins} free respins can be added to one paid pull.`;
    featureCards = bonusSymbols.map((symbol) => `<li class="casino-bonus-${escapeHtml(symbol.id)}"><span class="casino-bonus-glyph" aria-hidden="true">${escapeHtml(symbol.glyph)}</span><span><strong>${escapeHtml(symbol.name)}</strong><small>${escapeHtml(symbol.description)}</small></span></li>`).join('');
  } else if (isSporefall) {
    featureDescription = `Three or more identical shrooms joined across an edge are composted and replaced. Surviving cells never move. A chain can continue for up to ${rules.maximumCascades} cascades.`;
    featureCards = [
      ['3+', 'Connect a cluster', 'Three or more identical shrooms must share an edge.'],
      ['↻', 'Compost winners', 'Only winning cells refill; every other cap survives.'],
      ['×', 'Rising chain', `Each cascade adds ${rules.cascadeMultiplierStep}&times; to its match factor.`]
    ].map(([glyph, name, description]) => `<li><span class="casino-bonus-glyph" aria-hidden="true">${glyph}</span><span><strong>${name}</strong><small>${description}</small></span></li>`).join('');
  } else if (isRegional) {
    featureDescription = `${machine.name} exists only in ${machine.regionName}. Its ${rules.gridColumns} reel${rules.gridColumns === 1 ? '' : 's'} and ${rules.gridRows} row${rules.gridRows === 1 ? '' : 's'} form ${rules.winPatterns.length} named pattern${rules.winPatterns.length === 1 ? '' : 's'}; overlapping patterns all pay.`;
    const regionalCards = [
      [presentation.glyphs?.[0] ?? '◇', `${rules.gridColumns} × ${rules.gridRows} cabinet`, `${rules.gridSize} independently rolled symbols make this region's distinctive screen.`],
      [presentation.glyphs?.[1] ?? '⌁', `${rules.winPatterns.length} named paths`, 'Every path requires one identical symbol in all of its marked cells.'],
      [presentation.glyphs?.[2] ?? '✦', 'Awards stack', 'One result can complete several crossing or nested patterns at once.']
    ];
    featureCards = regionalCards.map(([glyph, name, description]) => `<li><span class="casino-bonus-glyph" aria-hidden="true">${escapeHtml(glyph)}</span><span><strong>${escapeHtml(name)}</strong><small>${escapeHtml(description)}</small></span></li>`).join('');
  } else {
    featureDescription = `Reveal at least ${rules.triggerMinimum} relics to begin. Relics lock while soot cells reroll; every new relic restores all ${rules.respinAttempts} attempts, up to ${rules.maximumRespins} respins.`;
    featureCards = [
      ['3', 'Wake the vault', 'Three relics on the first reveal start the feature.'],
      ['▣', 'Hold every relic', 'Locked relics stay while only soot cells turn again.'],
      ['↻', 'Reset to three', 'Any newly locked relic restores all three attempts.']
    ].map(([glyph, name, description]) => `<li><span class="casino-bonus-glyph" aria-hidden="true">${glyph}</span><span><strong>${name}</strong><small>${description}</small></span></li>`).join('');
  }

  const rulesDescription = isThingOMatic
    ? `Three matching symbols on any completed row, column, or diagonal pay the listed amount. Three or four copies of the same explosive anywhere on the reels also pay a flat ${rules.explosiveSmallMatchMultiplier}&times; award. Five or more pay a rarity-scaled scatter award. Line, match, scatter, jackpot, and respin awards all stack.`
    : isSporefall
      ? 'Connected clusters of three or more identical shrooms pay their base award multiplied by cluster size and cascade depth. Separate clusters stack in the same drop.'
      : isRegional
        ? `Every named pattern pays when all of its cells show the same Thing. Its pattern factor multiplies that Thing's base award, and overlapping completed patterns stack.`
        : 'The initial reveal pays only if three relics wake the feature. Each relic pays once, when it locks; Soot-Clogged Coins never pay.';
  const jackpotDescription = isThingOMatic
    ? `Fill every window with the legendary explosive for a ${rules.jackpotBonusMultiplier.toLocaleString('en-GB')}&times; jackpot bonus, plus its eight line payouts and nine-symbol scatter award.`
    : isSporefall
      ? `Fill the first drop or a cascade with Crown of Bromo for a ${rules.jackpotBonusMultiplier.toLocaleString('en-GB')}&times; jackpot bonus, plus the nine-cap match.`
      : isRegional
        ? `Fill all ${rules.gridSize} windows with ${escapeHtml(symbols.find((symbol) => symbol.id === rules.jackpotItemId)?.name ?? 'the legendary symbol')} to add a ${rules.jackpotBonusMultiplier.toLocaleString('en-GB')}&times; regional jackpot bonus. Every completed pattern still pays.`
        : `Lock a relic in every compartment before the attempts run out to add a ${rules.jackpotBonusMultiplier.toLocaleString('en-GB')}&times; vault bonus.`;
  const jackpotOdds = isLockbox
    ? `<div class="casino-jackpot-odds"><span>Jackpot trigger</span><strong>All nine locks</strong><small>Only newly revealed relics reset the three-attempt counter.</small></div>`
    : `<div class="casino-jackpot-odds"><span>Jackpot trigger</span><strong>1 in ${rules.jackpotChanceDenominator.toLocaleString('en-GB')}</strong><small>${isThingOMatic ? 'Every paid spin and free respin' : isRegional ? 'Every regional turn' : 'Every paid drop'} is independently resolved by the server.</small></div>`;
  const paylines = isThingOMatic
    ? `<ol class="casino-paylines">${rules.paylines.map((line, index) => `<li><span>${String(index + 1).padStart(2, '0')}</span><strong>${escapeHtml(line.name)}</strong><small>${line.cells.map((cell) => cell + 1).join(' - ')}</small></li>`).join('')}</ol>` : '';
  const cabinetLineBank = isThingOMatic
    ? '<div class="casino-line-bank" aria-label="Eight active paylines"><strong>8 active lines</strong><span>3 rows</span><span>3 columns</span><span>2 diagonals</span></div>'
    : isRegional
      ? `<div class="casino-line-bank casino-regional-bank" aria-label="Regional cabinet layout"><strong>${rules.gridColumns} reel${rules.gridColumns === 1 ? '' : 's'}</strong><span>${rules.gridRows} row${rules.gridRows === 1 ? '' : 's'}</span><span>${rules.winPatterns.length} paths</span><span>${escapeHtml(machine.regionName)} only</span></div>`
      : '';

  const concealDuringReplay = (finalMarkup, waitingMarkup = '&mdash;') => replayActive
    ? `<span data-casino-concealed>${waitingMarkup}</span><span data-casino-reveal hidden>${finalMarkup}</span>`
    : finalMarkup;
  const spinHref = (spin) => machine.key === THING_O_MATIC_KEY
    ? `/casino?spin=${spin.id}`
    : `/casino?machine=${encodeURIComponent(machine.key)}&amp;spin=${spin.id}`;
  const history = state.recentSpins.map((spin) => {
    const current = spin.id === selectedSpin?.id;
    const finalResult = spin.jackpot
      ? '<strong>JACKPOT</strong>' : spin.multiplier ? `${spin.multiplier}&times;` : '&mdash;';
    return `<tr${current ? ' class="is-current"' : ''}><td><a class="text-link" href="${spinHref(spin)}">#${spin.id}</a></td><td>${new Date(spin.createdAt).toLocaleString('en-GB')}</td><td>${amount(spin.wager, spin)}</td><td>${current ? concealDuringReplay(finalResult, presentation.replayWaiting) : finalResult}</td><td>${current ? concealDuringReplay(amount(spin.payout, spin)) : amount(spin.payout, spin)}</td></tr>`;
  }).join('');
  const floor = state.machines.map((candidate) => {
    const card = CASINO_PRESENTATIONS[candidate.key];
    const href = candidate.key === THING_O_MATIC_KEY
      ? '/casino' : `/casino?machine=${encodeURIComponent(candidate.key)}`;
    const floorStyle = card?.accent ? ` style="--floor-card-accent:${escapeHtml(card.accent)}"` : '';
    const locality = candidate.regionName ? `${escapeHtml(candidate.regionName)} exclusive · ` : '';
    return `<a class="casino-floor-card${candidate.active ? ' is-current' : ''}" href="${href}"${candidate.active ? ' aria-current="page"' : ''}${floorStyle}><small>${locality}${candidate.spinCount.toLocaleString('en-GB')} pull${candidate.spinCount === 1 ? '' : 's'} recorded</small><strong>${escapeHtml(candidate.name)}</strong><span>${escapeHtml(card.pickerCopy)}</span></a>`;
  }).join('');
  const regionalStyle = isRegional
    ? ` style="--casino-regional-accent:${escapeHtml(presentation.accent)};--casino-regional-shade:${escapeHtml(presentation.shade)};--casino-regional-metal:${escapeHtml(presentation.metal)}"`
    : '';

  return `<div class="casino-page casino-theme-${escapeHtml(presentation.theme)}"${regionalStyle}>
    <section class="page-title"><div><p class="eyebrow">When the tunnels fall quiet</p><h1>The Quiet Shift Casino</h1></div><p>${escapeHtml(presentation.pageCopy)}</p></section>
    <nav class="casino-floor" aria-label="Choose a casino machine">${floor}</nav>
    <dl class="casino-stats"><div><dt>Global spins</dt><dd>${state.stats.globalSpinCount.toLocaleString('en-GB')}</dd></div><div><dt>Your pulls</dt><dd>${state.stats.spinCount.toLocaleString('en-GB')}</dd></div><div><dt>Best return</dt><dd>${concealDuringReplay(`${state.stats.bestMultiplier}&times;`, '?')}</dd></div><div><dt>Jackpots</dt><dd>${concealDuringReplay(state.stats.jackpotCount, '?')}</dd></div></dl>
    <article class="casino-machine${selectedSpin?.jackpot && !replayActive ? ' has-jackpot' : ''}" id="casino-machine" data-casino-machine="${escapeHtml(machine.key)}"${replayData}${replayActive ? ' aria-busy="true"' : ''}>
      <div class="casino-marquee"><p>${presentation.cabinetBadge ? `<small>${escapeHtml(presentation.cabinetBadge)}</small>` : ''}${escapeHtml(presentation.marquee)}</p><strong>${escapeHtml(presentation.tagline)}</strong></div>
      <div class="casino-machine-body">
        <div class="casino-screen-frame"><div class="casino-reel-grid" data-casino-columns="${Number(rules.gridColumns ?? 3)}" data-casino-rows="${Number(rules.gridRows ?? 3)}" data-casino-grid-size="${expectedGridSize}" style="--casino-grid-columns:${Number(rules.gridColumns ?? 3)}" aria-label="${replayActive ? `Initial ${escapeHtml(presentation.frameNoun)} before replay` : selectedSpin ? 'Final machine result' : 'Machine preview'}">${cells}</div>${isThingOMatic ? '<i class="casino-payline casino-payline-a" aria-hidden="true"></i><i class="casino-payline casino-payline-b" aria-hidden="true"></i>' : ''}${cabinetLineBank}</div>
        <form class="casino-controls" id="casino-spin-form" method="post" action="/casino/spin">
          <input type="hidden" name="machine" value="${escapeHtml(machine.key)}">
          <label><span>Stake currency</span><select id="casino-currency" name="currency">${currencyOptions}</select></label>
          <label><span>Bet</span><input id="casino-wager" type="number" name="wager" min="1" max="${Math.max(1, initialMaximum)}" step="1" value="${rememberedWager}" required inputmode="numeric"><small id="casino-balance">${initialBalance}</small></label>
          <button class="casino-pull" id="casino-pull"${initialMaximum < 1 || replayActive ? ' disabled' : ''}><span>${replayActive ? presentation.replayRunning : presentation.pullLabel}</span><i aria-hidden="true"></i></button>
        </form>
        ${result}
      </div>
      <footer><span>MINIMUM ${rules.minimumGoldWager.toLocaleString('en-GB')}</span><strong>PAYOUTS INCLUDE YOUR STAKE</strong><span>MAXIMUM ${rules.maximumGoldWager.toLocaleString('en-GB')}</span></footer>
    </article>
    <section class="casino-bonus-rules"><div><p class="eyebrow">${escapeHtml(presentation.featureEyebrow)}</p><h2>${escapeHtml(presentation.featureTitle)}</h2><p>${featureDescription}</p></div><ul>${featureCards}</ul></section>
    <section class="casino-rules"><div><p class="eyebrow">Paytable</p><h2>${escapeHtml(presentation.rulesTitle)}</h2><p>${rulesDescription}</p><ul class="casino-paytable">${paytable}</ul>${secondaryPaytable}</div><aside><p class="eyebrow">Grand prize</p><h2>${escapeHtml(presentation.jackpotTitle)}</h2><p>${jackpotDescription}</p>${jackpotOdds}${paylines}</aside></section>
    <section class="casino-history"><div class="section-heading"><div><p class="eyebrow">Machine ledger</p><h2>Recent pulls</h2></div></div><div class="table-scroll"><table><thead><tr><th>Pull</th><th>When</th><th>Bet</th><th>Result</th><th>Returned</th></tr></thead><tbody>${history || '<tr><td colspan="5">This machine is waiting for its first pull.</td></tr>'}</tbody></table></div></section>
  </div><script src="/node/casino.js?v=20260901a" defer></script>`;
}

function guildPageTitle(title, description) {
  return `<section class="page-title"><div><p class="eyebrow">Player collectives</p><h1>${escapeHtml(title)}</h1></div><p>${escapeHtml(description)}</p></section>`;
}

function guildDirectoryPage(player, directory, guild = null) {
  const currentGuildId = directory.membership?.guildId ?? null;
  const guildRows = directory.guilds.map((entry) => {
    const joined = entry.id === currentGuildId;
    const action = joined
      ? '<strong class="guild-status">Your guild</strong>'
      : currentGuildId
        ? '<span class="guild-unavailable">Leave your current guild to join.</span>'
        : `<form method="post" action="/guilds/${entry.id}/join"><button>Join guild</button></form>`;
    return `<article class="guild-directory-card${joined ? ' current' : ''}"><div><p class="eyebrow">Open membership</p><h3>${escapeHtml(entry.name)}</h3><p>${entry.memberCount.toLocaleString('en-GB')} member${entry.memberCount === 1 ? '' : 's'} &middot; ${entry.itemCount.toLocaleString('en-GB')}/${entry.bankCapacity.toLocaleString('en-GB')} things banked</p></div>${action}</article>`;
  }).join('');
  const guildChatCount = Math.max(0, Number(player.unseenGuildChatMessages) || 0);
  const guildChatLabel = `Enter guild chat${guildChatCount ? ` (${guildChatCount.toLocaleString('en-GB')})` : ''}`;
  const membership = guild ? `<section class="guild-command"><header><div><p class="eyebrow">Your guild</p><h2>${escapeHtml(guild.name)}</h2></div><span>${guild.memberCount.toLocaleString('en-GB')} equal member${guild.memberCount === 1 ? '' : 's'}</span></header><p>There are no official leaders or privileged ranks. Every member can use the private channel and draw from the shared bank.</p><nav aria-label="Guild operations"><a class="button" href="/guilds/chat">${guildChatLabel}</a><a class="button secondary" href="/guilds/bank">Open guild bank</a></nav><div class="guild-members"><h3>Members</h3><ul>${guild.members.map((member) => `<li><a class="text-link" href="/miners/${encodeURIComponent(member.name)}">${escapeHtml(member.name)}</a>${member.id === player.id ? '<span>You</span>' : ''}</li>`).join('')}</ul></div><form class="guild-leave" method="post" action="/guilds/leave"><button class="secondary">Leave guild</button></form></section>` : '';
  const create = currentGuildId ? '' : `<section class="guild-create"><div><p class="eyebrow">Found a guild</p><h2>Start something</h2><p>A new guild costs ${formatGold(directory.creationCostGold)}g. It belongs equally to everyone who joins.</p></div><form method="post" action="/guilds/create"><label>Guild name <span>3-40 characters</span><input name="name" minlength="3" maxlength="40" autocomplete="off" required></label><button${player.gold < directory.creationCostGold ? ' disabled' : ''}>Start guild &middot; ${formatGold(directory.creationCostGold)}g</button></form></section>`;
  return `${guildPageTitle('Guilds', 'Leaderless groups with private chat and a shared 1,000-thing bank. Membership and bank access are open to every member.')}${membership}${create}<section class="guild-directory"><header><div><p class="eyebrow">Guild register</p><h2>All guilds</h2></div><span>${directory.guilds.length.toLocaleString('en-GB')} active</span></header><div>${guildRows || '<p class="guild-empty">No guilds yet. You can found the first one.</p>'}</div></section>`;
}

function guildChatPage(player, state, catalog, historyWindowMs) {
  const historyHours = Number(historyWindowMs) / (60 * 60 * 1000);
  const rows = state.chats.map((chat) => {
    const sentDate = new Date(Number(chat.createdAt));
    const color = /^[0-9a-f]{6}$/i.test(String(chat.color))
      ? String(chat.color).toLowerCase() : '55666b';
    const sentAt = sentDate.toLocaleString('en-GB');
    const sentTime = sentDate.toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit'
    });
    return `<article class="chat-row chat-row-player" style="--chat-color:#${color}" data-chat-created-at="${Number(chat.createdAt)}"><span class="chat-identity"><i aria-hidden="true"></i><a class="chat-speaker" href="/miners/${encodeURIComponent(chat.playerName)}">${escapeHtml(chat.playerName)}</a></span><span class="chat-message">${escapeHtml(chat.body)}</span><time datetime="${sentDate.toISOString()}" title="${escapeHtml(sentAt)}"><strong>${escapeHtml(sentTime)}</strong></time>${chat.playerId === player.id ? '<span class="chat-row-owner">You</span>' : ''}</article>`;
  }).join('');
  const composer = player.chatBanned
    ? '<div class="chat-compose chat-compose-locked" role="note"><strong>Your account is not permitted to use chat.</strong></div>'
    : `<form id="chat-compose-form" class="chat-compose guild-chat-compose" method="post" action="/guilds/chat"><label class="chat-message-control" for="guild-chat-message"><span>Message your guild</span><input id="guild-chat-message" name="body" maxlength="${Number(catalog.settings.chat_message_max_length)}" placeholder="Talk to your guild..." autocomplete="off" required></label><button class="chat-send"><span>Send</span><b aria-hidden="true">&nearr;</b></button></form>`;
  return `<article class="chat-page guild-chat-page">${guildPageTitle('Guild chat', `${state.guild.name} has a private channel that only current members can read or use.`)}<dl class="chat-facts"><div><dt>Channel status</dt><dd><span id="chat-live-status" class="chat-live-status" data-state="connecting" role="status" aria-live="polite"><i aria-hidden="true"></i><span data-live-label>Connecting</span></span></dd></div><div><dt>Open record</dt><dd>${historyHours.toLocaleString('en-GB')} hours</dd></div><div><dt>Members</dt><dd>${state.guild.memberCount.toLocaleString('en-GB')}</dd></div></dl><nav class="guild-subnav" aria-label="Guild"><a class="text-link" href="/guilds">Guild overview</a><a class="text-link" aria-current="page" href="/guilds/chat">Guild chat</a><a class="text-link" href="/guilds/bank">Guild bank</a></nav><section class="chat-console" aria-labelledby="guild-chat-title"><header class="chat-console-header"><div><p>MT2 // Guildwire</p><h2 id="guild-chat-title">Members only</h2></div><p>New messages arrive live.</p></header><div id="chat-log" class="chat-list" role="log" aria-label="Guild chat messages" aria-live="polite" aria-relevant="additions text" tabindex="0">${rows || '<div class="chat-empty"><span aria-hidden="true">&#9671;</span><h3>Your channel is quiet.</h3><p>Break the silence.</p></div>'}</div>${composer}</section></article>`;
}

function guildBankPage(bank, catalog, player) {
  const transferLocked = !bank.canTransfer;
  const free = bank.guild.bankCapacity - bank.guild.itemCount;
  const itemFor = (itemId) => {
    const item = catalog.byId.get(Number(itemId));
    if (!item) throw new Error(`Missing catalog item ${itemId} from the guild bank.`);
    return item;
  };
  const bankCards = bank.items.map((entry) => {
    const item = itemFor(entry.itemId);
    const action = transferLocked ? '' : `<form class="guild-bank-action" method="post" action="/guilds/bank/withdraw"><input type="hidden" name="itemId" value="${item.id}"><label>Quantity<input type="number" name="quantity" value="1" min="1" max="${entry.quantity}" required></label><button>Withdraw</button></form>`;
    return itemCard(item, { count: entry.quantity, countLabel: 'in bank', action });
  }).join('');
  const localCards = bank.localInventory.map((entry) => {
    const item = itemFor(entry.itemId);
    const maximumDeposit = Math.min(entry.quantity, free);
    const action = transferLocked ? '' : `<div class="guild-bank-deposit-actions"><form class="guild-bank-action" method="post" action="/guilds/bank/deposit"><input type="hidden" name="itemId" value="${item.id}"><label>Quantity<input type="number" name="quantity" value="1" min="1" max="${Math.max(1, maximumDeposit)}" required${maximumDeposit < 1 ? ' disabled' : ''}></label><button${maximumDeposit < 1 ? ' disabled' : ''}>Deposit</button></form><form class="guild-bank-deposit-all" method="post" action="/guilds/bank/deposit"><input type="hidden" name="itemId" value="${item.id}"><input type="hidden" name="quantity" value="${entry.quantity}"><button class="secondary"${entry.quantity > free ? ' disabled title="The guild bank does not have room for every copy."' : ''}>Deposit all</button></form></div>`;
    return itemCard(item, { count: entry.quantity, countLabel: 'in this city', action });
  }).join('');
  const city = catalogCityForId(catalog, bank.cityId);
  const capital = catalogCityForId(catalog, bank.capitalCityId);
  const locationNotice = transferLocked
    ? `<aside class="guild-bank-location-warning"><strong>Transfers locked in ${escapeHtml(city.name)}</strong><p>Travel to this region's capital, <a class="text-link" href="/map#city-${capital.id}">${escapeHtml(capital.name)}</a>, to deposit or withdraw things.</p></aside>`
    : `<p class="guild-bank-location-ready">You are in ${escapeHtml(capital.name)}, this region's capital. Guild bank transfers are available.</p>`;
  const guildChatCount = Math.max(0, Number(player?.unseenGuildChatMessages) || 0);
  const guildChatLabel = `Guild chat${guildChatCount ? ` (${guildChatCount.toLocaleString('en-GB')})` : ''}`;
  return `${guildPageTitle('Guild bank', `${bank.guild.name} shares a 1,000-thing bank with equal access for every member. Transfers are available only from a region's capital.`)}<nav class="guild-subnav" aria-label="Guild"><a class="text-link" href="/guilds">Guild overview</a><a class="text-link" href="/guilds/chat">${guildChatLabel}</a><a class="text-link" aria-current="page" href="/guilds/bank">Guild bank</a></nav>${locationNotice}<section class="guild-bank-meter"><div><p class="eyebrow">Shared capacity</p><strong>${bank.guild.itemCount.toLocaleString('en-GB')} / ${bank.guild.bankCapacity.toLocaleString('en-GB')}</strong><span>${free.toLocaleString('en-GB')} free</span></div><progress max="${bank.guild.bankCapacity}" value="${bank.guild.itemCount}">${bank.guild.itemCount}/${bank.guild.bankCapacity}</progress></section><section class="guild-bank-section"><header><div><p class="eyebrow">Shared stock</p><h2>Available to all members</h2></div><span>${bank.items.length.toLocaleString('en-GB')} type${bank.items.length === 1 ? '' : 's'}</span></header><div class="item-grid">${bankCards || '<p class="guild-empty">The guild bank is empty.</p>'}</div></section><section class="guild-bank-section"><header><div><p class="eyebrow">Your local inventory</p><h2>${transferLocked ? `Stored in ${escapeHtml(city.name)}` : `Deposit from ${escapeHtml(city.name)}`}</h2></div><span>${free.toLocaleString('en-GB')} bank spaces free</span></header><div class="item-grid">${localCards || '<p class="guild-empty">You have nothing in this city to deposit.</p>'}</div></section>`;
}

function localItemGoldValue(item, catalog, cityId) {
  const origins = catalogCollection(catalog, 'cityMineTypes')
    .filter((entry) => entry.mineTypeId === item.mineTypeId);
  const outsideOrigin = origins.length > 0
    && !origins.some((entry) => entry.cityId === cityId);
  const baseUnits = Math.max(1, Math.round(Number(item.goldValue) * 10000));
  const multiplier = Number(catalog.settings.foreign_market_price_multiplier);
  const calculatedUnits = outsideOrigin ? Math.round(baseUnits * multiplier) : baseUnits;
  return (calculatedUnits > 10000
    ? Math.floor(calculatedUnits / 10000) * 10000 : calculatedUnits) / 10000;
}

function inventoryPage(player, catalog, meldItemNeeds = {}, listingQuantitiesByCity = {},
  fleetStandingByByCity = {}) {
  const mapsById = new Map(catalog.maps.map((map) => [Number(map.id), map]));
  const boltBoxItemId = Number(catalog.settings.bolt_box_item_id);
  const boltsPerBox = Number(catalog.settings.bolts_per_box);
  const boltItem = catalog.byId.get(Number(catalog.settings.bolt_item_id));
  const selectedCity = catalogCityForId(catalog, player.cityId);
  const selectedRegion = mapsById.get(Number(selectedCity.mapId));
  if (!selectedRegion) throw new Error(`Missing catalog region: ${selectedCity.mapId}.`);
  const locations = Object.entries(player.inventoryByCity ?? {}).map(([cityId, inventory]) => {
    const city = catalogCityForId(catalog, Number(cityId));
    const region = mapsById.get(Number(city.mapId));
    if (!region) throw new Error(`Missing catalog region: ${city.mapId}.`);
    if (Number(region.id) !== Number(selectedRegion.id)) return null;
    const entries = Object.entries(inventory).map(([id, count]) => {
      const item = catalog.byId.get(Number(id));
      return item && Number(count) > 0
        ? { item, count: Number(count), type: itemMarketType(item, catalog) } : null;
    }).filter(Boolean).sort((first, second) =>
      Number(second.item.rarity) - Number(first.item.rarity)
      || first.type.label.localeCompare(second.type.label, 'en')
      || first.item.name.localeCompare(second.item.name, 'en')
      || first.item.id - second.item.id);
    return {
      city, region, entries,
      quantity: entries.reduce((sum, entry) => sum + entry.count, 0)
    };
  }).filter((location) => location?.entries.length).sort((first, second) =>
    Number(second.city.id === player.cityId) - Number(first.city.id === player.cityId)
    || Number(first.region.sortOrder) - Number(second.region.sortOrder)
    || first.region.name.localeCompare(second.region.name, 'en')
    || first.city.name.localeCompare(second.city.name, 'en')
    || first.city.id - second.city.id);

  const cardsForLocation = ({ city, entries }) => entries.map(({ item, count, type }) => {
    const localValue = localItemGoldValue(item, catalog, city.id);
    const protectedCount = player.protectedInventoryByCity?.[city.id]?.[item.id] ?? 0;
    const listedCount = Math.max(0, Number(listingQuantitiesByCity?.[city.id]?.[item.id]) || 0);
    const current = city.id === player.cityId;
    let action = '';
    if (current) {
      const meldNeed = meldItemNeeds[item.id] ?? 0;
      const meldAtCapital = player.cityId === player.currentRegionHomeCityId;
      const meldDisabled = !meldAtCapital || meldNeed < 1;
      const meldTitle = !meldAtCapital
        ? 'Meld storage is only available for things in this region\'s capital.'
        : meldNeed < 1
          ? `${item.name} is not needed for any remaining meld.`
          : `Move one ${item.name} to Meld storage.`;
      const recyclableCount = Math.max(0, count - protectedCount);
      const scrapsEach = Number(catalog.settings.recycling_scraps_by_rarity[item.rarity]);
      const recycleDisabled = recyclableCount < 1;
      const recycleTitle = recycleDisabled
        ? 'Every stored copy was factory-made and can never be recycled.'
        : protectedCount
          ? `${protectedCount} factory-made ${protectedCount === 1 ? 'copy is' : 'copies are'} protected.`
          : '';
      const breakdownAction = item.id === boltBoxItemId
        ? `<form class="bolt-box-breakdown-form" method="post" action="/inventory/${item.id}/break-down"><input aria-label="Number of ${escapeHtml(item.name)} to break down" type="number" name="quantity" min="1" max="${count}" value="1" required><button>Break down · ${boltsPerBox.toLocaleString('en-GB')} ${escapeHtml(boltItem.name)}s each</button></form>`
        : '';
      action = `${breakdownAction}<a class="button inventory-market-link" href="/market/items/${item.id}">Open local market</a><form class="inventory-meld-form" method="post" action="/inventory/${item.id}/meld"><button class="secondary" title="${escapeHtml(meldTitle)}"${meldDisabled ? ' disabled' : ''}>Meld</button></form><form class="recycle-form" method="post" action="/inventory/${item.id}/recycle"><input aria-label="Number of ${escapeHtml(item.name)} to recycle" type="number" name="quantity" min="1" max="${Math.max(1, recyclableCount)}" value="1" required${recycleDisabled ? ' disabled' : ''}><button class="secondary"${recycleDisabled ? ` disabled title="${escapeHtml(recycleTitle)}"` : recycleTitle ? ` title="${escapeHtml(recycleTitle)}"` : ''}>Recycle · ${scrapsEach.toLocaleString('en-GB')} scraps each</button></form><form class="recycle-all-form" method="post" action="/inventory/${item.id}/recycle"><input type="hidden" name="quantity" value="${recyclableCount}"><button class="secondary"${recycleDisabled ? ` disabled title="${escapeHtml(recycleTitle)}"` : ''}>Recycle all · ${(recyclableCount * scrapsEach).toLocaleString('en-GB')} scraps</button></form>`;
    }
    return itemCard(item, {
      count,
      className: `inventory-item-card${current ? '' : ' inventory-item-remote'}`,
      showFixedValue: false,
      meta: [type.label, `${formatGold(localValue)}g fixed value`, ...(protectedCount
        ? [`${protectedCount} factory-made ${protectedCount === 1 ? 'copy' : 'copies'} protected`]
        : []), ...(listedCount
        ? [`${listedCount.toLocaleString('en-GB')} listed`]
        : [])],
      action
    });
  }).join('');

  const locationsByRegion = new Map();
  for (const location of locations) {
    const grouped = locationsByRegion.get(location.region.id) ?? {
      region: location.region, locations: []
    };
    grouped.locations.push(location);
    locationsByRegion.set(location.region.id, grouped);
  }
  const physicalThings = [...locationsByRegion.values()].map(({ region, locations: cities }) => {
    const regionQuantity = cities.reduce((sum, city) => sum + city.quantity, 0);
    const citySections = cities.map((location) => {
      const current = location.city.id === player.cityId;
      const fleetStandingBy = Math.max(0,
        Number(fleetStandingByByCity?.[location.city.id]) || 0);
      const regionalCapital = isRegionalCapital(catalog, location.city.id);
      const capitalIcon = regionalCapital
        ? `<span class="capital-city-icon" title="Regional capital" aria-label="Regional capital">${CAPITAL_CITY_ICON}</span>`
        : '';
      const switchCity = current ? '<strong class="active-state">Selected city</strong>'
        : `<form method="post" action="/cities/${location.city.id}/select"><button class="secondary">Switch to manage</button></form>`;
      return `<section class="inventory-city${current ? ' current' : ''}" data-city-id="${location.city.id}"><header><div><p class="eyebrow">${regionalCapital ? 'Regional capital' : 'City'}</p><h3>${capitalIcon}${escapeHtml(location.city.name)}</h3></div><p>${location.quantity.toLocaleString('en-GB')} thing${location.quantity === 1 ? '' : 's'} · ${location.entries.length.toLocaleString('en-GB')} type${location.entries.length === 1 ? '' : 's'} · ${fleetStandingBy.toLocaleString('en-GB')} fleet vehicle${fleetStandingBy === 1 ? '' : 's'} standing by</p>${switchCity}</header><div class="item-grid">${cardsForLocation(location)}</div></section>`;
    }).join('');
    return `<section class="inventory-region" data-region-id="${region.id}"><header><div><p class="eyebrow">Region</p><h2>${escapeHtml(region.name)}</h2></div><p>${regionQuantity.toLocaleString('en-GB')} thing${regionQuantity === 1 ? '' : 's'} across ${cities.length.toLocaleString('en-GB')} cit${cities.length === 1 ? 'y' : 'ies'}</p></header>${citySections}</section>`;
  }).join('');
  const cryptoCards = Object.entries(player.cryptoBalances ?? {}).filter(([, quantity]) => quantity > 0)
    .map(([id, quantity]) => {
      const currency = cryptoType(id);
      if (!currency) return '';
      return `<a class="crypto-wallet-coin rarity-${currency.id}" href="/crypto" style="display:inline-grid;grid-template-columns:26px minmax(4.5rem,auto) auto;align-items:center;gap:.45rem;width:auto;max-width:15rem;padding:.38rem .55rem"><img src="${escapeHtml(currency.icon)}" alt="" width="26" height="26" style="display:block;width:26px;min-width:26px;max-width:26px;height:26px;min-height:26px;max-height:26px;margin:0;padding:0;object-fit:contain"><span><strong>${escapeHtml(currency.symbol)}</strong><small>${escapeHtml(currency.name)}</small></span><b>${Number(quantity).toLocaleString('en-GB')}</b></a>`;
    }).join('');
  const scraps = player.oreScrapsByCity?.[player.cityId] ?? 0;
  const scrapsPerOre = Number(catalog.settings.recycling_scraps_per_ore);
  const visibleItemCount = locations.reduce((sum, location) => sum + location.quantity, 0);
  return `<section class="page-title"><div><p class="eyebrow">Inventory · ${escapeHtml(selectedRegion.name)} region</p><h1>Your things</h1></div><p>${visibleItemCount.toLocaleString('en-GB')} physical things in this region. ${player.itemCount.toLocaleString('en-GB')}/${player.itemLimit.toLocaleString('en-GB')} worldwide capacity used. Crypto coins are held globally and do not use capacity.</p></section>${cryptoCards ? `<section><h2>Crypto things</h2><div class="item-grid">${cryptoCards}</div></section>` : ''}<section class="recycling-bank"><h2>Ore recycling · ${escapeHtml(selectedCity.name)}</h2><p><strong>${scraps.toLocaleString('en-GB')} Ore scraps</strong> in the selected city · ${scrapsPerOre.toLocaleString('en-GB')} scraps make 1 Ore.</p><form method="post" action="/inventory/refine-ore"><label>Ore to refine<input type="number" name="quantity" min="1" max="${Math.floor(scraps / scrapsPerOre)}" value="1" required></label><button${scraps < scrapsPerOre ? ' disabled' : ''}>Refine Ore</button></form></section><p>Only physical things in ${escapeHtml(selectedRegion.name)} are shown. Your current city comes first; other cities in this region follow alphabetically, with things ordered by rarity (highest first), then type. Switch to a city to use its local market, Meld storage, or recycling controls. Listed things remain in that city and still use inventory capacity.</p>${player.itemCount > player.itemLimit ? '<p><a class="button" href="/mines/auto-recycle">Auto-Recycle</a></p>' : ''}<div class="inventory-region-list">${physicalThings || `<p>You do not own any physical things in ${escapeHtml(selectedRegion.name)} yet.</p>`}</div>`;
}

function dwarvesPage(report, catalog, currentTime) {
  const tierRules = [...catalog.dwarfTiers].sort((first, second) => second.rarity - first.rarity)
    .map((dwarf) => {
      const maximum = catalogRarityName(catalog, dwarf.maximumFindRarity);
      const minimum = catalogRarityName(catalog, dwarf.minimumFindRarity);
      return `${dwarf.name} finds ${maximum}${maximum === minimum ? ' only' : ` to ${minimum}`}`;
    }).join('; ');
  const dwarfRows = [...report.dwarves].sort(compareItemsByRarity).map((dwarf) => {
    const item = catalog.byId.get(dwarf.itemId);
    if (!item) throw new Error(`Missing catalog item: ${dwarf.itemId}.`);
    return itemCard(item, { count: dwarf.quantity, meta: `Working in ${dwarf.cityName}` });
  }).join('');
  return `<section class="page-title"><div><p class="eyebrow">${catalog.dwarfTiers.length} rarity tiers</p><h1>Dwarves</h1></div><p>Stored Dwarves comb the mines of their city and return with finds befitting their colour.</p></section>
    <section class="dwarf-rules"><h2>Your working Dwarves</h2><div class="item-grid">${dwarfRows || '<p>You do not have a Dwarf stored in a city.</p>'}</div><p>${escapeHtml(tierRules)}.</p></section>
    <section><h2>Stowaways</h2><p>Dwarves of every rarity may stow away on a departing land or sea vehicle with free cargo space and a matching combat class. Higher-rarity stowaways are progressively rarer. An uncaptured Dwarf leaves at arrival or escapes if its road vehicle is destroyed; one pillaged by a miner stays with its captor. A Dwarf captured by an NPC fights back once per combat round, dealing damage equal to its rarity, and escapes when that NPC is defeated. Other Dwarves drown with a sinking ship.</p></section>`;
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
  return `<section class="page-title"><div><p class="eyebrow">Inventory control</p><h1>Auto-Recycle</h1></div><a class="text-link" href="/inventory">Back to things</a></section><p>${status}</p>
    ${rows ? `<form class="auto-recycle-form" method="post" action="/mines/auto-recycle"><div class="auto-recycle-list">${rows}</div><button id="auto-recycle-submit"${hasSuggested ? '' : ' disabled'}>Recycle selected into Ore scraps</button></form><script src="/node/auto-recycle.js" defer></script>` : '<p>No recyclable things are stored in any city.</p>'}
    ${report.unresolved ? `<p class="capacity-warning">Even after recycling every available stored thing, you would remain ${report.unresolved} over the limit${lockedDetails ? ` because ${escapeHtml(lockedDetails)} things cannot be recycled here` : ''}.</p>` : ''}`;
}

function marketPage(player, catalog) {
  const warehouseName = catalogGadgetForBehavior(catalog, 'warehouse').displayName;
  const currentCity = catalogCityForId(catalog, player.cityId);
  const cityName = currentCity.name;
  const currentMap = catalog.maps.find((map) => Number(map.id) === Number(currentCity.mapId));
  const voucherAvailable = Boolean(player.mineRentalVoucher?.available);
  const voucherUsable = voucherAvailable && currentMap?.slug === 'aso';
  if (!(catalog.mineTypesByCity instanceof Map) || !catalog.mineTypesByCity.has(player.cityId)) {
    throw new Error(`Missing catalog mine availability for city ${player.cityId}.`);
  }
  const availableMineTypes = catalog.mineTypesByCity.get(player.cityId);
  const mines = availableMineTypes.filter((type) => type.creditCost > 0 && catalog.byMineType.has(type.id)).map((type) => `<article class="shop-card"><img src="${escapeHtml(type.icon)}" alt=""><div><h3>${escapeHtml(type.name)} Mine</h3><p>${type.creditCost} credits to buy · ${type.rentCost} credits for ${formatDuration(Number(catalog.settings.mine_rental_duration_ms))} · ${catalog.settings.starter_find_count} discoveries included</p></div><div><a class="button secondary" href="/market/mines/${type.id}">Buy with Crypto</a><form method="post" action="/market/mines/${type.id}/buy"><button ${player.credits < type.creditCost ? 'disabled' : ''}>Buy</button></form><form method="post" action="/market/mines/${type.id}/rent"><button class="secondary" ${player.credits < type.rentCost ? 'disabled' : ''}>Rent</button></form>${voucherUsable ? `<form method="post" action="/market/mines/${type.id}/rent-with-voucher"><button>Use free voucher</button></form>` : ''}</div></article>`).join('');
  const containers = (player.containers ?? []).map((container) => `<article class="container-card"><div><h3>${escapeHtml(container.name)}</h3><p>+${container.capacity} permanent inventory capacity · ${container.owned} owned</p></div><form method="post" action="/market/containers/${container.id}/buy"><button ${player.credits < container.credits ? 'disabled' : ''}>Buy for ${container.credits} credits</button></form></article>`).join('');
  const voucherNotice = voucherAvailable
    ? `<aside class="mine-voucher-notice"><p class="eyebrow">Dissolved estate disbursement</p><h2>Council mine rental voucher</h2><p>${voucherUsable
      ? 'Ready to redeem here for one mine rental. Paid for from your dissolved estate; choose carefully.'
      : 'This voucher is safe, but the Council permits redemption only while you are in Aso.'}</p></aside>`
    : '';
  return `<section class="page-title"><div><p class="eyebrow">Mine shop</p><h1>Credits shop</h1></div><p>You have <strong>${player.credits} credits</strong>.</p></section>
    ${voucherNotice}<section><h2>Buy a new mine in ${escapeHtml(cityName)}</h2><p>Mine types vary by city. Each mine includes ${catalog.settings.starter_find_count} waiting discoveries; active-mine limits still apply.</p><div class="shop-grid">${mines || '<p>No mines are sold in this city.</p>'}</div></section>
    <section><h2>Inventory containers</h2><p>Capacity starts at 500 Things. Each container type grants its capacity once, up to the absolute 1,000-Thing limit; duplicate purchases remain owned but add no further capacity. Current capacity: <strong>${player.itemCount}/${player.itemLimit}</strong>${player.warehouseBonus ? ` including an active ${escapeHtml(warehouseName)} bonus` : ''}.</p><div class="container-grid">${containers}</div></section>
    <section class="battery-extension"><h2>Battery extension</h2><p>This purchase is optional: visiting Mines still recharges batteries for free. Each purchase first restores the normal meld-scaled charge when eligible, then adds ${formatDuration(Number(catalog.settings.battery_extension_ms))}.</p><form method="post" action="/market/battery-extension"><strong>+${formatDuration(Number(catalog.settings.battery_extension_ms))} · ${catalog.settings.battery_extension_cost_credits} credits</strong><button ${player.credits < Number(catalog.settings.battery_extension_cost_credits) || player.batteryRemaining <= 0 ? 'disabled' : ''}>Buy extension</button></form></section>`;
}

function exchangePage(player, catalog, purchaseListings, filters = {}) {
  const query = String(filters.query ?? '');
  const selectedType = String(filters.type ?? '');
  const remainingMeldNeeds = filters.remainingMeldNeeds ?? {};
  const selectedSort = ['recommended', 'rarity', 'price-asc', 'price-desc', 'name']
    .includes(filters.sort) ? filters.sort : 'recommended';
  const needle = query.trim().toLocaleLowerCase('en');
  const listingByItemId = new Map(purchaseListings.map((listing) => [listing.itemId, listing]));
  const knownItemIds = new Set(purchaseListings.map((listing) => listing.itemId));
  for (const discovery of player.discoveries ?? []) knownItemIds.add(Number(discovery.itemId));
  for (const inventory of Object.values(player.inventoryByCity ?? {})) {
    for (const itemId of Object.keys(inventory ?? {})) knownItemIds.add(Number(itemId));
  }
  for (const itemId of Object.keys(player.meldStash ?? {})) knownItemIds.add(Number(itemId));
  const typedListings = [...knownItemIds].map((itemId) => {
    const item = catalog.byId.get(itemId);
    if (!item) return null;
    const listing = listingByItemId.get(itemId);
    return {
      itemId,
      price: listing?.price ?? Number.POSITIVE_INFINITY,
      totalQuantity: listing?.totalQuantity ?? 0,
      sellerName: listing?.sellerName ?? null,
      hasListing: Boolean(listing),
      meldable: Number(remainingMeldNeeds[itemId] ?? 0) > 0,
      item,
      itemType: itemMarketType(item, catalog)
    };
  }).filter(Boolean);
  const types = [...new Map(typedListings.map((listing) =>
    [listing.itemType.key, listing.itemType.label])).entries()]
    .sort((first, second) => first[1].localeCompare(second[1], 'en'));
  const compareName = (first, second) => first.item.name.localeCompare(second.item.name, 'en')
    || first.item.id - second.item.id;
  const compareAvailability = (first, second) => Number(second.hasListing) - Number(first.hasListing);
  const sorters = {
    recommended: (first, second) => Number(second.item.rarity) - Number(first.item.rarity)
      || compareAvailability(first, second)
      || Number(first.price > player.gold) - Number(second.price > player.gold) || first.price - second.price
      || second.totalQuantity - first.totalQuantity || compareName(first, second),
    rarity: (first, second) => compareItemsByRarity(first.item, second.item)
      || compareAvailability(first, second) || first.price - second.price,
    'price-asc': (first, second) => compareAvailability(first, second)
      || first.price - second.price || compareName(first, second),
    'price-desc': (first, second) => compareAvailability(first, second)
      || second.price - first.price || compareName(first, second),
    name: compareName
  };
  const listings = typedListings.filter((listing) =>
    (!needle || listing.item.name.toLocaleLowerCase('en').includes(needle))
      && (!selectedType || listing.itemType.key === selectedType)
  ).sort(sorters[selectedSort]);
  const cards = listings.map((listing) => {
    const meldableBadge = listing.meldable
      ? '<span class="market-meldable-badge" title="Needed for one or more of your unfinished Meld recipes">Meldable</span>'
      : '';
    const bidButton = `<a class="button secondary market-bid-button" href="/market/items/${listing.item.id}#place-bid">Bid</a>`;
    return itemCard(listing.item, {
      count: listing.hasListing ? listing.totalQuantity : null,
      countLabel: 'available', compact: true,
      showFixedValue: false, className: 'market-item-card',
      meta: listing.hasListing
        ? [`${formatGold(listing.price)}g each`, `Seller: ${listing.sellerName}`]
        : null,
      action: listing.hasListing
        ? `<form class="market-buy-form" data-live-authoritative method="post" action="/market/items/${listing.item.id}/buy-now"><input type="hidden" name="price" value="${listing.price}"><label><span>Qty</span><input type="number" name="quantity" min="1" max="${listing.totalQuantity}" value="1" aria-label="${escapeHtml(listing.item.name)} quantity"></label><button${player.gold < listing.price ? ' disabled' : ''}>Buy now</button></form>${meldableBadge}${bidButton}`
        : `${meldableBadge}${bidButton}`
    });
  }).join('');
  const typeOptions = types.map(([key, label]) => `<option value="${escapeHtml(key)}"${selectedType === key ? ' selected' : ''}>${escapeHtml(label)}</option>`).join('');
  const stockedCount = listings.filter((listing) => listing.hasListing).length;
  return `<section class="page-title"><div><p class="eyebrow">Local exchange</p><h1>Item markets</h1></div><p>Browse known Things and buy local stock in ${escapeHtml(catalogCityForId(catalog, player.cityId).name)}. You have <strong>${formatGold(player.gold)}g</strong>.</p></section>
    <form class="market-controls" method="get" action="/exchange"><label>Find<input name="q" value="${escapeHtml(query)}" placeholder="Item name"></label><label>Item type<select name="type"><option value="">All types</option>${typeOptions}</select></label><label>Sort<select name="sort"><option value="recommended"${selectedSort === 'recommended' ? ' selected' : ''}>Recommended</option><option value="rarity"${selectedSort === 'rarity' ? ' selected' : ''}>Rarity</option><option value="price-asc"${selectedSort === 'price-asc' ? ' selected' : ''}>Price: low to high</option><option value="price-desc"${selectedSort === 'price-desc' ? ' selected' : ''}>Price: high to low</option><option value="name"${selectedSort === 'name' ? ' selected' : ''}>Name</option></select></label><button>Apply</button>${query || selectedType || selectedSort !== 'recommended' ? '<a class="button secondary" href="/exchange">Reset</a>' : ''}</form>
    <p class="market-result-count"><strong>${listings.length}</strong> known Thing${listings.length === 1 ? '' : 's'} · ${stockedCount} with local stock.</p>
    <div class="item-grid market-item-grid">${cards || '<p>No matching known item markets.</p>'}</div>`;
}

function cryptoExchangePage(exchange, cityName) {
  const chart = (currency) => {
    const { analytics } = currency;
    const buckets = analytics.buckets;
    const last = analytics.latestSale;
    if (!buckets.length) {
      const previous = last
        ? ` Last sale: ${formatGold(last.priceUnits / analytics.goldScale)}g on ${new Date(last.createdAt).toLocaleString('en-GB')}.`
        : ' This currency has not traded yet.';
      return `<div class="crypto-chart-empty"><strong>No trades in this period.</strong><span>${previous}</span></div>`;
    }
    const values = buckets.flatMap((bucket) => [bucket.highUnits, bucket.lowUnits]);
    const low = Math.min(...values), high = Math.max(...values);
    const pricePadding = Math.max(100, Math.round(Math.max(high * .025, (high - low) * .15)));
    const chartLow = Math.max(0, low - pricePadding);
    const chartHigh = high + pricePadding;
    const firstSaleAt = currency.sales[0].createdAt;
    const lastSaleAt = currency.sales.at(-1).createdAt;
    const saleSpan = lastSaleAt - firstSaleAt;
    const xAt = (time, index) => currency.sales.length === 1
      ? 344
      : 72 + (saleSpan > 0
        ? (time - firstSaleAt) / saleSpan
        : index / (currency.sales.length - 1)) * 544;
    const yAt = (units) => 22 + (1 - (units - chartLow) / (chartHigh - chartLow)) * 154;
    const points = currency.sales.map((sale, index) => ({
      sale, x: xAt(sale.createdAt, index), y: yAt(sale.priceUnits)
    }));
    const linePath = points.map((point, index) =>
      `${index ? 'L' : 'M'} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
    const areaPath = points.length > 1
      ? `${linePath} L ${points.at(-1).x.toFixed(1)} 176 L ${points[0].x.toFixed(1)} 176 Z`
      : '';
    const plottedPoints = points.map(({ sale, x, y }) =>
      `<circle class="crypto-price-point" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="2.2"><title>${new Date(sale.createdAt).toLocaleString('en-GB')} — ${formatGold(sale.priceUnits / analytics.goldScale)}g; volume ${sale.quantity}</title></circle>`
    ).join('');
    const period = analytics.period;
    const vwapY = yAt(period.vwapUnits);
    const change = period.changeUnits === null ? '—'
      : `${period.changeUnits >= 0 ? '+' : ''}${formatGold(period.changeUnits / analytics.goldScale)}g (${period.changePercent >= 0 ? '+' : ''}${period.changePercent.toFixed(1)}%)`;
    const description = `${period.tradeCount} completed sale${period.tradeCount === 1 ? '' : 's'}, volume ${period.volume}. Open ${formatGold(period.openUnits / analytics.goldScale)} gold, high ${formatGold(period.highUnits / analytics.goldScale)} gold, low ${formatGold(period.lowUnits / analytics.goldScale)} gold, close ${formatGold(period.closeUnits / analytics.goldScale)} gold, VWAP ${formatGold(period.vwapUnits / analytics.goldScale)} gold.`;
    return `<figure class="crypto-chart-figure"><svg class="crypto-chart" viewBox="0 0 640 224" preserveAspectRatio="none" role="img" aria-labelledby="crypto-chart-${currency.id}-title crypto-chart-${currency.id}-desc"><title id="crypto-chart-${currency.id}-title">${escapeHtml(currency.symbol)} ${escapeHtml(exchange.range)} price line chart</title><desc id="crypto-chart-${currency.id}-desc">${description}</desc><defs><linearGradient id="crypto-area-gradient-${currency.id}" x1="0" y1="0" x2="0" y2="1"><stop class="crypto-price-area-start" offset="0"/><stop class="crypto-price-area-end" offset="1"/></linearGradient></defs><g class="crypto-chart-grid"><line x1="72" y1="22" x2="616" y2="22"/><line x1="72" y1="99" x2="616" y2="99"/><line x1="72" y1="176" x2="616" y2="176"/></g><line class="crypto-price-reference" x1="72" y1="${vwapY.toFixed(1)}" x2="616" y2="${vwapY.toFixed(1)}"/>${areaPath ? `<path class="crypto-price-area" style="fill:url(#crypto-area-gradient-${currency.id})" d="${areaPath}"/>` : ''}<path class="crypto-price-line" d="${linePath}"/>${plottedPoints}<g class="crypto-chart-axis"><text x="62" y="27" text-anchor="end">${formatGold(chartHigh / analytics.goldScale)}g</text><text x="62" y="104" text-anchor="end">${formatGold(((chartHigh + chartLow) / 2) / analytics.goldScale)}g</text><text x="62" y="181" text-anchor="end">${formatGold(chartLow / analytics.goldScale)}g</text><text class="crypto-vwap-label" x="610" y="${Math.max(33, Math.min(168, vwapY - 6)).toFixed(1)}" text-anchor="end">VWAP ${formatGold(period.vwapUnits / analytics.goldScale)}g</text><text x="72" y="215">Earlier sales</text><text x="344" y="215" text-anchor="middle">Executed sale price</text><text x="616" y="215" text-anchor="end">Latest sale</text></g></svg><figcaption class="crypto-chart-stats"><span>Open <strong>${formatGold(period.openUnits / analytics.goldScale)}g</strong></span><span>High <strong>${formatGold(period.highUnits / analytics.goldScale)}g</strong></span><span>Low <strong>${formatGold(period.lowUnits / analytics.goldScale)}g</strong></span><span>Close <strong>${formatGold(period.closeUnits / analytics.goldScale)}g</strong></span><span>Volume <strong>${period.volume.toLocaleString('en-GB')}</strong></span><span>Sales <strong>${period.tradeCount.toLocaleString('en-GB')}</strong></span><span>VWAP <strong>${formatGold(period.vwapUnits / analytics.goldScale)}g</strong></span><span class="crypto-chart-change${period.changeUnits > 0 ? ' up' : period.changeUnits < 0 ? ' down' : ''}">Change <strong>${change}</strong></span></figcaption></figure>`;
  };
  const orderRows = (orders) => orders.map((order) => `<tr id="crypto-order-${order.id}"><td>${escapeHtml(order.playerName)}</td><td>${order.quantity}</td><td>${formatGold(order.price)}g</td><td>${order.playerId === exchange.playerId ? `<form method="post" action="/crypto/orders/${order.id}/cancel"><button class="secondary">Cancel</button></form>` : '<span class="muted">Open</span>'}</td></tr>`).join('');
  const cards = exchange.currencies.map((currency) => {
    const { analytics } = currency;
    const last = analytics.latestSale;
    const bestBid = analytics.quotes.bestBid;
    const bestAsk = analytics.quotes.bestAsk;
    const spread = analytics.quotes.spreadUnits;
    const sellMaximum = Math.min(currency.quantity, currency.bestBid?.quantity ?? 0);
    const buyMaximum = currency.bestListing?.quantity ?? 0;
    const recentSales = currency.sales.slice(-6).reverse().map((sale) => `<tr><td>${new Date(sale.createdAt).toLocaleString('en-GB')}</td><td>${sale.quantity.toLocaleString('en-GB')}</td><td>${formatGold(sale.price)}g</td></tr>`).join('');
    return `<section class="crypto-market"><header class="crypto-market-header"><div><p class="eyebrow">${escapeHtml(currency.symbol)}</p><h2>${escapeHtml(currency.name)}</h2></div><dl class="crypto-quote-strip"><div><dt>Owned</dt><dd>${currency.quantity.toLocaleString('en-GB')}</dd></div><div><dt>Last sale</dt><dd>${last ? `${formatGold(last.priceUnits / analytics.goldScale)}g` : '—'}</dd></div><div><dt>Bid</dt><dd>${bestBid ? `${formatGold(bestBid.priceUnits / analytics.goldScale)}g` : '—'}</dd></div><div><dt>Ask</dt><dd>${bestAsk ? `${formatGold(bestAsk.priceUnits / analytics.goldScale)}g` : '—'}</dd></div><div><dt>Spread</dt><dd>${spread === null ? '—' : `${formatGold(spread / analytics.goldScale)}g`}</dd></div><div><dt>Minimum list</dt><dd>${formatGold(currency.minimumPrice)}g</dd></div></dl></header>${chart(currency)}<div class="market-dealing-desk"><article class="market-ticket market-ticket-buy"><p class="eyebrow">Immediate</p><h3>Buy now</h3>${currency.bestListing ? `<p><strong>${formatGold(currency.bestListing.price)}g</strong> each · ${buyMaximum.toLocaleString('en-GB')} at best price</p><form data-live-authoritative method="post" action="/crypto/${currency.id}/buy-now"><input type="hidden" name="price" value="${currency.bestListing.price}"><label>Quantity<input type="number" name="quantity" min="1" max="${buyMaximum}" value="1" required></label><button${exchange.gold < currency.bestListing.price ? ' disabled' : ''}>Buy ${escapeHtml(currency.symbol)}</button></form>` : '<p class="market-ticket-empty">No one is listing this coin.</p>'}</article><article class="market-ticket market-ticket-sell"><p class="eyebrow">Immediate</p><h3>Sell now</h3>${currency.bestBid ? `<p><strong>${formatGold(currency.bestBid.price)}g</strong> each · ${currency.bestBid.quantity.toLocaleString('en-GB')} wanted</p><form data-live-authoritative method="post" action="/crypto/${currency.id}/sell-now"><input type="hidden" name="price" value="${currency.bestBid.price}"><label>Quantity<input type="number" name="quantity" min="1" max="${Math.max(1, sellMaximum)}" value="1" required${sellMaximum < 1 ? ' disabled' : ''}></label><button${sellMaximum < 1 ? ' disabled title="You do not own any crypto to sell."' : ''}>Sell ${escapeHtml(currency.symbol)}</button></form>` : '<p class="market-ticket-empty">No open bids.</p>'}</article><form class="market-ticket" method="post" action="/crypto/${currency.id}/bids"><p class="eyebrow">Limit order</p><h3>Place bid</h3><label>Price each (gold)<input type="number" name="price" min="0.01" step="0.01" value="${currency.bidPriceHint}" required></label><label>Quantity<input type="number" name="quantity" min="1" value="1" required></label><button>Place bid</button><small>Gold stays available until a miner sells into your bid.</small></form><form class="market-ticket" method="post" action="/crypto/${currency.id}/listings"><p class="eyebrow">Limit order</p><h3>Place listing</h3><label>Price each (gold)<input type="number" name="price" min="${currency.minimumPrice}" step="0.01" value="${currency.listingPriceHint}" required${currency.availableToList < 1 ? ' disabled' : ''}></label><label>Quantity<input type="number" name="quantity" min="1" max="${Math.max(1, currency.availableToList)}" value="1" required${currency.availableToList < 1 ? ' disabled' : ''}></label><button${currency.availableToList < 1 ? ' disabled' : ''}>Place listing</button><small>${currency.availableToList.toLocaleString('en-GB')} unlisted · coins stay in your wallet.</small></form></div><div class="crypto-books"><div><h3>Listings</h3><div class="table-scroll"><table><thead><tr><th>Seller</th><th>Qty</th><th>Each</th><th>Status</th></tr></thead><tbody>${orderRows(currency.listings) || '<tr><td colspan="4">No listings.</td></tr>'}</tbody></table></div></div><div><h3>Open bids</h3><div class="table-scroll"><table><thead><tr><th>Bidder</th><th>Qty</th><th>Each</th><th>Status</th></tr></thead><tbody>${orderRows(currency.bids) || '<tr><td colspan="4">No bids.</td></tr>'}</tbody></table></div></div></div><details class="crypto-recent-sales"><summary>Recent executions in this period</summary><div class="table-scroll"><table><thead><tr><th>When</th><th>Volume</th><th>Price</th></tr></thead><tbody>${recentSales || '<tr><td colspan="3">No executions in this period.</td></tr>'}</tbody></table></div></details></section>`;
  }).join('');
  const ranges = [['day', 'Day'], ['week', 'Week'], ['month', 'Month'], ['year', 'Year']]
    .map(([value, label]) => `<a class="button${exchange.range === value ? '' : ' secondary'}" href="/crypto?range=${value}">${label}</a>`).join('');
  const discoveryNote = exchange.hasUndiscoveredCurrencies
    ? '<p class="muted crypto-discovery-note">Keep exploring. The exchange grows with your journey.</p>' : '';
  return `<section class="page-title"><div><p class="eyebrow">Global · open 24 hours</p><h1>Crypto Exchange</h1></div><p>Trading from ${escapeHtml(cityName)} with <strong>${formatGold(exchange.gold)}g</strong>.</p></section><div class="button-row" aria-label="Price chart period">${ranges}</div><p>Read the charts, set your price, and trade when the market moves your way.</p><div class="crypto-market-grid">${cards}</div>${discoveryNote}`;
}

function itemMarketPage(player, item, market, cityName, catalog) {
  const owned = player.inventory[item.id] ?? 0;
  const availableToList = Math.max(0, owned - market.ownListed);
  const localPrice = market.minimumPrice;
  const priceExplanation = market.premium
    ? `Outside its origin, the established ${formatGold(market.basePrice)}g value becomes a ${formatGold(localPrice)}g local minimum.`
    : market.hasOrigin ? 'This origin city uses the established value as the local minimum.'
      : 'Its established value is the minimum in every city.';
  const orderRows = (orders) => orders.map((order) => `<tr id="market-order-${order.id}"><td>${escapeHtml(order.playerName)}</td><td>${order.quantity}</td><td>${formatGold(order.price)}g</td><td>${order.playerId === player.id
    ? `<form method="post" action="/market/orders/${order.id}/cancel"><button class="secondary">Cancel</button></form>`
    : '<span class="muted">Open</span>'}</td></tr>`).join('');
  const sales = market.sales.map((sale) => `<tr><td>${escapeHtml(sale.buyerName)}</td><td>${escapeHtml(sale.sellerName)}</td><td>${sale.quantity}</td><td>${formatGold(sale.price)}g</td></tr>`).join('');
  const sellMaximum = Math.min(owned, market.bestBid?.quantity ?? 0);
  return `<section class="page-title"><div><p class="eyebrow">${escapeHtml(cityName)} market</p><h1>Item market</h1></div><p><strong>${owned}</strong> in ${escapeHtml(cityName)} · <strong>${formatGold(player.gold)}g</strong> available · minimum price <strong>${formatGold(localPrice)}g</strong>. ${priceExplanation}</p></section>
    <div class="item-market-subject">${itemCard(item, { count: owned, featured: true, description: playerFacingItemDescription(item, catalog) })}</div>
    <section class="market-dealing-desk"><article class="market-ticket market-ticket-buy"><p class="eyebrow">Immediate</p><h2>Buy now</h2>${market.bestListing ? `<p><strong>${formatGold(market.bestListing.price)}g</strong> each · ${market.bestListing.quantity} at the best price</p><form data-live-authoritative method="post" action="/market/items/${item.id}/buy-now"><input type="hidden" name="price" value="${market.bestListing.price}"><label>Quantity<input type="number" name="quantity" min="1" max="${market.bestListing.quantity}" value="1" required></label><button${player.gold < market.bestListing.price ? ' disabled' : ''}>Buy now</button></form>` : '<p class="market-ticket-empty">No one is listing this item.</p>'}</article><article class="market-ticket market-ticket-sell"><p class="eyebrow">Immediate</p><h2>Sell now</h2>${market.bestBid ? `<p><strong>${formatGold(market.bestBid.price)}g</strong> each · ${market.bestBid.quantity} wanted</p><form data-live-authoritative method="post" action="/market/items/${item.id}/sell-now"><input type="hidden" name="price" value="${market.bestBid.price}"><label>Quantity<input type="number" name="quantity" min="1" max="${Math.max(1, sellMaximum)}" value="1" required${sellMaximum < 1 ? ' disabled' : ''}></label><button${sellMaximum < 1 ? ` disabled title="You have no ${escapeHtml(item.name)} in ${escapeHtml(cityName)}."` : ''}>Sell now</button></form>` : '<p class="market-ticket-empty">No open bids.</p>'}</article><form id="place-bid" class="market-ticket" method="post" action="/market/items/${item.id}/bids"><p class="eyebrow">Limit order</p><h2>Place bid</h2><label>Price each (gold)<input type="number" name="price" min="${market.listingStartPrice}" step="0.01" value="${market.bidPriceHint}" required></label><label>Quantity<input type="number" name="quantity" min="1" value="1" required></label><button>Place bid</button><small>Minimum ${formatGold(localPrice)}g · your gold remains available until somebody sells into the bid.</small></form><form class="market-ticket" method="post" action="/market/items/${item.id}/listings"><p class="eyebrow">Limit order</p><h2>Place listing</h2><label>Price each (gold)<input type="number" name="price" min="${market.listingStartPrice}" step="0.01" value="${market.listingPriceHint}" required${availableToList < 1 ? ' disabled' : ''}></label><label>Quantity<input type="number" name="quantity" min="1" max="${Math.max(1, availableToList)}" value="1" required${availableToList < 1 ? ' disabled' : ''}></label><button${availableToList < 1 ? ' disabled' : ''}>Place listing</button><small>${availableToList} unlisted in ${escapeHtml(cityName)} · listed things stay in your inventory.</small></form></section>
    <section><h2>Listings</h2><div class="table-scroll"><table><thead><tr><th>Seller</th><th>Quantity</th><th>Each</th><th>Status</th></tr></thead><tbody>${orderRows(market.listings) || '<tr><td colspan="4">No listings.</td></tr>'}</tbody></table></div></section>
    <section><h2>Bids</h2><div class="table-scroll"><table><thead><tr><th>Buyer</th><th>Quantity</th><th>Each</th><th>Status</th></tr></thead><tbody>${orderRows(market.bids) || '<tr><td colspan="4">No bids.</td></tr>'}</tbody></table></div></section>
    <section><h2>Recent sales</h2><div class="table-scroll"><table><thead><tr><th>Buyer</th><th>Seller</th><th>Quantity</th><th>Each</th></tr></thead><tbody>${sales || '<tr><td colspan="4">No sales yet.</td></tr>'}</tbody></table></div></section>`;
}

function mineMarketPage(player, market, cityName) {
  const cryptoPrice = (entry) => `${Number(entry.cryptoQuantity).toLocaleString('en-GB')} ${escapeHtml(entry.cryptoSymbol)} <small>(about ${formatGold(entry.currentGoldValue ?? entry.price)}g now)</small>`;
  const orderRows = (orders, action, label) => orders.map((order) => {
    const available = action === 'sell'
      ? Math.min(market.sellable, order.quantity)
      : Math.min(order.quantity, order.affordable);
    const canTrade = available > 0 && order.validAtCurrentPrice;
    return `<tr><td>${escapeHtml(order.playerName)}</td><td>${order.quantity}</td><td>${cryptoPrice(order)}${order.validAtCurrentPrice ? '' : '<br><small>Below the 10,000g minimum; cannot execute</small>'}</td><td>${order.playerId === player.id
    ? `<form method="post" action="/market/mine-orders/${order.id}/cancel"><button class="secondary">Cancel</button></form>`
    : `<form class="inline-order" data-live-authoritative method="post" action="/market/mine-orders/${order.id}/${action}"><input type="number" name="quantity" min="1" max="${Math.max(1, available)}" value="1" aria-label="Quantity"${canTrade ? '' : ' disabled'}><button${canTrade ? '' : ' disabled'}>${label}</button></form>`}</td></tr>`;
  }).join('');
  const sales = market.sales.map((sale) => `<tr><td>${escapeHtml(sale.buyerName)}</td><td>${escapeHtml(sale.sellerName)}</td><td>${sale.quantity}</td><td>${sale.cryptoSymbol ? `${Number(sale.cryptoQuantity).toLocaleString('en-GB')} ${escapeHtml(sale.cryptoSymbol)} <small>(${formatGold(sale.price)}g at execution)</small>` : `${formatGold(sale.price)}g <small>(legacy)</small>`}</td></tr>`).join('');
  const currencyOptions = market.currencies.map((currency) => `<option value="${currency.id}">${escapeHtml(currency.symbol)} · ${formatGold(currency.currentPrice)}g now · minimum ${currency.minimumQuantity.toLocaleString('en-GB')}</option>`).join('');
  const firstMinimum = market.currencies[0]?.minimumQuantity ?? 1;
  const wallet = market.currencies.map((currency) => `${escapeHtml(currency.symbol)} <strong>${currency.balance.toLocaleString('en-GB')}</strong>`).join(' · ');
  return `<section class="page-title"><div><p class="eyebrow">${escapeHtml(cityName)} mine market</p><h1><img class="table-icon" src="${escapeHtml(market.icon)}" alt=""> ${escapeHtml(market.name)} Mine</h1></div><p>You own <strong>${market.owned}</strong> here and may list <strong>${market.sellable}</strong>. Wallet: ${wallet || 'no regional cryptocurrencies'}.</p></section>
    <p>Buy or sell an entire mine for one cryptocurrency. Every price must be worth at least ${formatGold(market.minimumGoldValue)}g per mine at the coin's current exchange price, both when placed and executed. A miner must always keep at least one permanent mine. Purchased mines retain installed equipment, reset to things mode, and join the buyer's priority queue.</p>
    <section class="trade-forms">
      <form method="post" action="/market/mines/${market.mineTypeId}/listings"><h2>List mines</h2><label>Cryptocurrency<select name="cryptoTypeId" required${market.sellable < 1 ? ' disabled' : ''}>${currencyOptions}</select></label><label>Coins per mine<input type="number" name="cryptoQuantity" min="1" step="1" value="${firstMinimum}" required${market.sellable < 1 ? ' disabled' : ''}></label><label>Number of mines<input type="number" name="quantity" min="1" max="${Math.max(1, market.sellable)}" value="1" required${market.sellable < 1 ? ' disabled' : ''}></label><button ${market.sellable < 1 || !market.currencies.length ? 'disabled' : ''}>Place listing</button></form>
      <form method="post" action="/market/mines/${market.mineTypeId}/bids"><h2>Place bid</h2><label>Cryptocurrency<select name="cryptoTypeId" required>${currencyOptions}</select></label><label>Coins per mine<input type="number" name="cryptoQuantity" min="1" step="1" value="${firstMinimum}" required></label><label>Number of mines<input type="number" name="quantity" min="1" value="1" required></label><button${market.currencies.length ? '' : ' disabled'}>Place bid</button><small>The full cryptocurrency amount is reserved until the bid fills or is cancelled.</small></form>
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
  const orderRows = (orders, action, label) => orders.map((order) => {
    const available = action === 'sell' ? Math.min(market.sellable, order.quantity) : order.quantity;
    return `<tr><td>${escapeHtml(order.playerName)}</td><td>${order.quantity}</td><td>${formatGold(order.price)}g</td><td>${order.playerId === player.id
    ? `<form method="post" action="/market/factory-orders/${order.id}/cancel"><button class="secondary">Cancel</button></form>`
    : `<form class="inline-order" data-live-authoritative method="post" action="/market/factory-orders/${order.id}/${action}"><input type="number" name="quantity" min="1" max="${Math.max(1, available)}" value="1" aria-label="Quantity"${available < 1 ? ' disabled' : ''}><button${available < 1 ? ' disabled' : ''}>${label}</button></form>`}</td></tr>`;
  }).join('');
  const sales = market.sales.map((sale) => `<tr><td>${escapeHtml(sale.buyerName)}</td><td>${escapeHtml(sale.sellerName)}</td><td>${sale.quantity}</td><td>${formatGold(sale.price)}g</td></tr>`).join('');
  const manufacturer = catalogSpecialisationForBonus(catalog, 'factoryThroughput');
  const instructions = rental
    ? `Rent a built, idle factory for ${formatDuration(Number(catalog.settings.factory_rental_duration_ms))}. Rentals include no ore or workers, can only repair damaged things, and return automatically to their owner. An unfinished repair is canceled at expiry and its ore and damaged thing are returned to the renter. Any owner may list an idle factory from one of their regional capitals.`
    : `Buy and sell whole built factories. A factory must be idle and under its owner’s control before it can be listed or transferred. Every specialisation can build and operate factories; ${escapeHtml(manufacturer.name)} works ${formatGold(Number(manufacturer.bonuses.factoryThroughput) * 100)}% faster.`;
  return `<section class="page-title"><div><p class="eyebrow">${escapeHtml(cityName)} factory market</p><h1><img class="table-icon" src="${escapeHtml(icon)}" alt=""> ${escapeHtml(title)}</h1></div><p>You ${rental ? 'currently rent' : 'own'} <strong>${market.owned}</strong> here, may list <strong>${market.sellable}</strong>, and have <strong>${formatGold(player.gold)}g</strong>.</p></section>
    <p>${instructions}</p>
    <section class="trade-forms">
      <form method="post" action="/market/factories/${market.marketType}/listings"><h2>List ${rental ? 'rentals' : 'factories'}</h2><label>Price per ${noun} (gold)<input type="number" name="price" min="0.0001" step="0.0001" required${market.sellable < 1 ? ' disabled' : ''}></label><label>Quantity<input type="number" name="quantity" min="1" max="${Math.max(1, market.sellable)}" value="1" required${market.sellable < 1 ? ' disabled' : ''}></label><button ${market.sellable < 1 ? 'disabled' : ''}>Place listing</button></form>
      <form method="post" action="/market/factories/${market.marketType}/bids"><h2>Place bid</h2><label>Price per ${noun} (gold)<input type="number" name="price" min="0.0001" step="0.0001" required></label><label>Quantity<input type="number" name="quantity" min="1" value="1" required></label><button>Place bid</button></form>
    </section>
    <section><h2>Listings</h2><div class="table-scroll"><table><thead><tr><th>Seller</th><th>Quantity</th><th>Each</th><th></th></tr></thead><tbody>${orderRows(market.listings, 'buy', rental ? 'Rent' : 'Buy') || '<tr><td colspan="4">No listings.</td></tr>'}</tbody></table></div></section>
    <section><h2>Bids</h2><div class="table-scroll"><table><thead><tr><th>Buyer</th><th>Quantity</th><th>Each</th><th></th></tr></thead><tbody>${orderRows(market.bids, 'sell', rental ? 'Rent out' : 'Sell') || '<tr><td colspan="4">No bids.</td></tr>'}</tbody></table></div></section>
    <section><h2>Recent contracts</h2><div class="table-scroll"><table><thead><tr><th>Buyer</th><th>Seller</th><th>Quantity</th><th>Each</th></tr></thead><tbody>${sales || '<tr><td colspan="4">No contracts yet.</td></tr>'}</tbody></table></div></section>
    <p><a class="text-link" href="/factories">Back to factories</a></p>`;
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
      const payment = order.cryptoQuantity
        ? `${Number(order.cryptoQuantity).toLocaleString('en-GB')} ${escapeHtml(order.cryptoSymbol)}`
        : `${formatGold(order.price)}g`;
      return `<tr><td>${subject}</td><td>${order.quantity}</td><td>${payment}</td></tr>`;
    }).join('');
  return `<section class="page-title"><div><p class="eyebrow">${escapeHtml(cityName)} market</p><h1>${escapeHtml(market.ownerName)}'s Listings and Bids</h1></div><a class="text-link" href="/miners/${encodeURIComponent(market.ownerName)}">Back to profile</a></section>
    <section><h2>Listings</h2><div class="table-scroll"><table><thead><tr><th>Market</th><th>Quantity</th><th>Each</th></tr></thead><tbody>${rows('sell') || '<tr><td colspan="3">No listings in this city.</td></tr>'}</tbody></table></div></section>
    <section><h2>Bids</h2><div class="table-scroll"><table><thead><tr><th>Market</th><th>Quantity</th><th>Each</th></tr></thead><tbody>${rows('buy') || '<tr><td colspan="3">No bids in this city.</td></tr>'}</tbody></table></div></section>`;
}

function minersPage(player, miners, catalog, query = '', ignores = []) {
  const ignoredIds = new Set(ignores.map((ignored) => ignored.id));
  const cards = miners.map((miner) => `<article class="miner-card"><div class="miner-meld-rank" style="--miner-chat-color:#${miner.chatColor}" aria-label="Meld rank ${miner.meldRank}, ${miner.meldCount} melds"><span class="miner-rank-number">#${miner.meldRank}</span><span class="miner-meld-total"><strong>${miner.meldCount.toLocaleString('en-GB')}</strong><small>Melds</small></span></div><div class="miner-card-copy"><h3><a class="text-link" href="/miners/${encodeURIComponent(miner.name)}">${escapeHtml(miner.name)}</a></h3><p>${escapeHtml(catalogCityForId(catalog, miner.cityId).name)} · ${miner.mineCount} mines · ${miner.itemCount} things</p></div><div class="miner-actions"><a class="button secondary" href="/messages/${encodeURIComponent(miner.name)}">Message</a>${miner.id === player.id ? '' : `<form method="post" action="/chat/ignores/${miner.id}"><input type="hidden" name="ignored" value="${ignoredIds.has(miner.id) ? '0' : '1'}"><button class="secondary">${ignoredIds.has(miner.id) ? 'Unignore chat' : 'Ignore chat'}</button></form>`}</div></article>`).join('');
  return `<section class="page-title"><div><p class="eyebrow">Community · ranked by Melds</p><h1>Miners</h1></div><p>Find other miners, inspect their discoveries, and start a private conversation.</p></section>
    <form class="market-search" method="get" action="/miners"><label>Find a miner<input name="q" value="${escapeHtml(query)}" placeholder="Miner name"></label><button>Search</button></form>
    <div class="miner-list">${cards || '<p>No matching miners.</p>'}</div>`;
}

function statsPage(stats) {
  const sections = stats.map(({ heading, rows, valueFormat }) => `<section class="stats-section"><h2>${escapeHtml(heading)}</h2><table><tbody>${rows.map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${typeof value === 'number' && valueFormat === 'gold' ? `${formatGold(value)}g` : escapeHtml(value)}</td></tr>`).join('')}</tbody></table></section>`).join('');
  return `<section class="page-title"><div><p class="eyebrow">Public data</p><h1>Server Stats</h1></div><p>Live statistics based on miners whose batteries are charged.</p></section><div class="stats-grid">${sections}</div>`;
}

function adminTabs(active = 'dashboard') {
  const links = [
    ['dashboard', '/admin', 'Dashboard'], ['announcement', '/admin/announcement', 'Announcement'],
    ['backups', '/admin/backups', 'Backups and updates'],
    ['shills', '/admin/shills', 'Shill signals'],
    ['audit', '/admin/audit', 'Audit log'], ['players', '/admin/players', 'Miners'],
    ['payments', '/admin/payments', 'Payments'],
    ['travelling', '/admin/travelling', 'Travelling things'],
    ['world', '/admin/world', 'World events'], ['routes', '/admin/routes', 'World routes']
  ];
  return `<nav class="rating-tabs admin-tabs" aria-label="Administration">${links.map(([key, href, label]) =>
    `<a class="text-link" href="${href}"${active === key ? ' aria-current="page"' : ''}>${label}</a>`).join('')}</nav>`;
}

function adminDashboardPage(data) {
  const cards = [
    ['Active now', data.activeUsers, 'active-users'],
    ['Miners', data.players], ['Active batteries', data.active], ['Suspended', data.suspended],
    ['Credits in circulation', data.credits], ['Gold in circulation', `${formatGold(data.gold)}g`],
    ['Item orders', data.item_orders], ['Mine orders', data.mine_orders],
    ['Factory orders', data.factory_orders], ['Recorded item sales', data.item_sales]
  ].sort(([first], [second]) => first.localeCompare(second))
    .map(([label, value, key]) => `<article><strong${key ? ` data-${key}` : ''}>${escapeHtml(value)}</strong><span>${escapeHtml(label)}</span>${key === 'active-users' ? '<small>Seen in the last 5 minutes</small>' : ''}</article>`).join('');
  const notice = data.maintenanceNotice;
  const minutes = notice ? Math.max(1, Math.ceil((notice.shutdownAt - data.currentTime) / 60000)) : 30;
  const message = notice?.message
    ?? 'You will be temporarily logged out. Please finish anything time-sensitive.';
  const status = notice
    ? `<p class="maintenance-control-status" role="status"><strong>Warning is live.</strong> Shutdown is planned for <time datetime="${new Date(notice.shutdownAt).toISOString()}">${new Date(notice.shutdownAt).toLocaleString('en-GB')}</time>.</p>`
    : '<p class="maintenance-control-status">No maintenance warning is currently displayed.</p>';
  const cancel = notice
    ? '<form method="post" action="/admin/maintenance/cancel"><button class="secondary">Remove warning</button></form>' : '';
  return `${adminTabs('dashboard')}<section class="page-title"><div><p class="eyebrow">Operations</p><h1>Administration</h1></div><p>The useful legacy controls, rebuilt against the live SQLite game with an audit trail.</p></section><div class="admin-metrics">${cards}</div><section class="maintenance-control${notice ? ' is-active' : ''}"><div><p class="eyebrow">Site-wide warning</p><h2>Maintenance shutdown</h2>${status}<p>This displays a prominent live countdown to every signed-in miner. It does not restart the server itself.</p></div><form class="maintenance-control-form" method="post" action="/admin/maintenance"><label>Minutes until shutdown<input type="number" name="minutes" min="1" max="1440" step="1" value="${minutes}" required></label><label>Message<input name="message" maxlength="240" value="${escapeHtml(message)}" required></label><button>${notice ? 'Update warning' : 'Publish warning'}</button></form>${cancel}</section>`;
}

function formatFileSize(bytes) {
  const value = Math.max(0, Number(bytes) || 0);
  if (value < 1024) return `${value.toLocaleString('en-GB')} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MB`;
  return `${(value / 1024 ** 3).toFixed(2)} GB`;
}

function adminBackupsPage(state) {
  const pending = state.pendingRestore
    ? `<section class="error"><h2>Restore pending</h2><p><strong>${escapeHtml(state.pendingRestore.fileName)}</strong> will replace the live database when the server restarts.</p></section>` : '';
  const unavailable = state.available ? ''
    : '<section class="error"><h2>Backups unavailable</h2><p>This server is using an in-memory database. Start it with a persistent DATABASE_FILE to manage backups.</p></section>';
  const rows = state.backups.map((backup) => `<tr>
    <td><strong>${new Date(backup.createdAt).toLocaleString('en-GB')}</strong><br><small>${escapeHtml(backup.fileName)}</small></td>
    <td>${formatFileSize(backup.size)}</td><td>${escapeHtml(backup.reason)}${backup.createdBy ? `<br><small>By ${escapeHtml(backup.createdBy)}</small>` : ''}</td>
    <td><div class="admin-backup-actions"><form method="post" action="/admin/backups/restore"><input type="hidden" name="fileName" value="${escapeHtml(backup.fileName)}"><label class="danger-confirm"><input type="checkbox" name="confirm" value="restore" required><span>Replace the live database and restart</span></label><button${state.restartAvailable ? '' : ' disabled'}>Restore</button></form><form method="post" action="/admin/backups/delete"><input type="hidden" name="fileName" value="${escapeHtml(backup.fileName)}"><label class="danger-confirm"><input type="checkbox" name="confirm" value="delete" required><span>Permanently delete this backup</span></label><button class="secondary">Delete</button></form></div></td>
  </tr>`).join('');
  return `${adminTabs('backups')}<section class="page-title"><div><p class="eyebrow">Database safety</p><h1>Backups and updates</h1></div><p>Create consistent SQLite backups, deploy the latest checked-in code, or return the game to an earlier backup.</p></section>${pending}${unavailable}
    <section class="admin-backup-controls"><div><h2>Back up now</h2><p>The live database remains available while SQLite makes a consistent snapshot.</p><form method="post" action="/admin/backups"><button${state.available ? '' : ' disabled'}>Create backup</button></form></div><div><h2>Back up and update</h2><p>Creates a backup, pulls the current Git branch with fast-forward only, refreshes production dependencies, and gracefully restarts the service. Signed-in sessions will end.</p><form method="post" action="/admin/backups/update"><label class="danger-confirm"><input type="checkbox" name="confirm" value="update" required><span>I have published a maintenance warning</span></label><button${state.updateAvailable ? '' : ' disabled'}>Back up and update</button></form>${state.updateAvailable ? '' : '<p><small>Automatic update and restart are not configured for this process.</small></p>'}</div></section>
    <section><div class="section-heading"><div><h2>Previous backups</h2><p>${state.backups.length.toLocaleString('en-GB')} stored in <code>${escapeHtml(state.backupDirectory)}</code>.</p></div></div><div class="table-scroll"><table><thead><tr><th>Created</th><th>Size</th><th>Reason</th><th>Actions</th></tr></thead><tbody>${rows || '<tr><td colspan="4">No backups have been created yet.</td></tr>'}</tbody></table></div><p><small>Restore is applied during a graceful restart. An extra safety backup of the database being replaced is made automatically.</small></p></section>`;
}

function adminRestartPage(title, message) {
  return `<section class="page-title"><div><p class="eyebrow">Administration</p><h1>${escapeHtml(title)}</h1></div></section><section><p>${escapeHtml(message)}</p><p>The server is restarting gracefully. This page will not update automatically; wait a few seconds, then <a class="text-link" href="/">open MineThings 2</a> and sign in again.</p></section>`;
}

function adminPlayersPage(players, query = '') {
  const rows = players.map((subject) => `<tr><td><a class="text-link" href="/admin/players/${subject.id}">${escapeHtml(subject.name)}</a>${subject.authority > 0 ? ' <strong>Admin</strong>' : ''}</td><td>${escapeHtml(subject.email || 'Not supplied')}<br><small>${subject.email_verified_at === null ? 'Verification pending' : 'Verified'}</small></td><td>${subject.mine_count}</td><td>${subject.item_count}</td><td>${subject.credits}c / ${formatGold(subject.gold)}g</td><td>${subject.suspended ? 'Suspended' : subject.chatBanned || subject.pmBanned ? 'Restricted' : subject.email_verified_at === null ? 'Email locked' : 'Active'}</td></tr>`).join('');
  return `${adminTabs('players')}<section class="page-title"><div><p class="eyebrow">Moderation</p><h1>Miners</h1></div></section><form class="market-search" method="get"><label>Search<input name="q" value="${escapeHtml(query)}" placeholder="Name or email"></label><button>Search</button></form><div class="table-scroll"><table><thead><tr><th>Miner</th><th>Email</th><th>Mines</th><th>Things</th><th>Balance</th><th>Status</th></tr></thead><tbody>${rows || '<tr><td colspan="6">No matching miners.</td></tr>'}</tbody></table></div>`;
}

function adminShillSignalsPage(state, networkEnabled) {
  const levelLabel = {
    high: 'High priority', review: 'Review', watch: 'Watch', context: 'Context'
  };
  const levelCount = (level) => state.pairs.filter((pair) => pair.level === level).length;
  const playerOptions = state.players.map((subject) =>
    `<option value="${subject.id}"${state.selectedPlayerId === subject.id ? ' selected' : ''}>${escapeHtml(subject.name)}</option>`).join('');
  const rows = state.pairs.map((pair) => {
    const identity = (subject) => `<a class="text-link" href="/admin/players/${subject.id}">${escapeHtml(subject.name)}</a><small>${subject.googleLinked ? 'Google linked' : 'Local sign-in'}${subject.suspended ? ' · Suspended' : ''}</small>`;
    const trades = pair.trades.map((trade) => {
      const buyer = trade.buyerId === pair.first.id ? pair.first : pair.second;
      const seller = trade.sellerId === pair.first.id ? pair.first : pair.second;
      const multiple = trade.priceMultiple >= 5
        ? ` · <strong>${trade.priceMultiple.toFixed(1)}× fixed value</strong>` : '';
      return `<li><time datetime="${new Date(trade.createdAt).toISOString()}">${new Date(trade.createdAt).toLocaleString('en-GB')}</time> · ${escapeHtml(buyer.name)} bought ${trade.quantity.toLocaleString('en-GB')} × ${escapeHtml(trade.assetName)} from ${escapeHtml(seller.name)} for ${trade.totalGold.toLocaleString('en-GB')}g${multiple}</li>`;
    }).join('');
    const netFlow = pair.netFlow
      ? `<br><small>Net ${pair.netFlow.gold.toLocaleString('en-GB')}g: ${escapeHtml(pair.netFlow.from.name)} → ${escapeHtml(pair.netFlow.to.name)}</small>` : '';
    const recentActivity = pair.lastActivityAt
      ? new Date(pair.lastActivityAt).toLocaleString('en-GB') : 'No recent timestamp';
    return `<tr class="shill-signal-row" data-shill-level="${pair.level}">
      <td><div class="shill-pair">${identity(pair.first)}<span aria-hidden="true">↔</span>${identity(pair.second)}</div></td>
      <td><span class="shill-risk shill-risk-${pair.level}">${pair.score} · ${levelLabel[pair.level]}</span></td>
      <td><ul class="shill-evidence">${pair.evidence.map((entry) => `<li>${escapeHtml(entry)}</li>`).join('')}</ul></td>
      <td>${pair.tradeCount.toLocaleString('en-GB')} trades · ${pair.grossGold.toLocaleString('en-GB')}g${netFlow}<br><small>Latest signal: ${recentActivity}</small>${trades ? `<details class="shill-trades"><summary>Recent trade evidence</summary><ul>${trades}</ul></details>` : ''}</td>
    </tr>`;
  }).join('');
  const networkNotice = networkEnabled
    ? `<p><strong>Network matching is active.</strong> ${state.networkObservationCount.toLocaleString('en-GB')} pseudonymous sign-in observation${state.networkObservationCount === 1 ? '' : 's'} remain in the 30-day window.</p>`
    : '<p><strong>Network matching is off.</strong> Set a private <code>SHILL_SIGNAL_SECRET</code> of at least 32 characters and restart the server. Economic signals below still work.</p>';
  return `${adminTabs('shills')}<section class="page-title"><div><p class="eyebrow">Market integrity · human review</p><h1>Shill signals</h1></div><p>Prioritises account pairs using recent market transfers and pseudonymous network matches. A signal is evidence to inspect, never proof or an automatic punishment.</p></section>
    <section class="shill-explainer"><h2>Read these signals carefully</h2>${networkNotice}<p>Shared networks can be families, workplaces, mobile carriers or VPNs. Email aliases—including Apple Hide My Email addresses—are not treated as proof. MineThings never shows or stores the raw network address in its game database, and this page never suspends an account.</p></section>
    <div class="admin-metrics"><article><strong>${levelCount('high')}</strong><span>High priority</span></article><article><strong>${levelCount('review')}</strong><span>Review</span></article><article><strong>${levelCount('watch')}</strong><span>Watch</span></article><article><strong>30 days</strong><span>Evidence window</span></article></div>
    <form class="market-search shill-filter" method="get" action="/admin/shills"><label>Account pair filter<select name="playerId"><option value="">All miners</option>${playerOptions}</select></label><button>Apply filter</button></form>
    <div class="table-scroll"><table class="shill-signals-table"><thead><tr><th>Account pair</th><th>Score</th><th>Why it was flagged</th><th>Recent activity</th></tr></thead><tbody>${rows || '<tr><td colspan="4">No account pairs have evidence in this window.</td></tr>'}</tbody></table></div>
    <p><small>The score is a review aid based on corroborating signals. Check player histories and context before taking any moderation action.</small></p>`;
}

function adminPlayerPage(subject, catalog) {
  const moderation = (field, active, label) => `<form method="post" action="/admin/players/${subject.id}/moderation"><input type="hidden" name="field" value="${field}"><input type="hidden" name="enabled" value="${active ? 0 : 1}"><button class="${active ? 'secondary' : ''}">${active ? `Lift ${label}` : label}</button></form>`;
  const itemOptions = [...catalog.items].sort((first, second) =>
    first.name.localeCompare(second.name) || first.id - second.id)
    .map((item) => `<option value="${item.id}">${escapeHtml(item.name)}</option>`).join('');
  return `${adminTabs('players')}<section class="page-title"><div><p class="eyebrow">Miner administration</p><h1>${escapeHtml(subject.name)}</h1></div><a class="text-link" href="/miners/${encodeURIComponent(subject.name)}">Public profile</a></section><div class="admin-metrics"><article><strong>${subject.credits}</strong><span>Credits</span></article><article><strong>${formatGold(subject.gold)}g</strong><span>Gold</span></article><article><strong>${subject.mine_count}</strong><span>Mines</span></article><article><strong>${subject.item_count}</strong><span>Things</span></article></div><section><h2>Email access</h2><p>${escapeHtml(subject.email || 'No address supplied')} · <strong>${subject.email_verified_at === null ? 'Verification pending — game locked' : `Verified ${new Date(subject.email_verified_at).toLocaleString('en-GB')}`}</strong></p></section><section><h2>Moderation</h2><div class="admin-actions">${moderation('suspended', Boolean(subject.suspended), 'Suspend account')}${moderation('chat', Boolean(subject.chat_banned), 'Ban public chat')}${moderation('pm', Boolean(subject.pm_banned), 'Ban private messages')}</div></section><section><h2>Grants</h2><div class="trade-forms"><form method="post" action="/admin/players/${subject.id}/grant"><input type="hidden" name="kind" value="credits"><label>Credits<input type="number" name="amount" min="1" required></label><button>Grant credits</button></form><form method="post" action="/admin/players/${subject.id}/grant"><input type="hidden" name="kind" value="gold"><label>Gold (whole units)<input type="number" name="amount" min="1" required></label><button>Grant gold</button></form><form method="post" action="/admin/players/${subject.id}/grant"><input type="hidden" name="kind" value="item"><label>Thing<select name="itemId">${itemOptions}</select></label><label>Quantity<input type="number" name="amount" min="1" required></label><button>Grant thing</button></form></div></section>`;
}

function adminAnnouncementPage() {
  return `${adminTabs('announcement')}<section class="page-title"><div><p class="eyebrow">Global message</p><h1>Send announcement</h1></div><p>Delivered as an Admin message to every miner’s inbox.</p></section><form class="account-grid" method="post" action="/admin/announcement"><label>Subject<input name="subject" maxlength="120" required></label><label>Message<textarea name="body" maxlength="4000" rows="10" required></textarea></label><button>Send to every miner</button></form>`;
}

function adminAuditPage(entries) {
  const rows = entries.map((entry) => `<tr><td>${new Date(entry.created_at).toLocaleString('en-GB')}</td><td>${escapeHtml(entry.administrator_name)}</td><td>${escapeHtml(entry.action)}</td><td>${escapeHtml(entry.subject_name ?? 'All miners')}</td><td>${escapeHtml(entry.details)}</td></tr>`).join('');
  return `${adminTabs('audit')}<section class="page-title"><div><p class="eyebrow">Accountability</p><h1>Audit log</h1></div></section><div class="table-scroll"><table><thead><tr><th>When</th><th>Administrator</th><th>Action</th><th>Subject</th><th>Details</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No administrative actions yet.</td></tr>'}</tbody></table></div>`;
}

function adminRoutesPage(routes, catalog) {
  const routeTypes = catalog.settings.map_route_types;
  const routeRow = (route) => {
    const type = routeTypes[route.type]?.label ?? `Type ${route.type}`;
    const location = (mapName, cityName, cityId, capitalCityId) =>
      `<strong>${escapeHtml(cityName)}</strong><br><small>${escapeHtml(mapName)}${
        Number(cityId) === Number(capitalCityId) ? ` · ${CAPITAL_CITY_ICON} Capital` : ''}</small>`;
    const scope = Number(route.city1_id) === Number(route.city2_id)
      ? 'Mission' : route.interMap ? 'Gateway' : 'Regional';
    const status = route.open ? 'Open'
      : route.draining
        ? `Closed · draining ${route.activeJourneys} journey${route.activeJourneys === 1 ? '' : 's'}`
        : 'Closed';
    return `<tr><td>${location(route.map1_name, route.city1_name, route.city1_id,
      route.map1_capital_city_id)}</td><td>${location(route.map2_name, route.city2_name,
      route.city2_id, route.map2_capital_city_id)}</td><td>${escapeHtml(type)}<br><small>${scope} · #${route.id}</small></td><td>${Number(route.length).toLocaleString('en-GB')} km</td><td><strong>${escapeHtml(status)}</strong>${route.activeJourneys ? `<br><small>${route.vehicle_journeys} vehicle · ${route.creature_journeys} creature</small>` : ''}</td><td><form method="post" action="/admin/routes/${route.id}"><input type="hidden" name="open" value="${route.open ? 0 : 1}"><button class="${route.open ? 'secondary' : ''}">${route.open ? 'Close route' : 'Open now'}</button></form></td></tr>`;
  };
  const routeTable = (selectedRoutes, emptyMessage) => {
    const rows = selectedRoutes.map(routeRow).join('');
    return `<div class="table-scroll"><table><thead><tr><th>From</th><th>To</th><th>Mode</th><th>Distance</th><th>Status</th><th></th></tr></thead><tbody>${rows || `<tr><td colspan="6">${escapeHtml(emptyMessage)}</td></tr>`}</tbody></table></div>`;
  };
  const interRegionRoutes = routes.filter((route) => route.interMap);
  const regionalRoutes = routes.filter((route) => !route.interMap);
  return `${adminTabs('routes')}<section class="page-title"><div><p class="eyebrow">Complete world network</p><h1>World routes</h1></div><p>Closing a route blocks every new departure immediately. Journeys already underway finish naturally, then the drained route reopens automatically.</p></section>
    <section class="admin-route-section" data-route-scope="regional"><p class="eyebrow">Within each region</p><h2>Regional and mission routes</h2>${routeTable(regionalRoutes, 'No regional routes are configured.')}</section>
    <section class="admin-route-section" data-route-scope="inter-region"><p class="eyebrow">Between regional capitals</p><h2>Inter-region routes</h2>${routeTable(interRegionRoutes, 'No inter-region routes are configured.')}</section>`;
}

function adminWorldEventsPage(state, catalog, currentTime) {
  const conditions = [
    ['clear', 'Clear', 18, 8, 0], ['cloud', 'Cloud', 14, 18, 0],
    ['hurricane', 'Hurricane', 24, 170, 50], ['rain', 'Rain', 11, 30, 8],
    ['snow', 'Snow', -3, 22, 4], ['storm', 'Storm', 9, 85, 30]
  ];
  const weatherForms = [...state.weather].sort((first, second) =>
    first.mapName.localeCompare(second.mapName)).map((entry) => `<form class="admin-weather-form" method="post" action="/admin/world/weather"><input type="hidden" name="mapId" value="${entry.mapId}"><h3>${escapeHtml(entry.mapName)}</h3><label>Condition<select name="condition">${conditions.map(([value, label, temperature, wind, rainfall]) => `<option value="${value}" data-temperature="${temperature}" data-wind="${wind}" data-rainfall="${rainfall}"${entry.condition === value ? ' selected' : ''}>${label}</option>`).join('')}</select></label><label>Temperature C<input type="number" name="temperatureC" min="-50" max="60" step="0.1" value="${entry.temperatureC}" required></label><label>Wind km/h<input type="number" name="windKph" min="0" max="300" step="1" value="${entry.windKph}" required></label><label>Precipitation mm<input type="number" name="rainfallMm" min="0" max="500" step="0.1" value="${entry.rainfallMm}" required></label><button>Change current weather</button></form>`).join('');
  const mapOptions = [...state.maps].sort((first, second) =>
    first.name.localeCompare(second.name)).map((map) =>
    `<option value="${map.id}">${escapeHtml(map.name)}</option>`).join('');
  const routeTypeId = (name) => catalog.settings.map_route_types
    .findIndex((entry) => entry.name === name);
  const routeOptions = (name) => state.routes.filter((route) => route.type === routeTypeId(name))
    .sort((first, second) => first.map1_name.localeCompare(second.map1_name)
      || first.city1_name.localeCompare(second.city1_name)
      || first.map2_name.localeCompare(second.map2_name)
      || first.city2_name.localeCompare(second.city2_name) || first.id - second.id)
    .map((route) => `<option value="${route.id}">${escapeHtml(route.map1_name)}: ${CAPITAL_CITY_ICON} ${escapeHtml(route.city1_name)} to ${escapeHtml(route.map2_name)}: ${CAPITAL_CITY_ICON} ${escapeHtml(route.city2_name)} (${Number(route.length).toLocaleString('en-GB')} km)</option>`).join('');
  const creatureTiers = catalog.rarities.filter((rarity) =>
    Number(catalog.settings.world_creature_tier_weights[rarity.id]) > 0);
  const creatureTierOptions = creatureTiers.map((rarity) =>
    `<option value="${rarity.id}">${escapeHtml(rarity.name)} · Tier ${rarity.id}</option>`).join('');
  const vehicleTierOptions = creatureTiers.map((rarity) =>
    `<option value="${rarity.id}">${escapeHtml(catalog.settings.rarity_color_names[rarity.id])} · Tier ${rarity.id}</option>`).join('');
  const creatureOptions = (routeType) => Object.entries(
    catalog.settings.world_creature_route_types
  ).filter(([, behavior]) => behavior === routeType)
    .sort(([first], [second]) => catalog.settings.world_creature_names[first]
      .localeCompare(catalog.settings.world_creature_names[second]))
    .map(([type]) =>
    `<option value="${escapeHtml(type)}">${escapeHtml(catalog.settings.world_creature_names[type])}</option>`).join('');
  const creatureForm = (label, routeType) => `<form method="post" action="/admin/world/creatures"><h3>Release ${label}</h3><label>Species<select name="type" required>${creatureOptions(routeType)}</select></label><label>Creature rarity<select name="rarity" required>${creatureTierOptions}</select></label><label>World map<select name="mapId">${mapOptions}</select></label><label>Open ${routeType} route<select name="routeId" required>${routeOptions(routeType)}</select></label><button>Release creature</button></form>`;
  const ghostForm = (kind, label, routeType) => `<form method="post" action="/admin/world/ghosts"><input type="hidden" name="kind" value="${kind}"><h3>Raise ${label}</h3><label>Open ${routeType} route<select name="routeId" required>${routeOptions(routeType)}</select></label><label>Vehicle tier<select name="rarity">${vehicleTierOptions}</select></label><button>Raise ${label}</button></form>`;
  const ghostRows = [...state.ghosts].sort((first, second) =>
    String(first.name).localeCompare(String(second.name)) || first.id - second.id)
    .map((ghost) => `<tr><td>${escapeHtml(ghost.name)}</td><td>${ghost.ghost_kind === 'ship' ? 'Ghost Ship' : 'Ghost Rider'}</td><td>Tier ${ghost.rarity}</td><td>${escapeHtml(ghost.routeName)}</td><td>${new Date(ghost.risen_at).toLocaleString('en-GB')}</td></tr>`).join('');
  return `${adminTabs('world')}<section class="page-title"><div><p class="eyebrow">Live world control</p><h1>World events</h1></div><a class="text-link" href="/events">Player view</a></section>
    <section><div class="section-heading"><div><h2>Current weather period</h2><p>${new Date(state.slotAt).toLocaleString('en-GB')} - ${new Date(state.nextWeatherAt).toLocaleString('en-GB')} | ${formatDuration(state.nextWeatherAt - currentTime)} remaining</p></div></div><p>Choosing another weather type fills in a practical temperature, wind, and precipitation starting point. You can adjust any value before applying it.</p><div class="trade-forms">${weatherForms}</div></section>
    <section><div class="section-heading"><div><h2>Ghost-hunter test fleet</h2><p>${Number(state.hunterFleets.players)} miners currently hold ${Number(state.hunterFleets.vehicles)} provisioned craft.</p></div></div><p>Give every real account one fully armed land vehicle and ship at each of the six tiers, distributed among random compatible cities. The operation is idempotent.</p><form method="post" action="/admin/world/ghost-fleets"><button>Provision all hunter fleets</button></form></section>
    <section><h2>Release a world creature</h2><p>Choose a sea or land species and an explicit Common-through-Legendary rarity. Every creature follows the same open-route movement, combat-class interception, live transit, and killer-only reward process.</p><div class="trade-forms">${creatureForm('Sea creature', 'sea')}${creatureForm('Land creature', 'land')}</div></section>
    <section><h2>The restless dead</h2><p>Route wrecks and defeated event-creature remains are scanned once and may rise according to the moon-adjusted chance. Administrative ghosts use the same route movement, combat classes, patrol orders, and spectral bounty.</p><div class="trade-forms">${ghostForm('rider', 'Ghost Rider', 'land')}${ghostForm('ship', 'Ghost Ship', 'sea')}</div><div class="table-scroll"><table><thead><tr><th>Name</th><th>Kind</th><th>Tier</th><th>Route</th><th>Risen</th></tr></thead><tbody>${ghostRows || '<tr><td colspan="5">No ghosts currently haunt the routes.</td></tr>'}</tbody></table></div></section>
    <script src="/node/admin-weather.js?v=20260831a" defer></script>`;
}

function adminTravellingThingsPage(state, catalog, currentTime) {
  const namedCounts = (names) => {
    const counts = new Map();
    for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1);
    return [...counts].sort(([first], [second]) => first.localeCompare(second))
      .map(([name, count]) => `${count > 1 ? `${count}× ` : ''}${escapeHtml(name)}`);
  };
  const transports = [...state.transports].sort((first, second) =>
    first.playerName.localeCompare(second.playerName)
      || first.vehicleName.localeCompare(second.vehicleName) || first.id - second.id);
  const trafficRows = transports.map((transport) => {
    const type = catalog.settings.map_route_types[transport.routeType]?.label
      ?? `Type ${transport.routeType}`;
    const order = catalog.settings.travel_order_names[transport.travelOrder]
      ?? transport.travelOrder;
    const cargoQuantity = transport.cargo.reduce(
      (sum, item) => sum + Number(item.quantity), 0);
    const fittings = namedCounts([
      ...transport.mods, ...transport.weapons, ...transport.cannons
    ]);
    const cargo = [...transport.cargo].sort((first, second) =>
      first.name.localeCompare(second.name)).map((item) => {
      const catalogItem = catalog.byId.get(Number(item.itemId));
      return `<li><a class="thing-link rarity-${catalogItem?.rarity ?? 0}" href="/items/${item.itemId}">${item.quantity > 1 ? `${item.quantity}× ` : ''}${escapeHtml(item.name)}</a></li>`;
    }).join('');
    const owner = transport.npc ? `<strong>${escapeHtml(transport.playerName)}</strong>`
      : `<a class="text-link" href="/admin/players/${transport.playerId}">${escapeHtml(transport.playerName)}</a>`;
    const flags = [
      transport.ghostId ? (transport.ghostKind === 'ship' ? 'Ghost Ship' : 'Ghost Rider') : '',
      transport.creatureId ? `Pursuing ${transport.creatureName}` : '',
      transport.interMap ? 'Inter-map' : '', transport.damaged ? 'Damaged' : '',
      transport.aircraftDestroyed ? 'Shot down' : ''
    ].filter(Boolean);
    const origin = transport.originMapName === transport.destinationMapName
      ? transport.originName : `${transport.originMapName} / ${transport.originName}`;
    const destination = transport.originMapName === transport.destinationMapName
      ? transport.destinationName : `${transport.destinationMapName} / ${transport.destinationName}`;
    const loadoutSummary = `${cargoQuantity} cargo · ${fittings.length} fitting type${
      fittings.length === 1 ? '' : 's'}${transport.ammunition
      ? ` · ${transport.ammunition} shots` : ''}`;
    const loadout = `<details><summary>${escapeHtml(loadoutSummary)}</summary>${cargo
      ? `<strong>Cargo</strong><ul>${cargo}</ul>` : '<p>No cargo.</p>'}${fittings.length
      ? `<strong>Fittings</strong><ul>${fittings.map((name) => `<li>${name}</li>`).join('')}</ul>`
      : '<p>No fittings.</p>'}</details>`;
    return `<tr${transport.ghostId ? ' class="admin-traffic-ghost"' : ''}><td>${owner}<br><small>#${transport.playerId}</small></td><td><img class="table-icon" src="${escapeHtml(transport.icon)}" alt=""> <a class="thing-link rarity-${transport.rarity}" href="/items/${transport.itemId}"><strong>${escapeHtml(transport.vehicleName)}</strong></a><br><small>${escapeHtml(transport.itemName)} · Tier ${transport.rarity}${flags.length ? ` · ${escapeHtml(flags.join(' · '))}` : ''}</small>${loadout}</td><td><strong>${escapeHtml(origin ?? 'Unknown')}</strong> → <strong>${escapeHtml(destination ?? 'Unknown')}</strong><br><small>${escapeHtml(type)} · route #${transport.routeId} · ${Number(transport.length ?? 0).toLocaleString('en-GB')} km · ${Number(transport.speed).toFixed(1)} km/h</small></td><td><div class="admin-traffic-progress"><span style="width:${(transport.progress * 100).toFixed(1)}%"></span></div><strong>${(transport.progress * 100).toFixed(1)}%</strong><br><small>ETA ${new Date(transport.arrivesAt).toLocaleString('en-GB')} · ${formatDuration(Math.max(0, transport.arrivesAt - currentTime))}</small></td><td><strong>${escapeHtml(order)}</strong>${transport.travelOrder !== 'peaceful' ? `<br><small>Engages the same combat tier${transport.aggressiveVsSentry ? ' + patrols' : ''}</small>` : ''}</td></tr>`;
  }).join('');
  const creatureRows = [...state.creatures].sort((first, second) =>
    first.name.localeCompare(second.name) || first.map_name.localeCompare(second.map_name)
      || first.id - second.id).map((creature) => {
    const routeType = catalog.settings.map_route_types[creature.route_type]?.label
      ?? `Type ${creature.route_type}`;
    const reward = creature.reward_type === 'ore'
      ? `${Number(creature.ore_drop).toLocaleString('en-GB')} Ore drop`
      : 'Treasure bounty';
    return `<tr class="admin-traffic-creature rarity-${creature.rarity}"><td><span class="creature-table-icon" aria-hidden="true"><img src="${escapeHtml(creature.icon)}" alt=""></span> <strong>${escapeHtml(creature.name)}</strong><br><small>${escapeHtml(creature.rarity_name)} · ${escapeHtml(reward)} · ${Math.round(Number(creature.hp))}/${Math.round(Number(creature.max_hp))} health</small></td><td>${escapeHtml(creature.map_name)}</td><td><strong>${escapeHtml(creature.city1_name)}</strong> ↔ <strong>${escapeHtml(creature.city2_name)}</strong><br><small>${escapeHtml(routeType)} · route #${creature.route_id} · ${Number(creature.length).toLocaleString('en-GB')} km</small></td><td><div class="admin-traffic-progress"><span style="width:${(creature.progress * 100).toFixed(1)}%"></span></div><strong>${(creature.progress * 100).toFixed(1)}%</strong><br><small>${Number(creature.speed).toFixed(1)} km/h toward ${escapeHtml(creature.destination_city_name)} · ETA ${new Date(creature.arrives_at).toLocaleString('en-GB')}</small></td><td>${Number(creature.pursuer_count)} hunter${Number(creature.pursuer_count) === 1 ? '' : 's'}</td></tr>`;
  }).join('');
  const total = state.transports.length + state.creatures.length;
  return `${adminTabs('travelling')}<section class="page-title"><div><p class="eyebrow">Live network traffic</p><h1>Travelling things</h1></div><a class="text-link" href="/admin/routes">Manage routes</a></section>
    <p>${total} thing${total === 1 ? '' : 's'} currently travelling. Lists are alphabetical; progress and arrival times remain live.</p>
    <section><h2>Creatures on the move</h2><div class="table-scroll"><table class="admin-traffic-table"><thead><tr><th>Creature</th><th>Region</th><th>Route</th><th>Progress</th><th>Pursuit</th></tr></thead><tbody>${creatureRows || '<tr><td colspan="5">No creatures are currently travelling.</td></tr>'}</tbody></table></div></section>
    <section><h2>Vehicles in transit</h2><div class="table-scroll"><table class="admin-traffic-table"><thead><tr><th>Owner</th><th>Transport and loadout</th><th>Journey</th><th>Progress</th><th>Orders</th></tr></thead><tbody>${trafficRows || '<tr><td colspan="5">No vehicles are currently in transit.</td></tr>'}</tbody></table></div></section>`;
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
    .map((city) => `<option value="${city.id}"${selectedCityId === city.id ? ' selected' : ''}>${escapeHtml(cityChoiceLabel(catalog, city.id))}</option>`).join('');
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
    : `<div class="profile-tools"><a class="profile-action" href="/messages/${encodeURIComponent(subject.name)}"><img src="/img/icons/icon_message.png" alt=""> Send message</a><a class="profile-action" href="/miners/${encodeURIComponent(subject.name)}/market"><img src="/img/icons/icon_listing.png" alt=""> Listings and bids</a></div>`;
  const profession = catalogSpecialisationForId(catalog, subject.profession);
  const mines = subject.showMines === false ? '' : subject.mines.map((mine) => {
    const type = catalogMineTypeForId(catalog, mine.mineTypeId);
    return `<li><img class="table-icon" src="${escapeHtml(type.icon)}" alt=""> ${escapeHtml(type.name)} Mine · ${escapeHtml(catalogCityForId(catalog, mine.cityId).name)}</li>`;
  }).join('');
  return `<section class="page-title"><div><p class="eyebrow">Miner profile</p><h1>${escapeHtml(subject.name)}</h1></div>${editor}</section>
    <section class="profile-about">${avatarStack(subject.avatarLayers, `${subject.name} avatar`)}<div><h2>About</h2><p><strong>${escapeHtml(subject.professionTitle)} ${escapeHtml(profession.name)}</strong> · ${subject.meldIds.length} melds · <a class="text-link" href="/melds/compare/${encodeURIComponent(subject.name)}">Compare melds</a></p>${description}${ownProfile ? '<p><a class="button secondary" href="/avatar">Edit avatar</a></p>' : ''}</div></section>
    ${subject.showMines === false ? '' : `<section><h2>Mines</h2><ul>${mines || '<li>No mines.</li>'}</ul></section>`}
    <section><h2>Inventory</h2><p>${filteredCount} matching things · ${globalCount} globally.</p>${inventoryFilters}${armory ? `<p class="muted">An active ${escapeHtml(armoryGadget.displayName)} conceals this miner’s weapons and fittings.</p>` : ''}<div class="item-grid">${things || '<p>No matching things.</p>'}</div>${!filters.loadAll && inventory.length > visibleInventory.length ? `<p><a class="text-link" href="?function=${encodeURIComponent(selectedFunction)}&mineType=${selectedMineTypeId ?? ''}&city=${selectedCityId ?? ''}&all=1">Show ${inventory.length - visibleInventory.length} more item types</a></p>` : ''}</section>`;
}

function accountPage(player, catalog, googleLogin = null) {
  const passwordMinimum = Number(catalog.settings.password_min_length);
  const googleCard = googleLogin?.enabled
    ? `<section class="account-auth-card"><h2>Google login</h2>${googleLogin.identity
      ? `<p><strong class="verified-state">Linked</strong> ${escapeHtml(googleLogin.identity.email)}</p><p>You can use Google or your miner name and password to sign in.</p>`
      : '<p>Link a Google account for one-click login. This does not remove your password.</p><a class="button secondary" href="/auth/google">Link Google account</a>'}</section>`
    : '';
  return `<section class="page-title"><div><p class="eyebrow">Miner settings</p><h1>Account</h1></div><a class="text-link" href="/miners/${encodeURIComponent(player.name)}">View profile</a></section>
    <section class="account-grid">
      <form method="post" action="/account/password"><h2>Change password</h2><label>Old password<input type="password" name="oldPassword" autocomplete="current-password" required></label><label>New password<input type="password" name="password" minlength="${passwordMinimum}" autocomplete="new-password" required></label><label>Confirm new password<input type="password" name="confirmPassword" minlength="${passwordMinimum}" autocomplete="new-password" required></label><button>Change password</button></form>
      <form method="post" action="/account/email"><h2>Verified email</h2><p><strong class="verified-state">Verified</strong> ${escapeHtml(player.email)}</p><p>Changing this address locks the account until the replacement address is verified.</p><label>New email<input type="email" name="email" maxlength="${Number(catalog.settings.email_max_length)}" value="${escapeHtml(player.email)}" autocomplete="email" required></label><label>Current password<input type="password" name="password" autocomplete="current-password" required></label><button>Change and verify email</button></form>
      <form method="post" action="/account/privacy"><h2>Privacy</h2><label class="checkbox-line"><input type="checkbox" name="showMines"${player.showMines ? ' checked' : ''}> Show mines in profile</label><button>Save privacy settings</button></form>
      ${googleCard}
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
  return `<section class="page-title"><div><p class="eyebrow">Profile</p><h1>Avatar Editor</h1></div><a class="text-link" href="/miners/${encodeURIComponent(player.name)}">Back to profile</a></section>
    <section class="avatar-editor">${avatarStack(player.avatarLayers, 'Current avatar')}<form method="post" action="/avatar"><p>Avatar things must be stored in your home city. A border, background, and model are required; gendered layers must match.</p>${groups}<button>Save avatar</button></form></section>`;
}

function meldComparisonPage(player, other, catalog) {
  const own = new Set(player.meldIds);
  const theirs = new Set(other.meldIds);
  const rows = catalog.melds.filter((meld) => meld.public && (own.has(meld.id) || theirs.has(meld.id)))
    .map((meld) => `<tr><td><a class="text-link" href="/melds/${meld.id}">${escapeHtml(meld.name)}</a></td><td>${own.has(meld.id) ? 'Yes' : '—'}</td><td>${theirs.has(meld.id) ? 'Yes' : '—'}</td></tr>`).join('');
  return `<section class="page-title"><div><p class="eyebrow">Meld comparison</p><h1>${escapeHtml(player.name)} and ${escapeHtml(other.name)}</h1></div><a class="text-link" href="/miners/${encodeURIComponent(other.name)}">Back to profile</a></section><table><thead><tr><th>Meld</th><th>You</th><th>${escapeHtml(other.name)}</th></tr></thead><tbody>${rows || '<tr><td colspan="3">Neither miner has a public meld yet.</td></tr>'}</tbody></table>`;
}

const MESSAGE_TYPE_FILTERS = [
  ['all', 'All'], ['PM', 'PM'], ['Findings', 'Findings'], ['Market', 'Market'], ['Vehicle', 'Vehicle'],
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
      ? `<a class="text-link" href="/messages/${encodeURIComponent(other)}">${escapeHtml(other)}</a>`
      : escapeHtml(other);
    const subject = message.subject || `${message.messageType} message`;
    const heading = privateMessage
      ? `From ${sender}`
      : `<span class="message-type">${escapeHtml(message.messageType)}</span><a class="message-subject" href="/messages/view/${message.id}">${escapeHtml(subject)}</a>`;
    const nextReadAction = message.read ? 'unread' : 'read';
    const nextReadLabel = message.read ? 'Mark unread' : 'Mark read';
    const deleteProtected = message.kept && !message.deleted;
    const retention = message.kept
      ? '<span class="message-kept">Kept</span>'
      : `<span class="message-expiry">Deletes ${new Date(message.createdAt + retentionMs).toLocaleDateString('en-GB')}</span>`;
    const createdAt = new Date(message.createdAt);
    return `<article class="message-row ${!message.read ? 'unread' : ''}${message.kept ? ' kept' : ''}">
      <input type="checkbox" name="message_${message.id}" value="1" form="message-bulk" data-message-select aria-label="Select message from ${escapeHtml(other)}">
      <div class="message-summary"><strong>${heading}</strong><span class="message-preview">${escapeHtml(message.body.slice(
        0, Number(catalog.settings.message_preview_length)))}</span></div>
      <time datetime="${createdAt.toISOString()}">${createdAt.toLocaleString('en-GB')}<small>${retention}</small></time>
      <form class="message-actions" method="post" action="/messages/actions">
        <input type="hidden" name="message_${message.id}" value="1"><input type="hidden" name="filter" value="${filter}"><input type="hidden" name="type" value="${escapeHtml(type)}">
        <button class="link-button" name="action" value="${nextReadAction}">${nextReadLabel}</button>
        <button class="link-button" name="action" value="${message.kept ? 'unkeep' : 'keep'}">${message.kept ? 'Stop keeping' : 'Keep'}</button>
        <button class="link-button" name="action" value="${message.deleted ? 'restore' : 'delete'}"${deleteProtected ? ' disabled title="Stop keeping this message before deleting it"' : ''}>${message.deleted ? 'Restore' : 'Delete'}</button>
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
    <form id="message-bulk" class="message-bulk" method="post" action="/messages/actions" data-message-bulk>
      <input type="hidden" name="filter" value="${filter}">
      <input type="hidden" name="type" value="${escapeHtml(type)}">
      <label class="message-select-all"><input type="checkbox" data-message-select-all aria-label="Select all visible messages"${messages.length ? '' : ' disabled'}> Select all</label>
      <span>Selected: <strong data-message-selected-count>0</strong></span><button name="action" value="read">Mark read</button><button name="action" value="unread">Mark unread</button>
      <button name="action" value="keep">Keep</button><button name="action" value="unkeep">Stop keeping</button>
      <button name="action" value="${filter === 'deleted' ? 'restore' : 'delete'}">${filter === 'deleted' ? 'Restore' : 'Delete'}</button>
    </form>
    <div class="message-list">${rows || `<p>No ${emptyDescription ? `${escapeHtml(emptyDescription)} ` : ''}messages.</p>`}</div>
    <script src="/node/messages.js" defer></script>`;
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
      ? `<a class="text-link" href="${escapeHtml(path)}">${escapeHtml(match[2])}</a>`
      : escapeHtml(match[2]);
    offset = match.index + match[0].length;
  }
  return html + escapeHtml(text.slice(offset));
}

function messageItemGroups(message, catalog) {
  const details = message.details && typeof message.details === 'object' ? message.details : {};
  const groups = [];
  const addGroup = (label, entries, kind = '') => {
    if (!Array.isArray(entries)) return;
    const quantities = new Map();
    for (const entry of entries) {
      const itemId = Number(typeof entry === 'object' && entry !== null
        ? (entry.itemId ?? entry.item_id ?? entry.id) : entry);
      const quantity = Number(typeof entry === 'object' && entry !== null
        ? (entry.quantity ?? entry.count ?? 1) : 1);
      if (!Number.isSafeInteger(itemId) || itemId < 1
          || !Number.isFinite(quantity) || quantity <= 0) continue;
      const snapshot = typeof entry === 'object' && entry !== null ? entry : {};
      const item = catalog.byId.get(itemId) ?? (
        String(snapshot.name ?? '').trim() ? {
          id: itemId, name: String(snapshot.name),
          icon: String(snapshot.icon ?? '').trim() || '/node/favicon.svg',
          rarity: Number.isFinite(Number(snapshot.rarity)) ? Number(snapshot.rarity) : -1,
          rarityName: String(snapshot.rarityName ?? 'Archived')
        } : null
      );
      if (!item) continue;
      const current = quantities.get(itemId) ?? { item, quantity: 0 };
      current.quantity += Math.floor(quantity);
      quantities.set(itemId, current);
    }
    const items = [...quantities.values()]
      .sort((first, second) => compareItemsByRarity(first.item, second.item));
    if (items.length) groups.push({ label, items, kind });
  };

  if (details.event === 'daily-findings-digest'
      || details.event === 'daily-dwarf-findings-report'
      || details.event === 'dwarf-departure-report') {
    const dwarfReport = details.event === 'daily-dwarf-findings-report'
      || details.event === 'dwarf-departure-report';
    const kept = details.keptFindings ?? details.storedFindings ?? details.kept;
    if (Array.isArray(kept)) {
      addGroup(dwarfReport ? 'Dwarf finds added to your things' : 'Added to your things',
        kept.filter((entry) =>
        !String(entry?.status ?? '').trim()), 'kept');
      const statusGroups = new Map();
      for (const entry of kept) {
        const status = String(entry?.status ?? '').trim();
        if (!status) continue;
        if (!statusGroups.has(status)) statusGroups.set(status, []);
        statusGroups.get(status).push(entry);
      }
      for (const [status, entries] of statusGroups) addGroup(status, entries, 'kept');
    }
    addGroup(dwarfReport
      ? 'Dwarf finds auto-recycled into Ore scraps'
      : 'Auto-recycled into Ore scraps',
      details.autoRecycledFindings ?? details.recycledFindings ?? details.autoRecycled,
      'auto-recycled');
    const cryptoQuantities = new Map();
    for (const entry of Array.isArray(details.cryptoFindings) ? details.cryptoFindings : []) {
      const cryptoTypeId = Number(entry?.cryptoTypeId ?? entry?.crypto_type_id ?? entry?.id);
      const quantity = Number(entry?.quantity ?? entry?.count ?? 1);
      if (!Number.isSafeInteger(cryptoTypeId) || cryptoTypeId < 1
          || !Number.isFinite(quantity) || quantity <= 0) continue;
      const currency = cryptoType(cryptoTypeId);
      const name = String(entry?.name ?? currency?.name ?? '').trim();
      if (!name) continue;
      const item = {
        id: `crypto-${cryptoTypeId}`, name,
        icon: String(entry?.icon ?? currency?.icon ?? '/node/favicon.svg'),
        rarity: Number(entry?.rarity ?? cryptoTypeId),
        rarityName: String(entry?.rarityName ?? 'Crypto coin'), path: '/crypto'
      };
      const current = cryptoQuantities.get(cryptoTypeId) ?? { item, quantity: 0 };
      current.quantity += Math.floor(quantity);
      cryptoQuantities.set(cryptoTypeId, current);
    }
    const cryptoItems = [...cryptoQuantities.values()]
      .sort((first, second) => Number(first.item.rarity) - Number(second.item.rarity));
    if (cryptoItems.length) groups.push({
      label: 'Added to your crypto things', items: cryptoItems, kind: 'crypto', noun: 'coin'
    });
  }
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

function captiveDwarfCombatEntries(result) {
  return (Array.isArray(result?.captiveRounds) ? result.captiveRounds : [])
    .flatMap((round) => (Array.isArray(round?.strikes) ? round.strikes : [])
      .map((strike) => ({
        phase: String(round.phase ?? 'combat'), round: Number(round.round), ...strike
      })));
}

function messageCombatReportHtml(message, catalog) {
  const details = message.details && typeof message.details === 'object' ? message.details : {};
  const format = (value) => {
    const number = Number(value);
    return Number.isFinite(number) ? number.toLocaleString('en-GB', {
      maximumFractionDigits: 3
    }) : 'Unknown';
  };
  const formatCombatStat = (value) => {
    const number = Number(value);
    return format(Number.isFinite(number) ? Math.max(0, number) : value);
  };
  const combatant = (side, viewerSide) => Number(side) === Number(viewerSide)
    ? 'Your vehicle' : 'Opponent';

  if (details.event === 'world-creature-combat') {
    if (!Array.isArray(details.phases) || !details.phases.length) return '';
    const ammunitionRules = catalog?.settings?.ammunition_rules ?? {};
    const ammunitionLabels = catalog?.labels?.ammunition_type ?? [];
    const ammunitionName = (type, storageField = '') => {
      const configured = String(ammunitionLabels[Number(type)] ?? '').trim();
      if (configured) return configured;
      const cannonball = catalog?.cannonballByType?.get(Number(type));
      const itemName = cannonball ? catalog?.byId?.get(Number(cannonball.itemId))?.name : '';
      if (itemName) return String(itemName).replace(/^\d+\s+/u, '');
      const known = { massives: 'Cannonball', chain_shots: 'Chain Shot', grape_shots: 'Grape Shot' };
      return known[storageField] ?? `Ammunition ${format(type)}`;
    };
    const ammunitionFromLegacyState = (state) => Object.entries(ammunitionRules)
      .map(([type, rule]) => ({
        type: Number(type), name: ammunitionName(type, rule.storageField),
        quantity: Number(state?.[rule.storageField] ?? 0),
        accuracy: Number(rule.accuracy), target: rule.damageField
      }));
    const inferredCreatureType = details.creatureType ?? Object.entries(
      catalog?.settings?.world_creature_names ?? {}
    ).find(([, name]) => String(details.creatureName ?? '').endsWith(String(name)))?.[0];
    const inferredVehicleItem = catalog?.byId?.get(Number(details.vehicleItemId))
      ?? catalog?.items?.find((item) => item.name === details.vehicleItemName)
      ?? catalog?.items?.find((item) => item.name === details.vehicleName);
    const inferredVehicle = inferredVehicleItem
      ? catalog?.vehicleByItemId?.get(Number(inferredVehicleItem.id)) : null;
    const inferredCreatureRarity = Number(details.creatureRarity
      ?? catalog?.rarities?.find((rarity) => String(details.creatureName ?? '').startsWith(
        `${rarity.name} `
      ))?.id);
    const legacySnapshot = (which) => {
      const source = which === 'opening' ? details.starting : details.ending;
      const vehicleState = source?.vehicle ?? {};
      const creatureHealth = source?.creatureHp ?? (which === 'closing' ? details.hp : undefined);
      const routeType = inferredVehicle?.routeType === catalog?.settings?.route_type_ids?.sea
        ? 'sea' : inferredVehicle?.routeType === catalog?.settings?.route_type_ids?.land
          ? 'land' : vehicleState.hull === undefined ? 'land' : 'sea';
      const rawAmmunition = vehicleState.ammunition ?? {};
      const creatureIcon = inferredCreatureType
        ? catalog?.settings?.world_creature_icons?.[inferredCreatureType] : null;
      const baseCreatureSpeed = inferredCreatureType
        ? Number(catalog?.settings?.world_creature_speed_kph?.[inferredCreatureType]) : null;
      const speedMultiplier = Number(
        catalog?.settings?.world_creature_tier_speed_multipliers?.[inferredCreatureRarity]
      );
      const legacyAmmunition = Object.keys(rawAmmunition).length
        ? Object.entries(rawAmmunition).map(([storageField, quantity]) => {
          const match = Object.entries(ammunitionRules)
            .find(([, rule]) => rule.storageField === storageField);
          return {
            type: Number(match?.[0]), name: ammunitionName(match?.[0], storageField),
            quantity: Number(quantity), accuracy: Number(match?.[1]?.accuracy),
            target: match?.[1]?.damageField
          };
        }) : ammunitionFromLegacyState(rawAmmunition);
      return {
        vehicle: {
          id: details.vehicleId, itemId: inferredVehicleItem?.id,
          name: details.vehicleName ?? inferredVehicleItem?.name ?? 'Your transport',
          itemName: inferredVehicleItem?.name, icon: details.vehicleIcon ?? inferredVehicleItem?.icon,
          rarity: inferredVehicleItem?.rarity,
          rarityName: inferredVehicleItem?.rarityName,
          transportType: routeType,
          speed: inferredVehicle?.speed, baseSpeed: inferredVehicle?.speed,
          rating: which === 'opening' ? details.vehicleRatingBefore : details.vehicleRatingAfter,
          status: which === 'closing' && details.destroyed ? 'destroyed' : 'traveling',
          damaged: Boolean(vehicleState.damaged), destroyed: Boolean(details.destroyed),
          reinforcement: vehicleState.reinforcement,
          capacity: inferredVehicle ? {
            base: inferredVehicle.capacity, total: inferredVehicle.capacity,
            cargo: undefined, used: undefined, free: undefined
          } : {},
          cargo: [], mods: [], weapons: [], cannons: [],
          land: routeType === 'land' ? {
            attack: vehicleState.attack, armor: vehicleState.armor,
            offense: vehicleState.offense, defense: vehicleState.defense,
            dodge: vehicleState.dodge
          } : null,
          ship: routeType === 'sea' ? {
            hull: vehicleState.hull,
            maxHull: vehicleState.maxHull ?? inferredVehicle?.ship?.hull,
            crew: undefined, maxCrew: inferredVehicle?.ship?.crew,
            cannonPortals: inferredVehicle?.ship?.cannonPortals,
            sunk: Number(vehicleState.hull) === 0,
            ammunition: legacyAmmunition
          } : null
        },
        creature: {
          id: details.creatureId, type: inferredCreatureType,
          name: details.creatureName ?? 'Creature', icon: details.creatureIcon ?? creatureIcon,
          rarity: inferredCreatureRarity,
          rarityName: catalog?.rarityById?.get(inferredCreatureRarity)?.name,
          health: creatureHealth, maxHealth: details.starting?.creatureMaxHp,
          baseHealth: inferredCreatureType
            ? catalog?.settings?.world_creature_hp?.[inferredCreatureType] : undefined,
          healthMultiplier: catalog?.settings
            ?.world_creature_tier_hp_multipliers?.[inferredCreatureRarity],
          speed: Number.isFinite(baseCreatureSpeed) && Number.isFinite(speedMultiplier)
            ? baseCreatureSpeed * speedMultiplier : baseCreatureSpeed,
          speedMultiplier,
          rating: which === 'opening' ? details.creatureRatingBefore : details.creatureRatingAfter,
          status: which === 'closing' && details.defeated ? 'defeated' : 'active',
          attackName: inferredCreatureType
            ? catalog?.settings?.world_creature_attack_names?.[inferredCreatureType] : undefined,
          counterDamageRatio: inferredCreatureType
            ? catalog?.settings?.world_creature_counter_damage_ratio?.[inferredCreatureType]
            : undefined,
          damageMultiplier: catalog?.settings
            ?.world_creature_tier_damage_multipliers?.[inferredCreatureRarity]
        }
      };
    };
    const snapshots = details.combatSnapshots && typeof details.combatSnapshots === 'object'
      ? details.combatSnapshots : {
        opening: legacySnapshot('opening'), closing: legacySnapshot('closing')
      };
    const known = (value) => value !== null && value !== undefined
      && !(typeof value === 'number' && !Number.isFinite(value));
    const percent = (value) => known(value) ? `${format(Number(value) * 100)}%` : 'Not recorded';
    const number = (value, suffix = '') => known(value) ? `${format(value)}${suffix}` : 'Not recorded';
    const signed = (value) => known(value)
      ? `${Number(value) >= 0 ? '+' : ''}${format(value)}` : 'Not recorded';
    const textValue = (value) => known(value) && String(value).trim()
      ? String(value) : 'Not recorded';
    const itemNames = (items, describe) => Array.isArray(items) && items.length
      ? items.map((item) => describe(item)).join('; ') : 'None';
    const stats = (rows) => `<dl class="message-combatant-stats">${rows.map(
      ([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`
    ).join('')}</dl>`;
    const combatantCard = (kind, snapshot) => {
      const rarity = Number(snapshot?.rarity);
      const rarityClass = Number.isSafeInteger(rarity) ? ` rarity-${rarity}` : '';
      const fallbackIcon = kind === 'creature'
        ? catalog?.settings?.world_creature_icons?.[inferredCreatureType] ?? '/node/favicon.svg'
        : inferredVehicleItem?.icon ?? '/node/favicon.svg';
      const icon = String(snapshot?.icon ?? fallbackIcon);
      const heading = textValue(snapshot?.name);
      let rows;
      if (kind === 'creature') {
        rows = [
          ['Rarity', textValue(snapshot?.rarityName)],
          ['Species', textValue(snapshot?.type)?.replaceAll('_', ' ')],
          ['Combat class', number(snapshot?.combatClass)],
          ['Status', textValue(snapshot?.status)],
          ['Health', `${number(snapshot?.health)} / ${number(snapshot?.maxHealth)}`],
          ['Base health', number(snapshot?.baseHealth)],
          ['Tier health multiplier', number(snapshot?.healthMultiplier, '×')],
          ['Speed', number(snapshot?.speed, ' km/h')],
          ['Tier speed multiplier', number(snapshot?.speedMultiplier, '×')],
          ['Rating', number(snapshot?.rating)],
          ['Attack', textValue(snapshot?.attackName)],
          ['Counter-force ratio', percent(snapshot?.counterDamageRatio)],
          ['Tier damage multiplier', number(snapshot?.damageMultiplier, '×')],
          ['Moon damage multiplier', number(snapshot?.moonDamageMultiplier, '×')],
          ['Reward', textValue(snapshot?.rewardType)],
          ['Region', textValue(snapshot?.mapName)],
          ['Route', textValue(snapshot?.routeName)],
          ['Route length', number(snapshot?.routeLength, ' km')],
          ['Position', number(snapshot?.location, ' km')],
          ['Destination', textValue(snapshot?.destinationName)]
        ];
      } else {
        const capacity = snapshot?.capacity ?? {};
        rows = [
          ['Rarity', textValue(snapshot?.rarityName)],
          ['Transport type', textValue(snapshot?.transportType)],
          ['Combat class', number(snapshot?.combatClass)],
          ['Status', textValue(snapshot?.status)],
          ['Condition', snapshot?.destroyed ? 'Destroyed'
            : snapshot?.ship?.sunk ? 'Sunk' : snapshot?.damaged ? 'Damaged' : 'Operational'],
          ['Travel order', textValue(snapshot?.travelOrder)],
          ['Speed', `${number(snapshot?.speed, ' km/h')} (${number(snapshot?.baseSpeed, ' km/h')} base)`],
          ['Rating', number(snapshot?.rating)],
          ['Reinforcement', `${number(snapshot?.reinforcement)} / ${number(snapshot?.reinforcementMax)}`],
          ['Oil-boosted trips remaining', number(snapshot?.oiledTrips)],
          ['Stolen Oil trips remaining', number(snapshot?.tripsStolen)],
          ['Turbo active', known(snapshot?.turbo) ? snapshot.turbo ? 'Yes' : 'No' : 'Not recorded'],
          ['Binoculars active', known(snapshot?.binoculars)
            ? snapshot.binoculars ? 'Yes' : 'No' : 'Not recorded'],
          ['Aggressive-power journey bonus', percent(snapshot?.offenseBonusFactor)],
          ['Defensive-power journey bonus', percent(snapshot?.defenseBonusFactor)],
          ['Base capacity', number(capacity.base)],
          ['Installed modification capacity', number(capacity.installedModAdjustment)],
          ['Modification capacity', number(capacity.modAdjustment)],
          ['Effective capacity', number(capacity.total)],
          ['Capacity cap', snapshot?.capacityCap === null ? 'No cap' : number(snapshot?.capacityCap)],
          ['Fitting slots', number(capacity.fittingSlots)],
          ['Ammunition slots', number(capacity.ammunitionSlots)],
          ['Cargo slots', number(capacity.cargoSlots ?? capacity.cargo)],
          ['Cargo limit after fittings', number(capacity.cargoLimit)],
          ['Cargo space available', number(capacity.available)],
          ['Used slots', number(capacity.used)],
          ['Free slots', number(capacity.free)],
          ['Weapons', itemNames(snapshot?.weapons, (item) =>
            `${item.name} (+${number(item.offense)} aggressive, +${number(item.defense)} defensive)`) ],
          ['Modifications', itemNames(snapshot?.mods, (item) =>
            `${item.name} (${signed(item.capacity)} capacity, ${signed(item.attack)} attack, ${signed(item.armor)} armour, ${signed(item.offense)} aggressive, ${signed(item.defense)} defensive, ${signed(item.dodge)} dodge)`) ],
          ['Cannons', itemNames(snapshot?.cannons, (item) =>
            `portal ${number(item.portal)}: ${item.name} (${number(item.damage)} damage, rate ${number(item.rateOfFire)})`) ],
          ['Cargo', itemNames(snapshot?.cargo, (item) => `${number(item.quantity)}× ${item.name}`)]
        ];
        if (snapshot?.land) rows.push(
          ['Attack', formatCombatStat(snapshot.land.attack)],
          ['Armour', formatCombatStat(snapshot.land.armor)],
          ['Aggressive power', formatCombatStat(snapshot.land.offense)],
          ['Defensive power', formatCombatStat(snapshot.land.defense)],
          ['Dodge', formatCombatStat(snapshot.land.dodge)]
        );
        if (snapshot?.ship) {
          rows.push(
            ['Hull', `${number(snapshot.ship.hull)} / ${number(snapshot.ship.maxHull)}`],
            ['Crew', `${number(snapshot.ship.crew)} / ${number(snapshot.ship.maxCrew)}`],
            ['Cannon portals', number(snapshot.ship.cannonPortals)],
            ['Sunk', snapshot.ship.sunk ? 'Yes' : 'No']
          );
          for (const ammo of snapshot.ship.ammunition ?? []) rows.push([
            `${textValue(ammo.name)} ammunition`,
            `${number(ammo.quantity)} shots · ${percent(ammo.accuracy)} accuracy · targets ${textValue(ammo.target)}`
          ]);
        }
      }
      return `<article class="message-combatant message-combatant-${kind}${rarityClass}">
        <header><img src="${escapeHtml(icon)}" alt=""><div><span>${kind === 'creature' ? 'Living threat' : 'Your transport'}</span><h3>${escapeHtml(heading)}</h3></div></header>
        ${stats(rows)}</article>`;
    };
    const ledger = (title, snapshot) => `<section class="message-combat-ledger" aria-label="${escapeHtml(title)}"><h2>${escapeHtml(title)}</h2><div class="message-combatants">${combatantCard('vehicle', snapshot?.vehicle)}${combatantCard('creature', snapshot?.creature)}</div></section>`;
    const phaseRows = details.phases.map((phase) => {
      const attacks = Array.isArray(phase.vehicleAttacks) ? phase.vehicleAttacks : [];
      const attackRows = attacks.map((attack) => {
        const weapon = attack.kind === 'cannon'
          ? attack.cannonName ?? 'Cannon' : attack.name ?? 'Vehicle attack';
        const ammunition = attack.kind === 'cannon'
          ? attack.ammunitionName ?? `Ammunition ${format(attack.ammunitionType)}` : '—';
        const chance = attack.kind === 'cannon'
          ? `${format(Number(attack.accuracy) * 100)}%` : 'Automatic';
        const result = attack.hit
          ? `${attack.critical ? 'Critical hit' : 'Hit'} for ${format(attack.damage)} damage`
          : 'Miss';
        return `<tr><td>${attack.portal === undefined ? '—' : format(attack.portal)}</td><td>${escapeHtml(weapon)}</td><td>${escapeHtml(ammunition)}</td><td>${chance}</td><td>${result}</td></tr>`;
      }).join('');
      const creatureAttack = phase.creatureAttack ?? {};
      const vehicleBefore = phase.vehicleBefore ?? {};
      const vehicleAfter = phase.vehicleAfter ?? {};
      const target = creatureAttack.target === 'hull' ? 'hull' : 'vehicle structure';
      const targetBefore = creatureAttack.target === 'hull'
        ? vehicleBefore.hull : vehicleBefore.armor;
      const targetAfter = creatureAttack.target === 'hull'
        ? vehicleAfter.hull : vehicleAfter.armor;
      const heading = phase.kind === 'cannon'
        ? `Cannon round ${format(phase.round)}` : 'Land weapons exchange';
      const protection = Number(creatureAttack.absorbed) > 0
        ? ` Reinforcement absorbed ${format(creatureAttack.absorbed)} of ${format(creatureAttack.incomingDamage)} incoming damage.`
        : '';
      return `<section class="message-combat-phase"><h3>${heading}</h3>
        <div class="table-scroll"><table><thead><tr><th>Portal</th><th>Your attack</th><th>Ammunition</th><th>Accuracy</th><th>Result</th></tr></thead><tbody>${attackRows}</tbody></table></div>
        <p><strong>${escapeHtml(details.creatureName ?? 'Creature')} counterattack:</strong> ${escapeHtml(creatureAttack.name ?? 'Counterattack')} dealt ${format(creatureAttack.damage)} damage to ${target} (${format(targetBefore)} → ${format(targetAfter)}).${protection} Creature health: ${format(phase.creatureBefore?.hp)} → ${format(phase.creatureAfter?.hp)}.</p></section>`;
    }).join('');
    const skipped = (Array.isArray(details.skippedPhases) ? details.skippedPhases : [])
      .map((phase) => `<section class="message-combat-phase"><h3>${phase.kind === 'boarding' ? 'Boarding' : 'Skipped phase'}</h3><p>${escapeHtml(phase.reason ?? 'This phase did not apply.')}</p></section>`)
      .join('');
    return `<section class="message-combat-report" aria-label="Complete combat report">
      ${ledger('Opening state', snapshots.opening)}
      <h2>Combat phases</h2>${phaseRows}${skipped}
      <section class="message-combat-phase"><h3>Outcome</h3><p>Your vehicle dealt ${format(details.damage)} total damage and received ${format(details.counterDamage)} total damage. The creature finished with ${format(details.hp)}/${format(details.starting?.creatureMaxHp)} health. ${details.defeated ? 'The creature was defeated.' : 'The creature survived.'}</p></section>
      ${ledger('Closing state', snapshots.closing)}</section>`;
  }

  if (details.event !== 'vehicle-combat' || !details.result) return '';
  const result = details.result;
  const side = Number(details.side);
  const opponentSide = (side + 1) % 2;
  const stance = `<p><strong>Encounter:</strong> ${format(details.encounterLocation)} km along the route; combat lasted ${formatDuration(Number(details.combatDuration ?? 0))}. Your vehicle was ${details.aggressive ? 'aggressive' : 'defensive'}; the opponent was ${details.opponentAggressive ? 'aggressive' : 'defensive'}.</p>`;
  const captiveRows = captiveDwarfCombatEntries(result).map((strike) => {
    const phase = `${strike.phase.charAt(0).toLocaleUpperCase('en-GB')}${
      strike.phase.slice(1)} round ${format(strike.round)}`;
    const dwarves = (Array.isArray(strike.dwarves) ? strike.dwarves : [])
      .map((dwarf) => `${dwarf.name ?? 'Dwarf'} (${format(dwarf.damage)} damage)`)
      .join(', ');
    return `<tr><td>${escapeHtml(phase)}</td><td>${combatant(strike.side, side)}</td><td>${escapeHtml(dwarves || 'Dwarf')}</td><td>${format(strike.penetratingDamage ?? strike.damage)}${strike.absorbed ? ` (${format(strike.absorbed)} absorbed)` : ''}</td><td>${format(strike.structureBefore)} → ${format(strike.structureAfter)} ${escapeHtml(strike.structure ?? 'structure')}</td></tr>`;
  }).join('');
  const freedCaptives = Array.isArray(result.freedCaptiveDwarves)
    ? result.freedCaptiveDwarves.length : 0;
  const captiveSection = captiveRows
    ? `<section class="message-combat-phase"><h3>Captive Dwarf resistance</h3><p>Captured Dwarves strike their NPC captor once per combat round, dealing damage equal to their rarity.${freedCaptives ? ` ${format(freedCaptives)} ${freedCaptives === 1 ? 'Dwarf escaped' : 'Dwarves escaped'} when the NPC was defeated.` : ''}</p><div class="table-scroll"><table><thead><tr><th>Round</th><th>Captor</th><th>Dwarves</th><th>Damage reaching structure</th><th>Captor structure</th></tr></thead><tbody>${captiveRows}</tbody></table></div></section>`
    : '';
  let phases = '';
  if (details.battleType === 'ship') {
    const yourStart = result.starting?.[side] ?? {};
    const opponentStart = result.starting?.[opponentSide] ?? {};
    const yourCannonEnd = result.cannonPhaseEnding?.[side] ?? {};
    const opponentCannonEnd = result.cannonPhaseEnding?.[opponentSide] ?? {};
    const ammunitionNames = { 1: 'Cannonball', 2: 'Chain shot', 3: 'Grape shot' };
    const shotRows = (Array.isArray(result.shots) ? result.shots : []).flatMap(
      (shots, shooter) => (Array.isArray(shots) ? shots : []).map((shot) => ({ ...shot, shooter })))
      .sort((first, second) => first.round - second.round || first.portal - second.portal
        || first.shooter - second.shooter)
      .map((shot) => `<tr><td>${format(shot.round)}</td><td>${format(shot.portal)}</td><td>${combatant(shot.shooter, side)}</td><td>${escapeHtml(shot.cannonName ?? 'Cannon')}</td><td>${escapeHtml(ammunitionNames[shot.type] ?? `Type ${shot.type}`)}</td><td>${shot.hit ? `${format(shot.damage)} ${escapeHtml(shot.damageField ?? '')}` : 'Miss'}</td><td>${format(shot.targetAfter?.hull)} hull / ${format(shot.targetAfter?.speed)} speed / ${format(shot.targetAfter?.crew)} crew</td></tr>`)
      .join('');
    phases += `<section class="message-combat-phase"><h3>Cannon phase</h3><p>Your ship opened with ${format(yourStart.hull)} hull, ${format(yourStart.speed)} speed, and ${format(yourStart.crew)} crew; the opponent opened with ${format(opponentStart.hull)} hull, ${format(opponentStart.speed)} speed, and ${format(opponentStart.crew)} crew.</p>${shotRows
      ? `<div class="table-scroll"><table><thead><tr><th>Round</th><th>Portal</th><th>Fired by</th><th>Cannon</th><th>Shot</th><th>Result</th><th>Target after exchange</th></tr></thead><tbody>${shotRows}</tbody></table></div>`
      : '<p>No cannon was fired.</p>'}<p>The cannon phase ended with your ship at ${format(yourCannonEnd.hull)} hull / ${format(yourCannonEnd.speed)} speed / ${format(yourCannonEnd.crew)} crew and the opponent at ${format(opponentCannonEnd.hull)} hull / ${format(opponentCannonEnd.speed)} speed / ${format(opponentCannonEnd.crew)} crew.</p></section>`;
    const boardingRows = (Array.isArray(result.boardingRounds) ? result.boardingRounds : [])
      .map((round) => {
        const outcome = round.casualtySide
          ? `${combatant(round.casualtySide - 1, side)} lost ${escapeHtml(round.weaponName ?? 'an unarmed sailor')}`
          : round.winner ? `${combatant(round.winner - 1, side)} forced victory` : 'No casualty';
        return `<tr><td>${format(round.round)}</td><td>${format(round.strength?.[side])}</td><td>${format(round.strength?.[opponentSide])}</td><td>${outcome}</td></tr>`;
      }).join('');
    const yourShip = result.ships?.[side];
    const opposingShip = result.ships?.[opponentSide];
    const skippedReason = result.chainEscape ? 'Boarding was skipped because a ship escaped.'
      : !yourShip?.hull || !opposingShip?.hull
        ? 'Boarding was skipped because at least one ship sank during cannon fire.'
        : 'Boarding did not take place.';
    phases += `<section class="message-combat-phase"><h3>Boarding phase</h3>${boardingRows
      ? `<div class="table-scroll"><table><thead><tr><th>Round</th><th>Your strength</th><th>Opponent strength</th><th>Result</th></tr></thead><tbody>${boardingRows}</tbody></table></div>`
      : `<p>${skippedReason}</p>`}</section>`;
    const repair = result.repairs?.[side];
    phases += `<section class="message-combat-phase"><h3>Recovery</h3>${repair
      ? `<p>Restored ${format(repair.hull)} hull, ${format(repair.speed)} speed, and ${format(repair.crew)} crew. Your vehicle resumed with ${format(repair.ending?.hull)} hull, ${format(repair.ending?.speed)} speed, and ${format(repair.ending?.crew)} crew.</p>`
      : '<p>No post-combat recovery was recorded.</p>'}</section>`;
  } else if (details.battleType === 'land2') {
    const yourStart = details.starting?.[side] ?? {};
    const opponentStart = details.starting?.[opponentSide] ?? {};
    const yourEnd = result.ending?.[side] ?? {};
    const opponentEnd = result.ending?.[opponentSide] ?? {};
    const rows = (Array.isArray(result.roundLog) ? result.roundLog : []).flatMap((round) =>
      (Array.isArray(round.blows) ? round.blows : []).map((blow) => {
        const reduction = (Array.isArray(round.reductions) ? round.reductions : [])
          .find((entry) => Number(entry.opponent) === Number(blow.side));
        return `<tr><td>${format(round.round)}</td><td>${combatant(blow.side, side)}</td><td>${round.before?.[blow.side]?.aggressive ? 'Aggressive' : 'Defensive'}</td><td>${formatCombatStat(reduction?.attackBefore)} → ${formatCombatStat(reduction?.attackAfter)}</td><td>${formatCombatStat(blow.penetratingDamage ?? blow.damage)}${blow.absorbed ? ` (${formatCombatStat(blow.absorbed)} absorbed)` : ''}</td><td>${formatCombatStat(blow.armorBefore)} → ${formatCombatStat(blow.armorAfter)}</td></tr>`;
      })).join('');
    phases = `<section class="message-combat-phase"><h3>Land combat rounds</h3><p>Your vehicle opened with ${formatCombatStat(yourStart.attack)} base attack, ${formatCombatStat(yourStart.armor)} armour, ${formatCombatStat(yourStart.offense)} aggressive power, ${formatCombatStat(yourStart.defense)} defensive power, and ${formatCombatStat(yourStart.dodge)} dodge. The opponent opened with ${formatCombatStat(opponentStart.attack)} base attack, ${formatCombatStat(opponentStart.armor)} armour, ${formatCombatStat(opponentStart.offense)} aggressive power, ${formatCombatStat(opponentStart.defense)} defensive power, and ${formatCombatStat(opponentStart.dodge)} dodge.</p>${rows
      ? `<div class="table-scroll"><table><thead><tr><th>Round</th><th>Attacker</th><th>Stance</th><th>Base attack after defensive power</th><th>Damage reaching armour</th><th>Target armour</th></tr></thead><tbody>${rows}</tbody></table></div>`
      : '<p>No attack was made.</p>'}<p>Combat ended with your vehicle at ${formatCombatStat(yourEnd.attack)} base attack / ${formatCombatStat(yourEnd.armor)} armour and the opponent at ${formatCombatStat(opponentEnd.attack)} base attack / ${formatCombatStat(opponentEnd.armor)} armour.</p></section>`;
  }
  const pillage = details.pillage;
  const pillageText = pillage
    ? `<p><strong>Pillage:</strong> ${pillage.direction === 'taken' ? 'taken from the opponent' : 'lost to the opponent'}${pillage.kind === 'oil' ? ` (${format(pillage.trips)} oil trips)` : ''}.</p>` : '';
  return `<section class="message-combat-report" aria-label="Complete combat report"><h2>Combat phases</h2>${stance}${phases}${captiveSection}<section class="message-combat-phase"><h3>Outcome</h3><p>${details.outcome === 'won' ? 'Victory' : details.outcome === 'lost' ? 'Defeat' : 'Draw'}. Rating ${format(details.ratingBefore)} → ${format(details.ratingAfter)}.</p>${pillageText}</section></section>`;
}

function messageItemGroupsHtml(message, catalog) {
  const groups = messageItemGroups(message, catalog);
  if (!groups.length) return '';
  return `<div class="message-item-groups">${groups.map((group, groupIndex) => {
    const total = group.items.reduce((sum, entry) => sum + entry.quantity, 0);
    const noun = group.noun ?? 'thing';
    return `<section class="message-item-group" aria-labelledby="message-items-${message.id}-${groupIndex}"><header><h2 id="message-items-${message.id}-${groupIndex}">${escapeHtml(group.label)}</h2><span>${total.toLocaleString('en-GB')} ${noun}${total === 1 ? '' : 's'}</span></header><ul>${group.items.map(({ item, quantity }) => {
      const displayQuantity = quantity.toLocaleString('en-GB');
      const path = item.path ?? `/items/${item.id}`;
      return `<li class="message-item rarity-${item.rarity}${group.kind === 'crypto' ? ' message-item-crypto' : ''}"><a class="text-link" href="${escapeHtml(path)}"><img src="${escapeHtml(item.icon)}" alt=""><span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.rarityName)}</small></span><b aria-label="Quantity ${displayQuantity}">${displayQuantity}×</b></a></li>`;
    }).join('')}</ul></section>`;
  }).join('')}</div>`;
}

function messageFindingsLocationsHtml(message) {
  const details = message.details && typeof message.details === 'object' ? message.details : {};
  const dwarfReport = details.event === 'daily-dwarf-findings-report'
    || details.event === 'dwarf-departure-report';
  if ((details.event !== 'daily-findings-digest' && !dwarfReport)
      || !Array.isArray(details.locationCounts)) {
    return '';
  }
  const locations = details.locationCounts.map((entry) => {
    const cityName = String(entry?.cityName ?? '').trim();
    const total = Math.max(0, Math.floor(Number(entry?.quantity ?? 0)) || 0);
    const cryptoQuantity = Math.max(0, Math.floor(Number(entry?.cryptoQuantity ?? 0)) || 0);
    const thingQuantity = Math.max(0, Math.floor(Number(
      entry?.thingQuantity ?? Math.max(0, total - cryptoQuantity)
    )) || 0);
    if (!cityName || (!thingQuantity && !cryptoQuantity)) return '';
    const quantities = [];
    if (thingQuantity) {
      quantities.push(`${thingQuantity.toLocaleString('en-GB')} thing${thingQuantity === 1 ? '' : 's'}`);
    }
    if (cryptoQuantity) {
      quantities.push(`${cryptoQuantity.toLocaleString('en-GB')} crypto coin${cryptoQuantity === 1 ? '' : 's'}`);
    }
    return `<li><strong>${escapeHtml(cityName)}</strong><span>${quantities.join(' · ')}</span></li>`;
  }).filter(Boolean).join('');
  if (!locations) return '';
  const heading = dwarfReport ? 'Dwarf work locations' : 'Found locations';
  return `<section class="message-finding-locations" aria-labelledby="message-locations-${message.id}"><h2 id="message-locations-${message.id}">${heading}</h2><ul>${locations}</ul></section>`;
}

function messageFindingsDigestSummaryHtml(message, catalog) {
  const details = message.details && typeof message.details === 'object' ? message.details : {};
  const dwarfReport = details.event === 'daily-dwarf-findings-report'
    || details.event === 'dwarf-departure-report';
  if (details.event !== 'daily-findings-digest' && !dwarfReport) return '';
  const groups = messageItemGroups(message, catalog);
  const groupQuantity = (kind) => groups.filter((group) => group.kind === kind)
    .flatMap((group) => group.items)
    .reduce((sum, entry) => sum + entry.quantity, 0);
  const keptFallback = groupQuantity('kept');
  const recycledFallback = groupQuantity('auto-recycled');
  const safeCount = (value, fallback) => {
    const count = Number(value);
    return Number.isFinite(count) && count >= 0 ? Math.floor(count) : fallback;
  };
  const kept = safeCount(details.keptQuantity, keptFallback);
  const recycled = safeCount(details.autoRecycledQuantity, recycledFallback);
  const things = safeCount(details.thingQuantity, kept + recycled);
  const crypto = safeCount(details.cryptoQuantity, groupQuantity('crypto'));
  const dwarves = safeCount(details.dwarfQuantity, 0);
  const itemIds = new Set(groups.flatMap((group) => group.items.map(({ item }) => item.id)));
  const distinct = safeCount(details.distinctItemCount,
    [...itemIds].filter((itemId) => !String(itemId).startsWith('crypto-')).length);
  const stat = (label, value) => `<div><dt>${label}</dt><dd><strong>${value.toLocaleString('en-GB')}</strong></dd></div>`;
  const summaryLabel = dwarfReport ? 'Dwarf findings summary' : 'Findings summary';
  return `<dl class="message-detail-meta message-digest-summary" aria-label="${summaryLabel}">${stat(dwarfReport ? 'Dwarf finds' : 'Things found', things)}${stat('Kept', kept)}${stat('Auto-recycled', recycled)}${dwarfReport ? '' : stat('Crypto found', crypto)}${!dwarfReport && dwarves ? stat('Found by Dwarves', dwarves) : ''}${stat('Distinct things', distinct)}</dl>`;
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
  return `<section class="page-title"><div><p class="eyebrow">${escapeHtml(type)}</p><h1>${escapeHtml(subject)}</h1></div><a class="text-link" href="/messages">Back to messages</a></section>
    <article class="message-detail">
      <dl class="message-detail-meta"><div><dt>From</dt><dd>${escapeHtml(sender)}</dd></div><div><dt>Sent</dt><dd><time datetime="${new Date(message.createdAt).toISOString()}">${new Date(message.createdAt).toLocaleString('en-GB')}</time></dd></div><div><dt>Retention</dt><dd>${retention}</dd></div></dl>
      <div class="message-detail-body">${messageBodyHtml(conciseMessageBody(message))}</div>
      ${messageCombatReportHtml(message, catalog)}
      ${messageFindingsDigestSummaryHtml(message, catalog)}
      ${messageFindingsLocationsHtml(message)}
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
  return `<section class="page-title"><div><p class="eyebrow">Conversation</p><h1>${escapeHtml(conversation.other.name)}</h1></div><div><a class="text-link" href="/miners/${encodeURIComponent(conversation.other.name)}">View profile</a>${block}</div></section>
    <p class="message-retention-notice">Private messages also expire after ${retentionDays} days. Received messages can be protected from your <a class="text-link" href="/messages?type=PM">Inbox</a>.</p>
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

function oreThiefMissionDefinition(catalog, cityId = null) {
  const airRouteType = catalogRoleId(catalog, 'route_type_ids', 'air');
  const routes = catalog.routes.filter((route) => Number(route.type) === airRouteType
    && Number(route.city1Id) === Number(route.city2Id));
  const selectedCity = cityId === null ? null : catalogCityForId(catalog, cityId);
  const regionalRoutes = selectedCity
    ? routes.filter((entry) => Number(catalogCityForId(catalog, entry.city1Id).mapId)
      === Number(selectedCity.mapId))
    : routes;
  const route = regionalRoutes.find((entry) => entry.open) ?? regionalRoutes[0];
  if (!route) return null;
  const city = catalogCityForId(catalog, route.city1Id);
  const map = catalog.maps.find((entry) => Number(entry.id) === Number(city.mapId));
  const stages = [
    {
      key: 'search', number: '01', title: 'Find the base', setting: 'search_plane_item_id',
      roleId: catalogRoleId(catalog, 'aircraft_role_ids', 'search'),
      instruction: 'Fly repeated search sorties until the hidden base is located. Discovery is personal to you.'
    },
    {
      key: 'bomb', number: '02', title: 'Break the defences', setting: 'bomber_item_id',
      roleId: catalogRoleId(catalog, 'aircraft_role_ids', 'bomber'),
      instruction: 'Load bombs, then strike the located base. Every bomb aboard is dropped in the pass.'
    },
    {
      key: 'recover', number: '03', title: 'Bring back the Ore', setting: 'helicopter_item_id',
      roleId: catalogRoleId(catalog, 'aircraft_role_ids', 'helicopter'),
      instruction: 'Once the base is destroyed, recover stolen Ore up to the helicopter cargo capacity.'
    }
  ].map((stage) => ({ ...stage, item: catalogItemForSetting(catalog, stage.setting) }));
  return { route, city, map, stages };
}

function oreThiefAircraftMissionCopy(vehicle, catalog) {
  const role = Number(vehicle?.aircraftType);
  const search = catalogRoleId(catalog, 'aircraft_role_ids', 'search');
  const bomber = catalogRoleId(catalog, 'aircraft_role_ids', 'bomber');
  const helicopter = catalogRoleId(catalog, 'aircraft_role_ids', 'helicopter');
  if (role === search) return {
    route: 'Search for the ore-thief base', underway: 'Searching for the ore-thief base',
    dispatch: 'search for the ore-thief base'
  };
  if (role === bomber) return {
    route: 'Bomb the ore-thief base', underway: 'Bombing the ore-thief base',
    dispatch: 'bomb the ore-thief base'
  };
  if (role === helicopter) return {
    route: 'Recover stolen Ore', underway: 'Recovering stolen Ore from the ore-thief base',
    dispatch: 'recover stolen Ore from the ore-thief base'
  };
  return {
    route: 'Ore-thief operation', underway: 'Flying an ore-thief operation',
    dispatch: 'the ore-thief operation'
  };
}

function oreThiefOperationPanel(player, catalog, vehicles, thiefBase) {
  const operation = oreThiefMissionDefinition(catalog, player.cityId);
  if (!operation || !thiefBase) return '';
  const ore = Math.max(0, Number(thiefBase.ore) || 0);
  const states = !thiefBase.discovered
    ? [['active', 'SEARCH OPEN'], ['locked', 'LOCKED'], ['locked', 'LOCKED']]
    : !thiefBase.destroyed
      ? [['complete', 'BASE LOCATED'], ['active', 'STRIKE OPEN'], ['locked', 'LOCKED']]
      : ore > 0
        ? [['complete', 'BASE LOCATED'], ['complete', 'BASE DESTROYED'],
          ['active', 'RECOVERY OPEN']]
        : [['complete', 'BASE LOCATED'], ['complete', 'BASE DESTROYED'],
          ['complete', 'ORE CLEARED']];
  const intel = !thiefBase.discovered
    ? ['Location unknown', 'Search crews have not fixed the base position.']
    : thiefBase.destroyed
      ? ['Base destroyed', `${ore.toLocaleString('en-GB')} stolen Ore crate${ore === 1 ? '' : 's'} remain.`]
      : [`Located ${Math.round(Number(thiefBase.distance)).toLocaleString('en-GB')} km out`,
        `${Number(thiefBase.buckets).toLocaleString('en-GB')} defensive buckets remain${
          thiefBase.damaged ? '; the base is damaged' : ''}.`];
  const stageRows = operation.stages.map((stage, index) => {
    const [state, stateLabel] = states[index];
    const stored = Number(player.inventoryByCity?.[operation.city.id]?.[stage.item.id] ?? 0);
    const active = vehicles.filter((vehicle) => Number(vehicle.itemId) === Number(stage.item.id)
      && ((vehicle.status === 'idle' && Number(vehicle.cityId) === Number(operation.city.id))
        || (vehicle.status === 'traveling'
          && Number(vehicle.originCityId) === Number(operation.city.id)
          && Number(vehicle.destinationCityId) === Number(operation.city.id)))).length;
    return `<li class="ore-thief-stage is-${state}"><span class="ore-thief-stage-number">${stage.number}</span><a class="ore-thief-stage-art" href="/items/${stage.item.id}" aria-label="View ${escapeHtml(stage.item.name)}"><img src="${escapeHtml(stage.item.icon)}" alt=""></a><div><p class="eyebrow">${escapeHtml(stage.title)}</p><h3><a class="text-link" href="/items/${stage.item.id}">${escapeHtml(stage.item.name)}</a></h3><p>${escapeHtml(stage.instruction)}</p><small>${stored.toLocaleString('en-GB')} stored &middot; ${active.toLocaleString('en-GB')} active at ${escapeHtml(operation.city.name)}</small></div><strong>${stateLabel}</strong></li>`;
  }).join('');
  const knownMissionCity = (player.knownCityIds ?? []).map(Number)
    .includes(Number(operation.city.id));
  const controls = Number(player.cityId) === Number(operation.city.id)
    ? '<a class="button" href="/vehicles">Manage aircraft</a>'
    : knownMissionCity
      ? `<form method="post" action="/cities/${operation.city.id}/select"><button>Switch to ${escapeHtml(operation.city.name)}</button></form>`
      : '<a class="button" href="/map">Find the launch city</a>';
  return `<section class="ore-thief-operation" aria-labelledby="ore-thief-operation-heading"><header><div><p class="eyebrow">${escapeHtml(operation.map?.name ?? thiefBase.mapName ?? 'Regional')} pilot operation &middot; three stages</p><h2 id="ore-thief-operation-heading">Ore-thief base</h2><p>Search it out, destroy it, then lift the stolen Ore home. Every sortie launches and returns through <strong>${escapeHtml(operation.city.name)}</strong>, this region's mission airfield.</p></div><dl><div><dt>Intelligence</dt><dd>${escapeHtml(intel[0])}</dd></div><div><dt>Report</dt><dd>${escapeHtml(intel[1])}</dd></div><div><dt>Mission route</dt><dd>${operation.route.open ? 'Open' : 'Closed'}</dd></div></dl></header><ol>${stageRows}</ol><footer><p>Aircraft that approach the base can be shot down. Defensive gadgets apply globally when activated from a regional capital.</p>${controls}</footer></section>`;
}

function selectableShuttleCategories(catalog) {
  const hiddenMineTypeIds = new Set(
    (catalog.settings.profile_hidden_mine_type_ids ?? []).map(Number)
  );
  const oil = catalog.byId.get(Number(catalog.settings.oil_item_id));
  if (!oil) throw new Error('Missing Oil shuttle category item.');
  return [
    ...catalog.mineTypes.filter((mineType) => !hiddenMineTypeIds.has(Number(mineType.id))),
    { id: SHUTTLE_OIL_CATEGORY_ID, name: oil.name }
  ]
    .sort((first, second) => first.name.localeCompare(second.name, 'en')
      || Number(first.id) - Number(second.id));
}

function vehicleShuttleSummary(player, catalog, vehicle) {
  if (!vehicle.shuttle) return null;
  const shuttle = vehicle.shuttle;
  const originLabel = cityChoiceLabel(catalog, shuttle.originCityId);
  const destinationLabel = vehicleRouteDestinationLabel(
    player, catalog, shuttle.originCityId, shuttle.destinationCityId
  );
  const returning = ['return', 'returning'].includes(String(shuttle.phase).toLowerCase());
  const loadedThings = vehicle.cargo?.reduce(
    (sum, entry) => sum + Number(entry.quantity), 0
  ) ?? Number(shuttle.lastLoadedThings ?? 0);
  const phase = shuttle.pausedReason
    ? 'Paused'
    : returning ? 'Returning' : 'Outbound';
  const phaseDetail = shuttle.pausedReason
    ? `Paused: ${shuttle.pausedReason}`
    : returning
      ? `Returning to ${originLabel}`
      : `Outbound to ${destinationLabel} with ${loadedThings} thing${loadedThings === 1 ? '' : 's'}`;
  const categoryNames = shuttle.mineTypeIds === null
    ? []
    : shuttle.mineTypeIds.map((mineTypeId) =>
      Number(mineTypeId) === SHUTTLE_OIL_CATEGORY_ID
        ? catalogItemForSetting(catalog, 'oil_item_id').name
        : catalogMineTypeForId(catalog, mineTypeId).name);
  const cargoCategories = shuttle.mineTypeIds === null
    ? 'All cargo categories'
    : new Intl.ListFormat('en-GB', { style: 'long', type: 'conjunction' })
      .format(categoryNames);
  const travelOrder = catalog.settings.travel_order_names?.[shuttle.travelOrder];
  if (typeof travelOrder !== 'string' || !travelOrder) {
    throw new Error(`Missing travel-order name: ${shuttle.travelOrder}.`);
  }
  return {
    originLabel, destinationLabel, phase, phaseDetail, loadedThings,
    cargoCategories, travelOrder,
    deliveries: Number(shuttle.deliveries ?? 0),
    deliveredThings: Number(shuttle.deliveredThings ?? 0),
    lastLoadedThings: Number(shuttle.lastLoadedThings ?? 0)
  };
}

function vehicleShuttleCancelForm(vehicle) {
  const label = vehicle.status === 'traveling'
    ? 'Cancel shuttle after this leg' : 'Cancel shuttle';
  return `<form method="post" action="/vehicles/${vehicle.id}/shuttle/cancel"><button class="secondary">${label}</button></form>`;
}

function vehicleShuttlePanel(player, catalog, vehicle) {
  const summary = vehicleShuttleSummary(player, catalog, vehicle);
  if (!summary) return '';
  const stopNotice = vehicle.status === 'traveling'
    ? '<p>Cancellation lets the current leg finish. The vehicle will unload on arrival and remain there.</p>'
    : '';
  return `<section class="vehicle-itinerary-status vehicle-shuttle-status" aria-labelledby="vehicle-shuttle-heading">
    <header><p class="eyebrow">SHUTTLE · ${escapeHtml(summary.phase)}</p><h2 id="vehicle-shuttle-heading">${escapeHtml(summary.originLabel)} ⇄ ${escapeHtml(summary.destinationLabel)}</h2></header>
    <p><strong>${escapeHtml(summary.phaseDetail)}</strong></p>
    <dl><div><dt>Order</dt><dd>${escapeHtml(summary.travelOrder)}</dd></div><div><dt>Deliveries</dt><dd>${summary.deliveries}</dd></div><div><dt>Things delivered</dt><dd>${summary.deliveredThings}</dd></div><div><dt>Last load</dt><dd>${summary.lastLoadedThings} thing${summary.lastLoadedThings === 1 ? '' : 's'}</dd></div><div><dt>Cargo categories</dt><dd>${escapeHtml(summary.cargoCategories)}</dd></div></dl>
    ${stopNotice}${vehicleShuttleCancelForm(vehicle)}
  </section>`;
}

function readonlyVehicleCargo(vehicle, catalog) {
  const rows = [...vehicle.cargo]
    .map((entry) => {
      const item = catalog.byId.get(Number(entry.itemId));
      if (!item) throw new Error(`Missing catalog item: ${entry.itemId}.`);
      return { item, quantity: Number(entry.quantity) };
    })
    .sort((first, second) => compareItemsByRarity(first.item, second.item))
    .map(({ item, quantity }) => `<tr><td data-label="Thing">${itemCard(item, {
      compact: true, showFixedValue: false
    })}</td><td data-label="Loaded">${quantity.toLocaleString('en-GB')}</td></tr>`)
    .join('');
  return `<section class="vehicle-cargo-manifest" aria-labelledby="vehicle-cargo-manifest-heading"><h3 id="vehicle-cargo-manifest-heading">Transport cargo <small>Read-only</small></h3>${rows
    ? `<div class="table-scroll"><table class="cargo-loadout-table"><thead><tr><th>Thing</th><th>Loaded</th></tr></thead><tbody>${rows}</tbody></table></div>`
    : '<p>No cargo is loaded on this leg.</p>'}</section>`;
}

function vehicleCanDeactivate(vehicle, catalog) {
  const hasAmmunition = vehicle.ship && Object.values(catalog.settings.ammunition_rules)
    .some((rule) => Number(vehicle.ship[rule.storageField]) > 0);
  const hullRepairing = vehicle.ship
    && Number(vehicle.ship.hull) < Number(vehicle.ship.max_hull);
  return vehicle.status === 'idle' && !vehicle.shuttle && !vehicle.damaged
    && !vehicle.aircraftDestroyed && Number(vehicle.reinforcement) <= 0
    && Number(vehicle.cargoSize) === 0 && vehicle.mods.length === 0
    && vehicle.weapons.length === 0 && vehicle.cannons.length === 0
    && !hasAmmunition && !hullRepairing
    && Number(vehicle.oiledTrips) <= 0 && Number(vehicle.tripsStolen) <= 0;
}

function vehicleDeactivateForm(vehicle) {
  return `<form method="post" action="/vehicles/${vehicle.id}/store"><button class="secondary">Deactivate</button></form>`;
}

function vehiclesPage(player, catalog, vehicles, now, activationAvailability = new Map()) {
  const availableItems = Object.entries(player.inventory)
    .map(([itemId, count]) => [catalog.byId.get(Number(itemId)), count])
    .filter(([item, count]) => item && count > 0 && catalog.vehicleByItemId.has(item.id))
    .sort(([first], [second]) => compareItemsByRarity(first, second));
  const activate = availableItems.map(([item, count]) => {
    const availability = activationAvailability.get(item.id);
    const unavailable = availability && !availability.allowed;
    const reason = unavailable ? escapeHtml(availability.reason) : '';
    return itemCard(item, count,
      `<form method="post" action="/vehicles/activate/${item.id}">
        <button${unavailable ? ` disabled title="${reason}"` : ''}>Activate</button>
        ${unavailable ? `<small>${reason}</small>` : ''}
      </form>`);
  }).join('');
  const storedVehicleCount = availableItems.reduce((sum, [, count]) => sum + Number(count), 0);
  const activatableVehicleCount = availableItems.reduce((sum, [item, count]) =>
    activationAvailability.get(item.id)?.allowed === false ? sum : sum + Number(count), 0);
  const currentCity = catalogCityForId(catalog, player.cityId);
  const vehicleCard = (vehicle) => {
    const vehicleItem = catalog.byId.get(vehicle.itemId);
    if (!vehicleItem) throw new Error(`Missing catalog item: ${vehicle.itemId}.`);
    const shuttleSummary = vehicleShuttleSummary(player, catalog, vehicle);
    const destination = vehicle.destinationCityId == null ? null
      : catalogCityForId(catalog, vehicle.destinationCityId);
    if (vehicle.status === 'traveling') {
      if (vehicle.originCityId !== vehicle.destinationCityId && !destination) {
        throw new Error(`Missing destination city for vehicle ${vehicle.id}.`);
      }
      const missionCopy = oreThiefAircraftMissionCopy(vehicle, catalog);
      const destinationLabel = vehicle.originCityId === vehicle.destinationCityId
        ? missionCopy.underway
        : vehicleRouteDestinationLabel(player, catalog,
          vehicle.originCityId, vehicle.destinationCityId);
      const journey = shuttleSummary
        ? [`SHUTTLE · ${shuttleSummary.phase}`,
          `${shuttleSummary.originLabel} ⇄ ${shuttleSummary.destinationLabel}`,
          shuttleSummary.phaseDetail, `Arrives in ${formatDuration(vehicle.arrivesAt - now)}`]
        : vehicle.creaturePursuit
        ? [`Pursuing ${vehicle.creaturePursuit.creatureName}`,
          `Intercepts in ${formatDuration(vehicle.creaturePursuit.encounterAt - now)} at ${Math.round(vehicle.creaturePursuit.encounterLocation).toLocaleString('en-GB')} km`]
        : vehicle.originCityId === vehicle.destinationCityId
          ? [destinationLabel, `Returns in ${formatDuration(vehicle.arrivesAt - now)}`]
          : [`Traveling to ${destinationLabel}`, `Arrives in ${formatDuration(vehicle.arrivesAt - now)}`];
      return itemCard(vehicleItem, { meta: [vehicle.name, ...journey,
        ...(vehicle.reinforcement > 0
          ? [`Reinforcement ${vehicle.reinforcement}/${vehicle.reinforcementMax}`] : [])],
        details: vehicle.shuttle
          ? '<p class="item-card-status"><span class="eyebrow vehicle-shuttle-badge">SHUTTLE</span></p>' : '',
        action: `${rankBadge(vehicle.rank, 1, catalog)}<a class="button secondary" href="/vehicles/${vehicle.id}">Manage</a>${vehicle.shuttle ? vehicleShuttleCancelForm(vehicle) : ''}` });
    }
    const city = catalogCityForId(catalog, vehicle.cityId);
    const routes = vehicle.routes.map((route) => {
      const destinationLabel = vehicleRouteDestinationLabel(
        player, catalog, city.id, route.destinationCityId
      );
      return `<option value="${route.id}">${route.mission
        ? escapeHtml(oreThiefAircraftMissionCopy(vehicle, catalog).route)
        : `${escapeHtml(destinationLabel)} · ${Number(route.length).toLocaleString('en-GB')} km`}${escapeHtml(radarText(route, catalog))}</option>`;
    }).join('');
    const repairStatus = vehicle.damaged
      ? (vehicle.repairCompletesAt
        ? `City repairs finish in ${formatDuration(Math.max(0, vehicle.repairCompletesAt - now))}`
        : 'City repairs are starting')
      : '';
    const status = vehicle.damaged ? `<strong class="capacity-warning">${
      vehicle.aircraftDestroyed ? 'Shot down by the ore thieves' : 'Damaged'} · ${repairStatus}</strong>`
      : `${escapeHtml(cityChoiceLabel(catalog, city.id))} · speed ${vehicle.speed} · ${vehicle.cargoSize}/${vehicle.capacity} capacity · rating ${Math.round(vehicle.rating)}${vehicle.reinforcement > 0
        ? ` · reinforcement ${vehicle.reinforcement}/${vehicle.reinforcementMax}` : ''}${shuttleSummary
        ? ` · SHUTTLE · ${escapeHtml(shuttleSummary.phaseDetail)}` : ''}`;
    const normalActions = `${vehicle.type === 'sea' ? `<a class="button secondary" href="/vehicles/${vehicle.id}/customize#ammunition">Load ammunition</a>` : ''}${routes ? `<form method="post" action="/vehicles/${vehicle.id}/send"><label>Route<select name="routeId"${vehicle.damaged ? ' disabled' : ''}>${routes}</select></label><button${vehicle.damaged ? ' disabled' : ''}>Send</button></form>` : '<span>No compatible route here.</span>'}`;
    const deactivate = vehicleCanDeactivate(vehicle, catalog)
      ? vehicleDeactivateForm(vehicle) : '';
    return itemCard(vehicleItem, { meta: vehicle.name, details: `<p class="item-card-status">${vehicle.shuttle ? '<span class="eyebrow vehicle-shuttle-badge">SHUTTLE</span> ' : ''}${status}</p>`,
      action: `${rankBadge(vehicle.rank, 1, catalog)}<a class="button secondary" href="/vehicles/${vehicle.id}">Manage</a>${deactivate}${vehicle.shuttle ? vehicleShuttleCancelForm(vehicle) : normalActions}` });
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
  const mapsById = new Map(catalog.maps.map((map) => [Number(map.id), map]));
  const elsewhereLocations = [...elsewhereByCity].map(([cityId, entries]) => {
    const city = catalogCityForId(catalog, cityId);
    const region = mapsById.get(Number(city.mapId));
    if (!region) throw new Error(`Missing catalog region: ${city.mapId}.`);
    return {
      city, region, count: entries.length,
      storedThings: Object.values(player.inventoryByCity?.[cityId] ?? {})
        .reduce((sum, quantity) => sum + Number(quantity), 0)
    };
  }).sort((first, second) =>
    Number(first.region.sortOrder) - Number(second.region.sortOrder)
    || first.region.name.localeCompare(second.region.name, 'en')
    || first.city.name.localeCompare(second.city.name, 'en')
    || first.city.id - second.city.id);
  const elsewhereByRegion = new Map();
  for (const location of elsewhereLocations) {
    const grouped = elsewhereByRegion.get(location.region.id) ?? {
      region: location.region, locations: []
    };
    grouped.locations.push(location);
    elsewhereByRegion.set(location.region.id, grouped);
  }
  const elsewhere = [...elsewhereByRegion.values()].map(({ region, locations }) => {
    const vehicleCount = locations.reduce((sum, location) => sum + location.count, 0);
    const cityRows = locations.map(({ city, count, storedThings }) => `<li><strong>${escapeHtml(cityChoiceLabel(catalog, city.id))}</strong><span>${count} idle vehicle${count === 1 ? '' : 's'} &middot; ${storedThings.toLocaleString('en-GB')} thing${storedThings === 1 ? '' : 's'} stored</span><form method="post" action="/cities/${city.id}/select"><button>Switch to ${escapeHtml(cityChoiceLabel(catalog, city.id))}</button></form></li>`).join('');
    return `<section class="vehicle-region" data-region-id="${region.id}"><header><div><p class="eyebrow">Region</p><h3>${escapeHtml(region.name)}</h3></div><p>${vehicleCount.toLocaleString('en-GB')} idle vehicle${vehicleCount === 1 ? '' : 's'} across ${locations.length.toLocaleString('en-GB')} cit${locations.length === 1 ? 'y' : 'ies'}</p></header><ul class="vehicle-location-list">${cityRows}</ul></section>`;
  }).join('');
  return `<section class="page-title"><div><p class="eyebrow">Fleet command</p><h1>Vehicles in ${escapeHtml(currentCity.name)}</h1></div><p>Idle vehicles and stored vehicle things are city-local. Traveling vehicles remain visible while underway.</p></section>
    <section><h2>Idle vehicles in ${escapeHtml(currentCity.name)}</h2><p>Unloaded, unfitted transports can be deactivated here and activated again from stored vehicle things.</p><div class="vehicle-list">${localVehicles || `<p>No idle vehicles in ${escapeHtml(currentCity.name)}.</p>`}</div></section>
    ${travelingVehicles ? `<section><h2>Vehicles underway</h2><div class="vehicle-list">${travelingVehicles}</div></section>` : ''}
    ${elsewhere ? `<section><h2>Vehicles in other cities</h2><p>Regions follow world-map order; cities are alphabetical within each region. Switch city to manage cargo and fittings stored there.</p><div class="vehicle-region-list">${elsewhere}</div></section>` : ''}
    <section id="stored-vehicle-things" class="stored-vehicle-section"><div class="stored-vehicle-heading"><div><h2>Stored vehicle things in ${escapeHtml(currentCity.name)}</h2>${storedVehicleCount ? `<p>${activatableVehicleCount.toLocaleString('en-GB')} of ${storedVehicleCount.toLocaleString('en-GB')} can be activated here.</p>` : ''}</div>${storedVehicleCount ? `<form method="post" action="/vehicles/activate-all"><button${activatableVehicleCount ? '' : ' disabled'}>Activate all${activatableVehicleCount ? ` (${activatableVehicleCount.toLocaleString('en-GB')})` : ''}</button></form>` : ''}</div><div class="item-grid stored-vehicle-grid">${activate || `<p>No stored vehicles in ${escapeHtml(currentCity.name)}.</p>`}</div></section>`;
}

function remoteVehiclePage(player, catalog, vehicle) {
  const selectedCity = catalogCityForId(catalog, player.cityId);
  const vehicleCity = catalogCityForId(catalog, vehicle.cityId);
  return `<section class="page-title"><div><p class="eyebrow">Vehicle in ${escapeHtml(vehicleCity.name)}</p><h1>${escapeHtml(vehicle.name)}</h1></div><a class="text-link" href="/vehicles">Back to ${escapeHtml(selectedCity.name)} vehicles</a></section>
    ${vehicleShuttlePanel(player, catalog, vehicle)}
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
  return `<section class="capacity-budget${free < 0 ? ' capacity-over' : ''}" aria-label="${escapeHtml(heading)}">
    <header><h3>${escapeHtml(heading)}</h3><strong>${free} free</strong></header>
    <dl>
      <div><dt>Base</dt><dd>${base}</dd></div>
      <div><dt>Mods</dt><dd>${signed(mods)}</dd></div>
      <div><dt>Weapons used</dt><dd>${weapons}</dd></div>
      <div><dt>Cannons used</dt><dd>${cannons}</dd></div>
      <div><dt>Ammunition used</dt><dd>${ammunition}</dd></div>
      <div><dt>Cargo used</dt><dd>${cargo}</dd></div>
      <div class="capacity-total"><dt>Total / free</dt><dd>${total} / ${free}</dd></div>
    </dl>
  </section>`;
}

function vehicleEventPresentation(event, vehicle, catalog) {
  const details = event.details ?? {};
  const number = (value) => Math.max(0, Number(value) || 0).toLocaleString('en-GB');
  const mission = oreThiefAircraftMissionCopy(vehicle, catalog);
  switch (event.type) {
    case 'searched':
      return ['Search completed', 'The base was not found. Fly another search sortie.'];
    case 'found-base':
      return ['Base located', `Search crews fixed the base ${number(details.distance)} km away.`];
    case 'base-moved':
      return ['Intelligence stale', 'The base could no longer be found at the recorded location.'];
    case 'base-already-destroyed':
      return ['Base already destroyed', `${number(details.ore)} stolen Ore crates remained at the site.`];
    case 'bombed-base':
      return ['Bombing run', `${number(details.bombs)} bomb${Number(details.bombs) === 1 ? '' : 's'} dropped; ${number(details.damage)} buckets of damage; ${number(details.buckets)} defensive buckets remain.`];
    case 'bombing-run-empty':
      return ['Empty bombing run', 'The Bomber reached the base without a usable bomb payload.'];
    case 'destroyed-base':
      return ['Base destroyed', `${number(details.ore)} stolen Ore crate${Number(details.ore) === 1 ? '' : 's'} exposed for helicopter recovery.`];
    case 'base-intact':
      return ['Landing refused', 'The base was still intact. Bombers must destroy it first.'];
    case 'recovered-ore':
      return ['Ore recovered', `${number(details.quantity)} stolen Ore crate${Number(details.quantity) === 1 ? '' : 's'} lifted out by helicopter.`];
    case 'magnet-salvage':
      return details.outcome === 'cargo'
        ? ['Magnet salvage', `${catalog.byId.get(Number(details.itemId))?.name ?? 'Wreckage'} was attracted into cargo${details.wreckCleared ? '; the empty wreck was cleared' : ''}.`]
        : ['Magnet salvage', `${catalog.byId.get(Number(details.itemId))?.name ?? 'Wreckage'} broke down into ${number(details.scraps)} Ore scraps${details.wreckCleared ? '; the empty wreck was cleared' : ''}.`];
    case 'base-empty':
      return ['Recovery complete', 'No stolen Ore remained at the base.'];
    case 'shot-down':
      return ['Shot down', 'Ore-thief defences brought down this aircraft.'];
    case 'departed':
      return details.mission
        ? [`${mission.route} launched`, 'The aircraft left on its regional mission circuit.']
        : ['Departed', 'The vehicle left the city.'];
    case 'arrived':
      return ['Arrived', details.continuesJourney
        ? 'The vehicle reached this stop and continued its itinerary.'
        : 'The vehicle completed its journey.'];
    default:
      return [String(event.type ?? 'Event').split('-')
        .map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : '').join(' '), ''];
  }
}

function vehicleDetailPage(player, catalog, vehicle, routes, now, view = 'status', preview = null,
  selections = {}, previewToken = '') {
  const destination = vehicle.destinationCityId == null ? null
    : catalogCityForId(catalog, vehicle.destinationCityId);
  const local = player.inventoryByCity[vehicle.cityId] ?? {};
  const vehicleItem = catalog.byId.get(vehicle.itemId);
  if (!vehicleItem) throw new Error(`Missing catalog item for vehicle: ${vehicle.itemId}.`);
  const transportPolicy = vehicle.cargoPolicy === 'oil-only'
    ? `<p class="vehicle-policy-note"><strong>Dedicated Oil hold:</strong> carries Oil only, up to ${
      Number(vehicle.capacityCap ?? vehicle.capacity).toLocaleString('en-GB')} barrels. Fittings cannot expand this hold.</p>`
    : vehicle.routePolicy === 'capital-link'
      ? `<p class="vehicle-policy-note"><strong>Capital freight:</strong> carries any ${
        Number(vehicle.capacityCap ?? vehicle.capacity).toLocaleString('en-GB')} things and uses only gateway rails between regional capitals. Its base speed is ${
        Number(vehicle.baseSpeed).toLocaleString('en-GB')} km/h.</p>`
      : '';
  const cargoPolicyCopy = vehicle.cargoPolicy === 'oil-only'
    ? `This dedicated hold accepts only ${escapeHtml(catalogItemForSetting(catalog, 'oil_item_id').name)}. Choose up to ${Number(vehicle.capacityCap ?? vehicle.capacity).toLocaleString('en-GB')} barrels.`
    : vehicle.cargoPolicy === 'any-item'
      ? `This freight hold accepts any inventory thing, up to ${Number(vehicle.capacityCap ?? vehicle.capacity).toLocaleString('en-GB')} in total.`
      : 'Choose the complete cargo manifest. Deactivated vehicles and ships are cargo Things and can be carried by a compatible transport.';
  const events = vehicle.events.map((event) => {
    const [label, detail] = vehicleEventPresentation(event, vehicle, catalog);
    const opponent = event.otherPlayerName
      ? `${escapeHtml(event.otherPlayerName)} · ${escapeHtml(event.otherVehicleName)}` : '';
    return `<tr><td>${new Date(event.createdAt).toLocaleString('en-GB')}</td><td><strong>${escapeHtml(label)}</strong></td><td>${detail ? escapeHtml(detail) : opponent}</td><td>${event.battleId ? `<a class="text-link" href="/battles/${event.battleId}">Battle report</a>` : ''}</td></tr>`;
  }).join('');
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
      ...(vehicle.reinforcement > 0
        ? [['Reinforcement', `${vehicle.reinforcement}/${vehicle.reinforcementMax} damage remaining`]] : []),
      ...(vehicle.type === 'land' ? [
        ['Mods', `${vehicle.mods.length} fitted`],
        ['Weapons', `${vehicle.weapons.length} fitted`]
      ] : []),
      ...(vehicle.type === 'sea' ? [
        ['Utility fittings', `${vehicle.mods.length} fitted`],
        ['Cannon portals', `${vehicle.cannons.length}/${cannonPortals} occupied`],
        ['Ammunition', ammoOverview || 'No ammunition hold']
      ] : [])
    ];
    const underwayCombat = vehicle.type === 'land'
      ? combatStatsPanel(vehicle.combatStats, 'Locked at departure') : '';
    const underwayLoadout = `<section class="vehicle-loadout" aria-labelledby="vehicle-loadout-heading"><h2 id="vehicle-loadout-heading">Current loadout</h2>${capacityBudgetHtml(vehicle.capacityBreakdown, 'Capacity at departure')}<dl>${underwayRows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>${readonlyVehicleCargo(vehicle, catalog)}${underwayCombat}</section>`;
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
      ? oreThiefAircraftMissionCopy(vehicle, catalog).underway
      : vehicleRouteDestinationLabel(player, catalog,
        vehicle.originCityId, vehicle.destinationCityId);
    const journeyStatus = vehicle.creaturePursuit
      ? `Pursuing <strong>${escapeHtml(vehicle.creaturePursuit.creatureName)}</strong>. Interception in ${formatDuration(vehicle.creaturePursuit.encounterAt - now)} at ${Math.round(vehicle.creaturePursuit.encounterLocation).toLocaleString('en-GB')} km along the route.`
      : vehicle.originCityId === vehicle.destinationCityId
        ? `<strong>${escapeHtml(destinationLabel)}</strong>. Returns in ${formatDuration(vehicle.arrivesAt - now)}.`
        : `Traveling to <strong>${escapeHtml(destinationLabel)}</strong>. Arrival in ${formatDuration(vehicle.arrivesAt - now)}.`;
    const onwardJourney = vehicle.queuedJourneyLegs.length
      ? `<section class="vehicle-itinerary-status"><h2>Onward itinerary</h2><p>Each leg departs immediately when the previous one arrives.</p><ol>${vehicle.queuedJourneyLegs.map((leg) => `<li>${escapeHtml(vehicleRouteDestinationLabel(player, catalog, leg.originCityId, leg.destinationCityId))} <small>${Number(leg.length).toLocaleString('en-GB')} km</small></li>`).join('')}</ol></section>`
      : '';
    return `<section class="page-title"><div><p class="eyebrow">Vehicle status</p><h1>${rankBadge(vehicle.rank, 1, catalog)}${escapeHtml(vehicle.name)}</h1></div><a class="text-link" href="/vehicles">Back to vehicles</a></section><section class="vehicle-hero">${itemCard(vehicleItem, { featured: true, meta: vehicle.name })}<div>${transportPolicy}<p>${journeyStatus}${journeyGadgets.length ? ` Journey gadgets: ${escapeHtml(journeyGadgets.join(', '))}.` : ''} Loadout is read-only while underway.</p></div></section>${vehicleShuttlePanel(player, catalog, vehicle)}${onwardJourney}${underwayLoadout}<table><thead><tr><th>When</th><th>Event</th><th>Details</th><th></th></tr></thead><tbody>${events}</tbody></table>`;
  }
  const oilItem = catalogItemForSetting(catalog, 'oil_item_id');
  const boltItem = catalogItemForSetting(catalog, 'bolt_item_id');
  const blockAndTackleItem = catalogItemForSetting(catalog, 'block_and_tackle_item_id');
  const airRouteType = catalogRoleId(catalog, 'route_type_ids', 'air');
  const ammoBoxItemIds = new Set(catalog.boxes.map((box) => box.itemId));
  const boltsAvailable = local[boltItem.id] ?? 0;
  const blockAndTacklesAvailable = local[blockAndTackleItem.id] ?? 0;
  const boltCost = (rarity, itemId = null) => Number(itemId) === Number(
    catalog.settings.magnet_item_id
  ) ? Number(catalog.settings.magnet_fitting_bolt_cost) : Math.max(0,
      Number(rarity) - Number(catalog.settings.mod_bolt_free_rarity))
      * Number(catalog.settings.mod_bolts_per_rarity);
  const cargoById = new Map(vehicle.cargo.map((entry) => [entry.itemId, entry]));
  const cargoChoices = new Map();
  for (const [itemId, quantity] of Object.entries(local)) {
    const item = catalog.byId.get(Number(itemId));
    if (item && Number(item.id) !== Number(catalog.settings.magnet_item_id)
      && quantity > 0 && compatibleCargoAllowed({
      routeType: vehicle.routeType,
      aircraftType: vehicle.aircraftType, vehicleRarity: vehicle.rarity,
      cargoPolicy: vehicle.cargoPolicy,
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
    const compatibleVehicle = vehicle.type === 'land'
      || (vehicle.type === 'sea'
        && Number(item?.id) === Number(catalog.settings.magnet_item_id));
    return item && compatibleVehicle && armsAllowed.has(item.rarity)
      && (fittedMods.has(mod.id) || selectedMods.has(mod.id) || (local[mod.itemId] ?? 0) > 0);
  }).sort(compareCatalogEntriesByRarity(catalog)).map((mod) => {
    const item = catalog.byId.get(mod.itemId);
    const fitted = fittedMods.has(mod.id);
    const selected = selectedMods.has(mod.id);
    const cost = boltCost(item.rarity, item.id);
    return itemCard(item, { compact: true, className: 'item-card-picker',
      meta: [fitted ? 'Fitted now' : `${local[mod.itemId] ?? 0} available in ${catalogCityForId(catalog, vehicle.cityId).name}`,
        `capacity ${signedStat(mod.capacity)}`, `base attack ${signedStat(mod.attack)}`,
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
        '1 capacity each', `aggressive power +${weapon.offense}`,
        `defensive power +${weapon.defense}`,
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
    ...(vehicle.reinforcement > 0
      ? [['Reinforcement', `${vehicle.reinforcement}/${vehicle.reinforcementMax} damage remaining`]] : []),
    ...(vehicle.type === 'land' ? [
      ['Mods', `${vehicle.mods.length} fitted`],
      ['Weapons', `${fittedWeaponTotal} fitted`],
      ['Bolts here', String(boltsAvailable)]
    ] : []),
    ...(vehicle.type === 'sea' ? [
      ['Utility fittings', `${vehicle.mods.length} fitted`],
      ['Cannon portals', `${vehicle.cannons.length}/${cannonPortals} occupied · ${cannonPortalsRemaining} free`],
      ['Bolts here', String(boltsAvailable)],
      ['Ammunition', ammoOverview || 'No ammunition hold'],
      ['Hull', `${vehicle.ship?.hull ?? 0}/${vehicle.ship?.max_hull ?? vehicle.shipDefinition?.hull ?? 0}`],
      ['Crew', `${vehicle.ship?.crew ?? 0}/${vehicle.shipDefinition?.crew ?? 0}`],
      ['Block and Tackle here', String(blockAndTacklesAvailable)]
    ] : [])
  ];
  const cityRepairStatus = vehicle.damaged
    ? (vehicle.repairCompletesAt
      ? `Repairs complete in ${formatDuration(Math.max(0, vehicle.repairCompletesAt - now))}.`
      : 'Repairs begin while it remains parked in this city.')
    : '';
  const shipHullRepairing = vehicle.ship && !vehicle.ship.sunk
    && Number(vehicle.ship.hull) < Number(vehicle.ship.max_hull);
  const currentCombat = vehicle.type === 'land'
    ? combatStatsPanel(vehicle.combatStats, 'Current fitted totals') : '';
  const loadoutOverview = `<section class="vehicle-loadout" aria-labelledby="vehicle-loadout-heading"><h2 id="vehicle-loadout-heading">Current loadout</h2>${capacityBudgetHtml(vehicle.capacityBreakdown, 'Current capacity')}<dl>${loadoutRows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>${currentCombat}${vehicle.damaged ? `<p class="capacity-warning"><strong>Damaged — city repair underway.</strong> ${cityRepairStatus} You may unload cargo, ammunition and fittings, but cannot add anything, travel, or return this vehicle to inventory until repairs finish.</p>` : ''}${shipHullRepairing ? '<p>Dockyard repairs restore one hull point per hour while this ship remains in port.</p>' : ''}</section>`;
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
    ...(Number.isFinite(preview.boltsRequired) ? [['Bolts', `${preview.boltsRequired} required · ${preview.boltsAvailable} here`]] : []),
    ...(Number.isFinite(preview.portalsAfter) ? [['Cannon portals', `${preview.portalsAfter}/${preview.totalPortals} occupied after commit`], ['Combined cannon damage', String(preview.damageAfter)]] : []),
    ...(preview.tackleRequired ? [['Removal equipment', `${preview.tackleRequired} Block and Tackle consumed · ${preview.tackleAvailable} here`]] : [])
  ] : [];
  const previewCombat = preview?.combatStats
    ? combatStatsPanel(preview.combatStats, 'Proposed fitted totals') : '';
  const previewPanel = preview ? `<section class="loadout-preview ${preview.valid ? 'preview-valid' : 'preview-invalid'}" aria-live="polite" data-live-preview-panel><h2>Proposed loadout</h2><p class="preview-verdict">${preview.valid ? 'This exact proposal is ready to commit. The vehicle remains unchanged until then.' : 'This proposal cannot be committed. The vehicle remains unchanged.'}</p>${capacityBudgetHtml(preview.capacityBreakdown, 'Proposed capacity')}${previewCombat}<dl>${previewFacts.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`).join('')}</dl>${previewChanges.length ? `<ul>${previewChanges.map((change) => `<li>${escapeHtml(change)}</li>`).join('')}</ul>` : '<p>No loadout changes selected.</p>'}${preview.reasons.length ? `<ul class="capacity-warning">${preview.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join('')}</ul>` : ''}</section>` : '';
  const routeOptions = routes.map((route) => {
    const label = vehicleRouteDestinationLabel(
      player, catalog, vehicle.cityId, route.destinationCityId
    );
    return `<option value="${route.id}" data-destination-city-id="${route.destinationCityId}">${route.mission
      ? escapeHtml(oreThiefAircraftMissionCopy(vehicle, catalog).route)
      : `${escapeHtml(label)} · ${Number(route.length).toLocaleString('en-GB')} km`}${escapeHtml(radarText(route, catalog))}</option>`;
  }).join('');
  const shuttleRouteOptions = routes.filter((route) => !route.mission
    && Number(route.destinationCityId) !== Number(vehicle.cityId)).map((route) => {
    const label = vehicleRouteDestinationLabel(
      player, catalog, vehicle.cityId, route.destinationCityId
    );
    return `<option value="${route.id}">${escapeHtml(label)} · ${Number(route.length).toLocaleString('en-GB')} km</option>`;
  }).join('');
  const shuttleCategoryOptions = selectableShuttleCategories(catalog).map((category) =>
    `<label><input type="checkbox" name="category_${category.id}" value="1" checked${vehicle.damaged ? ' disabled' : ''}> ${escapeHtml(category.name)}</label>`
  ).join('');
  const travelOrderNames = catalog.settings.travel_order_names;
  if (!travelOrderNames || typeof travelOrderNames !== 'object' || Array.isArray(travelOrderNames)) {
    throw new Error('Invalid catalog setting: travel_order_names.');
  }
  const travelOrderOptions = ['peaceful', 'pillage', 'patrol'].map((order) => {
    const label = travelOrderNames[order];
    if (typeof label !== 'string' || !label) throw new Error(`Missing travel-order name: ${order}.`);
    return `<option value="${order}"${vehicle.travelOrder === order ? ' selected' : ''}>${escapeHtml(label)}</option>`;
  }).join('');
  if (vehicle.aircraftDestroyed) {
    return `<section class="page-title"><div><p class="eyebrow">Aircraft lost</p><h1>${escapeHtml(vehicle.name)}</h1></div><a class="text-link" href="/vehicles">Back to vehicles</a></section><section class="vehicle-hero">${itemCard(vehicleItem, { featured: true, meta: vehicle.name })}<p class="capacity-warning">This aircraft was shot down by the ore thieves. Its cargo was lost.</p></section>${loadoutOverview}<table><thead><tr><th>When</th><th>Event</th><th>Details</th><th></th></tr></thead><tbody>${events || '<tr><td colspan="4">No mission history.</td></tr>'}</tbody></table>`;
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
  const shipFittings = vehicle.type === 'sea' ? `<section class="vehicle-fittings"><h2>Ship fittings and cannons <small>${vehicle.cannons.length}/${cannonPortals} portals occupied</small></h2><p>Choose the complete fitting and cannon set. Fitting a Magnet consumes the Magnet and one ${escapeHtml(boltItem.name)}. Existing cannons can be kept, returned or replaced; any cannon removal consumes one ${escapeHtml(blockAndTackleItem.name)}. Ammunition remains aboard.</p><ul class="fitted-cannon-list">${attachedCannons || '<li>No cannons attached. Choose the proposed loadout below, preview it, then commit it to unlock ammunition loading.</li>'}</ul><div id="vehicle-loadout-editor" data-live-preview-scope>${previewPanel}<form method="post" action="/vehicles/${vehicle.id}/customize" data-live-preview-form>${previewBindingInput}<h3>Utility fittings</h3><p>A fitted Magnet can recover one piece of wreckage per journey. A Magnet carried as cargo does nothing.</p><div class="fitting-grid">${modChoices || '<p>No Magnet is fitted or available in this city.</p>'}</div><h3>Proposed complete cannon set</h3><div class="fitting-grid">${cannonChoices || '<p>No compatible cannons fitted or available in this city.</p>'}</div><div class="customization-actions"><button name="intent" value="preview">Preview ship loadout</button>${commitButton}</div></form></div><div id="ammunition"><h2>Ammunition <small>${totalLoadedShots} shots loaded</small></h2><p>Cannons draw from this ship's shared ammunition hold; shots do not need to be assigned to individual cannon portals. <a class="text-link" href="/vehicles/boxes?vehicleId=${vehicle.id}">Open ammunition boxes into crates</a>, then load those crates here.</p><div class="stacked-actions">${ammo}</div><form class="ammo-unload" method="post" action="/vehicles/${vehicle.id}/ammo/unload"><p>Unload ${fullAmmoCrates} complete crate${fullAmmoCrates === 1 ? '' : 's'} to ${escapeHtml(city.name)}.${totalLooseShots ? ` ${totalLooseShots} loose shot${totalLooseShots === 1 ? '' : 's'} cannot be repacked.` : ' No shots will be lost.'}</p>${unloadWarning}<button class="secondary"${totalLoadedShots ? '' : ' disabled'}>Unload all ammunition</button></form></div></section>` : '';
  const deactivateBlocked = !vehicleCanDeactivate(vehicle, catalog);
  const deactivateWarning = vehicle.damaged
    ? `${cityRepairStatus} A damaged vehicle cannot be stored as a thing.`
    : vehicle.reinforcement > 0
    ? `This vehicle still has ${vehicle.reinforcement}/${vehicle.reinforcementMax} reinforcement. It remains fitted until it absorbs that damage.`
    : vehicle.oiledTrips > 0 || vehicle.tripsStolen > 0
      ? 'Use all loaded and stolen oil trips before deactivating this vehicle.'
      : shipHullRepairing
        ? 'Let dockyard repairs restore the hull completely before deactivating this ship.'
    : 'Unload cargo and remove every fitting, cannon, and ammunition shot before storing this vehicle as a thing.';
  const pageTitle = `<section class="page-title"><div><p class="eyebrow">${escapeHtml(vehicle.type)} in ${escapeHtml(city.name)} ${rankBadge(vehicle.rank, 1, catalog)}</p><h1>${escapeHtml(vehicle.name)}</h1></div><a class="text-link" href="${view === 'status' ? '/vehicles' : `/vehicles/${vehicle.id}`}">${view === 'status' ? 'Back to vehicles' : 'Back to vehicle status'}</a></section>`;
  const hero = `<section class="vehicle-hero vehicle-hero-compact">${itemCard(vehicleItem, { compact: true, meta: vehicle.name })}<div>${transportPolicy}<p>Speed ${vehicle.speed} · cargo ${vehicle.cargoSize}/${vehicle.capacity} · ${vehicle.capacityBreakdown?.free ?? freeCapacity} total capacity free · rating ${Math.round(vehicle.rating)}${vehicle.rank ? ` · tier ${vehicle.rank}` : ''}${vehicle.damaged ? ' · DAMAGED' : ''}</p></div></section>`;
  const journeyRouteData = JSON.stringify(
    vehicleJourneyRouteGraph(player, catalog, vehicle)
  ).replace(/</g, '\\u003c');
  const ordinarySendSection = `<section class="vehicle-send-panel"><h2>Send</h2>${routeOptions ? `
    <form class="vehicle-send" method="post" action="/vehicles/${vehicle.id}/send" data-journey-planner>
      <div class="vehicle-journey-builder">
        <label>First leg<select name="routeId" data-journey-first${vehicle.damaged ? ' disabled' : ''}>${routeOptions}</select></label>
        <ol class="vehicle-journey-legs" data-journey-legs></ol>
        <div class="button-row"><button class="secondary" type="button" data-add-journey-leg${vehicle.damaged ? ' disabled' : ''}>Add onward leg</button></div>
        <p class="field-help" data-journey-summary>Additional legs leave immediately after arrival. Cargo stays aboard until the final stop.</p>
        <script type="application/json" data-journey-routes>${journeyRouteData}</script>
      </div>
      ${vehicle.routeType === airRouteType
        ? '<input type="hidden" name="travelOrder" value="peaceful">'
        : `<label>Order<select name="travelOrder"${vehicle.damaged ? ' disabled' : ''}>${travelOrderOptions}</select></label>
          <div class="vehicle-tier-targeting"><p>Combat targets are limited automatically to this vehicle's tier.</p><label><input type="checkbox" name="attackSentry"${vehicle.aggressiveVsSentry ? ' checked' : ''}${vehicle.damaged ? ' disabled' : ''}>Also engage patrols in this tier</label></div>`}
      <button${vehicle.damaged ? ' disabled' : ''}>Send itinerary</button>
    </form><script src="/node/vehicle-journey.js?v=20260825b" defer></script>` : '<p>No compatible routes from this city.</p>'}</section>`;
  const shuttleSetupControls = Number(vehicle.capacity) <= 0
    ? `<p class="capacity-warning"><strong>No cargo space is available.</strong> Fittings or ammunition use every capacity slot. <a class="text-link" href="/vehicles/${vehicle.id}/customize">Free at least one slot</a> before setting up a shuttle.</p>`
    : shuttleRouteOptions
      ? `<form class="vehicle-shuttle-form" method="post" action="/vehicles/${vehicle.id}/shuttle"><label>Destination<select name="routeId" required${vehicle.damaged ? ' disabled' : ''}>${shuttleRouteOptions}</select></label>${vehicle.routeType === airRouteType
        ? '<input type="hidden" name="travelOrder" value="peaceful"><p class="field-help"><strong>Order:</strong> Peaceful. Aircraft cannot take combat orders.</p>'
        : `<label>Order<select name="travelOrder"${vehicle.damaged ? ' disabled' : ''}>${travelOrderOptions}</select></label><p class="field-help">The chosen order applies on both the loaded outbound leg and the empty return leg.</p>`}<fieldset${vehicle.damaged ? ' disabled' : ''}><legend>Cargo categories</legend><p>Every category is selected. Untick anything this shuttle must leave behind; the rarest eligible things among the remaining categories load first.</p><div class="button-row vehicle-shuttle-category-actions"><button class="secondary" type="button" data-shuttle-deselect-all aria-controls="shuttle-categories-${vehicle.id}">Deselect all</button></div><div id="shuttle-categories-${vehicle.id}" class="vehicle-shuttle-categories">${shuttleCategoryOptions}</div></fieldset><button${vehicle.damaged ? ' disabled' : ''}>Start shuttle</button></form><script src="/node/vehicle-shuttle.js?v=20260901a" defer></script>`
      : '<p>No compatible shuttle destination from this city.</p>';
  const shuttleSetupSection = vehicle.cargoSize === 0 ? `<section class="vehicle-send-panel vehicle-shuttle-setup"><p class="eyebrow">Automatic transport</p><h2>Set up a shuttle</h2><p>Each outbound trip loads as many eligible things as will fit, rarest first, unloads them at the destination, then returns empty and repeats until cancelled. Protected factory output is never loaded. Deactivated transports can travel as ordinary cargo when Vehicles or Ships are selected. Oil Field machine parts stay in their Oil Field home city.</p>${shuttleSetupControls}</section>` : '';
  const sendSection = vehicle.shuttle
    ? vehicleShuttlePanel(player, catalog, vehicle)
    : `${ordinarySendSection}${shuttleSetupSection}`;
  if (view === 'cargo') {
    const rarestDisabled = vehicle.damaged || !cargoRows || vehicle.capacity < 1;
    return `${pageTitle}${hero}${loadoutOverview}<section><h2>Cargo</h2><p>${cargoPolicyCopy} Preview its capacity and combat effects, then commit that exact proposal. Carried land weapons add aggressive power when pillaging and defensive power when patrolling; they are still cargo, not fitted weapons. Cannons and ammunition carried as cargo cannot fire.</p><div id="vehicle-loadout-editor" data-live-preview-scope>${previewPanel}<form method="post" action="/vehicles/${vehicle.id}/cargo" data-live-preview-form>${previewBindingInput}<div class="table-scroll"><table class="cargo-loadout-table"><thead><tr><th>Thing</th><th>Available here</th><th>Proposed cargo</th></tr></thead><tbody>${cargoRows || '<tr><td colspan="3">No compatible cargo in this city.</td></tr>'}</tbody></table></div><div class="customization-actions"><button class="secondary" name="intent" value="rarest"${rarestDisabled ? ' disabled' : ''}>Take as much of the rarest things as we can</button><button name="intent" value="preview">Preview cargo</button>${commitButton}</div></form></div></section>`;
  }
  if (view === 'customize') {
    return `${pageTitle}${hero}${loadoutOverview}${landFittings}${shipFittings}`;
  }
  const manageSection = vehicle.shuttle
    ? '<section class="vehicle-manage-actions"><h2>Automatic cargo</h2><p>This shuttle controls its cargo hold until its route is cancelled.</p></section>'
    : `<section class="vehicle-manage-actions"><h2>Manage vehicle</h2><p>${vehicle.type === 'air' ? 'Cargo has its own focused screen.' : 'Cargo and customization are separate so you can focus on one job at a time.'}</p><div class="button-row"><a class="button" href="/vehicles/${vehicle.id}/cargo">Manage cargo</a>${vehicle.type === 'air' ? '' : `<a class="button" href="/vehicles/${vehicle.id}/customize${vehicle.type === 'sea' ? '#ammunition' : ''}">${vehicle.type === 'sea' ? 'Load ammunition or change cannons' : 'Customize mods and weapons'}</a>`}</div></section>`;
  return `${pageTitle}
    <section class="vehicle-hero">${itemCard(vehicleItem, { featured: true, meta: vehicle.name })}<div>${transportPolicy}<p>Speed ${vehicle.speed} · cargo ${vehicle.cargoSize}/${vehicle.capacity} · ${vehicle.capacityBreakdown?.free ?? freeCapacity} total capacity free · rating ${Math.round(vehicle.rating)}${vehicle.rank ? ` · tier ${vehicle.rank}` : ''}${vehicle.damaged ? ' · DAMAGED' : ''}</p>${vehicle.shuttle ? '' : `<form class="inline-order" method="post" action="/vehicles/${vehicle.id}/rename"><input name="name" maxlength="${Number(catalog.settings.vehicle_name_max_length)}" value="${escapeHtml(vehicle.customName)}" placeholder="Custom name"><button>Rename</button></form>`}</div></section>${sendSection}${loadoutOverview}
    ${manageSection}
    ${vehicle.shuttle ? '' : `<section><h2>Oil</h2>${oilItem ? itemCard(oilItem, { count: local[oilItem.id] ?? 0, compact: true, meta: [`${vehicle.oiledTrips} boosted trips loaded`, `${vehicle.tripsStolen} stolen trips`], action: `<form method="post" action="/vehicles/${vehicle.id}/oil"><button ${vehicle.routeType === airRouteType || !(local[oilItem.id] ?? 0) ? 'disabled' : ''}>Load one barrel</button></form>${vehicle.tripsStolen ? `<form method="post" action="/vehicles/${vehicle.id}/oil/unload"><button class="secondary">Reclaim a barrel</button></form>` : ''}` }) : ''}</section>`}
    <section><h2>History</h2><table><thead><tr><th>When</th><th>Event</th><th>Details</th><th></th></tr></thead><tbody>${events || '<tr><td colspan="4">No journeys yet.</td></tr>'}</tbody></table></section>
    ${vehicle.shuttle ? '' : `<form method="post" action="/vehicles/${vehicle.id}/store"><p>${deactivateBlocked ? deactivateWarning : 'Return this unaltered transport to stored vehicle things. You can activate it again in this city later.'}</p><button class="secondary"${deactivateBlocked ? ' disabled' : ''}>Deactivate</button></form>`}`;
}

export function battlePage(report) {
  const reportValue = (value, label) => {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error(`Battle report is missing ${label}.`);
    return number;
  };
  const reportNumber = (value, label) => reportValue(value, label).toLocaleString('en-GB', {
    maximumFractionDigits: 3
  });
  const reportCombatNumber = (value, label) => Math.max(0,
    reportValue(value, label)).toLocaleString('en-GB', { maximumFractionDigits: 3 });
  const naturalList = (entries) => entries.length < 2 ? entries[0] ?? ''
    : entries.length === 2 ? `${entries[0]} and ${entries[1]}`
      : `${entries.slice(0, -1).join(', ')}, and ${entries.at(-1)}`;
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
  const captiveRows = captiveDwarfCombatEntries(result).map((strike) => {
    const phase = `${strike.phase.charAt(0).toLocaleUpperCase('en-GB')}${
      strike.phase.slice(1)} round ${reportNumber(strike.round, 'captive Dwarf round')}`;
    const dwarves = (Array.isArray(strike.dwarves) ? strike.dwarves : [])
      .map((dwarf) => `${dwarf.name ?? 'Dwarf'} (${
        reportNumber(dwarf.damage, 'captive Dwarf damage')} damage)`).join(', ');
    return `<tr><td>${escapeHtml(phase)}</td><td>${Number(strike.side) === side ? 'Your vehicle' : 'Opponent'}</td><td>${escapeHtml(dwarves || 'Dwarf')}</td><td>${reportNumber(strike.penetratingDamage ?? strike.damage, 'captive Dwarf penetrating damage')}${strike.absorbed ? ` (${reportNumber(strike.absorbed, 'absorbed captive Dwarf damage')} absorbed)` : ''}</td><td>${reportNumber(strike.structureBefore, 'captor structure before strike')} → ${reportNumber(strike.structureAfter, 'captor structure after strike')} ${escapeHtml(strike.structure ?? 'structure')}</td></tr>`;
  }).join('');
  const freedCaptives = Array.isArray(result.freedCaptiveDwarves)
    ? result.freedCaptiveDwarves.length : 0;
  const captiveSection = captiveRows
    ? `<h3>Captive Dwarf resistance</h3><p>Captured Dwarves strike their NPC captor once per combat round, dealing damage equal to their rarity.${freedCaptives ? ` ${reportNumber(freedCaptives, 'freed captive Dwarves')} ${freedCaptives === 1 ? 'Dwarf escaped' : 'Dwarves escaped'} when the NPC was defeated.` : ''}</p><div class="table-scroll"><table><thead><tr><th>Round</th><th>Captor</th><th>Dwarves</th><th>Damage reaching structure</th><th>Captor structure</th></tr></thead><tbody>${captiveRows}</tbody></table></div>`
    : '';
  let details = '';
  if (report.details.type === 'land2') {
    const start = report.details.starting?.[side];
    const end = result.ending?.[side];
    if (!start || !end) throw new Error('Battle report is missing land-combat state.');
    const roundRows = (result.roundLog ?? []).flatMap((round) =>
      (round.blows ?? []).map((blow) => {
        const reduction = (round.reductions ?? []).find((entry) =>
          Number(entry.opponent) === Number(blow.side));
        return `<tr><td>${reportNumber(round.round, 'land round')}</td><td>${Number(blow.side) === side ? 'You' : 'Opponent'}</td><td>${round.before?.[blow.side]?.aggressive ? 'Aggressive' : 'Defensive'}</td><td>${reportCombatNumber(reduction?.attackBefore ?? 0, 'base attack before defensive power')} → ${reportCombatNumber(reduction?.attackAfter ?? 0, 'base attack after defensive power')}</td><td>${reportCombatNumber(blow.penetratingDamage ?? blow.damage, 'land blow')}${blow.absorbed ? ` (${reportCombatNumber(blow.absorbed, 'absorbed damage')} absorbed)` : ''}</td><td>${reportCombatNumber(blow.armorBefore, 'armour before blow')} → ${reportCombatNumber(blow.armorAfter, 'armour after blow')}</td></tr>`;
      })).join('');
    const roundTable = roundRows
      ? `<h3>Combat rounds</h3><div class="table-scroll"><table><thead><tr><th>Round</th><th>Attacker</th><th>Stance</th><th>Base attack after defensive power</th><th>Damage reaching armour</th><th>Target armour</th></tr></thead><tbody>${roundRows}</tbody></table></div>`
      : '<h3>Combat rounds</h3><p>No attack was made.</p>';
    details = `<h2>Land battle</h2><p>Your vehicle started with ${reportCombatNumber(start.attack, 'starting base attack')} base attack, ${reportCombatNumber(start.armor, 'starting armour')} armour, ${reportCombatNumber(start.offense, 'starting aggressive power')} aggressive power, ${reportCombatNumber(start.defense, 'starting defensive power')} defensive power, and ${reportCombatNumber(start.dodge, 'starting dodge')} dodge. Base attack always applies; aggressive power is added only while pillaging, while defensive power reduces the opponent’s base attack when patrolling. After ${reportNumber(result.rounds, 'round count')} rounds, it had ${reportCombatNumber(end.attack, 'ending base attack')} base attack and ${reportCombatNumber(end.armor, 'ending armour')} armour. The final blow dealt ${reportCombatNumber(result.finalBlow, 'final blow')} damage.</p>${roundTable}${captiveSection}`;
  } else if (report.details.type === 'ship') {
    const ship = result.ships?.[side];
    const shots = result.shots?.[side];
    const casualtiesForSide = result.casualties?.[side];
    if (!ship || !Array.isArray(shots) || !Array.isArray(casualtiesForSide)) {
      throw new Error('Battle report is missing ship-combat state.');
    }
    const hits = shots.filter((shot) => shot.hit).length;
    const start = result.starting?.[side];
    const endingCrew = reportValue(ship.crew, 'ending crew');
    const crewLost = start
      ? Math.max(0, reportValue(start.crew, 'starting crew') - endingCrew)
      : casualtiesForSide.length;
    const crewLossText = crewLost === 0 ? 'No crew were lost.'
      : `${reportNumber(crewLost, 'crew lost')} crew member${crewLost === 1 ? ' was' : 's were'} lost.`;
    const shotText = `${shots.length} cannon shot${shots.length === 1 ? '' : 's'}`;
    const hitText = `${hits} hit${hits === 1 ? '' : 's'}`;
    const startingText = start
      ? `It started with ${reportNumber(start.hull, 'starting hull')} hull, ${reportNumber(start.speed, 'starting speed')} speed, and ${reportNumber(start.crew, 'starting crew')} crew. ` : '';
    const ammunitionNames = { 1: 'Cannonball', 2: 'Chain shot', 3: 'Grape shot' };
    const shotRows = (result.shots ?? []).flatMap((sideShots, shooter) =>
      sideShots.map((shot) => ({ ...shot, shooter })))
      .sort((first, second) => first.round - second.round || first.portal - second.portal
        || first.shooter - second.shooter)
      .map((shot) => {
        const target = shot.targetAfter;
        const targetState = target
          ? `${reportNumber(target.hull, 'shot hull')} hull / ${reportNumber(target.speed, 'shot speed')} speed / ${reportNumber(target.crew, 'shot crew')} crew${Number(target.reinforcement) > 0
            ? ` / ${reportNumber(target.reinforcement, 'shot reinforcement')} reinforcement` : ''}`
          : '—';
        return `<tr><td>${reportNumber(shot.round, 'shot round')}</td><td>${reportNumber(shot.portal, 'shot portal')}</td><td>${shot.shooter === side ? 'You' : 'Opponent'}</td><td>${escapeHtml(shot.cannonName ?? 'Cannon')}</td><td>${escapeHtml(ammunitionNames[shot.type] ?? `Type ${shot.type}`)}</td><td>${shot.hit ? `${reportNumber(shot.damage, 'shot damage')} ${escapeHtml(shot.damageField ?? '')}${shot.absorbed ? ` (${reportNumber(shot.absorbed, 'absorbed damage')} absorbed)` : ''}` : 'Miss'}</td><td>${escapeHtml(targetState)}</td></tr>`;
      }).join('');
    const cannonTable = shotRows
      ? `<div class="table-scroll"><table><thead><tr><th>Round</th><th>Portal</th><th>Fired by</th><th>Cannon</th><th>Shot</th><th>Result</th><th>Target after shot</th></tr></thead><tbody>${shotRows}</tbody></table></div>`
      : '<p>No cannon was fired.</p>';
    const boardingRows = (result.boardingRounds ?? []).map((round) => {
      const casualty = round.casualtySide
        ? `${round.casualtySide - 1 === side ? 'Your' : 'Opponent'} crew lost ${escapeHtml(round.weaponName ?? 'an unarmed sailor')}`
        : round.winner ? `${round.winner - 1 === side ? 'Your' : 'Opponent'} crew forced the victory` : 'No casualty';
      return `<tr><td>${reportNumber(round.round, 'boarding round')}</td><td>${reportNumber(round.strength?.[side] ?? 0, 'boarding strength')}</td><td>${reportNumber(round.strength?.[(side + 1) % 2] ?? 0, 'opponent boarding strength')}</td><td>${casualty}</td></tr>`;
    }).join('');
    const escapeWinnerSide = Number(result.winner) - 1;
    const escapeWon = escapeWinnerSide === side;
    const escapeUsedChainShot = Boolean(result.chainEscape
      && result.shots?.[escapeWinnerSide]?.some((shot) =>
        shot.hit && Number(shot.type) === 2 && shot.damageField === 'speed'));
    const opponentShip = result.ships?.[(side + 1) % 2];
    const noBoardingReason = result.chainEscape
      ? escapeWon
        ? escapeUsedChainShot
          ? 'Your chain shot slowed the pursuing enemy, letting your faster ship escape before boarding could begin.'
          : 'Your faster ship escaped the pursuing enemy before boarding could begin.'
        : escapeUsedChainShot
          ? 'An enemy chain shot slowed your ship, letting the faster enemy escape before boarding could begin.'
          : 'The faster enemy ship escaped your pursuit before boarding could begin.'
      : ship.hull === 0 && opponentShip?.hull === 0
        ? 'Both ships sank before boarding could begin.'
        : ship.hull === 0
          ? 'Your ship sank before boarding could begin.'
          : opponentShip?.hull === 0
            ? 'The enemy ship sank before boarding could begin.'
            : 'No boarding action took place.';
    const boarding = boardingRows
      ? `<h3>Boarding</h3><div class="table-scroll"><table><thead><tr><th>Round</th><th>Your strength</th><th>Opponent strength</th><th>Outcome</th></tr></thead><tbody>${boardingRows}</tbody></table></div>`
      : `<h3>Boarding</h3><p>${noBoardingReason}</p>`;
    const repair = result.repairs?.[side];
    let repairText = '';
    if (repair) {
      const hullRepair = reportValue(repair.hull, 'hull repair');
      const speedRepair = reportValue(repair.speed, 'sail repair');
      const crewRecovery = reportValue(repair.crew, 'crew recovery');
      const repairedStats = [
        hullRepair > 0 ? `${reportNumber(hullRepair, 'hull repair')} hull` : null,
        speedRepair > 0 ? `${reportNumber(speedRepair, 'sail repair')} speed` : null
      ].filter(Boolean);
      const recoveryClauses = [];
      if (repairedStats.length) recoveryClauses.push(`repairs restored ${naturalList(repairedStats)}`);
      if (crewRecovery > 0) {
        recoveryClauses.push(`${reportNumber(crewRecovery, 'crew recovery')} crew member${crewRecovery === 1 ? '' : 's'} returned to duty`);
      }
      if (recoveryClauses.length) {
        repairText = `<p>After combat, ${recoveryClauses.join('; ')}. The ship resumed with ${reportNumber(repair.ending.hull, 'repaired hull')} hull, ${reportNumber(repair.ending.speed, 'repaired speed')} speed, and ${reportNumber(repair.ending.crew, 'repaired crew')} crew.</p>`;
      }
    }
    details = `<h2>Cannon and crew battle</h2><p>${startingText}Your ship fired ${shotText} and landed ${hitText}. It finished combat with ${reportNumber(ship.hull, 'ending hull')} hull, ${reportNumber(ship.speed, 'ending speed')} speed, and ${reportNumber(ship.crew, 'ending crew')} crew. ${crewLossText}${ship.hull === 0 ? ' The ship sank.' : ''}</p>${cannonTable}${boarding}${captiveSection}${repairText}`;
  } else {
    throw new Error(`Unknown battle report type: ${report.details.type}.`);
  }
  const opponentVehicleName = typeof report.opponent.vehicle_name === 'string'
    ? report.opponent.vehicle_name : 'Vehicle data unavailable';
  return `<section class="page-title"><div><p class="eyebrow">Battle report</p><h1>${outcome}</h1></div><a class="text-link" href="/vehicles">Back to vehicles</a></section>
    <section class="battle-summary"><h2>${escapeHtml(report.opponent.player_name)}'s ${escapeHtml(opponentVehicleName)}</h2>
    <p>Your vehicle was <strong>${report.aggressive ? 'aggressive' : 'defensive'}</strong>; the enemy was <strong>${enemyAggressive ? 'aggressive' : 'defensive'}</strong>.</p>${details}
    <p class="battle-outcome">${report.tied ? 'You tied.' : report.won ? 'You won.' : 'You lost.'}</p><p>Rating ${Math.round(report.ratingBefore)} → <strong>${Math.round(report.ratingAfter)}</strong></p></section>`;
}

function combatDivisionLabel(catalog, classValue) {
  const rarities = catalog.settings.combat_class_by_rarity
    .map((value, rarity) => ({ value: Number(value), rarity }))
    .filter((entry) => entry.value === Number(classValue))
    .map((entry) => catalog.settings.rarity_color_names[entry.rarity]);
  return rarities.length > 1 ? `${rarities[0]}–${rarities.at(-1)}` : rarities[0];
}

function combatSeasonDate(timestamp) {
  return new Date(timestamp).toLocaleDateString('en-GB', {
    timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric'
  });
}

function ratingsPage(report, catalog) {
  const sections = report.ratings.map((group) => `<section><h2>${escapeHtml(
    catalogLabel(catalog, 'vehicle_type', group.routeType))} ranks</h2><ol class="ratings-list">${group.players.map((entry) => {
    const name = entry.playerId === null
      ? `<strong>${escapeHtml(entry.name)}</strong>`
      : `<a class="text-link" href="/miners/${encodeURIComponent(entry.name)}">${escapeHtml(entry.name)}</a>`;
    const participation = entry.participantType === 'creature'
      ? 'Event creature'
      : `${entry.vehicleCount} participating vehicle${entry.vehicleCount === 1 ? '' : 's'} · ${entry.meldCount} melds${entry.isNpc ? ' · NPC fleet' : ''}`;
    return `<li><span>${entry.rank}.</span>${rankBadge(entry.tierRank, entry.vehicleCount, catalog)}${name}<small>${entry.wins} wins from ${entry.battles} battles · ${Math.round(entry.rating)} rating · ${participation}</small></li>`;
  }).join('') || '<li>No participants in this division.</li>'}</ol></section>`).join('');
  const classes = [...new Set(catalog.settings.combat_class_by_rarity.map(Number)
    .filter((value) => value > 0))];
  const tabs = classes.map((combatClassValue) => {
    const label = combatDivisionLabel(catalog, combatClassValue);
    return `<a href="/ratings?class=${combatClassValue}"${report.combatClass === combatClassValue ? ' aria-current="page"' : ''}>${escapeHtml(label)}</a>`;
  }).join('');
  const seasonEnd = report.season.endsAt - 24 * 60 * 60 * 1000;
  return `<section class="page-title"><div><p class="eyebrow">Live combat ranks · Combat season ${report.season.number}</p><h1>Vehicle rankings</h1></div><div class="page-title-actions"><a class="button" href="/ratings/prizes">View season prizes</a><a class="text-link" href="/vehicles">Back to vehicles</a></div></section><nav class="rating-tabs">${tabs}</nav>
    <p><strong>${combatSeasonDate(report.season.startsAt)}–${combatSeasonDate(seasonEnd)}.</strong> Every vehicle, ship, ghost fleet, and event creature participates automatically from its live rating. Every resolved vehicle or creature fight changes the combatants' ratings; no win is required to appear. Miner and ghost standings use the current strongest vehicle in that division. Player prizes are limited to non-NPC miners with at least one resolved fight. Ratings reset when the season closes.</p><div class="ratings-grid">${sections}</div>`;
}

function combatSeasonPrizesPage(report, prizes, catalog) {
  const currentEnd = report.season.endsAt - 24 * 60 * 60 * 1000;
  const divisions = prizes.divisions.map((division) => {
    const routeSections = division.routes.map((route) => `<section class="combat-prize-route"><h3>${escapeHtml(catalogLabel(catalog, 'vehicle_type', route.routeType))}</h3><ol class="combat-prize-list">${route.prizes.map((prize) => {
      const item = catalogItemForId(catalog, prize.itemId, 'combat season prize');
      return `<li><strong>#${prize.place}</strong>${itemCard(item, {
        compact: true,
        meta: `${item.rarityName} · awarded unfitted`
      })}</li>`;
    }).join('')}</ol></section>`).join('');
    return `<section class="combat-prize-division"><header><p class="eyebrow">Combat division</p><h2>${escapeHtml(combatDivisionLabel(catalog, division.combatClass))}</h2></header><div class="combat-prize-routes">${routeSections}</div></section>`;
  }).join('');
  const latestRows = prizes.latestResults.map((result) => {
    const prizeItem = catalogItemForId(catalog, result.prizeItemId, 'combat season result prize');
    return `<tr><td>${escapeHtml(
      combatDivisionLabel(catalog, result.combatClass))}</td><td>${escapeHtml(
      catalogLabel(catalog, 'vehicle_type', result.routeType))}</td><td>#${result.place}</td><td>${result.playerId
        ? `<a class="text-link" href="/miners/${encodeURIComponent(result.playerName)}">${escapeHtml(result.playerName)}</a>`
        : escapeHtml(result.playerName)}</td><td><a class="thing-link rarity-${prizeItem.rarity}" href="/items/${result.prizeItemId}">${escapeHtml(result.prizeName)}</a></td></tr>`;
  }).join('');
  const latest = prizes.latestSeason
    ? `<section><h2>Previous season winners</h2><p>${combatSeasonDate(prizes.latestSeason.startsAt)}–${combatSeasonDate(prizes.latestSeason.endsAt - 24 * 60 * 60 * 1000)}</p><div class="table-scroll"><table><thead><tr><th>Division</th><th>Type</th><th>Place</th><th>Miner</th><th>Prize</th></tr></thead><tbody>${latestRows || '<tr><td colspan="5">No qualifying winners.</td></tr>'}</tbody></table></div></section>`
    : '';
  return `<section class="page-title"><div><p class="eyebrow">Three-month combat seasons</p><h1>Season prizes</h1></div><a class="text-link" href="/ratings">Back to ratings</a></section>
    <section class="combat-prize-intro"><h2>Fight upward</h2><p>The current season runs from <strong>${combatSeasonDate(report.season.startsAt)}</strong> through <strong>${combatSeasonDate(currentEnd)}</strong>. The top five non-NPC Land and Ship miners with at least one resolved fight in every division receive one unfitted transport in their current city. Yellow winners receive Green–Blue transports; Green–Blue winners receive Red+ transports. In Red+, first place receives the matching Champion and places two through five receive desirable Red+ transports.</p></section>${divisions}${latest}`;
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
  return `<section class="page-title"><div><p class="eyebrow">Ship ammunition</p><h1>Open ammo boxes</h1></div><a class="text-link" href="${backHref}">${backLabel}</a></section>
    <p>Each box opens into ${catalog.settings.ammo_box_crates} crates, with ${catalog.settings.shots_per_crate} shots per crate. Opened crates cannot be repacked.</p><table><thead><tr><th>Boxes</th><th>Crates</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}

function containersPage(data) {
  const rows = data.containers.map((container) => `<tr><td>${escapeHtml(container.name)}</td><td>+${container.capacity}</td><td>${container.quantity}</td><td>${container.credits} credits</td><td><form method="post" action="/containers/${container.id}/buy"><button ${data.credits < container.credits ? 'disabled' : ''}>Buy</button></form></td></tr>`).join('');
  return `<section class="page-title page-title-long"><div><p class="eyebrow">Credits shop</p><h1>Inventory containers</h1></div><p>${data.credits} credits · current inventory capacity ${data.itemLimit}/${data.maximumItemLimit}</p></section>
    <p>Capacity starts at ${data.baseItemLimit}. Each container type permanently adds its capacity once, and owning every type raises it to ${data.maximumItemLimit}. Extra copies remain owned but do not increase your limit again.</p><table><thead><tr><th>Name</th><th>Capacity</th><th>Owned</th><th>Price</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
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
    const machineType = catalog.machineTypeById.get(Number(typeId));
    if (!machineType) throw new Error(`Missing Oil Field machine type ${typeId}.`);
    const machineInfo = machineDescription(machineType, Number(machine.rarity), catalog.settings);
    const item = catalog.byId.get(Number(machine.itemId));
    if (!item) throw new Error(`Missing Oil Field machine item ${machine.itemId}.`);
    machineTypes[typeId] = machine.typeName;
    machines[machine.id] = {
      Machine: { id: machine.id, item_id: machine.itemId, machine_type_id: typeId },
      MachineType: {
        id: typeId, name: machine.typeName, power: machineInfo.power,
        lifeDays: machineInfo.lifeDays
      },
      Item: {
        id: item.id, name: item.name, icon: item.icon,
        rarity: String(item.rarity), description: item.description
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
    MachineType: {
      ...machines[machine.id].MachineType,
      id: machine.machineTypeId ?? machine.type,
      name: machine.typeName
    }
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
  const eventRows = field.events.map((event) => `<tr><td>${new Date(event.createdAt).toLocaleString('en-GB')}</td><td>${escapeHtml(event.type)}</td><td>${event.hexId}</td><td>${event.otherPlayerName ? escapeHtml(event.otherPlayerName) : ''}</td><td>${event.details.litersLost ? `${event.details.litersLost}L burned` : escapeHtml(event.details.name ?? event.details.type ?? '')}</td></tr>`).join('');
  const stats = field.stats ? `<section class="oil-report"><p class="eyebrow">Live intelligence</p><h2>${escapeHtml(catalogGadgetForBehavior(catalog, 'ledger').displayName)} field report</h2><div class="table-scroll"><table><thead><tr><th>Miner</th><th>Machines</th><th>Oil</th><th>Pumping</th><th>Packing</th><th>Barrels</th></tr></thead><tbody>${field.stats.map((entry) => `<tr><td><a class="text-link" href="/miners/${encodeURIComponent(entry.name)}">${escapeHtml(entry.name)}</a> (${entry.meldCount})</td><td>${entry.machines}</td><td>${entry.oilLiters}L</td><td>${entry.pumpingLitersPerHour}L/h</td><td>${entry.packingLitersPerHour}L/h</td><td>${entry.barrels}</td></tr>`).join('')}</tbody></table></div></section>` : '';
  const serializedState = escapeHtml(JSON.stringify(state));
  const litersPerBarrel = Number(catalog.settings.oil_units_per_barrel)
    / Number(catalog.settings.oil_units_per_liter);
  return `<article class="oil-page"><section class="page-title"><div><p class="eyebrow">${escapeHtml(field.mapName)} regional operation</p><h1>Oil Field</h1></div><p>Pump, pipe, and pack ${formatGold(litersPerBarrel)} litres into each barrel of ${escapeHtml(labels.oil)}. Build a network, defend it, and bring the oil home.</p></section>
    <dl class="oil-facts"><div><dt>Field status</dt><dd><span class="oil-live-status"><i aria-hidden="true"></i><span class="active-state">Field access active</span></span></dd></div><div><dt>Regional base</dt><dd>${escapeHtml(field.mapName)} · ${escapeHtml(cityName)}</dd></div><div><dt>Machine board</dt><dd>${field.hexes.length} hexes · radius ${Number(catalog.settings.oil_field_max_radius)}</dd></div></dl>
    <section class="oil-briefing"><div><p class="eyebrow">Deployment brief</p><p>The field is based in <strong>${escapeHtml(cityName)}</strong>. Drag a machine from the rack onto a hex, rotate it, then deploy, replace, queue, or bomb.</p></div><dl class="oil-aircraft"><div><dt>${escapeHtml(labels.helicopter)}</dt><dd class="${field.hasHelicopter ? 'ready' : 'missing'}"><strong>${field.hasHelicopter ? 'Ready' : 'Missing'}</strong><small>Outer-row deployment</small></dd></div><div><dt>${escapeHtml(labels.searchPlane)}</dt><dd class="${field.hasSearchPlane ? 'ready' : 'limited'}"><strong>${field.hasSearchPlane ? 'All oil revealed' : 'Rival oil hidden'}</strong><small>Field intelligence</small></dd></div><div><dt>${escapeHtml(labels.bomber)}</dt><dd class="${field.hasBomber ? 'ready' : 'missing'}"><strong>${field.hasBomber ? 'Ready' : 'Missing'}</strong><small>Bomb delivery</small></dd></div></dl></section>
    <section class="oil-original-panel" aria-labelledby="oil-board-heading"><aside class="oil-legend" aria-labelledby="oil-legend-heading"><strong id="oil-legend-heading" class="oil-legend-title">Legend</strong><div class="oil-legend-items"><span class="oil-key oil-key-own">Red = your machines</span><span class="oil-key oil-key-rival">Green = other miners&rsquo; machines</span><span class="oil-key oil-key-build">Blue = buildable</span><span class="oil-key oil-key-heli">${escapeHtml(labels.helicopter)} row</span><span class="oil-key oil-key-oil">${escapeHtml(labels.oil)}</span><span class="oil-key oil-key-spill">${escapeHtml(labels.oil)} spill</span><span class="oil-key oil-key-closed">Unavailable</span></div></aside>
      <div class="oil-board-heading"><div><p class="eyebrow">MT2 // Regional machine grid</p><h2 id="oil-board-heading">Machine field</h2><p>Original vector machines · live power, flow, packing, and combat effects</p></div><div class="oil-board-controls" role="group" aria-label="Oil Field display controls"><button type="button" id="oil-toggle-renderer" title="Switch Oil Field renderer">Renderer: SVG.js</button><button type="button" id="oil-toggle-queued">Show queued</button><button type="button" id="oil-toggle-animation">Pause animation</button><button type="button" id="oil-toggle-colors">Rarity colours</button><button type="button" id="oil-toggle-volume-labels" aria-pressed="false">Hide oil volume labels</button></div></div>
      <p id="oil-board-status" class="oil-board-status" role="status">Loading the original Oil Field…</p>
      <div id="oil-board-navigation" class="oil-board-navigation"><p id="oil-board-help">Pan or scroll to explore the field. Select a rack machine, then select a hex to deploy it.</p><button type="button" id="oil-center-board" class="secondary" aria-controls="board">Centre field</button></div>
      <div class="oil-field-board-shell" data-hex-count="${field.hexes.length}" data-machine-count="${field.hexes.filter((hex) => hex.machine).length}"><div id="board" aria-label="Interactive Oil Field hex board" aria-describedby="oil-board-help"></div></div>
      <textarea id="oil-field-state" hidden>${serializedState}</textarea>
    </section>
    ${stats}
    <section class="oil-instructions"><p class="eyebrow">Operator handbook</p><h2>Instructions</h2><ol><li>Drag a machine onto a hex, or click it and then click its destination.</li><li>Use the on-board L and R controls before deploying. Once deployed or queued, it cannot be moved or rotated.</li><li>Blue hexes are buildable. The outer blue row requires a ${escapeHtml(labels.helicopter)} in ${escapeHtml(cityName)}.</li><li>Drop onto your own machine to replace it immediately or queue its successor.</li><li>Drop ${escapeHtml(bombNames)} bombs onto a machine or oil spill; a ${escapeHtml(labels.bomber)} is required.</li><li>Click any hex to open its full summary. Only ${escapeHtml(packerNames)} can release completed barrels. Barrels stolen by ${escapeHtml(craneNames)} remain on their hex when you replace the machine with one of those packing machines.</li></ol></section>
    <section class="oil-events"><header><div><p class="eyebrow">Local activity log</p><h2>Your field events</h2></div><p>Deployments, replacements, attacks, and machine failures from this regional board.</p></header><div class="table-scroll"><table><thead><tr><th>When</th><th>Event</th><th>Hex</th><th>Other miner</th><th>Details</th></tr></thead><tbody>${eventRows || '<tr><td colspan="5">No field events yet.</td></tr>'}</tbody></table></div></section>
    <script src="/js/raphael2.1.2.js" defer></script><script src="/node/svgjs.min.js?v=3.2.7" defer></script><script src="/node/oil-field-renderers.js?v=20260827a" defer></script><script src="/js/machines11.js?v=20260827a" defer></script><script src="/node/oil-field.js?v=20260903a" defer></script></article>`;
}

function unavailableOilFieldPage(player) {
  return `<article class="oil-page oil-page-unavailable"><section class="page-title"><div><p class="eyebrow">Regional industry</p><h1>Oil Field</h1></div><p>Oil Fields are independent regional operations, and only around half of the world’s regions contain one.</p></section>
    <dl class="oil-facts"><div><dt>Field status</dt><dd><span class="oil-offline-status"><i aria-hidden="true"></i>Unavailable</span></dd></div><div><dt>Current region</dt><dd>${escapeHtml(player.mapName)}</dd></div><div><dt>Next move</dt><dd>Find a field region</dd></div></dl>
    <section class="empty-state oil-empty-state"><p class="eyebrow">No local operation</p><h2>No Oil Field in ${escapeHtml(player.mapName)}</h2><p>Travel to a region with an Oil Field to deploy machines, inspect its board, or collect barrels. Each field has its own hexes, machines, oil, and events.</p><a class="button" href="/map">Open world map</a></section></article>`;
}

function cityExplorePage(state) {
  const data = JSON.stringify(state).replace(/</g, '\\u003c');
  const regionClass = /^[a-z0-9-]+$/.test(state.city.mapSlug)
    ? ` region-${state.city.mapSlug}` : '';
  const visitedLocations = new Set(state.progress.visitedLocationKeys);
  const pointDirectory = state.interior.points.map((point) =>
    `<li${visitedLocations.has(point.key) ? ' class="visited"' : ''}><span aria-hidden="true">${escapeHtml(point.glyph)}</span><strong>${escapeHtml(point.label)}</strong><small>${escapeHtml(point.description)}</small></li>`
  ).join('');
  return `<article class="city-explore-page${regionClass}" style="--city-accent:${escapeHtml(state.interior.appearance.accent)}">
    <section class="page-title"><div><p class="eyebrow">${escapeHtml(state.city.mapName)} · On foot</p><h1>Walk ${escapeHtml(state.city.cityName)}</h1></div><p>You stay at the centre. Click an open street or destination and the city moves around you.</p></section>
    <section class="city-explorer" aria-labelledby="city-explorer-heading">
      <header class="city-explorer-header"><div><p class="eyebrow">${escapeHtml(state.interior.appearance.district)} · Saved progress</p><h2 id="city-explorer-heading">${escapeHtml(state.city.cityName)} street plan</h2></div><dl><div><dt>Steps</dt><dd id="city-explore-steps">${Number(state.steps).toLocaleString('en-GB')}</dd></div><div><dt>Notices read</dt><dd id="city-explore-notices">${state.progress.signsRead}/${state.progress.totalSigns}</dd></div><div><dt>Locations</dt><dd id="city-explore-locations">${state.progress.locationsVisited}/${state.progress.totalLocations}</dd></div><div><dt>Street Ore</dt><dd id="city-explore-scraps">${state.progress.scrapsCollected}/${state.progress.totalScraps}</dd></div><div${state.powerRemainingSteps ? ' class="is-active"' : ''}><dt>Ore charge</dt><dd id="city-explore-power">${state.powerRemainingSteps ? `${state.powerRemainingSteps} steps` : 'Dormant'}</dd></div></dl></header>
      <div class="city-explorer-stage">
        <div class="city-explore-map-wrap"><canvas id="city-explore-map" width="900" height="720" tabindex="0" aria-label="Interactive city street plan. Click an open road to walk there."></canvas><div id="city-street-burst" class="city-street-burst" role="alert" aria-live="assertive" hidden><strong id="city-street-burst-shout"></strong><span id="city-street-burst-text"></span></div><p class="city-explore-hint">Click a road to walk. Click a sign to approach and read it. Click a marked building to visit it.</p></div>
        <aside id="city-explore-location" class="city-explore-location" aria-live="polite"><p class="eyebrow">Current position</p><h3>Between the streets</h3><p>Choose a marked destination, notice, or open passage.</p></aside>
      </div>
      <div id="city-explore-status" class="city-explore-status" role="status" aria-live="polite">Ready to walk.</div>
      <p class="city-explore-rewards">Ore scraps glint all through the streets. Charged Ore cores briefly make roaming Dwarves and the restless dead edible; they reform later. The city also pays 20 scraps for reading every notice and 20 for visiting every marked location. Read every notice, visit every location, and collect every Street Ore scrap to clear a Completionist Stone for this city.</p>
      <details class="city-explore-directory"><summary>City directory</summary><ul>${pointDirectory}</ul></details>
      <div class="city-explore-legend" aria-label="Map legend"><span class="player">You</span><span class="dwarf">Roaming Dwarf</span><span class="dead">Restless dead</span><span class="destination">Destination</span><span class="sign">Readable sign</span><span class="scrap">Ore scrap</span><span class="power-up">Charged Ore core</span><span class="street">Open street</span></div>
    </section>
    <dialog id="city-sign-dialog" class="city-explore-dialog"><form method="dialog"><button class="dialog-close" aria-label="Close sign">×</button></form><p class="eyebrow">Street notice</p><h2 id="city-sign-title">Notice</h2><p id="city-sign-text"></p><p id="city-sign-progress" class="city-sign-progress"></p></dialog>
    <dialog id="city-encounter-dialog" class="city-explore-dialog city-encounter-dialog" aria-labelledby="city-encounter-title"><p class="eyebrow">Roguelike encounter</p><h2 id="city-encounter-title">Something blocks the way</h2><p id="city-encounter-text"></p><div id="city-encounter-options" class="city-encounter-options"></div><div id="city-encounter-outcome" class="city-encounter-outcome" hidden></div></dialog>
    <script id="city-explore-data" type="application/json">${data}</script><script src="/node/city-explore.js?v=20260902a" defer></script>
  </article>`;
}

function cityCivicPlacePage(state, placeKey) {
  const point = state.interior.points.find((entry) => entry.key === placeKey);
  if (!point) throw new Error('That place is not part of this city.');
  const mapSlug = /^[a-z0-9-]+$/.test(state.city.mapSlug) ? state.city.mapSlug : 'aso';
  if (placeKey === 'dwarf-park') {
    const parkArt = renderDwarfParkArt({
      cityName: state.city.cityName, mapSlug, appearance: state.interior.appearance
    });
    return `<article class="city-civic-page city-park-page region-${escapeHtml(mapSlug)}" style="--city-accent:${escapeHtml(state.interior.appearance.accent)}">
      <section class="page-title"><div><p class="eyebrow">${escapeHtml(state.city.cityName)} · On foot</p><h1>${escapeHtml(point.label)}</h1></div><a class="text-link" href="/explore">Return to the streets →</a></section>
      <section class="city-civic-scene city-park-scene" aria-label="Young Dwarves playing in ${escapeHtml(state.city.cityName)}">${parkArt}<div class="city-civic-copy"><p class="eyebrow">Public green · Supervision withdrawn</p><h2>The nursery of future public hazards.</h2><p>Under the respectable trees, young Dwarves rehearse the habits they will take onto the streets: biting whatever holds still, lifting purses, arranging ambushes, and fleeing with the evidence. The Council calls this unstructured play.</p></div></section>
      <section class="city-civic-note park-tendency-report"><div><p class="eyebrow">Observed programme</p><h2>Viciousness begins at playtime.</h2><p>This remains a civic park, not a hunting ground. Keep your hands, pockets, and loose Things where you can see them.</p></div><ul><li><strong>CHOMP!</strong><span>Bite technique and structural gnawing</span></li><li><strong>YOINK!</strong><span>Pickpocket relays with immediate escape</span></li><li><strong>THWACK!</strong><span>Improvised weapons and elevated ambushes</span></li><li><strong>PING!</strong><span>Long-range disrespect for posted rules</span></li></ul></section>
    </article>`;
  }
  const landmark = state.interior.appearance.landmark;
  const kind = /^[a-z]+$/.test(landmark.kind) ? landmark.kind : 'spire';
  const landmarkArt = renderCityLandmarkArt(landmark, state.interior.appearance.signature);
  return `<article class="city-civic-page city-landmark-page region-${escapeHtml(mapSlug)}" style="--city-accent:${escapeHtml(state.interior.appearance.accent)}">
    <section class="page-title"><div><p class="eyebrow">${escapeHtml(state.city.cityName)} · Civic architecture</p><h1>${escapeHtml(landmark.name)}</h1></div><a class="text-link" href="/explore">Return to the streets →</a></section>
    <section class="city-civic-scene city-landmark-scene landmark-${kind}" aria-label="${escapeHtml(landmark.name)}">${landmarkArt}<div class="city-civic-copy"><p class="eyebrow">One of one · ${escapeHtml(state.interior.appearance.district)}</p><h2>${escapeHtml(landmark.name)}</h2><p>${escapeHtml(landmark.description)}</p></div></section>
    <section class="city-civic-note"><p class="eyebrow">Materials register</p><h2>Built from ${escapeHtml(landmark.material)}.</h2><p>No other city shares this exact civic work. Local surveyors consider imitation both bad manners and an unstable load.</p></section>
  </article>`;
}

function cityHomePage(home, catalog, player) {
  const mapSlug = /^[a-z0-9-]+$/.test(home.city.mapSlug) ? home.city.mapSlug : 'aso';
  const unreadMessages = Math.max(0, Number(player.unreadMessages ?? 0));
  const legendaryThings = catalog.items.filter((item) =>
    Number(item.rarity) === 6 && !item.damaged).sort((first, second) =>
    first.name.localeCompare(second.name) || first.id - second.id);
  const dreamThingsData = JSON.stringify(legendaryThings.map((item) => ({
    id: item.id, name: item.name, icon: item.icon
  }))).replace(/</g, '\\u003c');
  const initialDreamThings = Array.from({ length: Math.min(8, legendaryThings.length) },
    (_, index) => legendaryThings[index]);
  const dreamSlots = initialDreamThings.map((item, index) =>
    `<div class="home-dream-thing dream-slot-${index + 1}" data-dream-slot><img src="${escapeHtml(item.icon)}" alt="${escapeHtml(item.name)}"><span>${escapeHtml(item.name)}</span></div>`).join('');
  const bed = (dreaming = false) => `<div class="home-bed${dreaming ? ' home-bed-dreaming' : ''}" aria-hidden="true"><img src="/node/home/${dreaming ? 'bed-dream' : 'bed'}.svg" alt=""></div>`;
  const itemOptions = home.availableItems.map((item) => {
    const rarity = catalogRarityName(catalog, item.rarity);
    return `<option value="${item.itemId}">${escapeHtml(item.name)} · ${escapeHtml(rarity)} · ${item.quantity} stored</option>`;
  }).join('');
  const displaySlots = home.slots.map(({ slot, item }) => {
    const exhibit = item
      ? `<a class="home-exhibit rarity-${item.rarity}" href="/items/${item.itemId}"><img src="${escapeHtml(item.icon)}" alt=""><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(catalogRarityName(catalog, item.rarity))}</small></a><form method="post" action="/explore/home/display"><input type="hidden" name="slot" value="${slot}"><input type="hidden" name="itemId" value=""><button class="secondary">Return to storage</button></form>`
      : '<div class="home-empty-plinth"><span aria-hidden="true">◇</span><strong>Empty plinth</strong><small>Choose something worth looking at.</small></div>';
    const chooser = itemOptions
      ? `<form class="home-display-picker" method="post" action="/explore/home/display"><input type="hidden" name="slot" value="${slot}"><label>${item ? 'Replace exhibit' : 'Choose exhibit'}<select name="itemId" required><option value="">Select a thing</option>${itemOptions}</select></label><button>${item ? 'Replace' : 'Display'}</button></form>`
      : '<p class="muted">There is nothing loose in local storage to display.</p>';
    return `<article class="home-display-slot"><p class="eyebrow">Display ${slot} of 3</p>${exhibit}${chooser}</article>`;
  }).join('');
  return `<article class="city-home-page region-${escapeHtml(mapSlug)}" style="--home-map:url('/node/maps/${escapeHtml(mapSlug)}.png')">
    <section class="page-title"><div><p class="eyebrow">${escapeHtml(home.city.cityName)} · Private address</p><h1>${escapeHtml(player.name)}’s home</h1></div><a class="text-link" href="/explore">Return to the streets →</a></section>
    <section class="city-home-interior"><header><p class="eyebrow">Council-standard dwelling</p><h2>A room that is yours</h2><p>Your dissolved estate paid for the walls. What happens inside them is, within several regulations, your concern.</p></header><div class="home-floorplan"><section class="home-storage-room"><span class="home-room-mark" aria-hidden="true">▤</span><p class="eyebrow">Large storage</p><h3>${home.storageThingCount.toLocaleString('en-GB')} things · ${home.storageTypeCount.toLocaleString('en-GB')} types</h3><p>Open the local shelves to manage everything kept in ${escapeHtml(home.city.cityName)}.</p><a class="text-link" href="/inventory">Access your things →</a></section><section class="home-bed-room"><div class="home-bed-nook">${bed()}</div><div class="home-bed-copy"><p class="eyebrow">Your bed</p><h3>Lie down. See what finds you.</h3><p>A real mattress, a patched Council quilt, and dreams considerably less regulated than the waking world.</p><button id="home-dream-open" type="button" aria-haspopup="dialog">Lie down and dream</button></div></section><section class="home-mail-room"><a class="home-mail-terminal" href="/messages"><span class="home-mail-lamp" aria-hidden="true"></span><span class="home-mail-screen"><small>Council mail terminal</small><strong>${unreadMessages ? `${unreadMessages} unread message${unreadMessages === 1 ? '' : 's'}` : 'Your messages'}</strong><em>Open inbox →</em></span><span class="home-mail-slot" aria-hidden="true"></span></a><div><p class="eyebrow">At the foot of the bed</p><h3>Your private correspondence</h3><p>Read Council orders, completion reports, Dwarf findings, and messages from other miners without leaving your room.</p></div></section></div></section>
    <section class="home-gallery"><header><div><p class="eyebrow">Small display area</p><h2>Things worth admiring</h2></div><p>Displayed things remain yours and still count toward storage capacity, but cannot be traded, recycled, or fitted until returned to storage.</p></header><div class="home-display-grid">${displaySlots}</div></section>
    <section class="home-upgrade-tease"><div><p class="eyebrow">A note from the Property Office</p><h2>You could live considerably better than this.</h2><p>More rooms. More display space. Windows with views not selected by the Council. Better dwellings will become available to buy—once the surveyors agree which walls are load-bearing.</p></div><button type="button" disabled>Dwelling market · Coming soon</button></section>
    <dialog id="home-dream-dialog" class="home-dream-dialog" aria-labelledby="home-dream-title"><div class="home-dream-world"><header><div><p class="eyebrow">Somewhere beneath ${escapeHtml(home.city.cityName)}</p><h2 id="home-dream-title">${escapeHtml(player.name)} dreams in Legendary</h2><p id="home-dream-whisper" aria-live="polite">The finest Things in the world begin to drift through the room.</p></div><form method="dialog"><button class="secondary" value="wake">Wake up</button></form></header><div class="home-dream-stars" aria-hidden="true"></div><div class="home-dream-things">${dreamSlots}</div><div class="home-dream-bed">${bed(true)}</div><p class="home-dream-caption">Nothing here can be taken. That has never stopped a miner wanting it.</p></div></dialog>
    <script id="home-dream-data" type="application/json">${dreamThingsData}</script><script src="/node/home-dream.js?v=20260831a" defer></script>
  </article>`;
}

function cityBarMessageRow(message, playerId) {
  const color = /^[0-9a-f]{6}$/i.test(String(message.color))
    ? String(message.color).toLowerCase() : '55666b';
  const sent = new Date(Number(message.createdAt));
  return `<article id="bar-message-${Number(message.id)}" class="bar-message${
    Number(message.playerId) === Number(playerId) ? ' is-own' : ''
  }" style="--bar-speaker:#${color}" data-bar-message-id="${Number(message.id)}"><a class="bar-speaker-link" href="/miners/${encodeURIComponent(message.playerName)}">${escapeHtml(message.playerName)}</a><p>${escapeHtml(message.body)}</p><time datetime="${sent.toISOString()}" title="${escapeHtml(sent.toLocaleString('en-GB'))}">${escapeHtml(sent.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }))}</time></article>`;
}

function cityBarPage(state, player, catalog) {
  const mapSlug = /^[a-z0-9-]+$/.test(state.city.mapSlug) ? state.city.mapSlug : 'aso';
  const rows = state.messages.map((message) =>
    cityBarMessageRow(message, player.id)).join('');
  const participants = state.participants.map((participant) =>
    `<li data-bar-participant-id="${participant.playerId}"><i aria-hidden="true"></i><a class="bar-person-link" href="/miners/${encodeURIComponent(participant.playerName)}">${escapeHtml(participant.playerName)}</a>${participant.self ? '<span>You</span>' : '<span>At the bar</span>'}</li>`).join('');
  const others = Math.max(0, state.participants.length - 1);
  const data = JSON.stringify({
    visitToken: state.visitToken,
    playerId: Number(player.id),
    messages: state.messages,
    participants: state.participants,
    messageMaxLength: Number(catalog.settings.chat_message_max_length)
  }).replace(/</g, '\\u003c');
  const composer = player.chatBanned
    ? '<div class="bar-compose bar-compose-locked"><strong>Conversation disabled</strong><span>Your account is not permitted to use chat.</span></div>'
    : `<form id="bar-compose" class="bar-compose" method="post" action="/explore/bar/messages"><input type="hidden" name="visitToken" value="${escapeHtml(state.visitToken)}"><label for="bar-message"><span>Speak to the room</span><input id="bar-message" name="body" maxlength="${Number(catalog.settings.chat_message_max_length)}" placeholder="Keep this between us…" autocomplete="off" required></label><button>Say it</button></form>`;
  return `<article class="city-bar-page region-${escapeHtml(mapSlug)}" style="--bar-map:url('/node/maps/${escapeHtml(mapSlug)}.png')">
    <section class="page-title"><div><p class="eyebrow">${escapeHtml(state.city.cityName)} · On foot</p><h1>The ${escapeHtml(state.city.cityName)} Bar</h1></div><a class="text-link" href="/explore">Return to the streets →</a></section>
    <section class="city-bar-interior" aria-label="The bar in ${escapeHtml(state.city.cityName)}"><div class="bar-backdrop"><span class="bar-lamp bar-lamp-left"></span><span class="bar-lamp bar-lamp-right"></span><span class="bar-bottles"></span><span class="bar-counter"></span><span class="bar-stool bar-stool-one"></span><span class="bar-stool bar-stool-two"></span><span class="bar-stool bar-stool-three"></span></div><div class="bar-intro"><p class="eyebrow">Local room · Doors closed</p><h2>A quiet place to settle something serious.</h2><p>Find the people you agreed to meet. What is said here stays out of Worldwire and every other city’s bar.</p></div><dl><div><dt>Inside now</dt><dd id="bar-presence-count">${state.participants.length}</dd></div><div><dt>Others here</dt><dd id="bar-other-count">${others}</dd></div><div><dt>Reach</dt><dd>This room only</dd></div></dl></section>
    <div class="bar-workspace"><section class="bar-conversation" aria-labelledby="bar-conversation-heading"><header><div><p class="eyebrow">At this table</p><h2 id="bar-conversation-heading">Private local conversation</h2></div><span id="bar-live-status" class="bar-live-status" role="status" aria-live="polite">Listening</span></header><div id="bar-chat-log" class="bar-chat-log" role="log" aria-live="polite" aria-relevant="additions text" tabindex="0">${rows || '<div class="bar-chat-empty" data-bar-empty><strong>Nobody has said anything since you arrived.</strong><span>This is an excellent opportunity to look mysterious.</span></div>'}</div>${composer}</section>
      <aside class="bar-presence"><header><p class="eyebrow">Present company</p><h2>In the bar</h2></header><ul id="bar-participants">${participants}</ul><section class="bar-privacy-note"><strong>Presence is the lock.</strong><p>Only miners currently inside this exact city bar can see or send these messages. Arrivals cannot read what was said before they entered; leaving closes the conversation immediately.</p></section><form method="post" action="/explore/bar/leave"><input type="hidden" name="visitToken" value="${escapeHtml(state.visitToken)}"><button class="secondary">Leave for the street</button></form></aside></div>
    <script id="bar-chat-data" type="application/json">${data}</script><script src="/node/bar-chat.js?v=20260831a" defer></script>
  </article>`;
}

function cityTransportFacilityPage(player, catalog, vehicles, facilityKey, thiefBase = null) {
  const facilities = {
    departures: {
      behavior: 'land', eyebrow: 'Road transport', title: 'Vehicle departure area',
      subtitle: 'Dispatch yard', empty: 'No road vehicles are standing in the departure lanes.',
      description: 'Engines idle between painted bays while loaders marshal cargo for the open roads.'
    },
    harbour: {
      behavior: 'sea', eyebrow: 'Waterfront', title: 'Harbour', subtitle: 'Quayside traffic',
      empty: 'No ships are tied up at the quays.',
      description: 'Cranes, harbour bells, and black water mark the working edge of the city.'
    },
    airfield: {
      behavior: 'air', eyebrow: 'Flight operations', title: 'Airfield', subtitle: 'Runway control',
      empty: 'No aircraft are parked on the apron.',
      description: 'Runway lamps lead away through the weather. Ground crews watch every open air route.'
    }
  };
  const facility = facilities[facilityKey];
  if (!facility) throw new Error('Unknown city transport facility.');
  const routeType = catalogRoleId(catalog, 'route_type_ids', facility.behavior);
  const city = catalogCityForId(catalog, player.cityId);
  const routes = catalog.routes.filter((route) => route.open
    && Number(route.type) === routeType
    && (Number(route.city1Id) === city.id || Number(route.city2Id) === city.id));
  const localVehicles = vehicles.filter((vehicle) => vehicle.status === 'idle'
    && Number(vehicle.cityId) === city.id && Number(vehicle.routeType) === routeType);
  const underway = vehicles.filter((vehicle) => vehicle.status === 'traveling'
    && Number(vehicle.routeType) === routeType
    && (Number(vehicle.originCityId) === city.id || Number(vehicle.destinationCityId) === city.id));
  const routeRows = routes.map((route) => {
    const selfRoute = Number(route.city1Id) === Number(route.city2Id);
    const destinationId = Number(route.city1Id) === city.id
      ? Number(route.city2Id) : Number(route.city1Id);
    const destination = selfRoute ? 'Ore-thief operation'
      : vehicleRouteDestinationLabel(player, catalog, city.id, destinationId);
    return `<li><span>${selfRoute ? 'MISSION' : 'OPEN'}</span><strong>${escapeHtml(destination)}</strong><small>${selfRoute ? 'Search, bombing, and recovery' : `${Number(route.length).toLocaleString('en-GB')} km`}</small></li>`;
  }).join('');
  const vehicleRows = localVehicles.map((vehicle) =>
    `<li><img src="${escapeHtml(vehicle.icon)}" alt=""><div><strong>${escapeHtml(vehicle.name)}</strong><span>${escapeHtml(vehicle.itemName)} · ${Number(vehicle.speed).toLocaleString('en-GB')} km/h · ${vehicle.cargoSize}/${vehicle.capacity} capacity</span></div><a class="text-link" href="/vehicles/${vehicle.id}">Load and dispatch →</a></li>`
  ).join('');
  const underwayRows = underway.map((vehicle) => {
    const outbound = Number(vehicle.originCityId) === city.id;
    const otherCityId = outbound ? vehicle.destinationCityId : vehicle.originCityId;
    const direction = Number(otherCityId) === city.id
      ? oreThiefAircraftMissionCopy(vehicle, catalog).underway
      : `${outbound ? 'to' : 'from'} ${cityChoiceLabel(catalog, otherCityId)}`;
    return `<li><strong>${escapeHtml(vehicle.name)}</strong><span>${escapeHtml(direction)} · arrives ${new Date(vehicle.arrivesAt).toLocaleString('en-GB')}</span><a class="text-link" href="/vehicles/${vehicle.id}">Track →</a></li>`;
  }).join('');
  return `<article class="city-facility-page facility-${facilityKey}">
    <section class="page-title"><div><p class="eyebrow">${escapeHtml(city.name)} · On foot</p><h1>${escapeHtml(facility.title)}</h1></div><a class="text-link" href="/explore">Return to the streets →</a></section>
    <section class="city-facility-scene" aria-label="${escapeHtml(facility.title)} view"><div class="facility-horizon"></div><div class="facility-track"></div><div class="facility-marker" aria-hidden="true">${facility.behavior === 'land' ? 'V' : facility.behavior === 'sea' ? 'H' : 'A'}</div><div><p class="eyebrow">${escapeHtml(facility.eyebrow)}</p><h2>${escapeHtml(facility.subtitle)}</h2><p>${escapeHtml(facility.description)}</p></div><dl><div><dt>Open routes</dt><dd>${routes.length}</dd></div><div><dt>On site</dt><dd>${localVehicles.length}</dd></div><div><dt>Underway</dt><dd>${underway.length}</dd></div></dl></section>
    ${facilityKey === 'airfield' ? oreThiefOperationPanel(player, catalog, vehicles, thiefBase) : ''}
    <div class="city-facility-columns"><section><p class="eyebrow">Live board</p><h2>Departures from ${escapeHtml(city.name)}</h2><ul class="facility-route-board">${routeRows || '<li><strong>No open routes</strong><small>The board is quiet.</small></li>'}</ul></section><section><p class="eyebrow">Your fleet</p><h2>Ready here</h2><ul class="facility-vehicle-list">${vehicleRows || `<li><span>${escapeHtml(facility.empty)}</span><a class="text-link" href="/vehicles">Open the full fleet →</a></li>`}</ul></section></div>
    ${underwayRows ? `<section class="facility-underway"><p class="eyebrow">Traffic</p><h2>Approaching and departing</h2><ul>${underwayRows}</ul></section>` : ''}
  </article>`;
}

function mapPage(player, catalog, knownCityIds, requestedMapSlug = '', oilFieldCityIds = []) {
  const currentCity = catalogCityForId(catalog, player.cityId);
  const playerMap = catalog.maps.find((map) => map.id === currentCity.mapId)
    ?? { id: currentCity.mapId, name: 'Gallego', slug: 'gallego' };
  const known = new Set(knownCityIds);
  const visibleMapIds = new Set(catalog.cities.filter((city) => known.has(city.id)).map((city) => city.mapId));
  visibleMapIds.add(playerMap.id);
  const requestedMap = catalog.maps.find((map) => map.slug === requestedMapSlug
    && visibleMapIds.has(map.id));
  const currentMap = requestedMap ?? playerMap;
  const mapCities = catalog.cities.filter((city) => city.mapId === currentMap.id);
  const oilFieldCities = new Set(oilFieldCityIds.map(Number));
  const capitalCityId = Number(currentMap.capitalCityId);
  const capitalCity = mapCities.find((city) => city.id === capitalCityId);
  if (!Number.isInteger(capitalCityId) || !capitalCity) {
    throw new Error(`Missing regional capital for map ${currentMap.id}.`);
  }
  const mapCityIds = new Set(mapCities.map((city) => city.id));
  const mapRoutes = catalog.routes.filter((route) => route.open
    && mapCityIds.has(route.city1Id) && mapCityIds.has(route.city2Id));
  const mapMineTypes = new Map(mapCities.flatMap((city) =>
    catalog.mineTypesByCity.get(city.id).map((mineType) => [mineType.id, mineType])));
  const gatewayRoutes = catalog.routes.filter((route) => route.interMap
    && (mapCityIds.has(route.city1Id) || mapCityIds.has(route.city2Id)));
  const interMapRoutes = gatewayRoutes.filter((route) => route.open);
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
  const mapBackgroundFilename = `${currentMap.slug}.png`;
  const hasDimensionBackground = /^[a-z0-9-]+$/.test(currentMap.slug)
    && fs.existsSync(path.join(PUBLIC_ROOT, 'img', mapBackgroundFilename));
  const mapBackgroundPath = hasDimensionBackground
    ? `/node/maps/${mapBackgroundFilename}` : '/node/map-background.png';
  const terrain = `<image class="map-background" href="${escapeHtml(mapBackgroundPath)}" x="0" y="0" width="900" height="600" preserveAspectRatio="xMidYMid slice" />`;
  const cityNodes = mapCities.map((city) => {
    const position = positions.get(city.id);
    const cityState = city.id === player.cityId ? 'current' : known.has(city.id) ? 'known' : 'unknown';
    const isCapital = city.id === capitalCityId;
    const cityRole = isCapital ? 'regional capital' : 'outpost';
    const availableMines = availableMinesForCity(city.id);
    const hasOilField = oilFieldCities.has(city.id);
    const resourceCount = availableMines.length + (hasOilField ? 1 : 0);
    const resourceWidth = Math.max(0, resourceCount * 29 - 3);
    const trayWidth = Math.max(40, resourceWidth + 12);
    const iconStart = -resourceWidth / 2;
    const mineIcons = availableMines.map((mineType, index) => {
      const icon = mineMapIconPath(mineType.id);
      if (!icon) throw new Error(`Missing map symbol for mine type ${mineType.id}.`);
      return `<g class="map-resource-icon map-mine-icon" data-mine-type-id="${mineType.id}" transform="translate(${iconStart + index * 29} 31)"><title>${escapeHtml(`${mineType.name} Mine available in ${city.name}`)}</title><circle class="map-resource-token" cx="13" cy="13" r="12" /><image href="${escapeHtml(icon)}" x="1" y="1" width="24" height="24" preserveAspectRatio="xMidYMid meet" /></g>`;
    }).join('');
    const oilFieldIcon = hasOilField
      ? `<g class="map-resource-icon map-oil-field-icon" data-oil-field="true" transform="translate(${iconStart + availableMines.length * 29} 31)"><title>${escapeHtml(`Oil Field in ${city.name}`)}</title><circle class="map-resource-token" cx="13" cy="13" r="12" /><image href="${OIL_FIELD_MAP_ICON_PATH}" x="1" y="1" width="24" height="24" preserveAspectRatio="xMidYMid meet" /></g>`
      : '';
    const mineNames = availableMines.map((mineType) => `${mineType.name} Mine`).join(', ');
    const label = escapeHtml(`${city.name}: ${cityState} ${cityRole}. Mines available: ${mineNames || 'none'}${hasOilField ? '. Oil Field regional operation' : ''}`);
    const gateway = gatewayRoutes.some((route) =>
      route.city1Id === city.id || route.city2Id === city.id);
    const cityNameplateWidth = Math.max(88, Math.ceil([...city.name].length * 7.8 + 32));
    const capitalMarker = isCapital
      ? `<text class="map-capital-star-marker" text-anchor="middle" y="5">${CAPITAL_CITY_ICON}</text>`
      : '';
    const capitalRank = isCapital
      ? `<path class="map-city-rank-plate" d="M-42 -78h84l-5 14h-74z" /><text class="map-city-rank" text-anchor="middle" y="-68.5">${CAPITAL_CITY_ICON} Capital</text>`
      : '';
    const plateX = -cityNameplateWidth / 2;
    const plateRight = plateX + cityNameplateWidth;
    const platePath = `M${plateX + 6} -66H${plateRight - 6}L${plateRight} -60v20l-6 6H${plateX + 6}L${plateX} -40v-20z`;
    const inlayPath = `M${plateX + 8} -62H${plateRight - 8}L${plateRight - 4} -58v16l-4 4H${plateX + 8}L${plateX + 4} -42v-16z`;
    const oilFieldAttribute = hasOilField ? ' data-oil-field="true"' : '';
    const node = `<g class="map-city map-city-${cityState}${gateway ? ' map-city-gateway' : ''}${isCapital ? ' map-city-capital' : ''}" data-city-id="${city.id}"${oilFieldAttribute} transform="translate(${position.x} ${position.y})"><title>${label}</title><circle class="map-city-halo" r="25" /><circle class="map-city-pin" r="13" />${capitalMarker}<g class="map-city-label">${capitalRank}<path class="map-city-nameplate-shadow" d="${platePath}" transform="translate(3 3)" /><path class="map-city-nameplate" d="${platePath}" /><path class="map-city-nameplate-tail" d="M-6 -34h12L0 -29z" /><path class="map-city-nameplate-inlay" d="${inlayPath}" /><circle class="map-city-label-rivet" cx="${plateX + 10}" cy="-50" r="1.7" /><circle class="map-city-label-rivet" cx="${plateRight - 10}" cy="-50" r="1.7" /><text class="map-city-name" text-anchor="middle" y="-44.5">${escapeHtml(city.name)}</text></g><g class="map-city-resources"><rect class="map-city-resource-rack" x="${-trayWidth / 2}" y="27" width="${trayWidth}" height="34" rx="17" />${mineIcons}${oilFieldIcon}</g></g>`;
    return known.has(city.id) && city.id !== player.cityId
      ? `<a class="map-city-link" href="#city-${city.id}" data-city-select="/cities/${city.id}/select" aria-label="${label}. Switch to this city">${node}</a>`
      : `<g role="group" aria-label="${label}">${node}</g>`;
  }).join('');
  const routeSummaryRow = (route, city1 = cityChoiceLabel(catalog, route.city1Id),
    city2 = cityChoiceLabel(catalog, route.city2Id)) => {
    const type = routeType(route.type);
    return `<li class="route-summary route-${type.name}"><span>${type.label}</span><strong>${escapeHtml(city1)} ↔ ${escapeHtml(city2)}</strong><small>${route.length ? `${Number(route.length).toLocaleString('en-GB')} km` : 'Ore-thief operation'} · ${route.open ? 'open' : 'closed'}</small></li>`;
  };
  const routeRows = mapRoutes.map((route) => routeSummaryRow(route)).join('');
  const cities = mapCities.map((city) => {
    const availableMines = availableMinesForCity(city.id);
    const hasOilField = oilFieldCities.has(city.id);
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
    const mineList = availableMines.map((mineType) => {
      const icon = mineMapIconPath(mineType.id);
      if (!icon) throw new Error(`Missing map symbol for mine type ${mineType.id}.`);
      return `<li data-mine-type-id="${mineType.id}"><img src="${escapeHtml(icon)}" alt=""><span><strong>${escapeHtml(mineType.name)}</strong> Mine</span></li>`;
    }).join('');
    const isCapital = city.id === capitalCityId;
    const status = `${known.has(city.id)
      ? city.id === player.cityId ? 'Current city' : 'Discovered'
      : 'Undiscovered'} · ${isCapital ? 'regional capital' : 'outpost'}`;
    const capitalBadge = isCapital
      ? `<span class="city-capital-badge"><span aria-hidden="true">${CAPITAL_CITY_ICON}</span> Regional capital</span>` : '';
    const oilFieldOperation = hasOilField
      ? `<p class="city-oil-field-operation"><img src="${OIL_FIELD_MAP_ICON_PATH}" alt=""><span><strong>Oil Field</strong><small>Regional operation</small></span></p>`
      : '';
    const cityAction = city.id === player.cityId
      ? '<p class="city-walk-link"><a class="text-link" href="/explore">Explore this city on foot →</a></p>'
      : known.has(city.id) ? `<form method="post" action="/cities/${city.id}/select"><button>View this city</button></form>` : '';
    return `<article id="city-${city.id}" class="city-card ${known.has(city.id) ? 'known' : 'unknown'}${city.id === player.cityId ? ' current' : ''}${isCapital ? ' capital' : ''}" data-city-id="${city.id}"${hasOilField ? ' data-oil-field="true"' : ''}><header class="city-card-heading">${capitalBadge}<h3>${escapeHtml(city.name)}</h3></header><p class="city-status">${status}</p><p class="city-routes"><strong>Routes</strong>${offers}</p><h4>Mines available</h4><ul class="city-mines">${mineList || '<li>None</li>'}</ul>${oilFieldOperation}${cityAction}</article>`;
  }).join('');
  const mapTabs = catalog.maps.filter((map) => visibleMapIds.has(map.id))
    .map((map) => {
      const viewing = map.id === currentMap.id;
      const current = map.id === playerMap.id;
      const classes = [viewing ? 'active' : '', current ? 'current-world' : '']
        .filter(Boolean).join(' ');
      return `<a href="/map?world=${encodeURIComponent(map.slug)}" class="${classes}"${viewing ? ' aria-current="page"' : ''}>${escapeHtml(map.name)}</a>`;
    }).join('');
  const exits = interMapRoutes.map((route) => {
    const localIsFirst = mapCityIds.has(route.city1Id);
    const localCityId = localIsFirst ? route.city1Id : route.city2Id;
    const remoteCityId = localIsFirst ? route.city2Id : route.city1Id;
    const remote = catalogCityForId(catalog, remoteCityId);
    const remoteDiscovered = catalog.cities.some((city) => city.mapId === remote.mapId
      && known.has(city.id));
    const localLabel = cityChoiceLabel(catalog, localCityId);
    const remoteLabel = remoteDiscovered
      ? cityChoiceLabel(catalog, remoteCityId) : `${CAPITAL_CITY_ICON} Undiscovered region`;
    return localIsFirst
      ? routeSummaryRow(route, localLabel, remoteLabel)
      : routeSummaryRow(route, remoteLabel, localLabel);
  }).join('');
  const exitsSection = exits
    ? `<section><h2>Inter-map corridors</h2><ul class="route-list">${exits}</ul></section>` : '';
  const currentMapOilField = mapCities.find((city) => oilFieldCities.has(city.id));
  const oilFieldFact = currentMapOilField
    ? ` · <strong>Oil Field</strong> at ${escapeHtml(currentMapOilField.name)}` : '';
  return `<nav class="world-map-tabs" aria-label="World maps">${mapTabs}</nav><section class="page-title"><div><p class="eyebrow">${escapeHtml(currentMap.name)} region</p><h1>Cities</h1></div><p>Vehicles reveal cities and regions when they complete a route.</p></section><section class="map-opportunities" aria-labelledby="regional-capital-heading"><p class="eyebrow">${escapeHtml(currentMap.name)} opportunities · Shared regional base</p><h2 id="regional-capital-heading"><span class="city-capital-icon" title="Regional capital" aria-label="Regional capital">${CAPITAL_CITY_ICON}</span>${escapeHtml(capitalCity.name)} · Regional capital</h2><p>Every miner in ${escapeHtml(currentMap.name)} shares ${escapeHtml(capitalCity.name)} as their capital and home city in this region. Bring things here to Meld, build factories, hire workers, and trade with other miners gathering in the region’s central market. Other cities remain independent outposts with their own mines, routes, and local markets.</p><p class="map-region-facts"><strong>${mapCities.length} cities</strong> · <strong>${mapMineTypes.size} mine types</strong> · ${[...mapMineTypes.values()].map((mineType) => escapeHtml(mineType.name)).join(' · ')}${oilFieldFact}</p></section>
    <figure class="route-map"><svg viewBox="0 0 900 600" role="img" aria-labelledby="route-map-title route-map-description"><title id="route-map-title">${escapeHtml(currentMap.name)} cities, capital and gateways</title><desc id="route-map-description">An illustrated regional map showing ${escapeHtml(capitalCity.name)} as the capital, other cities as outposts, available mine types${currentMapOilField ? `, the Oil Field at ${escapeHtml(currentMapOilField.name)}` : ''}, and gateway cities. Route details are listed below the map.</desc>${terrain}<g class="city-layer">${cityNodes}</g></svg><figcaption aria-label="Map legend"><span class="city-key city-key-capital">Regional capital</span><span class="city-key city-key-current">Current city</span><span class="city-key city-key-unknown">Undiscovered</span><span class="mine-key">Mine types available</span><span class="oil-field-key"><img src="${OIL_FIELD_MAP_ICON_PATH}" alt="">Oil Field</span><span class="gateway-key">Gateway to another region</span></figcaption></figure>
    <section><h2>Local route network</h2><ul class="route-list">${routeRows || '<li>No routes are currently available.</li>'}</ul></section>${exitsSection}
    <section><h2>City operations</h2><div class="city-grid">${cities}</div></section><script src="/node/map.js?v=20260821a" defer></script>`;
}

function threatVehicleOptionLabel(option) {
  const rarity = option.vehicleRarityName ? ` · ${option.vehicleRarityName}` : '';
  const city = option.originCityName ? ` · ${option.originCityName}` : '';
  return `${option.vehicleName}${rarity}${city} · #${option.vehicleId}`;
}

function creatureHuntForm(creature) {
  const attackOptions = creature.attackOptions ?? [];
  return attackOptions.length
    ? `<form class="threat-action" method="post" action="/events/creatures/${creature.id}/attack"><label>Vehicle<select name="vehicleId" required>${attackOptions.map((option) => `<option value="${option.vehicleId}">${escapeHtml(threatVehicleOptionLabel(option))}</option>`).join('')}</select></label><button>Launch hunt</button></form>`
    : '';
}

function worldCreatureProfile(type) {
  const profiles = {
    kraken: {
      classification: 'Abyssal ambush predator',
      description: 'A many-armed deep-water hunter large enough to stop a loaded ship. It rises beneath established sea lanes and uses the route itself as a hunting ground.',
      behaviour: 'Kraken close slowly, strike the hull with a tentacle smash after every exchange, and turn at coastal cities if nobody stops them.'
    },
    land_whale: {
      classification: 'Terrestrial leviathan',
      description: 'An immense survivor of Old Earth that moves over roads as though they were migration paths. Its weight and momentum make even a glancing encounter dangerous.',
      behaviour: 'Land Whales follow open roads, body-slam vehicles that meet them, and continue toward the next city until defeated or allowed through.'
    },
    white_whale: {
      classification: 'Pelagic route giant',
      description: 'A pale ocean giant that has learned the rhythm of shipping corridors. Its scarred hide carries mineral traces gathered over years below the ash-dark sea.',
      behaviour: 'White Whales travel quickly, ram hulls head-on, and surrender a tier-scaled Ore recovery when brought down.'
    },
    orca_pod: {
      classification: 'Co-operative marine hunters',
      description: 'A coordinated pod that treats passing ships as moving puzzles. One animal tests the hull while the others shape the vessel back toward the centre of the route.',
      behaviour: 'Orca Pods are the fastest known sea threats. Their coordinated rams answer every attack and defeated pods leave tier-scaled Ore behind.'
    },
    elephant_herd: {
      classification: 'Migratory land herd',
      description: 'A close-packed herd crossing the rebuilt road network along older paths that no map records. Vehicles are obstacles, noise and threat all at once.',
      behaviour: 'Elephant Herds advance as a stampede, punish poorly armoured road vehicles, and leave a tier-scaled Ore recovery in their wake.'
    },
    t_rex: {
      classification: 'Old Earth apex predator',
      description: 'A reconstructed tyrant predator roaming roads between settlements. It is the toughest known living land threat and regards an approaching vehicle as prey.',
      behaviour: 'T-Rexes bite with exceptional force, pursue the road to its next city, and leave tier-scaled Ore when a compatible hunter survives the encounter.'
    }
  };
  return profiles[type] ?? {
    classification: 'Unclassified living threat',
    description: 'A living route threat recorded beyond the city boundary.',
    behaviour: 'It follows an open route and may attack compatible traffic.'
  };
}

function threatCondition(current, maximum, damaged = false) {
  const currentValue = Number(current);
  const maximumValue = Number(maximum);
  if (!(Number.isFinite(currentValue) && Number.isFinite(maximumValue) && maximumValue > 0)) {
    return damaged
      ? { label: 'Wounded', className: 'wounded' }
      : { label: 'Unhurt', className: 'unhurt' };
  }
  const ratio = Math.max(0, Math.min(1, currentValue / maximumValue));
  if (currentValue >= maximumValue) return { label: 'Unhurt', className: 'unhurt' };
  if (ratio >= 0.4) return { label: 'Wounded', className: 'wounded' };
  return { label: 'Seriously wounded', className: 'seriously-wounded' };
}

function worldCreatureEventDetailPage(creature, catalog, currentTime) {
  const profile = worldCreatureProfile(creature.type);
  const routeType = catalogLabel(catalog, 'route_type', creature.routeType);
  const active = creature.status === 'active';
  const condition = threatCondition(creature.hp, creature.maxHp);
  const state = active ? `${condition.label} and roaming`
    : creature.status === 'defeated' ? 'Defeated' : 'Reached its destination';
  const position = Number.isFinite(Number(creature.location))
    ? `${Math.round(Number(creature.location)).toLocaleString('en-GB')} km from ${escapeHtml(creature.city1Name)}`
    : 'No position recorded';
  const timing = active
    ? `Expected at ${escapeHtml(creature.destinationCityName)} in ${formatDuration(Number(creature.arrivesAt) - Number(currentTime))}`
    : `Resolved ${new Date(creature.resolvedAt).toLocaleString('en-GB')}`;
  const baseName = catalog.settings.world_creature_names[creature.type] ?? creature.name;
  const attackName = catalog.settings.world_creature_attack_names[creature.type];
  const counterRatio = Number(catalog.settings.world_creature_counter_damage_ratio[creature.type]);
  const damageMultiplier = Number(
    catalog.settings.world_creature_tier_damage_multipliers[creature.rarity]
  );
  const eligibleTiers = creature.hunterRarities.map((rarityId) =>
    catalog.rarities.find((rarity) => Number(rarity.id) === Number(rarityId))?.name
  ).filter(Boolean).join(', ');
  const reward = creature.rewardType === 'ore'
    ? `Up to ${Number(creature.oreDrop).toLocaleString('en-GB')} Ore can be recovered, limited by the surviving hunter's compatible free cargo space.`
    : `A surviving hunter's compatible free cargo space is filled with randomly selected ${escapeHtml(creature.rarityName)} treasure matching this threat's tier.`;
  const outcome = active ? ''
    : `<p class="ghost-record-outcome"><strong>Final disposition:</strong> ${creature.status === 'defeated' ? `Defeated after ${Number(creature.attackCount).toLocaleString('en-GB')} recorded attack${Number(creature.attackCount) === 1 ? '' : 's'}` : `Entered ${escapeHtml(creature.destinationCityName)}`}.</p>`;
  const pursuit = active && creature.pursuers.length
    ? `${creature.pursuers.length} vehicle${creature.pursuers.length === 1 ? ' is' : 's are'} moving to intercept`
    : active ? 'No vehicle is currently moving to intercept' : 'Hunt closed';
  return `<section class="page-title"><div><p class="eyebrow">Living-threat record #${creature.id}</p><h1>${escapeHtml(creature.name)}</h1></div><a class="text-link" href="/events">Back to world events</a></section>
    <article class="ghost-record creature-record rarity-${creature.rarity}">
      <div class="ghost-record-hero creature-record-hero"><img src="${escapeHtml(creature.icon)}" alt="${escapeHtml(baseName)}"><div><p class="eyebrow">${escapeHtml(creature.rarityName)} living threat &middot; ${escapeHtml(creature.mapName)} region</p><h2>${escapeHtml(profile.classification)}</h2><p>${escapeHtml(profile.description)}</p>${outcome}</div></div>
      <dl class="ghost-record-facts"><div><dt>Rarity</dt><dd>${escapeHtml(creature.rarityName)}</dd></div><div><dt>Region</dt><dd>${escapeHtml(creature.mapName)}</dd></div><div><dt>State</dt><dd>${escapeHtml(state)}</dd></div><div><dt>Route</dt><dd>${escapeHtml(creature.routeName)} &middot; ${escapeHtml(routeType)} &middot; ${Number(creature.length).toLocaleString('en-GB')} km</dd></div><div><dt>Heading</dt><dd>${active ? escapeHtml(creature.destinationCityName) : 'Journey ended'}</dd></div><div><dt>Position</dt><dd>${position}</dd></div><div><dt>Health</dt><dd>${Number(creature.hp).toLocaleString('en-GB')} / ${Number(creature.maxHp).toLocaleString('en-GB')}</dd></div><div><dt>Speed</dt><dd>${active ? `${Number(creature.speed).toFixed(1)} km/h` : 'No longer moving'}</dd></div><div><dt>Timing</dt><dd>${timing}</dd></div><div><dt>Awakened</dt><dd>${new Date(creature.awakenedAt).toLocaleString('en-GB')}</dd></div><div><dt>Hunt activity</dt><dd>${escapeHtml(pursuit)}</dd></div><div><dt>Damage recorded</dt><dd>${Number(creature.totalDamage).toLocaleString('en-GB')}</dd></div></dl>
      ${creatureHuntForm(creature)}
      <section class="ghost-origin creature-observations"><div><p class="eyebrow">Field observations</p><h2>Observed behaviour</h2><p>${escapeHtml(profile.behaviour)}</p><p>Its recorded counterattack is <strong>${escapeHtml(attackName)}</strong>. The species has a base counter-force factor of ${Math.round(counterRatio * 100)}%; this ${escapeHtml(creature.rarityName)} specimen applies a ${damageMultiplier.toFixed(2).replace(/\.00$/u, '')}&times; tier multiplier.</p></div><img src="${escapeHtml(creature.icon)}" alt=""></section>
      <section class="ghost-bounty creature-bounty"><p class="eyebrow">Hunter's record</p><h2>Reported recovery</h2><p>${reward}</p><p><strong>Eligible vehicle tiers:</strong> ${escapeHtml(eligibleTiers)}. The vehicle must also match the route type and be ready at either endpoint.</p></section>
    </article>`;
}

function ghostHuntForm(ghost) {
  const attackOptions = ghost.attackOptions ?? [];
  return attackOptions.length
    ? `<form class="threat-action" method="post" action="/events/ghosts/${ghost.id}/attack"><label>Vehicle<select name="vehicleId" required>${attackOptions.map((option) => `<option value="${option.vehicleId}">${escapeHtml(threatVehicleOptionLabel(option))}</option>`).join('')}</select></label><button>Launch hunt</button></form>`
    : '';
}

function ghostEventDetailPage(ghost, catalog, currentTime) {
  const kindName = ghost.kind === 'ship' ? 'Ghost Ship' : 'Ghost Rider';
  const condition = threatCondition(ghost.hull, ghost.maxHull, ghost.damaged);
  const state = ghost.defeatedAt ? 'Banished' : `${condition.label} and patrolling`;
  const routeType = catalogLabel(catalog, 'route_type', ghost.routeType);
  const heading = ghost.defeatedAt
    ? 'At rest'
    : ghost.destinationCityName
      ? `Toward ${escapeHtml(ghost.destinationCityName)}` : 'Patrolling';
  const position = ghost.location === null || ghost.location === undefined
    ? 'No longer moving'
    : `${Math.round(ghost.location).toLocaleString('en-GB')} km from ${escapeHtml(ghost.city1Name)}`;
  const timing = ghost.defeatedAt
    ? `Banished ${new Date(ghost.defeatedAt).toLocaleString('en-GB')}`
    : `Next turn in ${formatDuration(Number(ghost.arrivesAt) - Number(currentTime))}`;
  const outcome = ghost.defeatedAt
    ? `<p class="ghost-record-outcome"><strong>Final disposition:</strong> ${ghost.defeatedByName ? `Banished by ${escapeHtml(ghost.defeatedByName)}` : 'Banished'}${ghost.defeatedBattleId ? ` in <a class="text-link" href="/battles/${ghost.defeatedBattleId}">the recorded battle</a>` : ''}.</p>`
    : '';
  const origin = ghost.sourcePlayerName
    ? `<div><dt>Former keeper</dt><dd>${escapeHtml(ghost.sourcePlayerName)}</dd></div>` : '';
  const creatureOrigin = Boolean(ghost.sourceCreatureId);
  const sourceDescription = !creatureOrigin && ghost.sourceItemDescription
    ? `<p>${escapeHtml(ghost.sourceItemDescription)}</p>` : '';
  const bounty = (ghost.bounty ?? []).map((reward) => {
    const item = catalog.byId.get(Number(reward.itemId));
    if (!item) return '';
    return `<li><a class="ghost-bounty-item thing-link rarity-${item.rarity}" href="/items/${item.id}"><img src="${escapeHtml(item.icon)}" alt=""><span><strong>${Number(reward.quantity).toLocaleString('en-GB')} &times; ${escapeHtml(item.name)}</strong><small>${escapeHtml(item.rarityName)}</small></span></a></li>`;
  }).join('');
  const description = creatureOrigin
    ? `A defeated ${ghost.sourceCreatureName} has refused to stay dead. It now patrols the ${ghost.routeName} route in a hostile spectral form.`
    : ghost.kind === 'ship'
      ? `A drowned transport has returned as a spectral vessel. It works the ${ghost.routeName} passage without a crew, carrying its old shape and a hostile memory of the sea.`
      : `A destroyed road vehicle has returned as a Wraith rider. It patrols the ${ghost.routeName} road, turning at each city and challenging living transports in its combat class.`;
  const sourceRecord = creatureOrigin
    ? `The haunting rose from the remains of <a class="text-link" href="/events/creatures/${ghost.sourceCreatureId}">${escapeHtml(ghost.sourceCreatureName)}</a>.`
    : `The haunting retains the form of <a class="thing-link rarity-${ghost.rarity}" href="/items/${ghost.sourceItemId}">${escapeHtml(ghost.sourceItemName)}</a>, once recorded as ${escapeHtml(ghost.sourceVehicleName)}.`;
  const sourceAlt = creatureOrigin ? ghost.sourceCreatureName : ghost.sourceItemName;
  return `<section class="page-title"><div><p class="eyebrow">Restless-dead record #${ghost.id}</p><h1>${escapeHtml(ghost.name)}</h1></div><a class="text-link" href="/events">Back to world events</a></section>
    <article class="ghost-record rarity-${ghost.rarity}">
      <div class="ghost-record-hero"><div class="ghost-record-spectre spectral-transport spectral-${ghost.kind}"><img src="${escapeHtml(ghost.icon)}" alt="${escapeHtml(kindName)}"></div><div><p class="eyebrow">${escapeHtml(ghost.rarityName)} ${escapeHtml(kindName)} &middot; ${escapeHtml(ghost.regionName)} region</p><h2>${escapeHtml(ghost.baseName)}</h2><p>${escapeHtml(description)}</p>${outcome}</div></div>
      <dl class="ghost-record-facts"><div><dt>Rarity</dt><dd>${escapeHtml(ghost.rarityName)}</dd></div><div><dt>Region</dt><dd>${escapeHtml(ghost.regionName)}</dd></div><div><dt>State</dt><dd>${escapeHtml(state)}</dd></div><div><dt>Route</dt><dd>${escapeHtml(ghost.routeName)} &middot; ${escapeHtml(routeType)} &middot; ${Number(ghost.length).toLocaleString('en-GB')} km</dd></div><div><dt>Heading</dt><dd>${heading}</dd></div><div><dt>Position</dt><dd>${position}</dd></div><div><dt>Speed</dt><dd>${ghost.speed === null || ghost.speed === undefined ? 'No longer moving' : `${Number(ghost.speed).toFixed(1)} km/h`}</dd></div><div><dt>Timing</dt><dd>${escapeHtml(timing)}</dd></div><div><dt>Risen</dt><dd>${new Date(ghost.risenAt).toLocaleString('en-GB')}</dd></div></dl>
      ${ghostHuntForm(ghost)}
      <section class="ghost-origin"><div><p class="eyebrow">${creatureOrigin ? 'Remains record' : 'Wreck record'}</p><h2>What came back</h2><p>${sourceRecord}</p>${sourceDescription}</div><img src="${escapeHtml(ghost.sourceIcon)}" alt="${escapeHtml(sourceAlt)}">${origin ? `<dl>${origin}</dl>` : ''}</section>
      <section class="ghost-bounty"><p class="eyebrow">Spectral manifest</p><h2>${ghost.defeatedAt ? 'Recovered bounty' : 'Reported bounty'}</h2><ul>${bounty || '<li>No recoverable cargo is recorded.</li>'}</ul></section>
    </article>`;
}

function worldEventsPage(player, catalog, status, vehicles, currentTime) {
  const weather = status.weather.map((entry) => {
    const [icon, label] = weatherPresentation(entry.condition);
    return `<article id="weather-${entry.mapId}" class="weather-card weather-${entry.condition}"><span class="weather-icon">${icon}</span><div><h3>${escapeHtml(entry.mapName)}</h3><p><strong>${escapeHtml(label)}</strong> | ${entry.temperatureC.toFixed(1)}&deg;C | ${entry.windKph} km/h wind${entry.rainfallMm ? ` | ${entry.rainfallMm} mm precipitation` : ''}</p></div></article>`;
  }).join('');
  const active = status.creatures.filter((creature) => creature.status === 'active');
  const creatureCards = active.map((creature) => {
    const condition = threatCondition(creature.hp, creature.maxHp);
    const detailsPath = `/events/creatures/${creature.id}`;
    return `<article id="creature-${creature.id}" class="threat-card creature-card threat-creature creature-${creature.type} rarity-${creature.rarity}"><a class="threat-mark" href="${detailsPath}" aria-label="Open the full record for ${escapeHtml(creature.name)}"><img src="${escapeHtml(creature.icon)}" alt=""></a><div class="threat-card-body"><header><div><p class="eyebrow">${escapeHtml(creature.mapName)} | ${escapeHtml(creature.rarityName)}</p><h3><a class="creature-record-link" href="${detailsPath}">${escapeHtml(creature.name)}</a></h3></div><span class="threat-condition threat-condition-${condition.className}">${condition.label}</span></header><dl class="threat-facts"><div><dt>Route</dt><dd>${escapeHtml(creature.routeName)}</dd></div><div><dt>Heading</dt><dd>${escapeHtml(creature.destinationCityName)}</dd></div></dl>${creatureHuntForm(creature)}</div></article>`;
  }).join('');
  const activeGhosts = (status.ghosts ?? []).filter((ghost) => !ghost.defeatedAt);
  const ghostCards = activeGhosts.map((ghost) => {
    const condition = threatCondition(ghost.hull, ghost.maxHull, ghost.damaged);
    const detailsPath = `/events/ghosts/${ghost.id}`;
    return `<article class="threat-card ghost-card threat-ghost ghost-${ghost.kind} rarity-${ghost.rarity}"><a class="threat-mark" href="${detailsPath}" aria-label="Open the full record for ${escapeHtml(ghost.name)}"><span class="spectral-transport spectral-${ghost.kind}" aria-hidden="true"><img src="${escapeHtml(ghost.icon)}" alt=""></span></a><div class="threat-card-body"><header><div><p class="eyebrow">${ghost.kind === 'ship' ? 'Ghost Ship' : 'Ghost Rider'} | ${escapeHtml(ghost.rarityName)}</p><h3><a class="ghost-record-link" href="${detailsPath}">${escapeHtml(ghost.name)}</a></h3></div><span class="threat-condition threat-condition-${condition.className}">${condition.label}</span></header><dl class="threat-facts"><div><dt>Region</dt><dd>${escapeHtml(ghost.regionName)}</dd></div><div><dt>Route</dt><dd>${escapeHtml(ghost.routeName)}</dd></div><div><dt>Heading</dt><dd>${ghost.destinationCityName ? escapeHtml(ghost.destinationCityName) : 'Patrolling'}</dd></div></dl>${ghostHuntForm(ghost)}</div></article>`;
  }).join('');
  return `<section class="page-title"><div><p class="eyebrow">Living world</p><h1>World Events</h1></div><p>The sky shifts. The routes answer. Watch what moves through the regions you know.</p></section>
    <section id="moon" class="moon-card"><span class="moon-icon">${status.moon.icon}</span><div><p class="eyebrow">Lunar influence</p><h2>${escapeHtml(status.moon.name)}</h2><p>The light changes. So does the world.</p><small>About ${status.moon.ageDays.toFixed(1)} lunar days old | next phase in ${formatDuration(status.moon.nextPhaseAt - currentTime)}</small></div></section>
    <section><div class="section-heading"><div><p class="eyebrow">Current conditions</p><h2>Weather</h2></div></div><div class="weather-grid">${weather || '<p>Discover a region to read its weather.</p>'}</div><p class="muted">Read the sky before you send anything beyond the city.</p></section>
    <section class="threat-board"><div class="section-heading"><div><p class="eyebrow">Known routes</p><h2>Route threats</h2></div><p>Keep watch beyond the city lights.</p></div><div class="threat-group"><h3>Living threats</h3><div class="threat-grid">${creatureCards || '<p class="threat-empty">For now, the living routes are quiet.</p>'}</div></div><div class="threat-group"><h3>The restless dead</h3><div class="threat-grid">${ghostCards || '<p class="threat-empty">Nothing dead is moving on the routes you know.</p>'}</div></div></section>`;
}

function historyPage() {
  return `<article class="editorial-page history-page">
    <nav class="editorial-switcher" aria-label="Public records"><a class="text-link" href="/history" aria-current="page">History</a><a class="text-link" href="/legal">Legal</a></nav>
    <section class="page-title"><div><p class="eyebrow">MineThings archive · Record 01</p><h1>History</h1></div><p>The story of MineThings: first listed on 16 October 2009, closed in March 2020, and reopened as MineThings 2 in August 2026.</p></section>
    <div class="editorial-facts" aria-label="History at a glance"><div><span>Original world</span><strong>16 Oct 2009—Mar 2020</strong></div><div><span>First revival</span><strong>Nov 2019—10 Feb 2020</strong></div><div><span>Current restoration</span><strong>23 Aug 2026 onward</strong></div></div>
    <div class="editorial-layout"><nav class="article-index" aria-label="History sections"><strong>On this page</strong><a class="text-link" href="#beginnings">16 October 2009</a><a class="text-link" href="#players">2010 · Players</a><a class="text-link" href="#economy">2011 · Bitcoin</a><a class="text-link" href="#reception">2012–2013 · Reception</a><a class="text-link" href="#world">2014 · The world</a><a class="text-link" href="#community">2014–2016 · Tools</a><a class="text-link" href="#first-restoration">2019–2020 · First revival</a><a class="text-link" href="#shutdown">March 2020 · Shutdown</a><a class="text-link" href="#memory">2021 · Remembering</a><a class="text-link" href="#memorial">2023–2024 · Mini MineThings</a><a class="text-link" href="#restoration">By 22 August 2026</a><a class="text-link" href="#repository">23–27 August 2026</a><a class="text-link" href="#reflection">28 August 2026</a><a class="text-link" href="#rebuilding">29–30 August 2026</a><a class="text-link" href="#continuation">31 August–2 September 2026</a><a class="text-link" href="#sources">2 September 2026 · Sources</a></nav><div class="editorial-copy history-timeline">
    <section id="beginnings"><p class="source-kind">Dated public record</p><h2><time datetime="2009-10-16">16 October 2009</time>: a world under the ash</h2><p>MineThings appeared in a browser-game directory on 16 October 2009. Its premise skipped two thousand years beyond the Yellowstone eruption: humanity had returned to a buried Earth and made an economy from whatever its miners could recover. It was free to play, persistent, deliberately slow and more interested in ownership and trade than in a conventional quest line.</p></section>
    <section id="players"><p class="source-kind">Dated community artefacts and player record</p><h2><time datetime="2010-06-11">11 June 2010</time>–<time datetime="2010-10-20">20 October 2010</time>: players rebuilt the interface around themselves</h2><p>On 11 June 2010, the first Lazy Newb Pack bundled community graphics, utilities and configuration for <em>Dwarf Fortress</em>. Together with Dwarf Therapist's tabular labour interface, it provides a useful parallel: these community projects did not replace the simulation; players built a more usable interface around it.</p><p>On 7 October 2010, a MineThings player published a Python screen scraper that collected a census of miners, professions and home cities together with asking prices, bids and sales. It is unusually direct evidence that MineThings was already being treated as both a persistent world and an economic simulation. Its players were beginning to build their own interface around a smaller browser canvas.</p><p>An Ars Technica discussion begun on 20 October 2010 records starter mines, rarity tiers, melding, mine purchase and rental, discovering towns, moving goods, pirates and highwaymen. Players also argued about the slow opening pace, paid acceleration and controls that were not always obvious. The same dated thread records separate Aso and Bromo servers with different economies: veterans could make Aso easier through cheap equipment and loans, while Bromo offered a more even race to discover things.</p></section>
    <section id="economy"><p class="source-kind">Dated contemporary public record</p><h2><time datetime="2011-03">March 2011</time>–<time datetime="2011-08-29">29 August 2011</time>: experiments in value and Bitcoin</h2><p>MineThings was documented as accepting Bitcoin by March 2011. A 24 May AnandTech recommendation shows the game travelling by ordinary word of mouth. On 1 July, a BitcoinTalk promotion offered an in-game starter pack and credited MineThings with introducing its author to Bitcoin; the apparent operator account, <strong>nextnonce</strong>, joined the discussion.</p><p>On 29 August 2011, that account announced that MineThings had removed PayPal and moved exclusively to Bitcoin, claiming approximately 1,500 active players. The number is historically useful but remains an operator-supplied population claim, not an independently audited count. Replies welcomed the experiment while warning that obtaining Bitcoin was difficult and that the public explanation of payments and premium content was thin.</p></section>
    <section id="reception"><p class="source-kind">Dated friend testimony and independent review</p><h2><time datetime="2012-07-08">8 July 2012</time>–<time datetime="2013-01-04">4 January 2013</time>: the patient loop in public</h2><p>On 8 July 2012, a MartialTalk recommendation from a friend identified <strong>Japhet Stevens</strong> as the creator and described MineThings as a once-a-day game. It is useful first-hand social testimony, not independent reporting about authorship.</p><p>An independent review on 4 January 2013 described the same rhythm—checking once or twice a day—along with hundreds of common things, still-undiscovered Orange things, Melds that unlocked professions, player-set prices and risky travel. Together these accounts show that scarcity, cooperation, advantage and inconvenience were the game, not incidental friction.</p></section>
    <section id="world"><p class="source-kind">Dated player guide and surviving code</p><h2><time datetime="2014-04-25">25 April 2014</time>–<time datetime="2014-05-25">25 May 2014</time>: a game made from distance</h2><p>On 25 April 2014, the long-running f13 guide described the Oil Field as a resource-management puzzle made from randomly found parts and compared its pipe work to <em>Pipe Mania</em>. By 25 May, the guide had documented city-scoped things, global gold, local markets, hidden cities, Meld creation, vehicles, convoy tactics and route combat.</p><p>Mines kept working while their owners were away. Land vehicles, ships and aircraft made geography matter; weapons, modifications, piracy, professions, factories, Melds and the Oil Field turned an idle collection game into an intricate social simulation. The preserved PHP, MySQL and Python implementation corroborates those systems in code and data.</p></section>
    <section id="community"><p class="source-kind">Dated surviving community artefacts</p><h2><time datetime="2014-09">September 2014</time>–<time datetime="2016">2016</time>: players kept rebuilding the interface</h2><p>The MineThings transport extension was published in September 2014. It added sorting, filtering, colour coding, ETA calculations, radar and gadget details, live refresh, journey statistics and event histories. By July 2015, related scripts had reworked chat, messages, findings and wasted screen space. In 2016, the smaller “Machine Owners” tool grouped Oil Field machines by owner.</p><p>These were not cosmetic curiosities. They preserve the information and controls players needed badly enough to construct for themselves, just as the Dwarf Fortress community had done around its own difficult interface.</p></section>
    <section id="first-restoration"><p class="source-kind operator-account">Public failure record; operator-supplied identity</p><h2><time datetime="2019-11">November 2019</time>–<time datetime="2020-02-10">10 February 2020</time>: Serif's first restoration attempt fails</h2><p>A contemporary shutdown discussion records that the original owner offered to hand over the keys in November 2019 if somebody assumed the server bill. By 10 February 2020, a server upgrade had left parts of the ageing game broken, and one selected player-programmer had investigated taking over and updating its CakePHP 1.2, PHP, MySQL, Python and CentOS service. The scale of the code, broken systems and resources required defeated that attempt.</p><p>The public record confirms the failed attempt and its date range but leaves the successor unnamed. Serif identifies himself as that successor and says the private source and database were transferred to him. Serif's first repair and port stalled under the system's scope, obsolete dependencies and the time available. The identity and private transfer are therefore recorded as first-hand operator testimony, not independently established fact.</p></section>
    <section id="shutdown"><p class="source-kind">Dated public record</p><h2><time datetime="2020-03">March 2020</time>: the machinery stops</h2><p>After the failed handover, support had become exhausting and the monthly infrastructure bill was difficult to justify. MineThings closed in March 2020. Contemporary comments establish the month but not a reliable exact day.</p></section>
    <section id="memory"><p class="source-kind">Dated post-closure recollection</p><h2><time datetime="2021">2021</time>: memory outlives the service</h2><p>In 2021, players still tried to identify or replace MineThings. A 3 February similar-games request remembered automatic randomised loot and crafting; an 8 December identification thread successfully named MineThings from a partial memory of a browser mining game. These recollections show what endured, but they are not treated as authoritative records of the original mechanics.</p></section>
    <section id="memorial"><p class="source-kind">Dated playable release and community recollection</p><h2><time datetime="2023-01-04">4 January 2023</time>–<time datetime="2024-02-20">20 February 2024</time>: Mini MineThings</h2><p><em>Mini MineThings</em> was uploaded to Newgrounds on 4 January 2023 with an offline mining loop built from robots, explosives and multiple mines. A 16 January AndroidGaming reminiscence again grouped the original with scavenging and item-collection games. On 20 February 2024, a Newgrounds commenter explicitly thanked its author for reviving the game.</p></section>
    <section id="restoration"><p class="source-kind operator-account">Dated operator account; outcome corroborated by repository</p><h2><time datetime="2026-08-22">By 22 August 2026</time>: months of reconstruction</h2><p>Serif describes the new revival as months of excavation, comparison and rebuilding before MineThings 2 reopened. The code and database snapshots had survived the failed 2019–2020 attempt. AI-assisted development made a complete migration practical, with the retired application treated as evidence and never executed by the public server.</p><p>This was far more than a visual remake. Serif reconstructed account and mining state in Node.js and SQLite, restored the catalogue, markets, factories, Melds, messages, chat, vehicles, combat, Dwarves, weather, roaming threats and the Oil Field, and recast seven former server worlds as connected regions with gateway capitals. Verified accounts, live updates, administration, migration tooling, automated tests and production checks made the recovered world operable again.</p></section>
    <section id="repository"><p class="source-kind">Dated repository evidence</p><h2><time datetime="2026-08-23">23 August 2026</time>–<time datetime="2026-08-27">27 August 2026</time>: the restoration enters the surviving record</h2><p>The current Git record begins on 23 August with one large restoration snapshot rather than a month-by-month development diary. It substantiates the breadth of the result, not every step of the preceding months. Commits from 25 to 27 August record rapid work on connected regional travel, live updates, creatures and route combat, the Oil Field, chat, messages, guilds and new icon families.</p><p>Some unsafe or obsolete services were deliberately retired. MineThings 2 became both preservation and continuation: old rules where the archive could support them, and new systems designed to feel native to the same strange world.</p></section>
    <section id="reflection"><p class="source-kind operator-account">Dated first-hand player and operator testimony</p><h2><time datetime="2026-08-28">28 August 2026</time>: “But it stuck”</h2><figure class="history-quote"><blockquote><p>MineThings folk were a weird community. It attracted all sorts: griefer kids; whales (in the gaming sense); triers; chatters; people on drugs who would leave long monologues inspired by their mushroom trips; shills; young professionals; rich folks; idealists; habitualists. But it stuck—in people’s heads. It was a true sandbox, and Japhet Stevens put a huge amount of effort and creativity into it, yet received so little in return beyond abuse and suggestions about how to ‘improve his game’.</p><p>So many groundbreaking games were emerging at the time. Minecraft, FFS. Sandboxes were appearing everywhere. WoW had started as a sandbox. MineThings had a sense of an accepting community long before LGBTQ inclusion, invisible disabilities, and DEI became common topics of discussion. It connected people while, at the same time, providing a way for them to piss anonymous people off. The game had pariahs and legends.</p><p>I really want to bring this legacy forward, and I feel that it is a privilege to be in a position to do so.</p></blockquote><figcaption>Serif, original player and current restoration operator · 28 August 2026</figcaption></figure></section>
    <section id="rebuilding"><p class="source-kind">Dated repository and working-tree evidence</p><h2><time datetime="2026-08-29">29 August 2026</time>–<time datetime="2026-08-30">30 August 2026</time>: the reopened world keeps growing</h2><p>On 29 August, the casino became a multi-machine system. On 30 August, Council sentencing and a fuller starter experience gave new miners a proper arrival; maps and city labels were rebuilt; transport and combat continued to be refined; and hundreds of catalogue items gained a coherent SVG icon language while original PNGs remained available for layered avatars and miners.</p></section>
    <section id="continuation"><p class="source-kind">Dated repository and working-tree evidence; operator account</p><h2><time datetime="2026-08-31">31 August 2026</time>–<time datetime="2026-09-02">2 September 2026</time>: Serif makes the restored world inhabitable</h2><p>After the previous development update, Serif added explorable city interiors. Every city acquired its own persistent street plan and regional character, with readable lore signs, sparse Ore scraps, temporary Charged Ore power, roaming Dwarves and restless dead, parks, transport terminals and detailed architectural landmarks. A miner can now enter mines, Oil Fields, airfields, harbours and vehicle yards on foot; visit a local bar; and find a home with storage, a display space, messages, a proper bed and drifting Legendary dreams.</p><p>Serif expanded transport from single journeys into a working logistics network. Shuttles can repeatedly carry selected categories, including Oil and Ore, under peaceful, patrol or pillage orders. The Oil Tanker carries up to 100 barrels, while the Train Carriage moves up to 200 loaded things between regional capitals. Parked transports repair slowly; closed routes reject new departures and reopen after existing journeys finish; and the administration record separates live traffic from world events.</p><p>The routes themselves became more dangerous and more legible. Creature rolls now cover every region, destroyed road vehicles and sunken ships can leave wrecks from which Wraith Riders or Ghost Ships may rise, and living and restless threats have linked records and tier-correct hunt controls. Combat reports gained complete opening and closing statistics, condition labels and cleaner notifications; bounties were tied back to threat rarity; and closures, destruction, sightings and other world events gained varied linked chat announcements without flooding player inboxes.</p><p>New-player life also grew beyond a starter mine. Council sentencing now generates thousands of context-safe offences under a permanently unique docket number, explains the dissolved-estate grants, and points the exile toward a starter-miner bot, Aso exploration, Stones and a one-use outpost mine-rental voucher. Starter property now includes an Oil Field kit and five M-80s. More Stones recognise city discovery, entering a home, displaying a Thing and assembling the bot, while contextual navigation counts show what is actually available where the miner stands.</p><p>Finally, Serif added a distinct casino cabinet for every region and a durable global spin counter; broadened the SVG artwork across Things, mines, transports, threats and architecture; added private city-bar conversation, unseen chat counts and offline finding summaries; tightened database migrations, image caching and state cleanup; and extended the automated checks around the growing world. This phase changed MineThings 2 from a recovered set of systems into a place miners could travel through, inhabit and leave stories in.</p></section>
    <section id="sources" class="source-notes"><h2><time datetime="2026-09-02">2 September 2026</time>: sources and provenance</h2><ol>
      <li><a class="text-link" href="https://www.bay12games.com/dwarves/dev_2006.html" rel="external noreferrer">Bay 12's 2006 development log</a>—the 8 August 2006 public Dwarf Fortress release.</li>
      <li><a class="text-link" href="https://github.com/Dwarf-Therapist/Manual/blob/master/Dwarf%20Therapist.tex" rel="external noreferrer">Dwarf Therapist manual</a>—the utility's 2009 release and tabular labour-management purpose.</li>
      <li><a class="text-link" href="https://browsermmorpg.com/game-mine-things--335" rel="external noreferrer">BrowserMMORPG listing</a>—the 16 October 2009 listing date, setting and overview.</li>
      <li><a class="text-link" href="https://dwarffortresswiki.org/index.php/Utility:Lazy_Newb_Pack" rel="external noreferrer">Lazy Newb Pack history</a>—the 11 June 2010 bundle of community graphics, utilities and configuration.</li>
      <li><a class="text-link" href="https://uniformlyuninformative.wordpress.com/2010/10/07/minethings-screen-scraper/" rel="external noreferrer">MineThings screen-scraper account</a>—the 7 October 2010 player census code and market-data collection.</li>
      <li><a class="text-link" href="https://arstechnica.com/civis/threads/mine-things-your-browser-based-epic-item-generator-game.1125701/" rel="external noreferrer">Ars Technica OpenForum discussion</a>—player reception, mechanics, servers, pacing and interface criticism from 20 October 2010 onward.</li>
      <li><a class="text-link" href="https://en.bitcoin.it/wiki/MineThings" rel="external noreferrer">Bitcoin Wiki record</a>—optional purchases and the March 2011 Bitcoin announcement.</li>
      <li><a class="text-link" href="https://forums.anandtech.com/threads/new-browser-game.2167073/" rel="external noreferrer">AnandTech mention</a>—the 24 May 2011 word-of-mouth recommendation.</li>
      <li><a class="text-link" href="https://bitcointalk.org/index.php?topic=24930.0%3Bwap" rel="external noreferrer">BitcoinTalk starter-pack discussion</a>—the 1 July 2011 promotion, players and apparent operator participation.</li>
      <li><a class="text-link" href="https://bitcointalk.org/index.php?topic=40042.0" rel="external noreferrer">BitcoinTalk “all-in” announcement</a>—the 29 August 2011 PayPal withdrawal and operator claim of roughly 1,500 active players.</li>
      <li><a class="text-link" href="https://www.martialtalk.com/threads/mine-things-free-browser-game.104152/" rel="external noreferrer">MartialTalk recommendation</a>—the 8 July 2012 friend attribution naming Japhet Stevens and describing once-daily play.</li>
      <li><a class="text-link" href="https://tagracat.wordpress.com/2013/01/04/mine-things/" rel="external noreferrer">Independent player review</a>—the 4 January 2013 account of daily rhythm, rare discoveries, Meld progression, prices and travel risk.</li>
      <li><a class="text-link" href="https://forums.f13.net/index.php?topic=22458.msg1288528" rel="external noreferrer">f13 player guide and discussion</a>—the 25 April, 21 May and 25 May 2014 records of the Oil Field, markets, maps, vehicles and piracy.</li>
      <li><a class="text-link" href="https://openuserjs.org/scripts/i-machine/Mine_Things_-_Transport_page" rel="external noreferrer">OpenUserJS transport extension</a>—its September 2014 publication and detailed transport, radar, gadget and journey tooling.</li>
      <li><a class="text-link" href="https://openuserjs.org/?orderBy=updated&amp;orderDir=asc&amp;p=50&amp;version=23.05.13" rel="external noreferrer">OpenUserJS MineThings index</a>—the July 2015 transport, chat, layout and message tools and platform counters.</li>
      <li><a class="text-link" href="https://openuserjs.org/?limit=bktxxvsgrqlztl&amp;p=192" rel="external noreferrer">OpenUserJS Machine Owners</a>—the 2016 machine-ownership analysis tool.</li>
      <li><a class="text-link" href="https://www.reddit.com/r/incremental_games/comments/f1tqlo" rel="external noreferrer">Shutdown discussion</a>—the 10 February 2020 technical state, failed succession attempt and impending closure.</li>
      <li><a class="text-link" href="https://www.reddit.com/r/gamingsuggestions/comments/lbbijg" rel="external noreferrer">Similar-games request</a>—the 3 February 2021 memory of automatic randomised loot and crafting.</li>
      <li><a class="text-link" href="https://www.reddit.com/r/tipofmyjoystick/comments/rbl577" rel="external noreferrer">Identification thread</a>—the 8 December 2021 residual recognition after shutdown.</li>
      <li><a class="text-link" href="https://www.newgrounds.com/portal/view/869633" rel="external noreferrer">Mini MineThings release</a>—the dated 4 January 2023 upload and author's gameplay description.</li>
      <li><a class="text-link" href="https://www.reddit.com/r/AndroidGaming/comments/10d7hts" rel="external noreferrer">AndroidGaming reminiscence</a>—the 16 January 2023 classification as a scavenging and item-collection game.</li>
      <li><a class="text-link" href="https://www.newgrounds.com/portal/view/869633" rel="external noreferrer">Mini MineThings revival comment</a>—the dated 20 February 2024 recognition of the game as a revival.</li>
    </ol><p>All public sources and displayed OpenUserJS counters were reviewed on 30 August 2026. At that review, OpenUserJS recorded 17,520 installations for transport, 10,009 for chat, 11,039 for screen-space changes, 8,594 for messages and 170 for Machine Owners. These are platform counters, not verified unique-player totals.</p><p>Repository evidence means the archived source, SQL material, commits and current implementation shipped with this restoration. Operator-supplied history is first-hand testimony from Serif and is labelled wherever public records do not corroborate it. The name <strong>Japhet Stevens</strong> follows both the dated 2012 friend attribution and Serif's correction.</p></section>
    </div></div>
  </article>`;
}

function legalPage(seller, paymentConfig) {
  const version = LEGAL_VERSIONS[LEGAL_VERSION];
  const sellerDetails = seller.legalName && seller.legalAddress && seller.legalEmail
    ? `<dl class="legal-identity"><dt>Legal seller</dt><dd>${escapeHtml(seller.legalName)}</dd><dt>Geographic address</dt><dd>${escapeHtml(seller.legalAddress)}</dd><dt>Contact</dt><dd><a class="text-link" href="mailto:${escapeHtml(seller.legalEmail)}">${escapeHtml(seller.legalEmail)}</a></dd></dl>`
    : `<p class="legal-notice"><strong>Real-money checkout is not available.</strong> The operator's legal name, geographic address and contact email have not been configured for publication.</p>`;
  return `<article class="editorial-page legal-page"><nav class="editorial-switcher" aria-label="Public records"><a class="text-link" href="/history">History</a><a class="text-link" href="/legal" aria-current="page">Legal</a></nav>
    <section class="page-title"><div><p class="eyebrow">MineThings archive · Record 02</p><h1>Legal</h1></div><p>${escapeHtml(version.title)}. The rules, rights and responsibilities governing this independent restoration. Version ${LEGAL_VERSION}, England and Wales.</p></section>
    <div class="editorial-facts" aria-label="Legal document status"><div><span>Effective</span><strong>${escapeHtml(version.effectiveDate)}</strong></div><div><span>Jurisdiction</span><strong>England and Wales</strong></div><div><span>Payment mode</span><strong>${escapeHtml(paymentConfig.environment)}</strong></div></div>
    <p class="legal-summary" role="note"><strong>Mandatory rights remain.</strong> These terms allocate risk as far as the law permits. They do not remove consumer rights or liabilities that cannot lawfully be excluded.</p>
    <div class="editorial-layout"><nav class="article-index" aria-label="Legal sections"><strong>On this page</strong><a class="text-link" href="#operator">Operator</a><a class="text-link" href="#accounts">Accounts</a><a class="text-link" href="#service">Service</a><a class="text-link" href="#payments">Payments</a><a class="text-link" href="#privacy">Privacy</a><a class="text-link" href="#rights">Rights and content</a><a class="text-link" href="#liability">Liability</a><a class="text-link" href="#changes">Changes</a></nav><div class="editorial-copy legal-clauses">
    <section id="operator"><h2>1. Operator and status</h2><p>MineThings is an unofficial, independently operated restoration presented by <strong>${escapeHtml(seller.operatorName)}</strong>. The original game was created by <strong>Japhet Stevens</strong>. This restoration is not endorsed by or affiliated with Japhet Stevens, previous operators, PayPal or any owner of third-party names, code or artwork. No transfer of those third-party rights is claimed.</p>${sellerDetails}</section>
    <section id="accounts"><h2>2. Accounts and acceptable use</h2><p>You must provide accurate registration information, protect your password and use only accounts you are authorised to control. Do not exploit vulnerabilities, automate abusive traffic, interfere with other miners, launder value, harass people, or transmit unlawful material. Accounts may be restricted or closed where reasonably necessary for security, abuse prevention or operation of the service.</p></section>
    <section id="service"><h2>3. Experimental service</h2><p>The restoration is provided on an experimental, as-available basis. Game rules, balancing and availability may change. No promise is made that the service will be uninterrupted, error-free, permanently available, or that game data can always be preserved.</p></section>
    <section id="payments"><h2>4. Credits and payments</h2><p>Credits are a limited, revocable licence to use designated features inside MineThings. They are not money, stored value, an investment, property transferable outside the game, or redeemable for cash. Prices are shown in GBP inclusive of applicable taxes unless stated otherwise. PayPal processes payment details; MineThings does not receive or store your card number.</p><p>Credits are supplied immediately after PayPal reports a completed capture. Checkout asks for express consent to immediate digital supply and acknowledgement of the effect on the statutory cancellation period. This does not remove rights arising from faulty, misdescribed or undelivered digital content. Refunds and charge reversals remove the corresponding credits; the balance may become negative and credit spending is then disabled until restored.</p><p>Receipts and the accepted terms version remain available in purchase history. Contact the seller before initiating a dispute where practical.</p></section>
    <section id="privacy"><h2>5. Privacy</h2><p><strong>Controller, purposes and bases.</strong> The operator identified above controls the personal data used by MineThings. Account and gameplay data are processed to create and perform your account and provide features you request; payment records are processed to perform purchases and meet legal, accounting and dispute obligations; and security, moderation, fraud prevention and service-integrity records are processed for the operator's legitimate interests in running a safe, reliable game. A verified email is required to hold an account. MineThings does not use account data for advertising or automated decisions with legal or similarly significant effects.</p><p><strong>Data collected.</strong> MineThings stores your miner name, mandatory verified email, a one-way password hash, verification-token hashes and delivery audit data; game possessions, actions, settings and communications; and essential security and session information. An essential HttpOnly session cookie keeps you signed in. To identify possible multi-account market abuse, a successful sign-in can create a keyed pseudonymous token derived from the network address, together with the sign-in method and first, latest and total sign-in observations. The raw network address is not stored in the game database or displayed to administrators. If Google sign-in is enabled, MineThings stores the Google account identifier and email returned during sign-in. If payments are enabled, it stores PayPal order and capture identifiers, amount, currency, status, consent and audit entries, but not card numbers.</p><p><strong>Who can see it.</strong> Miner names, profile details you choose to show, market activity, guild membership, public chat and public world or battle records can be visible to other miners. Private messages are addressed to their participants and guild chat to current guild members. The operator may access records where necessary to administer, secure or moderate the service. Administrators can see whether two accounts have a recent pseudonymous network match and a scored summary of relevant market activity, but not the network address or token. The score only prioritises human review and never automatically suspends, restricts or otherwise penalises an account.</p><p><strong>Sharing and retention.</strong> Data is shared only with service infrastructure and, when you choose them, Google for sign-in and PayPal for payment. Those providers process data under their own notices and may process it internationally. Account and gameplay records are kept while the account remains active or the persistent world requires them. Pseudonymous network observations are retained for no more than 30 days. Other security, moderation and payment records are kept for as long as reasonably needed to prevent abuse, resolve disputes and meet legal or accounting duties, then deleted or anonymised where practical.</p><p><strong>Your rights.</strong> Depending on the processing and its legal basis, you may ask for access, correction, deletion, restriction or portability. <strong>You may object at any time to processing based on legitimate interests.</strong> Contact the published seller address above. You may also complain to the <a class="text-link" href="https://ico.org.uk/make-a-complaint/data-protection-complaints/data-protection-complaints/" rel="external noreferrer">Information Commissioner's Office</a>. Some requests may be limited by other people's rights or legal, security and fraud-prevention retention duties.</p></section>
    <section id="rights"><h2>6. Rights and submitted content</h2><p>Names, code, artwork and other historical MineThings material remain the property of their respective rights holders. Identification of Japhet Stevens as the original creator is attribution, not a claim of endorsement or ownership by him of this restoration.</p><p>You retain any rights you hold in content you submit. You grant the operator a worldwide, non-exclusive, royalty-free licence to store, reproduce, transmit, display and moderate that content only as reasonably necessary to operate, secure and preserve MineThings. You must not submit content you have no right to use.</p></section>
    <section id="liability"><h2>7. Liability</h2><p>To the fullest extent permitted by law, the operator is not liable for indirect or consequential loss, lost game progress, lost opportunities, loss caused by user equipment or third-party services, or events outside reasonable control. For loss that may lawfully be limited, aggregate liability is capped at the greater of £100 and the amount you paid to MineThings in the preceding 12 months.</p><p>Nothing excludes or limits liability for death or personal injury caused by negligence, fraud or fraudulent misrepresentation, breach of rights that cannot be excluded under consumer law, or any other liability the law does not permit to be excluded.</p></section>
    <section id="changes"><h2>8. Changes and disputes</h2><p>New terms apply when accepted at registration or checkout; a receipt records the applicable version. Material changes will be identified by a new version and effective date. Courts in England and Wales have jurisdiction, without depriving consumers of any mandatory right to bring proceedings elsewhere.</p></section>
    <p class="editorial-document-note">Payment mode: ${escapeHtml(paymentConfig.environment)}. This page is operational information, not legal advice to the operator.</p>
    </div></div>
  </article>`;
}

function formatMoneyMinor(amountMinor, currency = 'GBP') {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(Number(amountMinor) / 100);
}

function dateTimeLocalValue(timestamp) {
  if (!Number(timestamp)) return '';
  const date = new Date(Number(timestamp));
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function creditsPage(player, bundles, professionKits, purchases, readiness, paymentConfig, currentTime) {
  const unavailable = readiness.ready ? '' : `<p class="legal-notice"><strong>Checkout unavailable.</strong> ${escapeHtml(readiness.missing.join(', '))}.</p>`;
  const kitCards = professionKits.map((kit) => {
    const mineList = kit.mines.map((mine) => `<li><img src="${escapeHtml(mine.icon)}" alt=""><span><strong>${escapeHtml(mine.name)} Mine</strong><small>${escapeHtml(mine.cityName)}${mine.quantity > 1 ? ` × ${mine.quantity}` : ''}</small></span></li>`).join('');
    const offer = kit.free
      ? `<strong class="profession-kit-price free">Free now</strong><span>Until ${new Date(kit.freeUntil).toLocaleString('en-GB')} · then ${kit.configuredPriceCredits.toLocaleString('en-GB')} credits</span><small>${escapeHtml(formatDuration(kit.freeUntil - currentTime))} remaining</small>`
      : `<strong class="profession-kit-price">${kit.priceCredits.toLocaleString('en-GB')} credits</strong>`;
    let button = kit.priceCredits === 0 ? 'Claim free kit' : `Buy for ${kit.priceCredits.toLocaleString('en-GB')} credits`;
    let disabled = '';
    if (kit.claimedAt) {
      button = `Claimed ${new Date(kit.claimedAt).toLocaleDateString('en-GB')}`;
      disabled = ' disabled';
    } else if (!kit.inAso) {
      button = 'Return to Aso to claim';
      disabled = ' disabled';
    } else if (!kit.affordable) {
      button = 'Not enough credits';
      disabled = ' disabled';
    }
    return `<article class="profession-kit${kit.claimedAt ? ' claimed' : ''}"><header><p class="eyebrow">Profession Kit · ${kit.mineCount} ${kit.mineCount === 1 ? 'mine' : 'mines'}</p><h2>${escapeHtml(kit.name)}</h2><p>${escapeHtml(kit.description)}</p></header><ul class="profession-kit-mines">${mineList}</ul><div class="profession-kit-offer">${offer}</div><form method="post" action="/credits/profession-kits/${kit.id}/claim"><button${disabled}>${escapeHtml(button)}</button></form>${kit.claimedAt ? `<small>Paid ${kit.pricePaid.toLocaleString('en-GB')} credits. These mines cannot be sold back.</small>` : ''}</article>`;
  }).join('');
  const bundleCards = bundles.map((bundle) => `<article class="credit-bundle"><p class="eyebrow">${escapeHtml(bundle.name)}</p><strong>${bundle.credits.toLocaleString('en-GB')} credits</strong><span>${escapeHtml(formatMoneyMinor(bundle.amountMinor, bundle.currency))}</span><form method="post" action="/credits/paypal/orders"><input type="hidden" name="bundleId" value="${bundle.id}"><label class="check-row"><input type="checkbox" name="acceptPaymentTerms" value="1" required><span>I accept the <a class="text-link" href="/legal" target="_blank" rel="noopener">payment terms</a> (version ${LEGAL_VERSION}).</span></label><label class="check-row"><input type="checkbox" name="immediateDelivery" value="1" required><span>Supply my credits immediately; I understand this affects my 14-day cancellation right.</span></label><button${readiness.ready ? '' : ' disabled'}>Continue to PayPal</button></form></article>`).join('');
  const history = purchases.map((purchase) => `<tr><td><a class="text-link" href="/credits/receipts/${purchase.id}">MT-${purchase.id}</a></td><td>${new Date(purchase.createdAt).toLocaleString('en-GB')}</td><td>${escapeHtml(purchase.bundleName)}</td><td>${escapeHtml(formatMoneyMinor(purchase.amountMinor, purchase.currency))}</td><td><span class="payment-status payment-${escapeHtml(purchase.status)}">${escapeHtml(purchase.status)}</span></td></tr>`).join('');
  return `<section class="page-title"><div><p class="eyebrow">Optional support</p><h1>Buy credits</h1></div><p>Balance: <strong>${player.credits.toLocaleString('en-GB')} credits</strong> · ${escapeHtml(paymentConfig.environment)} checkout</p></section><section class="profession-kits-section"><div class="section-heading"><div><p class="eyebrow">Aso opportunities</p><h2>Profession Kits</h2></div><p>Claim each kit once while you are in Aso. Its permanent, non-refundable mines are opened in the Aso cities where those mine types belong.</p></div><div class="profession-kits">${kitCards || '<p>No Profession Kits are currently available.</p>'}</div></section>${unavailable}<section><h2>Credit bundles</h2><p>PayPal hosts the approval step. MineThings never sees your card details.</p><div class="credit-bundles">${bundleCards}</div></section><section><h2>Purchase history</h2><div class="table-scroll"><table><thead><tr><th>Receipt</th><th>Created</th><th>Bundle</th><th>Paid</th><th>Status</th></tr></thead><tbody>${history || '<tr><td colspan="5">No purchases yet.</td></tr>'}</tbody></table></div></section>`;
}

function receiptPage(purchase) {
  return `<article class="receipt"><header class="page-title"><div><p class="eyebrow">Permanent purchase record</p><h1>Receipt MT-${purchase.id}</h1></div><a class="button secondary" href="/credits/receipts/${purchase.id}.txt">Download receipt</a></header><dl class="receipt-grid"><dt>Miner</dt><dd>${escapeHtml(purchase.playerName)}</dd><dt>Created</dt><dd>${new Date(purchase.createdAt).toLocaleString('en-GB')}</dd><dt>Status</dt><dd>${escapeHtml(purchase.status)}</dd><dt>Bundle</dt><dd>${escapeHtml(purchase.bundleName)}</dd><dt>Credits</dt><dd>${purchase.credits.toLocaleString('en-GB')}</dd><dt>Amount</dt><dd>${escapeHtml(formatMoneyMinor(purchase.amountMinor, purchase.currency))}</dd><dt>PayPal order</dt><dd>${escapeHtml(purchase.providerOrderId || 'Not assigned')}</dd><dt>PayPal capture</dt><dd>${escapeHtml(purchase.providerCaptureId || 'Not captured')}</dd><dt>Terms accepted</dt><dd>Version ${escapeHtml(purchase.termsVersion)} at ${new Date(purchase.consentedAt).toLocaleString('en-GB')}</dd><dt>Seller</dt><dd>${escapeHtml(purchase.sellerName || 'Not configured')}<br>${escapeHtml(purchase.sellerAddress)}<br>${escapeHtml(purchase.sellerEmail)}</dd></dl><p><a class="text-link" href="/legal">Read the current Legal page</a> · <a class="text-link" href="/credits">Back to credit purchases</a></p></article>`;
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

function adminPaymentsPage(bundles, professionKits, purchases, currentTime) {
  const bundleRows = [...bundles].sort((first, second) =>
    first.name.localeCompare(second.name) || first.id - second.id)
    .map((bundle) => { const formId = `bundle-${bundle.id}`; return `<tr><td><input form="${formId}" name="name" value="${escapeHtml(bundle.name)}" maxlength="80" required></td><td><input form="${formId}" type="number" name="credits" value="${bundle.credits}" min="1" required></td><td><input form="${formId}" type="number" name="amountMinor" value="${bundle.amountMinor}" min="1" required> pence</td><td><label class="check-row"><input form="${formId}" type="checkbox" name="enabled" value="1"${bundle.enabled ? ' checked' : ''}><span>Enabled</span></label></td><td><form id="${formId}" method="post" action="/admin/credit-bundles/${bundle.id}"><button>Save</button></form></td></tr>`; }).join('');
  const kitRows = professionKits.map((kit) => {
    const formId = `profession-kit-${kit.id}`;
    const contents = kit.mines.map((mine) => `${mine.quantity > 1 ? `${mine.quantity}× ` : ''}${mine.name} (${mine.cityName})`).join(', ');
    const state = kit.enabled ? (kit.free ? `Free for ${formatDuration(kit.freeUntil - currentTime)}` : 'Paid') : 'Hidden';
    return `<tr><td><input form="${formId}" name="name" value="${escapeHtml(kit.name)}" maxlength="80" required><small>${escapeHtml(contents)}</small></td><td><textarea form="${formId}" name="description" maxlength="300" rows="3" required>${escapeHtml(kit.description)}</textarea></td><td><input form="${formId}" type="number" name="priceCredits" value="${kit.configuredPriceCredits}" min="1" required> credits</td><td><input form="${formId}" type="datetime-local" name="freeUntil" value="${dateTimeLocalValue(kit.freeUntil)}"><small>${escapeHtml(state)}</small></td><td><label class="check-row"><input form="${formId}" type="checkbox" name="enabled" value="1"${kit.enabled ? ' checked' : ''}><span>Enabled</span></label></td><td><form id="${formId}" method="post" action="/admin/profession-mine-kits/${kit.id}"><button>Save</button></form></td></tr>`;
  }).join('');
  const purchaseRows = purchases.map((purchase) => `<tr><td><a class="text-link" href="/admin/players/${purchase.playerId}">${escapeHtml(purchase.playerName)}</a></td><td>MT-${purchase.id}</td><td>${escapeHtml(purchase.bundleName)}</td><td>${escapeHtml(formatMoneyMinor(purchase.amountMinor, purchase.currency))}</td><td>${escapeHtml(purchase.status)}</td><td>${escapeHtml(purchase.providerOrderId || '—')}</td><td>${escapeHtml(purchase.reviewReason || '')}</td></tr>`).join('');
  return `${adminTabs('payments')}<section class="page-title"><div><p class="eyebrow">Payment operations</p><h1>Credits and PayPal</h1></div><p>Bundle changes affect new orders only. Every purchase keeps its original price and credit snapshot.</p></section><section><h2>Profession Kits</h2><p>A future free-until date makes a kit free. When that moment passes, its configured credit price takes over automatically. Kit contents remain fixed Aso mine collections.</p><div class="table-scroll"><table class="bundle-admin-table profession-kit-admin-table"><thead><tr><th>Name and mines</th><th>Description</th><th>Paid price</th><th>Free until</th><th>State</th><th></th></tr></thead><tbody>${kitRows}</tbody></table></div></section><section><h2>Credit bundles</h2><div class="table-scroll"><table class="bundle-admin-table"><thead><tr><th>Name</th><th>Credits</th><th>Price</th><th>State</th><th></th></tr></thead><tbody>${bundleRows}</tbody></table></div></section><section><h2>Recent purchases</h2><div class="table-scroll"><table><thead><tr><th>Miner</th><th>Receipt</th><th>Bundle</th><th>Amount</th><th>Status</th><th>Order</th><th>Review</th></tr></thead><tbody>${purchaseRows || '<tr><td colspan="7">No purchases yet.</td></tr>'}</tbody></table></div></section>`;
}

function thingCategoryGlossary(catalog) {
  const settings = catalog.settings;
  return {
    aircraft: {
      definition: 'Vehicles made for air routes and specialist missions. Search planes, bombers, and helicopters each have a distinct job.',
      usefulFor: 'Finding and attacking ore-thief bases, recovering stolen ore, and deploying, revealing, or bombing Oil Field positions.'
    },
    aircraftBomb: {
      definition: 'Payloads carried by bomber aircraft, with their destructive strength measured in buckets.',
      usefulFor: 'Damaging an exposed ore-thief base so its stolen ore can be recovered.'
    },
    ammunitionBox: {
      definition: `A sealed bulk container holding ${Number(settings.ammo_box_crates).toLocaleString('en-GB')} ammunition crates of one shot type.`,
      usefulFor: `Stocking a ship with up to ${(Number(settings.ammo_box_crates) * Number(settings.shots_per_crate)).toLocaleString('en-GB')} cannon shots after the box is opened.`
    },
    ammunitionCrate: {
      definition: `A crate of ${Number(settings.shots_per_crate).toLocaleString('en-GB')} cannonballs, chain shots, or grape shots.`,
      usefulFor: 'Loading a ship: cannonballs damage hull, chain shot damages speed, and grape shot attacks crew.'
    },
    avatarElement: {
      definition: 'A wearable or visual layer used to assemble a miner avatar, including bodies, clothing, accessories, and backgrounds.',
      usefulFor: 'Customising your public appearance. Equipped avatar things stop using inventory space; backgrounds also increase capacity.'
    },
    cannon: {
      definition: 'A ship-mounted weapon with its own damage value and rate of fire.',
      usefulFor: 'Attacking enemy ships during cannon combat. A cannon needs compatible ammunition loaded into the shared hold.'
    },
    collectible: {
      definition: 'Any ordinary thing without a dedicated machine, equipment, vehicle, or activator rule.',
      usefulFor: 'Completing meld recipes, supplying factories, trading between miners, or simply collecting. Some have no direct action until a recipe or buyer needs them.'
    },
    dwarfMiner: {
      definition: 'An independent miner who works from the city where it is stored and finds things in a rarity range determined by its tier.',
      usefulFor: 'Finding extra things without occupying a mine. Dwarves can also stow away on compatible land vehicles and ships.'
    },
    explosive: {
      definition: 'A consumable charge with a fixed bucket strength; detonation varies by the configured power range.',
      usefulFor: 'Forcing an immediate burst of mining in a chosen mine instead of waiting for its normal production cycle.'
    },
    gadget: {
      definition: 'A timed activator for one of the game’s utility gadgets. Its rarity determines how long the activation lasts.',
      usefulFor: 'Unlocking reports, extra mine capacity, safer or faster travel, and other specialised controls. You and the item must be in the current region’s capital to activate it; the effect then applies globally.'
    },
    landVehicle: {
      definition: 'A vehicle for land routes, with speed, cargo capacity, base attack, and armour statistics.',
      usefulFor: 'Moving things between connected cities and land combat. Base attack always deals damage; aggressive power is added while pillaging, and defensive power reduces enemy base attack while patrolling.'
    },
    minerRobot: {
      definition: 'A numbered robot model assigned to a mine in place of the basic mining bot.',
      usefulFor: 'Giving each mined result a model-based chance to be a damaged thing, which can later be repaired in a factory.'
    },
    miningEquipment: {
      definition: 'Mine-bot equipment fitted into slots such as belts, boots, pickaxes, drills, carts, hardhats, and lights.',
      usefulFor: 'Adding buckets per hour to a mine so that its next result arrives sooner.'
    },
    oilFieldBomb: {
      definition: 'A specialised machine part whose Oil Field behaviour is an attack rather than extraction or transport.',
      usefulFor: 'Bombing occupied Oil Field hexes and disrupting another miner’s deployed network.'
    },
    oilFieldMachine: {
      definition: 'A deployable Oil Field part with live power, flow, packing, intelligence, or defensive behaviour.',
      usefulFor: 'Building a connected field network that exposes oil, moves it through pipes, packs barrels, and protects the operation.'
    },
    ship: {
      definition: 'A vehicle for sea routes, with speed, cargo capacity, cannon portals, hull, and crew.',
      usefulFor: 'Moving cargo by sea, fishing and salvage opportunities, and naval combat using cannons, ammunition, and boarding strength.'
    },
    vehicleModification: {
      definition: 'A fitted vehicle part that changes one or more capacity, base attack, armour, aggressive power, defensive power, or dodge statistics.',
      usefulFor: 'Tuning a land vehicle, ship, or aircraft for hauling, speed, survival, or combat before it leaves a city.'
    },
    weapon: {
      definition: 'A cargo-fitted armament carrying aggressive-power and defensive-power values.',
      usefulFor: 'Increasing a vehicle’s combat strength while it is carried in the active loadout.'
    }
  };
}

const MINE_CATEGORY_USES = Object.freeze({
  Starter: 'Supplying an early collection of ordinary things while a new miner learns finding, storage, markets, and Melds.',
  Equipment: 'Finding mine-bot equipment that increases buckets per hour and shortens the wait for future discoveries.',
  Vehicles: 'Finding land transports for moving cargo, opening routes, and taking part in road combat.',
  Spices: 'Collecting and trading spices and combining them in their associated Meld recipes.',
  Weapons: 'Finding fitted vehicle weapons that contribute aggressive power while pillaging and defensive power while patrolling.',
  Bugs: 'Collecting, trading, and Meld-making with the game\'s many insects and other small creatures.',
  Music: 'Collecting and trading musical things and using them in music-family Melds.',
  Gadgets: 'Finding activators for timed utility effects such as reports, capacity, safer travel, and specialised controls.',
  Explosives: 'Finding charges that can be detonated in a mine to force an immediate burst of discoveries.',
  Ships: 'Finding sea transports for cargo routes, fishing, salvage, and cannon combat.',
  Cannons: 'Finding ship-mounted weapons with different damage and rates of fire.',
  Bait: 'Supplying Fisherman ships with bait that can be exchanged for matching-rarity fish while travelling.',
  Fish: 'Holding the catches produced by Fisherman voyages for collection, trade, and recipes.',
  Ore: 'Supplying the raw material used by factories; Ore can also be refined from recycled scraps and won from threats.',
  Robots: 'Finding mining robots whose model controls the chance that a mine discovers damaged things.',
  Tutorial: 'Preserving things used by the original introductory sequence; this is a legacy system category rather than a normal mine purchase.',
  Aircraft: 'Finding Search Planes, Bombers, and Helicopters for ore-thief and Oil Field missions.',
  Discontinued: 'Preserving retired things in the catalogue and player collections without returning them to ordinary mine production.',
  Avatars: 'Finding appearance layers for miner profiles; equipped backgrounds also increase inventory capacity.',
  Unreleased: 'Holding designed but unavailable things outside normal production until the game explicitly introduces them.',
  Dwarves: 'Finding autonomous miners that discover things from their city and may stow away aboard compatible vehicles.',
  Mods: 'Finding vehicle modifications that alter cargo capacity and combat statistics.',
  Machines: 'Finding parts deployed on the Oil Field for power, flow, packing, intelligence, attack, and defence.',
  Shrooms: 'Finding Bromo-only fungi for collection, trade, and the six Shroom Melds.',
  Wood: 'Finding Calbuco-only timber and Wood Screws for construction Melds that also consume Bolts.',
  Wisdom: 'Finding Dempo-only tactical haiku, from practical mining advice to outrageous strategies, for six Wisdom Melds.',
  'Electronic Devices': 'Finding Ebeko-only components and devices for six electronics Melds and possible future gadget construction.',
  Relics: 'Disturbing Fogo-only remains of a lost civilisation for six ominous Melds. Reports of a curse remain unverified.'
});

function mineCategoryGlossary(catalog) {
  const listFormatter = new Intl.ListFormat('en-GB', { style: 'long', type: 'conjunction' });
  return catalog.mineTypes.map((mineType) => {
    const items = catalog.items.filter((item) => Number(item.mineTypeId) === Number(mineType.id));
    const itemKinds = [...new Set(items.map((item) => itemMarketType(item, catalog).label))]
      .sort((first, second) => first.localeCompare(second));
    const kindSummary = itemKinds.length ? listFormatter.format(itemKinds) : 'no current thing types';
    const discoverable = items.filter((item) => item.canFind && !item.repairedItemId).length;
    const availability = discoverable
      ? `${discoverable.toLocaleString('en-GB')} intact discoverable things`
      : 'no things in ordinary discovery circulation';
    return {
      key: `mine-${mineType.id}`,
      anchor: `mine-category-${mineType.id}`,
      label: `${mineType.name} mine`,
      items,
      definition: `The ${mineType.name} mine category contains ${kindSummary} and currently has ${availability}.`,
      usefulFor: MINE_CATEGORY_USES[mineType.name]
        ?? `Finding ${kindSummary} for their direct gameplay effects, collection, trade, or Meld recipes.`,
      marketTypeKey: null
    };
  });
}

function fieldGuideSystems(catalog, player = null) {
  const settings = catalog.settings;
  const listFormatter = new Intl.ListFormat('en-GB', { style: 'long', type: 'conjunction' });
  const factoryBuild = catalog.factoryActions.find((action) => action.actionKind === 'build');
  const factoryProducts = catalog.factoryActions.filter((action) => action.actionKind === 'item');
  const millRegion = catalog.maps.find((map) =>
    Number(map.sortOrder) === Number(settings.mill_minimum_map_sort_order));
  const screwItem = catalog.byId.get(Number(settings.mill_reinforcement_screw_item_id));
  const reinforcementStrengths = settings.mill_reinforcement_absorption_by_rarity
    .slice(1, 7).map((strength) => Number(strength).toLocaleString('en-GB'));
  const tankerVehicle = catalog.vehicles.find((vehicle) => vehicle.cargoPolicy === 'oil-only');
  const trainVehicle = catalog.vehicles.find((vehicle) => vehicle.routePolicy === 'capital-link');
  const tankerItem = tankerVehicle ? catalog.byId.get(Number(tankerVehicle.itemId)) : null;
  const trainItem = trainVehicle ? catalog.byId.get(Number(trainVehicle.itemId)) : null;
  const tankerAction = tankerItem ? catalog.factoryActions.find((action) =>
    Number(action.outputItemId) === Number(tankerItem.id)) : null;
  const trainAction = trainItem ? catalog.factoryActions.find((action) =>
    Number(action.outputItemId) === Number(trainItem.id)) : null;
  const oreThiefOperation = oreThiefMissionDefinition(catalog);
  const oreThiefAircraftArt = oreThiefOperation?.stages.map((stage) =>
    `<span title="${escapeHtml(stage.item.name)}"><img src="${escapeHtml(stage.item.icon)}" alt=""></span>`).join('') ?? '';
  const creatureEntries = Object.entries(settings.world_creature_names);
  const creatureNames = (routeType) => creatureEntries
    .filter(([key]) => settings.world_creature_route_types[key] === routeType)
    .map(([, name]) => name);
  const rewardNames = (rewardType) => creatureEntries
    .filter(([key]) => settings.world_creature_reward_types[key] === rewardType)
    .map(([, name]) => name);
  const creatureArt = creatureEntries.map(([key, name]) =>
    `<span title="${escapeHtml(name)}"><img src="${escapeHtml(settings.world_creature_icons[key])}" alt=""></span>`).join('');
  const transportArt = [tankerItem, trainItem].filter(Boolean)
    .map((item) => `<span title="${escapeHtml(item.name)}"><img src="${escapeHtml(item.icon)}" alt=""></span>`).join('');
  const barrelLitres = Number(settings.oil_units_per_barrel) / Number(settings.oil_units_per_liter);
  const tiers = catalog.rarities.filter((rarity) =>
    Number(settings.world_creature_tier_weights[rarity.id]) > 0);
  const tierRange = tiers.length
    ? `${tiers[0].name} through ${tiers.at(-1).name}` : 'configured rarities';
  const facts = (pairs) => pairs.map(([label, value]) => ({ label, value }));
  const entries = [
    {
      anchor: 'guide-home-cities', label: 'Home cities', eyebrow: 'Regional operations',
      art: '<span class="guide-system-glyph" aria-hidden="true">&#8962;</span>',
      description: 'Every discovered region has one fixed regional capital shared by every miner. That capital is one of your home cities: the place where the region gathers its expensive, social, and industrial work.',
      facts: facts([
        ['Capital work', 'Create Melds, build factories, hire workers, and activate locally stored gadgets. Mills join the list from Calbuco onward.'],
        ['Your dwelling', 'Walk to Your home for large Things storage, three display plinths, and a bed where Legendary Things drift through changing dreams. Displayed things remain yours and still count against capacity.'],
        ['Outposts', 'Other cities keep independent mines, inventories, markets, routes, and prices; they are not interchangeable storage locations. Your Things shows only the region you are currently visiting.']
      ]),
      href: '/map', action: 'Find your regional capitals'
    },
    {
      anchor: 'guide-city-interiors', label: 'City interiors', eyebrow: 'On foot',
      art: '<span class="guide-system-glyph" aria-hidden="true">&#9673;</span>',
      description: 'Every city has its own persistent street plan and architectural treatment, with colours and details drawn from its regional map. You remain at the centre while the streets move around you.',
      facts: facts([
        ['Movement', 'Click an open street or a marked destination. After a rare roguelike encounter, the walk continues to the chosen destination.'],
        ['Places', 'Every city has a local bar. Mines, mine shop, departures, harbour, airfield, Oil Field, factories, mills, casino, and home appear where that city supports them.'],
        ['Street rewards', 'Read signs by clicking them, visit every marked location, and collect every Street Ore scrap. Completing all three records clears one repeatable Completionist Stone for that city.']
      ]),
      href: '/explore', action: 'Walk the current city'
    },
    {
      anchor: 'guide-city-bars', label: 'City bars', eyebrow: 'Private local chat',
      art: '<span class="guide-system-glyph guide-system-glyph-letter" aria-hidden="true">B</span>',
      description: 'Every city has one bar: a live meeting room for miners who have physically entered that exact city bar. Its conversation does not enter Worldwire or player inboxes.',
      facts: facts([
        ['Presence', 'Entering puts you on the room list. A live heartbeat keeps you there; leaving the page or going back to the street removes you.'],
        ['Privacy', 'Only miners presently inside the same bar can read or speak. Other cities have entirely separate rooms.'],
        ['Arrival', 'Conversation begins at the moment you enter. You cannot read messages sent before your current visit.']
      ]),
      href: '/explore/bar', action: 'Enter the local bar'
    },
    {
      anchor: 'guide-casino-circuit', label: 'Casino circuit', eyebrow: 'Regional machines',
      art: '<span class="guide-system-glyph guide-system-glyph-letter" aria-hidden="true">7</span>',
      description: 'Every casino carries the three house machines and one extra cabinet unique to its region. Regional results use different reel counts, screen shapes, and named win patterns while sharing the same atomic wager ledger.',
      facts: facts([
        ['House floor', "The Thing-O-Matic, Bromo Sporefall, and the King's Lockbox travel everywhere."],
        ['Regional circuit', REGIONAL_CASINO_MACHINES.map((machine) => `${machine.regionName}: ${machine.name} (${machine.rules.gridColumns}×${machine.rules.gridRows})`).join(' · ')],
        ['Travel matters', 'A regional cabinet can only be viewed or played while your miner is physically in its home region. Its history and personal statistics remain separate from every other machine.']
      ]),
      href: '/casino', action: 'Visit the local casino'
    },
    {
      anchor: 'guide-factories', label: 'Factories', eyebrow: 'Manufacturing',
      art: '<span class="guide-system-glyph guide-system-glyph-letter" aria-hidden="true">F</span>',
      description: `Factories turn city-local Ore and worker time into repairs, robots, aircraft, ammunition, Oil Field parts, Meld products, and ${factoryProducts.length.toLocaleString('en-GB')} configured manufactured outputs. Inputs are reserved as soon as a job is queued.`,
      facts: facts([
        ['Build', `${factoryBuild?.ore ?? 0} Ore in a regional capital. Construction needs ${(factoryBuild?.components ?? 0).toLocaleString('en-GB')} worker components.`],
        ['Capacity', `Up to ${Number(settings.max_active_factories).toLocaleString('en-GB')} owner-operated factories may run at once. Each factory holds ${Math.min(FACTORY_QUEUE_MAX_JOBS, Number(settings.factory_queue_limit)).toLocaleString('en-GB')} queued jobs and ${Number(settings.factory_max_workers).toLocaleString('en-GB')} workers.`],
        ['Markets', 'Built idle factories can be sold or rented. A rental lasts ten days, performs repairs only, and returns unfinished inputs when it expires.']
      ]),
      href: '/factories', action: 'Open factories'
    },
    {
      anchor: 'guide-mills', label: 'Mills', eyebrow: 'Woodworking',
      art: '<span class="guide-system-glyph guide-system-glyph-letter" aria-hidden="true">W</span>',
      description: 'A mill applies a sacrificial Wood reinforcement layer to an idle land vehicle or ship. Incoming structural damage strikes this layer first; when its strength reaches zero, the layer is gone.',
      facts: facts([
        ['Unlock', `One mill may be built in each eligible regional capital from ${millRegion?.name ?? 'Calbuco'} onward.`],
        ['Recipe', `One Wood thing plus ${Number(settings.mill_reinforcement_screw_quantity).toLocaleString('en-GB')} ${screwItem?.name ?? 'Wood Screws'} per reinforcement job.`],
        ['Strength', `${reinforcementStrengths.join(' / ')} protection from Common through Legendary Wood. Rarer Wood makes a tougher layer.`]
      ]),
      href: '/mills', action: 'Open mills'
    },
    {
      anchor: 'guide-oil-field', label: 'Oil Field', eyebrow: 'Regional extraction',
      art: `<span class="guide-system-image" title="Oil Field"><img src="${escapeHtml(OIL_FIELD_MAP_ICON_PATH)}" alt=""></span>`,
      description: `The Oil Field is a shared regional hex operation. Power machines, connect directional pipes, reveal Oil, defend the network, and feed packing machines; each complete barrel contains ${barrelLitres.toLocaleString('en-GB')} litres.`,
      facts: facts([
        ['Placement', 'Drag a machine part onto a valid flat-top hex. Replace or queue occupied parts; helicopters reach the outer construction ring.'],
        ['Intelligence and attack', 'Search Planes reveal field information. Bombers attack exposed machines; flak and drones defend them.'],
        ['Collection', 'Packed Oil arrives as barrels in the field city. Pipes share limited sources, while spills and rival machinery can alter the board.']
      ]),
      href: '/oil-field', action: 'Open the Oil Field'
    },
    {
      anchor: 'guide-ore-thief-operations', label: 'Ore-thief operations',
      eyebrow: 'Pilot missions',
      art: `<span class="guide-system-art-trio">${oreThiefAircraftArt}</span>`,
      description: 'Ore thieves keep one moving base in every region. Pilots work through the local operation: locate the base, destroy its defences, and bring the stolen Ore back by helicopter.',
      facts: facts([
        ['Search', `Launch ${catalogItemForSetting(catalog, 'search_plane_item_id').name}s from the region's mission airfield. A search may fail, and discoveries are personal to each miner and base.`],
        ['Bomb', `Once located, load a ${catalogItemForSetting(catalog, 'bomber_item_id').name} with bombs. Every bomb aboard is dropped; their combined bucket damage reduces the shared base defences.`],
        ['Recover', `After destruction, a ${catalogItemForSetting(catalog, 'helicopter_item_id').name} carries stolen Ore home up to its capacity. A fresh hidden base forms after the recovered stock is emptied.`],
        ['Risk', 'Aircraft that approach the base may be shot down. Capital-activated defensive gadgets apply to these sorties globally.']
      ]),
      href: '/vehicles', action: 'Open ore-thief operations'
    },
    {
      anchor: 'guide-manufactured-transports', label: 'Oil Tanker and Train Carriage',
      eyebrow: 'Factory-built transport', art: `<span class="guide-system-art-pair">${transportArt}</span>`,
      description: `These Unranked transports cannot be found in mines. A factory manufactures them as protected outputs. Once activated, a damaged vehicle repairs after ${formatDuration(CITY_VEHICLE_REPAIR_DURATION_MS)} parked in any city.`,
      facts: facts([
        ['Oil Tanker', tankerVehicle && tankerAction
          ? `${tankerVehicle.capacity} Oil barrels only; ${tankerVehicle.speed} km/h at sea; ${tankerVehicle.ship.hull} hull. Build for ${tankerAction.ore} Ore and ${tankerAction.components.toLocaleString('en-GB')} components.`
          : 'A high-hull sea transport reserved for Oil barrels.'],
        ['Train Carriage', trainVehicle && trainAction
          ? `${trainVehicle.capacity} loaded things at ${trainVehicle.speed} km/h. Build for ${trainAction.ore} Ore and ${trainAction.components.toLocaleString('en-GB')} components.`
          : 'A high-speed freight carriage for the capital network.'],
        ['Rail rule', 'Train Carriages travel only on open gateway rails between regional capitals. They cannot substitute local roads or hunt threats on them.'],
        ['Repairs', `Damaged land vehicles and aircraft must remain parked for ${formatDuration(CITY_VEHICLE_REPAIR_DURATION_MS)}. Ships separately regain one hull point per port hour. Repairs continue while you are offline.`]
      ]),
      href: '/vehicles', action: 'Open your fleet'
    },
    {
      anchor: 'guide-transport-orders', label: 'Peaceful, Patrol, and Pillage',
      eyebrow: 'Transport orders',
      art: '<span class="guide-system-glyph guide-system-glyph-letter" aria-hidden="true">P</span>',
      description: 'Every land or sea departure takes one order. The order controls which living traffic the transport tries to engage and how its land-combat powers are used. Automatic targets always remain within the transport\'s configured combat class; aircraft are always Peaceful.',
      facts: facts([
        ['Peaceful', 'Starts no combat against living player traffic, but Pillagers, route creatures, and the restless dead may still attack it. Optimise for cargo space and speed first: a faster Peaceful craft eludes a lone living aggressor before battle. Armour or hull, Wood reinforcement, dodge, and armed crew are the fallback when escape fails. Loaded-travel specialisations, Oil, and travel gadgets improve the run.'],
        ['Patrol', 'Seeks Pillagers in the same combat class; “Also engage patrols” also allows Patrol-versus-Patrol challenges. Optimise land patrols for defensive power, base attack, armour, dodge, and reinforcement. At sea, favour hull, speed, crew, a complete cannon battery, and a balanced ammunition supply. Guard and Bounty Hunter specialisations strengthen their matching patrol defence, while Shields reinforce defence globally.'],
        ['Pillage', 'Seeks Peaceful traffic in the same combat class; “Also engage patrols” permits challenges against Patrols too. An aggressive winner may take compatible cargo first, then Oil trips, or one eligible weapon, mod, or cannon. Keep free capacity for stolen cargo and fittings. Prioritise speed so prey cannot elude you, then aggressive power, base attack, dodge, and survivability; ships also need cannons, ammunition, and strong crew weapons. Highwayman and Pirate specialisations, plus Sharpeners, strengthen matching pillage offence.'],
        ['Loadout rule', 'Land weapons contribute aggressive power under Pillage and defensive power under Patrol; mods can add base attack, armour, aggressive power, defensive power, dodge, or capacity. Ship cannons fire regardless of order when combat begins: cannonballs attack hull, chain shot attacks speed, and grape shot attacks crew. Every fitting consumes capacity, so tune for the job instead of filling every slot automatically.']
      ]),
      href: '/vehicles', action: 'Prepare a transport'
    },
    {
      anchor: 'guide-shuttles', label: 'Automatic shuttles', eyebrow: 'Repeated cargo',
      art: '<span class="guide-system-glyph" aria-hidden="true">&#8644;</span>',
      description: 'An empty compatible transport can shuttle between two cities continuously. It loads at one end, unloads at the other, returns empty, and repeats until you cancel the contract. Land vehicles and ships can keep a Peaceful, Pillage, or Patrol order throughout the circuit.',
      facts: facts([
        ['Selection', 'Choose the travel order and any cargo categories, including Oil and Ore. All categories begin selected; eligible stock loads rarest first.'],
        ['Packed transports', 'Deactivate an empty, unfitted vehicle or ship to turn it back into a movable Thing. A compatible carrier or shuttle can take it to another city; activating it there still requires a valid route.'],
        ['Exclusions', 'Protected factory output is never auto-loaded. Oil Field machine parts remain in their field city unless that city has no Oil Field.'],
        ['Interruptions', 'Snow, closed routes, inventory overage, or missing eligible stock pause the next leg without losing delivered cargo.']
      ]),
      href: '/vehicles', action: 'Set up a shuttle'
    },
    {
      anchor: 'guide-world-threats', label: 'Living threats and restless dead',
      eyebrow: 'World events', art: `<span class="guide-creature-strip">${creatureArt}</span>`,
      description: `Natural event creatures are moving route actors, not instant encounters. Every region receives its own creature roll every ${formatDuration(Number(settings.world_creature_roll_min_interval_ms))} to ${formatDuration(Number(settings.world_creature_roll_max_interval_ms))}; active creatures travel, turn at cities, and may ambush compatible traffic.`,
      facts: facts([
        ['Living threats', `${listFormatter.format(creatureNames('land'))} roam land routes; ${listFormatter.format(creatureNames('sea'))} roam sea routes. Each can appear from ${tierRange}.`],
        ['Hunting', 'Launch any operational transport of the matching combat class and route type from either endpoint. Hunter and creature move to a real interception point, creatures counterattack, and only the killer receives the bounty.'],
        ['Rewards', `${listFormatter.format(rewardNames('treasure'))} carry treasure matching their own rarity tier. ${listFormatter.format(rewardNames('ore'))} drop tier-scaled Ore.`],
        ['Restless dead', 'Destroyed road vehicles, sunken ships, and defeated event creatures leave remains on their routes. The world scans each set of remains once; moon-adjusted chance may raise a Wraith Rider, a Ghost Ship, both kinds from the same batch of losses, or nothing at all. Those that rise patrol, attack peaceful traffic, and can be hunted from the same World events board.']
      ]),
      href: '/events', action: 'Open World events'
    }
  ];
  const index = entries.map((entry) =>
    `<a class="text-link" href="#${escapeHtml(entry.anchor)}">${escapeHtml(entry.label)}</a>`).join('');
  const cards = entries.map((entry) => {
    const detailRows = entry.facts.map((fact) =>
      `<div><dt>${escapeHtml(fact.label)}</dt><dd>${escapeHtml(fact.value)}</dd></div>`).join('');
    const action = player
      ? `<a class="text-link guide-system-link" href="${escapeHtml(entry.href)}">${escapeHtml(entry.action)} <span aria-hidden="true">&rarr;</span></a>` : '';
    return `<article class="guide-system-card" id="${escapeHtml(entry.anchor)}"><header><div><p class="eyebrow">${escapeHtml(entry.eyebrow)}</p><h3>${escapeHtml(entry.label)}</h3></div>${entry.art}</header><p>${escapeHtml(entry.description)}</p><dl>${detailRows}</dl>${action}</article>`;
  }).join('');
  return { count: entries.length, index, cards };
}

function fieldGuidePage(catalog, player = null) {
  const guide = thingCategoryGlossary(catalog);
  const systems = fieldGuideSystems(catalog, player);
  const labels = catalog.settings.item_type_labels;
  const grouped = new Map(Object.keys(guide).map((key) => [key, []]));
  for (const item of catalog.items) {
    const type = itemMarketType(item, catalog);
    if (!grouped.has(type.key)) throw new Error(`Missing Field guide entry for thing category ${type.key}.`);
    grouped.get(type.key).push(item);
  }
  const describedCount = [...grouped.values()].reduce((total, items) => total + items.length, 0);
  if (describedCount !== catalog.items.length) throw new Error('The Field guide does not cover every catalog item.');

  const thingCategories = [...grouped.entries()].map(([key, items]) => ({
    key,
    anchor: `thing-${key}`,
    label: labels[key],
    items,
    marketTypeKey: key,
    ...guide[key]
  }));
  const categories = [...thingCategories, ...mineCategoryGlossary(catalog)]
    .sort((first, second) => first.label.localeCompare(second.label)
      || first.anchor.localeCompare(second.anchor));
  const categoriesByLetter = new Map();
  for (const category of categories) {
    const letter = category.label.slice(0, 1).toLocaleUpperCase('en-GB');
    if (!categoriesByLetter.has(letter)) categoriesByLetter.set(letter, []);
    categoriesByLetter.get(letter).push(category);
  }
  const index = [...categoriesByLetter.keys()]
    .map((letter) => `<a class="text-link" href="#letter-${encodeURIComponent(letter.toLocaleLowerCase('en-GB'))}">${escapeHtml(letter)}</a>`)
    .join('');
  const sections = [...categoriesByLetter.entries()].map(([letter, entries]) => {
    const entryRows = entries.map((category) => {
      const representativeItems = [...new Map(category.items.map((item) => {
        const intact = item.repairedItemId ? catalog.byId.get(item.repairedItemId) : item;
        return [intact.id, intact];
      })).values()].sort((first, second) => first.name.localeCompare(second.name)).slice(0, 5);
      const examples = representativeItems.map((item) => player
        ? `<a class="thing-link rarity-${item.rarity}" href="/items/${item.id}">${escapeHtml(item.name)}</a>`
        : escapeHtml(item.name)).join(', ');
      const rarityNames = [...new Set(category.items.map((item) => Number(item.rarity)))]
        .sort((first, second) => first - second)
        .map((rarity) => catalogRarityName(catalog, rarity)).join(', ');
      const browse = player && category.marketTypeKey
        ? `<a class="glossary-browse" href="/exchange?type=${encodeURIComponent(category.key)}">Browse this category in Markets <span aria-hidden="true">→</span></a>`
        : '';
      return `<article class="glossary-entry" id="${escapeHtml(category.anchor)}">
        <header><h3>${escapeHtml(category.label)}</h3><span>${category.items.length.toLocaleString('en-GB')} ${category.items.length === 1 ? 'thing' : 'things'}</span></header>
        <p>${escapeHtml(category.definition)}</p>
        <dl><dt>Useful for</dt><dd>${escapeHtml(category.usefulFor)}</dd><dt>Examples</dt><dd>${examples || 'No things currently catalogued.'}</dd><dt>Rarities found</dt><dd>${escapeHtml(rarityNames || 'None')}</dd></dl>${browse}
      </article>`;
    }).join('');
    return `<section class="glossary-letter" id="letter-${escapeHtml(letter.toLocaleLowerCase('en-GB'))}"><header><strong>${escapeHtml(letter)}</strong><span>${entries.length} ${entries.length === 1 ? 'entry' : 'entries'}</span></header><div>${entryRows}</div></section>`;
  }).join('');
  return `<article class="glossary-page"><section class="page-title"><div><p class="eyebrow">Systems and every kind of thing</p><h1>Field guide</h1></div><p>You do not get help. You do get a working account of the world, its machinery, and what every category of thing is useful for.</p></section>
    <div class="glossary-summary" aria-label="Field guide coverage"><div><span>Systems</span><strong>${systems.count}</strong></div><div><span>Catalogue</span><strong>${catalog.items.length.toLocaleString('en-GB')} things</strong></div><div><span>Categories</span><strong>${categories.length}</strong></div><div><span>Coverage</span><strong>${describedCount === catalog.items.length ? 'Every thing' : `${describedCount.toLocaleString('en-GB')} things`}</strong></div></div>
    <section class="guide-systems" aria-labelledby="guide-systems-heading"><div class="section-heading"><div><p class="eyebrow">How the world works</p><h2 id="guide-systems-heading">Operations handbook</h2><p>The large systems which connect cities, possessions, industry, and danger.</p></div></div><nav class="guide-system-index" aria-label="System guide">${systems.index}</nav><div class="guide-system-grid">${systems.cards}</div></section>
    <section class="guide-catalogue" aria-labelledby="guide-catalogue-heading"><div class="section-heading"><div><p class="eyebrow">What the world contains</p><h2 id="guide-catalogue-heading">Things and mine categories</h2></div></div>
    <nav class="glossary-index" aria-label="Thing glossary letters"><strong>Jump to</strong>${index}</nav>
    <p class="glossary-note"><strong>How to read this guide.</strong> Functional entries cover every thing once. Mine entries provide a second view through every live mine category. Counts include damaged versions alongside their intact counterparts; examples and rarity coverage come from the current game catalogue, so they change with it.</p>
    <p class="glossary-note"><strong>Provenance.</strong> This is a guide to the live MineThings 2 rules, not a transcription of the old help pages. Its catalogue and systems descend from the game created by Japhet Stevens and are now restored and maintained by Serif. Category names are for people; the game keeps stable catalogue identities underneath them.</p>
    <div class="glossary-list">${sections}</div></section></article>`;
}

export function createApp(options = {}) {
  const ownsStore = !options.store;
  const store = options.store ?? new SqliteStore(options.databaseFile ?? path.join(ROOT, 'data', 'minethings.sqlite'), {
    legacyJsonFile: options.legacyJsonFile ?? path.join(ROOT, 'data', 'players.json')
  });
  const databaseFile = typeof store.filename === 'string' ? store.filename : '';
  const databaseAdministrationAvailable = databaseFile !== '' && databaseFile !== ':memory:';
  const backupDirectory = options.backupDirectory
    ?? (databaseAdministrationAvailable ? defaultBackupDirectory(databaseFile) : 'Not available');
  const scheduleRestart = typeof options.scheduleRestart === 'function'
    ? options.scheduleRestart : null;
  const repositoryUpdate = typeof options.updateRunner === 'function'
    ? options.updateRunner : null;
  let databaseAdministrationOperation = null;
  const runDatabaseAdministrationOperation = async (label, operation) => {
    if (databaseAdministrationOperation) {
      throw new Error(`${databaseAdministrationOperation} is already in progress.`);
    }
    databaseAdministrationOperation = label;
    try {
      return await operation();
    } finally {
      databaseAdministrationOperation = null;
    }
  };
  let initialCatalog = store.loadCatalog();
  if (!initialCatalog) {
    store.seedCatalog(options.catalog ?? loadLegacyCatalog(options.sqlPath));
    initialCatalog = store.loadCatalog();
  }
  store.ensureWorldMaps();
  initialCatalog = store.loadCatalog();
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
  const googleConfig = googleAuthConfiguration(options.googleAuth ?? {});
  const googleStatus = googleAuthReadiness(googleConfig, production);
  if (googleConfig.enabled && !googleStatus.ready) {
    throw new Error(`Google login is not configured: ${googleStatus.missing.join(', ')}.`);
  }
  const googleClient = options.googleAuthClient
    ?? (googleStatus.ready ? new GoogleAuthClient(googleConfig) : null);
  const googleLoginEnabled = Boolean(googleStatus.ready && googleClient);
  const configuredAdministrators = options.adminNames ?? process.env.MINETHINGS_ADMINS ?? '';
  for (const name of String(configuredAdministrators).split(',').map((entry) => entry.trim()).filter(Boolean)) {
    store.database.prepare('UPDATE players SET authority = MAX(authority, 5) WHERE name = ? COLLATE NOCASE')
      .run(name);
  }
  const now = options.now ?? Date.now;
  const random = options.random ?? Math.random;
  const shillSignalSecret = String(
    options.shillSignalSecret ?? process.env.SHILL_SIGNAL_SECRET ?? ''
  ).trim();
  if (shillSignalSecret && Buffer.byteLength(shillSignalSecret, 'utf8') < 32) {
    throw new Error('SHILL_SIGNAL_SECRET must contain at least 32 characters.');
  }
  const networkShillSignalsEnabled = Boolean(shillSignalSecret);
  const recordAuthenticatedNetwork = (playerId, request, authMethod, observedAt) => {
    if (!networkShillSignalsEnabled) return;
    const address = clientNetworkAddress(request);
    if (!address) return;
    const token = crypto.createHmac('sha256', shillSignalSecret)
      .update(`minethings-network-v1\0${address}`)
      .digest('hex');
    try {
      store.recordAccountNetworkObservation(playerId, token, authMethod, observedAt);
    } catch (error) {
      console.error(`Could not retain network evidence for miner ${playerId}: ${error.message}`);
    }
  };
  const previewBindings = new PreviewBindingRegistry({ now });
  store.expireMessages(now());
  const sessions = new Map();
  const activeUserWindowMs = Math.max(60000, Math.min(60 * 60 * 1000,
    Math.round(Number(options.activeUserWindowMs ?? 5 * 60 * 1000)) || 5 * 60 * 1000));
  const sessionRecord = (playerId, details = {}, seenAt = now()) => ({
    ...details, playerId, createdAt: seenAt, lastSeenAt: seenAt
  });
  const activeUserCount = (currentTime = now()) => new Set([...sessions.values()]
    .filter((entry) => Number(entry.lastSeenAt) >= currentTime - activeUserWindowMs)
    .map((entry) => Number(entry.playerId))).size;
  let maintenanceNotice = null;
  const maintenanceSnapshot = (currentTime = now()) => {
    if (!maintenanceNotice) return null;
    const remainingMinutes = Math.max(0,
      Math.ceil((maintenanceNotice.shutdownAt - currentTime) / 60000));
    return {
      ...maintenanceNotice,
      countdownLabel: remainingMinutes
        ? `in ${remainingMinutes} minute${remainingMinutes === 1 ? '' : 's'}` : 'now'
    };
  };
  const googleAuthAttempts = new Map();
  const pendingGoogleSignups = new Map();
  const pruneTemporaryAuth = (records, currentTime) => {
    for (const [key, record] of records) {
      if (record.expiresAt <= currentTime) records.delete(key);
    }
    while (records.size >= 1000) records.delete(records.keys().next().value);
  };
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
    // Starting the HTTP process must not itself advance the game. The worker begins
    // on the ordinary maintenance cadence, so a restart cannot synchronously mint
    // findings, complete work, roll world events, or deliver player messages.
    maintenanceRunning = true;
    const createMaintenanceWorker = () => {
      maintenanceWorker = new Worker(new URL('./maintenance-worker.js', import.meta.url), {
        workerData: { databaseFile: store.filename, busyTimeoutMs: 250 },
        execArgv: process.execArgv.filter((argument) => !argument.startsWith('--input-type'))
      });
      maintenanceWorker.unref();
      maintenanceWorker.on('message', (message) => {
        if (message?.type === 'tick-complete' || message?.type === 'tick-error') {
          maintenanceBusy = false;
        }
        // A failed subsystem can still leave committed work from earlier phases,
        // including an independently delivered findings digest.
        if (message?.type === 'tick-complete' || message?.type === 'tick-error') {
          wakeLiveUpdates();
        }
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
    };
    const requestMaintenance = () => {
      if (!maintenanceRunning || maintenanceBusy) return;
      if (!maintenanceWorker) createMaintenanceWorker();
      maintenanceBusy = true;
      maintenanceWorker.postMessage({ type: 'tick', now: now() });
    };
    maintenanceTimer = setInterval(requestMaintenance, maintenanceIntervalMs);
    maintenanceTimer.unref();
  };

  const liveClients = new Set();
  let liveCursor = store.latestLiveUpdateId();
  const requestedLiveDebounceMs = Number(options.liveUpdateDebounceMs ?? 1000);
  const liveDebounceMs = Number.isFinite(requestedLiveDebounceMs)
    ? Math.max(0, Math.min(5000, Math.round(requestedLiveDebounceMs))) : 1000;
  const allowedLiveTopics = new Set([
    'catalog', 'market', 'factories', 'chat', 'guilds', 'oil', 'vehicles', 'world',
    'payments', 'messages', 'players', 'stats', 'all'
  ]);
  let liveWakeTimer = null;
  let liveDrainRunning = false;
  let liveDrainAgain = false;
  let livePrunedAt = liveCursor;
  let liveDatabaseWatcher = null;
  let unsubscribeLiveWake = () => {};
  let liveUpdatesClosed = false;
  const sendLiveEvent = (client, event, payload, eventId = null) => {
    if (client.response.destroyed || client.response.writableEnded) {
      liveClients.delete(client);
      return false;
    }
    try {
      const idLine = Number.isSafeInteger(Number(eventId)) && Number(eventId) >= 0
        ? `id: ${Number(eventId)}\n` : '';
      client.response.write(`${idLine}event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
      return true;
    } catch {
      liveClients.delete(client);
      return false;
    }
  };
  const sendMaintenanceEvent = (client) => sendLiveEvent(client, 'maintenance',
    maintenanceNotice
      ? { active: true, shutdownAt: maintenanceNotice.shutdownAt, message: maintenanceNotice.message }
      : { active: false });
  const sendPresenceEvent = (client, currentTime = now()) => {
    if (client.all) sendLiveEvent(client, 'presence', {
      activeUsers: activeUserCount(currentTime),
      windowMinutes: Math.round(activeUserWindowMs / 60000)
    });
  };
  const broadcastMaintenance = () => {
    for (const client of liveClients) sendMaintenanceEvent(client);
  };
  const relevantLiveScopes = (client, events) => [...new Set(events
    .map((entry) => entry.scope)
    .filter((scope) => client.all || client.changeScopes.has(scope)))];
  const sendFindingEvents = (client, events) => {
    const findings = events.filter((entry) => entry.eventType === 'items-found'
      && entry.scope === client.playerScope && entry.payload);
    if (!findings.length) return;
    const delivered = sendLiveEvent(client, 'items-found', {
      noticeKey: `findings:${findings.map((entry) => entry.id).join(',')}`,
      revision: findings.at(-1).id,
      items: findings.map((entry) => entry.payload)
    }, findings.at(-1).id);
    const findingIds = findings.map((entry) => Number(entry.payload.findingId))
      .filter((id) => Number.isSafeInteger(id) && id > 0);
    if (delivered && findingIds.length) {
      store.acknowledgeFindingNotices(client.playerId, Math.max(...findingIds));
    }
  };
  const sendBattleEvents = (client, events) => {
    for (const event of events.filter((entry) => entry.eventType === 'battle-complete'
      && entry.scope === client.playerScope && entry.payload)) {
      sendLiveEvent(client, 'battle-complete', event.payload, event.id);
    }
  };
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
          sendFindingEvents(client, events);
          sendBattleEvents(client, events);
          const scopes = relevantLiveScopes(client, events);
          if (scopes.length) sendLiveEvent(
            client, 'change', { revision: liveCursor, scopes }, liveCursor
          );
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
    const heartbeatAt = now();
    for (const client of liveClients) {
      if (client.response.destroyed || client.response.writableEnded) liveClients.delete(client);
      else {
        client.session.lastSeenAt = heartbeatAt;
        client.response.write(': keep-alive\n\n');
      }
    }
    for (const client of liveClients) sendPresenceEvent(client, heartbeatAt);
  }, 20000);
  liveHeartbeatTimer.unref();

  const openLiveUpdates = (request, response, session, url) => {
    const endSession = (location, clearCookie = false) => {
      const headers = {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-store',
        Connection: 'close',
        'X-Accel-Buffering': 'no'
      };
      if (clearCookie) headers['Set-Cookie'] = clearSessionCookie(secureCookies);
      response.writeHead(200, headers);
      response.end(`event: session-ended\ndata: ${JSON.stringify({ location })}\n\n`);
    };
    if (!session || !store.hasPlayer(session.playerId)) {
      // EventSource retries HTTP authentication failures forever. Complete its
      // protocol instead so a page left open across a restart can return to sign-in.
      endSession('/', true);
      return;
    }
    if (!store.isEmailVerified(session.playerId)) {
      endSession('/verify-email');
      return;
    }
    const requestedTopics = String(url.searchParams.get('topics') ?? '')
      .split(',').map((topic) => topic.trim()).filter((topic) => allowedLiveTopics.has(topic));
    const player = store.database.prepare('SELECT authority FROM players WHERE id = ?')
      .get(session.playerId);
    const topicScopes = requestedTopics.map((topic) => `topic:${topic}`);
    const playerScope = `player:${session.playerId}`;
    const changeScopes = new Set(topicScopes);
    // Market mutations have their own scope. Private player rows mostly represent
    // background findings and must not rebuild a complete exchange page.
    if (!requestedTopics.includes('market')) changeScopes.add(playerScope);
    const client = {
      response,
      session,
      playerId: session.playerId,
      playerScope,
      scopes: new Set([playerScope, ...topicScopes]),
      changeScopes,
      all: requestedTopics.includes('all') && player?.authority > 0
    };
    session.lastSeenAt = now();
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    response.write('retry: 10000\n\n');
    const lastEventHeader = Array.isArray(request.headers['last-event-id'])
      ? request.headers['last-event-id'][0] : request.headers['last-event-id'];
    const since = Math.max(0, Number(url.searchParams.get('since')) || 0,
      Number(lastEventHeader) || 0);
    liveClients.add(client);
    let catchupCursor = since;
    let missed;
    do {
      missed = store.liveUpdatesAfter(catchupCursor, 10000,
        client.all ? null : client.scopes);
      if (!missed.length) break;
      catchupCursor = missed.at(-1).id;
      sendFindingEvents(client, missed);
      sendBattleEvents(client, missed);
      const missedScopes = relevantLiveScopes(client, missed);
      if (missedScopes.length) {
        sendLiveEvent(client, 'change', {
          revision: catchupCursor, scopes: missedScopes
        }, catchupCursor);
      }
    } while (missed.length >= 10000);
    const revision = store.latestLiveUpdateId();
    sendLiveEvent(client, 'ready', { revision }, revision);
    sendMaintenanceEvent(client);
    sendPresenceEvent(client);
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
    if (url.pathname === '/node/live-updates.js') {
      if (!staticFile(request, response, PUBLIC_ROOT, '/live-updates.js', 'no-store')) response.writeHead(404).end('Not found');
      return;
    }
    if (url.pathname === '/node/navigation.js') {
      if (!staticFile(request, response, PUBLIC_ROOT, '/navigation.js', 'no-store')) response.writeHead(404).end('Not found');
      return;
    }
    if (url.pathname === '/node/casino.js') {
      if (!staticFile(request, response, PUBLIC_ROOT, '/casino.js', 'no-store')) response.writeHead(404).end('Not found');
      return;
    }
    if (url.pathname === '/node/messages.js') {
      if (!staticFile(request, response, PUBLIC_ROOT, '/messages.js', 'no-store')) response.writeHead(404).end('Not found');
      return;
    }
    if (url.pathname === '/node/chat-filters.js') {
      if (!staticFile(request, response, PUBLIC_ROOT, '/chat-filters.js', 'no-store')) response.writeHead(404).end('Not found');
      return;
    }
    if (url.pathname === '/node/vehicle-journey.js') {
      if (!staticFile(request, response, PUBLIC_ROOT, '/vehicle-journey.js', 'no-store')) response.writeHead(404).end('Not found');
      return;
    }
    if (url.pathname === '/node/vehicle-shuttle.js') {
      if (!staticFile(request, response, PUBLIC_ROOT, '/vehicle-shuttle.js', 'no-store')) response.writeHead(404).end('Not found');
      return;
    }
    if (url.pathname === '/node/flash-modal.js') {
      if (!staticFile(request, response, PUBLIC_ROOT, '/flash-modal.js', 'no-store')) response.writeHead(404).end('Not found');
      return;
    }
    if (url.pathname === '/node/bot-build-burst.js') {
      if (!staticFile(request, response, PUBLIC_ROOT, '/bot-build-burst.js', 'no-store')) response.writeHead(404).end('Not found');
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
    if (url.pathname === '/node/city-explore.js') {
      if (!staticFile(request, response, PUBLIC_ROOT, '/city-explore.js', 'no-store')) response.writeHead(404).end('Not found');
      return;
    }
    if (url.pathname === '/node/bar-chat.js') {
      if (!staticFile(request, response, PUBLIC_ROOT, '/bar-chat.js', 'no-store')) response.writeHead(404).end('Not found');
      return;
    }
    if (url.pathname === '/node/home-dream.js') {
      if (!staticFile(request, response, PUBLIC_ROOT, '/home-dream.js', 'no-store')) response.writeHead(404).end('Not found');
      return;
    }
    if (url.pathname === '/node/admin-weather.js') {
      if (!staticFile(request, response, PUBLIC_ROOT, '/admin-weather.js', 'no-store')) response.writeHead(404).end('Not found');
      return;
    }
    if (url.pathname === '/node/map-background.png') {
      if (!staticFile(request, response, PUBLIC_ROOT, '/img/map-background.png')) response.writeHead(404).end('Not found');
      return;
    }
    if (url.pathname === '/node/google-sign-in.png') {
      if (!staticFile(request, response, PUBLIC_ROOT, '/img/google-sign-in.png')) response.writeHead(404).end('Not found');
      return;
    }
    if (/^\/node\/maps\/[a-z0-9-]+\.png$/.test(url.pathname)) {
      const relativePath = url.pathname.replace('/node/maps', '/img');
      if (!staticFile(request, response, PUBLIC_ROOT, relativePath)) response.writeHead(404).end('Not found');
      return;
    }
    if (url.pathname === '/node/landing-rebirth.jpg') {
      if (!staticFile(request, response, PUBLIC_ROOT, '/img/landing-rebirth.jpg')) response.writeHead(404).end('Not found');
      return;
    }
    if (url.pathname === '/node/favicon.svg') {
      if (!staticFile(request, response, PUBLIC_ROOT, '/favicon.svg')) response.writeHead(404).end('Not found');
      return;
    }
    if (/^\/node\/crypto\/[a-z]+\.svg$/.test(url.pathname)) {
      const relativePath = url.pathname.replace('/node/crypto', '/crypto');
      if (!staticFile(request, response, PUBLIC_ROOT, relativePath)) response.writeHead(404).end('Not found');
      return;
    }
    if (/^\/node\/creatures\/[a-z-]+\.svg$/.test(url.pathname)) {
      const relativePath = url.pathname.replace('/node/creatures', '/img/creatures');
      if (!staticFile(request, response, PUBLIC_ROOT, relativePath)) response.writeHead(404).end('Not found');
      return;
    }
    if (/^\/node\/home\/bed(?:-dream)?\.svg$/.test(url.pathname)) {
      const relativePath = url.pathname.replace('/node/home', '/img/home');
      if (!staticFile(request, response, PUBLIC_ROOT, relativePath)) response.writeHead(404).end('Not found');
      return;
    }
    if (/^\/node\/events\/[a-z-]+\.svg$/.test(url.pathname)) {
      const relativePath = url.pathname.replace('/node/events', '/img/events');
      if (!staticFile(request, response, PUBLIC_ROOT, relativePath)) response.writeHead(404).end('Not found');
      return;
    }
    if (/^\/node\/dwarf-images\/dwarf-\d+\.png$/.test(url.pathname)) {
      const relativePath = url.pathname.replace('/node/dwarf-images', '/img/items/dwarves');
      if (!staticFile(request, response, PUBLIC_ROOT, relativePath)) response.writeHead(404).end('Not found');
      return;
    }
    if (/^\/node\/shrooms\/(?:mine|shroom-[1-6](?:-[2-5])?)\.svg$/.test(url.pathname)) {
      const relativePath = url.pathname.replace('/node/shrooms', '/img/items/shrooms');
      if (!staticFile(request, response, PUBLIC_ROOT, relativePath)) response.writeHead(404).end('Not found');
      return;
    }
    if (/^\/node\/wood\/(?:mine|wood-[1-6](?:-[2-5])?)\.svg$/.test(url.pathname)) {
      const relativePath = url.pathname.replace('/node/wood', '/img/items/wood');
      if (!staticFile(request, response, PUBLIC_ROOT, relativePath)) response.writeHead(404).end('Not found');
      return;
    }
    if (/^\/node\/wisdom\/(?:mine|wisdom-[1-6](?:-[2-5])?)\.svg$/.test(url.pathname)) {
      const relativePath = url.pathname.replace('/node/wisdom', '/img/items/wisdom');
      if (!staticFile(request, response, PUBLIC_ROOT, relativePath)) response.writeHead(404).end('Not found');
      return;
    }
    if (/^\/node\/electronics\/(?:mine|electronic-[1-6](?:-[2-5])?)\.svg$/.test(url.pathname)) {
      const relativePath = url.pathname.replace('/node/electronics', '/img/items/electronics');
      if (!staticFile(request, response, PUBLIC_ROOT, relativePath)) response.writeHead(404).end('Not found');
      return;
    }
    if (/^\/node\/relics\/(?:mine|relic-[1-6](?:-[2-5])?)\.svg$/.test(url.pathname)) {
      const relativePath = url.pathname.replace('/node/relics', '/img/items/relics');
      if (!staticFile(request, response, PUBLIC_ROOT, relativePath)) response.writeHead(404).end('Not found');
      return;
    }
    if (/^\/node\/weapons\/weapon-\d+\.svg$/.test(url.pathname)) {
      const relativePath = url.pathname.replace('/node/weapons', '/img/items/weapons');
      if (!staticFile(request, response, PUBLIC_ROOT, relativePath)) response.writeHead(404).end('Not found');
      return;
    }
    if (/^\/node\/explosives\/explosive-\d+\.svg$/.test(url.pathname)) {
      const relativePath = url.pathname.replace('/node/explosives', '/img/items/explosives');
      if (!staticFile(request, response, PUBLIC_ROOT, relativePath)) response.writeHead(404).end('Not found');
      return;
    }
    if (/^\/node\/vehicles\/vehicle-\d+\.svg$/.test(url.pathname)) {
      const relativePath = url.pathname.replace('/node/vehicles', '/img/items/vehicles');
      if (!staticFile(request, response, PUBLIC_ROOT, relativePath)) response.writeHead(404).end('Not found');
      return;
    }
    if (/^\/node\/bugs\/bug-\d+\.svg$/.test(url.pathname)) {
      const relativePath = url.pathname.replace('/node/bugs', '/img/items/bugs');
      if (!staticFile(request, response, PUBLIC_ROOT, relativePath)) response.writeHead(404).end('Not found');
      return;
    }
    if (/^\/node\/music\/music-\d+\.svg$/.test(url.pathname)) {
      const relativePath = url.pathname.replace('/node/music', '/img/items/music');
      if (!staticFile(request, response, PUBLIC_ROOT, relativePath)) response.writeHead(404).end('Not found');
      return;
    }
    if (/^\/node\/gadgets\/gadget-\d+\.svg$/.test(url.pathname)) {
      const relativePath = url.pathname.replace('/node/gadgets', '/img/items/gadgets');
      if (!staticFile(request, response, PUBLIC_ROOT, relativePath)) response.writeHead(404).end('Not found');
      return;
    }
    if (/^\/node\/oil\/item-\d+\.svg$/.test(url.pathname)) {
      const relativePath = url.pathname.replace('/node/oil', '/img/items/oil');
      if (!staticFile(request, response, PUBLIC_ROOT, relativePath)) response.writeHead(404).end('Not found');
      return;
    }
    if (/^\/node\/ore\/item-\d+\.svg$/.test(url.pathname)) {
      const relativePath = url.pathname.replace('/node/ore', '/img/items/ore');
      if (!staticFile(request, response, PUBLIC_ROOT, relativePath)) response.writeHead(404).end('Not found');
      return;
    }
    if (/^\/node\/mods\/item-\d+\.svg$/.test(url.pathname)) {
      const relativePath = url.pathname.replace('/node/mods', '/img/items/mods');
      if (!staticFile(request, response, PUBLIC_ROOT, relativePath)) response.writeHead(404).end('Not found');
      return;
    }
    if (/^\/node\/equipment\/equipment-\d+\.svg$/.test(url.pathname)) {
      const relativePath = url.pathname.replace('/node/equipment', '/img/items/equipment');
      if (!staticFile(request, response, PUBLIC_ROOT, relativePath)) response.writeHead(404).end('Not found');
      return;
    }
    if (/^\/node\/avatars\/avatar-\d+\.svg$/.test(url.pathname)) {
      const relativePath = url.pathname.replace('/node/avatars', '/img/items/avatars');
      if (!staticFile(request, response, PUBLIC_ROOT, relativePath)) response.writeHead(404).end('Not found');
      return;
    }
    if (/^\/node\/map-icons\/(?:mine-\d+|oil-field)\.svg$/.test(url.pathname)) {
      const relativePath = url.pathname.replace('/node/map-icons', '/img/map-icons');
      if (!staticFile(request, response, PUBLIC_ROOT, relativePath)) response.writeHead(404).end('Not found');
      return;
    }
    if (/^\/node\/mines\/mine-(?:1|[4-9]|1[0-4]|21|24|25)\.svg$/.test(url.pathname)) {
      const relativePath = url.pathname.replace('/node/mines', '/img/items/mines');
      if (!staticFile(request, response, PUBLIC_ROOT, relativePath)) response.writeHead(404).end('Not found');
      return;
    }
    if (/^\/node\/starter\/item-\d+\.svg$/.test(url.pathname)) {
      const relativePath = url.pathname.replace('/node/starter', '/img/items/starter');
      if (!staticFile(request, response, PUBLIC_ROOT, relativePath)) response.writeHead(404).end('Not found');
      return;
    }
    if (/^\/node\/bait\/item-\d+\.svg$/.test(url.pathname)) {
      const relativePath = url.pathname.replace('/node/bait', '/img/items/bait');
      if (!staticFile(request, response, PUBLIC_ROOT, relativePath)) response.writeHead(404).end('Not found');
      return;
    }
    if (/^\/node\/cannons\/item-\d+\.svg$/.test(url.pathname)) {
      const relativePath = url.pathname.replace('/node/cannons', '/img/items/cannons');
      if (!staticFile(request, response, PUBLIC_ROOT, relativePath)) response.writeHead(404).end('Not found');
      return;
    }
    if (/^\/node\/fish\/item-\d+\.svg$/.test(url.pathname)) {
      const relativePath = url.pathname.replace('/node/fish', '/img/items/fish');
      if (!staticFile(request, response, PUBLIC_ROOT, relativePath)) response.writeHead(404).end('Not found');
      return;
    }
    if (/^\/node\/spices\/item-\d+\.svg$/.test(url.pathname)) {
      const relativePath = url.pathname.replace('/node/spices', '/img/items/spices');
      if (!staticFile(request, response, PUBLIC_ROOT, relativePath)) response.writeHead(404).end('Not found');
      return;
    }
    if (url.pathname === '/node/oil-field.js') {
      if (!staticFile(request, response, PUBLIC_ROOT, '/oil-field.js', 'no-store')) response.writeHead(404).end('Not found');
      return;
    }
    if (url.pathname === '/node/oil-field-renderers.js') {
      if (!staticFile(request, response, PUBLIC_ROOT, '/oil-field-renderers.js', 'no-store')) response.writeHead(404).end('Not found');
      return;
    }
    if (url.pathname === '/node/svgjs.min.js') {
      if (!staticFile(request, response, SVGJS_ROOT, '/svg.min.js')) response.writeHead(404).end('Not found');
      return;
    }
    const machineIconMatch = /^\/node\/machine-icons\/(.+)-(\d+)\.svg$/.exec(url.pathname);
    if (['GET', 'HEAD'].includes(request.method) && machineIconMatch) {
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
        const body = Buffer.from(svg);
        const etag = `"${crypto.createHash('sha256').update(body).digest('base64url')}"`;
        const headers = {
          'Content-Type': 'image/svg+xml; charset=utf-8',
          'Content-Length': body.length,
          'Cache-Control': IMAGE_CACHE_CONTROL,
          ETag: etag,
          'X-Content-Type-Options': 'nosniff'
        };
        if (request.headers['if-none-match'] === etag) {
          delete headers['Content-Length'];
          response.writeHead(304, headers).end();
        } else {
          response.writeHead(200, headers);
          response.end(request.method === 'HEAD' ? undefined : body);
        }
      }
      return;
    }
    if (url.pathname === '/app.css') {
      if (!staticFile(request, response, PUBLIC_ROOT, '/app.css', 'no-cache')) response.writeHead(404).end('Not found');
      return;
    }

    const requestCookies = cookies(request);
    const sessionId = requestCookies.mt_session;
    const session = sessions.get(sessionId);
    if (session) session.lastSeenAt = now();
    if (request.method === 'GET' && url.pathname === '/api/live-updates') {
      openLiveUpdates(request, response, session, url);
      return;
    }
    if (url.pathname === '/api/bar' || url.pathname === '/api/bar/messages') {
      if (!session || !store.hasPlayer(session.playerId)
        || !store.isEmailVerified(session.playerId)) {
        responseJson(response, 401, { ok: false, error: 'Log in to enter a city bar.' });
        return;
      }
      try {
        if (request.method === 'GET' && url.pathname === '/api/bar') {
          const visitToken = String(url.searchParams.get('visitToken') ?? '');
          if (!visitToken || visitToken !== session.barVisitToken) {
            throw new Error('This bar visit is no longer active.');
          }
          responseJson(response, 200, {
            ok: true,
            ...store.cityBarState(
              session.playerId, visitToken, now(), url.searchParams.get('afterId')
            )
          });
        } else if (request.method === 'POST' && url.pathname === '/api/bar/messages') {
          const { value } = await readJson(request);
          const visitToken = String(value.visitToken ?? '');
          if (!visitToken || visitToken !== session.barVisitToken) {
            throw new Error('This bar visit is no longer active.');
          }
          responseJson(response, 200, {
            ok: true,
            ...store.addCityBarChat(session.playerId, visitToken, value.body, now())
          });
        } else {
          responseJson(response, 405, { ok: false, error: 'Method not allowed.' });
        }
      } catch (error) {
        responseJson(response, error instanceof SyntaxError ? 400 : 409,
          { ok: false, error: error.message });
      }
      return;
    }
    const liveFragment = request.method === 'GET'
      && request.headers['x-minethings-live-update'] === '1';

    // loadCatalog returns the current versioned snapshot. The store reuses it
    // until either this connection or another SQLite connection changes catalog data.
    const catalog = store.loadCatalog();
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
        const result = store.detonateMine(
          session.playerId, mineId, Number(form.itemId), Number(form.count), catalog, now(), random
        );
        const recordedFindings = result.findingEvents?.length
          ? result.findingEvents : result.finds;
        const items = findingNoticeItems(recordedFindings, catalog, {
          source: 'explosives', cityId: result.cityId, foundAt: result.foundAt
        });
        if (items.length) {
          const eventIds = (result.findingEvents ?? []).map((finding) => finding.eventId)
            .filter((id) => Number.isSafeInteger(Number(id)) && Number(id) > 0);
          const findingIds = (result.findingEvents ?? []).map((finding) => finding.findingId)
            .filter((id) => Number.isSafeInteger(Number(id)) && Number(id) > 0);
          session.findingNotice = {
            noticeKey: eventIds.length
              ? `findings:${eventIds.join(',')}` : `findings:${crypto.randomUUID()}`,
            items
          };
          if (findingIds.length) {
            store.acknowledgeFindingNotices(session.playerId, Math.max(...findingIds));
          }
        }
        redirect(response, `/mines/${mineId}/explosives?detonated=1`);
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
      if (session && !maintenanceRunning && !liveFragment) {
        store.settleMines(now(), random);
        store.runBumUpdate(now(), random);
        store.runDwarfUpdate(now(), random);
        store.settleFactories(now());
        store.settleGadgetAutomations(now());
        store.sendDailyFindingDigests(now());
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
        player.maintenanceNotice = maintenanceSnapshot();
        const activeCity = catalogCityForId(catalog, player.cityId);
        const activeMap = catalog.maps.find((map) => map.id === activeCity.mapId);
        if (!activeMap) throw new Error(`Missing map for city ${activeCity.id}.`);
        player.cityName = activeCity.name;
        player.mapId = activeMap.id;
        player.mapName = activeMap.name;
        player.mapSlug = activeMap.slug;
        player.minerCount = store.countPlayers();
        player.cityOperationCounts = store.cityOperationCounts(player.id, now());
        const unseenChats = store.chatUnseenCounts(player.id, now());
        player.unseenChatMessages = unseenChats.chat;
        player.unseenGuildChatMessages = unseenChats.guildChat;
        player.weather = store.currentWeatherForMap(activeMap.id, now());
        player.batteryRemaining = Math.max(0, player.batteryExpiresAt - now());
        player.liveUpdateRevision = () => store.latestLiveUpdateId();
        if (player.emailVerified && !liveFragment) {
          player.registrationWelcomeMail = store.registrationWelcomePrompt(player.id);
        }
        const barRequest = /^\/explore\/bar(?:\/|$)/.test(url.pathname);
        const referredFromBar = /^\/explore\/bar(?:\/|$)/
          .test(requestDestination(request, ''));
        if (session?.barVisitToken && !barRequest && !liveFragment && referredFromBar) {
          store.leaveCityBar(player.id, session.barVisitToken);
          delete session.barVisitToken;
        }
      }
      flash = liveFragment ? undefined : session?.flash;
      if (session && !liveFragment) {
        delete session.flash;
        if (player) {
          player.quietNotice = session.quietNotice;
          player.meldReveal = session.meldReveal;
          player.botBuildNotice = session.botBuildNotice;
          if (player.emailVerified) player.findingNotice = session.findingNotice;
        }
        delete session.quietNotice;
        delete session.meldReveal;
        delete session.botBuildNotice;
        if (!player || player.emailVerified) delete session.findingNotice;
      }
    } catch (error) {
      const destination = requestDestination(request);
      if (request.method === 'GET' && destination === url.pathname) {
        responseRequestError(response, error);
      } else if (session) {
        session.flash = error.message;
        redirect(response, destination);
      } else {
        responseHtml(response, 400, layout('Try again', `<section class="error"><h1>Could not do that</h1><p>${escapeHtml(error.message)}</p><a class="text-link" href="/">Try again</a></section>`, null));
      }
      return;
    }
    const verificationPaths = new Set([
      '/verify-email', '/verify-email/resend', '/verify-email/email',
      '/verify-email/confirm', '/logout', '/legal', '/history', '/guide', '/help', '/health',
      '/auth/google', '/auth/google/callback', '/auth/google/register'
    ]);
    if (player && !player.emailVerified && !verificationPaths.has(url.pathname)) {
      redirect(response, '/verify-email');
      return;
    }
    const setFlash = (message) => { if (session) session.flash = message; };
    const setFindingNotice = (findings, metadata = {}) => {
      if (!session) return;
      const items = findingNoticeItems(findings, catalog, metadata);
      if (!items.length) return;
      session.findingNotice = {
        noticeKey: `findings:${crypto.randomUUID()}`,
        items
      };
      const findingIds = findings.map((finding) => Number(finding.findingId))
        .filter((id) => Number.isSafeInteger(id) && id > 0);
      if (findingIds.length) {
        store.acknowledgeFindingNotices(player.id, Math.max(...findingIds));
      }
    };
    const createLoginSession = (playerId, details = {}) => {
      const loginSession = sessionRecord(playerId, details);
      const catchup = store.claimLoginFindings(playerId);
      const items = findingNoticeItems(catchup.findings, catalog);
      if (items.length) {
        const quantity = items.reduce((sum, item) => sum + Number(item.quantity), 0);
        loginSession.findingNotice = {
          noticeKey: `findings:login:${playerId}:${catchup.throughId}`,
          title: 'Things found while you were away',
          message: `Since you were last online, your operation found ${quantity.toLocaleString('en-GB')} ${quantity === 1 ? 'thing' : 'things'}.`,
          items
        };
      }
      return loginSession;
    };
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
      responseHtml(response, 404, layout('Not found', '<section class="page-title"><h1>That tunnel goes nowhere.</h1><a class="text-link" href="/">Return home</a></section>', player));
      return false;
    };

    try {
      if (request.method === 'GET' && url.pathname === '/health') {
        response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify({ status: 'ok', items: catalog.items.length, players: store.countPlayers() }));
      } else if (request.method === 'GET' && url.pathname === '/history') {
        responseHtml(response, 200, layout('History', historyPage(), player, flash));
      } else if (request.method === 'GET' && url.pathname === '/legal') {
        responseHtml(response, 200, layout('Legal', legalPage(seller, paymentConfig), player, flash));
      } else if (request.method === 'GET' && url.pathname === '/auth/google') {
        if (!googleLoginEnabled) throw new Error('Google login is not configured on this server.');
        const attemptedAt = now();
        pruneTemporaryAuth(googleAuthAttempts, attemptedAt);
        const state = crypto.randomBytes(32).toString('base64url');
        const nonce = crypto.randomBytes(32).toString('base64url');
        const codeVerifier = crypto.randomBytes(48).toString('base64url');
        googleAuthAttempts.set(state, {
          nonce,
          codeVerifier,
          sessionId: player ? sessionId : null,
          playerId: player?.id ?? null,
          expiresAt: attemptedAt + 10 * 60 * 1000
        });
        redirect(response, googleClient.authorizationUrl({
          state,
          nonce,
          codeChallenge: googlePkceChallenge(codeVerifier)
        }));
      } else if (request.method === 'GET' && url.pathname === '/auth/google/callback') {
        if (!googleLoginEnabled) throw new Error('Google login is not configured on this server.');
        const completedAt = now();
        pruneTemporaryAuth(googleAuthAttempts, completedAt);
        const state = String(url.searchParams.get('state') ?? '');
        const attempt = googleAuthAttempts.get(state);
        if (attempt) googleAuthAttempts.delete(state);
        if (!attempt) throw new Error('This Google login attempt expired or was already used.');
        if (url.searchParams.has('error')) throw new Error('Google sign-in was cancelled.');
        const code = String(url.searchParams.get('code') ?? '');
        if (!code || code.length > 4096) throw new Error('Google did not return a valid sign-in code.');
        let profile;
        try {
          profile = await googleClient.exchangeCode(code, {
            codeVerifier: attempt.codeVerifier,
            nonce: attempt.nonce
          });
        } catch {
          throw new Error('Google could not verify this sign-in. Start again and choose your account.');
        }
        const identity = {
          provider: 'google', subject: profile.subject, email: profile.email
        };
        const identityOwner = store.playerByExternalIdentity('google', profile.subject, completedAt);
        if (attempt.playerId !== null) {
          if (attempt.sessionId !== sessionId || session?.playerId !== attempt.playerId) {
            throw new Error('Your miner session changed while Google was signing in. Start again.');
          }
          if (identityOwner && identityOwner.id !== attempt.playerId) {
            throw new Error('That Google account is already linked to another miner.');
          }
          const target = store.playerById(attempt.playerId, completedAt);
          if (!target || target.suspended) throw new Error('This miner cannot be linked.');
          store.linkExternalIdentity(target.id, identity, completedAt);
          session.flash = identityOwner
            ? 'This Google account is already linked.' : 'Google login linked successfully.';
          redirect(response, '/account');
        } else {
          const emailOwner = identityOwner ?? store.playerByEmail(profile.email, completedAt);
          if (emailOwner) {
            if (emailOwner.suspended) throw new Error('This miner account is suspended.');
            store.linkExternalIdentity(emailOwner.id, identity, completedAt);
            const id = crypto.randomBytes(32).toString('base64url');
            sessions.set(id, createLoginSession(emailOwner.id, {
              flash: 'Signed in with Google.'
            }));
            recordAuthenticatedNetwork(emailOwner.id, request, 'google', completedAt);
            redirect(response, '/', [
              sessionCookie(id, catalog, secureCookies), clearGoogleSignupCookie(secureCookies)
            ]);
          } else {
            pruneTemporaryAuth(pendingGoogleSignups, completedAt);
            const signupId = crypto.randomBytes(32).toString('base64url');
            pendingGoogleSignups.set(signupId, {
              profile,
              identity,
              expiresAt: completedAt + 10 * 60 * 1000
            });
            redirect(response, '/auth/google/register',
              googleSignupCookie(signupId, secureCookies));
          }
        }
      } else if (request.method === 'GET' && url.pathname === '/auth/google/register') {
        if (player) {
          redirect(response, '/');
          return;
        }
        const signupId = String(requestCookies.mt_google_signup ?? '');
        const pending = pendingGoogleSignups.get(signupId);
        if (!pending || pending.expiresAt <= now()) {
          if (signupId) pendingGoogleSignups.delete(signupId);
          responseHtml(response, 400, layout('Google signup expired',
            '<section class="error"><h1>Google signup expired</h1><p>Return home and start Google sign-in again.</p><a class="text-link" href="/">Return home</a></section>', null));
          return;
        }
        responseHtml(response, 200, layout('Choose miner name',
          googleRegistrationPage(pending.profile, catalog), null, flash));
      } else if (request.method === 'POST' && url.pathname === '/auth/google/register') {
        if (player) {
          redirect(response, '/');
          return;
        }
        const signupId = String(requestCookies.mt_google_signup ?? '');
        const pending = pendingGoogleSignups.get(signupId);
        const registeredAt = now();
        if (!pending || pending.expiresAt <= registeredAt) {
          if (signupId) pendingGoogleSignups.delete(signupId);
          throw new Error('Google signup expired. Start Google sign-in again.');
        }
        const form = await readForm(request);
        if (form.acceptTerms !== '1') {
          throw new Error('You must accept the Terms and Privacy Notice to register.');
        }
        const name = normalizeMinerName(form.name);
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
        if (store.findPlayer(name, registeredAt)) throw new Error('That miner name is already taken.');
        if (store.emailInUse(pending.profile.email)) {
          throw new Error('That email now belongs to another miner. Return home and sign in again.');
        }
        if (store.playerByExternalIdentity('google', pending.profile.subject, registeredAt)) {
          throw new Error('That Google account is already linked to a miner. Return home and sign in again.');
        }
        const saved = store.addPlayerWithExternalIdentity(createPlayer(
          name, pending.profile.email, await hashPasswordAsync(form.password), catalog,
          registeredAt, random
        ), { version: LEGAL_VERSION, acceptedAt: registeredAt }, pending.identity, registeredAt);
        pendingGoogleSignups.delete(signupId);
        const id = crypto.randomBytes(32).toString('base64url');
        const newSession = sessionRecord(saved.id, {
          playerId: saved.id,
          quietNotice: 'Miner created and verified with Google.'
        }, registeredAt);
        const starterItems = findingNoticeItems(saved.discoveries, catalog, {
          source: 'new-mine', cityId: saved.cityId, foundAt: registeredAt
        });
        if (starterItems.length) {
          newSession.findingNotice = {
            noticeKey: `findings:starter:${saved.id}`,
            items: starterItems
          };
        }
        sessions.set(id, newSession);
        recordAuthenticatedNetwork(saved.id, request, 'google', registeredAt);
        redirect(response, '/', [
          sessionCookie(id, catalog, secureCookies), clearGoogleSignupCookie(secureCookies)
        ]);
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
          delete session.flash;
          session.quietNotice = 'Email verified. Your miner is unlocked.';
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
          const transientNotices = {
            quietNotice: player.quietNotice,
            meldReveal: player.meldReveal,
            botBuildNotice: player.botBuildNotice,
            findingNotice: player.findingNotice,
            registrationWelcomeMail: player.registrationWelcomeMail,
            maintenanceNotice: player.maintenanceNotice
          };
          let battery = { expiresAt: player.batteryExpiresAt };
          if (!liveFragment) {
            store.expirePlayerRentalMines(player.id, now());
            battery = store.rechargeBattery(player.id, now());
            player = store.playerById(player.id, now());
          }
          player.currentPath = url.pathname;
          const activeCity = catalogCityForId(catalog, player.cityId);
          const activeMap = catalog.maps.find((map) => map.id === activeCity.mapId);
          if (!activeMap) throw new Error(`Missing map for city ${activeCity.id}.`);
          player.cityName = activeCity.name;
          player.mapId = activeMap.id;
          player.mapName = activeMap.name;
          player.mapSlug = activeMap.slug;
          player.cityOperationCounts = store.cityOperationCounts(player.id, now());
          player.weather = store.currentWeatherForMap(activeMap.id, now());
          player.batteryRemaining = Math.max(0, battery.expiresAt - now());
          Object.assign(player, transientNotices);
          player.liveUpdateRevision = () => store.latestLiveUpdateId();
        }
        responseHtml(response, 200, layout('Home', player
          ? dashboardPage(player, catalog, now()) : landingPage(catalog, googleLoginEnabled), player, flash));
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
        const newSession = sessionRecord(saved.id,
          { flash: 'Check your email to unlock this miner.' }, registeredAt);
        const starterItems = findingNoticeItems(saved.discoveries, catalog, {
          source: 'new-mine', cityId: saved.cityId, foundAt: registeredAt
        });
        if (starterItems.length) {
          newSession.findingNotice = {
            noticeKey: `findings:starter:${saved.id}`,
            items: starterItems
          };
        }
        sessions.set(id, newSession);
        recordAuthenticatedNetwork(saved.id, request, 'local', registeredAt);
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
        sessions.set(id, createLoginSession(found.id));
        recordAuthenticatedNetwork(found.id, request, 'local', attemptedAt);
        redirect(response, found.emailVerified ? '/' : '/verify-email',
          sessionCookie(id, catalog, secureCookies));
      } else if (request.method === 'POST' && url.pathname === '/logout') {
        if (sessionId) previewBindings.revokeSubject(sessionId);
        sessions.delete(sessionId);
        redirect(response, '/', clearSessionCookie(secureCookies));
      } else if (request.method === 'GET' && url.pathname === '/inventory') {
        if (requirePlayer()) responseHtml(response, 200, layout('Things', inventoryPage(
          player, catalog, store.remainingMeldItemNeeds(player.id),
          store.itemListingQuantities(player.id), store.fleetStandingByCounts(player.id)
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
        setFlash(`${gadget.displayName} active globally for ${formatDuration(gadget.expiresAt - now())}.`);
        redirect(response, '/gadgets');
      } else if (request.method === 'GET'
        && /^\/gadgets\/(autoloader|autolister|automaker|automelder)$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const behaviorKey = url.pathname.split('/')[2];
        const gadget = catalogGadgetForBehavior(catalog, behaviorKey);
        responseHtml(response, 200, layout(gadget.displayName,
          gadgetAutomationPage(store.gadgetAutomationReport(player.id, behaviorKey, now()), catalog),
          player, flash));
      } else if (request.method === 'POST'
        && /^\/gadgets\/(autoloader|autolister|automaker|automelder)\/configure$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const behaviorKey = url.pathname.split('/')[2];
        const form = await readForm(request);
        if (behaviorKey === 'autolister') {
          const [cityId, mineTypeId] = String(form.stockType ?? '').split(':');
          form.cityId = cityId;
          form.mineTypeId = mineTypeId;
        }
        store.configureGadgetAutomation(player.id, behaviorKey, form, now());
        setFlash(`${catalogGadgetForBehavior(catalog, behaviorKey).displayName} task queued. Its next round-robin turn is due now.`);
        redirect(response, `/gadgets/${behaviorKey}`);
      } else if (request.method === 'POST'
        && /^\/gadgets\/(autoloader|autolister|automaker|automelder)\/tasks\/\d+\/remove$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const segments = url.pathname.split('/');
        const behaviorKey = segments[2];
        store.removeGadgetAutomationTask(player.id, behaviorKey, Number(segments[4]), now());
        setFlash(`${catalogGadgetForBehavior(catalog, behaviorKey).displayName} task removed.`);
        redirect(response, `/gadgets/${behaviorKey}`);
      } else if (request.method === 'POST'
        && /^\/gadgets\/(autoloader|autolister|automaker|automelder)\/disable$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const behaviorKey = url.pathname.split('/')[2];
        store.disableGadgetAutomation(player.id, behaviorKey, now());
        setFlash(`${catalogGadgetForBehavior(catalog, behaviorKey).displayName} automation disabled.`);
        redirect(response, `/gadgets/${behaviorKey}`);
      } else if (request.method === 'POST'
        && /^\/gadgets\/(autoloader|autolister|automaker|automelder)\/enable$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const behaviorKey = url.pathname.split('/')[2];
        store.enableGadgetAutomation(player.id, behaviorKey, now());
        setFlash(`${catalogGadgetForBehavior(catalog, behaviorKey).displayName} automation enabled. Its next round-robin turn is due now.`);
        redirect(response, `/gadgets/${behaviorKey}`);
      } else if (request.method === 'GET' && url.pathname === '/gadgets/ledger') {
        if (!requirePlayer()) return;
        redirect(response, '/gadgets/autoloader');
      } else if (request.method === 'GET' && url.pathname === '/gadgets/medal-detector') {
        if (!requirePlayer()) return;
        redirect(response, '/gadgets/automelder');
      } else if (request.method === 'GET' && url.pathname === '/gadgets/spreadsheet') {
        if (!requirePlayer()) return;
        redirect(response, '/gadgets/automaker');
      } else if (request.method === 'GET' && url.pathname === '/gadgets/calculator') {
        if (!requirePlayer()) return;
        redirect(response, '/gadgets/autolister');
      } else if (request.method === 'GET' && url.pathname === '/melds') {
        if (requirePlayer()) responseHtml(response, 200,
          layout('Melds', meldsPage(player, catalog, url.searchParams.get('q') ?? '',
            store.listMiners('', 5)), player, flash));
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
      } else if (request.method === 'GET' && url.pathname === '/mills') {
        if (!requirePlayer()) return;
        const currentTime = now();
        const millState = store.millsForPlayer(player.id, currentTime);
        const completionFlash = millState.completions
          .map((completion) => `${completion.actionName} complete`).join(' · ');
        responseHtml(response, 200, layout('Mills', millsPage(player, catalog,
          millState, store.employees(player.id, currentTime), currentTime), player,
        [flash, completionFlash].filter(Boolean).join(' · ')));
      } else if (request.method === 'POST' && url.pathname === '/mills/build') {
        if (!requirePlayer()) return;
        store.buildMill(player.id, now());
        setFlash('Mill construction started. Assign workers to produce its components.');
        redirect(response, '/mills');
      } else if (request.method === 'POST' && /^\/mills\/\d+\/reinforce$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const form = await readForm(request);
        const mill = store.startMillReinforcement(player.id, Number(url.pathname.split('/')[2]),
          Number(form.vehicleId), Number(form.woodItemId), now());
        setFlash(mill.enqueued
          ? `Vehicle reinforcement added to mill ${mill.id}'s queue.`
          : 'Vehicle reinforcement started.');
        redirect(response, '/mills');
      } else if (request.method === 'POST' && /^\/mills\/\d+\/assign$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const form = await readForm(request);
        store.assignFactoryWorker(player.id, Number(url.pathname.split('/')[2]),
          Number(form.workerId), now());
        setFlash('Worker assigned to the mill.');
        redirect(response, '/mills');
      } else if (request.method === 'POST' && /^\/mills\/\d+\/hire-bot$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const form = await readForm(request);
        const bot = store.hireMillWorkerBot(player.id, Number(url.pathname.split('/')[2]),
          Number(form.tierId), now());
        setFlash(`${bot.name} hired at the mill for ${formatGold(bot.costGold)}g.`);
        redirect(response, '/mills');
      } else if (request.method === 'POST' && /^\/mills\/workers\/\d+\/idle$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        store.idleFactoryWorker(player.id, Number(url.pathname.split('/')[3]), now());
        setFlash('Worker idled.');
        redirect(response, '/mills');
      } else if (request.method === 'POST'
        && /^\/mills\/\d+\/queue\/\d+\/(cancel|up|down)$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const parts = url.pathname.split('/');
        const millId = Number(parts[2]);
        const queueId = Number(parts[4]);
        if (parts[5] === 'cancel') {
          store.cancelFactoryQueueJob(player.id, millId, queueId, now());
          setFlash('Reinforcement removed from the queue; its Wood and screws were returned.');
        } else {
          store.reorderFactoryQueueJob(player.id, millId, queueId, parts[5], now());
          setFlash('Mill queue reordered.');
        }
        redirect(response, '/mills');
      } else if (request.method === 'POST' && /^\/mills\/\d+\/(cancel|demolish)$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const parts = url.pathname.split('/');
        if (parts[3] === 'cancel') {
          const actionName = store.cancelMillAction(player.id, Number(parts[2]), now());
          setFlash(`${actionName} canceled; inputs were returned.`);
        } else {
          store.demolishMill(player.id, Number(parts[2]));
          setFlash('Mill demolished; construction ore returned.');
        }
        redirect(response, '/mills');
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
        const status = store.worldEventStatus(player.id, eventTime, { includeHistory: false });
        responseHtml(response, 200, layout('World Events',
          worldEventsPage(player, catalog, status, vehicles, eventTime), player, flash));
      } else if (request.method === 'GET' && /^\/events\/creatures\/\d+$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const eventTime = now();
        const creature = store.worldCreatureEventDetails(
          player.id, Number(url.pathname.split('/')[3]), eventTime
        );
        responseHtml(response, 200, layout(creature.name,
          worldCreatureEventDetailPage(creature, catalog, eventTime), player, flash));
      } else if (request.method === 'GET' && /^\/events\/ghosts\/\d+$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const eventTime = now();
        const ghost = store.ghostEventDetails(
          player.id, Number(url.pathname.split('/')[3]), eventTime
        );
        responseHtml(response, 200, layout(ghost.name,
          ghostEventDetailPage(ghost, catalog, eventTime), player, flash));
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
      } else if (request.method === 'POST'
        && /^\/events\/ghosts\/\d+\/(?:attack|hunt)$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const ghostId = Number(url.pathname.split('/')[3]);
        const form = await readForm(request);
        const result = store.attackGhost(
          player.id, ghostId, Number(form.vehicleId), now()
        );
        setFlash(`${result.vehicleName} is underway to intercept ${result.ghostName}. Expected contact in ${formatDuration(result.duration)} at ${Math.round(result.encounterLocation).toLocaleString('en-GB')} km along the route.`);
        redirect(response, '/events');
      } else if (request.method === 'GET' && url.pathname === '/vehicles') {
        if (!requirePlayer()) return;
        const vehicleTime = now();
        const vehicles = store.vehiclesForPlayer(player.id, vehicleTime, {
          includeRoutes: true, settle: !maintenanceRunning
        });
        const fleetPlayer = store.playerById(player.id, vehicleTime, { settle: false });
        const activationAvailability = new Map(Object.entries(fleetPlayer.inventory)
          .map(([itemId, count]) => [Number(itemId), Number(count)])
          .filter(([itemId, count]) => count > 0 && catalog.vehicleByItemId.has(itemId))
          .map(([itemId]) => [itemId, store.vehicleActivationAvailability(player.id, itemId)]));
        responseHtml(response, 200, layout('Vehicles',
          vehiclesPage(fleetPlayer, catalog, vehicles, vehicleTime,
            activationAvailability), player, flash));
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
        if (vehicle.status !== 'idle' || vehicle.cityId !== player.cityId || vehicle.shuttle) {
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
      } else if (request.method === 'POST' && url.pathname === '/vehicles/activate-all') {
        if (!requirePlayer()) return;
        const result = store.activateAllVehicles(player.id, now());
        const activated = result.activatedByItem
          .map((entry) => `${entry.quantity.toLocaleString('en-GB')} x ${entry.name}`).join(', ');
        const skipped = result.skipped
          .map((entry) => `${entry.quantity.toLocaleString('en-GB')} x ${entry.name}: ${entry.reason}`).join(' ');
        setFlash(result.activatedCount
          ? `Activated ${result.activatedCount.toLocaleString('en-GB')} vehicle${result.activatedCount === 1 ? '' : 's'} in ${result.cityName}${activated ? ` (${activated})` : ''}.${result.skippedCount ? ` ${result.skippedCount.toLocaleString('en-GB')} remain stored. ${skipped}` : ''}`
          : result.skippedCount
            ? `No stored vehicles can be activated in ${result.cityName}. ${skipped}`
            : `There are no stored vehicles in ${result.cityName}.`);
        redirect(response, '/vehicles#stored-vehicle-things');
      } else if (request.method === 'POST' && /^\/vehicles\/\d+\/shuttle$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const vehicleId = Number(url.pathname.split('/')[2]);
        const actionTime = now();
        const vehicle = store.vehicleDetails(player.id, vehicleId, actionTime);
        if (vehicle.status !== 'idle' || vehicle.cityId !== player.cityId) {
          throw new Error('Only an idle vehicle in your selected city can start a shuttle route.');
        }
        if (vehicle.shuttle) throw new Error('That vehicle already has a shuttle route.');
        if (vehicle.cargoSize !== 0) {
          throw new Error('Empty this vehicle\'s cargo hold before starting a shuttle route.');
        }
        if (!(Number(vehicle.capacity) > 0)) {
          throw new Error(
            'Free at least one cargo capacity slot before starting a shuttle route.'
          );
        }
        const form = await readForm(request);
        const routeId = Number(form.routeId);
        const allowedCategoryIds = new Set(
          selectableShuttleCategories(catalog).map((mineType) => Number(mineType.id))
        );
        const categoryIds = Object.keys(form).filter((key) => key.startsWith('category_'))
          .map((key) => Number(key.slice('category_'.length)));
        if (!categoryIds.length) throw new Error('Choose at least one cargo category.');
        if (categoryIds.some((mineTypeId) =>
          !Number.isSafeInteger(mineTypeId) || !allowedCategoryIds.has(mineTypeId))) {
          throw new Error('Choose only available cargo categories.');
        }
        const route = store.routesForVehicle(player.id, vehicleId, actionTime)
          .find((entry) => Number(entry.id) === routeId && !entry.mission
            && Number(entry.destinationCityId) !== Number(vehicle.cityId));
        if (!route) throw new Error('Choose a compatible shuttle destination from this city.');
        const started = store.startVehicleShuttle(
          player.id, vehicleId, routeId, actionTime, categoryIds,
          { travelOrder: form.travelOrder }
        );
        const originLabel = cityChoiceLabel(catalog, vehicle.cityId);
        const destinationLabel = vehicleRouteDestinationLabel(
          player, catalog, vehicle.cityId, route.destinationCityId
        );
        const loadedThings = Number(started.loadedThings ?? started.shuttle?.lastLoadedThings ?? 0);
        setFlash(started.paused
          ? `Shuttle route saved: ${originLabel} to ${destinationLabel}. Paused: ${started.reason}`
          : `Shuttle started: ${originLabel} to ${destinationLabel}. ${loadedThings} thing${loadedThings === 1 ? '' : 's'} loaded, rarest first.`);
        redirect(response, `/vehicles/${vehicleId}`);
      } else if (request.method === 'POST'
        && /^\/vehicles\/\d+\/shuttle\/cancel$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const vehicleId = Number(url.pathname.split('/')[2]);
        const actionTime = now();
        const cancelled = store.cancelVehicleShuttle(player.id, vehicleId, actionTime);
        setFlash(cancelled.wasTraveling
          ? `${cancelled.vehicleName}'s shuttle route is cancelled. It will finish this leg, unload on arrival, and stop.`
          : `${cancelled.vehicleName}'s shuttle route is cancelled.`);
        redirect(response, `/vehicles/${vehicleId}`);
      } else if (request.method === 'POST' && /^\/vehicles\/\d+\/send$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const vehicleId = Number(url.pathname.split('/')[2]);
        const form = await readForm(request);
        const additionalRouteIds = Object.entries(form)
          .filter(([key]) => /^journeyRoute_\d+$/.test(key))
          .sort(([first], [second]) => Number(first.slice(13)) - Number(second.slice(13)))
          .map(([, value]) => Number(value));
        const departureTime = now();
        const departureVehicle = store.vehicleDetails(player.id, vehicleId, departureTime);
        const journey = store.sendVehicle(player.id, vehicleId, Number(form.routeId), departureTime, {
          travelOrder: form.travelOrder,
          aggressiveVsSentry: form.attackSentry === 'on', additionalRouteIds
        });
        store.awardStone(player.id, 'Travelled', departureTime);
        const destinationName = journey.mission
          ? oreThiefAircraftMissionCopy(departureVehicle, catalog).dispatch
          : vehicleRouteDestinationLabel(
            player, catalog, player.cityId, journey.destinationCityId
          );
        setFlash(`Vehicle sent to ${destinationName}; travel time ${formatDuration(journey.duration)}.${journey.itineraryLegCount > 1 ? ` ${journey.itineraryLegCount - 1} onward leg${journey.itineraryLegCount === 2 ? '' : 's'} queued.` : ''}${journey.battleId ? ' An encounter occurred.' : ''}`);
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
        if (vehicle.status !== 'idle' || vehicle.cityId !== player.cityId || vehicle.shuttle) {
          throw new Error('Only an idle vehicle in your selected city can change cargo.');
        }
        const cargo = form.intent === 'rarest'
          ? store.rarestVehicleCargo(player.id, vehicleId)
          : Object.fromEntries(Object.entries(form)
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
        if (!['preview', 'rarest'].includes(form.intent)) {
          throw new Error('Preview this cargo before committing it.');
        }
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
        if (vehicle.status !== 'idle' || vehicle.cityId !== player.cityId || vehicle.shuttle) {
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
          : {
              modIds: expandCounts('mod').sort((first, second) => first - second),
              cannonIds: completeCannonSet(expandCounts('cannon'))
            };
        const kind = vehicle.type === 'sea' ? 'ship' : 'land';
        if (form.intent === 'commit') {
          consumePreview(sessionId, session, player.id, vehicleId, kind, selections,
            form.previewToken);
          if (vehicle.type === 'land') {
            store.fitVehicleLoadout(player.id, vehicleId, selections.modIds, selections.weaponIds);
            setFlash('Mod and weapon loadout committed together.');
          } else if (vehicle.type === 'sea') {
            store.fitShipLoadout(
              player.id, vehicleId, selections.cannonIds, selections.modIds
            );
            setFlash('Ship fitting and cannon loadout committed.');
          } else {
            throw new Error('This vehicle has no customizable fittings.');
          }
          redirect(response, vehicle.type === 'sea'
            ? `/vehicles/${vehicleId}/customize#ammunition` : `/vehicles/${vehicleId}`);
          return;
        }
        if (form.intent !== 'preview') throw new Error('Preview this loadout before committing it.');
        const preview = vehicle.type === 'land'
          ? store.previewVehicleFittings(player.id, vehicleId, selections.modIds, selections.weaponIds)
          : store.previewShipLoadout(
              player.id, vehicleId, selections.cannonIds, selections.modIds
            );
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
        redirect(response, `/vehicles/${vehicleId}/customize#ammunition`);
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
        redirect(response, `/vehicles/${vehicleId}/customize#ammunition`);
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
        setFlash('Vehicle deactivated. Activate it again from stored vehicle things.');
        redirect(response, '/vehicles#stored-vehicle-things');
      } else if (request.method === 'GET' && /^\/battles\/\d+$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const report = store.battleReport(player.id, Number(url.pathname.split('/')[2]));
        responseHtml(response, 200, layout('Battle report', battlePage(report), player, flash));
      } else if (request.method === 'GET' && url.pathname === '/ratings/prizes') {
        if (!requirePlayer()) return;
        responseHtml(response, 200, layout('Season prizes', combatSeasonPrizesPage(
          store.combatSeasonReport(now()), store.combatSeasonPrizes(), catalog
        ), player, flash));
      } else if (request.method === 'GET' && url.pathname === '/ratings') {
        if (!requirePlayer()) return;
        responseHtml(response, 200, layout('Ratings',
          ratingsPage(store.combatSeasonReport(
            now(), url.searchParams.get('class')
          ), catalog), player, flash));
      } else if (request.method === 'GET' && url.pathname === '/containers') {
        if (!requirePlayer()) return;
        responseHtml(response, 200, layout('Containers', containersPage(store.containersForPlayer(player.id)), player, flash));
      } else if (request.method === 'POST' && /^\/containers\/\d+\/buy$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const container = store.buyContainer(player.id, Number(url.pathname.split('/')[2]));
        store.awardStone(player.id, 'Expanded', now());
        setFlash(`${container.name} purchased. Inventory capacity is now ${container.itemLimit}.`);
        redirect(response, '/containers');
      } else if (request.method === 'GET' && url.pathname === '/explore') {
        if (!requirePlayer()) return;
        responseHtml(response, 200, layout(`Walk ${player.cityName}`,
          cityExplorePage(store.cityExploration(player.id)), player, flash));
      } else if (request.method === 'GET'
        && /^\/explore\/(?:park|landmark)$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const placeKey = url.pathname.endsWith('/park') ? 'dwarf-park' : 'city-landmark';
        const state = store.cityExploration(player.id);
        responseHtml(response, 200, layout(
          state.interior.points.find((entry) => entry.key === placeKey)?.label ?? 'City place',
          cityCivicPlacePage(state, placeKey), player, flash
        ));
      } else if (request.method === 'GET' && url.pathname === '/explore/bar') {
        if (!requirePlayer()) return;
        const bar = store.enterCityBar(player.id, now(), session.barVisitToken);
        session.barVisitToken = bar.visitToken;
        responseHtml(response, 200, layout(`The ${player.cityName} Bar`,
          cityBarPage(bar, player, catalog), player, flash));
      } else if (request.method === 'POST' && url.pathname === '/explore/bar/messages') {
        if (!requirePlayer()) return;
        const form = await readForm(request);
        if (!form.visitToken || form.visitToken !== session.barVisitToken) {
          throw new Error('This bar visit is no longer active.');
        }
        store.addCityBarChat(player.id, form.visitToken, form.body, now());
        redirect(response, '/explore/bar');
      } else if (request.method === 'POST' && url.pathname === '/explore/bar/leave') {
        if (!requirePlayer()) return;
        const form = await readForm(request);
        if (form.visitToken && form.visitToken === session.barVisitToken) {
          store.leaveCityBar(player.id, form.visitToken);
        }
        delete session.barVisitToken;
        redirect(response, '/explore');
      } else if (request.method === 'GET' && url.pathname === '/explore/home') {
        if (!requirePlayer()) return;
        const home = store.enterCityHome(player.id, now());
        if (home.stone) {
          setFlash(`You found your dwelling and entered it. The ${home.stone.name} Stone is cleared.`);
          redirect(response, '/explore/home');
          return;
        }
        responseHtml(response, 200, layout('Your home',
          cityHomePage(home, catalog, player), player, flash));
      } else if (request.method === 'POST' && url.pathname === '/explore/home/display') {
        if (!requirePlayer()) return;
        const form = await readForm(request);
        const home = store.setCityHomeDisplay(
          player.id, form.slot, form.itemId, now()
        );
        const slot = home.slots.find((entry) => entry.slot === Number(form.slot));
        setFlash(slot?.item
          ? `${slot.item.name} is now on display at home.${home.stone
            ? ` The ${home.stone.name} Stone is cleared.` : ''}`
          : 'The display space is empty again.');
        redirect(response, '/explore/home');
      } else if (request.method === 'GET'
        && /^\/explore\/(?:departures|harbour|airfield)$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const facilityKey = url.pathname.split('/')[2];
        const vehicles = store.vehiclesForPlayer(player.id, now(), {
          includeRoutes: true, settle: !maintenanceRunning
        });
        responseHtml(response, 200, layout('City transport',
          cityTransportFacilityPage(player, catalog, vehicles, facilityKey,
            facilityKey === 'airfield' ? store.thiefBaseStatus(player.id, now()) : null),
          player, flash));
      } else if (request.method === 'POST' && url.pathname === '/explore/move') {
        if (!player) {
          responseJson(response, 401, { ok: false, error: 'Log in to explore a city.' });
        } else {
          try {
            const { value } = await readJson(request);
            responseJson(response, 200, {
              ok: true, ...store.moveInCity(
                player.id, value.x, value.y, now(), random,
                value.destinationX, value.destinationY
              )
            });
          } catch (error) {
            responseJson(response, error instanceof SyntaxError ? 400 : 409,
              { ok: false, error: error.message });
          }
        }
      } else if (request.method === 'POST' && url.pathname === '/explore/sign') {
        if (!player) {
          responseJson(response, 401, { ok: false, error: 'Log in to read city notices.' });
        } else {
          try {
            const { value } = await readJson(request);
            responseJson(response, 200, {
              ok: true, ...store.readCityExplorationSign(player.id, value.signKey, now())
            });
          } catch (error) {
            responseJson(response, error instanceof SyntaxError ? 400 : 409,
              { ok: false, error: error.message });
          }
        }
      } else if (request.method === 'POST' && url.pathname === '/explore/encounter') {
        if (!player) {
          responseJson(response, 401, { ok: false, error: 'Log in to explore a city.' });
        } else {
          try {
            const { value } = await readJson(request);
            responseJson(response, 200, {
              ok: true,
              ...store.resolveCityExplorationEncounter(
                player.id, value.encounterId, value.choiceId, now(), random
              )
            });
          } catch (error) {
            responseJson(response, error instanceof SyntaxError ? 400 : 409,
              { ok: false, error: error.message });
          }
        }
      } else if (request.method === 'GET' && url.pathname === '/oil-field') {
        if (!requirePlayer()) return;
        const requestedAt = now();
        const field = maintenanceRunning
          ? store.oilFieldView(player.id, requestedAt) : store.oilField(player.id, requestedAt);
        responseHtml(response, 200,
          layout('Oil Field', field.available
            ? originalOilFieldPage(player, field, catalog, requestedAt)
            : unavailableOilFieldPage(player), player, flash));
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
        const form = await readForm(request);
        const result = store.claimOilBarrel(
          player.id, Number(url.pathname.split('/')[2]), now(), form.quantity === 'all', true
        );
        setFlash(`${result.claimedBarrels} ${catalogItemForSetting(catalog, 'oil_item_id').name} ${result.claimedBarrels === 1 ? 'barrel' : 'barrels'} moved to your city inventory.`);
        redirect(response, '/oil-field');
      } else if (request.method === 'GET' && url.pathname === '/map') {
        if (!requirePlayer()) return;
        responseHtml(response, 200, layout('Map', mapPage(player, catalog,
          store.knownCityIds(player.id, now()), url.searchParams.get('world') ?? '',
          store.oilFieldCityIds()), player, flash));
      } else if (url.pathname === '/move' && ['GET', 'POST'].includes(request.method)) {
        if (request.method === 'POST') request.resume();
        responseHtml(response, 410, layout('Regional capitals',
          '<section class="page-title"><div><p class="eyebrow">Regional capitals</p><h1>Home moves have ended</h1></div><a class="text-link" href="/map">Open world map</a></section><section class="capital-retired-note"><h2>One shared capital per region</h2><p>Aso’s starting city and each later region’s arrival gateway are now permanent capitals. Your things and existing assets have not been moved. Use the world map to find the capital and surrounding outposts.</p></section>',
          player, flash));
      } else if (request.method === 'POST' && /^\/cities\/\d+\/select$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const cityId = Number(url.pathname.split('/')[2]);
        store.changeCity(player.id, cityId, now());
        const city = catalogCityForId(catalog, cityId);
        setFlash(`Now viewing ${city.name}.`);
        redirect(response, requestDestination(request, '/'));
      } else if (request.method === 'GET' && url.pathname === '/credits') {
        if (requirePlayer()) {
          const viewedAt = now();
          responseHtml(response, 200, layout('Buy credits', creditsPage(
            player, store.creditBundles(true),
            store.professionMineKits(player.id, viewedAt, true),
            store.playerCreditPurchases(player.id), paymentReadiness, paymentConfig, viewedAt
          ), player, flash));
        }
      } else if (request.method === 'POST'
        && /^\/credits\/profession-kits\/\d+\/claim$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const claimedAt = now();
        const result = store.claimProfessionMineKit(
          player.id, Number(url.pathname.split('/')[3]), catalog, claimedAt, random
        );
        setFindingNotice(result.findingEvents, { source: 'new-mine', foundAt: claimedAt });
        store.awardStone(player.id, 'Invested', claimedAt);
        setFlash(result.priceCredits === 0
          ? `${result.kit.name} claimed free. ${result.mines.length} permanent Aso mines granted.`
          : `${result.kit.name} purchased for ${result.priceCredits.toLocaleString('en-GB')} credits. ${result.mines.length} permanent Aso mines granted.`);
        redirect(response, '/credits');
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
        redirect(response, '/guide');
      } else if (request.method === 'GET' && url.pathname === '/guide') {
        responseHtml(response, 200, layout('Field guide', fieldGuidePage(catalog, player), player, flash));
      } else if (request.method === 'GET' && url.pathname === '/market') {
        if (requirePlayer()) responseHtml(response, 200, layout('Shop', marketPage(player, catalog), player, flash));
      } else if (request.method === 'GET' && url.pathname === '/exchange') {
        if (requirePlayer()) responseHtml(response, 200, layout('Markets', exchangePage(
          player, catalog, store.purchasableItemListings(player.cityId, player.id), {
            query: url.searchParams.get('q') ?? '', type: url.searchParams.get('type') ?? '',
            sort: url.searchParams.get('sort') ?? 'recommended',
            remainingMeldNeeds: store.remainingMeldItemNeeds(player.id)
          }
        ), player, flash));
      } else if (request.method === 'GET' && url.pathname === '/crypto') {
        if (!requirePlayer()) return;
        responseHtml(response, 200, layout('Crypto Exchange', cryptoExchangePage(
          store.cryptoExchange(player.id, url.searchParams.get('range') ?? 'day', now()), catalogCityForId(catalog, player.cityId).name
        ), player, flash));
      } else if (request.method === 'POST' && /^\/crypto\/\d+\/(listings|bids)$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const form = await readForm(request);
        const parts = url.pathname.split('/');
        const order = store.placeCryptoOrder(player.id, Number(parts[2]),
          parts[3] === 'listings' ? 'sell' : 'buy', form.price, form.quantity, now());
        setFlash(`${order.side === 'sell' ? 'Listed' : 'Bid for'} ${order.quantity} ${order.currency.symbol} at ${formatGold(order.price)}g each.`);
        redirect(response, '/crypto');
      } else if (request.method === 'POST' && /^\/crypto\/\d+\/(buy-now|sell-now)$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const form = await readForm(request);
        const parts = url.pathname.split('/');
        const trade = parts[3] === 'buy-now'
          ? store.buyCryptoNow(player.id, Number(parts[2]), form.price, form.quantity, now())
          : store.sellCryptoNow(player.id, Number(parts[2]), form.price, form.quantity, now());
        setFlash(`${parts[3] === 'buy-now' ? 'Bought' : 'Sold'} ${trade.quantity} ${trade.currency.symbol} at ${formatGold(trade.price)}g each · ${formatGold(trade.gold)}g total.`);
        redirect(response, '/crypto');
      } else if (request.method === 'POST' && /^\/crypto\/orders\/\d+\/cancel$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        store.cancelCryptoOrder(player.id, Number(url.pathname.split('/')[3]));
        setFlash('Crypto order cancelled.');
        redirect(response, '/crypto');
      } else if (request.method === 'POST' && /^\/crypto\/orders\/\d+\/(buy|sell)$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const form = await readForm(request);
        const trade = store.fillCryptoOrder(player.id, Number(url.pathname.split('/')[3]), form.quantity, now());
        setFlash(`${trade.side === 'sell' ? 'Bought' : 'Sold'} ${trade.quantity} ${trade.currency.symbol} for ${formatGold(trade.gold)}g.`);
        redirect(response, '/crypto');
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
        responseHtml(response, 410, layout('Gold transfers disabled',
          '<section class="page-title"><div><p class="eyebrow">Retired</p><h1>Gold transfers are disabled</h1></div></section><p>Miners cannot send gold directly to other miners. Player trading remains available through local item and crypto markets.</p>',
          player, flash));
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
        if (requirePlayer()) responseHtml(response, 200, layout('Account', accountPage(
          player, catalog, {
            enabled: googleLoginEnabled,
            identity: store.externalIdentityForPlayer(player.id, 'google')
          }
        ), player, flash));
      } else if (request.method === 'POST' && url.pathname === '/account') {
        if (!requirePlayer()) return;
        const form = await readForm(request);
        store.updatePrivacy(player.id, {
          showMines: form.showMines === 'on'
        });
        setFlash('Privacy settings saved.');
        redirect(response, '/account');
      } else if (request.method === 'POST' && url.pathname === '/account/privacy') {
        if (!requirePlayer()) return;
        const form = await readForm(request);
        store.updatePrivacy(player.id, {
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
      } else if (request.method === 'POST' && url.pathname === '/messages/welcome/ignore') {
        if (!requirePlayer()) return;
        const form = await readForm(request);
        store.ignoreRegistrationWelcome(player.id, form.messageId);
        player.registrationWelcomeMail = null;
        redirect(response, '/');
      } else if (request.method === 'GET' && url.pathname === '/stats') {
        if (!requirePlayer()) return;
        responseHtml(response, 200, layout('Server Stats', statsPage(store.publicStats(now())), player, flash));
      } else if (request.method === 'GET' && url.pathname === '/admin') {
        if (!requireAdmin()) return;
        const adminTime = now();
        responseHtml(response, 200, layout('Administration', adminDashboardPage({
          ...store.adminOverview(adminTime),
          activeUsers: activeUserCount(adminTime),
          maintenanceNotice: maintenanceSnapshot(adminTime),
          currentTime: adminTime
        }), player, flash));
      } else if (request.method === 'GET' && url.pathname === '/admin/shills') {
        if (!requireAdmin()) return;
        const shillTime = now();
        const selectedPlayerId = Number(url.searchParams.get('playerId'));
        responseHtml(response, 200, layout('Admin · Shill signals', adminShillSignalsPage(
          store.adminShillSignals(shillTime, { playerId: selectedPlayerId }),
          networkShillSignalsEnabled
        ), player, flash));
      } else if (request.method === 'GET' && url.pathname === '/admin/backups') {
        if (!requireAdmin()) return;
        responseHtml(response, 200, layout('Admin · Backups and updates', adminBackupsPage({
          available: databaseAdministrationAvailable,
          backupDirectory,
          backups: databaseAdministrationAvailable ? listDatabaseBackups(backupDirectory) : [],
          pendingRestore: databaseAdministrationAvailable
            ? pendingDatabaseRestore(backupDirectory) : null,
          restartAvailable: Boolean(scheduleRestart),
          updateAvailable: Boolean(databaseAdministrationAvailable
            && scheduleRestart && repositoryUpdate)
        }), player, flash));
      } else if (request.method === 'POST' && url.pathname === '/admin/backups') {
        if (!requireAdmin()) return;
        if (!databaseAdministrationAvailable) {
          throw new Error('Database backups require a persistent SQLite database.');
        }
        const backup = await runDatabaseAdministrationOperation('A database backup', () =>
          createDatabaseBackup({
            database: store.database, databaseFile, backupDirectory,
            reason: 'Manual admin backup', createdBy: player.name, createdAt: now()
          }));
        store.adminRecordDatabaseOperation(player.id, 'database-backup-created',
          `${backup.fileName}; ${backup.size} bytes; manual`, now());
        setFlash(`Database backup ${backup.fileName} created.`);
        redirect(response, '/admin/backups');
      } else if (request.method === 'POST' && url.pathname === '/admin/backups/delete') {
        if (!requireAdmin()) return;
        if (!databaseAdministrationAvailable) {
          throw new Error('Database backups require a persistent SQLite database.');
        }
        const form = await readForm(request);
        if (form.confirm !== 'delete') throw new Error('Confirm that the backup should be deleted.');
        await runDatabaseAdministrationOperation('A database backup operation', async () => {
          deleteDatabaseBackup(backupDirectory, form.fileName);
        });
        store.adminRecordDatabaseOperation(player.id, 'database-backup-deleted',
          String(form.fileName), now());
        setFlash(`Database backup ${form.fileName} deleted.`);
        redirect(response, '/admin/backups');
      } else if (request.method === 'POST' && url.pathname === '/admin/backups/restore') {
        if (!requireAdmin()) return;
        if (!databaseAdministrationAvailable || !scheduleRestart) {
          throw new Error('Database restore and graceful restart are not configured for this process.');
        }
        const form = await readForm(request);
        if (form.confirm !== 'restore') throw new Error('Confirm that the live database should be replaced.');
        const selectedName = String(form.fileName ?? '');
        const safetyBackup = await runDatabaseAdministrationOperation('A database restore', async () => {
          const backup = await createDatabaseBackup({
            database: store.database, databaseFile, backupDirectory,
            reason: `Safety backup before restoring ${selectedName}`,
            createdBy: player.name, createdAt: now()
          });
          stageDatabaseRestore({
            backupDirectory, fileName: selectedName,
            requestedBy: player.name, requestedAt: now()
          });
          return backup;
        });
        store.adminRecordDatabaseOperation(player.id, 'database-backup-created',
          `${safetyBackup.fileName}; ${safetyBackup.size} bytes; pre-restore safety backup`, now());
        store.adminRecordDatabaseOperation(player.id, 'database-restore-requested',
          `${selectedName}; safety backup ${safetyBackup.fileName}`, now());
        response.once('finish', () => scheduleRestart(`restore database backup ${selectedName}`));
        responseHtml(response, 200, layout('Database restore scheduled', adminRestartPage(
          'Database restore scheduled',
          `${selectedName} has been verified and staged. A safety backup of the current database was created first.`
        ), player));
      } else if (request.method === 'POST' && url.pathname === '/admin/backups/update') {
        if (!requireAdmin()) return;
        if (!databaseAdministrationAvailable || !scheduleRestart || !repositoryUpdate) {
          throw new Error('Automatic update and graceful restart are not configured for this process.');
        }
        const form = await readForm(request);
        if (form.confirm !== 'update') throw new Error('Confirm that the server should be updated.');
        let backup;
        try {
          const result = await runDatabaseAdministrationOperation('A server update', async () => {
            backup = await createDatabaseBackup({
              database: store.database, databaseFile, backupDirectory,
              reason: 'Automatic backup before server update',
              createdBy: player.name, createdAt: now()
            });
            return repositoryUpdate(options.repositoryRoot ?? ROOT);
          });
          store.adminRecordDatabaseOperation(player.id, 'database-backup-created',
            `${backup.fileName}; ${backup.size} bytes; pre-update`, now());
          const gitSummary = String(result?.git ?? '').split(/\r?\n/u).filter(Boolean).at(-1)
            ?? 'Git update completed';
          store.adminRecordDatabaseOperation(player.id, 'database-update-completed',
            `${backup.fileName}; ${gitSummary}`.slice(0, 1000), now());
          response.once('finish', () => scheduleRestart('server update'));
          responseHtml(response, 200, layout('Server update installed', adminRestartPage(
            'Server update installed',
            `Backup ${backup.fileName} was created and the update completed successfully.`
          ), player));
        } catch (error) {
          if (backup) {
            store.adminRecordDatabaseOperation(player.id, 'database-backup-created',
              `${backup.fileName}; ${backup.size} bytes; failed update safety backup`, now());
          }
          store.adminRecordDatabaseOperation(player.id, 'database-update-failed',
            String(error.message).slice(0, 1000), now());
          setFlash(`Update failed; the server was not restarted. ${error.message}`);
          redirect(response, '/admin/backups');
        }
      } else if (request.method === 'POST' && url.pathname === '/admin/maintenance') {
        if (!requireAdmin()) return;
        const form = await readForm(request);
        const minutes = Number(form.minutes);
        const message = String(form.message ?? '').trim().replace(/\s+/gu, ' ');
        if (!Number.isSafeInteger(minutes) || minutes < 1 || minutes > 1440) {
          throw new Error('Maintenance warning time must be from 1 to 1,440 whole minutes.');
        }
        if (!message || message.length > 240) {
          throw new Error('Maintenance warning message must contain 1 to 240 characters.');
        }
        const publishedAt = now();
        const nextNotice = {
          publishedAt,
          shutdownAt: publishedAt + minutes * 60 * 1000,
          message,
          administratorId: player.id
        };
        store.adminRecordMaintenance(player.id, 'maintenance-warning-published',
          `${minutes} minutes; ${message}`, publishedAt);
        maintenanceNotice = nextNotice;
        broadcastMaintenance();
        setFlash(`Maintenance warning published for ${minutes} minute${minutes === 1 ? '' : 's'} from now.`);
        redirect(response, '/admin');
      } else if (request.method === 'POST' && url.pathname === '/admin/maintenance/cancel') {
        if (!requireAdmin()) return;
        if (maintenanceNotice) {
          const removedAt = now();
          store.adminRecordMaintenance(player.id, 'maintenance-warning-removed',
            `Previously scheduled for ${new Date(maintenanceNotice.shutdownAt).toISOString()}`,
            removedAt);
          maintenanceNotice = null;
          broadcastMaintenance();
          setFlash('Maintenance warning removed.');
        } else {
          setFlash('There was no maintenance warning to remove.');
        }
        redirect(response, '/admin');
      } else if (request.method === 'GET' && url.pathname === '/admin/payments') {
        if (!requireAdmin()) return;
        const paymentAdminTime = now();
        responseHtml(response, 200, layout('Admin · Payments', adminPaymentsPage(
          store.creditBundles(false),
          store.professionMineKits(null, paymentAdminTime, false),
          store.adminCreditPurchases(), paymentAdminTime
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
      } else if (request.method === 'POST'
        && /^\/admin\/profession-mine-kits\/\d+$/.test(url.pathname)) {
        if (!requireAdmin()) return;
        const form = await readForm(request);
        const freeUntil = String(form.freeUntil ?? '').trim()
          ? new Date(form.freeUntil).getTime() : 0;
        if (!Number.isSafeInteger(freeUntil) || freeUntil < 0) {
          throw new Error('Enter a valid free-until date and time, or leave it blank.');
        }
        const kit = store.adminUpdateProfessionMineKit(player.id,
          Number(url.pathname.split('/').pop()), {
            name: form.name, description: form.description,
            priceCredits: form.priceCredits, freeUntil,
            enabled: form.enabled === '1'
          }, now());
        setFlash(`${kit.name} updated. It is ${kit.enabled
          ? (kit.free ? 'currently free' : `${kit.priceCredits.toLocaleString('en-GB')} credits`)
          : 'hidden'}.`);
        redirect(response, '/admin/payments');
      } else if (request.method === 'GET' && url.pathname === '/admin/players') {
        if (!requireAdmin()) return;
        const query = url.searchParams.get('q') ?? '';
        responseHtml(response, 200, layout('Admin · Miners', adminPlayersPage(store.adminPlayers(query), query), player, flash));
      } else if (request.method === 'GET' && url.pathname === '/admin/routes') {
        if (!requireAdmin()) return;
        const routeTime = now();
        store.settleVehicles(routeTime);
        responseHtml(response, 200, layout('Admin · World routes',
          adminRoutesPage(store.adminRoutes(), catalog), player, flash));
      } else if (request.method === 'POST' && /^\/admin\/routes\/\d+$/.test(url.pathname)) {
        if (!requireAdmin()) return;
        const form = await readForm(request);
        const route = store.adminSetRoute(
          player.id, Number(url.pathname.split('/').pop()), form.open === '1', now()
        );
        setFlash(route.reopenedAutomatically
          ? `${route.city1_name} ↔ ${route.city2_name} had no journeys to drain and reopened immediately.`
          : `${route.city1_name} ↔ ${route.city2_name} is now ${route.open
            ? 'open' : `closed to new departures; ${route.activeJourneys} current journey${
              route.activeJourneys === 1 ? '' : 's'} may finish`}.`);
        redirect(response, '/admin/routes');
      } else if (request.method === 'GET' && url.pathname === '/admin/travelling') {
        if (!requireAdmin()) return;
        const trafficTime = now();
        responseHtml(response, 200, layout('Admin · Travelling things',
          adminTravellingThingsPage(
            store.adminTravellingThings(trafficTime), catalog, trafficTime
          ), player, flash));
      } else if (request.method === 'GET' && url.pathname === '/admin/world') {
        if (!requireAdmin()) return;
        const eventTime = now();
        responseHtml(response, 200, layout('Admin Â· World events', adminWorldEventsPage(
          store.adminWorldEventControls(eventTime, { includeTraffic: false }), catalog, eventTime
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
        const weatherImpacts = [];
        if (weather.vehiclesDamaged) {
          weatherImpacts.push(`${weather.vehiclesDamaged} land vehicle${
            weather.vehiclesDamaged === 1 ? '' : 's'} damaged`);
        }
        if (weather.shipsHit) {
          weatherImpacts.push(`${weather.shipsHit} ship${weather.shipsHit === 1 ? '' : 's'} struck`);
        }
        setFlash(`${weather.mapName} weather changed to ${weather.condition}.${
          weatherImpacts.length ? ` ${weatherImpacts.join('; ')}.` : ''}`);
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
        const keptCount = form.action === 'delete'
          ? Math.max(0, messageIds.length - changed) : 0;
        setFlash(`${changed} message${changed === 1 ? '' : 's'} updated.${keptCount
          ? ` ${keptCount} kept message${keptCount === 1 ? ' was' : 's were'} not deleted.`
          : ''}`);
        const filter = ['all', 'unread', 'deleted'].includes(form.filter) ? form.filter : 'all';
        const type = normalizedMessageTypeFilter(form.type);
        redirect(response, messagesPath(filter, type));
      } else if (request.method === 'GET' && /^\/messages\/view\/\d+$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const message = store.messageForPlayer(player.id, Number(url.pathname.split('/')[3]));
        if (message.details?.event === 'registration-welcome') {
          player.registrationWelcomeMail = null;
        }
        if (!message.read && !message.deleted) {
          player.unreadMessages = Math.max(0, Number(player.unreadMessages ?? 0) - 1);
        }
        if (!message.system && message.messageType === 'PM' && message.senderName) {
          redirect(response, `/messages/${encodeURIComponent(message.senderName)}`);
          return;
        }
        responseHtml(response, 200, layout(message.subject || 'Message',
          messageDetailPage(message, catalog), player, flash));
      } else if (request.method === 'GET' && url.pathname === '/guilds') {
        if (!requirePlayer()) return;
        const directory = store.guildDirectory(player.id);
        const guild = directory.membership ? store.guildForPlayer(player.id) : null;
        responseHtml(response, 200, layout('Guilds',
          guildDirectoryPage(player, directory, guild), player, flash));
      } else if (request.method === 'POST' && url.pathname === '/guilds/create') {
        if (!requirePlayer()) return;
        const form = await readForm(request);
        const guild = store.createGuild(player.id, form.name, now());
        setFlash(`${guild.name} founded. Every member has equal standing.`);
        redirect(response, '/guilds');
      } else if (request.method === 'POST' && /^\/guilds\/\d+\/join$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const guild = store.joinGuild(player.id, Number(url.pathname.split('/')[2]), now());
        setFlash(`You joined ${guild.name}.`);
        redirect(response, '/guilds');
      } else if (request.method === 'POST' && url.pathname === '/guilds/leave') {
        if (!requirePlayer()) return;
        const guild = store.leaveGuild(player.id);
        setFlash(`You left ${guild.name}.`);
        redirect(response, '/guilds');
      } else if (request.method === 'GET' && url.pathname === '/guilds/chat') {
        if (!requirePlayer()) return;
        const historyWindowMs = Number(catalog.settings.chat_history_window_ms);
        if (!Number.isFinite(historyWindowMs) || historyWindowMs <= 0) {
          throw new Error('The chat history window is invalid.');
        }
        const chatAt = now();
        const state = store.recentGuildChats(player.id, chatAt - historyWindowMs);
        store.markGuildChatSeen(player.id, state.chats, chatAt);
        player.unseenGuildChatMessages = 0;
        responseHtml(response, 200, layout('Guild chat', guildChatPage(
          player, state, catalog, historyWindowMs
        ), player, flash));
      } else if (request.method === 'POST' && url.pathname === '/guilds/chat') {
        if (!requirePlayer()) return;
        const form = await readForm(request);
        store.addGuildChat(player.id, form.body, now());
        store.awardStone(player.id, 'Chatted', now());
        redirect(response, '/guilds/chat');
      } else if (request.method === 'GET' && url.pathname === '/guilds/bank') {
        if (!requirePlayer()) return;
        responseHtml(response, 200, layout('Guild bank',
          guildBankPage(store.guildBank(player.id), catalog, player), player, flash));
      } else if (request.method === 'POST' && url.pathname === '/guilds/bank/deposit') {
        if (!requirePlayer()) return;
        const form = await readForm(request);
        const result = store.depositGuildItem(
          player.id, Number(form.itemId), form.quantity, now()
        );
        setFlash(`${result.quantity.toLocaleString('en-GB')} thing${result.quantity === 1 ? '' : 's'} deposited.`);
        redirect(response, '/guilds/bank');
      } else if (request.method === 'POST' && url.pathname === '/guilds/bank/withdraw') {
        if (!requirePlayer()) return;
        const form = await readForm(request);
        const result = store.withdrawGuildItem(
          player.id, Number(form.itemId), form.quantity, now()
        );
        setFlash(`${result.quantity.toLocaleString('en-GB')} thing${result.quantity === 1 ? '' : 's'} withdrawn to this city.`);
        redirect(response, '/guilds/bank');
      } else if (request.method === 'GET' && url.pathname === '/chat') {
        if (!requirePlayer()) return;
        const historyWindowMs = Number(catalog.settings.chat_history_window_ms);
        if (!Number.isFinite(historyWindowMs) || historyWindowMs <= 0) {
          throw new Error('The chat history window is invalid.');
        }
        const chatAt = now();
        const chats = store.recentChats(null, player.id, chatAt - historyWindowMs);
        store.markChatSeen(player.id, chats, chatAt);
        player.unseenChatMessages = 0;
        responseHtml(response, 200, layout('Public chat', chatPage(
          player, chats,
          store.chatIgnores(player.id), catalog, store.chatAppearance(player.id), historyWindowMs,
          store.chatRatingTiers(player.id)
        ), player, flash));
      } else if (request.method === 'GET' && url.pathname === '/casino') {
        if (!requirePlayer()) return;
        const selectedSpinId = Number(url.searchParams.get('spin'));
        const machineKey = url.searchParams.get('machine') || THING_O_MATIC_KEY;
        responseHtml(response, 200, layout('Casino', casinoPage(
          store.casinoState(player.id, selectedSpinId, machineKey)
        ), player, flash));
      } else if (request.method === 'POST' && url.pathname === '/casino/spin') {
        if (!requirePlayer()) return;
        const form = await readForm(request);
        const machineKey = form.machine || THING_O_MATIC_KEY;
        const spin = store.spinCasino(
          player.id, form.currency, form.wager, random, now(), machineKey
        );
        redirect(response, machineKey === THING_O_MATIC_KEY
          ? `/casino?spin=${spin.id}`
          : `/casino?machine=${encodeURIComponent(machineKey)}&spin=${spin.id}`);
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
        responseHtml(response, 410, layout('Banking removed', '<section class="page-title"><div><p class="eyebrow">Gone</p><h1>Banking has been removed</h1></div></section><p>Old banking accounts and contracts were settled during migration. Direct gold transfers between miners are disabled.</p>', player, flash));
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
        const market = store.mineMarket(mineTypeId, player.cityId, player.id, now());
        const cityName = catalogCityForId(catalog, player.cityId).name;
        responseHtml(response, 200, layout(`${market.name} Mine Market`,
          mineMarketPage(player, market, cityName), player, flash));
      } else if (request.method === 'GET' && /^\/market\/items\/\d+$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const item = catalog.byId.get(Number(url.pathname.split('/').pop()));
        if (!item) throw new Error('Item not found.');
        const market = store.marketForItem(item.id, player.cityId, player.id);
        const cityName = catalogCityForId(catalog, player.cityId).name;
        responseHtml(response, 200, layout(`${item.name} market`, itemMarketPage(player, item, market, cityName, catalog), player, flash));
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
        const description = machineInfo ? machineInfo.text : playerFacingItemDescription(item, catalog);
        const descriptionHtml = escapeHtml(description).replace(/\r?\n/gu, '<br>');
        const content = `<section class="detail rarity-${item.rarity}${item.damaged ? ' detail-damaged' : ''}" data-item-id="${item.id}"><div class="detail-art"><img class="detail-image${item.hasLargeImage ? '' : ' detail-image-fallback'}" src="${item.largeImage}" alt="${escapeHtml(item.name)}" data-large-image="${item.hasLargeImage ? 'original' : 'fallback'}"></div><div class="detail-copy"><p class="eyebrow">${escapeHtml(item.rarityName)}</p><h1>${escapeHtml(item.name)}</h1><p>${descriptionHtml}</p>${itemDetailStats(item, catalog, player)}${player ? `<div class="button-row"><a class="button" href="/market/items/${item.id}">Open local market</a><a class="button secondary" href="/inventory">Back to things</a></div>` : '<a class="text-link" href="/">Back</a>'}</div></section>${recycleSettings}`;
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
        responseHtml(response, 200, layout('Equip your miner',
          mineEquipmentPage(player, catalog, mine, now()), player, flash));
      } else if (request.method === 'GET' && /^\/mines\/\d+\/explosives$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const mineId = Number(url.pathname.split('/')[2]);
        const mine = player.mines.find((candidate) => candidate.id === mineId
          && candidate.active && candidate.cityId === player.cityId);
        if (!mine) throw new Error('Mine not found.');
        responseHtml(response, 200, layout('Mine with explosives',
          mineExplosivesPage(player, catalog, mine,
            url.searchParams.get('detonated') === '1'), player, flash));
      } else if (request.method === 'POST' && /^\/mines\/\d+\/equipment\/\d+\/equip$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const parts = url.pathname.split('/');
        const changedAt = now();
        const { result } = store.mutatePlayer(player.id, (current) =>
          equipMine(current, catalog, Number(parts[2]), Number(parts[4]), changedAt),
        null, changedAt);
        const item = catalog.byId.get(Number(parts[4]));
        setFlash(`${item.name} equipped${result.replacedItemId ? '; the previous item returned to local inventory' : ''}.`);
        redirect(response, `/mines/${parts[2]}/equipment`);
      } else if (request.method === 'POST' && /^\/mines\/\d+\/equipment\/\d+\/unequip$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const parts = url.pathname.split('/');
        const changedAt = now();
        const { result: itemId } = store.mutatePlayer(player.id, (current) =>
          unequipMine(current, catalog, Number(parts[2]), Number(parts[4]), changedAt),
        null, changedAt);
        setFlash(`${catalog.byId.get(itemId).name} returned to local inventory.`);
        redirect(response, `/mines/${parts[2]}/equipment`);
      } else if (request.method === 'POST' && /^\/mines\/\d+\/robots\/\d+\/assign$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const parts = url.pathname.split('/');
        const { result } = store.mutatePlayer(player.id, (current) =>
          assignRobot(current, catalog, Number(parts[2]), Number(parts[4])), null, now());
        const robot = catalog.robotByItemId.get(Number(parts[4]));
        setFlash(`MR${robot.model} assigned${result.replacedItemId ? '; the previous robot returned to local inventory' : ''}.`);
        redirect(response, `/mines/${parts[2]}/equipment`);
      } else if (request.method === 'POST' && /^\/mines\/\d+\/robots\/unassign$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const mineId = Number(url.pathname.split('/')[2]);
        const { result: itemId } = store.mutatePlayer(player.id, (current) =>
          unassignRobot(current, catalog, mineId), null, now());
        setFlash(`${catalog.byId.get(itemId).name} returned to local inventory.`);
        redirect(response, `/mines/${mineId}/equipment`);
      } else if (request.method === 'POST' && /^\/mines\/\d+\/detonate$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const mineId = Number(url.pathname.split('/')[2]);
        const form = await readForm(request);
        store.detonateMine(
          player.id, mineId, Number(form.itemId), Number(form.count), catalog, now(), random
        );
        redirect(response, `/mines/${mineId}/explosives?detonated=1`);
      } else if (request.method === 'POST' && /^\/mines\/\d+\/prioritize$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const changedAt = now();
        const { result: mine } = store.mutatePlayer(player.id, (current) =>
          prioritizeMine(current, catalog, Number(url.pathname.split('/')[2]), changedAt),
        null, changedAt);
        const type = catalogMineTypeForId(catalog, mine.mineTypeId);
        setFlash(`${type.name} is now top priority.`);
        redirect(response, '/');
      } else if (request.method === 'POST' && /^\/mines\/\d+\/oil$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const changedAt = now();
        const { result: mine } = store.mutatePlayer(player.id, (current) =>
          oilMineBot(current, catalog, Number(url.pathname.split('/')[2]), changedAt), null, changedAt);
        setFlash(`Bot oiled for ${formatDuration(Number(catalog.settings.mine_oil_duration_ms))}. It now mines ${formatGold(Number(catalog.settings.mine_oil_buckets_per_hour))} extra buckets per hour.`);
        redirect(response, '/');
      } else if (request.method === 'POST' && /^\/bot-parts\/\d+\/buy$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const purchasedAt = now();
        const part = store.buyBotPart(
          player.id, Number(url.pathname.split('/')[2]), purchasedAt
        );
        session.botBuildNotice = botBuildComicNotice(part, purchasedAt);
        redirect(response, '/');
      } else if (request.method === 'POST' && /^\/mines\/\d+\/mode$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const mineId = Number(url.pathname.split('/')[2]);
        const form = await readForm(request);
        const mode = String(form.mode ?? (form.mineThings === '1' ? 'things' : 'resource'));
        const cryptoMatch = /^crypto:(\d+)$/.exec(mode);
        const cryptoId = cryptoMatch ? Number(cryptoMatch[1]) : null;
        const currentMine = player.mines.find((entry) => entry.id === mineId);
        const city = currentMine ? catalogCityForId(catalog, currentMine.cityId) : null;
        if (cryptoId && !cryptoTypesForMap(city?.mapId).some((entry) => entry.id === cryptoId)) {
          throw new Error('That currency is not available in this region.');
        }
        const { result: mine } = store.mutatePlayer(player.id, (current) =>
          setMineMode(current, mineId, cryptoId ? 'crypto' : mode === 'things' ? 'things' : 'resource', cryptoId), null, now());
        const type = catalogMineTypeForId(catalog, mine.mineTypeId);
        const selectedCrypto = mine.cryptoTypeId ? cryptoType(mine.cryptoTypeId) : null;
        setFlash(selectedCrypto ? `This mine will now produce ${selectedCrypto.name}.` : mine.mineThings ? 'This mine will now uncover things.' : `This mine will now extract ${type.hasOre ? 'ore' : 'gold'}.`);
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
          ? store.placeMineSellOrder(player.id, Number(parts[3]), form.cryptoTypeId,
            form.cryptoQuantity, form.quantity, now())
          : store.placeMineBuyOrder(player.id, Number(parts[3]), form.cryptoTypeId,
            form.cryptoQuantity, form.quantity, now());
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
          setFlash(`${parts[4] === 'buy' ? 'Purchased' : 'Sold'} ${result.quantity} mine${result.quantity === 1 ? '' : 's'} for ${result.cryptoQuantity.toLocaleString('en-GB')} ${result.currency.symbol} (worth ${formatGold(result.goldValue)}g at execution).`);
        }
        redirect(response, requestDestination(request, '/market'));
      } else if (request.method === 'POST' && /^\/market\/mines\/\d+\/buy$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const mineTypeId = Number(url.pathname.split('/')[3]);
        const purchasedAt = now();
        const { result: mine, findingEvents } = store.mutatePlayer(
          player.id,
          (current) => buyMine(current, catalog, mineTypeId, purchasedAt, random),
          (createdMine, current) => ({
            source: 'new-mine',
            findings: current.discoveries.filter(
              (finding) => finding.mineId === createdMine.id
            ),
            recordedAt: purchasedAt
          }),
          purchasedAt
        );
        setFindingNotice(
          findingEvents,
          { source: 'new-mine', cityId: mine.cityId, foundAt: purchasedAt }
        );
        store.awardStone(player.id, 'Invested', purchasedAt);
        const type = catalog.mineTypes.find((candidate) => candidate.id === mine.mineTypeId);
        setFlash(`${type.name} Mine purchased with ${catalog.settings.starter_find_count} discoveries.`);
        redirect(response, '/');
      } else if (request.method === 'POST' && /^\/market\/mines\/\d+\/rent$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const mineTypeId = Number(url.pathname.split('/')[3]);
        const rentedAt = now();
        const { result: mine, findingEvents } = store.mutatePlayer(
          player.id,
          (current) => rentMine(current, catalog, mineTypeId, rentedAt, random),
          (createdMine, current) => ({
            source: 'new-mine',
            findings: current.discoveries.filter(
              (finding) => finding.mineId === createdMine.id
            ),
            recordedAt: rentedAt
          }),
          rentedAt
        );
        setFindingNotice(
          findingEvents,
          { source: 'new-mine', cityId: mine.cityId, foundAt: rentedAt }
        );
        store.awardStone(player.id, 'Invested', rentedAt);
        const type = catalog.mineTypes.find((candidate) => candidate.id === mine.mineTypeId);
        setFlash(`${type.name} Mine rented for ${formatDuration(Number(catalog.settings.mine_rental_duration_ms))} with ${catalog.settings.starter_find_count} discoveries.`);
        redirect(response, '/');
      } else if (request.method === 'POST' && /^\/market\/mines\/\d+\/rent-with-voucher$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const mineTypeId = Number(url.pathname.split('/')[3]);
        const rentedAt = now();
        const { result: mine, findingEvents } = store.redeemAsoMineRentalVoucher(
          player.id, catalog, mineTypeId, rentedAt, random
        );
        setFindingNotice(
          findingEvents,
          { source: 'new-mine', cityId: mine.cityId, foundAt: rentedAt }
        );
        store.awardStone(player.id, 'Invested', rentedAt);
        const type = catalog.mineTypes.find((candidate) => candidate.id === mine.mineTypeId);
        setFlash(`${type.name} Mine rented with your Council voucher. No credits were charged.`);
        redirect(response, '/');
      } else if (request.method === 'POST' && /^\/mines\/\d+\/sell$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const { result: refund } = store.mutatePlayer(player.id, (current) =>
          sellMine(current, catalog, Number(url.pathname.split('/')[2])), null, now());
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
          store.placeSellOrder(player.id, item.id, form.price, form.quantity, now());
          setFlash('Your listing is now on the local market.');
        } else {
          store.placeBuyOrder(player.id, item.id, form.price, form.quantity, now());
          setFlash('Your bid is now on the local market. Gold is checked when it is filled.');
        }
        redirect(response, `/market/items/${item.id}`);
      } else if (request.method === 'POST' && /^\/market\/items\/\d+\/(buy-now|sell-now)$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const form = await readForm(request);
        const parts = url.pathname.split('/');
        const itemId = Number(parts[3]);
        const item = catalog.byId.get(itemId);
        if (!item) throw new Error('Item not found.');
        if (parts[4] === 'buy-now') {
          const trade = store.buyItemNow(player.id, itemId, form.price, form.quantity, now());
          setFlash(`Bought ${trade.quantity} ${item.name} at ${formatGold(trade.price)}g each · ${formatGold(trade.gold)}g total.`);
        } else {
          const trade = store.sellItemNow(player.id, itemId, form.price, form.quantity, now());
          store.awardStone(player.id, 'Liquidated', now());
          setFlash(`Sold ${trade.quantity} ${item.name} at ${formatGold(trade.price)}g each · ${formatGold(trade.gold)}g total.`);
        }
        redirect(response, `/market/items/${itemId}`);
      } else if (request.method === 'POST' && /^\/market\/orders\/\d+\/(cancel|buy|sell)$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const parts = url.pathname.split('/');
        const orderId = Number(parts[3]);
        const action = parts[4];
        if (action === 'cancel') {
          store.cancelMarketOrder(player.id, orderId);
          setFlash('Market order canceled.');
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
        setFlash('Choose your listing price in the local order book.');
        redirect(response, `/market/items/${itemId}`);
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
      } else if (request.method === 'POST' && /^\/inventory\/\d+\/break-down$/.test(url.pathname)) {
        if (!requirePlayer()) return;
        const itemId = Number(url.pathname.split('/')[2]);
        if (itemId !== Number(catalog.settings.bolt_box_item_id)) {
          throw new Error('That item cannot be broken down.');
        }
        const form = await readForm(request);
        const result = store.breakDownBoltBoxes(player.id, form.quantity);
        setFlash(`${result.boxes.toLocaleString('en-GB')} ${result.boxes === 1 ? 'box' : 'boxes'} broken down into ${result.bolts.toLocaleString('en-GB')} ${result.boltName}s.`);
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
        responseHtml(response, 404, layout('Not found', '<section class="page-title"><h1>That tunnel goes nowhere.</h1><a class="text-link" href="/">Return home</a></section>', player));
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
        responseHtml(response, statusCode, layout('Try again', `<section class="error"><h1>Could not do that</h1><p>${escapeHtml(error.message)}</p><a class="text-link" href="/">Try again</a></section>`, null));
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
  const databaseFile = path.resolve(process.env.DATABASE_FILE
    ?? path.join(ROOT, 'data', 'minethings.sqlite'));
  const backupDirectory = path.resolve(process.env.DATABASE_BACKUP_DIRECTORY
    ?? process.env.BACKUP_DIRECTORY
    ?? defaultBackupDirectory(databaseFile));
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be a whole number between 1 and 65535.');
  }
  const restoreResult = await applyPendingDatabaseRestore({ databaseFile, backupDirectory });
  if (restoreResult?.applied) {
    console.log(`Restored database backup ${restoreResult.fileName}.`);
  } else if (restoreResult && !restoreResult.applied) {
    console.error(`Database restore was not applied: ${restoreResult.error}`);
  }
  const managedRestart = process.env.MINETHINGS_MANAGED_RESTART === '1'
    || Boolean(process.env.INVOCATION_ID);
  let shutdown = () => {};
  let restartScheduled = false;
  const server = createApp({
    databaseFile,
    backupDirectory,
    updateRunner: managedRestart ? updateRepository : null,
    scheduleRestart: managedRestart ? (reason) => {
      if (restartScheduled) return;
      restartScheduled = true;
      const restartTimer = setTimeout(() => shutdown(`Administrator requested ${reason}`), 750);
      restartTimer.unref();
    } : null
  });
  let shuttingDown = false;
  shutdown = (signal) => {
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
