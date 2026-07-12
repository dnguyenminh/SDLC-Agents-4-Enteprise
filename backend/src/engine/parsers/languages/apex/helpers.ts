import type { SyntaxNode, ExtractedRelationship } from '../../types.js';
import { getNodeText, getNamedChild, findNodes, walkTree } from '../../ast-utils.js';

const APEX_MODIFIERS = ['public', 'private', 'protected', 'global', 'virtual', 'abstract',
  'static', 'final', 'transient', 'webservice',
  'with sharing', 'without sharing', 'inherited sharing'];

export function extractApexModifiers(node: SyntaxNode, source: string): string[] {
  const modifiers: string[] = [];
  const modifierNode = getNamedChild(node, 'modifiers');
  if (!modifierNode) return modifiers;
  for (let i = 0; i < modifierNode.childCount; i++) {
    const child = modifierNode.child(i);
    if (!child) continue;
    if (child.type === 'marker_annotation' || child.type === 'annotation') continue;
    const text = getNodeText(child, source).toLowerCase();
    if (APEX_MODIFIERS.includes(text)) modifiers.push(text);
  }
  return modifiers;
}

export function extractApexAnnotations(node: SyntaxNode, source: string): string[] {
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

export function extractTriggerEvents(triggerNode: SyntaxNode, source: string): string[] {
  const events: string[] = [];
  const text = getNodeText(triggerNode, source);
  const eventMatch = text.match(/\(([^)]+)\)/);
  if (eventMatch) {
    const eventStr = eventMatch[1];
    const eventParts = eventStr.split(',').map(e => e.trim().toLowerCase());
    events.push(...eventParts);
  }
  return events;
}

export function inferSObjectFromDML(targetText: string): string | null {
  const cleaned = targetText.replace(/^(new|old|updated|inserted)/, '');
  const singular = cleaned.replace(/s$/, '');
  if (singular.length > 0) {
    return singular.charAt(0).toUpperCase() + singular.slice(1);
  }
  return null;
}

export function calculateApexComplexity(node: SyntaxNode): number {
  let complexity = 1;
  const branchTypes = new Set([
    'if_statement', 'for_statement', 'enhanced_for_statement',
    'while_statement', 'do_statement', 'switch_expression',
    'catch_clause', 'ternary_expression',
  ]);
  walkTree(node, {
    enter(n) {
      if (branchTypes.has(n.type)) complexity++;
      if (n.type === '&&' || n.type === '||') complexity++;
    }
  });
  return complexity;
}

export function extractApexMethodReturnType(node: SyntaxNode, source: string): string | undefined {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    if (['type_identifier', 'void_type', 'integral_type', 'floating_point_type',
         'boolean_type', 'generic_type', 'scoped_type_identifier', 'array_type'].includes(child.type)) {
      return getNodeText(child, source);
    }
  }
  return undefined;
}

export function getApexFieldType(node: SyntaxNode, source: string): string {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    if (['type_identifier', 'void_type', 'integral_type', 'floating_point_type',
         'boolean_type', 'generic_type', 'scoped_type_identifier', 'array_type'].includes(child.type)) {
      return getNodeText(child, source);
    }
  }
  return '';
}
