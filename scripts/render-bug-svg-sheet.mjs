import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const iconDirectory = path.join(root, 'public', 'img', 'items', 'bugs');
const outputPath = path.resolve(process.argv[2]
  ?? path.join(os.tmpdir(), 'minethings-bug-icons.png'));
const icons = fs.readdirSync(iconDirectory)
  .filter((filename) => /^bug-\d+\.svg$/u.test(filename))
  .sort((left, right) => Number(left.match(/\d+/u)[0]) - Number(right.match(/\d+/u)[0]))
  .map((filename) => {
    const svg = fs.readFileSync(path.join(iconDirectory, filename), 'utf8');
    const title = /<title[^>]*>([^<]+)<\/title>/u.exec(svg)?.[1] ?? filename;
    return {
      filename,
      title,
      src: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
    };
  });

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1800, height: 1000 } });
  await page.setContent(`<!doctype html><html><head><style>
    * { box-sizing: border-box; }
    body { margin: 0; padding: 20px; background: #b7b2a6; color: #252923; font: 14px Arial, sans-serif; }
    main { display: grid; grid-template-columns: repeat(6, 1fr); gap: 12px; }
    article { overflow: hidden; border: 2px solid #3b403a; border-radius: 8px; background: #fffaf0; box-shadow: 0 3px 8px #0003; }
    h2 { overflow: hidden; margin: 0; padding: 7px 9px; background: #ece1c6; border-bottom: 1px solid #b9ad94; font: bold 15px Georgia, serif; text-overflow: ellipsis; white-space: nowrap; }
    .samples { display: grid; grid-template-columns: 1fr 1fr; min-height: 110px; }
    .sample { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 7px; }
    .sample.dark { background: #171a18; }
    .large { width: 76px; height: 76px; object-fit: contain; }
    .small { width: 28px; height: 28px; object-fit: contain; filter: grayscale(1) contrast(1.12); }
  </style></head><body><main>${icons.map((icon) => `<article><h2>${icon.filename.slice(4, -4)} &middot; ${icon.title}</h2><div class="samples"><div class="sample"><img class="large" src="${icon.src}"><img class="small" src="${icon.src}"></div><div class="sample dark"><img class="large" src="${icon.src}"><img class="small" src="${icon.src}"></div></div></article>`).join('')}</main></body></html>`);
  await page.locator('img').first().waitFor({ state: 'visible' });
  await page.screenshot({ path: outputPath, fullPage: true });
} finally {
  await browser.close();
}

console.log(outputPath);
