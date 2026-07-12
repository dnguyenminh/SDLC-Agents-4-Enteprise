import type { SyntaxNode } from '../../types.js';
import { getNodeText, getNamedChild } from '../../ast-utils.js';

export interface ReceiverInfo {
  text: string;
  typeName: string;
  isPointer: boolean;
}

export function isExported(name: string): boolean {
  if (!name || name.length === 0) return false;
  return name[0] === name[0].toUpperCase() && name[0] !== name[0].toLowerCase();
}

export function extractReceiver(node: SyntaxNode | null, source: string): ReceiverInfo {
  if (!node) return { text: '', typeName: '', isPointer: false };
  const paramList = node.namedChildren;
  if (paramList.length === 0) return { text: '', typeName: '', isPointer: false };
  const paramDecl = paramList[0];
  const typeNode = paramDecl.childForFieldName('type');
  if (!typeNode) {
    const lastChild = paramDecl.namedChildren[paramDecl.namedChildren.length - 1];
    if (lastChild) {
      const isPointer = lastChild.type === 'pointer_type';
      const typeName = isPointer
        ? getNodeText(lastChild.namedChildren[0], source)
        : getNodeText(lastChild, source);
      return { text: getNodeText(paramDecl, source), typeName, isPointer };
    }
    return { text: getNodeText(paramDecl, source), typeName: '', isPointer: false };
  }
  const isPointer = typeNode.type === 'pointer_type';
  const typeName = isPointer
    ? getNodeText(typeNode.namedChildren[0], source)
    : getNodeText(typeNode, source);
  return { text: getNodeText(paramDecl, source), typeName, isPointer };
}

export function extractParams(node: SyntaxNode | null, source: string): string {
  if (!node) return '';
  return getNodeText(node, source);
}

export function extractResult(node: SyntaxNode | null, source: string): string {
  if (!node) return '';
  return getNodeText(node, source).trim();
}

export function buildFuncSignature(name: string, params: string, returnType: string): string {
  const ret = returnType ? ` ${returnType}` : '';
  return `func ${name}${params}${ret}`.slice(0, 500);
}

export function buildMethodSignature(receiver: ReceiverInfo, name: string, params: string, returnType: string): string {
  const ret = returnType ? ` ${returnType}` : '';
  const recv = receiver.text ? `(${receiver.text}) ` : '';
  return `func ${recv}${name}${params}${ret}`.slice(0, 500);
}
