import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GADGET_ICON_ITEM_IDS } from '../src/gadget-icons.js';
import { loadLegacyCatalog } from '../src/legacy-catalog.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'public', 'img', 'items', 'gadgets');
const OUTLINE = '#292d29';
const ORANGE = '#f28c28';
const RED = '#d94a36';
const GOLD = '#d8be32';

const PALETTES = Object.freeze({
  Tin: { main: '#aeb2aa', light: '#e4e8df', dark: '#68726c', signal: '#3d94c5' },
  Iron: { main: '#59635f', light: '#aeb8b2', dark: '#343735', signal: '#c36d37' },
  Aluminum: { main: '#d7e0dd', light: '#f4f7f2', dark: '#799c9c', signal: '#5aa66a' },
  Titanium: { main: '#9fc5cc', light: '#e3f0ef', dark: '#4184a8', signal: '#3d94c5' },
  Tungsten: { main: '#4b5050', light: '#899693', dark: '#242827', signal: '#a64891' },
  Legendary: { main: '#9b651e', light: '#fff1a6', dark: '#553816', signal: '#66e3ff' }
});

const CONCEPTS = Object.freeze({
  hammer: {
    Aluminum: 'a light cross-peen mechanic hammer with a gear inset',
    Titanium: 'a reinforced split-face engineering hammer with impact marks',
    Tungsten: 'a massive powered forge mallet with an energized gear core'
  },
  warehouse: {
    Aluminum: 'a compact corrugated storehouse with an open bay and crates',
    Titanium: 'an arched depot with a reinforced loading door and stacked freight',
    Tungsten: 'a fortified high-bay warehouse with a heavy shutter and pallets'
  },
  armory: {
    Aluminum: 'a locked double-door equipment cabinet with concealed tools',
    Titanium: 'an armored vault door shielding crossed weapon silhouettes',
    Tungsten: 'a sealed fortress locker with a shielded privacy eye'
  },
  autoloader: {
    Aluminum: 'an open ruled account book with a coin and balance ticks',
    Titanium: 'a clasped metal ledger beside balanced coin stacks',
    Tungsten: 'a chained account book embossed with scales and index tabs',
    Legendary: 'a radiant ammunition conveyor serving a ten-berth ship console'
  },
  autolister: {
    Aluminum: 'a pocket calculator with a tally display and large keypad',
    Titanium: 'a desktop adding machine with a crank and curling receipt tape',
    Tungsten: 'a hardened market terminal with an illuminated price tape',
    Legendary: 'a golden ten-line market terminal issuing luminous price tickets'
  },
  sharpener: {
    Tin: 'a hand whetstone honing a small blade and throwing sparks',
    Iron: 'a hand-cranked bench grindstone with a sturdy tool rest',
    Tungsten: 'a powered faceted honing wheel cutting a brilliant blade edge'
  },
  shield: {
    Tin: 'a simple round buckler with a riveted rim and center boss',
    Iron: 'a heavy kite shield with a raised spine and iron braces',
    Tungsten: 'a broad layered hex shield with reinforced energy chevrons'
  },
  turbo: {
    Tin: 'a compact snail turbo with a visible impeller and exhaust puff',
    Iron: 'a twin-scroll iron turbo with paired pipes and a large rotor',
    Tungsten: 'a dense twin-turbine booster with hot exhaust and speed streaks'
  },
  radar: {
    Tin: 'a small parabolic radar dish on a folding tripod',
    Iron: 'a rotating receiver dish with a boxy sweep display',
    Tungsten: 'a faceted phased-array scanner with sweep rings and route blips'
  },
  automaker: {
    Tin: 'a gridded clipboard sheet with a pencil and highlighted cell',
    Iron: 'a bound tabular folio with a ruler and marked totals',
    Tungsten: 'a rugged data board showing a rising trade graph and coin markers',
    Legendary: 'a radiant ten-job fabrication sequencer surrounding a factory core'
  },
  automelder: {
    Tin: 'a handheld detector coil scanning a small meld medallion',
    Iron: 'a twin-coil detector with an analog meter and ping arcs',
    Tungsten: 'a rugged scanner with a glowing meld glyph, detector stem, and search coil',
    Legendary: 'a golden ten-recipe carousel orbiting an active Meld core'
  },
  binoculars: {
    Aluminum: 'compact straight binocular barrels with a focus wheel and strap',
    Titanium: 'angular prism binoculars with a precise range reticle',
    Tungsten: 'a gimballed triple-lens rangefinder with a hooded sight'
  },
  control: {
    Aluminum: 'a four-button handheld remote with an antenna and radio pulse',
    Titanium: 'a rugged dual-stick transmitter with four channel lamps',
    Tungsten: 'a command console linking four illuminated mine nodes'
  }
});

