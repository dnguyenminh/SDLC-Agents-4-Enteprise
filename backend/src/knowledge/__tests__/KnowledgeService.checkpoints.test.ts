/**
 * SA4E-85 — KnowledgeService unit tests: checkpoint roundtrip (IT-HYD-03
 * backend logic), DELETE cascade, agents registry, tool executions.
 * Split from KnowledgeService.test.ts to keep each file under the CI
 * line-count gate (<=200 lines). No logic changed — tests only relocated.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import pino from 'pino';
import { KnowledgeDb } from '../KnowledgeDb.js';
import { KnowledgeService } from '../KnowledgeService.js';
import { createProjectContext } from '../../modules/memory/ProjectContext.js';

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
