/**
 * Property-Based Tests — OptionsController
 * KSA-259
 *
 * Uses fast-check for generative testing of state machine properties.
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
const validOptionText = fc.string({ minLength: 1, maxLength: 60 });
const validOptionsArray = fc.array(validOptionText, {
  minLength: OPTIONS_CONFIG.MIN_OPTIONS,
  maxLength: OPTIONS_CONFIG.MAX_OPTIONS,
});
const validSignal = validOptionsArray.map(
  (options): ChatOptionsSignal => ({
    type: 'chat:options',
    options,
    question: undefined,
  })
);

const invalidOptionsArray = fc.oneof(
  fc.constant([]),           // empty
  fc.constant(['only one']), // too few
  fc.array(validOptionText, { minLength: 6, maxLength: 10 }), // too many
);

describe('KSA-259 Property-Based Tests', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('State Machine Properties', () => {
    it('PROP-01: Valid signal always transitions HIDDEN -> VISIBLE', () => {
      fc.assert(
        fc.property(validSignal, (signal) => {
          const { controller } = createController();
          expect(controller.getState()).toBe('HIDDEN');
          controller.showOptions(signal);
          expect(controller.getState()).toBe('VISIBLE');
          controller.dispose();
        })
      );
    });

    it('PROP-02: Invalid signals never change state from HIDDEN', () => {
      fc.assert(
        fc.property(invalidOptionsArray, (options) => {
          const { controller } = createController();
          controller.showOptions({ type: 'chat:options', options });
          expect(controller.getState()).toBe('HIDDEN');
          controller.dispose();
        })
      );
    });

    it('PROP-03: select() always transitions VISIBLE -> HIDDEN', () => {
      fc.assert(
        fc.property(
          validSignal,
          fc.nat(),
          (signal, rawIndex) => {
            const { controller } = createController();
            controller.showOptions(signal);
            const index = rawIndex % signal.options.length;
            // Wait past debounce
            (controller as any).lastSelectTime = 0;
            controller.select(index);
            expect(controller.getState()).toBe('HIDDEN');
            controller.dispose();
          }
        )
      );
    });

    it('PROP-04: dismiss() always transitions VISIBLE -> HIDDEN', () => {
      fc.assert(
        fc.property(validSignal, (signal) => {
          const { controller } = createController();
          controller.showOptions(signal);
          controller.dismiss();
          expect(controller.getState()).toBe('HIDDEN');
          controller.dispose();
        })
      );
    });

    it('PROP-05: submitCustom() always transitions VISIBLE -> HIDDEN', () => {
      fc.assert(
        fc.property(validSignal, (signal) => {
          const { controller } = createController();
          controller.showOptions(signal);
          controller.submitCustom();
          expect(controller.getState()).toBe('HIDDEN');
          controller.dispose();
        })
      );
    });

    it('PROP-06: After any HIDDEN transition, state is always HIDDEN', () => {
      fc.assert(
        fc.property(
          validSignal,
          fc.oneof(fc.constant('select'), fc.constant('dismiss'), fc.constant('submit')),
          fc.nat(),
          (signal, action, rawIndex) => {
            const { controller } = createController();
            controller.showOptions(signal);

            (controller as any).lastSelectTime = 0;
            switch (action) {
              case 'select':
                controller.select(rawIndex % signal.options.length);
                break;
              case 'dismiss':
                controller.dismiss();
                break;
              case 'submit':
                controller.submitCustom();
                break;
            }

            expect(controller.getState()).toBe('HIDDEN');
            controller.dispose();
          }
        )
      );
    });

    it('PROP-07: Idempotent — dismiss on HIDDEN is no-op', () => {
      fc.assert(
        fc.property(fc.nat(), () => {
          const { controller } = createController();
          expect(controller.getState()).toBe('HIDDEN');
          controller.dismiss();
          expect(controller.getState()).toBe('HIDDEN');
          controller.dispose();
        })
      );
    });

    it('PROP-08: Replacing options keeps state VISIBLE with new options', () => {
      fc.assert(
        fc.property(validSignal, validSignal, (signal1, signal2) => {
          const { controller } = createController();
          controller.showOptions(signal1);
          controller.showOptions(signal2);
          expect(controller.getState()).toBe('VISIBLE');
          expect(controller.getCurrentOptions()).toEqual(
            signal2.options.map((o) => o.trim()).filter((o) => o.length > 0)
          );
          controller.dispose();
        })
      );
    });
  });

  describe('Selection Properties', () => {
    it('PROP-09: select() sends the exact full text (not truncated)', () => {
      fc.assert(
        fc.property(validSignal, fc.nat(), (signal, rawIndex) => {
          const { controller, selections } = createController();
          controller.showOptions(signal);
          const validOpts = signal.options.map((o) => o.trim()).filter((o) => o.length > 0);
          const index = rawIndex % validOpts.length;
          (controller as any).lastSelectTime = 0;
          controller.select(index);
          expect(selections.length).toBe(1);
          expect(selections[0].text).toBe(validOpts[index]);
          expect(selections[0].source).toBe('option-click');
          controller.dispose();
        })
      );
    });

    it('PROP-10: Out-of-bounds index never sends a selection', () => {
      fc.assert(
        fc.property(validSignal, (signal) => {
          const { controller, selections } = createController();
          controller.showOptions(signal);
          const validOpts = signal.options.map((o) => o.trim()).filter((o) => o.length > 0);
          (controller as any).lastSelectTime = 0;
          controller.select(-1);
          controller.select(validOpts.length);
          controller.select(validOpts.length + 100);
          expect(selections.length).toBe(0);
          controller.dispose();
        })
      );
    });
  });
});
