# Functional Specification Document (FSD)

## SA4E Orchestration — F3-ORCHESTRATION

---

## Document Information

| Field | Value |
|-------|-------|
| Feature ID | F3-ORCHESTRATION |
| Title | Orchestration Module — Functional Specification |
| Author | BA Agent + TA Agent |
| Version | 1.0 |
| Date | 2025-07-03 |
| Status | Draft |
| Related BRD | BRD-v1-F3-ORCHESTRATION.docx |
| Architecture Pattern | AI Agent System |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-07-03 | BA + TA | Initial FSD — business + technical sections |

---

## 1. System Context

### 1.1 System Context Diagram

![System Context](diagrams/system-context.png)

### 1.2 System Boundaries

The Orchestration module operates within the SA4E backend server:

| Interface | Direction | Protocol | Description |
|-----------|-----------|----------|-------------|
| AI Agents → Orchestration | Inbound | MCP Tool Call | Agents invoke find_tools, execute_dynamic_tool |
| Orchestration → Child Servers | Outbound | MCP (HTTP/SSE/stdio) | Proxy tool execution to external servers |
| Orchestration → MemoryModule | Internal | Direct function call | Access mcp_tools table for vector search |
| Orchestration → EmbeddingService | Internal | Direct function call | Generate query embeddings |
| Orchestration → ModuleRegistry | Internal | Direct function call | Fallback tool handler routing |

---

## 2. Use Cases

### UC-01: Semantic Tool Discovery (find_tools)

| Field | Value |
|-------|-------|
| ID | UC-01 |
| Name | Semantic Tool Discovery |
| Actor | AI Agent |
| Priority | MUST HAVE |
| Precondition | Module initialized, mcp_tools table populated |
| Postcondition | Agent receives ranked list of relevant tools |

#### Main Flow

| Step | Actor | Action |
|------|-------|--------|
| 1 | Agent | Calls `find_tools(query="jira issue", threshold=0.4, top_k=5)` |
| 2 | System | Receives query string |
| 3 | System | Generates query embedding via EmbeddingService (ONNX all-MiniLM-L6-v2) |
| 4 | System | Loads all tool vectors from `mcp_tools` table |
| 5 | System | Computes cosine similarity between query vector and each tool vector |
| 6 | System | Sorts by score descending, filters by threshold, takes top_k |
| 7 | System | Returns tool list with name, description, inputSchema, score |

#### Alternative Flow — Empty Results

| Step | Actor | Action |
|------|-------|--------|
| 5a | System | All scores below threshold |
| 5b | System | Returns empty tools array with original query |

#### Alternative Flow — Embedding Service Unavailable

| Step | Actor | Action |
|------|-------|--------|
| 3a | System | EmbeddingService fails to generate embedding |
| 3b | System | Logs error, returns empty results |

#### Exception Flow — DB Access Error

| Step | Actor | Action |
|------|-------|--------|
| 4a | System | Cannot access mcp_tools table (DB locked, corrupted) |
| 4b | System | Logs error with context, returns empty results |

---

### UC-02: Dynamic Tool Execution (execute_dynamic_tool)

| Field | Value |
|-------|-------|
| ID | UC-02 |
| Name | Dynamic Tool Execution |
| Actor | AI Agent |
| Priority | MUST HAVE |
| Precondition | Tool exists (child server or internal module) |
| Postcondition | Tool result returned to agent |

#### Main Flow — Child Server Tool

| Step | Actor | Action |
|------|-------|--------|
| 1 | Agent | Calls `execute_dynamic_tool(toolName="jira_get_issue", arguments={issue_key: "KSA-1"})` |
| 2 | System | Extracts toolName (supports both `toolName` and `tool_name` fields) |
| 3 | System | Checks McpClientManager.ownsTool(toolName) → true |
| 4 | System | Proxies request to child server via MCP client.callTool() |
| 5 | Child Server | Executes tool with provided arguments |
| 6 | Child Server | Returns MCP result (content + isError) |
| 7 | System | Forwards result to agent |

#### Alternative Flow — Internal Module Tool

| Step | Actor | Action |
|------|-------|--------|
| 3a | System | McpClientManager.ownsTool() → false |
| 3b | System | Checks ModuleRegistry.getToolHandlers().get(toolName) |
| 3c | System | Finds internal handler → executes with arguments |
| 3d | System | Returns handler result to agent |

