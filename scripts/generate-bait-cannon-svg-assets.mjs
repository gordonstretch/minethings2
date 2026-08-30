import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BAIT_ICON_ITEM_IDS } from '../src/bait-icons.js';
import { CANNON_ICON_ITEM_IDS } from '../src/cannon-icons.js';
import { loadLegacyCatalog } from '../src/legacy-catalog.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const O = '#292d29';
const ORANGE = '#f28c28';
const GOLD = '#d8be32';
const BLUE = '#3d7f92';
const CREAM = '#f0dfbd';
const RED = '#c84a3b';
const GREEN = '#557d52';
const PURPLE = '#714b87';
const METAL = '#aeb9b5';
const BROWN = '#95613e';

const baitDescriptions = new Map([
  [310, 'A bright spinner lure with a striped spoon, treble hook, and tempting feather tail.'],
  [311, 'A long silver ballyhoo baitfish with a pointed bill, blue back, and forked tail.'],
  [312, 'A sturdy striped mullet with a blunt head, broad scales, and powerful forked tail.'],
  [313, 'A sleek blue-backed herring with a silver belly and a smaller schooling companion.'],
  [314, 'A green eel curling through the water with a long fin, bright eye, and open mouth.'],
  [315, 'A vivid squid with a diamond mantle, large eyes, eight arms, and two reaching tentacles.']
]);

const cannonDescriptions = new Map([
  [301, 'Twelve solid iron cannonballs stacked into a compact ammunition pyramid.'],
  [302, 'A linked pair of heavy chain-shot balls made to tear through masts and rigging.'],
  [303, 'A bundled cluster of grape-shot balls packed around a central wooden spindle.'],
  [304, 'Spot, a short bronze cannon with a spotted barrel and broad naval carriage.'],
  [305, 'Trouble, a red-banded twin-ring cannon with a restless split trail.'],
  [306, 'Whistler, a slim long-barrel cannon with vent holes and curling sound marks.'],
  [307, 'Mailman, a dependable brass field cannon bearing a sealed-letter crest.'],
  [308, 'Thunder, a heavy storm-grey cannon charged with a bold lightning emblem.'],
  [309, 'Curtains, a compact triple-muzzle cannon throwing a broad smoke screen.'],
  [1074, 'Plink, a tiny nimble swivel cannon mounted on a simple forked stand.'],
  [1075, 'Duster, a flared sand-coloured cannon kicking up a rolling dust cloud.'],
  [1076, 'Sidearm, a compact pistol-like deck cannon with a hooked rear grip.'],
  [1077, 'Anvil, a massive square-breeched cannon built around a forge-anvil silhouette.'],
  [1078, 'Gouge, a reinforced cannon with a toothed boring muzzle and scarred barrel.'],
  [1079, 'Revenge, a black and crimson cannon with an aggressive bladed carriage.'],
  [1091, 'Bore, a precise long cannon with concentric reinforcing rings and a narrow muzzle.'],
  [1092, 'Qualm, an uneasy double-barrel cannon with an offset wavering carriage.'],
  [1093, 'Leviathan, an enormous sea-blue cannon with a whale-jaw muzzle and plated body.'],
  [1094, 'Kraken, a dark naval cannon gripped by curling purple tentacles.'],
  [1095, 'Hydra, a legendary three-headed cannon sharing one armored carriage.'],
  [1096, 'Magnum, an immense polished cannon with an oversized muzzle and gold recoil bands.'],
  [1107, 'A timber block-and-tackle with twin pulleys, hook, and neatly reeved rope.'],
  [1269, 'An open reinforced crate filled with orderly rows of black cannonballs.'],
  [1270, 'An open ammunition crate holding paired chain-shot balls and coiled links.'],
  [1271, 'An open ammunition crate packed with compact cloth bags of grape shot.']
]);

