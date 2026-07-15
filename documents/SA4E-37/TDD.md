# Technical Design Document (TDD)

## SA4E — SA4E-37: Health Check & Auto-Reconnect for Child MCP Servers

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-37 |
| Title | Health Check & Auto-Reconnect for Child MCP Server Connections |
| Author | SA Agent |
| Version | 1.0 |
| Date | 2025-07-27 |
| Status | Draft |
| Related BRD | BRD-v1-SA4E-37.docx |
| Related FSD | FSD-v1-SA4E-37.docx |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | SA Agent – Solution Architect | Create document |
| Peer Reviewer | BA Agent – Business Analyst | Review for BRD/FSD alignment |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-07-27 | SA Agent | Initial TDD — architecture design |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm the technical design in this TDD |
| | ☐ I agree and confirm the technical design in this TDD |

---

## 1. Introduction

> **Scope Boundary:** This TDD specifies HOW to implement the health check & auto-reconnect subsystem. Refer to FSD for functional requirements, state machine, and API contracts.

### 1.1 Purpose

Design a health monitoring and automatic reconnection subsystem for McpClientManager that detects silent disconnections of child MCP servers and recovers connections transparently using exponential backoff.

### 1.2 Scope

- New files: `HealthMonitor.ts`, `ReconnectManager.ts`, `ConnectionStateTracker.ts`, `types/health.ts`
- Modified files: `McpClientManager.ts`, `OrchestrationModule.ts`
- Integration with existing `McpConfigService` for stored server configs

### 1.3 Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Language | TypeScript | 5.x |
| Runtime | Node.js | 20.x |
| MCP SDK | @modelcontextprotocol/sdk | latest |
| Logger | Pino | 8.x |
| Timers | Node.js native setInterval/setTimeout | — |
| Build | tsup / tsc | — |

### 1.4 Design Principles

- **SOLID** — Each class has single responsibility; depend on abstractions
- **200-line file limit** — Enforced via separate files per concern
- **20-line function limit** — Small focused methods
- **Backward Compatible** — Existing `getServersStatus()` consumers unchanged
- **Event-driven** — Manual callback array (matching HealthChecker.ts pattern)

### 1.5 Constraints

- Single global `setInterval` for health check (OI-3 resolved)
- Ping via `client.listTools()` — no native MCP ping available (OI-2 resolved)
- Stdio reconnect = kill + respawn fresh transport (OI-1 resolved)
- Tool mapping on reconnect: clear old, re-register from fresh `listTools()` (OI-5 resolved)
- No EventEmitter class — manual callback array pattern (OI-4 resolved)

### 1.6 References

| Document | Location |
|----------|----------|
| BRD | BRD-v1-SA4E-37.docx |
| FSD | FSD-v1-SA4E-37.docx |
| McpClientManager.ts | backend/src/modules/orchestration/McpClientManager.ts |
| HealthChecker.ts (pattern) | extension/src/connection/HealthChecker.ts |
| McpConfigService.ts | backend/src/modules/orchestration/McpConfigService.ts |

---

## 2. System Architecture

### 2.1 Architecture Overview

The health check subsystem is composed of three collaborating classes injected into McpClientManager, following the Single Responsibility Principle:

1. **HealthMonitor** — Owns the global `setInterval` timer, pings all connected servers in parallel
2. **ReconnectManager** — Handles exponential backoff reconnection logic per server
3. **ConnectionStateTracker** — Manages per-server state, emits events via callback array

McpClientManager acts as the **Facade** coordinating these components and exposing the public API.

![Architecture Diagram](diagrams/architecture.png)

### 2.2 Component Diagram

![Component Diagram](diagrams/component.png)

| Component | Responsibility | File |
|-----------|---------------|------|
| HealthMonitor | Global timer, parallel ping, failure detection | `HealthMonitor.ts` |
| ReconnectManager | Backoff calculation, transport recreation, tool re-registration | `ReconnectManager.ts` |
| ConnectionStateTracker | State machine per server, event emission, status queries | `ConnectionStateTracker.ts` |
| McpClientManager | Facade — delegates to components, public API | `McpClientManager.ts` |
| types/health.ts | Shared interfaces, types, config defaults | `types/health.ts` |

### 2.3 Communication Patterns

