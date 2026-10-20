/**
 * PegaCrawler — plans incremental Pega rule crawling from ingested rule references.
 * BR-18 facade — reference extraction lives in ./PegaCrawler/rule-references.ts,
 * insKey parsing in ./PegaCrawler/ins-key.ts.
 */

import { PegaSchemaLoader } from './PegaSchemaLoader.js';
import type { PegaRuleKbSchema } from './strategies/KbDrivenPegaParserStrategy.js';
import { extractRuleReferences } from './PegaCrawler/rule-references.js';
import { parseInsKey as parseKey, normalizeObjClass as normalizeClass } from './PegaCrawler/ins-key.js';

export interface PegaCrawlKey {
  insKey: string;
  pxObjClass: string;
  pyClassName: string;
  pyRuleName: string;
}

export interface PegaCrawlPlan {
  missing: PegaCrawlKey[];
  cached: string[];
}

export interface PegaCrawlBatchRequest {
  projectId: string;
  rules: Record<string, unknown>[];
  visitedKeys: string[];
}

export interface PegaCrawlBatchResponse {
  stored: number;
  nextBatch: PegaCrawlKey[];
}

export class PegaCrawler {
  private schemaMap = new Map<string, PegaRuleKbSchema>();

  constructor() {
    this.loadSchemas();
  }

  private loadSchemas(): void {
    const schemas = PegaSchemaLoader.loadAllSchemas();
    for (const s of schemas) {
      this.schemaMap.set(s.targetClass, s);
    }
  }

  public plan(ruleKeys: string[], visitedKeys: Set<string>): PegaCrawlPlan {
    const missing: PegaCrawlKey[] = [];
    const cached: string[] = [];

    for (const key of ruleKeys) {
      if (visitedKeys.has(key)) {
        cached.push(key);
        continue;
      }
      const parsed = this.parseInsKey(key);
      if (!parsed) {
        cached.push(key);
        continue;
      }
      missing.push(parsed);
    }

    return { missing, cached };
  }

  /** Rule types the Pega REST API can actually return via GET /rules/{insKey}. */
  private static FETCHABLE_TYPES = new Set([
    'Rule-Obj-Class',
    'Data-Admin-Operator-ID',
    'Rule-Obj-Flow',
    'Rule-Obj-CaseType',
    'Rule-Obj-Activity',
    'Rule-Obj-FlowAction',
    'Rule-HTML-Section',
  ]);

  public computeNextBatch(
    ingestedRules: Record<string, unknown>[],
    visitedKeys: Set<string>,
    _projectId: string,
  ): PegaCrawlKey[] {
    const nextBatch: PegaCrawlKey[] = [];
    const seen = new Set<string>();

    for (const rule of ingestedRules) {
      const deps = extractRuleReferences(rule);
      for (const dep of deps) {
        if (!PegaCrawler.FETCHABLE_TYPES.has(dep.ruleType)) continue;

        const insKey = dep.insKey || (
          (dep.className && dep.className !== '@baseclass')
            ? `${dep.ruleType.toUpperCase()} ${dep.className} ${dep.ruleName}`
            : `${dep.ruleType.toUpperCase()} ${dep.ruleName}`
        );

        if (visitedKeys.has(insKey) || seen.has(insKey)) continue;
        seen.add(insKey);
        nextBatch.push({
          insKey,
          pxObjClass: dep.ruleType,
          pyClassName: dep.className,
          pyRuleName: dep.ruleName,
        });
      }
    }

    return nextBatch;
  }

  public parseInsKey(insKey: string): PegaCrawlKey | null {
    return parseKey(insKey);
  }

  private normalizeObjClass(raw: string): string {
    return normalizeClass(raw);
  }
}
