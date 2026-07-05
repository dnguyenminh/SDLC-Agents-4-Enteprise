# Business Requirements Document (BRD)

## Kiro IDE Extension — F12: Backend Connection & Lifecycle

---

## Document Information

| Field | Value |
|-------|-------|
| Feature ID | F12 |
| Title | Backend Connection & Lifecycle |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2025-07-03 |
| Status | Draft |
| Architecture Pattern | Plugin (VS Code Extension) |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-07-03 | BA Agent | Initial document — feature analysis from source code |

---

## 1. Introduction

### 1.1 Scope

The Backend Connection & Lifecycle feature manages all connectivity between the Kiro VS Code extension and its remote backend service. It encompasses:

- **Remote Backend Client**: WebSocket/HTTP communication with the Kiro backend server
- **MCP Bridge**: Local wrapper server (:9181) that bridges Kiro's MCP client to the backend's MCP server, allowing local tools (Kiro IDE) to communicate with remote AI capabilities
- **Health Check & Auto-Reconnect**: Periodic health monitoring with exponential backoff reconnection strategy
- **Connection State Machine**: Deterministic state transitions (DISCONNECTED → CONNECTING → CONNECTED)
- **MCP Config Builder**: Reads `.kiro/settings/mcp.json`, builds server configurations, downloads assets
- **Config Watcher**: FileSystemWatcher monitoring `mcp.json` for live configuration changes
- **Local Tool Execution**: Certain tools (file writes, image embedding) execute locally without backend roundtrip

### 1.2 Out of Scope

- Backend server implementation (only the client side)
- Authentication/SSO logic (handled by F9-auth-sso, consumed as dependency)
- AI model selection or prompt routing
- Chat panel UI (F8-chat-panel, consumes connection status)
- LangGraph pipeline orchestration (F7, uses the MCP bridge)
- Multi-tenant backend isolation

### 1.3 Preliminary Requirements

- VS Code extension host active with at least one workspace folder
- Backend server reachable at configured URL
- AuthManager provides valid token (from F9-auth-sso)
- `.kiro/settings/mcp.json` exists or can be created
- Network connectivity (HTTP/HTTPS) available

---

## 2. Business Requirements

### 2.1 High Level Process Map

The connection lifecycle follows a deterministic flow: Extension activates → ConnectionManager attempts to connect to backend → If successful, starts HealthChecker → HealthChecker periodically pings `/health` → If health fails, transitions to DISCONNECTED and schedules reconnect with exponential backoff → RemoteBackendClient establishes MCP session and starts local wrapper server → ConfigWatcher monitors for configuration changes and triggers reconnects when needed.

### 2.2 List of User Stories / Use Cases

| # | Story / Use Case | Priority | Source |
|---|-----------------|----------|--------|
| 1 | As a developer, I want automatic connection to the backend when the extension activates so I can start working immediately | MUST HAVE | ConnectionManager.ts |
| 2 | As a developer, I want the extension to auto-reconnect when the backend becomes temporarily unavailable so my workflow is not interrupted | MUST HAVE | ConnectionManager.ts |
| 3 | As a developer, I want periodic health checks so the extension detects backend failures proactively | MUST HAVE | HealthChecker.ts |
| 4 | As a developer, I want a local MCP wrapper server (:9181) so Kiro's MCP client can communicate with the remote backend through a local endpoint | MUST HAVE | remote-backend-client.ts |
| 5 | As a developer, I want certain tools (file writes) to execute locally without roundtrip to backend so they are fast and work offline for file operations | MUST HAVE | backend-local-tools.ts |
| 6 | As a developer, I want the extension to watch mcp.json for changes and auto-reconnect so I can update configuration without restarting | SHOULD HAVE | config-watcher.ts |
| 7 | As a developer, I want the MCP config builder to automatically resolve server paths and download assets so setup is seamless | SHOULD HAVE | mcp-config-builder.ts |
| 8 | As a developer, I want clear connection state indicators so I know whether the backend is connected, connecting, or disconnected | MUST HAVE | ConnectionManager.ts |
| 9 | As a developer, I want configurable timeouts and intervals (health check, tool call, chat) so I can tune for my network conditions | COULD HAVE | ConnectionManager.ts |
| 10 | As a developer, I want exponential backoff on reconnection so the extension doesn't flood the backend with requests during outages | MUST HAVE | ConnectionManager.ts |

---

### 2.3 Details of User Stories

---

#### Business Flow

![Business Flow](diagrams/business-flow.png)

**Step 1:** Extension activates → ConnectionManager initializes with backend URL from configuration

**Step 2:** ConnectionManager transitions to CONNECTING state and performs initial health check

