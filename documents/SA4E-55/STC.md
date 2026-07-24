# System Test Cases (STC)

## Code Intelligence MCP Server - SA4E-55: Security: Fix Authentication/Authorization Vulnerabilities in Backend API

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-55 |
| Title | System Test Cases |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-07-23 |
| Status | Draft |
| Related STP | STP-v1-SA4E-55.docx |
| Related TDD | TDD-v1-SA4E-55.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-23 | QA Agent | Initial STC covering 34 test cases for Stories 1-8 and SR-01 |

---

## Test Case Conventions

- **Level:** PBT / UT / IT / E2E-API / E2E-UI / SIT
- **Priority:** P1 Critical / P2 High / P3 Medium / P4 Low
- **Status:** Not Run / Pass / Fail / Blocked
- Auth header format: Authorization: Bearer {token}
- All HTTP calls target http://localhost:48721

---

## STORY 1: Secure File Indexing Endpoints (F-06, F-07, F-08)

### TC-01: POST /api/index/source - No auth returns 401

| Field | Value |
|-------|-------|
| TC-ID | TC-01 |
| Story | STORY 1 |
| Finding | F-06 |
| Business Rule | BR-01 |
| Level | E2E-API |
| Priority | P1 Critical |
| Status | Not Run |

**Preconditions:** Server running on port 48721, CODE_INTEL_REQUIRE_AUTH=true

**Test Steps:**
1. Send POST /api/index/source with NO Authorization header
2. Body: { "path": "/home/user/project", "force": false }
3. Capture HTTP status and body

**Expected Result:**
- HTTP Status: 401
- Body: { "error": "Unauthorized" }
- No files are written to disk

**Pass Criteria:** Response status == 401 AND body.error == "Unauthorized"

---

### TC-02: POST /api/index/source - Valid session returns 200 and files written

| Field | Value |
|-------|-------|
| TC-ID | TC-02 |
| Story | STORY 1 |
| Finding | F-06 |
| Business Rule | BR-01, BR-02 |
| Level | E2E-API |
| Priority | P1 Critical |
| Status | Not Run |

**Preconditions:**
- Server running
- Session token valid-token-config-edit exists in sessions table
- Workspace directory /tmp/test-workspace exists

**Test Steps:**
1. Send POST /api/index/source with Authorization: Bearer valid-token-config-edit
2. Body: { "path": "/tmp/test-workspace", "force": false }
3. Capture HTTP status and body

**Expected Result:**
- HTTP Status: 200
- Body contains: { "written": N, "rejected": 0, "reindexTriggered": true/false, "projectId": "uuid-..." }
- project_registry row created with created_by = user-002

**Pass Criteria:** Status == 200 AND body.written >= 0 AND body.projectId is non-empty string

---

### TC-03: POST /api/index/source - Expired token returns 401

| Field | Value |
|-------|-------|
| TC-ID | TC-03 |
| Story | STORY 1 |
| Finding | F-06 |
| Business Rule | BR-01 |
| Level | E2E-API |
| Priority | P1 Critical |
| Status | Not Run |

**Preconditions:** Session expired-token-001 has expiresAt in the past

**Test Steps:**
1. Send POST /api/index/source with Authorization: Bearer expired-token-001
2. Body: { "path": "/tmp/test-workspace", "force": false }
3. Capture response

**Expected Result:**
- HTTP Status: 401
- Body: { "error": "Unauthorized" }

**Pass Criteria:** Status == 401

---

### TC-04: POST /api/index/document - No auth returns 401

| Field | Value |
|-------|-------|
| TC-ID | TC-04 |
| Story | STORY 1 |
| Finding | F-07 |
| Business Rule | BR-01 |
| Level | E2E-API |
| Priority | P1 Critical |
| Status | Not Run |

**Test Steps:**
1. Send POST /api/index/document with NO Authorization header
2. Body: { "path": "/home/user/file.ts" }

**Expected Result:** HTTP Status 401, body.error == "Unauthorized"

---

### TC-05: POST /api/index/documents - No auth returns 401

| Field | Value |
|-------|-------|
| TC-ID | TC-05 |
| Story | STORY 1 |
| Finding | F-08 |
| Business Rule | BR-01 |
| Level | E2E-API |
| Priority | P1 Critical |
| Status | Not Run |

