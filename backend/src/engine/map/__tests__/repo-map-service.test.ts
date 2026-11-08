/**
 * SA4E-418 — RepositoryMapService integration tests: DSL format, query
 * personalization, snapshot pin, token budget, performance (10k files < 500ms).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { applyMigrationV6 } from '../../db/migration-v6.js';
import { RepositoryMapService } from '../repo-map-service.js';

const P = 'proj1';

describe('SA4E-418 RepositoryMapService', () => {
  let adapter: SqliteAdapter;
  let svc: RepositoryMapService;

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
        ('f1', '${P}', 'r1', 'c1', 'src/config/SecurityConfig.java',    'h1', 'java'),
        ('f2', '${P}', 'r1', 'c1', 'src/controller/PaymentController.java', 'h2', 'java'),
        ('f3', '${P}', 'r1', 'c1', 'src/service/PaymentService.java',   'h3', 'java'),
        ('f4', '${P}', 'r1', 'c1', 'tests/PaymentServiceTest.java',     'h4', 'java');
      INSERT INTO code_index_snapshot (id, project_id, repository_id, commit_id, config_fingerprint, code_model_version, status) VALUES
        ('S1', '${P}', 'r1', 'c1', 'fp1', 'v1', 'READY'),
        ('S2', '${P}', 'r1', 'c1', 'fp2', 'v1', 'READY'),
        ('S3', '${P}', 'r1', 'c1', 'fp3', 'v1', 'FAILED');
      INSERT INTO code_symbol (id, project_id, snapshot_id, sfr_id, name, kind, start_line, end_line) VALUES
        ('s1', '${P}', 'S1', 'f1', 'SecurityConfig',    'class',   18, 64),
        ('s2', '${P}', 'S1', 'f2', 'PaymentController', 'class',   15, 95),
        ('s3', '${P}', 'S1', 'f3', 'PaymentService',    'class',   10, 80),
        ('s4', '${P}', 'S1', 'f4', 'PaymentServiceTest', 'class',    5, 40),
        ('s5', '${P}', 'S2', 'f1', 'SecurityConfigV2', 'class',   18, 70);
      INSERT INTO symbol_relationship (id, project_id, snapshot_id, from_symbol_id, to_symbol_id, kind, confidence) VALUES
        ('rel1', '${P}', 'S1', 's2', 's3', 'CALLS', 0.95),
        ('rel2', '${P}', 'S1', 's2', 's1', 'USES',  0.8);
    `);
    svc = new RepositoryMapService(adapter as any);
  });
  afterEach(async () => {
    if (adapter.isConnected()) await adapter.disconnect();
  });

  it('DSL output matches spec format (header + path: + start-end: signature)', async () => {
    const result = await svc.generate('S1');
    const lines = result.dsl.split('\n');
    expect(lines[0]).toBe('[REPOSITORY_MAP (Ranked by PageRank relevance)]');
    expect(lines).toContain('src/config/SecurityConfig.java:');
    expect(lines).toContain('  18-64: class SecurityConfig');
    expect(lines).toContain('  15-95: class PaymentController');
    // every file node appears as a `path:` line (src/* + tests/*)
    expect(lines.filter((l) => l.endsWith('.java:')).length).toBe(4);
  });

  it('query personalization: query-matched file ranks first', async () => {
    const result = await svc.generate('S1', { query: 'SecurityConfig' });
    const dsl = result.dsl;
    const secIdx = dsl.indexOf('src/config/SecurityConfig.java:');
    const payIdx = dsl.indexOf('src/controller/PaymentController.java:');
    expect(secIdx).toBeGreaterThan(-1);
    expect(secIdx).toBeLessThan(payIdx);
  });

  it('snapshot pin: FAILED snapshot rejected; scoping keeps S2 symbols out of S1 map', async () => {
    await expect(svc.generate('S3')).rejects.toThrow(/SNAPSHOT_NOT_READY/);
    const result = await svc.generate('S2');
    expect(result.dsl).toContain('SecurityConfigV2');
    const resultS1 = await svc.generate('S1');
    expect(resultS1.dsl).not.toContain('SecurityConfigV2'); // S2-only symbol invisible
  });

  it('token budget respected via binary-search packing (custom small budget)', async () => {
    const result = await svc.generate('S1', { tokenBudget: 40 });
    expect(result.tokenEstimate).toBeLessThanOrEqual(40);
    expect(result.truncated).toBe(true);
    const full = await svc.generate('S1', { tokenBudget: 10000 });
    expect(full.truncated).toBe(false);
  });

  it('performance: repo map generation < 500ms for 10k files (pure ranking path)', async () => {
    // synthetic 10k-file graph through the same pure functions the service uses
    const { buildFileGraph, personalizedPageRank, packWithinBudget } = await import('../repo-map-rank.js');
    const N = 10_000;
    const symbolNamesByFile = new Map<string, string[]>();
    const edges: Array<{ fromFile: string; toFile: string; symbolName: string }> = [];
    for (let i = 0; i < N; i++) {
      const path = `src/mod${i % 100}/File${i}.java`;
      symbolNamesByFile.set(path, [`Class${i}`, `method${i}Handler`]);
      if (i > 0) {
        edges.push({ fromFile: path, toFile: `src/mod${(i - 1) % 100}/File${i - 1}.java`, symbolName: `Class${i - 1}` });
      }
    }
    const started = performance.now();
    const graph = buildFileGraph({ symbolNamesByFile, edges, query: 'handler' });
    const personal = new Map(graph.nodes.map((n) => [n, 1]));
    const rank = personalizedPageRank(graph, personal);
    const lines = [...rank.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 400)
      .map(([p]) => `${p}:`);
    const dsl = packWithinBudget(lines, 1500).join('\n');
    const elapsed = performance.now() - started;
    expect(dsl.length).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(500);
  });
});
