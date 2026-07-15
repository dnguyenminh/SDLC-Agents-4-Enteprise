# Functional Specification Document (FSD)

## SA4E — SA4E-37: Health Check & Auto-Reconnect for Child MCP Servers

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-37 |
| Title | Health Check & Auto-Reconnect for Child MCP Server Connections |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2025-07-27 |
| Status | Draft |
| Related BRD | documents/SA4E-37/BRD.md |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-07-27 | BA Agent | Initial FSD — translated from BRD requirements |
| 1.1 | 2025-07-27 | TA Agent | Technical enrichment — API contracts, integration specs, pseudocode, open issues |

---

## 1. Introduction

### 1.1 Purpose

This FSD specifies the functional behavior of the Health Check & Auto-Reconnect subsystem for McpClientManager. It translates the business requirements from the BRD into detailed use cases, state machines, API contracts, and data models that developers can implement.

### 1.2 Scope

- Periodic health check (ping) mechanism for all connected child MCP servers
- Automatic reconnection with exponential backoff when connections fail
- Connection state machine with observable state transitions
- Enhanced `getServersStatus()` API with health metadata
- Event-driven notification system for state changes

### 1.3 Definitions & Acronyms

| Term | Definition |
|------|------------|
| Child MCP Server | An external MCP-compliant server managed by McpClientManager (e.g., atlassian, stitch, markitdown) |
| Health Check | A periodic probe (ping) to verify that a connection to a child server is still alive |
| Exponential Backoff | A retry strategy where delay between attempts increases exponentially (1s, 2s, 4s, 8s...) |
| Silent Disconnect | A connection failure that occurs without explicit error notification to the caller |
| Jitter | Random variation (±20%) added to backoff delay to prevent thundering herd |
| Transport | The communication protocol layer (stdio, SSE, StreamableHTTP) used to connect to a child server |
| State Transition | A change in connection state that triggers events and logging |

### 1.4 References

| Document | Location |
|----------|----------|
| BRD | documents/SA4E-37/BRD.md |
| McpClientManager.ts | backend/src/modules/orchestration/McpClientManager.ts |
| HealthChecker.ts (pattern) | extension/src/connection/HealthChecker.ts |
| MCP SDK | @modelcontextprotocol/sdk |

---

## 2. System Overview

### 2.1 System Context Diagram

![System Context](diagrams/system-context.png)

The Health Check subsystem operates within McpClientManager, interacting with:
- **Child MCP Servers** — monitored targets (atlassian, stitch, markitdown, markdown-exporter-local, code-intel)
- **MCP SDK Client** — provides `client.listTools()` used as health probe
- **Pino Logger** — receives state transition logs
- **Event Consumers** — internal components subscribing to state change events
- **Node.js Timers** — `setInterval`/`setTimeout` for scheduling

### 2.2 System Architecture

The subsystem adds three logical components to McpClientManager:
1. **HealthMonitor** — orchestrates periodic pings for all servers
2. **ReconnectManager** — handles exponential backoff reconnection
3. **StateTracker** — manages per-server connection state and emits events

---

## 3. Functional Requirements

### 3.1 Feature: Periodic Health Check

**Source:** BRD Story 1

#### UC-01: Periodic Health Ping

**Use Case ID:** UC-01
**Actor:** System (Timer)
**Preconditions:** At least one child server is in `connected` state
**Postconditions:** All connected servers have been pinged; unhealthy servers identified

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Timer fires | | Health check interval (default 30s) elapses |
| 2 | | HealthMonitor | Collects list of all servers in `connected` state |
| 3 | | HealthMonitor | Initiates parallel ping (`client.listTools()`) for each server |
| 4 | | MCP Client | Sends `tools/list` request to child server with 5s timeout |
| 5 | | HealthMonitor | Receives successful response from child server |
| 6 | | StateTracker | Resets `consecutiveFailures` to 0, updates `lastHealthCheck` |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-01.1 | No servers in connected state | Skip ping cycle entirely; timer continues |
| AF-01.2 | Server responds slowly (1-4s) | Accept as healthy; response within timeout is valid |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-01.1 | Ping timeout (>5s) | Increment `consecutiveFailures`; if threshold reached → transition to `unhealthy` |
| EF-01.2 | Ping throws transport error | Increment `consecutiveFailures`; if threshold reached → transition to `unhealthy` |
| EF-01.3 | Ping returns protocol error | Increment `consecutiveFailures`; log error details at WARN level |

---

#### UC-02: Auto-Reconnect on Failure