**Test Steps:**
1. Send POST /api/index/documents with NO Authorization header
2. Body: { "paths": ["/home/user/file.ts"] }

**Expected Result:** HTTP Status 401, body.error == "Unauthorized"

---

### TC-06: POST /api/index/source - Path traversal blocked regardless of auth

| Field | Value |
|-------|-------|
| TC-ID | TC-06 |
| Story | STORY 1 |
| Finding | F-06 |
| Business Rule | BR-03 |
| Level | E2E-API |
| Priority | P1 Critical |
| Status | Not Run |

**Preconditions:** Valid session token (valid-token-config-edit)

**Test Steps:**
1. Send POST /api/index/source with Authorization: Bearer valid-token-config-edit
2. Body: { "path": "../../../etc/passwd", "force": false }
3. Capture response

**Expected Result:**
- Path traversal is rejected
- Files from /etc are NOT written to server disk
- Either 400 or 200 with { written: 0, rejected: [...] } are acceptable

**Pass Criteria:** /etc/passwd contents are NOT written to server workspace


---

## STORY 2: Secure Database Administration Endpoints (F-01 to F-05, F-18 to F-20)

### TC-07: GET /api/admin/database/status - No auth returns 401

| Field | Value |
|-------|-------|
| TC-ID | TC-07 |
| Story | STORY 2 |
| Finding | F-01 |
| Business Rule | BR-05 |
| Level | E2E-API |
| Priority | P1 Critical |
| Status | Not Run |

**Test Steps:**
1. Send GET /api/admin/database/status with NO Authorization header
2. Capture response

**Expected Result:** HTTP Status 401, body: { "error": "Unauthorized" }

---

### TC-08: POST /api/admin/database/test-connection - No auth returns 401

| Field | Value |
|-------|-------|
| TC-ID | TC-08 |
| Story | STORY 2 |
| Finding | F-02 |
| Business Rule | BR-05 |
| Level | E2E-API |
| Priority | P1 Critical |
| Status | Not Run |

**Test Steps:**
1. Send POST /api/admin/database/test-connection with NO Authorization header
2. Body: { "engine": "postgresql", "host": "db.test.local", "port": 5432, "username": "test", "password": "test", "database": "testdb" }
3. Capture response

**Expected Result:**
- HTTP Status: 401
- No outbound DB connection is attempted (no network activity to db.test.local)

---

### TC-09: POST /api/admin/database/test-connection - Valid auth but NO CONFIG_EDIT returns 403

| Field | Value |
|-------|-------|
| TC-ID | TC-09 |
| Story | STORY 2 |
| Finding | F-02 |
| Business Rule | BR-05, BR-06 |
| Level | E2E-API |
| Priority | P1 Critical |
| Status | Not Run |

**Preconditions:** user-001 (valid-token-no-perms) has NO CONFIG_EDIT permission

**Test Steps:**
1. Send POST /api/admin/database/test-connection
2. Header: Authorization: Bearer valid-token-no-perms
3. Body: { "engine": "postgresql", "host": "db.test.local", "port": 5432, "username": "test", "password": "test", "database": "testdb" }
4. Capture response

**Expected Result:**
- HTTP Status: 403
- Body contains error indicating missing CONFIG_EDIT permission
- No outbound DB connection is attempted

---

### TC-10: POST /api/admin/database/test-connection - Valid auth WITH CONFIG_EDIT returns 200

| Field | Value |
|-------|-------|
| TC-ID | TC-10 |
| Story | STORY 2 |
| Finding | F-02 |
| Business Rule | BR-05, BR-06, BR-07 |
| Level | E2E-API |
| Priority | P2 High |
| Status | Not Run |

**Preconditions:** user-002 (valid-token-config-edit) has CONFIG_EDIT permission

**Test Steps:**
1. Send POST /api/admin/database/test-connection
2. Header: Authorization: Bearer valid-token-config-edit
3. Body: { "engine": "postgresql", "host": "127.0.0.1", "port": 5999, "username": "test", "password": "test", "database": "testdb" }
4. Capture response

**Expected Result:**
- HTTP Status: 200
- Body: { "success": false, "message": "Connection refused..." } (expected since no real DB at port 5999)
- Auth and permission checks PASS before connection attempt

**Pass Criteria:** Status == 200 (auth/authz passed, business logic executed)

---

### TC-11: POST /api/admin/database/migrate - No auth returns 401, NO SSE stream opened

