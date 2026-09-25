# Test Cases — SA4E-257: Wire DB-backed MCP server config to McpClientManager

## Document Information

| Field | Value |
|-------|-------|
| **Ticket** | SA4E-257 |
| **Title** | Wire DB-backed MCP server config (mcp_servers) to McpClientManager so configured servers actually connect |
| **Version** | 1.0 |
| **Date** | 2026-09-09 |
| **Status** | In Progress |

---

## Test Case Numbering Scheme

| Range | Level | Description |
|-------|-------|-------------|
| TC-001 to TC-003 | PBT | Property-Based Tests |
| UT-001 to UT-008 | UT | Unit Tests |
| IT-001 to IT-005 | IT | Integration Tests |
| E2E-API-01 to E2E-API-06 | E2E-API | API End-to-End Tests |
| E2E-UI-01 to E2E-UI-08 | E2E-UI | UI End-to-End Tests |
| SIT-01 to SIT-06 | SIT | Manual System Integration Tests |

---

## Section 1: Property-Based Tests (PBT)

### TC-001: Transport Type Normalization Property

| Field | Value |
|-------|-------|
| **ID** | TC-001 / PBT-01 |
| **Priority** | High |
| **Type** | Property-Based Test |
| **Requirement** | FSD §5 Criterion 5; TDD §2.6 |
| **Preconditions** | McpClientManager.normalizeTransportType() is defined |
| **Test Data** | Input types: `stdio`, `sse`, `streamable-http`, `sse` |
| **Steps:** | |
| 1 | Call `McpClientManager.normalizeTransportType('stdio')` | Expected: returns `'stdio'` |
| 2 | Call `McpClientManager.normalizeTransportType('sse')` | Expected: returns `'sse'` |
| 3 | Call `McpClientManager.normalizeTransportType('streamable-http')` | Expected: returns `'httpStream'` |
| **Expected Result:** | All three return correct normalized types; `streamable-http` → `httpStream` |

### TC-002: Server Config Property Validation

| Field | Value |
|-------|-------|
| **ID** | TC-002 / PBT-02 |
| **Priority** | High |
| **Type** | Property-Based Test |
| **Requirement** | FSD §5 Criterion 1,2; BRD §2.2 |
| **Preconditions** | ServerConfig interface is defined |
| **Test Data** | Valid and invalid server configs with random properties |
| **Steps:** | |
| 1 | Verify ServerConfig has all required fields: id, name, transport_type, config, disabled | Expected: structure validation passes |
| 2 | Verify transport_type is one of: stdio, sse, streamable-http | Expected: enum validation |
| 3 | Verify disabled is boolean (0 or 1) | Expected: boolean validation |
| **Expected Result:** | Invalid configs rejected; valid configs accepted |

### TC-003: Connection State Property

| Field | Value |
|-------|-------|
| **ID** | TC-003 / PBT-03 |
| **Priority** | Medium |
| **Type** | Property-Based Test |
| **Requirement** | FSD §5 Criterion 3; BRD §2.1 |
| **Preconditions** | McpClientManager.isServerAvailable() exists |
| **Test Data** | Server IDs from DB test data |
| **Steps:** | |
| 1 | Verify isServerConnected(id) returns boolean | Expected: true or false |
| 2 | Verify getServerToolCount(id) returns number | Expected: non-negative integer |
| **Expected Result:** | Returns correct types; connection state consistent |

---

## Section 2: Unit Tests (UT)

### UT-001: McpClientManager.connectServer() — Happy Path

| Field | Value |
|-------|-------|
| **ID** | UT-001 |
| **Priority** | High |
| **Type** | Functional — Unit |
| **Requirement** | FSD §5 Criterion 2; BRD §STORY 2 |
| **Preconditions** | McpClientManager instantiated, valid ServerConfig |
| **Test Data** | `ServerConfig { id: 1, name: 'test-server', transport_type: 'httpStream', config: { url: 'http://test:9000' }, disabled: false }` |
| **Steps:** | |
| 1 | Call `mcpManager.connectServer(config)` | Expected: returns ServerStatus with connected=true |
| **Expected Result:** | Connection established; server status becomes Connected |

### UT-002: McpClientManager.connectServer() — Invalid Config

