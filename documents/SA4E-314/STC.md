# Software Test Cases (STC)

## SDLC Agents 4 Enterprise — SA4E-314: Wire up DefaultResourceLoader (cwd + agentDir) for resource discovery

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-314 |
| Title | Wire up DefaultResourceLoader (cwd + agentDir) for resource discovery |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-09-25 |
| Status | Draft |
| Related STP | STP-v1.0-SA4E-314.docx |
| Related FSD | FSD-v1.0-SA4E-314.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-25 | QA Agent | Initiate document — auto-generated from FSD use cases and business rules |

---

## Test Case Summary

| Category | ID Range | Count | Priority |
|----------|----------|-------|----------|
| Functional — Happy Path | TC-001 to TC-099 | 3 | High |
| Functional — Alternative Flows | TC-100 to TC-199 | 1 | High |
| Functional — Exception/Error Flows | TC-200 to TC-299 | 3 | High |
| Business Rule Validation | TC-300 to TC-399 | 5 | High |
| Boundary & Negative Testing | TC-400 to TC-499 | 2 | Medium |
| UI/UX Testing | TC-500 to TC-599 | 0 | N/A |
| Non-Functional (Performance, Security) | TC-600 to TC-699 | 2 | Medium |
| Integration Testing | TC-700 to TC-799 | 3 | High |
| Regression Testing | TC-800 to TC-899 | 1 | Medium |

---

## 1. Functional Test Cases — Happy Path

### TC-001: Create agent session with explicit DefaultResourceLoader configured with cwd and agentDir

