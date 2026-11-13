/**
 * SA4E-406 — sequence combined fragments (alt / loop / opt) and use-case
 * diagrams with several system boundaries or none.
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
const vertex = (id: string, style: string, x: number, y: number, w: number, h: number, parent = '1', value = id): string =>
  `<mxCell id="${id}" value="${value}" style="${style}" vertex="1" parent="${parent}"><mxGeometry x="${x}" y="${y}" width="${w}" height="${h}" as="geometry"/></mxCell>`;
const edge = (id: string, s: string, t: string, style = 'endArrow=none;html=1;'): string =>
  `<mxCell id="${id}" style="${style}" edge="1" parent="1" source="${s}" target="${t}"><mxGeometry relative="1" as="geometry"/></mxCell>`;
const geoOf = (xml: string, id: string) => readCells(xml).find(c => c.id === id)!.geo as { x: number; y: number; width: number; height: number };

// ───────────────────────── sequence fragments ─────────────────────────
const LIFELINE = 'shape=umlLifeline;perimeter=lifelinePerimeter;html=1;container=0;collapsible=0;size=40;';
/** Message at original y (lifeline spans y 40…560), anchored by exit/entry fractions. */
const msg = (id: string, s: string, t: string, y: number): string => {
  const f = Math.round(((y - 40) / 520) * 10000) / 10000;
  return edge(id, s, t, `html=1;endArrow=block;exitX=0.5;exitY=${f};exitDx=0;exitDy=0;entryX=0.5;entryY=${f};entryDx=0;entryDy=0;`);
};
const FRAME = 'shape=umlFrame;whiteSpace=wrap;html=1;pointerEvents=0;';

const FRAGMENTS = wrap(
  vertex('cl', LIFELINE, 700, 40, 100, 520) + vertex('api', LIFELINE, 40, 40, 100, 520) + vertex('db', LIFELINE, 330, 40, 100, 520)
  + [['m1', 'cl', 'api', 140], ['m2', 'api', 'db', 190], ['m3', 'db', 'api', 240], ['m4', 'api', 'db', 290], ['m5', 'db', 'api', 340], ['m6', 'api', 'cl', 440]]
    .map(([id, s, t, y]) => msg(id as string, s as string, t as string, y as number)).join('')
  // alt around m2..m5 with an else line between m3 and m4 and its guard; loop nested around m4..m5; opt around m6
  + vertex('alt', FRAME, 20, 165, 780, 200, '1', 'alt')
  + vertex('else', 'line;strokeWidth=1;dashed=1;html=1;', 20, 265, 780, 1, '1', '')
  + vertex('guard', 'text;html=1;align=left;', 30, 268, 60, 20, '1', '[else]')
  + vertex('loop', FRAME, 50, 275, 720, 80, '1', 'loop')
  + vertex('opt', FRAME, 30, 420, 770, 40, '1', 'opt')
  + vertex('note', 'rounded=1;whiteSpace=wrap;html=1;', 900, 60, 140, 50),
);
const seqStyles = (xml: string): Map<string, string> => new Map(readCells(xml).map(c => [c.id, c.style]));

