# Release Notes (RLN)

## SDLC-Agents-4-Enterprise — SA4E-350: @baseclass AppliesTo + Short insKey Fix

---

## Release Information

| Field | Value |
|-------|-------|
| Release Version | 1.48.0 |
| Release Date | 2026-10-11 |
| Jira Ticket | SA4E-350 (includes SA4E-349) |
| Environment | PROD (Kiro / VS Code Extension) |
| Author | DevOps Agent |
| Status | Released |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-11 | DevOps Agent | Initiate document — version 1.48.0 released |

---

## 1. What's New

### 1.1 Feature Summary

This release fixes critical bugs in the Pega rule indexing pipeline that prevented proper discovery and download of system rules belonging to `@baseclass` (such as `pzBulkActions` and `pzModalButtonsConfiguration`). Users will now see these rules successfully indexed with full content, instead of "Not found" errors or handle-only entries.

### 1.2 User-Facing Changes

| # | Change | Description | Impact |
|---|--------|-------------|--------|
| 1 | @baseclass rules now index successfully | Rules like `pzBulkActions`, `pzModalButtonsConfiguration` that belong to `@baseclass` are now discovered and downloaded | High — previously these rules showed "Not found" |
| 2 | Full rule content fetched automatically | Indexing now performs follow-up calls to fetch complete rule JSON, not just handles | High — previously only `pzInsKey` handles were stored |
| 3 | Clear auth error messages | Authentication/configuration failures now surface actionable errors instead of silent failures | Medium — improves troubleshooting |

### 1.3 Screenshots

_No UI changes — this is a backend indexing fix. Extension UI unchanged._

---

## 2. Technical Changes

### 2.1 API Changes

| Type | Endpoint | Method | Description |
|------|----------|--------|-------------|
| Modified | `/api/CodeIntelligence/v1/rules/query` | POST | Now preserves `@baseclass` prefix in appliesTo filter for system rules |
| Modified | `/rules/instance` | GET | Now called with full `pzInsKey` (including `#timestamp`) after query returns handle-only rows |

### 2.2 Database Changes

**None** — No database schema changes.

### 2.3 Configuration Changes

| Property | Change Type | Description |
|----------|-------------|-------------|
| `pega.useCatalogExport` | Unchanged | Default `true` — continues to use fast catalog export |
| `pega.ingestConcurrency` | Unchanged | Default `10` — unchanged |

> No configuration changes required. New behavior enabled by default.

### 2.4 Infrastructure Changes

**None** — Extension-only release. No backend infrastructure changes.

---

## 3. Bug Fixes

| # | Jira Ticket | Summary | Severity |
|---|-------------|---------|----------|
| 1 | SA4E-350 | @baseclass appliesTo exact match — client stripped prefix causing 0 results for pzBulkActions, pzModalButtonsConfiguration | Critical |
| 2 | SA4E-350 | Short insKey (class-only) 404 on /rules/instance — full key with #timestamp required | Critical |
| 3 | SA4E-350 | Query returns handle-only rows — missing follow-up to fetch full content | Critical |
| 4 | SA4E-349 | Auth/Config fix — connection failures to Pega backend | Major |

---

## 4. Known Issues & Limitations

| # | Issue | Impact | Workaround | Target Fix |
|---|-------|--------|------------|------------|
| 1 | None known at time of release | N/A | N/A | N/A |

> No known issues at the time of release.

---

## 5. Dependencies

### 5.1 Pre-requisite Releases

| Release | Version | Status | Required Before |
|---------|---------|--------|-----------------|
| SDLC-Agents-4-Enterprise Extension | 1.47.x | Deployed | This release (1.48.0) |

### 5.2 External System Changes

| System | Change Required | Status | Contact |
|--------|----------------|--------|---------|
| Pega Platform | None — compatible with existing REST API | N/A | N/A |

---

## 6. Migration Notes

### 6.1 Data Migration

**None** — No data migration required. Existing KB entries remain valid; new indexing runs will populate full content.

### 6.2 Breaking Changes

**No breaking changes in this release. Fully backward compatible.**

### 6.3 Backward Compatibility

This release is **fully backward compatible**:

- Existing extension settings work unchanged
- Previously indexed KB entries remain accessible
- No configuration migration needed
- API contracts with Pega backend unchanged (only client-side query behavior fixed)

---

## 7. Testing Summary

| Test Level | Total | Passed | Failed | Blocked | Pass Rate |
|------------|-------|--------|--------|---------|-----------|
| Unit Tests | 6 | 6 | 0 | 0 | 100% |
| Integration Tests | 2405 | 2405 | 0 | 0 | 100% |
| Runtime Verification | 3 | 3 | 0 | 0 | 100% |

### Defect Summary

| Severity | Found | Fixed | Open | Deferred |
|----------|-------|-------|------|----------|
| Critical | 3 | 3 | 0 | 0 |
| Major | 1 | 1 | 0 | 0 |
| Minor | 0 | 0 | 0 | 0 |

### Runtime Verification Details

| # | Scenario | Status | Notes |
|---|----------|--------|-------|
| 1 | Real fixed client — pzBulkActions indexing | ✅ PASS | @baseclass preserved, full content fetched |
| 2 | Real fixed client — pzModalButtonsConfiguration indexing | ✅ PASS | @baseclass preserved, full content fetched |
| 3 | Regression: pxIsMobileDevice indexing | ✅ PASS | Existing non-@baseclass rules still work |

---

## 8. Deployment Instructions

See: [Deployment Guide](DPG-v1.0-SA4E-350.docx)

### Quick Reference

| Step | Action | Estimated Time |
|------|--------|---------------|
| 1 | Download .vsix (1.48.0) | < 30s |
| 2 | Install in Kiro/VS Code | < 30s |
| 3 | Reload window | < 10s |
| 4 | Verify extension loads | < 1 min |
| 5 | Run smoke tests (index source) | < 3 min |
| **Total** | | **~5 minutes** |

---

## 9. Rollback Plan

See: [Deployment Guide](DPG-v1.0-SA4E-350.docx) Section 8 for detailed steps.

**Rollback Decision Criteria:**
- Extension fails to activate
- @baseclass rules still show "Not found"
- Indexing crashes or hangs
- Auth errors not surfaced to user

**Estimated Rollback Time:** < 4 minutes

**Rollback Command:**
```bash
kiro --uninstall-extension dnguyenminh.sdlc-agents-4-enterprise
kiro --install-extension sdlc-agents-4-enterprise-1.47.2.vsix
```

---

## 10. Contacts

| Role | Name | Contact | Responsibility |
|------|------|---------|---------------|
| Release Manager | dnguyenminh | GitHub Issues | Release coordination |
| Dev Lead | dnguyenminh | GitHub Issues | Technical issues |
| QA Lead | dnguyenminh | GitHub Issues | Testing sign-off |
| DevOps | dnguyenminh | GitHub Issues | Deployment execution |
| Extension Publisher | dnguyenminh | VS Code Marketplace | Marketplace publishing |

---

## 11. Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Dev Lead | | | ☐ Approved |
| QA Lead | | | ☐ Approved |
| Business Owner | | | ☐ Approved |
| Release Manager | | | ☐ Approved |