import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const gameWebroot = path.join(root, 'td', 'public_html', 'app', 'webroot');
const imageExtensions = new Set(['.gif', '.ico', '.jpeg', '.jpg', '.png', '.webp']);

function filesUnder(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filename = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(filename) : [filename];
  });
}

function imageFiles(webroot) {
  return filesUnder(path.join(webroot, 'img')).filter((filename) => imageExtensions.has(path.extname(filename).toLowerCase()));
}

function localCssReferences(webroot, fallbackWebroot = webroot) {
  const references = [];
  for (const filename of filesUnder(path.join(webroot, 'css')).filter((candidate) => path.extname(candidate) === '.css')) {
    const css = fs.readFileSync(filename, 'utf8');
    for (const match of css.matchAll(/url\(\s*(['"]?)([^)'"\s]+)\1\s*\)/gi)) {
      const reference = match[2].split(/[?#]/)[0];
      if (!reference || /^(?:data:|https?:|\/\/)/i.test(reference)) continue;
      const resolved = reference.startsWith('/')
        ? path.join(webroot, reference.replace(/^\/+/, ''))
        : path.resolve(path.dirname(filename), reference);
      if (imageExtensions.has(path.extname(resolved).toLowerCase())) {
        const fallback = path.join(fallbackWebroot, 'img', reference.replace(/^.*?(?:img\/)/, ''));
        references.push({ source: path.relative(root, filename), reference, resolved: fs.existsSync(resolved) ? resolved : fallback });
      }
    }
  }
  return references;
}

function staticViewReferences(appRoot, webroot) {
  const references = [];
  const sourceFiles = filesUnder(path.join(appRoot, 'views')).filter((filename) => /\.(?:ctp|inc|php)$/i.test(filename));
  for (const filename of sourceFiles) {
    const source = fs.readFileSync(filename, 'latin1');
    for (const match of source.matchAll(/(?:\$?html|\$?this->Html)->image\(\s*(['"])([^'"]+)\1/gi)) {
      const reference = match[2];
      if (!reference || /^(?:data:|https?:|\/\/)/i.test(reference)) continue;
      if (!imageExtensions.has(path.extname(reference).toLowerCase())) continue;
      const resolved = path.join(webroot, 'img', reference.replace(/^\/+/, ''));
      references.push({ source: path.relative(root, filename), reference, resolved });
    }
  }
  return references;
}

const gameImages = imageFiles(gameWebroot);
const references = [
  ...localCssReferences(gameWebroot),
  ...staticViewReferences(path.join(root, 'td', 'public_html', 'app'), gameWebroot)
];
const missing = references.filter(({ resolved }) => !fs.existsSync(resolved));

console.log(JSON.stringify({
  gameImages: gameImages.length,
  staticReferences: references.length,
  missing: missing.map(({ source, reference }) => ({ source, reference }))
}, null, 2));

if (missing.length) process.exitCode = 1;
