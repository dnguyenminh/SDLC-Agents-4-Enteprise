/**
 * SA4E-106 — PegaContentExtractor: converts raw Pega rule JSON into readable,
 * structured text (identity, parameters, steps, expressions, Java snippets) so
 * the LLM enrichment pipeline can generate summary + pseudo code + tags.
 *
 * SA4E-222 — `buildLogic` dispatch order (FR-B-4 / FSD §4.3):
 *   dedicated extractor → schema-driven renderer → generic extractor → metadata fallback.
 * The deterministic `PegaGenericLogicExtractor` replaces the former shallow
 * `buildLogicBlocks` fallback. `isInternalKey` / `INTERNAL_PREFIXES` / `scalar` /
 * `scalarStr` are exported for reuse by the new extractors (no duplication).
 */

import { PegaLogicNormalizer } from './PegaLogicNormalizer.js';
import { extractGenericLogic } from './extraction/PegaGenericLogicExtractor.js';
import { renderSchemaDrivenLogic } from './extraction/SchemaDrivenRenderer.js';
import type { ExtractOptions } from './extraction/types.js';
import { extractNestedLogic } from './PegaNestedLogicExtractor.js';
import { extractFlowStructure } from './PegaFlowExtractor.js';
import { extractCaseTypeLifecycle } from './PegaCaseTypeExtractor.js';

/** Field prefixes considered Pega internal metadata (px/pz/__) — excluded from dumps. */
export const INTERNAL_PREFIXES = ['px', 'pz', '__'];

/** Max items rendered per array in structured blocks. */
const MAX_DUMP_ITEMS = 200;

/** Max lines for the generic scalar fallback dump. */
const MAX_DUMP_LINES = 250;

/**
 * Max characters kept per scalar field value in the dump. A single Pega data field
 * can hold an embedded binary asset (e.g. a base64-encoded ZIP/image in
 * Data-Mobile-Application-Branding-Asset.pyAssetSource) hundreds of KB long. Those
 * blobs are not readable logic for the LLM and overflow the context window, so each
 * field value is bounded. Logic blocks have their own item/line caps.
 */
const MAX_FIELD_VALUE_CHARS = 2000;

/**
 * A scalar value at/above this length is treated as a candidate "binary blob" and
 * tested for base64 content. Below it, values are kept (possibly truncated) as-is.
 */
const BINARY_FIELD_MIN_CHARS = 1024;

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

/**
 * Heuristic: does a long scalar string look like an embedded binary blob (base64)?
 * Checks only sufficiently long values (perf) and requires a high ratio of base64
 * characters, so ordinary long text (sentences, code) is NOT misclassified.
 * @param value Candidate field value.
 * @returns true when the value is long and overwhelmingly base64-like.
 */
export function looksLikeBinaryBlob(value: string): boolean {
  if (value.length < BINARY_FIELD_MIN_CHARS) return false;
  // Sample the head to avoid scanning hundreds of KB.
  const sample = value.slice(0, 4096);
  const base64ish = sample.replace(/[^A-Za-z0-9+/=\r\n]/g, '');
  // >= 97% of sampled chars are in the base64 alphabet, and there is little whitespace
  // → an encoded blob, not prose/code.
  const ratio = base64ish.length / sample.length;
  const whitespace = (sample.match(/\s/g)?.length ?? 0) / sample.length;
  return ratio >= 0.97 && whitespace < 0.1;
}

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

/** Build the identity header: rule type, class, name, ruleset. */
function buildHeader(ruleJson: PegaRuleJson): string {
  const name = scalar(
    ruleJson.pyRuleName, ruleJson.pyActivityName, ruleJson.pyModelName,
    ruleJson.pyTransformName, ruleJson.pyLabel,
  ) || 'Unnamed';

  const ruleset = scalarStr(ruleJson.pyRuleset);
  const version = scalarStr(ruleJson.pyRulesetVersion);

  const lines = [
    `RULE TYPE: ${scalar(ruleJson.pxObjClass) || 'Unknown'}`,
    `CLASS: ${scalarStr(ruleJson.pyClassName) || '@baseclass'}`,
    `NAME: ${name}`,
    `RULESET: ${ruleset || '-'}${version ? ` (${version})` : ''}`,
  ];

  const label = scalarStr(ruleJson.pyLabel, ruleJson.pyDescription, ruleJson.pyShortDescription);
  if (label && label !== name) lines.push(`LABEL: ${label}`);

  return lines.join('\n');
}

