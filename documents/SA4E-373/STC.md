# Software Test Cases (STC)

## ide_launch / Kiro — SA4E-373: Fix ide_launch DevToolsActivePort timeout for Kiro

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-373 |
| Title | Fix ide_launch DevToolsActivePort timeout for Kiro |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-10-19 |
| Status | Draft |
| Related STP | STP-v1.0-SA4E-373.docx |
| Related FSD | FSD-v1.0-SA4E-373.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-19 | QA Agent | Initiate document — auto-generated from FSD use cases and business rules |

---

## Test Case Summary

| Category | ID Range | Count | Priority |
|----------|----------|-------|----------|
| Functional — Happy Path | TC-001 to TC-099 | 3 | High |
| Functional — Alternative Flows | TC-100 to TC-199 | 2 | High |
| Functional — Exception/Error Flows | TC-200 to TC-299 | 3 | High |
| Business Rule Validation | TC-300 to TC-399 | 6 | High |
| Boundary & Negative Testing | TC-400 to TC-499 | 4 | Medium |
| Non-Functional (Performance, Security) | TC-600 to TC-699 | 5 | Medium |
| Integration Testing | TC-700 to TC-799 | 2 | High |
| Regression Testing | TC-800 to TC-899 | 1 | Medium |

---

## 1. Functional Test Cases — Happy Path

### TC-001: Launch Kiro with custom userDataDir succeeds

| Field | Value |
|-------|-------|
| **ID** | TC-001 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-001, BR-1, BR-3, Story 1 AC-1 |
| **Preconditions** | Kiro installed, ide_launch available, C:\temp\kiro-uat exists and writable |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run `ide_launch --ide kiro --userDataDir C:\temp\kiro-uat` | Process starts |
| 2 | Wait for launch completion | launchSuccess=true, devToolsPort returned |
| 3 | Verify Kiro process running | PID reported, no timeout error |

**Test Data:** userDataDir=C:\temp\kiro-uat
**Postconditions:** Kiro running with isolated profile

---

### TC-002: Launch with explicit remoteDebuggingPort succeeds

| Field | Value |
|-------|-------|
| **ID** | TC-002 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-002, BR-7, BR-8, Story 2 AC-1 |
| **Preconditions** | Port 9222 free |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run `ide_launch --ide kiro --remoteDebuggingPort 9222` | Process starts with --remote-debugging-port=9222 |
| 2 | Verify launch output | launchSuccess=true, devToolsPort=9222 |
| 3 | Confirm port listening on 127.0.0.1:9222 | Port bound |

**Test Data:** remoteDebuggingPort=9222
**Postconditions:** Kiro launched with deterministic port

---

### TC-003: Default launch without custom userDataDir works unchanged

| Field | Value |
|-------|-------|
| **ID** | TC-003 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | BR-6, Story 1 AC-4 |
| **Preconditions** | Kiro installed |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run `ide_launch --ide kiro` | Process starts with default userDataDir |
| 2 | Wait for completion | launchSuccess=true |

**Test Data:** none
**Postconditions:** Existing behavior unchanged

---

## 2. Functional Test Cases — Alternative Flows

### TC-101: Remote debugging port provided skips auto-detection

| Field | Value |
|-------|-------|
| **ID** | TC-101 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Requirement** | UC-001 AF-1 |
| **Preconditions** | Port 9223 free |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run `ide_launch --ide kiro --remoteDebuggingPort 9223 --userDataDir C:\temp\kiro-uat` | Port validated before start |
| 2 | Verify launch | launchSuccess=true, devToolsPort=9223 returned immediately after process start |

**Test Data:** remoteDebuggingPort=9223, userDataDir=C:\temp\kiro-uat
**Postconditions:** No auto-detection polling

---

### TC-102: Port not detected within 30s extends to 60s

| Field | Value |
|-------|-------|
| **ID** | TC-102 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Requirement** | UC-001 AF-2 |
| **Preconditions** | Kiro launch slow with custom userDataDir |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run `ide_launch --ide kiro --userDataDir C:\temp\kiro-uat --timeout 60` | Detection continues beyond 30s |
| 2 | Wait up to 60s | launchSuccess=true when port exposed |

**Test Data:** timeoutSeconds=60
**Postconditions:** Launch succeeds within extended timeout

---

## 3. Functional Test Cases — Exception/Error Flows

### TC-201: Invalid userDataDir returns error

| Field | Value |
|-------|-------|
| **ID** | TC-201 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | UC-001 EF-1, BR-4 |
| **Preconditions** | Path does not exist |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run `ide_launch --ide kiro --userDataDir C:\invalid\path` | Validation fails before spawn |
| 2 | Check output | Error 'UserDataDir not accessible' returned |

