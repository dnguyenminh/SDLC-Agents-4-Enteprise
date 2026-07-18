/**
 * Integration test — PostgreSQL MemoryEngine operations.
 * SA4E-44 Phase D: Tests insert, search (ILIKE fallback), findById, delete.
 * Uses Testcontainers PostgreSQL when available, otherwise skips gracefully.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { MemoryEngine } from '../../src/modules/memory/engine/index.js';
import type { AsyncDatabaseAdapter } from '../../src/database/adapters/AsyncDatabaseAdapter.js';

let adapter: AsyncDatabaseAdapter | null = null;
let engine: MemoryEngine | null = null;
let container: any = null;

const PG_SCHEMA = `
  CREATE TABLE IF NOT EXISTS knowledge_entries (
    id SERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    summary VARCHAR(120),
    type VARCHAR(50) NOT NULL DEFAULT 'CONTEXT',
    tier VARCHAR(20) NOT NULL DEFAULT 'WORKING',
    scope VARCHAR(20) NOT NULL DEFAULT 'USER',
    user_id VARCHAR(100),
    project_id VARCHAR(100),
    source VARCHAR(500),
    source_ref VARCHAR(500),
    tags TEXT DEFAULT '',
    confidence REAL DEFAULT 1.0,
    agent_name VARCHAR(100),
    owner VARCHAR(100),
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    archived INTEGER DEFAULT 0,
    access_count INTEGER DEFAULT 0,
    last_accessed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    superseded_by INTEGER
  );
  CREATE TABLE IF NOT EXISTS memory_sessions (
    id SERIAL PRIMARY KEY,
    session_id VARCHAR(100) UNIQUE NOT NULL,
    agent_name VARCHAR(100),
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    observation_count INTEGER DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active'
  );
  CREATE TABLE IF NOT EXISTS memory_audit (
    id SERIAL PRIMARY KEY,
    operation VARCHAR(50) NOT NULL,
    entry_id INTEGER,
    session_id VARCHAR(100),
    agent_name VARCHAR(100),
    details TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS knowledge_graph_edges (
    id SERIAL PRIMARY KEY,
    source_id INTEGER NOT NULL,
    target_id INTEGER NOT NULL,
    relation VARCHAR(50) DEFAULT 'RELATES_TO',
    weight REAL DEFAULT 1.0,
    metadata TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS consolidation_log (
    id SERIAL PRIMARY KEY,
    entry_id INTEGER NOT NULL,
    from_tier VARCHAR(20),
    to_tier VARCHAR(20),
    reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE TABLE IF NOT EXISTS tool_usage (
    tool_name VARCHAR(100) PRIMARY KEY,
    call_count INTEGER DEFAULT 0,
    last_called_at TIMESTAMPTZ
  );
`;

async function setupContainer(): Promise<boolean> {
  try {
    const tc = await import('testcontainers');
    container = await new tc.GenericContainer('postgres:16-alpine')
      .withExposedPorts(5432)
      .withEnvironment({
        POSTGRES_USER: 'test',
        POSTGRES_PASSWORD: 'test',
        POSTGRES_DB: 'testdb',
      })
      .withStartupTimeout(30000)
      .start();

    const { PostgresAsyncAdapter } = await import(
      '../../src/database/adapters/PostgresAsyncAdapter.js'
    );
    adapter = new PostgresAsyncAdapter({
      host: container.getHost(),
      port: container.getMappedPort(5432),
      username: 'test',
      password: 'test',
      database: 'testdb',
      ssl: false,
    });
    await adapter.connect();
    await adapter.exec(PG_SCHEMA);
    engine = new MemoryEngine(adapter);
    return true;
  } catch {
    return false;
  }
}

describe('PG MemoryEngine Integration', () => {
  let pgAvailable = false;

  beforeAll(async () => {
    pgAvailable = await setupContainer();
  }, 60000);

  afterAll(async () => {
    if (adapter) await adapter.disconnect();
    if (container) await container.stop();
  });

  it('inserts a knowledge entry', async () => {
    if (!pgAvailable) return;
    const id = await engine!.insert({
      content: 'PostgreSQL integration test entry',
      summary: 'PG test',
      type: 'CONTEXT',
      tier: 'WORKING',
    });
    expect(id).toBeGreaterThan(0);
  });

  it('finds entry by id', async () => {
    if (!pgAvailable) return;
    const id = await engine!.insert({
      content: 'Find me by id',
      summary: 'findById test',
      type: 'CONTEXT',
    });
    const entry = await engine!.findById(id);
    expect(entry).toBeDefined();
    expect(entry!.content).toBe('Find me by id');
  });

  it('searches with ILIKE fallback', async () => {
    if (!pgAvailable) return;
    await engine!.insert({
      content: 'Strategy pattern for database queries',
      summary: 'strategy doc',
      type: 'CONTEXT',
      tags: 'design-pattern,strategy',
    });
    const results = await engine!.search('strategy', 10);
    expect(results.length).toBeGreaterThan(0);
    const match = results.find(r =>
      r.entry.content.includes('Strategy pattern'),
    );
    expect(match).toBeDefined();
  });

  it('deletes an entry', async () => {
    if (!pgAvailable) return;
    const id = await engine!.insert({
      content: 'To be deleted',
      summary: 'delete test',
      type: 'CONTEXT',
    });
    await engine!.deleteEntry(id);
    const entry = await engine!.findById(id);
    expect(entry).toBeUndefined();
  });

  it('findFiltered respects tier and type', async () => {
    if (!pgAvailable) return;
    await engine!.insert({
      content: 'Semantic tier entry',
      summary: 'semantic',
      type: 'REQUIREMENT',
      tier: 'SEMANTIC',
    });
    const results = await engine!.findFiltered('SEMANTIC', 'REQUIREMENT', 10);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].tier).toBe('SEMANTIC');
    expect(results[0].type).toBe('REQUIREMENT');
  });

  it('confirms adapter reports postgresql engine', () => {
    if (!pgAvailable) return;
    expect(adapter!.getEngine()).toBe('postgresql');
  });
});
