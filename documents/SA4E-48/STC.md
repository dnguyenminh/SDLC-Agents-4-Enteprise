# Software Test Cases (STC)

## SDLC Agents 4 Enterprise — SA4E-48: OpenCode v1.17.15 SSE error 405 — WrapperServer missing endpoint event

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-48 |
| Title | OpenCode v1.17.15 SSE error 405 — WrapperServer missing endpoint event |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-07-20 |
| Status | Draft |
| Related STP | STP-v1.0-SA4E-48.docx |
| Related FSD | FSD-v1.1-SA4E-48.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-20 | QA Agent | Initiate document — auto-generated from FSD use cases and business rules |

---

## Test Case Summary

| Category | ID Range | Count | Priority | Level Distribution |
|----------|----------|-------|----------|-------------------|
| Functional - Happy Path | TC-001 to TC-013 | 13 | High | IT(5), E2E-API(5), SIT(3) |
| Functional - Alternative Flows | TC-100 to TC-105 | 6 | High | IT(4), E2E-API(2) |
| Functional - Exception/Error Flows | TC-200 to TC-211 | 12 | High | IT(9), E2E-API(2), SIT(1) |
| Business Rule Validation | TC-300 to TC-320 | 21 | High | IT(18), E2E-API(3) |
| Boundary & Negative Testing | TC-400 to TC-405 | 6 | Medium | IT(5), SIT(1) |
| Non-Functional | TC-600 to TC-603 | 4 | Medium | IT(2), SIT(2) |
| Integration Testing | TC-700 to TC-703 | 4 | High | IT(3), SIT(1) |
| Regression Testing | TC-800 to TC-806 | 7 | High | E2E-API(7) |
| **Total** | | **73** | | **23 automated + 5 manual** |

### Test Levels Breakdown

| Level | Count | Automated | Manual | Existing Test File |
|-------|-------|-----------|--------|-------------------|
| PBT | 1 | 1 | 0 | wrapper-server.test.ts (TC-27) |
| IT | 41 | 41 | 0 | wrapper-server.test.ts |
| E2E-API | 22 | 22 | 0 | mcp-handshake.regression.test.ts + wrapper-server.test.ts |
| E2E-UI | 0 | 0 | 0 | N/A |
| SIT | 9 | 0 | 9 | Manual only |
| **Total** | **73** | **64 (88%)** | **9 (12%)** | |

---

## 1. Functional Test Cases — Happy Path

### TC-001: GET /mcp returns SSE stream with HTTP 200 and correct Content-Type

| Field | Value |
|-------|-------|
| **ID** | TC-001 |
| **Priority** | High |
| **Type** | Functional / E2E-API |
| **Level** | E2E-API |
| **Requirement** | UC-01, BR-3, BR-28, BRD Story 1 AC-1 |
| **Preconditions** | WrapperServer is running on a random port with mocked deps |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open HTTP GET connection to `http://127.0.0.1:{port}/mcp` | Connection established |
| 2 | Read response status code | 200 OK |
| 3 | Read response header `Content-Type` | Contains `text/event-stream` |
| 4 | Read first SSE event data | Stream contains `event: message` within 3000ms |

**Test Data:** Port = random (from `createTestServer()`)
**Postconditions:** SSE connection is closed by test helper

---

### TC-002: SSE stream contains event: endpoint before event: message

| Field | Value |
|-------|-------|
| **ID** | TC-002 |
| **Priority** | High |
| **Type** | Functional / E2E-API |
| **Level** | E2E-API |
| **Requirement** | UC-01, BR-1, BR-2, BR-10, TC-13 (FSD) |
| **Preconditions** | WrapperServer running, SSE connection open |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open GET /mcp SSE stream | Connection established |
| 2 | Read raw SSE data until at least 2 events received | Data buffer contains both events |
| 3 | Find first occurrence of `event:` in buffer | First event is `event: endpoint` |
| 4 | Find second occurrence of `event:` in buffer | Second event is `event: message` |
| 5 | Check that `event: endpoint` line is followed by `data: /mcp` | Data field contains exactly `/mcp` |

**Test Data:** Port = random
**Postconditions:** Connection closed

---

### TC-003: initialize method returns protocolVersion, capabilities, serverInfo

| Field | Value |
|-------|-------|
| **ID** | TC-003 |
| **Priority** | High |
| **Type** | Functional / IT |
| **Level** | IT |
| **Requirement** | UC-02, BR-12, BRD Story 1 AC-4 |
| **Preconditions** | WrapperServer running on random port |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /mcp with `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"vscode","version":"1.128.0"}}}` | Status 200 |
| 2 | Parse JSON response body | Response has `jsonrpc: "2.0"`, `id: 1` |
| 3 | Check `result.protocolVersion` | `"2024-11-05"` |
| 4 | Check `result.capabilities` | Object with `tools.listChanged: false` |
| 5 | Check `result.serverInfo` | `name: "sdlc-agents-4-enterprise"`, `version: "1.11.0"` |

**Test Data:** Standard initialize request matching protocol version
**Postconditions:** None

---

### TC-004: Full handshake flow (initialize -> notifications/initialized -> tools/list)

| Field | Value |
|-------|-------|
| **ID** | TC-004 |
| **Priority** | High |
| **Type** | Functional / E2E-API |
| **Level** | E2E-API |
| **Requirement** | UC-02, BRD Story 1 AC-4, AC-5, AC-6 |
| **Preconditions** | WrapperServer running, mock backend returns tool schemas |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /mcp with initialize request | Status 200, `result.protocolVersion` defined |
| 2 | POST /mcp with `{"jsonrpc":"2.0","method":"notifications/initialized"}` | Status 202, empty body |
| 3 | POST /mcp with `{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}` | Status 200, `result.tools` is non-empty array |

**Test Data:** Mock tools: `drawio_export_png`, `mem_search`
**Postconditions:** None

---

### TC-005: ping returns empty result

| Field | Value |
|-------|-------|
| **ID** | TC-005 |
| **Priority** | High |
| **Type** | Functional / IT |
| **Level** | IT |
| **Requirement** | UC-02, BR-14, BRD Story 1 AC-7 |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /mcp with `{"jsonrpc":"2.0","id":1,"method":"ping"}` | Status 200 |
| 2 | Check response body | `result: {}` (empty object), no `error` field |

**Test Data:** Standard ping request
**Postconditions:** None

---

### TC-006: notifications/initialized returns 202 Accepted

| Field | Value |
|-------|-------|
| **ID** | TC-006 |
| **Priority** | High |
| **Type** | Functional / IT |
| **Level** | IT |
| **Requirement** | BR-13, BRD Story 1 AC-5 |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /mcp with `{"jsonrpc":"2.0","method":"notifications/initialized"}` | Status 202 |
| 2 | Check response body | Empty string |

**Test Data:** Notification without `id` field
**Postconditions:** None

---

