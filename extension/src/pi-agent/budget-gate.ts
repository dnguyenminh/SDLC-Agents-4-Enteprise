/**
 * Budget Gate fail-safe — SA4E-355 Task 5 (UC-05).
 *
 * Wire-only composition (BR-11) of the existing BudgetCalculator +
 * ThresholdGate (mcp/context-budget.ts) with the fixed escalation ladder
 * (BR-08). The gate measures the assembled static context, escalates
 * compress → drop steering → minimal loadout while it exceeds the static
 * share, and — when usage persists above the REJECT threshold (BR-13) —
 * throws the actionable PI_CONTEXT_BUDGET_EXCEEDED error so the provider
 * is never called with an oversized prompt (BR-09).
 */
import { logger } from '../logger';
import {
  BudgetCalculator,
  DEFAULT_SYSTEM_PROMPT_CHARS,
  ThresholdGate,
  type BudgetDecision,
} from '../mcp/context-budget';
import { compressPrompt, estimateTokenCount } from './prompt-compressor';
import type { ContextBudget } from './models/ContextBudget';

/** Fixed escalation ladder order (BR-08 — never reordered, never skipped). */
export const ESCALATION_STEPS = ['compress', 'drop-steering', 'min-loadout'] as const;
export type EscalationStep = (typeof ESCALATION_STEPS)[number];

/** A measured static assembly (system + steering + AGENTS + tool schemas), in tokens. */
export interface GateAssembly {
  staticTokens: number;
}

/** Ladder hooks: each applies one degradation and returns the re-measured assembly. */
export interface GateHooks {
  /** Step 1: enable tier compression (UC-03 / BR-04). */
  compress(current: GateAssembly): GateAssembly;
  /** Step 2: drop lowest-priority steering until within the steering share. */
  dropSteering(current: GateAssembly): GateAssembly;
  /** Step 3: reduce the tool loadout to core + discovery only (UC-04). */
  minLoadout(current: GateAssembly): GateAssembly;
}

/** Final gate outcome after the ladder (FSD §3.5.4). */
export interface GateOutcome {
  decision: BudgetDecision;
  usagePercent: number;
  message: string;
  staticTokens: number;
  /** Ladder steps applied, in order (observability, TDD §9). */
  escalations: EscalationStep[];
}

/**
 * Thrown when the assembled static context cannot fit even after the full
 * escalation ladder — the actionable replacement for the provider's raw
 * `exceed_context_size_error` 400 (BR-09, FSD §9.1).
 */
export class PiContextBudgetExceededError extends Error {
  constructor(
    readonly staticTokens: number,
    readonly staticBudget: number,
    readonly nCtx: number
  ) {
    super(
      `PI_CONTEXT_BUDGET_EXCEEDED: static context ${staticTokens} tokens vượt budget ${staticBudget} cho model n_ctx=${nCtx}. Giảm steering/tools hoặc dùng model context lớn hơn.`
    );
    this.name = 'PiContextBudgetExceededError';
  }
}

/** True when the error is a gate rejection (instanceof OR message — module-instance safe). */
export function isBudgetExceededError(err: unknown): boolean {
  if (err instanceof PiContextBudgetExceededError) return true;
  return err instanceof Error && err.message.startsWith('PI_CONTEXT_BUDGET_EXCEEDED');
}

/** Measures usage % of the assembly against n_ctx via the real BudgetCalculator. */
export function measureUsagePercent(budget: ContextBudget, assembly: GateAssembly): number {
  const result = BudgetCalculator.calculateBudget(budget.nCtx, {
    toolSchemaTokens: assembly.staticTokens,
    reserveTokens: budget.reserveOutput,
    historyTokens: 0, // gate runs at session creation — turn 1 history ≈ 0
  });
  return result.usagePercent;
}

/**
 * Runs the fixed escalation ladder while the measured static exceeds its
 * staticBudget share, then decides via the real ThresholdGate (BR-13).
 * Never throws: a failing ladder step is logged and skipped (EF-1).
 */
