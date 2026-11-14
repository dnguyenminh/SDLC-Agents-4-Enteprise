/**
 * SA4E-393 — Rule catalog for design_gate_list_rules.
 * Extracted from design-gate-tool.ts to meet ≤200 lines/file standard.
 */

import { DESIGN_RULES } from '../../slash/design-rules';
import type { DesignRule } from '../../slash/design-rules';

/** Base rule IDs (13 rules: A1–A3, B1–B3, C1–C3, D1–D4). */
export const BASE_RULE_IDS = new Set<string>([
  'A1', 'A2', 'A3',
  'B1', 'B2', 'B3',
  'C1', 'C2', 'C3',
  'D1', 'D2', 'D3', 'D4',
]);

export type RuleSource = 'base' | 'impeccable';

export interface RuleCatalogEntry {
  ruleId: string;
  severity: string;
  message: string;
  source: RuleSource;
  appliesTo: string[];
}

export interface RuleCatalogPayload {
  ok: true;
  ruleCount: number;
  threshold: number;
  thresholdSource: string;
  scoringFormula: string;
  scanScope: string;
  rules: RuleCatalogEntry[];
}

/** Build rule catalog payload from DESIGN_RULES. */
export function buildRuleCatalogPayload(threshold: number): string {
  const rules = (DESIGN_RULES as DesignRule[]).map((r): RuleCatalogEntry => ({
    ruleId: r.id,
    severity: r.severity,
    message: r.label,
    source: BASE_RULE_IDS.has(r.id) ? 'base' : 'impeccable',
    appliesTo: r.extensions,
  }));
  const payload: RuleCatalogPayload = {
    ok: true,
    ruleCount: rules.length,
    threshold,
    thresholdSource: `DEFAULT_THRESHOLD = parseFloat(env QUALITY_GATE_THRESHOLD || "0.8")`,
    scoringFormula:
      'score = 1 - (unique files with >=1 HIGH or MEDIUM finding) / (files in scan scope); clamped [0,1]; empty scope -> score 1.0 + vacuous-pass message "No design artifacts found in scan scope (0 files)". LOW findings are triage info and never fail a file. pass = score >= threshold (BR-11).',
    scanScope:
      '.html .htm .css .scss .sass .less .vue .svelte .tsx .jsx; SKIP_DIRS excluded (node_modules, .git, out, dist, build, coverage, .code-intel, .kiro, .opencode, .vscode, resources, webview-assets)',
    rules,
  };
  return JSON.stringify(payload, null, 2);
}