import type { SyntaxNode, ExtractedSymbol, ExtractedRelationship, SymbolKind } from '../../types.js';
import { getNodeText, getNodeRange, getNamedChild, calculateComplexity, extractDocComment } from '../../ast-utils.js';
import { isExported, hasModifier, extractParameters, extractReturnType, buildFunctionSignature, extractDecorators, extractModifiers } from '../ts-utils.js';

export function extractFunction(
  node: SyntaxNode, source: string, filePath: string,
  parentName: string | null, symbols: ExtractedSymbol[],
): void {
  const nameNode = getNamedChild(node, 'identifier');
  if (!nameNode) return;
  const name = getNodeText(nameNode, source);
  const range = getNodeRange(node);
  const params = extractParameters(node, source);
  const returnType = extractReturnType(node, source);
  const exported = isExported(node);
  const isAsync = hasModifier(node, source, 'async');
  const docComment = extractDocComment(node, source);
  const decorators = extractDecorators(node, source);
  symbols.push({
    name, kind: parentName ? 'method' : 'function', filePath,
    startLine: range.startLine, endLine: range.endLine,
    signature: buildFunctionSignature(name, params, returnType, isAsync),
    parameters: params, returnType, isAsync, isExported: exported,
    parentName, docComment, complexity: calculateComplexity(node),
    decorators: decorators.length > 0 ? decorators : undefined,
  });
}

export function extractClass(
  node: SyntaxNode, source: string, filePath: string,
  parentName: string | null, symbols: ExtractedSymbol[],
  relationships: ExtractedRelationship[],
): void {
  const nameNode = getNamedChild(node, 'type_identifier') ?? getNamedChild(node, 'identifier');
  if (!nameNode) return;
  const name = getNodeText(nameNode, source);
  const range = getNodeRange(node);
  const exported = isExported(node);
  const docComment = extractDocComment(node, source);
  const decorators = extractDecorators(node, source);
  const modifiers = extractModifiers(node, source);
  const isAbstract = modifiers.includes('abstract');
  symbols.push({
    name, kind: 'class', filePath,
    startLine: range.startLine, endLine: range.endLine,
    signature: `${isAbstract ? 'abstract ' : ''}class ${name}`,
    isExported: exported, parentName, docComment,
    modifiers: modifiers.length > 0 ? modifiers : undefined,
    decorators: decorators.length > 0 ? decorators : undefined,
  });
  const body = getNamedChild(node, 'class_body');
  if (body) extractClassMembers(body, source, filePath, name, symbols);
}

export function extractClassMembers(
  body: SyntaxNode, source: string, filePath: string,
  className: string, symbols: ExtractedSymbol[],
): void {
  for (let i = 0; i < body.namedChildCount; i++) {
    const member = body.namedChild(i);
    if (!member) continue;
    switch (member.type) {
      case 'method_definition':
        extractMethod(member, source, filePath, className, symbols); break;
      case 'public_field_definition':
      case 'property_definition':
        extractProperty(member, source, filePath, className, symbols); break;
    }
  }
}

export function extractMethod(
  node: SyntaxNode, source: string, filePath: string,
  className: string, symbols: ExtractedSymbol[],
): void {
  const nameNode = getNamedChild(node, 'property_identifier') ?? getNamedChild(node, 'identifier');
  if (!nameNode) return;
  const name = getNodeText(nameNode, source);
  const range = getNodeRange(node);
  const params = extractParameters(node, source);
  const returnType = extractReturnType(node, source);
  const isAsync = hasModifier(node, source, 'async');
  const docComment = extractDocComment(node, source);
  const kind: SymbolKind = name === 'constructor' ? 'constructor' : 'method';
  const modifiers = extractModifiers(node, source);
  const decorators = extractDecorators(node, source);
  symbols.push({
    name, kind, filePath,
    startLine: range.startLine, endLine: range.endLine,
    signature: buildFunctionSignature(name, params, returnType, isAsync),
    parameters: params, returnType, isAsync, parentName: className,
    docComment, complexity: calculateComplexity(node),
    modifiers: modifiers.length > 0 ? modifiers : undefined,
    decorators: decorators.length > 0 ? decorators : undefined,
  });
}

export function extractProperty(
  node: SyntaxNode, source: string, filePath: string,
  className: string, symbols: ExtractedSymbol[],
): void {
  const nameNode = getNamedChild(node, 'property_identifier') ?? getNamedChild(node, 'identifier');
  if (!nameNode) return;
  const name = getNodeText(nameNode, source);
  const range = getNodeRange(node);
  const modifiers = extractModifiers(node, source);
  symbols.push({
    name, kind: 'property', filePath,
    startLine: range.startLine, endLine: range.endLine,
    signature: getNodeText(node, source).split('\n')[0].trim().slice(0, 200),
    parentName: className,
    modifiers: modifiers.length > 0 ? modifiers : undefined,
  });
}

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
