/**
 * SA4E-406 — geometry plan for a sequence diagram.
 *
 * In a sequence diagram the vertical ORDER of the messages is the content, so a
 * graph layout cannot be used. The plan rebuilds the canonical form instead:
 * participants in one row (ordered by first involvement), a lifeline under each,
 * one message per row top-down in authoring (document) order, self-calls as a
 * small loop on the right of their lifeline, combined fragments (alt / loop …)
 * as frames around the rows they enclose, notes in a column on the right.
 *
 * Pure planning — no XML writing (see drawio-sequence-xml).
 */

import { parseDrawioXml } from './drawio-parser';
import { analyzeFragments } from './drawio-sequence-fragments';
import { collectShapes, dividerFromEdge, originalMessageY } from './drawio-sequence-sources';
import { frameRects, furnitureRects, placeRows } from './drawio-sequence-rows';
import { MARGIN, SELF_LOOP_W, labelWidth, type ParticipantPlan, type SequencePlan } from './drawio-sequence-types';
import { readCells, type TCell } from './drawio-table-cells';

export type { MessagePlan, ParticipantPlan, SequencePlan } from './drawio-sequence-types';

const MIN_CENTER_GAP = 180;
const LABEL_PAD = 40; // clear space around a message label between two lifelines
const FIRST_ROW_GAP = 40; // header bottom → first message
const NOTE_GAP = 20;

const isActor = (c: TCell): boolean => /umlActor/.test(c.style);
const MAX_HEADER = 100;
const MAX_ACTOR = 60; // stick figure height; its label goes below it
/** Room for an actor's label, which sits under the figure. */
export const ACTOR_LABEL_H = 24;

/** Header height of a participant: the lifeline's `size`, else the shape's own height. */
function headerOf(c: TCell): number {
  const size = /(?:^|;)size=([\d.]+)/.exec(c.style)?.[1];
  if (/umlLifeline/.test(c.style) && size) return Number(size);
  return Math.max(30, Math.min(c.geo.height ?? 40, isActor(c) ? MAX_ACTOR : MAX_HEADER));
}

/** Messages in document order; unlabelled duplicates of a labelled message are set aside. */
function splitMessages(edges: TCell[]): { messages: TCell[]; redundant: string[] } {
  const pair = (e: TCell): string => `${e.source}>${e.target}`;
  const labelled = new Map<string, number>();
  for (const e of edges) if (e.value.trim()) labelled.set(pair(e), (labelled.get(pair(e)) ?? 0) + 1);
  const redundant: string[] = [];
  const messages = edges.filter(e => {
    if (e.value.trim() || !(labelled.get(pair(e)) ?? 0)) return true;
    labelled.set(pair(e), labelled.get(pair(e))! - 1);
    redundant.push(e.id);
    return false;
  });
  return { messages, redundant };
}

/** Participant order: first involvement in the message sequence. */
function participantOrder(messages: TCell[]): string[] {
  const order: string[] = [];
  for (const m of messages) for (const id of [m.source, m.target]) if (!order.includes(id)) order.push(id);
  return order;
}

/** Centre-to-centre distance of each neighbouring pair of lifelines. */
function columnGaps(parts: TCell[], messages: TCell[]): number[] {
  const index = new Map(parts.map((p, i) => [p.id, i]));
  const gaps = parts.slice(1).map((p, i) => Math.max(MIN_CENTER_GAP, ((parts[i].geo.width ?? 0) + (p.geo.width ?? 0)) / 2 + LABEL_PAD));
  for (const m of messages) {
    const a = index.get(m.source)!, b = index.get(m.target)!;
    const lo = Math.min(a, b), hi = Math.max(a, b);
    const need = lo === hi ? SELF_LOOP_W + labelWidth(m) + LABEL_PAD : labelWidth(m) + LABEL_PAD;
    if (lo === hi) { if (lo < gaps.length) gaps[lo] = Math.max(gaps[lo], need); continue; }
    const have = gaps.slice(lo, hi).reduce((s, g) => s + g, 0);
    if (have < need) gaps[hi - 1] += need - have; // widen the last span the message crosses
  }
  return gaps;
}

/**
 * Plan the canonical layout of a sequence diagram.
 * @param xml - draw.io XML whose root participants exchange the messages
 * @returns the plan, or null when the XML holds no messages between root shapes
 */
export function planSequence(xml: string): SequencePlan | null {
  const cells = readCells(xml);
  const byId = new Map(cells.map(c => [c.id, c]));
  const roots = new Set(cells.filter(c => !c.edge && c.parent === '1').map(c => c.id));
  const edges = cells.filter(c => c.edge && roots.has(c.source) && roots.has(c.target));
  if (edges.length === 0) return null;
  const { messages, redundant } = splitMessages(edges);
  const parts = participantOrder(messages).map(id => byId.get(id)!);
  const top = MARGIN;
  const participants = placeParticipants(parts, columnGaps(parts, messages), top);
  const headerBottom = Math.max(...participants.map(p => p.header + (p.actor ? ACTOR_LABEL_H : 0)));
  // Fragments are found from the ORIGINAL file (containment, positions), before anything moves
  const { shapes, originOf } = collectShapes(cells, new Set(participants.map(p => p.id)));
  const graph = parseDrawioXml(xml);
  const graphEdges = new Map(graph.edges.map(e => [e.id, e]));
  const msgY = messages.map(m => {
    const e = graphEdges.get(m.id);
    return originalMessageY(e, byId.get(m.source), e ? (originOf(e.parentId)?.y ?? null) : null);
  });
  const loose = new Map<string, { reverse: boolean }>();
  for (const e of graph.looseEdges ?? []) {
    const d = dividerFromEdge(e, originOf(e.parentId));
    if (d) { shapes.push(d.cell); loose.set(e.id, { reverse: d.reverse }); }
  }
  const an = analyzeFragments(shapes, msgY, messages.map(m => m.parent), loose);  const rows = placeRows(messages, participants, top + headerBottom + FIRST_ROW_GAP, an);
  const bottom = rows.end + FIRST_ROW_GAP;
  participants.forEach(p => { p.height = bottom - top; });
  const fragments = frameRects(an, rows, messages, participants);
  const furniture = furnitureRects(an, rows, fragments, msgY);
  const right = Math.max(...participants.map(p => p.x + p.width), ...fragments.map(f => f.x + f.w));
  const notes = placeNotes(shapes.filter(c => !an.consumed.has(c.id) && !loose.has(c.id)), right, top);
  return { participants, messages: rows.plans, redundant, notes, fragments, furniture, unmatchedFrames: an.unmatched, guessedDividers: an.guessed, top, bottom };
}

function placeParticipants(parts: TCell[], gaps: number[], top: number): ParticipantPlan[] {
  let cx = MARGIN + (parts[0].geo.width ?? 80) / 2;
  return parts.map((p, i) => {
    if (i > 0) cx += gaps[i - 1];
    const width = p.geo.width ?? 80;
    return { id: p.id, x: cx - width / 2, y: top, width, height: 0, header: headerOf(p), actor: isActor(p) };
  });
}

function placeNotes(notes: TCell[], right: number, top: number): Array<{ id: string; x: number; y: number }> {
  let y = top;
  return notes.map(n => {
    const at = { id: n.id, x: right + MARGIN, y };
    y += (n.geo.height ?? 40) + NOTE_GAP;
    return at;
  });
}
