/**
 * KSA-155: Dependency Graph Service - BFS traversal on import relationships.
 * Supports outgoing (what does this file import?) and incoming (who imports this file?) queries.
 */

import Database from 'better-sqlite3';
import { FileResolver } from './file-resolver.js';
import type { DependencyNode, DependencyResult } from './dep-helpers.js';
import {
  bfsTraversal, mergeResults, fileNotFoundResponse
} from './dep-helpers.js';

export type { DependencyNode, DependencyResult } from './dep-helpers.js';

export class DependencyGraphService {
  private db: Database.Database;
  private fileResolver: FileResolver;
  private projectId: string | undefined;

  /**
   * @param projectId  SA4E-41 tenant scope. Undefined ⇒ fail-closed (no rows).
   */
  constructor(db: Database.Database, fileResolver: FileResolver, projectId?: string) {
    this.db = db;
    this.fileResolver = fileResolver;
    this.projectId = projectId;
  }

  query(
    file: string,
    direction: 'incoming' | 'outgoing' | 'both' = 'outgoing',
    depth: number = 1,
    includeExternal: boolean = false,
    limit: number = 50,
    kindFilter?: string | string[]
  ): DependencyResult {
    const startTime = Date.now();
    const clampedDepth = Math.min(Math.max(depth, 1), 5);
    const resolved = this.fileResolver.resolveFile(file);
    if (!resolved) {
      return fileNotFoundResponse(file);
    }
    const kinds = kindFilter
      ? (Array.isArray(kindFilter) ? kindFilter : [kindFilter])
      : undefined;

    let results: DependencyNode[];
    let cycles: string[][];

    if (direction === 'both') {
      const outgoing = bfsTraversal(resolved, 'outgoing', clampedDepth, includeExternal, limit, kinds, this.fileResolver, this.db, this.projectId);
      const incoming = bfsTraversal(resolved, 'incoming', clampedDepth, includeExternal, limit, kinds, this.fileResolver, this.db, this.projectId);
      results = mergeResults(outgoing.results, incoming.results);
      cycles = [...outgoing.cycles, ...incoming.cycles];
    } else {
      const traversal = bfsTraversal(resolved, direction, clampedDepth, includeExternal, limit, kinds, this.fileResolver, this.db, this.projectId);
      results = traversal.results;
      cycles = traversal.cycles;
    }

    return {
      root: resolved,
      direction,
      results,
      cycles,
      metadata: {
        totalNodes: results.length,
        maxDepthReached: Math.min(clampedDepth, Math.max(...results.map(r => r.depth), 0)),
        truncated: results.length >= limit,
        queryTimeMs: Date.now() - startTime,
        externalCount: results.filter(r => r.isExternal).length,
      },
    };
  }
}
