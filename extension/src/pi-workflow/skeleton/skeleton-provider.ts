/**
 * SA4E-360 — SkeletonProvider facade (TDD §6.2, OI-2 cache, UC-360-01/04).
 *
 * Orchestrates: freshness sweep → corpus walk (secret-file excluded, SEC-360-01
 * #2) → ONE batched corpus query → global-budget render (SEC-360-02 #1) →
 * fallback ladder (BR-360-03) → module-priority truncation (BR-360-01).
 * The artifact cache is FRESHNESS-KEYED (no TTL): fingerprint = sorted
 * [relativePath, mtimeMs] pairs — unchanged fingerprint serves the cached
 * artifact, build skipped (OI-2). Absent bridge/index degrades (EF-5).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { logger } from '../../logger.js';
import { estimateTokenCount } from '../../pi-agent/prompt-compressor.js';
import { FileScanner } from '../../pi-agent/context-retrieval/file-scanner.js';
import { FsDirLister } from '../../pi-agent/context-retrieval/file-exclusion-filter.js';
import { FsContentReader, SymbolOutlineExtractor } from '../../pi-agent/context-retrieval/symbol-outline-extractor.js';
import { TokenCounter } from '../../pi-agent/context-retrieval/token-counter.js';
import { renderCorpusWithGlobalBudget, type CorpusFile } from './skeleton-renderer.js';
import { runFallbackLadder, moduleOf, type FallbackEntry } from './skeleton-fallback.js';
import { SkeletonTruncator } from './skeleton-truncator.js';
import { isSecretFileName } from './secret-redaction.js';
import type { SkeletonBuildResult, SkeletonPart, SkeletonSections, IndexedFileInfo } from './skeleton-types.js';
import type { SymbolLocator } from './symbol-locator.js';
import type { IndexFreshnessChecker } from './index-freshness-checker.js';
import {
  degraded, toRelative, extName, detectLanguage, groupCorpusByPath, sort,
} from './skeleton-utils.js';

// Language detection moved to skeleton-utils.ts (BR-18) — re-exported so the
// public symbol stays at this path.
export { detectLanguage } from './skeleton-utils.js';

/** §8 scale bound — walked files per build (larger workspaces truncate). */
export const SKELETON_MAX_FILES = 2_000;
/** Skeleton cap = floor(0.70 × staticBudget) (BR-360-01, resolver-authoritative). */
export function skeletonCap(staticBudget: number): number {
  return Math.floor(0.70 * Math.max(0, staticBudget));
}

export interface SkeletonProviderDeps {
  locator: SymbolLocator;
  freshness: IndexFreshnessChecker;
  extractor?: SymbolOutlineExtractor;
  emit?: (event: string, payload: unknown) => void;
}

interface CacheEntry {
  fingerprint: string;
  artifact: SkeletonSections;
  files: IndexedFileInfo[];
}

export class SkeletonProvider {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly extractor: SymbolOutlineExtractor;
  private readonly scanner = new FileScanner(new FsDirLister());

  constructor(private readonly deps: SkeletonProviderDeps) {
    this.extractor = deps.extractor ?? new SymbolOutlineExtractor(new TokenCounter(), new FsContentReader());
  }

  /** Single entry point consumed by createHost (measure==inject composition). */
  async getSections(root: string, staticBudget: number, modulePriorityOrder: readonly string[]): Promise<SkeletonSections> {
    const started = Date.now();
    const cap = skeletonCap(staticBudget);
    const cached = this.cache.get(root);
    if (cached && (await this.fingerprint(root, cached.files)) === cached.fingerprint) {
      return cached.artifact; // OI-2: build skipped — index unchanged
    }
    const { artifact, files } = await this.build(root, staticBudget, cap, modulePriorityOrder);
    this.cache.set(root, { fingerprint: await this.fingerprint(root, files), artifact, files });
    this.emitBuilt(root, artifact, staticBudget, started);
    return artifact;
  }

  /** Test/ops hook — forces a rebuild on the next getSections (OI-2). */
  invalidate(root: string): void {
    this.cache.delete(root);
  }

