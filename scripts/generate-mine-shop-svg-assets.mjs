import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SHOP_MINE_TYPE_IDS, STARTER_MINE_TYPE_IDS } from '../src/mine-icons.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAP_DIRECTORY = path.join(ROOT, 'public', 'img', 'map-icons');
const OUTPUT_DIRECTORY = path.join(ROOT, 'public', 'img', 'items', 'mines');
const STARTER_IDS = new Set(STARTER_MINE_TYPE_IDS);

fs.mkdirSync(OUTPUT_DIRECTORY, { recursive: true });

for (const mineTypeId of SHOP_MINE_TYPE_IDS) {
  if (STARTER_IDS.has(mineTypeId)) continue;
  const filename = `mine-${mineTypeId}.svg`;
  const source = fs.readFileSync(path.join(MAP_DIRECTORY, filename), 'utf8');
  const title = source.match(/\s*<title id="title">[^]*?<\/title>/u)?.[0];
  const description = source.match(/\s*<desc id="desc">[^]*?<\/desc>/u)?.[0];
  const body = source.match(/<desc id="desc">[^]*?<\/desc>([^]*?)<\/svg>/u)?.[1]?.trim();
  if (!title || !description || !body) {
    throw new Error(`Could not expand normalized Mine Shop artwork from ${filename}.`);
  }
  const output = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" role="img" aria-labelledby="title desc">${title}${description}
  <g transform="scale(2)">${body}</g>
</svg>
`;
  fs.writeFileSync(path.join(OUTPUT_DIRECTORY, filename), output);
}

console.log(`Generated ${SHOP_MINE_TYPE_IDS.length - STARTER_MINE_TYPE_IDS.length} normalized Mine Shop SVG icons.`);
