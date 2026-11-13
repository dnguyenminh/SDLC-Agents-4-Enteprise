/**
 * SA4E-406 — fragment position sources (container frames, tall rectangle
 * lifelines, edge dividers), sequence detection signals, and use cases drawn
 * as rounded boxes / actors serving several boundaries.
 */
import { describe, it, expect } from 'vitest';
import { planSequence } from '../drawio-sequence-plan';
import { applySequencePlan } from '../drawio-sequence-xml';
import { detectSequenceDiagram } from '../drawio-detect-sequence';
import { detectUseCaseDiagram } from '../drawio-detect-usecase';
import { planUseCase } from '../drawio-usecase-plan';
import { parseDrawioXml } from '../drawio-parser';
import { readCells } from '../drawio-table-cells';

const wrap = (cells: string): string =>
  `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel>`;
const vertex = (id: string, style: string, x: number, y: number, w: number, h: number, parent = '1', value = id): string =>
  `<mxCell id="${id}" value="${value}" style="${style}" vertex="1" parent="${parent}"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`;
const edge = (id: string, s: string, t: string, style = 'endArrow=none;html=1;', parent = '1'): string =>
  `<mxCell id="${id}" value="${id}" style="${style}" edge="1" parent="${parent}" source="${s}" target="${t}"><mxGeometry relative="1" as="geometry"/></mxCell>`;
const looseEdge = (id: string, parent: string, x1: number, x2: number, y: number): string =>
  `<mxCell id="${id}" style="endArrow=none;dashed=1;html=1;" edge="1" parent="${parent}"><mxGeometry relative="1" as="geometry"><mxPoint x="${x1}" y="${y}" as="sourcePoint"/><mxPoint x="${x2}" y="${y}" as="targetPoint"/></mxGeometry></mxCell>`;
const styles = (xml: string): Map<string, string> => new Map(readCells(xml).map(c => [c.id, c.style]));
const FRAME = 'shape=umlFrame;whiteSpace=wrap;html=1;pointerEvents=0;';
const BOX = 'rounded=0;html=1;';

/** Participants are plain boxes, frames are containers, messages have no position at all. */
const CONTAINERS = wrap(
  vertex('cl', BOX, 600, 40, 100, 40) + vertex('api', BOX, 40, 40, 100, 40) + vertex('db', BOX, 300, 40, 100, 40)
  + vertex('alt', `${FRAME}container=1;`, 20, 120, 760, 260) + vertex('loop', `${FRAME}container=1;`, 30, 130, 700, 100, 'alt')
  + looseEdge('else', 'alt', 0, 760, 115)
  + edge('m1', 'cl', 'api', 'endArrow=block;html=1;') + edge('m2', 'api', 'db', 'endArrow=block;html=1;', 'alt')
  + edge('m3', 'db', 'api', 'endArrow=block;html=1;', 'alt') + edge('m4', 'api', 'db', 'endArrow=block;html=1;', 'loop')
  + edge('m5', 'db', 'api', 'endArrow=block;html=1;', 'loop') + edge('m6', 'api', 'cl', 'endArrow=block;html=1;'),
);

describe('fragments in container frames', () => {
  const plan = planSequence(CONTAINERS)!;
  const rowY = (id: string): number => plan.messages.find(m => m.id === id)!.y;
  const frame = (id: string) => plan.fragments.find(f => f.id === id)!;

  it('takes the enclosed messages from containment, with nesting', () => {
    expect(plan.fragments.map(f => f.id).sort()).toEqual(['alt', 'loop']);
    expect(frame('alt').y).toBeLessThan(rowY('m2'));
    expect(frame('alt').y + frame('alt').h).toBeGreaterThan(rowY('m5'));
    expect(rowY('m6')).toBeGreaterThan(frame('alt').y + frame('alt').h);
    expect(frame('loop').y).toBeLessThan(rowY('m4'));
    expect(frame('loop').y).toBeGreaterThan(rowY('m3')); // the loop starts after the else line
  });

  it('puts an unplaceable divider mid-frame and says so', () => {
    expect(plan.guessedDividers).toEqual(['else']);
    const d = plan.furniture.find(f => f.id === 'else')!;
    expect(d.y).toBeGreaterThan(rowY('m3'));
    expect(d.y).toBeLessThan(rowY('m4'));
    expect(d.edge).toBeDefined();
  });

  it('writes the edge divider as two points and detaches everything from the frame', () => {
    const out = applySequencePlan(CONTAINERS, plan, styles(CONTAINERS));
    const cells = new Map(readCells(out).map(c => [c.id, c]));
    for (const id of ['alt', 'loop', 'else', 'm2', 'm4']) expect(cells.get(id)!.parent).toBe('1');
    expect(out).toMatch(/id="else"[\s\S]*?as="sourcePoint"[\s\S]*?as="targetPoint"/);
  });

  it('is idempotent once the positions are written (the divider is then known, not guessed)', () => {
    const out = applySequencePlan(CONTAINERS, plan, styles(CONTAINERS));
    const again = planSequence(out)!;
    expect(again.guessedDividers).toEqual([]);
    expect(applySequencePlan(out, again, styles(out))).toBe(out);
  });
});

