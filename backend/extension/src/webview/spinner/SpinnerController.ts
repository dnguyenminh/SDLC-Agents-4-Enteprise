/**
 * SpinnerController — State machine for processing indicator
 * KSA-255
 *
 * Pattern: Mirrors ContextMenuController (KSA-252)
 * States: READY ↔ PROCESSING
 * Transitions are idempotent (BR-08)
 */

import type { SpinnerState, SpinnerTrigger, StopReason } from './types';
import { SPINNER_TRANSITIONS, SPINNER_CONFIG } from './types';
import { SpinnerView } from './SpinnerView';

export class SpinnerController {
  private state: SpinnerState = 'READY';
  private startedAt: number | null = null;
  private timeoutId: ReturnType<typeof setTimeout> | null = null;
  private view: SpinnerView;
  private announcer: HTMLElement | null = null;
  private onTimeout?: () => void;

  constructor(view: SpinnerView, onTimeout?: () => void) {
    this.view = view;
    this.onTimeout = onTimeout;
    this.setupAnnouncer();
  }

  private setupAnnouncer(): void {
    this.announcer = document.getElementById('sr-announcer');
    if (!this.announcer) {
      this.announcer = document.createElement('div');
      this.announcer.id = 'sr-announcer';
      this.announcer.setAttribute('aria-live', 'polite');
      this.announcer.setAttribute('aria-atomic', 'true');
      this.announcer.className = 'sr-only';
      document.body.appendChild(this.announcer);
    }
  }

  private announce(message: string): void {
    if (this.announcer) {
      this.announcer.textContent = '';
      requestAnimationFrame(() => {
        if (this.announcer) this.announcer.textContent = message;
      });
    }
  }

  private transition(trigger: SpinnerTrigger): boolean {
    const valid = SPINNER_TRANSITIONS.find(t => t.from === this.state && t.trigger === trigger);
    if (!valid) return false;
    this.state = valid.to;
    return true;
  }

  getState(): SpinnerState {
    return this.state;
  }

  isProcessing(): boolean {
    return this.state === 'PROCESSING';
  }

  startProcessing(): void {
    // Guard: already processing → no-op (BR-08)
    if (!this.transition('START')) return;

    this.startedAt = Date.now();

    // Start timeout (BR-05: 60s max)
    this.timeoutId = setTimeout(() => {
      this.stopProcessing('timeout');
      this.onTimeout?.();
    }, SPINNER_CONFIG.TIMEOUT_MS);

    // Show UI
    this.view.show();
    this.announce('AI is processing your request');
  }

  stopProcessing(reason: StopReason = 'complete'): void {
    // Guard: not processing → no-op (BR-08)
    if (!this.transition('STOP')) return;

    // Clear timeout
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.startedAt = null;

    // Hide UI
    this.view.hide();

    // Announce reason
    const message = reason === 'timeout'
      ? 'Request timed out'
      : reason === 'error'
      ? 'An error occurred'
      : reason === 'cancelled'
      ? 'Processing cancelled'
      : 'AI response complete';
    this.announce(message);
  }

  dispose(): void {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    this.state = 'READY';
    this.startedAt = null;
  }
}
