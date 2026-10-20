/**
 * Dependency-graph analysis algorithms (BR-18 extraction from PegaReferenceExtractor).
 * Pure functions over DependencyGraph; the class methods delegate to these.
 */
import type { DependencyGraph } from './reference-maps.js';

export function findCyclesImpl(graph: DependencyGraph): string[][] {
  const adjacency = new Map<string, string[]>();
  for (const node of graph.nodes) {
    adjacency.set(node.fqn, []);
  }
  for (const edge of graph.edges) {
    const existing = adjacency.get(edge.source) ?? [];
    existing.push(edge.target);
    adjacency.set(edge.source, existing);
  }

  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recStack = new Set<string>();
  const path: string[] = [];

  const dfs = (node: string): void => {
    if (recStack.has(node)) {
      // Found a cycle — extract it
      const cycleStart = path.indexOf(node);
      if (cycleStart >= 0) {
        cycles.push([...path.slice(cycleStart), node]);
      }
      return;
    }
    if (visited.has(node)) return;

    visited.add(node);
    recStack.add(node);
    path.push(node);

    const neighbors = adjacency.get(node) ?? [];
    for (const neighbor of neighbors) {
      dfs(neighbor);
    }

    path.pop();
    recStack.delete(node);
  };

  for (const node of graph.nodes) {
    if (!visited.has(node.fqn)) {
      dfs(node.fqn);
    }
  }

  return cycles;
}

export function calculateDepthImpl(name: string, graph: DependencyGraph): number {
  // Build adjacency: node -> list of targets
  const adjacency = new Map<string, string[]>();
  for (const node of graph.nodes) {
    adjacency.set(node.fqn, []);
  }
  for (const edge of graph.edges) {
    const existing = adjacency.get(edge.source) ?? [];
    existing.push(edge.target);
    adjacency.set(edge.source, existing);
  }

  // Find the node by name
  const targetNodes = graph.nodes.filter(n => n.name === name);
  if (targetNodes.length === 0) return -1;

  // BFS from the target node following edges forward
  const visited = new Set<string>();
  const queue: Array<{ fqn: string; depth: number }> = targetNodes.map(n => ({ fqn: n.fqn, depth: 0 }));
  let maxDepth = 0;

  for (const item of queue) {
    if (visited.has(item.fqn)) continue;
    visited.add(item.fqn);
    maxDepth = Math.max(maxDepth, item.depth);

    const neighbors = adjacency.get(item.fqn) ?? [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        queue.push({ fqn: neighbor, depth: item.depth + 1 });
      }
    }
  }

  return maxDepth;
}

export function findOrphansImpl(graph: DependencyGraph): string[] {
  const referenced = new Set<string>();
  for (const edge of graph.edges) {
    referenced.add(edge.target);
  }
  // An orphan is a node that is not referenced by any edge as target
  return graph.nodes
    .filter(n => !referenced.has(n.fqn))
    .map(n => n.name);
}

export function getDependentsImpl(name: string, graph: DependencyGraph): string[] {
  // Find all nodes that depend on any node with the given name
  const targetFqns = new Set(graph.nodes.filter(n => n.name === name).map(n => n.fqn));
  const dependents: string[] = [];

  for (const edge of graph.edges) {
    if (targetFqns.has(edge.target)) {
      // Skip self-references (source === target)
      if (targetFqns.has(edge.source)) continue;
      const source = graph.nodes.find(n => n.fqn === edge.source);
      if (source && !dependents.includes(source.name)) {
        dependents.push(source.name);
      }
    }
  }

  return dependents;
}

export function getAllDependentsImpl(fqn: string, graph: DependencyGraph): string[] {
  const result: string[] = [];
  const queue = [fqn];
  const visited = new Set<string>();

  for (const target of queue) {
    if (visited.has(target)) continue;
    visited.add(target);

    for (const edge of graph.edges) {
      if (edge.target === target) {
        // Skip self-references
        if (edge.source === fqn) continue;
        if (edge.source === edge.target) continue;
        const sourceName = graph.nodes.find(n => n.fqn === edge.source)?.name;
        if (sourceName && !result.includes(sourceName)) {
          result.push(sourceName);
        }
        if (!visited.has(edge.source)) {
          queue.push(edge.source);
        }
      }
    }
  }

  return result;
}
