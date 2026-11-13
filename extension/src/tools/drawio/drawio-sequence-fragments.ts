/**
 * SA4E-406 — combined fragments (alt / loop / opt …) of a sequence diagram.
 *
 * A fragment is a frame drawn around a run of messages. Which messages it
 * encloses is read from the ORIGINAL file, from whichever of these it offers:
 *   - containment: the message is a child of the frame (container frames);
 *   - position: the frame's rect against the y of every message (terminal
 *     point, anchor fraction on a lifeline-like shape, or waypoint).
 * Dividers (`else` lines, drawn as thin shapes or as edges without terminals) and
 * the small labels inside a frame travel with it. Fragments nest; a frame that
 * encloses no message is reported as unmatched and stays a plain note.
 */

import type { Rect } from './drawio-geometry';
import { isFragmentFrame } from './drawio-style';
import type { TCell } from './drawio-table-cells';

/** A fragment frame and the messages (indices into document order) it encloses. */
export interface FragmentSpec { id: string; rect: Rect; first: number; last: number; level: number; parent: string | null; }
/** A shape that travels with a fragment: a divider (`else` line) or a small label. */
export interface FurnitureSpec {
  id: string; fragment: string; rect: Rect;
  /** Dividers only: index of the first message below the line. */
  before: number | null;
  /** Labels only: the divider this label belongs to (it keeps its offset from that line). */
  anchor?: string;
  /** Set when the divider is an edge without terminals (written back as two points). */
  edge?: { reverse: boolean };
}
export interface FragmentAnalysis {
  fragments: FragmentSpec[]; furniture: FurnitureSpec[]; consumed: Set<string>;
  /** Frames that enclose no message (no usable positions in the file). */
  unmatched: string[];
  /** Dividers whose place between the messages is unknown (no message positions): put mid-frame. */
  guessed: string[];
}

const UML_FRAME = /(?:^|;)shape=umlFrame(?:;|$)/;
const LINE_STYLE = /(?:^|;)(?:shape=)?line(?:;|$)/;
/** A label within this distance (px) below/above a divider belongs to it. */
const GUARD_REACH = 40;
/** A divider is at most this thick (px). */
export const DIVIDER_MAX_H = 4;
/** Labels bigger than this are notes, not fragment labels. */
const LABEL_MAX = { w: 260, h: 80 };

const rectOf = (c: TCell): Rect | null => {
  const { x, y, width, height } = c.geo;
  return x === undefined || y === undefined || width === undefined || height === undefined ? null : { x, y, w: width, h: height };
};
const area = (r: Rect): number => r.w * r.h;
const centreOf = (r: Rect): { x: number; y: number } => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
const inside = (p: { x: number; y: number }, r: Rect): boolean => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;

/** True for a fragment frame: a UML frame, or a large dashed rectangle. */
export function isFragmentCell(c: TCell): boolean {
  return UML_FRAME.test(c.style) || isFragmentFrame(c.style, c.geo.width ?? 0, c.geo.height ?? 0);
}

/** True when `parentId` is the frame itself or lies inside it (through frames). */
function insideFrame(frameId: string, parentId: string, byId: Map<string, TCell>): boolean {
  for (let cur = parentId, depth = 0; depth < 20 && cur && cur !== '1'; depth++) {
    if (cur === frameId) return true;
    cur = byId.get(cur)?.parent ?? '';
  }
  return false;
}

/** Frames that enclose at least one message, outermost first, with nesting resolved. */
function resolveFrames(frames: TCell[], msgY: Array<number | null>, msgParent: string[], byId: Map<string, TCell>): FragmentSpec[] {
  const specs: FragmentSpec[] = [];
  for (const f of frames) {
    const rect = rectOf(f)!;
    const hit = msgY.flatMap((y, i) =>
      (insideFrame(f.id, msgParent[i], byId) || (y !== null && y >= rect.y && y <= rect.y + rect.h) ? [i] : []));
    if (hit.length) specs.push({ id: f.id, rect, first: Math.min(...hit), last: Math.max(...hit), level: 0, parent: null });
  }
  // widest run first, then the larger frame: a container always precedes what it contains
  specs.sort((a, b) => (b.last - b.first) - (a.last - a.first) || area(b.rect) - area(a.rect));
  specs.forEach((s, i) => {
    const parent = specs.slice(0, i).reverse().find(p => p.first <= s.first && p.last >= s.last);
    s.parent = parent?.id ?? null;
    s.level = parent ? parent.level + 1 : 0;
  });
  return specs;
}

