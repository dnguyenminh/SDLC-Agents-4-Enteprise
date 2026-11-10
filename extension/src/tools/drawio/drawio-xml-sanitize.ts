/**
 * SA4E-406 — sanitize LLM-generated draw.io XML before layout.
 *
 * LLMs produce files that a regex parser accepts but draw.io rejects or that
 * the layout engine cannot patch. This module repairs the known classes:
 *   1. Attribute values with a raw '<' or a bare '&'
 *      (draw.io: "Unescaped '<' not allowed in attributes values").
 *   2. Edge cells written self-closing (`<mxCell edge="1" .../>`) — they have
 *      no <mxGeometry> child, so waypoints can never be written to them.
 *   3. Container `childLayout=stackLayout`-style keys that make draw.io
 *      re-stack children and ignore the coordinates the tool computes.
 * Every repair is idempotent; clean input is returned byte-identical.
 */

import { repairTables } from './drawio-table-repair';

/** Entity forms that are already well-formed inside an attribute value. */
const BARE_AMP = /&(?!(?:lt|gt|amp|quot|apos|#\d+|#x[0-9a-fA-F]+);)/;
const BARE_AMP_G = new RegExp(BARE_AMP.source, 'g');
const ATTR_RE = /([a-zA-Z_:][\w.-]*)="([^"]*)"/g;

export interface XmlEscapingIssue {
  attribute: string;
  kind: 'raw_lt' | 'raw_amp';
  sample: string;
}

export interface SanitizeResult {
  xml: string;
  /** Human-readable list of repairs applied (empty when input was clean). */
  fixes: string[];
}

/** Find attribute values containing a raw '<' or a bare '&' (not an entity). */
export function findXmlEscapingIssues(xml: string): XmlEscapingIssue[] {
  const issues: XmlEscapingIssue[] = [];
  for (const m of xml.matchAll(ATTR_RE)) {
    const [, attribute, value] = m;
    if (value.includes('<')) issues.push({ attribute, kind: 'raw_lt', sample: value.slice(0, 60) });
    else if (BARE_AMP.test(value)) issues.push({ attribute, kind: 'raw_amp', sample: value.slice(0, 60) });
  }
  return issues;
}

/**
 * A cell/object open tag. Quoted values may hold raw '<' and '>' (the very
 * defect being repaired), so the tag extent is found by walking `name="…"`
 * pairs instead of a `[^>]*` scan.
 */
const CELL_TAG_RE = /<(mxCell|object|UserObject)((?:\s+[\w:.-]+="[^"]*")*)(\s*\/?)>/g;
/** Attributes draw.io renders as HTML when the cell style has `html=1`. */
const LABEL_ATTRS = new Set(['value', 'label', 'tooltip']);
/** Real HTML markup LLMs put in html=1 labels (kept as markup, not shown literally). */
const MARKUP_RE = /<\/?(?:b|i|u|s|em|strong|br|hr|p|div|span|font|sub|sup|ul|ol|li|a|code|pre|small|big|h[1-6]|table|thead|tbody|tr|td|th)(?:\s[^<>"]*)?\/?>/gi;

/**
 * Escape one attribute value. In an html=1 label the attribute text is parsed
 * as HTML after XML decoding, so literal angle brackets ("Map<string, Point>")
 * must be double-escaped (`&amp;lt;`) or draw.io swallows them as an unknown tag;
 * genuine markup (`<b>`, `<br>`) is single-escaped so it still renders.
 */
function escapeValue(value: string, htmlLabel: boolean): string {
  if (!htmlLabel) return value.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(BARE_AMP_G, '&amp;');
  const markup: string[] = [];
  const masked = value.replace(MARKUP_RE, tag => `\u0000${markup.push(tag) - 1}\u0000`);
  const literal = masked.replace(BARE_AMP_G, '&amp;').replace(/</g, '&amp;lt;').replace(/>/g, '&amp;gt;');
  return literal.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => markup[Number(i)].replace(/</g, '&lt;').replace(/>/g, '&gt;'));
}

/**
 * Escape raw '<', raw '>' and bare '&' inside attribute values; counts repaired values.
 * A raw '>' is legal XML but LLMs write it in labels ("CLI > Chrome") and every
 * tag-scanning regex in this tool (`[^>]*`) would cut the cell open tag at it,
 * silently skipping that cell during layout — so it is normalised too.
 */
export function escapeAttributeValues(xml: string): { xml: string; repaired: number } {
  let repaired = 0;
  const out = xml.replace(CELL_TAG_RE, (whole, name: string, attrs: string, end: string) => {
    const html = /(?:^|;)html=1(?:;|$)/.test(/\sstyle="([^"]*)"/.exec(attrs)?.[1] ?? '');
    const fixedAttrs = attrs.replace(ATTR_RE, (attr, key: string, value: string) => {
      const fixed = escapeValue(value, html && LABEL_ATTRS.has(key));
      if (fixed === value) return attr;
      repaired++;
      return `${key}="${fixed}"`;
    });
    return fixedAttrs === attrs ? whole : `<${name}${fixedAttrs}${end}>`;
  });
  return { xml: out, repaired };
}

/**
 * Turn JSON-style `\"` inside attribute values into `&quot;`. LLMs write
 * `value="Run \"tool.exe\" --x"`; in XML the first `"` closes the attribute and
 * the tag is destroyed. A `\"` is kept when it is genuinely a backslash followed
 * by the closing quote, i.e. when what follows is the end of the tag or the next
 * `name="` attribute (`value="C:\dir\" style="…"`).
 */
export function repairBackslashQuotes(xml: string): { xml: string; repaired: number } {
  let repaired = 0;
  const out = xml.replace(/\\"(?!\s*(?:\/?>|[\w:.-]+="))/g, () => { repaired++; return '&quot;'; });
  return { xml: out, repaired };
}

