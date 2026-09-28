# Software Test Cases (STC)

## SDLC Agents 4 Enterprise — SA4E-323: Per-workspace isolation for Pega/Atlassian connection settings

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-323 |
| Title | Pega/Atlassian connection settings luu global, leak giua cac workspace — can luu rieng per-workspace |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-09-24 |
| Status | Draft |
| Related STP | STP-v1-SA4E-323.docx (documents/SA4E-323/STP.md v1.0) |
| Related FSD | FSD-v1-SA4E-323.docx (documents/SA4E-323/FSD.md v1.1) |
| Related TDD | TDD-v1-SA4E-323.docx (documents/SA4E-323/TDD.md v1.0) |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-24 | QA Agent | Initiate — 60 cases across 6 levels from FSD UC-1..UC-7, BR-1..BR-20, TDD components |

---

## Test Case Summary

| Level | Prefix | Count | Automated | Priority |
|-------|--------|-------|-----------|----------|
| Property-Based | PBT-01..PBT-06 | 6 | 6 (fast-check) | High |
| Unit | UT-01..UT-14 | 14 | 14 (vitest) | High |
| Integration | IT-01..IT-16 | 16 | 16 (vitest + stubs) | High |
| E2E-API (IPC + outbound REST) | E2E-API-01..E2E-API-08 | 8 | 8 (vitest + mocked fetch) | High |
| E2E-UI (Settings webview) | E2E-UI-01..E2E-UI-08 | 8 | 8 (extension test host) | Medium |
| SIT (manual) | SIT-01..SIT-08 | 8 | 0 | High |
| **Total** | | **60** | **52 (86.7%)** | |

**TC-range mapping (template compatibility):** PBT+UT (≈TC-001..099 happy path + TC-300..399 BR validation) • IT (≈TC-100..199 alternative + TC-700..799 integration) • E2E-API/E2E-UI (≈TC-500..599 UI + TC-800..899 regression) • Exception flows TC-200..299 spread across UT/IT/E2E-API • Boundary/negative TC-400..499 across UT/IT • NFR TC-600..699 across PBT/IT/SIT. Exact mapping per case is listed in each case's **Requirement** field.

**Shared fixtures (all automated levels):** `vi.mock("vscode")` with per-workspace `workspaceFolders:[{uri:{fsPath}}]`, in-memory `SecretStorage` stub (`get/store/delete` over a `Map`), `getConfiguration("kiroSdlc")` stub supporting merged `get()`, `inspect().globalValue`, and `update(k,v,Workspace|Global)` to separate stores — same mock style as `extension/src/__tests__/pega-ruleset-resolver.test.ts:6-22`. Workspace A = `C:\sdlc-test\ws-a`, Workspace B = `C:\sdlc-test\ws-b` (hashes computed at runtime via `getWsHash()`, never hardcoded). Concrete secret/config values come from `documents/SA4E-323/testdata/*.csv`.

---

## 1. Property-Based Tests (PBT — fast-check, automated)

**File:** `extension/src/__tests__/workspace-scope-resolver.pbt.test.ts`

### PBT-01: Same folder always maps to same wsHash and secret keys (determinism)

| Field | Value |
|-------|-------|
| **ID** | PBT-01 |
| **Priority** | High |
| **Type** | Property-Based (fast-check, ≥100 runs) |
| **Requirement** | BR-19, BRD US-1 AC-5, FSD TC-17 |
| **Preconditions** | `normalizePath` + `getWsHash` + `secretKey` implemented per TDD §4.2 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Generate arbitrary folder paths (win/unix/mixed separators, trailing slashes, drive-case variants); compute `normalizePath(p)` twice | Identical output both times (pure function) |
| 2 | Compute `getWsHash()` twice for the same stub folder | Identical 12-hex string; matches `^[0-9a-f]{12}$` |
| 3 | Compute `secretKey(b)` for all 4 bases across repeated calls | Identical `kiroSdlc.<wsHash>.<suffix>` each time |

**Test Data:** `testdata/pega-isolation-testdata.csv` rows PBT-01 (arbitrary paths incl. `C:\sdlc-test\ws-a`, `c:/sdlc-test/ws-a/`, `/home/dev/proj`, `vscode-remote://ssh+host/home/dev/proj`)
**Postconditions:** No state changed; property holds for all generated inputs.

---

### PBT-02: Distinct folders map to distinct wsHash values (collision resistance)

| Field | Value |
|-------|-------|
| **ID** | PBT-02 |
| **Priority** | High |
| **Type** | Property-Based (fast-check, ≥100 runs) |
| **Requirement** | BR-19, BRD Risk (collision), FSD TC-17 |
| **Preconditions** | Same as PBT-01 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Generate pairs of distinct normalized paths (differ by ≥1 char after normalization) | `getWsHash(A) !== getWsHash(B)` for every pair |
| 2 | Assert `secretKey("pega", hashA) !== secretKey("pega", hashB)` | Keys differ; no cross-workspace aliasing possible |

**Test Data:** `testdata/pega-isolation-testdata.csv` rows PBT-02 (pairs: `ws-a` vs `ws-b`, `C:\PROJ` vs `c:\proj` AFTER normalization are EQUAL — excluded from this property, covered by UT-01)
**Postconditions:** 48-bit truncated SHA-256 shows zero collisions across runs (same 12-hex precedent as `projectId`).

---

### PBT-03: Secret key format is namespaced for every base (no flat keys)

| Field | Value |
|-------|-------|
| **ID** | PBT-03 |
| **Priority** | High |
| **Type** | Property-Based (fast-check) |
| **Requirement** | BR-2, BR-6, BR-18, TDD §4.1 |
| **Preconditions** | `SECRET_SUFFIX` mapping per TDD §4.2 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | For arbitrary wsHash (12-hex) × every `SecretBase` (`pega`, `atlassianBaseUrl`, `atlassianEmail`, `atlassianToken`) assert format | `kiroSdlc.<wsHash>.<suffix>` with suffix ∈ {`pegaPassword`, `atlassian.baseUrl`, `atlassian.email`, `atlassian.apiToken`}; NEVER equals any legacy flat key (`kiroSdlc.pegaPassword`, `kiroSdlc.atlassian.*`) |
| 2 | Assert `migrationMarkerKey(h)` = `kiroSdlc.<h>.migrated` | Marker namespaced per workspace, never global |

**Test Data:** `testdata/pega-isolation-testdata.csv` + `testdata/atlassian-isolation-testdata.csv` rows PBT-03
**Postconditions:** No flat-key write possible through `secretKey()`.

---

### PBT-04: Migration is idempotent (run twice changes nothing)

| Field | Value |
|-------|-------|
| **ID** | PBT-04 |
| **Priority** | High |
| **Type** | Property-Based (fast-check, stateful) |
| **Requirement** | BR-13, BRD US-3 AC-2, FSD TC-11 |
| **Preconditions** | `ensureMigrated()` per FSD §6.3.2; arbitrary legacy + workspace states |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Generate arbitrary (legacy config/secrets × workspace config/secrets) states; run `ensureMigrated()` | Marker `kiroSdlc.<wsHash>.migrated="1"` set iff no failure |
| 2 | Snapshot workspace scope; run `ensureMigrated()` again | Workspace scope byte-identical; no additional writes issued (marker short-circuit, UC-5 AF-1) |

**Test Data:** `testdata/migration-testdata.csv` rows PBT-04 (state generator seeds: empty/partial/full × valid/invalid legacy)
**Postconditions:** Second run is a pure no-op.

---

### PBT-05: Workspace-wins holds per FIELD (never overwritten by legacy)

| Field | Value |
|-------|-------|
| **ID** | PBT-05 |
| **Priority** | High |
| **Type** | Property-Based (fast-check, stateful) |
| **Requirement** | BR-14, FSD UC-5 AF-5, TDD §4.3 step 5 |
| **Preconditions** | Same as PBT-04 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | For arbitrary per-field pairs (workspace value W, legacy value L, W non-empty): run `ensureMigrated()` | Field keeps W for every field independently (endpoint, username, type, each secret) — partial population merges field-by-field, non-empty fields untouched |
| 2 | After migration, clear one workspace field (delete secret / unset config), run `ensureMigrated()` again | Cleared field STAYS cleared (no resurrection — marker blocks re-copy, FSD TC-12) |

**Test Data:** `testdata/migration-testdata.csv` rows PBT-05
**Postconditions:** Workspace values never regress to legacy; cleared stays cleared.

---

### PBT-06: Trailing-slash normalization is transparent (endpoint + `/+` ≡ endpoint)

| Field | Value |
|-------|-------|
| **ID** | PBT-06 |
| **Priority** | Medium |
| **Type** | Property-Based (fast-check) |
| **Requirement** | BR-4, FSD TC-18 |
| **Preconditions** | `getPegaEndpoint()` strips trailing `/`; Atlassian `buildRequest`/`performMyselfRequest` strip `/+` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Generate arbitrary `https://host[:port][/path]` endpoints × 0..3 trailing slashes | `getPegaEndpoint()` returns identical slash-free value for all variants |
| 2 | Generate arbitrary baseUrls × trailing slashes; build myself URL | Identical `{base}/rest/api/2/myself` for all variants |

**Test Data:** `testdata/fallback-nfr-testdata.csv` rows PBT-06 (`https://pega-a.corp.local:8443/prweb`, `+/, //, ///` variants)
**Postconditions:** Stored values unchanged; only read/use normalized.

---
## 2. Unit Tests (UT — vitest, automated)

**Files:** `extension/src/__tests__/workspace-scope-resolver.test.ts` (UT-01..UT-04, UT-12), `extension/src/__tests__/provider-config-workspace.test.ts` (UT-05..UT-07, UT-14), `extension/src/__tests__/atlassian-workspace.test.ts` (UT-08..UT-11), plus `PegaHttpClient` unit coverage (UT-12..UT-13)

### UT-01: normalizePath matrix (win/unix/trailing-slash/drive-case/remote)

| Field | Value |
|-------|-------|
| **ID** | UT-01 |
| **Priority** | High |
| **Type** | Functional — Boundary |
| **Requirement** | BR-19, FSD §6.3.1 |
| **Preconditions** | Resolver module importable; no vscode dependency in `normalizePath` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `normalizePath("C:\\sdlc-test\\ws-a")` | `"c:/sdlc-test/ws-a"` (separators unified, drive lowercased) |
| 2 | `normalizePath("c:/sdlc-test/ws-a/")` and `normalizePath("c:/sdlc-test/ws-a///")` | Both `"c:/sdlc-test/ws-a"` (trailing slashes stripped) |
| 3 | `normalizePath("/")` | `"/"` (root kept) |
| 4 | `normalizePath("vscode-remote://ssh+myhost/home/dev/proj/")` | Scheme+authority preserved, trailing slash stripped |
| 5 | Assert `normalizePath("C:\\sdlc-test\\ws-a") === normalizePath("c:/sdlc-test/ws-a/")` | Equal → same wsHash (PBT-01 consistency) |

