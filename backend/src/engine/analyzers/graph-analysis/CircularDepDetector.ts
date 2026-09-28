/**
 * KSA-163: Circular Dependency Detector using Tarjan's SCC.
 */

import type { CircularDep, CycleChain, CycleNode, AdjacencyList } from './types.js';
import { GraphLoader } from './utils/GraphLoader.js';
import { TarjanSCC } from './utils/TarjanSCC.js';

export class CircularDepDetector {
  private graphLoader: GraphLoader;

  constructor(graphLoader: GraphLoader) {
    this.graphLoader = graphLoader;
  }

  /** Find all circular dependencies in the codebase. */
  async detect(options: { module?: string; maxLength?: number } = {}): Promise<CircularDep[]> {
    const graph = await this.graphLoader.loadDependencyGraph(options.module);
    if (graph.size === 0) return [];

    const tarjan = new TarjanSCC();
    const sccs = tarjan.findSCCs(graph);

    const results: CircularDep[] = [];
    for (const scc of sccs) {
      if (options.maxLength && scc.length > options.maxLength) continue;

      const cycle = await this.extractCycleChain(scc, graph);
      results.push({
        cycle,
        length: scc.length,
        severity: this.classifySeverity(scc.length),
        module: options.module,
      });
    }

    // Sort by severity (high first) then by length
    return results.sort((a, b) => {
      const sevOrder = { high: 0, medium: 1, low: 2 };
      const sevDiff = sevOrder[a.severity] - sevOrder[b.severity];
      return sevDiff !== 0 ? sevDiff : a.length - b.length;
    });
  }

  private async extractCycleChain(scc: number[], graph: AdjacencyList): Promise<CycleChain> {
    // Get symbol info for all nodes in the SCC
    const symbolInfos = await this.graphLoader.getSymbolInfoBatch(scc);
    const sccSet = new Set(scc);

    const nodes: CycleNode[] = [];
    const edges: string[] = [];

    // Build ordered cycle by following edges within the SCC
    const visited = new Set<number>();
    const ordered: number[] = [];
    let current = scc[0];

    while (!visited.has(current)) {
      visited.add(current);
      ordered.push(current);
      const neighbors = graph.get(current) || [];
      const next = neighbors.find(n => sccSet.has(n) && !visited.has(n));
      if (next === undefined) break;
      current = next;
    }

    // If we didn't visit all, just use original order
    const finalOrder = ordered.length === scc.length ? ordered : scc;

    for (let i = 0; i < finalOrder.length; i++) {
      const id = finalOrder[i];
      const info = symbolInfos.get(id);
      nodes.push({
        symbolId: id,
        name: info?.name ?? `symbol_${id}`,
        filePath: info?.filePath ?? 'unknown',
        kind: info?.kind ?? 'unknown',
      });

      const nextId = finalOrder[(i + 1) % finalOrder.length];
      const nextInfo = symbolInfos.get(nextId);
      edges.push(`${info?.name ?? id} → ${nextInfo?.name ?? nextId}`);
    }

    return { nodes, edges };
  }

  private classifySeverity(length: number): 'high' | 'medium' | 'low' {
    if (length <= 2) return 'high';   // Direct mutual dependency
    if (length <= 4) return 'medium'; // Short cycle
    return 'low';                     // Long cycle (less impactful)
  }
}