| Field | Value |
|-------|-------|
| **ID** | UT-002 |
| **Priority** | High |
| **Type** | Functional — Unit |
| **Requirement** | FSD §5 Criterion 2; FSD §2.6 Validation Rules |
| **Preconditions** | McpClientManager instantiated, invalid ServerConfig (missing required field) |
| **Test Data** | `ServerConfig { name: 'test' }` — missing id, transport_type, config, disabled |
| **Steps:** | |
| 1 | Call `mcpManager.connectServer(config)` with incomplete config | Expected: throws error or returns ServerStatus with connected=false |
| **Expected Result:** | Validation error; connection not established |

### UT-003: McpClientManager.disconnectServer() — Success

| Field | Value |
|-------|-------|
| **ID** | UT-003 |
| **Priority** | High |
| **Type** | Functional — Unit |
| **Requirement** | FSD §5 Criterion 2; BRD §STORY 2 |
| **Preconditions** | McpClientManager instantiated, server ID 1 exists and is connected |
| **Test Data** | Server ID: 1 |
| **Steps:** | |
| 1 | Call `mcpManager.disconnectServer(1)` | Expected: returns Promise<void> |
| **Expected Result:** | Server disconnected; isServerConnected(1) returns false |

### UT-004: McpClientManager.disconnectServer() — Not Connected

| Field | Value |
|-------|-------|
| **ID** | UT-004 |
| **Priority** | Medium |
| **Type** | Functional — Unit |
| **Requirement** | FSD §5 Criterion 2; Error Handling |
| **Preconditions** | McpClientManager instantiated, server ID 1 exists but is not connected |
| **Test Data** | Server ID: 1, status: Disconnected |
| **Steps:** | |
| 1 | Call `mcpManager.disconnectServer(1)` | Expected: returns Promise<void> without error |
| **Expected Result:** | Graceful return; no error thrown |

### UT-005: McpClientManager.reconnectServer() — Config Change

| Field | Value |
|-------|-------|
| **ID** | UT-005 |
| **Priority** | High |
| **Type** | Functional — Unit |
| **Requirement** | FSD §5 Criterion 2; BRD §STORY 2 |
| **Preconditions** | McpClientManager instantiated, server ID 1 exists with different config |
| **Test Data** | Server ID: 1, new transport_type: 'sse', new config: { url: 'http://new:8080/sse' } |
| **Steps:** | |
| 1 | Call `mcpManager.reconnectServer(1)` with new config | Expected: returns ServerStatus with connected=true |
| **Expected Result:** | Server reconnected with new config; tools count updated |

### UT-006: McpClientManager.reconnectServer() — No Change

| Field | Value |
|-------|-------|
| **ID** | UT-006 |
| **Priority** | Medium |
| **Type** | Functional — Unit |
| **Requirement** | FSD §5 Criterion 2; BRD §STORY 2 |
| **Preconditions** | McpClientManager instantiated, server ID 1 config unchanged |
| **Test Data** | Server ID: 1, same config as current |
| **Steps:** | |
| 1 | Call `mcpManager.reconnectServer(1)` with identical config | Expected: returns ServerStatus |
| **Expected Result:** | No unnecessary reconnect; returns current status |

### UT-007: McpClientManager.loadFromDB() — Startup Load

| Field | Value |
|-------|-------|
| **ID** | UT-007 |
| **Priority** | High |
| **Type** | Functional — Unit |
| **Requirement** | FSD §5 Criterion 1; TDD §2.5 Story 1 |
| **Preconditions** | McpClientManager instantiated, DB has 3 enabled servers (disabled=0) and 1 disabled server |
| **Test Data** | DB rows: [{id:1, name:'srv1', transport_type:'httpStream', disabled:0}, {id:2, name:'srv2', transport_type:'stdio', disabled:0}, {id:3, name:'srv3', transport_type:'sse', disabled:0}, {id:4, name:'srv4', transport_type:'streamable-http', disabled:1}] |
| **Steps:** | |
| 1 | Call `mcpManager.loadFromDB()` | Expected: connectServer called for rows where disabled=0 |
| **Expected Result:** | 3 connectServer calls (for IDs 1,2,3); 0 calls for ID 4 (disabled=1) |

### UT-008: McpClientManager.normalizeTransportType()