function baitArt(id) {
  switch (id) {
    case 310: return `<path d="M18 26q25 9 43 35" fill="none" stroke="${BLUE}" stroke-width="5" stroke-linecap="round"/><path d="m55 52 24 21-18 24-23-22z" fill="${ORANGE}" stroke="${O}" stroke-width="6"/><path d="m48 62 23 22" stroke="${CREAM}" stroke-width="5"/><circle cx="40" cy="43" r="8" fill="${GOLD}" stroke="${O}" stroke-width="4"/><path d="M61 97q3 25 21 13 14-10 1-24" fill="none" stroke="${O}" stroke-width="5" stroke-linecap="round"/><path d="m78 73 25-8-12 17 22 7-30 9" fill="${RED}" stroke="${O}" stroke-width="4" stroke-linejoin="round"/>`;
    case 311: return `<path d="M20 68q28-32 76-10l20-17-5 25 8 21-24-11q-43 21-75-8z" fill="${METAL}" stroke="${O}" stroke-width="7" stroke-linejoin="round"/><path d="M25 65q38-26 72-5" fill="none" stroke="${BLUE}" stroke-width="8"/><path d="m20 68-15-7" stroke="${O}" stroke-width="5" stroke-linecap="round"/><circle cx="34" cy="62" r="4" fill="${O}"/><path d="M50 72q19 8 37 0" fill="none" stroke="#eef4ed" stroke-width="4"/>`;
    case 312: return `<path d="M14 67q25-38 75-21l28-18-8 31 10 29-31-13Q38 94 14 67z" fill="#9eb1a9" stroke="${O}" stroke-width="7" stroke-linejoin="round"/><path d="M22 59q33-23 68-10" stroke="${GREEN}" stroke-width="8"/><path d="M46 47q-2 23 7 39m14-42q-3 23 7 38" fill="none" stroke="#657a70" stroke-width="5"/><circle cx="29" cy="61" r="4" fill="${O}"/><path d="M21 74h22" stroke="${CREAM}" stroke-width="4"/>`;
    case 313: return `<path d="M12 74q27-32 73-16l25-17-7 25 12 23-30-12q-45 17-73-3z" fill="#c9d2ce" stroke="${O}" stroke-width="6"/><path d="M18 69q31-23 68-9" stroke="${BLUE}" stroke-width="8"/><circle cx="27" cy="69" r="4" fill="${O}"/><path d="M49 77q20 6 34-1" stroke="white" stroke-width="4"/><path d="M38 33q18-17 43-7l18-11-3 16 8 13-23-7q-24 11-43-4z" fill="#9cb7bd" stroke="${O}" stroke-width="4"/><circle cx="48" cy="31" r="2.5" fill="${O}"/>`;
    case 314: return `<path d="M20 91q-15-25 12-38 25-12 51 15 17 18 27 1 8-14-8-26-13-10-4-26" fill="none" stroke="${GREEN}" stroke-width="17" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 91q17 25 42 8 17-11 12-31" fill="none" stroke="#86a76f" stroke-width="5" stroke-linecap="round"/><path d="M98 17q17 0 16 18l-12 10-16-12z" fill="#6d925f" stroke="${O}" stroke-width="5"/><circle cx="106" cy="26" r="3" fill="${GOLD}"/><path d="m113 36 10 4-11 4" fill="none" stroke="${RED}" stroke-width="3"/>`;
    case 315: return `<path d="m64 9 28 38-12 36H48L36 47z" fill="${PURPLE}" stroke="${O}" stroke-width="7" stroke-linejoin="round"/><path d="M43 45h42" stroke="#b48ac2" stroke-width="5"/><circle cx="51" cy="59" r="7" fill="${CREAM}" stroke="${O}" stroke-width="4"/><circle cx="77" cy="59" r="7" fill="${CREAM}" stroke="${O}" stroke-width="4"/><path d="M49 82q-31 20-13 36m22-36q-16 29 1 39m20-39q31 20 13 36M70 82q16 29-1 39m-27-37q-18 8-20 24m64-24q18 8 20 24" fill="none" stroke="${PURPLE}" stroke-width="8" stroke-linecap="round"/><path d="M43 82q-24 5-31 25m73-25q24 5 31 25" fill="none" stroke="${O}" stroke-width="4"/>`;
    default: throw new Error(`Missing Bait art for ${id}.`);
  }
}