export interface MalformedTag { line: number; tag: string; sample: string; }

/** Strict shape of an element open tag: quoted attributes only, no raw '<' inside values. */
const STRICT_TAG = /<([A-Za-z][\w:.-]*)((?:\s+[\w:.-]+="[^"<]*")*)\s*\/?>/y;

/**
 * Open tags whose attribute list is not well-formed (stray quote, missing `=`…).
 * The tolerant regex parsers used elsewhere silently SKIP such cells, so a layout
 * run would "succeed" while leaving them untouched; callers should report these.
 */
export function findMalformedTags(xml: string): MalformedTag[] {
  const scan = xml.replace(/<!--[\s\S]*?-->/g, c => c.replace(/[^\n]/g, ' '));
  const bad: MalformedTag[] = [];
  for (const m of scan.matchAll(/<([A-Za-z][\w:.-]*)/g)) {
    STRICT_TAG.lastIndex = m.index!;
    if (STRICT_TAG.test(scan)) continue;
    const line = scan.slice(0, m.index).split('\n').length;
    bad.push({ line, tag: m[1], sample: scan.slice(m.index, m.index! + 100).replace(/\s+/g, ' ') });
  }
  return bad;
}

/** Give every self-closing edge cell an `<mxGeometry relative="1" as="geometry"/>` child. */
export function ensureEdgeGeometry(xml: string): { xml: string; repaired: number } {
  let repaired = 0;
  const out = xml.replace(/<mxCell\b([^>]*?\bedge="1"[^>]*?)\/>/g, (_whole, attrs: string) => {
    repaired++;
    return `<mxCell${attrs}><mxGeometry relative="1" as="geometry"/></mxCell>`;
  });
  return { xml: out, repaired };
}

/** Style keys that make draw.io auto-arrange a container's children. */
const CHILD_LAYOUT_KEYS = ['childLayout', 'horizontalStack', 'resizeParent', 'resizeParentMax', 'resizeLast', 'marginBottom'];

/** Remove auto-layout keys from container styles so computed coordinates stay authoritative. */
export function stripChildLayoutStyles(xml: string): { xml: string; repaired: number } {
  let repaired = 0;
  const out = xml.replace(/(<mxCell\b[^>]*?\bstyle=")([^"]*)(")/g, (whole, pre: string, style: string, post: string) => {
    if (!/\bchildLayout=/.test(style)) return whole;
    const kept = style.split(';').filter(kv => kv && !CHILD_LAYOUT_KEYS.includes(kv.split('=')[0]));
    repaired++;
    return `${pre}${kept.join(';')};${post}`;
  });
  return { xml: out, repaired };
}

/**
 * Run every repair. `stripAutoLayout` is only safe when the tool is about to
 * re-place all geometry (full relayout) — otherwise leave author styles alone.
 */
export function sanitizeDrawioXml(xml: string, opts: { stripAutoLayout?: boolean } = {}): SanitizeResult {
  const fixes: string[] = [];
  let current = xml;
  const steps: Array<[string, (x: string) => { xml: string; repaired: number }]> = [
    ['converted \\" to &quot; in attribute values', repairBackslashQuotes],
    ['escaped attribute values', escapeAttributeValues],
    ['added geometry to self-closing edges', ensureEdgeGeometry],
    ['rebuilt table geometry', repairTables],
  ];
  if (opts.stripAutoLayout) steps.push(['removed container auto-layout styles', stripChildLayoutStyles]);
  for (const [label, step] of steps) {
    const r = step(current);
    if (r.repaired > 0) fixes.push(`${label}: ${r.repaired}`);
    current = r.xml;
  }
  return { xml: current, fixes };
}