### TC-007: tools/list returns tool definitions via mocked backend

| Field | Value |
|-------|-------|
| **ID** | TC-007 |
| **Priority** | High |
| **Type** | Functional / IT |
| **Level** | IT |
| **Requirement** | BR-15, BRD Story 1 AC-6 |
| **Preconditions** | WrapperServer running, `restGetToolsMock` returns `TOOL_SCHEMAS` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /mcp with `{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}` | Status 200 |
| 2 | Parse response body | `result.tools` is array, length > 0 |
| 3 | Find `drawio_export_png` in tools array | Tool exists with `name`, `description`, `inputSchema` |
| 4 | Check `content_base64` is removed from schema | `inputSchema.properties` does not contain `content_base64` |

**Test Data:** Mock tools from `wrapper-server.helpers.ts`
**Postconditions:** None

---

### TC-008: Protocol negotiation - exact version match

| Field | Value |
|-------|-------|
| **ID** | TC-008 |
| **Priority** | High |
| **Type** | Functional / IT |
| **Level** | IT |
| **Requirement** | BR-11, BR-20 |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /mcp with initialize, `protocolVersion: "2024-11-05"` | `result.protocolVersion` = `"2024-11-05"` |
| 2 | POST /mcp with initialize, `protocolVersion: "2025-03-26"` | `result.protocolVersion` = `"2025-03-26"` |
| 3 | POST /mcp with initialize, `protocolVersion: "2025-06-18"` | `result.protocolVersion` = `"2025-06-18"` |

**Test Data:** Each supported protocol version
**Postconditions:** None

---

### TC-009: Protocol negotiation - unknown version falls back to newest

| Field | Value |
|-------|-------|
| **ID** | TC-009 |
| **Priority** | High |
| **Type** | Functional / IT |
| **Level** | IT |
| **Requirement** | BR-20, AF-2 |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /mcp with initialize, `protocolVersion: "2099-01-01"` | `result.protocolVersion` = `"2025-06-18"` (newest) |
| 2 | POST /mcp with initialize, `protocolVersion: undefined` | `result.protocolVersion` = `"2025-06-18"` (newest) |
| 3 | POST /mcp with initialize, no `params` | `result.protocolVersion` = `"2025-06-18"` (newest) |

**Test Data:** Unknown version, undefined, missing params
**Postconditions:** None

---

### TC-010: SSE stream receives keep-alive comments

| Field | Value |
|-------|-------|
| **ID** | TC-010 |
| **Priority** | Medium |
| **Type** | Non-Functional / SIT |
| **Level** | SIT |
| **Requirement** | BR-4, BR-7, TC-11 (FSD) |
| **Preconditions** | WrapperServer running, SSE connection open |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open GET /mcp SSE connection | Connection established, first events received |
| 2 | Wait 20 seconds monitoring the SSE stream | Within 20 seconds, at least one `: keep-alive` comment line is received |
| 3 | Verify keep-alive format | Line starts with `: ` (SSE comment format), ends with `\n\n` |

**Test Data:** Port = random, timeout = 25000ms
**Postconditions:** Connection closed

---

### TC-011: Server stop cleans up SSE timers

| Field | Value |
|-------|-------|
| **ID** | TC-011 |
| **Priority** | Medium |
| **Type** | Functional / SIT |
| **Level** | SIT |
| **Requirement** | BR-9, TC-12 (FSD) |
| **Preconditions** | WrapperServer running, at least one SSE connection open |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open SSE connection to GET /mcp | SSE stream active |
| 2 | Stop the WrapperServer (`server.stop()`) | Server stops gracefully |
| 3 | Verify SSE connection is closed | Client receives connection close event |
| 4 | Verify no keep-alive timer leak | After server stop, no further data is written to the old SSE connection |

**Test Data:** Server.stop() called while SSE active
**Postconditions:** Server stopped, SSE connection closed

---

### TC-012: tools/call routes drawio_export_png through Base64Proxy

| Field | Value |
|-------|-------|
| **ID** | TC-012 |
| **Priority** | High |
| **Type** | Functional / IT |
| **Level** | IT |
| **Requirement** | BR-16, BRD Story 1 |
| **Preconditions** | WrapperServer running, mock backend configured, temp file exists |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Write test `.drawio` file to temp directory | File exists |
| 2 | POST /mcp with `tools/call` for `drawio_export_png`, passing `file_path` | Status 200 |
| 3 | Check that `restCallTool` was called with `content_base64` in args | Base64Proxy added `content_base64` from file |
| 4 | Check response contains `file_path` and `size_bytes` | ProxyOutput created result file |

**Test Data:** `drawio_export_png` with `file_path: "{tmp}/input.drawio"`
**Postconditions:** Temp file cleaned up

---

### TC-013: OPTIONS preflight returns 204 with CORS headers

| Field | Value |
|-------|-------|
| **ID** | TC-013 |
| **Priority** | Medium |
| **Type** | Integration / IT |
| **Level** | IT |
| **Requirement** | BR-24, TC-15 (FSD) |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send OPTIONS request to `/mcp` | Status 204 |
| 2 | Check `Access-Control-Allow-Origin` header | `*` |
| 3 | Check `Access-Control-Allow-Methods` header | `GET, POST, OPTIONS` |
| 4 | Check `Access-Control-Allow-Headers` header | `Content-Type` |
| 5 | Verify empty body | No content |

**Test Data:** OPTIONS /mcp
**Postconditions:** None

---

## 2. Functional Test Cases — Alternative Flows

### TC-100: Client sends POST /mcp directly without SSE (AF-1)

| Field | Value |
|-------|-------|
| **ID** | TC-100 |
| **Priority** | Medium |
| **Type** | Functional - Alternative Flow |
| **Level** | IT |
| **Requirement** | UC-02, AF-1 |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /mcp with initialize request (no prior SSE connection) | Status 200, initialize succeeds |
| 2 | Verify response structure | `result.protocolVersion`, `result.capabilities`, `result.serverInfo` all present |

**Test Data:** Standard initialize request
**Postconditions:** Per MCP spec, SSE is optional; POST works standalone

---

### TC-101: Unknown protocol version from client (AF-2)

| Field | Value |
|-------|-------|
| **ID** | TC-101 |
| **Priority** | Medium |
| **Type** | Functional - Alternative Flow |
| **Level** | IT |
| **Requirement** | UC-02, AF-2 |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /mcp with initialize, `protocolVersion: "2099-01-01"` | Status 200 |
| 2 | Check `result.protocolVersion` | `"2025-06-18"` (newest fallback) |

**Test Data:** Unknown protocol version
**Postconditions:** None

---

### TC-102: Empty params for initialize (AF-3)

| Field | Value |
|-------|-------|
| **ID** | TC-102 |
| **Priority** | Medium |
| **Type** | Functional - Alternative Flow |
| **Level** | IT |
| **Requirement** | UC-02, AF-3 |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /mcp with `{"jsonrpc":"2.0","id":1,"method":"initialize"}` (no params) | Status 200 |
| 2 | Check `result.protocolVersion` | `"2025-06-18"` (newest fallback) |