function wheels(left = 43, right = 82, radius = 14) {
  return `<circle cx="${left}" cy="99" r="${radius}" fill="${BROWN}" stroke="${O}" stroke-width="6"/><circle cx="${right}" cy="99" r="${radius}" fill="${BROWN}" stroke="${O}" stroke-width="6"/><circle cx="${left}" cy="99" r="4" fill="${GOLD}"/><circle cx="${right}" cy="99" r="4" fill="${GOLD}"/>`;
}

function cannonArt(id) {
  switch (id) {
    case 301: return `<g fill="#353a38" stroke="${O}" stroke-width="4"><circle cx="64" cy="29" r="13"/><circle cx="47" cy="51" r="13"/><circle cx="81" cy="51" r="13"/><circle cx="30" cy="73" r="13"/><circle cx="64" cy="73" r="13"/><circle cx="98" cy="73" r="13"/><circle cx="17" cy="97" r="13"/><circle cx="48" cy="97" r="13"/><circle cx="80" cy="97" r="13"/><circle cx="111" cy="97" r="13"/></g><path d="M14 116h100" stroke="${BROWN}" stroke-width="8" stroke-linecap="round"/>`;
    case 302: return `<circle cx="30" cy="70" r="23" fill="#3c4240" stroke="${O}" stroke-width="7"/><circle cx="98" cy="70" r="23" fill="#3c4240" stroke="${O}" stroke-width="7"/><path d="M47 55q17-19 34 0M47 85q17 19 34 0" fill="none" stroke="${METAL}" stroke-width="10"/><path d="M51 61q13-13 26 0M51 79q13 13 26 0" fill="none" stroke="${O}" stroke-width="3"/><circle cx="23" cy="62" r="5" fill="#69716e"/><circle cx="91" cy="62" r="5" fill="#69716e"/>`;
    case 303: return `<path d="M64 17v91" stroke="${BROWN}" stroke-width="9" stroke-linecap="round"/><g fill="#454a48" stroke="${O}" stroke-width="4"><circle cx="64" cy="33" r="13"/><circle cx="47" cy="51" r="13"/><circle cx="81" cy="51" r="13"/><circle cx="37" cy="74" r="13"/><circle cx="64" cy="74" r="13"/><circle cx="91" cy="74" r="13"/><circle cx="50" cy="97" r="13"/><circle cx="78" cy="97" r="13"/></g><path d="m27 55 12 52m62-52-12 52" stroke="${CREAM}" stroke-width="6"/>`;
    case 304: return `<path d="m18 54 20-17 69 8 10 18-17 15-70-6z" fill="#a77943" stroke="${O}" stroke-width="7" stroke-linejoin="round"/><circle cx="52" cy="53" r="6" fill="#5d4939"/><circle cx="78" cy="58" r="6" fill="#5d4939"/><path d="M30 75h72l-13 26H41z" fill="${BROWN}" stroke="${O}" stroke-width="6"/>${wheels()}`;
    case 305: return `<path d="m13 51 18-17 78 12 10 17-16 13-81-9z" fill="${RED}" stroke="${O}" stroke-width="7" stroke-linejoin="round"/><path d="M45 40 40 72m28-28-5 32" stroke="${GOLD}" stroke-width="7"/><path d="M29 75h72l-9 27H38z" fill="#694337" stroke="${O}" stroke-width="6"/><path d="m100 35 13-14m-4 21 13-2" stroke="${RED}" stroke-width="5"/>${wheels(44,84,13)}`;
    case 306: return `<path d="m10 57 18-13 82 2 11 12-12 13-83 7z" fill="#8e9b97" stroke="${O}" stroke-width="7" stroke-linejoin="round"/><g fill="${O}"><circle cx="58" cy="55" r="4"/><circle cx="73" cy="55" r="4"/><circle cx="88" cy="55" r="4"/></g><path d="M31 76h64l-9 23H40z" fill="${BLUE}" stroke="${O}" stroke-width="6"/><path d="M100 33q12-12 21 0m-18 8q9-8 16 0" fill="none" stroke="${ORANGE}" stroke-width="4" stroke-linecap="round"/>${wheels(45,82,12)}`;
    case 307: return `<path d="m13 54 19-16 78 8 10 16-15 14-80-5z" fill="#b58a45" stroke="${O}" stroke-width="7"/><path d="M31 74h70l-11 27H40z" fill="#8a603b" stroke="${O}" stroke-width="6"/><path d="m55 50 17 2-2 14-17-2z" fill="${CREAM}" stroke="${O}" stroke-width="3"/><path d="m55 51 7 8 10-6" fill="none" stroke="${RED}" stroke-width="3"/>${wheels(44,84,14)}`;
    case 308: return `<path d="m8 51 23-20 83 13 9 22-22 17-82-12z" fill="#4e5a5a" stroke="${O}" stroke-width="8"/><path d="m67 41-13 17 13 3-11 18 27-24-14-3 9-9z" fill="${GOLD}"/><path d="M29 77h72l-7 28H36z" fill="#59615e" stroke="${O}" stroke-width="7"/>${wheels(43,87,16)}<path d="M19 28 10 14m31 13 2-18" stroke="${BLUE}" stroke-width="5"/>`;
    case 309: return `<path d="M16 38h89l17 12-17 12H16zM16 57h89l17 12-17 12H16zM16 76h89l17 12-17 12H16z" fill="#6c7774" stroke="${O}" stroke-width="5"/><path d="M35 95h61l-13 20H48z" fill="${BROWN}" stroke="${O}" stroke-width="5"/><path d="M107 35q16-15 20 1m-17 19q17-12 20 5m-20 14q17-6 18 11" fill="none" stroke="${CREAM}" stroke-width="5"/>`;
    case 1074: return `<path d="m17 58 17-12 70 4 14 12-14 13-72 4z" fill="#a4aca8" stroke="${O}" stroke-width="7"/><path d="M60 78v25m-20 15 20-15 22 15M60 103l-28 2" fill="none" stroke="${BROWN}" stroke-width="8" stroke-linecap="round"/><circle cx="60" cy="78" r="8" fill="${GOLD}" stroke="${O}" stroke-width="4"/>`;
    case 1075: return `<path d="m9 47 27-15 77 16 9 20-25 13-77-9z" fill="#b68d58" stroke="${O}" stroke-width="7"/><path d="M35 77h63l-9 25H43z" fill="${BROWN}" stroke="${O}" stroke-width="6"/>${wheels(48,84,13)}<path d="M93 89q18 1 22 14 10-2 11 9H89" fill="${CREAM}" stroke="${O}" stroke-width="4"/>`;
    case 1076: return `<path d="m18 53 16-14 73 6 12 16-16 14-73-4z" fill="#697471" stroke="${O}" stroke-width="7"/><path d="M42 72h49l-5 19H50z" fill="${BROWN}" stroke="${O}" stroke-width="6"/><path d="M51 89 38 116m44-26 18 24" stroke="${O}" stroke-width="8" stroke-linecap="round"/><path d="M31 50 17 31 8 44" fill="none" stroke="${BROWN}" stroke-width="7" stroke-linejoin="round"/>`;
    case 1077: return `<path d="M13 42h30l16-18h44v18h13v31H22z" fill="#4b5351" stroke="${O}" stroke-width="8" stroke-linejoin="round"/><path d="M36 76h67l-8 28H42z" fill="#59615f" stroke="${O}" stroke-width="7"/><path d="M67 25v42m-22-14h57" stroke="${METAL}" stroke-width="7"/>${wheels(49,88,16)}<path d="M13 77h23" stroke="${RED}" stroke-width="6"/>`;
    case 1078: return `<path d="m22 49 16-16 68 11 10 17-15 15-72-7z" fill="#65706d" stroke="${O}" stroke-width="7"/><path d="m106 41 16 5-8 10 9 10-16 8" fill="${METAL}" stroke="${O}" stroke-width="5" stroke-linejoin="round"/><path d="M35 74h66l-11 28H43z" fill="${BROWN}" stroke="${O}" stroke-width="6"/><path d="M49 43 43 72m24-26-5 29" stroke="${RED}" stroke-width="4"/>${wheels(49,85,13)}`;
    case 1079: return `<path d="m10 48 25-21 79 17 9 21-24 18-79-14z" fill="#272b2a" stroke="${O}" stroke-width="8"/><path d="M40 38 34 72m25-29-6 34m28-28-5 31" stroke="${RED}" stroke-width="6"/><path d="M29 75h75l-13 31H42z" fill="#4e3130" stroke="${O}" stroke-width="7"/><path d="m41 104-21 15 32-5m40-10 21 15-32-5" fill="${RED}" stroke="${O}" stroke-width="5"/>${wheels(52,84,12)}`;
    case 1091: return `<path d="m6 54 20-14 91 6 8 14-12 12-91 7z" fill="#778481" stroke="${O}" stroke-width="7"/><path d="M41 43 38 76m20-32-3 33m22-32-3 31m22-29-3 26" stroke="${GOLD}" stroke-width="6"/><path d="M32 77h68l-13 25H43z" fill="${BLUE}" stroke="${O}" stroke-width="6"/>${wheels(49,84,13)}`;
    case 1092: return `<path d="M15 41h87l20 11-20 12H15zm0 24h87l20 12-20 11H15z" fill="#626d6a" stroke="${O}" stroke-width="6"/><path d="M35 87h64l-13 24H47z" fill="${PURPLE}" stroke="${O}" stroke-width="6"/><path d="m25 91-12 14 16 9m69-20 13 11-14 10" fill="none" stroke="${PURPLE}" stroke-width="6"/>${wheels(52,82,10)}`;
    case 1093: return `<path d="m7 42 28-25 79 18 11 30-29 24-78-17z" fill="#315b68" stroke="${O}" stroke-width="8"/><path d="m101 33 23 5-8 13 10 13-25 19-13-16 11-13-10-10z" fill="#6e9298" stroke="${O}" stroke-width="6"/><path d="M31 80h72l-7 29H38z" fill="#3b6570" stroke="${O}" stroke-width="7"/><path d="M42 32 36 74m28-37-6 42m28-37-6 42" stroke="#89b2b7" stroke-width="5"/>${wheels(48,88,17)}`;
    case 1094: return `<path d="m12 48 23-22 78 16 10 22-22 19-80-13z" fill="#343b3c" stroke="${O}" stroke-width="8"/><path d="M31 77h70l-7 29H38z" fill="#4b3b56" stroke="${O}" stroke-width="7"/>${wheels(47,88,15)}<path d="M45 39q-27-20-28 4m47 2q-15-28-27-27m47 32q2-32 19-35m-3 63q23-13 25 8" fill="none" stroke="${PURPLE}" stroke-width="8" stroke-linecap="round"/>`;
    case 1095: return `<path d="M12 31h87l22 10-22 12H12zm0 24h87l22 11-22 11H12zm0 24h87l22 11-22 11H12z" fill="#557365" stroke="${O}" stroke-width="6"/><path d="M32 97h70l-13 22H45z" fill="#3f594e" stroke="${O}" stroke-width="6"/><path d="m102 28 20 3-8 10 9 10-21 5m0-4 20 4-8 10 9 10-21 4m0-4 20 4-8 10 9 10-21 4" fill="${GOLD}" stroke="${O}" stroke-width="3"/>`;
    case 1096: return `<path d="m5 45 28-25 83 17 10 29-27 23-84-16z" fill="#8a9692" stroke="${O}" stroke-width="9"/><ellipse cx="111" cy="60" rx="15" ry="25" fill="#3a4240" stroke="${O}" stroke-width="7"/><path d="M40 26 33 78m28-47-7 51m29-47-7 52" stroke="${GOLD}" stroke-width="8"/><path d="M30 82h73l-7 29H38z" fill="#6b7672" stroke="${O}" stroke-width="7"/>${wheels(48,88,17)}`;
    case 1107: return `<g fill="${BROWN}" stroke="${O}" stroke-width="6"><rect x="17" y="14" width="38" height="43" rx="8"/><rect x="73" y="14" width="38" height="43" rx="8"/></g><circle cx="36" cy="35" r="10" fill="${METAL}" stroke="${O}" stroke-width="4"/><circle cx="92" cy="35" r="10" fill="${METAL}" stroke="${O}" stroke-width="4"/><path d="M36 45v44q0 20 18 20t18-18V49q0-14 20-14" fill="none" stroke="${GOLD}" stroke-width="7"/><path d="M54 108q10 16 20 0l-4 14H57z" fill="${METAL}" stroke="${O}" stroke-width="5"/>`;
    case 1269: return `<path d="M12 49h104v68H12z" fill="${BROWN}" stroke="${O}" stroke-width="7"/><path d="M14 49 31 20h83L98 49z" fill="#b47b4b" stroke="${O}" stroke-width="7"/><g fill="#373c3a" stroke="${O}" stroke-width="4"><circle cx="35" cy="65" r="12"/><circle cx="64" cy="65" r="12"/><circle cx="93" cy="65" r="12"/><circle cx="49" cy="89" r="12"/><circle cx="79" cy="89" r="12"/></g><path d="M21 106h86M20 54v58m88-58v58" stroke="#e0aa68" stroke-width="4"/>`;
    case 1270: return `<path d="M12 49h104v68H12z" fill="${BROWN}" stroke="${O}" stroke-width="7"/><path d="M14 49 31 20h83L98 49z" fill="#b47b4b" stroke="${O}" stroke-width="7"/><g fill="#373c3a" stroke="${O}" stroke-width="4"><circle cx="36" cy="75" r="14"/><circle cx="92" cy="75" r="14"/></g><path d="M48 66q16-16 32 0m-32 18q16 16 32 0" fill="none" stroke="${METAL}" stroke-width="8"/><path d="M21 106h86M20 54v58m88-58v58" stroke="#e0aa68" stroke-width="4"/>`;
    case 1271: return `<path d="M12 49h104v68H12z" fill="${BROWN}" stroke="${O}" stroke-width="7"/><path d="M14 49 31 20h83L98 49z" fill="#b47b4b" stroke="${O}" stroke-width="7"/><g fill="${CREAM}" stroke="${O}" stroke-width="4"><path d="m25 65 17-10 16 10-3 35H28z"/><path d="m70 65 17-10 16 10-3 35H73z"/></g><g fill="#3b403e"><circle cx="36" cy="75" r="4"/><circle cx="47" cy="85" r="4"/><circle cx="81" cy="76" r="4"/><circle cx="93" cy="87" r="4"/></g><path d="M21 106h86M20 54v58m88-58v58" stroke="#e0aa68" stroke-width="4"/>`;
    default: throw new Error(`Missing Cannon art for ${id}.`);
  }
}

