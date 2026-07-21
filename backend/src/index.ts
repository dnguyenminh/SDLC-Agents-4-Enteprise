/**
 * Backend MCP Server entry point.
 * Initializes all modules, starts HTTP server on configured port.
 * LLM TagAnalyzer: qwen3-8b via LM Studio (port 1234)
 */

import pino from 'pino/pino.js';
import { loadConfig } from './config/index.js';
import { HttpServer } from './server/HttpServer.js';
import { ModuleRegistry } from './modules/ModuleRegistry.js';
import { MemoryModule } from './modules/memory/MemoryModule.js';
import { CodeIntelModule } from './modules/code-intel/CodeIntelModule.js';
import { OrchestrationModule } from './modules/orchestration/OrchestrationModule.js';
import { AnalyticsModule } from './modules/analytics/AnalyticsModule.js';
import { EmbeddingService } from './engine/parsers/embedding/EmbeddingService.js';
import { KBGraphModule } from './modules/kb-graph/KBGraphModule.js';
import { UtilityModule } from './modules/utility/UtilityModule.js';
import { initAdapters } from './admin/db/core.js';

const VERSION = '1.0.0';

const rootLogger = pino({ name: 'backend' });

async function main() {
  const config = loadConfig();

  const logger = pino({
    level: config.logLevel,
    transport: {
      target: 'pino/file',
      options: { destination: 1 }, // stdout
    },
  });

  logger.info({ version: VERSION, config: { port: config.port, host: config.host } }, 'Starting Backend MCP Server');

  // Initialize DB adapters FIRST — await PG connection before any module touches the DB
  await initAdapters();

  // Initialize module registry
  const registry = new ModuleRegistry(logger);

  // Register all modules
  registry.register(new MemoryModule(logger, undefined, registry));
  registry.register(new CodeIntelModule(logger));
  registry.register(new OrchestrationModule(logger, registry));
  registry.register(new AnalyticsModule(logger));
  registry.register(new KBGraphModule(logger));
  registry.register(new UtilityModule(logger));

  // Initialize all modules in parallel
  await registry.initializeAll();

  // Ingest all registered tools into the dedicated mcp_tools table for dynamic search (find_tools)
  const memoryModule = registry.getModule('memory') as MemoryModule | undefined;
  if (memoryModule && memoryModule.status === 'ready') {
    const memEngine = memoryModule.getEngine();
    const db = memEngine.getDb() as any;
    // Include proxied child-server tools so find_tools can discover them (hidden but discoverable).
    const orchestrationModule = registry.getModule('orchestration') as OrchestrationModule | undefined;
    const proxiedTools = orchestrationModule?.getClientManager().getProxiedTools() ?? [];
    // SA4E-42: local/core tools have server = NULL; proxied tools are owned by their
    // child server (tool.category = serverName). `server` is the scoped delete/prune key.
    const localTools = registry.getAllToolDefinitions().map((tool) => ({ tool, server: null as string | null }));
    const proxied = proxiedTools.map((tool) => ({ tool, server: (tool.category as string) ?? null }));
    const allTools = [...localTools, ...proxied];
    let ingestedCount = 0;
    
    const embeddingService = EmbeddingService.getInstance();

    // Prepare tools with embeddings asynchronously
    const preparedTools = [];
    for (const { tool, server } of allTools) {
      const text = `Tool: ${tool.name}\nDescription: ${tool.description}`;
      const vector = await embeddingService.generateEmbedding(text);
      const vectorBuffer = Buffer.from(new Float32Array(vector).buffer);
      preparedTools.push({ tool, server, vectorBuffer });
    }
    
    // Use transaction for faster ingestion
    const ingestTools = db.transaction((items: any[]) => {
      for (const item of items) {
        const tool = item.tool;
        const existing = db.prepare('SELECT id FROM mcp_tools WHERE name = ?').get(tool.name) as { id: number } | undefined;
        const schemaJson = JSON.stringify(tool.inputSchema || {});
        if (!existing) {
          db.prepare('INSERT INTO mcp_tools (name, description, schema_json, category, server, vector) VALUES (?, ?, ?, ?, ?, ?)').run(
            tool.name,
            tool.description,
            schemaJson,
            tool.category || 'general',
            item.server,
            item.vectorBuffer
          );
          ingestedCount++;
        } else {
          db.prepare('UPDATE mcp_tools SET description = ?, schema_json = ?, category = ?, server = ?, vector = ? WHERE id = ?').run(
            tool.description,
            schemaJson,
            tool.category || 'general',
            item.server,
            item.vectorBuffer,
            existing.id
          );
        }
      }
    });
    
    ingestTools(preparedTools);
    logger.info({ ingestedTools: ingestedCount, totalTools: allTools.length }, 'Ingested dynamic tools with vector embeddings');
  }

  logger.info(
    { readyModules: registry.getReadyCount(), totalModules: registry.getTotalCount() },
    'Modules initialized'
  );

  // Start HTTP server
  const server = new HttpServer({
    port: config.port,
    host: config.host,
    logger,
    registry,
    version: VERSION,
  });

  await server.start();

  // Graceful shutdown
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
