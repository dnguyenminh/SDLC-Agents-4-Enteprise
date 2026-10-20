/** KB graph MCP tool handler factories (BR-18 extraction from KBGraphModule). */
import type { ToolHandler } from '../../types/tool.js';
import type { Logger } from 'pino';
import type { GraphService } from './service/index.js';

function jsonResult(payload: unknown, isError = false) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(payload) }], isError };
}

export function registerQueryHandlers(handlers: Map<string, ToolHandler>, svc: GraphService, logger: Logger): void {
  handlers.set('kb_graph_query', async (args) => {
    const query = args.query as string | undefined;
    const type = args.type as string | undefined;
    const tier = args.tier as string | undefined;
    const limit = (args.limit as number) || 20;
    const projectId = (args.project_id as string) || (args.__projectId as string) || undefined;

    try {
      const nodes = await svc.searchNodes(query, type, tier, limit, projectId);
      const nodeIds = nodes.map(n => n.id);
      const edges = await svc.getEdgesForNodeIds(nodeIds);
      return jsonResult({
        nodes, edges, query: query ?? null,
        stats: { nodeCount: nodes.length, edgeCount: edges.length },
      });
    } catch (err: any) {
      logger.error({ err: err.message, query }, 'kb_graph_query failed');
      return jsonResult({ error: err.message, nodes: [], edges: [] }, true);
    }
  });

  handlers.set('kb_graph_add_node', async (args) => {
    const label = args.label as string || args.title as string || '';
    const type = (args.type as string) || 'CONTEXT';
    const tier = (args.tier as string) || 'SHARED';
    const entryId = (args.entry_id as string) || `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const projectId = (args.project_id as string) || '';

    try {
      const node = await svc.addNode(entryId, label, type, tier, projectId);
      return jsonResult({ status: 'added', node });
    } catch (err: any) {
      return jsonResult({ error: err.message }, true);
    }
  });

  handlers.set('kb_graph_add_edge', async (args) => {
    const source = args.source as string || args.from as string || '';
    const target = args.target as string || args.to as string || '';
    if (!source || !target) {
      return jsonResult({ error: 'source and target are required' }, true);
    }
    const weight = (args.weight as number) ?? 0.5;
    const relType = (args.relation as string) || (args.rel_type as string) || 'RELATED_TO';

    try {
      await svc.addEdge(source, target, weight, relType);
      return jsonResult({ status: 'added', source, target, relType });
    } catch (err: any) {
      return jsonResult({ error: err.message }, true);
    }
  });

  handlers.set('kb_graph_community', async (args) => {
    const maxIterations = (args.max_iterations as number) || 20;
    const minClusterSize = (args.min_cluster_size as number) || 2;

    try {
      const communities = await svc.detectCommunities(maxIterations, minClusterSize);
      return jsonResult({
        communities,
        totalClusters: communities.length,
        totalNodes: communities.reduce((s, c) => s + c.nodeCount, 0),
      });
    } catch (err: any) {
      logger.error({ err: err.message }, 'kb_graph_community failed');
      return jsonResult({ error: err.message, communities: [] }, true);
    }
  });

  handlers.set('kb_graph_pagerank', async (args) => {
    const topN = (args.top_n as number) || 20;
    const dampingFactor = (args.damping_factor as number) ?? 0.85;
    const maxIterations = (args.max_iterations as number) || 20;

    try {
      const ranked = await svc.computePageRank(dampingFactor, maxIterations, 0.001, topN);
      return jsonResult({ ranked, topN: ranked.length });
    } catch (err: any) {
      logger.error({ err: err.message }, 'kb_graph_pagerank failed');
      return jsonResult({ error: err.message, ranked: [] }, true);
    }
  });
}

export function registerAdminHandlers(handlers: Map<string, ToolHandler>, svc: GraphService): void {
  handlers.set('kb_graph_merge', async (args) => {
    const projectIds = args.project_ids as string[] || [];
    try {
      const result = await svc.mergeGraph(projectIds);
      return jsonResult(result);
    } catch (err: any) {
      return jsonResult({ error: err.message }, true);
    }
  });

  handlers.set('kb_graph_cross_sync', async (args) => {
    const source = args.source_project_id as string || '';
    const target = args.target_project_id as string || '';
    if (!source || !target) {
      return jsonResult({ error: 'source_project_id and target_project_id are required' }, true);
    }
    try {
      const result = await svc.crossSync(source, target);
      return jsonResult(result);
    } catch (err: any) {
      return jsonResult({ error: err.message }, true);
    }
  });

  handlers.set('kb_graph_remove_cross', async (args) => {
    const a = args.project_a as string || '';
    const b = args.project_b as string || '';
    if (!a || !b) {
      return jsonResult({ error: 'project_a and project_b are required' }, true);
    }
    try {
      const result = await svc.removeCrossEdges(a, b);
      return jsonResult(result);
    } catch (err: any) {
      return jsonResult({ error: err.message }, true);
    }
  });

  handlers.set('kb_graph_stats', async () => {
    try {
      const stats = await svc.getGraphStats();
      return jsonResult(stats);
    } catch (err: any) {
      return jsonResult({ error: err.message }, true);
    }
  });
}
