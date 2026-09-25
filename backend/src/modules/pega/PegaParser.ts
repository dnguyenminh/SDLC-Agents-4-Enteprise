/**
 * PegaParser — Bộ phân tích Pega Rule & Data tích hợp OOP Domain Model và Strategy Registry.
 */

import type { UnresolvedDependency } from './models.js';
import { PegaParserRegistry } from './strategies/PegaParserRegistry.js';
import { PegaObjectFactory } from './domain/PegaObjectFactory.js';
import { PegaRule } from './domain/PegaRule.js';
import { PegaObject } from './domain/PegaObject.js';
import { hasRuleReferences, extractDependenciesFromReferences } from './references/PxRuleReferences.js';

export interface ExtractedPegaSymbol {
  fqn: string;
  name: string;
  className: string;
  ruleType: string;
  isRule: boolean;
  ruleset?: string;
  version?: string;
  logicSummary?: string;
}

export class PegaParser {
  private registry: PegaParserRegistry;

  constructor() {
    this.registry = new PegaParserRegistry();
  }

  public parsePegaObject(json: Record<string, unknown>): PegaObject {
    return PegaObjectFactory.create(json);
  }

  public parseSymbol(json: Record<string, unknown>): ExtractedPegaSymbol {
    const pegaObj = this.parsePegaObject(json);
    if (pegaObj instanceof PegaRule) {
      return {
        fqn: pegaObj.getFqn(),
        name: pegaObj.pyRuleName,
        className: pegaObj.pyClassName,
        ruleType: pegaObj.pxObjClass,
        isRule: true,
        ruleset: pegaObj.pyRuleset,
        version: pegaObj.pyRulesetVersion,
        logicSummary: pegaObj.toStructuredPseudoCode(),
      };
    }
    return this.registry.parse(json).symbol;
  }

  /**
   * Extract rule-to-rule dependencies.
   *
   * SA4E-235 (GD3): the engine-authoritative `pxRuleReferences` aggregate is the PRIMARY
   * source — when present, it is what the Pega engine itself recorded, so it is both more
   * complete and more accurate than per-type property inspection. Per-type extraction
   * (domain model / strategy registry) remains the FALLBACK for rules that carry no
   * aggregate (e.g. hand-authored fixtures or partial exports).
   *
   * @param json Full parsed rule JSON
   * @returns Dependencies (UnresolvedDependency shape — contract unchanged)
   */
  public extractDependencies(json: Record<string, unknown>): UnresolvedDependency[] {
    if (hasRuleReferences(json)) {
      return extractDependenciesFromReferences(json);
    }
    // Fallback: per-type inspection when the engine aggregate is absent.
    const pegaObj = this.parsePegaObject(json);
    if (pegaObj instanceof PegaRule) {
      return pegaObj.extractDependencies();
    }
    return this.registry.parse(json).dependencies;
  }
}
