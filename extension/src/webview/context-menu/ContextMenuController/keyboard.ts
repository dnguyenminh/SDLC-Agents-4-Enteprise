/**
 * Context-menu keyboard navigation (KSA-252).
 * Picker keys are delegated by the controller before this dispatch runs.
 */

import { ContextMenuView } from '../ContextMenuView';

/** Arrow/Enter/Escape/Tab dispatch for the menu list itself. */
export function handleMenuKeyDown(
  event: KeyboardEvent,
  deps: {
    view: ContextMenuView;
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
      event.preventDefault();
      deps.onSelectHighlighted();
      return true;
    case 'Escape':
      event.preventDefault();
      deps.onClose();
      return true;
    case 'Tab':
      deps.onClose();
      return false; // Let tab propagate
    default:
      return false;
  }
}
