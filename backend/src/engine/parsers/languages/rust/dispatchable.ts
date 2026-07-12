import type { SyntaxNode, ExtractedSymbol, ExtractedRelationship, SymbolKind } from '../../types.js';
import { getNodeText, getNodeRange, extractDocComment } from '../../ast-utils.js';
import { extractVisibility } from './helpers.js';
import type { DispatchFn } from './parser.js';

export function extractTrait(
  node: SyntaxNode, source: string, filePath: string,
  parentName: string | null, symbols: ExtractedSymbol[],
  relationships: ExtractedRelationship[],
  dispatch: DispatchFn,
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
    name, kind: 'trait', filePath,
    startLine: range.startLine, endLine: range.endLine,
    signature: `trait ${name}${generics}`, isExported, parentName, docComment,
  });
  const body = node.childForFieldName('body');
  if (body) dispatch(body, source, filePath, name, symbols, relationships);
}

export function extractImpl(
  node: SyntaxNode, source: string, filePath: string,
  symbols: ExtractedSymbol[], relationships: ExtractedRelationship[],
  dispatch: DispatchFn,
): void {
  const typeNode = node.childForFieldName('type');
  if (!typeNode) return;
  const targetType = getNodeText(typeNode, source).split('<')[0].trim();
  const traitNode = node.childForFieldName('trait');
  const traitName = traitNode ? getNodeText(traitNode, source).split('<')[0].trim() : null;
  const range = getNodeRange(node);
  const typeParams = node.childForFieldName('type_parameters');
  const generics = typeParams ? getNodeText(typeParams, source) : '';
  const implName = traitName ? `impl ${traitName} for ${targetType}` : `impl ${targetType}`;
  symbols.push({
    name: implName, kind: 'namespace' as SymbolKind, filePath,
    startLine: range.startLine, endLine: range.endLine,
    signature: `${implName}${generics}`,
  });
  if (traitName) {
    relationships.push({
      sourceSymbol: targetType, targetSymbol: traitName,
      kind: 'implements', filePath, line: range.startLine,
    });
  }
  const body = node.childForFieldName('body');
  if (body) dispatch(body, source, filePath, targetType, symbols, relationships);
}

export function extractModule(
  node: SyntaxNode, source: string, filePath: string,
  parentName: string | null, symbols: ExtractedSymbol[],
  relationships: ExtractedRelationship[],
  dispatch: DispatchFn,
): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;
  const name = getNodeText(nameNode, source);
  const range = getNodeRange(node);
  const visibility = extractVisibility(node, source);
  const isExported = visibility === 'pub' || visibility === 'pub_crate';
  symbols.push({
    name, kind: 'module', filePath,
    startLine: range.startLine, endLine: range.endLine,
    signature: `mod ${name}`, isExported, parentName,
  });
  const body = node.childForFieldName('body');
  if (body) dispatch(body, source, filePath, name, symbols, relationships);
}
