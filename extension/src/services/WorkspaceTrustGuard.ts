/**
 * SA4E-323 SEC-01 — Workspace trust gate for credential-bearing operations.
 *
 * SA4E-323 moved `pegaEndpoint` / `pegaUsername` / `atlassianConnectionType`
 * into WORKSPACE scope (`.vscode/settings.json`), which a cloned repository can
 * commit. A hostile repo could therefore redirect the victim's Pega/Atlassian
 * Basic-auth credentials to an attacker endpoint. This guard is the single
 * choke-point that blocks any credential-bearing network call while the current
 * workspace is untrusted (defense-in-depth alongside package.json
 * `restrictedConfigurations`). Keeping the check here avoids duplicating the
 * `isTrusted` logic across PegaHttpClient and AtlassianCredentialService (DRY).
 */

import * as vscode from "vscode";

/** Error message surfaced when a credential op runs in an untrusted workspace. */
export const UNTRUSTED_WORKSPACE_MESSAGE =
  "Pega/Atlassian operations require a trusted workspace.";

/**
 * Throw (and notify the user) when the current workspace is not trusted.
 *
 * Call this at the choke-point of every credential-bearing network operation
 * (auth-header build, connection test) BEFORE the request is sent. On an
 * untrusted workspace it shows a VS Code error toast (best-effort, never
 * swallows the failure) and throws so the caller aborts the request.
 *
 * @throws Error with {@link UNTRUSTED_WORKSPACE_MESSAGE} when untrusted.
 */
export function assertWorkspaceTrusted(): void {
  // `isTrusted` is undefined in host builds predating Workspace Trust; treat
  // only an explicit `false` as untrusted (fail-open on legacy hosts that have
  // no trust concept, fail-closed once the API reports a value).
  if (vscode.workspace?.isTrusted === false) {
    notifyUntrusted();
    throw new Error(UNTRUSTED_WORKSPACE_MESSAGE);
  }
}

/** Best-effort user notification; guarded so a missing UI API never masks the throw. */
function notifyUntrusted(): void {
  try {
    vscode.window?.showErrorMessage?.(UNTRUSTED_WORKSPACE_MESSAGE);
  } catch {
    // UI unavailable (headless/test host) — the thrown Error still propagates.
  }
}
