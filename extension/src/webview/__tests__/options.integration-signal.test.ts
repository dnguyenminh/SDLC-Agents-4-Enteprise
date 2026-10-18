// @vitest-environment jsdom
/**
 * Integration Tests — Options Full Signal Flow
 * KSA-259
 *
 * Tests the full signal flow: postMessage -> InputAreaIntegration -> OptionsController -> OptionsView -> DOM
 * Split from options.integration.test.ts (signal flow concerns).
 */

import { describe, it, expect, beforeEach } from 'vitest';
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
  beforeEach(() => {
    document.body.innerHTML = '';
  });

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
      expect(controller.getState().displayState).toBe('OPTIONS_VISIBLE');

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
});
