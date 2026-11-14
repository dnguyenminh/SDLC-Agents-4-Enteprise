/**
 * SA4E-406 — verify-loop baseline regression: the initial candidate is the
 * rollback floor. A later pass may never leave more blocking issues than the
 * diagram already had.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { detectAllIssues } from '../drawio-detect';
import { parseDrawioXml } from '../drawio-parser';
import { handleApply } from '../drawio-verify-loop';

const strategy = vi.hoisted(() => ({ runStrategy: vi.fn() }));
vi.mock('../drawio-apply-strategy', async importOriginal => {
  const actual = await importOriginal<typeof import('../drawio-apply-strategy')>();
  return { ...actual, runStrategy: strategy.runStrategy };
});

const wrap = (cells: string): string =>
  `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>${cells}</root></mxGraphModel>`;
const emptyLane = (id: string, y: number): string =>
  `<mxCell id="${id}" value="" style="swimlane;startSize=30;" vertex="1" parent="1"><mxGeometry x="0" y="${y}" width="400" height="200" as="geometry"/></mxCell>`;

describe('SA4E-406 verify loop keeps the initial candidate as rollback floor', () => {
  beforeEach(() => strategy.runStrategy.mockReset());

  it('rolls back a candidate with more blocking issues than the initial XML', { retry: 0 }, async () => {
    const initialXml = wrap(emptyLane('lane-a', 0));
    const worseXml = wrap(emptyLane('lane-a', 0) + emptyLane('lane-b', 220));
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drawio-baseline-'));
    const file = path.join(dir, 'baseline.drawio');
    fs.writeFileSync(file, initialXml, 'utf-8');
    const graph = parseDrawioXml(initialXml);
    const initialIssues = detectAllIssues(graph);
    expect(initialIssues.filter(i => i.severity !== 'low')).toHaveLength(1);

    strategy.runStrategy.mockImplementationOnce(async () => {
      fs.writeFileSync(file, worseXml, 'utf-8');
      return { status: 'already_good', message: 'injected worse pass', strategy: 'injected', wrote: true };
    });

    try {
      const output = JSON.parse(await handleApply(
        initialXml, graph, initialIssues, graph.containers.length, {}, file,
      ));
      expect(fs.readFileSync(file, 'utf-8')).toBe(initialXml);
      expect(output.remaining_issues).toBeLessThanOrEqual(1);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
