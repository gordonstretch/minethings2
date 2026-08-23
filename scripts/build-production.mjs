import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNTIME_EXTENSIONS = new Set([
  '.css', '.gif', '.ico', '.jpeg', '.jpg', '.js', '.json', '.png', '.svg', '.webp', '.woff2'
]);

function safeOutputPath(relativeOutput) {
  const output = path.resolve(ROOT, relativeOutput);
  const relative = path.relative(ROOT, output);
  const first = relative.split(path.sep)[0];
  if (!relative || relative.startsWith('..') || !['dist', 'tmp'].includes(first)) {
    throw new Error('Production output must be inside this workspace under dist/ or tmp/.');
  }
  return output;
}

function copyFile(source, destination, totals) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
  totals.files += 1;
  totals.bytes += fs.statSync(source).size;
}

function copyTree(source, destination, totals, include) {
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) copyTree(sourcePath, destinationPath, totals, include);
    else if (entry.isFile() && include(sourcePath)) copyFile(sourcePath, destinationPath, totals);
  }
}

export function buildProduction(relativeOutput = 'dist') {
  const output = safeOutputPath(relativeOutput);
  fs.rmSync(output, { recursive: true, force: true });
  fs.mkdirSync(output, { recursive: true });
  const totals = { files: 0, bytes: 0 };
  for (const filename of [
    'package.json', 'package-lock.json', 'README.md', 'PRODUCTION_READINESS.md',
    'gallegodb_copy.sql'
  ]) {
    copyFile(path.join(ROOT, filename), path.join(output, filename), totals);
  }
  copyTree(path.join(ROOT, 'src'), path.join(output, 'src'), totals,
    (filename) => path.extname(filename).toLowerCase() === '.js');
  copyTree(path.join(ROOT, 'public'), path.join(output, 'public'), totals,
    (filename) => RUNTIME_EXTENSIONS.has(path.extname(filename).toLowerCase()));
  const packageLock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
  const runtimePackagePaths = Object.entries(packageLock.packages ?? {})
    .filter(([packagePath, metadata]) => packagePath.startsWith('node_modules/') && !metadata.dev)
    .map(([packagePath]) => packagePath)
    .sort((first, second) => first.length - second.length)
    .filter((packagePath, index, allPaths) => !allPaths.slice(0, index)
      .some((parentPath) => packagePath.startsWith(`${parentPath}/node_modules/`)));
  for (const packagePath of runtimePackagePaths) {
    const source = path.join(ROOT, packagePath);
    if (!fs.existsSync(source)) {
      throw new Error(`Install production dependency ${packagePath} before building.`);
    }
    copyTree(source, path.join(output, packagePath), totals, () => true);
  }
  const legacySource = path.join(ROOT, 'td', 'public_html', 'app', 'webroot');
  const legacyDestination = path.join(output, 'td', 'public_html', 'app', 'webroot');
  copyTree(legacySource, legacyDestination, totals,
    (filename) => RUNTIME_EXTENSIONS.has(path.extname(filename).toLowerCase()));
  fs.mkdirSync(path.join(output, 'data'), { recursive: true });
  const manifest = {
    format: 1,
    files: totals.files,
    bytes: totals.bytes,
    runtimePackages: runtimePackagePaths,
    excludes: ['development dependencies', 'tests', 'audit images', 'portal source', 'PHP source']
  };
  fs.writeFileSync(path.join(output, 'production-manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return { output, ...manifest };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = buildProduction(process.argv[2] ?? 'dist');
  console.log(JSON.stringify(result, null, 2));
}
