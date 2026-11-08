/**
 * SA4E-413 Migration V6 tests — 16K data model (CR-01..06).
 * Verifies: all entities created, idempotency, snapshot-flow integration,
 * same-snapshot ownership triggers, CHECK/UNIQUE invariants, FTS5, and that
 * legacy tables are untouched (additive-only).
 * Runs on an isolated in-memory DB (never the live index.db).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { applyMigrationV6, V6_TABLES } from '../migration-v6.js';

const P = 'proj1';

/** schema_version table exists from V1 in real DBs — seed it for the migration write. */
const SEED_SCHEMA_VERSION = `
CREATE TABLE schema_version (version INTEGER PRIMARY KEY, applied_at TEXT DEFAULT (datetime('now')));
INSERT INTO schema_version (version) VALUES (5);
`;

function seedBase(a: SqliteAdapter): void {
  a.exec(`
    INSERT INTO repository (id, project_id, origin_url, display_name)
      VALUES ('r1', '${P}', 'https://x/repo.git', 'repo');
    INSERT INTO git_commit (id, project_id, repository_id, commit_sha, committed_at)
      VALUES ('c1', '${P}', 'r1', 'aaaa1111', '2026-11-08T00:00:00Z'),
             ('c2', '${P}', 'r1', 'bbbb2222', '2026-11-08T01:00:00Z');
    INSERT INTO git_commit_parent (project_id, commit_id, parent_commit_id, parent_order)
      VALUES ('${P}', 'c2', 'c1', 0);
    INSERT INTO source_file_revision (id, project_id, repository_id, commit_id, relative_path, content_hash, language, line_count)
      VALUES ('f1', '${P}', 'r1', 'c1', 'src/auth.ts', 'hash-a', 'typescript', 42),
             ('f2', '${P}', 'r1', 'c2', 'src/auth.ts', 'hash-b', 'typescript', 50);
    INSERT INTO code_index_snapshot (id, project_id, repository_id, commit_id, config_fingerprint, code_model_version, status)
      VALUES ('S1', '${P}', 'r1', 'c1', 'fp1', 'v1', 'READY'),
             ('S2', '${P}', 'r1', 'c1', 'fp2', 'v1', 'READY'),
             ('S3', '${P}', 'r1', 'c2', 'fp1', 'v1', 'READY');
    INSERT INTO code_module (id, project_id, snapshot_id, name, root_path, language)
      VALUES ('m1', '${P}', 'S1', 'src', 'src', 'typescript');
    INSERT INTO code_symbol (id, project_id, snapshot_id, sfr_id, name, kind, start_line, end_line)
      VALUES ('sym-p1', '${P}', 'S1', 'f1', 'AuthService', 'class', 1, 42),
             ('sym-x1', '${P}', 'S2', 'f1', 'OtherClass', 'class', 1, 10);
  `);
}

