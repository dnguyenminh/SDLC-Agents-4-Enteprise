/**
 * SA4E-393 Addendum 5 — extension wiring of the generated worktree-trust library
 * (hand-written glue, TDD E2.3). Supplies the trust service with the folders open in
 * THIS VS Code instance (`vscode.workspace.workspaceFolders`, all of them, read per
 * call — never from a request) and the `sdlcAgents.workspace.worktreeAutoTrust`
 * setting (default true, scope machine). `MCP_WORKTREE_AUTOTRUST` is the env kill switch.
 */
import * as os from "os";
import { getExtensionAllowlistRoots, getExtensionWorkspaceRoots } from "./allowlist-mirror";
import { loadTrustConfig } from "./worktree-trust/config";
import { nodeFs } from "./worktree-trust/git-files";
import { foldKey } from "./worktree-trust/path-fold";
import { WorktreeTrustService } from "./worktree-trust/trust-service";
import type { TrustLogger, TrustPort } from "./worktree-trust/types";

/** Numbers approved by the user (TDD E3.1): 250 ms budget, 4 KB per evidence file. */
const BUDGET_MS = 250;
const MAX_BYTES = 4096;

/** vscode is only resolvable inside the extension host; tests fall back gracefully. */
function getVscode(): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("vscode");
  } catch (e: any) {
    console.debug(`[worktree-open-folders] vscode require failed: ${e?.message ?? e}`);
    return undefined;
  }
}

/** All folders open in this instance (multi-root aware). */
export function getOpenWorkspaceFolders(): string[] {
  const folders = getVscode()?.workspace?.workspaceFolders;
  if (!Array.isArray(folders)) return [];
  return folders.map((f: any) => f?.uri?.fsPath).filter((p: unknown): p is string => typeof p === "string" && p !== "");
}

/** Setting `sdlcAgents.workspace.worktreeAutoTrust`; unset => true, any non-boolean => false (fail-closed). */
export function isWorktreeAutoTrustSettingEnabled(): boolean {
  const value = getVscode()?.workspace?.getConfiguration?.("sdlcAgents.workspace")?.get?.("worktreeAutoTrust");
  return value === undefined || value === true;
}

/** Overrides for tests; production uses the defaults. */
export interface ExtensionTrustOptions {
  env?: NodeJS.ProcessEnv;
  folders?: () => readonly string[];
  setting?: () => boolean;
  allowlistRoots?: () => readonly string[];
  logger?: TrustLogger;
}

const consoleLogger: TrustLogger = {
  debug: (o, m) => console.debug(`[worktree-trust] ${m}`, o),
  info: (o, m) => console.info(`[worktree-trust] ${m}`, o),
  warn: (o, m) => console.warn(`[worktree-trust] ${m}`, o),
};

/** Folded-membership predicate over a root list (exact, like WorkspaceAllowlist.contains on real paths). */
function membership(roots: () => readonly string[]): (p: string) => boolean {
  return (p) => roots().some((r) => foldKey(r, process.platform) === foldKey(p, process.platform));
}

/** Build a trust service for the extension surface. */
export function createExtensionTrust(o: ExtensionTrustOptions = {}): WorktreeTrustService {
  const cfg = loadTrustConfig(o.env ?? process.env, o.setting ?? isWorktreeAutoTrustSettingEnabled);
  const logger = o.logger ?? consoleLogger;
  if (cfg.invalidFlag) logger.warn({ variable: "MCP_WORKTREE_AUTOTRUST" }, "unrecognised value - worktree auto-trust disabled (fail-closed)");
  const roots = o.allowlistRoots ?? getExtensionAllowlistRoots;
  return new WorktreeTrustService({
    fs: nodeFs,
    platform: process.platform,
    now: (): number => performance.now(),
    isAllowlisted: o.allowlistRoots ? membership(roots) : (p): boolean => getExtensionWorkspaceRoots().has(foldKey(p, process.platform)),
    allowlistRoots: roots,
    openFolders: o.folders ?? getOpenWorkspaceFolders,
    homedir: os.homedir,
    budgetMs: BUDGET_MS,
    maxBytes: MAX_BYTES,
    enabled: cfg.enabled,
    logger,
  });
}

let defaultTrust: WorktreeTrustService | null = null;

/** Module singleton (cache lives with it, E3 OI-WT3). */
export function getDefaultTrust(): TrustPort {
  if (defaultTrust === null) defaultTrust = createExtensionTrust();
  return defaultTrust;
}

/** Test seam: drop the singleton (re-reads env on next use). */
export function resetDefaultTrust(): void {
  defaultTrust = null;
}
