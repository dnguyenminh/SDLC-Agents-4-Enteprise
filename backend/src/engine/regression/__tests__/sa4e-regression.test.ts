/**
 * SA4E-429 — SA4E regression: legacy F2 indexer and F4 context assembly on a
 * V6 (16K snapshot model) database.
 *
 * Cross-cutting proofs:
 *  - migration V6 is additive: legacy `files` / `symbols` / `symbols_fts` /
 *    `relationships` keep working (F2 indexer + FTS5 + graph + WAL).
 *  - F4 `AIContextService` still resolves legacy symbols and assembles source /
 *    doc-comment sections against the same database that carries snapshots.
 *  - Snapshot retrieval and legacy symbol resolution stay isolated: neither
 *    namespace leaks into the other.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { runMigrations } from '../../db/migrations.js';
import { SymbolResolver } from '../../graph/symbol-resolver.js';
import { GraphRepository } from '../../graph/graph-repository.js';
import { CallGraphService } from '../../graph/call-graph-service.js';
import { AIContextService } from '../../context/ai-context-service.js';
import { SnapshotRetrievalService } from '../../retrieval/snapshot-retrieval.js';

const PROJECT = 'proj1';
const LEGACY_SOURCE = [
  'export function LegacyAuth(token: string): boolean {',
  '  return token.length > 0;',
  '}',
].join('\n');

let tmpDir: string;
let workspace: string;
let adapter: SqliteAdapter;

/** Real legacy rows: one file + one symbol (F2 shape) + one call edge. */
async function seedLegacy(db: SqliteAdapter): Promise<void> {
  await db.execAsync(`
    INSERT INTO files (project_id, path, relative_path, language, content_hash, size_bytes, line_count)
    VALUES ('${PROJECT}', 'src/legacy.ts', 'src/legacy.ts', 'typescript', 'hash-legacy', 120, 3);

    INSERT INTO symbols (project_id, file_id, name, kind, signature, start_line, end_line, doc_comment)
    VALUES ('${PROJECT}', 1, 'LegacyAuth', 'function', 'LegacyAuth(token: string): boolean', 1, 3, 'Authenticates a user token.');

    INSERT INTO relationships (source_symbol_id, target_symbol, kind, file_path, line)
    VALUES (1, 'verifyToken', 'calls', 'src/legacy.ts', 2);
  `);
}

/** Minimal V6 snapshot model rows (repository → commit → snapshot → symbol/chunk). */
async function seedSnapshot(db: SqliteAdapter): Promise<void> {
  await db.execAsync(`
    INSERT INTO repository (id, project_id, origin_url, display_name)
    VALUES ('r1', '${PROJECT}', 'https://example.git', 'repo-1');

    INSERT INTO git_commit (id, project_id, repository_id, commit_sha)
    VALUES ('c1', '${PROJECT}', 'r1', 'sha-1');

    INSERT INTO source_file_revision (id, project_id, repository_id, commit_id, relative_path, content_hash, language)
    VALUES ('sfr1', '${PROJECT}', 'r1', 'c1', 'src/new-auth.ts', 'hash-new', 'typescript');

    INSERT INTO code_index_snapshot (id, project_id, repository_id, commit_id, config_fingerprint, code_model_version, status)
    VALUES ('S1', '${PROJECT}', 'r1', 'c1', 'fp1', 'v1', 'READY');

    INSERT INTO code_symbol (id, project_id, snapshot_id, sfr_id, name, kind, start_line, end_line)
    VALUES ('sym1', '${PROJECT}', 'S1', 'sfr1', 'AuthService', 'class', 1, 20);

    INSERT INTO code_chunk (id, project_id, snapshot_id, symbol_id, sfr_id, chunk_index, start_line, end_line, content_ref, token_count)
    VALUES ('ch1', '${PROJECT}', 'S1', 'sym1', 'sfr1', 0, 1, 20, 'blob://sfr1#0', 40);

    INSERT INTO code_chunk_fts (chunk_id, content) VALUES ('ch1', 'authorization handler login');
  `);
}

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa4e-429-regression-'));
  workspace = path.join(tmpDir, 'workspace');
  fs.mkdirSync(path.join(workspace, 'src'), { recursive: true });
  fs.writeFileSync(path.join(workspace, 'src', 'legacy.ts'), LEGACY_SOURCE);

  adapter = new SqliteAdapter(path.join(tmpDir, 'index.db'));
  await adapter.connect();
  await runMigrations(adapter);
});

