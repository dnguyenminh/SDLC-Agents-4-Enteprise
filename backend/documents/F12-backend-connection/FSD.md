# Functional Specification Document (FSD)

## Kiro IDE Extension — F12: Backend Connection & Lifecycle

---

## Document Information

| Field | Value |
|-------|-------|
| Feature ID | F12 |
| Title | Backend Connection & Lifecycle |
| Author | BA Agent + TA Agent |
| Version | 1.0 |
| Date | 2025-07-03 |
| Status | Draft |
| Related BRD | BRD-v1-F12-backend-connection.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-07-03 | BA + TA | Initial — functional specification from source code analysis |

---

## 1. System Context

### 1.1 System Context Diagram

![System Context](diagrams/system-context.png)

### 1.2 System Overview

The Backend Connection module sits between the VS Code extension host and the remote Kiro backend service. It provides:

1. **Connection lifecycle management** — deterministic state machine with auto-reconnect
2. **MCP protocol bridge** — local HTTP server that translates between local tools and remote MCP backend
3. **Configuration management** — watch and react to config changes without restart
4. **Local tool execution** — fast-path for filesystem operations without backend roundtrip

### 1.3 External Interfaces

| Interface | Direction | Protocol | Description |
|-----------|-----------|----------|-------------|
| Backend /health | Extension → Backend | HTTP GET | Health check endpoint |
| Backend /mcp | Extension → Backend | StreamableHTTP (MCP) | MCP session for tool calls |
| Local :9181 /mcp | IDE tools → Extension | HTTP POST (JSON-RPC) | Local MCP wrapper server |
| Local :9181 /health | IDE tools → Extension | HTTP GET | Wrapper health check |
| VS Code Settings | Extension ← VS Code | API | Configuration (URL, port, intervals) |
| .kiro/settings/mcp.json | Extension ← Filesystem | File watch | MCP server configuration |
| GitHub Releases | Extension → GitHub | HTTPS | Asset downloads |

---

## 2. Use Cases

### UC-1: Connect to Backend

| Field | Value |
|-------|-------|
| ID | UC-1 |
| Name | Connect to Backend |
| Actor | Extension (automatic on activate) |
| Precondition | Backend URL configured, AuthManager initialized |
| Postcondition | State = CONNECTED, HealthChecker running, wrapper server listening |

**Main Flow:**

| Step | Actor | Action |
|------|-------|--------|
| 1 | Extension | Reads backend URL from `kiroSdlc.backendUrl` setting |
| 2 | ConnectionManager | Transitions state to CONNECTING |
| 3 | HttpClient | Sends GET to `{backendUrl}/health` (timeout: 5s) |
| 4 | Backend | Returns 200 OK |
| 5 | ConnectionManager | Transitions state to CONNECTED, resets reconnectAttempts=0 |
| 6 | HealthChecker | Starts periodic polling (interval from config) |
| 7 | RemoteBackendClient | Creates MCP Client with StreamableHTTPClientTransport |
| 8 | RemoteBackendClient | Connects MCP client to `{backendUrl}/mcp` with auth token |
| 9 | RemoteBackendClient | Starts local HTTP server on 127.0.0.1:{port} |
| 10 | RemoteBackendClient | Sets status to "running" |

**Alternative Flow — Health Check Fails:**

| Step | Actor | Action |
|------|-------|--------|
| 3a | HttpClient | Returns non-200 or timeout |
| 4a | ConnectionManager | Transitions to DISCONNECTED |
| 5a | ConnectionManager | Schedules reconnect (delay = reconnectDelays[attempts]) |
| 6a | ConnectionManager | Increments reconnectAttempts |

**Exception Flow — MCP Session Fails:**

| Step | Actor | Action |
|------|-------|--------|
| 8a | MCP Client | Transport connection fails (network error, auth rejection) |
| 9a | RemoteBackendClient | Sets status to "crashed" |
| 10a | RemoteBackendClient | Logs error to OutputChannel |
| 11a | RemoteBackendClient | Throws error to caller |

---

