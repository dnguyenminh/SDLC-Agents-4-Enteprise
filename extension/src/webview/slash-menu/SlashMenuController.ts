/**
 * SlashMenuController — State machine + orchestration for Slash Command Menu
 * KSA-254
 *
 * States: CLOSED ↔ OPEN ↔ FILTERING
 * Triggered by '/' at position 0 or after whitespace (BR-01, BR-05)
 *
 * State machine, announcer, item mapping and selection live in ./SlashMenuController/*.
 */

import type { SlashMenuState, SlashMenuOptions, SlashMenuItem, SlashSteeringRule } from './types';
import { SlashMenuView } from './SlashMenuView';
import {
  SLASH_AGENTS,
  SLASH_COMMANDS,
  SKILL_AGENTS,
  agentsToMenuItems,
  steeringToMenuItems,
  parseSteeringRules,
  filterSlashItems,
} from './SlashMenuItems';
import { SlashMenuStateMachine } from './SlashMenuController/transitions';
import { announceVia, ensureAnnouncer } from './SlashMenuController/announcer';
import { skillAgentsToMenuItems } from './SlashMenuController/items-sync';
import {
  handleSlashKeyDown,
  isValidSlashTrigger,
  selectSlashItem,
} from './SlashMenuController/selection';

export class SlashMenuController {
  private sm = new SlashMenuStateMachine();
  private view: SlashMenuView;
  private options: SlashMenuOptions;
  private filterText = '';
  private triggerIndex = -1;

  private agentItems: SlashMenuItem[];
  private steeringRules: SlashSteeringRule[] = [];
  private steeringItems: SlashMenuItem[] = [];

  private visibleAgents: SlashMenuItem[];
  private visibleSteering: SlashMenuItem[] = [];

  private announcer: HTMLElement | null = null;

  constructor(options: SlashMenuOptions) {
    this.options = options;
    this.view = new SlashMenuView(options.container);
    const allAgents = [...SLASH_AGENTS, ...SKILL_AGENTS];
    this.agentItems = [...agentsToMenuItems(allAgents), ...SLASH_COMMANDS];
    this.visibleAgents = [...this.agentItems];
    this.announcer = ensureAnnouncer();
  }

  private announce(message: string): void {
    announceVia(this.announcer, message);
  }

  getState(): SlashMenuState {
    return this.sm.current;
  }

  isOpen(): boolean {
    return this.sm.isOpen();
  }

  getTriggerIndex(): number {
    return this.triggerIndex;
  }

  /**
   * Update steering rules from chat:steeringLoaded message (BR-09)
   */
  setSteeringRules(rules: Array<{ name: string; file: string }>): void {
    this.steeringRules = parseSteeringRules(rules);
    this.steeringItems = steeringToMenuItems(this.steeringRules);
    this.visibleSteering = [...this.steeringItems];
  }

  /**
   * Update skill agents from extension host
   */
  setSkillAgents(skills: Array<{id:string;label:string;description:string}>): void {
    const allAgents = skillAgentsToMenuItems(skills);
    this.agentItems = [...allAgents, ...SLASH_COMMANDS];
    if (this.sm.current !== 'CLOSED') {
      this.visibleAgents = [...this.agentItems];
      this.view.updateItems(this.visibleAgents, this.visibleSteering);
    }
  }

  /** Valid: position 0 OR preceded by whitespace; invalid mid-word (BR-01, BR-05) */
  isValidTrigger(text: string, slashPos: number): boolean {
    return isValidSlashTrigger(text, slashPos);
  }

  /**
   * Open the slash popup at the given trigger position
   */
  open(triggerIndex: number): void {
    if (!this.sm.transition('SLASH_TYPED')) return;
    this.triggerIndex = triggerIndex;
    this.filterText = '';
    this.visibleAgents = [...this.agentItems];
    this.visibleSteering = [...this.steeringItems];

    const rect = this.options.inputElement.getBoundingClientRect();
    this.view.render(this.visibleAgents, this.visibleSteering, rect);

    const total = this.visibleAgents.length + this.visibleSteering.length;
    this.announce(`Slash commands menu opened. ${total} items available. Use arrow keys to navigate.`);
  }

  /**
   * Close the popup (BR-22: Escape dismisses)
   */
  close(): void {
    this.sm.transition('DISMISS');
    this.view.destroy();
    this.filterText = '';
    this.triggerIndex = -1;
    this.options.onClose();
  }

  /**
   * Filter items based on typed text after '/' (BR-12 through BR-16)
   */
  filter(text: string): void {
    this.filterText = text;

    if (!text) {
      this.sm.transition('FILTER_CLEARED');
      this.visibleAgents = [...this.agentItems];
      this.visibleSteering = [...this.steeringItems];
    } else {
      if (this.sm.current === 'OPEN') this.sm.transition('CHAR_TYPED');
      const result = filterSlashItems(this.agentItems, this.steeringItems, text);
      this.visibleAgents = result.agents;
      this.visibleSteering = result.steering;
    }

    this.view.updateItems(this.visibleAgents, this.visibleSteering);
    const total = this.visibleAgents.length + this.visibleSteering.length;
    this.announce(`${total} commands match.`);
  }

  /**
   * Handle keyboard navigation (BR-18 through BR-22)
   */
  handleKeyDown(event: KeyboardEvent): boolean {
    return handleSlashKeyDown(event, {
      view: this.view,
      onSelectHighlighted: () => this.selectHighlighted(),
      onClose: () => this.close(),
    });
  }

  /**
   * Handle mouse click on item (BR-23)
   */
  handleItemClick(index: number): void {
    const item = this.view.getItemAtIndex(index);
    if (item) this.selectItem(item);
  }

  private selectHighlighted(): void {
    const item = this.view.getHighlightedItem();
    if (item) this.selectItem(item);
  }

  private selectItem(item: SlashMenuItem): void {
    selectSlashItem(item, {
      sm: this.sm,
      view: this.view,
      options: this.options,
      announce: (message) => this.announce(message),
      steeringRules: this.steeringRules,
    });
    this.filterText = '';
    this.triggerIndex = -1;
  }

  getFilterText(): string {
    return this.filterText;
  }

  getVisibleAgentCount(): number {
    return this.visibleAgents.length;
  }

  getVisibleSteeringCount(): number {
    return this.visibleSteering.length;
  }

  dispose(): void {
    this.close();
  }
}
