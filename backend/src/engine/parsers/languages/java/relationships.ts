import type { SyntaxNode, ExtractedRelationship } from '../../types.js';
import { getNodeText, getNamedChild, findNodes } from '../../ast-utils.js';
import { getBaseTypeName, resolveCallTarget } from '../common.js';

export function extractJavaImports(
  root: SyntaxNode, source: string, filePath: string,
  relationships: ExtractedRelationship[],
): void {
  const importNodes = findNodes(root, 'import_declaration');
  for (const importNode of importNodes) {
    const text = getNodeText(importNode, source);
    const isStatic = text.includes('static');
    const isWildcard = text.includes('*');
    const scopedId = findNodes(importNode, 'scoped_identifier')[0];
    const identifiers = findNodes(importNode, 'identifier');
    const path = scopedId
      ? getNodeText(scopedId, source)
      : (identifiers.length > 0 ? getNodeText(identifiers[0], source) : '');
    const target = isWildcard ? `${path}.*` : path;
    relationships.push({
      sourceSymbol: '__file__', targetSymbol: target, kind: 'imports',
      filePath, line: importNode.startPosition.row + 1,
      metadata: { ...(isStatic && { static: true }), ...(isWildcard && { wildcard: true }) },
    });
  }
}

export function extractJavaInheritance(
  node: SyntaxNode, source: string, filePath: string,
  className: string, relationships: ExtractedRelationship[],
): void {
  const superclass = getNamedChild(node, 'superclass');
  if (superclass) {
    const typeId = getNamedChild(superclass, 'type_identifier')
      ?? getNamedChild(superclass, 'scoped_type_identifier')
      ?? getNamedChild(superclass, 'generic_type');
    if (typeId) {
      relationships.push({
        sourceSymbol: className, targetSymbol: getBaseTypeName(typeId, source),
        kind: 'inherits', filePath, line: typeId.startPosition.row + 1,
      });
    }
  }
  const interfaces = getNamedChild(node, 'super_interfaces');
  if (interfaces) {
    const typeList = getNamedChild(interfaces, 'type_list');
    if (typeList) {
      for (let i = 0; i < typeList.namedChildCount; i++) {
        const typeNode = typeList.namedChild(i);
        if (!typeNode) continue;
        relationships.push({
          sourceSymbol: className, targetSymbol: getBaseTypeName(typeNode, source),
          kind: 'implements', filePath, line: typeNode.startPosition.row + 1,
        });
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
        relationships.push({
          sourceSymbol: className, targetSymbol: getBaseTypeName(typeNode, source),
          kind: 'inherits', filePath, line: typeNode.startPosition.row + 1,
        });
      }
    }
  }
}

export function extractJavaCalls(
  body: SyntaxNode, source: string, filePath: string,
  callerName: string, relationships: ExtractedRelationship[],
): void {
  const seen = new Set<string>();
  const methodCalls = findNodes(body, 'method_invocation');
  for (const call of methodCalls) {
    const target = resolveCallTarget(call, source);
    if (!target) continue;
    const key = `${callerName}->${target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    relationships.push({
      sourceSymbol: callerName, targetSymbol: target, kind: 'calls',
      filePath, line: call.startPosition.row + 1,
    });
  }
  const creations = findNodes(body, 'object_creation_expression');
  for (const creation of creations) {
    const typeNode = getNamedChild(creation, 'type_identifier')
      ?? getNamedChild(creation, 'scoped_type_identifier')
      ?? getNamedChild(creation, 'generic_type');
    if (!typeNode) continue;
    const typeName = getBaseTypeName(typeNode, source);
    const target = `${typeName}.constructor`;
    const key = `${callerName}->${target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    relationships.push({
      sourceSymbol: callerName, targetSymbol: target, kind: 'calls',
      filePath, line: creation.startPosition.row + 1,
      metadata: { constructor: true },
    });
  }
}
