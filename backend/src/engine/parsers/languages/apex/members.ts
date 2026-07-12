import type { SyntaxNode, ExtractedSymbol, ExtractedRelationship, SymbolKind } from '../../types.js';
import { getNodeText, getNodeRange, getNamedChild, findNodes, extractDocComment } from '../../ast-utils.js';
import { buildMethodSignature} from '../common.js';
import { extractApexModifiers, extractApexAnnotations, extractApexMethodReturnType, getApexFieldType, calculateApexComplexity } from './helpers.js';
import { extractApexCalls, extractApexDML, extractApexSOQL } from './relationships.js';

export function extractMethod(
  node: SyntaxNode, source: string, filePath: string,
  className: string, symbols: ExtractedSymbol[],
  relationships: ExtractedRelationship[],
): void {
  const nameNode = getNamedChild(node, 'identifier');
  if (!nameNode) return;
  const name = getNodeText(nameNode, source);
  const range = getNodeRange(node);
  const modifiers = extractApexModifiers(node, source);
  const annotations = extractApexAnnotations(node, source);
  const docComment = extractDocComment(node, source);
  const paramsNode = getNamedChild(node, 'formal_parameters');
  const params = paramsNode ? getNodeText(paramsNode, source) : '()';
  const returnType = extractApexMethodReturnType(node, source);
  const body = getNamedChild(node, 'block');
  const complexity = body ? calculateApexComplexity(body) : 1;
  symbols.push({
    name, kind: 'method', filePath,
    startLine: range.startLine, endLine: range.endLine,
    signature: buildMethodSignature(modifiers, returnType, name, params),
    parameters: params, returnType, modifiers, decorators: annotations,
    parentName: className,
    isExported: modifiers.includes('public') || modifiers.includes('global'),
    docComment, complexity,
  });
  if (body) {
    const callerName = `${className}.${name}`;
    extractApexCalls(body, source, filePath, callerName, relationships);
    extractApexDML(body, source, filePath, callerName, relationships);
    extractApexSOQL(body, source, filePath, callerName, relationships);
  }
  for (const ann of annotations) {
    relationships.push({
      sourceSymbol: `${className}.${name}`, targetSymbol: ann,
      kind: 'decorates', filePath, line: range.startLine,
    });
  }
}

export function extractConstructor(
  node: SyntaxNode, source: string, filePath: string,
  className: string, symbols: ExtractedSymbol[],
  relationships: ExtractedRelationship[],
): void {
  const nameNode = getNamedChild(node, 'identifier');
  const name = nameNode ? getNodeText(nameNode, source) : className;
  const range = getNodeRange(node);
  const modifiers = extractApexModifiers(node, source);
  const docComment = extractDocComment(node, source);
  const paramsNode = getNamedChild(node, 'formal_parameters');
  const params = paramsNode ? getNodeText(paramsNode, source) : '()';
  const body = getNamedChild(node, 'constructor_body') ?? getNamedChild(node, 'block');
  symbols.push({
    name: 'constructor', kind: 'constructor', filePath,
    startLine: range.startLine, endLine: range.endLine,
    signature: `${modifiers.join(' ')} ${name}${params}`.trim(),
    parameters: params, modifiers, parentName: className,
    isExported: modifiers.includes('public') || modifiers.includes('global'),
    docComment,
  });
  if (body) {
    extractApexCalls(body, source, filePath, `${className}.constructor`, relationships);
    extractApexDML(body, source, filePath, `${className}.constructor`, relationships);
    extractApexSOQL(body, source, filePath, `${className}.constructor`, relationships);
  }
}

export function extractFields(
  node: SyntaxNode, source: string, filePath: string,
  className: string, symbols: ExtractedSymbol[],
): void {
  const range = getNodeRange(node);
  const modifiers = extractApexModifiers(node, source);
  const annotations = extractApexAnnotations(node, source);
  const typeText = getApexFieldType(node, source);
  const declarators = findNodes(node, 'variable_declarator');
  for (const decl of declarators) {
    const nameNode = getNamedChild(decl, 'identifier');
    if (!nameNode) continue;
    const name = getNodeText(nameNode, source);
    const isConstant = modifiers.includes('static') && modifiers.includes('final')
      && /^[A-Z_][A-Z0-9_]*$/.test(name);
    symbols.push({
      name, kind: isConstant ? 'constant' as SymbolKind : 'property', filePath,
      startLine: range.startLine, endLine: range.endLine,
      signature: `${modifiers.join(' ')} ${typeText} ${name}`.trim().slice(0, 200),
      returnType: typeText, modifiers, decorators: annotations,
      parentName: className,
      isExported: modifiers.includes('public') || modifiers.includes('global'),
    });
  }
}
