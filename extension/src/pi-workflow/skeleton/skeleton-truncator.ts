/**
 * SA4E-360 — module-priority skeleton truncator (TDD §2.2 step 5, §6.2).
 *
 * SEC-360-02 remediation: token accounting is INCREMENTAL — each part is
 * measured once, and dropping a part subtracts its tokens from the running
 * total (O(parts) instead of the designed O(parts²) full re-join per drop).
 * A hard iteration cap (≤ 500 drops) bounds worst-case work; exceeding it
 * REJECTs per BR-360-02 (fail-safe, never unbounded).
 *
 * Drop-order contract (UT-02): lowest-priority module first (a module NOT in
 * `modulePriorityOrder` is never droppable — the forced-harness REJECT case,
 * TRC-04); within a module a file part is dropped before the module header;
 * later-inserted parts before earlier ones. Dropping EVERY droppable part
 * yields DEGRADED_NO_SKELETON — empty content NEVER triggers REJECT (UT-05).
 */
import { estimateTokenCount } from '../../pi-agent/prompt-compressor.js';
import type { SkeletonGateDecision, SkeletonPart } from './skeleton-types.js';

/** Hard iteration cap (SEC-360-02 remediation #3) — exceeding REJECTs. */
export const MAX_TRUNCATION_DROPS = 500;

/** Telemetry payload of the single PI_SKELETON_TRUNCATED event (C-360-S3). */
export interface TruncationTelemetry {
  skeletonTokensBefore: number;
  skeletonTokensAfter: number;
  modulesDropped: string[];
  staticBudget: number;
}

/** Result of a truncation run (consumed by SkeletonProvider / createHost). */
export interface TruncationResult {
  content: string;
  skeletonTokens: number;
  truncationApplied: boolean;
  modulesDropped: string[];
  gateDecision: SkeletonGateDecision;
  /** Error-shaped payload for the assembly boundary when gateDecision = REJECT (UT-04). */
  rejectPayload?: { skeletonTokens: number; staticBudget: number };
}

export interface TruncatorDeps {
  /** Telemetry sink — receives exactly one PI_SKELETON_TRUNCATED per run with drops. */
  emit?: (event: string, payload: TruncationTelemetry) => void;
  /** Per-drop observability hook (PBT-04/05 strict-shrink + termination proofs). */
  onDrop?: (dropped: SkeletonPart, totalAfter: number) => void;
}

export interface TruncateOptions {
  /** Override for tests; production uses MAX_TRUNCATION_DROPS. */
  maxDrops?: number;
}

/** Drop order: lowest-priority module first, file before header, later first. */
function dropOrder(parts: readonly SkeletonPart[], priority: readonly string[]): number[] {
  const rank = new Map(priority.map((m, i) => [m, i]));
  return parts
    .map((p, i) => ({ p, i }))
    .filter(({ p }) => rank.has(p.module))
    .sort((a, b) => {
      const byModule = (rank.get(b.p.module) ?? 0) - (rank.get(a.p.module) ?? 0);
      if (byModule !== 0) return byModule;
      const byKind = (a.p.kind === 'module-header' ? 1 : 0) - (b.p.kind === 'module-header' ? 1 : 0);
      if (byKind !== 0) return byKind;
      return b.i - a.i; // later-inserted files drop first
    })
    .map(({ i }) => i);
}

export class SkeletonTruncator {
  constructor(private readonly deps: TruncatorDeps = {}) {}

  /**
   * Truncates `parts` to `cap` tokens by dropping lowest-priority parts.
   * Never throws; the decision is carried in {@link TruncationResult.gateDecision}.
   */
  truncate(
    parts: readonly SkeletonPart[],
    cap: number,
    modulePriorityOrder: readonly string[],
    staticBudget: number,
    options?: TruncateOptions
  ): TruncationResult {
    if (parts.length === 0) return degraded();
    const joined = parts.map((p) => p.content).join('\n');
    const totalBefore = estimateTokenCount(joined);
    if (totalBefore <= cap) return { content: joined, skeletonTokens: totalBefore, truncationApplied: false, modulesDropped: [], gateDecision: 'PASS' };
    const outcome = this.dropLoop(parts, cap, modulePriorityOrder, staticBudget, totalBefore, options?.maxDrops ?? MAX_TRUNCATION_DROPS);
    return outcome;
  }

  /** Incremental drop loop — O(parts) accounting (SEC-360-02 remediation #2). */
  private dropLoop(
    parts: readonly SkeletonPart[],
    cap: number,
    priority: readonly string[],
    staticBudget: number,
    totalBefore: number,
    maxDrops: number
  ): TruncationResult {
    const partTokens = parts.map((p) => estimateTokenCount(p.content)); // measured once per part
    let total = totalBefore;
    const dropped: number[] = [];
    const queue = dropOrder(parts, priority);
    while (total > cap && queue.length > 0 && dropped.length < maxDrops) {
      const victim = queue.shift() as number;
      total -= partTokens[victim];
      dropped.push(victim);
      this.deps.onDrop?.(parts[victim], total);
    }
    const remaining = parts.filter((_, i) => !dropped.includes(i));
    const modulesDropped = [...new Set(dropped.map((i) => parts[i].module))];
    return this.decide(remaining, cap, staticBudget, totalBefore, modulesDropped);
  }

  /** Terminal decision: DEGRADED (empty) → REJECT (still over) → TRUNCATED_PASS. */
  private decide(
    remaining: readonly SkeletonPart[],
    cap: number,
    staticBudget: number,
    totalBefore: number,
    modulesDropped: string[]
  ): TruncationResult {
    if (remaining.length === 0) {
      this.emitTruncation(totalBefore, 0, modulesDropped, staticBudget);
      return degraded();
    }
    const content = remaining.map((p) => p.content).join('\n');
    const tokens = estimateTokenCount(content); // authoritative re-measure of the kept join
    if (tokens > cap) {
      return {
        content,
        skeletonTokens: tokens,
        truncationApplied: true,
        modulesDropped,
        gateDecision: 'REJECT',
        rejectPayload: { skeletonTokens: tokens, staticBudget },
      };
    }
    this.emitTruncation(totalBefore, tokens, modulesDropped, staticBudget);
    return { content, skeletonTokens: tokens, truncationApplied: true, modulesDropped, gateDecision: 'TRUNCATED_PASS' };
  }

  /** Exactly one PI_SKELETON_TRUNCATED event per run with at least one drop (UT-03). */
  private emitTruncation(before: number, after: number, modulesDropped: string[], staticBudget: number): void {
    if (before <= after) return; // only real truncation runs emit
    this.deps.emit?.('PI_SKELETON_TRUNCATED', {
      skeletonTokensBefore: before,
      skeletonTokensAfter: after,
      modulesDropped,
      staticBudget,
    });
  }
}

function degraded(): TruncationResult {
  return { content: '', skeletonTokens: 0, truncationApplied: true, modulesDropped: [], gateDecision: 'DEGRADED_NO_SKELETON' };
}
