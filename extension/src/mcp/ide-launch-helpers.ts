/**
 * ide-launch-helpers — binary resolution + DevTools port polling + process
 * tree teardown for IdeSessionManager. Extracted (BR-18); same behavior.
 */
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

export class IdeLaunchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdeLaunchError";
  }
}

const KNOWN_IDE_BINARIES: Record<string, string[]> = {
  code: [
    path.join(process.env.LOCALAPPDATA ?? "", "Programs", "Microsoft VS Code", "Code.exe"),
    "/usr/bin/code",
  ],
  kiro: [
    path.join(process.env.LOCALAPPDATA ?? "", "Programs", "Kiro", "Kiro.exe"),
    "/usr/bin/kiro",
  ],
  antigravity: [
    path.join(process.env.LOCALAPPDATA ?? "", "Programs", "Antigravity", "Antigravity.exe"),
    "/usr/bin/antigravity",
  ],
  kilo: ["/usr/bin/kilo"],
};

const DEVTOOLS_PORT_FILE = "DevToolsActivePort";
const DEFAULT_LAUNCH_WAIT_MS = 60_000;
const POLL_INTERVAL_MS = 500;
const MAX_TIMEOUT_SECONDS = 300;
const MIN_PORT = 1024;
const MAX_PORT = 65535;

export function resolveBinary(ide: string, overridePath?: string): string {
  if (overridePath) {
    if (!fs.existsSync(overridePath)) {
      throw new IdeLaunchError(`IDE binary does not exist: "${overridePath}"`);
    }
    return overridePath;
  }
  const candidates = KNOWN_IDE_BINARIES[ide] ?? [];
  const found = candidates.find((p) => p && fs.existsSync(p));
  if (!found) {
    throw new IdeLaunchError(
      `No known binary for IDE "${ide}". Provide ideBinaryPath explicitly.`,
    );
  }
  return found;
}

function readDevtoolsPort(userDataDir: string): string | null {
  const portFile = path.join(userDataDir, DEVTOOLS_PORT_FILE);
  if (!fs.existsSync(portFile)) {
    return null;
  }
  const content = fs.readFileSync(portFile, "utf-8");
  const port = content.split("\n")[0]?.trim();
  return port && /^\d+$/.test(port) ? port : null;
}

/**
 * Validate userDataDir accessibility and writability.
 * Throws IdeLaunchError if not accessible.
 */
export function validateUserDataDir(userDataDir: string): void {
  if (!userDataDir) {
    return;
  }
  try {
    if (!fs.existsSync(userDataDir)) {
      // Directory may be created later; ensure parent is writable
      const parent = path.dirname(userDataDir);
      fs.accessSync(parent, fs.constants.W_OK);
      return;
    }
    fs.accessSync(userDataDir, fs.constants.R_OK | fs.constants.W_OK);
  } catch {
    throw new IdeLaunchError(`UserDataDir not accessible: "${userDataDir}"`);
  }
}

/**
 * Validate remote debugging port range.
 */
export function validatePort(port: number): void {
  if (!Number.isInteger(port) || port < MIN_PORT || port > MAX_PORT) {
    throw new IdeLaunchError(`Remote debugging port must be between ${MIN_PORT} and ${MAX_PORT}`);
  }
}

/**
 * Validate timeout seconds (max 300s).
 */
export function validateTimeoutSeconds(timeoutSeconds?: number): number {
  const seconds = timeoutSeconds ?? 60;
  if (!Number.isInteger(seconds) || seconds <= 0 || seconds > MAX_TIMEOUT_SECONDS) {
    throw new IdeLaunchError(`timeoutSeconds must be >0 and <= ${MAX_TIMEOUT_SECONDS}`);
  }
  return seconds;
}

export async function waitForDevtoolsPort(userDataDir: string, options?: { timeoutMs?: number; explicitPort?: number }): Promise<string> {
  // If explicit port provided, return immediately for deterministic launch
  if (options?.explicitPort !== undefined) {
    return String(options.explicitPort);
  }

  const timeoutMs = options?.timeoutMs ?? DEFAULT_LAUNCH_WAIT_MS;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const port = readDevtoolsPort(userDataDir);
    if (port) {
      return port;
    }
    // Replace Atomics.wait with setTimeout-based polling
    await new Promise<void>((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  throw new IdeLaunchError(
    `IDE did not expose DevToolsActivePort within ${timeoutMs / 1000}s`,
  );
}

export function killProcessTree(pid: number): void {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { timeout: 10_000 });
    return;
  }
  spawnSync("kill", ["-9", `-${pid}`], { timeout: 10_000 });
  spawnSync("kill", ["-9", String(pid)], { timeout: 10_000 });
}
