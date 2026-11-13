/**
 * SA4E-393 Addendum 5 — backend wiring for the worktree-trust library.
 * Open workspace folders come ONLY from the server instance: the pinned legacy root
 * plus `MCP_OPEN_WORKSPACE_FOLDERS` set by the launcher. Never from a request (FR-WT3).
 */
import * as os from 'os';
import type { Logger } from 'pino';
import { nodeFs } from './worktree-trust/git-files.js';
import { loadTrustConfig } from './worktree-trust/config.js';
import { WorktreeTrustService } from './worktree-trust/trust-service.js';
import type { WorkspaceAllowlist } from './workspace-allowlist.js';

/** Numbers approved by the user (TDD E3.1): 250 ms budget, 4 KB per evidence file. */
const BUDGET_MS = 250;
const MAX_BYTES = 4096;
const MAX_ENV_ECHO = 40;

/** Build the default trust service for a resolver (env injectable for tests). */
export function createWorktreeTrust(
  allowlist: WorkspaceAllowlist, legacyRoot: string, logger: Logger, env: NodeJS.ProcessEnv = process.env,
): WorktreeTrustService {
  const cfg = loadTrustConfig(env);
  const log = logger.child({ module: 'worktree-trust' });
  if (cfg.invalidFlag) {
    const shown = String(env['MCP_WORKTREE_AUTOTRUST']).replace(/[\r\n\0]/g, '?').slice(0, MAX_ENV_ECHO);
    log.warn({ variable: 'MCP_WORKTREE_AUTOTRUST', value: shown }, 'unrecognised value — worktree auto-trust disabled (fail-closed)');
  }
  return new WorktreeTrustService({
    fs: nodeFs,
    platform: process.platform,
    now: (): number => performance.now(),
    isAllowlisted: (p: string): boolean => allowlist.contains(p),
    allowlistRoots: (): readonly string[] => allowlist.snapshot(),
    openFolders: (): readonly string[] => [legacyRoot, ...cfg.openFolders],
    homedir: os.homedir,
    budgetMs: BUDGET_MS,
    maxBytes: MAX_BYTES,
    enabled: cfg.enabled,
    logger: log,
  });
}
