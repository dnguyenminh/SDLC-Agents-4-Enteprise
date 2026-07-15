/**
 * Evolution tool definitions — MCP schemas for mem_outcome, mem_verify, mem_configure_decay.
 * P1: mem_outcome functional. mem_verify and mem_configure_decay registered but handled in P2.
 */

export const EVOLUTION_TOOLS = [
  {
    name: 'mem_outcome',
    description: 'Record outcome feedback for a knowledge entry (success/fail/partial). Improves future relevance scoring via Bayesian factor.',
    inputSchema: {
      type: 'object',
      properties: {
        entry_id: { type: 'number', description: 'ID of the knowledge entry' },
        outcome: {
          type: 'string',
          enum: ['success', 'fail', 'partial'],
          description: 'Outcome of using this entry',
        },
        context: { type: 'string', description: 'Optional context about how the entry was used' },
        agent_name: { type: 'string', description: 'Name of the agent recording the outcome' },
      },
      required: ['entry_id', 'outcome'],
    },
  },
  {
    name: 'mem_verify',
    description: 'Verify or reject a knowledge entry flagged by an epoch event. Clears needs_verification flag.',
    inputSchema: {
      type: 'object',
      properties: {
        entry_id: { type: 'number', description: 'ID of the entry to verify' },
        action: {
          type: 'string',
          enum: ['verify', 'reject'],
          description: 'Verify (keep) or reject (archive) the entry',
        },
        comment: { type: 'string', description: 'Optional review comment' },
      },
      required: ['entry_id', 'action'],
    },
  },
  {
    name: 'mem_configure_decay',
    description: 'View or update decay configuration (half-life, decay rate, confidence floor, predictive scoring).',
    inputSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ['get', 'set'],
          description: 'Get current config or set new values',
        },
        half_life_days: { type: 'number', description: 'Days for temporal weight to reach 50%' },
        decay_rate: { type: 'number', description: 'Confidence reduction per cycle (0-1)' },
        confidence_floor: { type: 'number', description: 'Minimum confidence value (0-1)' },
        enable_predictive: { type: 'boolean', description: 'Enable predictive scoring' },
      },
      required: ['action'],
    },
  },
];