| Field | Value |
|-------|-------|
| TC-ID | TC-11 |
| Story | STORY 2 |
| Finding | F-03 |
| Business Rule | BR-08 |
| Level | E2E-API |
| Priority | P1 Critical |
| Status | Not Run |

**Test Steps:**
1. Send POST /api/admin/database/migrate with NO Authorization header
2. Body: { "engine": "postgresql", "host": "db.test.local", "port": 5432, "username": "test", "password": "test", "database": "testdb" }
3. Capture response headers and body

**Expected Result:**
- HTTP Status: 401
- Content-Type is NOT text/event-stream (no SSE stream opened)
- Body: { "error": "Unauthorized" }

**Pass Criteria:** Status == 401 AND response is NOT an SSE stream

---

### TC-12: Admin module routes (/api/admin/database/*) same auth requirements

| Field | Value |
|-------|-------|
| TC-ID | TC-12 |
| Story | STORY 2 |
| Finding | F-18, F-19, F-20 |
| Business Rule | BR-09 |
| Level | E2E-API |
| Priority | P1 Critical |
| Status | Not Run |

**Test Steps:**
1. GET /api/admin/database/status (admin module) with NO auth -> expect 401
2. POST /api/admin/database/test-connection (admin module) with valid-token-no-perms -> expect 403
3. POST /api/admin/database/test-connection (admin module) with valid-token-config-edit -> expect 200
4. POST /api/admin/database/validate-schema (admin module) with NO auth -> expect 401
5. POST /api/admin/database/validate-schema (admin module) with valid-token-no-perms -> expect 403
6. POST /api/admin/database/validate-schema (admin module) with valid-token-config-edit -> expect 200

**Expected Result:** All 6 sub-checks pass with expected HTTP status codes

**Pass Criteria:** All 6 responses match expected status codes


---

## STORY 3: Verified Identity in MCP Tool Calls (F-10)

### TC-13: tools/call with valid session - userId from session, not from X-User-Id

| Field | Value |
|-------|-------|
| TC-ID | TC-13 |
| Story | STORY 3 |
| Finding | F-10 |
| Business Rule | BR-10 |
| Level | E2E-API |
| Priority | P1 Critical |
| Status | Not Run |

**Preconditions:**
- Session valid-token-config-edit belongs to user-002 (username: admin.config)
- CODE_INTEL_API_KEY is NOT set (session mode active)

**Test Steps:**
1. Send POST /mcp/tools/call
2. Headers: Authorization: Bearer valid-token-config-edit, X-User-Id: attacker-injected-user
3. Body: { "tool_name": "mem_search", "arguments": { "query": "test" } }
4. Capture response; check what __userId was stamped internally (via log or response)

**Expected Result:**
- Request is processed with __userId = user-002 (from session)
- X-User-Id header value "attacker-injected-user" is IGNORED as primary identity
- HTTP Status: 200

**Pass Criteria:** __userId in tool call context == user-002 (NOT attacker-injected-user)

---

### TC-14: tools/call with X-User-Id header and no valid session - X-User-Id stripped with warning

| Field | Value |
|-------|-------|
| TC-ID | TC-14 |
| Story | STORY 3 |
| Finding | F-10 |
| Business Rule | BR-13 |
| Level | E2E-API |
| Priority | P2 High |
| Status | Not Run |

**Preconditions:** CODE_INTEL_API_KEY is NOT set, no valid session token provided

**Test Steps:**
1. Send POST /mcp/tools/call with NO Authorization header
2. Header: X-User-Id: some-user
3. Body: { "tool_name": "mem_search", "arguments": { "query": "test" } }
4. Check server logs for WARNING message

**Expected Result:**
- If dev/no-auth mode: request accepted, server logs WARNING "X-User-Id accepted as fallback"
- If auth required mode (CODE_INTEL_REQUIRE_AUTH=true): 401 Unauthorized

**Pass Criteria:** X-User-Id is never the PRIMARY identity source; either rejected (401) or logged as warning fallback

---

### TC-15: tools/call - client-supplied __userId stripped from request body

| Field | Value |
|-------|-------|
| TC-ID | TC-15 |
| Story | STORY 3 |
| Finding | F-10 |
| Business Rule | BR-11 |
| Level | E2E-API |
| Priority | P1 Critical |
| Status | Not Run |

