/**
 * Slash menu state machine (KSA-254).
 * States: CLOSED ↔ OPEN ↔ FILTERING
 * Triggered by '/' at position 0 or after whitespace (BR-01, BR-05)
 */

import type { SlashMenuState, SlashMenuTrigger, SlashStateTransition } from './types';

export const TRANSITIONS: SlashStateTransition[] = [
  { from: 'CLOSED', to: 'OPEN', trigger: 'SLASH_TYPED' },
  { from: 'OPEN', to: 'FILTERING', trigger: 'CHAR_TYPED' },
  { from: 'OPEN', to: 'CLOSED', trigger: 'AGENT_SELECTED' },
  { from: 'OPEN', to: 'CLOSED', trigger: 'STEERING_SELECTED' },
  { from: 'OPEN', to: 'CLOSED', trigger: 'DISMISS' },
  { from: 'FILTERING', to: 'OPEN', trigger: 'FILTER_CLEARED' },
  { from: 'FILTERING', to: 'CLOSED', trigger: 'AGENT_SELECTED' },
  { from: 'FILTERING', to: 'CLOSED', trigger: 'STEERING_SELECTED' },
  { from: 'FILTERING', to: 'CLOSED', trigger: 'DISMISS' },
];

/** Table-driven state machine over the CLOSED/OPEN/FILTERING graph. */
export class SlashMenuStateMachine {
  private state: SlashMenuState = 'CLOSED';

  get current(): SlashMenuState {
    return this.state;
  }

  isOpen(): boolean {
    return this.state !== 'CLOSED';
  }

  transition(trigger: SlashMenuTrigger): boolean {
    const valid = TRANSITIONS.find((t) => t.from === this.state && t.trigger === trigger);
    if (!valid) return false;
    this.state = valid.to;
    return true;
  }
}
