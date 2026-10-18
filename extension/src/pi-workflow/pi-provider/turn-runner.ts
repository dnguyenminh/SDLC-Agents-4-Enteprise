/**
 * PiProvider turn runner — one guarded prompt cycle over the pi-agent-core
 * Agent: repetition guards (tool calls, failures, perseverating text),
 * wall-clock timeout, steer/abort effectors, and result collection with the
 * K2 intentional-stop suppression.
 */
import { Agent } from '@earendil-works/pi-agent-core';
import type { AgentEvent } from '@earendil-works/pi-agent-core';
import { mapAgentEvent, extractToolResultText, ToolEventTracker, type EventCollector } from '../pi-event-mapper.js';
import { TurnBudgetGuard, buildStopNote, buildSteerCorrection, buildFailureSteerCorrection, buildTextSteerCorrection, buildRereadSteerCorrection, splitCompletedBlocks } from '../turn-budget-guard.js';
import { AssistantRepetitionMonitor } from '../assistant-repetition-monitor.js';
import { debugLog, debugError } from '../../debug-logger.js';
import type { PiRunResult } from '../pi-provider-types.js';

/**
 * Run a single prompt on whatever model the agent is currently set to.
 * Captures both thrown errors and Agent.state.errorMessage into errorMessage so
 * the caller can decide whether to fall back.
 *
 * Loop guard: a TurnBudgetGuard counts tool calls (total + per-signature
 * repeats) and arms a wall-clock timeout. On trip it aborts the agent run;
 * partial output is kept with an explanatory note instead of an error so
 * the user sees results instead of a hang (UAT runaway-find loop).
 */
