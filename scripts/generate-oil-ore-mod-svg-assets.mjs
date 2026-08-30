import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLegacyCatalog } from '../src/legacy-catalog.js';
import { MOD_ICON_ITEM_IDS } from '../src/mod-icons.js';
import { OIL_ICON_ITEM_IDS } from '../src/oil-icons.js';
import { ORE_ICON_ITEM_IDS } from '../src/ore-icons.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ITEM_ROOT = path.join(ROOT, 'public', 'img', 'items');
const OUTLINE = '#292d29';

const MATERIALS = Object.freeze({
  1: { name: 'tin', main: '#9aa7a3', light: '#d9e2dc', dark: '#56635f', accent: '#d8be32' },
  2: { name: 'aluminum', main: '#aabcc5', light: '#e5eef0', dark: '#5d727c', accent: '#698b18' },
  3: { name: 'iron', main: '#707b76', light: '#b9c2ba', dark: '#39443f', accent: '#799c9c' },
  4: { name: 'titanium', main: '#71899c', light: '#c8d7dd', dark: '#3c5365', accent: '#e32121' },
  5: { name: 'tungsten', main: '#505862', light: '#aab2b5', dark: '#282f37', accent: '#a64891' },
  6: { name: 'carbon', main: '#2d3437', light: '#737f81', dark: '#151a1c', accent: '#f79721' }
});

const MATERIAL_PREFIX = /^(?:Tin|Aluminum|Iron|Titanium|Tungsten|Carbon) /u;

const COMPONENT_DESCRIPTIONS = Object.freeze({
  'Gun Turret': 'a compact rotating turret with an armored mantlet and projecting cannon barrel',
  'Missile Turret': 'a traversing twin missile pod with two pointed rockets and a reinforced turntable',
  '90mm Gun': 'a heavy long-barrelled cannon with a large breech, recoil block, and muzzle brake',
  'Chain Gun': 'a rotary chain gun with clustered barrels, a drive drum, and an ammunition feed',
  'Door Panels': 'a shaped armored vehicle door with a recessed handle and structural reinforcement',
  'Roll Bar': 'a rigid protective roll cage with twin hoops, braces, and bolted mounting feet',
  'Grill Guard': 'a heavy front guard with upright bars, cross rails, and wraparound bumper wings',
  'Forged Wheels': 'a forged road wheel with a thick tire, deep hub, and six strong spokes',
  'Quick Shift': 'a short gear lever moving through a precise gated shift plate',
  'Brake Coolers': 'a ventilated brake disc with caliper, cooling vanes, and rushing air marks',
  'Flame Exhaust': 'a swept exhaust pipe firing a hot stylized flame from its polished tip',
  'Bushings': 'a matched pair of thick vibration-control bushings with bright inner sleeves',
  'Gun Rack': 'a braced weapons rack securing two long guns with clamps and a lower tray',
  'Ammunition Rack': 'a reinforced ammunition rack holding four large pointed cannon shells',
  'Range Finder': 'a precision optical range finder with twin lenses and a central sight reticle',
  'Window Guards': 'a framed windshield guard with a strong protective crosshatch lattice',
  'Rear Plates': 'overlapping rear armor plates with broad ribs and heavy corner fasteners',
  'Roof Plate': 'a faceted roof armor panel with a raised center ridge and six fixing bolts',
  'Power Inverter': 'a finned power inverter with terminals and a vivid high-voltage bolt',
  'Drive Shaft': 'a balanced drive shaft with universal joints and reinforced end flanges',
  'Coil Lift': 'a tall suspension coil spring seated between two substantial mounting cups',
  'Sensor Module': 'a compact scanning sensor with a luminous lens, aerial, and signal arcs',
  'Spoiler': 'an aerodynamic rear wing carried above two sturdy adjustable supports',
  'HUD': 'a transparent head-up display projecting a targeting reticle and horizon line',
  'Tactical Display': 'a rugged tactical screen showing a route grid, target, and control keys',
  'Skid Plate': 'a broad underbody skid plate with a raised spine, vents, and countersunk bolts',
  'Sensor Array': 'a multi-element sensor mast with dish, aerials, scanner eyes, and signal waves',
  'Sway Bars': 'a bent anti-roll bar with paired drop links, pivots, and mounting bushings',
  'High Load Tires': 'a wide reinforced tire with deep block tread, sturdy rim, and load bolts'
});

