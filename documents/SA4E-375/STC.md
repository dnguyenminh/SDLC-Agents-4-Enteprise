# Software Test Cases (STC)

## Code-Intel / SA4E-375: PROJECT_NOT_REGISTERED khi index vào KB

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-375 |
| Title | PROJECT_NOT_REGISTERED khi index vào KB |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-10-19 |
| Status | Draft |
| Related STP | STP-v1-SA4E-375.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-19 | QA Agent | Initial test cases |

---

## Test Case Summary

| Level | Count | Prefix |
|-------|-------|--------|
| PBT | 4 | PBT-XX |
| UT | 8 | UT-XX |
| IT | 6 | IT-XX |
| E2E-API | 5 | E2E-API-XX |
| E2E-UI | 4 | E2E-UI-XX |
| SIT | 3 | SIT-XX |
| Total | 30 | |

---

## PBT — Property-Based Tests

### PBT-01: projectId derivation stable across random workspaces

| Attribute | Value |
|-----------|-------|
| ID | PBT-01 |
| Priority | High |
| Type | Property-Based |
| Requirement | BRD AC3 |
| File | tests/pbt/projectId.stable.test.ts |

**Property:** For same workspace path, derived projectId is constant.
**Steps:** Generate 100 random workspace paths, derive ID twice, compare.
**Expected:** IDs match for same path, different for different paths.

### PBT-02: auto-register idempotent

| Attribute | Value |
|-----------|-------|
| ID | PBT-02 |
| Priority | High |
| Type | Property-Based |
| Requirement | BRD AC4 |
| File | tests/pbt/autoRegister.idempotent.test.ts |

**Property:** Multiple auto-register calls produce same project record.
**Expected:** No duplicate projects created.

### PBT-03: ensureProjectRegistered guard allows registered project

| Attribute | Value |
|-----------|-------|
| ID | PBT-03 |
| Priority | Medium |
| Type | Property-Based |
| Requirement | BRD 2 |
| File | tests/pbt/guard.allow.test.ts |

**Property:** For registered projectId, guard passes.
**Expected:** 200 OK.

### PBT-04: index payload preserved after auto-register

| Attribute | Value |
|-----------|-------|
| ID | PBT-04 |
| Priority | Medium |
| Type | Property-Based |
| Requirement | BRD AC1 |
| File | tests/pbt/index.preserve.test.ts |

**Property:** Random document payload roundtrips unchanged.
**Expected:** Indexed content matches input.

---

## UT — Unit Tests

### UT-01: deriveProjectId from git remote stable

| Attribute | Value |
|-----------|-------|
| ID | UT-01 |
| Priority | High |
| Type | Unit |
| Requirement | BRD AC3 |
| File | tests/unit/projectId.derive.test.ts |

**Preconditions:** Workspace has .git/config with remote origin
**Steps:**
1. Call deriveProjectId(workspacePath)
2. Call again
**Expected:** Same ID returned both times

### UT-02: deriveProjectId fallback to project.json

| Attribute | Value |
|-----------|-------|
| ID | UT-02 |
| Priority | High |
| Type | Unit |
| Requirement | BRD AC3 |
| File | tests/unit/projectId.fallback.test.ts |

**Preconditions:** No git remote, .code-intel/project.json exists with id
**Expected:** ID read from file, unchanged

### UT-03: autoRegister creates project without duplicate

| Attribute | Value |
|-----------|-------|
| ID | UT-03 |
| Priority | High |
| Type | Unit |
| Requirement | BRD AC4 |
| File | tests/unit/autoRegister.upsert.test.ts |

**Steps:**
1. Call autoRegister(projectId)
2. Call autoRegister(projectId) again
**Expected:** Second call returns existing project, no duplicate

### UT-04: ensureProjectRegistered returns 404 for unknown

| Attribute | Value |
|-----------|-------|
| ID | UT-04 |
| Priority | High |
| Type | Unit |
| Requirement | BRD 2 |
| File | tests/unit/guard.unknown.test.ts |

**Expected:** Error code PROJECT_NOT_REGISTERED, status 404

### UT-05: ensureProjectRegistered passes for known

| Attribute | Value |
|-----------|-------|
| ID | UT-05 |
| Priority | High |
| Type | Unit |
| Requirement | BRD 2 |
| File | tests/unit/guard.known.test.ts |

