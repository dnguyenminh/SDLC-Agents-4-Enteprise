# Functional Specification Document (FSD)

## MCP Server DB Integration — SA4E-257: Wire DB-backed MCP server config (mcp_servers) to McpClientManager

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-257 |
| Title | Wire DB-backed MCP server config (mcp_servers) to McpClientManager |
| Author | BA Agent |
| TA Reviewer | TA Agent |
| Version | 1.0 |
| Date | 2026-09-09 |
| Status | Draft |
| Related BRD | documents/SA4E-257/BRD.md |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-09 | BA Agent | Initial draft from BRD |
| 1.0 | 2026-09-09 | TA Agent | Technical enrichment: API contracts, data model, pseudocode |

---

## 1. Introduction

### 1.1 Purpose

This FSD specifies the functional and technical requirements for wiring the DB-backed `mcp_servers` table (SA4E-215) to the existing `McpClientManager` connection engine. The goal is to make MCP servers persisted via Admin UI actually connect and provide live status, tool counts, and logs.

### 1.2 Scope

**In Scope:**
- Load enabled servers from DB on startup and establish connections
- Drive connection lifecycle from DB CRUD operations (create/update/delete)
- Surface live status, tool count, and logs from `McpClientManager` in UI
- Reconcile transport-type vocabulary mismatch (`streamable-http` vs `httpStream`)
- Document coexistence/migration strategy between DB and `orchestration.json`

**Out of Scope:**
- KB tool-search index (`mcp_tools`) redesign
- `orchestration.json` file format changes
- Admin UI layout redesign beyond data source switch

### 1.3 Definitions & Acronyms

| Term | Definition |
|------|------------|
| McpClientManager | Facade managing MCP server lifecycle: connect, disconnect, reconnect, health monitoring |
| TransportFactory | Factory creating stdio/sse/httpStream transport instances |
| mcp_servers | SQLite table storing MCP server configuration (created in SA4E-215) |
| orchestration.json | Legacy file-based server configuration (current source of truth) |
| ConnectionState | State machine: connected, unhealthy, reconnecting, failed, disconnected |
| HealthMonitor | Periodic ping checker for connected servers |
| ReconnectManager | Exponential backoff reconnection handler |

### 1.4 References

| Document | Location |
|----------|----------|
| BRD | documents/SA4E-257/BRD.md |
| McpClientManager | backend/src/modules/orchestration/McpClientManager.ts |
| TransportFactory | backend/src/modules/orchestration/health/TransportFactory.ts |
| mcp_servers schema | backend/src/database/schema-registry/sa4e-215.ts |
| MCP Servers routes | backend/src/server/routes/mcp/servers.ts |
| Admin MCP CRUD | backend/src/server/routes/admin/mcp-crud.ts |
| Health types | backend/src/modules/orchestration/types/health.ts |

---

## 2. System Overview

### 2.1 System Context Diagram

![System Context](diagrams/component-mcp-integration.png)

The system consists of three layers:
1. **Persistence Layer** — `mcp_servers` SQLite table
2. **Connection Engine** — `McpClientManager` + `TransportFactory` + health monitoring
3. **API Layer** — Hono routes for CRUD and status queries

### 2.2 System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Admin UI (Svelte)                        │
│  MCP Servers Panel: list, create, edit, delete, toggle      │
└──────────────────────────┬──────────────────────────────────┘
                           │ HTTP REST
