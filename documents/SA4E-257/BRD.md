# Business Requirements Document (BRD)

## MCP Server Integration — SA4E-257: Wire DB-backed MCP server config (mcp_servers) to McpClientManager so configured servers actually connect

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-257 |
| Title | Wire DB-backed MCP server config (mcp_servers) to McpClientManager so configured servers actually connect |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2026-09-09 |
| Status | Draft |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | BA Agent – Business Analyst | Create document |
| Peer Reviewer | TBD – Technical Lead | Review document |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-09 | BA Agent | Initiate document — auto-generated from Jira ticket SA4E-257 and linked tickets |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |

---

## 1. Introduction

### 1.1 Scope

The scope of this change request is to unify MCP server configuration management by wiring the DB-backed `mcp_servers` table to the existing connection engine `McpClientManager`. Currently servers persisted via Admin UI at `/admin` (DB table `mcp_servers`, created in SA4E-215, route `/api/sa4e-215/mcp/servers`) always show disconnected status and Tools = 0 because DB CRUD is persistence-only. The connection engine (McpClientManager + TransportFactory + OrchestrationModule) works correctly for `orchestration.json` servers but is not driven by DB config.

This BRD defines requirements to:
- Load enabled servers from DB on startup and establish connections via `connectServer()`
- Drive connection lifecycle from DB CRUD operations (create/update/delete)
- Surface live status, tool count, and logs from `McpClientManager` in UI
- Reconcile transport-type vocabulary mismatch (`streamable-http` vs `httpStream`)
- Document coexistence/ migration strategy between DB and `orchestration.json`

### 1.2 Out of Scope

- Redesign of the KB tool-search index (`mcp_tools`)
- Modification of existing `orchestration.json` file format structure beyond mapping
- Changes to Admin UI layout/design beyond data source switch

### 1.3 Preliminary Requirement

- DB table `mcp_servers` exists with schema defined in `backend/src/database/schema-registry/sa4e-215.ts`
- `McpClientManager` implements `connectServer`, `disconnectServer`, `reconnectServer`, `isServerConnected`, `getServerToolCount`
- TransportFactory supports stdio/sse/httpStream transports with health check and auto-reconnect
- Admin UI routes `backend/src/server/routes/mcp/servers.ts` currently perform persistence only
- Reference implementation exists in `backend/src/server/routes/admin/mcp-crud.ts` for orchestration.json surface

---

## 2. Business Requirements

### 2.1 High Level Process Map

Admin configures MCP servers via Admin UI → Config persisted to DB `mcp_servers` → On startup and on CRUD events, `McpClientManager` loads/refreshes config → TransportFactory creates appropriate transport → Server connection established and monitored → UI queries `McpClientManager` for live status/tools/logs

### 2.2 List of User Stories / Use Cases

| # | Story / Use Case / Epic | Priority | Source Ticket |
|---|-------------------------|----------|---------------|
| 1 | As a System Administrator, I want MCP servers configured in DB to auto-connect on application startup so that configured servers are actually connected and usable | MUST HAVE | SA4E-257 |
| 2 | As a System Administrator, I want CRUD operations on MCP servers in Admin UI to trigger connection lifecycle actions so that server status stays in sync | MUST HAVE | SA4E-257 |
| 3 | As a System Administrator, I want UI to display live connection status, tools count and logs from McpClientManager so that I see accurate real-time information | MUST HAVE | SA4E-257 |
| 4 | As a Developer, I want transport-type naming normalized between UI/DB and TransportFactory so that streamable-http servers can connect | MUST HAVE | SA4E-257 |
| 5 | As an Architect, I want a documented decision on DB vs orchestration.json coexistence so that system config source of truth is clear | SHOULD HAVE | SA4E-257 |

---

### 2.3 Details of User Stories

---

#### Business Flow

**Step 1:** Application starts, `OrchestrationModule.initializeAll()` triggers
**Step 2:** `McpClientManager` loads enabled rows (`disabled=0`) from `mcp_servers` table
**Step 3:** For each row, normalize transport type (`streamable-http` → `httpStream`) and call `connectServer()`
**Step 4:** TransportFactory creates transport instance; connection established; tool list fetched
**Step 5:** Admin UI lists servers; status/tools/logs queried from `McpClientManager` live state
**Step 6:** On create/update/delete via `/api/sa4e-215/mcp/servers`, route triggers `connectServer` / `disconnectServer` / `reconnectServer` mirroring `admin/mcp-crud.ts` pattern
**Step 7:** Changes reflected immediately in UI without mock data

> **Note:** No workaround allowed; root cause unification of data source is required per no-workaround-rule

---

#### STORY 1: DB Config Auto-Connect on Startup

> As a System Administrator, I want MCP servers configured in DB to auto-connect on application startup so that configured servers are actually connected and usable

**Requirement Details:**

1. On startup, `McpClientManager` must query `mcp_servers` table for rows where `disabled=0`
2. For each row, invoke `connectServer()` with normalized configuration
3. Connection errors must be logged and server marked disconnected but not fail startup

**Data Fields (if applicable):**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| id | integer | Yes | Primary key | 42 |
| name | string | Yes | Server name | my-mcp-server |
| transport_type | string | Yes | Transport type | streamable-http |
| config | json | Yes | Connection config | {"url":"http://..."} |
| disabled | boolean | Yes | Enable/disable flag | 0 |

**Acceptance Criteria:**

1. On startup, all enabled DB servers are loaded and `connectServer()` is called for each
2. Server status transitions to connected when handshake succeeds
3. Failed connections are logged with error details
4. Behavior matches orchestration.json initialization path

