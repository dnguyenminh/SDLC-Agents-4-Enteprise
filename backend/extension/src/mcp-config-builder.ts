/**
 * MCP config file operations — resolve, write, and manage MCP server configurations.
 * Extracted from mcp-injector.ts.
 */
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as vscode from "vscode";
import { MCP_SERVERS_DIR, GITHUB_RELEASE_REPO, McpVariant } from "./config";
import { debugError } from "./debug-logger";

export function resolveConfig(variant: McpVariant, root: string): Record<string, unknown> {
  const serversDir = getMcpServersDir(root);
  const config: Record<string, unknown> = { ...variant.config };
  const args = (variant.config.args || []).map((arg: string) =>
    arg.replace("${mcpServersDir}", serversDir).replace("${workspaceFolder}", root)
  );
  config.args = args;
  if (variant.config.cwd) {
    config.cwd = variant.config.cwd.replace("${mcpServersDir}", serversDir).replace("${workspaceFolder}", root);
  }
  config.env = { CODE_INTEL_WORKSPACE: root, CODE_INTEL_VIEWER_PORT: "3200", FORCE_RESTART: "15" };
  return config;
}

export function writeDefaultOrchestrationConfig(root: string): void {
  const orchPath = path.join(root, ".code-intel", "orchestration.json");
  if (fs.existsSync(orchPath)) { return; }
  const defaultConfig = {
    mcpServers: {},
    settings: {
      autoLog: { enabled: true, excludeTools: ["mem_audit", "mem_status"], maxArgLength: 200 },
      healthCheckIntervalMs: 30000, maxRestartRetries: 3,
      similarityThreshold: 0.7, maxRecursionDepth: 3,
      discoveryTimeoutMs: 10000, kbSearchTimeoutMs: 2000
    }
  };
  fs.mkdirSync(path.dirname(orchPath), { recursive: true });
  fs.writeFileSync(orchPath, JSON.stringify(defaultConfig, null, 2));
}

export function writeMcpConfig(root: string, serverConfig: Record<string, unknown>): void {
  const mcpConfigPath = path.join(root, ".kiro", "settings", "mcp.json");
  let config: Record<string, unknown> = { mcpServers: {} };
  if (fs.existsSync(mcpConfigPath)) {
    try {
      config = JSON.parse(fs.readFileSync(mcpConfigPath, "utf-8"));
      config.mcpServers = config.mcpServers || {};
    } catch (err) {
      debugError("[McpInjector] Failed to parse existing mcp.json, resetting", err as Error);
      config = { mcpServers: {} };
    }
  }
  const servers = config.mcpServers as Record<string, unknown>;
  const existing = (servers["code-intelligence"] as Record<string, unknown>) || {};
  servers["code-intelligence"] = { ...existing, ...serverConfig };
  fs.mkdirSync(path.dirname(mcpConfigPath), { recursive: true });
  fs.writeFileSync(mcpConfigPath, JSON.stringify(config, null, 2));
}

export async function downloadVariant(variant: McpVariant, root: string): Promise<boolean> {
  if (!variant.downloadAsset) { return false; }
  const destDir = getMcpServersDir(root);
  const assetPath = path.join(destDir, variant.downloadAsset);
  if (fs.existsSync(assetPath.replace(".zip", "").replace(".jar", ".jar"))) {
    const reuse = await vscode.window.showInformationMessage(
      `MCP server "${variant.id}" already downloaded. Re-download?`, "Use Existing", "Re-download"
    );
    if (reuse === "Use Existing") { return true; }
  }
  const url = `https://github.com/${GITHUB_RELEASE_REPO}/releases/latest/download/${variant.downloadAsset}`;
  return vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: `Downloading ${variant.id} MCP server...` },
    async () => {
      try {
        fs.mkdirSync(destDir, { recursive: true });
        await downloadFile(url, assetPath);
        if (assetPath.endsWith(".zip")) {
          await extractZip(assetPath, path.join(destDir, variant.id));
          fs.unlinkSync(assetPath);
        }
        vscode.window.showInformationMessage(`✅ Downloaded ${variant.id} MCP server`);
        return true;
      } catch (err) { vscode.window.showErrorMessage(`Failed to download: ${err}`); return false; }
    }
  );
}

export function getMcpServersDir(root?: string): string {
  if (root) return path.join(root, MCP_SERVERS_DIR);
  const folders = vscode.workspace.workspaceFolders;
  if (folders && folders.length > 0) return path.join(folders[0].uri.fsPath, MCP_SERVERS_DIR);
  return path.join(os.homedir(), MCP_SERVERS_DIR);
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) { throw new Error(`HTTP ${response.status}: ${url}`); }
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(dest, buffer);
}

async function extractZip(zipPath: string, destDir: string): Promise<void> {
  fs.mkdirSync(destDir, { recursive: true });
  const resolvedZip = path.resolve(zipPath);
  const resolvedDest = path.resolve(destDir);
  if (process.platform === "win32") {
    const scriptPath = path.join(os.tmpdir(), `extract-${Date.now()}-${path.basename(resolvedZip, ".zip")}.ps1`);
    fs.writeFileSync(scriptPath, `Expand-Archive -LiteralPath '${resolvedZip.replace(/'/g, "''")}' -DestinationPath '${resolvedDest.replace(/'/g, "''")}' -Force`, "utf-8");
    try {
      const { execFileSync } = await import("child_process");
      execFileSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath], { stdio: "ignore" });
    } finally { try { fs.unlinkSync(scriptPath); } catch { } }
  } else {
    const { execFileSync } = await import("child_process");
    execFileSync("unzip", ["-o", resolvedZip, "-d", resolvedDest], { stdio: "ignore" });
  }
}
