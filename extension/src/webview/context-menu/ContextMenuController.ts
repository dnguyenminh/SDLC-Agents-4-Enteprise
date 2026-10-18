/**
 * ContextMenuController — State machine + orchestration for Context Menu
 * KSA-252
 *
 * State machine, announcer, badge ops and picker flows live in ./ContextMenuController/*.
 */

import type { ContextMenuItem, ContextTagBadge } from '../protocol';
import type { ContextMenuOptions, ContextMenuState } from './types';
import { ContextMenuView } from './ContextMenuView';
import { CONTEXT_MENU_ITEMS } from './ContextMenuItems';
import { filterItems } from './FuzzyFilter';
import { BadgeManager } from '../badges/BadgeManager';
import { BadgeRenderer } from '../badges/BadgeRenderer';
import { MessageBridge } from '../bridge/MessageBridge';
import { FilePicker } from './FilePicker';
import { FolderPicker } from './FolderPicker';
import { ListPicker } from './ListPicker';
import { ContextMenuStateMachine } from './ContextMenuController/transitions';
import { announceVia, ensureAnnouncer } from './ContextMenuController/announcer';
import { createInstantBadge, insertBadge, removeBadge } from './ContextMenuController/badges';
import { openPickerFlow } from './ContextMenuController/pickers';
import { handleMenuKeyDown } from './ContextMenuController/keyboard';

export class ContextMenuController {
  private sm = new ContextMenuStateMachine();
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

  private announcer: HTMLElement | null = null;

  constructor(options: ContextMenuOptions, bridge: MessageBridge) {
    this.options = options;
    this.bridge = bridge;
    this.view = new ContextMenuView(options.container);
    this.badgeManager = new BadgeManager(bridge);
    this.badgeRenderer = new BadgeRenderer((badgeId) => this.removeBadge(badgeId));
    this.announcer = ensureAnnouncer();
  }

  private announce(message: string): void {
    announceVia(this.announcer, message);
  }

  getState(): ContextMenuState {
    return this.sm.current;
  }

  open(): void {
    if (!this.sm.transition('HASH_TYPED')) return;
    this.filterText = '';
    this.visibleItems = [...CONTEXT_MENU_ITEMS];

    const rect = this.options.inputElement.getBoundingClientRect();
    this.view.render(this.visibleItems, rect);
    this.announce('Context menu opened. 9 items available. Use arrow keys to navigate.');
  }

  close(): void {
    this.sm.transition('DISMISS');
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
      this.sm.transition('FILTER_CLEARED');
      this.visibleItems = [...CONTEXT_MENU_ITEMS];
    } else {
      if (this.sm.current === 'OPEN') this.sm.transition('CHAR_TYPED');
      const filtered = filterItems(CONTEXT_MENU_ITEMS, text);
      this.visibleItems = filtered;
    }
    this.view.updateItems(this.visibleItems);
    this.announce(`${this.visibleItems.length} items match.`);
  }

  handleKeyDown(event: KeyboardEvent): boolean {
    // Delegate to active picker first
    if (this.sm.current === 'PICKER_OPEN') {
      if (this.filePicker?.handleKeyDown(event)) return true;
      if (this.folderPicker?.handleKeyDown(event)) return true;
      if (this.listPicker?.handleKeyDown(event)) return true;
    }
    return handleMenuKeyDown(event, {
      view: this.view,
      onSelectHighlighted: () => this.selectHighlighted(),
      onClose: () => this.close(),
    });
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
        void this.openPicker(item);
        break;
    }
  }

  private selectInstant(item: ContextMenuItem): void {
    this.sm.transition('INSTANT_SELECTED');
    const badge = this.createInstantBadge(item);
    this.insertBadge(badge);
    this.sm.transition('AUTO');
    this.view.destroy();
    this.options.onClose();
  }

  private async openPicker(item: ContextMenuItem): Promise<void> {
    await openPickerFlow(item, {
      bridge: this.bridge,
      container: this.options.container,
      inputElement: this.options.inputElement,
      visibleItems: this.visibleItems,
      view: this.view,
      sm: this.sm,
      badgeManager: this.badgeManager,
      insertBadge: (badge) => this.insertBadge(badge),
      onClose: () => this.options.onClose(),
      assign: (p) => {
        if (p.filePicker) { this.filePicker = p.filePicker; }
        if (p.folderPicker) { this.folderPicker = p.folderPicker; }
        if (p.listPicker) { this.listPicker = p.listPicker; }
      },
    });
  }

  private createInstantBadge(item: ContextMenuItem): ContextTagBadge {
    return createInstantBadge(item, () => this.badgeManager.generateId());
  }

  private insertBadge(badge: ContextTagBadge): void {
    insertBadge(badge, {
      badgeManager: this.badgeManager,
      onBadgeInsert: (b) => this.options.onBadgeInsert(b),
      announce: (message) => this.announce(message),
    });
  }

  private removeBadge(badgeId: string): void {
    removeBadge(badgeId, {
      badgeManager: this.badgeManager,
      container: this.options.container,
      announce: (message) => this.announce(message),
    });
  }

  getBadgeManager(): BadgeManager {
    return this.badgeManager;
  }

  getBadgeRenderer(): BadgeRenderer {
    return this.badgeRenderer;
  }

  isOpen(): boolean {
    return this.sm.isOpen();
  }

  dispose(): void {
    this.close();
    this.bridge.dispose();
  }
}
