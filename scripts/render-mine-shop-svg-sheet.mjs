import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSET_DIRECTORY = path.join(ROOT, 'public', 'img', 'items', 'mines');
const OUTPUT = path.resolve(process.argv[2]
  ?? path.join(os.tmpdir(), 'minethings-mine-shop-icons.png'));

function escapeHtml(value) {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

const entries = fs.readdirSync(ASSET_DIRECTORY)
  .filter((filename) => /^mine-\d+\.svg$/u.test(filename))
  .sort((left, right) => Number(left.match(/\d+/u)[0]) - Number(right.match(/\d+/u)[0]))
  .map((filename) => {
    const svg = fs.readFileSync(path.join(ASSET_DIRECTORY, filename), 'utf8');
    const title = svg.match(/<title\b[^>]*>([^]*?)<\/title>/u)?.[1] ?? filename;
    return {
      filename,
      title,
      src: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
    };
  });

function card(entry) {
  return `<article class="card">
    <header><strong>${escapeHtml(entry.title)}</strong><span>${escapeHtml(entry.filename)}</span></header>
    <div class="samples">
      <figure class="cream"><img src="${entry.src}" alt=""><figcaption>Cream</figcaption></figure>
      <figure class="dark"><img src="${entry.src}" alt=""><figcaption>Dark</figcaption></figure>
    </div>
  </article>`;
}

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Mine Shop SVG audit</title>
<style>
  * { box-sizing: border-box; }
  html { background: #85877f; }
  body { margin: 0; padding: 24px; color: #252a25; background: #aaa89f;
    font-family: Arial, sans-serif; }
  .page-header { margin: 0 0 16px; padding: 16px 18px; color: #f8efdc;
    background: #151a17; border-top: 5px solid #f3981f; }
  .page-header h1 { margin: 0 0 5px; font: 900 28px/1 Georgia, serif; }
  .page-header p { margin: 0; color: #d7cdb7; font-size: 13px; font-weight: 700; }
  .grid { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px; }
  .card { overflow: hidden; background: #eee4cc; border: 1px solid #444b45;
    box-shadow: 0 3px 9px #0003; }
  .card > header { display: flex; align-items: baseline; justify-content: space-between;
    gap: 8px; min-height: 45px; padding: 8px 10px; border-bottom: 1px solid #a99f8b; }
  .card strong { font: 700 15px/1.2 Georgia, serif; }
  .card header span { color: #6b665a; font-size: 10px; font-weight: 800; }
  .samples { display: grid; grid-template-columns: 1fr 1fr; }
  figure { display: flex; min-height: 102px; align-items: center; justify-content: center;
    flex-direction: column; gap: 7px; margin: 0; }
  figure + figure { border-left: 1px solid #777d77; }
  .cream { background: #f4ead4; }
  .dark { background: #151a17; }
  img { display: block; width: 48px; height: 48px; object-fit: contain; }
  figcaption { padding: 2px 5px; color: #625d53; background: #f8f0dfcc;
    font-size: 9px; font-weight: 900; letter-spacing: .09em; text-transform: uppercase; }
  .dark figcaption { color: #ded4bf; background: #303731; }
</style>
</head>
<body>
  <header class="page-header">
    <h1>Mine Shop Icon QA</h1>
    <p>${entries.length} SVGs · exact 48px Shop size · cream and dark surfaces</p>
  </header>
  <main class="grid">${entries.map(card).join('')}</main>
</body>
</html>`;

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: OUTPUT, fullPage: true });
} finally {
  await browser.close();
}

console.log(`Rendered ${entries.length} Shop mine icons to ${OUTPUT}`);
