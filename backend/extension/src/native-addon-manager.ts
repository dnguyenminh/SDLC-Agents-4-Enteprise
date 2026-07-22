import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { downloadFile, computeSha256, getProxyUrl } from "./addon-download-helpers";
import { detectSystemNodeMajorVersion, tryNodeVersionFallback, tryNapiVersionFallback } from "./platform-detector";

interface NativeAddonManifestEntry { url: string; size: number; sha256: string; }
interface NativeAddonManifest { "better-sqlite3": { version: string; releaseUrl: string; binaries: Record<string, NativeAddonManifestEntry> } }

export interface PlatformInfo {
  platform: string; arch: string; napiVersion: string; nodeMajorVersion: string;
  electronVersion: string; supported: boolean; cacheKey: string; cacheDir: string;
}

export class NativeAddonManager {
  private readonly globalStoragePath: string;
  private readonly extensionPath: string;
  private readonly outputChannel: vscode.OutputChannel;
  private readonly manifest: NativeAddonManifest;

  constructor(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel) {
    this.globalStoragePath = context.globalStorageUri.fsPath;
    this.extensionPath = context.extensionPath;
    this.outputChannel = outputChannel;
    this.manifest = this.loadManifest();
  }

  public async ensure(): Promise<string | null> {
    const info = this.getPlatformInfo();
    if (!info.supported) { this.showUnsupportedError(info); return null; }
    const bindingPath = path.join(info.cacheDir, "better_sqlite3.node");
    if (fs.existsSync(bindingPath)) {
      const stat = fs.statSync(bindingPath);
      if (stat.size > 0) {
        this.outputChannel.appendLine(`[NativeAddon] Cache hit: ${bindingPath} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
        return bindingPath;
      }
      fs.unlinkSync(bindingPath);
    }
    return this.downloadWithProgress(info);
  }

  public getCachedPath(): string | null {
    const info = this.getPlatformInfo();
    const bindingPath = path.join(info.cacheDir, "better_sqlite3.node");
    if (fs.existsSync(bindingPath) && fs.statSync(bindingPath).size > 0) { return bindingPath; }
    return null;
  }

  public async redownload(): Promise<string | null> {
    const info = this.getPlatformInfo();
    const bindingPath = path.join(info.cacheDir, "better_sqlite3.node");
    if (fs.existsSync(bindingPath)) { fs.unlinkSync(bindingPath); }
    return this.downloadWithProgress(info);
  }

  public getPlatformInfo(): PlatformInfo {
    const platform = process.platform;
    const arch = process.arch;
    const napiVersion = process.versions.napi || "9";
    const nodeMajorVersion = detectSystemNodeMajorVersion(this.outputChannel);
    const electronVersion = process.versions.electron || "unknown";
    const version = this.manifest["better-sqlite3"].version;
    const binaries = this.manifest["better-sqlite3"].binaries;

    let cacheKey = `node-v${nodeMajorVersion}-${platform}-${arch}`;
    let supported = cacheKey in binaries;
    if (!supported) {
      const fallbackKey = tryNodeVersionFallback(binaries, platform, arch, nodeMajorVersion, this.outputChannel);
      if (fallbackKey) { cacheKey = fallbackKey; supported = true; }
    }
    if (!supported) {
      const napiKey = tryNapiVersionFallback(binaries, platform, arch, napiVersion, this.outputChannel);
      if (napiKey) { cacheKey = napiKey; supported = true; }
    }
    const cacheDir = path.join(this.globalStoragePath, "native-addons", "better-sqlite3", `v${version}`, cacheKey);
    return { platform, arch, napiVersion, nodeMajorVersion, electronVersion, supported, cacheKey, cacheDir };
  }

  private loadManifest(): NativeAddonManifest {
    const manifestPath = path.join(this.extensionPath, "resources", "release-manifest.json");
    if (!fs.existsSync(manifestPath)) { throw new Error(`Release manifest not found: ${manifestPath}`); }
    return JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
  }

  private async downloadWithProgress(info: PlatformInfo): Promise<string | null> {
    const entry = this.manifest["better-sqlite3"].binaries[info.cacheKey];
    if (!entry) { this.showUnsupportedError(info); return null; }
    if (!fs.existsSync(info.cacheDir)) { fs.mkdirSync(info.cacheDir, { recursive: true }); }
    const bindingPath = path.join(info.cacheDir, "better_sqlite3.node");
    this.outputChannel.appendLine(`[NativeAddon] Downloading: ${entry.url}`);
    this.outputChannel.appendLine(`[NativeAddon] Target: ${bindingPath}`);
    return vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "SDLC Agents: Downloading native module...", cancellable: true },
      (progress, token) => this.attemptDownload(entry, bindingPath, info, progress, token)
    );
  }

  private async attemptDownload(
    entry: NativeAddonManifestEntry, bindingPath: string, info: PlatformInfo,
    progress: vscode.Progress<{ message?: string; increment?: number }>, token: vscode.CancellationToken
  ): Promise<string | null> {
    const backoffs = [0, 2000, 4000];
    for (let attempt = 0; attempt < 3; attempt++) {
      if (token.isCancellationRequested) { vscode.window.showInformationMessage("Download cancelled."); return null; }
      if (attempt > 0) {
        this.outputChannel.appendLine(`[NativeAddon] Retry ${attempt + 1}/3...`);
        progress.report({ message: `Retrying (${attempt + 1}/3)...` });
        await this.sleep(backoffs[attempt]);
      }
      try {
        await downloadFile(entry.url, bindingPath, entry.size, progress, token, getProxyUrl(), this.outputChannel);
        progress.report({ message: "Verifying integrity..." });
        const hash = await computeSha256(bindingPath);
        if (hash !== entry.sha256) {
          this.outputChannel.appendLine(`[NativeAddon] Checksum mismatch`);
          if (fs.existsSync(bindingPath)) { fs.unlinkSync(bindingPath); }
          continue;
        }
        this.outputChannel.appendLine(`[NativeAddon] ✅ Downloaded and verified: ${bindingPath}`);
        return bindingPath;
      } catch (err: any) {
        this.outputChannel.appendLine(`[NativeAddon] Attempt ${attempt + 1} failed: ${err.message}`);
        if (fs.existsSync(bindingPath)) {
          try { fs.unlinkSync(bindingPath); }
          catch (unlinkErr) { console.debug(`[NativeAddon] cleanup unlink failed (non-fatal): ${(unlinkErr as Error).message}`); }
        }
      }
    }
    this.showDownloadError(info);
    return null;
  }

  private showUnsupportedError(info: PlatformInfo): void {
    const msg = `Platform ${info.platform}-${info.arch} (Node v${info.nodeMajorVersion}) is not supported.`;
    this.outputChannel.appendLine(`[NativeAddon] ❌ ${msg}`);
    vscode.window.showErrorMessage(msg, "View Documentation").then((action) => {
      if (action === "View Documentation") { vscode.env.openExternal(vscode.Uri.parse(this.manifest["better-sqlite3"].releaseUrl)); }
    });
  }

  private showDownloadError(info: PlatformInfo): void {
    this.outputChannel.appendLine(`[NativeAddon] ❌ All download attempts failed for ${info.cacheKey}`);
    vscode.window.showErrorMessage("Failed to download native module after 3 attempts.", "Retry", "Manual Download").then((action) => {
      if (action === "Retry") { this.redownload(); }
      else if (action === "Manual Download") { vscode.env.openExternal(vscode.Uri.parse(this.manifest["better-sqlite3"].releaseUrl)); }
    });
  }

  private sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
}
