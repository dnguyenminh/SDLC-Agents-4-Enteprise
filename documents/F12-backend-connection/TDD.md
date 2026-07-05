# Technical Design Document (TDD)

## Kiro IDE Extension — F12: Backend Connection & Lifecycle

---

## Document Information

| Field | Value |
|-------|-------|
| Feature ID | F12 |
| Title | Backend Connection & Lifecycle |
| Author | SA Agent |
| Version | 1.0 |
| Date | 2025-07-03 |
| Status | Draft |
| Related FSD | FSD-v1-F12-backend-connection.docx |
| Related BRD | BRD-v1-F12-backend-connection.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-07-03 | SA Agent | Initial technical design from source code analysis |

---

## 1. Architecture Overview

### 1.1 Architecture Diagram

![Architecture](diagrams/architecture.png)

### 1.2 Design Philosophy

The Backend Connection module follows the **State Machine** pattern combined with **Observer/Event-driven** architecture:

1. **Deterministic State Machine**: ConnectionManager implements a clean state machine (DISCONNECTED to CONNECTING to CONNECTED) ensuring predictable behavior
2. **Event-Driven Communication**: Components communicate via VS Code EventEmitter, enabling loose coupling
3. **Fail-Safe Design**: All network operations are wrapped in error handlers; connection failures never crash the extension
4. **Local-First Optimization**: Certain tools execute locally for speed, while remote tools proxy through the MCP bridge
5. **Separation of Concerns**: Each file has a single responsibility (state mgmt, health checking, MCP bridging, config watching, local tools)

### 1.3 Component Diagram

![Component Diagram](diagrams/component.png)

### 1.4 Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Extension Host | VS Code Extension API | Lifecycle, events, configuration |
| MCP Client | @modelcontextprotocol/sdk | MCP protocol handling |
| HTTP Server | Node.js http module | Local wrapper server |
| Transport | StreamableHTTPClientTransport | MCP over HTTP streams |
| File Watching | VS Code FileSystemWatcher | Config change detection |
| Validation | Zod (z.any()) | MCP response validation |

---

## 2. Module Design

### 2.1 Module Overview

```
extension/src/
+-- connection/
|   +-- ConnectionManager.ts    State machine + reconnect logic
|   +-- HealthChecker.ts        Periodic /health polling
+-- remote-backend-client.ts    MCP session + local wrapper server
+-- mcp-server-manager.ts       Re-export alias (backward compat)
+-- backend-local-tools.ts      Local tool execution
+-- config-watcher.ts           FileSystemWatcher for mcp.json
+-- mcp-config-builder.ts       Config resolution + asset download
```

### 2.2 ConnectionManager

**Pattern:** State Machine + Observer

**Key Design Decisions:**

| Decision | Rationale |
|----------|-----------|
| Event-based health fail notification | Decouples HealthChecker from reconnect logic |
| Exponential backoff array (not formula) | Explicit delays, easy to tune per index |
| State deduplication (same state no event) | Prevents UI flicker on redundant transitions |
| Timer-based reconnect (not immediate) | Prevents rapid connection attempts |

**Public API:**

- `connect(): Promise<void>` — Initiate connection (health check then connected)
- `disconnect(): void` — Stop health checker, cancel reconnect, go to DISCONNECTED
- `updateConfig(newConfig): void` — Update URL/interval at runtime
- `currentState: ConnectionState` — Current state enum
- `isConnected: boolean` — Convenience boolean
- `onStateChange: Event<ConnectionState>` — Subscribe to state transitions

### 2.3 HealthChecker

**Pattern:** Timer + Observer (Callback listeners)

**Design Notes:**
- Uses setInterval (not recursive setTimeout) for consistent polling
- Simple callback array (not EventEmitter) — only one listener needed
- checkOnce() exposed for on-demand health verification
- No retry within health check — single pass, fail = notify

### 2.4 RemoteBackendClient

**Pattern:** Facade (bridges MCP Client + HTTP Server + Local Tools)

**Internal Flow:**
1. connect() -> health check -> create MCP Client -> connect transport -> start wrapper
2. Wrapper handles: /health (200 OK), /mcp (JSON-RPC proxy)
3. /mcp routing: LOCAL_TOOLS -> executeLocalTool(), others -> mcpClient.request()

**Public API:**

- `connect(): Promise<void>` — Full connection (health + MCP + wrapper)
- `disconnect(): Promise<void>` — Close server + MCP client
- `reconnect(): Promise<void>` — Disconnect then connect
- `invokeTool(name, args): Promise<string>` — Direct tool invocation
- `status: ServerStatus` — Current status (stopped/starting/running/crashed)
- `port: number | null` — Active port (wrapper or backend)
- `onStatusChange: Event<ServerStatus>` — Subscribe to status transitions
- `onNotification: Event<{method, params}>` — MCP notifications from backend