function hammer(material, p) {
  if (material === 'Aluminum') return `
  <path d="M25 112 17 103 76 44l12 12z" fill="${p.main}" stroke="${OUTLINE}" stroke-width="7" stroke-linejoin="round"/>
  <path d="M46 31 68 11l24 23h25v27H92L76 76 35 36z" fill="${p.dark}" stroke="${OUTLINE}" stroke-width="7" stroke-linejoin="round"/>
  <path d="M92 40h17v14H92M50 30l18-12 14 14-15 15z" fill="${p.light}" stroke="${OUTLINE}" stroke-width="4" stroke-linejoin="round"/>
  <circle cx="70" cy="42" r="9" fill="${GOLD}" stroke="${OUTLINE}" stroke-width="4"/>
  <path d="m70 35 3 5 6 2-5 4-1 6-5-4-6 2 2-6-4-5 6 1z" fill="${ORANGE}"/>
  <path d="m25 96 12 12" fill="none" stroke="${p.dark}" stroke-width="4"/>`;
  if (material === 'Titanium') return `
  <path d="M19 105 27 116 80 66 68 54z" fill="${p.main}" stroke="${OUTLINE}" stroke-width="7" stroke-linejoin="round"/>
  <path d="M43 29 69 12l43 43-18 25-22-11-15 9-31-31z" fill="${p.dark}" stroke="${OUTLINE}" stroke-width="7" stroke-linejoin="round"/>
  <path d="m46 29 17-10 14 14-15 15zM92 48l14 7-12 17-13-12z" fill="${p.light}" stroke="${OUTLINE}" stroke-width="4" stroke-linejoin="round"/>
  <path d="m21 88-10-8m23 2-4-14m18 3 3-13" fill="none" stroke="${ORANGE}" stroke-width="5" stroke-linecap="round"/>
  <circle cx="67" cy="47" r="4" fill="${GOLD}"/>`;
  return `
  <path d="m17 109 12 10 46-52-13-13z" fill="${p.light}" stroke="${OUTLINE}" stroke-width="7" stroke-linejoin="round"/>
  <path d="M24 32 55 10l62 48-25 35-31-15-19 11L9 58z" fill="${p.dark}" stroke="${OUTLINE}" stroke-width="7" stroke-linejoin="round"/>
  <path d="m27 34 27-16 20 16-20 25-30-9zM93 45l18 14-19 26-19-10z" fill="${p.main}" stroke="${OUTLINE}" stroke-width="4" stroke-linejoin="round"/>
  <circle cx="65" cy="50" r="15" fill="${GOLD}" stroke="${OUTLINE}" stroke-width="5"/>
  <path d="m65 38 4 8 9 1-7 6 2 9-8-5-8 5 2-9-7-6 9-1z" fill="${p.signal}"/>
  <path d="m18 82-10-6m24-2-2-13m16 5 4-12" fill="none" stroke="${ORANGE}" stroke-width="5" stroke-linecap="round"/>`;
}

function warehouse(material, p) {
  if (material === 'Aluminum') return `
  <path d="M13 48 64 17l51 31v66H13z" fill="${p.main}" stroke="${OUTLINE}" stroke-width="7" stroke-linejoin="round"/>
  <path d="M21 51h86M29 45v69m17-69v69m17-69v69m18-69v69m18-69v69" fill="none" stroke="${p.dark}" stroke-width="3" opacity=".8"/>
  <path d="M45 69h38v45H45z" fill="${p.dark}" stroke="${OUTLINE}" stroke-width="6"/>
  <path d="M52 91h24v23H52z" fill="#a66d3e" stroke="${OUTLINE}" stroke-width="4"/>
  <path d="M21 92h24v22H21zm62 5h23v17H83z" fill="${GOLD}" stroke="${OUTLINE}" stroke-width="4"/>
  <path d="M18 45 64 18l46 27" fill="none" stroke="${p.light}" stroke-width="5" stroke-linecap="round"/>`;
  if (material === 'Titanium') return `
  <path d="M13 55Q18 17 64 14q46 3 51 41v60H13z" fill="${p.main}" stroke="${OUTLINE}" stroke-width="7"/>
  <path d="M25 53Q29 29 64 27q35 2 39 26" fill="none" stroke="${p.light}" stroke-width="6"/>
  <path d="M34 58h60v57H34z" fill="${p.dark}" stroke="${OUTLINE}" stroke-width="6"/>
  <path d="M42 66h44v15H42zm0 17h44v15H42zm0 17h44v15H42z" fill="${p.light}" stroke="${OUTLINE}" stroke-width="3"/>
  <path d="M16 65h18m60 0h18M55 14v-7h18v8" fill="none" stroke="${OUTLINE}" stroke-width="6"/>
  <path d="M18 95h16v20H18zm76-9h17v29H94z" fill="#a66d3e" stroke="${OUTLINE}" stroke-width="4"/>`;
  return `
  <path d="M9 45 27 18h74l18 27v72H9z" fill="${p.dark}" stroke="${OUTLINE}" stroke-width="7" stroke-linejoin="round"/>
  <path d="M17 110V47l14-21h66l14 21v63z" fill="none" stroke="${p.light}" stroke-width="3" stroke-linejoin="round"/>
  <path d="M22 48 35 29h58l13 19" fill="none" stroke="${GOLD}" stroke-width="6" stroke-linejoin="round"/>
  <path d="M27 54h74v63H27z" fill="${p.main}" stroke="${OUTLINE}" stroke-width="6"/>
  <path d="M36 63h56v13H36zm0 16h56v13H36zm0 16h56v13H36z" fill="${p.light}" stroke="${OUTLINE}" stroke-width="3"/>
  <path d="M14 58h13m74 0h13M19 73h8m74 0h8M18 104h9m74 0h10" fill="none" stroke="${p.signal}" stroke-width="4"/>
  <path d="M42 83h18v25H42zm25-14h19v39H67z" fill="#a66d3e" stroke="${OUTLINE}" stroke-width="4"/>`;
}