| Field | Value |
|-------|-------|
| **ID** | UT-008 |
| **Priority** | High |
| **Type** | Functional — Unit |
| **Requirement** | FSD §5 Criterion 5; TDD §2.2.3; TDD §2.6 |
| **Preconditions** | McpClientManager instantiated |
| **Test Data** | Input types: 'stdio', 'sse', 'streamable-http', 'httpStream' |
| **Steps:** | |
| 1 | Call `mcpManager.normalizeTransportType('stdio')` | Expected: returns 'stdio' |
| 2 | Call `mcpManager.normalizeTransportType('sse')` | Expected: returns 'sse' |
| 3 | Call `mcpManager.normalizeTransportType('streamable-http')` | Expected: returns 'httpStream' |
| 4 | Call `mcpManager.normalizeTransportType('httpStream')` | Expected: returns 'httpStream' |
| **Expected Result:** | All types normalized correctly; streamable-http → httpStream |

---

## Section 3: Integration Tests (IT)

### IT-001: Startup — All Enabled DB Servers Connect

| Field | Value |
|-------|-------|
| **ID** | IT-001 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | FSD §5 Criterion 1; BRD §STORY 1; TDD §5.2 |
| **Preconditions** | Server running, DB seeded with enabled servers (disabled=0) |
| **Test Data** | mcp_servers: [{id:1, name:'test-srv', transport_type:'httpStream', config: {url:'http://test:9000'}, disabled:0}] |
| **Steps:** | |
| 1 | Start application with DB seeded | Expected: McpClientManager.loadFromDB() called |
| 2 | Verify all enabled servers show Connected status | Expected: isServerConnected(id) returns true for all enabled servers |
| 3 | Check UI displays correct tool counts | Expected: getServerToolCount(id) returns actual count |
| **Expected Result:** | All enabled servers connected; UI reflects live state |

### IT-002: POST Create Server → Connect

| Field | Value |
|-------|-------|
| **ID** | IT-002 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | FSD §5 Criterion 2; FSD §2.2.2; BRD §STORY 2 |
| **Preconditions** | Server running, auth token valid, DB seeded |
| **Test Data** | POST body: `{ "name": "new-test-server", "transport_type": "httpStream", "config": { "url": "http://new:9000" }, "disabled": 0 }` |
| **Steps:** | |
| 1 | POST /api/sa4e-215/mcp/servers with valid body | Expected: 201 Created |
| 2 | Verify server appears in GET list | Expected: server name in response |
| 3 | Verify server shows Connected status | Expected: isServerConnected(id) returns true |
| **Expected Result:** | Server created + immediately connected; UI reflects status |

### IT-003: PUT Update Server → Reconnect

| Field | Value |
|-------|-------|
| **ID** | IT-003 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | FSD §5 Criterion 2; FSD §2.2.3; BRD §STORY 2 |
| **Preconditions** | Server running, server ID 1 exists with transport_type: httpStream |
| **Test Data** | PUT body: `{ "transport_type": "sse", "config": { "url": "http://updated:8080/sse" } }` |
| **Steps:** | |
| 1 | PUT /api/sa4e-215/mcp/servers/1 with new transport_type | Expected: 200 OK |
| 2 | Verify server reconnects with new transport | Expected: isServerConnected(1) returns true |
| 3 | Verify tool count updates | Expected: getServerToolCount(1) returns new count |
| **Expected Result:** | Config change triggers reconnect without restart |

### IT-004: DELETE Server → Disconnect + Remove

| Field | Value |
|-------|-------|
| **ID** | IT-004 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | FSD §5 Criterion 2; FSD §2.2.4; BRD §STORY 2 |
| **Preconditions** | Server running, server ID 1 exists and is Connected |
| **Test Data** | Server ID: 1 |
| **Steps:** | |
| 1 | DELETE /api/sa4e-215/mcp/servers/1 | Expected: 204 No Content |
| 2 | Verify server removed from GET list | Expected: not in response array |
| 3 | Verify server shows Disconnected | Expected: isServerConnected(1) returns false |
| **Expected Result:** | Server disconnected and removed from DB |

### IT-005: Startup Load Performance

| Field | Value |
|-------|-------|
| **ID** | IT-005 |
| **Priority** | Medium |
| **Type** | Integration |
| **Requirement** | FSD §2.7 Non-Functional; FSD §2.7 |
| **Preconditions** | Server starting with 10+ enabled DB servers |
| **Test Data** | mcp_servers: 10 rows with disabled=0 |
| **Steps:** | |
| 1 | Start application | Expected: startup completes within 2 seconds |
| 2 | Verify all servers connect | Expected: all enabled servers show Connected within 2s |
| **Expected Result:** | Startup ≤ 2s for all enabled servers |

