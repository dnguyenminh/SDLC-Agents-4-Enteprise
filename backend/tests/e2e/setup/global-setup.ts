/**
 * E2E Global Setup — starts a real server with ISOLATED temp database.
 *
 * CRITICAL: Production .code-intel/ is NEVER touched.
 * All data lives in a fresh temp directory that's cleaned up after tests.
 * Port is dynamically assigned (finds a free port) to avoid conflicts.
 */
import { spawn, type ChildProcess } from 'child_process';
import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { PORT_FILE_PATH } from './e2e-config.js';

const E2E_PASSWORD = 'test-admin-pw-01';
const STARTUP_TIMEOUT_MS = 30_000;
const HEALTH_POLL_INTERVAL_MS = 500;

let serverProcess: ChildProcess | null = null;
let tempDataDir: string | null = null;
let assignedPort: number = 0;

async function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address() as net.AddressInfo;
      const port = addr.port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

export async function setup(): Promise<void> {
  // 1. Create isolated temp directory for all DB files
  tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sa4e-e2e-'));
  console.log(`[E2E Setup] Temp data dir: ${tempDataDir}`);

  // 2. Find a free port
  assignedPort = await findFreePort();
  console.log(`[E2E Setup] Using free port: ${assignedPort}`);

  // 3. Write port to temp file so test files can read it
  fs.writeFileSync(PORT_FILE_PATH, String(assignedPort), 'utf-8');

  // 4. Start server with isolated environment
  const serverEntry = path.resolve(__dirname, '../../../src/index.ts');
  serverProcess = spawn('npx', ['tsx', serverEntry], {
    cwd: path.resolve(__dirname, '../../..'),
    env: {
      ...process.env,
      CODE_INTEL_DATA_DIR: tempDataDir,
      CODE_INTEL_WORKSPACE: tempDataDir,
      CODE_INTEL_PORT: String(assignedPort),
      ADMIN_INITIAL_PASSWORD: E2E_PASSWORD,
      NODE_ENV: 'test',
      LOG_LEVEL: 'warn',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: true,
  });

  serverProcess.stdout?.on('data', (d) => {
    const line = d.toString();
    if (line.includes('"level":50') || line.includes('"level":40')) {
      process.stderr.write(`[E2E Server] ${line}`);
    }
  });

  serverProcess.stderr?.on('data', (d) => {
    process.stderr.write(`[E2E Server ERR] ${d.toString()}`);
  });

  // 5. Wait for server to become healthy
  await waitForHealth();
  console.log(`[E2E Setup] Server ready on port ${assignedPort}`);
}

export async function teardown(): Promise<void> {
  // 1. Kill server process
  if (serverProcess) {
    serverProcess.kill('SIGTERM');
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        serverProcess?.kill('SIGKILL');
        resolve();
      }, 5000);
      serverProcess?.on('exit', () => { clearTimeout(timeout); resolve(); });
    });
    serverProcess = null;
    console.log('[E2E Teardown] Server stopped');
  }

  // 2. Clean up port file
  try { fs.unlinkSync(PORT_FILE_PATH); } catch { /* ignore */ }

  // 3. Clean up temp directory (retry on Windows EBUSY)
  if (tempDataDir && fs.existsSync(tempDataDir)) {
    await sleep(1000); // Wait for DB file handles to release on Windows
    try {
      fs.rmSync(tempDataDir, { recursive: true, force: true });
      console.log(`[E2E Teardown] Cleaned temp dir: ${tempDataDir}`);
    } catch (err: any) {
      console.warn(`[E2E Teardown] Could not clean temp dir (EBUSY on Windows is OK): ${err.message}`);
    }
    tempDataDir = null;
  }
}

async function waitForHealth(): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < STARTUP_TIMEOUT_MS) {
    try {
      const res = await fetch(`http://localhost:${assignedPort}/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (res.ok) return;
    } catch {
      // Server not ready yet
    }
    await sleep(HEALTH_POLL_INTERVAL_MS);
  }
  throw new Error(
    `[E2E Setup] Server did not become healthy within ${STARTUP_TIMEOUT_MS}ms`,
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
