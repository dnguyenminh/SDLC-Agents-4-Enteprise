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
import { initAdapters } from './admin/db/core.js';
import { ensureSa4e215Tables } from './database/schema-registry/ensure-sa4e-215.js';
import { ensureSa4e237Tables } from './database/schema-registry/ensure-sa4e-237.js';
import { ensureSa4e276 } from './database/schema-registry/ensure-sa4e-276.js';
import { Container } from './di/Container.js';
import { bus, Events } from './shared/EventBus.js';
import { ingestToolsAfterModulesReady } from './bootstrap/tool-ingestion.js';
import { migrateGraphNodesTypes } from './bootstrap/graph-nodes-migration.js';

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

  // --- SA4E-237: Pega rule-to-rule reference resolution table ---
  // Never created before this: stageRuleReferences failed with
  // `no such table: pega_reference_resolution` on every rule ingest.
  try {
    await ensureSa4e237Tables();
  } catch (err) {
    logger.error({ err }, 'Failed to ensure SA4E-237 tables; Pega reference resolution unavailable');
  }

  // --- SA4E-276: Entra SSO config table (audit_log already lives in initSchema) ---
  try {
    await ensureSa4e276();
  } catch (err) {
    logger.error({ err }, 'Failed to ensure SA4E-276 tables; Entra SSO config unavailable');
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

  // --- Event: after all modules ready, ingest tools (BR-18: extracted to
  // bootstrap/tool-ingestion.ts — body preserved verbatim) ---
  bus.once(Events.ALL_MODULES_READY, () => ingestToolsAfterModulesReady(registry, factory, logger));

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

  // SA4E-103/SA4E-104 graph_nodes type migration (BR-18: extracted to
  // bootstrap/graph-nodes-migration.ts — body preserved verbatim, non-fatal).
  await migrateGraphNodesTypes(logger);

  const toolRouter = factory.createToolRouter();
  const mcpConfigService = factory.createMcpConfigService();
  const server = factory.createHttpServer(toolRouter, mcpConfigService);
  await server.start();

  // --- Graceful shutdown ---
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');
    // Best-effort: don't leave index_operations owned by this (dying) process
    // stuck at status='running' — flip them to `interrupted` now (threshold 0).
    // Non-fatal: the detector swallows DB errors internally.
    try {
      const { markInFlightOperationsInterrupted } = await import('./engine/indexer/startup-interrupt-detector.js');
      await markInFlightOperationsInterrupted();
    } catch (err) {
      logger.warn({ err }, 'Failed to mark running operations interrupted (non-fatal)');
    }
    await server.stop();
    await registry.shutdownAll();
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Global crash guards: a single rejected/uncaught error on an async path (e.g.
  // Pega ingest) must NOT silently kill the process. Without these, Node tears the
  // process down and EVERY in-flight HTTP socket fails at once as
  // `UND_ERR_SOCKET "other side closed"` on the client — the exact Pega-ingest symptom.
  // We log with full context so the real throw site is attributable instead of invisible.
  process.on('unhandledRejection', (reason: unknown) => {
    const err = reason instanceof Error ? { message: reason.message, stack: reason.stack } : { reason };
    logger.error(err, '[fatal] Unhandled promise rejection — process kept alive for diagnosis');
  });
  process.on('uncaughtException', (err: Error) => {
    logger.error({ message: err.message, stack: err.stack }, '[fatal] Uncaught exception — process kept alive for diagnosis');
    // Intentionally NOT exiting: an isolated ingest-path throw should not drop all
    // concurrent connections. Fatal startup errors are still caught by main().catch.
  });

  logger.info({ pid: process.pid, port: config.port, version: VERSION }, 'Backend MCP Server ready');
}

main().catch((err) => {
  rootLogger.error({ err }, 'Fatal error starting Backend:');
  process.exit(1);
});