export function runBudgetGate(budget: ContextBudget, assembly: GateAssembly, hooks: GateHooks): GateOutcome {
  let current = assembly;
  const escalations: EscalationStep[] = [];
  for (const step of ESCALATION_STEPS) {
    if (current.staticTokens <= budget.staticBudget) break; // within share — stop (STC-306)
    current = applyStep(step, hooks[stepKeyOf(step)], escalations, current);
  }
  return decide(budget, current, escalations);
}

/** Throws the actionable error on REJECT (EF-2 UC-05 / BR-09). No-op otherwise. */
export function enforceBudgetGate(outcome: GateOutcome, budget: ContextBudget): void {
  if (outcome.decision !== 'REJECT') return;
  logger.error('PI_CONTEXT_BUDGET_EXCEEDED', {
    staticTokens: outcome.staticTokens,
    staticBudget: budget.staticBudget,
    nCtx: budget.nCtx,
  });
  throw new PiContextBudgetExceededError(outcome.staticTokens, budget.staticBudget, budget.nCtx);
}

/** Maps a ladder step to its GateHooks member. */
function stepKeyOf(step: EscalationStep): 'compress' | 'dropSteering' | 'minLoadout' {
  return step === 'compress' ? 'compress' : step === 'drop-steering' ? 'dropSteering' : 'minLoadout';
}

/** Applies one ladder step; failures are logged and skipped (never break the turn). */
function applyStep(
  step: EscalationStep,
  apply: (current: GateAssembly) => GateAssembly,
  escalations: EscalationStep[],
  current: GateAssembly
): GateAssembly {
  try {
    const next = apply(current);
    escalations.push(step);
    logger.info('PI_GATE_ESCALATION', { step, staticTokens: next.staticTokens }); // re-measured
    return next;
  } catch (err) {
    logger.error('PI_GATE_ESCALATION_FAILED', { step, error: (err as Error).message });
    return current;
  }
}

/** Final decision via the real ThresholdGate (BR-13); WARN is logged and allowed (AF-1). */
function decide(budget: ContextBudget, assembly: GateAssembly, escalations: EscalationStep[]): GateOutcome {
  const usagePercent = measureUsagePercent(budget, assembly);
  const { decision, message } = ThresholdGate.evaluate(usagePercent);
  const rounded = Math.round(usagePercent * 100) / 100;
  logger.info('PI_GATE_DECISION', {
    decision,
    usagePercent: rounded,
    staticTokens: assembly.staticTokens,
    escalations,
  });
  if (decision === 'WARN') logger.warn('PI_GATE_WARN', { usagePercent: rounded, message }); // AF-1 UC-05
  return { decision, usagePercent, message, staticTokens: assembly.staticTokens, escalations };
}

/**
 * Measures the assembled static context (tokens): context files — optionally
 * compressed (UC-03) — plus the workspace prompt, the SDK base system prompt
 * and the tool-schema share from UC-04. All inputs are counts/chars only —
 * no file contents are ever logged (TDD §7 error hygiene).
 */
export function measureStaticAssembly(input: {
  contextFiles: ReadonlyArray<{ content: string }>;
  compress: boolean;
  workspacePrompt: string;
  toolSchemaTokens: number;
}): GateAssembly {
  const fileTokens = input.contextFiles.reduce(
    (sum, f) => sum + estimateTokenCount(input.compress ? compressPrompt(f.content) : f.content),
    0
  );
  return {
    staticTokens:
      fileTokens +
      estimateTokenCount(input.workspacePrompt) +
      BudgetCalculator.estimateTokens(DEFAULT_SYSTEM_PROMPT_CHARS) +
      input.toolSchemaTokens,
  };
}

/** Ladder step 2: halves the steering share so scopedSteering drops more (BR-08). */
export function halveSteeringCap(budget: ContextBudget): ContextBudget {
  return { ...budget, staticBudget: Math.floor(budget.staticBudget / 2) };
}
