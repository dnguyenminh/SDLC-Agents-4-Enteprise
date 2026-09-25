/**
 * Unit tests for SymbolRepository — symbol counts by project scope and
 * symbol detail retrieval joined against files.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteAdapter } from '../../adapters/SqliteAdapter.js';
import { SymbolRepository } from '../SymbolRepository.js';

const SCHEMA = `
CREATE TABLE files (
  id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT NOT NULL UNIQUE, relative_path TEXT NOT NULL,
  language TEXT NOT NULL, module TEXT
);
CREATE TABLE symbols (
  id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL DEFAULT '', file_id INTEGER NOT NULL,
  name TEXT NOT NULL, kind TEXT NOT NULL, signature TEXT, start_line INTEGER NOT NULL,
  end_line INTEGER NOT NULL, parent_symbol TEXT, visibility TEXT, doc_comment TEXT,
  summary TEXT, pseudo_code TEXT, llm_tags TEXT, enrichment_status TEXT
);
`;

let adapter: SqliteAdapter;
let repo: SymbolRepository;

beforeEach(async () => {
  adapter = new SqliteAdapter(':memory:');
  await adapter.connect();
  adapter.exec(SCHEMA);
  adapter.run("INSERT INTO files (id, path, relative_path, language, module) VALUES (?, ?, ?, ?, ?)", [1, '/w/a.ts', 'a.ts', 'typescript', 'src']);
  adapter.run("INSERT INTO files (id, path, relative_path, language, module) VALUES (?, ?, ?, ?, ?)", [2, '/w/b.ts', 'b.ts', 'typescript', 'src']);
  adapter.run(`INSERT INTO symbols (id, project_id, file_id, name, kind, signature, start_line, end_line, parent_symbol, visibility, doc_comment) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [1, 'p1', 1, 'doAuth', 'function', 'sig', 1, 5, null, 'public', 'auth docs']);
  adapter.run(`INSERT INTO symbols (id, project_id, file_id, name, kind, signature, start_line, end_line, parent_symbol, visibility, doc_comment) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [2, 'p1', 2, 'MyClass', 'class', 'sig2', 1, 10, null, 'public', null]);
  adapter.run(`INSERT INTO symbols (id, project_id, file_id, name, kind, signature, start_line, end_line, parent_symbol, visibility, doc_comment) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [3, 'p2', 1, 'data', 'variable', 'v', 1, 2, null, null, null]);
  repo = new SymbolRepository(adapter);
});

afterEach(async () => {
  await adapter.disconnect();
});

describe('SymbolRepository', () => {
  it('getSymbolCount counts only code symbol kinds without scope', async () => {
    expect(await repo.getSymbolCount()).toBe(2);
  });

  it('getSymbolCount scopes to a project', async () => {
    expect(await repo.getSymbolCount('p1')).toBe(2);
    expect(await repo.getSymbolCount('p2')).toBe(0);
  });

  it('getSymbolDetail maps a symbol row to SymbolDetail', async () => {
    const detail = await repo.getSymbolDetail('1');
    expect(detail).toEqual({
      id: 1, name: 'doAuth', kind: 'function', signature: 'sig',
      startLine: 1, endLine: 5, parentSymbol: null, visibility: 'public',
      docComment: 'auth docs', relativePath: 'a.ts', language: 'typescript', module: 'src',
      summary: null, pseudoCode: null, llmTags: null, enrichmentStatus: null,
    });
  });

  it('getSymbolDetail returns null for non-numeric or missing ids', async () => {
    expect(await repo.getSymbolDetail('abc')).toBeNull();
    expect(await repo.getSymbolDetail('999')).toBeNull();
  });
});