function armory(material, p) {
  if (material === 'Aluminum') return `
  <rect x="19" y="12" width="90" height="105" rx="6" fill="${p.main}" stroke="${OUTLINE}" stroke-width="7"/>
  <path d="M64 15v99M28 27h27m18 0h27M28 101h27m18 0h27" fill="none" stroke="${p.dark}" stroke-width="4"/>
  <path d="m39 43 13 29m-17 0 19-29m35 0L75 72m18 0L74 43" fill="none" stroke="${OUTLINE}" stroke-width="6" stroke-linecap="round"/>
  <circle cx="55" cy="83" r="4" fill="${GOLD}" stroke="${OUTLINE}" stroke-width="3"/>
  <circle cx="73" cy="83" r="4" fill="${GOLD}" stroke="${OUTLINE}" stroke-width="3"/>
  <path d="M48 13h32" stroke="${p.light}" stroke-width="4"/>`;
  if (material === 'Titanium') return `
  <path d="M18 20 64 9l46 11v96H18z" fill="${p.dark}" stroke="${OUTLINE}" stroke-width="7" stroke-linejoin="round"/>
  <circle cx="64" cy="67" r="39" fill="${p.main}" stroke="${OUTLINE}" stroke-width="6"/>
  <circle cx="64" cy="67" r="26" fill="${p.dark}" stroke="${OUTLINE}" stroke-width="5"/>
  <path d="M64 41v52M38 67h52m-44-22 15 16m21-15L67 61m-6 12L45 89m22-16 16 16" fill="none" stroke="${p.light}" stroke-width="5" stroke-linecap="round"/>
  <circle cx="64" cy="67" r="8" fill="${GOLD}" stroke="${OUTLINE}" stroke-width="4"/>
  <path d="m29 25 9 7m61-7-9 7M27 105l10-6m64 6-10-6" stroke="${p.signal}" stroke-width="4"/>`;
  return `
  <path d="M11 29 30 10h68l19 19v88H11z" fill="${p.dark}" stroke="${OUTLINE}" stroke-width="7" stroke-linejoin="round"/>
  <path d="M19 109V33l14-15h62l14 15v76z" fill="none" stroke="${p.light}" stroke-width="3" stroke-linejoin="round"/>
  <path d="M25 38 64 21l39 17-8 62-31 18-31-18z" fill="${p.main}" stroke="${OUTLINE}" stroke-width="6" stroke-linejoin="round"/>
  <path d="M43 68c5-14 14-21 21-21s16 7 21 21c-6 14-14 21-21 21S49 82 43 68z" fill="${p.dark}" stroke="${OUTLINE}" stroke-width="5"/>
  <path d="M42 45 86 92M86 45 42 92" fill="none" stroke="${GOLD}" stroke-width="7" stroke-linecap="round"/>
  <path d="M50 58 78 80M78 58 50 80" fill="none" stroke="${p.signal}" stroke-width="5" stroke-linecap="round"/>
  <circle cx="64" cy="69" r="8" fill="${ORANGE}" stroke="${OUTLINE}" stroke-width="4"/>`;
}

function ledger(material, p) {
  if (material === 'Aluminum') return `
  <path d="M12 27q27-10 52 5v83q-25-15-52-5zm104 0q-27-10-52 5v83q25-15 52-5z" fill="${p.light}" stroke="${OUTLINE}" stroke-width="7" stroke-linejoin="round"/>
  <path d="M64 33v81M22 48h31M22 62h31M22 76h31m22-28h31M75 62h31M75 76h31" fill="none" stroke="${p.dark}" stroke-width="4"/>
  <circle cx="91" cy="93" r="14" fill="${GOLD}" stroke="${OUTLINE}" stroke-width="5"/>
  <path d="m86 93 4 4 7-9" fill="none" stroke="${p.signal}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`;
  if (material === 'Titanium') return `
  <path d="M20 13h80l12 13v89H20z" fill="${p.main}" stroke="${OUTLINE}" stroke-width="7" stroke-linejoin="round"/>
  <path d="M33 28h54v73H33z" fill="${p.light}" stroke="${OUTLINE}" stroke-width="5"/>
  <path d="M60 31v67M39 47h42M39 63h42M39 79h42" fill="none" stroke="${p.dark}" stroke-width="4"/>
  <path d="M96 39h18v34H96z" fill="${GOLD}" stroke="${OUTLINE}" stroke-width="4"/>
  <path d="M12 86h24v24H12zm82 0h24v24H94z" fill="${GOLD}" stroke="${OUTLINE}" stroke-width="5"/>
  <path d="M18 78h12m70 0h12M12 114h106" fill="none" stroke="${p.signal}" stroke-width="4"/>`;
  return `
  <path d="M17 16h83l13 15v86H17z" fill="${p.dark}" stroke="${OUTLINE}" stroke-width="7" stroke-linejoin="round"/>
  <path d="M24 109V23h72l10 11v75z" fill="none" stroke="${p.light}" stroke-width="3" stroke-linejoin="round"/>
  <path d="M30 28h58v76H30z" fill="${p.main}" stroke="${OUTLINE}" stroke-width="5"/>
  <path d="M41 43h36M41 57h36M41 71h36M41 85h36" fill="none" stroke="${GOLD}" stroke-width="4"/>
  <path d="M98 44h18M98 62h18M98 80h18" stroke="${p.signal}" stroke-width="7"/>
  <path d="M9 36c17 4 22 12 23 28s-5 31-18 43" fill="none" stroke="${OUTLINE}" stroke-width="8"/>
  <path d="M13 37c13 5 17 13 17 27s-4 29-14 39" fill="none" stroke="${ORANGE}" stroke-width="3"/>
  <path d="m47 96 12 15 13-15" fill="${GOLD}" stroke="${OUTLINE}" stroke-width="4" stroke-linejoin="round"/>`;
}

