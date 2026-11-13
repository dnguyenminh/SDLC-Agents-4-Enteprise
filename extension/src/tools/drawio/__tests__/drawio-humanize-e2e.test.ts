/**
 * SA4E-406 — end-to-end: an LLM-style broken diagram (raw '<', stackLayout
 * lanes, children outside containers, stale cross-lane edges, a nested
 * container, a decision diamond) comes out with no blocking issues, and a
 * second run leaves it untouched.
 */
import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseDrawio } from '../drawio-parser';
import { detectAllIssues } from '../drawio-detect';
import { REPORT_ONLY_ISSUE_TYPES } from '../drawio-detect-structure';
import { handleApply } from '../drawio-apply';
import { sanitizeDrawioXml } from '../drawio-xml-sanitize';

const lane = (id: string, x: number, y: number, extra = '') =>
  `<mxCell id="${id}" value="" style="swimlane;childLayout=stackLayout;horizontalStack=0;resizeParent=1;startSize=26;${extra}" vertex="1" parent="1"><mxGeometry x="${x}" y="${y}" width="200" height="100" as="geometry"/></mxCell>`;
const node = (id: string, parent: string, x: number, y: number, style = 'rounded=1;') =>
  `<mxCell id="${id}" value="${id}" style="${style}" vertex="1" parent="${parent}"><mxGeometry x="${x}" y="${y}" width="120" height="60" as="geometry"/></mxCell>`;
const edge = (id: string, s: string, t: string, parent = '1') =>
  `<mxCell id="${id}" style="edgeStyle=orthogonalEdgeStyle;" edge="1" parent="${parent}" source="${s}" target="${t}"><mxGeometry relative="1" as="geometry"><mxPoint x="5" y="5" as="sourcePoint"/><Array as="points"><mxPoint x="9" y="9"/></Array></mxGeometry></mxCell>`;

const FIXTURE = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>
${lane('L1', 40, 40)}${lane('L2', 40, 60)}${lane('INNER', 20, 40)}
${node('a', 'L1', 500, 500)}${node('b', 'L1', 10, 10)}${node('c', 'L1', 700, 20)}
${node('q', 'L2', 600, 600, 'rhombus;')}${node('yes', 'L2', 5, 5)}${node('no', 'L2', 5, 5)}${node('deep', 'INNER', 400, 400)}
<mxCell id="cond" value="{n < 3?}" style="rounded=1;" vertex="1" parent="L2"><mxGeometry x="0" y="0" width="120" height="60" as="geometry"/></mxCell>
${edge('e1', 'a', 'b', 'L2')}${edge('e2', 'b', 'c')}${edge('e3', 'c', 'q')}
${edge('e4', 'q', 'yes')}${edge('e5', 'q', 'no')}${edge('e6', 'q', 'deep')}${edge('e7', 'cond', 'q')}
</root></mxGraphModel>`;

const tmpFiles: string[] = [];
afterEach(() => { for (const f of tmpFiles.splice(0)) fs.rmSync(path.dirname(f), { recursive: true, force: true }); });

async function run(xml: string, file?: string): Promise<{ file: string; result: { status: string } }> {
  const target = file ?? path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'dio-e2e-')), 'd.drawio');
  if (!file) tmpFiles.push(target);
  fs.writeFileSync(target, sanitizeDrawioXml(xml).xml, 'utf-8');
  const { raw, graph } = parseDrawio(target);
  const issues = detectAllIssues(graph);
  const out = await handleApply(raw, graph, issues, graph.nodes.length + graph.containers.length, {}, target);
  return { file: target, result: JSON.parse(out) };
}

describe('humanize + edge routing (LLM-style input)', () => {
  it('leaves no blocking issues and no stale edge hints', async () => {
    const { file, result } = await run(FIXTURE);
    // SA4E-406 (g/h): empty lane titles and unlabelled decision branches are
    // report-only (medium) — the status is honestly "partial", not "fixed".
    expect(result.status).toBe('partial');
    const text = fs.readFileSync(file, 'utf-8');
    expect(text).not.toMatch(/childLayout=/);
    expect(text).not.toMatch(/as="sourcePoint"/);
    const blocking = detectAllIssues(parseDrawio(file).graph)
      .filter(i => i.severity !== 'low' && !REPORT_ONLY_ISSUE_TYPES.has(i.type));
    expect(blocking).toEqual([]);
  }, 60_000);

  it('keeps every child inside its container, including the nested one', async () => {
    const { file } = await run(FIXTURE);
    const { graph } = parseDrawio(file);
    const bad = detectAllIssues(graph).filter(i => i.type === 'child_outside_container');
    expect(bad).toEqual([]);
    const deep = graph.nodes.find(n => n.id === 'deep')!;
    expect(deep.parentId).toBe('INNER');
  }, 60_000);

  it('re-parents cross-container edges to the root', async () => {
    const { file } = await run(FIXTURE);
    const text = fs.readFileSync(file, 'utf-8');
    expect(/id="e3"[^>]*parent="1"/.test(text)).toBe(true);
    expect(/id="e1"[^>]*parent="L2"/.test(text)).toBe(false);
  }, 60_000);

  it('output has only cosmetic or report-only issues left, so layoutOn reports partial next run', async () => {
    const first = await run(FIXTURE);
    const issues = detectAllIssues(parseDrawio(first.file).graph);
    // SA4E-406 (g/h): lane titles / branch labels are content decisions — they
    // stay flagged (medium) so the next run reports partial, not already_good.
    expect(issues.every(i => i.severity === 'low' || REPORT_ONLY_ISSUE_TYPES.has(i.type))).toBe(true);
  }, 60_000);

  it('lays out a container-free flow chart left intact in order', async () => {
    const flat = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>
${node('s', '1', 0, 0)}${node('m', '1', 0, 0)}${node('t', '1', 0, 0)}${edge('x', 's', 'm')}${edge('y', 'm', 't')}</root></mxGraphModel>`;
    const { file } = await run(flat);
    const { graph } = parseDrawio(file);
    const [s, m, t] = ['s', 'm', 't'].map(id => graph.nodes.find(n => n.id === id)!);
    expect(s.y).toBeLessThan(m.y);
    expect(m.y).toBeLessThan(t.y);
    expect(detectAllIssues(graph).filter(i => i.severity !== 'low')).toEqual([]);
  }, 60_000);
});
