# User Guide (UG)

## SDLC Agents 4 Enterprise — SA4E-323: Per-workspace isolation for Pega/Atlassian connection settings

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-323 |
| Title | Pega/Atlassian connection settings per-workspace isolation (VS Code extension) |
| Author | DEV Agent |
| Reviewer | BA Agent |
| Version | 1.0 |
| Date | 2026-09-24 |
| Status | Draft |
| Related BRD | BRD-v1-SA4E-323.docx |
| Related FSD | FSD-v1-SA4E-323.docx |
| Related TDD | TDD-v1-SA4E-323.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-24 | DEV Agent | Initial document (from BRD v1.0, FSD v1.1, TDD v1.0 + implementation: WorkspaceScopeResolver.ts, ProviderConfigService.ts, AtlassianCredentialService.ts, SettingsMessageHandler.ts) |

---

## 1. Introduction

### 1.1 Purpose

This guide explains how Pega Platform and Atlassian (Jira) connection settings work in the SDLC Agents VS Code extension **after the SA4E-323 fix**.

Before this fix, the Pega Endpoint / Operator ID / Password and the Jira Base URL / Email / API Token / Connection Type you entered in **SDLC Pipeline Settings** were stored **globally** (shared by every workspace). Saving credentials in Workspace A leaked them into Workspace B.

After this fix, each VS Code workspace folder keeps **its own** Pega and Atlassian settings:

- Open Workspace A → you see and use Workspace A's connections.
- Open Workspace B → you see Workspace B's connections (or empty fields), never A's.
- Upgrading users keep their old values: they are copied automatically into the current workspace on first open (one-time migration).

This guide shows you how to install/upgrade, configure, use, administer, and troubleshoot the new behavior. No technical background is required — plain explanations are used throughout, with exact message texts so you can match what you see on screen.

### 1.2 Audience

| Audience | What They Need |
|----------|---------------|
| Developer (extension user) | How to save, view, test, and clear Pega/Atlassian connections per workspace (§4, §5) |
| System Administrator / Team lead | How secrets are stored (OS keychain), what lands in `.vscode/settings.json`, how to handle many workspaces and legacy values (§6) |
| Support / QA | How to diagnose common problems using the error-code table and logs (§7) |

### 1.3 Prerequisites

| Prerequisite | Version | Required |
|-------------|---------|----------|
| Visual Studio Code | 1.85.0 or newer | Yes |
| SDLC Agents extension (VSIX, §2.3) | 1.43.0 or newer (with SA4E-323 fix) | Yes |
| A workspace folder open (`File → Open Folder…`) | — | Yes for saving (see §4.7) |
| Pega Platform endpoint + Operator account | Any reachable version | Only to use Pega features |
| Jira Cloud or Jira Server/Data Center + API token or PAT | Any reachable version | Only to use Atlassian features |

---

## 2. Getting Started

### 2.1 Quick Start

```bash
# Step 1: Install or upgrade the extension (see §2.3 for details)
code --install-extension sdlc-agents-1.43.0.vsix

# Step 2: Open your project folder (per-workspace settings REQUIRE a folder)
# VS Code menu: File → Open Folder… → select e.g. c:\projects\client-a

# Step 3: Open SDLC Pipeline Settings (Command Palette: "SDLC: Open Settings")
# Fill in the Pega section and/or the Atlassian section, then click Save.

# Step 4: Verify — the fields stay filled after reload, and Test Connection
# reports success for THIS workspace only (see §2.5).
```

### 2.2 System Requirements

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| VS Code | 1.85.0 | Latest stable |
| OS (for secret storage) | Windows 10 / macOS 12 / Ubuntu 22.04 (any OS with a keychain/credential store) | Same |
| Disk | Extension ~50 MB + workspace `.vscode/settings.json` (a few KB) | Same |
| Network | HTTPS reachability to your Pega and Jira servers (for Test buttons) | Same |

### 2.3 Distribution Formats

| Format | How to Get | Use Case |
|--------|-----------|----------|
| VSIX package (`sdlc-agents-<version>.vsix`) | Release artifacts / internal distribution share | **Standard install and upgrade path** for this extension |

**Install a fresh copy:**

1. In VS Code, open the Command Palette (`Ctrl+Shift+P`) → `Extensions: Install from VSIX…`.
2. Select the `.vsix` file → `Install` → `Reload Window` when prompted.
3. Open a workspace folder, then open **SDLC Pipeline Settings** to configure connections.

**Upgrade from a version WITHOUT the SA4E-323 fix:**

1. Install the new VSIX the same way (VS Code replaces the old version; your old **global** values are kept untouched).
2. Open each workspace folder you use, one at a time, and open **SDLC Pipeline Settings** once. The one-time automatic migration (§4.6) copies your old global values into that workspace. You do not need to re-type anything if migration succeeds.
3. Repeat for every workspace. Each workspace inherits the same old values on its first open — that is intentional (see §4.6 and FAQ).

**Rollback (if you must go back):** install the previous VSIX the same way. It is safe: the old code reads the old global values (they were never deleted), and simply ignores the new per-workspace values. No data is destroyed by rolling back.

### 2.4 Configuration Methods

| Method | Priority | Best For |
|--------|----------|----------|
| Settings UI (SDLC Pipeline Settings webview) | Highest (recommended) | Everyone — validates input, stores secrets safely, refreshes the display |
| Editing workspace `.vscode/settings.json` by hand | Same result, no validation | Advanced users changing only non-secret fields (endpoint, username, connection type) |
| Environment variables / CLI args | Not supported for these settings | — |

> There is intentionally only one supported way to enter **passwords and tokens**: the Settings UI. Passwords and tokens are never typed into `settings.json` — they go to the OS keychain (see §3.2 and §6.1).

Minimal working example — what a configured workspace looks like after you click Save (file `<your-folder>/.vscode/settings.json`):

```jsonc
// <workspace-folder>/.vscode/settings.json
{
  "kiroSdlc.pegaEndpoint": "https://pega.corp.local:8443/prweb",
  "kiroSdlc.pegaUsername": "dev.operator",
  "kiroSdlc.atlassianConnectionType": "cloud"
  // NOTE: passwords/tokens are NOT here — they live in the OS keychain (§6.1).
}
```

Secrets live in the OS keychain under per-workspace names (explained in plain language in §3.2):

```text
kiroSdlc.<12-char-workspace-code>.pegaPassword
kiroSdlc.<12-char-workspace-code>.atlassian.baseUrl
kiroSdlc.<12-char-workspace-code>.atlassian.email
kiroSdlc.<12-char-workspace-code>.atlassian.apiToken
```

