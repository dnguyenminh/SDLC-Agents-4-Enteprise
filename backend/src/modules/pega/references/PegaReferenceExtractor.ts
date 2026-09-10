import type { PegaClassDefinition } from '../metamodel/PegaClassDefinition.js';
import { hasRuleReferences, extractDependenciesFromReferences } from './PxRuleReferences.js';

export interface ResolvedDependency {
  type: string;
  name: string;
  relation: 'calls' | 'extends' | 'implements' | 'configures' | 'references';
  fieldName: string;
  optional: boolean;
}

export interface DependencyNode {
  fqn: string;
  name: string;
  type: string;
  className: string;
}

export interface DependencyEdge {
  source: string;
  target: string;
  relation: ResolvedDependency['relation'];
  fieldName: string;
  optional: boolean;
}

export interface DependencyGraph {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
}

/**
 * Fields used as the rule's own identifier within specific rule types.
 * key: field name, value: the rule type where this field identifies the rule itself.
 * If a rule's pxObjClass matches, the field is treated as self-identifier, not a dependency.
 */
const SELF_NAME_TYPE_MAP: Record<string, string> = {
  'pyActivityName': 'Rule-Obj-Activity',
  'pyModelName': 'Rule-Obj-Model',
  'pyTransformName': 'Rule-Obj-Model',
  'pyFlowName': 'Rule-Obj-Flow',
};

/**
 * Fields that always identify the rule itself, regardless of rule type.
 */
const ALWAYS_SELF_FIELDS = new Set([
  'pyRuleName', 'pyClassName', 'pyLabel', 'pyName',
]);

const REFERENCE_FIELD_MAP: Record<string, { ruleType: string; relation: ResolvedDependency['relation']; optional: boolean }> = {
  pySuperClass: { ruleType: 'Rule-Obj-Class', relation: 'extends', optional: true },
  pyPatternParent: { ruleType: 'Rule-Obj-Class', relation: 'extends', optional: true },
  pyDerivesFrom: { ruleType: 'Rule-Obj-Class', relation: 'extends', optional: true },
  pyWhenCondition: { ruleType: 'Rule-Obj-When', relation: 'references', optional: true },
  pyOnChangeTrigger: { ruleType: 'Rule-Obj-When', relation: 'configures', optional: true },
  pyFlowActionName: { ruleType: 'Rule-Obj-FlowAction', relation: 'references', optional: true },
  pyPropertyName: { ruleType: 'Rule-Obj-Property', relation: 'references', optional: true },
  pyPropertyEvaluated: { ruleType: 'Rule-Obj-Property', relation: 'references', optional: true },
  pyAuthProfile: { ruleType: 'Rule-Connect-AuthProfile', relation: 'configures', optional: true },
  pyRequestDataTransform: { ruleType: 'Rule-Obj-Model', relation: 'configures', optional: true },
  pyResponseDataTransform: { ruleType: 'Rule-Obj-Model', relation: 'configures', optional: true },
  pyAccessGroup: { ruleType: 'Data-Admin-AccessGroup', relation: 'references', optional: true },
  pyAccessRole: { ruleType: 'Rule-Access-Role-Name', relation: 'references', optional: true },
  pyPrivilegeName: { ruleType: 'Rule-Access-Privilege', relation: 'references', optional: true },
  pyBlockName: { ruleType: 'Rule-Obj-When', relation: 'references', optional: true },
  pyStartProcess: { ruleType: 'Rule-Obj-Activity', relation: 'calls', optional: true },
  pyMapRuleSet: { ruleType: 'Rule-Obj-MapValue', relation: 'references', optional: true },
  pyTargetProperty: { ruleType: 'Rule-Obj-FieldValue', relation: 'references', optional: true },
  pyDatasource: { ruleType: 'Rule-Obj-Report-', relation: 'references', optional: true },
  pyPortal: { ruleType: 'Rule-Portal', relation: 'references', optional: true },
  pySkin: { ruleType: 'Rule-Portal-Skin', relation: 'references', optional: true },
};

const NAME_CANDIDATE_FIELDS = [
  'pyRuleName', 'pyActivityName', 'pyModelName', 'pyTransformName',
  'pyFlowName', 'pyServiceRuleName', 'pyServiceName', 'pyLabel',
  'pyName', 'pyUserIdentifier', 'pyPrivilegeName', 'pyAccessRole',
  'pyAccessGroup',
];

