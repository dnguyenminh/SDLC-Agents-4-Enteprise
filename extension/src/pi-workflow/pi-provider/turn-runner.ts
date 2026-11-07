/**
 * PiProvider turn runner — bounded prompt loop over one-shot guarded attempts
 * (see ./prompt-attempt.ts for the per-attempt guard + repetition monitors).
 *
 * CHAT-LOOP-CONT: a degenerating THINKING stream used to end the turn silently
 * at the model's OUTPUT token limit (finish_reason "length" was never
 * surfaced — the "thinking block stops halfway" bug). Now the degenerate
 * attempt is aborted and ONE continuation prompt — anchored on the last
 * coherent reasoning (monitor.uniqueTail) — re-prompts the SAME agent (same
 * transcript), so the turn CONTINUES instead of dying mid-sentence. Bounded by
 * `maxStreamLoopContinues` (default 1, setting
 * sdlcAgents.chat.streamLoopMaxContinues); when exhausted the turn ends with
 * the friendly stop note — visible, never silent.
 *
 * Answer-stream degeneration keeps the v1.53.7 guard stop-note behavior
 * (visible intentional stop) — only the previously-invisible thinking-loop
 * path gained the auto-continuation.
 */
import type { Agent } from '@earendil-works/pi-agent-core';
import { buildStopNote, type TurnBudget } from '../turn-budget-guard.js';
import {
  buildLoopContinuationPrompt,
  buildLoopNoticeText,
  normalizeStreamLoopMaxContinues,
} from '../stream-loop-continuation.js';
import { runPromptAttempt } from './prompt-attempt.js';
import { debugLog } from '../../debug-logger.js';
import type { PiRunInput, PiRunResult, PiStreamChunk } from '../pi-provider-types.js';

/** Options for the stream-loop auto-continuation (config read at the call site). */
export interface PromptLoopOptions {
  /** Max continuation attempts after a thinking-stream loop (default 1). */
  maxStreamLoopContinues?: number;
}

/**
 * Run a prompt with bounded thinking-loop auto-continuation. Every attempt is
 * a full guarded cycle (tool/failure/text guards + stream monitors); the
 * guard's steer/abort semantics are UNCHANGED — only a degenerate THINKING
 * stream escalates to abort + re-prompt instead of a silent stop.
 */
export async function promptOnCurrentModel(
  agent: Agent,
  prompt: string,
  budget?: TurnBudget,
  onToolEvent?: PiRunInput['onToolEvent'],
  options?: PromptLoopOptions
): Promise<PiRunResult> {
  const maxContinues = normalizeStreamLoopMaxContinues(options?.maxStreamLoopContinues);
  let currentPrompt = prompt;
  let continuesLeft = maxContinues;
  const chunks: PiStreamChunk[] = [];
  const toolCalls: PiRunResult['toolCalls'] = [];
  let mergedText = '';

  let last = await runPromptAttempt(agent, currentPrompt, budget, onToolEvent);
  pushAttempt(chunks, toolCalls, (t) => { mergedText += t; }, last.result);

  while (last.streamLoop && continuesLeft > 0) {
    continuesLeft--;
    // Surface WHAT happened between the aborted attempt and the continuation
    // (the merged chunks are replayed by the adapter — never silent).
    const notice = '\n\n' + buildLoopNoticeText('thinking', false) + '\n\n';
    chunks.push({ type: 'text', content: notice });
    mergedText += notice;
    currentPrompt = buildLoopContinuationPrompt('thinking', last.streamLoop.anchor);
    debugLog(`[PiProvider] thinking loop — auto-continuing (${continuesLeft} attempt(s) left)`);
    last = await runPromptAttempt(agent, currentPrompt, budget, onToolEvent);
    pushAttempt(chunks, toolCalls, (t) => { mergedText += t; }, last.result);
  }

  if (last.streamLoop) {
    // Continuation budget exhausted — end with the FRIENDLY stop note (the
    // same intentional-stop treatment the guard produces: K2-suppressed error,
    // partial results kept), never a silent cut.
    const note = buildStopNote('repeat', toolCalls.length);
    mergedText += note;
    chunks.push({ type: 'text', content: note });
    chunks.push({ type: 'done' });
    debugLog('[PiProvider] thinking loop — continuation limit reached, stopped with note');
    return {
      text: mergedText,
      toolCalls,
      chunks,
      messages: last.result.messages,
      errorMessage: undefined,
      stopReason: last.result.stopReason,
    };
  }
  ensureDone(chunks);
  return {
    text: mergedText,
    toolCalls,
    chunks,
    messages: last.result.messages,
    errorMessage: last.result.errorMessage,
    stopReason: last.result.stopReason,
  };
}

/** Merge one attempt into the run-level accumulation (single 'done' at the end). */
function pushAttempt(
  chunks: PiStreamChunk[],
  toolCalls: PiRunResult['toolCalls'],
  appendText: (t: string) => void,
  result: PiRunResult
): void {
  appendText(result.text);
  for (const tc of result.toolCalls) toolCalls.push(tc);
  for (const chunk of result.chunks) {
    if (chunk.type === 'done') continue; // exactly one 'done' at the very end
    chunks.push(chunk);
  }
}

function ensureDone(chunks: PiStreamChunk[]): void {
  if (!chunks.some(c => c.type === 'done')) chunks.push({ type: 'done' });
}

export { collectResult } from './collect-result.js';