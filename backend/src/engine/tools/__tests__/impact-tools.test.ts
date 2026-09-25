/**
 * KSA-156 / SA4E-45 — Unit tests for the code_impact tool against an
 * in-memory SQLite database (files + symbols + relationships schema).
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteAdapter } from '../../../database/adapters/SqliteAdapter.js';
import { IMPACT_TOOL_DEFINITIONS, handleCodeImpact } from '../impact-tools.js';

const PID = 'proj_impact';
const WS = '/workspace';

const SCHEMA = `
CREATE TABLE files (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL DEFAULT '',
  path TEXT, relative_path TEXT);
CREATE TABLE symbols (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL DEFAULT '',
  file_id INTEGER, name TEXT, kind TEXT, signature TEXT, start_line INTEGER, end_line INTEGER,
  parent_symbol TEXT, parent_symbol_id INTEGER, visibility TEXT, doc_comment TEXT);
CREATE TABLE relationships (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT NOT NULL DEFAULT '',
  source_symbol_id INTEGER NOT NULL, target_symbol TEXT NOT NULL, target_symbol_id INTEGER,
  kind TEXT NOT NULL DEFAULT 'calls', file_path TEXT, line INTEGER, metadata TEXT);
`;

describe('IMPACT_TOOL_DEFINITIONS', () => {
  it('declares code_impact and its action/severity enum', () => {
    const def = IMPACT_TOOL_DEFINITIONS[0];
    expect(def.name).toBe('code_impact');
    expect(def.inputSchema.required).toContain('symbol');
    const props = def.inputSchema.properties as Record<string, any>;
    expect(props.action.enum).toEqual(['modify', 'delete', 'rename']);
    expect(props.severity_threshold.enum).toEqual(['critical', 'high', 'medium', 'low']);
  });
});

describe('handleCodeImpact — validation and not-found', () => {
  let adapter: SqliteAdapter;
  beforeEach(async () => { adapter = await seedDb(); });
  afterEach(async () => { if (adapter.isConnected()) await adapter.disconnect(); });

  it('returns an error JSON when symbol is missing', async () => {
    const out = await handleCodeImpact({}, adapter, WS, PID);
    expect(JSON.parse(out).error).toContain('"symbol" is required');
  });

  it('reports when the symbol is not found in the index', async () => {
    const out = await handleCodeImpact({ symbol: 'zzz_ghost' }, adapter, WS, PID);
    expect(out).toContain('Impact Analysis: "zzz_ghost" (modify)');
    expect(out).toContain('Symbol "zzz_ghost" not found in index');
    expect(out).toContain('Total affected: 0 (0 files)');
  });
});

describe('handleCodeImpact — blast radius with a direct caller', () => {
  let adapter: SqliteAdapter;
  beforeEach(async () => { adapter = await seedDb(); });
  afterEach(async () => { if (adapter.isConnected()) await adapter.disconnect(); });

  it('reports a critical direct caller for modify', async () => {
    const out = await handleCodeImpact({ symbol: 'processData' }, adapter, WS, PID);
    expect(out).toContain('Impact Analysis: "processData" (modify)');
    expect(out).toContain('Critical: 1');
    expect(out).toContain('Total affected: 1 (1 files)');
    expect(out).toContain('[critical] helper');
    expect(out).toContain('files/b.ts:5 - Direct caller');
    expect(out).toContain('* Update 1 direct callers if signature changes');
  });

  it('parses action defaults and passes through a rename action', async () => {
    const out = await handleCodeImpact({ symbol: 'processData', action: 'rename' }, adapter, WS, PID);
    expect(out).toContain('Impact Analysis: "processData" (rename)');
    expect(out).toContain('High: 1');
    expect(out).toContain('* Update references in 1 files with new name');
  });

  it('respects the depth clamp range', async () => {
    const out = await handleCodeImpact({ symbol: 'processData', depth: 99 }, adapter, WS, PID);
    expect(out).toContain('--- ');
    expect(out).toContain('depth 5');
  });
});

async function seedDb(): Promise<SqliteAdapter> {
  const adapter = new SqliteAdapter(':memory:');
  await adapter.connect();
  adapter.exec(SCHEMA);
  adapter.run("INSERT INTO files (project_id, path, relative_path) VALUES (?, '/a.ts', 'files/a.ts')", [PID]);
  adapter.run("INSERT INTO files (project_id, path, relative_path) VALUES (?, '/b.ts', 'files/b.ts')", [PID]);
  adapter.run("INSERT INTO symbols (project_id, file_id, name, kind, start_line) VALUES (?, 1, 'processData', 'function', 3)", [PID]);
  adapter.run("INSERT INTO symbols (project_id, file_id, name, kind, start_line) VALUES (?, 2, 'helper', 'function', 10)", [PID]);
  adapter.run(`INSERT INTO relationships (project_id, source_symbol_id, target_symbol, target_symbol_id, kind, file_path, line)
              VALUES (?, 2, 'processData', 1, 'calls', 'files/b.ts', 5)`, [PID]);
  return adapter;
}