**Expected:** Continue request, status 200

### UT-06: IndexerHttpClient auto-register attempts once

| Attribute | Value |
|-----------|-------|
| ID | UT-06 |
| Priority | Medium |
| Type | Unit |
| Requirement | BRD AC1 |
| File | tests/unit/client.autoRegister.test.ts |

**Expected:** Flag _autoRegisterAttempted prevents repeat

### UT-07: MCP tool call triggers auto-register

| Attribute | Value |
|-----------|-------|
| ID | UT-07 |
| Priority | High |
| Type | Unit |
| Requirement | BRD AC2 |
| File | tests/unit/mcp.autoRegister.test.ts |

**Expected:** Request succeeds with auto-registered project

### UT-08: projectId persistence to file

| Attribute | Value |
|-----------|-------|
| ID | UT-08 |
| Priority | Medium |
| Type | Unit |
| Requirement | BRD AC3 |
| File | tests/unit/projectId.persist.test.ts |

**Expected:** .code-intel/project.json created with stable id

---

## IT — Integration Tests

### IT-01: Full index flow with unregistered project

| Attribute | Value |
|-----------|-------|
| ID | IT-01 |
| Priority | High |
| Type | Integration |
| Requirement | BRD AC1, AC2 |
| File | tests/integration/index.autoRegister.it.test.ts |

**Preconditions:** Project not in registry
**Steps:**
1. POST /api/index with document payload
2. Verify response 201
3. Verify project exists in registry
**Expected:** Index succeeds, project auto-registered

### IT-02: ensureProjectRegistered guard integration

| Attribute | Value |
|-----------|-------|
| ID | IT-02 |
| Priority | High |
| Type | Integration |
| Requirement | BRD 2 |
| File | tests/integration/guard.it.test.ts |

**Expected:** Unregistered project blocked with 404 PROJECT_NOT_REGISTERED, registered passes

### IT-03: MCP tool index auto-register

| Attribute | Value |
|-----------|-------|
| ID | IT-03 |
| Priority | High |
| Type | Integration |
| Requirement | BRD AC2 |
| File | tests/integration/mcp.index.it.test.ts |

**Steps:** Call MCP mem_ingest with new project context
**Expected:** 200 OK, project created

### IT-04: projectId stable across server restarts

| Attribute | Value |
|-----------|-------|
| ID | IT-04 |
| Priority | Medium |
| Type | Integration |
| Requirement | BRD AC3 |
| File | tests/integration/projectId.stable.it.test.ts |

**Steps:** Restart server, request index again
**Expected:** Same projectId used

### IT-05: Concurrent auto-register race

| Attribute | Value |
|-----------|-------|
| ID | IT-05 |
| Priority | Medium |
| Type | Integration |
| Requirement | BRD AC4 |
| File | tests/integration/race.it.test.ts |

**Steps:** Parallel requests for same unregistered project
**Expected:** Single project created, no duplicate

### IT-06: Multi-tenant isolation preserved

| Attribute | Value |
|-----------|-------|
| ID | IT-06 |
| Priority | High |
| Type | Integration |
| Requirement | BRD 3 |
| File | tests/integration/tenant.isolation.it.test.ts |

**Expected:** Project A cannot access Project B data

---

## E2E-API

### E2E-API-01: Index document via HTTP when project unregistered

| Attribute | Value |
|-----------|-------|
| ID | E2E-API-01 |
| Priority | High |
| Type | Automated (vitest + fetch) |
| File | tests/e2e/index.autoRegister.e2e.test.ts |
| Traces To | BRD AC1 |

**Preconditions:** Project not registered, server running
**Steps:**
1. GET /api/projects/{id} → expect 404
2. POST /api/index with projectId
3. GET /api/projects/{id} → expect 200
**Expected:** Auto-register succeeds, index created

### E2E-API-02: MCP tool call index auto-register

| Attribute | Value |
|-----------|-------|
| ID | E2E-API-02 |
| Priority | High |
| Type | Automated |
| File | tests/e2e/mcp.autoRegister.e2e.test.ts |
| Traces To | BRD AC2 |

**Expected:** MCP mem_ingest succeeds, project created

### E2E-API-03: projectId persisted file

| Attribute | Value |
|-----------|-------|
| ID | E2E-API-03 |
| Priority | High |
| Type | Automated |
| File | tests/e2e/projectId.persist.e2e.test.ts |
| Traces To | BRD AC3 |