**Use Case ID:** UC-02
**Actor:** System (ReconnectManager)
**Preconditions:** A server has transitioned to `unhealthy` state
**Postconditions:** Server is either reconnected (`connected`) or marked `failed`

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | | StateTracker | Detects server transition to `unhealthy`; triggers reconnect |
| 2 | | ReconnectManager | Transitions server to `reconnecting` state |
| 3 | | ReconnectManager | Calculates backoff delay with jitter |
| 4 | | Timer | Waits for calculated delay duration |
| 5 | | ReconnectManager | Closes existing client connection (if still open) |
| 6 | | ReconnectManager | Creates new transport based on stored server config |
| 7 | | MCP Client | Attempts connection with 10s timeout |
| 8 | | ReconnectManager | Connection succeeds; calls `client.listTools()` to re-register tools |
| 9 | | StateTracker | Transitions to `connected`; resets backoff state |
| 10 | | EventEmitter | Emits `server:reconnected` event |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-02.1 | Reconnect succeeds on first attempt | Steps 5-10 execute with initial delay (1s) |
| AF-02.2 | Manual reconnect triggered while auto-reconnect scheduled | Cancel scheduled attempt; execute immediately from initial state |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-02.1 | Reconnect attempt fails | Increment retry counter; double backoff delay (capped at 30s); schedule next attempt |
| EF-02.2 | Max retries (10) exhausted | Transition to `failed` state; emit `server:failed` event; stop reconnection |
| EF-02.3 | Server manually disconnected during reconnect | Cancel all pending reconnect attempts; transition to `disconnected` |

---

### 3.2 Feature: Connection State Tracking

**Source:** BRD Story 3

#### UC-03: Query Server Health Status

**Use Case ID:** UC-03
**Actor:** Developer/Consumer (API Caller)
**Preconditions:** McpClientManager is initialized
**Postconditions:** Caller receives current state of all servers

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Caller | | Invokes `getServersStatus()` |
| 2 | | StateTracker | Collects current state for each tracked server |
| 3 | | McpClientManager | Returns array of `ServerConnectionState` objects |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-03.1 | No servers registered | Return empty array |
| AF-03.2 | Server in reconnecting state | Include reconnect attempt count and next retry time |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-03.1 | Internal state corruption | Log error; return degraded status with `state: "unknown"` |

---

#### UC-04: Subscribe to State Change Events

**Use Case ID:** UC-04
**Actor:** Developer/Consumer (Event Subscriber)
**Preconditions:** McpClientManager instance exists
**Postconditions:** Listener registered; will be called on future state changes

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Consumer | | Calls `onServerStateChange(callback)` |
| 2 | | EventEmitter | Registers callback in listeners array |
| 3 | | StateTracker | (later) State changes occur |
| 4 | | EventEmitter | Invokes all registered callbacks with event data |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-04.1 | Multiple listeners registered | All listeners invoked sequentially; errors in one don't affect others |
| AF-04.2 | Listener registered after state change | Only receives future events; no replay of historical events |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-04.1 | Callback throws error | Catch error; log at WARN level; continue invoking remaining listeners |

---

### 3.3 Feature: Manual Reconnect Override

**Source:** BRD Story 2 (AC-6)

#### UC-05: Manual Reconnect of Failed Server

**Use Case ID:** UC-05
**Actor:** System Operator / API Caller
**Preconditions:** Server is in `failed` state (max retries exhausted)
**Postconditions:** Reconnection attempt restarted from initial state

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Operator | | Calls `reconnectServer(name)` |
| 2 | | ReconnectManager | Resets backoff state (attempts=0, delay=initial) |
| 3 | | StateTracker | Transitions from `failed` to `reconnecting` |
| 4 | | ReconnectManager | Executes reconnection (same as UC-02 steps 5-10) |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-05.1 | Server already connected | Return success immediately; no action needed |
| AF-05.2 | Server already reconnecting | Return current status; do not restart sequence |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-05.1 | Server name not found | Throw error: "Unknown server: {name}" |
| EF-05.2 | Server is manually disconnected | Throw error: "Cannot reconnect manually disconnected server" |

---

## 4. Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-01 | Health check interval MUST default to 30,000ms and be configurable per-server | BRD Story 1.1 |
| BR-02 | Health check MUST use `client.listTools()` as the ping mechanism | BRD Story 1.2 |
| BR-03 | Health checks MUST run in parallel for all connected servers using `Promise.allSettled()` | BRD Story 1.3 |
| BR-04 | Health check MUST NOT block or interfere with ongoing tool executions | BRD Story 1.4 |
| BR-05 | Health check timer MUST auto-start when server transitions to `connected` | BRD Story 1.5 |
| BR-06 | Health check timer MUST stop when server is manually disconnected | BRD Story 1.6 |
| BR-07 | Consecutive failure threshold before marking unhealthy MUST be configurable (default: 2) | BRD Risk 5.1 |
| BR-08 | Reconnect backoff sequence: initialDelay × multiplier^(attempt-1), capped at maxDelay | BRD Story 2.2 |
| BR-09 | Default backoff: initial=1000ms, multiplier=2, maxDelay=30000ms, maxRetries=10 | BRD Story 2.2-2.3 |
| BR-10 | Jitter of ±20% MUST be applied to calculated backoff delay | BRD Story 4.3 |
| BR-11 | On successful reconnect, ALL tools MUST be re-registered via fresh `listTools()` call | BRD Story 2.4 |
| BR-12 | On successful reconnect, backoff state MUST reset to initial values | BRD Story 2.5 |
| BR-13 | After max retries exhausted, server MUST be marked `failed` — no further auto-reconnect | BRD Story 2.6 |
| BR-14 | Tool calls to a `reconnecting` server MUST fail fast with clear error message | BRD Note |
| BR-15 | All state transitions MUST be logged at INFO level with structured data | BRD Story 3.2 |
| BR-16 | Each ping MUST have a 5-second timeout; exceeding = failed ping | BRD NFR |
| BR-17 | For stdio transport reconnect, the child process MUST be respawned | BRD Assumption |
| BR-18 | Old tool mappings MUST be cleared before re-registration on reconnect | BRD Risk 5.1 |
| BR-19 | State change events MUST include: serverName, previousState, newState, timestamp | BRD Story 5.3 |
| BR-20 | `server:reconnected` event MUST include reconnect duration (ms) | BRD Story 5 AC-4 |