**Test Data:** Initialize without params field
**Postconditions:** None

---

### TC-103: notifications/initialized without prior initialize (AF-4)

| Field | Value |
|-------|-------|
| **ID** | TC-103 |
| **Priority** | Medium |
| **Type** | Functional - Alternative Flow |
| **Level** | IT |
| **Requirement** | UC-02, AF-4, BR-23 |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /mcp with `{"jsonrpc":"2.0","method":"notifications/initialized"}` (no prior initialize) | Status 202 |
| 2 | Verify empty body | Response body is empty string |

**Test Data:** Notification sent without prior initialize
**Postconditions:** Server is stateless; no error expected

---

### TC-104: tools/call with local tool stream_write_file (AF-5)

| Field | Value |
|-------|-------|
| **ID** | TC-104 |
| **Priority** | Medium |
| **Type** | Functional - Alternative Flow |
| **Level** | IT |
| **Requirement** | UC-02, AF-5 |
| **Preconditions** | WrapperServer running, temp directory exists |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /mcp with `tools/call` for `stream_write_file` with `file_path` and `content` | Status 200 |
| 2 | Verify file was written to disk | File exists at specified path with correct content |
| 3 | Verify no `restCallTool` call was made | `restCallToolMock.calls` is empty |

**Test Data:** Local tool execution bypasses backend
**Postconditions:** Temp file cleaned up

---

### TC-105: execute_dynamic_tool routes through handleDynamic (AF-6)

| Field | Value |
|-------|-------|
| **ID** | TC-105 |
| **Priority** | Medium |
| **Type** | Functional - Alternative Flow |
| **Level** | IT |
| **Requirement** | UC-02, AF-6 |
| **Preconditions** | WrapperServer running, mock backend configured |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /mcp with `tools/call` for `execute_dynamic_tool` with `toolName: "mem_search"` | Status 200 |
| 2 | Verify `restCallTool` was called with `execute_dynamic_tool` as name | `restCallToolMock.calls[0].name` = `"execute_dynamic_tool"` |

**Test Data:** Dynamic tool proxied through backend
**Postconditions:** None

---

## 3. Functional Test Cases — Exception/Error Flows

### TC-200: SSE connection closes unexpectedly - timer cleanup (EF-1)

| Field | Value |
|-------|-------|
| **ID** | TC-200 |
| **Priority** | High |
| **Type** | Functional - Exception Flow |
| **Level** | SIT |
| **Requirement** | UC-01, EF-1, BR-9 |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open SSE connection to GET /mcp | First events received |
| 2 | Close the client-side connection (req.destroy()) | `close` event fires on server |
| 3 | Wait 20 seconds | No errors logged; keep-alive timer is cleared |
| 4 | Verify server continues to handle POST /mcp requests normally | POST requests still succeed |

**Test Data:** Port = random
**Postconditions:** Server still functional

---

### TC-201: WrapperServer internal error before headers sent (EF-2/EF-6)

| Field | Value |
|-------|-------|
| **ID** | TC-201 |
| **Priority** | Medium |
| **Type** | Functional - Exception Flow |
| **Level** | IT |
| **Requirement** | UC-01, EF-2, EF-6 |
| **Preconditions** | Create temporary server that throws in handleRequest |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | (Edge case - simulated via error injection) | If headers not yet sent, server sends HTTP 500 with error message in body |
| 2 | Verify `outputChannel.appendLine` was called with error | Error logged for debugging |

**Test Data:** Simulated handler error
**Postconditions:** Error logged, response sent

---

### TC-202: SSE keep-alive write fails silently (EF-3)

| Field | Value |
|-------|-------|
| **ID** | TC-202 |
| **Priority** | Medium |
| **Type** | Functional - Exception Flow |
| **Level** | IT |
| **Requirement** | EF-3, BR-8 |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open SSE connection | SSE stream established |
| 2 | Force-close the connection from client side | Connection severed |
| 3 | Keep-alive timer fires and tries to write to closed connection | Write fails, error is silently caught in try/catch |
| 4 | `close` event eventually fires | `clearInterval(keepAlive)` called |

**Test Data:** Port = random
**Postconditions:** No unhandled rejections, no crash

---

### TC-203: Non-GET, non-POST to /mcp returns 405 (EF-4)

| Field | Value |
|-------|-------|
| **ID** | TC-203 |
| **Priority** | High |
| **Type** | Functional - Exception Flow |
| **Level** | IT |
| **Requirement** | EF-4, BR-17 |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send HTTP PUT request to `/mcp` | Status 405 |
| 2 | Send HTTP DELETE request to `/mcp` | Status 405 |
| 3 | Send HTTP PATCH request to `/mcp` | Status 405 |
| 4 | Check response body for each | `{"error":"Method not allowed"}` |

**Test Data:** PUT, DELETE, PATCH to /mcp
**Postconditions:** None

---

### TC-204: Unknown path returns 404 (EF-5)

| Field | Value |
|-------|-------|
| **ID** | TC-204 |
| **Priority** | High |
| **Type** | Functional - Exception Flow |
| **Level** | IT |
| **Requirement** | EF-5 |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send GET request to `/unknown` | Status 404 |
| 2 | Send POST request to `/api/v1/test` | Status 404 |
| 3 | Send GET request to `/` | Status 404 |
| 4 | Check response body for each | `{"error":"Not found"}` |

**Test Data:** Various unknown paths
**Postconditions:** None

---

### TC-205: Server crash before headers sent sends 500 (EF-6 simulated)

| Field | Value |
|-------|-------|
| **ID** | TC-205 |
| **Priority** | Medium |
| **Type** | Functional - Exception Flow |
| **Level** | IT |
| **Requirement** | EF-6 |
| **Preconditions** | Server with error-prone handler (test with mocked error) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send request that causes exception before headers sent | HTTP 500 with error message in JSON body |
| 2 | Check `res.headersSent` guard prevented double-write | No crash, response correctly sent |

**Test Data:** Exception injection in handler
**Postconditions:** Server still functional for subsequent requests

---

### TC-206: SSE connection reused after server restart (EF-7)

| Field | Value |
|-------|-------|
| **ID** | TC-206 |
| **Priority** | Low |
| **Type** | Functional - Exception Flow |
| **Level** | SIT |
| **Requirement** | EF-7 |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open SSE connection | SSE stream established |
| 2 | Stop the server | SSE connection closed |
| 3 | Start a new WrapperServer instance | Server starts successfully |
| 4 | Open new SSE connection to new server | Fresh SSE stream established with correct events |
| 5 | Old SSE connection (if somehow still active) has no effect | No interference between old and new instances |

**Test Data:** Server restart cycle
**Postconditions:** New WrapperServer instance running

