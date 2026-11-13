/**
 * SA4E-406 — recognise sequence diagrams.
 *
 * In a sequence diagram the vertical ORDER of the arrows is the content:
 * participants are a row of boxes, and the same pair of participants exchanges
 * many messages (request/response), plus self-calls. A graph layout treats that
 * as a tangle of parallel edges, reorders it and destroys the sequence.
 *
 * Heuristic: far more edges than nodes, and a large share of the edges either
 * repeat an already-used source→target pair or loop back onto their own node.
 * Ordinary flow charts, class diagrams and architecture views have a roughly
 * one-to-one edge/node ratio and almost no repeated pairs.
 */

import type { DiagramGraph } from './drawio-parser';
import { isSequenceLifeline } from './drawio-style';

const MIN_EDGES = 6;
/** Edges per node at or above which the diagram is message-heavy. */
const MIN_EDGE_NODE_RATIO = 3;
/** Share of edges that repeat a pair or self-loop. */
const MIN_REPEATED_SHARE = 0.3;

export interface SequenceVerdict { isSequence: boolean; participants: number; messages: number; }

/**
 * Classify the diagram.
 * @param graph - parsed diagram
 * @returns verdict with the participant (message endpoint) and message counts
 */
export function detectSequenceDiagram(graph: DiagramGraph): SequenceVerdict {
  const edges = graph.edges;
  // Participants are the shapes that send/receive messages; notes and legends do not count
  const endpoints = new Set(edges.flatMap(e => [e.sourceId, e.targetId]));
  const verdict = { isSequence: false, participants: endpoints.size, messages: edges.length };
  if (isLifelineDiagram(graph, endpoints) || isTallLifelineDiagram(graph, endpoints) || isFramedRow(graph, endpoints)) {
    return { ...verdict, isSequence: true };
  }
  if (edges.length < MIN_EDGES || endpoints.size === 0 || edges.length / endpoints.size < MIN_EDGE_NODE_RATIO) return verdict;
  const perPair = new Map<string, number>();
  for (const e of edges) perPair.set(`${e.sourceId}>${e.targetId}`, (perPair.get(`${e.sourceId}>${e.targetId}`) ?? 0) + 1);
  const repeated = edges.filter(e => e.sourceId === e.targetId || (perPair.get(`${e.sourceId}>${e.targetId}`) ?? 0) > 1).length;
  return { ...verdict, isSequence: repeated / edges.length >= MIN_REPEATED_SHARE };
}

/** Authored (or already laid out) with UML lifelines: at least two message endpoints are lifelines. */
function isLifelineDiagram(graph: DiagramGraph, endpoints: Set<string>): boolean {
  const lifelines = [...graph.nodes, ...graph.containers].filter(n => endpoints.has(n.id) && isSequenceLifeline(n.style));
  return lifelines.length >= 2;
}

/** Message endpoints that are tall enough to be a lifeline drawn as a plain rectangle. */
const TALL_LIFELINE = 150;
/** Anchor fractions strictly inside the lifeline (not its top/bottom edge). */
const INNER = { min: 0.02, max: 0.98 };
/** Tops of participants in one row differ by at most this much (px). */
const ROW_TOLERANCE = 30;

/**
 * Tall participants whose messages leave and enter at the SAME height of the lifeline
 * (horizontal arrows): the signature of a lifeline drawn as a rectangle.
 */
function isTallLifelineDiagram(graph: DiagramGraph, endpoints: Set<string>): boolean {
  const tall = new Set(graph.nodes.filter(n => endpoints.has(n.id) && n.height >= TALL_LIFELINE).map(n => n.id));
  if (tall.size < 2) return false;
  const level = graph.edges.filter(e => e.exit && e.entry && Math.abs(e.exit.y - e.entry.y) < 0.01
    && e.exit.y > INNER.min && e.exit.y < INNER.max && tall.has(e.sourceId) && tall.has(e.targetId));
  return level.length >= 3 && level.length / graph.edges.length >= 0.6;
}

/** A UML interaction frame (alt / loop / opt) around messages exchanged by a row of participants. */
function isFramedRow(graph: DiagramGraph, endpoints: Set<string>): boolean {
  const cells = [...graph.nodes, ...graph.containers];
  if (!cells.some(c => /(?:^|;)shape=umlFrame(?:;|$)/.test(c.style)) || graph.edges.length < 3) return false;
  const tops = cells.filter(c => endpoints.has(c.id)).map(c => c.y);
  return tops.length >= 2 && Math.max(...tops) - Math.min(...tops) <= ROW_TOLERANCE;
}
