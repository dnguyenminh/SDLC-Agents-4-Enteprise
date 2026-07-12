import type { SyntaxNode, ExtractedSymbol, ExtractedRelationship, SymbolKind } from '../../types.js';
import { getNodeText, getNodeRange, findNodes, calculateComplexity, extractDocComment } from '../../ast-utils.js';
import { extractVisibility, extractFunctionModifiers, extractParams, extractReturnType, buildFuncSignature } from './helpers.js';
import { extractRustCalls } from './calls.js';

export function extractFunction(
  node: SyntaxNode, source: string, filePath: string,
  parentName: string | null, symbols: ExtractedSymbol[],
  relationships: ExtractedRelationship[],
): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;
  const name = getNodeText(nameNode, source);
  const range = getNodeRange(node);
  const visibility = extractVisibility(node, source);
  const modifiers = extractFunctionModifiers(node, source);
  const params = extractParams(node.childForFieldName('parameters'), source);
  const returnType = extractReturnType(node, source);
  const typeParams = node.childForFieldName('type_parameters');
  const generics = typeParams ? getNodeText(typeParams, source) : '';
  const docComment = extractDocComment(node, source);
  const isExported = visibility === 'pub' || visibility === 'pub_crate';
  symbols.push({
    name, kind: parentName ? 'method' : 'function', filePath,
    startLine: range.startLine, endLine: range.endLine,
    signature: buildFuncSignature(name, generics, params, returnType, modifiers),
    parameters: params || null, returnType: returnType || null,
    modifiers, isAsync: modifiers.includes('async'), isExported, parentName,
    docComment, complexity: calculateComplexity(node),
  });
  const body = node.childForFieldName('body');
  if (body) {
    const callerName = parentName ? `${parentName}.${name}` : name;
    extractRustCalls(body, source, filePath, callerName, relationships);
  }
}

export function extractStruct(
  node: SyntaxNode, source: string, filePath: string,
  parentName: string | null, symbols: ExtractedSymbol[],
  relationships: ExtractedRelationship[],
): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;
  const name = getNodeText(nameNode, source);
  const range = getNodeRange(node);
  const visibility = extractVisibility(node, source);
  const isExported = visibility === 'pub' || visibility === 'pub_crate';
  const docComment = extractDocComment(node, source);
  const typeParams = node.childForFieldName('type_parameters');
  const generics = typeParams ? getNodeText(typeParams, source) : '';
  symbols.push({
    name, kind: 'struct', filePath,
    startLine: range.startLine, endLine: range.endLine,
    signature: `struct ${name}${generics}`, isExported, parentName, docComment,
  });
  let prev = node.previousNamedSibling;
  while (prev && prev.type === 'attribute_item') {
    const attrText = getNodeText(prev, source);
    const deriveMatch = attrText.match(/derive\(([^)]+)\)/);
    if (deriveMatch) {
      const traits = deriveMatch[1].split(',').map(t => t.trim());
      for (const trait of traits) {
        if (trait) {
          relationships.push({
            sourceSymbol: name, targetSymbol: trait,
            kind: 'implements', filePath, line: range.startLine,
            metadata: { derived: true },
          });
        }
      }
    }
    prev = prev.previousNamedSibling;
  }
}

export function extractEnum(
  node: SyntaxNode, source: string, filePath: string,
  parentName: string | null, symbols: ExtractedSymbol[],
  relationships: ExtractedRelationship[],
): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;
  const name = getNodeText(nameNode, source);
  const range = getNodeRange(node);
  const visibility = extractVisibility(node, source);
  const isExported = visibility === 'pub' || visibility === 'pub_crate';
  const docComment = extractDocComment(node, source);
  symbols.push({
    name, kind: 'enum', filePath,
    startLine: range.startLine, endLine: range.endLine,
    signature: `enum ${name}`, isExported, parentName, docComment,
  });
  let prev = node.previousNamedSibling;
  while (prev && prev.type === 'attribute_item') {
    const attrText = getNodeText(prev, source);
    const deriveMatch = attrText.match(/derive\(([^)]+)\)/);
    if (deriveMatch) {
      const traits = deriveMatch[1].split(',').map(t => t.trim());
      for (const trait of traits) {
        if (trait) {
          relationships.push({
            sourceSymbol: name, targetSymbol: trait,
            kind: 'implements', filePath, line: range.startLine,
            metadata: { derived: true },
          });
        }
      }
    }
    prev = prev.previousNamedSibling;
  }
}

export function extractTypeAlias(
  node: SyntaxNode, source: string, filePath: string,
  parentName: string | null, symbols: ExtractedSymbol[],
): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;
  const name = getNodeText(nameNode, source);
  const range = getNodeRange(node);
  const visibility = extractVisibility(node, source);
  const isExported = visibility === 'pub' || visibility === 'pub_crate';
  symbols.push({
    name, kind: 'type', filePath,
    startLine: range.startLine, endLine: range.endLine,
    signature: getNodeText(node, source).split('\n')[0].trim().slice(0, 200),
    isExported, parentName,
  });
}

export function extractConstStatic(
  node: SyntaxNode, source: string, filePath: string,
  parentName: string | null, symbols: ExtractedSymbol[],
): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;
  const name = getNodeText(nameNode, source);
  const range = getNodeRange(node);
  const visibility = extractVisibility(node, source);
  const isExported = visibility === 'pub' || visibility === 'pub_crate';
  const kind = node.type === 'static_item' ? 'variable' : 'constant';
  symbols.push({
    name, kind: kind as SymbolKind, filePath,
    startLine: range.startLine, endLine: range.endLine,
    signature: getNodeText(node, source).split('\n')[0].trim().slice(0, 200),
    isExported, parentName,
    modifiers: node.type === 'static_item' ? ['static'] : ['const'],
  });
}

export function extractMacroDefinition(
  node: SyntaxNode, source: string, filePath: string,
  symbols: ExtractedSymbol[],
): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;
  const name = getNodeText(nameNode, source);
  const range = getNodeRange(node);
  symbols.push({
    name, kind: 'function' as SymbolKind, filePath,
    startLine: range.startLine, endLine: range.endLine,
    signature: `macro_rules! ${name}`, modifiers: ['macro'], isExported: true,
  });
}
