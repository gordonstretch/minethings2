import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { loadLegacyCatalog } from '../src/legacy-catalog.js';
import { MOD_ICON_ITEM_IDS } from '../src/mod-icons.js';
import { OIL_ICON_ITEM_IDS } from '../src/oil-icons.js';
import { ORE_ICON_ITEM_IDS } from '../src/ore-icons.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ITEM_ROOT = path.join(ROOT, 'public', 'img', 'items');
const OUTPUT = path.resolve(process.argv[2]
  ?? path.join(os.tmpdir(), 'minethings-oil-ore-mod-icons.png'));
const catalog = loadLegacyCatalog();

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function iconEntry(family, itemId) {
  const filename = `item-${itemId}.svg`;
  const absolutePath = path.join(ITEM_ROOT, family, filename);
  if (!fs.existsSync(absolutePath)) throw new Error(`Missing icon asset ${absolutePath}`);
  const item = catalog.byId.get(itemId);
  if (!item) throw new Error(`Missing catalog item ${itemId}`);
  const svg = fs.readFileSync(absolutePath, 'utf8');
  return {
    family,
    id: itemId,
    name: item.name,
    rarity: item.rarity,
    src: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
  };
}

const sections = [
  {
    title: 'Oil and Ore resources',
    note: 'Standalone resource silhouettes',
    entries: [
      ...OIL_ICON_ITEM_IDS.map((itemId) => iconEntry('oil', itemId)),
      ...ORE_ICON_ITEM_IDS.map((itemId) => iconEntry('ore', itemId))
    ]
  },
  ...[1, 2, 3, 4, 5, 6].map((rarity) => ({
    title: `Tier ${rarity} Mods`,
    note: `${catalog.rarityNames[rarity]} · ${catalog.settings.rarity_color_names[rarity]}`,
    entries: MOD_ICON_ITEM_IDS.map((itemId) => iconEntry('mods', itemId))
      .filter((entry) => entry.rarity === rarity)
  }))
];

function card(entry) {
  const family = entry.family === 'mods' ? 'Mod' : entry.family[0].toUpperCase() + entry.family.slice(1);
  return `<article class="card rarity-${entry.rarity}">
    <header>
      <div class="identity"><span class="family">${escapeHtml(family)}</span><span class="id">#${entry.id}</span></div>
      <h2>${escapeHtml(entry.name)}</h2>
    </header>
    <div class="samples">
      <div class="sample light" aria-label="Light background sample">
        <img class="large" src="${entry.src}" alt="">
        <img class="small" src="${entry.src}" alt="">
      </div>
      <div class="sample dark" aria-label="Dark background sample">
        <img class="large" src="${entry.src}" alt="">
        <img class="small" src="${entry.src}" alt="">
      </div>
    </div>
  </article>`;
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Oil, Ore, and Mod icon audit</title>
<style>
  * { box-sizing: border-box; }
  html { background: #a8a396; }
  body { margin: 0; padding: 24px; color: #242824; background: #b8b3a7;
    font-family: Arial, sans-serif; }
  .page-header { display: flex; align-items: end; justify-content: space-between; gap: 24px;
    margin: 0 0 18px; padding: 16px 20px; color: #f7eed9; background: #171c19;
    border-top: 5px solid #f3981f; }
  .page-header h1 { margin: 0; font: 900 30px/1 Georgia, serif; }
  .page-header p { margin: 0; color: #d1c8b4; font-weight: 700; }
  section { margin: 0 0 22px; }
  .section-header { display: flex; align-items: baseline; gap: 12px; margin: 0 0 9px;
    padding: 7px 10px; color: #f8f0df; background: #343a35; border-left: 5px solid #f3981f; }
  .section-header h2 { margin: 0; font: 900 19px/1 Georgia, serif; }
  .section-header p { margin: 0; color: #d7ceba; font-size: 12px; font-weight: 700; }
  .grid { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 10px; }
  .card { min-width: 0; overflow: hidden; background: #f9f4e7; border: 2px solid #3a403b;
    box-shadow: 0 2px 6px #0002; }
  .card > header { min-height: 55px; padding: 6px 9px 7px; background: #eee4cc;
    border-bottom: 1px solid #bcb29e; }
  .identity { display: flex; align-items: center; justify-content: space-between; gap: 8px;
    margin-bottom: 3px; color: #5d625c; font-size: 10px; font-weight: 900;
    letter-spacing: .09em; text-transform: uppercase; }
  .id { color: #8d4b12; }
  .card h2 { overflow: hidden; margin: 0; font: 700 14px/1.15 Georgia, serif;
    text-overflow: ellipsis; white-space: nowrap; }
  .samples { display: grid; grid-template-columns: 1fr 1fr; min-height: 104px; }
  .sample { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 7px; }
  .sample + .sample { border-left: 1px solid #7f857e; }
  .sample.light { background: #fffaf0; }
  .sample.dark { background: #151a18; }
  img { display: block; object-fit: contain; }
  .large { width: 72px; height: 72px; }
  .small { width: 30px; height: 30px; }
</style>
</head>
<body>
  <header class="page-header">
    <h1>Oil, Ore, and Mod Icons</h1>
    <p>Large 72 px · inventory 30 px · light and dark grounds · ${sections.reduce((sum, section) => sum + section.entries.length, 0)} assets</p>
  </header>
  ${sections.map((section) => `<section>
    <header class="section-header"><h2>${escapeHtml(section.title)}</h2><p>${escapeHtml(section.note)}</p></header>
    <div class="grid">${section.entries.map(card).join('')}</div>
  </section>`).join('')}
</body>
</html>`;

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({
    viewport: { width: 2100, height: 1200 },
    deviceScaleFactor: 1
  });
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: OUTPUT, fullPage: true });
} finally {
  await browser.close();
}

console.log(`Rendered ${sections.reduce((sum, section) => sum + section.entries.length, 0)} icons to ${OUTPUT}`);
