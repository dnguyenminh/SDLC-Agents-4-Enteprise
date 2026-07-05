/**
 * ListPicker — Simple list picker for Spec, Steering, MCP
 * KSA-252
 */

import type { ContextTagBadge, ContextSourceType, McpResourceItem } from '../protocol';
import { MessageBridge } from '../bridge/MessageBridge';
import { PickerPanel } from './PickerPanel';
import type { PickerItem } from './types';

export class ListPicker {
  private bridge: MessageBridge;
  private panel: PickerPanel | null = null;
  private container: HTMLElement;
  private onSelect: (badge: ContextTagBadge) => void;
  private onBack: () => void;
  private generateId: () => string;
  private sourceType: ContextSourceType;

  constructor(options: {
    bridge: MessageBridge;
    container: HTMLElement;
    sourceType: ContextSourceType;
    onSelect: (badge: ContextTagBadge) => void;
    onBack: () => void;
    generateId: () => string;
  }) {
    this.bridge = options.bridge;
    this.container = options.container;
    this.sourceType = options.sourceType;
    this.onSelect = options.onSelect;
    this.onBack = options.onBack;
    this.generateId = options.generateId;
  }

  async open(): Promise<void> {
    let items: PickerItem[];

    switch (this.sourceType) {
      case 'spec':
        items = await this.loadSpecs();
        break;
      case 'steering':
        items = await this.loadSteering();
        break;
      case 'mcp':
        items = await this.loadMcp();
        break;
      default:
        items = [];
    }

    this.panel = new PickerPanel({
      container: this.container,
      title: this.getTitle(),
      items,
      onSelect: (item) => this.handleSelect(item),
      onBack: () => this.close(),
      searchable: true,
      multiSelect: false,
    });
    this.panel.render();
  }

  private getTitle(): string {
    switch (this.sourceType) {
      case 'spec': return 'Select Spec';
      case 'steering': return 'Select Steering File';
      case 'mcp': return 'Select MCP Resource';
      default: return 'Select Item';
    }
  }

  private async loadSpecs(): Promise<PickerItem[]> {
    try {
      const specs = await this.bridge.getSpecList();
      return specs.map(name => ({
        id: name,
        label: name,
        icon: '\u{1F4C4}',
      }));
    } catch {
      return [];
    }
  }

  private async loadSteering(): Promise<PickerItem[]> {
    try {
      const files = await this.bridge.getSteeringFiles();
      return files.map(name => ({
        id: name,
        label: name.replace(/\.md$/, ''),
        icon: '\u{1F3AF}',
      }));
    } catch {
      return [];
    }
  }

  private async loadMcp(): Promise<PickerItem[]> {
    try {
      const resources = await this.bridge.getMcpResources();
      return resources.map((r: McpResourceItem) => ({
        id: `${r.server}:${r.name}`,
        label: r.name,
        description: `${r.server} - ${r.type}`,
        icon: '\u{1F48E}',
      }));
    } catch {
      return [];
    }
  }

  private handleSelect(item: PickerItem): void {
    const badge = this.createBadge(item);
    this.onSelect(badge);
    this.close();
  }

  private createBadge(item: PickerItem): ContextTagBadge {
    switch (this.sourceType) {
      case 'spec':
        return {
          id: this.generateId(),
          type: 'spec',
          label: `Spec: ${item.label}`,
          icon: '\u{1F4C4}',
          metadata: { specName: item.id },
        };
      case 'steering':
        return {
          id: this.generateId(),
          type: 'steering',
          label: `Steering: ${item.label}`,
          icon: '\u{1F3AF}',
          metadata: { steeringFile: item.id },
        };
      case 'mcp': {
        const [server, ...rest] = item.id.split(':');
        return {
          id: this.generateId(),
          type: 'mcp',
          label: `MCP: ${item.label}`,
          icon: '\u{1F48E}',
          metadata: { mcpServer: server, mcpResource: rest.join(':') },
        };
      }
      default:
        return {
          id: this.generateId(),
          type: this.sourceType,
          label: item.label,
          icon: '',
          metadata: {},
        };
    }
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
