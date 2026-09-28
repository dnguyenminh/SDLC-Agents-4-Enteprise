# Functional Specification Document (FSD)

## SDLC Agents 4 Enterprise — SA4E-323: Per-workspace isolation for Pega/Atlassian connection settings

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-323 |
| Title | Pega/Atlassian connection settings luu global, leak giua cac workspace — can luu rieng per-workspace |
| Author | BA Agent (+ TA enrichment v1.1) |
| Version | 1.1 |
| Date | 2026-09-24 |
| Status | Draft |
| Related BRD | documents/SA4E-323/BRD.md |
| Type | Bug / High (extension persistence layer only) |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-24 | BA Agent | Initiate FSD from BRD + code grounding (ProviderConfigService, AtlassianCredentialService, LlmProviderConfig, SettingsMessageHandler, PegaHttpClient, IndexingService, atlassian-http-client, package.json) |
| 1.1 | 2026-09-24 | TA Agent | Technical enrichment: §3.8 full IPC message schemas; §5.4 external request/response contracts + retry/timeout policy; §6.3 TypeScript pseudocode (wsHash, secretKey, ensureMigrated, fallback); §4 TA code-verification block; §8 supplemental quantified targets; §11 structured Open Issues OI-1..OI-12; missing AF/EF flows for UC-1..UC-7. No BA content deleted. |

---

## 1. Introduction

### 1.1 Purpose

This FSD specifies HOW the per-workspace isolation fix for Pega and Atlassian connection settings is implemented in the VS Code extension (`extension/`). It turns the BRD business rules (US-1..US-5) into implementable functional specs: exact methods and lines to change, new shared resolver, secret-key scheme, migration procedure, fallback behavior, IPC contracts, UI data-binding, error handling, and quantified NFRs. Backend (`backend/`) is unchanged — it persists no Pega/Atlassian credentials.

Current bug (verified in code): non-secrets are written with `vscode.ConfigurationTarget.Global` and secrets use flat global keys, so the last-written workspace leaks into every other workspace.

- `ProviderConfigService.updatePegaConfig()` writes `pegaEndpoint` / `pegaUsername` with `Global` (`extension/src/services/ProviderConfigService.ts:60-61`).
- `AtlassianCredentialService.storeConnectionType()` writes `atlassianConnectionType` with `Global` (`extension/src/services/AtlassianCredentialService.ts:91-94`).
- `SECRET_KEYS` are flat globals (`extension/src/models/LlmProviderConfig.ts:6-15`): `pega: kiroSdlc.pegaPassword`, `atlassianEmail: kiroSdlc.atlassian.email`, `atlassianToken: kiroSdlc.atlassian.apiToken`, `atlassianBaseUrl: kiroSdlc.atlassian.baseUrl`.
- Direct flat read in `IndexingService.runSchemaIndexer()` (`extension/src/services/IndexingService.ts:234`): `secrets.get("kiroSdlc.pegaPassword")`.

### 1.2 Scope

In scope (from BRD §1.1, now functionally specified):

- Change Pega non-secret writes to `ConfigurationTarget.Workspace` and Atlassian `atlassianConnectionType` writes to `Workspace`.
- Namespace all Pega/Atlassian secrets per workspace: `kiroSdlc.<wsHash>.*` via ONE shared key-derivation + scope-resolution helper used by every read/write site.
- Synchronize every read site: `ProviderConfigService.getCurrentState()` (`ProviderConfigService.ts:17-56`), `PegaHttpClient.getAuthHeader()` / `getPegaEndpoint()` / `getConfiguredUsername()` / `resolveDeterministicPegaHierarchy()` (`PegaHttpClient.ts:39-56,129-139`), `IndexingService.runSchemaIndexer()` (`IndexingService.ts:228-247`), `AtlassianCredentialService.getConfig()` / `testConnection()` / `handleCredentialRequest()` (`AtlassianCredentialService.ts:41-76`), `AtlassianHttpClient.buildRequest()` (`extension/src/mcp/atlassian/atlassian-http-client.ts:68-74`), `JiraProjectIndexer.run()` credential gate (`extension/src/services/JiraProjectIndexer.ts:35-39`), `PegaRuleSetResolverService.getDeveloperShortName()` (`extension/src/services/PegaRuleSetResolverService.ts:52-59`), `SettingsMessageHandler` save/getState/test dispatch (`extension/src/panels/settings/SettingsMessageHandler.ts:90-117,121-126,262-316`).
- One-time, idempotent, per-workspace lazy migration of legacy globals into workspace scope.
- Documented fallback for no-folder windows and canonical folder for multi-root.
- Settings UI shows and verifies current-workspace values only (presence flags, never secret values).

Out of scope: LLM provider keys scope, backend storage, proxy/backend-URL/MCP settings (already `Workspace`), encryption algorithm changes, Settings Sync policy, Settings panel redesign.

### 1.3 Definitions & Acronyms

| Term | Definition |
|------|------------|
| Workspace | VS Code workspace folder; isolation boundary. Canonical folder = `vscode.workspace.workspaceFolders[0].uri.fsPath` (consistent with `PegaHttpClient.getWorkspaceRoot()` at `PegaHttpClient.ts:142-145`, `SettingsMessageHandler.handleFetchPegaContext()` at `SettingsMessageHandler.ts:280-285`, and repo-wide `workspaceFolders[0]` precedent). |
| wsHash | 12-hex-char hash identifying a workspace: `sha256("ws:" + normalizedPath).hex.slice(0,12)`. Precedent: projectId `sha256("pega:"+appName).hex.slice(0,12)` in `PegaHttpClient.fetchAndSavePegaContext()` (`PegaHttpClient.ts:941`). |
| SecretStorage | VS Code OS-keychain-backed store, global to the extension instance; has no native workspace scope, hence key namespacing is required. |
| ConfigurationTarget | VS Code config scope: `Global` = user `settings.json` shared across workspaces; `Workspace` = `.vscode/settings.json` in the workspace folder. |
| Resolver | New shared helper (name fixed in TDD, e.g. `WorkspaceScopeResolver`): `getWorkspaceFolder()`, `getWsHash()`, `secretKey(base)` mapping flat base to `kiroSdlc.<wsHash>.*`. Single call site for all readers/writers. |
| Read site | Any code reading Pega/Atlassian config or secrets (listed in §1.2). All must resolve through the Resolver. |
| IPC | Webview <-> extension-host messages (`savePegaConfig`, `pegaSaved`, `state`, `saveAtlassianConfig`, `atlassianSaved`, `testPegaConnection`/`pegaTestResult`, `testAtlassianConnection`/`atlassianTestResult`, `fetchPegaContext`/`pegaContextFetched`) plus `AtlassianCredentialService.handleCredentialRequest()` for child-server credential fetch. |
| Migration marker | Per-workspace flag `kiroSdlc.<wsHash>.migrated = "1"` in SecretStorage (or equivalent workspace-scoped config flag fixed in TDD) recording that migration was attempted for that wsHash. |

<!-- TA enrichment -->
> **TA Note (verified 2026-09-24 against `extension/package.json:336-364`):** none of `kiroSdlc.pegaEndpoint`, `kiroSdlc.pegaUsername`, `kiroSdlc.pegaDeveloperShortName`, `kiroSdlc.atlassianConnectionType` declares an explicit `scope` field, so they default to VS Code `window` scope in the Settings UI. A `config.update(key, value, ConfigurationTarget.Workspace)` call is still legal and persists to `.vscode/settings.json` regardless of the declaration — no `package.json` change is required for the fix. TDD to confirm no `scope` field is added (adding e.g. `resource` scope would only change Settings-UI categorization, not the fix). Two further code facts the implementer must know: (1) `config.get(key)` with no target reads the **merged** value (Workspace overrides Global), so after writes become Workspace-targeted, all existing plain `config.get("pegaEndpoint"/"pegaUsername"/"atlassianConnectionType")` reads automatically return workspace values — only the three **write** sites change target; (2) migration's legacy-Global read MUST use `config.inspect(key)?.globalValue`, never plain `get` (see §4 TA verification and §6.3 pseudocode). [Implements: BRD §3 `SECRET_KEYS` dependency, BRD Risk "missed read site"]

### 1.4 References

| Document | Location |
|----------|----------|
| BRD | documents/SA4E-323/BRD.md |
| Jira SA4E-323 (Bug/High) | SA4E project |
| ProviderConfigService | extension/src/services/ProviderConfigService.ts |
| AtlassianCredentialService | extension/src/services/AtlassianCredentialService.ts |
| SECRET_KEYS registry | extension/src/models/LlmProviderConfig.ts |
| SettingsMessageHandler | extension/src/panels/settings/SettingsMessageHandler.ts |
| PegaHttpClient | extension/src/services/PegaHttpClient.ts |
| IndexingService | extension/src/services/IndexingService.ts |
| AtlassianHttpClient (hot-reload) | extension/src/mcp/atlassian/atlassian-http-client.ts |
| JiraProjectIndexer (credential gate) | extension/src/services/JiraProjectIndexer.ts |
| PegaRuleSetResolverService | extension/src/services/PegaRuleSetResolverService.ts |
| Extension config declarations | extension/package.json (kiroSdlc.pegaEndpoint:336-340, kiroSdlc.pegaUsername:346-350, kiroSdlc.atlassianConnectionType:356-364) |
| Settings webview | extension/src/webview-assets/settings/settings.js (Pega inputs:67-68, save:461-462, state render:630-634, connection-type radio:650-651) |
| FSD template | documents/templates/FSD-TEMPLATE.md |

---

## 2. System Overview

### 2.1 System Context Diagram

![System Context](diagrams/system-context.png)
*[Edit in draw.io](diagrams/system-context.drawio)*

The Developer opens SDLC Pipeline Settings in one workspace. The webview talks only to `SettingsMessageHandler`, which dispatches through `ProviderConfigService` (Pega) and `AtlassianCredentialService` (Atlassian). Both services resolve scope through the NEW shared `WorkspaceScopeResolver` (wsHash + Workspace target): non-secrets go to that workspace's `.vscode/settings.json`, secrets go to namespaced `kiroSdlc.<wsHash>.*` keys in SecretStorage. Downstream consumers (`PegaHttpClient`, `IndexingService`, `AtlassianHttpClient`, `JiraProjectIndexer`) resolve the SAME workspace scope, so Workspace A never sees Workspace B values. External systems (Pega Platform, Jira Cloud/Server) are unchanged; only client-side persistence scope changes.

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | System Context — per-workspace settings | [system-context.png](diagrams/system-context.png) | [system-context.drawio](diagrams/system-context.drawio) |
| 2 | Sequence — Save Pega per-workspace | [sequence-save-pega.png](diagrams/sequence-save-pega.png) | [sequence-save-pega.drawio](diagrams/sequence-save-pega.drawio) |
| 3 | Sequence — Save Atlassian per-workspace | [sequence-save-atlassian.png](diagrams/sequence-save-atlassian.png) | [sequence-save-atlassian.drawio](diagrams/sequence-save-atlassian.drawio) |
| 4 | Sequence — Lazy per-workspace migration | [sequence-migration.png](diagrams/sequence-migration.png) | [sequence-migration.drawio](diagrams/sequence-migration.drawio) |
| 5 | State — Workspace config lifecycle | [state.png](diagrams/state.png) | [state.drawio](diagrams/state.drawio) |

### 2.2 System Architecture

Components (all in `extension/`, extension host process):

- **Settings Webview** (`extension/src/webview-assets/settings/settings.js` + `SettingsPanel`): renders Pega/Atlassian sections, sends `savePegaConfig` / `saveAtlassianConfig` / `getState` / `testPegaConnection` / `testAtlassianConnection` / `fetchPegaContext`, renders returned `state` (presence flags only, never secret values).
- **SettingsMessageHandler** (`SettingsMessageHandler.ts:30-119` dispatch, `:121-126 sendCurrentState`, `:262-316` Pega/Atlassian handlers): thin dispatch layer; message contracts UNCHANGED, only resolved scope changes. Precedent for Workspace writes already here (`backend.url` at `:200-201`, `backend.allowInsecureRemote` at `:211-212`, `mcpServerPort` at `:244-245`, `enableMcpServer` at `:249-250`).
- **ProviderConfigService** (`ProviderConfigService.ts`): `getCurrentState()` (`:17-56`) aggregates workspace-resolved Pega + Atlassian presence; `updatePegaConfig()` (`:58-65`) becomes Workspace-targeted + namespaced secret; generic `updateConfig()` (`:107-110`, currently Global) must NOT be used for workspace-scoped Pega/Atlassian keys (guarded in §3).
- **AtlassianCredentialService** (`AtlassianCredentialService.ts`): `saveConfig()` (`:33-39`), `getConfig()` (`:42-49`), `testConnection()` (`:52-58`, 8s abort at `:107`), `handleCredentialRequest()` (`:61-76`), `validateUrl()` (`:80-89`), `storeConnectionType()` (`:91-94` Global to fix), `readConnectionType()` (`:96-100`), `performMyselfRequest()` + `interpretResponse()` (`:102-130`).
- **WorkspaceScopeResolver (NEW)**: pure helper with NO network: `getWorkspaceFolder(): string | null` (returns `workspaceFolders[0].uri.fsPath` or null), `normalizePath(p)`, `getWsHash(): string | null` (sha256, 12 hex), `secretKey(base: "pega" | "atlassianBaseUrl" | ...)`. Every service above calls it; no duplicated hash logic.
- **Persistence**: VS Code Configuration (`kiroSdlc.pegaEndpoint`, `kiroSdlc.pegaUsername`, `kiroSdlc.atlassianConnectionType` declared in `package.json:336-364`) with `Workspace` target; VS Code SecretStorage for `kiroSdlc.<wsHash>.pegaPassword`, `kiroSdlc.<wsHash>.atlassian.baseUrl`, `kiroSdlc.<wsHash>.atlassian.email`, `kiroSdlc.<wsHash>.atlassian.apiToken`, plus marker `kiroSdlc.<wsHash>.migrated`.
- **Consumers**: `PegaHttpClient` (auth header + endpoint + username), `IndexingService.runSchemaIndexer()` + `runPegaProjectIndexer()`/`runJiraProjectIndexer()` paths, `PegaCatalogIndexer`/`PegaProjectIndexer` (via passed `PegaHttpClient`), `AtlassianHttpClient` (per-request `getConfig()` hot-reload at `atlassian-http-client.ts:69`), `JiraProjectIndexer` (null-gate at `JiraProjectIndexer.ts:36-39`), `PegaRuleSetResolverService.getDeveloperShortName()` (reads `pegaUsername`).
- **External**: Pega Platform REST (Basic auth, trailing-slash-normalized endpoint), Jira `GET /rest/api/2/myself` (Basic `email:token`, 8s timeout for test path, 30s default + token-bucket + retry in `AtlassianHttpClient`).

---## 3. Functional Requirements

### 3.1 Feature: Pega connection per-workspace save and load

**Source:** BRD US-1 (SA4E-323)

