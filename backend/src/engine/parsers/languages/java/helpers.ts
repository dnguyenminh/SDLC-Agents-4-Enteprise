import type { SyntaxNode } from '../../types.js';
import { getNodeText, getNamedChild } from '../../ast-utils.js';

const JAVA_MODIFIERS = [
  'public', 'private', 'protected', 'static', 'final',
  'abstract', 'synchronized', 'native', 'transient',
  'volatile', 'default', 'sealed', 'non-sealed',
];

export function extractJavaModifiers(node: SyntaxNode, source: string): string[] {
  const modifiers: string[] = [];
  const modifierNode = getNamedChild(node, 'modifiers');
  if (!modifierNode) return modifiers;
  for (let i = 0; i < modifierNode.childCount; i++) {
    const child = modifierNode.child(i);
    if (!child) continue;
    if (child.type === 'marker_annotation' || child.type === 'annotation') continue;
    const text = getNodeText(child, source);
    if (JAVA_MODIFIERS.includes(text)) modifiers.push(text);
  }
  return modifiers;
}

export function extractJavaAnnotations(node: SyntaxNode, source: string): string[] {
  const annotations: string[] = [];
  const modifierNode = getNamedChild(node, 'modifiers');
  if (!modifierNode) return annotations;
  for (let i = 0; i < modifierNode.childCount; i++) {
    const child = modifierNode.child(i);
    if (!child) continue;
    if (child.type === 'marker_annotation' || child.type === 'annotation') {
      const text = getNodeText(child, source).replace(/^@/, '').split('(')[0].trim();
      annotations.push(text);
    }
  }
  return annotations;
}
