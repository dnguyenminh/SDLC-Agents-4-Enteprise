/**
 * SA4E-415 — shared fixtures: in-memory DB + V6 + rich seed across TWO READY
 * snapshots (S1, S2) and one FAILED (S3) — proves snapshot scoping per path.
 */

import { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { applyMigrationV6 } from '../../db/migration-v6.js';

export const P = 'proj1';

export async function makeRetrievalDb(): Promise<SqliteAdapter> {
  const a = new SqliteAdapter(':memory:');
  await a.connect();
  a.exec(
    `CREATE TABLE schema_version (version INTEGER PRIMARY KEY, applied_at TEXT DEFAULT (datetime('now')));
     INSERT INTO schema_version (version) VALUES (5);`,
  );
  await applyMigrationV6(a as any);
  a.exec(`
    INSERT INTO repository (id, project_id, origin_url, display_name) VALUES ('r1', '${P}', 'https://x.git', 'repo');
    INSERT INTO git_commit (id, project_id, repository_id, commit_sha) VALUES ('c1', '${P}', 'r1', 'sha-1');

    INSERT INTO source_file_revision (id, project_id, repository_id, commit_id, relative_path, content_hash, language, line_count) VALUES
      ('f1', '${P}', 'r1', 'c1', 'src/auth.ts',      'h1', 'typescript', 40),
      ('f2', '${P}', 'r1', 'c1', 'src/auth.test.ts', 'h2', 'typescript', 20),
      ('f3', '${P}', 'r1', 'c1', 'package.json',     'h3', 'json',       30),
      ('f4', '${P}', 'r1', 'c1', 'src/utils.ts',     'h4', 'typescript', 15),
      ('f5', '${P}', 'r1', 'c1', 'config/app.yml',   'h5', 'yaml',       5);

    INSERT INTO code_index_snapshot (id, project_id, repository_id, commit_id, config_fingerprint, code_model_version, status) VALUES
      ('S1', '${P}', 'r1', 'c1', 'fp1', 'v1', 'READY'),
      ('S2', '${P}', 'r1', 'c1', 'fp2', 'v1', 'READY'),
      ('S3', '${P}', 'r1', 'c1', 'fp3', 'v1', 'FAILED');

    -- S1 artifacts
    INSERT INTO code_symbol (id, project_id, snapshot_id, sfr_id, name, kind, start_line, end_line) VALUES
      ('symAuth',  '${P}', 'S1', 'f1', 'AuthService', 'class',   1, 40),
      ('symLogin', '${P}', 'S1', 'f1', 'login',       'method', 10, 20),
      ('symUtil',  '${P}', 'S1', 'f4', 'helper',      'function', 1, 10);
    INSERT INTO code_chunk (id, project_id, snapshot_id, symbol_id, sfr_id, chunk_index, start_line, end_line, content_ref, token_count) VALUES
      ('ch1', '${P}', 'S1', 'symLogin', 'f1', 0, 10, 20, 'blob://f1#0', 50),
      ('ch2', '${P}', 'S1', 'symUtil',  'f4', 0,  1, 10, 'blob://f4#0', 30);
    INSERT INTO code_chunk_fts (chunk_id, content) VALUES
      ('ch1', 'login authorization handler implementation'),
      ('ch2', 'utility helper functions');
    INSERT INTO symbol_occurrence (id, project_id, snapshot_id, symbol_id, sfr_id, kind, line, confidence) VALUES
      ('occ1', '${P}', 'S1', 'symLogin', 'f1', 'DEF', 10, 1.0);
    INSERT INTO symbol_occurrence_resolution (id, project_id, snapshot_id, occurrence_id, resolved_symbol_id, resolution_kind, confidence) VALUES
      ('res1', '${P}', 'S1', 'occ1', 'symUtil', 'EXACT', 1.0);
    INSERT INTO symbol_relationship (id, project_id, snapshot_id, from_symbol_id, to_symbol_id, kind, confidence) VALUES
      ('rel1', '${P}', 'S1', 'symLogin', 'symUtil', 'CALLS', 0.98),
      ('rel2', '${P}', 'S1', 'symLogin', 'symUtil', 'USES',  0.55),
      ('rel3', '${P}', 'S1', 'symUtil',  'symLogin', 'CALLS', 0.9);
    INSERT INTO relationship_evidence (id, project_id, snapshot_id, relationship_id, evidence_kind, excerpt) VALUES
      ('ev1', '${P}', 'S1', 'rel1', 'PROVEN',    'auth.ts:12 login() calls helper()'),
      ('ev2', '${P}', 'S1', 'rel2', 'HEURISTIC', 'name similarity');

    -- S2 artifacts (same names, different ids — proves snapshot scoping)
    INSERT INTO code_symbol (id, project_id, snapshot_id, sfr_id, name, kind, start_line, end_line)
      VALUES ('symAuth2', '${P}', 'S2', 'f1', 'AuthService', 'class', 1, 45);
    INSERT INTO code_chunk (id, project_id, snapshot_id, sfr_id, chunk_index, start_line, end_line, content_ref, token_count)
      VALUES ('chS2', '${P}', 'S2', 'f1', 0, 1, 45, 'blob://f1#s2', 60);
    INSERT INTO code_chunk_fts (chunk_id, content) VALUES ('chS2', 'login authorization handler implementation');

    INSERT INTO embedding_set (id, project_id, code_index_snapshot_id, model_key, model_version, dimensions, preprocessing_version, tokenizer_version, chunker_version) VALUES
      ('es1', '${P}', 'S1', 'local-minilm', '1.0', 4, 'pre1', 'tok1', 'chk1'),
      ('es2', '${P}', 'S2', 'local-minilm', '1.0', 4, 'pre1', 'tok1', 'chk1');
    INSERT INTO code_embedding (project_id, embedding_set_id, chunk_id, embedding) VALUES
      ('${P}', 'es1', 'ch1',  X'0000803F000000000000000000000000'),  -- [1,0,0,0]
      ('${P}', 'es2', 'chS2', X'000000000000803F0000000000000000');  -- [0,1,0,0]

    INSERT INTO repository_ref_index_state (project_id, repository_id, ref_name, active_code_index_snapshot_id, generation)
      VALUES ('${P}', 'r1', 'refs/heads/main', 'S1', 1);
  `);
  return a;
}

export function float32Buf(values: number[]): Buffer {
  return Buffer.from(new Float32Array(values).buffer);
}
