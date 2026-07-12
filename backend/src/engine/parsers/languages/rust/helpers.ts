import type { SyntaxNode } from '../../types.js';
import { getNodeText } from '../../ast-utils.js';

export type RustVisibility = 'private' | 'pub' | 'pub_crate' | 'pub_super' | 'pub_in';

export function extractVisibility(node: SyntaxNode, source: string): RustVisibility {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    if (child.type === 'visibility_modifier') {
      const text = getNodeText(child, source);
      if (text === 'pub') return 'pub';
      if (text.includes('crate')) return 'pub_crate';
      if (text.includes('super')) return 'pub_super';
      if (text.includes('in ')) return 'pub_in';
      return 'pub';
    }
  }
  return 'private';
}

export function hasVisibilityModifier(node: SyntaxNode): boolean {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child && child.type === 'visibility_modifier') return true;
  }
  return false;
}

export function extractFunctionModifiers(node: SyntaxNode, source: string): string[] {
  const modifiers: string[] = [];
  const text = getNodeText(node, source);
  const header = text.split('{')[0];
  if (header.includes('async ')) modifiers.push('async');
  if (header.includes('unsafe ')) modifiers.push('unsafe');
  if (header.includes('const ')) modifiers.push('const');
  return modifiers;
}

export function extractParams(node: SyntaxNode | null, source: string): string {
  if (!node) return '';
  return getNodeText(node, source);
}

export function extractReturnType(node: SyntaxNode, source: string): string {
  const returnTypeNode = node.childForFieldName('return_type');
  if (!returnTypeNode) return '';
  return getNodeText(returnTypeNode, source).replace(/^->\s*/, '').trim();
}

export function buildFuncSignature(
  name: string, generics: string, params: string,
  returnType: string, modifiers: string[],
): string {
  const prefix = modifiers.length > 0 ? modifiers.join(' ') + ' ' : '';
  const ret = returnType ? ` -> ${returnType}` : '';
  return `${prefix}fn ${name}${generics}${params}${ret}`.slice(0, 500);
}
