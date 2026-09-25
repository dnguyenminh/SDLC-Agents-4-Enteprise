import { describe, it, expect, vi, beforeEach } from 'vitest';
import { KbRemoteCheckpointerStore, ensureUuidV4, deriveHmacKey } from '../remote-checkpointer-store.js';
import type { PipelineState } from '../types/pi-workflow-state.js';

describe('KbRemoteCheckpointerStore', () => {
  let mockKnowledgeClient: any;
  let store: KbRemoteCheckpointerStore;
  const testKey = 'test-secret-hmac-key';

  beforeEach(() => {
    mockKnowledgeClient = {
      getCheckpoint: vi.fn(),
      saveCheckpoint: vi.fn(),
    };
    store = new KbRemoteCheckpointerStore({
      client: mockKnowledgeClient,
      hmacKey: testKey,
    });
  });

  it('generates unpredictable UUID v4 using secret HMAC key', () => {
    const threadId = 'SA4E-289-user-thread';
    const uuid1 = ensureUuidV4(threadId, 'key-A');
    const uuid2 = ensureUuidV4(threadId, 'key-B');
    expect(uuid1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(uuid2).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    // Changing HMAC key changes UUID (anti-IDOR)
    expect(uuid1).not.toEqual(uuid2);
  });

  it('saves checkpoint and passes messages', async () => {
    const pipelineState: PipelineState = {
      ticketKey: 'SA4E-289',
      threadId: 'SA4E-289-123456',
      currentPhase: 'implementation',
      pipelineStatus: 'READY',
      chatHistory: [{ role: 'user', content: 'hello' }],
      agentOutputs: {},
      errors: [],
    };

    await store.saveCheckpoint(pipelineState.threadId, pipelineState);

    expect(mockKnowledgeClient.saveCheckpoint).toHaveBeenCalledTimes(1);
    const [savedThreadId, payload] = mockKnowledgeClient.saveCheckpoint.mock.calls[0];
    expect(savedThreadId).toEqual(ensureUuidV4(pipelineState.threadId, testKey));
    expect(payload.checkpoint).toEqual(pipelineState);
    expect(payload.messages).toEqual([{ role: 'user', content: 'hello' }]);
  });

  it('surfaces error when saveCheckpoint fails instead of silently swallowing', async () => {
    const pipelineState: PipelineState = {
      ticketKey: 'SA4E-289',
      threadId: 'SA4E-289-fail',
      currentPhase: 'implementation',
    };
    mockKnowledgeClient.saveCheckpoint.mockRejectedValueOnce(new Error('Network failure'));

    await expect(store.saveCheckpoint(pipelineState.threadId, pipelineState)).rejects.toThrow('Network failure');
  });

  it('loads valid checkpoint and validates via Zod safeParse', async () => {
    const mockState: PipelineState = {
      ticketKey: 'SA4E-289',
      threadId: 'SA4E-289-123456',
      currentPhase: 'implementation',
      pipelineStatus: 'READY',
      chatHistory: [{ role: 'assistant', content: 'done' }],
      agentOutputs: {},
      errors: [],
    };

    mockKnowledgeClient.getCheckpoint.mockResolvedValueOnce({
      checkpoint: mockState,
    });

    const result = await store.getCheckpoint('SA4E-289-123456');
    expect(result).toEqual(mockState);
  });

  it('rejects malformed checkpoint data via Zod safeParse and returns null', async () => {
    // Missing required ticketKey
    mockKnowledgeClient.getCheckpoint.mockResolvedValueOnce({
      checkpoint: { threadId: '123', currentPhase: 'dev' },
    });

    const result = await store.getCheckpoint('SA4E-289-bad');
    expect(result).toBeNull();
  });

  it('returns null if checkpoint not found or on network error', async () => {
    mockKnowledgeClient.getCheckpoint.mockRejectedValueOnce(new Error('KB unreachable'));
    const result = await store.getCheckpoint('SA4E-289-999999');
    expect(result).toBeNull();
  });
});
