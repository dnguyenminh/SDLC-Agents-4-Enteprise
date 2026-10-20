/**
 * SA4E-369 Phase 5.7 S-03 — single-flight lock per session host (SEC-01/C1 L2).
 * A concurrent promptTurn on the SAME session host MUST WAIT for the current
 * turn: otherwise the second call re-tags the shared `turnOrigin` tracker
 * mid-turn and its tool calls run UNGATED inside an open peer turn
 * (fail-open). The FIFO chain never poisons: a failed turn still unblocks
 * the next one (settle-mirror join), and the tracker always resets 'user'.
 * STC: TC-402 (concurrent turn governance), TC-603 (fail-closed invariants).
 */
import { describe, expect, it } from 'vitest';
import { createSessionPromptTurn } from '../../pi-workflow/session-host/turn-executor';
import type { ContextBudget } from '../../pi-agent/models/ContextBudget';

const budget: ContextBudget = {
  nCtx: 10_000,
  reserveOutput: 2_000,
  safetyMargin: 800,
  staticBudget: 5_000,
  historyBudget: 2_000,
};

/** Deterministic microtask boundary so the chain can start a queued turn. */
const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/**
 * Fake AgentSession: one in-flight gate per prompt — the test releases
 * `promptOrder[0]`-style turns manually. Records concurrency + prompt order.
 */
function makeFakeSession(replyFor: (text: string) => string, failNomination?: string) {
  let running = 0;
  let maxConcurrent = 0;
  const promptOrder: string[] = [];
  let listener: ((e: unknown) => void) | undefined;
  const waiters: Array<{ text: string; resolve: (ok: boolean) => void }> = [];
  return {
    stats: { get maxConcurrent() { return maxConcurrent; }, promptOrder },
    releaseAll(ok = true): void {
      for (const w of waiters.splice(0, waiters.length)) w.resolve(ok || w.text !== failNomination);
    },
    // biome-ignore lint: same duck-typed AgentSession surface the real host uses.
    subscribe(l: (e: unknown) => void): () => void {
      listener = l;
      return () => { listener = undefined; };
    },
    async prompt(text: string): Promise<void> {
      promptOrder.push(text);
      running++;
      maxConcurrent = Math.max(maxConcurrent, running);
      // Emit the mapped reply text so the turn's collector resolves with text.
      listener?.({ type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: replyFor(text) } });
      const ok = await new Promise<boolean>((resolve) => waiters.push({ text, resolve }));
      running--;
      if (!ok) throw new Error(`simulated turn failure: ${text}`);
    },
  } as never;
}

describe('SA4E-369 S-03 — single-flight lock per session host', () => {
  // S-03 core: the queued-behind user turn must NOT re-tag the tracker while
  // a peer turn is open, and prompts strictly serialize (never concurrent).
  it('AC-S03a: peer turn in flight → user prompt joins the chain, tracker stays "peer", prompts sequential', async () => {
    const session = makeFakeSession((t) => t);
    const tracker = { current: 'user' as 'user' | 'peer' };
    const turn = createSessionPromptTurn(session, 'small', budget, () => 'f.session', tracker);

    const p1 = turn('peer-prompt', undefined, undefined, undefined, { turnOrigin: 'peer' });
    const p2 = turn('user-prompt'); // user turn joins WHILE p1 is still open
    await tick();
    await tick();

    // The re-tag bug would have set current:'user' the moment p2 STARTED.
    expect(tracker.current).toBe('peer'); // NOT re-tagged mid-turn (fail-closed kept)
    expect(session.stats.promptOrder).toEqual(['peer-prompt']); // p2 not started
    session.releaseAll();

    await tick();
    await tick();
    expect(session.stats.promptOrder).toEqual(['peer-prompt', 'user-prompt']); // strictly FIFO
    session.releaseAll();

    const r1 = await p1;
    const r2 = await p2;
    expect(r1).toMatchObject({ text: 'peer-prompt' });
    expect(r2).toMatchObject({ text: 'user-prompt' });
    expect(session.stats.maxConcurrent).toBe(1); // never interleaved
    expect(tracker.current).toBe('user'); // reset never leaks across turns
  });

  it('AC-S03b: a failed turn NEVER poisons the chain — the next turn still executes', async () => {
    const session = makeFakeSession((t) => t, 'bad');
    const tracker = { current: 'user' as 'user' | 'peer' };
    const turn = createSessionPromptTurn(session, 'small', budget, () => 'f.session', tracker);

    const p1 = turn('bad', undefined, undefined, undefined, { turnOrigin: 'peer' });
    await tick(); // let the turn reach its in-flight gate
    session.releaseAll(false);
    await expect(p1).rejects.toThrow('simulated turn failure: bad');
    expect(tracker.current).toBe('user'); // even on failure the reset runs

    const p2 = turn('good'); // queued AFTER the failure — chain must unblock
    await tick();
    expect(session.stats.promptOrder).toEqual(['bad', 'good']);
    session.releaseAll();
    await expect(p2).resolves.toMatchObject({ text: 'good' });
    expect(tracker.current).toBe('user');
  });
});
