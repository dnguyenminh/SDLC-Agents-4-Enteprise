#!/usr/bin/env npx tsx
/**
 * SA4E-44 Database Migration Runner
 *
 * Runs all migrations in order against PostgreSQL.
 * Usage: npx tsx scripts/run-migrations.ts
 *
 * Migrations executed:
 *   001 - Add scope columns to knowledge_entries
 *   002 - Add evolution columns
 *   003 - Pending tasks table (Task Queue)
 *   004-008 - Code Intelligence tables (to be created by DEV)
 *
 * Exit codes:
 *   0 = all migrations succeeded
 *   1 = migration failure
 */
import { Client } from 'pg';

interface MigrationRecord {
  id: string;
  name: string;
  applied_at: string;
}

async function ensureMigrationsTable(client: Client): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
}

async function getAppliedMigrations(client: Client): Promise<Set<string>> {
  const result = await client.query<MigrationRecord>(
    'SELECT name FROM _migrations ORDER BY id'
  );
  return new Set(result.rows.map(r => r.name));
}

async function recordMigration(client: Client, name: string): Promise<void> {
  await client.query(
    'INSERT INTO _migrations (name) VALUES ($1)',
    [name]
  );
}

// Migration definitions - add new migrations here in order
const MIGRATIONS: Array<{ name: string; sql: string }> = [
  {
    name: '001-add-scope-columns',
    sql: `
      ALTER TABLE knowledge_entries ADD COLUMN IF NOT EXISTS scope VARCHAR(20) DEFAULT 'SESSION';
      ALTER TABLE knowledge_entries ADD COLUMN IF NOT EXISTS project_id VARCHAR(100);
    `,
  },
  {
    name: '002-add-evolution-columns',
    sql: `
      ALTER TABLE knowledge_entries ADD COLUMN IF NOT EXISTS evolution_stage VARCHAR(20) DEFAULT 'ACTIVE';
      ALTER TABLE knowledge_entries ADD COLUMN IF NOT EXISTS access_count INTEGER DEFAULT 0;
      ALTER TABLE knowledge_entries ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMPTZ;
      ALTER TABLE knowledge_entries ADD COLUMN IF NOT EXISTS promoted_at TIMESTAMPTZ;
    `,
  },
  {
    name: '003-pending-tasks',
    sql: `
      CREATE TABLE IF NOT EXISTS pending_tasks (
        id SERIAL PRIMARY KEY,
        task_type VARCHAR(50) NOT NULL,
        payload JSONB NOT NULL DEFAULT '{}',
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        priority INTEGER NOT NULL DEFAULT 0,
        retry_count INTEGER NOT NULL DEFAULT 0,
        max_retries INTEGER NOT NULL DEFAULT 3,
        error_message TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        claimed_at TIMESTAMPTZ,
        completed_at TIMESTAMPTZ,
        dead_lettered_at TIMESTAMPTZ
      );
      CREATE INDEX IF NOT EXISTS idx_pending_tasks_status ON pending_tasks(status);
      CREATE INDEX IF NOT EXISTS idx_pending_tasks_type_status ON pending_tasks(task_type, status);
      CREATE INDEX IF NOT EXISTS idx_pending_tasks_priority ON pending_tasks(priority DESC, created_at ASC);
    `,
  },
  {
    name: '004-code-intel-files',
    sql: `
      CREATE TABLE IF NOT EXISTS code_files (
        id SERIAL PRIMARY KEY,
        file_path VARCHAR(1024) NOT NULL UNIQUE,
        language VARCHAR(50),
        content_hash VARCHAR(64) NOT NULL,
        file_size INTEGER,
        last_modified TIMESTAMPTZ NOT NULL,
        indexed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_code_files_path ON code_files(file_path);
      CREATE INDEX IF NOT EXISTS idx_code_files_language ON code_files(language);
    `,
  },
  {
    name: '005-code-intel-symbols',
    sql: `
      CREATE TABLE IF NOT EXISTS code_symbols (
        id SERIAL PRIMARY KEY,
        file_id INTEGER NOT NULL REFERENCES code_files(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        kind VARCHAR(50) NOT NULL,
        start_line INTEGER NOT NULL,
        end_line INTEGER NOT NULL,
        parent_symbol_id INTEGER REFERENCES code_symbols(id),
        signature TEXT,
        documentation TEXT,
        exported BOOLEAN DEFAULT false
      );
      CREATE INDEX IF NOT EXISTS idx_code_symbols_name ON code_symbols(name);
      CREATE INDEX IF NOT EXISTS idx_code_symbols_file ON code_symbols(file_id);
      CREATE INDEX IF NOT EXISTS idx_code_symbols_kind ON code_symbols(kind);
    `,
  },
  {
    name: '006-code-intel-imports',
    sql: `
      CREATE TABLE IF NOT EXISTS code_imports (
        id SERIAL PRIMARY KEY,
        file_id INTEGER NOT NULL REFERENCES code_files(id) ON DELETE CASCADE,
        source VARCHAR(1024) NOT NULL,
        specifiers JSONB NOT NULL DEFAULT '[]',
        is_type_only BOOLEAN DEFAULT false,
        line_number INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_code_imports_file ON code_imports(file_id);
      CREATE INDEX IF NOT EXISTS idx_code_imports_source ON code_imports(source);
    `,
  },
  {
    name: '007-code-intel-dependencies',
    sql: `
      CREATE TABLE IF NOT EXISTS code_dependencies (
        id SERIAL PRIMARY KEY,
        source_file_id INTEGER NOT NULL REFERENCES code_files(id) ON DELETE CASCADE,
        target_file_id INTEGER REFERENCES code_files(id) ON DELETE SET NULL,
        target_path VARCHAR(1024) NOT NULL,
        dependency_type VARCHAR(20) NOT NULL DEFAULT 'import'
      );
      CREATE INDEX IF NOT EXISTS idx_code_deps_source ON code_dependencies(source_file_id);
      CREATE INDEX IF NOT EXISTS idx_code_deps_target ON code_dependencies(target_file_id);
    `,
  },
  {
    name: '008-code-intel-call-graph',
    sql: `
      CREATE TABLE IF NOT EXISTS code_call_graph (
        id SERIAL PRIMARY KEY,
        caller_symbol_id INTEGER NOT NULL REFERENCES code_symbols(id) ON DELETE CASCADE,
        callee_symbol_id INTEGER NOT NULL REFERENCES code_symbols(id) ON DELETE CASCADE,
        call_site_line INTEGER,
        UNIQUE(caller_symbol_id, callee_symbol_id, call_site_line)
      );
      CREATE INDEX IF NOT EXISTS idx_call_graph_caller ON code_call_graph(caller_symbol_id);
      CREATE INDEX IF NOT EXISTS idx_call_graph_callee ON code_call_graph(callee_symbol_id);
    `,
  },
];

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL');

    await ensureMigrationsTable(client);
    const applied = await getAppliedMigrations(client);
    console.log(`Applied migrations: ${applied.size}`);

    let newMigrations = 0;
    for (const migration of MIGRATIONS) {
      if (applied.has(migration.name)) {
        console.log(`  Skip: ${migration.name} (already applied)`);
        continue;
      }

      console.log(`  Running: ${migration.name}...`);
      await client.query('BEGIN');
      try {
        await client.query(migration.sql);
        await recordMigration(client, migration.name);
        await client.query('COMMIT');
        console.log(`  Done: ${migration.name}`);
        newMigrations++;
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`  FAILED: ${migration.name}`, err);
        process.exit(1);
      }
    }

    console.log(`\nMigration complete. ${newMigrations} new migration(s) applied.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Migration runner error:', err);
  process.exit(1);
});