---

## 5. State Machine: Connection States

### 5.1 State Diagram

![Connection State Machine](diagrams/state-connection.png)

### 5.2 States

| State | Description | Allowed Operations |
|-------|-------------|-------------------|
| `disconnected` | Server config exists but not connected | `connectServer()` |
| `connected` | Server is healthy and responding to pings | `executeTool()`, `disconnectServer()` |
| `unhealthy` | Ping failed; threshold breached; awaiting reconnect | None (transitional) |
| `reconnecting` | Active reconnection attempt in progress | `disconnectServer()` (cancels reconnect) |
| `failed` | Max retries exhausted; no auto-recovery | `reconnectServer()` (manual), `disconnectServer()` |

### 5.3 Transitions

| From | To | Trigger | Guard | Action |
|------|----|---------|-------|--------|
| `disconnected` | `connected` | `connectServer()` succeeds | — | Start health timer; register tools |
| `connected` | `unhealthy` | Consecutive ping failures >= threshold | `consecutiveFailures >= failureThreshold` | Stop health timer; emit `server:unhealthy` |
| `connected` | `disconnected` | `disconnectServer()` called | — | Stop health timer; close client; clear tools |
| `unhealthy` | `reconnecting` | Auto-reconnect triggered | — | Calculate first backoff delay; emit `server:reconnecting` |
| `reconnecting` | `connected` | Reconnect attempt succeeds | — | Re-register tools; reset backoff; restart health timer; emit `server:reconnected` |
| `reconnecting` | `reconnecting` | Reconnect attempt fails | `attempts < maxRetries` | Increment attempt; schedule next with doubled delay |
| `reconnecting` | `failed` | Reconnect attempt fails | `attempts >= maxRetries` | Emit `server:failed`; log final error |
| `reconnecting` | `disconnected` | `disconnectServer()` called | — | Cancel pending retry timer; clear state |
| `failed` | `reconnecting` | `reconnectServer()` (manual) | — | Reset backoff to initial; emit `server:reconnecting` |
| `failed` | `disconnected` | `disconnectServer()` called | — | Clear state |

---

## 6. Sequence Diagrams

### 6.1 Health Check Flow

![Health Check Sequence](diagrams/sequence-health-check.png)

### 6.2 Reconnect Flow

![Reconnect Sequence](diagrams/sequence-reconnect.png)

---

## 7. API Specifications

### 7.1 Enhanced `getServersStatus()`

**Endpoint:** Internal method (not HTTP)
**Purpose:** Return comprehensive health status for all managed child servers

**Output Data:**

```typescript
interface ServerStatusEntry {
  name: string;                    // Server identifier
  state: ConnectionState;          // 'connected' | 'unhealthy' | 'reconnecting' | 'failed' | 'disconnected'
  connected: boolean;              // Backward-compatible flag (true only if state === 'connected')
  toolCount: number;               // Number of registered tools from this server
  lastHealthCheck: string | null;  // ISO 8601 timestamp of last successful ping
  consecutiveFailures: number;     // Failed pings since last success
  reconnectAttempts: number;       // Current reconnect attempt count (0 if not reconnecting)
  lastError: string | null;        // Last error message (null if healthy)
  nextRetryAt: string | null;      // ISO 8601 timestamp of next scheduled retry (null if not reconnecting)
}
```

**Backward Compatibility:** Existing consumers using `{ name, connected, toolCount }` continue to work unchanged. New fields are additive.

---

### 7.2 `onServerStateChange(callback)`

**Purpose:** Register a listener for connection state change events

**Input Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| callback | `(event: ServerStateChangeEvent) => void` | Yes | Function invoked on each state transition |

**Event Payload:**