function calculator(material, p) {
  if (material === 'Aluminum') return `
  <rect x="23" y="10" width="82" height="108" rx="9" fill="${p.main}" stroke="${OUTLINE}" stroke-width="7"/>
  <rect x="35" y="23" width="58" height="25" rx="3" fill="#263936" stroke="${OUTLINE}" stroke-width="5"/>
  <path d="M45 36h10m8 0h20" stroke="${p.signal}" stroke-width="5" stroke-linecap="round"/>
  <g fill="${p.light}" stroke="${OUTLINE}" stroke-width="4"><rect x="34" y="59" width="16" height="14"/><rect x="56" y="59" width="16" height="14"/><rect x="78" y="59" width="16" height="14"/><rect x="34" y="79" width="16" height="14"/><rect x="56" y="79" width="16" height="14"/><rect x="78" y="79" width="16" height="34"/><rect x="34" y="99" width="38" height="14"/></g>
  <circle cx="86" cy="66" r="3" fill="${ORANGE}"/>`;
  return `
  <path d="M18 39 30 15h60l14 24v75H18z" fill="${p.main}" stroke="${OUTLINE}" stroke-width="7" stroke-linejoin="round"/>
  <path d="M39 15V6h44v10" fill="${p.light}" stroke="${OUTLINE}" stroke-width="5"/>
  <path d="M46 7h30l13 21H34z" fill="#f5e8c9" stroke="${OUTLINE}" stroke-width="4" stroke-linejoin="round"/>
  <path d="M43 14h26M48 21h28" stroke="${p.dark}" stroke-width="3"/>
  <rect x="32" y="45" width="57" height="20" rx="3" fill="#263936" stroke="${OUTLINE}" stroke-width="5"/>
  <path d="M42 55h35" stroke="${p.signal}" stroke-width="5"/>
  <g fill="${p.light}" stroke="${OUTLINE}" stroke-width="4"><circle cx="40" cy="78" r="7"/><circle cx="61" cy="78" r="7"/><circle cx="82" cy="78" r="7"/><circle cx="40" cy="100" r="7"/><circle cx="61" cy="100" r="7"/><circle cx="82" cy="100" r="7"/></g>
  <path d="M104 55h12v45h-12m7-34 9-8" fill="none" stroke="${OUTLINE}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function sharpener(material, p) {
  if (material === 'Tin') return `
  <path d="M17 91 76 26l31 28-59 65z" fill="${p.main}" stroke="${OUTLINE}" stroke-width="7" stroke-linejoin="round"/>
  <path d="M28 91 80 35l16 15-52 57z" fill="${p.light}" stroke="${p.dark}" stroke-width="4"/>
  <path d="m19 70 28 25 65-70" fill="none" stroke="${OUTLINE}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="m94 31 13-13m-3 23 16-4m-21 14 12 8" stroke="${ORANGE}" stroke-width="5" stroke-linecap="round"/>`;
  if (material === 'Iron') return `
  <path d="M18 96h93v21H18z" fill="${p.dark}" stroke="${OUTLINE}" stroke-width="7"/>
  <path d="M31 96V49h15m51 47V49H82" fill="none" stroke="${OUTLINE}" stroke-width="7" stroke-linejoin="round"/>
  <circle cx="64" cy="54" r="34" fill="${p.main}" stroke="${OUTLINE}" stroke-width="7"/>
  <circle cx="64" cy="54" r="11" fill="${GOLD}" stroke="${OUTLINE}" stroke-width="5"/>
  <path d="m24 79 51-6 32 15" fill="none" stroke="#b87943" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="m88 31 12-10m-4 21 17-2m-20 13 14 8" stroke="${ORANGE}" stroke-width="5" stroke-linecap="round"/>`;
  return `
  <path d="M13 102h102v17H13z" fill="${p.dark}" stroke="${OUTLINE}" stroke-width="7"/>
  <path d="M29 102V63l13-22h44l13 22v39" fill="${p.main}" stroke="${OUTLINE}" stroke-width="7" stroke-linejoin="round"/>
  <path d="m64 17 34 22-8 49-26 14-26-14-8-49z" fill="${p.dark}" stroke="${OUTLINE}" stroke-width="6"/>
  <path d="m64 28 23 15-6 37-17 9-17-9-6-37z" fill="${p.light}" stroke="${GOLD}" stroke-width="5"/>
  <circle cx="64" cy="58" r="12" fill="${p.signal}" stroke="${OUTLINE}" stroke-width="4"/>
  <path d="m12 74 42 8 58-30" fill="none" stroke="#dce6e2" stroke-width="7" stroke-linecap="round"/>
  <path d="m96 29 13-12m-7 24 18-3m-18 14 13 8" stroke="${ORANGE}" stroke-width="5" stroke-linecap="round"/>`;
}

function shield(material, p) {
  if (material === 'Tin') return `
  <circle cx="64" cy="64" r="51" fill="${p.main}" stroke="${OUTLINE}" stroke-width="7"/>
  <circle cx="64" cy="64" r="38" fill="${p.light}" stroke="${p.dark}" stroke-width="5"/>
  <circle cx="64" cy="64" r="15" fill="${GOLD}" stroke="${OUTLINE}" stroke-width="5"/>
  <g fill="${ORANGE}" stroke="${OUTLINE}" stroke-width="2"><circle cx="64" cy="20" r="4"/><circle cx="108" cy="64" r="4"/><circle cx="64" cy="108" r="4"/><circle cx="20" cy="64" r="4"/></g>
  <path d="M36 36 48 48m44-12L80 48M36 92l12-12m44 12L80 80" stroke="${p.dark}" stroke-width="5" stroke-linecap="round"/>`;
  if (material === 'Iron') return `
  <path d="M64 9 111 27l-8 58c-5 18-18 29-39 36-21-7-34-18-39-36l-8-58z" fill="${p.main}" stroke="${OUTLINE}" stroke-width="7" stroke-linejoin="round"/>
  <path d="M64 17v96M24 32l40 24 40-24M31 84l33-28 33 28" fill="none" stroke="${p.dark}" stroke-width="6" stroke-linejoin="round"/>
  <path d="m64 40 17 24-17 22-17-22z" fill="${GOLD}" stroke="${OUTLINE}" stroke-width="5"/>
  <path d="M29 31 64 18l35 13" fill="none" stroke="${p.light}" stroke-width="5"/>
  <circle cx="64" cy="64" r="5" fill="${ORANGE}"/>`;
  return `
  <path d="M64 8 111 27l8 55-18 25-37 14-37-14L9 82l8-55z" fill="${p.dark}" stroke="${OUTLINE}" stroke-width="7" stroke-linejoin="round"/>
  <path d="m64 20 35 14 7 41-14 20-28 12-28-12-14-20 7-41z" fill="${p.main}" stroke="${GOLD}" stroke-width="5"/>
  <path d="m64 31 24 10 5 29-9 14-20 9-20-9-9-14 5-29z" fill="${p.dark}" stroke="${OUTLINE}" stroke-width="4"/>
  <path d="m43 49 21 16 21-16M43 72l21 16 21-16" fill="none" stroke="${p.signal}" stroke-width="6" stroke-linejoin="round"/>
  <path d="M14 47h14m72 0h14M13 83h14m74 0h14" stroke="${ORANGE}" stroke-width="4"/>`;
}

