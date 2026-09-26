/**
 * Constants and interfaces for KB Graph service.
 */

export const LEVEL_MAP: Record<string, number> = {
  ARCHITECTURE: 0, REQUIREMENT: 0, DECISION: 0,
  PROCEDURE: 0, CONTEXT: 0, CODE_ENTITY: 0,
  LESSON_LEARNED: 1, ERROR_PATTERN: 1, DOCUMENT: 1,
  FUNCTION: 1, METHOD: 1, CLASS: 0, INTERFACE: 0,
  TYPE: 1, CONSTRUCTOR: 1, PROPERTY: 2, ENUM: 1,
  SOURCE_FILE: 0,
  TAG: 1,
  JSP_PAGE: 0,
  CONTROLLER: 0,
  REST_CONTROLLER: 0,
  CONTROLLER_ADVICE: 0,
  SERVICE: 0,
  REPOSITORY: 0,
  COMPONENT: 0,
  CONFIGURATION: 0,
  ENTITY: 0,
  TRANSACTIONAL: 1,
  HTTP_GET: 1,
  HTTP_POST: 1,
  HTTP_PUT: 1,
  HTTP_DELETE: 1,
  HTTP_PATCH: 1,
  SECURITY: 1,
};

export const KIND_TO_TYPE: Record<string, string> = {
  function: 'FUNCTION',
  method: 'METHOD',
  class: 'CLASS',
  interface: 'INTERFACE',
  type: 'TYPE',
  constructor: 'CONSTRUCTOR',
  property: 'PROPERTY',
  enum: 'ENUM',
  constant: 'CONSTANT',
  variable: 'VARIABLE',
  file: 'SOURCE_FILE',
  tag: 'TAG',
  jsp_page: 'JSP_PAGE',
  controller: 'CONTROLLER',
  rest_controller: 'REST_CONTROLLER',
  controller_advice: 'CONTROLLER_ADVICE',
  service: 'SERVICE',
  repository: 'REPOSITORY',
  component: 'COMPONENT',
  configuration: 'CONFIGURATION',
  entity: 'ENTITY',
  transactional: 'TRANSACTIONAL',
  http_get: 'HTTP_GET',
  http_post: 'HTTP_POST',
  http_put: 'HTTP_PUT',
  http_delete: 'HTTP_DELETE',
  http_patch: 'HTTP_PATCH',
  security: 'SECURITY',
  apex_class: 'APEX_CLASS',
  trigger: 'TRIGGER',
  flow: 'FLOW',
  sf_object: 'SF_OBJECT',
  sf_field: 'SF_FIELD',
  lwc_component: 'LWC_COMPONENT',
  aura_component: 'AURA_COMPONENT',
  visualforce_page: 'VISUALFORCE_PAGE',
};

/**
 * Derive the graph node type for a symbol kind.
 * - Standard code kinds use the fixed KIND_TO_TYPE map above.
 * - Pega kinds (kind = 'pega_' + pxObjClass lowercased) derive their graph type
 *   1:1 from the kind, WITHOUT collapsing distinct rule types together, so graph
 *   per-type counts match the DB per-kind counts. e.g.
 *     pega_rule_obj_flow        → FLOW
 *     pega_rule_obj_flowaction  → FLOW_ACTION
 *     pega_rule_declare_decisiontable → DECLARE_DECISIONTABLE
 * The type is the kind with the leading 'pega_rule_' (or 'pega_') stripped,
 * uppercased. This is deterministic and needs no per-type table.
 * @param kind - Symbol kind (e.g. 'pega_rule_obj_flow', 'function')
 * @returns Graph node type (e.g. 'FLOW', 'FUNCTION', 'CODE_ENTITY')
 */
export function graphTypeForKind(kind: string): string {
  const fixed = KIND_TO_TYPE[kind];
  if (fixed) return fixed;
  if (kind && kind.startsWith('pega_')) {
    if (kind === 'pega_unknown') return 'PEGA_RULE';
    // Strip only the 'pega_' prefix, keep the rest (e.g. rule_obj_flow → RULE_OBJ_FLOW).
    const suffix = kind.replace(/^pega_/, '');
    return suffix ? suffix.toUpperCase() : 'PEGA_RULE';
  }
  return 'CODE_ENTITY';
}

export interface SpatialQueryParams {
  camX: number;
  camY: number;
  camZ: number;
  zoom: number;
}

export interface GraphNode {
  id: string;
  label: string;
  type: string;
  tier: string;
  x: number;
  y: number;
  z: number;
  level: number;
  clusterId: string | null;
}

export interface GraphEdge {
  source: string;
  target: string;
  weight: number;
  type: string;
}

export interface SpatialGraphResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  stats: {
    totalNodes: number;
    totalEdges: number;
    queryTimeMs: number;
    level: string;
    totalInDb: number;
    totalEdgesInDb: number;
  };
}