```typescript
interface ServerStateChangeEvent {
  serverName: string;           // Which server changed
  previousState: ConnectionState;
  newState: ConnectionState;
  timestamp: string;            // ISO 8601
  error?: string;               // Present if transition was due to error
  reconnectDuration?: number;   // Present on 'server:reconnected' — ms from first failure to recovery
}

type ConnectionState = 'connected' | 'unhealthy' | 'reconnecting' | 'failed' | 'disconnected';
```

**Returns:** `void`

**Business Error Scenarios:**

| Scenario | Behavior | Trigger Condition |
|----------|----------|-------------------|
| Callback is not a function | Throw TypeError | `typeof callback !== 'function'` |
| Callback throws during invocation | Log warning; continue notifying other listeners | Listener error |

---

### 7.3 `reconnectServer(name)`

**Purpose:** Manually trigger reconnection for a failed server

**Input Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| name | `string` | Yes | Server identifier to reconnect |

**Returns:** `Promise<void>` — resolves when reconnection initiated (not when connected)

**Business Error Scenarios:**

| Scenario | Error | Trigger Condition |
|----------|-------|-------------------|
| Server not found | `Error("Unknown server: {name}")` | Name not in server registry |
| Server is disconnected | `Error("Cannot reconnect manually disconnected server")` | State is `disconnected` |
| Server already connected | No-op; resolves immediately | State is `connected` |
| Server already reconnecting | No-op; resolves immediately | State is `reconnecting` |

---

## 8. Data Model

### 8.1 HealthCheckConfig Interface

```typescript
interface HealthCheckConfig {
  /** Ping interval in milliseconds (default: 30000) */
  interval: number;

  /** Ping timeout in milliseconds (default: 5000) */
  pingTimeout: number;

  /** Number of consecutive failures before marking unhealthy (default: 2) */
  failureThreshold: number;

  /** Initial reconnect delay in milliseconds (default: 1000) */
  initialDelay: number;

  /** Backoff multiplier per attempt (default: 2) */
  backoffMultiplier: number;

  /** Maximum backoff delay cap in milliseconds (default: 30000) */
  maxDelay: number;

  /** Maximum reconnect attempts before marking failed (default: 10) */
  maxRetries: number;

  /** Enable jitter on backoff delays (default: true) */
  jitterEnabled: boolean;

  /** Jitter range as decimal (default: 0.2 = ±20%) */
  jitterRange: number;
}
```

**Default Values:**

| Field | Default | Min | Max | Unit |
|-------|---------|-----|-----|------|
| interval | 30000 | 5000 | 300000 | ms |
| pingTimeout | 5000 | 1000 | 30000 | ms |
| failureThreshold | 2 | 1 | 10 | count |
| initialDelay | 1000 | 100 | 10000 | ms |
| backoffMultiplier | 2 | 1.5 | 4 | factor |
| maxDelay | 30000 | 5000 | 300000 | ms |
| maxRetries | 10 | 1 | 50 | count |
| jitterEnabled | true | — | — | boolean |
| jitterRange | 0.2 | 0 | 0.5 | decimal |

---

### 8.2 ServerConnectionState Interface

```typescript
interface ServerConnectionState {
  /** Server identifier */
  name: string;

  /** Current connection state */
  state: ConnectionState;

  /** Stored server configuration for reconnection */
  config: ServerConfig;

  /** Timestamp of last successful health check (null if never checked) */
  lastHealthCheck: string | null;

  /** Number of consecutive failed pings since last success */
  consecutiveFailures: number;

  /** Current reconnect attempt number (0 if not reconnecting) */
  reconnectAttempts: number;

  /** Last error message encountered */
  lastError: string | null;

  /** Timer ID for scheduled reconnect (null if not scheduled) */
  reconnectTimerId: ReturnType<typeof setTimeout> | null;

  /** Timestamp when current failure sequence started */
  failureStartedAt: string | null;

  /** Calculated next retry timestamp (null if not reconnecting) */
  nextRetryAt: string | null;
}
```

---

### 8.3 ServerConfig (stored for reconnection)

```typescript
interface ServerConfig {
  /** Transport type: 'stdio' | 'sse' | 'httpStream' */
  type: 'stdio' | 'sse' | 'httpStream';

  /** URL for SSE/httpStream transports */
  url?: string;

  /** Command for stdio transport */
  command?: string;

  /** Arguments for stdio transport */
  args?: string[];

  /** Environment variables for stdio transport */
  env?: Record<string, string>;

  /** Per-server health check config overrides (merged with global defaults) */
  healthCheck?: Partial<HealthCheckConfig>;
}
```

---

## 9. Processing Logic

### 9.1 Backoff Delay Calculation

**Trigger:** Reconnect attempt needed
**Input:** attempt number (1-based), HealthCheckConfig
**Output:** delay in milliseconds

**Algorithm:**

