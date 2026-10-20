import type { PegaClassDefinition } from '../metamodel/PegaClassDefinition.js';
import { hasRuleReferences, extractDependenciesFromReferences } from './PxRuleReferences.js';
import type {
  ResolvedDependency, DependencyGraph, DependencyNode, DependencyEdge,
  MetaModelLookup,
} from './reference-maps.js';
import {
  SELF_NAME_TYPE_MAP, ALWAYS_SELF_FIELDS, extractName, inferRuleTypeFromField,
} from './reference-maps.js';
import { extractScalarRefs } from './heuristics-scalar.js';
import { extractCollectionRefs } from './heuristics-collections.js';
import {
  findCyclesImpl, calculateDepthImpl, findOrphansImpl,
  getDependentsImpl, getAllDependentsImpl,
} from './reference-graph.js';

export type {
  ResolvedDependency, DependencyNode, DependencyEdge, DependencyGraph,
} from './reference-maps.js';
export { extractPegaName } from './reference-maps.js';

export class PegaReferenceExtractor {
  private metaModelClasses: MetaModelLookup;

  constructor(metaModelClasses?: Map<string, PegaClassDefinition>) {
    this.metaModelClasses = metaModelClasses ?? new Map();
  }

  public setMetaModel(classes: Map<string, PegaClassDefinition>): void {
    this.metaModelClasses = classes;
  }

  /**
   * Extract dependencies for a single rule.
   *
   * SA4E-235 (GD3): when the engine-authoritative `pxRuleReferences` aggregate is present it
   * is the PRIMARY source; the per-type heuristics below run only as a FALLBACK for rules
   * without the aggregate.
   */
  public extractFromRule(json: Record<string, unknown>): ResolvedDependency[] {
    if (!json || typeof json !== 'object') return [];

    if (hasRuleReferences(json)) {
      return this.extractFromRuleReferences(json);
    }
    return this.extractByHeuristics(json);
  }

  /** Map the engine `pxRuleReferences` aggregate to ResolvedDependency edges (noise-filtered). */
  private extractFromRuleReferences(json: Record<string, unknown>): ResolvedDependency[] {
    return extractDependenciesFromReferences(json).map((d) => ({
      type: d.ruleType,
      name: d.ruleName,
      relation: 'references' as const,
      fieldName: 'pxRuleReferences',
      optional: true,
    }));
  }

  /** Per-type heuristic extraction (fallback when no engine aggregate exists). */
  private extractByHeuristics(json: Record<string, unknown>): ResolvedDependency[] {
    const deps: ResolvedDependency[] = [];
    const visited = new Set<string>();
    const pxObjClass = (json.pxObjClass as string) || 'Rule-Obj-Activity';
    const className = (json.pyClassName as string) || '@baseclass';

    const addDep = (
      ruleType: string,
      name: string,
      fieldName: string,
      relation: ResolvedDependency['relation'],
      optional: boolean,
    ): void => {
      if (!name || !name.trim()) return;
      const key = `${ruleType}:${name.trim()}`;
      if (visited.has(key)) return;
      visited.add(key);
      deps.push({
        type: ruleType,
        name: name.trim(),
        relation,
        fieldName,
        optional,
      });
    };

    // Helper: check if a field identifies the current rule itself
    const isSelfField = (field: string): boolean => {
      if (ALWAYS_SELF_FIELDS.has(field)) return true;
      const ownerType = SELF_NAME_TYPE_MAP[field];
      return ownerType !== undefined && pxObjClass === ownerType;
    };

    extractScalarRefs(json, this.metaModelClasses, pxObjClass, isSelfField, addDep);
    extractCollectionRefs(json, className, addDep);

    return deps;
  }

  public buildGraph(rules: Record<string, unknown>[]): DependencyGraph {
    const nodeMap = new Map<string, DependencyNode>();
    const edgeSet = new Set<string>();
    const edges: DependencyEdge[] = [];

    // Build nodes from all rules
    for (const json of rules) {
      const pxObjClass = (json.pxObjClass as string) || 'Rule-Obj-Activity';
      const className = (json.pyClassName as string) || '@baseclass';
      const name = extractName(json);
      const fqn = `${pxObjClass}:${className}:${name}`;
      if (!nodeMap.has(fqn)) {
        nodeMap.set(fqn, { fqn, name, type: pxObjClass, className });
      }

      // Extract dependencies
      const deps = this.extractFromRule(json);
      for (const dep of deps) {
        const depFqn = `${dep.type}:${className}:${dep.name}`;
        const edgeKey = `${fqn}->${depFqn}`;
        if (edgeSet.has(edgeKey)) continue;
        edgeSet.add(edgeKey);
        edges.push({
          source: fqn,
          target: depFqn,
          relation: dep.relation,
          fieldName: dep.fieldName,
          optional: dep.optional,
        });

        // Add target node if not already known
        if (!nodeMap.has(depFqn)) {
          nodeMap.set(depFqn, { fqn: depFqn, name: dep.name, type: dep.type, className });
        }
      }
    }

    return {
      nodes: Array.from(nodeMap.values()),
      edges,
    };
  }

  public findCycles(graph: DependencyGraph): string[][] {
    return findCyclesImpl(graph);
  }

  public calculateDepth(name: string, graph: DependencyGraph): number {
    return calculateDepthImpl(name, graph);
  }

  public findOrphans(graph: DependencyGraph): string[] {
    return findOrphansImpl(graph);
  }

  public getDependents(name: string, graph: DependencyGraph): string[] {
    return getDependentsImpl(name, graph);
  }

  public getAllDependents(fqn: string, graph: DependencyGraph): string[] {
    return getAllDependentsImpl(fqn, graph);
  }
}
