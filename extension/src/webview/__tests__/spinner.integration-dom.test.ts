/**
 * Integration Tests — SpinnerController ↔ SpinnerView (DOM integration)
 * KSA-255 — IT-01 through IT-04
 * Split from spinner.integration.test.ts (DOM concerns).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { SPINNER_CONFIG } from '../spinner/types';

function setupDOM() {
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="container"></div><textarea id="input" placeholder="Type a message..."></textarea></body></html>', { url: 'http://localhost' });
  global.document = dom.window.document;
  global.window = dom.window as unknown as Window & typeof globalThis;
  global.HTMLElement = dom.window.HTMLElement;
  global.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;
  global.requestAnimationFrame = (cb: FrameRequestCallback) => { cb(0); return 0; };
  if (!dom.window.HTMLElement.prototype.scrollIntoView) {
    dom.window.HTMLElement.prototype.scrollIntoView = function() {};
  }
  return dom;
}

// ============================================================
// Controller ↔ View Integration
// ============================================================
describe('IT — SpinnerController ↔ SpinnerView', () => {
  let dom: JSDOM;

  beforeEach(() => {
    dom = setupDOM();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame', 'Date'] });
  });

  afterEach(() => {
    try { vi.runAllTimers(); } catch { /* no pending timers */ }
    vi.useRealTimers();
  });

  it('IT-01: startProcessing() shows spinner in DOM and disables textarea', async () => {
    const { SpinnerView } = await import('../spinner/SpinnerView');
    const { SpinnerController } = await import('../spinner/SpinnerController');
    const container = document.getElementById('container')!;
    const textarea = document.getElementById('input')! as HTMLTextAreaElement;
    const view = new SpinnerView(container, textarea);
    const ctrl = new SpinnerController(view);

    ctrl.startProcessing();

    // Verify DOM integration
    expect(container.querySelector('.spinner-container.visible')).not.toBeNull();
    expect(container.querySelector('.spinner-icon')).not.toBeNull();
    expect(container.querySelector('.spinner-text')!.textContent).toBe('working');
    expect(textarea.disabled).toBe(true);
  });

  it('IT-02: stopProcessing() hides spinner from DOM and enables textarea', async () => {
    const { SpinnerView } = await import('../spinner/SpinnerView');
    const { SpinnerController } = await import('../spinner/SpinnerController');
    const container = document.getElementById('container')!;
    const textarea = document.getElementById('input')! as HTMLTextAreaElement;
    textarea.focus = vi.fn();
    const view = new SpinnerView(container, textarea);
    const ctrl = new SpinnerController(view);

    ctrl.startProcessing();
    ctrl.stopProcessing('complete');

    expect(container.querySelector('.spinner-container')).toBeNull();
    expect(textarea.disabled).toBe(false);
    expect(textarea.placeholder).toBe('Type a message...');
    expect(textarea.focus).toHaveBeenCalled();
  });

  it('IT-03: rapid start-stop cycle leaves clean state', async () => {
    const { SpinnerView } = await import('../spinner/SpinnerView');
    const { SpinnerController } = await import('../spinner/SpinnerController');
    const container = document.getElementById('container')!;
    const textarea = document.getElementById('input')! as HTMLTextAreaElement;
    textarea.focus = vi.fn();
    const view = new SpinnerView(container, textarea);
    const ctrl = new SpinnerController(view);

    // Rapid cycle
    ctrl.startProcessing();
    ctrl.stopProcessing('cancelled');
    ctrl.startProcessing();
    ctrl.stopProcessing('complete');

    expect(ctrl.getState()).toBe('READY');
    expect(container.querySelector('.spinner-container')).toBeNull();
    expect(textarea.disabled).toBe(false);
  });

  it('IT-04: timeout fires and resets DOM state', async () => {
    const { SpinnerView } = await import('../spinner/SpinnerView');
    const { SpinnerController } = await import('../spinner/SpinnerController');
    const container = document.getElementById('container')!;
    const textarea = document.getElementById('input')! as HTMLTextAreaElement;
    textarea.focus = vi.fn();
    const view = new SpinnerView(container, textarea);
    const onTimeout = vi.fn();
    const ctrl = new SpinnerController(view, onTimeout);

    ctrl.startProcessing();
    vi.advanceTimersByTime(SPINNER_CONFIG.TIMEOUT_MS);

    expect(ctrl.getState()).toBe('READY');
    expect(container.querySelector('.spinner-container')).toBeNull();
    expect(textarea.disabled).toBe(false);
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });
});