### 2.5 Verify Configuration

After saving in a workspace:

- **Check 1 — values stick:** close and reopen Settings in the same workspace. Endpoint, username, Base URL, email, and connection type show the values you saved. Password/token fields stay masked but show a "saved for this workspace" placeholder (presence flags `hasPegaPassword` / `hasAtlassianToken`).
- **Check 2 — isolation:** open a *different* workspace folder. Its Settings show empty fields (or that workspace's own values) — never the first workspace's values.
- **Check 3 — Test buttons:** click **Test Pega Connection** and **Test Atlassian Connection**. Each reports success using *this* workspace's credentials (see §4.4 for exact success messages).
- **If anything differs**, see §7.1 (Common Issues) and §7.2 (Error Codes).

---

## 3. Configuration

### 3.1 Configuration File

- **Non-secret fields** (endpoint, username, connection type) are stored in the workspace file `<workspace-folder>/.vscode/settings.json` under the `kiroSdlc.*` keys, written with VS Code **Workspace** scope. Each folder has its own file, so each workspace is isolated by construction.
- **Secret fields** (Pega password, Jira Base URL, email, API token) are stored in VS Code **SecretStorage**, which is backed by your OS keychain (Windows Credential Manager / macOS Keychain / Linux secret service). They are **never** written to `settings.json`, logs, or the Settings display.
- Format is JSON (VS Code settings) plus opaque keychain entries. You do not need to edit either by hand — the Settings UI does it for you.

### 3.2 Configuration Reference

#### 3.2.1 Pega Platform Connection fields

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `kiroSdlc.pegaEndpoint` | string (URL, `http://` or `https://`) | `http://localhost:8080/prweb` | Pega platform base URL for **this workspace**. Trailing `/` is ignored when the value is used. Must start with `http://` or `https://`. Stored in this workspace's `.vscode/settings.json`. |
| `kiroSdlc.pegaUsername` | string | `""` (empty) | Pega Operator ID for **this workspace**. Leading/trailing spaces are removed. Empty means "not configured" — Pega features that need authentication will refuse with a clear message instead of guessing. Stored in this workspace's `.vscode/settings.json`. |
| Pega password | secret string | (none) | Pega password/token for **this workspace**. Typed into the masked password box and saved to the OS keychain. Never displayed back — the UI only shows whether *this workspace* has one saved. Leaving the box blank on save **keeps** the existing saved password (it does not erase it). |

#### 3.2.2 Atlassian (Jira) Connection fields

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| Jira Base URL | secret string (URL, `http://` or `https://`) | (none) | Jira base URL for **this workspace** (e.g. `https://myorg.atlassian.net`). Must be a valid `http(s)` URL. Trailing slashes are ignored when the value is used. Kept in the OS keychain (per current design), shown back as plain text in Settings because a URL is not the token itself. |
| Atlassian email | secret string | (none) | Account email (Cloud) or username (Server) for **this workspace**. Must not be empty. Kept in the OS keychain, shown back in Settings. |
| API Token / PAT | secret string | (none) | API token (Jira Cloud) or Personal Access Token (Server/DC) for **this workspace**. Must not be empty. Masked; the UI only shows whether *this workspace* has one saved. |
| `kiroSdlc.atlassianConnectionType` | enum `cloud` \| `server` | `cloud` | Which Jira deployment flavor **this workspace** talks to. If you omit it when saving, `cloud` is stored. Any stored value other than `server` is treated as `cloud`. Stored in this workspace's `.vscode/settings.json`. |

#### 3.2.3 Workspace scope — what "per-workspace" means

| Concept | Plain-language explanation |
|---------|----------------------------|
| Workspace | A folder you opened with `File → Open Folder…`. Your settings belong to that folder, not to VS Code as a whole. |
| Isolation | Saving in Workspace A writes only to A's `.vscode/settings.json` + A's keychain entries. Workspace B cannot see them. Opening B shows B's own values or empty fields. |
| Presence flags | The Settings screen never receives your actual password/token. It receives only `hasPegaPassword: true/false` and `hasAtlassianToken: true/false` for the current workspace, used for placeholders like "saved for this workspace" vs "Not set for this workspace". |
| What is NOT per-workspace | LLM provider keys and model selections (`llmProvider`, `llmModel`, API keys, base URLs) are intentionally unchanged by this fix and remain global. Proxy/backend-URL/MCP-port settings were already per-workspace before this fix. |

#### 3.2.4 Secret key scheme — plain-language explanation (non-technical)

You never need to type these key names, but it helps to know *why* workspaces cannot collide:

- VS Code's keychain has no built-in "per folder" compartments, so the extension builds one compartment per folder out of the folder's own path.
- Think of it as a short ID card for each folder — you never need to remember or type it. Technically, the extension takes your workspace folder path (e.g. `c:\projects\client-a`), tidies it up (unifies `\` vs `/`, drops a trailing slash, lowercases a Windows drive letter, keeps remote/WSL/SSH server prefixes as-is), and derives a short 12-character code from it (SHA-256 hash, first 12 characters). Illustrative example only — your folder will get its own different code: folder `c:\projects\client-a` → code like `a3f9c1e2b4d5` (example, not real).
- **Rule: same folder path → same 12-character code → same keys. Different folder → different code → different keys. No folder open → no code → saving is blocked.**
- Secrets are then stored as `kiroSdlc.<code>.pegaPassword`, `kiroSdlc.<code>.atlassian.baseUrl`, `kiroSdlc.<code>.atlassian.email`, `kiroSdlc.<code>.atlassian.apiToken`. A 12-hex code (48 bits) makes accidental collisions between two workspaces practically impossible (tens of workspaces per machine is the expected scale).
- A marker entry `kiroSdlc.<code>.migrated = "1"` records that the one-time migration (§4.6) already ran for that workspace, so it never runs twice and never resurrects a password you deliberately cleared.
- Old (pre-fix) global entries — `kiroSdlc.pegaPassword`, `kiroSdlc.atlassian.baseUrl`, `kiroSdlc.atlassian.email`, `kiroSdlc.atlassian.apiToken`, plus global `pegaEndpoint` / `pegaUsername` / `atlassianConnectionType` — are kept as **read-only migration sources** and are never written by the new code. They are what make upgrade (§2.3) and no-folder viewing (§4.7) work.

### 3.3 Environment Variables

| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| (none) | Pega/Atlassian per-workspace settings are not configurable via environment variables | — | — |

### 3.4 Configuration Examples

#### Minimal Configuration (one workspace, Pega only)

```jsonc
// c:\projects\client-a\.vscode\settings.json
{
  "kiroSdlc.pegaEndpoint": "https://pega-a.corp/prweb",
  "kiroSdlc.pegaUsername": "op.a"
}
// + Pega password saved via Settings UI → keychain entry
//   kiroSdlc.<code-of-client-a>.pegaPassword
```

#### Full Configuration (one workspace, Pega + Jira Cloud)

```jsonc
// c:\projects\client-a\.vscode\settings.json
{
  "kiroSdlc.pegaEndpoint": "https://pega-a.corp/prweb",
  "kiroSdlc.pegaUsername": "op.a",
  "kiroSdlc.atlassianConnectionType": "cloud"
}
// + keychain entries for workspace client-a:
//   kiroSdlc.<codeA>.pegaPassword
//   kiroSdlc.<codeA>.atlassian.baseUrl  = "https://a.atlassian.net"
//   kiroSdlc.<codeA>.atlassian.email    = "a@corp.local"
//   kiroSdlc.<codeA>.atlassian.apiToken = (saved via Settings UI)
```

A second workspace (`c:\projects\client-b`) has its **own** `.vscode/settings.json` and its **own** `<codeB>` keychain entries — the two never intersect:

```jsonc
// c:\projects\client-b\.vscode\settings.json — completely independent from client-a
{
  "kiroSdlc.pegaEndpoint": "https://pega-b.corp/prweb",
  "kiroSdlc.pegaUsername": "op.b",
  "kiroSdlc.atlassianConnectionType": "server"
}
// + keychain entries for workspace client-b:
//   kiroSdlc.<codeB>.pegaPassword
//   kiroSdlc.<codeB>.atlassian.baseUrl  = "https://jira.corp.local"
//   kiroSdlc.<codeB>.atlassian.email    = "b@corp.local"
//   kiroSdlc.<codeB>.atlassian.apiToken = (Jira Server PAT saved via Settings UI)
```

> Tip: compare `<codeA>` vs `<codeB>` — different folders always get different codes, so Workspace A credentials can never leak into Workspace B.

---

## 4. Usage

> All flows below happen in **SDLC Pipeline Settings** (Command Palette → "SDLC: Open Settings"). What you see is what is used: every Test button, indexing job, and credential lookup uses the **current workspace's** values only.

### 4.1 Save Pega connection (per-workspace)

**Description:** Store the Pega Endpoint URL, Operator ID, and Password for the currently open workspace.

**How to use:**

1. Open your workspace folder (`File → Open Folder…`).
2. Open **SDLC Pipeline Settings** → **Pega Platform Connection** section.
3. Fill in **Pega Endpoint URL** (e.g. `https://pega.corp.local:8443/prweb`), **Pega Operator ID** (e.g. `dev.operator`), and **Pega Password**.
4. Click **Save Pega**.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| endpoint | string (URL) | Yes | Must start with `http://` or `https://` |
| username | string | Yes | Operator ID; spaces are trimmed |
| password | string | First save: Yes. Later saves: optional — leave blank to **keep** the stored password | New non-blank value overwrites this workspace's stored password |

**Example:** save endpoint `https://pega-a.corp/prweb`, username `op.a`, password `••••••••` in Workspace A.

**Expected Output:** a `pegaSaved` confirmation (`success: true`), and the Settings screen refreshes to show Workspace A's endpoint/username with the password placeholder "saved for this workspace". Internally: `pegaEndpoint` + `pegaUsername` are written to Workspace A's `.vscode/settings.json`, and the password goes to `kiroSdlc.<codeA>.pegaPassword` in the keychain. No global value is written.

### 4.2 Save Atlassian connection (per-workspace)

**Description:** Store the Jira Base URL, Email, API Token/PAT, and Connection Type for the currently open workspace.

**How to use:**

1. Open your workspace folder.
2. Open **SDLC Pipeline Settings** → **Atlassian Connection** section.
3. Fill in **Jira Base URL** (e.g. `https://myorg.atlassian.net`), **Email** (e.g. `dev@corp.local`), **API Token / PAT**, and **Connection Type** (`Cloud` or `Server`).
4. Click **Save Atlassian**.

**Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| baseUrl | string (URL) | Yes | Must be a valid `http://`/`https://` URL |
| email | string | Yes | Must not be empty |
| apiToken | string | Yes | Must not be empty |
| connectionType | `cloud` \| `server` | No (defaults to `cloud`) | Stored per workspace |

**Example:** save `https://a.atlassian.net` / `a@corp.local` / token / `cloud` in Workspace A.

**Expected Output:** an `atlassianSaved` confirmation (`success: true`), and the Settings screen refreshes to show Workspace A's URL/email/type with the token placeholder "saved for this workspace". Internally: the three secrets go to `kiroSdlc.<codeA>.atlassian.*` in the keychain and the connection type goes to Workspace A's `.vscode/settings.json`.

### 4.3 View current workspace state (`getState` — what-you-see-is-what-is-used)

**Description:** Every time Settings opens or refreshes, it loads **only** the current workspace's values.

**How to use:** open Settings, or click the refresh/reload action. No input is needed.

**Expected Output (example, Workspace A):**

```json
{
  "type": "state",
  "pegaEndpoint": "https://pega-a.corp/prweb",
  "pegaUsername": "op.a",
  "hasPegaPassword": true,
  "atlassianBaseUrl": "https://a.atlassian.net",
  "atlassianEmail": "a@corp.local",
  "hasAtlassianToken": true,
  "atlassianConnectionType": "cloud"
}
```

Notes:

- A fresh workspace with nothing saved shows the Pega endpoint default `http://localhost:8080/prweb`, empty username, `hasPegaPassword: false`, empty Atlassian fields, `hasAtlassianToken: false`, and connection type `cloud`.
- Secret *values* never appear here — only `true/false` presence flags.
- Opening Workspace B shows B's snapshot, never A's.

### 4.4 Test connections (current-workspace credentials only)

**Test Pega Connection:**

- Click **Test Pega**. The extension sends `GET` to *this workspace's* endpoint (no login — it is a network reachability check, unchanged behavior, now bounded by an 8-second timeout).
- Success: `pegaTestResult` → `{"success": true, "message": "✅ Network OK — Pega Server reachable (HTTP {status}). Authentication not tested."}`.
- Failure: `{"success": false, "message": "Connection failed: {reason}"}` (or `"Connection failed: no response from server"`).
- If this workspace has no endpoint saved, the compiled default `http://localhost:8080/prweb` is probed — the message refers to that workspace default, not to another workspace's URL.

**Test Atlassian Connection:**

- Click **Test Atlassian**. The extension calls `GET {baseUrl}/rest/api/2/myself` with *this workspace's* email+token (Basic auth), with an 8-second timeout. No network call is made if the triple is incomplete.
- Success: `atlassianTestResult` → `{"success": true, "message": "Connected as {displayName}"}` (e.g. `"Connected as Alice Nguyen"`).
- Incomplete credentials: `{"success": false, "message": "No credentials configured."}`.
- Wrong email/token: `{"success": false, "message": "Authentication failed (401). Check email/token."}` — scoped to this workspace; the extension never retries with another workspace's credentials.
- Other failures: `{"success": false, "message": "HTTP {status}: {statusText}"}` or `"Connection failed: {reason}"` (includes the 8-second timeout case — just click Test again to retry).

### 4.5 Clear password / clear Atlassian config (explicit removal)

Because leaving the Pega password box blank on save means "keep the old password" (§4.1), removal needs its own explicit action:

- **Clear Pega password:** triggers the `clearPegaPassword` action. It deletes *this workspace's* `kiroSdlc.<code>.pegaPassword` keychain entry. The endpoint/username stay. The migration marker stays, so the cleared password is **not** resurrected on restart (cleared-stays-cleared). Confirmation arrives as `pegaPasswordCleared {success: true}` followed by a refreshed `state` showing `hasPegaPassword: false`.
- **Clear Atlassian config:** triggers the `clearAtlassianConfig` action. It deletes *this workspace's* three `kiroSdlc.<code>.atlassian.*` keychain entries and unsets the workspace's `atlassianConnectionType` (back to the `cloud` default on next read). Confirmation arrives as `atlassianCleared {success: true}` followed by a refreshed `state`.
- Both actions are blocked with the no-workspace message when no folder is open (§4.7).

### 4.6 Automatic migration (existing users — nothing to click)

**Description:** On first use of each workspace after upgrading, the extension copies your old **global** values into that workspace — once, safely, field by field.

**How it works (what to expect):**

1. You open Workspace A after upgrading and open Settings (or save, test, or run indexing — any of these triggers the check).
2. If Workspace A was already migrated (marker `kiroSdlc.<codeA>.migrated` present), nothing happens — your workspace values are returned as-is.
3. Otherwise the extension reads the legacy globals (global config values + flat keychain keys `kiroSdlc.pegaPassword`, `kiroSdlc.atlassian.baseUrl`, `.email`, `.apiToken`) and the current workspace values, then for **each field independently**:
   - Workspace already has a value → keep it (**workspace wins**, legacy is ignored for that field).
   - Workspace is empty + legacy has a valid non-empty value → copy it into the workspace (URL fields are re-validated with the same rules as Save; invalid legacy URLs are skipped, not copied).
   - Nothing to copy anywhere → just mark migration done.
4. If every copy succeeded (or there was nothing to copy), the marker is set. Your old globals are **kept** (copy, not move) — they remain as the source for the *next* workspace you open and as the no-folder fallback (§4.7). If anything failed (keychain error, read-only settings file), the marker is **not** set, nothing is deleted, and the next open retries automatically — you will see which part is still missing via the presence flags.

**Partial-workspace example:** Workspace A has an endpoint but no password; legacy has both → only the password is copied; the endpoint is untouched.

**Clearing after migration:** if you clear a password *after* migration and restart, it stays cleared — the marker prevents re-copying (this is the `ClearedAfterMigration` state).

### 4.7 No-folder and multi-root behavior

**No workspace folder open (single loose file / empty window):**

- Settings show the old shared values **read-only** (or empty with an explanatory banner on a fresh install): `No workspace folder open — showing shared (read-only) values. Open a folder to configure per-workspace credentials.`
- **Saving is blocked** — nothing is written, so the old bug (silent global overwrite) cannot come back through this path. You get the exact messages in §7.2.
- **Testing** runs against the read-only shared values and the result is labeled as shared (not workspace-verified).
- `Fetch Pega Context` keeps its existing guard: `pegaContextFetched` → `{"success": false, "message": "No workspace folder open to save Pega context."}`.
- To configure anything: `File → Open Folder…`, then save again.

**Multi-root (several folders in one window):**

- Only the **first** folder (`workspaceFolders[0]`) defines your settings identity — for key derivation *and* for where `.vscode/settings.json` is written. This matches the rest of the extension (Pega client root, Fetch-context root).
- Folders 2..N are **ignored** for Pega/Atlassian settings: their values are never read and never written. Settings should show a note when more than one folder is open.
- Repeated opens of the same multi-root window always resolve to the same first folder's values (deterministic).

---

## 5. User Interface Guide

The system UI for this feature is the **SDLC Pipeline Settings** webview panel (no other screens changed).

### 5.1 Screen Overview

| # | Screen | URL / Path | Purpose |
|---|--------|-----------|---------|
| 1 | SDLC Pipeline Settings | VS Code panel (Command Palette → "SDLC: Open Settings") | View/save/test the current workspace's Pega + Atlassian connections |

### 5.2 Screen — SDLC Pipeline Settings (Pega + Atlassian sections)

**Key Elements:**

| # | Element | Type | Description |
|---|---------|------|-------------|
| 1 | Pega Endpoint URL | Input | Current workspace endpoint only; empty/default in a fresh workspace |
| 2 | Pega Operator ID | Input | Current workspace username only |
| 3 | Pega Password | Password input | Masked; placeholder from `hasPegaPassword`: "saved for this workspace" vs "Not set for this workspace". Never shows the stored value |
| 4 | Save Pega | Button | Persists to workspace scope + namespaced keychain entry; shows `pegaSaved` success/error; refreshes the whole state |
| 5 | Test Pega Connection | Button | Reachability check with current-workspace endpoint (8 s timeout); shows `pegaTestResult` |
| 6 | Jira Base URL | Input | Current workspace URL only; validated `http(s)` |
| 7 | Email | Input | Current workspace email/username only |
| 8 | API Token / PAT | Password input | Masked; placeholder from `hasAtlassianToken`; never shows the stored value |
| 9 | Connection Type (`Cloud`/`Server`) | Radio | Current workspace type; defaults to `Cloud` |
| 10 | Save Atlassian | Button | Persists to workspace scope + namespaced keychain entries; shows `atlassianSaved`; refreshes state |
| 11 | Test Atlassian Connection | Button | `GET /rest/api/2/myself` with current-workspace triple (8 s timeout); shows `atlassianTestResult` |
| 12 | Clear Pega password / Clear Atlassian | Button | Explicit removal actions (§4.5); blocked with a message when no folder is open |
| 13 | No-workspace banner | Notice (conditional) | Shown when no folder is open; explains read-only state and why Save is disabled |

**User Actions:**

| Action | Steps | Expected Result |
|--------|-------|-----------------|
| Save Pega for this workspace | 1. Open folder 2. Fill endpoint/username/password 3. Click Save Pega | Success message; fields keep showing this workspace's values; other workspaces unaffected |
| Save Atlassian for this workspace | 1. Open folder 2. Fill URL/email/token/type 3. Click Save Atlassian | Success message; state refreshes; other workspaces unaffected |
| Verify isolation | 1. Save in A 2. Open folder B 3. Open Settings | B shows empty (or B's own values), never A's |
| Test connection | 1. Click Test Pega / Test Atlassian | Result message names this workspace's outcome (§4.4) |
| Remove a secret | 1. Click Clear action | Presence flag flips to "Not set for this workspace"; stays cleared after restart |
| Upgrade without data loss | 1. Install new VSIX 2. Open each workspace once | Each workspace shows the inherited legacy values as its own (§4.6) |

### 5.3 Navigation Flow

```text
Open Folder → Open SDLC Pipeline Settings → (Save Pega | Save Atlassian |
Test Pega | Test Atlassian | Clear | Fetch Pega Context) → inline result message
→ state auto-refreshes → switch folder → different state, same screens
```

---

## 6. Administration

### 6.1 Secret storage and the OS keychain

- **Where secrets live:** OS keychain via VS Code SecretStorage — Windows Credential Manager, macOS Keychain, or the Linux secret service (e.g. GNOME Keyring). Entries are namespaced per workspace (§3.2.4): 4 credential keys + 1 migration marker per workspace.
- **What never leaves the keychain except as an auth header:** the Pega password and the Jira API token/PAT. They never appear in `settings.json`, output-channel logs, the Settings display payload, error dialogs, or migration diagnostics. Only `true/false` presence flags cross into the webview.
- **What may appear in logs:** the workspace folder path and its 12-character code (debug level, to diagnose multi-root mix-ups), the Pega/Jira *host* being contacted, and HTTP status codes — never secret values.
- **Admin tasks:** no keychain maintenance is normally needed. If a user reports "it keeps saying not configured", check (a) they opened the right folder (codes differ per folder — a renamed/moved folder is a *new* workspace and starts empty), and (b) the OS keychain is unlocked and writable (a locked keychain surfaces as save/test failures, see §7.1). Rollback-safe deletion (returning one workspace to pure-legacy state) is possible by deleting that workspace's `kiroSdlc.<code>.*` + `kiroSdlc.<code>.migrated` keychain entries, but it is **not required** — uninstalling the new VSIX alone restores legacy behavior because legacy values were never deleted.

### 6.2 Workspace settings file (`.vscode/settings.json`) — ⚠️ check-in warning (OI-11)

- **What lands in the file:** `kiroSdlc.pegaEndpoint`, `kiroSdlc.pegaUsername`, and `kiroSdlc.atlassianConnectionType` — plain text, per workspace. **Secrets never land here.**
- **⚠️ Warning — accepted and documented:** `.vscode/settings.json` is *usually committed to git*. That means endpoint URLs and usernames will be committed to the repository. This is accepted behavior (workspace scope inherently follows the folder). What is guaranteed: **passwords and tokens stay in the OS keychain and are never committed**.
- **Team guidance:** if an endpoint/username is sensitive for your project, add an exception for those keys in your repo policy or keep them in a non-committed workspace setup. If `settings.json` is read-only (permissions, locked checkout), saves fail with the partial-save message in §7.2 — fix the file permission and click Save again (overwriting the same namespaced keys is idempotent, so retrying is safe).
- **Settings Sync:** workspace-scoped values naturally follow the workspace folder; cross-machine sync policy for them is out of scope for this fix.

### 6.3 Legacy globals (what the old version left behind)

- **What they are:** pre-fix global config (`kiroSdlc.pegaEndpoint` / `pegaUsername` / `atlassianConnectionType` in your *user* `settings.json`) plus flat keychain keys (`kiroSdlc.pegaPassword`, `kiroSdlc.atlassian.baseUrl`, `.email`, `.apiToken`).
- **Policy (OI-6): the extension NEVER auto-deletes them.** They are the copy source for every *new* workspace's first open (§4.6) and the read-only fallback when no folder is open (§4.7). Leave them intact indefinitely; they cost nothing and deleting them would strand workspaces that have not been opened (and migrated) yet.
- **What the new code does with them:** reads them only during migration and no-folder fallback (via scope-specific reads that cannot be confused with workspace values). New saves never write them.

### 6.4 Multi-workspace administration

1. **Onboarding a new project folder:** open it, open Settings once (migration pre-fills legacy values if any), adjust endpoint/username/URL/email/token/type as needed, Save, Test. Done — that folder is now independent.
2. **Single credential for all workspaces (old habit):** isolation is now the rule. After upgrade, open each workspace once (migration copies the shared values in), then going forward save per workspace. There is no "share with all workspaces" switch.
3. **Renamed/moved folders:** treated as a new workspace (different path → different code). Re-open Settings; if legacy globals still exist they migrate in, otherwise re-enter and save.
4. **Consistency check:** the same workspace opened repeatedly — via Settings, Test buttons, indexing jobs, or MCP credential requests — always resolves to the same values (deterministic resolution). If two windows show different values, they are different folders (check `workspaceFolders[0]`).

---

## 7. Troubleshooting

### 7.1 Common Issues

| # | Symptom | Cause | Solution |
|---|---------|-------|----------|
| 1 | Save Pega fails: "No workspace folder open — Pega config requires a workspace to isolate credentials." | No folder is open (loose file / empty window). Saving *requires* a workspace so credentials can be isolated. | `File → Open Folder…`, then save again. Nothing was written; retrying is safe. |
| 2 | Save Atlassian fails: "No workspace folder open — open a folder to configure per-workspace Atlassian credentials." | Same as #1, Atlassian path. | Open a folder, then save again. |
| 3 | Test Atlassian says "No credentials configured." although you saved *somewhere* | The **current** workspace triple is incomplete (Base URL + email + token must ALL be present for *this* workspace). A complete triple in another workspace does not count. | In *this* workspace, fill all three fields and save. `getConfig()` returns null unless all three exist. |
| 4 | Test Atlassian says "Authentication failed (401). Check email/token." | The current workspace's email/token pair was rejected by Jira. | Fix the email/token **for this workspace** and save again. The extension never falls back to another workspace's credentials — a 401 always means *these* credentials. |
| 5 | Test Pega hangs, then "Connection failed: …" after ~8 s | The endpoint is unreachable / the request hit the 8-second timeout (added for parity with the Atlassian test path; previously it could hang unbounded). | Check the endpoint URL, VPN/proxy, and that the Pega server is up. Remember: Test Pega checks *reachability only*, not your Operator ID/password. |
| 6 | Test Pega reports success but Pega features later say Operator ID / credentials not configured | Test Pega is connectivity-only ("Authentication not tested"). Auth-dependent paths need username + password too. | Save a username and a non-blank password for this workspace, then retry the Pega feature. |
| 7 | Save Pega with an empty password erased nothing — old password still used | By design (blank = preserve). There is no way to *remove* a password through the Save box. | Use the explicit **Clear Pega password** action (§4.5). It stays cleared after restart. |
| 8 | Save Atlassian with empty email/token fails: "Atlassian email/API token must not be empty." | Empty values are rejected at save (fail-closed) instead of being stored and then treated as "not configured". | Enter a non-empty email and token, then save. |
| 9 | Invalid URL rejected at save ("Invalid Pega Endpoint URL…" / "Invalid Jira Base URL format." / "URL must use http or https protocol.") | Endpoint/Base URL is not an `http(s)` URL (e.g. `ftp://…`, typo, missing scheme). | Fix the URL to start with `http://` or `https://` and save again. Nothing was persisted. |
| 10 | Multi-root window: folders 2..N settings seem "ignored" | By design only `workspaceFolders[0]` (the first folder) defines identity for hashing and for `.vscode/settings.json` writes. | Put the project whose credentials you want in the first position, or open each folder in its own window. |
| 11 | Fresh workspace shows the endpoint `http://localhost:8080/prweb` although you never typed it | That is the compiled default for an empty workspace, not a leak from another workspace. | Save this workspace's real endpoint (or leave the default if it is correct for local development). |
| 12 | After upgrade, Workspace B is empty although Workspace A migrated fine | Migration is **per-workspace lazy**: each folder migrates on *its own* first open. Opening A does not migrate B. | Open B once — its migration runs then (legacy globals are kept precisely so B can still inherit them). |
| 13 | A value you cleared reappeared / a workspace value was overwritten by old globals | Should not happen (workspace-wins + cleared-stays-cleared via the marker). If it does, the marker write likely failed (keychain error) so migration re-ran. | Check the keychain is writable, clear again, restart, and verify `hasPegaPassword`/`hasAtlassianToken` stay false. Report with logs (folder + code only, no secrets). |
| 14 | Save fails with "Failed to save {Pega/Atlassian} config: {message} (password/token may not be saved — retry)." | The settings file is read-only *or* the keychain write failed midway (partial save: endpoint may be saved while the secret is not, or vice versa). | Fix the cause (file permission / unlock keychain) and click Save again — retry overwrites the same namespaced keys idempotently. Migration is not marked complete until a full success, so reopening retries it too. |
| 15 | Jira indexing / MCP tools say credentials are missing right after you saved in Settings | The consumer reads the *current* workspace; you may have saved in a different folder/window, or the triple is incomplete for this one. (Credential reads hot-reload per request, so no restart is needed once the right workspace is complete.) | Verify the folder (`workspaceFolders[0]`), complete the triple there, save, and re-run. |

### 7.2 Error Codes

Exact strings (copy-pasteable). `{…}` placeholders are filled at runtime; secrets never appear in any message.

| Code (message `type` + `success`) | Message (exact) | Description | Action |
|------|---------|-------------|--------|
| `pegaSaved` `success:false` | `No workspace folder open — Pega config requires a workspace to isolate credentials.` | Save Pega attempted with no folder open (FSD §3.8.3, BR-16) | Open a folder, retry. Nothing was written. |
| `atlassianSaved` `success:false` | `No workspace folder open — open a folder to configure per-workspace Atlassian credentials.` | Save Atlassian attempted with no folder open (FSD §3.8.3, BR-16) | Open a folder, retry. |
| `pegaSaved` `success:false` | `Invalid Pega Endpoint URL (http/https required).` | Endpoint fails the `http(s)` check at save (FSD §3.8.3, BR-4) | Fix URL scheme, retry. Nothing persisted. |
| `atlassianSaved` `success:false` | `Invalid Jira Base URL format.` | `validateUrl` failed: not a parseable URL (FSD §3.8.3, BR-9) | Fix URL, retry. |
| (`validateUrl` detail) | `URL must use http or https protocol.` | URL parsed but scheme is not `http:`/`https:` (e.g. `ftp://`) | Use `http(s)`, retry. |
| `atlassianSaved` `success:false` | `Atlassian email/API token must not be empty.` | Empty email or token rejected at save (fail-closed, TDD OI-9) | Enter both values, retry. |
| `pegaSaved` `success:false` | `Failed to save Pega config: {message} (password may not be saved — retry).` | Settings file or keychain write threw mid-save (partial save possible) | Fix permission/keychain, retry save. |
| `atlassianSaved` `success:false` | `Failed to save Atlassian config: {message} (password/token may not be saved — retry).` | Same, Atlassian path (3 secrets + connection type) | Same as above. |
| `atlassianTestResult` `success:false` | `No credentials configured.` | `getConfig()` null: triple incomplete for *this* workspace — no network call made | Complete Base URL + email + token for this workspace, save. |
| `atlassianTestResult` `success:false` | `Authentication failed (401). Check email/token.` | Jira returned 401 for *this* workspace's triple | Fix this workspace's email/token. Never another workspace's. |
| `atlassianTestResult` `success:false` | `HTTP {status}: {statusText}` | Jira returned a non-401 HTTP error | Check server status / URL / permissions. |
| `pegaTestResult` / `atlassianTestResult` `success:false` | `Connection failed: {message}` | Network error, abort, or timeout (both test paths time out at 8 s) | Check reachability/VPN/proxy; click Test again. |
| `pegaTestResult` `success:false` | `Connection failed: no response from server` | Pega probe got no HTTP response at all | Same as above. |
| `pegaTestResult` `success:true` | `✅ Network OK — Pega Server reachable (HTTP {status}). Authentication not tested.` | Pega Test success (connectivity only — Operator ID/password NOT verified) | Proceed; set username + password for auth paths. |
| `atlassianTestResult` `success:true` | `Connected as {displayName}` | Atlassian Test success for this workspace (e.g. `Connected as Alice Nguyen`) | Proceed. |
| `pegaContextFetched` `success:false` | `No workspace folder open to save Pega context.` | Fetch Pega Context with no folder (existing guard, verbatim) | Open a folder, retry. |
| (indexing / use-time) | `Pega Operator ID is not configured (kiroSdlc.pegaUsername). Set it before indexing.` | Empty workspace username on an auth path (fail-closed) | Set username for this workspace. |
| (indexing) | `⚠️ Pega Schema: credentials not configured (set pegaUsername + password in settings)` | Username or password missing for this workspace | Set both, save. |
| (indexing) | `⚠️ Jira Project Index: Atlassian credentials not configured (Settings → Atlassian Connection)` | Triple incomplete for this workspace at index time | Configure the triple for this workspace. |
| (child-server IPC, thrown) | `Atlassian credentials not configured in extension.` | `handleCredentialRequest()` with incomplete triple for this workspace (verbatim, no values) | Same recovery. |
| (developer-facing guard) | `Use workspace-scoped method for {key} (SA4E-323).` | Internal misuse: generic global `updateConfig()` called with a workspace-scoped key (`pegaEndpoint`/`pegaUsername`/`atlassianConnectionType`) | Call the workspace-scoped save method instead (not user-actionable; for developers). |

### 7.3 Logs

| Log Location | Content | Useful For |
|-------------|---------|------------|
| Extension output channel (VS Code → `View → Output` → SDLC extension channel) + developer console | Save events (folder + 12-char code + field *names* + success/failure), migration runs (code + copied/skipped/invalid field *names* + marker set), test results (code + endpoint *host* + HTTP status / 401 flag), scope fallback notes (folder count + null-scope reason), keychain failures (operation + key *suffix*, never values) | Diagnosing wrong-workspace saves, partial migrations, multi-root confusion, keychain lockouts — without ever exposing secrets |
| What you will NOT find in logs | Passwords, tokens, emails used as secrets, full URLs with query strings | By design (BR-20): if you ever see a secret in a log or in `settings.json`, treat it as a P0 defect and report it |

### 7.4 FAQ

**Q: Why do I have to configure Pega/Jira separately for each folder now? Can't I share one login everywhere?**
A: That sharing was the bug (SA4E-323): the last workspace you saved overwrote every other workspace, so Project A's endpoint silently followed you into Project B. Isolation is now the rule. After upgrading, open each folder once — migration copies your old shared values into each one — then adjust per project going forward.

**Q: What is the 12-character "workspace code" (`wsHash`)? Do I need to remember it?**
A: No — you can safely ignore it. Think of it as an internal ID card the extension makes from your folder path so the keychain can tell folders apart. Same folder → same code → same settings. (Technical detail for admins: derived as SHA-256 of the normalized folder path, first 12 characters.) You will only ever see it in debug logs next to the folder path.

**Q: I left the Pega password box empty and clicked Save. Did it erase my password?**
A: No — empty means "keep the stored password for this workspace" (only endpoint/username were updated). To actually remove it, use the explicit **Clear Pega password** action.

**Q: I opened a second folder and my settings are gone. Is that the leak again?**
A: No — that is isolation working: the second folder has no values yet (or has its own). Re-open the first folder and your values are still there. If you expected the old shared values, open the new folder's Settings once so migration can copy them in.

**Q: I use a multi-root window. Which folder's settings apply?**
A: Always the **first** folder in the window. The other folders' Pega/Atlassian values are never read or written. For independent credentials per project, open each folder in its own window.

**Q: I opened VS Code with just a file (no folder). Can I save settings?**
A: No — saving is blocked with a clear message, because there is no workspace to attach the credentials to. You can still *view* the previously shared values read-only and *test* against them (labeled as shared). Open a folder to configure.

**Q: Will upgrading delete my existing credentials?**
A: No. Migration **copies** (never moves): legacy globals stay intact until every workspace has inherited them, failed migrations retry on next open, and a workspace value is never overwritten by legacy data. Rolling back to the old VSIX is also safe for the same reason.

**Q: I renamed my project folder and Settings are empty. What happened?**
A: A renamed/moved folder is a *new* workspace (different path → different code). If the legacy globals still exist, opening Settings once migrates them in; otherwise re-enter and save for the new path.

**Q: Does Test Pega verify my Operator ID and password?**
A: No. Test Pega only checks that the endpoint is *reachable* over the network ("Authentication not tested"). Wrong passwords surface later at auth time (401/403 scoped to that workspace). Test Atlassian *does* verify the email/token (`Connected as …` on success).

**Q: I cleared a password but it came back after restart. Bug?**
A: It should stay cleared (the migration marker blocks re-copying). If it returned, the marker write failed — usually a locked/read-only keychain. Unlock the keychain, clear again, restart, and confirm the presence flag stays `false`.

**Q: Is it safe that my endpoint/username are in `.vscode/settings.json` which I commit to git?**
A: Endpoints and usernames in the committed file are accepted behavior — but **passwords and tokens are never in that file**; they stay in your OS keychain. If an endpoint itself is sensitive, exclude those keys from commits per your repo policy.

**Q: Do I need to restart VS Code after saving?**
A: No. Saves refresh the displayed state immediately, and downstream consumers (indexing, MCP/Jira tools) re-read credentials per request (hot-reload), so mid-session saves apply at once.

---

## 8. API Reference (IPC contracts — values are workspace-scoped, shapes are frozen)

> If you only configure connections through the Settings UI, you can safely skip this section — it is for support staff, admins, and developers diagnosing issues. The message *names and shapes* below did not change in this fix — only the *values* they carry became per-workspace. Passwords/tokens travel from the Settings screen to the extension **only** when you click an explicit Save; they are never sent back to the screen (the screen only receives yes/no "saved for this workspace" flags).

### 8.1 Webview → extension host

| `type` | Payload fields | Host action |
|--------|---------------|-------------|
| `savePegaConfig` | `endpoint: string` (required), `username: string` (required), `password?: string` (absent/blank = preserve) | `ProviderConfigService.updatePegaConfig()` → `pegaSaved`, then `state` refresh |
| `saveAtlassianConfig` | `baseUrl: string`, `email: string`, `apiToken: string`, `connectionType?: "cloud" \| "server"` (missing → `"cloud"`) | `AtlassianCredentialService.saveConfig()` → `atlassianSaved`, then `state` refresh |
| `ready` / `getState` | (none) | `sendCurrentState()`: posts `state`, then `models` |
| `testPegaConnection` | (none; uses stored workspace endpoint) | `GET {endpoint}` (8 s timeout) → `pegaTestResult` |
| `testAtlassianConnection` | (none; uses stored workspace triple) | `GET {baseUrl}/rest/api/2/myself` (8 s timeout) → `atlassianTestResult` |
| `fetchPegaContext` | (none; root = first workspace folder) | Fetch + save context → `pegaContextFetched` |
| `clearPegaPassword` | (none) | `ProviderConfigService.clearPegaPassword()` → `pegaPasswordCleared`, then `state` refresh |
| `clearAtlassianConfig` | (none) | `AtlassianCredentialService.clearConfig()` → `atlassianCleared`, then `state` refresh |

**Example request:**

```json
{"type": "savePegaConfig", "endpoint": "https://pega.corp.local:8443/prweb", "username": "dev.operator", "password": "••••••••"}
{"type": "saveAtlassianConfig", "baseUrl": "https://myorg.atlassian.net", "email": "dev@corp.local", "apiToken": "••••••••", "connectionType": "cloud"}
```

### 8.2 Extension host → webview

| `type` | Payload schema | Secrets in payload? |
|--------|---------------|---------------------|
| `state` | `{provider, model, ollamaUrl, baseUrl, hasAnthropicKey, hasOpenaiKey, backendUrl, allowInsecureRemote, mcpServerPort, enableMcpServer, pegaEndpoint, pegaUsername, hasPegaPassword, atlassianBaseUrl, atlassianEmail, hasAtlassianToken, atlassianConnectionType}` — Pega/Atlassian values workspace-resolved | Never — presence flags only |
| `models` | `{provider, models, selected, defaultModel}` (unchanged) | N/A |
| `pegaSaved` / `atlassianSaved` | `{type, success: true}` or `{type, success: false, error}` — `error` is a display-ready message from §7.2 | No |
| `pegaTestResult` / `atlassianTestResult` | `{type, success, message}` — messages from §7.2 | No |
| `pegaContextFetched` | `{type, success: true, message: "Fetched context: App \"{name}\" ({n} CaseTypes) → saved {path}"}` or `{success: false, message: "No workspace folder open to save Pega context." \| "Fetch failed: {message}"}` | No |
| `pegaPasswordCleared` / `atlassianCleared` | `{type, success: true}` or `{type, success: false, error}` | No |

**Example response (Workspace A):**

```json
{"type": "state", "pegaEndpoint": "https://pega-a.corp/prweb", "pegaUsername": "op.a", "hasPegaPassword": true, "atlassianBaseUrl": "https://a.atlassian.net", "atlassianEmail": "a@corp.local", "hasAtlassianToken": true, "atlassianConnectionType": "cloud"}
{"type": "pegaSaved", "success": true}
{"type": "atlassianSaved", "success": false, "error": "Invalid Jira Base URL format."}
{"type": "atlassianTestResult", "success": true, "message": "Connected as Alice Nguyen"}
```

### 8.3 Internal credential IPC (extension host → child MCP server)

Unchanged shape, workspace-scoped values — `AtlassianCredentialService.handleCredentialRequest()`:

```json
{
  "type": "credentials",
  "requestId": "<echoed request id>",
  "timestamp": 1727000000000,
  "credentials": {"email": "<this-workspace email>", "apiToken": "<this-workspace token>", "baseUrl": "<this-workspace url>"}
}
```

Failure (incomplete triple for the current workspace): throws `Error("Atlassian credentials not configured in extension.")` — message verbatim, no values.

---

## 9. Appendix

### 9.1 Glossary

| Term | Definition |
|------|------------|
| Workspace | A VS Code workspace folder (`workspaceFolders[0]`); the isolation boundary for Pega/Atlassian settings in this fix |
| wsHash (workspace code) | Short internal ID for a workspace folder (12 letters/numbers, e.g. `a3f9c1e2b4d5`) — you never need to type it; same folder → same code |
| SecretStorage | VS Code OS-keychain-backed secret store, global to the extension instance; key namespacing (`kiroSdlc.<wsHash>.*`) provides the per-workspace compartments |
| ConfigurationTarget | VS Code config scope: `Global` = user `settings.json` shared across workspaces; `Workspace` = `.vscode/settings.json` in the workspace folder |
| Migration | One-time, idempotent, per-workspace lazy copy of legacy global config + flat keychain keys into workspace scope on first use after upgrade (copy-not-move; workspace-wins; cleared-stays-cleared) |
| Read site | Any code that reads the config/secrets (`getCurrentState`, `PegaHttpClient.*`, `IndexingService`, `AtlassianCredentialService.getConfig`, IPC handlers) — all resolve the same workspace scope through the shared resolver |
| Connection Type | Atlassian deployment flavor (`cloud` \| `server`), workspace-scoped, default `cloud` |
| Resolver (`WorkspaceScopeResolver`) | The single shared helper (`getWorkspaceFolder`, `normalizePath`, `getWsHash`, `secretKey`, `migrationMarkerKey`, `ensureMigrated`) every reader/writer calls — no duplicated hashing |
| Presence flag | Boolean (`hasPegaPassword`, `hasAtlassianToken`) telling the UI whether *this workspace* has a secret stored, without revealing the value |
| PAT | Personal Access Token (Jira Server/Data Center password equivalent) |

### 9.2 Related Documents

| Document | Location |
|----------|----------|
| BRD | BRD-v1-SA4E-323.docx |
| FSD | FSD-v1-SA4E-323.docx |
| TDD | TDD-v1-SA4E-323.docx |
| Implementation | `extension/src/services/WorkspaceScopeResolver.ts`, `extension/src/services/ProviderConfigService.ts` (`clearPegaPassword`), `extension/src/services/AtlassianCredentialService.ts` (`clearConfig`), `extension/src/panels/settings/SettingsMessageHandler.ts` (clear IPC) |

### 9.3 Version Compatibility

| System Version | Config Version | Breaking Changes |
|---------------|---------------|-----------------|
| Extension 1.43.0 (with SA4E-323) | Per-workspace (`Workspace` scope + `kiroSdlc.<wsHash>.*` keychain keys) | Settings are now isolated per workspace; single-shared-credential workflows must save per workspace. Legacy globals retained, so rollback to the previous VSIX restores old behavior without data loss. |
| Pre-SA4E-323 versions | Global (`Global` scope + flat `kiroSdlc.pegaPassword` / `kiroSdlc.atlassian.*` keys) | — (source of the migrated legacy values) |
