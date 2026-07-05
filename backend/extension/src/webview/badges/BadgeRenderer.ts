/**
 * BadgeRenderer — DOM rendering for context tag badges
 * KSA-252
 */

import type { ContextTagBadge } from '../protocol';

const ICON_MAP: Record<string, string> = {
  files: '📁',
  spec: '📄',
  'git-diff': '➕',
  terminal: '💻',
  problems: '⚠️',
  folder: '📂',
  'current-file': '📝',
  steering: '🎯',
  mcp: '💎',
};

export class BadgeRenderer {
  private onRemove: (badgeId: string) => void;

  constructor(onRemove: (badgeId: string) => void) {
    this.onRemove = onRemove;
  }

  createBadgeElement(badge: ContextTagBadge): HTMLSpanElement {
    const el = document.createElement('span');
    el.className = 'context-badge';
    el.contentEditable = 'false';
    el.dataset.badgeId = badge.id;
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', `Context: ${badge.label}`);

    const icon = document.createElement('span');
    icon.className = 'badge-icon';
    icon.textContent = ICON_MAP[badge.type] || badge.icon;

    const label = document.createElement('span');
    label.className = 'badge-label';
    label.textContent = badge.label;

    const removeBtn = document.createElement('span');
    removeBtn.className = 'badge-remove';
    removeBtn.textContent = '×';
    removeBtn.setAttribute('aria-label', `Remove ${badge.label} context`);
    removeBtn.dataset.action = 'remove';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onRemove(badge.id);
    });

    el.appendChild(icon);
    el.appendChild(label);
    el.appendChild(removeBtn);

    return el;
  }

  static removeBadgeElement(container: HTMLElement, badgeId: string): void {
    const el = container.querySelector(`[data-badge-id="${badgeId}"]`);
    if (el) {
      el.remove();
    }
  }
}
