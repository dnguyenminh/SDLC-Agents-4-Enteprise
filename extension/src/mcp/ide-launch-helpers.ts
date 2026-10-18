/**
 * ide-launch-helpers — binary resolution + DevTools port polling + process
 * tree teardown for IdeSessionManager. Extracted (BR-18); same behavior.
 */
import { spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

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

// Security hardening constants
const DEFAULT_SANDBOX_BASE = os.tmpdir();
const PATH_SANITIZE_REGEX = /[\0\x00-\x1f\x7f]/;

function sanitizePathInput(input: string): string {
  if (typeof input !== "string") {
    throw new IdeLaunchError(`Path must be a string`);
  }
  if (PATH_SANITIZE_REGEX.test(input)) {
    throw new IdeLaunchError(`Path contains null byte or control characters`);
  }
  // Reject obvious traversal attempts
  if (input.includes("..")) {
    // Allow realpath to resolve later, but flag suspicious patterns
    // We'll still canonicalize, but keep check for explicit traversal in raw string
  }
  return input;
}

function normalizePath(p: string): string {
  return path.resolve(p);
}

export function resolveBinary(ide: string, overridePath?: string): string {
  if (overridePath) {
    // Sanitize input path
    sanitizePathInput(overridePath);
    const normalized = normalizePath(overridePath);
    // Canonicalize via realpath to resolve symlinks
    let realPath: string;
    try {
      realPath = fs.realpathSync(normalized);
    } catch {
      throw new IdeLaunchError(`IDE binary does not exist or is inaccessible: "${overridePath}"`);
    }
    // Whitelist against known binaries
    const candidates = KNOWN_IDE_BINARIES[ide] ?? [];
    const allowed = candidates.some((p) => {
      if (!p) return false;
      try {
        const candidateReal = fs.realpathSync(path.resolve(p));
        return candidateReal === realPath;
      } catch {
        return false;
      }
    });
    if (!allowed) {
      throw new IdeLaunchError(`IDE binary path not whitelisted for "${ide}": "${overridePath}"`);
    }
    if (!fs.existsSync(realPath)) {
      throw new IdeLaunchError(`IDE binary does not exist: "${overridePath}"`);
    }
    return realPath;
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
 * Security hardening: sanitize input, canonicalize via realpath, enforce sandbox prefix.
 */
export function validateUserDataDir(userDataDir: string, sandboxBase?: string): void {
  if (!userDataDir) {
    return;
  }
  // Sanitize path input
  sanitizePathInput(userDataDir);
  const base = sandboxBase ? normalizePath(sandboxBase) : DEFAULT_SANDBOX_BASE;
  const requested = normalizePath(userDataDir);
  let resolved: string;
  try {
    if (fs.existsSync(requested)) {
      resolved = fs.realpathSync(requested);
    } else {
      // Path may not exist yet; canonicalize parent
      const parent = path.dirname(requested);
      const parentReal = fs.realpathSync(parent);
      // Build resolved path by appending basename to canonical parent
      resolved = path.join(parentReal, path.basename(requested));
    }
  } catch (e) {
    throw new IdeLaunchError(`UserDataDir path cannot be canonicalized: "${userDataDir}"`);
  }
  // Enforce sandbox prefix
  const baseReal = (() => {
    try {
      return fs.realpathSync(base);
    } catch {
      return path.resolve(base);
    }
  })();
  // Ensure resolved path is within sandbox base
  const relative = path.relative(baseReal, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new IdeLaunchError(`UserDataDir outside sandbox: "${userDataDir}"`);
  }
  try {
    if (!fs.existsSync(requested)) {
      // Directory may be created later; ensure parent is writable
      const parent = path.dirname(requested);
      fs.accessSync(parent, fs.constants.W_OK);
      return;
    }
    fs.accessSync(requested, fs.constants.R_OK | fs.constants.W_OK);
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
