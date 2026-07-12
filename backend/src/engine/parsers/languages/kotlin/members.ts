import type { SyntaxNode, ExtractedSymbol, ExtractedRelationship, SymbolKind } from '../../types.js';
import { getNodeText, getNodeRange, findNodes, findFirst } from '../../ast-utils.js';
import {
  extractKotlinModifiers, getKotlinAnnotationNames, extractTypeParameters,
  extractPrimaryConstructor, extractFunctionParameters, extractKotlinReturnType,
  extractReceiverType, calculateKotlinComplexity, buildKotlinFunctionSignature,
} from './helpers.js';
import { extractKotlinCalls } from './calls.js';
import { extractSupertypes, generateDataClassMembers, extractDeclarationsInNode } from './dispatchable.js';

export function extractClass(
  node: SyntaxNode, source: string, filePath: string,
  symbols: ExtractedSymbol[], relationships: ExtractedRelationship[],
  parentName: string | undefined,
): void {
  const nameNode = findFirst(node, 'type_identifier');
  if (!nameNode) return;
  const name = getNodeText(nameNode, source);
  const modifiers = extractKotlinModifiers(node, source);
  const annotations = getKotlinAnnotationNames(node, source);
  const nodeText = getNodeText(node, source).split('{')[0];
  const isInterface = nodeText.match(/\binterface\b/) !== null;
  const isEnum = modifiers.includes('enum');
  const isData = modifiers.includes('data');
  const kind: SymbolKind = isInterface ? 'interface' : isEnum ? 'enum' : 'class';
  const typeParams = extractTypeParameters(node, source);
  const params = extractPrimaryConstructor(node, source);
  const delegationSpecs = findFirst(node, 'delegation_specifiers');
  if (delegationSpecs) extractSupertypes(delegationSpecs, source, name, filePath, relationships);
  const modPrefix = modifiers.filter(m => !['public', 'internal'].includes(m)).join(' ');
  const kindStr = isInterface ? 'interface' : 'class';
  const sig = `${modPrefix ? modPrefix + ' ' : ''}${kindStr} ${name}${typeParams}${params ? `(${params})` : ''}`;
  symbols.push({
    name, kind, filePath, ...getNodeRange(node),
    signature: sig.trim().slice(0, 500), parameters: params || undefined,
    modifiers: modifiers.length > 0 ? modifiers : undefined,
    parentName: parentName ?? null,
    isExported: !modifiers.includes('private'),
    decorators: annotations.length > 0 ? annotations : undefined,
  });
  const classBody = findFirst(node, 'class_body');
  if (classBody) {
    extractDeclarationsInNode(classBody, source, filePath, symbols, relationships, name);
    extractCompanionObjects(classBody, source, filePath, symbols, relationships, name);
  }
  if (isData && params) generateDataClassMembers(name, filePath, node, symbols);
}

export function extractObject(
  node: SyntaxNode, source: string, filePath: string,
  symbols: ExtractedSymbol[], relationships: ExtractedRelationship[],
  parentName: string | undefined,
): void {
  const nameNode = findFirst(node, 'type_identifier') ?? findFirst(node, 'simple_identifier');
  if (!nameNode) return;
  const name = getNodeText(nameNode, source);
  const modifiers = extractKotlinModifiers(node, source);
  const delegationSpecs = findFirst(node, 'delegation_specifiers');
  if (delegationSpecs) extractSupertypes(delegationSpecs, source, name, filePath, relationships);
  symbols.push({
    name, kind: 'class', filePath, ...getNodeRange(node),
    signature: `object ${name}`, modifiers: [...modifiers, 'object'],
    parentName: parentName ?? null, isExported: !modifiers.includes('private'),
  });
  const classBody = findFirst(node, 'class_body');
  if (classBody) extractDeclarationsInNode(classBody, source, filePath, symbols, relationships, name);
}

