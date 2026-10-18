/**
 * PegaSchemaGenerator — shared type definitions (SA4E-95).
 * Extracted from the original single-file module; re-exported by the facade.
 */

/** JSON Schema property definition */
export interface SchemaProperty {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array";
  pegaType: string;
  pageClass?: string;
  label?: string;
  required: boolean;
  items?: SchemaNode;
  properties?: SchemaNode;
}

/** JSON Schema node (class-level) */
export interface SchemaNode {
  className: string;
  sectionName?: string;
  properties: SchemaProperty[];
}

/** Complete schema generation result */
export interface SchemaGenerationResult {
  rootClass: string;
  schema: SchemaNode;
  metadata: {
    totalProperties: number;
    totalSections: number;
    depth: number;
    generatedAt: string;
    durationMs: number;
  };
}

/** Configuration for schema generator */
export interface SchemaGeneratorConfig {
  pegaEndpoint: string;
  username: string;
  password: string;
  maxDepth?: number;
}

export const DEFAULT_MAX_DEPTH = 3;
