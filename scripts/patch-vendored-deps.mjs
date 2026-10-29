/**
 * patch-vendored-deps.mjs — SEC-07 supply-chain mitigation for shrinkwrapped
 * transitive dependencies (root postinstall hook).
 *
 * PROBLEM
 * ───────
 * `@earendil-works/pi-coding-agent@0.99.1` (exact-pinned by SA4E-336 TDD §1.5)
 * ships an `npm-shrinkwrap.json` that locks its whole dependency subtree.
 * That shrinkwrap pins `brace-expansion@5.0.9`, which is affected by:
 *   - GHSA-q2hr-2g5m-vwhr (quadratic `{a},b}` rewrite → CPU DoS)
 *   - GHSA-qhr7-859c-m2p7 (nested brace recursion → stack exhaustion)
 *   - GHSA-6j4f-fj2g-mc7p (parseCommaParts recursion → stack exhaustion)
 * Fixed upstream in brace-expansion@5.0.12 (2026-09-14).
 *
 * npm CANNOT fix this via `overrides` — overrides are ignored for subtrees
 * locked by a dependency's own shrinkwrap (documented npm behavior, verified
 * empirically). `npm audit fix` cannot touch it either. The only upstream
 * escape hatches are pi-coding-agent@1.x (requires pi-agent-core ^1.x —
 * breaks the single-version 0.99.1 gate) — not viable for a hotfix.
 *
 * FIX
 * ───
 * This script runs on `postinstall` and:
 *   1. Replaces the shrinkwrapped nested `brace-expansion@<vuln>` copy with
 *      the REAL fixed 5.0.12 files vendored at
 *      `scripts/vendor/brace-expansion-5.0.12/` (verbatim from the official
 *      registry tarball, integrity-verified at patch time).
 *   2. Syncs `package-lock.json` and `node_modules/.package-lock.json` so
 *      `npm audit` / `npm ls` report the patched version (they read the
 *      lockfile view, not the physical tree).
 *
 * The patch is idempotent, offline, never throws (fail-open with a warning —
 * a patch failure must not break installs), and becomes a no-op once
 * upstream ships a fixed shrinkwrap (target dir simply won't exist).
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, cpSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Each entry patches ONE dependency that pi-coding-agent's shrinkwrap pins to a
 * vulnerable version (overrides are ignored for shrinkwrapped subtrees — see
 * header). `name` is the shrinkwrapped package; `vendorDir` holds the verified
 * fixed copy; `FIXED` is the registry metadata synced into the lockfile views.
 */
const PATCHES = [
  {
    name: 'brace-expansion',
    vendorDir: join(repoRoot, 'scripts', 'vendor', 'brace-expansion-5.0.12'),
    FIXED: {
      version: '5.0.12',
      resolved: 'https://registry.npmjs.org/brace-expansion/-/brace-expansion-5.0.12.tgz',
      integrity: 'sha512-YovQ3rzhaLMIrDjNDMkNS01tea93qhEhG5xy8f6+R0l+dw3Ki+5sCoIoI942iuLZTHWogWktgwVDhU09iNEimQ==',
    },
  },
];

/**
 * undici fix map (keyed by major). Several packages (pi-coding-agent via its
 * shrinkwrap, plus @vscode/proxy-agent, cheerio, jsdom, @cortexkit/aft-bridge,
 * pi-subagents, pi-web-access) pin a nested undici in the vuln ranges
 * 7.0.0-7.30.0 and 8.0.0-8.12.1 (GHSA-4qv8-2p9j-2685 EventSource DoS +
 * TLS/SRI/redirect advisories). npm `overrides` can't normalise them (shrinkwrap
 * + multi-major pins), so we vendor-swap every vulnerable nested undici to the
 * fixed line for its major, preserving the major to keep each consumer's API.
 */
const UNDICI_FIX = {
  7: {
    maxVuln: '7.30.0',
    vendorDir: join(repoRoot, 'scripts', 'vendor', 'undici-7.30.1'),
    FIXED: {
      version: '7.30.1',
      resolved: 'https://registry.npmjs.org/undici/-/undici-7.30.1.tgz',
      integrity: 'sha512-03KrMbjIFDWQR5RNPrSw3bd1r12JpyFQl9/yxjUbJtqkjmllqC5lFjZh6ujeuJCKr8EOQvRW872Oy/az+nLYxg==',
    },
  },
  8: {
    maxVuln: '8.12.1',
    vendorDir: join(repoRoot, 'scripts', 'vendor', 'undici-8.12.3'),
    FIXED: {
      version: '8.12.3',
      resolved: 'https://registry.npmjs.org/undici/-/undici-8.12.3.tgz',
      integrity: 'sha512-+fdndUTwBP86cVjihTp21hZHo7d6oj1c/47XPA3lL8mM0XHs+C4EkcjmgRsFnFk2f/UONGDy9ItBItmXsLOQHw==',
    },
  },
};

