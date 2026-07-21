/**
 * Module lifecycle registry.
 * Manages initialization, shutdown, and health status of all backend modules.
 */

import type { IModule, ModuleHealth, ModuleStatus } from '../types/module.js';
import type { ToolHandler, ToolDefinition } from '../types/tool.js';
import type { Logger } from 'pino';

export class ModuleRegistry {
  private modules: Map<string, IModule> = new Map();
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  register(module: IModule): void {
    this.modules.set(module.name, module);
    this.logger.info({ module: module.name }, 'Module registered');
  }

  async initializeAll(): Promise<void> {
    const initPromises = Array.from(this.modules.entries()).map(
      async ([name, module]) => {
        try {
          this.logger.info({ module: name }, 'Initializing module');
          await module.initialize();
          this.logger.info({ module: name, status: module.status }, 'Module initialized');
        } catch (err) {
          this.logger.error({ module: name, err }, 'Module initialization failed');
        }
      }
    );

    await Promise.allSettled(initPromises);
  }

  async shutdownAll(): Promise<void> {
    const shutdownPromises = Array.from(this.modules.entries()).map(
      async ([name, module]) => {
        try {
          await module.shutdown();
          this.logger.info({ module: name }, 'Module shutdown complete');
        } catch (err) {
          this.logger.error({ module: name, err }, 'Module shutdown failed');
        }
      }
    );

    await Promise.allSettled(shutdownPromises);
  }

  /**
   * SA4E-45: Hot-swap a module — shutdown then reinitialize.
   * Used when database engine is switched on-the-fly via admin UI.
   */
  async reinitializeModule(name: string): Promise<void> {
    const module = this.modules.get(name);
    if (!module) {
      this.logger.warn({ module: name }, 'Cannot reinitialize: module not found');
      return;
    }
    try {
      this.logger.info({ module: name }, 'Reinitializing module (hot-swap)');
      await module.shutdown();
      await module.initialize();
      this.logger.info({ module: name, status: module.status }, 'Module reinitialized');
    } catch (err) {
      this.logger.error({ module: name, err }, 'Module reinitialization failed');
    }
  }

  /**
   * SA4E-45: Reinitialize all engine modules after DB switch.
   * Shuts down memory + codeIntel, then reinitializes with new adapter.
   */
  async reinitializeEngineModules(): Promise<void> {
    const engineModules = ['memory', 'codeIntel'];
    for (const name of engineModules) {
      await this.reinitializeModule(name);
    }
  }

  getToolHandlers(): Map<string, ToolHandler> {
    const handlers = new Map<string, ToolHandler>();
    for (const module of this.modules.values()) {
      if (module.status === 'ready') {
        for (const [name, handler] of module.getToolHandlers()) {
          handlers.set(name, handler);
        }
      }
    }
    return handlers;
  }

  getModule(name: string): IModule | undefined {
    return this.modules.get(name);
  }

  getAllToolDefinitions(): ToolDefinition[] {
    const definitions: ToolDefinition[] = [];
    for (const module of this.modules.values()) {
      if (module.status === 'ready') {
        definitions.push(...module.getToolDefinitions());
      }
    }
    return definitions;
  }

  getHealth(): Record<string, ModuleStatus> {
    const health: Record<string, ModuleStatus> = {};
    for (const [name, module] of this.modules) {
      health[name] = module.status;
    }
    return health;
  }

  getModuleHealth(): ModuleHealth[] {
    return Array.from(this.modules.entries()).map(([name, module]) => ({
      name,
      status: module.status,
    }));
  }

  getReadyCount(): number {
    return Array.from(this.modules.values()).filter(m => m.status === 'ready').length;
  }

  getTotalCount(): number {
    return this.modules.size;
  }

  isAllReady(): boolean {
    return Array.from(this.modules.values()).every(m => m.status === 'ready');
  }
}