#### Exception Flow — Tool Not Found

| Step | Actor | Action |
|------|-------|--------|
| 3x | System | ownsTool=false AND no internal handler |
| 3y | System | Returns `{isError: true, content: "Tool {name} not found or not ready"}` |

#### Exception Flow — Child Server Disconnected

| Step | Actor | Action |
|------|-------|--------|
| 4a | System | MCP client for target server is disconnected |
| 4b | System | Returns `{isError: true, content: "Error proxying tool {name}: {message}"}` |

#### Exception Flow — Execution Error

| Step | Actor | Action |
|------|-------|--------|
| 5a | Child Server | Tool throws error |
| 5b | System | Catches error, logs with tool name + args + server |
| 5c | System | Returns `{isError: true, content: "Error executing tool {name}: {message}"}` |

---

### UC-03: Child Server Connection (Startup)

| Field | Value |
|-------|-------|
| ID | UC-03 |
| Name | Child Server Connection |
| Actor | System (Startup) |
| Priority | MUST HAVE |
| Precondition | orchestration.json exists with server configs |
| Postcondition | Connected servers have tools fetched and mapped |

#### Main Flow

| Step | Actor | Action |
|------|-------|--------|
| 1 | System | Reads orchestration.json from `.code-intel/` directory |
| 2 | System | Parses JSON, iterates `mcpServers` object entries |
| 3 | System | For each server: checks disabled flag and self-reference |
| 4 | System | Determines transport type from config |
| 5 | System | Creates MCP Client instance |
| 6 | System | Connects with 10s timeout (Promise.race) |
| 7 | System | Calls client.listTools() → receives tool definitions |
| 8 | System | For each tool: stores name→server in toolsToServer Map |
| 9 | System | Stores tool definitions in proxiedTools array |
| 10 | System | Logs: "Connected to {server}, {N} tools imported" |

#### Alternative Flow — Server Disabled

| Step | Actor | Action |
|------|-------|--------|
| 3a | System | server.disabled === true |
| 3b | System | Logs "Skipping disabled server", continues to next |

#### Alternative Flow — Self Reference

| Step | Actor | Action |
|------|-------|--------|
| 3c | System | serverName === "code-intelligence" |
| 3d | System | Skips silently (avoids recursive loop) |

#### Exception Flow — Connection Timeout

| Step | Actor | Action |
|------|-------|--------|
| 6a | System | Promise.race timeout wins (>10s) |
| 6b | System | Logs "Failed to connect to {server}: Connection timeout" |
| 6c | System | Continues with remaining servers |

#### Exception Flow — Config File Missing

| Step | Actor | Action |
|------|-------|--------|
| 1a | System | orchestration.json not found at expected path |
| 1b | System | Logs warning "orchestration.json not found, skipping child servers" |
| 1c | System | Module still initializes (no child servers, only internal tools) |

---

### UC-04: Orchestration Status

| Field | Value |
|-------|-------|
| ID | UC-04 |
| Name | Orchestration Status |
| Actor | AI Agent / Admin |
| Priority | MUST HAVE |
| Precondition | Module initialized |
| Postcondition | Status report returned |

#### Main Flow

| Step | Actor | Action |
|------|-------|--------|
| 1 | Actor | Calls `orchestration_status()` |
| 2 | System | Collects status of all configured servers |
| 3 | System | Returns JSON: `{servers: [...], status: "ready"}` |

---

### UC-05: Tool Toggle

| Field | Value |
|-------|-------|
| ID | UC-05 |
| Name | Tool Toggle |
| Actor | System Admin |
| Priority | SHOULD HAVE |
| Precondition | Tool exists in registry |
| Postcondition | Tool enabled/disabled |

#### Main Flow

| Step | Actor | Action |
|------|-------|--------|
| 1 | Admin | Calls `toggle_tool(tool_name="jira_create_issue", enabled=false)` |
| 2 | System | Updates tool state in registry |
| 3 | System | Returns confirmation: "Tool {name} enabled={value}" |

---

### UC-06: MCP Config Persistence (Save Server Config)

| Field | Value |
|-------|-------|
| ID | UC-06 |
| Name | MCP Config Persistence |
| Actor | Admin / Extension Client |
| Priority | MUST HAVE |
| Precondition | Backend server running |
| Postcondition | Config persisted to orchestration.json, server connected/disconnected |