**Test Data:** `testdata/pega-isolation-testdata.csv` rows UT-01
**Postconditions:** Pure function; no state changed.

---

### UT-02: getWsHash returns null when no workspace folder is open

| Field | Value |
|-------|-------|
| **ID** | UT-02 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | UC-6 EF-1, BR-16, FSD TC-15 |
| **Preconditions** | `workspaceFolders` mocked as `[]`, then `undefined`; resolver throws simulated once |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Mock `workspaceFolders = []`; call `getWsHash()` | `null` |
| 2 | Mock `workspaceFolders = undefined`; call `getWsHash()` | `null` |
| 3 | Mock `workspaceFolders = [{uri:{fsPath:"C:\\sdlc-test\\ws-a"}}]` but `createHash` throws; call `getWsHash()` | `null` (fail closed → UC-6 fallback) |

**Test Data:** `testdata/fallback-nfr-testdata.csv` rows UT-02
**Postconditions:** Null scope triggers read-only fallback + blocked saves downstream (IT-13).

---

### UT-03: getWsHash deterministic 12-hex for a fixed folder

| Field | Value |
|-------|-------|
| **ID** | UT-03 |
| **Priority** | High |
| **Type** | Business Rule (BR-19 validation) |
| **Requirement** | BR-19, TDD §4.2, FSD TC-17 |
| **Preconditions** | Folder `C:\sdlc-test\ws-a` mocked |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `getWsHash()` 3 times | Identical value each time; matches `^[0-9a-f]{12}$` |
| 2 | Independently compute `sha256("ws:c:/sdlc-test/ws-a").hex.slice(0,12)` | Equal to `getWsHash()` (algorithm verbatim per TDD) |

**Test Data:** `testdata/pega-isolation-testdata.csv` rows UT-03
**Postconditions:** Hash stable across restarts for the same path.

---

### UT-04: secretKey null without scope; marker key format

| Field | Value |
|-------|-------|
| **ID** | UT-04 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | BR-13, BR-16, UC-6 |
| **Preconditions** | No folder mocked (null scope), then folder A mocked |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | With null scope: `secretKey("pega")`, `secretKey("atlassianToken")` | Both `null` (callers must take fallback path, never flat keys) |
| 2 | With folder A: `migrationMarkerKey(hashA)` | `"kiroSdlc.<hashA>.migrated"` |

**Test Data:** `testdata/fallback-nfr-testdata.csv` rows UT-04
**Postconditions:** No key generated without a workspace.

---

### UT-05: updateConfig guard rejects workspace-scoped Pega/Atlassian keys

| Field | Value |
|-------|-------|
| **ID** | UT-05 |
| **Priority** | High |
| **Type** | Business Rule (BR-18 validation) |
| **Requirement** | BR-18, TDD §5.2 (`updateConfig` guard), FSD TC-20 |
| **Preconditions** | `ProviderConfigService` with stub config/secrets |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `updateConfig("pegaEndpoint", "https://x/prweb")` | Throws `Use workspace-scoped method for pegaEndpoint (SA4E-323).` |
| 2 | `updateConfig("pegaUsername", "op")` and `updateConfig("atlassianConnectionType", "cloud")` | Both throw the same guard error |
| 3 | `updateConfig("llmModel", "x")`, `setProvider/setOllamaUrl/setBaseUrl` equivalents | Pass through to Global store unaffected (LLM keys out of scope) |

**Test Data:** `testdata/pega-isolation-testdata.csv` rows UT-05
**Postconditions:** No workspace key can flow through the generic Global helper.

---

### UT-06: updatePegaConfig with blank password preserves stored workspace password (BR-3)

| Field | Value |
|-------|-------|
| **ID** | UT-06 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow (UC-1 AF-1) |
| **Requirement** | UC-1 AF-1, BR-3, FSD TC-3 |
| **Preconditions** | Workspace A has stored password `PassA-123!` (namespaced key); marker set (migration skipped) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `updatePegaConfig("https://pega-a2.corp/prweb", "op.a2", "")` | Endpoint/username updated (Workspace target); `secrets.store` NOT called for password |
| 2 | Read namespaced `kiroSdlc.<hashA>.pegaPassword` | Still `PassA-123!`; `hasPegaPassword` stays true |
| 3 | Repeat with password `"   "` (whitespace) and `undefined` | Same: preserved |

**Test Data:** `testdata/pega-isolation-testdata.csv` rows UT-06
**Postconditions:** Endpoint/username changed; password unchanged.

---

### UT-07: updatePegaConfig rejects non-http(s) endpoint, persists nothing

| Field | Value |
|-------|-------|
| **ID** | UT-07 |
| **Priority** | High |
| **Type** | Functional — Exception Flow (UC-1 EF-3) |
| **Requirement** | BR-4, FSD TC-6 (Pega side) |
| **Preconditions** | Workspace A clean (no values, marker set) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `updatePegaConfig("ftp://evil/x", "op.a", "PassA-123!")` | Throws `Invalid Pega Endpoint URL (http/https required).` |
| 2 | Inspect Workspace config + namespaced secret | Nothing written (no endpoint, no username, no secret) |
| 3 | Repeat with `"not-a-url"` and `""` | Same rejection, same zero-write |

**Test Data:** `testdata/pega-isolation-testdata.csv` rows UT-07
**Postconditions:** Workspace A still empty.

---
### UT-08: validateUrl rejects non-http(s) Jira URL (verbatim errors)

| Field | Value |
|-------|-------|
| **ID** | UT-08 |
| **Priority** | High |
| **Type** | Business Rule (BR-9 validation) |
| **Requirement** | BR-9, UC-2 EF-1, FSD TC-6 |
| **Preconditions** | `AtlassianCredentialService` with stubs |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `saveConfig({baseUrl:"ftp://x", email:"a@corp.local", apiToken:"t"})` | Throws `Invalid Jira Base URL format.`; nothing persisted |
| 2 | `saveConfig({baseUrl:"not-a-url", ...})` | Same error, nothing persisted |
| 3 | `saveConfig({baseUrl:"https://a.atlassian.net", ...})` | Passes validation (stores namespaced triple) |

**Test Data:** `testdata/atlassian-isolation-testdata.csv` rows UT-08
**Postconditions:** Invalid URLs never reach SecretStorage.

---

### UT-09: getConfig returns null unless full triple present for the workspace

| Field | Value |
|-------|-------|
| **ID** | UT-09 |
| **Priority** | High |
| **Type** | Business Rule (BR-7 validation) |
| **Requirement** | BR-7, UC-2 EF-3, FSD TC-5/TC-9 |
| **Preconditions** | Workspace A stub secrets; marker set |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Store only baseUrl+email (no token); `getConfig()` | `null` |
| 2 | Store only token; `getConfig()` | `null` |
| 3 | Store all three namespaced values; `getConfig()` | `{baseUrl, email, apiToken}` triple for workspace A |
| 4 | Same triple stored under hashA, read under hashB | `null` (B has nothing) |

**Test Data:** `testdata/atlassian-isolation-testdata.csv` rows UT-09
**Postconditions:** Incomplete workspace never yields partial credentials.

---

### UT-10: readConnectionType defaults cloud, coerces non-server to cloud

| Field | Value |
|-------|-------|
| **ID** | UT-10 |
| **Priority** | Medium |
| **Type** | Business Rule (BR-8 validation) |
| **Requirement** | BR-8, UC-2 AF-2, FSD TC-7 |
| **Preconditions** | Stub config with controllable stored type |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | No stored type; `readConnectionType()` | `"cloud"` |
| 2 | Stored `"server"`; `readConnectionType()` | `"server"` |
| 3 | Stored `"banana"` / `""` / `"CLOUD"`; `readConnectionType()` | `"cloud"` (any non-`server` coerced) |

**Test Data:** `testdata/atlassian-isolation-testdata.csv` rows UT-10
**Postconditions:** Type always ∈ {`cloud`, `server`}.

---

### UT-11: saveConfig rejects empty email/token (fail-closed, OI-9)

| Field | Value |
|-------|-------|
| **ID** | UT-11 |
| **Priority** | High |
| **Type** | Functional — Boundary/Negative |
| **Requirement** | TDD OI-9, BR-7, UC-2 |
| **Preconditions** | Workspace A clean, marker set |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `saveConfig({baseUrl:"https://a.atlassian.net", email:"", apiToken:"t"})` | Throws `Atlassian email/API token must not be empty.`; nothing persisted |
| 2 | Same with `apiToken:"   "` | Same rejection |
| 3 | Same with both non-empty | Stores triple + type `cloud` default |

**Test Data:** `testdata/atlassian-isolation-testdata.csv` rows UT-11
**Postconditions:** No empty-string secrets stored (replaces store-empty-then-null confusion).

---

### UT-12: getPegaEndpoint strips trailing slash (read normalization)

| Field | Value |
|-------|-------|
| **ID** | UT-12 |
| **Priority** | Medium |
| **Type** | Business Rule (BR-4 validation) |
| **Requirement** | BR-4, FSD TC-18, `PegaHttpClient.ts:49` |
| **Preconditions** | Merged `config.get("pegaEndpoint")` stubbed |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Stored `"https://pega-a.corp.local:8443/prweb/"`; `getPegaEndpoint()` | `"https://pega-a.corp.local:8443/prweb"` |
| 2 | Stored without slash | Unchanged |
| 3 | Stored `""`; `getPegaEndpoint()` | Compiled default `http://localhost:8080/prweb` (UC-4 AF-3) |

**Test Data:** `testdata/pega-isolation-testdata.csv` rows UT-12
**Postconditions:** Stored value unchanged; read normalized.

---

### UT-13: 401 at use time never retries another workspace (BR-12 unit)

| Field | Value |
|-------|-------|
| **ID** | UT-13 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | BR-12, UC-7 EF-1, FSD TC-9 |
| **Preconditions** | `interpretResponse`/myself-request unit with mocked fetch returning 401 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `testConnection()` with workspace-A triple; fetch returns 401 | `{success:false, message:"Authentication failed (401). Check email/token."}`; fetch called exactly once |
| 2 | Assert no second fetch with different credentials | Zero cross-workspace retry (spy on fetch calls: 1 call, A headers only) |

