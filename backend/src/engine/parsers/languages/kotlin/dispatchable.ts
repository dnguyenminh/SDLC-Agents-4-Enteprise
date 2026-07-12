import type { SyntaxNode, ExtractedSymbol, ExtractedRelationship } from '../../types.js';
import { getNodeText, getNodeRange, findFirst } from '../../ast-utils.js';
import { extractClass, extractObject, extractFunction, extractProperty, extractTypeAlias } from './members.js';

export function extractSupertypes(
  node: SyntaxNode, source: string, className: string,
  filePath: string, relationships: ExtractedRelationship[],
): void {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (!child) continue;
    if (child.type === 'delegation_specifier' || child.type === 'annotated_delegation_specifier') {
      const specNode = child.type === 'annotated_delegation_specifier'
        ? findFirst(child, 'delegation_specifier') ?? child : child;
      const text = getNodeText(specNode, source).trim();
      const hasParens = text.includes('(');
      const typeName = text.replace(/\(.*\)$/, '').replace(/<.*>/, '').trim();
      if (typeName) {
        relationships.push({
          sourceSymbol: className, targetSymbol: typeName,
          kind: hasParens ? 'inherits' : 'implements',
          filePath, line: child.startPosition.row + 1,
        });
      }
    }
  }
}

export function generateDataClassMembers(
  className: string, filePath: string, node: SyntaxNode, symbols: ExtractedSymbol[],
): void {
  const range = getNodeRange(node);
  const implicitMethods = ['copy', 'toString', 'hashCode', 'equals', 'componentN'];
  for (const method of implicitMethods) {
    symbols.push({
      name: method, kind: 'method', filePath,
      startLine: range.startLine, endLine: range.startLine,
      signature: `fun ${method}(): /* generated */`,
      parentName: className, modifiers: ['generated'],
    });
  }
}

export function extractDeclarationsInNode(
  node: SyntaxNode, source: string, filePath: string,
  symbols: ExtractedSymbol[], relationships: ExtractedRelationship[],
  parentName: string | undefined,
): void {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (!child) continue;
    switch (child.type) {
      case 'class_declaration':
        extractClass(child, source, filePath, symbols, relationships, parentName); break;
      case 'object_declaration':
        extractObject(child, source, filePath, symbols, relationships, parentName); break;
      case 'function_declaration':
        extractFunction(child, source, filePath, symbols, relationships, parentName); break;
      case 'property_declaration':
        extractProperty(child, source, filePath, symbols, relationships, parentName); break;
      case 'type_alias':
        extractTypeAlias(child, source, filePath, symbols, parentName); break;
    }
  }
}
