/**
 * Path suggestions for not-found errors ("Did you mean …?").
 *
 * Root cause (UAT 17/10 "review toàn bộ workspace"): the model guessed
 * `.../handlers/backend-settings-handler.test.ts` five times in a row while
 * the real file lived one level deeper in `handlers/__tests__/` — which the
 * model had ALREADY listed. The old hint only described the workspace root,
 * so guessing continued until the loop guard bailed the turn.
 *
 * This module finds existing paths close to the missing one so the error
 * itself teaches the exact next call. Pure fs reads, never throws, capped
 * work (≤1 readdir of the parent + ≤12 shallow subdirs).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const MAX_PARENT_ENTRIES = 300;
const MAX_SUBDIRS = 12;
const MAX_SUBDIR_ENTRIES = 80;
/** Dice similarity below this is noise for filename matching. */
const MIN_DICE = 0.55;
const IGNORED_DIRS = new Set(['node_modules', '.git', 'out', 'dist']);

interface DirEntry {
  name: string;
  isDir: boolean;
}

/**
 * Existing paths similar to `missingPath` (absolute or workspace-relative).
 * Ordered best-first: exact name in the parent, same name one level deeper
 * (e.g. `__tests__/`), fuzzy name matches. Returns [] when nothing is close.
 */
export function suggestExistingPaths(
  workspaceRoot: string,
  missingPath: string,
  maxSuggestions = 3
): string[] {
  if (!workspaceRoot || !missingPath) return [];
  const abs = path.isAbsolute(missingPath) ? missingPath : path.join(workspaceRoot, missingPath);
  const parent = path.dirname(abs);
  const base = path.basename(abs);
  if (!base || base === '.' || base === '..') return [];

  const parentEntries = listDir(parent);
  if (!parentEntries) return [];

  const baseLc = base.toLowerCase();
  const scored = new Map<string, { path: string; score: number }>();
  const add = (candidate: string, score: number): void => {
    const key = candidate.toLowerCase();
    if (!scored.has(key)) scored.set(key, { path: candidate, score });
  };

  const subdirs = parentEntries
    .filter((e) => e.isDir && !IGNORED_DIRS.has(e.name.toLowerCase()))
    .slice(0, MAX_SUBDIRS);

  for (const entry of parentEntries) {
    const nameLc = entry.name.toLowerCase();
    if (nameLc === baseLc) add(path.join(parent, entry.name), entry.isDir ? 90 : 100);
    else {
      const score = fuzzyScore(baseLc, nameLc);
      if (score > 0) add(path.join(parent, entry.name), score);
    }
  }

  for (const dir of subdirs) {
    const sub = path.join(parent, dir.name);
    const entries = listDir(sub, MAX_SUBDIR_ENTRIES);
    if (!entries) continue;
    for (const entry of entries) {
      const nameLc = entry.name.toLowerCase();
      if (nameLc === baseLc) add(path.join(sub, entry.name), 85);
      else {
        const score = fuzzyScore(baseLc, nameLc) - 5; // deeper path = weaker hint
        if (score > 0) add(path.join(sub, entry.name), score);
      }
    }
  }

  return [...scored.values()]
    .sort((a, b) => b.score - a.score || a.path.length - b.path.length || a.path.localeCompare(b.path))
    .slice(0, Math.max(0, maxSuggestions))
    .map((s) => s.path.replace(/\\/g, '/'));
}

/** 0 = unrelated; 30–60 = plausible typo/variant. Deterministic + cheap. */
function fuzzyScore(baseLc: string, nameLc: string): number {
  if (baseLc.length < 4 || nameLc.length < 4) return 0;
  const contains =
    nameLc.includes(baseLc) || baseLc.includes(nameLc)
      ? Math.min(nameLc.length, baseLc.length)
      : 0;
  if (contains >= 6) return 60 + Math.min(contains, 20);
  const dice = diceCoefficient(baseLc, nameLc);
  return dice >= MIN_DICE ? Math.round(30 + dice * 25) : 0;
}

/** Sørensen–Dice bigram coefficient (0..1). */
function diceCoefficient(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const g = a.slice(i, i + 2);
    bigrams.set(g, (bigrams.get(g) ?? 0) + 1);
  }
  let overlap = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const g = b.slice(i, i + 2);
    const n = bigrams.get(g) ?? 0;
    if (n > 0) {
      bigrams.set(g, n - 1);
      overlap++;
    }
  }
  return (2 * overlap) / (a.length - 1 + (b.length - 1));
}

function listDir(dir: string, cap = MAX_PARENT_ENTRIES): DirEntry[] | undefined {
  try {
    return fs
      .readdirSync(dir, { withFileTypes: true })
      .slice(0, cap)
      .map((e) => ({ name: e.name, isDir: e.isDirectory() }));
  } catch {
    return undefined; // missing/unreadable dir → no suggestions
  }
}
