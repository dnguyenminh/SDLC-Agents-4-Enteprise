/**
 * SA4E-406 (BRD STORY 2) — verify loop of drawio_auto_layout: run fix passes
 * until no blocking issue remains (max 3 iterations, spacing incremented
 * between passes), keep the BEST result, and roll back a worse last pass.
 * Assembles the A2 output contract (see drawio-result).
 */

import * as fs from 'fs';
import * as path from 'path';
import type { DiagramGraph } from './drawio-parser';
import { parseDrawioXml } from './drawio-parser';
import type { RepositionedNode } from './drawio-layout-models';
import { absoluteRects } from './drawio-geometry';
import { DEFAULT_DETECT_THRESHOLDS, detectAllIssues, type DetectThresholds, type LayoutIssue } from './drawio-detect';
import { MAX_NODES, normalizeLayoutArgs } from './drawio-apply-args';
import { enforceFinalGate, error, validateReparse } from './drawio-apply-validate';
import { atomicWriteFileSync } from './drawio-atomic-write';
import { checkSymlinkGuardForPath } from '../../backend-local-tools/fs-guards';
import { REPORT_ONLY_ISSUE_TYPES } from './drawio-detect-structure';
import { runStrategy, type StrategySignal } from './drawio-apply-strategy';
import {
  blockingCount, blockingScore, compareBlocking, emptyOutcome, outcomeJson,
  type BlockingScore, type IterationRecord, type LayoutStatus, type RootInfo,
} from './drawio-result';

/** Spacing added between verify-loop passes (grid multiples keep the snap). */
const SPACING_STEP = 40;
/** Verify-loop budget (BRD STORY 2: up to 3 iterations). */
const MAX_ITERATIONS = 3;

interface Best { xml: string; blocking: number; score: BlockingScore; }

/**
 * Orchestrate the fix passes, then write the best result back and return the
 * full A2 contract as JSON.
 */
export async function handleApply(
  rawXml: string, graph: DiagramGraph, issues: LayoutIssue[], nodeCount: number,
  args: Record<string, unknown>, filePath: string, root?: RootInfo,
  thresholds: DetectThresholds = DEFAULT_DETECT_THRESHOLDS,
): Promise<string> {
  const rootInfo: RootInfo = root ?? {
    effective_root: path.dirname(filePath), root_source: 'cwd_fallback',
  };
  // SA4E-406 (M2): the verify loop re-writes the file across passes — re-check
  // the parent realpath before the first write of this run.
  if (rootInfo.root_source === 'workspace') {
    const guard = checkSymlinkGuardForPath(filePath, rootInfo.effective_root, filePath);
    if (guard) return error(guard);
  }
  if (nodeCount > MAX_NODES) return error(`Diagram too large (${nodeCount} nodes, max ${MAX_NODES})`);
  const normalized = normalizeLayoutArgs(args);
  const spacing = normalized.spacing;
  // Carry the ORIGINAL request scope (not re-derived from state) so the flag
  // survives every re-snap in this run, including the final gate and rollback.
  const portsOnly = normalized.scope === 'ports';
  const history: IterationRecord[] = [];
  let currentRaw = rawXml;
  let currentIssues = issues;
  let step = spacing;
  let best: Best = {
    xml: rawXml,
    blocking: blockingCount(issues),
    score: blockingScore(issues),
  };
  let last: StrategySignal | null = null;
  for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
    const signal = await runStrategy(
      currentRaw, currentIssues, nodeCount, { ...args, spacing: step }, filePath,
      iteration > 1, thresholds,
    );
    if (signal.error) {
      restoreCandidate(rawXml, filePath);
      return error(signal.error);
    }
    last = signal;
    const afterXml = signal.wrote ? fs.readFileSync(filePath, 'utf-8') : currentRaw;
    const afterIssues = detectAllIssues(parseDrawioXml(afterXml), thresholds);
    const blocking = blockingCount(afterIssues);
    const score = blockingScore(afterIssues);
    history.push({ iteration, action: signal.strategy, issues_before: blockingCount(currentIssues), issues_after: blocking, spacing: step });
    if (blocking === 0) { best = { xml: afterXml, blocking: 0, score }; break; }
    if (compareBlocking(score, best.score) < 0) best = { xml: afterXml, blocking, score };
    if (signal.status === 'already_good' || iteration === MAX_ITERATIONS) break;
    // Only report-only content issues (lane names, branch wording) remain:
    // further passes cannot fix them — stop instead of rewriting 3 times.
    if (afterIssues.every(i => i.severity === 'low' || REPORT_ONLY_ISSUE_TYPES.has(i.type))) break;
    currentRaw = afterXml;
    currentIssues = afterIssues;
    step += SPACING_STEP;
  }
  return finalize(best, last!, history, rawXml, issues, graph, filePath, rootInfo, portsOnly, thresholds);
}