### UC-2: Auto-Reconnect

| Field | Value |
|-------|-------|
| ID | UC-2 |
| Name | Auto-Reconnect with Exponential Backoff |
| Actor | ConnectionManager (automatic) |
| Trigger | Health check failure OR connection drop |
| Precondition | State was CONNECTED |
| Postcondition | Either reconnected (CONNECTED) or max attempts exhausted |

**Main Flow:**

| Step | Actor | Action |
|------|-------|--------|
| 1 | HealthChecker | Fires onHealthFail event |
| 2 | ConnectionManager | Stops HealthChecker |
| 3 | ConnectionManager | Transitions to DISCONNECTED |
| 4 | ConnectionManager | Checks reconnectAttempts < maxReconnectAttempts (5) |
| 5 | ConnectionManager | Calculates delay = reconnectDelays[attempts] |
| 6 | ConnectionManager | Sets reconnectTimer = setTimeout(connect, delay) |
| 7 | ConnectionManager | Increments reconnectAttempts |
| 8 | (after delay) | Executes UC-1 (Connect to Backend) |

**Alternative Flow — Max Attempts Reached:**

| Step | Actor | Action |
|------|-------|--------|
| 4a | ConnectionManager | reconnectAttempts >= 5 |
| 5a | VS Code | Shows error notification: "Cannot connect to Kiro backend" |
| 6a | ConnectionManager | Remains in DISCONNECTED state (no further retries) |

**Alternative Flow — Reconnect Succeeds:**

| Step | Actor | Action |
|------|-------|--------|
| 8a | ConnectionManager | Health check passes |
| 9a | ConnectionManager | Resets reconnectAttempts to 0 |
| 10a | ConnectionManager | Resumes normal CONNECTED operations |

---

### UC-3: Health Check

| Field | Value |
|-------|-------|
| ID | UC-3 |
| Name | Periodic Health Check |
| Actor | HealthChecker (automatic) |
| Precondition | State = CONNECTED, timer running |
| Postcondition | Health confirmed or failure escalated |

**Main Flow:**

| Step | Actor | Action |
|------|-------|--------|
| 1 | Timer | setInterval fires at configured interval |
| 2 | HealthChecker | Calls httpClient.healthCheck() |
| 3 | HttpClient | Sends GET {backendUrl}/health |
| 4 | Backend | Returns 200 |
| 5 | HealthChecker | No action (healthy) |

**Exception Flow — Health Failure:**

| Step | Actor | Action |
|------|-------|--------|
| 4a | Backend | Returns non-200 OR request times out OR network error |
| 5a | HealthChecker | Iterates failListeners, fires each callback |
| 6a | ConnectionManager | Receives callback, triggers UC-2 (Auto-Reconnect) |

---

### UC-4: Proxy MCP Request

| Field | Value |
|-------|-------|
| ID | UC-4 |
| Name | Proxy MCP Request via Local Wrapper |
| Actor | MCP Client (local tool, IDE) |
| Precondition | Wrapper server running, backend connected |
| Postcondition | JSON-RPC response returned |

**Main Flow:**

| Step | Actor | Action |
|------|-------|--------|
| 1 | MCP Client | Sends POST /mcp with JSON-RPC body |
| 2 | Wrapper | Validates Content-Type = application/json |
| 3 | Wrapper | Reads body (max 1MB) |
| 4 | Wrapper | Parses JSON-RPC, assigns ID if missing |
| 5 | Wrapper | Checks if method = "tools/call" AND tool is LOCAL |
| 6 | Wrapper | Tool is NOT local — forwards to backend MCP client |
| 7 | MCP Client (backend) | Sends request via StreamableHTTP transport |
| 8 | Backend | Processes and returns result |
| 9 | Wrapper | Wraps in JSON-RPC response, returns to caller |

**Alternative Flow — Local Tool:**

| Step | Actor | Action |
|------|-------|--------|
| 5a | Wrapper | Tool name is in LOCAL_TOOLS set |
| 6a | Wrapper | Calls executeLocalTool(name, args) |
| 7a | LocalTools | Executes locally (e.g., writes file) |
| 8a | Wrapper | Returns result as JSON-RPC response |

