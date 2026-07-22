/**
 * ToolHandlerDecorators — composable higher-order functions for tool handlers.
 * Decorator pattern: wrap base handlers with cross-cutting concerns.
 *
 * Usage:
 *   const handler = compose(
 *     withErrorHandling(logger),
 *     withScopeContext(dispatcher),
 *     withResultFormat,
 *   )(coreHandler);
 */

import type { Logger } from 'pino';
import type { ToolHandler, ToolResult } from '../types/tool.js';

type CoreHandler<T = unknown> = (args: Record<string, unknown>) => T | Promise<T>;

function isToolResult(v: unknown): v is ToolResult {
  return typeof v === 'object' && v !== null && 'content' in v && 'isError' in v;
}

function toResult(text: string): ToolResult {
  return { content: [{ type: 'text' as const, text }], isError: false };
}

function errorResult(text: string): ToolResult {
  return { content: [{ type: 'text' as const, text }], isError: true };
}

export function withErrorHandling(logger: Logger, toolName: string): (next: CoreHandler<ToolResult>) => ToolHandler {
  return (next) => async (args) => {
    try {
      return await next(args);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ tool: toolName, err }, 'Tool execution failed');
      return errorResult(`Error: ${message}`);
    }
  };
}

export function withScopeContext(dispatcher: { setScopeContext: (ctx: { userId: string; projectId?: string } | undefined) => void }): (next: ToolHandler) => ToolHandler {
  return (next) => async (args) => {
    const injectedCtx = (args as any)._projectContext;
    if (injectedCtx) {
      dispatcher.setScopeContext({ userId: injectedCtx.userId || '', projectId: injectedCtx.projectId || '' });
    } else {
      const userId = (args as any).__userId as string | undefined;
      dispatcher.setScopeContext(userId ? { userId } : undefined);
    }
    return next(args);
  };
}

export function withProjectId(next: (args: Record<string, unknown>, projectId?: string) => Promise<string>): ToolHandler {
  return async (args) => {
    const projectId = (args as any).__projectId as string | undefined;
    const result = await next(args, projectId);
    return toResult(result);
  };
}

export function withResultFormat(next: CoreHandler<string | null>): ToolHandler {
  return async (args) => {
    const text = await next(args);
    if (text === null) return errorResult('Unknown tool');
    return toResult(text);
  };
}

export function withTextResult(next: CoreHandler<string>): ToolHandler {
  return async (args) => {
    const text = await next(args);
    return toResult(text);
  };
}

export function compose<T>(...fns: Array<(next: any) => any>): (base: T) => T {
  return (base: T) => fns.reduceRight((acc, fn) => fn(acc), base);
}
