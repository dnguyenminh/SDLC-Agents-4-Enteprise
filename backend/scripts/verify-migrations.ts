#!/usr/bin/env npx tsx
/**
 * SA4E-44 Migration Verification Script
 *
 * Verifies that all migrations have been applied successfully.
 * Used in CI before running tests.
 *
 * Usage: npx tsx scripts/verify-migrations.ts
 * Exit: 0 = all applied, 1 = missing migrations
 */
import { Client } from 'pg';

const EXPECTED_MIGRATIONS = [
  '001-add-scope-columns',
  '002-add-evolution-columns',
  '003-pending-tasks',
  '004-code-intel-files',
  '005-code-intel-symbols',
  '006-code-intel-imports',
  '007-code-intel-dependencies',
  '008-code-intel-call-graph',
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

    // Check if _migrations table exists
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = '_migrations'
      );
    `);

    if (!tableCheck.rows[0].exists) {
      console.error('_migrations table does not exist. Run migrations first.');
      process.exit(1);
    }

    const result = await client.query('SELECT name FROM _migrations ORDER BY id');
    const applied = new Set(result.rows.map((r: { name: string }) => r.name));

    const missing: string[] = [];
    for (const name of EXPECTED_MIGRATIONS) {
      if (!applied.has(name)) {
        missing.push(name);
      }
    }

    if (missing.length > 0) {
      console.error('Missing migrations:');
      for (const m of missing) {
        console.error(`  - ${m}`);
      }
      process.exit(1);
    }

    console.log(`All ${EXPECTED_MIGRATIONS.length} migrations verified.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('Verification error:', err);
  process.exit(1);
});