  /** Build: walk → corpus → render → fallback → truncate (never throws). */
  private async build(
    root: string,
    staticBudget: number,
    cap: number,
    priority: readonly string[]
  ): Promise<{ artifact: SkeletonSections; files: IndexedFileInfo[] }> {
    try {
      const walked = this.scanner
        .listSourceFiles(root, { maxFiles: SKELETON_MAX_FILES })
        .map((abs) => toRelative(root, abs))
        .filter((rel) => !isSecretFileName(rel)); // SEC-360-01 #2 (UT-31)
      if (walked.length === 0) return { artifact: degraded(), files: [] };
      // §2.2 step 3 — freshness sweep BEFORE the build: stat → hash → reindex
      // (checker-internal, retry-once, cooldown). DEGRADED ⇒ no skeleton (EF-3).
      const report = await this.deps.freshness.sweep(root, walked.map((relativePath) => ({ relativePath })));
      if (report.status === 'DEGRADED') {
        logger.warn('PI_SKELETON_INDEX_DEGRADED', { staleFiles: report.staleFiles.length });
        return { artifact: degraded(), files: walked.map((relativePath) => ({ relativePath })) };
      }
      const corpus = await this.deps.locator.fetchSymbolCorpus(); // ONE batched pass
      const byPath = groupCorpusByPath(corpus);
      const grammar: CorpusFile[] = [];
      const fallback: FallbackEntry[] = [];
      for (const rel of walked) {
        const symbols = byPath.get(rel);
        if (symbols) grammar.push({ filePath: rel, module: moduleOf(rel), symbols });
        else if (detectLanguage(rel) === null) fallback.push({ relativePath: rel, language: extName(rel) });
        else grammar.push({ filePath: rel, module: moduleOf(rel), symbols: [] }); // header-only (not yet indexed)
      }
      sort(grammar, priority);
      const rendered = renderCorpusWithGlobalBudget(grammar, cap, {
        renderFile: (filePath, symbols, maxTokens) => this.extractor.extractOutline(filePath, symbols as never, maxTokens),
        measure: estimateTokenCount,
      });
      let measuredSoFar = rendered.tokens;
      const fallbackOutcome = await runFallbackLadder(root, fallback, () => cap - measuredSoFar, (t) => { measuredSoFar += t; }, {
        extractSignatures: (files) => this.deps.locator.extractSignatures(files),
        readHead: (absolute, maxLines) => new FsContentReader().readHead(absolute, maxLines),
        extractor: this.extractor,
        measure: estimateTokenCount,
        emit: this.deps.emit,
      });
      const parts = [...rendered.parts, ...fallbackOutcome.parts];
      const result = this.truncate(parts, cap, priority, staticBudget);
      return {
        artifact: {
          skeleton: {
            skeletonContent: result.skeletonContent,
            skeletonTokens: result.skeletonTokens,
            truncationApplied: result.truncationApplied,
            fallbackFiles: fallbackOutcome.fallbackFiles,
            skippedFiles: fallbackOutcome.skippedFiles,
            gateDecision: result.gateDecision,
          },
        },
        files: walked.map((relativePath) => ({ relativePath })),
      };
    } catch (err) {
      logger.warn('PI_SKELETON_BUILD_FAILED', { error: (err as Error).message }); // fail-safe (EF-5)
      return { artifact: degraded(), files: [] };
    }
  }

  /** Module-priority truncation (BR-360-01) — truncator owns REJECT/DEGRADED. */
  private truncate(parts: readonly SkeletonPart[], cap: number, priority: readonly string[], staticBudget: number): SkeletonBuildResult {
    const derived = priority.length > 0 ? priority : [...new Set(parts.map((p) => p.module))]; // absent → insertion order
    const result = new SkeletonTruncator({ emit: this.deps.emit }).truncate(parts, cap, derived, staticBudget);
    return {
      skeletonContent: result.content,
      skeletonTokens: result.skeletonTokens,
      truncationApplied: result.truncationApplied,
      fallbackFiles: 0,
      skippedFiles: 0,
      gateDecision: result.gateDecision,
    };
  }

  /** Indexed-file list for the fingerprint (derived from the walk during build). */

  /** OI-2 fingerprint: sorted [relativePath, round(mtimeMs)] pairs of files. */
  private async fingerprint(root: string, files: readonly IndexedFileInfo[]): Promise<string> {
    const pairs: Array<[string, number]> = [];
    for (const f of files) {
      try {
        const stat = fs.statSync(path.join(root, f.relativePath.replaceAll('/', path.sep)));
        pairs.push([f.relativePath, Math.round(stat.mtimeMs)]);
      } catch {
        pairs.push([f.relativePath, -1]); // vanished since the build
      }
    }
    pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]));
    return JSON.stringify(pairs);
  }

  /** PI_SKELETON_BUILT — counts/decisions only, never code content (TDD §11). */
  private emitBuilt(root: string, artifact: SkeletonSections, staticBudget: number, started: number): void {
    this.deps.emit?.('PI_SKELETON_BUILT', {
      workspaceRoot: root,
      files: (artifact.skeleton.skeletonContent.match(/^\/\/ /gm) ?? []).length,
      symbols: (artifact.skeleton.skeletonContent.match(/\n/g) ?? []).length,
      skeletonTokens: artifact.skeleton.skeletonTokens,
      staticBudget,
      fallbackFiles: artifact.skeleton.fallbackFiles,
      skippedFiles: artifact.skeleton.skippedFiles,
      gateDecision: artifact.skeleton.gateDecision,
      durationMs: Date.now() - started,
    });
  }
}
