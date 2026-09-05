/**
 * KSA-155 / SA4E-45 — Unit tests for the code_dependencies tool against an
 * in-memory SQLite database (files + relationships schema).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { DEPENDENCY_TOOL_DEFINITIONS, handleCodeDependencies } from '../dependency-tools.js';

const PID = 'proj_dep';

const SCHEMA = `
CREATE TABLE files (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL DEFAULT '',
  path TEXT, relative_path TEXT);
CREATE TABLE relationships (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL DEFAULT '',
  source_symbol_id INTEGER NOT NULL, target_symbol TEXT NOT NULL, target_symbol_id INTEGER,
  kind TEXT NOT NULL DEFAULT 'calls', file_path TEXT, line INTEGER, metadata TEXT);
`;

describe('DEPENDENCY_TOOL_DEFINITIONS', () => {
  it('declares the code_dependencies tool and requires file', () => {
    expect(DEPENDENCY_TOOL_DEFINITIONS[0].name).toBe('code_dependencies');
    expect(DEPENDENCY_TOOL_DEFINITIONS[0].inputSchema.required).toContain('file');
  });
});

describe('handleCodeDependencies — validation', () => {
  let adapter: SqliteAdapter;
  beforeEach(async () => { adapter = await seedDb(); });
  afterEach(async () => { if (adapter.isConnected()) await adapter.disconnect(); });

  it('returns an error JSON when file is missing', async () => {
    const out = await handleCodeDependencies({}, adapter, '/ws', PID);
    expect(JSON.parse(out).error).toContain('"file" is required');
  });

  it('reports when the file is not indexed', async () => {
    const out = await handleCodeDependencies({ file: 'files/missing.ts' }, adapter, '/ws', PID);
    expect(out).toBe('File "files/missing.ts" not found in index. Make sure the file has been indexed.');
  });
});

describe('handleCodeDependencies — outgoing traversal', () => {
  let adapter: SqliteAdapter;
  beforeEach(async () => { adapter = await seedDb(); });
  afterEach(async () => { if (adapter.isConnected()) await adapter.disconnect(); });

  it('returns a tree of imported files', async () => {
    const out = await handleCodeDependencies({ file: 'files/a.ts' }, adapter, '/ws', PID);
    const parsed = JSON.parse(out);
    expect(parsed.root).toBe('files/a.ts');
    expect(parsed.tree.file).toBe('files/a.ts');
    expect(parsed.tree.label).toBe('a.ts');
    const child = parsed.tree.children.find((c: { file: string }) => c.file === 'files/b.ts');
    expect(child).toBeDefined();
    expect(child.depth).toBe(1);
  });

  it('excludes external dependencies by default', async () => {
    const out = await handleCodeDependencies({ file: 'files/a.ts' }, adapter, '/ws', PID);
    const parsed = JSON.parse(out);
    const files = parsed.tree.children.map((c: { file: string }) => c.file);
    expect(files).toContain('files/b.ts');
    expect(files).not.toContain('lodash');
  });

  it('includes external dependencies when requested', async () => {
    const out = await handleCodeDependencies(
      { file: 'files/a.ts', include_external: true },
      adapter, '/ws', PID,
    );
    const parsed = JSON.parse(out);
    const files = parsed.tree.children.map((c: { file: string }) => c.file);
    expect(files).toContain('lodash');
    const lodash = parsed.tree.children.find((c: { file: string }) => c.file === 'lodash');
    expect(lodash.isExternal).toBe(true);
  });

  it('supports the flat output format', async () => {
    const out = await handleCodeDependencies(
      { file: 'files/a.ts', format: 'flat' },
      adapter, '/ws', PID,
    );
    const parsed = JSON.parse(out);
    expect(parsed.dependencies).toBeDefined();
    expect(parsed.dependencies.length).toBeGreaterThan(0);
    expect(parsed.dependencies[0].file).toBe('files/b.ts');
  });
});

describe('handleCodeDependencies — incoming traversal', () => {
  let adapter: SqliteAdapter;
  beforeEach(async () => { adapter = await seedDb(); });
  afterEach(async () => { if (adapter.isConnected()) await adapter.disconnect(); });

  it('finds files that import the target', async () => {
    const out = await handleCodeDependencies(
      { file: 'files/b.ts', direction: 'incoming' },
      adapter, '/ws', PID,
    );
    const parsed = JSON.parse(out);
    expect(parsed.root).toBe('files/b.ts');
    const importing = parsed.tree.children.find((c: { file: string }) => c.file === 'files/a.ts');
    expect(importing).toBeDefined();
  });

  it('returns a no-dependency message when nothing imports the file', async () => {
    adapter.run("INSERT INTO files (project_id, path, relative_path) VALUES (?, '/x.ts', 'files/x.ts')", [PID]);
    const out = await handleCodeDependencies(
      { file: 'x.ts', direction: 'incoming' },
      adapter, '/ws', PID,
    );
    expect(out).toBe('No incoming dependencies found for "files/x.ts"');
  });
});

async function seedDb(): Promise<SqliteAdapter> {
  const adapter = new SqliteAdapter(':memory:');
  await adapter.connect();
  adapter.exec(SCHEMA);
  for (const rel of ['files/a.ts', 'files/b.ts', 'files/c.ts']) {
    adapter.run('INSERT INTO files (project_id, path, relative_path) VALUES (?, ?, ?)', [PID, `/${rel}`, rel]);
  }
  adapter.run(`INSERT INTO relationships (project_id, source_symbol_id, target_symbol, kind, file_path, line)
              VALUES (?, 0, './b', 'imports', 'files/a.ts', 1)`, [PID]);
  adapter.run(`INSERT INTO relationships (project_id, source_symbol_id, target_symbol, kind, file_path, line)
              VALUES (?, 0, 'lodash', 'imports', 'files/a.ts', 2)`, [PID]);
  return adapter;
}
