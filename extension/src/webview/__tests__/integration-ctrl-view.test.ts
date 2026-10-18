/**
 * Integration Tests — Controller↔View (DOM interaction)
 * KSA-252 — STC IT-01 through IT-06
 * Split from integration.test.ts (controller↔view concerns).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';

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
// 3.1 Controller to View (IT-01 to IT-06)
// ============================================================
describe('IT — Controller ↔ View (DOM interaction)', () => {
  let dom: JSDOM;

  beforeEach(() => {
    dom = setupDOM();
  });

  it('IT-01: menu opens — DOM .context-menu element created', async () => {
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
    ctrl.open();
    expect(ctrl.getState()).toBe('OPEN');
    expect(ctrl.isOpen()).toBe(true);
    ctrl.dispose();
  });

  it('IT-02: menu closes — state is CLOSED', async () => {
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
    ctrl.open();
    ctrl.close();
    expect(ctrl.getState()).toBe('CLOSED');
    expect(ctrl.isOpen()).toBe(false);
    ctrl.dispose();
  });

  it('IT-03: filter updates state to FILTERING', async () => {
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
    ctrl.open();
    ctrl.filter('fi');
    expect(ctrl.getState()).toBe('FILTERING');
    ctrl.dispose();
  });

  it('IT-04: ArrowDown handled correctly', async () => {
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
    ctrl.open();
    const event = { key: 'ArrowDown', preventDefault: vi.fn() } as unknown as KeyboardEvent;
    const handled = ctrl.handleKeyDown(event);
    expect(handled).toBe(true);
    ctrl.dispose();
  });

  it('IT-05: Enter selects highlighted item (triggers badge insert)', async () => {
    const { ContextMenuController } = await import('../context-menu/ContextMenuController');
    const { MessageBridge } = await import('../bridge/MessageBridge');
    const api = createMockVscodeApi();
    const bridge = new MessageBridge(api as any);
    const container = document.getElementById('container')!;
    const inputEl = document.getElementById('input')!;
    inputEl.getBoundingClientRect = () => ({ top: 100, left: 50, width: 300, height: 30, bottom: 130, right: 350, x: 50, y: 100, toJSON: () => {} });

    const onBadgeInsert = vi.fn();
    const ctrl = new ContextMenuController(
      { container, inputElement: inputEl, onBadgeInsert, onClose: vi.fn() },
      bridge
    );
    ctrl.open();
    // Navigate to "Git Diff" (index 2 = 3rd item, instant type)
    const downEvent = { key: 'ArrowDown', preventDefault: vi.fn() } as unknown as KeyboardEvent;
    ctrl.handleKeyDown(downEvent); // index 1 (Files -> picker)
    ctrl.handleKeyDown(downEvent); // index 2 (Spec -> picker)
    ctrl.handleKeyDown(downEvent); // index 3 (Git Diff -> instant)
    const enterEvent = { key: 'Enter', preventDefault: vi.fn() } as unknown as KeyboardEvent;
    ctrl.handleKeyDown(enterEvent);
    expect(onBadgeInsert).toHaveBeenCalled();
    ctrl.dispose();
  });

  it('IT-06: Escape closes and resets', async () => {
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
    ctrl.open();
    ctrl.filter('fi');
    const escEvent = { key: 'Escape', preventDefault: vi.fn() } as unknown as KeyboardEvent;
    ctrl.handleKeyDown(escEvent);
    expect(ctrl.getState()).toBe('CLOSED');
    ctrl.dispose();
  });
});