/**
 * Where a divider falls when no message of its frame has a position: the middle of the run.
 * @returns null when the run is too short to split
 */
function guessDivider(spec: FragmentSpec): number | null {
  const span = spec.last - spec.first + 1;
  return span >= 2 ? spec.first + Math.ceil(span / 2) : null;
}

/** First message (document index) lying below a divider; null when the line is not between two messages. */
function dividerBefore(spec: FragmentSpec, y: number, msgY: Array<number | null>): number | null {
  for (let i = spec.first; i <= spec.last; i++) if (msgY[i] !== null && msgY[i]! > y) return i > spec.first ? i : null;
  return null;
}

/**
 * A guard label (`[else]`) sits right next to its divider: bind it to that line, even when the
 * label also falls inside a frame nested right below the divider.
 */
function attachGuards(furniture: FurnitureSpec[]): void {
  const dividers = furniture.filter(f => f.before !== null);
  for (const label of furniture.filter(f => f.before === null)) {
    const c = centreOf(label.rect);
    const near = dividers.filter(d => c.x >= d.rect.x && c.x <= d.rect.x + d.rect.w && Math.abs(c.y - centreOf(d.rect).y) <= GUARD_REACH)
      .sort((a, b) => Math.abs(c.y - centreOf(a.rect).y) - Math.abs(c.y - centreOf(b.rect).y))[0];
    if (near) { label.anchor = near.id; label.fragment = near.fragment; }
  }
}

/**
 * Find the fragments among the shapes that are not participants.
 * @param shapes - vertices (absolute geometry) plus divider candidates built from loose edges
 * @param msgY - original y of each message in document order (null when unknown)
 * @param msgParent - parent cell id of each message (frames that contain messages)
 * @param loose - loose-edge dividers by id (so the writer can emit two points)
 */
export function analyzeFragments(
  shapes: TCell[], msgY: Array<number | null>, msgParent: string[], loose: Map<string, { reverse: boolean }>,
): FragmentAnalysis {
  const byId = new Map(shapes.map(s => [s.id, s]));
  const frameCells = shapes.filter(s => isFragmentCell(s) && rectOf(s));
  const fragments = resolveFrames(frameCells, msgY, msgParent, byId);
  const frameIds = new Set(fragments.map(f => f.id));
  const furniture: FurnitureSpec[] = [];
  const guessed: string[] = [];
  for (const s of shapes) {
    const rect = rectOf(s);
    if (!rect || frameIds.has(s.id) || isFragmentCell(s)) continue;
    const owner = fragments.filter(f => inside(centreOf(rect), f.rect)).sort((a, b) => area(a.rect) - area(b.rect))[0];
    if (!owner) continue;
    const thin = rect.h <= DIVIDER_MAX_H || LINE_STYLE.test(s.style);
    if (!thin && (rect.w > LABEL_MAX.w || rect.h > LABEL_MAX.h)) continue;
    const known = msgY.slice(owner.first, owner.last + 1).some(y => y !== null);
    const before = !thin ? null : known ? dividerBefore(owner, centreOf(rect).y, msgY) : guessDivider(owner);
    if (thin && !known && before !== null) guessed.push(s.id);
    furniture.push({ id: s.id, fragment: owner.id, rect, before, edge: loose.get(s.id) });
  }
  attachGuards(furniture);
  const consumed = new Set([...frameIds, ...furniture.map(f => f.id)]);
  return { fragments, furniture, consumed, unmatched: frameCells.map(f => f.id).filter(id => !frameIds.has(id)), guessed };
}
