/**
 * Global vitest setup.
 *
 * 1. Provides a deterministic, policy-compliant (>=12 char) admin password via
 *    ADMIN_INITIAL_PASSWORD so the seeded admin account is known to tests.
 *    This replaces the removed hardcoded admin/admin default (vuln-0001).
 * 2. Isolates all DB files in a fresh temp workspace so the admin account is
 *    seeded fresh with the env password, without touching the developer's
 *    real .code-intel/admin.db.
 *
 * NOTE: These env vars must be set before admin-db.ts is first imported, which
 * is guaranteed because vitest runs setupFiles before the test module graph.
 */
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';

if (!process.env.ADMIN_INITIAL_PASSWORD) {
  process.env.ADMIN_INITIAL_PASSWORD = 'test-admin-pw-01';
}

if (!process.env.CODE_INTEL_WORKSPACE) {
  process.env.CODE_INTEL_WORKSPACE = fs.mkdtempSync(path.join(os.tmpdir(), 'sa4e-test-'));
}