**Test Data:** `testdata/atlassian-isolation-testdata.csv` rows UT-13
**Postconditions:** Single-shot; failure surfaces immediately.

---

### UT-14: getConfiguredUsername empty fails closed with exact message (SEC-03)

| Field | Value |
|-------|-------|
| **ID** | UT-14 |
| **Priority** | High |
| **Type** | Security |
| **Requirement** | BRD NFR Security (SA4E-241 SEC-03 preserved), UC-7 AF-1 |
| **Preconditions** | Workspace username `""` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `getConfiguredUsername()` / auth-dependent path with empty username | Throws/returns `Pega Operator ID is not configured (kiroSdlc.pegaUsername). Set it before indexing.` — no default operator, no fallback to another workspace |

**Test Data:** `testdata/pega-isolation-testdata.csv` rows UT-14
**Postconditions:** Fail-closed; no silent anonymous auth.

---
## 3. Integration Tests (IT — vitest + stubs, automated)

**Files:** `provider-config-workspace.test.ts` (IT-01..IT-02, IT-06..IT-07...), `atlassian-workspace.test.ts` (IT-03..IT-05), `workspace-scope-resolver.test.ts` (IT-07..IT-14). Each IT case switches the mocked `workspaceFolders` between A and B within one test to prove isolation.

### IT-01: Pega save in A → B shows empty, hasPegaPassword false, no flat write

| Field | Value |
|-------|-------|
| **ID** | IT-01 |
| **Priority** | High |
| **Type** | Functional — Happy Path (isolation A→B) |
| **Requirement** | UC-1 Main Flow, BR-1, BR-2, BRD US-1 AC-1/AC-4, FSD TC-1 |
| **Preconditions** | Clean stubs (no legacy, no marker); folders A/B switchable |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Folder=A: `updatePegaConfig("https://pega-a.corp.local:8443/prweb", "op.a", "PassA-123!")` | Success; Workspace store A has endpoint/username; `kiroSdlc.<hashA>.pegaPassword` = `PassA-123!` |
| 2 | Assert flat key `kiroSdlc.pegaPassword` absent and Global config untouched | No legacy-format writes for new saves |
| 3 | Folder=B: `getCurrentState()` | `pegaEndpoint=""` (or B default), `pegaUsername=""`, `hasPegaPassword=false` — zero A values |
| 4 | Folder=A: `getCurrentState()` | A's endpoint/username, `hasPegaPassword=true` |

**Test Data:** `testdata/pega-isolation-testdata.csv` rows IT-01
**Postconditions:** A isolated under hashA; B empty.

---

### IT-02: Pega read-site consistency — every entry point returns same-workspace values

| Field | Value |
|-------|-------|
| **ID** | IT-02 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | UC-1 Req 3, UC-7 Main Flow, BR-18, BRD US-1 AC-2/AC-5, FSD TC-2 |
| **Preconditions** | A and B each saved with distinct values (IT-01 setup for both) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Folder=A: `getCurrentState()` + `PegaHttpClient.getAuthHeader()` + `getPegaEndpoint()` + `getConfiguredUsername()` + `runSchemaIndexer` credential check | All return A's endpoint/username; auth header = `Basic base64("op.a:PassA-123!")` |
| 2 | Folder=B: same five entry points | All return B's values (or missing-message for B if B unsaved); NEVER A's |
| 3 | Decode both auth headers | Each matches its own workspace pair; cross-mix absent |

**Test Data:** `testdata/pega-isolation-testdata.csv` rows IT-02
**Postconditions:** Same workspace + same entry point → same result (determinism).

---

### IT-03: Atlassian save in A → B triple null, type cloud default, no flat writes