---

## Section 4: E2E-API Tests

### E2E-API-01: List Servers with Enabled Filter

| Field | Value |
|-------|-------|
| **ID** | E2E-API-01 |
| **Priority** | High |
| **Type** | Automated (vitest + fetch) |
| **Requirement** | FSD §2.2.1; FSD §2.3 Data Models |
| **Preconditions** | Server running, auth token, DB seeded |
| **Test Data** | None (query parameter) |
| **Steps:** | |
| 1 | GET /api/sa4e-215/mcp/servers?enabled=true | Expected: 200 + array of enabled servers |
| **Expected Result:** | Returns only enabled servers (disabled=0) |

### E2E-API-02: Create Server with streamable-http

| Field | Value |
|-------|-------|
| **ID** | E2E-API-02 |
| **Priority** | High |
| **Type** | Automated (vitest + fetch) |
| **Requirement** | FSD §5 Criterion 2,5; FSD §2.2.2; BRD §STORY 4 |
| **Preconditions** | Server running, auth token |
| **Test Data** | POST body: `{ "name": "e2e-stream-server", "transport_type": "streamable-http", "config": { "url": "http://e2e-stream:9000" }, "disabled": 0 }` |
| **Steps:** | |
| 1 | POST /api/sa4e-215/mcp/servers with streamable-http type | Expected: 201 Created |
| 2 | Verify server connects successfully | Expected: isServerConnected(id) returns true |
| 3 | Verify transport normalized to httpStream | Expected: server connects with httpStream transport |
| **Expected Result:** | streamable-http mapped to httpStream; server connects |

### E2E-API-03: Create Server — Validation Error

| Field | Value |
|-------|-------|
| **ID** | E2E-API-03 |
| **Priority** | Medium |
| **Type** | Automated (vitest + fetch) |
| **Requirement** | FSD §2.6 Validation Rules |
| **Preconditions** | Server running, auth token |
| **Test Data** | POST body: `{ "name": "", "transport_type": "invalid", "config": {}, "disabled": 2 }` |
| **Steps:** | |
| 1 | POST /api/sa4e-215/mcp/servers with invalid data | Expected: 400 Bad Request |
| **Expected Result:** | Validation errors returned; server not created |

### E2E-API-04: Update Server Config

| Field | Value |
|-------|-------|
| **ID** | E2E-API-04 |
| **Priority** | High |
| **Type** | Automated (vitest + fetch) |
| **Requirement** | FSD §5 Criterion 2; FSD §2.2.3 |
| **Preconditions** | Server running, server ID 1 exists, auth token |
| **Test Data** | PUT body: `{ "config": { "url": "http://updated:9000" } }` |
| **Steps:** | |
| 1 | PUT /api/sa4e-215/mcp/servers/1 with new config | Expected: 200 OK |
| 2 | Verify server reconnects | Expected: isServerConnected(1) returns true |
| **Expected Result:** | Config change triggers reconnect |

### E2E-API-05: Delete Server

| Field | Value |
|-------|-------|
| **ID** | E2E-API-05 |
| **Priority** | High |
| **Type** | Automated (vitest + fetch) |
| **Requirement** | FSD §5 Criterion 2; FSD §2.2.4 |
| **Preconditions** | Server running, server ID 1 exists, auth token |
| **Test Data** | DELETE endpoint |
| **Steps:** | |
| 1 | DELETE /api/sa4e-215/mcp/servers/1 | Expected: 204 No Content |
| **Expected Result:** | Server disconnected and removed |

### E2E-API-06: Auth — Missing/Invalid Token

| Field | Value |
|-------|-------|
| **ID** | E2E-API-06 |
| **Priority** | High |
| **Type** | Automated (vitest + fetch) |
| **Requirement** | FSD §2.2 API Contracts — Auth |
| **Preconditions** | Server running, no auth token or invalid token |
| **Test Data** | Request without Authorization header |
| **Steps:** | |
| 1 | GET /api/sa4e-215/mcp/servers without auth | Expected: 401 Unauthorized |
| 2 | POST /api/sa4e-215/mcp/servers without auth | Expected: 401 Unauthorized |
| **Expected Result:** | Auth rejected; operation denied |

