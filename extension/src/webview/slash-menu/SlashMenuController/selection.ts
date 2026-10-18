/**
 * Slash menu selection + keyboard interaction (KSA-254, BR-18..BR-23).
 */

import type { SlashMenuOptions, SlashMenuItem, SlashSteeringRule } from '../types';
import { SlashMenuView } from '../SlashMenuView';
import { SlashMenuStateMachine } from './transitions';

/**
 * Check if '/' at the given position is a valid trigger (BR-01, BR-05)
 * Valid: position 0 OR preceded by whitespace
 * Invalid: mid-word (e.g., "http://")
 */
export function isValidSlashTrigger(text: string, slashPos: number): boolean {
  if (slashPos === 0) return true;
  const charBefore = text[slashPos - 1];
  return charBefore === ' ' || charBefore === '\t' || charBefore === '\n';
}

/** Keyboard navigation dispatch (BR-18 through BR-22). */
export function handleSlashKeyDown(
  event: KeyboardEvent,
  deps: {
    view: SlashMenuView;
    onSelectHighlighted: () => void;
    onClose: () => void;
  },
): boolean {
  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault();
      deps.view.moveHighlight('down');
      return true;
    case 'ArrowUp':
      event.preventDefault();
      deps.view.moveHighlight('up');
      return true;
    case 'Enter':
    case 'Tab':
      event.preventDefault();
      deps.onSelectHighlighted();
      return true;
    case 'Escape':
      event.preventDefault();
      deps.onClose();
      return true;
    default:
      return false;
  }
}

/** Selection dispatch by item type: agent / steering / command (BR-23). */
export function selectSlashItem(
  item: SlashMenuItem,
  ctx: {
    sm: SlashMenuStateMachine;
    view: SlashMenuView;
    options: SlashMenuOptions;
    announce: (message: string) => void;
    steeringRules: SlashSteeringRule[];
  },
): void {
  if (item.itemType === 'agent') {
    ctx.sm.transition('AGENT_SELECTED');
    ctx.view.destroy();
    ctx.options.onAgentSelect(item.agentName!);
    ctx.announce(`Agent selected: ${item.label}`);
  } else if (item.itemType === 'steering') {
    ctx.sm.transition('STEERING_SELECTED');
    ctx.view.destroy();
    const rule = ctx.steeringRules.find((r) => r.name === item.label);
    if (rule) {
      ctx.options.onSteeringSelect(rule);
      ctx.announce(`Steering rule attached: ${item.label}`);
    }
  } else if (item.itemType === 'command') {
    ctx.sm.transition('AGENT_SELECTED');
    ctx.view.destroy();
    if (ctx.options.onCommandSelect) {
      ctx.options.onCommandSelect(item.id.replace('command-', ''));
    }
    ctx.announce(`Command executed: ${item.label}`);
  }
}
