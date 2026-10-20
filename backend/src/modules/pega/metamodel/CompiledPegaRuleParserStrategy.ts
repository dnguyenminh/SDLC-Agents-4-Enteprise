/**
 * CompiledPegaRuleParserStrategy — runtime-compiled parser strategy.
 * Extracted from PegaMetaModelCompiler.ts. Wraps a PegaClassDefinition and
 * uses the compiler/registry for inheritance-based matching and parsing.
 */

import type { PegaClassDefinition } from './PegaClassDefinition.js';
import type { PegaMetaModelRegistry } from './PegaMetaModelRegistry.js';
import type { IPegaRuleParserStrategy, ParseResult } from '../strategies/IPegaRuleParserStrategy.js';
import type { UnresolvedDependency } from '../models.js';
import type { PegaMetaModelCompiler } from './PegaMetaModelCompiler.js';
import { extractRuleName, inferRuleTypeFromField } from './PegaRuleFieldInference.js';

/** Fields that look like references by naming convention (suffix match). */
const REFERENCE_SUFFIXES = ['Name', 'Class', 'Profile', 'Transform', 'Condition', 'From', 'Evaluated', 'Trigger', 'Action', 'Target', 'Source', 'Expression'];

/** JSON keys that are metadata, never dependencies. */
const NON_REFERENCE_KEYS = new Set([
  'pxObjClass', 'pyClassName', 'pyRuleName',
  'pyRuleset', 'pyRulesetVersion', 'pyRuleSet', 'pyRuleSetVersion',
]);

/**
 * Compiled strategy that wraps a PegaClassDefinition and uses the registry
 * for inheritance resolution.
 */
export class CompiledPegaRuleParserStrategy implements IPegaRuleParserStrategy {
  constructor(
    private readonly classDef: PegaClassDefinition,
    private readonly compiler: PegaMetaModelCompiler,
    private readonly registry: PegaMetaModelRegistry,
  ) {}

  /**
   * Check whether this strategy supports the given pxObjClass.
   *
   * Matching rules:
   * 1. Exact match on pxObjClass
   * 2. @baseclass supports everything
   * 3. Classes ending with '-' (base categories) support any subclass by prefix
   * 4. Full inheritance check via the registry
   */
  public supports(pxObjClass: string): boolean {
    if (pxObjClass === this.classDef.pxObjClass) return true;
    if (this.classDef.pxObjClass === '@baseclass') return true;

    // Base-category classes ending with '-' support prefix match
    if (this.classDef.pxObjClass.endsWith('-')) {
      if (pxObjClass.startsWith(this.classDef.pxObjClass)) return true;
    }

    // Full inheritance chain check
    return this.compiler.isDerivedFrom(pxObjClass, this.classDef.pxObjClass);
  }

  /**
   * Parse a raw JSON object into a ParseResult.
   * Extracts the symbol (name, class, type), detects references as dependencies,
   * and records all properties per the class definition.
   */
  public parse(json: Record<string, unknown>): ParseResult {
    const pxObjClass = (json.pxObjClass as string) || this.classDef.pxObjClass;
    const className = (json.pyClassName as string) || (json.className as string) || '@baseclass';
    const name = extractRuleName(json);
    const fqn = `${pxObjClass}:${className}:${name}`;

    const symbol = {
      fqn,
      name,
      className,
      ruleType: pxObjClass,
      isRule: pxObjClass.startsWith('Rule-'),
      ruleset: (json.pyRuleset as string) || undefined,
      version: (json.pyRulesetVersion as string) || undefined,
      logicSummary: this.buildLogicSummary(json),
    };

    const dependencies = this.extractDependencies(json, className);

    return { symbol, dependencies };
  }

  private extractDependencies(json: Record<string, unknown>, className: string): UnresolvedDependency[] {
    const deps: UnresolvedDependency[] = [];
    const visited = new Set<string>();

    // 1. Extract from classDef properties marked as isReference
    for (const prop of this.classDef.properties) {
      if (!prop.isReference) continue;
      const val = json[prop.name];
      if (typeof val !== 'string' || !val.trim()) continue;
      const key = `${prop.name}:${val}`;
      if (visited.has(key)) continue;
      visited.add(key);
      const ruleType = inferRuleTypeFromField(prop.name, val, json);
      deps.push({ ruleType, className, ruleName: val.trim() });
    }

    this.extractConventionBasedRefs(json, className, deps, visited);
    return deps;
  }

  /**
   * 2. Detect additional reference fields by naming convention:
   *    fields ending in reference-like suffixes that aren't already captured.
   */
  private extractConventionBasedRefs(
    json: Record<string, unknown>, className: string,
    deps: UnresolvedDependency[], visited: Set<string>,
  ): void {
    for (const [key, val] of Object.entries(json)) {
      if (typeof val !== 'string' || !val.trim()) continue;
      if (NON_REFERENCE_KEYS.has(key)) continue;

      const hasRefSuffix = REFERENCE_SUFFIXES.some(s => key.endsWith(s));
      if (!hasRefSuffix) continue;

      // Skip if already captured as isReference property
      if (this.classDef.properties.some(p => p.name === key && p.isReference)) continue;

      const depKey = `${key}:${val}`;
      if (visited.has(depKey)) continue;
      visited.add(depKey);

      const ruleType = inferRuleTypeFromField(key, val, json);
      deps.push({ ruleType, className, ruleName: val.trim() });
    }
  }

  private buildLogicSummary(json: Record<string, unknown>): string | undefined {
    const name = extractRuleName(json);
    const cls = this.classDef;
    const lines: string[] = [];
    lines.push(`${cls.pxObjClass}: ${name}`);

    // Add key fields based on classDef meta
    for (const prop of cls.properties.slice(0, 6)) {
      const val = json[prop.name];
      if (val !== undefined && val !== null && val !== '') {
        lines.push(`  ${prop.name}: ${String(val)}`);
      }
    }

    // Count children
    let childCount = 0;
    for (const child of cls.children) {
      const arr = json[child.name];
      if (Array.isArray(arr)) childCount += arr.length;
    }

    if (childCount > 0) {
      lines.push(`  Children: ${childCount} item(s) across ${cls.children.length} array(s)`);
    }

    return lines.join('\n');
  }
}
