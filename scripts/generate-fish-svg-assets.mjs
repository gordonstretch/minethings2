import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FISH_ICON_ITEM_IDS } from '../src/fish-icons.js';
import { loadLegacyCatalog } from '../src/legacy-catalog.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'public', 'img', 'items', 'fish');
const O = '#292d29';
const WATER = '#3d7f92';
const DEEP = '#244f65';
const PALE = '#d9e5df';
const SILVER = '#aebfbe';
const GOLD = '#d8be32';
const ORANGE = '#f28c28';
const GREEN = '#4f8b67';
const RED = '#c84a3b';

const descriptions = new Map([
  [316, 'A broad mottled flounder seen from above, with both raised eyes and a rippling edge fin.'],
  [317, 'A small spotted dogfish shark with a blunt snout, two dorsal fins, and a slim asymmetric tail.'],
  [318, 'A long silver barracuda with a pointed snout, underslung jaw, sharp teeth, and forked tail.'],
  [319, 'A manta ray gliding from above with immense triangular wings, cephalic lobes, and a whip tail.'],
  [320, 'A streamlined king mackerel with a dark wavy back, silver flank, finlets, and deeply forked tail.'],
  [321, 'A massive grouper with a heavy head, cavernous mouth, rounded tail, and dappled body.'],
  [322, 'A brilliant mahi-mahi with a steep forehead, long dorsal fin, golden flank, and electric-blue spots.'],
  [323, 'A graceful blue shark with a long conical snout, indigo back, narrow body, and sweeping pectoral fins.'],
  [324, 'A muscular yellowfin tuna with a metallic flank, long yellow sickle fins, and rows of bright finlets.'],
  [325, 'A spectacular sailfish with a spear bill, cobalt stripes, and an enormous spotted dorsal sail.'],
  [326, 'A powerful amberjack with a deep silver body, amber lateral stripe, forked tail, and dark eye band.'],
  [327, 'A fast slender wahoo with an iridescent blue back, pointed jaws, and vertical cobalt bars.'],
  [328, 'A barrel-bodied bluefin tuna with a dark blue back, silver belly, short fins, and yellow finlets.'],
  [329, 'A thresher shark with a compact body, small mouth, and extraordinarily long scythe-like upper tail.'],
  [330, 'A pale white marlin with a long round bill, cobalt-tipped fins, and a low flowing dorsal crest.'],
  [331, 'A torpedo-shaped mako shark with a pointed snout, powerful crescent tail, and exposed triangular teeth.'],
  [332, 'A striped marlin with a long bill, tall violet dorsal fin, and luminous vertical body stripes.'],
  [333, 'A hammerhead shark with a broad cephalofoil, eyes at each tip, tall dorsal, and sweeping tail.'],
  [334, 'A deep-bodied bigeye tuna with a huge bright eye, dark back, golden finlets, and crescent tail.'],
  [335, 'A swordfish with a flattened sword-like bill, smooth dark body, high first dorsal, and crescent tail.'],
  [336, 'A magnificent blue marlin with a massive cobalt shoulder, spear bill, striped flank, and high crest.'],
  [337, 'A formidable black marlin with a thick bill, charcoal back, rigid pectoral fin, and silver belly.'],
  [338, 'A lean spearfish with a short sharp bill, high narrow dorsal, scattered spots, and delicate finlets.'],
  [339, 'A great white shark with a huge conical body, slate back, white belly, black eye, and toothed jaw.']
]);

function bubbles(x = 14, y = 24) {
  return `<g fill="none" stroke="#76afba" stroke-width="3"><circle cx="${x}" cy="${y}" r="4"/><circle cx="${x + 11}" cy="${y - 10}" r="3"/></g>`;
}