**Preconditions:** Valid session token valid-token-config-edit

**Test Steps:**
1. Send POST /mcp/tools/call with Authorization: Bearer valid-token-config-edit
2. Body: { "tool_name": "mem_search", "arguments": { "query": "test", "__userId": "evil-override", "__projectId": "fake-project", "__workspaceRoot": "/etc" } }
3. Capture what identity/scope is used in the tool invocation

**Expected Result:**
- __userId in arguments is stripped before tool receives the call
- __projectId and __workspaceRoot from request body are stripped
- Server stamps trusted values from session (not from body)

**Pass Criteria:** Tool receives args without __userId, __projectId, __workspaceRoot from client body

---

### TC-16: tools/call - JWT pid mismatch returns 403

| Field | Value |
|-------|-------|
| TC-ID | TC-16 |
| Story | STORY 3 |
| Finding | F-10 |
| Business Rule | BR-12 |
| Level | E2E-API |
| Priority | P1 Critical |
| Status | Not Run |

**Preconditions:**
- Valid JWT signed with KB_TOKEN_SECRET, payload: { sub: user-001, pid: proj-001 }
- X-Project-Id header set to proj-999 (different from JWT pid)

**Test Steps:**
1. Generate JWT: { sub: user-001, pid: proj-001 } signed with test-secret-32-bytes-for-hs256
2. Send POST /mcp/tools/call
3. Headers: Authorization: Bearer {jwt}, X-Project-Id: proj-999
4. Body: { "tool_name": "mem_search", "arguments": { "query": "test" } }

**Expected Result:**
- HTTP Status: 403
- Body: { "error": { "code": "FORBIDDEN", "message": "Project access denied" } }

**Pass Criteria:** Status == 403 when JWT pid does not include X-Project-Id value


---

## STORY 4: Authenticate MCP Tool Listing (F-09)

### TC-17: GET /mcp/tools/list - No auth returns 401

| Field | Value |
|-------|-------|
| TC-ID | TC-17 |
| Story | STORY 4 |
| Finding | F-09 |
| Business Rule | BR-14 |
| Level | E2E-API |
| Priority | P1 Critical |
| Status | Not Run |

**Test Steps:**
1. Send GET /mcp/tools/list with NO Authorization header

**Expected Result:**
- HTTP Status: 401
- Body: { "error": { "code": "UNAUTHORIZED", "message": "Authentication required" } }

---

### TC-18: GET /mcp/tools/list - Valid session but no MCP_ACCESS returns empty list

| Field | Value |
|-------|-------|
| TC-ID | TC-18 |
| Story | STORY 4 |
| Finding | F-09 |
| Business Rule | BR-15 |
| Level | E2E-API |
| Priority | P2 High |
| Status | Not Run |

**Preconditions:** user-001 (valid-token-no-perms) has NO MCP_ACCESS permission

**Test Steps:**
1. Send GET /mcp/tools/list with Authorization: Bearer valid-token-no-perms

**Expected Result:**
- HTTP Status: 200 (NOT 403)
- Body: { "tools": [] }

**Pass Criteria:** Status == 200 AND body.tools is an empty array

---

### TC-19: GET /mcp/tools/list - Valid session with MCP_ACCESS returns tool list

| Field | Value |
|-------|-------|
| TC-ID | TC-19 |
| Story | STORY 4 |
| Finding | F-09 |
| Business Rule | BR-14, BR-15 |
| Level | E2E-API |
| Priority | P2 High |
| Status | Not Run |

**Preconditions:** user-004 (valid-token-mcp) has MCP_ACCESS permission

**Test Steps:**
1. Send GET /mcp/tools/list with Authorization: Bearer valid-token-mcp

**Expected Result:**
- HTTP Status: 200
- Body: { "tools": [ { "name": "...", "description": "...", "inputSchema": {...} }, ... ] }
- tools array is non-empty

**Pass Criteria:** Status == 200 AND body.tools.length > 0

---

### TC-20: GET /mcp/tools/list - API key returns full tool list

| Field | Value |
|-------|-------|
| TC-ID | TC-20 |
| Story | STORY 4 |
| Finding | F-09 |
| Business Rule | BR-16 |
| Level | E2E-API |
| Priority | P2 High |
| Status | Not Run |

**Preconditions:** CODE_INTEL_API_KEY=test-api-key-12345 set in environment

