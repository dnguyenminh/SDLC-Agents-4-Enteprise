/**
 * FolderPicker — Folder tree picker
 * KSA-252
 */

import type { FolderTreeNode, ContextTagBadge } from '../protocol';
import { MessageBridge } from '../bridge/MessageBridge';
import { PickerPanel } from './PickerPanel';
import type { PickerItem } from './types';

export class FolderPicker {
  private bridge: MessageBridge;
  private panel: PickerPanel | null = null;
  private container: HTMLElement;
  private onSelect: (badge: ContextTagBadge) => void;
  private onBack: () => void;
  private generateId: () => string;

  constructor(options: {
    bridge: MessageBridge;
    container: HTMLElement;
    onSelect: (badge: ContextTagBadge) => void;
    onBack: () => void;
    generateId: () => string;
  }) {
    this.bridge = options.bridge;
    this.container = options.container;
    this.onSelect = options.onSelect;
    this.onBack = options.onBack;
    this.generateId = options.generateId;
  }

  async open(): Promise<void> {
    let folders: FolderTreeNode[];
    try {
      folders = await this.bridge.getFolderTree();
    } catch {
      folders = [];
    }

    const items = this.flattenFolders(folders);

    this.panel = new PickerPanel({
      container: this.container,
      title: 'Select Folder',
      items,
      onSelect: (item) => this.handleSelect(item),
      onBack: () => this.close(),
      searchable: true,
      multiSelect: false,
    });
    this.panel.render();
  }

  private flattenFolders(nodes: FolderTreeNode[], prefix = ''): PickerItem[] {
    const result: PickerItem[] = [];
    for (const node of nodes) {
      const relativePath = prefix ? `${prefix}/${node.name}` : node.name;
      result.push({
        id: relativePath,
        label: relativePath,
        path: relativePath,
        type: 'directory',
        icon: '\u{1F4C2}',
      });
      if (node.children) {
        result.push(...this.flattenFolders(node.children, relativePath));
      }
    }
    return result;
  }

  private handleSelect(item: PickerItem): void {
    const badge: ContextTagBadge = {
      id: this.generateId(),
      type: 'folder',
      label: `Folder: ${item.path || item.label}`,
      icon: '\u{1F4C2}',
      metadata: { folderPath: item.path || item.label },
    };
    this.onSelect(badge);
    this.close();
  }

  handleKeyDown(event: KeyboardEvent): boolean {
    return this.panel?.handleKeyDown(event) ?? false;
  }

  close(): void {
    this.panel?.destroy();
    this.panel = null;
    this.onBack();
  }

  isVisible(): boolean {
    return this.panel?.isVisible() ?? false;
  }
}
