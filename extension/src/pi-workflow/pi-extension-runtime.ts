/**
 * PiExtensionRuntime — SA4E-334 Phase 2 (facade).
 * Loads pi.dev ESM extensions via pi-coding-agent's loader and adapts
 * their RegisteredTool definitions to pi-agent-core AgentTools.
 * Implementation lives in ./pi-extension-runtime/*.
 */

import { resolveExtensionEntries } from './pi-extension-runtime/find-package';

export {
  getPiExtensionAgentTools,
  clearPiExtensionRuntimeCache,
  type CachedRuntime,
} from './pi-extension-runtime/loader';

/** Resolved extension entry paths (for DefaultResourceLoader.additionalExtensionPaths). */
export function getPiExtensionEntries(workspaceRoot: string): string[] {
  return resolveExtensionEntries(workspaceRoot).map((e) => e.entry);
}
