/**
 * Integration Tests — View↔FuzzyFilter, Performance
 * KSA-252 — STC IT-22 through IT-24, IT-29, IT-30
 * Split from integration.test.ts (filter + performance concerns).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { filterItems } from '../context-menu/FuzzyFilter';
import { CONTEXT_MENU_ITEMS } from '../context-menu/ContextMenuItems';

// Setup fresh DOM per suite
function setupDOM() {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="container"></div><div id="input" contenteditable="true"></div></body></html>', { url: 'http://localhost' });
  global.document = dom.window.document;
  global.window = dom.window as unknown as Window & typeof globalThis;
  global.HTMLSpanElement = dom.window.HTMLSpanElement;
  global.HTMLElement = dom.window.HTMLElement;
  global.requestAnimationFrame = (cb: FrameRequestCallback) => { cb(0); return 0; };
  // Mock scrollIntoView which jsdom doesn't support
  if (!dom.window.HTMLElement.prototype.scrollIntoView) {
    dom.window.HTMLElement.prototype.scrollIntoView = function() {};
  }
  return dom;
}

function createMockVscodeApi() {
  return { postMessage: vi.fn() };
}

// ============================================================
// 3.4 View to FuzzyFilter (IT-22 to IT-24)
// ============================================================
describe('IT — View ↔ FuzzyFilter', () => {
  it('IT-22: filter "ter" narrows to Terminal', () => {
    const result = filterItems(CONTEXT_MENU_ITEMS, 'ter');
    expect(result.map(r => r.label)).toContain('Terminal');
  });

  it('IT-23: empty filter restores all 9 items', () => {
    const result = filterItems(CONTEXT_MENU_ITEMS, '');
    expect(result).toHaveLength(9);
  });

  it('IT-24: no matches shows empty', () => {
    const result = filterItems(CONTEXT_MENU_ITEMS, 'xyz');
    expect(result).toHaveLength(0);
  });
});

// ============================================================
// 3.7 Performance (IT-29, IT-30)
// ============================================================
describe('IT — Performance', () => {
  let dom: JSDOM;

  beforeEach(() => {
    dom = setupDOM();
  });

  it('IT-29: menu render within 100ms', async () => {
    const { ContextMenuController } = await import('../context-menu/ContextMenuController');
    const { MessageBridge } = await import('../bridge/MessageBridge');
    const api = createMockVscodeApi();
    const bridge = new MessageBridge(api as any);
    const container = document.getElementById('container')!;
    const inputEl = document.getElementById('input')!;
    inputEl.getBoundingClientRect = () => ({ top: 100, left: 50, width: 300, height: 30, bottom: 130, right: 350, x: 50, y: 100, toJSON: () => {} });

    const ctrl = new ContextMenuController(
      { container, inputElement: inputEl, onBadgeInsert: vi.fn(), onClose: vi.fn() },
      bridge
    );
    const start = performance.now();
    ctrl.open();
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
    ctrl.dispose();
  });

  it('IT-30: filter within 50ms', () => {
    const start = performance.now();
    filterItems(CONTEXT_MENU_ITEMS, 'f');
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
  });
});
