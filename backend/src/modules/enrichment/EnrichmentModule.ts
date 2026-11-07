/**
 * SA4E-387: EnrichmentModule — Module registration for enrichment pipeline.
 * Wires up ModelResolver, ContextWindowDiscovery, BudgetGuard, ReductionPipeline,
 * and provides the enrichment API routes.
 * Implements IModule for consistent lifecycle management.
 *
 * Lifecycle split (fix for /health 503 in headless environments):
 *  - initialize() completes immediately → _status = 'ready' (lifecycle ready).
 *  - Runtime capability (ModelResolver/CodeEnrichmentHandler) is built lazily
 *    when BOTH the DatabaseAdapter and a TaskWorker-attached LLMService exist.
 *    E2E/CI boot with no LLM server, so LLMService may never appear this run —
 *    that must degrade enrichment, not the whole backend health.
 *  - When the LLMService attaches later (initLLMInBackground retries), the
 *    LLM_SERVICE_READY event completes the wiring without a restart.
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
import { bus, Events } from '../../shared/EventBus.js';

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

  /** Deps cache before wiring: adapter arrives from ModuleFactory, LLM from event. */
  private pendingAdapter: DatabaseAdapter | null = null;
  private pendingRegistry: ModuleRegistry | null = null;
  private pendingLlmService: LLMService | undefined;
  private offLlmServiceReady: (() => void) | null = null;

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
   * IModule lifecycle init — completes immediately.
   * Runtime deps (adapter/LLMService) arrive via initializeWithDependencies()
   * and the LLM_SERVICE_READY event; capability is built lazily.
   */
  async initialize(): Promise<void> {
    this._status = 'ready';
    this.offLlmServiceReady = bus.on<{ llmService?: LLMService }>(
      Events.LLM_SERVICE_READY,
      (payload) => { this.attachLlmService(payload?.llmService); },
    );
    this.logger.info('EnrichmentModule lifecycle ready (SA4E-387) — runtime deps may attach later');
  }

  /**
   * Inject runtime dependencies (called after core modules init).
   * `llmService` may be undefined when no LLM is configured/reachable yet —
   * capability builds later via the LLM_SERVICE_READY event.
   */
  async initializeWithDependencies(
    adapter: DatabaseAdapter,
    llmService: LLMService | undefined,
    registry: ModuleRegistry,
  ): Promise<void> {
    this.pendingAdapter = adapter;
    this.pendingRegistry = registry;

    const service = llmService ?? this.pendingLlmService;
    if (service) {
      this.buildCapability(adapter, service, registry);
    } else if (!this.isCapabilityReady()) {
      this.logger.info('EnrichmentModule runtime deps pending — LLMService not attached yet (SA4E-387)');
    }
  }

  /**
   * Build ModelResolver/Handler once both adapter and LLMService are known.
   */
  private attachLlmService(llmService?: LLMService): void {
    if (!llmService) { return; }
    if (this.isCapabilityReady()) { return; } // already wired
    if (!this.pendingAdapter || !this.pendingRegistry) {
      // Adapter not injected yet — stash and wire when initializeWithDependencies runs.
      this.pendingLlmService = llmService;
      return;
    }
    this.buildCapability(this.pendingAdapter, llmService, this.pendingRegistry);
  }

  /**
   * Construct the runtime capability (resolver + discovery + handler) and
   * register the handler with the ModuleRegistry for TaskWorker access.
   */
  private buildCapability(
    adapter: DatabaseAdapter,
    llmService: LLMService,
    registry: ModuleRegistry,
  ): void {
    const resolverConfig: ModelResolverConfig = this.config.modelResolver || {
      defaultProvider: 'ollama',
      defaultModel: 'qwen2.5:7b-instruct-q4_K_M',
      defaultBaseUrl: 'http://localhost:11434',
    };
    this.modelResolver = new ModelResolver(llmService, resolverConfig);

    // Placeholder discovery — the handler configures window/provider per-call.
    this.windowDiscovery = new ContextWindowDiscovery(
      'ollama',
      'qwen2.5:7b-instruct-q4_K_M',
      'http://localhost:11434',
      800, // reservedOutputTokens
    );

    this.handler = new CodeEnrichmentHandler(adapter, llmService, this.logger);

    if (registry.registerEnrichmentHandler) {
      registry.registerEnrichmentHandler(this.handler);
    }
    this.logger.info('EnrichmentModule capability initialized (SA4E-387)');
  }

  async shutdown(): Promise<void> {
    this.offLlmServiceReady?.();
    this.offLlmServiceReady = null;
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
    return this._status === 'ready' && this.isCapabilityReady();
  }

  /** True when runtime capability (resolver + handler) is built. */
  private isCapabilityReady(): boolean {
    return this.handler !== null && this.modelResolver !== null;
  }
}