/** Build the parameters + pages block (activity/flow I/O). */
function buildParameters(ruleJson: PegaRuleJson): string | null {
  const out: string[] = [];

  const rawParams = ruleJson.pyParameters;
  if (Array.isArray(rawParams) && rawParams.length > 0) {
    out.push('PARAMETERS:');
    for (const p of rawParams.slice(0, MAX_DUMP_ITEMS)) {
      if (typeof p !== 'object' || !p) continue;
      const name = scalarStr((p as Record<string, unknown>).pyParameterName, (p as Record<string, unknown>).pyName, (p as Record<string, unknown>).pyLabel) || scalar((p as Record<string, unknown>).pyPropertyName);
      if (!name) continue;
      const mode = scalarStr((p as Record<string, unknown>).pyMode, (p as Record<string, unknown>).pyType) || 'input';
      const def = scalar((p as Record<string, unknown>).pyDefaultValue, (p as Record<string, unknown>).pyValue);
      out.push(`  - ${name}${def ? ` = ${def}` : ''} (${mode})`);
    }
  }

  const rawPages = ruleJson.pyPages;
  if (Array.isArray(rawPages) && rawPages.length > 0) {
    out.push('PAGES:');
    for (const pg of rawPages.slice(0, MAX_DUMP_ITEMS)) {
      if (typeof pg !== 'object' || !pg) continue;
      const name = scalarStr((pg as Record<string, unknown>).pyName, (pg as Record<string, unknown>).pyPageName) || scalar((pg as Record<string, unknown>).pyClassName);
      if (!name) continue;
      out.push(`  - ${name} (${scalarStr((pg as Record<string, unknown>).pyMode) || 'page'})`);
    }
  }

  return out.length > 0 ? out.join('\n') : null;
}

/** Build the logic block for the rule type (SA4E-222 dispatch order). */
function buildLogic(ruleJson: PegaRuleJson, opts?: ExtractOptions): string | null {
  const pxObjClass = String(ruleJson.pxObjClass || '');

  switch (pxObjClass) {
    case 'Rule-Obj-Activity':
      return `LOGIC (Activity Steps):\n${PegaLogicNormalizer.normalizeActivity(ruleJson)}`;
    case 'Rule-Obj-Model':
      return `LOGIC (Data Transform):\n${PegaLogicNormalizer.normalizeDataTransform(ruleJson)}`;
    case 'Rule-Obj-Flow':
      // Reconstruct the real flow (shapes + connectors) from pyModelProcess so the
      // LLM sees the actual process, not just metadata. Fall back to generic
      // logic-array rendering if the export has no model process.
      return extractFlowStructure(ruleJson) ?? extractGenericLogic(ruleJson, opts);
    case 'Rule-Obj-CaseType':
      // Reconstruct the case lifecycle (stages → processes, primary + alternate)
      // from pyStages/pyAlternateStages — mirrors the Pega Case Lifecycle UI.
      return extractCaseTypeLifecycle(ruleJson) ?? extractGenericLogic(ruleJson, opts);
    case 'Rule-Obj-DecisionTable':
    case 'Rule-Declare-DecisionTable':
      return buildDecisionTable(ruleJson);
    case 'Rule-Obj-When':
    case 'Rule-Declare-Expressions':
    case 'Rule-Declare-Pages':
      return buildExpressionBlock(ruleJson);
    default: {
      // SA4E-222: schema-driven → generic → expression (preserves existing logic)
      if (opts?.nestedLogicPaths?.length) {
        const sd = renderSchemaDrivenLogic(ruleJson, opts.nestedLogicPaths);
        if (sd) return sd;
      }
      const parts: string[] = [];
      if (opts?.genericEnabled !== false) {
        const generic = extractGenericLogic(ruleJson, opts);
        if (generic) parts.push(generic);
      }
      const expr = buildExpressionBlock(ruleJson);
      if (expr) parts.push(expr);
      return parts.length > 0 ? parts.join('\n\n') : null;
    }
  }
}