**Test Steps:**
1. Send GET /mcp/tools/list with Authorization: Bearer test-api-key-12345

**Expected Result:**
- HTTP Status: 200
- Body: { "tools": [ ... ] } - full unfiltered list
- No RBAC filtering applied (API key bypasses MCP_ACCESS check)

**Pass Criteria:** Status == 200 AND tools are returned without RBAC filter

---

## STORY 5: Sanitize Admin Portal Token Handoff (F-13)

### TC-21: GET /admin?token=abc123 - Valid token injected safely

| Field | Value |
|-------|-------|
| TC-ID | TC-21 |
| Story | STORY 5 |
| Finding | F-13 |
| Business Rule | BR-17, BR-19 |
| Level | E2E-UI |
| Priority | P1 Critical |
| Status | Not Run |

**Test Steps:**
1. Send GET /admin?token=abc123
2. Capture HTML response body

**Expected Result:**
- HTTP Status: 200
- HTML contains exactly: localStorage.setItem("admin_token","abc123")
- No extra characters or modifications to the token value

**Pass Criteria:** HTML body contains the expected localStorage script with exact token value

---

### TC-22: GET /admin?token=x"<script>alert(1)</script> - XSS payload stripped

| Field | Value |
|-------|-------|
| TC-ID | TC-22 |
| Story | STORY 5 |
| Finding | F-13 |
| Business Rule | BR-17 |
| Level | E2E-UI |
| Priority | P1 Critical |
| Status | Not Run |

**Test Steps:**
1. Send GET /admin?token=x%22%3Cscript%3Ealert(1)%3C/script%3E (URL-encoded XSS payload)
2. Capture HTML response body

**Expected Result:**
- HTTP Status: 200
- HTML does NOT contain: alert(1)
- HTML does NOT contain: <script> from the token
- If any script tag is present from the token, it contains only sanitized chars [A-Za-z0-9-_.]

**Pass Criteria:** alert(1) does NOT appear in the response HTML

---

### TC-23: GET /admin with no token - No script block injected

| Field | Value |
|-------|-------|
| TC-ID | TC-23 |
| Story | STORY 5 |
| Finding | F-13 |
| Business Rule | BR-18 |
| Level | E2E-UI |
| Priority | P2 High |
| Status | Not Run |

**Test Steps:**
1. Send GET /admin (no token parameter)
2. Capture HTML response body

**Expected Result:**
- HTTP Status: 200
- HTML does NOT contain any localStorage.setItem("admin_token",...) script
- Page loads normally (standard HTML structure)

**Pass Criteria:** admin_token script is absent from HTML response

---

### TC-24: GET /admin?page=rbac - RBAC page loads correctly

| Field | Value |
|-------|-------|
| TC-ID | TC-24 |
| Story | STORY 5 |
| Finding | F-13 |
| Business Rule | BR-17 |
| Level | E2E-UI |
| Priority | P3 Medium |
| Status | Not Run |

**Test Steps:**
1. Send GET /admin?page=rbac with valid token
2. Verify page loads without error

**Expected Result:**
- HTTP Status: 200
- HTML is returned (admin SPA content)
- No server-side error (no 500 status)

---

### TC-25: GET /admin?page=XSS-payload - Page param XSS stripped (SR-07)

| Field | Value |
|-------|-------|
| TC-ID | TC-25 |
| Story | STORY 5 |
| Finding | F-13 |
| Business Rule | BR-17 |
| Level | E2E-UI |
| Priority | P1 Critical |
| Status | Not Run |

**Test Steps:**
1. Send GET /admin?page=');alert(1);//
2. Capture HTML response

**Expected Result:**
- HTTP Status: 200
- alert(1) does NOT appear in response HTML as executable JavaScript
- Page param is either sanitized or ignored

**Pass Criteria:** alert(1) is not executable in the rendered response


---

## STORY 6: Require CONFIG_EDIT for LLM Endpoints (F-14, F-15)

### TC-26: GET /api/admin/llm/models - No CONFIG_EDIT returns 403

| Field | Value |
|-------|-------|
| TC-ID | TC-26 |
| Story | STORY 6 |
| Finding | F-14 |
| Business Rule | BR-20 |
| Level | E2E-API |
| Priority | P2 High |
| Status | Not Run |

**Preconditions:** user-001 (valid-token-no-perms) has NO CONFIG_EDIT permission

