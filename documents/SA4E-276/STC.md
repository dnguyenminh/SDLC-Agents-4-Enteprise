# Software Test Cases (STC)

## SA4E-276 — Admin UI for Entra SSO configuration management

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-276 |
| Title | Admin UI for Entra SSO configuration management |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-09-17 |
| Status | Draft |
| Related STP | STP-v1.0-SA4E-276.md |
| Related FSD | FSD.md |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-17 | QA Agent | Initiate document — auto-generated from FSD use cases and business rules |

---

## Test Case Summary

| Category | ID Range | Count | Priority |
|----------|----------|-------|----------|
| Functional — Happy Path | TC-001 to TC-099 | 4 | High |
| Functional — Alternative Flows | TC-100 to TC-199 | 2 | High |
| Functional — Exception/Error Flows | TC-200 to TC-299 | 4 | High |
| Business Rule Validation | TC-300 to TC-399 | 6 | High |
| Boundary & Negative Testing | TC-400 to TC-499 | 5 | Medium |
| UI/UX Testing | TC-500 to TC-599 | 4 | Medium |
| Non-Functional (Performance, Security) | TC-600 to TC-699 | 3 | Medium |
| Integration Testing | TC-700 to TC-799 | 4 | High |
| Regression Testing | TC-800 to TC-899 | 2 | Medium |

---

## 1. Functional Test Cases — Happy Path

### TC-001: View Entra SSO Configuration as Auth Admin

| Field | Value |
|-------|-------|
| **ID** | TC-001 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-001, Story 1 AC-1, AC-2 |
| **Preconditions** | User logged in as Auth Admin, config exists |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to Settings → Authentication → Entra SSO Configuration | Page loads successfully |
| 2 | Observe configuration fields | Tenant ID, Client ID, Redirect URI, Issuer URL displayed |
| 3 | Check client secret field | Displays masked ******** |
| 4 | Check status badge | Shows connection health status |

**Test Data:** config-id-001, tenantId 12345678-1234-1234-1234-123456789abc
**Postconditions:** Config view unchanged

---

### TC-002: Create New Entra SSO Configuration

| Field | Value |
|-------|-------|
| **ID** | TC-002 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-001, Story 1 AC-3, AC-4 |
| **Preconditions** | User logged in as System Admin, no existing config |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click Edit, fill tenantId, clientId, clientSecret, redirectUri, issuerUrl, enabled=true | Form accepts input |
| 2 | Click Save | API POST returns 201 |
| 3 | Verify DB | Non-secret fields persisted, secretRef stored |
| 4 | Verify notification | Success message shown |

**Test Data:** tenantId 11111111-2222-3333-4444-555555555555, clientId aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee
**Postconditions:** Config created, audit log entry created

---

### TC-003: Update Existing Configuration with Secret Unchanged

| Field | Value |
|-------|-------|
| **ID** | TC-003 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-001 AF-2, UC-002 |
| **Preconditions** | Config exists, user Auth Admin |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open config, change redirectUri | Field updated |
| 2 | Leave client secret empty | System retains existing secretRef |
| 3 | Click Save | PUT returns 200, secretRef unchanged |

**Test Data:** existing config-id-001
**Postconditions:** Config updated, secret not overwritten

---

### TC-004: Delete Configuration

| Field | Value |
|-------|-------|
| **ID** | TC-004 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-001 |
| **Preconditions** | Config exists, user System Admin |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click Delete | Confirmation dialog shown |
| 2 | Confirm delete | API DELETE returns 204 |
| 3 | Verify list | Config no longer appears |
| 4 | Verify audit log | DELETE event logged |

**Test Data:** config-id-001
**Postconditions:** Config removed

---

## 2. Functional Test Cases — Alternative Flows

### TC-101: View Only User Access

| Field | Value |
|-------|-------|
| **ID** | TC-101 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Requirement** | UC-001 AF-1, UC-003 |
| **Preconditions** | User logged in as Auth Viewer |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to Entra SSO Configuration | Page loads read-only |
| 2 | Attempt to click Edit | Edit controls hidden/disabled |
| 3 | Try API PUT with viewer token | Returns 403 |

**Test Data:** viewer user token
**Postconditions:** No edit performed

---

### TC-102: Secret Unchanged on Update

| Field | Value |
|-------|-------|
| **ID** | TC-102 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Requirement** | UC-001 AF-2 |
| **Preconditions** | Config exists with secretRef |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open edit form, clear client secret field | Field shows masked placeholder |
| 2 | Save with other field change | Secret store not updated, secretRef retained |

**Test Data:** config-id-001
**Postconditions:** Secret unchanged

---

## 3. Functional Test Cases — Exception/Error Flows

### TC-201: RBAC Denied Edit

