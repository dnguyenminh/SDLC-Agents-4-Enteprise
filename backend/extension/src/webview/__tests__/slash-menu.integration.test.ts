/**
 * Integration Tests — SlashMenuController + SlashMenuView (DOM interaction)
 * KSA-254 — IT-01 through IT-15
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

  it('IT-03: Agents section header + 6 items rendered', () => {
    const { ctrl, container } = createController();
    ctrl.open(0);
    const headers = container.querySelectorAll('.slash-menu__section-header');
    expect(headers.length).toBeGreaterThanOrEqual(1);
    expect(headers[0].textContent).toBe('AGENTS');
    const items = container.querySelectorAll('.context-menu-item');
    // 6 agents + 3 steering = 9 items
    expect(items.length).toBe(9);
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
    expect(items.length).toBe(9); // 6 agents + 3 steering
    ctrl.dispose();
  });
});

// ============================================================
// 3.4 Keyboard Navigation (IT-09, IT-10, IT-11)
// ============================================================
describe('IT — Slash Menu Keyboard Navigation', () => {
  beforeEach(() => { setupDOM(); });

  it('IT-09: ArrowDown moves highlight, crosses section boundary', () => {
    const { ctrl, container } = createController();
    ctrl.open(0);
    // First item (agent 0) is highlighted by default
    // Move down through all 6 agents to reach first steering item
    for (let i = 0; i < 6; i++) {
      ctrl.handleKeyDown({ key: 'ArrowDown', preventDefault: vi.fn() } as unknown as KeyboardEvent);
    }
    // Should be on first steering item (index 6)
    const highlighted = container.querySelector('.context-menu-item--highlighted');
    expect(highlighted).not.toBeNull();
    ctrl.dispose();
  });

  it('IT-10: ArrowUp from first wraps to last', () => {
    const { ctrl, container } = createController();
    ctrl.open(0);
    // At index 0, press ArrowUp -> should wrap to last (index 8)
    ctrl.handleKeyDown({ key: 'ArrowUp', preventDefault: vi.fn() } as unknown as KeyboardEvent);
    const highlighted = container.querySelector('.context-menu-item--highlighted');
    expect(highlighted).not.toBeNull();
    // Last item should have data-index="8"
    expect(highlighted?.getAttribute('data-index')).toBe('8');
    ctrl.dispose();
  });

  it('IT-11: ArrowDown from last wraps to first', () => {
    const { ctrl, container } = createController();
    ctrl.open(0);
    // Move to last item (8 moves down from index 0)
    for (let i = 0; i < 8; i++) {
      ctrl.handleKeyDown({ key: 'ArrowDown', preventDefault: vi.fn() } as unknown as KeyboardEvent);
    }
    // Now at index 8, press ArrowDown -> wrap to 0
    ctrl.handleKeyDown({ key: 'ArrowDown', preventDefault: vi.fn() } as unknown as KeyboardEvent);
    const highlighted = container.querySelector('.context-menu-item--highlighted');
    expect(highlighted?.getAttribute('data-index')).toBe('0');
    ctrl.dispose();
  });
});

// ============================================================
// 3.5 Agent Selection (IT-12, IT-13)
// ============================================================
describe('IT — Slash Menu Agent Selection', () => {
  beforeEach(() => { setupDOM(); });

  it('IT-12: Enter on agent -> onAgentSelect callback fires with agentName', () => {
    const { ctrl, onAgentSelect } = createController();
    ctrl.open(0);
    // First item is QA Agent (index 0, already highlighted)
    ctrl.handleKeyDown({ key: 'Enter', preventDefault: vi.fn() } as unknown as KeyboardEvent);
    expect(onAgentSelect).toHaveBeenCalledWith('qa-agent');
    ctrl.dispose();
  });

  it('IT-13: After agent select, state=CLOSED and popup removed', () => {
    const { ctrl, container } = createController();
    ctrl.open(0);
    ctrl.handleKeyDown({ key: 'Enter', preventDefault: vi.fn() } as unknown as KeyboardEvent);
    expect(ctrl.getState()).toBe('CLOSED');
    expect(container.querySelector('#slash-command-popup')).toBeNull();
    ctrl.dispose();
  });
});

// ============================================================
// 3.6 Steering Selection (IT-14, IT-15)
// ============================================================
describe('IT — Slash Menu Steering Selection', () => {
  beforeEach(() => { setupDOM(); });

  it('IT-14: Enter on steering -> onSteeringSelect callback fires with rule', () => {
    const { ctrl, onSteeringSelect } = createController();
    ctrl.open(0);
    // Navigate to first steering item (index 6 = 6 ArrowDowns from start)
    for (let i = 0; i < 6; i++) {
      ctrl.handleKeyDown({ key: 'ArrowDown', preventDefault: vi.fn() } as unknown as KeyboardEvent);
    }
    ctrl.handleKeyDown({ key: 'Enter', preventDefault: vi.fn() } as unknown as KeyboardEvent);
    expect(onSteeringSelect).toHaveBeenCalled();
    const callArg = onSteeringSelect.mock.calls[0][0];
    expect(callArg.name).toBe('drawio');
    expect(callArg.file).toBe('drawio.md');
    ctrl.dispose();
  });

  it('IT-15: After steering select, state=CLOSED and popup removed', () => {
    const { ctrl, container } = createController();
    ctrl.open(0);
    for (let i = 0; i < 6; i++) {
      ctrl.handleKeyDown({ key: 'ArrowDown', preventDefault: vi.fn() } as unknown as KeyboardEvent);
    }
    ctrl.handleKeyDown({ key: 'Enter', preventDefault: vi.fn() } as unknown as KeyboardEvent);
    expect(ctrl.getState()).toBe('CLOSED');
    expect(container.querySelector('#slash-command-popup')).toBeNull();
    ctrl.dispose();
  });
});
