import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RELICS_CATALOG } from '../src/legacy-catalog.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'public', 'img', 'items', 'relics');
const palettes = {
  1: ['#8b8274', '#2a2723', '#ddd2bc'],
  2: ['#4f8764', '#162e21', '#b9dfc2'],
  3: ['#357f9d', '#132f3c', '#adddea'],
  4: ['#a84b39', '#411a15', '#efb09c'],
  5: ['#8d4d9b', '#351a3b', '#ddb3e5'],
  6: ['#d58918', '#4c2b08', '#f5d486']
};

const escapeXml = (value) => String(value).replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function document(title, description, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(title)}</title>
  <desc id="desc">${escapeXml(description)}</desc>
  ${body}
</svg>`;
}

function relicSvg(item, variant) {
  const [bright, dark, light] = palettes[item.rarity];
  const motifs = [
    `<circle cx="64" cy="64" r="43" fill="${bright}" stroke="${dark}" stroke-width="6"/>
    <circle cx="64" cy="64" r="29" fill="none" stroke="${light}" stroke-width="4" stroke-dasharray="5 6"/>
    <path d="M48 76q16-31 32 0M52 50l12-10 12 10-5 12H57z" fill="${dark}"/>`,
    `<path d="M28 18h72l-7 94H35z" fill="${light}" stroke="${dark}" stroke-width="6" stroke-linejoin="round"/>
    <path d="M45 43h38M42 61h44M40 79h48" stroke="${bright}" stroke-width="7" stroke-linecap="round"/>
    <path d="M64 26v78" stroke="${dark}" stroke-width="4" stroke-dasharray="7 6"/>`,
    `<path d="M64 14l31 20-7 67-24 13-24-13-7-67z" fill="${bright}" stroke="${dark}" stroke-width="6" stroke-linejoin="round"/>
    <path d="M48 55q16-18 32 0-16 14-32 0z" fill="${light}" stroke="${dark}" stroke-width="5"/>
    <path d="M51 83l13-12 13 12-13 16z" fill="${dark}"/>`,
    `<circle cx="46" cy="45" r="24" fill="none" stroke="${dark}" stroke-width="9"/>
    <path d="M62 62l43 43M78 78l-12 12M91 91l-12 12" fill="none" stroke="${dark}" stroke-width="10" stroke-linecap="round"/>
    <path d="M34 45q12-14 24 0-12 10-24 0z" fill="${bright}"/>`,
    `<path d="M14 64q50-49 100 0-50 49-100 0z" fill="${light}" stroke="${dark}" stroke-width="6" stroke-linejoin="round"/>
    <circle cx="64" cy="64" r="22" fill="${bright}" stroke="${dark}" stroke-width="6"/>
    <path d="M42 64h44" stroke="${dark}" stroke-width="7" stroke-linecap="round"/>
    <path d="M64 42v44" stroke="${light}" stroke-width="4" stroke-dasharray="4 5"/>`
  ];
  return document(item.name, item.description, motifs[variant % motifs.length]);
}

const mineSvg = document(
  'Relics Mine',
  'A sealed Fogo tomb entrance marked by the closed eye of a long-lost civilisation.',
  `<path d="M16 111V74q0-53 48-61 48 8 48 61v37z" fill="#27201c" stroke="#a96324" stroke-width="6" stroke-linejoin="round"/>
  <path d="M37 111V69q0-28 27-36 27 8 27 36v42z" fill="#080706" stroke="#d2a665" stroke-width="5"/>
  <path d="M45 62q19-18 38 0-19 17-38 0z" fill="#b34532" stroke="#d2a665" stroke-width="4"/>
  <path d="M50 62h28" stroke="#17110d" stroke-width="6" stroke-linecap="round"/>
  <path d="M25 86h13M90 86h13M28 51h14M86 51h14" stroke="#a96324" stroke-width="5" stroke-linecap="round"/>`
);

fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(path.join(outputDirectory, 'mine.svg'), mineSvg);
for (const item of RELICS_CATALOG.items) {
  const filename = item.icon.split('/').at(-1);
  const tierItems = RELICS_CATALOG.items.filter(
    (candidate) => candidate.rarity === item.rarity
  );
  fs.writeFileSync(path.join(outputDirectory, filename),
    relicSvg(item, tierItems.indexOf(item)));
}

console.log(`Generated ${RELICS_CATALOG.items.length + 1} transparent Relics SVG assets in ${outputDirectory}.`);
