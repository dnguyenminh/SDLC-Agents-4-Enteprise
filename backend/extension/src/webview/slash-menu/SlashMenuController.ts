/**
 * SlashMenuController — State machine + orchestration for Slash Command Menu
 * KSA-254
 *
 * States: CLOSED ↔ OPEN ↔ FILTERING
 * Triggered by '/' at position 0 or after whitespace (BR-01, BR-05)
 */

import type {
  SlashMenuState,
  SlashMenuTrigger,
  SlashStateTransition,
  SlashMenuOptions,
  SlashMenuItem,
  SlashSteeringRule,
} from './types';
import { SlashMenuView } from './SlashMenuView';
import {
  SLASH_AGENTS,
  agentsToMenuItems,
  steeringToMenuItems,
  parseSteeringRules,
  filterSlashItems,
} from './SlashMenuItems';

const TRANSITIONS: SlashStateTransition[] = [
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

export class SlashMenuController {
  private state: SlashMenuState = 'CLOSED';
  private view: SlashMenuView;
  private options: SlashMenuOptions;
  private filterText = '';
  private triggerIndex = -1;

  // Data sources
  private agentItems: SlashMenuItem[];
  private steeringRules: SlashSteeringRule[] = [];
  private steeringItems: SlashMenuItem[] = [];

  // Filtered results
  private visibleAgents: SlashMenuItem[];
  private visibleSteering: SlashMenuItem[] = [];

  // Screen reader announcer
  private announcer: HTMLElement | null = null;

  constructor(options: SlashMenuOptions) {
    this.options = options;
    this.view = new SlashMenuView(options.container);
    this.agentItems = agentsToMenuItems(SLASH_AGENTS);
    this.visibleAgents = [...this.agentItems];
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

  private transition(trigger: SlashMenuTrigger): boolean {
    const valid = TRANSITIONS.find((t) => t.from === this.state && t.trigger === trigger);
    if (!valid) return false;
    this.state = valid.to;
    return true;
  }

  getState(): SlashMenuState {
    return this.state;
  }

  isOpen(): boolean {
    return this.state !== 'CLOSED';
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
   * Check if '/' at the given position is a valid trigger (BR-01, BR-05)
   * Valid: position 0 OR preceded by whitespace
   * Invalid: mid-word (e.g., "http://")
   */
  isValidTrigger(text: string, slashPos: number): boolean {
    if (slashPos === 0) return true;
    const charBefore = text[slashPos - 1];
    return charBefore === ' ' || charBefore === '\t' || charBefore === '\n';
  }

  /**
   * Open the slash popup at the given trigger position
   */
  open(triggerIndex: number): void {
    if (!this.transition('SLASH_TYPED')) return;
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
    this.transition('DISMISS');
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
      this.transition('FILTER_CLEARED');
      this.visibleAgents = [...this.agentItems];
      this.visibleSteering = [...this.steeringItems];
    } else {
      if (this.state === 'OPEN') this.transition('CHAR_TYPED');
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
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.view.moveHighlight('down');
        return true;
      case 'ArrowUp':
        event.preventDefault();
        this.view.moveHighlight('up');
        return true;
      case 'Enter':
      case 'Tab':
        event.preventDefault();
        this.selectHighlighted();
        return true;
      case 'Escape':
        event.preventDefault();
        this.close();
        return true;
      default:
        return false;
    }
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
    if (item.itemType === 'agent') {
      this.transition('AGENT_SELECTED');
      this.view.destroy();
      this.options.onAgentSelect(item.agentName!);
      this.announce(`Agent selected: ${item.label}`);
    } else if (item.itemType === 'steering') {
      this.transition('STEERING_SELECTED');
      this.view.destroy();
      const rule = this.steeringRules.find((r) => r.name === item.label);
      if (rule) {
        this.options.onSteeringSelect(rule);
        this.announce(`Steering rule attached: ${item.label}`);
      }
    }
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
