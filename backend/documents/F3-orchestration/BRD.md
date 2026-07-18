# Business Requirements Document (BRD)

## SA4E Orchestration — F3-ORCHESTRATION

---

## Document Information

| Field | Value |
|-------|-------|
| Feature ID | F3-ORCHESTRATION |
| Title | Orchestration Module (Child MCP Manager) |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2025-07-03 |
| Status | Draft |
| Architecture Pattern | AI Agent System |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-07-03 | BA Agent | Initial BRD — generated from source analysis |

---

## 1. Introduction

### 1.1 Scope

The Orchestration module serves as the **Child MCP Server Manager** for the SA4E system. It acts as a proxy layer between AI agents and external tool servers (Atlassian, markdown-exporter, etc.), providing:

- **Child MCP Server Lifecycle Management**: Connect, monitor, and gracefully shutdown child servers
- **Semantic Tool Discovery**: Vector-similarity based tool search across all registered tools (`find_tools`)
- **Dynamic Tool Execution Routing**: Route `execute_dynamic_tool` calls to the correct child server or internal module
- **Tool Toggle (Enable/Disable)**: Runtime enable/disable of individual tools
- **Server Health Monitoring**: Track connection status and handle reconnection
- **Connection Lifecycle Management**: Support for multiple transport types (StreamableHTTP, SSE, stdio)

The Orchestration module is the single gateway through which agents access external capabilities — agents never call child server tools directly.

### 1.2 Out of Scope

- Implementing the actual external tools (Jira, Confluence, etc.) — those are child servers
- LLM invocation or prompt management (handled by LangGraph Engine)
- Knowledge Base storage (handled by Memory Module / F1)
- Code analysis (handled by Code Intelligence Module / F2)
- Agent routing or SDLC pipeline orchestration (handled by LangGraph Engine)
- UI/Extension-level tool routing (handled by ToolProxy in extension layer)

### 1.3 Preliminary Requirements

- `@modelcontextprotocol/sdk` — MCP client SDK for connecting to child servers
- `.code-intel/orchestration.json` — Configuration file defining child servers
- ONNX embedding service — For generating tool description vectors (semantic search)
- `mcp_tools` table in SQLite — Stores tool definitions with vector embeddings
- Memory Module (F1) — Provides DB access for tool vector storage
- Module Registry — For routing `execute_dynamic_tool` to internal handlers

---

## 2. Business Requirements

### 2.1 High Level Process Map

The Orchestration module operates as an intelligent proxy layer:

1. **System Startup**: OrchestrationModule initializes → McpClientManager reads `orchestration.json`
2. **Child Server Connection**: For each configured server → establish transport (HTTP/SSE/stdio) → fetch tools list
3. **Tool Registration**: Each discovered tool → store in `mcp_tools` table with vector embedding for semantic search
4. **Agent Discovery**: Agent calls `find_tools(query)` → ONNX generates query embedding → cosine similarity against stored vectors → returns ranked tool list
5. **Tool Execution**: Agent calls `execute_dynamic_tool(toolName, args)` → route to child server (if owned) or internal module handler
6. **Health Monitoring**: Track server status → handle timeouts and disconnections gracefully

![Business Flow](diagrams/business-flow.png)

### 2.2 List of User Stories / Use Cases

| # | Story / Use Case | Priority | Category |
|---|-----------------|----------|----------|
| 1 | Semantic Tool Discovery — find tools by natural language query | MUST HAVE | Core Discovery |
| 2 | Dynamic Tool Execution — execute any discovered tool by name | MUST HAVE | Core Execution |
| 3 | Child Server Connection — connect to configured MCP servers on startup | MUST HAVE | Lifecycle |
| 4 | Orchestration Status — report health of all child servers | MUST HAVE | Monitoring |
| 5 | Tool Toggle — enable/disable individual tools at runtime | SHOULD HAVE | Management |
| 6 | Connection Timeout Handling — graceful timeout on child server connect | MUST HAVE | Reliability |
| 7 | Multi-Transport Support — HTTP Stream, SSE, and stdio transports | MUST HAVE | Connectivity |
| 8 | Tool Routing — route execution to correct server or internal module | MUST HAVE | Core Execution |
| 9 | Server Reconnection — detect disconnection and attempt reconnect | SHOULD HAVE | Reliability |
| 10 | Configuration Hot-Reload — detect changes to orchestration.json | COULD HAVE | Management |
| 11 | Tool Schema Validation — validate arguments against tool inputSchema | SHOULD HAVE | Quality |
| 12 | Execution Timeout — timeout long-running tool calls | MUST HAVE | Reliability |
| 13 | MCP Config Persistence — lưu/thêm/xóa cấu hình child MCP server vào orchestration.json via API | MUST HAVE | Management |

