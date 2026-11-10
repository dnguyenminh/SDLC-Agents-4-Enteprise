/**
 * SA4E-406 — sequence diagrams drawn with free-floating points.
 *
 * A very common way to author a sequence diagram: participants are plain boxes,
 * each lifeline is a vertical edge WITHOUT terminals under its box, and each
 * message is a horizontal edge WITHOUT terminals between two lifeline x
 * positions (a self-call is a short vertical edge with a waypoint to the right).
 * Nothing connects a message to a participant, so a graph layout moves the boxes
 * and leaves the lifelines and arrows behind.
 *
 * normalizePointSequence() reads the picture and rewrites it as an ordinary
 * anchored sequence diagram: every message gets source/target = the participants
 * whose lifelines it touches, messages are ordered by their y, the hand-drawn
 * lifeline edges are dropped (the participant becomes the lifeline). The result
 * goes through the regular sequence layout.
 */

import { parseDrawioXml, type DiagramEdge, type DiagramNode } from './drawio-parser';
import { escapeRegex, patchCell } from './drawio-xml-utils';

/** A lifeline is vertical (dx ≤ this) ... */
const VERTICAL_TOL = 3;
/** ... and at least this long (px). */
const LIFELINE_MIN_LEN = 100;
/** A message is horizontal (dy ≤ this) ... */
const HORIZONTAL_TOL = 3;
/** ... and at least this long (px). */
const MESSAGE_MIN_LEN = 20;
/** A self-call is a vertical stub of at most this length (px). */
const SELF_CALL_MAX_LEN = 80;
/** An arrow end belongs to a lifeline when it is within this distance in x (px). */
const ATTACH_TOL = 30;
/** The box a lifeline hangs from ends within this distance above/below its top (px). */
const BOX_TOUCH_TOL = 30;

/** Result of the normalization. */
export interface PointSequence { xml: string; participants: number; messages: number; }

interface Lifeline { edge: DiagramEdge; x: number; owner: DiagramNode; }

const dx = (e: DiagramEdge): number => Math.abs(e.targetPoint!.x - e.sourcePoint!.x);
const dy = (e: DiagramEdge): number => Math.abs(e.targetPoint!.y - e.sourcePoint!.y);

/** Vertical loose edges, each matched to the box right above its top end. */
function findLifelines(loose: DiagramEdge[], boxes: DiagramNode[]): Lifeline[] {
  const taken = new Set<string>();
  const out: Lifeline[] = [];
  for (const e of loose.filter(l => dx(l) <= VERTICAL_TOL && dy(l) >= LIFELINE_MIN_LEN)) {
    const x = e.sourcePoint!.x, top = Math.min(e.sourcePoint!.y, e.targetPoint!.y);
    const owner = boxes
      .filter(b => !taken.has(b.id) && x >= b.x && x <= b.x + b.width && Math.abs(b.y + b.height - top) <= BOX_TOUCH_TOL)
      .sort((a, b) => Math.abs(a.y + a.height - top) - Math.abs(b.y + b.height - top))[0];
    if (!owner) continue;
    taken.add(owner.id);
    out.push({ edge: e, x, owner });
  }
  return out;
}

/** The lifeline whose x is closest to `x` (within the attach tolerance). */
function lifelineAt(x: number, lifelines: Lifeline[]): Lifeline | undefined {
  return lifelines.filter(l => Math.abs(l.x - x) <= ATTACH_TOL).sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x))[0];
}

/** Participants joined by a loose edge, when it is a message between (or on) lifelines. */
function endsOf(e: DiagramEdge, lifelines: Lifeline[]): { from: Lifeline; to: Lifeline } | null {
  const [s, t] = [e.sourcePoint!, e.targetPoint!];
  const horizontal = dy(e) <= HORIZONTAL_TOL && dx(e) >= MESSAGE_MIN_LEN;
  const selfCall = dx(e) <= VERTICAL_TOL && dy(e) <= SELF_CALL_MAX_LEN && e.points.length > 0;
  if (!horizontal && !selfCall) return null;
  const [from, to] = [lifelineAt(s.x, lifelines), lifelineAt(t.x, lifelines)];
  return from && to && (horizontal ? from !== to : from === to) ? { from, to } : null;
}

