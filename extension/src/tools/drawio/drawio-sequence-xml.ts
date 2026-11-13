/**
 * SA4E-406 — write a SequencePlan into draw.io XML.
 *
 * Participants become native UML lifelines (`shape=umlLifeline`, the original
 * shape kept as `participant=`), so the dashed line is part of the cell and
 * messages stay connected to their participants. Each message leaves and enters
 * its lifelines at a fixed fraction of the lifeline height: one horizontal row
 * per message, in order. Deterministic: re-applying the plan of a laid-out
 * diagram returns identical XML.
 */

import { SELF_LOOP_H as SELF_LOOP_HEIGHT, type MessagePlan, type ParticipantPlan, type PlacedRect, type SequencePlan } from './drawio-sequence-types';
import { rewriteStyle } from './drawio-style';
import { escapeRegex, patchCell, setCellParent } from './drawio-xml-utils';

/** Participant style keys the lifeline form owns (rebuilt on every run). */
const LIFELINE_KEYS = new Set(['shape', 'perimeter', 'participant', 'size', 'container', 'collapsible',
  'recursiveResize', 'verticalLabelPosition', 'verticalAlign', 'spacingTop', 'labelBackgroundColor', 'outlineConnect']);
/** Message style keys that describe routing/label placement (rebuilt on every run). */
const MESSAGE_KEYS = new Set(['edgeStyle', 'exitX', 'exitY', 'exitDx', 'exitDy', 'exitPerimeter', 'entryX', 'entryY',
  'entryDx', 'entryDy', 'entryPerimeter', 'orthogonalLoop', 'jettySize', 'curved', 'rounded', 'verticalAlign', 'align',
  'spacingLeft', 'labelPosition', 'verticalLabelPosition']);

const r4 = (v: number): number => Math.round(v * 10000) / 10000;
const r1 = (v: number): number => Math.round(v * 10) / 10;

/** Lifeline style for a participant, keeping its look (colours, fonts, rounding). */
export function lifelineStyle(style: string, p: ParticipantPlan): string {
  const shape = /(?:^|;)shape=([^;]+)/.exec(style)?.[1];
  const participant = shape && shape !== 'umlLifeline' ? shape : /(?:^|;)participant=([^;]+)/.exec(style)?.[1];
  const head = ['shape=umlLifeline', 'perimeter=lifelinePerimeter', ...(participant ? [`participant=${participant}`] : []),
    'container=0', 'collapsible=0', `size=${r1(p.header)}`];
  // An actor's label sits under the stick figure, on a white plate so the lifeline does not strike it
  const label = p.actor ? ['verticalAlign=top', `spacingTop=${r1(p.header)}`, 'labelBackgroundColor=#ffffff'] : [];
  // lifeline keys first, so the shape is obvious when reading the style
  return `${head.join(';')};${rewriteStyle(style, LIFELINE_KEYS, label)}`;
}

/** Message style: fixed lifeline anchors at the message row (self-calls loop to the right). */
export function messageStyle(style: string, m: MessagePlan, plan: SequencePlan): string {
  const f = (y: number): number => r4((y - plan.top) / (plan.bottom - plan.top));
  const exitY = f(m.y), entryY = m.self ? f(m.y + SELF_LOOP_HEIGHT) : exitY;
  const anchors = [`exitX=0.5`, `exitY=${exitY}`, 'exitDx=0', 'exitDy=0', 'entryX=0.5', `entryY=${entryY}`, 'entryDx=0', 'entryDy=0'];
  const label = m.self
    ? ['edgeStyle=orthogonalEdgeStyle', 'rounded=0', 'align=left', 'verticalAlign=middle', 'spacingLeft=4']
    : ['verticalAlign=bottom'];
  return rewriteStyle(style, MESSAGE_KEYS, [...anchors, ...label]);
}

/** Frame style: never filled, so the lifelines and messages behind it stay visible. */
function frameStyle(style: string): string {
  return /(?:^|;)fillColor=/.test(style) ? style : `${style.replace(/;?$/, ';')}fillColor=none;`;
}

