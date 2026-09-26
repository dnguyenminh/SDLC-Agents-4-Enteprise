# Release Notes (RLN)

## Backend Admin UI — SA4E-244: Admin Project Scope dropdown shows IDs instead of workspace/project names

---

## Release Information

| Field | Value |
|-------|-------|
| Release Version | 1.0 |
| Release Date | 2026-09-05 |
| Jira Ticket | SA4E-244 |
| Environment | DEV / SIT / UAT / PROD |
| Author | DevOps Agent |
| Status | Draft |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-05 | DevOps Agent | Initiate document |

---

## 1. What's New

### 1.1 Feature Summary

Admin users on `localhost:48721/admin` now see human-readable workspace/project names in the Project Scope dropdown instead of opaque IDs. Identifiers remain accessible via tooltip for verification.

### 1.2 User-Facing Changes

| # | Change | Description | Impact |
|---|--------|-------------|--------|
| 1 | Project Scope dropdown labels | Dropdown options display display_name first, fallback to workspace basename then project_id slice | High |
| 2 | Identifier tooltip | Hovering an option shows project_id and workspace_path | Medium |
| 3 | All (Shared) unchanged | First option remains unchanged | Low |

### 1.3 Screenshots

N/A — UI change limited to label text.

---

## 2. Technical Changes

### 2.1 API Changes

| Type | Endpoint | Method | Description |
|------|----------|--------|-------------|
| Unchanged | /api/admin/projects | GET | Returns project_id, display_name, workspace_path, last_seen — schema unchanged |

### 2.2 Database Changes

| Type | Object | Description |
|------|--------|-------------|
| None | project_registry | No schema changes, existing display_name reused |

### 2.3 Configuration Changes

| Property | Change Type | Description |
|----------|-----------|-------------|
| N/A | None | No configuration changes |

### 2.4 Infrastructure Changes

| Component | Change | Description |
|-----------|--------|-------------|
| Admin UI HTML | Modified | Label rendering logic updated in backend/src/viewer/admin/index.html |

---

## 3. Bug Fixes

| # | Jira Ticket | Summary | Severity |
|---|------------|---------|----------|
| 1 | SA4E-244 | Admin Project Scope dropdown shows IDs instead of workspace/project names | Major |

---

## 4. Known Issues & Limitations

| # | Issue | Impact | Workaround | Target Fix |
|---|-------|--------|------------|------------|
| 1 | display_name may be empty for some projects | Fallback to workspace basename or ID slice | Acceptable fallback | Improve indexer data population |
| 2 | Optional ID visibility flag ADMIN_PROJECT_SCOPE_SHOW_ID not enabled | ID not shown in parentheses | Tooltip provides ID | Future release |

No critical known issues.

---

## 5. Dependencies

### 5.1 Pre-requisite Releases

None.

### 5.2 External System Changes

None.

---

## 6. Migration Notes

### 6.1 Data Migration

No data migration required.

### 6.2 Breaking Changes

No breaking changes. Fully backward compatible.

### 6.3 Backward Compatibility

Selection value remains project_id. API schema unchanged. UI change is display-only.

---

## 7. Testing Summary

| Test Level | Total | Passed | Failed | Blocked | Pass Rate |
|-----------|-------|--------|--------|---------|-----------|
| Unit Tests | 3 | 3 | 0 | 0 | 100% |
| Integration Tests | 4 | 4 | 0 | 0 | 100% |
| E2E-API | 3 | 3 | 0 | 0 | 100% |
| E2E-UI | 5 | 5 | 0 | 0 | 100% |
| SIT | 2 | 2 | 0 | 0 | 100% |

### Defect Summary

| Severity | Found | Fixed | Open | Deferred |
|----------|-------|-------|------|----------|
| Critical | 0 | 0 | 0 | 0 |
| Major | 0 | 0 | 0 | 0 |
| Minor | 0 | 0 | 0 | 0 |

QA Sign-off: All acceptance criteria satisfied. 100% pass rate. No regressions.

---

## 8. Deployment Instructions

Reference Deployment Guide for detailed steps.

See: DPG-v1.0-SA4E-244.docx

### Quick Reference

| Step | Action | Estimated Time |
|------|--------|---------------|
| 1 | Code merge | 2 min |
| 2 | Backend restart | 1 min |
| 3 | Verification | 3 min |
| **Total** | | **6 min** |

---

## 9. Rollback Plan

Reference Deployment Guide Section 8.

**Rollback Decision Criteria:**
- Dropdown blank or errors
- Performance degradation
- Critical defect

**Estimated Rollback Time:** 4 minutes

Rollback involves reverting backend/src/viewer/admin/index.html to previous version and restarting server. No database rollback required.

---

## 10. Contacts

| Role | Name | Contact | Responsibility |
|------|------|---------|---------------|
| Release Manager | DevOps Agent | — | Release coordination |
| QA Lead | QA Agent | — | Testing sign-off |
| DevOps | DevOps Agent | — | Deployment execution |

---

## 11. Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Dev Lead | | | ☐ Approved |
| QA Lead | | | ☐ Approved |
| Business Owner | | | ☐ Approved |
| Release Manager | | | ☐ Approved |
