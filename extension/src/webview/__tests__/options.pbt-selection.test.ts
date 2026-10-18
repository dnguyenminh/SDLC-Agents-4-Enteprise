// @vitest-environment jsdom
/**
 * Property-Based Tests — OptionsController (Selection Properties)
 * KSA-259
 *
 * Uses fast-check for generative testing of state machine properties.
 * Mirrors the actual source API (OPTIONS_VISIBLE/IDLE, selectOption).
 * Split from options.pbt.test.ts (selection concerns).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { OptionsController } from '../options/OptionsController';
import { OptionsView } from '../options/OptionsView';
import { OPTIONS_CONFIG } from '../options/types';
import type { ChatOptionsSignal } from '../protocol';

// Mock DOM environment
function createMockDOM() {
  const container = document.createElement('div');
  const textarea = document.createElement('textarea');
  container.appendChild(textarea);
  document.body.appendChild(container);
  return { container, textarea };
}

function createController(overrides?: Partial<{ onSelect: (t: string, s: string) => void }>) {
  const { container, textarea } = createMockDOM();
  const view = new OptionsView(container, textarea);
  const selections: { text: string; source: string }[] = [];

  const controller = new OptionsController({
    view,
    onSelect: overrides?.onSelect ?? ((text, source) => selections.push({ text, source })),
    isSpinnerActive: () => false,
  });

  return { controller, view, selections, container, textarea };
}

// Arbitraries
const validOptionText = fc.stringMatching(/^[A-Za-z0-9]{1,60}$/);
const validOptionsArray = fc.array(validOptionText, {
  minLength: 2,
  maxLength: OPTIONS_CONFIG.MAX_OPTIONS,
});
const validSignal = validOptionsArray.map(
  (options): ChatOptionsSignal => ({
    type: 'chat:options',
    options,
    question: undefined,
  })
);

describe('KSA-259 Property-Based Tests', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('Selection Properties', () => {
    it('PROP-09: selectOption() sends the exact full text (not truncated)', () => {
      fc.assert(
        fc.property(validSignal, fc.nat(), (signal, rawIndex) => {
          const { controller, selections } = createController();
          controller.showOptions(signal);
          const index = rawIndex % signal.options.length;
          controller.selectOption(signal.options[index]);
          expect(selections.length).toBe(1);
          expect(selections[0].text).toBe(signal.options[index]);
          expect(selections[0].source).toBe('option-click');
          controller.dispose();
        })
      );
    });

    it('PROP-10: selectOption() is no-op when IDLE (out-of-band text never sends)', () => {
      fc.assert(
        fc.property(validSignal, (signal) => {
          const { controller, selections } = createController();
          controller.showOptions(signal);
          // dismiss first -> IDLE
          controller.dismiss();
          controller.selectOption(signal.options[0]);
          controller.selectOption(signal.options[signal.options.length - 1]);
          expect(selections.length).toBe(0);
          controller.dispose();
        })
      );
    });
  });
});
