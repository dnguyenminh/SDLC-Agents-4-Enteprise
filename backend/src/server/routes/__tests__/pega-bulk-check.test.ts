/**
 * SA4E-241 — bulk-check route tests (Hono app.request + real SQLite :memory:).
 * Covers IC-03/IC-04 (contract, backend does not hash), SEC-01a/b/c (identity),
 * SEC-04 (zod validation), SEC-10 (cross-tenant isolation), and SEC-02 (mutation
 * scope via clear-project).
 *
 * A lightweight middleware simulates jwtAuth by injecting `projectContext` from
 * the X-Project-Id header (matching production behaviour) so we can exercise the
 * identity-binding branches without the full JWT stack.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import { createPegaApiRoutes } from '../pega-api.js';
import { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { MemoryEngine } from '../../../modules/memory/engine/core.js';

const SCHEMA = `
CREATE TABLE knowledge_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT, content TEXT, summary TEXT, type TEXT, tier TEXT,
  scope TEXT, user_id TEXT, project_id TEXT, source TEXT, source_ref TEXT, tags TEXT,
  confidence REAL DEFAULT 1.0, agent_name TEXT, owner TEXT, enrichment_status TEXT,
  structured_map TEXT, archived INTEGER DEFAULT 0, expires_at TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE files (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT, path TEXT, relative_path TEXT,
  language TEXT, module TEXT, content_hash TEXT, size_bytes INTEGER, line_count INTEGER,
  UNIQUE(project_id, path)
);
CREATE TABLE symbols (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT, file_id INTEGER, name TEXT,
  kind TEXT, signature TEXT, start_line INTEGER, end_line INTEGER
);
CREATE TABLE graph_nodes (
  entry_id TEXT PRIMARY KEY, label TEXT, type TEXT, tier TEXT, project_id TEXT,
  x REAL, y REAL, z REAL, level TEXT, cluster_id TEXT
);
`;

const H1 = 'a'.repeat(64);
const H2 = 'b'.repeat(64);
const H3 = 'c'.repeat(64);
const CCCC = 'e'.repeat(64);
const URL = '/api/v1/pega/rulecatalog/bulk-check';

let adapter: SqliteAdapter;
let app: Hono;

async function seedHash(projectId: string, hash: string, n: number): Promise<void> {
  await adapter.runAsync(
    'INSERT INTO files (project_id, path, relative_path, language, content_hash, size_bytes, line_count) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [projectId, `/p/${projectId}/${n}`, `${n}.ts`, 'pega', hash, 10, 1],
  );
}

function post(body: unknown, projectId?: string): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (projectId) { headers['X-Project-Id'] = projectId; }
  return app.request(URL, { method: 'POST', headers, body: JSON.stringify(body) });
}

beforeEach(async () => {
  adapter = new SqliteAdapter(':memory:');
  await adapter.connect();
  await adapter.execAsync(SCHEMA);
  const engine = new MemoryEngine(adapter);
  const registry = {
    getModule: (name: string) => (name === 'memory' ? { status: 'ready', getEngine: () => engine } : null),
  } as any;
  const logger = { error: () => {}, info: () => {}, warn: () => {}, debug: () => {} } as any;
  app = new Hono();
  // Simulate jwtAuth: inject identity from X-Project-Id when present.
  app.use('/api/v1/pega/*', async (c, next) => {
    const pid = c.req.header('X-Project-Id');
    if (pid) { c.set('projectContext' as never, { projectId: pid, userId: 'test' } as never); }
    return next();
  });
  app.route('/api/v1', createPegaApiRoutes(registry, logger));
});

afterEach(async () => { await adapter.disconnect(); });

describe('POST /pega/rulecatalog/bulk-check (SA4E-241)', () => {
  it('IC-03/API-01: returns existing subset for the identity project', async () => {
    await seedHash('PegaCollProj', H1, 1);
    await seedHash('PegaCollProj', H2, 2);
    const res = await post({ projectId: 'PegaCollProj', checksums: [H1, H2, H3] }, 'PegaCollProj');
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.error).toBeNull();
    expect(body.data.existing.sort()).toEqual([H1, H2].sort());
  });

  it('API-02/SEC-01a: missing identity → 401 MISSING_PROJECT_IDENTITY', async () => {
    const res = await post({ projectId: 'PegaCollProj', checksums: [H1] }); // no X-Project-Id
    expect(res.status).toBe(401);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('MISSING_PROJECT_IDENTITY');
  });

  it('API-03/SEC-01b: body.projectId ≠ identity → 403 PROJECT_MISMATCH', async () => {
    const res = await post({ projectId: 'OtherProj', checksums: [H1] }, 'PegaCollProj');
    expect(res.status).toBe(403);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('PROJECT_MISMATCH');
  });

  it('API-04/SEC-01c/SEC-10: existing scoped to identity — no cross-tenant leak', async () => {
    await seedHash('PegaCollProj', H1, 1);
    await seedHash('OtherProj', H1, 1);   // same value, different project
    await seedHash('OtherProj', CCCC, 2); // only in OtherProj
    const res = await post({ checksums: [H1, CCCC] }, 'PegaCollProj');
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data.existing).toEqual([H1]);
    expect(body.data.existing).not.toContain(CCCC);
  });

  it('API-06/SEC-04: invalid projectId regex → 400 VALIDATION_FAILED', async () => {
    const res = await post({ projectId: 'bad id!@#', checksums: [H1] }, 'PegaCollProj');
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('VALIDATION_FAILED');
  });

  it('API-07/SEC-04: non-hex checksum → 400 VALIDATION_FAILED', async () => {
    const res = await post({ checksums: ['ZZZZ_not_hex', H1] }, 'PegaCollProj');
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe('VALIDATION_FAILED');
  });

  it('API-08/SEC-04: boundary 5000 OK, 5001 → 400', async () => {
    const mk = (n: number) => Array.from({ length: n }, (_, i) => i.toString(16).padStart(64, '0'));
    const ok = await post({ checksums: mk(5000) }, 'PegaCollProj');
    expect(ok.status).toBe(200);
    const over = await post({ checksums: mk(5001) }, 'PegaCollProj');
    expect(over.status).toBe(400);
    expect(((await over.json()) as any).error.code).toBe('VALIDATION_FAILED');
  });

  it('SEC-04: empty checksums array → 400', async () => {
    const res = await post({ checksums: [] }, 'PegaCollProj');
    expect(res.status).toBe(400);
  });

  it('IC-04: backend route source contains no checksum computation', async () => {
    // Grep-style guard: the bulk-check store/route must not compute hashes.
    const fs = await import('node:fs');
    const path = await import('node:path');
    const storeSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/modules/pega/ChecksumStore.ts'), 'utf-8');
    expect(storeSrc).not.toMatch(/createHash|hash-object/);
  });
});

describe('POST /pega/clear-project (SA4E-241 SEC-02)', () => {
  it('SEC-02: missing identity → 401', async () => {
    const res = await app.request('/api/v1/pega/clear-project', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });

  it('SEC-02: body.projectId ≠ identity → 403', async () => {
    const res = await app.request('/api/v1/pega/clear-project', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Project-Id': 'PegaCollProj' },
      body: JSON.stringify({ projectId: 'OtherProj' }),
    });
    expect(res.status).toBe(403);
  });

  it('SEC-02: mutation scoped to identity only — other tenant untouched', async () => {
    await seedHash('PegaCollProj', H1, 1);
    await seedHash('OtherProj', H2, 1);
    const res = await app.request('/api/v1/pega/clear-project', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Project-Id': 'OtherProj' },
      body: JSON.stringify({ projectId: 'OtherProj' }),
    });
    expect(res.status).toBe(200);
    const store = new (await import('../../../modules/pega/ChecksumStore.js')).ChecksumStore(adapter);
    // PegaCollProj data must still be present (not cross-tenant deleted).
    expect(await store.findExisting('PegaCollProj', [H1])).toEqual([H1]);
    // OtherProj's own pega files were cleared (scoped to authenticated identity).
    expect(await store.findExisting('OtherProj', [H2])).toEqual([]);
  });

  it('SEC-02: clear-project SQL has no hard-coded PegaCollProj OR clause', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.resolve(process.cwd(), 'src/server/routes/pega-api.ts'), 'utf-8');
    expect(src).not.toMatch(/OR project_id = 'PegaCollProj'/);
  });
});
