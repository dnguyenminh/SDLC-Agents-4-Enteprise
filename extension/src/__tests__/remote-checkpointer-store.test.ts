/**
 * SA4E-372 — KbRemoteCheckpointerStore fail-open contract (UAT blocker fix).
 *
 * Live-trace (extension host instrumentation, UAT profile): the legacy turn
 * streamed fine, but `PUT {kb}/api/v1/threads/:uuid/checkpoint` returned 401
 * because the IDE user is not logged in to the backend. saveCheckpoint used to
 * re-throw, which killed engine.executeTurn and discarded the whole turn
 * including every already-streamed chunk in the webview.
 *
 * Contract after the fix:
 *  - saveCheckpoint with a failing client PUT MUST resolve (best-effort remote
 *    mirror, symmetric with getCheckpoint's fail-safe → null).
 *  - getCheckpoint with a failing client GET stays fail-safe (null).
 *
 * Mock style: plain-object KnowledgeClient cast to the real type (consistent
 * with the pure-object client mocks used across pi-workflow tests).
 */
import { describe, it, expect, vi } from 'vitest';
import { KbRemoteCheckpointerStore } from '../pi-workflow/remote-checkpointer-store';
import type { KnowledgeClient } from '../knowledge-client';
import type { PipelineState } from '../pi-workflow/types/pi-workflow-state';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function makeState(overrides: Partial<PipelineState> = {}): PipelineState {
  return {
    ticketKey: 'SA4E-372',
    threadId: 'thread-legacy-1',
    currentPhase: 'chat',
    chatHistory: [{ role: 'user', content: 'hello' }],
    ...overrides,
  } as PipelineState;
}

function mockClient(overrides: Record<string, unknown>): KnowledgeClient {
  return overrides as unknown as KnowledgeClient;
}

describe('SA4E-372 — KbRemoteCheckpointerStore fail-open contract', () => {
  it('saveCheckpoint resolves (does NOT throw) when the client PUT fails with HTTP 401', async () => {
    const putError = new Error('HTTP 401: Authentication required');
    (putError as { status?: number }).status = 401;
    const client = mockClient({
      saveCheckpoint: vi.fn().mockRejectedValue(putError),
    });
    const store = new KbRemoteCheckpointerStore({ client });

    // Before the SA4E-372 fix this rejected → adapter `chat:error` → whole turn discarded.
    await expect(store.saveCheckpoint('thread-legacy-1', makeState())).resolves.toBeUndefined();
    // The mapped (HMAC) thread id was still derived and forwarded.
    const calledThreadId = (client.saveCheckpoint as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(UUID_V4.test(calledThreadId)).toBe(true);
  });

  it('saveCheckpoint stays fail-open for arbitrary transport errors (no status field)', async () => {
    const client = mockClient({
      saveCheckpoint: vi.fn().mockRejectedValue(new Error('fetch failed: ECONNREFUSED')),
    });
    const store = new KbRemoteCheckpointerStore({ client });

    await expect(
      store.saveCheckpoint('thread-econn', makeState({ threadId: 'thread-econn' }))
    ).resolves.toBeUndefined();
  });

  it('saveCheckpoint still forwards chatHistory payload when the client succeeds', async () => {
    const client = mockClient({
      saveCheckpoint: vi.fn().mockResolvedValue({ version: 1 }),
    });
    const store = new KbRemoteCheckpointerStore({ client });

    await expect(
      store.saveCheckpoint('thread-ok', makeState({ threadId: 'thread-ok' }))
    ).resolves.toBeUndefined();

    const [, payload] = (client.saveCheckpoint as ReturnType<typeof vi.fn>).mock.calls[0] as [string, {
      messages: Array<{ role: string; content: string }>;
      metadata: { ticketKey: string; phase: string };
    }];
    expect(payload.messages).toEqual([{ role: 'user', content: 'hello' }]);
    expect(payload.metadata).toMatchObject({ ticketKey: 'SA4E-372', phase: 'chat' });
  });

  it('getCheckpoint stays fail-safe: client GET error → null (symmetric fail-open)', async () => {
    const client = mockClient({
      getCheckpoint: vi.fn().mockRejectedValue(new Error('HTTP 401: Authentication required')),
    });
    const store = new KbRemoteCheckpointerStore({ client });

    await expect(store.getCheckpoint('thread-legacy-1')).resolves.toBeNull();
  });
});
