/**
 * Hook Emitter — extracted from HookEngine
 * Emits hook execution results as visible UI blocks via StreamHandler.
 */

import { StreamHandler } from "./stream-handler";
import type { HookDefinition } from "./hook-loader";
import type { HookResult } from "./hook-executor";

const STATUS_MAP: Record<string, string> = {
  completed: "completed",
  failed: "failed",
  timed_out: "failed",
  denied: "completed",
};

export function emitHookFired(
  streamHandler: StreamHandler,
  streamId: string,
  hook: HookDefinition,
  event: string,
  toolName: string | undefined,
  result: HookResult,
  duration: number
): void {
  streamHandler.emitDirect({
    type: "chat:toolCall",
    toolCall: {
      id: `hook-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: "hook_fired",
      args: { hookName: hook.name, event, toolName: toolName || "", action: hook.then.type },
      status: STATUS_MAP[result.status] || "failed",
      result: result.output ? result.output.slice(0, 200) : result.error || result.status,
      duration,
    },
  } as any);
}