---

### 2.3 Details of User Stories

---

#### Business Flow

**Step 1:** On backend startup, ModuleRegistry calls `OrchestrationModule.initialize()`

**Step 2:** OrchestrationModule creates McpClientManager, calls `initializeAll()`

**Step 3:** McpClientManager reads `.code-intel/orchestration.json`, iterates configured servers

**Step 4:** For each server: select transport type → create MCP Client → connect with 10s timeout → fetch tools list

**Step 5:** For each tool discovered: store name→server mapping in `toolsToServer` Map, collect tool definitions

**Step 6:** Tool vectors generated and stored in `mcp_tools` table (via EmbeddingService + MemoryModule DB)

**Step 7:** Agent calls `find_tools("jira issue")` → query embedding generated → cosine similarity search → top-K results returned

**Step 8:** Agent calls `execute_dynamic_tool("jira_get_issue", {issue_key: "KSA-1"})` → check `toolsToServer` → proxy to Atlassian child server

**Step 9:** Child server executes tool → returns MCP result → OrchestrationModule forwards to agent

> **Note:** If a tool is NOT owned by any child server, `execute_dynamic_tool` falls back to checking ModuleRegistry internal handlers. This allows unified execution of both external and internal tools through a single interface.

---

#### STORY 1: Semantic Tool Discovery (find_tools)

> As an AI agent, I want to search available tools by natural language query so that I can find the right tool without memorizing exact tool names.

**Requirement Details:**

1. Accept a query string describing desired capability (e.g., "get jira issue details")
2. Generate query embedding via ONNX EmbeddingService (all-MiniLM-L6-v2)
3. Compute cosine similarity against all tool vectors in `mcp_tools` table
4. Return top-K results ranked by similarity score
5. Each result includes: tool name, description, input schema, similarity score
6. Optional threshold parameter to filter low-relevance results

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| query | string | Yes | Natural language description | "search jira issues" |
| threshold | number | No | Min similarity score (default 0.3) | 0.4 |
| top_k | number | No | Max results (default 5) | 10 |

**Acceptance Criteria:**

1. Given query "jira issue", results include jira_get_issue, jira_search with score > 0.5
2. Given query "export document", results include export_docx, embed_images
3. Results sorted by cosine similarity descending
4. Each result includes full inputSchema for agent to construct arguments
5. Search completes within 100ms (embedding generation + similarity)
6. Given threshold=0.6, only high-confidence matches returned

---

#### STORY 2: Dynamic Tool Execution (execute_dynamic_tool)

> As an AI agent, I want to execute any discovered tool by name so that I can call tools from child servers without knowing their transport details.

**Requirement Details:**

1. Accept tool name and arguments object
2. Route to correct destination: child server (via McpClientManager) or internal module (via ModuleRegistry)
3. Return MCP-format result (content array with type+text)
4. Handle errors gracefully: tool not found, server disconnected, execution timeout
5. Log all executions for debugging

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| toolName / tool_name | string | Yes | Tool to execute | "jira_get_issue" |
| arguments | object | Yes | Tool arguments | {"issue_key": "KSA-1"} |

**Acceptance Criteria:**

1. Given toolName="jira_get_issue" owned by atlassian server → proxied correctly
2. Given toolName="mem_search" (internal) → routed to MemoryModule handler
3. Given toolName="nonexistent_tool" → returns error "Tool not found"
4. Given child server disconnected → returns error with server name
5. Arguments passed as-is to child server (no transformation)
6. Both `toolName` and `tool_name` parameter names accepted (backward compat)

---

#### STORY 3: Child Server Connection

> As the system, I want to automatically connect to all configured child MCP servers on startup so that tools are available immediately.

**Requirement Details:**