function art(id) {
  switch (id) {
    case 316: return `<path d="M20 71q5-37 43-51 35 6 48 37 9 29-18 50-36 15-66-8z" fill="#967957" stroke="${O}" stroke-width="7"/><path d="M28 72q18-30 51-37 21 12 24 35-3 24-25 35-29 3-50-14z" fill="#b39469" stroke="#66533e" stroke-width="4"/><path d="M22 70 7 57m16 35L8 105" stroke="${O}" stroke-width="6" stroke-linecap="round"/><circle cx="50" cy="47" r="7" fill="${GOLD}" stroke="${O}" stroke-width="4"/><circle cx="68" cy="42" r="7" fill="${GOLD}" stroke="${O}" stroke-width="4"/><g fill="#6f5943"><circle cx="47" cy="73" r="5"/><circle cx="76" cy="65" r="7"/><circle cx="83" cy="89" r="5"/><circle cx="55" cy="96" r="4"/></g>`;
    case 317: return `<path d="M12 68q28-31 74-17l28-21-7 27 14 20-30-7q-46 28-79-2z" fill="#788e8a" stroke="${O}" stroke-width="7" stroke-linejoin="round"/><path d="M46 49 58 28l13 24M77 69l19 20-28-11" fill="#657a77" stroke="${O}" stroke-width="5"/><path d="M18 68q30 13 72 2" stroke="${PALE}" stroke-width="6" fill="none"/><circle cx="28" cy="61" r="4" fill="${O}"/><g fill="#3f5552"><circle cx="44" cy="58" r="3"/><circle cx="57" cy="64" r="3"/><circle cx="71" cy="57" r="3"/></g>`;
    case 318: return `<path d="M8 66q32-25 91-12l23-18-6 25 8 23-27-14q-58 22-89-4z" fill="${SILVER}" stroke="${O}" stroke-width="7" stroke-linejoin="round"/><path d="M8 66 27 53l16 2-9 14H12z" fill="#778a89"/><path d="M20 69q12 13 31 2" fill="none" stroke="${O}" stroke-width="4"/><path d="m17 69 8 5 7-6 7 5" fill="none" stroke="white" stroke-width="3"/><circle cx="25" cy="59" r="4" fill="${GOLD}" stroke="${O}" stroke-width="2"/><path d="M61 53 72 36l11 18M69 72l15 15" fill="${DEEP}" stroke="${O}" stroke-width="4"/>`;
    case 319: return `<path d="M64 21q23 22 55 31-12 39-43 38l-12 20-12-20q-31 1-43-38 32-9 55-31z" fill="${DEEP}" stroke="${O}" stroke-width="7" stroke-linejoin="round"/><path d="M18 54q27 5 46-23 19 28 46 23-15 17-39 22H57q-24-5-39-22z" fill="${WATER}"/><path d="M64 88v34" stroke="${O}" stroke-width="6" stroke-linecap="round"/><path d="M49 37 35 25m44 12 14-12" stroke="${DEEP}" stroke-width="8" stroke-linecap="round"/><circle cx="53" cy="49" r="4" fill="${GOLD}"/><circle cx="75" cy="49" r="4" fill="${GOLD}"/>`;
    case 320: return `<path d="M10 67q28-29 82-14l26-19-8 27 12 24-30-15q-53 24-82-3z" fill="${SILVER}" stroke="${O}" stroke-width="7" stroke-linejoin="round"/><path d="M15 62q37-22 79-7" stroke="${DEEP}" stroke-width="10"/><path d="M44 53q7 9 15 0m2 2q7 9 15 0m2 2q7 8 14 0" fill="none" stroke="#8fb6bb" stroke-width="4"/><circle cx="27" cy="61" r="4" fill="${O}"/><path d="M60 52 72 35l12 19m2 19 15 11" fill="${DEEP}" stroke="${O}" stroke-width="4"/><g fill="${GOLD}"><path d="m78 76 7 8 5-10z"/><path d="m91 73 7 7 4-10z"/></g>`;
    case 321: return `<path d="M10 70q16-40 65-39 31 4 43 34-9 36-49 45-42 0-59-40z" fill="#6d8061" stroke="${O}" stroke-width="7"/><path d="M13 68q13-17 31-10L29 80q-10 7-16-12z" fill="#435240" stroke="${O}" stroke-width="5"/><circle cx="31" cy="52" r="6" fill="${GOLD}" stroke="${O}" stroke-width="3"/><path d="M70 35 87 17l13 24M74 104l21 15-5-21" fill="#57704f" stroke="${O}" stroke-width="5"/><path d="M113 57 126 37l-2 32 2 30-15-20" fill="#6d8061" stroke="${O}" stroke-width="6"/><g fill="#40513d"><circle cx="54" cy="58" r="5"/><circle cx="77" cy="48" r="4"/><circle cx="91" cy="68" r="6"/><circle cx="64" cy="87" r="4"/></g>`;
    case 322: return `<path d="M9 69q10-38 49-42 39 0 61 31l-8 27q-37 27-83 11Q12 87 9 69z" fill="${GREEN}" stroke="${O}" stroke-width="7"/><path d="M15 73q40 16 94 2-18 30-73 23z" fill="${GOLD}"/><path d="M18 53q42-32 88-8" stroke="${WATER}" stroke-width="10"/><path d="M64 29q22-17 43 8M55 98l20 20 7-25" fill="${WATER}" stroke="${O}" stroke-width="5"/><path d="M113 55 125 34l-2 31 3 29-17-14" fill="${GOLD}" stroke="${O}" stroke-width="6"/><circle cx="27" cy="58" r="5" fill="${O}"/><g fill="#55b5bd"><circle cx="45" cy="59" r="3"/><circle cx="59" cy="70" r="4"/><circle cx="78" cy="55" r="3"/><circle cx="91" cy="69" r="4"/></g>`;
    case 323: return `<path d="M8 66q35-34 85-15l27-22-8 31 13 22-31-13q-51 25-86-3z" fill="#426f86" stroke="${O}" stroke-width="7" stroke-linejoin="round"/><path d="M47 50 63 21l16 33M65 72l37 31-48-19" fill="${DEEP}" stroke="${O}" stroke-width="5"/><path d="M12 68q39 13 81 1" fill="none" stroke="${PALE}" stroke-width="7"/><circle cx="25" cy="59" r="4" fill="${O}"/><path d="M92 52 111 42m-18 27 19 8" stroke="#7398a8" stroke-width="4"/>`;
    case 324: return `<path d="M8 66q25-35 81-24l32 24-32 25Q31 102 8 66z" fill="${SILVER}" stroke="${O}" stroke-width="7"/><path d="M14 60q37-26 78-13" stroke="${DEEP}" stroke-width="11"/><path d="M67 45 84 14l12 34M65 87l21 28 9-31" fill="${GOLD}" stroke="${O}" stroke-width="5"/><path d="m91 44 30-20-7 42 7 39-32-18" fill="${GOLD}" stroke="${O}" stroke-width="6"/><circle cx="24" cy="60" r="5" fill="${O}"/><g fill="${GOLD}"><path d="m93 51 8 6-8 6z"/><path d="m97 65 9 5-9 6z"/><path d="m93 78 8 5-8 6z"/></g>`;
    case 325: return `<path d="M20 68q25-27 76-15l24-13-11 26 12 25-28-17q-46 19-73-6z" fill="${SILVER}" stroke="${O}" stroke-width="7"/><path d="m21 68-17-5 18-5" fill="${PALE}" stroke="${O}" stroke-width="4"/><path d="M40 54Q51 3 99 18l-8 38z" fill="${DEEP}" stroke="${O}" stroke-width="6"/><path d="M49 49q4-19 10-28m5 30q5-23 10-33m5 35q6-22 12-31" stroke="#6fb1bd" stroke-width="4"/><g fill="${PALE}"><circle cx="57" cy="28" r="3"/><circle cx="73" cy="25" r="3"/><circle cx="85" cy="33" r="3"/></g><path d="M31 69q31 13 60 3" stroke="${WATER}" stroke-width="6" fill="none"/><circle cx="31" cy="58" r="4" fill="${O}"/>`;
    case 326: return `<path d="M9 68q22-38 74-31 26 4 39 29-15 33-52 39-43-1-61-37z" fill="${SILVER}" stroke="${O}" stroke-width="7"/><path d="M15 63q41-17 89-4" stroke="#9a752d" stroke-width="9"/><path d="m91 42 29-22-6 45 8 41-31-24" fill="${GOLD}" stroke="${O}" stroke-width="6"/><path d="M30 48 42 65" stroke="${O}" stroke-width="7"/><circle cx="27" cy="52" r="5" fill="${GOLD}" stroke="${O}" stroke-width="3"/><path d="M58 42 72 21l16 20M63 99l19 18 6-22" fill="#748784" stroke="${O}" stroke-width="5"/>`;
    case 327: return `<path d="M7 66q28-28 87-18l29-17-10 29 12 24-31-18q-59 24-87 0z" fill="${SILVER}" stroke="${O}" stroke-width="7"/><path d="M12 61q42-19 83-10" stroke="${DEEP}" stroke-width="10"/><path d="M41 51 45 73m12-24 5 25m12-24 5 23m11-20 4 16" stroke="#477da3" stroke-width="5"/><path d="M15 66 31 55l17 2-10 11H16z" fill="#e9efea"/><circle cx="25" cy="58" r="4" fill="${O}"/><path d="M61 49 74 32l13 19" fill="${DEEP}" stroke="${O}" stroke-width="4"/>`;
    case 328: return `<path d="M7 66q25-38 79-29l35 29-35 31Q31 105 7 66z" fill="${SILVER}" stroke="${O}" stroke-width="8"/><path d="M13 60q34-29 77-17" stroke="#284f68" stroke-width="12"/><path d="m89 39 32-22-7 49 7 46-33-20" fill="${DEEP}" stroke="${O}" stroke-width="7"/><path d="M55 41 70 19l17 21M56 94l19 19 10-23" fill="${DEEP}" stroke="${O}" stroke-width="5"/><circle cx="23" cy="59" r="5" fill="${O}"/><g fill="${GOLD}"><path d="m91 48 8 7-8 6z"/><path d="m96 61 8 6-8 7z"/><path d="m92 77 8 5-8 7z"/></g>`;
    case 329: return `<path d="M8 67q31-33 78-16l20-11-6 23 17 11-26-3q-50 23-83-4z" fill="#697f83" stroke="${O}" stroke-width="7"/><path d="M47 50 61 25l17 29M65 72l29 21-38-10" fill="#526b70" stroke="${O}" stroke-width="5"/><path d="M101 61q12-40 22-52-1 47-11 67" fill="none" stroke="${O}" stroke-width="9" stroke-linecap="round"/><path d="M11 68q38 12 78 4" stroke="${PALE}" stroke-width="6" fill="none"/><circle cx="24" cy="60" r="4" fill="${O}"/>`;
    case 330: return `<path d="M20 69q27-29 75-15l27-14-10 26 12 24-31-16q-46 20-73-5z" fill="#d7ddd7" stroke="${O}" stroke-width="7"/><path d="m20 68-17-4 18-5" fill="#e8ece7" stroke="${O}" stroke-width="4"/><path d="M42 54q17-30 52-16l-4 19" fill="#e5e7df" stroke="${O}" stroke-width="5"/><path d="M35 68q26 12 57 5" fill="none" stroke="#477b9a" stroke-width="7"/><path d="M58 78l20 26 8-28" fill="#477b9a" stroke="${O}" stroke-width="5"/><circle cx="30" cy="59" r="4" fill="${O}"/>`;
    case 331: return `<path d="M7 66q32-39 86-16l26-23-7 33 14 22-32-13Q41 99 7 66z" fill="#486d7c" stroke="${O}" stroke-width="8"/><path d="M45 50 61 18l20 37M61 73l37 31-47-19" fill="#33596a" stroke="${O}" stroke-width="6"/><path d="M10 68q39 15 84 2" stroke="white" stroke-width="8" fill="none"/><path d="M11 66q12-10 25-3-8 17-22 10" fill="#233033" stroke="${O}" stroke-width="4"/><path d="m16 67 6 5 6-7 6 4" stroke="white" stroke-width="3"/><circle cx="25" cy="56" r="4" fill="${O}"/>`;
    case 332: return `<path d="M19 69q25-30 76-15l27-14-10 26 12 24-31-16q-47 21-74-5z" fill="#7087a0" stroke="${O}" stroke-width="7"/><path d="m20 68-17-5 18-5" fill="#99adbc" stroke="${O}" stroke-width="4"/><path d="M42 53q15-40 53-22l-4 27" fill="#53628a" stroke="${O}" stroke-width="6"/><path d="M45 54 50 79m11-29 5 31m11-29 5 26m10-22 4 18" stroke="#c6dbe0" stroke-width="5"/><circle cx="29" cy="58" r="4" fill="${O}"/><path d="M59 79l20 26 8-30" fill="#594f83" stroke="${O}" stroke-width="5"/>`;
    case 333: return `<path d="M19 62 4 50l25-9 19 10q28-11 52 2l24-19-8 28 10 22-28-15q-25 17-51 3L28 84 4 74z" fill="#718684" stroke="${O}" stroke-width="7" stroke-linejoin="round"/><circle cx="12" cy="53" r="4" fill="${O}"/><circle cx="12" cy="71" r="4" fill="${O}"/><path d="M55 50 71 17l19 40M61 73l35 29-45-18" fill="#596e6c" stroke="${O}" stroke-width="5"/><path d="M30 67q34 11 67 2" stroke="${PALE}" stroke-width="6" fill="none"/>`;
    case 334: return `<path d="M8 66q22-39 76-31l37 31-35 32Q28 106 8 66z" fill="${SILVER}" stroke="${O}" stroke-width="8"/><path d="M13 59q35-27 75-18" stroke="${DEEP}" stroke-width="12"/><circle cx="26" cy="57" r="11" fill="${GOLD}" stroke="${O}" stroke-width="5"/><circle cx="26" cy="57" r="4" fill="${O}"/><path d="m88 37 33-22-8 51 8 47-35-22" fill="${DEEP}" stroke="${O}" stroke-width="7"/><g fill="${GOLD}"><path d="m91 47 9 7-9 7z"/><path d="m96 63 9 6-9 7z"/><path d="m91 79 9 6-9 7z"/></g>`;
    case 335: return `<path d="M20 68q29-32 75-14l28-14-11 26 13 23-32-15q-44 20-73-6z" fill="#586d79" stroke="${O}" stroke-width="7"/><path d="m20 67-18-5 19-6" fill="#6f838c" stroke="${O}" stroke-width="4"/><path d="M46 53Q56 15 88 22l6 33" fill="#3d5362" stroke="${O}" stroke-width="6"/><path d="M30 69q31 11 61 4" stroke="${PALE}" stroke-width="6" fill="none"/><path d="M62 77 83 99l5-27" fill="#465d68" stroke="${O}" stroke-width="5"/><circle cx="30" cy="58" r="4" fill="${O}"/>`;
    case 336: return `<path d="M19 70q22-36 75-18l29-13-11 27 13 24-32-15q-50 23-74-5z" fill="#356f96" stroke="${O}" stroke-width="8"/><path d="m20 69-18-6 19-5" fill="#4e89aa" stroke="${O}" stroke-width="5"/><path d="M40 53Q56 9 96 29l-5 28" fill="#25547e" stroke="${O}" stroke-width="7"/><path d="M45 56 51 80m10-29 6 32m10-29 5 26" stroke="#a9d0d7" stroke-width="5"/><path d="M31 71q32 11 61 4" stroke="${PALE}" stroke-width="7" fill="none"/><path d="M60 80 83 109l7-35" fill="#2f6387" stroke="${O}" stroke-width="6"/><circle cx="29" cy="58" r="4" fill="${GOLD}"/>`;
    case 337: return `<path d="M18 68q25-37 77-17l29-14-11 28 12 24-33-15q-49 23-74-6z" fill="#343f43" stroke="${O}" stroke-width="8"/><path d="m19 67-17-5 18-6" fill="#505c60" stroke="${O}" stroke-width="5"/><path d="M42 52Q58 13 96 27l-4 29" fill="#202b31" stroke="${O}" stroke-width="7"/><path d="M29 70q31 13 63 5" stroke="${SILVER}" stroke-width="8" fill="none"/><path d="M56 76 91 99 76 70" fill="#242e31" stroke="${O}" stroke-width="6"/><circle cx="29" cy="57" r="4" fill="${GOLD}"/><path d="M47 56 52 78m12-27 5 31" stroke="#6e7c80" stroke-width="4"/>`;
    case 338: return `<path d="M20 69q28-29 74-16l28-14-10 26 12 23-31-14q-45 19-73-5z" fill="#79919b" stroke="${O}" stroke-width="7"/><path d="m20 68-15-5 16-5" fill="#94a8ae" stroke="${O}" stroke-width="4"/><path d="M43 53Q55 17 88 24l7 31" fill="#526e83" stroke="${O}" stroke-width="6"/><path d="M61 77 79 101l8-29" fill="#526e83" stroke="${O}" stroke-width="5"/><circle cx="29" cy="59" r="4" fill="${O}"/><g fill="#d7eff0"><circle cx="48" cy="62" r="3"/><circle cx="62" cy="70" r="3"/><circle cx="76" cy="60" r="3"/><circle cx="88" cy="68" r="3"/></g><g fill="${GOLD}"><path d="m92 75 7 6-7 5z"/><path d="m97 64 7 5-7 5z"/></g>`;
    case 339: return `<path d="M5 65q29-45 86-20l29-27-8 39 14 25-34-13Q37 104 5 65z" fill="#596c70" stroke="${O}" stroke-width="9"/><path d="M41 48 59 10l23 44M58 73l42 37-53-23" fill="#43575c" stroke="${O}" stroke-width="7"/><path d="M8 68q39 20 85 2" stroke="#eef0e8" stroke-width="11" fill="none"/><path d="M8 64q17-12 35 0-9 24-31 15" fill="#273033" stroke="${O}" stroke-width="5"/><path d="m13 68 7 6 7-8 7 6 6-8" stroke="white" stroke-width="4" fill="none"/><circle cx="25" cy="53" r="5" fill="${O}"/>${bubbles(12, 25)}`;
    default: throw new Error(`Missing Fish art for item ${id}.`);
  }
}

function escapeXml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

const catalog = loadLegacyCatalog();
fs.mkdirSync(OUTPUT, { recursive: true });
const expected = new Set(FISH_ICON_ITEM_IDS.map((id) => `item-${id}.svg`));
for (const filename of fs.readdirSync(OUTPUT)) {
  if (filename.endsWith('.svg') && !expected.has(filename)) fs.rmSync(path.join(OUTPUT, filename));
}
for (const id of FISH_ICON_ITEM_IDS) {
  const item = catalog.byId.get(id);
  if (!item || item.mineTypeId !== 15 || item.repairedItemId !== null) {
    throw new Error(`Invalid Fish icon item ${id}.`);
  }
  const description = descriptions.get(id);
  if (!description) throw new Error(`Missing Fish description for item ${id}.`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(item.name)}</title>
  <desc id="desc">${escapeXml(description)}</desc>
  ${art(id)}
</svg>
`;
  fs.writeFileSync(path.join(OUTPUT, `item-${id}.svg`), svg);
}
console.log(`Generated ${FISH_ICON_ITEM_IDS.length} Fish SVGs in ${OUTPUT}.`);
