/**
 * SA4E-233 — pega-generate-parser.mjs
 *
 * Regenerates the ANTLR TypeScript parser for the Pega expression grammar.
 * Runs the ANTLR tool with `-Dlanguage=TypeScript -visitor` and flattens the
 * generated `.ts` files into `src/modules/pega/expression/generated/`.
 *
 * The generated files are committed to the repo so the runtime does NOT need Java.
 * This script is only needed when the grammar changes.
 *
 * Requirements: Java on PATH and the ANTLR complete jar (path via ANTLR_JAR env var,
 * defaulting to the standalone tool location).
 *
 * Usage: npm run pega:generate
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXPR_DIR = resolve(HERE, '../src/modules/pega/expression');
const GRAMMAR = join(EXPR_DIR, 'grammar', 'PegaExpr.g4');
const OUT_DIR = join(EXPR_DIR, 'generated');
const TMP_DIR = join(EXPR_DIR, '.antlr-tmp');
const DEFAULT_JAR = 'C:/projects/Pega/PegaPlatfrom/pega-rule-parser/tools/antlr-4.13.2-complete.jar';

/** Resolve the ANTLR jar path, preferring the ANTLR_JAR env var. */
function resolveJar() {
  const jar = process.env.ANTLR_JAR || DEFAULT_JAR;
  if (!existsSync(jar)) {
    throw new Error(`ANTLR jar not found at "${jar}". Set ANTLR_JAR env var to the antlr-4.13.2-complete.jar path.`);
  }
  return jar;
}

/** Verify Java is available; throw a clear error otherwise. */
function assertJava() {
  try {
    execFileSync('java', ['-version'], { stdio: 'ignore' });
  } catch (err) {
    throw new Error(`Java is required to run ANTLR but was not found on PATH. Root cause: ${err.message}`);
  }
}

/** Run ANTLR into a clean temp dir, then flatten .ts files into the generated dir. */
function generate() {
  assertJava();
  const jar = resolveJar();
  rmSync(TMP_DIR, { recursive: true, force: true });
  mkdirSync(TMP_DIR, { recursive: true });
  execFileSync('java', ['-jar', jar, '-Dlanguage=TypeScript', '-visitor', '-o', TMP_DIR, GRAMMAR], {
    stdio: 'inherit',
  });
  rmSync(OUT_DIR, { recursive: true, force: true });
  mkdirSync(OUT_DIR, { recursive: true });
  moveTsFiles(TMP_DIR);
  rmSync(TMP_DIR, { recursive: true, force: true });
}

/** Recursively move every generated .ts file up into the flat generated dir. */
function moveTsFiles(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) moveTsFiles(full);
    else if (entry.name.endsWith('.ts')) renameSync(full, join(OUT_DIR, entry.name));
  }
}

try {
  generate();
  console.log(`ANTLR TypeScript parser generated into ${OUT_DIR}`);
} catch (err) {
  console.error(`pega:generate failed: ${err.message}`);
  process.exit(1);
}
