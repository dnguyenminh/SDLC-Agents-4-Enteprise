/**
 * ContextMenuController — State machine + orchestration for Context Menu
 * KSA-252
 */

import type { ContextMenuItem, ContextTagBadge } from '../protocol';
import type { ContextMenuState, ContextMenuTrigger, StateTransition, ContextMenuOptions } from './types';
import { ContextMenuView } from './ContextMenuView';
import { CONTEXT_MENU_ITEMS } from './ContextMenuItems';
import { filterItems } from './FuzzyFilter';
import { BadgeManager } from '../badges/BadgeManager';
import { BadgeRenderer } from '../badges/BadgeRenderer';
import { MessageBridge } from '../bridge/MessageBridge';
import { FilePicker } from './FilePicker';
import { FolderPicker } from './FolderPicker';
import { ListPicker } from './ListPicker';

const TRANSITIONS: StateTransition[] = [
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

export class ContextMenuController {
  private state: ContextMenuState = 'CLOSED';
  private view: ContextMenuView;
  private badgeManager: BadgeManager;
  private badgeRenderer: BadgeRenderer;
  private bridge: MessageBridge;
  private filterText = '';
  private visibleItems: ContextMenuItem[] = [...CONTEXT_MENU_ITEMS];
  private options: ContextMenuOptions;

  // Active picker
  private filePicker: FilePicker | null = null;
  private folderPicker: FolderPicker | null = null;
  private listPicker: ListPicker | null = null;

  // Screen reader announcer
  private announcer: HTMLElement | null = null;

  constructor(options: ContextMenuOptions, bridge: MessageBridge) {
    this.options = options;
    this.bridge = bridge;
    this.view = new ContextMenuView(options.container);
    this.badgeManager = new BadgeManager(bridge);
    this.badgeRenderer = new BadgeRenderer((badgeId) => this.removeBadge(badgeId));
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

  private transition(trigger: ContextMenuTrigger): boolean {
    const valid = TRANSITIONS.find(t => t.from === this.state && t.trigger === trigger);
    if (!valid) return false;
    this.state = valid.to;
    return true;
  }

  getState(): ContextMenuState {
    return this.state;
  }

  open(): void {
    if (!this.transition('HASH_TYPED')) return;
    this.filterText = '';
    this.visibleItems = [...CONTEXT_MENU_ITEMS];

    const rect = this.options.inputElement.getBoundingClientRect();
    this.view.render(this.visibleItems, rect);
    this.announce('Context menu opened. 9 items available. Use arrow keys to navigate.');
  }

  close(): void {
    this.transition('DISMISS');
    this.view.destroy();
    this.filePicker?.close();
    this.folderPicker?.close();
    this.listPicker?.close();
    this.filePicker = null;
    this.folderPicker = null;
    this.listPicker = null;
    this.filterText = '';
    this.options.onClose();
  }

  filter(text: string): void {
    this.filterText = text;
    if (!text) {
      this.transition('FILTER_CLEARED');
      this.visibleItems = [...CONTEXT_MENU_ITEMS];
    } else {
      if (this.state === 'OPEN') this.transition('CHAR_TYPED');
      const filtered = filterItems(CONTEXT_MENU_ITEMS, text);
      this.visibleItems = filtered;
    }
    this.view.updateItems(this.visibleItems);
    this.announce(`${this.visibleItems.length} items match.`);
  }

  handleKeyDown(event: KeyboardEvent): boolean {
    // Delegate to active picker first
    if (this.state === 'PICKER_OPEN') {
      if (this.filePicker?.handleKeyDown(event)) return true;
      if (this.folderPicker?.handleKeyDown(event)) return true;
      if (this.listPicker?.handleKeyDown(event)) return true;
    }

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
        event.preventDefault();
        this.selectHighlighted();
        return true;
      case 'Escape':
        event.preventDefault();
        this.close();
        return true;
      case 'Tab':
        this.close();
        return false; // Let tab propagate
      default:
        return false;
    }
  }

  handleItemClick(index: number): void {
    const item = this.view.getItemAtIndex(index);
    if (item) this.selectItem(item);
  }

  private selectHighlighted(): void {
    const item = this.view.getHighlightedItem();
    if (item) this.selectItem(item);
  }

  private selectItem(item: ContextMenuItem): void {
    switch (item.type) {
      case 'instant':
        this.selectInstant(item);
        break;
      case 'picker':
      case 'submenu':
        this.openPicker(item);
        break;
    }
  }

  private selectInstant(item: ContextMenuItem): void {
    this.transition('INSTANT_SELECTED');
    const badge = this.createInstantBadge(item);
    this.insertBadge(badge);
    this.transition('AUTO');
    this.view.destroy();
    this.options.onClose();
  }

  private async openPicker(item: ContextMenuItem): Promise<void> {
    this.transition('PICKER_SELECTED');
    this.view.destroy();

    const container = this.options.container;
    const handleBadge = (badge: ContextTagBadge) => {
      this.insertBadge(badge);
      this.transition('ITEM_SELECTED');
      this.transition('AUTO');
      this.options.onClose();
    };
    const handleBack = () => {
      this.transition('BACK');
      const rect = this.options.inputElement.getBoundingClientRect();
      this.view.render(this.visibleItems, rect);
    };
    const generateId = () => this.badgeManager.generateId();

    switch (item.id) {
      case 'files':
        this.filePicker = new FilePicker({ bridge: this.bridge, container, onSelect: handleBadge, onBack: handleBack, generateId });
        await this.filePicker.open();
        break;
      case 'folder':
        this.folderPicker = new FolderPicker({ bridge: this.bridge, container, onSelect: handleBadge, onBack: handleBack, generateId });
        await this.folderPicker.open();
        break;
      case 'spec':
      case 'steering':
      case 'mcp':
        this.listPicker = new ListPicker({ bridge: this.bridge, container, sourceType: item.id, onSelect: handleBadge, onBack: handleBack, generateId });
        await this.listPicker.open();
        break;
    }
  }

  private createInstantBadge(item: ContextMenuItem): ContextTagBadge {
    const id = this.badgeManager.generateId();
    switch (item.id) {
      case 'git-diff':
        return { id, type: 'git-diff', label: 'Git Diff', icon: item.icon, metadata: {} };
      case 'terminal':
        return { id, type: 'terminal', label: 'Terminal', icon: item.icon, metadata: {} };
      case 'problems':
        return { id, type: 'problems', label: 'Problems', icon: item.icon, metadata: {} };
      case 'current-file':
        return { id, type: 'current-file', label: 'Current File', icon: item.icon, metadata: {} };
      default:
        return { id, type: item.id as any, label: item.label, icon: item.icon, metadata: {} };
    }
  }

  private insertBadge(badge: ContextTagBadge): void {
    this.badgeManager.insert(badge);
    this.options.onBadgeInsert(badge);
    this.announce(`Context added: ${badge.label}`);
  }

  private removeBadge(badgeId: string): void {
    const badge = this.badgeManager.get(badgeId);
    this.badgeManager.remove(badgeId);
    BadgeRenderer.removeBadgeElement(this.options.container, badgeId);
    if (badge) this.announce(`Context removed: ${badge.label}`);
  }

  getBadgeManager(): BadgeManager {
    return this.badgeManager;
  }

  getBadgeRenderer(): BadgeRenderer {
    return this.badgeRenderer;
  }

  isOpen(): boolean {
    return this.state !== 'CLOSED';
  }

  dispose(): void {
    this.close();
    this.bridge.dispose();
  }
}
