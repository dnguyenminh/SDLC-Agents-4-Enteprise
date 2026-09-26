# Software Test Cases (STC)

## SA4E-315 — Wire up DefaultResourceLoader (cwd + agentDir) for resource discovery

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-315 |
| Title | Wire up DefaultResourceLoader (cwd + agentDir) for resource discovery |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-09-25 |
| Status | Draft |
| Related STP | STP.md |
| Related FSD | FSD.md |

---

## Test Case Summary

| Category | ID Range | Count |
|----------|----------|-------|
| Functional — Happy Path | TC-001 to TC-099 | 3 |
| Functional — Alternative Flows | TC-100 to TC-199 | 2 |
| Functional — Exception/Error Flows | TC-200 to TC-299 | 1 |
| Business Rule Validation | TC-300 to TC-399 | 4 |
| Boundary & Negative Testing | TC-400 to TC-499 | 2 |
| SIT Manual | SIT-001 to SIT-099 | 3 |

---

## 1. Functional Test Cases — Happy Path

### TC-001: Successful DefaultResourceLoader initialization with valid cwd and agentDir

| Field | Value |
|-------|-------|
| **ID** | TC-001 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-001, BR-2 |
| **Preconditions** | Workspace root exists, Pi SDK installed, agentDir exists |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call getAgentDir() | Returns valid path |
| 2 | Instantiate DefaultResourceLoader({cwd, agentDir}) | Loader created without error |
| 3 | Call loader.reload() | Resources loaded |

**Test Data:** cwd = workspace root, agentDir = ~/.pi/agent/...
**Postconditions:** Loader ready

### TC-002: Session created with explicit resource loader

| Field | Value |
|-------|-------|
| **ID** | TC-002 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-001, BR-1, BR-3 |
| **Preconditions** | TC-001 passed |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create session via createAgentSession({resourceLoader, sessionManager}) | Session created |
| 2 | Verify session uses provided loader | Loader reference matches |

**Test Data:** Same as TC-001

### TC-003: Resources discovered via getSkills/getPrompts/getAgentsFiles

| Field | Value |
|-------|-------|
| **ID** | TC-003 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UC-001, UC-002 |
| **Preconditions** | Loader reloaded |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call loader.getSkills() | Returns array from <cwd>/.pi/skills |
| 2 | Call loader.getPrompts() | Returns array from <cwd>/.pi/prompts |
| 3 | Call loader.getAgentsFiles() | Returns AGENTS.md |

**Test Data:** Valid workspace with .pi files

---

## 2. Functional Test Cases — Alternative Flows

### TC-101: cwd not exists

| Field | Value |
|-------|-------|
| **ID** | TC-101 |
| **Priority** | Medium |
| **Type** | Functional — Alternative Flow |
| **Requirement** | UC-001 AF-1 |
| **Preconditions** | Invalid cwd path |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Instantiate loader with non-existent cwd | Warning logged |
| 2 | Loader falls back to default | No crash |

**Test Data:** cwd = /invalid/path

### TC-102: agentDir not exists

| Field | Value |
|-------|-------|
| **ID** | TC-102 |
| **Priority** | Medium |
| **Type** | Functional — Alternative Flow |
| **Requirement** | UC-001 AF-2 |
| **Preconditions** | agentDir missing |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Instantiate loader with missing agentDir | Warning logged |
| 2 | Continue with limited discovery | Loader functional |

---

## 3. Functional Test Cases — Exception/Error Flows

### TC-201: loader.reload() fails

| Field | Value |
|-------|-------|
| **ID** | TC-201 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | UC-001 EF-1 |
| **Preconditions** | Filesystem error simulated |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call loader.reload() with inaccessible workspace | Error logged |
| 2 | Session creation aborted | No session created |

---

## 4. Business Rule Validation

### TC-301: BR-1 Session must use explicit DefaultResourceLoader

| Field | Value |
|-------|-------|
| **ID** | TC-301 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-1 |
| **Preconditions** | - |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Inspect createAgentSession call | resourceLoader is DefaultResourceLoader instance |

### TC-302: BR-2 cwd and agentDir passed to constructor

| Field | Value |
|-------|-------|
| **ID** | TC-302 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-2 |
| **Preconditions** | - |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Verify constructor arguments | cwd and agentDir match inputs |

### TC-303: BR-3 reload before session creation

| Field | Value |
|-------|-------|
| **ID** | TC-303 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-3 |
| **Preconditions** | - |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Check execution order | loader.reload() called before createAgentSession |

### TC-304: BR-4 Diagnostics logged

| Field | Value |
|-------|-------|
| **ID** | TC-304 |
| **Priority** | Medium |
| **Type** | Business Rule |
| **Requirement** | BR-4 |
| **Preconditions** | - |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger loader.reload() | Diagnostics/warnings appear in logs |

---

## 5. Boundary & Negative Testing

### TC-401: Empty cwd string

| Field | Value |
|-------|-------|
| **ID** | TC-401 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | Data validation |
| **Preconditions** | - |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Instantiate loader with cwd='' | Warning logged, fallback |

### TC-402: agentDir empty

| Field | Value |
|-------|-------|
| **ID** | TC-402 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | Data validation |
| **Preconditions** | - |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Instantiate loader with agentDir='' | Warning logged |

---

## 6. SIT Manual Tests

### SIT-001: Manual verification of resource discovery logs

| Field | Value |
|-------|-------|
| **ID** | SIT-001 |
| **Priority** | Medium |
| **Type** | Manual SIT |
| **Requirement** | UC-001 |
| **Preconditions** | App running |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Start session | Logs show loader diagnostics |

### SIT-002: Visual verification of discovered files

| Field | Value |
|-------|-------|
| **ID** | SIT-002 |
| **Priority** | Medium |
| **Type** | Manual SIT |
| **Requirement** | UC-002 |
| **Preconditions** | Workspace populated |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Inspect loader.getSkills() output | Files match workspace |

### SIT-003: Warning log verification for missing paths

| Field | Value |
|-------|-------|
| **ID** | SIT-003 |
| **Priority** | Low |
| **Type** | Manual SIT |
| **Requirement** | AF-1, AF-2 |
| **Preconditions** | Invalid paths configured |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run with invalid cwd | Warning visible in console/logs |

---

## 10. Requirements Traceability Matrix

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| UC-001 | FSD 3.1 | TC-001, TC-002, TC-003, TC-101, TC-102, TC-201, TC-301-304 | ✅ |
| UC-002 | FSD 3.2 | TC-003 | ✅ |
| BR-1 | FSD 3.1.3 | TC-301, TC-002 | ✅ |
| BR-2 | FSD 3.1.3 | TC-302, TC-001 | ✅ |
| BR-3 | FSD 3.1.3 | TC-303, TC-002 | ✅ |
| BR-4 | FSD 3.1.3 | TC-304, SIT-001 | ✅ |

**Coverage Summary:** 100% requirements covered.

---
