# Software Test Cases (STC)

## SDLC Agents 4 Enterprise — SA4E-349: Pega CodeIntelligence — 3 bugs hide auth 401 failures (fail-loud fixes)

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-349 (https://jiraassist.atlassian.net/browse/SA4E-349) |
| Title | Pega CodeIntelligence: 3 bugs hide auth 401 failures (Test Connection false-green, hierarchy fallback "PegaApp", discovery hardcode HRAppsV2) |
| Type | Bug — fail-loud fix |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-10-09 |
| Status | Draft — pending review |
| Requirements Source | FIX-GUIDE-pega-auth-silent-failures.md (repo root, 386 lines) — §2 Symptoms, §4 Fixes (file:line), §7 Verify Scenarios A/B, §10 Button behavior |
| Related Test Files | extension/src/__tests__/pega-hierarchy-resolver.test.ts (4 tests — new), extension/src/__tests__/pega-codeintel-discovery.test.ts (3 tests — updated) |
| Related Report | TEST-REPORT.md (same folder) |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-09 | QA Agent | Initiate — 24 test cases from fix guide §4 (file:line) + §7 (scenarios A/B) covering 4 fixes |

---

## Test Case Summary

| Group | ID Range | Count | Priority | Level |
|-------|----------|-------|----------|-------|
| FIX #1 — Test Connection auth-aware | TC-F1-01 to TC-F1-05 | 5 | 2 × Critical, 3 × High | UT + E2E |
| FIX #2 — Hierarchy resolver fail-loud | TC-F2-01 to TC-F2-04 | 4 | 2 × Critical, 2 × High | UT (automated) |
| FIX #3 — Fetch Context fail-loud, no bad write | TC-F3-01 to TC-F3-04 | 4 | 2 × Critical, 2 × High | UT + E2E |
| FIX #4 — Discovery, no hardcode | TC-F4-01 to TC-F4-04 | 4 | 1 × Critical, 3 × High | UT |
| SCENARIO A — credential 401 (current state) | TC-SA-01 to TC-SA-04 | 4 | Critical | E2E — manual (real Pega server) |
| SCENARIO B — credential valid | TC-SB-01 to TC-SB-03 | 3 | Critical | E2E — manual (real Pega server) |
| **Total** | — | **24** | — | — |

### Automation Coverage

| Fix | Automated by | Gap |
|-----|--------------|-----|
| FIX #2 | ✅ pega-hierarchy-resolver.test.ts — 4 tests: 401 re-throw, 403 re-throw, non-auth soft, no-PegaApp-fallback | None |
| FIX #4 | ✅ pega-codeintel-discovery.test.ts — 3 tests: summary POST, backend error, fail-loud no hardcode | File-based read (TC-F4-01) not automated |
| FIX #1 | ❌ No unit test for PegaSettingsHandler.buildTestResult | Covered via TC-SA-01 / TC-SB-01 runtime verify |
| FIX #3 | ❌ No unit test for PegaSettingsHandler.fetchContext | Covered via TC-SA-02 / TC-SB-02 + code review |

Full suite baseline: **250 test files / 2400 tests PASS** (vitest run, exit 0 — re-verified 2026-10-09, see TEST-REPORT.md §2).

---

## 1. FIX #1 — Test Connection auth-aware (PegaSettingsHandler.test())

**Fixed code:** `extension/src/panels/settings/handlers/PegaSettingsHandler.ts` — method `test()` (line 31-46) + helper `buildTestResult()` (line 49-57). Requirement source: guide §4 FIX #1.

**Behavior contract:**
- GET `{base}/api/v1/data/D_OperatorID` WITH `Authorization` header (Basic) + 8s bounded timeout (OI-7).
- `success = true` ONLY when HTTP 200 — 401/403/other must NEVER report green.
- Errors (timeout, network) → `success: false` with `Connection failed: {err.message}`.

---

### TC-F1-01: Test Connection — credential 401 → ❌ auth failure (no more false green)

| Field | Value |
|-------|-------|
| **ID** | TC-F1-01 |
| **Priority** | Critical |
| **Type** | Functional — Exception Flow (auth) |
| **Requirement** | FIX #1 (test() L31-46, buildTestResult L49-57); guide §7 Scenario A.1 |
| **Preconditions** | Extension built (npm run build PASS); Pega endpoint configured; operator `duc.nguyen.10@fecredit.com.vn` with stored password; credential currently returns HTTP 401 (stale password or disabled operator); proxy manual `10.30.168.246:9090` |
| **Level** | UT (buildTestResult mapping) + E2E manual — see TC-SA-01 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open SDLC Agents Settings → Pega section; click **Test Connection** | Request fires: `GET {base}/api/v1/data/D_OperatorID` with `Authorization: Basic ...` |
| 2 | Wait ≤ 8s (bounded timeout OI-7) | Response HTTP 401 received |
| 3 | Observe webview message `pegaTestResult` | `success: false`; message = `❌ Authentication failed (HTTP 401). Check Operator ID / password or account status.` |

**Test Data:** operator `duc.nguyen.10@fecredit.com.vn`; endpoint `https://fecrdt-coll-stg1-internal.pegacloud.io/prweb`
**Postconditions:** No state change; SecretStorage untouched. NOT green — old behavior ("reachable", `status > 0`) is gone.
**Automation:** ❌ no unit test file for PegaSettingsHandler — verified via runtime Scenario A.

---

### TC-F1-02: Test Connection — credential 403 → ❌ auth failure (same message shape)

| Field | Value |
|-------|-------|
| **ID** | TC-F1-02 |
| **Priority** | Critical |
| **Type** | Functional — Exception Flow (auth) |
| **Requirement** | FIX #1 (buildTestResult L53-54); guide §4 FIX #1 |
| **Preconditions** | Same as TC-F1-01 but credential returns HTTP 403 (operator lacks D_OperatorID access) |
| **Level** | UT (buildTestResult mapping) + E2E manual |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click **Test Connection** with 403-returning credential | Response HTTP 403 |
| 2 | Observe `pegaTestResult` | `success: false`; message = `❌ Authentication failed (HTTP 403). Check Operator ID / password or account status.` |

**Test Data:** operator lacking CodeIntelligence data access (e.g., READER-only operator)
**Postconditions:** Not green; no state change.
**Automation:** ❌ — verified via runtime verification when a 403-returning credential is available.

---

### TC-F1-03: Test Connection — credential OK → ✅ success ONLY when HTTP 200

| Field | Value |
|-------|-------|
| **ID** | TC-F1-03 |
| **Priority** | High |
| **Type** | Functional — Happy Path |
| **Requirement** | FIX #1 (buildTestResult L50-52); guide §7 Scenario B.1 |
| **Preconditions** | Valid credential (correct password, operator enabled) stored in SecretStorage |
| **Level** | UT (buildTestResult mapping) + E2E manual — see TC-SB-01 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click **Test Connection** with valid credential | `GET {base}/api/v1/data/D_OperatorID` with auth header → HTTP 200 |
| 2 | Observe `pegaTestResult` | `success: true`; message = `✅ Connected — credentials accepted (HTTP 200).` |

**Test Data:** valid operator credential (post-fix of password/account)
**Postconditions:** Success reported — real credential acceptance, not network reachability.
**Automation:** ❌ — covered by runtime Scenario B.

---

### TC-F1-04: Test Connection — timeout / network error → ❌ "Connection failed"

| Field | Value |
|-------|-------|
| **ID** | TC-F1-04 |
| **Priority** | High |
| **Type** | Functional — Exception Flow (network) |
| **Requirement** | FIX #1 (test() catch L43-45); guide §4 FIX #1 |
| **Preconditions** | Endpoint unreachable (firewall blocks) OR response exceeds 8s timeout |
| **Level** | UT + E2E manual |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click **Test Connection** with unreachable endpoint (e.g., wrong port) OR simulate >8s response | fetch throws (`AbortSignal.timeout(8000)` fires / connection refused) |
| 2 | Observe `pegaTestResult` | `success: false`; message starts with `Connection failed: ` + `err.message` (e.g., `Connection failed: TimeoutError: The operation was aborted due to timeout`) |

**Test Data:** endpoint `https://unreachable-host.example.com/prweb` (timeout) or blocked host (refused)
**Postconditions:** Not green; error surfaced; no state change.

---

### TC-F1-05: No false-green for non-200 statuses — success ONLY on 200 (regression guard)

| Field | Value |
|-------|-------|
| **ID** | TC-F1-05 |
| **Priority** | High |
| **Type** | Regression — negative |
| **Requirement** | FIX #1 — old bug: `success = res.status > 0` made 401/403/404/500 all green (guide §3 table #1) |
| **Preconditions** | `buildTestResult()` implementation (L49-57) |
| **Level** | UT (pure function — directly executable) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `buildTestResult(500)` | `success: false`; message = `❌ Unexpected response (HTTP 500).` |
| 2 | Call `buildTestResult(404)` | `success: false`; message = `❌ Unexpected response (HTTP 404).` |
| 3 | Call `buildTestResult(200)` / `(401)` / `(403)` | true / false / false respectively — ONLY 200 returns true |

**Test Data:** status values 200, 401, 403, 404, 500
**Postconditions:** Any non-200 status can never produce a green "reachable" message.
**Automation:** ❌ (pure-function unit, not yet in test files) — regression-verified by code review: `success` no longer `res.status > 0`.

---

## 2. FIX #2 — Hierarchy resolver fail-loud (PegaHierarchyResolver)

**Fixed code:** `extension/src/services/PegaHierarchyResolver.ts` — `resolveOperator()` isAuthError re-throw (line 89-93), `isAuthError()` helper (line 100-103), `resolvePegaHierarchy()` throws when `!appName` (line 59-64). Requirement source: guide §4 FIX #2.

**Behavior contract:**
- Auth errors (401/403/unauthorized/forbidden — case-insensitive) MUST re-throw as `Pega authentication failed while resolving operator "{opId}": {err.message}`.
- Non-auth errors (not found, network down) stay soft — `accessGroup=""` returned (pre-existing behavior).
- No `PegaApp` fallback: unresolvable `appName` → throw `Cannot resolve Pega Application for operator "{operatorId}" (accessGroup="..."). Verify credentials/permissions for the CodeIntelligence service.`

---

### TC-F2-01: resolveOperator — getRuleByInsKey 401 → throw "Pega authentication failed..."

| Field | Value |
|-------|-------|
| **ID** | TC-F2-01 |
| **Priority** | Critical |
| **Type** | Functional — Exception Flow (auth) |
| **Requirement** | FIX #2a (resolveOperator L89-93, isAuthError L100-103); guide §3 table #2, §10 |
| **Preconditions** | `resolvePegaHierarchy` called with a client whose `getRuleByInsKey` rejects `Error("HTTP 401 Unauthorized")` |
| **Level** | UT — ✅ AUTOMATED |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Stub `getRuleByInsKey` → throw `Error("HTTP 401 Unauthorized")`; call `resolvePegaHierarchy(client, "user@org", "C:\work\pega", noopLog)` | isAuthError matches "401" → log `Step 1 FAIL (auth)` → throw |
| 2 | Assert rejection | `rejects.toThrow(/Pega authentication failed while resolving operator "user@org"/)` |

**Test Data:** operator `user@org`; error `HTTP 401 Unauthorized`
**Postconditions:** 401 is NOT swallowed — old behavior (return `accessGroup=""` → fallback `PegaApp`) is gone.
**Automation:** ✅ `pega-hierarchy-resolver.test.ts > re-throws 401 as a Pega authentication failure` — PASS (2ms, 2026-10-09).

---

### TC-F2-02: resolveOperator — 403 / unauthorized / forbidden → throw (all 4 keywords)

| Field | Value |
|-------|-------|
| **ID** | TC-F2-02 |
| **Priority** | Critical |
| **Type** | Functional — Exception Flow (auth) |
| **Requirement** | FIX #2a (isAuthError L100-103); guide §4 FIX #2a |
| **Preconditions** | `getRuleByInsKey` rejects with any auth-flavored error |
| **Level** | UT — ✅ AUTOMATED |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Stub throws `Error("HTTP 403 Forbidden")`; call `resolvePegaHierarchy` | isAuthError matches → throw `Pega authentication failed...` |
| 2 | Boundary: error messages `Unauthorized`, `UNAUTHORIZED` (uppercase), `forbidden` (no code) | All match — `isAuthError` lowercases the message then checks 401/403/unauthorized/forbidden |

**Test Data:** error messages: `HTTP 403 Forbidden`, `Unauthorized`, `UNAUTHORIZED`, `forbidden`
**Postconditions:** Every auth-flavored failure fails loud, regardless of message casing/format.
**Automation:** ✅ `pega-hierarchy-resolver.test.ts > re-throws 403 as a Pega authentication failure` — PASS (0ms, 2026-10-09).

---

### TC-F2-03: resolveOperator — non-auth error (not found / network) → soft: accessGroup="", NO auth exception

| Field | Value |
|-------|-------|
| **ID** | TC-F2-03 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Requirement** | FIX #2a (catch soft path L94-95); guide §4 FIX #2a ("chỉ not found mới được coi là mềm") |
| **Preconditions** | `getRuleByInsKey` rejects with a NON-auth error (e.g., `Error("network down")`, rule not found) |
| **Level** | UT — ✅ AUTOMATED |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Stub throws `Error("network down")`; call `resolvePegaHierarchy(client, "user@org", root, noopLog)` | isAuthError does NOT match → soft return `{insKey, accessGroup: ""}` |
| 2 | Assert overall rejection | `rejects.toThrow(/Cannot resolve Pega Application/)` AND `rejects.not.toThrow(/authentication failed/)` |

**Test Data:** error message `network down` (non-auth); operator `user@org`
**Postconditions:** Pre-existing soft behavior for non-auth errors preserved; the run then fails loudly with the appName error (TC-F2-04) — never with a fake success.
**Automation:** ✅ `pega-hierarchy-resolver.test.ts > treats non-auth errors as soft (no auth exception surfaced)` — PASS (0ms, 2026-10-09).

---

### TC-F2-04: resolvePegaHierarchy — appName unresolvable → throw "Cannot resolve Pega Application..." (no PegaApp fallback)

| Field | Value |
|-------|-------|
| **ID** | TC-F2-04 |
| **Priority** | Critical |
| **Type** | Functional — Exception Flow |
| **Requirement** | FIX #2b (L59-64); guide §2 symptom 2, §3 table #2 |
| **Preconditions** | Operator resolves softly (accessGroup empty) so Step 2 is skipped; no appName from any source |
| **Level** | UT — ✅ AUTOMATED |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Stub `getRuleByInsKey` → return `{ pyAccessGroup: "", pyDefaultAccessGroup: "" }`; call `resolvePegaHierarchy` | accessGroup="" → Step 2 skipped → appName="" → L59-64 throws |
| 2 | Assert rejection messages | `rejects.toThrow(/Cannot resolve Pega Application for operator "user@org"/)` AND `rejects.toThrow(/Verify credentials\/permissions/)` |

**Test Data:** operator rule with empty access group (simulates soft-resolution failure)
**Postconditions:** Fake `appName: "PegaApp"` fallback (old L181) is REMOVED — no fabricated app name ever returned.
**Automation:** ✅ `pega-hierarchy-resolver.test.ts > throws when appName cannot be resolved (no PegaApp fallback)` — PASS (2ms, 2026-10-09).

---

## 3. FIX #3 — Fetch Context fail-loud + no bad file write (PegaSettingsHandler.fetchContext + PegaContextClient)

**Fixed code:** `extension/src/panels/settings/handlers/PegaSettingsHandler.ts` — `fetchContext()` try/catch posts `pegaContextFetched success:false` (line 60-78, catch at L75-77). `extension/src/services/pega/PegaContextClient.ts` — `fetchAndSavePegaContext()` does NOT swallow: `resolveDeterministicPegaHierarchy` called unguarded (L111), `writeFile(pega-project.json)` ONLY after successful resolve (L116-124), `persistProjectId` after that (L125). Requirement source: guide §4 FIX #3.

**Behavior contract:**
- When `fetchAndSavePegaContext` throws (now 401 propagates from FIX #2), user sees `❌ Fetch Pega Context failed: {err.message}` — never a green message.
- `pega-project.json` is NEVER overwritten on resolve failure — no `applicationName="PegaApp"`, `applicationVersion=""`, `accessGroup=""` garbage.
- Success path posts `Fetched context: App "{real app}" ({N} CaseTypes) → saved {path}` with `success: true`.

---

### TC-F3-01: fetchAndSavePegaContext throws → fetchContext posts pegaContextFetched success:false

| Field | Value |
|-------|-------|
| **ID** | TC-F3-01 |
| **Priority** | Critical |
| **Type** | Functional — Exception Flow (auth) |
| **Requirement** | FIX #3 (fetchContext try/catch L66-77); guide §4 FIX #3, §7 Scenario A.2 |
| **Preconditions** | Credential 401 → `resolveDeterministicPegaHierarchy` throws (via FIX #2); workspace folder open |
| **Level** | UT (not automated) + E2E manual — see TC-SA-02 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click **Fetch Pega Context** with 401 credential | `fetchAndSavePegaContext` → `resolveDeterministicPegaHierarchy` THROWS `Pega authentication failed while resolving operator "duc.nguyen.10@fecredit.com.vn": ...` |
| 2 | Observe catch block (L75-77) | postMessage `{ type: "pegaContextFetched", success: false, message: "❌ Fetch Pega Context failed: Pega authentication failed while resolving operator ..." }` |
| 3 | Verify message shown in webview | ❌ red message — NOT green; old uncontrolled propagation (no try/catch) is gone |

**Test Data:** operator `duc.nguyen.10@fecredit.com.vn` (401 credential)
**Postconditions:** User informed of failure; no partial state written.
**Automation:** ❌ no unit test for fetchContext — verified via runtime Scenario A.

---

### TC-F3-02: resolve failure → pega-project.json NOT overwritten (writeFile only after resolve)

| Field | Value |
|-------|-------|
| **ID** | TC-F3-02 |
| **Priority** | Critical |
| **Type** | Functional — Exception Flow (data integrity) |
| **Requirement** | FIX #3 (PegaContextClient L111 resolve, L116-124 projectData+writeFile, L125 persistProjectId); guide §7 Scenario A.2 |
| **Preconditions** | Workspace has an existing `pega-project.json` (record its content + mtime before test); credential 401 |
| **Level** | E2E manual — see TC-SA-02 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Record content + mtime of `<workspace>/pega-project.json` | Baseline captured |
| 2 | Click **Fetch Pega Context** → resolution throws (401) | Exception propagates BEFORE `projectData` build (L116) and `writeFile` (L123-124) |
| 3 | Compare file after | `pega-project.json` content + mtime UNCHANGED — no `applicationName="PegaApp"`, `applicationVersion=""`, `accessGroup=""` garbage write |
| 4 | Verify side effects | `persistProjectId` (L125) NOT reached — `.code-intel/project.json` unchanged too |

**Test Data:** existing pega-project.json in workspace root (any valid prior content)
**Postconditions:** No file corruption; old file preserved intact.
**Automation:** ❌ — verified via runtime Scenario A (file comparison step).

---

### TC-F3-03: fetch success → postMessage success:true with REAL application

| Field | Value |
|-------|-------|
| **ID** | TC-F3-03 |
| **Priority** | Critical |
| **Type** | Functional — Happy Path |
| **Requirement** | FIX #3 (success path L68-74); FIX #2 (real appName guaranteed); guide §7 Scenario B.2 |
| **Preconditions** | Valid credential; operator resolves to a real app via hierarchy (e.g., `FECreditCA` / `03.01.01`) |
| **Level** | UT (not automated) + E2E manual — see TC-SB-02 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click **Fetch Pega Context** with valid credential | `resolveDeterministicPegaHierarchy` returns real `appName` (never "PegaApp") |
| 2 | Observe `pegaContextFetched` message | `{ success: true, message: "Fetched context: App \"FECreditCA\" (N CaseTypes) → saved <path>" }` |
| 3 | Verify `pega-project.json` written AFTER success | File contains real `applicationName` / `applicationVersion` / `accessGroup` — NOT `PegaApp` |

**Test Data:** valid credential; expected real app per guide §7 B (e.g., `FECreditCA`, accessGroup `FECreditCA:Administrators`)
**Postconditions:** `pega-project.json` + `.code-intel/project.json` persisted with real app identity.
**Automation:** ❌ — covered by runtime Scenario B.

---

### TC-F3-04: no workspace folder → guard message, no client instantiation

| Field | Value |
|-------|-------|
| **ID** | TC-F3-04 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | FIX #3 (early-return guard L61-65); guide §4 FIX #3 context |
| **Preconditions** | No workspace folder open (`vscode.workspace.workspaceFolders` empty) |
| **Level** | UT (not automated) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger Fetch Pega Context with no workspace open | Guard fires BEFORE client creation / network call |
| 2 | Observe `pegaContextFetched` | `{ success: false, message: "No workspace folder open to save Pega context." }` |

**Test Data:** empty workspace (no folder)
**Postconditions:** No network request fired; no state change.

---

## 4. FIX #4 — Discovery without hardcode (PegaCodeIntelDiscovery.resolveAppInfo)

**Fixed code:** `extension/src/services/PegaCodeIntelDiscovery.ts` — `resolveAppInfo()` reads `applicationVersion` field (L58), throws when unresolvable (L66-69), hardcode `HRAppsV2:01.01` REMOVED. Requirement source: guide §4 FIX #4.

**Behavior contract:**
- Priority: `pega-project.json` (appName/applicationName + version/appVersion/applicationVersion) → config `sdlcAgents.pegaAppName`/`pegaAppVersion` → THROW.
- Throw message: `Cannot resolve Pega application for discovery: no valid appName/appVersion in pega-project.json or sdlcAgents.pegaAppName/pegaAppVersion. Run 'Fetch Pega Context' first.` — BEFORE any backend call.
- NEVER returns `HRAppsV2:01.01` hardcoded.
- Deviation (documented in RUN-LOG): config namespace is `sdlcAgents` (guide §4 wrote `kiroSdlc` — stale reference; codebase uses `sdlcAgents` per extension.ts + config-namespace-migration.ts).

---

### TC-F4-01: pega-project.json with appName+applicationVersion → resolves correctly

| Field | Value |
|-------|-------|
| **ID** | TC-F4-01 |
| **Priority** | High |
| **Type** | Functional — Happy Path |
| **Requirement** | FIX #4 (file read L53-61); guide §4 FIX #4 |
| **Preconditions** | Workspace root contains `pega-project.json` with `{ "applicationName": "FECreditCA", "applicationVersion": "03.01.01" }` |
| **Level** | UT (file-based, not automated) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create `pega-project.json` with `applicationName` + `applicationVersion` fields (shape written by PegaContextClient) | File exists and parses |
| 2 | Trigger discovery (`resolveAppInfo(root)`) | Returns `{ appName: "FECreditCA", appVersion: "03.01.01" }` — reads BOTH fields incl. `applicationVersion` (old code read only `version || appVersion` → missed it) |

**Test Data:** `pega-project.json`: `{"applicationName":"FECreditCA","applicationVersion":"03.01.01"}`; also `{".kiro/pega-project.json"}` candidate path
**Postconditions:** Discovery targets the REAL app from the project file.
**Automation:** ❌ file-based read not in test files — verified by code review (L57-59 reads `json.applicationVersion`).

---

### TC-F4-02: config sdlcAgents.pegaAppName/pegaAppVersion set → resolves from config

| Field | Value |
|-------|-------|
| **ID** | TC-F4-02 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Requirement** | FIX #4 (config fallback L62-65); guide §4 FIX #4 (deviation: namespace sdlcAgents) |
| **Preconditions** | No valid `pega-project.json`; settings `sdlcAgents.pegaAppName = "HRAppsV2"`, `sdlcAgents.pegaAppVersion = "01.01"` |
| **Level** | UT — ✅ AUTOMATED |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Mock config returns `pegaAppName: "HRAppsV2"`, `pegaAppVersion: "01.01"`; run `disc.run(...)` with root lacking pega-project.json | `resolveAppInfo` falls through file candidates → resolves from CONFIG |
| 2 | Assert backend request body | `body.appName === "HRAppsV2"` — value comes from config source, NOT from a hardcoded `return` |

**Test Data:** config `sdlcAgents.pegaAppName="HRAppsV2"`, `sdlcAgents.pegaAppVersion="01.01"`
**Postconditions:** Config-based app resolution works; no hardcode involved.
**Automation:** ✅ `pega-codeintel-discovery.test.ts > POSTs to /api/v1/pega/discover and returns a summary` — PASS (4ms, 2026-10-09; asserts body.appName from mock config).

---

### TC-F4-03: both sources absent → throw "Cannot resolve Pega application for discovery..." BEFORE any backend call

| Field | Value |
|-------|-------|
| **ID** | TC-F4-03 |
| **Priority** | Critical |
| **Type** | Functional — Exception Flow |
| **Requirement** | FIX #4 (throw L66-69); guide §4 FIX #4, §7 Scenario A.4 |
| **Preconditions** | No valid `pega-project.json` AND config `sdlcAgents.pegaAppName`/`pegaAppVersion` resolve to "" |
| **Level** | UT — ✅ AUTOMATED |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Mock config returns "" for pegaAppName/pegaAppVersion; run `disc.run(...)` | `resolveAppInfo` throws at L66-69 |
| 2 | Assert rejection message | `rejects.toThrow(/Cannot resolve Pega application for discovery/)` |
| 3 | Assert no backend call | `expect(fetchMock).not.toHaveBeenCalled()` — fails loud BEFORE attempting `/api/v1/pega/discover` |

**Test Data:** config `sdlcAgents.pegaAppName=""`, `sdlcAgents.pegaAppVersion=""`; root without pega-project.json
**Postconditions:** Error surfaced to caller (`runPegaCodeIntelDiscovery` chain logs "⚠️ skipped"); no call to a wrong app.
**Automation:** ✅ `pega-codeintel-discovery.test.ts > throws when no app info can be resolved (no hardcoded fallback)` — PASS (1ms, 2026-10-09).

---

### TC-F4-04: hardcode HRAppsV2:01.01 removed — regression guard

| Field | Value |
|-------|-------|
| **ID** | TC-F4-04 |
| **Priority** | High |
| **Type** | Regression — negative |
| **Requirement** | FIX #4 — old bug: `return { appName: "HRAppsV2", appVersion: "01.01" }` fallback (old L292) called API into the WRONG app (guide §3 table #3, §9) |
| **Preconditions** | `resolveAppInfo()` implementation (L48-70) |
| **Level** | UT + static analysis |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Grep `resolveAppInfo` in PegaCodeIntelDiscovery.ts for hardcoded app | NO `return { appName: "HRAppsV2", appVersion: "01.01" }` — only throw remains (L66-69) |
| 2 | Combine with TC-F4-03 execution | Unresolvable app info → throw, never silent HRAppsV2 default |

**Test Data:** —
**Postconditions:** Discovery can never silently target `HRAppsV2:01.01`; real log previously showed `[PegaDiscovery] → .../api/CodeIntelligence/v1 app=HRAppsV2:01.01` — this shape no longer originates from hardcode.
**Automation:** ✅ via TC-F4-03 test (throw replaces hardcode) + grep verification.

---

## 5. SCENARIO A — credential đang 401 (trạng thái hiện tại của operator `duc.nguyen.10@fecredit.com.vn`)

**Requirement source:** guide §7 Scenario A, §10. **Level: E2E — manual** trên extension thật (VS Code/Kiro) với server Pega thật `https://fecrdt-coll-stg1-internal.pegacloud.io/prweb`, proxy manual `10.30.168.246:9090`. **Trạng thái hiện tại: DEFERRED — BLOCKED (credential 401)** — xem TEST-REPORT.md §4.

**Mục tiêu tổng:** sau fix, cả 3 nút NHẤT QUÁN báo lỗi auth rõ ràng khi credential 401 — không còn "2 nút xanh, index 401" (guide §10).

---

### TC-SA-01: Test Connection → PHẢI ❌ auth (trước fix: xanh giả "reachable")

| Field | Value |
|-------|-------|
| **ID** | TC-SA-01 |
| **Priority** | Critical |
| **Type** | E2E — manual (auth) |
| **Requirement** | FIX #1; guide §7 A.1 |
| **Preconditions** | Extension v1.47.0+ built; credential 401 (hiện tại) |
| **Level** | E2E — manual |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Mở Settings → Pega → click **Test Connection** | Request `GET {base}/api/v1/data/D_OperatorID` CÓ auth header |
| 2 | Chờ ≤ 8s | HTTP 401 nhận về |
| 3 | Quan sát message | ❌ `Authentication failed (HTTP 401). Check Operator ID / password or account status.` — KHÔNG còn xanh giả |

**Postconditions:** Không đổi state; người dùng biết ngay credential hỏng.

---

### TC-SA-02: Fetch Pega Context → PHẢI ❌ + KHÔNG ghi file PegaApp

| Field | Value |
|-------|-------|
| **ID** | TC-SA-02 |
| **Priority** | Critical |
| **Type** | E2E — manual (auth + data integrity) |
| **Requirement** | FIX #2 + FIX #3; guide §7 A.2 |
| **Preconditions** | Credential 401; có sẵn `pega-project.json` cũ trong workspace (để so sánh) |
| **Level** | E2E — manual |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Ghi lại content + mtime `pega-project.json` | Baseline |
| 2 | Click **Fetch Pega Context** | Resolution throws (FIX #2) → catch posts ❌ |
| 3 | Quan sát message | ❌ `Fetch Pega Context failed: Pega authentication failed while resolving operator "duc.nguyen.10@fecredit.com.vn": ...` |
| 4 | So sánh file | `pega-project.json` KHÔNG đổi — KHÔNG có `applicationName="PegaApp"` / `applicationVersion=""` / `accessGroup=""` |

**Postconditions:** File cũ nguyên vẹn; `.code-intel/project.json` cũng không đổi (persistProjectId không chạm).

---

### TC-SA-03: Index Source Code → vẫn ❌ 401 (hành vi ĐÚNG, giữ nguyên)

| Field | Value |
|-------|-------|
| **ID** | TC-SA-03 |
| **Priority** | High |
| **Type** | E2E — manual (regression) |
| **Requirement** | guide §7 A.3, §10 (Index đã throw đúng trước fix — không thay đổi) |
| **Preconditions** | Credential 401; workspace Pega project |
| **Level** | E2E — manual |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Chạy **Index Source Code** | Catalog export fail 401 → fallback BFS crawl → fatal |
| 2 | Quan sát Output channel "SDLC Indexing" | `❌ Fatal error: Crawl plan failed: Unauthorized` — lỗi 401 hiển thị rõ (đúng, giữ nguyên), KHÔNG silent success |

**Postconditions:** Không đổi hành vi index — regression pass khi vẫn báo đỏ.

---

### TC-SA-04: Discovery → báo "Cannot resolve Pega application..." thay vì HRAppsV2

| Field | Value |
|-------|-------|
| **ID** | TC-SA-04 |
| **Priority** | Critical |
| **Type** | E2E — manual (auth) |
| **Requirement** | FIX #4; guide §7 A.4 |
| **Preconditions** | Credential 401; `pega-project.json` không có app info hợp lệ |
| **Level** | E2E — manual |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger discovery (qua pipeline Index Source Code) | `resolveAppInfo` throw → caller log "⚠️ skipped" |
| 2 | Quan sát log `[PegaDiscovery]` | KHÔNG còn `app=HRAppsV2:01.01` từ hardcode; báo `Cannot resolve Pega application for discovery: ... Run 'Fetch Pega Context' first.` |

**Postconditions:** Không gọi API vào app sai `HRAppsV2` nữa.

---

## 6. SCENARIO B — credential hợp lệ (sau khi user sửa password / mở khoá operator)

**Requirement source:** guide §7 Scenario B, §10. **Level: E2E — manual** trên extension thật với server Pega thật. **Trạng thái hiện tại: DEFERRED — BLOCKED (credential thực tế đang 401)** — xem TEST-REPORT.md §4.

---

### TC-SB-01: Test Connection → ✅ 200

| Field | Value |
|-------|-------|
| **ID** | TC-SB-01 |
| **Priority** | Critical |
| **Type** | E2E — manual (happy path) |
| **Requirement** | FIX #1; guide §7 B.1 |
| **Preconditions** | Credential HỢP LỆ (password đúng, operator enabled — sau khi user sửa) |
| **Level** | E2E — manual |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Mở Settings → Pega → click **Test Connection** | `GET {base}/api/v1/data/D_OperatorID` CÓ auth → HTTP 200 |
| 2 | Quan sát message | ✅ `Connected — credentials accepted (HTTP 200).` |

**Postconditions:** Success phản ánh credential thật (không chỉ network reachability).

---

### TC-SB-02: Fetch Pega Context → ✅ ghi pega-project.json với app THẬT

| Field | Value |
|-------|-------|
| **ID** | TC-SB-02 |
| **Priority** | Critical |
| **Type** | E2E — manual (happy path) |
| **Requirement** | FIX #2 + FIX #3; guide §7 B.2 |
| **Preconditions** | Credential hợp lệ |
| **Level** | E2E — manual |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click **Fetch Pega Context** | Hierarchy resolve thành công với app thật |
| 2 | Quan sát message | ✅ `Fetched context: App "FECreditCA" (N CaseTypes) → saved <path>` |
| 3 | Mở `pega-project.json` | `applicationName="FECreditCA"`, `applicationVersion="03.01.01"` (ví dụ theo guide §7 B), `accessGroup="FECreditCA:Administrators"` — KHÔNG phải `PegaApp` |

**Test Data:** app name/version THẬT phụ thuộc response của server Pega — giá trị FECreditCA/03.01.01 là ví dụ minh họa từ guide §7 B, KHÔNG hardcode kỳ vọng cứng.
**Postconditions:** `pega-project.json` + `.code-intel/project.json` chứa app identity thật.

---

### TC-SB-03: Index Source Code → crawl bình thường

| Field | Value |
|-------|-------|
| **ID** | TC-SB-03 |
| **Priority** | Critical |
| **Type** | E2E — manual (happy path) |
| **Requirement** | guide §7 B.3, §10 (3 nút nhất quán khi credential đúng) |
| **Preconditions** | Credential hợp lệ; `pega-project.json` đã có app thật (từ TC-SB-02) |
| **Level** | E2E — manual |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Chạy **Index Source Code** | Catalog export HOẶC BFS crawl chạy bình thường — không 401 |
| 2 | Quan sát log | Rules được crawl + ingest; discovery summary `✅ Pega CodeIntelligence discovery: N service package(s), N method(s), N linked rule(s) indexed.` với app thật |

**Postconditions:** End-to-end pass với credential hợp lệ — cả 3 nút nhất quán.

---

## 7. Traceability Matrix — Fix → Automated Tests → TC-ID → Scenario

| Fix | File:line | Automated Test File — Test | TC-ID | Runtime Scenario |
|-----|-----------|---------------------------|-------|------------------|
| FIX #1 — Test Connection auth-aware | PegaSettingsHandler.ts — test() L31-46, buildTestResult L49-57 | ❌ (no unit test file for PegaSettingsHandler) | TC-F1-01, TC-F1-02, TC-F1-03, TC-F1-04, TC-F1-05 | TC-SA-01, TC-SB-01 |
| FIX #2a — resolveOperator auth re-throw | PegaHierarchyResolver.ts — L89-93, isAuthError L100-103 | ✅ pega-hierarchy-resolver.test.ts — re-throws 401 / re-throws 403 / treats non-auth soft | TC-F2-01, TC-F2-02, TC-F2-03 | TC-SA-02, TC-SA-03 |
| FIX #2b — no PegaApp fallback | PegaHierarchyResolver.ts — L59-64 (throw when !appName) | ✅ pega-hierarchy-resolver.test.ts — throws when appName cannot be resolved | TC-F2-04 | TC-SA-04 |
| FIX #3 — fetchContext fail-loud + no bad write | PegaSettingsHandler.ts — fetchContext L60-78; PegaContextClient.ts — L106-128 (resolve L111, writeFile L123-124) | ❌ (no unit test file for fetchContext) | TC-F3-01, TC-F3-02, TC-F3-03, TC-F3-04 | TC-SA-02, TC-SB-02 |
| FIX #4 — no hardcode + read applicationVersion | PegaCodeIntelDiscovery.ts — resolveAppInfo L48-70 | ✅ pega-codeintel-discovery.test.ts — POSTs summary / throws backend error / throws no app info | TC-F4-01, TC-F4-02, TC-F4-03, TC-F4-04 | TC-SA-04, TC-SB-02, TC-SB-03 |

**Automated test inventory (7 tests, all PASS 2026-10-09):**

| Test File | Test | Pass | Maps To |
|-----------|------|------|---------|
| pega-hierarchy-resolver.test.ts | re-throws 401 as a Pega authentication failure | ✅ 2ms | TC-F2-01 |
| pega-hierarchy-resolver.test.ts | re-throws 403 as a Pega authentication failure | ✅ 0ms | TC-F2-02 |
| pega-hierarchy-resolver.test.ts | treats non-auth errors as soft (no auth exception surfaced) | ✅ 0ms | TC-F2-03 |
| pega-hierarchy-resolver.test.ts | throws when appName cannot be resolved (no PegaApp fallback) | ✅ 2ms | TC-F2-04 |
| pega-codeintel-discovery.test.ts | POSTs to /api/v1/pega/discover and returns a summary | ✅ 4ms | TC-F4-02 |
| pega-codeintel-discovery.test.ts | throws when backend returns an error | ✅ 2ms | TC-F4-04 (regression, callBackendDiscovery) |
| pega-codeintel-discovery.test.ts | throws when no app info can be resolved (no hardcoded fallback) | ✅ 1ms | TC-F4-03, TC-F4-04 |

---

## 8. Requirements Traceability Matrix (RTM)

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| Test Connection auth-aware: 401→❌, 403→❌, 200→✅, timeout→❌ | Guide §4 FIX #1, §7 A.1/B.1 | TC-F1-01..04, TC-SA-01, TC-SB-01 | ✅ |
| No false-green — success ONLY when HTTP 200 | Guide §3 table #1, §4 FIX #1 | TC-F1-05 | ✅ |
| resolveOperator auth fail-loud (401/403 re-throw) | Guide §4 FIX #2a, §10 | TC-F2-01, TC-F2-02 | ✅ |
| resolveOperator non-auth soft (accessGroup="", no throw) | Guide §4 FIX #2a | TC-F2-03 | ✅ |
| resolvePegaHierarchy !appName → throw (no PegaApp fallback) | Guide §4 FIX #2b, §2 symptom 2 | TC-F2-04, TC-SA-04 | ✅ |
| fetchContext fail-loud postMessage (success:false + ❌ message) | Guide §4 FIX #3, §7 A.2 | TC-F3-01, TC-SA-02 | ✅ |
| pega-project.json NOT overwritten on resolve failure | Guide §4 FIX #3, §7 A.2 | TC-F3-02, TC-SA-02 | ✅ |
| fetchContext success posts real app | Guide §4 FIX #3, §7 B.2 | TC-F3-03, TC-SB-02 | ✅ |
| fetchContext no-workspace guard | Guide §4 FIX #3 (context) | TC-F3-04 | ✅ |
| resolveAppInfo reads pega-project.json incl. applicationVersion | Guide §4 FIX #4 | TC-F4-01 | ✅ |
| resolveAppInfo config fallback sdlcAgents.pegaAppName/Version | Guide §4 FIX #4 (deviation: namespace sdlcAgents) | TC-F4-02 | ✅ |
| resolveAppInfo throws when unresolvable (no backend call) | Guide §4 FIX #4, §7 A.4 | TC-F4-03, TC-SA-04 | ✅ |
| Hardcode HRAppsV2:01.01 removed | Guide §3 table #3, §4 FIX #4, §9 | TC-F4-03, TC-F4-04, TC-SA-04 | ✅ |
| Index Source Code 401 behavior preserved (regression) | Guide §7 A.3/B.3, §10 | TC-SA-03, TC-SB-03 | ✅ |
| Consistency: 3 buttons agree on 401 / on valid credential | Guide §10 | TC-SA-01..04, TC-SB-01..03 | ✅ |

**Coverage Summary:**

| Category | Total | Covered | Coverage % |
|----------|-------|---------|------------|
| Fixes (FIX #1..#4) | 4 | 4 | 100% |
| Guide §7 verify scenarios (A/B) | 2 | 2 (defined) | 100% |
| Behavior contracts derived from guide | 15 | 15 | 100% |
| **Overall** | **21 requirement rows** | **21** | **100%** |

---

## 9. Appendix

### Test Execution Environment

| Item | Value |
|------|-------|
| Build | `npm run build` (tsc -p ./) — PASS exit 0 |
| Full suite | `npm test` (vitest run) — 250 files / 2400 tests PASS |
| Targeted | `npx vitest run src/__tests__/pega-hierarchy-resolver.test.ts src/__tests__/pega-codeintel-discovery.test.ts` — 7/7 PASS |
| Pega server | `https://fecrdt-coll-stg1-internal.pegacloud.io/prweb` |
| Operator | `duc.nguyen.10@fecredit.com.vn` (hiện tại 401) |
| Proxy | manual `10.30.168.246:9090` (Pega host KHÔNG trong bypass list) |
| Test report | TEST-REPORT.md (same folder) |

### Absolute Rules (guide §9 — enforced for all runtime verification)

- ❌ Không bỏ qua/tắt auth để "cho qua" 401; ❌ không hardcode app name/version/token; ❌ không sửa proxy/SecretStorage/global-fetch-patch.ts; ❌ không xoá pega-project.json; ❌ không đổi chữ ký hàm public; ❌ không vá case-by-case (vd hard-set FECreditCA).
- ✅ Sửa đúng cơ chế fail-loud — mục tiêu là PHƠI BÀY lỗi auth đúng, không phải làm nó biến mất.
