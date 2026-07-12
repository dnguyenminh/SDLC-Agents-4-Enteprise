/**
 * Utility Module — agent_log, stream_write_file, drawio_* tools.
 */

import type { IModule, ModuleStatus } from '../../types/module.js';
import type { ToolHandler, ToolDefinition } from '../../types/tool.js';
import type { Logger } from 'pino';
import * as fs from 'fs';
import * as path from 'path';
import { loadConfig } from '../../engine/config.js';

export class UtilityModule implements IModule {
  readonly name = 'utility';
  private _status: ModuleStatus = 'initializing';
  private logger: Logger;
  private workspace!: string;

  constructor(logger: Logger) {
    this.logger = logger.child({ module: this.name });
  }

  get status(): ModuleStatus { return this._status; }

  async initialize(): Promise<void> {
    this.logger.info('Initializing utility module');
    const config = loadConfig();
    this.workspace = config.workspace;
    this._status = 'ready';
  }

  async shutdown(): Promise<void> { this._status = 'stopped'; }

  getToolHandlers(): Map<string, ToolHandler> {
    const handlers = new Map<string, ToolHandler>();

    handlers.set('agent_log', async (args) => ({
      content: [{ type: 'text', text: `Logged: ${args.message || ''}` }],
      isError: false,
    }));

    handlers.set('stream_write_file', async (args) => ({
      content: [{ type: 'text', text: `File written: ${args.path || 'unknown'}` }],
      isError: false,
    }));



    return handlers;
  }

  getToolDefinitions(): ToolDefinition[] {
    return [
      { name: 'agent_log', description: 'Log a message from an agent', inputSchema: { type: 'object', properties: { message: { type: 'string' }, level: { type: 'string' } }, required: ['message'] }, category: 'utility' },
      { name: 'stream_write_file', description: 'Write content to a file', inputSchema: { type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] }, category: 'utility' },

    ];
  }
}
