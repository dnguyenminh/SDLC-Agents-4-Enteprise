/**
 * SA4E-107: Prompt builder for code enrichment LLM calls.
 * Builds structured prompts per enrichment strategy (CLASS, FUNCTION, PEGA).
 * BR-18 facade — strategy templates live in ./CodeEnrichmentPromptBuilder/prompts.ts,
 * token budgeting in ./CodeEnrichmentPromptBuilder/token-budget.ts.
 * SA4E-387: Accepts inputBudget parameter for dynamic prompt sizing.
 */

import type { LLMMessage } from '../../modules/memory/llm/types.js';
import type { EnrichmentStrategy, SymbolContext } from './types.js';
import {
  classMessages,
  functionMessages,
  metadataMessages,
  pegaMessages,
  tagMessages,
} from './CodeEnrichmentPromptBuilder/prompts.js';
import { capTotalPrompt } from './CodeEnrichmentPromptBuilder/token-budget.js';

/**
 * Builds LLM prompts for code enrichment based on strategy and context.
 * Each strategy produces a system + user message pair.
 * SA4E-387: Uses inputBudget to derive bodyBudget and cap total prompt.
 */
export class CodeEnrichmentPromptBuilder {
  /**
   * Build LLM messages for a given strategy and symbol context.
   * @param strategy - Which enrichment strategy to apply
   * @param context - Symbol metadata and source content
   * @param inputBudget - Dynamic token budget for this call (from BudgetGuard). Falls back to PROMPT_TOKEN_CAP.
   * @returns Array of LLM messages (system + user)
   */
  build(strategy: EnrichmentStrategy, context: SymbolContext, inputBudget?: number): LLMMessage[] {
    // Derive body budget: 70% for body, 30% for schema/sig/prompt overhead
    const bodyBudget = inputBudget ? Math.floor(inputBudget * 0.7) : 4000;
    const messages = this.buildForStrategy(strategy, context, bodyBudget);
    // Final safety net: cap the TOTAL prompt so no symbol can overflow the model
    // context window, regardless of how body/pseudo-code/schema accumulated.
    return capTotalPrompt(messages, inputBudget);
  }

  /** Dispatch to the per-strategy builder (pre-cap). */
  private buildForStrategy(strategy: EnrichmentStrategy, context: SymbolContext, bodyBudget: number): LLMMessage[] {
    switch (strategy) {
      case 'CLASS_SUMMARY': return classMessages(context, bodyBudget);
      case 'FUNCTION_SUMMARY': return functionMessages(context, bodyBudget);
      case 'TAG_EXTRACTION': return tagMessages(context, bodyBudget);
      case 'PEGA_SUMMARY': return pegaMessages(context, bodyBudget);
      case 'METADATA_SUMMARY': return metadataMessages(context, bodyBudget);
    }
  }
}