import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const liveClient = fs.readFileSync(path.resolve('public/live-updates.js'), 'utf8');
const streams = new Set();
let server;
let base;
let revision = 1;

function previewMarkup(invalid = false) {
  return `<section id="vehicle-loadout-editor" data-live-preview-scope>
    <section class="loadout-preview ${invalid ? 'preview-invalid' : 'preview-valid'}"
      data-live-preview-panel aria-live="polite">
      <h2>Proposed loadout</h2>
      <p class="preview-verdict">${invalid ? 'Cannot commit this loadout.' : 'Ready to commit.'}</p>
    </section>
    <form data-live-preview-form>
      <label>Weapons <input name="weapon_7" type="number" value="1"></label>
      ${invalid ? '' : '<input type="hidden" name="previewToken" value="fixture-token" data-preview-binding>'}
      ${invalid ? '' : '<button name="intent" value="commit" data-preview-commit>Commit this loadout</button>'}
    </form>
  </section>`;
}

function documentMarkup(invalid = false) {
  return `<!doctype html><html><head><title>Preview fixture</title></head><body>
    <div id="login"></div><div id="navcontainer"></div><div id="left"></div>
    <main id="content">${previewMarkup(invalid)}</main>
    <script src="/node/live-updates.js" data-live-revision="${revision}" defer></script>
  </body></html>`;
}

function broadcastChange() {
  revision += 1;
  const event = `event: change\ndata: ${JSON.stringify({ revision, scopes: ['vehicles'] })}\n\n`;
  for (const stream of streams) stream.write(event);
}

test.beforeAll(async () => {
  server = http.createServer((request, response) => {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/node/live-updates.js') {
      response.writeHead(200, { 'Content-Type': 'text/javascript' }).end(liveClient);
      return;
    }
    if (url.pathname === '/api/live-updates') {
      response.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      });
      streams.add(response);
      response.write(`event: ready\ndata: ${JSON.stringify({ revision })}\n\n`);
      request.on('close', () => streams.delete(response));
      return;
    }
    response.writeHead(200, { 'Content-Type': 'text/html' })
      .end(documentMarkup(url.searchParams.has('invalid')));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

test.afterAll(async () => {
  for (const stream of streams) stream.end();
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test('preserves a bound preview through live GET morphs and keeps edited previews stale', async ({ page }) => {
  await page.goto(base);
  const scope = page.locator('#vehicle-loadout-editor');
  await expect(scope.locator('[name="previewToken"]')).toHaveValue('fixture-token');
  await page.evaluate(() => { window.__previewScope = document.querySelector('#vehicle-loadout-editor'); });

  let updated = page.evaluate(() => new Promise((resolve) => {
    document.addEventListener('minethings:content-updated', resolve, { once: true });
  }));
  broadcastChange();
  await updated;
  expect(await page.evaluate(() => window.__previewScope
    === document.querySelector('#vehicle-loadout-editor'))).toBe(true);
  await expect(scope.getByRole('button', { name: 'Commit this loadout' })).toBeVisible();

  await scope.locator('[name="weapon_7"]').fill('2');
  await expect(scope.locator('[data-live-preview-panel]')).toHaveAttribute('data-preview-stale', 'true');
  await expect(scope.locator('.preview-verdict')).toContainText('Preview stale');
  await expect(scope.locator('[name="previewToken"]')).toHaveCount(0);
  await expect(scope.locator('[data-preview-commit]')).toHaveCount(0);

  updated = page.evaluate(() => new Promise((resolve) => {
    document.addEventListener('minethings:content-updated', resolve, { once: true });
  }));
  broadcastChange();
  await updated;
  await expect(scope.locator('[name="weapon_7"]')).toHaveValue('2');
  await expect(scope.locator('[data-live-preview-panel]')).toHaveAttribute('data-preview-stale', 'true');
  await expect(scope.locator('[name="previewToken"]')).toHaveCount(0);
  await expect(scope.locator('[data-preview-commit]')).toHaveCount(0);
});

test('marks an invalid tokenless preview stale when its form changes', async ({ page }) => {
  await page.goto(`${base}/?invalid=1`);
  const scope = page.locator('#vehicle-loadout-editor');
  await expect(scope.locator('[name="previewToken"]')).toHaveCount(0);
  await scope.locator('[name="weapon_7"]').fill('2');
  await expect(scope.locator('[data-live-preview-panel]')).toHaveAttribute('data-preview-stale', 'true');
  await expect(scope.locator('.preview-verdict')).toContainText('Preview stale');
});
