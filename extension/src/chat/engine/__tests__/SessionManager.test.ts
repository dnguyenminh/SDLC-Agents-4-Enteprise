/**
 * SA4E-85 — SessionManager tests (UT-HYD-03 + PBT-HYD-01).
 * Thread resolution is backend-driven: reuse active thread from Backend KB
 * or create a new one via POST /api/v1/threads. Backend unreachable → error
 * surfaces (recoverable), no crash.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { KnowledgeClient, KbUnreachableError, isUuidV4 } from '../../../knowledge-client';
import { SessionManager } from '../SessionManager';
import { startMockKbServer, type MockKbServer } from '../../../__tests__/helpers/mock-kb-server';

describe('UT-HYD-03 — Thread resolution from Backend KB', () => {
  let server: MockKbServer;
  let client: KnowledgeClient;
  let manager: SessionManager;

  beforeEach(async () => {
    server = await startMockKbServer();
    client = new KnowledgeClient(server.url, { timeoutMs: 2000, retries: 0 });
    manager = new SessionManager('/test-workspace', client);
  });

  afterEach(async () => {
    await server.close();
  });

  it('reuses the most recent active thread from the backend (no new thread created)', async () => {
    server.threads.push({
      thread_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      workspace_id: 'test-ws',
      title: 'existing',
      agent_id: null,
      status: 'active',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-02-01T00:00:00.000Z',
    });

    const session = await manager.ensureSession();
    expect(session.thread_id).toBe('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
    expect(isUuidV4(session.thread_id)).toBe(true);
    // No POST /threads should have occurred
    expect(server.requests.some((r) => r.method === 'POST' && r.url === '/api/v1/threads')).toBe(false);
  });

  it('creates a new thread via POST /api/v1/threads when no active thread exists', async () => {
    const session = await manager.ensureSession();
    expect(isUuidV4(session.thread_id)).toBe(true);
    const postReq = server.requests.find((r) => r.method === 'POST' && r.url === '/api/v1/threads');
    expect(postReq).toBeDefined();
    expect(server.threads).toHaveLength(1);
  });

  it('returns null from getSessionMessages when no session is resolved', async () => {
    const result = await manager.getSessionMessages();
    expect(result).toBeNull();
  });

  it('getSessionMessages hydrates persisted messages for the resolved thread', async () => {
    const thread = await client.createThread();
    await client.saveCheckpoint(thread.thread_id, {
      checkpoint: { v: 4, id: 'c', ts: 't', channel_values: { chatHistory: [] }, channel_versions: {}, versions_seen: {} },
      messages: [
        { id: 'm1', role: 'user', content: 'hello', timestamp: '2026-01-01T00:00:00.000Z' },
        { id: 'm2', role: 'assistant', content: 'hi there', timestamp: '2026-01-01T00:00:05.000Z' },
      ],
    });

    const hydrated = await manager.getSessionMessages();
    expect(hydrated?.threadId).toBe(thread.thread_id);
    expect(hydrated?.messages).toHaveLength(2);
    expect(hydrated?.messages[0].content).toBe('hello');
    expect(hydrated?.messages[0].role).toBe('user');
  });

  it('surfaces a recoverable error (no crash) when backend is unreachable', async () => {
    const offline = new SessionManager('/test-workspace', new KnowledgeClient('http://127.0.0.1:1', { timeoutMs: 300, retries: 0 }));
    const err = await offline.ensureSession().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(KbUnreachableError);
    expect((err as KbUnreachableError).recoverable).toBe(true);
  });

  it('cleanup() is a local no-op that clears the cache', async () => {
    await manager.ensureSession();
    await manager.cleanup();
    expect(manager.getSession()).toBeNull();
  });
});

describe('PBT-HYD-01 — SessionManager thread_id contract', () => {
  it('never returns a non-UUIDv4 thread_id from ensureSession', async () => {
    const server = await startMockKbServer();
    const client = new KnowledgeClient(server.url, { timeoutMs: 2000, retries: 0 });
    const manager = new SessionManager('/test-workspace', client);
    try {
      const session = await manager.ensureSession();
      expect(isUuidV4(session.thread_id)).toBe(true);
    } finally {
      await server.close();
    }
  });
});
