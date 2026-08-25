import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildProduction } from './build-production.mjs';

const result = buildProduction('tmp/production-smoke');
const output = result.output;
try {
  assert.equal(fs.existsSync(path.join(output, 'tp')), false);
  assert.equal(fs.existsSync(path.join(output, 'node_modules', 'nodemailer', 'package.json')), true);
  const unsafeLegacyFiles = [];
  const inspect = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) inspect(filename);
      else if (/\.(?:php|ctp|config|htaccess)$/i.test(entry.name)) unsafeLegacyFiles.push(filename);
    }
  };
  inspect(path.join(output, 'td'));
  assert.deepEqual(unsafeLegacyFiles, []);
  const moduleUrl = `${pathToFileURL(path.join(output, 'src', 'server.js')).href}?smoke=${Date.now()}`;
  const { createApp } = await import(moduleUrl);
  const server = createApp({
    databaseFile: path.join(output, 'data', 'smoke.sqlite'),
    legacyJsonFile: null,
    production: true,
    backgroundMaintenance: false,
    emailClient: { async sendVerification() {} }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).status, 'ok');
    assert.equal((await fetch(`${base}/app.css`)).status, 200);
    assert.equal((await fetch(`${base}/node/navigation.js`)).status, 200);
    assert.equal((await fetch(`${base}/node/favicon.svg`)).status, 200);
    assert.equal((await fetch(`${base}/app/webroot/index.php`)).status, 404);
    assert.equal((await fetch(`${base}/portal/img/colors.jpg`)).status, 404);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
  console.log(JSON.stringify({ status: 'ok', files: result.files, bytes: result.bytes }, null, 2));
} finally {
  fs.rmSync(output, { recursive: true, force: true });
}
