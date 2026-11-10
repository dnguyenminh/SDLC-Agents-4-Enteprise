/**
 * SA4E-406 — edge labels (vertex cells whose parent is an edge) are not nodes.
 * Their geometry is RELATIVE to the edge; writing absolute coordinates into it
 * threw the label far away and blanked the whole draw.io export (SA4E-394 use-case).
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { parseDrawioXml } from '../drawio-parser';
import { handleApply } from '../drawio-apply';
import { detectAllIssues } from '../drawio-detect';
import { readCells } from '../drawio-table-cells';

const FLOW = `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>
<mxCell id="a" value="A" style="rounded=1;html=1;" vertex="1" parent="1"><mxGeometry x="100" y="100" width="120" height="60" as="geometry"/></mxCell>
<mxCell id="b" value="B" style="rounded=1;html=1;" vertex="1" parent="1"><mxGeometry x="110" y="110" width="120" height="60" as="geometry"/></mxCell>
<mxCell id="c" value="C" style="rounded=1;html=1;" vertex="1" parent="1"><mxGeometry x="500" y="100" width="120" height="60" as="geometry"/></mxCell>
<mxCell id="e1" value="" style="endArrow=block;html=1;" edge="1" parent="1" source="a" target="c"><mxGeometry relative="1" as="geometry"/></mxCell>
<mxCell id="e1l" value="include" style="edgeLabel;html=1;align=center;verticalAlign=middle;resizable=0;points=[];" vertex="1" connectable="0" parent="e1"><mxGeometry x="-0.2" y="7" relative="1" as="geometry"><mxPoint as="offset"/></mxGeometry></mxCell>
<mxCell id="e2" value="plain label" style="endArrow=block;html=1;" edge="1" parent="1" source="b" target="c"><mxGeometry relative="1" as="geometry"/></mxCell>
</root></mxGraphModel>`;

describe('edge labels', () => {
  it('are not parsed as nodes or containers', () => {
    const g = parseDrawioXml(FLOW);
    expect([...g.nodes, ...g.containers].map(n => n.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('keep their relative geometry through a relayout', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drawio-labels-'));
    try {
      const file = path.join(dir, 'f.drawio');
      fs.writeFileSync(file, FLOW);
      const g = parseDrawioXml(FLOW);
      const out = JSON.parse(await handleApply(FLOW, g, detectAllIssues(g), 3, {}, file));
      expect(out.status).toBe('fixed');
      const label = readCells(fs.readFileSync(file, 'utf-8')).find(c => c.id === 'e1l')!;
      expect(label.parent).toBe('e1');
      expect(label.geo.x).toBe(-0.2); // still a position along the edge, not a page coordinate
      expect(label.geo.y).toBe(7);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
