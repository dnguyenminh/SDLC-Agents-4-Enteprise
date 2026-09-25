/**
 * ExprReferenceResolver.ts — Flattens a POC ReferenceNode into the dotted `parts` array
 * that PegaClipboardContext.resolve expects.
 *
 * The POC Reference model is richer than the flat string[] the clipboard uses:
 *   - scope: relative | page | bare | current | paramPage
 *   - page:  leading page/scope identifier (Param, Local, a page name), or null
 *   - segments: [{ name, subscript }]
 *
 * The clipboard resolver is name-based (parts[0] may be a page name or a relative property),
 * so we project the reference to the property path it addresses. Subscripts (indexes/keys)
 * are not part of the clipboard's page/property key space and are intentionally dropped from
 * the resolution path — matching the previous hand-written PropertyRef behaviour.
 */

import type { ReferenceNode } from './pega-expr/nodes.js';

/**
 * Convert a Reference AST node to the dotted parts used by PegaClipboardContext.resolve.
 * @param ref Reference node from the POC parser
 * @returns Ordered path segments (page/property names)
 */
export function referenceToParts(ref: ReferenceNode): string[] {
  const segmentNames = ref.segments.map((s) => s.name);

  switch (ref.scope) {
    case 'relative':
      // ".a.b" — property path on the current page; no leading page identifier.
      return segmentNames;
    case 'page':
    case 'paramPage':
      // "Page.a.b" / "D_Page[..].a" — page identifier followed by property path.
      return ref.page ? [ref.page, ...segmentNames] : segmentNames;
    case 'bare':
      // "Page" — a single page/scope identifier with no segments.
      return ref.page ? [ref.page] : [];
    case 'current':
      // "<current>.a" — treat like a relative path on the current page.
      return segmentNames;
    default:
      return segmentNames;
  }
}
