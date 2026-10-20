/**
 * SA4E-95 — Shared types for the HarnessParser module.
 * Extracted from HarnessParser.ts: parse context and LLM extractor contracts.
 */

import type { ParsedHarness, PageContext } from '../models/ParsedHarness.js';

/** Internal parse context passed through recursion */
export interface ParseContext { primaryClass: string; contextPages: PageContext[]; ruleType: string; }

/** LLM-extracted section info (output from LLM analysis) */
export interface LlmExtractedSection {
  name: string;
  description: string;
  fields: Array<{ propertyName: string; type: string; description: string; required: boolean }>;
}

/** Optional LLM service interface for section extraction. */
export interface ILlmSectionExtractor {
  /**
   * Ask LLM to analyze raw harness JSON and identify sections + fields.
   * @param harnessJson Raw harness JSON
   * @param ruleType The rule type (e.g. "Rule-Obj-Flow")
   * @returns Array of LLM-identified sections with fields
   */
  extractSections(harnessJson: Record<string, unknown>, ruleType: string): Promise<LlmExtractedSection[]>;
}

/** Interface for the harness parser */
export interface IHarnessParser {
  parse(harnessJson: Record<string, unknown>): Promise<ParsedHarness>;
}
