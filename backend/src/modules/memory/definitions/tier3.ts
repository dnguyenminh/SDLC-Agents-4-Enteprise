/** Tier 3 tool definitions — low-frequency scoring, admin, and conversation tools. */

export const TIER3_TOOLS = [
  {
    name: 'mem_conversation',
    description: 'Structured conversation history: save turns, query sessions, search conversation content.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Action: save_turn, get_session, list_sessions, search, summarize' },
        session_id: { type: 'string', description: 'Session ID (for save_turn/get_session)' },
        role: { type: 'string', description: 'Role: user, assistant, system, tool (for save_turn)' },
        content: { type: 'string', description: 'Turn content (for save_turn)' },
        tool_calls: { type: 'string', description: 'JSON array of tool calls (for save_turn)' },
        query: { type: 'string', description: 'Search query (for search)' },
        limit: { type: 'number', description: 'Max results (default: 20)' },
      },
      required: ['action'],
    },
  },
  {
    name: 'mem_scoring',
    description: 'Quality & confidence scoring + feedback for entries.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Action: quality_score, quality_stats, low_quality, validate, confidence, confidence_stats, unreliable, feedback_submit, feedback_view, top_rated, low_rated' },
        entry_id: { type: 'number', description: 'Entry ID' },
        content: { type: 'string', description: 'Content to validate (for validate action)' },
        type: { type: 'string', description: 'Entry type (for validate)' },
        threshold: { type: 'number', description: 'Quality threshold (default: 40)' },
        rating: { type: 'number', description: 'Rating: 1 (thumbs up) or -1 (thumbs down)' },
        comment: { type: 'string', description: 'Feedback comment' },
        limit: { type: 'number', description: 'Max results (default: 20)' },
      },
      required: ['action'],
    },
  },
  {
    name: 'mem_admin',
    description: 'System administration: status, audit trail, sessions, analytics, dashboard, code sync, tool usage counters.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'Action: status, audit, sessions, analytics, dashboard, sync_code, tool_usage, popular, gaps, zero_results, metrics, recommendations, trends' },
        limit: { type: 'number', description: 'Max results (default: 20)' },
        operation: { type: 'string', description: 'Filter audit by operation: INGEST, DELETE, SEARCH, CONSOLIDATE, ACCESS' },
        days: { type: 'number', description: 'Trend period in days (default: 30)' },
        kind: { type: 'string', description: 'For sync_code: class, interface, function (default: class+interface)' },
        tool_name: { type: 'string', description: 'For tool_usage: filter counters for a single tool (default: all tools, desc by call_count)' },
      },
      required: ['action'],
    },
  },
];

export const MEMORY_TOOL_ALIASES = [
  { name: 'mem_promote', description: 'KB scope promotion: scan candidates, list pending, approve/reject, request SHARED, or auto-promote on merge/release.', inputSchema: { type: 'object', properties: { action: { type: 'string', description: 'Action: scan, list, approve, reject, request_shared, promote_on_merge' }, entry_id: { type: 'number', description: 'Entry ID (for approve/reject/request_shared)' }, ticket_key: { type: 'string', description: 'Ticket key (for promote_on_merge — promotes all USER entries for this ticket to PROJECT)' }, reviewer: { type: 'string' }, comment: { type: 'string' }, reason: { type: 'string' }, limit: { type: 'number' } }, required: ['action'] }, category: 'memory' },
  { name: 'mem_get', description: 'Get a knowledge entry by ID (alias for mem_crud get).', inputSchema: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] }, category: 'memory' },
  { name: 'mem_delete', description: 'Delete a knowledge entry by ID (alias for mem_crud delete).', inputSchema: { type: 'object', properties: { id: { type: 'number' } }, required: ['id'] }, category: 'memory' },
  { name: 'mem_list', description: 'List knowledge entries (alias for mem_crud list).', inputSchema: { type: 'object', properties: { limit: { type: 'number' }, tier: { type: 'string' }, type: { type: 'string' } } }, category: 'memory' },
  { name: 'mem_status', description: 'Get memory status (alias for mem_admin status).', inputSchema: { type: 'object', properties: {} }, category: 'memory' },
  { name: 'mem_audit', description: 'Get memory audit log (alias for mem_admin audit).', inputSchema: { type: 'object', properties: { limit: { type: 'number' }, operation: { type: 'string' } } }, category: 'memory' },
  { name: 'mem_sessions', description: 'List memory sessions (alias for mem_admin sessions).', inputSchema: { type: 'object', properties: {} }, category: 'memory' },
];
