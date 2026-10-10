# User Guide (UG) — SA4E-349

## SDLC Agents 4 Enterprise — Pega CodeIntelligence: Clear Auth Failure Reporting

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-349 |
| Title | Pega CodeIntelligence: 3 bugs hide auth 401 failures (fixed) |
| Author | DEV Agent |
| Reviewer | BA Agent |
| Version | 1.0 |
| Date | 2026-10-09 |
| Status | Draft |
| Related Doc | FIX-GUIDE-pega-auth-silent-failures.md |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-09 | DEV Agent | Initial document — post-fix behavior of Test Connection / Fetch Pega Context / Index Source Code |

---

## 1. Overview

SA4E-349 fixed 3 bugs in the Pega CodeIntelligence flow that **hid authentication (auth) failures**. Before the fix, a rejected operator credential (HTTP 401) could appear as *success* in two of the three Pega buttons, while only "Index Source Code" showed the real error — an impossible-looking state that wasted user debugging time.

After the fix, all three buttons report **consistently and loudly**:

- If the credential is rejected → all three surface a clear auth error (no fake green).
- If the credential is valid → all three run correctly against the real Pega application.

### The 3 buttons

| Button | What it does |
|--------|--------------|
| **Test Connection** | Auth-aware connectivity check against the Pega server |
| **Fetch Pega Context** | Resolves the Pega hierarchy and writes `pega-project.json` |
| **Index Source Code** | Downloads and indexes Pega rules into the backend |

---

## 2. Before vs After

| # | Aspect | Before (buggy) | After (fixed) |
|---|--------|----------------|---------------|
| 1 | Test Connection | Fake green: any `status > 0` counted as success, so HTTP 401 still showed green "reachable" (no auth header sent) | Auth-aware: green **only** on HTTP 200; red on 401/403 with a clear message; red on other unexpected statuses |
| 2 | Fetch Pega Context | Swallowed the 401 and fell back to a fabricated app — wrote `pega-project.json` with `applicationName="PegaApp"`, empty version and accessGroup | Reports a clear error and **does NOT write/overwrite** `pega-project.json` when resolution fails |
| 3 | Discovery (during Index) | Hardcoded `HRAppsV2:01.01` when no app info was found — queried the wrong application | Throws "Cannot resolve Pega application for discovery... Run 'Fetch Pega Context' first." — never guesses |
| 4 | Index Source Code | Reported 401 in red (correct behavior) | Unchanged — still reports 401 in red (correct behavior) |
---

## 3. Usage — The 3 Buttons After the Fix

### 3.1 Test Connection

**Location:** Settings → SDLC Agents → Pega section → "Test Connection" button.

**What it does now (auth-aware, SA4E-349):** sends a real authenticated request —
`GET <pega-endpoint>/api/v1/data/D_OperatorID` with the stored credentials (Authorization header) —
instead of an unauthenticated reachability ping. Bounded 8s timeout.

**How to use:**

1. Configure the Pega endpoint, username, and password first (Settings → SDLC Agents → Pega).
2. Click **Test Connection**.
3. Read the result message in the settings panel.

**Possible results:**

| Result | Message | Meaning |
|--------|---------|---------|
| Green (success) | `✅ Connected — credentials accepted (HTTP 200).` | The Pega server accepted your credentials. Proceed to Fetch Pega Context. |
| Red (failure) | `❌ Authentication failed (HTTP 401). Check Operator ID / password or account status.` | Server rejected the credential — wrong/stale password or disabled operator. See Section 4. |
| Red (failure) | `❌ Authentication failed (HTTP 403). Check Operator ID / password or account status.` | Credential recognized but access forbidden. See Section 4. |
| Red (failure) | `❌ Unexpected response (HTTP <status>).` | Server responded but not as expected (e.g. 404, 5xx). Verify the endpoint URL and server health. |
| Red (failure) | `Connection failed: <error message>` | No response within 8s (network/proxy/server down). Check network and proxy configuration. |