**Step 3:** If health check succeeds → transition to CONNECTED, start HealthChecker periodic polling

**Step 4:** If health check fails → transition to DISCONNECTED, schedule reconnect with exponential backoff

**Step 5:** Once connected, RemoteBackendClient establishes MCP session (StreamableHTTP transport) and starts local wrapper server on port 9181

**Step 6:** Local wrapper server proxies JSON-RPC requests: local tools handled locally, remote tools forwarded to backend

**Step 7:** ConfigWatcher monitors `mcp.json` — on change (debounced 500ms), triggers reconnect with new configuration

**Step 8:** HealthChecker pings `/health` at configured interval — on failure, ConnectionManager transitions to DISCONNECTED and schedules reconnect

**Step 9:** On max reconnect attempts (5) reached without success → show error to user, stop retrying

---

#### STORY 1: Automatic Backend Connection

> As a developer, I want automatic connection to the backend when the extension activates so I can start working immediately.

**Requirement Details:**

1. On extension activation, ConnectionManager reads backend URL from VS Code settings (`kiroSdlc.backendUrl`)
2. Immediately attempts connection (health check + MCP session)
3. Connection is non-blocking — extension UI remains responsive during connection attempts
4. Success: status bar shows "Connected" indicator, all features enabled
5. Failure: status bar shows "Disconnected", features degrade gracefully

**Acceptance Criteria:**

1. GIVEN backend is running and reachable, WHEN extension activates, THEN connection is established within 5 seconds
2. GIVEN backend is unreachable at startup, WHEN extension activates, THEN connection fails gracefully and reconnect is scheduled
3. GIVEN connection succeeds, WHEN state changes to CONNECTED, THEN `onStateChange` event fires with "CONNECTED"
4. GIVEN extension deactivates, WHEN dispose is called, THEN all connections are cleanly closed

---

#### STORY 2: Auto-Reconnect with Exponential Backoff

> As a developer, I want the extension to auto-reconnect when the backend becomes temporarily unavailable so my workflow is not interrupted.

**Requirement Details:**

1. When connection drops (health check failure or explicit disconnect), ConnectionManager schedules reconnect
2. Reconnect delays follow exponential backoff: 1s, 2s, 4s, 8s, 16s
3. Maximum 5 reconnect attempts before giving up
4. Each reconnect attempt performs a full connect cycle (health check → MCP session)
5. On successful reconnect, attempt counter resets to 0
6. User notification shown only on max attempts reached (avoid notification spam)

**Acceptance Criteria:**

1. GIVEN backend goes down after successful connection, WHEN health check fails, THEN first reconnect attempt happens after 1 second
2. GIVEN 3 failed reconnect attempts, WHEN 4th attempt starts, THEN delay is 8 seconds
3. GIVEN 5 failed attempts, WHEN max reached, THEN error message shown and no further retries
4. GIVEN reconnect succeeds on attempt 3, WHEN connected again, THEN attempt counter resets to 0
5. GIVEN explicit `disconnect()` call, THEN no automatic reconnect is scheduled

---

#### STORY 3: Periodic Health Checks

> As a developer, I want periodic health checks so the extension detects backend failures proactively.

**Requirement Details:**

1. HealthChecker polls `GET /health` endpoint at configurable interval (default: 30 seconds)
2. Health check timeout: 5 seconds (prevents hanging on slow networks)
3. On health check failure, fires `onHealthFail` event
4. ConnectionManager subscribes to `onHealthFail` and triggers reconnect flow
5. Health checks start only when state is CONNECTED
6. Health checks stop when transitioning to DISCONNECTED or CONNECTING

**Acceptance Criteria:**

1. GIVEN connection is CONNECTED, WHEN 30 seconds pass, THEN health check request sent to `/health`
2. GIVEN health check returns non-200 status, WHEN response received, THEN `onHealthFail` fires
3. GIVEN health check times out after 5s, WHEN no response, THEN `onHealthFail` fires
4. GIVEN state transitions to DISCONNECTED, WHEN disconnect happens, THEN health check timer stops
5. GIVEN health check succeeds (200), THEN no action taken, timer continues

---

#### STORY 4: Local MCP Wrapper Server

> As a developer, I want a local MCP wrapper server (:9181) so Kiro's MCP client can communicate with the remote backend through a local endpoint.

**Requirement Details:**

