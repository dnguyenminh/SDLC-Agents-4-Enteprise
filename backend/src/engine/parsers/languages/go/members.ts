import type { SyntaxNode, ExtractedSymbol, ExtractedRelationship, SymbolKind } from '../../types.js';
import { getNodeText, getNodeRange, findNodes, walkTree, calculateComplexity, extractDocComment } from '../../ast-utils.js';
import { isExported, extractReceiver, extractParams, extractResult, buildFuncSignature, buildMethodSignature } from './helpers.js';

export function extractDeclarations(
  root: SyntaxNode, source: string, filePath: string,
  symbols: ExtractedSymbol[], relationships: ExtractedRelationship[],
): void {
  for (let i = 0; i < root.namedChildCount; i++) {
    const child = root.namedChild(i);
    if (!child) continue;
    switch (child.type) {
      case 'function_declaration':
        extractFunction(child, source, filePath, symbols, relationships); break;
      case 'method_declaration':
        extractMethod(child, source, filePath, symbols, relationships); break;
      case 'type_declaration':
        extractTypeDeclaration(child, source, filePath, symbols); break;
      case 'const_declaration':
      case 'var_declaration':
        extractVarConst(child, source, filePath, symbols); break;
    }
  }
}

export function extractFunction(
  node: SyntaxNode, source: string, filePath: string,
  symbols: ExtractedSymbol[], relationships: ExtractedRelationship[],
): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;
  const name = getNodeText(nameNode, source);
  const range = getNodeRange(node);
  const params = extractParams(node.childForFieldName('parameters'), source);
  const returnType = extractResult(node.childForFieldName('result'), source);
  const docComment = extractDocComment(node, source);
  const exported = isExported(name);
  symbols.push({
    name, kind: 'function', filePath,
    startLine: range.startLine, endLine: range.endLine,
    signature: buildFuncSignature(name, params, returnType),
    parameters: params || null, returnType: returnType || null,
    isExported: exported, docComment, complexity: calculateComplexity(node),
  });
  const body = node.childForFieldName('body');
  if (body) extractGoCalls(body, source, filePath, name, relationships);
}

export function extractMethod(
  node: SyntaxNode, source: string, filePath: string,
  symbols: ExtractedSymbol[], relationships: ExtractedRelationship[],
): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;
  const name = getNodeText(nameNode, source);
  const range = getNodeRange(node);
  const receiver = extractReceiver(node.childForFieldName('receiver'), source);
  const params = extractParams(node.childForFieldName('parameters'), source);
  const returnType = extractResult(node.childForFieldName('result'), source);
  const docComment = extractDocComment(node, source);
  const exported = isExported(name);
  symbols.push({
    name, kind: 'method', filePath,
    startLine: range.startLine, endLine: range.endLine,
    signature: buildMethodSignature(receiver, name, params, returnType),
    parameters: params || null, returnType: returnType || null,
    parentName: receiver.typeName, isExported: exported, docComment,
    modifiers: receiver.isPointer ? ['pointer_receiver'] : ['value_receiver'],
    complexity: calculateComplexity(node),
  });
  relationships.push({
    sourceSymbol: receiver.typeName, targetSymbol: name,
    kind: 'uses', filePath, line: range.startLine,
    metadata: { relationship: 'has_method', pointer_receiver: receiver.isPointer },
  });
  const body = node.childForFieldName('body');
  if (body) extractGoCalls(body, source, filePath, `${receiver.typeName}.${name}`, relationships);
}

export function extractTypeDeclaration(node: SyntaxNode, source: string, filePath: string, symbols: ExtractedSymbol[]): void {
  const typeSpecs = findNodes(node, 'type_spec');
  for (const spec of typeSpecs) extractTypeSpec(spec, source, filePath, symbols);
}

export function extractTypeSpec(node: SyntaxNode, source: string, filePath: string, symbols: ExtractedSymbol[]): void {
  const nameNode = node.childForFieldName('name');
  if (!nameNode) return;
  const name = getNodeText(nameNode, source);
  const typeNode = node.childForFieldName('type');
  if (!typeNode) return;
  const range = getNodeRange(node);
  const exported = isExported(name);
  const docComment = extractDocComment(node, source);
  let kind: SymbolKind;
  let signature: string;
  switch (typeNode.type) {
    case 'struct_type': kind = 'struct'; signature = `type ${name} struct`; break;
    case 'interface_type': kind = 'interface'; signature = `type ${name} interface`; break;
    default: kind = 'type'; signature = `type ${name} ${getNodeText(typeNode, source).split('\n')[0].slice(0, 100)}`; break;
  }
  symbols.push({ name, kind, filePath, startLine: range.startLine, endLine: range.endLine, signature, isExported: exported, docComment });
}

export function extractVarConst(node: SyntaxNode, source: string, filePath: string, symbols: ExtractedSymbol[]): void {
  const specType = node.type === 'const_declaration' ? 'const_spec' : 'var_spec';
  const specs = findNodes(node, specType);
  for (const spec of specs) {
    const nameNode = spec.childForFieldName('name');
    if (!nameNode) continue;
    const name = getNodeText(nameNode, source);
    const range = getNodeRange(spec);
    const exported = isExported(name);
    symbols.push({
      name, kind: node.type === 'const_declaration' ? 'constant' as SymbolKind : 'variable', filePath,
      startLine: range.startLine, endLine: range.endLine,
      signature: getNodeText(spec, source).split('\n')[0].trim().slice(0, 200),
      isExported: exported,
    });
  }
}

export function extractGoCalls(
  body: SyntaxNode, source: string, filePath: string,
  callerName: string, relationships: ExtractedRelationship[],
): void {
  const seen = new Set<string>();
  const callExprs = findNodes(body, 'call_expression');
  for (const call of callExprs) {
    const funcNode = call.childForFieldName('function');
    if (!funcNode) continue;
    const target = getNodeText(funcNode, source).trim();
    const key = `${callerName}->${target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const isGoroutine = isInsideNodeType(call, 'go_statement');
    const isDeferred = isInsideNodeType(call, 'defer_statement');
    const metadata: Record<string, unknown> = {};
    if (isGoroutine) metadata.async = true;
    if (isDeferred) metadata.deferred = true;
    relationships.push({
      sourceSymbol: callerName, targetSymbol: target, kind: 'calls', filePath,
      line: call.startPosition.row + 1,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    });
  }
}

function isInsideNodeType(node: SyntaxNode, type: string): boolean {
  let current = node.parent;
  while (current) {
    if (current.type === type) return true;
    if (current.type === 'function_declaration' || current.type === 'method_declaration') break;
    current = current.parent;
  }
  return false;
}