---

### TC-207: Invalid JSON body returns -32700 Parse error (EF-8)

| Field | Value |
|-------|-------|
| **ID** | TC-207 |
| **Priority** | High |
| **Type** | Functional - Exception Flow |
| **Level** | IT |
| **Requirement** | EF-8, FSD Error Matrix |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /mcp with body `not-valid-json{{` | Status 400 |
| 2 | Parse response body | `error.code` = `-32700`, `error.message` contains `Parse error` |
| 3 | Check `id` is `null` | `id: null` (JSON-RPC standard for parse errors) |

**Test Data:** Malformed JSON string
**Postconditions:** None

---

### TC-208: Missing Content-Type header returns -32700 (EF-9)

| Field | Value |
|-------|-------|
| **ID** | TC-208 |
| **Priority** | High |
| **Type** | Functional - Exception Flow |
| **Level** | IT |
| **Requirement** | EF-9, FSD Error Matrix |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /mcp with valid JSON body but no `Content-Type` header | Status 400 |
| 2 | POST /mcp with `Content-Type: text/plain` | Status 400 |
| 3 | POST /mcp with `Content-Type: application/xml` | Status 400 |
| 4 | Check `error.code` for each | `-32700` |
| 5 | Check `error.message` for each | `Expected application/json` |

**Test Data:** POST requests with wrong Content-Type
**Postconditions:** None

---

### TC-209: Unknown method returns -32601 Method not supported (EF-10)

| Field | Value |
|-------|-------|
| **ID** | TC-209 |
| **Priority** | High |
| **Type** | Functional - Exception Flow |
| **Level** | IT |
| **Requirement** | EF-10, BR-26 |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /mcp with method `some_future_method` | Status 200 |
| 2 | Check response body | `error.code` = `-32601`, `error.message` = `Method not supported: some_future_method` |

**Test Data:** Unknown method name
**Postconditions:** None

---

### TC-210: Internal server error returns -32603 (EF-11)

| Field | Value |
|-------|-------|
| **ID** | TC-210 |
| **Priority** | Medium |
| **Type** | Functional - Exception Flow |
| **Level** | IT |
| **Requirement** | EF-11, FSD Error Matrix |
| **Preconditions** | Server with failing `restCallTool` mock |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create server with `restCallTool` that throws `ECONNREFUSED` | Server starts |
| 2 | POST /mcp with `tools/call` for `mem_search` | Status 200 |
| 3 | Check `error.code` | `-32603` |
| 4 | Check `error.message` contains `ECONNREFUSED` | Error propagated from backend |

**Test Data:** Backend call throwing connection error
**Postconditions:** Server instance stopped

---

### TC-211: Body exceeds 1MB destroys connection (EF-12)

| Field | Value |
|-------|-------|
| **ID** | TC-211 |
| **Priority** | Medium |
| **Type** | Functional - Exception Flow |
| **Level** | SIT |
| **Requirement** | EF-12, BR-18, BR-25 |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /mcp with body of size 1,048,577 bytes (1MB + 1) | Connection is destroyed (ECONNRESET or timeout) |
| 2 | Verify no partial response is sent | Status is null or error |
| 3 | Send valid request after the oversized request | Server still responds normally |

**Test Data:** Buffer.alloc(1024 * 1024 + 1) filled with filler
**Postconditions:** Server still functional after the destroyed connection

---

## 4. Business Rule Validation

### TC-300: SSE event ordering - endpoint before message (BR-1)

| Field | Value |
|-------|-------|
| **ID** | TC-300 |
| **Priority** | High |
| **Type** | Business Rule |
| **Level** | E2E-API |
| **Requirement** | BR-1 |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open SSE connection to GET /mcp | Events streamed |
| 2 | Find index of `event: endpoint` in stream | Present at position P1 |
| 3 | Find index of `event: message` in stream | Present at position P2 |
| 4 | Assert P2 > P1 | `event: endpoint` appears BEFORE `event: message` |

**Test Data:** Raw SSE stream
**Postconditions:** Connection closed

---

### TC-301: SSE endpoint data is exactly "/mcp" (BR-2, BR-10)

| Field | Value |
|-------|-------|
| **ID** | TC-301 |
| **Priority** | High |
| **Type** | Business Rule |
| **Level** | E2E-API |
| **Requirement** | BR-2, BR-10 |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open SSE connection to GET /mcp | Events streamed |
| 2 | Find line after `event: endpoint` | `data: /mcp` |
| 3 | Verify exactly `/mcp` (no trailing slash, no query params) | String matches `/mcp` exactly |

**Test Data:** Raw SSE stream
**Postconditions:** Connection closed

---

### TC-302: SSE response Content-Type is text/event-stream (BR-3)

| Field | Value |
|-------|-------|
| **ID** | TC-302 |
| **Priority** | High |
| **Type** | Business Rule |
| **Level** | E2E-API |
| **Requirement** | BR-3, BR-28 |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open SSE connection to GET /mcp | Response received |
| 2 | Check `Content-Type` header | Contains `text/event-stream` |

**Test Data:** GET /mcp
**Postconditions:** Connection closed

---

### TC-303: Keep-alive interval is 15 seconds (BR-4)

| Field | Value |
|-------|-------|
| **ID** | TC-303 |
| **Priority** | Medium |
| **Type** | Business Rule |
| **Level** | SIT |
| **Requirement** | BR-4 |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open SSE connection | First events received |
| 2 | Record time T1 when first keep-alive received | Keep-alive received |
| 3 | Wait for second keep-alive, record time T2 | T2 - T1 is approximately 15 seconds (+/- 500ms) |
| 4 | Verify timing | Interval is close to 15000ms |

**Test Data:** SSE stream, timing measurement
**Postconditions:** Connection closed

---

### TC-304: SSE events use double \n\n terminators (BR-6)

| Field | Value |
|-------|-------|
| **ID** | TC-304 |
| **Priority** | Medium |
| **Type** | Business Rule |
| **Level** | E2E-API |
| **Requirement** | BR-6 |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open SSE connection, capture raw bytes | Raw event data |
| 2 | Examine byte sequence after `data: /mcp` | Followed by `\n\n` (blank line delimiter) |
| 3 | Examine byte sequence after `data: initialized` | Followed by `\n\n` (blank line delimiter) |

**Test Data:** Raw SSE byte stream
**Postconditions:** Connection closed

---

### TC-305: Keep-alive uses SSE comment format (BR-7)

| Field | Value |
|-------|-------|
| **ID** | TC-305 |
| **Priority** | Medium |
| **Type** | Business Rule |
| **Level** | E2E-API |
| **Requirement** | BR-7 |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open SSE connection, wait for keep-alive | `: keep-alive` comment line received |
| 2 | Verify format | Line starts with `: ` (colon + space), no `event:` or `data:` prefix |

**Test Data:** SSE stream
**Postconditions:** Connection closed

