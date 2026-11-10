/**
 * SA4E-406 — sequence-diagram and use-case-diagram layout strategies.
 */
import { describe, it, expect } from 'vitest';
import { planSequence } from '../drawio-sequence-plan';
import { applySequencePlan } from '../drawio-sequence-xml';
import { detectSequenceDiagram } from '../drawio-detect-sequence';
import { detectUseCaseDiagram } from '../drawio-detect-usecase';
import { planUseCase } from '../drawio-usecase-plan';
import { applyUseCasePlan } from '../drawio-usecase-xml';
import { parseDrawioXml } from '../drawio-parser';
import { readCells } from '../drawio-table-cells';

const wrap = (cells: string): string =>
  `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel>`;
const geo = (x: number, y: number, w: number, h: number): string =>
  `<mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/>`;
const vertex = (id: string, style: string, g: string, parent = '1'): string =>
  `<mxCell id="${id}" value="${id}" style="${style}" vertex="1" parent="${parent}">${g}</mxCell>`;
const edge = (id: string, s: string, t: string, value = id, style = 'endArrow=block;'): string =>
  `<mxCell id="${id}" value="${value}" style="${style}" edge="1" parent="1" source="${s}" target="${t}"><mxGeometry relative="1" as="geometry"/></mxCell>`;
const styleOf = (xml: string, id: string): string => readCells(xml).find(c => c.id === id)!.style;

/** Scrambled sequence: participants out of order, each message doubled by an unlabelled copy. */
const SEQUENCE = wrap(
  vertex('user', 'shape=umlActor;verticalLabelPosition=bottom;', geo(500, 600, 40, 80))
  + vertex('api', 'rounded=1;fillColor=#ffe0b2;', geo(20, 300, 120, 50))
  + vertex('db', 'rounded=1;', geo(300, 20, 120, 50))
  + vertex('note', 'rounded=1;fillColor=#fff9c4;', geo(0, 0, 160, 60))
  + edge('l1', 'user', 'api', '') + edge('m1', 'user', 'api', 'request')
  + edge('l2', 'api', 'api', '') + edge('m2', 'api', 'api', 'validate')
  + edge('m3', 'api', 'db', 'query') + edge('m4', 'db', 'api', 'rows') + edge('m5', 'api', 'user', 'response'),
);