function inferRuleTypeFromField(fieldName: string): { ruleType: string; relation: ResolvedDependency['relation'] } {
  if (REFERENCE_FIELD_MAP[fieldName]) {
    return { ruleType: REFERENCE_FIELD_MAP[fieldName].ruleType, relation: REFERENCE_FIELD_MAP[fieldName].relation };
  }
  if (fieldName.endsWith('Transform')) return { ruleType: 'Rule-Obj-Model', relation: 'references' };
  if (fieldName.endsWith('Class')) return { ruleType: 'Rule-Obj-Class', relation: 'extends' };
  if (fieldName.endsWith('Profile')) return { ruleType: 'Rule-Connect-AuthProfile', relation: 'configures' };
  if (fieldName.endsWith('Condition')) return { ruleType: 'Rule-Obj-When', relation: 'references' };
  if (fieldName.endsWith('Trigger')) return { ruleType: 'Rule-Obj-When', relation: 'configures' };
  if (fieldName.endsWith('ActivityName')) return { ruleType: 'Rule-Obj-Activity', relation: 'calls' };
  if (fieldName.endsWith('From')) return { ruleType: 'Rule-Obj-Class', relation: 'extends' };
  if (fieldName.endsWith('Evaluated')) return { ruleType: 'Rule-Obj-Property', relation: 'references' };
  if (fieldName.endsWith('Action')) return { ruleType: 'Rule-Obj-FlowAction', relation: 'references' };
  if (fieldName.endsWith('Target')) return { ruleType: 'Rule-Obj-Model', relation: 'references' };
  if (fieldName.endsWith('Source')) return { ruleType: 'Rule-Obj-Class', relation: 'extends' };
  if (fieldName.endsWith('Name')) return { ruleType: 'Rule-Obj-Activity', relation: 'calls' };
  return { ruleType: 'Rule-Obj-Activity', relation: 'references' };
}

function extractName(json: Record<string, unknown>): string {
  for (const key of NAME_CANDIDATE_FIELDS) {
    const val = json[key];
    if (typeof val === 'string' && val.trim()) return val.trim();
  }
  return 'Unnamed';
}

export class PegaReferenceExtractor {
  private metaModelClasses: Map<string, PegaClassDefinition>;

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

    // 1. Auto-detect reference fields using MetaModel class definitions
    const classDef = this.metaModelClasses.get(pxObjClass);
    if (classDef) {
      for (const prop of classDef.properties) {
        if (!prop.isReference) continue;
        if (isSelfField(prop.name)) continue;
        const val = json[prop.name];
        if (typeof val !== 'string' || !val) continue;
        const inferred = REFERENCE_FIELD_MAP[prop.name] ?? inferRuleTypeFromField(prop.name);
        addDep(inferred.ruleType, val, prop.name, inferred.relation, !prop.required);
      }
    }

    // 2. Known reference field patterns (fallback for unknown class definitions)
    for (const [key, mapping] of Object.entries(REFERENCE_FIELD_MAP)) {
      if (isSelfField(key)) continue;
      if (classDef && classDef.properties.some(p => p.name === key && p.isReference)) continue;
      const val = json[key];
      if (typeof val !== 'string' || !val) continue;
      addDep(mapping.ruleType || inferRuleTypeFromField(key).ruleType, val, key, mapping.relation, mapping.optional);
    }

    // 3. Convention-based detection: fields ending in Name/Class/Profile/Transform/Condition
    const referenceSuffixes = ['Name', 'Class', 'Profile', 'Transform', 'Condition', 'From', 'Evaluated', 'Trigger', 'Action', 'Target', 'Source', 'Expression'];
    for (const [key, val] of Object.entries(json)) {
      if (typeof val !== 'string' || !val.trim()) continue;
      if (isSelfField(key)) continue;
      if (key === 'pxObjClass' || key === 'pyRuleset' || key === 'pyRulesetVersion' || key === 'pyRuleSet' || key === 'pyRuleSetVersion') continue;
      if (REFERENCE_FIELD_MAP[key]) continue;
      if (classDef && classDef.properties.some(p => p.name === key && p.isReference)) continue;

      const hasRefSuffix = referenceSuffixes.some(s => key.endsWith(s));
      if (!hasRefSuffix) continue;

      const inferred = inferRuleTypeFromField(key);
      addDep(inferred.ruleType, val, key, inferred.relation, true);
    }

