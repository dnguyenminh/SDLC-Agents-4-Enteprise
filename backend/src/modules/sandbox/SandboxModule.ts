/**
 * SA4E-6 — SandboxModule: IModule implementation bridging the Sandbox Execution
 * engine into the Backend MCP Server (TDD §5.5, §5.7). Registers 5 tools.
 *
 * Security reuse (SD-2): BR-12 hardening is obtained from SecurityModule when it
 * exposes `getHardeningProfile('sandbox')`; otherwise built-in safe defaults are
 * used (graceful degradation, logged as WARN).
 */

import type { IModule, ModuleStatus } from '../../types/module.js';
import type { Logger } from 'pino';
import type { ToolHandler, ToolDefinition } from '../../types/tool.js';
import type { ModuleRegistry } from '../ModuleRegistry.js';
import { loadConfig } from '../../engine/config.js';
import type { SandboxConfig } from '../../config/SandboxConfig.js';
import { ExecutionManager } from './ExecutionManager.js';
import { BUILTIN_HARDENING, type SandboxHardening } from './executors/hardening.js';
import { SANDBOX_TOOL_DEFINITIONS } from './tools/tool-definitions.js';
import { createSandboxHandlers } from './tools/tool-handlers.js';
import { getSharedPathResolver } from '../../shared/path-resolver-provider.js';
import type { MultiWorktreePathResolver } from '../../shared/multi-worktree-path-resolver.js';

export class SandboxModule implements IModule {
  readonly name = 'sandbox';
  private _status: ModuleStatus = 'initializing';
  private manager!: ExecutionManager;
  private config!: SandboxConfig;
  private logger: Logger;

  constructor(
    logger: Logger,
    private readonly registry?: ModuleRegistry,
  ) {
    this.logger = logger.child({ module: this.name });
  }

  get status(): ModuleStatus {
    return this._status;
  }

  private resolveHardening(): SandboxHardening {
    const security = this.registry?.getModule('security') as
      | { getHardeningProfile?: (profile: string) => SandboxHardening | undefined }
      | undefined;
    if (security && typeof security.getHardeningProfile === 'function') {
      try {
        const got = security.getHardeningProfile('sandbox');
        if (got) {
          this.logger.info('Using SecurityModule hardening profile for BR-12');
          return got;
        }
      } catch (err) {
        this.logger.warn({ err: (err as Error).message }, 'SecurityModule hardening lookup failed');
      }
    }
    this.logger.warn('SecurityModule hardening helper unavailable — using built-in dockerode BR-12 hardening (graceful degradation).');
    return BUILTIN_HARDENING;
  }

  async initialize(): Promise<void> {
    this.logger.info('Initializing sandbox module');
    const appConfig = loadConfig();
    this.config = appConfig.sandbox;
    const hardening = this.resolveHardening();
    this.manager = new ExecutionManager(this.logger, this.config, hardening, this.config.dockerSocket);

    await this.manager.initialize();
    const recovered = await this.manager.recoverOrphans().catch((e) => {
      this.logger.warn({ err: (e as Error).message }, 'Orphan recovery failed during init');
      return 0;
    });
    if (recovered > 0) this.logger.info({ recovered }, 'Recovered orphan containers');

    this._status = 'ready';
    this.logger.info({ dockerAvailable: this.manager.dockerReady }, 'Sandbox module ready');
  }

  async shutdown(): Promise<void> {
    if (this.manager) await this.manager.shutdown();
    this._status = 'stopped';
    this.logger.info('Sandbox module stopped');
  }

  getToolHandlers(): Map<string, ToolHandler> {
    // SA4E-394 — BR-13: shared resolver (index.ts installs it at boot).
    const pathResolver: MultiWorktreePathResolver = getSharedPathResolver(this.logger);
    return createSandboxHandlers(this.manager, this.config, this.logger, pathResolver);
  }

  getToolDefinitions(): ToolDefinition[] {
    return SANDBOX_TOOL_DEFINITIONS;
  }
}
