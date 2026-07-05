/**
 * Context Menu types — KSA-252
 */

import type { ContextMenuItem, ContextSourceType } from '../protocol';

export type ContextMenuState = 'CLOSED' | 'OPEN' | 'FILTERING' | 'PICKER_OPEN' | 'BADGE_INSERTED';

export type ContextMenuTrigger =
  | 'HASH_TYPED'
  | 'CHAR_TYPED'
  | 'FILTER_CLEARED'
  | 'PICKER_SELECTED'
  | 'INSTANT_SELECTED'
  | 'ITEM_SELECTED'
  | 'BACK'
  | 'DISMISS'
  | 'AUTO';

export interface StateTransition {
  from: ContextMenuState;
  to: ContextMenuState;
  trigger: ContextMenuTrigger;
}

export interface ContextMenuOptions {
  container: HTMLElement;
  inputElement: HTMLElement;
  onBadgeInsert: (badge: import('../protocol').ContextTagBadge) => void;
  onClose: () => void;
}

export interface PickerItem {
  id: string;
  label: string;
  path?: string;
  icon?: string;
  type?: 'file' | 'directory';
  children?: PickerItem[];
  description?: string;
}

export interface FuzzyMatchResult {
  match: boolean;
  score: number;
  highlights: number[];
}

export { ContextMenuItem, ContextSourceType };
