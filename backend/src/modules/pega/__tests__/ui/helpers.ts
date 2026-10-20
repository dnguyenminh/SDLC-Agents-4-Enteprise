// Shared test fixtures/mocks for PegaUIRenderer test split (verbatim from original suite).
import { PegaClipboardContext } from '../../expression/PegaClipboardContext.js';
import type { PegaLayout, PegaField } from '../../ui/PegaUITypes.js';
import type { PegaFieldRenderer } from '../../ui/PegaFieldRenderer.js';

export function createContext(): PegaClipboardContext {
  return new PegaClipboardContext({
    pyWorkPage: {
      Status: { type: 'Text', value: 'Open' },
      Amount: { type: 'Number', value: 150.5 },
      CustomerName: { type: 'Text', value: 'John Doe' },
      Email: { type: 'Text', value: 'john@example.com' },
    },
  });
}

export function createMockFieldRenderer(): PegaFieldRenderer {
  return {
    renderField: (field: PegaField, _context: PegaClipboardContext): string => {
      const val = field.value ?? '';
      return `<mock-field name="${field.name}">${val}</mock-field>`;
    },
  } as unknown as PegaFieldRenderer;
}

export function createMockRenderSubLayout() {
  return (layout: PegaLayout, _context: PegaClipboardContext, _fieldRenderer: unknown): string => {
    if (layout.fields && layout.fields.length > 0) {
      return layout.fields.map(f => `[sub:${f.name}]`).join('');
    }
    return `[sub-layout:${layout.type ?? 'dynamic'}]`;
  };
}

export function createDateValue(): Date {
  return new Date('2026-07-27T12:00:00.000Z');
}