export async function promptOnCurrentModel(
  agent: Agent,
  prompt: string,
  budget?: import('../turn-budget-guard.js').TurnBudget,
  onToolEvent?: import('../pi-provider-types.js').PiRunInput['onToolEvent']
): Promise<PiRunResult> {
  const collector: EventCollector = { chunks: [], toolCalls: [], text: '', thinking: '' };
  // Shared steer/abort effectors (never throw — event dispatch must survive).
  const abortRun = (): void => {
    try {
      agent.abort();
    } catch {
      // Abort must never break event dispatch.
    }
  };
  const steerWith = (text: string): void => {
    try {
      agent.steer({
        role: 'user',
        content: [{ type: 'text', text }],
        timestamp: Date.now(),
      } as never);
    } catch {
      // Steering must never break event dispatch.
    }
  };
  const guard = new TurnBudgetGuard(TurnBudgetGuard.resolveDefaults(budget), abortRun);
  const tracker = new ToolEventTracker();
  // Text perseveration watch: feed newly COMPLETED assistant blocks
  // (paragraphs/fences) to the same repeat guard (spec: response repeats).
  let seenBlocks = 0;
  // v1.53.7 stream breaker: a paragraph looping the same fragment hundreds of
  // times is ONE block (no blank line) and invisible to the block scan —
  // feed raw deltas to a repetition monitor (UAT 17/10: 71 KB / ~11 minutes).
  const repetitionMonitor = new AssistantRepetitionMonitor();
  let seenTextChars = 0;
  const repeatLimit = TurnBudgetGuard.resolveDefaults(budget).maxSameToolRepeats;
  const watchTextRepeats = () => {
    if (guard.stoppedReason) return;
    if (collector.text.length > seenTextChars) {
      const delta = collector.text.slice(seenTextChars);
      seenTextChars = collector.text.length;
      if (repetitionMonitor.push(delta)) {
        guard.tripNow('repeat'); // guard aborts the run; stop note + K2 suppression apply
        return;
      }
    }
    const blocks = splitCompletedBlocks(collector.text);
    for (let i = seenBlocks; i < blocks.length; i++) {
      const action = guard.observeTextBlock(blocks[i]);
      if (action === 'steer') steerWith(buildTextSteerCorrection(repeatLimit));
      else if (action === 'abort') abortRun();
    }
    seenBlocks = blocks.length;
  };
  const unsubscribe = agent.subscribe((event: AgentEvent) => {
    if ((event as { type?: string }).type === 'tool_execution_start') {
      const e = event as { toolName?: string; args?: unknown };
      let argsJson = '';
      try {
        argsJson = JSON.stringify(e.args ?? '');
      } catch {
        argsJson = String(e.args ?? '').slice(0, 300);
      }
      const toolName = String(e.toolName ?? '?');
      const action = guard.observeToolCall(toolName, argsJson);
      // First repeat: correct course mid-loop, keep the turn alive;
      // persisted after correction: stop the turn (guard already tripped).
      // SA4E-368: a re-read trip gets the synthesis correction; every other
      // repeat keeps the generic get-workspace-layout advice.
      if (action === 'steer') {
        steerWith(
          guard.lastTripKind === 'reread'
            ? buildRereadSteerCorrection(toolName, guard.lastTripTarget ?? '', repeatLimit)
            : buildSteerCorrection(toolName, repeatLimit)
        );
      } else if (action === 'abort') abortRun();
    }
    // BUG I: repeated identical FAILURES trip the guard even when the
    // arguments vary (signature = tool + first error line), so a model
    // retrying a malformed command steers/aborts instead of burning the
    // full turn timeout.
    if (event.type === 'tool_execution_end' && event.isError) {
      const toolName = String(event.toolName ?? '?');
      const action = guard.observeToolFailure(toolName, extractToolResultText(event.result));
      if (action === 'steer') steerWith(buildFailureSteerCorrection(toolName, repeatLimit));
      else if (action === 'abort') abortRun();
    }
    const live = tracker.observe(event);
    if (live && onToolEvent) {
      try {
        onToolEvent(live);
      } catch {
        // Progress display must never break the turn.
      }
    }
    mapAgentEvent(event, collector);
    watchTextRepeats();
  });
  guard.startTimeout();
  try {
    // Stuck-run recovery: if the SDK somehow still has an active run (previous turn crashed
    // mid-flight, abort raced), settle it BEFORE prompting — never prompt over activeRun.
    if (agent.state.isStreaming) {
      debugLog('[PiProvider] Stuck active run detected — waiting for idle before new prompt.');
      await agent.waitForIdle();
    }
    await agent.prompt(prompt);
    await agent.waitForIdle();
    return collectResult(agent, collector, guard);
  } catch (err: unknown) {
    // Our own guard abort: partial results + note, NOT an error (turn completes).
    if (guard.stoppedReason) {
      // waitForIdle may still reject after abort — settle quietly.
      try {
        await agent.waitForIdle();
      } catch {
        // Ignore settle errors after a guarded abort.
      }
      return collectResult(agent, collector, guard);
    }
    debugError('[PiProvider] run failed', err as Error);
    if (agent.state.isStreaming) {
      debugLog('[PiProvider] run failed while agent still streaming — re-settling idle.');
      try { await agent.waitForIdle(); } catch { /* ignore settle errors */ }
    }
    return { ...collectResult(agent, collector), errorMessage: (err as Error).message };
  } finally {
    guard.clear();
    unsubscribe();
  }
}

/** FIX E: snapshot the agent transcript + finalize chunks and error status. */
export function collectResult(agent: Agent, collector: EventCollector, guard?: TurnBudgetGuard): PiRunResult {
  // K2 (SA4E-368): a guard stop is INTENTIONAL — the abort error the SDK
  // records on the agent state ("This operation was aborted") must NOT
  // surface as a turn error: the friendly stop note appended below is the
  // single source of truth. Otherwise the executor maps it to
  // PI_EXECUTION_ERROR and the chat emits a SECOND red bubble on top of
  // the stop note (UAT: "Stopped early … loop guard" + "This operation
  // was aborted"). A genuine failure (no guard trip) still flows through.
  const errorMessage = guard?.stoppedReason
    ? undefined
    : collector.errorMessage || agent.state.errorMessage;
  let text = collector.text;
  if (guard?.stoppedReason) {
    const note = buildStopNote(guard.stoppedReason, guard.stats.totalCalls);
    text += note;
    // Stream the note too (the adapter renders chunks, not text).
    collector.chunks.push({ type: 'text', content: note });
    debugLog(`[PiProvider] turn stopped early (${guard.stoppedReason}, ${guard.stats.totalCalls} tool calls)`);
  }
  if (!collector.chunks.some(c => c.type === 'done')) {
    collector.chunks.push({ type: 'done' });
  }
  return {
    text,
    toolCalls: collector.toolCalls,
    chunks: collector.chunks,
    messages: agent.state.messages.slice(),
    errorMessage,
  };
}
