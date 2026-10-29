/**
 * audit-gate.mjs — supply-chain audit gate with a documented allowlist.
 *
 * Drop-in replacement for `npm audit --omit=dev --audit-level=high`: it runs the
 * same audit, then fails ONLY on High/Critical advisories that are NOT in the
 * allowlist below. Runs in the current working directory, so each workflow keeps
 * its existing `working-directory:` (extension, backend, or repo root).
 *
 * WHY AN ALLOWLIST
 * ────────────────
 * Some advisories have no fixed version reachable from our dependency tree
 * (upstream pins a vulnerable range and has not shipped a patched line we can
 * resolve to). Blocking the whole pipeline on an un-fixable transitive advisory
 * provides no security benefit — it only hides NEW, actionable findings. Each
 * entry MUST document: the advisory, why it is not fixable today, and the
 * residual-risk justification. Re-review when upstream releases a fix.
 */

import { spawnSync } from 'node:child_process';

/**
 * Allowlisted advisories (GHSA IDs). Keep this list SMALL and justified.
 */
const ALLOWLIST = new Map([
  [
    'GHSA-mrhx-c7xc-m3w5',
    {
      pkg: 'zod (3.x)',
      reason:
        "Pulled transitively via chromium-bidi -> puppeteer-core, which pins " +
        "zod ^3.24.1. The advisory covers zod through 4.6.5 (incl. the entire " +
        "3.x line); no fixed 3.x release exists, and puppeteer-core@latest still " +
        "pins ^3.24.1. puppeteer-core is a runtime dep (CDP/browser automation in " +
        "PegaBrowserInspector + ide-control-tools), so it cannot move to devDeps.",
      risk:
        "Low: the uncontrolled-array/set/map memory DoS requires attacker-" +
        "controlled input to a zod container schema. Here zod validates our own " +
        "CDP/automation payloads, not untrusted external input — no exposed attack " +
        "surface. Re-review when puppeteer-core/chromium-bidi adopt zod >= 4.6.6.",
    },
  ],
]);

/** Run `npm audit --omit=dev --json` in the current cwd and parse the report. */
function runAudit() {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const res = spawnSync(npm, ['audit', '--omit=dev', '--json'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === 'win32',
  });
  // npm audit exits non-zero when vulns exist — stdout still holds the JSON.
  if (!res.stdout) {
    console.error('[audit-gate] npm audit produced no output');
    console.error(res.stderr ?? '');
    process.exit(1);
  }
  try {
    return JSON.parse(res.stdout);
  } catch (err) {
    console.error(`[audit-gate] failed to parse npm audit JSON: ${err?.message ?? err}`);
    process.exit(1);
  }
}

/** Extract the GHSA id from an advisory's url/source (npm v7+ schema). */
function ghsaOf(adv) {
  const url = adv?.url ?? '';
  const m = /\/(GHSA-[0-9a-z-]+)\b/i.exec(url);
  return m ? m[1] : null;
}

const report = runAudit();
const vulns = report.vulnerabilities ?? {};

/**
 * Is package `name` fully allowlisted? True when EVERY high/critical advisory on
 * it is either (a) a GHSA in the allowlist, or (b) a `via` string pointing at
 * another package that is itself fully allowlisted (transitive propagation —
 * npm flags a parent as "Depends on vulnerable versions of <child>"). Guarded
 * against cycles via `seen`.
 */
function isAllowlisted(name, seen = new Set()) {
  if (seen.has(name)) return true; // cycle — don't let it flip the verdict
  seen.add(name);
  const v = vulns[name];
  if (!v) return false;
  const via = v.via ?? [];
  if (via.length === 0) return false;
  return via.every((entry) => {
    if (typeof entry === 'object') {
      const g = ghsaOf(entry);
      return g != null && ALLOWLIST.has(g);
    }
    // string → a parent-depends-on-child edge; allowed iff child is allowlisted.
    return typeof entry === 'string' && isAllowlisted(entry, seen);
  });
}

function ghsasFor(name) {
  return (vulns[name]?.via ?? []).filter((x) => typeof x === 'object').map(ghsaOf).filter(Boolean);
}

const blocking = [];
const allowed = [];

for (const [name, v] of Object.entries(vulns)) {
  const sev = v.severity;
  if (sev !== 'high' && sev !== 'critical') continue;
  if (isAllowlisted(name)) {
    allowed.push({ name, ghsas: ghsasFor(name) });
  } else {
    blocking.push({ name, severity: sev, ghsas: ghsasFor(name) });
  }
}

if (allowed.length > 0) {
  console.log('[audit-gate] Allowlisted High/Critical advisories (not blocking):');
  for (const a of allowed) {
    if (a.ghsas.length > 0) {
      for (const g of a.ghsas) {
        const info = ALLOWLIST.get(g);
        console.log(`  - ${a.name} :: ${g} (${info?.pkg ?? ''}) — ${info?.reason ?? ''}`);
      }
    } else {
      // Allowlisted by transitive propagation (depends on an allowlisted pkg).
      console.log(`  - ${a.name} :: depends only on allowlisted advisories`);
    }
  }
}

if (blocking.length > 0) {
  console.error('[audit-gate] BLOCKING High/Critical advisories:');
  for (const b of blocking) {
    console.error(`  - ${b.name} [${b.severity}] ${b.ghsas.join(', ') || '(no GHSA id)'}`);
  }
  console.error(`[audit-gate] ${blocking.length} blocking advisory group(s). Run "npm audit --omit=dev" for detail.`);
  process.exit(1);
}

console.log('[audit-gate] PASS — no blocking High/Critical advisories.');
process.exit(0);