    // 4. Activity steps: pySteps or steps array
    const steps = (json.steps || json.pySteps) as unknown[];
    if (Array.isArray(steps)) {
      for (const s of steps) {
        if (!s || typeof s !== 'object') continue;
        const step = s as Record<string, unknown>;
        const method = step.pyMethod as string || '';
        const params = step.pyMethodParameters as string || '';

        if ((method === 'Call' || method === 'Branch') && params) {
          const dot = params.lastIndexOf('.');
          const stepName = dot >= 0 ? params.substring(dot + 1) : params;
          addDep('Rule-Obj-Activity', stepName, 'pyMethodParameters', 'calls', false);
        }
        if (step.pyWhenCondition) {
          addDep('Rule-Obj-When', step.pyWhenCondition as string, 'pyWhenCondition', 'references', true);
        }
        if (step.pyFlowActionName) {
          addDep('Rule-Obj-FlowAction', step.pyFlowActionName as string, 'pyFlowActionName', 'references', true);
        }
      }
    }

    // 5. Data Transform actions: pyActions
    const actions = json.pyActions as unknown[];
    if (Array.isArray(actions)) {
      for (const a of actions) {
        if (!a || typeof a !== 'object') continue;
        const act = a as Record<string, unknown>;
        if (act.pyTransformName) {
          addDep('Rule-Obj-Model', act.pyTransformName as string, 'pyTransformName', 'references', true);
        }
        if (act.pyWhenCondition) {
          addDep('Rule-Obj-When', act.pyWhenCondition as string, 'pyWhenCondition', 'references', true);
        }
        if (act.pyTarget && (act.pyActionType as string || '').includes('Transform')) {
          addDep('Rule-Obj-Model', act.pyTarget as string, 'pyTarget', 'references', true);
        }
        if (act.pyActivityName) {
          addDep('Rule-Obj-Activity', act.pyActivityName as string, 'pyActivityName', 'calls', true);
        }
      }
    }

    // 6. Flow shapes: pyShapes or shapes
    const shapes = (json.pyShapes || json.shapes) as unknown[];
    if (Array.isArray(shapes)) {
      for (const sh of shapes) {
        if (!sh || typeof sh !== 'object') continue;
        const shape = sh as Record<string, unknown>;
        if (shape.pyFlowActionName) {
          addDep('Rule-Obj-FlowAction', shape.pyFlowActionName as string, 'pyFlowActionName', 'references', true);
        }
        if (shape.pyWhenCondition) {
          addDep('Rule-Obj-When', shape.pyWhenCondition as string, 'pyWhenCondition', 'references', true);
        }
        if (shape.pyClassName && shape.pyClassName !== className) {
          addDep('Rule-Obj-Class', shape.pyClassName as string, 'pyClassName', 'extends', true);
        }
      }
    }

    // 7. pxRuleReferences array (generic)
    const pxRuleReferences = json.pxRuleReferences as unknown[];
    if (Array.isArray(pxRuleReferences)) {
      for (const ref of pxRuleReferences) {
        if (!ref || typeof ref !== 'object') continue;
        const r = ref as Record<string, unknown>;
        const refType = (r.pxRuleObjClass || r.pxRuleClassName) as string;
        const refName = r.pyRuleName as string;
        if (refType && refName) {
          addDep(refType, refName, 'pxRuleReferences', 'references', true);
        }
      }
    }

    // 8. Declare-specific: pyPages, pyResults
    const pages = json.pyPages as unknown[];
    if (Array.isArray(pages)) {
      for (const p of pages) {
        if (!p || typeof p !== 'object') continue;
        const pg = p as Record<string, unknown>;
        if (pg.pySourceClass) {
          addDep('Rule-Obj-Class', pg.pySourceClass as string, 'pySourceClass', 'references', true);
        }
      }
    }

    // 9. Decision/Strategy components
    const components = (json.pyStrategyComponents || json.pyComponents) as unknown[];
    if (Array.isArray(components)) {
      for (const comp of components) {
        if (!comp || typeof comp !== 'object') continue;
        const c = comp as Record<string, unknown>;
        const ref = (c.pyRef || c.pyWhenRef || c.pyTreatment) as string;
        if (typeof ref === 'string' && ref.trim()) {
          addDep('Rule-Decision-Strategy', ref.trim(), 'pyRef', 'references', true);
        }
      }
    }

    // 10. pyMethodParameters (top-level)
    const topParams = json.pyMethodParameters as string;
    if (typeof topParams === 'string' && topParams) {
      const dot = topParams.lastIndexOf('.');
      const paramName = dot >= 0 ? topParams.substring(dot + 1) : topParams;
      addDep('Rule-Obj-Activity', paramName, 'pyMethodParameters', 'calls', true);
    }

