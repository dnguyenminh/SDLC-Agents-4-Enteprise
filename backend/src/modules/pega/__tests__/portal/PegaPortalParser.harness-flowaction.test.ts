import { describe, it, expect } from 'vitest';
import { PegaPortalParser } from '../../portal/PegaPortalParser.js';
import { PegaSectionRenderer } from '../../ui/PegaSectionRenderer.js';
import { PegaHarnessAssembler } from '../../ui/PegaHarnessAssembler.js';
import type { Section } from '../../portal/PegaPortalTypes.js';
import { createContext, harnessJson, flowActionJson } from './helpers.js';

describe('PegaPortalParser — Harness type with header/content/footer', () => {
  const parser = new PegaPortalParser();

  it('parses Harness with header, content, footer sections', () => {
    const json = harnessJson();
    const harness = parser.parseHarness(json);
    expect(harness.pyName).toBe('TestHarness');
    expect(harness.pyType).toBe('Harness');
    expect(harness.pyHeader).toBeDefined();
    expect(harness.pyContent).toBeDefined();
    expect(harness.pyFooter).toBeDefined();
    expect(harness.pyHeader!.pyName).toBe('HeaderSection');
    expect(harness.pyContent!.pyName).toBe('ContentSection');
    expect(harness.pyFooter!.pyName).toBe('FooterSection');
    expect(harness.pyPortal).toBe('MyPortal');
    expect(harness.pySkin).toBe('MySkin');
  });

  it('assembles harness sections through PegaHarnessAssembler producing full HTML', () => {
    const json = harnessJson();
    const harness = parser.parseHarness(json);
    const headerPega = parser.sectionToPegaFormat(harness.pyHeader!);
    const contentPega = parser.sectionToPegaFormat(harness.pyContent!);
    const footerPega = parser.sectionToPegaFormat(harness.pyFooter!);
    const assembler = new PegaHarnessAssembler();
    const context = createContext();
    const html = assembler.assemble({ header: headerPega, content: contentPega, footer: footerPega }, context);
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<header class="pega-header">');
    expect(html).toContain('<main class="pega-content">');
    expect(html).toContain('<footer class="pega-footer">');
    expect(html).toContain('Header Title');
    expect(html).toContain('Main Content');
    expect(html).toContain('2026');
  });

  it('handles harness with missing header and footer', () => {
    const json = harnessJson({ pyHeader: undefined, pyFooter: undefined });
    const harness = parser.parseHarness(json);
    expect(harness.pyHeader).toBeUndefined();
    expect(harness.pyContent).toBeDefined();
    expect(harness.pyFooter).toBeUndefined();
  });
});

describe('PegaPortalParser — FlowAction type', () => {
  const parser = new PegaPortalParser();

  it('parses FlowAction with layouts and fields', () => {
    const json = flowActionJson();
    const fa = parser.parseFlowAction(json);
    expect(fa.pyName).toBe('ApproveAction');
    expect(fa.pyType).toBe('FlowAction');
    expect(fa.pyLayouts).toHaveLength(1);
    expect(fa.pyLayouts[0].type).toBe('dynamic');
    expect(fa.pyLayouts[0].fields).toHaveLength(1);
    expect(fa.pyLayouts[0].fields![0].name).toBe('Comment');
    expect(fa.pyFields).toHaveLength(0);
  });

  it('renders FlowAction layouts through PegaSectionRenderer', () => {
    const json = flowActionJson({ pyFields: [{ name: 'Notes', label: 'Notes', type: 'Text', value: 'test note' }] });
    const fa = parser.parseFlowAction(json);
    const layoutSection: Section = {
      pyName: fa.pyName,
      pyType: 'Section',
      pyLayouts: fa.pyLayouts,
      pyFields: fa.pyFields,
    };
    const pegaSection = parser.sectionToPegaFormat(layoutSection);
    const renderer = new PegaSectionRenderer();
    const context = createContext();
    const html = renderer.renderSection(pegaSection, context);
    expect(html).toContain('Comment');
    expect(html).toContain('Notes (Text)');
    expect(html).toContain('test note');
  });
});
