import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AVATAR_ICON_ITEM_IDS } from '../src/avatar-icons.js';
import { EQUIPMENT_ICON_ITEM_IDS } from '../src/equipment-icons.js';
import { loadLegacyCatalog } from '../src/legacy-catalog.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AVATAR_OUTPUT = path.join(ROOT, 'public', 'img', 'items', 'avatars');
const EQUIPMENT_OUTPUT = path.join(ROOT, 'public', 'img', 'items', 'equipment');
const OUTLINE = '#242927';
const PAPER = '#f5eedb';
const ORANGE = '#f28c28';
const GOLD = '#d8ad37';

const RARITY = Object.freeze({
  1: { main: '#d8be32', light: '#f2df6b', dark: '#877316', accent: '#fff2a3' },
  2: { main: '#698b18', light: '#a6c94c', dark: '#3d5710', accent: '#d9e67a' },
  3: { main: '#799c9c', light: '#b8d1d1', dark: '#405f63', accent: '#e2f1ed' },
  4: { main: '#e32121', light: '#f16657', dark: '#8b1517', accent: '#ffaa72' },
  5: { main: '#a64891', light: '#d17bc0', dark: '#612957', accent: '#f1b5dc' },
  6: { main: '#f79721', light: '#ffc45c', dark: '#9e4c14', accent: '#ffe08a' }
});

const ROLE = Object.freeze({
  Bum: { main: '#77736b', light: '#b7aa91', dark: '#4a4945', accent: '#bd7745' },
  Merchant: { main: '#9a673d', light: '#d4a35b', dark: '#563924', accent: '#e8c45f' },
  'Bounty Hunter': { main: '#596567', light: '#a8b0a8', dark: '#303739', accent: '#c04f39' },
  Highway: { main: '#40536b', light: '#7e94a8', dark: '#242d3a', accent: '#d5a447' },
  Fisher: { main: '#397783', light: '#82bbc0', dark: '#234a54', accent: '#e8b34e' },
  Banker: { main: '#5c496d', light: '#9b83aa', dark: '#33293e', accent: '#d9b341' },
  Worker: { main: '#b56a32', light: '#e6a55c', dark: '#663d27', accent: '#e5d46a' },
  Trader: { main: '#50764b', light: '#8eb07e', dark: '#30472d', accent: '#d3a64a' },
  Guard: { main: '#667578', light: '#bbc4bf', dark: '#374246', accent: '#d59a35' },
  Pirate: { main: '#8c3f37', light: '#cb7a62', dark: '#4b2527', accent: '#e1bd52' },
  Pilot: { main: '#4c6d8b', light: '#94b7ca', dark: '#293c51', accent: '#e49a3a' },
  Manufacturer: { main: '#5c625e', light: '#a6aaa0', dark: '#303532', accent: '#f08b2d' }
});

function escapeXml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function documentSvg(title, description, rarity, art, family) {
  const p = RARITY[rarity] ?? RARITY[1];
  const definitions = art.includes('url(#tier)') ? `
  <defs>
    <linearGradient id="tier" x1="28" y1="20" x2="96" y2="110" gradientUnits="userSpaceOnUse">
      <stop stop-color="${p.light}"/><stop offset=".48" stop-color="${p.main}"/><stop offset="1" stop-color="${p.dark}"/>
    </linearGradient>
  </defs>` : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(title)}</title>
  <desc id="desc">${escapeXml(description)}</desc>${definitions}
  <g data-icon-family="${family}" stroke-linecap="round" stroke-linejoin="round">${art}</g>