1. Read `.code-intel/orchestration.json` for server configurations
2. Support three transport types: StreamableHTTP, SSE, stdio
3. Connect with 10-second timeout per server
4. Fetch tools list from each connected server
5. Skip disabled servers (config.disabled = true)
6. Skip self-reference (server named "code-intelligence")
7. Continue startup even if some servers fail to connect

**Configuration Schema:**

```json
{
  "mcpServers": {
    "atlassian": {
      "url": "http://localhost:3062/mcp",
      "type": "httpStream",
      "transportType": "httpStream",
      "disabled": false,
      "autoApprove": ["jira_get_issue", "jira_search"]
    },
    "markdown-exporter": {
      "command": "npx",
      "args": ["markdown-exporter-mcp"],
      "env": {}
    }
  }
}
```

**Acceptance Criteria:**

1. Given valid config with 3 servers → all 3 connected, tools fetched
2. Given 1 server unreachable → other 2 still connect successfully
3. Given server.disabled=true → skipped, no connection attempt
4. Given server named "code-intelligence" → skipped (self-reference)
5. Given connection timeout (>10s) → logged as error, continue with other servers
6. Given stdio server → spawns child process with specified command+args

---

#### STORY 4: Orchestration Status

> As an AI agent or system admin, I want to check the health status of all child MCP servers so that I can diagnose connectivity issues.

**Requirement Details:**

1. Report status of each configured child server
2. Include: server name, connection status (connected/disconnected/disabled), tool count
3. Include overall orchestration module status (ready/degraded/error)

**Acceptance Criteria:**

1. Given all servers connected → status="ready", each server shows "connected"
2. Given 1 server down → status="degraded", failed server shows "disconnected"
3. Given all servers down → status="error"
4. Each server entry includes tool count and transport type
5. Response is structured JSON for programmatic parsing

---

#### STORY 5: Tool Toggle

> As a system admin, I want to enable or disable individual tools at runtime so that I can control which capabilities are available to agents.

**Requirement Details:**

1. Toggle individual tool by name
2. Disabled tools not returned by `find_tools`
3. Disabled tools return error on `execute_dynamic_tool`
4. Toggle state persisted (survives module restart)
5. Useful for: limiting costs, security (disable write tools during readonly mode)

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| tool_name | string | Yes | Tool to toggle | "jira_create_issue" |
| enabled | boolean | Yes | Enable or disable | false |

**Acceptance Criteria:**

1. Given toggle_tool("jira_create_issue", false) → tool disabled
2. Given find_tools("jira create") after disable → jira_create_issue NOT in results
3. Given execute_dynamic_tool("jira_create_issue") after disable → error "Tool disabled"
4. Given toggle_tool("jira_create_issue", true) → tool re-enabled, appears in search

---

#### STORY 6: Connection Timeout Handling

> As the system, I want child server connections to timeout gracefully so that one slow server doesn't block entire system startup.

**Acceptance Criteria:**

1. Given server takes >10s to respond → timeout error logged
2. Other servers still connect successfully (parallel initialization)
3. Module reaches "ready" status even with failed connections
4. Status endpoint shows which servers timed out

---

#### STORY 7: Multi-Transport Support

> As the system, I want to connect to child servers using different transport protocols.

**Transport Selection Logic:**

| Config Fields | Transport |
|--------------|-----------|
| type="httpStream" OR transportType="httpStream" | StreamableHTTPClientTransport |
| type="sse" OR transportType="sse" | SSEClientTransport |
| command + args (no url) | StdioClientTransport |

**Acceptance Criteria:**

1. Given server with url + type="httpStream" → uses StreamableHTTPClientTransport
2. Given server with url + type="sse" → uses SSEClientTransport
3. Given server with command + args → spawns subprocess with StdioClientTransport
4. Given unknown transport type → logged warning, server skipped

---

#### STORY 8: Tool Routing

> As the system, I want execute_dynamic_tool to correctly route calls to the right destination.

**Routing Priority:**

```
execute_dynamic_tool(toolName, args)
  1. toolsToServer.has(toolName)? → McpClientManager.executeTool()
  2. registry.getToolHandlers().has(toolName)? → handler(args)
  3. Neither → error: "Tool {toolName} not found or not ready"
```

**Acceptance Criteria:**