---

### TC-306: SSE write failures silently caught (BR-8)

| Field | Value |
|-------|-------|
| **ID** | TC-306 |
| **Priority** | Medium |
| **Type** | Business Rule |
| **Level** | IT |
| **Requirement** | BR-8 |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open SSE connection | Stream established |
| 2 | Client closes connection abruptly (req.destroy()) | Connection severed |
| 3 | Wait for next keep-alive timer (up to 20s) | Timer fires, write fails silently |
| 4 | Verify no unhandled promise rejection or crash | Server continues to serve POST requests normally |

**Test Data:** Abrupt connection close
**Postconditions:** Server stable

---

### TC-307: clearInterval on close event (BR-9)

| Field | Value |
|-------|-------|
| **ID** | TC-307 |
| **Priority** | High |
| **Type** | Business Rule |
| **Level** | SIT |
| **Requirement** | BR-9 |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open SSE connection | Stream established |
| 2 | Client disconnects cleanly | `close` event fires on server |
| 3 | After disconnect, verify keep-alive timer is cleared | No more data written to old connection |
| 4 | Verify no timer leak | Server memory does not grow with each SSE connection cycle |

**Test Data:** SSE connection lifecycle
**Postconditions:** Timer properly garbage-collected

---

### TC-308: Supported protocol versions include three versions (BR-11)

| Field | Value |
|-------|-------|
| **ID** | TC-308 |
| **Priority** | High |
| **Type** | Business Rule |
| **Level** | IT |
| **Requirement** | BR-11 |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /mcp with `protocolVersion: "2024-11-05"` | Returns `"2024-11-05"` |
| 2 | POST /mcp with `protocolVersion: "2025-03-26"` | Returns `"2025-03-26"` |
| 3 | POST /mcp with `protocolVersion: "2025-06-18"` | Returns `"2025-06-18"` |
| 4 | POST /mcp with `protocolVersion: "2023-01-01"` | Returns `"2025-06-18"` (newest) |

**Test Data:** All three supported versions + unknown
**Postconditions:** None

---

### TC-309: initialize returns protocolVersion, capabilities, serverInfo (BR-12)

| Field | Value |
|-------|-------|
| **ID** | TC-309 |
| **Priority** | High |
| **Type** | Business Rule |
| **Level** | IT |
| **Requirement** | BR-12 |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /mcp with initialize request | Status 200 |
| 2 | Verify `result.protocolVersion` | Non-empty string |
| 3 | Verify `result.capabilities` | Object containing `tools.listChanged` (boolean) |
| 4 | Verify `result.serverInfo` | Object containing `name` and `version` strings |

**Test Data:** Standard initialize request
**Postconditions:** None

---

### TC-310: notifications/initialized returns HTTP 202 (BR-13)

| Field | Value |
|-------|-------|
| **ID** | TC-310 |
| **Priority** | High |
| **Type** | Business Rule |
| **Level** | IT |
| **Requirement** | BR-13 |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /mcp with `notifications/initialized` | Status 202 |
| 2 | POST /mcp with `initialized` (without notifications/ prefix) | Status 202 (BR-23: both accepted) |
| 3 | Verify empty body for both | No content |

**Test Data:** Both accepted forms of initialized notification
**Postconditions:** None

---

### TC-311: ping returns empty result {} (BR-14)

| Field | Value |
|-------|-------|
| **ID** | TC-311 |
| **Priority** | High |
| **Type** | Business Rule |
| **Level** | IT |
| **Requirement** | BR-14 |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /mcp with `ping` method | Status 200 |
| 2 | Verify `result` is `{}` | Empty object |
| 3 | Verify no `error` field | Error undefined |

**Test Data:** ping request
**Postconditions:** None

---

### TC-312: tools/list returns tool array (BR-15)

| Field | Value |
|-------|-------|
| **ID** | TC-312 |
| **Priority** | High |
| **Type** | Business Rule |
| **Level** | IT |
| **Requirement** | BR-15 |
| **Preconditions** | WrapperServer running, mock backend returns tools |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /mcp with `tools/list` | Status 200 |
| 2 | Verify `result.tools` is array | `Array.isArray(result.tools)` = true |
| 3 | Verify each tool has `name`, `description`, `inputSchema` | Required fields present |

**Test Data:** Mock tools array
**Postconditions:** None

---

### TC-313: GET /mcp NOT rejected with 405 (BR-19 - CRITICAL THE FIX)

| Field | Value |
|-------|-------|
| **ID** | TC-313 |
| **Priority** | Critical |
| **Type** | Business Rule |
| **Level** | E2E-API |
| **Requirement** | BR-19, BRD Story 1 AC-1 |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send GET request to /mcp | Status 200 (NOT 405) |
| 2 | Check Content-Type header | `text/event-stream` |
| 3 | Check that SSE events are received | `event: endpoint` present in response |

**Test Data:** GET /mcp (this was returning 405 before the fix)
**Postconditions:** None

---

### TC-314: CORS headers set on every response (BR-24)

| Field | Value |
|-------|-------|
| **ID** | TC-314 |
| **Priority** | Medium |
| **Type** | Business Rule |
| **Level** | IT |
| **Requirement** | BR-24 |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send GET to /mcp | CORS headers present: `Access-Control-Allow-Origin: *` |
| 2 | Send POST to /mcp (valid) | CORS headers present |
| 3 | Send GET to /unknown (404) | CORS headers present |
| 4 | Send OPTIONS to /mcp (204) | CORS headers present |
| 5 | Send POST with invalid JSON (400) | CORS headers present |

**Test Data:** Multiple endpoints and methods
**Postconditions:** None

---

### TC-315: Body size streaming with per-chunk limit (BR-25)

| Field | Value |
|-------|-------|
| **ID** | TC-315 |
| **Priority** | Medium |
| **Type** | Business Rule |
| **Level** | IT |
| **Requirement** | BR-25 |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /mcp with body size 1,048,576 (exactly 1MB) | Normal response (200 or error based on content) |
| 2 | POST /mcp with body size 1,048,577 (1MB + 1 byte) | Connection destroyed |
| 3 | Verify no partial response sent for oversized body | Error or timeout |

**Test Data:** Boundary values for body size
**Postconditions:** Server still functional

---

## 5. Boundary & Negative Testing

### TC-400: POST non-application/json Content-Type

| Field | Value |
|-------|-------|
| **ID** | TC-400 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Level** | IT |
| **Requirement** | FSD Data Spec, EF-9 |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /mcp with `Content-Type: text/plain`, valid JSON body | Status 400 |
| 2 | POST /mcp with `Content-Type: application/x-www-form-urlencoded` | Status 400 |
| 3 | POST /mcp with no Content-Type header | Status 400 |
| 4 | Check error code for each | `-32700` |
| 5 | Check error message | `Expected application/json` |

**Test Data:** Various non-JSON Content-Type values
**Postconditions:** None