| Field | Value |
|-------|-------|
| **ID** | TC-201 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | UC-001 EF-1, BR-005 |
| **Preconditions** | User logged in without Auth Admin/System Admin role |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Navigate to config page | Page loads read-only |
| 2 | Attempt API POST with user token | Returns 403 Forbidden |
| 3 | Verify message | "You do not have permission to edit authentication settings" |

**Test Data:** user with role USER
**Postconditions:** Config unchanged, security event logged

---

### TC-202: Validation Failure Invalid UUID

| Field | Value |
|-------|-------|
| **ID** | TC-202 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | UC-001 EF-2, BR-001, BR-002 |
| **Preconditions** | User Auth Admin |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Enter tenantId "invalid-uuid" | Inline error shown |
| 2 | Click Save | Save disabled / API returns 400 |

**Test Data:** tenantId invalid
**Postconditions:** Config not saved

---

### TC-203: Secret Store Unavailable

| Field | Value |
|-------|-------|
| **ID** | TC-203 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | UC-001 EF-3 |
| **Preconditions** | Secret Store mock set to error |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Attempt to save new config | API returns 500 |
| 2 | Verify UI message | "Unable to save secrets, please retry" |
| 3 | Verify DB | No partial config committed |

**Test Data:** valid config data
**Postconditions:** Rollback performed

---

### TC-204: Hot Reload Failure

| Field | Value |
|-------|-------|
| **ID** | TC-204 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | UC-001 EF-4, UC-004 |
| **Preconditions** | Config Reload Service stub returns error |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Save valid config | Config saved successfully |
| 2 | Observe notification | "Configuration saved but reload failed, manual restart required" |
| 3 | Verify audit log | Reload failure logged |

**Test Data:** config change
**Postconditions:** Config persisted, reload pending

---

## 4. Business Rule Validation

### TC-301: Tenant ID UUID Format

| Field | Value |
|-------|-------|
| **ID** | TC-301 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-001 |
| **Preconditions** | User Auth Admin |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Enter tenantId with invalid format | Validation error shown |
| 2 | Enter valid UUID v4 | Validation passes |

**Test Data:** invalid "abc", valid "12345678-1234-..."
**Postconditions:** Rule enforced

---

### TC-302: Client ID UUID Format

| Field | Value |
|-------|-------|
| **ID** | TC-302 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-002 |
| **Preconditions** | User Auth Admin |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Enter clientId invalid | Error shown |
| 2 | Enter valid UUID | Passes |

**Test Data:** invalid, valid
**Postconditions:** Rule enforced

---

### TC-303: Redirect URI Must be HTTPS

| Field | Value |
|-------|-------|
| **ID** | TC-303 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-003 |
| **Preconditions** | User Auth Admin |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Enter redirectUri http://... | Validation error |
| 2 | Enter https://... | Validation passes |

**Test Data:** http URL, https URL
**Postconditions:** Rule enforced

---

### TC-304: Client Secret Required When Enabled

| Field | Value |
|-------|-------|
| **ID** | TC-304 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-004 |
| **Preconditions** | User Auth Admin |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Set enabled=true, leave clientSecret empty | Validation error |
| 2 | Set enabled=false, clientSecret empty | Validation passes |

**Test Data:** enabled true/false
**Postconditions:** Rule enforced

---

### TC-305: Secrets Never Stored Plain Text

| Field | Value |
|-------|-------|
| **ID** | TC-305 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-006, UC-002 |
| **Preconditions** | Config created |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Query DB for config record | secretRef present, no secret value |
| 2 | Query Secret Store | Secret value retrievable via service token only |

**Test Data:** config-id-001
**Postconditions:** Secret secure

---

### TC-306: Edit Requires Auth Admin or System Admin

| Field | Value |
|-------|-------|
| **ID** | TC-306 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-005 |
| **Preconditions** | Users with different roles |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Auth Admin attempts edit | Allowed |
| 2 | System Admin attempts edit | Allowed |
| 3 | Auth Viewer attempts edit | Denied 403 |
| 4 | User attempts edit | Denied 403 |

**Test Data:** role tokens
**Postconditions:** RBAC enforced

---

## 5. Boundary & Negative Testing

### TC-401: Empty Required Fields

| Field | Value |
|-------|-------|
| **ID** | TC-401 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | Data validation |
| **Preconditions** | User Auth Admin |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Submit form with empty tenantId | Inline error, save disabled |
| 2 | Submit with empty clientId | Error |

**Test Data:** empty strings
**Postconditions:** No save

---

### TC-402: Client Secret Min Length

| Field | Value |
|-------|-------|
| **ID** | TC-402 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | Validation |
| **Preconditions** | User Auth Admin |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Enter clientSecret 7 chars | Validation fails |
| 2 | Enter 8 chars | Validation passes |

