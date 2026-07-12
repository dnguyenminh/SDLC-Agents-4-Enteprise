/**
 * KSA-157: Graph Traverser - generic BFS/DFS engine with edge/node type filtering.
 * Provides the core traversal logic for the code_traverse MCP tool.
 */

import Database from 'better-sqlite3';
import { SymbolResolver } from './symbol-resolver.js';
import { getNeighbors, getSourceSnippet } from './traverse-helpers.js';

export interface GraphNode {
  id: number;
  name: string;
  kind: string;
  filePath: string;
  startLine: number;
  _incomingEdgeType?: string;
}

export interface TraverseConfig {
  edgeTypes: string[];
  nodeTypes: string[];
  direction: 'outgoing' | 'incoming' | 'both';
  maxDepth: number;
  maxResults: number;
}

export interface TraverseResultItem {
  node: GraphNode;
  depth: number;
  path: string[];
  edgeType: string;
}

export interface TraverseResponse {
  start: { name: string; kind: string; file: string; line: number };
  results: Array<{
    name: string;
    kind: string;
    file: string;
    line: number;
    depth: number;
    edge_type: string;
    source?: string;
  }>;
  metadata: {
    total_traversed: number;
    total_results: number;
    max_depth_reached: number;
    truncated: boolean;
    execution_time_ms: number;
  };
}

export class GraphTraverser {
  private db: Database.Database;
  private resolver: SymbolResolver;
  private workspace: string;

  constructor(db: Database.Database, resolver: SymbolResolver, workspace: string) {
    this.db = db;
    this.resolver = resolver;
    this.workspace = workspace;
  }

  resolveNode(identifier: string): GraphNode | null {
    const resolved = this.resolver.resolve(identifier);
    if (resolved.length === 0) return null;
    return {
      id: resolved[0].id,
      name: resolved[0].name,
      kind: resolved[0].kind,
      filePath: resolved[0].filePath,
      startLine: resolved[0].line,
    };
  }

  traverse(startNode: GraphNode, config: TraverseConfig): TraverseResultItem[] {
    const visited = new Set<number>();
    const queue: Array<{ node: GraphNode; depth: number; path: string[] }> = [
      { node: startNode, depth: 0, path: [startNode.name] },
    ];
    const results: TraverseResultItem[] = [];
    while (queue.length > 0 && results.length < config.maxResults) {
      const { node, depth, path: currentPath } = queue.shift()!;
      if (visited.has(node.id)) continue;
      visited.add(node.id);
      if (depth > 0) {
        if (config.nodeTypes.length === 0 || config.nodeTypes.includes(node.kind)) {
          results.push({ node, depth, path: currentPath, edgeType: node._incomingEdgeType || 'unknown' });
        }
      }
      if (depth < config.maxDepth) {
        const neighbors = getNeighbors(node.id, config, this.db);
        for (const neighbor of neighbors) {
          if (!visited.has(neighbor.id)) {
            queue.push({ node: neighbor, depth: depth + 1, path: [...currentPath, neighbor.name] });
          }
        }
      }
    }
    return results.sort((a, b) => a.depth - b.depth);
  }

  formatResponse(
    startNode: GraphNode,
    results: TraverseResultItem[],
    includeSource: boolean,
    sourceLines: number,
    executionTimeMs: number
  ): TraverseResponse {
    const formattedResults = results.map(r => {
      const formatted: any = {
        name: r.node.name,
        kind: r.node.kind,
        file: r.node.filePath,
        line: r.node.startLine,
        depth: r.depth,
        edge_type: r.edgeType,
      };
      if (includeSource) {
        formatted.source = getSourceSnippet(r.node.filePath, r.node.startLine, sourceLines, this.workspace);
      }
      return formatted;
    });
    return {
      start: { name: startNode.name, kind: startNode.kind, file: startNode.filePath, line: startNode.startLine },
      results: formattedResults,
      metadata: {
        total_traversed: results.length,
        total_results: formattedResults.length,
        max_depth_reached: Math.max(...results.map(r => r.depth), 0),
        truncated: results.length >= 50,
        execution_time_ms: executionTimeMs,
      },
    };
  }
}
