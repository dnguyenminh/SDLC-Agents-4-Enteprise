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
  _relationships: ExtractedRelationship[],
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
      // TypeScript grammar class members.
      case 'public_field_definition':
      case 'property_definition':
        extractClassField(member, source, filePath, className, symbols); break;
      // JavaScript grammar class field (e.g. LWC `@api recordId;` or arrow-function
      // handlers `handleClick = (e) => {...}`). tree-sitter-javascript names these
      // `field_definition`, which the TS-only cases above do not match — without this
      // branch all LWC class fields are silently dropped.
      case 'field_definition':
        extractClassField(member, source, filePath, className, symbols); break;
    }
  }
}

/**
 * Classify a class field. Fields whose value is a function expression
 * (arrow/function) are behavioural members → `method`; everything else
 * (reactive/`@api`/`@track`/plain data fields) → `property`.
 * Handles both TS (`public_field_definition`/`property_definition`) and
 * JS (`field_definition`) node shapes.
 */
function extractClassField(
  node: SyntaxNode, source: string, filePath: string,
  className: string, symbols: ExtractedSymbol[],
): void {
  const value = getNamedChild(node, 'arrow_function')
    ?? getNamedChild(node, 'function_expression')
    ?? getNamedChild(node, 'function');
  if (value) {
    extractFieldMethod(node, value, source, filePath, className, symbols);
  } else {
    extractProperty(node, source, filePath, className, symbols);
  }
}

/**
 * Emit a `method` symbol for a function-valued class field (e.g. an LWC arrow
 * handler `handleClick = (e) => {...}`). The name comes from the field node, but
 * params/return/async/complexity are read from the nested function value node
 * because that is where `formal_parameters` and the body live.
 */
function extractFieldMethod(
  fieldNode: SyntaxNode, valueNode: SyntaxNode, source: string,
  filePath: string, className: string, symbols: ExtractedSymbol[],
): void {
  const nameNode = getNamedChild(fieldNode, 'property_identifier') ?? getNamedChild(fieldNode, 'identifier');
  if (!nameNode) return;
  const name = getNodeText(nameNode, source);
  const range = getNodeRange(fieldNode);
  const params = extractParameters(valueNode, source);
  const returnType = extractReturnType(valueNode, source);
  const isAsync = hasModifier(valueNode, source, 'async');
  const docComment = extractDocComment(fieldNode, source);
  const modifiers = extractModifiers(fieldNode, source);
  const decorators = extractDecorators(fieldNode, source);
  symbols.push({
    name, kind: 'method', filePath,
    startLine: range.startLine, endLine: range.endLine,
    signature: buildFunctionSignature(name, params, returnType, isAsync),
    parameters: params, returnType, isAsync, parentName: className,
    docComment, complexity: calculateComplexity(valueNode),
    modifiers: modifiers.length > 0 ? modifiers : undefined,
    decorators: decorators.length > 0 ? decorators : undefined,
  });
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
