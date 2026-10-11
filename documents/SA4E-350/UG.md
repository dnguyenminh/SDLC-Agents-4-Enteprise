# User Guide (UG)

## SDLC-Agents-4-Enterprise — SA4E-350: Pega CodeIntelligence @baseclass Rules Indexing Fix

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-350 |
| Title | Pega CodeIntelligence: rules/query strips '@baseclass' appliesTo → 0 results; short insKey 404 on custom service |
| Author | DEV Agent |
| Reviewer | BA Agent |
| Version | 1.0 |
| Date | 2026-10-11 |
| Status | Final |
| Related BRD | N/A (Bugfix — Root Cause Probe) |
| Related FSD | N/A (Bugfix — API contracts verified via real server probe) |
| Related TDD | N/A (Bugfix — Fix documented in STATUS.json) |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-11 | DEV Agent | Initial document — behavior fix for @baseclass rules in Index Source Code |

---

## 1. Introduction

### 1.1 Purpose

This guide describes the behavior changes in version **1.48.0** for the **"Index Source Code"** feature in the SDLC-Agents-4-Enterprise VS Code extension. The fix resolves an issue where rules with `appliesTo = @baseclass` (such as `pzBulkActions`, `pzModalButtonsConfiguration`, `pxIsMobileDevice`) were not found during indexing, resulting in "❌ Not found" errors and incomplete Knowledge Base (KB) entries.

### 1.2 Audience

| Audience | What They Need |
|----------|---------------|
| End User / AI Agent | How to use "Index Source Code" and verify @baseclass rules are now indexed |
| System Administrator | Understand the new behavior, troubleshoot indexing issues |
| Developer | Extend or integrate with the Pega Rule Read Client |

### 1.3 Prerequisites

| Prerequisite | Version | Required |
|-------------|---------|----------|
| VS Code / Kiro | Latest | Yes |
| SDLC-Agents-4-Enterprise Extension | ≥ 1.48.0 | Yes |
| Pega Platform (Academy/Cloud/On-prem) | 8.6+ | Yes |
| Valid Pega Operator Credentials | — | Yes |

---

## 2. Getting Started

> **IMPORTANT:** This section is for users who **download the release** and run it. Do NOT include "clone repo" or "build from source" instructions here.

### 2.1 Quick Start

```bash
# Step 1: Install/Update Extension
# In Kiro/VS Code: Extensions → Search "sdlc-agents-4-enterprise" → Install/Update to 1.48.0
# Or install from .vsix:
code --install-extension sdlc-agents-4-enterprise-1.48.0.vsix

# Step 2: Configure Pega Connection
# Open Command Palette (Ctrl+Shift+P) → "SDLC: Configure Pega Connection"
# Enter: Base URL, Operator, Password

# Step 3: Run Index Source Code
# Command Palette → "SDLC: Index Source Code"
# Wait for completion notification

# Step 4: Verify
# Open Command Palette → "SDLC: Open Knowledge Base"
# Search for "pzBulkActions" or "pzModalButtonsConfiguration"
# Confirm full rule content is present (HTML/JSON)
```

### 2.2 System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| VS Code / Kiro | 1.85+ | Latest |
| Node.js (for extension host) | 18+ | 20+ |
| Memory | 4 GB | 8 GB |
| Disk | 500 MB | 1 GB |
| OS | Windows 10 / macOS 12 / Linux | Any modern OS |

### 2.3 Distribution Formats

| Format | How to Get | Use Case |
|--------|-----------|----------|
| VSIX (VS Code Marketplace) | `code --install-extension` or Marketplace UI | Standard install |
| VSIX (Direct Download) | GitHub Releases / Jira Artifact | Air-gapped / offline install |

### 2.4 Configuration Methods

The extension uses a single configuration file plus environment variables for secrets.

| Method | Priority | Best For |
|--------|----------|----------|
| `settings.json` (VS Code) | 1 (Highest) | User-specific overrides |
| `.env` file in workspace | 2 | Project-specific secrets |
| Environment variables | 3 (Lowest) | CI/CD, container deployments |