</svg>
`;
}

function equipmentArt(type, rarity) {
  const p = RARITY[rarity];
  if (type === 'Tool Belt') return `
    <path d="M16 43q48-16 96 0l-4 22q-44-13-88 0z" fill="url(#tier)" stroke="${OUTLINE}" stroke-width="6"/>
    <path d="M24 59v39h27V55m26 0v43h27V59" fill="${p.main}" stroke="${OUTLINE}" stroke-width="6"/>
    <path d="M31 69h13m40 0h13" stroke="${p.accent}" stroke-width="4"/>
    <rect x="54" y="38" width="20" height="28" rx="3" fill="${p.accent}" stroke="${OUTLINE}" stroke-width="5"/>
    <rect x="60" y="46" width="8" height="12" rx="1" fill="${p.dark}"/>`;
  if (type === 'Boots') return `
    <path d="M23 21h34v55L45 101H13q-7 0-5-11l15-18z" fill="url(#tier)" stroke="${OUTLINE}" stroke-width="6"/>
    <path d="M71 21h34v51l15 18q2 11-5 11H83L71 76z" fill="url(#tier)" stroke="${OUTLINE}" stroke-width="6"/>
    <path d="M25 40h30m18 0h30M19 76h36m18 0h36" fill="none" stroke="${p.accent}" stroke-width="5"/>
    <path d="M11 102h45m16 0h45" stroke="${OUTLINE}" stroke-width="7"/>`;
  if (type === 'Pickaxe') return `
    <path d="m72 43 14 10-49 68-14-10z" fill="#9a6336" stroke="${OUTLINE}" stroke-width="5"/>
    <path d="M14 40 28 22q48-14 87 17l-9 17Q73 35 36 49z" fill="url(#tier)" stroke="${OUTLINE}" stroke-width="6"/>
    <path d="M22 37q45-16 84 10" fill="none" stroke="${p.accent}" stroke-width="4"/>`;
  if (type === 'Drill') return `
    <path d="M16 35h64l18 16v22L80 87H16z" fill="url(#tier)" stroke="${OUTLINE}" stroke-width="6"/>
    <path d="M98 51h16l9 11-9 11H98z" fill="${p.dark}" stroke="${OUTLINE}" stroke-width="5"/>
    <path d="M40 87h34l-8 34H43z" fill="${p.dark}" stroke="${OUTLINE}" stroke-width="6"/>
    <circle cx="76" cy="61" r="11" fill="${p.accent}" stroke="${OUTLINE}" stroke-width="5"/>
    <path d="M25 48h28m-28 13h20" stroke="${p.accent}" stroke-width="5"/>`;
  if (type === 'Cart') return `
    <path d="M13 28h94L93 80H28z" fill="url(#tier)" stroke="${OUTLINE}" stroke-width="6"/>
    <path d="M19 45h83M25 62h72" stroke="${p.accent}" stroke-width="5"/>
    <path d="M107 28h13" stroke="${OUTLINE}" stroke-width="8"/>
    <circle cx="39" cy="99" r="14" fill="${p.dark}" stroke="${OUTLINE}" stroke-width="6"/>
    <circle cx="84" cy="99" r="14" fill="${p.dark}" stroke="${OUTLINE}" stroke-width="6"/>
    <circle cx="39" cy="99" r="5" fill="${p.accent}"/><circle cx="84" cy="99" r="5" fill="${p.accent}"/>`;
  if (type === 'Hardhat') return `
    <path d="M19 77q3-51 45-54 42 3 45 54z" fill="url(#tier)" stroke="${OUTLINE}" stroke-width="6"/>
    <path d="M54 23h20v52H54z" fill="${p.main}" stroke="${OUTLINE}" stroke-width="5"/>
    <path d="M12 75h104v20H12z" fill="${p.accent}" stroke="${OUTLINE}" stroke-width="6"/>
    <path d="M27 68q7-29 27-37m47 37q-7-29-27-37" fill="none" stroke="${p.accent}" stroke-width="5"/>`;
  return `
    <path d="M43 22h42l9 18v66H34V40z" fill="url(#tier)" stroke="${OUTLINE}" stroke-width="6"/>
    <path d="M27 45h74v55H27z" fill="${p.dark}" stroke="${OUTLINE}" stroke-width="6"/>
    <circle cx="64" cy="72" r="24" fill="${p.accent}" stroke="${OUTLINE}" stroke-width="5"/>
    <circle cx="64" cy="72" r="13" fill="${PAPER}"/>
    <path d="M52 22V10h24v12M23 111h82" stroke="${OUTLINE}" stroke-width="7"/>`;
}

const BORDER_ART = Object.freeze({
  Almond: '<rect x="17" y="17" width="94" height="94" rx="22" fill="none" stroke="#b98552" stroke-width="14"/><path d="M29 23q8 8 0 16m70-16q-8 8 0 16M29 89q8 8 0 16m70-16q-8 8 0 16" fill="none" stroke="#f0c98a" stroke-width="5"/>',
  Clay: '<rect x="16" y="16" width="96" height="96" rx="15" fill="none" stroke="#a95e3f" stroke-width="15"/><path d="m21 43 9-5m-7 34 10 4m69-33 8 4m-11 34 9-5" stroke="#e39b69" stroke-width="5"/>',
  Sticks: '<path d="M17 20 25 111M39 16l-6 96M111 20l-8 92M89 16l7 96M18 24l92 7M17 103l94-9" fill="none" stroke="#79502d" stroke-width="9"/><path d="m17 20 94 83M111 20 17 103" opacity=".25" stroke="#d7a55a" stroke-width="4"/>',
  Brown: '<rect x="16" y="16" width="96" height="96" rx="9" fill="none" stroke="#5a3929" stroke-width="16"/><path d="M27 27h74v74H27z" fill="none" stroke="#c68a54" stroke-width="3" stroke-dasharray="5 6"/>',
  Snow: '<rect x="17" y="17" width="94" height="94" rx="18" fill="none" stroke="#eaf7f4" stroke-width="15"/><path d="m24 24 10 10m70-10-10 10m10 70-10-10m-70 10 10-10" stroke="#7fb7c6" stroke-width="5"/>',
  Wood: '<rect x="15" y="15" width="98" height="98" rx="4" fill="none" stroke="#80512e" stroke-width="17"/><path d="M20 35h18m52 58h18M34 20v18m59 53v17" stroke="#d29a53" stroke-width="4"/><circle cx="28" cy="94" r="5" fill="none" stroke="#d29a53" stroke-width="3"/>',
  Rock: '<path d="M18 18h24l8 9 16-11 18 10 25-8 4 27-9 14 10 18-8 34-29-5-15 8-20-7-26 4 4-29-7-18 9-17z" fill="none" stroke="#6d716d" stroke-width="15"/><path d="m24 27 13 8m52-7-11 9m19 55-14-5m-51 11 11-10" stroke="#b9b8a9" stroke-width="5"/>',
  Chocolate: '<rect x="15" y="15" width="98" height="98" rx="8" fill="none" stroke="#5b3026" stroke-width="17"/><path d="M18 31h20V17m72 14H90V17M18 96h20v15m72-15H90v15" fill="none" stroke="#b86b42" stroke-width="5"/>',
  Silver: '<rect x="16" y="16" width="96" height="96" rx="17" fill="none" stroke="#9ba7a8" stroke-width="15"/><path d="M22 25h84M22 103h84" stroke="#e7efeb" stroke-width="4"/><circle cx="25" cy="25" r="4" fill="#444b4c"/><circle cx="103" cy="25" r="4" fill="#444b4c"/><circle cx="25" cy="103" r="4" fill="#444b4c"/><circle cx="103" cy="103" r="4" fill="#444b4c"/>',
  Paper: '<path d="m18 19 15 4 14-7 18 7 17-6 14 7 14-4-3 91-15-5-14 6-16-6-17 6-14-6-13 5z" fill="none" stroke="#e8ddbd" stroke-width="15"/><path d="M27 31h20m34 66h20" stroke="#a99b7d" stroke-width="3"/>',
  Pumpkin: '<rect x="16" y="16" width="96" height="96" rx="21" fill="none" stroke="#df711f" stroke-width="15"/><path d="M25 38q17-20 30-8m48 60q-17 20-30 8M22 56q-10-15 2-25m82 41q10 15-2 25" fill="none" stroke="#4e813f" stroke-width="5"/>',
  Dew: '<rect x="17" y="17" width="94" height="94" rx="25" fill="none" stroke="#79bfc7" stroke-width="13"/><path d="M27 25q9 12 0 20-9-8 0-20m74 58q9 12 0 20-9-8 0-20M97 25q7 10 0 16-7-6 0-16M31 87q7 10 0 16-7-6 0-16" fill="#d9ffff" stroke="#347f8c" stroke-width="3"/>',
  Mud: '<rect x="16" y="16" width="96" height="96" rx="14" fill="none" stroke="#654a31" stroke-width="16"/><circle cx="27" cy="32" r="7" fill="#9d7042"/><circle cx="100" cy="44" r="6" fill="#9d7042"/><circle cx="35" cy="99" r="5" fill="#9d7042"/><circle cx="96" cy="94" r="8" fill="#9d7042"/>',
  Black: '<rect x="16" y="16" width="96" height="96" rx="5" fill="none" stroke="#171b1c" stroke-width="17"/><path d="m22 35 16-13m52 84 17-14m-85-2 12 16m70-84-13 14" stroke="#596266" stroke-width="4"/>',
  Marble: '<rect x="16" y="16" width="96" height="96" rx="12" fill="none" stroke="#e4e1d7" stroke-width="16"/><path d="M19 45q20-13 29 3t24-2 37-3M22 91q21-15 36-2t48-5" fill="none" stroke="#78949b" stroke-width="4"/>',
  Minethings: `<rect x="15" y="15" width="98" height="98" rx="9" fill="none" stroke="${ORANGE}" stroke-width="17"/><path d="M19 34h20L29 20m80 74H89l10 14M34 109V89l-14 10m89-65H89l10-14" fill="none" stroke="${OUTLINE}" stroke-width="5"/>`,
  Persian: '<rect x="15" y="15" width="98" height="98" rx="4" fill="none" stroke="#813b46" stroke-width="17"/><path d="m25 25 12 8-12 8 12 8-12 8m78-32-12 8 12 8-12 8 12 8M26 93l11-8 11 8-11 8zm76 0-11-8-11 8 11 8z" fill="none" stroke="#ddb94f" stroke-width="4"/>',
  Bullet: '<rect x="16" y="16" width="96" height="96" rx="8" fill="none" stroke="#4d5555" stroke-width="15"/><path d="M22 23h18v9H22zm66 0h18v9H88zM22 96h18v9H22zm66 0h18v9H88z" fill="#d2a43f" stroke="#242927" stroke-width="3"/><path d="m27 23 4-7 4 7m58 0 4-7 4 7m-74 73 4-7 4 7m58 0 4-7 4 7" fill="#c8c4aa" stroke="#242927" stroke-width="2"/>'
});

function borderArt(name) {
  const material = name.replace(' Border', '');
  return `${BORDER_ART[material]}<circle cx="64" cy="57" r="17" fill="#c98f63" stroke="${OUTLINE}" stroke-width="5"/><path d="M38 100q4-28 26-28t26 28" fill="#59756f" stroke="${OUTLINE}" stroke-width="5"/>`;
}

function backgroundArt(name) {
  const key = name.replace(' Background', '');
  const sky = '<path d="M14 16h100v96H14z" fill="#8cb9bd" stroke="#242927" stroke-width="5"/>';
  const scenes = {
    City: '<path d="M17 103V58h20v45m0 0V35h25v68m0 0V52h20v51m0 0V27h27v76z" fill="#566665" stroke="#242927" stroke-width="5"/><path d="M45 48h8m17 17h7m14-25h9M25 70h5" stroke="#f0bd4f" stroke-width="4"/>',
    Fishing: '<path d="M14 76q25-12 50 0t50 0v36H14z" fill="#3d8190"/><path d="M21 72h57l21 39H78L65 82H21z" fill="#8d6039" stroke="#242927" stroke-width="5"/><path d="M85 28v63m0-54 25 18-25 9" fill="none" stroke="#242927" stroke-width="5"/>',
    Hangar: '<path d="M17 108V53q47-48 94 0v55z" fill="#687372" stroke="#242927" stroke-width="6"/><path d="M30 104V61q34-35 68 0v43z" fill="#263536" stroke="#242927" stroke-width="5"/><path d="m39 83 50-18-10 18 10 18z" fill="#d3b053" stroke="#242927" stroke-width="4"/>',
    Aircraft: '<path d="M17 81q17-12 34 0m24-42q17-12 34 0" fill="none" stroke="#eef8ef" stroke-width="9"/><path d="m21 64 87-27-25 31 24 13-8 9-34-7-20 24-10-4 8-27-25-5z" fill="#d8ddd5" stroke="#242927" stroke-width="5"/>',
    Harbor: '<path d="M14 77h100v35H14z" fill="#3d8190"/><path d="M24 104h80L90 84H36z" fill="#805533" stroke="#242927" stroke-width="5"/><path d="M65 26h24v58H65z" fill="#eee3ca" stroke="#242927" stroke-width="5"/><path d="m60 28 17-14 17 14z" fill="#bd503a" stroke="#242927" stroke-width="5"/><path d="M89 37q18 5 22 16" fill="none" stroke="#f2d268" stroke-width="5"/>',
    Detonator: '<path d="M15 99 36 72l14 8 14-45 12 31 15-14 23 47z" fill="#504b42" stroke="#242927" stroke-width="5"/><path d="m64 22 7 15 16-8-8 16 17 5-17 7 10 15-18-7-5 18-7-18-17 8 8-17-17-5 17-8-9-15 18 7z" fill="#f39a2e" stroke="#242927" stroke-width="4"/>',
    Sewer: '<path d="M14 16h100v96H14z" fill="#4d6258"/><circle cx="64" cy="69" r="38" fill="#253b36" stroke="#242927" stroke-width="6"/><circle cx="64" cy="69" r="24" fill="#7fa054" stroke="#242927" stroke-width="5"/><path d="M17 38h27m40 0h27M14 96h100" stroke="#899085" stroke-width="7"/>',
    Mine: '<path d="M14 112 26 45l38-26 38 26 12 67z" fill="#5b4b3b"/><path d="M37 112V63q27-35 54 0v49z" fill="#252a28" stroke="#242927" stroke-width="6"/><path d="M26 49 64 24l38 25M25 75h15m48 0h15" stroke="#b37a42" stroke-width="7"/><path d="M64 56v52" stroke="#f1bd4f" stroke-width="5"/>',
    Market: '<path d="M18 53h92v56H18z" fill="#ddd1af" stroke="#242927" stroke-width="5"/><path d="M13 50 25 25h78l12 25z" fill="#b94e3f" stroke="#242927" stroke-width="5"/><path d="M27 25 22 50m25-25-2 25m19-25v25m19-25 2 25m18-25 6 25" stroke="#f4dfaa" stroke-width="7"/><path d="M31 71h27v38H31zm40 0h25v20H71z" fill="#5f8178" stroke="#242927" stroke-width="4"/>',
    Bank: '<path d="m15 47 49-30 49 30zM22 50h84v60H22z" fill="#ddd4b9" stroke="#242927" stroke-width="6"/><path d="M34 55v47m20-47v47m20-47v47m20-47v47M17 108h94" stroke="#59615f" stroke-width="8"/><circle cx="64" cy="39" r="8" fill="#d2a43f"/>',
    Museum: '<path d="m14 43 50-27 50 27zM22 47h84v62H22z" fill="#dfd8c4" stroke="#242927" stroke-width="6"/><path d="M38 50v51m26-51v51m26-51v51M17 106h94" stroke="#7b7061" stroke-width="8"/><path d="M55 31h18" stroke="#d49435" stroke-width="5"/>',
    Factory: '<path d="M16 109V63l29-17v17l30-17v17l36-21v67z" fill="#6d7470" stroke="#242927" stroke-width="6"/><path d="M81 50V20h18v37M28 77h17v18H28zm30 0h17v18H58zm30 0h17v18H88z" fill="#d8a641" stroke="#242927" stroke-width="5"/><path d="M90 18q-9-10 2-15m10 20q15-12 4-21" fill="none" stroke="#9ca7a2" stroke-width="7"/>',
    Shelter: '<path d="M14 108q4-70 50-78 46 8 50 78z" fill="#6a7068" stroke="#242927" stroke-width="6"/><path d="M42 108V66h44v42z" fill="#303a37" stroke="#242927" stroke-width="6"/><path d="M50 76h28M64 68v39" stroke="#d3a646" stroke-width="5"/>',
    Warehouse: '<path d="m14 49 50-31 50 31v61H14z" fill="#8a724f" stroke="#242927" stroke-width="6"/><path d="M34 61h60v49H34z" fill="#4e5c59" stroke="#242927" stroke-width="5"/><path d="M38 72h52M38 86h52M38 100h52" stroke="#aeb2a4" stroke-width="5"/>',
    Auditorium: '<path d="M15 20h98v91H15z" fill="#5b3a45" stroke="#242927" stroke-width="6"/><path d="M26 25q17 26 0 52m76-52q-17 26 0 52" fill="#a83f43" stroke="#d79b44" stroke-width="5"/><path d="M38 85q26-20 52 0v20H38z" fill="#b88743" stroke="#242927" stroke-width="5"/><path d="M49 58h30" stroke="#efd06c" stroke-width="6"/>',
    Jail: '<path d="M18 18h92v92H18z" fill="#737d7a" stroke="#242927" stroke-width="6"/><path d="M29 20v88m18-88v88m18-88v88m18-88v88m18-88v88M19 60h90" stroke="#313a3a" stroke-width="7"/><circle cx="90" cy="76" r="6" fill="#d5a73d"/>',
    'Thief Base': '<path d="M15 110V57l49-39 49 39v53z" fill="#343c3b" stroke="#242927" stroke-width="6"/><path d="M38 110V67h52v43z" fill="#1b2322" stroke="#242927" stroke-width="5"/><path d="m47 82 17-11 17 11-17 12z" fill="#d4a23b"/><path d="M22 49 13 35m92 14 10-14" stroke="#8b4a3d" stroke-width="7"/>',
    Vehicle: '<path d="M16 109V42h96v67z" fill="#697673" stroke="#242927" stroke-width="6"/><path d="M25 51h78v58H25z" fill="#354443" stroke="#242927" stroke-width="5"/><path d="m32 84 10-19h43l14 19v13H32z" fill="#d47c2e" stroke="#242927" stroke-width="5"/><circle cx="48" cy="98" r="8" fill="#242927"/><circle cx="85" cy="98" r="8" fill="#242927"/>'
  };
  return `${sky}${scenes[key]}`;
}

function roleFromName(name) {
  const core = name.replace(/^[FM]\. /u, '').replace(/ (?:Pants|Shirt|Hat|Accessory)$/u, '');
  if (/Highway/u.test(core)) return 'Highway';
  if (/Fisher/u.test(core)) return 'Fisher';
  return core;
}

function roleBadge(role, x = 64, y = 76, scale = 1) {
  const a = `stroke="${OUTLINE}" stroke-width="${4 / scale}" fill="none"`;
  const badges = {
    Bum: `<path d="M${x - 10 * scale} ${y - 6 * scale}l${20 * scale} ${12 * scale}m-${20 * scale} 0 ${20 * scale}-${12 * scale}" ${a}/>`,
    Merchant: `<circle cx="${x}" cy="${y}" r="${10 * scale}" fill="${GOLD}" stroke="${OUTLINE}" stroke-width="${4 / scale}"/><path d="M${x} ${y - 6 * scale}v${12 * scale}" stroke="${OUTLINE}" stroke-width="${3 / scale}"/>`,
    'Bounty Hunter': `<circle cx="${x}" cy="${y}" r="${10 * scale}" ${a}/><path d="M${x - 14 * scale} ${y}h${28 * scale}M${x} ${y - 14 * scale}v${28 * scale}" ${a}/>` ,
    Highway: `<path d="m${x - 12 * scale} ${y + 7 * scale} ${12 * scale}-${18 * scale} ${12 * scale} ${18 * scale}-12 ${7 * scale}z" fill="${GOLD}" stroke="${OUTLINE}" stroke-width="${4 / scale}"/>`,
    Fisher: `<path d="M${x - 10 * scale} ${y - 10 * scale}q${20 * scale} ${8 * scale} 0 ${22 * scale}q-${13 * scale}-${3 * scale}-${7 * scale}-${13 * scale}" ${a}/>`,
    Banker: `<path d="M${x - 13 * scale} ${y + 9 * scale}h${26 * scale}M${x - 10 * scale} ${y + 6 * scale}v-${12 * scale}m${10 * scale} ${12 * scale}v-${12 * scale}m${10 * scale} ${12 * scale}v-${12 * scale}M${x - 14 * scale} ${y - 7 * scale}l${14 * scale}-${8 * scale} ${14 * scale} ${8 * scale}z" ${a}/>`,
    Worker: `<path d="M${x - 13 * scale} ${y + 10 * scale}  ${x + 10 * scale} ${y - 13 * scale}m-${17 * scale} 0 ${10 * scale} ${10 * scale}" ${a}/>`,
    Trader: `<path d="M${x} ${y - 13 * scale}v${25 * scale}m-${14 * scale}-${17 * scale}h${28 * scale}m-${24 * scale} 2-6 ${12 * scale}h${12 * scale}zm${20 * scale} 0-6 ${12 * scale}h${12 * scale}z" ${a}/>`,
    Guard: `<path d="M${x} ${y - 15 * scale}l${13 * scale} ${5 * scale}v${10 * scale}q0 ${12 * scale}-${13 * scale} ${17 * scale}q-${13 * scale}-${5 * scale}-${13 * scale}-${17 * scale}v-${10 * scale}z" fill="${GOLD}" stroke="${OUTLINE}" stroke-width="${4 / scale}"/>`,
    Pirate: `<path d="M${x - 13 * scale} ${y + 9 * scale}  ${x + 12 * scale} ${y - 12 * scale}M${x - 8 * scale} ${y - 12 * scale}l${20 * scale} ${21 * scale}" ${a}/>` ,
    Pilot: `<path d="M${x - 16 * scale} ${y}h${32 * scale}M${x} ${y - 16 * scale}v${32 * scale}" ${a}/><circle cx="${x}" cy="${y}" r="${5 * scale}" fill="${GOLD}" stroke="${OUTLINE}" stroke-width="${3 / scale}"/>`,
    Manufacturer: `<circle cx="${x}" cy="${y}" r="${12 * scale}" ${a}/><path d="M${x} ${y - 17 * scale}v${10 * scale}m0 ${14 * scale}v${10 * scale}m-${17 * scale}-${17 * scale}h${10 * scale}m14 0h${10 * scale}" ${a}/>`
  };
  return badges[role];
}

function modelArt(name, gender) {
  const role = roleFromName(name); const p = ROLE[role];
  const face = gender === 1
    ? '<path d="M47 45q0-23 17-23t17 23v13q0 20-17 20T47 58z" fill="#c98a60" stroke="#242927" stroke-width="6"/><path d="M47 47q-5-27 17-29 22 2 18 29-9-7-18-18-7 12-17 18z" fill="#4b352c" stroke="#242927" stroke-width="5"/>'
    : '<path d="M45 43q0-22 19-22t19 22v15q0 21-19 21T45 58z" fill="#c98a60" stroke="#242927" stroke-width="6"/><path d="M45 44q-3-24 19-26 22 2 19 26-10-9-19-11-9 2-19 11zM53 69q11 10 22 0" fill="#4b352c" stroke="#242927" stroke-width="5"/>';
  return `${face}<path d="M24 114q3-37 40-38 37 1 40 38z" fill="${p.main}" stroke="${OUTLINE}" stroke-width="7"/><path d="M43 84 64 103 85 84" fill="${p.light}" stroke="${OUTLINE}" stroke-width="5"/>${roleBadge(role, 64, 101, .65)}`;
}

function pantsArt(name, gender) {
  const role = roleFromName(name); const p = ROLE[role];
  const waist = gender === 1 ? 'M34 22h60l-6 28H40z' : 'M30 22h68l-3 28H33z';
  return `<path d="${waist}" fill="${p.light}" stroke="${OUTLINE}" stroke-width="6"/><path d="M39 47h49l13 67H70l-6-43-6 43H27z" fill="${p.main}" stroke="${OUTLINE}" stroke-width="7"/><path d="M64 52v18M34 66l22 5m38-5-22 5" stroke="${p.dark}" stroke-width="5"/>${roleBadge(role, 64, 39, .55)}`;
}

function shirtArt(name, gender) {
  const role = roleFromName(name); const p = ROLE[role];
  const torso = gender === 1 ? 'M43 25h42l27 21-16 27-11-8 5 50H38l5-50-11 8-16-27z' : 'M40 25h48l28 23-18 25-12-9 6 51H36l6-51-12 9-18-25z';
  return `<path d="${torso}" fill="${p.main}" stroke="${OUTLINE}" stroke-width="7"/><path d="M49 25q15 19 30 0M64 43v67" fill="none" stroke="${p.light}" stroke-width="5"/>${roleBadge(role, 64, 72, .8)}`;
}

function hatArt(name, gender) {
  const role = roleFromName(name); const p = ROLE[role];
  const hats = {
    Bum: '<path d="M28 72q7-45 45-40l20 25 20 15z"/><path d="M20 73h91"/>',
    Merchant: '<path d="M31 67 43 30h43l11 37z"/><path d="M17 68h94"/>',
    'Bounty Hunter': '<path d="M30 69 43 28h44l12 41z"/><path d="M15 70h98M39 51h53"/>',
    Highway: '<path d="M19 72q19-39 45-40 26 1 45 40-26-10-45-3-26-7-45 3z"/><path d="M39 47h50"/>',
    Fisher: '<path d="M27 69q8-43 37-44 29 1 37 44z"/><path d="M14 70h100"/>',
    Banker: '<path d="M38 68V25h52v43z"/><path d="M17 69h94M39 51h50"/>',
    Worker: '<path d="M23 70q4-43 41-45 37 2 41 45z"/><path d="M13 71h102M55 26v41h18V26"/>',
    Trader: '<path d="M26 69q9-41 38-40 29-1 38 40z"/><path d="M16 70h96M37 51h54"/>',
    Guard: '<path d="M30 74V42q34-35 68 0v32z"/><path d="M19 75h90M64 23v50"/>',
    Pirate: '<path d="M17 70q17-35 47-34 30-1 47 34-24-8-47 0-23-8-47 0z"/><path d="m64 18 9 17H55zM28 59h72"/>',
    Pilot: '<path d="M27 69q5-42 37-43 32 1 37 43z"/><path d="M16 70h96"/><circle cx="48" cy="54" r="13"/><circle cx="80" cy="54" r="13"/>',
    Manufacturer: '<path d="M27 70q5-43 37-44 32 1 37 44z"/><path d="M15 71h98M39 46h50"/><rect x="45" y="50" width="38" height="25" rx="4"/>'
  };
  const raw = hats[role].replaceAll('/>', ` fill="${p.main}" stroke="${OUTLINE}" stroke-width="7"/>`);
  const wearer = gender === 1
    ? '<path d="M35 96q29-25 58 0M41 88q-9 8-6 21m52-21q9 8 6 21" fill="none" stroke="#5d392f" stroke-width="9"/>'
    : '<path d="M38 93q26-19 52 0M49 99q15 13 30 0" fill="none" stroke="#43332d" stroke-width="10"/>';
  return `${raw}${wearer}`;
}

function accessoryArt(name, gender) {
  const role = roleFromName(name); const p = ROLE[role];
  const accessories = {
    Bum: '<path d="M31 32h56l14 75H17z"/><path d="M41 33q23-24 46 0M28 76l15-12 13 14 18-19 18 17"/>',
    Merchant: '<path d="M31 25h66v84H31z"/><path d="M43 43h42M43 59h42M43 75h28"/><circle cx="88" cy="90" r="16"/>',
    'Bounty Hunter': '<circle cx="64" cy="64" r="42"/><circle cx="64" cy="64" r="25"/><path d="M14 64h100M64 14v100"/>',
    Highway: '<path d="M23 92 89 26l16 16-66 66z"/><path d="m21 109 18-1-16-16zM82 33l16 16"/>',
    Fisher: '<path d="M23 25q72 0 82 73"/><path d="M38 24v68q0 18 15 18 17 0 17-19"/><path d="m91 81 18 17-23 3z"/>',
    Banker: '<circle cx="48" cy="72" r="25"/><circle cx="82" cy="60" r="25"/><path d="M82 47v26M48 59v26"/>',
    Worker: '<path d="M25 102 91 36"/><path d="m71 26 15 15 20-18 7 7-22 29-28-28zM18 109l18-4-13-13z"/>',
    Trader: '<path d="M64 21v76M31 39h66"/><path d="m31 39-17 39h34zm66 0L80 78h34z"/><path d="M39 108h50"/>',
    Guard: '<path d="M64 17 99 30v30q0 34-35 51Q29 94 29 60V30z"/><path d="M64 33v57M43 61h42"/>',
    Pirate: '<path d="M19 101 98 27"/><path d="M77 21 104 48M17 109l20-4-14-14z"/><path d="M77 99q21-13 31 4-18 15-31-4z"/>',
    Pilot: '<path d="M64 15v98M15 64h98"/><ellipse cx="64" cy="37" rx="10" ry="23"/><ellipse cx="64" cy="91" rx="10" ry="23"/><ellipse cx="37" cy="64" rx="23" ry="10"/><ellipse cx="91" cy="64" rx="23" ry="10"/><circle cx="64" cy="64" r="12"/>',
    Manufacturer: '<circle cx="64" cy="64" r="37"/><circle cx="64" cy="64" r="15"/><path d="M64 13v19m0 64v19M13 64h19m64 0h19M28 28l14 14m44 44 14 14m0-72L86 42M42 86l-14 14"/>'
  };
  const fitMarker = gender === 1
    ? `<path d="M19 20q10-9 20 0-10 17-20 0z" fill="${p.light}" stroke="${OUTLINE}" stroke-width="4"/>`
    : `<path d="M18 15h22v20H18zM23 20h12v10H23z" fill="${p.light}" stroke="${OUTLINE}" stroke-width="4"/>`;
  return `${accessories[role].replaceAll('/>', ` fill="${p.main}" stroke="${OUTLINE}" stroke-width="6"/>`)}${fitMarker}`;
}

function avatarArt(element, item, typeName) {
  if (typeName === 'Borders') return borderArt(item.name);
  if (typeName === 'Backgrounds') return backgroundArt(item.name);
  if (typeName === 'Models') return modelArt(item.name, element.gender);
  if (typeName === 'Pants') return pantsArt(item.name, element.gender);
  if (typeName === 'Shirts') return shirtArt(item.name, element.gender);
  if (typeName === 'Hats') return hatArt(item.name, element.gender);
  return accessoryArt(item.name, element.gender);
}

function resetDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true });
  for (const filename of fs.readdirSync(directory)) {
    if (filename.endsWith('.svg')) fs.rmSync(path.join(directory, filename));
  }
}

const catalog = loadLegacyCatalog();
resetDirectory(EQUIPMENT_OUTPUT);
resetDirectory(AVATAR_OUTPUT);

for (const itemId of EQUIPMENT_ICON_ITEM_IDS) {
  const item = catalog.byId.get(itemId);
  const equipment = catalog.equipmentByItemId.get(itemId);
  if (!item || !equipment) throw new Error(`Missing equipment catalog row for ${itemId}.`);
  const type = catalog.equipmentTypeById.get(equipment.typeId)?.name;
  const tutorial = item.name === 'Tutorial Drill';
  const art = equipmentArt(type, equipment.rarity, tutorial);
  const description = tutorial
    ? 'A compact training drill using the same clear silhouette as the main equipment range.'
    : `The ${item.name} shown clearly as a standalone mining equipment icon.`;
  fs.writeFileSync(path.join(EQUIPMENT_OUTPUT, `equipment-${itemId}.svg`),
    documentSvg(item.name, description, item.rarity, art, 'equipment'), 'utf8');
}

for (const itemId of AVATAR_ICON_ITEM_IDS) {
  const item = catalog.byId.get(itemId);
  const element = catalog.avatarElementByItemId.get(itemId);
  if (!item || !element) throw new Error(`Missing avatar catalog row for ${itemId}.`);
  const type = catalog.avatarElementTypeById.get(element.typeId)?.name;
  const art = avatarArt(element, item, type);
  const description = type === 'Borders'
    ? `A material-themed portrait frame representing the ${item.name} avatar thing.`
    : type === 'Backgrounds'
      ? `A miniature location scene representing the ${item.name} avatar thing.`
      : `A bold standalone ${type.toLowerCase()} icon representing ${item.name} and its profession.`;
  fs.writeFileSync(path.join(AVATAR_OUTPUT, `avatar-${itemId}.svg`),
    documentSvg(item.name, description, item.rarity, art, `avatar-${type.toLowerCase()}`), 'utf8');
}

console.log(`Generated ${EQUIPMENT_ICON_ITEM_IDS.length} equipment and ${AVATAR_ICON_ITEM_IDS.length} avatar SVG icons.`);
