/**
 * Integration Tests — SpinnerController ↔ SpinnerView (announcer + resilience)
 * KSA-255 — IT-05 through IT-10
 * Split from spinner.integration.test.ts (announcer/edge-case concerns).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { JSDOM } from 'jsdom';

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

  it('IT-05: accessibility announcer is created and announces state changes', async () => {
    const { SpinnerView } = await import('../spinner/SpinnerView');
    const { SpinnerController } = await import('../spinner/SpinnerController');
    const container = document.getElementById('container')!;
    const textarea = document.getElementById('input')! as HTMLTextAreaElement;
    textarea.focus = vi.fn();
    const view = new SpinnerView(container, textarea);
    const ctrl = new SpinnerController(view);

    ctrl.startProcessing();
    vi.advanceTimersByTime(16);

    const announcer = document.getElementById('sr-announcer');
    expect(announcer).not.toBeNull();
    expect(announcer!.getAttribute('aria-live')).toBe('polite');
    expect(announcer!.textContent).toBe('AI is processing your request');
  });

  it('IT-06: stop announces completion message', async () => {
    const { SpinnerView } = await import('../spinner/SpinnerView');
    const { SpinnerController } = await import('../spinner/SpinnerController');
    const container = document.getElementById('container')!;
    const textarea = document.getElementById('input')! as HTMLTextAreaElement;
    textarea.focus = vi.fn();
    const view = new SpinnerView(container, textarea);
    const ctrl = new SpinnerController(view);

    ctrl.startProcessing();
    ctrl.stopProcessing('complete');
    vi.runAllTimers();

    const announcer = document.getElementById('sr-announcer');
    expect(announcer!.textContent).toBe('AI response complete');
  });

  it('IT-07: stop with error reason announces error message', async () => {
    const { SpinnerView } = await import('../spinner/SpinnerView');
    const { SpinnerController } = await import('../spinner/SpinnerController');
    const container = document.getElementById('container')!;
    const textarea = document.getElementById('input')! as HTMLTextAreaElement;
    textarea.focus = vi.fn();
    const view = new SpinnerView(container, textarea);
    const ctrl = new SpinnerController(view);

    ctrl.startProcessing();
    ctrl.stopProcessing('error');
    vi.runAllTimers();

    const announcer = document.getElementById('sr-announcer');
    expect(announcer!.textContent).toBe('An error occurred');
  });

  it('IT-08: stop with timeout reason announces timeout message', async () => {
    const { SpinnerView } = await import('../spinner/SpinnerView');
    const { SpinnerController } = await import('../spinner/SpinnerController');
    const container = document.getElementById('container')!;
    const textarea = document.getElementById('input')! as HTMLTextAreaElement;
    textarea.focus = vi.fn();
    const view = new SpinnerView(container, textarea);
    const ctrl = new SpinnerController(view);

    ctrl.startProcessing();
    ctrl.stopProcessing('timeout');
    vi.runAllTimers();

    const announcer = document.getElementById('sr-announcer');
    expect(announcer!.textContent).toBe('Request timed out');
  });

  it('IT-09: normal stop before timeout prevents timeout from firing', async () => {
    const { SpinnerView } = await import('../spinner/SpinnerView');
    const { SpinnerController } = await import('../spinner/SpinnerController');
    const container = document.getElementById('container')!;
    const textarea = document.getElementById('input')! as HTMLTextAreaElement;
    textarea.focus = vi.fn();
    const view = new SpinnerView(container, textarea);
    const onTimeout = vi.fn();
    const ctrl = new SpinnerController(view, onTimeout);

    ctrl.startProcessing();
    vi.advanceTimersByTime(30_000); // 30s — halfway
    ctrl.stopProcessing('complete');
    vi.advanceTimersByTime(30_000); // another 30s — past original timeout

    expect(onTimeout).not.toHaveBeenCalled();
    expect(ctrl.getState()).toBe('READY');
  });

  it('IT-10: multiple start/stop cycles all clean up correctly', async () => {
    const { SpinnerView } = await import('../spinner/SpinnerView');
    const { SpinnerController } = await import('../spinner/SpinnerController');
    const container = document.getElementById('container')!;
    const textarea = document.getElementById('input')! as HTMLTextAreaElement;
    textarea.focus = vi.fn();
    const view = new SpinnerView(container, textarea);
    const ctrl = new SpinnerController(view);

    for (let i = 0; i < 5; i++) {
      ctrl.startProcessing();
      expect(ctrl.getState()).toBe('PROCESSING');
      expect(container.querySelector('.spinner-container')).not.toBeNull();

      ctrl.stopProcessing('complete');
      expect(ctrl.getState()).toBe('READY');
      expect(container.querySelector('.spinner-container')).toBeNull();
    }
  });
});