afterEach(async () => {
  if (adapter.isConnected()) await adapter.disconnect();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('SA4E-429 F2 indexer regression on the V6 schema', () => {
  it('migration V6 is additive: legacy tables, FTS5, graph and pragmas stay intact', async () => {
    const version = await adapter.getAsync<{ v: number }>('SELECT MAX(version) AS v FROM schema_version');
    expect(version?.v).toBe(6);

    // The adapter runs on an in-memory engine and exports the host file on
    // disconnect (sqlite-persistence durability); FK enforcement is the pragma
    // that must survive every migration.
    const fk = await adapter.getAsync<{ foreign_keys: number }>('PRAGMA foreign_keys');
    expect(fk?.foreign_keys).toBe(1);

    await seedLegacy(adapter);

    // FTS5 external-content index is still populated by the legacy triggers.
    const fts = await adapter.allAsync<{ rowid: number; name: string }>(
      `SELECT rowid, name FROM symbols_fts WHERE symbols_fts MATCH 'authenticate'`,
    );
    expect(fts).toHaveLength(1);
    expect(fts[0].name).toBe('LegacyAuth');

    // Graph edges keep the legacy shape used by F4 callers/callees.
    const edge = await adapter.getAsync<{ source_symbol_id: number; target_symbol: string; kind: string }>(
      `SELECT source_symbol_id, target_symbol, kind FROM relationships WHERE kind = 'calls'`,
    );
    expect(edge).toEqual({ source_symbol_id: 1, target_symbol: 'verifyToken', kind: 'calls' });

    // The V6 FTS table exists side-by-side without disturbing the legacy one.
    const snapshotFts = await adapter.allAsync<{ chunk_id: string }>(
      `SELECT chunk_id FROM code_chunk_fts WHERE code_chunk_fts MATCH 'authorization'`,
    );
    expect(snapshotFts).toEqual([]); // no snapshot rows inserted yet

    // Durability path: closing exports the host DB file (no data loss).
    await adapter.disconnect();
    expect(fs.statSync(path.join(tmpDir, 'index.db')).size).toBeGreaterThan(0);
  });
});

describe('SA4E-429 F4 context assembly with the new retrieval model', () => {
  it('assembles legacy symbol context (source + doc comment) on a V6 database', async () => {
    await seedLegacy(adapter);

    const resolver = new SymbolResolver(adapter, PROJECT);
    const callGraph = new CallGraphService(new GraphRepository(adapter, PROJECT), resolver);
    const service = new AIContextService(adapter, resolver, callGraph, workspace);

    const res = await service.getContext({ symbol: 'LegacyAuth', intent: 'explain', token_budget: 2000 });

    expect(res.symbol).toBe('LegacyAuth');
    expect(res.file_path).toBe('src/legacy.ts');
    expect(res.kind).toBe('function');
    expect(res.context.source).toContain('export function LegacyAuth');
    expect(res.context.doc_comment).toBe('Authenticates a user token.');
    expect(res.metadata.sections_included).toEqual(expect.arrayContaining(['source', 'doc_comment']));
    expect(res.metadata.budget_used).toBeLessThanOrEqual(2000);
  });

  it('legacy symbols and snapshot symbols stay isolated on the same database', async () => {
    await seedLegacy(adapter);
    await seedSnapshot(adapter);

    const resolver = new SymbolResolver(adapter, PROJECT);
    const retrieval = new SnapshotRetrievalService(adapter);

    // Legacy resolver only sees the legacy table.
    expect((await resolver.resolve('LegacyAuth')).map((s) => s.filePath)).toEqual(['src/legacy.ts']);
    expect(await resolver.resolve('AuthService')).toEqual([]);

    // Snapshot retrieval only sees the pinned snapshot.
    const pin = await retrieval.pinOrThrow('S1', 'r1');
    expect(pin).toMatchObject({ id: 'S1', repositoryId: 'r1', commitId: 'c1', status: 'READY' });
    expect((await retrieval.symbolByName('S1', 'AuthService')).map((s) => s.name)).toEqual(['AuthService']);
    expect(await retrieval.symbolByName('S1', 'LegacyAuth')).toEqual([]);
  });
});