**Alternative Flow — Argument Wrapping (mem_ingest_file):**

| Step | Actor | Action |
|------|-------|--------|
| 5b | Wrapper | Tool is "mem_ingest_file" (not local, but needs wrapping) |
| 6b | Wrapper | Calls wrapToolArguments — reads local file, injects content |
| 7b | Wrapper | Forwards enriched request to backend |

**Exception Flow — Backend Not Connected:**

| Step | Actor | Action |
|------|-------|--------|
| 5c | Wrapper | mcpClient is null |
| 6c | Wrapper | Returns JSON-RPC error: code -32002, "Backend not connected" |

**Exception Flow — Invalid Request:**

| Step | Actor | Action |
|------|-------|--------|
| 2a | Wrapper | Content-Type is not application/json |
| 3a | Wrapper | Returns 415 with JSON-RPC parse error |

---

### UC-5: Execute Local Tool

| Field | Value |
|-------|-------|
| ID | UC-5 |
| Name | Execute Local Tool |
| Actor | Wrapper Server (internal) |
| Precondition | Tool name in LOCAL_TOOLS set |
| Postcondition | File written/appended locally |

**Main Flow (stream_write_file):**

| Step | Actor | Action |
|------|-------|--------|
| 1 | Wrapper | Identifies tool as "stream_write_file" |
| 2 | executeLocalTool | Extracts path, content, mode from args |
| 3 | executeLocalTool | Validates required args (path, content) |
| 4 | fs | Creates directory recursively if not exists |
| 5 | fs | Writes (or appends) content to file |
| 6 | executeLocalTool | Returns success: `{isError: false, content: [{type:"text", text:"Wrote file: {path}"}]}` |

**Exception Flow — Invalid Args:**

| Step | Actor | Action |
|------|-------|--------|
| 3a | executeLocalTool | path or content missing/invalid |
| 4a | executeLocalTool | Returns `{isError: true, content: [{type:"text", text:"Invalid arguments"}]}` |

**Exception Flow — Write Failure:**

| Step | Actor | Action |
|------|-------|--------|
| 5a | fs | Throws error (permission denied, disk full) |
| 6a | executeLocalTool | Catches error, returns `{isError: true, content: [{type:"text", text:"Failed to write: {error}"}]}` |

---

### UC-6: Watch Config Changes

| Field | Value |
|-------|-------|
| ID | UC-6 |
| Name | Watch Configuration Changes |
| Actor | ConfigWatcher (automatic) |
| Precondition | Extension active, workspace folder set |
| Postcondition | Server reconnected with new config OR stopped |

**Main Flow:**

| Step | Actor | Action |
|------|-------|--------|
| 1 | VS Code | FileSystemWatcher detects change to .kiro/settings/mcp.json |
| 2 | ConfigWatcher | Checks suppressUntil (self-write suppression) |
| 3 | ConfigWatcher | Debounces (clears existing timer, sets 500ms timeout) |
| 4 | ConfigWatcher | After 500ms, computes new hash of code-intelligence section |
| 5 | ConfigWatcher | Compares with lastConfigHash |
| 6 | ConfigWatcher | Hash differs — updates lastConfigHash |
| 7 | ConfigWatcher | Reads code-intelligence config |
| 8 | ConfigWatcher | Config valid and not disabled → calls mcpManager.reconnect() |

**Alternative Flow — Hash Unchanged:**

| Step | Actor | Action |
|------|-------|--------|
| 5a | ConfigWatcher | Hash matches lastConfigHash |
| 6a | ConfigWatcher | Logs "Config unchanged", takes no action |

**Alternative Flow — Config Disabled:**

| Step | Actor | Action |
|------|-------|--------|
| 7a | ConfigWatcher | config.disabled === true |
| 8a | ConfigWatcher | Calls mcpManager.disconnect() |

**Alternative Flow — File Deleted:**

