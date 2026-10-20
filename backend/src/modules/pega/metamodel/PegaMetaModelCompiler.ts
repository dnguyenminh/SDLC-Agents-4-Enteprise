/**
 * PegaMetaModelCompiler (facade) — Generates IPegaRuleParserStrategy instances
 * from PegaClassDefinition schemas at runtime (dynamic, not code-gen).
 *
 * Each compiled strategy knows its class definition, supports inheritance-based
 * matching, and extracts properties/children/dependencies automatically.
 *
 * Implementation submodules (same directory):
 * - CompiledPegaRuleParserStrategy.ts — the compiled strategy wrapper
 * - PegaRuleFieldInference.ts         — name extraction + rule-type inference
 */

import type { PegaClassDefinition } from './PegaClassDefinition.js';
import type { PegaMetaModelRegistry } from './PegaMetaModelRegistry.js';
import type { IPegaRuleParserStrategy } from '../strategies/IPegaRuleParserStrategy.js';
import type { PegaParserRegistry } from '../strategies/PegaParserRegistry.js';
import { CompiledPegaRuleParserStrategy } from './CompiledPegaRuleParserStrategy.js';

export class PegaMetaModelCompiler {
  private registry: PegaMetaModelRegistry;
  private compiled: Map<string, CompiledPegaRuleParserStrategy> = new Map();
  private hierarchyCache: Map<string, Set<string>> = new Map();

  constructor(registry: PegaMetaModelRegistry) {
    this.registry = registry;
  }

  /**
   * Generate a strategy for a single class definition.
   * The strategy will match the exact class and any subclasses.
   */
  public compileStrategy(classDef: PegaClassDefinition): IPegaRuleParserStrategy {
    const existing = this.compiled.get(classDef.pxObjClass);
    if (existing) return existing;

    const strategy = new CompiledPegaRuleParserStrategy(classDef, this, this.registry);
    this.compiled.set(classDef.pxObjClass, strategy);
    return strategy;
  }

  /**
   * Compile ALL registered classes into strategies.
   * Returns strategies ordered from most concrete to most generic
   * so the most specific match is found first.
   */
  public compileAll(): IPegaRuleParserStrategy[] {
    // Build inheritance depth map for ordering
    const depthMap = new Map<string, number>();

    const computeDepth = (pxObjClass: string): number => {
      const cached = depthMap.get(pxObjClass);
      if (cached !== undefined) return cached;
      const def = this.registry.getParser(pxObjClass);
      if (!def || !def.baseClass) {
        depthMap.set(pxObjClass, 0);
        return 0;
      }
      const depth = computeDepth(def.baseClass) + 1;
      depthMap.set(pxObjClass, depth);
      return depth;
    };

    // Get all classes sorted by inheritance depth (deepest first = most specific first)
    const classes = this.registry.getKnownClasses();

    for (const cls of classes) {
      computeDepth(cls);
    }

    // Sort by depth descending so concrete classes compile first
    const sorted = [...classes].sort((a, b) => (depthMap.get(b) || 0) - (depthMap.get(a) || 0));

    const strategies: IPegaRuleParserStrategy[] = [];
    for (const cls of sorted) {
      const def = this.registry.getParser(cls);
      if (def) {
        strategies.push(this.compileStrategy(def));
      }
    }

    return strategies;
  }

  /**
   * Get a compiled strategy for a specific pxObjClass.
   */
  public getStrategy(pxObjClass: string): IPegaRuleParserStrategy | undefined {
    return this.compiled.get(pxObjClass);
  }

  /**
   * Register all compiled strategies into a PegaParserRegistry.
   * More specific strategies are registered before generic ones.
   */
  public registerAll(parserRegistry: PegaParserRegistry): void {
    // Get all compiled strategies sorted by specificity
    const all = this.compileAll();

    // Register generic base classes first (they'll end up last via unshift),
    // concrete classes last (they'll end up first, matching first)
    const sorted = this.sortByInheritanceDepth(all);

    for (const strategy of sorted) {
      parserRegistry.registerStrategy(strategy);
    }
  }

  /**
   * Check if a given pxObjClass derives from a potential base class.
   * Uses the registry for class definition lookup and follows the baseClass chain.
   */
  public isDerivedFrom(pxObjClass: string, potentialBaseClass: string): boolean {
    if (pxObjClass === potentialBaseClass) return true;
    if (potentialBaseClass === '@baseclass') return true;

    // Build cached ancestry for the class
    let ancestors = this.hierarchyCache.get(pxObjClass);
    if (!ancestors) {
      ancestors = this.buildAncestors(pxObjClass);
      this.hierarchyCache.set(pxObjClass, ancestors);
    }

    return ancestors.has(potentialBaseClass);
  }

  private buildAncestors(pxObjClass: string): Set<string> {
    const ancestors = new Set<string>();
    if (pxObjClass === '@baseclass') {
      ancestors.add('@baseclass');
      return ancestors;
    }

    let current = pxObjClass;
    for (let i = 0; i < 20; i++) {
      const def = this.registry.getParser(current);
      if (!def || !def.baseClass) break;
      ancestors.add(def.baseClass);
      current = def.baseClass;
    }

    // Add @baseclass implicitly
    if (pxObjClass !== '@baseclass') {
      ancestors.add('@baseclass');
    }

    return ancestors;
  }

  private sortByInheritanceDepth(strategies: IPegaRuleParserStrategy[]): CompiledPegaRuleParserStrategy[] {
    const compiled = strategies as CompiledPegaRuleParserStrategy[];

    const getDepth = (strategy: CompiledPegaRuleParserStrategy): number => {
      const def = (strategy as any).classDef as PegaClassDefinition;
      let depth = 0;
      let current = def.baseClass;
      while (current) {
        depth++;
        const parentDef = this.registry.getParser(current);
        if (!parentDef || !parentDef.baseClass) break;
        current = parentDef.baseClass;
      }
      return depth;
    };

    // Sort by depth ascending (generic first) so unshift puts specific first
    return [...compiled].sort((a, b) => getDepth(a) - getDepth(b));
  }
}
