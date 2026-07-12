/**
 * KSA-164: Basic Block — Fundamental unit of a control flow graph.
 */

import type { SyntaxNode } from '../../../parsers/types.js';
import type { BlockType, Statement, VariableDef, VariableUse } from '../types/index.js';

export class BasicBlock {
  readonly id: number;
  readonly type: BlockType;
  readonly statements: Statement[] = [];
  startLine: number = 0;
  endLine: number = 0;

  constructor(id: number, type: BlockType) {
    this.id = id;
    this.type = type;
  }

  addStatement(node: SyntaxNode): void {
    const stmt: Statement = {
      node,
      line: node.startPosition.row + 1,
      type: node.type,
      text: node.text.slice(0, 120),
    };
    this.statements.push(stmt);
    if (this.statements.length === 1) this.startLine = stmt.line;
    this.endLine = stmt.line;
  }

  /** Extract variable definitions from this block's statements. */
  getDefinitions(): VariableDef[] {
    const defs: VariableDef[] = [];
    for (const stmt of this.statements) {
      const extracted = extractDefinitions(stmt.node, this.id);
      defs.push(...extracted);
    }
    return defs;
  }

  /** Extract variable uses from this block's statements. */
  getUses(): VariableUse[] {
    const uses: VariableUse[] = [];
    for (const stmt of this.statements) {
      const extracted = extractUses(stmt.node, this.id);
      uses.push(...extracted);
    }
    return uses;
  }

  get isEmpty(): boolean {
    return this.statements.length === 0;
  }
}

/** Extract variable definitions from an AST node. */
function extractDefinitions(node: SyntaxNode, blockId: number): VariableDef[] {
  const defs: VariableDef[] = [];
  const type = node.type;

  // Variable declarations: let x = ..., const y = ..., var z = ...
  if (type === 'lexical_declaration' || type === 'variable_declaration') {
    for (let i = 0; i < node.namedChildCount; i++) {
      const declarator = node.namedChild(i);
      if (declarator && declarator.type === 'variable_declarator') {
        const nameNode = declarator.childForFieldName('name');
        if (nameNode) {
          defs.push({ name: nameNode.text, line: nameNode.startPosition.row + 1, blockId, node: nameNode });
        }
      }
    }
  }

  // Assignment expressions: x = ...
  if (type === 'assignment_expression' || type === 'augmented_assignment_expression') {
    const left = node.childForFieldName('left');
    if (left && left.type === 'identifier') {
      defs.push({ name: left.text, line: left.startPosition.row + 1, blockId, node: left });
    }
  }

  // Expression statement wrapping assignment
  if (type === 'expression_statement') {
    const expr = node.namedChild(0);
    if (expr) {
      defs.push(...extractDefinitions(expr, blockId));
    }
  }

  // Python: assignment
  if (type === 'assignment') {
    const left = node.childForFieldName('left');
    if (left && left.type === 'identifier') {
      defs.push({ name: left.text, line: left.startPosition.row + 1, blockId, node: left });
    }
  }

  // For loop variable
  if (type === 'for_statement' || type === 'for_in_statement') {
    const init = node.childForFieldName('initializer') ?? node.childForFieldName('left');
    if (init && init.type === 'identifier') {
      defs.push({ name: init.text, line: init.startPosition.row + 1, blockId, node: init });
    }
  }

  return defs;
}

/** Extract variable uses from an AST node (identifiers in read position). */
function extractUses(node: SyntaxNode, blockId: number): VariableUse[] {
  const uses: VariableUse[] = [];
  collectIdentifiers(node, uses, blockId, new Set());
  return uses;
}

function collectIdentifiers(node: SyntaxNode, uses: VariableUse[], blockId: number, seen: Set<string>): void {
  if (node.type === 'identifier') {
    const key = `${node.text}:${node.startPosition.row}`;
    if (!seen.has(key)) {
      seen.add(key);
      uses.push({ name: node.text, line: node.startPosition.row + 1, blockId, node });
    }
    return;
  }
  for (let i = 0; i < node.childCount; i++) {
    const child = node.child(i);
    if (child) collectIdentifiers(child, uses, blockId, seen);
  }
}
