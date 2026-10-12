/**
 * Tool schema token estimation — SA4E-355 OI-4 (TDD §3.5).
 *
 * Estimates the prompt-token cost of a tool definition (name + description +
 * serialized JSON schema) with the shared chars/4 heuristic from
 * prompt-compressor — wire-only, no new estimation algorithm (BR-11).
 * The estimate is deducted from the session staticBudget before the budget
 * gate measures the assembled context (FSD §3.4.4 accounting).
 */
import { estimateTokenCount } from './prompt-compressor';

/**
 * A loadout tool entry as exposed by the extension runtime / MCP bridge.
 * `schemaTokens` wins over estimation when present (exact test fixtures and
 * precomputed pools).
 */
export interface LoadoutTool {
  /** Tool name — the allowlist identity. */
  name: string;
  /** Human-readable description sent to the model. */
  description?: string;
  /** JSON schema of the tool parameters (pi `parameters` / MCP `inputSchema`). */
  schema?: unknown;
  /** Precomputed schema tokens (OI-4) — respected verbatim when valid. */
  schemaTokens?: number;
}

/** Serializes a tool definition roughly as it reaches the prompt (OI-4). */
function serializeTool(tool: LoadoutTool): string {
  return `${tool.name}\n${tool.description ?? ''}\n${JSON.stringify(tool.schema ?? {})}`;
}

/**
 * Estimated prompt tokens contributed by one tool schema (OI-4): chars/4 on
 * the serialized name + description + schema. Never throws — a malformed
 * (e.g. circular) schema falls back to a name-only estimate so the loadout
 * accounting can never break a session creation.
 */
export function estimateToolSchemaTokens(tool: LoadoutTool): number {
  const precomputed = tool.schemaTokens;
  if (typeof precomputed === 'number' && Number.isFinite(precomputed) && precomputed >= 0) {
    return Math.ceil(precomputed);
  }
  try {
    return estimateTokenCount(serializeTool(tool));
  } catch {
    return estimateTokenCount(String(tool?.name ?? ''));
  }
}
