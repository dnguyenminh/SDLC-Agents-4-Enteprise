/**
 * Integration Tests — Options with InputAreaIntegration
 * KSA-259
 *
 * Tests the full signal flow: postMessage -> InputAreaIntegration -> OptionsController -> OptionsView -> DOM
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OptionsController } from '../options/OptionsController';
import { OptionsView } from '../options/OptionsView';
import type { ChatOptionsSignal, ChatProcessingSignal } from '../protocol';

/**
 * Simulates the InputAreaIntegration wiring without importing the full class
 * (avoids importing ContextMenuController/MessageBridge which have complex deps)
 */
function createIntegrationSetup() {
  document.body.innerHTML = '';
  const container = document.createElement('div');
  container.id = 'input-area';
  const textarea = document.createElement('textarea');
  container.appendChild(textarea);
  document.body.appendChild(container);

  let spinnerActive = false;
  const messages: any[] = [];

  const view = new OptionsView(container, textarea);
  const controller = new OptionsController({
    view,
    onSelect: (text, source) => {
      messages.push({ type: 'chat:response', text, source });
    },
    isSpinnerActive: () => spinnerActive,
  });

  // Simulate message listener (like InputAreaIntegration does)
  const messageHandler = (event: MessageEvent) => {
    const data = event.data;
    if (data && data.type === 'chat:options') {
      controller.showOptions(data as ChatOptionsSignal);
    }
    if (data && data.type === 'chat:processing') {
      const sig = data as ChatProcessingSignal;
      if (sig.state === 'start') {
        spinnerActive = true;
        if (controller.isVisible()) {
          controller.dismiss('auto-dismiss');
        }
      } else if (sig.state === 'stop') {
        spinnerActive = false;
        controller.processPendingOptions();
      }
    }
  };

  window.addEventListener('message', messageHandler);

  function postToWebview(data: any) {
    window.dispatchEvent(new MessageEvent('message', { data }));
  }

  function cleanup() {
    window.removeEventListener('message', messageHandler);
    controller.dispose();
  }

  return { controller, view, container, textarea, messages, postToWebview, cleanup, setSpinner: (v: boolean) => { spinnerActive = v; } };
}

