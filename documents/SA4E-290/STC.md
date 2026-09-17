# Software Test Cases (STC)

## SA4E-289 — SA4E-290: SA4E-289.1 – Setup Pi SDK & Pi Provider

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-290 |
| Title | SA4E-289.1 – Setup Pi SDK & Pi Provider |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-09-16 |
| Status | Draft |
| Related STP | STP.md |
| Related FSD | FSD.md |

---

## Test Case Summary

| Category | ID Range | Count |
|----------|----------|-------|
| Functional Happy Path | TC-001 to TC-099 | 4 |
| Alternative Flows | TC-100 to TC-199 | 1 |
| Exception/Error Flows | TC-200 to TC-299 | 3 |
| Business Rule Validation | TC-300 to TC-399 | 4 |
| Boundary & Negative | TC-400 to TC-499 | 2 |
| Non-Functional | TC-600 to TC-699 | 2 |
| Integration | TC-700 to TC-799 | 4 |

---

## 1. Functional Test Cases — Happy Path

### TC-001: SDK installed successfully

| Field | Value |
|-------|-------|
| ID | TC-001 |
| Priority | High |
| Type | Functional |
| Requirement | UC-001, BRD Story 1 AC1-4 |
| Preconditions | package.json exists, npm registry accessible |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Verify `extension/package.json` contains dependency `@earendil-works/pi-agent-core` with valid semver | Package present |
| 2 | Run `npm install` in extension folder | Install completes with no error |
| 3 | Check `node_modules/@earendil-works/pi-agent-core` exists | Directory exists |
| 4 | Verify no peer dependency conflict reported | No breaking change |

**Test Data:** package.json dependency version from migration plan
**Postconditions:** SDK ready for use

---

### TC-002: Provider initializes with WebSocket

| Field | Value |
|-------|-------|
| ID | TC-002 |
| Priority | High |
| Type | Functional |
| Requirement | UC-002, FSD 3.2 |
| Preconditions | Pi SDK installed |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create PiProviderConfig with transportType=WebSocket | Config accepted |
| 2 | Call provider.initialize(config) | Promise resolves |
| 3 | Verify piSessionId returned | Non-empty string |
| 4 | Verify currentAgentId set | Agent id present |

**Test Data:** transportType=WebSocket, sessionId optional
**Postconditions:** Provider initialized

---

### TC-003: Provider initializes with HTTP

| Field | Value |
|-------|-------|
| ID | TC-003 |
| Priority | High |
| Type | Functional |
| Requirement | UC-002, BR-004 |
| Preconditions | Pi SDK installed |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create config transportType=HTTP | Config accepted |
| 2 | Call provider.initialize | Success |
| 3 | Verify piSessionId returned | Present |

---

### TC-004: Interface file exists

| Field | Value |
|-------|-------|
| ID | TC-004 |
| Priority | High |
| Type | Functional |
| Requirement | BRD Story 2 AC1 |
| Preconditions | Code committed |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Check `extension/src/pi-workflow/pi-provider.ts` exists | File exists |
| 2 | Verify interface defines initialize, createAgent, stream, handleToolUse | Methods present |
| 3 | Verify JSDoc coverage 100% for public methods | All methods documented |

---

## 2. Alternative Flows

### TC-101: Transport unsupported

| Field | Value |
|-------|-------|
| ID | TC-101 |
| Priority | Medium |
| Type | Functional Alternative |
| Requirement | UC-002 AF-1 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Set transportType=TCP | ConfigurationError thrown with clear message |

---

## 3. Exception/Error Flows

### TC-201: SDK init failure fallback

| Field | Value |
|-------|-------|
| ID | TC-201 |
| Priority | High |
| Type | Exception |
| Requirement | UC-002 EF-1 |
| Preconditions | Mock SDK throws |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Mock PiAgent.create to throw | Error logged |
| 2 | Verify fallback to existing provider | Fallback executed |
| 3 | Verify error code PI_INIT_FAILED logged | Log contains code |

---

### TC-202: Missing config throws

| Field | Value |
|-------|-------|
| ID | TC-202 |
| Priority | High |
| Type | Exception |
| Requirement | FSD 9.1 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call initialize with empty config | ConfigurationError thrown |
| 2 | Verify message mentions missing config | Clear message |

---

### TC-203: Dependency conflict

