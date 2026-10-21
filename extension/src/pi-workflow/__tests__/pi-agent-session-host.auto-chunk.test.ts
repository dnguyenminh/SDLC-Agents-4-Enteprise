import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ensureSessionHost, clearSessionHostCache } from '../pi-agent-session-host.js';

// Mock pi-coding-agent.
// SA4E-365 (TC-03): `subscribe` now CAPTURES the listener and `prompt` emits
// the scripted events through it — enabling synthetic thinking_delta streams.
// `sessionEmit` only reaches listeners still subscribed (host unsubscribes in
// its `finally`), which is exactly the real SDK post-turn behavior.
const { promptCalls, scripted, listeners, sessionEmit } = vi.hoisted(() => {
  const listeners: Array<(e: unknown) => void> = [];
  const sessionEmit = (evt: unknown) => {
    for (const l of [...listeners]) l(evt);
  };
  return {
    promptCalls: [] as string[],
    scripted: { events: [] as unknown[] },
    listeners,
    sessionEmit,
  };
});

vi.mock('@earendil-works/pi-coding-agent', () => ({
  getAgentDir: () => '/tmp/pi',
  ModelRuntime: {
    create: async () => ({
      setRuntimeApiKey: vi.fn(),
      registerProvider: vi.fn(),
      getModel: () => ({ id: 'test-model' }),
      getModels: () => [{ id: 'test-model' }],
    }),
  },
  SettingsManager: { create: () => ({}) },
  SessionManager: { create: () => ({ getSessionFile: () => '/tmp/s.jsonl' }) },
  DefaultResourceLoader: class { constructor() {} },
  createAgentSession: vi.fn(async () => ({
    session: {
      subscribe: (listener: (e: unknown) => void) => {
        listeners.push(listener);
        return () => {
          const i = listeners.indexOf(listener);
          if (i >= 0) listeners.splice(i, 1);
        };
      },
      prompt: async (text: string) => {
        promptCalls.push(text);
        // Consume the script once per prompt so chunked runs emit only on the first chunk.
        for (const evt of scripted.events.splice(0)) sessionEmit(evt);
      },
    },
  })),
}));

vi.mock('../pi-extension-runtime.js', () => ({
  getPiExtensionEntries: vi.fn(() => []),
  getPiExtensionAgentTools: vi.fn(async () => ({ tools: [], loaded: [], skipped: [] })),
}));

describe('PiAgentSessionHost auto-chunk (SA4E-355)', () => {
  beforeEach(() => {
    clearSessionHostCache();
  });

  it('creates host with tier small and enables auto-chunk mode', async () => {
    const host = await ensureSessionHost({
      workspaceRoot: '/ws',
      tabId: 'tab-1',
      providerId: 'anthropic',
      apiKey: 'k',
      nCtxDetected: 8192, // small tier
    });
    expect(host).toBeDefined();
    // Tier small should force compression and lean loadout
    host.dispose();
  });

  it('promptTurn processes large prompt via incremental chunks for small tier', async () => {
    // This test will be expanded after implementation
    const host = await ensureSessionHost({
      workspaceRoot: '/ws',
      tabId: 'tab-1',
      providerId: 'anthropic',
      apiKey: 'k',
      nCtxDetected: 8192,
    });
    const largePrompt = Array.from({ length: 200 }, (_, i) => `Paragraph ${i} with some content. `).join('\n\n');
    const res = await host.promptTurn(largePrompt);
    expect(res.text).toBeDefined();
    host.dispose();
  });

  // STC: SA4E-355 UAT fix #2 — medium tier (n_ctx 65536) must ALSO auto-chunk
  // when the request (prompt + accumulated history) approaches the usable budget.
  it('promptTurn auto-chunks for MEDIUM tier when the prompt approaches n_ctx', async () => {
    promptCalls.length = 0;
    const host = await ensureSessionHost({
      workspaceRoot: '/ws',
      tabId: 'tab-1',
      providerId: 'anthropic',
      apiKey: 'k',
      nCtxDetected: 65536, // → tier medium (16k < 65536 < 128k)
    });
    // 50k-token prompt > 70% of the 58245-token usable budget → must chunk.
    const hugePrompt = 'y'.repeat(50000 * 4);
    await host.promptTurn(hugePrompt);
    expect(promptCalls.length).toBeGreaterThan(1); // chunked into multiple provider calls
    host.dispose();
  });

  it('promptTurn does NOT chunk a small prompt for medium tier (below threshold)', async () => {
    promptCalls.length = 0;
    const host = await ensureSessionHost({
      workspaceRoot: '/ws',
      tabId: 'tab-1',
      providerId: 'anthropic',
      apiKey: 'k',
      nCtxDetected: 65536,
    });
    await host.promptTurn('just a normal question');
    expect(promptCalls).toHaveLength(1); // single provider call — no chunking
    host.dispose();
  });
});