**Test Data:** userDataDir=C:\invalid\path
**Postconditions:** Launch aborted, no process started

---

### TC-202: Port conflict returns error

| Field | Value |
|-------|-------|
| **ID** | TC-202 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | UC-001 EF-2, BR-5 |
| **Preconditions** | Port 9222 already bound |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Occupy port 9222 with dummy server |
| 2 | Run `ide_launch --ide kiro --remoteDebuggingPort 9222` | Validation fails |
| 3 | Check output | Error 'Remote debugging port already in use' |

**Test Data:** remoteDebuggingPort=9222 in use
**Postconditions:** Launch aborted

---

### TC-203: Timeout error after configurable timeout

| Field | Value |
|-------|-------|
| **ID** | TC-203 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | UC-001 EF-3, BR-3 |
| **Preconditions** | Simulate slow Kiro start |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run `ide_launch --ide kiro --userDataDir C:\temp\kiro-uat --timeout 10` | Wait 10s |
| 2 | Check output | Error 'IDE did not expose DevToolsActivePort within 10s' |

**Test Data:** timeoutSeconds=10
**Postconditions:** Launch fails with clear message

---

## 4. Business Rule Validation

### TC-301: userDataDir must be accessible and writable

| Field | Value |
|-------|-------|
| **ID** | TC-301 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-4 |
| **Preconditions** | Directory exists but read-only |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run with read-only userDataDir | Error 'UserDataDir not accessible' |

**Test Data:** userDataDir read-only
---

### TC-302: remoteDebuggingPort range validation

| Field | Value |
|-------|-------|
| **ID** | TC-302 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-5 |
| **Preconditions** | None |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run with port 80 | Validation rejects port out of range |
| 2 | Run with port 70000 | Validation rejects |

**Test Data:** remoteDebuggingPort=80, 70000
---

### TC-303: Launch success rate >95%

| Field | Value |
|-------|-------|
| **ID** | TC-303 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-1, NFR Availability |
| **Preconditions** | 20 consecutive launches |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Execute 20 launches with custom userDataDir | ≥19 successes |

---

### TC-304: DevToolsActivePort detection completes within 60s

| Field | Value |
|-------|-------|
| **ID** | TC-304 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | NFR Performance |
| **Preconditions** | Custom userDataDir |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Measure time to port detection | ≤60s p95 |

---

### TC-305: Explicit port forwarded to Kiro command line

| Field | Value |
|-------|-------|
| **ID** | TC-305 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-7 |
| **Preconditions** | None |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run with --remoteDebuggingPort 9224 | Process args contain --remote-debugging-port=9224 |

---

### TC-306: Existing launches without params unchanged

| Field | Value |
|-------|-------|
| **ID** | TC-306 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-6 |
| **Preconditions** | Baseline behavior known |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run without params | Behavior matches pre-change |

---

## 5. Boundary & Negative Testing

### TC-401: userDataDir path traversal attempt

| Field | Value |
|-------|-------|
| **ID** | TC-401 |
| **Priority** | Medium |
| **Type** | Boundary/Negative |
| **Requirement** | SECURITY-REVIEW Finding #2 |
| **Preconditions** | None |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run with userDataDir=..\..\..\Windows\System32 | Rejected after realpath canonicalization |

---

### TC-402: remoteDebuggingPort boundary values

| Field | Value |
|-------|-------|
| **ID** | TC-402 |
| **Priority** | Medium |
| **Type** | Boundary/Negative |
| **Requirement** | BR-5 |
| **Preconditions** | None |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Test ports 1023, 1024, 65535, 65536 | 1023 and 65536 rejected, 1024 and 65535 accepted |

---

### TC-403: Timeout boundary values

| Field | Value |
|-------|-------|
| **ID** | TC-403 |
| **Priority** | Medium |
| **Type** | Boundary/Negative |
| **Requirement** | FSD validation |
| **Preconditions** | None |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Test timeout 0, 1, 300, 301 | 0 and 301 rejected |

---

### TC-404: Symlink userDataDir attack

| Field | Value |
|-------|-------|
| **ID** | TC-404 |
| **Priority** | Medium |
| **Type** | Boundary/Negative |
| **Requirement** | SECURITY-REVIEW Finding #2 |
| **Preconditions** | Symlink to sensitive dir |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run with symlink userDataDir | Rejected or resolved to allowed base |

---

## 6. Non-Functional Testing

### TC-601: Security — localhost binding enforcement