#### Main Flow — Add Server

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Admin | POST /api/mcp-servers | Send server config JSON |
| 2 | | Validate config | Required: name, type, url or command |
| 3 | | Check duplicate name | 409 if exists |
| 4 | | Read orchestration.json | Load current config |
| 5 | | Merge new server | Add to mcpServers object |
| 6 | | Write atomically | tmp + rename |
| 7 | | Connect new server | McpClientManager |
| 8 | | Fetch tools | Populate registry |
| 9 | | Return 201 | Server status + tool count |

#### Main Flow — Update Server

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Admin | PUT /api/mcp-servers/:name | Updated config |
| 2 | | Validate + check exists | 404 if not found |
| 3 | | Disconnect existing | Close client |
| 4 | | Update config + write | Atomic persist |
| 5 | | Reconnect | New config applied |
| 6 | | Return 200 | New status |

#### Main Flow — Remove Server

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Admin | DELETE /api/mcp-servers/:name | Request removal |
| 2 | | Check exists | 404 if not found |
| 3 | | Disconnect + remove tools | Cleanup |
| 4 | | Remove from config + write | Persist |
| 5 | | Return 200 | Confirmation |

#### Exception Flows

| ID | Condition | Steps |
|----|-----------|-------|
| EF-01 | Invalid JSON body | 400 with validation errors |
| EF-02 | Missing url AND command | 400 "url or command required" |
| EF-03 | Duplicate name on POST | 409 "Server already exists" |
| EF-04 | File write error | 500 "Cannot write config" |
| EF-05 | Name = "code-intelligence" | 403 "Cannot modify self-reference" |

#### Business Rules

| Rule ID | Rule |
|---------|------|
| BR-11 | Atomic write (tmp + rename) for crash safety |
| BR-12 | "code-intelligence" name is reserved (cannot CRUD) |
| BR-13 | Connection failure does NOT rollback config save |
| BR-14 | GET /api/mcp-servers includes live status per server |
| BR-15 | disabled=true servers are saved but NOT connected |

#### API Contract

**POST /api/mcp-servers**

```json
// Request
{ "name": "atlassian", "url": "http://localhost:3062/mcp", "type": "httpStream", "autoApprove": ["jira_get_issue"] }

// Response 201
{ "name": "atlassian", "status": "connected", "tools": 12, "transport": "httpStream" }
```

**GET /api/mcp-servers**

```json
// Response 200
{ "servers": [
  { "name": "atlassian", "status": "connected", "tools": 12, "transport": "httpStream" },
  { "name": "exporter", "status": "disconnected", "tools": 0, "transport": "stdio" }
]}
```

**DELETE /api/mcp-servers/:name**

```json
// Response 200
{ "removed": "atlassian", "tools_removed": 12 }
```

---

## 3. Business Rules

| ID | Rule | Description |
|----|------|-------------|
| BR-01 | Child Server Priority | If tool name exists in both child server and internal registry, child server takes priority |
| BR-02 | Graceful Degradation | Module must reach "ready" status even if all child servers fail to connect |
| BR-03 | Parallel Initialization | All server connections attempted in parallel (Promise.allSettled) |
| BR-04 | Self-Skip | Server named "code-intelligence" always skipped to prevent recursion |
| BR-05 | Disabled Server Skip | Servers with `disabled: true` never attempted |
| BR-06 | Backward Compat | Both `toolName` and `tool_name` accepted in execute_dynamic_tool |
| BR-07 | No Transform | Arguments passed to child servers without modification |
| BR-08 | Threshold Filter | find_tools with threshold only returns tools above the score |
| BR-09 | Top-K Default | Default top_k=5 if not specified |
| BR-10 | Connection Timeout | 10 seconds per server connection attempt |

---

## 4. API Specifications

### 4.1 MCP Tool: find_tools

**Request:**

```json
{
  "name": "find_tools",
  "arguments": {
    "query": "search jira issues",
    "threshold": 0.4,
    "top_k": 5
  }
}
```

**Response (Success):**

```json
{
  "content": [{
    "type": "text",
    "text": "{\"tools\":[{\"name\":\"jira_search\",\"description\":\"Search Jira issues using JQL\",\"schema\":{...},\"score\":0.87},{\"name\":\"jira_get_issue\",\"description\":\"Get issue details\",\"schema\":{...},\"score\":0.72}],\"query\":\"search jira issues\"}"
  }],
  "isError": false
}
```

