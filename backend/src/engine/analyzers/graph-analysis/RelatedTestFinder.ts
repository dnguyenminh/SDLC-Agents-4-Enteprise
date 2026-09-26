/**
 * KSA-163: Related Test Finder — Reverse BFS on call graph to find tests.
 */

import type { RelatedTestResult, TestReference, CallerPath } from './types.js';
import { GraphLoader } from './utils/GraphLoader.js';
import { TestFileDetector } from './utils/TestFileDetector.js';

export class RelatedTestFinder {
  private graphLoader: GraphLoader;
  private testDetector: TestFileDetector;

  constructor(graphLoader: GraphLoader) {
    this.graphLoader = graphLoader;
    this.testDetector = new TestFileDetector();
  }

  /** Find tests related to a symbol (by name or ID). */
  async find(symbolName: string, options: { maxDepth?: number; filePath?: string } = {}): Promise<RelatedTestResult | null> {
    const symbolId = await this.graphLoader.resolveSymbolId(symbolName, options.filePath);
    if (symbolId === null) return null;

    const symbolInfo = await this.graphLoader.getSymbolInfo(symbolId);
    if (!symbolInfo) return null;

    const maxDepth = options.maxDepth ?? 3;
    const reverseGraph = await this.graphLoader.loadReverseCallGraph();
    const callerPaths = await this.reverseBFS(symbolId, reverseGraph, maxDepth);

    const directTests: TestReference[] = [];
    const indirectTests: TestReference[] = [];

    for (const caller of callerPaths) {
      const callerInfo = await this.graphLoader.getSymbolInfo(caller.symbolId);
      if (!callerInfo) continue;

      const isTest = this.testDetector.isTestFile(callerInfo.filePath) ||
                     this.testDetector.isTestFunction(callerInfo.name);

      if (isTest) {
        const chainNames = await Promise.all(
          caller.path.map(async (id) => (await this.graphLoader.getSymbolInfo(id))?.name ?? `${id}`),
        );
        const ref: TestReference = {
          symbolId: caller.symbolId,
          testName: callerInfo.name,
          filePath: callerInfo.filePath,
          depth: caller.depth,
          path: [callerInfo.name, ...chainNames],
        };

        if (caller.depth === 1) {
          directTests.push(ref);
        } else {
          indirectTests.push(ref);
        }
      }
    }

    return {
      symbol: { id: symbolId, name: symbolInfo.name, filePath: symbolInfo.filePath },
      directTests,
      indirectTests,
      totalTests: directTests.length + indirectTests.length,
    };
  }

  private async reverseBFS(startId: number, reverseGraph: Map<number, number[]>, maxDepth: number): Promise<CallerPath[]> {
    const visited = new Set<number>();
    const queue: Array<{ id: number; depth: number; path: number[] }> = [
      { id: startId, depth: 0, path: [] },
    ];
    const results: CallerPath[] = [];

    while (queue.length > 0) {
      const { id, depth, path } = queue.shift()!;
      if (depth > maxDepth || visited.has(id)) continue;
      visited.add(id);

      const callers = reverseGraph.get(id) || [];
      for (const caller of callers) {
        if (visited.has(caller)) continue;
        const newPath = [...path, id];
        const callerInfo = await this.graphLoader.getSymbolInfo(caller);
        results.push({
          symbolId: caller,
          symbolName: callerInfo?.name ?? `${caller}`,
          filePath: callerInfo?.filePath ?? 'unknown',
          depth: depth + 1,
          path: newPath,
        });
        queue.push({ id: caller, depth: depth + 1, path: newPath });
      }
    }
    return results;
  }
}
