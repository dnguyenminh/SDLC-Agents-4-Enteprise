/**
 * SA4E-106 — PegaContentExtractor (facade): converts raw Pega rule JSON into
 * readable, structured text (identity, parameters, steps, expressions, Java
 * snippets) so the LLM enrichment pipeline can generate summary + pseudo code
 * + tags.
 *
 * SA4E-222 — `buildLogic` dispatch order (FR-B-4 / FSD §4.3):
 *   dedicated extractor → schema-driven renderer → generic extractor → metadata fallback.
 *
 * Implementation submodules (same directory):
 * - PegaScalarHelpers.ts   — internal-key filters, scalar selection, blob detection
 * - PegaContentSections.ts — section builders + logic dispatch
 */

import type { ExtractOptions } from './extraction/types.js';
import {
  buildHeader, buildParameters, buildLogic, buildJavaBlock,
} from './PegaContentSections.js';
import { buildFieldDump } from './PegaFieldDumper.js';
import {
  INTERNAL_PREFIXES, isInternalKey, looksLikeBinaryBlob, scalar, scalarStr,
} from './PegaScalarHelpers.js';

/** JSON-compatible object shape operated on (all values optional). */
export type PegaRuleJson = Record<string, unknown>;

/** Result of a content extraction that also reports binary stripping (SA4E-338 B2). */
export interface ExtractResult {
  /** Readable, bounded text for LLM enrichment. */
  content: string;
  /**
   * True when at least one field value was dropped as binary/base64 blob. Callers
   * (PegaSymbolSync) use this to index the rule metadata-only and skip LLM enrichment
   * when there is no meaningful logic left to summarize.
   */
  binaryStripped: boolean;
}

// Preserve the original public API at this module path (extractors reuse these).
export { INTERNAL_PREFIXES, isInternalKey, looksLikeBinaryBlob, scalar, scalarStr };

/**
 * Extract readable content from a Pega rule JSON payload.
 * @param ruleJson - Raw Pega rule JSON (from Pega API or export)
 * @param opts - Optional extraction options (schema-driven paths, generic toggle)
 * @returns Structured text covering identity, parameters, logic and Java code
 */
export function extractRuleContent(ruleJson: PegaRuleJson, opts?: ExtractOptions): string {
  return extractRuleContentWithFlags(ruleJson, opts).content;
}

/**
 * Like {@link extractRuleContent}, but also reports whether binary/base64 field
 * blobs were stripped (SA4E-338 B2). The caller decides whether the remaining
 * content is worth enriching with the LLM.
 * @param ruleJson - Raw Pega rule JSON.
 * @param opts - Optional extraction options.
 * @returns Readable content plus a `binaryStripped` flag.
 */
export function extractRuleContentWithFlags(ruleJson: PegaRuleJson, opts?: ExtractOptions): ExtractResult {
  const sections: string[] = [];
  const flags = { binaryStripped: false };

  sections.push(buildHeader(ruleJson));

  const parameters = buildParameters(ruleJson);
  if (parameters) sections.push(parameters);

  const logic = buildLogic(ruleJson, opts);
  if (logic) sections.push(logic);

  const java = buildJavaBlock(ruleJson);
  if (java) sections.push(java);

  const fields = buildFieldDump(ruleJson, flags);
  if (fields) sections.push(fields);

  return { content: sections.join('\n\n'), binaryStripped: flags.binaryStripped };
}