    // 11. UI Section layouts: pyLayouts or pxLayouts with when conditions
    const layouts = (json.pyLayouts || json.pxLayouts) as unknown[];
    if (Array.isArray(layouts)) {
      const extractLayoutWhen = (items: unknown[]): void => {
        for (const item of items) {
          if (!item || typeof item !== 'object') continue;
          const layout = item as Record<string, unknown>;
          const whenVal = (layout.when || layout.pyWhen) as string;
          if (whenVal && whenVal.trim()) {
            addDep('Rule-Obj-When', whenVal.trim(), 'when', 'references', true);
          }
          const children = layout.children as unknown[];
          if (Array.isArray(children) && children.length > 0) {
            extractLayoutWhen(children);
          }
        }
      };
      extractLayoutWhen(layouts);
    }

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
    const adjacency = new Map<string, string[]>();
    for (const node of graph.nodes) {
      adjacency.set(node.fqn, []);
    }
    for (const edge of graph.edges) {
      const existing = adjacency.get(edge.source) ?? [];
      existing.push(edge.target);
      adjacency.set(edge.source, existing);
    }

    const cycles: string[][] = [];
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const path: string[] = [];

    const dfs = (node: string): void => {
      if (recStack.has(node)) {
        // Found a cycle — extract it
        const cycleStart = path.indexOf(node);
        if (cycleStart >= 0) {
          cycles.push([...path.slice(cycleStart), node]);
        }
        return;
      }
      if (visited.has(node)) return;

      visited.add(node);
      recStack.add(node);
      path.push(node);

      const neighbors = adjacency.get(node) ?? [];
      for (const neighbor of neighbors) {
        dfs(neighbor);
      }

      path.pop();
      recStack.delete(node);
    };

    for (const node of graph.nodes) {
      if (!visited.has(node.fqn)) {
        dfs(node.fqn);
      }
    }

    return cycles;
  }

  public calculateDepth(name: string, graph: DependencyGraph): number {
    // Build adjacency: node -> list of targets
    const adjacency = new Map<string, string[]>();
    for (const node of graph.nodes) {
      adjacency.set(node.fqn, []);
    }
    for (const edge of graph.edges) {
      const existing = adjacency.get(edge.source) ?? [];
      existing.push(edge.target);
      adjacency.set(edge.source, existing);
    }

    // Find the node by name
    const targetNodes = graph.nodes.filter(n => n.name === name);
    if (targetNodes.length === 0) return -1;

    // BFS from the target node following edges forward
    const visited = new Set<string>();
    const queue: Array<{ fqn: string; depth: number }> = targetNodes.map(n => ({ fqn: n.fqn, depth: 0 }));
    let maxDepth = 0;

    for (const item of queue) {
      if (visited.has(item.fqn)) continue;
      visited.add(item.fqn);
      maxDepth = Math.max(maxDepth, item.depth);

      const neighbors = adjacency.get(item.fqn) ?? [];
      for (const neighbor of neighbors) {
        if (!visited.has(neighbor)) {
          queue.push({ fqn: neighbor, depth: item.depth + 1 });
        }
      }
    }

    return maxDepth;
  }

  public findOrphans(graph: DependencyGraph): string[] {
    const referenced = new Set<string>();
    for (const edge of graph.edges) {
      referenced.add(edge.target);
    }
    // An orphan is a node that is not referenced by any edge as target
    return graph.nodes
      .filter(n => !referenced.has(n.fqn))
      .map(n => n.name);
  }

  public getDependents(name: string, graph: DependencyGraph): string[] {
    // Find all nodes that depend on any node with the given name
    const targetFqns = new Set(graph.nodes.filter(n => n.name === name).map(n => n.fqn));
    const dependents: string[] = [];

    for (const edge of graph.edges) {
      if (targetFqns.has(edge.target)) {
        // Skip self-references (source === target)
        if (targetFqns.has(edge.source)) continue;
        const source = graph.nodes.find(n => n.fqn === edge.source);
        if (source && !dependents.includes(source.name)) {
          dependents.push(source.name);
        }
      }
    }

    return dependents;
  }

  public getAllDependents(fqn: string, graph: DependencyGraph): string[] {
    const result: string[] = [];
    const queue = [fqn];
    const visited = new Set<string>();

    for (const target of queue) {
      if (visited.has(target)) continue;
      visited.add(target);

      for (const edge of graph.edges) {
        if (edge.target === target) {
          // Skip self-references
          if (edge.source === fqn) continue;
          if (edge.source === edge.target) continue;
          const sourceName = graph.nodes.find(n => n.fqn === edge.source)?.name;
          if (sourceName && !result.includes(sourceName)) {
            result.push(sourceName);
          }
          if (!visited.has(edge.source)) {
            queue.push(edge.source);
          }
        }
      }
    }

    return result;
  }
}

export function extractPegaName(json: Record<string, unknown>): string {
  return extractName(json);
}