---

### TC-401: Invalid JSON body formats

| Field | Value |
|-------|-------|
| **ID** | TC-401 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Level** | IT |
| **Requirement** | EF-8 |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /mcp with `not-json` | Status 400, `-32700 Parse error` |
| 2 | POST /mcp with `{"unclosed` | Status 400, `-32700 Parse error` |
| 3 | POST /mcp with `[array]` (valid JSON but not JSON-RPC) | Method not found `-32601` or parse error |
| 4 | POST /mcp with empty string `""` | Status 400, `-32700 Parse error` |

**Test Data:** Various malformed JSON bodies
**Postconditions:** None

---

### TC-402: Empty body

| Field | Value |
|-------|-------|
| **ID** | TC-402 |
| **Priority** | Low |
| **Type** | Boundary / Negative |
| **Level** | IT |
| **Requirement** | FSD Data Spec |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /mcp with empty body and valid Content-Type | Status 400, `-32700 Parse error` |
| 2 | Verify no crash | Server continues to serve |

**Test Data:** Empty request body
**Postconditions:** None

---

### TC-403: Body size boundary - exactly 1MB

| Field | Value |
|-------|-------|
| **ID** | TC-403 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Level** | SIT |
| **Requirement** | BR-25, EF-12 |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Construct JSON body of exactly 1,048,576 bytes (valid JSON wrapping large string) | Body constructed |
| 2 | POST /mcp with this body | Either processed (if valid JSON-RPC) or parse error, but NOT connection destroyed |
| 3 | Construct body of 1,048,577 bytes | Connection destroyed |

**Test Data:** 1MB boundary values
**Postconditions:** None

---

### TC-404: Null/missing method in JSON-RPC

| Field | Value |
|-------|-------|
| **ID** | TC-404 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Level** | IT |
| **Requirement** | FSD Error Matrix |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /mcp with `{"jsonrpc":"2.0","id":1}` (no method) | Status 200, `-32601 Method not supported: undefined` |
| 2 | POST /mcp with `{"jsonrpc":"2.0","id":1,"method":""}` (empty method) | Status 200, `-32601 Method not supported: ` |

**Test Data:** Missing or empty method
**Postconditions:** None

---

### TC-405: Client sends initialized (without notifications/ prefix)

| Field | Value |
|-------|-------|
| **ID** | TC-405 |
| **Priority** | Low |
| **Type** | Boundary / Negative |
| **Level** | IT |
| **Requirement** | BR-23 |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /mcp with `{"jsonrpc":"2.0","method":"initialized"}` | Status 202 (defensive acceptance per BR-23) |

**Test Data:** Alternative format for initialized notification
**Postconditions:** None

---

## 6. Non-Functional Testing

### TC-600: SSE handshake latency (< 50ms)

| Field | Value |
|-------|-------|
| **ID** | TC-600 |
| **Priority** | Low |
| **Type** | Non-Functional - Performance |
| **Level** | IT |
| **Requirement** | FSD 8.1 NFR |
| **Preconditions** | WrapperServer running, localhost |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open SSE connection, measure time from request to first event | < 50ms on localhost |

**Test Data:** GET /mcp
**Postconditions:** None

---

### TC-601: Initialize response time (< 100ms)

| Field | Value |
|-------|-------|
| **ID** | TC-601 |
| **Priority** | Low |
| **Type** | Non-Functional - Performance |
| **Level** | IT |
| **Requirement** | FSD 8.1 NFR |
| **Preconditions** | WrapperServer running, mocked backend |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send initialize request, measure round-trip time | < 100ms on localhost with mocked deps |

**Test Data:** Standard initialize request
**Postconditions:** None

---

### TC-602: Concurrent SSE connections - 10 simultaneous

| Field | Value |
|-------|-------|
| **ID** | TC-602 |
| **Priority** | Low |
| **Type** | Non-Functional - Scalability |
| **Level** | SIT |
| **Requirement** | FSD 8.1, FSD 8.3 |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open 10 simultaneous SSE connections | All 10 connections receive `event: endpoint` and `event: message` |
| 2 | While 10 SSE connections are open, send POST /mcp initialize | All POST requests succeed with no degradation |
| 3 | Close all connections | All timers properly cleaned up |

**Test Data:** 10 concurrent GET /mcp connections
**Postconditions:** All connections closed

---

### TC-603: SSE keep-alive jitter within +/- 500ms

| Field | Value |
|-------|-------|
| **ID** | TC-603 |
| **Priority** | Low |
| **Type** | Non-Functional - Performance |
| **Level** | SIT |
| **Requirement** | FSD 8.1 NFR |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open SSE connection | Stream established |
| 2 | Measure time between first 3 keep-alive intervals | Each interval is 15000ms +/- 500ms |
| 3 | Record actual intervals | Within acceptable jitter range |

**Test Data:** SSE stream timing measurement
**Postconditions:** Connection closed

---

## 7. Integration Testing

### TC-700: OPTIONS preflight on all paths (TC-15 mapped)

| Field | Value |
|-------|-------|
| **ID** | TC-700 |
| **Priority** | Medium |
| **Type** | Integration |
| **Level** | IT |
| **Requirement** | BR-24 |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | OPTIONS /mcp | 204 with CORS headers |
| 2 | OPTIONS /health | 204 with CORS headers |
| 3 | OPTIONS /unknown-path | 204 with CORS headers |

**Test Data:** OPTIONS to multiple paths
**Postconditions:** None

---

### TC-701: Server error logged to outputChannel (TC-16 mapped)

| Field | Value |
|-------|-------|
| **ID** | TC-701 |
| **Priority** | Low |
| **Type** | Integration |
| **Level** | IT |
| **Requirement** | FSD 9.4 |
| **Preconditions** | WrapperServer with mock outputChannel |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Create server with backend that throws error | Server starts |
| 2 | Trigger error (e.g., tools/call with failing backend) | Error caught |
| 3 | Verify `outputChannel.appendLine` was called | `appendLine` called with `[WrapperServer] Error: ...` |

**Test Data:** Failing backend
**Postconditions:** Server stopped

---

### TC-702: Multiple SSE connections receive independent streams (TC-17 mapped)

| Field | Value |
|-------|-------|
| **ID** | TC-702 |
| **Priority** | Low |
| **Type** | Integration |
| **Level** | SIT |
| **Requirement** | FSD 3.1.5 |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open SSE connection A | Stream established |
| 2 | Open SSE connection B | Stream established |
| 3 | Verify both receive `event: endpoint` and `event: message` | Both streams complete |
| 4 | Close connection A | Connection B still active, receiving keep-alives |
| 5 | Close connection B | All timers cleared |

**Test Data:** Two concurrent GET /mcp
**Postconditions:** All connections closed

---

### TC-703: SSE connection cleanup on close (TC-18 mapped)

