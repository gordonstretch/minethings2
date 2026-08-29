import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ELECTRONICS_CATALOG } from '../src/legacy-catalog.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'public', 'img', 'items', 'electronics');
const palettes = {
  1: ['#74858b', '#27363a', '#d7e1e2'],
  2: ['#4f8b63', '#183d29', '#bce7c7'],
  3: ['#287f9e', '#123d50', '#a9e6f0'],
  4: ['#b04c36', '#501e16', '#ffc0a4'],
  5: ['#974da8', '#431d4b', '#edb9f5'],
  6: ['#e49014', '#633407', '#ffe29a']
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

function electronicsSvg(item, variant) {
  const [bright, dark, light] = palettes[item.rarity];
  const motifs = [
    `<g fill="none" stroke="${dark}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M9 64h24m62 0h24M33 43v42l12 12h38l12-12V43L83 31H45z"/>
      <path d="M46 51h36v26H46z"/>
    </g><circle cx="64" cy="64" r="9" fill="${bright}"/><path fill="${light}" d="M52 57h24v14H52z"/>`,
    `<path fill="${light}" stroke="${dark}" stroke-width="5" stroke-linejoin="round" d="M23 22h82v84H23z"/>
    <g fill="${bright}" stroke="${dark}" stroke-width="3"><circle cx="43" cy="43" r="9"/><circle cx="84" cy="43" r="9"/><circle cx="43" cy="84" r="9"/><circle cx="84" cy="84" r="9"/></g>
    <path fill="none" stroke="${dark}" stroke-width="5" stroke-linecap="round" d="M52 43h23M43 52v23M84 52v23M52 84h23"/>`,
    `<path fill="${light}" stroke="${dark}" stroke-width="5" stroke-linejoin="round" d="M18 43h92v58H18z"/>
    <path fill="none" stroke="${bright}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" d="M30 82l17-19 15 10 18-25 18 13"/>
    <path fill="${dark}" d="M36 18h56v18H36z"/><circle cx="46" cy="27" r="4" fill="${bright}"/><circle cx="64" cy="27" r="4" fill="${bright}"/><circle cx="82" cy="27" r="4" fill="${bright}"/>`,
    `<circle cx="64" cy="64" r="40" fill="${light}" stroke="${dark}" stroke-width="5"/>
    <path fill="${bright}" stroke="${dark}" stroke-width="4" stroke-linejoin="round" d="M58 13h12l5 22 18-13 9 9-12 18 22 6v13l-22 5 12 19-9 9-18-13-5 22H58l-5-22-18 13-9-9 12-19-22-5V55l22-6-12-18 9-9 18 13z"/>
    <circle cx="64" cy="64" r="15" fill="${dark}"/><circle cx="64" cy="64" r="7" fill="${light}"/>`,
    `<path fill="${dark}" d="M34 28h60v72H34z"/><path fill="${light}" d="M43 39h42v38H43z"/>
    <g fill="${bright}"><circle cx="49" cy="87" r="5"/><circle cx="64" cy="87" r="5"/><circle cx="79" cy="87" r="5"/></g>
    <g fill="none" stroke="${dark}" stroke-width="5" stroke-linecap="round"><path d="M17 42h17M17 58h17M17 74h17M94 42h17M94 58h17M94 74h17"/><path d="M48 28V13M64 28V13M80 28V13M48 100v15M64 100v15M80 100v15"/></g>
    <path fill="none" stroke="${bright}" stroke-width="5" stroke-linecap="round" d="M49 65l9-12 8 8 13-14"/>`
  ];
  return document(item.name, item.description, motifs[variant % motifs.length]);
}

const mineSvg = document(
  'Electronic Devices Mine',
  'An Ebeko mine producing electronic components and devices for possible future gadgets.',
  `<path fill="#172f37" stroke="#66d9e8" stroke-width="5" stroke-linejoin="round" d="M31 27h66v74H31z"/>
  <path fill="#f2a11f" d="M47 43h34v42H47z"/>
  <g fill="none" stroke="#172f37" stroke-width="5" stroke-linecap="round"><path d="M55 52h18M55 64h18M55 76h10"/></g>
  <g fill="none" stroke="#66d9e8" stroke-width="5" stroke-linecap="round"><path d="M16 40h15M16 57h15M16 74h15M16 91h15M97 40h15M97 57h15M97 74h15M97 91h15"/><path d="M45 27V12M64 27V12M83 27V12M45 101v15M64 101v15M83 101v15"/></g>`
);

fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(path.join(outputDirectory, 'mine.svg'), mineSvg);
for (const item of ELECTRONICS_CATALOG.items) {
  const filename = item.icon.split('/').at(-1);
  const tierItems = ELECTRONICS_CATALOG.items.filter(
    (candidate) => candidate.rarity === item.rarity
  );
  fs.writeFileSync(path.join(outputDirectory, filename),
    electronicsSvg(item, tierItems.indexOf(item)));
}

console.log(`Generated ${ELECTRONICS_CATALOG.items.length + 1} transparent Electronic Devices SVG assets in ${outputDirectory}.`);
