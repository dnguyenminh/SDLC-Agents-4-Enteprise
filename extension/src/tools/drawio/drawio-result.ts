/**
 * SA4E-406 (A2) — the ONE output contract of drawio_auto_layout:
 *   { status, message, remaining_issues, iteration_history, issues,
 *     repositioned_nodes, strategy_used, effective_root, root_source, nodes, edges }
 * status ∈ { fixed, already_good, partial }; partial = improved but issues remain.
 * `mode`/`auto_fix` are intentionally absent (A3) — fixing is unconditional.
 */

import type { LayoutIssue } from './drawio-detect';
import type { RepositionedNode } from './drawio-layout-models';

export type LayoutStatus = 'fixed' | 'already_good' | 'partial';

/** One verify-loop pass (BRD STORY 2) — recorded even when a single pass runs. */
export interface IterationRecord {
  iteration: number;
  action: string;
  issues_before: number;
  issues_after: number;
  spacing: number;
}

/** Workspace root that validated the path (surfaced for traceability). */
export interface RootInfo { effective_root: string; root_source: string; }

/** Everything the contract needs, before the root fields are attached. */
export interface LayoutOutcome {
  status: LayoutStatus;
  message: string;
  remaining_issues: number;
  iteration_history: IterationRecord[];
  issues: LayoutIssue[];
  repositioned_nodes: RepositionedNode[];
  strategy_used: string;
  nodes: number;
  edges: number;
}

/** Count of blocking (medium/high) issues — low severity is cosmetic. */
export function blockingCount(issues: LayoutIssue[]): number {
  return issues.filter(i => i.severity !== 'low').length;
}

/** Serialize the full contract with a fixed key order. */
export function outcomeJson(outcome: LayoutOutcome, root: RootInfo): string {
  return JSON.stringify({
    status: outcome.status,
    message: outcome.message,
    remaining_issues: outcome.remaining_issues,
    iteration_history: outcome.iteration_history,
    issues: outcome.issues,
    repositioned_nodes: outcome.repositioned_nodes,
    strategy_used: outcome.strategy_used,
    effective_root: root.effective_root,
    root_source: root.root_source,
    nodes: outcome.nodes,
    edges: outcome.edges,
  });
}

/** Empty outcome skeleton — every field the contract requires is present. */
export function emptyOutcome(): LayoutOutcome {
  return {
    status: 'already_good', message: '', remaining_issues: 0,
    iteration_history: [], issues: [], repositioned_nodes: [],
    strategy_used: 'none', nodes: 0, edges: 0,
  };
}
