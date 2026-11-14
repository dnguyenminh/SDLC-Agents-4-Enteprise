/**
 * Design rules — design tokens (C1-C3) and component quality (D1-D4) (SA4E-438).
 * Split from design-rules.ts (<=200 lines/file); IDs, order and behavior unchanged.
 */
import { RuleMatch, DesignRule, EXT_UI, EXT_STYLE, EXT_UI_AND_STYLE, CAP_PER_RULE, lineOf, findTagEnd, matchLines } from "./design-rules.types";

/**
 * Only flag when the .map callback RETURNS JSX: after "=>", the next non-space
 * char is "<" (direct element) or "(" wrapping an element. String/data
 * transforms (=> p.charAt(0), => x.id) never return JSX and were the bulk of
 * the false positives (SA4E-438).
 */
function mapReturnsJsx(line: string): boolean {
  const mapIdx = line.indexOf(".map(");
  const arrowIdx = mapIdx === -1 ? -1 : line.indexOf("=>", mapIdx);
  if (arrowIdx === -1) return false;
  const afterArrow = line.slice(arrowIdx + 2).trimStart();
  return afterArrow.startsWith("<") ||
    (afterArrow.startsWith("(") && afterArrow.slice(1).trimStart().startsWith("<"));
}

export const RULES_TOKENS_COMPONENT: DesignRule[] = [
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
        if (!mapReturnsJsx(lines[i])) continue;
        if (!/\bkey\s*=/.test(lines.slice(i, i + 8).join("\n"))) {
          out.push({ line: i + 1, detail: ".map( renders JSX without key= within 8 lines" });
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