| From | To | Pattern | Description |
|------|----|---------|-------------|
| HealthMonitor | McpClientManager | Callback | `onPingFailed(serverName)` notifies manager |
| McpClientManager | ReconnectManager | Method call | `scheduleReconnect(name, config)` |
| ReconnectManager | McpClientManager | Callback | `onReconnectSuccess(name, client)` / `onReconnectFailed(name)` |
| ConnectionStateTracker | Consumers | Callback array | `listeners.forEach(cb => cb(event))` |
| McpClientManager | ConnectionStateTracker | Method call | `transition(name, newState)` |

---

## 3. API Design

> Internal module — no HTTP endpoints. Method signatures defined in FSD §14.

### 3.1 Public Method Signatures (McpClientManager)

```typescript
// ENHANCED return type
getServersStatus(): ServerStatusEntry[];

// NEW — Health Monitor Lifecycle
startHealthMonitor(): void;
stopHealthMonitor(): void;

// NEW — Manual Reconnect
reconnectServer(name: string): Promise<void>;

// NEW — Event Subscription
onServerStateChange(cb: ServerStateChangeCallback): Unsubscribe;

// NEW — Configuration
setHealthCheckConfig(config: Partial<HealthCheckConfig>): void;
```

---

## 4. Database Design

> Not applicable — no database changes. State is held in-memory only.

---

## 5. Class / Module Design

### 5.1 Package Structure

```
backend/src/modules/orchestration/
├── McpClientManager.ts          # Facade (MODIFIED ~180 lines)
├── McpConfigService.ts          # Existing (unchanged)
├── McpConfigRoutes.ts           # Existing (unchanged)
├── OrchestrationModule.ts       # Existing (minor lifecycle hooks)
├── health/
│   ├── HealthMonitor.ts         # NEW (~120 lines)
│   ├── ReconnectManager.ts      # NEW (~150 lines)
│   └── ConnectionStateTracker.ts # NEW (~130 lines)
├── types/
│   └── health.ts                # NEW (~80 lines)
└── __tests__/
    ├── HealthMonitor.test.ts
    ├── ReconnectManager.test.ts
    └── ConnectionStateTracker.test.ts
```

### 5.2 File: `types/health.ts` (~80 lines)

```typescript
export type ConnectionState =
  | 'connected' | 'unhealthy' | 'reconnecting'
  | 'failed' | 'disconnected';

export interface HealthCheckConfig {
  interval: number;          // default 30000ms
  pingTimeout: number;       // default 5000ms
  failureThreshold: number;  // default 2
  initialDelay: number;      // default 1000ms
  backoffMultiplier: number; // default 2
  maxDelay: number;          // default 30000ms
  maxRetries: number;        // default 10
  jitterEnabled: boolean;    // default true
  jitterRange: number;       // default 0.2
}

export interface ServerStateChangeEvent {
  serverName: string;
  previousState: ConnectionState;
  newState: ConnectionState;
  timestamp: string;
  error?: string;
  reconnectDuration?: number;
}

export interface ServerStatusEntry {
  name: string;
  state: ConnectionState;
  connected: boolean;        // backward compat
  toolCount: number;
  lastHealthCheck: string | null;
  consecutiveFailures: number;
  reconnectAttempts: number;
  lastError: string | null;
  nextRetryAt: string | null;
}

export type ServerStateChangeCallback =
  (event: ServerStateChangeEvent) => void;
export type Unsubscribe = () => void;

export const DEFAULT_HEALTH_CONFIG: HealthCheckConfig = {
  interval: 30000, pingTimeout: 5000,
  failureThreshold: 2, initialDelay: 1000,
  backoffMultiplier: 2, maxDelay: 30000,
  maxRetries: 10, jitterEnabled: true, jitterRange: 0.2,
};
```

### 5.3 File: `health/ConnectionStateTracker.ts` (~130 lines)

**Responsibility:** Per-server state machine, validates transitions, emits events.

**Design Pattern:** Observer (manual callback array matching HealthChecker.ts).

Key methods:
- `register(name)` / `unregister(name)` — add/remove server tracking
- `transition(name, newState, error?)` — validate + update + emit
- `onStateChange(cb): Unsubscribe` — subscribe to events
- `recordPingSuccess(name)` / `recordPingFailure(name, error)` — update counters
- `isThresholdBreached(name, threshold): boolean` — check failure count
- `getAllStatuses(toolCountFn): ServerStatusEntry[]` — for getServersStatus()
- `resetReconnectState(name)` — reset backoff on success

### 5.4 File: `health/HealthMonitor.ts` (~120 lines)

**Responsibility:** Single global timer, parallel pings, failure detection.

