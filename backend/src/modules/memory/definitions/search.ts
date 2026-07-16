/** Tier 1 tool definitions — high-frequency standalone tools. */

export const TIER1_TOOLS = [
  {
    name: 'mem_search',
    description: 'Hybrid search across local workspace memory (BM25 + vector + graph). Returns ranked results with progressive disclosure.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query' },
        limit: { type: 'number', description: 'Max results (default 10)' },
        tier: { type: 'string', description: 'Filter by tier: WORKING, EPISODIC, SEMANTIC, PROCEDURAL' },
        type: { type: 'string', description: 'Filter by type: DECISION, ERROR_PATTERN, ARCHITECTURE, etc.' },
        scope: { type: 'string', description: 'Filter by scope: USER, PROJECT, SHARED, all (default: auto from context)' },
        detail: { type: 'boolean', description: 'If true, include content preview (default: summary only)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'mem_ingest',
    description: 'Store a knowledge entry into local workspace memory (decision, error pattern, lesson learned, etc).',
    inputSchema: {
      type: 'object',
      properties: {
        content: { type: 'string', description: 'Full content of the knowledge entry' },
        summary: { type: 'string', description: 'Brief summary (auto-generated if omitted)' },
        type: { type: 'string', description: 'Type: DECISION, ERROR_PATTERN, ARCHITECTURE, API_DESIGN, REQUIREMENT, LESSON_LEARNED, PROCEDURE, CONTEXT' },
        scope: { type: 'string', description: 'Visibility scope: USER (private), PROJECT (team), SHARED (company). Default: USER' },
        user_id: { type: 'string', description: 'Owner user ID (auto from context if omitted)' },
        source: { type: 'string', description: 'Source identifier (file path, ticket, etc)' },

        tags: { type: 'string', description: 'Comma-separated tags' },
        agent_name: { type: 'string', description: 'Agent name (SM, BA, SA, DEV, QA, DevOps, etc.)' },
      },
      required: ['content'],
    },
  },
  {
    name: 'mem_ingest_file',
    description: 'Ingest a document by file path. Extension auto-reads file and sends content_base64 to backend. Zero-context for LLM: just provide file_path.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Path to document file (relative to workspace or absolute)' },
        content_base64: { type: 'string', description: 'Base64-encoded file content (injected by extension proxy)' },
        type: { type: 'string', description: 'Knowledge type: REQUIREMENT, ARCHITECTURE, DECISION, PROCEDURE, CONTEXT (default: CONTEXT)' },
        scope: { type: 'string', description: 'Visibility scope: USER (private), PROJECT (team), SHARED (company). Default: USER' },
        format: { type: 'string', description: 'Format: markdown (default) or text' },
      },
      required: ['file_path'],
    },
  },
];
