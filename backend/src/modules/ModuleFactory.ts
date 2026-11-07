import type { Logger } from 'pino';
import type { ModuleRegistry } from './ModuleRegistry.js';
import type { Container } from '../di/Container.js';
import { MemoryModule } from './memory/MemoryModule.js';
import { CodeIntelModule } from './code-intel/CodeIntelModule.js';
import { OrchestrationModule } from './orchestration/OrchestrationModule.js';
import { AnalyticsModule } from './analytics/AnalyticsModule.js';
import { KBGraphModule } from './kb-graph/KBGraphModule.js';
import { UtilityModule } from './utility/UtilityModule.js';
import { SecurityModule } from './security/SecurityModule.js';
import { SandboxModule } from './sandbox/SandboxModule.js';
import { KnowledgeModule } from '../knowledge/KnowledgeModule.js';
import { HttpServer } from '../server/HttpServer.js';
import { MemoryToolSearchService } from './orchestration/MemoryToolSearchService.js';
import { ToolRouter } from '../tool-router/ToolRouter.js';
import { McpConfigService } from './orchestration/McpConfigService.js';
import { EnrichmentModule } from './enrichment/EnrichmentModule.js';

export interface ModuleFactoryConfig {
  port: number;
  host: string;
  workspace: string;
  dataDir: string;
  version: string;
}

export class ModuleFactory {
  constructor(
    private readonly registry: ModuleRegistry,
    private readonly logger: Logger,
    private readonly config: ModuleFactoryConfig,
    private readonly container?: Container,
  ) {}

  createAndRegisterAll(): void {
    this.registry.register(new MemoryModule(this.logger, undefined, this.registry));
    this.registry.register(new CodeIntelModule(this.logger));
    this.registry.register(new OrchestrationModule(this.logger, this.registry));
    this.registry.register(new AnalyticsModule(this.logger));
    this.registry.register(new KBGraphModule(this.logger));
    this.registry.register(new UtilityModule(this.logger));
    // SA4E-85 Phase 0: Backend-Driven Knowledge — SSOT for threads/checkpoints/events
    this.registry.register(new KnowledgeModule(this.logger));
    // SA4E-167: GateGuard — programmatic destructive command prevention
    this.registry.register(new SecurityModule(this.logger, this.registry));
    // SA4E-6: Sandbox Execution (MCP Server Bridge) — isolated code execution
    this.registry.register(new SandboxModule(this.logger, this.registry));
    // SA4E-387: Enrichment with Dynamic Context Budget & Runtime Model Swap
    this.registry.register(new EnrichmentModule(this.logger, { enableMapReduce: true }));
  }

  /**
   * Initialize cross-module dependencies after all modules are registered.
   * This must be called after registry.initializeAll() completes.
   * SA4E-387: Wires EnrichmentModule with DatabaseAdapter and LLMService from MemoryModule.
   */
  async initializeCrossModuleDependencies(): Promise<void> {
    const memoryModule = this.registry.getModule('memory') as any;
    const enrichmentModule = this.registry.getModule('enrichment') as any;

    if (memoryModule && enrichmentModule && enrichmentModule.isReady && !enrichmentModule.isReady()) {
      try {
        // Get DatabaseAdapter from MemoryModule
        const engine = memoryModule.getEngine?.();
        const adapter = engine?.getAdapter?.();

        // Get LLMService from TaskWorker (may be undefined — no LLM server yet;
        // EnrichmentModule completes wiring later via LLM_SERVICE_READY — SA4E-387)
        const taskWorker = memoryModule.taskWorker;
        const llmService = taskWorker?.getLlmService?.();

        if (adapter) {
          await enrichmentModule.initializeWithDependencies(adapter, llmService, this.registry);
          this.logger.info('EnrichmentModule cross-module dependencies initialized (SA4E-387)');
        } else {
          this.logger.warn('EnrichmentModule initialization deferred: missing adapter or LLMService');
        }
      } catch (err) {
        this.logger.error({ err }, 'Failed to initialize EnrichmentModule cross-module dependencies');
      }
    }
  }

  createToolRouter(): ToolRouter {
    return new ToolRouter(this.registry, this.logger);
  }

  createMcpConfigService(): McpConfigService {
    return new McpConfigService(this.config.workspace, this.config.dataDir, this.logger);
  }

  createToolSearchService(memoryModule: MemoryModule): MemoryToolSearchService | null {
    try {
      const adapter = memoryModule.getEngine()?.getAdapter();
      if (!adapter) return null;
      return new MemoryToolSearchService(adapter, this.logger);
    } catch {
      return null;
    }
  }

  createHttpServer(toolRouter: ToolRouter, mcpConfigService: McpConfigService): HttpServer {
    return new HttpServer({
      port: this.config.port,
      host: this.config.host,
      logger: this.logger,
      registry: this.registry,
      version: this.config.version,
      toolRouter,
      mcpConfigService,
    });
  }
}