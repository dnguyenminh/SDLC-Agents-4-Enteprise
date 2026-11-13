/**
 * Design rules — accessibility (A1-A3) and responsive layout (B1-B3) (SA4E-438).
 * Split from design-rules.ts (<=200 lines/file); IDs, order and behavior unchanged.
 */
import { RuleMatch, DesignRule, EXT_UI, EXT_STYLE, EXT_UI_AND_STYLE, CAP_PER_RULE, lineOf, findTagEnd, matchLines } from "./design-rules.types";

export const RULES_A11Y_LAYOUT: DesignRule[] = [
  {
    id: "A1",
    severity: "high",
    extensions: EXT_UI,
    label: "<img> missing alt attribute (accessibility)",
    check(content) {
      const out: RuleMatch[] = [];
      const rx = /<img\b/g;
      let m: RegExpExecArray | null;
      while ((m = rx.exec(content)) !== null && out.length < 9) {
        const tagEnd = findTagEnd(content, m.index);
        if (tagEnd === -1) continue;
        const tag = content.slice(m.index, tagEnd + 1);
        if (!/\balt\s*=/.test(tag)) {
          out.push({
            line: lineOf(content, m.index),
            detail: tag.replace(/\s+/g, " ").trim().slice(0, 70),
          });
        }
      }
      return out;
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
      const rx = /<(div|span)\b[^>]*onClick/gi;
      let m: RegExpExecArray | null;
      while ((m = rx.exec(content)) !== null && out.length < 9) {
        const tagEnd = findTagEnd(content, m.index);
        if (tagEnd === -1) continue;
        const tag = content.slice(m.index, tagEnd + 1);
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
];