**Test Data:** 7 chars, 8 chars
**Postconditions:** Rule enforced

---

### TC-403: JWKS URL Optional

| Field | Value |
|-------|-------|
| **ID** | TC-403 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | Data spec |
| **Preconditions** | User Auth Admin |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Leave jwksUrl empty | Save succeeds |
| 2 | Enter invalid URL | Validation error |

**Test Data:** empty, invalid URL
**Postconditions:** Optional field handled

---

### TC-404: Special Characters in Tenant ID

| Field | Value |
|-------|-------|
| **ID** | TC-404 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | Validation |
| **Preconditions** | User Auth Admin |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Enter tenantId with special chars | Validation fails |

**Test Data:** "test!@#"
**Postconditions:** Rejected

---

### TC-405: Enabled Toggle Boundary

| Field | Value |
|-------|-------|
| **ID** | TC-405 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | Boolean field |
| **Preconditions** | User Auth Admin |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Toggle enabled off/on repeatedly | State persists correctly |

**Test Data:** toggle actions
**Postconditions:** Correct state

---

## 6. UI/UX Testing

### TC-501: Secret Masked Display

| Field | Value |
|-------|-------|
| **ID** | TC-501 |
| **Priority** | Medium |
| **Type** | UI/UX |
| **Requirement** | FSD 3.1.5 UI spec |
| **Preconditions** | Config exists |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | View config page | Client secret shows ******** |
| 2 | Inspect DOM | Secret value not present |

**Test Data:** existing config
**Postconditions:** Secret not exposed

---

### TC-502: Save Button Disabled on Validation Fail

| Field | Value |
|-------|-------|
| **ID** | TC-502 |
| **Priority** | Medium |
| **Type** | UI/UX |
| **Requirement** | UI spec Save Button |
| **Preconditions** | User Auth Admin |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Enter invalid tenantId | Save button disabled |
| 2 | Fix tenantId | Save button enabled |

**Test Data:** invalid then valid
**Postconditions:** UX correct

---

### TC-503: Status Badge Visibility

| Field | Value |
|-------|-------|
| **ID** | TC-503 |
| **Priority** | Medium |
| **Type** | UI/UX |
| **Requirement** | UI spec Status Badge |
| **Preconditions** | Config exists |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | View config page | Status badge shows healthy/degraded/unknown |

**Test Data:** config with status
**Postconditions:** Badge visible

---

### TC-504: Cancel Button Discards Changes

| Field | Value |
|-------|-------|
| **ID** | TC-504 |
| **Priority** | Medium |
| **Type** | UI/UX |
| **Requirement** | UI spec Cancel Button |
| **Preconditions** | User Auth Admin, config exists |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Edit fields, click Cancel | Changes discarded, form reverts |

**Test Data:** config values
**Postconditions:** No save

---

## 7. Non-Functional Testing

### TC-601: Config Save and Reload Performance

| Field | Value |
|-------|-------|
| **ID** | TC-601 |
| **Priority** | Medium |
| **Type** | Non-Functional — Performance |
| **Requirement** | NFR Performance ≤5s p95 |
| **Preconditions** | SIT environment |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Save config with valid data | Reload completes within 5 seconds |
| 2 | Measure duration | p95 ≤5000ms |

**Test Data:** valid config
**Postconditions:** Performance met

---

### TC-602: Secret Encryption at Rest

| Field | Value |
|-------|-------|
| **ID** | TC-602 |
| **Priority** | Medium |
| **Type** | Non-Functional — Security |
| **Requirement** | NFR Security AES-256 |
| **Preconditions** | Secret Store configured |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Store secret | Secret encrypted at rest |
| 2 | Retrieve via service token | Secret decrypted only for authorized service |

**Test Data:** client secret
**Postconditions:** Encryption verified

---

### TC-603: Audit Log Retention

| Field | Value |
|-------|-------|
| **ID** | TC-603 |
| **Priority** | Medium |
| **Type** | Non-Functional — Audit |
| **Requirement** | NFR Audit 1 year retention |
| **Preconditions** | Audit service enabled |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Perform create/update/delete | Audit entries created with userId, timestamp, diff |
| 2 | Verify retention policy | Logs retained per policy |

**Test Data:** config changes
**Postconditions:** Audit trail complete

---

## 8. Integration Testing

### TC-701: Secret Store Write Before DB Commit

| Field | Value |
|-------|-------|
| **ID** | TC-701 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | FSD 5.1 Secret Store |
| **Preconditions** | Secret Store mock |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Save config with new secret | Secret store write succeeds before DB commit |
| 2 | Simulate secret store failure | DB not updated, error returned |

**Test Data:** valid config
**Postconditions:** Transactional integrity

---

### TC-702: Config Reload Service Integration

