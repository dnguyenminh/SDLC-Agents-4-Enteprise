import { describe, it, expect } from 'vitest';
import { PegaRepeatingLayoutRenderer } from '../../ui/layouts/PegaRepeatingLayoutRenderer.js';
import { PegaTableLayoutRenderer } from '../../ui/layouts/PegaTableLayoutRenderer.js';
import type { PegaLayout } from '../../ui/PegaUITypes.js';
import { createContext, createMockFieldRenderer, createMockRenderSubLayout } from './helpers.js';

describe('PegaRepeatingLayoutRenderer', () => {
  const renderer = new PegaRepeatingLayoutRenderer();
  const context = createContext();
  const mockFieldRenderer = createMockFieldRenderer();
  const mockRenderSubLayout = createMockRenderSubLayout();

  it('renders each column as a table header and data row with fields', () => {
    const layout: PegaLayout = {
      type: 'repeating',
      children: [
        {
          properties: { label: 'Item Name' },
          fields: [{ name: 'ItemName', value: 'Widget' }],
        },
        {
          properties: { label: 'Quantity' },
          fields: [{ name: 'Qty', value: '3' }],
        },
      ],
    };
    const output = renderer.render(layout, context, mockFieldRenderer, mockRenderSubLayout);
    expect(output).toContain('class="pega-repeating"');
    expect(output).toContain('<th>Item Name</th>');
    expect(output).toContain('<th>Quantity</th>');
    expect(output).toContain('<mock-field name="ItemName">');
    expect(output).toContain('<mock-field name="Qty">');
  });

  it('returns table wrapper even with empty children and fields', () => {
    const layout: PegaLayout = { type: 'repeating' };
    const output = renderer.render(layout, context, mockFieldRenderer, mockRenderSubLayout);
    expect(output).toContain('class="pega-repeating"');
  });

  it('includes field label and value in each cell from layout-level fields', () => {
    const layout: PegaLayout = {
      type: 'repeating',
      fields: [
        { name: 'ProductCode', label: 'Code', value: 'P-123' },
        { name: 'Price', label: 'Price', value: '29.99' },
      ],
    };
    const output = renderer.render(layout, context, mockFieldRenderer, mockRenderSubLayout);
    expect(output).toContain('<th>Code</th>');
    expect(output).toContain('<th>Price</th>');
    expect(output).toContain('<mock-field name="ProductCode">');
    expect(output).toContain('<mock-field name="Price">');
  });

  it('uses field name as header label when no label on column child', () => {
    const layout: PegaLayout = {
      type: 'repeating',
      children: [
        { fields: [{ name: 'ColA' }] },
      ],
    };
    const output = renderer.render(layout, context, mockFieldRenderer, mockRenderSubLayout);
    expect(output).toContain('<th>ColA</th>');
  });
});

describe('PegaTableLayoutRenderer', () => {
  const renderer = new PegaTableLayoutRenderer();
  const context = createContext();
  const mockFieldRenderer = createMockFieldRenderer();
  const mockRenderSubLayout = createMockRenderSubLayout();

  it('renders table with field headers and data cells', () => {
    const layout: PegaLayout = {
      type: 'table',
      fields: [
        { name: 'Product', label: 'Product Name', value: 'Laptop' },
        { name: 'Price', label: 'Price', value: '999.99' },
      ],
    };
    const output = renderer.render(layout, context, mockFieldRenderer, mockRenderSubLayout);
    expect(output).toContain('class="pega-table"');
    expect(output).toContain('<th>Product Name</th>');
    expect(output).toContain('<th>Price</th>');
    expect(output).toContain('<mock-field name="Product">');
    expect(output).toContain('<mock-field name="Price">');
  });

  it('returns table wrapper with no thead when fields are empty', () => {
    const layout: PegaLayout = { type: 'table' };
    const output = renderer.render(layout, context, mockFieldRenderer, mockRenderSubLayout);
    expect(output).toContain('class="pega-table"');
    expect(output).not.toContain('<thead>');
  });

  it('includes field labels in rendered output using name fallback', () => {
    const layout: PegaLayout = {
      type: 'table',
      fields: [
        { name: 'SKU', value: 'ABC-123' },
      ],
    };
    const output = renderer.render(layout, context, mockFieldRenderer, mockRenderSubLayout);
    expect(output).toContain('<th>SKU</th>');
  });

  it('renders child layouts as additional rows with colspan', () => {
    const layout: PegaLayout = {
      type: 'table',
      fields: [
        { name: 'Item', label: 'Item', value: 'Desk' },
      ],
      children: [
        { type: 'dynamic', fields: [{ name: 'Note', value: 'Assembly required' }] },
      ],
    };
    const output = renderer.render(layout, context, mockFieldRenderer, mockRenderSubLayout);
    expect(output).toContain('colspan="1"');
    expect(output).toContain('[sub:Note]');
  });
});
