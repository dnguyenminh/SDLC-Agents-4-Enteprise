/**
 * SA4E-406 — write a UseCasePlan into draw.io XML.
 *
 * Vertices only move (sizes and styles kept; the boundary is resized to its
 * column). Associations become straight lines (`edgeStyle=none`, no fixed
 * anchors, no waypoints) so draw.io clips them at the actor and use-case
 * outlines. Relations between neighbouring use cases go straight down; longer
 * ones follow their detour lane. Deterministic, so a laid-out diagram comes back
 * byte-identical.
 */

import type { RelationPlan, UseCasePlan } from './drawio-usecase-plan';
import { rewriteStyle } from './drawio-style';
import { patchCell, replaceCellGeometryXy, replaceCellSize, setCellParent } from './drawio-xml-utils';

/** Edge style keys describing routing (rebuilt on every run). */
const ROUTING_KEYS = new Set(['edgeStyle', 'exitX', 'exitY', 'exitDx', 'exitDy', 'exitPerimeter', 'entryX', 'entryY',
  'entryDx', 'entryDy', 'entryPerimeter', 'orthogonalLoop', 'jettySize', 'curved', 'elbow']);

const r1 = (v: number): number => Math.round(v * 10) / 10;

function setStyle(xml: string, id: string, style: (old: string) => string): string {
  return patchCell(xml, id, (open, body) => {
    const old = /\sstyle="([^"]*)"/.exec(open)?.[1] ?? '';
    const next = ` style="${style(old)}"`;
    return { open: /\sstyle="/.test(open) ? open.replace(/\sstyle="[^"]*"/, next) : open + next, body };
  });
}

function setEdgeGeometry(xml: string, id: string, points: Array<{ x: number; y: number }>): string {
  const pts = points.map(p => `<mxPoint x="${r1(p.x)}" y="${r1(p.y)}"/>`).join('');
  const body = pts ? `<mxGeometry relative="1" as="geometry"><Array as="points">${pts}</Array></mxGeometry>` : '<mxGeometry relative="1" as="geometry"/>';
  return patchCell(xml, id, open => ({ open, body }));
}

/** Anchors of a relation: bottom→top for neighbours, side→side on a detour. */
function relationKeys(r: RelationPlan, downward: boolean): string[] {
  if (r.straight) {
    return downward
      ? ['edgeStyle=none', 'exitX=0.5', 'exitY=1', 'exitDx=0', 'exitDy=0', 'entryX=0.5', 'entryY=0', 'entryDx=0', 'entryDy=0']
      : ['edgeStyle=none', 'exitX=0.5', 'exitY=0', 'exitDx=0', 'exitDy=0', 'entryX=0.5', 'entryY=1', 'entryDx=0', 'entryDy=0'];
  }
  const x = r.side === 'right' ? 1 : 0;
  return ['edgeStyle=orthogonalEdgeStyle', `exitX=${x}`, 'exitY=0.5', 'exitDx=0', 'exitDy=0', `entryX=${x}`, 'entryY=0.5', 'entryDx=0', 'entryDy=0'];
}

/**
 * Apply the plan.
 * @param xml - original draw.io XML
 * @param plan - plan from planUseCase
 * @param caseOrder - use case ids in column order (to tell downward relations)
 * @param relationEnds - source/target of each relation edge
 */
export function applyUseCasePlan(
  xml: string, plan: UseCasePlan, caseOrder: string[],
  relationEnds: Map<string, { source: string; target: string }>,
): string {
  let out = xml;
  for (const b of plan.boundaries) {
    out = replaceCellSize(replaceCellGeometryXy(out, b.id, b.rect.x, b.rect.y), b.id, b.rect.w, b.rect.h);
    out = setStyle(out, b.id, () => b.style);
  }
  for (const [id, p] of [...plan.cases, ...plan.roots]) out = replaceCellGeometryXy(out, id, p.x, p.y);
  for (const id of plan.associations) {
    out = setEdgeGeometry(setStyle(out, id, s => rewriteStyle(s, ROUTING_KEYS, ['edgeStyle=none'])), id, []);
  }
  const rank = new Map(caseOrder.map((id, i) => [id, i]));
  for (const r of plan.relations) {
    const ends = relationEnds.get(r.id)!;
    const keys = relationKeys(r, rank.get(ends.source)! < rank.get(ends.target)!);
    // The relation belongs to the lowest common container of its endpoints;
    // detour waypoints are expressed in that parent's coordinate space.
    out = setCellParent(setStyle(out, r.id, s => rewriteStyle(s, ROUTING_KEYS, keys)), r.id, r.parentId);
    out = setEdgeGeometry(out, r.id, r.points);
  }
  return out;
}
