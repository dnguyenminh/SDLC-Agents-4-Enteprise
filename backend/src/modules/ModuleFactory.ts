/**
 * ModuleFactory — creates and registers all modules with their dependencies.
 * Factory pattern: centralizes module instantiation, eliminates wiring from index.ts.
 * Each module is created with the right deps based on its constructor signature.
 */

import type { Logger } from 'pino';
import type { ModuleRegistry } from './ModuleRegistry.js';
import type { Container } from '../di/Container.js';
import { MemoryModule } from './memory/MemoryModule.js';
import { CodeIntelModule } from './code-intel/CodeIntelModule.js';
import { OrchestrationModule } from './orchestration/OrchestrationModule.js';
import { AnalyticsModule } from './analytics/AnalyticsModule.js';
import { KBGraphModule } from './kb-graph/KBGraphModule.js';
import { UtilityModule } from './utility/UtilityModule.js';
import { WebModule } from './web/WebModule.js';
import { HttpServer } from '../server/HttpServer.js';
import { MemoryToolSearchService } from './orchestration/MemoryToolSearchService.js';
import { ToolRouter } from '../tool-router/ToolRouter.js';
import { McpConfigService } from './orchestration/McpConfigService.js';

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
