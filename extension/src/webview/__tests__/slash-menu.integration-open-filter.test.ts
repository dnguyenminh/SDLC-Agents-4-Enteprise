/**
 * Integration Tests — SlashMenuController: Open/Close, Two-Section Rendering, Filter
 * KSA-254 — IT-01 through IT-08
 * Split from slash-menu.integration.test.ts (open/render/filter concerns).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { SlashMenuController } from '../slash-menu/SlashMenuController';

function setupDOM() {
  const dom = new JSDOM(
    '<!DOCTYPE html><html><body><div id="container"></div><div id="input"></div></body></html>',
    { url: 'http://localhost' }
  );
  global.document = dom.window.document;
  global.window = dom.window as unknown as Window & typeof globalThis;
  global.HTMLElement = dom.window.HTMLElement;
  global.requestAnimationFrame = (cb: FrameRequestCallback) => { cb(0); return 0; };
  if (!dom.window.HTMLElement.prototype.scrollIntoView) {
    dom.window.HTMLElement.prototype.scrollIntoView = function () {};
  }
  return dom;
}

function createController() {
  const container = document.getElementById('container')!;
  const inputEl = document.getElementById('input')!;
  inputEl.getBoundingClientRect = () =>
    ({ top: 200, left: 50, width: 400, height: 30, bottom: 230, right: 450, x: 50, y: 200, toJSON: () => {} } as DOMRect);

  const onAgentSelect = vi.fn();
  const onSteeringSelect = vi.fn();
  const onClose = vi.fn();

  const ctrl = new SlashMenuController({
    container,
    inputElement: inputEl,
    onAgentSelect,
    onSteeringSelect,
    onClose,
  });

  // Load steering rules
  ctrl.setSteeringRules([
    { name: 'drawio', file: 'drawio.md' },
    { name: 'sm-core', file: 'sm-core.md' },
    { name: 'concise-responses', file: 'concise-responses.md' },
  ]);

  return { ctrl, container, onAgentSelect, onSteeringSelect, onClose };
}

// ============================================================
// 3.1 Open/Close Lifecycle (IT-01, IT-02)
// ============================================================
describe('IT — Slash Menu Open/Close Lifecycle', () => {
  beforeEach(() => { setupDOM(); });

  it('IT-01: open() creates #slash-command-popup DOM element', () => {
    const { ctrl, container } = createController();
    ctrl.open(0);
    const popup = container.querySelector('#slash-command-popup');
    expect(popup).not.toBeNull();
    expect(ctrl.getState()).toBe('OPEN');
    ctrl.dispose();
  });

  it('IT-02: close() removes DOM element, state=CLOSED', () => {
    const { ctrl, container } = createController();
    ctrl.open(0);
    ctrl.close();
    const popup = container.querySelector('#slash-command-popup');
    expect(popup).toBeNull();
    expect(ctrl.getState()).toBe('CLOSED');
    ctrl.dispose();
  });
});

// ============================================================
// 3.2 Two-Section Rendering (IT-03, IT-04, IT-05)
// ============================================================
describe('IT — Slash Menu Two-Section Rendering', () => {
  beforeEach(() => { setupDOM(); });

  it('IT-03: Agents section header + 9 items rendered', () => {
    const { ctrl, container } = createController();
    ctrl.open(0);
    const headers = container.querySelectorAll('.slash-menu__section-header');
    expect(headers.length).toBeGreaterThanOrEqual(1);
    expect(headers[0].textContent).toBe('AGENTS');
    const items = container.querySelectorAll('.context-menu-item');
    // 9 agents + 6 commands + 3 steering = 18 items
    expect(items.length).toBe(18);
    ctrl.dispose();
  });

  it('IT-04: Steering section header + N items', () => {
    const { ctrl, container } = createController();
    ctrl.open(0);
    const headers = container.querySelectorAll('.slash-menu__section-header');
    expect(headers.length).toBe(2);
    expect(headers[1].textContent).toBe('STEERING RULES');
    ctrl.dispose();
  });

  it('IT-05: ARIA attributes correct (role=listbox, role=option)', () => {
    const { ctrl, container } = createController();
    ctrl.open(0);
    const popup = container.querySelector('#slash-command-popup');
    expect(popup?.getAttribute('role')).toBe('listbox');
    const items = container.querySelectorAll('.context-menu-item');
    items.forEach((item) => {
      expect(item.getAttribute('role')).toBe('option');
    });
    ctrl.dispose();
  });
});

// ============================================================
// 3.3 Filter + DOM Update (IT-06, IT-07, IT-08)
// ============================================================
describe('IT — Slash Menu Filter + DOM', () => {
  beforeEach(() => { setupDOM(); });

  it('IT-06: filter("qa") -> 1 agent item in DOM', () => {
    const { ctrl, container } = createController();
    ctrl.open(0);
    ctrl.filter('qa');
    const items = container.querySelectorAll('.context-menu-item');
    expect(items.length).toBe(1);
    expect(items[0].querySelector('.context-menu-item__label')?.textContent).toBe('QA Agent');
    ctrl.dispose();
  });

  it('IT-07: filter("xyz") -> "No matching commands" empty state', () => {
    const { ctrl, container } = createController();
    ctrl.open(0);
    ctrl.filter('xyz');
    const empty = container.querySelector('.context-menu-empty');
    expect(empty).not.toBeNull();
    expect(empty?.textContent).toContain('No matching commands');
    ctrl.dispose();
  });

  it('IT-08: filter("") restores all items', () => {
    const { ctrl, container } = createController();
    ctrl.open(0);
    ctrl.filter('qa');
    ctrl.filter('');
    const items = container.querySelectorAll('.context-menu-item');
    expect(items.length).toBe(18); // 9 agents + 6 commands + 3 steering
    ctrl.dispose();
  });
});
