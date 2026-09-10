/**
 * SA4E-167 — SecurityModule: IModule implementation for GateGuard + AgentShield.
 * Facade pattern: encapsulates GateGuard and AgentShield subsystems.
 * DIP: DatabaseAdapter injected via getDbAdapter() singleton.
 */

import type { IModule, ModuleStatus } from '../../types/module.js';
import type { ToolHandler, ToolDefinition } from '../../types/tool.js';
import type { Logger } from 'pino';
import type { ModuleRegistry } from '../ModuleRegistry.js';
import { GateGuardRepository } from './gateguard/GateGuardRepository.js';
import { GateGuardService } from './gateguard/GateGuardService.js';
import { GateGuardToolHandler } from './gateguard/GateGuardToolHandler.js';
import { GATEGUARD_TOOL_DEFINITIONS } from './gateguard/definitions.js';
import { AgentShieldScanner } from './agentshield/AgentShieldScanner.js';
import { AgentShieldToolHandler } from './agentshield/AgentShieldToolHandler.js';
import { AGENTSHIELD_TOOL_DEFINITIONS } from './agentshield/definitions.js';
import { SecretDetector } from './agentshield/rules/SecretDetector.js';
import { HttpEndpointRule } from './agentshield/rules/HttpEndpointRule.js';
import { InjectionDetector } from './agentshield/rules/InjectionDetector.js';
import { PermissionRule } from './agentshield/rules/PermissionRule.js';
import { TlsValidator } from './agentshield/rules/TlsValidator.js';
import { loadConfig } from '../../engine/config.js';
import type { DatabaseAdapter } from '../../database/adapters/DatabaseAdapter.js';

export class SecurityModule implements IModule {
  readonly name = 'security';
  private _status: ModuleStatus = 'initializing';
  private readonly logger: Logger;
  private readonly registry: ModuleRegistry;
  private gateGuardHandler: GateGuardToolHandler | null = null;
  private agentShieldHandler: AgentShieldToolHandler | null = null;

  constructor(logger: Logger, registry: ModuleRegistry) {
    this.logger = logger.child({ module: this.name });
    this.registry = registry;
  }

  get status(): ModuleStatus { return this._status; }

  /** Initialize GateGuard + AgentShield subsystems */
  async initialize(): Promise<void> {
    this.logger.info('Initializing security module (GateGuard + AgentShield)');
    try {
      await this.initializeGateGuard();
      this.initializeAgentShield();
      this._status = 'ready';
      this.logger.info('Security module ready');
    } catch (err) {
      // Non-fatal: security module is optional. Core functionality works without it.
      this.logger.warn({ err: (err as Error).message }, 'Security module init failed (non-fatal) — GateGuard disabled');
      this._status = 'ready';
    }
  }

  /** Graceful shutdown — release references */
  async shutdown(): Promise<void> {
    this.gateGuardHandler = null;
    this.agentShieldHandler = null;
    this._status = 'stopped';
    this.logger.info('Security module stopped');
  }

  /** Merge GateGuard + AgentShield tool handlers */
  getToolHandlers(): Map<string, ToolHandler> {
    const handlers = new Map<string, ToolHandler>();
    if (this.gateGuardHandler) {
      for (const [name, handler] of this.gateGuardHandler.getHandlers()) {
        handlers.set(name, handler);
      }
    }
    if (this.agentShieldHandler) {
      for (const [name, handler] of this.agentShieldHandler.getHandlers()) {
        handlers.set(name, handler);
      }
    }
    return handlers;
  }

  /** Return GateGuard + AgentShield MCP tool definitions */
  getToolDefinitions(): ToolDefinition[] {
    return [...GATEGUARD_TOOL_DEFINITIONS, ...AGENTSHIELD_TOOL_DEFINITIONS];
  }

  /** Initialize GateGuard subsystem: schema, repository, service, handler */
  private async initializeGateGuard(): Promise<void> {
    const adapter = await this.resolveAdapter();
    const repository = new GateGuardRepository(adapter);
    await repository.ensureSchema();
    const service = new GateGuardService(repository, this.logger);
    await service.loadPatterns();
    this.gateGuardHandler = new GateGuardToolHandler(service, this.logger);
  }

  /** Initialize AgentShield: scanner with all 5 rules registered */
  private initializeAgentShield(): void {
    const config = loadConfig();
    const scanner = new AgentShieldScanner(config.workspace, this.logger);
    scanner.registerRule(new SecretDetector());
    scanner.registerRule(new HttpEndpointRule());
    scanner.registerRule(new InjectionDetector());
    scanner.registerRule(new PermissionRule());
    scanner.registerRule(new TlsValidator());
    this.agentShieldHandler = new AgentShieldToolHandler(scanner, this.logger);
  }

  /** Resolve DatabaseAdapter via admin singleton */
  private async resolveAdapter(): Promise<DatabaseAdapter> {
    const { getDbAdapter } = await import('../../admin/db/core.js');
    return getDbAdapter();
  }
}