| Step | Actor | Action |
|------|-------|--------|
| 1a | VS Code | onDidDelete event fires |
| 2a | ConfigWatcher | Debounces 500ms |
| 3a | ConfigWatcher | Resets lastConfigHash to "" |
| 4a | ConfigWatcher | Calls mcpManager.disconnect() |

**Alternative Flow — Self-Write Suppression:**

| Step | Actor | Action |
|------|-------|--------|
| 2a | ConfigWatcher | Date.now() < suppressUntil |
| 3a | ConfigWatcher | Returns immediately (ignores event) |

---

### UC-7: Build MCP Config

| Field | Value |
|-------|-------|
| ID | UC-7 |
| Name | Build and Write MCP Configuration |
| Actor | Extension (during setup/injection) |
| Precondition | Variant selected, workspace folder known |
| Postcondition | mcp.json updated, orchestration.json created if needed |

**Main Flow:**

| Step | Actor | Action |
|------|-------|--------|
| 1 | McpInjector | Calls resolveConfig(variant, root) |
| 2 | resolveConfig | Replaces ${mcpServersDir} → actual path |
| 3 | resolveConfig | Replaces ${workspaceFolder} → root |
| 4 | resolveConfig | Injects env vars (CODE_INTEL_WORKSPACE, etc.) |
| 5 | McpInjector | Calls writeMcpConfig(root, resolvedConfig) |
| 6 | writeMcpConfig | Reads existing mcp.json (or creates empty structure) |
| 7 | writeMcpConfig | Merges new config into mcpServers.code-intelligence |
| 8 | writeMcpConfig | Writes updated JSON to .kiro/settings/mcp.json |
| 9 | McpInjector | Calls writeDefaultOrchestrationConfig(root) |
| 10 | writeDefaultOrchestrationConfig | Checks if .code-intel/orchestration.json exists |
| 11 | writeDefaultOrchestrationConfig | If not exists → writes default config |

---

## 3. Business Rules

| ID | Rule | Source |
|----|------|--------|
| BR-01 | Reconnect attempts MUST NOT exceed 5 before stopping | ConnectionManager.ts |
| BR-02 | Reconnect delays MUST follow exponential backoff: [1, 2, 4, 8, 16] seconds | ConnectionManager.ts |
| BR-03 | Health check timeout MUST be 5 seconds | remote-backend-client.ts |
| BR-04 | Config change debounce MUST be 500ms | config-watcher.ts |
| BR-05 | Self-write suppression window MUST be 2000ms | config-watcher.ts |
| BR-06 | Local wrapper server MUST bind only to 127.0.0.1 (not 0.0.0.0) | remote-backend-client.ts |
| BR-07 | Request body size MUST NOT exceed 1MB | remote-backend-client.ts |
| BR-08 | Local tools (stream_write_file, embed_image) MUST NOT be forwarded to backend | backend-local-tools.ts |
| BR-09 | State transitions MUST be deduplicated (same state → no event) | ConnectionManager.ts |
| BR-10 | MCP JSON-RPC requests without ID MUST get auto-incremented ID | remote-backend-client.ts |
| BR-11 | Auth token MUST be injected into MCP transport requestInit headers | remote-backend-client.ts |
| BR-12 | orchestration.json MUST NOT be overwritten if already exists | mcp-config-builder.ts |
| BR-13 | Config hash comparison MUST only consider code-intelligence section | config-watcher.ts |

---

## 4. Data Specifications

### 4.1 ConnectionState Type

```typescript
type ConnectionState = "DISCONNECTED" | "CONNECTING" | "CONNECTED";
```

### 4.2 RemoteBackendConfig Interface

```typescript
interface RemoteBackendConfig {
  url: string;                   // Backend server URL
  healthCheckInterval: number;   // ms between health pings (default: 30000)
  toolCallTimeout: number;       // ms max wait for tool response
  chatTimeout: number;           // ms max wait for chat response
}
```

### 4.3 ServerStatus Type

```typescript
type ServerStatus = "stopped" | "starting" | "running" | "crashed";
```