describe('sequence layout', () => {
  const plan = planSequence(SEQUENCE)!;
  const styles = new Map(readCells(SEQUENCE).map(c => [c.id, c.style]));
  const out = applySequencePlan(SEQUENCE, plan, styles);

  it('orders participants by first involvement and messages by document order', () => {
    expect(plan.participants.map(p => p.id)).toEqual(['user', 'api', 'db']);
    expect(plan.participants[0].x).toBeLessThan(plan.participants[1].x);
    expect(plan.messages.map(m => m.id)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
    const ys = plan.messages.map(m => m.y);
    expect(ys).toEqual([...ys].sort((a, b) => a - b));
    expect(plan.notes.map(n => n.id)).toEqual(['note']);
  });

  it('drops unlabelled edges that duplicate a labelled message', () => {
    expect(plan.redundant).toEqual(['l1', 'l2']);
    expect(out).not.toContain('id="l1"');
    expect(out).not.toContain('id="l2"');
  });

  it('turns participants into lifelines that keep their look', () => {
    expect(styleOf(out, 'user')).toMatch(/^shape=umlLifeline;perimeter=lifelinePerimeter;participant=umlActor;/);
    expect(styleOf(out, 'api')).toContain('fillColor=#ffe0b2');
    const tops = plan.participants.map(p => p.y);
    expect(new Set(tops).size).toBe(1);
  });

  it('draws a message as one horizontal row and a self-call as a loop', () => {
    const m3 = styleOf(out, 'm3');
    expect(/exitY=([\d.]+)/.exec(m3)![1]).toBe(/entryY=([\d.]+)/.exec(m3)![1]);
    const m2 = plan.messages.find(m => m.id === 'm2')!;
    expect(m2.self).toBe(true);
    expect(out).toMatch(/id="m2"[\s\S]*?<Array as="points"><mxPoint/);
  });

  it('is idempotent and still recognised as a sequence diagram afterwards', () => {
    const again = applySequencePlan(out, planSequence(out)!, new Map(readCells(out).map(c => [c.id, c.style])));
    expect(again).toBe(out);
    expect(detectSequenceDiagram(parseDrawioXml(out)).isSequence).toBe(true);
  });
});

/** Ten use cases of mixed width — a straight column lets the far lines clip the wide neighbours. */
const CASES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
/** Use cases scattered outside a left-titled boundary; one actor associated with all of them. */
const USE_CASE = wrap(
  vertex('actor', 'shape=umlActor;', geo(900, 0, 40, 80))
  + vertex('other', 'shape=umlActor;', geo(0, 0, 40, 80))
  + '<mxCell id="sys" value="System" style="swimlane;startSize=30;horizontal=0;" vertex="1" parent="1">' + geo(0, 300, 300, 200) + '</mxCell>'
  + CASES.map(i => vertex(`uc${i}`, 'ellipse;whiteSpace=wrap;', geo(i * 210, 40, i % 2 ? 160 : 220, 80), 'sys')).join('')
  + CASES.map(i => edge(`a${i}`, 'actor', `uc${i}`, '')).join('')
  + edge('b1', 'other', 'uc5', '') + edge('inc', 'uc1', 'uc2', '', 'dashed=1;'),
);

describe('use-case layout', () => {
  const graph = parseDrawioXml(USE_CASE);
  const model = detectUseCaseDiagram(graph)!;
  const plan = planUseCase(model, graph.edges);

  it('recognises boundary, use cases and actors', () => {
    expect(model.groups.map(g => g.boundary?.id)).toEqual(['sys']);
    expect(model.cases).toHaveLength(10);
    expect(model.actors.map(a => a.id)).toEqual(['actor', 'other']);
  });

  it('does not take a flow chart in a container for a use-case diagram', () => {
    const flow = wrap('<mxCell id="c" value="" style="swimlane;" vertex="1" parent="1">' + geo(0, 0, 400, 200) + '</mxCell>'
      + ['p', 'q', 'r'].map((id, i) => vertex(id, 'rounded=1;', geo(i * 120, 40, 100, 40), 'c')).join('')
      + vertex('x', 'rounded=1;', geo(600, 0, 80, 40)) + edge('e1', 'x', 'p') + edge('e2', 'p', 'q'));
    expect(detectUseCaseDiagram(parseDrawioXml(flow))).toBeNull();
  });

  it('puts the primary actor left, others right, and moves a side title to the top', () => {
    const b = plan.boundaries[0];
    expect(plan.roots.get('actor')!.x).toBeLessThan(b.rect.x);
    expect(plan.roots.get('other')!.x).toBeGreaterThan(b.rect.x + b.rect.w);
    expect(b.style).not.toContain('horizontal=0');
  });

  it('keeps every association line clear of the use cases it does not target', () => {
    const actor = model.actors[0];
    const a = plan.roots.get(actor.id)!;
    const from = { x: a.x + actor.width / 2, y: a.y + actor.height / 2 };
    const ellipse = (id: string) => {
      const c = model.cases.find(k => k.id === id)!, p = plan.cases.get(id)!;
      const b = plan.boundaries[0].rect;
      return { cx: b.x + p.x + c.width / 2, cy: b.y + p.y + c.height / 2, rx: c.width / 2, ry: c.height / 2 };
    };
    for (const target of model.cases) {
      const t = ellipse(target.id);
      for (const other of model.cases.filter(c => c.id !== target.id)) {
        const o = ellipse(other.id);
        for (let s = 0; s <= 1; s += 0.01) {
          const x = from.x + (t.cx - from.x) * s, y = from.y + (t.cy - from.y) * s;
          expect(((x - o.cx) / o.rx) ** 2 + ((y - o.cy) / o.ry) ** 2).toBeGreaterThan(1);
        }
      }
    }
  });

  it('is idempotent', () => {
    const ends = new Map(graph.edges.map(e => [e.id, { source: e.sourceId, target: e.targetId }]));
    const order = model.cases.map(c => c.id);
    const out = applyUseCasePlan(USE_CASE, plan, order, ends);
    const g2 = parseDrawioXml(out);
    const again = applyUseCasePlan(out, planUseCase(detectUseCaseDiagram(g2)!, g2.edges), order, ends);
    expect(again).toBe(out);
  });
});
