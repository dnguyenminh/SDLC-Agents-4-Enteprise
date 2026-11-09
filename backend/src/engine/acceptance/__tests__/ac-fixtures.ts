/**
 * SA4E-427 — shared multi-snapshot acceptance fixture (16K Doc §19).
 * Two repositories, five commits (incl. a merge and a delete commit), six
 * READY snapshots, two embedding models on one snapshot, and two PENDING
 * snapshots used by the pipeline ACs (re-index / dependency re-run).
 */

import { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { applyMigrationV6 } from '../../db/migration-v6.js';

export const P = 'proj1';

export function vec(...values: number[]): Buffer {
  return Buffer.from(new Float32Array(values).buffer);
}

export async function makeAcceptanceDb(): Promise<SqliteAdapter> {
  const a = new SqliteAdapter(':memory:');
  await a.connect();
  a.exec(
    `CREATE TABLE schema_version (version INTEGER PRIMARY KEY, applied_at TEXT DEFAULT (datetime('now')));
     INSERT INTO schema_version (version) VALUES (5);`,
  );
  await applyMigrationV6(a as any);
  a.exec(`
    INSERT INTO repository (id, project_id, origin_url, display_name) VALUES
      ('r1', '${P}', 'https://x.git', 'repo-1'),
      ('r2', '${P}', 'https://y.git', 'repo-2');

    INSERT INTO git_commit (id, project_id, repository_id, commit_sha) VALUES
      ('c1',   '${P}', 'r1', 'sha-1'),
      ('c2',   '${P}', 'r1', 'sha-2'),
      ('c3',   '${P}', 'r1', 'sha-3'),
      ('cdel', '${P}', 'r1', 'sha-del'),
      ('rc1',  '${P}', 'r2', 'sha-r1');
    INSERT INTO git_commit_parent (project_id, commit_id, parent_commit_id, parent_order) VALUES
      ('${P}', 'c2', 'c1', 0),
      ('${P}', 'c3', 'c1', 0),
      ('${P}', 'c3', 'c2', 1);

    INSERT INTO source_file_revision (id, project_id, repository_id, commit_id, relative_path, content_hash, language) VALUES
      ('f1',  '${P}', 'r1', 'c1',   'src/old/auth.ts', 'h1',  'typescript'),
      ('fu1', '${P}', 'r1', 'c1',   'src/util.ts',     'hu1', 'typescript'),
      ('f2',  '${P}', 'r1', 'c2',   'src/new/auth.ts', 'h2',  'typescript'),
      ('fu2', '${P}', 'r1', 'c2',   'src/util.ts',     'hu2', 'typescript'),
      ('f3',  '${P}', 'r1', 'c3',   'src/new/auth.ts', 'h3',  'typescript'),
      ('fu3', '${P}', 'r1', 'c3',   'src/util.ts',     'hu3', 'typescript'),
      ('fud', '${P}', 'r1', 'cdel', 'src/util.ts',     'hud', 'typescript'),
      ('g1',  '${P}', 'r2', 'rc1',  'src/new/auth.ts', 'hg1', 'typescript');

    INSERT INTO code_index_snapshot (id, project_id, repository_id, commit_id, config_fingerprint, code_model_version, status) VALUES
      ('S1', '${P}', 'r1', 'c1',   'fp1', 'v1', 'READY'),
      ('S2', '${P}', 'r1', 'c2',   'fp2', 'v1', 'READY'),
      ('S3', '${P}', 'r1', 'c3',   'fp3', 'v1', 'READY'),
      ('S4', '${P}', 'r1', 'cdel', 'fp4', 'v1', 'READY'),
      ('S5', '${P}', 'r2', 'rc1',  'fp5', 'v1', 'READY'),
      ('S6', '${P}', 'r1', 'c1',   'fp-adapter2', 'v1', 'PENDING'),
      ('S7', '${P}', 'r1', 'c1',   'fp-reindex',  'v1', 'PENDING'),
      ('S8', '${P}', 'r1', 'c1',   'fp-deptest',  'v1', 'PENDING');

    INSERT INTO code_symbol (id, project_id, snapshot_id, sfr_id, name, kind, start_line, end_line) VALUES
      ('s-auth1', '${P}', 'S1', 'f1',  'AuthService', 'class',    1, 20),
      ('s-util1', '${P}', 'S1', 'fu1', 'helper',      'function', 1, 10),
      ('s-auth2', '${P}', 'S2', 'f2',  'AuthService', 'class',    1, 22),
      ('s-util2', '${P}', 'S2', 'fu2', 'helper',      'function', 1, 11),
      ('s-auth3', '${P}', 'S3', 'f3',  'AuthService', 'class',    1, 24),
      ('s-util3', '${P}', 'S3', 'fu3', 'helper',      'function', 1, 12),
      ('s-util4', '${P}', 'S4', 'fud', 'helper',      'function', 1, 12),
      ('s-authR', '${P}', 'S5', 'g1',  'AuthService', 'class',    1, 30);

    INSERT INTO code_chunk (id, project_id, snapshot_id, symbol_id, sfr_id, chunk_index, start_line, end_line, content_ref, token_count) VALUES
      ('ch1',     '${P}', 'S1', 's-auth1', 'f1',  0, 1, 20, 'blob://f1#0',  50),
      ('ch1b',    '${P}', 'S1', 's-util1', 'fu1', 0, 1, 10, 'blob://fu1#0', 20),
      ('ch-other','${P}', 'S1', 's-util1', 'fu1', 1, 1, 10, 'blob://fu1#1', 21),
      ('ch2',     '${P}', 'S2', 's-auth2', 'f2',  0, 1, 22, 'blob://f2#0',  55),
      ('ch3',     '${P}', 'S3', 's-auth3', 'f3',  0, 1, 24, 'blob://f3#0',  60),
      ('ch5',     '${P}', 'S5', 's-authR', 'g1',  0, 1, 30, 'blob://g1#0',  70);
    INSERT INTO code_chunk_fts (chunk_id, content) VALUES
      ('ch1',     'authorization handler login'),
      ('ch1b',    'utility helper functions'),
      ('ch-other','other model only payload'),
      ('ch2',     'authorization handler login'),
      ('ch3',     'authorization handler login'),
      ('ch5',     'authorization handler login');

    INSERT INTO embedding_set (id, project_id, code_index_snapshot_id, model_key, model_version, dimensions, preprocessing_version, tokenizer_version, chunker_version) VALUES
      ('es1',  '${P}', 'S1', 'local-minilm', '1.0', 4, 'pre1', 'tok1', 'chk1'),
      ('es1b', '${P}', 'S1', 'other-model',  '1.0', 4, 'pre1', 'tok1', 'chk1'),
      ('es2',  '${P}', 'S2', 'local-minilm', '1.0', 4, 'pre1', 'tok1', 'chk1'),
      ('es3',  '${P}', 'S3', 'local-minilm', '1.0', 4, 'pre1', 'tok1', 'chk1'),
      ('es5',  '${P}', 'S5', 'local-minilm', '1.0', 4, 'pre1', 'tok1', 'chk1');
    INSERT INTO code_embedding (project_id, embedding_set_id, chunk_id, embedding) VALUES
      ('${P}', 'es1',  'ch1',      X'0000803F000000000000000000000000'),
      ('${P}', 'es1',  'ch1b',     X'9A99993ECDCC4C3E0000000000000000'),
      ('${P}', 'es1b', 'ch-other', X'000000000000803F0000000000000000'),
      ('${P}', 'es2',  'ch2',      X'0000803F000000000000000000000000'),
      ('${P}', 'es3',  'ch3',      X'6666E63ECDCC0C3F0000000000000000'),
      ('${P}', 'es5',  'ch5',      X'0000803F000000000000000000000000');

    INSERT INTO repository_ref_index_state (project_id, repository_id, ref_name, active_code_index_snapshot_id, generation) VALUES
      ('${P}', 'r1', 'refs/heads/main', 'S2', 2),
      ('${P}', 'r2', 'refs/heads/main', 'S5', 1);
  `);
  return a;
}
