/**
 * Shared E2E test configuration.
 * Port is dynamically assigned by global-setup and written to a temp file.
 * All test files MUST import from here — never hardcode port.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const PORT_FILE = path.join(os.tmpdir(), 'sa4e-e2e-port.txt');

function readPort(): number {
  try {
    return parseInt(fs.readFileSync(PORT_FILE, 'utf-8').trim(), 10);
  } catch {
    // Fallback: if running against a manually started server
    return parseInt(process.env.E2E_PORT || '48721', 10);
  }
}

export const E2E_PORT = readPort();
export const BASE_URL = `http://localhost:${E2E_PORT}`;
export const ADMIN_URL = `${BASE_URL}/admin`;
export const API_URL = `${BASE_URL}/api/admin`;
export const E2E_PASSWORD = 'test-admin-pw-01';
export const PORT_FILE_PATH = PORT_FILE;
