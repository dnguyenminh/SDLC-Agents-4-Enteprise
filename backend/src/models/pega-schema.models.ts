/**
 * SA4E-214 — Shared Zod schemas for Pega schema API request/response validation.
 * Used by pega-schema-routes for input validation.
 * R-01: Body size limit enforced at route level (5MB).
 */

import { z } from 'zod';

// ─── Field Descriptor ───────────────────────────────────────────────────────

export const FieldDescriptorSchema = z.object({
  path: z.string().min(1).max(500),
  category: z.enum(['identity', 'logic', 'connectivity', 'metadata', 'configuration']),
  type: z.string().min(1).max(50),
  description: z.string().max(500),
  frequency: z.enum(['always', 'common', 'rare', 'optional']),
});

export type FieldDescriptor = z.infer<typeof FieldDescriptorSchema>;

// ─── Extraction Hints ───────────────────────────────────────────────────────

export const ExtractionHintsSchema = z.object({
  primary_logic_field: z.string().nullable(),
  logic_structure: z.string().nullable(),
  summary_focus: z.string().nullable(),
  // SA4E-222 Scope B — traversable nested logic paths (backward compatible: default []).
  // Examples: ["pyModelProcess.pyShapes", "pyStages[].pyProcesses[]"]
  nested_logic_paths: z.array(z.string()).optional().default([]),
  path_render_hint: z.string().nullable().optional(),
});

export type ExtractionHints = z.infer<typeof ExtractionHintsSchema>;

// ─── Enriched Schema (stored in KB) ────────────────────────────────────────

export const EnrichedSchemaSchema = z.object({
  rule_type: z.string().min(1).max(200),
  schema_version: z.number().int().min(1),
  created_at: z.string(),
  updated_at: z.string(),
  identity_fields: z.record(z.string(), FieldDescriptorSchema),
  logic_fields: z.record(z.string(), FieldDescriptorSchema),
  connectivity_fields: z.record(z.string(), FieldDescriptorSchema),
  extraction_hints: ExtractionHintsSchema,
  known_fields: z.array(z.string()),
  coverage: z.number().min(0).max(100),
  discovered_sections: z.array(z.string()),
});

export type EnrichedSchema = z.infer<typeof EnrichedSchemaSchema>;

// ─── API Request Schemas ────────────────────────────────────────────────────

/** POST /pega/schema/analyze (TDD §3.2) */
export const SchemaAnalyzeRequestSchema = z.object({
  harnessJson: z.record(z.string(), z.unknown()),
  ruleType: z.string().min(1).max(200),
  depth: z.number().int().min(0).max(5).optional().default(0),
});

/** POST /pega/schema/store (TDD §3.3) */
export const SchemaStoreRequestSchema = z.object({
  schema: EnrichedSchemaSchema,
});

/** PATCH /pega/schema/update (TDD §3.5) */
export const SchemaUpdateRequestSchema = z.object({
  ruleType: z.string().min(1).max(200),
  new_fields: z.array(FieldDescriptorSchema).min(1).max(100),
});

/** POST /pega/schema/generate (SA4E-214) */
export const SchemaGenerateRequestSchema = z.object({
  harnessJson: z.record(z.string(), z.unknown()),
  sectionJsons: z.record(z.string(), z.record(z.string(), z.unknown())).optional(),
  ruleType: z.string().min(1).max(200).optional(),
});
