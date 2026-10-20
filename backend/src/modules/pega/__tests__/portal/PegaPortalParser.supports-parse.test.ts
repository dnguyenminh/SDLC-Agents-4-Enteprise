import { describe, it, expect } from 'vitest';
import { PegaPortalParser } from '../../portal/PegaPortalParser.js';
import { PegaSectionRenderer } from '../../ui/PegaSectionRenderer.js';
import { PORTAL_RULE_CLASSES } from '../../portal/PegaPortalTypes.js';
import { createContext, sectionJson } from './helpers.js';

describe('PegaPortalParser — supports() for all UI/Portal types', () => {
  const parser = new PegaPortalParser();

  it.each(PORTAL_RULE_CLASSES)('supports %s', (cls) => {
    expect(parser.supports(cls)).toBe(true);
  });

  it('does not support non-Portal rule types', () => {
    expect(parser.supports('Rule-Obj-Activity')).toBe(false);
    expect(parser.supports('Rule-Obj-Model')).toBe(false);
    expect(parser.supports('Data-Admin-Operator-ID')).toBe(false);
    expect(parser.supports('')).toBe(false);
  });
});

describe('PegaPortalParser — parse() and IPegaRuleParserStrategy integration', () => {
  const parser = new PegaPortalParser();

  it('returns symbol and dependencies from parse for Section', () => {
    const json = sectionJson();
    const result = parser.parse(json);
    expect(result.symbol.fqn).toContain('Rule-HTML-Section');
    expect(result.symbol.name).toBe('TestSection');
    expect(result.symbol.className).toBe('Work-Order');
    expect(result.symbol.ruleType).toBe('Rule-HTML-Section');
    expect(result.symbol.isRule).toBe(true);
    expect(result.symbol.ruleset).toBeUndefined();
  });

  it('extracts When-rule dependencies from layout fields', () => {
    const json = sectionJson({
      pyLayouts: [
        {
          type: 'dynamic',
          fields: [{ name: 'ConditionalField', when: '.Status = "Open"' }],
          when: 'SomeWhenRule',
        },
      ],
    });
    const result = parser.parse(json);
    expect(result.dependencies.length).toBeGreaterThanOrEqual(1);
    const whenDeps = result.dependencies.filter((d) => d.ruleType === 'Rule-Declare-When');
    expect(whenDeps.length).toBeGreaterThanOrEqual(1);
  });

  it('handles missing pyLayouts gracefully', () => {
    const json = sectionJson({ pyLayouts: undefined });
    const section = parser.parseSection(json);
    expect(section.pyLayouts).toEqual([]);
    expect(section.pyFields).toHaveLength(1);
  });

  it('handles missing pyFields gracefully', () => {
    const json = sectionJson({ pyFields: undefined });
    const section = parser.parseSection(json);
    expect(section.pyLayouts).toHaveLength(1);
    expect(section.pyFields).toEqual([]);
  });

  it('performs round-trip: parse -> section -> PegaSectionRenderer renders HTML', () => {
    const json = sectionJson({
      pyLayouts: [
        {
          type: 'dynamic',
          fields: [
            { name: 'CustomerName', label: 'Customer Name', type: 'Text', value: 'John Doe' },
          ],
        },
      ],
      pyFields: [],
      pyWhen: '.Status = "Open"',
    });
    const section = parser.parseSection(json);
    expect(section.pyWhen).toBe('.Status = "Open"');
    const pegaSection = parser.sectionToPegaFormat(section);
    expect(pegaSection.name).toBe(section.pyName);
    const renderer = new PegaSectionRenderer();
    const context = createContext();
    const html = renderer.renderSection(pegaSection, context);
    expect(html).toContain('Customer Name (Text)');
    expect(html).toContain('John Doe');
  });
});