1. Child server tools always routed to their server
2. Internal tools routed to their module handlers
3. Tool name conflict: child server takes priority
4. Error includes tool name in message for debugging

---

#### STORY 12: Execution Timeout

> As the system, I want tool executions to timeout so that hung child servers don't block agents indefinitely.

**Acceptance Criteria:**

1. Given tool execution takes >30s → timeout error returned
2. Error message includes: tool name, server name, "execution timeout"
3. Child server connection not killed on timeout (just the current call)
4. Agent can immediately retry or call different tool

---

#### STORY 13: MCP Config Persistence (Lưu cấu hình MCP vào server)

> As an admin or extension client, I want to add/update/remove child MCP server configurations via REST API so that new servers can be registered without manually editing orchestration.json.

**Requirement Details:**

1. REST API endpoints on backend server for CRUD operations on MCP server configs
2. Config stored in `.code-intel/orchestration.json` (same file used at startup)
3. On config write → persist to disk → trigger reconnect for affected server
4. Validate config before saving (required fields: url or command, transport type)
5. Support add, update, remove, and list operations
6. After save, McpClientManager reconnects the affected server (or disconnects if removed)

**API Endpoints:**

```
GET    /api/mcp-servers           — List all configured servers with status
GET    /api/mcp-servers/:name     — Get config for specific server
POST   /api/mcp-servers           — Add new server config
PUT    /api/mcp-servers/:name     — Update existing server config
DELETE /api/mcp-servers/:name     — Remove server config
POST   /api/mcp-servers/:name/reconnect — Force reconnect a server
```

**Data Fields (Server Config):**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| name | string | Yes | Unique server identifier | "atlassian" |
| url | string | Conditional | HTTP/SSE endpoint URL | "http://localhost:3062/mcp" |
| type | string | Yes | Transport type | "httpStream" / "sse" / "stdio" |
| command | string | Conditional | Command for stdio servers | "npx" |
| args | string[] | No | Command arguments | ["@atlassian/mcp-server"] |
| env | Record<string,string> | No | Environment variables | {"API_KEY": "..."} |
| disabled | boolean | No | Whether server is disabled | false |
| autoApprove | string[] | No | Tools auto-approved | ["jira_get_issue"] |

**Acceptance Criteria:**

1. Given POST /api/mcp-servers with valid config, then server added to orchestration.json AND connected
2. Given PUT /api/mcp-servers/atlassian with updated URL, then config updated AND server reconnected
3. Given DELETE /api/mcp-servers/atlassian, then server removed from config AND disconnected
4. Given invalid config (missing url AND command), then 400 error returned with validation details
5. Given server name already exists on POST, then 409 Conflict returned
6. Given reconnect endpoint called, then server disconnects then reconnects (refresh tools)
7. Config file written atomically (tmp + rename) to prevent corruption
8. Extension clients (F12-backend-connection) can call these APIs to manage servers remotely

**Error Handling:**

- Invalid JSON body → 400 with parse error
- Server name not found → 404
- Duplicate server name → 409
- File write permission error → 500 with descriptive message
- Reconnect failure → 200 with status "failed" + error details (non-blocking)

**Permission Model (RBAC):**

| Permission | Scope | Rules |
|-----------|-------|-------|
| **MCP_MANAGE** | Quản trị server config | `allowedServers` (per-server hoặc `*`), `allowAdd`, `allowRemove`, `allowEdit`, `allowRestart` |
| **MCP_ACCESS** | Truy cập tools | `allowedServers` (servers nào được xem), `allowedTools` (per-server tool whitelist) |

- `MCP_MANAGE` + `allowedServers: ["*"]` = full admin tất cả servers
- `MCP_MANAGE` + `allowedServers: ["atlassian"]` + `allowRestart: true` + `allowEdit: false` = chỉ restart atlassian, không sửa
- `MCP_ACCESS` + `allowedTools: {"atlassian": ["jira_get_issue"]}` = user chỉ gọi được `jira_get_issue`

---

## 3. Dependencies

