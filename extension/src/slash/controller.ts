/**
 * Slash command controller (Tier-2 registry).
 *
 * Per TDD §3.2: commands register under a stable id with an async handler.
 * The design-gate command (index.ts) registers as "design-gate-run".
 *
 * OCP: SlashMenu exposes register/list/has/execute — new commands register
 * themselves without modifying this controller.
 */

import type { CommandContext } from "./context";

/** Async handler signature for a registered slash command. */
export type SlashCommandHandler = (ctx: CommandContext) => Promise<void> | void;

/** Registration options for a slash command. */
export interface SlashCommandOptions {
  /** Short human-readable description shown in the slash menu. */
  description?: string;
  /** Whether the command is hidden from user-facing menus (default false). */
  hidden?: boolean;
}

/** Internal registration entry. */
interface SlashCommandEntry {
  id: string;
  handler: SlashCommandHandler;
  options: SlashCommandOptions;
}

/**
 * SlashMenu — registry of slash commands.
 * Singleton instance exported as `slashMenu` (consumed by index.ts).
 */
export class SlashMenu {
  private readonly commands = new Map<string, SlashCommandEntry>();

  /**
   * Register a command under a stable id.
   * Re-registering an existing id replaces its handler (idempotent).
   */
  register(id: string, handler: SlashCommandHandler, options: SlashCommandOptions = {}): void {
    if (!id) {
      throw new Error("Slash command id is required");
    }
    this.commands.set(id, { id, handler, options });
  }

  /** Whether a command with the given id is registered. */
  has(id: string): boolean {
    return this.commands.has(id);
  }

  /** Execute a registered command with the supplied context. */
  async execute(id: string, ctx: CommandContext): Promise<void> {
    const entry = this.commands.get(id);
    if (!entry) {
      throw new Error(`Slash command "${id}" is not registered`);
    }
    ctx.runtime.metrics.toolCalls++;
    await entry.handler(ctx);
  }

  /** List registered command summaries (id + description). */
  list(): Array<{ id: string; description?: string; hidden: boolean }> {
    return [...this.commands.values()].map((e) => ({
      id: e.id,
      description: e.options.description,
      hidden: e.options.hidden ?? false,
    }));
  }
}

/** Singleton slash menu shared by all Tier-2 command modules. */
export const slashMenu = new SlashMenu();
