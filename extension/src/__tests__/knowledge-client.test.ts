/**
 * SA4E-85 — KnowledgeClient tests.
 *  - PBT-HYD-01: thread_id returned by Backend KB is always a valid UUID v4
 *  - REST contract: list/create/getMessages/getCheckpoint/saveCheckpoint/delete
 *    exercised against an embedded HTTP server implementing the real routes.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { KnowledgeClient, KbUnreachableError, isUuidV4, parseThreadJson, validateThreadJson, UUID_V4_REGEX } from '../knowledge-client';
import { startMockKbServer, type MockKbServer } from './helpers/mock-kb-server';

describe('PBT-HYD-01 — thread_id UUID v4 contract', () => {
  it('validates that generated UUIDs are always valid UUID v4 (property)', () => {
    // fast-check stringMatching rejects the `i` flag — use a case-sensitive copy.
    const UUID_V4_GEN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    fc.assert(
      fc.property(fc.stringMatching(UUID_V4_GEN), (uuid) => {
        const thread = { thread_id: uuid, started_at: new Date().toISOString() };
        const parsed = parseThreadJson(JSON.stringify(thread));
        expect(parsed?.thread_id).toBeDefined();
        expect(isUuidV4(parsed!.thread_id)).toBe(true);
        expect(validateThreadJson(JSON.stringify(thread)).valid).toBe(true);
      }),
      { numRuns: 500 }
    );
  });

  it('rejects invalid thread_id strings (property)', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 100 }), (badId) => {
        fc.pre(!isUuidV4(badId));
        const thread = { thread_id: badId };
        const result = validateThreadJson(JSON.stringify(thread));
        expect(result.valid).toBe(false);
        expect(result.reason).toBeDefined();
      }),
      { numRuns: 500 }
    );
  });

  it('rejects malformed JSON', () => {
    expect(parseThreadJson('{not-json')).toBeNull();
    expect(validateThreadJson('{not-json').valid).toBe(false);
  });
});

describe('KnowledgeClient — REST contract', () => {
  let server: MockKbServer;
  let client: KnowledgeClient;

  beforeEach(async () => {
    server = await startMockKbServer();
    client = new KnowledgeClient(server.url, { timeoutMs: 2000, retries: 0 });
  });

  afterEach(async () => {
    await server.close();
  });

  it('createThread returns a thread with valid UUID v4 thread_id', async () => {
    const thread = await client.createThread({ title: 'ticket ABC-1' });
    expect(isUuidV4(thread.thread_id)).toBe(true);
    expect(thread.title).toBe('ticket ABC-1');
    expect(thread.status).toBe('active');
  });

  it('listThreads returns previously created threads', async () => {
    await client.createThread({ title: 'a' });
    await client.createThread({ title: 'b' });
    const threads = await client.listThreads();
    expect(threads).toHaveLength(2);
    expect(threads.map((t) => t.title)).toEqual(['a', 'b']);
  });

  it('getMessages returns null for unknown thread (404 contract)', async () => {
    const messages = await client.getMessages('00000000-0000-4000-8000-000000000000');
    expect(messages).toBeNull();
  });

  it('saveCheckpoint + getCheckpoint round-trips the full payload', async () => {
    const thread = await client.createThread();
    const saved = await client.saveCheckpoint(thread.thread_id, {
      checkpoint: { v: 1, ts: '2026-01-01T00:00:00.000Z', id: 'cp-1', channel_values: { ticketKey: 'ABC-1' } },
      metadata: { source: 'test' },
    });
    expect(saved?.version).toBe(1);

    const got = await client.getCheckpoint(thread.thread_id);
    expect(got?.checkpoint).toBeDefined();
    expect((got?.checkpoint as { channel_values?: { ticketKey?: string } }).channel_values?.ticketKey).toBe('ABC-1');
    expect(got?.metadata).toEqual({ source: 'test' });
  });

  it('deleteThread removes the thread and returns true', async () => {
    const thread = await client.createThread();
    const ok = await client.deleteThread(thread.thread_id);
    expect(ok).toBe(true);
    expect(await client.getMessages(thread.thread_id)).toBeNull();
  });

  it('deleteThread returns false when thread does not exist', async () => {
    const ok = await client.deleteThread('00000000-0000-4000-8000-000000000000');
    expect(ok).toBe(false);
  });
});

describe('KnowledgeClient — unreachable backend resilience', () => {
  it('throws recoverable KbUnreachableError after retries on ECONNREFUSED', async () => {
    // Port 1 on 127.0.0.1 is practically never listening.
    const client = new KnowledgeClient('http://127.0.0.1:1', { timeoutMs: 500, retries: 2 });
    await expect(client.listThreads()).rejects.toBeInstanceOf(KbUnreachableError);
    const err = await client.listThreads().catch((e: Error) => e);
    expect((err as KbUnreachableError).recoverable).toBe(true);
  });
});

