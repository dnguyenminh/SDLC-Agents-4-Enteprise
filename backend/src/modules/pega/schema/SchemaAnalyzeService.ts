/**
 * SA4E-214 — SchemaAnalyzeService (facade): dual-strategy analysis coordinator.
 * Rule-based parsing first (fast, deterministic), LLM fallback when empty (BR-10).
 * R-03: Wraps harness content in delimiters for LLM prompts.
 *
 * Implementation submodules (same directory):
 * - schema-rule-extractor.ts — deterministic field/sub-section extraction
 */

import type { Logger } from 'pino';
import type { FieldDescriptor, ExtractionHints } from '../../../models/pega-schema.models.js';
import { extractFieldsRuleBased, detectSubSections } from './schema-rule-extractor.js';

/** Response structure from analyze operation */
export interface AnalyzeResult {
  fields: FieldDescriptor[];
  sub_sections: string[];
  rule_based_coverage: number;
  llm_fallback_used: boolean;
  hints: Partial<ExtractionHints>;
}

/** Minimal LLM interface for fallback extraction */
export interface ILlmAnalyzer {
  analyzeHarness(harnessJson: Record<string, unknown>, ruleType: string): Promise<{
    fields: FieldDescriptor[];
    sub_sections: string[];
  }>;
}

/**
 * Dual-strategy analysis: rule-based field extraction first, LLM fallback.
 * Pattern: Strategy — switches between rule-based and LLM approaches.
 */
export class SchemaAnalyzeService {
  constructor(
    private readonly logger: Logger,
    private readonly llmAnalyzer: ILlmAnalyzer | null,
  ) {}

  /**
   * Analyze harness/section JSON to extract fields and sub-sections.
   * @param harnessJson Raw harness or section JSON from Pega
   * @param ruleType Pega rule class (e.g., "Rule-Obj-Flow")
   * @param depth Current recursion depth (0 = root harness)
   */
  async analyze(
    harnessJson: Record<string, unknown>,
    ruleType: string,
    depth: number,
  ): Promise<AnalyzeResult> {
    // Phase 1: Rule-based extraction (deterministic, fast)
    const ruleBasedFields = extractFieldsRuleBased(harnessJson, ruleType);
    const subSections = detectSubSections(harnessJson);
    const coverage = this.calculateCoverage(ruleBasedFields, harnessJson);

    // If rule-based found fields, use them (no LLM needed)
    if (ruleBasedFields.length > 0) {
      return {
        fields: ruleBasedFields,
        sub_sections: subSections,
        rule_based_coverage: coverage,
        llm_fallback_used: false,
        hints: this.deriveHints(ruleBasedFields, ruleType),
      };
    }

    // Phase 2: LLM fallback for stream-rendered or empty harnesses
    const llmResult = await this.tryLlmFallback(harnessJson, ruleType, depth, subSections);
    if (llmResult) return llmResult;

    // Fallback: return whatever we have (may be empty)
    return {
      fields: ruleBasedFields,
      sub_sections: subSections,
      rule_based_coverage: coverage,
      llm_fallback_used: false,
      hints: {},
    };
  }

  /** LLM fallback attempt; returns null when unavailable/unneeded/failed. */
  private async tryLlmFallback(
    harnessJson: Record<string, unknown>, ruleType: string, depth: number,
    subSections: string[],
  ): Promise<AnalyzeResult | null> {
    if (!this.llmAnalyzer || !this.isLlmFallbackNeeded(harnessJson)) return null;
    this.logger.info({ ruleType, depth }, '[schema-analyze] Rule-based empty — LLM fallback');
    try {
      const llmResult = await this.llmAnalyzer.analyzeHarness(harnessJson, ruleType);
      return {
        fields: llmResult.fields,
        sub_sections: [...subSections, ...llmResult.sub_sections],
        rule_based_coverage: 0,
        llm_fallback_used: true,
        hints: this.deriveHints(llmResult.fields, ruleType),
      };
    } catch (err: any) {
      this.logger.warn({ err: err.message, ruleType }, '[schema-analyze] LLM fallback failed');
      return null;
    }
  }

  /** Determine if LLM fallback should run (stream-rendered harness detection). */
  private isLlmFallbackNeeded(json: Record<string, unknown>): boolean {
    // Stream-rendered harness: has pySourceStream but no structured pySections
    if (json['pySourceStream'] && !json['pySections']) return true;
    // Empty structured data: no pxRuleReferences, no pyRows
    if (!json['pxRuleReferences'] && !json['pyRows'] && !json['pySections']) return true;
    return false;
  }

  /** Calculate coverage as ratio of known fields vs total non-internal keys. */
  private calculateCoverage(fields: FieldDescriptor[], json: Record<string, unknown>): number {
    const totalKeys = Object.keys(json).filter(
      k => !k.startsWith('px') && !k.startsWith('pz'),
    ).length;
    if (totalKeys === 0) return 0;
    return Math.min(100, Math.round((fields.length / totalKeys) * 100));
  }

  /** Derive extraction hints from fields. */
  private deriveHints(fields: FieldDescriptor[], ruleType: string): Partial<ExtractionHints> {
    const logicFields = fields.filter(f => f.category === 'logic');
    const primary = logicFields.length > 0 ? logicFields[0].path : null;

    // Infer logic structure from rule type
    let structure: string | null = null;
    if (ruleType.includes('Flow')) structure = 'sequential_steps';
    else if (ruleType.includes('Decision')) structure = 'decision_tree';
    else if (ruleType.includes('Activity')) structure = 'procedural_steps';

    // SA4E-222 Scope B: array-typed logic fields are candidate nested logic paths.
    const nestedLogicPaths = logicFields
      .filter(f => f.type === 'array')
      .map(f => f.path);

    return {
      primary_logic_field: primary,
      logic_structure: structure,
      summary_focus: null,
      // Backward compatible (optional in schema): empty when no array logic found.
      nested_logic_paths: nestedLogicPaths,
    };
  }
}
