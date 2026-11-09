/**
 * CommandContext — contract for slash command execution (Tier-2).
 *
 * Per TDD §3.2: slash commands receive a context providing runtime metrics,
 * logging, and an optional output channel. The design-gate command
 * (index.ts) consumes runtime.metrics, log(), and outputChannel.
 *
 * Kept minimal and structural — the extension host supplies the concrete
 * implementation when registering the command (controller.ts).
 */

import type { OutputChannelLike } from "./output-channel";

/** Runtime counters shared across command executions. */
export interface RuntimeMetrics {
  /** Number of tool/command invocations in this session. */
  toolCalls: number;
}

/** Runtime facilities made available to slash commands. */
export interface CommandRuntime {
  metrics: RuntimeMetrics;
}

/**
 * Execution context handed to every slash command handler.
 */
export interface CommandContext {
  /** Runtime facilities (metrics counters, etc.). */
  runtime: CommandRuntime;
  /** Structured log sink for command activity. */
  log: (message: string) => void;
  /** Optional visible output channel (appended to the UI console). */
  outputChannel?: OutputChannelLike;
  /** Raw arguments passed to the command (slash args, unparsed). */
  args?: string[];
}

/**
 * Factory for a minimal in-memory CommandContext — used when the host
 * does not supply one (e.g. programmatic invocation from extension.ts).
 */
export function createCommandContext(overrides: Partial<CommandContext> = {}): CommandContext {
  return {
    runtime: { metrics: { toolCalls: 0 } },
    log: (message: string) => {
      console.log(`[design-gate] ${message}`);
    },
    ...overrides,
  };
}
