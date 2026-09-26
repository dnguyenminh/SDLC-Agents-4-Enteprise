# 🔒 Security Assessment Report — SA4E-323

## Document Information
| Field | Value |
|-------|-------|
| Project | SDLC-Agents-4-Enterprise (VS Code / Kiro Extension) |
| Ticket | SA4E-323 — Per-workspace isolation for Pega/Atlassian connection settings |
| Scope | Commit `2db8c9b` (original audit); re-review of remediation commit `72edf55` on branch `SA4E-323` |
| Files audited | `WorkspaceScopeResolver.ts`, `ProviderConfigService.ts`, `AtlassianCredentialService.ts`, `panels/settings/SettingsMessageHandler.ts`, `PegaHttpClient.ts` (diff), `JiraProjectIndexer.ts` (credential path), `IndexingService.ts` (diff), `models/LlmProviderConfig.ts`, `extension/package.json` (config scope + capabilities). **Re-review adds:** `services/WorkspaceTrustGuard.ts`, `config/pega-endpoint.ts`, `config/backend-url.ts`, and tests `workspace-trust-guard.test.ts`, `pega-endpoint.test.ts` |
| Date | 2026-09-24 (v1.0) · 2026-09-25 (v1.1 re-review) |
| Assessor | Security Agent |
| Method | Static code review (manual), OWASP Testing Guide v4.2 methodology. Re-review executed the two new unit test suites (13 tests, all pass). No dynamic/runtime testing performed. |
| Version | 1.1 |

---

## ✅ Re-Review Summary (commit `72edf55`) — SEC-01 & SEC-02 RESOLVED

