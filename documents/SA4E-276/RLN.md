# Release Notes (RLN)

## SA4E — SA4E-276: Admin UI for Entra SSO configuration management

---

## Release Information

| Field | Value |
|-------|-------|
| Release Version | v1.0 |
| Release Date | 2026-09-17 |
| Jira Ticket | SA4E-276 |
| Environment | UAT |
| Author | DevOps Agent |
| Status | Draft |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-17 | DevOps Agent | Initiate document |

---

## 1. What's New

### 1.1 Feature Summary

Administrators can now manage Microsoft Entra SSO configuration via Admin Portal UI without code deployment. The new Entra SSO Configuration page allows view, create, update and delete of SSO settings with secure secret storage in Secret Store, RBAC enforcement, and hot reload support.

### 1.2 User-Facing Changes

| # | Change | Description | Impact |
|---|--------|-------------|--------|
| 1 | Entra SSO Configuration page | New Settings → Authentication → Entra SSO Configuration screen with fields for Tenant ID, Client ID, Client Secret, Redirect URI, Issuer URL, JWKS URL, Enabled toggle | High |
| 2 | Secret masking | Client secret displayed as ******** in UI | Medium |
| 3 | RBAC edit controls | Edit button hidden for users without Auth Admin/System Admin role | High |
| 4 | Status badge | Connection health status visible on config page | Medium |

### 1.3 Screenshots

Screenshots of new UI features are available in FSD diagrams.

---

## 2. Technical Changes

### 2.1 API Changes

| Type | Endpoint | Method | Description |
|------|----------|--------|-------------|
| New | /api/v1/entra-sso/config | GET | Retrieve config masked |
| New | /api/v1/entra-sso/config | POST | Create config with secret store write |
| New | /api/v1/entra-sso/config/{id} | PUT | Update config, retain secretRef if unchanged |
| New | /api/v1/entra-sso/config/{id} | DELETE | Delete config and trigger audit |

### 2.2 Database Changes

| Type | Object | Description |
|------|--------|-------------|
| New Table | entra_sso_config | Stores tenantId, clientId, secretRef, redirectUri, issuerUrl, jwksUrl, enabled, status |
| New Table | audit_log | Logs config create/update/delete actions with user and timestamp |

### 2.3 Configuration Changes

| Property | Change Type | Description |
|----------|-----------|-------------|
| SECRET_STORE_URL | New | Endpoint for Secret Store Service |
| CONFIG_SERVICE_URL | New | Endpoint for Config Reload Service |
| ENTRA_SSO_MANAGEMENT_ENABLED | New | Feature flag to enable/disable management UI |

### 2.4 Infrastructure Changes

| Component | Change | Description |
|-----------|--------|-------------|
| Admin API Module | Modified | New EntraSsoController, EntraSsoService with Secret Store client |
| Admin Portal UI | New | Svelte components for Entra SSO configuration page |

---

## 3. Bug Fixes

No bug fixes included in this release.

---

## 4. Known Issues & Limitations

| # | Issue | Impact | Workaround | Target Fix |
|---|-------|--------|------------|------------|
| 1 | Secret Store migration for existing plain text secrets | High | Manual migration required | SA4E-276 Follow-up |
| 2 | Hot reload may require controlled restart if reload service unavailable | Medium | Manual restart available | Monitor |

> If no known issues, state: "No known issues at the time of release."

---

## 5. Dependencies

### 5.1 Pre-requisite Releases

| Release | Version | Status | Required Before |
|---------|---------|--------|-----------------|
| SA4E-271 Secret Store Service | v1.0 | Deployed | This release |
| SA4E-264 Config Reload Service | v1.0 | Deployed | This release |
| SA4E-273 Admin Portal UI Framework | v1.0 | Deployed | This release |

### 5.2 External System Changes

| System | Change Required | Status | Contact |
|--------|----------------|--------|---------|
| Microsoft Entra ID | App registration exists | Done | Security Team |
| Secret Store Service | API accessible | Done | DevOps |

---

## 6. Migration Notes

### 6.1 Data Migration

| Migration | Description | Automated | Estimated Time |
|-----------|-------------|-----------|----------------|
| V1__create_entra_sso_config.sql | Create config table | Yes | 30s |
| V2__create_audit_log.sql | Create audit log table | Yes | 30s |

### 6.2 Breaking Changes

No breaking changes in this release. Fully backward compatible.

### 6.3 Backward Compatibility

Fully backward compatible. Existing authentication flows unaffected.

---

## 7. Testing Summary

| Test Level | Total | Passed | Failed | Blocked | Pass Rate |
|-----------|-------|--------|--------|---------|-----------|
| Unit Tests | 2901 | 2901 | 0 | 0 | 100% |
| Integration Tests | 26 | 26 | 0 | 0 | 100% |
| SIT | 8 | 8 | 0 | 0 | 100% |
| UAT | 0 | 0 | 0 | 0 | - |

### Defect Summary

| Severity | Found | Fixed | Open | Deferred |
|----------|-------|-------|------|----------|
| Critical | 0 | 0 | 0 | 0 |
| Major | 0 | 0 | 0 | 0 |
| Minor | 0 | 0 | 0 | 0 |

---

## 8. Deployment Instructions

Reference the Deployment Guide for detailed steps.

See: [Deployment Guide](DPG-v1.0-SA4E-276.docx)

### Quick Reference

| Step | Action | Estimated Time |
|------|--------|---------------|
| 1 | Database migration | 1 min |
| 2 | Application deployment | 5 min |
| 3 | Configuration update | 2 min |
| 4 | Verification | 5 min |
| **Total** | | **13 min** |

---

## 9. Rollback Plan

Reference the Deployment Guide for detailed rollback steps.

**Rollback Decision Criteria:**
- Critical defect found in production
- Performance degradation > 50%
- Data integrity issue

**Estimated Rollback Time:** 13 minutes

---

## 10. Contacts

| Role | Name | Contact | Responsibility |
|------|------|---------|---------------|
| Release Manager | TBD | release@sa4e.local | Release coordination |
| Dev Lead | TBD | dev@sa4e.local | Technical issues |
| QA Lead | TBD | qa@sa4e.local | Testing sign-off |
| DevOps | TBD | devops@sa4e.local | Deployment execution |
| Business Owner | TBD | po@sa4e.local | Business sign-off |

---

## 11. Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Dev Lead | | | ☐ Approved |
| QA Lead | | | ☐ Approved |
| Business Owner | | | ☐ Approved |
| Release Manager | | | ☐ Approved |
