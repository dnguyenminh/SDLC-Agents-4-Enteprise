# Functional Specification Document (FSD) — ENRICHED

## SDLC Agents 4 Enterprise — SA4E-48: OpenCode v1.17.15 SSE error 405 — WrapperServer missing endpoint event

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-48 |
| Title | OpenCode v1.17.15 SSE error 405 — WrapperServer missing endpoint event |
| Author | BA Agent (enriched by TA Agent) |
| Version | 1.1 |
| Date | 2026-07-20 |
| Status | Enriched |
| Related BRD | documents/SA4E-48/BRD.md |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-20 | BA Agent | Initiate document — auto-generated from BRD and Jira tickets |
| 1.1 | 2026-07-20 | TA Agent | Technical enrichment: full API contracts, sequence diagrams, error matrix, pseudocode, non-functional quantification, open issues |

---

## 1. Introduction

### 1.1 Purpose

This Functional Specification Document (FSD) specifies the functional behavior of the **WrapperServer** component's MCP Streamable HTTP transport implementation. It defines the SSE handshake protocol, JSON-RPC endpoint behavior, error handling, and regression test coverage required to fix the OpenCode CLI connection failure (HTTP 405 on SSE connection).

This FSD is derived from the Business Requirements Document (BRD) for SA4E-48 and the actual source code implementation.

### 1.2 Scope

The scope of this FSD covers:

1. **SSE Stream Handshake** (`GET /mcp`) — The event sequence and HTTP headers required for a compliant MCP Streamable HTTP transport
2. **JSON-RPC Endpoint** (`POST /mcp`) — The request/response behavior for MCP methods: `initialize`, `notifications/initialized`, `ping`, `tools/list`, `tools/call`
3. **Health Endpoint** (`GET /health`) — Server health check
4. **Regression Test Suite** — 7 regression tests guarding against MCP handshake regressions
5. **Build & Verification** — Compilation, VSIX packaging, and release tagging

Out of scope:
- The backend REST API (`restGetTools`, `restCallTool`) — unchanged
- The Base64ProxyService — unchanged
- MCP transport modes other than Streamable HTTP (e.g., stdio) — unchanged
- Authentication, CORS, or security mechanisms — unchanged

### 1.3 Definitions & Acronyms

| Term | Definition |
|------|------------|
| MCP | Model Context Protocol — protocol for LLM ↔ tool server communication |
| SSE | Server-Sent Events — W3C standard for server push over HTTP |
| Streamable HTTP | MCP transport: SSE for server→client, HTTP POST for client→server |
| WrapperServer | Local HTTP server in VS Code extension bridging MCP to backend REST |
| JSON-RPC 2.0 | Lightweight RPC protocol using JSON encoding |
| SSEClientTransport | MCP SDK client class that consumes SSE streams |
| VSIX | VS Code Extension Package format |
| 405 | HTTP "Method Not Allowed" |

<!-- TA enrichment -->
| Term | Definition |
|------|------------|
| keep-alive comment | SSE comment line (`: text`) used to prevent proxy/load-balancer connection timeout |
| `req.destroy()` | Node.js method to forcefully terminate an incoming HTTP request (used for body size enforcement) |
| `OutputChannel` | VS Code API for diagnostic logging to the "Output" panel |
| `Content-Type` negotiation | Server validates `Content-Type` header contains `application/json` for POST /mcp |
| Protocol version negotiation | Server selects mutually supported MCP protocol version; falls back to newest known |
| `headersSent` guard | Node.js `res.headersSent` check prevents writing headers after they've been sent (catching late errors) |

### 1.4 References

| Document | Location |
|----------|----------|
| BRD | documents/SA4E-48/BRD.md |
| WrapperServer Source | extension/src/services/WrapperServer.ts |
| Regression Tests | extension/src/__tests__/mcp-handshake.regression.test.ts |
| WrapperServer Tests | extension/src/__tests__/wrapper-server.test.ts |
| Test Helpers | extension/src/__tests__/wrapper-server.helpers.ts |
| MCP Spec | https://spec.modelcontextprotocol.io/ |
| SSE Specification | https://html.spec.whatwg.org/multipage/server-sent-events.html |
| JSON-RPC 2.0 Spec | https://www.jsonrpc.org/specification |
| W3C SSE (EventSource) | https://www.w3.org/TR/eventsource/ |

---

## 2. System Overview

### 2.1 System Context Diagram

![System Context](diagrams/system-context.png)
*[Edit in draw.io](diagrams/system-context.drawio)*

The **SDLC Agents 4 Enterprise VS Code Extension** contains the **WrapperServer**, a local HTTP server listening on `127.0.0.1:9186`. It bridges MCP JSON-RPC requests from the **OpenCode CLI** (MCP client) to the **Backend REST API** (Code Intelligence MCP Server). The WrapperServer also provides **Base64ProxyService** for schema rewriting (file proxy) and executes certain tools **locally** (`stream_write_file`, `embed_image`).

### 2.2 System Architecture

The WrapperServer is part of the VS Code extension's runtime and follows this architecture:

```
┌─────────────────────────────────────────────────────────────┐
│  OpenCode CLI (MCP Client)                                  │
│  ┌──────────────────────────┐                               │
│  │ SSEClientTransport       │──GET /mcp──► SSE stream       │
│  │                          │──POST /mcp──► JSON-RPC req    │
│  └──────────────────────────┘                               │
└────────────────────────────────┬────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────┐
│  VS Code Extension (port 9186)                              │
│  ┌──────────────────────────────────────────────────┐       │
│  │  WrapperServer                                   │       │
│  │  ┌────────────┐  ┌─────────────────┐             │       │
│  │  │ GET /mcp   │  │ POST /mcp       │             │       │
│  │  │ SSE stream │  │ JSON-RPC router │             │       │
│  │  └────────────┘  └────────┬────────┘             │       │
│  │          ┌─────────────────┼────────────────┐    │       │
│  │          ▼                 ▼                ▼    │       │
│  │  ┌──────────────┐ ┌──────────────┐ ┌─────────┐ │       │
│  │  │Local Tools   │ │REST Backend  │ │BPProxy  │ │       │
│  │  └──────────────┘ └──────┬───────┘ └─────────┘ │       │
│  └──────────────────────────┼──────────────────────┘       │
└─────────────────────────────┼──────────────────────────────┘
                              │
                              ▼
              ┌──────────────────────────────┐
              │  Backend REST API            │
              │  (Code Intelligence MCP Srv) │
              └──────────────────────────────┘
```

<!-- TA enrichment -->
### 2.3 SSE Handshake Sequence Diagram

![SSE Handshake Sequence](diagrams/sse-handshake-sequence.png)
*[Edit in draw.io](diagrams/sse-handshake-sequence.drawio)*

The SSE handshake follows a strict event ordering. The `event: endpoint` MUST be the first SSE event written to the response stream. This is because the MCP SDK's `SSEClientTransport` implementation blocks on reading the `endpoint` event to determine the URL for subsequent POST requests. Writing `event: message` before `event: endpoint` causes the client to never initialize its POST transport, leading to a connection timeout.

### 2.4 Technical Architecture Details

<!-- TA enrichment -->
The WrapperServer is built on Node.js native `http` module (no Express/framework). Key architectural decisions:

| Decision | Rationale |
|----------|-----------|
| Native `http` (no Express) | Zero dependency overhead; minimal surface area for bugs |
| Instance-per-extension | Each VS Code window has one WrapperServer instance on a unique port |
| `127.0.0.1` binding only | Security: no external network exposure |
| Synchronous SSE writes | Node.js `res.write()` is non-blocking even in synchronous style |
| `setInterval` over `setTimeout` chain | Simpler cleanup via `clearInterval` on `close` event |
| Request ID counter | Auto-incrementing for debugging; not used for dedup |
| 1MB body hard limit | Connection destroy (not graceful error) for oversized bodies to prevent OOM |

---

## 3. Functional Requirements

### 3.1 Feature: MCP Streamable HTTP SSE Handshake

**Source:** BRD Story 1 — MCP SSE Connection Handshake

#### 3.1.1 Description

The WrapperServer must implement the MCP Streamable HTTP transport specification. When an MCP client (OpenCode CLI) connects via `GET /mcp`, the server must respond with an SSE stream containing the mandatory `event: endpoint` and `event: message` events. The SSE stream must also include periodic keep-alive comments to prevent connection timeout.

![State Diagram - MCP Connection](diagrams/state-mcp-connection.png)
*[Edit in draw.io](diagrams/state-mcp-connection.drawio)*

#### 3.1.2 Use Case

**Use Case ID:** UC-01
**Actor:** OpenCode CLI (MCP Client)
**Preconditions:** WrapperServer is running on port 9186, VS Code extension is active
**Postconditions:** SSE stream is established, client receives endpoint URL and initialized notification

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | OpenCode CLI | | Sends HTTP GET request to `http://localhost:9186/mcp` |
| 2 | | WrapperServer | Receives GET request, routes to `handleMcpGet()` |
| 3 | | WrapperServer | Sets HTTP response headers: `200 OK`, `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive` |
| 4 | | WrapperServer | Writes SSE event: `event: endpoint\ndata: /mcp\n\n` |
| 5 | | WrapperServer | Writes SSE event: `event: message\ndata: {"jsonrpc":"2.0","method":"initialized"}\n\n` |
| 6 | | WrapperServer | Starts 15-second keep-alive interval (`: keep-alive\n\n`) |
| 7 | OpenCode CLI | | Receives SSE stream, extracts endpoint `/mcp` from `event: endpoint` |
| 8 | OpenCode CLI | | Reads `initialized` notification, knows server is ready |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | Client sends POST /mcp directly (no SSE) | WrapperServer handles as normal JSON-RPC request; SSE is optional per MCP spec |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | SSE connection closes unexpectedly | WrapperServer `close` event handler triggers `clearInterval(keepAlive)` to stop the keep-alive timer |
| EF-2 | WrapperServer encounters internal error | Error caught in `handleRequest()`, 500 response sent if headers not yet sent (guarded by `res.headersSent`) |

<!-- TA enrichment -->
**Additional Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-3 | SSE keep-alive write fails (connection already closed) | Error is silently caught in `try/catch` block; `clearInterval` will eventually fire on `close` event |
| EF-4 | Client sends non-GET, non-POST to /mcp | Returns HTTP 405 `{"error":"Method not allowed"}` |
| EF-5 | Client sends request to unknown path | Returns HTTP 404 `{"error":"Not found"}` with no CORS restriction |
| EF-6 | Server crashes before headers sent | `catch` block in `handleRequest()` sends HTTP 500 with error message; if `headersSent` is already true, response is silently dropped |
| EF-7 | Client reuses SSE connection after server restart | New connection attempt gets fresh SSE stream; previous connection's keep-alive timer is GC'd when connection closes |

#### 3.1.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-1 | SSE response must include `event: endpoint` before `event: message` | MCP Streamable HTTP spec; BRD §1.1 |
| BR-2 | SSE endpoint data must specify `/mcp` as the POST URL | MCP spec; SA4E-48 root cause |
| BR-3 | SSE response must include `Content-Type: text/event-stream` | SSE specification |
| BR-4 | Keep-alive interval must be 15 seconds | WrapperServer implementation |
| BR-5 | SSE stream must not block other HTTP requests | Server uses Node.js async I/O |

<!-- TA enrichment -->
| Rule ID | Rule | Source |
|---------|------|--------|
| BR-6 | SSE events must be delimited by double newline (`\n\n`) per W3C SSE spec | W3C SSE specification |
| BR-7 | Keep-alive must use SSE comment format (`: text\n\n`) not event format | SSE convention |
| BR-8 | SSE write failures must be silently caught to prevent unhandled rejection | WrapperServer implementation (line 156) |
| BR-9 | Keep-alive interval must be cleaned up via `clearInterval` on connection `close` event | Node.js best practice (prevents memory leak) |
| BR-10 | `event: endpoint` data must not include trailing slash or query params (exactly `/mcp`) | MCP spec; client parses literal string |

#### 3.1.4 Data Specifications

**Input Data (GET /mcp):**

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| URL Path | string | Y | Must be exactly `/mcp` | SSE endpoint path |
| Method | string | Y | Must be `GET` | HTTP method |
| Host | string | Y | Must be `localhost` (127.0.0.1) | Server binding |

**Output Data (SSE Stream):**

| Event | Data | Description |
|-------|------|-------------|
| endpoint | `/mcp` | Tells client where to POST JSON-RPC requests |
| message | `{"jsonrpc":"2.0","method":"initialized"}` | Server ready notification |
| (comment) | `: keep-alive` | Connection keep-alive (every 15s) |

<!-- TA enrichment -->
**SSE Byte-Level Format:**

```
event: endpoint\ndata: /mcp\n\n
event: message\ndata: {"jsonrpc":"2.0","method":"initialized"}\n\n
: keep-alive\n\n
```

Each event consists of:
- `event:` field (optional for named events)
- `data:` field (one or more lines; concatenated with newline)
- Double `\n\n` terminator (blank line)
- Comments start with `:` and are ignored by clients

The keep-alive comment has no `event` or `data` prefix — it's a pure SSE comment line that prevents intermediary proxies from closing idle connections.

#### 3.1.5 API Contract (Functional View)

<!-- TA enrichment: full technical API contract -->

**Endpoint:** `GET /mcp`
**Purpose:** Open SSE stream for server-to-client MCP messages

**Technical Details (from source implementation — `handleMcpGet()`: lines 144-159):**

| Aspect | Specification |
|--------|---------------|
| HTTP Method | `GET` (any other method on /mcp → 405) |
| URL | `http://localhost:{port}/mcp` |
| Protocol | HTTP/1.1 (Node.js `http` module default) |
| Response Status | `200 OK` |
| Response Headers | `Content-Type: text/event-stream`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive` |
| CORS | `Access-Control-Allow-Origin: *` (set globally in `handleRequest()`) |

**SSE Event Sequence (exact byte order):**

```typescript
// Guaranteed first write — MCP SDK SSEClientTransport BLOCKS on this event
res.write("event: endpoint\n");
res.write("data: /mcp\n\n");

// Second event — signals server readiness
res.write("event: message\n");
res.write("data: {\"jsonrpc\":\"2.0\",\"method\":\"initialized\"}\n\n");

