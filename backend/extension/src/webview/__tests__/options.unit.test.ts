// @vitest-environment jsdom
/**
 * Unit Tests — OptionsController + OptionsView
 * KSA-259
 *
 * Mirrors the actual source API (render/showOptions/OPTIONS_VISIBLE/IDLE).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
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

describe('OptionsView', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  describe('render()', () => {
    it('creates options container with correct number of buttons', () => {
      const { container, textarea } = createMockDOM();
      const view = new OptionsView(container, textarea);

      view.render(['Option A', 'Option B', 'Option C']);

      const buttons = container.querySelectorAll('.option-btn');
      expect(buttons.length).toBe(3);
    });

    it('truncates long option text at MAX_OPTION_LENGTH', () => {
      const { container, textarea } = createMockDOM();
      const view = new OptionsView(container, textarea);
      const longText = 'A'.repeat(150);

      view.render([longText, 'Short']);

      const buttons = container.querySelectorAll('.option-btn');
      expect(buttons[0].textContent).toBe('A'.repeat(OPTIONS_CONFIG.MAX_OPTION_LENGTH));
      expect(buttons[1].textContent).toBe('Short');
    });

    it('caps options at MAX_OPTIONS', () => {
      const { container, textarea } = createMockDOM();
      const view = new OptionsView(container, textarea);
      const many = Array.from({ length: 10 }, (_, i) => `Opt ${i}`);

      view.render(many);

      const buttons = container.querySelectorAll('.option-btn');
      expect(buttons.length).toBe(OPTIONS_CONFIG.MAX_OPTIONS);
    });

    it('uses textContent (XSS-safe) for option text', () => {
      const { container, textarea } = createMockDOM();
      const view = new OptionsView(container, textarea);
      view.render(['<img src=x onerror=alert(1)>']);

      const btn = container.querySelector('.option-btn') as HTMLElement;
      expect(btn.querySelector('img')).toBeNull();
      expect(btn.textContent).toBe('<img src=x onerror=alert(1)>');
    });

    it('fires onSelect callback with button text on click (event delegation)', () => {
      const { container, textarea } = createMockDOM();
      const view = new OptionsView(container, textarea);
      const clicked: string[] = [];
      view.onSelect((t) => clicked.push(t));
      view.render(['Alpha', 'Beta']);

      (container.querySelector('.option-btn') as HTMLElement).click();
      expect(clicked).toEqual(['Alpha']);
    });

    it('sets role="group" on container', () => {
      const { container, textarea } = createMockDOM();
      const view = new OptionsView(container, textarea);
      view.render(['A', 'B']);

      const optionsContainer = container.querySelector('.options-container');
      expect(optionsContainer!.getAttribute('role')).toBe('group');
    });

    it('sets tabindex=0 on each button', () => {
      const { container, textarea } = createMockDOM();
      const view = new OptionsView(container, textarea);
      view.render(['A', 'B', 'C']);

      const buttons = container.querySelectorAll('.option-btn');
      buttons.forEach((btn) => {
        expect(btn.getAttribute('tabindex')).toBe('0');
      });
    });

    it('marks container visible after render', () => {
      const { container, textarea } = createMockDOM();
      const view = new OptionsView(container, textarea);
      view.render(['A', 'B']);
      expect(view.isVisible()).toBe(true);
    });
  });

  describe('hide()', () => {
    it('removes buttons from container', () => {
      const { container, textarea } = createMockDOM();
      const view = new OptionsView(container, textarea);
      view.render(['A', 'B']);
      expect(container.querySelectorAll('.option-btn').length).toBe(2);

      view.hide();
      expect(container.querySelectorAll('.option-btn').length).toBe(0);
    });

    it('is safe to call when nothing is rendered', () => {
      const { container, textarea } = createMockDOM();
      const view = new OptionsView(container, textarea);
      expect(() => view.hide()).not.toThrow();
    });

    it('is no longer visible after hide()', () => {
      const { container, textarea } = createMockDOM();
      const view = new OptionsView(container, textarea);
      view.render(['A', 'B']);
      view.hide();
      expect(view.isVisible()).toBe(false);
    });
  });

  describe('isVisible()', () => {
    it('returns false initially', () => {
      const { container, textarea } = createMockDOM();
      const view = new OptionsView(container, textarea);
      expect(view.isVisible()).toBe(false);
    });

    it('returns true after render()', () => {
      const { container, textarea } = createMockDOM();
      const view = new OptionsView(container, textarea);
      view.render(['A', 'B']);
      expect(view.isVisible()).toBe(true);
    });

    it('returns false after hide()', () => {
      const { container, textarea } = createMockDOM();
      const view = new OptionsView(container, textarea);
      view.render(['A', 'B']);
      view.hide();
      expect(view.isVisible()).toBe(false);
    });
  });
});

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