function extractCompanionObjects(
  classBody: SyntaxNode, source: string, filePath: string,
  symbols: ExtractedSymbol[], relationships: ExtractedRelationship[],
  className: string,
): void {
  const companions = findNodes(classBody, 'companion_object');
  for (const comp of companions) {
    symbols.push({
      name: 'Companion', kind: 'class', filePath, ...getNodeRange(comp),
      signature: 'companion object', modifiers: ['companion', 'object'],
      parentName: className,
    });
    const body = findFirst(comp, 'class_body');
    if (body) extractDeclarationsInNode(body, source, filePath, symbols, relationships, `${className}.Companion`);
  }
}

export function extractFunction(
  node: SyntaxNode, source: string, filePath: string,
  symbols: ExtractedSymbol[], relationships: ExtractedRelationship[],
  parentName: string | undefined,
): void {
  const nameNode = findFirst(node, 'simple_identifier');
  if (!nameNode) return;
  const name = getNodeText(nameNode, source);
  const modifiers = extractKotlinModifiers(node, source);
  const isSuspend = modifiers.includes('suspend');
  const annotations = getKotlinAnnotationNames(node, source);
  const receiverType = extractReceiverType(node, source);
  const params = extractFunctionParameters(node, source);
  const returnType = extractKotlinReturnType(node, source);
  const body = findFirst(node, 'function_body');
  const complexity = body ? calculateKotlinComplexity(body) : 1;
  const kind: SymbolKind = parentName ? 'method' : 'function';
  const sig = buildKotlinFunctionSignature(modifiers, receiverType, name, params, returnType);
  symbols.push({
    name, kind, filePath, ...getNodeRange(node), signature: sig,
    parameters: params || undefined, returnType: returnType ?? undefined,
    modifiers: receiverType ? [...modifiers, 'extension'] : (modifiers.length > 0 ? modifiers : undefined),
    parentName: parentName ?? null, isAsync: isSuspend,
    isExported: !modifiers.includes('private'), complexity,
    decorators: annotations.length > 0 ? annotations : undefined,
  });
  if (body) {
    const callerName = parentName ? `${parentName}.${name}` : name;
    extractKotlinCalls(body, source, callerName, filePath, relationships);
  }
}

export function extractProperty(
  node: SyntaxNode, source: string, filePath: string,
  symbols: ExtractedSymbol[], relationships: ExtractedRelationship[],
  parentName: string | undefined,
): void {
  const varDecl = findFirst(node, 'variable_declaration');
  if (!varDecl) return;
  const nameNode = findFirst(varDecl, 'simple_identifier');
  if (!nameNode) return;
  const name = getNodeText(nameNode, source);
  const modifiers = extractKotlinModifiers(node, source);
  const annotations = getKotlinAnnotationNames(node, source);
  const nodeText = getNodeText(node, source);
  const isVal = nodeText.trimStart().startsWith('val ') || nodeText.match(/\bval\b/) !== null;
  const isConst = modifiers.includes('const');
  const typeNode = findFirst(varDecl, 'user_type') ?? findFirst(varDecl, 'nullable_type');
  const type = typeNode ? getNodeText(typeNode, source) : undefined;
  const kind: SymbolKind = isConst ? 'constant' : 'property';
  const sig = `${isVal ? 'val' : 'var'} ${name}${type ? ': ' + type : ''}`;
  symbols.push({
    name, kind, filePath, ...getNodeRange(node), signature: sig.slice(0, 200),
    returnType: type ?? undefined,
    modifiers: modifiers.length > 0 ? modifiers : undefined,
    parentName: parentName ?? null, isExported: !modifiers.includes('private'),
    decorators: annotations.length > 0 ? annotations : undefined,
  });
}

export function extractTypeAlias(
  node: SyntaxNode, source: string, filePath: string,
  symbols: ExtractedSymbol[], parentName: string | undefined,
): void {
  const nameNode = findFirst(node, 'type_identifier');
  if (!nameNode) return;
  const name = getNodeText(nameNode, source);
  symbols.push({
    name, kind: 'type', filePath, ...getNodeRange(node),
    signature: getNodeText(node, source).split('\n')[0].trim().slice(0, 200),
    parentName: parentName ?? null, isExported: true,
  });
}


