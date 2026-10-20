import { describe, it, expect } from 'vitest';
import { PegaPortalParser } from '../../portal/PegaPortalParser.js';
import { PegaSectionRenderer } from '../../ui/PegaSectionRenderer.js';
import { createContext, sectionJson } from './helpers.js';

describe('PegaPortalParser — Section type parsing with layouts', () => {
  const parser = new PegaPortalParser();

  it('parses a Section with dynamic layout and fields', () => {
    const json = sectionJson();
    const section = parser.parseSection(json);
    expect(section.pyName).toBe('TestSection');
    expect(section.pyType).toBe('Section');
    expect(section.pyLayouts).toHaveLength(1);
    expect(section.pyLayouts[0].type).toBe('dynamic');
    expect(section.pyLayouts[0].fields).toHaveLength(2);
    expect(section.pyLayouts[0].fields![0].name).toBe('CustomerName');
    expect(section.pyLayouts[0].fields![1].name).toBe('Amount');
    expect(section.pyFields).toHaveLength(1);
    expect(section.pyFields[0].name).toBe('Status');
  });

  it('converts Section to PegaSection format compatible with PegaSectionRenderer', () => {
    const json = sectionJson();
    const section = parser.parseSection(json);
    const pegaSection = parser.sectionToPegaFormat(section);
    expect(pegaSection.name).toBe('TestSection');
    expect(pegaSection.layouts).toHaveLength(1);
    expect(pegaSection.layouts[0].type).toBe('dynamic');
    expect(pegaSection.layouts[0].fields).toHaveLength(2);
    expect(pegaSection.fields).toHaveLength(1);
  });

  it('renders the section through PegaSectionRenderer producing HTML', () => {
    const json = sectionJson();
    const section = parser.parseSection(json);
    const pegaSection = parser.sectionToPegaFormat(section);
    const renderer = new PegaSectionRenderer();
    const context = createContext();
    const html = renderer.renderSection(pegaSection, context);
    expect(html).toContain('class="pega-section"');
    expect(html).toContain('class="pega-dynamic-layout"');
    expect(html).toContain('Customer Name (Text)');
    expect(html).toContain('Amount (Number)');
    expect(html).toContain('John Doe');
    expect(html).toContain('150.5');
    expect(html).toContain('Status (Text)');
    expect(html).toContain('Open');
  });

  it('handles section with tab layout having children', () => {
    const json = sectionJson({
      pyLayouts: [
        {
          type: 'tab',
          children: [
            {
              properties: { label: 'General' },
              fields: [{ name: 'Name', label: 'Name', value: 'Alice' }],
            },
            {
              properties: { label: 'Details' },
              fields: [{ name: 'Email', label: 'Email', value: 'alice@test.com' }],
            },
          ],
        },
      ],
      pyFields: [],
    });
    const section = parser.parseSection(json);
    const pegaSection = parser.sectionToPegaFormat(section);
    const renderer = new PegaSectionRenderer();
    const context = createContext();
    const html = renderer.renderSection(pegaSection, context);
    expect(html).toContain('class="pega-tab-layout"');
    expect(html).toContain('>General<');
    expect(html).toContain('>Details<');
    expect(html).toContain('>Alice<');
    expect(html).toContain('>alice@test.com<');
  });

  it('handles section with repeating layout', () => {
    const json = sectionJson({
      pyLayouts: [
        {
          type: 'repeating',
          children: [
            {
              properties: { label: 'Product' },
              fields: [{ name: 'ProductName', label: 'Product Name', value: 'Widget' }],
            },
            {
              properties: { label: 'Price' },
              fields: [{ name: 'UnitPrice', label: 'Unit Price', value: '19.99' }],
            },
          ],
        },
      ],
      pyFields: [],
    });
    const section = parser.parseSection(json);
    const pegaSection = parser.sectionToPegaFormat(section);
    const renderer = new PegaSectionRenderer();
    const context = createContext();
    const html = renderer.renderSection(pegaSection, context);
    expect(html).toContain('class="pega-repeating"');
    expect(html).toContain('<th>Product</th>');
    expect(html).toContain('<th>Price</th>');
  });

  it('handles section with table layout', () => {
    const json = sectionJson({
      pyLayouts: [
        {
          type: 'table',
          fields: [
            { name: 'Item', label: 'Item', value: 'Desk' },
            { name: 'Qty', label: 'Quantity', value: '2' },
          ],
        },
      ],
      pyFields: [],
    });
    const section = parser.parseSection(json);
    const pegaSection = parser.sectionToPegaFormat(section);
    const renderer = new PegaSectionRenderer();
    const context = createContext();
    const html = renderer.renderSection(pegaSection, context);
    expect(html).toContain('class="pega-table"');
    expect(html).toContain('<th>Item</th>');
    expect(html).toContain('<th>Quantity</th>');
  });
});
