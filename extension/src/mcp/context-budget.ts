export const CHARS_PER_TOKEN = 4;
export const MIN_RESERVE_TOKENS = 2000;
export const REJECT_THRESHOLD_PERCENT = 95;
export const WARN_THRESHOLD_PERCENT = 85;
export const DEFAULT_SYSTEM_PROMPT_CHARS = 7500;

export interface ContextBudgetInputs {
  systemPromptChars?: number;
  toolSchemaTokens?: number;
  retrievalTokens?: number;
  historyTokens?: number;
  reserveTokens?: number;
}

export interface BudgetResult {
  estimatedTokens: number;
  usagePercent: number;
  reserveTokens: number;
  conservative: boolean;
}

export type BudgetDecision = 'ALLOW' | 'WARN' | 'REJECT';

export interface ThresholdResult {
  decision: BudgetDecision;
  message: string;
}

export class ContextBudgetError extends Error {
  constructor(
    message: string,
    readonly budget: Pick<BudgetResult, 'estimatedTokens' | 'usagePercent'>
  ) {
    super(message);
    this.name = 'ContextBudgetError';
  }
}

export class BudgetCalculator {
  static estimateTokens(chars?: number): number {
    if (typeof chars !== 'number' || !Number.isFinite(chars) || chars <= 0) {
      return 0;
    }
    return Math.ceil(chars / CHARS_PER_TOKEN);
  }

  static calculateBudget(contextWindow: number, raw?: ContextBudgetInputs): BudgetResult {
    const fields = BudgetCalculator.resolveFields(raw);
    const system = BudgetCalculator.estimateTokens(raw?.systemPromptChars);
    const estimated = system + fields.tool + fields.retrieval + fields.history + fields.reserve.value;
    const usagePercent = contextWindow > 0 ? (estimated / contextWindow) * 100 : 100;
    return {
      estimatedTokens: estimated,
      usagePercent,
      reserveTokens: fields.reserve.value,
      conservative: fields.conservative || fields.reserve.forced,
    };
  }

  private static resolveFields(raw: ContextBudgetInputs | undefined): {
    tool: number;
    retrieval: number;
    history: number;
    reserve: { value: number; forced: boolean };
    conservative: boolean;
  } {
    const tool = BudgetCalculator.resolveNumber(raw?.toolSchemaTokens);
    const retrieval = BudgetCalculator.resolveNumber(raw?.retrievalTokens);
    const history = BudgetCalculator.resolveNumber(raw?.historyTokens);
    const reserveInput = BudgetCalculator.resolveNumber(raw?.reserveTokens, MIN_RESERVE_TOKENS);
    const forced = (raw?.reserveTokens ?? MIN_RESERVE_TOKENS) < MIN_RESERVE_TOKENS;
    return {
      tool: tool.value,
      retrieval: retrieval.value,
      history: history.value,
      reserve: { value: Math.max(MIN_RESERVE_TOKENS, reserveInput.value), forced },
      conservative: tool.invalid || retrieval.invalid || history.invalid || reserveInput.invalid,
    };
  }

  private static resolveNumber(value: number | undefined, fallback = 0): { value: number; invalid: boolean } {
    if (value === undefined) {
      return { value: fallback, invalid: false };
    }
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      return { value: fallback, invalid: true };
    }
    return { value, invalid: false };
  }
}

export class ThresholdGate {
  static evaluate(usagePercent: number): ThresholdResult {
    if (usagePercent > REJECT_THRESHOLD_PERCENT) {
      const pct = Math.round(usagePercent);
      return {
        decision: 'REJECT',
        message: `Session rejected: usage ${pct}% >95% threshold. Reduce history/retrieval.`,
      };
    }
    if (usagePercent > WARN_THRESHOLD_PERCENT) {
      const pct = Math.round(usagePercent);
      return {
        decision: 'WARN',
        message: `Budget warning: usage ${pct}% >85% threshold. Consider reducing history/retrieval.`,
      };
    }
    return { decision: 'ALLOW', message: '' };
  }
}
