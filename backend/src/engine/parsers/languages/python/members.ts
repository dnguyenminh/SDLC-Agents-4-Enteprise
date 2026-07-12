import type { SyntaxNode, ExtractedSymbol, ExtractedRelationship, SymbolKind, RelationshipKind } from '../../types.js';
import { getNodeText, getNodeRange, getNamedChild, findNodes, extractDocComment } from '../../ast-utils.js';
import { getDecorators, extractPythonReturnType, extractDocstring, calculatePythonComplexity, buildPythonFunctionSignature } from './helpers.js';

export function extractFunction(
  node: SyntaxNode, source: string, filePath: string,
  parentName: string | null, symbols: ExtractedSymbol[],
  relationships: ExtractedRelationship[], decoratedNode?: SyntaxNode,
): void {
  const nameNode = getNamedChild(node, 'identifier');
  if (!nameNode) return;
  const name = getNodeText(nameNode, source);
  const range = getNodeRange(decoratedNode || node);
  const precedingText = source.substring(Math.max(0, node.startIndex - 6), node.startIndex);
  const isAsync = precedingText.includes('async');
  const decorators = getDecorators(decoratedNode || node, source);
  let kind: SymbolKind = parentName ? 'method' : 'function';
  if (decorators.includes('property')) kind = 'property';
  if (name === '__init__') kind = 'constructor';
  const paramsNode = getNamedChild(node, 'parameters');
  const params = paramsNode ? getNodeText(paramsNode, source) : '()';
  const returnType = extractPythonReturnType(node, source);
  const modifiers: string[] = [];
  if (isAsync) modifiers.push('async');
  if (decorators.includes('staticmethod')) modifiers.push('static');
  if (decorators.includes('classmethod')) modifiers.push('classmethod');
  if (decorators.includes('abstractmethod')) modifiers.push('abstract');
  const isExported = !name.startsWith('_');
  const body = getNamedChild(node, 'block');
  const complexity = body ? calculatePythonComplexity(body) : 1;
  const docComment = body ? extractDocstring(body, source) : null;
  symbols.push({
    name, kind, filePath,
    startLine: range.startLine, endLine: range.endLine,
    signature: buildPythonFunctionSignature(isAsync, name, params, returnType),
    parameters: params, returnType, modifiers, decorators, parentName,
    isAsync, isExported, docComment, complexity,
  });
  if (body) {
    extractPythonCalls(body, source, filePath, parentName ? `${parentName}.${name}` : name, relationships);
    extractDeclarationsNode(body, source, filePath, name, symbols, relationships);
  }
  for (const dec of decorators) {
    relationships.push({
      sourceSymbol: parentName ? `${parentName}.${name}` : name,
      targetSymbol: dec, kind: 'decorates', filePath, line: range.startLine,
    });
  }
}

export function extractClass(
  node: SyntaxNode, source: string, filePath: string,
  parentName: string | null, symbols: ExtractedSymbol[],
  relationships: ExtractedRelationship[], decoratedNode?: SyntaxNode,
): void {
  const nameNode = getNamedChild(node, 'identifier');
  if (!nameNode) return;
  const name = getNodeText(nameNode, source);
  const range = getNodeRange(decoratedNode || node);
  const decorators = getDecorators(decoratedNode || node, source);
  const argList = getNamedChild(node, 'argument_list');
  const bases: string[] = [];
  let isProtocol = false;
  let isABC = false;
  if (argList) {
    for (let i = 0; i < argList.namedChildCount; i++) {
      const arg = argList.namedChild(i);
      if (!arg) continue;
      if (arg.type === 'identifier' || arg.type === 'attribute') {
        const baseName = getNodeText(arg, source);
        bases.push(baseName);
        if (baseName === 'Protocol') isProtocol = true;
        if (baseName === 'ABC' || baseName === 'ABCMeta') isABC = true;
        const relKind: RelationshipKind = isProtocol ? 'implements' : 'inherits';
        relationships.push({ sourceSymbol: name, targetSymbol: baseName, kind: relKind, filePath, line: arg.startPosition.row + 1 });
      }
    }
  }
  const kind: SymbolKind = isProtocol ? 'interface' : 'class';
  const modifiers: string[] = [];
  if (isABC) modifiers.push('abstract');
  if (decorators.includes('dataclass')) modifiers.push('dataclass');
  const isExported = !name.startsWith('_');
  const body = getNamedChild(node, 'block');
  const docComment = body ? extractDocstring(body, source) : null;
  symbols.push({
    name, kind, filePath,
    startLine: range.startLine, endLine: range.endLine,
    signature: `class ${name}${bases.length ? `(${bases.join(', ')})` : ''}`,
    modifiers, decorators, parentName, isExported, docComment,
  });
  if (body) extractDeclarationsNode(body, source, filePath, name, symbols, relationships);
  for (const dec of decorators) {
    relationships.push({ sourceSymbol: name, targetSymbol: dec, kind: 'decorates', filePath, line: range.startLine });
  }
}

