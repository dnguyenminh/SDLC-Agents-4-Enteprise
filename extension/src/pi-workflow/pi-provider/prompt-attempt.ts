/**
 * CHAT-LOOP-CONT — one guarded prompt cycle over the pi-agent-core Agent,
 * extracted from turn-runner.ts (BR-18 file-size split) so the runner can wrap
 * attempts in the stream-loop auto-continuation loop.
 *
 * An attempt = subscribe → prompt → settle → collect, with repetition
 * watchers over BOTH streamed surfaces: answer text (v1.53.7 breaker →
 * guard.tripNow('repeat'): stop note + K2, unchanged) and thinking text
 * (NEW — SILENT abort, no guard trip: the caller decides between an
 * auto-continuation prompt and the final stop note; the SDK's abort error is
 * suppressed so an intentional stop never surfaces as a turn failure).
 */
import type { Agent, AgentEvent } from '@earendil-works/pi-agent-core';
import {
  mapAgentEvent,
  extractToolResultText,
  ToolEventTracker,
  type EventCollector,
} from '../pi-event-mapper.js';
import {
  TurnBudgetGuard,
  buildSteerCorrection,
  buildFailureSteerCorrection,
  buildTextSteerCorrection,
  buildRereadSteerCorrection,
  splitCompletedBlocks,
  type TurnBudget,
} from '../turn-budget-guard.js';
import { AssistantRepetitionMonitor } from '../assistant-repetition-monitor.js';
import { debugLog, debugError } from '../../debug-logger.js';
import type { PiRunInput, PiRunResult } from '../pi-provider-types.js';
import { collectResult } from './collect-result.js';

export interface PromptAttemptOutcome {
  result: PiRunResult;
  /** Set when the THINKING stream degenerated (silent abort already applied). */
  streamLoop?: { anchor: string };
}

/** Run a single prompt on whatever model the agent is currently set to. */
export async function runPromptAttempt(
  agent: Agent,
  promptText: string,
  budget?: TurnBudget,
  onToolEvent?: PiRunInput['onToolEvent']
): Promise<PromptAttemptOutcome> {
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
  // CHAT-LOOP-CONT: thinking degeneration → SILENT abort. The anchor (last
  // coherent reasoning before the loop) feeds the continuation prompt.
  const thinkingMonitor = new AssistantRepetitionMonitor();
  let seenThinkingChars = 0;
  let thinkingLoopAnchor: string | undefined;
  const watchThinkingRepeats = (): void => {
    if (thinkingLoopAnchor !== undefined) return;
    const thinking = collector.thinking ?? '';
    if (thinking.length > seenThinkingChars) {
      const delta = thinking.slice(seenThinkingChars);
      seenThinkingChars = thinking.length;
      if (thinkingMonitor.push(delta)) {
        thinkingLoopAnchor = thinkingMonitor.uniqueTail(500);
        debugLog('[PiProvider] thinking stream degeneration detected — aborting for auto-continuation');
        abortRun();
      }
    }
  };
  const watchTextRepeats = (): void => {
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
    watchThinkingRepeats();
  });
  guard.startTimeout();
  try {
    // Stuck-run recovery: settle a previous crashed mid-flight run BEFORE
    // prompting — never prompt over activeRun.
    if (agent.state.isStreaming) {
      debugLog('[PiProvider] Stuck active run detected — waiting for idle before new prompt.');
      await agent.waitForIdle();
    }
    await agent.prompt(promptText);
    await agent.waitForIdle();
    return { result: finalize(collectResult(agent, collector, guard)), streamLoop: loopOutcome() };
  } catch (err: unknown) {
    // Our own intentional stop (guard trip OR thinking-loop abort): partial
    // results, NOT an error (the turn completes; the caller may continue).
    if (guard.stoppedReason || thinkingLoopAnchor !== undefined) {
      // waitForIdle may still reject after abort — settle quietly.
      try {
        await agent.waitForIdle();
      } catch {
        // Ignore settle errors after a guarded abort.
      }
      return { result: finalize(collectResult(agent, collector, guard)), streamLoop: loopOutcome() };
    }
    debugError('[PiProvider] run failed', err as Error);
    if (agent.state.isStreaming) {
      debugLog('[PiProvider] run failed while agent still streaming — re-settling idle.');
      try { await agent.waitForIdle(); } catch { /* ignore settle errors */ }
    }
    return { result: { ...collectResult(agent, collector), errorMessage: (err as Error).message } };
  } finally {
    guard.clear();
    unsubscribe();
  }

  /** Intentional thinking-loop stop — the SDK abort error never surfaces. */
  function finalize(result: PiRunResult): PiRunResult {
    return thinkingLoopAnchor !== undefined ? { ...result, errorMessage: undefined } : result;
  }
  function loopOutcome(): PromptAttemptOutcome['streamLoop'] {
    return thinkingLoopAnchor === undefined ? undefined : { anchor: thinkingLoopAnchor };
  }
}
