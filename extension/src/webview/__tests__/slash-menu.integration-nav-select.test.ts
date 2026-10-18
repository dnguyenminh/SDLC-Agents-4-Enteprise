/**
 * Integration Tests — SlashMenuController: Keyboard Navigation, Agent/Steering Selection
 * KSA-254 — IT-09 through IT-15
 * Split from slash-menu.integration.test.ts (navigation/selection concerns).
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
// 3.4 Keyboard Navigation (IT-09, IT-10, IT-11)
// ============================================================
describe('IT — Slash Menu Keyboard Navigation', () => {
  beforeEach(() => { setupDOM(); });

  it('IT-09: ArrowDown moves highlight, crosses section boundary', () => {
    const { ctrl, container } = createController();
    ctrl.open(0);
    // First item (agent 0) is highlighted by default
    // Move down through all 9 agents + 5 commands to reach first steering item
    for (let i = 0; i < 14; i++) {
      ctrl.handleKeyDown({ key: 'ArrowDown', preventDefault: vi.fn() } as unknown as KeyboardEvent);
    }
    // Should be on first steering item (index 14)
    const highlighted = container.querySelector('.context-menu-item--highlighted');
    expect(highlighted).not.toBeNull();
    ctrl.dispose();
  });

  it('IT-10: ArrowUp from first wraps to last', () => {
    const { ctrl, container } = createController();
    ctrl.open(0);
    // At index 0, press ArrowUp -> should wrap to last (index 17)
    ctrl.handleKeyDown({ key: 'ArrowUp', preventDefault: vi.fn() } as unknown as KeyboardEvent);
    const highlighted = container.querySelector('.context-menu-item--highlighted');
    expect(highlighted).not.toBeNull();
    // Last item should have data-index="17"
    expect(highlighted?.getAttribute('data-index')).toBe('17');
    ctrl.dispose();
  });

  it('IT-11: ArrowDown from last wraps to first', () => {
    const { ctrl, container } = createController();
    ctrl.open(0);
    // Move to last item (17 moves down from index 0)
    for (let i = 0; i < 17; i++) {
      ctrl.handleKeyDown({ key: 'ArrowDown', preventDefault: vi.fn() } as unknown as KeyboardEvent);
    }
    // Now at index 17, press ArrowDown -> wrap to 0
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
    // First item is BA Agent (index 0, already highlighted)
    ctrl.handleKeyDown({ key: 'Enter', preventDefault: vi.fn() } as unknown as KeyboardEvent);
    expect(onAgentSelect).toHaveBeenCalledWith('ba-agent');
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
    // Navigate to first steering item (index 15 = 15 ArrowDowns from start: 9 agents + 6 commands)
    for (let i = 0; i < 15; i++) {
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
