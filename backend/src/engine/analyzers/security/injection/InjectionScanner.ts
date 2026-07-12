/**
 * KSA-165: Injection Scanner — Main orchestrator for injection detection.
 */

import type { SyntaxNode } from '../../../parsers/types.js';
import { TaintAnalyzer } from '../taint/TaintAnalyzer.js';
import { PatternMatcher, type MatchContext } from './PatternMatcher.js';
import { SuppressionChecker } from './SuppressionChecker.js';
import { SQLInjectionMatcher } from './patterns/SQLInjectionMatcher.js';
import { XSSMatcher } from './patterns/XSSMatcher.js';
import { CommandInjectionMatcher } from './patterns/CommandInjectionMatcher.js';
import { PathTraversalMatcher } from './patterns/PathTraversalMatcher.js';
import { DeserializationMatcher } from './patterns/DeserializationMatcher.js';
import { LDAPXMLMatcher } from './patterns/LDAPXMLMatcher.js';
import type { Finding, ScanOptions, ScanResult, Severity, TaintPath } from '../types/index.js';

export class InjectionScanner {
  private taintAnalyzer: TaintAnalyzer;
  private matchers: PatternMatcher[];
  private suppressionChecker: SuppressionChecker;

  constructor(taintAnalyzer?: TaintAnalyzer) {
    this.taintAnalyzer = taintAnalyzer ?? new TaintAnalyzer();
    this.suppressionChecker = new SuppressionChecker();
    this.matchers = [
      new SQLInjectionMatcher(),
      new XSSMatcher(),
      new CommandInjectionMatcher(),
      new PathTraversalMatcher(),
      new DeserializationMatcher(),
      new LDAPXMLMatcher(),
    ];
  }

  /** Scan a function AST node for injection vulnerabilities. */
  scanFunction(
    functionNode: SyntaxNode,
    filePath: string,
    language: string,
    sourceLines: string[],
    functionName?: string
  ): Finding[] {
    // Run taint analysis
    const taintResult = this.taintAnalyzer.analyze(functionNode, language);
    if (taintResult.paths.length === 0) return [];

    const context: MatchContext = {
      filePath,
      functionName: functionName ?? 'anonymous',
      language,
    };

    const findings: Finding[] = [];

    // Match each taint path against all patterns
    for (const path of taintResult.paths) {
      for (const matcher of this.matchers) {
        const finding = matcher.match(path, context);
        if (finding) {
          // Check suppression
          const suppression = this.suppressionChecker.isSuppressed(sourceLines, path.sink.line);
          if (suppression) {
            finding.suppressed = true;
            finding.suppressionInfo = suppression;
          }
          findings.push(finding);
          break; // One finding per path (first match wins)
        }
      }
    }

    return findings;
  }

  /** Scan multiple functions and aggregate results. */
  scanFunctions(
    functions: Array<{ node: SyntaxNode; name: string }>,
    filePath: string,
    language: string,
    sourceLines: string[],
    options: ScanOptions = {}
  ): ScanResult {
    const startTime = Date.now();
    const allFindings: Finding[] = [];
    const suppressed: Finding[] = [];

    // Check file-level suppression
    if (this.suppressionChecker.isFileSuppressed(sourceLines)) {
      return this.emptyResult(1, Date.now() - startTime);
    }

    for (const fn of functions) {
      const findings = this.scanFunction(fn.node, filePath, language, sourceLines, fn.name);

      for (const finding of findings) {
        // Apply severity threshold
        if (options.severityThreshold && !this.meetsThreshold(finding.severity, options.severityThreshold)) {
          continue;
        }
        // Apply category filter
        if (options.categories && !options.categories.includes(finding.category)) {
          continue;
        }

        if (finding.suppressed) {
          suppressed.push(finding);
        } else {
          allFindings.push(finding);
        }
      }
    }

    const duration = Date.now() - startTime;
    return {
      findings: allFindings,
      suppressed: options.includeSuppressed ? suppressed : [],
      summary: {
        total: allFindings.length,
        bySeverity: this.countBySeverity(allFindings),
        byCategory: this.countByCategory(allFindings),
        filesScanned: 1,
        scanDuration: duration,
      },
    };
  }

  /** Get all registered patterns (for SARIF rule generation). */
  getAllPatterns(): Array<{ category: string; patterns: import('../types/index.js').InjectionPattern[] }> {
    return this.matchers.map(m => ({ category: m.category, patterns: m.patterns }));
  }

  private meetsThreshold(severity: Severity, threshold: Severity): boolean {
    const order: Severity[] = ['Critical', 'High', 'Medium', 'Low', 'Info'];
    return order.indexOf(severity) <= order.indexOf(threshold);
  }

  private countBySeverity(findings: Finding[]): Record<Severity, number> {
    const counts: Record<Severity, number> = { Critical: 0, High: 0, Medium: 0, Low: 0, Info: 0 };
    for (const f of findings) counts[f.severity]++;
    return counts;
  }

  private countByCategory(findings: Finding[]): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const f of findings) {
      counts[f.category] = (counts[f.category] ?? 0) + 1;
    }
    return counts;
  }

  private emptyResult(filesScanned: number, duration: number): ScanResult {
    return {
      findings: [],
      suppressed: [],
      summary: {
        total: 0,
        bySeverity: { Critical: 0, High: 0, Medium: 0, Low: 0, Info: 0 },
        byCategory: {},
        filesScanned,
        scanDuration: duration,
      },
    };
  }
}