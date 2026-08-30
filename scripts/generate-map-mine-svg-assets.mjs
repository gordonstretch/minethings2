import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MAP_MINE_TYPE_IDS, OIL_FIELD_MAP_ICON_PATH
} from '../src/mine-icons.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'public', 'img', 'map-icons');
const INK = '#202420';
const AMBER = '#f39a21';
const GOLD = '#ffd36a';
const TEAL = '#315a64';
const CREAM = '#eadfc8';
const RED = '#c9573d';
const GREEN = '#5f7f46';
const STEEL = '#aeb9b6';
const PURPLE = '#765584';
const BROWN = '#9b6338';

const icons = new Map([
  [1, {
    name: 'Starter Mine',
    description: 'A bright star over a welcoming mine tunnel and its rails.',
    art: `<path d="M5 55 14 29l9 6 9-19 10 19 8-7 9 27z" fill="${TEAL}" stroke="${INK}" stroke-width="4.5" stroke-linejoin="round"/><path d="M17 55V43c0-12 6-20 15-20s15 8 15 20v12z" fill="${AMBER}" stroke="${INK}" stroke-width="4.5"/><path d="M24 55V43c0-6 3-11 8-11s8 5 8 11v12z" fill="${INK}"/><path d="m28 55 2-15m6 15-2-15M23 49h18" fill="none" stroke="${CREAM}" stroke-width="2.5" stroke-linecap="round"/><path d="m32 4 2.2 5 5.5.5-4.2 3.7 1.3 5.4-4.8-2.8-4.8 2.8 1.3-5.4-4.2-3.7 5.5-.5z" fill="${GOLD}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`
  }],
  [4, {
    name: 'Equipment Mine',
    description: 'A sturdy hardhat crossed by a miner\'s pick.',
    art: `<path d="m11 49 35-35m-4-4 8 8M8 53l8-1-5-5z" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="M13 42c1-14 8-23 19-23s18 9 19 23z" fill="${AMBER}" stroke="${INK}" stroke-width="4.5" stroke-linejoin="round"/><path d="M28 19v23" stroke="${GOLD}" stroke-width="4"/><path d="M9 42h46v9H9z" fill="${GOLD}" stroke="${INK}" stroke-width="4.5" stroke-linejoin="round"/>`
  }],
  [5, {
    name: 'Vehicles Mine',
    description: 'A loaded mine cart on heavy wheels.',
    art: `<path d="M8 17h45l-5 24H15z" fill="${AMBER}" stroke="${INK}" stroke-width="4.5" stroke-linejoin="round"/><path d="m14 18 8 11 9-11 9 11 9-11" fill="none" stroke="${GOLD}" stroke-width="3"/><path d="M12 46h40" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/><circle cx="20" cy="49" r="7" fill="${TEAL}" stroke="${INK}" stroke-width="4.5"/><circle cx="44" cy="49" r="7" fill="${TEAL}" stroke="${INK}" stroke-width="4.5"/><path d="M8 58h48" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>`
  }],
  [6, {
    name: 'Spices Mine',
    description: 'A hot curved chilli with three scattered seeds.',
    art: `<path d="M49 10c-7 1-10 5-10 11" fill="none" stroke="${GREEN}" stroke-width="5" stroke-linecap="round"/><path d="M42 18c14 9 10 30-8 36C22 58 9 52 7 40c13 5 24-1 26-17z" fill="${RED}" stroke="${INK}" stroke-width="4.5" stroke-linejoin="round"/><path d="M17 40c8 2 17-2 21-9" fill="none" stroke="${GOLD}" stroke-width="3" stroke-linecap="round"/><g fill="${GOLD}" stroke="${INK}" stroke-width="1.5"><circle cx="50" cy="34" r="3"/><circle cx="55" cy="44" r="3"/><circle cx="45" cy="48" r="3"/></g>`
  }],
  [7, {
    name: 'Weapons Mine',
    description: 'A broad sword striking a compact burst.',
    art: `<path d="m12 50 9 2 29-31-8-8-31 29z" fill="${STEEL}" stroke="${INK}" stroke-width="4.5" stroke-linejoin="round"/><path d="m8 54 8-8m2 11L7 46m27-25 8 8" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/><path d="m50 5 2 7 7-2-4 6 6 4-8 1v8l-5-6-5 5 1-8-8-1 7-4-4-6 8 3z" fill="${GOLD}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`
  }],
  [8, {
    name: 'Bugs Mine',
    description: 'A bold top-down beetle with six strong legs.',
    art: `<path d="M25 17c0-7 14-7 14 0" fill="none" stroke="${INK}" stroke-width="4.5"/><path d="M18 34c0-13 6-20 14-20s14 7 14 20v8c0 11-6 17-14 17s-14-6-14-17z" fill="${GREEN}" stroke="${INK}" stroke-width="4.5"/><path d="M32 15v43M19 32h26" stroke="${INK}" stroke-width="3"/><path d="m18 28-10-6m10 17-11 1m12 8-9 7m36-27 10-6M46 39l11 1m-12 8 9 7" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/><circle cx="27" cy="26" r="3" fill="${GOLD}"/><circle cx="37" cy="26" r="3" fill="${GOLD}"/>`
  }],
  [9, {
    name: 'Music Mine',
    description: 'A bright pair of linked eighth notes with a sound arc.',
    art: `<path d="M24 16v30m0-26 26-7v29M24 29l26-7" fill="none" stroke="${TEAL}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><ellipse cx="16" cy="48" rx="9" ry="7" fill="${AMBER}" stroke="${INK}" stroke-width="4" transform="rotate(-15 16 48)"/><ellipse cx="42" cy="44" rx="9" ry="7" fill="${AMBER}" stroke="${INK}" stroke-width="4" transform="rotate(-15 42 44)"/><path d="M50 21q7 5 7 12" fill="none" stroke="${GOLD}" stroke-width="4" stroke-linecap="round"/>`
  }],
  [10, {
    name: 'Gadgets Mine',
    description: 'A field gadget with an antenna, dial, and status light.',
    art: `<path d="m39 14 9-9M43 10l6 6" stroke="${INK}" stroke-width="4" stroke-linecap="round"/><rect x="12" y="14" width="40" height="44" rx="7" fill="${TEAL}" stroke="${INK}" stroke-width="4.5"/><circle cx="32" cy="35" r="12" fill="${CREAM}" stroke="${INK}" stroke-width="4"/><path d="m32 35 7-6" stroke="${RED}" stroke-width="4" stroke-linecap="round"/><circle cx="21" cy="51" r="3" fill="${GOLD}"/><path d="M30 51h13" stroke="${GOLD}" stroke-width="3.5" stroke-linecap="round"/>`
  }],
  [11, {
    name: 'Explosives Mine',
    description: 'A round iron bomb with a hot, sparkling fuse.',
    art: `<path d="M36 17c0-7 4-11 11-11" fill="none" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><circle cx="28" cy="38" r="20" fill="${AMBER}" stroke="${INK}" stroke-width="4.5"/><path d="M21 22h15l4 7H17z" fill="${STEEL}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/><path d="m51 7 2 5 6-1-4 5 4 4-6-1-2 6-2-6-6 1 4-4-4-5 6 1z" fill="${GOLD}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/><path d="M17 43q8 8 17 4" fill="none" stroke="${GOLD}" stroke-width="3" stroke-linecap="round"/>`
  }],
  [12, {
    name: 'Ships Mine',
    description: 'A high-prowed ship cutting through two waves.',
    art: `<path d="M9 40h46L45 53H20z" fill="${BROWN}" stroke="${INK}" stroke-width="4.5" stroke-linejoin="round"/><path d="M22 39V11l24 13-24 6z" fill="${CREAM}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/><path d="M22 10v31" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/><path d="M4 57q8-7 16 0t16 0 16 0 8 0" fill="none" stroke="${TEAL}" stroke-width="4.5" stroke-linecap="round"/>`
  }],
  [13, {
    name: 'Cannons Mine',
    description: 'A squat cannon on a large timber carriage wheel.',
    art: `<path d="M9 18h38l8 9-8 9H9z" fill="${STEEL}" stroke="${INK}" stroke-width="4.5" stroke-linejoin="round"/><path d="M17 35 12 49h36l-8-14" fill="${BROWN}" stroke="${INK}" stroke-width="4.5" stroke-linejoin="round"/><circle cx="35" cy="48" r="10" fill="${AMBER}" stroke="${INK}" stroke-width="4.5"/><circle cx="35" cy="48" r="3" fill="${INK}"/><path d="M5 23h7" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>`
  }],
  [14, {
    name: 'Bait Mine',
    description: 'A lively worm curled around a fishing hook and float.',
    art: `<path d="M40 7v34c0 11-7 17-16 14-8-3-8-14 0-18" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/><path d="m17 37 8 1-3 7" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 29c8-10 15 8 23-2 5-6 8-5 12-1" fill="none" stroke="${RED}" stroke-width="7" stroke-linecap="round"/><path d="M39 8h9v16h-9z" fill="${AMBER}" stroke="${INK}" stroke-width="3.5"/><path d="M39 15h9" stroke="${CREAM}" stroke-width="3"/>`
  }],
  [15, {
    name: 'Fish Mine',
    description: 'A powerful fish leaping forward with bright fins.',
    art: `<path d="M8 33C20 16 39 16 50 31l10-9-1 25-10-9C36 52 18 49 8 33z" fill="${TEAL}" stroke="${INK}" stroke-width="4.5" stroke-linejoin="round"/><path d="m29 22 8-11 4 14m-12 21 8 9 3-13" fill="${AMBER}" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/><circle cx="20" cy="31" r="3" fill="${GOLD}"/><path d="M13 38q8 5 16 2" fill="none" stroke="${CREAM}" stroke-width="3" stroke-linecap="round"/>`
  }],
  [16, {
    name: 'Ore Mine',
    description: 'Three heavy faceted ore crystals rising from stone.',
    art: `<path d="m8 51 9-24 12 8L37 9l12 22 8-5 3 25z" fill="${STEEL}" stroke="${INK}" stroke-width="4.5" stroke-linejoin="round"/><path d="M37 10v41M17 28l12 23m20-20-7 20M11 51h48" fill="none" stroke="${TEAL}" stroke-width="3" stroke-linejoin="round"/><path d="m37 10 12 21-12 6-8-2z" fill="${GOLD}"/>`
  }],
  [17, {
    name: 'Robots Mine',
    description: 'A square robot head with an alert antenna and bright eyes.',
    art: `<path d="M32 14V7m0 0 7-3" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/><circle cx="41" cy="4" r="3" fill="${GOLD}" stroke="${INK}" stroke-width="2"/><rect x="9" y="14" width="46" height="39" rx="7" fill="${STEEL}" stroke="${INK}" stroke-width="4.5"/><path d="M9 31H4m56 0h-5" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><circle cx="23" cy="31" r="5" fill="${TEAL}" stroke="${INK}" stroke-width="3"/><circle cx="41" cy="31" r="5" fill="${TEAL}" stroke="${INK}" stroke-width="3"/><path d="M21 43h22" stroke="${AMBER}" stroke-width="4" stroke-linecap="round"/>`
  }],
  [18, {
    name: 'Tutorial Mine',
    description: 'A clear wayfinding flag marked by a guiding star.',
    art: `<path d="M18 58V8" stroke="${INK}" stroke-width="5" stroke-linecap="round"/><path d="M20 11h31L44 23l7 12H20z" fill="${TEAL}" stroke="${INK}" stroke-width="4.5" stroke-linejoin="round"/><path d="m34 16 2 5 5 .5-4 3.5 1 5-4-2.5-4 2.5 1-5-4-3.5 5-.5z" fill="${GOLD}"/><path d="M9 58h28" stroke="${AMBER}" stroke-width="5" stroke-linecap="round"/>`
  }],
  [19, {
    name: 'Aircraft Mine',
    description: 'A compact propeller aircraft seen from above.',
    art: `<path d="M27 9h10l3 18 18 9v7l-19-3-2 14 8 5H19l8-5-2-14-19 3v-7l18-9z" fill="${STEEL}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/><path d="M19 9h26" stroke="${AMBER}" stroke-width="4.5" stroke-linecap="round"/><circle cx="32" cy="9" r="4" fill="${GOLD}" stroke="${INK}" stroke-width="3"/><path d="M32 18v25" stroke="${TEAL}" stroke-width="3"/>`
  }],
  [20, {
    name: 'Discontinued Mine',
    description: 'A retired supply crate split by a decisive crack.',
    art: `<path d="M8 15h48v40H8z" fill="${BROWN}" stroke="${INK}" stroke-width="4.5" stroke-linejoin="round"/><path d="m9 16 23 14 23-14M32 30v25M12 48l12-12m28 12L40 36" fill="none" stroke="${CREAM}" stroke-width="3"/><path d="m38 8-8 13 8 7-10 13 4 15" fill="none" stroke="${RED}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`
  }],
  [21, {
    name: 'Avatars Mine',
    description: 'A confident head-and-shoulders avatar silhouette.',
    art: `<circle cx="32" cy="20" r="12" fill="${GOLD}" stroke="${INK}" stroke-width="4.5"/><path d="M10 57c1-17 9-26 22-26s21 9 22 26z" fill="${TEAL}" stroke="${INK}" stroke-width="4.5" stroke-linejoin="round"/><path d="m21 36 11 10 11-10" fill="${CREAM}" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/><path d="M20 18q12-12 24 0" fill="none" stroke="${AMBER}" stroke-width="5" stroke-linecap="round"/>`
  }],
  [22, {
    name: 'Unreleased Mine',
    description: 'A sealed future crate secured by a heavy padlock.',
    art: `<path d="M8 19h48v37H8z" fill="${PURPLE}" stroke="${INK}" stroke-width="4.5" stroke-linejoin="round"/><path d="M9 20 32 33l23-13M32 33v23" fill="none" stroke="${CREAM}" stroke-width="3"/><path d="M24 17v-4c0-11 16-11 16 0v4" fill="none" stroke="${INK}" stroke-width="4.5"/><rect x="21" y="14" width="22" height="19" rx="4" fill="${GOLD}" stroke="${INK}" stroke-width="4"/><circle cx="32" cy="23" r="3" fill="${INK}"/>`
  }],
  [23, {
    name: 'Dwarves Mine',
    description: 'A stout dwarf in a broad helmet with a magnificent beard.',
    art: `<path d="M13 27c1-15 8-22 19-22s18 7 19 22z" fill="${AMBER}" stroke="${INK}" stroke-width="4.5" stroke-linejoin="round"/><path d="M9 27h46v8H9z" fill="${GOLD}" stroke="${INK}" stroke-width="4"/><path d="M18 33h28v10L39 58l-7-5-7 5-7-15z" fill="${BROWN}" stroke="${INK}" stroke-width="4.5" stroke-linejoin="round"/><path d="m32 30-5 13 5 4 5-4z" fill="${CREAM}" stroke="${INK}" stroke-width="3"/><circle cx="24" cy="36" r="2.5" fill="${INK}"/><circle cx="40" cy="36" r="2.5" fill="${INK}"/>`
  }],
  [24, {
    name: 'Mods Mine',
    description: 'A rugged hexagonal mod nut charged by a bright bolt.',
    art: `<path d="m32 5 23 13v28L32 59 9 46V18z" fill="${STEEL}" stroke="${INK}" stroke-width="4.5" stroke-linejoin="round"/><circle cx="32" cy="32" r="12" fill="${TEAL}" stroke="${INK}" stroke-width="4"/><path d="m35 17-12 17h9l-4 14 13-19h-9z" fill="${GOLD}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`
  }],
  [25, {
    name: 'Machines Mine',
    description: 'An industrial flywheel driving a stout piston lever.',
    art: `<circle cx="25" cy="38" r="18" fill="${AMBER}" stroke="${INK}" stroke-width="4.5"/><circle cx="25" cy="38" r="6" fill="${CREAM}" stroke="${INK}" stroke-width="3.5"/><path d="M25 20v12m0 12v12M7 38h12m12 0h12m-31-13 8 8m10 10 8 8m0-26-8 8m-10 10-8 8" stroke="${INK}" stroke-width="3" stroke-linecap="round"/><path d="m31 31 16-19 8 7-17 19" fill="${TEAL}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/><path d="M45 9h13v13H45z" fill="${STEEL}" stroke="${INK}" stroke-width="4"/>`
  }],
  [26, {
    name: 'Shrooms Mine',
    description: 'A large spotted mushroom sheltering a smaller cap.',
    art: `<path d="M27 32c1 9-1 18-6 25h20c-5-7-7-16-6-25z" fill="${CREAM}" stroke="${INK}" stroke-width="4.5" stroke-linejoin="round"/><path d="M8 34C11 18 20 9 31 9s20 9 23 25c-13 7-33 7-46 0z" fill="${AMBER}" stroke="${INK}" stroke-width="4.5" stroke-linejoin="round"/><path d="M45 43c0 5-1 10-4 14h13c-3-4-4-9-3-14z" fill="${CREAM}" stroke="${INK}" stroke-width="3.5"/><path d="M38 44c2-9 7-14 11-14s9 5 11 14c-6 3-16 3-22 0z" fill="${GREEN}" stroke="${INK}" stroke-width="3.5"/><circle cx="24" cy="23" r="3" fill="${GOLD}"/><circle cx="37" cy="19" r="3" fill="${GOLD}"/>`
  }],
  [27, {
    name: 'Wood Mine',
    description: 'A freshly cut log with growth rings and a pine sprig.',
    art: `<path d="M8 29h40v26H8z" fill="${BROWN}" stroke="${INK}" stroke-width="4.5" stroke-linejoin="round"/><ellipse cx="48" cy="42" rx="10" ry="13" fill="${GOLD}" stroke="${INK}" stroke-width="4.5"/><ellipse cx="48" cy="42" rx="5" ry="7" fill="none" stroke="${BROWN}" stroke-width="2.5"/><path d="M10 33h31M10 46h30" stroke="${CREAM}" stroke-width="3"/><path d="M17 29V12m0 6L8 14m9 8 11-8m-11 2 8-7" fill="none" stroke="${GREEN}" stroke-width="4" stroke-linecap="round"/>`
  }],
  [28, {
    name: 'Wisdom Mine',
    description: 'An open book releasing a single lucid spark.',
    art: `<path d="M6 22c11-4 20 0 26 7v28c-7-7-16-10-26-6z" fill="${CREAM}" stroke="${INK}" stroke-width="4.5" stroke-linejoin="round"/><path d="M58 22c-11-4-20 0-26 7v28c7-7 16-10 26-6z" fill="${CREAM}" stroke="${INK}" stroke-width="4.5" stroke-linejoin="round"/><path d="M32 30v27" stroke="${TEAL}" stroke-width="3"/><path d="m32 5 3 8 8 3-8 3-3 8-3-8-8-3 8-3z" fill="${GOLD}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`
  }],
  [29, {
    name: 'Electronic Devices Mine',
    description: 'A powerful microchip with bold circuit traces.',
    art: `<rect x="14" y="14" width="36" height="36" rx="4" fill="${TEAL}" stroke="${INK}" stroke-width="4.5"/><rect x="23" y="23" width="18" height="18" rx="2" fill="${AMBER}" stroke="${INK}" stroke-width="3.5"/><path d="M21 14V6m11 8V5m11 9V6M21 50v8m11-8v9m11-9v8M14 21H6m8 11H5m9 11H6m44-22h8m-8 11h9m-9 11h8" stroke="${INK}" stroke-width="4" stroke-linecap="round"/><path d="M27 28h10v9H27z" fill="${GOLD}"/>`
  }],
  [30, {
    name: 'Relics Mine',
    description: 'An ancient handled amphora marked by one surviving crack.',
    art: `<path d="M24 8h16l-2 9c10 8 13 18 10 29-3 10-10 13-16 13s-13-3-16-13c-3-11 0-21 10-29z" fill="${BROWN}" stroke="${INK}" stroke-width="4.5" stroke-linejoin="round"/><path d="M18 24C5 21 7 42 19 39m27-15c13-3 11 18-1 15" fill="none" stroke="${INK}" stroke-width="4.5"/><path d="M22 10h20M18 45h29" stroke="${GOLD}" stroke-width="4"/><path d="m35 18-5 11 6 6-7 12" fill="none" stroke="${CREAM}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>`
  }]
]);

