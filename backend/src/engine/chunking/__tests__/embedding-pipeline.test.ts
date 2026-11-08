/**
 * SA4E-419 — embedding pipeline integration: V6 DB → chunks → embedding_set /
 * code_embedding / FTS5; asserts the no-body rule at the persisted level.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createHash } from 'node:crypto';
import { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { applyMigrationV6 } from '../../db/migration-v6.js';
import { embedSnapshotChunks } from '../embedding-pipeline.js';

const P = 'proj1';
const MODEL = {
  modelKey: 'local-minilm',
  modelVersion: '1.0',
  dimensions: 4,
  preprocessingVersion: 'pre1',
  tokenizerVersion: 'tok1',
  chunkerVersion: 'chk1',
};

/** Deterministic stub embedder: 4-dim float32 vector from a text hash. */
function stubEmbed(text: string): Buffer {
  const h = createHash('sha256').update(text).digest();
  return Buffer.from(new Float32Array([h[0] / 255, h[1] / 255, h[2] / 255, h[3] / 255]).buffer);
}

describe('SA4E-419 embedding pipeline (V6 integration)', () => {
  let adapter: SqliteAdapter;

  beforeEach(async () => {
    adapter = new SqliteAdapter(':memory:');
    await adapter.connect();
    adapter.exec(
      `CREATE TABLE schema_version (version INTEGER PRIMARY KEY, applied_at TEXT DEFAULT (datetime('now')));
       INSERT INTO schema_version (version) VALUES (5);`,
    );
    await applyMigrationV6(adapter as any);
    adapter.exec(`
      INSERT INTO repository (id, project_id, origin_url, display_name) VALUES ('r1', '${P}', 'https://x.git', 'repo');
      INSERT INTO git_commit (id, project_id, repository_id, commit_sha) VALUES ('c1', '${P}', 'r1', 'sha-1');
      INSERT INTO source_file_revision (id, project_id, repository_id, commit_id, relative_path, content_hash, language) VALUES
        ('f1', '${P}', 'r1', 'c1', 'src/PaymentService.java', 'h1', 'java');
      INSERT INTO code_index_snapshot (id, project_id, repository_id, commit_id, config_fingerprint, code_model_version, status)
        VALUES ('S1', '${P}', 'r1', 'c1', 'fp1', 'v1', 'BUILDING');
      INSERT INTO code_symbol (id, project_id, snapshot_id, sfr_id, name, kind, signature, doc_comment, start_line, end_line, parent_id) VALUES
        ('sym-cls',  '${P}', 'S1', 'f1', 'PaymentService',    'class',  'class PaymentService', NULL, 1, 12, NULL),
        ('sym-proc', '${P}', 'S1', 'f1', 'processTransaction', 'method', 'Receipt processTransaction(OrderDto)', 'Trừ tiền và lưu lịch sử.', 3, 8, 'sym-cls');
      INSERT INTO symbol_relationship (id, project_id, snapshot_id, from_symbol_id, to_symbol_id, kind, confidence) VALUES
        ('rel1', '${P}', 'S1', 'sym-proc', 'sym-cls', 'CALLS', 0.9);
    `);
  });
  afterEach(async () => {
    if (adapter.isConnected()) await adapter.disconnect();
  });

  it('persists skeleton + body chunks, embedding_set + code_embedding (AC)', async () => {
    const stats = await embedSnapshotChunks(adapter as any, 'S1', P, MODEL, stubEmbed, async (fp) =>
      fp === 'src/PaymentService.java'
        ? ['class PaymentService {', '  Receipt processTransaction(OrderDto o) {', '    charge(o);', '  }', '}'].join('\n')
        : '',
    );
    expect(stats.chunkedNow).toBe(true);
    expect(stats.chunksAvailable).toBe(2); // 1 skeleton + 1 body
    const chunkCount = adapter.get<{ c: number }>(`SELECT COUNT(*) AS c FROM code_chunk`)?.c;
    expect(chunkCount).toBe(2);
    const bodyCount = adapter.get<{ c: number }>(
      `SELECT COUNT(*) AS c FROM code_chunk WHERE content_ref LIKE 'ast:%#%'`,
    )?.c;
    expect(bodyCount).toBe(1); // body chunks carry Parent#child ids
    const es = adapter.get<any>(`SELECT model_key, dimensions FROM embedding_set WHERE id = ?`, [stats.embeddingSetId]);
    expect(es.model_key).toBe('local-minilm');
    expect(es.dimensions).toBe(4);
    const emb = adapter.get<{ c: number }>(`SELECT COUNT(*) AS c FROM code_embedding WHERE embedding_set_id = ?`, [stats.embeddingSetId])?.c;
    expect(emb).toBe(2);
  });

  it('no-body rule at persistence level: FTS content never contains method bodies (AC)', async () => {
    const stats = await embedSnapshotChunks(adapter as any, 'S1', P, MODEL, stubEmbed, async () =>
      ['class PaymentService {', '  Receipt processTransaction(OrderDto o) {', '    SECRET_LOCAL_VARIABLE = 42;', '  }', '}'].join('\n'),
    );
    for (const text of stats.embeddedTexts) {
      expect(text).not.toContain('SECRET_LOCAL_VARIABLE');
    }
    // FTS finds signature/doc terms…
    const sig = adapter.all<any>(
      `SELECT f.chunk_id FROM code_chunk_fts f WHERE code_chunk_fts MATCH 'processTransaction'`,
    );
    expect(sig.length).toBeGreaterThan(0);
    // …but body-only terms are unsearchable
    const body = adapter.all<any>(
      `SELECT f.chunk_id FROM code_chunk_fts f WHERE code_chunk_fts MATCH 'SECRET_LOCAL_VARIABLE'`,
    );
    expect(body).toHaveLength(0);
  });

  it('re-running with a different model creates a SECOND embedding_set (no reparse)', async () => {
    const first = await embedSnapshotChunks(adapter as any, 'S1', P, MODEL, stubEmbed, async () => '');
    expect(first.chunkedNow).toBe(true);
    expect(adapter.get<{ c: number }>(`SELECT COUNT(*) AS c FROM embedding_set`)?.c).toBe(1);
    const second = await embedSnapshotChunks(adapter as any, 'S1', P, { ...MODEL, modelKey: 'other-model' }, stubEmbed);
    expect(second.chunkedNow).toBe(false); // chunks reused — no reparse
    expect(adapter.get<{ c: number }>(`SELECT COUNT(*) AS c FROM embedding_set`)?.c).toBe(2);
    expect(adapter.get<{ c: number }>(`SELECT COUNT(*) AS c FROM code_symbol`)?.c).toBe(2);
    // both embedding sets reference the SAME chunks
    expect(second.chunksAvailable).toBe(first.chunksAvailable);
  });

  it('external symbols (no sfr) become signature-only chunks', async () => {
    adapter.exec(`
      INSERT INTO code_symbol (id, project_id, snapshot_id, sfr_id, name, kind, signature, start_line, end_line, parent_id)
        VALUES ('ext-1', '${P}', 'S1', NULL, 'StripeClient', 'interface', 'interface StripeClient', 0, 0, NULL);
    `);
    const stats = await embedSnapshotChunks(adapter as any, 'S1', P, MODEL, stubEmbed, async () => '');
    expect(stats.chunksAvailable).toBeGreaterThanOrEqual(1);
    const ext = adapter.all<any>(
      `SELECT c.content_ref FROM code_chunk c WHERE c.content_ref = 'ast:StripeClient'`,
    );
    expect(ext.length).toBe(1);
  });
});
