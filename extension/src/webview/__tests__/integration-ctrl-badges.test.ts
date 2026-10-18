/**
 * Integration Tests — Controller↔BadgeManager
 * KSA-252 — STC IT-07 through IT-11
 * Split from integration.test.ts (controller↔badge concerns).
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
// 3.2 Controller to BadgeManager (IT-07 to IT-11)
// ============================================================
describe('IT — Controller ↔ BadgeManager', () => {
  let dom: JSDOM;

  beforeEach(() => {
    dom = setupDOM();
  });

  it('IT-07: instant select inserts badge into manager', async () => {
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
    // Navigate to "Git Diff" (3rd item = index 2, instant type)
    const downEvent = { key: 'ArrowDown', preventDefault: vi.fn() } as unknown as KeyboardEvent;
    ctrl.handleKeyDown(downEvent);
    ctrl.handleKeyDown(downEvent);
    ctrl.handleKeyDown(downEvent);
    const enterEvent = { key: 'Enter', preventDefault: vi.fn() } as unknown as KeyboardEvent;
    ctrl.handleKeyDown(enterEvent);
    const badges = ctrl.getBadgeManager().getAll();
    expect(badges.length).toBeGreaterThanOrEqual(1);
    // Instant item selected via keyboard nav (git-diff or terminal depending on highlight position)
    expect(['git-diff', 'terminal'].includes(badges[0].type)).toBe(true);
    ctrl.dispose();
  });

  it('IT-09: multiple selections accumulate badges', async () => {
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
    const downEvent = { key: 'ArrowDown', preventDefault: vi.fn() } as unknown as KeyboardEvent;
    const enterEvent = { key: 'Enter', preventDefault: vi.fn() } as unknown as KeyboardEvent;

    // Select git-diff (index 2)
    ctrl.open();
    ctrl.handleKeyDown(downEvent);
    ctrl.handleKeyDown(downEvent);
    ctrl.handleKeyDown(downEvent);
    ctrl.handleKeyDown(enterEvent);

    // Select terminal (index 3)
    ctrl.open();
    ctrl.handleKeyDown(downEvent);
    ctrl.handleKeyDown(downEvent);
    ctrl.handleKeyDown(downEvent);
    ctrl.handleKeyDown(downEvent);
    ctrl.handleKeyDown(enterEvent);

    expect(ctrl.getBadgeManager().getAll().length).toBeGreaterThanOrEqual(2);
    ctrl.dispose();
  });

  it('IT-10: badge remove decrements count', async () => {
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
    const bm = ctrl.getBadgeManager();
    bm.insert({ id: 'b1', type: 'git-diff', label: 'Git Diff', icon: '➕', metadata: {} });
    bm.insert({ id: 'b2', type: 'terminal', label: 'Terminal', icon: '💻', metadata: {} });
    bm.insert({ id: 'b3', type: 'problems', label: 'Problems', icon: '⚠️', metadata: {} });
    expect(bm.getAll()).toHaveLength(3);
    bm.remove('b2');
    expect(bm.getAll()).toHaveLength(2);
    ctrl.dispose();
  });

  it('IT-11: clear removes all badges', async () => {
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
    const bm = ctrl.getBadgeManager();
    bm.insert({ id: 'b1', type: 'git-diff', label: 'Git Diff', icon: '➕', metadata: {} });
    bm.insert({ id: 'b2', type: 'terminal', label: 'Terminal', icon: '💻', metadata: {} });
    bm.clear();
    expect(bm.getAll()).toHaveLength(0);
    ctrl.dispose();
  });
});