| Field | Value |
|-------|-------|
| ID | TC-203 |
| Priority | High |
| Type | Exception |
| Requirement | BRD Story1 Error Handling |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Simulate version conflict | Install aborts |
| 2 | Verify notification to architect | Report generated |

---

## 4. Business Rule Validation

### TC-301: Version confirmed from docs

| Field | Value |
|-------|-------|
| ID | TC-301 |
| Priority | High |
| Type | Business Rule |
| Requirement | BR-001 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Check package.json version matches Pi SDK docs | Version matches |

---

### TC-302: No downgrade core deps

| Field | Value |
|-------|-------|
| ID | TC-302 |
| Priority | High |
| Type | Business Rule |
| Requirement | BR-002 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Compare package.json before/after | Core deps not downgraded |

---

### TC-303: Method names match contract

| Field | Value |
|-------|-------|
| ID | TC-303 |
| Priority | High |
| Type | Business Rule |
| Requirement | BR-003 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Compare PiProvider methods with existing LLM provider contract | Names match |

---

### TC-304: Transport type valid

| Field | Value |
|-------|-------|
| ID | TC-304 |
| Priority | High |
| Type | Business Rule |
| Requirement | BR-004 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Test config with WebSocket and HTTP | Accepted |
| 2 | Test with other values | Rejected |

---

## 5. Boundary & Negative

### TC-401: Empty agentId

| Field | Value |
|-------|-------|
| ID | TC-401 |
| Priority | Medium |
| Type | Boundary |
| Requirement | FSD 3.2.5 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call createAgent with empty agentId | Validation error |

---

### TC-402: Version string invalid

| Field | Value |
|-------|-------|
| ID | TC-402 |
| Priority | Medium |
| Type | Negative |
| Requirement | BR-001 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Set version to non-semver | Install fails or validation error |

---

## 6. Non-Functional

### TC-601: Init latency

| Field | Value |
|-------|-------|
| ID | TC-601 |
| Priority | Medium |
| Type | Non-Functional Performance |
| Requirement | FSD 8 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Measure provider.initialize duration | p95 <500ms |

---

### TC-602: No secrets in code

| Field | Value |
|-------|-------|
| ID | TC-602 |
| Priority | High |
| Type | Non-Functional Security |
| Requirement | FSD 8 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Grep source for API keys | No secrets found |
| 2 | Verify config via env | Config uses env vars |

---

## 7. Integration Testing

### TC-701: SDK import

| Field | Value |
|-------|-------|
| ID | TC-701 |
| Priority | High |
| Type | Integration |
| Requirement | FSD 5.1 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Import @earendil-works/pi-agent-core | Import succeeds |
| 2 | Verify exports PiAgent | Export present |

---

### TC-702: State mapping preserved

| Field | Value |
|-------|-------|
| ID | TC-702 |
| Priority | High |
| Type | Integration |
| Requirement | FSD 4.1 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Check PipelineState retains ticketKey, threadId, currentPhase, pipelineStatus | Fields present |
| 2 | Verify new fields piSessionId, currentAgentId added | Fields present |

---

### TC-703: Retry on init failure

| Field | Value |
|-------|-------|
| ID | TC-703 |
| Priority | Medium |
| Type | Integration |
| Requirement | FSD 5.1 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Simulate transient failure | 3 retry attempts |
| 2 | Verify exponential backoff | Delays increase |

---

### TC-704: Audit log

| Field | Value |
|-------|-------|
| ID | TC-704 |
| Priority | Medium |
| Type | Integration |
| Requirement | FSD 7.3 |

**Test Steps:**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Initialize provider | Log entry created with providerName, transportType, success |

---

## 8. Requirements Traceability Matrix

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| UC-001 | FSD 3.1 | TC-001, TC-203, TC-301, TC-302 | Covered |
| UC-002 | FSD 3.2 | TC-002, TC-003, TC-004, TC-101, TC-201, TC-202 | Covered |
| BR-001 | FSD 3.1.3 | TC-301, TC-402 | Covered |
| BR-002 | FSD 3.1.3 | TC-302 | Covered |
| BR-003 | FSD 3.2.3 | TC-303 | Covered |
| BR-004 | FSD 3.2.3 | TC-304, TC-101 | Covered |
| Story1 AC1-4 | BRD 2.3 | TC-001 | Covered |
| Story2 AC1-4 | BRD 2.3 | TC-004, TC-002, TC-003 | Covered |

**Coverage Summary:**
All requirements covered.