**UI Specifications (if applicable):**

N/A – backend startup behavior

**Validation Rules (if applicable):**

- `transport_type` must be one of: stdio, sse, streamable-http
- `disabled` must be 0 or 1

**Error Handling (if applicable):**

- DB query failure: log error, continue startup with warning
- Connection failure: mark server disconnected, retry per auto-reconnect policy

---

#### STORY 2: CRUD Drives Connection Lifecycle

> As a System Administrator, I want CRUD operations on MCP servers in Admin UI to trigger connection lifecycle actions so that server status stays in sync

**Requirement Details:**

1. Create: after DB insert, call `connectServer()` for new server
2. Update: compare transport/config changes → call `reconnectServer()` if needed
3. Delete: call `disconnectServer()` then remove DB row
4. Disable toggle: call `disconnectServer()` when disabled=1

**Acceptance Criteria:**

1. Creating a server via UI results in immediate connection attempt
2. Updating server config triggers reconnect without manual restart
3. Deleting server disconnects and removes resources
4. Pattern mirrors `backend/src/server/routes/admin/mcp-crud.ts`

**Validation Rules:**

- Prevent duplicate `name` per project

**Error Handling:**

- Connection error after create: return error to UI, keep DB row with failed status

---

#### STORY 3: Live Status in UI

> As a System Administrator, I want UI to display live connection status, tools count and logs from McpClientManager so that I see accurate real-time information

**Requirement Details:**

1. UI must query `isServerConnected()` and `getServerToolCount()` from `McpClientManager`
2. Logs must stream from connection engine, not DB
3. No mock data or static DB values

**Acceptance Criteria:**

1. Status column shows Connected/Disconnected based on live state
2. Tools column reflects actual tool count discovered from server
3. Logs tab shows real connection logs

---

#### STORY 4: Transport Type Normalization

> As a Developer, I want transport-type naming normalized between UI/DB and TransportFactory so that streamable-http servers can connect

**Requirement Details:**

1. Map UI/DB value `streamable-http` to internal `httpStream`
2. Mapping applied in `TransportFactory` or adapter layer
3. Preserve original value in DB for audit

**Acceptance Criteria:**

1. Servers with `transport_type=streamable-http` connect successfully
2. No breaking change for existing `httpStream` values
3. Mapping documented

---

#### STORY 5: Config Source of Truth Decision

> As an Architect, I want a documented decision on DB vs orchestration.json coexistence so that system config source of truth is clear

**Requirement Details:**

1. Document whether DB replaces orchestration.json entirely or they coexist (system-level vs per-project)
2. Decision recorded in Architecture Decision Record

**Acceptance Criteria:**

1. Decision documented and approved
2. BRD references decision

---

## 3. Dependencies

| Dependency | Type | Related Ticket | Description |
|------------|------|----------------|-------------|
| mcp_servers schema | Infrastructure | SA4E-215 | DB table for server config |
| McpClientManager | System | N/A | Connection engine |
| TransportFactory | System | N/A | Transport creation |
| OrchestrationModule | System | N/A | Startup wiring |
| Admin UI MCP Servers panel | System | SA4E-215 | UI for CRUD |

---

## 4. Stakeholders

| Role | Name / Team | Responsibility | Source |
|------|-------------|----------------|--------|
| Reporter/Creator | Duc Nguyen Minh | Requirement owner | Jira reporter |
| BA | BA Agent | BRD author | SA4E-257 |
| SA | System Architect | Architecture review, no-workaround-rule | SA4E-257 |
| Backend Dev | TBD | Implementation of wiring | SA4E-257 |

---

## 5. Risks and Assumptions

### 5.1 Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Transport mapping introduces regression for existing httpStream servers | High | Medium | Unit tests for both vocabularies |
| Startup load of many servers causes slow start | Medium | Low | Lazy connect / async init |
| DB and orchestration.json conflict leads to duplicate connections | High | Medium | Document source of truth decision |

### 5.2 Assumptions

- `McpClientManager` API is stable and supports required methods
- Admin UI will be updated to call new lifecycle endpoints or route handles it internally
- No existing production dependency on DB config being persistence-only

---

## 6. Non-Functional Requirements

| Category | Requirement | Details |
|----------|-------------|---------|
| Performance | Startup load ≤ 2s per server | Async connection |
| Security | Config contains sensitive URLs, must be stored encrypted at rest | Use existing DB encryption |
| Scalability | Support 100+ MCP servers | Connection pooling |
| Availability | Connection failures isolated per server | No cascade failure |

> No specific non-functional requirements identified beyond above. To be confirmed with technical team.

---

## 7. Related Tickets

| Ticket Key | Summary | Status | Type | Relationship |
|------------|---------|--------|------|--------------|
| SA4E-257 | Wire DB-backed MCP server config to McpClientManager so configured servers actually connect | To Do | Task | Main ticket |
| SA4E-215 | MCP Servers panel persistence | Done | Story | Predecessor |

---

## 8. Appendix

### Glossary

| Term | Definition |
|------|------------|
| McpClientManager | Connection engine managing MCP server lifecycle |
| TransportFactory | Factory creating stdio/sse/httpStream transports |
| mcp_servers | DB table storing MCP server configs |

### Reference Documents

| Document | Link / Location |
|----------|-----------------|
| Key Files | backend/src/server/routes/mcp/servers.ts |
| Key Files | backend/src/modules/orchestration/McpClientManager.ts |
| Key Files | backend/src/modules/orchestration/health/TransportFactory.ts |
