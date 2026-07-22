/**
 * MCP server config injection — handles migration from legacy scripts,
 * downloads MCP servers from GitHub Release, and injects config.
 */
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import { MCP_VARIANTS } from "./config";
import { debugError } from "./debug-logger";
import { resolveConfig, writeDefaultOrchestrationConfig, writeMcpConfig, downloadVariant } from "./mcp-config-builder";
import { readJsonFile, writeJsonFile } from "./utils/mcp-config-file";

/** Migrate legacy scripts folder and report what was cleaned up. */
export function migrateLegacyScripts(root: string): { removed: boolean } {
  let removed = false;
  const scriptsDir = path.join(root, ".analysis", "code-intelligence", "scripts");
  if (fs.existsSync(scriptsDir)) { fs.rmSync(scriptsDir, { recursive: true, force: true }); removed = true; }
  return { removed };
}

/** Show picker for MCP variant and inject config into .kiro/settings/mcp.json. */
export async function injectMcpConfig(root: string): Promise<string | null> {
  const variantPicks = MCP_VARIANTS.map(v => ({ label: v.label, description: v.description, variant: v }));
  const selected = await vscode.window.showQuickPick(variantPicks, {
    placeHolder: "Choose Code Intelligence MCP server variant"
  });
  if (!selected) { return null; }
  const variant = selected.variant;
  if (variant.delivery === "download") {
    const ok = await downloadVariant(variant, root);
    if (!ok) { return null; }
  }
  const resolvedConfig = resolveConfig(variant, root);
  writeMcpConfig(root, resolvedConfig);
  writeDefaultOrchestrationConfig(root);
  return variant.id;
}

/** Check if MCP code-intelligence config exists in workspace. */
export function hasMcpConfig(workspaceRoot: string): boolean {
  const mcpConfigPath = path.join(workspaceRoot, ".kiro", "settings", "mcp.json");
  const config = readJsonFile<Record<string, unknown>>(mcpConfigPath);
  return !!(config?.mcpServers as Record<string, unknown>)?.["code-intelligence"];
}

/** Write HTTP Streamable MCP config for the remote backend. */
export function writeBundledMcpConfig(workspaceRoot: string, port: number): void {
  const serverConfig = { url: `http://127.0.0.1:${port}/mcp`, transportType: "httpStream", disabled: false };
  writeMcpConfig(workspaceRoot, serverConfig);
}

/** Remove the bundled code-intelligence entry from .kiro/settings/mcp.json. */
export function removeBundledMcpConfig(workspaceRoot: string): void {
  const mcpConfigPath = path.join(workspaceRoot, ".kiro", "settings", "mcp.json");
  const config = readJsonFile<Record<string, unknown>>(mcpConfigPath);
  if (!config) { return; }
  const servers = config.mcpServers as Record<string, unknown> | undefined;
  if (servers?.["code-intelligence"]) {
    delete servers["code-intelligence"];
    if (Object.keys(servers).length === 0) { delete config.mcpServers; }
    writeJsonFile(mcpConfigPath, config);
  }
}


