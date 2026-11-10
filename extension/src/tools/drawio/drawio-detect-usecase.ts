/**
 * SA4E-406 — recognise UML use-case diagrams.
 *
 * Shape of the diagram: use cases (ellipses) grouped in zero, one or several
 * system boundaries (containers), actors outside the boundaries, associations
 * actor → use case, plus include/extend arrows between use cases. A layered
 * graph layout puts every actor in the first layer and every use case in the
 * second (a wide strip) and routes the actor's fan-out orthogonally — a tangle.
 * The use-case strategy (drawio-usecase-plan) lays it out the way people draw it.
 */

import type { DiagramGraph, DiagramNode } from './drawio-parser';

/** Use cases that share one system boundary (or none: `boundary` undefined). */
export interface UseCaseGroup { boundary?: DiagramNode; cases: DiagramNode[]; }

/** Use-case structure of a diagram. */
export interface UseCaseModel {
  /** Groups in document order of their first use case. */
  groups: UseCaseGroup[];
  /** All use cases, group by group (the vertical order of the layout). */
  cases: DiagramNode[];
  /** Actors (top-level shapes associated with use cases), document order. */
  actors: DiagramNode[];
  /** Other top-level shapes (notes, legends). */
  others: DiagramNode[];
}

const MIN_CASES = 3;
/** Share of the non-actor shapes that must be ellipses. */
const MIN_ELLIPSE_SHARE = 0.7;
/** Share of all edges that must be associations or use-case relations. */
const MIN_EDGE_SHARE = 0.8;
/** Share of all edges that must touch an actor. */
const MIN_ASSOCIATION_SHARE = 0.4;

/** True for an ellipse style (the standard use-case shape). */
export const isEllipseStyle = (style: string): boolean => /(?:^|;)(?:shape=)?ellipse(?:;|$)/.test(style);
const ACTOR_SHAPE = /(?:umlActor|(?:^|;)shape=actor(?:;|$)|mxgraph\.[\w.]*actor)/i;
const TEXT_ONLY = /(?:^|;)text(?:;|$)/;

/** Inside a system boundary any non-actor, non-text shape is a use case (rounded boxes included). */
const isBoundaryCase = (style: string): boolean => isEllipseStyle(style) || !(ACTOR_SHAPE.test(style) || TEXT_ONLY.test(style));

/** Use cases grouped by their boundary; null when a container holds anything but use cases. */
function groupCases(graph: DiagramGraph): UseCaseGroup[] | null {
  const order = new Map([...graph.nodes, ...graph.containers].map((n, i) => [n.id, i]));
  const groups: UseCaseGroup[] = [];
  for (const c of graph.containers) {
    if (c.parentId !== '1') return null;
    const kids = graph.nodes.filter(n => n.parentId === c.id);
    if (kids.length === 0 || !kids.every(k => isBoundaryCase(k.style))) return null;
    groups.push({ boundary: c, cases: kids });
  }
  const loose = graph.nodes.filter(n => n.parentId === '1' && isEllipseStyle(n.style));
  if (loose.length) groups.push({ cases: loose });
  const first = (g: UseCaseGroup): number => Math.min(...g.cases.map(k => order.get(k.id)!));
  return groups.sort((a, b) => first(a) - first(b));
}

/**
 * Detect the use-case structure.
 * @param graph - parsed diagram
 * @returns the model, or null when the diagram is not a use-case diagram
 */
export function detectUseCaseDiagram(graph: DiagramGraph): UseCaseModel | null {
  const groups = groupCases(graph);
  if (!groups) return null;
  const cases = groups.flatMap(g => g.cases);
  if (cases.length < MIN_CASES) return null;
  const caseIds = new Set(cases.map(c => c.id));
  const roots = graph.nodes.filter(n => n.parentId === '1' && !caseIds.has(n.id));
  const touchesCase = (id: string): boolean => graph.edges.some(e =>
    (e.sourceId === id && caseIds.has(e.targetId)) || (e.targetId === id && caseIds.has(e.sourceId)));
  const actors = roots.filter(n => touchesCase(n.id));
  if (actors.length === 0) return null;
  // Rounded-box use cases are only trusted when a real UML actor confirms the diagram kind
  if (cases.some(c => !isEllipseStyle(c.style)) && !actors.some(a => ACTOR_SHAPE.test(a.style))) return null;
  // Most of the diagram must be use cases (a flow chart with start/end ellipses is not)
  if (cases.length / (graph.nodes.length - actors.length) < MIN_ELLIPSE_SHARE) return null;
  const known = new Set([...caseIds, ...actors.map(a => a.id)]);
  const relevant = graph.edges.filter(e => known.has(e.sourceId) && known.has(e.targetId));
  if (relevant.length / Math.max(1, graph.edges.length) < MIN_EDGE_SHARE) return null;
  // Associations are the backbone: a state diagram (ellipse states + one start box) is mostly state→state
  const actorIds = new Set(actors.map(a => a.id));
  const associations = graph.edges.filter(e => actorIds.has(e.sourceId) || actorIds.has(e.targetId)).length;
  if (associations / graph.edges.length < MIN_ASSOCIATION_SHARE) return null;
  const others = roots.filter(n => !known.has(n.id));
  return { groups, cases, actors, others };
}
