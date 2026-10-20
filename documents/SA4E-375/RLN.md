# Release Notes (RLN)

## SDLC-Agents-4-Enterprise — SA4E-375: PROJECT_NOT_REGISTERED khi index vào KB

---

## Release Information

| Field | Value |
|-------|-------|
| Release Version | v1.15.0-sa4e-375 |
| Release Date | 2026-10-19 |
| Jira Ticket | SA4E-375 |
| Environment | DEV/SIT/UAT/PROD |
| Author | DevOps Agent |
| Status | Draft |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-19 | DevOps Agent | Initiate document |

---

## 1. What's New

### 1.1 Feature Summary

Cải thiện độ tin cậy khi index dữ liệu vào Knowledge Base bằng cách tự động đăng ký project nếu chưa tồn tại, ổn định projectId qua workspace, và mở rộng auto-register cho MCP tools.

### 1.2 User-Facing Changes

| # | Change | Description | Impact |
|---|--------|-------------|--------|
| 1 | Auto-register project | Indexing không còn lỗi PROJECT_NOT_REGISTERED | High |
| 2 | Stable projectId | projectId được persist trong .code-intel/project.json | Medium |

### 1.3 Screenshots

N/A

---

## 2. Technical Changes

### 2.1 API Changes

| Type | Endpoint | Method | Description |
|------|----------|--------|-------------|
| Modified | /api/admin/kb/entries | POST | Guard auto-upsert project thay vì 404 |
| Modified | /api/admin/projects/register | POST | Idempotent, trả 201/409 |

### 2.2 Database Changes

| Type | Object | Description |
|------|--------|-------------|
| No change | project_registry | Không thay đổi schema |

### 2.3 Configuration Changes

| Property | Change Type | Description |
|----------|-----------|-------------|
| ensureProjectRegistered.mode | Modified | Chuyển từ fail-fast sang auto-upsert |

### 2.4 Infrastructure Changes

| Component | Change | Description |
|-----------|--------|-------------|
| Backend | Modified | Thêm auto-upsert logic |
| Extension | Modified | Stable projectId derivation |

---

## 3. Bug Fixes

| # | Jira Ticket | Summary | Severity |
|---|------------|---------|----------|
| 1 | SA4E-375 | PROJECT_NOT_REGISTERED khi index vào KB | Critical |

---

## 4. Known Issues & Limitations

| # | Issue | Impact | Workaround | Target Fix |
|---|-------|--------|------------|------------|
| 1 | MCP tool cũ có thể cache projectId cũ | Index lỗi tạm thời | Restart extension | v1.16 |

---

## 5. Dependencies

### 5.1 Pre-requisite Releases

| Release | Version | Status | Required Before |
|---------|---------|--------|-----------------|
| Backend base | v1.14.9 | Deployed | This release |

### 5.2 External System Changes

None.

---

## 6. Migration Notes

### 6.1 Data Migration

| Migration | Description | Automated | Estimated Time |
|-----------|-------------|-----------|----------------|
| None | No schema migration | N/A | 0 min |

### 6.2 Breaking Changes

| Change | Impact | Migration Path |
|--------|--------|---------------|
| None | N/A | N/A |

> No breaking changes in this release. Fully backward compatible.

### 6.3 Backward Compatibility

Fully compatible. Existing projects giữ nguyên projectId.

---

## 7. Testing Summary

| Test Level | Total | Passed | Failed | Blocked | Pass Rate |
|-----------|-------|--------|--------|---------|-----------|
| Unit Tests | 45 | 45 | 0 | 0 | 100% |
| Integration Tests | 12 | 12 | 0 | 0 | 100% |

---

## 8. Deployment Instructions

Reference Deployment Guide for detailed steps.

See: [Deployment Guide](DPG-v1.0-SA4E-375.docx)

### Quick Reference

| Step | Action | Estimated Time |
|------|--------|---------------|
| 1 | Backend deploy | 5 min |
| 2 | Extension update | 2 min |
| 3 | Verification | 5 min |
| **Total** | | **12 min** |

---

## 9. Rollback Plan

Reference Deployment Guide.

**Rollback Decision Criteria:**
- Critical defect found
- Duplicate project creation
- Error rate >5%

**Estimated Rollback Time:** 10 min

---

## 10. Contacts

| Role | Name | Contact | Responsibility |
|------|------|---------|---------------|
| Release Manager | TBD | Email | Release coordination |
| Dev Lead | TBD | Email | Technical issues |
| QA Lead | TBD | Email | Testing sign-off |
| DevOps | TBD | Email | Deployment execution |

---

## 11. Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Dev Lead | | | ☐ Approved |
| QA Lead | | | ☐ Approved |
| Business Owner | | | ☐ Approved |
| Release Manager | | | ☐ Approved |
