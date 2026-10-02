/**
 * Unit tests for the env→engine bootstrap (SA4E-335 DEF-002):
 * URL resolution order, postgres URL parsing, idempotent seeding and the
 * no-op path that must leave sqlite/admin behaviour byte-identical.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { resolveDatabaseUrl, parsePostgresUrl, seedEngineFromEnv } from '../seedEngineFromEnv.js';
import { DatabaseConfigService } from '../DatabaseConfigService.js';

let dataDir: string;
let service: DatabaseConfigService;

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'env-db-'));
  service = new DatabaseConfigService(dataDir);
});

afterEach(() => fs.rmSync(dataDir, { recursive: true, force: true }));

describe('resolveDatabaseUrl', () => {
  it('prefers DATABASE_URL_FILE over DATABASE_URL and trims the secret', () => {
    const secret = path.join(dataDir, 'database_url');
    fs.writeFileSync(secret, 'postgresql://file-host:5432/file-db\n');
    const url = resolveDatabaseUrl({ DATABASE_URL_FILE: secret, DATABASE_URL: 'postgresql://env-host/env-db' });
    expect(url).toBe('postgresql://file-host:5432/file-db');
  });

  it('falls back to DATABASE_URL when the secret file is missing or empty', () => {
    expect(resolveDatabaseUrl({ DATABASE_URL_FILE: path.join(dataDir, 'missing'), DATABASE_URL: 'postgresql://h/db' }))
      .toBe('postgresql://h/db');
    const empty = path.join(dataDir, 'empty');
    fs.writeFileSync(empty, '   ');
    expect(resolveDatabaseUrl({ DATABASE_URL_FILE: empty, DATABASE_URL: 'postgresql://h/db' }))
      .toBe('postgresql://h/db');
  });

  it('returns null when neither source is present', () => {
    expect(resolveDatabaseUrl({})).toBeNull();
  });
});

describe('parsePostgresUrl', () => {
  it('maps a full URL onto ConnectionParams with percent-decoded credentials', () => {
    const params = parsePostgresUrl('postgresql://sa4e%40user:p%40ss%3Aword@db.internal:5433/sa4e_db?sslmode=require');
    expect(params).toEqual({
      host: 'db.internal', port: 5433, username: 'sa4e@user', password: 'p@ss:word',
      database: 'sa4e_db', ssl: true, pool: { min: 2, max: 10 },
    });
  });

  it('defaults the port to 5432 and ssl to false without sslmode', () => {
    const params = parsePostgresUrl('postgres://db.internal/sa4e_db');
    expect(params?.port).toBe(5432);
    expect(params?.ssl).toBe(false);
  });

  it('rejects non-postgres URLs, malformed input and URLs without a database', () => {
    expect(parsePostgresUrl('mysql://db.internal/sa4e_db')).toBeNull();
    expect(parsePostgresUrl('not a url')).toBeNull();
    expect(parsePostgresUrl('postgresql://db.internal')).toBeNull();
  });
});

describe('seedEngineFromEnv', () => {
  it('writes nothing when no URL is configured (sqlite default untouched)', () => {
    seedEngineFromEnv(dataDir, {});
    expect(fs.existsSync(path.join(dataDir, 'database.json'))).toBe(false);
    expect(service.getActiveConfig().engine).toBe('sqlite');
  });

  it('seeds postgresql from DATABASE_URL_FILE and round-trips the password', () => {
    const secret = path.join(dataDir, 'url');
    fs.writeFileSync(secret, 'postgresql://sa4e_user:dummy_pw@postgres:5432/sa4e_db');
    seedEngineFromEnv(dataDir, { DATABASE_URL_FILE: secret, DATABASE_ADAPTER: 'postgresql' });
    expect(service.getActiveConfig()).toMatchObject({
      engine: 'postgresql', host: 'postgres', port: 5432,
      username: 'sa4e_user', password: 'dummy_pw', database: 'sa4e_db', ssl: false,
    });
  });

  it('is idempotent — a second call does not rewrite database.json', () => {
    const env = { DATABASE_URL: 'postgresql://postgres:5432/sa4e_db' };
    seedEngineFromEnv(dataDir, env);
    const first = fs.readFileSync(path.join(dataDir, 'database.json'), 'utf-8');
    seedEngineFromEnv(dataDir, env);
    expect(fs.readFileSync(path.join(dataDir, 'database.json'), 'utf-8')).toBe(first);
  });

  it('leaves database.json alone for a non-postgres DATABASE_ADAPTER', () => {
    seedEngineFromEnv(dataDir, { DATABASE_URL: 'postgresql://h/db', DATABASE_ADAPTER: 'mysql' });
    expect(fs.existsSync(path.join(dataDir, 'database.json'))).toBe(false);
    expect(service.getActiveConfig().engine).toBe('sqlite');
  });

  it('leaves database.json alone when the URL is unusable', () => {
    seedEngineFromEnv(dataDir, { DATABASE_URL: 'mysql://h/db' });
    expect(fs.existsSync(path.join(dataDir, 'database.json'))).toBe(false);
  });

  it('re-seeds when the secret rotates the password', () => {
    seedEngineFromEnv(dataDir, { DATABASE_URL: 'postgresql://user:old@h:5432/db' });
    seedEngineFromEnv(dataDir, { DATABASE_URL: 'postgresql://user:new@h:5432/db' });
    expect(service.getActiveConfig()).toMatchObject({ engine: 'postgresql', password: 'new' });
  });
});