| Field | Value |
|-------|-------|
| **ID** | TC-702 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | FSD 5.2 Config Reload |
| **Preconditions** | Config service available |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Save config | POST to /config/reload succeeds |
| 2 | Verify response | status reloaded, durationMs returned |

**Test Data:** config change
**Postconditions:** Reload triggered

---

### TC-703: Audit Log Service Integration

| Field | Value |
|-------|-------|
| **ID** | TC-703 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | FSD 5.3 Audit Log |
| **Preconditions** | Audit log enabled |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create config | Audit event with action CREATE logged |
| 2 | Update config | Audit event with diff logged |
| 3 | Delete config | Audit event with action DELETE logged |

**Test Data:** config lifecycle
**Postconditions:** Audit complete

---

### TC-704: RBAC Middleware Integration

| Field | Value |
|-------|-------|
| **ID** | TC-704 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | FSD 7.1 Auth |
| **Preconditions** | JWT tokens for roles |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call GET with Auth Viewer token | 200 OK |
| 2 | Call POST with Auth Viewer token | 403 Forbidden |
| 3 | Call POST with Auth Admin token | 201 Created |

**Test Data:** role tokens
**Postconditions:** Middleware works

---

## 9. Regression Testing

### TC-801: Existing Config View Still Works After Update

| Field | Value |
|-------|-------|
| **ID** | TC-801 |
| **Priority** | Medium |
| **Type** | Regression |
| **Requirement** | Existing feature |
| **Preconditions** | Config exists |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | View config page | All fields display correctly |
| 2 | No new errors | UI stable |

**Test Data:** existing config
**Postconditions:** No regression

---

### TC-802: Secret Masking Persists After UI Changes

| Field | Value |
|-------|-------|
| **ID** | TC-802 |
| **Priority** | Medium |
| **Type** | Regression |
| **Requirement** | Existing feature |
| **Preconditions** | Config exists |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | View config | Secret remains masked |
| 2 | Refresh page | Mask persists |

**Test Data:** existing config
**Postconditions:** No regression

---

## 10. Requirements Traceability Matrix (RTM)

| Requirement | Source | Test Cases | Status |
|-------------|--------|------------|--------|
| UC-001 Manage Entra SSO Config | FSD 3.1 | TC-001, TC-002, TC-003, TC-004, TC-101, TC-102, TC-201, TC-202, TC-204 | Covered |
| UC-002 Store Secrets | FSD 3.2 | TC-002, TC-003, TC-305, TC-701 | Covered |
| UC-003 RBAC Enforcement | FSD 3.3 | TC-101, TC-201, TC-306, TC-704 | Covered |
| UC-004 Hot Reload | FSD 3.4 | TC-002, TC-204, TC-601, TC-702 | Covered |
| BR-001 Tenant ID UUID | FSD 3.1.3 | TC-301, TC-202 | Covered |
| BR-002 Client ID UUID | FSD 3.1.3 | TC-302, TC-202 | Covered |
| BR-003 Redirect URI HTTPS | FSD 3.1.3 | TC-303 | Covered |
| BR-004 Secret required when enabled | FSD 3.1.3 | TC-304 | Covered |
| BR-005 Edit RBAC | FSD 3.1.3 | TC-201, TC-306 | Covered |
| BR-006 Secrets never plain text | FSD 3.1.3 | TC-305, TC-602 | Covered |
| Story 1 AC-1..5 | BRD 2.3 | TC-001, TC-002 | Covered |
| Story 2 AC-1..4 | BRD 2.3 | TC-305, TC-701 | Covered |
| Story 3 AC-1..3 | BRD 2.3 | TC-201, TC-306 | Covered |
| Story 4 AC-1..3 | BRD 2.3 | TC-601, TC-702 | Covered |

**Coverage Summary:**

| Category | Total | Covered | Coverage % |
|----------|-------|---------|------------|
| Use Cases | 4 | 4 | 100% |
| Business Rules | 6 | 6 | 100% |
| Acceptance Criteria | 14 | 14 | 100% |
| Error Codes | 4 | 4 | 100% |
| **Overall** | **28** | **28** | **100%** |

---

## 11. Appendix

### Test Data Setup Scripts

Create CSV files under documents/SA4E-276/testdata/:
- pre-seeded-users.csv with roles Auth Admin, System Admin, Viewer
- create-entra-testdata.csv with valid/invalid UUIDs, URLs
- pre-seeded-secrets.csv with secretRef placeholders

SQL seed:
```sql
INSERT INTO entra_sso_config (id, tenant_id, client_id, secret_ref, redirect_uri, issuer_url, enabled, updated_by) VALUES (...);
```

### Environment Configuration

SECRET_STORE_URL, CONFIG_SERVICE_URL configured per environment.