| Field | Value |
|-------|-------|
| **ID** | IT-03 |
| **Priority** | High |
| **Type** | Functional — Happy Path (isolation A→B) |
| **Requirement** | UC-2 Main Flow, BR-5, BR-6, BR-8, BRD US-2 AC-1, FSD TC-4 |
| **Preconditions** | Clean stubs; folders switchable |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Folder=A: `saveConfig({baseUrl:"https://a.atlassian.net", email:"a@corp.local", apiToken:"tokenA-xxx", connectionType:"cloud"})` | 3 namespaced secrets under hashA + Workspace `atlassianConnectionType=cloud`; flat `kiroSdlc.atlassian.*` absent |
| 2 | Folder=B: `getConfig()` + `readConnectionType()` | `getConfig()` → `null`; type → `"cloud"` (B default, not A's value) |
| 3 | Folder=A: `getConfig()` | A's triple exactly |
| 4 | Folder=B: save `server` triple; Folder=A: `getConfig()` + type | A still A's triple + `cloud` (B save did not touch A) |

**Test Data:** `testdata/atlassian-isolation-testdata.csv` rows IT-03
**Postconditions:** Bidirectional isolation proven (A→B and B→A).

---

### IT-04: handleCredentialRequest returns per-workspace triple (IPC child-server path)

| Field | Value |
|-------|-------|
| **ID** | IT-04 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | UC-2 Req 3, UC-7 Main Flow, BR-18, FSD TC-5 |
| **Preconditions** | A/B triples saved (IT-03 setup) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Folder=A: `handleCredentialRequest({requestId:"r1"})` | `{type:"credentials", requestId:"r1", timestamp:<now>, credentials:{email:"a@corp.local", apiToken:"tokenA-xxx", baseUrl:"https://a.atlassian.net"}}` — shape EXACT per FSD §3.8.3 |
| 2 | Folder=B: same call | B's triple (or throws `Atlassian credentials not configured in extension.` if B empty — verbatim, no values) |
| 3 | Corrupt B (delete token); Folder=B call | Throws verbatim missing message; no fallback to A |

**Test Data:** `testdata/atlassian-isolation-testdata.csv` rows IT-04
**Postconditions:** Child server receives current-workspace creds only.

---

### IT-05: AtlassianHttpClient hot-reload picks up mid-session save without restart

| Field | Value |
|-------|-------|
| **ID** | IT-05 |
| **Priority** | Medium |
| **Type** | Integration — Alternative Flow (UC-7 AF-2) |
| **Requirement** | UC-7 AF-2, FSD TC-5 |
| **Preconditions** | `AtlassianHttpClient.buildRequest` re-calls `getConfig()` per request; mocked fetch 200 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Folder=A with token v1: `request("GET","/rest/api/2/myself")` | Auth header uses token v1 |
| 2 | Folder=A: `saveConfig()` with token v2 (same call chain as Settings save) | Stored under hashA |
| 3 | Same `request()` again (no re-construct, no restart) | Auth header uses token v2 |

**Test Data:** `testdata/atlassian-isolation-testdata.csv` rows IT-05
**Postconditions:** No caching staleness; no restart required.

---

### IT-06: getState isolation — A vs B payloads differ, secrets never in payload

| Field | Value |
|-------|-------|
| **ID** | IT-06 |
| **Priority** | High |
| **Type** | Functional + Security (UC-3) |
| **Requirement** | UC-3 Main Flow, BR-10, BR-11, BR-20, FSD TC-8 |
| **Preconditions** | A fully configured (Pega+Atlassian); B empty |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Folder=A: `getCurrentState()` serialized to JSON | Contains `pegaEndpoint`(A), `pegaUsername`(A), `hasPegaPassword:true`, `atlassianBaseUrl`(A), `atlassianEmail`(A), `hasAtlassianToken:true`, `atlassianConnectionType:"cloud"`; string search for `PassA-123!` and `tokenA-xxx` → zero hits |
| 2 | Folder=B: `getCurrentState()` | Empty/defaults + `hasPegaPassword:false`, `hasAtlassianToken:false`; no A strings anywhere |
| 3 | Assert payload key set equals FSD §3.8.2 frozen `state` shape | No extra keys, no missing keys |

**Test Data:** `testdata/pega-isolation-testdata.csv` + `testdata/atlassian-isolation-testdata.csv` rows IT-06
**Postconditions:** Presence flags only cross the webview boundary.

---

### IT-07: Migration happy path — legacy globals become workspace A's own values

| Field | Value |
|-------|-------|
| **ID** | IT-07 |
| **Priority** | High |
| **Type** | Functional — Happy Path (UC-5) |
| **Requirement** | UC-5 Main Flow, BR-13, BR-15, BRD US-3 AC-1, FSD TC-10 |
| **Preconditions** | Legacy seeded: Global `pegaEndpoint=http://localhost:8080/prweb`, `pegaUsername=legacy.op`, `atlassianConnectionType=server`, flat secrets (`kiroSdlc.pegaPassword=LegacyPass!`, 3 Atlassian flats); workspace A empty; no marker |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Folder=A: `getCurrentState()` (first access triggers `ensureMigrated`) | Returns legacy values as A's own; marker `kiroSdlc.<hashA>.migrated="1"` set |
| 2 | Assert targets | Workspace config A holds endpoint/username/type; namespaced secrets hold legacy secret copies |
| 3 | Assert legacy intact | Global values + flat secrets unchanged (copy-not-move) |
| 4 | All read sites under A (`getAuthHeader`, `getConfig`, schema-indexer check) | Work without re-entering credentials |

**Test Data:** `testdata/migration-testdata.csv` rows IT-07
**Postconditions:** A migrated; legacy preserved for B's later migration.

---

### IT-08: Migration workspace-wins — pre-existing A values never overwritten

| Field | Value |
|-------|-------|
| **ID** | IT-08 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow (UC-5 AF-3) |
| **Requirement** | BR-14, BRD US-3 AC-2, FSD TC-11 |
| **Preconditions** | Legacy seeded (IT-07 values); workspace A has own endpoint `https://pega-a.corp.local:8443/prweb` + own password; no marker |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Folder=A: trigger `ensureMigrated()` via `getCurrentState()` | A's endpoint/password unchanged; legacy NOT copied over |
| 2 | Partial variant: A has endpoint only (no password), legacy has password | Endpoint kept; password copied (field-level merge, UC-5 AF-5); other fields per-field |
| 3 | Marker | Set (migration considered complete — nothing to do is still success, UC-5 AF-2/AF-3) |

**Test Data:** `testdata/migration-testdata.csv` rows IT-08
**Postconditions:** Workspace values intact; marker set.

---
### IT-09: Migration cleared-stays-cleared — intentional clear never resurrected

| Field | Value |
|-------|-------|
| **ID** | IT-09 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Requirement** | BR-14, BRD US-3 AC-3, FSD TC-12 |
| **Preconditions** | Workspace A migrated (marker set, IT-07 state) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Folder=A: `clearPegaPassword()` + `clearConfig()` (TDD OI-8 new methods) | Namespaced secrets deleted; marker `kiroSdlc.<hashA>.migrated` STILL present |
| 2 | Re-trigger `ensureMigrated()` (simulated restart + `getCurrentState()`) | `hasPegaPassword=false`, `getConfig()` null — cleared values NOT resurrected from legacy |
| 3 | Unset Workspace `pegaEndpoint`; re-trigger | Endpoint stays empty (marker blocks re-copy) |

**Test Data:** `testdata/migration-testdata.csv` rows IT-09
**Postconditions:** User-cleared state is stable across restarts.

---

### IT-10: Migration per-workspace lazy — B migrates independently after A

| Field | Value |
|-------|-------|
| **ID** | IT-10 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Requirement** | BR-13, BRD US-3 Req 3, FSD TC-13 |
| **Preconditions** | Legacy seeded; A migrated (marker hashA); B fresh (no values, no marker hashB) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Folder=B: `getCurrentState()` (first open of B) | B shows legacy values as B's own copies under hashB; marker hashB set |
| 2 | Folder=A: `getCurrentState()` | A unchanged (B's migration did not touch A) |
| 3 | Assert legacy still intact | Both workspaces copied from the same retained legacy source |

**Test Data:** `testdata/migration-testdata.csv` rows IT-10
**Postconditions:** Each workspace migrates on its own first open.

---

### IT-11: Migration retry-safe — secret failure sets no marker, next open retries

| Field | Value |
|-------|-------|
| **ID** | IT-11 |
| **Priority** | Medium |
| **Type** | Functional — Exception Flow (UC-5 EF-1/EF-2) |
| **Requirement** | BR-15, BRD US-3 AC-4, FSD TC-14 |
| **Preconditions** | Legacy seeded; stub `secrets.store` throws on first namespaced write; workspace A empty |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Folder=A: `ensureMigrated()` with failing store | Throws/surfaces warning `Could not migrate stored credentials for this workspace ({message}). Legacy kept; will retry on next open.`; marker ABSENT; legacy intact |
| 2 | UI check: presence flags | `hasPegaPassword=false` reveals the missing part (UC-5 EF-2) |
| 3 | Heal stub; re-run `ensureMigrated()` | Completes; marker set; values present |

**Test Data:** `testdata/migration-testdata.csv` rows IT-11
**Postconditions:** Failed migration is safely retried; no partial-marker state.

---

### IT-12: Migration skips invalid legacy URL, migrates remaining valid fields

| Field | Value |
|-------|-------|
| **ID** | IT-12 |
| **Priority** | Medium |
| **Type** | Functional — Alternative Flow (UC-5 AF-4) |
| **Requirement** | UC-5 AF-4, BRD US-3 validation |
| **Preconditions** | Legacy: `pegaEndpoint="ftp://bad"` (invalid), `pegaUsername="legacy.op"` (valid), legacy password present; A empty |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Folder=A: `ensureMigrated()` | Endpoint NOT copied (invalid skipped); username + password copied; marker set (invalid-skip counts as handled) |
| 2 | `getCurrentState()` under A | `pegaEndpoint` empty/default, username `legacy.op`, `hasPegaPassword=true` |

**Test Data:** `testdata/migration-testdata.csv` rows IT-12
**Postconditions:** Invalid legacy data never enters workspace scope.

---

### IT-13: No-folder save blocked with zero writes (config + secrets untouched)

| Field | Value |
|-------|-------|
| **ID** | IT-13 |
| **Priority** | High |
| **Type** | Functional — Exception Flow (UC-6) |
| **Requirement** | UC-6 Main Flow step 2, BR-16, BRD US-4 AC-1, FSD TC-15 |
| **Preconditions** | `workspaceFolders = []`; snapshot all stub stores (Workspace, Global, secrets) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `updatePegaConfig("https://pega-a.corp/prweb", "op.a", "PassA-123!")` | Throws `No workspace folder open — Pega config requires a workspace to isolate credentials.` |
| 2 | `saveConfig({baseUrl:"https://a.atlassian.net", email:"a@corp.local", apiToken:"t"})` | Throws `No workspace folder open — open a folder to configure per-workspace Atlassian credentials.` |
| 3 | Diff all stores vs snapshot | Byte-identical: ZERO writes (no Global, no Workspace, no secret) — silent global write impossible |
| 4 | Reads under null scope | Return legacy globals read-only (or empty) — never throw for reads |

**Test Data:** `testdata/fallback-nfr-testdata.csv` rows IT-13
**Postconditions:** Back-door leak closed; user must open a folder.

---

### IT-14: Multi-root resolves workspaceFolders[0] deterministically

| Field | Value |
|-------|-------|
| **ID** | IT-14 |
| **Priority** | Medium |
| **Type** | Functional — Alternative Flow |
| **Requirement** | BR-17, BRD US-4 AC-2, FSD TC-16 |
| **Preconditions** | Two folders mocked: `[ws-a, ws-b]`; each has distinct saved values |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `getWorkspaceFolder()` with `[A, B]` | `C:\sdlc-test\ws-a` (folders[0]) |
| 2 | Repeated `getCurrentState()` (5×) | Identical A values every time |
| 3 | Reorder to `[B, A]`; `getCurrentState()` | B values (identity follows folders[0], deterministic per order) |
| 4 | `config.update` target check | Writes land in folders[0] scope only; folders[1..N] never read/written |

**Test Data:** `testdata/fallback-nfr-testdata.csv` rows IT-14
**Postconditions:** Canonical-folder rule holds across services.

---

### IT-15: SecretStorage.get throws → presence false, state still posted (fail closed)

| Field | Value |
|-------|-------|
| **ID** | IT-15 |
| **Priority** | Medium |
| **Type** | Functional — Exception Flow (UC-3 EF-2/EF-3) |
| **Requirement** | UC-3 EF-2/EF-3, TDD §5.6 |
| **Preconditions** | Workspace A configured; stub `secrets.get` throws for password key only, then for all keys |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `getCurrentState()` with password-get failing | `hasPegaPassword=false`, other fields intact; `state` posted (no crash); warning logged |
| 2 | All secret gets failing | Both presence flags false; endpoint/username (config) still returned; MUST NOT substitute another workspace's cached values |
| 3 | Next `getState` after healing | Retries cleanly, correct flags |

**Test Data:** `testdata/fallback-nfr-testdata.csv` rows IT-15
**Postconditions:** Keychain outage degrades to "Not set", never to cross-workspace data.

---

### IT-16: Clear methods delete namespaced secrets only, marker stays (OI-8)

| Field | Value |
|-------|-------|
| **ID** | IT-16 |
| **Priority** | Medium |
| **Type** | Functional — Alternative Flow |
| **Requirement** | TDD OI-8, BR-14, UC-5 |
| **Preconditions** | A migrated+configured (marker set); B configured differently |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Folder=A: `clearPegaPassword()` | `kiroSdlc.<hashA>.pegaPassword` deleted; hashB password untouched; flat keys untouched; marker hashA present |
| 2 | Folder=A: `clearConfig()` (Atlassian) | 3 namespaced secrets deleted + Workspace `atlassianConnectionType` unset; B triple intact; marker stays |
| 3 | Re-run migration for A | Nothing resurrected (marker blocks) — cleared-stays-cleared via explicit clear path |

**Test Data:** `testdata/migration-testdata.csv` rows IT-16
**Postconditions:** Without clear, Pega password could never be removed (blank=preserve); clear path closes that gap.

---
## 4. E2E-API Tests (IPC contracts + outbound REST, automated)

**File:** `extension/src/__tests__/settings-ipc-workspace.e2e.test.ts` (vitest + mocked global `fetch`; `SettingsMessageHandler` with real services + stub vscode). All payload shapes asserted byte-equal to FSD §3.8 frozen contracts. Reuses: shared vscode/SecretStorage/config stubs (§1 fixtures), mocked-fetch helper (per-test status/body script).

### E2E-API-01: savePegaConfig IPC → pegaSaved ok + auto state refresh (OI-12)

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-01 |
| **Priority** | High |
| **Type** | Automated (vitest + stubs) |
| **File** | `extension/src/__tests__/settings-ipc-workspace.e2e.test.ts` |
| **Traces To** | BRD US-1/Req 2 (BRD 2.3), UC-1 Main Flow, FSD §3.8.1 msg #1, TDD OI-12 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Folder=A: post `{type:"savePegaConfig", endpoint:"https://pega-a.corp.local:8443/prweb", username:"op.a", password:"PassA-123!"}` | `pegaSaved {success:true}` (no `error` key) |
| 2 | Capture next host→webview message | `state` auto-posted (OI-12 refresh) with A's endpoint/username + `hasPegaPassword:true` |
| 3 | Folder=B: post `getState` | B `state` empty; no A strings |
| 4 | Folder=A: post `savePegaConfig` with invalid endpoint `ftp://x` | `pegaSaved {success:false, error:"Invalid Pega Endpoint URL (http/https required)."}`; prior A values intact |

**Test Data:** `testdata/pega-isolation-testdata.csv` rows E2E-API-01
**Postconditions:** IPC contract frozen; values workspace-scoped.

---

### E2E-API-02: saveAtlassianConfig IPC → atlassianSaved ok + refresh, type default

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-02 |
| **Priority** | High |
| **Type** | Automated (vitest + stubs) |
| **File** | `extension/src/__tests__/settings-ipc-workspace.e2e.test.ts` |
| **Traces To** | BRD US-2 (BRD 2.3), UC-2 Main Flow + AF-1, FSD §3.8.1 msg #2 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Folder=A: post `{type:"saveAtlassianConfig", baseUrl:"https://a.atlassian.net", email:"a@corp.local", apiToken:"tokenA-xxx"}` (no connectionType) | `atlassianSaved {success:true}`; stored type `cloud` (AF-1 default); `state` refresh shows A triple presence |
| 2 | Folder=B: post same message with B values + `connectionType:"server"` | B stored `server`; A still `cloud` |
| 3 | Folder=A: post with `baseUrl:"ftp://x"` | `atlassianSaved {success:false, error:"Invalid Jira Base URL format."}`; A values intact |

**Test Data:** `testdata/atlassian-isolation-testdata.csv` rows E2E-API-02
**Postconditions:** Per-workspace types diverge correctly (`cloud` vs `server`).

---

### E2E-API-03: getState IPC → frozen state shape, presence flags only, no secrets

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-03 |
| **Priority** | High |
| **Type** | Automated (vitest + stubs) |
| **File** | `extension/src/__tests__/settings-ipc-workspace.e2e.test.ts` |
| **Traces To** | BRD US-5 (BRD 2.3), UC-3, BR-10, BR-11, BR-20, FSD §3.8.2 msg #1 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Folder=A (configured): post `getState` | `state` keys exactly per FSD §3.8.2 (incl. `pegaEndpoint, pegaUsername, hasPegaPassword, atlassianBaseUrl, atlassianEmail, hasAtlassianToken, atlassianConnectionType` + unchanged provider/backend/mcp/proxy keys); followed by `models` (double-post preserved) |
| 2 | Serialize both messages; grep for `PassA-123!`, `tokenA-xxx`, `a@corp.local` is ALLOWED (email is display data per FSD), passwords/tokens | Password/token zero hits (BR-20) |
| 3 | Switch to B; post `getState` | B values only |

**Test Data:** `testdata/pega-isolation-testdata.csv` + `testdata/atlassian-isolation-testdata.csv` rows E2E-API-03
**Postconditions:** Regression lock on IPC shapes (any contract drift fails the build).

---

### E2E-API-04: testPegaConnection uses workspace endpoint with 8 s timeout (OI-7)

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-04 |
| **Priority** | High |
| **Type** | Automated (vitest + mocked fetch) |
| **File** | `extension/src/__tests__/settings-ipc-workspace.e2e.test.ts` |
| **Traces To** | BRD US-5 Req 3, UC-4 Main Flow + AF-3, FSD §5.4.1 Call A, TDD OI-7 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Folder=A endpoint set; mock fetch 200; post `testPegaConnection` | `pegaTestResult {success:true, message:"✅ Network OK — Pega Server reachable (HTTP 200). Authentication not tested."}` (verbatim); fetch called with A's endpoint, NO auth header (behavior preserved) |
| 2 | Assert `AbortSignal.timeout(8000)` wired on the fetch call | Timeout present (was unbounded hang before fix) |
| 3 | Mock fetch throws `network down`; post again | `pegaTestResult {success:false, message:"Connection failed: network down"}` |
| 4 | Folder=B with empty endpoint; post `testPegaConnection` | Probes compiled default `http://localhost:8080/prweb`; message implies workspace default (UC-4 AF-3), never A's URL |

**Test Data:** `testdata/pega-isolation-testdata.csv` rows E2E-API-04
**Postconditions:** Connectivity check scoped per workspace; bounded in time.

---

### E2E-API-05: testAtlassianConnection per-workspace triple; 401 scoped, no retry

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-05 |
| **Priority** | High |
| **Type** | Automated (vitest + mocked fetch) |
| **File** | `extension/src/__tests__/settings-ipc-workspace.e2e.test.ts` |
| **Traces To** | BRD US-5 Req 3/AC-5, UC-4 Main Flow + EF-1/EF-2/EF-4, BR-12, FSD §5.4.2 Call C |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Folder=A triple set; mock `GET https://a.atlassian.net/rest/api/2/myself` 200 `{displayName:"Alice Nguyen"}`; post `testAtlassianConnection` | `atlassianTestResult {success:true, message:"Connected as Alice Nguyen"}`; request carried `Basic base64("a@corp.local:tokenA-xxx")`, trailing slashes stripped |
| 2 | Mock 401; post again under A | `{success:false, message:"Authentication failed (401). Check email/token."}`; fetch called ONCE (no retry, no B creds — BR-12) |
| 3 | Mock 500 `Server Error`; post again | `{success:false, message:"HTTP 500: Server Error"}` |
| 4 | Folder=B (B triple different); mock B myself 200 `{displayName:"Bob Tran"}`; post under B | `Connected as Bob Tran` with B's `Basic` header (A authenticates as A, B as B) |
| 5 | Abort path: fetch never resolves within 8000 ms | `{success:false, message:"Connection failed: <abort reason>"}`; user-initiated retry only (EF-4) |

**Test Data:** `testdata/atlassian-isolation-testdata.csv` rows E2E-API-05
**Postconditions:** Test authenticates as current workspace only.

---

### E2E-API-06: fetchPegaContext keeps verbatim no-folder guard + folders[0] root

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-06 |
| **Priority** | Medium |
| **Type** | Automated (vitest + stubs) |
| **File** | `extension/src/__tests__/settings-ipc-workspace.e2e.test.ts` |
| **Traces To** | UC-4, UC-6, FSD §3.8.1 msg #7, BRD US-4 AC-3 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | No folder: post `fetchPegaContext` | `pegaContextFetched {success:false, message:"No workspace folder open to save Pega context."}` (verbatim guard preserved) |
| 2 | Folders `[A, B]`: post `fetchPegaContext` with mocked Pega client | Disk-save root = A's path (`folders[0]`); Pega client internally workspace-resolved (TDD §5.2 — handler itself needs no scope change) |

**Test Data:** `testdata/fallback-nfr-testdata.csv` rows E2E-API-06
**Postconditions:** Guard wording frozen; root deterministic.

---

### E2E-API-07: Incomplete triple → No credentials configured, zero network calls

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-07 |
| **Priority** | High |
| **Type** | Automated (vitest + fetch spy) |
| **File** | `extension/src/__tests__/settings-ipc-workspace.e2e.test.ts` |
| **Traces To** | UC-2 EF-3, UC-4 AF-1, BR-7, FSD §5.4.2 Call C precondition |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Folder=B (empty): post `testAtlassianConnection` | `{success:false, message:"No credentials configured."}`; fetch spy count = 0 (no network without complete triple) |
| 2 | Folder=B: `handleCredentialRequest({requestId:"r9"})` | Throws `Atlassian credentials not configured in extension.` (verbatim, no values) |
| 3 | `JiraProjectIndexer.run()` gate under B | Returns `Atlassian credentials not configured (Settings → Atlassian Connection)` |

**Test Data:** `testdata/atlassian-isolation-testdata.csv` rows E2E-API-07
**Postconditions:** Incomplete workspace fails closed before any network.

---

### E2E-API-08: Clear IPC deletes namespaced scope + refreshes state (OI-8)

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-API-08 |
| **Priority** | Medium |
| **Type** | Automated (vitest + stubs) |
| **File** | `extension/src/__tests__/settings-ipc-workspace.e2e.test.ts` |
| **Traces To** | TDD OI-8, BR-14, UC-5 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Folder=A configured: post `clearPegaPassword` | Ack success + auto `state` refresh with `hasPegaPassword:false`; endpoint/username retained |
| 2 | Post `clearAtlassianConfig` | Ack success + refresh with `hasAtlassianToken:false`, type reset to `cloud` default |
| 3 | Folder=B: post `getState` | B values untouched by A's clear |

**Test Data:** `testdata/migration-testdata.csv` rows E2E-API-08
**Postconditions:** Explicit clear path works end-to-end over IPC.

---
## 5. E2E-UI Tests (Settings webview, automated via extension test host)

**Files:** `extension/src/__tests__/settings-workspace.ui.e2e.test.ts` (scenarios), helpers in `extension/src/__tests__/helpers/settings-ui.ts` (open Settings, fill Pega/Atlassian sections, click Save/Test, read `state` render, read banner). Selectors follow `settings.js` bindings (`pega-endpoint-input`, `pega-username-input`, state render `:630-634`, connection-type radio `:650-651`). Reuses: vscode workspace-folder switch helper (open folder A/B), webview message inspector (captures `state` payloads for no-secret asserts).

### E2E-UI-01: Settings renders A's values in A, empty in fresh B (WYSIWYS)

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-UI-01 |
| **Priority** | High |
| **Type** | Automated (extension test host) |
| **Feature File** | `extension/src/__tests__/settings-workspace.ui.e2e.test.ts` |
| **Scenario** | `Settings shows current workspace config only` |
| **Traces To** | BRD US-5 AC-1, UC-3 Main Flow, BR-10, FSD TC-8 |
| **Reuses** | open-folder(A/B), open-settings, read-state-render |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open folder A (configured via E2E-API-01/02); open Settings | Pega Endpoint = `https://pega-a.corp.local:8443/prweb`, Username = `op.a`, Atlassian URL/email/type = A's |
| 2 | Open folder B (fresh); open Settings | All inputs empty/defaults (`cloud`); no A strings visible anywhere in the panel |
| 3 | Inspect captured `state` payload for B | No A values; secrets absent (flags only) |

**Test Data:** `testdata/pega-isolation-testdata.csv` + `testdata/atlassian-isolation-testdata.csv` rows E2E-UI-01
**Postconditions:** What-you-see-is-what-is-used holds visually.

---

### E2E-UI-02: Save Pega via UI persists to workspace scope + shows pegaSaved

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-UI-02 |
| **Priority** | High |
| **Type** | Automated (extension test host) |
| **Feature File** | `extension/src/__tests__/settings-workspace.ui.e2e.test.ts` |
| **Scenario** | `Save Pega in workspace B isolates from A` |
| **Traces To** | BRD US-1, UC-1 Main Flow steps 1-5 |
| **Reuses** | open-folder, fill-pega-section, click-save, read-ack |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Folder B: fill Endpoint `https://pega-b.corp.local:8443/prweb`, Username `op.b`, Password `PassB-456!`; click Save Pega | Inline `pegaSaved` success; panel refreshes showing B values |
| 2 | Assert `.vscode/settings.json` in B | Contains `kiroSdlc.pegaEndpoint`/`pegaUsername` = B values; A's file unchanged |
| 3 | Reopen folder A Settings | Still A's original values (B save did not leak into A) |

**Test Data:** `testdata/pega-isolation-testdata.csv` rows E2E-UI-02
**Postconditions:** Bidirectional UI-level isolation.

---

### E2E-UI-03: Save Atlassian via UI persists triple + type per workspace

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-UI-03 |
| **Priority** | High |
| **Type** | Automated (extension test host) |
| **Feature File** | `extension/src/__tests__/settings-workspace.ui.e2e.test.ts` |
| **Scenario** | `Save Atlassian with server type in B` |
| **Traces To** | BRD US-2, UC-2 Main Flow |
| **Reuses** | open-folder, fill-atlassian-section, click-save, read-ack |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Folder B: fill Base URL `https://b-jira.corp.local`, Email `b@corp.local`, Token `patB-yyy`, select `server`; click Save | `atlassianSaved` success; radio shows `server` |
| 2 | Reopen folder A Settings | A's URL/email + `cloud` type unchanged |
| 3 | Folder B: save with `baseUrl="ftp://x"` | `atlassianSaved success:false "Invalid Jira Base URL format."`; form NOT cleared (BRD US-5 UI: failure shows error without clearing) |

**Test Data:** `testdata/atlassian-isolation-testdata.csv` rows E2E-UI-03
**Postconditions:** Types diverge per workspace; invalid save preserves form.

---

### E2E-UI-04: Presence placeholders read per-workspace (saved vs not-set)

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-UI-04 |
| **Priority** | Medium |
| **Type** | Automated (extension test host) |
| **Feature File** | `extension/src/__tests__/settings-workspace.ui.e2e.test.ts` |
| **Scenario** | `Password placeholders reflect current workspace presence` |
| **Traces To** | BRD US-5 UI, UC-3 §3.3.5, BR-10 |
| **Reuses** | open-folder, open-settings, read-placeholder |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Folder A (password stored): inspect Pega password + token placeholders | `●●●●●●●● (saved for this workspace)`-style indicator (presence true); stored value NEVER displayed |
| 2 | Folder B (empty): same inspection | `Not set for this workspace`-style indicator (presence false) |

**Test Data:** `testdata/pega-isolation-testdata.csv` rows E2E-UI-04
**Postconditions:** No secret rendered; placeholders workspace-accurate.

---

### E2E-UI-05: No-workspace window shows banner, save disabled/guarded

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-UI-05 |
| **Priority** | High |
| **Type** | Automated (extension test host, empty window) |
| **Feature File** | `extension/src/__tests__/settings-workspace.ui.e2e.test.ts` |
| **Scenario** | `Empty window blocks saves with explanatory banner` |
| **Traces To** | BRD US-4 AC-1, UC-6 Main Flow, BR-16, FSD TC-15 |
| **Reuses** | open-empty-window, open-settings, click-save, read-banner |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Empty window: open Settings | Banner `No workspace folder open — showing shared (read-only) values. Open a folder to configure per-workspace credentials.` (or TDD-finalized wording per OI-5); values read-only legacy/empty |
| 2 | Click Save Pega and Save Atlassian | Both blocked with no-workspace messages (exact strings per FSD §3.8.3); nothing written (IT-13 zero-write holds at UI level) |

**Test Data:** `testdata/fallback-nfr-testdata.csv` rows E2E-UI-05
**Postconditions:** No silent global write reachable from UI.

---

### E2E-UI-06: Test buttons report per-workspace results in the panel

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-UI-06 |
| **Priority** | High |
| **Type** | Automated (extension test host + mocked fetch) |
| **Feature File** | `extension/src/__tests__/settings-workspace.ui.e2e.test.ts` |
| **Scenario** | `Test buttons authenticate as current workspace` |
| **Traces To** | BRD US-5 AC-2, UC-4 Main Flow, FSD TC-9 |
| **Reuses** | open-folder, click-test-pega/atlassian, read-result-message |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Folder A: click Test Pega (mock 200) | `✅ Network OK — Pega Server reachable (HTTP 200). Authentication not tested.` |
| 2 | Folder A: click Test Atlassian (mock myself Alice) | `Connected as Alice Nguyen` |
| 3 | Folder B (B creds, mock myself Bob): click Test Atlassian | `Connected as Bob Tran` — proves B tests B, not A |
| 4 | Folder B empty: click Test Atlassian | `No credentials configured.`-family message naming this workspace (not generic global) |

**Test Data:** `testdata/pega-isolation-testdata.csv` + `testdata/atlassian-isolation-testdata.csv` rows E2E-UI-06
**Postconditions:** Panel results match each workspace's credentials.

---

### E2E-UI-07: Fresh workspace never prefilled from another workspace

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-UI-07 |
| **Priority** | High |
| **Type** | Automated (extension test host) |
| **Feature File** | `extension/src/__tests__/settings-workspace.ui.e2e.test.ts` |
| **Scenario** | `New workspace opens with defaults, not neighbor values` |
| **Traces To** | BRD US-5 Req 4, BR-10 (prefill FORBIDDEN), FSD TC-8 |
| **Reuses** | create-fresh-folder, open-settings, read-all-inputs |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Configure A fully; create fresh folder C; open Settings in C | Endpoint default `http://localhost:8080/prweb` (package.json default), username `""`, `has* = false`, type `cloud` — zero A strings |
| 2 | Type one char in C's endpoint, discard, reopen | Still defaults (no autosave leakage) |

**Test Data:** `testdata/fallback-nfr-testdata.csv` rows E2E-UI-07
**Postconditions:** SA4E-323 repro (A-save → B-open → B shows A) no longer reproduces.

---

### E2E-UI-08: Multi-root window shows canonical-folder values + note

| Attribute | Value |
|-----------|-------|
| **ID** | E2E-UI-08 |
| **Priority** | Medium |
| **Type** | Automated (extension test host, multi-root) |
| **Feature File** | `extension/src/__tests__/settings-workspace.ui.e2e.test.ts` |
| **Scenario** | `Multi-root Settings reflects folders[0] with explanatory note` |
| **Traces To** | UC-3 AF-3, BR-17, TDD OI-5, FSD TC-16 |
| **Reuses** | open-multi-root([A,B]), open-settings, read-note |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open multi-root `[A, B]`; open Settings | Shows A's values (folders[0]); note visible when `folderCount > 1` (wording per TDD OI-5) |
| 2 | Reopen repeatedly | Same A values every time (deterministic) |

**Test Data:** `testdata/fallback-nfr-testdata.csv` rows E2E-UI-08
**Postconditions:** `folders[1..N]` values never displayed.

---
## 6. Manual SIT Tests (human execution, evidence required)

**Lab:** VS Code desktop, folders `C:\sdlc-test\ws-a` + `C:\sdlc-test\ws-b`, real Pega test tenant + Jira test tenant with DISTINCT credentials per workspace, OS keychain viewer. Record results in `TEST-REPORT-SA4E-323.csv` (Status/PASS/FAIL, Actual_Result, Evidence_Path `evidence/SIT-xx-*.png`, Defect_ID, Executed_By/Date).

### SIT-01: Real two-workspace isolation matrix against live servers (P0)

| Field | Value |
|-------|-------|
| **ID** | SIT-01 |
| **Priority** | High |
| **Type** | Manual — Functional (isolation end-to-end) |
| **Requirement** | BRD US-1/US-2/US-5 AC-1/AC-2/AC-4/AC-5, UC-1/UC-2/UC-4, FSD TC-1/TC-2/TC-4/TC-5/TC-8/TC-9 |
| **Preconditions** | Extension with fix installed; A/B folders; live Pega + Jira tenants; distinct creds per workspace |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Folder A: Settings → save Pega (A endpoint/user/pass) + Atlassian (A triple, `cloud`); screenshot | `pegaSaved`/`atlassianSaved` success; `evidence/SIT-01-a-saved.png` |
| 2 | Folder A: Test Pega + Test Atlassian | Reachable message; `Connected as <A Jira user>`; screenshot |
| 3 | Folder B: open Settings (before saving) | Empty/defaults; `has*` false; screenshot proves no A prefill |
| 4 | Folder B: save DIFFERENT creds (`server` type); Test both | `Connected as <B Jira user>` (≠ A user); screenshot |
| 5 | Reopen A Settings + run Pega schema indexing + Jira project indexing | A values intact; indexing logs name A's folder+hash (no secrets); screenshot |
| 6 | Inspect `ws-a/.vscode/settings.json` vs `ws-b/.vscode/settings.json` | Each holds only its own endpoint/username/type; no cross values |

**Test Data:** `testdata/pre-seeded-data.csv` + `testdata/pega-isolation-testdata.csv` + `testdata/atlassian-isolation-testdata.csv` rows SIT-01 (live creds recorded off-doc by tester; CSV holds shapes only)
**Postconditions:** Live proof: switching workspaces never leaks; each workspace authenticates as itself.

---

### SIT-02: Real upgrade migration with OS keychain (legacy → A, then B)

| Field | Value |
|-------|-------|
| **ID** | SIT-02 |
| **Priority** | High |
| **Type** | Manual — Functional (migration) |
| **Requirement** | BRD US-3 AC-1..AC-4, UC-5, BR-13..BR-15, FSD TC-10/TC-11/TC-13 |
| **Preconditions** | Old VSIX (global behavior) installed: save legacy globals; then install fixed VSIX |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Old build: save one Pega + Atlassian config (global); verify in user `settings.json` + keychain flat keys; screenshot | Legacy baseline captured |
| 2 | Install fixed VSIX; open folder A Settings | Legacy values shown as A's own; all read sites work without re-entry; screenshot |
| 3 | Inspect keychain: `kiroSdlc.<hashA>.*` + marker `...migrated="1"` present; legacy flat keys still present | Copy-not-move proven |
| 4 | Open folder B Settings | B independently shows legacy copies under hashB + marker hashB; screenshot |
| 5 | In A: change endpoint to A-specific; reopen B | B unaffected (post-migration divergence works) |

**Test Data:** `testdata/migration-testdata.csv` rows SIT-02
**Postconditions:** No data loss on upgrade; per-workspace lazy migration proven on real keychain.

---

### SIT-03: No-leak sweep — grep settings.json, logs, webview payload, IPC errors (P0)

| Field | Value |
|-------|-------|
| **ID** | SIT-03 |
| **Priority** | High |
| **Type** | Manual — Security |
| **Requirement** | BR-20, BRD US-1 AC-3/US-2 AC-3, FSD TC-19 |
| **Preconditions** | A/B configured with KNOWN canary secrets (`CanaryPass-A-9z9z!`, `CanaryToken-B-8y8y!` — from CSV, rotated after test) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Save/test/migrate in A and B (cover SIT-01+SIT-02 paths) | All operations succeed |
| 2 | Ripgrep canary strings across: `ws-a/.vscode/settings.json`, `ws-b/.vscode/settings.json`, `%APPDATA%/Code/User/settings.json`, extension output channel log file, captured `state`/`*Saved`/`*TestResult` payloads (via webview inspector),.contrib error toasts | ZERO hits outside OS keychain + in-memory auth headers (verified via header-present/keychain-present control checks) |
| 3 | Force error paths (bad URL save, 401 test, no-folder save) | Error messages contain NO canary strings; screenshot each |

**Test Data:** `testdata/fallback-nfr-testdata.csv` rows SIT-03 (canary values)
**Postconditions:** 0 occurrences outside SecretStorage+headers; evidence log attached. FAIL = P1/Critical defect.

---

### SIT-04: Wall-clock timing — getState p95 <300 ms, migration p95 <500 ms

| Field | Value |
|-------|-------|
| **ID** | SIT-04 |
| **Priority** | Medium |
| **Type** | Manual — Non-Functional (Performance) |
| **Requirement** | FSD §8 NFR-T2/NFR-T3, TDD §8.3, BRD NFR Performance |
| **Preconditions** | A configured+migrated; B fresh with legacy seeded; stopwatch/devtools timing |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Folder A: trigger `getState` 20×, record durations | p95 < 300 ms; ≤6 secret gets observable (keychain audit); 0 network |
| 2 | Folder B (first open, legacy seeded): measure first `getState` (includes `ensureMigrated`) | p95 < 500 ms |
| 3 | Measure `getWsHash()` cost (profiled or 10k-iteration microbench in console) | < 1 ms per call, zero I/O |
| 4 | Atlassian Test with black-hole URL (no response) | Bounded ≤ ~8000 ms (abort fires); Pega Test likewise (OI-7) |

**Test Data:** `testdata/fallback-nfr-testdata.csv` rows SIT-04
**Acceptance Criteria:** All four budgets met on the test machine (record machine + keychain backend in Notes).
**Postconditions:** Numbers recorded in TEST-REPORT Notes column.

---

### SIT-05: Concurrent windows of the same workspace converge (last-write-wins)

| Field | Value |
|-------|-------|
| **ID** | SIT-05 |
| **Priority** | Medium |
| **Type** | Manual — Non-Functional (Reliability) |
| **Requirement** | UC-1 AF-4, FSD NFR-T5, TDD §8.3 |
| **Preconditions** | Two VS Code windows open on folder A |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Window 1: save Pega endpoint E1; Window 2: save endpoint E2 (same workspace) | Both succeed (same scope hashA, no divergence possible) |
| 2 | Refresh Settings in both windows | Both converge on E2 (last write); screenshot both |
| 3 | `getPegaEndpoint()` consumers in both windows | Identical E2 |

**Test Data:** `testdata/fallback-nfr-testdata.csv` rows SIT-05
**Postconditions:** No split-brain within one workspace.

---

### SIT-06: Remote/WSL path determinism + OS cross-check (BR-19)

| Field | Value |
|-------|-------|
| **ID** | SIT-06 |
| **Priority** | Medium |
| **Type** | Manual — Compatibility |
| **Requirement** | BR-19, BRD US-4 Req 3, FSD TC-17 |
| **Preconditions** | WSL or SSH-remote folder access (or second OS for cross-check) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open remote folder; save Pega config; close; reopen same remote folder | Same values (same key — scheme+authority preserved, deterministic) |
| 2 | Open same repo via different casing/separator form if OS allows (e.g. `C:\PROJ` vs `c:\proj\`) | Same values (normalization); screenshot output-channel folder+hash debug lines for both forms showing identical wsHash |
| 3 | Open a genuinely different remote folder | Empty (different key) |

**Test Data:** `testdata/fallback-nfr-testdata.csv` rows SIT-06
**Postconditions:** Same folder → same key on every access form; different folder → different key.

---

### SIT-07: Read-only .vscode/settings.json → partial-save warning, migration deferred

| Field | Value |
|-------|-------|
| **ID** | SIT-07 |
| **Priority** | Medium |
| **Type** | Manual — Exception Flow |
| **Requirement** | UC-1 EF-4 (TA), UC-2 EF-4 (TA), UC-5 EF-4 (TA), TDD §5.6 |
| **Preconditions** | Folder C with `.vscode/settings.json` set read-only; legacy seeded |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Folder C: save Pega with new password | `pegaSaved success:false "Failed to save Pega config: {message} (password may not be saved — retry)."` — message WARNS secret may already be stored without config |
| 2 | Restore write permission; save again | Success (idempotent overwrite of the same namespaced keys) |
| 3 | Migration variant: read-only during first open | Migration sets NO marker; next open (writable) retries missing config writes; already-copied secrets harmlessly overwritten |

**Test Data:** `testdata/fallback-nfr-testdata.csv` rows SIT-07
**Postconditions:** Partial failure is explicit and recoverable; never silent.

---

### SIT-08: Release-note UX — single-credential users + committed-settings warning (OI-11)

| Field | Value |
|-------|-------|
| **ID** | SIT-08 |
| **Priority** | Low |
| **Type** | Manual — Usability/Regression |
| **Requirement** | BRD Risk #4, TDD OI-6/OI-11/§10.3 release note, UC-6 banner (OI-5) |
| **Preconditions** | Fixed VSIX installed; git repo workspace with committed `.vscode/settings.json` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Read release note: each workspace inherits legacy on first open; endpoint/username now in workspace `.vscode/settings.json`; per-workspace saves going forward | Note present and accurate vs actual behavior (SIT-02 evidence) |
| 2 | Verify endpoint/username appear in committed `.vscode/settings.json` while secrets do NOT | Warning present (OI-11 accepted + documented); BR-20 still holds |
| 3 | Single-credential user flow: migrate A, open B (auto-copied legacy), verify B works with zero extra steps | No silent data loss; perceived-regression mitigated |
| 4 | Banner/wording review (OI-5): no-folder banner, multi-root note, "not configured for this workspace" test messages | Human judgment: clear, names the workspace context; log wording tweaks as Minor defects if needed |

**Test Data:** `testdata/fallback-nfr-testdata.csv` rows SIT-08
**Postconditions:** Docs match behavior; UX wording signed off by human eyes.

---
## 7. Requirements Traceability Matrix (RTM)

### 7.1 BRD User Stories (5/5 — 100%)

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| US-1 Pega per-workspace isolation (AC-1..AC-5) | BRD 2.3 | PBT-01, PBT-02, UT-03, UT-06, UT-07, UT-12, UT-14, IT-01, IT-02, E2E-API-01, E2E-API-04, E2E-UI-01, E2E-UI-02, SIT-01 | ✅ |
| US-2 Atlassian per-workspace isolation (AC-1..AC-4) | BRD 2.3 | PBT-03, UT-08, UT-09, UT-10, UT-11, UT-13, IT-03, IT-04, IT-05, E2E-API-02, E2E-API-05, E2E-API-07, E2E-UI-03, SIT-01 | ✅ |
| US-3 One-time migration (AC-1..AC-4) | BRD 2.3 | PBT-04, PBT-05, IT-07, IT-08, IT-09, IT-10, IT-11, IT-12, IT-16, E2E-API-08, SIT-02 | ✅ |
| US-4 No-folder fallback + multi-root (AC-1..AC-3) | BRD 2.3 | UT-02, UT-04, IT-13, IT-14, E2E-API-06, E2E-UI-05, E2E-UI-08, SIT-06 | ✅ |
| US-5 WYSIWYS show+verify current workspace (AC-1..AC-5) | BRD 2.3 | IT-06, IT-15, E2E-API-03, E2E-API-04, E2E-API-05, E2E-UI-01, E2E-UI-04, E2E-UI-06, E2E-UI-07, SIT-01 | ✅ |

### 7.2 FSD Use Cases (7/7 — 100%)

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| UC-1 Pega save/load (Main + AF-1..AF-4 + EF-1..EF-3) | FSD 3.1 | PBT-01, UT-03, UT-06, UT-07, IT-01, IT-02, E2E-API-01, E2E-UI-02, SIT-01, SIT-05 | ✅ |
| UC-2 Atlassian save/load (Main + AF-1..AF-4 + EF-1..EF-4) | FSD 3.2 | UT-08, UT-09, UT-10, UT-11, IT-03, IT-04, IT-05, E2E-API-02, E2E-API-07, E2E-UI-03 | ✅ |
| UC-3 Settings state load (Main + AF-1..AF-3 + EF-1..EF-3) | FSD 3.3 | IT-06, IT-14, IT-15, E2E-API-03, E2E-UI-01, E2E-UI-04, E2E-UI-07, E2E-UI-08 | ✅ |
| UC-4 Test connections (Main + AF-1..AF-4 + EF-1..EF-4) | FSD 3.4 | UT-12, UT-13, E2E-API-04, E2E-API-05, E2E-API-06, E2E-UI-06, SIT-01 | ✅ |
| UC-5 Migration (Main + AF-1..AF-5 + EF-1..EF-4) | FSD 3.5 | PBT-04, PBT-05, IT-07, IT-08, IT-09, IT-10, IT-11, IT-12, IT-16, E2E-API-08, SIT-02, SIT-07 | ✅ |
| UC-6 No-folder + multi-root (Main + AF-1..AF-2 + EF-1) | FSD 3.6 | UT-02, UT-04, IT-13, IT-14, E2E-API-06, E2E-UI-05, E2E-UI-08, SIT-06 | ✅ |
| UC-7 Downstream consumption (Main + AF-1..AF-3 + EF-1..EF-3) | FSD 3.7 | UT-13, UT-14, IT-02, IT-04, IT-05, IT-15, E2E-API-05, E2E-API-07 | ✅ |

### 7.3 FSD Business Rules (20/20 — 100%)

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| BR-1 Pega config Workspace target | FSD 3.1.3 | IT-01, E2E-API-01, E2E-UI-02 | ✅ |
| BR-2 Pega password namespaced only | FSD 3.1.3 | PBT-03, IT-01, IT-02 | ✅ |
| BR-3 Blank password preserves | FSD 3.1.3 | UT-06 | ✅ |
| BR-4 Endpoint http/https + slash-strip | FSD 3.1.3 | PBT-06, UT-07, UT-12 | ✅ |
| BR-5 Connection type Workspace target | FSD 3.2.3 | IT-03, E2E-API-02 | ✅ |
| BR-6 Atlassian secrets namespaced only | FSD 3.2.3 | PBT-03, IT-03 | ✅ |
| BR-7 getConfig null unless triple complete | FSD 3.2.3 | UT-09, E2E-API-07 | ✅ |
| BR-8 Type default cloud / coerce | FSD 3.2.3 | UT-10, IT-03 | ✅ |
| BR-9 validateUrl http/https verbatim | FSD 3.2.3 | UT-08, E2E-API-02 | ✅ |
| BR-10 State current-workspace only, no prefill | FSD 3.3.3 | IT-06, E2E-API-03, E2E-UI-01, E2E-UI-07 | ✅ |
| BR-11 IPC contracts unchanged | FSD 3.3.3 | UT-05 (LLM untouched), IT-04, E2E-API-03 | ✅ |
| BR-12 Tests use current workspace, no cross retry | FSD 3.4.3 | UT-13, E2E-API-05 | ✅ |
| BR-13 Migration lazy/per-workspace/idempotent + marker | FSD 3.5.3 | PBT-04, UT-04, IT-07, IT-10 | ✅ |
| BR-14 Workspace-wins + cleared-stays-cleared | FSD 3.5.3 | PBT-05, IT-08, IT-09, IT-16, E2E-API-08 | ✅ |
| BR-15 Copy-not-move + retry-safe, legacy intact | FSD 3.5.3 | IT-07, IT-10, IT-11, SIT-02 | ✅ |
| BR-16 No-folder read-only + blocked save, no silent global | FSD 3.6.3 | UT-02, UT-04, IT-13, E2E-UI-05 | ✅ |
| BR-17 Multi-root canonical folders[0] | FSD 3.6.3 | IT-14, E2E-UI-08, SIT-06 | ✅ |
| BR-18 Single Resolver, no flat/Global reads, updateConfig guard | FSD 3.7.3 | UT-05, IT-02, IT-04 | ✅ |
| BR-19 wsHash normalize + sha256 12-hex determinism | FSD 3.7.3 | PBT-01, PBT-02, UT-01, UT-03, SIT-06 | ✅ |
| BR-20 No secret outside SecretStorage+headers | FSD 3.7.3 | IT-06, IT-15, E2E-API-03, SIT-03 | ✅ |

### 7.4 TDD Component Groups (6/6 — 100%)

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| WorkspaceScopeResolver (6 functions: folder/normalize/hash/secretKey/marker/ensureMigrated) | TDD §4.2/§5.2 | PBT-01..PBT-06, UT-01..UT-04 | ✅ |
| 3 write sites Global→Workspace (ProviderConfigService:60-61, AtlassianCredentialService:93) | TDD §5.2 | IT-01, IT-03, E2E-API-01, E2E-API-02, E2E-UI-02, E2E-UI-03 | ✅ |
| Secret namespacing (4 bases + marker) + IndexingService:234 literal fix | TDD §4.1/§5.2 | PBT-03, IT-01..IT-04, SIT-03 | ✅ |
| Migration wiring (5 triggers incl. runSchemaIndexer) + field-level copy | TDD §4.3/§5.4 | PBT-04, PBT-05, IT-07..IT-12, SIT-02 | ✅ |
| Fallback (null scope) + multi-root canonical + sync/async contract | TDD §5.4/§5.5 | UT-02, IT-13, IT-14, IT-15, E2E-API-06, E2E-UI-05 | ✅ |
| Read-site sync (PegaHttpClient/IndexingService/AtlassianHttpClient/JiraProjectIndexer/PegaRuleSetResolverService) + updateConfig guard | TDD §5.2/§5.4 | UT-05, UT-12, UT-13, UT-14, IT-02, IT-04, IT-05, E2E-API-07 | ✅ |
| OI decisions (OI-7 8s Pega timeout, OI-8 clear, OI-9 empty-reject, OI-12 refresh) | TDD App. A | UT-11, IT-16, E2E-API-01, E2E-API-02, E2E-API-04, E2E-API-08, SIT-04 | ✅ |

**Coverage Summary:**

| Category | Total | Covered | Coverage % |
|----------|-------|---------|------------|
| BRD User Stories (+ACs) | 5 (20 ACs) | 5 (20 ACs) | 100% |
| FSD Use Cases | 7 | 7 | 100% |
| FSD Business Rules | 20 | 20 | 100% |
| TDD Component Groups | 6 (+4 OI decisions) | 6 (+4) | 100% |
| FSD Test Scenarios TC-1..TC-20 | 20 | 20 (each mapped to ≥1 STC case; see §7.5) | 100% |
| **Overall** | **58 items** | **58** | **100%** |

### 7.5 FSD §10 TC-1..TC-20 → STC mapping (no scenario lost)

| FSD TC | STC covering cases |
|--------|-------------------|
| TC-1 Pega isolation A→B | IT-01, E2E-UI-02, SIT-01 |
| TC-2 Pega read-site consistency | IT-02 |
| TC-3 Blank-password preserve | UT-06 |
| TC-4 Atlassian isolation A→B | IT-03, E2E-UI-03, SIT-01 |
| TC-5 Atlassian IPC + hot-reload | IT-04, IT-05 |
| TC-6 Invalid URL rejected | UT-07, UT-08, E2E-API-02 |
| TC-7 Type default/coerce | UT-10 |
| TC-8 getState isolation | IT-06, E2E-API-03, E2E-UI-01 |
| TC-9 Current-workspace test | UT-13, E2E-API-05, E2E-UI-06 |
| TC-10 Migration happy | IT-07, SIT-02 |
| TC-11 Migration workspace-wins | PBT-05, IT-08 |
| TC-12 Cleared-stays-cleared | IT-09 |
| TC-13 Per-workspace lazy | IT-10, SIT-02 |
| TC-14 Retry-safe | IT-11 |
| TC-15 No-folder fallback | UT-02, IT-13, E2E-UI-05 |
| TC-16 Multi-root determinism | IT-14, E2E-UI-08 |
| TC-17 Same-workspace determinism | PBT-01, PBT-02, UT-03, SIT-06 |
| TC-18 Slash normalization | PBT-06, UT-12 |
| TC-19 No leakage | IT-06, E2E-API-03, SIT-03 |
| TC-20 updateConfig guard | UT-05 |

---
## 8. Appendix

### 8.1 Test Data CSV Index (every test-case ID appears in ≥1 CSV)

| CSV File | Test-Case IDs Covered | Rows |
|----------|----------------------|------|
| testdata/pre-seeded-data.csv | Baseline fixtures for ALL cases (folders A/B/C, legacy globals, canaries); referenced by SIT-01..SIT-08 | 12 |
| testdata/pega-isolation-testdata.csv | PBT-01, PBT-02, PBT-03, UT-01, UT-03, UT-05, UT-06, UT-07, UT-12, UT-14, IT-01, IT-02, IT-06, E2E-API-01, E2E-API-03, E2E-API-04, E2E-UI-01, E2E-UI-02, E2E-UI-04, E2E-UI-06, SIT-01 | 34 |
| testdata/atlassian-isolation-testdata.csv | PBT-03, UT-08, UT-09, UT-10, UT-11, UT-13, IT-03, IT-04, IT-05, IT-06, E2E-API-02, E2E-API-03, E2E-API-05, E2E-API-07, E2E-UI-01, E2E-UI-03, E2E-UI-06, SIT-01 | 30 |
| testdata/migration-testdata.csv | PBT-04, PBT-05, IT-07, IT-08, IT-09, IT-10, IT-11, IT-12, IT-16, E2E-API-08, SIT-02 | 24 |
| testdata/fallback-nfr-testdata.csv | PBT-06, UT-02, UT-04, IT-13, IT-14, IT-15, E2E-API-06, E2E-UI-05, E2E-UI-07, E2E-UI-08, SIT-03, SIT-04, SIT-05, SIT-06, SIT-07, SIT-08 | 30 |

Cross-check: 60/60 IDs covered (PBT 6/6, UT 14/14, IT 16/16, E2E-API 8/8, E2E-UI 8/8, SIT 8/8). IT-06 and E2E-API-03 and E2E-UI-01/E2E-UI-06 and SIT-01 appear in two CSVs (Pega + Atlassian facets) — intentional.

### 8.2 Test Data Setup (automated harness)

```typescript
// Fixture loader used by all vitest suites (pseudocode, follows pega-ruleset-resolver.test.ts mock style):
import { vi } from "vitest";
export const FOLDER_A = "C:\\sdlc-test\\ws-a", FOLDER_B = "C:\\sdlc-test\\ws-b";
export function mockFolder(fsPath: string | null) {
  const vscode = require("vscode");
  vscode.workspace.workspaceFolders = fsPath ? [{ uri: { fsPath } }] : [];
}
export function seedLegacy(stubSecrets: Map<string,string>, stubGlobal: Map<string,string>) {
  // values mirror testdata/migration-testdata.csv MIGRATE-* rows
  stubGlobal.set("pegaEndpoint", "http://localhost:8080/prweb");
  stubGlobal.set("pegaUsername", "legacy.op");
  stubGlobal.set("atlassianConnectionType", "server");
  stubSecrets.set("kiroSdlc.pegaPassword", "LegacyPass-000!");
  stubSecrets.set("kiroSdlc.atlassian.baseUrl", "https://legacy.atlassian.net");
  stubSecrets.set("kiroSdlc.atlassian.email", "legacy@corp.local");
  stubSecrets.set("kiroSdlc.atlassian.apiToken", "legacy-token-000");
}
// Canary secrets for SIT-03 live ONLY in fallback-nfr-testdata.csv; rotate after the sweep.
```

### 8.3 Environment Configuration

- Automated: `npm run test:unit` in `extension/` (vitest run). New suites: `workspace-scope-resolver.test.ts`, `workspace-scope-resolver.pbt.test.ts` (fast-check), `provider-config-workspace.test.ts`, `atlassian-workspace.test.ts`, `settings-ipc-workspace.e2e.test.ts`, `settings-workspace.ui.e2e.test.ts` (+ `helpers/settings-ui.ts`). Each suite file ≤ 200 lines; each test ≤ 20 lines (project code standards).
- Manual SIT: two folders + tenants per STP §4; evidence screenshots → `documents/SA4E-323/evidence/`; results → `TEST-REPORT-SA4E-323.csv` (pre-filled `NOT_RUN`, 60 rows).
- Out-of-scope regression lock: `updateConfig()` LLM-key callers (`setProvider/setModel/setOllamaUrl/setBaseUrl`) covered by UT-05 step 3; existing `__tests__/pega-*.test.ts` mocks unaffected (they mock `getConfiguration`, not SecretStorage keys).

### 8.4 BA Review Submission Checklist

- [x] STC.md + STP.md complete with RTM (§7) mapping every BRD AC / FSD UC / FSD BR / TDD component.
- [x] Test data CSVs referenced by every test case (concrete values, not "valid data").
- [x] Expected results use exact IPC strings from FSD §3.8.3 / TDD §3.2 (no invented messages).
- [x] No out-of-scope tests (LLM keys, backend, proxy, Settings Sync, panel redesign, `pegaDeveloperShortName` writes).
- [ ] BA verdict: ☐ APPROVED / ☐ CHANGES REQUESTED (max 2 fix→re-review iterations per Review Gate).