function escapeXml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

function modArt(component, palette) {
  const { main: m, light: l, dark: d } = palette;
  const a = palette.accent;
  switch (component) {
    case 'Gun Turret':
      return `<path d="M25 83h75l-8 23H33z" fill="${d}"/><ellipse cx="63" cy="84" rx="34" ry="13" fill="${m}"/><path d="M38 76 46 44h40l12 32z" fill="${m}"/><path d="M53 47V32h25v15" fill="${l}"/><path d="M76 36h43v13H76z" fill="${d}"/><path d="m116 36 9 7-9 6z" fill="${a}"/><circle cx="63" cy="65" r="7" fill="${a}"/>`;
    case 'Missile Turret':
      return `<path d="M29 88h70l-9 19H38z" fill="${d}"/><ellipse cx="64" cy="86" rx="31" ry="12" fill="${m}"/><path d="M31 39h66v44H31z" fill="${m}"/><path d="M38 45h22v31H38zm30 0h22v31H68z" fill="${d}"/><path d="m43 64 6-23 6 23v13H43zm30 0 6-23 6 23v13H73z" fill="${a}"/><path d="M28 36h72" stroke="${l}"/>`;
    case '90mm Gun':
      return `<path d="M18 80h79l-8 24H29z" fill="${d}"/><ellipse cx="58" cy="80" rx="35" ry="13" fill="${m}"/><path d="M35 69 45 45h34l13 24z" fill="${m}"/><path d="M67 42h52v15H67z" fill="${d}"/><path d="M113 36h11v27h-11z" fill="${a}"/><path d="M43 45h33l-6-17H50z" fill="${l}"/><circle cx="58" cy="78" r="7" fill="${a}"/>`;
    case 'Chain Gun':
      return `<path d="M17 89h82l-8 19H28z" fill="${d}"/><path d="M31 63h55v32H31z" fill="${m}"/><circle cx="43" cy="79" r="15" fill="${d}"/><circle cx="43" cy="79" r="7" fill="${a}"/><path d="M81 66h42M81 75h42M81 84h42M81 93h42" stroke="${d}"/><path d="M117 62v36" stroke="${a}"/><path d="M54 65 68 42h18v23" fill="${l}"/>`;
    case 'Door Panels':
      return `<path d="M29 20h60l14 22-7 70H25l-5-70z" fill="${m}"/><path d="M32 31h47l12 16-5 51H35l-4-51z" fill="${l}"/><path d="M35 67h52" stroke="${d}"/><rect x="67" y="52" width="17" height="8" rx="4" fill="${a}"/><path d="M27 43h7m55 0h9" stroke="${a}"/><circle cx="39" cy="88" r="4" fill="${d}"/><circle cx="82" cy="88" r="4" fill="${d}"/>`;
    case 'Roll Bar':
      return `<path d="M25 108V59q0-37 30-37h18q30 0 30 37v49" fill="none" stroke="${m}" stroke-width="14"/><path d="M40 108V63q0-22 20-22h8q20 0 20 22v45M24 76h80M34 105l20-29m40 29L74 76" fill="none" stroke="${d}"/><path d="M16 108h29m38 0h29" stroke="${a}"/>`;
    case 'Grill Guard':
      return `<path d="M15 39v62m98-62v62M15 93h98M21 48h86" fill="none" stroke="${d}" stroke-width="12"/><path d="M31 46v47m17-47v47m16-47v47m17-47v47m17-47v47" stroke="${m}"/><path d="M8 100h112" stroke="${a}"/><path d="M16 78 7 67m105 11 9-11" stroke="${l}"/>`;
    case 'Forged Wheels':
      return `<circle cx="64" cy="64" r="51" fill="${d}"/><circle cx="64" cy="64" r="36" fill="${m}"/><circle cx="64" cy="64" r="13" fill="${d}"/><path d="M64 28v23M64 77v23M28 64h23m26 0h23M39 39l16 16m18 18 16 16m0-50L73 55M55 73 39 89" stroke="${l}"/><circle cx="64" cy="64" r="5" fill="${a}"/><path d="M31 23 23 31m82-8 8 8M23 97l8 8m74 0 8-8" stroke="${a}"/>`;
    case 'Quick Shift':
      return `<path d="M23 53h82v57H23z" fill="${m}"/><path d="M35 64h58M43 64v32m21-32v32m21-32v32M35 96h58" fill="none" stroke="${d}"/><path d="M64 83 82 43" stroke="${l}" stroke-width="10"/><circle cx="85" cy="35" r="15" fill="${a}"/><circle cx="85" cy="35" r="7" fill="${l}"/>`;
    case 'Brake Coolers':
      return `<circle cx="59" cy="66" r="48" fill="${m}"/><circle cx="59" cy="66" r="34" fill="${d}"/><circle cx="59" cy="66" r="13" fill="${l}"/><g fill="${l}"><path d="M54 25h10l4 22H50z"/><path d="m88 38 7 7-13 19-12-12z"/><path d="m98 72-3 10-23-2 4-16z"/><path d="m79 99-9 5-14-19 14-8z"/><path d="m40 103-9-6 9-21 14 9z"/><path d="m17 76-1-10 23-7 2 16z"/><path d="m24 45 6-8 20 12-9 14z"/></g><path d="M83 35h26v64H83q-14-32 0-64z" fill="${a}"/><path d="M94 48v38" stroke="${d}"/>`;
    case 'Flame Exhaust':
      return `<path d="M15 32h34v18H33v42h41v22H19Q8 114 8 101V39q0-7 7-7z" fill="${m}"/><path d="M74 88h24v30H74z" fill="${d}"/><path d="M96 104q25-7 26-31-13 9-18-8-14 15-8 39z" fill="${a}"/><path d="M103 100q12-7 12-18-8 5-11-5-7 10-1 23z" fill="#f3c64f"/><path d="M27 36v53q0 10 10 10h42" fill="none" stroke="${l}"/>`;
    case 'Bushings':
      return `<g transform="rotate(-16 43 64)"><rect x="15" y="35" width="57" height="58" rx="20" fill="${d}"/><circle cx="43" cy="64" r="21" fill="${m}"/><circle cx="43" cy="64" r="9" fill="${a}"/></g><g transform="rotate(16 87 64)"><rect x="58" y="35" width="57" height="58" rx="20" fill="${d}"/><circle cx="87" cy="64" r="21" fill="${m}"/><circle cx="87" cy="64" r="9" fill="${a}"/></g><path d="M37 22h54M37 106h54" stroke="${l}"/>`;
    case 'Gun Rack':
      return `<path d="M20 20h18v90H20zm70 0h18v90H90zM19 86h90v22H19z" fill="${m}"/><path d="m42 93 41-69 11 7-39 65m-21-3 22-72 13 4-22 73" fill="${d}"/><path d="M15 49h28m41 0h29M15 73h28m41 0h29" stroke="${a}"/><path d="M27 27v76m70-76v76" stroke="${l}"/>`;
    case 'Ammunition Rack':
      return `<path d="M13 82h102v28H13zM20 37h88v17H20z" fill="${m}"/><g fill="${a}"><path d="m25 81 4-40 10-19 10 19 4 40z"/><path d="m51 81 4-40 10-19 10 19 4 40z"/><path d="m77 81 4-40 10-19 10 19 4 40z"/></g><path d="M32 49h14m12 0h14m12 0h14M20 92h88" stroke="${d}"/><path d="M38 29 33 43h11zM64 29l-5 14h11zM90 29l-5 14h11z" fill="${l}"/>`;
    case 'Range Finder':
      return `<path d="M18 47h92v39H18z" fill="${m}"/><circle cx="41" cy="66" r="27" fill="${d}"/><circle cx="41" cy="66" r="17" fill="${l}"/><circle cx="41" cy="66" r="7" fill="${a}"/><circle cx="89" cy="66" r="20" fill="${d}"/><circle cx="89" cy="66" r="11" fill="${l}"/><path d="M64 29v74M27 66h74" stroke="${a}"/><path d="M60 51h11v30H60z" fill="${d}"/>`;
    case 'Window Guards':
      return `<path d="m19 25 90 8-10 72-80-7z" fill="${m}"/><path d="m31 37 65 6-7 49-58-5z" fill="${l}"/><path d="M34 37 88 91M58 39l33 32M31 61l34 29M96 44 43 89M72 41 29 76" stroke="${d}"/><circle cx="25" cy="31" r="5" fill="${a}"/><circle cx="103" cy="38" r="5" fill="${a}"/><circle cx="94" cy="99" r="5" fill="${a}"/><circle cx="25" cy="92" r="5" fill="${a}"/>`;
    case 'Rear Plates':
      return `<path d="m19 33 76-15 14 32-76 15z" fill="${m}"/><path d="m15 61 85-13 10 34-85 13z" fill="${d}"/><path d="m25 89 79-9 6 29-79 8z" fill="${m}"/><path d="M35 46 91 35M32 77l61-9m-54 29 58-6" stroke="${l}"/><g fill="${a}"><circle cx="28" cy="39" r="4"/><circle cx="96" cy="29" r="4"/><circle cx="25" cy="69" r="4"/><circle cx="101" cy="57" r="4"/><circle cx="34" cy="103" r="4"/><circle cx="103" cy="94" r="4"/></g>`;
    case 'Roof Plate':
      return `<path d="m15 49 49-31 49 31-10 58H25z" fill="${m}"/><path d="M64 20v86M16 50l48 12 48-12" stroke="${l}"/><path d="m31 57 25 7-20 28zm66 0-25 7 20 28z" fill="${d}"/><g fill="${a}"><circle cx="27" cy="48" r="5"/><circle cx="101" cy="48" r="5"/><circle cx="35" cy="98" r="5"/><circle cx="93" cy="98" r="5"/><circle cx="64" cy="30" r="5"/></g>`;
    case 'Power Inverter':
      return `<path d="M22 27h84v78H22z" fill="${m}"/><path d="M31 18v18m13-18v18m13-18v18m14-18v18m13-18v18m13-18v18M31 96v18m13-18v18m13-18v18m14-18v18m13-18v18m13-18v18" stroke="${d}"/><path d="m69 34-23 37h18l-7 27 27-41H66z" fill="${a}"/><circle cx="35" cy="46" r="7" fill="${l}"/><circle cx="94" cy="87" r="7" fill="${l}"/><path d="M31 85h17m32-39h17" stroke="${d}"/>`;
    case 'Drive Shaft':
      return `<g transform="rotate(-24 64 64)"><path d="M18 53h92v22H18z" fill="${m}"/><path d="M33 46v36m62-36v36" stroke="${d}"/><path d="M9 42h22v44H9zm88 0h22v44H97z" fill="${d}"/><path d="M13 48 27 80m-14 0 14-32m74 0 14 32m-14 0 14-32" stroke="${a}"/><path d="M39 58h50" stroke="${l}"/></g>`;
    case 'Coil Lift':
      return `<path d="M29 19h70v15H29zm0 77h70v15H29z" fill="${d}"/><path d="M39 34h50L39 49l50 15-50 15 50 17" fill="none" stroke="${m}" stroke-width="13"/><path d="M39 34h50L39 49l50 15-50 15 50 17" fill="none" stroke="${l}" stroke-width="4"/><path d="M64 20v90" stroke="${a}"/>`;
    case 'Sensor Module':
      return `<path d="M23 60h82v46H23z" fill="${m}"/><path d="M34 49q30-30 60 0v29H34z" fill="${d}"/><circle cx="64" cy="61" r="17" fill="${l}"/><circle cx="64" cy="61" r="8" fill="${a}"/><path d="M64 43V16M48 31 37 17m43 14 11-14" stroke="${a}"/><path d="M34 89h60M42 99h44" stroke="${d}"/>`;
    case 'Spoiler':
      return `<path d="m12 47 104-15-5 25L17 72z" fill="${m}"/><path d="m23 48 81-11-4 9-76 12z" fill="${l}"/><path d="M35 68v35m58-44v44" stroke="${d}" stroke-width="12"/><path d="M22 104h30m25 0h31" stroke="${a}"/><path d="m17 72 94-15" stroke="${d}"/>`;
    case 'HUD':
      return `<path d="m21 27 86 8-8 67-78-7z" fill="${m}" fill-opacity=".55"/><path d="m31 38 64 6-6 46-58-5z" fill="${d}" fill-opacity=".7"/><circle cx="63" cy="64" r="18" fill="none" stroke="${a}"/><path d="M63 39v50M36 64h54m-43-9 10 9-10 9" fill="none" stroke="${l}"/><path d="M21 95h78m-55 0-8 18m48-18 8 18" stroke="${d}"/><circle cx="63" cy="64" r="4" fill="${a}"/>`;
    case 'Tactical Display':
      return `<path d="M15 21h98v85H15z" fill="${m}"/><path d="M25 31h78v58H25z" fill="${d}"/><path d="M33 43h62M33 58h62M33 73h62M45 36v48m18-48v48m18-48v48" stroke="${l}" stroke-opacity=".45"/><path d="m32 78 19-21 17 8 21-23" fill="none" stroke="${a}"/><circle cx="89" cy="42" r="7" fill="none" stroke="${a}"/><circle cx="64" cy="98" r="5" fill="${a}"/><path d="M39 114h50" stroke="${d}"/>`;
    case 'Skid Plate':
      return `<path d="m15 35 49-17 49 17-9 75H24z" fill="${m}"/><path d="M64 23v82M19 39l45 15 45-15" stroke="${l}"/><path d="M38 65h52l-7 27H45z" fill="${d}"/><path d="M49 72h30M47 82h34" stroke="${a}"/><g fill="${a}"><circle cx="28" cy="43" r="5"/><circle cx="100" cy="43" r="5"/><circle cx="31" cy="100" r="5"/><circle cx="97" cy="100" r="5"/></g>`;
    case 'Sensor Array':
      return `<path d="M52 51h24v61H52z" fill="${m}"/><path d="M29 103h70v13H29z" fill="${d}"/><path d="M64 51V18M53 36 40 20m35 16 13-16" stroke="${a}"/><path d="M22 58q42-38 84 0-42 24-84 0z" fill="${m}"/><path d="M31 56q33-25 66 0-33 11-66 0z" fill="${l}"/><circle cx="64" cy="57" r="8" fill="${a}"/><path d="M23 31q-13 25 0 50m82-50q13 25 0 50" fill="none" stroke="${a}"/>`;
    case 'Sway Bars':
      return `<path d="M18 25v32q0 15 15 15h62q15 0 15-15V25" fill="none" stroke="${m}" stroke-width="14"/><path d="M25 30v25q0 8 8 8h62q8 0 8-8V30" fill="none" stroke="${l}"/><path d="M18 67v38m92-38v38" stroke="${d}" stroke-width="12"/><path d="M9 105h28m54 0h28" stroke="${a}"/><circle cx="18" cy="76" r="8" fill="${a}"/><circle cx="110" cy="76" r="8" fill="${a}"/>`;
    case 'High Load Tires':
      return `<circle cx="64" cy="64" r="53" fill="${d}"/><path d="M31 18 44 35m-22 0 17 14M15 56l22 9M15 78l22-7m-11 27 18-18m-3 32 10-24m46-70L84 35m22 0L89 49m24 7-22 9m22 13-22-7m11 27L84 80m3 32L77 88" stroke="${a}"/><circle cx="64" cy="64" r="32" fill="${m}"/><circle cx="64" cy="64" r="15" fill="${l}"/><circle cx="64" cy="64" r="6" fill="${a}"/><path d="M64 34v15m0 30v15M34 64h15m30 0h15" stroke="${d}"/>`;
    default:
      throw new Error(`Missing Mod artwork for ${component}`);
  }
}

