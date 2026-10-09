import * as fs from "fs";
import * as path from "path";

export interface RuntimeSettings {
  mcpUrl: string;
  host: string;
  port: number;
  pid: number;
  version?: string;
  workspace: string;
  startedAt: string;
}

export interface RuntimeSettingsInput {
  port: number;
  host?: string;
  version?: string;
}

export function getRuntimeSettingsPath(workspaceFolder: string): string {
  return path.join(workspaceFolder, ".code-intel", "settings.json");
}

export function readRuntimeSettings(workspaceFolder: string): RuntimeSettings | null {
  try {
    const settingsPath = getRuntimeSettingsPath(workspaceFolder);
    if (!fs.existsSync(settingsPath)) return null;
    return JSON.parse(fs.readFileSync(settingsPath, "utf-8")) as RuntimeSettings;
  } catch (err) {
    console.warn(`[runtime-settings] Failed to read: ${(err as Error).message}`);
    return null;
  }
}

export function writeRuntimeSettings(workspaceFolder: string, input: RuntimeSettingsInput): void {
  try {
    const host = normalizeHost(input.host);
    const settings: RuntimeSettings = {
      mcpUrl: `http://${host}:${input.port}/mcp`,
      host,
      port: input.port,
      pid: process.pid,
      ...(input.version ? { version: input.version } : {}),
      workspace: workspaceFolder,
      startedAt: new Date().toISOString(),
    };
    const settingsPath = getRuntimeSettingsPath(workspaceFolder);
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
  } catch (err) {
    console.warn(`[runtime-settings] Failed to write: ${(err as Error).message}`);
  }
}

export function clearRuntimeSettings(workspaceFolder: string): void {
  try {
    const settingsPath = getRuntimeSettingsPath(workspaceFolder);
    if (fs.existsSync(settingsPath)) {
      fs.unlinkSync(settingsPath);
    }
  } catch (err) {
    console.warn(`[runtime-settings] Failed to clear: ${(err as Error).message}`);
  }
}

function normalizeHost(host: string | undefined): string {
  return !host || host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
}
