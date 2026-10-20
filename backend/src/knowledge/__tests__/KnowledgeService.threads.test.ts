/**
 * SA4E-85 — KnowledgeService unit tests: thread creation (PBT-HYD-01
 * contract) and workspace binding (#18).
 * Split from KnowledgeService.test.ts to keep each file under the CI
 * line-count gate (<=200 lines). No logic changed — tests only relocated.
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
});