// SA4E-365 — promptTurn onThinking forwarding (STC Group E, TC-03 [FR1-R1/R2,
// FR5-R3, AC1/BR-1]). The fake session emits synthetic message_update events
// through the captured subscribe listener; the script is consumed once so
// chunked runs emit only during their first chunk prompt.
describe('promptTurn onThinking forwarding (SA4E-365, TC-03)', () => {
  beforeEach(() => {
    clearSessionHostCache();
    scripted.events.length = 0;
    promptCalls.length = 0;
  });

  const thinking = (delta?: string): unknown => ({
    type: 'message_update',
    assistantMessageEvent: { type: 'thinking_delta', delta },
  });
  const text = (delta: string): unknown => ({
    type: 'message_update',
    assistantMessageEvent: { type: 'text_delta', delta },
  });

  // SA4E-365, TC-03a [FR1-R1] — normal loop (non-chunked path) forwards deltas in order
  it('TC-03a: normal loop forwards thinking deltas then the text token', async () => {
    const host = await ensureSessionHost({ workspaceRoot: '/ws', tabId: 'tab-1', providerId: 'anthropic', apiKey: 'k', nCtxDetected: 65536 });
    scripted.events.push(thinking('t1'), thinking('t2'), text('hi'));
    const onThinking = vi.fn();
    const onToken = vi.fn();
    await host.promptTurn('short prompt', onToken, undefined, onThinking);
    expect(promptCalls).toHaveLength(1); // precondition: normal loop, no chunking
    expect(onThinking.mock.calls.map((c) => c[0])).toEqual(['t1', 't2']);
    expect(onToken.mock.calls.map((c) => c[0])).toEqual(['hi']);
    host.dispose();
  });

  // SA4E-365, TC-03b [FR1-R2, F2] — auto-chunk loop (runOnce) forwards deltas too
  it('TC-03b: auto-chunk loop forwards thinking deltas via onThinking', async () => {
    const host = await ensureSessionHost({ workspaceRoot: '/ws', tabId: 'tab-1', providerId: 'anthropic', apiKey: 'k', nCtxDetected: 8192 });
    const largePrompt = Array.from({ length: 200 }, (_, i) => `Paragraph ${i} with some content. `).join('\n\n');
    scripted.events.push(thinking('c1'), thinking('c2'));
    const onThinking = vi.fn();
    await host.promptTurn(largePrompt, undefined, undefined, onThinking);
    expect(promptCalls.length).toBeGreaterThan(1); // precondition: chunked → runOnce loop
    expect(onThinking.mock.calls.map((c) => c[0])).toEqual(['c1', 'c2']);
    host.dispose();
  });

  // SA4E-365, TC-03c [FR1-R1 guard] — host guard drops empty deltas (truthy content only)
  it('TC-03c: empty thinking delta never reaches onThinking', async () => {
    const host = await ensureSessionHost({ workspaceRoot: '/ws', tabId: 'tab-1', providerId: 'anthropic', apiKey: 'k', nCtxDetected: 65536 });
    scripted.events.push(thinking(''), thinking(undefined), thinking('real'));
    const onThinking = vi.fn();
    await host.promptTurn('short prompt', undefined, undefined, onThinking);
    expect(onThinking.mock.calls.map((c) => c[0])).toEqual(['real']);
    host.dispose();
  });

  // SA4E-365, TC-03d [FR5-R3] — after the turn ends no event reaches onThinking (unsubscribed)
  it('TC-03d: late event after promptTurn ends is not forwarded (guard live)', async () => {
    const host = await ensureSessionHost({ workspaceRoot: '/ws', tabId: 'tab-1', providerId: 'anthropic', apiKey: 'k', nCtxDetected: 65536 });
    const onThinking = vi.fn();
    await host.promptTurn('short prompt', undefined, undefined, onThinking);
    expect(onThinking).not.toHaveBeenCalled(); // no script — sanity
    sessionEmit(thinking('late')); // listeners array is empty post-unsubscribe
    expect(onThinking).not.toHaveBeenCalled();
    host.dispose();
  });
});