### 4.4 CodeIntelConfig Interface

```typescript
interface CodeIntelConfig {
  url?: string;
  port?: number;
  transportType?: string;
  command?: string;
  args?: string[];
  disabled?: boolean;
  [key: string]: unknown;
}
```

### 4.5 MCP JSON-RPC Request Format

```typescript
interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number;
  method: string;          // "tools/call", "tools/list", etc.
  params?: {
    name?: string;         // tool name (for tools/call)
    arguments?: Record<string, unknown>;
  };
}
```

### 4.6 MCP JSON-RPC Response Format

```typescript
interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: {
    code: number;          // -32002 = backend not connected
    message: string;
  };
}
```

### 4.7 Local Tool Result Format

```typescript
interface ToolResult {
  isError: boolean;
  content: Array<{ type: "text"; text: string }>;
}
```

---

## 5. State Diagrams

### 5.1 Connection State Machine

![Connection State Machine](diagrams/state-connection.png)

### 5.2 RemoteBackendClient Status Machine

| Current | Event | Next | Side Effects |
|---------|-------|------|-------------|
| stopped | connect() | starting | Begin health check |
| starting | success | running | MCP connected + wrapper started |
| starting | failure | crashed | Log error, fire onStatusChange |
| running | disconnect() | stopped | Close MCP + stop wrapper |
| running | reconnect() | starting | disconnect then connect |
| crashed | connect() | starting | Retry connection |

---

## 6. Sequence Diagrams

### 6.1 Connection Establishment

![Connection Sequence](diagrams/sequence-connect.png)

### 6.2 MCP Request Proxy Flow

![MCP Proxy Sequence](diagrams/sequence-mcp-proxy.png)

---

## 7. API Contracts

### 7.1 Local Wrapper Server API

#### GET /health

```
Request:  GET http://127.0.0.1:9181/health
Response: 200 OK
Body:     {"status":"ok","mode":"wrapper"}
```

#### POST /mcp

```
Request:  POST http://127.0.0.1:9181/mcp
Headers:  Content-Type: application/json
Body:     {"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"mem_search","arguments":{"query":"test"}}}

Response (success): 200 OK
Body:     {"jsonrpc":"2.0","id":1,"result":{...}}

Response (backend down): 503
Body:     {"jsonrpc":"2.0","id":1,"error":{"code":-32002,"message":"Backend not connected"}}

Response (bad content-type): 415
Body:     {"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":"Unsupported Content-Type"}}

Response (parse error): 400
Body:     {"jsonrpc":"2.0","id":null,"error":{"code":-32700,"message":"Parse error"}}
```

### 7.2 Backend Health Check API (Consumed)

```
Request:  GET {backendUrl}/health
Response: 200 OK (healthy) | non-200 (unhealthy)
Timeout:  5000ms
```

### 7.3 Backend MCP Endpoint (Consumed)

```
Transport: StreamableHTTPClientTransport
URL:       {backendUrl}/mcp
Auth:      Bearer token in requestInit.headers.Authorization
Protocol:  MCP (Model Context Protocol) over HTTP streams
```

---

## 8. Integration Requirements

### 8.1 VS Code Extension API Integration

| API | Usage |
|-----|-------|
| `vscode.EventEmitter<T>` | onStateChange, onStatusChange, onNotification events |
| `vscode.workspace.getConfiguration("kiroSdlc")` | Read backendUrl, mcpServerPort, intervals |
| `vscode.workspace.createFileSystemWatcher` | Monitor mcp.json changes |
| `vscode.window.showErrorMessage` | Display max-reconnect-reached error |
| `vscode.window.showInformationMessage` | Asset download prompts |
| `vscode.window.withProgress` | Download progress indicator |
| `vscode.Disposable` | Cleanup on extension deactivate |

### 8.2 Dependency Injection Points