> **Note:** The stored password lives in VS Code **SecretStorage** (workspace-scoped). Re-enter it via the settings panel — never edit files manually.

### 3.2 Fetch Pega Context

**Location:** Command palette → "SDLC Agents: Fetch Pega App Context" (or the Pega settings panel).

**What it does now (fail-loud, SA4E-349):** resolves the deterministic 5-step hierarchy —
Operator → Access Group → Application → Dependencies → Merged RuleSets —
then writes `pega-project.json` to the workspace root.

**How to use:**

1. Open your Pega project workspace folder and confirm Test Connection shows green.
2. Run **Fetch Pega Context**.
3. On success, inspect `pega-project.json` in the workspace root.

**Possible results:**

| Result | Message | Meaning |
|--------|---------|---------|
| Green (success) | `Fetched context: App "<real-app-name>" (<n> CaseTypes) → saved <file-path>` | Hierarchy resolved with the REAL application — `pega-project.json` written. |
| Red (failure) | `❌ Fetch Pega Context failed: <error message>` | Resolution failed (e.g. 401, Cannot resolve Pega Application). **`pega-project.json` is NOT written and NOT overwritten.** |
| Red (failure) | `No workspace folder open to save Pega context.` | No workspace folder is open. Open your Pega project folder first. |

> **Key guarantee (SA4E-349):** the file is written only AFTER a valid application name is resolved. A failed fetch never replaces an existing good `pega-project.json`.

### 3.3 Index Source Code

**Location:** Command palette → "SDLC Agents: Index Source Code".

**Behavior: unchanged by SA4E-349.** This button always reported auth errors in red
(correct behavior). On HTTP 401 it still shows a red error. The fix guarantees the
other two buttons no longer mask what this button already exposed honestly.

---

## 4. Troubleshooting — When You See HTTP 401

### 4.1 What a 401 means

HTTP 401 = the Pega server **rejected your credential**. Since SA4E-349, all three
buttons surface this honestly instead of hiding it. Typical root causes:

| Cause | Detail |
|-------|--------|
| Stale/wrong password | The password stored in VS Code SecretStorage (workspace-scoped) no longer matches the server — e.g. it was changed on the Pega side. |
| Operator auto-disabled | The operator rule records `pyOpAvailable:"false"` ("ID disabled") — the account is disabled on the Pega admin side. |

### 4.2 What to do — step by step

1. **Re-enter the Pega password**: Settings → SDLC Agents → Pega → type the current password (workspace-scoped) → Save.
2. **Check the operator status on the Pega admin**: confirm the operator is not disabled (not `pyOpAvailable:"false"`) and can log in to the Pega portal.
3. **Press Test Connection again** — it now reflects the TRUE auth state: green only on HTTP 200.
4. **After the credential is OK → run Fetch Pega Context** to write `pega-project.json` with the real application.
5. **Re-run Index Source Code** — indexing should now crawl normally.

> **Do NOT** edit SecretStorage files manually — use the settings panel only.

---

## 5. Discovery Requirements (before Index Source Code)

Before running **Index Source Code**, the extension must know which Pega application
to query. It resolves `appName`/`appVersion` from, in priority order:

1. **`pega-project.json`** (workspace root, or `.kiro/pega-project.json`) — written by
   "Fetch Pega Context". Fields read: `appName` or `applicationName`; `version`,
   `appVersion`, or `applicationVersion`.
2. **Configuration**: `sdlcAgents.pegaAppName` + `sdlcAgents.pegaAppVersion`.

If NEITHER source resolves, the extension throws:

```
Cannot resolve Pega application for discovery: no valid appName/appVersion in pega-project.json or sdlcAgents.pegaAppName/pegaAppVersion. Run 'Fetch Pega Context' first.
```

**Recommended flow:** run **Fetch Pega Context** first — it resolves the application
from your actual operator credentials and writes `pega-project.json`.