describe('sequence fragments', () => {
  const plan = planSequence(FRAGMENTS)!;
  const out = applySequencePlan(FRAGMENTS, plan, seqStyles(FRAGMENTS));
  it('finds nested frames from the original message positions', () => {
    expect(plan.fragments.map(f => f.id).sort()).toEqual(['alt', 'loop', 'opt']);
    expect(plan.furniture.map(f => f.id).sort()).toEqual(['else', 'guard']);
    expect(plan.notes.map(n => n.id)).toEqual(['note']);
  });

  it('wraps each frame around exactly the rows it encloses', () => {
    const y = (id: string): number => plan.messages.find(m => m.id === id)!.y;
    const frame = (id: string) => plan.fragments.find(f => f.id === id)!;
    const alt = frame('alt'), loop = frame('loop'), opt = frame('opt');
    expect(alt.y).toBeLessThan(y('m2'));
    expect(alt.y + alt.h).toBeGreaterThan(y('m5'));
    expect(y('m6')).toBeGreaterThan(alt.y + alt.h); // m6 is outside alt
    expect(loop.y).toBeGreaterThan(alt.y); // nested: inside alt, around m4..m5
    expect(loop.y).toBeLessThan(y('m4'));
    expect(loop.y + loop.h).toBeLessThan(alt.y + alt.h);
    expect(opt.y).toBeLessThan(y('m6'));
    expect(opt.y).toBeGreaterThan(alt.y + alt.h);
  });

  it('keeps the divider between the two operands and the guard right under it', () => {
    const y = (id: string): number => plan.messages.find(m => m.id === id)!.y;
    const divider = plan.furniture.find(f => f.id === 'else')!, guard = plan.furniture.find(f => f.id === 'guard')!;
    const alt = plan.fragments.find(f => f.id === 'alt')!;
    expect(divider.y).toBeGreaterThan(y('m3'));
    expect(divider.y).toBeLessThan(y('m4'));
    expect(divider.x).toBe(alt.x);
    expect(divider.w).toBe(alt.w);
    expect(guard.y).toBeGreaterThanOrEqual(divider.y);
    expect(guard.y + guard.h).toBeLessThan(plan.fragments.find(f => f.id === 'loop')!.y); // clear of the nested tab
  });

  it('writes frames unfilled so lifelines stay visible, keeping their shape', () => {
    const style = readCells(out).find(c => c.id === 'alt')!.style;
    expect(style).toContain('shape=umlFrame');
    expect(style).toContain('fillColor=none');
    expect(geoOf(out, 'alt').height).toBe(plan.fragments.find(f => f.id === 'alt')!.h);
  });

  it('is idempotent: the laid-out diagram reproduces itself and is still a sequence diagram', () => {
    const again = applySequencePlan(out, planSequence(out)!, seqStyles(out));
    expect(again).toBe(out);
    expect(detectSequenceDiagram(parseDrawioXml(out)).isSequence).toBe(true);
  });

  it('leaves a frame that encloses no message as a plain note', () => {
    const lonely = FRAGMENTS.replace('</root>', vertex('far', FRAME, 20, 900, 780, 100, '1', 'alt') + '</root>');
    const p = planSequence(lonely)!;
    expect(p.fragments.map(f => f.id)).not.toContain('far');
    expect(p.notes.map(n => n.id)).toContain('far');
  });
});

// ───────────────────────── use-case groups ─────────────────────────
const ACTOR = 'shape=umlActor;verticalLabelPosition=bottom;verticalAlign=top;html=1;';
const CASE = 'ellipse;whiteSpace=wrap;html=1;';
const BOUNDARY = 'swimlane;startSize=30;html=1;';

const MULTI = wrap(
  vertex('cust', ACTOR, 700, 20, 30, 60) + vertex('adm', ACTOR, 20, 600, 30, 60) + vertex('pay', ACTOR, 900, 500, 30, 60)
  + vertex('shop', BOUNDARY, 100, 300, 300, 200) + vertex('back', BOUNDARY, 500, 100, 300, 200)
  + [1, 2, 3, 4].map(i => vertex(`s${i}`, CASE, 10 + i * 20, 40 + i * 10, 160, 60, 'shop')).join('')
  + [1, 2, 3].map(i => vertex(`b${i}`, CASE, 10 + i * 5, 40 + i * 70, 170, 60, 'back')).join('')
  + [1, 2, 3, 4].map(i => edge(`ca${i}`, 'cust', `s${i}`)).join('')
  + edge('cb1', 'cust', 'b1') + edge('ab2', 'adm', 'b2') + edge('ab3', 'adm', 'b3') + edge('as1', 'adm', 's1') + edge('ps3', 'pay', 's3')
  + edge('inc', 's2', 's3', 'endArrow=open;dashed=1;html=1;'),
);
const LOOSE = wrap(
  vertex('u1', ACTOR, 600, 0, 30, 60) + vertex('u2', ACTOR, 0, 400, 30, 60)
  + [1, 2, 3, 4, 5].map(i => vertex(`k${i}`, CASE, 100 * i, 300 - i * 40, 150, 60)).join('')
  + [1, 2, 3].map(i => edge(`r${i}`, 'u1', `k${i}`)).join('') + [3, 4, 5].map(i => edge(`l${i}`, 'u2', `k${i}`)).join(''),
);