---

## Section 5: E2E-UI Tests

### E2E-UI-01: Admin UI — Load Server List on Startup

| Field | Value |
|-------|-------|
| **ID** | E2E-UI-01 |
| **Priority** | High |
| **Type** | Automated (Playwright) |
| **Requirement** | FSD §5 Criterion 3; FSD §2.4.1; BRD §STORY 3 |
| **Preconditions** | Admin UI at localhost:3000, authenticated as admin |
| **Test Data** | None |
| **Steps:** | |
| 1 | Navigate to /admin/mcp-servers | Expected: page loads |
| 2 | Verify server list displays | Expected: table rows for each DB server |
| 3 | Verify status badges show Connected/Disconnected | Expected: badges match live McpClientManager state |
| **Expected Result:** | Server list loads with live status |

### E2E-UI-02: Create Server via UI Form

| Field | Value |
|-------|-------|
| **ID** | E2E-UI-02 |
| **Priority** | High |
| **Type** | Automated (Playwright) |
| **Requirement** | FSD §5 Criterion 2; FSD §2.2.2; BRD §STORY 1,2 |
| **Preconditions** | Admin UI authenticated, form visible |
| **Test Data** | Form: name="ui-test-srv", transport_type="httpStream", config.url="http://ui-test:9000", disabled=0 |
| **Steps:** | |
| 1 | Fill form and click "Create Server" | Expected: form submits |
| 2 | Verify server appears in list | Expected: new server row in table |
| 3 | Verify status badge shows Connected | Expected: Connected badge visible |
| **Expected Result:** | Server created + connected via UI |

### E2E-UI-03: Update Server Transport Type

| Field | Value |
|-------|-------|
| **ID** | E2E-UI-03 |
| **Priority** | High |
| **Type** | Automated (Playwright) |
| **Requirement** | FSD §5 Criterion 2; FSD §2.2.3; BRD §STORY 2 |
| **Preconditions** | Server list displayed, server ID 1 shows httpStream |
| **Test Data** | Form: transport_type="sse", config.url="http://ui-updated:8080/sse" |
| **Steps:** | |
| 1 | Select transport_type=sse, click "Update" | Expected: form submits |
| 2 | Verify status remains Connected | Expected: Connected badge still visible |
| 3 | Verify tool count updates | Expected: count reflects new transport |
| **Expected Result:** | Transport changed + reconnect triggered |

### E2E-UI-04: Delete Server via UI

| Field | Value |
|-------|-------|
| **ID** | E2E-UI-04 |
| **Priority** | High |
| **Type** | Automated (Playwright) |
| **Requirement** | FSD §5 Criterion 2; FSD §2.2.4; BRD §STORY 2 |
| **Preconditions** | Server list displayed, server to delete selected |
| **Test Data** | Click delete on server ID 1 |
| **Steps:** | |
| 1 | Click delete button on server row | Expected: delete confirmation dialog |
| 2 | Confirm deletion | Expected: server removed |
| 3 | Verify server gone from list | Expected: no row for deleted server |
| **Expected Result:** | Server disconnected + removed from UI |

### E2E-UI-05: Transport Type — streamable-http → httpStream

| Field | Value |
|-------|-------|
| **ID** | E2E-UI-05 |
| **Priority** | High |
| **Type** | Automated (Playwright) |
| **Requirement** | FSD §5 Criterion 5; BRD §STORY 4 |
| **Preconditions** | Server list displayed, server with streamable-http |
| **Test Data** | Create server with transport_type="streamable-http" |
| **Steps:** | |
| 1 | Create server with transport_type="streamable-http" via UI | Expected: 201 Created |
| 2 | Verify server connects and shows Connected | Expected: Connected badge visible |
| 3 | Verify tools count displays | Expected: non-zero tool count |
| **Expected Result:** | streamable-http normalized; server connects successfully |

### E2E-UI-06: Disable/Enable Server Toggle

| Field | Value |
|-------|-------|
| **ID** | E2E-UI-06 |
| **Priority** | Medium |
| **Type** | Automated (Playwright) |
| **Requirement** | FSD §5 Criterion 2; BRD §STORY 2 |
| **Preconditions** | Server list displayed, server Connected |
| **Test Data** | Toggle disabled=1 then disabled=0 |
| **Steps:** | |
| 1 | Click disable toggle on Connected server | Expected: server becomes Disconnected |
| 2 | Click enable toggle on Disconnected server | Expected: server becomes Connected |
| **Expected Result:** | Disable/enable toggles connection state |

