/**
 * Shared fixtures for the drawio-convert E2E test (SA4E-124 / SA4E-336).
 * Extracted from drawio-convert.e2e.test.ts so the test file stays ≤200 lines.
 */
import * as fs from 'fs';
import * as path from 'path';

export const TEST_PORT = 9183;
export const TEST_WRAPPER_PORT = 9184;
export const BACKEND_DIR = path.resolve(__dirname, '../../../backend');
export const WORKSPACE_DIR = path.resolve(__dirname, '../../../');
export const DIAGRAMS_DIR = path.join(WORKSPACE_DIR, 'documents/SA4E-124/diagrams');
export const BACKEND_DATA_DIR = path.join(__dirname, '.tmp-e2e-drawio-backend-data');

/**
 * Create a fresh isolated DATA_DIR for the spawned backend. The backend reads
 * its active DB engine from <DATA_DIR>/database.json; without isolation it can
 * inherit machine-local state (e.g. a postgres engine with no reachable server)
 * and exit before printing readiness. Isolation forces the sqlite default, so
 * the E2E backend boots deterministically on any machine (SA4E-336).
 */
export function resetBackendDataDir(): string {
  fs.rmSync(BACKEND_DATA_DIR, { recursive: true, force: true });
  fs.mkdirSync(BACKEND_DATA_DIR, { recursive: true });
  return BACKEND_DATA_DIR;
}

/** Best-effort removal of the isolated DATA_DIR (never fails the suite). */
export function cleanupBackendDataDir(): void {
  try {
    fs.rmSync(BACKEND_DATA_DIR, { recursive: true, force: true });
  } catch {
    // Ignore: leftover temp data must not fail the E2E suite.
  }
}
