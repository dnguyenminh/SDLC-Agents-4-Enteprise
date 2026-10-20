/** KB graph MCP tool definitions (BR-18 extraction from KBGraphModule). */
import type { ToolDefinition } from '../../types/tool.js';

export function getKbGraphToolDefinitions(): ToolDefinition[] {
  return [
    {
      name: 'kb_graph_query',
      description: 'Query the knowledge base graph — search by label, type, or tier',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Fuzzy search label or entry_id' },
          type: { type: 'string', description: 'Filter by node type (FUNCTION, CLASS, DOCUMENT, etc.)' },
          tier: { type: 'string', description: 'Filter by tier (CODE, SHARED, etc.)' },
          limit: { type: 'number', description: 'Max results (default 20)' },
          project_id: { type: 'string' },
        },
      },
      category: 'kb-graph',
    },
    {
      name: 'kb_graph_add_node',
      description: 'Add a node to the KB graph — auto-creates position and type/tier edges',
      inputSchema: {
        type: 'object',
        properties: {
          label: { type: 'string', description: 'Display label (max 50 chars)' },
          type: { type: 'string', description: 'Node type (CLASS, FUNCTION, DOCUMENT, CONTEXT, etc.)' },
          tier: { type: 'string', description: 'Tier (SHARED, CODE, etc.)' },
          entry_id: { type: 'string', description: 'Unique ID (auto-generated if omitted)' },
          project_id: { type: 'string' },
        },
        required: ['label'],
      },
      category: 'kb-graph',
    },
    {
      name: 'kb_graph_add_edge',
      description: 'Add an edge between KB graph nodes',
      inputSchema: {
        type: 'object',
        properties: {
          source: { type: 'string', description: 'Source node entry_id' },
          target: { type: 'string', description: 'Target node entry_id' },
          relation: { type: 'string', description: 'Relationship label (default: RELATED_TO)' },
          weight: { type: 'number', description: 'Edge strength 0-1 (default 0.5)' },
        },
        required: ['source', 'target'],
      },
      category: 'kb-graph',
    },
    {
      name: 'kb_graph_community',
      description: 'Detect communities/clusters in the KB graph using label propagation. Returns groups of densely connected nodes.',
      inputSchema: {
        type: 'object',
        properties: {
          max_iterations: { type: 'number', description: 'Max label propagation passes (default 20)' },
          min_cluster_size: { type: 'number', description: 'Minimum nodes per cluster (default 2)' },
        },
      },
      category: 'kb-graph',
    },
    {
      name: 'kb_graph_pagerank',
      description: 'Compute PageRank scores for all graph nodes. Returns top-N nodes ranked by importance.',
      inputSchema: {
        type: 'object',
        properties: {
          top_n: { type: 'number', description: 'Return top N nodes (default 20, 0 = all)' },
          damping_factor: { type: 'number', description: 'Probability of following edges (default 0.85)' },
          max_iterations: { type: 'number', description: 'Max iterations (default 20)' },
        },
      },
      category: 'kb-graph',
    },
    {
      name: 'kb_graph_merge',
      description: 'Multi-agent graph merge — combine nodes/edges from multiple projects. Returns merged view with conflict detection.',
      inputSchema: {
        type: 'object',
        properties: {
          project_ids: { type: 'array', items: { type: 'string' }, description: 'Project IDs to merge' },
        },
        required: ['project_ids'],
      },
      category: 'kb-graph',
    },
    {
      name: 'kb_graph_cross_sync',
      description: 'Cross-tenant sync — create CROSS_TENANT edges between matching nodes across two projects.',
      inputSchema: {
        type: 'object',
        properties: {
          source_project_id: { type: 'string', description: 'Source project ID' },
          target_project_id: { type: 'string', description: 'Target project ID' },
        },
        required: ['source_project_id', 'target_project_id'],
      },
      category: 'kb-graph',
    },
    {
      name: 'kb_graph_remove_cross',
      description: 'Remove all CROSS_TENANT edges between two projects.',
      inputSchema: {
        type: 'object',
        properties: {
          project_a: { type: 'string', description: 'First project ID' },
          project_b: { type: 'string', description: 'Second project ID' },
        },
        required: ['project_a', 'project_b'],
      },
      category: 'kb-graph',
    },
    {
      name: 'kb_graph_stats',
      description: 'Get KB graph summary statistics: node/edge count, density, type distribution.',
      inputSchema: { type: 'object', properties: {} },
      category: 'kb-graph',
    },
  ];
}