function extractModuleVariable(
  node: SyntaxNode, source: string, filePath: string, symbols: ExtractedSymbol[],
): void {
  const assignment = getNamedChild(node, 'assignment');
  if (!assignment) return;
  const left = assignment.child(0);
  if (!left || left.type !== 'identifier') return;
  const name = getNodeText(left, source);
  const range = getNodeRange(node);
  const isConstant = /^[A-Z_][A-Z0-9_]*$/.test(name);
  symbols.push({
    name, kind: isConstant ? 'constant' as SymbolKind : 'variable', filePath,
    startLine: range.startLine, endLine: range.endLine,
    signature: getNodeText(node, source).split('\n')[0].trim().slice(0, 200),
    isExported: !name.startsWith('_'),
  });
}

export function extractDeclarationsNode(
  node: SyntaxNode, source: string, filePath: string,
  parentName: string | null, symbols: ExtractedSymbol[],
  relationships: ExtractedRelationship[],
): void {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (!child) continue;
    switch (child.type) {
      case 'function_definition':
        extractFunction(child, source, filePath, parentName, symbols, relationships); break;
      case 'class_definition':
        extractClass(child, source, filePath, parentName, symbols, relationships); break;
      case 'decorated_definition':
        extractDecorated(child, source, filePath, parentName, symbols, relationships); break;
      case 'expression_statement':
        if (!parentName) extractModuleVariable(child, source, filePath, symbols); break;
    }
  }
}

function extractDecorated(
  node: SyntaxNode, source: string, filePath: string,
  parentName: string | null, symbols: ExtractedSymbol[],
  relationships: ExtractedRelationship[],
): void {
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (!child) continue;
    if (child.type === 'function_definition') {
      extractFunction(child, source, filePath, parentName, symbols, relationships, node);
    } else if (child.type === 'class_definition') {
      extractClass(child, source, filePath, parentName, symbols, relationships, node);
    }
  }
}

export function extractPythonCalls(
  body: SyntaxNode, source: string, filePath: string,
  callerName: string, relationships: ExtractedRelationship[],
): void {
  const callNodes = findNodes(body, 'call');
  const seen = new Set<string>();
  const builtins = new Set(['print', 'len', 'range', 'str', 'int', 'float', 'list', 'dict', 'set', 'tuple', 'type', 'isinstance', 'issubclass', 'super', 'hasattr', 'getattr', 'setattr', 'repr', 'bool', 'enumerate', 'zip', 'map', 'filter', 'sorted', 'reversed', 'any', 'all', 'min', 'max', 'abs', 'round', 'open', 'id', 'hex', 'oct', 'bin', 'ord', 'chr', 'format', 'vars', 'dir', 'help', 'input', 'iter', 'next', 'slice', 'object', 'property', 'staticmethod', 'classmethod']);
  for (const call of callNodes) {
    const funcNode = call.child(0);
    if (!funcNode) continue;
    const funcName = getNodeText(funcNode, source);
    if (builtins.has(funcName)) continue;
    const key = `${callerName}->${funcName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    relationships.push({ sourceSymbol: callerName, targetSymbol: funcName, kind: 'calls', filePath, line: call.startPosition.row + 1 });
  }
}