function escapeXml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function writeFamily({ ids, directory, descriptions, art, mineTypeId }) {
  const catalog = loadLegacyCatalog();
  fs.mkdirSync(directory, { recursive: true });
  const expected = new Set(ids.map((id) => `item-${id}.svg`));
  for (const filename of fs.readdirSync(directory)) {
    if (filename.endsWith('.svg') && !expected.has(filename)) fs.rmSync(path.join(directory, filename));
  }
  for (const id of ids) {
    const item = catalog.byId.get(id);
    if (!item || item.mineTypeId !== mineTypeId || item.repairedItemId !== null) {
      throw new Error(`Invalid icon item ${id}.`);
    }
    const description = descriptions.get(id);
    if (!description) throw new Error(`Missing icon description for ${id}.`);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(item.name)}</title>
  <desc id="desc">${escapeXml(description)}</desc>
  ${art(id)}
</svg>
`;
    fs.writeFileSync(path.join(directory, `item-${id}.svg`), svg);
  }
}

writeFamily({
  ids: BAIT_ICON_ITEM_IDS,
  directory: path.join(ROOT, 'public', 'img', 'items', 'bait'),
  descriptions: baitDescriptions, art: baitArt, mineTypeId: 14
});
writeFamily({
  ids: CANNON_ICON_ITEM_IDS,
  directory: path.join(ROOT, 'public', 'img', 'items', 'cannons'),
  descriptions: cannonDescriptions, art: cannonArt, mineTypeId: 13
});
console.log(`Generated ${BAIT_ICON_ITEM_IDS.length} Bait and ${CANNON_ICON_ITEM_IDS.length} Cannon SVGs.`);