| Field | Value |
|-------|-------|
| **ID** | TC-703 |
| **Priority** | Medium |
| **Type** | Integration |
| **Level** | IT |
| **Requirement** | BR-9 |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open SSE connection | Stream established |
| 2 | Close connection from client side | `close` event fires |
| 3 | `clearInterval` is called | No timer leak |
| 4 | Check no further keep-alive writes to closed connection | No errors logged |

**Test Data:** Client disconnect
**Postconditions:** Clean connection lifecycle

---

## 8. Regression Testing

### TC-800: REG-01 - initialize is implemented (no -32601)

| Field | Value |
|-------|-------|
| **ID** | TC-800 |
| **Priority | High |
| **Type** | Regression / E2E-API |
| **Level** | E2E-API |
| **Requirement** | REG-01, BR-27, BRD Story 2 AC-1 |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /mcp with initialize request | Status 200 |
| 2 | Verify `error` is undefined | No error in response |
| 3 | Verify `result` is defined | Result present |
| 4 | Verify `error.code` is NOT -32601 | Critical: initialize must not return "Method not supported" |
| 5 | If error present, verify message does NOT contain "Method not supported: initialize" | Exact failure mode guarded |

**Test Data:** Standard initialize request
**Postconditions:** None
**Existing Test:** `mcp-handshake.regression.test.ts` REG-01

---

### TC-801: REG-02 - initialize returns protocolVersion, capabilities, serverInfo

| Field | Value |
|-------|-------|
| **ID** | TC-801 |
| **Priority** | High |
| **Type** | Regression / E2E-API |
| **Level** | E2E-API |
| **Requirement** | REG-02, BRD Story 2 AC-2 |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /mcp with initialize, `protocolVersion: "2024-11-05"` | Status 200 |
| 2 | Verify `result.protocolVersion` | `"2024-11-05"` |
| 3 | Verify `result.capabilities` defined | Non-null object |
| 4 | Verify `result.serverInfo` defined | Non-null object |
| 5 | Verify `result.serverInfo.name` | `"sdlc-agents-4-enterprise"` |

**Test Data:** Initialize with version "2024-11-05"
**Postconditions:** None
**Existing Test:** `mcp-handshake.regression.test.ts` REG-02

---

### TC-802: REG-03 - Full handshake flow works end-to-end

| Field | Value |
|-------|-------|
| **ID** | TC-802 |
| **Priority** | High |
| **Type** | Regression / E2E-API |
| **Level** | E2E-API |
| **Requirement** | REG-03, BRD Story 2 AC-3 |
| **Preconditions** | WrapperServer running, mock backend returns tools |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /mcp with initialize | `result` defined |
| 2 | POST /mcp with `notifications/initialized` | Status 202 |
| 3 | POST /mcp with `tools/list` | Status 200, `result.tools` is array (non-empty) |

**Test Data:** Full lifecycle: initialize -> initialized -> tools/list
**Postconditions:** None
**Existing Test:** `mcp-handshake.regression.test.ts` REG-03

---

### TC-803: REG-04 - ping responds with empty result

| Field | Value |
|-------|-------|
| **ID** | TC-803 |
| **Priority** | High |
| **Type** | Regression / E2E-API |
| **Level** | E2E-API |
| **Requirement** | REG-04, BRD Story 2 AC-4 |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /mcp with `ping` method | Status 200 |
| 2 | Verify `error` is undefined | No error |
| 3 | Verify `result` equals `{}` | Empty result |

**Test Data:** Ping request
**Postconditions:** None
**Existing Test:** `mcp-handshake.regression.test.ts` REG-04

---

### TC-804: REG-05 - GET /mcp opens SSE stream

| Field | Value |
|-------|-------|
| **ID** | TC-804 |
| **Priority** | High |
| **Type** | Regression / E2E-API |
| **Level** | E2E-API |
| **Requirement** | REG-05, BRD Story 2 AC-5 |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | GET /mcp | Status 200 |
| 2 | Check `Content-Type` header | Contains `text/event-stream` |
| 3 | Read SSE chunk data | Contains `event: message` |

**Test Data:** GET /mcp
**Postconditions:** Connection closed
**Existing Test:** `mcp-handshake.regression.test.ts` REG-05

---

### TC-805: REG-06 - No required method returns -32601

| Field | Value |
|-------|-------|
| **ID** | TC-805 |
| **Priority** | High |
| **Type** | Regression / E2E-API |
| **Level** | E2E-API |
| **Requirement** | REG-06, BRD Story 2 AC-6, BR-26 |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /mcp with `initialize` | `error.code` NOT `-32601` |
| 2 | POST /mcp with `ping` | `error.code` NOT `-32601` |
| 3 | POST /mcp with `tools/list` | `error.code` NOT `-32601` |
| 4 | POST /mcp with `tools/call` | `error.code` NOT `-32601` |

**Test Data:** All required MCP methods
**Postconditions:** None
**Existing Test:** `mcp-handshake.regression.test.ts` REG-06

---

### TC-806: REG-07 - Unknown method still returns -32601

| Field | Value |
|-------|-------|
| **ID** | TC-806 |
| **Priority** | High |
| **Type** | Regression / E2E-API |
| **Level** | E2E-API |
| **Requirement** | REG-07, BRD Story 2 AC-7 |
| **Preconditions** | WrapperServer running |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | POST /mcp with method `some_future_method` | Status 200 |
| 2 | Verify `error.code` | `-32601` |
| 3 | Verify `error.message` | `Method not supported: some_future_method` |

**Test Data:** Unknown method name
**Postconditions:** None
**Existing Test:** `mcp-handshake.regression.test.ts` REG-07

---

## 9. Requirements Traceability Matrix (RTM)

### Use Cases

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| UC-01 - SSE Handshake | FSD 3.1.2 | TC-001, TC-002, TC-010, TC-011, TC-200, TC-202, TC-300, TC-301, TC-302, TC-303, TC-304, TC-305, TC-307, TC-313, TC-600, TC-603, TC-700, TC-702, TC-703, TC-804 | Covered |
| UC-02 - JSON-RPC POST | FSD 3.2.2 | TC-003, TC-004, TC-005, TC-006, TC-007, TC-008, TC-009, TC-012, TC-100, TC-101, TC-102, TC-103, TC-104, TC-105, TC-207, TC-208, TC-209, TC-210, TC-211, TC-308, TC-309, TC-310, TC-311, TC-312, TC-315, TC-400, TC-401, TC-402, TC-403, TC-404, TC-405, TC-601, TC-800, TC-801, TC-802, TC-803, TC-805, TC-806 | Covered |
| UC-03 - Regression Tests | FSD 3.3.2 | TC-800, TC-801, TC-802, TC-803, TC-804, TC-805, TC-806 | Covered |

### Business Rules

