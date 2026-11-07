/**
 * Post-startup dynamic tool ingestion (SA4E-53).
 * Runs once after ALL_MODULES_READY: ensures the mcp_tools table exists,
 * embeds every registered + proxied tool, upserts them into the memory
 * adapter, prunes stale rows via bootstrap/tool-prune (SA4E-369 — removed
 * modules / removed child-server config), ensures pega_category_counters
 * (SA4E-217), and wires ToolSearchService into the OrchestrationModule.
 * Extracted verbatim from src/index.ts (BR-18 file-size split).
 */

import { bus, Events } from '../shared/EventBus.js';
import { EmbeddingService } from '../engine/parsers/embedding/EmbeddingService.js';
import type { ModuleRegistry } from '../modules/ModuleRegistry.js';
import type { ModuleFactory } from '../modules/ModuleFactory.js';
import type { MemoryModule } from '../modules/memory/MemoryModule.js';
import type { OrchestrationModule } from '../modules/orchestration/OrchestrationModule.js';
import { deriveToolLabels } from '../modules/orchestration/tool-labels.js';
import { pruneStaleCoreRows, pruneOrphanProxyRows } from './tool-prune.js';
import type { DatabaseAdapter } from '../database/adapters/DatabaseAdapter.js';
import type { Logger } from 'pino';