┌──────────────────────────▼──────────────────────────────────┐
│                   API Layer (Hono)                          │
│  /api/sa4e-215/mcp/servers/*  (CRUD)                       │
│  /api/admin/mcp/servers/*     (legacy orchestration.json)   │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│              Connection Engine (Orchestration)               │
│  McpClientManager                                           │
│  ├── TransportFactory (stdio/sse/httpStream)                │
│  ├── ConnectionStateTracker                                 │
│  ├── HealthMonitor                                          │
│  └── ReconnectManager                                       │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│              Persistence Layer                               │
│  mcp_servers table (SQLite)                                 │
│  orchestration.json (legacy, system-level)                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Functional Requirements

### 3.1 Feature: DB Config Auto-Connect on Startup

**Source:** [Implements: Story #1 — SA4E-257]

#### 3.1.1 Description

On application startup, `McpClientManager.initializeAll()` must load enabled servers from the `mcp_servers` DB table (where `disabled=0`) and establish connections via `connectServer()`.

#### 3.1.2 Use Case

**Use Case ID:** UC-001
**Actor:** System (startup sequence)
**Preconditions:** 
- DB table `mcp_servers` exists with at least one enabled row
- `McpClientManager` instance is created
- `OrchestrationModule.initializeAll()` is called

**Postconditions:**
- All enabled DB servers have `connectServer()` called
- Connected servers have tools registered in `proxiedTools`
- Failed connections are logged but do not block startup

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | System | McpClientManager | `initializeAll()` is called |
| 2 | | DB Adapter | Query `mcp_servers WHERE disabled=0` |
| 3 | | TransportFactory | Normalize `transport_type`: `streamable-http` → `httpStream` |
| 4 | | McpClientManager | Call `connectServer(name, config)` for each row |
| 5 | | TransportFactory | Create transport instance (stdio/sse/httpStream) |
| 6 | | Client | Connect to server with 10s timeout |
| 7 | | ConnectionStateTracker | Transition state to `connected` |
| 8 | | McpClientManager | Register server tools in `proxiedTools` |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | No enabled servers in DB | Log info, skip connection loop, continue startup |
| AF-2 | Server already connected via orchestration.json | Skip duplicate connection, log warning |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | DB query fails | Log error, continue startup with warning, no servers loaded from DB |
| EF-2 | `connectServer()` throws | Log error, register server in `stateTracker` for health monitor retry, continue to next server |
| EF-3 | Connection timeout (10s) | Mark server as disconnected, log error, continue |

#### 3.1.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-001 | Only servers with `disabled=0` are loaded on startup | BRD Story #1 |
| BR-002 | `streamable-http` in DB maps to `httpStream` in TransportFactory | BRD Story #4 |
| BR-003 | Connection failure does not block application startup | BRD Story #1 |
| BR-004 | Server named `code-intel` is always skipped (reserved) | McpClientManager.ts line 113 |

#### 3.1.4 Data Specifications

**Input Data (from DB):**

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| server_id | text | Yes | Primary key | Unique server identifier |
| name | text | Yes | Unique per project | Server display name |
| transport_type | text | Yes | One of: stdio, sse, streamable-http | Transport protocol |
| url | text | No | Valid URL if transport is sse/http | Server endpoint URL |
| command | text | No | Required for stdio | Executable command |
| args | text (JSON) | No | JSON array | Command arguments |
| env | text (JSON) | No | JSON object | Environment variables |
| disabled | integer | Yes | 0 or 1 | Enable/disable flag |

**Output Data (McpClientManager state):**

| Field | Type | Description |
|-------|------|-------------|
| clients | Map<string, Client> | Active MCP client connections |
| proxiedTools | ToolDefinition[] | All tools discovered from connected servers |
| stateTracker | ConnectionStateTracker | Per-server connection state |

#### 3.1.5 UI Specifications

N/A — Backend startup behavior, no UI changes.

#### 3.1.6 API Contract (Functional View)

**Endpoint:** N/A (internal startup sequence)

**Pseudocode:**

```typescript
// McpClientManager.initializeAll() — DB integration
async initializeAll(): Promise<void> {
  // Step 1: Load orchestration.json servers (existing)
  await this.loadOrchestrationJsonServers();
  
  // Step 2: Load DB servers (NEW — SA4E-257)
  const dbServers = await this.loadDbServers();
  for (const [name, config] of dbServers) {
    try {
      const normalizedConfig = this.normalizeTransportType(config);
      await this.connectServer(name, normalizedConfig);
    } catch (err) {
      this.logger.error({ err, server: name }, 'Failed to connect DB server');
      if (!this.stateTracker.getState(name)) this.stateTracker.register(name);
      this.serverConfigs.set(name, config);
    }
  }
}

private async loadDbServers(): Promise<Map<string, ServerConfig>> {
  const servers = new Map<string, ServerConfig>();
  try {
    const adapter = getDbAdapter();
    const rows = await adapter.allAsync<Record<string, unknown>>(
      'SELECT * FROM mcp_servers WHERE disabled = 0'
    );
    for (const row of rows) {
      servers.set(row.name as string, {
        url: row.url as string,
        command: row.command as string,
        args: row.args ? JSON.parse(row.args as string) : [],
        env: row.env ? JSON.parse(row.env as string) : {},
        type: row.transport_type as string,
        transportType: row.transport_type as string,
        disabled: false,
      });
    }
  } catch (err) {
    this.logger.error({ err }, 'Failed to load DB servers');
  }
  return servers;
}

private normalizeTransportType(config: ServerConfig): ServerConfig {
  if (config.transportType === 'streamable-http') {
    return { ...config, transportType: 'httpStream', type: 'httpStream' };
  }
  return config;
}
```

---

### 3.2 Feature: CRUD Drives Connection Lifecycle

**Source:** [Implements: Story #2 — SA4E-257]

#### 3.2.1 Description

CRUD operations on MCP servers via Admin UI must trigger connection lifecycle actions in `McpClientManager` so server status stays in sync with DB state.

#### 3.2.2 Use Case

**Use Case ID:** UC-002
**Actor:** System Administrator
**Preconditions:** 
- User is authenticated with `MCP_MANAGE` permission
- `McpClientManager` is initialized

**Postconditions:**
- Server connection state matches DB state
- UI reflects updated status immediately

**Main Flow (Create):**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Admin | API | POST `/api/sa4e-215/mcp/servers` with server config |
| 2 | | DB Adapter | Insert row into `mcp_servers` |
| 3 | | McpClientManager | Call `connectServer(name, normalizedConfig)` |
| 4 | | UI | Refresh server list, show connected status |

**Main Flow (Update):**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Admin | API | PUT `/api/sa4e-215/mcp/servers/:id` with changes |
| 2 | | DB Adapter | Update row in `mcp_servers` |
| 3 | | McpClientManager | Compare config changes |
| 4 | | McpClientManager | If transport/config changed: `disconnectServer()` then `connectServer()` |
| 5 | | UI | Refresh server list |

**Main Flow (Delete):**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Admin | API | DELETE `/api/sa4e-215/mcp/servers/:id` |
| 2 | | McpClientManager | Call `disconnectServer(name)` |
| 3 | | DB Adapter | Delete row from `mcp_servers` |
| 4 | | UI | Remove server from list |

**Main Flow (Toggle Disable):**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Admin | API | PUT `/api/sa4e-215/mcp/servers/:id` with `disabled=true` |
| 2 | | DB Adapter | Update `disabled=1` |
| 3 | | McpClientManager | Call `disconnectServer(name)` |
| 4 | | UI | Show server as disabled/disconnected |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | Create with `disabled=true` | Insert DB row, skip `connectServer()`, show disabled |
| AF-2 | Update only non-config fields (name, autoApprove) | Update DB, skip reconnect |
| AF-3 | Delete while server is reconnecting | Cancel reconnect, close client, delete DB row |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | `connectServer()` fails after create | Return error to UI, keep DB row with disconnected status |
| EF-2 | `disconnectServer()` fails | Log warning, force-remove from `clients` map, delete DB row |
| EF-3 | Duplicate name in same project | Return 400 error: "Server name already exists for this project" |

#### 3.2.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-005 | Create triggers immediate `connectServer()` | BRD Story #2 |
| BR-006 | Config changes trigger reconnect without restart | BRD Story #2 |
| BR-007 | Delete calls `disconnectServer()` before DB delete | BRD Story #2 |
| BR-008 | Disable toggle calls `disconnectServer()` | BRD Story #2 |
| BR-009 | Duplicate `name` per `project_id` is prevented | servers.ts validation |

#### 3.2.4 Data Specifications

**Request Body (Create/Update):**

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| projectId | text | Yes (create) | FK to project_registry | Project scope |
| name | text | Yes (create) | Unique per project | Server name |
| transportType | text | Yes (create) | stdio/sse/streamable-http | Transport type |
| url | text | No | Valid URL | Endpoint URL |
| command | text | No | Required for stdio | Executable |
| args | array | No | JSON array | Arguments |
| env | object | No | JSON object | Environment |
| disabled | boolean | No | Default false | Disable flag |

#### 3.2.5 UI Specifications

**Screen: MCP Servers Panel**

The MCP Servers panel in Admin UI displays:

| Column | Source | Description |
|--------|--------|-------------|
| Name | DB `name` | Server display name |
| Transport | DB `transport_type` | Transport protocol |
| Status | `McpClientManager.isServerConnected()` | Connected/Disconnected/Reconnecting/Failed |
| Tools | `McpClientManager.getServerToolCount()` | Number of tools discovered |
| Actions | — | Edit, Delete, Toggle Disable |

#### 3.2.6 API Contract (Functional View)

**Endpoint:** `POST /api/sa4e-215/mcp/servers`
**Purpose:** Create new MCP server config and establish connection

**Input Parameters:**

| Parameter | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| projectId | string | Y | BR-009 | Project scope |
| name | string | Y | BR-009 | Server name |
| transportType | string | Y | BR-002 | Transport type |
| url | string | N | Required for sse/httpStream | Endpoint URL |
| command | string | N | Required for stdio | Executable |
| args | array | N | — | Arguments |
| env | object | N | — | Environment |
| disabled | boolean | N | Default false | Disable flag |

**Response (Success):**
```json
{
  "success": true,
  "data": {
    "serverId": "mcp-a1b2c3d4",
    "projectId": "proj-001",
    "name": "my-server",
    "transportType": "streamable-http",
    "url": "http://localhost:3000/mcp",
    "disabled": false,
    "status": "connected",
    "toolCount": 5,
    "createdAt": "2026-09-09T06:30:00Z"
  }
}
```

**Response (Error — Duplicate):**
```json
{
  "success": false,
  "error": {
    "code": "ERR_001",
    "message": "Server name already exists for this project"
  }
}
```

---

### 3.3 Feature: Live Status in UI

**Source:** [Implements: Story #3 — SA4E-257]

#### 3.3.1 Description

UI must query `McpClientManager` for live connection status, tool count, and logs instead of reading static DB values.

#### 3.3.2 Use Case

**Use Case ID:** UC-003
**Actor:** System Administrator
**Preconditions:** 
- MCP Servers panel is open
- `McpClientManager` is initialized

**Postconditions:**
- Status column shows live `ConnectionState`
- Tools column shows actual tool count from server
- Logs tab shows real connection logs

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Admin | UI | Open MCP Servers panel |
| 2 | | API | GET `/api/sa4e-215/mcp/servers` |
| 3 | | McpClientManager | Enrich each server with `isServerConnected()` and `getServerToolCount()` |
| 4 | | UI | Display live status and tool counts |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | Server is reconnecting | Show "Reconnecting (attempt 3/10)" |
| AF-2 | Server has failed | Show "Failed — manual reconnection required" |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | `McpClientManager` unavailable | Show "Status unavailable" with retry button |

#### 3.3.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-010 | Status must come from `McpClientManager`, not DB | BRD Story #3 |
| BR-011 | Tool count must come from `getServerToolCount()`, not DB | BRD Story #3 |
| BR-012 | No mock data or static DB values for status | BRD Story #3 |

#### 3.3.4 API Contract (Functional View)

**Endpoint:** `GET /api/sa4e-215/mcp/servers`
**Purpose:** List servers with live status enrichment

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| projectId | string | N | Filter by project |
| disabled | string | N | Filter by disabled status ("true"/"false") |

**Response (Success):**
```json
{
  "success": true,
  "data": [
    {
      "serverId": "mcp-a1b2c3d4",
      "name": "my-server",
      "transportType": "streamable-http",
      "url": "http://localhost:3000/mcp",
      "disabled": false,
      "status": "connected",
      "toolCount": 5,
      "lastHealthCheck": "2026-09-09T06:30:00Z",
      "consecutiveFailures": 0,
      "reconnectAttempts": 0,
      "lastError": null,
      "nextRetryAt": null,
      "createdAt": "2026-09-09T06:30:00Z",
      "updatedAt": "2026-09-09T06:30:00Z"
    }
  ]
}
```

---

### 3.4 Feature: Transport Type Normalization

**Source:** [Implements: Story #4 — SA4E-257]

#### 3.4.1 Description

Map UI/DB value `streamable-http` to internal `httpStream` in `TransportFactory` or adapter layer.

#### 3.4.2 Use Case

**Use Case ID:** UC-004
**Actor:** Developer (internal)
**Preconditions:** 
- Server config has `transport_type=streamable-http`

**Postconditions:**
- Transport created as `StreamableHTTPClientTransport`
- Original value preserved in DB

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | McpClientManager | normalizeTransportType() | Map `streamable-http` → `httpStream` |
| 2 | | TransportFactory.createTransport() | Check `config.type === 'httpStream'` |
| 3 | | TransportFactory | Create `StreamableHTTPClientTransport` |

#### 3.4.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-013 | `streamable-http` maps to `httpStream` | BRD Story #4 |
| BR-014 | Original value preserved in DB for audit | BRD Story No breaking change |

#### 3.4.4 API Contract (Functional View)

**Transport Mapping Table:**

| DB Value | Internal Value | Transport Class |
|----------|---------------|-----------------|
| stdio | stdio | StdioClientTransport |
| sse | sse | SSEClientTransport |
| streamable-http | httpStream | StreamableHTTPClientTransport |
| httpStream | httpStream | StreamableHTTPClientTransport |

---

## 4. Data Model

### 4.1 Entity Relationship Diagram

![ER Diagram](diagrams/er-diagram.png)

### 4.2 Logical Entities

#### Entity: mcp_servers

| Attribute | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| server_id | text (PK) | Y | Auto-generated `mcp-{uuid}` | Unique identifier |
| project_id | text (FK) | Y | BR-009 | Project scope |
| name | text | Y | BR-009 | Server display name |
| transport_type | text | Y | BR-002, BR-013 | Transport protocol |
| url | text | N | Required for sse/httpStream | Endpoint URL |
| command | text | N | Required for stdio | Executable command |
| args | text (JSON) | N | — | Command arguments array |
| env | text (JSON) | N | — | Environment variables object |
| disabled | integer | Y | Default 0 | Enable/disable flag |
| auto_approve | text (JSON) | N | — | Auto-approve tool names |
| tools | text (JSON) | N | — | Tool configuration |
| created_at | timestamp | Y | — | Creation timestamp |
| updated_at | timestamp | Y | — | Last update timestamp |

**Indexes:**
- `idx_mcp_servers_project_id` — project lookup
- `idx_mcp_servers_name_project` — unique name per project
- `idx_mcp_servers_disabled` — filter enabled servers

### 4.3 McpClientManager Internal State

| Property | Type | Description |
|----------|------|-------------|
| clients | Map<string, Client> | Active MCP client connections |
| toolsToServer | Map<string, string> | Tool name → server name mapping |
| proxiedTools | ToolDefinition[] | All tools from connected servers |
| serverConfigs | Map<string, ServerConfig> | Server configurations |
| stateTracker | ConnectionStateTracker | Per-server connection state |

---

## 5. Integration Specifications

### 5.1 External System: McpClientManager

| Attribute | Value |
|-----------|-------|
| Purpose | Connection engine for MCP servers |
| Direction | Bidirectional (config in, status out) |
| Data Format | TypeScript objects |
| Frequency | Real-time (startup + CRUD events) |

**Data Exchange:**

| Our Data | McpClientManager Data | Direction | Business Rule |
|----------|----------------------|-----------|---------------|
| DB row (mcp_servers) | ServerConfig | In | BR-001: Load enabled |
| — | connectServer() | In | BR-005: Create triggers connect |
| — | disconnectServer() | In | BR-007: Delete triggers disconnect |
| isServerConnected() | boolean | Out | BR-010: Live status |
| getServerToolCount() | number | Out | BR-011: Live tool count |
| getServersStatus() | ServerStatusEntry[] | Out | Full status for UI |

### 5.2 External System: TransportFactory

| Attribute | Value |
|-----------|-------|
| Purpose | Create transport instances |
| Direction | Outbound (config → transport) |
| Data Format | TypeScript objects |
| Frequency | On-demand (connect/reconnect) |

**Data Exchange:**

| Our Data | TransportFactory Data | Direction | Business Rule |
|----------|----------------------|-----------|---------------|
| ServerConfig | Transport instance | Out | BR-013: Normalize type |

---

## 6. Processing Logic

### 6.1 Startup Initialization

**Trigger:** Application startup (`OrchestrationModule.initializeAll()`)
**Schedule:** Once at startup
**Input:** DB `mcp_servers` table
**Output:** Connected servers with registered tools

**Processing Steps:**

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Read orchestration.json | Skip if missing (existing behavior) |
| 2 | Connect orchestration.json servers | Log error, continue |
| 3 | Query DB for enabled servers | Log error, continue with empty list |
| 4 | Normalize transport types | Map streamable-http → httpStream |
| 5 | Call connectServer() for each | Log error, register for health monitor, continue |
| 6 | Register tools from connected servers | Skip shadowed tools (SA4E-218) |

**Activity Diagram:**

![Startup Flow](diagrams/sequence-mcp-lifecycle.png)

### 6.2 CRUD Event Handling

**Trigger:** HTTP request to `/api/sa4e-215/mcp/servers/*`
**Schedule:** On-demand
**Input:** Server config from request body
**Output:** Updated server state

**Processing Steps (Create):**

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Validate request body | Return 400 if invalid |
| 2 | Check duplicate name | Return 400 if exists |
| 3 | Insert DB row | Return 500 on DB error |
| 4 | Normalize transport type | — |
| 5 | Call connectServer() | Return error to UI, keep DB row |
| 6 | Return success with status | — |

**Pseudocode:**

```typescript
// Route handler: POST /api/sa4e-215/mcp/servers
async createServer(body: CreateServerRequest): Promise<ServerResponse> {
  // Validate
  if (!body.projectId || !body.name || !body.transportType) {
    return { success: false, error: { code: 'ERR_001', message: 'Missing required fields' } };
  }
  
  // Check duplicate
  const existing = await adapter.getAsync(
    'SELECT server_id FROM mcp_servers WHERE name = ? AND project_id = ?',
    [body.name, body.projectId]
  );
  if (existing) {
    return { success: false, error: { code: 'ERR_001', message: 'Server name already exists' } };
  }
  
  // Insert DB
  const serverId = 'mcp-' + crypto.randomUUID().slice(0, 8);
  await adapter.runAsync('INSERT INTO mcp_servers ...', [...]);
  
  // Connect (if not disabled)
  let status = 'disconnected';
  let toolCount = 0;
  if (!body.disabled) {
    const config = normalizeTransportType(body);
    try {
      await mcpClientManager.connectServer(body.name, config);
      status = 'connected';
      toolCount = mcpClientManager.getServerToolCount(body.name);
    } catch (err) {
      logger.error({ err, server: body.name }, 'Connect failed');
      status = 'disconnected';
    }
  }
  
  return { success: true, data: { serverId, status, toolCount, ... } };
}
```

---

## 7. Security Requirements

### 7.1 Authentication & Authorization

| Role | Permissions | Screens/Features |
|------|-------------|-------------------|
| System Administrator | MCP_MANAGE | CRUD on MCP servers |
| Developer | Read-only | View server status |

### 7.2 Data Sensitivity Classification

| Data Type | Classification | Business Requirement |
|-----------|---------------|---------------------|
| MCP server URLs | Confidential | May contain internal endpoints |
| Server configs (env) | Restricted | May contain secrets/tokens |
| Tool definitions | Internal | Non-sensitive metadata |

### 7.3 Audit Trail

| Event | Logged Fields | Retention | Business Reason |
|-------|--------------|-----------|-----------------|
| MCP_SERVER_CREATE | userId, username, serverId, projectId | Per audit_log policy | Security compliance |
| MCP_SERVER_UPDATE | userId, username, serverId | Per audit_log policy | Change tracking |
| MCP_SERVER_DELETE | userId, username, serverId | Per audit_log policy | Deletion tracking |

---

## 8. Non-Functional Requirements

| Category | Business Requirement | Acceptance Criteria |
|----------|---------------------|---------------------|
| Performance | Startup load ≤ 2s per server | Async connection, non-blocking |
| Performance | CRUD response < 500ms | Direct DB + connect |
| Scalability | Support 100+ MCP servers | Connection pooling, async init |
| Availability | Connection failures isolated | No cascade failure between servers |
| Security | Config encrypted at rest | Use existing DB encryption |
| Reliability | Auto-reconnect on failure | Exponential backoff, max 10 retries |

---

## 9. Error Handling (User-Facing)

### 9.1 Error Scenarios

| Scenario | Severity | User Message | Expected Behavior |
|----------|----------|-------------|-------------------|
| Server create fails to connect | Warning | "Server created but connection failed. Check URL/config." | DB row kept, status shows disconnected |
| Server update triggers reconnect failure | Warning | "Config updated but reconnect failed. Server may be offline." | Previous config restored in memory |
| Delete while reconnecting | Info | "Server deleted successfully." | Reconnect cancelled, resources cleaned |
| Duplicate server name | Error | "Server name already exists for this project." | Request rejected, no DB change |
| Invalid transport type | Error | "Invalid transport type. Use: stdio, sse, streamable-http." | Request rejected |
| DB connection error | Critical | "Database unavailable. Server config not persisted." | Log error, continue with in-memory only |

### 9.2 Notification Requirements

| Event | Who is Notified | Channel | Timing |
|-------|----------------|---------|--------|
| Server connection failed | Admin | In-app log | Immediate |
| Server reconnected after failure | Admin | In-app log | Immediate |
| Max retries exhausted | Admin | In-app error | Immediate |

---

## 10. Testing Considerations

### 10.1 Test Scenarios

| ID | Scenario | Input | Expected Output | Priority |
|----|----------|-------|-----------------|----------|
| TC-001 | Startup loads enabled DB servers | DB with 3 enabled servers | All 3 have `connectServer()` called | High |
| TC-002 | Startup skips disabled servers | DB with disabled=1 | No `connectServer()` call | High |
| TC-003 | Create server triggers connect | POST with valid config | Server status = connected | High |
| TC-004 | Create disabled server skips connect | POST with disabled=true | Server status = disconnected | Medium |
| TC-005 | Update config triggers reconnect | PUT with changed URL | Server reconnects with new config | High |
| TC-006 | Delete triggers disconnect | DELETE existing server | `disconnectServer()` called, DB row removed | High |
| TC-007 | Toggle disable disconnects | PUT disabled=true | `disconnectServer()` called | Medium |
| TC-008 | streamable-http normalizes to httpStream | DB with streamable-http | Transport created as httpStream | High |
| TC-009 | Duplicate name rejected | POST with existing name | 400 error returned | Medium |
| TC-010 | DB error does not block startup | DB unavailable | Startup continues, warning logged | High |
| TC-011 | Live status reflects connection state | Server reconnecting | UI shows "Reconnecting" | Medium |
| TC-012 | Tool count reflects actual tools | Server with 5 tools | Tool count = 5, not DB value | Medium |

---

## 11. Appendix

### Diagrams

| Diagram | File |
|---------|------|
| Component Architecture | [component-mcp-integration.drawio](diagrams/component-mcp-integration.drawio) |
| Connection Lifecycle Sequence | [sequence-mcp-lifecycle.drawio](diagrams/sequence-mcp-lifecycle.drawio) |
| Business Flow | [business-flow.drawio](diagrams/business-flow.drawio) |
| Use Case | [use-case.drawio](diagrams/use-case.drawio) |

### Change Log from BRD

- Added transport mapping table (BR-013, BR-014) — not explicitly in BRD
- Added `code-intel` reserved server rule (BR-004) — from McpClientManager implementation
- Added audit trail events — from existing route implementation

### Open Issues

| Issue | Owner | Target Date | Status |
|-------|-------|-------------|--------|
| Decide: DB replaces orchestration.json or coexist? | Architect | TBD | Pending |
| Migration strategy for existing orchestration.json servers | Backend Dev | TBD | Pending |
| UI real-time status refresh mechanism (polling vs WebSocket) | UI Dev | TBD | Pending |

---

**Document End**
