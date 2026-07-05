/**
 * ContextMenuView — DOM rendering for the context menu popup
 * KSA-252
 */

import type { ContextMenuItem } from '../protocol';

export class ContextMenuView {
  private container: HTMLElement;
  private menuEl: HTMLElement | null = null;
  private itemEls: Map<string, HTMLElement> = new Map();
  private highlightedIndex = -1;
  private visibleItems: ContextMenuItem[] = [];

  constructor(container: HTMLElement) {
    this.container = container;
  }

  render(items: ContextMenuItem[], anchorRect: DOMRect): void {
    this.destroy();
    this.visibleItems = items;
    this.menuEl = document.createElement('div');
    this.menuEl.className = 'context-menu';
    this.menuEl.setAttribute('role', 'listbox');
    this.menuEl.setAttribute('aria-label', 'Context sources');

    items.forEach((item, index) => {
      const itemEl = this.createItemElement(item, index);
      this.menuEl!.appendChild(itemEl);
      this.itemEls.set(item.id, itemEl);
    });

    this.menuEl.style.position = 'absolute';
    this.menuEl.style.bottom = `${this.container.clientHeight - anchorRect.top + 4}px`;
    this.menuEl.style.left = `${anchorRect.left}px`;
    this.menuEl.style.maxHeight = '320px';
    this.menuEl.style.overflowY = 'auto';
    this.container.appendChild(this.menuEl);

    if (items.length > 0) {
      this.setHighlight(0);
    }
  }

  private createItemElement(item: ContextMenuItem, index: number): HTMLElement {
    const el = document.createElement('div');
    el.className = 'context-menu-item';
    el.setAttribute('role', 'option');
    el.setAttribute('aria-selected', 'false');
    el.dataset.index = String(index);
    el.dataset.itemId = item.id;

    const subLabelHtml = item.subLabel
      ? `<span class="context-menu-item__sublabel">${this.escapeHtml(item.subLabel)}</span>`
      : '';
    el.innerHTML = `
      <span class="context-menu-item__icon">${item.icon}</span>
      <span class="context-menu-item__label">${this.escapeHtml(item.label)}</span>
      ${subLabelHtml}
    `;
    return el;
  }

  updateItems(items: ContextMenuItem[]): void {
    if (!this.menuEl) return;
    this.visibleItems = items;
    this.itemEls.clear();
    this.menuEl.innerHTML = '';
    items.forEach((item, index) => {
      const itemEl = this.createItemElement(item, index);
      this.menuEl!.appendChild(itemEl);
      this.itemEls.set(item.id, itemEl);
    });
    if (items.length > 0) {
      this.setHighlight(0);
    } else {
      this.highlightedIndex = -1;
      this.showEmptyState();
    }
  }

  private showEmptyState(): void {
    if (!this.menuEl) return;
    const empty = document.createElement('div');
    empty.className = 'context-menu-empty';
    empty.textContent = 'No matching items';
    this.menuEl.appendChild(empty);
  }

  setHighlight(index: number): void {
    if (!this.menuEl) return;
    const prev = this.menuEl.querySelector('.context-menu-item--highlighted');
    if (prev) {
      prev.classList.remove('context-menu-item--highlighted');
      prev.setAttribute('aria-selected', 'false');
    }
    this.highlightedIndex = index;
    const itemEls = this.menuEl.querySelectorAll('.context-menu-item');
    if (index >= 0 && index < itemEls.length) {
      const el = itemEls[index] as HTMLElement;
      el.classList.add('context-menu-item--highlighted');
      el.setAttribute('aria-selected', 'true');
      el.scrollIntoView({ block: 'nearest' });
    }
  }

  moveHighlight(direction: 'up' | 'down'): number {
    const count = this.visibleItems.length;
    if (count === 0) return -1;
    let next: number;
    if (direction === 'down') {
      next = this.highlightedIndex < count - 1 ? this.highlightedIndex + 1 : 0;
    } else {
      next = this.highlightedIndex > 0 ? this.highlightedIndex - 1 : count - 1;
    }
    this.setHighlight(next);
    return next;
  }

  getHighlightedItem(): ContextMenuItem | null {
    if (this.highlightedIndex >= 0 && this.highlightedIndex < this.visibleItems.length) {
      return this.visibleItems[this.highlightedIndex];
    }
    return null;
  }

  getItemAtIndex(index: number): ContextMenuItem | null {
    return this.visibleItems[index] ?? null;
  }

  isVisible(): boolean {
    return this.menuEl !== null && this.menuEl.parentElement !== null;
  }

  destroy(): void {
    if (this.menuEl && this.menuEl.parentElement) {
      this.menuEl.parentElement.removeChild(this.menuEl);
    }
    this.menuEl = null;
    this.itemEls.clear();
    this.highlightedIndex = -1;
    this.visibleItems = [];
  }

  getElement(): HTMLElement | null {
    return this.menuEl;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