const oilField = {
  name: 'Oil Field',
  description: 'An amber pumpjack drawing oil beside a deep teal droplet.',
  art: `<path d="M7 54h38M13 52l5-34m21 34-8-33M17 31h17m-20 9h23" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/><path d="m20 16 29 9-3 10-29-9z" fill="${AMBER}" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/><path d="M47 24 57 12M8 54l8-14m25 14-8-14" fill="none" stroke="${INK}" stroke-width="4.5" stroke-linecap="round"/><path d="M57 35c0 8-5 14-11 14s-11-6-11-14c0-6 7-14 11-20 4 6 11 14 11 20z" fill="${TEAL}" stroke="${INK}" stroke-width="4"/><path d="M43 31q2-5 5-8" fill="none" stroke="${CREAM}" stroke-width="2.5" stroke-linecap="round"/>`
};

function escapeXml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function svgFor(icon) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(icon.name)}</title>
  <desc id="desc">${escapeXml(icon.description)}</desc>
  ${icon.art}
</svg>
`;
}

fs.mkdirSync(OUTPUT, { recursive: true });
for (const id of MAP_MINE_TYPE_IDS) {
  const icon = icons.get(id);
  if (!icon) throw new Error(`Missing map mine icon ${id}.`);
  fs.writeFileSync(path.join(OUTPUT, `mine-${id}.svg`), svgFor(icon));
}
fs.writeFileSync(path.join(OUTPUT, path.basename(OIL_FIELD_MAP_ICON_PATH)), svgFor(oilField));

console.log(`Generated ${MAP_MINE_TYPE_IDS.length} mine symbols and one Oil Field symbol in ${OUTPUT}.`);
