/**
 * SA4E-406 — turn "drawn containers" into real ones.
 *
 * LLM-authored diagrams often draw a dashed/transparent rectangle (a band, a layer, a
 * "Bootstrap & DI" group) and place the member boxes OVER it at the same page level. To
 * draw.io they are unrelated cells; to a layout tool the rectangle is an EMPTY container and
 * the boxes are loose nodes, so the boxes are laid out away from the band that was meant to
 * hold them. This pass makes the visual containment structural: a box whose centre lies inside
 * an empty root-level container becomes its child (parent set, geometry made relative).
 *
 * Idempotent: once the boxes are children the container is no longer empty.
 */

import { parseDrawioXml, type DiagramNode } from './drawio-parser';
import { patchGeometryTag, hasAttr, replaceAttr, insertAttrs, round } from './drawio-xml-utils';
import { rewriteCells, type CellPatch } from './drawio-xml-rewrite';

/** Result of the pass: the rewritten XML and how many boxes moved into which container. */
export interface AdoptResult { xml: string; adopted: Map<string, string[]>; }

const centreIn = (n: DiagramNode, c: DiagramNode): boolean => {
  const cx = n.x + n.width / 2, cy = n.y + n.height / 2;
  return cx >= c.x && cx <= c.x + c.width && cy >= c.y && cy <= c.y + c.height;
};
const area = (n: DiagramNode): number => n.width * n.height;

/**
 * Re-parent loose boxes into the empty root-level container that visually holds them.
 * @param xml - draw.io XML (already sanitized)
 * @returns the rewritten XML (unchanged when nothing was adopted) and the adoptions by container id
 */
export function adoptVisualChildren(xml: string): AdoptResult {
  const graph = parseDrawioXml(xml);
  const parents = new Set([...graph.nodes, ...graph.containers].map(n => n.parentId));
  const empties = graph.containers.filter(c => c.parentId === '1' && !parents.has(c.id));
  const adopted = new Map<string, string[]>();
  if (empties.length === 0) return { xml, adopted };
  const patches = new Map<string, (open: string, body: string) => CellPatch | null>();
  for (const node of graph.nodes.filter(n => n.parentId === '1')) {
    // the smallest empty container that holds the node's centre wins (inner bands before outer)
    const owner = empties.filter(c => centreIn(node, c)).sort((a, b) => area(a) - area(b))[0];
    if (!owner) continue;
    const nx = node.x - owner.x;
    const ny = node.y - owner.y;
    patches.set(node.id, (open, body) => {
      const newOpen = /\sparent="[^"]*"/.test(open)
        ? open.replace(/\sparent="[^"]*"/, ` parent="${owner.id}"`)
        : `${open} parent="${owner.id}"`;
      const patched = patchGeometryTag(body, (tag) => {
        let out = hasAttr(tag, 'x') ? replaceAttr(tag, 'x', nx) : insertAttrs(tag, ` x="${round(nx)}"`);
        out = hasAttr(out, 'y') ? replaceAttr(out, 'y', ny) : insertAttrs(out, ` y="${round(ny)}"`);
        return out;
      });
      return patched === null ? null : { open: newOpen, body: patched };
    });
    adopted.set(owner.id, [...(adopted.get(owner.id) ?? []), node.id]);
  }
  if (patches.size === 0) return { xml, adopted };
  return { xml: rewriteCells(xml, patches), adopted };
}
