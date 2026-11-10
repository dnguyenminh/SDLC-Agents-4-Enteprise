/**
 * SA4E-406 — vertical rows and fragment frames of a sequence diagram.
 *
 * Messages go top-down in document order, one row each. A fragment adds room
 * above its first message (frame tab), below its last, and a divider adds room
 * between two operands; nested frames stack their tabs. Frame x-extents wrap the
 * lifelines the enclosed messages touch (and the frames nested inside).
 */

import type { FragmentAnalysis, FragmentSpec, FurnitureSpec } from './drawio-sequence-fragments';
import { ROW_STEP, SELF_LOOP_H, SELF_LOOP_W, labelWidth, type MessagePlan, type ParticipantPlan, type PlacedRect } from './drawio-sequence-types';
import type { TCell } from './drawio-table-cells';

const FRAME_HEAD = 46; // frame tab (30) + room for the first message's label
const DIVIDER_GAP = 34; // line near the top, room for its `[else]` guard label below
const DIVIDER_TOP = 8;
const FRAME_TAIL = 16; // last message → frame bottom
const FRAME_NEST = 12; // between a frame's bottom and its parent's
const FRAME_AFTER = 22; // frame bottom → next message
const SIDE_PAD = 40; // lifeline centre → frame side
const NEST_PAD = 14; // child frame → parent frame side
const MIN_FRAME_W = 140;
const LOOP_LABEL_PAD = 12;

/** Rows plus the vertical extents of frames and dividers. */
export interface RowsResult {
  plans: MessagePlan[];
  /** Bottom of the lowest message / frame. */
  end: number;
  frameY: Map<string, { top: number; bottom: number }>;
  dividerY: Map<string, number>;
}

const group = <T>(items: T[], key: (t: T) => number): Map<number, T[]> => {
  const out = new Map<number, T[]>();
  for (const t of items) out.set(key(t), [...(out.get(key(t)) ?? []), t]);
  return out;
};

/**
 * Place the message rows.
 * @param messages - messages in document order
 * @param start - y of the first row without fragments
 */
export function placeRows(messages: TCell[], parts: ParticipantPlan[], start: number, an: FragmentAnalysis): RowsResult {
  const byId = new Map(parts.map(p => [p.id, p]));
  const startsAt = group(an.fragments, f => f.first);
  const endsAt = group(an.fragments, f => f.last);
  const dividersAt = group(an.furniture.filter(f => f.before !== null), f => f.before!);
  const frameY = new Map<string, { top: number; bottom: number }>();
  const dividerY = new Map<string, number>();
  const plans: MessagePlan[] = [];
  let y = start, end = start;
  messages.forEach((m, i) => {
    for (const d of dividersAt.get(i) ?? []) { dividerY.set(d.id, y + DIVIDER_TOP); y += DIVIDER_GAP; }
    for (const f of (startsAt.get(i) ?? []).sort((a, b) => a.level - b.level)) { frameY.set(f.id, { top: y, bottom: 0 }); y += FRAME_HEAD; }
    const self = m.source === m.target;
    const p = byId.get(m.source)!;
    plans.push({ id: m.id, source: m.source, target: m.target, y, self, loopX: p.x + p.width / 2 + SELF_LOOP_W });
    const rowBottom = y + (self ? SELF_LOOP_H : 0);
    end = Math.max(end, rowBottom);
    y += self ? SELF_LOOP_H + ROW_STEP : ROW_STEP;
    let bottom = rowBottom + FRAME_TAIL;
    const ending = (endsAt.get(i) ?? []).sort((a, b) => b.level - a.level);
    for (const f of ending) { frameY.get(f.id)!.bottom = bottom; end = Math.max(end, bottom); bottom += FRAME_NEST; }
    if (ending.length) y = Math.max(y, bottom - FRAME_NEST + FRAME_AFTER);
  });
  return { plans, end, frameY, dividerY };
}

