/**
 * Real design-quality static analysis rules (SA4E-438, user-approved scope).
 *
 * Replaces the placeholder TODO/FIX heuristic (SA4E-393 TDD Addendum) with
 * genuine, statically-checkable design-quality rules applied to design
 * artifacts (.html/.css/.tsx/... — see fs.adapter DESIGN_FILE_EXTENSIONS):
 *
 *   A1 <img> without alt                 HIGH   (a11y)
 *   A2 empty <button>/<a>                HIGH   (a11y)
 *   A3 onClick on div/span w/o role      MEDIUM (a11y)
 *   B1 fixed px width ≥300               MEDIUM (layout/responsive)
 *   B2 position:absolute overuse (>5)    MEDIUM (layout)
 *   B3 stylesheet >200 lines, no @media  MEDIUM (layout/responsive)
 *   C1 ≥3 distinct hardcoded colors      LOW    (design tokens)
 *   C2 !important usage                  LOW    (consistency)
 *   C3 magic spacing (off 4/8 scale)     LOW    (consistency)
 *   D1 inline style object               LOW    (component quality)
 *   D2 .map() JSX without key            MEDIUM (component correctness)
 *   D3 component file >300 lines         LOW    (maintainability)
 *   D4 pending-work markers TODO/FIX     LOW    (work-in-progress)
 *
 * Scoring (report.generator): normalized cleanliness — a file FAILS the gate
 * only when it has ≥1 HIGH or MEDIUM finding; LOW findings are triage info.
 *
 * All rules are heuristic static checks — findings carry file + line so the
 * developer can jump straight to the code. CAP limits findings per rule per
 * file to keep reports actionable.
 */

import { RuleHit, DesignRule, CAP_PER_RULE } from "./design-rules.types";
import { RULES_A11Y_LAYOUT } from "./design-rules.a11y-layout";
import { RULES_TOKENS_COMPONENT } from "./design-rules.tokens-component";
import { RULES_SLOP_STYLE } from "./design-rules.slop-style";
import { RULES_SLOP_CONTENT } from "./design-rules.slop-content";

export type { RuleSeverity, RuleMatch, DesignRule, RuleHit } from "./design-rules.types";

/** The 30 rules in catalogue order: 13 base (A1-D4) then 17 Impeccable-derived. */
export const DESIGN_RULES: DesignRule[] = [
  ...RULES_A11Y_LAYOUT,
  ...RULES_TOKENS_COMPONENT,
  ...RULES_SLOP_STYLE,
  ...RULES_SLOP_CONTENT,
];

/**
 * Run all applicable rules against one file's content.
 * @param ext - file extension WITHOUT dot (e.g. "tsx", "css"); "" = treated as HTML (rendered page)
 */
export function runDesignRules(content: string, ext: string, capPerRule = CAP_PER_RULE): RuleHit[] {
  const normalizedExt = (ext || "html").replace(".", "").toLowerCase();
  const hits: RuleHit[] = [];
  for (const rule of DESIGN_RULES) {
    if (rule.extensions.length > 0 && !rule.extensions.includes(normalizedExt)) continue;
    for (const m of rule.check(content).slice(0, capPerRule)) {
      hits.push({ id: rule.id, severity: rule.severity, label: rule.label, line: m.line, detail: m.detail });
    }
  }
  return hits;
}
