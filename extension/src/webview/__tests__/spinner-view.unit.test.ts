/**
 * Unit Tests — SpinnerView, Spinner types/constants
 * KSA-255 — UT-01 through UT-06, UT-15, UT-16
 * Split from spinner.unit.test.ts (view + types concerns).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { SPINNER_CONFIG, SPINNER_TRANSITIONS } from '../spinner/types';

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
// SpinnerView Unit Tests
// ============================================================
describe('UT — SpinnerView', () => {
  let dom: JSDOM;

  beforeEach(() => {
    dom = setupDOM();
  });

  it('UT-01: show() creates spinner DOM elements', async () => {
    const { SpinnerView } = await import('../spinner/SpinnerView');
    const container = document.getElementById('container')!;
    const textarea = document.getElementById('input')! as HTMLTextAreaElement;
    const view = new SpinnerView(container, textarea);

    view.show();

    expect(view.isVisible()).toBe(true);
    const el = view.getElement()!;
    expect(el.className).toBe('spinner-container visible');
    expect(el.querySelector('.spinner-icon')).not.toBeNull();
    expect(el.querySelector('.spinner-text')!.textContent).toBe('working');
  });

  it('UT-02: show() disables textarea', async () => {
    const { SpinnerView } = await import('../spinner/SpinnerView');
    const container = document.getElementById('container')!;
    const textarea = document.getElementById('input')! as HTMLTextAreaElement;
    const view = new SpinnerView(container, textarea);

    view.show();

    expect(textarea.disabled).toBe(true);
    expect(textarea.placeholder).toBe('');
  });

  it('UT-03: hide() removes spinner DOM', async () => {
    const { SpinnerView } = await import('../spinner/SpinnerView');
    const container = document.getElementById('container')!;
    const textarea = document.getElementById('input')! as HTMLTextAreaElement;
    textarea.focus = vi.fn();
    const view = new SpinnerView(container, textarea);

    view.show();
    view.hide();

    expect(view.isVisible()).toBe(false);
    expect(view.getElement()).toBeNull();
  });

  it('UT-04: hide() re-enables textarea and restores placeholder', async () => {
    const { SpinnerView } = await import('../spinner/SpinnerView');
    const container = document.getElementById('container')!;
    const textarea = document.getElementById('input')! as HTMLTextAreaElement;
    textarea.focus = vi.fn();
    const view = new SpinnerView(container, textarea);

    view.show();
    view.hide();

    expect(textarea.disabled).toBe(false);
    expect(textarea.placeholder).toBe('Type a message...');
  });

  it('UT-05: show() is idempotent (calling twice doesn\'t create duplicate DOM)', async () => {
    const { SpinnerView } = await import('../spinner/SpinnerView');
    const container = document.getElementById('container')!;
    const textarea = document.getElementById('input')! as HTMLTextAreaElement;
    const view = new SpinnerView(container, textarea);

    view.show();
    view.show();

    expect(container.querySelectorAll('.spinner-container').length).toBe(1);
  });

  it('UT-06: hide() when not visible is safe (no error)', async () => {
    const { SpinnerView } = await import('../spinner/SpinnerView');
    const container = document.getElementById('container')!;
    const textarea = document.getElementById('input')! as HTMLTextAreaElement;
    textarea.focus = vi.fn();
    const view = new SpinnerView(container, textarea);

    expect(() => view.hide()).not.toThrow();
  });
});

// ============================================================
// Types/Constants Unit Tests
// ============================================================
describe('UT — Spinner Types', () => {
  it('UT-15: SPINNER_CONFIG has correct values', () => {
    expect(SPINNER_CONFIG.TIMEOUT_MS).toBe(60_000);
    expect(SPINNER_CONFIG.SPINNER_SIZE_PX).toBe(14);
    expect(SPINNER_CONFIG.TEXT_SIZE_PX).toBe(11);
    expect(SPINNER_CONFIG.MAX_SHOW_DELAY_MS).toBe(100);
    expect(SPINNER_CONFIG.MAX_STOP_DELAY_MS).toBe(50);
  });

  it('UT-16: SPINNER_TRANSITIONS has exactly 2 transitions', () => {
    expect(SPINNER_TRANSITIONS).toHaveLength(2);
    expect(SPINNER_TRANSITIONS[0]).toEqual({ from: 'READY', to: 'PROCESSING', trigger: 'START' });
    expect(SPINNER_TRANSITIONS[1]).toEqual({ from: 'PROCESSING', to: 'READY', trigger: 'STOP' });
  });
});
