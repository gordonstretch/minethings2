import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WOOD_CATALOG } from '../src/legacy-catalog.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'public', 'img', 'items', 'wood');
const palettes = {
  1: ['#9a6938', '#54351f', '#d4a365'],
  2: ['#b97a35', '#60401f', '#ecc27a'],
  3: ['#743d27', '#321e18', '#c68a5c'],
  4: ['#59636a', '#252b2e', '#c1ccd0'],
  5: ['#74459a', '#321d49', '#e1b4ff'],
  6: ['#df851d', '#6b310f', '#ffe19a']
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

function screwsSvg(item) {
  return document(item.name, item.description, `<g fill="none" stroke="#46545a" stroke-width="8" stroke-linecap="round" stroke-linejoin="round">
    <path d="M30 25l35 35-30 30"/><path d="M66 21l36 36-31 31"/>
  </g>
  <g stroke="#d9e1df" stroke-width="4" stroke-linecap="round">
    <path d="M24 19l12 12M36 19L24 31M60 15l12 12M72 15L60 27"/>
    <path d="M38 86l12 4-16 4 12 4-15 4M74 84l12 4-16 4 12 4-15 4"/>
  </g>`);
}

function woodSvg(item, variant) {
  if (item.id === WOOD_CATALOG.screwItemId) return screwsSvg(item);
  const [wood, dark, light] = palettes[item.rarity];
  const grain = `fill="none" stroke="${light}" stroke-width="3" stroke-linecap="round" opacity=".82"`;
  const shapes = [
    `<path fill="${wood}" stroke="${dark}" stroke-width="5" stroke-linejoin="round" d="M14 39l92-14 8 58-92 20z"/><path ${grain} d="M28 51c18-8 45-11 67-12M31 67c15-7 43-9 67-10M34 83c19-8 42-9 62-10"/><path fill="${light}" d="M23 43l8-1 8 57-8 2z" opacity=".55"/>`,
    `<g transform="rotate(-9 64 64)"><path fill="${wood}" stroke="${dark}" stroke-width="5" d="M20 24h36v83H20zM68 16h38v91H68z"/><path ${grain} d="M30 34v62M43 31v66M79 27v68M94 25v71"/></g>`,
    `<path fill="${wood}" stroke="${dark}" stroke-width="5" stroke-linejoin="round" d="M18 74L77 17l33 34-59 58z"/><path ${grain} d="M35 77l50-48M45 88l50-48M55 98l48-46"/>`,
    `<path fill="${wood}" stroke="${dark}" stroke-width="5" d="M21 43c0-13 19-23 43-23s43 10 43 23v42c0 13-19 23-43 23S21 98 21 85z"/><ellipse cx="64" cy="43" rx="43" ry="23" fill="${light}" stroke="${dark}" stroke-width="5"/><g ${grain}><ellipse cx="64" cy="43" rx="28" ry="14"/><ellipse cx="64" cy="43" rx="13" ry="7"/><path d="M31 61c20 9 47 9 66 0M31 78c20 9 47 9 66 0"/></g>`,
    `<path fill="${wood}" stroke="${dark}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" d="M24 103c26-21 28-51 24-81l20 27 27-20-9 34 24 18-37 2-17 26z"/><path ${grain} d="M43 92c18-20 24-41 20-61M58 78l27-31M63 84l31-3"/>`
  ];
  return document(item.name, item.description, shapes[variant % shapes.length]);
}

const mineSvg = document('Wood Mine', 'A Calbuco lumber mine marked by a saw blade, tree, and cut timber.', `<path fill="#a86d31" stroke="#4c2e1a" stroke-width="5" stroke-linejoin="round" d="M12 89l70-17 8 30-70 16z"/>
  <path fill="none" stroke="#e6b66d" stroke-width="3" stroke-linecap="round" d="M25 95l49-12M29 105l49-12"/>
  <path fill="#4e7650" stroke="#243b29" stroke-width="5" stroke-linejoin="round" d="M69 78V51H55l18-17H62L84 9l22 25H95l18 17H98v24z"/>
  <circle cx="43" cy="51" r="24" fill="#d3d9d7" stroke="#475357" stroke-width="5"/>
  <path fill="#475357" d="M43 20l5 19 17-11-10 18 20 4-20 5 10 18-17-11-5 20-5-20-17 11 10-18-20-5 20-4-10-18 17 11z"/>
  <circle cx="43" cy="51" r="7" fill="#f2a024"/>`);

fs.mkdirSync(outputDirectory, { recursive: true });
fs.writeFileSync(path.join(outputDirectory, 'mine.svg'), mineSvg);
for (const item of WOOD_CATALOG.items) {
  const filename = item.icon.split('/').at(-1);
  const tierItems = WOOD_CATALOG.items.filter((candidate) => candidate.rarity === item.rarity);
  fs.writeFileSync(path.join(outputDirectory, filename), woodSvg(item, tierItems.indexOf(item)));
}

console.log(`Generated ${WOOD_CATALOG.items.length + 1} transparent Wood SVG assets in ${outputDirectory}.`);
