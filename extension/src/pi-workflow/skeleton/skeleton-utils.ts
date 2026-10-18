/**
 * skeleton-utils — pure helpers for SkeletonProvider (degraded artifact,
 * path/language utilities, corpus grouping, priority sort).
 * Extracted from skeleton-provider.ts (BR-18); behavior unchanged.
 */
import * as path from 'node:path';
import { LANGUAGE_EXTENSIONS } from '../../code-intel/models.js';
import type { SearchCandidate } from '../../pi-agent/context-retrieval/types.js';
import type { CorpusFile } from './skeleton-renderer.js';
import type { SkeletonSections } from './skeleton-types.js';

export function degraded(): SkeletonSections {
  return {
    skeleton: {
      skeletonContent: '', skeletonTokens: 0, truncationApplied: false,
      fallbackFiles: 0, skippedFiles: 0, gateDecision: 'DEGRADED_NO_SKELETON',
    },
  };
}

export function toRelative(root: string, absolutePath: string): string {
  return path.relative(root, absolutePath).replaceAll('\\', '/');
}

export function extName(relativePath: string): string {
  return path.extname(relativePath).replace(/^\./, '') || 'unknown';
}

/** Existing language detection (code-intel models) — null ⇒ grammar-less. */
export function detectLanguage(relativePath: string): string | null {
  const ext = path.extname(relativePath).toLowerCase();
  for (const [lang, exts] of Object.entries(LANGUAGE_EXTENSIONS)) {
    if (exts.includes(ext)) return lang;
  }
  return null;
}

export function groupCorpusByPath(corpus: readonly SearchCandidate[]): Map<string, SearchCandidate[]> {
  const map = new Map<string, SearchCandidate[]>();
  for (const c of corpus) {
    const key = (c.filePath ?? '').replaceAll('\\', '/');
    const list = map.get(key) ?? [];
    list.push(c);
    map.set(key, list);
  }
  return map;
}

/** Renders highest-priority modules first so they claim budget first. */
export function sort(files: CorpusFile[], priority: readonly string[]): void {
  const rank = new Map(priority.map((m, i) => [m, i]));
  files.sort((a, b) => (rank.get(a.module) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.module) ?? Number.MAX_SAFE_INTEGER));
}
