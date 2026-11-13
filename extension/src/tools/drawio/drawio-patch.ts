/**
 * Apply a local-repair plan (and port distributions) to raw draw.io XML.
 * Pure string transforms — caller is responsible for re-parse validation.
 */

import type { RepairPlan } from './drawio-repair';
import { distributePorts } from './drawio-ports';
import type { DiagramGraph } from './drawio-parser';
import { patchGeometryTag, hasAttr, replaceAttr, insertAttrs, round, type Point, upsertEdgeStyleKeys } from './drawio-xml-utils';
import { rewriteCells, type CellPatch } from './drawio-xml-rewrite';

/** Write moved positions, resized containers and rerouted edges into the XML. */
export function applyRepairPlan(xml: string, plan: RepairPlan): string {
  const geometryPatches = new Map<string, (open: string, body: string) => CellPatch | null>();
  for (const [id, p] of plan.moves) {
    geometryPatches.set(id, (_open, body) => {
      const patched = patchGeometryTag(body, (tag) => {
        let out = hasAttr(tag, 'x') ? replaceAttr(tag, 'x', p.x) : insertAttrs(tag, ` x="${round(p.x)}"`);
        out = hasAttr(out, 'y') ? replaceAttr(out, 'y', p.y) : insertAttrs(out, ` y="${round(p.y)}"`);
        return out;
      });
      return patched === null ? null : { open: _open, body: patched };
    });
  }
  const sizePatches = new Map<string, (open: string, body: string) => CellPatch | null>();
  for (const [id, s] of plan.resizes) {
    sizePatches.set(id, (_open, body) => {
      const patched = patchGeometryTag(body, (tag) => {
        let out = hasAttr(tag, 'width') ? replaceAttr(tag, 'width', s.w) : tag;
        out = hasAttr(out, 'height') ? replaceAttr(out, 'height', s.h) : out;
        return out;
      });
      return patched === null ? null : { open: _open, body: patched };
    });
  }
  const routePatches = new Map<string, (open: string, body: string) => CellPatch | null>();
  for (const [edgeId, points] of plan.routes) {
    const pointsXml = points.map(pt => `<mxPoint x="${round(pt.x)}" y="${round(pt.y)}"/>`).join('');
    const array = points.length > 0 ? `<Array as="points">${pointsXml}</Array>` : '';
    routePatches.set(edgeId, (_open, body) => {
      const geomRegex = /<mxGeometry\b([^>]*?)(\/>|>([\s\S]*?)<\/mxGeometry>)/;
      const geom = geomRegex.exec(body);
      if (!geom) return null;
      const [full, attrs, ending, inner = ''] = geom;
      const cleaned = inner
        .replace(/<Array\s+as="points"\s*\/>/g, '')
        .replace(/<Array\s+as="points">[\s\S]*?<\/Array>/g, '');
      const replacement = ending === '/>'
        ? (array ? `<mxGeometry${attrs}>${array}</mxGeometry>` : full)
        : `<mxGeometry${attrs}>${cleaned}${array}</mxGeometry>`;
      return { open: _open, body: `${body.slice(0, geom.index)}${replacement}${body.slice(geom.index + full.length)}` };
    });
  }
  let out = rewriteCells(xml, geometryPatches);
  out = rewriteCells(out, sizePatches);
  out = rewriteCells(out, routePatches);
  return out;
}

/** Write distributed exit/entry anchors for edges whose ports are missing. */
export function applyPortDistribution(xml: string, graph: DiagramGraph): string {
  const ports = distributePorts(graph);
  let out = xml;
  for (const [edgeId, edgePorts] of ports) {
    const keys: Record<string, string | number> = {};
    if (edgePorts.exit) {
      keys.exitX = edgePorts.exit.x; keys.exitY = edgePorts.exit.y;
      keys.exitDx = 0; keys.exitDy = 0;
    }
    if (edgePorts.entry) {
      keys.entryX = edgePorts.entry.x; keys.entryY = edgePorts.entry.y;
      keys.entryDx = 0; keys.entryDy = 0;
    }
    if (Object.keys(keys).length > 0) out = upsertEdgeStyleKeys(out, edgeId, keys);
  }
  return out;
}