**Test Steps:**
1. Send GET /api/admin/llm/models with Authorization: Bearer valid-token-no-perms

**Expected Result:**
- HTTP Status: 403
- No outbound HTTP call to LLM server is made

**Pass Criteria:** Status == 403

---

### TC-27: POST /api/admin/llm/test - SSRF private IP blocked, returns success:false

| Field | Value |
|-------|-------|
| TC-ID | TC-27 |
| Story | STORY 6 |
| Finding | F-15 |
| Business Rule | BR-22 |
| Level | E2E-API |
| Priority | P1 Critical |
| Status | Not Run |

**Preconditions:** user-002 (valid-token-config-edit) has CONFIG_EDIT permission

**Test Steps:**
1. Configure LLM baseUrl to http://169.254.169.254/latest/meta-data (AWS metadata endpoint)
2. Send POST /api/admin/llm/test with Authorization: Bearer valid-token-config-edit
3. Body: (trigger with configured private IP baseUrl)

**Expected Result:**
- HTTP Status: 200 (not 403 - auth passed)
- Body: { "success": false, "message": "SSRF blocked: ..." }
- No actual HTTP request to 169.254.169.254 is made

**Pass Criteria:** Status == 200 AND success == false AND message contains "SSRF blocked"

---

### TC-28: GET /api/admin/config - apiKey is masked as "***"

| Field | Value |
|-------|-------|
| TC-ID | TC-28 |
| Story | STORY 6 |
| Finding | F-15 |
| Business Rule | BR-23 |
| Level | E2E-API |
| Priority | P2 High |
| Status | Not Run |

**Preconditions:**
- LLM_API_KEY env var set to a real key value (e.g., sk-test-12345)
- user-002 has CONFIG_EDIT permission

**Test Steps:**
1. Send GET /api/admin/config with Authorization: Bearer valid-token-config-edit
2. Capture response body
3. Check apiKey field value

**Expected Result:**
- HTTP Status: 200
- Response body contains apiKey: "***" (NOT the real key value)
- Real key "sk-test-12345" does NOT appear in response

**Pass Criteria:** apiKey field in response == "***"

---

## STORY 7: Workspace Data Isolation for Regular Users (F-16)

### TC-29: GET /api/admin/projects - Regular user sees only own workspaces

| Field | Value |
|-------|-------|
| TC-ID | TC-29 |
| Story | STORY 7 |
| Finding | F-16 |
| Business Rule | BR-26 |
| Level | E2E-API |
| Priority | P1 Critical |
| Status | Not Run |

**Preconditions:**
- proj-001 has created_by=user-001
- proj-002 has created_by=user-003
- proj-legacy has created_by='' (empty - legacy)

**Test Steps:**
1. Send GET /api/admin/projects with Authorization: Bearer valid-token-no-perms (user-001)
2. Capture projects array

**Expected Result:**
- HTTP Status: 200
- projects array contains proj-001 (created_by=user-001)
- projects array does NOT contain proj-002 (created_by=user-003)
- projects array does NOT contain proj-legacy (created_by='')

**Pass Criteria:** projects contains ONLY user-001's workspaces

---

### TC-30: GET /api/admin/projects - Admin with RBAC_MANAGE sees all workspaces

| Field | Value |
|-------|-------|
| TC-ID | TC-30 |
| Story | STORY 7 |
| Finding | F-16 |
| Business Rule | BR-25 |
| Level | E2E-API |
| Priority | P2 High |
| Status | Not Run |

**Preconditions:** user-003 (valid-token-rbac-manage) has RBAC_MANAGE permission

**Test Steps:**
1. Send GET /api/admin/projects with Authorization: Bearer valid-token-rbac-manage
2. Capture projects array

**Expected Result:**
- HTTP Status: 200
- projects array contains ALL rows from project_registry (proj-001, proj-002, proj-legacy)

**Pass Criteria:** projects.length >= 3 (all seeded records visible)

---

### TC-31: GET /api/admin/projects - No auth returns 401

| Field | Value |
|-------|-------|
| TC-ID | TC-31 |
| Story | STORY 7 |
| Finding | F-16 |
| Business Rule | BR-24 |
| Level | E2E-API |
| Priority | P1 Critical |
| Status | Not Run |

**Test Steps:**
1. Send GET /api/admin/projects with NO Authorization header

