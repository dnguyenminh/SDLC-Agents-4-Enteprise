/**
 * SA4E-360 — fallback ladder for grammar-less files (TDD §6.3 Strategy,
 * UC-360-04, BR-360-03). Rungs: REGEX_SIGNATURES (backend tool, batched) →
 * RAW_HEAD (extension-local readHead ≤ 1 MB) → SKIPPED. The session is NEVER
 * blocked: every per-file failure degrades and is reported via telemetry.
 */
import * as path from 'node:path';
import { logger } from '../../logger.js';
import type { SymbolOutlineExtractor } from '../../pi-agent/context-retrieval/symbol-outline-extractor.js';
import type { SearchCandidate } from '../../pi-agent/context-retrieval/types.js';
import { sanitizeRawHead } from './skeleton-renderer.js';
import type { FallbackFile, FallbackMode, SkeletonPart } from './skeleton-types.js';

export interface FallbackEntry {
  /** Workspace-relative path (forward slashes). */
  relativePath: string;
  /** Language hint for the backend pattern lookup (extension id or ext name). */
  language: string;
}

export interface FallbackDeps {
  /** Batched code_extract_signatures (≤ 50 files per call). */
  extractSignatures: (files: FallbackFile[]) => Promise<SearchCandidate[]>;
  /** Extension-local RAW_HEAD reader (FsContentReader.readHead). */
  readHead: (absolutePath: string, maxLines: number) => string;
  /** SymbolOutlineExtractor for rendering regex candidates. */
  extractor: SymbolOutlineExtractor;
  /** Authoritative estimator (estimateTokenCount — INV-2). */
  measure: (text: string) => number;
  /** Telemetry sink for PI_SKELETON_FALLBACK / PI_SKELETON_FILE_SKIPPED. */
  emit?: (event: string, payload: unknown) => void;
}

export interface FallbackOutcome {
  parts: SkeletonPart[];
  fallbackFiles: number;
  skippedFiles: number;
}

/** Max head lines rendered for a RAW_HEAD rung (bounded, SEC-325-D3). */
const RAW_HEAD_MAX_LINES = 120;

/**
 * Runs the ladder for the given files under the REMAINING global budget
 * (SEC-360-02): each rung stops contributing once the budget is exhausted.
 * Files are processed in the given (priority) order.
 */
export async function runFallbackLadder(
  root: string,
  entries: readonly FallbackEntry[],
  remainingBudget: () => number,
  consume: (tokens: number) => void,
  deps: FallbackDeps
): Promise<FallbackOutcome> {
  const outcome: FallbackOutcome = { parts: [], fallbackFiles: 0, skippedFiles: 0 };
  if (entries.length === 0) return outcome;
  const batch = entries.slice(0, 50).map((e) => ({ path: e.relativePath, language: e.language }));
  let extracted: SearchCandidate[] | null = null;
  try {
    extracted = await deps.extractSignatures(batch);
  } catch (err) {
    // EF-1: extraction THREW → all files SKIPPED (RAW_HEAD is only for empty results)
    logger.warn('PI_SKELETON_FALLBACK_BATCH_FAILED', { error: (err as Error).message });
    for (const entry of entries) skip(deps, entry, 'regex extraction unavailable');
    return { parts: [], fallbackFiles: 0, skippedFiles: entries.length };
  }
  const byPath = groupByPath(extracted ?? []);
  for (const entry of entries) {
    if (remainingBudget() <= 0) break; // global cap full — later files self-skip
    // UT-13 telemetry contract: fallbackFiles counts EVERY ladder entrant
    // (REGEX_SIGNATURES + RAW_HEAD + SKIPPED); skippedFiles = SKIPPED subset.
    outcome.fallbackFiles++;
    const part = await ladderForOne(root, entry, byPath.get(entry.relativePath) ?? [], remainingBudget, consume, deps);
    if (part) {
      outcome.parts.push(part);
    } else {
      outcome.skippedFiles++;
    }
  }
  return outcome;
}

/** One file's ladder: REGEX_SIGNATURES → RAW_HEAD → SKIPPED (never throws). */
async function ladderForOne(
  root: string,
  entry: FallbackEntry,
  candidates: SearchCandidate[],
  remainingBudget: () => number,
  consume: (tokens: number) => void,
  deps: FallbackDeps
): Promise<SkeletonPart | undefined> {
  const absolute = path.join(root, entry.relativePath.replaceAll('/', path.sep));
  try {
    if (candidates.length > 0) {
      const outline = deps.extractor.extractOutline(entry.relativePath, candidates, remainingBudget());
      const tokens = deps.measure(outline);
      deps.emit?.('PI_SKELETON_FALLBACK', { filePath: entry.relativePath, language: entry.language, fallbackMode: 'REGEX_SIGNATURES' satisfies FallbackMode });
      consume(tokens);
      return { filePath: entry.relativePath, module: moduleOf(entry.relativePath), content: outline };
    }
    const head = deps.readHead(absolute, RAW_HEAD_MAX_LINES);
    if (!head) return skip(deps, entry, 'no regex matches and empty head');
    const safe = sanitizeRawHead(head, remainingBudget(), deps.measure);
    if (!safe) return skip(deps, entry, 'RAW_HEAD empty after hygiene + token trim');
    // Self-describing part: same `// basename` header convention as the
    // extractOutline render (reviewer knows which file the head belongs to).
    const content = `// ${path.basename(entry.relativePath)}\n${safe}`;
    const tokens = deps.measure(content);
    deps.emit?.('PI_SKELETON_FALLBACK', { filePath: entry.relativePath, language: entry.language, fallbackMode: 'RAW_HEAD' satisfies FallbackMode });
    consume(tokens);
    return { filePath: entry.relativePath, module: moduleOf(entry.relativePath), content };
  } catch (err) {
    return skip(deps, entry, (err as Error).message.slice(0, 120));
  }
}

/** SKIPPED rung — warn telemetry, never fatal (UC-360-04 EF-1/EF-2). */
function skip(deps: FallbackDeps, entry: FallbackEntry, reason: string): undefined {
  deps.emit?.('PI_SKELETON_FILE_SKIPPED', { filePath: entry.relativePath, reason });
  return undefined;
}

/** Module tag = first path segment (priority resolution — TDD §5.2). */
export function moduleOf(relativePath: string): string {
  return relativePath.split('/')[0] ?? '';
}

function groupByPath(candidates: readonly SearchCandidate[]): Map<string, SearchCandidate[]> {
  const map = new Map<string, SearchCandidate[]>();
  for (const c of candidates) {
    const key = (c.filePath ?? '').replaceAll('\\', '/');
    const list = map.get(key) ?? [];
    list.push(c);
    map.set(key, list);
  }
  return map;
}
