/**
 * Unit tests for the PG bootstrapping facade (SA4E-335 DEF-002):
 * engine guard, mcp_tools PG dialect and delegation to both sub-ensures.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { DatabaseAdapter } from '../../adapters/DatabaseAdapter.js';
import { ensurePostgresSchema } from '../ensure-postgres-schema.js';

const execAsync = vi.fn();
const runAsync = vi.fn().mockResolvedValue({ changes: 0, lastInsertRowid: 0 });
let adapter: DatabaseAdapter;

const executed = () => execAsync.mock.calls.map((c) => c[0] as string);

beforeEach(() => {
  execAsync.mockReset().mockResolvedValue(undefined);
  runAsync.mockClear();
  adapter = {
    getEngine: () => 'postgresql',
    isConnected: () => true,
    execAsync,
    runAsync,
  } as unknown as DatabaseAdapter;
});

describe('ensurePostgresSchema', () => {
  it('does nothing on other engines or a disconnected adapter', async () => {
    const sqlite = { getEngine: () => 'sqlite', isConnected: () => true, execAsync } as unknown as DatabaseAdapter;
    await ensurePostgresSchema(sqlite);
    expect(execAsync).not.toHaveBeenCalled();

    const down = { getEngine: () => 'postgresql', isConnected: () => false, execAsync } as unknown as DatabaseAdapter;
    await ensurePostgresSchema(down);
    expect(execAsync).not.toHaveBeenCalled();
  });

  it('creates mcp_tools in postgres dialect (BYTEA, never BLOB)', async () => {
    await ensurePostgresSchema(adapter);
    const mcpTools = executed().find((s) => s.includes('CREATE TABLE IF NOT EXISTS mcp_tools'));
    expect(mcpTools).toBeDefined();
    expect(mcpTools).toContain('BYTEA');
    expect(mcpTools).not.toContain('BLOB');
    expect(executed().some((s) => s.includes('idx_mcp_tools_server'))).toBe(true);
  });

  it('also runs the memory and index ensures', async () => {
    await ensurePostgresSchema(adapter);
    expect(executed().some((s) => s.includes('CREATE TABLE IF NOT EXISTS knowledge_entries'))).toBe(true);
    expect(executed().some((s) => s.includes('CREATE TABLE IF NOT EXISTS files'))).toBe(true);
    expect(executed().some((s) => s.includes('CREATE TABLE IF NOT EXISTS symbols'))).toBe(true);
  });

  it('keeps going when the mcp_tools statement fails', async () => {
    execAsync.mockImplementation((sql: string) =>
      sql.includes('mcp_tools') ? Promise.reject(new Error('boom')) : Promise.resolve(undefined));
    await expect(ensurePostgresSchema(adapter)).resolves.toBeUndefined();
    expect(executed().some((s) => s.includes('CREATE TABLE IF NOT EXISTS knowledge_entries'))).toBe(true);
  });
});