| Rule ID | Rule Summary | Source | Test Cases | Coverage |
|---------|-------------|--------|------------|----------|
| BR-1 | endpoint before message | FSD 3.1.3 | TC-002, TC-300 | Covered |
| BR-2 | endpoint data = /mcp | FSD 3.1.3 | TC-002, TC-301 | Covered |
| BR-3 | Content-Type: text/event-stream | FSD 3.1.3 | TC-001, TC-302 | Covered |
| BR-4 | Keep-alive 15s interval | FSD 3.1.3 | TC-010, TC-303 | Covered |
| BR-5 | SSE non-blocking | FSD 3.1.3 | TC-602 | Covered |
| BR-6 | Double \n\n terminator | FSD 3.1.3 | TC-304 | Covered |
| BR-7 | Keep-alive comment format | FSD 3.1.3 | TC-010, TC-305 | Covered |
| BR-8 | Write failures silently caught | FSD 3.1.3 | TC-202, TC-306 | Covered |
| BR-9 | clearInterval on close | FSD 3.1.3 | TC-011, TC-200, TC-307, TC-703 | Covered |
| BR-10 | endpoint data exactly "/mcp" | FSD 3.1.3 | TC-002, TC-301 | Covered |
| BR-11 | Protocol versions [2025-06-18, 2025-03-26, 2024-11-05] | FSD 3.2.3 | TC-008, TC-308 | Covered |
| BR-12 | initialize returns protocolVersion, capabilities, serverInfo | FSD 3.2.3 | TC-003, TC-309, TC-801 | Covered |
| BR-13 | notifications/initialized -> 202 | FSD 3.2.3 | TC-006, TC-310 | Covered |
| BR-14 | ping returns {} | FSD 3.2.3 | TC-005, TC-311, TC-803 | Covered |
| BR-15 | tools/list returns tool array | FSD 3.2.3 | TC-007, TC-312 | Covered |
| BR-16 | tools/call routing | FSD 3.2.3 | TC-012, TC-104, TC-105 | Covered |
| BR-17 | Non-POST to /mcp -> 405 | FSD 3.2.3 | TC-203 | Covered |
| BR-18 | Body size limit 1MB | FSD 3.2.3 | TC-211, TC-315, TC-403 | Covered |
| BR-19 | GET /mcp NOT rejected | FSD 3.2.3 | TC-001, TC-313 | Covered |
| BR-20 | Protocol negotiation algorithm | FSD 3.2.3 | TC-008, TC-009, TC-101, TC-102, TC-308 | Covered |
| BR-21 | Request ID auto-increment | FSD 3.2.3 | TC-801 (implied via unique IDs) | Covered |
| BR-22 | Error response status rules | FSD 3.2.3 | TC-207, TC-208, TC-209, TC-210 | Covered |
| BR-23 | Both initialized forms accepted | FSD 3.2.3 | TC-103, TC-310, TC-405 | Covered |
| BR-24 | CORS headers on every response | FSD 3.2.3 | TC-013, TC-314, TC-700 | Covered |
| BR-25 | Body streaming with per-chunk limit | FSD 3.2.3 | TC-211, TC-315, TC-403 | Covered |
| BR-26 | Required MCP methods | FSD 3.3.3 | TC-805, TC-806 | Covered |
| BR-27 | initialize NOT return -32601 | FSD 3.3.3 | TC-800, TC-805 | Covered |
| BR-28 | GET /mcp Content-Type: text/event-stream | FSD 3.3.3 | TC-001, TC-302, TC-804 | Covered |

### BRD Acceptance Criteria

| Story | AC ID | Description | Test Cases | Coverage |
|-------|-------|-------------|------------|----------|
| Story 1 | AC-1 | GET /mcp returns 200, not 405 | TC-001, TC-313, TC-804 | Covered |
| Story 1 | AC-2 | SSE stream contains event: endpoint | TC-002, TC-300 | Covered |
| Story 1 | AC-3 | SSE stream contains event: message with initialized | TC-002, TC-300 | Covered |
| Story 1 | AC-4 | POST /mcp returns 200 for initialize | TC-003, TC-800, TC-801 | Covered |
| Story 1 | AC-5 | POST /mcp returns 202 for notifications/initialized | TC-006, TC-310 | Covered |
| Story 1 | AC-6 | POST /mcp returns 200 for tools/list | TC-007, TC-312 | Covered |
| Story 1 | AC-7 | POST /mcp returns 200 for ping with {} | TC-005, TC-311, TC-803 | Covered |
| Story 1 | AC-8 | All unit tests pass (>= 545 tests) | TC-covered by vitest run | Covered |
| Story 2 | AC-1 | All 7 regression tests pass | TC-800 to TC-806 | Covered |
| Story 2 | AC-2 | Tests guard against -32601 initialize | TC-800, TC-805 | Covered |
| Story 2 | AC-3 | Tests are independent | TC-800 to TC-806 (each has own server instance) | Covered |

### Coverage Summary

| Category | Total | Covered | Coverage % |
|----------|-------|---------|------------|
| Use Cases (UC) | 3 | 3 | 100% |
| Business Rules (BR) | 28 | 28 | 100% |
| Acceptance Criteria | 13 | 13 | 100% |
| Error Flows (EF) | 12 | 12 | 100% |
| Alternative Flows (AF) | 6 | 6 | 100% |
| **Overall** | **62** | **62** | **100%** |

---

## 10. Appendix

### Test Data Setup Scripts

No external test data setup scripts needed. All test data is generated inline or from `wrapper-server.helpers.ts`:

- `createTestServer()` - Creates WrapperServer with mocked dependencies
- `postMcp(port, body)` - Sends JSON-RPC POST to /mcp
- `postRaw(port, data)` - Sends raw buffer (for oversized body test)
- `openSse(port, timeoutMs?)` - Opens SSE stream, resolves on first event

### Existing Test Infrastructure

| File | Type | Tests | Status (2026-07-20) |
|------|------|-------|---------------------|
| `extension/src/__tests__/mcp-handshake.regression.test.ts` | Regression (E2E-API) | 7 (REG-01 to REG-07) | ALL PASS |
| `extension/src/__tests__/wrapper-server.test.ts` | Integration + E2E-API | 15 (TC-22 to TC-36) | ALL PASS |

### Test Execution Results (2026-07-20)

| Test Suite | Tests | Passed | Failed | Duration |
|------------|-------|--------|--------|----------|
| MCP Handshake Regression (SA4E-48) | 7 | 7 | 0 | 1.07s |
| WrapperServer IT + E2E-API | 15 | 15 | 0 | 1.35s |
| **Total** | **22** | **22** | **0** | **2.42s** |

### Environment Configuration

| Setting | Value |
|---------|-------|
| Node.js Version | 20.x |
| Test Framework | Vitest v4.1.8 |
| Working Directory | `extension/` |
| Port Range | Random (port 0) via OS assignment |
| Test Isolation | Each `describe` block gets its own server instance |
| Dependencies | Node.js built-in `http` module only (no external HTTP test libraries) |
