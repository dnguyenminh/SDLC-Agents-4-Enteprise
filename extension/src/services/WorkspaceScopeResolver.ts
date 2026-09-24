/**
 * WorkspaceScopeResolver — per-workspace scope + secret-key derivation (SA4E-323).
 *
 * Single shared resolver for Pega/Atlassian persistence isolation. Every
 * Pega/Atlassian read/write site resolves scope and secret keys through here;
 * no inline hashing elsewhere (BR-18). Pure functions + lazy migration.
 * Secrets are never logged — at most folder path + hash at debug level.
 */

import * as vscode from "vscode";
import { createHash } from "crypto";

/** Secret bases namespaced per workspace. */
export type SecretBase = "pega" | "atlassianBaseUrl" | "atlassianEmail" | "atlassianToken";

const SECRET_SUFFIX: Record<SecretBase, string> = {
  pega: "pegaPassword",
  atlassianBaseUrl: "atlassian.baseUrl",
  atlassianEmail: "atlassian.email",
  atlassianToken: "atlassian.apiToken",
};

/**
 * Legacy flat secret keys — READ-ONLY migration/fallback sources (OI-4).
 * DO NOT WRITE — new writes MUST use secretKey().
 */
export const LEGACY_SECRET: Record<SecretBase, string> = {
  pega: "kiroSdlc.pegaPassword",
  atlassianBaseUrl: "kiroSdlc.atlassian.baseUrl",
  atlassianEmail: "kiroSdlc.atlassian.email",
  atlassianToken: "kiroSdlc.atlassian.apiToken",
};

/** Legacy global config keys — READ-ONLY migration/fallback sources. */
export const LEGACY_CONFIG = ["pegaEndpoint", "pegaUsername", "atlassianConnectionType"] as const;

/** Canonical folder for scope: workspaceFolders[0], or null (UC-6 fallback). */
export function getWorkspaceFolder(): string | null {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) { return null; }
  return folders[0].uri.fsPath;
}