describe('sequence detection signals', () => {
  it('recognises a framed row of boxes exchanging a few messages', () => {
    expect(detectSequenceDiagram(parseDrawioXml(CONTAINERS)).isSequence).toBe(true);
  });

  it('recognises lifelines drawn as tall rectangles by their horizontal anchored arrows', () => {
    const tall = (id: string, x: number): string => vertex(id, `${BOX}dashed=1;`, x, 40, 100, 500);
    const msg = (id: string, s: string, t: string, y: number): string => {
      const f = (y - 40) / 500;
      return edge(id, s, t, `html=1;endArrow=block;exitX=0.5;exitY=${f};entryX=0.5;entryY=${f};`);
    };
    const xml = wrap(tall('a', 40) + tall('b', 300) + msg('m1', 'a', 'b', 120) + msg('m2', 'b', 'a', 200) + msg('m3', 'a', 'b', 300));
    expect(detectSequenceDiagram(parseDrawioXml(xml)).isSequence).toBe(true);
  });

  it('does not take a flow chart with a frame around part of it for a sequence diagram', () => {
    const xml = wrap(vertex('a', BOX, 0, 0, 80, 40) + vertex('b', BOX, 0, 150, 80, 40) + vertex('c', BOX, 200, 300, 80, 40)
      + vertex('f', FRAME, -20, 120, 200, 100) + edge('e1', 'a', 'b') + edge('e2', 'b', 'c') + edge('e3', 'a', 'c'));
    expect(detectSequenceDiagram(parseDrawioXml(xml)).isSequence).toBe(false);
  });

  it('keeps a frame with no positions and no contained message as a reported note', () => {
    const xml = wrap(vertex('cl', BOX, 600, 40, 100, 40) + vertex('api', BOX, 40, 40, 100, 40) + vertex('lone', FRAME, 20, 120, 400, 200)
      + edge('m1', 'cl', 'api', 'endArrow=block;') + edge('m2', 'api', 'cl', 'endArrow=block;') + edge('m3', 'cl', 'api', 'endArrow=block;'));
    const p = planSequence(xml)!;
    expect(p.unmatchedFrames).toEqual(['lone']);
    expect(p.notes.map(n => n.id)).toContain('lone');
  });
});

// ───────────────────────── use cases as boxes ─────────────────────────
const ACTOR = 'shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;';
const BOXCASE = 'rounded=1;arcSize=50;whiteSpace=wrap;html=1;';
const BOUNDARY = 'swimlane;startSize=30;html=1;';
/** The customer is linked to the first `shopLinks` shop use cases and the first `backLinks` back-office ones. */
const TWO_BOUNDARIES = (actorStyle: string, shopLinks = 3, backLinks = 3): string => wrap(
  vertex('cust', actorStyle, 700, 20, 30, 60)
  + vertex('shop', BOUNDARY, 100, 300, 300, 200) + vertex('back', BOUNDARY, 500, 100, 300, 200)
  + [1, 2, 3].map(i => vertex(`s${i}`, BOXCASE, 10 + i * 20, 40 + i * 10, 200, 60, 'shop')).join('')
  + [1, 2, 3].map(i => vertex(`b${i}`, BOXCASE, 10 + i * 5, 40 + i * 70, 170, 60, 'back')).join('')
  + [1, 2, 3].slice(0, shopLinks).map(i => edge(`a${i}`, 'cust', `s${i}`)).join('') + [1, 2, 3].slice(0, backLinks).map(i => edge(`c${i}`, 'cust', `b${i}`)).join(''),
);

describe('use cases drawn as rounded boxes', () => {
  it('are recognised inside boundaries when a UML actor confirms the diagram', () => {
    const model = detectUseCaseDiagram(parseDrawioXml(TWO_BOUNDARIES(ACTOR)))!;
    expect(model.groups.map(g => g.cases.length)).toEqual([3, 3]);
  });

  it('are not trusted without a UML actor (a component diagram looks the same)', () => {
    expect(detectUseCaseDiagram(parseDrawioXml(TWO_BOUNDARIES('rounded=0;html=1;')))).toBeNull();
  });

  it('keep every association clear of the other boxes', () => {
    const g = parseDrawioXml(TWO_BOUNDARIES(ACTOR));
    const model = detectUseCaseDiagram(g)!;
    const plan = planUseCase(model, g.edges);
    const rect = (id: string) => {
      const c = model.cases.find(k => k.id === id)!, p = plan.cases.get(id)!;
      const own = model.groups.find(gr => gr.cases.some(k => k.id === id))!.boundary!;
      const b = plan.boundaries.find(x => x.id === own.id)!.rect;
      return { x: b.x + p.x, y: b.y + p.y, w: c.width, h: c.height };
    };
    const cust = model.actors[0], at = plan.roots.get(cust.id)!;
    const from = { x: at.x + cust.width / 2, y: at.y + cust.height / 2 };
    for (const target of model.cases) {
      const t = rect(target.id);
      for (const other of model.cases.filter(c => c.id !== target.id)) {
        const o = rect(other.id);
        for (let s = 0; s <= 1; s += 0.02) {
          const x = from.x + (t.x + t.w / 2 - from.x) * s, y = from.y + (t.y + t.h / 2 - from.y) * s;
          expect(x > o.x && x < o.x + o.w && y > o.y && y < o.y + o.h).toBe(false);
        }
      }
    }
  });

  it('puts an actor linked to both boundaries in the gap between them', () => {
    // 1 link into the shop, 2 into the back office: the plain average of the targets falls INSIDE the shop
    const g = parseDrawioXml(TWO_BOUNDARIES(ACTOR, 1, 2));
    const model = detectUseCaseDiagram(g)!;
    const plan = planUseCase(model, g.edges);
    const [shop, back] = plan.boundaries;
    const cust = plan.roots.get('cust')!;
    const centre = cust.y + model.actors[0].height / 2;
    expect(centre).toBeGreaterThan(shop.rect.y + shop.rect.h);
    expect(centre).toBeLessThan(back.rect.y);
  });
});
