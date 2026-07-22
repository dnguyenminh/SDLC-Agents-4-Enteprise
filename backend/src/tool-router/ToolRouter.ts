/**
 * Tool routing layer.
 * Routes tool_name to the appropriate module handler.
 * Wraps execution with a timeout boundary (default 60s) and structured error handling.
 */

import type { ToolHandler, ToolDefinition, ToolResult, ToolCallRequest } from '../types/tool.js';
import type { ModuleRegistry } from '../modules/ModuleRegistry.js';
import type { Logger } from 'pino';

/** Default per-tool execution timeout in milliseconds. */
const DEFAULT_TOOL_TIMEOUT_MS = 60_000;

/** Race a promise against a timeout, rejecting with a descriptive error on timeout. */
function withTimeout<T>(promise: Promise<T>, ms: number, toolName: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Tool '${toolName}' timed out after ${ms}ms`)),
      ms,
    );
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

export class ToolRouter {
  private registry: ModuleRegistry;
  private logger: Logger;
  private readonly toolTimeoutMs: number;

  constructor(registry: ModuleRegistry, logger: Logger, toolTimeoutMs = DEFAULT_TOOL_TIMEOUT_MS) {
    this.registry = registry;
    this.logger = logger;
    this.toolTimeoutMs = toolTimeoutMs;
  }

  async route(request: ToolCallRequest): Promise<ToolResult> {
    const { tool_name, arguments: args } = request;
    const handlers = this.registry.getToolHandlers();
    const handler = handlers.get(tool_name);

    if (!handler) {
      this.logger.warn({ tool_name }, 'Tool not found');
      return {
        content: [{ type: 'text', text: `Tool '${tool_name}' not found` }],
        isError: true,
      };
    }

    const requestId = crypto.randomUUID();
    const start = Date.now();

    this.logger.debug({ tool_name, requestId }, 'Tool call start');

    try {
      const result = await withTimeout(handler(args), this.toolTimeoutMs, tool_name);
      const duration = Date.now() - start;
      this.logger.debug({ tool_name, requestId, duration_ms: duration }, 'Tool call complete');
      return result;
    } catch (err) {
      const duration = Date.now() - start;
      const message = err instanceof Error ? err.message : String(err);
      const isTimeout = message.includes('timed out');
      this.logger.error({ tool_name, requestId, duration_ms: duration, timeout: isTimeout, err }, 'Tool call error');
      return {
        content: [{ type: 'text', text: `Tool execution failed: ${message}` }],
        isError: true,
      };
    }
  }

  listTools(): ToolDefinition[] {
    return this.registry.getAllToolDefinitions();
  }

  hasTools(): boolean {
    return this.registry.getAllToolDefinitions().length > 0;
  }

  getToolCount(): number {
    return this.registry.getAllToolDefinitions().length;
  }
}