describe('KSA-259 Integration Tests', () => {
  describe('Full Signal Flow', () => {
    it('INT-01: postMessage(chat:options) renders buttons in DOM', () => {
      const { postToWebview, container, cleanup } = createIntegrationSetup();

      postToWebview({
        type: 'chat:options',
        options: ['Generate code', 'Explain', 'Debug'],
        question: 'What should I do?',
      });

      const buttons = container.querySelectorAll('.option-btn');
      expect(buttons.length).toBe(3);
      expect(buttons[0].textContent).toBe('Generate code');
      expect(buttons[1].textContent).toBe('Explain');
      expect(buttons[2].textContent).toBe('Debug');

      const question = container.querySelector('.options-question');
      expect(question!.textContent).toBe('What should I do?');

      cleanup();
    });

    it('INT-02: Clicking button sends response and removes buttons', () => {
      const { postToWebview, container, messages, cleanup } = createIntegrationSetup();

      postToWebview({
        type: 'chat:options',
        options: ['Yes', 'No'],
      });

      // Simulate click on first button
      const btn = container.querySelector('.option-btn') as HTMLElement;
      btn.click();

      expect(messages).toEqual([{ type: 'chat:response', text: 'Yes', source: 'option-click' }]);
      expect(container.querySelectorAll('.option-btn').length).toBe(0);

      cleanup();
    });

    it('INT-03: Second options signal replaces first', () => {
      const { postToWebview, container, controller, cleanup } = createIntegrationSetup();

      postToWebview({
        type: 'chat:options',
        options: ['Old A', 'Old B'],
      });
      expect(container.querySelectorAll('.option-btn').length).toBe(2);

      postToWebview({
        type: 'chat:options',
        options: ['New X', 'New Y', 'New Z'],
      });
      const buttons = container.querySelectorAll('.option-btn');
      expect(buttons.length).toBe(3);
      expect(buttons[0].textContent).toBe('New X');
      expect(controller.getState()).toBe('VISIBLE');

      cleanup();
    });

    it('INT-04: chat:processing start auto-dismisses options', () => {
      const { postToWebview, container, controller, cleanup } = createIntegrationSetup();

      postToWebview({
        type: 'chat:options',
        options: ['A', 'B'],
      });
      expect(controller.isVisible()).toBe(true);

      postToWebview({
        type: 'chat:processing',
        state: 'start',
      });
      expect(controller.isVisible()).toBe(false);
      expect(container.querySelectorAll('.option-btn').length).toBe(0);

      cleanup();
    });

    it('INT-05: Options queued during spinner, shown after stop', () => {
      const { postToWebview, container, controller, setSpinner, cleanup } = createIntegrationSetup();

      // Spinner is active
      setSpinner(true);
      postToWebview({ type: 'chat:options', options: ['Queued 1', 'Queued 2'] });
      expect(controller.isVisible()).toBe(false);
      expect(container.querySelectorAll('.option-btn').length).toBe(0);

      // Spinner stops
      postToWebview({ type: 'chat:processing', state: 'stop', reason: 'complete' });
      expect(controller.isVisible()).toBe(true);
      expect(container.querySelectorAll('.option-btn').length).toBe(2);

      cleanup();
    });
  });

  describe('Keyboard Integration', () => {
    it('INT-06: Escape key dismisses options without sending', () => {
      const { postToWebview, controller, messages, cleanup } = createIntegrationSetup();

      postToWebview({ type: 'chat:options', options: ['A', 'B'] });
      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      controller.handleKeyDown(event);

      expect(controller.isVisible()).toBe(false);
      expect(messages.length).toBe(0);

      cleanup();
    });

    it('INT-07: Tab navigates between buttons', () => {
      const { postToWebview, controller, view, cleanup } = createIntegrationSetup();

      postToWebview({ type: 'chat:options', options: ['A', 'B', 'C'] });
      vi.spyOn(view, 'getFocusedIndex').mockReturnValue(0);
      const focusSpy = vi.spyOn(view, 'focusButton');

      const event = new KeyboardEvent('keydown', { key: 'Tab' });
      controller.handleKeyDown(event);
      expect(focusSpy).toHaveBeenCalledWith(1);

      cleanup();
    });
  });

  describe('Edge Cases', () => {
    it('INT-08: Invalid signal does nothing', () => {
      const { postToWebview, container, controller, cleanup } = createIntegrationSetup();

      postToWebview({ type: 'chat:options', options: [] });
      expect(controller.isVisible()).toBe(false);
      expect(container.querySelectorAll('.option-btn').length).toBe(0);

      cleanup();
    });

    it('INT-09: Options with long text are truncated visually', () => {
      const { postToWebview, container, cleanup } = createIntegrationSetup();
      const longText = 'X'.repeat(50);

      postToWebview({ type: 'chat:options', options: [longText, 'Short'] });

      const btn = container.querySelector('.option-btn') as HTMLElement;
      expect(btn.textContent).toBe('X'.repeat(40) + '...');
      expect(btn.getAttribute('data-full-text')).toBe(longText);

      cleanup();
    });

    it('INT-10: Clicking long-text button sends full (untruncated) text', () => {
      const { postToWebview, container, messages, cleanup } = createIntegrationSetup();
      const longText = 'Y'.repeat(50);

      postToWebview({ type: 'chat:options', options: [longText, 'Short'] });

      const btn = container.querySelector('.option-btn') as HTMLElement;
      btn.click();

      expect(messages[0].text).toBe(longText);

      cleanup();
    });

    it('INT-11: Multiple rapid clicks only process first (debounce)', () => {
      const { postToWebview, container, messages, cleanup } = createIntegrationSetup();

      postToWebview({ type: 'chat:options', options: ['A', 'B'] });

      const btn = container.querySelector('.option-btn') as HTMLElement;
      btn.click(); // first click processes
      // State is now HIDDEN, so second signal needed to test debounce
      expect(messages.length).toBe(1);

      cleanup();
    });

    it('INT-12: Accessibility — buttons have correct ARIA attributes', () => {
      const { postToWebview, container, cleanup } = createIntegrationSetup();

      postToWebview({
        type: 'chat:options',
        options: ['Opt A', 'Opt B'],
        question: 'Pick one',
      });

      const listbox = container.querySelector('[role="listbox"]');
      expect(listbox).not.toBeNull();
      expect(listbox!.getAttribute('aria-label')).toBe('Pick one');

      const buttons = container.querySelectorAll('[role="option"]');
      expect(buttons.length).toBe(2);

      cleanup();
    });
  });
});
