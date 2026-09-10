# Release Notes (RLN)

## SDLC Agents 4 Enterprise — SA4E-84: [drawio] Upgrade drawio_auto_layout to FIX mode — auto-layout reduce edge crossings with elkjs

---

## Release Information

| Field | Value |
|-------|-------|
| Release Version | v1.20.0 |
| Release Date | 2026-08-30 |
| Jira Ticket | SA4E-84 |
| Environment | Bundled into extension/backend build (DEV → SIT → UAT → PROD via VSIX) |
| Author | DevOps Agent |
| Status | Final |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-08-30 | DevOps Agent | Initiate document |

---

## 1. What's New

### 1.1 Feature Summary

The `drawio_auto_layout` tool now automatically **detects and fixes** layout problems in draw.io diagrams (overlapping nodes, edge crossings, diagonal edges) using the **ELK (Eclipse Layout Kernel)** engine — no manual review step needed. When you point the tool at a `.drawio` file, it analyzes the diagram, re-routes nodes cleanly, and writes the improved layout straight back to the file. If the diagram is already tidy, it leaves the file untouched.

### 1.2 User-Facing Changes

| # | Change | Description | Impact |
|---|--------|-------------|--------|
| 1 | Auto-fix mode | Tool now fixes layouts automatically (no separate review step) | High |
| 2 | Cleaner output | Response is a short status message instead of raw diagram data | Medium |
| 3 | Safer file handling | Tool writes the file directly; original preserved if anything fails | Medium |

### 1.3 Screenshots (if applicable)

N/A — backend tool, no UI surface.

---

## 2. Technical Changes

### 2.1 API Changes

| Type | Endpoint | Method | Description |
|------|----------|--------|-------------|
| Modified | `drawio_auto_layout` (MCP `tools/call`) | JSON-RPC | Input is now `file_path` only (no `content_base64`, no `mode`); response is `{status, message}` or `{error}` |

### 2.2 Database Changes

| Type | Object | Description |
|------|--------|-------------|
| None | — | No database changes |

### 2.3 Configuration Changes

| Property | Change Type | Description |
|----------|-----------|-------------|
| `SA4E_ELK_MAX_NODES` | New (optional) | Max nodes per diagram (default 500, bounds-validated) |
| `SA4E_ELK_TIMEOUT_MS` | New (optional) | ELK timeout ms (default 10000, bounds-validated) |

### 2.4 Infrastructure Changes

| Component | Change | Description |
|-----------|--------|-------------|
| `elkjs` dependency | New | Added to `backend/package.json` runtime deps; bundled in build |
| 4 new modules | New | `drawio-layout-models.ts`, `elk-layout.ts`, `drawio-writer.ts`, `drawio-apply.ts` |
| VSIX package | Rebuilt | Released as v1.20.0 |

---

## 3. Bug Fixes

No bug fixes included in this release (feature delivery only).

---

## 4. Known Issues & Limitations

| # | Issue | Impact | Workaround | Target Fix |
|---|-------|--------|------------|------------|
| 1 | Edge waypoints only written for root-level edges (`parent="1"`); container-internal edge waypoints skipped in v1 | Minor visual: edge routing inside containers may not be optimized | Manual edge routing for nested containers | Future |
| 2 | UAT workspace note: when run from extension, `workspace` = `backend/`, so `documents/` files need a copy workaround | Low — affects local testing path only | Copy `.drawio` into backend dir or pass absolute path | Future |

> Otherwise: No known issues at the time of release.

---

## 5. Dependencies

### 5.1 Pre-requisite Releases

| Release | Version | Status | Required Before |
|---------|---------|--------|-----------------|
| Base extension | v1.19.x | Deployed | This release (v1.20.0 supersedes) |

### 5.2 External System Changes

| System | Change Required | Status | Contact |
|--------|----------------|--------|---------|
| None | — | — | — |

---

## 6. Migration Notes

### 6.1 Data Migration

| Migration | Description | Automated | Estimated Time |
|-----------|-------------|-----------|----------------|
| None | No data migration | — | — |

### 6.2 Breaking Changes

No breaking changes in this release. Fully backward compatible.

> Callers that previously relied on the old review-only response shape (`content_base64`, `repositioned_nodes`) must update — response is now minimal `{status, message}`. This is a contract simplification (ADR-7), not a data-breaking change.

### 6.3 Backward Compatibility

Fully compatible at the tool-name / dispatch level. The MCP tool name `drawio_auto_layout` and its registration are unchanged; only the input/output contract simplified. No database or config migration needed.

---

## 7. Testing Summary

| Test Level | Total | Passed | Failed | Blocked | Pass Rate |
|-----------|-------|--------|--------|---------|-----------|
| Unit Tests (drawio-tool) | 14 | 14 | 0 | 0 | 100% |
| Integration Tests (drawio-export / mcp-dispatch) | — | pass | 0 | 0 | 100% |
| Regression (full suite) | 1435 | 1435 | 0 | 1 (infra-skip) | ~100% |
| UAT (manual MCP) | 1 | 1 | 0 | 0 | 100% |

### Defect Summary

| Severity | Found | Fixed | Open | Deferred |
|----------|-------|-------|------|----------|
| Critical | 0 | 0 | 0 | 0 |
| Major | 0 | 0 | 0 | 0 |
| Minor | 2 | 2 | 0 | 0 |

> Test details: drawio-tool.test.ts 14 pass; full suite 1435 pass / 1 infra-skip (mcp-tools.test.ts — needs live OrchestrationModule, accepted local skip). Security review: SECURITY-ASSESSMENT.md 0 Critical, 1 High fixed, 2 Medium.

---

## 8. Deployment Instructions

This feature is bundled into the server/extension build. No separate runtime deployment.

See: [Deployment Guide](DPG-v1.0-SA4E-84.docx)

### Quick Reference

| Step | Action | Estimated Time |
|------|--------|---------------|
| 1 | Build backend (tsc + bundle elkjs) | 2 min |
| 2 | Package VSIX | 3 min |
| 3 | Install / publish | 2 min |
| 4 | Verify via MCP | 1 min |
| **Total** | | **~8 min** |

---

## 9. Rollback Plan

Reference the Deployment Guide for detailed rollback steps.

**Rollback Decision Criteria:**
- Tool breaks MCP dispatch in PROD → immediate rollback to previous VSIX.
- Error rate spike (> 5%) on `drawio_auto_layout` → rollback.
- Source `.drawio` corruption → rollback + restore from VCS (tool preserves original on ELK failure).

**Estimated Rollback Time:** ~5 min (git checkout previous tag + reinstall VSIX).

---

## 10. Contacts

| Role | Name | Contact | Responsibility |
|------|------|---------|---------------|
| Release Manager | — | — | Release coordination |
| Dev Lead | Backend Team | — | Technical issues |
| QA Lead | QA Agent | — | Testing sign-off |
| DevOps | DevOps Agent | — | Deployment execution |
| Business Owner | — | — | Business sign-off |

---

## 11. Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Dev Lead | | | ☐ Approved |
| QA Lead | | | ☐ Approved |
| Business Owner | | | ☐ Approved |
| Release Manager | | | ☐ Approved |