### 4.2 MCP Tool: execute_dynamic_tool

**Request:**

```json
{
  "name": "execute_dynamic_tool",
  "arguments": {
    "toolName": "jira_get_issue",
    "arguments": {
      "issue_key": "KSA-1",
      "fields": "summary,description,status"
    }
  }
}
```

**Response (Success):**

```json
{
  "content": [{
    "type": "text",
    "text": "{\"key\":\"KSA-1\",\"summary\":\"Feature X\",\"status\":\"To Do\"}"
  }],
  "isError": false
}
```

**Response (Error — Tool Not Found):**

```json
{
  "content": [{
    "type": "text",
    "text": "Tool nonexistent_tool not found or not ready."
  }],
  "isError": true
}
```

### 4.3 MCP Tool: orchestration_status

**Request:**

```json
{
  "name": "orchestration_status",
  "arguments": {}
}
```

**Response:**

```json
{
  "content": [{
    "type": "text",
    "text": "{\"servers\":[{\"name\":\"atlassian\",\"status\":\"connected\",\"tools\":12,\"transport\":\"httpStream\"},{\"name\":\"exporter\",\"status\":\"disconnected\",\"tools\":0,\"transport\":\"stdio\"}],\"status\":\"degraded\"}"
  }],
  "isError": false
}
```

### 4.4 MCP Tool: toggle_tool

**Request:**

```json
{
  "name": "toggle_tool",
  "arguments": {
    "tool_name": "jira_create_issue",
    "enabled": false
  }
}
```

**Response:**

```json
{
  "content": [{
    "type": "text",
    "text": "Tool jira_create_issue enabled=false"
  }],
  "isError": false
}
```

---

## 5. Data Model

### 5.1 mcp_tools Table

| Column | Type | Description |
|--------|------|-------------|
| name | TEXT PK | Tool name (unique) |
| description | TEXT | Tool description |
| schema_json | TEXT | JSON-serialized inputSchema |
| vector | BLOB | Float32Array embedding (384 dimensions) |
| server_name | TEXT | Owning child server (or 'internal') |
| enabled | INTEGER | 1=enabled, 0=disabled |
| created_at | TEXT | ISO timestamp |

### 5.2 In-Memory State (McpClientManager)

| Field | Type | Description |
|-------|------|-------------|
| clients | Map<string, Client> | Active MCP client connections |
| toolsToServer | Map<string, string> | Tool name → server name mapping |
| proxiedTools | ToolDefinition[] | All discovered tool definitions |

### 5.3 Configuration Schema (orchestration.json)

```typescript
interface OrchestrationConfig {
  mcpServers: Record<string, ServerConfig>;
}

interface ServerConfig {
  // HTTP-based servers
  url?: string;
  type?: 'httpStream' | 'sse';
  transportType?: 'httpStream' | 'sse';
  
  // stdio-based servers
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  
  // Common
  disabled?: boolean;
  autoApprove?: string[];
}
```

---

## 6. State Diagram

### 6.1 Module Lifecycle States

![State Diagram](diagrams/state-module.png)

| State | Description |
|-------|-------------|
| initializing | Module created, connecting to servers |
| ready | At least one server connected (or no servers configured) |
| degraded | Some servers connected, some failed |
| stopped | Module shutdown, all connections closed |

### 6.2 Connection States (Per Server)

| State | Transitions To | Trigger |
|-------|---------------|---------|
| connecting | connected, failed | Transport established / timeout |
| connected | disconnected | Server drops connection |
| failed | connecting | Reconnection attempt |
| disconnected | connecting | Reconnection trigger |
| disabled | (terminal) | Config disabled=true |

---

## 7. Sequence Diagrams

### 7.1 Tool Discovery Flow

![Sequence — Tool Discovery](diagrams/sequence-discovery.png)

### 7.2 Tool Execution Flow

![Sequence — Tool Execution](diagrams/sequence-execution.png)

---

## 8. Integration Requirements

### 8.1 Memory Module Integration

The Orchestration module depends on Memory Module (F1) for database access:

```typescript
// Access pattern
const memoryModule = this.registry.getModule('memory') as MemoryModule;
const db = memoryModule.getEngine().getDb();
const rows = db.prepare('SELECT * FROM mcp_tools').all();
```

