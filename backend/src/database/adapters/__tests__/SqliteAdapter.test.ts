/**
 * Unit tests for SqliteAdapter — lifecycle, CRUD, transactions, async
 * delegation, metadata queries and error handling on an in-memory DB.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { SqliteAdapter } from '../SqliteAdapter.js';

let tmpDir: string;
let adapter: SqliteAdapter;

beforeEach(async () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sqlite-adapter-'));
  adapter = new SqliteAdapter(':memory:');
  await adapter.connect();
});

afterEach(async () => {
  if (adapter.isConnected()) await adapter.disconnect();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('SqliteAdapter', () => {
  it('connects and reports sqlite engine', () => {
    expect(adapter.isConnected()).toBe(true);
    expect(adapter.getEngine()).toBe('sqlite');
  });

  it('throws on operations before connect', () => {
    const fresh = new SqliteAdapter(':memory:');
    expect(() => fresh.run('SELECT 1')).toThrow('SQLite not connected');
    expect(() => fresh.all('SELECT 1')).toThrow('SQLite not connected');
  });

  it('run returns changes and lastInsertRowid for inserts', () => {
    adapter.exec('CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)');
    const res = adapter.run('INSERT INTO t (name) VALUES (?)', ['a']);
    expect(res.changes).toBe(1);
    expect(res.lastInsertRowid).toBe(1);
    const res2 = adapter.run('INSERT INTO t (name) VALUES (?)', ['b']);
    expect(res2.lastInsertRowid).toBe(2);
  });

  it('get and all return queried rows', () => {
    adapter.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');
    adapter.run('INSERT INTO t (id, name) VALUES (?, ?)', [1, 'a']);
    adapter.run('INSERT INTO t (id, name) VALUES (?, ?)', [2, 'b']);
    expect(adapter.get('SELECT * FROM t WHERE id = ?', [1])).toEqual({ id: 1, name: 'a' });
    expect(adapter.get('SELECT * FROM t WHERE id = ?', [99])).toBeUndefined();
    expect(adapter.all('SELECT * FROM t ORDER BY id')).toHaveLength(2);
  });

  it('prepare binds parameters for run/get/all', () => {
    adapter.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');
    const stmt = adapter.prepare('INSERT INTO t (id, name) VALUES (?, ?)');
    stmt.run(1, 'x');
    stmt.run(2, 'y');
    expect(adapter.prepare('SELECT name FROM t WHERE id = ?').get(1)).toEqual({ name: 'x' });
    expect(adapter.prepare('SELECT * FROM t ORDER BY id').all()).toHaveLength(2);
  });

  it('transaction commits all changes and rolls back on error', () => {
    adapter.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');
    adapter.transaction(() => {
      adapter.run('INSERT INTO t (id, name) VALUES (?, ?)', [1, 'x']);
      adapter.run('INSERT INTO t (id, name) VALUES (?, ?)', [2, 'y']);
    });
    expect(adapter.all('SELECT * FROM t')).toHaveLength(2);

    expect(() =>
      adapter.transaction(() => {
        adapter.run('INSERT INTO t (id, name) VALUES (?, ?)', [3, 'z']);
        throw new Error('boom');
      }),
    ).toThrow('boom');
    expect(adapter.all('SELECT * FROM t')).toHaveLength(2);
  });

  it('async variants delegate to sync SQL', async () => {
    adapter.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');
    await adapter.execAsync('INSERT INTO t (id, name) VALUES (1, \'a\')');
    const r = await adapter.runAsync('INSERT INTO t (id, name) VALUES (?, ?)', [2, 'b']);
    expect(r.changes).toBe(1);
    expect(await adapter.getAsync('SELECT name FROM t WHERE id = ?', [1])).toEqual({ name: 'a' });
    expect(await adapter.allAsync('SELECT * FROM t ORDER BY id')).toHaveLength(2);
    const tx = await adapter.transactionAsync(async () => {
      await adapter.runAsync('INSERT INTO t (id, name) VALUES (?, ?)', [3, 'c']);
      return 'done';
    });
    expect(tx).toBe('done');
    expect(await adapter.getRowCount('t')).toBe(3);
  });

  it('getVersion reports the SQLite version', async () => {
    expect(await adapter.getVersion()).toMatch(/^SQLite /);
  });

  it('getTableNames excludes sqlite internal tables', async () => {
    adapter.exec('CREATE TABLE apples (id INTEGER PRIMARY KEY)');
    adapter.exec('CREATE TABLE oranges (id INTEGER PRIMARY KEY)');
    const names = await adapter.getTableNames();
    expect(names).toContain('apples');
    expect(names).toContain('oranges');
    expect(names.some((n) => n.startsWith('sqlite_'))).toBe(false);
  });

  it('getRowCount returns the number of rows', async () => {
    adapter.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT)');
    adapter.run('INSERT INTO t (id, name) VALUES (?, ?)', [1, 'a']);
    adapter.run('INSERT INTO t (id, name) VALUES (?, ?)', [2, 'b']);
    expect(await adapter.getRowCount('t')).toBe(2);
  });

  it('disconnect closes the database and further ops throw', async () => {
    await adapter.disconnect();
    expect(adapter.isConnected()).toBe(false);
    expect(() => adapter.run('SELECT 1')).toThrow('SQLite not connected');
  });

  it('connect creates missing parent directories for a file db', async () => {
    const nestedDir = path.join(tmpDir, 'nested', 'db');
    const fileAdapter = new SqliteAdapter(path.join(nestedDir, 'index.db'));
    await fileAdapter.connect();
    expect(fs.existsSync(nestedDir)).toBe(true);
    fileAdapter.run('CREATE TABLE t (id INTEGER PRIMARY KEY)');
    await fileAdapter.disconnect();
  });

  it('getStatus reports engine and file details for a file-backed db', async () => {
    const fileAdapter = new SqliteAdapter(path.join(tmpDir, 'index.db'));
    await fileAdapter.connect();
    const status = fileAdapter.getStatus();
    expect(status.connected).toBe(true);
    expect(status.engine).toBe('sqlite');
    expect((status.details as { path: string }).path).toContain('index.db');
    await fileAdapter.disconnect();
    expect(fileAdapter.isConnected()).toBe(false);
  });
});