describe('use-case groups', () => {
  it('recognises several system boundaries as separate groups', () => {
    const model = detectUseCaseDiagram(parseDrawioXml(MULTI))!;
    expect(model.groups.map(g => g.boundary?.id)).toEqual(['shop', 'back']);
    expect(model.groups.map(g => g.cases.length)).toEqual([4, 3]);
    expect(model.actors.map(a => a.id).sort()).toEqual(['adm', 'cust', 'pay']);
  });

  it('recognises use cases with no boundary at all', () => {
    const model = detectUseCaseDiagram(parseDrawioXml(LOOSE))!;
    expect(model.groups).toHaveLength(1);
    expect(model.groups[0].boundary).toBeUndefined();
    expect(model.cases).toHaveLength(5);
  });

  it('does not take a state diagram (ellipse states + a start box) for a use-case diagram', () => {
    const states = wrap(vertex('start', 'rounded=0;', 0, 0, 40, 40)
      + ['a', 'b', 'c', 'd'].map((id, i) => vertex(id, CASE, 100 * (i + 1), 0, 80, 40)).join('')
      + edge('e0', 'start', 'a') + edge('e1', 'a', 'b') + edge('e2', 'b', 'c') + edge('e3', 'c', 'd') + edge('e4', 'd', 'a'));
    expect(detectUseCaseDiagram(parseDrawioXml(states))).toBeNull();
  });

  it('stacks the boundaries, one per group, all as wide as the column and not overlapping', () => {
    const g = parseDrawioXml(MULTI);
    const plan = planUseCase(detectUseCaseDiagram(g)!, g.edges);
    const [shop, back] = plan.boundaries;
    expect(shop.rect.w).toBe(back.rect.w);
    expect(shop.rect.x).toBe(back.rect.x);
    expect(back.rect.y).toBeGreaterThanOrEqual(shop.rect.y + shop.rect.h);
    // every use case lies inside its own boundary (positions are boundary-relative)
    for (const [id, p] of plan.cases) {
      const own = id.startsWith('s') ? shop : back;
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x + 160).toBeLessThanOrEqual(own.rect.w);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y + 60).toBeLessThanOrEqual(own.rect.h);
    }
  });

  it('keeps every association clear of foreign ellipses, with or without boundaries', () => {
    for (const xml of [MULTI, LOOSE]) {
      const g = parseDrawioXml(xml);
      const model = detectUseCaseDiagram(g)!;
      const plan = planUseCase(model, g.edges);
      const parentOf = new Map(model.groups.flatMap(gr => gr.cases.map(c => [c.id, gr.boundary?.id])));
      const rect = (id: string) => {
        const c = model.cases.find(k => k.id === id)!, p = plan.cases.get(id)!;
        const b = parentOf.get(id) ? plan.boundaries.find(x => x.id === parentOf.get(id))!.rect : { x: 0, y: 0 };
        return { cx: b.x + p.x + c.width / 2, cy: b.y + p.y + c.height / 2, rx: c.width / 2, ry: c.height / 2 };
      };
      for (const e of g.edges.filter(x => plan.associations.includes(x.id))) {
        const actorId = model.actors.some(a => a.id === e.sourceId) ? e.sourceId : e.targetId;
        const caseId = actorId === e.sourceId ? e.targetId : e.sourceId;
        const actor = model.actors.find(a => a.id === actorId)!, at = plan.roots.get(actorId)!;
        const from = { x: at.x + actor.width / 2, y: at.y + actor.height / 2 }, to = rect(caseId);
        for (const other of model.cases.filter(c => c.id !== caseId)) {
          const o = rect(other.id);
          for (let s = 0; s <= 1; s += 0.02) {
            const x = from.x + (to.cx - from.x) * s, y = from.y + (to.cy - from.y) * s;
            expect(((x - o.cx) / o.rx) ** 2 + ((y - o.cy) / o.ry) ** 2).toBeGreaterThan(1);
          }
        }
      }
    }
  });

  it('is idempotent for both shapes', () => {
    for (const xml of [MULTI, LOOSE]) {
      const g = parseDrawioXml(xml);
      const model = detectUseCaseDiagram(g)!;
      const order = model.cases.map(c => c.id);
      const ends = new Map(g.edges.map(e => [e.id, { source: e.sourceId, target: e.targetId }]));
      const once = applyUseCasePlan(xml, planUseCase(model, g.edges), order, ends);
      const g2 = parseDrawioXml(once);
      const twice = applyUseCasePlan(once, planUseCase(detectUseCaseDiagram(g2)!, g2.edges), order, ends);
      expect(twice).toBe(once);
    }
  });
});
