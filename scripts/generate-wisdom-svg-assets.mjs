import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WISDOM_CATALOG } from '../src/legacy-catalog.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'public', 'img', 'items', 'wisdom');
const palettes = {
  1: ['#7b8790', '#27333a', '#d9e0e3'],
  2: ['#638352', '#263c2c', '#c9dfa7'],
  3: ['#398699', '#173d49', '#afe4e8'],
  4: ['#a64f42', '#4b211d', '#f2b79d'],
  5: ['#8d48a0', '#3b1e48', '#e4b4f0'],
  6: ['#df8b16', '#5d2d08', '#ffe29a']
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

function wisdomSvg(item, variant) {
  const [ink, dark, light] = palettes[item.rarity];
  const motifs = [
    `<path fill="${light}" stroke="${dark}" stroke-width="5" stroke-linejoin="round" d="M25 17h69l10 12v80H34L24 98z"/>
    <path fill="none" stroke="${ink}" stroke-width="5" stroke-linecap="round" d="M43 42h43M43 57h34M43 72h43M43 87h26"/>
    <path fill="${ink}" d="M19 91l10-4 7 8-7 10-10-4z"/>`,
    `<path fill="${light}" stroke="${dark}" stroke-width="5" stroke-linejoin="round" d="M14 34c23-13 39-9 50 2 11-11 27-15 50-2v72c-20-10-36-7-50 5-14-12-30-15-50-5z"/>
    <path fill="none" stroke="${ink}" stroke-width="4" stroke-linecap="round" d="M64 38v66M27 52c12-5 21-4 28 1M27 68c12-5 21-4 28 1M73 53c8-5 17-6 28-1M73 69c8-5 17-6 28-1"/>`,
    `<circle cx="64" cy="64" r="43" fill="${light}" stroke="${dark}" stroke-width="5"/>
    <path fill="${ink}" stroke="${dark}" stroke-width="3" stroke-linejoin="round" d="M75 53l22-21-13 29 12 11-18 4-6 18-11-12-29 14 21-23z"/>
    <circle cx="64" cy="64" r="7" fill="${dark}"/>`,
    `<g fill="${light}" stroke="${dark}" stroke-width="5"><circle cx="25" cy="70" r="13"/><circle cx="64" cy="25" r="13"/><circle cx="103" cy="70" r="13"/><circle cx="64" cy="103" r="13"/></g>
    <path fill="none" stroke="${ink}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" d="M35 60l19-24M74 35l19 25M91 82l-17 12M54 94L37 81"/>
    <circle cx="64" cy="64" r="12" fill="${ink}" stroke="${dark}" stroke-width="4"/>`,
    `<path fill="${light}" stroke="${dark}" stroke-width="5" stroke-linejoin="round" d="M19 24h90L95 52l14 27H78l-14 30-14-30H19l14-27z"/>
    <path fill="none" stroke="${ink}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" d="M34 39h60M45 55h38M37 70h21M70 70h21"/>
    <circle cx="64" cy="91" r="6" fill="${ink}"/>`
  ];
  return document(item.name, item.description, motifs[variant % motifs.length]);
}

const mineSvg = document('Wisdom Mine', 'A Dempo mine of tactical haiku and hard-won strategy.', `<path fill="#f5e6b9" stroke="#422a18" stroke-width="5" stroke-linejoin="round" d="M12 36c22-12 39-9 52 3 13-12 30-15 52-3v72c-21-10-38-7-52 6-14-13-31-16-52-6z"/>
  <path fill="none" stroke="#d88717" stroke-width="5" stroke-linecap="round" d="M64 40v68M26 55c12-5 22-4 29 2M26 73c12-5 22-4 29 2M73 57c8-6 18-7 29-2M73 75c8-6 18-7 29-2"/>
  <path fill="#d88717" d="M64 7l5 15 15 5-15 5-5 15-5-15-15-5 15-5z"/>`);

fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(path.join(outputDirectory, 'mine.svg'), mineSvg);
for (const item of WISDOM_CATALOG.items) {
  const filename = item.icon.split('/').at(-1);
  const tierItems = WISDOM_CATALOG.items.filter((candidate) => candidate.rarity === item.rarity);
  fs.writeFileSync(path.join(outputDirectory, filename), wisdomSvg(item, tierItems.indexOf(item)));
}

console.log(`Generated ${WISDOM_CATALOG.items.length + 1} transparent Wisdom SVG assets in ${outputDirectory}.`);
