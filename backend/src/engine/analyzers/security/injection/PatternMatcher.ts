/**
 * KSA-165: Pattern Matcher — Base class for injection pattern matching.
 */

import type { TaintPath, InjectionPattern, Finding, Confidence, TaintStep } from '../types/index.js';

export interface MatchContext {
  filePath: string;
  functionName: string;
  language: string;
}

export abstract class PatternMatcher {
  abstract readonly category: string;
  abstract readonly patterns: InjectionPattern[];

  /** Check if a taint path matches any pattern in this category. */
  match(taintPath: TaintPath, context: MatchContext): Finding | null {
    for (const pattern of this.patterns) {
      if (this.matchesSink(taintPath.sink.function, pattern) &&
          this.hasDangerousOp(taintPath, pattern.dangerousOps) &&
          !this.hasSafePattern(taintPath, pattern.safePatterns)) {
        return this.createFinding(taintPath, pattern, context);
      }
    }
    return null;
  }

  /** Check if sink function matches pattern's sink signatures. */
  protected matchesSink(sinkFunction: string, pattern: InjectionPattern): boolean {
    return pattern.sinkPatterns.some(sp => sinkFunction.includes(sp));
  }

  /** Check if taint path has a dangerous operation. */
  protected hasDangerousOp(path: TaintPath, dangerousOps: string[]): boolean {
    if (dangerousOps.length === 0) return true; // No specific op required
    return path.chain.some(step => dangerousOps.includes(step.action));
  }

  /** Check if taint path has a safe pattern (sanitization). */
  protected hasSafePattern(path: TaintPath, safePatterns: string[]): boolean {
    if (safePatterns.length === 0) return false;

    const sinkExpr = path.sink.expression;
    for (const safe of safePatterns) {
      if (sinkExpr.includes(safe)) return true;
    }

    // Check if any step is a sanitizer
    return path.chain.some(step => step.action === 'sanitize');
  }

  /** Create a finding from a matched pattern. */
  protected createFinding(path: TaintPath, pattern: InjectionPattern, context: MatchContext): Finding {
    const confidence = this.computeConfidence(path, pattern);
    return {
      id: `${pattern.category.toUpperCase()}-${pattern.id}-${context.filePath}:${path.sink.line}`,
      ruleId: `INJ-${pattern.category.toUpperCase()}-${String(pattern.id).padStart(3, '0')}`,
      category: pattern.category,
      pattern,
      taintPath: path,
      severity: pattern.severity,
      confidence,
      cwe: pattern.cwe,
      message: `${pattern.name}: Tainted data from ${path.source.type} flows to ${path.sink.function} without sanitization`,
      remediation: pattern.description,
      location: {
        file: context.filePath,
        startLine: path.source.line,
        endLine: path.sink.line,
      },
      suppressed: false,
    };
  }

  /** Compute confidence based on path characteristics. */
  protected computeConfidence(path: TaintPath, pattern: InjectionPattern): Confidence {
    // Short direct paths = high confidence
    if (path.length <= 3) return 'High';
    // Medium paths
    if (path.length <= 6) return 'Medium';
    // Long indirect paths
    return 'Low';
  }
}