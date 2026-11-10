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

const EXT_UI = ["html", "htm", "tsx", "jsx", "svelte", "vue"];
const EXT_STYLE = ["css", "scss", "sass", "less"];
const EXT_UI_AND_STYLE = [...EXT_UI, ...EXT_STYLE];

/** Max findings reported per rule per file (keeps reports actionable). */
const CAP_PER_RULE = 3;

function lineOf(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

/** Run a global regex, return up to 9 matches with line numbers. */
function matchLines(content: string, source: string, flags = "gi"): RuleMatch[] {
  const rx = new RegExp(source, flags.includes("g") ? flags : flags + "g");
  const out: RuleMatch[] = [];
  let m: RegExpExecArray | null;
  while ((m = rx.exec(content)) !== null && out.length < 9) {
    out.push({ line: lineOf(content, m.index), detail: m[0].trim().slice(0, 80) });
    if (m.index === rx.lastIndex) rx.lastIndex++;
  }
  return out;
}

export const DESIGN_RULES: DesignRule[] = [
  {
    id: "A1",
    severity: "high",
    extensions: EXT_UI,
    label: "<img> missing alt attribute (accessibility)",
    check(content) {
      return matchLines(content, "<img\\b(?![^>]*\\balt\\s*=)[^>]*>");
    },
  },
  {
    id: "A2",
    severity: "high",
    extensions: EXT_UI,
    label: "Empty <button>/<a> — no accessible text (accessibility)",
    check(content) {
      return matchLines(content, "<(button|a)\\b[^>]*>\\s*</\\1>");
    },
  },
  {
    id: "A3",
    severity: "medium",
    extensions: EXT_UI,
    label: "onClick on <div>/<span> without role/tabIndex (keyboard inaccessible)",
    check(content) {
      const out: RuleMatch[] = [];
      const rx = /<(div|span)\b[^>]*onClick[^>]*>/gi;
      let m: RegExpExecArray | null;
      while ((m = rx.exec(content)) !== null && out.length < 9) {
        const tag = m[0];
        if (!/role\s*=/i.test(tag) && !/tab[iI]ndex\s*=/.test(tag)) {
          out.push({ line: lineOf(content, m.index), detail: `<${m[1]}> with onClick` });
        }
      }
      return out;
    },
  },
  {
    id: "B1",
    severity: "medium",
    extensions: EXT_UI_AND_STYLE,
    label: "Fixed pixel width ≥300px — not responsive",
    check(content) {
      return matchLines(content, "(?:min-|max-)?width\\s*:\\s*['\"]?([3-9]\\d{2,}|1\\d{3,})px");
    },
  },
  {
    id: "B2",
    severity: "medium",
    extensions: EXT_STYLE,
    label: "Excessive position:absolute — fragile layout",
    check(content) {
      const count = (content.match(/position\s*:\s*absolute/gi) || []).length;
      return count > 5 ? [{ line: 1, detail: `${count} uses of position:absolute` }] : [];
    },
  },
  {
    id: "B3",
    severity: "medium",
    extensions: EXT_STYLE,
    label: "Stylesheet >200 lines with no responsive breakpoint",
    check(content) {
      const lines = content.split("\n").length;
      if (lines > 200 && !/@media/i.test(content)) {
        return [{ line: 1, detail: `${lines} lines, no @media query` }];
      }
      return [];
    },
  },
  {
    id: "C1",
    severity: "low",
    extensions: EXT_UI_AND_STYLE,
    label: "Hardcoded color literals — prefer design tokens/CSS variables",
    check(content) {
      const hexes = content.match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi) || [];
      if (hexes.length < 3) return [];
      const distinct = new Set(hexes.map((h) => h.toLowerCase())).size;
      const first = content.search(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/i);
      return [{ line: lineOf(content, Math.max(0, first)), detail: `${distinct} distinct hardcoded colors` }];
    },
  },
  {
    id: "C2",
    severity: "low",
    extensions: EXT_STYLE,
    label: "!important usage — specificity smell",
    check(content) {
      return matchLines(content, "!important");
    },
  },
  {
    id: "C3",
    severity: "low",
    extensions: EXT_STYLE,
    label: "Magic spacing value (off 4/8 scale)",
    check(content) {
      const out: RuleMatch[] = [];
      const rx = /(?:margin|padding|gap)[^:;{}]*:\s*([^;{}]+)/gi;
      const SCALE = [0, 1, 2, 4, 8, 12, 16, 24, 32, 40, 48, 64, 96, 128];
      let m: RegExpExecArray | null;
      while ((m = rx.exec(content)) !== null && out.length < 9) {
        const vals = m[1].match(/(\d+(?:\.\d+)?)px/g) || [];
        const bad = vals.filter((v) => !SCALE.includes(parseFloat(v)));
        if (bad.length) out.push({ line: lineOf(content, m.index), detail: bad.join(" ") });
      }
      return out;
    },
  },
  {
    id: "D1",
    severity: "low",
    extensions: ["tsx", "jsx", "svelte", "vue"],
    label: "Inline style object — prefer classes/design tokens",
    check(content) {
      return matchLines(content, "style\\s*=\\s*\\{\\{", "g");
    },
  },
  {
    id: "D2",
    severity: "medium",
    extensions: ["tsx", "jsx"],
    label: ".map() JSX render without key prop — review",
    check(content) {
      const lines = content.split("\n");
      const out: RuleMatch[] = [];
      for (let i = 0; i < lines.length && out.length < CAP_PER_RULE; i++) {
        if (!/\.map\s*\(/.test(lines[i])) continue;
        const window = lines.slice(i, i + 6).join("\n");
        if (/<[A-Za-z]/.test(window) && !/\bkey\s*=/.test(window)) {
          out.push({ line: i + 1, detail: ".map( render without key= within 6 lines" });
        }
      }
      return out;
    },
  },
  {
    id: "D3",
    severity: "low",
    extensions: ["tsx", "jsx", "svelte", "vue"],
    label: "Component file >300 lines — split for maintainability",
    check(content) {
      const n = content.split("\n").length;
      return n > 300 ? [{ line: 1, detail: `${n} lines` }] : [];
    },
  },
  {
    id: "D4",
    severity: "low",
    extensions: [],
    label: "Pending-work marker (TODO/FIX) in design artifact",
    check(content) {
      return matchLines(content, "\\b(TODO|FIX)\\b\\s*[:\\(]");
    },
  },
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