| Finding | Prior | Now | Verified by reading actual code (not DEV's word) |
|---------|-------|-----|--------------------------------------------------|
| **SEC-01** | 🟠 High (Open) | ✅ **Resolved** | (1) `extension/package.json` `capabilities.untrustedWorkspaces.restrictedConfigurations` now lists all 5 keys: `kiroSdlc.backend.allowInsecureRemote`, `kiroSdlc.backend.url`, `kiroSdlc.pegaEndpoint`, `kiroSdlc.pegaUsername`, `kiroSdlc.atlassianConnectionType`. (2) New `WorkspaceTrustGuard.assertWorkspaceTrusted()` throws + shows an error toast when `vscode.workspace.isTrusted === false`. It is wired at every credential choke-point: `PegaHttpClient.getAuthHeader()` (first statement, before reading username/password), `AtlassianCredentialService.performMyselfRequest()` and `handleCredentialRequest()` (first statement, before token build / credential release). The guard is placed OUTSIDE the `try/catch` blocks, so its throw propagates and is not swallowed; the UI notification is best-effort in its own guarded try (never masks the throw). |
| **SEC-02** | 🟡 Medium (Open) | ✅ **Resolved** | New `config/pega-endpoint.ts` `enforcePegaEndpointHttps()` is now the return value of `PegaHttpClient.getPegaEndpoint()`. HTTPS returned unchanged; `http://` loopback allowed; non-loopback `http://` rejected (fail-closed) unless `kiroSdlc.backend.allowInsecureRemote` opt-in is ON (then allowed with a MITM `console.warn`); non-http/https and malformed URLs rejected. It **reuses** `isLoopbackHost` + `getAllowInsecureRemote` from `config/backend-url.ts` — no duplicated logic, one transport-security policy. `isLoopbackHost` uses `isIP()` so `127.attacker.com` is correctly rejected. |

**Choke-point completeness:** Grep confirms every Pega credentialed caller (`PegaCodeIntelDiscovery`, `PegaRuleCatalogClient`, `PegaAccessGroupFetcher`, and all internal `PegaHttpClient` methods) obtains its header via `getAuthHeader()`, and every endpoint read goes through `getPegaEndpoint()` → so the guard and HTTPS enforcement cannot be bypassed by those paths.

**New-finding scan:** No new findings introduced by the fix.
- *Fail-open when `isTrusted === undefined`:* intentional and safe. `engines.vscode` is `^1.85.0`; Workspace Trust has been GA since 1.57 and always returns a boolean on supported hosts. `undefined` only occurs on legacy pre-trust hosts that have no untrusted-workspace mode at all (where `restrictedConfigurations` is likewise inert and there is nothing to exploit). Documented in code.
- *No exception swallowing at the gate:* `assertWorkspaceTrusted()` is invoked before the request `try` blocks; the pre-existing `catch { return "" }` in `readWorkspacePassword()` runs only after the trust check has already passed.

**Tests:** `workspace-trust-guard.test.ts` (untrusted→throw+notify, trusted→pass, undefined→pass, Pega/Atlassian gate behavior) and `pega-endpoint.test.ts` (https/loopback/opt-in/fail-closed/`127.attacker.com`/bad-protocol/malformed) — **13/13 pass**.

---

## Executive Summary

SA4E-323 introduces per-workspace isolation of Pega and Atlassian connection settings in the VS Code/Kiro extension. The design is sound in its core secret-handling: all true secrets (Pega password, Atlassian API token, email, base URL) are persisted exclusively through VS Code `SecretStorage` (OS keychain), namespaced by a per-workspace hash (`kiroSdlc.<wsHash>.<suffix>`). Non-secret connection metadata (`pegaEndpoint`, `pegaUsername`, `atlassianConnectionType`) is stored in workspace configuration (`.vscode/settings.json`). The migration path is a lazy, idempotent, copy-not-move with a per-workspace marker and workspace-wins precedence. URL and empty-field validation are present on both save paths, and error messages do not echo secret values.

The most significant issue is a **workspace-trust gap introduced by this ticket**: moving `pegaEndpoint` to workspace scope makes it settable by a repository's committed `.vscode/settings.json`, but that key is **not** listed in the extension's `capabilities.untrustedWorkspaces.restrictedConfigurations`. A malicious repository can therefore pre-seed a hostile Pega endpoint; when the victim runs a Pega operation, `PegaHttpClient.getAuthHeader()` transmits their real Pega password (HTTP Basic) to the attacker-controlled URL — a credential-exfiltration vector. This is realistically exploitable and fixed with a one-line manifest change plus optional endpoint hardening.

Remaining findings are lower severity: 48-bit hash truncation (acceptable for isolation, documented), no HTTPS enforcement / SSRF allowlist on the Pega endpoint (pre-existing but now reachable via untrusted workspace value), and minor hardening opportunities.

**Overall Risk Rating (v1.0):** **Medium** (single High finding with a trivial, well-scoped remediation; no Critical).
**Overall Risk Rating (v1.1 after `72edf55`):** **Low** — SEC-01 (High) and SEC-02 (Medium) resolved; only Low/Info tech debt remains.

| Severity | Count (v1.0) | Open after `72edf55` |
|----------|--------------|----------------------|
| 🔴 Critical | 0 | 0 |
| 🟠 High | 1 | 0 (SEC-01 resolved) |
| 🟡 Medium | 2 | 1 (SEC-02 resolved; SEC-06-adjacent items unchanged) |
| 🔵 Low | 2 | 2 |
| ℹ️ Informational | 2 | 2 |

---

## Findings by OWASP Top 10 (2021)

| Category | Status |
|----------|--------|
| A01 Broken Access Control | ⚠️ SEC-01 (untrusted workspace can influence credential destination) |
| A02 Cryptographic Failures | ✅ Secrets in OS keychain; no home-grown crypto; SHA-256 for identity only |
| A03 Injection | ✅ No SQL/command injection surface in scope; URL parsed via `URL`/regex |
| A04 Insecure Design | ⚠️ SEC-02 (no HTTPS/allowlist gate before Basic-auth send) |
| A05 Security Misconfiguration | ⚠️ SEC-01 (missing `restrictedConfigurations` entries) |
| A06 Vulnerable/Outdated Components | ✅ No new dependencies added by this ticket |
| A07 Identification & Auth Failures | ✅ Auth material handled correctly; empty-field checks present |
| A08 Software & Data Integrity | ✅ Migration idempotent, retry-safe, marker-gated |
| A09 Logging & Monitoring Failures | ✅ No secret logging; SEC-05 minor (no audit of endpoint change) |
| A10 SSRF | ⚠️ SEC-02 (endpoint fully user/workspace-controlled, no allowlist) |

---

## Findings Table

| ID | Severity | Category (OWASP / CWE) | Location | Description | Remediation |
|----|----------|------------------------|----------|-------------|-------------|
| SEC-01 | 🟠 High → ✅ **Resolved** (`72edf55`) | A05 / A01 — CWE-522, CWE-668 | `extension/package.json` (capabilities) + `services/WorkspaceTrustGuard.ts` + `PegaHttpClient.getAuthHeader`, `AtlassianCredentialService.performMyselfRequest`/`handleCredentialRequest` | **Fixed.** All 3 workspace-scoped keys added to `restrictedConfigurations` (untrusted repos can no longer supply them), AND credential-bearing ops are gated behind `assertWorkspaceTrusted()` at every choke-point (throws + user toast when `isTrusted === false`, exception not swallowed). Original risk: a committed `.vscode/settings.json` could redirect Pega credentials to an attacker endpoint. | ✅ Done — manifest + trust gate. Verified by code read + 13 passing tests. |
| SEC-02 | 🟡 Medium → ✅ **Resolved** (`72edf55`) | A10 SSRF / A04 — CWE-918 | `config/pega-endpoint.ts` + `PegaHttpClient.getPegaEndpoint` | **Fixed.** `getPegaEndpoint()` now routes through `enforcePegaEndpointHttps()`: loopback `http` OK, non-loopback `http` rejected (fail-closed) unless `allowInsecureRemote` opt-in, non-http/https + malformed rejected. Reuses `isLoopbackHost`/`getAllowInsecureRemote` from `backend-url.ts` (no duplicate policy). | ✅ Done — HTTPS enforcement with shared opt-in. Verified by code read + tests. |
| SEC-03 | 🔵 Low | A02 — CWE-522 | `WorkspaceScopeResolver.ts:60-68` | `getWsHash()` truncates SHA-256 to 12 hex chars (48 bits). For workspace *isolation* (not a security boundary between mutually distrusting parties) collision probability is negligible, and a collision only means two local folders share a keychain namespace on the same user account. Acceptable, but undocumented as a deliberate risk trade-off. | Keep as-is; add a code comment noting 48-bit truncation is for key-length ergonomics and isolation-only (not an authz boundary). Consider 16 hex chars for extra margin at no cost. |
| SEC-04 | 🔵 Low | A08 — CWE-459 | `WorkspaceScopeResolver.ts:120-134` (`ensureMigrated` / copy-not-move) | Copy-not-move intentionally leaves legacy flat secrets (`kiroSdlc.pegaPassword`, `kiroSdlc.atlassian.*`) in the keychain for rollback safety. These remain readable via the no-folder fallback path (`readSecret(null,...)` → `LEGACY_SECRET`). Not a scope leak (same user keychain), but stale global secrets outlive their intended use and are reachable from any window with no folder open. | Document retention. Optionally provide a "purge legacy credentials" action once migration marker is set for all known workspaces, or delete legacy keys after a grace period. |
| SEC-05 | ℹ️ Info | A09 — CWE-778 | `PegaHttpClient.ts`, `AtlassianCredentialService.ts` | No audit trail when the Pega/Atlassian endpoint or credentials change or when credentials are transmitted to a new host. Would aid detection of SEC-01-style tampering. | Log (path + host only, never secrets) at info level when a credential-bearing request targets a host not seen before in this workspace. |
| SEC-06 | ℹ️ Info | A03 — CWE-116 | `SettingsMessageHandler.ts:handleFetchPegaContext` (L~) & `pegaContextFetched` message | Success messages interpolate server-returned `applicationName` / file paths into webview messages. Not a secret leak, but server-controlled strings flow to the webview; ensure the webview renders these as text, not HTML. | Confirm webview renders message fields via `textContent`/escaping (out of this ticket's diff scope — verify in Settings webview). |

---

## Detailed Findings

### SEC-01 (High) — Untrusted workspace can redirect Pega credentials

**Evidence — the destination is workspace-controlled:**
```ts
// ProviderConfigService.updatePegaConfig — writes to WORKSPACE scope
await config.update("pegaEndpoint", e, vscode.ConfigurationTarget.Workspace);
await config.update("pegaUsername", u, vscode.ConfigurationTarget.Workspace);
```
```ts
// PegaHttpClient — reads that workspace value and sends the secret to it
public getPegaEndpoint(): string {
  return config.get<string>("pegaEndpoint", "http://localhost:8080/prweb").replace(/\/$/, "");
}
public async getAuthHeader(): Promise<string> {
  const password = await this.readWorkspacePassword();     // real secret from keychain
  const credentials = Buffer.from(`${username}:${password}`).toString("base64");
  return `Basic ${credentials}`;                            // sent to getPegaEndpoint()
}
```
**Manifest gap:**
```jsonc
// extension/package.json — only two keys are restricted
"restrictedConfigurations": [
  "kiroSdlc.backend.allowInsecureRemote",
  "kiroSdlc.backend.url"
  // MISSING: kiroSdlc.pegaEndpoint, kiroSdlc.pegaUsername, kiroSdlc.atlassianConnectionType
]
```
**Impact:** Opening/cloning a hostile repository with a crafted `.vscode/settings.json` can silently point Pega operations at an attacker endpoint; the victim's stored Pega password is exfiltrated on the next Pega call. `atlassianConnectionType` tampering is lower impact (Atlassian base URL is a secret, so it is not workspace-influenceable — good).

**Remediation:**
```jsonc
"restrictedConfigurations": [
  "kiroSdlc.backend.allowInsecureRemote",
  "kiroSdlc.backend.url",
  "kiroSdlc.pegaEndpoint",
  "kiroSdlc.pegaUsername",
  "kiroSdlc.atlassianConnectionType"
]
```
Defense-in-depth — gate credential-bearing network calls on trust:
```ts
if (!vscode.workspace.isTrusted) {
  throw new Error("Pega/Atlassian operations require a trusted workspace.");
}
```

### SEC-02 (Medium) — No HTTPS/allowlist gate before Basic-auth transmission
`getPegaEndpoint()` returns whatever is configured; save-time validation only requires `^https?://`, allowing plaintext `http` to any host. Credentials are then Base64-Basic (reversible) over that channel. Reuse the project's existing `allowInsecureRemote` opt-in pattern (already implemented for `backend.url`) so non-localhost `http` endpoints are rejected unless explicitly permitted.

---

## Positive Controls Verified ✅

- **Secrets in OS keychain, not settings.json.** Pega password and all Atlassian fields (token, email, baseUrl) are stored/read only via `vscode.SecretStorage` with per-workspace namespaced keys. Atlassian **baseUrl is a secret** — correctly not workspace-config, so it cannot be influenced by an untrusted repo.
- **Per-workspace namespacing** via `secretKey(base, wsHash)` = `kiroSdlc.<wsHash>.<suffix>`; single choke-point (`WorkspaceScopeResolver`) prevents inline-hash drift (BR-18).
- **Path normalization** (`normalizePath`) unifies separators, strips trailing slashes, lowercases only the Windows drive letter — deterministic, no path-traversal concern (hash input only, never used as a filesystem path).
- **Migration safety:** lazy, idempotent, marker-gated (`ensureMigrated`), retry-safe (no marker written unless all copies succeed), **workspace-wins** (never overwrites existing workspace values), and **copy-not-move** does not push secrets to a *broader* scope — it copies legacy → same-user keychain namespaced per workspace (not to Global config). "Cleared-stays-cleared" verified by tests (no resurrection after explicit clear).
- **No secret leakage in errors/messages:** save-failure messages reference the field name only ("password may not be saved — retry"), never the value; connection test messages surface only HTTP status / display name.
- **Input validation** on both save paths: URL parsed via `URL` (Atlassian) / regex (Pega), protocol restricted to http/https, empty email/token/endpoint rejected.
- **`updateConfig` guard:** generic config setter explicitly throws for the three workspace-scoped keys, forcing use of the scoped methods — prevents accidental Global writes (`ProviderConfigService.ts:130-136`).
- **`handleCredentialRequest`** returns credentials only over the in-process IPC response object; not logged.
- **Timeouts** on all outbound test/connectivity calls (8s Pega, 5s backend/ollama) — basic DoS/hang protection.
- **Strong-boolean coercion** for `allowInsecureRemote` (fail-closed) retained from SA4E-320.

---

## Verdict

### v1.1 Re-Review (commit `72edf55`) — **APPROVE** ✅

Both required conditions from v1.0 are met and independently verified against the actual code (not DEV's report):

1. ✅ **SEC-01 (Required)** — `restrictedConfigurations` now includes `kiroSdlc.pegaEndpoint`, `kiroSdlc.pegaUsername`, `kiroSdlc.atlassianConnectionType`; and `assertWorkspaceTrusted()` gates all credential choke-points (Pega `getAuthHeader`; Atlassian `performMyselfRequest` + `handleCredentialRequest`) with a fail-closed throw + user notification, exception not swallowed.
2. ✅ **SEC-02 (was Recommended, now done)** — non-loopback Pega endpoints are forced to HTTPS via `enforcePegaEndpointHttps()`, reusing the existing loopback + `allowInsecureRemote` opt-in policy (no duplicated logic).

No new findings introduced. The `isTrusted === undefined` fail-open is sound for the supported host range (`engines.vscode ^1.85.0`) and documented. SEC-03/04/05/06 remain Low/Info tech debt (unchanged; not in scope of this fix).

**Recommendation: APPROVE — SA4E-323 may proceed.**

---

### v1.0 (original, commit `2db8c9b`) — APPROVE WITH CONDITIONS *(superseded by v1.1)*

The credential-storage design is correct and the migration is safe. Approval was conditional on resolving **SEC-01 (High)** before shipping in a build that can open untrusted workspaces:

1. **(Required)** Add `kiroSdlc.pegaEndpoint`, `kiroSdlc.pegaUsername`, `kiroSdlc.atlassianConnectionType` to `capabilities.untrustedWorkspaces.restrictedConfigurations` in `extension/package.json`.
2. **(Required)** Gate Pega/Atlassian network operations on `vscode.workspace.isTrusted`.
3. **(Recommended)** SEC-02 — enforce HTTPS for non-localhost Pega endpoints (reuse the `allowInsecureRemote` opt-in pattern).

SEC-03/04/05/06 are Low/Info and may be tracked as tech debt.

---

## Appendix

### A. Scope Limitations
- Static source review only — no runtime/dynamic testing, no live keychain inspection, no penetration testing.
- Uncommitted SA4E-320 working-tree changes were excluded per instructions.
- Webview HTML-escaping of `pegaContextFetched` message fields (SEC-06) is outside this commit's diff and was not verified end-to-end.
- CVE/dependency scan not applicable — this ticket adds no new dependencies.

### B. Glossary
- **wsHash** — first 12 hex chars of `SHA-256("ws:" + normalizedPath)`; per-workspace identity for keychain namespacing.
- **restrictedConfigurations** — VS Code manifest list; workspace-supplied values for these keys are ignored in untrusted workspaces.
- **copy-not-move** — migration copies legacy credentials into the new namespaced keys without deleting the originals.
