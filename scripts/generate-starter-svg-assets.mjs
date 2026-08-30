import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLegacyCatalog } from '../src/legacy-catalog.js';
import { STARTER_ICON_ITEM_IDS } from '../src/starter-icons.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'public', 'img', 'items', 'starter');
const O = '#292d29';
const ORANGE = '#f28c28';
const GOLD = '#d8be32';
const BLUE = '#3d7f92';
const CREAM = '#f0dfbd';
const RED = '#c84a3b';
const GREEN = '#557d52';
const PURPLE = '#714b87';
const METAL = '#b8c2bd';
const BROWN = '#95613e';

const descriptions = new Map([
  [1, 'A low canvas sneaker with a rubber toe, layered sole, eyelets, and tied laces.'],
  [2, 'A heavy threaded steel bolt with a broad hexagonal head and bright metal highlights.'],
  [3, 'A pair of reinforced rocket boots firing hot orange exhaust from their heels.'],
  [4, 'A high-top basketball shoe beside a panelled orange ball.'],
  [6, 'A curved skate halfpipe with coping rails and a tiny board climbing one wall.'],
  [7, 'A glowing, fractured meteor fragment trailing sparks through the air.'],
  [8, 'Three banded Cuban cigars resting in an open cedar presentation box.'],
  [9, 'A crenellated stone watch tower with an arched door and narrow lookout windows.'],
  [12, 'A terracotta clay target disc sailing past two speed marks.'],
  [13, 'A wide flat-screen television on a sturdy central stand.'],
  [14, 'An ornate crystal chandelier with candles, hanging drops, and a faceted centre.'],
  [15, 'A yellow tracked backhoe with a glazed cab and raised digging arm.'],
  [16, 'A blue electric toothbrush with a round brush head and charging base.'],
  [17, 'An open laptop showing a warm sunrise across its bright screen.'],
  [18, 'A framed oil painting of green hills beneath a glowing sky.'],
  [19, 'A thick wool shirt with a button placket and knitted chevron pattern.'],
  [20, 'A simple bright red short-sleeved shirt.'],
  [21, 'A pair of practical cuffed shorts with pockets and a tied waistband.'],
  [22, 'A pleated purple skirt with a broad fitted waistband.'],
  [23, 'A striped one-piece swimsuit with crossed shoulder straps.'],
  [24, 'A striped orange tiger prowling in profile with tail raised.'],
  [25, 'A green pet snake coiled upright with a curious forked tongue.'],
  [26, 'A friendly brown dog sitting alertly with a blue collar.'],
  [27, 'A blue snowboard with bindings, edge highlights, and a mountain emblem.'],
  [28, 'A compact brown leather clutch with a gold clasp and stitched flap.'],
  [29, 'A neatly made single bed with a blue blanket, cream pillow, and wooden frame.'],
  [30, 'A countertop microwave with a dark window, handle, dial, and control buttons.'],
  [31, 'A padded ski jacket with a tall collar, zip, snowflake badge, and pockets.'],
  [32, 'An open orange umbrella with a hooked wooden handle.'],
  [33, 'A front-loading washing machine with a blue glass drum and wash controls.'],
  [34, 'A tumble dryer with a warm drum, vent grille, and rising heat marks.'],
  [35, 'A tall two-door refrigerator with handles, shelves, and a small freezer badge.'],
  [36, 'A pocket music player with a blue screen, click wheel, and wired earbuds.'],
  [37, 'A slim movie player with an open disc tray, display, and round media disc.'],
  [38, 'A surround-sound receiver encircled by five speakers and a subwoofer.'],
  [39, 'A compact stereo receiver flanked by two large matching speakers.'],
  [41, 'A grand king-sized bed with a tall carved headboard and paired pillows.'],
  [42, 'A gold ring holding a large, brilliantly faceted diamond.'],
  [43, 'A deep Italian leather sofa with rolled arms, stitched cushions, and turned feet.'],
  [44, 'A gaming computer tower, monitor, keyboard, and glowing game controller.'],
  [45, 'A sleek mobile phone framed with small diamonds and a bright gem display.'],
  [46, 'A professional digital camcorder with lens hood, flip screen, and top microphone.'],
  [47, 'A round oak dining table surrounded by four matching chairs.'],
  [48, 'A triangular hang glider banking above a suspended pilot.'],
  [95, 'A cheerful purple monster with horns, spots, claws, and one enormous eye.'],
  [96, 'A diamond necklace with a fine gold chain and a large faceted pendant.'],
  [100, 'A classical marble figure posed on a square museum plinth.'],
  [101, 'A vivid first-issue Faction comic book with a masked hero bursting from its cover.'],
  [102, 'An adjustable office chair with padded back, armrests, gas lift, and five casters.']
]);

