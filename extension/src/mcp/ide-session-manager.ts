/**
 * IdeSessionManager — launches VSCode-like IDEs (VSCode, Kiro, Antigravity, Kilo)
 * with remote debugging and drives them via puppeteer-core (CDP).
 *
 * Puppeteer talks CDP natively — no per-fork chromedriver binary is needed
 * (SA4E-344 spike: Kiro 1.2.37 = Chromium 152, CDP attach verified).
 *
 * Session lifecycle: launch (spawn + read DevToolsActivePort) → attach
 * (puppeteer.connect) → operate (screenshot/evaluate/inspect) → close
 * (disconnect, kill spawned process tree).
 */
import { spawn, spawnSync, type ChildProcess } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export class IdeLaunchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "IdeLaunchError";
  }
}

export interface IdeSession {
  id: string;
  ide: string;
  cdpEndpoint: string;
  browser?: unknown;
  pid?: number;
  spawnedByLaunch: boolean;
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

function resolveBinary(ide: string, overridePath?: string): string {
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

function waitForDevtoolsPort(userDataDir: string): string {
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

function killProcessTree(pid: number): void {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { timeout: 10_000 });
    return;
  }
  spawnSync("kill", ["-9", `-${pid}`], { timeout: 10_000 });
  spawnSync("kill", ["-9", String(pid)], { timeout: 10_000 });
}

export class IdeSessionManager {
  private readonly sessions = new Map<string, IdeSession>();
  private counter = 0;

  listSessions(): IdeSession[] {
    return [...this.sessions.values()].map(({ browser: _b, ...rest }) => rest);
  }

  getSession(id: string): IdeSession | undefined {
    return this.sessions.get(id);
  }

  async launch(ide: string, ideBinaryPath?: string, userDataDir?: string): Promise<IdeSession> {
    const binary = resolveBinary(ide, ideBinaryPath);
    const profileDir =
      userDataDir ?? path.join(os.tmpdir(), `sa4e-ide-${ide}-${Date.now()}`);
    fs.mkdirSync(profileDir, { recursive: true });

    const child = spawn(binary, [
      `--remote-debugging-port=0`,
      `--user-data-dir=${profileDir}`,
      "--no-first-run",
      "--disable-gpu",
    ], { detached: false, stdio: "ignore" });

    try {
      const port = waitForDevtoolsPort(profileDir);
      const session: IdeSession = {
        id: `ide-${++this.counter}`,
        ide,
        cdpEndpoint: `http://127.0.0.1:${port}`,
        pid: child.pid,
        spawnedByLaunch: true,
      };
      this.sessions.set(session.id, session);
      return session;
    } catch (err) {
      if (child.pid) {
        killProcessTree(child.pid);
      }
      throw err;
    }
  }

  async attach(sessionId: string, cdpEndpoint?: string): Promise<IdeSession> {
    const session = this.sessions.get(sessionId);
    const endpoint = cdpEndpoint ?? session?.cdpEndpoint;
    if (!endpoint) {
      throw new IdeLaunchError(
        `No CDP endpoint for session "${sessionId}". Launch an IDE first or pass cdpEndpoint.`,
      );
    }
    // @ts-ignore — pre-built ESM JS module without type declarations
    // (same convention as devtools-bridge.ts importing the vendored barrel)
    const { puppeteer } = await import("./devtools/third_party/index.js");
    const browser = await (puppeteer as any).connect({
      browserUrl: endpoint,
      defaultViewport: null,
    });
    const target = (session ?? {
      id: sessionId,
      ide: "attached",
      cdpEndpoint: endpoint,
      spawnedByLaunch: false,
    }) as IdeSession;
    target.browser = browser;
    this.sessions.set(target.id, target);
    return target;
  }

  async getWorkbenchPage(sessionId: string): Promise<any> {
    const session = this.sessions.get(sessionId);
    if (!session?.browser) {
      throw new IdeLaunchError(`Session "${sessionId}" is not attached. Call ide_attach first.`);
    }
    const pages = await (session.browser as any).pages();
    const workbench = pages.find((p: any) => p.url().includes("workbench")) ?? pages[0];
    if (!workbench) {
      throw new IdeLaunchError(`No open page found for session "${sessionId}".`);
    }
    return workbench;
  }

  async screenshot(sessionId: string): Promise<string> {
    const page = await this.getWorkbenchPage(sessionId);
    return page.screenshot({ encoding: "base64" });
  }

  async evaluate(sessionId: string, script: string): Promise<unknown> {
    const page = await this.getWorkbenchPage(sessionId);
    return page.evaluate(script);
  }

  async inspect(sessionId: string): Promise<Record<string, unknown>> {
    const session = this.sessions.get(sessionId)!;
    const page = await this.getWorkbenchPage(sessionId);
    const state = await page.evaluate(() => {
      const q = (sel: string) => Boolean(document.querySelector(sel));
      return {
        title: document.title,
        url: location.href,
        workbenchVisible: q(".monaco-workbench"),
        panelVisible: q("#workbench.parts.panel"),
        sidebarVisible: q("#workbench.parts.sidebar"),
        activityBarVisible: q("#workbench.parts.activitybar"),
      };
    });
    return { sessionId: session.id, ide: session.ide, ...state };
  }

  async close(sessionId: string, kill = true): Promise<Record<string, unknown>> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new IdeLaunchError(`Unknown session "${sessionId}".`);
    }
    const browser = session.browser as any;
    if (browser) {
      await browser.disconnect().catch(() => undefined);
    }
    if (kill && session.spawnedByLaunch && session.pid) {
      killProcessTree(session.pid);
    }
    this.sessions.delete(sessionId);
    return { sessionId, closed: true, killed: kill && session.spawnedByLaunch };
  }
}
