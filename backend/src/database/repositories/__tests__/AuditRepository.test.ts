/**
 * Unit tests for AuditRepository — structured audit entry recording and
 * most-recent-first retrieval with an optional limit.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteAdapter } from '../../adapters/SqliteAdapter.js';
import { AuditRepository } from '../AuditRepository.js';

const SCHEMA = `
CREATE TABLE audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, username TEXT NOT NULL,
  action TEXT NOT NULL, resource TEXT NOT NULL, resource_id TEXT, details TEXT,
  timestamp TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

let adapter: SqliteAdapter;
let repo: AuditRepository;

beforeEach(async () => {
  adapter = new SqliteAdapter(':memory:');
  await adapter.connect();
  await adapter.exec(SCHEMA);
  repo = new AuditRepository(adapter);
});

afterEach(async () => {
  await adapter.disconnect();
});

describe('AuditRepository', () => {
  it('recordAudit inserts a log entry with nulls for missing fields', async () => {
    await repo.recordAudit('u1', 'alice', 'CREATE', 'kb');
    const row = await adapter.get('SELECT * FROM audit_logs') as Record<string, unknown>;
    expect(row.user_id).toBe('u1');
    expect(row.username).toBe('alice');
    expect(row.action).toBe('CREATE');
    expect(row.resource).toBe('kb');
    expect(row.resource_id).toBeNull();
    expect(row.details).toBeNull();
  });

  it('recordAudit stores optional resourceId and details', async () => {
    await repo.recordAudit('u2', 'bob', 'DELETE', 'user', 'u99', 'removed inactive');
    const row = await adapter.get('SELECT * FROM audit_logs') as Record<string, unknown>;
    expect(row.resource_id).toBe('u99');
    expect(row.details).toBe('removed inactive');
  });

  it('getAuditLogs returns entries ordered by most recent first', async () => {
    await repo.recordAudit('u1', 'a', 'CREATE', 'kb');
    await repo.recordAudit('u2', 'b', 'UPDATE', 'kb');
    await repo.recordAudit('u3', 'c', 'DELETE', 'kb');
    const logs = repo.getAuditLogs();
    expect(logs).toHaveLength(3);
    expect(logs.map((l) => l.id)).toEqual([3, 2, 1]);
    expect(logs[0].userId).toBe('u3');
    expect(logs[0].username).toBe('c');
  });

  it('getAuditLogs respects the limit parameter', async () => {
    await repo.recordAudit('u1', 'a', 'CREATE', 'kb');
    await repo.recordAudit('u2', 'b', 'UPDATE', 'kb');
    const logs = repo.getAuditLogs(1);
    expect(logs).toHaveLength(1);
    expect(logs[0].id).toBe(2);
  });
});