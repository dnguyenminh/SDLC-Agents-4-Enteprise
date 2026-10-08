import type { WindowInfo } from '../../modules/memory/llm/context-window.js';
import { TokenBudgetManager } from '../context/token-budget-manager.js';

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

export class BudgetGuard {
  static readonly CONTEXT_FRACTION_WARN = 0.80;

  static check(input: BudgetInput): BudgetDecision {
    const inputBudget = BudgetGuard.computeInputBudget(input.window, input.promptOverheadTokens);
    const estimatedTokens = TokenBudgetManager.estimateTokens(input.digest);
    const withinBudget = inputBudget > 0 && estimatedTokens <= inputBudget;
    const budgetUtilization = inputBudget > 0 ? estimatedTokens / inputBudget : Infinity;
    const warnContextFraction = budgetUtilization >= BudgetGuard.CONTEXT_FRACTION_WARN;
    let overBudgetReason: BudgetDecision['overBudgetReason'] = undefined;
    if (inputBudget <= 0) overBudgetReason = 'non_positive_budget';
    else if (!withinBudget) overBudgetReason = 'utilization_gt_1';
    return {
      inputBudget,
      estimatedTokens,
      budgetUtilization,
      withinBudget,
      warnContextFraction,
      overBudgetReason,
    };
  }

  static computeInputBudget(window: WindowInfo, promptOverhead: number): number {
    return window.contextWindow - window.reservedOutputTokens - promptOverhead;
  }

  static warnLine(d: BudgetDecision): string {
    const pct = Math.round(d.budgetUtilization * 100);
    return `budget utilization ${pct}% (${d.estimatedTokens}/${d.inputBudget}) — approaching context limit`;
  }
}
