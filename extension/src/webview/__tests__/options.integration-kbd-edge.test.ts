// @vitest-environment jsdom
/**
 * Integration Tests — Options Keyboard + Edge Cases
 * KSA-259
 *
 * Tests the full signal flow: postMessage -> InputAreaIntegration -> OptionsController -> OptionsView -> DOM
 * Split from options.integration.test.ts (keyboard + edge case concerns).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OptionsController } from '../options/OptionsController';
import { OptionsView } from '../options/OptionsView';
import { OPTIONS_CONFIG } from '../options/types';
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
  beforeEach(() => {
    document.body.innerHTML = '';
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
      const buttons = view.getButtons();
      buttons[0].focus();
      const focusSpy = vi.spyOn(buttons[1], 'focus');

      const event = new KeyboardEvent('keydown', { key: 'Tab' });
      controller.handleKeyDown(event);
      expect(focusSpy).toHaveBeenCalled();

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

    it('INT-09: Options with very long text are truncated at MAX_OPTION_LENGTH', () => {
      const { postToWebview, container, cleanup } = createIntegrationSetup();
      const longText = 'X'.repeat(OPTIONS_CONFIG.MAX_OPTION_LENGTH + 50);

      postToWebview({ type: 'chat:options', options: [longText, 'Short'] });

      const btn = container.querySelector('.option-btn') as HTMLElement;
      expect(btn.textContent).toBe('X'.repeat(OPTIONS_CONFIG.MAX_OPTION_LENGTH));

      cleanup();
    });

    it('INT-10: Clicking button sends the rendered (truncated) text', () => {
      const { postToWebview, container, messages, cleanup } = createIntegrationSetup();
      const longText = 'Y'.repeat(OPTIONS_CONFIG.MAX_OPTION_LENGTH + 50);

      postToWebview({ type: 'chat:options', options: [longText, 'Short'] });

      const btn = container.querySelector('.option-btn') as HTMLElement;
      btn.click();

      // Source renders textContent via slice(0, MAX_OPTION_LENGTH); click sends that text.
      expect(messages[0].text).toBe(longText.slice(0, OPTIONS_CONFIG.MAX_OPTION_LENGTH));

      cleanup();
    });

    it('INT-11: Clicking a button processes one selection and hides', () => {
      const { postToWebview, container, messages, cleanup } = createIntegrationSetup();

      postToWebview({ type: 'chat:options', options: ['A', 'B'] });

      const btn = container.querySelector('.option-btn') as HTMLElement;
      btn.click(); // first click processes
      expect(messages.length).toBe(1);
      expect(container.querySelectorAll('.option-btn').length).toBe(0);

      cleanup();
    });

    it('INT-12: Accessibility — container has group role and buttons have tabindex', () => {
      const { postToWebview, container, cleanup } = createIntegrationSetup();

      postToWebview({
        type: 'chat:options',
        options: ['Opt A', 'Opt B'],
        question: 'Pick one',
      });

      const group = container.querySelector('[role="group"]');
      expect(group).not.toBeNull();

      const buttons = container.querySelectorAll('.option-btn');
      expect(buttons.length).toBe(2);
      buttons.forEach((b) => expect(b.getAttribute('tabindex')).toBe('0'));

      cleanup();
    });
  });
});