**Minimal Configuration (`settings.json`):**

```json
{
  "sdlc-agents.pega.baseUrl": "https://your-pega-instance.com/prweb",
  "sdlc-agents.pega.operator": "your-operator@domain"
}
```

**Secrets (`.env` or env vars):**

```bash
PEGA_PASSWORD=your-password
# OR
SDLC_AGENTS_PEGA_PASSWORD=your-password
```

### 2.5 Verify Configuration

| Check | Command / Action | Expected Result |
|-------|------------------|-----------------|
| 1. Extension loaded | `Ctrl+Shift+P` → "SDLC: Index Source Code" appears | Command visible |
| 2. Pega connection | Run "SDLC: Test Pega Connection" | "✅ Connected to Pega" |
| 3. Basic indexing | Run "SDLC: Index Source Code" | Progress bar → "Indexing complete" |
| 4. @baseclass rules | Check KB for `pzBulkActions` | Full rule content visible |

**Common Issues:**

| Symptom | Cause | Fix |
|---------|-------|-----|
| "❌ Not found" for pzBulkActions | Extension < 1.48.0 | Update to 1.48.0+ |
| "Authentication failed" | Wrong credentials in `.env` | Verify `PEGA_PASSWORD` |
| "Connection timeout" | Network/firewall | Check `baseUrl` reachable |

---

## 3. Configuration

### 3.1 Configuration File

Path: VS Code `settings.json` (User or Workspace scope)

Format: JSON (VS Code settings). Environment variables override for secrets.

### 3.2 Configuration Reference

#### Server Settings

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `sdlc-agents.pega.baseUrl` | string | "" | Pega PRWeb base URL (e.g., `https://instance.com/prweb`) |
| `sdlc-agents.pega.operator` | string | "" | Operator ID (e.g., `SSA@TGB`) |
| `sdlc-agents.pega.timeoutMs` | number | 30000 | HTTP timeout for Pega API calls |
| `sdlc-agents.pega.maxRetries` | number | 2 | Retries for transient network errors |

#### Indexing Settings

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `sdlc-agents.index.includeBaseclassRules` | boolean | true | **NEW in 1.48.0** — Enable indexing of @baseclass rules |
| `sdlc-agents.index.fullContentFollowUp` | boolean | true | **NEW in 1.48.0** — Fetch full rule content via /rules/instance |
| `sdlc-agents.index.concurrentLimit` | number | 5 | Parallel rule fetches during indexing |

### 3.3 Environment Variables

| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| `PEGA_PASSWORD` | Pega operator password | Yes | `secret123` |
| `SDLC_AGENTS_PEGA_PASSWORD` | Alternative password var | No | `secret123` |
| `PEGACLOUD_CLIENT_ID` | For OAuth (Pega Cloud) | No | `client-id` |
| `PEGACLOUD_CLIENT_SECRET` | For OAuth (Pega Cloud) | No | `client-secret` |

### 3.4 Configuration Examples

#### Minimal Configuration

```json
{
  "sdlc-agents.pega.baseUrl": "https://8b99ujcj.pegaacademy.net/prweb",
  "sdlc-agents.pega.operator": "SSA@TGB"
}
```

#### Full Configuration

```json
{
  "sdlc-agents.pega.baseUrl": "https://my-pega-instance.com/prweb",
  "sdlc-agents.pega.operator": "admin@MyApp",
  "sdlc-agents.pega.timeoutMs": 60000,
  "sdlc-agents.pega.maxRetries": 3,
  "sdlc-agents.index.includeBaseclassRules": true,
  "sdlc-agents.index.fullContentFollowUp": true,
  "sdlc-agents.index.concurrentLimit": 10
}
```

---

## 4. Usage

### 4.1 Index Source Code — Primary Feature

**Description:** Downloads Pega rules from the connected instance into the local Knowledge Base for AI-assisted development (code completion, rule lookup, impact analysis).

**How to use:**

