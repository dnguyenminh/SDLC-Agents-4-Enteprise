/**
 * SA4E-406 — sanitizer for LLM-authored draw.io XML + collinear segment
 * crossing regression (strictlyOn argument order).
 */
import { describe, it, expect } from 'vitest';
import {
  escapeAttributeValues, ensureEdgeGeometry, findXmlEscapingIssues,
  sanitizeDrawioXml, stripChildLayoutStyles,
} from '../drawio-xml-sanitize';
import { segsCross } from '../drawio-geometry';

describe('drawio-xml-sanitize', () => {
  it('escapes raw < and bare & in attribute values only', () => {
    const xml = '<mxCell id="a" value="{n < 3 &amp; x & y}" style="s"/>';
    const out = escapeAttributeValues(xml);
    expect(out.repaired).toBe(1);
    expect(out.xml).toContain('value="{n &lt; 3 &amp; x &amp; y}"');
    expect(findXmlEscapingIssues(out.xml)).toHaveLength(0);
  });

  it('double-escapes literal generics in html=1 labels so draw.io shows them', () => {
    const xml = '<mxCell id="a" value="+ opts: Record<string,string|number>" style="text;html=1;" vertex="1" parent="1">';
    const out = escapeAttributeValues(xml);
    expect(out.xml).toContain('value="+ opts: Record&amp;lt;string,string|number&amp;gt;"');
    expect(findXmlEscapingIssues(out.xml)).toHaveLength(0);
  });

  it('keeps real HTML markup in html=1 labels as markup', () => {
    const xml = '<mxCell id="a" value="<b>Title</b><br>Map<K,V>" style="html=1;" vertex="1" parent="1">';
    const out = escapeAttributeValues(xml);
    expect(out.xml).toContain('value="&lt;b&gt;Title&lt;/b&gt;&lt;br&gt;Map&amp;lt;K,V&amp;gt;"');
  });

  it('uses single escaping for non-html labels and handles a style that follows the value', () => {
    const xml = '<mxCell id="a" value="Map<K,V>" style="text;" vertex="1" parent="1">';
    expect(escapeAttributeValues(xml).xml).toContain('value="Map&lt;K,V&gt;"');
  });

  it('is idempotent for html labels', () => {
    const once = escapeAttributeValues('<mxCell id="a" value="A<B> & C" style="html=1;"/>').xml;
    expect(escapeAttributeValues(once)).toEqual({ xml: once, repaired: 0 });
  });

  it('adds geometry to self-closing edge cells', () => {
    const xml = '<mxCell id="e" edge="1" source="a" target="b" parent="1"/>';
    const out = ensureEdgeGeometry(xml);
    expect(out.repaired).toBe(1);
    expect(out.xml).toContain('<mxGeometry relative="1" as="geometry"/></mxCell>');
  });

  it('strips stackLayout-style keys from container styles', () => {
    const xml = '<mxCell id="c" style="swimlane;childLayout=stackLayout;horizontalStack=0;resizeParent=1;collapsible=1;" vertex="1"/>';
    const out = stripChildLayoutStyles(xml);
    expect(out.xml).toContain('style="swimlane;collapsible=1;"');
  });

  it('leaves clean input byte-identical and is idempotent', () => {
    const clean = '<mxCell id="a" value="ok" style="rounded=1;" vertex="1"><mxGeometry as="geometry"/></mxCell>';
    expect(sanitizeDrawioXml(clean, { stripAutoLayout: true })).toEqual({ xml: clean, fixes: [] });
    const dirty = '<mxCell id="a" value="a < b"/>';
    const once = sanitizeDrawioXml(dirty).xml;
    expect(sanitizeDrawioXml(once).fixes).toEqual([]);
  });
});

describe('segsCross collinear segments', () => {
  const P = (x: number, y: number) => ({ x, y });
  it('disjoint collinear segments do not cross', () => {
    expect(segsCross(P(232, 132), P(332, 132), P(532, 132), P(632, 132))).toBe(false);
  });
  it('overlapping collinear segments do cross', () => {
    expect(segsCross(P(0, 0), P(100, 0), P(50, 0), P(150, 0))).toBe(true);
  });
  it('proper X crossing still detected', () => {
    expect(segsCross(P(0, 0), P(10, 10), P(0, 10), P(10, 0))).toBe(true);
  });
});
