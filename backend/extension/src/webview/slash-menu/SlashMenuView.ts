/**
 * SlashMenuView — DOM rendering for the slash command popup
 * KSA-254
 *
 * Two-section layout: Agents (top) + Steering Rules (bottom)
 * Section headers are non-selectable (BR-08, BR-20)
 * Max height 400px, scrollable (TDD §7)
 */

import type { SlashMenuItem } from './types';

export class SlashMenuView {
  private container: HTMLElement;
  private menuEl: HTMLElement | null = null;
  private highlightedIndex = -1;
  private selectableItems: SlashMenuItem[] = [];

  constructor(container: HTMLElement) {
    this.container = container;
  }

  /**
   * Render the two-section popup (BR-06: Agents first, Steering second)
   */
  render(
    agents: SlashMenuItem[],
    steering: SlashMenuItem[],
    anchorRect: DOMRect
  ): void {
    this.destroy();
    this.selectableItems = [...agents, ...steering];

    this.menuEl = document.createElement('div');
    this.menuEl.id = 'slash-command-popup';
    this.menuEl.className = 'context-menu slash-menu';
    this.menuEl.setAttribute('role', 'listbox');
    this.menuEl.setAttribute('aria-label', 'Slash commands');

    // Agents section
    if (agents.length > 0) {
      this.menuEl.appendChild(this.createSectionHeader('AGENTS'));
      agents.forEach((item, index) => {
        const el = this.createItemElement(item, index);
        this.menuEl!.appendChild(el);
      });
    }

    // Steering section
    if (steering.length > 0) {
      this.menuEl.appendChild(this.createSectionHeader('STEERING RULES'));
      steering.forEach((item, index) => {
        const globalIndex = agents.length + index;
        const el = this.createItemElement(item, globalIndex);
        this.menuEl!.appendChild(el);
      });
    }

    // No items at all
    if (agents.length === 0 && steering.length === 0) {
      this.showEmptyState();
    }

    // Position above input
    this.menuEl.style.position = 'absolute';
    this.menuEl.style.bottom = `${this.container.clientHeight - anchorRect.top + 4}px`;
    this.menuEl.style.left = `${anchorRect.left}px`;
    this.menuEl.style.maxHeight = '400px';
    this.menuEl.style.overflowY = 'auto';
    this.container.appendChild(this.menuEl);

    // Highlight first item (BR-11)
    if (this.selectableItems.length > 0) {
      this.setHighlight(0);
    }
  }

  /**
   * Update items after filter change (BR-14: hide empty section headers)
   */
  updateItems(agents: SlashMenuItem[], steering: SlashMenuItem[]): void {
    if (!this.menuEl) return;
    this.selectableItems = [...agents, ...steering];
    this.menuEl.innerHTML = '';

    if (agents.length > 0) {
      this.menuEl.appendChild(this.createSectionHeader('AGENTS'));
      agents.forEach((item, index) => {
        this.menuEl!.appendChild(this.createItemElement(item, index));
      });
    }

    if (steering.length > 0) {
      this.menuEl.appendChild(this.createSectionHeader('STEERING RULES'));
      steering.forEach((item, index) => {
        const globalIndex = agents.length + index;
        this.menuEl!.appendChild(this.createItemElement(item, globalIndex));
      });
    }

    if (agents.length === 0 && steering.length === 0) {
      this.showEmptyState();
      this.highlightedIndex = -1;
    } else {
      this.setHighlight(0);
    }
  }

  private createSectionHeader(text: string): HTMLElement {
    const header = document.createElement('div');
    header.className = 'slash-menu__section-header';
    header.setAttribute('role', 'presentation');
    header.textContent = text;
    return header;
  }

  private createItemElement(item: SlashMenuItem, index: number): HTMLElement {
    const el = document.createElement('div');
    el.className = 'context-menu-item slash-menu__item';
    el.setAttribute('role', 'option');
    el.setAttribute('aria-selected', 'false');
    el.dataset.index = String(index);
    el.dataset.itemId = item.id;

    const descHtml = item.description
      ? `<span class="context-menu-item__sublabel">${this.escapeHtml(item.description)}</span>`
      : '';

    el.innerHTML = `
      <span class="context-menu-item__icon">${item.icon}</span>
      <span class="context-menu-item__label">${this.escapeHtml(item.label)}</span>
      ${descHtml}
    `;
    return el;
  }

  private showEmptyState(): void {
    if (!this.menuEl) return;
    const empty = document.createElement('div');
    empty.className = 'context-menu-empty';
    empty.textContent = 'No matching commands';
    this.menuEl.appendChild(empty);
  }

  setHighlight(index: number): void {
    if (!this.menuEl) return;
    // Clear previous
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

  /**
   * Move highlight up/down, wrapping at boundaries (BR-18, BR-19)
   * Section headers are automatically skipped (they have no .context-menu-item class)
   */
  moveHighlight(direction: 'up' | 'down'): number {
    const count = this.selectableItems.length;
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

  getHighlightedItem(): SlashMenuItem | null {
    if (this.highlightedIndex >= 0 && this.highlightedIndex < this.selectableItems.length) {
      return this.selectableItems[this.highlightedIndex];
    }
    return null;
  }

  getItemAtIndex(index: number): SlashMenuItem | null {
    return this.selectableItems[index] ?? null;
  }

  getSelectableCount(): number {
    return this.selectableItems.length;
  }

  isVisible(): boolean {
    return this.menuEl !== null && this.menuEl.parentElement !== null;
  }

  destroy(): void {
    if (this.menuEl && this.menuEl.parentElement) {
      this.menuEl.parentElement.removeChild(this.menuEl);
    }
    this.menuEl = null;
    this.highlightedIndex = -1;
    this.selectableItems = [];
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
