/**
 * KSA-164: CFG Builder — Constructs control flow graphs from AST function nodes.
 * Handles if/else, loops, try/catch, switch, and early returns.
 */

import type { SyntaxNode } from '../../../parsers/types.js';
import { BasicBlock } from './BasicBlock.js';
import { ControlFlowGraph } from './ControlFlowGraph.js';
import { getFunctionBody, processStatements } from './CFGStatementHandlers.js';

export class CFGBuilder {
  private blockCounter = 0;
  private cfg!: ControlFlowGraph;

  /** Build CFG from a function AST node. */
  build(functionNode: SyntaxNode, language: string): ControlFlowGraph {
    this.blockCounter = 0;
    const entry = this.newBlock('entry');
    this.cfg = new ControlFlowGraph(entry);
    const exit = this.newBlock('exit');
    this.cfg.addBlock(exit);
    const body = getFunctionBody(functionNode, language);
    if (!body) {
      this.cfg.addEdge(entry, exit, 'sequential');
      return this.cfg;
    }
    const lastBlock = processStatements(body, entry, exit, this.cfg, (t) => this.newBlock(t));
    if (lastBlock && lastBlock !== exit) {
      this.cfg.addEdge(lastBlock, exit, 'sequential');
    }
    return this.cfg;
  }

  private newBlock(type: BasicBlock['type']): BasicBlock {
    return new BasicBlock(this.blockCounter++, type);
  }
}