describe('SA4E-413 Migration V6 — 16K data model', () => {
  let adapter: SqliteAdapter;
  beforeEach(async () => {
    adapter = new SqliteAdapter(':memory:');
    await adapter.connect();
    adapter.exec(SEED_SCHEMA_VERSION);
  });
  afterEach(async () => {
    if (adapter.isConnected()) await adapter.disconnect();
  });

  it('creates all 16K entities (AC: all 6 entity groups with FK/CHECK)', async () => {
    await applyMigrationV6(adapter as any);
    for (const t of V6_TABLES) {
      const cols = adapter.all<{ name: string }>(`PRAGMA table_info(${t})`);
      expect(cols.length, `table ${t} must exist with columns`).toBeGreaterThan(0);
    }
    // FTS5 shadow table present
    const fts = adapter.get<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='code_chunk_fts'`,
    );
    expect(fts?.name).toBe('code_chunk_fts');
  });

  it('bumps schema_version to 6 and is idempotent on re-run', async () => {
    await applyMigrationV6(adapter as any);
    expect(adapter.get<{ v: number }>('SELECT MAX(version) as v FROM schema_version')?.v).toBe(6);
    await expect(applyMigrationV6(adapter as any)).resolves.not.toThrow();
    expect(adapter.get<{ v: number }>('SELECT MAX(version) as v FROM schema_version')?.v).toBe(6);
  });

  it('snapshot-flow integration: repo→commit→snapshot→artifacts→agent, query by snapshot_id', async () => {
    await applyMigrationV6(adapter as any);
    seedBase(adapter);
    adapter.exec(`
      INSERT INTO code_symbol (id, project_id, snapshot_id, sfr_id, parent_id, module_id, name, kind, start_line, end_line)
        VALUES ('sym-c1', '${P}', 'S1', 'f1', 'sym-p1', 'm1', 'login', 'method', 10, 20);
      INSERT INTO code_chunk (id, project_id, snapshot_id, symbol_id, sfr_id, chunk_index, start_line, end_line, content_ref, token_count)
        VALUES ('ch1', '${P}', 'S1', 'sym-c1', 'f1', 0, 10, 20, 'blob://f1#0', 120);
      INSERT INTO code_chunk_fts (chunk_id, content) VALUES ('ch1', 'login authorization handler implementation');
      INSERT INTO embedding_set (id, project_id, code_index_snapshot_id, model_key, model_version, dimensions, preprocessing_version, tokenizer_version, chunker_version)
        VALUES ('e1', '${P}', 'S1', 'local-minilm', '1.0', 384, 'pre1', 'tok1', 'chk1');
      INSERT INTO code_embedding (project_id, embedding_set_id, chunk_id, embedding)
        VALUES ('${P}', 'e1', 'ch1', X'00');
      INSERT INTO repository_ref_index_state (project_id, repository_id, ref_name, active_code_index_snapshot_id, generation)
        VALUES ('${P}', 'r1', 'refs/heads/main', 'S1', 1);
      INSERT INTO chat_session (id, project_id, repository_id, commit_id, pinned_code_index_snapshot_id, model_config_snapshot)
        VALUES ('cs1', '${P}', 'r1', 'c1', 'S1', '{"model":"test"}');
      INSERT INTO agent_run (id, project_id, chat_session_id, started_at, status)
        VALUES ('ar1', '${P}', 'cs1', '2026-11-08T02:00:00Z', 'RUNNING');
      INSERT INTO agent_plan (id, project_id, agent_run_id, version, objective, status)
        VALUES ('ap1', '${P}', 'ar1', 0, 'implement login', 'APPROVED');
      INSERT INTO agent_step (id, project_id, agent_run_id, plan_id, step_index, dependency_ids, status)
        VALUES ('as1', '${P}', 'ar1', 'ap1', 0, '[]', 'DONE');
      INSERT INTO agent_state_transition (id, project_id, agent_run_id, old_state, new_state, reason)
        VALUES ('at1', '${P}', 'ar1', 'PLANNING', 'EXECUTING', 'plan approved');
      INSERT INTO agent_tool_execution (id, project_id, agent_run_id, step_id, tool_name, status)
        VALUES ('atx1', '${P}', 'ar1', 'as1', 'search_symbols', 'OK');
      INSERT INTO retrieval_evidence (id, project_id, agent_run_id, snapshot_id, query, score)
        VALUES ('re1', '${P}', 'ar1', 'S1', 'where is login handled', 0.87);
      INSERT INTO agent_workspace (id, project_id, agent_run_id, path, purpose)
        VALUES ('aw1', '${P}', 'ar1', '/tmp/ws/ar1', 'scratchpad');
      INSERT INTO change_set (id, project_id, agent_run_id, base_commit_id, summary, status)
        VALUES ('chg1', '${P}', 'ar1', 'c1', 'add login', 'OPEN');
      INSERT INTO approval_request (id, project_id, agent_run_id, action, scope, proposed_changeset_id, requested_user, decision)
        VALUES ('apr1', '${P}', 'ar1', 'write_file', 'src/auth.ts', 'chg1', 'user1', 'PENDING');
      INSERT INTO execution_run (id, project_id, agent_run_id, change_set_id, command, exit_code)
        VALUES ('ex1', '${P}', 'ar1', 'chg1', 'apply patch', 0);
    `);

    // query artifacts pinned to snapshot S1
    const syms = adapter.all<{ name: string }>(
      `SELECT name FROM code_symbol WHERE snapshot_id = 'S1' ORDER BY name`,
    );
    expect(syms.map((r) => r.name)).toEqual(['AuthService', 'login']);
    const chunks = adapter.all<{ id: string }>(
      `SELECT c.id FROM code_chunk c JOIN code_symbol s ON c.symbol_id = s.id
       WHERE c.snapshot_id = 'S1' AND s.name = 'login'`,
    );
    expect(chunks.map((r) => r.id)).toEqual(['ch1']);
    // FTS over chunk content
    const fts = adapter.all<{ chunk_id: string }>(
      `SELECT chunk_id FROM code_chunk_fts WHERE code_chunk_fts MATCH 'authorization'`,
    );
    expect(fts.map((r) => r.chunk_id)).toContain('ch1');
    // embedding linked through set → chunk
    const emb = adapter.get<{ dimensions: number }>(
      `SELECT es.dimensions FROM code_embedding ce JOIN embedding_set es ON ce.embedding_set_id = es.id
       WHERE ce.chunk_id = 'ch1'`,
    );
    expect(emb?.dimensions).toBe(384);
    // active pointer resolves to snapshot
    const ptr = adapter.get<{ active: string }>(
      `SELECT active_code_index_snapshot_id AS active FROM repository_ref_index_state WHERE ref_name = 'refs/heads/main'`,
    );
    expect(ptr?.active).toBe('S1');
  });

  it('rejects cross-snapshot ownership (same-snapshot invariant)', async () => {
    await applyMigrationV6(adapter as any);
    seedBase(adapter);
    // parent from S2, child in S1 → trigger must abort
    expect(() =>
      adapter.run(
        `INSERT INTO code_symbol (id, project_id, snapshot_id, parent_id, name, kind, start_line, end_line)
         VALUES ('sym-bad', '${P}', 'S1', 'sym-x1', 'Bad', 'method', 1, 2)`,
      ),
    ).toThrow(/same snapshot/);
    // module from S1, but symbol references module with mismatched snapshot is caught on child insert
    expect(() =>
      adapter.run(
        `INSERT INTO code_symbol (id, project_id, snapshot_id, module_id, name, kind, start_line, end_line)
         VALUES ('sym-bad2', '${P}', 'S2', 'm1', 'Bad2', 'method', 1, 2)`,
      ),
    ).toThrow(/same snapshot/);
    // relationship to_symbol from another snapshot
    adapter.exec(
      `INSERT INTO symbol_relationship (id, project_id, snapshot_id, from_symbol_id, kind, confidence)
       VALUES ('rel-bad', '${P}', 'S1', 'sym-p1', 'CALLS', 0.9)`,
    );
    expect(() =>
      adapter.run(
        `UPDATE symbol_relationship SET to_symbol_id = 'sym-x1' WHERE id = 'rel-bad'`,
      ),
    ).toThrow(/same snapshot/);
  });

  it('rejects chat_session pin mismatch (pinned snapshot ≠ repository/commit)', async () => {
    await applyMigrationV6(adapter as any);
    seedBase(adapter);
    // S3 belongs to (r1, c2) — pinning it on a session for (r1, c1) must abort
    expect(() =>
      adapter.run(
        `INSERT INTO chat_session (id, project_id, repository_id, commit_id, pinned_code_index_snapshot_id)
         VALUES ('cs-bad', '${P}', 'r1', 'c1', 'S3')`,
      ),
    ).toThrow(/pin/);
    // valid pin inserts fine, then re-pinning to a mismatched snapshot aborts
    adapter.exec(
      `INSERT INTO chat_session (id, project_id, repository_id, commit_id, pinned_code_index_snapshot_id)
       VALUES ('cs-ok', '${P}', 'r1', 'c1', 'S1')`,
    );
    expect(() =>
      adapter.run(`UPDATE chat_session SET pinned_code_index_snapshot_id = 'S3' WHERE id = 'cs-ok'`),
    ).toThrow(/pin/);
  });

  it('enforces CHECK constraints (ranges, enums)', async () => {
    await applyMigrationV6(adapter as any);
    seedBase(adapter);
    // end_line < start_line
    expect(() =>
      adapter.run(
        `INSERT INTO code_symbol (id, project_id, snapshot_id, sfr_id, name, kind, start_line, end_line)
         VALUES ('sym-neg', '${P}', 'S1', 'f1', 'X', 'function', 20, 10)`,
      ),
    ).toThrow();
    // confidence out of [0,1]
    expect(() =>
      adapter.run(
        `INSERT INTO symbol_occurrence (id, project_id, snapshot_id, symbol_id, sfr_id, kind, line, confidence)
         VALUES ('occ-bad', '${P}', 'S1', 'sym-p1', 'f1', 'DEF', 5, 2.0)`,
      ),
    ).toThrow();
    // invalid snapshot status
    expect(() =>
      adapter.run(
        `INSERT INTO code_index_snapshot (id, project_id, repository_id, commit_id, config_fingerprint, code_model_version, status)
         VALUES ('S9', '${P}', 'r1', 'c1', 'fp9', 'v1', 'READY_X')`,
      ),
    ).toThrow();
  });

  it('enforces UNIQUE constraints (source_file_revision per commit)', async () => {
    await applyMigrationV6(adapter as any);
    seedBase(adapter);
    expect(() =>
      adapter.run(
        `INSERT INTO source_file_revision (id, project_id, repository_id, commit_id, relative_path, content_hash)
         VALUES ('f1-dup', '${P}', 'r1', 'c1', 'src/auth.ts', 'hash-x')`,
      ),
    ).toThrow();
  });

  it('is additive-only: legacy tables are untouched (AC: no regression)', async () => {
    adapter.exec(`
      CREATE TABLE files (id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT NOT NULL, content_hash TEXT NOT NULL);
      INSERT INTO files (path, content_hash) VALUES ('/w/legacy.ts', 'h-legacy');
    `);
    const before = adapter.all<{ name: string }>(`PRAGMA table_info(files)`).map((r) => r.name);
    await applyMigrationV6(adapter as any);
    const after = adapter.all<{ name: string }>(`PRAGMA table_info(files)`).map((r) => r.name);
    expect(after).toEqual(before);
    expect(adapter.get<{ c: number }>('SELECT COUNT(*) as c FROM files')?.c).toBe(1);
    // no 16K trigger leaked onto legacy tables
    const trg = adapter.all<{ name: string }>(
      `SELECT name FROM sqlite_master WHERE type='trigger' AND tbl_name='files'`,
    );
    expect(trg).toHaveLength(0);
  });
});
