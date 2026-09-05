/**
 * Backend MCP Server entry point.
 * Uses ModuleFactory for module creation, EventBus for lifecycle events,
 * and DI Container for dependency management.
 */

import pino from 'pino/pino.js';
import * as fs from 'fs';
import { loadConfig } from './config/index.js';
import { ModuleRegistry } from './modules/ModuleRegistry.js';
import { ModuleFactory } from './modules/ModuleFactory.js';
import { MemoryModule } from './modules/memory/MemoryModule.js';
import { OrchestrationModule } from './modules/orchestration/OrchestrationModule.js';
import { EmbeddingService } from './engine/parsers/embedding/EmbeddingService.js';
import { initAdapters } from './admin/db/core.js';
import { ensureSa4e215Tables } from './database/schema-registry/ensure-sa4e-215.js';
import { Container } from './di/Container.js';
import { bus, Events } from './shared/EventBus.js';

const VERSION = '1.0.0';
const rootLogger = pino({ name: 'backend' });

async function main() {
  const config = loadConfig();

  const logger = pino({
    level: config.logLevel,
    transport: { target: 'pino/file', options: { destination: 1 } },
  });

  logger.info({ version: VERSION, config: { port: config.port, host: config.host } }, 'Starting Backend MCP Server');

  // --- DI Container setup ---
  const container = new Container();
  container.registerInstance('config', config);
  container.registerInstance('logger', logger);
  container.registerInstance('version', VERSION);

  // --- Init DB adapters first ---
  await initAdapters();

  // --- SA4E-215: ensure owned tables exist (mcp_servers, decisions) ---
  try {
    await ensureSa4e215Tables();
  } catch (err) {
    logger.error({ err }, 'Failed to ensure SA4E-215 tables; continuing startup');
  }

  // --- Registry + Factory ---
  const registry = new ModuleRegistry(logger, bus);
  const factory = new ModuleFactory(registry, logger, {
    port: config.port,
    host: config.host,
    workspace: config.workspace,
    dataDir: config.dataDir || '.code-intel',
    version: VERSION,
  }, container);

  factory.createAndRegisterAll();

  // --- Event: after all modules ready, ingest tools ---
  bus.once(Events.ALL_MODULES_READY, async () => {
    const memoryModule = registry.getModule('memory') as MemoryModule | undefined;
    if (!memoryModule || memoryModule.status !== 'ready') return;

    const adapter = memoryModule.getEngine().getAdapter();

    const orchestrationModule = registry.getModule('orchestration') as OrchestrationModule | undefined;
    const proxiedTools = orchestrationModule?.getClientManager().getProxiedTools() ?? [];

    const localTools = registry.getAllToolDefinitions().map((tool) => ({ tool, server: null as string | null }));
    const proxied = proxiedTools.map((tool) => ({ tool, server: (tool.category as string) ?? null }));
    const allTools = [...localTools, ...proxied];
    let ingestedCount = 0;

    const embeddingService = EmbeddingService.getInstance();
    const preparedTools = [];

    for (const { tool, server } of allTools) {
      const text = `Tool: ${tool.name}\nDescription: ${tool.description}`;
      const vector = await embeddingService.generateEmbedding(text);
      const vectorBuffer = Buffer.from(new Float32Array(vector).buffer);
      preparedTools.push({ tool, server, vectorBuffer });
    }

    // SA4E-53: Use async adapter for tool ingestion (cross-engine compatible)
    for (const item of preparedTools) {
      const tool = item.tool;
      const schemaJson = JSON.stringify(tool.inputSchema || {});
      const existing = await adapter.getAsync<{ id: number }>('SELECT id FROM mcp_tools WHERE name = ?', [tool.name]);
      if (!existing) {
        await adapter.runAsync(
          'INSERT INTO mcp_tools (name, description, schema_json, category, server, vector) VALUES (?, ?, ?, ?, ?, ?)',
          [tool.name, tool.description, schemaJson, tool.category || 'general', item.server, item.vectorBuffer],
        );
        ingestedCount++;
      } else {
        await adapter.runAsync(
          'UPDATE mcp_tools SET description = ?, schema_json = ?, category = ?, server = ?, vector = ? WHERE id = ?',
          [tool.description, schemaJson, tool.category || 'general', item.server, item.vectorBuffer, existing.id],
        );
      }
    }

logger.info({ ingestedTools: ingestedCount, totalTools: allTools.length }, 'Ingested dynamic tools with vector embeddings');

    // SA4E-217: Ensure pega_category_counters table exists (idempotent)
    try {
      const { getDbAdapter } = await import('./admin/db/core.js');
      const adminAdapter = getDbAdapter();
      if (adminAdapter.isConnected()) {
        const { ensurePegaCategoryCountersTable } = await import('./database/migration/ensure-pega-category-counters');
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
  });

  // --- Init all modules ---
  await registry.initializeAll();
  await bus.emit(Events.ALL_MODULES_READY, { count: registry.getReadyCount() });

  logger.info(
    { readyModules: registry.getReadyCount(), totalModules: registry.getTotalCount() },
    'Modules initialized',
  );

  // --- HTTP Server ---
  // Ensure indexTempDir exists for source file writes
  const indexTempDir = config.indexTempDir;
  if (!fs.existsSync(indexTempDir)) {
    fs.mkdirSync(indexTempDir, { recursive: true });
    logger.info({ indexTempDir }, 'Created index temp directory');
  }

  // SA4E-103: Fix graph_nodes type for existing KB entries (one-time migration)
  try {
    const { getDbAdapter } = await import('./admin/db/core.js');
    const adminAdapter = getDbAdapter();
    if (adminAdapter.isConnected()) {
      const engine = adminAdapter.getEngine();
      // SA4E-104: Ensure body_embeddings has project_id + UNIQUE constraint on PG
      if (engine === 'postgresql') {
        const { ensurePostgresIndexSchema } = await import('./database/migration/pg-schema-ensure.js');
        await ensurePostgresIndexSchema(adminAdapter);
      }
      if (engine === 'postgresql') {
        await adminAdapter.runAsync(
          `UPDATE graph_nodes SET type = ke.type FROM knowledge_entries ke WHERE graph_nodes.entry_id = 'kb-entry:' || ke.id::text AND graph_nodes.type = 'KNOWLEDGE_ENTRY'`, [],
        );
      } else {
        await adminAdapter.runAsync(
          `UPDATE graph_nodes SET type = (SELECT ke.type FROM knowledge_entries ke WHERE 'kb-entry:' || ke.id = graph_nodes.entry_id) WHERE entry_id LIKE 'kb-entry:%' AND type = 'KNOWLEDGE_ENTRY'`, [],
        );
      }
      logger.info('Fixed graph_nodes types from KNOWLEDGE_ENTRY to actual entry types');
    }
  } catch (err) {
    logger.warn({ err }, 'graph_nodes type migration skipped (non-fatal)');
  }

  const toolRouter = factory.createToolRouter();
  const mcpConfigService = factory.createMcpConfigService();
  const server = factory.createHttpServer(toolRouter, mcpConfigService);
  await server.start();

  // --- Graceful shutdown ---
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    await server.stop();
    await registry.shutdownAll();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  logger.info({ pid: process.pid, port: config.port, version: VERSION }, 'Backend MCP Server ready');
}

main().catch((err) => {
  rootLogger.error({ err }, 'Fatal error starting Backend:');
  process.exit(1);
});