1. HTTP server listens on `127.0.0.1:9181` (configurable via `kiroSdlc.mcpServerPort`)
2. Handles `POST /mcp` — proxies JSON-RPC requests to remote backend's MCP endpoint
3. Handles `GET /health` — returns wrapper server health status
4. Supports CORS headers for local development tools
5. Maximum request body size: 1MB (prevents memory abuse)
6. Content-Type validation: only `application/json` accepted
7. If backend MCP client not connected, returns JSON-RPC error code -32002 ("Backend not connected")
8. Auto-increments request IDs for requests without explicit IDs

**Acceptance Criteria:**

1. GIVEN wrapper server is running, WHEN `GET /health` is called, THEN returns `{"status":"ok","mode":"wrapper"}`
2. GIVEN backend connected, WHEN `POST /mcp` with valid JSON-RPC, THEN request is forwarded and response returned
3. GIVEN backend disconnected, WHEN `POST /mcp` called, THEN returns error code -32002
4. GIVEN request body > 1MB, WHEN received, THEN connection destroyed with error
5. GIVEN non-JSON Content-Type, WHEN `POST /mcp` called, THEN returns 415 with parse error
6. GIVEN `tools/call` for a LOCAL tool, WHEN proxied, THEN handled locally without forwarding

---

#### STORY 5: Local Tool Execution

> As a developer, I want certain tools (file writes, image embedding) to execute locally without roundtrip to backend so they are fast and work offline for file operations.

**Requirement Details:**

1. Local tools set: `stream_write_file`, `embed_image`
2. When `tools/call` request arrives at wrapper for a local tool, execute locally
3. `stream_write_file`: writes/appends content to local filesystem with directory creation
4. Arguments wrapping: `mem_ingest_file` tool gets file content injected from local filesystem before forwarding
5. Local tool failures return proper JSON-RPC error responses (never crash server)

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| path | string | Yes | Target file path | "/project/src/app.ts" |
| content | string | Yes | File content to write | "export const x = 1;" |
| mode | string | No | Write mode (write/append) | "append" |

**Acceptance Criteria:**

1. GIVEN `tools/call` with name `stream_write_file`, WHEN received at wrapper, THEN file is written locally
2. GIVEN `tools/call` with name `mem_ingest_file`, WHEN forwarded, THEN local file content is read and injected into args
3. GIVEN write to non-existent directory, WHEN executed, THEN directory is created recursively
4. GIVEN invalid arguments (missing path), WHEN executed, THEN error response returned (no crash)
5. GIVEN a non-local tool, WHEN `tools/call` received, THEN forwarded to backend MCP server

---

#### STORY 6: Config Watcher (Live Reload)

> As a developer, I want the extension to watch mcp.json for changes and auto-reconnect so I can update configuration without restarting.

**Requirement Details:**

1. FileSystemWatcher monitors `.kiro/settings/mcp.json` for changes
2. Change events debounced by 500ms (prevents rapid-fire on save)
3. Only triggers reconnect when `code-intelligence` section actually changes (hash comparison)
4. Self-write suppression: when extension itself writes to mcp.json, ignore the triggered event (2s suppress window)
5. If `code-intelligence` config removed or `disabled: true`, server is stopped
6. If mcp.json deleted entirely, server is stopped

**Acceptance Criteria:**

1. GIVEN mcp.json changes (URL updated), WHEN 500ms debounce passes, THEN reconnect triggered with new config
2. GIVEN mcp.json changes but code-intelligence section unchanged, WHEN hash compared, THEN no reconnect
3. GIVEN extension writes mcp.json, WHEN self-triggered event fires within 2s, THEN event ignored
4. GIVEN `disabled: true` set in config, WHEN change detected, THEN server disconnects
5. GIVEN mcp.json deleted, WHEN delete event fires, THEN server disconnects and hash resets

---

#### STORY 7: MCP Config Builder

> As a developer, I want the MCP config builder to automatically resolve server paths and download assets so setup is seamless.

**Requirement Details:**

1. Resolves `${mcpServersDir}` and `${workspaceFolder}` placeholders in config arguments
2. Writes resolved config to `.kiro/settings/mcp.json` under `mcpServers.code-intelligence`
3. Creates default orchestration config at `.code-intel/orchestration.json` if not exists
4. Downloads MCP server assets from GitHub releases when variant requires it
5. Supports zip extraction (platform-aware: PowerShell on Windows, unzip on Unix)
6. Injects environment variables: `CODE_INTEL_WORKSPACE`, `CODE_INTEL_VIEWER_PORT`, `FORCE_RESTART`

**Acceptance Criteria:**

1. GIVEN variant config with `${workspaceFolder}` in args, WHEN resolved, THEN actual workspace path substituted
2. GIVEN config written, WHEN mcp.json read, THEN `mcpServers.code-intelligence` section present with merged config
3. GIVEN download variant specified, WHEN asset not present, THEN download from GitHub and extract
4. GIVEN asset already downloaded, WHEN download requested, THEN prompt user to re-download or use existing
5. GIVEN orchestration.json already exists, WHEN writeDefaultOrchestrationConfig called, THEN file not overwritten

