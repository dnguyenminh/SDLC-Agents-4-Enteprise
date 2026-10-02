/**
 * Seed the active database engine from the environment at boot — SA4E-335 DEF-002.
 *
 * Docker Compose delivers the PostgreSQL URL as a Docker secret
 * (`DATABASE_URL_FILE`, TDD §4.2 / D-2 / FSD §12.5) and names the adapter via
 * `DATABASE_ADAPTER`; bare-metal deployments may export `DATABASE_URL`.
 * `database.json` — the engine source of truth read by admin/db/core.ts —
 * knows nothing about either, so a containerized deployment silently stayed on
 * the sqlite default (DEF-002). This bootstrap runs before `initAdapters()`
 * resolves the engine, so compose wiring actually takes effect.
 *
 * No DATABASE_URL(_FILE) → nothing is written → behaviour is byte-identical
 * to before this module existed (sqlite default / admin-selected engine).
 */

import * as fs from 'fs';
import pino from 'pino';
import { DatabaseConfigService, type ConnectionParams } from './DatabaseConfigService.js';
import type { DatabaseConnectionConfig } from '../factory/DatabaseAdapterFactory.js';

const logger = pino({ name: 'engine-from-env' });

/** Values accepted in DATABASE_ADAPTER that mean "activate the postgres engine". */
const PG_ADAPTER_ALIASES = new Set(['postgresql', 'postgres', 'pg']);
/** sslmode query values that must enable TLS on the pg pool. */
const PG_SSL_MODES = new Set(['require', 'verify-ca', 'verify-full']);

/**
 * Resolve the connection URL: DATABASE_URL_FILE (Docker secret mount) wins
 * over DATABASE_URL. An unreadable/empty secret file falls back to DATABASE_URL.
 */
export function resolveDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string | null {
  const file = env.DATABASE_URL_FILE;
  if (file) {
    try {
      const value = fs.readFileSync(file, 'utf-8').trim();
      if (value) return value;
      logger.warn({ file }, 'DATABASE_URL_FILE is empty — falling back to DATABASE_URL');
    } catch (err) {
      logger.warn({ file, reason: (err as Error).message }, 'DATABASE_URL_FILE unreadable — falling back to DATABASE_URL');
    }
  }
  return env.DATABASE_URL?.trim() || null;
}

/** Percent-decode a URL component; a stray `%` must never crash boot. */
function decode(value: string): string {
  try { return decodeURIComponent(value); } catch { return value; }
}

/**
 * Parse a postgres connection URL into ConnectionParams.
 * Returns null for malformed input or non-postgres protocols so the caller
 * can leave database.json untouched instead of seeding unusable values.
 */
export function parsePostgresUrl(rawUrl: string): ConnectionParams | null {
  let url: URL;
  try { url = new URL(rawUrl.trim()); } catch { return null; }
  if (!PG_ADAPTER_ALIASES.has(url.protocol.replace(/:$/, ''))) return null;
  const database = decode(url.pathname.replace(/^\//, ''));
  if (!url.hostname || !database) return null;
  const sslmode = url.searchParams.get('sslmode');
  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 5432,
    username: decode(url.username),
    password: decode(url.password),
    database,
    ssl: sslmode !== null && PG_SSL_MODES.has(sslmode),
    // Match PostgresAdapter's own defaults so connection behaviour is unchanged.
    pool: { min: 2, max: 10 },
  };
}

/** True when the active postgres config already equals the env-derived params. */
function alreadyActive(service: DatabaseConfigService, params: ConnectionParams): boolean {
  const active: DatabaseConnectionConfig = service.getActiveConfig();
  if (active.engine !== 'postgresql') return false;
  return active.host === params.host && active.port === params.port &&
    active.username === params.username && active.password === params.password &&
    active.database === params.database && (active.ssl ?? false) === params.ssl;
}

/** DATABASE_ADAPTER, when set, must name a postgres variant — otherwise do nothing. */
function adapterAllowsPostgres(env: NodeJS.ProcessEnv): boolean {
  const adapter = env.DATABASE_ADAPTER?.trim().toLowerCase();
  if (!adapter || PG_ADAPTER_ALIASES.has(adapter)) return true;
  logger.warn({ adapter }, 'DATABASE_ADAPTER is not a postgres variant — leaving database.json unchanged');
  return false;
}

/**
 * Activate the postgresql engine from the environment when a URL is present.
 * Idempotent: an already-matching database.json is left untouched, so the
 * encrypted password is not re-written (new IV) on every boot.
 * @throws if database.json cannot be written — better to fail fast than to
 * silently run on sqlite while the operator asked for postgres.
 */
export function seedEngineFromEnv(dataDir: string, env: NodeJS.ProcessEnv = process.env): void {
  if (!adapterAllowsPostgres(env)) return;
  const rawUrl = resolveDatabaseUrl(env);
  if (!rawUrl) return;
  const params = parsePostgresUrl(rawUrl);
  if (!params) {
    logger.warn('DATABASE_URL is not a usable PostgreSQL URL — leaving database.json unchanged');
    return;
  }
  const service = new DatabaseConfigService(dataDir);
  if (alreadyActive(service, params)) return;
  fs.mkdirSync(dataDir, { recursive: true });
  service.setActiveEngine('postgresql', params);
  logger.info({ host: params.host, port: params.port, database: params.database },
    'Active DB engine seeded from environment: postgresql');
}