/** x-extent of one frame: the lifelines its messages touch, padded; widened to hold nested frames. */
function frameSides(f: FragmentSpec, messages: TCell[], parts: ParticipantPlan[], children: PlacedRect[]): { left: number; right: number } {
  const centre = new Map(parts.map(p => [p.id, p.x + p.width / 2]));
  let left = Infinity, right = -Infinity;
  for (const m of messages.slice(f.first, f.last + 1)) {
    const loop = m.source === m.target ? SELF_LOOP_W + labelWidth(m) + LOOP_LABEL_PAD : 0;
    for (const id of [m.source, m.target]) {
      left = Math.min(left, centre.get(id)! - SIDE_PAD);
      right = Math.max(right, centre.get(id)! + SIDE_PAD + (id === m.source ? loop : 0));
    }
  }
  for (const c of children) { left = Math.min(left, c.x - NEST_PAD); right = Math.max(right, c.x + c.w + NEST_PAD); }
  return right - left < MIN_FRAME_W ? { left, right: left + MIN_FRAME_W } : { left, right };
}

/** Frame rects, innermost computed first so parents can wrap them. */
export function frameRects(an: FragmentAnalysis, rows: RowsResult, messages: TCell[], parts: ParticipantPlan[]): PlacedRect[] {
  const done = new Map<string, PlacedRect>();
  for (const f of [...an.fragments].sort((a, b) => b.level - a.level)) {
    const kids = an.fragments.filter(c => c.parent === f.id).map(c => done.get(c.id)!);
    const { left, right } = frameSides(f, messages, parts, kids);
    const { top, bottom } = rows.frameY.get(f.id)!;
    done.set(f.id, { id: f.id, x: left, y: top, w: right - left, h: bottom - top });
  }
  return an.fragments.map(f => done.get(f.id)!);
}

/** Orig→new y anchors inside one fragment: its messages and dividers, ordered by original y. */
function anchors(f: FragmentSpec, an: FragmentAnalysis, rows: RowsResult, msgY: Array<number | null>): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = f.first; i <= f.last; i++) if (msgY[i] !== null) out.push([msgY[i]!, rows.plans[i].y]);
  for (const d of an.furniture) {
    if (d.fragment === f.id && rows.dividerY.has(d.id)) out.push([d.rect.y + d.rect.h / 2, rows.dividerY.get(d.id)!]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

/** Piecewise-linear map of an original y through the anchors (slope 1 outside them). */
export function mapY(y: number, pts: Array<[number, number]>): number {
  if (pts.length === 0) return y;
  if (y <= pts[0][0]) return pts[0][1] + (y - pts[0][0]);
  const last = pts[pts.length - 1];
  if (y >= last[0]) return last[1] + (y - last[0]);
  const k = pts.findIndex(p => p[0] >= y);
  const [a, b] = [pts[k - 1], pts[k]];
  return b[0] === a[0] ? a[1] : a[1] + ((y - a[0]) * (b[1] - a[1])) / (b[0] - a[0]);
}

/** y of a guard label: its divider's new y plus the offset it had in the original. */
function guardY(f: FurnitureSpec, an: FragmentAnalysis, rows: RowsResult): number | null {
  const divider = f.anchor ? an.furniture.find(d => d.id === f.anchor) : undefined;
  if (!divider || !rows.dividerY.has(divider.id)) return null;
  return rows.dividerY.get(divider.id)! + (f.rect.y + f.rect.h / 2 - (divider.rect.y + divider.rect.h / 2));
}

function place(f: FurnitureSpec, frame: FragmentSpec, at: PlacedRect, newCy: number): PlacedRect {
  const w = f.before !== null ? at.w : f.rect.w;
  const rel = f.rect.x - frame.rect.x;
  const x = f.before !== null ? at.x : Math.min(Math.max(at.x + rel, at.x), at.x + at.w - w);
  return { id: f.id, x, y: newCy - f.rect.h / 2, w, h: f.rect.h, ...(f.edge ? { edge: f.edge } : {}) };
}

/** Dividers span their frame; labels keep their offset inside it and follow the message rows. */
export function furnitureRects(
  an: FragmentAnalysis, rows: RowsResult, frames: PlacedRect[], msgY: Array<number | null>,
): PlacedRect[] {
  const frameById = new Map(an.fragments.map(f => [f.id, f]));
  const rectById = new Map(frames.map(r => [r.id, r]));
  return an.furniture.map(f => {
    const frame = frameById.get(f.fragment)!;
    const cy = f.rect.y + f.rect.h / 2;
    const newCy = rows.dividerY.get(f.id) ?? guardY(f, an, rows) ?? mapY(cy, anchors(frame, an, rows, msgY));
    return place(f, frame, rectById.get(f.fragment)!, newCy);
  });
}
