import type { SyntaxNode, ExtractedRelationship } from '../types.js';
import { getNodeText, getNamedChild, findNodes, walkTree } from '../ast-utils.js';

export function getBaseTypeName(typeNode: SyntaxNode, source: string): string {
  const text = getNodeText(typeNode, source);
  return text.split('<')[0].trim();
}

export function buildMethodSignature(modifiers: string[], returnType: string | undefined, name: string, params: string): string {
  const mods = modifiers.length ? modifiers.join(' ') + ' ' : '';
  const ret = returnType ? returnType + ' ' : '';
  return `${mods}${ret}${name}${params}`.trim().slice(0, 500);
}

export function resolveCallTarget(callNode: SyntaxNode, source: string): string | null {
  const nameNode = getNamedChild(callNode, 'identifier');
  if (!nameNode) return null;
  const name = getNodeText(nameNode, source);
  const object = callNode.child(0);
  if (object && object !== nameNode && object.type !== 'identifier') {
    const objectText = getNodeText(object, source);
    const simplified = objectText.length > 50 ? objectText.split('.').slice(-2).join('.') : objectText;
    return `${simplified}.${name}`;
  }
  if (object && object !== nameNode && object.type === 'identifier') {
    return `${getNodeText(object, source)}.${name}`;
  }
  return name;
}

export function extractCallsFromBody(body: SyntaxNode, source: string, filePath: string, callerName: string, relationships: ExtractedRelationship[]): void {
  const seen = new Set<string>();
  const methodCalls = findNodes(body, 'method_invocation');
  for (const call of methodCalls) {
    const target = resolveCallTarget(call, source);
    if (!target) continue;
    const key = `${callerName}->${target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    relationships.push({ sourceSymbol: callerName, targetSymbol: target, kind: 'calls', filePath, line: call.startPosition.row + 1 });
  }
  const creations = findNodes(body, 'object_creation_expression');
  for (const creation of creations) {
    const typeNode = getNamedChild(creation, 'type_identifier') ?? getNamedChild(creation, 'scoped_type_identifier') ?? getNamedChild(creation, 'generic_type');
    if (!typeNode) continue;
    const typeName = getBaseTypeName(typeNode, source);
    const target = `${typeName}.constructor`;
    const key = `${callerName}->${target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    relationships.push({ sourceSymbol: callerName, targetSymbol: target, kind: 'calls', filePath, line: creation.startPosition.row + 1, metadata: { constructor: true } });
  }
}

export function extractAnnotationsAsStrings(node: SyntaxNode, source: string): string[] {
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

export function extractMethodReturnType(node: SyntaxNode, source: string): string | undefined {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    if (['type_identifier', 'void_type', 'integral_type', 'floating_point_type', 'boolean_type', 'generic_type', 'scoped_type_identifier', 'array_type'].includes(child.type)) {
      return getNodeText(child, source);
    }
  }
  return undefined;
}

export function getFieldType(node: SyntaxNode, source: string): string {
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (!child) continue;
    if (['type_identifier', 'void_type', 'integral_type', 'floating_point_type', 'boolean_type', 'generic_type', 'scoped_type_identifier', 'array_type'].includes(child.type)) {
      return getNodeText(child, source);
    }
  }
  return '';
}

export function extractJavaLikeModifiers(node: SyntaxNode, source: string, allowed: string[]): string[] {
  const modifiers: string[] = [];
  const modifierNode = getNamedChild(node, 'modifiers');
  if (!modifierNode) return modifiers;
  for (let i = 0; i < modifierNode.childCount; i++) {
    const child = modifierNode.child(i);
    if (!child) continue;
    if (child.type === 'marker_annotation' || child.type === 'annotation') continue;
    const text = getNodeText(child, source).toLowerCase();
    if (allowed.includes(text)) modifiers.push(text);
  }
  return modifiers;
}

export function calculateJavaComplexity(node: SyntaxNode): number {
  let complexity = 1;
  const branchTypes = new Set(['if_statement', 'for_statement', 'enhanced_for_statement', 'while_statement', 'do_statement', 'switch_expression', 'catch_clause', 'ternary_expression', 'switch_block_statement_group']);
  walkTree(node, {
    enter(n) {
      if (branchTypes.has(n.type)) complexity++;
      if (n.type === '&&' || n.type === '||') complexity++;
      if (n.type === 'lambda_expression') complexity++;
    }
  });
  return complexity;
}

export function extractInheritance(node: SyntaxNode, source: string, filePath: string, className: string, relationships: ExtractedRelationship[], getBaseTypeNameFn: (n: SyntaxNode, s: string) => string = getBaseTypeName): void {
  const superclass = getNamedChild(node, 'superclass');
  if (superclass) {
    const typeId = getNamedChild(superclass, 'type_identifier') ?? getNamedChild(superclass, 'scoped_type_identifier') ?? getNamedChild(superclass, 'generic_type');
    if (typeId) {
      relationships.push({ sourceSymbol: className, targetSymbol: getBaseTypeNameFn(typeId, source), kind: 'inherits', filePath, line: typeId.startPosition.row + 1 });
    }
  }
  const interfaces = getNamedChild(node, 'super_interfaces');
  if (interfaces) {
    const typeList = getNamedChild(interfaces, 'type_list');
    if (typeList) {
      for (let i = 0; i < typeList.namedChildCount; i++) {
        const typeNode = typeList.namedChild(i);
        if (!typeNode) continue;
        relationships.push({ sourceSymbol: className, targetSymbol: getBaseTypeNameFn(typeNode, source), kind: 'implements', filePath, line: typeNode.startPosition.row + 1 });
      }
    }
  }
  const extendsInterfaces = getNamedChild(node, 'extends_interfaces');
  if (extendsInterfaces) {
    const typeList = getNamedChild(extendsInterfaces, 'type_list');
    if (typeList) {
      for (let i = 0; i < typeList.namedChildCount; i++) {
        const typeNode = typeList.namedChild(i);
        if (!typeNode) continue;
        relationships.push({ sourceSymbol: className, targetSymbol: getBaseTypeNameFn(typeNode, source), kind: 'inherits', filePath, line: typeNode.startPosition.row + 1 });
      }
    }
  }
}
