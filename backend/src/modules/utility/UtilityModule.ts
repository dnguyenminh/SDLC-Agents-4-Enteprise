/**
 * Utility Module - agent_log (structured logging) + stream_write_file (real file write).
 * stream_write_file is path-safety guarded via resolveWithinWorkspace.
 * agent_log writes to pino logger with configurable level.
 */

import type { IModule, ModuleStatus } from '../../types/module.js';
import type { ToolHandler, ToolDefinition } from '../../types/tool.js';
import type { Logger } from 'pino';
import * as fs from 'fs';
import * as path from 'path';
import { loadConfig } from '../../engine/config.js';
import { resolveWithinWorkspace } from '../../shared/path-safety.js';
import { withErrorHandling } from '../../tool-router/ToolHandlerDecorators.js';
import {
  hasBaseDirArg,
  type MultiWorktreePathResolver,
} from '../../shared/multi-worktree-path-resolver.js';
import { getSharedPathResolver } from '../../shared/path-resolver-provider.js';
import { baseDirSchemaProperties } from '../../shared/base-dir-schema.js';
import type { ToolResult } from '../../types/tool.js';

/** Supported log levels for agent_log. */
type LogLevel = 'debug' | 'info' | 'warn' | 'error';
const VALID_LEVELS: LogLevel[] = ['debug', 'info', 'warn', 'error'];

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

    handlers.set('agent_log', withErrorHandling(this.logger, 'agent_log')(
      async (args) => {
      const message = String(args.message || '');
      if (!message) {
        return { content: [{ type: 'text', text: 'Missing required argument: message' }], isError: true };
      }
      const rawLevel = String(args.level || 'info').toLowerCase();
      const level: LogLevel = VALID_LEVELS.includes(rawLevel as LogLevel) ? (rawLevel as LogLevel) : 'info';
      const meta = args.meta && typeof args.meta === 'object' ? args.meta : {};
      this.logger[level]({ source: 'agent_log', ...meta }, message);
      return { content: [{ type: 'text', text: `[${level.toUpperCase()}] ${message}` }], isError: false };
    }));

    handlers.set('stream_write_file', withErrorHandling(this.logger, 'stream_write_file')(
      async (args) => {
      // SA4E-394 (DISC-3): both `path` (module variant) and `file_path`
      // (code-intel/extension variant) are accepted and routed through the
      // shared resolver on every surface.
      const rawPath = String(args.path ?? args.file_path ?? '');
      const content = String(args.content ?? '');
      if (!rawPath) {
        return { content: [{ type: 'text', text: 'Missing required argument: path' }], isError: true };
      }
      if (hasBaseDirArg(args)) {
        return this.writeWithBaseDir(args, rawPath, content);
      }
      const fullPath = resolveWithinWorkspace(this.workspace, rawPath);
      if (!fullPath) {
        return { content: [{ type: 'text', text: `Path rejected by safety guard: ${rawPath}` }], isError: true };
      }
      return this.writeToResolvedPath(fullPath, rawPath, content, args.append === true, false);
    }));

    return handlers;
  }

  /** SA4E-394 — resolver-driven branch (base_dir/workspace_root present). */
  private writeWithBaseDir(args: Record<string, unknown>, rawPath: string, content: string): ToolResult {
    const result = getSharedPathResolver(this.logger).resolve({
      filePath: rawPath, baseDir: args.base_dir, workspaceRoot: args.workspace_root,
    });
    if (!result.ok) {
      return { content: [{ type: 'text', text: result.message }], isError: true };
    }
    return this.writeToResolvedPath(result.resolvedPath, rawPath, content, args.append === true, true);
  }

  /** Shared write tail — mkdir -p, write/append, log, report the path. */
  private writeToResolvedPath(
    fullPath: string, displayPath: string, content: string, append: boolean, withResolvedPath: boolean,
  ): ToolResult {
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (append) {
      fs.appendFileSync(fullPath, content, 'utf-8');
    } else {
      fs.writeFileSync(fullPath, content, 'utf-8');
    }
    const bytes = Buffer.byteLength(content, 'utf-8');
    this.logger.info({ path: fullPath, bytes, append }, 'stream_write_file written');
    const suffix = `${append ? ' (appended)' : ''}${withResolvedPath ? ` [resolved: ${fullPath}]` : ''}`;
    return {
      content: [{ type: 'text', text: `Written ${bytes} bytes to ${displayPath}${suffix}` }],
      isError: false,
    };
  }

  getToolDefinitions(): ToolDefinition[] {
    return [
      {
        name: 'agent_log',
        description: 'Write a structured log message at the specified level (debug/info/warn/error). Use for agent activity tracing.',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'Log message text' },
            level: { type: 'string', enum: ['debug', 'info', 'warn', 'error'], description: 'Log level (default: info)' },
            meta: { type: 'object', description: 'Optional additional structured metadata' },
          },
          required: ['message'],
        },
        category: 'utility',
      },
      {
        name: 'stream_write_file',
        description: 'Write or append content to a file within the workspace. Relative paths resolve against the workspace root (or base_dir when provided); paths cannot escape the effective root.',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Relative file path within workspace (e.g. documents/TICKET/BRD.md). Alias of file_path — both are accepted.' },
            file_path: { type: 'string', description: 'Relative file path within workspace (alias of path — both are accepted).' },
            content: { type: 'string', description: 'Content to write' },
            append: { type: 'boolean', description: 'If true, append instead of overwrite (default: false)' },
            ...baseDirSchemaProperties('path'),
          },
          required: ['path', 'content'],
        },
        category: 'utility',
      },
    ];
  }
}
