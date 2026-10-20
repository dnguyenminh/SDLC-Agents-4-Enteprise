import { describe, it, expect } from 'vitest';
import { PegaDynamicLayoutRenderer } from '../../ui/layouts/PegaDynamicLayoutRenderer.js';
import { PegaTabLayoutRenderer } from '../../ui/layouts/PegaTabLayoutRenderer.js';
import type { PegaLayout } from '../../ui/PegaUITypes.js';
import { createContext, createMockFieldRenderer, createMockRenderSubLayout } from './helpers.js';

describe('PegaDynamicLayoutRenderer', () => {
  const renderer = new PegaDynamicLayoutRenderer();
  const context = createContext();
  const mockFieldRenderer = createMockFieldRenderer();
  const mockRenderSubLayout = createMockRenderSubLayout();

  it('renders children in a flex container', () => {
    const layout: PegaLayout = {
      type: 'dynamic',
      children: [
        {
          fields: [
            { name: 'CustomerName', label: 'Customer Name', value: 'John Doe' },
          ],
        },
        {
          fields: [
            { name: 'Email', label: 'Email', value: 'john@example.com' },
          ],
        },
      ],
    };
    const output = renderer.render(layout, context, mockFieldRenderer, mockRenderSubLayout);
    expect(output).toContain('class="pega-dynamic-layout"');
    expect(output).toContain('display:flex');
    expect(output).toContain('flex-wrap:wrap');
    expect(output).toContain('<mock-field name="CustomerName">');
    expect(output).toContain('<mock-field name="Email">');
  });

  it('returns empty flex container for no children and no fields', () => {
    const layout: PegaLayout = { type: 'dynamic' };
    const output = renderer.render(layout, context, mockFieldRenderer, mockRenderSubLayout);
    expect(output).toContain('class="pega-dynamic-layout"');
    expect(output).toContain('display:flex');
    expect(output).toContain('></div>');
    expect(output).not.toContain('<mock-field');
  });

  it('applies columnCount as CSS width style on children', () => {
    const layout: PegaLayout = {
      type: 'dynamic',
      properties: { columnCount: 3 },
      fields: [
        { name: 'A', value: '1' },
        { name: 'B', value: '2' },
        { name: 'C', value: '3' },
      ],
    };
    const output = renderer.render(layout, context, mockFieldRenderer, mockRenderSubLayout);
    expect(output).toContain('width:calc(33.333333333333336% - 8px)');
  });

  it('uses default single column when no columnCount specified', () => {
    const layout: PegaLayout = {
      type: 'dynamic',
      fields: [
        { name: 'Name', value: 'Test' },
      ],
    };
    const output = renderer.render(layout, context, mockFieldRenderer, mockRenderSubLayout);
    expect(output).toContain('width:100%');
  });

  it('calls renderSubLayout for child with explicit non-dynamic type', () => {
    const layout: PegaLayout = {
      type: 'dynamic',
      children: [
        {
          type: 'tab',
          fields: [{ name: 'TabField', value: 'tab-val' }],
        },
      ],
    };
    const output = renderer.render(layout, context, mockFieldRenderer, mockRenderSubLayout);
    expect(output).toContain('[sub:TabField]');
  });
});

describe('PegaTabLayoutRenderer', () => {
  const renderer = new PegaTabLayoutRenderer();
  const context = createContext();
  const mockFieldRenderer = createMockFieldRenderer();
  const mockRenderSubLayout = createMockRenderSubLayout();

  it('renders tab headers and panel sections', () => {
    const layout: PegaLayout = {
      type: 'tab',
      children: [
        {
          properties: { label: 'General' },
          fields: [{ name: 'Name', value: 'Alice' }],
        },
        {
          properties: { label: 'Details' },
          fields: [{ name: 'Email', value: 'alice@test.com' }],
        },
      ],
    };
    const output = renderer.render(layout, context, mockFieldRenderer, mockRenderSubLayout);
    expect(output).toContain('class="pega-tab-layout"');
    expect(output).toContain('class="pega-tabs"');
    expect(output).toContain('class="pega-tab-panels"');
    expect(output).toContain('>General<');
    expect(output).toContain('>Details<');
    expect(output).toContain('class="pega-tab-panel');
  });

  it('returns tab layout wrapper even with empty panels', () => {
    const layout: PegaLayout = { type: 'tab' };
    const output = renderer.render(layout, context, mockFieldRenderer, mockRenderSubLayout);
    expect(output).toContain('class="pega-tab-layout"');
    expect(output).toContain('class="pega-tabs"');
    expect(output).toContain('class="pega-tab-panels"');
  });

  it('sets first tab as active', () => {
    const layout: PegaLayout = {
      type: 'tab',
      children: [
        {
          properties: { label: 'First Tab' },
          fields: [{ name: 'F1', value: 'v1' }],
        },
        {
          properties: { label: 'Second Tab' },
          fields: [{ name: 'F2', value: 'v2' }],
        },
      ],
    };
    const output = renderer.render(layout, context, mockFieldRenderer, mockRenderSubLayout);
    expect(output).toContain('class="pega-tab active">First Tab<');
    expect(output).toContain('class="pega-tab-panel active"');
    expect(output).toContain('class="pega-tab">Second Tab<');
    expect(output).toContain('class="pega-tab-panel"');
  });

  it('falls back to Tab N label when no label property given', () => {
    const layout: PegaLayout = {
      type: 'tab',
      children: [
        { fields: [{ name: 'X', value: 'x' }] },
        { fields: [{ name: 'Y', value: 'y' }] },
      ],
    };
    const output = renderer.render(layout, context, mockFieldRenderer, mockRenderSubLayout);
    expect(output).toContain('>Tab 1<');
    expect(output).toContain('>Tab 2<');
  });
});