---

#### STORY 8: Connection State Indicators

> As a developer, I want clear connection state indicators so I know whether the backend is connected, connecting, or disconnected.

**Requirement Details:**

1. ConnectionManager exposes `currentState` property: "DISCONNECTED" | "CONNECTING" | "CONNECTED"
2. `onStateChange` event fires on every transition
3. `isConnected` convenience property returns boolean
4. RemoteBackendClient exposes `status` property: "stopped" | "starting" | "running" | "crashed"
5. `onStatusChange` event fires for RemoteBackendClient status transitions
6. UI components (status bar, chat panel) subscribe to these events for real-time updates

**Acceptance Criteria:**

1. GIVEN state is DISCONNECTED, WHEN connect() succeeds, THEN state transitions DISCONNECTED → CONNECTING → CONNECTED
2. GIVEN state is CONNECTED, WHEN health fails, THEN state transitions to DISCONNECTED
3. GIVEN state change, WHEN `onStateChange` fires, THEN all subscribers receive the new state
4. GIVEN same state value, WHEN transitionTo called, THEN NO event fires (dedup)
5. GIVEN RemoteBackendClient connect fails, THEN status is "crashed"

---

#### STORY 9: Configurable Timeouts & Intervals

> As a developer, I want configurable timeouts and intervals so I can tune for my network conditions.

**Requirement Details:**

1. `healthCheckInterval`: time between health pings (default: 30000ms)
2. `toolCallTimeout`: max wait for tool execution response (from config)
3. `chatTimeout`: max wait for chat/streaming responses (from config)
4. `mcpServerPort`: local wrapper server port (default: 9181)
5. Configuration read from VS Code settings (`kiroSdlc.*`)
6. `updateConfig()` method allows runtime config changes without full restart

**Acceptance Criteria:**

1. GIVEN `healthCheckInterval` set to 60000, WHEN HealthChecker starts, THEN pings every 60s
2. GIVEN `mcpServerPort` set to 9200, WHEN wrapper starts, THEN listens on 9200
3. GIVEN `updateConfig({healthCheckInterval: 10000})`, WHEN called at runtime, THEN interval changes without restart

---

#### STORY 10: Exponential Backoff Strategy

> As a developer, I want exponential backoff on reconnection so the extension doesn't flood the backend with requests during outages.

**Requirement Details:**

1. Reconnect delays: [1000, 2000, 4000, 8000, 16000] milliseconds
2. Attempt counter increments on each failed reconnect
3. Delay selected by index: `reconnectDelays[reconnectAttempts]` (caps at 16000 for index >= 4)
4. Counter resets to 0 on successful connection
5. `cancelReconnect()` clears pending timer and resets counter (used by explicit disconnect)

**Acceptance Criteria:**

1. GIVEN first failure, WHEN reconnect scheduled, THEN delay is 1000ms
2. GIVEN second failure, WHEN reconnect scheduled, THEN delay is 2000ms
3. GIVEN fifth failure, WHEN max attempts reached, THEN no further scheduling, error shown
4. GIVEN reconnect succeeds, THEN attempts reset to 0 for next failure cycle
5. GIVEN `disconnect()` called during pending reconnect, THEN timer cleared, counter reset

---

## 3. Dependencies

| Dependency | Type | Description |
|------------|------|-------------|
| AuthManager (F9-auth-sso) | System | Provides authentication tokens for backend requests |
| HttpClient (proxy module) | System | HTTP communication layer used by ConnectionManager |
| VS Code Extension API | System | FileSystemWatcher, workspace settings, EventEmitter, OutputChannel |
| @modelcontextprotocol/sdk | External Library | MCP Client and StreamableHTTPClientTransport |
| Node.js http/https modules | System | Local wrapper server and health checks |
| .kiro/settings/mcp.json | Configuration | MCP server configuration file |
| .code-intel/orchestration.json | Configuration | Orchestration settings for MCP servers |
| Backend /health endpoint | External | Health check target |
| Backend /mcp endpoint | External | MCP session endpoint (StreamableHTTP) |
| GitHub Releases | External | MCP server asset downloads |

---

## 4. Stakeholders

| Role | Team | Responsibility |
|------|------|----------------|
| Extension Developer | Kiro Platform | Implement and maintain connection lifecycle |
| Backend Developer | Kiro Platform | Provide stable /health and /mcp endpoints |
| End User (Developer) | Consumer | Configures backend URL, benefits from auto-reconnect |
| DevOps | Kiro Platform | Backend deployment, uptime monitoring |

