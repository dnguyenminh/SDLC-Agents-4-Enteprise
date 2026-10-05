/**
 * BudgetGuard — SA4E-338 Plan C (BR-01, BR-12).
 *
 * Computes input budget and routing decision for enrichment prompts.
 * Single source of truth for budget math (FSD §5.6.6).
 */

import { estimateTokens } from '../context/token-budget-manager.js';
import type { WindowInfo } from '../../modules/memory/llm/context-window.js';

export interface BudgetInput {
  digest: string;
  window: WindowInfo;
  promptOverheadTokens: number;
}

export interface BudgetDecision {
  inputBudget: number;
  estimatedTokens: number;
  budgetUtilization: number;
  withinBudget: boolean;
  warnContextFraction: boolean;
  overBudgetReason?: 'utilization_gt_1' | 'non_positive_budget';
}

const CONTEXT_FRACTION_WARN = 0.80; // BR-12

/**
 * Check whether the digest fits within the token budget.
 * Never throws — returns a decision object for the caller to route.
 */
export function check(input: BudgetInput): BudgetDecision {
  const contextWindow = input.window.contextWindow;
  const reservedOutputTokens = input.window.reservedOutputTokens;
  const promptOverhead = input.promptOverheadTokens;

  const inputBudget = contextWindow - reservedOutputTokens - promptOverhead;
  const estimatedTokens = estimateTokens(input.digest);
  const budgetUtilization = inputBudget > 0 ? estimatedTokens / inputBudget : Infinity;
  const warnContextFraction = budgetUtilization >= CONTEXT_FRACTION_WARN;

  let withinBudget = false;
  let overBudgetReason: BudgetDecision['overBudgetReason'] = undefined;

  if (inputBudget <= 0) {
    withinBudget = false;
    overBudgetReason = 'non_positive_budget';
  } else {
    withinBudget = estimatedTokens <= inputBudget;
    if (!withinBudget) {
      overBudgetReason = 'utilization_gt_1';
    }
  }

  return {
    inputBudget,
    estimatedTokens,
    budgetUtilization,
    withinBudget,
    warnContextFraction,
    overBudgetReason,
  };
}

/** Class wrapper for dependency injection compatibility. */
export class BudgetGuard {
  check(input: BudgetInput): BudgetDecision {
    return check(input);
  }
}
