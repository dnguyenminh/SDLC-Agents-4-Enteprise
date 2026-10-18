/**
 * DOM + window event wiring for the input area (KSA-252 trigger detection,
 * KSA-254 slash trigger + filter, KSA-255 processing signals, KSA-259
 * options, steering/skills). Registration order is preserved exactly.
 */
import type { ChatOptionsSignal } from '../../protocol';
import type { InputAreaParts } from './parts';
import { updateFilter, handleBadgeBackspace } from './badge-handlers';
import { updateSlashFilter } from './selection-handlers';

/** Wire all input-area listeners in the original order. */
export function setupListeners(parts: InputAreaParts): void {
  registerTriggerListeners(parts);
  registerMenuKeyNavigation(parts);
  registerOutsideClick(parts);
  registerBadgeBackspace(parts);
}

/** Detect "#" or "/" typed in input. */
function registerTriggerListeners(parts: InputAreaParts): void {
  parts.inputElement.addEventListener('input', (e) => {
    handleTriggerInput(parts, e as InputEvent);
  });
}

function handleTriggerInput(parts: InputAreaParts, event: InputEvent): void {
  const text = parts.inputElement.textContent || '';
  // KSA-254: Detect '/' trigger (BR-01, BR-02, BR-04)
  if (tryOpenSlashMenu(parts, text, event)) return;
  // KSA-252: Detect '#' trigger
  if (!parts.hashDetectionEnabled) return;
  if (event.data === '#' && !parts.controller.isOpen()) {
    parts.controller.open();
  } else if (parts.controller.isOpen()) {
    updateFilter(parts);
  }
}

/**
 * KSA-254: Detect '/' trigger (BR-01, BR-02, BR-04).
 * Returns true when the input event was consumed by the slash menu flow.
 */
function tryOpenSlashMenu(parts: InputAreaParts, text: string, event: InputEvent): boolean {
  if (event.data === '/' && !parts.slashController.isOpen() && !parts.controller.isOpen()) {
    const slashPos = text.lastIndexOf('/');
    if (slashPos >= 0 && parts.slashController.isValidTrigger(text, slashPos)) {
      parts.slashController.open(slashPos);
      return true;
    }
  } else if (parts.slashController.isOpen()) {
    updateSlashFilter(parts);
    return true;
  }
  return false;
}

/** Key events: options first (KSA-259), then slash (KSA-254), then context (KSA-252). */
function registerMenuKeyNavigation(parts: InputAreaParts): void {
  parts.inputElement.addEventListener('keydown', (e) => {
    const ke = e as KeyboardEvent;
    if (handleMenuKeysBeforeContext(parts, ke, e)) return;
    handleContextKeys(parts, ke, e);
  });
}

/** Options (KSA-259) and slash (KSA-254) menu keys; true when consumed. */
function handleMenuKeysBeforeContext(parts: InputAreaParts, ke: KeyboardEvent, e: Event): boolean {
  if (parts.optionsController.isVisible() && parts.optionsController.handleKeyDown(ke)) {
    e.preventDefault();
    e.stopPropagation();
    return true;
  }
  if (parts.slashController.isOpen() && parts.slashController.handleKeyDown(ke)) {
    e.preventDefault();
    e.stopPropagation();
    return true;
  }
  return false;
}

/** Context menu keys (KSA-252) — last check, no early return needed. */
function handleContextKeys(parts: InputAreaParts, ke: KeyboardEvent, e: Event): void {
  if (parts.controller.isOpen()) {
    const handled = parts.controller.handleKeyDown(ke);
    if (handled) {
      e.preventDefault();
      e.stopPropagation();
    }
  }
}

/** Outside click detection (KSA-252 / KSA-254). */
function registerOutsideClick(parts: InputAreaParts): void {
  document.addEventListener('mousedown', (e) => {
    const target = e.target as HTMLElement;
    // KSA-254: Close slash menu on outside click
    if (parts.slashController.isOpen()) {
      if (!target.closest('.slash-menu')) {
        parts.slashController.close();
      }
    }
    // KSA-252: Close context menu on outside click
    if (parts.controller.isOpen()) {
      if (!target.closest('.context-menu') && !target.closest('.picker-panel')) {
        parts.controller.close();
      }
    }
  });
}

/** Badge backspace removal. */
function registerBadgeBackspace(parts: InputAreaParts): void {
  parts.inputElement.addEventListener('keydown', (e) => {
    if ((e as KeyboardEvent).key === 'Backspace' && !parts.controller.isOpen() && !parts.slashController.isOpen()) {
      handleBadgeBackspace(parts);
    }
  });
}

/**
 * KSA-255: processing signals. Handles BOTH protocols:
 * - chat:processing (original KSA-255 spec: { state: 'start'|'stop', reason })
 * - chat:workingStatus (actual backend emission: { working: true|false })
 */
export function setupProcessingListener(parts: InputAreaParts): void {
  window.addEventListener('message', (event) => {
    handleProcessingMessage(parts, event.data);
  });
}

interface ProcessingSignal { type?: string; state?: string; reason?: string; working?: boolean; }

function handleProcessingMessage(parts: InputAreaParts, message: ProcessingSignal | undefined): void {
  // Handle chat:processing (original protocol from KSA-255 spec)
  if (message && message.type === 'chat:processing') {
    if (message.state === 'start') {
      startProcessingUi(parts);
    } else if (message.state === 'stop') {
      stopProcessingUi(parts, message.reason);
    }
  }
  // Handle chat:workingStatus (actual protocol from backend message-handler)
  if (message && message.type === 'chat:workingStatus') {
    if (message.working) {
      startProcessingUi(parts);
    } else {
      stopProcessingUi(parts);
    }
  }
}

function startProcessingUi(parts: InputAreaParts): void {
  parts.spinnerController.startProcessing();
  // KSA-259: Auto-dismiss options when processing starts
  if (parts.optionsController.isVisible()) {
    parts.optionsController.dismiss('auto-dismiss');
  }
}

function stopProcessingUi(parts: InputAreaParts, reason?: string): void {
  parts.spinnerController.stopProcessing(reason ?? 'complete');
  // KSA-259: Show pending options after spinner stops
  parts.optionsController.processPendingOptions();
}

/**
 * KSA-259: Listen for chat:options signals from Extension Host
 */
export function setupOptionsListener(parts: InputAreaParts): void {
  window.addEventListener('message', (event) => {
    const message = event.data as ChatOptionsSignal;
    if (message && message.type === 'chat:options') {
      parts.optionsController.showOptions(message);
    }
  });
}

/**
 * KSA-254: Listen for chat:steeringLoaded signal from Extension Host
 */
export function setupSteeringListener(parts: InputAreaParts): void {
  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message && message.type === 'chat:steeringLoaded' && Array.isArray(message.rules)) {
      parts.slashController.setSteeringRules(message.rules);
    }
  });
}

export function setupSkillsListener(parts: InputAreaParts): void {
  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message && message.type === 'chat:skillsLoaded' && Array.isArray(message.skills)) {
      parts.slashController.setSkillAgents(message.skills);
    }
  });
}
