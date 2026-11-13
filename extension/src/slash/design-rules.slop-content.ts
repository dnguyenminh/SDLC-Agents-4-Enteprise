/**
 * Design rules — Impeccable-derived content/a11y/typography rules (SA4E-438).
 * Split from design-rules.ts (<=200 lines/file); IDs, order and behavior unchanged.
 */
import { RuleMatch, DesignRule, EXT_UI, EXT_STYLE, EXT_UI_AND_STYLE, CAP_PER_RULE, lineOf, findTagEnd, matchLines } from "./design-rules.types";

export const RULES_SLOP_CONTENT: DesignRule[] = [
  {
    id: "broken-image",
    severity: "medium",
    extensions: EXT_UI,
    label: "Broken/placeholder image src",
    check(content) {
      const empty = matchLines(content, "<img\\b[^>]*src=(?:\"\"|''|\\{\"\"|\\{''\\})");
      const ph = matchLines(content, "<img\\b[^>]*src=[\"']?(?:placeholder|example\\.com|via\\.placeholder\\.com|placekitten|placehold\\.it)");
      return [...empty, ...ph].slice(0, 9);
    },
  },
  {
    id: "skipped-heading",
    severity: "medium",
    extensions: EXT_UI,
    label: "Skipped heading level (breaks screen-reader outline)",
    check(content) {
      const levels: number[] = [];
      const rx = /<h([1-6])\b/gi;
      let m: RegExpExecArray | null;
      while ((m = rx.exec(content)) !== null) levels.push(parseInt(m[1], 10));
      for (let i = 1; i < levels.length; i++) {
        if (levels[i] - levels[i - 1] > 1) {
          return [{ line: 1, detail: `h${levels[i - 1]} → h${levels[i]} (skipped level)` }];
        }
      }
      return [];
    },
  },
  {
    id: "tight-leading",
    severity: "low",
    extensions: EXT_UI_AND_STYLE,
    label: "Tight line-height (<1.3) — text hard to read",
    check(content) {
      const css = matchLines(content, "line-height\\s*:\\s*(?:0\\.\\d+|1(?:\\.[0-2])?)\\b");
      const tw = matchLines(content, "leading-(?:none|tighter|tight)\\b");
      return [...css, ...tw].slice(0, 9);
    },
  },
  {
    id: "tiny-text",
    severity: "medium",
    extensions: EXT_UI_AND_STYLE,
    label: "Tiny text <12px (legibility)",
    check(content) {
      const css = matchLines(content, "font-size\\s*:\\s*(?:[0-9]|1[01])(?:\\.\\d+)?px\\b");
      const tw = matchLines(content, "text-\\[(?:[0-9]|1[01])(?:\\.\\d+)?px\\]");
      return [...css, ...tw].slice(0, 9);
    },
  },
  {
    id: "justified-text",
    severity: "low",
    extensions: EXT_UI_AND_STYLE,
    label: "Justified text — rivers of white in narrow columns",
    check(content) {
      return matchLines(content, "text-align\\s*:\\s*justify|\\btext-justify\\b");
    },
  },
  {
    id: "extreme-negative-tracking",
    severity: "low",
    extensions: EXT_UI_AND_STYLE,
    label: "Crushed letter-spacing — characters lose their shapes",
    check(content) {
      const css = matchLines(content, "letter-spacing\\s*:\\s*-[0-9.]+em");
      const tw = matchLines(content, "tracking-tighter\\b");
      return [...css, ...tw].slice(0, 9);
    },
  },
  {
    id: "marketing-buzzword",
    severity: "low",
    extensions: EXT_UI,
    label: "Marketing buzzword — instant AI copy tell (say what it does)",
    check(content) {
      return matchLines(content, "\\b(?:streamlin\\w+|empower\\w*|supercharg\\w+|world-class|enterprise-grade|next-generation|cutting-edge)\\b");
    },
  },
  {
    id: "bounce-easing",
    severity: "low",
    extensions: EXT_UI_AND_STYLE,
    label: "Bounce/elastic easing — dated, use ease-out",
    check(content) {
      const tw = matchLines(content, "animate-bounce\\b");
      const css = matchLines(content, "cubic-bezier\\([^)]*(?:[2-9]\\.\\d|1\\.[1-9]\\d)[,)]");
      return [...tw, ...css].slice(0, 9);
    },
  },
  {
    id: "marquee",
    severity: "low",
    extensions: EXT_UI_AND_STYLE,
    label: "Auto-scrolling marquee — attention it has not earned",
    check(content) {
      return matchLines(content, "animate-marquee|animation\\s*:[^;]*marquee|@keyframes\\s+marquee");
    },
  },
];