/** Keep the best pass, roll back a worse last one, assemble the contract. */
function finalize(
  best: Best, last: StrategySignal, history: IterationRecord[],
  initialRaw: string, initialIssues: LayoutIssue[], initialGraph: DiagramGraph,
  filePath: string, root: RootInfo, portsOnly: boolean, thresholds: DetectThresholds,
): string {
  let rolledBack = restoreBest(best, filePath, thresholds);
  // Final gate before the contract is assembled: the reported issues must
  // describe the bytes that actually land on disk (SA4E-406 f/i honesty).
  // Forward portsOnly so the gate's snap skips debunch on the ports path.
  enforceFinalGate(filePath, { portsOnly });
  let finalXml = fs.readFileSync(filePath, 'utf-8');
  let finalGraph = parseDrawioXml(finalXml);
  let finalIssues = detectAllIssues(finalGraph, thresholds);
  if (compareBlocking(blockingScore(finalIssues), best.score) > 0) {
    restoreCandidate(best.xml, filePath);
    rolledBack = true;
    finalXml = fs.readFileSync(filePath, 'utf-8');
    finalGraph = parseDrawioXml(finalXml);
    finalIssues = detectAllIssues(finalGraph, thresholds);
  }
  const finalBlocking = blockingCount(finalIssues);
  const wrote = finalXml !== initialRaw;
  const status: LayoutStatus = !wrote && blockingCount(initialIssues) === 0
    ? 'already_good'
    : finalBlocking === 0 ? 'fixed' : 'partial';
  const outcome = emptyOutcome();
  outcome.status = status;
  outcome.message = messageOf(last, status, finalBlocking, rolledBack);
  outcome.remaining_issues = finalBlocking;
  outcome.iteration_history = history;
  outcome.issues = finalIssues;
  outcome.repositioned_nodes = movedNodes(initialGraph, finalGraph);
  outcome.strategy_used = last.strategy;
  outcome.nodes = finalGraph.nodes.length + finalGraph.containers.length;
  outcome.edges = finalGraph.edges.length;
  return outcomeJson(outcome, root);
}

/** Rollback-if-worse: rewrite the best pass when the file holds a worse one. */
function restoreBest(best: Best, filePath: string, thresholds: DetectThresholds): boolean {
  const fileXml = fs.readFileSync(filePath, 'utf-8');
  if (best.xml === fileXml) return false;
  const fileScore = blockingScore(detectAllIssues(parseDrawioXml(fileXml), thresholds));
  if (compareBlocking(best.score, fileScore) < 0) {
    restoreCandidate(best.xml, filePath);
    return true;
  }
  return false;
}

/** Validate and atomically restore a known-good candidate. */
function restoreCandidate(xml: string, filePath: string): void {
  validateReparse(xml);
  atomicWriteFileSync(filePath, xml);
}

/** Moved nodes = absolute-rect delta between the initial and final graphs. */
function movedNodes(before: DiagramGraph, after: DiagramGraph): RepositionedNode[] {
  const absBefore = absoluteRects(before);
  const out: RepositionedNode[] = [];
  for (const [id, r] of absoluteRects(after)) {
    const o = absBefore.get(id);
    if (!o) continue;
    if (Math.abs(o.x - r.x) > 0.5 || Math.abs(o.y - r.y) > 0.5) {
      out.push({ id, x_old: o.x, y_old: o.y, x_new: r.x, y_new: r.y });
    }
  }
  return out.sort((a, b) => a.id.localeCompare(b.id));
}

/** Honest message: what the last pass did plus the remaining-issue count. */
function messageOf(last: StrategySignal, status: LayoutStatus, remaining: number, rolledBack: boolean): string {
  const parts = [last.message || `Strategy: ${last.strategy}`];
  if (rolledBack) parts.push('A later pass was worse — rolled back to the best result.');
  if (status === 'partial') parts.push(`${remaining} issue(s) remain.`);
  return parts.join(' ');
}
