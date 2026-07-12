/**
 * KSA-164: CFG Edge — Represents control flow between basic blocks.
 */

import type { EdgeType } from '../types/index.js';
import type { BasicBlock } from './BasicBlock.js';

export class CFGEdge {
  readonly from: BasicBlock;
  readonly to: BasicBlock;
  readonly type: EdgeType;
  readonly label?: string;

  constructor(from: BasicBlock, to: BasicBlock, type: EdgeType, label?: string) {
    this.from = from;
    this.to = to;
    this.type = type;
    this.label = label;
  }

  toString(): string {
    return `B${this.from.id} -[${this.type}]-> B${this.to.id}`;
  }
}
