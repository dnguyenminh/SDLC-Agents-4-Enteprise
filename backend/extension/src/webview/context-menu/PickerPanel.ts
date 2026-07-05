/**
 * PickerPanel — Base panel renderer for secondary pickers
 * KSA-252
 */

import type { PickerItem } from './types';

export interface PickerPanelOptions {
  container: HTMLElement;
  title: string;
  items: PickerItem[];
  onSelect: (item: PickerItem) => void;
  onBack: () => void;
  searchable?: boolean;
  multiSelect?: boolean;
}

export class PickerPanel {
  private container: HTMLElement;
  private panelEl: HTMLElement | null = null;
  private items: PickerItem[] = [];
  private filteredItems: PickerItem[] = [];
  private highlightIndex = 0;
  private onSelect: (item: PickerItem) => void;
  private onBack: () => void;
  private searchable: boolean;
  private multiSelect: boolean;
  private selectedIds: Set<string> = new Set();
  private searchInput: HTMLInputElement | null = null;

  constructor(options: PickerPanelOptions) {
    this.container = options.container;
    this.items = options.items;
    this.filteredItems = [...options.items];
    this.onSelect = options.onSelect;
    this.onBack = options.onBack;
    this.searchable = options.searchable ?? true;
    this.multiSelect = options.multiSelect ?? false;
  }

  render(): void {
    this.destroy();
    this.panelEl = document.createElement('div');
    this.panelEl.className = 'picker-panel';

    // Header with back button
    const header = document.createElement('div');
    header.className = 'picker-panel__header';
    const backBtn = document.createElement('button');
    backBtn.className = 'picker-panel__back';
    backBtn.textContent = '\u2190 Back';
    backBtn.setAttribute('aria-label', 'Back to context menu');
    backBtn.addEventListener('click', () => this.onBack());
    header.appendChild(backBtn);
    this.panelEl.appendChild(header);

    // Search input
    if (this.searchable) {
      this.searchInput = document.createElement('input');
      this.searchInput.className = 'picker-panel__search';
      this.searchInput.type = 'text';
      this.searchInput.placeholder = 'Type to filter...';
      this.searchInput.addEventListener('input', () => this.filterList());
      this.panelEl.appendChild(this.searchInput);
    }

    // Item list
    const list = document.createElement('div');
    list.className = 'picker-panel__list';
    list.setAttribute('role', 'listbox');
    this.renderItems(list);
    this.panelEl.appendChild(list);

    // Multi-select confirm button
    if (this.multiSelect) {
      const confirmBtn = document.createElement('button');
      confirmBtn.className = 'picker-panel__confirm';
      confirmBtn.textContent = 'Confirm Selection';
      confirmBtn.addEventListener('click', () => this.confirmSelection());
      this.panelEl.appendChild(confirmBtn);
    }

    this.container.appendChild(this.panelEl);

    if (this.searchInput) {
      this.searchInput.focus();
    }
  }

  private renderItems(listEl: HTMLElement): void {
    listEl.innerHTML = '';
    this.filteredItems.forEach((item, index) => {
      const el = document.createElement('div');
      el.className = 'picker-panel__item';
      if (index === this.highlightIndex) el.classList.add('picker-panel__item--highlighted');
      if (this.selectedIds.has(item.id)) el.classList.add('picker-panel__item--selected');
      el.setAttribute('role', 'option');
      el.dataset.index = String(index);

      const icon = item.icon || (item.type === 'directory' ? '\u{1F4C1}' : '\u{1F4C4}');
      el.innerHTML = `<span class="picker-item__icon">${icon}</span><span class="picker-item__label">${this.escapeHtml(item.label)}</span>`;

      el.addEventListener('click', () => {
        if (this.multiSelect) {
          this.toggleSelection(item);
          el.classList.toggle('picker-panel__item--selected');
        } else {
          this.onSelect(item);
        }
      });
      listEl.appendChild(el);
    });

    if (this.filteredItems.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'picker-panel__empty';
      empty.textContent = 'No items found';
      listEl.appendChild(empty);
    }
  }

  private filterList(): void {
    const query = this.searchInput?.value.toLowerCase() || '';
    if (!query) {
      this.filteredItems = [...this.items];
    } else {
      this.filteredItems = this.items.filter(item =>
        item.label.toLowerCase().includes(query) ||
        (item.path && item.path.toLowerCase().includes(query))
      );
    }
    this.highlightIndex = 0;
    const list = this.panelEl?.querySelector('.picker-panel__list');
    if (list) this.renderItems(list as HTMLElement);
  }

  private toggleSelection(item: PickerItem): void {
    if (this.selectedIds.has(item.id)) {
      this.selectedIds.delete(item.id);
    } else {
      this.selectedIds.add(item.id);
    }
  }

  private confirmSelection(): void {
    const selected = this.items.filter(i => this.selectedIds.has(i.id));
    selected.forEach(item => this.onSelect(item));
  }

  handleKeyDown(event: KeyboardEvent): boolean {
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.highlightIndex = Math.min(this.highlightIndex + 1, this.filteredItems.length - 1);
        this.updateHighlight();
        return true;
      case 'ArrowUp':
        event.preventDefault();
        this.highlightIndex = Math.max(this.highlightIndex - 1, 0);
        this.updateHighlight();
        return true;
      case 'Enter':
        event.preventDefault();
        if (this.filteredItems[this.highlightIndex]) {
          if (this.multiSelect) {
            this.toggleSelection(this.filteredItems[this.highlightIndex]);
            this.updateHighlight();
          } else {
            this.onSelect(this.filteredItems[this.highlightIndex]);
          }
        }
        return true;
      case 'Escape':
        event.preventDefault();
        this.onBack();
        return true;
      default:
        return false;
    }
  }

  private updateHighlight(): void {
    const list = this.panelEl?.querySelector('.picker-panel__list');
    if (list) this.renderItems(list as HTMLElement);
  }

  destroy(): void {
    if (this.panelEl && this.panelEl.parentElement) {
      this.panelEl.parentElement.removeChild(this.panelEl);
    }
    this.panelEl = null;
    this.searchInput = null;
    this.selectedIds.clear();
  }

  isVisible(): boolean {
    return this.panelEl !== null;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
