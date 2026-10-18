// @vitest-environment jsdom
/**
 * Unit Tests — OptionsController (showOptions/selectOption/dismiss/submitCustom)
 * KSA-259
 *
 * Mirrors the actual source API (render/showOptions/OPTIONS_VISIBLE/IDLE).
 * Split from options.unit.test.ts (controller state concerns).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OptionsController } from '../options/OptionsController';
import { OptionsView } from '../options/OptionsView';
import { OPTIONS_CONFIG } from '../options/types';
import type { ChatOptionsSignal } from '../protocol';

function createMockDOM() {
  document.body.innerHTML = '';
  const container = document.createElement('div');
  container.id = 'input-container';
  const textarea = document.createElement('textarea');
  textarea.id = 'chat-textarea';
  container.appendChild(textarea);
  document.body.appendChild(container);
  return { container, textarea };
}

function createTestSetup(spinnerActive = false) {
  const { container, textarea } = createMockDOM();
  const view = new OptionsView(container, textarea);
  const selections: { text: string; source: string }[] = [];

  const controller = new OptionsController({
    view,
    onSelect: (text, source) => selections.push({ text, source }),
    isSpinnerActive: () => spinnerActive,
  });

  return { controller, view, selections, container, textarea };
}

function makeSignal(options: string[], question?: string): ChatOptionsSignal {
  return { type: 'chat:options', options, question };
}

describe('OptionsController', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('showOptions()', () => {
    it('transitions to OPTIONS_VISIBLE with valid signal', () => {
      const { controller } = createTestSetup();
      controller.showOptions(makeSignal(['A', 'B', 'C']));
      expect(controller.getState().displayState).toBe('OPTIONS_VISIBLE');
      expect(controller.isVisible()).toBe(true);
    });

    it('stores current options on state', () => {
      const { controller } = createTestSetup();
      controller.showOptions(makeSignal(['Opt 1', 'Opt 2']));
      expect(controller.getState().options).toEqual(['Opt 1', 'Opt 2']);
    });

    it('rejects empty options signal', () => {
      const { controller } = createTestSetup();
      controller.showOptions(makeSignal([]));
      expect(controller.getState().displayState).toBe('IDLE');
    });

    it('rejects empty options signal', () => {
      const { controller } = createTestSetup();
      controller.showOptions(makeSignal([]));
      expect(controller.getState().displayState).toBe('IDLE');
    });

    it('rejects signal with only empty/whitespace options', () => {
      const { controller } = createTestSetup();
      controller.showOptions(makeSignal(['', '   ']));
      expect(controller.getState().displayState).toBe('IDLE');
    });

    it('accepts signal after filtering empty strings (>= 2 remain)', () => {
      const { controller } = createTestSetup();
      controller.showOptions(makeSignal(['Valid 1', '', 'Valid 2', '   ']));
      expect(controller.getState().displayState).toBe('OPTIONS_VISIBLE');
      expect(controller.getState().options).toEqual(['Valid 1', 'Valid 2']);
    });

    it('caps options at MAX_OPTIONS', () => {
      const { controller } = createTestSetup();
      controller.showOptions(makeSignal(['1', '2', '3', '4', '5', '6']));
      expect(controller.getState().options.length).toBe(OPTIONS_CONFIG.MAX_OPTIONS);
    });

    it('queues options when spinner is active', () => {
      const { controller } = createTestSetup(true);
      controller.showOptions(makeSignal(['A', 'B']));
      expect(controller.getState().displayState).toBe('IDLE');
    });

    it('replaces existing options when called while OPTIONS_VISIBLE', () => {
      const { controller } = createTestSetup();
      controller.showOptions(makeSignal(['Old 1', 'Old 2']));
      controller.showOptions(makeSignal(['New 1', 'New 2', 'New 3']));
      expect(controller.getState().displayState).toBe('OPTIONS_VISIBLE');
      expect(controller.getState().options).toEqual(['New 1', 'New 2', 'New 3']);
    });
  });

  describe('selectOption()', () => {
    it('sends correct text and source on click', () => {
      const { controller, selections } = createTestSetup();
      controller.showOptions(makeSignal(['Alpha', 'Beta', 'Gamma']));
      controller.selectOption('Beta');
      expect(selections).toEqual([{ text: 'Beta', source: 'option-click' }]);
    });

    it('transitions OPTIONS_VISIBLE -> IDLE after select', () => {
      const { controller } = createTestSetup();
      controller.showOptions(makeSignal(['A', 'B']));
      controller.selectOption('A');
      expect(controller.getState().displayState).toBe('IDLE');
    });

    it('is no-op when state is IDLE', () => {
      const { controller, selections } = createTestSetup();
      controller.selectOption('A');
      expect(selections.length).toBe(0);
    });
  });

  describe('dismiss()', () => {
    it('transitions OPTIONS_VISIBLE -> IDLE', () => {
      const { controller } = createTestSetup();
      controller.showOptions(makeSignal(['A', 'B']));
      controller.dismiss();
      expect(controller.getState().displayState).toBe('IDLE');
    });

    it('does not send any selection', () => {
      const { controller, selections } = createTestSetup();
      controller.showOptions(makeSignal(['A', 'B']));
      controller.dismiss();
      expect(selections.length).toBe(0);
    });

    it('is no-op when already IDLE', () => {
      const { controller } = createTestSetup();
      expect(() => controller.dismiss()).not.toThrow();
      expect(controller.getState().displayState).toBe('IDLE');
    });
  });

  describe('submitCustom()', () => {
    it('transitions OPTIONS_VISIBLE -> IDLE', () => {
      const { controller } = createTestSetup();
      controller.showOptions(makeSignal(['A', 'B']));
      controller.submitCustom();
      expect(controller.getState().displayState).toBe('IDLE');
    });

    it('does not send selection (text is handled externally)', () => {
      const { controller, selections } = createTestSetup();
      controller.showOptions(makeSignal(['A', 'B']));
      controller.submitCustom();
      expect(selections.length).toBe(0);
    });
  });
});
