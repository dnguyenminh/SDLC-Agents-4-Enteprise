/**
 * Menu item mapping for dynamically loaded skill agents (KSA-254).
 */

import { SLASH_AGENTS, agentsToMenuItems } from '../SlashMenuItems';
import type { SlashMenuItem } from '../types';

/** Map extension-host skill list into agent menu items (icon 🧩, skill-<id>). */
export function skillAgentsToMenuItems(
  skills: Array<{ id: string; label: string; description: string }>,
): SlashMenuItem[] {
  const skillAgents = skills.map(s => ({
    id: s.id,
    icon: '🧩',
    label: s.label,
    agentName: `skill-${s.id}`,
    description: s.description || 'Skill',
  }));
  return [...agentsToMenuItems(SLASH_AGENTS), ...skillAgents.map(a => ({
    id: `agent-${a.id}`,
    icon: a.icon,
    label: a.label,
    description: a.description,
    itemType: 'agent' as const,
    agentName: a.agentName,
  }))];
}
