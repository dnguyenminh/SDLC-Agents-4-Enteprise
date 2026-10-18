/**
 * Slash menu selection handlers (KSA-254 agent/steering/command insertion,
 * SA4E-193 command dispatch) operating on the shared input-area state.
 */
import type { ContextTagBadge } from '../../protocol';
import type { SlashSteeringRule } from '../../slash-menu/types';
import type { InputAreaParts } from './parts';
import { renderBadge } from './badge-handlers';

/**
 * KSA-254: Update slash menu filter based on text after trigger position
 */
export function updateSlashFilter(parts: InputAreaParts): void {
  const text = parts.inputElement.textContent || '';
  const triggerIndex = parts.slashController.getTriggerIndex();
  if (triggerIndex < 0) return;
  // Extract filter text: everything between '/' trigger and cursor
  const filterText = text.substring(triggerIndex + 1);
  // BR-17: If user backspaced past the '/' position, close
  if (!text.includes('/') || text.length <= triggerIndex) {
    parts.slashController.close();
    return;
  }
  parts.slashController.filter(filterText);
}

/**
 * KSA-254: Agent selected — insert /agent-name prefix into textarea (BR-24, BR-25)
 */
export function onAgentSelected(parts: InputAreaParts, agentName: string): void {
  const text = parts.inputElement.textContent || '';
  const triggerIndex = parts.slashController.getTriggerIndex();
  const before = text.substring(0, triggerIndex);
  const cursorPos = (window.getSelection()?.anchorOffset) ?? text.length;
  const after = text.substring(cursorPos);
  const prefix = `/${agentName} `;
  parts.inputElement.textContent = before + prefix + after;
  // Move cursor after prefix
  setCursorPosition(parts, before.length + prefix.length);
}

/**
 * KSA-254: Steering rule selected — add context chip (BR-28, BR-29)
 */
export function onSteeringSelected(parts: InputAreaParts, rule: SlashSteeringRule): void {
  const text = parts.inputElement.textContent || '';
  const triggerIndex = parts.slashController.getTriggerIndex();
  const before = text.substring(0, triggerIndex);
  const cursorPos = (window.getSelection()?.anchorOffset) ?? text.length;
  const after = text.substring(cursorPos);
  parts.inputElement.textContent = before + after;
  setCursorPosition(parts, before.length);
  // Add as context chip via badge system
  const badge: ContextTagBadge = {
    id: `slash-steering-${Date.now()}`,
    type: 'steering',
    label: rule.name,
    icon: rule.icon,
    metadata: { steeringFile: `.code-intel/steering/${rule.file}` },
  };
  renderBadge(parts, badge);
}

/**
 * SA4E-193: Command selected — dispatch to extension host for execution
 */
export function onCommandSelected(parts: InputAreaParts, commandId: string): void {
  const text = parts.inputElement.textContent || '';
  const triggerIndex = parts.slashController.getTriggerIndex();
  const before = text.substring(0, triggerIndex);
  const cursorPos = (window.getSelection()?.anchorOffset) ?? text.length;
  const after = text.substring(cursorPos);
  // Clear the input text after slash command
  parts.inputElement.textContent = before + after;
  setCursorPosition(parts, before.length);
  // Dispatch command to extension host via vscodeApi
  parts.vscodeApi.postMessage({ type: 'COMMAND_DISPATCH', command: commandId });
}

function setCursorPosition(parts: InputAreaParts, pos: number): void {
  const range = document.createRange();
  const sel = window.getSelection();
  const textNode = parts.inputElement.firstChild;
  if (textNode) {
    const safePos = Math.min(pos, textNode.textContent?.length ?? 0);
    range.setStart(textNode, safePos);
    range.collapse(true);
    sel?.removeAllRanges();
    sel?.addRange(range);
  }
}
