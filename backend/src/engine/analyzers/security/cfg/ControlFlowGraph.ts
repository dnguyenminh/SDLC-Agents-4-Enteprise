/**
 * KSA-164: Control Flow Graph — Container for basic blocks and edges.
 */

import { BasicBlock } from './BasicBlock.js';
import { CFGEdge } from './CFGEdge.js';
import type { EdgeType } from '../types/index.js';

export class ControlFlowGraph {
  readonly entry: BasicBlock;
  readonly exits: BasicBlock[] = [];
  readonly blocks: BasicBlock[] = [];
  readonly edges: CFGEdge[] = [];
  private adjacency: Map<number, CFGEdge[]> = new Map();
  private reverseAdj: Map<number, CFGEdge[]> = new Map();

  constructor(entry: BasicBlock) {
    this.entry = entry;
    this.addBlock(entry);
  }

  addBlock(block: BasicBlock): void {
    this.blocks.push(block);
    this.adjacency.set(block.id, []);
    this.reverseAdj.set(block.id, []);
    if (block.type === 'exit') this.exits.push(block);
  }

  addEdge(from: BasicBlock, to: BasicBlock, type: EdgeType, label?: string): CFGEdge {
    const edge = new CFGEdge(from, to, type, label);
    this.edges.push(edge);
    this.adjacency.get(from.id)!.push(edge);
    this.reverseAdj.get(to.id)!.push(edge);
    return edge;
  }

  getSuccessors(block: BasicBlock): BasicBlock[] {
    return (this.adjacency.get(block.id) ?? []).map(e => e.to);
  }

  getPredecessors(block: BasicBlock): BasicBlock[] {
    return (this.reverseAdj.get(block.id) ?? []).map(e => e.from);
  }

  getOutEdges(block: BasicBlock): CFGEdge[] {
    return this.adjacency.get(block.id) ?? [];
  }

  getInEdges(block: BasicBlock): CFGEdge[] {
    return this.reverseAdj.get(block.id) ?? [];
  }

  /** Topological sort using DFS (for acyclic portions). */
  topologicalOrder(): BasicBlock[] {
    const visited = new Set<number>();
    const result: BasicBlock[] = [];

    const dfs = (block: BasicBlock) => {
      if (visited.has(block.id)) return;
      visited.add(block.id);
      for (const succ of this.getSuccessors(block)) {
        dfs(succ);
      }
      result.unshift(block);
    };

    dfs(this.entry);
    return result;
  }

  /** Reverse post-order traversal (optimal for dataflow iteration). */
  reversePostOrder(): BasicBlock[] {
    const visited = new Set<number>();
    const postOrder: BasicBlock[] = [];

    const dfs = (block: BasicBlock) => {
      if (visited.has(block.id)) return;
      visited.add(block.id);
      for (const succ of this.getSuccessors(block)) {
        dfs(succ);
      }
      postOrder.push(block);
    };

    dfs(this.entry);
    return postOrder.reverse();
  }

  /** Get block by ID. */
  getBlock(id: number): BasicBlock | undefined {
    return this.blocks.find(b => b.id === id);
  }

  /** Summary for debugging. */
  toString(): string {
    const lines = [`CFG: ${this.blocks.length} blocks, ${this.edges.length} edges`];
    for (const edge of this.edges) {
      lines.push(`  ${edge.toString()}`);
    }
    return lines.join('\n');
  }
}