function turbo(material, p) {
  if (material === 'Tin') return `
  <path d="M28 96C9 79 12 44 36 29c25-16 61-4 68 24 6 24-12 48-37 48H45" fill="${p.main}" stroke="${OUTLINE}" stroke-width="7" stroke-linecap="round"/>
  <circle cx="61" cy="61" r="25" fill="${p.dark}" stroke="${OUTLINE}" stroke-width="6"/>
  <path d="M61 61 59 39q19 4 22 19zm0 0 20-3q-2 19-17 23zm0 0 3 20q-19-2-23-17zm0 0-20 3q2-19 18-25z" fill="${p.light}" stroke="${OUTLINE}" stroke-width="3"/>
  <circle cx="61" cy="61" r="6" fill="${GOLD}"/>
  <path d="M88 91h28v20H84" fill="${p.dark}" stroke="${OUTLINE}" stroke-width="7" stroke-linejoin="round"/>
  <path d="m17 99-8 3m14 7-8 8" stroke="${p.signal}" stroke-width="5" stroke-linecap="round"/>`;
  if (material === 'Iron') return `
  <path d="M24 102C7 82 10 49 31 30c23-21 61-14 75 12l12 8-9 21-12-3c-3 23-21 39-44 39H38l-11 10H11z" fill="${p.main}" stroke="${OUTLINE}" stroke-width="7" stroke-linejoin="round"/>
  <circle cx="58" cy="65" r="32" fill="${p.dark}" stroke="${OUTLINE}" stroke-width="6"/>
  <path d="M58 65c-18-9-23-24-8-27 13-3 26 10 27 24M58 65c18 7 23 22 10 28-14 6-28-6-29-22" fill="none" stroke="${p.light}" stroke-width="9" stroke-linecap="round"/>
  <circle cx="58" cy="65" r="8" fill="${ORANGE}" stroke="${OUTLINE}" stroke-width="3"/>
  <path d="M91 48h27v24H98" fill="none" stroke="${OUTLINE}" stroke-width="7" stroke-linejoin="round"/>
  <path d="m108 82 12 3m-15 7 14 9m-20-2 8 13" fill="none" stroke="${p.signal}" stroke-width="5" stroke-linecap="round"/>
  <path d="M29 30q20-16 42-9" fill="none" stroke="${GOLD}" stroke-width="4" stroke-linecap="round"/>`;
  return `
  <path d="M17 43 38 17h48l18 18h16v31h-13v35l-20 17H35L11 95V52z" fill="${p.dark}" stroke="${OUTLINE}" stroke-width="7" stroke-linejoin="round"/>
  <circle cx="51" cy="64" r="29" fill="${p.main}" stroke="${GOLD}" stroke-width="5"/>
  <circle cx="82" cy="83" r="20" fill="${p.main}" stroke="${GOLD}" stroke-width="5"/>
  <path d="m51 64 3-18 13 10-7 15-16 8-8-14 12-10zm31 19 2-12 9 6-5 11-11 5-6-9 8-7z" fill="${p.signal}" stroke="${OUTLINE}" stroke-width="3"/>
  <circle cx="51" cy="64" r="6" fill="${ORANGE}"/><circle cx="82" cy="83" r="5" fill="${ORANGE}"/>
  <path d="M104 43h16v23h-13" fill="none" stroke="${p.light}" stroke-width="5" stroke-linejoin="round"/>
  <path d="M11 29h34M7 18h54M10 112h17" stroke="${ORANGE}" stroke-width="5" stroke-linecap="round"/>`;
}