export async function ingestToolsAfterModulesReady(
  registry: ModuleRegistry,
  factory: ModuleFactory,
  logger: Logger,
): Promise<void> {
  const memoryModule = registry.getModule('memory') as MemoryModule | undefined;
  if (!memoryModule || memoryModule.status !== 'ready') return;

  const adapter = memoryModule.getEngine().getAdapter();

  // Ensure mcp_tools exists before tool ingestion (fresh DBs may reach here
  // before the memory schema has created it). Canonical columns match
  // engine/db/schema.ts SCHEMA_V1.
  try {
    const idCol = adapter.getEngine() === 'postgresql' ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
    await adapter.execAsync(
      `CREATE TABLE IF NOT EXISTS mcp_tools (id ${idCol}, name TEXT NOT NULL UNIQUE, description TEXT NOT NULL, schema_json TEXT NOT NULL, category TEXT, server TEXT, labels TEXT, vector BLOB)`,
    );
    await adapter.execAsync(`CREATE INDEX IF NOT EXISTS idx_mcp_tools_server ON mcp_tools(server)`);
    await ensureMcpToolsLabelsColumn(adapter, logger);
  } catch (err) {
    logger.debug({ err }, 'mcp_tools ensure skipped (non-fatal)');
  }

  const orchestrationModule = registry.getModule('orchestration') as OrchestrationModule | undefined;
  const proxiedTools = orchestrationModule?.getClientManager().getProxiedTools() ?? [];

  const localTools = registry.getAllToolDefinitions().map((tool) => ({ tool, server: null as string | null }));
  const proxied = proxiedTools.map((tool) => ({ tool, server: (tool.category as string) ?? null }));
  const allTools = [...localTools, ...proxied];
  let ingestedCount = 0;

  const embeddingService = EmbeddingService.getInstance();
  const preparedTools = [];

  for (const { tool, server } of allTools) {
    // Labels: deterministic keyword surface for find_tools (name tokens +
    // family synonyms + category/server) — embedded alongside the description.
    const labels = deriveToolLabels({ name: tool.name, category: tool.category, server });
    const text = `Tool: ${tool.name}\nDescription: ${tool.description}\nLabels: ${labels}`;
    const vector = await embeddingService.generateEmbedding(text);
    const vectorBuffer = Buffer.from(new Float32Array(vector).buffer);
    preparedTools.push({ tool, server, vectorBuffer, labels });
  }

  // SA4E-53: Use async adapter for tool ingestion (cross-engine compatible)
  for (const item of preparedTools) {
    const tool = item.tool;
    const schemaJson = JSON.stringify(tool.inputSchema || {});
    const existing = await adapter.getAsync<{ id: number }>('SELECT id FROM mcp_tools WHERE name = ?', [tool.name]);
    if (!existing) {
      await adapter.runAsync(
        'INSERT INTO mcp_tools (name, description, schema_json, category, server, labels, vector) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [tool.name, tool.description, schemaJson, tool.category || 'general', item.server, item.labels, item.vectorBuffer],
      );
      ingestedCount++;
    } else {
      await adapter.runAsync(
        'UPDATE mcp_tools SET description = ?, schema_json = ?, category = ?, server = ?, labels = ?, vector = ? WHERE id = ?',
        [tool.description, schemaJson, tool.category || 'general', item.server, item.labels, item.vectorBuffer, existing.id],
      );
    }
  }

  logger.info({ ingestedTools: ingestedCount, totalTools: allTools.length }, 'Ingested dynamic tools with vector embeddings');

  // SA4E-369: prune stale core rows — registry tools removed from the
  // codebase (e.g. WebModule KSA-297) leave unmanageable server-NULL rows
  // behind, which find_tools would still serve. Symmetric to the per-server
  // prune in McpToolsRepository; the authoritative snapshot is the registry
  // at ingestion time. Fail-soft: hygiene must never break startup.
  const coreNames = preparedTools.filter(i => i.server === null).map(i => i.tool.name);
  try {
    await pruneStaleCoreRows(adapter, logger, coreNames);
  } catch (err) {
    logger.warn({ err }, 'mcp_tools stale-core prune failed (non-fatal)');
  }

  // SA4E-369: prune orphan proxy rows — servers removed from the child-server
  // config (e.g. atlassian/stitch) leave rows no execute path can serve.
  // Truth source is getServersStatus(): servers registered but transiently
  // down are KEPT (health monitor retries; applyConnected refreshes rows).
  const registeredServers = (orchestrationModule?.getClientManager().getServersStatus() ?? [])
    .map(s => s.name);
  try {
    await pruneOrphanProxyRows(adapter, logger, registeredServers);
  } catch (err) {
    logger.warn({ err }, 'mcp_tools orphan-proxy prune failed (non-fatal)');
  }

  // SA4E-217: Ensure pega_category_counters table exists (idempotent)
  try {
    const { getDbAdapter } = await import('../admin/db/core.js');
    const adminAdapter = getDbAdapter();
    if (adminAdapter.isConnected()) {
      const { ensurePegaCategoryCountersTable } = await import('../database/migration/ensure-pega-category-counters');
      await ensurePegaCategoryCountersTable(adminAdapter);
      logger.info('Ensured pega_category_counters table exists');
    }
  } catch (err) {
    logger.warn({ err }, 'pega_category_counters migration skipped (non-fatal)');
  }

  // Wire ToolSearchService into OrchestrationModule
  if (orchestrationModule) {
    const searchSvc = factory.createToolSearchService(memoryModule);
    if (searchSvc) {
      orchestrationModule.setToolSearchService(searchSvc);
      logger.info('ToolSearchService injected into OrchestrationModule');
    }
  }

  await bus.emit(Events.TOOLS_INGESTED, { count: allTools.length });
}

/**
 * SA4E-369 follow-up: additive `labels` column on `mcp_tools` for
 * keyword-backed tool discovery (MemoryToolSearchService boosts label hits).
 * Probe-based column check (never swallow-catch), idempotent, cross-engine —
 * mirrors the SA4E-42 `server` column pattern in engine/db/migrations.ts.
 */
async function ensureMcpToolsLabelsColumn(adapter: DatabaseAdapter, logger: Logger): Promise<void> {
  const engine = adapter.getEngine();
  const probe = engine === 'postgresql'
    ? `SELECT column_name as name FROM information_schema.columns WHERE table_name = 'mcp_tools'`
    : `PRAGMA table_info('mcp_tools')`;
  const cols = await adapter.allAsync<{ name: string }>(probe);
  if (cols.some(c => c.name === 'labels')) return;
  await adapter.execAsync('ALTER TABLE mcp_tools ADD COLUMN labels TEXT');
  logger.info('mcp_tools: added labels column (keyword-backed tool search)');
}

