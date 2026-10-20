import { describe, it, expect } from 'vitest';
import { PegaHarnessAssembler } from '../../ui/PegaHarnessAssembler.js';
import type { PegaSection } from '../../ui/PegaUITypes.js';
import { createContext } from './helpers.js';

describe('PegaHarnessAssembler', () => {
  const assembler = new PegaHarnessAssembler();
  const context = createContext();

  it('assembles a full HTML document with doctype, html, head, and body', () => {
    const sections = {
      header: { name: 'Header', layouts: [], fields: [] },
      content: { name: 'Content', layouts: [], fields: [] },
      footer: { name: 'Footer', layouts: [], fields: [] },
    };
    const output = assembler.assemble(sections, context);
    expect(output).toContain('<!DOCTYPE html>');
    expect(output).toContain('<html lang="en">');
    expect(output).toContain('<head>');
    expect(output).toContain('<meta charset="UTF-8">');
    expect(output).toContain('<meta name="viewport"');
    expect(output).toContain('<title>Pega Harness Preview</title>');
    expect(output).toContain('</head>');
    expect(output).toContain('<body>');
    expect(output).toContain('</body>');
    expect(output).toContain('</html>');
  });

  it('includes header, content, and footer sections rendered in the HTML', () => {
    const sections: { header?: PegaSection; content?: PegaSection; footer?: PegaSection } = {
      header: {
        name: 'AppHeader',
        layouts: [
          { type: 'dynamic', fields: [{ name: 'Title', label: 'Title', type: 'Text', value: 'My App' }] },
        ],
        fields: [],
      },
      content: {
        name: 'MainContent',
        layouts: [
          { type: 'dynamic', fields: [{ name: 'Body', label: 'Body', type: 'Text', value: 'Hello World' }] },
        ],
        fields: [],
      },
      footer: {
        name: 'AppFooter',
        layouts: [
          { type: 'dynamic', fields: [{ name: 'Copyright', label: 'Copyright', type: 'Text', value: '2026' }] },
        ],
        fields: [],
      },
    };
    const output = assembler.assemble(sections, context);
    expect(output).toContain('<header class="pega-header">');
    expect(output).toContain('<main class="pega-content">');
    expect(output).toContain('<footer class="pega-footer">');
    expect(output).toContain('My App');
    expect(output).toContain('Hello World');
    expect(output).toContain('2026');
  });

  it('contains inline CSS styles in a style tag', () => {
    const sections = {
      content: { name: 'Content', layouts: [], fields: [] },
    };
    const output = assembler.assemble(sections, context);
    expect(output).toContain('<style>');
    expect(output).toContain('</style>');
    expect(output).toContain('.pega-header');
    expect(output).toContain('.pega-content');
    expect(output).toContain('.pega-footer');
    expect(output).toContain('.pega-section');
    expect(output).toContain('.pega-dynamic-layout');
    expect(output).toContain('.pega-tab-layout');
    expect(output).toContain('.pega-tab.active');
    expect(output).toContain('.pega-repeating');
    expect(output).toContain('.pega-table');
    expect(output).toContain('.pega-field');
  });

  it('excludes header section when not provided', () => {
    const sections = {
      content: { name: 'Content', layouts: [], fields: [] },
    };
    const output = assembler.assemble(sections, context);
    expect(output).not.toContain('<header');
    expect(output).toContain('<main');
    expect(output).not.toContain('<footer');
  });
});