### 2.5 Local Wrapper Server Architecture

Routes:
- OPTIONS * -> 204 (CORS preflight)
- GET /health -> {status:ok, mode:wrapper}
- POST /mcp -> handleMcpRequest()
- other -> 404

handleMcpRequest():
1. Validate Content-Type = application/json
2. Read body (max 1MB)
3. Parse JSON-RPC
4. Auto-assign ID if missing
5. Check mcpClient connected (else error -32002)
6. Route: tools/call + LOCAL_TOOLS -> executeLocalTool(); else wrapArgs + forward to backend
7. Return JSON-RPC response

### 2.6 Backend Local Tools

**Pattern:** Strategy (dispatch by tool name)

Local tool set: stream_write_file, embed_image

**stream_write_file Implementation:**
1. Extract path, content, mode from args
2. Validate required args
3. Create directory recursively (mkdir -p)
4. Write file (or append if mode=append)
5. Return success/error result object

**wrapToolArguments (mem_ingest_file):**
1. Read local file at file_path
2. Inject file content into args.content
3. Return enriched args for backend forwarding

### 2.7 ConfigWatcher

**Pattern:** Debounce + Hash Comparison + Self-Write Suppression

Constants: DEBOUNCE_MS = 500, SUPPRESS_MS = 2000

**Event Handling Pipeline:**

FileChange -> suppressCheck -> debounce(500ms) -> computeHash -> hashChanged? -> readConfig -> disabled? -> disconnect : reconnect

### 2.8 MCP Config Builder

**Pattern:** Builder + Template Resolution

Template Variables:
- \ -> resolved to .mcp-servers/ in workspace
- \ -> resolved to workspace root path

Functions:
- resolveConfig(variant, root) — Replace placeholders, inject env vars
- writeMcpConfig(root, serverConfig) — Merge into mcp.json
- writeDefaultOrchestrationConfig(root) — Create orchestration.json if missing
- downloadVariant(variant, root) — Download + extract assets from GitHub

---

## 3. API Design

### 3.1 Local Wrapper HTTP API

| Endpoint | Method | Response | Purpose |
|----------|--------|----------|---------|
| /health | GET | 200 {status:ok,mode:wrapper} | Wrapper health check |
| /mcp | POST | 200 JSON-RPC response | MCP proxy |
| * | OPTIONS | 204 | CORS preflight |

### 3.2 JSON-RPC Error Codes

| Code | Meaning | When |
|------|---------|------|
| -32700 | Parse error | Invalid JSON, wrong Content-Type |
| -32002 | Backend not connected | mcpClient is null |
| -32603 | Internal error | Unhandled exception in tool call |

---

## 4. Error Handling Design

### 4.1 Error Categories

| Category | Handling | Recovery |
|----------|----------|----------|
| Network unreachable | Catch in healthCheck, return false | Auto-reconnect with backoff |
| Health timeout (5s) | req.setTimeout then destroy | Auto-reconnect |
| MCP transport failure | Catch in connect, set crashed | Manual or timed retry |
| JSON parse error | Try/catch in handleMcpRequest | Return 400 error response |
| Body too large (>1MB) | Size tracking in readBody | Destroy request stream |
| Local tool failure | Try/catch in executeLocalTool | Return isError=true result |
| Port in use | Server error event | Reject startup, report to user |
| Config file invalid | Return null from readCodeIntelConfig | Stop server gracefully |

### 4.2 Error Propagation Strategy

- Local Tools: NEVER throw -> always return {isError: true/false}
- Wrapper Server: NEVER crash -> catch all in request handler
- ConnectionManager: MAY fire events -> subscribers handle gracefully
- RemoteBackendClient: MAY throw on connect() -> caller handles
- HealthChecker: NEVER throws -> fires callback on failure
- ConfigWatcher: NEVER throws -> logs and takes safe action

---

## 5. Security Design

### 5.1 Network Security

| Measure | Implementation |
|---------|---------------|
| Local-only binding | server.listen(port, 127.0.0.1) — not exposed to network |
| Auth token injection | Bearer token in StreamableHTTP transport headers |
| HTTPS for backend | Uses https module when URL starts with https: |
| Body size limit | 1MB max prevents memory exhaustion |
| No secrets in logs | Tokens not logged, only connection state |

### 5.2 Input Validation

| Input | Validation |
|-------|-----------|
| JSON-RPC body | JSON.parse with try/catch |
| Content-Type header | Must include application/json |
| Body size | Tracked during streaming, abort if >1MB |
| Tool arguments | Validated per tool (path/content required for write) |
| Config file | JSON.parse with try/catch, null on failure |
| URL parsing | new URL() with try/catch |

---

## 6. Performance Design

### 6.1 Performance Targets

