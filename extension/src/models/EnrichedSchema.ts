/**
 * SA4E-214 — EnrichedSchema models and Zod schemas.
 * Defines the enriched schema structure for Pega rule types:
 * field descriptors, extraction hints, and the complete schema object.
 */

import { z } from 'zod';

// ─── Field Descriptor ───────────────────────────────────────────────────────

/** Semantic category for a schema field (TDD §5.2) */
export type FieldCategory = 'identity' | 'logic' | 'connectivity' | 'metadata' | 'configuration';

/** Frequency of occurrence across instances */
export type FieldFrequency = 'always' | 'common' | 'rare' | 'optional';

/** Single field descriptor within an enriched schema */
export interface FieldDescriptor {
  path: string;
  category: FieldCategory;
  type: string;
  description: string;
  frequency: FieldFrequency;
}

/** Zod schema for FieldDescriptor — validates data from backend API */
export const FieldDescriptorSchema = z.object({
  path: z.string().min(1),
  category: z.enum(['identity', 'logic', 'connectivity', 'metadata', 'configuration']),
  type: z.string().min(1),
  description: z.string(),
  frequency: z.enum(['always', 'common', 'rare', 'optional']),
});

// ─── Extraction Hints ───────────────────────────────────────────────────────

/** Hints for the LLM enrichment on how to process a rule type */
export interface ExtractionHints {
  primary_logic_field: string | null;
  logic_structure: string | null;
  summary_focus: string | null;
}

export const ExtractionHintsSchema = z.object({
  primary_logic_field: z.string().nullable(),
  logic_structure: z.string().nullable(),
  summary_focus: z.string().nullable(),
});

// ─── Enriched Schema ────────────────────────────────────────────────────────

/** Complete enriched schema for one Pega rule type (TDD §3.3, §5.2) */
export interface EnrichedSchema {
  rule_type: string;
  schema_version: number;
  created_at: string;
  updated_at: string;
  identity_fields: Record<string, FieldDescriptor>;
  logic_fields: Record<string, FieldDescriptor>;
  connectivity_fields: Record<string, FieldDescriptor>;
  extraction_hints: ExtractionHints;
  known_fields: string[];
  coverage: number;
  discovered_sections: string[];
}

export const EnrichedSchemaSchema = z.object({
  rule_type: z.string().min(1),
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

// ─── API Request/Response Types ─────────────────────────────────────────────

/** Request body for POST /pega/schema/analyze (TDD §3.2) */
export interface SchemaAnalyzeRequest {
  harnessJson: Record<string, unknown>;
  ruleType: string;
  depth?: number;
}

/** Response from POST /pega/schema/analyze */
export interface SchemaAnalyzeResponse {
  fields: FieldDescriptor[];
  sub_sections: string[];
  rule_based_coverage: number;
  llm_fallback_used: boolean;
  hints: Partial<ExtractionHints>;
}

/** Response from PATCH /pega/schema/update */
export interface SchemaUpdateResponse {
  success: boolean;
  new_version: number;
}

/** Response from POST /pega/schema/store */
export interface SchemaStoreResponse {
  success: boolean;
  id: number;
}