**Steps:** Index twice, check .code-intel/project.json id unchanged
**Expected:** Same id

### E2E-API-04: No duplicate on repeated auto-register

| Attribute | Value |
|-----------|-------|
| ID | E2E-API-04 |
| Priority | Medium |
| Type | Automated |
| File | tests/e2e/duplicate.e2e.test.ts |
| Traces To | BRD AC4 |

**Expected:** Project count =1

### E2E-API-05: ensureProjectRegistered guard does not block registered

| Attribute | Value |
|-----------|-------|
| ID | E2E-API-05 |
| Priority | High |
| Type | Automated |
| File | tests/e2e/guard.allow.e2e.test.ts |
| Traces To | BRD 2 |

**Expected:** 200 OK for registered project

---

## E2E-UI

### E2E-UI-01: Extension UI shows project registered status

| Attribute | Value |
|-----------|-------|
| ID | E2E-UI-01 |
| Priority | Medium |
| Type | Automated (Playwright) |
| Feature File | tests/e2e/ui/project.status.e2e.test.ts |
| Traces To | BRD AC3 |

**Steps:** Open extension output panel, trigger index
**Expected:** Status shows project registered, no error

### E2E-UI-02: Index via UI button with unregistered project

| Attribute | Value |
|-----------|-------|
| ID | E2E-UI-02 |
| Priority | High |
| Type | Automated |
| Feature File | tests/e2e/ui/index.button.e2e.test.ts |
| Traces To | BRD AC1 |

**Expected:** Success toast, no PROJECT_NOT_REGISTERED

### E2E-UI-03: project.json created in workspace

| Attribute | Value |
|-----------|-------|
| ID | E2E-UI-03 |
| Priority | Medium |
| Type | Automated |
| Feature File | tests/e2e/ui/project.json.e2e.test.ts |
| Traces To | BRD AC3 |

**Expected:** File exists with stable id

### E2E-UI-04: MCP tool status reflects auto-register

| Attribute | Value |
|-----------|-------|
| ID | E2E-UI-04 |
| Priority | Medium |
| Type | Automated |
| Feature File | tests/e2e/ui/mcp.status.e2e.test.ts |
| Traces To | BRD AC2 |

**Expected:** No error message

---

## SIT — Manual

### SIT-01: Visual verification of project registration flow

| Attribute | Value |
|-----------|-------|
| ID | SIT-01 |
| Priority | Medium |
| Type | Manual |
| Requirement | BRD Overall |

**Steps:** Manually index from extension UI with clean workspace
**Expected:** No error, project registered silently

### SIT-02: Explore workspace without git remote

| Attribute | Value |
|-----------|-------|
| ID | SIT-02 |
| Priority | Medium |
| Type | Manual |
| Requirement | BRD AC3 |

**Expected:** projectId derived and stable via project.json

### SIT-03: Verify no duplicate projects in DB UI

| Attribute | Value |
|-----------|-------|
| ID | SIT-03 |
| Priority | Low |
| Type | Manual |
| Requirement | BRD AC4 |

**Expected:** Only one project record

---

## Requirements Traceability Matrix

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| Index document via IndexerHttpClient no PROJECT_NOT_REGISTERED | BRD AC1 | E2E-API-01, IT-01, UT-06, E2E-UI-02 | ✅ |
| MCP tool calls auto-register | BRD AC2 | E2E-API-02, IT-03, UT-07 | ✅ |
| projectId persist stable | BRD AC3 | PBT-01, UT-01, UT-02, UT-08, E2E-API-03, E2E-UI-03 | ✅ |
| No duplicate project | BRD AC4 | PBT-02, UT-03, IT-05, E2E-API-04 | ✅ |
| ensureProjectRegistered guard | BRD 2 | UT-04, UT-05, IT-02, E2E-API-05 | ✅ |
| Multi-tenant isolation | BRD 3 | IT-06 | ✅ |

**Coverage Summary:**
| Category | Total | Covered | % |
|----------|-------|---------|---|
| Acceptance Criteria | 4 | 4 | 100% |
| Business Rules | 2 | 2 | 100% |
| Overall | 6 | 6 | 100% |

---

## Appendix
Test data CSVs located in `documents/SA4E-375/testdata/`
