/**
 * KSA-163: Hot Path Analyzer — Finds most-called functions via transitive callers.
 */

import type { HotPath } from './types.js';
import { GraphLoader } from './utils/GraphLoader.js';

export class HotPathAnalyzer {
  private graphLoader: GraphLoader;

  constructor(graphLoader: GraphLoader) {
    this.graphLoader = graphLoader;
  }

  /** Find hot paths (functions with most callers). */
  async analyze(options: { limit?: number; minCallers?: number; module?: string } = {}): Promise<HotPath[]> {
    const limit = options.limit ?? 20;
    const minCallers = options.minCallers ?? 2;

    const reverseGraph = await this.graphLoader.loadReverseCallGraph(options.module);

    const results: HotPath[] = [];

    for (const [symbolId] of reverseGraph) {
      const directCallers = reverseGraph.get(symbolId)?.length ?? 0;
      if (directCallers < minCallers) continue;

      const transitiveCallers = this.computeTransitiveCallers(symbolId, reverseGraph);
      const info = await this.graphLoader.getSymbolInfo(symbolId);
      if (!info) continue;

      results.push({
        symbolId,
        symbolName: info.name,
        filePath: info.filePath,
        directCallers,
        transitiveCallers,
        kind: info.kind,
      });
    }

    // Sort by transitive callers descending
    results.sort((a, b) => b.transitiveCallers - a.transitiveCallers);
    return results.slice(0, limit);
  }

  /** Compute transitive caller count using BFS on reverse graph. */
  private computeTransitiveCallers(symbolId: number, reverseGraph: Map<number, number[]>): number {
    const visited = new Set<number>();
    const queue: number[] = [symbolId];
    visited.add(symbolId);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const callers = reverseGraph.get(current) || [];
      for (const caller of callers) {
        if (!visited.has(caller)) {
          visited.add(caller);
          queue.push(caller);
        }
      }
    }

    // Subtract 1 for the symbol itself
    return visited.size - 1;
  }
}