Key methods:
- `start()` — creates single `setInterval`
- `stop()` — clears interval
- `runCycle()` — filters connected servers, `Promise.allSettled()` parallel ping
- `pingServer(name, client)` — `client.listTools()` with 5s timeout race

**Injection pattern:** Constructor receives callbacks for `onPingSuccess` and `onPingFailed`, plus a getter for connected servers map. This avoids circular dependency with McpClientManager.

### 5.5 File: `health/ReconnectManager.ts` (~150 lines)

**Responsibility:** Exponential backoff, transport recreation, tool re-registration.

Key methods:
- `scheduleReconnect(name, config, attempt)` — delay calc + setTimeout
- `attemptReconnect(name, config)` — close old, create transport, connect, listTools
- `cancelReconnect(name)` — clear pending timer
- `calculateDelay(attempt): number` — `min(initial * multiplier^(attempt-1), maxDelay) ± jitter`

**Transport recreation strategy:**

| Transport | Strategy |
|-----------|----------|
| stdio | Kill process, respawn with same command/args/env |
| sse | New `SSEClientTransport(url)` |
| httpStream | New `StreamableHTTPClientTransport(url)` |

**Tool re-registration on success:**
1. Clear old mappings for server from `toolsToServer`
2. Remove from `proxiedTools` array
3. Fresh `client.listTools()` call
4. Re-register all tools from response

### 5.6 Modified: `McpClientManager.ts` (~180 lines)

**Changes:**
1. Add `serverConfigs: Map<string, ServerConfig>` for reconnection
2. Inject `HealthMonitor`, `ReconnectManager`, `ConnectionStateTracker`
3. New public methods: `startHealthMonitor()`, `stopHealthMonitor()`, `reconnectServer()`, `onServerStateChange()`, `setHealthCheckConfig()`
4. `connectServer()` — store config, register state, auto-start monitor
5. `disconnectServer()` — cancel reconnect, unregister from tracker
6. `getServersStatus()` — delegate to `ConnectionStateTracker.getAllStatuses()`
7. `executeTool()` — fail fast if server not in `connected` state

**Backward compatibility:** `ServerStatusEntry` includes `connected: boolean` + `toolCount: number`.

### 5.7 Modified: `OrchestrationModule.ts`

- `initialize()` → call `clientManager.startHealthMonitor()` after init
- `shutdown()` → call `clientManager.stopHealthMonitor()` before shutdown

### 5.8 Design Patterns

| Pattern | Where | Rationale |
|---------|-------|-----------|
| Facade | McpClientManager | Hides health subsystem complexity |
| Observer | ConnectionStateTracker | Callback array for events |
| Strategy | ReconnectManager | Transport-specific reconnect |

### 5.9 Error Handling

| Scenario | Handler | Behavior |
|----------|---------|----------|
| Ping timeout | HealthMonitor | Increment failures via callback |
| Reconnect fails | ReconnectManager | Schedule next with backoff |
| Listener throws | StateTracker | Catch, log WARN, continue |
| executeTool on non-connected | McpClientManager | Throw descriptive error |
| Unknown server reconnect | McpClientManager | Throw "Unknown server" |

---

## 6. Integration Design

### 6.1 Integration: MCP SDK Client

| Attribute | Value |
|-----------|-------|
| Protocol | MCP (stdio/SSE/StreamableHTTP) |
| Health Probe | `client.listTools()` |
| Connect Timeout | 10,000ms |
| Ping Timeout | 5,000ms |
| Retry Policy | Exponential backoff 1s→30s, max 10 |

### 6.2 Integration: McpConfigService

ReconnectManager reads stored config from `McpClientManager.serverConfigs` map (populated at `connectServer()` time).

### 6.3 Integration: OrchestrationModule Lifecycle

```
initialize() → initializeAll() → startHealthMonitor()
shutdown()   → stopHealthMonitor() → shutdownAll()
```

---

## 7. Security Design

### 7.1 Threat Mitigation

| Threat | Mitigation |
|--------|-----------|
| Reconnect storm DDoS | Backoff + jitter + maxRetries cap |
| Stale tool mappings | Clear ALL old tools before re-register |
| Timer leak on shutdown | stopHealthMonitor clears all timers |
| Credential exposure in logs | Log only server name + state |

### 7.2 Input Validation

| Input | Validation |
|-------|-----------|
| `reconnectServer(name)` | Must exist in serverConfigs |
| `onServerStateChange(cb)` | typeof === 'function' or TypeError |
| `setHealthCheckConfig(cfg)` | Clamp to min/max from FSD §8.1 |

---

## 8. Performance & Scalability

