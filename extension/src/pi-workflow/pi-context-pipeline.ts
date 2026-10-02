/**
 * PiContextPipeline — SA4E-334 auto-compression.
 * Runs pi.dev `context` handlers (billion-context-pi 8-stage pipeline:
 * assign refs → sync blocks → prune → filter → hide calls → recommend →
 * nudge → emergency truncate) before every LLM turn.
 *
 * Pi semantics: pipeline, no short-circuit — every handler receives the
 * previous handler's output, the LAST handler wins. Keep exactly one
 * compression plugin installed (billion-context-pi cancels Pi built-in
 * auto-compaction itself).
 */
import { debugLog } from '../debug-logger';
import type { ChatExtToWebviewMessage } from '../chat-panel/message-protocol';

export interface SimpleMessage {
  role: string;
  content: string;
}

type ContextHandler = (...args: unknown[]) => Promise<unknown>;

const handlerCache = new Map<string, ContextHandler[]>();

function toAgentMessages(input: SimpleMessage[]): Array<Record<string, unknown>> {
  return input.map((m) => ({
    role: m.role,
    content: [{ type: 'text', text: m.content ?? '' }],
    timestamp: Date.now(),
  }));
}

function toSimpleMessages(input: Array<Record<string, unknown>>, fallback: SimpleMessage[]): SimpleMessage[] {
  try {
    return input.map((m, i) => {
      const role = typeof m.role === 'string' ? m.role : (fallback[i]?.role ?? 'user');
      const content = m.content;
      let text = fallback[i]?.content ?? '';
      if (typeof content === 'string') text = content;
      else if (Array.isArray(content)) {
        text = content
          .map((b) => {
            const block = b as Record<string, unknown>;
            if (typeof block.text === 'string') return block.text;
            if (typeof block.content === 'string') return block.content;
            return '';
          })
          .join('');
      }
      return { role, content: text };
    });
  } catch {
    return fallback;
  }
}

function stubPipelineCtx(workspaceRoot: string) {
  return {
    cwd: workspaceRoot,
    ui: {
      notify: (message: string) => debugLog(`[PiContextPipeline][notify] ${String(message).slice(0, 160)}`),
    },
  };
}

/** Collect `context` handlers captured at extension load (cached). */
export async function getContextHandlers(
  workspaceRoot: string,
  onEvent?: (msg: ChatExtToWebviewMessage) => void
): Promise<ContextHandler[]> {
  void onEvent;
  return handlerCache.get(workspaceRoot || '(default)') ?? [];
}

/** Register handlers captured at load time (called by pi-extension-runtime). */
export function setContextHandlers(workspaceRoot: string, handlers: ContextHandler[]): void {
  handlerCache.set(workspaceRoot || '(default)', handlers);
}

/**
 * Run the context pipeline over simple messages. Never throws —
 * on any failure returns the input unchanged.
 */
export async function runContextPipeline(
  workspaceRoot: string,
  messages: SimpleMessage[],
  onEvent?: (msg: ChatExtToWebviewMessage) => void
): Promise<SimpleMessage[]> {
  if (!messages.length) return messages;
  const handlers = await getContextHandlers(workspaceRoot, onEvent);
  if (!handlers.length) return messages;
  let current = toAgentMessages(messages);
  const ctx = stubPipelineCtx(workspaceRoot);
  for (const fn of handlers) {
    try {
      const res = (await fn({ type: 'context', messages: current }, ctx)) as
        | { messages?: Array<Record<string, unknown>> }
        | undefined
        | void;
      if (res && Array.isArray(res.messages) && res.messages.length > 0) {
        current = res.messages;
      }
    } catch (err) {
      debugLog(`[PiContextPipeline] handler failed (non-fatal): ${(err as Error).message.slice(0, 160)}`);
    }
  }
  return toSimpleMessages(current, messages);
}

/** Test hook. */
export function clearContextPipelineCache(): void {
  handlerCache.clear();
}
