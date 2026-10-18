/**
 * Unit Tests — BadgeManager, BadgeRenderer
 * KSA-252 — STC UT-14 through UT-29
 * Split from unit-part2.test.ts (badge concerns).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';

// Setup DOM globally for these tests
const dom = new JSDOM('<!DOCTYPE html><html><body><div id="app"></div></body></html>', { url: 'http://localhost' });
global.document = dom.window.document;
global.window = dom.window as unknown as Window & typeof globalThis;
global.HTMLSpanElement = dom.window.HTMLSpanElement;
global.HTMLElement = dom.window.HTMLElement;
global.requestAnimationFrame = (cb: FrameRequestCallback) => { cb(0); return 0; };

// Mock vscodeApi
function createMockVscodeApi() {
  return { postMessage: vi.fn() };
}

// ============================================================
// 2.3 BadgeManager.ts (UT-14 to UT-23)
// ============================================================
describe('UT — BadgeManager', () => {
  let BadgeManager: any;
  let MessageBridge: any;

  beforeEach(async () => {
    BadgeManager = (await import('../badges/BadgeManager')).BadgeManager;
    MessageBridge = (await import('../bridge/MessageBridge')).MessageBridge;
  });

  function createManager() {
    const api = createMockVscodeApi();
    const bridge = new MessageBridge(api as any);
    return { manager: new BadgeManager(bridge), bridge };
  }

  it('UT-14: insert single badge', () => {
    const { manager } = createManager();
    manager.insert({ id: 'b1', type: 'files', label: '#File: a.ts', icon: '📁', metadata: {} });
    expect(manager.getAll()).toHaveLength(1);
  });

  it('UT-15: insert multiple badges', () => {
    const { manager } = createManager();
    manager.insert({ id: 'b1', type: 'files', label: 'a', icon: '📁', metadata: {} });
    manager.insert({ id: 'b2', type: 'git-diff', label: 'b', icon: '➕', metadata: {} });
    manager.insert({ id: 'b3', type: 'terminal', label: 'c', icon: '💻', metadata: {} });
    expect(manager.getAll()).toHaveLength(3);
  });

  it('UT-16: remove by ID', () => {
    const { manager } = createManager();
    manager.insert({ id: 'b1', type: 'files', label: 'a', icon: '📁', metadata: {} });
    manager.remove('b1');
    expect(manager.getAll()).toHaveLength(0);
  });

  it('UT-17: remove non-existent ID does not error', () => {
    const { manager } = createManager();
    manager.insert({ id: 'b1', type: 'files', label: 'a', icon: '📁', metadata: {} });
    expect(() => manager.remove('invalid-id')).not.toThrow();
    expect(manager.getAll()).toHaveLength(1);
  });

  it('UT-18: clear all', () => {
    const { manager } = createManager();
    for (let i = 0; i < 5; i++) {
      manager.insert({ id: `b${i}`, type: 'files', label: `item${i}`, icon: '📁', metadata: {} });
    }
    manager.clear();
    expect(manager.getAll()).toHaveLength(0);
  });

  it('UT-19: stores all badges inserted (no artificial max in current implementation)', () => {
    const { manager } = createManager();
    for (let i = 0; i < 25; i++) {
      manager.insert({ id: `b${i}`, type: 'files', label: `item${i}`, icon: '📁', metadata: {} });
    }
    expect(manager.getAll()).toHaveLength(25);
  });

  it('UT-20: getAll returns array from internal state', () => {
    const { manager } = createManager();
    manager.insert({ id: 'b1', type: 'files', label: 'a', icon: '📁', metadata: {} });
    const all = manager.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].id).toBe('b1');
  });

  it('UT-21: resolveAll triggers resolution for each badge', async () => {
    const { manager, bridge } = createManager();
    // Mock bridge methods
    vi.spyOn(bridge, 'resolveGitDiff').mockResolvedValue('diff content');
    vi.spyOn(bridge, 'resolveTerminalOutput').mockResolvedValue('terminal output');

    manager.insert({ id: 'b1', type: 'git-diff', label: 'Git Diff', icon: '➕', metadata: {} });
    manager.insert({ id: 'b2', type: 'terminal', label: 'Terminal', icon: '💻', metadata: {} });
    const results = await manager.resolveAll();
    expect(results).toHaveLength(2);
    expect(results[0].content).toBe('diff content');
    expect(results[1].content).toBe('terminal output');
  });

  it('UT-22: resolveAll handles partial failure', async () => {
    const { manager, bridge } = createManager();
    vi.spyOn(bridge, 'resolveGitDiff').mockResolvedValue('diff ok');
    vi.spyOn(bridge, 'resolveTerminalOutput').mockRejectedValue(new Error('timeout'));

    manager.insert({ id: 'b1', type: 'git-diff', label: 'Git Diff', icon: '➕', metadata: {} });
    manager.insert({ id: 'b2', type: 'terminal', label: 'Terminal', icon: '💻', metadata: {} });
    const results = await manager.resolveAll();
    expect(results).toHaveLength(2);
    expect(results[0].content).toBe('diff ok');
    expect(results[1].content).toContain('Error');
  });

  it('UT-23: duplicate type allowed (different IDs)', () => {
    const { manager } = createManager();
    manager.insert({ id: 'b1', type: 'files', label: 'file1', icon: '📁', metadata: {} });
    manager.insert({ id: 'b2', type: 'files', label: 'file2', icon: '📁', metadata: {} });
    expect(manager.getAll()).toHaveLength(2);
  });
});

// ============================================================
// 2.4 BadgeRenderer.ts (UT-24 to UT-29)
// ============================================================
describe('UT — BadgeRenderer', () => {
  let BadgeRenderer: any;

  beforeEach(async () => {
    BadgeRenderer = (await import('../badges/BadgeRenderer')).BadgeRenderer;
  });

  function createRenderer() {
    return new BadgeRenderer(vi.fn());
  }

  it('UT-24: creates span element with class context-badge', () => {
    const renderer = createRenderer();
    const el = renderer.createBadgeElement({ id: 'b1', type: 'files', label: 'Test', icon: '📁', metadata: {} });
    expect(el.tagName).toBe('SPAN');
    expect(el.className).toContain('context-badge');
  });

  it('UT-25: sets contentEditable false', () => {
    const renderer = createRenderer();
    const el = renderer.createBadgeElement({ id: 'b1', type: 'files', label: 'Test', icon: '📁', metadata: {} });
    expect(el.contentEditable).toBe('false');
  });

  it('UT-26: escapes HTML in label (no raw HTML injection)', () => {
    const renderer = createRenderer();
    const el = renderer.createBadgeElement({ id: 'b1', type: 'files', label: '<script>alert(1)</script>', icon: '📁', metadata: {} });
    // No actual script element should be created in DOM
    expect(el.querySelector('script')).toBeNull();
    // Label uses textContent so content is safely escaped
    const labelEl = el.querySelector('.badge-label');
    expect(labelEl?.textContent).toBe('<script>alert(1)</script>');
  });

  it('UT-27: includes remove (X) button', () => {
    const renderer = createRenderer();
    const el = renderer.createBadgeElement({ id: 'b1', type: 'files', label: 'Test', icon: '📁', metadata: {} });
    const removeBtn = el.querySelector('.badge-remove');
    expect(removeBtn).not.toBeNull();
    expect(removeBtn?.textContent).toBe('\u00d7'); // × character
  });

  it('UT-28: maps correct icon for git-diff', () => {
    const renderer = createRenderer();
    const el = renderer.createBadgeElement({ id: 'b1', type: 'git-diff', label: 'Git Diff', icon: '➕', metadata: {} });
    const iconEl = el.querySelector('.badge-icon');
    expect(iconEl?.textContent).toBe('➕');
  });

  it('UT-29: badge element has aria-label for accessibility', () => {
    const renderer = createRenderer();
    const el = renderer.createBadgeElement({ id: 'b1', type: 'files', label: 'test.ts', icon: '📁', metadata: {} });
    expect(el.getAttribute('aria-label')).toContain('test.ts');
  });
});
