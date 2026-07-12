/**
 * KSA-164: Taint Propagator — Propagates taint state through CFG blocks.
 */

import type { SyntaxNode } from '../../../parsers/types.js';
import type { BasicBlock } from '../cfg/BasicBlock.js';
import { TaintRegistry } from './TaintRegistry.js';
import type { TaintState } from './taint-types.js';
import { evaluateExpression, type ExpressionTaintResult } from './TaintExpressionEval.js';

export class TaintPropagator {
  private registry: TaintRegistry;

  constructor(registry: TaintRegistry) {
    this.registry = registry;
  }

  /** Propagate taint through a single block, updating state map. */
  propagateBlock(block: BasicBlock, state: Map<string, TaintState>): Map<string, TaintState> {
    const newState = new Map(state);
    for (const stmt of block.statements) {
      this.propagateStatement(stmt.node, newState);
    }
    return newState;
  }

  /** Propagate taint for a single statement. */
  private propagateStatement(node: SyntaxNode, state: Map<string, TaintState>): void {
    const type = node.type;
    if (type === 'lexical_declaration' || type === 'variable_declaration') {
      this.handleDeclaration(node, state);
    } else if (type === 'expression_statement') {
      const expr = node.namedChild(0);
      if (expr) this.propagateExpression(expr, state);
    } else if (type === 'assignment_expression' || type === 'augmented_assignment_expression') {
      this.handleAssignment(node, state);
    }
  }

  private handleDeclaration(node: SyntaxNode, state: Map<string, TaintState>): void {
    for (let i = 0; i < node.namedChildCount; i++) {
      const declarator = node.namedChild(i);
      if (!declarator || declarator.type !== 'variable_declarator') continue;
      const nameNode = declarator.childForFieldName('name');
      const valueNode = declarator.childForFieldName('value');
      if (!nameNode || !valueNode) continue;
      const varName = nameNode.text;
      const taintInfo = evaluateExpression(valueNode, state, this.registry);
      if (taintInfo.tainted) {
        this.setTaintState(state, varName, taintInfo, nameNode.startPosition.row + 1, valueNode.text.slice(0, 80));
      } else {
        state.delete(varName);
      }
    }
  }

  private setTaintState(state: Map<string, TaintState>, varName: string, taintInfo: ExpressionTaintResult, line: number, expression: string): void {
    state.set(varName, {
      variable: varName,
      tainted: true,
      sourceType: taintInfo.sourceType,
      sourceLine: taintInfo.sourceLine,
      steps: [...taintInfo.steps, {
        variable: varName,
        line,
        action: taintInfo.action,
        expression,
      }],
    });
  }

  private handleAssignment(node: SyntaxNode, state: Map<string, TaintState>): void {
    const left = node.childForFieldName('left');
    const right = node.childForFieldName('right');
    if (!left || !right) return;
    if (left.type !== 'identifier') return;
    const varName = left.text;
    const taintInfo = evaluateExpression(right, state, this.registry);
    if (taintInfo.tainted) {
      this.setTaintState(state, varName, taintInfo, left.startPosition.row + 1, right.text.slice(0, 80));
    } else {
      state.delete(varName);
    }
  }

  private propagateExpression(node: SyntaxNode, state: Map<string, TaintState>): void {
    if (node.type === 'assignment_expression' || node.type === 'augmented_assignment_expression') {
      this.handleAssignment(node, state);
    }
  }

  /** Evaluate if an expression produces a tainted value. */
  evaluateExpression(node: SyntaxNode, state: Map<string, TaintState>): ExpressionTaintResult {
    return evaluateExpression(node, state, this.registry);
  }
}
