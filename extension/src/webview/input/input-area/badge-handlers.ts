/**
 * Badge rendering / removal helpers and "#" filter updates (KSA-252)
 * operating on the shared input-area state.
 */
import { BadgeRenderer } from '../../badges/BadgeRenderer';
import type { ContextTagBadge } from '../../protocol';
import type { InputAreaParts } from './parts';

export function renderBadge(parts: InputAreaParts, badge: ContextTagBadge): void {
  const renderer = parts.controller.getBadgeRenderer();
  const el = renderer.createBadgeElement(badge);
  parts.badgeContainer.appendChild(el);
  removeHashText(parts);
}

function removeHashText(parts: InputAreaParts): void {
  const text = parts.inputElement.textContent || '';
  const lastHash = text.lastIndexOf('#');
  if (lastHash >= 0) {
    parts.inputElement.textContent = text.substring(0, lastHash);
  }
}

export function handleBadgeBackspace(parts: InputAreaParts): void {
  const badges = parts.controller.getBadgeManager().getAll();
  if (badges.length > 0) {
    const selection = window.getSelection();
    if (selection && selection.anchorOffset === 0) {
      const lastBadge = badges[badges.length - 1];
      parts.controller.getBadgeManager().remove(lastBadge.id);
      BadgeRenderer.removeBadgeElement(parts.badgeContainer, lastBadge.id);
    }
  }
}

export function updateFilter(parts: InputAreaParts): void {
  const text = parts.inputElement.textContent || '';
  const lastHash = text.lastIndexOf('#');
  if (lastHash >= 0) {
    const filterText = text.substring(lastHash + 1);
    parts.controller.filter(filterText);
  }
}
