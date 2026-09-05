/**
 * SA4E-237 (GD5) — Resolution pass tests (real SQLite :memory:).
 * Covers: 3-way classification (resolved/external/ambiguous), delete-by-source idempotency,
 * and graph projection (pega-ext nodes + PEGA_REF/PEGA_UNRESOLVED edges).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { SqliteAdapter } from '../../../../database/adapters/SqliteAdapter.js';
import { PegaResolutionStore } from '../../storage/PegaResolutionStore.js';
import { runResolutionPass } from '../../resolve/PegaResolutionPass.js';
import { buildFqn } from '../../pega-mapping.js';

const SCHEMA = `
CREATE TABLE symbols (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT, file_id INTEGER, name TEXT,
  kind TEXT, signature TEXT
);
CREATE TABLE pega_reference_resolution (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT, source_symbol_id INTEGER,
  source_fqn TEXT, ref_kind TEXT, ref_path TEXT, target_symbol_id INTEGER,
  target_fqn TEXT, resolution_status TEXT DEFAULT 'unresolved', detail TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE graph_nodes (
  entry_id TEXT PRIMARY KEY, label TEXT, type TEXT, tier TEXT, project_id TEXT,
  x REAL, y REAL, z REAL, level TEXT, cluster_id TEXT
);
CREATE TABLE graph_edges (
  id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT, target TEXT, weight REAL DEFAULT 0.5,
  rel_type TEXT DEFAULT 'RELATED_TO', UNIQUE(source, target)
);
`;

const PROJECT = 'PROJ_1';
const log = { warn: () => {}, debug: () => {}, info: () => {}, error: () => {} } as any;

let adapter: SqliteAdapter;

/** Insert a Pega symbol and return its id. */
async function addSymbol(type: string, cls: string, name: string): Promise<number> {
  const fqn = buildFqn(type, cls, name, '-', '-');
  const r = await adapter.runAsync(
    `INSERT INTO symbols (project_id, file_id, name, kind, signature) VALUES (?, 1, ?, 'pega_rule', ?)`,
    [PROJECT, name, fqn],
  );
  return r.lastInsertRowid as number;
}

beforeEach(async () => {
  adapter = new SqliteAdapter(':memory:');
  await adapter.connect();
  await adapter.execAsync(SCHEMA);
});

describe('runResolutionPass — classification', () => {
  it('resolves a reference to a single indexed target', async () => {
    const src = await addSymbol('Rule-Obj-Activity', 'Work-Order', 'Process');
    const tgt = await addSymbol('Rule-Obj-Activity', 'Work-Order', 'Validate');
    const store = new PegaResolutionStore(adapter);
    await store.stageReferences(PROJECT, src, buildFqn('Rule-Obj-Activity', 'Work-Order', 'Process', '-', '-'), [
      { refKind: 'Rule-Obj-Activity', refPath: 'Work-Order.Validate',
        targetFqn: buildFqn('Rule-Obj-Activity', 'Work-Order', 'Validate', '-', '-') },
    ]);

    const stats = await runResolutionPass(adapter, PROJECT, log);
    expect(stats.resolved).toBe(1);
    const rows = await store.referencesFrom(PROJECT, src);
    expect(rows[0].resolutionStatus).toBe('resolved');
    expect(rows[0].targetSymbolId).toBe(tgt);
  });

  it('marks a reference external when target is not indexed', async () => {
    const src = await addSymbol('Rule-Obj-Activity', 'Work-Order', 'Process');
    const store = new PegaResolutionStore(adapter);
    await store.stageReferences(PROJECT, src, 'x', [
      { refKind: 'Rule-Obj-When', refPath: 'Work-.FrameworkWhen',
        targetFqn: buildFqn('Rule-Obj-When', 'Work-', 'FrameworkWhen', '-', '-') },
    ]);
    const stats = await runResolutionPass(adapter, PROJECT, log);
    expect(stats.external).toBe(1);
    const rows = await store.byStatus(PROJECT, 'external');
    expect(rows).toHaveLength(1);
    expect(rows[0].targetSymbolId).toBeNull();
  });

  it('marks ambiguous when multiple same-class candidates exist', async () => {
    const src = await addSymbol('Rule-Obj-Activity', 'Work-Order', 'Process');
    // Two Validate activities on the SAME class (differ by ruleset/version in reality).
    await addSymbol('Rule-Obj-Activity', 'Work-Order', 'Validate');
    await addSymbol('Rule-Obj-Activity', 'Work-Order', 'Validate');
    const store = new PegaResolutionStore(adapter);
    await store.stageReferences(PROJECT, src, 'x', [
      { refKind: 'Rule-Obj-Activity', refPath: 'Work-Order.Validate',
        targetFqn: buildFqn('Rule-Obj-Activity', 'Work-Order', 'Validate', '-', '-') },
    ]);
    const stats = await runResolutionPass(adapter, PROJECT, log);
    expect(stats.ambiguous).toBe(1);
  });

  it('picks the most specific class among candidates (class specificity)', async () => {
    const src = await addSymbol('Rule-Obj-Activity', 'Work-Order', 'Process');
    await addSymbol('Rule-Obj-Activity', 'Work-', 'Validate');       // ancestor (pattern parent)
    const leaf = await addSymbol('Rule-Obj-Activity', 'Work-Order', 'Validate'); // leaf — more specific
    const store = new PegaResolutionStore(adapter);
    await store.stageReferences(PROJECT, src, 'x', [
      { refKind: 'Rule-Obj-Activity', refPath: 'Work-Order.Validate',
        targetFqn: buildFqn('Rule-Obj-Activity', 'Work-Order', 'Validate', '-', '-') },
    ]);
    await runResolutionPass(adapter, PROJECT, log);
    const rows = await store.referencesFrom(PROJECT, src);
    expect(rows[0].resolutionStatus).toBe('resolved');
    expect(rows[0].targetSymbolId).toBe(leaf);
  });
});

