import type { SyntaxNode, ExtractedSymbol, ExtractedRelationship, SymbolKind } from '../../types.js';
import { getNodeText, getNodeRange, getNamedChild, findNodes, extractDocComment } from '../../ast-utils.js';
import { buildMethodSignature, extractMethodReturnType, getFieldType, calculateJavaComplexity } from '../common.js';
import { extractJavaModifiers, extractJavaAnnotations } from './helpers.js';
import { extractJavaInheritance, extractJavaCalls } from './relationships.js';

export function extractPackage(
  root: SyntaxNode, source: string, filePath: string,
  symbols: ExtractedSymbol[],
): void {
  const pkgNodes = findNodes(root, 'package_declaration');
  if (pkgNodes.length === 0) return;
  const pkgNode = pkgNodes[0];
  const scopedId = findNodes(pkgNode, 'scoped_identifier')[0]
    ?? findNodes(pkgNode, 'identifier')[0];
  if (!scopedId) return;
  const name = getNodeText(scopedId, source);
  const range = getNodeRange(pkgNode);
  symbols.push({
    name, kind: 'namespace', filePath,
    startLine: range.startLine, endLine: range.endLine,
    signature: `package ${name}`, isExported: true,
  });
}

export function extractDeclarations(
  node: SyntaxNode, source: string, filePath: string,
  parentName: string | null, symbols: ExtractedSymbol[],
  relationships: ExtractedRelationship[], depth = 0,
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
      case 'record_declaration':
        extractType(child, source, filePath, parentName, 'class', symbols, relationships, depth); break;
      case 'annotation_type_declaration':
        extractType(child, source, filePath, parentName, 'interface', symbols, relationships, depth); break;
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
  const modifiers = extractJavaModifiers(node, source);
  const annotations = extractJavaAnnotations(node, source);
  const isExported = modifiers.includes('public');
  const kind: SymbolKind = defaultKind;
  if (node.type === 'record_declaration') modifiers.push('record');
  if (node.type === 'annotation_type_declaration') modifiers.push('annotation');
  extractJavaInheritance(node, source, filePath, name, relationships);
  const typeKeyword = node.type === 'record_declaration' ? 'record'
    : node.type === 'annotation_type_declaration' ? '@interface' : defaultKind;
  const modStr = modifiers.filter(m => m !== 'record' && m !== 'annotation').join(' ');
  symbols.push({
    name, kind, filePath,
    startLine: range.startLine, endLine: range.endLine,
    signature: `${modStr} ${typeKeyword} ${name}`.trim().slice(0, 500),
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
      case 'record_declaration':
        extractType(member, source, filePath, className, 'class', symbols, relationships, depth + 1); break;
    }
  }
}

export function extractMethod(
  node: SyntaxNode, source: string, filePath: string,
  className: string, symbols: ExtractedSymbol[],
  relationships: ExtractedRelationship[],
): void {
  const nameNode = getNamedChild(node, 'identifier');
  if (!nameNode) return;
  const name = getNodeText(nameNode, source);
  const range = getNodeRange(node);
  const modifiers = extractJavaModifiers(node, source);
  const annotations = extractJavaAnnotations(node, source);
  const docComment = extractDocComment(node, source);
  const paramsNode = getNamedChild(node, 'formal_parameters');
  const params = paramsNode ? getNodeText(paramsNode, source) : '()';
  const returnType = extractMethodReturnType(node, source);
  const body = getNamedChild(node, 'block');
  const complexity = body ? calculateJavaComplexity(body) : 1;
  symbols.push({
    name, kind: 'method', filePath,
    startLine: range.startLine, endLine: range.endLine,
    signature: buildMethodSignature(modifiers, returnType, name, params),
    parameters: params, returnType, modifiers, decorators: annotations,
    parentName: className, isExported: modifiers.includes('public'),
    docComment, complexity,
  });
  if (body) extractJavaCalls(body, source, filePath, `${className}.${name}`, relationships);
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
  const modifiers = extractJavaModifiers(node, source);
  const annotations = extractJavaAnnotations(node, source);
  const docComment = extractDocComment(node, source);
  const paramsNode = getNamedChild(node, 'formal_parameters');
  const params = paramsNode ? getNodeText(paramsNode, source) : '()';
  const body = getNamedChild(node, 'constructor_body') ?? getNamedChild(node, 'block');
  const complexity = body ? calculateJavaComplexity(body) : 1;
  symbols.push({
    name: 'constructor', kind: 'constructor', filePath,
    startLine: range.startLine, endLine: range.endLine,
    signature: `${modifiers.join(' ')} ${name}${params}`.trim(),
    parameters: params, modifiers, decorators: annotations,
    parentName: className, isExported: modifiers.includes('public'),
    docComment, complexity,
  });
  if (body) extractJavaCalls(body, source, filePath, `${className}.constructor`, relationships);
}

export function extractFields(
  node: SyntaxNode, source: string, filePath: string,
  className: string, symbols: ExtractedSymbol[],
): void {
  const range = getNodeRange(node);
  const modifiers = extractJavaModifiers(node, source);
  const annotations = extractJavaAnnotations(node, source);
  const typeText = getFieldType(node, source);
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
      parentName: className, isExported: modifiers.includes('public'),
    });
  }
}
