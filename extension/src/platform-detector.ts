/**
 * platform-detector.ts — Platform detection for native addons.
 * SRP: Extracted from NativeAddonManager to isolate platform-detection concern.
 * Detects Node.js version, architecture, and selects the best binary key.
 */
import { execSync } from "child_process";
import * as vscode from "vscode";

/** Module version -> Node.js major version mapping. */
const MODULE_VERSION_MAP: Record<string, string> = {
  "83": "14", "93": "16", "108": "18", "115": "20",
  "127": "22", "131": "22", "132": "23", "135": "24",
  "137": "24", "139": "24", "141": "25",
};

/**
 * Detect the system Node.js major version.
 * Falls back to the host VS Code Node version if detection fails.
 *
 * @param outputChannel - VS Code output channel for logging
 * @returns Major version string (e.g. "20")
 */
export function detectSystemNodeMajorVersion(outputChannel: vscode.OutputChannel): string {
  try {
    try {
      // Prefer module version lookup — more reliable in Electron context
      const mv = execSync(`"${process.execPath}" -p "process.versions.modules"`, { encoding: "utf-8", timeout: 5000 }).trim();
      const major = MODULE_VERSION_MAP[mv];
      if (major) {
        outputChannel.appendLine(`[NativeAddon] Runtime MODULE_VERSION=${mv} → Node v${major}`);
        return major;
      }
    } catch (err) {
      console.debug(`[NativeAddon] moduleVersionToNodeMajor lookup failed (non-fatal): ${(err as Error).message}`);
    }
    const output = execSync(`"${process.execPath}" --version`, { encoding: "utf-8", timeout: 5000 }).trim();
    const major = output.replace("v", "").split(".")[0];
    outputChannel.appendLine(`[NativeAddon] System Node: ${output} (major: ${major})`);
    return major;
  } catch {
    // health probe — intentional: fall back to host process version
    const fallback = process.versions.node.split(".")[0];
    outputChannel.appendLine(`[NativeAddon] Cannot detect system Node, using host: v${fallback}`);
    return fallback;
  }
}

/**
 * Try to find a compatible binary using node version fallback.
 * Picks the largest node-vN binary key <= runtimeMajor.
 */
export function tryNodeVersionFallback(
  binaries: Record<string, unknown>,
  platform: string,
  arch: string,
  nodeMajor: string,
  outputChannel: vscode.OutputChannel
): string | null {
  const runtimeMajor = parseInt(nodeMajor, 10);
  const candidates = Object.keys(binaries)
    .filter(k => k.startsWith("node-v") && k.endsWith(`-${platform}-${arch}`))
    .map(k => ({ key: k, major: parseInt(k.match(/node-v(\d+)/)?.[1] || "0", 10) }))
    .filter(c => c.major <= runtimeMajor)
    .sort((a, b) => b.major - a.major);
  if (candidates.length > 0) {
    outputChannel.appendLine(`[NativeAddon] Node v${nodeMajor}, using compatible binary: ${candidates[0].key}`);
    return candidates[0].key;
  }
  return null;
}

/**
 * Try to find a compatible binary using N-API version fallback.
 * Picks the largest napi-vN binary key <= runtimeNapi.
 */
export function tryNapiVersionFallback(
  binaries: Record<string, unknown>,
  platform: string,
  arch: string,
  napiVersion: string,
  outputChannel: vscode.OutputChannel
): string | null {
  const runtimeNapi = parseInt(napiVersion, 10);
  const candidates = Object.keys(binaries)
    .filter(k => k.startsWith("napi-v") && k.endsWith(`-${platform}-${arch}`))
    .map(k => ({ key: k, napi: parseInt(k.match(/napi-v(\d+)/)?.[1] || "0", 10) }))
    .filter(c => c.napi <= runtimeNapi)
    .sort((a, b) => b.napi - a.napi);
  if (candidates.length > 0) {
    outputChannel.appendLine(`[NativeAddon] Legacy fallback — N-API v${napiVersion}, using: ${candidates[0].key}`);
    return candidates[0].key;
  }
  return null;
}
