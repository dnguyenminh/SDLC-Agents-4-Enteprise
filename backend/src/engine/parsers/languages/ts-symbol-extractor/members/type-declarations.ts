/**
 * Type-level declaration extraction (interface / type alias / enum / variables)
 * for TypeScript-family grammars.
 * Extracted from ts-symbol-extractor/members.ts (BR-18) — no behavior change.
 */

import type { SyntaxNode, ExtractedSymbol } from '../../../types.js';
import { getNodeText, getNodeRange, getNamedChild, calculateComplexity, extractDocComment } from '../../../ast-utils.js';
import { isExported, hasModifier, extractParameters, extractReturnType, buildFunctionSignature } from '../../ts-utils.js';

export function extractInterface(
  node: SyntaxNode, source: string, filePath: string,
  parentName: string | null, symbols: ExtractedSymbol[],
): void {
  const nameNode = getNamedChild(node, 'type_identifier') ?? getNamedChild(node, 'identifier');
  if (!nameNode) return;
  const name = getNodeText(nameNode, source);
  const range = getNodeRange(node);
  const exported = isExported(node);
  const docComment = extractDocComment(node, source);
  symbols.push({ name, kind: 'interface', filePath, startLine: range.startLine, endLine: range.endLine, signature: `interface ${name}`, isExported: exported, parentName, docComment });
}

export function extractTypeAlias(
  node: SyntaxNode, source: string, filePath: string,
  parentName: string | null, symbols: ExtractedSymbol[],
): void {
  const nameNode = getNamedChild(node, 'type_identifier') ?? getNamedChild(node, 'identifier');
  if (!nameNode) return;
  const name = getNodeText(nameNode, source);
  const range = getNodeRange(node);
  const exported = isExported(node);
  symbols.push({ name, kind: 'type', filePath, startLine: range.startLine, endLine: range.endLine, signature: getNodeText(node, source).split('\n')[0].trim().slice(0, 200), isExported: exported, parentName });
}

export function extractEnum(
  node: SyntaxNode, source: string, filePath: string,
  parentName: string | null, symbols: ExtractedSymbol[],
): void {
  const nameNode = getNamedChild(node, 'identifier');
  if (!nameNode) return;
  const name = getNodeText(nameNode, source);
  const range = getNodeRange(node);
  const exported = isExported(node);
  symbols.push({ name, kind: 'enum', filePath, startLine: range.startLine, endLine: range.endLine, signature: `enum ${name}`, isExported: exported, parentName });
}

export function extractVariableDeclaration(
  node: SyntaxNode, source: string, filePath: string,
  parentName: string | null, symbols: ExtractedSymbol[],
): void {
  for (let i = 0; i < node.namedChildCount; i++) {
    const declarator = node.namedChild(i);
    if (!declarator || declarator.type !== 'variable_declarator') continue;
    const nameNode = getNamedChild(declarator, 'identifier');
    if (!nameNode) continue;
    const name = getNodeText(nameNode, source);
    const value = getNamedChild(declarator, 'arrow_function') ?? getNamedChild(declarator, 'function_expression') ?? getNamedChild(declarator, 'function');
    if (value) {
      const range = getNodeRange(node);
      const params = extractParameters(value, source);
      const returnType = extractReturnType(value, source);
      const exported = isExported(node);
      const isAsync = hasModifier(value, source, 'async');
      const docComment = extractDocComment(node, source);
      symbols.push({ name, kind: 'function', filePath, startLine: range.startLine, endLine: range.endLine, signature: buildFunctionSignature(name, params, returnType, isAsync), parameters: params, returnType, isAsync, isExported: exported, parentName, docComment, complexity: calculateComplexity(value) });
    }
  }
}
