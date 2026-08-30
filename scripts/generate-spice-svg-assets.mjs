import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLegacyCatalog } from '../src/legacy-catalog.js';
import { SPICE_ICON_ITEM_IDS } from '../src/spice-icons.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'public', 'img', 'items', 'spices');
const O = '#292d29';
const GREEN = '#557d52';
const LIGHT = '#82a96c';
const GOLD = '#d8be32';
const ORANGE = '#f28c28';
const RED = '#c84a3b';
const PURPLE = '#75508f';
const CREAM = '#f0dfbd';
const BROWN = '#95613e';
const DARK_BROWN = '#60432f';

const descriptions = new Map([
  [103, 'A purple saffron crocus opened around three precious crimson stigmas.'],
  [104, 'A lush basil sprig with broad glossy leaves arranged around a square stem.'],
  [105, 'Two long black vanilla pods beside a pale star-shaped vanilla orchid.'],
  [106, 'A single leathery bay leaf with a strong central vein and finely scalloped edge.'],
  [107, 'Green cardamom pods, one split open to reveal rows of dark aromatic seeds.'],
  [108, 'A small heap of narrow crescent-shaped caraway seeds with pale longitudinal ridges.'],
  [109, 'A woody eight-pointed star-anise pod holding a glossy seed in every chamber.'],
  [110, 'Round coriander seeds beside the delicate lobed leaves of the same plant.'],
  [111, 'A whole nutmeg wrapped in the brilliant branching scarlet aril known as mace.'],
  [112, 'Long ochre cumin seeds with tapered ends and strong parallel ridges.'],
  [113, 'Three tightly rolled cinnamon quills tied together with a small golden cord.'],
  [114, 'A fennel umbel above several plump green-gold, deeply ridged seeds.'],
  [115, 'Creamy white peppercorns clustered on a short stem and scattered below.'],
  [116, 'Dark fibrous licorice roots cut into sturdy sticks with golden woody centres.'],
  [117, 'A warm brown nutmeg seed beside a cut half showing its marbled interior.'],
  [118, 'A fresh mint sprig with opposite serrated leaves and cool blue-green veins.'],
  [119, 'A dangling green pepper spike densely packed with ripe black peppercorns.'],
  [120, 'Angular black onion seeds spilling beneath a round white allium flower head.'],
  [121, 'A crowned poppy capsule tipping a stream of tiny blue-black seeds.'],
  [122, 'A ripe red paprika pepper beside a bowl heaped with vivid ground spice.'],
  [123, 'A glossy heart-shaped red pimento pepper with a curled green stem.'],
  [124, 'A bright parsley bunch made from crisp divided leaves on slender stems.'],
  [125, 'A split sesame capsule releasing a shower of small ivory oval seeds.'],
  [126, 'A woody rosemary sprig lined with many narrow needle-like leaves.'],
  [127, 'A knobbly golden ginger rhizome with one cut face and a fresh green shoot.'],
  [128, 'A papery white garlic bulb opened to show several plump individual cloves.'],
  [129, 'A ridged green wasabi rhizome beside a small mound of freshly grated paste.'],
  [130, 'Soft silver-green sage leaves with broad wrinkled blades and downy edges.'],
  [131, 'Branching orange turmeric roots with round cut slices showing vivid centres.'],
  [132, 'A curved brown tamarind pod cracked open around sticky dark pulp and seeds.'],
  [133, 'A delicate dill umbel with flat oval seeds radiating from fine stems.'],
  [134, 'Several dried cloves with dark tapered stems and rounded flower-bud crowns.'],
  [135, 'Golden mustard seeds beneath a small four-petalled yellow mustard flower.'],
  [136, 'A spiny annatto pod split wide to reveal tightly packed scarlet seeds.'],
  [137, 'Tiny celery seeds beside a pale green celery flower umbel and ribbed stalk.'],
  [138, 'A slender tarragon sprig bearing long narrow leaves along a branching stem.']
]);

