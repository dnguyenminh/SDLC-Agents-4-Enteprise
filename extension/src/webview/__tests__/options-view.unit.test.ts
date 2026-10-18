// @vitest-environment jsdom
/**
 * Unit Tests — OptionsView
 * KSA-259
 *
 * Mirrors the actual source API (render/showOptions/OPTIONS_VISIBLE/IDLE).
 * Split from options.unit.test.ts (view concerns).
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { OptionsView } from '../options/OptionsView';
import { OPTIONS_CONFIG } from '../options/types';

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
