/**
 * SA4E-85 — PBT-HYD-01: thread_id from Backend KB createThread always UUID v4.
 * Property-based testing with fast-check (500 runs, per STC).
 * STC: PBT-HYD-01 — thread_id always valid UUID v4 format.
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import pino from 'pino';
import { KnowledgeDb } from '../KnowledgeDb.js';
import { KnowledgeService } from '../KnowledgeService.js';
import { createProjectContext } from '../../modules/memory/ProjectContext.js';
import { isUuidV4, UUID_V4_REGEX } from '../models.js';

const logger = pino({ level: 'silent' });

describe('PBT-HYD-01 — backend thread_id always valid UUID v4', () => {
  it('holds for 500 random createThread inputs', async () => {
    const db = await KnowledgeDb.createInMemory();
    const service = new KnowledgeService(db, logger);
    const ctx = createProjectContext('pbt-ws', 'pbt-user');

    await fc.assert(
      fc.asyncProperty(
        fc.string({ maxLength: 64 }),
        fc.string({ maxLength: 32 }),
        fc.boolean(),
        async (title, agentId, hasAgent) => {
          const thread = await service.createThread(ctx, {
            title,
            agent_id: hasAgent ? agentId : null,
          });
          expect(thread.thread_id).toMatch(UUID_V4_REGEX);
          expect(isUuidV4(thread.thread_id)).toBe(true);
        },
      ),
      { numRuns: 500 },
    );
  });

  it('thread ids are unique across creations', async () => {
    const db = await KnowledgeDb.createInMemory();
    const service = new KnowledgeService(db, logger);
    const ctx = createProjectContext('pbt-ws', 'pbt-user');
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const thread = await service.createThread(ctx, {});
      ids.add(thread.thread_id);
    }
    expect(ids.size).toBe(100);
  });

  it('invalid thread_id strings are rejected by accessors', async () => {
    const db = await KnowledgeDb.createInMemory();
    const service = new KnowledgeService(db, logger);
    const ctx = createProjectContext('pbt-ws', 'pbt-user');
    await fc.assert(
      fc.asyncProperty(fc.string({ maxLength: 100 }), async (badId) => {
        fc.pre(!UUID_V4_REGEX.test(badId));
        expect(await service.getThread(ctx, badId)).toBeNull();
        expect(await service.getMessages(ctx, badId)).toBeNull();
        expect(await service.getCheckpoint(ctx, badId)).toBeNull();
      }),
      { numRuns: 500 },
    );
  });
});
