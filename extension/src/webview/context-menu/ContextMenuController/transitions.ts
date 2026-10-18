/**
 * Context menu state machine (KSA-252).
 * States: CLOSED ↔ OPEN ↔ FILTERING ↔ PICKER_OPEN ↔ BADGE_INSERTED
 */

import type { ContextMenuState, ContextMenuTrigger, StateTransition } from '../types';

export const TRANSITIONS: StateTransition[] = [
  { from: 'CLOSED', to: 'OPEN', trigger: 'HASH_TYPED' },
  { from: 'OPEN', to: 'FILTERING', trigger: 'CHAR_TYPED' },
  { from: 'OPEN', to: 'PICKER_OPEN', trigger: 'PICKER_SELECTED' },
  { from: 'OPEN', to: 'BADGE_INSERTED', trigger: 'INSTANT_SELECTED' },
  { from: 'OPEN', to: 'CLOSED', trigger: 'DISMISS' },
  { from: 'FILTERING', to: 'PICKER_OPEN', trigger: 'PICKER_SELECTED' },
  { from: 'FILTERING', to: 'BADGE_INSERTED', trigger: 'INSTANT_SELECTED' },
  { from: 'FILTERING', to: 'OPEN', trigger: 'FILTER_CLEARED' },
  { from: 'FILTERING', to: 'CLOSED', trigger: 'DISMISS' },
  { from: 'PICKER_OPEN', to: 'BADGE_INSERTED', trigger: 'ITEM_SELECTED' },
  { from: 'PICKER_OPEN', to: 'OPEN', trigger: 'BACK' },
  { from: 'PICKER_OPEN', to: 'CLOSED', trigger: 'DISMISS' },
  { from: 'BADGE_INSERTED', to: 'CLOSED', trigger: 'AUTO' },
];

/** Table-driven state machine over the context-menu transition graph. */
export class ContextMenuStateMachine {
  private state: ContextMenuState = 'CLOSED';

  get current(): ContextMenuState {
    return this.state;
  }

  isOpen(): boolean {
    return this.state !== 'CLOSED';
  }

  transition(trigger: ContextMenuTrigger): boolean {
    const valid = TRANSITIONS.find(t => t.from === this.state && t.trigger === trigger);
    if (!valid) return false;
    this.state = valid.to;
    return true;
  }
}