function radar(material, p) {
  if (material === 'Tin') return `
  <path d="M18 27q48 1 70 43-39 21-70-43z" fill="${p.main}" stroke="${OUTLINE}" stroke-width="7" stroke-linejoin="round"/>
  <path d="m22 31 42 39" stroke="${p.light}" stroke-width="5" stroke-linecap="round"/>
  <circle cx="64" cy="70" r="8" fill="${ORANGE}" stroke="${OUTLINE}" stroke-width="4"/>
  <path d="M64 78v24M43 117l21-15 21 15M37 56q24-23 49 0M29 43q35-35 72 0" fill="none" stroke="${OUTLINE}" stroke-width="6" stroke-linecap="round"/>
  <path d="M85 53q10 8 13 18" fill="none" stroke="${p.signal}" stroke-width="5" stroke-linecap="round"/>`;
  if (material === 'Iron') return `
  <path d="M17 23q52-2 77 40-34 30-77-40z" fill="${p.main}" stroke="${OUTLINE}" stroke-width="7" stroke-linejoin="round"/>
  <path d="m22 27 46 38" stroke="${p.light}" stroke-width="5"/>
  <circle cx="69" cy="65" r="8" fill="${GOLD}" stroke="${OUTLINE}" stroke-width="4"/>
  <path d="M69 73v15" stroke="${OUTLINE}" stroke-width="7"/>
  <rect x="42" y="84" width="70" height="34" rx="5" fill="${p.dark}" stroke="${OUTLINE}" stroke-width="6"/>
  <path d="M53 108V94h48" fill="none" stroke="${p.signal}" stroke-width="4"/>
  <path d="m55 103 17-7 14 8 13-12" fill="none" stroke="${ORANGE}" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M84 36q15 10 20 26M82 21q26 15 34 41" fill="none" stroke="${OUTLINE}" stroke-width="5" stroke-linecap="round"/>`;
  return `
  <path d="m13 33 50-22 49 24-15 46-34 18-35-18z" fill="${p.dark}" stroke="${OUTLINE}" stroke-width="7" stroke-linejoin="round"/>
  <path d="m26 36 37-16 36 18-11 35-25 13-26-13z" fill="${p.main}" stroke="${GOLD}" stroke-width="5"/>
  <path d="M63 20v66M27 37l61 36M99 38 37 73" fill="none" stroke="${p.light}" stroke-width="4"/>
  <path d="M63 91v14M33 118l30-13 31 13" fill="none" stroke="${OUTLINE}" stroke-width="7" stroke-linejoin="round"/>
  <path d="M84 20q22 11 29 32M92 10q25 12 34 38" fill="none" stroke="${p.signal}" stroke-width="5" stroke-linecap="round"/>
  <g fill="${ORANGE}"><circle cx="44" cy="47" r="5"/><circle cx="73" cy="60" r="4"/><circle cx="83" cy="38" r="3"/></g>`;
}

function spreadsheet(material, p) {
  if (material === 'Tin') return `
  <path d="M24 17h72l11 13v88H24z" fill="${p.light}" stroke="${OUTLINE}" stroke-width="7" stroke-linejoin="round"/>
  <path d="M44 11h33v15H44z" fill="${p.main}" stroke="${OUTLINE}" stroke-width="5"/>
  <path d="M37 42h57M37 58h57M37 74h57M37 90h57M54 38v59m20-59v59" stroke="${p.dark}" stroke-width="3"/>
  <rect x="56" y="60" width="16" height="12" fill="${GOLD}" stroke="${ORANGE}" stroke-width="3"/>
  <path d="m16 106 74-74 11 11-74 74-14 3z" fill="#b87842" stroke="${OUTLINE}" stroke-width="5" stroke-linejoin="round"/>`;
  if (material === 'Iron') return `
  <path d="M15 21h87l11 11v84H15z" fill="${p.main}" stroke="${OUTLINE}" stroke-width="7"/>
  <path d="M29 35h68v67H29z" fill="${p.light}" stroke="${OUTLINE}" stroke-width="5"/>
  <path d="M29 51h68M29 68h68M29 85h68M50 35v67m25-67v67" stroke="${p.dark}" stroke-width="4"/>
  <rect x="52" y="70" width="21" height="13" fill="${ORANGE}"/>
  <path d="M106 45h13v56h-13" fill="${GOLD}" stroke="${OUTLINE}" stroke-width="5"/>
  <path d="M9 29h19M9 46h19M9 63h19M9 80h19M9 97h19" stroke="${OUTLINE}" stroke-width="5"/>
  <circle cx="102" cy="24" r="8" fill="${GOLD}" stroke="${OUTLINE}" stroke-width="4"/>`;
  return `
  <path d="m18 25 78-12 15 91-78 12z" fill="${p.dark}" stroke="${OUTLINE}" stroke-width="7" stroke-linejoin="round"/>
  <path d="m29 35 58-9 10 67-58 9z" fill="${p.main}" stroke="${GOLD}" stroke-width="4"/>
  <path d="m41 83 12-20 13 8 15-29 11 7" fill="none" stroke="${ORANGE}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="m36 49 54-8M39 65l48-7M43 94l49-8M54 31l10 67M74 28l10 67" stroke="${p.light}" stroke-width="3" opacity=".8"/>
  <circle cx="20" cy="23" r="11" fill="${GOLD}" stroke="${OUTLINE}" stroke-width="5"/>
  <circle cx="109" cy="105" r="11" fill="${GOLD}" stroke="${OUTLINE}" stroke-width="5"/>
  <path d="m16 23 4 4 6-9m79 87 4 4 6-9" fill="none" stroke="${p.signal}" stroke-width="3"/>`;
}

