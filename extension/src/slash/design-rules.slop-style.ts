/**
 * Design rules — Impeccable-derived visual/style slop rules (SA4E-438).
 * Split from design-rules.ts (<=200 lines/file); IDs, order and behavior unchanged.
 */
import { RuleMatch, DesignRule, EXT_UI, EXT_STYLE, EXT_UI_AND_STYLE, CAP_PER_RULE, lineOf, findTagEnd, matchLines } from "./design-rules.types";

export const RULES_SLOP_STYLE: DesignRule[] = [
  {
    id: "overused-font",
    severity: "low",
    extensions: EXT_UI_AND_STYLE,
    label: "Overused font — AI-slop tell (choose a distinctive face)",
    check(content) {
      const ui = matchLines(content, "font-family[^;}]*\\b(?:inter|roboto|fraunces|geist|plus jakarta sans|space grotesk|montserrat|poppins)\\b");
      const links = matchLines(content, "fonts\\.googleapis\\.com[^\"']*(?:inter|roboto|fraunces|geist|montserrat|poppins|space\\+grotesk|plus\\+jakarta)");
      return [...ui, ...links].slice(0, 9);
    },
  },
  {
    id: "gradient-text",
    severity: "low",
    extensions: EXT_UI_AND_STYLE,
    label: "Gradient text — decorative AI tell (use solid colors)",
    check(content) {
      return matchLines(content, "bg-clip-text|background-clip\\s*:\\s*text");
    },
  },
  {
    id: "ai-color-palette",
    severity: "low",
    extensions: EXT_UI_AND_STYLE,
    label: "AI color palette (purple/violet tell) — choose an intentional palette",
    check(content) {
      const tw = matchLines(content, "(?:text|bg|border|from|via|to)-(?:purple|violet|fuchsia)-[1-9]00");
      const hex = matchLines(content, "#(?:7c3aed|8b5cf6|a855f7|6d28d9|9333ea|7e22ce|a78bfa|c084fc)\\b");
      return [...tw, ...hex].slice(0, 9);
    },
  },
  {
    id: "cream-palette",
    severity: "low",
    extensions: EXT_UI_AND_STYLE,
    label: "Cream/beige palette — default 'tasteful' AI surface",
    check(content) {
      const hex = matchLines(content, "#(?:faf6f0|f5f0e8|fdf8f2|f7f3ea|faf5eb|f8f4ec|f6f1e7|fbf7ef|efeadd|fffbeb)\\b");
      const tw = matchLines(content, "bg-(?:stone|amber)-(?:50|100)\\b");
      return [...hex, ...tw].slice(0, 9);
    },
  },
  {
    id: "side-tab",
    severity: "low",
    extensions: EXT_UI_AND_STYLE,
    label: "Side-tab accent border — the most recognizable AI tell",
    check(content) {
      const css = matchLines(content, "border-(?:left|right|top|bottom)\\s*:\\s*[2-9]px\\s+solid");
      const tw = matchLines(content, "border-[lrtb]-[4-8]\\b");
      return [...css, ...tw].slice(0, 9);
    },
  },
  {
    id: "dark-glow",
    severity: "low",
    extensions: EXT_UI_AND_STYLE,
    label: "Glowing shadow accent (0-offset chromatic halo)",
    check(content) {
      const box = matchLines(content, "box-shadow\\s*:\\s*0(?:px)?\\s+0(?:px)?\\s+\\d+px");
      const text = matchLines(content, "text-shadow\\s*:[^;]*\\d+px\\s+\\d+px\\s+\\d+px\\s+(?:#|rgba?\\()");
      return [...box, ...text].slice(0, 9);
    },
  },
  {
    id: "radial-halo",
    severity: "low",
    extensions: EXT_UI_AND_STYLE,
    label: "Decorative radial-gradient halo/spotlight",
    check(content) {
      return matchLines(content, "radial-gradient\\([^)]*transparent");
    },
  },
  {
    id: "hard-offset-shadow",
    severity: "low",
    extensions: EXT_STYLE,
    label: "Hard offset shadow (unblurred ≥4px) — neobrutalist? review",
    check(content) {
      return matchLines(content, "box-shadow\\s*:[^;]*\\d+px\\s+\\d+px\\s+0(?:px)?(?:\\s|$|[,;)])");
    },
  },
];