/** Replace a cell's style attribute. */
function setStyle(xml: string, id: string, style: string): string {
  return patchCell(xml, id, (open, body) => ({ open: open.replace(/\sstyle="[^"]*"/, ` style="${style}"`), body }));
}

/** Replace the whole inner XML of a cell (drops stale waypoints and stray elements). */
function setBody(xml: string, id: string, body: string): string {
  return patchCell(xml, id, open => ({ open, body }));
}

const vertexGeometry = (x: number, y: number, w: number, h: number): string =>
  `<mxGeometry x="${r1(x)}" y="${r1(y)}" width="${r1(w)}" height="${r1(h)}" as="geometry"/>`;

/** A divider drawn as an edge without terminals: two points, in the original direction. */
function dividerGeometry(f: PlacedRect): string {
  const [from, to] = f.edge!.reverse ? [f.x + f.w, f.x] : [f.x, f.x + f.w];
  const pt = (x: number, as: string): string => `<mxPoint x="${r1(x)}" y="${r1(f.y)}" as="${as}"/>`;
  return `<mxGeometry relative="1" as="geometry">${pt(from, 'sourcePoint')}${pt(to, 'targetPoint')}</mxGeometry>`;
}

function messageGeometry(m: MessagePlan): string {
  if (!m.self) return '<mxGeometry relative="1" as="geometry"/>';
  const pts = [{ x: m.loopX, y: m.y }, { x: m.loopX, y: m.y + SELF_LOOP_HEIGHT }]
    .map(p => `<mxPoint x="${r1(p.x)}" y="${r1(p.y)}"/>`).join('');
  return `<mxGeometry relative="1" as="geometry"><Array as="points">${pts}</Array></mxGeometry>`;
}

/** Remove one `<mxCell id=…>` element. */
function removeCell(xml: string, id: string): string {
  const re = new RegExp(`\\s*<mxCell\\b(?:[^"<>]|"[^"]*")*?\\bid="${escapeRegex(id)}"(?:[^"<>]|"[^"]*")*?(?:/>|>[\\s\\S]*?</mxCell>)`);
  return xml.replace(re, '');
}

/** Width/height of a cell as stored (notes keep their size). */
function storedSize(xml: string, id: string): { w: number; h: number } {
  const cell = new RegExp(`<mxCell\\b(?:[^"<>]|"[^"]*")*?\\bid="${escapeRegex(id)}"[\\s\\S]*?<mxGeometry\\b([^>]*)`).exec(xml)?.[1] ?? '';
  const n = (k: string): number => Number(new RegExp(`\\s${k}="([^"]*)"`).exec(cell)?.[1] ?? 0);
  return { w: n('width'), h: n('height') };
}

/**
 * Apply the plan.
 * @param xml - original draw.io XML
 * @param plan - plan from planSequence(xml)
 * @param styles - current style of every planned cell, by id
 */
export function applySequencePlan(xml: string, plan: SequencePlan, styles: Map<string, string>): string {
  let out = plan.redundant.reduce(removeCell, xml);
  for (const p of plan.participants) {
    out = setStyle(out, p.id, lifelineStyle(styles.get(p.id) ?? '', p));
    out = setBody(out, p.id, vertexGeometry(p.x, p.y, p.width, p.height));
  }
  for (const m of plan.messages) {
    // loop waypoints are absolute, so the message must live at the root
    out = setCellParent(setStyle(out, m.id, messageStyle(styles.get(m.id) ?? '', m, plan)), m.id, '1');
    out = setBody(out, m.id, messageGeometry(m));
  }
  // Frames, dividers and notes may have been nested in a container frame: geometry is absolute now
  for (const f of plan.fragments) {
    // a filled frame would hide the lifelines and messages drawn before it
    out = setStyle(out, f.id, frameStyle(styles.get(f.id) ?? ''));
    out = setBody(setCellParent(out, f.id, '1'), f.id, vertexGeometry(f.x, f.y, f.w, f.h));
  }
  for (const f of plan.furniture) {
    out = setBody(setCellParent(out, f.id, '1'), f.id, f.edge ? dividerGeometry(f) : vertexGeometry(f.x, f.y, f.w, f.h));
  }
  for (const n of plan.notes) {
    const { w, h } = storedSize(out, n.id);
    out = setBody(setCellParent(out, n.id, '1'), n.id, vertexGeometry(n.x, n.y, w, h));
  }
  return out;
}

