// @vitest-environment jsdom
/**
 * Unit Tests — OptionsController (handleKeyDown/processPendingOptions/dispose)
 * KSA-259
 *
 * Mirrors the actual source API (render/showOptions/OPTIONS_VISIBLE/IDLE).
 * Split from options.unit.test.ts (keyboard + lifecycle concerns).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OptionsController } from '../options/OptionsController';
import { OptionsView } from '../options/OptionsView';
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

  describe('handleKeyDown()', () => {
    it('Escape dismisses options', () => {
      const { controller } = createTestSetup();
      controller.showOptions(makeSignal(['A', 'B']));
      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      const handled = controller.handleKeyDown(event);
      expect(handled).toBe(true);
      expect(controller.getState().displayState).toBe('IDLE');
    });

    it('returns false when IDLE', () => {
      const { controller } = createTestSetup();
      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      const handled = controller.handleKeyDown(event);
      expect(handled).toBe(false);
    });

    it('Tab on first button moves focus to next button', () => {
      const { controller, view } = createTestSetup();
      controller.showOptions(makeSignal(['A', 'B', 'C']));
      const buttons = view.getButtons();
      buttons[0].focus();
      const event = new KeyboardEvent('keydown', { key: 'Tab' });
      const handled = controller.handleKeyDown(event);
      expect(handled).toBe(true);
      expect(document.activeElement).toBe(buttons[1]);
    });

    it('Shift+Tab on first button returns focus to textarea', () => {
      const { controller, view, textarea } = createTestSetup();
      controller.showOptions(makeSignal(['A', 'B', 'C']));
      const buttons = view.getButtons();
      buttons[0].focus();
      const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true });
      const handled = controller.handleKeyDown(event);
      expect(handled).toBe(true);
      expect(document.activeElement).toBe(textarea);
    });

    it('Enter selects focused button', () => {
      const { controller, view, selections } = createTestSetup();
      controller.showOptions(makeSignal(['Alpha', 'Beta']));
      const buttons = view.getButtons();
      buttons[1].focus();
      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      const handled = controller.handleKeyDown(event);
      expect(handled).toBe(true);
      expect(selections).toEqual([{ text: 'Beta', source: 'option-click' }]);
    });
  });

  describe('processPendingOptions()', () => {
    it('shows queued options after spinner stops', () => {
      let spinnerActive = true;
      const { container, textarea } = createMockDOM();
      const view = new OptionsView(container, textarea);
      const controller = new OptionsController({
        view,
        onSelect: () => {},
        isSpinnerActive: () => spinnerActive,
      });

      controller.showOptions(makeSignal(['Pending A', 'Pending B']));
      expect(controller.getState().displayState).toBe('IDLE');

      spinnerActive = false;
      controller.processPendingOptions();
      expect(controller.getState().displayState).toBe('OPTIONS_VISIBLE');
      expect(controller.getState().options).toEqual(['Pending A', 'Pending B']);
    });
  });

  describe('dispose()', () => {
    it('resets state to IDLE and clears options', () => {
      const { controller } = createTestSetup();
      controller.showOptions(makeSignal(['A', 'B']));
      controller.dispose();
      expect(controller.getState().displayState).toBe('IDLE');
      expect(controller.getState().options).toEqual([]);
    });
  });
});
