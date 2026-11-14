/**
 * SA4E-406 (g/h/a) — outcome for diagrams whose only blocking issues are
 * REPORT-ONLY types: no destructive relayout for content decisions the tool
 * cannot make (lane titles, branch wording, band budgets). Unambiguous
 * decision branches ARE labeled; everything else is surfaced honestly as
 * status "partial" — never "already_good" (SA4E-406 g).
 */

import * as fs from 'fs';
import { parseDrawioXml } from './drawio-parser';
import type { DiagramGraph } from './drawio-parser';
import { DEFAULT_DETECT_THRESHOLDS, detectAllIssues, type DetectThresholds, type LayoutIssue } from './drawio-detect';
import { enforceFinalGate } from './drawio-apply-validate';
import { blockingCount, emptyOutcome, outcomeJson, type RootInfo } from './drawio-result';

/**
 * Report-only exit of the layout tool.
 * @returns the full A2 contract as JSON text.
 */
export function reportOnlyOutcome(
  filePath: string, raw: string, graph: DiagramGraph, issues: LayoutIssue[], root: RootInfo,
  thresholds: DetectThresholds = DEFAULT_DETECT_THRESHOLDS,
): string {
  const before = blockingCount(issues);
  // The gate labels unambiguous branches AND snaps — one write, only on change.
  enforceFinalGate(filePath);
  const finalXml = fs.readFileSync(filePath, 'utf-8');
  const wrote = finalXml !== raw;
  const finalIssues = wrote ? detectAllIssues(parseDrawioXml(finalXml), thresholds) : issues;
  const after = blockingCount(finalIssues);
  const action = wrote ? 'decision_labels' : 'report_only';
  const outcome = emptyOutcome();
  outcome.status = wrote && after === 0 ? 'fixed' : 'partial';
  outcome.message = message(after, wrote);
  outcome.remaining_issues = after;
  outcome.iteration_history = [{ iteration: 1, action, issues_before: before, issues_after: after, spacing: 0 }];
  outcome.issues = finalIssues;
  outcome.repositioned_nodes = [];
  outcome.strategy_used = action;
  outcome.nodes = graph.nodes.length + graph.containers.length;
  outcome.edges = graph.edges.length;
  return outcomeJson(outcome, root);
}

/** Honest message: what was labeled and what still needs a human. */
function message(remaining: number, wrote: boolean): string {
  if (wrote && remaining === 0) return 'Unambiguous decision branches labeled — no layout change needed.';
  const parts: string[] = [];
  if (wrote) parts.push('Unambiguous decision branches labeled.');
  parts.push(
    `${remaining} issue(s) need a human decision (empty lane titles, branch labels, band sizes) — ` +
    'positions were left untouched.',
  );
  return parts.join(' ');
}
