import type { SyntaxNode } from '../../types.js';
import { getNodeText, findFirst } from '../../ast-utils.js';

export function extractKotlinModifiers(node: SyntaxNode, source: string): string[] {
  const modifiers: string[] = [];
  const modifierList = findFirst(node, 'modifiers');
  if (!modifierList || modifierList.parent !== node) return modifiers;
  for (let i = 0; i < modifierList.namedChildCount; i++) {
    const child = modifierList.namedChild(i);
    if (!child) continue;
    if (child.type === 'annotation') continue;
    const text = getNodeText(child, source).trim();
    if (text && !text.startsWith('@')) modifiers.push(text);
  }
  return modifiers;
}

export function getKotlinAnnotationNames(node: SyntaxNode, source: string): string[] {
  const annotations: string[] = [];
  const modifierList = findFirst(node, 'modifiers');
  if (!modifierList || modifierList.parent !== node) return annotations;
  for (let i = 0; i < modifierList.namedChildCount; i++) {
    const child = modifierList.namedChild(i);
    if (!child || child.type !== 'annotation') continue;
    const text = getNodeText(child, source).replace(/^@/, '').split('(')[0].trim();
    if (text) annotations.push(text);
  }
  return annotations;
}

export function extractTypeParameters(node: SyntaxNode, source: string): string {
  const typeParams = findFirst(node, 'type_parameters');
  if (!typeParams) return '';
  return getNodeText(typeParams, source);
}

export function extractPrimaryConstructor(node: SyntaxNode, source: string): string | null {
  const constructor = findFirst(node, 'primary_constructor');
  if (!constructor) return null;
  const paramList = findFirst(constructor, 'class_parameters');
  if (!paramList) return null;
  return getNodeText(paramList, source).replace(/^\(|\)$/g, '');
}

export function extractFunctionParameters(node: SyntaxNode, source: string): string | null {
  const params = findFirst(node, 'function_value_parameters');
  if (!params) return null;
  return getNodeText(params, source);
}

export function extractKotlinReturnType(node: SyntaxNode, source: string): string | null {
  const nodeText = getNodeText(node, source);
  const headerEnd = nodeText.indexOf('{');
  const header = headerEnd > 0 ? nodeText.substring(0, headerEnd) : nodeText.split('\n')[0];
  let depth = 0;
  let lastColon = -1;
  for (let i = header.length - 1; i >= 0; i--) {
    if (header[i] === ')') depth++;
    if (header[i] === '(') depth--;
    if (header[i] === ':' && depth === 0) { lastColon = i; break; }
  }
  if (lastColon > 0) {
    const returnType = header.substring(lastColon + 1).trim();
    if (returnType && !returnType.includes('(') && returnType !== '') return returnType;
  }
  return null;
}

export function extractReceiverType(node: SyntaxNode, source: string): string | undefined {
  const nodeText = getNodeText(node, source);
  const funMatch = nodeText.match(/\bfun\s+(?:<[^>]+>\s+)?(\w+(?:<[^>]+>)?)\./);
  if (funMatch) return funMatch[1];
  return undefined;
}

export function calculateKotlinComplexity(node: SyntaxNode): number {
  let complexity = 1;
  const branchTypes = new Set(['if_expression', 'when_entry', 'for_statement', 'while_statement', 'do_while_statement', 'catch_block']);
  const logicalTypes = new Set(['conjunction_expression', 'disjunction_expression']);
  walkTree(node, {
    enter(n) {
      if (branchTypes.has(n.type)) complexity++;
      if (logicalTypes.has(n.type)) complexity++;
    }
  });
  return complexity;
}

export function buildKotlinFunctionSignature(
  modifiers: string[], receiverType: string | undefined,
  name: string, params: string | null, returnType: string | null,
): string {
  const modStr = modifiers.filter(m => !['public', 'internal'].includes(m)).join(' ');
  const receiver = receiverType ? `${receiverType}.` : '';
  const ret = returnType ? `: ${returnType}` : '';
  return `${modStr ? modStr + ' ' : ''}fun ${receiver}${name}${params ?? '()'}${ret}`.trim().slice(0, 500);
}

import { walkTree } from '../../ast-utils.js';
