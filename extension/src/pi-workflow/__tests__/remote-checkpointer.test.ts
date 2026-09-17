import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RemoteCheckpointer } from '../remote-checkpointer';
import type { PiWorkflowState, PiInternalState } from '../types/pi-workflow-state';

const baseUrl = 'http://api.test';

describe('RemoteCheckpointer', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
    vi.stubGlobal('process', { env: { PI_API_URL: baseUrl } });
  });

  it('should validate threadId', async () => {
    const cp = new RemoteCheckpointer(baseUrl);
    await expect(cp.load('bad-id')).rejects.toThrow('Invalid threadId');
  });

  it('should load state via GET', async () => {
    const state: PiWorkflowState = {
      ticketKey: 'SA4E-290',
      threadId: '11111111-1111-4111-8111-111111111111',
      currentPhase: 'design',
      pipelineStatus: 'running',
      piSessionId: 's1',
      currentAgentId: null,
      toolCallCount: 0,
    };
    (global.fetch as any).mockResolvedValue({
      ok: true,
      json: async () => state,
    });

    const cp = new RemoteCheckpointer(baseUrl);
    const loaded = await cp.load('11111111-1111-4111-8111-111111111111');
    expect(loaded?.ticketKey).toBe('SA4E-290');
    expect((global.fetch as any).mock.calls[0][0]).toContain('/api/v1/threads/11111111-1111-4111-8111-111111111111/state');
  });

  it('should save state via PUT', async () => {
    (global.fetch as any).mockResolvedValue({ ok: true, text: async () => '' });
    const cp = new RemoteCheckpointer(baseUrl);
    const state: PiWorkflowState = {
      ticketKey: 'SA4E-290',
      threadId: '11111111-1111-4111-8111-111111111111',
      currentPhase: 'design',
      pipelineStatus: 'running',
      piSessionId: 's1',
      currentAgentId: null,
      toolCallCount: 0,
    };
    await cp.save(state);
    const call = (global.fetch as any).mock.calls[0];
    expect(call[1].method).toBe('PUT');
    expect(call[0]).toContain('/state');
  });

  it('should putCheckpoint via POST', async () => {
    (global.fetch as any).mockResolvedValue({ ok: true, json: async () => ({ version: 2 }) });
    const cp = new RemoteCheckpointer(baseUrl);
    const piState: PiInternalState = {
      ticketKey: 'SA4E-290',
      threadId: 'thread-abc123',
      currentPhase: 'design',
      pipelineStatus: 'running',
      piSessionId: 's1',
      currentAgentId: null,
      toolCallCount: 0,
    } as any;
    const res = await cp.putCheckpoint('thread-abc123', piState);
    expect(res.version).toBe(2);
    expect((global.fetch as any).mock.calls[0][1].method).toBe('POST');
  });

  it('should return null on 404 load', async () => {
    (global.fetch as any).mockResolvedValue({ ok: false, status: 404 });
    const cp = new RemoteCheckpointer(baseUrl);
    const loaded = await cp.load('11111111-1111-4111-8111-111111111111');
    expect(loaded).toBeNull();
  });
});
