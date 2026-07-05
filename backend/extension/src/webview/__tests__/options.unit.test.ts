/**
 * Unit Tests — OptionsController + OptionsView
 * KSA-259
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

  describe('show()', () => {
    it('creates options container with correct number of buttons', () => {
      const { container, textarea } = createMockDOM();
      const view = new OptionsView(container, textarea);

      view.show(['Option A', 'Option B', 'Option C']);

      const buttons = container.querySelectorAll('.option-btn');
      expect(buttons.length).toBe(3);
    });

    it('truncates long option text at MAX_DISPLAY_CHARS', () => {
      const { container, textarea } = createMockDOM();
      const view = new OptionsView(container, textarea);
      const longText = 'A'.repeat(50);

      view.show([longText, 'Short']);

      const buttons = container.querySelectorAll('.option-btn');
      expect(buttons[0].textContent).toBe('A'.repeat(40) + '...');
      expect(buttons[1].textContent).toBe('Short');
    });

    it('stores full text in data-full-text attribute', () => {
      const { container, textarea } = createMockDOM();
      const view = new OptionsView(container, textarea);
      const longText = 'B'.repeat(50);

      view.show([longText, 'Short']);

      const btn = container.querySelector('.option-btn') as HTMLElement;
      expect(btn.getAttribute('data-full-text')).toBe(longText);
    });

    it('renders question text if provided', () => {
      const { container, textarea } = createMockDOM();
      const view = new OptionsView(container, textarea);

      view.show(['A', 'B'], 'Choose one:');

      const questionEl = container.querySelector('.options-question');
      expect(questionEl).not.toBeNull();
      expect(questionEl!.textContent).toBe('Choose one:');
    });

    it('does NOT render question if not provided', () => {
      const { container, textarea } = createMockDOM();
      const view = new OptionsView(container, textarea);

      view.show(['A', 'B']);

      const questionEl = container.querySelector('.options-question');
      expect(questionEl).toBeNull();
    });

    it('sets role="listbox" on container', () => {
      const { container, textarea } = createMockDOM();
      const view = new OptionsView(container, textarea);

      view.show(['A', 'B']);

      const optionsContainer = container.querySelector('.options-container');
      expect(optionsContainer!.getAttribute('role')).toBe('listbox');
    });

    it('sets role="option" on each button', () => {
      const { container, textarea } = createMockDOM();
      const view = new OptionsView(container, textarea);

      view.show(['A', 'B', 'C']);

      const buttons = container.querySelectorAll('.option-btn');
      buttons.forEach((btn) => {
        expect(btn.getAttribute('role')).toBe('option');
      });
    });

    it('first button has tabindex=0, rest have tabindex=-1', () => {
      const { container, textarea } = createMockDOM();
      const view = new OptionsView(container, textarea);

      view.show(['A', 'B', 'C']);

      const buttons = container.querySelectorAll('.option-btn');
      expect(buttons[0].getAttribute('tabindex')).toBe('0');
      expect(buttons[1].getAttribute('tabindex')).toBe('-1');
      expect(buttons[2].getAttribute('tabindex')).toBe('-1');
    });
  });

  describe('hide()', () => {
    it('removes options container from DOM', () => {
      const { container, textarea } = createMockDOM();
      const view = new OptionsView(container, textarea);

      view.show(['A', 'B']);
      expect(container.querySelector('.options-container')).not.toBeNull();

      view.hide();
      expect(container.querySelector('.options-container')).toBeNull();
    });

    it('is safe to call when nothing is shown', () => {
      const { container, textarea } = createMockDOM();
      const view = new OptionsView(container, textarea);

      expect(() => view.hide()).not.toThrow();
    });
  });

  describe('isVisible()', () => {
    it('returns false initially', () => {
      const { container, textarea } = createMockDOM();
      const view = new OptionsView(container, textarea);
      expect(view.isVisible()).toBe(false);
    });

    it('returns true after show()', () => {
      const { container, textarea } = createMockDOM();
      const view = new OptionsView(container, textarea);
      view.show(['A', 'B']);
      expect(view.isVisible()).toBe(true);
    });

    it('returns false after hide()', () => {
      const { container, textarea } = createMockDOM();
      const view = new OptionsView(container, textarea);
      view.show(['A', 'B']);
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
    it('transitions to VISIBLE with valid signal', () => {
      const { controller } = createTestSetup();
      controller.showOptions(makeSignal(['A', 'B', 'C']));
      expect(controller.getState()).toBe('VISIBLE');
      expect(controller.isVisible()).toBe(true);
    });

    it('stores current options', () => {
      const { controller } = createTestSetup();
      controller.showOptions(makeSignal(['Opt 1', 'Opt 2']));
      expect(controller.getCurrentOptions()).toEqual(['Opt 1', 'Opt 2']);
    });

    it('rejects signal with < 2 options', () => {
      const { controller } = createTestSetup();
      controller.showOptions(makeSignal(['Only one']));
      expect(controller.getState()).toBe('HIDDEN');
    });

    it('rejects signal with > 5 options', () => {
      const { controller } = createTestSetup();
      controller.showOptions(makeSignal(['1', '2', '3', '4', '5', '6']));
      expect(controller.getState()).toBe('HIDDEN');
    });

    it('rejects signal with empty strings (if < 2 after filter)', () => {
      const { controller } = createTestSetup();
      controller.showOptions(makeSignal(['Valid', '', '   ']));
      expect(controller.getState()).toBe('HIDDEN');
    });

    it('accepts signal after filtering empty strings (if >= 2 remain)', () => {
      const { controller } = createTestSetup();
      controller.showOptions(makeSignal(['Valid 1', '', 'Valid 2', '   ']));
      expect(controller.getState()).toBe('VISIBLE');
      expect(controller.getCurrentOptions()).toEqual(['Valid 1', 'Valid 2']);
    });

    it('queues options when spinner is active', () => {
      const { controller } = createTestSetup(true); // spinner active
      controller.showOptions(makeSignal(['A', 'B']));
      expect(controller.getState()).toBe('HIDDEN');
    });

    it('replaces existing options when called while VISIBLE', () => {
      const { controller } = createTestSetup();
      controller.showOptions(makeSignal(['Old 1', 'Old 2']));
      controller.showOptions(makeSignal(['New 1', 'New 2', 'New 3']));
      expect(controller.getState()).toBe('VISIBLE');
      expect(controller.getCurrentOptions()).toEqual(['New 1', 'New 2', 'New 3']);
    });

    it('rejects wrong signal type', () => {
      const { controller } = createTestSetup();
      controller.showOptions({ type: 'chat:processing' as any, options: ['A', 'B'] });
      expect(controller.getState()).toBe('HIDDEN');
    });
  });

  describe('select()', () => {
    it('sends correct text and source on valid index', () => {
      const { controller, selections } = createTestSetup();
      controller.showOptions(makeSignal(['Alpha', 'Beta', 'Gamma']));
      (controller as any).lastSelectTime = 0; // bypass debounce for test
      controller.select(1);
      expect(selections).toEqual([{ text: 'Beta', source: 'option-click' }]);
    });

    it('transitions to HIDDEN after select', () => {
      const { controller } = createTestSetup();
      controller.showOptions(makeSignal(['A', 'B']));
      (controller as any).lastSelectTime = 0;
      controller.select(0);
      expect(controller.getState()).toBe('HIDDEN');
    });

    it('ignores select when debounce active', () => {
      const { controller, selections } = createTestSetup();
      controller.showOptions(makeSignal(['A', 'B']));
      // First select
      (controller as any).lastSelectTime = 0;
      controller.select(0);
      // Second select immediately (debounce should block — but state is HIDDEN now anyway)
      controller.showOptions(makeSignal(['C', 'D']));
      (controller as any).lastSelectTime = Date.now(); // recent
      controller.select(0);
      expect(selections.length).toBe(1); // only first went through
    });

    it('ignores negative index', () => {
      const { controller, selections } = createTestSetup();
      controller.showOptions(makeSignal(['A', 'B']));
      (controller as any).lastSelectTime = 0;
      controller.select(-1);
      expect(selections.length).toBe(0);
      expect(controller.getState()).toBe('VISIBLE');
    });

    it('ignores out-of-bounds index', () => {
      const { controller, selections } = createTestSetup();
      controller.showOptions(makeSignal(['A', 'B']));
      (controller as any).lastSelectTime = 0;
      controller.select(5);
      expect(selections.length).toBe(0);
      expect(controller.getState()).toBe('VISIBLE');
    });

    it('is no-op when state is HIDDEN', () => {
      const { controller, selections } = createTestSetup();
      (controller as any).lastSelectTime = 0;
      controller.select(0);
      expect(selections.length).toBe(0);
    });
  });

  describe('dismiss()', () => {
    it('transitions VISIBLE -> HIDDEN', () => {
      const { controller } = createTestSetup();
      controller.showOptions(makeSignal(['A', 'B']));
      controller.dismiss();
      expect(controller.getState()).toBe('HIDDEN');
    });

    it('does not send any selection', () => {
      const { controller, selections } = createTestSetup();
      controller.showOptions(makeSignal(['A', 'B']));
      controller.dismiss();
      expect(selections.length).toBe(0);
    });

    it('is no-op when already HIDDEN', () => {
      const { controller } = createTestSetup();
      controller.dismiss(); // should not throw
      expect(controller.getState()).toBe('HIDDEN');
    });
  });

  describe('submitCustom()', () => {
    it('transitions VISIBLE -> HIDDEN', () => {
      const { controller } = createTestSetup();
      controller.showOptions(makeSignal(['A', 'B']));
      controller.submitCustom();
      expect(controller.getState()).toBe('HIDDEN');
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
      expect(controller.getState()).toBe('HIDDEN');
    });

    it('returns false when HIDDEN', () => {
      const { controller } = createTestSetup();
      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      const handled = controller.handleKeyDown(event);
      expect(handled).toBe(false);
    });

    it('Tab cycles focus forward', () => {
      const { controller, view } = createTestSetup();
      controller.showOptions(makeSignal(['A', 'B', 'C']));
      // Mock getFocusedIndex to return 0
      vi.spyOn(view, 'getFocusedIndex').mockReturnValue(0);
      const focusSpy = vi.spyOn(view, 'focusButton');

      const event = new KeyboardEvent('keydown', { key: 'Tab' });
      const handled = controller.handleKeyDown(event);
      expect(handled).toBe(true);
      expect(focusSpy).toHaveBeenCalledWith(1);
    });

    it('Shift+Tab cycles focus backward', () => {
      const { controller, view } = createTestSetup();
      controller.showOptions(makeSignal(['A', 'B', 'C']));
      vi.spyOn(view, 'getFocusedIndex').mockReturnValue(0);
      const focusSpy = vi.spyOn(view, 'focusButton');

      const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true });
      controller.handleKeyDown(event);
      expect(focusSpy).toHaveBeenCalledWith(2); // wraps to last
    });
  });

  describe('processPendingOptions()', () => {
    it('shows queued options after spinner stops', () => {
      // Start with spinner active
      const { container, textarea } = createMockDOM();
      const view = new OptionsView(container, textarea);
      let spinnerActive = true;
      const controller = new OptionsController({
        view,
        onSelect: () => {},
        isSpinnerActive: () => spinnerActive,
      });

      controller.showOptions(makeSignal(['Pending A', 'Pending B']));
      expect(controller.getState()).toBe('HIDDEN');

      // Spinner stops
      spinnerActive = false;
      controller.processPendingOptions();
      expect(controller.getState()).toBe('VISIBLE');
      expect(controller.getCurrentOptions()).toEqual(['Pending A', 'Pending B']);
    });
  });

  describe('dispose()', () => {
    it('resets state to HIDDEN and clears options', () => {
      const { controller } = createTestSetup();
      controller.showOptions(makeSignal(['A', 'B']));
      controller.dispose();
      expect(controller.getState()).toBe('HIDDEN');
      expect(controller.getCurrentOptions()).toEqual([]);
    });
  });
});
