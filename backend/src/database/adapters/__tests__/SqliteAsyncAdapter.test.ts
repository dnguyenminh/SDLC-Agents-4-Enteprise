/**
 * Unit tests for SqliteAsyncAdapter — zero-overhead async wrapper over a
 * better-sqlite3 Database with no-op lifecycle methods.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteAdapter } from '../SqliteAdapter.js';
import { SqliteAsyncAdapter } from '../SqliteAsyncAdapter.js';

let db: any;
let sqlite: SqliteAdapter;
let adapter: SqliteAsyncAdapter;

beforeEach(async () => {
  sqlite = new SqliteAdapter(':memory:');
  await sqlite.connect();
  db = (sqlite as any).db;
  db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT)');
  adapter = new SqliteAsyncAdapter(db);
});

afterEach(async () => {
  await sqlite.disconnect();
});

describe('SqliteAsyncAdapter', () => {
  it('reports connected and sqlite engine', () => {
    expect(adapter.isConnected()).toBe(true);
    expect(adapter.getEngine()).toBe('sqlite');
  });

  it('connect and disconnect are no-ops', async () => {
    await expect(adapter.connect()).resolves.toBeUndefined();
    await expect(adapter.disconnect()).resolves.toBeUndefined();
    expect(adapter.isConnected()).toBe(true);
  });

  it('run inserts rows and reports changes/lastInsertRowid', async () => {
    const res = await adapter.run('INSERT INTO t (name) VALUES (?)', ['a']);
    expect(res.changes).toBe(1);
    expect(res.lastInsertRowid).toBe(1);
  });

  it('get returns a single row or undefined', async () => {
    await adapter.run('INSERT INTO t (name) VALUES (?)', ['a']);
    expect(await adapter.get('SELECT * FROM t WHERE id = ?', [1])).toEqual({ id: 1, name: 'a' });
    expect(await adapter.get('SELECT * FROM t WHERE id = ?', [99])).toBeUndefined();
  });

  it('all returns all matching rows', async () => {
    await adapter.run('INSERT INTO t (name) VALUES (?)', ['a']);
    await adapter.run('INSERT INTO t (name) VALUES (?)', ['b']);
    expect(await adapter.all('SELECT * FROM t ORDER BY id')).toHaveLength(2);
  });

  it('exec runs raw DDL', async () => {
    await adapter.exec('CREATE TABLE u (id INTEGER PRIMARY KEY)');
    const names = await adapter.get<{ name: string }>("SELECT name FROM sqlite_master WHERE name = 'u'");
    expect(names?.name).toBe('u');
  });

  it('transaction executes the provided fn', async () => {
    const result = await adapter.transaction(async () => {
      await adapter.run('INSERT INTO t (name) VALUES (?)', ['a']);
      return 'done';
    });
    expect(result).toBe('done');
    expect((await adapter.get<{ cnt: number }>('SELECT COUNT(*) as cnt FROM t'))?.cnt).toBe(1);
  });

  it('getRawDb exposes the underlying database', () => {
    expect(adapter.getRawDb()).toBe(db);
  });
});