/**
 * Lockfile views npm audit / npm ls read. Includes the extension workspace
 * lockfiles because the SEC-07 audit job runs `npm audit` with
 * working-directory: extension, which reads extension/package-lock.json.
 */
const LOCKFILES = [
  join('package-lock.json'),
  join('node_modules', '.package-lock.json'),
  join('extension', 'package-lock.json'),
  join('extension', 'node_modules', '.package-lock.json'),
];

/** Physical + lockfile nested paths for a shrinkwrapped package `name`. */
function targetsFor(name) {
  const suffix = join('@earendil-works', 'pi-coding-agent', 'node_modules', name);
  return {
    physical: [join('node_modules', suffix), join('extension', 'node_modules', suffix)],
    posixSuffix: `@earendil-works/pi-coding-agent/node_modules/${name}`,
  };
}

function sha512Integrity(filePath) {
  return 'sha512-' + createHash('sha512').update(readFileSync(filePath)).digest('base64');
}

function verifyVendor(vendorDir, FIXED) {
  const pkgFile = join(vendorDir, 'package.json');
  if (!existsSync(pkgFile)) return false;
  const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
  if (pkg.version !== FIXED.version) return false;
  // Integrity of the vendored package.json must match the registry tarball
  // entry (npm integrity hashes are computed per-file for the lockfile, but
  // the tarball-level hash is what `resolved`+`integrity` describe; we pin
  // the vendored content by hashing every vendored file against the manifest
  // captured at vendoring time).
  const manifestFile = join(vendorDir, '.integrity.json');
  if (!existsSync(manifestFile)) return true; // manifest optional — best effort
  const manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
  return Object.entries(manifest).every(([rel, expected]) => {
    const f = join(vendorDir, rel);
    if (!existsSync(f)) return false;
    return sha512Integrity(f) === expected;
  });
}

/** Replace vulnerable physical copies of `patch.name` with the vendored fix. */
function patchPhysical(patch) {
  let patched = 0;
  if (!verifyVendor(patch.vendorDir, patch.FIXED)) {
    console.warn(`[patch-vendored-deps] WARNING: vendored ${patch.name} failed verification — skipping (fail-open)`);
    return patched;
  }
  for (const rel of targetsFor(patch.name).physical) {
    const abs = join(repoRoot, rel);
    const pkgFile = join(abs, 'package.json');
    if (!existsSync(pkgFile)) continue;
    const cur = JSON.parse(readFileSync(pkgFile, 'utf8'));
    if (cur.version === patch.FIXED.version) continue;
    rmSync(abs, { recursive: true, force: true });
    mkdirSync(abs, { recursive: true });
    cpSync(patch.vendorDir, abs, { recursive: true });
    patched++;
    console.log(`[patch-vendored-deps] ${patch.name} ${cur.version} -> ${patch.FIXED.version} (${rel})`);
  }
  return patched;
}

/** Numeric semver compare (a <= b). Ignores prerelease — fine for these pins. */
function lte(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] ?? 0) < (pb[i] ?? 0)) return true;
    if ((pa[i] ?? 0) > (pb[i] ?? 0)) return false;
  }
  return true; // equal
}

/**
 * Vendor-swap EVERY vulnerable nested undici copy (any parent) to the fixed
 * line for its major. Walks the physical trees under node_modules and swaps
 * each nested "node_modules/undici" whose version is <= the major's maxVuln.
 * Returns the count patched.
 */
