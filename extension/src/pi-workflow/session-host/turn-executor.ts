/**
 * SA4E-355 UAT fix #2: session prompt-turn executor for the PiAgentSessionHost.
 * Owns the approximate conversation-history growth (prompts + assistant text),
 * the history-aware auto-chunking decision, and the subscribe/prompt/pump
 * loop over the real AgentSession.
 */
import {
  DEFAULT_AUTO_CHUNK_CONFIG,
  chunkPrompt,
  shouldAutoChunk,
  synthesizeChunks,
} from '../../pi-agent/context-budget-auto-split.js';
import { estimateTokenCount } from '../../pi-agent/prompt-compressor.js';
import { usableTokensOf } from '../../pi-agent/models/ContextBudget.js';
import { mapAgentEvent, ToolEventTracker, type EventCollector, type ToolLiveEvent } from '../pi-event-mapper.js';
import type { NormalizedToolCall } from '../types/executor.types.js';
import type { SessionHost, SessionTurnResult, SessionTier } from './types.js';
import type { ContextBudget } from '../../pi-agent/models/ContextBudget';

/** Per-turn streaming callbacks (token / live tool event / reasoning deltas). */
interface SessionTurnHooks {
  onToken?: (t: string) => void;
  onToolEvent?: (e: ToolLiveEvent) => void;
  onThinking?: (t: string) => void;
}

/**
 * Builds the SessionHost.promptTurn closure over the live session. Keeps the
 * approximate history-token counter (approx prompts + replies; tool results
 * are NOT counted — a conservative under-estimate: the real transcript can
 * only be larger) so shouldAutoChunk can trigger for medium/large tiers as
 * the session approaches the usable budget.
 */
export function createSessionPromptTurn(
  session: unknown,
  tier: SessionTier,
  budget: ContextBudget,
  getFile: () => string | undefined
): SessionHost['promptTurn'] {
  let approxHistoryTokens = 0;
  const recordHistoryGrowth = (turnText: string, replyText: string): void => {
    approxHistoryTokens += estimateTokenCount(turnText) + estimateTokenCount(replyText);
  };
  const chunkThreshold = (): { usableTokens: number; historyTokens: number } => ({
    usableTokens: usableTokensOf(budget),
    historyTokens: approxHistoryTokens,
  });
  return async function promptTurn(
    text: string,
    onToken?: (t: string) => void,
    onToolEvent?: (e: ToolLiveEvent) => void,
    onThinking?: (t: string) => void
  ): Promise<SessionTurnResult> {
    const hooks: SessionTurnHooks = { onToken, onToolEvent, onThinking };
    const runOnce = async (promptText: string): Promise<string> => {
      const localCollector: EventCollector = { chunks: [], toolCalls: [], text: '', thinking: '' };
      const localTracker = new ToolEventTracker();
      await promptSession(session, promptText, localCollector, localTracker, hooks);
      return localCollector.text;
    };

    const promptTokens = estimateTokenCount(text);
    // SA4E-355 UAT fix #2: history-aware decision — medium/large tiers chunk
    // once prompt + accumulated history pass 70% of the usable budget.
    const shouldChunk = shouldAutoChunk(tier, promptTokens, DEFAULT_AUTO_CHUNK_CONFIG, chunkThreshold());
    approxHistoryTokens += promptTokens; // this prompt joins the session history
    if (shouldChunk) {
      return runChunkedTurn(session, hooks, text, runOnce, recordHistoryGrowth, getFile);
    }
    return runSingleTurn(session, hooks, text, recordHistoryGrowth, getFile);
  };
}

/**
 * SA4E-334 UAT fix #2 chunked path: prompt per chunk, synthesize, then a
 * final pass — one history growth record for the combined + final pair.
 */
async function runChunkedTurn(
  session: unknown,
  hooks: SessionTurnHooks,
  text: string,
  runOnce: (promptText: string) => Promise<string>,
  recordHistoryGrowth: (turnText: string, replyText: string) => void,
  getFile: () => string | undefined
): Promise<SessionTurnResult> {
  const chunks = chunkPrompt(text, DEFAULT_AUTO_CHUNK_CONFIG.maxTokensPerChunk);
  const parts: string[] = [];
  for (const ch of chunks) {
    const part = await runOnce(ch);
    parts.push(part);
  }
  const combined = synthesizeChunks(parts);
  const final = await runOnce(`Synthesize the following parts into a coherent final answer:\n${combined}`);
  recordHistoryGrowth(combined, final);
  return {
    text: final,
    toolCalls: [],
    sessionFile: getFile(),
  };
}

/** Single-prompt path: one subscribe/prompt cycle, tool calls mapped into the result. */
async function runSingleTurn(
  session: unknown,
  hooks: SessionTurnHooks,
  text: string,
  recordHistoryGrowth: (turnText: string, replyText: string) => void,
  getFile: () => string | undefined
): Promise<SessionTurnResult> {
  const collector: EventCollector = { chunks: [], toolCalls: [], text: '', thinking: '' };
  const tracker = new ToolEventTracker();
  await promptSession(session, text, collector, tracker, hooks);
  const replyText = collector.text;
  recordHistoryGrowth(text, replyText); // SA4E-355 UAT fix #2: track history growth
  return {
    text: replyText,
    toolCalls: (collector.toolCalls as NormalizedToolCall[]).map((t) => ({
      id: String(t.id),
      name: String(t.name),
      arguments: (t.arguments ?? {}) as Record<string, unknown>,
    })),
    sessionFile: getFile(),
  };
}

/**
 * Subscribe → prompt → unsubscribe pump shared by every prompt path.
 * Live tool events, token chunks, and reasoning deltas are forwarded while
 * the events are mapped into the collector. Errors in the callbacks or the
 * event mapping never break the turn.
 */
async function promptSession(
  session: unknown,
  promptText: string,
  collector: EventCollector,
  tracker: ToolEventTracker,
  hooks: SessionTurnHooks
): Promise<void> {
  const unsub = (session as { subscribe: (l: (e: unknown) => void) => () => void }).subscribe(
    (event) => {
      try {
        const live = tracker.observe(event as never);
        if (live && hooks.onToolEvent) {
          try { hooks.onToolEvent(live); } catch {}
        }
        mapAgentEvent(event as never, collector);
      } catch {}
      const last = collector.chunks[collector.chunks.length - 1];
      if (last?.type === 'text' && last.content) hooks.onToken?.(last.content);
      // SA4E-THINKING: live reasoning deltas → ThinkingBlock in the webview.
      if (last?.type === 'thinking' && last.content) hooks.onThinking?.(last.content);
    }
  );
  try {
    await (session as { prompt: (t: string) => Promise<void> }).prompt(promptText);
  } finally {
    try { unsub(); } catch {}
  }
}
