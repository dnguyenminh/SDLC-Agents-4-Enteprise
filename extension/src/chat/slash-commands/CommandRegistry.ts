/**
 * SA4E-191 — CommandRegistry.
 * Central registration + dispatch. Enforces cross-cutting policies:
 *  - BR-1  register exactly once (throws on duplicate id)
 *  - BR-2  shortcut-hint uniqueness (throws on duplicate hint)
 *  - BR-5  owner-only enforcement (defense in depth)
 *  - NFR-07-T token-bucket rate limit (20 req/min per session per command)
 *  - NFR-06-T per-command timeout + circuit breaker
 *  - NFR-08-T audit logging before returning
 */

import type {
  SlashCommandDescriptor,
  CommandContext,
  CommandHandler,
  CommandResult,
} from './types';
import { createAuditSink, type AuditSink } from './audit';
import type { AuditEvent } from './audit';
import { RateLimiter, CircuitBreaker, withTimeout } from './rate-limiter';

// ── Policies extracted to rate-limiter.ts (BR-18) — re-exported so public
// symbols stay at this path.
export {
  TokenBucket,
  RateLimiter,
  CircuitBreakerOpenError,
  CircuitBreaker,
} from './rate-limiter';

export interface CommandRegistryOptions {
  rateLimiter?: RateLimiter;
  auditSink?: AuditSink;
}

export class CommandRegistry {
  private readonly handlers = new Map<string, CommandHandler>();
  private readonly descriptors = new Map<string, SlashCommandDescriptor>();
  private readonly shortcutHints = new Set<string>();
  private readonly breakers = new Map<string, CircuitBreaker>();
  private readonly rateLimiter: RateLimiter;
  private readonly auditSink: AuditSink;

  constructor(opts: CommandRegistryOptions = {}) {
    this.rateLimiter = opts.rateLimiter ?? new RateLimiter();
    this.auditSink = opts.auditSink ?? createAuditSink();
  }

  /** BR-1 (register once) + BR-2 (shortcut uniqueness). */
  register(descriptor: SlashCommandDescriptor, handler: CommandHandler): void {
    if (this.descriptors.has(descriptor.id)) {
      throw new Error(`Command already registered: ${descriptor.id}`);
    }
    if (this.shortcutHints.has(descriptor.shortcutHint)) {
      throw new Error(`Shortcut hint already used: ${descriptor.shortcutHint}`);
    }
    this.descriptors.set(descriptor.id, descriptor);
    this.handlers.set(descriptor.id, handler);
    this.shortcutHints.add(descriptor.shortcutHint);
    this.breakers.set(descriptor.id, new CircuitBreaker(3, 30000));
  }

  resolve(
    commandId: string
  ): { descriptor: SlashCommandDescriptor; handler: CommandHandler } | null {
    const descriptor = this.descriptors.get(commandId);
    const handler = this.handlers.get(commandId);
    return descriptor && handler ? { descriptor, handler } : null;
  }

  getAuditSink(): AuditSink {
    return this.auditSink;
  }

  async dispatch(ctx: CommandContext): Promise<CommandResult> {
    const entry = this.resolve(ctx.commandId);
    if (!entry) {
      return this.fail(ctx, 'UNKNOWN_COMMAND', 'Unknown command.', false);
    }

    // BR-5 — owner-only enforcement (defense in depth; UI also disables).
    if (entry.descriptor.requiresOwner && ctx.session.userId !== ctx.session.ownerId) {
      return this.fail(ctx, 'PERMISSION_DENIED', 'Permission denied.', false);
    }

    // NFR-07-T — token-bucket rate limit.
    if (!this.rateLimiter.allow(ctx.session.id, ctx.commandId)) {
      return this.fail(ctx, 'RATE_LIMITED', 'Too many requests, please wait.', true);
    }

    const start = Date.now();
    try {
      const result = await withTimeout(
        this.breakers.get(ctx.commandId)!.exec(() => Promise.resolve(entry.handler.execute(ctx))),
        entry.descriptor.timeoutMs
      );
      this.audit(ctx, 'ok', Date.now() - start);
      return result;
    } catch (err) {
      this.audit(ctx, 'error', Date.now() - start);
      return this.fail(ctx, 'HANDLER_ERROR', (err as Error).message, false);
    }
  }

  private fail(ctx: CommandContext, code: string, msg: string, retryable: boolean): CommandResult {
    return {
      status: 'error',
      commandId: ctx.commandId,
      error: { code, userMessage: msg, retryable },
    };
  }

  private audit(ctx: CommandContext, status: 'ok' | 'error', durationMs: number): void {
    const event: AuditEvent = {
      event: 'slash.command',
      userId: ctx.session.userId,
      command: ctx.commandId,
      ts: new Date().toISOString(),
      target: ctx.session.id,
      status,
      durationMs,
    };
    this.auditSink.emit(event);
  }
}
