import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXPLOSIVE_ICON_ITEM_IDS } from '../src/explosive-icons.js';
import { loadLegacyCatalog } from '../src/legacy-catalog.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'public', 'img', 'items', 'explosives');
const O = '#292d29';

const DESCRIPTIONS = new Map([
  [277, 'A glossy cherry-red M-80 firecracker with a brass cap, striped fuse, and a tiny starburst seal.'],
  [278, 'Three rich red dynamite sticks bound in gold bands with a polished clockwork detonator.'],
  [279, 'A bold coral TNT charge in a blue steel carrier with a plunger, cable, and warning plate.'],
  [280, 'A sleek violet C-4 block with rounded putty edges, a bright circuit timer, and coiled wires.'],
  [281, 'A luxurious teal ANFO drum filled with golden prills and fitted with an industrial blasting cap.'],
  [282, 'A colossal midnight BLU-82 bomb with orange fins, gold bands, rivets, and a gleaming nose cone.']
]);

function gloss(pathData, width = 5) {
  return `<path d="${pathData}" fill="none" stroke="#fff6df" stroke-width="${width}" stroke-linecap="round" opacity=".72"/>`;
}

function explosiveArt(id) {
  switch (id) {
    case 277: return `
  <path d="M72 17q24 3 31 22" fill="none" stroke="${O}" stroke-width="8" stroke-linecap="round"/>
  <path d="M72 17q24 3 31 22" fill="none" stroke="#f2c94c" stroke-width="4" stroke-linecap="round" stroke-dasharray="8 7"/>
  <path d="m101 34 5 8 10-1-6 8 5 9-11-3-7 8v-11l-10-5 11-3z" fill="#ff9b2f" stroke="${O}" stroke-width="4" stroke-linejoin="round"/>
  <rect x="30" y="23" width="55" height="90" rx="20" fill="#d94a36" stroke="${O}" stroke-width="7"/>
  <path d="M35 42h45v16H35zM35 91h45v15H35z" fill="#f4a340" stroke="${O}" stroke-width="4"/>
  <path d="M42 25h31v13H42z" fill="#f5cf58" stroke="${O}" stroke-width="4"/>
  <path d="m57 59 5 10 11 1-8 8 2 11-10-5-10 5 2-11-8-8 11-1z" fill="#ffe07a" stroke="${O}" stroke-width="3" stroke-linejoin="round"/>
  ${gloss('M42 45v34', 6)}`;
    case 278: return `
  <path d="M37 27q2-14 17-14h28q14 0 15 15" fill="none" stroke="${O}" stroke-width="7" stroke-linecap="round"/>
  <path d="M37 27q2-14 17-14h28q14 0 15 15" fill="none" stroke="#f2c94c" stroke-width="3" stroke-dasharray="7 6"/>
  <g stroke="${O}" stroke-width="6">
    <rect x="15" y="35" width="34" height="78" rx="13" fill="#e35b42"/>
    <rect x="47" y="25" width="34" height="88" rx="13" fill="#c83e3c"/>
    <rect x="79" y="35" width="34" height="78" rx="13" fill="#e35b42"/>
  </g>
  <path d="M13 58h102v17H13zM13 94h102v15H13z" fill="#e0ad39" stroke="${O}" stroke-width="5"/>
  <circle cx="64" cy="62" r="22" fill="#f7df92" stroke="${O}" stroke-width="6"/>
  <circle cx="64" cy="62" r="14" fill="#253e48"/>
  <path d="M64 62 73 49M64 62l-8-6" stroke="#ffcf45" stroke-width="4" stroke-linecap="round"/>
  <circle cx="64" cy="62" r="3" fill="#ff7d3b"/>
  ${gloss('M27 43v9M59 34v10M91 43v9', 5)}`;
    case 279: return `
  <path d="M19 37h77v71H19z" fill="#ef6548" stroke="${O}" stroke-width="7" stroke-linejoin="round"/>
  <path d="M19 37 35 21h77L96 37z" fill="#80b8c8" stroke="${O}" stroke-width="6" stroke-linejoin="round"/>
  <path d="M96 37 112 21v70l-16 17z" fill="#477b90" stroke="${O}" stroke-width="6" stroke-linejoin="round"/>
  <path d="M39 21v87M79 21v87" stroke="#2f6579" stroke-width="8"/>
  <rect x="29" y="50" width="57" height="42" rx="7" fill="#f8e6b4" stroke="${O}" stroke-width="5"/>
  <path d="M39 65h37M39 77h37" stroke="#df5342" stroke-width="7" stroke-linecap="round"/>
  <path d="M89 19V8h24v14" fill="none" stroke="${O}" stroke-width="6" stroke-linejoin="round"/>
  <path d="M101 8v-3" stroke="#e0ad39" stroke-width="8" stroke-linecap="round"/>
  ${gloss('M27 42v58', 4)}
  <path d="m103 45 8 8-8 8" fill="none" stroke="#ffc64a" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
  `;
    case 280: return `
  <path d="M12 38q3-13 17-15l72-9q15-2 17 13l7 65q2 15-13 17l-78 7q-15 1-17-14z" fill="#714b87" stroke="${O}" stroke-width="7"/>
  <path d="M19 46q30-11 98-12M24 103q41-1 91-10" fill="none" stroke="#a87bbd" stroke-width="5" opacity=".8"/>
  <rect x="35" y="36" width="60" height="50" rx="8" fill="#c7d6ca" stroke="${O}" stroke-width="6" transform="rotate(-5 65 61)"/>
  <rect x="45" y="45" width="40" height="16" rx="3" fill="#263d45" transform="rotate(-5 65 53)"/>
  <path d="m51 54 7-1m7-1 13-1" stroke="#86e288" stroke-width="4" stroke-linecap="round"/>
  <g fill="#f2b53e" stroke="${O}" stroke-width="3"><circle cx="49" cy="72" r="5"/><circle cx="64" cy="71" r="5"/><circle cx="79" cy="69" r="5"/></g>
  <path d="M91 48q19-19 26-5t-8 25q-13 10 4 25" fill="none" stroke="#ff9b3d" stroke-width="5" stroke-linecap="round"/>
  <path d="M91 53q15-13 21-5" fill="none" stroke="#f5d650" stroke-width="3" stroke-linecap="round"/>
  ${gloss('M27 39 85 25', 6)}`;
    case 281: return `
  <path d="M27 28q0-15 15-15h45q15 0 15 15v77q0 12-12 12H39q-12 0-12-12z" fill="#287f83" stroke="${O}" stroke-width="7"/>
  <path d="M27 34h75M27 96h75" stroke="#efb43c" stroke-width="9"/>
  <path d="M35 39h59v51H35z" fill="#e8d08b" stroke="${O}" stroke-width="5"/>
  <g fill="#d8912f"><circle cx="46" cy="52" r="5"/><circle cx="62" cy="49" r="4"/><circle cx="79" cy="54" r="5"/><circle cx="52" cy="68" r="4"/><circle cx="70" cy="66" r="6"/><circle cx="85" cy="73" r="4"/><circle cx="42" cy="81" r="4"/><circle cx="60" cy="82" r="5"/><circle cx="77" cy="83" r="4"/></g>
  <path d="M87 13v-7h17v24" fill="none" stroke="${O}" stroke-width="6" stroke-linejoin="round"/>
  <path d="M104 29q15 4 11 20" fill="none" stroke="#f25c3f" stroke-width="6" stroke-linecap="round"/>
  <path d="m114 47 6 5-7 4" fill="#ffd34e" stroke="${O}" stroke-width="3"/>
  <path d="M40 22h38" stroke="#75c7be" stroke-width="6" stroke-linecap="round"/>
  ${gloss('M37 43v43', 5)}`;
    case 282: return `
  <path d="M36 14h53l16 18v65l-16 18H36L20 97V32z" fill="#263944" stroke="${O}" stroke-width="8" stroke-linejoin="round"/>
  <path d="m20 32-14 8v28l14 8zm85 0 17 8v28l-17 8zM36 115l-20 9h32zm53 0 20 9H77z" fill="#e86d37" stroke="${O}" stroke-width="6" stroke-linejoin="round"/>
  <path d="M27 35h71M27 94h71" stroke="#e0ad39" stroke-width="10"/>
  <path d="M43 14 51 4h23l8 10" fill="#8aa7aa" stroke="${O}" stroke-width="6" stroke-linejoin="round"/>
  <path d="M39 48h47v34H39z" fill="#f1d483" stroke="${O}" stroke-width="5"/>
  <path d="m62 52 5 9 10 2-7 7 2 9-10-4-9 4 2-9-7-7 10-2z" fill="#ef603e" stroke="${O}" stroke-width="3" stroke-linejoin="round"/>
  <g fill="#dce4df"><circle cx="32" cy="22" r="3"/><circle cx="93" cy="22" r="3"/><circle cx="32" cy="107" r="3"/><circle cx="93" cy="107" r="3"/></g>
  ${gloss('M33 44v39', 6)}`;
    default: throw new Error(`Missing explosive art for ${id}.`);
  }
}

function escapeXml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

const catalog = loadLegacyCatalog();
fs.mkdirSync(OUTPUT, { recursive: true });
const expected = new Set(EXPLOSIVE_ICON_ITEM_IDS.map((id) => `explosive-${id}.svg`));
for (const filename of fs.readdirSync(OUTPUT)) {
  if (filename.endsWith('.svg') && !expected.has(filename)) fs.rmSync(path.join(OUTPUT, filename));
}
for (const id of EXPLOSIVE_ICON_ITEM_IDS) {
  const item = catalog.byId.get(id);
  if (!item || item.mineTypeId !== 11 || item.repairedItemId !== null) {
    throw new Error(`Invalid explosive icon item ${id}.`);
  }
  const description = DESCRIPTIONS.get(id);
  if (!description) throw new Error(`Missing explosive description for ${id}.`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(item.name)}</title>
  <desc id="desc">${escapeXml(description)}</desc>${explosiveArt(id)}
</svg>
`;
  fs.writeFileSync(path.join(OUTPUT, `explosive-${id}.svg`), svg);
}
console.log(`Generated ${EXPLOSIVE_ICON_ITEM_IDS.length} explosive SVGs.`);
