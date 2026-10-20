# Release Notes (RLN)

## SDLC Agents 4 Enterprise — SA4E-373: Fix ide_launch DevToolsActivePort timeout for Kiro

---

## Release Information

| Field | Value |
|-------|-------|
| Release Version | 1.0 |
| Release Date | 2026-10-19 |
| Jira Ticket | SA4E-373 |
| Environment | UAT |
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

Improved reliability of Kiro IDE launch via ide_launch tool under custom userDataDir conditions. The extension now supports explicit --remote-debugging-port forwarding and configurable timeout with enhanced polling, eliminating flaky DevToolsActivePort detection timeouts during manual UAT.

### 1.2 User-Facing Changes

| # | Change | Description | Impact |
|---|--------|-------------|--------|
| 1 | Reliable Kiro launch | ide_launch succeeds consistently with custom userDataDir | High |
| 2 | Configurable timeout | Timeout now defaults to 60s, configurable up to 300s | Medium |

### 1.3 Screenshots (if applicable)

N/A — CLI tool enhancement

---

## 2. Technical Changes

### 2.1 API Changes

| Type | Endpoint | Method | Description |
|------|----------|--------|-------------|
| Modified | ide_launch --ide kiro | CLI | Added --remoteDebuggingPort and --timeoutSeconds options |

### 2.2 Database Changes

No database changes.

### 2.3 Configuration Changes

| Property | Change Type | Description |
|----------|-----------|-------------|
| DEFAULT_TIMEOUT | New | Default DevTools detection timeout 60s |
| POLL_INTERVAL | New | File polling interval 500ms |
| REMOTE_DEBUGGING_PORT_RANGE | New | Allowed port range 1024-65535 |

### 2.4 Infrastructure Changes

| Component | Change | Description |
|-----------|--------|-------------|
| Extension | Modified | sdlc-agents-4-enterprise 1.53.11 deployed to Kiro UAT |

---

## 3. Bug Fixes

| # | Jira Ticket | Summary | Severity |
|---|------------|---------|----------|
| 1 | SA4E-373 | ide_launch DevToolsActivePort timeout for Kiro with custom userDataDir | Major |

---

## 4. Known Issues & Limitations

No known issues at the time of release.

---

## 5. Dependencies

### 5.1 Pre-requisite Releases

| Release | Version | Status | Required Before |
|---------|---------|--------|-----------------|
| sdlc-agents-4-enterprise | 1.53.10 | Deployed | This release |

### 5.2 External System Changes

None.

---

## 6. Migration Notes

### 6.1 Data Migration

No data migration required.

### 6.2 Breaking Changes

No breaking changes in this release. Fully backward compatible.

### 6.3 Backward Compatibility

Fully backward compatible. Existing ide_launch invocations without new parameters continue to work unchanged.

---

## 7. Testing Summary

| Test Level | Total | Passed | Failed | Blocked | Pass Rate |
|-----------|-------|--------|--------|---------|-----------|
| Unit Tests | - | - | - | - | - |
| Integration Tests | - | - | - | - | - |
| SIT | - | - | - | - | - |
| UAT | - | - | - | - | - |

### Defect Summary

| Severity | Found | Fixed | Open | Deferred |
|----------|-------|-------|------|----------|
| Critical | 0 | 0 | 0 | 0 |
| Major | 1 | 1 | 0 | 0 |
| Minor | 0 | 0 | 0 | 0 |

---

## 8. Deployment Instructions

Reference the Deployment Guide for detailed steps.

See: [Deployment Guide](DPG-v1.0-SA4E-373.docx)

### Quick Reference

| Step | Action | Estimated Time |
|------|--------|---------------|
| 1 | Install VSIX into Kiro | 2 min |
| 2 | Verify extension loaded | 1 min |
| 3 | Smoke test ide_launch tool | 5 min |
| **Total** | | **8 min** |

---

## 9. Rollback Plan

Reference the Deployment Guide for detailed rollback steps.

**Rollback Decision Criteria:**
- Launch success rate <95%
- Critical defect found

**Estimated Rollback Time:** 15 min

---

## 10. Contacts

| Role | Name | Contact | Responsibility |
|------|------|---------|---------------|
| Release Manager | - | - | Release coordination |
| Dev Lead | - | - | Technical issues |
| QA Lead | - | - | Testing sign-off |
| DevOps | DevOps Agent | - | Deployment execution |
| Business Owner | - | - | Business sign-off |

---

## 11. Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Dev Lead | | | ☐ Approved |
| QA Lead | | | ☐ Approved |
| Business Owner | | | ☐ Approved |
| Release Manager | | | ☐ Approved |
