/**
 * SA4E-42 PBT-01..04 — property-based tests over a real better-sqlite3 DB.
 * Idempotency, scope isolation, prune convergence, and injection-safety of names.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import pino from 'pino';
import type Database from 'better-sqlite3';
import { makeTempDb } from '../../../../__tests__/sa4e-testkit.js';
import { ReindexService } from '../ReindexService.js';
import { FakeEmbedder, FakeToolSource } from './reindex-fakes.js';

const silent = pino({ level: 'silent' });
const RUNS = 15;

function serviceFor(db: Database.Database, src: FakeToolSource): ReindexService {
  return new ReindexService(() => db, new FakeEmbedder(), src, silent);
}

function namesOf(db: Database.Database, server: string): string[] {
  return (db.prepare('SELECT name FROM mcp_tools WHERE server = ? ORDER BY name').all(server) as { name: string }[])
    .map((r) => r.name);
}

const serverArb = fc.constantFrom('A', 'B', 'C');
const stateArb = fc.constantFrom('connected', 'disconnected', 'failed') as fc.Arbitrary<
  'connected' | 'disconnected' | 'failed'
>;

describe('reindex — property-based', () => {
  it('PBT-01: N connect events ≡ 1 connect event (idempotency)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.string({ minLength: 1, maxLength: 12 }), { maxLength: 12 }),
        fc.integer({ min: 1, max: 6 }),
        async (tools, n) => {
          const single = await runConnects(tools, 1);
          const many = await runConnects(tools, n);
          expect(many).toEqual(single);
          expect(many).toEqual([...tools].sort());
        },
      ),
      { numRuns: RUNS },
    );
  });

  it('PBT-02: no event on server X ever mutates another server or core rows', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.tuple(serverArb, stateArb), { minLength: 1, maxLength: 12 }),
        async (events) => {
          const tmp = makeTempDb();
          try {
            const db = tmp.dbManager.getDb();
            const src = seedThreeServers(db);
            const svc = serviceFor(db, src);
            for (const [server, state] of events) {
              src.setConnected(server, state === 'connected');
              if (state === 'connected') await svc.reindexConnected(server);
              else await svc.reindexRemoved(server);
              assertNoLeak(db);
            }
            const core = db.prepare('SELECT COUNT(*) c FROM mcp_tools WHERE server IS NULL').get() as any;
            expect(core.c).toBe(1);
          } finally {
            tmp.close();
          }
        },
      ),
      { numRuns: RUNS },
    );
  });

  it('PBT-03: prune converges to the current tool set', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.string({ minLength: 1, maxLength: 8 }), { minLength: 1, maxLength: 8 }),
        fc.uniqueArray(fc.string({ minLength: 1, maxLength: 8 }), { minLength: 1, maxLength: 8 }),
        async (initial, next) => {
          const tmp = makeTempDb();
          try {
            const db = tmp.dbManager.getDb();
            const src = new FakeToolSource();
            src.setConnected('S', true);
            const svc = serviceFor(db, src);
            src.setTools('S', initial);
            await svc.reindexConnected('S');
            src.setTools('S', next);
            await svc.reindexConnected('S');
            expect(namesOf(db, 'S')).toEqual([...next].sort());
          } finally {
            tmp.close();
          }
        },
      ),
      { numRuns: RUNS },
    );
  });

  it('PBT-04: adversarial tool names are stored as data; table intact (F-06)', async () => {
    const adversarial = [`x'); DROP TABLE mcp_tools;--`, 'a" OR "1"="1', "n\nl%_"];
    await fc.assert(
      fc.asyncProperty(fc.uniqueArray(fc.string({ minLength: 1, maxLength: 16 }), { maxLength: 6 }), async (extra) => {
        const tmp = makeTempDb();
        try {
          const db = tmp.dbManager.getDb();
          const src = new FakeToolSource();
          src.setConnected('S', true);
          const svc = serviceFor(db, src);
          const all = Array.from(new Set([...adversarial, ...extra]));
          src.setTools('S', all);
          await svc.reindexConnected('S');
          expect(namesOf(db, 'S')).toEqual([...all].sort());
          const tbl = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='mcp_tools'").get();
          expect(tbl).toBeDefined();
        } finally {
          tmp.close();
        }
      }),
      { numRuns: RUNS },
    );
  });
});

async function runConnects(tools: string[], n: number): Promise<string[]> {
  const tmp = makeTempDb();
  try {
    const db = tmp.dbManager.getDb();
    const src = new FakeToolSource();
    src.setTools('S', tools);
    src.setConnected('S', true);
    const svc = serviceFor(db, src);
    for (let i = 0; i < n; i++) await svc.reindexConnected('S');
    return namesOf(db, 'S');
  } finally {
    tmp.close();
  }
}

function seedThreeServers(db: Database.Database): FakeToolSource {
  const src = new FakeToolSource();
  src.setTools('A', ['a1', 'a2']);
  src.setTools('B', ['b1']);
  src.setTools('C', ['c1', 'c2', 'c3']);
  db.prepare('INSERT INTO mcp_tools (name, description, schema_json, category, server, vector) VALUES (?,?,?,?,?,?)')
    .run('core_tool', 'core', '{}', 'memory', null, null);
  return src;
}

function assertNoLeak(db: Database.Database): void {
  const bad = db.prepare(
    "SELECT COUNT(*) c FROM mcp_tools WHERE server IS NOT NULL AND server NOT IN ('A','B','C')",
  ).get() as any;
  expect(bad.c).toBe(0);
}
