/**
 * Unit Tests — SpinnerController
 * KSA-255 — UT-07 through UT-14
 * Split from spinner.unit.test.ts (controller concerns).
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
  return dom;
}

// ============================================================
// SpinnerController Unit Tests
// ============================================================
describe('UT — SpinnerController', () => {
  let dom: JSDOM;

  beforeEach(() => {
    dom = setupDOM();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('UT-07: initial state is READY', async () => {
    const { SpinnerView } = await import('../spinner/SpinnerView');
    const { SpinnerController } = await import('../spinner/SpinnerController');
    const container = document.getElementById('container')!;
    const textarea = document.getElementById('input')! as HTMLTextAreaElement;
    const view = new SpinnerView(container, textarea);
    const ctrl = new SpinnerController(view);

    expect(ctrl.getState()).toBe('READY');
    expect(ctrl.isProcessing()).toBe(false);
  });

  it('UT-08: startProcessing() transitions to PROCESSING', async () => {
    const { SpinnerView } = await import('../spinner/SpinnerView');
    const { SpinnerController } = await import('../spinner/SpinnerController');
    const container = document.getElementById('container')!;
    const textarea = document.getElementById('input')! as HTMLTextAreaElement;
    const view = new SpinnerView(container, textarea);
    const ctrl = new SpinnerController(view);

    ctrl.startProcessing();

    expect(ctrl.getState()).toBe('PROCESSING');
    expect(ctrl.isProcessing()).toBe(true);
  });

  it('UT-09: stopProcessing() transitions back to READY', async () => {
    const { SpinnerView } = await import('../spinner/SpinnerView');
    const { SpinnerController } = await import('../spinner/SpinnerController');
    const container = document.getElementById('container')!;
    const textarea = document.getElementById('input')! as HTMLTextAreaElement;
    textarea.focus = vi.fn();
    const view = new SpinnerView(container, textarea);
    const ctrl = new SpinnerController(view);

    ctrl.startProcessing();
    ctrl.stopProcessing('complete');

    expect(ctrl.getState()).toBe('READY');
    expect(ctrl.isProcessing()).toBe(false);
  });

  it('UT-10: startProcessing() when already PROCESSING is no-op (idempotent)', async () => {
    const { SpinnerView } = await import('../spinner/SpinnerView');
    const { SpinnerController } = await import('../spinner/SpinnerController');
    const container = document.getElementById('container')!;
    const textarea = document.getElementById('input')! as HTMLTextAreaElement;
    const view = new SpinnerView(container, textarea);
    const ctrl = new SpinnerController(view);

    ctrl.startProcessing();
    ctrl.startProcessing(); // idempotent

    expect(ctrl.getState()).toBe('PROCESSING');
    expect(container.querySelectorAll('.spinner-container').length).toBe(1);
  });

  it('UT-11: stopProcessing() when already READY is no-op (idempotent)', async () => {
    const { SpinnerView } = await import('../spinner/SpinnerView');
    const { SpinnerController } = await import('../spinner/SpinnerController');
    const container = document.getElementById('container')!;
    const textarea = document.getElementById('input')! as HTMLTextAreaElement;
    const view = new SpinnerView(container, textarea);
    const ctrl = new SpinnerController(view);

    ctrl.stopProcessing('complete'); // no-op

    expect(ctrl.getState()).toBe('READY');
  });

  it('UT-12: timeout fires after 60s and resets state', async () => {
    const { SpinnerView } = await import('../spinner/SpinnerView');
    const { SpinnerController } = await import('../spinner/SpinnerController');
    const container = document.getElementById('container')!;
    const textarea = document.getElementById('input')! as HTMLTextAreaElement;
    textarea.focus = vi.fn();
    const view = new SpinnerView(container, textarea);
    const onTimeout = vi.fn();
    const ctrl = new SpinnerController(view, onTimeout);

    ctrl.startProcessing();
    expect(ctrl.getState()).toBe('PROCESSING');

    vi.advanceTimersByTime(SPINNER_CONFIG.TIMEOUT_MS);

    expect(ctrl.getState()).toBe('READY');
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('UT-13: stopProcessing() clears the timeout (no late fire)', async () => {
    const { SpinnerView } = await import('../spinner/SpinnerView');
    const { SpinnerController } = await import('../spinner/SpinnerController');
    const container = document.getElementById('container')!;
    const textarea = document.getElementById('input')! as HTMLTextAreaElement;
    textarea.focus = vi.fn();
    const view = new SpinnerView(container, textarea);
    const onTimeout = vi.fn();
    const ctrl = new SpinnerController(view, onTimeout);

    ctrl.startProcessing();
    ctrl.stopProcessing('complete');
    vi.advanceTimersByTime(SPINNER_CONFIG.TIMEOUT_MS);

    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('UT-14: dispose() clears state and timer', async () => {
    const { SpinnerView } = await import('../spinner/SpinnerView');
    const { SpinnerController } = await import('../spinner/SpinnerController');
    const container = document.getElementById('container')!;
    const textarea = document.getElementById('input')! as HTMLTextAreaElement;
    const view = new SpinnerView(container, textarea);
    const onTimeout = vi.fn();
    const ctrl = new SpinnerController(view, onTimeout);

    ctrl.startProcessing();
    ctrl.dispose();
    vi.advanceTimersByTime(SPINNER_CONFIG.TIMEOUT_MS);

    expect(ctrl.getState()).toBe('READY');
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