function art(id) {
  switch (id) {
    case 1: return `<path d="M14 73q22 2 37-27l18 18 38 13 8 25H18z" fill="${CREAM}" stroke="${O}" stroke-width="7" stroke-linejoin="round"/><path d="M18 91h94v16H18z" fill="#f6f0df" stroke="${O}" stroke-width="6"/><path d="m48 57 25 20m-34-8 28 17m7-18 18 3" fill="none" stroke="${BLUE}" stroke-width="5" stroke-linecap="round"/>`;
    case 2: return `<path d="m28 84 55-55 18 18-55 55z" fill="${METAL}" stroke="${O}" stroke-width="7"/><path d="m76 22 21-10 19 19-10 21z" fill="#d9e0dc" stroke="${O}" stroke-width="7" stroke-linejoin="round"/><path d="m33 78 18 18m-8-28 18 18m-8-28 18 18m-8-28 18 18" stroke="#65716e" stroke-width="4"/><path d="m89 19 20 20" stroke="white" stroke-width="4"/>`;
    case 3: return `<path d="M22 22h31v56H17l8-16zM75 22h31l-3 40 8 16H75z" fill="${BLUE}" stroke="${O}" stroke-width="7" stroke-linejoin="round"/><path d="M17 78h42v16H12zm52 0h47l-4 16H69z" fill="${METAL}" stroke="${O}" stroke-width="6"/><path d="m27 98 8 23 9-23m42 0 8 23 9-23" fill="${GOLD}" stroke="${ORANGE}" stroke-width="5" stroke-linejoin="round"/><path d="M30 36h20m31 0h20" stroke="${CREAM}" stroke-width="5"/>`;
    case 4: return `<path d="M15 79q20-1 28-44l20 7 3 31 28 10 7 23H17z" fill="#f5f2e9" stroke="${O}" stroke-width="7" stroke-linejoin="round"/><path d="M20 92h78v15H20z" fill="${RED}" stroke="${O}" stroke-width="5"/><path d="M46 50h17m-20 11h22m-25 12h26" stroke="${RED}" stroke-width="5"/><circle cx="99" cy="42" r="23" fill="${ORANGE}" stroke="${O}" stroke-width="6"/><path d="M78 42h42M99 19q-12 23 0 46m0-46q12 23 0 46" fill="none" stroke="${O}" stroke-width="4"/>`;
    case 6: return `<path d="M10 26h25v43q0 22 29 22t29-22V26h25v47q0 45-54 45T10 73z" fill="${METAL}" stroke="${O}" stroke-width="7"/><path d="M20 27h15m58 0h15" stroke="${ORANGE}" stroke-width="6"/><path d="m68 76 23-12 7 11-23 12z" fill="${GOLD}" stroke="${O}" stroke-width="4"/><circle cx="76" cy="88" r="4" fill="${O}"/><circle cx="94" cy="78" r="4" fill="${O}"/>`;
    case 7: return `<path d="M12 31 57 58" stroke="${ORANGE}" stroke-width="10" stroke-linecap="round"/><path d="M20 14 62 52" stroke="${GOLD}" stroke-width="6" stroke-linecap="round"/><path d="m55 45 43 10 18 33-31 27-37-20z" fill="#786d69" stroke="${O}" stroke-width="7" stroke-linejoin="round"/><path d="m72 57 19 10-9 13-19-5zm19 31 14-8 4 12-13 12z" fill="${ORANGE}"/><circle cx="35" cy="42" r="4" fill="${GOLD}"/>`;
    case 8: return `<path d="M15 62h98v45H15z" fill="#a9673d" stroke="${O}" stroke-width="7"/><path d="m20 62 15-29h78L98 62z" fill="#c8884e" stroke="${O}" stroke-width="7" stroke-linejoin="round"/><g stroke="${O}" stroke-width="5"><path d="M26 75h70v11H26z" fill="#805334"/><path d="M32 47h72v13H32z" fill="${BROWN}"/><path d="M28 91h70v11H28z" fill="#805334"/></g><g fill="${GOLD}"><path d="M43 47h12v13H43z"/><path d="M63 75h12v11H63z"/><path d="M48 91h12v11H48z"/></g>`;
    case 9: return `<path d="M29 43h70v75H29z" fill="#8f9690" stroke="${O}" stroke-width="7"/><path d="M20 14h20v17h15V14h18v17h15V14h20v34H20z" fill="#abb0aa" stroke="${O}" stroke-width="7" stroke-linejoin="round"/><path d="M53 118V86q0-13 11-13t11 13v32z" fill="#3b403d" stroke="${O}" stroke-width="5"/><path d="M41 57h13v15H41zm33 0h13v15H74z" fill="#e8c45d" stroke="${O}" stroke-width="4"/>`;
    case 12: return `<ellipse cx="72" cy="67" rx="41" ry="30" fill="#bc6f43" stroke="${O}" stroke-width="7" transform="rotate(-18 72 67)"/><ellipse cx="72" cy="67" rx="24" ry="16" fill="#dd9764" stroke="#7c4936" stroke-width="5" transform="rotate(-18 72 67)"/><path d="M11 40h29M8 58h25M18 76h18" stroke="${ORANGE}" stroke-width="6" stroke-linecap="round"/>`;
    case 13: return `<rect x="10" y="18" width="108" height="73" rx="5" fill="#273b3e" stroke="${O}" stroke-width="7"/><path d="m18 78 30-36 22 19 19-25 21 42z" fill="${BLUE}"/><circle cx="90" cy="39" r="10" fill="${GOLD}"/><path d="M64 91v17m-29 0h58" stroke="${O}" stroke-width="8" stroke-linecap="round"/>`;
    case 14: return `<path d="M64 9v21m-24 2h48M45 32q0 24-19 39m57-39q0 24 19 39M64 32v43" fill="none" stroke="${GOLD}" stroke-width="6" stroke-linecap="round"/><path d="M18 68h20l-4 15H22zm72 0h20l-4 15H94zM53 73h22l-5 17H58z" fill="${CREAM}" stroke="${O}" stroke-width="5"/><g fill="#79b7c5" stroke="${O}" stroke-width="3"><path d="m28 85 8 13-8 14-8-14z"/><path d="m100 85 8 13-8 14-8-14z"/><path d="m64 92 10 15-10 14-10-14z"/></g>`;
    case 15: return `<path d="M13 82h71v25H13z" fill="${GOLD}" stroke="${O}" stroke-width="7"/><path d="M37 42h40l12 40H31z" fill="${ORANGE}" stroke="${O}" stroke-width="7"/><path d="M48 50h22l7 24H43z" fill="${BLUE}" stroke="${O}" stroke-width="4"/><path d="M82 52 101 26l12 8-16 29 19 13-10 20-22-12" fill="${GOLD}" stroke="${O}" stroke-width="7" stroke-linejoin="round"/><path d="M18 108h74" stroke="${O}" stroke-width="14" stroke-linecap="round"/><path d="M25 108h60" stroke="#6d716d" stroke-width="5" stroke-dasharray="8 6"/>`;
    case 16: return `<path d="M47 116 55 45h25l4 71z" fill="${BLUE}" stroke="${O}" stroke-width="7" stroke-linejoin="round"/><path d="M56 46 46 20q-3-10 8-12l30 7-4 31z" fill="#e8f0ec" stroke="${O}" stroke-width="6"/><path d="M55 17h26M53 25h28M57 34h22" stroke="${BLUE}" stroke-width="3"/><circle cx="68" cy="78" r="7" fill="${GOLD}" stroke="${O}" stroke-width="4"/><path d="M37 116h57" stroke="${O}" stroke-width="7" stroke-linecap="round"/>`;
    case 17: return `<path d="M24 18h80v62H24z" fill="#54615f" stroke="${O}" stroke-width="7" stroke-linejoin="round"/><path d="M33 28h62v43H33z" fill="${BLUE}"/><path d="m33 64 22-22 15 13 12-15 13 24z" fill="${GREEN}"/><circle cx="79" cy="36" r="7" fill="${GOLD}"/><path d="m19 81-9 25h108l-9-25z" fill="${METAL}" stroke="${O}" stroke-width="7" stroke-linejoin="round"/><path d="M49 91h30l7 9H42z" fill="#75817d"/>`;
    case 18: return `<rect x="15" y="13" width="98" height="104" fill="${GOLD}" stroke="${O}" stroke-width="7"/><rect x="27" y="25" width="74" height="80" fill="${CREAM}" stroke="#7a542e" stroke-width="5"/><path d="M29 79 52 53l18 16 13-22 16 32v24H29z" fill="${GREEN}"/><path d="M29 78q23-14 42 1t28-3" fill="none" stroke="${BLUE}" stroke-width="9"/><circle cx="43" cy="42" r="9" fill="${ORANGE}"/>`;
    case 19: return `<path d="m45 19 19 10 19-10 31 20-17 25-15-9v63H46V55l-15 9-17-25z" fill="#8d7658" stroke="${O}" stroke-width="7" stroke-linejoin="round"/><path d="M54 31v75m20-75v75M51 50l13 12 13-12M51 72l13 12 13-12" fill="none" stroke="${CREAM}" stroke-width="4"/><circle cx="64" cy="42" r="3" fill="${O}"/><circle cx="64" cy="94" r="3" fill="${O}"/>`;
    case 20: return `<path d="m43 20 21 9 21-9 31 22-18 25-14-10v61H44V57L30 67 12 42z" fill="${RED}" stroke="${O}" stroke-width="7" stroke-linejoin="round"/><path d="M48 22q16 20 32 0" fill="none" stroke="#f19b87" stroke-width="5"/>`;
    case 21: return `<path d="M30 17h68l-6 97H66l-2-48-4 48H34z" fill="${BLUE}" stroke="${O}" stroke-width="7" stroke-linejoin="round"/><path d="M31 34h66M64 18v47M39 48h15m20 0h15" fill="none" stroke="${CREAM}" stroke-width="5"/><path d="M43 17v15m42-15v15" stroke="${GOLD}" stroke-width="4"/>`;
    case 22: return `<path d="M39 15h50l3 23H36z" fill="${PURPLE}" stroke="${O}" stroke-width="7"/><path d="m38 38-20 78h92L90 38z" fill="#9165a8" stroke="${O}" stroke-width="7" stroke-linejoin="round"/><path d="M51 41 43 111M64 41v70M77 41l8 70" stroke="#c8a7d2" stroke-width="4"/>`;
    case 23: return `<path d="m43 13 21 28 21-28m-46 8 8 33-12 62h58L81 54l8-33" fill="${BLUE}" stroke="${O}" stroke-width="7" stroke-linejoin="round"/><path d="M42 69h44M38 88h52" stroke="${CREAM}" stroke-width="8"/>`;
    case 24: return `<path d="M24 55q16-25 52-10 22 9 27 34l-20 20H38L15 82z" fill="${ORANGE}" stroke="${O}" stroke-width="7" stroke-linejoin="round"/><path d="M85 51q12-24 29-12l7 13-12 18-15-1" fill="${ORANGE}" stroke="${O}" stroke-width="7"/><path d="M30 92 22 113m35-17-1 18m31-20 9 18M18 74 6 57" fill="none" stroke="${O}" stroke-width="7" stroke-linecap="round"/><path d="m40 49 6 18m15-22 4 21m17-14-3 20m20-27 10 7" stroke="${O}" stroke-width="5"/><circle cx="108" cy="48" r="3" fill="${O}"/>`;
    case 25: return `<path d="M35 100q-24-13-9-31 14-16 41 0 25 15 11 35-13 18-43 3 52 22 67-8 14-29-17-48-24-15-14-33 7-13 24-5 14 7 9 21" fill="none" stroke="${GREEN}" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><path d="M91 16q17 0 14 17l-13 7-14-9z" fill="#75a56e" stroke="${O}" stroke-width="5"/><circle cx="96" cy="24" r="2.5" fill="${O}"/><path d="m104 33 12 5-10 3" fill="none" stroke="${RED}" stroke-width="3"/>`;
    case 26: return `<path d="M39 56q1-28 25-28t25 28v31q0 27-25 27T39 87z" fill="#a9764e" stroke="${O}" stroke-width="7"/><path d="M42 45 22 29l3 38 17 5m44-27 20-16-3 38-17 5" fill="#805738" stroke="${O}" stroke-width="7" stroke-linejoin="round"/><path d="M44 88q20 13 40 0" fill="none" stroke="${BLUE}" stroke-width="8"/><circle cx="53" cy="65" r="4" fill="${O}"/><circle cx="75" cy="65" r="4" fill="${O}"/><path d="m58 76 6 7 6-7z" fill="${O}"/>`;
    case 27: return `<path d="M17 105Q55 14 112 20 82 110 17 105z" fill="${BLUE}" stroke="${O}" stroke-width="7" stroke-linejoin="round"/><path d="m36 89 25-15m11-15 24-14" stroke="${CREAM}" stroke-width="10" stroke-linecap="round"/><path d="m47 49 11-13 8 17 18-5-11 15-3 18-11-14-19 5 12-15z" fill="${GOLD}" stroke="${O}" stroke-width="4"/>`;
    case 28: return `<path d="M17 43h94v66H17z" fill="${BROWN}" stroke="${O}" stroke-width="7" stroke-linejoin="round"/><path d="M18 45 64 83l46-38" fill="#b97d52" stroke="${O}" stroke-width="6" stroke-linejoin="round"/><rect x="54" y="72" width="20" height="18" rx="3" fill="${GOLD}" stroke="${O}" stroke-width="4"/><path d="M24 99h80" stroke="#e0a66f" stroke-width="3" stroke-dasharray="5 5"/>`;
    case 29: return `<path d="M13 49h102v59H13z" fill="${BLUE}" stroke="${O}" stroke-width="7"/><path d="M13 36h25v78H13zm102 0h-10v78h10z" fill="${BROWN}" stroke="${O}" stroke-width="7"/><path d="M39 50h61v25H39z" fill="${CREAM}" stroke="${O}" stroke-width="5"/><path d="M19 80h86" stroke="#6fa6b4" stroke-width="5"/>`;
    case 30: return `<rect x="13" y="23" width="102" height="83" rx="5" fill="${METAL}" stroke="${O}" stroke-width="7"/><rect x="24" y="36" width="62" height="52" rx="3" fill="#354548" stroke="${O}" stroke-width="6"/><path d="M31 44h48v36H31z" fill="#526b6e"/><path d="M91 41h15m-15 11h15" stroke="${O}" stroke-width="4"/><circle cx="99" cy="72" r="9" fill="${ORANGE}" stroke="${O}" stroke-width="4"/><path d="M24 97h82" stroke="#707a77" stroke-width="4"/>`;
    case 31: return `<path d="m44 16 20 13 20-13 31 25-19 25-13-10v62H45V56L32 66 13 41z" fill="${GREEN}" stroke="${O}" stroke-width="7" stroke-linejoin="round"/><path d="M64 30v84M46 72h18m0 0h18" stroke="${CREAM}" stroke-width="5"/><path d="m91 35 3 7 8 1-6 5 2 8-7-4-7 4 2-8-6-5 8-1z" fill="white" stroke="${O}" stroke-width="2"/>`;
    case 32: return `<path d="M11 59Q20 14 64 14t53 45L91 48 64 59 37 48z" fill="${ORANGE}" stroke="${O}" stroke-width="7" stroke-linejoin="round"/><path d="M64 17v77q0 22 17 22 15 0 15-15" fill="none" stroke="${BROWN}" stroke-width="7" stroke-linecap="round"/><path d="M37 48q6-27 27-31m27 31q-6-27-27-31" fill="none" stroke="#ffd17b" stroke-width="4"/>`;
    case 33: return `<rect x="18" y="9" width="92" height="110" rx="7" fill="${METAL}" stroke="${O}" stroke-width="7"/><path d="M21 35h86" stroke="${O}" stroke-width="6"/><circle cx="64" cy="78" r="31" fill="#33494e" stroke="${O}" stroke-width="6"/><circle cx="64" cy="78" r="21" fill="${BLUE}"/><path d="M49 77q15-16 31 0-12 20-31 0z" fill="#8dc0ca"/><circle cx="35" cy="22" r="5" fill="${ORANGE}"/><path d="M49 22h38" stroke="#67716e" stroke-width="5"/>`;
    case 34: return `<rect x="18" y="9" width="92" height="110" rx="7" fill="#a6aaa4" stroke="${O}" stroke-width="7"/><path d="M21 35h86" stroke="${O}" stroke-width="6"/><circle cx="64" cy="78" r="30" fill="#483d36" stroke="${O}" stroke-width="6"/><circle cx="64" cy="78" r="19" fill="${ORANGE}" opacity=".75"/><path d="M39 112h50M33 22h17m9 0h28" stroke="#68716d" stroke-width="5"/><path d="M86 56q12 8 0 16m8-24q17 13 1 29" fill="none" stroke="${GOLD}" stroke-width="4" stroke-linecap="round"/>`;
    case 35: return `<rect x="30" y="8" width="68" height="112" rx="5" fill="#d8ded8" stroke="${O}" stroke-width="7"/><path d="M31 51h66M64 10v108" stroke="${O}" stroke-width="5"/><path d="M53 25v16m22-16v16M53 67v28m22-28v28" stroke="#6d7773" stroke-width="5" stroke-linecap="round"/><rect x="69" y="101" width="21" height="10" fill="${BLUE}" stroke="${O}" stroke-width="3"/>`;
    case 36: return `<rect x="31" y="12" width="66" height="99" rx="10" fill="${BLUE}" stroke="${O}" stroke-width="7"/><rect x="43" y="25" width="42" height="28" rx="3" fill="#b9d9d9" stroke="${O}" stroke-width="4"/><path d="M50 39h28" stroke="${GREEN}" stroke-width="5"/><circle cx="64" cy="79" r="20" fill="${CREAM}" stroke="${O}" stroke-width="5"/><circle cx="64" cy="79" r="6" fill="${ORANGE}"/><path d="M43 110q-22 1-21-22m63 22q22 1 21-22" fill="none" stroke="${O}" stroke-width="4"/><circle cx="21" cy="84" r="7" fill="${CREAM}" stroke="${O}" stroke-width="4"/><circle cx="107" cy="84" r="7" fill="${CREAM}" stroke="${O}" stroke-width="4"/>`;
    case 37: return `<rect x="11" y="54" width="106" height="50" rx="5" fill="#626c69" stroke="${O}" stroke-width="7"/><path d="M24 68h53v20H24z" fill="#303c3d" stroke="${O}" stroke-width="4"/><path d="M33 78h29" stroke="${ORANGE}" stroke-width="4"/><circle cx="99" cy="79" r="9" fill="${GOLD}" stroke="${O}" stroke-width="4"/><path d="M27 52 74 17l35 23-47 35z" fill="${METAL}" stroke="${O}" stroke-width="6"/><circle cx="69" cy="45" r="16" fill="#708a8c" stroke="${O}" stroke-width="4"/><circle cx="69" cy="45" r="5" fill="${CREAM}"/>`;
    case 38: return `<rect x="38" y="44" width="52" height="52" rx="4" fill="#505a58" stroke="${O}" stroke-width="6"/><path d="M49 57h30v10H49z" fill="${BLUE}"/><circle cx="54" cy="81" r="7" fill="${ORANGE}"/><circle cx="75" cy="81" r="7" fill="${GOLD}"/><g fill="#697471" stroke="${O}" stroke-width="5"><rect x="8" y="20" width="24" height="39"/><rect x="96" y="20" width="24" height="39"/><rect x="7" y="76" width="25" height="39"/><rect x="96" y="76" width="25" height="39"/><rect x="50" y="6" width="28" height="31"/></g><g fill="${CREAM}"><circle cx="20" cy="40" r="6"/><circle cx="108" cy="40" r="6"/><circle cx="20" cy="96" r="6"/><circle cx="108" cy="96" r="6"/><circle cx="64" cy="21" r="6"/></g>`;
    case 39: return `<rect x="42" y="35" width="44" height="65" rx="4" fill="#586360" stroke="${O}" stroke-width="6"/><rect x="50" y="45" width="28" height="13" fill="${BLUE}"/><path d="M50 70h28M50 82h28" stroke="${GOLD}" stroke-width="5"/><g fill="#67726f" stroke="${O}" stroke-width="6"><rect x="8" y="20" width="28" height="91"/><rect x="92" y="20" width="28" height="91"/></g><g fill="${CREAM}" stroke="${O}" stroke-width="4"><circle cx="22" cy="47" r="8"/><circle cx="22" cy="84" r="13"/><circle cx="106" cy="47" r="8"/><circle cx="106" cy="84" r="13"/></g>`;
    case 41: return `<path d="M12 23h104v94H12z" fill="${BROWN}" stroke="${O}" stroke-width="7"/><path d="M21 35h86v27H21z" fill="#c28b5c" stroke="${O}" stroke-width="5"/><path d="M17 61h94v50H17z" fill="${PURPLE}" stroke="${O}" stroke-width="7"/><path d="M25 68h35v22H25zm43 0h35v22H68z" fill="${CREAM}" stroke="${O}" stroke-width="4"/><path d="M18 97h92" stroke="#b18bc0" stroke-width="5"/><path d="M29 24v-9m70 9v-9" stroke="${O}" stroke-width="7" stroke-linecap="round"/>`;
    case 42: return `<ellipse cx="64" cy="83" rx="34" ry="29" fill="none" stroke="${GOLD}" stroke-width="13"/><path d="m64 8 27 25-12 26H49L37 33z" fill="#bde1e5" stroke="${O}" stroke-width="7" stroke-linejoin="round"/><path d="m38 33 26 26 27-26M50 14l14 45 15-45" fill="none" stroke="#5e9cab" stroke-width="4"/><path d="M54 84h20" stroke="#fff6cf" stroke-width="4"/>`;
    case 43: return `<path d="M16 48q0-16 17-16 16 0 19 17h24q3-17 19-17 17 0 17 16v61H16z" fill="${BROWN}" stroke="${O}" stroke-width="7"/><path d="M31 58h66v43H31z" fill="#a96f49" stroke="${O}" stroke-width="6"/><path d="M64 59v41M20 83h21m46 0h21" stroke="#74482f" stroke-width="5"/><path d="M27 110v9m74-9v9" stroke="${O}" stroke-width="7" stroke-linecap="round"/>`;
    case 44: return `<rect x="12" y="15" width="70" height="55" rx="4" fill="#35464a" stroke="${O}" stroke-width="6"/><path d="M20 23h54v39H20z" fill="${BLUE}"/><path d="m26 58 17-19 12 10 9-13 10 22z" fill="${PURPLE}"/><path d="M47 70v15m-25 0h50" stroke="${O}" stroke-width="6"/><path d="M87 10h29v74H87z" fill="#4d5755" stroke="${O}" stroke-width="6"/><circle cx="101" cy="29" r="8" fill="${ORANGE}"/><path d="M95 55h14" stroke="${GOLD}" stroke-width="5"/><path d="M21 92h62l8 22H12z" fill="${METAL}" stroke="${O}" stroke-width="5"/><path d="M89 96q15-12 29 0l5 18-15 3-7-9-7 9-14-3z" fill="${PURPLE}" stroke="${O}" stroke-width="5"/>`;
    case 45: return `<rect x="30" y="8" width="68" height="112" rx="12" fill="#3b4544" stroke="${O}" stroke-width="7"/><rect x="40" y="23" width="48" height="73" rx="4" fill="${PURPLE}"/><path d="m64 35 8 15 17 3-12 12 3 17-16-8-16 8 3-17-12-12 17-3z" fill="#e0c9eb"/><circle cx="64" cy="108" r="5" fill="${GOLD}"/><g fill="#cde6e8" stroke="${O}" stroke-width="2"><circle cx="31" cy="30" r="5"/><circle cx="31" cy="50" r="5"/><circle cx="31" cy="70" r="5"/><circle cx="97" cy="30" r="5"/><circle cx="97" cy="50" r="5"/><circle cx="97" cy="70" r="5"/></g>`;
    case 46: return `<path d="M18 40h72v62H18z" fill="#5e6966" stroke="${O}" stroke-width="7"/><path d="M90 53h24v35H90z" fill="${BLUE}" stroke="${O}" stroke-width="6"/><circle cx="34" cy="72" r="17" fill="#354346" stroke="${O}" stroke-width="6"/><circle cx="34" cy="72" r="8" fill="#80b7c1"/><path d="M46 39 58 19h35l10 21M62 20v-9h24v9" fill="${METAL}" stroke="${O}" stroke-width="6" stroke-linejoin="round"/><path d="M63 102v13m-23 0h46" stroke="${O}" stroke-width="7" stroke-linecap="round"/>`;
    case 47: return `<ellipse cx="64" cy="51" rx="43" ry="30" fill="#b57b48" stroke="${O}" stroke-width="7"/><path d="M64 80v37M43 117h42" stroke="${O}" stroke-width="8" stroke-linecap="round"/><g fill="${BROWN}" stroke="${O}" stroke-width="5"><path d="M9 27h20v61H9zM14 88v26m10-26v26"/><path d="M99 27h20v61H99zM104 88v26m10-26v26"/><path d="M43 84h42v19H43zM48 103v16m32-16v16"/></g><circle cx="64" cy="50" r="13" fill="${CREAM}" stroke="#744725" stroke-width="4"/>`;
    case 48: return `<path d="M7 48 64 13l57 35-57-10z" fill="${ORANGE}" stroke="${O}" stroke-width="7" stroke-linejoin="round"/><path d="m7 48 57-10 57 10-57 15z" fill="${CREAM}" stroke="${O}" stroke-width="6" stroke-linejoin="round"/><path d="M64 16v48m-40-6 40-20 40 20" stroke="${BLUE}" stroke-width="4"/><path d="M64 62 48 91m16-29 16 29M48 91h32" stroke="${O}" stroke-width="6"/><circle cx="64" cy="86" r="8" fill="${GOLD}" stroke="${O}" stroke-width="4"/><path d="M64 94v22m0-10-12 10m12-10 12 10" stroke="${O}" stroke-width="5" stroke-linecap="round"/>`;
    case 95: return `<path d="M28 51q4-32 36-32t36 32l13 51-24 17-25-12-25 12-24-17z" fill="${PURPLE}" stroke="${O}" stroke-width="7" stroke-linejoin="round"/><path d="m39 26-10-18 24 13m36 5 10-18-24 13" fill="${GOLD}" stroke="${O}" stroke-width="6" stroke-linejoin="round"/><circle cx="64" cy="61" r="24" fill="#efe4b8" stroke="${O}" stroke-width="6"/><circle cx="64" cy="61" r="10" fill="${BLUE}" stroke="${O}" stroke-width="4"/><path d="M48 91q16 13 32 0" fill="none" stroke="${O}" stroke-width="6"/><circle cx="36" cy="73" r="6" fill="#a77abb"/><circle cx="91" cy="83" r="7" fill="#a77abb"/>`;
    case 96: return `<path d="M17 23q7 77 47 84 40-7 47-84" fill="none" stroke="${GOLD}" stroke-width="7" stroke-linecap="round"/><g fill="${CREAM}" stroke="${O}" stroke-width="3"><circle cx="27" cy="52" r="6"/><circle cx="38" cy="76" r="6"/><circle cx="90" cy="76" r="6"/><circle cx="101" cy="52" r="6"/></g><path d="m64 62 25 23-12 31H51L39 85z" fill="#bde1e5" stroke="${O}" stroke-width="7" stroke-linejoin="round"/><path d="m40 85 24 31 25-31M51 69l13 47 13-47" fill="none" stroke="#5e9cab" stroke-width="4"/>`;
    case 100: return `<path d="M42 111h44v-12H42zm-9 0h62v10H33z" fill="#bfc4bd" stroke="${O}" stroke-width="6"/><circle cx="67" cy="24" r="15" fill="#e2e2da" stroke="${O}" stroke-width="5"/><path d="M53 39q14-9 28 2l8 39-17 8v12H51V76l-15 15-10-11 24-28z" fill="#deded6" stroke="${O}" stroke-width="6" stroke-linejoin="round"/><path d="m75 48 22 17-7 10-17-12m-22 36-14-28" fill="none" stroke="#a9ada8" stroke-width="5"/>`;
    case 101: return `<path d="M25 9h78v110H25z" fill="${RED}" stroke="${O}" stroke-width="7"/><path d="M34 20h60v18H34z" fill="${CREAM}" stroke="${O}" stroke-width="4"/><path d="M41 45 64 52l20-11-4 23 14 17-22 3-12 20-10-20-23-3 16-16z" fill="${GOLD}" stroke="${O}" stroke-width="4"/><path d="M47 55q15-14 30 0l-6 23H51z" fill="${BLUE}" stroke="${O}" stroke-width="4"/><path d="m52 58 9 8 13-10M37 29h38" stroke="${O}" stroke-width="4"/><path d="M84 18h13v24H84z" fill="${ORANGE}" stroke="${O}" stroke-width="3"/>`;
    case 102: return `<path d="M34 14h60v53H34z" fill="#53615e" stroke="${O}" stroke-width="7" stroke-linejoin="round"/><path d="M28 70h72v30H28z" fill="#65716e" stroke="${O}" stroke-width="7"/><path d="M64 99v15m-31 7 31-7 31 7m-31-7-19 7m19-7 19 7" stroke="${O}" stroke-width="7" stroke-linecap="round"/><circle cx="31" cy="121" r="5" fill="${ORANGE}"/><circle cx="45" cy="121" r="5" fill="${ORANGE}"/><circle cx="83" cy="121" r="5" fill="${ORANGE}"/><circle cx="97" cy="121" r="5" fill="${ORANGE}"/><path d="M27 63H13v26m88-26h14v26" fill="none" stroke="${O}" stroke-width="7" stroke-linecap="round"/><path d="M46 24h36M42 39h44M39 54h50" stroke="#87938f" stroke-width="4"/>`;
    default: throw new Error(`Missing Starter icon art for item ${id}.`);
  }
}

function escapeXml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

const catalog = loadLegacyCatalog();
fs.mkdirSync(OUTPUT, { recursive: true });
const expectedFiles = new Set(STARTER_ICON_ITEM_IDS.map((id) => `item-${id}.svg`));
for (const filename of fs.readdirSync(OUTPUT)) {
  if (filename.endsWith('.svg') && !expectedFiles.has(filename)) {
    fs.rmSync(path.join(OUTPUT, filename));
  }
}
for (const id of STARTER_ICON_ITEM_IDS) {
  const item = catalog.byId.get(id);
  if (!item || item.mineTypeId !== 1 || item.repairedItemId !== null) {
    throw new Error(`Invalid Starter icon item ${id}.`);
  }
  const description = descriptions.get(id);
  if (!description) throw new Error(`Missing Starter icon description for item ${id}.`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(item.name)}</title>
  <desc id="desc">${escapeXml(description)}</desc>
  ${art(id)}
</svg>
`;
  fs.writeFileSync(path.join(OUTPUT, `item-${id}.svg`), svg);
}

console.log(`Generated ${STARTER_ICON_ITEM_IDS.length} Starter item SVGs in ${OUTPUT}.`);