| Field | Value |
|-------|-------|
| **ID** | TC-001 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-1, BR-3, BR-1, BR-2 |
| **Preconditions** | SA4E-313 completed, Pi SDK installed, workspace contains .pi/* structure, valid cwd and agentDir exist |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Resolve cwd from workspaceFolders | cwd path returned and exists |
| 2 | Get agentDir via getAgentDir() | agentDir path returned and resolvable |
| 3 | Instantiate DefaultResourceLoader({cwd, agentDir}) | Loader instance created without error |
| 4 | Call loader.reload() | Reload completes successfully |
| 5 | Create session via createAgentSession with resourceLoader | Session created with explicit resourceLoader |
| 6 | Verify loader.getSkills(), getPrompts(), getAgentsFiles() | Resources discovered from workspace |

**Test Data:** cwd=C:\Users\ASUS\orca\workspaces\SDLC-Agents-4-Enterprise\SA4E-254, agentDir=~/.pi/agent
**Postconditions:** Agent session ready with resource loader configured

---

### TC-002: Reload loader before session creation ensures up-to-date resources

| Field | Value |
|-------|-------|
| **ID** | TC-002 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-2, BR-5 |
| **Preconditions** | DefaultResourceLoader instantiated |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call loader.reload() | Reload invoked synchronously |
| 2 | Verify discoveredSkills, discoveredPrompts populated | Resources discovered |
| 3 | Proceed to createAgentSession | Session creation proceeds after reload success |

**Test Data:** Valid loader instance
**Postconditions:** Resources are latest from workspace

---

### TC-003: Log diagnostics/warnings from loader

| Field | Value |
|-------|-------|
| **ID** | TC-003 |
| **Priority** | Medium |
| **Type** | Functional |
| **Requirement** | UC-3 |
| **Preconditions** | Loader instantiated and reloaded |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger loader with invalid path scenario | Loader emits diagnostics/warnings |
| 2 | Capture diagnostics | Diagnostics captured by Agent Orchestrator |
| 3 | Check logs | Warnings appear in console/logger with appropriate level |

**Test Data:** Loader configured with valid cwd
**Postconditions:** Diagnostics logged

---

## 2. Functional Test Cases — Alternative Flows

### TC-101: cwd invalid – fallback to default

| Field | Value |
|-------|-------|
| **ID** | TC-101 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Requirement** | UC-1 AF-1 |
| **Preconditions** | cwd path does not exist |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Attempt to resolve invalid cwd | Warning logged: Workspace root not found |
| 2 | System falls back to default cwd | Session creation continues with fallback |

**Test Data:** cwd=C:\nonexistent\path
**Postconditions:** Session created with fallback cwd

---

## 3. Functional Test Cases — Exception/Error Flows

### TC-201: loader.reload() fails – abort session creation

| Field | Value |
|-------|-------|
| **ID** | TC-201 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | UC-1 EF-1, UC-2 EF-1 |
| **Preconditions** | Loader configured to throw on reload |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call loader.reload() | Exception thrown |
| 2 | Verify session creation aborted | Error logged, session not created |
| 3 | Verify error message | "Resource discovery failed" shown |

**Test Data:** Mock loader with reload error
**Postconditions:** No session created, error logged

---

### TC-202: cwd does not exist – log warning and use fallback

| Field | Value |
|-------|-------|
| **ID** | TC-202 |
| **Priority** | Medium |
| **Type** | Functional — Exception Flow |
| **Requirement** | UC-1 EF-2 |
| **Preconditions** | cwd path invalid |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Resolve cwd | Path validation fails |
| 2 | Log warning | Warning logged and developer notified |

**Test Data:** Invalid cwd path
**Postconditions:** Fallback used

---

### TC-203: Missing Pi SDK – prevent session creation

| Field | Value |
|-------|-------|
| **ID** | TC-203 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | FSD 9.1 Error Scenario |
| **Preconditions** | Pi SDK not installed |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Attempt to import DefaultResourceLoader | Import error thrown |
| 2 | Verify session creation prevented | Error "Pi SDK not installed" shown |

**Test Data:** Unavailable SDK
**Postconditions:** No session

---

## 4. Business Rule Validation

### TC-301: BR-1 cwd must be existing directory path

| Field | Value |
|-------|-------|
| **ID** | TC-301 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-1 |
| **Preconditions** | Various cwd values |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Provide valid directory path | Accepted |
| 2 | Provide non-existent path | Warning logged, fallback used |
| 3 | Provide file path instead of directory | Validation fails |

**Test Data:** Valid path, invalid path, file path
---

### TC-302: BR-2 agentDir must resolve to valid path

| Field | Value |
|-------|-------|
| **ID** | TC-302 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-2 |
| **Preconditions** | agentDir values |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Provide resolvable agentDir | Accepted |
| 2 | Provide unresolvable agentDir | Error thrown |

**Test Data:** ~/.pi/agent existing, non-existing
---

### TC-303: BR-3 session must be created with explicit DefaultResourceLoader

| Field | Value |
|-------|-------|
| **ID** | TC-303 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-3 |
| **Preconditions** | Session creation requested |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create session | resourceLoader parameter is DefaultResourceLoader instance |
| 2 | Inspect session | Explicit loader attached |

**Test Data:** N/A
---

### TC-304: BR-4 loader.reload() must be called before session creation

| Field | Value |
|-------|-------|
| **ID** | TC-304 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-4 |
| **Preconditions** | Session creation flow |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trace execution order | reload() invoked before createAgentSession |

**Test Data:** N/A
---

### TC-305: BR-5 Reload must complete without exception before session creation

| Field | Value |
|-------|-------|
| **ID** | TC-305 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-5 |
| **Preconditions** | Loader reload |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Successful reload | Session creation proceeds |
| 2 | Reload throws | Session creation aborted |

**Test Data:** N/A
---

## 5. Boundary & Negative Testing

### TC-401: Boundary cwd path length and special characters

| Field | Value |
|-------|-------|
| **ID** | TC-401 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | Data validation |
| **Preconditions** | cwd input |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Provide cwd with special characters | Handled safely, no path traversal |
| 2 | Provide very long path | Loader handles gracefully |

**Test Data:** Path with spaces, Unicode, long path
---

### TC-402: Negative test – empty cwd

| Field | Value |
|-------|-------|
| **ID** | TC-402 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | Validation |
| **Preconditions** | Empty input |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Provide empty cwd string | Validation fails, warning logged |

**Test Data:** cwd=""
---

## 6. UI/UX Testing

N/A – No UI component.

---

## 7. Non-Functional Testing

### TC-601: Performance – resource discovery reload <2s

| Field | Value |
|-------|-------|
| **ID** | TC-601 |
| **Priority** | Medium |
| **Type** | Non-Functional – Performance |
| **Requirement** | NFR Performance |
| **Preconditions** | Average workspace size |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Measure reload() execution time | Completes in < 2 seconds |

**Acceptance Criteria:** Reload < 2s for average workspace
---

### TC-602: Security – path traversal prevention

| Field | Value |
|-------|-------|
| **ID** | TC-602 |
| **Priority** | High |
| **Type** | Non-Functional – Security |
| **Requirement** | NFR Security |
| **Preconditions** | Malicious path input |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Provide cwd with ../ traversal attempt | Loader restricts discovery to cwd and agentDir only |
| 2 | Verify discovered resources | No files outside allowed paths |

**Acceptance Criteria:** Loader only discovers within cwd and agentDir
---

## 8. Integration Testing

### TC-701: Integration with Pi SDK DefaultResourceLoader

| Field | Value |
|-------|-------|
| **ID** | TC-701 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | FSD 5.1 |
| **Preconditions** | Pi SDK installed |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Instantiate loader with cwd, agentDir | SDK accepts parameters |
| 2 | Call reload() | Resources discovered via SDK |
| 3 | Create session with loader | Session uses SDK loader |

**Test Data:** Valid paths
---

### TC-702: Integration with Session Manager

| Field | Value |
|-------|-------|
| **ID** | TC-702 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | FSD 2.2 |
| **Preconditions** | Loader ready |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Pass resourceLoader to createAgentSession | Session manager accepts loader |
| 2 | Verify session configured | Session operational |

---

### TC-703: Diagnostics Logger integration

| Field | Value |
|-------|-------|
| **ID** | TC-703 |
| **Priority** | Medium |
| **Type** | Integration |
| **Requirement** | FSD 2.2 |
| **Preconditions** | Loader emits warnings |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger loader warning | Diagnostics logger captures and logs |

---

## 9. Regression Testing

### TC-801: Existing session creation without loader still works

| Field | Value |
|-------|-------|
| **ID** | TC-801 |
| **Priority** | Medium |
| **Type** | Regression |
| **Requirement** | Existing functionality |
| **Preconditions** | Previous session flow |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create session with default loader | Backward compatibility maintained |

---

## 10. Requirements Traceability Matrix (RTM)

| Requirement | Source | Test Cases | Status |
|-------------|--------|------------|--------|
| UC-1 | FSD 3.1 | TC-001, TC-101, TC-201, TC-202, TC-301, TC-303, TC-304 | Covered |
| BR-1 | FSD 3.1.3 | TC-301, TC-401 | Covered |
| BR-2 | FSD 3.1.3 | TC-302 | Covered |
| BR-3 | FSD 3.1.3 | TC-303 | Covered |
| BR-4 | FSD 3.1.3 | TC-304 | Covered |
| UC-2 | FSD 3.2 | TC-002, TC-201, TC-305 | Covered |
| BR-5 | FSD 3.2.3 | TC-305 | Covered |
| UC-3 | FSD 3.3 | TC-003, TC-703 | Covered |
| NFR Performance | FSD 8 | TC-601 | Covered |
| NFR Security | FSD 8 | TC-602 | Covered |
| Error: Invalid cwd | FSD 9.1 | TC-101, TC-202, TC-301 | Covered |
| Error: Reload failure | FSD 9.1 | TC-201 | Covered |
| Story 1 AC1-5 | BRD 2.3 | TC-001, TC-301 | Covered |
| Story 2 AC1-2 | BRD 2.3 | TC-002 | Covered |
| Story 3 AC1 | BRD 2.3 | TC-003 | Covered |

**Coverage Summary:**

| Category | Total | Covered | Coverage % |
|----------|-------|---------|------------|
| Use Cases | 3 | 3 | 100% |
| Business Rules | 5 | 5 | 100% |
| Acceptance Criteria | 8 | 8 | 100% |
| Error Codes | 3 | 3 | 100% |
| **Overall** | **19** | **19** | **100%** |

---

## 11. Appendix

### Test Data Setup Scripts

Pre-seed workspace with .pi/skills, .pi/extensions, .pi/prompts folders containing sample files. Create temp directories for valid/invalid cwd tests.

### Environment Configuration

Node.js >=18, Pi SDK @earendil-works/pi-coding-agent installed, workspace root accessible.
