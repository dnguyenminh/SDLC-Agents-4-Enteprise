/**
 * Tool definitions for Pi Extensions MCP bridge
 * Defines schemas and metadata for tools exposed to Pi agent
 */

export interface ToolDefinition {
  name: string;
  label: string;
  description: string;
  parameters: unknown;
}

export const TOOLS: ToolDefinition[] = [
  {
    name: 'jira_get_issue',
    label: 'Jira Get Issue',
    description: 'Fetch a Jira issue by key',
    parameters: {
      type: 'object',
      properties: {
        issue_key: { type: 'string', description: 'Jira issue key' },
      },
      required: ['issue_key'],
    },
  },
  {
    name: 'mem_search',
    label: 'Memory Search',
    description: 'Search knowledge base memory',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['query'],
    },
  },
  {
    name: 'mem_ingest',
    label: 'Memory Ingest',
    description: 'Ingest knowledge into memory',
    parameters: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        type: { type: 'string' },
        tags: { type: 'string' },
      },
      required: ['content'],
    },
  },
  {
    name: 'code_search',
    label: 'Code Search',
    description: 'Search code symbols',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'number' },
      },
      required: ['query'],
    },
  },
  {
    name: 'execute_dynamic_tool',
    label: 'Execute Dynamic Tool',
    description: 'Execute dynamic tool via MCP wrapper',
    parameters: {
      type: 'object',
      properties: {
        tool_name: { type: 'string' },
        arguments: { type: 'object' },
      },
      required: ['tool_name'],
    },
  },
];

/**
 * Validate tool parameters against schema (hardened per SEC-324-03).
 * Enforces required-field presence, object shape, and per-field length caps
 * so a compromised tool output cannot smuggle oversized payloads through.
 */
export function validateParams(schema: any, params: Record<string, unknown>): { valid: boolean; error?: string } {
  try {
    if (typeof params !== "object" || params === null || Array.isArray(params)) {
      return { valid: false, error: "params must be an object" };
    }
    const required = schema.required || [];
    for (const field of required) {
      if (!(field in params)) {
        return { valid: false, error: `Missing required field: ${field}` };
      }
    }
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === "string" && value.length > MAX_STRING_PARAM_LENGTH) {
        return { valid: false, error: `Field '${key}' exceeds ${MAX_STRING_PARAM_LENGTH} chars` };
      }
    }
    return { valid: true };
  } catch (err) {
    return { valid: false, error: (err as Error).message };
  }
}

/**
 * SEC-324-03 — bridge allowlist. Only these concrete tools may be exposed
 * to the Pi agent without an explicit dynamic-chaining opt-in.
 * `execute_dynamic_tool` is deliberately absent (deny by default).
 */
export const DYNAMIC_TOOL_NAME = "execute_dynamic_tool";

/** Concrete tools allowed on the Pi→MCP bridge path. */
export const TOOL_ALLOWLIST: ReadonlySet<string> = new Set([
  "jira_get_issue",
  "mem_search",
  "mem_ingest",
  "code_search",
]);

/** Per-string-field cap enforced by validateParams (prompt-injection hygiene). */
export const MAX_STRING_PARAM_LENGTH = 4000;

/** True when the tool may be bridged without the dynamic-chaining opt-in. */
export function isAllowedBridgeTool(toolName: string): boolean {
  return TOOL_ALLOWLIST.has(toolName);
}