describe('PegaResolutionStore — idempotency', () => {
  it('delete-by-source prevents duplicate rows on re-stage', async () => {
    const src = await addSymbol('Rule-Obj-Activity', 'Work-Order', 'Process');
    const store = new PegaResolutionStore(adapter);
    const ref = { refKind: 'Rule-Obj-When', refPath: 'Work-Order.IsOpen',
      targetFqn: buildFqn('Rule-Obj-When', 'Work-Order', 'IsOpen', '-', '-') };
    await store.stageReferences(PROJECT, src, 'x', [ref]);
    await store.stageReferences(PROJECT, src, 'x', [ref]); // re-stage
    const rows = await store.referencesFrom(PROJECT, src);
    expect(rows).toHaveLength(1);
  });
});

describe('runResolutionPass — graph projection', () => {
  it('creates pega-ext node + PEGA_UNRESOLVED edge for external, PEGA_REF for resolved', async () => {
    const src = await addSymbol('Rule-Obj-Activity', 'Work-Order', 'Process');
    const tgt = await addSymbol('Rule-Obj-Activity', 'Work-Order', 'Validate');
    const store = new PegaResolutionStore(adapter);
    await store.stageReferences(PROJECT, src, 'x', [
      { refKind: 'Rule-Obj-Activity', refPath: 'Work-Order.Validate',
        targetFqn: buildFqn('Rule-Obj-Activity', 'Work-Order', 'Validate', '-', '-') },
      { refKind: 'Rule-Obj-When', refPath: 'Work-.ExtWhen',
        targetFqn: buildFqn('Rule-Obj-When', 'Work-', 'ExtWhen', '-', '-') },
    ]);
    await runResolutionPass(adapter, PROJECT, log);

    const extNodes = await adapter.allAsync<{ entry_id: string }>(
      "SELECT entry_id FROM graph_nodes WHERE entry_id LIKE 'pega-ext:%'", [],
    );
    expect(extNodes.length).toBe(1);

    const edges = await adapter.allAsync<{ rel_type: string; target: string }>(
      "SELECT rel_type, target FROM graph_edges WHERE source = ?", [`code:${src}`],
    );
    const relTypes = edges.map((e) => e.rel_type).sort();
    expect(relTypes).toEqual(['PEGA_REF', 'PEGA_UNRESOLVED']);
    expect(edges.find((e) => e.rel_type === 'PEGA_REF')?.target).toBe(`code:${tgt}`);
  });

  it('re-running the pass does not duplicate graph nodes/edges', async () => {
    const src = await addSymbol('Rule-Obj-Activity', 'Work-Order', 'Process');
    const store = new PegaResolutionStore(adapter);
    await store.stageReferences(PROJECT, src, 'x', [
      { refKind: 'Rule-Obj-When', refPath: 'Work-.ExtWhen',
        targetFqn: buildFqn('Rule-Obj-When', 'Work-', 'ExtWhen', '-', '-') },
    ]);
    await runResolutionPass(adapter, PROJECT, log);
    await runResolutionPass(adapter, PROJECT, log); // re-run
    const extNodes = await adapter.allAsync("SELECT entry_id FROM graph_nodes WHERE entry_id LIKE 'pega-ext:%'", []);
    expect(extNodes.length).toBe(1);
  });
});