| Dependency | Type | Description |
|------------|------|-------------|
| @modelcontextprotocol/sdk | Infrastructure | MCP client for connecting to child servers |
| StreamableHTTPClientTransport | Transport | HTTP-based MCP transport |
| SSEClientTransport | Transport | Server-Sent Events MCP transport |
| StdioClientTransport | Transport | stdio-based subprocess MCP transport |
| EmbeddingService (ONNX) | Internal | Generate tool description vectors |
| MemoryModule (F1) | Internal | Provides SQLite DB access for mcp_tools table |
| ModuleRegistry | Internal | Fallback routing for internal tool handlers |
| orchestration.json | Config | Child server definitions |
| better-sqlite3 | Infrastructure | Database for tool vector storage |
| pino | Infrastructure | Structured logging |

---

## 4. Stakeholders

| Role | Team | Responsibility |
|------|------|----------------|
| AI Agents (all 9) | Consumers | Discover and execute tools via orchestration |
| Child Server Operators | External | Maintain Atlassian, exporter, and other servers |
| System Admin | Operations | Configure orchestration.json, monitor health |
| SA (Solution Architect) | Design | Defines module boundaries and routing rules |

---

## 5. Risks and Assumptions

### 5.1 Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Child server unavailable at startup | Medium | High | Graceful degradation, continue without failed servers |
| Tool name collision (child vs internal) | Low | Low | Child server takes priority, log warning |
| ONNX embedding generation slow | Medium | Low | Cache embeddings, batch tool ingestion at startup |
| Child server returns malformed response | Medium | Medium | Wrap in try/catch, return structured error |
| Transport type mismatch | Low | Low | Clear error message, skip server |
| Too many tools causing slow search | Low | Medium | Vector index + limit results (top_k) |

### 5.2 Assumptions

- Child MCP servers conform to MCP protocol specification
- `orchestration.json` is manually maintained (no auto-discovery)
- At most 10 child servers configured (typical deployment)
- Each child server exposes ≤50 tools
- Total tool count across all servers: ≤200 tools
- ONNX embedding model loaded once and shared across modules
- Network latency to child servers: <100ms (co-located)

---

## 6. Non-Functional Requirements

| Category | Requirement | Target |
|----------|-------------|--------|
| Performance | find_tools latency (query → results) | < 100ms |
| Performance | execute_dynamic_tool routing overhead | < 10ms |
| Performance | Child server connection (per server) | < 10s timeout |
| Performance | Module initialization (all servers) | < 30s total |
| Scalability | Max child servers | 10 |
| Scalability | Max total tools across all servers | 200 |
| Reliability | Module ready even with partial failures | Yes (degraded mode) |
| Reliability | Execution timeout per tool call | 30s default |
| Availability | Zero-downtime tool toggle | Yes |
| Maintainability | Add new child server | Config change only (no code) |
| Maintainability | Add new transport type | Implement transport class + config mapping |
| Security | Tool execution isolation | Each call isolated, no shared state |
| Security | Disabled tools cannot execute | Enforced at routing layer |

---

## 7. Appendix

### Glossary

| Term | Definition |
|------|------------|
| MCP | Model Context Protocol — standard for AI tool registration and execution |
| Child Server | External MCP server providing tools (e.g., Atlassian MCP server) |
| Orchestration | Managing multiple child servers as a unified tool surface |
| Tool Discovery | Finding available tools by semantic similarity search |
| Tool Routing | Directing execution to the correct server based on ownership |
| StreamableHTTP | HTTP-based MCP transport with streaming support |
| SSE | Server-Sent Events — unidirectional streaming |
| stdio | Standard I/O — communicate via stdin/stdout of child process |
| Vector Embedding | Dense float array representing text semantics |
| Cosine Similarity | Similarity measure between two vectors (0.0 to 1.0) |
| ONNX | Open Neural Network Exchange — runtime for embedding models |
| ModuleRegistry | SA4E plugin system for registering internal modules |

### Tool API Surface (4 Core Tools)

| Tool | Category | Description |
|------|----------|-------------|
| orchestration_status | Monitoring | Get health status of all child MCP servers |
| find_tools | Discovery | Search available tools by semantic query |
| execute_dynamic_tool | Execution | Execute a dynamically discovered tool by name |
| toggle_tool | Management | Enable or disable a tool at runtime |

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Business Flow | [business-flow.png](diagrams/business-flow.png) | [business-flow.drawio](diagrams/business-flow.drawio) |
| 2 | Use Case Diagram | [use-case.png](diagrams/use-case.png) | [use-case.drawio](diagrams/use-case.drawio) |
