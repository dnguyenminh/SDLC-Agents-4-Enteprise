# Release Notes (RLN)

## {SYSTEM_NAME} — {TICKET_KEY}: {TICKET_SUMMARY}

---

## Release Information

| Field | Value |
|-------|-------|
| Release Version | {VERSION} |
| Release Date | {RELEASE_DATE} |
| Jira Ticket | {TICKET_KEY} |
| Environment | {DEV / SIT / UAT / PROD} |
| Author | DevOps Agent |
| Status | Draft |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | {CURRENT_DATE} | DevOps Agent | Initiate document |

---

## 1. What's New

### 1.1 Feature Summary

{User-friendly description of the new feature — written for business stakeholders, not technical audience.}

### 1.2 User-Facing Changes

| # | Change | Description | Impact |
|---|--------|-------------|--------|
| 1 | {Change title} | {What users will see/experience} | {High/Medium/Low} |

### 1.3 Screenshots (if applicable)

{Include screenshots of new UI features if available.}

---

## 2. Technical Changes

### 2.1 API Changes

| Type | Endpoint | Method | Description |
|------|----------|--------|-------------|
| {New/Modified/Deprecated} | {/api/v1/resource} | {GET/POST} | {Description} |

### 2.2 Database Changes

| Type | Object | Description |
|------|--------|-------------|
| {New Table/New Column/Modified} | {table_name} | {Description} |

### 2.3 Configuration Changes

| Property | Change Type | Description |
|----------|-----------|-------------|
| {property.name} | {New/Modified/Removed} | {Description} |

### 2.4 Infrastructure Changes

| Component | Change | Description |
|-----------|--------|-------------|
| {Service/Container} | {New/Modified} | {Description} |

---

## 3. Bug Fixes

| # | Jira Ticket | Summary | Severity |
|---|------------|---------|----------|
| 1 | {BUG-KEY} | {Bug description} | {Critical/Major/Minor} |

> If no bug fixes in this release, state: "No bug fixes included in this release."

---

## 4. Known Issues & Limitations

| # | Issue | Impact | Workaround | Target Fix |
|---|-------|--------|------------|------------|
| 1 | {Known issue description} | {Impact on users} | {Workaround if available} | {Target release} |

> If no known issues, state: "No known issues at the time of release."

---

## 5. Dependencies

### 5.1 Pre-requisite Releases

| Release | Version | Status | Required Before |
|---------|---------|--------|-----------------|
| {Dependent release} | {version} | {Deployed/Pending} | {This release} |

### 5.2 External System Changes

| System | Change Required | Status | Contact |
|--------|----------------|--------|---------|
| {External system} | {What needs to change} | {Done/Pending} | {Contact person} |

---

## 6. Migration Notes

### 6.1 Data Migration

| Migration | Description | Automated | Estimated Time |
|-----------|-------------|-----------|----------------|
| {Migration name} | {What data is migrated} | {Yes/No} | {time} |

### 6.2 Breaking Changes

| Change | Impact | Migration Path |
|--------|--------|---------------|
| {Breaking change} | {What breaks} | {How to migrate} |

> If no breaking changes, state: "No breaking changes in this release. Fully backward compatible."

### 6.3 Backward Compatibility

{Describe backward compatibility status — fully compatible, partially compatible, or breaking.}

---

## 7. Testing Summary

| Test Level | Total | Passed | Failed | Blocked | Pass Rate |
|-----------|-------|--------|--------|---------|-----------|
| Unit Tests | {count} | {count} | {count} | {count} | {%} |
| Integration Tests | {count} | {count} | {count} | {count} | {%} |
| SIT | {count} | {count} | {count} | {count} | {%} |
| UAT | {count} | {count} | {count} | {count} | {%} |

### Defect Summary

| Severity | Found | Fixed | Open | Deferred |
|----------|-------|-------|------|----------|
| Critical | {count} | {count} | {count} | {count} |
| Major | {count} | {count} | {count} | {count} |
| Minor | {count} | {count} | {count} | {count} |

---

## 8. Deployment Instructions

{Reference the Deployment Guide for detailed steps.}

See: [Deployment Guide](DPG-v{VERSION}-{TICKET-KEY}.docx)

### Quick Reference

| Step | Action | Estimated Time |
|------|--------|---------------|
| 1 | Database migration | {time} |
| 2 | Application deployment | {time} |
| 3 | Configuration update | {time} |
| 4 | Verification | {time} |
| **Total** | | **{total time}** |

---

## 9. Rollback Plan

{Reference the Deployment Guide for detailed rollback steps.}

**Rollback Decision Criteria:**
- {Criteria 1}
- {Criteria 2}

**Estimated Rollback Time:** {time}

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
