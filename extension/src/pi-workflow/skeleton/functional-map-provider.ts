/**
 * SA4E-360 — FunctionalMapProvider (TDD §4.4, C-360-M1/M2; UC-360-03).
 *
 * Wires the dormant SummaryTreeBuilder (consumed AS-IS — BR-360-05) into the
 * shared sections build that serves BOTH the session assembly path and the
 * extended get_workspace_info tool result (AF-3 — one build per 60s TTL window
 * feeds both). keySymbols come from the skeleton build's REAL symbol corpus
 * (no fabricated modules). Caps: map ≤ 1,500 tokens (builder default), whole
 * result ≤ 16,000 chars (MAX_TOOL_RESULT_CHARS) with module-priority trimming.
 * EF-1: per-module failure → entry omitted (debug only). EF-2: total builder
 * failure → layout only + PI_FUNCTIONAL_MAP_UNAVAILABLE (warn, exactly once).
 */
import * as path from 'node:path';
import * as fs from 'node:fs';
import { debugLog } from '../../debug-logger';
import { SummaryTreeBuilder } from '../../pi-agent/context-retrieval/summary-tree.js';
import { FsDirLister } from '../../pi-agent/context-retrieval/file-exclusion-filter.js';
import { TokenCounter } from '../../pi-agent/context-retrieval/token-counter.js';
import { estimateTokenCount } from '../../pi-agent/prompt-compressor.js';
import { EXCLUDED_DIRS } from '../../pi-agent/context-retrieval/types.js';
import type { FunctionalMapEntry, FunctionalMapSection } from './skeleton-types.js';

/** Whole-result char cap = shipped MAX_TOOL_RESULT_CHARS (pi-event-mapper L29). */
export const MAX_RESULT_CHARS = 16_000;
/** Builder default consumed as-is (C-360-M1 cap table). */
export const MAP_TOKEN_CAP = 1_500;
/** Builder walk depth consumed as-is. */
const MAP_MAX_DEPTH = 3;
/** keySymbols per module entry (bounded — no unbounded symbol dumps). */
const KEY_SYMBOLS_PER_MODULE = 5;

export interface FunctionalMapProviderDeps {
  /** SummaryTreeBuilder consumed as-is (defaults to the FsDirLister build). */
  builder?: SummaryTreeBuilder;
  /** REAL corpus keySymbols per module dir; a throw omits that entry (EF-1). */
  keySymbolsFor?: (module: string) => string[];
  /** Module names in KEEP-priority order (trimming drops lowest first). */
  modulePriorityOrder?: readonly string[];
  /** Whole-result char cap (default MAX_RESULT_CHARS). */
  maxChars?: number;
  /** Telemetry sink for PI_FUNCTIONAL_MAP_UNAVAILABLE (EF-2). */
  emit?: (event: string, payload: unknown) => void;
  /** Authoritative estimator (default estimateTokenCount — INV-2). */
  measure?: (text: string) => number;
}

export type MapSection = FunctionalMapSection & { cacheTtlSeconds: number };

export class FunctionalMapProvider {
  private readonly builder: SummaryTreeBuilder;
  private readonly measure: (text: string) => number;

  constructor(private readonly deps: FunctionalMapProviderDeps = {}) {
    this.builder = deps.builder ?? new SummaryTreeBuilder({ lister: new FsDirLister(), counter: new TokenCounter() });
    this.measure = deps.measure ?? estimateTokenCount;
  }

  /**
   * Builds the map section and composes `layoutText + '\n\n' + map` (UT-26).
   * Returns undefined when the map is unavailable (EF-2) — callers keep the
   * layout-only result (byte-identical to the pre-change behavior).
   */
  buildSection(root: string, layoutText: string): MapSection | undefined {
    let tree: { text: string; tokens: number };
    try {
      tree = this.builder.build(root, { maxDepth: MAP_MAX_DEPTH, maxTokens: MAP_TOKEN_CAP });
    } catch (err) {
      this.deps.emit?.('PI_FUNCTIONAL_MAP_UNAVAILABLE', { workspaceRoot: root, reason: (err as Error).message.slice(0, 160) });
      return undefined;
    }
    if (!tree.text) {
      this.deps.emit?.('PI_FUNCTIONAL_MAP_UNAVAILABLE', { workspaceRoot: root, reason: 'empty summary tree' });
      return undefined;
    }
    const entries = this.buildEntries(root, tree.text);
    return this.capAndCompose(layoutText, entries);
  }