| Operation | Target | Mechanism |
|-----------|--------|-----------|
| Local tool execution | < 100ms | Direct fs, no network |
| Health check | < 5s timeout | Hard timeout with destroy |
| Wrapper startup | < 500ms | Simple http.createServer |
| Connection establishment | < 5s total | Health + MCP handshake |
| Config debounce | 500ms | Single timer, clear on rapid change |

### 6.2 Memory Management

| Concern | Strategy |
|---------|----------|
| Request bodies | 1MB hard limit, destroy on exceed |
| MCP responses | Streamed via transport, not buffered |
| Timer cleanup | All timers cleared in dispose() |
| Event listeners | Properly disposed via EventEmitter.dispose() |
| Server resources | Graceful close in disconnect() |

---

## 7. Implementation Checklist

### 7.1 Files (All Exist)

| File | Status | Responsibility |
|------|--------|---------------|
| extension/src/connection/ConnectionManager.ts | EXISTS | State machine + reconnect |
| extension/src/connection/HealthChecker.ts | EXISTS | Health polling |
| extension/src/remote-backend-client.ts | EXISTS | MCP + wrapper |
| extension/src/mcp-server-manager.ts | EXISTS | Re-export alias |
| extension/src/backend-local-tools.ts | EXISTS | Local tools |
| extension/src/config-watcher.ts | EXISTS | Config watcher |
| extension/src/mcp-config-builder.ts | EXISTS | Config builder |

### 7.2 Testing Strategy

| Component | Test Type | Focus |
|-----------|-----------|-------|
| ConnectionManager | Unit | State transitions, backoff timing, event firing |
| HealthChecker | Unit | Timer start/stop, fail detection |
| RemoteBackendClient | Integration | Full connect flow, wrapper routing |
| backend-local-tools | Unit | File write/append, error handling |
| config-watcher | Unit | Debounce, hash comparison, suppress |
| mcp-config-builder | Unit | Path resolution, config merge |
| Wrapper Server | Integration | HTTP routing, JSON-RPC proxy |

---

## 8. Design Patterns Summary

| Pattern | Where | Why |
|---------|-------|-----|
| State Machine | ConnectionManager | Deterministic, predictable connection lifecycle |
| Observer/Event | All components | Loose coupling, VS Code paradigm |
| Facade | RemoteBackendClient | Single entry point for MCP + wrapper + tools |
| Strategy | backend-local-tools | Dispatch by tool name |
| Debounce | ConfigWatcher | Prevent rapid-fire reconnects |
| Exponential Backoff | ConnectionManager | Graceful retry without flooding |
| Template Resolution | mcp-config-builder | Placeholder substitution in config |

---

## 9. Deployment Considerations

### 9.1 VS Code Extension Packaging

| Item | Notes |
|------|-------|
| Bundler | esbuild (existing) |
| External deps | @modelcontextprotocol/sdk must be bundled |
| Node APIs | http, https, fs, path, crypto — all available in extension host |
| Activation | Extension activates -> ConnectionManager.connect() |
| Deactivation | dispose() called -> clean shutdown of all resources |

### 9.2 Configuration Settings

| Setting | Type | Default | Description |
|---------|------|---------|-------------|
| kiroSdlc.backendUrl | string | (empty) | Remote backend URL |
| kiroSdlc.mcpServerPort | number | 9181 | Local wrapper port |
| kiroSdlc.healthCheckInterval | number | 30000 | Health check interval (ms) |

### 9.3 Backward Compatibility

| Concern | Resolution |
|---------|-----------|
| McpServerManager import | Re-exported from mcp-server-manager.ts |
| getNonce() utility | Kept in mcp-server-manager.ts |
| spawn()/kill() methods | Aliased to connect()/disconnect() |

---

## 10. Appendix

### 10.1 Reconnect Timing Table

| Attempt | Delay (ms) | Cumulative Wait |
|---------|-----------|----------------|
| 1 | 1000 | 1s |
| 2 | 2000 | 3s |
| 3 | 4000 | 7s |
| 4 | 8000 | 15s |
| 5 | 16000 | 31s (then give up) |

### 10.2 Local Tools Registry

| Tool Name | Action | Forward to Backend |
|-----------|--------|-------------------|
| stream_write_file | Write/append file locally | NO |
| embed_image | Embed image in document | NO |
| mem_ingest_file | Read file, inject content, forward | YES (enriched) |
| (all others) | Forward as-is | YES |

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Architecture | [architecture.png](diagrams/architecture.png) | [architecture.drawio](diagrams/architecture.drawio) |
| 2 | Component Diagram | [component.png](diagrams/component.png) | [component.drawio](diagrams/component.drawio) |
| 3 | Class Diagram | [class-connection.png](diagrams/class-connection.png) | [class-connection.drawio](diagrams/class-connection.drawio) |