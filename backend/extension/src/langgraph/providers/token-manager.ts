/**
 * TokenManager — KSA-231
 * AWS SSO credential detection, in-memory storage, and auto-refresh.
 * Security: Credentials exist ONLY in memory — never in settings, logs, or telemetry.
 */

import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { refreshTokenWithRetry } from "./token-refresh";

export type CredentialStatus = "active" | "refreshing" | "expired" | "no_credentials" | "unavailable";

export interface KiroCredentials {
  accessToken: string;
  expiresAt: Date;
  region: string;
  refreshToken: string;
  clientId: string;
  clientSecret: string;
  authMethod?: string;
  status: CredentialStatus;
  sourceFile: string;
}

class Mutex {
  private locked = false;
  private queue: (() => void)[] = [];
  async acquire(): Promise<void> {
    if (!this.locked) { this.locked = true; return; }
    return new Promise<void>(resolve => this.queue.push(resolve));
  }
  release(): void {
    if (this.queue.length > 0) this.queue.shift()!();
    else this.locked = false;
  }
}

export class TokenManager implements vscode.Disposable {
  private credentials: KiroCredentials | null = null;
  private refreshTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly refreshMutex = new Mutex();
  private watcher: vscode.FileSystemWatcher | null = null;
  private initialized = false;
  private readonly _onStatusChange = new vscode.EventEmitter<CredentialStatus>();
  readonly onStatusChange: vscode.Event<CredentialStatus> = this._onStatusChange.event;
  private readonly outputChannel: vscode.OutputChannel;

  constructor(outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    this.initialized = true;
    const cacheDir = path.join(os.homedir(), ".aws", "sso", "cache");
    if (!fs.existsSync(cacheDir)) { this.setStatus("unavailable"); return; }
    await this.scanAndSelectCredentials(cacheDir);
    this.startFileWatcher(cacheDir);
  }

  async getAccessToken(): Promise<string> {
    if (!this.initialized) await this.initialize();
    if (!this.credentials) throw new KiroCredentialError("No Kiro credentials available.");
    if (this.credentials.expiresAt.getTime() - Date.now() < 60_000) await this.refreshToken();
    if (!this.credentials || this.credentials.status === "expired") {
      throw new KiroCredentialError("Kiro token expired. Please re-login.");
    }
    return this.credentials.accessToken;
  }

  getRegion(): string | undefined {
    const override = vscode.workspace.getConfiguration("kiroSdlc").get<string>("kiroRegion", "");
    return override || this.credentials?.region;
  }

  getStatus(): CredentialStatus { return this.credentials?.status ?? "no_credentials"; }

  dispose(): void {
    if (this.refreshTimer) { clearTimeout(this.refreshTimer); this.refreshTimer = null; }
    if (this.watcher) { this.watcher.dispose(); this.watcher = null; }
    if (this.credentials) {
      this.credentials.accessToken = "";
      this.credentials.refreshToken = "";
      this.credentials.clientSecret = "";
      this.credentials = null;
    }
    this._onStatusChange.dispose();
  }

  async refreshToken(): Promise<void> {
    await this.refreshMutex.acquire();
    try {
      if (!this.credentials) return;
      if (this.credentials.expiresAt.getTime() - Date.now() > 4 * 60_000) return;
      const success = await refreshTokenWithRetry(this.credentials, {
        setStatus: (s) => this.setStatus(s),
        log: (l, m) => this.log(l, m),
        scheduleRefresh: () => this.scheduleRefresh(),
      });
      if (!success) this.refreshTimer = setTimeout(() => this.refreshToken(), 30_000);
    } finally {
      this.refreshMutex.release();
    }
  }

  private async scanAndSelectCredentials(cacheDir: string): Promise<void> {
    try {
      const files = fs.readdirSync(cacheDir).filter(f => f.endsWith(".json"));
      const candidates: KiroCredentials[] = [];
      for (const file of files) {
        try {
          const filePath = path.join(cacheDir, file);
          const cred = this.parseCredentialFile(JSON.parse(fs.readFileSync(filePath, "utf-8")), filePath);
          if (cred) candidates.push(cred);
        } catch { /* skip */ }
      }
      if (candidates.length === 0) { this.setStatus("no_credentials"); return; }
      const valid = candidates.filter(c => c.expiresAt.getTime() > Date.now());
      if (valid.length === 0) { this.setStatus("expired"); return; }
      valid.sort((a, b) => {
        if (a.authMethod === "idc" && b.authMethod !== "idc") return -1;
        if (a.authMethod !== "idc" && b.authMethod === "idc") return 1;
        return b.expiresAt.getTime() - a.expiresAt.getTime();
      });
      this.credentials = valid[0];
      this.credentials.status = "active";
      this.setStatus("active");
      this.scheduleRefresh();
    } catch (err) {
      this.log("ERROR", `Scan failed: ${(err as Error).message}`);
      this.setStatus("unavailable");
    }
  }

  private parseCredentialFile(data: any, filePath: string): KiroCredentials | null {
    if (!data.accessToken || !data.expiresAt || !data.region || !data.refreshToken || !data.clientId || !data.clientSecret) return null;
    const expiresAt = new Date(data.expiresAt);
    if (isNaN(expiresAt.getTime())) return null;
    if (!/^[a-z]{2}-[a-z]+-\d+$/.test(data.region)) return null;
    return {
      accessToken: data.accessToken, expiresAt, region: data.region,
      refreshToken: data.refreshToken, clientId: data.clientId, clientSecret: data.clientSecret,
      authMethod: data.authMethod, status: "active", sourceFile: filePath,
    };
  }

  private scheduleRefresh(): void {
    if (this.refreshTimer) clearTimeout(this.refreshTimer);
    if (!this.credentials) return;
    const delay = Math.max(this.credentials.expiresAt.getTime() - 5 * 60_000 - Date.now(), 10_000);
    this.refreshTimer = setTimeout(() => this.refreshToken(), delay);
  }

  private startFileWatcher(cacheDir: string): void {
    const pattern = new vscode.RelativePattern(vscode.Uri.file(cacheDir), "*.json");
    this.watcher = vscode.workspace.createFileSystemWatcher(pattern);
    const rescan = () => this.scanAndSelectCredentials(cacheDir);
    this.watcher.onDidCreate(rescan);
    this.watcher.onDidChange(rescan);
  }

  private setStatus(status: CredentialStatus): void {
    if (this.credentials) this.credentials.status = status;
    this._onStatusChange.fire(status);
  }

  private log(level: string, message: string): void {
    this.outputChannel.appendLine(`[${level}] TokenManager: ${message}`);
  }
}

export class KiroCredentialError extends Error {
  constructor(message: string, options?: ErrorOptions) { super(message, options); this.name = "KiroCredentialError"; }
}

export class KiroRefreshError extends Error {
  constructor(message: string, options?: ErrorOptions) { super(message, options); this.name = "KiroRefreshError"; }
}
