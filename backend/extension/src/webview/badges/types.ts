/**
 * Badge types — KSA-252
 */

import type { ContextSourceType, ContextMetadata, ContextTagBadge } from '../protocol';

export { ContextSourceType, ContextMetadata, ContextTagBadge };

export interface BadgeRenderOptions {
  container: HTMLElement;
  onRemove: (badgeId: string) => void;
}
