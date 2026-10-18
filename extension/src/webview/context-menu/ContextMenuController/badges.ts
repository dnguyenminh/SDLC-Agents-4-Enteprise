/**
 * Context tag badge creation + insertion/removal (KSA-252).
 */

import type { ContextMenuItem, ContextTagBadge } from '../../protocol';
import { BadgeManager } from '../../badges/BadgeManager';
import { BadgeRenderer } from '../../badges/BadgeRenderer';

/** Map an instant item onto a concrete badge descriptor. */
export function createInstantBadge(item: ContextMenuItem, generateId: () => string): ContextTagBadge {
  const id = generateId();
  switch (item.id) {
    case 'git-diff':
      return { id, type: 'git-diff', label: 'Git Diff', icon: item.icon, metadata: {} };
    case 'terminal':
      return { id, type: 'terminal', label: 'Terminal', icon: item.icon, metadata: {} };
    case 'problems':
      return { id, type: 'problems', label: 'Problems', icon: item.icon, metadata: {} };
    case 'current-file':
      return { id, type: 'current-file', label: 'Current File', icon: item.icon, metadata: {} };
    default:
      return { id, type: item.id as any, label: item.label, icon: item.icon, metadata: {} };
  }
}

/** Insert a badge into the document + notify host + announce. */
export function insertBadge(
  badge: ContextTagBadge,
  deps: { badgeManager: BadgeManager; onBadgeInsert: (badge: ContextTagBadge) => void; announce: (message: string) => void },
): void {
  deps.badgeManager.insert(badge);
  deps.onBadgeInsert(badge);
  deps.announce(`Context added: ${badge.label}`);
}

/** Remove a badge element + notify + announce (idempotent). */
export function removeBadge(
  badgeId: string,
  deps: { badgeManager: BadgeManager; container: HTMLElement; announce: (message: string) => void },
): void {
  const badge = deps.badgeManager.get(badgeId);
  deps.badgeManager.remove(badgeId);
  BadgeRenderer.removeBadgeElement(deps.container, badgeId);
  if (badge) deps.announce(`Context removed: ${badge.label}`);
}
