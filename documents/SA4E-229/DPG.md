# Deployment Guide (DPG)

## SDLC Agents 4 Enterprise — SA4E-229: Implement jira_download_attachment tool to fix 403 error when fetching attachments

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-229 |
| Title | Implement jira_download_attachment tool to fix 403 error when fetching attachments |
| Author | DevOps Agent |
| Version | 1.1 |
| Date | 2026-08-28 |
| Status | Draft |
| Related TDD | TDD-v1.0-SA4E-229 |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-08-28 | DevOps Agent | Initial (backend MCP server) — REVERTED (wrong location) |
| 1.1 | 2026-08-28 | DevOps Agent | Corrected: tool lives in the **extension** in-process local MCP tools |

---

## 1. Overview

### 1.1 Feature Summary

SA4E-229 delivers a new in-process local MCP tool, `jira_download_attachment`, **inside the JiraAssist extension** (VS Code / Kiro). The tool downloads Jira attachment content using the extension's authenticated session (`AtlassianHttpClient` → `AtlassianCredentialService` from SecretStorage) and returns `content_base64` / `content_text`, `mime_type`, `size_bytes`, and `filename`. It eliminates the `403 Forbidden` error that occurred when agents used unauthenticated `webfetch` on attachment URLs.

### 1.2 Deployment Scope

| Item | Type | Description |
|------|------|-------------|
| `jira_download_attachment` MCP tool | New (extension in-process) | Added to `extension/src/mcp/atlassian/jira-attachment-tools.ts`; registered via `registerJiraAttachmentTools()` in the extension host. |
| Extension build artifact (`.vsix`) | Modified | Rebuilt from TypeScript; the tool is bundled into the extension package. |
| Database | No change | TDD §4 — no persistent DB required. |
| Configuration | No new variables | Reuses existing `AtlassianCredentialService` SecretStorage config. |
| Backend MCP server | Out of Scope | `backend/src/servers/atlassian` intentionally does NOT expose this tool (reverted in PR #8). |
| VS Code / Kiro Extension | **In Scope** | The extension's in-process Jira attachment tools now expose `jira_download_attachment`. |

### 1.3 Target Environments

| Environment | Host | Deploy Order | Approval Required |
|-------------|------|--------------|-------------------|
| DEV | Local extension dev host | 1st | No |
| SIT | Packaged `.vsix` on test profile | 2nd | No |
| UAT | Packaged `.vsix` on UAT profile | 3rd | QA Sign-off |
| PROD | Marketplace / shared `.vsix` | 4th | PM + Business Sign-off |

---

## 2. Prerequisites

### 2.1 Infrastructure
| Requirement | Status | Notes |
|-------------|--------|-------|
| Extension dev runtime (VS Code / Kiro + Node 20) | Ready | For building/packaging. |
| Network access to Jira Cloud | Ready | Tool calls `https://<instance>.atlassian.net/secure/attachment/...` |
| Jira authenticated session in extension | Ready | Existing `AtlassianCredentialService` (SecretStorage) — no new secret. |

### 2.2 Software Dependencies
| Dependency | Version | Status |
|-----------|---------|--------|
| Node.js | >= 20 | Installed |
| `@vscode/vsce` | latest | For packaging `.vsix` |
| TypeScript | per extension/package.json | Installed |

### 2.3 Access Requirements
| Access | Type | Who Needs It |
|--------|------|-------------|
| Atlassian API token (SecretStorage) | Secret | Extension user / service account |
| VSIX publish (marketplace) | Token | Release pipeline |

### 2.4 Backup Requirements
- [x] No database migration.
- [ ] Previous extension `.vsix` retained for rollback.

---

## 3. Pre-Deployment Checklist

| # | Item | Responsible | Status |
|---|------|-------------|--------|
| 1 | Code merged to `main` (PR #9) | Developer | ☑ |
| 2 | Extension typecheck passes (`npx tsc --noEmit` in `extension/`) | Developer | ☐ |
| 3 | Unit/integration tests passed | QA | ☐ (extension has no IT harness yet; see §7.2) |
| 4 | SIT/UAT sign-off obtained | QA + BA | ☐ |
| 5 | Configuration prepared (no new vars) | DevOps | ☐ |
| 6 | Rollback plan reviewed | Team | ☐ |

---

## 4. Database Migration
No database migration required (TDD §4).

---

## 5. Application Deployment (Extension)

### 5.1 Build & Package
| Step | Action | Command | Verification |
|------|--------|---------|-------------|
| 1 | Install deps | `cd extension && npm ci` | node_modules present |
| 2 | Typecheck | `npx tsc --noEmit` | 0 errors (excluding pre-existing `IManager`) |
| 3 | Compile | `npm run compile` | `dist/` emitted |
| 4 | Package | `npx vsce package` | `sdlc-agents-4-enterprise-<ver>.vsix` produced |

### 5.2 Install / Reload
| Step | Action | Command | Verification |
|------|--------|---------|-------------|
| 1 | Install VSIX | `code --install-extension <file>.vsix` (or Kiro equivalent) | Extension installed |
| 2 | Reload window | Reload editor window | Extension active |
| 3 | Tool registered | MCP `tools/list` from agent inside extension includes `jira_download_attachment` | present |

> The tool is registered in-process by `registerJiraAttachmentTools()` — no separate backend service to restart.

### 5.3 CI/CD
Per-ticket gate `.github/workflows/ci-sa4e-229.yml` builds the extension and runs typecheck/lint.

---

## 6. Configuration Changes
No new environment variables. Reuses `AtlassianCredentialService` (SecretStorage) already used by `jira_get_attachments` / `jira_attach_file`.

---

## 7. Post-Deployment Verification

### 7.1 Health Checks
| Check | Command | Expected |
|-------|---------|----------|
| Extension active | editor shows extension enabled | enabled |
| Tool registered | MCP `tools/list` inside extension | `jira_download_attachment` present |

### 7.2 Smoke Tests
| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 1 | Download by valid ID | Invoke `jira_download_attachment` with `attachment_id` | 200, `content_base64` + `mime_type` + `filename`, no 403 |
| 2 | Download by valid URL | Invoke with `attachment_url` from `jira_get_attachments` | content matches, no 403 |
| 3 | 403 regression | Confirm auth headers used | no 403 |
| 4 | Regression | `jira_get_attachments` still works | unchanged |

### 7.3 Log Verification
Per TDD §9, attachment content is never logged (only metadata: size, mime, error codes).

---

## 8. Rollback Plan
| Step | Action | Verification |
|------|--------|-------------|
| 1 | Install previous `.vsix` | previous extension active |
| 2 | Reload window | tool no longer listed |

No DB rollback needed.

---

## 9. Environment-Specific Notes
### 9.1 DEV — run extension in dev host (`F5` debug), validate via agent MCP `tools/list`.
### 9.2 SIT — install packaged `.vsix` on test profile.
### 9.3 UAT — QA sign-off; validate TC-001/002/202 (download by ID/URL, 403 fix).
### 9.4 PROD — marketplace / shared `.vsix`; PM approval.

---

## 10. Appendix
### Related Tickets
| Ticket | Summary | Relationship |
|--------|---------|-------------|
| SA4E-229 | Implement jira_download_attachment tool to fix 403 error | Main |

### CI/CD Reference
- `.github/workflows/ci-sa4e-229.yml`
- Reverted backend attempt: PR #8 (undo), corrected: PR #9 (extension).