```
Command Palette (Ctrl+Shift+P) → "SDLC: Index Source Code"
```

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `rulesetFilter` | string[] | No | Limit to specific rulesets (e.g., `["MyApp:01-01"]`) |
| `classFilter` | string[] | No | Limit to specific classes (e.g., `["Work-", "Data-"]`) |
| `includeBaseclass` | boolean | No | Override `includeBaseclassRules` setting (default: true) |

**Example:**

```json
// Via command palette with arguments (if using keybinding with args)
{
  "command": "sdlc-agents.indexSourceCode",
  "args": {
    "rulesetFilter": ["MyApp:01-01"],
    "includeBaseclass": true
  }
}
```

**Expected Output:**

```
[INFO] Starting source code index...
[INFO] Connected to https://8b99ujcj.pegaacademy.net/prweb as SSA@TGB
[INFO] Querying rules...
[INFO] Found 1,247 rules to index
[INFO] Processing @baseclass rules: pzBulkActions, pzModalButtonsConfiguration, pxIsMobileDevice...
[INFO] Fetching full content for 3 @baseclass rules via /rules/instance...
[INFO] Indexing complete: 1,247 rules (3 @baseclass with full content)
```

### 4.2 Query Knowledge Base

**Description:** Search indexed rules in the local KB.

**How to use:**

```
Command Palette → "SDLC: Open Knowledge Base"
→ Type rule name (e.g., "pzBulkActions")
→ Press Enter to open rule detail
```

**Expected Output:** Rule detail panel showing:
- Rule metadata (class, ruleset, version, pzInsKey)
- Full rule content (HTML, JSON, JavaScript as applicable)
- Cross-references

### 4.3 Verify @baseclass Rules Are Indexed (NEW in 1.48.0)

After indexing, verify the fix works:

1. Open KB (`SDLC: Open Knowledge Base`)
2. Search for `pzBulkActions`
3. **Expected:** Rule found with full HTML content (not just metadata)
4. Search for `pzModalButtonsConfiguration`
5. **Expected:** Rule found with full content
6. Search for `pxIsMobileDevice` (regression check)
6. **Expected:** Rule found (non-@baseclass, unchanged behavior)

---

## 5. Administration

### 5.1 Adding a New Pega Server

**Steps:**

1. Open `settings.json` (User or Workspace)
2. Add/update `sdlc-agents.pega.baseUrl` and `sdlc-agents.pega.operator`
3. Set `PEGA_PASSWORD` in `.env` or environment
4. Run "SDLC: Test Pega Connection" to verify
5. Run "SDLC: Index Source Code" to populate KB

### 5.2 Monitoring Indexing Health

**Commands:**

| Command | Purpose |
|---------|---------|
| `SDLC: Show Indexing Stats` | Total rules, last index time, @baseclass count |
| `SDLC: View Indexing Logs` | Detailed logs (output channel "SDLC Agents") |

**Log Location:** VS Code Output Panel → "SDLC Agents"

### 5.3 Hot-Reload Configuration

Changes to `settings.json` take effect immediately — no restart needed for most settings. Exception: `baseUrl`/`operator` changes require re-running "Test Pega Connection".

### 5.4 Clearing and Re-indexing

```
Command Palette → "SDLC: Clear Knowledge Base" → Confirm
Command Palette → "SDLC: Index Source Code"
```

Use when: KB corrupted, major Pega schema changes, or troubleshooting.

---

## 6. Index Source Code with @baseclass Rules (NEW in 1.48.0)

### 6.1 Problem Before Fix

Prior to version 1.48.0, the "Index Source Code" feature **failed to download rules with `appliesTo = @baseclass`**. The root cause was two-fold:

| Issue | Before Fix | After Fix (1.48.0) |
|-------|------------|---------------------|
| **Query behavior** | Client stripped `@baseclass` to empty string before querying `/api/CodeIntelligence/v1/rules/query` | `getObject()` keeps `@baseclass` verbatim in the triple query |
| **Server response** | Empty `appliesTo` → 0 results (server requires exact match) | `@baseclass` → 1 result (rule found) |
| **Compatibility retry** | N/A | `queryByTripleWithCompatRetry` retries with empty `appliesTo` **ONLY** when exact query misses **AND** original was `@baseclass` |
| **Rule content** | Query returns handle-only row (10 metadata fields, NO content) | Handle-only row → automatic `/rules/instance` follow-up with **full pzInsKey** (including `#timestamp`) → full rule JSON |
| **Short insKey** | Short pzInsKey (no `#`) sent to `/rules/instance` → **404** | Full pzInsKey used; short key → soft fallback to handle row (no error) |
| **Auth/5xx errors** | Silent retry or swallowed | **Fail-loud** — immediate rethrow, no silent retry |

**Affected Rules (Examples):**
- `pzBulkActions` (Rule-HTML-Section, @baseclass)
- `pzModalButtonsConfiguration` (Rule-HTML-Section, @baseclass)
- `pxIsMobileDevice` (Rule-Function, @baseclass — regression check)

### 6.2 New Behavior in 1.48.0

#### 6.2.1 @baseclass Verbatim Passthrough

When `getObject()` is called with `appliesTo: "@baseclass"`:

```
1. Client sends query to /api/CodeIntelligence/v1/rules/query with appliesTo="@baseclass" (verbatim)
2. Server returns 1 handle-only row with full pzInsKey (e.g., "RULE-HTML-SECTION @BASECLASS PZBULKACTIONS #20180713T134741.673 GMT")
3. fetchFullRuleIfHandleRow() detects handle-only row (keys ⊆ HANDLE_FIELDS + has pzInsKey)
4. Client calls /rules/instance with FULL pzInsKey (including #timestamp)
5. Server returns 200 + full rule JSON (~20 KB with HTML content)
6. Full rule returned to caller for KB indexing
```

#### 6.2.2 Compatibility Retry (Server Compat)

Some Pega instances may not support `@baseclass` in the query. The client handles this gracefully:

```
1. First attempt: appliesTo="@baseclass" → 0 results (exact miss)
2. Client detects: original was @baseclass + exact miss
3. Retry: appliesTo="" (empty) → 1 result (server compat)
4. Same handle-row follow-up → full rule fetched
```

**Important:** Retry is **ONLY** triggered when:
- Original `appliesTo` was exactly `@baseclass`
- First query returned 0 results (exact miss)

**Non-@baseclass rules (e.g., `Work-`, `Data-`):** No retry — behavior unchanged.

#### 6.2.3 Full Content Follow-Up

The `/rules/query` endpoint returns **handle-only rows** (10 fields: `pxObjClass`, `pxUpdateDateTime`, `pxUpdateOperator`, `pyClass`, `pyClassName`, `pyRuleAvailable`, `pyRuleName`, `pyRuleSet`, `pyRuleSetVersion`, `pzInsKey`). 

**New in 1.48.0:** When a handle-only row is detected, the client automatically:
1. Extracts the full `pzInsKey` (must contain `#timestamp`)
2. Calls `/rules/instance` with the full key
3. Returns the complete rule JSON (including `pyRuleHTML`, `pyRuleJSON`, `pyJavaScript`, etc.)
4. **Soft fallback:** If instance call fails (404, 500, network), returns the handle row — **no error thrown**

#### 6.2.4 Fail-Loud on Auth/Server Errors

| Error | Behavior |
|-------|----------|
| 401 Unauthorized | Immediate rethrow (`AuthenticationError`) — **no compat retry** |
| 403 Forbidden | Immediate rethrow — **no compat retry** |
| 5xx Server Error | Immediate rethrow — **no compat retry** |
| Network timeout | Retry per `maxRetries` config, then rethrow |

This prevents silent failures masking credential or server issues.

### 6.3 Configuration for @baseclass Behavior

| Setting | Default | Description |
|---------|---------|-------------|
| `sdlc-agents.index.includeBaseclassRules` | `true` | Enable/disable @baseclass indexing entirely |
| `sdlc-agents.index.fullContentFollowUp` | `true` | Enable/disable /rules/instance follow-up for full content |

