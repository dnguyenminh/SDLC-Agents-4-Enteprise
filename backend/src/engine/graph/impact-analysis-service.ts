/**
 * KSA-156: Impact Analysis Service - blast radius prediction.
 * Combines call graph + dependency graph + test detection for comprehensive impact analysis.
 */

import Database from 'better-sqlite3';
import { CallGraphService } from './call-graph-service.js';
import { DependencyGraphService } from './dependency-graph-service.js';
import { SymbolResolver } from './symbol-resolver.js';
import { TestDetector, RelatedTest } from './test-detector.js';
import type { Severity, ImpactAction, ImpactItem, ImpactResult } from './impact-helpers.js';
import {
  classifySeverity, findImplementorImpacts, generateRecommendations,
  filterBySeverity, deduplicate, severityOrder, buildSummary, emptyResult
} from './impact-helpers.js';

export type { Severity, ImpactAction, ImpactItem, ImpactResult } from './impact-helpers.js';

export class ImpactAnalysisService {
  private callGraph: CallGraphService;
  private depGraph: DependencyGraphService;
  private resolver: SymbolResolver;
  private testDetector: TestDetector;
  private db: Database.Database;

  constructor(
    db: Database.Database,
    callGraph: CallGraphService,
    depGraph: DependencyGraphService,
    resolver: SymbolResolver,
    testDetector: TestDetector
  ) {
    this.db = db;
    this.callGraph = callGraph;
    this.depGraph = depGraph;
    this.resolver = resolver;
    this.testDetector = testDetector;
  }

  analyzeImpact(
    symbolName: string,
    action: ImpactAction = 'modify',
    depth: number = 3,
    includeTests: boolean = true,
    severityThreshold: Severity = 'low'
  ): ImpactResult {
    const startTime = Date.now();
    const clampedDepth = Math.min(Math.max(depth, 1), 5);
    const resolved = this.resolver.resolve(symbolName);
    if (resolved.length === 0) {
      return emptyResult(symbolName, action);
    }

    const impacts: ImpactItem[] = [];
    const callerResult = this.callGraph.findCallers(symbolName, clampedDepth, 100);
    for (const caller of callerResult.results) {
      const severity = classifySeverity(caller.depthLevel, action, 'caller');
      impacts.push({
        symbol: caller.symbol,
        qualifiedName: caller.qualifiedName,
        file: caller.filePath,
        line: caller.callSiteLine,
        severity,
        reason: caller.depthLevel === 1 ? 'Direct caller' : `Transitive caller (depth ${caller.depthLevel})`,
      });
    }

    const implImpacts = findImplementorImpacts(resolved, symbolName, this.db);
    impacts.push(...implImpacts);

    const depResult = this.depGraph.query(resolved[0].filePath, 'incoming', Math.min(clampedDepth, 2), false, 50);
    for (const dep of depResult.results) {
      if (!impacts.some(i => i.file === dep.file)) {
        impacts.push({
          symbol: dep.file,
          file: dep.file,
          line: 0,
          severity: action === 'delete' ? 'high' : 'medium',
          reason: 'Imports modified file',
        });
      }
    }

    let affectedTests: RelatedTest[] = [];
    if (includeTests) {
      affectedTests = this.testDetector.findRelatedTests(
        resolved,
        impacts.map(i => i.file)
      );
      for (const test of affectedTests) {
        if (!impacts.some(i => i.file === test.file)) {
          impacts.push({
            symbol: test.file,
            file: test.file,
            line: 0,
            severity: 'high',
            reason: test.reason,
          });
        }
      }
    }

    const filtered = filterBySeverity(impacts, severityThreshold);
    const deduped = deduplicate(filtered);
    deduped.sort((a, b) => severityOrder(a.severity) - severityOrder(b.severity));
    const recommendations = generateRecommendations(deduped, action, symbolName, this.testDetector);
    const summary = buildSummary(deduped);
    const affectedFiles = new Set(deduped.map(i => i.file)).size;

    return {
      symbol: symbolName,
      action,
      blastRadius: { summary, totalAffected: deduped.length, affectedFiles, affectedTests: affectedTests.length },
      impacts: deduped,
      affectedTests,
      recommendations,
      metadata: {
        queryTimeMs: Date.now() - startTime,
        depthSearched: clampedDepth,
        truncated: callerResult.metadata.truncated,
      },
    };
  }
}