// Keep-alive — every 15,000ms via setInterval
res.write(": keep-alive\n\n");    // repeated
```

**Keep-Alive Timer Implementation (source code):**

```typescript
// From WrapperServer.handleMcpGet() lines 155-158
const keepAlive = setInterval(() => {
  try { res.write(": keep-alive\n\n"); } catch { /* ignore */ }
}, 15000);
res.on("close", () => clearInterval(keepAlive));
```

**Lifecycle Guarantees:**

| Condition | Behavior |
|-----------|----------|
| SSE connection closed by client | `close` event fires → `clearInterval(keepAlive)` → no more writes |
| Keep-alive write fails (connection dead) | `try/catch` silently discards error; `close` event will eventually fire |
| Multiple GET /mcp connections | Each gets its own SSE stream with independent keep-alive timer |
| Server stops | All SSE connections are forcibly closed; timers are garbage-collected |

---

### 3.2 Feature: MCP JSON-RPC POST Handler

**Source:** BRD Story 1 — MCP SSE Connection Handshake

#### 3.2.1 Description

The WrapperServer `POST /mcp` endpoint handles JSON-RPC 2.0 requests for MCP methods. It must correctly implement the MCP lifecycle: initialize, notifications/initialized, ping, tools/list, and tools/call.

#### 3.2.2 Use Cases

**Use Case ID:** UC-02
**Actor:** OpenCode CLI (MCP Client)
**Preconditions:** WrapperServer is running, SSE stream may or may not be open
**Postconditions:** JSON-RPC response is sent

**Main Flow (initialize):**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | OpenCode CLI | | Sends POST /mcp with `{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"vscode","version":"1.128.0"}}}` |
| 2 | | WrapperServer | Parses JSON body, validates Content-Type is application/json |
| 3 | | WrapperServer | Matches protocolVersion against supported versions: `["2025-06-18","2025-03-26","2024-11-05"]` |
| 4 | | WrapperServer | Sends response: `{"jsonrpc":"2.0","id":1,"result":{"protocolVersion":"2024-11-05","capabilities":{"tools":{"listChanged":false}},"serverInfo":{"name":"sdlc-agents-4-enterprise","version":"1.11.0"}}}` |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-2 | Unknown protocol version from client | Server returns the newest supported version (`2025-06-18`) |
| AF-3 | Empty `params` for initialize | Server treats missing params as undefined lookup → returns newest version (`2025-06-18`) |
| AF-4 | `notifications/initialized` sent without prior initialize | Server accepts and returns HTTP 202 (no state tracking) |
| AF-5 | `tools/call` with local tool name | Routes to `executeLocalTool()` instead of backend REST |
| AF-6 | `tools/call` with `execute_dynamic_tool` | Routes through `handleDynamic()` for proxy unwrapping |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-8 | Invalid JSON body | Returns `-32700 Parse error` with HTTP 400 |
| EF-9 | Missing Content-Type header | Returns `-32700 Expected application/json` with HTTP 400 |
| EF-10 | Unknown method | Returns `-32601 Method not supported` |
| EF-11 | Internal server error | Returns `-32603` with error message |
| EF-12 | Body exceeds 1MB | Connection destroyed via `req.destroy()` — no graceful error response possible |

#### 3.2.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-11 | Supported protocol versions: `2025-06-18`, `2025-03-26`, `2024-11-05` | WrapperServer implementation |
| BR-12 | `initialize` request must return `protocolVersion`, `capabilities`, `serverInfo` | MCP spec |
| BR-13 | `notifications/initialized` must return HTTP 202 with empty body | MCP spec |
| BR-14 | `ping` must return HTTP 200 with `{"result":{}}` | MCP spec |
| BR-15 | `tools/list` must return HTTP 200 with array of tool definitions | MCP spec |
| BR-16 | `tools/call` must route to appropriate backend or local handler | MCP spec |
| BR-17 | Non-POST requests to /mcp must return 405 | HTTP spec |
| BR-18 | Body size limit: 1 MB | WrapperServer implementation |
| BR-19 | GET /mcp must NOT be rejected (returns SSE stream, not 405) | The bug fix |

<!-- TA enrichment -->
| Rule ID | Rule | Source |
|---------|------|--------|
| BR-20 | Protocol negotiation: exact match first, then fallback to `PROTOCOL_VERSIONS[0]` (newest) | Source code line 109-110 |
| BR-21 | Request ID auto-increment: if `rpc.id === undefined`, assign `++this.requestId` | Source code line 104 |
| BR-22 | Error response status: `id === null` → HTTP 400; `id` present → HTTP 200 with error in body | Source code line 230-231 |
| BR-23 | `notifications/initialized` AND `initialized` both accepted (defensive) | Source code line 121 |
| BR-24 | CORS headers set on EVERY response (including errors) before any routing | Source code lines 63-65 |
| BR-25 | Body read uses streaming with per-chunk size accumulation; total > 1MB triggers `req.destroy()` | Source code lines 210-222 |

#### 3.2.4 Data Specifications

**Input Data:**

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| Content-Type | Header | Y | Must include `application/json` | Request body format |
| Body | JSON-RPC 2.0 | Y | Must be valid JSON, max 1MB | RPC request |
| method | string | Y | One of supported MCP methods | RPC method name |
| id | number/string | N (notifications) | Must be present for requests | Request identifier |
| params | object | N | Varies by method | Method parameters |

**Output Data:**

| Field | Type | Description |
|-------|------|-------------|
| jsonrpc | string | Always `"2.0"` |
| id | number/string/null | Echo of request id (null for errors where id can't be extracted) |
| result | object | Present on success (absent for errors) |
| error.code | number | JSON-RPC error code |
| error.message | string | Human-readable error |

<!-- TA enrichment -->
**Full JSON-RPC Error Code Matrix:**

| Code | Meaning | HTTP Status | When Returned |
|------|---------|-------------|---------------|
| `-32700` | Parse error | `400` | Invalid JSON body or wrong Content-Type |
| `-32600` | Invalid Request | `200` | JSON-RPC structure invalid (not currently used by WrapperServer) |
| `-32601` | Method not found | `200` | Unknown MCP method name |
| `-32603` | Internal error | `200` | Backend REST call failure, file not found, unexpected exception |
| (none) | Success | `200` | Normal response |
| (none) | Accepted (notification) | `202` | `notifications/initialized` response |
| (none) | Method not allowed | `405` | POST /mcp with non-POST method (except GET) |
| (none) | Not found | `404` | Request to path other than `/mcp` or `/health` |
| (none) | Internal error (pre-header) | `500` | Unhandled exception before sending response headers |

**Protocol Version Negotiation Algorithm (exact source logic):**

```typescript
const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

// Negotiation logic (line 109-110):
const negotiated = PROTOCOL_VERSIONS.find((v) => v === clientVersion)
  || PROTOCOL_VERSIONS[0];  // fallback to newest
```

This means:
1. If client sends `protocolVersion: "2024-11-05"` → server returns `"2024-11-05"` (exact match)
2. If client sends `protocolVersion: "2099-01-01"` → server returns `"2025-06-18"` (newest fallback)
3. If client sends `protocolVersion: undefined` → server returns `"2025-06-18"` (newest fallback)

#### 3.2.5 API Contract (Functional View)

**Endpoint:** `POST /mcp`
**Purpose:** Handle JSON-RPC MCP requests

**Request Headers:**
- `Content-Type: application/json` (mandatory; any non-JSON → 400)
- `Content-Length` (optional for the server, but recommended by HTTP/1.1)
- `Accept: application/json` (should be sent by client)

**Request Body Schema:**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2024-11-05",
    "capabilities": {},
    "clientInfo": { "name": "vscode", "version": "1.128.0" }
  }
}
```