**To disable @baseclass indexing (not recommended):**

```json
{
  "sdlc-agents.index.includeBaseclassRules": false
}
```

**To disable full content follow-up (fallback to handle-only):**

```json
{
  "sdlc-agents.index.fullContentFollowUp": false
}
```

---

## 7. Troubleshooting

### 7.1 Common Issues

| # | Symptom | Cause | Solution |
|---|---------|-------|----------|
| 1 | `@baseclass` rules still show "❌ Not found" | Extension version < 1.48.0 | Update to 1.48.0+ |
| 2 | `@baseclass` rules found but KB shows only metadata (no HTML) | `fullContentFollowUp` disabled or instance endpoint failing | Enable `sdlc-agents.index.fullContentFollowUp: true`; check logs for instance errors |
| 3 | "Authentication failed" during indexing | Wrong password in `.env` or env var | Verify `PEGA_PASSWORD` |
| 4 | "404 Rule not found" for specific @baseclass rule | Rule doesn't exist on target Pega instance | Verify rule exists in Pega (Designer Studio → Records) |
| 5 | Indexing hangs on @baseclass rules | Network timeout to `/rules/instance` | Increase `sdlc-agents.pega.timeoutMs` |
| 6 | Non-@baseclass rules stopped working | Regression (unlikely — verified in 1.48.0) | Check `includeBaseclassRules` not affecting other rules; file bug |

### 7.2 Error Codes

| Code | Message | Description | Action |
|------|---------|-------------|--------|
| `PEGARULE_401` | Authentication failed | Invalid credentials or expired session | Verify `PEGA_PASSWORD`; re-authenticate |
| `PEGARULE_404_INSTANCE` | Rule instance not found | `/rules/instance` returned 404 for full pzInsKey | Rule may be deleted; verify in Pega |
| `PEGARULE_500` | Pega server error | Internal server error on query or instance endpoint | Check Pega logs; retry later |
| `PEGARULE_TIMEOUT` | Request timeout | HTTP timeout exceeded | Increase `timeoutMs`; check network |
| `PEGARULE_HANDLE_ONLY` | Full content unavailable | Instance follow-up failed; fallback to handle row | Check logs; KB will have metadata only |

### 7.3 Logs

| Log Location | Content | Useful For |
|-------------|---------|------------|
| VS Code Output → "SDLC Agents" | Indexing progress, HTTP requests/responses, errors | Debugging indexing failures |
| Developer Tools Console (Ctrl+Shift+I) | Extension host errors, stack traces | Extension crashes |

**Key log patterns for @baseclass rules:**

```
[INFO] getObject: pyClassName=pzBulkActions, appliesTo=@baseclass
[INFO] Query sent: appliesTo="@baseclass" → 1 result
[DEBUG] Handle-only row detected, pzInsKey=RULE-HTML-SECTION @BASECLASS PZBULKACTIONS #20180713T134741.673 GMT
[INFO] Instance follow-up: /rules/instance?insKey=... → 200 (20,451 bytes)
[INFO] Full rule fetched for KB: pzBulkActions
```

### 7.4 FAQ

**Q: Why did @baseclass rules fail before 1.48.0?**  
A: The client stripped `@baseclass` to empty string before querying. The Pega custom service `/api/CodeIntelligence/v1/rules/query` matches `appliesTo` exactly — empty returns 0 results, `@baseclass` returns the rule.

**Q: What is a "handle-only row"?**  
A: A minimal rule representation with 10 metadata fields (no rule content like HTML/JSON). Full content requires a separate `/rules/instance` call with the full `pzInsKey`.

**Q: Why does the pzInsKey need `#timestamp`?**  
A: The `/rules/instance` endpoint requires the full instance key including the `#timestamp` suffix. Short keys (without `#`) return 404.

**Q: What happens if `/rules/instance` fails?**  
A: Soft fallback — the handle-only row is returned. No error is thrown. A warning is logged: "Instance fetch failed, falling back to handle row."

