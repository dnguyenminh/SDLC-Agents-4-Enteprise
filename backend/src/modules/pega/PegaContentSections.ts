/**
 * SA4E-106 — Pega content section builders.
 * Extracted from PegaContentExtractor.ts: header, parameters, logic dispatch
 * (SA4E-222 order), decision table, expressions, Java block and field dump.
 */

import { PegaLogicNormalizer } from './PegaLogicNormalizer.js';
import { extractGenericLogic } from './extraction/PegaGenericLogicExtractor.js';
import { renderSchemaDrivenLogic } from './extraction/SchemaDrivenRenderer.js';
import type { ExtractOptions } from './extraction/types.js';
import { extractNestedLogic } from './PegaNestedLogicExtractor.js';
import { extractFlowStructure } from './PegaFlowExtractor.js';
import { extractCaseTypeLifecycle } from './PegaCaseTypeExtractor.js';
import type { PegaRuleJson } from './PegaContentExtractor.js';
import { scalar, scalarStr } from './PegaScalarHelpers.js';

/** Max items rendered per array in structured blocks. */
const MAX_DUMP_ITEMS = 200;

/** Build the identity header: rule type, class, name, ruleset. */
export function buildHeader(ruleJson: PegaRuleJson): string {
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
export function buildParameters(ruleJson: PegaRuleJson): string | null {
  const out: string[] = [];

  const rawParams = ruleJson.pyParameters;
  if (Array.isArray(rawParams) && rawParams.length > 0) {
    out.push('PARAMETERS:');
    for (const p of rawParams.slice(0, MAX_DUMP_ITEMS)) {
      const line = formatParameter(p);
      if (line) out.push(line);
    }
  }

  const rawPages = ruleJson.pyPages;
  if (Array.isArray(rawPages) && rawPages.length > 0) {
    out.push('PAGES:');
    for (const pg of rawPages.slice(0, MAX_DUMP_ITEMS)) {
      const line = formatPage(pg);
      if (line) out.push(line);
    }
  }

  return out.length > 0 ? out.join('\n') : null;
}

/** Format one parameter entry ("name = default (mode)"). */
function formatParameter(p: unknown): string | null {
  if (typeof p !== 'object' || !p) return null;
  const rec = p as Record<string, unknown>;
  const name = scalarStr(rec.pyParameterName, rec.pyName, rec.pyLabel) || scalar(rec.pyPropertyName);
  if (!name) return null;
  const mode = scalarStr(rec.pyMode, rec.pyType) || 'input';
  const def = scalar(rec.pyDefaultValue, rec.pyValue);
  return `  - ${name}${def ? ` = ${def}` : ''} (${mode})`;
}

/** Format one page entry ("name (mode)"). */
function formatPage(pg: unknown): string | null {
  if (typeof pg !== 'object' || !pg) return null;
  const rec = pg as Record<string, unknown>;
  const name = scalarStr(rec.pyName, rec.pyPageName) || scalar(rec.pyClassName);
  if (!name) return null;
  return `  - ${name} (${scalarStr(rec.pyMode) || 'page'})`;
}

/** Build the logic block for the rule type (SA4E-222 dispatch order). */
export function buildLogic(ruleJson: PegaRuleJson, opts?: ExtractOptions): string | null {
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
    default:
      return buildGenericLogic(ruleJson, opts);
  }
}

/** SA4E-222 fallback: schema-driven → generic → expression (preserves existing logic). */
function buildGenericLogic(ruleJson: PegaRuleJson, opts?: ExtractOptions): string | null {
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

/** Build readable rows for a Pega decision table. */
export function buildDecisionTable(ruleJson: PegaRuleJson): string | null {
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
export function buildExpressionBlock(ruleJson: PegaRuleJson): string | null {
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
export function buildJavaBlock(ruleJson: PegaRuleJson): string | null {
  const out: string[] = [];
  for (const key of Object.keys(ruleJson)) {
    if (!key.toLowerCase().includes('java')) continue;
    const value = ruleJson[key];
    if (typeof value === 'string' && value.trim()) out.push(`${key}:\n${value.trim()}`);
  }
  return out.length > 0 ? `JAVA:\n${out.join('\n\n')}` : null;
}