**Successful Response (initialize):**

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2024-11-05",
    "capabilities": { "tools": { "listChanged": false } },
    "serverInfo": { "name": "sdlc-agents-4-enterprise", "version": "1.11.0" }
  }
}
```

**Business Error Scenarios:**

| Scenario | User Message | Trigger Condition |
|----------|-------------|-------------------|
| Unsupported method | `-32601 Method not supported: {method}` | Unknown method name |
| Parse error | `-32700 Parse error` | Invalid JSON body |
| Missing Content-Type | `-32700 Expected application/json` | Non-JSON Content-Type |
| Body too large | Connection destroyed | Body > 1MB |
| Internal error | `-32603 {error message}` | Unhandled exception |

<!-- TA enrichment -->
**Complete MCP Method Routing Table:**

| Method | Handler Function | Response Type | Notes |
|--------|-----------------|---------------|-------|
| `initialize` | Inline in `handleMcp()` | JSON-RPC result with `protocolVersion`, `capabilities`, `serverInfo` | Must NOT return `-32601` — this was the bug |
| `notifications/initialized` | Inline in `handleMcp()` | HTTP 202, empty body | Also accepts `initialized` (no `notifications/` prefix) defensively |
| `ping` | Inline in `handleMcp()` | `{"result":{}}` | Health check at MCP layer |
| `tools/list` | `getToolsRewritten()` → `restGetTools()` + `base64Proxy` | Array of tool definitions with rewritten schemas | Calls backend REST then rewrites schemas for LLM |
| `tools/call` | `routeToolCall()` → dispatch | Varies by tool | Routes to local, dynamic, or proxied handler |

---

### 3.3 Feature: MCP Handshake Regression Tests

**Source:** BRD Story 2 — MCP Handshake Regression Tests

#### 3.3.1 Description

A regression test suite (`mcp-handshake.regression.test.ts`) must guard against the exact failure mode that caused the SSE connection error. The tests verify that the MCP lifecycle handlers remain correctly implemented across code changes.

#### 3.3.2 Use Case

**Use Case ID:** UC-03
**Actor:** Developer (via `vitest`)
**Preconditions:** WrapperServer source code is present, Node.js test runner is available
**Postconditions:** All 7 regression tests pass

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Developer | | Runs `npx vitest run` |
| 2 | | Test Runner | Creates mock WrapperServer with `createTestServer()` |
| 3 | | Test Runner | Starts server on random port |
| 4 | | Test Runner | Executes 7 regression tests sequentially |
| 5 | | Test Runner | Stops server after all tests |
| 6 | Developer | | Sees test results (pass/fail) |

**Test Cases:**

| ID | Name | What it Verifies |
|----|------|------------------|
| REG-01 | initialize is implemented | `initialize` does NOT return `-32601 Method not supported` |
| REG-02 | initialize response structure | Returns `protocolVersion`, `capabilities`, `serverInfo` |
| REG-03 | Full handshake flow | `initialize → notifications/initialized → tools/list` works end-to-end |
| REG-04 | ping response | `ping` returns `{}` result, no error |
| REG-05 | SSE stream | `GET /mcp` returns `200` + `text/event-stream` + `event: message` |
| REG-06 | All required methods | No required method returns `-32601` |
| REG-07 | Unknown method | Unknown method still correctly returns `-32601` |

#### 3.3.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-26 | Required MCP methods: `initialize`, `ping`, `tools/list`, `tools/call` | MCP spec; BRD §2.3 Story 2 |
| BR-27 | `initialize` must NOT return `-32601 Method not supported: initialize` | The exact bug that broke VS Code connection |
| BR-28 | `GET /mcp` response must have `Content-Type` containing `text/event-stream` | SSE spec |

---

### 3.4 Feature: Build & Release

**Source:** BRD Story 3 — Compiled Output Synchronization

#### 3.4.1 Description

After source code changes, the extension must be recompiled, all tests must pass, a new VSIX must be built, and the release must be tagged.

#### 3.4.2 Build Steps

| Step | Command | Expected Result |
|------|---------|-----------------|
| 1 | `npm run compile` | TypeScript compiles to `out/` directory |
| 2 | `npx vitest run` | 545/545 tests pass |
| 3 | `npm run package:debug` | VSIX generated at `extension/sdlc-agents-4-enterprise-1.14.0.vsix` |
| 4 | `git tag v1.14.0` | Release tag created |
| 5 | Update CHANGELOG.md, README.md, backend/README.md | Version references updated |

---

## 4. Data Model

> **Note:** This feature (SSE bug fix) does not introduce any new data entities or database changes. The fix is strictly at the HTTP/SSE protocol layer within the WrapperServer component. No existing data model is affected.

The WrapperServer uses the following in-memory configuration:

| Attribute | Type | Description |
|-----------|------|-------------|
| `port` | number | Listening port (9186 default, 0 for random) |
| `requestId` | number | Auto-incrementing JSON-RPC request ID counter |
| Supported protocol versions | string[] | `["2025-06-18", "2025-03-26", "2024-11-05"]` |
| Local tools | Set<string> | `{"stream_write_file", "embed_image"}` |
| Max body size | number | 1,048,576 bytes (1 MB) |

<!-- TA enrichment -->
### 4.1 Object Lifecycle Model

```
WrapperServer instance
│
├── constructor(deps: WrapperServerDeps)
│   ├── outputChannel — VS Code diagnostic logging
│   ├── base64Proxy — File content proxy service
│   ├── restGetTools — Backend REST GET fetcher
│   └── restCallTool — Backend REST tool caller
│
├── start(port) → http.Server bound to 127.0.0.1
│   ├── Registers handleRequest() as request listener
│   ├── Registers error handler for server-level errors
│   └── Resolves promise when listening
│
├── handleRequest(req, res)
│   ├── Sets CORS headers on every request (Origin, Methods, Headers)
│   ├── Handles OPTIONS (preflight) → 204
│   ├── Routes /mcp → handleMcp()
│   ├── Routes /health → 200 JSON
│   ├── Everything else → 404
│   └── Catch-all: 500 if headers not yet sent
│
├── handleMcp(req, res)
│   ├── GET → handleMcpGet() [SSE stream]
│   ├── Not POST → 405
│   ├── Validate Content-Type → 400 if not application/json
│   ├── readBody() → 400/parse error if invalid JSON
│   ├── Route by rpc.method
│   └── Catch-all: -32603 on backend errors
│
└── handleMcpGet(res)
    ├── writeHead(200, event-stream headers)
    ├── res.write("event: endpoint\ndata: /mcp\n\n")
    ├── res.write("event: message\ndata: {...}\n\n")
    ├── setInterval(keep-alive, 15000)
    └── res.on("close") → clearInterval(keepAlive)
