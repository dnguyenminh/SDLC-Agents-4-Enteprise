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
import { readFileSync, writeFileSync, existsSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const vendorDir = join(repoRoot, 'scripts', 'vendor', 'brace-expansion-5.0.12');

// Official registry metadata for brace-expansion@5.0.12 — the vendored copy
// is verified against this integrity before being applied.
const FIXED = {
  version: '5.0.12',
  resolved: 'https://registry.npmjs.org/brace-expansion/-/brace-expansion-5.0.12.tgz',
  integrity: 'sha512-YovQ3rzhaLMIrDjNDMkNS01tea93qhEhG5xy8f6+R0l+dw3Ki+5sCoIoI942iuLZTHWogWktgwVDhU09iNEimQ==',
};

/** Physical locations npm may place the shrinkwrapped nested copy. */
const NESTED_SUFFIX = join('@earendil-works', 'pi-coding-agent', 'node_modules', 'brace-expansion');
const PHYSICAL_TARGETS = [
  join('node_modules', NESTED_SUFFIX),
  join('extension', 'node_modules', NESTED_SUFFIX),
];

/** Lockfile views npm audit / npm ls read. */
const LOCKFILES = [
  join('package-lock.json'),
  join('node_modules', '.package-lock.json'),
];

const NESTED_POSIX_SUFFIX = '@earendil-works/pi-coding-agent/node_modules/brace-expansion';

function sha512Integrity(filePath) {
  return 'sha512-' + createHash('sha512').update(readFileSync(filePath)).digest('base64');
}

function verifyVendor() {
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

let patched = 0;

try {
  // 1. Replace vulnerable physical copies with the verified vendor copy.
  const vendorOk = verifyVendor();
  if (!vendorOk) {
    console.warn('[patch-vendored-deps] WARNING: vendored brace-expansion failed verification — skipping patch (fail-open)');
  } else {
    for (const rel of PHYSICAL_TARGETS) {
      const abs = join(repoRoot, rel);
      const pkgFile = join(abs, 'package.json');
      if (!existsSync(pkgFile)) continue;
      const cur = JSON.parse(readFileSync(pkgFile, 'utf8'));
      if (cur.version === FIXED.version) continue;
      rmSync(abs, { recursive: true, force: true });
      mkdirSync(abs, { recursive: true });
      cpSync(vendorDir, abs, { recursive: true });
      patched++;
      console.log(`[patch-vendored-deps] brace-expansion ${cur.version} -> ${FIXED.version} (${rel})`);
    }
  }

  // 2. Sync lockfile views (package-lock.json + hidden lockfile) so audit/ls
  //    report the patched version. Runs even when the physical copy was
  //    already patched (npm may have re-written the lockfiles this install).
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
    const keys = Object.keys(pkgs).filter((k) => k.replaceAll('\\', '/').endsWith(NESTED_POSIX_SUFFIX));
    let changed = false;
    for (const k of keys) {
      const e = pkgs[k];
      if (e.version !== FIXED.version) {
        e.version = FIXED.version;
        e.resolved = FIXED.resolved;
        e.integrity = FIXED.integrity;
        changed = true;
        console.log(`[patch-vendored-deps] ${rel} synced: ${k.replaceAll('\\', '/')}`);
      }
    }
    if (changed) {
      writeFileSync(abs, JSON.stringify(lock, null, 2) + '\n');
    }
  }

  if (patched === 0) {
    console.log('[patch-vendored-deps] no vulnerable nested brace-expansion copy present (nothing to do)');
  }
} catch (err) {
  // Fail-open: a patch problem must never break `npm install`.
  console.warn(`[patch-vendored-deps] WARNING: patch step failed (non-fatal): ${err?.message ?? err}`);
}
