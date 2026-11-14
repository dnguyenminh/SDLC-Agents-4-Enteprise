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

/**
 * Find the end index of the JSX/HTML tag starting at `start`.
 * The tag ends at the first `>` at brace depth 0 — a naive `[^>]*>` regex
 * truncates at the `>` of arrow functions (`=>`) inside JSX attributes and
 * produced false positives (SA4E-438: an <img> WITH alt was flagged because
 * its multi-line tag contained `onClick={() => …}` before the alt attribute).
 */
function findTagEnd(content: string, start: number): number {
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
        const mapIdx = lines[i].indexOf(".map(");
        if (mapIdx === -1) continue;
        // Only flag when the map callback RETURNS JSX: after "=>", the next
        // non-space char is "<" (direct element) or "(" wrapping an element.
        // String/data transforms (=> p.charAt(0), => x.id) never return JSX
        // and were the bulk of the false positives (SA4E-438).
        const arrowIdx = lines[i].indexOf("=>", mapIdx);
        if (arrowIdx === -1) continue;
        const afterArrow = lines[i].slice(arrowIdx + 2).trimStart();
        const returnsJsx =
          afterArrow.startsWith("<") ||
          (afterArrow.startsWith("(") && afterArrow.slice(1).trimStart().startsWith("<"));
        if (!returnsJsx) continue;
        const window = lines.slice(i, i + 8).join("\n");
        if (!/\bkey\s*=/.test(window)) {
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

  // -------------------------------------------------------------------------
  // Impeccable-derived slop & quality rules (idea port from the Apache-2.0
  // project github.com/pbakaus/impeccable — 62 deterministic rules; we adapt
  // the statically-checkable subset natively, no external CLI/binary).
  // Rendered-only checks (low-contrast, occlusion, geometry) = phase 2.
  // -------------------------------------------------------------------------

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
