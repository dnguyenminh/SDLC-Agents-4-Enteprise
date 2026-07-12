import type { SyntaxNode, ExtractedSymbol, ExtractedRelationship, SymbolKind } from '../../types.js';
import { getNodeText, getNodeRange, getNamedChild, extractDocComment } from '../../ast-utils.js';
import { buildMethodSignature } from '../common.js';
import { extractApexModifiers, extractApexAnnotations, calculateApexComplexity } from './helpers.js';
import { extractMethod, extractConstructor, extractFields } from './members.js';
import { extractApexInheritance } from './relationships.js';

export function extractDeclarations(
  node: SyntaxNode, source: string, filePath: string,
  parentName: string | null, symbols: ExtractedSymbol[],
  relationships: ExtractedRelationship[], depth: number = 0,
): void {
  if (depth > 10) return;
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (!child) continue;
    switch (child.type) {
      case 'class_declaration':
        extractType(child, source, filePath, parentName, 'class', symbols, relationships, depth); break;
      case 'interface_declaration':
        extractType(child, source, filePath, parentName, 'interface', symbols, relationships, depth); break;
      case 'enum_declaration':
        extractType(child, source, filePath, parentName, 'enum', symbols, relationships, depth); break;
    }
  }
}

export function extractType(
  node: SyntaxNode, source: string, filePath: string,
  parentName: string | null, defaultKind: SymbolKind,
  symbols: ExtractedSymbol[], relationships: ExtractedRelationship[],
  depth: number,
): void {
  const nameNode = getNamedChild(node, 'identifier');
  if (!nameNode) return;
  const name = getNodeText(nameNode, source);
  const range = getNodeRange(node);
  const docComment = extractDocComment(node, source);
  const modifiers = extractApexModifiers(node, source);
  const isExported = modifiers.includes('public') || modifiers.includes('global');
  const annotations = extractApexAnnotations(node, source);
  extractApexInheritance(node, source, filePath, name, relationships);
  const modStr = modifiers.join(' ');
  symbols.push({
    name, kind: defaultKind, filePath,
    startLine: range.startLine, endLine: range.endLine,
    signature: `${modStr} ${defaultKind} ${name}`.trim().slice(0, 500),
    modifiers, decorators: annotations, parentName, isExported, docComment,
  });
  const body = getNamedChild(node, 'class_body')
    ?? getNamedChild(node, 'interface_body')
    ?? getNamedChild(node, 'enum_body');
  if (body) extractMembers(body, source, filePath, name, symbols, relationships, depth);
  for (const ann of annotations) {
    relationships.push({ sourceSymbol: name, targetSymbol: ann, kind: 'decorates', filePath, line: range.startLine });
  }
}

export function extractMembers(
  body: SyntaxNode, source: string, filePath: string,
  className: string, symbols: ExtractedSymbol[],
  relationships: ExtractedRelationship[], depth: number,
): void {
  for (let i = 0; i < body.namedChildCount; i++) {
    const member = body.namedChild(i);
    if (!member) continue;
    switch (member.type) {
      case 'method_declaration':
        extractMethod(member, source, filePath, className, symbols, relationships); break;
      case 'constructor_declaration':
        extractConstructor(member, source, filePath, className, symbols, relationships); break;
      case 'field_declaration':
        extractFields(member, source, filePath, className, symbols); break;
      case 'class_declaration':
        extractType(member, source, filePath, className, 'class', symbols, relationships, depth + 1); break;
      case 'interface_declaration':
        extractType(member, source, filePath, className, 'interface', symbols, relationships, depth + 1); break;
      case 'enum_declaration':
        extractType(member, source, filePath, className, 'enum', symbols, relationships, depth + 1); break;
    }
  }
}