/** The complete `<mxCell …>…</mxCell>` (or self-closing) element with this id. */
function cellElement(xml: string, id: string): string | null {
  const re = new RegExp(`[ \\t]*<mxCell\\b(?:[^"<>]|"[^"]*")*?\\bid="${escapeRegex(id)}"(?:[^"<>]|"[^"]*")*?(?:/>|>[\\s\\S]*?</mxCell>)\\n?`);
  return re.exec(xml)?.[0] ?? null;
}

/** A numbered step box ("3: extract base_dir …") sitting on a lifeline: a self-call drawn as a box. */
const NUMBERED_STEP = /^\s*\d+[a-z]?\s*[:.)]/i;

/** Boxes that are really self-calls: numbered like a message and placed on a lifeline. */
function findStepBoxes(boxes: DiagramNode[], lifelines: Lifeline[], taken: Set<string>): Array<{ box: DiagramNode; life: Lifeline }> {
  return boxes.flatMap(box => {
    if (taken.has(box.id) || !NUMBERED_STEP.test(box.label ?? '')) return [];
    const centre = box.x + box.width / 2;
    const life = lifelines.find(l => Math.abs(l.x - box.x) <= ATTACH_TOL || Math.abs(l.x - centre) <= ATTACH_TOL);
    const top = life ? Math.min(life.edge.sourcePoint!.y, life.edge.targetPoint!.y) : 0;
    return life && box.y >= top ? [{ box, life }] : [];
  });
}

/** The self-call edge that replaces a step box (same id and label, at the box's height). */
function selfCallXml(box: DiagramNode, life: Lifeline): string {
  const y = box.y + box.height / 2;
  return `<mxCell id="${box.id}" value="${box.label ?? ''}" style="html=1;endArrow=block;endFill=1;" edge="1" parent="1" `
    + `source="${life.owner.id}" target="${life.owner.id}"><mxGeometry relative="1" as="geometry">`
    + `<mxPoint x="${life.x}" y="${y}" as="sourcePoint"/><mxPoint x="${life.x}" y="${y + 20}" as="targetPoint"/></mxGeometry></mxCell>\n`;
}

/**
 * Rewrite a point-drawn sequence diagram as an anchored one.
 * @param xml - draw.io XML
 * @returns the rewritten XML, or null when the file is not a point-drawn sequence diagram
 */
export function normalizePointSequence(xml: string): PointSequence | null {
  const graph = parseDrawioXml(xml);
  const loose = (graph.looseEdges ?? []).filter(e => e.parentId === '1' && e.sourcePoint && e.targetPoint);
  const boxes = graph.nodes.filter(n => n.parentId === '1');
  const lifelines = findLifelines(loose, boxes);
  if (lifelines.length < 2) return null;
  const hung = new Set(lifelines.map(l => l.edge.id));
  const messages = loose.filter(e => !hung.has(e.id)).flatMap(e => {
    const ends = endsOf(e, lifelines);
    return ends ? [{ edge: e, ...ends }] : [];
  });
  const steps = findStepBoxes(boxes, lifelines, new Set(lifelines.map(l => l.owner.id)));
  if (messages.length + steps.length < 2 || messages.length < 1) return null;
  return { xml: rewrite(xml, lifelines, messages, steps), participants: lifelines.length, messages: messages.length + steps.length };
}

/** Drop the hand-drawn lifelines and step boxes; connect each message; append everything ordered by y. */
function rewrite(
  xml: string, lifelines: Lifeline[], messages: Array<{ edge: DiagramEdge; from: Lifeline; to: Lifeline }>,
  steps: Array<{ box: DiagramNode; life: Lifeline }>,
): string {
  let out = xml;
  for (const l of lifelines) out = out.replace(cellElement(out, l.edge.id) ?? '', '');
  const entries: Array<{ y: number; xml: string }> = [];
  for (const m of messages) {
    const connected = patchCell(out, m.edge.id, (open, body) => ({ open: `${open} source="${m.from.owner.id}" target="${m.to.owner.id}"`, body }));
    const el = cellElement(connected, m.edge.id);
    if (!el) continue;
    out = connected.replace(el, '');
    entries.push({ y: m.edge.sourcePoint!.y, xml: el });
  }
  for (const s of steps) {
    out = out.replace(cellElement(out, s.box.id) ?? '', '');
    entries.push({ y: s.box.y + s.box.height / 2, xml: selfCallXml(s.box, s.life) });
  }
  entries.sort((a, b) => a.y - b.y); // stable: ties keep authoring order
  const close = out.lastIndexOf('</root>');
  return out.slice(0, close) + entries.map(e => e.xml).join('') + out.slice(close);
}