| Dependency | Injected Via | Used By |
|-----------|-------------|---------|
| AuthManager | Constructor | RemoteBackendClient (token for MCP) |
| HttpClient | Constructor | ConnectionManager (health checks) |
| OutputChannel | Constructor | RemoteBackendClient, ConfigWatcher (logging) |
| McpServerManager (alias) | Import | ConfigWatcher (reconnect trigger) |

### 8.3 Event Bus Integration

| Event | Publisher | Subscribers |
|-------|-----------|------------|
| onStateChange(ConnectionState) | ConnectionManager | Status bar, Chat panel |
| onStatusChange(ServerStatus) | RemoteBackendClient | Extension activation logic |
| onNotification({method, params}) | RemoteBackendClient | LangGraph pipeline |
| onHealthFail() | HealthChecker | ConnectionManager |

---

## 9. Error Handling

| Error Case | Component | Handling Strategy |
|-----------|-----------|-------------------|
| Backend unreachable (network) | HttpClient | Catch, return false from healthCheck |
| Health check timeout (5s) | RemoteBackendClient | req.setTimeout → destroy → reject |
| MCP transport failure | RemoteBackendClient | Set status "crashed", throw to caller |
| JSON parse error (wrapper) | Wrapper Server | Return 400 with JSON-RPC error |
| Body exceeds 1MB | Wrapper Server | Destroy request, reject with error |
| Local tool write failure | backend-local-tools | Return isError=true result (never throw) |
| Config file invalid JSON | ConfigWatcher | Return null config, stop server |
| Asset download failure | mcp-config-builder | Show VS Code error, return false |
| Port already in use (9181) | Wrapper Server | Emit "error" event, reject startup |

---

## 10. Non-Functional Requirements

| ID | Category | Requirement | Target | Measurement |
|----|----------|-------------|--------|-------------|
| NFR-01 | Performance | Connection establishment | < 5s | Health check + MCP handshake |
| NFR-02 | Performance | Health check round-trip | < 5s | Request timeout threshold |
| NFR-03 | Performance | Local tool execution | < 100ms | No network, direct filesystem |
| NFR-04 | Performance | Wrapper server startup | < 500ms | From listen() to ready |
| NFR-05 | Reliability | Reconnect before giving up | 5 attempts | With exponential backoff |
| NFR-06 | Reliability | Extension crash isolation | 0 crashes from connection | All errors caught |
| NFR-07 | Reliability | Config debounce | 500ms | Prevents rapid reconnects |
| NFR-08 | Security | Wrapper server binding | 127.0.0.1 only | Not exposed externally |
| NFR-09 | Security | Body size limit | 1MB max | Prevents memory exhaustion |
| NFR-10 | Security | Auth token transport | Bearer in headers | Secure backend comms |
| NFR-11 | Observability | State transitions logged | All transitions | OutputChannel |
| NFR-12 | Observability | Error context in logs | URL + status + message | Debugging support |

---

## 11. Open Issues

| # | Issue | Impact | Proposed Resolution |
|---|-------|--------|-------------------|
| 1 | No WebSocket implementation (mentioned in scope, but code uses HTTP only) | Lower latency potential unused | Defer to future iteration; HTTP+StreamableHTTP sufficient |
| 2 | Port conflict detection (9181) has no automatic fallback | Setup failure on port clash | Add automatic port increment or configuration guidance |
| 3 | No retry on MCP transport failure (only health-based reconnect) | Transient MCP errors not recovered | Consider wrapping MCP calls with retry logic |

---

## 12. Appendix

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | System Context | [system-context.png](diagrams/system-context.png) | [system-context.drawio](diagrams/system-context.drawio) |
| 2 | Connection State Machine | [state-connection.png](diagrams/state-connection.png) | [state-connection.drawio](diagrams/state-connection.drawio) |
| 3 | Connection Sequence | [sequence-connect.png](diagrams/sequence-connect.png) | [sequence-connect.drawio](diagrams/sequence-connect.drawio) |
| 4 | MCP Proxy Sequence | [sequence-mcp-proxy.png](diagrams/sequence-mcp-proxy.png) | [sequence-mcp-proxy.drawio](diagrams/sequence-mcp-proxy.drawio) |
