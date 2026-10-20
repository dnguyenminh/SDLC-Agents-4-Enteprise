/**
 * SA4E-95 — LLM-based section discovery for HarnessParser.
 * Extracted from HarnessParser.ts: Strategy 2 complements rule-based parsing.
 * Non-fatal by design: LLM failure degrades to rule-based output only.
 */

import type { ParsedSection } from '../models/ParsedSection.js';
import type { ExtractedField } from '../models/ExtractedField.js';
import type { ResolvedContext } from '../models/ResolvedContext.js';
import type { ILlmSectionExtractor, LlmExtractedSection, ParseContext } from './HarnessParserTypes.js';

/**
 * Strategy 2: LLM-based extraction.
 * Returns ParsedSection[] from LLM analysis. Non-fatal: returns [] on failure.
 */
export async function extractSectionsViaLlm(
  extractor: ILlmSectionExtractor | undefined,
  harnessJson: Record<string, unknown>, ruleType: string, ctx: ParseContext,
): Promise<ParsedSection[]> {
  if (!extractor) return [];
  try {
    const llmResult = await extractor.extractSections(harnessJson, ruleType);
    return llmResult.map(s => convertLlmSection(s, ctx));
  } catch {
    return []; // LLM failure is non-fatal — rule-based output still available
  }
}

/** Convert LLM output to ParsedSection format. */
function convertLlmSection(llmSection: LlmExtractedSection, ctx: ParseContext): ParsedSection {
  const pageCtx: ResolvedContext = { className: ctx.primaryClass, objectPath: '', source: 'primary' };
  const fields: ExtractedField[] = llmSection.fields.map(f => ({
    propertyName: f.propertyName,
    pyFormat: f.type || 'pxTextInput',
    readOnly: false,
    label: f.description,
    required: f.required,
    pageContext: ctx.primaryClass,
  }));
  return {
    name: llmSection.name,
    sourceClass: ctx.primaryClass,
    bodyType: 'INCLUDE',
    pageContext: pageCtx,
    fields,
    children: [],
    depth: 0,
  };
}

/**
 * Merge rule-based and LLM-based sections.
 * LLM sections supplement rule-based: add new sections not found by rules,
 * and add new fields to existing sections.
 */
export function mergeSections(ruleSections: ParsedSection[], llmSections: ParsedSection[]): ParsedSection[] {
  if (llmSections.length === 0) return ruleSections;
  if (ruleSections.length === 0) return llmSections;

  const merged = [...ruleSections];
  const existingNames = new Set(ruleSections.map(s => s.name.toLowerCase()));

  for (const llmSection of llmSections) {
    const existing = merged.find(s => s.name.toLowerCase() === llmSection.name.toLowerCase());
    if (existing) {
      mergeMissingFields(existing, llmSection);
    } else {
      // New section from LLM — add it
      merged.push(llmSection);
    }
  }
  return merged;
}

/** Add LLM fields not already present in the rule-based section. */
function mergeMissingFields(existing: ParsedSection, llmSection: ParsedSection): void {
  const existingFieldNames = new Set(existing.fields.map(f => f.propertyName));
  for (const field of llmSection.fields) {
    if (!existingFieldNames.has(field.propertyName)) {
      existing.fields.push(field);
    }
  }
}
