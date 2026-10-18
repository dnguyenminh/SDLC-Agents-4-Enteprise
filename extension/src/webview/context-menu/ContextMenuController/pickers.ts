/**
 * Context-menu picker flows (KSA-252).
 * Opens FilePicker / FolderPicker / ListPicker with badge + back navigation.
 */

import type { ContextMenuItem, ContextTagBadge } from '../../protocol';
import { BadgeManager } from '../../badges/BadgeManager';
import { ContextMenuView } from '../ContextMenuView';
import { FilePicker } from '../FilePicker';
import { FolderPicker } from '../FolderPicker';
import { ListPicker } from '../ListPicker';
import { MessageBridge } from '../../bridge/MessageBridge';
import type { ContextMenuStateMachine } from './transitions';

export interface PickerFlowContext {
  bridge: MessageBridge;
  container: HTMLElement;
  inputElement: HTMLElement;
  visibleItems: ContextMenuItem[];
  view: ContextMenuView;
  sm: ContextMenuStateMachine;
  badgeManager: BadgeManager;
  insertBadge: (badge: ContextTagBadge) => void;
  onClose: () => void;
  /** Register the active picker on the controller (before open() runs). */
  assign: (p: { filePicker?: FilePicker; folderPicker?: FolderPicker; listPicker?: ListPicker }) => void;
}

/** Open the picker matching the selected item and await its completion. */
export async function openPickerFlow(item: ContextMenuItem, ctx: PickerFlowContext): Promise<void> {
  ctx.sm.transition('PICKER_SELECTED');
  ctx.view.destroy();

  const container = ctx.container;
  const handleBadge = (badge: ContextTagBadge) => {
    ctx.insertBadge(badge);
    ctx.sm.transition('ITEM_SELECTED');
    ctx.sm.transition('AUTO');
    ctx.onClose();
  };
  const handleBack = () => {
    ctx.sm.transition('BACK');
    const rect = ctx.inputElement.getBoundingClientRect();
    ctx.view.render(ctx.visibleItems, rect);
  };
  const generateId = () => ctx.badgeManager.generateId();

  switch (item.id) {
    case 'files': {
      const picker = new FilePicker({ bridge: ctx.bridge, container, onSelect: handleBadge, onBack: handleBack, generateId });
      ctx.assign({ filePicker: picker });
      await picker.open();
      break;
    }
    case 'folder': {
      const picker = new FolderPicker({ bridge: ctx.bridge, container, onSelect: handleBadge, onBack: handleBack, generateId });
      ctx.assign({ folderPicker: picker });
      await picker.open();
      break;
    }
    case 'spec':
    case 'steering':
    case 'mcp': {
      const picker = new ListPicker({ bridge: ctx.bridge, container, sourceType: item.id, onSelect: handleBadge, onBack: handleBack, generateId });
      ctx.assign({ listPicker: picker });
      await picker.open();
      break;
    }
  }
}
