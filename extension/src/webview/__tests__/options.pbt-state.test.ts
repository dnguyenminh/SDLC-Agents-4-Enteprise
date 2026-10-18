// @vitest-environment jsdom
/**
 * Property-Based Tests — OptionsController (State Machine Properties)
 * KSA-259
 *
 * Uses fast-check for generative testing of state machine properties.
 * Mirrors the actual source API (OPTIONS_VISIBLE/IDLE, selectOption).
 * Split from options.pbt.test.ts (state machine concerns).
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

// Signals the source actually rejects: no valid (non-empty) option survives filtering.
const invalidOptionsArray = fc.oneof(
  fc.constant([]),                          // empty
  fc.constant(['', '   ']),                 // only whitespace
  fc.array(fc.constant(' '), { minLength: 1, maxLength: 10 }), // all whitespace
);

describe('KSA-259 Property-Based Tests', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('State Machine Properties', () => {
    it('PROP-01: Valid signal always transitions IDLE -> OPTIONS_VISIBLE', () => {
      fc.assert(
        fc.property(validSignal, (signal) => {
          const { controller } = createController();
          expect(controller.getState().displayState).toBe('IDLE');
          controller.showOptions(signal);
          expect(controller.getState().displayState).toBe('OPTIONS_VISIBLE');
          controller.dispose();
        })
      );
    });

    it('PROP-02: Invalid signals never change state from IDLE', () => {
      fc.assert(
        fc.property(invalidOptionsArray, (options) => {
          const { controller } = createController();
          controller.showOptions({ type: 'chat:options', options });
          expect(controller.getState().displayState).toBe('IDLE');
          controller.dispose();
        })
      );
    });

    it('PROP-03: selectOption() always transitions OPTIONS_VISIBLE -> IDLE', () => {
      fc.assert(
        fc.property(
          validSignal,
          fc.nat(),
          (signal, rawIndex) => {
            const { controller } = createController();
            controller.showOptions(signal);
            const index = rawIndex % signal.options.length;
            controller.selectOption(signal.options[index]);
            expect(controller.getState().displayState).toBe('IDLE');
            controller.dispose();
          }
        )
      );
    });

    it('PROP-04: dismiss() always transitions OPTIONS_VISIBLE -> IDLE', () => {
      fc.assert(
        fc.property(validSignal, (signal) => {
          const { controller } = createController();
          controller.showOptions(signal);
          controller.dismiss();
          expect(controller.getState().displayState).toBe('IDLE');
          controller.dispose();
        })
      );
    });

    it('PROP-05: submitCustom() always transitions OPTIONS_VISIBLE -> IDLE', () => {
      fc.assert(
        fc.property(validSignal, (signal) => {
          const { controller } = createController();
          controller.showOptions(signal);
          controller.submitCustom();
          expect(controller.getState().displayState).toBe('IDLE');
          controller.dispose();
        })
      );
    });

    it('PROP-06: After any transition, state is always IDLE', () => {
      fc.assert(
        fc.property(
          validSignal,
          fc.oneof(fc.constant('select'), fc.constant('dismiss'), fc.constant('submit')),
          fc.nat(),
          (signal, action, rawIndex) => {
            const { controller } = createController();
            controller.showOptions(signal);

            switch (action) {
              case 'select':
                controller.selectOption(signal.options[rawIndex % signal.options.length]);
                break;
              case 'dismiss':
                controller.dismiss();
                break;
              case 'submit':
                controller.submitCustom();
                break;
            }

            expect(controller.getState().displayState).toBe('IDLE');
            controller.dispose();
          }
        )
      );
    });

    it('PROP-07: Idempotent — dismiss on IDLE is no-op', () => {
      fc.assert(
        fc.property(fc.nat(), () => {
          const { controller } = createController();
          expect(controller.getState().displayState).toBe('IDLE');
          controller.dismiss();
          expect(controller.getState().displayState).toBe('IDLE');
          controller.dispose();
        })
      );
    });

    it('PROP-08: Replacing options keeps state OPTIONS_VISIBLE with new options', () => {
      fc.assert(
        fc.property(validSignal, validSignal, (signal1, signal2) => {
          const { controller } = createController();
          controller.showOptions(signal1);
          controller.showOptions(signal2);
          expect(controller.getState().displayState).toBe('OPTIONS_VISIBLE');
          expect(controller.getState().options).toEqual(signal2.options);
          controller.dispose();
        })
      );
    });
  });
});
