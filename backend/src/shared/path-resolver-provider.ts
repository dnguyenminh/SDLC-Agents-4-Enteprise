/**
 * SA4E-394 — Process-wide shared resolver provider (BR-13: ONE allowlist load
 * per process). backend/src/index.ts calls getSharedPathResolver() at boot so
 * the BR-19 startup log happens once and the instance is registered in the DI
 * Container; tool handlers fall back to it when no resolver was injected.
 */

import type { Logger } from 'pino';
import { getWorkspacePath } from '../config/index.js';
import { MultiWorktreePathResolver } from './multi-worktree-path-resolver.js';
import { WorkspaceAllowlist } from './workspace-allowlist.js';

let sharedResolver: MultiWorktreePathResolver | null = null;

/** Lazily create (or return) the shared resolver singleton. */
export function getSharedPathResolver(logger: Logger): MultiWorktreePathResolver {
  if (sharedResolver === null) {
    const legacyRoot = getWorkspacePath();
    const allowlist = WorkspaceAllowlist.load(legacyRoot, logger);
    sharedResolver = new MultiWorktreePathResolver(allowlist, legacyRoot, logger);
  }
  return sharedResolver;
}

/** Test seam — reset the shared singleton between isolated test scenarios. */
export function resetSharedPathResolver(): void {
  sharedResolver = null;
}

/**
 * Production wiring — install an explicitly-constructed resolver (built in
 * backend/src/index.ts so the allowlist log + DI registration use ONE instance).
 */
export function setSharedPathResolver(resolver: MultiWorktreePathResolver): void {
  sharedResolver = resolver;
}
