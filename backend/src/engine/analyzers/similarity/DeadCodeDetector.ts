/**
 * KSA-168: Dead Code Detector — Find unreachable code using call graph reachability.
 * BFS from entry points through call graph, then score unreachable functions.
 *
 * BR-18 facade — graph queries + BFS live in ./DeadCodeDetector/reachability.ts,
 * confidence scoring in ./DeadCodeDetector/scoring.ts.
 */

import type { DatabaseAdapter } from '../../../database/adapters/DatabaseAdapter.js';
import type { DeadCodeCandidate, DeadCodeReport } from './types.js';
import { computeReachability, getAllFunctions, getEntryPoints } from './DeadCodeDetector/reachability.js';
import { scoreCandidate } from './DeadCodeDetector/scoring.js';

export interface FunctionInfo {
  id: number;
  name: string;
  kind: string;
  filePath: string;
  startLine: number;
  isExported: boolean;
  isAsync: boolean;
  hasDecorators: boolean;
  hasTests: boolean;
}

export class DeadCodeDetector {
  private adapter: DatabaseAdapter;
  private minConfidence: number;
  private projectId: string | undefined;

  /**
   * @param projectId  SA4E-41 tenant scope. Undefined ⇒ fail-closed (no rows).
   */
  constructor(adapter: DatabaseAdapter, minConfidence: number = 60, projectId?: string) {
    this.adapter = adapter;
    this.minConfidence = minConfidence;
    this.projectId = projectId;
  }

  /** Detect dead code with confidence scoring. */
  async detect(options: { filePath?: string; module?: string; limit?: number } = {}): Promise<DeadCodeReport> {
    const t0 = performance.now();

    // 1. Get all entry points
    const entryPointIds = await getEntryPoints(this.adapter, this.projectId);

    // 2. Compute reachability via BFS
    const reachable = await computeReachability(this.adapter, this.projectId, entryPointIds);

    // 3. Get all functions
    const allFunctions = await getAllFunctions(this.adapter, this.projectId, options.filePath, options.module);

    // 4. Find unreachable functions
    const unreachable = allFunctions.filter(f => !reachable.has(f.id));

    // 5. Score each candidate
    const candidates: DeadCodeCandidate[] = [];
    for (const func of unreachable) {
      const { confidence, reasons } = await scoreCandidate(this.adapter, this.projectId, func);
      if (confidence >= this.minConfidence) {
        candidates.push({
          symbolId: func.id,
          name: func.name,
          kind: func.kind,
          filePath: func.filePath,
          startLine: func.startLine,
          confidence,
          reasons,
        });
      }
    }

    // Sort by confidence descending
    candidates.sort((a, b) => b.confidence - a.confidence);
    const limit = options.limit ?? 50;

    const elapsed = performance.now() - t0;
    return {
      candidates: candidates.slice(0, limit),
      totalFunctions: allFunctions.length,
      reachableCount: reachable.size,
      unreachableCount: unreachable.length,
      scanDurationMs: Math.round(elapsed),
    };
  }
}