**Q: Does this affect non-@baseclass rules?**  
A: No. Non-@baseclass rules (e.g., `Work-`, `Data-`) continue to work exactly as before. The compat retry is **only** for `@baseclass`.

**Q: How do I verify the fix is working?**  
A: Run "Index Source Code", then open KB and search for `pzBulkActions`. You should see the full HTML content, not just metadata.

---

## 8. API Reference

### 8.1 PegaRuleReadClient.getObject()

**Description:** Fetch a single rule by class name and appliesTo.

| Attribute | Value |
|-----------|-------|
| Name | `getObject` |
| Module | `extension/src/services/pega/PegaRuleReadClient.ts` |

**Input Schema:**

```json
{
  "type": "object",
  "properties": {
    "pyClassName": { "type": "string", "description": "Rule name (e.g., pzBulkActions)" },
    "appliesTo": { "type": "string", "description": "AppliesTo class (e.g., @baseclass, Work-)" },
    "ruleset": { "type": "string", "description": "Optional ruleset filter" },
    "version": { "type": "string", "description": "Optional version filter" }
  },
  "required": ["pyClassName"]
}
```

**Example Request:**

```json
{
  "pyClassName": "pzBulkActions",
  "appliesTo": "@baseclass"
}
```

**Example Response (Full Rule):**

```json
{
  "pxObjClass": "Rule-HTML-Section",
  "pyClassName": "pzBulkActions",
  "pyRuleName": "pzBulkActions",
  "pzInsKey": "RULE-HTML-SECTION @BASECLASS PZBULKACTIONS #20180713T134741.673 GMT",
  "pyRuleHTML": "<div>...full HTML content...</div>",
  "pyRuleJSON": "{...}",
  "pyJavaScript": "...",
  "...": "all other rule properties"
}
```

### 8.2 PegaRuleReadClient.queryByTriple()

**Description:** Query rules by triple (className, appliesTo, ruleset).

| Attribute | Value |
|-----------|-------|
| Name | `queryByTriple` |
| Module | `extension/src/services/pega/PegaRuleReadClient.ts` |

**Input Schema:**

```json
{
  "type": "object",
  "properties": {
    "pyClassName": { "type": "string" },
    "appliesTo": { "type": "string" },
    "pyRuleSet": { "type": "string" },
    "pyRuleSetVersion": { "type": "string" }
  },
  "required": ["pyClassName", "appliesTo"]
}
```

---

## 9. Appendix

### 9.1 Glossary

| Term | Definition |
|------|------------|
| @baseclass | Pega's ultimate base class — all classes inherit from it. Rules with `appliesTo=@baseclass` are global/utilities. |
| Handle-only row | Minimal rule row from `/rules/query` with only 10 metadata fields, no content. |
| pzInsKey | Pega instance key (format: `RULE-TYPE CLASS NAME #TIMESTAMP`). Required for `/rules/instance`. |
| KB | Knowledge Base — local index of Pega rules for AI-assisted development. |
| Full content follow-up | Automatic `/rules/instance` call after handle-only row to fetch complete rule JSON. |
| Fail-loud | Error handling strategy: immediate rethrow on auth/server errors, no silent retries. |

### 9.2 Related Documents

| Document | Location |
|----------|----------|
| STATUS.json | `documents/SA4E-350/STATUS.json` |
| TEST-REPORT.md | `documents/SA4E-350/TEST-REPORT.md` |
| STP.md | `documents/SA4E-350/STP.md` |
| STC.md | `documents/SA4E-350/STC.md` |
| RUN-LOG.md | `documents/SA4E-350/RUN-LOG.md` |

### 9.3 Version Compatibility

| System Version | Config Version | Breaking Changes |
|---------------|---------------|-----------------|
| 1.48.0 | v1 | **NEW:** @baseclass rules now index successfully; full content fetched via instance follow-up. No breaking changes for existing rules. |
| 1.47.x | v1 | @baseclass rules returned "Not found"; KB entries were handle-only. |

---