/** Normalize so the same folder always maps to the same key (BR-19). */
export function normalizePath(fsPath: string): string {
  let p = fsPath.replace(/\\/g, "/");
  if (p.length > 1) { p = p.replace(/\/+$/, ""); }
  const drive = p.match(/^([a-zA-Z]):\//);
  // NOTE (SA4E-323): keep the colon — p.slice(1) preserves ":/rest".
  if (drive) { p = drive[1].toLowerCase() + p.slice(1); }
  return p;
}

/** 12-hex workspace identity, or null when no folder is open. */
export function getWsHash(): string | null {
  const folder = getWorkspaceFolder();
  if (!folder) { return null; }
  try {
    return createHash("sha256").update("ws:" + normalizePath(folder)).digest("hex").slice(0, 12);
  } catch {
    return null;
  }
}

/** Namespaced key, or null when there is no workspace (caller falls back). */
export function secretKey(base: SecretBase, wsHash: string | null = getWsHash()): string | null {
  if (!wsHash) { return null; }
  return `kiroSdlc.${wsHash}.${SECRET_SUFFIX[base]}`;
}

/** Exactly-once migration marker key for a workspace. */
export function migrationMarkerKey(wsHash: string): string {
  return `kiroSdlc.${wsHash}.migrated`;
}

/**
 * Single choke-point for reading a per-workspace secret (SA4E-323, BR-18).
 *
 * Resolves the namespaced key via secretKey(); when no workspace is open
 * (wsHash null) it falls back to the READ-ONLY legacy flat key (OI-4). Any
 * SecretStorage error is swallowed to an empty string so credential reads
 * never break state load (UC-3 EF-3). No inline hash derivation elsewhere.
 *
 * @param secrets VS Code SecretStorage to read from.
 * @param base Secret base to resolve (pega / atlassian*).
 * @param wsHash Workspace hash; defaults to the current workspace.
 * @returns The stored secret, or "" when absent / on read failure.
 */
export async function readScopedSecret(
  secrets: vscode.SecretStorage,
  base: SecretBase,
  wsHash: string | null = getWsHash(),
): Promise<string> {
  try {
    const key = wsHash ? secretKey(base, wsHash)! : LEGACY_SECRET[base];
    return (await secrets.get(key)) || "";
  } catch {
    return "";
  }
}

/** Re-validate a legacy config value with the same rules as save paths. */
function isValidFor(key: string, value: string): boolean {
  if (key === "pegaEndpoint") { return /^https?:\/\//.test(value); }
  if (key === "atlassianConnectionType") { return value === "cloud" || value === "server"; }
  return value.length > 0;
}

/** Snapshot legacy Global config values (plain get() would return migrated values). */
function readLegacyConfig(): Record<string, string | undefined> {
  const config = vscode.workspace.getConfiguration("kiroSdlc");
  const out: Record<string, string | undefined> = {};
  for (const k of LEGACY_CONFIG) { out[k] = config.inspect<string>(k)?.globalValue; }
  return out;
}

/** Snapshot legacy flat secrets. */
async function readSecrets(secrets: vscode.SecretStorage): Promise<Record<SecretBase, string | undefined>> {
  return {
    pega: await secrets.get(LEGACY_SECRET.pega),
    atlassianBaseUrl: await secrets.get(LEGACY_SECRET.atlassianBaseUrl),
    atlassianEmail: await secrets.get(LEGACY_SECRET.atlassianEmail),
    atlassianToken: await secrets.get(LEGACY_SECRET.atlassianToken),
  };
}

/** Field-level config copy: workspace-wins, invalid legacy skipped. */
async function copyConfig(legacy: Record<string, string | undefined>): Promise<boolean> {
  const config = vscode.workspace.getConfiguration("kiroSdlc");
  let failed = false;
  for (const k of LEGACY_CONFIG) {
    // NOTE (SA4E-323 deviation from FSD §6.3.2 comment): the workspace snapshot
    // MUST use inspect().workspaceValue, not merged get(). Merged get() falls
    // back to the legacy global when the workspace is empty, which would make
    // the copy branch below unreachable. inspect().globalValue (legacy) and
    // inspect().workspaceValue (current) are the symmetric scope-specific reads.
    const current = config.inspect<string>(k)?.workspaceValue ?? "";
    const legacyVal = (legacy[k] ?? "").trim();
    if (current.trim() !== "" || legacyVal === "") { continue; }
    if (!isValidFor(k, legacyVal)) { continue; }
    try { await config.update(k, legacyVal, vscode.ConfigurationTarget.Workspace); }
    catch { failed = true; }
  }
  return failed;
}

/** Field-level secret copy: workspace-wins, idempotent overwrite. */
async function copySecrets(
  secrets: vscode.SecretStorage, wsHash: string, legacy: Record<SecretBase, string | undefined>,
): Promise<boolean> {
  let failed = false;
  const bases = Object.keys(LEGACY_SECRET) as SecretBase[];
  for (const b of bases) {
    const nsKey = secretKey(b, wsHash)!;
    const current = await secrets.get(nsKey);
    if (current || !legacy[b]) { continue; }
    try { await secrets.store(nsKey, legacy[b]!); }
    catch { failed = true; }
  }
  return failed;
}

/**
 * Lazy idempotent migration — copy-not-move + workspace-wins (BR-13..BR-15).
 * Called FIRST by getCurrentState/updatePegaConfig/getConfig/saveConfig.
 * Exactly-once per wsHash via marker; retry-safe (no marker unless complete).
 */
export async function ensureMigrated(secrets: vscode.SecretStorage): Promise<void> {
  const wsHash = getWsHash();
  if (!wsHash) { return; }
  const marker = migrationMarkerKey(wsHash);
  if (await secrets.get(marker)) { return; }
  try {
    const legacyConfig = readLegacyConfig();
    const legacySecrets = await readSecrets(secrets);
    const configFailed = await copyConfig(legacyConfig);
    const secretFailed = await copySecrets(secrets, wsHash, legacySecrets);
    if (!configFailed && !secretFailed) { await secrets.store(marker, "1"); }
  } catch {
    // Read failure: abort, no marker, legacy intact; next open retries.
  }
}