#### 3.1.1 Description

Pega Endpoint URL, Operator ID, and Password entered in Settings are persisted ONLY in the current workspace scope and read back ONLY from that scope. `ProviderConfigService.updatePegaConfig(endpoint, username, password?)` at `ProviderConfigService.ts:58-65` changes lines 60-61 from `ConfigurationTarget.Global` to `ConfigurationTarget.Workspace`, and line 63 from `secrets.store(SECRET_KEYS.pega, ...)` to `secrets.store(resolver.secretKey("pega"), ...)`. Blank password preserves the stored workspace password (existing guard at `:62` kept). All Pega readers (`getCurrentState()` at `:39-41`, `PegaHttpClient.getAuthHeader()` at `PegaHttpClient.ts:39-45`, `getPegaEndpoint()` at `:47-50`, `getConfiguredUsername()` at `:52-56`, `resolveDeterministicPegaHierarchy()` at `:129-139` reading `pegaUsername` at `:133`, `fetchAndSavePegaContext()` reading `pegaUsername` at `:902-903`, `IndexingService.runSchemaIndexer()` at `IndexingService.ts:232-236`, `PegaRuleSetResolverService.getDeveloperShortName()` at `PegaRuleSetResolverService.ts:52-59`) resolve through the same Resolver. Switching workspaces without saving shows empty (or that workspace's own values); Test/Fetch use current-workspace credentials only.

![Sequence - Save Pega](diagrams/sequence-save-pega.png)
*[Edit in draw.io](diagrams/sequence-save-pega.drawio)*

#### 3.1.2 Use Case

**Use Case ID:** UC-1
**Actor:** Developer (workspace A / workspace B)
**Preconditions:** A workspace folder is open (`workspaceFolders[0]` exists). Migration (UC-5) has run for this workspace (or there is no legacy to migrate).
**Postconditions:** Workspace A config + `kiroSdlc.<hashA>.pegaPassword` hold A's values; Workspace B is unaffected. No global key is written.

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Developer edits Pega Endpoint / Username / Password in Settings (Workspace A) and clicks Save | | Webview (`settings.js:461-462`) posts `savePegaConfig {endpoint, username, password}` |
| 2 | | SettingsMessageHandler | `handle()` routes `savePegaConfig` to `configService.updatePegaConfig()` (`SettingsMessageHandler.ts:90-97`) |
| 3 | | ProviderConfigService + Resolver | Resolve folder `workspaceFolders[0].fsPath`, compute `wsHashA`; `config.update("pegaEndpoint", endpoint, Workspace)`; `config.update("pegaUsername", username, Workspace)` (changed from Global) |
| 4 | | ProviderConfigService + Resolver | If `password.trim().length > 0`: `secrets.store("kiroSdlc.<hashA>.pegaPassword", password)`; else preserve existing workspace password (BR-3) |
| 5 | | SettingsMessageHandler | Post `pegaSaved {success:true}`, then `sendCurrentState()` re-reads SAME scope and posts `state {pegaEndpoint, pegaUsername, hasPegaPassword}` for Workspace A only |
| 6 | Developer opens Workspace B | | Settings `getState` resolves `hashB`; shows B values or empty; `hasPegaPassword=false` unless B has its own password |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | Password field left blank on save | System keeps existing `kiroSdlc.<hash>.pegaPassword`; updates endpoint/username only; returns `pegaSaved success:true` |
| AF-2 | Workspace already has values when migration runs | Workspace values win; migration copies nothing (see UC-5); save proceeds normally |
| AF-3 | Endpoint has trailing slash | `getPegaEndpoint()` strips trailing `/` on read (`PegaHttpClient.ts:49`); stored value unchanged, read value normalized |
<!-- TA enrichment -->
| AF-4 | Two windows of the SAME workspace save concurrently | Last-write-wins within the same scope (both resolve `hashA`); no divergence possible; each save re-reads same scope for `state`, so both UIs converge on the last write |
<!-- TA enrichment -->
| EF-4 | `config.update` throws (read-only `.vscode/settings.json`, no write permission) | Post `pegaSaved {success:false, error:<message>}`; endpoint/username NOT saved; if the secret was already stored first, the message MUST warn "password saved but endpoint/username not — retry save"; do NOT mark migration complete |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | No workspace folder open on save | Block save; post `pegaSaved {success:false, error:"No workspace folder open — Pega config requires a workspace to isolate credentials."}`; write NOTHING (BR-13) |
| EF-2 | SecretStorage.store fails | Post `pegaSaved {success:false, error:<message>}`; surface warning that endpoint may be saved but password is not; do not mark migration complete if in migration path |
| EF-3 | Endpoint is not http/https URL | Reject at save path with validation message; post `pegaSaved success:false`; nothing persisted |

#### 3.1.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-1 | `pegaEndpoint` and `pegaUsername` MUST be written AND read with `ConfigurationTarget.Workspace` (change `ProviderConfigService.ts:60-61` from Global; `getCurrentState()` at `:40-41` and all `config.get("pegaEndpoint"/"pegaUsername")` sites read workspace scope; declarations in `package.json:336-350` unchanged) | BRD US-1 §Requirement 1 |
| BR-2 | Pega password MUST be stored ONLY under `kiroSdlc.<wsHash>.pegaPassword` (never flat `kiroSdlc.pegaPassword` for new writes); key derived ONLY via the shared Resolver | BRD US-1 §Requirement 2 |
| BR-3 | Empty/blank password on save MUST NOT overwrite the stored workspace password (keep `if (password && password.trim().length > 0)` guard at `ProviderConfigService.ts:62`) | Existing behavior preserved |
| BR-4 | `getPegaEndpoint()` MUST strip trailing `/` (`PegaHttpClient.ts:49`); endpoint validation requires http/https (same rule as Atlassian `validateUrl` pattern) | `PegaHttpClient.ts:47-50` |

#### 3.1.4 Data Specifications

**Input Data:**

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| pegaEndpoint | string (URL) | Y | Must parse as URL with `http:`/`https:`; trimmed; trailing slash normalized on read | Workspace-scoped config `kiroSdlc.pegaEndpoint` |
| pegaUsername | string | Y | `trim().length > 0` for auth paths; fail-closed with "Pega Operator ID is not configured (kiroSdlc.pegaUsername)" (see `PegaHttpClient.ts:135`) | Workspace-scoped config `kiroSdlc.pegaUsername` |
| pegaPassword | secret string | Y (first save) / N (updates may be blank = preserve) | Blank = preserve; non-blank stored whole (no trim of inner content beyond existing guard) | Namespaced secret `kiroSdlc.<wsHash>.pegaPassword` |
| wsHash | string, 12 hex chars | System | `sha256("ws:"+normalizedPath).hex.slice(0,12)`; normalization per BR-16 | Derived, never user-entered |

**Output Data:**

| Field | Type | Description |
|-------|------|-------------|
| pegaEndpoint (state) | string | Current workspace endpoint for webview display (`settings.js:630-631`) |
| pegaUsername (state) | string | Current workspace username (`settings.js:633-634`) |
| hasPegaPassword | boolean | Presence flag for current workspace only; drives placeholder "saved for this workspace" vs "Not set for this workspace"; secret value NEVER sent to webview |

#### 3.1.5 UI Specifications

**Screen: SDLC Pipeline Settings — Pega Platform Connection section**

| No. | Element | Type | Required | Behavior | Validation |
|-----|---------|------|----------|----------|------------|
| 1 | Pega Endpoint URL (`pega-endpoint-input`, `settings.js:67`) | Text input | Y | Shows current workspace endpoint only; empty in fresh workspace | http/https URL |
| 2 | Pega Operator ID (`pega-username-input`, `settings.js:68`) | Text input | Y | Shows current workspace username only | Non-empty after trim |
| 3 | Pega Password | Password input | Y | Masked; placeholder from `hasPegaPassword` (workspace-scoped); never displays stored value | Blank = preserve existing |
| 4 | Save Pega button | Button | Y | Sends `savePegaConfig`; on `pegaSaved` shows success/error; refreshes state | Disabled or guarded with message when no folder open |
| 5 | Test Pega button | Button | N | Sends `testPegaConnection`; uses current-workspace endpoint (connectivity check, no auth — see UC-4); shows `pegaTestResult` | Requires endpoint present |

#### 3.1.6 API Contract (Functional View)

> Technical details (retry, timeouts, headers) are specified in the TDD.

**Endpoint:** `ProviderConfigService.updatePegaConfig(endpoint: string, username: string, password?: string): Promise<void>`
**Purpose:** Persist Pega connection for the current workspace only.

**Input Parameters:**

| Parameter | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| endpoint | string | Y | BR-1, BR-4 | Validated http/https URL |
| username | string | Y | BR-1 | Trimmed Operator ID |
| password | string | N | BR-2, BR-3 | Blank = preserve; non-blank stored under namespaced key |

**Output Data:**

| Field | Type | Description |
|-------|------|-------------|
| (void) + `pegaSaved` IPC | `{success:boolean, error?:string}` | Success/failure surfaced in Settings UI |

**Business Error Scenarios:**

| Scenario | User Message | Trigger Condition |
|----------|-------------|-------------------|
| No workspace | No workspace folder open — Pega config requires a workspace to isolate credentials. | `workspaceFolders` empty (BR-13) |
| Invalid endpoint | Invalid Pega Endpoint URL (http/https required). | URL parse/protocol check fails |
| Secret store failure | Failed to save Pega config: {message} (password may not be saved) | `SecretStorage.store` throws |

---
### 3.2 Feature: Atlassian connection per-workspace save and load

**Source:** BRD US-2 (SA4E-323)

#### 3.2.1 Description

Jira Base URL, Email, API Token/PAT, and Connection Type are persisted ONLY in the current workspace scope. `AtlassianCredentialService.saveConfig()` at `AtlassianCredentialService.ts:33-39` stores the three secrets under `kiroSdlc.<wsHash>.atlassian.baseUrl` / `.email` / `.apiToken` (replacing flat `SECRET_KEYS.atlassian*` at `LlmProviderConfig.ts:12-14`) via the shared Resolver, and `storeConnectionType()` at `:91-94` changes `Global` to `Workspace`. Readers (`getConfig()` at `:42-49` returning null unless all three present, `testConnection()` at `:52-58`, `handleCredentialRequest()` at `:61-76`, `readConnectionType()` at `:96-100` defaulting/coercing to `cloud`, `ProviderConfigService.getCurrentState()` at `ProviderConfigService.ts:43-46`, `AtlassianHttpClient.buildRequest()` at `atlassian-http-client.ts:68-74` hot-reloading per request) all resolve the same scope. IPC message shapes are unchanged.

![Sequence - Save Atlassian](diagrams/sequence-save-atlassian.png)
*[Edit in draw.io](diagrams/sequence-save-atlassian.drawio)*

#### 3.2.2 Use Case

**Use Case ID:** UC-2
**Actor:** Developer (workspace A / workspace B)
**Preconditions:** Workspace folder open. Migration (UC-5) has run for this workspace if legacy exists.
**Postconditions:** Workspace A triple + connection type isolated under `hashA`; Workspace B unaffected. No global writes.

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Developer edits Jira Base URL / Email / Token / Connection Type (Workspace A), clicks Save | | Webview posts `saveAtlassianConfig {baseUrl, email, apiToken, connectionType}` |
| 2 | | SettingsMessageHandler | `handleSaveAtlassianConfig()` (`SettingsMessageHandler.ts:295-307`) calls `atlassianService.saveConfig()` with `connectionType \|\| "cloud"` |
| 3 | | AtlassianCredentialService | `validateUrl(baseUrl)` — must parse with http/https else throw "Invalid Jira Base URL format." / "URL must use http or https protocol." (`:80-89`) |
| 4 | | AtlassianCredentialService + Resolver | `secrets.store("kiroSdlc.<hashA>.atlassian.baseUrl"|".email"|".apiToken")`; `config.update("atlassianConnectionType", type, Workspace)` (changed from Global) |
| 5 | | SettingsMessageHandler | Post `atlassianSaved {success:true}`; refresh `sendCurrentState()` shows A's values + `hasAtlassianToken` for A only |
| 6 | Developer opens Workspace B | | `getConfig()` under `hashB` returns B triple or null; connection type is B's own (`cloud` default); no A values visible |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | `connectionType` omitted in message | Default to `"cloud"` (`SettingsMessageHandler.ts:301`); stored as `cloud` |
| AF-2 | Stored connection type is neither `cloud` nor `server` | `readConnectionType()` coerces to `"cloud"` (`AtlassianCredentialService.ts:99`) |
| AF-3 | Base URL has trailing slashes | Stored as entered; `buildRequest()` (`atlassian-http-client.ts:71`) and `performMyselfRequest()` (`AtlassianCredentialService.ts:103`) strip trailing `/+` before appending `/rest/api/2/myself` |
<!-- TA enrichment -->
| AF-4 | `apiToken` saved as empty string | Stored as-is; `getConfig()` treats empty as missing → returns null (BR-7 completeness gate); Test/IPC report "not configured" per EF-3; recovery = save a non-empty token (see OI-9 for the TDD decision to reject empties at save instead) |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | Invalid Base URL | `saveConfig()` throws; handler posts `atlassianSaved {success:false, error:"Invalid Jira Base URL format."}`; nothing persisted |
| EF-2 | No workspace folder on save | Block; post `atlassianSaved {success:false, error:"No workspace folder open — ...per-workspace Atlassian credentials."}`; write nothing |
| EF-3 | `getConfig()` incomplete for current workspace | Return null; `testConnection()` returns `{success:false, message:"No credentials configured."}`; `handleCredentialRequest()` throws "Atlassian credentials not configured in extension."; `JiraProjectIndexer` returns "Atlassian credentials not configured (Settings → Atlassian Connection)" |
<!-- TA enrichment -->
| EF-4 | `config.update` Workspace throws during `saveConfig()` (read-only `.vscode/settings.json`) | Post `atlassianSaved {success:false, error:<message>}`; the three secrets may already be stored — message MUST warn of partial save; retry overwrites the same namespaced keys idempotently; migration marker is NOT set |

#### 3.2.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-5 | `atlassianConnectionType` MUST be written AND read with `ConfigurationTarget.Workspace` (change `AtlassianCredentialService.ts:93` from Global; `readConnectionType()` at `:96-100` reads workspace scope; declaration `package.json:356-364` unchanged) | BRD US-2 §Requirement 2 |
| BR-6 | Atlassian secrets MUST be stored ONLY under `kiroSdlc.<wsHash>.atlassian.baseUrl` / `.email` / `.apiToken` (never flat `kiroSdlc.atlassian.*` for new writes); same Resolver as Pega | BRD US-2 §Requirement 1 |
| BR-7 | `getConfig()` returns null unless baseUrl AND email AND apiToken are ALL present for the current workspace | `AtlassianCredentialService.ts:46` |
| BR-8 | Connection type defaults to `cloud`; any non-`server` value coerces to `cloud`; save path defaults missing type to `cloud` | `AtlassianCredentialService.ts:98-99`, `SettingsMessageHandler.ts:301` |
| BR-9 | Base URL MUST parse as URL with `http:`/`https:` else throw "Invalid Jira Base URL format." / "URL must use http or https protocol." (existing `validateUrl` at `:80-89` preserved verbatim) | Existing behavior preserved |

#### 3.2.4 Data Specifications

**Input Data:**

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| atlassianBaseUrl | secret string (URL) | Y | `validateUrl` http/https (BR-9) | Namespaced secret `kiroSdlc.<wsHash>.atlassian.baseUrl` |
| atlassianEmail | secret string | Y | Non-empty (completeness gate BR-7) | Namespaced secret `kiroSdlc.<wsHash>.atlassian.email` |
| atlassianToken | secret string | Y | Non-empty (completeness gate BR-7) | Namespaced secret `kiroSdlc.<wsHash>.atlassian.apiToken` |
| atlassianConnectionType | enum `cloud\|server` | Y | Missing defaults `cloud`; coerce non-`server` to `cloud` (BR-8) | Workspace config `kiroSdlc.atlassianConnectionType` |

**Output Data:**

| Field | Type | Description |
|-------|------|-------------|
| atlassianBaseUrl (state) | string | Current workspace URL for display (from namespaced secret) |
| atlassianEmail (state) | string | Current workspace email for display |
| hasAtlassianToken | boolean | Presence for current workspace only; secret never sent to webview |
| atlassianConnectionType (state) | string | Current workspace type for radio (`settings.js:650-651`) |

#### 3.2.5 UI Specifications

**Screen: SDLC Pipeline Settings — Atlassian Connection section**

| No. | Element | Type | Required | Behavior | Validation |
|-----|---------|------|----------|----------|------------|
| 1 | Jira Base URL | Text input | Y | Current workspace URL only | http/https (BR-9) |
| 2 | Email | Text input | Y | Current workspace email only | Non-empty |
| 3 | API Token / PAT | Password input | Y | Masked; `hasAtlassianToken` placeholder per-workspace; never displays value | Non-empty |
| 4 | Connection Type (`cloud`/`server` radio, `settings.js:650-651`) | Radio/dropdown | Y | Current workspace type; default `cloud` | Must be `cloud` or `server` |
| 5 | Save Atlassian button | Button | Y | Sends `saveAtlassianConfig`; shows `atlassianSaved`; refreshes state | Guarded when no folder |
| 6 | Test Atlassian button | Button | N | Sends `testAtlassianConnection`; `GET /rest/api/2/myself` with current-workspace creds; shows "Connected as {name}" or error | Requires complete triple |

#### 3.2.6 API Contract (Functional View)

**Endpoint:** `AtlassianCredentialService.saveConfig(config: AtlassianConfig): Promise<void>` + IPC `saveAtlassianConfig`
**Purpose:** Persist Atlassian connection for the current workspace only.

**Input Parameters:**

| Parameter | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| baseUrl | string | Y | BR-6, BR-9 | Validated Jira URL |
| email | string | Y | BR-6, BR-7 | Account email / username |
| apiToken | string | Y | BR-6, BR-7 | API token or PAT |
| connectionType | `cloud\|server` | Y | BR-5, BR-8 | Missing defaults `cloud` |

**Output Data:**

| Field | Type | Description |
|-------|------|-------------|
| (void) + `atlassianSaved` IPC | `{success:boolean, error?:string}` | UI feedback |

**Business Error Scenarios:**

| Scenario | User Message | Trigger Condition |
|----------|-------------|-------------------|
| Invalid URL | Invalid Jira Base URL format. | `validateUrl` fails (BR-9) |
| No workspace | No workspace folder open — open a folder to configure per-workspace Atlassian credentials. | No folder (BR-13) |
| Incomplete at test time | No credentials configured. | `getConfig()` null (BR-7) |

---
### 3.3 Feature: Settings state load (what-you-see-is-what-is-used)

**Source:** BRD US-5 (SA4E-323)

#### 3.3.1 Description

`SettingsMessageHandler.sendCurrentState()` (`SettingsMessageHandler.ts:121-126`) returns ONLY the current workspace values: `pegaEndpoint` / `pegaUsername` / `hasPegaPassword` (via `ProviderConfigService.getCurrentState()` at `ProviderConfigService.ts:17-56`, lines 39-46 switched to namespaced/Workspace reads) plus `atlassianBaseUrl` / `atlassianEmail` / `hasAtlassianToken` / `atlassianConnectionType`, plus unchanged provider/backend/MCP state. `getModels()` is unchanged. Immediate refresh after either save reflects the saved workspace. Secrets never enter the webview (boolean presence only).

#### 3.3.2 Use Case

**Use Case ID:** UC-3
**Actor:** Developer opening Settings
**Preconditions:** Workspace folder open (or no-folder fallback UC-6 applies). Resolver available.
**Postconditions:** Webview displays current-workspace values; no cross-workspace prefill.

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Developer opens Settings | | Webview sends `ready` / `getState` (`SettingsMessageHandler.ts:38-41`) |
| 2 | | SettingsMessageHandler | `sendCurrentState()`: `state = await configService.getCurrentState()` (workspace-resolved), `postMessage({type:"state", ...state})`; then `getModels()` + `postMessage({type:"models", ...})` |
| 3 | | Webview | Renders `pegaEndpoint` (`settings.js:630-631`), `pegaUsername` (`:633-634`), `atlassianConnectionType` radio (`:650-651`), presence placeholders; secrets never rendered |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | Fresh workspace with no values | Show defaults/empty: Pega endpoint default `http://localhost:8080/prweb` (config default `package.json:336-340` and `getPegaEndpoint` fallback `PegaHttpClient.ts:49`), username `""`, `has* = false`, connection type `cloud` |
| AF-2 | Save just completed | Handler re-calls `sendCurrentState()` (or caller refreshes); displayed values equal what downstream readers use |
<!-- TA enrichment -->
| AF-3 | Multi-root window | `state` reflects the canonical `workspaceFolders[0]` only (BR-17); folders[1..N] values are never displayed; Settings SHOULD show a note when `folderCount > 1` (wording: TDD, see OI-5) |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | No folder open | Show banner per UC-6; state reflects read-only legacy fallback or empty as fixed; save/test disabled or guarded |
| EF-2 | SecretStorage.get throws during state load | Treat presence as false for that key; log; do not crash state message; surface warning if needed |
<!-- TA enrichment -->
| EF-3 | `getCurrentState()` itself throws (SecretStorage outage affecting multiple keys) | Fail closed: still post `state` with `hasPegaPassword=false` / `hasAtlassianToken=false` for affected keys plus a warning field; MUST NOT substitute another workspace's cached values; next `getState` retries |

#### 3.3.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-10 | `sendCurrentState()` MUST return current-workspace values only for all six Pega/Atlassian fields + two presence flags; cross-workspace prefill is FORBIDDEN | BRD US-5 §Requirements 1,4 |
| BR-11 | Webview IPC message contracts (`state`, `models`, `pegaSaved`, `atlassianSaved`, `pegaTestResult`, `atlassianTestResult`, `pegaContextFetched`) are UNCHANGED; only resolved VALUES become workspace-scoped | BRD NFR Compatibility |

#### 3.3.4 Data Specifications

**Input Data:**

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| (getState trigger) | IPC `ready`/`getState` | Y | None | Requests current-workspace snapshot |

**Output Data:**

| Field | Type | Description |
|-------|------|-------------|
| pegaEndpoint, pegaUsername, hasPegaPassword | string, string, boolean | Workspace-resolved Pega state |
| atlassianBaseUrl, atlassianEmail, hasAtlassianToken, atlassianConnectionType | string, string, boolean, string | Workspace-resolved Atlassian state |
| provider/model/ollamaUrl/baseUrl/backend/mcp/proxy | unchanged | Non-target settings (out of scope) |

#### 3.3.5 UI Specifications

Same screen as §3.1.5/§3.2.5; additionally: presence placeholders read "saved for this workspace" vs "Not set for this workspace"; save failure shows `error` without clearing the form; no-workspace banner (UC-6) when applicable.

#### 3.3.6 API Contract (Functional View)

**Endpoint:** IPC `getState` -> `state` (+ `models`); TS `ProviderConfigService.getCurrentState(): Promise<State>`
**Purpose:** Supply the Settings UI with the current workspace snapshot.

**Business Error Scenarios:**

| Scenario | User Message | Trigger Condition |
|----------|-------------|-------------------|
| No workspace | Banner + disabled save/test (see UC-6) | No folder open |
| Partial secret failure | Presence shown as Not set; warning logged | `SecretStorage.get` throws |

---

### 3.4 Feature: Test Pega and Test Atlassian with current-workspace credentials

**Source:** BRD US-5 (SA4E-323)

#### 3.4.1 Description

Test buttons authenticate ONLY with the current workspace resolved credentials. Pega: `SettingsMessageHandler.handleTestPegaConnection()` (`SettingsMessageHandler.ts:262-277`) builds `PegaHttpClient` and GETs `getPegaEndpoint()` (connectivity check; current code tests network reachability, NOT auth — behavior preserved, scope fixed). Atlassian: `handleTestAtlassianConnection()` (`:309-316`) calls `atlassianService.testConnection()` → `GET {baseUrl}/rest/api/2/myself` with Basic `email:token` (8s abort at `AtlassianCredentialService.ts:107`), interpreted at `:120-130`. Results return via existing `pegaTestResult` / `atlassianTestResult` messages. `fetchPegaContext` keeps its existing no-folder guard (`:280-284`: "No workspace folder open to save Pega context.") and uses `folders[0]` root at `:285` plus workspace-resolved client.

#### 3.4.2 Use Case

**Use Case ID:** UC-4
**Actor:** Developer clicking Test Connection
**Preconditions:** Workspace folder open (or fallback). Workspace credentials present (or incomplete → clear message).
**Postconditions:** Result message reflects current-workspace credentials only.

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Developer clicks Test Pega / Test Atlassian | | Webview sends `testPegaConnection` / `testAtlassianConnection` |
| 2 | | SettingsMessageHandler + services | Pega: `new PegaHttpClient(secrets)` + `fetch(getPegaEndpoint())` (workspace-resolved). Atlassian: `testConnection()` → `getConfig()` (workspace-resolved) → `GET .../myself` |
| 3 | | SettingsMessageHandler | Posts `pegaTestResult {success, message}` / `atlassianTestResult {success, message}`; Atlassian success = "Connected as {displayName}" |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | Atlassian incomplete triple | Return `{success:false, message:"No credentials configured."}` without network call |
| AF-2 | Pega endpoint reachable with any HTTP status | Pega test returns success "Network OK — reachable (HTTP {status}). Authentication not tested." (preserved behavior) |
<!-- TA enrichment -->
| AF-3 | Pega endpoint empty for this workspace | `getPegaEndpoint()` returns the compiled default `http://localhost:8080/prweb`; the test probes the default and the message MUST make clear it is the workspace default, not another workspace's URL |
<!-- TA enrichment -->
| AF-4 | No-folder window: Test clicked | Uses the read-only fallback values (UC-6); result message is labeled "shared (no workspace)" so the user knows it is not workspace-verified; save stays blocked |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | Atlassian 401 | `{success:false, message:"Authentication failed (401). Check email/token."}` — scoped to current workspace creds; never fall back to another workspace |
| EF-2 | Atlassian other HTTP / network abort | `HTTP {status}: {statusText}` / `Connection failed: {message}` |
| EF-3 | Pega fetch throws | `pegaTestResult {success:false, message:"Connection failed: {message}"}` |
<!-- TA enrichment -->
| EF-4 | Atlassian test abort (8 s timeout at `AtlassianCredentialService.ts:107`) | `{success:false, message:"Connection failed: <abort reason>"}`; no automatic retry with other workspace credentials; user retries Test explicitly (retry policy: user-initiated only on the test path) |

#### 3.4.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-12 | Both tests MUST use current-workspace resolved credentials; MUST NOT fall back to another workspace on auth failure | BRD US-5 §Requirement 3 |

#### 3.4.4 Data Specifications

**Input Data:** (none beyond current-workspace stored credentials; endpoint/URL normalized by stripping trailing slashes).

**Output Data:**

| Field | Type | Description |
|-------|------|-------------|
| pegaTestResult | `{success:boolean, message:string}` | Network reachability message for current-workspace endpoint |
| atlassianTestResult | `{success:boolean, message:string}` | "Connected as {name}" or 401/HTTP/network message for current-workspace triple |

#### 3.4.5 UI Specifications

Test buttons sit in their respective sections; result message area shows the returned message verbatim; test with incomplete workspace credentials shows "not configured for this workspace" phrasing (not a generic global message).

#### 3.4.6 API Contract (Functional View)

**Endpoint:** IPC `testPegaConnection` -> `pegaTestResult`; IPC `testAtlassianConnection` -> `atlassianTestResult`; TS `AtlassianCredentialService.testConnection(): Promise<{success,message}>`
**Purpose:** Verify current-workspace credentials against the real server.

**Business Error Scenarios:** See EF-1..EF-3 above; all messages name the current workspace context.

---
### 3.5 Feature: One-time migration of legacy global values

**Source:** BRD US-3 (SA4E-323)

#### 3.5.1 Description

On first read/save in a workspace after upgrade, the Resolver lazily copies legacy globals into that workspace scope exactly once. Legacy sources: global config `kiroSdlc.pegaEndpoint` / `pegaUsername` / `atlassianConnectionType` (Global target values) and flat secrets `kiroSdlc.pegaPassword`, `kiroSdlc.atlassian.baseUrl` / `.email` / `.apiToken` (flat `SECRET_KEYS` at `LlmProviderConfig.ts:6-15`). Targets: Workspace-targeted config + `kiroSdlc.<wsHash>.*` secrets. Trigger points (any one suffices, all call the same `ensureMigrated()`): `ProviderConfigService.getCurrentState()` / `updatePegaConfig()` and `AtlassianCredentialService.getConfig()` / `saveConfig()` (exact hook points fixed in TDD). Copy semantics: copy-not-move until readable; workspace-wins (never overwrite non-empty workspace value with legacy); marker `kiroSdlc.<wsHash>.migrated="1"` prevents re-copy and prevents resurrection after intentional clear; per-workspace lazy (each workspace migrates independently on first open); failed migration is retry-safe (no marker set).

![Sequence - Migration](diagrams/sequence-migration.png)
*[Edit in draw.io](diagrams/sequence-migration.drawio)*

#### 3.5.2 Use Case

**Use Case ID:** UC-5
**Actor:** System (on first workspace access after upgrade); Developer (beneficiary)
**Preconditions:** Legacy global values may exist; current workspace may or may not have its own values; marker absent for this wsHash.
**Postconditions:** Workspace has its own values (migrated or pre-existing); marker set on success; legacy globals left intact.

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Developer opens Settings / triggers getConfig in a workspace | | Any trigger entry calls `Resolver.ensureMigrated()` first |
| 2 | | Resolver | Check marker `kiroSdlc.<wsHash>.migrated`; if present → return immediately (idempotent) |
| 3 | | Resolver | Read legacy Global config + flat secrets; read current workspace config + namespaced secrets |
| 4 | | Resolver | For each field: if workspace value non-empty → keep (workspace wins); else if legacy non-empty AND valid → copy to workspace scope (config `Workspace` target / namespaced secret), re-validating URLs with same rules as save |
| 5 | | Resolver | If all copies succeed (or nothing to copy) → set marker; keep legacy intact; return workspace values to caller |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | Marker already present | Skip all reads/writes; return current workspace values |
| AF-2 | No legacy values exist | Set marker (nothing to do); proceed with workspace values (possibly empty) |
| AF-3 | Workspace already fully populated | Copy nothing; set marker; return workspace values |
| AF-4 | Legacy value invalid (bad URL) | Skip that field (do not migrate invalid data); migrate remaining valid fields; set marker only if no secret failure occurred (invalid-data skip still counts as complete for that field) |
<!-- TA enrichment -->
| AF-5 | Workspace partially populated (e.g. endpoint set, password missing) | Field-level merge: ONLY empty workspace fields are copied from legacy; non-empty fields are untouched — workspace-wins applies per FIELD, not per workspace |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | Secret read fails during migration | Abort; keep legacy intact; do NOT set marker; surface warning; next open retries |
| EF-2 | Partial copy (config OK, secret store fails) | Do NOT set marker; next open retries missing parts; UI shows which part is missing (presence flags) |
| EF-3 | Legacy secret present but workspace secret write fails | Same as EF-2; legacy flat key untouched |
<!-- TA enrichment -->
| EF-4 | `config.update` Workspace throws during migration (read-only `.vscode/settings.json`) | Abort migration for this workspace; keep legacy intact; do NOT set marker; already-copied secrets remain (harmless — workspace-wins keeps them on retry); next open retries the missing config writes |

#### 3.5.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-13 | Migration MUST be lazy, per-workspace, idempotent: each workspace copies on first access; running twice changes nothing; marker `kiroSdlc.<wsHash>.migrated` gates re-runs | BRD US-3 §Requirements 2-4 |
| BR-14 | Workspace-wins + cleared-stays-cleared: NEVER overwrite a non-empty workspace value with legacy; NEVER resurrect a value the user cleared after migration (marker prevents re-copy) | BRD US-3 §Requirements 2,4 |
| BR-15 | Copy-not-move: legacy globals/secrets remain intact until the workspace copy is confirmed readable; failed migration sets NO marker and is retry-safe | BRD US-3 §Requirement 4 + AC-4 |

#### 3.5.4 Data Specifications

**Input Data:**

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| legacyPegaEndpoint / legacyPegaUsername / legacyConnectionType | string (Global scope) | System | Re-validate with save rules before copy | Sources to copy |
| legacyPegaPassword / legacyAtlassianBaseUrl/Email/Token | secret (flat keys) | System | Non-empty check | Sources to copy |
| migrationMarker | string `"1"` | System | Per-wsHash | `kiroSdlc.<wsHash>.migrated` |

**Output Data:**

| Field | Type | Description |
|-------|------|-------------|
| workspace config + namespaced secrets | same types as §3.1.4/§3.2.4 | Migrated copies, validated |
| marker | string | Set on success |

#### 3.5.5 UI Specifications

No dedicated migration screen. Observable behavior: user with only legacy config opens any workspace → Settings shows legacy values as that workspace's own values; all read sites work without re-entry. If migration partially fails, presence flags reveal the missing part and a warning is surfaced.

#### 3.5.6 API Contract (Functional View)

**Endpoint:** `Resolver.ensureMigrated(): Promise<void>` (internal; called by `getCurrentState()`, `getConfig()`, `updatePegaConfig()`, `saveConfig()`)
**Purpose:** Guarantee current workspace scope is populated from legacy exactly once before any read/write.

**Business Error Scenarios:**

| Scenario | User Message | Trigger Condition |
|----------|-------------|-------------------|
| Migration blocked by secret failure | Warning: could not migrate stored credentials for this workspace ({message}). Legacy kept; retry on next open. | EF-1/EF-2 |
| Invalid legacy URL skipped | (silent per-field skip; no user error unless all fields invalid) | AF-4 |

---

### 3.6 Feature: No-folder fallback and multi-root determinism

**Source:** BRD US-4 (SA4E-323)

#### 3.6.1 Description

When `vscode.workspace.workspaceFolders` is empty/undefined (loose file, empty window), the Resolver returns null scope: reads fall back to legacy Global config + flat secrets READ-ONLY; saves are BLOCKED with a clear message (no silent global write). Multi-root: canonical folder is `workspaceFolders[0]` everywhere (matches `PegaHttpClient.getWorkspaceRoot()` at `PegaHttpClient.ts:142-145` which falls back to `process.cwd()` only for disk-save purposes — the Resolver does NOT fall back to cwd for credential scope; it returns null → fallback path). Remote/WSL/SSH paths use the same normalization as wsHash (BR-16). Existing `handleFetchPegaContext()` guard ("No workspace folder open to save Pega context." at `SettingsMessageHandler.ts:282`) stays consistent.

#### 3.6.2 Use Case

**Use Case ID:** UC-6
**Actor:** Developer with no folder open / multi-root window
**Preconditions:** `workspaceFolders` empty OR length > 1.
**Postconditions:** Deterministic, documented behavior; never a silent global overwrite.

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Developer opens Settings with no folder | | `getState` detects null scope → banner "No workspace folder open — showing shared (read-only) values. Open a folder to configure per-workspace credentials."; values from legacy globals/flat keys read-only |
| 2 | Developer attempts Save with no folder | | Blocked; `pegaSaved`/`atlassianSaved success:false` with no-workspace message; NOTHING written |
| 3 | Developer uses multi-root window | | All scope + writes use `workspaceFolders[0]` deterministically; repeated opens return same values |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | No legacy globals either (empty window, fresh install) | Show empty + banner; save still blocked until a folder is opened |
<!-- TA enrichment -->
| AF-2 | Multi-root: user expects folders[1..N] config to apply | By design ONLY `workspaceFolders[0]` defines identity (BR-17); other folders' values are never read or written — document in Settings note when `folderCount > 1` |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | Scope resolution throws | Fail closed: treat as no-folder (read-only + block saves); log at debug with folder+hash context (no secrets) |

#### 3.6.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-16 | No-folder: reads fall back to legacy globals READ-ONLY; saves are BLOCKED with an explicit message; silent global writes are FORBIDDEN | BRD US-4 §Requirement 1 |
| BR-17 | Multi-root canonical folder is `workspaceFolders[0]` for hashing AND for `Workspace`-targeted writes, consistent across all services | BRD US-4 §Requirement 2; `PegaHttpClient.ts:142-145`, `SettingsMessageHandler.ts:280-285` |

#### 3.6.4 Data Specifications

**Input Data:**

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| workspaceFolderCount | number (0/1/N) | System | — | From `vscode.workspace.workspaceFolders` |
| activeFolderPath | string \| null | System | Normalization per BR-18 when non-null | Path hashed, or null → fallback |

**Output Data:** Same state shapes as §3.3.4, sourced from fallback when scope is null; plus banner flag.

#### 3.6.5 UI Specifications

| No. | Element | Type | Required | Behavior | Validation |
|-----|---------|------|----------|----------|------------|
| 1 | No-workspace banner | Notice | Conditional (no folder) | Explains read-only / disabled state | — |
| 2 | Save buttons | Button | Y | Disabled or guarded with no-workspace message when no folder | Block enforced server-side (handler), not only UI-disabled |

#### 3.6.6 API Contract (Functional View)

**Endpoint:** `Resolver.getWorkspaceFolder(): string \| null` + `getWsHash(): string \| null`
**Purpose:** Single scope decision consumed by every reader/writer; null triggers fallback.

**Business Error Scenarios:**

| Scenario | User Message | Trigger Condition |
|----------|-------------|-------------------|
| Save with no folder | No workspace folder open — open a folder to configure per-workspace Pega/Atlassian credentials. | Null scope on write path |

---

### 3.7 Feature: Downstream credential consumption (Pega + Atlassian clients, indexing)

**Source:** BRD US-1 §Requirement 3, US-2 §Requirement 3 (SA4E-323)

#### 3.7.1 Description

Every consumer resolves the current workspace scope through the Resolver — no direct `config.get("pegaEndpoint"/"pegaUsername"/"atlassianConnectionType")` with assumed Global scope and no direct `secrets.get("kiroSdlc.pegaPassword")` / flat `SECRET_KEYS.atlassian*` remain. Inventory to fix: `PegaHttpClient.getAuthHeader()` (`PegaHttpClient.ts:39-45`: username via workspace config + password via `resolver.secretKey("pega")`), `getPegaEndpoint()` (`:47-50`), `getConfiguredUsername()` (`:52-56`), `getOperatorContext()` username read (`:72-73`), `resolveDeterministicPegaHierarchy()` opId read (`:130-135`), `fetchAndSavePegaContext()` username read (`:902-903`), `IndexingService.runSchemaIndexer()` (`IndexingService.ts:232-236`: username via workspace config + `resolver.secretKey("pega")` instead of literal `"kiroSdlc.pegaPassword"`), `PegaRuleSetResolverService.getDeveloperShortName()` (`PegaRuleSetResolverService.ts:52-59`: `pegaDeveloperShortName` + `pegaUsername` workspace reads — behavior unchanged, scope fixed), `AtlassianCredentialService` all readers (UC-2), `AtlassianHttpClient.buildRequest()` (inherits scope via `getConfig()` hot-reload per request at `atlassian-http-client.ts:68-74`), `JiraProjectIndexer.run()` gate (`JiraProjectIndexer.ts:35-39`), IPC `handleCredentialRequest()` (per-workspace triple). `ProviderConfigService.updateConfig(key, value)` (`ProviderConfigService.ts:107-110`, Global) MUST NOT be used for `pegaEndpoint` / `pegaUsername` / `atlassianConnectionType` (audit callers: `setProvider`/`setModel`/`setOllamaUrl`/`setBaseUrl` at `SettingsMessageHandler.ts:42-58` are LLM keys, out of scope and stay Global).

#### 3.7.2 Use Case

**Use Case ID:** UC-7
**Actor:** System (indexing job, MCP Atlassian tool, Pega API call, IPC child server)
**Preconditions:** Workspace scope resolvable (or fallback). Workspace credentials present or absent.
**Postconditions:** Auth header / credential response uses current-workspace values only.

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Indexing / API path needs credentials | | Caller constructs service with `secrets` and calls e.g. `getAuthHeader()`, `getConfig()`, `handleCredentialRequest()` |
| 2 | | Service + Resolver | Resolve `wsHash`; read workspace config + namespaced secrets (migration ensured first) |
| 3 | | Service | Build `Basic base64(username:password)` (Pega) or `Basic base64(email:token)` (Atlassian); normalize endpoint trailing slash; proceed with request |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | Credentials absent for workspace | Pega: throw "Pega Operator ID is not configured (kiroSdlc.pegaUsername). Set it before indexing." / return schema warning "credentials not configured (set pegaUsername + password in settings)"; Atlassian: null / "not configured" per UC-2 EF-3; NO cross-workspace retry |
| AF-2 | `AtlassianHttpClient` per-request hot-reload | Each `request()` re-calls `getConfig()` so a Settings save mid-session is picked up without restart |
<!-- TA enrichment -->
| AF-3 | `runPegaProjectIndexer()` invoked with `secrets === undefined` (optional param) | Catalog fast path is skipped (`useCatalog && secrets` guard at `IndexingService.ts:259`); BFS crawl proceeds where possible without auth; no credential error is surfaced for this path |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | 401/403 at use time | Report invalid Operator ID/password (Pega) or "Authentication failed (401). Check email/token." (Atlassian) for the CURRENT workspace; never try another workspace |
| EF-2 | `getWorkspaceRoot()` disk fallback (`process.cwd()`) | Applies ONLY to file-save paths (`PegaHttpClient.getWorkspaceRoot()` at `:142-145`); credential scope still uses Resolver (null → fallback), never cwd-derived hash |
<!-- TA enrichment -->
| EF-3 | `SecretStorage.get` throws at use time (keychain locked / unavailable) | Fail closed: treat as missing credentials for THIS workspace (standard "not configured" warning per §3.7.6); MUST NOT attempt another wsHash; indexing returns the missing-credentials warning; retry on next run |

#### 3.7.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-18 | ALL Pega/Atlassian read sites MUST resolve through the single shared Resolver (scope + key derivation); direct flat-key or assumed-Global reads are FORBIDDEN after the fix; `updateConfig()` generic helper MUST NOT be used for workspace-scoped Pega/Atlassian keys | BRD Risks (missed read site), §3 Dependencies |
| BR-19 | wsHash derivation: `normalize(fsPath)` (unify `\`→`/`, strip trailing `/` except root, lowercase drive-letter/Windows paths, keep remote URI scheme+authority as-is) then `sha256("ws:"+normalized).hex.slice(0,12)` (48 bits; same 12-hex precedent as `PegaHttpClient.ts:941`); same folder → same key; different folder → different key; null folder → null scope | BRD §Business Flow note + Risk (collision) |
| BR-20 | Secrets MUST NEVER appear in `settings.json`, logs, webview state, IPC errors, or migration diagnostics; only boolean presence flags cross the webview boundary; debug logs may include folder + wsHash, never values | BRD NFR Security + US-1 AC-3 |

#### 3.7.4 Data Specifications

**Input Data:** Current-workspace config + namespaced secrets (types per §3.1.4/§3.2.4).

**Output Data:**

| Field | Type | Description |
|-------|------|-------------|
| Pega Authorization header | `Basic base64(username:password)` | Built per-request from workspace values (`PegaHttpClient.getAuthHeader()`) |
| Pega endpoint (normalized) | string | Trailing `/` stripped |
| Atlassian credential triple | `{email, apiToken, baseUrl}` | Via `getConfig()` / `handleCredentialRequest()` IPC shape `{type:"credentials", requestId, timestamp, credentials:{email, apiToken, baseUrl}}` (shape UNCHANGED at `AtlassianCredentialService.ts:66-75`) |

#### 3.7.5 UI Specifications

None (headless consumption). Observable via Test buttons (UC-4) and indexing log messages naming the resolved workspace (folder + wsHash, no secrets).

#### 3.7.6 API Contract (Functional View)

**Endpoints:** `PegaHttpClient.getAuthHeader()/getPegaEndpoint()/getConfiguredUsername()`; `AtlassianCredentialService.getConfig()/handleCredentialRequest()`; `AtlassianHttpClient.request(method, path, body?)` (auth resolved internally per request).

**Business Error Scenarios:**

| Scenario | User Message | Trigger Condition |
|----------|-------------|-------------------|
| Pega Operator missing | Pega Operator ID is not configured (kiroSdlc.pegaUsername). Set it before indexing. | Empty workspace username |
| Pega schema creds missing | Pega Schema: credentials not configured (set pegaUsername + password in settings) | Missing username or password for workspace |
| Atlassian creds missing | Atlassian credentials not configured / No credentials configured. | `getConfig()` null |

---

<!-- TA enrichment -->
### 3.8 IPC Message Contracts — Complete Schemas (TA)

> **Scope note:** `SettingsMessageHandler.handle()` dispatch (`SettingsMessageHandler.ts:30-119`) is a thin switch — message NAMES, shapes, and the `sendCurrentState()` double-post (`state` then `models` at `:121-126`) are UNCHANGED. Only the resolved VALUES become workspace-scoped (BR-11). A developer implements the fix WITHOUT touching this dispatch table except for the no-folder save guard (UC-6 step 2) — the tables below are the frozen contract both sides code against. Transport: `webview.postMessage` → extension host `handle(msg)`; host → webview `postMessage(msg)`. No authentication on IPC (local webview, same extension host). **No secret value EVER crosses this boundary in either direction** (BR-20) — only boolean presence flags host→webview; raw secrets only travel webview→host on explicit Save.

#### 3.8.1 Webview → extension host

| # | `type` | Sent when | Payload fields (all JSON) | Validation (host) | Host action |
|---|--------|-----------|---------------------------|-------------------|-------------|
| 1 | `savePegaConfig` | Save Pega clicked (`settings.js:461-462`) | `endpoint: string` (required), `username: string` (required), `password: string` (optional; absent/blank = preserve BR-3) | Null scope → blocked `pegaSaved success:false` (UC-6); endpoint must parse http/https else `pegaSaved success:false`; username trimmed | `configService.updatePegaConfig()` → `pegaSaved` (no auto `state` refresh on this path in current code — webview re-requests `getState`; TDD to confirm whether to add `sendCurrentState()` after save for WYSIWYS parity with Atlassian path — see note below) |
| 2 | `saveAtlassianConfig` | Save Atlassian clicked | `baseUrl: string` (required), `email: string` (required), `apiToken: string` (required), `connectionType: "cloud"\|"server"` (optional; missing → `"cloud"` per `SettingsMessageHandler.ts:301`) | Null scope → blocked `atlassianSaved success:false`; `validateUrl` http/https else `atlassianSaved success:false "Invalid Jira Base URL format."` | `atlassianService.saveConfig()` → `atlassianSaved` |
| 3 | `ready` / `getState` | Panel opened / refreshed (`SettingsMessageHandler.ts:38-41`) | (no fields) | None | `sendCurrentState()`: post `state` then `models` |
| 4 | `getModels` | Provider changed | `provider: string` | Unknown provider → static catalog fallback (unchanged, out of scope) | `handleGetModels()` → `models` |
| 5 | `testPegaConnection` | Test Pega clicked | (no fields; uses stored workspace endpoint) | Null scope → test runs against read-only fallback endpoint, result labeled shared (UC-4 AF-4) | `handleTestPegaConnection()` (`:262-277`) → `pegaTestResult` |
| 6 | `testAtlassianConnection` | Test Atlassian clicked | (no fields; uses stored workspace triple) | Incomplete triple → `{success:false, "No credentials configured."}` without network call | `handleTestAtlassianConnection()` (`:309-316`) → `atlassianTestResult` |
| 7 | `fetchPegaContext` | Fetch Pega context clicked | (no fields; root = `folders[0].fsPath`) | No folder → `pegaContextFetched success:false "No workspace folder open to save Pega context."` (`:280-284`, preserved verbatim) | `fetchAndSavePegaContext(root)` with workspace-resolved client → `pegaContextFetched` |

```typescript
// TA: frozen webview→host payload interfaces (TypeScript, extension host side)
interface SavePegaConfigMsg {
  type: "savePegaConfig";
  endpoint: string;          // required, trimmed; must match /^https?:\/\// after trim
  username: string;          // required, trimmed
  password?: string;         // optional; undefined/""/whitespace-only = preserve (BR-3)
}
interface SaveAtlassianConfigMsg {
  type: "saveAtlassianConfig";
  baseUrl: string;           // required; validateUrl: new URL() + protocol http:/https:
  email: string;             // required, non-empty after trim
  apiToken: string;          // required (see OI-9 for empty-string semantics)
  connectionType?: "cloud" | "server"; // missing => "cloud" (SettingsMessageHandler.ts:301)
}
// Example wire payloads:
// {"type":"savePegaConfig","endpoint":"https://pega.corp.local:8443/prweb","username":"dev.operator","password":"••••"}
// {"type":"saveAtlassianConfig","baseUrl":"https://myorg.atlassian.net","email":"dev@corp.local","apiToken":"••••","connectionType":"cloud"}
```

> **TA Note — save/state refresh asymmetry (verified in code):** the `savePegaConfig` path (`:90-97`) posts ONLY `pegaSaved` and does NOT call `sendCurrentState()`, while UC-1 step 5 / UC-3 AF-2 assume a refresh. The webview today re-requests `getState` itself. TDD MUST fix one side: either add `await this.sendCurrentState()` after both save posts, or document webview-driven refresh as the contract. Recommended: handler refreshes (single source of truth, kills a race where the user switches workspace between save and manual refresh). [Implements: BRD US-5 Requirement 2]

#### 3.8.2 Extension host → webview

| # | `type` | Sent when | Payload schema | Secrets in payload? |
|---|--------|-----------|----------------|---------------------|
| 1 | `state` | `getState`/`ready`, (recommended) after each save | `{provider, model, ollamaUrl, baseUrl, hasAnthropicKey, hasOpenaiKey, backendUrl, allowInsecureRemote, mcpServerPort, enableMcpServer, pegaEndpoint: string, pegaUsername: string, hasPegaPassword: boolean, atlassianBaseUrl: string, atlassianEmail: string, hasAtlassianToken: boolean, atlassianConnectionType: "cloud"\|"server"}` — exact shape of `ProviderConfigService.getCurrentState()` return (`ProviderConfigService.ts:17-56`); Pega/Atlassian values workspace-resolved, rest unchanged | NEVER — presence flags only (BR-10, BR-20) |
| 2 | `models` | After `state` | `{provider, models: any[], selected: string, defaultModel: string}` (unchanged) | N/A |
| 3 | `pegaSaved` | After `savePegaConfig` attempt | `{type:"pegaSaved", success: true}` or `{type:"pegaSaved", success:false, error: string}` — `error` is a display-ready message naming the workspace context (e.g. no-workspace / invalid-URL / partial-save warning); MUST NOT contain values | No |
| 4 | `atlassianSaved` | After `saveAtlassianConfig` attempt | Same shape as `pegaSaved` with `type:"atlassianSaved"` | No |
| 5 | `pegaTestResult` | After `testPegaConnection` | `{type:"pegaTestResult", success: boolean, message: string}` — success = `"✅ Network OK — Pega Server reachable (HTTP {status}). Authentication not tested."` (`:270` verbatim, preserved); failure = `"Connection failed: {message}"` / `"Connection failed: no response from server"` | No |
| 6 | `atlassianTestResult` | After `testAtlassianConnection` | `{type:"atlassianTestResult", success: boolean, message: string}` — success = `"Connected as {displayName}"`; failure ∈ `{"No credentials configured.", "Authentication failed (401). Check email/token.", "HTTP {status}: {statusText}", "Connection failed: {message}"}` (`AtlassianCredentialService.ts:52-58,120-130`) | No |
| 7 | `pegaContextFetched` | After `fetchPegaContext` | `{type:"pegaContextFetched", success: true, message: 'Fetched context: App "{name}" ({n} CaseTypes) → saved {path}'}` or `{success:false, message:"No workspace folder open to save Pega context." \| "Fetch failed: {message}"}` (`:282,288-292` verbatim) | No |

```typescript
// TA: frozen host→webview payload interfaces
interface StateMsg {
  type: "state";
  pegaEndpoint: string; pegaUsername: string; hasPegaPassword: boolean;
  atlassianBaseUrl: string; atlassianEmail: string;
  hasAtlassianToken: boolean; atlassianConnectionType: string;
  // + unchanged: provider, model, ollamaUrl, baseUrl, hasAnthropicKey,
  //   hasOpenaiKey, backendUrl, allowInsecureRemote, mcpServerPort, enableMcpServer
}
interface AckMsg { type: "pegaSaved" | "atlassianSaved"; success: boolean; error?: string; }
interface TestResultMsg {
  type: "pegaTestResult" | "atlassianTestResult";
  success: boolean; message: string;
}
// Example wire payloads (Workspace A):
// {"type":"state","pegaEndpoint":"https://pega-a.corp/prweb","pegaUsername":"op.a",
//  "hasPegaPassword":true,"atlassianBaseUrl":"https://a.atlassian.net",
//  "atlassianEmail":"a@corp.local","hasAtlassianToken":true,"atlassianConnectionType":"cloud", ...}
// {"type":"pegaSaved","success":true}
// {"type":"atlassianSaved","success":false,"error":"Invalid Jira Base URL format."}
// {"type":"atlassianTestResult","success":true,"message":"Connected as Alice Nguyen"}
```

#### 3.8.3 Internal credential IPC (extension host → child MCP server)

Unchanged shape, workspace-scoped values — `AtlassianCredentialService.handleCredentialRequest()` (`AtlassianCredentialService.ts:61-76`):

```typescript
interface CredentialResponse {
  type: "credentials";       // literal, unchanged
  requestId: string;         // echoes caller requestId
  timestamp: number;         // Date.now()
  credentials: { email: string; apiToken: string; baseUrl: string }; // current-ws triple
}
// Failure (incomplete triple for current ws): throw Error(
//   "Atlassian credentials not configured in extension.") — message verbatim, no values.
```

**IPC error-code summary (all new blocked-save guards use these exact strings):**

| `type` | `success` | `error` / `message` | Trigger |
|--------|-----------|---------------------|---------|
| `pegaSaved` | false | `"No workspace folder open — Pega config requires a workspace to isolate credentials."` | Null scope on Pega save (BR-16) |
| `atlassianSaved` | false | `"No workspace folder open — open a folder to configure per-workspace Atlassian credentials."` | Null scope on Atlassian save (BR-16) |
| `pegaSaved` | false | `"Invalid Pega Endpoint URL (http/https required)."` | Endpoint fails http/https check (BR-4) |
| `atlassianSaved` | false | `"Invalid Jira Base URL format."` | `validateUrl` fails (BR-9) |
| `pegaSaved`/`atlassianSaved` | false | `"Failed to save {Pega/Atlassian} config: {message} (password/token may not be saved — retry)."` | `SecretStorage.store` or `config.update` throws (§9) |

---

## 4. Data Model
> Logical model only. There is no relational database: non-secrets live in VS Code Configuration (Workspace scope `.vscode/settings.json`), secrets live in VS Code SecretStorage (OS keychain) under namespaced keys. Physical DDL/migrations are not applicable; the TDD specifies the Resolver implementation and file diffs.

### 4.1 Secret-Key Scheme (replaces ER diagram for this ticket)

No `er-diagram.png` is produced for SA4E-323 because there are no relational entities; the "relationships" are key-derivation mappings below. All five FSD diagrams are listed in §2.1.

| Legacy flat key (BEFORE, global) | Workspace key (AFTER, per wsHash) | Scope | Defined at |
|----------------------------------|-----------------------------------|-------|------------|
| (config Global) `kiroSdlc.pegaEndpoint` | (config Workspace) `kiroSdlc.pegaEndpoint` | Workspace `.vscode/settings.json` | `ProviderConfigService.ts:60`, `package.json:336-340` |
| (config Global) `kiroSdlc.pegaUsername` | (config Workspace) `kiroSdlc.pegaUsername` | Workspace | `ProviderConfigService.ts:61`, `package.json:346-350` |
| (config Global) `kiroSdlc.atlassianConnectionType` | (config Workspace) `kiroSdlc.atlassianConnectionType` | Workspace | `AtlassianCredentialService.ts:93`, `package.json:356-364` |
| `kiroSdlc.pegaPassword` (`SECRET_KEYS.pega`) | `kiroSdlc.<wsHash>.pegaPassword` | SecretStorage namespaced | `LlmProviderConfig.ts:11` -> Resolver |
| `kiroSdlc.atlassian.baseUrl` (`SECRET_KEYS.atlassianBaseUrl`) | `kiroSdlc.<wsHash>.atlassian.baseUrl` | SecretStorage namespaced | `LlmProviderConfig.ts:14` -> Resolver |
| `kiroSdlc.atlassian.email` (`SECRET_KEYS.atlassianEmail`) | `kiroSdlc.<wsHash>.atlassian.email` | SecretStorage namespaced | `LlmProviderConfig.ts:12` -> Resolver |
| `kiroSdlc.atlassian.apiToken` (`SECRET_KEYS.atlassianToken`) | `kiroSdlc.<wsHash>.atlassian.apiToken` | SecretStorage namespaced | `LlmProviderConfig.ts:13` -> Resolver |
| (none) | `kiroSdlc.<wsHash>.migrated` = `"1"` | SecretStorage marker | NEW (BR-13) |

Out of scope (stay Global, unchanged): `llmProvider` / `llmModel` / `ollamaUrl` / provider base URLs / API keys via generic `updateConfig()` (`ProviderConfigService.ts:107-110`) and `chat-panel-provider.ts:405` (`llmModel` Global).

<!-- TA enrichment -->
> **TA verification vs actual codebase (2026-09-24 — repo-wide grep, all hits reviewed):**
>
> 1. **SECRET_KEYS exact strings confirmed** (`LlmProviderConfig.ts:6-15`): `pega="kiroSdlc.pegaPassword"`, `atlassianEmail="kiroSdlc.atlassian.email"`, `atlassianToken="kiroSdlc.atlassian.apiToken"`, `atlassianBaseUrl="kiroSdlc.atlassian.baseUrl"` — §4.1 mapping is exact. Flat-key read sites found: `ProviderConfigService.ts:39,43-45` (5 gets), `AtlassianCredentialService.ts:35-37,43-45` (3 stores + 3 gets), `PegaHttpClient.ts:42` (1 get) — plus ONE literal bypass: `IndexingService.ts:234` uses the raw string `"kiroSdlc.pegaPassword"` instead of `SECRET_KEYS.pega` (same value, must also route through `secretKey("pega")` — TDD to replace the literal, not just the constant).
> 2. **ConfigurationTarget write sites confirmed** (only 3 to change): `ProviderConfigService.ts:60-61` (`pegaEndpoint`, `pegaUsername`), `AtlassianCredentialService.ts:93` (`atlassianConnectionType`). All other `Workspace` writes (`proxy.*`, `backend.url`, `backend.allowInsecureRemote`, `mcpServerPort`, `enableMcpServer`, `jiraLastProject`, `jiraSyncState`, checksums, `configPath`) are already correct and untouched. `updateConfig()` (`ProviderConfigService.ts:107-110`, Global) callers audited: `setProvider`/`setModel`/`setOllamaUrl`/`setBaseUrl` (`SettingsMessageHandler.ts:42-58`) are LLM-only — BR-18 guard (reject Pega/Atlassian keys in `updateConfig`, or assert target per key) is sufficient; no caller change needed.
> 3. **Read sites need NO target change** (merged-read semantics, see §1.3 TA Note + §5.4.3): `config.get("pegaEndpoint"/"pegaUsername")` at `PegaHttpClient.ts:41,49,55,73,133,903`, `IndexingService.ts:233`, `PegaRuleSetResolverService.ts:54,56`, `ProviderConfigService.ts:40-41`, `atlassianConnectionType` at `AtlassianCredentialService.ts:98`, `ProviderConfigService.ts:46` — all return the Workspace value automatically once written. Migration legacy reads MUST use `config.inspect(k)?.globalValue`.
> 4. **`pegaDeveloperShortName` (declared `package.json:351-355`, read `PegaRuleSetResolverService.ts:52-59`) has NO write path anywhere in `extension/src`** — it can only arrive via manual `settings.json` edit. Merged `config.get` means a per-workspace manual value already wins; a Global manual value leaks into branch naming across workspaces. Decision tracked as OI-10 (default: document as out-of-scope, no code change).
> 5. **Test-only references** (`__tests__/pega-*.test.ts` mocking `pegaEndpoint`/`pegaUsername`/`pegaDeveloperShortName`) are unaffected — they mock `getConfiguration`, not SecretStorage keys — but new unit tests for the Resolver (TC-17, TC-20) belong beside them. [Implements: BRD §3 `SECRET_KEYS` dependency, BRD Risks "missed read site" + "`updateConfig` bypass"]

### 4.2 Logical Entities

#### Entity: WorkspaceScope

| Attribute | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| folderPath | string \| null | Y | BR-16, BR-17 | `workspaceFolders[0].uri.fsPath` or null |
| normalizedPath | string \| null | Y | BR-19 | Normalized for hashing |
| wsHash | string (12 hex) \| null | Y | BR-19 | `sha256("ws:"+normalized).hex.slice(0,12)` or null |
| folderCount | number | Y | BR-16 | 0 / 1 / N |

**Relationships:**

| From Entity | To Entity | Cardinality | Description |
|-------------|-----------|-------------|-------------|
| WorkspaceScope | PegaWorkspaceConfig | 1:1 | Each workspace has at most one Pega config |
| WorkspaceScope | AtlassianWorkspaceConfig | 1:1 | Each workspace has at most one Atlassian config |
| WorkspaceScope | MigrationState | 1:1 | One marker per wsHash |

#### Entity: PegaWorkspaceConfig

| Attribute | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| endpoint | string (URL) | Y | BR-1, BR-4 | Workspace config |
| username | string | Y | BR-1 | Workspace config |
| hasPassword | boolean | Y | BR-10 | Presence of `kiroSdlc.<wsHash>.pegaPassword` |

#### Entity: AtlassianWorkspaceConfig

| Attribute | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| baseUrl | secret string | Y | BR-6, BR-9 | Namespaced secret |
| email | secret string | Y | BR-6 | Namespaced secret |
| hasToken | boolean | Y | BR-10 | Presence of namespaced token |
| connectionType | enum `cloud\|server` | Y | BR-5, BR-8 | Workspace config, default `cloud` |

#### Entity: MigrationState

| Attribute | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| wsHash | string | Y | BR-13 | Which workspace was migrated |
| migrated | string `"1"` | Y | BR-13 | Set only after successful copy |
| legacySnapshot | (transient) | N | BR-15 | Legacy values read during migration, never persisted |

---

## 5. Integration Specifications

### 5.1 External System: Pega Platform

| Attribute | Value |
|-----------|-------|
| Purpose | Validate Operator credentials and serve Pega REST (rules, operator context, DataPages); Test/Fetch/Indexing call it with workspace credentials |
| Direction | Outbound (extension -> Pega server) |
| Data Format | JSON over HTTPS (Basic auth) |
| Frequency | On-demand (test, fetch context, indexing, rule read/write) |

**Data Exchange:**

| Our Data | External Data | Direction | Business Rule |
|----------|--------------|-----------|---------------|
| `Basic base64(<ws>.username:<ws>.password)` + normalized endpoint | Pega session / rule JSON / 401/403 | Send/Receive | BR-12, BR-18, BR-20: only current-workspace creds; 401/403 never triggers cross-workspace retry |

### 5.2 External System: Jira Cloud / Server

| Attribute | Value |
|-----------|-------|
| Purpose | Validate Atlassian triple and serve Jira REST (`/rest/api/2/myself`, issue/agile/attachment APIs via `AtlassianHttpClient`); Test/Indexing call it with workspace triple |
| Direction | Outbound |
| Data Format | JSON over HTTPS (Basic `email:token`) |
| Frequency | On-demand (test per click; indexing per sync; MCP tools per request with hot-reload) |

**Data Exchange:**

| Our Data | External Data | Direction | Business Rule |
|----------|--------------|-----------|---------------|
| `Basic base64(<ws>.email:<ws>.token)` + `baseUrl` | `displayName` ("Connected as {name}") / 401 / HTTP errors | Send/Receive | BR-7, BR-12, BR-18: incomplete triple never calls network; 401 scoped to current workspace |

### 5.3 Internal Integration: VS Code Configuration + SecretStorage

| Attribute | Value |
|-----------|-------|
| Purpose | Persistence layer for isolation (Workspace `.vscode/settings.json` + OS-keychain SecretStorage with namespaced keys) |
| Direction | Bidirectional (read/write via Resolver) |
| Data Format | Settings JSON (non-secrets) + opaque secrets |
| Frequency | Every save / getState / consumer read / migration check |

**Data Exchange:**

| Our Data | External Data | Direction | Business Rule |
|----------|--------------|-----------|---------------|
| `pegaEndpoint/pegaUsername/atlassianConnectionType` | Workspace `.vscode/settings.json` | Send/Receive | BR-1, BR-5: `Workspace` target only |
| `kiroSdlc.<wsHash>.*` secrets + marker | SecretStorage | Send/Receive | BR-2, BR-6, BR-13, BR-20 |

---

<!-- TA enrichment -->
### 5.4 Full Request/Response Contracts (TA — developer-implementable)

#### 5.4.1 Pega Platform REST (outbound, Basic auth, workspace credentials)

All calls use endpoint `E = getPegaEndpoint()` (trailing `/` stripped) and header `Authorization: Basic base64(<ws>.username:<ws>.password)` built per request from workspace-resolved values. No client-side retry; no circuit breaker (single-shot calls; failure surfaces immediately per §9).

**Call A — connectivity check (Test Pega button):** `SettingsMessageHandler.handleTestPegaConnection()` (`SettingsMessageHandler.ts:262-277`).

| Item | Spec |
|------|------|
| Method + URL | `GET {E}` (endpoint root, e.g. `GET https://pega.corp.local:8443/prweb`) |
| Request headers | None (connectivity only — NO auth header; behavior preserved verbatim) |
| Timeout | ⚠️ NONE in current code (no `AbortController`) — hangs until OS/fetch default timeout. TDD MUST add one — see OI-7 (recommended: 8000 ms parity with Atlassian test path) |
| Success response | ANY received HTTP response (`res.status > 0`) → `pegaTestResult {success:true, message:"✅ Network OK — Pega Server reachable (HTTP {status}). Authentication not tested."}` |
| Failure | fetch throws OR no response → `pegaTestResult {success:false, message:"Connection failed: {message}"}` / `"Connection failed: no response from server"` |

**Call B — operator context (indexing/fetch paths):** `PegaHttpClient.getOperatorContext()` (`PegaHttpClient.ts:68-122`). Tries URLs in order, first `2xx` wins:

| # | Method + URL | Headers | Response mapping |
|---|--------------|---------|------------------|
| B1 | `GET {E}/api/v1/data/D_OperatorID` | `Authorization: Basic …` | `operatorId = body.pyUserIdentifier \|\| <ws>.username`; `activeAccessGroup = body.pyAccessGroup \|\| ""`; sets `activePrefix = {E}/api/CodeIntelligence/v1` |
| B2 (fallback) | `GET {E}/PRRestService/api/v1/data/D_OperatorID` | same | same, but `activePrefix = {E}/PRRestService/CodeIntelligence/v1` |
| B3 (fallback) | `GET {E}/api/v1/casetypes` then `GET {E}/PRRestService/api/v1/casetypes` | same | `operatorId = <ws>.username`; app name from `body.caseTypes[0].name` |

| Status | Handling |
|--------|----------|
| `200` | Map per table above |
| `401` | Throw `Error("HTTP 401 Unauthorized (Invalid Operator ID or Password)")` — current-workspace creds only, no cross-workspace retry (BR-12) |
| `403` | Throw `Error("HTTP 403 Forbidden (Operator does not have access)")` |
| Other / network | Try next URL; all fail → throw `Error("Failed to connect to Pega Server")` |

#### 5.4.2 Jira Cloud/Server REST (outbound, Basic auth, workspace triple)

**Call C — myself check (Test Atlassian button):** `AtlassianCredentialService.performMyselfRequest()` (`AtlassianCredentialService.ts:102-118`).

| Item | Spec |
|------|------|
| Precondition | `getConfig()` non-null (all three namespaced secrets present for current ws); else return `{success:false, message:"No credentials configured."}` with NO network call |
| Method + URL | `GET {baseUrl.replace(/\/+$/, "")}/rest/api/2/myself` (e.g. `GET https://myorg.atlassian.net/rest/api/2/myself`) |
| Request headers | `Authorization: Basic base64(<ws>.email:<ws>.apiToken)`, `Accept: application/json` (`:108-111`) |
| Timeout | 8000 ms via `AbortController` (`:106-107`); abort → `{success:false, message:"Connection failed: <reason>"}` |
| Retry | NONE on this path (single-shot; user-initiated retry only) |
| Success (`2xx`) | Parse `{displayName?: string}` → `{success:true, message:"Connected as {displayName \|\| 'Unknown User'}"}` |
| `401` | `{success:false, message:"Authentication failed (401). Check email/token."}` — never retry with another workspace |
| Other HTTP | `{success:false, message:"HTTP {status}: {statusText}"}` |

**Call D — MCP/Jira data plane (indexing, LinkCrawler, attachments):** `AtlassianHttpClient` (`atlassian-http-client.ts:55-154`).

| Item | Spec |
|------|------|
| Credential resolution | Per REQUEST: `buildRequest()` re-calls `credService.getConfig()` (`:68-74`) → hot-reload (UC-7 AF-2); null → throw `Error("Atlassian credentials not configured")` |
| URL + auth | Same URL normalization and `Basic base64(email:token)` construction as Call C; `Accept: application/json` + `Content-Type: application/json` when body present and not upload (`:100-103`) |
| Timeout | Default 30000 ms per attempt (`DEFAULT_TIMEOUT_MS`), overridable via `AtlassianRequestOptions.timeout`; `AbortController` per attempt |
| Retry policy | Retry ONLY `429` and `5xx` (`isRetryable`, `:147-149`); max attempts = 1 + `MAX_RETRIES` (code: `attempt < MAX_RETRIES`, `:126,139`); backoff = `Retry-After` header seconds if present else `BASE_DELAY_MS * 2^attempt` (`:151-154`, `:140`); `401/403/4xx` NEVER retried |
| Success | `2xx` with empty body → `{status, data: undefined}`; JSON content-type → parsed JSON; otherwise raw text (`:111-119`) |
| Failure (exhausted) | Throw `Error("HTTP {status}: {errorText}")` or the network error |

#### 5.4.3 VS Code platform (internal integration — the actual isolation mechanism)

**Configuration API** (`vscode.workspace.getConfiguration("kiroSdlc")`):

| Key | Read (after fix) | Write (after fix) | Default (`package.json`) |
|-----|------------------|-------------------|--------------------------|
| `pegaEndpoint` | `config.get("pegaEndpoint", "http://localhost:8080/prweb")` — merged (Workspace wins) | `config.update("pegaEndpoint", endpoint, Workspace)` (was Global, `ProviderConfigService.ts:60`) | `http://localhost:8080/prweb` (`:336-340`) |
| `pegaUsername` | `config.get("pegaUsername", "")` — merged | `config.update("pegaUsername", username, Workspace)` (was Global, `:61`) | `""` (`:346-350`) |
| `atlassianConnectionType` | `config.get("atlassianConnectionType", "cloud")` + coerce non-`server`→`cloud` — merged | `config.update("atlassianConnectionType", type, Workspace)` (was Global, `AtlassianCredentialService.ts:93`) | `"cloud"`, enum `cloud\|server` (`:356-364`) |
| legacy Global read (migration ONLY) | `config.inspect(key)?.globalValue` — MUST be used to read pre-upgrade values; plain `get` would return the already-migrated Workspace value | — (legacy never written; retention: OI-6) | — |

**SecretStorage API** (`vscode.SecretStorage` — OS keychain, extension-scoped, no native workspace scope):

| Operation | Keys (after fix) | Notes |
|-----------|------------------|-------|
| `secrets.get(nsKey)` | `kiroSdlc.<wsHash>.pegaPassword`, `kiroSdlc.<wsHash>.atlassian.baseUrl`, `kiroSdlc.<wsHash>.atlassian.email`, `kiroSdlc.<wsHash>.atlassian.apiToken`, `kiroSdlc.<wsHash>.migrated` | Key built ONLY via `resolver.secretKey(base)` (§6.3.1); missing → `undefined` → presence `false` |
| `secrets.store(nsKey, value)` | same | Overwrite is idempotent (retry-safe); failure → no marker, warn partial save |
| `secrets.delete(nsKey)` | same | Used ONLY by the future Clear action (OI-8); no delete in the base fix |
| legacy read (migration ONLY) | flat `SECRET_KEYS.pega` = `"kiroSdlc.pegaPassword"`, `SECRET_KEYS.atlassianBaseUrl/Email/Token` (exact strings verified in `LlmProviderConfig.ts:6-15`) | Kept as read-only legacy constants (OI-4); NEVER written after fix |

> **TA Note — `config.get` merged-read nuance (verified against VS Code API semantics + all read sites):** plain `config.get("pegaEndpoint"/"pegaUsername"/"atlassianConnectionType")` at `PegaHttpClient.ts:41,49,55,73,133,903`, `PegaRuleSetResolverService.ts:54,56`, `ProviderConfigService.ts:40-41,46`, `AtlassianCredentialService.ts:98` ALREADY returns the Workspace value once a Workspace value exists — these reads need NO target parameter change. The three write sites above are the only `ConfigurationTarget` changes. New code MUST NOT pass an explicit target on reads (explicit `Global` on a read would reintroduce the leak).

---

## 6. Processing Logic

### 6.1 Migration runner (`ensureMigrated`)

**Trigger:** First `getCurrentState()` / `getConfig()` / `updatePegaConfig()` / `saveConfig()` call in a workspace after upgrade (all four call `ensureMigrated()`; exact wiring in TDD).
**Schedule:** Lazy, once per workspace (marker-gated).
**Input:** Legacy Global config + flat secrets; current workspace config + namespaced secrets; marker.
**Output:** Workspace-populated scope + marker set (or retry-safe abort).

**Processing Steps:**

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Resolve scope: folder + wsHash; null → fallback path (UC-6), skip migration | Fail closed to read-only |
| 2 | If marker `kiroSdlc.<wsHash>.migrated` present → return (AF-1) | — |
| 3 | Read legacy globals + flat secrets; read workspace scope | Secret read failure → abort, no marker, warning (EF-1) |
| 4 | For each field: workspace non-empty → keep; else legacy non-empty + valid → copy (re-validate URLs) | Invalid legacy skipped (AF-4); workspace-wins enforced (BR-14) |
| 5 | Write Workspace config + namespaced secrets | Store failure → no marker, retry next open (EF-2) |
| 6 | Set marker; keep legacy intact | — |

**Activity Diagram:**

![Migration sequence](diagrams/sequence-migration.png)
*[Edit in draw.io](diagrams/sequence-migration.drawio)*

### 6.2 Workspace hash resolution (`getWsHash`)

**Trigger:** Every read/write/migration/test call.
**Schedule:** Synchronous, sub-millisecond, no I/O except folder lookup.
**Input:** `vscode.workspace.workspaceFolders`.
**Output:** `wsHash` (12 hex) or null.

**Processing Steps:**

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | If no folders → return null (fallback UC-6) | — |
| 2 | Take `workspaceFolders[0].uri.fsPath` (BR-17) | — |
| 3 | Normalize: `\`→`/`, strip trailing `/` (keep root), lowercase Windows drive paths, preserve remote scheme+authority (BR-19) | On exception → null (fail closed, EF-1 of UC-6) |
| 4 | `wsHash = sha256("ws:"+normalized).hex.slice(0,12)`; `secretKey(base) = "kiroSdlc."+wsHash+"."+suffix` (suffixes: `pegaPassword`, `atlassian.baseUrl`, `atlassian.email`, `atlassian.apiToken`, `migrated`) | Log folder+hash at debug only (BR-20) |

**State Diagram (workspace config lifecycle):**

![Workspace config lifecycle](diagrams/state.png)
*[Edit in draw.io](diagrams/state.drawio)*

States: `Empty` (no values anywhere) / `LegacyGlobalOnly` / `Migrating` / `IsolatedActive` (steady state) / `ClearedAfterMigration` (stays cleared, marker blocks resurrect) / `NoFolderFallback` (read-only + blocked saves). Transitions are labeled in the diagram.

---

<!-- TA enrichment -->
### 6.3 Reference Pseudocode — TypeScript (TA, implementable as-is)

> Language: TypeScript (project stack: Hono backend + Svelte/VS Code extension host; `createHash` from `crypto` — same import style as the `projectId` precedent at `PegaHttpClient.ts:941`). All blocks assume the NEW shared module (name/location fixed in TDD, default recommendation `extension/src/services/WorkspaceScopeResolver.ts`). Every read/write site in §1.2 calls these helpers — no duplicated hash logic (BR-18, BR-19).

#### 6.3.1 Path normalization + wsHash + secret-key derivation [Implements: BR-19]

```typescript
import * as vscode from "vscode";
import { createHash } from "crypto";

/** Canonical folder for scope: workspaceFolders[0], or null (UC-6 fallback). */
export function getWorkspaceFolder(): string | null {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) { return null; }
  return folders[0].uri.fsPath; // BR-17: multi-root determinism
}

/** Normalize so the same folder always maps to the same key (BR-19). */
export function normalizePath(fsPath: string): string {
  let p = fsPath.replace(/\\/g, "/");          // unify separators (Windows + remote)
  if (p.length > 1) { p = p.replace(/\/+$/, ""); } // strip trailing slash, keep "/" root
  const drive = p.match(/^([a-zA-Z]):\//);      // lowercase Windows drive letter
  if (drive) { p = drive[1].toLowerCase() + p.slice(2); }
  return p; // remote URI-derived fsPaths keep scheme+authority via uri.fsPath as-is
}

/** 12-hex workspace identity: sha256("ws:"+normalized).slice(0,12) — 48 bits,
 *  same 12-hex precedent as projectId sha256("pega:"+appName).slice(0,12)
 *  (PegaHttpClient.ts:941). Sub-millisecond, no I/O. Null folder -> null scope. */
export function getWsHash(): string | null {
  const folder = getWorkspaceFolder();
  if (!folder) { return null; }
  try {
    return createHash("sha256").update("ws:" + normalizePath(folder)).digest("hex").slice(0, 12);
  } catch {
    return null; // fail closed -> UC-6 fallback (EF-1)
  }
}

export type SecretBase = "pega" | "atlassianBaseUrl" | "atlassianEmail" | "atlassianToken";
const SECRET_SUFFIX: Record<SecretBase, string> = {
  pega: "pegaPassword",
  atlassianBaseUrl: "atlassian.baseUrl",
  atlassianEmail: "atlassian.email",
  atlassianToken: "atlassian.apiToken",
};

/** Namespaced key. Returns null when there is no workspace (callers then use fallback). */
export function secretKey(base: SecretBase, wsHash: string | null = getWsHash()): string | null {
  if (!wsHash) { return null; }
  return `kiroSdlc.${wsHash}.${SECRET_SUFFIX[base]}`;
}
export function migrationMarkerKey(wsHash: string): string {
  return `kiroSdlc.${wsHash}.migrated`;
}
```

#### 6.3.2 Lazy idempotent migration — copy-not-move + workspace-wins [Implements: BR-13, BR-14, BR-15, UC-5]

```typescript
// Legacy flat sources (read-only after fix; exact strings from LlmProviderConfig.ts:6-15)
const LEGACY_SECRET: Record<SecretBase, string> = {
  pega: "kiroSdlc.pegaPassword",
  atlassianBaseUrl: "kiroSdlc.atlassian.baseUrl",
  atlassianEmail: "kiroSdlc.atlassian.email",
  atlassianToken: "kiroSdlc.atlassian.apiToken",
};
const LEGACY_CONFIG = ["pegaEndpoint", "pegaUsername", "atlassianConnectionType"] as const;

/** Called FIRST by getCurrentState()/updatePegaConfig()/getConfig()/saveConfig().
 *  Exactly-once per wsHash via marker; retry-safe (no marker unless fully done). */
export async function ensureMigrated(secrets: vscode.SecretStorage): Promise<void> {
  const wsHash = getWsHash();
  if (!wsHash) { return; }                              // UC-6: no folder -> fallback, skip
  const marker = migrationMarkerKey(wsHash);
  if (await secrets.get(marker)) { return; }            // AF-1: idempotent, done before
  const config = vscode.workspace.getConfiguration("kiroSdlc");
  try {
    // 1. Snapshot legacy (Global scope ONLY — plain get() would return migrated values!)
    const legacyConfig: Record<string, string | undefined> = {};
    for (const k of LEGACY_CONFIG) { legacyConfig[k] = config.inspect<string>(k)?.globalValue; }
    const legacySecret: Record<SecretBase, string | undefined> = {
      pega: await secrets.get(LEGACY_SECRET.pega),
      atlassianBaseUrl: await secrets.get(LEGACY_SECRET.atlassianBaseUrl),
      atlassianEmail: await secrets.get(LEGACY_SECRET.atlassianEmail),
      atlassianToken: await secrets.get(LEGACY_SECRET.atlassianToken),
    };
    // 2. Snapshot current workspace scope (merged get() returns Workspace value if present)
    // 3. Field-level copy: workspace non-empty wins; else legacy non-empty+valid copies over
    let failed = false;
    for (const k of LEGACY_CONFIG) {
      const current = config.get<string>(k, "");
      const legacy = (legacyConfig[k] ?? "").trim();
      if (current.trim() !== "" || legacy === "") { continue; }      // workspace-wins / nothing to copy
      if ((k === "pegaEndpoint" || k === "atlassianConnectionType") && !isValidFor(k, legacy)) {
        continue; // AF-4: skip invalid legacy (bad URL / bad enum), still counts as handled
      }
      try { await config.update(k, legacy, vscode.ConfigurationTarget.Workspace); }
      catch { failed = true; }                                       // EF-4: retry next open
    }
    for (const b of Object.keys(LEGACY_SECRET) as SecretBase[]) {
      const nsKey = secretKey(b, wsHash)!;
      const current = await secrets.get(nsKey);
      const legacy = legacySecret[b];
      if (current || !legacy) { continue; }                          // workspace-wins / nothing to copy
      try { await secrets.store(nsKey, legacy); }
      catch { failed = true; }                                       // EF-2/EF-3: retry next open
    }
    // 4. Marker ONLY on full success; legacy keys NEVER deleted (copy-not-move, OI-6)
    if (!failed) { await secrets.store(marker, "1"); }
    // (log: folder + wsHash + copied/skipped field NAMES only — never values, BR-20)
  } catch {
    // EF-1: any read failure -> abort, no marker, legacy intact, warn; next open retries
  }
}
```

#### 6.3.3 Scope-guarded writes — no-folder block + new method bodies [Implements: BR-1, BR-2, BR-5, BR-6, BR-16]

```typescript
// ProviderConfigService.updatePegaConfig — AFTER (diff: Global->Workspace, flat->namespaced)
async updatePegaConfig(endpoint: string, username: string, password?: string): Promise<void> {
  const wsHash = getWsHash();
  if (!wsHash) {
    throw new Error("No workspace folder open — Pega config requires a workspace to isolate credentials.");
  }
  await ensureMigrated(this.secrets);
  const e = endpoint.trim(), u = username.trim();
  if (!/^https?:\/\//.test(e)) { throw new Error("Invalid Pega Endpoint URL (http/https required)."); }
  const config = vscode.workspace.getConfiguration("kiroSdlc");
  await config.update("pegaEndpoint", e, vscode.ConfigurationTarget.Workspace);   // was Global
  await config.update("pegaUsername", u, vscode.ConfigurationTarget.Workspace);   // was Global
  if (password && password.trim().length > 0) {                                    // BR-3 preserved
    await this.secrets.store(secretKey("pega", wsHash)!, password);
  }
}

// AtlassianCredentialService.saveConfig — AFTER (diff: flat->namespaced, Global->Workspace)
async saveConfig(config: AtlassianConfig): Promise<void> {
  const wsHash = getWsHash();
  if (!wsHash) {
    throw new Error("No workspace folder open — open a folder to configure per-workspace Atlassian credentials.");
  }
  await ensureMigrated(this.secrets);
  this.validateUrl(config.baseUrl); // unchanged verbatim (:80-89)
  await this.secrets.store(secretKey("atlassianBaseUrl", wsHash)!, config.baseUrl);
  await this.secrets.store(secretKey("atlassianEmail", wsHash)!, config.email);
  await this.secrets.store(secretKey("atlassianToken", wsHash)!, config.apiToken);
  await this.storeConnectionType(config.connectionType); // -> Workspace target (was Global, :93)
}

// Reads: getCurrentState()/getConfig()/getAuthHeader()/getPegaEndpoint()/readConnectionType()
// patterns — merged get() + namespaced secretKey(), with ensureMigrated() first:
const wsHash = getWsHash();
const pegaPassword = wsHash ? await secrets.get(secretKey("pega", wsHash)!) : undefined;
// null scope -> legacy read-only fallback (UC-6):
//   config.inspect("pegaEndpoint")?.globalValue + secrets.get(LEGACY_SECRET.pega)
```

---

## 7. Security Requirements

### 7.1 Authentication & Authorization

| Role | Permissions | Screens/Features |
|------|-------------|-------------------|
| VS Code user (workspace member with folder access) | Read/Write current-workspace Pega/Atlassian config | Settings Pega + Atlassian sections, Test buttons, Fetch Pega Context |
| Indexing / MCP tools (same OS user) | Read current-workspace credentials only | `PegaHttpClient`, `IndexingService`, `AtlassianHttpClient`, `JiraProjectIndexer`, IPC `handleCredentialRequest` |
| Other workspaces | NO access to this workspace credentials | Enforced by wsHash namespacing + Workspace target (BR-18) |

No new roles; no hardcoded credentials (SA4E-241 SEC-03 fail-closed preserved: empty Operator ID blocks auth paths).

### 7.2 Data Sensitivity Classification

| Data Type | Classification | Business Requirement |
|-----------|---------------|---------------------|
| Pega password, Jira API token/PAT | Restricted (secret) | OS-keychain SecretStorage only, namespaced keys; never in `settings.json`, logs, webview, IPC errors, diagnostics (BR-20) |
| Jira base URL + email, Pega endpoint + username | Confidential | Endpoint/username in Workspace `.vscode/settings.json` (folder-local); Atlassian URL/email additionally in SecretStorage per current design (kept, only namespaced) |
| wsHash, folder path (debug logs) | Internal | May be logged at debug to diagnose multi-root issues; never alongside secret values |

### 7.3 Audit Trail

| Event | Logged Fields | Retention | Business Reason |
|-------|--------------|-----------|-----------------|
| Pega/Atlassian save | workspace folder + wsHash + field names + success/failure (NO values) | Extension output channel session | Diagnose wrong-workspace saves without leaking secrets |
| Migration run | wsHash + copied field names + skipped/invalid fields + marker set (NO values) | Same | Prove idempotent copy; debug partial migration |
| Test connection | wsHash + endpoint host (not full URL query) + HTTP status / 401 flag (NO creds) | Same | Verify per-workspace auth without logging tokens |

---

## 8. Non-Functional Requirements

| Category | Business Requirement | Acceptance Criteria |
|----------|---------------------|---------------------|
| Performance | Settings load/save latency unchanged vs today | `getState` p95 < 300 ms locally (config read + ≤5 SecretStorage gets + hash < 1 ms); no added network calls on save/load |
| Performance | Migration never blocks the user | Lazy `ensureMigrated()` p95 < 500 ms per workspace (local reads/writes only); runs once per workspace; activation not gated on migration completion |
| Performance | Test responsiveness preserved | Pega test inherits current behavior (single GET); Atlassian test timeout 8 s (`AtlassianCredentialService.ts:107`); `AtlassianHttpClient` default 30 s + token bucket 100/60 s + ≤3 retries unchanged |
| Availability | Same reliability as today | No new external dependency; SecretStorage + Configuration APIs only; fallback path keeps single-file flows working read-only |
| Scalability | Reasonable workspace count | Namespaced keys scale to tens of workspaces per machine with no migration fan-out (per-workspace lazy, no global scan) |
| Security | Zero cross-workspace use; zero secret leakage | Verified by isolation matrix (§10): A-save/B-isolated on every read site; no secret in `settings.json`, logs, webview payloads, IPC errors (BR-20) |
| Reliability | Deterministic resolution | Same workspace + same entry point → same result on every call (BR-19 normalization + canonical `workspaceFolders[0]`); hash collision probability negligible (48-bit truncated SHA-256; same 12-hex precedent as projectId) |
| Reliability | No data loss on upgrade | Legacy kept until workspace copy confirmed; failed migration retry-safe, no marker (BR-15) |
| Maintainability | One Resolver, zero duplication | All current + future Pega/Atlassian read/write sites call the shared helper; `SECRET_KEYS` flat entries remain ONLY as legacy-source constants (or are superseded — TDD fixes) |
| Compatibility | IPC + state contracts unchanged | `state`, `models`, `pegaSaved`, `atlassianSaved`, `pegaTestResult`, `atlassianTestResult`, `pegaContextFetched`, `credentials` IPC shape unchanged; only values become workspace-scoped (BR-11) |
| Testability | Isolation matrix executable manually + automated | §10 cases cover A-vs-B, all read sites, migration, fallback, determinism |

<!-- TA enrichment -->
**Supplemental quantified targets (TA — measured against the code paths above):**

| # | Target | Budget | Rationale / measurement |
|---|--------|--------|-------------------------|
| NFR-T1 | `getWsHash()` compute cost | < 1 ms, zero I/O (folder lookup only) | Single SHA-256 over a short path; called on every read/write/test — must never appear in profiles |
| NFR-T2 | `getState` SecretStorage round-trips | ≤ 6 gets (pega + atlassian×3 + marker check where applicable; LLM keys unchanged) + 0 network | Keeps `getState` p95 < 300 ms (OS keychain latency dominates; no batching API exists) |
| NFR-T3 | `ensureMigrated()` worst case | ≤ 3 `config.inspect` + ≤ 8 secret gets + ≤ 7 writes, all local; p95 < 500 ms | Runs at most once per wsHash (marker-gated); MUST NOT run on the extension-activation critical path — first lazy trigger only |
| NFR-T4 | Extension activation | +0 ms attributable to this fix | No migration/eager hashing at activation; all work is lazy per §6.1 trigger list |
| NFR-T5 | Same-workspace concurrent windows | Converge (last-write-wins, UC-1 AF-4) | No lock needed: single scope, idempotent overwrites, state re-read after save |
| NFR-T6 | Keychain scale | Tens of workspaces per machine, no global scan | 5 keys + 1 marker per wsHash; migration is per-workspace lazy — no enumeration of other workspaces' keys ever |
| NFR-T7 | Pega test path timeout (to be added, OI-7) | 8000 ms abort, parity with Atlassian test path | Eliminates the current unbounded `fetch(endpoint)` hang in `handleTestPegaConnection()` |

---

## 9. Error Handling (User-Facing)

### 9.1 Error Scenarios

| Scenario | Severity | User Message | Expected Behavior |
|----------|----------|-------------|-------------------|
| Save Pega with no folder | Warning | No workspace folder open — Pega config requires a workspace to isolate credentials. | Nothing written; open a folder and retry |
| Save Atlassian with no folder | Warning | No workspace folder open — open a folder to configure per-workspace Atlassian credentials. | Nothing written |
| Invalid Jira URL at save | Warning | Invalid Jira Base URL format. (or) URL must use http or https protocol. | Nothing persisted; fix URL and retry (BR-9) |
| Invalid Pega endpoint at save | Warning | Invalid Pega Endpoint URL (http/https required). | Nothing persisted |
| SecretStorage failure on save | Critical | Failed to save {Pega/Atlassian} config: {message} (password/token may not be saved — retry). | Config may be partial; retry; migration not marked complete |
| Test Atlassian incomplete | Info | No credentials configured. (for this workspace) | Enter triple for this workspace and save |
| Test Atlassian 401 | Warning | Authentication failed (401). Check email/token. (for this workspace) | Fix current-workspace email/token; no cross-workspace fallback |
| Test Atlassian other/network | Warning | HTTP {status}: {statusText} / Connection failed: {message} | Retry; check server reachability |
| Test Pega failure | Warning | Connection failed: {message} / no response from server | Check endpoint reachability for this workspace |
| Fetch Pega Context no folder | Info | No workspace folder open to save Pega context. (existing guard preserved) | Open a folder and retry |
| Pega Operator missing at use | Warning | Pega Operator ID is not configured (kiroSdlc.pegaUsername). Set it before indexing. | Set username for this workspace |
| Pega schema creds missing | Warning | Pega Schema: credentials not configured (set pegaUsername + password in settings) | Set both for this workspace |
| Jira indexer creds missing | Warning | Jira Project Index: Atlassian credentials not configured (Settings → Atlassian Connection) | Configure triple for this workspace |
| IPC creds missing | Warning | Atlassian credentials not configured in extension. / Atlassian credentials not configured | Same recovery as above |
| Migration secret failure | Warning | Could not migrate stored credentials for this workspace ({message}). Legacy kept; will retry on next open. | Next open retries; workspace values unchanged until success |

### 9.2 Notification Requirements

| Event | Who is Notified | Channel | Timing |
|-------|----------------|---------|--------|
| Save success/failure | Developer in Settings | Inline `pegaSaved` / `atlassianSaved` message | Immediate |
| Test result | Developer in Settings | Inline `pegaTestResult` / `atlassianTestResult` | Immediate (Pega: network RTT; Atlassian: ≤8 s) |
| Migration warning | Developer (only if failure/partial) | Settings warning / output channel (no secrets) | On first open after upgrade if applicable |

---

## 10. Testing Considerations

### 10.1 Test Scenarios

| ID | Scenario | Input | Expected Output | Priority |
|----|----------|-------|-----------------|----------|
| TC-1 | Pega isolation A→B (UC-1) | Save Pega in A (endpointA/userA/passA); open B | B shows empty (or B values); `hasPegaPassword=false` in B; SecretStorage has `kiroSdlc.<hashA>.pegaPassword`, no flat write | High |
| TC-2 | Pega read-site consistency (UC-1+UC-7) | In A: `getCurrentState()`, `getAuthHeader()`, `getPegaEndpoint()`, `getConfiguredUsername()`, schema-indexer cred check | All return A's values; in B all return B's (or missing) | High |
| TC-3 | Pega blank-password preserve (BR-3) | Save in A with password blank | Endpoint/username updated; stored workspace password unchanged; `hasPegaPassword` stays true | High |
| TC-4 | Atlassian isolation A→B (UC-2) | Save triple+type in A; open B | B triple empty/null, type `cloud` default; `getConfig()` in A returns A triple, in B null (or B triple) | High |
| TC-5 | Atlassian IPC + hot-reload (UC-2+UC-7) | `handleCredentialRequest()` in A vs B; `AtlassianHttpClient.request()` after mid-session save | Each returns its workspace triple; hot-reload picks up new save without restart | High |
| TC-6 | Invalid URL rejected per workspace (BR-9) | Save `ftp://x` / `not-a-url` in A | `atlassianSaved success:false "Invalid Jira Base URL format."`; nothing persisted in A or B | Medium |
| TC-7 | Connection-type default/coerce (BR-8) | Save without type; corrupt stored type | Defaults `cloud`; non-`server` reads as `cloud` | Medium |
| TC-8 | getState isolation (UC-3) | Open Settings in A vs B | Each shows its own values; no prefill across workspaces; secrets never in payload (only flags) | High |
| TC-9 | Test uses current workspace (UC-4) | Distinct creds in A/B; Test in each | A authenticates as A operator/user, B as B; 401 in A never retries with B creds | High |
| TC-10 | Migration happy path (UC-5) | Legacy globals only; open A | A shows legacy values as its own; marker `kiroSdlc.<hashA>.migrated` set; legacy intact; all read sites work | High |
| TC-11 | Migration workspace-wins (BR-14) | A has own values + legacy present; open A | A values unchanged; no overwrite | High |
| TC-12 | Migration cleared-stays-cleared (BR-14) | Migrate A, clear A password, restart, reopen A | Stays cleared (`hasPegaPassword=false`); no resurrection | High |
| TC-13 | Migration per-workspace lazy (BR-13) | Migrate A; open fresh B (legacy still present) | B also gets legacy copied on first open (independent of A) | High |
| TC-14 | Migration retry-safe (BR-15) | Simulate secret-store failure mid-migration | No marker; legacy intact; next open retries; UI shows missing part | Medium |
| TC-15 | No-folder fallback (UC-6) | Empty window: view + save attempt | Read-only legacy (or empty + banner); save blocked with message; zero writes | High |
| TC-16 | Multi-root determinism (BR-17) | Multi-root window; repeated getState | Always resolves `workspaceFolders[0]`; same values every time | Medium |
| TC-17 | Same-workspace determinism (NFR) | Repeated reads via every entry point in same workspace | Identical results; wsHash stable across restarts for same path | Medium |
| TC-18 | Trailing-slash normalization (BR-4) | Save endpoint with `/`; read via `getPegaEndpoint()` / Atlassian buildRequest | Reads normalized; `/rest/api/2/myself` appended correctly | Low |
| TC-19 | No secret leakage (BR-20) | Save/test/migrate; inspect `settings.json`, logs, webview `state`, IPC errors | No password/token anywhere except SecretStorage + auth headers | High |
| TC-20 | Generic `updateConfig` guard (BR-18) | Audit callers of `updateConfig()` | No Pega/Atlassian workspace key flows through Global helper; LLM keys unaffected | Medium |

---

## 11. Appendix

### Diagrams

| Diagram | File |
|---------|------|
| System Context — per-workspace settings | [system-context.png](diagrams/system-context.png) ([source](diagrams/system-context.drawio)) |
| Sequence — Save Pega per-workspace | [sequence-save-pega.png](diagrams/sequence-save-pega.png) ([source](diagrams/sequence-save-pega.drawio)) |
| Sequence — Save Atlassian per-workspace | [sequence-save-atlassian.png](diagrams/sequence-save-atlassian.drawio) ([source](diagrams/sequence-save-atlassian.drawio)) |
| Sequence — Lazy per-workspace migration | [sequence-migration.png](diagrams/sequence-migration.png) ([source](diagrams/sequence-migration.drawio)) |
| State — Workspace config lifecycle | [state.png](diagrams/state.png) ([source](diagrams/state.drawio)) |

BRD diagrams (pre-existing, unchanged): `use-case.png` / `business-flow.png` in the same `diagrams/` folder belong to the BRD.

### Change Log from BRD

- BRD fixed the WHAT (five user stories, Global→Workspace direction, `kiroSdlc.<wsHash>.*` scheme, migration + fallback requirements). This FSD fixes the HOW: exact file:line inventory (including `IndexingService.ts:234` literal key, `updateConfig()` guard, `JiraProjectIndexer` + `PegaRuleSetResolverService` + `AtlassianHttpClient` read sites, `package.json` declarations, `settings.js` bindings), seven use cases UC-1..UC-7 with Main/Alternative/Exception flows, twenty business rules BR-1..BR-20, wsHash algorithm (`sha256("ws:"+normalized).hex.slice(0,12)`, 12-hex precedent from `PegaHttpClient.ts:941`), marker `kiroSdlc.<wsHash>.migrated`, copy-not-move + workspace-wins + cleared-stays-cleared migration semantics, no-folder read-only + blocked-save fallback, canonical `workspaceFolders[0]` multi-root rule, and quantified NFRs (getState p95 < 300 ms, migration p95 < 500 ms, Atlassian test 8 s timeout).
- No deviations from BRD scope. Open TDD decisions: Resolver module name/location, marker storage (SecretStorage vs workspace config flag), exact `ensureMigrated()` hook points, whether flat `SECRET_KEYS` entries are kept as legacy constants or removed, exact no-workspace banner wording (BRD/FSD default messages are normative unless TDD justifies a change).

<!-- TA enrichment -->
### Open Issues (TA — unresolved technical decisions requiring disposition in TDD or by PO)

| ID | Decision | TA recommendation | Owner | Target |
|----|----------|-------------------|-------|--------|
| OI-1 | Resolver module name + location | `extension/src/services/WorkspaceScopeResolver.ts`, pure functions (`getWorkspaceFolder`, `normalizePath`, `getWsHash`, `secretKey`, `migrationMarkerKey`, `ensureMigrated`) + unit tests beside `__tests__/` | SA (TDD) | TDD phase |
| OI-2 | Migration marker storage | SecretStorage `kiroSdlc.<wsHash>.migrated="1"` (FSD default — survives `settings.json` delete, co-located with the secrets it guards) | SA (TDD) | TDD phase |
| OI-3 | Exact `ensureMigrated()` hook points | All four triggers (`getCurrentState`, `updatePegaConfig`, `getConfig`, `saveConfig`) call it first; PegaHttpClient/IndexingService/AtlassianHttpClient/JiraProjectIndexer inherit via these (no direct calls) | SA (TDD) | TDD phase |
| OI-4 | Flat `SECRET_KEYS` disposition | Keep as `LEGACY_*` read-only constants for migration (§6.3.2); add lint/guard forbidding new writes through them (BR-18) | SA (TDD) | TDD phase |
| OI-5 | No-workspace banner wording + test-button behavior | Wording per §3.8.3 table; Test runs against labeled shared fallback (UC-4 AF-4), Save blocked — PO to approve final strings | PO + SA | TDD phase |
| OI-6 | Legacy global retention/cleanup policy | NEVER auto-delete legacy globals/flat secrets (they are the re-migration source for every new workspace + the UC-6 fallback); document "leave intact indefinitely" | PO | Before release |
| OI-7 | Pega test has NO timeout (`fetch(endpoint)` unbounded, `SettingsMessageHandler.ts:268`) | Add 8000 ms `AbortController` parity with Atlassian test path (NFR-T7); failure message unchanged | SA (TDD) | TDD phase |
| OI-8 | No Clear path for workspace Pega/Atlassian secrets (blank Pega password = preserve BR-3; no `clearApiKey` equivalent) | Add explicit Clear buttons → `clearPegaPassword`/`clearAtlassianConfig` IPC deleting namespaced secrets + unsetting Workspace config (marker stays → cleared-stays-cleared holds); else document "no clear" as accepted limitation | PO + SA | TDD phase |
| OI-9 | Atlassian empty-string `email`/`apiToken` save semantics | Reject empty at save with message (fail-closed) rather than store-empty-then-`getConfig()`-null; decide before DEV | SA (TDD) | TDD phase |
| OI-10 | `pegaDeveloperShortName` cross-workspace leak via Global manual value (no write path in code, §4 TA-4) | Default: document as out-of-scope (no code change); alternative: add Workspace-targeted write in Settings — PO decides | PO | TDD phase |
| OI-11 | Settings Sync + git: Workspace `.vscode/settings.json` is usually committed → endpoint/username committed to repo | Accept + release-note warning (secrets stay in OS keychain, never in the file — BR-20 holds); confirm with Tech Lead | Tech Lead | Before release |
| OI-12 | `savePegaConfig` does not auto-refresh `state` (webview re-requests `getState` itself; §3.8.1 TA Note) | Handler calls `sendCurrentState()` after both save posts (single source of truth, kills cross-workspace-switch race) | SA (TDD) | TDD phase |
