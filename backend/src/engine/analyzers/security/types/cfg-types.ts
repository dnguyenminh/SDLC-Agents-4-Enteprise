import type { SyntaxNode } from '../../../parsers/types.js';

export type BlockType = 'entry' | 'exit' | 'normal' | 'branch' | 'loop-header' | 'catch';

export type EdgeType =
  | 'sequential'
  | 'branch-true'
  | 'branch-false'
  | 'loop-back'
  | 'loop-exit'
  | 'exception'
  | 'return';

export interface Statement {
  node: SyntaxNode;
  line: number;
  type: string;
  text: string;
}

export interface VariableDef {
  name: string;
  line: number;
  blockId: number;
  node: SyntaxNode;
}

export interface VariableUse {
  name: string;
  line: number;
  blockId: number;
  node: SyntaxNode;
}