  /** Real module dirs (mirrors the builder walk) + corpus keySymbols (EF-1). */
  private buildEntries(root: string, treeText: string): FunctionalMapEntry[] {
    const summaries = treeText.split('\n').filter((l) => l.trim().length > 0);
    const dirs = listDirs(root, MAP_MAX_DEPTH);
    const entries: FunctionalMapEntry[] = [];
    const count = Math.min(summaries.length, dirs.length); // zip walk order — builder may cap early
    for (let i = 0; i < count; i++) {
      const moduleRel = dirs[i];
      try {
        const keySymbols = (this.deps.keySymbolsFor?.(moduleRel) ?? []).slice(0, KEY_SYMBOLS_PER_MODULE);
        entries.push({ module: moduleRel, summary: summaries[i], keySymbols });
      } catch (err) {
        debugLog(`[FunctionalMap] module entry omitted: ${moduleRel}: ${(err as Error).message}`); // EF-1 (debug only)
      }
    }
    return entries;
  }

  /** AF-1: cap pressure trims lowest-priority entries until text ≤ maxChars. */
  private capAndCompose(layoutText: string, entries: FunctionalMapEntry[]): MapSection | undefined {
    const maxChars = this.deps.maxChars ?? MAX_RESULT_CHARS;
    let kept = [...entries];
    let sectionText = renderSection(kept);
    if (this.measure(sectionText) > MAP_TOKEN_CAP || layoutText.length + 2 + sectionText.length > maxChars) {
      kept = trimByPriority(kept, this.deps.modulePriorityOrder ?? [], layoutText, maxChars, this.measure);
      sectionText = renderSection(kept);
    }
    if (kept.length === 0) return undefined; // nothing survived the caps → layout only
    return {
      entries: kept,
      mapTokens: this.measure(sectionText),
      text: `${layoutText}\n\n${sectionText}`,
      cacheTtlSeconds: 60,
    };
  }
}

/** Renders the map section text (module summary line + optional Key: line). */
function renderSection(entries: readonly FunctionalMapEntry[]): string {
  return entries
    .map((e) => (e.keySymbols.length > 0 ? `${e.summary}\n  Key: ${e.keySymbols.join(', ')}` : e.summary))
    .join('\n');
}

/** Drops lowest-priority entries (unranked first, then reverse priority order). */
function trimByPriority(
  entries: readonly FunctionalMapEntry[],
  priority: readonly string[],
  layoutText: string,
  maxChars: number,
  measure: (text: string) => number
): FunctionalMapEntry[] {
  const rank = new Map(priority.map((m, i) => [m, i]));
  const order = entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => {
      const ra = rank.get(a.e.module) ?? -1; // unranked = lowest
      const rb = rank.get(b.e.module) ?? -1;
      if (ra !== rb) return ra - rb;
      return b.i - a.i; // later-inserted drops first
    })
    .map(({ i }) => i);
  const kept = [...entries];
  for (const victim of order) {
    if (layoutText.length + 2 + renderSection(kept).length <= maxChars) break;
    const entry = kept[victim];
    const idx = kept.indexOf(entry);
    if (idx >= 0) kept.splice(idx, 1);
  }
  return kept;
}

/** BFS directory list (full relative paths, forward slashes) mirroring the builder walk. */
function listDirs(root: string, maxDepth: number): string[] {
  const dirs: string[] = [];
  const queue: Array<{ abs: string; rel: string; depth: number }> = [{ abs: root, rel: '', depth: 0 }];
  while (queue.length > 0) {
    const node = queue.shift()!;
    dirs.push(node.rel);
    if (node.depth >= maxDepth) continue;
    let names: string[] = [];
    try {
      names = fs.readdirSync(node.abs, { withFileTypes: true })
        .filter((e) => e.isDirectory() && !EXCLUDED_DIRS.some((d) => d.toLowerCase() === e.name.toLowerCase()))
        .map((e) => e.name)
        .sort((a, b) => a.localeCompare(b));
    } catch {
      continue; // unreadable dir contributes nothing (fail-soft)
    }
    for (const name of names) {
      queue.push({
        abs: path.join(node.abs, name),
        rel: node.rel ? `${node.rel}/${name}` : name,
        depth: node.depth + 1,
      });
    }
  }
  return dirs;
}
