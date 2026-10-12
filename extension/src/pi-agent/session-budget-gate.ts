/**
 * Session-host budget gate wiring — SA4E-355 Task 5 (UC-05).
 *
 * Wire-only composition (BR-11): measures the assembled static context with
 * the existing estimator, runs the fixed escalation ladder from budget-gate
 * (compress → drop steering → min loadout, BR-08) via the real
 * BudgetCalculator + ThresholdGate (BR-13), and enforces the fail-safe
 * outcome — REJECT throws the actionable PI_CONTEXT_BUDGET_EXCEEDED error so
 * the provider is never called oversized (BR-09); WARN logs and proceeds
 * (AF-1 UC-05). Escalation results take real effect through the returned
 * flags (compression, halved steering share, minimal loadout).
 */
import { logger } from '../logger';
import {
  enforceBudgetGate,
  halveSteeringCap,
  measureStaticAssembly,
  runBudgetGate,
  type GateAssembly,
  type GateOutcome,
} from './budget-gate.js';
import type { ContextBudget } from './models/ContextBudget';
import { NON_STRIPPABLE_RE } from './prompt-compressor.js';

/** Inputs for {@link runSessionBudgetGate} (FSD §3.5.4). */
export interface SessionGateInput {
  /** Loads context-file contents; never throws (host wraps failures). */
  loadFiles: () => ReadonlyArray<{ content: string }>;
  /** Workspace system prompt text (measured, never logged). */
  workspacePrompt: string;
  /** Estimated schema tokens of the full role-aware loadout (UC-04). */
  toolSchemaTokens: number;
  /** Estimated schema tokens of core-only loadout (escalation step 3). */
  minToolSchemaTokens: number;
  /** Provisional compression flag from governance (BR-04, UC-03). */
  shouldCompress: boolean;
}

/** Gate result with real-effect escalation flags (BR-08). */
export interface SessionGateResult {
  /** Final gate outcome (decision + usage + applied steps, TDD §9). */
  outcome: GateOutcome;
  /** Effective compression flag (provisional OR ladder step 1). */
  shouldCompress: boolean;
  /** True when step 3 fired — use the core-only allowlist. */
  minLoadout: boolean;
  /** Steering budget for scopedSteering (halved when step 2 fired). */
  steeringBudget: ContextBudget;
}

/**
 * Measures the assembled static context and runs the fail-safe gate.
 * Throws PiContextBudgetExceededError on REJECT (BR-09); WARN resolves
 * normally after logging (AF-1 UC-05). Never throws for WARN/ALLOW.
 */
export function runSessionBudgetGate(budget: ContextBudget, input: SessionGateInput): SessionGateResult {
  const files = safeLoadFiles(input.loadFiles);
  const initial = remeasure(input, files, input.shouldCompress, false, input.toolSchemaTokens);
  const outcome = runBudgetGate(budget, initial, {
    compress: () => remeasure(input, files, true, false, input.toolSchemaTokens),
    dropSteering: () => remeasure(input, files, true, true, input.toolSchemaTokens),
    minLoadout: () => remeasure(input, files, true, true, input.minToolSchemaTokens),
  });
  enforceBudgetGate(outcome, budget);
  return toResult(budget, input, outcome);
}

/** Maps the ladder outcome to the real-effect flags (BR-08). */
function toResult(budget: ContextBudget, input: SessionGateInput, outcome: GateOutcome): SessionGateResult {
  const steps = new Set(outcome.escalations);
  return {
    outcome,
    shouldCompress: input.shouldCompress || steps.has('compress'),
    minLoadout: steps.has('min-loadout'),
    steeringBudget: steps.has('drop-steering') ? halveSteeringCap(budget) : budget,
  };
}

/** Re-measures the assembly under one ladder hypothesis. */
function remeasure(
  input: SessionGateInput,
  files: ReadonlyArray<{ content: string }>,
  compress: boolean,
  dropHalf: boolean,
  toolSchemaTokens: number
): GateAssembly {
  const kept = dropHalf ? dropLowPriorityFiles(files) : files;
  return measureStaticAssembly({
    contextFiles: kept,
    compress,
    workspacePrompt: input.workspacePrompt,
    toolSchemaTokens,
  });
}

/**
 * Ladder step 2 single pass (BR-08): keeps the first half of context files
 * fully and only the security lines of the rest — BR-05 lines survive.
 */
function dropLowPriorityFiles(files: ReadonlyArray<{ content: string }>): Array<{ content: string }> {
  const keep = Math.max(1, Math.ceil(files.length / 2));
  return files.map((f, i) => (i < keep ? { content: f.content } : { content: securityLinesOnly(f.content) }));
}

/** Keeps only NON_STRIPPABLE_RE lines (BR-05, SEC-326-04). */
function securityLinesOnly(content: string): string {
  return content
    .split('\n')
    .filter((line) => NON_STRIPPABLE_RE.test(line))
    .join('\n');
}

/** Loads context files defensively — measurement never breaks the turn. */
function safeLoadFiles(load: () => ReadonlyArray<{ content: string }>): Array<{ content: string }> {
  try {
    const files = load();
    return Array.isArray(files) ? [...files] : [];
  } catch (err) {
    logger.warn('PI_CONTEXT_FILES_MEASURE_FAILED', { error: (err as Error).message });
    return [];
  }
}
