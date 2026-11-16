/**
 * SA4E-420 — MCP tool definitions for the 4 core agent tools.
 * Derived from CORE_TOOL_SCHEMAS (SA4E-417) so the schema stays single-source;
 * only the session-pin properties and tool-specific extras are added here.
 */

import { CORE_TOOL_SCHEMAS, type ArgFieldSpec } from '../security/tool-schemas.js';
import type { ToolDefinition } from '../../types/tool.js';

/** Names of the 4 core agent tools (order = 16K Doc §7). */
export const CORE_AGENT_TOOL_NAMES = [
  'search_symbols',
  'get_file_skeleton',
  'read_code_block',
  'query_call_graph',
] as const;

export type CoreAgentToolName = (typeof CORE_AGENT_TOOL_NAMES)[number];

/** Session pin properties — every call is bound to its pinned snapshot. */
const PIN_PROPERTIES: Record<string, unknown> = {
  session_id: { type: 'string', description: 'Chat session id (owns the pin)' },
  index_snapshot_id: { type: 'string', description: 'Snapshot pinned at session start' },
};

/** Properties supported by the tool method but absent from the 417 schema. */
const EXTRA_PROPERTIES: Partial<Record<CoreAgentToolName, Record<string, unknown>>> = {
  search_symbols: { offset: { type: 'number', description: 'Pagination offset (from nextPageCursor)' } },
  query_call_graph: {
    direction: { type: 'string', enum: ['CALLERS', 'CALLEES', 'IMPLEMENTATIONS'], description: 'Default CALLEES' },
  },
};

function fieldProperty(f: ArgFieldSpec): Record<string, unknown> {
  const prop: Record<string, unknown> = { type: f.type };
  if (f.maxLength !== undefined) prop.maxLength = f.maxLength;
  if (f.min !== undefined) prop.minimum = f.min;
  if (f.max !== undefined) prop.maximum = f.max;
  return prop;
}

function buildDefinition(name: CoreAgentToolName): ToolDefinition {
  const schema = CORE_TOOL_SCHEMAS[name];
  const properties: Record<string, unknown> = { ...PIN_PROPERTIES, ...EXTRA_PROPERTIES[name] };
  for (const f of schema.fields) properties[f.name] = fieldProperty(f);
  const required = ['session_id', 'index_snapshot_id', ...schema.fields.filter((f) => f.required).map((f) => f.name)];
  return {
    name,
    description: schema.description,
    inputSchema: { type: 'object', properties, required },
    category: 'code',
  };
}

export const CORE_AGENT_TOOL_DEFINITIONS: ToolDefinition[] = CORE_AGENT_TOOL_NAMES.map(buildDefinition);