### 8.1 Timer Efficiency

Single `setInterval` — all pings parallel via `Promise.allSettled()`. Cycle time = max single ping (≤5s).

### 8.2 Non-Blocking

- Pings are async, don't block tool execution
- `executeTool()` state check is synchronous O(1)
- Reconnect runs in background setTimeout

### 8.3 Targets

| Operation | Target |
|-----------|--------|
| Health cycle | ≤ 5s |
| getServersStatus() | < 1ms |
| Reconnect scheduling | < 1ms |
| Tool re-registration | ≤ 10s |

---

## 9. Monitoring & Observability

### 9.1 Logging

| Event | Level | Fields |
|-------|-------|--------|
| State transition | INFO | server, from, to, timestamp |
| Ping failure | DEBUG | server, error, consecutiveFailures |
| Threshold breached | WARN | server, failures, threshold |
| Reconnect scheduled | INFO | server, attempt, delay, nextRetryAt |
| Reconnect success | INFO | server, attempts, duration |
| Max retries exhausted | ERROR | server, totalAttempts |

---

## 10. Deployment Considerations

### 10.1 Configuration

All timing parameters configurable at runtime via `setHealthCheckConfig()`. No environment variables or config files needed — in-memory config with defaults.

### 10.2 Rollback Strategy

Purely additive feature. Rollback = revert McpClientManager to previous version. No data migration — all state in-memory.

---

## 11. Implementation Checklist

### Phase 1: Types & State Tracker

| # | Task | File | Est. Lines |
|---|------|------|-----------|
| 1.1 | Create `types/health.ts` with all interfaces + defaults | types/health.ts | ~80 |
| 1.2 | Create `ConnectionStateTracker` with state machine + events | health/ConnectionStateTracker.ts | ~130 |
| 1.3 | Unit tests for ConnectionStateTracker | __tests__/ConnectionStateTracker.test.ts | ~150 |

### Phase 2: Health Monitor

| # | Task | File | Est. Lines |
|---|------|------|-----------|
| 2.1 | Create `HealthMonitor` with timer + parallel ping | health/HealthMonitor.ts | ~120 |
| 2.2 | Unit tests for HealthMonitor (mock clients) | __tests__/HealthMonitor.test.ts | ~120 |

### Phase 3: Reconnect Manager

| # | Task | File | Est. Lines |
|---|------|------|-----------|
| 3.1 | Create `ReconnectManager` with backoff + transport recreation | health/ReconnectManager.ts | ~150 |
| 3.2 | Unit tests for ReconnectManager | __tests__/ReconnectManager.test.ts | ~150 |

### Phase 4: Integration

| # | Task | File | Est. Lines |
|---|------|------|-----------|
| 4.1 | Refactor McpClientManager — add serverConfigs, inject components | McpClientManager.ts | ~180 |
| 4.2 | Add lifecycle hooks in OrchestrationModule | OrchestrationModule.ts | +4 lines |
| 4.3 | Integration test: full health→reconnect cycle | __tests__/HealthReconnect.it.test.ts | ~100 |

### Phase 5: Backward Compatibility Verification

| # | Task | File |
|---|------|------|
| 5.1 | Verify existing `orchestration_status` handler works unchanged | OrchestrationModule.ts |
| 5.2 | Verify `executeTool` proxy still works for connected servers | McpClientManager.ts |
| 5.3 | Verify `execute_dynamic_tool` error messages for reconnecting servers | OrchestrationModule.ts |

---

## 12. Appendix

### Glossary

| Term | Definition |
|------|------------|
| Child MCP Server | External MCP-compliant server managed by McpClientManager |
| Health Ping | `client.listTools()` call verifying connection liveness |
| Backoff | Progressive delay between reconnect attempts |
| Jitter | ±20% random variation on calculated delay |

### Open Questions

| # | Question | Status | Answer |
|---|----------|--------|--------|
| 1 | Stdio reconnect? | Resolved | Kill + respawn (OI-1) |
| 2 | Ping method? | Resolved | client.listTools() (OI-2) |
| 3 | Timer approach? | Resolved | Single global setInterval (OI-3) |
| 4 | Event system? | Resolved | Manual callback array (OI-4) |
| 5 | Tool re-mapping? | Resolved | Clear old + fresh listTools (OI-5) |

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Architecture | [architecture.png](diagrams/architecture.png) | [architecture.drawio](diagrams/architecture.drawio) |
| 2 | Component | [component.png](diagrams/component.png) | [component.drawio](diagrams/component.drawio) |