/** Build readable rows for a Pega decision table. */
function buildDecisionTable(ruleJson: PegaRuleJson): string | null {
  const rows: unknown[] =
    (ruleJson.pyDecisionRules as unknown[]) || (ruleJson.pyTableRows as unknown[]) || (ruleJson.pyRows as unknown[]);
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const lines = ['LOGIC (Decision Table):'];
  for (let i = 0; i < rows.length && i < MAX_DUMP_ITEMS; i++) {
    const row = rows[i];
    if (typeof row !== 'object' || !row) continue;
    const rec = row as Record<string, unknown>;
    const when = scalarStr(rec.pyWhenCondition, rec.pyWhenName, rec.pyCondition, rec.pyInput);
    const result = scalarStr(rec.pyResult, rec.pyResultValue, rec.pyValue) || scalar(rec.pyOutput);
    lines.push(`  - ${when || `Row ${i + 1}`}: ${result || ''}`);
  }
  return lines.join('\n');
}

/**
 * Build readable expression fields for When / Declare rules.
 * Prefers nested logic (real formula/conditions) over top-level scalar scan,
 * since declarative rules store their logic in nested arrays/objects.
 */
function buildExpressionBlock(ruleJson: PegaRuleJson): string | null {
  const nested = extractNestedLogic(ruleJson);
  if (nested) return nested;

  const lines: string[] = [];
  for (const key of ['pyWhenText', 'pyExpression', 'pyFormula', 'pyWhenCondition', 'pyDescription']) {
    const value = ruleJson[key];
    if (typeof value === 'string' && value.trim()) lines.push(`${key}: ${value.trim()}`);
  }
  return lines.length > 0 ? `LOGIC (Expression):\n${lines.join('\n')}` : null;
}

/** Extract top-level Java code fields (snippets, Code-Java rule payloads). */
function buildJavaBlock(ruleJson: PegaRuleJson): string | null {
  const out: string[] = [];
  for (const key of Object.keys(ruleJson)) {
    if (!key.toLowerCase().includes('java')) continue;
    const value = ruleJson[key];
    if (typeof value === 'string' && value.trim()) out.push(`${key}:\n${value.trim()}`);
  }
  return out.length > 0 ? `JAVA:\n${out.join('\n\n')}` : null;
}

/**
 * Scalar-only fallback dump; arrays/objects are covered by logic blocks.
 * Binary/base64 blobs are dropped (not readable logic; they overflow the LLM
 * context), and every value is truncated to MAX_FIELD_VALUE_CHARS so a single huge
 * field cannot blow the prompt budget. Dropped blobs set `flags.binaryStripped`.
 * @param ruleJson - Raw Pega rule JSON.
 * @param flags - Mutable sink; `binaryStripped` is set true when a blob is dropped.
 */
function buildFieldDump(ruleJson: PegaRuleJson, flags: { binaryStripped: boolean }): string | null {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(ruleJson)) {
    if (lines.length >= MAX_DUMP_LINES) break;
    if (isInternalKey(key) || isHeaderKey(key)) continue;
    if (value === null || value === undefined) continue;
    if (Array.isArray(value) || typeof value === 'object') continue;
    const s = String(value).trim();
    if (!s) continue;
    // Drop embedded binary assets (e.g. base64 ZIP/image in branding-asset rules).
    if (looksLikeBinaryBlob(s)) {
      flags.binaryStripped = true;
      lines.push(`${key}: [binary content omitted, ${s.length} chars]`);
      continue;
    }
    // Bound each value so an unusually long (but non-binary) field cannot overflow.
    const bounded = s.length > MAX_FIELD_VALUE_CHARS ? s.slice(0, MAX_FIELD_VALUE_CHARS) + '…[truncated]' : s;
    lines.push(`${key}: ${bounded}`);
  }
  return lines.length > 0 ? `FIELDS:\n${lines.join('\n')}` : null;
}

/** Keys already rendered in the header — excluded from the scalar dump. */
function isHeaderKey(key: string): boolean {
  return [
    'pxObjClass', 'pyClassName', 'pyRuleName', 'pyActivityName', 'pyModelName',
    'pyTransformName', 'pyRuleset', 'pyRulesetVersion', 'pyLabel', 'pyDescription',
    'pyShortDescription', 'pyParameters', 'pyPages',
  ].includes(key);
}

/** Pega internal metadata fields (px/pz/__) — always excluded. Exported for reuse. */
export function isInternalKey(key: string): boolean {
  return INTERNAL_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/** First non-empty scalar (string/number/boolean) among candidate values. */
export function scalar(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  }
  return undefined;
}

/** First non-empty string among candidate values. */
export function scalarStr(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return undefined;
}
