/**
 * SA4E-410 (DISC-1/DISC-2) — Regression tests for the draw.io CLI
 * normalisation pipeline in drawio-export-png.
 *
 * 1. wrapXmlIfNeeded        — bare <mxGraphModel> must become an <mxfile>.
 * 2. escapeAttributeValues  — raw < > & inside attribute values must be
 *                             escaped; existing entities stay untouched.
 * 3. normalizeForCli        — full pipeline: flatten → escape → wrap.
 */

import { describe, it, expect } from 'vitest';
import {
  escapeAttributeValues,
  normalizeForCli,
  wrapXmlIfNeeded,
} from '../drawio-export-png.js';

const BARE_MODEL = `<mxGraphModel dx="800" dy="600" grid="1"><root>
<mxCell id="0"/>
<mxCell id="1" parent="0"/>
<mxCell id="n1" value="Map<string, Tab>" style="rounded=1;" vertex="1" parent="1">
  <mxGeometry x="40" y="40" width="120" height="60" as="geometry"/>
</mxCell>
</root></mxGraphModel>`;

const MXFILE = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram name="Page-1" id="t">${BARE_MODEL}</diagram></mxfile>`;

describe('wrapXmlIfNeeded', () => {
  it('wraps a bare <mxGraphModel> into an <mxfile> document', () => {
    const out = wrapXmlIfNeeded(BARE_MODEL);
    expect(out.startsWith('<?xml version="1.0"')).toBe(true);
    expect(out).toContain('<mxfile host="app.diagrams.net"');
    expect(out).toContain('<diagram id="sa4e-page-1" name="Page-1">');
    expect(out.trimEnd().endsWith('</mxfile>')).toBe(true);
  });

  it('keeps the model body intact inside the wrapper', () => {
    const out = wrapXmlIfNeeded(BARE_MODEL);
    expect(out).toContain('<mxGraphModel dx="800" dy="600" grid="1">');
    expect(out).toContain('</mxGraphModel>');
  });

  it('does not double-wrap an already-wrapped <mxfile>', () => {
    const out = wrapXmlIfNeeded(MXFILE);
    expect((out.match(/<mxfile\b/g) ?? []).length).toBe(1);
  });

  it('strips a leading XML declaration before wrapping a bare model', () => {
    const withDecl = `<?xml version="1.0" encoding="UTF-8"?>${BARE_MODEL}`;
    const out = wrapXmlIfNeeded(withDecl);
    // exactly one declaration — the wrapper's own, at the very top
    expect((out.match(/<\?xml/g) ?? []).length).toBe(1);
    expect(out.indexOf('<?xml')).toBe(0);
  });
});

describe('escapeAttributeValues', () => {
  it('escapes raw < > & inside quoted attribute values', () => {
    const xml = '<mxCell id="a" value="Map<string, Tab> & Co" style="rounded=0;"';
    const out = escapeAttributeValues(xml);
    expect(out).toContain('value="Map&lt;string, Tab&gt; &amp; Co"');
    expect(out).toContain('style="rounded=0;"');
  });

  it('leaves already-valid entities untouched', () => {
    const xml = '<mxCell id="a" value="Map&lt;string&gt;" style="rounded=0;"';
    expect(escapeAttributeValues(xml)).toBe(xml);
  });

  it('is idempotent', () => {
    const once = escapeAttributeValues(BARE_MODEL);
    expect(escapeAttributeValues(once)).toBe(once);
  });

  it('does not rewrite content outside attribute values', () => {
    const xml = '<root><mxCell id="0"/><mxCell id="1" parent="0"/>tags <not-attr> stay </not-attr></root>';
    expect(escapeAttributeValues(xml)).toBe(xml);
  });
});

describe('normalizeForCli', () => {
  it('runs flatten + escape + wrap for a hand-authored nested diagram', () => {
    const nested = `<?xml version="1.0" encoding="UTF-8"?>
<mxfile><diagram name="Page-1" id="t">
<mxGraphModel><root>
<mxCell id="0"/>
<mxCell id="1" parent="0"/>
<mxCell id="lane" value="A & B" vertex="1" parent="1">
  <mxGeometry x="20" y="20" width="400" height="300" as="geometry"/>
  <mxCell id="inner" value="Map<string, X>" vertex="1" parent="lane">
    <mxGeometry x="10" y="40" width="100" height="50" as="geometry"/>
  </mxCell>
</mxCell>
</root></mxGraphModel></diagram></mxfile>`;
    const out = normalizeForCli(nested);
    // existing <mxfile> passes through with a stable declaration
    expect(out.startsWith('<?xml version="1.0"')).toBe(true);
    expect((out.match(/<mxfile\b/g) ?? []).length).toBe(1);
    // escaped
    expect(out).toContain('value="A &amp; B"');
    expect(out).toContain('value="Map&lt;string, X&gt;"');
    // flattened: the inner cell must be hoisted beyond the lane's close tag
    const laneClose = out.indexOf('</mxCell>');
    const innerOpen = out.indexOf('<mxCell id="inner"');
    expect(innerOpen).toBeGreaterThan(laneClose);
    expect(out).toContain('parent="lane"');
  });

  it('is idempotent for an already-normalised document', () => {
    const once = normalizeForCli(BARE_MODEL);
    expect(normalizeForCli(once)).toBe(once);
  });
});
