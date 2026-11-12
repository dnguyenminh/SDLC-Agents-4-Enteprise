/**
 * SA4E-393 — Shared extension context for design-gate tools.
 * Initialized during extension activation; read by LOCAL_TOOL_REGISTRY tools.
 */

import { EnvConfig } from '../../slash/types';

let extensionPath: string | undefined;
let wasmPathSet = false;

/** Called once during extension activation to capture context. */
export function initDesignGateEnv(contextExtensionPath: string): void {
  extensionPath = contextExtensionPath;
  wasmPathSet = false;
}

/** Get the extension path (set during activation). */
export function getExtensionPath(): string | undefined {
  return extensionPath;
}

/** Ensure IMPPECABLE_SKILL_PATH is set in env. Called by tools before runDetection. */
export function ensureWasmPathSet(): void {
  if (wasmPathSet) return;
  if (process.env[EnvConfig.IMPPECABLE_SKILL_PATH]) {
    wasmPathSet = true;
    return;
  }
  if (!extensionPath) return;
  // Delegate to detector-env resolver (imported lazily to avoid circular deps)
  // We'll import it dynamically
  import('../../slash/detector-env').then(({ resolveWasmPath }) => {
    resolveWasmPath(extensionPath!);
    wasmPathSet = true;
  }).catch(() => {
    // Ignore - tool will handle missing wasm
  });
  wasmPathSet = true; // Prevent repeated attempts
}