function art(id) {
  switch (id) {
    case 103: return `<path d="M64 111V53" stroke="${GREEN}" stroke-width="7"/><path d="M64 58Q23 64 22 27q30-7 42 25Q76 20 106 27q-1 37-42 31Q39 40 46 13q21 6 18 39 4-33 22-39 8 27-22 45z" fill="${PURPLE}" stroke="${O}" stroke-width="6" stroke-linejoin="round"/><path d="M64 57 50 27m14 30 14-30M64 57v-38" stroke="${RED}" stroke-width="5" stroke-linecap="round"/><circle cx="50" cy="26" r="4" fill="${ORANGE}"/><circle cx="64" cy="18" r="4" fill="${ORANGE}"/><circle cx="78" cy="26" r="4" fill="${ORANGE}"/>`;
    case 104: return `<path d="M63 116V19m0 32Q31 17 18 47q20 25 45 4zm1 8q32-34 45-4-20 25-45 4zm-1 18q-32-25-43 4 21 22 43-4zm1 9q30-24 42 5-20 20-42-5zm-1 18q-26-17-35 8 19 16 35-8z" fill="${GREEN}" stroke="${O}" stroke-width="6" stroke-linejoin="round"/><path d="M64 51 28 40m36 19 35-12M63 76 29 77m35 7 32 7" stroke="${LIGHT}" stroke-width="3"/>`;
    case 105: return `<path d="M35 112Q42 57 53 16M57 115Q66 59 72 13" fill="none" stroke="#3f3128" stroke-width="11" stroke-linecap="round"/><path d="M78 66q-25-12-15-35 17-20 32 3 14-22 27-1 8 24-19 32-7 26-27 10z" fill="${CREAM}" stroke="${O}" stroke-width="5"/><circle cx="91" cy="52" r="8" fill="${GOLD}"/><path d="M91 51 78 34m13 17 5-23m-5 23 20-12" stroke="#b88835" stroke-width="3"/>`;
    case 106: return `<path d="M22 106Q15 38 96 12q20 73-66 99z" fill="${GREEN}" stroke="${O}" stroke-width="7"/><path d="M27 105 91 22M46 82l-20-13m34-4L41 48m35-3L60 31m-24 61 16 8m9-27 20 7m-7-24 20 6" stroke="${LIGHT}" stroke-width="4" stroke-linecap="round"/>`;
    case 107: return `<path d="M18 87q0-37 30-46 28 14 20 51-25 25-50-5z" fill="${GREEN}" stroke="${O}" stroke-width="7"/><path d="M48 42q-10 30 7 56M25 70h40" fill="none" stroke="${LIGHT}" stroke-width="4"/><path d="M69 86q-2-38 26-51 31 13 16 50-19 30-42 1z" fill="#86a65f" stroke="${O}" stroke-width="7"/><path d="M75 80q8-28 26-34 7 23-6 42z" fill="${CREAM}" stroke="${O}" stroke-width="4"/><g fill="${DARK_BROWN}"><circle cx="87" cy="60" r="4"/><circle cx="96" cy="69" r="4"/><circle cx="86" cy="78" r="4"/></g>`;
    case 108: return `<g fill="#8c6d3f" stroke="${O}" stroke-width="4"><path d="M18 45q14-24 30-7-22 0-21 28z"/><path d="M48 29q16-22 30-3-21-2-23 25z"/><path d="M78 43q20-18 30 4-20-7-28 18z"/><path d="M28 81q18-20 30 1-21-4-25 22z"/><path d="M65 74q18-22 32-2-22-3-26 24z"/><path d="M94 82q18-14 25 7-18-8-28 10z"/></g><g stroke="${CREAM}" stroke-width="2"><path d="M25 47 42 39M55 31l18-4M84 47l19 1M34 84l19-1M72 78l20-4m7 13 15 3"/></g>`;
    case 109: return `<path d="m64 10 13 31 29-17-16 29 32 11-32 11 16 29-29-17-13 31-13-31-29 17 16-29L6 64l32-11-16-29 29 17z" fill="${BROWN}" stroke="${O}" stroke-width="7" stroke-linejoin="round"/><circle cx="64" cy="64" r="17" fill="#70472d" stroke="${O}" stroke-width="5"/><g fill="${GOLD}"><ellipse cx="64" cy="26" rx="6" ry="10"/><ellipse cx="97" cy="45" rx="6" ry="10" transform="rotate(55 97 45)"/><ellipse cx="99" cy="82" rx="6" ry="10" transform="rotate(115 99 82)"/><ellipse cx="64" cy="102" rx="6" ry="10"/><ellipse cx="29" cy="82" rx="6" ry="10" transform="rotate(55 29 82)"/><ellipse cx="31" cy="45" rx="6" ry="10" transform="rotate(115 31 45)"/></g>`;
    case 110: return `<path d="M64 115V31m0 40L35 47m29 39 31-25" stroke="${GREEN}" stroke-width="6" stroke-linecap="round"/><g fill="${LIGHT}" stroke="${O}" stroke-width="4"><path d="M34 48q-23-18-25 8 16 17 25-8z"/><path d="M38 52q-10 27 15 22 13-21-15-22z"/><path d="M94 61q25-16 25 10-17 17-25-10z"/><path d="M90 65q8 28-17 21-11-22 17-21z"/></g><g fill="#b69a61" stroke="${O}" stroke-width="4"><circle cx="48" cy="25" r="10"/><circle cx="68" cy="18" r="10"/><circle cx="86" cy="29" r="10"/></g><g stroke="#7b653c" stroke-width="2"><path d="m43 23 10 4m10-12 10 6m8 3 10 7"/></g>`;
    case 111: return `<circle cx="64" cy="65" r="31" fill="#8b5a35" stroke="${O}" stroke-width="7"/><path d="M64 26q-37 8-43 38 18-7 29 2-24 14-16 39 17-16 30-7 13-9 30 7 8-25-16-39 11-9 29-2-6-30-43-38z" fill="none" stroke="${RED}" stroke-width="10" stroke-linejoin="round"/><path d="M49 54q15-19 30 0-2 28-15 41-13-13-15-41z" fill="#a67143" stroke="#5c3a2a" stroke-width="4"/>`;
    case 112: return `<g fill="#b48b48" stroke="${O}" stroke-width="4"><path d="m13 86 43-58 9 8-42 59z"/><path d="m38 105 34-70 11 6-34 71z"/><path d="m70 108 16-76 12 3-16 77z"/><path d="m94 104 1-69 12 1-1 69z"/></g><g stroke="${CREAM}" stroke-width="2"><path d="m20 86 40-53m-15 69 33-64m0 67 14-71m9 68V36"/></g>`;
    case 113: return `<g fill="#a7653b" stroke="${O}" stroke-width="6"><path d="M16 31h29v82H16z"/><path d="M49 20h30v94H49z"/><path d="M83 31h29v82H83z"/></g><path d="M23 32q15 12 15 0m18-11q15 13 16 0m18 11q14 12 15 0" fill="none" stroke="#603b2a" stroke-width="5"/><path d="M12 70h104" stroke="${GOLD}" stroke-width="9"/><path d="m64 70-13-11m13 11 13-11" stroke="${O}" stroke-width="3"/>`;
    case 114: return `<path d="M64 116V37m0 24L35 44m29 17 29-19M64 45 47 24m17 21 17-23" stroke="${GREEN}" stroke-width="5"/><g fill="${GOLD}" stroke="${O}" stroke-width="3"><ellipse cx="31" cy="40" rx="5" ry="10" transform="rotate(-55 31 40)"/><ellipse cx="47" cy="22" rx="5" ry="10" transform="rotate(-25 47 22)"/><ellipse cx="64" cy="15" rx="5" ry="10"/><ellipse cx="82" cy="21" rx="5" ry="10" transform="rotate(25 82 21)"/><ellipse cx="98" cy="39" rx="5" ry="10" transform="rotate(55 98 39)"/></g><g fill="#a78642" stroke="${O}" stroke-width="3"><path d="m22 89 13-20 8 6-13 21z"/><path d="m49 104 8-27 9 3-7 28z"/><path d="m78 99 13-23 8 5-13 24z"/></g>`;
    case 115: return `<path d="M61 112V41m0 22L35 48m26 30 29-20" stroke="${GREEN}" stroke-width="6"/><g fill="#eee5cf" stroke="${O}" stroke-width="4"><circle cx="34" cy="43" r="11"/><circle cx="54" cy="36" r="11"/><circle cx="73" cy="42" r="11"/><circle cx="90" cy="54" r="11"/><circle cx="45" cy="61" r="11"/><circle cx="68" cy="63" r="11"/><circle cx="26" cy="95" r="10"/><circle cx="50" cy="104" r="10"/><circle cx="84" cy="99" r="10"/><circle cx="106" cy="89" r="10"/></g>`;
    case 116: return `<g stroke="${O}" stroke-width="7" stroke-linecap="round"><path d="M21 109 54 18" stroke="${DARK_BROWN}"/><path d="M50 112 75 15" stroke="#6e4b31"/><path d="M78 112 106 27" stroke="#4c3728"/></g><path d="m16 105 15 5m14-2 16 4m12-4 16 5" stroke="${CREAM}" stroke-width="6"/><g fill="${GOLD}" stroke="${O}" stroke-width="4"><ellipse cx="57" cy="18" rx="12" ry="7" transform="rotate(-73 57 18)"/><ellipse cx="78" cy="16" rx="12" ry="7" transform="rotate(-76 78 16)"/></g>`;
    case 117: return `<ellipse cx="43" cy="68" rx="29" ry="39" fill="#8c603c" stroke="${O}" stroke-width="7"/><path d="M36 36q12 27 0 62m15-62q-11 28 1 61" fill="none" stroke="#5f412e" stroke-width="4"/><ellipse cx="91" cy="70" rx="28" ry="38" fill="${CREAM}" stroke="${O}" stroke-width="7"/><path d="M91 35q-25 18 0 35-25 18 0 36 24-18 0-36 24-17 0-35z" fill="#8f6544" stroke="#5d3e2c" stroke-width="4"/>`;
    case 118: return `<path d="M62 116V20m0 25L31 29m31 35 36-26M62 82 29 68m33 31 35-20" stroke="${GREEN}" stroke-width="6"/><g fill="#4f9368" stroke="${O}" stroke-width="5"><path d="M33 30Q7 14 11 44q19 19 22-14z"/><path d="M97 39q25-18 24 12-18 20-24-12z"/><path d="M30 68Q6 50 8 81q18 19 22-13z"/><path d="M96 79q25-17 23 13-19 19-23-13z"/></g><path d="M23 29h10m63 10h10M20 68h10m66 11h10" stroke="#92c5a0" stroke-width="3"/>`;
    case 119: return `<path d="M62 116V13m0 21 31 13M62 55 34 70m28 6 31 19" stroke="${GREEN}" stroke-width="7"/><path d="M62 29q21-25 39-8-6 28-39 8zM62 55Q38 31 22 51q10 27 40 4z" fill="${LIGHT}" stroke="${O}" stroke-width="5"/><g fill="#303532" stroke="${O}" stroke-width="3"><circle cx="89" cy="48" r="8"/><circle cx="77" cy="57" r="8"/><circle cx="95" cy="65" r="8"/><circle cx="81" cy="76" r="8"/><circle cx="96" cy="86" r="8"/><circle cx="85" cy="99" r="8"/></g>`;
    case 120: return `<path d="M64 116V50m0 7L39 34m25 23 25-23M64 49V19" stroke="${GREEN}" stroke-width="5"/><g fill="#f2ead5" stroke="${O}" stroke-width="3"><circle cx="64" cy="17" r="13"/><circle cx="42" cy="31" r="12"/><circle cx="86" cy="31" r="12"/></g><g fill="#292b29"><path d="m17 93 9-8 8 9-8 9z"/><path d="m39 108 9-8 9 9-9 9z"/><path d="m72 95 8-9 9 8-8 10z"/><path d="m98 107 8-8 9 9-9 8z"/></g>`;
    case 121: return `<path d="M64 116V61" stroke="${GREEN}" stroke-width="7"/><path d="M39 25q25-18 50 0l-7 51H46z" fill="#82936e" stroke="${O}" stroke-width="7"/><path d="m38 27 26-16 26 16-26 9z" fill="#9aa77b" stroke="${O}" stroke-width="5"/><path d="M83 67q23 6 29 29" stroke="${BROWN}" stroke-width="5"/><g fill="#36363c"><circle cx="92" cy="80" r="4"/><circle cx="101" cy="88" r="4"/><circle cx="109" cy="99" r="4"/><circle cx="91" cy="100" r="4"/><circle cx="112" cy="113" r="4"/></g>`;
    case 122: return `<path d="M25 15q35 1 35 40-2 37-38 48-14-39 3-88z" fill="${RED}" stroke="${O}" stroke-width="7"/><path d="M25 17q-4-12 12-10l8 12" fill="none" stroke="${GREEN}" stroke-width="7"/><path d="M60 112h63L113 78H70z" fill="#b26c3d" stroke="${O}" stroke-width="7"/><path d="M67 81q22-27 50 0" fill="${ORANGE}" stroke="${O}" stroke-width="6"/><path d="M75 87h36" stroke="#f6b24e" stroke-width="4"/>`;
    case 123: return `<path d="M64 30q31-24 48 11 13 39-48 78Q3 80 16 41 33 6 64 30z" fill="${RED}" stroke="${O}" stroke-width="8"/><path d="M64 31q-2-24 21-24" fill="none" stroke="${GREEN}" stroke-width="8" stroke-linecap="round"/><path d="M64 33q-20 20-12 64m12-64q20 20 12 64" fill="none" stroke="#e67e68" stroke-width="5"/>`;
    case 124: return `<path d="M64 119V51m0 17L34 42m30 26 30-27M64 87 28 74m36 13 36-13" stroke="${GREEN}" stroke-width="6"/><g fill="${LIGHT}" stroke="${O}" stroke-width="4"><path d="m34 42-20-20 25 3-3-17 17 17z"/><path d="m94 41 20-20-25 3 3-17-17 17z"/><path d="M28 74 8 56l25 1-1-17 16 18z"/><path d="m100 74 20-18-25 1 1-17-16 18z"/></g><path d="M45 112h38" stroke="${CREAM}" stroke-width="8"/>`;
    case 125: return `<path d="M48 17q16-12 32 0l8 68-24 24-24-24z" fill="#c4a45e" stroke="${O}" stroke-width="7"/><path d="M64 17v92" stroke="#745c35" stroke-width="5"/><path d="M64 62 48 86m16-24 17 24" stroke="${CREAM}" stroke-width="4"/><g fill="#eee0b9" stroke="${O}" stroke-width="2"><ellipse cx="30" cy="87" rx="6" ry="10" transform="rotate(45 30 87)"/><ellipse cx="45" cy="105" rx="6" ry="10" transform="rotate(25 45 105)"/><ellipse cx="82" cy="105" rx="6" ry="10" transform="rotate(-25 82 105)"/><ellipse cx="99" cy="87" rx="6" ry="10" transform="rotate(-45 99 87)"/></g>`;
    case 126: return `<path d="M27 113 99 16" stroke="${BROWN}" stroke-width="7" stroke-linecap="round"/><g fill="${GREEN}" stroke="${O}" stroke-width="3"><path d="m36 101-24-4 20-9zM44 89l-25-5 21-8zM53 77l-25-5 21-8zM62 65l-24-5 20-8zM70 53l-23-6 20-7zM79 41l-21-7 18-6zM88 29l-18-8 16-4z"/><path d="m42 97 6 24 8-22zm9-13 7 24 7-22zm9-12 8 23 6-22zm10-13 9 22 5-21zm9-12 9 20 4-19zm9-12 8 17 4-16z"/></g>`;
    case 127: return `<path d="M16 78q15-25 38-14 2-33 29-30 19 3 13 27 27-7 32 17 2 24-28 23-10 25-34 12-13 18-32 5-16-12-2-40z" fill="#c18a4d" stroke="${O}" stroke-width="7"/><path d="M71 38Q75 9 97 8" stroke="${GREEN}" stroke-width="8"/><path d="M82 42q-13-29-29-22" fill="none" stroke="${LIGHT}" stroke-width="7"/><ellipse cx="96" cy="83" rx="22" ry="18" fill="${CREAM}" stroke="${O}" stroke-width="5"/><circle cx="96" cy="83" r="6" fill="${GOLD}"/>`;
    case 128: return `<path d="M64 14q14 22 10 34 31 8 30 38-2 35-40 35T24 86q-1-30 30-38-4-12 10-34z" fill="#eee6d3" stroke="${O}" stroke-width="7"/><path d="M64 47v70m0-68q-25 9-19 62m19-62q25 9 19 62" fill="none" stroke="#c5b899" stroke-width="5"/><path d="M28 96q14-19 31-5-6 27-27 28z" fill="${CREAM}" stroke="${O}" stroke-width="5"/>`;
    case 129: return `<path d="M20 24q47-16 79 5L82 97q-28 24-55 2z" fill="#779553" stroke="${O}" stroke-width="7"/><path d="M31 31 91 42M27 46l60 11M24 62l59 11M23 78l55 10" stroke="#abc27d" stroke-width="4"/><path d="M83 111h39q-5-30-20-30-15 2-19 30z" fill="#77a65e" stroke="${O}" stroke-width="6"/><path d="M91 101h23" stroke="#b9d99c" stroke-width="4"/>`;
    case 130: return `<path d="M64 116V29m0 27L31 37m33 38 34-25M64 92 32 76m32 16 31-13" stroke="${GREEN}" stroke-width="6"/><g fill="#93a88d" stroke="${O}" stroke-width="5"><path d="M31 37Q5 14 11 52q21 22 20-15z"/><path d="M98 50q25-25 23 12-19 25-23-12z"/><path d="M32 76Q8 53 11 89q20 23 21-13z"/><path d="M95 79q24-22 22 13-19 22-22-13z"/></g><path d="M20 39 31 37m77 17-10-4M21 79l11-3m73 6-10-3" stroke="${CREAM}" stroke-width="3"/>`;
    case 131: return `<path d="M18 77q13-25 37-13 5-31 29-27 19 5 10 28 27-5 29 19 0 23-28 18-14 25-35 8-15 15-32 3-17-13-10-36z" fill="${ORANGE}" stroke="${O}" stroke-width="7"/><g fill="#ffc04a" stroke="${O}" stroke-width="5"><circle cx="35" cy="42" r="18"/><circle cx="93" cy="112" r="17"/></g><circle cx="35" cy="42" r="7" fill="${ORANGE}"/><circle cx="93" cy="112" r="7" fill="${ORANGE}"/>`;
    case 132: return `<path d="M15 39q46-35 96 3-5 53-58 69-35-15-38-72z" fill="#9b663d" stroke="${O}" stroke-width="7"/><path d="M24 46q43-26 77 0-12 36-51 53-21-18-26-53z" fill="${CREAM}" stroke="#60412d" stroke-width="4"/><path d="M33 52q15-15 28 1-1 21-17 26-14-9-11-27zm34 3q14-15 26 0-2 20-17 25-13-9-9-25z" fill="#67432e" stroke="${O}" stroke-width="4"/><path d="M17 38 7 21m104 21 10-16" stroke="${GREEN}" stroke-width="6"/>`;
    case 133: return `<path d="M64 117V43m0 14L37 30m27 27 27-27M64 44 49 17m15 27 15-27" stroke="${GREEN}" stroke-width="4"/><g fill="#9c7c43" stroke="${O}" stroke-width="3"><ellipse cx="34" cy="27" rx="5" ry="9" transform="rotate(-48 34 27)"/><ellipse cx="48" cy="15" rx="5" ry="9" transform="rotate(-25 48 15)"/><ellipse cx="64" cy="10" rx="5" ry="9"/><ellipse cx="80" cy="15" rx="5" ry="9" transform="rotate(25 80 15)"/><ellipse cx="94" cy="27" rx="5" ry="9" transform="rotate(48 94 27)"/></g><g fill="#ad8b50" stroke="${O}" stroke-width="3"><ellipse cx="29" cy="91" rx="7" ry="12" transform="rotate(55 29 91)"/><ellipse cx="57" cy="99" rx="7" ry="12" transform="rotate(15 57 99)"/><ellipse cx="89" cy="91" rx="7" ry="12" transform="rotate(-48 89 91)"/></g>`;
    case 134: return `<g fill="${DARK_BROWN}" stroke="${O}" stroke-width="5"><path d="M20 105 43 45l13 5-23 61z"/><path d="M48 111 61 38l14 3-13 73z"/><path d="M79 111 82 48l14 1-3 64z"/></g><g fill="#7d5034" stroke="${O}" stroke-width="5"><path d="M32 43q13-19 27 2l-8 15-20-4z"/><path d="M53 35q15-20 30 1l-8 15-22-4z"/><path d="M74 45q16-18 30 3l-10 14-21-5z"/></g>`;
    case 135: return `<path d="M64 116V47m0 9L40 34m24 22 24-22" stroke="${GREEN}" stroke-width="5"/><path d="M64 47q-22-6-24-24 20-8 24 14 4-22 24-14-2 18-24 24z" fill="${GOLD}" stroke="${O}" stroke-width="5"/><g fill="#b28c2d" stroke="${O}" stroke-width="3"><circle cx="22" cy="84" r="8"/><circle cx="44" cy="96" r="8"/><circle cx="68" cy="82" r="8"/><circle cx="91" cy="99" r="8"/><circle cx="108" cy="78" r="8"/></g>`;
    case 136: return `<path d="M15 57q4-41 49-45 45 4 49 45-18 5-31 19 12 17 8 36-17-13-26-30-9 17-26 30-4-19 8-36-13-14-31-19z" fill="#a7523d" stroke="${O}" stroke-width="7" stroke-linejoin="round"/><path d="M64 17v65M20 54l44 28m44-28L64 82" stroke="#6b352d" stroke-width="5"/><g fill="${RED}" stroke="${O}" stroke-width="3"><circle cx="43" cy="53" r="8"/><circle cx="64" cy="44" r="8"/><circle cx="85" cy="53" r="8"/><circle cx="53" cy="70" r="8"/><circle cx="75" cy="70" r="8"/></g>`;
    case 137: return `<path d="M64 116V45m0 12L38 34m26 23 26-23M64 45 50 20m14 25 14-25" stroke="#70945e" stroke-width="5"/><g fill="#d8dbc4" stroke="${O}" stroke-width="2"><circle cx="35" cy="31" r="7"/><circle cx="49" cy="18" r="7"/><circle cx="64" cy="12" r="7"/><circle cx="79" cy="18" r="7"/><circle cx="93" cy="31" r="7"/></g><g fill="#8a744e" stroke="${O}" stroke-width="3"><ellipse cx="30" cy="89" rx="5" ry="9"/><ellipse cx="50" cy="99" rx="5" ry="9" transform="rotate(20 50 99)"/><ellipse cx="75" cy="91" rx="5" ry="9" transform="rotate(-15 75 91)"/><ellipse cx="99" cy="101" rx="5" ry="9" transform="rotate(25 99 101)"/></g>`;
    case 138: return `<path d="M31 116 88 13m-39 72L24 67m36-2 33-18M44 94l-27 4m52-50 26-22m-55 80 30 7" stroke="${GREEN}" stroke-width="6" stroke-linecap="round"/><g fill="${LIGHT}" stroke="${O}" stroke-width="3"><path d="M24 67Q5 48 8 76q17 12 16-9z"/><path d="M92 47q26-12 17 14-20 8-17-14z"/><path d="M17 98Q2 83 4 107q16 8 13-9z"/><path d="M95 26q21-13 17 11-18 9-17-11z"/><path d="M69 112q20-6 12 14-16 3-12-14z"/></g>`;
    default: throw new Error(`Missing Spice art for item ${id}.`);
  }
}

function escapeXml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

const catalog = loadLegacyCatalog();
fs.mkdirSync(OUTPUT, { recursive: true });
const expected = new Set(SPICE_ICON_ITEM_IDS.map((id) => `item-${id}.svg`));
for (const filename of fs.readdirSync(OUTPUT)) {
  if (filename.endsWith('.svg') && !expected.has(filename)) fs.rmSync(path.join(OUTPUT, filename));
}
for (const id of SPICE_ICON_ITEM_IDS) {
  const item = catalog.byId.get(id);
  if (!item || item.mineTypeId !== 6 || item.repairedItemId !== null) {
    throw new Error(`Invalid Spice icon item ${id}.`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(item.name)}</title>
  <desc id="desc">${escapeXml(descriptions.get(id))}</desc>
  ${art(id)}
</svg>
`;
  fs.writeFileSync(path.join(OUTPUT, `item-${id}.svg`), svg);
}
console.log(`Generated ${SPICE_ICON_ITEM_IDS.length} Spice SVGs in ${OUTPUT}.`);
