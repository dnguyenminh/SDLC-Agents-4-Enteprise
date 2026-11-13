#!/usr/bin/env node
/**
 * SA4E-393 Addendum 5 (TDD E2.4) — generates the extension copy of the worktree-trust
 * library from the backend source of truth (bundle boundary C-5: the extension cannot
 * import backend ESM).
 *
 *   node scripts/sync-worktree-trust.mjs           write generated files
 *   node scripts/sync-worktree-trust.mjs --check   exit 1 on any drift (CI / drift guard)
 *
 * Transform: `from './x.js'` -> `from './x'` (extension is CJS + esbuild), EOL -> \n,
 * GENERATED header. Stale generated files (no longer in backend) are drift too.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_DIR = 'backend/src/shared/worktree-trust';
const LIB_DEST = 'extension/src/services/worktree-trust';
const TEST_SRC = `${SRC_DIR}/__tests__`;
const TEST_DEST = 'extension/src/__tests__/worktree-trust';
/** Test helpers shared with the extension (fixture builds real `git worktree add` layouts). */
const TEST_HELPERS = ['worktree-fixture.ts'];
const SELF = 'scripts/sync-worktree-trust.mjs';

const toPosix = (p) => p.split(path.sep).join('/');
const normalizeEol = (s) => s.replace(/\r\n?/g, '\n');
const header = (srcRel) => `/* GENERATED from ${srcRel} by ${SELF} - DO NOT EDIT */\n`;

/** Rewrites a relative import specifier; `libRel` maps `../x.js` (test helper -> lib) to the lib copy. */
function rewriteSpecifiers(text, libRel) {
  return text.replace(/(from\s+')(\.{1,2}\/[^']*?)\.js(')/g, (_m, a, spec, c) => {
    const mapped = libRel && spec.startsWith('../') ? `${libRel}/${spec.slice(3)}` : spec;
    return `${a}${mapped}${c}`;
  });
}

function transform(root, srcRel, libRel) {
  const raw = fs.readFileSync(path.join(root, srcRel), 'utf8');
  return header(srcRel) + rewriteSpecifiers(normalizeEol(raw), libRel);
}

const listTs = (root, rel) =>
  fs.readdirSync(path.join(root, rel), { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.ts'))
    .map((e) => e.name).sort();

/** Map of repo-relative output path -> expected content. */
export function buildOutputs(root) {
  const out = new Map();
  for (const f of listTs(root, SRC_DIR)) {
    out.set(`${LIB_DEST}/${f}`, transform(root, `${SRC_DIR}/${f}`, null));
  }
  for (const f of TEST_HELPERS) {
    out.set(`${TEST_DEST}/${f}`, transform(root, `${TEST_SRC}/${f}`, '../../services/worktree-trust'));
  }
  return out;
}

/** Generated files present on disk that are no longer produced (deleted upstream). */
function staleFiles(root, outputs) {
  const stale = [];
  for (const dir of [LIB_DEST, TEST_DEST]) {
    const abs = path.join(root, dir);
    if (!fs.existsSync(abs)) continue;
    for (const f of listTs(root, dir)) {
      const rel = `${dir}/${f}`;
      const isGenerated = fs.readFileSync(path.join(root, rel), 'utf8').startsWith('/* GENERATED from ');
      if (isGenerated && !outputs.has(rel)) stale.push(rel);
    }
  }
  return stale;
}

function diffs(root, outputs) {
  const bad = [];
  for (const [rel, content] of outputs) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) bad.push(`missing: ${rel}`);
    else if (normalizeEol(fs.readFileSync(abs, 'utf8')) !== content) bad.push(`differs: ${rel}`);
  }
  return [...bad, ...staleFiles(root, outputs).map((r) => `stale: ${r}`)];
}

function write(root, outputs) {
  for (const [rel, content] of outputs) {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), content, 'utf8');
  }
  for (const rel of staleFiles(root, outputs)) fs.rmSync(path.join(root, rel));
}

function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const outputs = buildOutputs(root);
  if (process.argv.includes('--check')) {
    const bad = diffs(root, outputs);
    if (bad.length > 0) {
      console.error(`worktree-trust drift detected (run: npm run sync:worktree-trust)\n  ${bad.join('\n  ')}`);
      process.exit(1);
    }
    console.log(`worktree-trust: ${outputs.size} generated files in sync`);
    return;
  }
  write(root, outputs);
  console.log(`worktree-trust: wrote ${outputs.size} generated files`);
}

if (process.argv[1] && toPosix(path.resolve(process.argv[1])) === toPosix(fileURLToPath(import.meta.url))) main();
