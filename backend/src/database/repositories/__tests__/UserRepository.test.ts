/**
 * Unit tests for UserRepository — total count, per-group count and email
 * updates against an in-memory users table.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SqliteAdapter } from '../../adapters/SqliteAdapter.js';
import { UserRepository } from '../UserRepository.js';
import { hashPassword } from '../../../admin/db/password.js';

const SCHEMA = `
CREATE TABLE users (
  user_id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, email TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'ACTIVE', access_group_id TEXT NOT NULL,
  force_password_change INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, last_login TEXT,
  account_type TEXT NOT NULL DEFAULT 'LOCAL'
);
`;

let adapter: SqliteAdapter;
let repo: UserRepository;

beforeEach(async () => {
  adapter = new SqliteAdapter(':memory:');
  await adapter.connect();
  adapter.exec(SCHEMA);
  const insertSQL = `INSERT INTO users
    (user_id, username, email, password_hash, status, access_group_id, created_at)
    VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)`;
  adapter.run(insertSQL, ['u1', 'alice', 'a@x.com', 'h1', 'grp-admin', '2024-01-01T00:00:00Z']);
  adapter.run(insertSQL, ['u2', 'bob', 'b@x.com', 'h2', 'grp-dev', '2024-01-02T00:00:00Z']);
  adapter.run(insertSQL, ['u3', 'carol', 'c@x.com', 'h3', 'grp-admin', '2024-01-03T00:00:00Z']);
  repo = new UserRepository(adapter);
});

afterEach(async () => {
  await adapter.disconnect();
});

describe('UserRepository', () => {
  it('getUserCount returns the total number of users', async () => {
    expect(await repo.getUserCount()).toBe(3);
  });

  it('getUserCountByGroup returns users in a group', async () => {
    expect(await repo.getUserCountByGroup('grp-admin')).toBe(2);
    expect(await repo.getUserCountByGroup('grp-viewer')).toBe(0);
  });

  it('updateEmail changes the user email', async () => {
    await repo.updateEmail('u1', 'new@x.com');
    const row = adapter.get<{ email: string }>('SELECT email FROM users WHERE user_id = ?', ['u1']);
    expect(row?.email).toBe('new@x.com');
    const other = adapter.get<{ email: string }>('SELECT email FROM users WHERE user_id = ?', ['u2']);
    expect(other?.email).toBe('b@x.com');
  });

  it('findByEmail returns user by email', async () => {
    const user = await repo.findByEmail('a@x.com');
    expect(user).not.toBeNull();
    expect(user?.username).toBe('alice');
    expect(user?.user_id).toBe('u1');
  });

  it('findByUsername returns user by username', async () => {
    const user = await repo.findByUsername('bob');
    expect(user).not.toBeNull();
    expect(user?.email).toBe('b@x.com');
    expect(user?.user_id).toBe('u2');
  });

  it('findById returns user by id', async () => {
    const user = await repo.findById('u3');
    expect(user).not.toBeNull();
    expect(user?.username).toBe('carol');
  });

  it('createUser inserts user with accountType', async () => {
    const passwordHash = hashPassword('secret123');
    const created = await repo.createUser({
      email: 'new@example.com',
      username: 'newuser',
      passwordHash,
      accountType: 'LOCAL',
    });
    expect(created).not.toBeNull();
    expect(created?.email).toBe('new@example.com');
    expect(created?.username).toBe('newuser');
    expect(created?.account_type).toBe('LOCAL');
    // Verify persisted
    const row = adapter.get<{ account_type: string }>('SELECT account_type FROM users WHERE email = ?', ['new@example.com']);
    expect(row?.account_type).toBe('LOCAL');
  });

  it('createUser defaults accountType to LOCAL and username from email', async () => {
    const passwordHash = hashPassword('pwd');
    const created = await repo.createUser({
      email: 'auto@example.com',
      passwordHash,
    });
    expect(created?.username).toBe('auto');
    expect(created?.account_type).toBe('LOCAL');
  });

  it('verifyCredentials succeeds with correct password via email', async () => {
    // Insert user with real hash
    const pwd = 'correct';
    const hash = hashPassword(pwd);
    adapter.run(
      `INSERT INTO users (user_id, username, email, password_hash, status, access_group_id, created_at, account_type)
       VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, 'LOCAL')`,
      ['u4', 'dave', 'dave@example.com', hash, 'grp-dev', '2024-01-04T00:00:00Z']
    );
    const user = await repo.verifyCredentials('dave@example.com', pwd);
    expect(user).not.toBeNull();
    expect(user?.user_id).toBe('u4');
  });

  it('verifyCredentials succeeds with correct password via username fallback', async () => {
    const pwd = 'secret';
    const hash = hashPassword(pwd);
    adapter.run(
      `INSERT INTO users (user_id, username, email, password_hash, status, access_group_id, created_at, account_type)
       VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, 'LOCAL')`,
      ['u5', 'eve', 'eve@example.com', hash, 'grp-dev', '2024-01-05T00:00:00Z']
    );
    const user = await repo.verifyCredentials('eve', pwd);
    expect(user).not.toBeNull();
    expect(user?.user_id).toBe('u5');
  });

  it('verifyCredentials returns null for wrong password', async () => {
    const hash = hashPassword('right');
    adapter.run(
      `INSERT INTO users (user_id, username, email, password_hash, status, access_group_id, created_at, account_type)
       VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?, 'LOCAL')`,
      ['u6', 'frank', 'frank@example.com', hash, 'grp-dev', '2024-01-06T00:00:00Z']
    );
    const user = await repo.verifyCredentials('frank@example.com', 'wrong');
    expect(user).toBeNull();
  });

  it('verifyCredentials returns null for inactive user', async () => {
    const hash = hashPassword('pwd');
    adapter.run(
      `INSERT INTO users (user_id, username, email, password_hash, status, access_group_id, created_at, account_type)
       VALUES (?, ?, ?, ?, 'DISABLED', ?, ?, 'LOCAL')`,
      ['u7', 'gina', 'gina@example.com', hash, 'grp-dev', '2024-01-07T00:00:00Z']
    );
    const user = await repo.verifyCredentials('gina@example.com', 'pwd');
    expect(user).toBeNull();
  });
});