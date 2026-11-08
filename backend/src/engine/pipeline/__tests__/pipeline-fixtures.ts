/**
 * SA4E-414 — shared fixtures for SnapshotIndexPipeline tests.
 * Isolated in-memory DB with migration V6 applied + a PENDING snapshot seeded.
 */

import { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { applyMigrationV6 } from '../../db/migration-v6.js';
import type { PipelineTarget } from '../pipeline-types.js';

export const P = 'proj1';

export async function makeSnapshotDb(): Promise<SqliteAdapter> {
  const adapter = new SqliteAdapter(':memory:');
  await adapter.connect();
  adapter.exec(
    `CREATE TABLE schema_version (version INTEGER PRIMARY KEY, applied_at TEXT DEFAULT (datetime('now')));
     INSERT INTO schema_version (version) VALUES (5);`,
  );
  await applyMigrationV6(adapter as any);
  adapter.exec(`
    INSERT INTO repository (id, project_id, origin_url, display_name) VALUES ('r1', '${P}', 'https://x.git', 'repo');
    INSERT INTO git_commit (id, project_id, repository_id, commit_sha) VALUES ('c1', '${P}', 'r1', 'sha-1');
    INSERT INTO code_index_snapshot (id, project_id, repository_id, commit_id, config_fingerprint, code_model_version, status)
      VALUES ('S1', '${P}', 'r1', 'c1', 'fp1', 'v1', 'PENDING');
  `);
  return adapter;
}

export function makeTarget(): PipelineTarget {
  return { projectId: P, repositoryId: 'r1', commitId: 'c1', snapshotId: 'S1' };
}

export const LANGS = ['typescript', 'java', 'cobol'];

export function snapshotStatus(adapter: SqliteAdapter): string | undefined {
  return adapter.get<{ status: string }>(
    `SELECT status FROM code_index_snapshot WHERE id = 'S1'`,
  )?.status;
}

export function snapshotDiagnostics(adapter: SqliteAdapter): {
  stages: Record<string, { status: string }>;
  coverage: Array<{ language: string; capability: string }>;
} {
  const raw = adapter.get<{ diagnostics: string }>(
    `SELECT diagnostics FROM code_index_snapshot WHERE id = 'S1'`,
  )?.diagnostics;
  return JSON.parse(raw ?? '{}');
}
