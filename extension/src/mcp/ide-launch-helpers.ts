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
const LAUNCH_WAIT_MS = 30_000;
const POLL_INTERVAL_MS = 500;

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

export function waitForDevtoolsPort(userDataDir: string): string {
  const deadline = Date.now() + LAUNCH_WAIT_MS;
  while (Date.now() < deadline) {
    const port = readDevtoolsPort(userDataDir);
    if (port) {
      return port;
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, POLL_INTERVAL_MS);
  }
  throw new IdeLaunchError(
    `IDE did not expose DevToolsActivePort within ${LAUNCH_WAIT_MS / 1000}s`,
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
