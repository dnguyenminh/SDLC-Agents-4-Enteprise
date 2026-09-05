/**
 * SA4E-42 PBT-01..04 — property-based tests over a real better-sqlite3 DB.
 * Idempotency, scope isolation, prune convergence, and injection-safety of names.
 */
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import pino from 'pino';
import { SqliteAdapter } from '../../../../database/adapters/SqliteAdapter.js';
import { SCHEMA_V1 } from '../../../../engine/db/schema.js';
import { ReindexService } from '../ReindexService.js';
import { FakeEmbedder, FakeToolSource } from './reindex-fakes.js';

const silent = pino({ level: 'silent' });
const RUNS = 15;

async function createAdapter(): Promise<SqliteAdapter> {
  const adapter = new SqliteAdapter(':memory:');
  await adapter.connect();
  await adapter.exec(SCHEMA_V1);
  return adapter;
}

function serviceFor(adapter: SqliteAdapter, src: FakeToolSource): ReindexService {
  return new ReindexService(() => adapter, new FakeEmbedder(), src, silent);
}

async function namesOf(adapter: SqliteAdapter, server: string): Promise<string[]> {
  const rows = await adapter.all<{ name: string }>('SELECT name FROM mcp_tools WHERE server = ? ORDER BY name', [server]);
  return rows.map((r) => r.name);
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
          const adapter = await createAdapter();
          try {
            const src = await seedThreeServers(adapter);
            const svc = serviceFor(adapter, src);
            for (const [server, state] of events) {
              src.setConnected(server, state === 'connected');
              if (state === 'connected') await svc.reindexConnected(server);
              else await svc.reindexRemoved(server);
              await assertNoLeak(adapter);
            }
            const core = await adapter.get<{ c: number }>('SELECT COUNT(*) c FROM mcp_tools WHERE server IS NULL');
            expect(core?.c).toBe(1);
          } finally {
            await adapter.disconnect();
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
          const adapter = await createAdapter();
          try {
            const src = new FakeToolSource();
            src.setConnected('S', true);
            const svc = serviceFor(adapter, src);
            src.setTools('S', initial);
            await svc.reindexConnected('S');
            src.setTools('S', next);
            await svc.reindexConnected('S');
            expect(await namesOf(adapter, 'S')).toEqual([...next].sort());
          } finally {
            await adapter.disconnect();
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
        const adapter = await createAdapter();
        try {
          const src = new FakeToolSource();
          src.setConnected('S', true);
          const svc = serviceFor(adapter, src);
          const all = Array.from(new Set([...adversarial, ...extra]));
          src.setTools('S', all);
          await svc.reindexConnected('S');
          expect(await namesOf(adapter, 'S')).toEqual([...all].sort());
          const tbl = await adapter.get('SELECT name FROM sqlite_master WHERE type=\'table\' AND name=\'mcp_tools\'');
          expect(tbl).toBeDefined();
        } finally {
          await adapter.disconnect();
        }
      }),
      { numRuns: RUNS },
    );
  });
});

async function runConnects(tools: string[], n: number): Promise<string[]> {
  const adapter = await createAdapter();
  try {
    const src = new FakeToolSource();
    src.setTools('S', tools);
    src.setConnected('S', true);
    const svc = serviceFor(adapter, src);
    for (let i = 0; i < n; i++) await svc.reindexConnected('S');
    return await namesOf(adapter, 'S');
  } finally {
    await adapter.disconnect();
  }
}

async function seedThreeServers(adapter: SqliteAdapter): Promise<FakeToolSource> {
  const src = new FakeToolSource();
  src.setTools('A', ['a1', 'a2']);
  src.setTools('B', ['b1']);
  src.setTools('C', ['c1', 'c2', 'c3']);
  await adapter.run('INSERT INTO mcp_tools (name, description, schema_json, category, server, vector) VALUES (?,?,?,?,?,?)', ['core_tool', 'core', '{}', 'memory', null, null]);
  return src;
}

async function assertNoLeak(adapter: SqliteAdapter): Promise<void> {
  const bad = await adapter.get<{ c: number }>("SELECT COUNT(*) c FROM mcp_tools WHERE server IS NOT NULL AND server NOT IN ('A','B','C')");
  expect(bad?.c).toBe(0);
}
