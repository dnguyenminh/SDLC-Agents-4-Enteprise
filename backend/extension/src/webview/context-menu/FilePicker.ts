/**
 * FilePicker — File tree picker with fuzzy search
 * KSA-252
 */

import type { FileTreeNode, ContextTagBadge } from '../protocol';
import { MessageBridge } from '../bridge/MessageBridge';
import { PickerPanel } from './PickerPanel';
import type { PickerItem } from './types';

export class FilePicker {
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
    let files: FileTreeNode[];
    try {
      files = await this.bridge.getFileTree();
    } catch {
      files = [];
    }

    const items = this.flattenTree(files);

    this.panel = new PickerPanel({
      container: this.container,
      title: 'Select Files',
      items,
      onSelect: (item) => this.handleSelect(item),
      onBack: () => this.close(),
      searchable: true,
      multiSelect: true,
    });
    this.panel.render();
  }

  private flattenTree(nodes: FileTreeNode[], prefix = ''): PickerItem[] {
    const result: PickerItem[] = [];
    for (const node of nodes) {
      const relativePath = prefix ? `${prefix}/${node.name}` : node.name;
      if (node.type === 'file') {
        result.push({
          id: relativePath,
          label: node.name,
          path: relativePath,
          type: 'file',
          icon: '\u{1F4C4}',
        });
      }
      if (node.children) {
        result.push(...this.flattenTree(node.children, relativePath));
      }
    }
    return result;
  }

  private handleSelect(item: PickerItem): void {
    const badge: ContextTagBadge = {
      id: this.generateId(),
      type: 'files',
      label: `File: ${item.path || item.label}`,
      icon: '\u{1F4C1}',
      metadata: { filePaths: [item.path || item.label] },
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
