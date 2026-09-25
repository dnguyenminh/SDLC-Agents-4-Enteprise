/** Flatten an ExprNode reference to the dotted path consumed by PegaClipboardContext. */
import type { ReferenceNode } from './expressionTypes.js';

export function referenceToParts(reference: ReferenceNode): string[] {
  const segments = reference.segments.map((segment) => segment.name);
  if (reference.scope === 'current') return segments;
  if (reference.scope === 'relative') return segments;
  if (reference.scope === 'paramPage' && reference.page) {
    return [reference.page, ...segments];
  }
  if (reference.page) return [reference.page, ...segments];
  return segments;
}