---

## 5. Risks and Assumptions

### 5.1 Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Backend extended downtime exhausts reconnect attempts | High | Medium | Clear error message with manual reconnect option |
| Port 9181 conflicts with other local services | Medium | Low | Configurable port via settings |
| Network latency causes health check false positives | Medium | Medium | 5s timeout, configurable interval |
| Large tool responses exceed 1MB body limit | Low | Low | 1MB limit is generous; chunked responses for streaming |
| Config watcher misses rapid successive changes | Low | Low | 500ms debounce covers typical save patterns |
| Self-write suppression window (2s) too short/long | Low | Low | Tuned from real usage; can be adjusted |

### 5.2 Assumptions

- Backend server provides `/health` endpoint returning 200 when healthy
- Backend server provides `/mcp` endpoint accepting StreamableHTTP MCP transport
- AuthManager is initialized before ConnectionManager.connect() is called
- Single workspace folder is primary (multi-root workspace picks first folder)
- Local port 9181 is available on developer machines (configurable fallback)
- GitHub releases are accessible for MCP server asset downloads

---

## 6. Non-Functional Requirements

| Category | Requirement | Details |
|----------|-------------|---------|
| Performance | Connection establishment < 5s | Including health check + MCP handshake |
| Performance | Health check response < 5s | Timeout threshold |
| Performance | Local tool execution < 100ms | No network roundtrip |
| Performance | Wrapper server startup < 500ms | Non-blocking, resolves quickly |
| Reliability | Auto-reconnect with 5 attempts | Exponential backoff prevents flooding |
| Reliability | Health check never crashes extension | All errors caught and handled |
| Reliability | Config watcher debounce 500ms | Prevents rapid-fire reconnects |
| Availability | Graceful degradation when disconnected | Extension functional for local operations |
| Security | Local server binds 127.0.0.1 only | Not exposed to network |
| Security | Auth token injected in MCP transport | Secure backend communication |
| Security | Max body size 1MB | Prevents memory exhaustion attacks |
| Observability | All state transitions logged | OutputChannel with timestamps |
| Observability | Connection errors logged with context | URL, status code, timeout info |

---

## 7. Related Source Files

| File | Description | Relationship |
|------|-------------|--------------|
| extension/src/connection/ConnectionManager.ts | State machine for backend connectivity | Core — state management |
| extension/src/connection/HealthChecker.ts | Periodic health polling | Core — failure detection |
| extension/src/remote-backend-client.ts | MCP session + local wrapper server | Core — communication bridge |
| extension/src/mcp-server-manager.ts | Re-export alias for RemoteBackendClient | Compatibility layer |
| extension/src/backend-local-tools.ts | Local tool execution logic | Core — local operations |
| extension/src/config-watcher.ts | FileSystemWatcher for mcp.json | Core — live config reload |
| extension/src/mcp-config-builder.ts | Config resolution + asset download | Setup — initialization |

---

## 8. Appendix

### Connection State Machine

| Current State | Event | Next State | Action |
|--------------|-------|------------|--------|
| DISCONNECTED | connect() called | CONNECTING | Perform health check |
| CONNECTING | health check success | CONNECTED | Start HealthChecker, reset attempts |
| CONNECTING | health check failure | DISCONNECTED | Schedule reconnect |
| CONNECTED | health fail event | DISCONNECTED | Stop HealthChecker, schedule reconnect |
| CONNECTED | disconnect() called | DISCONNECTED | Stop HealthChecker, cancel reconnect |
| DISCONNECTED | max attempts reached | DISCONNECTED | Show error, stop retrying |

### RemoteBackendClient Status Machine

| Current Status | Event | Next Status |
|---------------|-------|-------------|
| stopped | connect() called | starting |
| starting | health + MCP + wrapper OK | running |
| starting | any failure | crashed |
| running | disconnect() called | stopped |
| crashed | connect() called | starting |

### MCP Config File Structure (mcp.json)

```json
{
  "mcpServers": {
    "code-intelligence": {
      "url": "http://localhost:3100",
      "port": 3100,
      "transportType": "streamable-http",
      "command": "java",
      "args": ["-jar", "${mcpServersDir}/code-intel-server.jar"],
      "disabled": false
    }
  }
}
```

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Business Flow | [business-flow.png](diagrams/business-flow.png) | [business-flow.drawio](diagrams/business-flow.drawio) |
| 2 | Use Case Diagram | [use-case.png](diagrams/use-case.png) | [use-case.drawio](diagrams/use-case.drawio) |
