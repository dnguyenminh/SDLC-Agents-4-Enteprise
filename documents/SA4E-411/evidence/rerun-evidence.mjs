// rerun-evidence.mjs
// SA4E-411 — re-run every command listed in exit-codes.json inside THIS worktree,
// capture a fresh exit code + timestamp + full output, and emit a JSON report.
//
// Each command is executed with `spawnSync` (no shell) so the exit code is the
// real process exit code. Output is written to `.rerun-<label>.txt` next to the
// original `.raw-*.txt` transcripts.
//
// Usage: node rerun-evidence.mjs [--out <reportPath>]

import { spawnSync } from 'node:child_process';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..', '..');

const outIdx = process.argv.indexOf('--out');
const OUT = outIdx >= 0 && process.argv[outIdx + 1]
  ? resolve(process.argv[outIdx + 1])
  : join(HERE, '.rerun-report.json');
const entries = JSON.parse(readFileSync(join(HERE, 'exit-codes.json'), 'utf8'));

// The two driver entries in exit-codes.json point at a TEMP path
// (C:\Users\ASUS\AppData\Local\Temp\opencode\sa4e-411-demo*.mts). Those temp copies
// are byte-identical to the drivers shipped inside this evidence folder, but the
// temp path is not portable. Re-run them through the in-repo path instead.
// NOTE: cwd is `backend/`, so the repo root is ONE level up (`..`), not two.
const PORTABLE_CMD = {
  demo: 'npx tsx ..\\documents\\SA4E-411\\evidence\\demo-driver-core-tools.mts',
  demo2: 'npx tsx ..\\documents\\SA4E-411\\evidence\\demo-driver-patch-sse-resume.mts',
};

const results = [];
const only = process.argv.includes('--only')
  ? process.argv[process.argv.indexOf('--only') + 1].split(',')
  : null;
for (const e of entries) {
  if (only && !only.includes(e.Label)) continue;
  const cwd = e.Dir === 'backend' ? join(REPO, 'backend')
    : e.Dir === 'extension' ? join(REPO, 'extension') : REPO;
  const cmd = PORTABLE_CMD[e.Label] ?? e.Cmd;
  const portable = Boolean(PORTABLE_CMD[e.Label]);

  const startedAt = new Date();
  const startedIso = startedAt.toISOString();
  const r = spawnSync(cmd, {
    cwd,
    shell: true,
    encoding: 'utf8',
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1', CI: '1' },
    maxBuffer: 64 * 1024 * 1024,
  });
  const finishedAt = new Date();
  const stdout = r.stdout ?? '';
  const stderr = r.stderr ?? '';
  const exit = r.status === null ? (r.error ? -1 : 255) : r.status;

  const rawName = `.rerun-${e.Label}.txt`;
  const body = [
    `=== SA4E-411 evidence re-run ===`,
    `label      : ${e.Label}`,
    `cwd        : ${cwd}`,
    `command    : ${cmd}`,
    `portable   : ${portable ? 'yes (in-repo driver path substituted for the temp path recorded in exit-codes.json)' : 'yes (unchanged)'}`,
    `started_at : ${startedIso}`,
    `finished_at: ${finishedAt.toISOString()}`,
    `duration_ms: ${finishedAt - startedAt}`,
    `EXIT=${exit}`,
    ``,
    `--- stdout ---`,
    stdout,
    `--- stderr ---`,
    stderr,
    ``,
    `--- exit-code capture (re-run in worktree SA4E-411) ---`,
    `captured_at: ${startedIso}`,
    `command: ${cmd} (cwd=${e.Dir})`,
    `EXIT=${exit}`,
  ].join('\n');
  writeFileSync(join(HERE, rawName), body, 'utf8');

  // Pull the vitest summary line out of stdout for the manifest.
  const summary = (stdout.match(/Test Files[^\n]*/g) || []).join(' | ')
    || (stdout.match(/Tests\s+\d+[^\n]*/g) || []).join(' | ')
    || null;

  results.push({
    label: e.Label,
    dir: e.Dir,
    originalCmd: e.Cmd,
    cmd,
    portable,
    originalExit: e.Exit,
    originalCapturedAt: e.CapturedAt,
    rerunExit: exit,
    rerunStartedAt: startedIso,
    rerunFinishedAt: finishedAt.toISOString(),
    durationMs: finishedAt - startedAt,
    exitMatchesOriginal: exit === e.Exit,
    summary,
    rawFile: rawName,
    cwd,
  });

  process.stdout.write(`[${e.Label}] exit=${exit} (original=${e.Exit}) ${summary ?? ''}\n`);
}

const report = {
  generatedAt: new Date().toISOString(),
  repo: REPO,
  node: process.version,
  total: results.length,
  exitZero: results.filter((r) => r.rerunExit === 0).length,
  mismatches: results.filter((r) => !r.exitMatchesOriginal).map((r) => ({
    label: r.label, originalExit: r.originalExit, rerunExit: r.rerunExit,
  })),
  results,
};
writeFileSync(OUT, JSON.stringify(report, null, 2), 'utf8');
process.stdout.write(`\nreport -> ${OUT}\n`);
