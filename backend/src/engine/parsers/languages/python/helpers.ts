import type { SyntaxNode } from '../../types.js';
import { getNodeText, getNamedChild, findNodes, walkTree } from '../../ast-utils.js';

export function getDecorators(node: SyntaxNode, source: string): string[] {
  const decorators: string[] = [];
  for (let i = 0; i < node.namedChildCount; i++) {
    const child = node.namedChild(i);
    if (!child || child.type !== 'decorator') continue;
    const text = getNodeText(child, source).replace(/^@/, '').split('(')[0].trim();
    decorators.push(text);
  }
  return decorators;
}

export function extractPythonReturnType(node: SyntaxNode, source: string): string | undefined {
  const typeNode = getNamedChild(node, 'type');
  if (typeNode) return getNodeText(typeNode, source);
  return undefined;
}

export function extractDocstring(body: SyntaxNode, source: string): string | null {
  const firstChild = body.namedChild(0);
  if (!firstChild || firstChild.type !== 'expression_statement') return null;
  const expr = firstChild.namedChild(0);
  if (!expr || expr.type !== 'string') return null;
  const text = getNodeText(expr, source);
  return text.replace(/^("""|''')\s*/, '').replace(/\s*("""|''')$/, '').trim().slice(0, 500) || null;
}

export function calculatePythonComplexity(node: SyntaxNode): number {
  let complexity = 1;
  const branchTypes = new Set([
    'if_statement', 'elif_clause', 'for_statement', 'while_statement',
    'except_clause', 'with_statement', 'case_clause', 'assert_statement',
  ]);
  walkTree(node, {
    enter(n) {
      if (branchTypes.has(n.type)) complexity++;
      if (n.type === 'boolean_operator') complexity++;
      if (n.type === 'conditional_expression') complexity++;
      if (['list_comprehension', 'set_comprehension', 'dictionary_comprehension', 'generator_expression'].includes(n.type)) complexity++;
    }
  });
  return complexity;
}

export function buildPythonFunctionSignature(isAsync: boolean, name: string, params: string, returnType: string | undefined): string {
  const prefix = isAsync ? 'async ' : '';
  const ret = returnType ? ` -> ${returnType}` : '';
  return `${prefix}def ${name}${params}${ret}`.slice(0, 500);
}

export function extractModuleName(stmt: SyntaxNode, source: string): string {
  for (let i = 0; i < stmt.childCount; i++) {
    const child = stmt.child(i);
    if (!child) continue;
    if (child.type === 'dotted_name' || child.type === 'relative_import') return getNodeText(child, source);
  }
  return '';
}

export function getImportedIdentifiers(stmt: SyntaxNode, source: string): string[] {
  const names: string[] = [];
  let afterImport = false;
  for (let i = 0; i < stmt.childCount; i++) {
    const child = stmt.child(i);
    if (!child) continue;
    if (child.type === 'import') { afterImport = true; continue; }
    if (afterImport && (child.type === 'dotted_name' || child.type === 'identifier')) names.push(getNodeText(child, source));
  }
  return names;
}
