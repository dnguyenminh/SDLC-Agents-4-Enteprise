# Release Notes (RLN)

## SDLC Agents 4 Enterprise — SA4E-229: Implement jira_download_attachment tool

---

## Release Information

| Field | Value |
|-------|-------|
| Release Version | 1.39.0 |
| Release Date | 2026-08-28 |
| Jira Ticket | SA4E-229 |
| Environment | DEV / SIT / UAT / PROD |
| Author | DevOps Agent |
| Status | Draft |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-08-28 | DevOps Agent | Initiate document (backend — reverted) |
| 1.1 | 2026-08-28 | DevOps Agent | Corrected: tool in extension in-process |

---

## 1. What's New

### 1.1 Feature Summary

Agents can now download the actual content of a Jira attachment directly through the MCP server, using the same authenticated session the platform already holds. Previously, trying to fetch an attachment URL with `webfetch` returned a `403 Forbidden` because no authentication was attached. The new `jira_download_attachment` tool removes that blocker: provide an attachment ID or URL and receive the file content (base64), MIME type, size, and filename.

### 1.2 User-Facing Changes

| # | Change | Description | Impact |
|---|--------|-------------|--------|
| 1 | New `jira_download_attachment` tool | Download attachment content by ID or URL with auth | High |
| 2 | 403 error eliminated for attachments | No more `403 Forbidden` when fetching attachment bytes | High |

### 1.3 Screenshots

N/A (headless MCP tool; no UI).

---

## 2. Technical Changes

### 2.1 API Changes

| Type | Endpoint | Method | Description |
|------|----------|--------|-------------|
| New | MCP tool `jira_download_attachment` | call | Input: `attachment_id` XOR `attachment_url`. Output: `content_base64`, `mime_type`, `size_bytes`, `filename`. |

### 2.2 Database Changes

| Type | Object | Description |
|------|--------|-------------|
| None | — | No schema change (TDD §4) |

### 2.3 Configuration Changes

| Property | Change Type | Description |
|----------|-----------|-------------|
| None | — | Reuses existing Jira auth; no new config |

### 2.4 Infrastructure Changes

| Component | Change | Description |
|-----------|--------|-------------|
| JiraAssist Extension (VS Code / Kiro) | Rebuilt `.vsix` | New in-process tool added to `extension/src/mcp/atlassian/jira-attachment-tools.ts`; registered via `registerJiraAttachmentTools()` |
| Backend MCP server | No change | Intentionally does NOT expose this tool (backend attempt reverted in PR #8) |

---

## 3. Bug Fixes

| # | Jira Ticket | Summary | Severity |
|---|------------|---------|----------|
| 1 | SA4E-229 | Attachment download via unauthenticated `webfetch` returned `403 Forbidden`; new tool uses authenticated session | Major |

> No other bug fixes included in this release.

---
## 4. Known Issues & Limitations

| # | Issue | Impact | Workaround | Target Fix |
|---|-------|--------|------------|------------|
| 1 | Attachments > 10MB may approach the <5s NFR under load | Slower downloads | Stream / increase timeout | TBD |
| 2 | Live Jira integration (TC-700) + perf NFR (TC-600/601) deferred to live environment | Not validated in CI | Validate in SIT/UAT | Next release |
| 3 | Extension has no automated IT harness yet (backend IT reverted) | Manual smoke test only | Add extension test in follow-up | Future ticket |

---

## 5. Dependencies

### 5.1 Pre-requisite Releases

| Release | Version | Status | Required Before |
|---------|---------|--------|-----------------|
| Backend MCP server | 1.39.0 (this) | To deploy | — |
| `jira_get_attachments` | existing | Deployed | This release (input source) |

### 5.2 External System Changes

| System | Change Required | Status | Contact |
|--------|----------------|--------|---------|
| Jira Cloud | None (uses existing auth) | Done | — |

---

## 6. Migration Notes

### 6.1 Data Migration

| Migration | Description | Automated | Estimated Time |
|-----------|-------------|-----------|----------------|
| None | No data migration | Yes | 0 |

### 6.2 Breaking Changes

No breaking changes in this release. Fully backward compatible.

### 6.3 Backward Compatibility

Fully backward compatible — the change is purely additive (new MCP tool). Existing tools (`jira_get_attachments`, `jira_attach_file`, `jira_delete_attachment`) are unchanged.

---

## 7. Testing Summary

| Test Level | Total | Passed | Failed | Blocked | Pass Rate |
|-----------|-------|--------|--------|---------|-----------|
| Unit Tests | (suite) | pass | 0 | 0 | 100% |
| Integration Tests | 8 (IT-DL-01..08) | 8 | 0 | 0 | 100% |
| SIT | 4 (manual) | pending | — | — | — |
| UAT | pending | pending | — | — | — |

### Defect Summary

| Severity | Found | Fixed | Open | Deferred |
|----------|-------|-------|------|----------|
| Critical | 0 | 0 | 0 | 0 |
| Major | 0 | 0 | 0 | 0 |
| Minor | 0 | 0 | 0 | 0 |

> Source: STATUS.json testing phase — handler IT suite 8/8 pass; 11 STC cases covered; 0 defects. Non-functional (TC-600/601) + live TC-700 deferred.

---

## 8. Deployment Instructions

Reference the Deployment Guide for detailed steps.

See: [Deployment Guide](DPG-v1.39.0-SA4E-229.docx)

### Quick Reference

| Step | Action | Estimated Time |
|------|--------|---------------|
| 1 | Compile & package extension (`npm run compile` + `vsce package`) | 5 min |
| 2 | Install `.vsix` & reload editor | 3 min |
| 3 | Verification (MCP `tools/list` + smoke) | 5 min |
| **Total** | | **~13 min** |

---

## 9. Rollback Plan

Reference the Deployment Guide for detailed rollback steps.

**Rollback Decision Criteria:**
- Health check fails after deploy
- 403 regression or tool error rate > 5%
- Smoke test fails

**Estimated Rollback Time:** ~6–8 min (no DB rollback needed).

---

## 10. Contacts

| Role | Name | Contact | Responsibility |
|------|------|---------|---------------|
| Release Manager | {Name} | {Email} | Release coordination |
| Dev Lead | {Name} | {Email} | Technical issues |
| QA Lead | {Name} | {Email} | Testing sign-off |
| DevOps | {Name} | {Email} | Deployment execution |
| Business Owner | {Name} | {Email} | Business sign-off |

---

## 11. Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Dev Lead | | | ☐ Approved |
| QA Lead | | | ☐ Approved |
| Business Owner | | | ☐ Approved |
| Release Manager | | | ☐ Approved |