| Field | Value |
|-------|-------|
| **ID** | TC-601 |
| **Priority** | High |
| **Type** | Non-Functional — Security |
| **Requirement** | SECURITY-REVIEW Finding #1 |
| **Preconditions** | Port 9225 free |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Launch with remoteDebuggingPort 9225 | Verify listening socket bound to 127.0.0.1 only |
| 2 | Attempt connect from remote IP | Connection refused |

---

### TC-602: Security — process spawn injection

| Field | Value |
|-------|-------|
| **ID** | TC-602 |
| **Priority** | High |
| **Type** | Non-Functional — Security |
| **Requirement** | SECURITY-REVIEW Finding #3 |
| **Preconditions** | None |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run with userDataDir containing `; cmd.exe` | Path sanitized, no command injection |
| 2 | Verify spawn uses array args not shell | No shell execution |

---

### TC-603: Security — DevTools unauthenticated access

| Field | Value |
|-------|-------|
| **ID** | TC-603 |
| **Priority** | Medium |
| **Type** | Non-Functional — Security |
| **Requirement** | SECURITY-REVIEW Finding #4 |
| **Preconditions** | Port exposed |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Connect to DevTools port from localhost | Access granted, warning logged |
| 2 | Verify documentation notes risk | Risk documented |

---

### TC-604: Security — log masking

| Field | Value |
|-------|-------|
| **ID** | TC-604 |
| **Priority** | Low |
| **Type** | Non-Functional — Security |
| **Requirement** | SECURITY-REVIEW Finding #5 |
| **Preconditions** | None |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run launch | Logs show basename not full userDataDir path |

---

### TC-605: Performance — launch duration p95

| Field | Value |
|-------|-------|
| **ID** | TC-605 |
| **Priority** | Medium |
| **Type** | Non-Functional — Performance |
| **Requirement** | NFR Performance |
| **Preconditions** | 20 launches |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Measure launch duration | p95 ≤60s |

---

## 7. Integration Testing

### TC-701: ide_launch integrates with Kiro process lifecycle

| Field | Value |
|-------|-------|
| **ID** | TC-701 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | FSD Section 5 |
| **Preconditions** | Kiro installed |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Launch with custom userDataDir | Process spawned, port detected, PID returned |
| 2 | Kill process | Cleanup successful |

---

### TC-702: Validation integrates with filesystem

| Field | Value |
|-------|-------|
| **ID** | TC-702 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | BR-4 |
| **Preconditions** | None |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Provide inaccessible path | Validation fails before spawn |

---

## 8. Regression Testing

### TC-801: Existing launch without params still works

| Field | Value |
|-------|-------|
| **ID** | TC-801 |
| **Priority** | Medium |
| **Type** | Regression |
| **Requirement** | BR-6 |
| **Preconditions** | Baseline |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run default launch | Success as before |

---

## 9. Requirements Traceability Matrix (RTM)

| Requirement | Source | Test Cases | Status |
|-------------|--------|------------|--------|
| UC-001 | FSD 3.1 | TC-001, TC-101, TC-102, TC-201, TC-203 | Covered |
| UC-002 | FSD 3.2 | TC-002 | Covered |
| BR-1 | FSD 3.1.3 | TC-001, TC-303 | Covered |
| BR-2 | FSD 3.1.3 | TC-001, TC-101 | Covered |
| BR-3 | FSD 3.1.3 | TC-002, TC-203 | Covered |
| BR-4 | FSD 3.1.3 | TC-201, TC-301, TC-702 | Covered |
| BR-5 | FSD 3.1.3 | TC-202, TC-302, TC-402 | Covered |
| BR-6 | FSD 3.1.3 | TC-003, TC-306, TC-801 | Covered |
| BR-7 | FSD 3.2.3 | TC-002, TC-305 | Covered |
| BR-8 | FSD 3.2.3 | TC-002 | Covered |
| SECURITY Finding #1 | SECURITY-REVIEW | TC-601 | Covered |
| SECURITY Finding #2 | SECURITY-REVIEW | TC-401, TC-404 | Covered |
| SECURITY Finding #3 | SECURITY-REVIEW | TC-602 | Covered |

**Coverage Summary:**

| Category | Total | Covered | Coverage % |
|----------|-------|---------|------------|
| Use Cases | 2 | 2 | 100% |
| Business Rules | 9 | 9 | 100% |
| Security Findings | 3 | 3 | 100% |
| Overall | 14 | 14 | 100% |

---

## 10. Appendix

### Test Data Setup Scripts

- Create `C:\temp\kiro-uat` with write permissions
- Reserve ports 9222-9225 for testing
- Prepare read-only directory for validation tests

### Environment Configuration

- Node.js 20.x
- Kiro IDE latest
- ide_launch from SA4E-373 branch
