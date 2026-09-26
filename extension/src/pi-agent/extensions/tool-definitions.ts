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
 * Validate tool parameters against schema (basic validation)
 */
export function validateParams(schema: any, params: Record<string, unknown>): { valid: boolean; error?: string } {
  try {
    const required = schema.required || [];
    for (const field of required) {
      if (!(field in params)) {
        return { valid: false, error: `Missing required field: ${field}` };
      }
    }
    return { valid: true };
  } catch (err) {
    return { valid: false, error: (err as Error).message };
  }
}
