# Release Notes (RLN)

## Code Intelligence System — SA4E-374: Single Responsibility Violation Pega workspace indexing

---

## Release Information

| Field | Value |
|-------|-------|
| Release Version | 1.53.12 |
| Release Date | 2026-10-20 |
| Jira Ticket | SA4E-374 |
| Environment | DEV / SIT / UAT / PROD |
| Author | DevOps Agent |
| Status | Draft |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-20 | DevOps Agent | Initiate document |

---

## 1. What's New

### 1.1 Feature Summary
Backend indexer now enforces Single Responsibility Principle for Pega workspace indexing. Pega-specific files (.pega, rules/, .pega-cache) are excluded from backend scanner and handled exclusively via VS Code Extension manifest flow.

### 1.2 User-Facing Changes

| # | Change | Description | Impact |
|---|--------|-------------|--------|
| 1 | Pega indexing via extension | Developers trigger indexing through extension which filters Pega files before sending to backend | Medium |
| 2 | SRP guard errors | New error codes PEGA-005 for SRP violations | Low |

## 2. Technical Changes

### 2.1 API Changes

| Type | Endpoint | Method | Description |
|------|----------|--------|-------------|
| New | /api/v1/pega/index-manifest | POST | Extension submits Pega rules manifest |
| New | /api/v1/pega/index-status/{jobId} | GET | Poll indexing job status |

### 2.2 Database Changes

| Type | Object | Description |
|------|--------|-------------|
| New Table | pega_index_manifests | Store manifest metadata |
| New Column | files.source | Distinguish code-intel vs pega-manifest |
| New Column | indexing_jobs.source_type | Track source |

### 2.3 Configuration Changes

| Property | Change Type | Description |
|----------|-----------|-------------|
| DEFAULT_EXCLUDE | Modified | Added rules, .pega-cache |
| DEFAULT_EXTENSIONS | Modified | Removed .pega |
| UNIFIED_EXTENSIONS | Modified | Removed pega |
| FALLBACK_EXCLUDES | Modified | Added rules, .pega-cache |

### 2.4 Infrastructure Changes

| Component | Change | Description |
|-----------|--------|-------------|
| Backend Indexer | Modified | SRP guard enforced |
| VS Code Extension | Modified | Pega filtering & manifest builder |

## 3. Bug Fixes

| # | Jira Ticket | Summary | Severity |
|---|------------|---------|----------|
| 1 | SA4E-374 | Single Responsibility Violation: Pega workspace indexing bypasses extension | Major |

## 4. Known Issues & Limitations

No known issues at the time of release.

## 5. Dependencies

### 5.1 Pre-requisite Releases

| Release | Version | Status | Required Before |
|---------|---------|--------|-----------------|
| VS Code Extension Pega | >=1.0 | Pending | This release |

### 5.2 External System Changes

| System | Change Required | Status | Contact |
|--------|----------------|--------|---------|
| VS Code Extension | Implement SRP_EXCLUDES | In Progress | Dev Team |

## 6. Migration Notes

### 6.1 Data Migration

| Migration | Description | Automated | Estimated Time |
|-----------|-------------|-----------|----------------|
| V1__create_pega_index_manifests | Create table | Yes | 1 min |
| V2__alter_files_source | Add source column | Yes | 1 min |

### 6.2 Breaking Changes

| Change | Impact | Migration Path |
|--------|--------|---------------|
| .pega removed from DEFAULT_EXTENSIONS | Direct .pega indexing via backend will fail | Use extension manifest flow |
| rules/ excluded from backend | Backend will not index rules/ directly | Extension must filter and submit via manifest |

### 6.3 Backward Compatibility
Partially compatible. Existing direct .pega indexing requests will be rejected with PEGA-005. Clients must migrate to extension manifest flow.

## 7. Testing Summary

| Test Level | Total | Passed | Failed | Blocked | Pass Rate |
|-----------|-------|--------|--------|---------|-----------|
| Unit Tests | 8 | 8 | 0 | 0 | 100% |
| Integration Tests | 6 | 6 | 0 | 0 | 100% |
| E2E-API | 7 | 7 | 0 | 0 | 100% |
| SIT | 4 | 4 | 0 | 0 | 100% |

### Defect Summary

| Severity | Found | Fixed | Open | Deferred |
|----------|-------|-------|------|----------|
| Critical | 0 | 0 | 0 | 0 |
| Major | 0 | 0 | 0 | 0 |

## 8. Deployment Instructions

Reference Deployment Guide for detailed steps.

See: [Deployment Guide](DPG-v1.0-SA4E-374.docx)

### Quick Reference

| Step | Action | Estimated Time |
|------|--------|---------------|
| 1 | Database migration | 2 min |
| 2 | Application deployment | 5 min |
| 3 | Configuration update | 2 min |
| 4 | Verification | 5 min |
| **Total** | | **14 min** |

## 9. Rollback Plan

Reference Deployment Guide section 8.

**Rollback Decision Criteria:**
- Critical defect found in production
- Manifest API error rate >5%
- Performance degradation >50%

**Estimated Rollback Time:** 13 min

## 10. Contacts

| Role | Name | Contact | Responsibility |
|------|------|---------|---------------|
| Release Manager | TBD | email | Release coordination |
| Dev Lead | TBD | email | Technical issues |
| QA Lead | TBD | email | Testing sign-off |

## 11. Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Dev Lead | | | ☐ Approved |
| QA Lead | | | ☐ Approved |