```
function calculateBackoffDelay(attempt: number, config: HealthCheckConfig): number {
  // Base delay with exponential growth
  const baseDelay = Math.min(
    config.initialDelay * Math.pow(config.backoffMultiplier, attempt - 1),
    config.maxDelay
  );

  // Apply jitter if enabled
  if (config.jitterEnabled) {
    const jitter = baseDelay * config.jitterRange;
    const randomOffset = (Math.random() * 2 - 1) * jitter; // -jitter to +jitter
    return Math.round(baseDelay + randomOffset);
  }

  return baseDelay;
}
```

**Example Sequence (default config, no jitter):**
| Attempt | Delay |
|---------|-------|
| 1 | 1,000ms |
| 2 | 2,000ms |
| 3 | 4,000ms |
| 4 | 8,000ms |
| 5 | 16,000ms |
| 6 | 30,000ms (capped) |
| 7-10 | 30,000ms (capped) |

---

### 9.2 Health Check Cycle

**Trigger:** Timer interval fires
**Input:** Map of ServerConnectionState
**Output:** Updated states, events emitted

**Processing Steps:**

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Filter servers where `state === 'connected'` | Empty list → skip cycle |
| 2 | For each server, create ping promise with timeout | — |
| 3 | Execute all pings with `Promise.allSettled()` | Individual failures don't block others |
| 4 | For fulfilled promises: reset `consecutiveFailures`, update `lastHealthCheck` | — |
| 5 | For rejected promises: increment `consecutiveFailures` | — |
| 6 | For servers where `consecutiveFailures >= failureThreshold`: transition to `unhealthy` | Emit event, trigger reconnect |

---

## 10. Error Handling

### 10.1 Error Scenarios

| Scenario | Severity | System Behavior | Recovery |
|----------|----------|----------------|----------|
| Single ping timeout | Info | Increment failure counter; no state change if below threshold | Auto-recovery on next successful ping |
| Consecutive failures reach threshold | Warning | Transition to `unhealthy`; trigger auto-reconnect | Auto-reconnect with backoff |
| Reconnect attempt fails | Warning | Schedule next attempt with increased delay | Automatic retry per backoff schedule |
| All retries exhausted | Critical | Mark server `failed`; emit event; stop auto-reconnect | Manual intervention via `reconnectServer()` |
| Tool call on `reconnecting` server | Warning | Reject immediately with descriptive error | Caller retries after `server:reconnected` event |
| Transport spawn failure (stdio) | Critical | Count as failed reconnect attempt | Next attempt re-spawns process |
| Multiple servers fail simultaneously | Warning | Each server reconnects independently with jitter preventing thundering herd | Independent recovery per server |

### 10.2 Error Messages for Tool Callers

| Server State | Error Message |
|-------------|---------------|
| `reconnecting` | `"Server '{name}' is currently reconnecting (attempt {N}/{max}). Tool call rejected."` |
| `failed` | `"Server '{name}' has failed after {max} reconnect attempts. Manual reconnection required."` |
| `unhealthy` | `"Server '{name}' is unhealthy. Reconnection will be attempted shortly."` |

---

## 11. Non-Functional Requirements

| Category | Requirement | Acceptance Criteria |
|----------|-------------|---------------------|
| Performance | Health check cycle completes within 5s per server | Ping timeout enforced at 5000ms |
| Performance | Health check does not block tool execution | Async execution; no shared locks |
| Concurrency | Support up to 20 simultaneous server connections | `Promise.allSettled()` for parallel pings |
| Reliability | Recover from transient failures within 60s | Default: 2 failures × 30s interval + 1s reconnect ≈ 61s |
| Observability | All state transitions logged at INFO level | Structured Pino log with server name, from/to state |
| Configuration | All timing parameters configurable | Via HealthCheckConfig per-server or global |
| Memory | Timer cleanup on server disconnect | Clear interval/timeout on `disconnectServer()` |
| Backward Compat | Existing `getServersStatus()` consumers unaffected | New fields are additive only |

---

## 12. Appendix

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | System Context | [system-context.png](diagrams/system-context.png) | [system-context.drawio](diagrams/system-context.drawio) |
| 2 | Health Check Sequence | [sequence-health-check.png](diagrams/sequence-health-check.png) | [sequence-health-check.drawio](diagrams/sequence-health-check.drawio) |
| 3 | Reconnect Sequence | [sequence-reconnect.png](diagrams/sequence-reconnect.png) | [sequence-reconnect.drawio](diagrams/sequence-reconnect.drawio) |
| 4 | Connection State Machine | [state-connection.png](diagrams/state-connection.png) | [state-connection.drawio](diagrams/state-connection.drawio) |

### Change Log from BRD

| Change | Rationale |
|--------|-----------|
| Added `failureThreshold` config (not in BRD) | Prevents false positives from single transient failures |
| Added `reconnectServer()` method | Implements BRD Story 2 AC-6 (manual reconnect of failed server) |
| Defined backward-compatible `getServersStatus()` | Existing code uses `{ name, connected, toolCount }` — new fields additive |
| Added `nextRetryAt` to status response | Enables consumers to show countdown/ETA for reconnection |

---