function resourceSvg(title, description, art) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(title)}</title>
  <desc id="desc">${escapeXml(description)}</desc>
  <g stroke="${OUTLINE}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">${art}</g>
</svg>
`;
}

function oilArt() {
  return `<path d="M18 31v65q0 13 32 13t32-13V31z" fill="#ad6824"/><ellipse cx="50" cy="31" rx="32" ry="13" fill="#e2a33d"/><ellipse cx="50" cy="31" rx="21" ry="7" fill="#242927"/><path d="M18 51h64M18 88h64" stroke="#713e20"/><path d="M31 48v42" stroke="#e9bd63"/><path d="M91 97q0-18 17-40 17 22 17 40 0 15-17 15T91 97z" fill="#252a28"/><path d="M102 96q0-9 7-19" fill="none" stroke="#657169"/><path d="m91 37 10 10-10 10-10-10z" fill="#f2c452"/>`;
}

function oreArt() {
  return `<path d="m22 58 13-38 22 25 14-35 19 37 15-17 6 40z" fill="#657b78"/><path d="m35 20 8 37 14-12 8 25 6-60 10 52 9-15 7 23" fill="none" stroke="#b8cfca"/><path d="M14 58h100v57H14z" fill="#9b6534"/><path d="m14 59 50 25 50-25M64 84v31" fill="none" stroke="#e0a24f"/><path d="m14 115 50-31 50 31M25 70v35m78-35v35" fill="none" stroke="#634322"/><g fill="#e69b32" stroke-width="4"><path d="m27 51 12-18 12 21z"/><path d="m74 54 10-23 15 25z"/></g>`;
}

const catalog = loadLegacyCatalog();
const write = (directory, filename, svg) => {
  const output = path.join(ITEM_ROOT, directory);
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, filename), svg);
};

for (const itemId of OIL_ICON_ITEM_IDS) {
  const item = catalog.byId.get(itemId);
  write('oil', `item-${itemId}.svg`, resourceSvg(item.name,
    'A heavy industrial barrel of glossy black Oil with bright hoops, a hazard plate, and a separate liquid droplet.', oilArt()));
}

for (const itemId of ORE_ICON_ITEM_IDS) {
  const item = catalog.byId.get(itemId);
  write('ore', `item-${itemId}.svg`, resourceSvg(item.name,
    'A braced timber Ore Crate packed with angular mineral crystals, metallic seams, and two bright exposed ore points.', oreArt()));
}

for (const itemId of MOD_ICON_ITEM_IDS) {
  const item = catalog.byId.get(itemId);
  const component = item.name.replace(MATERIAL_PREFIX, '');
  const palette = MATERIALS[item.rarity];
  if (!palette) throw new Error(`Missing material palette for ${item.name}`);
  const detail = COMPONENT_DESCRIPTIONS[component];
  if (!detail) throw new Error(`Missing description for ${item.name}`);
  write('mods', `item-${itemId}.svg`, resourceSvg(item.name,
    `A ${palette.name} vehicle modification depicting ${detail}.`, modArt(component, palette)));
}

console.log(`Generated ${OIL_ICON_ITEM_IDS.length} Oil, ${ORE_ICON_ITEM_IDS.length} Ore, and ${MOD_ICON_ITEM_IDS.length} Mod SVG icons.`);