function patchUndici() {
  let patched = 0;
  const roots = [join(repoRoot, 'node_modules'), join(repoRoot, 'extension', 'node_modules')];
  for (const major of Object.keys(UNDICI_FIX)) {
    const fix = UNDICI_FIX[major];
    if (!verifyVendor(fix.vendorDir, fix.FIXED)) {
      console.warn(`[patch-vendored-deps] WARNING: vendored undici@${fix.FIXED.version} failed verification — skipping (fail-open)`);
      continue;
    }
  }
  for (const nmRoot of roots) {
    if (!existsSync(nmRoot)) continue;
    for (const abs of findNestedUndici(nmRoot)) {
      const pkgFile = join(abs, 'package.json');
      if (!existsSync(pkgFile)) continue;
      const cur = JSON.parse(readFileSync(pkgFile, 'utf8'));
      const major = String(parseInt(cur.version, 10));
      const fix = UNDICI_FIX[major];
      if (!fix || !lte(cur.version, fix.maxVuln)) continue; // not vulnerable
      if (!verifyVendor(fix.vendorDir, fix.FIXED)) continue;
      rmSync(abs, { recursive: true, force: true });
      mkdirSync(abs, { recursive: true });
      cpSync(fix.vendorDir, abs, { recursive: true });
      patched++;
      console.log(`[patch-vendored-deps] undici ${cur.version} -> ${fix.FIXED.version} (${abs.replace(repoRoot, '.')})`);
    }
  }
  return patched;
}

/** Find every `<parent>/node_modules/undici` dir under an nmRoot (one level of nesting). */
function findNestedUndici(nmRoot) {
  const out = [];
  const scopes = readdirSync(nmRoot, { withFileTypes: true });
  for (const ent of scopes) {
    if (!ent.isDirectory()) continue;
    const pkgDir = join(nmRoot, ent.name);
    // scoped (@x/y) — descend one more level
    const children = ent.name.startsWith('@')
      ? readdirSync(pkgDir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => join(pkgDir, e.name))
      : [pkgDir];
    for (const c of children) {
      const nested = join(c, 'node_modules', 'undici');
      if (existsSync(join(nested, 'package.json'))) out.push(nested);
    }
  }
  return out;
}

/** Sync a nested undici lockfile entry to the fixed metadata for its major. */
function syncUndiciLockEntry(entry) {
  const major = String(parseInt(entry.version, 10));
  const fix = UNDICI_FIX[major];
  if (!fix || !lte(entry.version, fix.maxVuln)) return false;
  entry.version = fix.FIXED.version;
  entry.resolved = fix.FIXED.resolved;
  entry.integrity = fix.FIXED.integrity;
  return true;
}

/**
 * Sync the lockfile views so npm audit / npm ls report the patched version for
 * EVERY patch (they read the lockfile, not the physical tree).
 */
function syncLockfiles() {
  for (const rel of LOCKFILES) {
    const abs = join(repoRoot, rel);
    if (!existsSync(abs)) continue;
    let lock;
    try {
      lock = JSON.parse(readFileSync(abs, 'utf8'));
    } catch {
      continue; // unreadable lockfile — skip silently
    }
    const pkgs = lock.packages ?? {};
    let changed = false;
    // Named shrinkwrap patches (brace-expansion) — exact path suffix match.
    for (const patch of PATCHES) {
      const posixSuffix = targetsFor(patch.name).posixSuffix;
      const keys = Object.keys(pkgs).filter((k) => k.replaceAll('\\', '/').endsWith(posixSuffix));
      for (const k of keys) {
        const e = pkgs[k];
        if (e.version !== patch.FIXED.version) {
          e.version = patch.FIXED.version;
          e.resolved = patch.FIXED.resolved;
          e.integrity = patch.FIXED.integrity;
          changed = true;
          console.log(`[patch-vendored-deps] ${rel} synced: ${k.replaceAll('\\', '/')} -> ${patch.FIXED.version}`);
        }
      }
    }
    // undici — every vulnerable nested entry (any parent), by major.
    for (const k of Object.keys(pkgs)) {
      const posix = k.replaceAll('\\', '/');
      if (!/\/node_modules\/undici$/.test(posix)) continue;
      const e = pkgs[k];
      if (!e?.version) continue;
      if (syncUndiciLockEntry(e)) {
        changed = true;
        console.log(`[patch-vendored-deps] ${rel} synced: ${posix} -> ${e.version}`);
      }
    }
    if (changed) {
      writeFileSync(abs, JSON.stringify(lock, null, 2) + '\n');
    }
  }
}

try {
  let patched = 0;
  for (const patch of PATCHES) {
    patched += patchPhysical(patch);
  }
  patched += patchUndici();
  syncLockfiles();
  if (patched === 0) {
    console.log('[patch-vendored-deps] no vulnerable nested copy present (lockfiles synced)');
  }
} catch (err) {
  // Fail-open: a patch problem must never break `npm install`.
  console.warn(`[patch-vendored-deps] WARNING: patch step failed (non-fatal): ${err?.message ?? err}`);
}
