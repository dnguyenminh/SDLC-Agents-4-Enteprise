/**
 * OptionsController — State management + event coordination for Interactive Options
 * KSA-259
 *
 * Pattern: Mirrors SpinnerController (KSA-255) — state machine with guard clauses.
 * States: IDLE <-> OPTIONS_VISIBLE
 * Observer: subscribes to SpinnerController state for auto-dismiss.
 */

import type { ChatOptionsSignal } from '../protocol';
import type { OptionsState, OptionsControllerOptions } from './types';
import { INITIAL_OPTIONS_STATE, OPTIONS_CONFIG } from './types';
import type { OptionsView } from './OptionsView';

export class OptionsController {
  private state: OptionsState;
  private view: OptionsView;
  private onSelectCallback: (text: string, source: 'option-click' | 'text-input') => void;
  private isSpinnerActive: () => boolean;
  private pendingSignal: ChatOptionsSignal | null = null;

  constructor(options: OptionsControllerOptions) {
    this.state = { ...INITIAL_OPTIONS_STATE };
    this.view = options.view;
    this.onSelectCallback = options.onSelect;
    this.isSpinnerActive = options.isSpinnerActive;

    // Wire view selection callback
    this.view.onSelect((text) => this.selectOption(text));
  }

  /**
   * Handle incoming chat:options signal from Extension Host.
   * Guards: ignore empty options, ignore during PROCESSING state (queue instead).
   */
  showOptions(signal: ChatOptionsSignal): void {
    // Guard: empty or invalid options
    if (!signal.options || signal.options.length === 0) return;

    // Guard: spinner active -> queue for later (BR-08)
    if (this.isSpinnerActive()) {
      this.pendingSignal = signal;
      return;
    }

    // If options already visible, replace them (AF-02)
    if (this.state.displayState === 'OPTIONS_VISIBLE') {
      this.view.hide();
    }

    // Cap options at MAX_OPTIONS, filter empty strings
    const validOptions = signal.options
      .filter((opt) => typeof opt === 'string' && opt.trim().length > 0)
      .slice(0, OPTIONS_CONFIG.MAX_OPTIONS);

    if (validOptions.length === 0) return;

    // Transition: IDLE -> OPTIONS_VISIBLE
    this.state = {
      displayState: 'OPTIONS_VISIBLE',
      options: validOptions,
      question: signal.question ?? null,
    };

    // Render buttons
    this.view.render(validOptions, signal.question);
  }

  /**
   * Handle option button click — send response and hide.
   */
  selectOption(text: string): void {
    // Guard: not visible -> no-op (idempotent)
    if (this.state.displayState !== 'OPTIONS_VISIBLE') return;

    // Send response to Extension Host
    this.onSelectCallback(text, 'option-click');

    // Hide options
    this.hideOptions();
  }

  /**
   * Handle custom text submit (Enter in textarea while options visible).
   * Called by InputAreaIntegration when user submits text.
   */
  submitCustom(): void {
    // No-op if not visible
    if (this.state.displayState !== 'OPTIONS_VISIBLE') return;

    // Hide options (response sending handled by InputAreaIntegration)
    this.hideOptions();
  }

  /**
   * Dismiss options (Escape, auto-dismiss from spinner, etc.)
   */
  dismiss(reason?: string): void {
    if (this.state.displayState !== 'OPTIONS_VISIBLE') return;
    this.hideOptions();
  }

  /**
   * Process pending options (called when spinner stops).
   * If options were queued during PROCESSING, show them now.
   */
  processPendingOptions(): void {
    if (this.pendingSignal) {
      const signal = this.pendingSignal;
      this.pendingSignal = null;
      this.showOptions(signal);
    }
  }

  /**
   * Keyboard event handler.
   * Returns true if the event was handled (should preventDefault + stopPropagation).
   */
  handleKeyDown(event: KeyboardEvent): boolean {
    if (this.state.displayState !== 'OPTIONS_VISIBLE') return false;

    switch (event.key) {
      case 'Escape':
        this.dismiss('keyboard');
        this.view.focusTextarea();
        return true;

      case 'Tab': {
        // Move focus between buttons
        const buttons = this.view.getButtons();
        if (buttons.length === 0) return false;

        const active = document.activeElement as HTMLElement;
        const currentIndex = buttons.indexOf(active as HTMLButtonElement);

        if (event.shiftKey) {
          // Shift+Tab: move backward or back to textarea
          if (currentIndex <= 0) {
            this.view.focusTextarea();
            return true;
          }
          buttons[currentIndex - 1].focus();
        } else {
          // Tab: move forward or wrap to textarea
          if (currentIndex === buttons.length - 1 || currentIndex === -1) {
            // If not on a button or on last button, move to first or textarea
            if (currentIndex === -1) {
              buttons[0].focus();
            } else {
              this.view.focusTextarea();
            }
            return true;
          }
          buttons[currentIndex + 1].focus();
        }
        return true;
      }

      case 'Enter': {
        // Select focused button
        const active = document.activeElement as HTMLElement;
        if (active && active.classList.contains('option-btn')) {
          const text = active.textContent || '';
          if (text) {
            this.selectOption(text);
          }
          return true;
        }
        return false;
      }

      default:
        return false;
    }
  }

  /**
   * Check if options are currently visible.
   */
  isVisible(): boolean {
    return this.state.displayState === 'OPTIONS_VISIBLE';
  }

  /**
   * Get current state (for testing).
   */
  getState(): OptionsState {
    return { ...this.state };
  }

  /**
   * Internal: hide options and reset state.
   */
  private hideOptions(): void {
    this.state = { ...INITIAL_OPTIONS_STATE };
    this.view.hide();
  }

  dispose(): void {
    this.hideOptions();
    this.pendingSignal = null;
  }
}