> ⚠️ **Config namespace is `sdlcAgents`** (e.g. `sdlcAgents.pegaAppName`, `sdlcAgents.pegaUsername`).
> The legacy namespace `kiroSdlc` has been migrated — older guides mentioning
> `kiroSdlc.pegaAppName` are stale and no longer apply.

---

## 6. What No Longer Happens (post-fix)

| # | Removed behavior |
|---|------------------|
| 1 | Fake green on **Test Connection** when credentials are rejected (HTTP 401) — it is now auth-aware. |
| 2 | `pega-project.json` being overwritten with the fabricated app `"PegaApp"` (empty version/accessGroup) — failed fetches never write. |
| 3 | Discovery silently querying the wrong application `HRAppsV2:01.01` — it now throws and asks you to run "Fetch Pega Context" first. |

---

## 7. Error Messages Reference

All messages below are exact (verbatim from the fixed code).

| # | Message | Meaning | User action |
|---|---------|---------|-------------|
| 1 | `✅ Connected — credentials accepted (HTTP 200).` | Test Connection succeeded — credentials accepted. | Proceed to Fetch Pega Context. |
| 2 | `❌ Authentication failed (HTTP 401). Check Operator ID / password or account status.` | Test Connection: server rejected the credential. | Follow Section 4 (re-enter password / check operator). |
| 3 | `❌ Authentication failed (HTTP 403). Check Operator ID / password or account status.` | Test Connection: credential recognized but forbidden. | Check operator permissions/account status on the Pega admin. |
| 4 | `❌ Unexpected response (HTTP <status>).` | Test Connection: unexpected status (not 200/401/403). | Verify the Pega endpoint URL and server health. |
| 5 | `❌ Fetch Pega Context failed: <error>` | Fetch Context: hierarchy resolution failed (e.g. 401). No file written. | Fix auth (Section 4), then retry Fetch Pega Context. |
| 6 | `Pega authentication failed while resolving operator "<opId>": <error>` | Fetch Context/Index: auth rejected while resolving the operator rule. | Fix credentials (Section 4), then retry. |
| 7 | `Cannot resolve Pega Application for operator "<opId>" (accessGroup="..."). Verify credentials/permissions for the CodeIntelligence service.` | Operator resolved but no application could be derived. | Verify credentials/permissions for the CodeIntelligence service. |
| 8 | `Cannot resolve Pega application for discovery: no valid appName/appVersion in pega-project.json or sdlcAgents.pegaAppName/pegaAppVersion. Run 'Fetch Pega Context' first.` | Index: no app info available for discovery. | Run "Fetch Pega Context" first (or set sdlcAgents.pegaAppName/pegaAppVersion). |
| 9 | `Pega Operator ID is not configured (sdlcAgents.pegaUsername). Set it before indexing.` | Index: no operator configured. | Set sdlcAgents.pegaUsername + password in Settings → SDLC Agents → Pega. |

---

## 8. FAQ

**Q: Why did Test Connection use to show green while Index Source Code returned 401?**
A: Before SA4E-349, Test Connection only checked network reachability (any `status > 0`
counted as success, no auth header sent), so an HTTP 401 still appeared green. It is
now auth-aware: green only on HTTP 200.

**Q: Why did Fetch Pega Context write "PegaApp"?**
A: The old hierarchy resolver swallowed the 401 and fell back to a fabricated app name
(`PegaApp`, empty version). Post-fix, it fails loudly and never writes the file on failure.

**Q: What do I need before Index Source Code?**
A: A valid `pega-project.json` (run "Fetch Pega Context" first) or configuration
`sdlcAgents.pegaAppName`/`sdlcAgents.pegaAppVersion` — plus a working credential
(Test Connection shows green).

**Q: Where is my Pega password stored, and can I edit it directly?**
A: In VS Code SecretStorage (workspace-scoped). Never edit files manually — re-enter
the password via Settings → SDLC Agents → Pega.

**Q: I still see 401 after re-entering the password. What next?**
A: Check the operator on the Pega admin — it may be auto-disabled (`pyOpAvailable:"false"`).
Re-enable it or contact your Pega admin, then press Test Connection again.