## 13. Technical Appendix A — Use Case Edge Cases (TA Review)

*Added by Technical Architect — v1.1*

### UC-01 Additional Exception Flows

| ID | Condition | Steps |
|----|-----------|-------|
| EF-01.4 | Health check fires while server is in `reconnecting` state | Skip server; do not ping reconnecting servers |
| EF-01.5 | `client.listTools()` returns empty array (0 tools) | Treat as healthy (connection alive); log at DEBUG level |
| EF-01.6 | Node.js event loop blocked during health check | Ping may fire late; no corrective action needed — next cycle catches up |

### UC-02 Additional Alternative/Exception Flows

| ID | Condition | Steps |
|----|-----------|-------|
| AF-02.3 | Server config changed (via REST API) during reconnect cycle | Cancel current reconnect; use updated config for next attempt |
| AF-02.4 | Multiple health check failures arrive simultaneously for same server | First failure triggers state transition; subsequent failures are no-ops while in `reconnecting` |
| EF-02.4 | Transport creation throws (e.g., invalid URL, missing command binary) | Log at ERROR; count as failed attempt; continue backoff schedule |
| EF-02.5 | `client.connect()` resolves but `listTools()` fails post-connect | Close the partially-connected client; count as failed attempt |

### UC-05 Additional Exception Flows

| ID | Condition | Steps |
|----|-----------|-------|
| EF-05.3 | Server config was removed from McpConfigService while in `failed` state | Throw error: "Server config not found for '{name}'" |


---

## 14. Technical Appendix B — Detailed API Contracts (TA Enrichment)

### 14.1 Full Method Signatures

```typescript
class McpClientManager {
  // EXISTING (unchanged signatures)
  async connectServer(name: string, config: ServerConfig): Promise<void>;
  async disconnectServer(name: string): Promise<void>;
  async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult>;
  getServersStatus(): ServerStatusEntry[];  // RETURN TYPE ENHANCED
  ownsTool(toolName: string): boolean;
  isServerConnected(name: string): boolean;
  getServerToolCount(name: string): number;

  // NEW — Health Check Lifecycle
  startHealthMonitor(): void;
  stopHealthMonitor(): void;

  // NEW — Manual Reconnect
  reconnectServer(name: string): Promise<void>;

  // NEW — Event Subscription
  onServerStateChange(callback: ServerStateChangeCallback): Unsubscribe;

  // NEW — Configuration
  setHealthCheckConfig(config: Partial<HealthCheckConfig>): void;
  setServerHealthCheckConfig(name: string, config: Partial<HealthCheckConfig>): void;
}

type ServerStateChangeCallback = (event: ServerStateChangeEvent) => void;
type Unsubscribe = () => void;
```


### 14.2 `onServerStateChange()` — Detailed Contract

```typescript
/**
 * Register a listener for server state transitions.
 * Returns an unsubscribe function to remove the listener.
 * @throws TypeError if callback is not a function
 */
onServerStateChange(callback: ServerStateChangeCallback): Unsubscribe;
```

**Error Isolation:** If a callback throws, the error is caught, logged at WARN level, and remaining callbacks continue. The throwing callback is NOT auto-unsubscribed.

### 14.3 `reconnectServer()` — Detailed Contract

```typescript
/**
 * Manually trigger reconnection for a server.
 * Resolves immediately after initiating (does NOT wait for success).
 * @throws Error("Unknown server: {name}") - server not tracked
 * @throws Error("Cannot reconnect manually disconnected server")
 *
 * State behavior:
 * - 'failed'       → reset backoff, start reconnection
 * - 'unhealthy'    → cancel pending, restart from initial
 * - 'reconnecting' → no-op (already in progress)
 * - 'connected'    → no-op
 * - 'disconnected' → throw error
 */
reconnectServer(name: string): Promise<void>;
```

### 14.4 `startHealthMonitor()` / `stopHealthMonitor()`

```typescript
/**
 * Start global health monitor. Idempotent.
 * Auto-called on first connectServer(). Timer fires every config.interval ms.
 */
startHealthMonitor(): void;

/**
 * Stop global health monitor. Idempotent.
 * Auto-called by shutdownAll(). Does NOT cancel per-server reconnect timers.
 */
stopHealthMonitor(): void;
```


### 14.5 `executeTool()` — Health-Aware Error Handling

The existing `executeTool()` must gate on server state before proxying:

```typescript
async executeTool(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
  const serverName = this.toolsToServer.get(toolName);
  if (!serverName) throw new Error(`Tool ${toolName} not managed by any server`);

  const serverState = this.serverStates.get(serverName);
  if (serverState && serverState.state !== 'connected') {
    throw new Error(this.getToolCallErrorMessage(serverName, serverState));
  }
  // ... existing proxy logic unchanged
}
```

### 14.6 REST API — `POST /api/mcp-servers/:name/reconnect` Update

Current endpoint does disconnect+connect synchronously. Must delegate to `reconnectServer()`:

```json
// Response (202 Accepted):
{ "name": "atlassian", "state": "reconnecting", "message": "Reconnection initiated" }
```


---

## 15. Technical Appendix C — Integration Requirements (TA Enrichment)

### 15.1 McpClientManager ↔ OrchestrationModule Integration

| Integration Point | Current | After SA4E-37 |
|---|---|---|
| `OrchestrationModule.initialize()` | `clientManager.initializeAll()` | + `clientManager.startHealthMonitor()` |
| `OrchestrationModule.shutdown()` | `clientManager.shutdownAll()` | `shutdownAll()` internally stops all timers |
| `orchestration_status` handler | `getServersStatus()` → simple | Returns enriched `ServerStatusEntry[]` |
| `execute_dynamic_tool` handler | Catches generic errors | Catches state-aware errors with messages |

### 15.2 McpClientManager ↔ McpConfigService Integration

**Problem:** `connectServer(name, config: any)` does NOT store config. Reconnection requires the original config.

**Solution:** Add `private serverConfigs: Map<string, ServerConfig>` — store config on `connectServer()`, remove on `disconnectServer()`.

### 15.3 Timer Strategy

| Timer | Type | Lifecycle |
|---|---|---|
| Global health interval | `setInterval` | `startHealthMonitor()` → `stopHealthMonitor()` |
| Per-server reconnect | `setTimeout` | Created per attempt, cleared on success/cancel |

`disconnectServer(name)` clears that server's timer. `shutdownAll()` clears ALL.

### 15.4 Structured Logging

```typescript
this.logger.info({
  event: 'server_state_change',
  server: name, from: previousState, to: newState,
  consecutiveFailures, reconnectAttempts,
}, `Server ${name}: ${previousState} → ${newState}`);
```


---

## 16. Technical Appendix D — Pseudocode (TA Enrichment)

### 16.1 Health Check Cycle Orchestration

```typescript
private async runHealthCheckCycle(): Promise<void> {
  const connected = Array.from(this.serverStates.entries())
    .filter(([_, s]) => s.state === 'connected');
  if (connected.length === 0) return;

  const pings = connected.map(([name]) => {
    const cfg = this.getEffectiveConfig(name);
    return this.pingServer(name, cfg.pingTimeout)
      .then(() => ({ name, ok: true as const }))
      .catch((err) => ({ name, ok: false as const, error: err.message }));
  });

  const results = await Promise.allSettled(pings);

  for (const r of results) {
    if (r.status === 'rejected') continue;
    const { name, ok, error } = r.value;
    const state = this.serverStates.get(name)!;
    if (ok) {
      state.consecutiveFailures = 0;
      state.lastHealthCheck = new Date().toISOString();
    } else {
      state.consecutiveFailures++;
      state.lastError = error ?? 'Ping failed';
      if (state.consecutiveFailures >= this.getEffectiveConfig(name).failureThreshold) {
        this.transitionState(name, 'unhealthy');
      }
    }
  }
}
```


### 16.2 Ping Server with Timeout

```typescript
private async pingServer(name: string, timeoutMs: number): Promise<void> {
  const client = this.clients.get(name);
  if (!client) throw new Error(`No client for ${name}`);
  await Promise.race([
    client.listTools(),  // BR-02
    new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error('Ping timeout')), timeoutMs)
    ),
  ]);
}
```

### 16.3 Reconnect Attempt with Backoff

```typescript
private async attemptReconnect(name: string): Promise<void> {
  const state = this.serverStates.get(name)!;
  const config = this.getEffectiveConfig(name);
  state.reconnectAttempts++;
  const delay = this.calculateBackoffDelay(state.reconnectAttempts, config);
  state.nextRetryAt = new Date(Date.now() + delay).toISOString();

  state.reconnectTimerId = setTimeout(async () => {
    try {
      // Close existing client if open
      const existing = this.clients.get(name);
      if (existing) { try { await existing.close(); } catch {} }
      this.clients.delete(name);

      // Recreate from stored config
      const serverConfig = this.serverConfigs.get(name)!;
      await this.connectServer(name, serverConfig);

      // Success — reset state
      state.reconnectAttempts = 0;
      state.consecutiveFailures = 0;
      state.nextRetryAt = null;
      state.reconnectTimerId = null;
      const duration = Date.now() - new Date(state.failureStartedAt!).getTime();
      this.transitionState(name, 'connected', { reconnectDuration: duration });
    } catch (err: any) {
      state.lastError = err.message;
      if (state.reconnectAttempts >= config.maxRetries) {
        this.transitionState(name, 'failed');
      } else {
        this.attemptReconnect(name); // Schedule next
      }
    }
  }, delay);
}
```


### 16.4 State Transition Engine