**Requirements:**
- MemoryModule must be initialized before OrchestrationModule (module order)
- `mcp_tools` table must exist with correct schema
- Concurrent read access supported (SQLite WAL mode)

### 8.2 Embedding Service Integration

```typescript
// Vector generation
const queryVector = await EmbeddingService.getInstance().generateEmbedding(query);
const similarity = EmbeddingService.getInstance().cosineSimilarity(queryVector, toolVector);
```

**Requirements:**
- EmbeddingService singleton initialized with ONNX model
- Model: all-MiniLM-L6-v2 (384-dimensional output)
- Generation latency: <50ms per query

### 8.3 MCP SDK Integration

```typescript
// Child server connection
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const client = new Client({ name: 'code-intel-orchestrator', version: '1.0.0' }, { capabilities: {} });
await client.connect(transport);
const tools = await client.listTools();
await client.callTool({ name: toolName, arguments: args });
```

---

## 9. Error Handling

| Error Code | Description | Response |
|-----------|-------------|----------|
| TOOL_NOT_FOUND | Tool name not in any registry | `{isError: true, text: "Tool X not found or not ready"}` |
| SERVER_DISCONNECTED | Target child server is offline | `{isError: true, text: "Error proxying tool X: Client disconnected"}` |
| EXECUTION_ERROR | Tool execution threw exception | `{isError: true, text: "Error executing tool X: {message}"}` |
| CONNECTION_TIMEOUT | Server connect took >10s | Logged, server skipped |
| REGISTRY_UNAVAILABLE | ModuleRegistry not injected | `{isError: true, text: "Registry not available"}` |
| EMBEDDING_FAILED | ONNX model inference failed | Returns empty results (graceful) |
| CONFIG_PARSE_ERROR | orchestration.json invalid JSON | Logged, no child servers loaded |
| DB_ACCESS_ERROR | Cannot read mcp_tools | Logged, returns empty find_tools results |

---

## 10. Non-Functional Requirements

### 10.1 Performance

| Metric | Target | Measurement |
|--------|--------|-------------|
| find_tools end-to-end | < 100ms | Time from call to response |
| Embedding generation | < 50ms | EmbeddingService.generateEmbedding() |
| Cosine similarity (200 tools) | < 20ms | Full scan + sort |
| execute_dynamic_tool routing | < 10ms | Excluding actual tool execution |
| Module startup (3 servers) | < 15s | All connections settled |

### 10.2 Reliability

| Scenario | Behavior |
|----------|----------|
| 1 of 3 servers down | Module=ready, down server=disconnected |
| All servers down | Module=ready (internal tools still work) |
| DB locked during find_tools | Returns empty (graceful degradation) |
| Child server returns error | Error forwarded to agent (not swallowed) |

### 10.3 Token Efficiency (AI Agent Pattern)

| Operation | Token Impact |
|-----------|-------------|
| find_tools response (5 tools) | ~500 tokens |
| execute_dynamic_tool response | Varies by child tool (pass-through) |
| orchestration_status | ~200 tokens |

---

## 11. Open Issues

| # | Issue | Impact | Proposed Resolution |
|---|-------|--------|-------------------|
| 1 | No automatic reconnection to failed servers | Medium | Implement health check polling (30s interval) |
| 2 | Tool vectors not updated when child server tools change | Low | Add re-fetch mechanism on connection re-establish |
| 3 | No rate limiting on execute_dynamic_tool | Medium | Consider per-server rate limits for paid APIs |
| 4 | autoApprove field unused in current implementation | Low | Document or implement auto-approval logic |

---

## 12. Appendix

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | System Context | [system-context.png](diagrams/system-context.png) | [system-context.drawio](diagrams/system-context.drawio) |
| 2 | Sequence — Discovery | [sequence-discovery.png](diagrams/sequence-discovery.png) | [sequence-discovery.drawio](diagrams/sequence-discovery.drawio) |
| 3 | Sequence — Execution | [sequence-execution.png](diagrams/sequence-execution.png) | [sequence-execution.drawio](diagrams/sequence-execution.drawio) |
| 4 | State — Module Lifecycle | [state-module.png](diagrams/state-module.png) | [state-module.drawio](diagrams/state-module.drawio) |
