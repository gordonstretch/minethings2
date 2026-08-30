import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { loadLegacyCatalog } from '../src/legacy-catalog.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.resolve(process.argv[2]
  ?? path.join(os.tmpdir(), 'minethings-avatar-equipment-icons'));
const catalog = loadLegacyCatalog();

function icon(filename, item) {
  const svg = fs.readFileSync(filename, 'utf8');
  return {
    id: item.id,
    name: item.name,
    src: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  };
}

const sheets = [
  {
    name: 'equipment',
    icons: catalog.equipment.map((entry) => {
      const item = catalog.byId.get(entry.itemId);
      return icon(path.join(root, 'public', 'img', 'items', 'equipment',
        `equipment-${item.id}.svg`), item);
    })
  },
  ...catalog.avatarElementTypes.map((type) => ({
    name: `avatars-${type.name.toLowerCase()}`,
    icons: catalog.avatarElements.filter((entry) => entry.typeId === type.id).map((entry) => {
      const item = catalog.byId.get(entry.itemId);
      return icon(path.join(root, 'public', 'img', 'items', 'avatars',
        `avatar-${item.id}.svg`), item);
    })
  }))
];

fs.mkdirSync(outputDirectory, { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const sheet of sheets) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.setContent(`<!doctype html><html><head><style>
      * { box-sizing: border-box; }
      body { margin: 0; padding: 24px; background: #173748; color: #252923; font: 13px Arial, sans-serif; }
      h1 { margin: 0 0 18px; color: #fff4d7; font: italic 700 28px Georgia, serif; }
      main { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 12px; }
      article { display: grid; grid-template-columns: 96px 44px 1fr; align-items: center; min-height: 112px; overflow: hidden; border: 2px solid #292d29; border-radius: 10px; background: #fffaf0; box-shadow: 0 3px 8px #0004; }
      img { object-fit: contain; }
      .large { width: 96px; height: 96px; margin: 7px; }
      .small { width: 38px; height: 38px; }
      div { min-width: 0; padding: 8px; }
      strong { display: block; font: 700 14px Georgia, serif; }
      small { display: block; margin-top: 5px; color: #68706b; }
    </style></head><body><h1>${sheet.name}</h1><main>${sheet.icons.map((entry) =>
      `<article><img class="large" src="${entry.src}" alt=""><img class="small" src="${entry.src}" alt=""><div><strong>${entry.name}</strong><small>#${entry.id}</small></div></article>`
    ).join('')}</main></body></html>`);
    await page.locator('img').first().waitFor({ state: 'visible' });
    const failed = await page.locator('img').evaluateAll((images) =>
      images.filter((image) => !image.complete || image.naturalWidth === 0).length);
    if (failed) throw new Error(`${sheet.name} contains ${failed} undecodable SVGs.`);
    await page.screenshot({ path: path.join(outputDirectory, `${sheet.name}.png`), fullPage: true });
    await page.close();
  }
} finally {
  await browser.close();
}

console.log(outputDirectory);
