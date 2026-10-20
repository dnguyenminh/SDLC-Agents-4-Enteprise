import { describe, it, expect } from 'vitest';
import { PegaSectionRenderer } from '../../ui/PegaSectionRenderer.js';
import type { PegaSection } from '../../ui/PegaUITypes.js';
import { createContext } from './helpers.js';

describe('PegaSectionRenderer', () => {
  const renderer = new PegaSectionRenderer();
  const context = createContext();

  it('renders a section with a dynamic layout containing fields', () => {
    const section: PegaSection = {
      name: 'MainInfo',
      layouts: [
        {
          type: 'dynamic',
          fields: [
            { name: 'CustomerName', label: 'Customer Name', value: 'John Doe' },
            { name: 'Email', label: 'Email', value: 'john@example.com' },
          ],
        },
      ],
      fields: [],
    };
    const output = renderer.renderSection(section, context);
    expect(output).toContain('class="pega-section"');
    expect(output).toContain('class="pega-dynamic-layout"');
    expect(output).toContain('Customer Name (Text)');
    expect(output).toContain('Email (Text)');
    expect(output).toContain('John Doe');
    expect(output).toContain('john@example.com');
  });

  it('renders a section with a tab layout', () => {
    const section: PegaSection = {
      name: 'TabSection',
      layouts: [
        {
          type: 'tab',
          children: [
            {
              properties: { label: 'Info' },
              fields: [{ name: 'Name', label: 'Name', value: 'Alice' }],
            },
            {
              properties: { label: 'Settings' },
              fields: [{ name: 'Mode', label: 'Mode', value: 'Auto' }],
            },
          ],
        },
      ],
      fields: [],
    };
    const output = renderer.renderSection(section, context);
    expect(output).toContain('class="pega-section"');
    expect(output).toContain('class="pega-tab-layout"');
    expect(output).toContain('>Info<');
    expect(output).toContain('>Settings<');
    expect(output).toContain('>Alice<');
    expect(output).toContain('>Auto<');
  });

  it('renders a section with a repeating layout', () => {
    const section: PegaSection = {
      name: 'RepeatSection',
      layouts: [
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
      fields: [],
    };
    const output = renderer.renderSection(section, context);
    expect(output).toContain('class="pega-section"');
    expect(output).toContain('class="pega-repeating"');
    expect(output).toContain('<th>Product</th>');
    expect(output).toContain('<th>Price</th>');
  });

  it('renders a section with a table layout', () => {
    const section: PegaSection = {
      name: 'TableSection',
      layouts: [
        {
          type: 'table',
          fields: [
            { name: 'Item', label: 'Item', value: 'Desk' },
            { name: 'Qty', label: 'Quantity', value: '2' },
          ],
        },
      ],
      fields: [],
    };
    const output = renderer.renderSection(section, context);
    expect(output).toContain('class="pega-section"');
    expect(output).toContain('class="pega-table"');
    expect(output).toContain('<th>Item</th>');
    expect(output).toContain('<th>Quantity</th>');
  });

  it('renders fields directly on section when no layouts present', () => {
    const section: PegaSection = {
      name: 'DirectFields',
      layouts: [],
      fields: [
        { name: 'DirectField', label: 'Direct Field', type: 'Text', value: 'hello' },
      ],
    };
    const output = renderer.renderSection(section, context);
    expect(output).toContain('Direct Field (Text)');
    expect(output).toContain('hello');
  });

  it('skips fields that are not visible', () => {
    const section: PegaSection = {
      name: 'WithHidden',
      layouts: [],
      fields: [
        { name: 'VisibleField', label: 'Visible', type: 'Text', value: 'shown' },
        { name: 'HiddenField', label: 'Hidden', type: 'Text', value: 'secret', visible: false },
      ],
    };
    const output = renderer.renderSection(section, context);
    expect(output).toContain('shown');
    expect(output).not.toContain('secret');
  });

  it('skips layouts that are not visible', () => {
    const section: PegaSection = {
      name: 'WithHiddenLayout',
      layouts: [
        { type: 'dynamic', fields: [{ name: 'A', value: 'visible' }] },
        { type: 'dynamic', fields: [{ name: 'B', value: 'hidden' }], visible: false },
      ],
      fields: [],
    };
    const output = renderer.renderSection(section, context);
    expect(output).toContain('visible');
    expect(output).not.toContain('hidden');
  });

  it('uses dynamic renderer as default when no type specified on layout', () => {
    const section: PegaSection = {
      name: 'DefaultDynamic',
      layouts: [
        {
          fields: [
            { name: 'DefaultField', label: 'Default', type: 'Text', value: 'works' },
          ],
        },
      ],
      fields: [],
    };
    const output = renderer.renderSection(section, context);
    expect(output).toContain('class="pega-dynamic-layout"');
    expect(output).toContain('Default (Text)');
    expect(output).toContain('works');
  });
});