```

### 4.2 Memory Footprint

| Component | Approx Size | Notes |
|-----------|------------|-------|
| SSE response object | ~2 KB | One per connected SSE client |
| SSE keep-alive timer | ~200 bytes | One `Timeout` object per SSE connection |
| Tool definitions cache | ~50-100 KB | Depends on backend tool count |
| requestId counter | 8 bytes | Single number |

---

## 5. Integration Specifications

> **Note:** This section defines external system interactions for the WrapperServer.

### 5.1 External System: OpenCode CLI (MCP Client)

| Attribute | Value |
|-----------|-------|
| Purpose | Consume MCP tools provided by SDLC Agents extension |
| Direction | Bidirectional |
| Data Format | SSE (server→client) + JSON-RPC over HTTP (client→server) |
| Frequency | Real-time per user action |

**Data Exchange:**

| Our Data | External Data | Direction | Business Rule |
|----------|--------------|-----------|---------------|
| SSE endpoint event | POST URL | Send | BR-1: Must include `event: endpoint` |
| SSE initialized event | Server ready notification | Send | BR-2: Must include `event: message` |
| JSON-RPC initialize response | Protocol version, capabilities | Send | BR-7: Must return correct structure |
| Tool definitions | tool list | Send | BR-10: Must return array |
| Tool call results | tool output | Send | BR-11: Must route correctly |

<!-- TA enrichment -->
**Integration Protocol Details:**

| Aspect | Specification |
|--------|---------------|
| Transport | HTTP/1.1 (Node.js `http` module) |
| Client Discovery | OpenCode reads `mcpServers` config from `.opencode/opencode.jsonc` |
| Connection Initiation | OpenCode sends `GET /mcp` on startup |
| Transport Security | None (127.0.0.1 only — no TLS, no authentication) |
| Content-Type validation | Server rejects non-`application/json` POST with error code `-32700` |
| Client-side error handling | MCP SDK `SSEClientTransport` handles reconnection logic |
| Server identification | `serverInfo.name: "sdlc-agents-4-enterprise"`, `version: "1.11.0"` |

### 5.2 External System: Backend REST API

| Attribute | Value |
|-----------|-------|
| Purpose | Proxy MCP tool requests to Code Intelligence MCP Server |
| Direction | Outbound |
| Data Format | JSON over HTTP |
| Frequency | Real-time per MCP request |

<!-- TA enrichment -->
**Integration Protocol Details:**

| Aspect | Specification |
|--------|---------------|
| Transport | HTTP (assumed; defined by `restGetTools`/`restCallTool` injection) |
| Outbound calls | No retry logic in WrapperServer; errors bubble to JSON-RPC `-32603` |
| Timeout | Not configured in WrapperServer; backend timeout is inherited |
| Circuit breaker | None (single-user local server) |
| Error propagation | Backend errors → `-32603 Internal error` with backend error message |

**Retry Policy (Absence Confirmation):**

| Condition | Behavior | Rationale |
|-----------|----------|-----------|
| Backend unreachable | Error `-32603` returned to MCP client immediately | Single-user dev tool; retry is client's responsibility |
| Backend timeout | Error `-32603` returned (timeout exception) | No circuit breaker; server is local |
| Transient failure | No automatic retry | OpenCode CLI can retry the MCP request |

---

## 6. Processing Logic

### 6.1 SSE Keep-Alive Timer

**Trigger:** SSE connection opened via `GET /mcp`
**Schedule:** Every 15 seconds while SSE connection is open
**Input:** None
**Output:** SSE comment line `: keep-alive\n\n`

**Processing Steps:**

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | `setInterval` fires after 15 seconds | N/A |
| 2 | Write `: keep-alive\n\n` to SSE response stream | If write fails (connection closed), error is silently caught |
| 3 | Wait 15 seconds | N/A |

**Cleanup:** When SSE client disconnects, the `close` event fires `clearInterval(keepAlive)`.

### 6.2 MCP Request Routing

**Trigger:** HTTP POST to `/mcp`
**Input:** JSON-RPC 2.0 request body
**Output:** JSON-RPC 2.0 response

**Processing Steps:**

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Validate Content-Type header | EF-4: Return `-32700` if not application/json |
| 2 | Read body (max 1MB) | EF-6: Destroy connection if body too large |
| 3 | Parse JSON | EF-3: Return `-32700 Parse error` if invalid JSON |
| 4 | Route by method | See routing table below |
| 5 | Send response | EF-5, EF-6: Return appropriate JSON-RPC error |

**Method Routing Table:**

| Method | Handler | Error Code if Missing |
|--------|---------|----------------------|
| `initialize` | Direct handler | N/A (must be implemented) |
| `notifications/initialized` | Return HTTP 202 | N/A |
| `ping` | Return `{}` | N/A |
| `tools/list` | `getToolsRewritten()` | N/A |
| `tools/call` | `routeToolCall()` | N/A |
| Unknown | N/A | `-32601 Method not supported` |

<!-- TA enrichment -->
### 6.3 Pseudocode for Critical Paths

#### 6.3.1 SSE Handshake (`handleMcpGet`)

```typescript
// Language: TypeScript (Node.js)
// File: extension/src/services/WrapperServer.ts, lines 144-159
// [Implements: BRD Story 1 — BR-1, BR-2, BR-3, BR-4]
// [Implements: BR-9, BR-10]

function handleMcpGet(res: http.ServerResponse): void {
  // Step 1: Write SSE response headers
  // CRITICAL: Must be text/event-stream — not text/plain, not application/json
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  });

  // Step 2: Write mandatory endpoint event
  // ORDERING IS CRITICAL: endpoint MUST come before message
  // The MCP SDK's SSEClientTransport blocks reading the stream
  // until it sees the endpoint event.
  // BR-1: Must include event: endpoint
  // BR-2: data must be exactly "/mcp" (no trailing slash)
  res.write("event: endpoint\n");
  res.write("data: /mcp\n\n");     // Double \n\n = SSE event delimiter

  // Step 3: Write initialized notification
  // BR-3: Must include event: message
  res.write("event: message\n");
  res.write("data: {\"jsonrpc\":\"2.0\",\"method\":\"initialized\"}\n\n");

  // Step 4: Start keep-alive timer
  // BR-4: Keep-alive interval = 15,000ms
  // BR-8: Write failures silently caught
  const keepAlive = setInterval(() => {
    try {
      res.write(": keep-alive\n\n");   // SSE comment format
    } catch {
      // Connection already closed — do nothing
    }
  }, 15000);

  // Step 5: Register cleanup on connection close
  // BR-9: clearInterval on close prevents timer leak
  res.on("close", () => clearInterval(keepAlive));
}
```

#### 6.3.2 Protocol Negotiation (`initialize` handler)

```typescript
// Language: TypeScript (Node.js)
// File: extension/src/services/WrapperServer.ts, lines 107-118
// [Implements: BR-20]

// Supported versions (newest first):
//   PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"]
//
// Algorithm: exact match → fallback to newest
if (rpc.method === "initialize") {
  const clientVersion = rpc.params?.protocolVersion as string | undefined;

  // Try exact match first, then fallback to newest
  const negotiated = PROTOCOL_VERSIONS.find((v) => v === clientVersion)
    || PROTOCOL_VERSIONS[0];

  sendResult(res, rpc.id, {
    protocolVersion: negotiated,
    capabilities: {
      tools: { listChanged: false },
    },
    serverInfo: {
      name: "sdlc-agents-4-enterprise",
      version: "1.11.0",         // Source: package.json
    },
  });
}
```

#### 6.3.3 Body Size Enforcement

```typescript
// Language: TypeScript (Node.js)
// File: extension/src/services/WrapperServer.ts, lines 210-222
// [Implements: BR-25]