### E2E-UI-07: Validation — Empty Name

| Field | Value |
|-------|-------|
| **ID** | E2E-UI-07 |
| **Priority** | Medium |
| **Type** | Automated (Playwright) |
| **Requirement** | FSD §2.6 Validation Rules |
| **Preconditions** | Create server form visible |
| **Test Data** | Name field left empty, click Create |
| **Steps:** | |
| 1 | Leave name empty, click "Create Server" | Expected: validation error shown |
| 2 | Verify error message displays | Expected: "Name is required" or similar |
| **Expected Result:** | Form validation prevents creation |

### E2E-UI-08: UI — Live Status Updates via Events

| Field | Value |
|-------|-------|
| **ID** | E2E-UI-08 |
| **Priority** | Medium |
| **Type** | Automated (Playwright) |
| **Requirement** | FSD §5 Criterion 3; FSD §2.4.2; BRD §STORY 3 |
| **Preconditions** | Admin UI connected, server being disconnected |
| **Test Data** | None |
| **Steps:** | |
| 1 | Observe UI while disconnecting server via API | Expected: status badge updates in real-time |
| 2 | Verify logs stream from connection engine | Expected: connection logs appear |
| **Expected Result:** | Live state reflected in UI without refresh |

---

## Section 6: Manual SIT Tests

### SIT-01: Start Application → Verify Auto-Connect

| Field | Value |
|-------|-------|
| **ID** | SIT-01 |
| **Priority** | High |
| **Type** | Manual — System Integration |
| **Requirement** | FSD §5 Criterion 1; BRD §STORY 1 |
| **Preconditions** | Server running localhost:3000, DB seeded with enabled servers |
| **Test Data** | mcp_servers seeded with 3 enabled servers |
| **Steps:** | |
| 1 | Start application (npm run dev) | Expected: app boots without errors |
| 2 | Wait 3 seconds for startup init | Expected: McpClientManager.loadFromDB() completes |
| 3 | Check API: GET /api/sa4e-215/mcp/servers | Expected: all enabled servers in response |
| 4 | Check UI: /admin/mcp-servers | Expected: all servers show Connected badge |
| 5 | Verify isServerConnected(id) returns true | Expected: all 3 enabled servers connected |
| **Expected Result:** | All enabled DB servers auto-connect on startup |

### SIT-02: Create New Server → Verify Immediate Connection

| Field | Value |
|-------|-------|
| **ID** | SIT-02 |
| **Priority** | High |
| **Type** | Manual — System Integration |
| **Requirement** | FSD §5 Criterion 2; BRD §STORY 2 |
| **Preconditions** | Server running, DB has enabled servers, admin logged in |
| **Test Data** | Form: name="sit-new-srv", transport_type="httpStream", config.url="http://sit-new:9000", disabled=0 |
| **Steps:** | |
| 1 | Navigate to /admin/mcp-servers | Expected: form visible |
| 2 | Fill form and click Create | Expected: server created |
| 3 | Wait 2 seconds for connection | Expected: connection attempt completes |
| 4 | Check server status in list | Expected: Connected badge appears |
| 5 | Verify tools count displays | Expected: count > 0 |
| **Expected Result:** | Create triggers immediate connection |

### SIT-03: Update Server Transport Type → Verify Reconnect

| Field | Value |
|-------|-------|
| **ID** | SIT-03 |
| **Priority** | High |
| **Type** | Manual — System Integration |
| **Requirement** | FSD §5 Criterion 2; BRD §STORY 2 |
| **Preconditions** | Server list displayed, server ID 1 Connected with httpStream |
| **Test Data** | PUT: transport_type="sse", config.url="http://sit-updated:8080/sse" |
| **Steps:** | |
| 1 | Click server ID 1 to edit | Expected: form pre-filled |
| 2 | Change transport_type to sse, click Update | Expected: update submits |
| 3 | Wait for reconnect | Expected: reconnection completes |
| 4 | Verify status remains Connected | Expected: Connected badge still shows |
| 5 | Verify tool count updates | Expected: new count displayed |
| **Expected Result:** | Config change triggers reconnect without restart |

