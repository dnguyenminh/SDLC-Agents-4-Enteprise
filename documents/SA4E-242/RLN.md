# Release Notes (RLN)

## SDLC-Agents-4-Enterprise — SA4E-242: KB Scope Auto-Detection based on VCS presence and branch for Extension ingest

---

## Release Information

| Field | Value |
|-------|-------|
| Release Version | 1.41.1 |
| Release Date | 2026-09-06 |
| Jira Ticket | SA4E-242 |
| Environment | UAT / PROD |
| Author | DevOps Agent |
| Status | Released |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-05 | DevOps Agent | Initiate document |

---

## 1. What's New

### 1.1 Feature Summary

Automatic KB scope detection for Extension ingest based on VCS presence and current git branch. Developers working on feature branches will have KB entries stored under WORKSPACE scope, while main/master branches will store under PROJECT scope. Detector caches result for 5 minutes per workspace session.

### 1.2 User-Facing Changes

| # | Change | Description | Impact |
|---|--------|-------------|--------|
| 1 | Auto scope detection | KB entries automatically assigned WORKSPACE on feature branches / no VCS | High |
| 2 | Auto scope detection | KB entries automatically assigned PROJECT on main/master | High |
| 3 | Cache indicator | Logs show cache hit vs detected | Low |

---

## 2. Technical Changes

### 2.1 API Changes

None. Internal in-process function detectKbScope added.

### 2.2 Database Changes

None. Scope attribute used in existing mem_ingest payload.

### 2.3 Configuration Changes

| Property | Change Type | Description |
|----------|-----------|-------------|
| scope.autoDetect.enabled | New | Feature flag for scope auto-detection |
| scope.cache.ttlMs | New | Cache TTL 5 minutes |

### 2.4 Infrastructure Changes

| Component | Change | Description |
|-----------|--------|-------------|
| Extension src/services/scope-detector.ts | New | detectKbScope implementation |
| BaseNode.kbIngest | Modified | Uses detector for default scope |
| PegaSchemaIndexer, AttachmentFetcher, KbEntryBuilder, JiraProjectIndexer | Modified | Replace hard-coded PROJECT |

---

## 3. Bug Fixes

No bug fixes included in this release.

---

## 4. Known Issues & Limitations

| # | Issue | Impact | Workaround | Target Fix |
|---|-------|--------|------------|------------|
| 1 | Git command timeout >500ms falls back to WORKSPACE | May cause PROJECT entries to be misclassified on slow repos | None | Monitor and tune timeout |
| 2 | No UI manual override | Users cannot override auto detection | Use scopeOverride option in code | Future enhancement |

---

## 5. Dependencies

### 5.1 Pre-requisite Releases

| Release | Version | Status | Required Before |
|---------|---------|--------|-----------------|
| SA4E-30 | 1.0 | Deployed | This release |
| SA4E-31 | 1.0 | Deployed | This release |

### 5.2 External System Changes

None.

---

## 6. Migration Notes

### 6.1 Data Migration

| Migration | Description | Automated | Estimated Time |
|-----------|-------------|-----------|----------------|
| None | Scope detection is forward-only | N/A | N/A |

### 6.2 Breaking Changes

No breaking changes. Fully backward compatible. Existing PROJECT ingest on main unaffected.

### 6.3 Backward Compatibility

Fully backward compatible. If detector fails, fallback to WORKSPACE.

---

## 7. Testing Summary

| Test Level | Total | Passed | Failed | Blocked | Pass Rate |
|-----------|-------|--------|--------|---------|-----------|
| Unit Tests | 12 | 12 | 0 | 0 | 100% |
| Integration Tests | 8 | 8 | 0 | 0 | 100% |
| SIT | 5 | 5 | 0 | 0 | 100% |
| UAT | 5 | 5 | 0 | 0 | 100% |

---

## 8. Deployment Instructions

Reference the Deployment Guide for detailed steps.

See: [Deployment Guide](DPG-v1.0-SA4E-242.docx)

### Quick Reference

| Step | Action | Estimated Time |
|------|--------|---------------|
| 1 | Build extension | 5 min |
| 2 | Build backend | 3 min |
| 3 | Deploy to UAT | 10 min |
| 4 | Verification | 15 min |
| **Total** | | **33 min** |

---

## 9. Rollback Plan

Reference the Deployment Guide for detailed rollback steps.

**Rollback Decision Criteria:**
- Scope detection error rate >5%
- Performance degradation >50ms p95
- Incorrect scope assignment reported

**Estimated Rollback Time:** 17 min

---

## 10. Contacts

| Role | Name | Contact | Responsibility |
|------|------|---------|---------------|
| Release Manager | | | Release coordination |
| Dev Lead | | | Technical issues |
| QA Lead | | | Testing sign-off |
| DevOps | | | Deployment execution |

---

## 11. Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Dev Lead | | | ☐ Approved |
| QA Lead | | | ☐ Approved |
| Business Owner | | | ☐ Approved |
| Release Manager | | | ☐ Approved |
