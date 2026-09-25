/**
 * SA4E-85 — KnowledgeService unit tests.
 * Covers: thread creation (PBT-HYD-01 contract), workspace binding (#18),
 * checkpoint PUT→GET roundtrip (IT-HYD-03 backend logic), DELETE cascade.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import pino from 'pino';
import { KnowledgeDb } from '../KnowledgeDb.js';
import { KnowledgeService } from '../KnowledgeService.js';
import { createProjectContext } from '../../modules/memory/ProjectContext.js';
import { isUuidV4 } from '../models.js';

const logger = pino({ level: 'silent' });

function ctx(projectId: string, wid?: string) {
  return createProjectContext(projectId, 'user-1', undefined, wid);
}

describe('KnowledgeService', () => {
  let db: KnowledgeDb;
  let service: KnowledgeService;

  beforeEach(async () => {
    db = await KnowledgeDb.createInMemory();
    service = new KnowledgeService(db, logger);
  });

  describe('createThread', () => {
    it('returns a UUID v4 thread_id (PBT-HYD-01)', async () => {
      const thread = await service.createThread(ctx('ws-A'), { title: 'Hello' });
      expect(isUuidV4(thread.thread_id)).toBe(true);
      expect(thread.workspace_id).toBe('ws-A');
      expect(thread.status).toBe('active');
    });

    it('appends THREAD_CREATED event (event sourcing)', async () => {
      const thread = await service.createThread(ctx('ws-A'), { title: 'T' });
      const events = await service.getEvents(ctx('ws-A'), thread.thread_id);
      expect(events).toHaveLength(1);
      expect(events?.[0].type).toBe('THREAD_CREATED');
    });

    it('defaults title when omitted', async () => {
      const thread = await service.createThread(ctx('ws-A'), {});
      expect(thread.title).toBe('New thread');
    });
  });

  describe('workspace binding — Finding #18', () => {
    it('getThread returns null for a thread owned by another workspace', async () => {
      const thread = await service.createThread(ctx('ws-A'), {});
      expect(await service.getThread(ctx('ws-B'), thread.thread_id)).toBeNull();
      expect(await service.getMessages(ctx('ws-B'), thread.thread_id)).toBeNull();
      expect(await service.getCheckpoint(ctx('ws-B'), thread.thread_id)).toBeNull();
      expect(await service.getEvents(ctx('ws-B'), thread.thread_id)).toBeNull();
      expect(await service.getArtifacts(ctx('ws-B'), thread.thread_id)).toBeNull();
    });

    it('saveCheckpoint auto-creates a thread for a fresh UUID it has never seen (LangGraph checkpointer)', async () => {
      const freshId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
      const saved = await service.saveCheckpoint(ctx('ws-A'), freshId, { checkpoint: { v: 1, channel_values: {} } });
      expect(saved).not.toBeNull();
      expect(saved?.thread_id).toBe(freshId);
      expect(saved?.version).toBe(1);
      const loaded = await service.getCheckpoint(ctx('ws-A'), freshId);
      expect(loaded?.checkpoint).toEqual({ v: 1, channel_values: {} });
      expect(await service.getThread(ctx('ws-A'), freshId)).not.toBeNull();
      // the new thread is visible to listThreads (multi-IDE hydrate)
      const threads = await service.listThreads(ctx('ws-A'));
      expect(threads.some((t) => t.thread_id === freshId)).toBe(true);
      // a second PUT bumps version (idempotent upsert, IT-HYD-03)
      await service.saveCheckpoint(ctx('ws-A'), freshId, { checkpoint: { v: 2, channel_values: {} } });
      expect((await service.getCheckpoint(ctx('ws-A'), freshId))?.version).toBe(2);
    });

    it('saveCheckpoint rejects a non-UUID thread id (404 path)', async () => {
      expect(await service.saveCheckpoint(ctx('ws-A'), 'not-a-uuid', { checkpoint: { v: 1 } })).toBeNull();
    });

    it('concurrent saveCheckpoint on the same fresh thread creates it exactly once (LangGraph put race)', async () => {
      const freshId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
      const results = await Promise.all([
        service.saveCheckpoint(ctx('ws-A'), freshId, { checkpoint: { v: 1 } }),
        service.saveCheckpoint(ctx('ws-A'), freshId, { checkpoint: { v: 1 } }),
        service.saveCheckpoint(ctx('ws-A'), freshId, { checkpoint: { v: 1 } }),
        service.saveCheckpoint(ctx('ws-A'), freshId, { checkpoint: { v: 1 } }),
      ]);
      expect(results.every((r) => r !== null)).toBe(true);
      expect(await service.getThread(ctx('ws-A'), freshId)).not.toBeNull();
      const events = await service.getEvents(ctx('ws-A'), freshId);
      const createdEvents = events?.filter((e) => e.type === 'THREAD_CREATED') ?? [];
      expect(createdEvents).toHaveLength(1);
    });

    it('saveCheckpoint does NOT 404 when a same-workspace thread appears between ownedThread read and upsert (race loser, fix for recurring "Thread not found")', async () => {
      const thread = await service.createThread(ctx('ws-A'), { title: 'Won by concurrent request' });
      // B's ownedThread read happened BEFORE A's INSERT committed → stale null,
      // even though A's thread already exists by the time B reaches the upsert.
      // Old pre-check `if (existing) return null` turned this into a false 404.
      const getSpy = vi.spyOn(db, 'getThread').mockImplementationOnce(async () => null);
      const saved = await service.saveCheckpoint(ctx('ws-A'), thread.thread_id, { checkpoint: { v: 1 } });
      getSpy.mockRestore();
      expect(saved).not.toBeNull();
      expect(saved?.thread_id).toBe(thread.thread_id);
      // no duplicate THREAD_CREATED for the race loser
      const events = await service.getEvents(ctx('ws-A'), thread.thread_id);
      expect(events?.filter((e) => e.type === 'THREAD_CREATED')).toHaveLength(1);
    });

    it('saveCheckpoint returns null for a thread owned by another workspace', async () => {
      const thread = await service.createThread(ctx('ws-A'), {});
      const saved = await service.saveCheckpoint(ctx('ws-B'), thread.thread_id, { checkpoint: { v: 1 } });
      expect(saved).toBeNull();
    });

    it('listThreads only returns caller workspace threads', async () => {
      await service.createThread(ctx('ws-A'), { title: 'A1' });
      await service.createThread(ctx('ws-B'), { title: 'B1' });
      await service.createThread(ctx('ws-A'), { title: 'A2' });
      const threadsA = await service.listThreads(ctx('ws-A'));
      const threadsB = await service.listThreads(ctx('ws-B'));
      expect(threadsA).toHaveLength(2);
      expect(threadsB).toHaveLength(1);
    });

    it('uses JWT wid claim when no X-Project-Id header present', async () => {
      const thread = await service.createThread(ctx('', 'wid-1'), {});
      expect(thread.workspace_id).toBe('wid-1');
      expect(await service.getThread(ctx('', 'wid-2'), thread.thread_id)).toBeNull();
    });

    it('invalid thread_id is never treated as owned (404 path)', async () => {
      expect(await service.getThread(ctx('ws-A'), 'not-a-uuid')).toBeNull();
      expect(await service.getMessages(ctx('ws-A'), 'not-a-uuid')).toBeNull();
      expect(await service.deleteThread(ctx('ws-A'), 'not-a-uuid')).toBe(false);
    });
  });

  describe('checkpoint roundtrip — IT-HYD-03 (backend logic)', () => {
    it('PUT then GET returns identical checkpoint + metadata + writes', async () => {
      const thread = await service.createThread(ctx('ws-A'), {});
      const payload = {
        checkpoint: { v: 1, channel_values: { messages: [{ role: 'user', content: 'hello' }] } },
        metadata: { source: 'langgraph', configurable: { thread_id: thread.thread_id } },
        newVersions: { channel: '1' },
        pendingWrites: [{ task_id: 't1', channel: 'messages', value: { role: 'assistant', content: 'hi' } }],
      };
      const saved = await service.saveCheckpoint(ctx('ws-A'), thread.thread_id, payload);
      const loaded = await service.getCheckpoint(ctx('ws-A'), thread.thread_id);
      expect(loaded).not.toBeNull();
      expect(loaded?.checkpoint).toEqual(payload.checkpoint);
      expect(loaded?.metadata).toEqual(payload.metadata);
      expect(loaded?.channel_versions).toEqual(payload.newVersions);
      expect(loaded?.pending_writes).toEqual(payload.pendingWrites);
      expect(loaded?.version).toBe(1);
      expect(saved?.thread_id).toBe(thread.thread_id);
    });

    it('successive writes append pending_writes and bump version', async () => {
      const thread = await service.createThread(ctx('ws-A'), {});
      await service.saveCheckpoint(ctx('ws-A'), thread.thread_id, { checkpoint: { v: 1 } });
      await service.saveCheckpoint(ctx('ws-A'), thread.thread_id, { writes: [{ task_id: 'w1', channel: 'x', value: 1 }] });
      const loaded = await service.getCheckpoint(ctx('ws-A'), thread.thread_id);
      expect(loaded?.version).toBe(2);
      expect(loaded?.checkpoint).toEqual({ v: 1 });
      expect(loaded?.pending_writes).toEqual([{ task_id: 'w1', channel: 'x', value: 1 }]);
    });

    it('messages passed with checkpoint are persisted for hydration', async () => {
      const thread = await service.createThread(ctx('ws-A'), {});
      await service.saveCheckpoint(ctx('ws-A'), thread.thread_id, {
        messages: [
          { id: 'm1', role: 'user', content: 'Hello from IDE 1' },
          { id: 'm2', role: 'assistant', content: 'Hello from IDE 2' },
        ],
      });
      const messages = await service.getMessages(ctx('ws-A'), thread.thread_id);
      expect(messages).toHaveLength(2);
      expect(messages?.[0].content).toBe('Hello from IDE 1');
      expect(messages?.[1].content).toBe('Hello from IDE 2');
      // idempotent — same message id is ignored
      await service.saveCheckpoint(ctx('ws-A'), thread.thread_id, { messages: [{ id: 'm1', role: 'user', content: 'dup' }] });
      expect(await service.getMessages(ctx('ws-A'), thread.thread_id)).toHaveLength(2);
    });
  });

  describe('deleteThread', () => {
    it('removes thread and all related projections', async () => {
      const thread = await service.createThread(ctx('ws-A'), { title: 'doomed' });
      await service.saveCheckpoint(ctx('ws-A'), thread.thread_id, { checkpoint: { v: 1 } });
      await service.addArtifact(ctx('ws-A'), thread.thread_id, { type: 'diagram', name: 'arch.png' });
      expect(await service.deleteThread(ctx('ws-A'), thread.thread_id)).toBe(true);
      expect(await service.getThread(ctx('ws-A'), thread.thread_id)).toBeNull();
      expect(await service.getCheckpoint(ctx('ws-A'), thread.thread_id)).toBeNull();
      expect(await service.getMessages(ctx('ws-A'), thread.thread_id)).toBeNull();
      expect(await service.getEvents(ctx('ws-A'), thread.thread_id)).toBeNull();
      expect(await service.getArtifacts(ctx('ws-A'), thread.thread_id)).toBeNull();
    });

    it('returns false for non-owned thread', async () => {
      const thread = await service.createThread(ctx('ws-A'), {});
      expect(await service.deleteThread(ctx('ws-B'), thread.thread_id)).toBe(false);
      expect(await service.getThread(ctx('ws-A'), thread.thread_id)).not.toBeNull();
    });
  });

  describe('agents registry', () => {
    it('upsertAgent registers agent and getAgents lists it', async () => {
      await service.upsertAgent({
        agent_id: 'dev-agent',
        name: 'Dev Agent',
        description: 'General dev agent',
        tools: ['bash'],
        mcp_servers: ['fs'],
        auto_approve: ['read'],
      });
      const agents = await service.getAgents();
      expect(agents).toHaveLength(1);
      expect(agents[0].tools).toEqual(['bash']);
      expect(agents[0].auto_approve).toEqual(['read']);
    });
  });

  describe('tool executions + artifacts', () => {
    it('addToolExecution stores a row scoped to workspace', async () => {
      const thread = await service.createThread(ctx('ws-A'), {});
      const exec = await service.addToolExecution(ctx('ws-A'), thread.thread_id, {
        tool_id: 'tid-1',
        name: 'read_file',
        status: 'success',
        input: { path: 'a.ts' },
        output: 'content',
      });
      expect(exec?.name).toBe('read_file');
      // cross-workspace call is rejected
      const denied = await service.addToolExecution(ctx('ws-B'), thread.thread_id, {
        tool_id: 'tid-2',
        name: 'write_file',
        status: 'running',
      });
      expect(denied).toBeNull();
    });
  });
});
