/**
 * SA4E-387: EnrichmentModule — Module registration for enrichment pipeline.
 * Wires up ModelResolver, ContextWindowDiscovery, BudgetGuard, ReductionPipeline,
 * and provides the enrichment API routes.
 * Implements IModule for consistent lifecycle management.
 */

import type { IModule, ModuleStatus } from '../../types/module.js';
import type { ToolHandler, ToolDefinition } from '../../types/tool.js';
import type { Logger } from 'pino';
import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';
import type { LLMService } from '../memory/llm/LLMService.js';
import { ContextWindowDiscovery } from '../memory/llm/context-window.js';
import { CodeEnrichmentHandler } from '../../engine/enrichment/CodeEnrichmentHandler.js';
import { ModelResolver, ModelResolverConfig } from './ModelResolver.js';
import type { ModuleRegistry } from '../ModuleRegistry.js';

export interface EnrichmentModuleConfig {
  modelResolver?: ModelResolverConfig;
  enableMapReduce?: boolean;
}

export class EnrichmentModule implements IModule {
  readonly name = 'enrichment';
  private _status: ModuleStatus = 'initializing';

  private handler: CodeEnrichmentHandler | null = null;
  private modelResolver: ModelResolver | null = null;
  private windowDiscovery: ContextWindowDiscovery | null = null;

  constructor(
    private readonly logger: Logger,
    private readonly config: EnrichmentModuleConfig = {},
  ) {
    this.logger = logger.child({ module: this.name });
  }

  get status(): ModuleStatus {
    return this._status;
  }

  getToolHandlers(): Map<string, ToolHandler> {
    return new Map(); // No MCP tools for this module
  }

  getToolDefinitions(): ToolDefinition[] {
    return []; // No MCP tools for this module
  }

  /**
   * IModule interface - no-op for now, but could initialize without deps for testing.
   * Dependencies are injected via initializeWithDependencies().
   */
  async initialize(): Promise<void> {
    // Dependencies injected via initializeWithDependencies()
  }

  /**
   * Initialize the enrichment module with required dependencies.
   * Called after all core modules are registered.
   */
  async initializeWithDependencies(
    adapter: DatabaseAdapter,
    llmService: LLMService,
    registry: ModuleRegistry,
  ): Promise<void> {
    this._status = 'initializing';

    // Create ModelResolver with global LLMService
    const resolverConfig: ModelResolverConfig = this.config.modelResolver || {
      defaultProvider: 'ollama',
      defaultModel: 'qwen2.5:7b-instruct-q4_K_M',
      defaultBaseUrl: 'http://localhost:11434',
    };
    this.modelResolver = new ModelResolver(llmService, resolverConfig);

    // Create ContextWindowDiscovery (will be configured per-call via handler)
    this.windowDiscovery = new ContextWindowDiscovery(
      'ollama', // placeholder, updated per-call
      'qwen2.5:7b-instruct-q4_K_M',
      'http://localhost:11434',
      800, // reservedOutputTokens
    );

    // Create CodeEnrichmentHandler
    this.handler = new CodeEnrichmentHandler(adapter, llmService, this.logger);

    // Register handler with registry for TaskWorker access
    if (registry.registerEnrichmentHandler) {
      registry.registerEnrichmentHandler(this.handler);
    }

    this._status = 'ready';
    this.logger.info('EnrichmentModule initialized (SA4E-387)');
  }

  async shutdown(): Promise<void> {
    this._status = 'stopped';
    this.logger.info('EnrichmentModule shutdown');
  }

  /** Get the enrichment handler for TaskWorker */
  getHandler(): CodeEnrichmentHandler | null {
    return this.handler;
  }

  /** Get the model resolver for API routes */
  getModelResolver(): ModelResolver | null {
    return this.modelResolver;
  }

  /** Get window discovery for API routes */
  getWindowDiscovery(): ContextWindowDiscovery | null {
    return this.windowDiscovery;
  }

  /** Get config for API routes */
  getConfig(): EnrichmentModuleConfig {
    return this.config;
  }

  /** Check if module is initialized */
  isReady(): boolean {
    return this._status === 'ready' && this.handler !== null && this.modelResolver !== null;
  }
}