/**
 * Ships jiti's lazy Babel transform next to the bundle.
 *
 * Root cause (caught by `npm run smoke:bundle`, 2026-10-17): jiti 2.7 is a
 * webpack bundle whose dist/jiti.cjs lazy-loads its transform via
 *   createRequire(<caller file URL>)(  "../dist/babel.cjs" )
 * In node_modules that resolves to node_modules/jiti/dist/babel.cjs (exists).
 * Once jiti is inlined into our single-file CJS bundle, the caller URL becomes
 * the BUNDLE itself (`__PI_IMPORT_META_URL` = pathToFileURL(__filename), see
 * pi-import-meta.js), so the path resolves to `<bundleDir>/../dist/babel.cjs`:
 *   out/extension.js          → extension/dist/babel.cjs
 *   scripts/smoke-bundle/out  → scripts/smoke-bundle/dist/babel.cjs
 * Without the copy, jiti's transpile path (TypeScript pi-extensions) dies with
 *   "Failed to load extension: Cannot find module '../dist/babel.cjs'".
 *
 * Fix: copy the SAME jiti copy esbuild bundles (resolved from the
 * pi-coding-agent package, matching esbuild's resolution) to that location at
 * build time. Keeps the bundle self-contained — no node_modules in the vsix.
 */
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const PI_PKG = '@earendil-works/pi-coding-agent';
// Same conditions as the runtime banner resolver (pi packages export only the
// `import` condition, so CJS-default resolution fails).
const PI_IMPORT_CONDITIONS = new Set(['import', 'node', 'default']);

/** Package dir of @earendil-works/pi-coding-agent. */
function resolvePiPkgDir() {
  const here = createRequire(path.join(__dirname, 'noop.cjs'));
  try {
    // exports "import" → dist/index.js (dir up from dist/ = package dir).
    const main = here.resolve(PI_PKG, { conditions: PI_IMPORT_CONDITIONS });
    const pkgDir = path.dirname(path.dirname(main));
    if (fs.existsSync(path.join(pkgDir, 'package.json'))) return pkgDir;
  } catch {
    // Older Node without `conditions` support → fall through to the walk.
  }
  // Fallback: walk up looking for the package in any node_modules.
  let dir = __dirname;
  for (;;) {
    const candidate = path.join(dir, 'node_modules', ...PI_PKG.split('/'));
    if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`Cannot locate ${PI_PKG} — run npm install first`);
}

/** Path of the jiti/dist/babel.cjs copy that gets inlined into the bundle. */
function resolveJitiBabelSource() {
  const piPkgDir = resolvePiPkgDir();
  const piRequire = createRequire(path.join(piPkgDir, 'noop.cjs'));
  const jitiMain = piRequire.resolve('jiti'); // <jiti>/lib/jiti.cjs
  return path.resolve(path.dirname(jitiMain), '..', 'dist', 'babel.cjs');
}

/** Copy jiti's babel.cjs to `<bundleDir>/../dist/babel.cjs`. Returns dest path. */
function copyJitiBabel(bundleDir) {
  const src = resolveJitiBabelSource();
  if (!fs.existsSync(src)) throw new Error(`jiti babel.cjs not found: ${src}`);
  const dest = path.resolve(bundleDir, '..', 'dist', 'babel.cjs');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return dest;
}

module.exports = { resolvePiPkgDir, resolveJitiBabelSource, copyJitiBabel };
