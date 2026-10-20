/**
 * SA4E-107: Prompt builder for code enrichment LLM calls.
 * Builds structured prompts per enrichment strategy (CLASS, FUNCTION, PEGA).
 * BR-18 facade — strategy templates live in ./CodeEnrichmentPromptBuilder/prompts.ts,
 * token budgeting in ./CodeEnrichmentPromptBuilder/token-budget.ts.
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
 */
export class CodeEnrichmentPromptBuilder {
  /**
   * Build LLM messages for a given strategy and symbol context.
   * @param strategy - Which enrichment strategy to apply
   * @param context - Symbol metadata and source content
   * @returns Array of LLM messages (system + user)
   */
  build(strategy: EnrichmentStrategy, context: SymbolContext): LLMMessage[] {
    const messages = this.buildForStrategy(strategy, context);
    // Final safety net: cap the TOTAL prompt so no symbol can overflow the model
    // context window, regardless of how body/pseudo-code/schema accumulated.
    return capTotalPrompt(messages);
  }

  /** Dispatch to the per-strategy builder (pre-cap). */
  private buildForStrategy(strategy: EnrichmentStrategy, context: SymbolContext): LLMMessage[] {
    switch (strategy) {
      case 'CLASS_SUMMARY': return classMessages(context);
      case 'FUNCTION_SUMMARY': return functionMessages(context);
      case 'TAG_EXTRACTION': return tagMessages(context);
      case 'PEGA_SUMMARY': return pegaMessages(context);
      case 'METADATA_SUMMARY': return metadataMessages(context);
    }
  }
}