function medalDetector(material, p) {
  if (material === 'Tin') return `
  <path d="m29 102 51-70 12 9-49 68" fill="${p.main}" stroke="${OUTLINE}" stroke-width="7" stroke-linecap="round"/>
  <path d="M75 34 89 15l16 12-14 19" fill="${p.dark}" stroke="${OUTLINE}" stroke-width="5"/>
  <ellipse cx="30" cy="102" rx="23" ry="13" fill="none" stroke="${OUTLINE}" stroke-width="7"/>
  <path d="M48 89q20-13 40-1" fill="none" stroke="${p.signal}" stroke-width="5" stroke-linecap="round"/>
  <path d="m92 91 6 9 11 2-8 8 2 11-11-5-10 5 2-11-8-8 11-2z" fill="${GOLD}" stroke="${OUTLINE}" stroke-width="4"/>`;
  if (material === 'Iron') return `
  <path d="m27 104 45-63 13 10-43 61" fill="${p.main}" stroke="${OUTLINE}" stroke-width="7" stroke-linecap="round"/>
  <ellipse cx="27" cy="104" rx="20" ry="11" fill="none" stroke="${OUTLINE}" stroke-width="7"/>
  <ellipse cx="47" cy="91" rx="15" ry="8" fill="none" stroke="${p.light}" stroke-width="5"/>
  <rect x="68" y="20" width="43" height="42" rx="5" fill="${p.dark}" stroke="${OUTLINE}" stroke-width="6"/>
  <path d="M79 49V34h21M81 44l8-7 8 6" fill="none" stroke="${ORANGE}" stroke-width="4" stroke-linecap="round"/>
  <path d="M92 72q16 4 22 15M91 82q8 3 12 9" fill="none" stroke="${p.signal}" stroke-width="5" stroke-linecap="round"/>
  <circle cx="106" cy="106" r="11" fill="${GOLD}" stroke="${OUTLINE}" stroke-width="4"/>`;
  return `
  <path d="M39 24 55 10h35l18 16-7 54-28 13-31-14z" fill="${p.dark}" stroke="${OUTLINE}" stroke-width="7" stroke-linejoin="round"/>
  <path d="M51 31 62 21h20l13 11-5 39-18 9-19-9z" fill="${p.main}" stroke="${GOLD}" stroke-width="5"/>
  <path d="M73 21v58M51 32l39 39M95 32 53 71" fill="none" stroke="${p.light}" stroke-width="4"/>
  <path d="m73 39 6 9 11 2-8 7 2 11-11-5-10 5 2-11-8-7 11-2z" fill="${p.signal}" stroke="${OUTLINE}" stroke-width="4"/>
  <path d="M54 78 30 105" fill="none" stroke="${p.light}" stroke-width="10" stroke-linecap="round"/>
  <path d="M54 78 30 105" fill="none" stroke="${OUTLINE}" stroke-width="4" stroke-linecap="round"/>
  <ellipse cx="24" cy="108" rx="18" ry="10" fill="none" stroke="${OUTLINE}" stroke-width="7"/>
  <path d="M17 48q-9 13-2 27m99-28q8 13 0 27M9 40q-14 21-2 43m115-43q13 21 1 43" fill="none" stroke="${ORANGE}" stroke-width="5" stroke-linecap="round"/>`;
}

function binoculars(material, p) {
  if (material === 'Aluminum') return `
  <path d="M20 44 43 28l12 13v56l-12 13-29-13zM108 44 85 28 73 41v56l12 13 29-13z" fill="${p.main}" stroke="${OUTLINE}" stroke-width="7" stroke-linejoin="round"/>
  <path d="M53 48h22v41H53z" fill="${p.dark}" stroke="${OUTLINE}" stroke-width="6"/>
  <ellipse cx="28" cy="76" rx="18" ry="25" fill="${p.light}" stroke="${OUTLINE}" stroke-width="6"/>
  <ellipse cx="100" cy="76" rx="18" ry="25" fill="${p.light}" stroke="${OUTLINE}" stroke-width="6"/>
  <circle cx="64" cy="42" r="10" fill="${GOLD}" stroke="${OUTLINE}" stroke-width="4"/>
  <path d="M21 107q43 25 86 0" fill="none" stroke="#a66d3e" stroke-width="5" stroke-linecap="round"/>`;
  if (material === 'Titanium') return `
  <path d="M12 55 30 24h25l9 26 9-26h25l18 31-9 55H78L64 89l-14 21H21z" fill="${p.dark}" stroke="${OUTLINE}" stroke-width="7" stroke-linejoin="round"/>
  <path d="m24 60 12-23h14l7 20-9 35H28zm80 0L92 37H78l-7 20 9 35h20z" fill="${p.main}" stroke="${OUTLINE}" stroke-width="5"/>
  <ellipse cx="39" cy="72" rx="14" ry="19" fill="${p.light}" stroke="${OUTLINE}" stroke-width="4"/>
  <ellipse cx="89" cy="72" rx="14" ry="19" fill="${p.light}" stroke="${OUTLINE}" stroke-width="4"/>
  <circle cx="64" cy="62" r="9" fill="${GOLD}" stroke="${OUTLINE}" stroke-width="4"/>
  <path d="M82 72h14m-7-7v14" stroke="${p.signal}" stroke-width="3"/>`;
  return `
  <path d="M12 49 28 18h26l10 24 10-24h26l16 31-7 59H79L64 89l-15 19H19z" fill="${p.dark}" stroke="${OUTLINE}" stroke-width="7" stroke-linejoin="round"/>
  <path d="m25 52 10-21h13l8 19-8 40H30zm78 0-10-21H80l-8 19 8 40h18z" fill="${p.main}" stroke="${GOLD}" stroke-width="5"/>
  <circle cx="39" cy="67" r="17" fill="${p.light}" stroke="${OUTLINE}" stroke-width="5"/>
  <circle cx="89" cy="67" r="17" fill="${p.light}" stroke="${OUTLINE}" stroke-width="5"/>
  <circle cx="64" cy="58" r="13" fill="${p.signal}" stroke="${OUTLINE}" stroke-width="5"/>
  <path d="M31 67h16m-8-8v16m42-8h16m-8-8v16M58 58h12" stroke="${ORANGE}" stroke-width="3"/>
  <path d="m19 108 20 11m70-11-20 11" stroke="${p.light}" stroke-width="5" stroke-linecap="round"/>`;
}

