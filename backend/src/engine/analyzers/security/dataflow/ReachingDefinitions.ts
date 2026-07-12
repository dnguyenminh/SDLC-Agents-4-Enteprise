/**
 * KSA-164: Reaching Definitions — Iterative dataflow algorithm.
 * Computes which definitions reach each basic block.
 */

import { BasicBlock } from '../cfg/BasicBlock.js';
import { ControlFlowGraph } from '../cfg/ControlFlowGraph.js';
import type { Definition } from '../types/index.js';

export class ReachingDefinitions {
  private defCounter = 0;

  /** Compute reaching definitions for all blocks in the CFG. */
  compute(cfg: ControlFlowGraph): Map<number, Set<Definition>> {
    const IN = new Map<number, Set<Definition>>();
    const OUT = new Map<number, Set<Definition>>();

    // Initialize
    for (const block of cfg.blocks) {
      IN.set(block.id, new Set());
      OUT.set(block.id, this.gen(block));
    }

    // Iterate until fixed point
    let changed = true;
    let iterations = 0;
    const MAX_ITERATIONS = 100;

    while (changed && iterations < MAX_ITERATIONS) {
      changed = false;
      iterations++;

      for (const block of cfg.reversePostOrder()) {
        // IN[B] = union of OUT[P] for all predecessors P
        const newIN = new Set<Definition>();
        for (const pred of cfg.getPredecessors(block)) {
          const predOut = OUT.get(pred.id);
          if (predOut) {
            for (const def of predOut) newIN.add(def);
          }
        }
        IN.set(block.id, newIN);

        // OUT[B] = GEN[B] union (IN[B] - KILL[B])
        const genSet = this.gen(block);
        const newOUT = new Set<Definition>(genSet);
        for (const def of newIN) {
          if (!this.kills(block, def)) {
            newOUT.add(def);
          }
        }

        const oldOUT = OUT.get(block.id)!;
        if (!this.setsEqual(oldOUT, newOUT)) {
          OUT.set(block.id, newOUT);
          changed = true;
        }
      }
    }

    return IN;
  }

  /** GEN set: definitions created in this block. */
  private gen(block: BasicBlock): Set<Definition> {
    const defs = new Set<Definition>();
    for (const varDef of block.getDefinitions()) {
      defs.add({
        variable: varDef.name,
        line: varDef.line,
        blockId: block.id,
        id: this.defCounter++,
      });
    }
    return defs;
  }

  /** Check if a block kills a definition (redefines the same variable). */
  private kills(block: BasicBlock, def: Definition): boolean {
    const blockDefs = block.getDefinitions();
    return blockDefs.some(d => d.name === def.variable && d.blockId === block.id);
  }

  private setsEqual(a: Set<Definition>, b: Set<Definition>): boolean {
    if (a.size !== b.size) return false;
    for (const item of a) {
      if (!b.has(item)) return false;
    }
    return true;
  }
}