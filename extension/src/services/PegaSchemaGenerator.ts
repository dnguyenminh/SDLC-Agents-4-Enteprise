/**
 * PegaSchemaGenerator — facade. Implementation lives in ./PegaSchemaGenerator/*.
 * Re-exports the exact public API of the original single-file module.
 */

export type { SchemaProperty, SchemaNode, SchemaGenerationResult, SchemaGeneratorConfig } from "./PegaSchemaGenerator/types";
export { PegaSchemaGenerator } from "./PegaSchemaGenerator/generator-core";