const MAX_BODY_SIZE = 1024 * 1024;    // 1,048,576 bytes (1MB)

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_SIZE) {
        // HARD LIMIT: Destroy connection immediately
        // This prevents OOM attacks but means no graceful error response
        req.destroy();
        reject(new Error("Body too large"));
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}
```

#### 6.3.4 Error Response Dispatch

```typescript
// Language: TypeScript (Node.js)
// File: extension/src/services/WrapperServer.ts, lines 224-232
// [Implements: BR-22]

// Success response: always HTTP 200
function sendResult(res: http.ServerResponse, id: any, result: any): void {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ jsonrpc: "2.0", id, result }));
}

// Error response:
// - If id === null (e.g., parse error before id extraction) → HTTP 400
// - If id is present (e.g., method error after successful parse) → HTTP 200 with error body
//   This is JSON-RPC conformant: transport errors use HTTP status, protocol errors use 200
function sendError(res: http.ServerResponse, id: any, code: number, message: string): void {
  res.writeHead(id === null ? 400 : 200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }));
}
```

---

## 7. Security Requirements

> **Note:** The WrapperServer is a local-only server bound to `127.0.0.1`. It is not exposed to external networks.

### 7.1 Authentication & Authorization

| Role | Permissions | Screens/Features |
|------|-------------|-------------------|
| Local user | Full access | All MCP endpoints, health endpoint |
| Remote user | Blocked by design | Server binds only to 127.0.0.1 |

### 7.2 Data Sensitivity Classification

| Data Type | Classification | Business Requirement |
|-----------|---------------|---------------------|
| Tool definitions | Internal | Tool schemas may contain implementation details |
| Tool call arguments | Internal | May contain user workspace file paths |
| SSE stream data | Internal | Contains server metadata |

### 7.3 Audit Trail

| Event | Logged Fields | Retention | Business Reason |
|-------|--------------|-----------|-----------------|
| Server start | Port number, timestamp | Extension session | Debugging |
| Server error | Error message, stack trace | Extension session | Debugging |
| MCP request | Method name (logged by backend) | Extension session | Debugging via outputChannel |

<!-- TA enrichment -->
### 7.4 CORS Implementation

The WrapperServer sets permissive CORS headers on **every HTTP response** (including errors, before routing):

| Header | Value | Purpose |
|--------|-------|---------|
| `Access-Control-Allow-Origin` | `*` | Allow any origin (local server, no CSRF risk) |
| `Access-Control-Allow-Methods` | `GET, POST, OPTIONS` | Supported HTTP methods |
| `Access-Control-Allow-Headers` | `Content-Type` | Required for JSON-RPC POST |

**CORS Preflight Handling:**
OPTIONS requests to any path return HTTP 204 with the above CORS headers and an empty body. This ensures browser-based MCP clients (if any) can issue preflight requests.

### 7.5 Input Validation

| Input | Validation | Enforcement |
|-------|-----------|-------------|
| URL path | Checked against known routes (`/mcp`, `/health`) | Unknown paths → 404 |
| HTTP method | Checked for `/mcp`: GET or POST only | Non-GET/POST → 405 |
| Content-Type | Must include `application/json` for POST | Non-JSON → 400 with `-32700` |
| JSON body | Parsed via `JSON.parse()` | Invalid → 400 with `-32700` |
| Body size | Accumulated in chunks, checked incrementally | >1MB → `req.destroy()` (connection terminated) |

### 7.6 Body Size Limit: Design Decision

| Aspect | Detail |
|--------|--------|
| Limit | 1,048,576 bytes (1 MB) |
| Enforcement | Connection destroy via `req.destroy()` — NOT graceful error response |
| Rationale | By the time 1MB is reached, output buffer may be partially sent; destroying is the only safe way to stop processing |
| Impact | MCP client receives a connection reset (ECONNRESET) — must retry with smaller payload |
| Alternative | Could send 413 Payload Too Large, but would need to buffer entire body first (defeats purpose of limit) |

---

## 8. Non-Functional Requirements

| Category | Business Requirement | Acceptance Criteria |
|----------|---------------------|---------------------|
| Performance | SSE stream must not block JSON-RPC handling | Server responds to POST /mcp while SSE stream is open |
| Availability | WrapperServer starts with VS Code extension | Server port 9186 is listening within 5 seconds of extension activation |
| Scalability | Single-client local server | Only one OpenCode CLI instance connects per VS Code window |
| Compatibility | MCP Streamable HTTP spec compliant | OpenCode CLI v1.17.15+ connects without error |

<!-- TA enrichment -->
### 8.1 Quantified Non-Functional Targets

| Category | Metric | Target | Measurement Method |
|----------|--------|--------|-------------------|
| **Response Time** | GET /mcp SSE header + first event | < 50ms (local loopback) | `res.writeHead` to first `res.write` timestamp |
| **Response Time** | POST /mcp initialize | < 100ms | Request-to-response latency (local) |
| **Response Time** | POST /mcp tools/list | < 500ms p95 (includes backend REST call) | Test with mocked backend returning 50 tools |
| **Response Time** | POST /mcp tools/call (local tool) | < 50ms | Local tool execution (no network) |
| **Response Time** | POST /mcp tools/call (remote tool) | Depends on backend | WrapperServer adds < 10ms overhead |
| **Throughput** | Maximum concurrent SSE streams | 10 (local single-user) | One per MCP client |
| **Connection Lifecycle** | SSE keep-alive jitter | ±500ms | `setInterval` drift in Node.js event loop |
| **Memory** | WrapperServer baseline | < 50 MB RSS | Process memory measurement |
| **Memory** | Per SSE connection | < 10 KB extra | Response object + timer |
| **Startup Time** | Server bind to port | < 1000ms | From `start()` call to `listening` callback |
| **Test Coverage** | Unit + Integration tests | ≥ 545 total tests | `npx vitest run` |

### 8.2 SSE Keep-Alive Timing Precision

| Aspect | Detail |
|--------|--------|
| Mechanism | `setInterval(callback, 15000)` — standard Node.js timer |
| Precision | ± 4ms in Node.js event loop (no timer skew over time) |
| Jitter sources | Other `res.write()` calls, garbage collection pauses |
| Wire format | `: keep-alive\n\n` — SSE comment (ignored by client, prevents proxy timeout) |
| Failure mode | Silently caught — if write fails, timer continues until `close` event |

### 8.3 Connection Lifecycle Timing

```
T=0:      Client sends GET /mcp
T+~1ms:  Server receives, writes SSE headers + endpoint + message events
T+~15s:  Server writes keep-alive (repeats every 15s)
T+X:     Client disconnects (close event)
T+X+0:   clearInterval(keepAlive) — no further writes
```

---

## 9. Error Handling (User-Facing)

### 9.1 Error Scenarios

| Scenario | Severity | User Message | Expected Behavior |
|----------|----------|-------------|-------------------|
| WrapperServer returns 405 on GET /mcp | Critical | `code-intel SSE error: Non-200 status code (405)` | OpenCode CLI cannot connect; tools unavailable |
| WrapperServer not running | Critical | `Connection refused: localhost:9186` | Extension not active; reload VS Code |
| Invalid JSON body | Warning | Internal JSON-RPC error code `-32700` | Client retries with correct JSON |
| Unknown MCP method | Info | Internal JSON-RPC error code `-32601` | Client uses only supported methods |

### 9.2 Notification Requirements

| Event | Who is Notified | Channel | Timing |
|-------|----------------|---------|--------|
| Server start | Developer | VS Code Output Channel | Immediate |
| Server error | Developer | VS Code Output Channel | Immediate |
| Connection error | End user | OpenCode CLI console | Immediate |

<!-- TA enrichment -->
### 9.3 Complete Error Matrix

| Error Code | HTTP Status | JSON-RPC Code | Condition | Client Recovery |
|------------|-------------|---------------|-----------|-----------------|
| Method Not Allowed | 405 | — | Non-POST to /mcp (except GET) | Use correct HTTP method |
| Not Found | 404 | — | Unknown URL path | Use `/mcp` or `/health` |
| Internal Server Error | 500 | — | Unhandled exception in `handleRequest()` | Retry; if persists, reload VS Code |
| Server Start Error | — | — | Port already in use or permission denied | Try different port; reload VS Code |
| Parse Error | 400 | `-32700` | Invalid JSON body | Send valid JSON-RPC 2.0 request |
| Content-Type Error | 400 | `-32700` | Missing/wrong Content-Type | Set `Content-Type: application/json` |
| Method Not Supported | 200 | `-32601` | Unknown MCP method | Use one of: initialize, ping, tools/list, tools/call |
| Internal Error | 200 | `-32603` | Backend call failure | Retry; check backend availability |
| Body Too Large | Connection destroyed | — | Body > 1MB | Reduce request payload size |
| SSE Write Error | — | — | SSE connection closed during write | Client reconnects (handled by MCP SDK) |

### 9.4 Structured Logging Format

The WrapperServer uses VS Code `OutputChannel` for diagnostic logging. Format:

```
[WrapperServer] Listening on port 9186              // server start
[WrapperServer] Error: {error message}              // server-level error
[WrapperServer] Error: {error message} + stack      // handler error (logged via catch)
```

**Log Levels:**

| Level | Usage | Example |
|-------|-------|---------|
| `INFO` | Server lifecycle | `[WrapperServer] Listening on port 9186` |
| `ERROR` | Handler errors | `[WrapperServer] Error: ECONNREFUSED` |
| `ERROR` | Unhandled exceptions | Error with stack trace |

**Note:** MCP method-level logging is handled by the backend, not the WrapperServer. The WrapperServer only logs errors and lifecycle events.

---

## 10. Testing Considerations

### 10.1 Test Scenarios

| ID | Scenario | Input | Expected Output | Priority |
|----|----------|-------|-----------------|----------|
| TC-01 | GET /mcp returns SSE stream | HTTP GET to /mcp | 200 OK, Content-Type: text/event-stream, contains `event: endpoint` and `event: message` | High |
| TC-02 | initialize method works | POST /mcp with initialize request | 200 OK, result contains protocolVersion, capabilities, serverInfo | High |
| TC-03 | Full handshake flow | initialize → notifications/initialized → tools/list | All return success, tools is array | High |
| TC-04 | POST non-application/json | POST /mcp with text/plain body | 400 with `-32700 Expected application/json` | Medium |
| TC-05 | Invalid JSON body | POST /mcp with `not-valid-json{{` | 400 with `-32700 Parse error` | Medium |
| TC-06 | Unknown method returns -32601 | POST /mcp with unknown method | 200 with `error.code: -32601` | Medium |
| TC-07 | ping returns empty result | POST /mcp with ping method | 200 with `result: {}` | Medium |
| TC-08 | notifications/initialized | POST /mcp with notifications/initialized | 202 with empty body | Medium |
| TC-09 | Protocol negotiation (unknown version) | initialize with protocolVersion `2099-01-01` | Returns newest supported `2025-06-18` | Medium |
| TC-10 | Body too large | POST /mcp with body > 1MB | Connection destroyed or error | Low |
| TC-11 | SSE keep-alive timer | Open SSE connection, wait 20 seconds | Receive `: keep-alive` comment within 20s | Low |
| TC-12 | Server stop cleans up SSE | Start SSE, stop server | SSE connection closed, timer cleared | Low |

### 10.2 Regression Test Coverage

All 7 tests from `mcp-handshake.regression.test.ts` (REG-01 through REG-07) must pass in addition to the 538 existing tests (total ≥ 545).

<!-- TA enrichment -->
### 10.3 Test Infrastructure Details

| Aspect | Detail |
|--------|--------|
| Test framework | Vitest (configured in extension package.json) |
| Mock strategy | MockDeps interface with `createTestServer()` factory |
| HTTP client | Node.js native `http` module (no supertest) |
| Server lifecycle | `beforeAll` start on port 0 (random) → `afterAll` stop |
| SSE test helper | `openSse()` — opens GET /mcp, resolves on first `event: message` |
| Body size test | `postRaw()` — sends raw buffer, captures error regardless of status |
| Test isolation | Each `describe` block gets its own server instance |
| Temp files | `.tmp-wrapper-server` directory created/cleaned per test suite |

### 10.4 Additional Integration Test Scenarios

| ID | Scenario | Input | Expected Output | Priority |
|----|----------|-------|-----------------|----------|
| TC-13 | SSE event ordering | GET /mcp | `event: endpoint` appears before `event: message` in stream | High |
| TC-14 | SSE event format validation | GET /mcp | Double `\n\n` terminators between events | Medium |
| TC-15 | OPTIONS preflight | OPTIONS /mcp | 204 with CORS headers | Medium |
| TC-16 | Server error logged to outputChannel | Mock backend throws | `outputChannel.appendLine` called with error | Low |
| TC-17 | Multiple SSE connections | Two concurrent GET /mcp | Both streams receive events independently | Low |
| TC-18 | SSE cleanup on close | Open then close SSE connection | No `setInterval` leaks (timer cleared) | Medium |

### 10.5 Performance Test Targets

| Test | Target | Condition |
|------|--------|-----------|
| SSE handshake latency | < 50ms | Localhost, no load |
| Initialize response time | < 100ms | Localhost, mocked backend |
| Tools/list response time | < 500ms p95 | Including backend round-trip |
| Concurrent SSE connections | 10 simultaneous | No degradation in POST response time |

---

## 11. Appendix

### Diagrams

| Diagram | File |
|---------|------|
| System Context | [system-context.png](diagrams/system-context.png) |
| State Diagram - MCP Connection | [state-mcp-connection.png](diagrams/state-mcp-connection.png) |
| SSE Handshake Sequence | [sse-handshake-sequence.png](diagrams/sse-handshake-sequence.png) |

### Change Log from BRD

No deviations from the BRD. All requirements are addressed in this FSD.

### State Diagram — MCP Connection Lifecycle

```
stateDiagram-v2
    [*] --> DISCONNECTED
    DISCONNECTED --> SSE_CONNECTING: connect() GET /mcp
    SSE_CONNECTING --> SSE_OPEN: 200 + event: endpoint
    SSE_CONNECTING --> ERROR: 405 / 404 / timeout
    SSE_OPEN --> INITIALIZED: POST initialize + notifications/initialized
    INITIALIZED --> READY: POST tools/list
    READY --> INITIALIZED: Re-initialize
    ERROR --> DISCONNECTED: retry
```

### Source Code (Changed Lines)

The fix in `WrapperServer.handleMcpGet()` adds two lines after `res.writeHead(200, ...)`:

```typescript
// SSE client needs 'endpoint' event to know where to POST (MCP SDK SSEClientTransport waits for this)
res.write("event: endpoint\n");
res.write("data: /mcp\n\n");
res.write("event: message\n");
res.write("data: {\"jsonrpc\":\"2.0\",\"method\":\"initialized\"}\n\n");
```

The existing `event: message` and keep-alive lines remain unchanged.

<!-- TA enrichment -->
### Open Issues

| ID | Issue | Owner | Target Date | Status |
|----|-------|-------|-------------|--------|
| OI-01 | Protocol version list hardcoded; should be configurable or fetched from backend | TBD | Post-release | Open |
| OI-02 | Body size limit enforced via `req.destroy()` — no graceful 413 response | TBD | Post-release | Open |
| OI-03 | No metric/monitoring for SSE connection count or keep-alive failures | TBD | Post-release | Open |
| OI-04 | WrapperServer version (`1.11.0`) hardcoded in `initialize` response; should derive from `package.json` | TBD | Post-release | Open |
| OI-05 | No timeout on `readBody()` — slow client could hold connection open indefinitely | TBD | Post-release | Open |
| OI-06 | SSE keep-alive uses `setInterval` which accumulates drift; `setTimeout` chain preferred for precision | TBD | Post-release | Open |

### Data Migration

> **Note:** No data migration is required for this fix. The change is limited to SSE event content in the HTTP response. No database, file format, or state changes are involved.

### MCP SSE Event Format — Reference

```
Field     Description
─────────────────────────────────────────────────
event:    Event type (e.g., "endpoint", "message")
data:     Payload — one or more lines
:         Comment (ignored by client)
\n\n      Event terminator (blank line)
```

### Draw.io Diagram — SSE Handshake Sequence

The following draw.io XML defines the SSE handshake sequence diagram. Save as `documents/SA4E-48/diagrams/sse-handshake-sequence.drawio` and export to PNG.

```xml
<mxGraphModel adaptiveColors="auto">
  <root>
    <mxCell id="0"/>
    <mxCell id="1" parent="0"/>
    <!-- Lifelines -->
    <mxCell id="open-code" value="OpenCode CLI&#xa;(MCP Client)" style="html=1;shape=umlLifeline;perimeter=umlLifeline;whiteSpace=wrap;fontSize=11;" vertex="1" parent="1">
      <mxGeometry x="40" y="40" width="120" height="600" as="geometry"/>
    </mxCell>
    <mxCell id="wrapper" value="WrapperServer&#xa;(port 9186)" style="html=1;shape=umlLifeline;perimeter=umlLifeline;whiteSpace=wrap;fontSize=11;" vertex="1" parent="1">
      <mxGeometry x="340" y="40" width="120" height="600" as="geometry"/>
    </mxCell>
    <mxCell id="backend" value="Backend&#xa;REST API" style="html=1;shape=umlLifeline;perimeter=umlLifeline;whiteSpace=wrap;fontSize=11;" vertex="1" parent="1">
      <mxGeometry x="640" y="40" width="120" height="600" as="geometry"/>
    </mxCell>
    <!-- Messages -->
    <mxCell id="m1" value="GET /mcp (SSE connect)" style="html=1;verticalAlign=bottom;endArrow=blockThin;exitX=1;exitY=0.1;entryX=0;entryY=0.1;fontSize=11;" edge="1" parent="1" source="open-code" target="wrapper">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>
    <mxCell id="m2" value="200 + text/event-stream" style="html=1;verticalAlign=bottom;endArrow=blockThin;exitX=0;exitY=0.2;entryX=1;entryY=0.2;fontSize=11;strokeColor=#82b366;fillColor=#d5e8d4;" edge="1" parent="1" source="wrapper" target="open-code">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>
    <mxCell id="m3" value="event: endpoint&#xa;data: /mcp" style="html=1;verticalAlign=bottom;endArrow=blockThin;exitX=0;exitY=0.3;entryX=1;entryY=0.3;fontSize=11;strokeColor=#82b366;fillColor=#d5e8d4;" edge="1" parent="1" source="wrapper" target="open-code">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>
    <mxCell id="m4" value="event: message&#xa;data: initialized" style="html=1;verticalAlign=bottom;endArrow=blockThin;exitX=0;exitY=0.4;entryX=1;entryY=0.4;fontSize=11;strokeColor=#82b366;fillColor=#d5e8d4;" edge="1" parent="1" source="wrapper" target="open-code">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>
    <mxCell id="m5" value="keep-alive (every 15s)" style="html=1;verticalAlign=bottom;endArrow=blockThin;exitX=0;exitY=0.5;entryX=1;entryY=0.5;fontSize=11;strokeColor=#d6b656;fillColor=#fff2cc;dashed=1;" edge="1" parent="1" source="wrapper" target="open-code">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>
    <mxCell id="note1" value="MCP SDK SSEClientTransport&#xa;blocks until endpoint event&#xa;→ determines POST URL" style="html=1;shape=note;whiteSpace=wrap;fontSize=10;fillColor=#fff2cc;" vertex="1" parent="1">
      <mxGeometry x="160" y="160" width="160" height="50" as="geometry"/>
    </mxCell>
    <mxCell id="m6" value="POST /mcp (initialize)" style="html=1;verticalAlign=bottom;endArrow=blockThin;exitX=0;exitY=0.6;entryX=0;entryY=0.6;fontSize=11;" edge="1" parent="1" source="open-code" target="wrapper">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>
    <mxCell id="m7" value="200 + protocolVersion, capabilities" style="html=1;verticalAlign=bottom;endArrow=blockThin;exitX=0;exitY=0.7;entryX=1;entryY=0.7;fontSize=11;strokeColor=#82b366;fillColor=#d5e8d4;" edge="1" parent="1" source="wrapper" target="open-code">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>
    <mxCell id="m8" value="POST /mcp (notifications/initialized)" style="html=1;verticalAlign=bottom;endArrow=blockThin;exitX=0;exitY=0.8;entryX=0;entryY=0.8;fontSize=11;" edge="1" parent="1" source="open-code" target="wrapper">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>
    <mxCell id="m9" value="202 Accepted" style="html=1;verticalAlign=bottom;endArrow=blockThin;exitX=0;exitY=0.85;entryX=1;entryY=0.85;fontSize=11;strokeColor=#82b366;fillColor=#d5e8d4;" edge="1" parent="1" source="wrapper" target="open-code">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>
    <mxCell id="m10" value="POST /mcp (tools/list)" style="html=1;verticalAlign=bottom;endArrow=blockThin;exitX=0;exitY=0.9;entryX=0;entryY=0.9;fontSize=11;" edge="1" parent="1" source="open-code" target="wrapper">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>
    <mxCell id="m11" value="REST GET tools" style="html=1;verticalAlign=bottom;endArrow=blockThin;exitX=1;exitY=0.95;entryX=0;entryY=0.95;fontSize=11;" edge="1" parent="1" source="wrapper" target="backend">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>
    <mxCell id="m12" value="tool definitions" style="html=1;verticalAlign=bottom;endArrow=blockThin;exitX=0;exitY=0.95;entryX=1;entryY=0.95;fontSize=11;strokeColor=#82b366;fillColor=#d5e8d4;" edge="1" parent="1" source="backend" target="wrapper">
      <mxGeometry relative="1" as="geometry"/>
    </mxCell>
  </root>
</mxGraphModel>
```
