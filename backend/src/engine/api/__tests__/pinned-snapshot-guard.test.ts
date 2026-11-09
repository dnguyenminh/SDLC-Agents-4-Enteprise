/**
 * SA4E-426 — API pinned snapshot enforcement tests (16K Doc §17/§11).
 * Missing/mismatched snapshot → 400; session pin immutable across branch head
 * moves (AC #3); branch is display metadata only.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Hono } from 'hono';
import type { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { AgentPersistenceService } from '../../agent/agent-persistence.js';
import { SnapshotRetrievalService } from '../../retrieval/snapshot-retrieval.js';
import { makeRetrievalDb, P } from '../../retrieval/__tests__/retrieval-fixtures.js';
import {
  PinValidationError,
  pinnedSnapshotGuard,
  resolvePinnedContext,
  type PinnedApiEnv,
} from '../pinned-snapshot-guard.js';

describe('SA4E-426 API pinned snapshot enforcement', () => {
  let adapter: SqliteAdapter;
  let svc: SnapshotRetrievalService;
  let sessionId: string;

  beforeEach(async () => {
    adapter = await makeRetrievalDb();
    svc = new SnapshotRetrievalService(adapter as any);
    sessionId = await new AgentPersistenceService(adapter as any).createSession(P, 'r1', 'c1', 'S1');
  });
  afterEach(async () => {
    if (adapter.isConnected()) await adapter.disconnect();
  });

  function app() {
    const api = new Hono<PinnedApiEnv>();
    api.post('/api/v1/agent/search', pinnedSnapshotGuard(adapter as any, svc), (c) =>
      c.json({ data: { pinned: c.get('pinned'), body: c.get('pinnedBody') }, error: null }),
    );
    return api;
  }

  function post(body: unknown) {
    return app().request('/api/v1/agent/search', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  it('rejects missing session_id / index_snapshot_id (400 contract)', async () => {
    await expect(resolvePinnedContext(adapter as any, svc, { index_snapshot_id: 'S1' }))
      .rejects.toMatchObject({ code: 'SESSION_ID_REQUIRED', status: 400 });
    await expect(resolvePinnedContext(adapter as any, svc, { session_id: sessionId }))
      .rejects.toMatchObject({ code: 'SNAPSHOT_ID_REQUIRED', status: 400 });
    await expect(resolvePinnedContext(adapter as any, svc, { session_id: sessionId, index_snapshot_id: '  ' }))
      .rejects.toMatchObject({ code: 'SNAPSHOT_ID_REQUIRED' });
    await expect(resolvePinnedContext(adapter as any, svc, null))
      .rejects.toBeInstanceOf(PinValidationError);
  });

  it('rejects unknown session, mismatched snapshot, and non-READY snapshot', async () => {
    await expect(resolvePinnedContext(adapter as any, svc, { session_id: 'nope', index_snapshot_id: 'S1' }))
      .rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });
    await expect(resolvePinnedContext(adapter as any, svc, { session_id: sessionId, index_snapshot_id: 'S2' }))
      .rejects.toMatchObject({ code: 'SNAPSHOT_MISMATCH' });
    // a session pinned to a FAILED snapshot cannot retrieve
    adapter.exec(`INSERT INTO chat_session (id, project_id, repository_id, commit_id, pinned_code_index_snapshot_id)
                 VALUES ('cs-failed', '${P}', 'r1', 'c1', 'S3')`);
    await expect(resolvePinnedContext(adapter as any, svc, { session_id: 'cs-failed', index_snapshot_id: 'S3' }))
      .rejects.toMatchObject({ code: 'SNAPSHOT_NOT_READY' });
  });

  it('valid request resolves the session pin; branch is echoed display metadata only', async () => {
    const ctx = await resolvePinnedContext(adapter as any, svc, {
      session_id: sessionId,
      index_snapshot_id: 'S1',
      branch: 'refs/heads/main',
    });
    expect(ctx).toEqual({
      sessionId,
      repositoryId: 'r1',
      commitId: 'c1',
      indexSnapshotId: 'S1',
      branch: 'refs/heads/main',
    });
  });

  it('middleware: 400 with error envelope on missing/mismatch, 200 + context on valid', async () => {
    const missing = await post({ session_id: sessionId });
    expect(missing.status).toBe(400);
    expect(await missing.json()).toMatchObject({ data: null, error: { code: 'SNAPSHOT_ID_REQUIRED' } });

    const mismatch = await post({ session_id: sessionId, index_snapshot_id: 'S2' });
    expect(mismatch.status).toBe(400);
    expect(await mismatch.json()).toMatchObject({ data: null, error: { code: 'SNAPSHOT_MISMATCH' } });

    const ok = await post({ session_id: sessionId, index_snapshot_id: 'S1', query: 'auth' });
    expect(ok.status).toBe(200);
    const payload = await ok.json();
    expect(payload.data.pinned.indexSnapshotId).toBe('S1');
    expect(payload.data.body.query).toBe('auth'); // body cached for the handler
  });

  it('integration AC #3: branch head moves, pinned old commit still queries S1', async () => {
    // new commit c2 + snapshot S4 on the branch head
    adapter.exec(`
      INSERT INTO git_commit (id, project_id, repository_id, commit_sha) VALUES ('c2', '${P}', 'r1', 'sha-2');
      INSERT INTO code_index_snapshot (id, project_id, repository_id, commit_id, config_fingerprint, code_model_version, status)
        VALUES ('S4', '${P}', 'r1', 'c2', 'fp4', 'v1', 'READY');
      INSERT INTO source_file_revision (id, project_id, repository_id, commit_id, relative_path, content_hash, language, line_count)
        VALUES ('f1c2', '${P}', 'r1', 'c2', 'src/auth.ts', 'h1c2', 'typescript', 50);
      INSERT INTO code_symbol (id, project_id, snapshot_id, sfr_id, name, kind, start_line, end_line)
        VALUES ('symAuth4', '${P}', 'S4', 'f1c2', 'AuthService', 'class', 1, 50);
      UPDATE repository_ref_index_state SET active_code_index_snapshot_id = 'S4', generation = generation + 1
        WHERE repository_id = 'r1' AND ref_name = 'refs/heads/main';
    `);
    // branch head really moved
    await expect(svc.resolveActiveSnapshot('r1', 'refs/heads/main')).resolves.toMatchObject({ id: 'S4', commitId: 'c2' });

    // the session pin is immutable: still resolves S1/c1
    const ctx = await resolvePinnedContext(adapter as any, svc, {
      session_id: sessionId,
      index_snapshot_id: 'S1',
      branch: 'refs/heads/main',
    });
    expect(ctx).toMatchObject({ indexSnapshotId: 'S1', commitId: 'c1' });

    // queries still hit the OLD snapshot only
    const hits = await svc.symbolByName(ctx.indexSnapshotId, 'AuthService');
    expect(hits.map((h) => h.id)).toEqual(['symAuth']);
    const headHits = await svc.symbolByName('S4', 'AuthService');
    expect(headHits.map((h) => h.id)).toEqual(['symAuth4']); // drift would have shown symAuth4

    // asking for the new head snapshot against the old session is rejected
    await expect(resolvePinnedContext(adapter as any, svc, { session_id: sessionId, index_snapshot_id: 'S4' }))
      .rejects.toMatchObject({ code: 'SNAPSHOT_MISMATCH' });
  });
});
