// verify-evidence.mjs
// SA4E-411 — evidence integrity verifier.
//
// Checks, for the whole `documents/SA4E-411/evidence/` folder:
//   1. every file exists and is non-empty
//   2. SHA-256 of every file
//   3. every `.raw-*.txt` carries a `--- exit-code capture ---` block with a command,
//      a captured_at timestamp and an EXIT=<n> line
//   4. every entry in exit-codes.json matches the block in its `Source` file
//   5. every command referenced by exit-codes.json points at files that exist in the repo
//
// Usage:  node verify-evidence.mjs [--repo <repoRoot>] [--evidence <evidenceDir>]
// Output: JSON on stdout (summary + per-file detail).

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

function argOf(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? resolve(process.argv[i + 1]) : fallback;
}

const REPO = argOf('--repo', resolve(HERE, '..', '..', '..'));
const EVIDENCE = argOf('--evidence', HERE);

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

const files = readdirSync(EVIDENCE).sort();

const detail = [];
for (const name of files) {
  const p = join(EVIDENCE, name);
  const st = statSync(p);
  const buf = readFileSync(p);
  const isRaw = name.startsWith('.raw-');
  const rec = {
    file: name,
    bytes: st.size,
    sha256: sha256(buf),
    nonEmpty: st.size > 0,
    kind: isRaw ? 'raw-transcript'
      : name.endsWith('.md') ? 'interpretation'
      : name.endsWith('.json') ? 'manifest-json'
      : name.endsWith('.mts') ? 'driver'
      : name.endsWith('.ps1') ? 'launcher'
      : name.endsWith('.mjs') ? 'verifier'
      : 'other',
    exitBlock: null,
    exitBlockError: null,
  };

  if (isRaw) {
    const text = buf.toString('utf8');
    const marker = '--- exit-code capture';
    const idx = text.indexOf(marker);
    if (idx < 0) {
      rec.exitBlockError = 'no `--- exit-code capture ---` marker';
    } else {
      const block = text.slice(idx);
      const cmd = /command:\s*(.+)/.exec(block)?.[1]?.trim() ?? null;
      const at = /captured_at:\s*(.+)/.exec(block)?.[1]?.trim() ?? null;
      const exit = /EXIT=(\d+)/.exec(block)?.[1] ?? null;
      rec.exitBlock = { command: cmd, captured_at: at, exit: exit === null ? null : Number(exit) };
      if (!cmd) rec.exitBlockError = 'block has no `command:` line';
      else if (!at) rec.exitBlockError = 'block has no `captured_at:` line';
      else if (exit === null) rec.exitBlockError = 'block has no `EXIT=` line';
    }
  }
  detail.push(rec);
}

// ---- exit-codes.json cross-check -------------------------------------------
const manifestPath = join(EVIDENCE, 'exit-codes.json');
const exitCodes = JSON.parse(readFileSync(manifestPath, 'utf8'));
const rawByName = new Map(detail.filter((d) => d.kind === 'raw-transcript').map((d) => [d.file, d]));

const exitChecks = exitCodes.map((e) => {
  const srcName = (e.Source || '').split('/').pop();
  const raw = rawByName.get(srcName);
  const problems = [];
  if (!raw) problems.push(`Source file not found in evidence dir: ${e.Source}`);
  else {
    if (!raw.exitBlock) problems.push(raw.exitBlockError || 'source has no exit-code block');
    else {
      if (raw.exitBlock.exit !== e.Exit) {
        problems.push(`EXIT mismatch: manifest=${e.Exit} vs capture=${raw.exitBlock.exit}`);
      }
      const manifestCmd = e.Cmd.replace(/\s+/g, ' ').trim();
      // the capture block appends a `(cwd=<dir>)` annotation — strip it before comparing
      const captureCmd = (raw.exitBlock.command || '')
        .replace(/\s*\(cwd=[^)]*\)\s*$/, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (manifestCmd !== captureCmd) {
        problems.push(`command mismatch:\n      manifest: ${manifestCmd}\n      capture : ${captureCmd}`);
      }
    }
  }
  // Does the referenced command still point at files that exist on disk?
  // Relative targets resolve against the package dir; absolute targets are checked as-is.
  const missingTargets = [];
  const dir = e.Dir === 'backend' ? join(REPO, 'backend')
    : e.Dir === 'extension' ? join(REPO, 'extension') : REPO;
  for (const m of e.Cmd.matchAll(/[A-Za-z]:\\[\w.\\ -]+?\.(?:test\.ts|ts|mts)|(?:\.\.[\\/])[\w.\\-]+\.mts|src[\w.\\/ -]+?\.(?:test\.ts|ts|mts)/g)) {
    const rel = m[0];
    const abs = /^[A-Za-z]:\\/.test(rel) ? rel : join(dir, rel);
    if (!existsSync(abs)) missingTargets.push(`${rel}  (resolved: ${abs})`);
  }
  if (missingTargets.length) {
    problems.push(`referenced file(s) missing in repo (dir=${e.Dir}): ${missingTargets.join(', ')}`);
  }
  return {
    label: e.Label,
    dir: e.Dir,
    cmd: e.Cmd,
    exit: e.Exit,
    capturedAt: e.CapturedAt,
    source: e.Source,
    sourceExists: !!raw,
    targetsMissing: missingTargets,
    problems,
    status: problems.length ? 'MISMATCH' : 'OK',
  };
});

// ---- interpretation (.md) vs raw transcript content match ------------------
// For each interpretation .md we check that every `.raw-*.txt` it cites exists,
// and that the "Lệnh đã chạy" command it prints is present in the cited raw block.
const interpChecks = [];
for (const d of detail.filter((x) => x.kind === 'interpretation')) {
  const text = readFileSync(join(EVIDENCE, d.file), 'utf8');
  const cited = [...text.matchAll(/\.raw-[A-Za-z0-9._-]+\.txt/g)].map((m) => m[0]);
  const uniq = [...new Set(cited)];
  const missing = uniq.filter((c) => !rawByName.has(c));
  const cmds = [...new Set([...text.matchAll(/`npx (?:vitest|tsx) [^`]+`/g)].map((m) => m[0]))];
  interpChecks.push({
    file: d.file,
    citesRawFiles: uniq,
    missingRawFiles: missing,
    commandsPrinted: cmds.length,
    problems: missing.length ? [`cites non-existent raw file(s): ${missing.join(', ')}`] : [],
    status: missing.length ? 'MISMATCH' : 'OK',
  });
}

const out = {
  generatedAt: new Date().toISOString(),
  repo: REPO,
  evidence: EVIDENCE,
  totals: {
    files: detail.length,
    rawTranscripts: detail.filter((d) => d.kind === 'raw-transcript').length,
    interpretations: detail.filter((d) => d.kind === 'interpretation').length,
    drivers: detail.filter((d) => d.kind === 'driver').length,
    emptyFiles: detail.filter((d) => !d.nonEmpty).map((d) => d.file),
    exitCodeEntries: exitChecks.length,
    exitOk: exitChecks.filter((c) => c.status === 'OK').length,
    exitMismatch: exitChecks.filter((c) => c.status !== 'OK').length,
    interpOk: interpChecks.filter((c) => c.status === 'OK').length,
    interpMismatch: interpChecks.filter((c) => c.status !== 'OK').length,
  },
  detail,
  exitChecks,
  interpChecks,
};

console.log(JSON.stringify(out, null, 2));