**Expected Result:** HTTP Status 401, body: { "error": "Unauthorized" }

---

## STORY 8: Privilege Check on Graph Sync (F-17)

### TC-32: POST /api/admin/kb/graph/sync - GRAPH_VIEW only returns 403

| Field | Value |
|-------|-------|
| TC-ID | TC-32 |
| Story | STORY 8 |
| Finding | F-17 |
| Business Rule | STORY 8 Req |
| Level | E2E-API |
| Priority | P1 Critical |
| Status | Not Run |

**Preconditions:** user-004 (valid-token-mcp) has MCP_ACCESS but NOT RBAC_MANAGE; add GRAPH_VIEW to user-004 for this test

**Test Steps:**
1. Ensure user-004 has GRAPH_VIEW permission but NOT RBAC_MANAGE
2. Send POST /api/admin/kb/graph/sync with Authorization: Bearer valid-token-mcp

**Expected Result:**
- HTTP Status: 403
- Graph reset is NOT triggered
- Body contains error about missing RBAC_MANAGE permission

**Pass Criteria:** Status == 403

---

### TC-33: POST /api/admin/kb/graph/sync - RBAC_MANAGE returns sync_started

| Field | Value |
|-------|-------|
| TC-ID | TC-33 |
| Story | STORY 8 |
| Finding | F-17 |
| Business Rule | STORY 8 Req |
| Level | E2E-API |
| Priority | P2 High |
| Status | Not Run |

**Preconditions:** user-003 (valid-token-rbac-manage) has RBAC_MANAGE permission

**Test Steps:**
1. Send POST /api/admin/kb/graph/sync with Authorization: Bearer valid-token-rbac-manage

**Expected Result:**
- HTTP Status: 200
- Body: { "status": "sync_started", "message": "Graph sync triggered in background." }

**Pass Criteria:** Status == 200 AND body.status == "sync_started"

---

## Additional: JWT Secret Enforcement (SR-01)

### TC-34: JWT without KB_TOKEN_SECRET set - Token rejected as invalid

| Field | Value |
|-------|-------|
| TC-ID | TC-34 |
| Story | Additional |
| Finding | SR-01 |
| Business Rule | TDD constraint |
| Level | IT |
| Priority | P1 Critical |
| Status | Not Run |

**Preconditions:** KB_TOKEN_SECRET environment variable is NOT set (empty string or undefined)

**Test Steps:**
1. Unset KB_TOKEN_SECRET in test environment
2. Generate a well-formed JWT (valid header+payload+signature, but signed with any secret)
3. Call verifyJwtToken(token) directly (unit test) OR send POST /mcp/tools/call with the JWT as Bearer
4. Capture result

**Expected Result:**
- verifyJwtToken returns { valid: false }
- The JWT is NOT accepted as a valid identity source
- If server is in REQUIRE_AUTH mode, the request returns 401

**Pass Criteria:** valid == false when KB_TOKEN_SECRET is not configured

---

## Test Case Summary

| Story | TC-IDs | Count | Priority |
|-------|--------|-------|---------|
| STORY 1: Index Auth | TC-01 to TC-06 | 6 | P1/P1/P1/P1/P1/P1 |
| STORY 2: DB Admin Auth | TC-07 to TC-12 | 6 | P1/P1/P1/P2/P1/P1 |
| STORY 3: Identity Verification | TC-13 to TC-16 | 4 | P1/P2/P1/P1 |
| STORY 4: tools/list Auth | TC-17 to TC-20 | 4 | P1/P2/P2/P2 |
| STORY 5: XSS Token Sanitization | TC-21 to TC-25 | 5 | P1/P1/P2/P3/P1 |
| STORY 6: LLM CONFIG_EDIT + SSRF | TC-26 to TC-28 | 3 | P2/P1/P2 |
| STORY 7: Workspace Isolation | TC-29 to TC-31 | 3 | P1/P2/P1 |
| STORY 8: Graph Sync Privilege | TC-32 to TC-33 | 2 | P1/P2 |
| Additional: SR-01 JWT Secret | TC-34 | 1 | P1 |
| **TOTAL** | TC-01 to TC-34 | **34** | |

**P1 Critical count:** 22 test cases
**P2 High count:** 10 test cases
**P3 Medium count:** 1 test case
**P4 Low count:** 1 test case
