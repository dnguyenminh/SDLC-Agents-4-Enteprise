/**
 * Slash Menu types — KSA-254
 * State machine types for the Slash Command Menu popup
 */

export type SlashMenuState = 'CLOSED' | 'OPEN' | 'FILTERING';

export type SlashMenuTrigger =
  | 'SLASH_TYPED'
  | 'CHAR_TYPED'
  | 'FILTER_CLEARED'
  | 'AGENT_SELECTED'
  | 'STEERING_SELECTED'
  | 'DISMISS';

export interface SlashStateTransition {
  from: SlashMenuState;
  to: SlashMenuState;
  trigger: SlashMenuTrigger;
}

export interface SlashAgent {
  id: string;
  icon: string;
  label: string;
  agentName: string;
  description: string;
}

export interface SlashSteeringRule {
  name: string;
  file: string;
  icon: string;
}

export type SlashItemType = 'agent' | 'steering';

export interface SlashMenuItem {
  id: string;
  icon: string;
  label: string;
  description?: string;
  itemType: SlashItemType;
  /** Agent name for routing (agent items only) */
  agentName?: string;
  /** File path for steering rule (steering items only) */
  filePath?: string;
}

export interface SlashMenuOptions {
  container: HTMLElement;
  inputElement: HTMLElement;
  onAgentSelect: (agentName: string) => void;
  onSteeringSelect: (rule: SlashSteeringRule) => void;
  onClose: () => void;
}

export interface SlashFilterResult {
  agents: SlashMenuItem[];
  steering: SlashMenuItem[];
}