### SIT-04: Delete Server → Verify Disconnect + Removal

| Field | Value |
|-------|-------|
| **ID** | SIT-04 |
| **Priority** | High |
| **Type** | Manual — System Integration |
| **Requirement** | FSD §5 Criterion 2; BRD §STORY 2 |
| **Preconditions** | Server list displayed, server Connected |
| **Test Data** | Server ID: 1 |
| **Steps:** | |
| 1 | Click delete on server ID 1 | Expected: confirmation dialog |
| 2 | Confirm deletion | Expected: deletion proceeds |
| 3 | Verify server removed from list | Expected: no row for ID 1 |
| 4 | Check API: GET servers | Expected: ID 1 not in response |
| 5 | Verify isServerConnected(1) returns false | Expected: server disconnected |
| **Expected Result:** | Server disconnected and removed from DB |

### SIT-05: Switch transport_type streamable-http → Verify Connect

| Field | Value |
|-------|-------|
| **ID** | SIT-05 |
| **Priority** | Medium |
| **Type** | Manual — System Integration |
| **Requirement** | FSD §5 Criterion 5; BRD §STORY 4 |
| **Preconditions** | Server list displayed, new server creation form available |
| **Test Data** | Create server with transport_type="streamable-http" |
| **Steps:** | |
| 1 | Create server with transport_type="streamable-http" | Expected: server created |
| 2 | Wait for connection attempt | Expected: connection completes |
| 3 | Verify Connected badge appears | Expected: Connected badge visible |
| 4 | Verify tools count > 0 | Expected: actual tool count displayed |
| **Expected Result:** | streamable-http maps to httpStream; server connects |

### SIT-06: Disable Server → Verify Disconnected Status

| Field | Value |
|-------|-------|
| **ID** | SIT-06 |
| **Priority** | Medium |
| **Type** | Manual — System Integration |
| **Requirement** | FSD §5 Criterion 2; BRD §STORY 2 |
| **Preconditions** | Server Connected, admin logged in |
| **Test Data** | Toggle disabled=1 |
| **Steps:** | |
| 1 | Click disable toggle on Connected server | Expected: confirmation or immediate action |
| 2 | Verify server status changes | Expected: Disconnected badge appears |
| 3 | Check API: GET /servers | Expected: disabled=1 in DB row |
| 4 | Verify isServerConnected returns false | Expected: connection checked |
| **Expected Result:** | Disable flag toggles connection state |

---

## Section 7: Requirements Traceability Matrix (RTM)

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| **UC-1: Startup auto-connect** | FSD §5 Criterion 1 | SIT-01, IT-001, UT-007 | ✅ |
| **UC-2: CRUD drives lifecycle** | FSD §5 Criterion 2 | IT-002, IT-003, IT-004, E2E-API-02, E2E-API-04, E2E-API-05, SIT-02, SIT-03, SIT-04 | ✅ |
| **UC-3: Live UI status** | FSD §5 Criterion 3 | IT-001, E2E-UI-01, E2E-UI-08, SIT-01, SIT-02 | ✅ |
| **UC-4: Tool count display** | FSD §5 Criterion 4 | IT-001, IT-002, IT-003, E2E-UI-02, E2E-UI-05, E2E-UI-08, UT-007 | ✅ |
| **UC-5: Transport normalization** | FSD §5 Criterion 5 | UT-008, IT-002, E2E-API-02, E2E-UI-05, SIT-05 | ✅ |
| **UC-6: No workaround** | FSD §5 Criterion 6 | All test cases (comprehensive coverage) | ✅ |
| **UC-7: Decision documented** | FSD §5 Criterion 7 | SIT-01 (doc reference), RTM included | ✅ |

**RTM Coverage: 100%** — All 7 FSD acceptance criteria traced to test cases.

---

## Section 8: Test Data Reference

Test data CSV files are located at: `documents/SA4E-257/testdata/`
- `pre-seeded-users.csv` — Baseline test data
- `create-server-testdata.csv` — Create operation test data
- `update-server-testdata.csv` — Update operation test data
- `delete-server-testdata.csv` — Delete operation test data
- `status-change-testdata.csv` — Status change test data
- `auth-testdata.csv` — Authentication test data

Each CSV includes `test_case_id` column referencing STC test case IDs.