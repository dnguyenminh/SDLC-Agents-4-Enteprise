/**
 * SA4E-393 — Shared extension context for design-gate tools.
 * Initialized during extension activation; read by LOCAL_TOOL_REGISTRY tools
 * that execute inside the in-process wrapper server (execute_dynamic_tool).
 *
 * BUG-SA4E-393: the tools must NEVER touch a bare `vscode` identifier — in the
 * esbuild CJS bundle `vscode` exists only via require("vscode"), so a bare
 * reference throws ReferenceError("vscode is not defined").
 */

import { EnvConfig } from '../../slash/types';
import { resolveWasmPath } from '../../slash/detector-env';
import { defaultWorkspaceRootProvider } from '../../services/PathResolver';

/** Extension install path captured at activation (context.extensionPath). */
let extensionPath: string | undefined;

/** Per-call run environment for design_gate_run. */
export type DesignGateRunEnv = { ok: true; root: string } | { ok: false; message: string };

/** Called once during extension activation to capture context. */
export function initDesignGateEnv(contextExtensionPath: string): void {
  extensionPath = contextExtensionPath;
}

/** Get the extension path (set during activation). */
export function getExtensionPath(): string | undefined {
  return extensionPath;
}

/**
 * Resolve the per-call detection environment, mirroring the Command Palette
 * design-gate commands (extension.ts resolveWorkspace + resolveWasmPath):
 * live workspace root (PathResolver lazy require — SA4E-356, no cache) and
 * the WASM detector from the EXTENSION path (never the workspace root).
 * @returns ok + root, or a user-facing error message (no throw).
 */
export function prepareDesignGateRunEnv(): DesignGateRunEnv {
  const root = defaultWorkspaceRootProvider();
  if (!root) return { ok: false, message: 'No workspace folder open. Open a project folder first.' };
  if (!extensionPath) {
    return { ok: false, message: 'Design gate not initialized: extension path unavailable (extension not activated).' };
  }
  // Pipeline contract (EnvConfig): fs.adapter/report.generator resolve against these.
  process.env[EnvConfig.WORKSPACE_ROOT] = root;
  resolveWasmPath(extensionPath);
  return { ok: true, root };
}