function control(material, p) {
  if (material === 'Aluminum') return `
  <path d="M37 28h54l13 18-9 69H33l-9-69z" fill="${p.main}" stroke="${OUTLINE}" stroke-width="7" stroke-linejoin="round"/>
  <path d="M64 28V10m0 0 14 9" fill="none" stroke="${OUTLINE}" stroke-width="7" stroke-linecap="round"/>
  <circle cx="49" cy="59" r="10" fill="${p.dark}" stroke="${OUTLINE}" stroke-width="4"/>
  <g fill="${GOLD}" stroke="${OUTLINE}" stroke-width="3"><circle cx="77" cy="52" r="6"/><circle cx="87" cy="65" r="6"/><circle cx="67" cy="65" r="6"/><circle cx="77" cy="78" r="6"/></g>
  <path d="M45 94h38" stroke="${p.signal}" stroke-width="6" stroke-linecap="round"/>
  <path d="M82 18q15 5 20 18" fill="none" stroke="${ORANGE}" stroke-width="5" stroke-linecap="round"/>`;
  if (material === 'Titanium') return `
  <path d="M13 50 30 27h68l17 23-8 62H21z" fill="${p.dark}" stroke="${OUTLINE}" stroke-width="7" stroke-linejoin="round"/>
  <path d="M40 29V10m48 19V10M40 10l-8 8m56-8 8 8" fill="none" stroke="${OUTLINE}" stroke-width="6" stroke-linecap="round"/>
  <circle cx="43" cy="72" r="14" fill="${p.main}" stroke="${OUTLINE}" stroke-width="5"/>
  <circle cx="85" cy="72" r="14" fill="${p.main}" stroke="${OUTLINE}" stroke-width="5"/>
  <path d="M43 72V55m42 17V55" stroke="${GOLD}" stroke-width="5" stroke-linecap="round"/>
  <g fill="${p.signal}" stroke="${OUTLINE}" stroke-width="2"><circle cx="45" cy="98" r="5"/><circle cx="58" cy="98" r="5"/><circle cx="71" cy="98" r="5"/><circle cx="84" cy="98" r="5"/></g>
  <path d="M100 19q13 6 17 17" fill="none" stroke="${ORANGE}" stroke-width="4" stroke-linecap="round"/>`;
  return `
  <path d="M9 41 29 15h70l20 26-9 73H18z" fill="${p.dark}" stroke="${OUTLINE}" stroke-width="7" stroke-linejoin="round"/>
  <path d="m16 108 8-63 9-22h62l16 22-7 63z" fill="none" stroke="${p.light}" stroke-width="3" stroke-linejoin="round"/>
  <path d="M28 49h72v48H28z" fill="${p.main}" stroke="${GOLD}" stroke-width="5"/>
  <path d="M64 49V26m0 0 16-11" fill="none" stroke="${OUTLINE}" stroke-width="7" stroke-linecap="round"/>
  <circle cx="64" cy="72" r="10" fill="${ORANGE}" stroke="${OUTLINE}" stroke-width="4"/>
  <path d="M64 72 40 60m24 12 24-12M64 72 40 86m24-14 24 14" stroke="${p.light}" stroke-width="4"/>
  <g fill="${p.signal}" stroke="${OUTLINE}" stroke-width="3"><circle cx="39" cy="59" r="7"/><circle cx="89" cy="59" r="7"/><circle cx="39" cy="87" r="7"/><circle cx="89" cy="87" r="7"/></g>
  <path d="M83 19q20 7 27 25m-19-34q25 8 34 29" fill="none" stroke="${ORANGE}" stroke-width="5" stroke-linecap="round"/>`;
}

function automationArt(render, variant) {
  return (material, palette) => {
    const base = render(material === 'Legendary' ? 'Tungsten' : material, palette);
    if (material !== 'Legendary') return base;
    const y = 111 - variant;
    const indicators = Array.from({ length: 10 }, (_, index) =>
      `<circle cx="${19 + index * 10}" cy="${y}" r="3" fill="${index === variant ? ORANGE : palette.signal}"/>`
    ).join('');
    return `${base}
  <path d="M12 ${y - 7}h104v14H12z" fill="${palette.dark}" stroke="${OUTLINE}" stroke-width="3"/>${indicators}`;
  };
}

const ART = Object.freeze({
  hammer,
  warehouse,
  armory,
  autoloader: automationArt(ledger, 0),
  autolister: automationArt(calculator, 1),
  sharpener,
  shield,
  turbo,
  radar,
  automaker: automationArt(spreadsheet, 2),
  automelder: automationArt(medalDetector, 3),
  binoculars,
  control
});

function escapeXml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}

const catalog = loadLegacyCatalog();
const linksByItemId = new Map(catalog.gadgetItems.map((entry) => [entry.itemId, entry]));
const actualIds = [...linksByItemId.keys()].sort((first, second) => first - second);
if (JSON.stringify(actualIds) !== JSON.stringify(GADGET_ICON_ITEM_IDS)) {
  throw new Error(`Gadget allowlist drift: ${actualIds.join(', ')}`);
}

fs.mkdirSync(OUTPUT, { recursive: true });
const expectedFiles = new Set(GADGET_ICON_ITEM_IDS.map((itemId) => `gadget-${itemId}.svg`));
for (const filename of fs.readdirSync(OUTPUT)) {
  if (!expectedFiles.has(filename)) throw new Error(`Unexpected gadget asset: ${filename}`);
}

for (const itemId of GADGET_ICON_ITEM_IDS) {
  const item = catalog.byId.get(itemId);
  const link = linksByItemId.get(itemId);
  const gadget = catalog.gadgetById.get(link.gadgetId);
  const material = item.name.split(' ')[0];
  const palette = PALETTES[material];
  const render = ART[gadget.behaviorKey];
  const concept = CONCEPTS[gadget.behaviorKey]?.[material];
  if (!item || !gadget || !palette || !render || !concept) {
    throw new Error(`Missing gadget art definition for item ${itemId}.`);
  }
  const description = `${item.name}, depicted as ${concept}.`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(item.name)}</title>
  <desc id="desc">${escapeXml(description)}</desc>${render(material, palette)}
</svg>
`;
  fs.writeFileSync(path.join(OUTPUT, `gadget-${itemId}.svg`), svg, 'utf8');
}

console.log(`Generated ${GADGET_ICON_ITEM_IDS.length} gadget SVG assets in ${OUTPUT}`);
