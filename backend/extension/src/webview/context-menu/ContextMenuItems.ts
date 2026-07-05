/**
 * Static menu item definitions for the Context Menu
 * KSA-252
 */

import type { ContextMenuItem } from '../protocol';

export const CONTEXT_MENU_ITEMS: ContextMenuItem[] = [
  {
    id: 'files',
    label: 'Files',
    icon: '📁',
    type: 'picker',
    subLabel: 'Browse workspace files',
  },
  {
    id: 'spec',
    label: 'Spec',
    icon: '📄',
    type: 'picker',
    subLabel: 'Kiro specifications',
  },
  {
    id: 'git-diff',
    label: 'Git Diff',
    icon: '➕',
    type: 'instant',
    subLabel: 'Current changes',
  },
  {
    id: 'terminal',
    label: 'Terminal',
    icon: '💻',
    type: 'instant',
    subLabel: 'Recent output',
  },
  {
    id: 'problems',
    label: 'Problems',
    icon: '⚠️',
    type: 'instant',
    subLabel: 'Diagnostics',
  },
  {
    id: 'folder',
    label: 'Folder',
    icon: '📂',
    type: 'picker',
    subLabel: 'Browse folders',
  },
  {
    id: 'current-file',
    label: 'Current File',
    icon: '📝',
    type: 'instant',
    subLabel: 'Active editor file',
  },
  {
    id: 'steering',
    label: 'Steering',
    icon: '🎯',
    type: 'picker',
    subLabel: 'Steering files',
  },
  {
    id: 'mcp',
    label: 'MCP',
    icon: '💎',
    type: 'submenu',
    subLabel: 'Model Context Protocol →',
  },
];
