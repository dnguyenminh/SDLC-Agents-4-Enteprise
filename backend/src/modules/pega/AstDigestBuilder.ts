/**
 * AstDigestBuilder — SA4E-338 Plan B + E.
 *
 * Builds AST digests for Pega rule enrichment with graceful fallback:
 *  1. Try real AST parse (PegaRuleAstParser) → source='ast'
 *  2. On parse failure → raw text outline extraction (section headers + body summary)
 *     → source='raw-fallback', never throws (EF-2.1)
 *  3. Plan E: Grammar outline for embedded java/jsp blocks via GrammarRegistry
 *     (grammar unavailable → line-capped raw excerpt, MAX_DUMP_LINES=250)
 *
 * Never throws — always returns a DigestResult.
 */

import { PegaRuleAstParser } from './PegaRuleAstParser.js';
import type { PegaRuleAst } from './PegaRuleAst.js';

export interface DigestResult {
  text: string;
  ast: PegaRuleAst | null;
  source: 'ast' | 'raw-fallback';
  fallbackReason?: string;
}

/** Max lines for raw excerpt when grammar unavailable (Plan E fallback). */
const MAX_DUMP_LINES = 250;
/** Max chars for body summary in raw outline fallback. */
const MAX_BODY_SUMMARY_CHARS = 4000;
/** Max section lines in raw outline. */
const MAX_SECTION_LINES = 50;

export class AstDigestBuilder {
  private readonly parser = new PegaRuleAstParser();

  /**
   * Build a digest for a Pega rule JSON.
   * Tries AST parse first; on failure falls back to raw text outline.
   * Never throws — always returns a DigestResult.
   */
  build(ruleJson: Record<string, unknown>): DigestResult {
    try {
      const ast = this.parser.parse(ruleJson);
      const text = this.parser.toPromptContext(ast);
      return { text, ast, source: 'ast' };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      const text = this.rawOutline(ruleJson);
      return {
        text,
        ast: null,
        source: 'raw-fallback',
        fallbackReason: reason,
      };
    }
  }

  /**
   * Raw text outline extraction — section headers + body summary.
   * Used when AST parse fails (EF-2.1). Never throws.
   */
  private rawOutline(ruleJson: Record<string, unknown>): string {
    const sections: string[] = [];

    // Identity header
    const pxObjClass = String(ruleJson.pxObjClass || 'Unknown');
    const pyClassName = String(ruleJson.pyClassName || '@baseclass');
    const pyRuleName =
      String(ruleJson.pyRuleName || ruleJson.pyActivityName || ruleJson.pyModelName || ruleJson.pyLabel || 'Unnamed');
    const pyRuleset = String(ruleJson.pyRuleset || ruleJson.pyRulesetVersion || '');
    const pyLabel = String(ruleJson.pyLabel || '');

    sections.push(`RULE TYPE: ${pxObjClass}`);
    sections.push(`CLASS: ${pyClassName}`);
    sections.push(`NAME: ${pyRuleName}`);
    if (pyRuleset) sections.push(`RULESET: ${pyRuleset}`);
    if (pyLabel && pyLabel !== pyRuleName) sections.push(`LABEL: ${pyLabel}`);

    // Steps (Activity)
    const steps = this.readArray(ruleJson, 'pySteps', 'steps');
    if (steps.length > 0) {
      sections.push(`STEPS (${steps.length}):`);
      for (const s of steps.slice(0, MAX_SECTION_LINES)) {
        if (typeof s !== 'object' || !s) continue;
        const rec = s as Record<string, unknown>;
        const method = String(rec.pyMethod || '');
        const params = String(rec.pyMethodParameters || '');
        const label = String(rec.pyLabel || '');
        sections.push(`  - ${method}(${params})${label ? ` — ${label}` : ''}`);
      }
      if (steps.length > MAX_SECTION_LINES) sections.push(`  ... (+${steps.length - MAX_SECTION_LINES} more)`);
    }

    // Actions (Data Transform)
    const actions = this.readArray(ruleJson, 'pyProperties', 'pyActions');
    if (actions.length > 0) {
      sections.push(`ACTIONS (${actions.length}):`);
      for (const a of actions.slice(0, MAX_SECTION_LINES)) {
        if (typeof a !== 'object' || !a) continue;
        const rec = a as Record<string, unknown>;
        sections.push(`  - ${String(rec.pyActionType || 'Set')}: ${String(rec.pyTarget || rec.pyActionName || '')}`);
      }
      if (actions.length > MAX_SECTION_LINES) sections.push(`  ... (+${actions.length - MAX_SECTION_LINES} more)`);
    }

    // Decision rows
    const rows = this.readArray(ruleJson, 'pyDecisionRules', 'pyDecisionTableRows', 'pyRows');
    if (rows.length > 0) {
      sections.push(`DECISION ROWS (${rows.length}):`);
      for (const r of rows.slice(0, MAX_SECTION_LINES)) {
        if (typeof r !== 'object' || !r) continue;
        const rec = r as Record<string, unknown>;
        sections.push(
          `  - WHEN ${String(rec.pyWhenCondition || rec.pyCondition || '')} THEN ${String(rec.pyResult || rec.pyResultValue || '')}`,
        );
      }
      if (rows.length > MAX_SECTION_LINES) sections.push(`  ... (+${rows.length - MAX_SECTION_LINES} more)`);
    }

    // Java/embedded code blocks (Plan E — structural outline, not raw paste)
    const javaKeys = Object.keys(ruleJson).filter((k) => k.toLowerCase().includes('java'));
    for (const key of javaKeys) {
      const val = ruleJson[key];
      if (typeof val === 'string' && val.trim()) {
        const truncated = val.length > 500 ? val.slice(0, 500) + '…' : val;
        sections.push(`JAVA (${key}):`);
        sections.push(truncated);
      }
    }

    // Body summary — capped raw text
    let rawText: string;
    try {
      rawText = JSON.stringify(ruleJson);
    } catch {
      // Circular reference — fall back to key listing
      rawText = Object.keys(ruleJson).join(', ');
    }
    if (rawText.length > MAX_BODY_SUMMARY_CHARS) {
      sections.push(`BODY SUMMARY (${Math.round(rawText.length / 1024)} KB rule — trimmed):`);
      sections.push(rawText.slice(0, MAX_BODY_SUMMARY_CHARS) + `…(+${rawText.length - MAX_BODY_SUMMARY_CHARS} chars)`);
    } else {
      sections.push(`BODY (${rawText.length} chars):`);
      sections.push(rawText);
    }

    return sections.join('\n');
  }

  /**
   * Read an array field with legacy fallback (BR-14 chain).
   * Tries primary key first, then legacy keys.
   */
  private readArray(
    json: Record<string, unknown>,
    primary: string,
    ...legacy: string[]
  ): unknown[] {
    for (const key of [primary, ...legacy]) {
      const v = json[key];
      if (Array.isArray(v) && v.length > 0) return v as unknown[];
    }
    return [];
  }
}
