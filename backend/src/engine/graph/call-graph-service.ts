/**
 * KSA-154: Call Graph Service - BFS traversal for callers/callees.
 * Provides transitive call graph analysis with depth control.
 */

import { GraphRepository, CallerResult, CalleeResult } from '../database/graph-repository.js';
import { SymbolResolver, ResolvedSymbol } from './symbol-resolver.js';

export interface CallGraphItem {
  symbol: string;
  qualifiedName: string;
  kind: string;
  filePath: string;
  definitionLine: number;
  callSiteLine: number;
  depthLevel: number;
  parameters?: string | null;
  isAsync?: boolean;
}

export interface CallGraphResponse {
  symbol: string;
  resolvedTo: Array<{ id: number; file: string; line: number; kind: string }>;
  results: CallGraphItem[];
  metadata: {
    totalCount: number;
    depthSearched: number;
    truncated: boolean;
    queryTimeMs: number;
  };
}

export class CallGraphService {
  private graphRepo: GraphRepository;
  private symbolResolver: SymbolResolver;

  constructor(graphRepo: GraphRepository, symbolResolver: SymbolResolver) {
    this.graphRepo = graphRepo;
    this.symbolResolver = symbolResolver;
  }

  /** Find all callers of a symbol with transitive depth. */
  async findCallers(
    symbolName: string,
    depth: number = 1,
    limit: number = 20,
    fileFilter?: string,
    kindFilter: string | string[] = 'calls'
  ): Promise<CallGraphResponse> {
    const startTime = Date.now();
    const clampedDepth = Math.min(Math.max(depth, 1), 5);

    const resolved = await this.symbolResolver.resolve(symbolName);
    if (resolved.length === 0) {
      return await this.symbolNotFoundResponse(symbolName);
    }

    // KSA-191: Support multiple kind filters (SF call types: flow-action, wire, apex-import)
    const kinds = Array.isArray(kindFilter) ? kindFilter : [kindFilter];

    const results: CallGraphItem[] = [];
    const visited = new Set<number>();
    const queue: Array<{ symbolName: string; depth: number }> = [];

    for (const sym of resolved) {
      queue.push({ symbolName: sym.name, depth: 0 });
    }

    while (queue.length > 0 && results.length < limit) {
      const { symbolName: current, depth: currentDepth } = queue.shift()!;
      if (currentDepth >= clampedDepth) continue;

      // Query for each kind
      for (const kind of kinds) {
        const callers = await this.graphRepo.findCallers(current, kind, limit - results.length);

        for (const caller of callers) {
          if (visited.has(caller.id)) continue;
          visited.add(caller.id);

          const item: CallGraphItem = {
            symbol: caller.name,
            qualifiedName: caller.parameters ? `${caller.parameters}.${caller.name}` : caller.name,
            kind: caller.kind,
            filePath: caller.file_path,
            definitionLine: caller.def_line,
            callSiteLine: caller.call_line,
            depthLevel: currentDepth + 1,
            parameters: caller.parameters,
            isAsync: caller.is_async === 1,
          };

          if (fileFilter && !this.matchFilter(item.filePath, fileFilter)) continue;

          results.push(item);

          if (currentDepth + 1 < clampedDepth) {
            queue.push({ symbolName: caller.name, depth: currentDepth + 1 });
          }
        }
      }
    }

    return {
      symbol: symbolName,
      resolvedTo: resolved.map(s => ({ id: s.id, file: s.filePath, line: s.line, kind: s.kind })),
      results,
      metadata: {
        totalCount: results.length,
        depthSearched: clampedDepth,
        truncated: results.length >= limit,
        queryTimeMs: Date.now() - startTime,
      },
    };
  }

  /** Find all callees of a symbol with transitive depth. */
  async findCallees(
    symbolName: string,
    depth: number = 1,
    limit: number = 20,
    fileFilter?: string,
    includeExternal: boolean = true,
    kindFilter: string | string[] = 'calls'
  ): Promise<CallGraphResponse> {
    const startTime = Date.now();
    const clampedDepth = Math.min(Math.max(depth, 1), 5);

    const resolved = await this.symbolResolver.resolve(symbolName);
    if (resolved.length === 0) {
      return await this.symbolNotFoundResponse(symbolName);
    }

    // KSA-191: Support multiple kind filters (SF: dml, soql, trigger-on)
    const kinds = Array.isArray(kindFilter) ? kindFilter : [kindFilter];

    const results: CallGraphItem[] = [];
    const visited = new Set<string>();
    const queue: Array<{ symbolId: number; depth: number }> = [];

    for (const sym of resolved) {
      queue.push({ symbolId: sym.id, depth: 0 });
    }

    while (queue.length > 0 && results.length < limit) {
      const { symbolId, depth: currentDepth } = queue.shift()!;
      if (currentDepth >= clampedDepth) continue;

      for (const kind of kinds) {
        const callees = await this.graphRepo.findCallees(symbolId, kind, limit - results.length);

        for (const callee of callees) {
          const key = `${callee.name}:${callee.call_line}`;
          if (visited.has(key)) continue;
          visited.add(key);

          if (!includeExternal && !callee.file_path) continue;

          const item: CallGraphItem = {
            symbol: callee.name,
            qualifiedName: callee.name,
            kind: callee.kind || 'unknown',
            filePath: callee.file_path || '(external)',
            definitionLine: callee.def_line || 0,
            callSiteLine: callee.call_line,
            depthLevel: currentDepth + 1,
          };

          if (fileFilter && item.filePath !== '(external)' && !this.matchFilter(item.filePath, fileFilter)) continue;

          results.push(item);

          if (callee.file_path && currentDepth + 1 < clampedDepth) {
            const calleeResolved = await this.symbolResolver.resolve(callee.name);
            for (const cr of calleeResolved) {
              if (cr.filePath === callee.file_path) {
                queue.push({ symbolId: cr.id, depth: currentDepth + 1 });
                break;
              }
            }
          }
        }
      }
    }

    return {
      symbol: symbolName,
      resolvedTo: resolved.map(s => ({ id: s.id, file: s.filePath, line: s.line, kind: s.kind })),
      results,
      metadata: {
        totalCount: results.length,
        depthSearched: clampedDepth,
        truncated: results.length >= limit,
        queryTimeMs: Date.now() - startTime,
      },
    };
  }

  private async symbolNotFoundResponse(symbolName: string): Promise<CallGraphResponse> {
    const suggestions = await this.symbolResolver.suggest(symbolName);
    return {
      symbol: symbolName,
      resolvedTo: [],
      results: [],
      metadata: { totalCount: 0, depthSearched: 0, truncated: false, queryTimeMs: 0 },
    };
  }

  private matchFilter(filePath: string, filter: string): boolean {
    if (filter.includes('*')) {
      const regex = new RegExp('^' + filter.replace(/\*/g, '.*') + '$');
      return regex.test(filePath);
    }
    return filePath.includes(filter);
  }
}