```typescript
private transitionState(name: string, newState: ConnectionState,
    extra?: { reconnectDuration?: number }): void {
  const state = this.serverStates.get(name)!;
  const previousState = state.state;
  if (previousState === newState) return;

  state.state = newState;
  const event: ServerStateChangeEvent = {
    serverName: name, previousState, newState,
    timestamp: new Date().toISOString(),
    error: state.lastError ?? undefined,
    reconnectDuration: extra?.reconnectDuration,
  };

  this.logger.info({ event: 'server_state_change', ...event },
    `Server ${name}: ${previousState} → ${newState}`);

  for (const cb of this.stateChangeListeners) {
    try { cb(event); }
    catch (err) { this.logger.warn({ err, server: name }, 'Listener threw'); }
  }

  // Side effect: unhealthy triggers reconnect
  if (newState === 'unhealthy') {
    state.failureStartedAt ??= new Date().toISOString();
    this.transitionState(name, 'reconnecting');
    this.attemptReconnect(name);
  }
}
```

### 16.5 Backoff Calculation with Jitter

```typescript
private calculateBackoffDelay(attempt: number, cfg: HealthCheckConfig): number {
  const base = Math.min(
    cfg.initialDelay * Math.pow(cfg.backoffMultiplier, attempt - 1),
    cfg.maxDelay
  );
  if (!cfg.jitterEnabled) return Math.round(base);
  const jitter = base * cfg.jitterRange;
  const offset = (Math.random() * 2 - 1) * jitter;
  return Math.max(0, Math.round(base + offset));
}
```


---

## 17. Technical Appendix E — Data Model Alignment (TA Review)

### 17.1 Codebase Discrepancies

| FSD Definition | Actual Codebase | Resolution |
|---|---|---|
| `ServerConfig.type` only | Codebase also uses `transportType` alias | Support both fields |
| No `disabled` field | `McpConfigService` has `disabled?: boolean` | Add — skip health checks for disabled |
| Config not stored in Manager | `connectServer(config: any)` — not retained | Add `serverConfigs` map |
| No `serverStates` map | Only `clients` map exists | Add `serverStates` map |
| `getServersStatus()` returns simple | `{ name, connected, toolCount }` | Extend additively |

### 17.2 Corrected ServerConfig (aligned with McpConfigService)

```typescript
interface ServerConfig {
  type?: 'stdio' | 'sse' | 'httpStream';
  transportType?: string;  // alias (backward compat)
  url?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  disabled?: boolean;
  autoApprove?: string[];
  healthCheck?: Partial<HealthCheckConfig>;
}
```

### 17.3 New Internal State (added to McpClientManager)

```typescript
private serverStates: Map<string, ServerConnectionState> = new Map();
private serverConfigs: Map<string, ServerConfig> = new Map();
private stateChangeListeners: ServerStateChangeCallback[] = [];
private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
private globalConfig: HealthCheckConfig = { /* defaults from 8.1 */ };
```


---

## 18. Technical Appendix F — Open Issues (TA Enrichment)

### OI-1: Stdio Transport Reconnect — Respawn vs Restart

| Option | Description | Recommendation |
|---|---|---|
| A: Kill + Respawn | Kill child process, create new transport | ✅ RECOMMENDED |
| B: SIGHUP restart | Not portable, platform-dependent | ❌ |
| C: Reuse transport | Risk corrupted state | ❌ |

**TA Recommendation:** Option A. Current `connectServer()` already creates fresh `StdioClientTransport`. Call `transport.close()` (kills child), then respawn.

**Decision owner:** SA during TDD.


### OI-2: Health Ping — `client.ping()` vs `client.listTools()`

| Option | Pros | Cons |
|---|---|---|
| `listTools()` | Validates protocol + registry | Heavier |
| `ping()` | Minimal, MCP spec | Only validates transport |

**TA Rec:** `listTools()` per BRD. Validates the capability we care about.


### OI-3: Timer — Single Global vs Per-Server

**TA Rec:** Single global `setInterval` (simplest). Per-server intervals can be deferred.


### OI-4: Event Pattern

**TA Rec:** Manual callback array (matches `HealthChecker.ts` pattern). Simple, typed.

### OI-5: Tool Mapping on Reconnect (Resolved — BR-18)

Clear old mappings, re-register from fresh `listTools()`. Pattern exists in `disconnectServer()`.


---

## 19. Security Review (TA Pre-Gate)

| # | Concern | Risk | Mitigation |
|---|---|---|---|
| 1 | Timer resource leak | Low | Clear all timers in disconnect/shutdown |
| 2 | Reconnect storm | Medium | Jitter + per-server independent scheduling |
| 3 | Stale client after reconnect | Medium | Always close old before new |
| 4 | Listener memory leak | Low | Unsubscribe function returned |
| 5 | Secrets in logs | Low | Only log name + state, never env/args |
| 6 | DoS via rapid reconnect | Low | No-op if already reconnecting |
| 7 | Zombie process (stdio) | Medium | transport.close() + SIGKILL fallback |

**Verdict:** No Critical/High issues. All mitigatable at implementation level.
