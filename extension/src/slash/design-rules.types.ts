/**
 * Design rule types, constants and shared matching helpers (SA4E-438).
 * Split from design-rules.ts; see that file for the rule catalogue.
 */
export type RuleSeverity = "low" | "medium" | "high";

export interface RuleMatch {
  line: number;
  detail: string;
}

export interface DesignRule {
  id: string;
  severity: RuleSeverity;
  /** File extensions (without dot) the rule applies to; empty = all. */
  extensions: string[];
  label: string;
  check: (content: string) => RuleMatch[];
}

export interface RuleHit {
  id: string;
  severity: RuleSeverity;
  label: string;
  line: number;
  detail: string;
}

export const EXT_UI = ["html", "htm", "tsx", "jsx", "svelte", "vue"];
export const EXT_STYLE = ["css", "scss", "sass", "less"];
export const EXT_UI_AND_STYLE = [...EXT_UI, ...EXT_STYLE];

/** Max findings reported per rule per file (keeps reports actionable). */
export const CAP_PER_RULE = 3;

export function lineOf(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

/**
 * Find the end index of the JSX/HTML tag starting at `start`.
 * The tag ends at the first `>` at brace depth 0 — a naive `[^>]*>` regex
 * truncates at the `>` of arrow functions (`=>`) inside JSX attributes and
 * produced false positives (SA4E-438: an <img> WITH alt was flagged because
 * its multi-line tag contained `onClick={() => …}` before the alt attribute).
 */
export function findTagEnd(content: string, start: number): number {
  let depth = 0;
  const limit = Math.min(content.length, start + 5000);
  for (let i = start; i < limit; i++) {
    const ch = content[i];
    if (ch === "{") depth++;
    else if (ch === "}") depth = Math.max(0, depth - 1);
    else if (ch === ">" && depth === 0) return i;
  }
  return -1;
}

/** Run a global regex, return up to 9 matches with line numbers. */
export function matchLines(content: string, source: string, flags = "gi"): RuleMatch[] {
  const rx = new RegExp(source, flags.includes("g") ? flags : flags + "g");
  const out: RuleMatch[] = [];
  let m: RegExpExecArray | null;
  while ((m = rx.exec(content)) !== null && out.length < 9) {
    out.push({ line: lineOf(content, m.index), detail: m[0].trim().slice(0, 80) });
    if (m.index === rx.lastIndex) rx.lastIndex++;
  }
  return out;
}
