# Business Requirements Document (BRD)

## SA4E — SA4E-37: Add periodic health check and auto-reconnect for child MCP server connections in McpClientManager

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-37 |
| Title | Add periodic health check and auto-reconnect for child MCP server connections in McpClientManager |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2025-07-27 |
| Status | Draft |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | BA Agent – Business Analyst | Create document |
| Peer Reviewer | TA Agent – Technical Architect | Review document |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-07-27 | BA Agent | Initiate document — auto-generated from Jira ticket SA4E-37 |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |

---

## 1. Introduction

### 1.1 Scope

McpClientManager (backend orchestration module) quản lý kết nối tới các child MCP servers (atlassian, stitch, markitdown, markdown-exporter-local, code-intel). Hiện tại, kết nối chỉ được thiết lập một lần khi `connectServer()` được gọi — không có cơ chế health check hoặc keepalive. Khi child server idle quá lâu, kết nối bị ngắt "im lặng" (silent disconnect), dẫn đến tool call thất bại với lỗi không rõ ràng.

Scope của ticket này:
- Thêm periodic health check (ping) cho tất cả child MCP server connections
- Tự động reconnect khi phát hiện connection dead với exponential backoff
- Tracking connection state và reporting status
- Expose health metrics cho monitoring

### 1.2 Out of Scope

- Thay đổi transport protocol của child servers (stdio/sse/httpStream giữ nguyên)
- Health check cho backend server chính (đã có HealthChecker.ts ở extension layer)
- Retry logic cho individual tool calls (chỉ reconnect connection level)
- Load balancing giữa multiple instances của cùng một child server
- UI hiển thị health status (có thể làm ticket riêng)

### 1.3 Preliminary Requirement

- McpClientManager.ts đang hoạt động với `connectServer()` / `disconnectServer()` API
- @modelcontextprotocol/sdk đã hỗ trợ `client.listTools()` có thể dùng làm ping
- Extension layer HealthChecker.ts pattern có thể tham khảo cho design

---

## 2. Business Requirements

### 2.1 High Level Process Map

McpClientManager cần được bổ sung một subsystem health monitoring hoạt động song song với connection management hiện tại. Subsystem này sẽ:

1. Periodically ping mỗi connected child server
2. Detect khi server không phản hồi (unhealthy)
3. Tự động reconnect với exponential backoff
4. Report connection state changes cho consumers

Tham khảo business flow diagram tại Section 8.

![Business Flow](diagrams/business-flow.png)

### 2.2 List of User Stories / Use Cases

| # | Story / Use Case / Epic | Priority | Source Ticket |
|---|-------------------------|----------|---------------|
| 1 | As a system operator, I want child MCP server connections to be automatically monitored so that silent disconnections are detected early | MUST HAVE | SA4E-37 |
| 2 | As a system operator, I want failed connections to auto-reconnect so that tool calls recover without manual intervention | MUST HAVE | SA4E-37 |
| 3 | As a developer, I want connection state tracking so that I can query the health status of each child server | MUST HAVE | SA4E-37 |
| 4 | As a system operator, I want exponential backoff on reconnect so that a failing server is not overwhelmed with reconnect attempts | SHOULD HAVE | SA4E-37 |
| 5 | As a developer, I want health check events/callbacks so that I can react to connection state changes | SHOULD HAVE | SA4E-37 |

---

### 2.3 Details of User Stories

---

#### Business Flow

**Step 1:** McpClientManager connects to child servers via `connectServer()` (existing behavior unchanged)

**Step 2:** After successful connection, health monitor starts a periodic timer for that server

**Step 3:** Every interval (default 30s), health monitor sends a ping to the child server (using `tools/list` or `ping` method)

**Step 4:** If ping succeeds → server is healthy, reset failure counter

**Step 5:** If ping fails → mark server as unhealthy, increment failure counter

**Step 6:** If server is unhealthy → trigger auto-reconnect with exponential backoff

**Step 7:** On successful reconnect → mark server as connected, re-register tools, reset backoff

**Step 8:** On reconnect failure → increase backoff delay, schedule next attempt

**Step 9:** After max retries reached → mark server as permanently failed, emit event for operator notification

> **Note:** Health check should NOT block tool execution. If a tool call arrives while reconnecting, it should fail fast with a clear error message indicating reconnection in progress.

---

#### STORY 1: Periodic Health Check

> As a system operator, I want child MCP server connections to be automatically monitored so that silent disconnections are detected early.

**Requirement Details:**

1. Health monitor MUST ping each connected child server at a configurable interval (default: 30 seconds)
2. Ping mechanism MUST use `client.listTools()` as a lightweight health probe (validates both transport and protocol layer)
3. Health check MUST run in parallel for all connected servers (not sequential)
4. Health check MUST NOT interfere with ongoing tool executions
5. Health check timer MUST start automatically when a server is connected
6. Health check timer MUST stop when a server is manually disconnected

**Acceptance Criteria:**

1. GIVEN a connected child server WHEN 30 seconds elapse THEN health monitor sends a ping
2. GIVEN a healthy server WHEN ping succeeds THEN server status remains "connected"
3. GIVEN a server that has silently disconnected WHEN ping fails THEN server status changes to "unhealthy"
4. GIVEN multiple connected servers WHEN health check interval fires THEN all servers are pinged concurrently
5. GIVEN a manually disconnected server WHEN health check interval fires THEN no ping is sent to that server

---

#### STORY 2: Auto-Reconnect with Exponential Backoff

> As a system operator, I want failed connections to auto-reconnect so that tool calls recover without manual intervention.

**Requirement Details:**

1. When a server is detected unhealthy, system MUST automatically attempt to reconnect
2. Reconnect attempts MUST use exponential backoff: 1s → 2s → 4s → 8s → 16s → 30s (capped)
3. Maximum reconnect attempts MUST be configurable (default: 10)
4. On successful reconnect, tools MUST be re-registered (re-run `listTools()`)
5. On successful reconnect, backoff counter MUST reset to initial values
6. After max retries exhausted, server MUST be marked as "failed" and no further automatic reconnect attempts

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| initialDelay | number (ms) | No | First retry delay | 1000 |
| maxDelay | number (ms) | No | Maximum backoff cap | 30000 |
| maxRetries | number | No | Max reconnect attempts | 10 |
| backoffMultiplier | number | No | Multiplier per attempt | 2 |

**Acceptance Criteria:**

1. GIVEN an unhealthy server WHEN first reconnect attempt is triggered THEN delay is 1 second
2. GIVEN a failed reconnect WHEN next attempt is scheduled THEN delay doubles (exponential backoff)
3. GIVEN backoff delay exceeds 30s WHEN next attempt is scheduled THEN delay is capped at 30s
4. GIVEN a successful reconnect WHEN server becomes healthy THEN all tools are re-registered and available
5. GIVEN 10 failed reconnect attempts WHEN max retries exceeded THEN server is marked "failed" and reconnect stops
6. GIVEN a "failed" server WHEN operator manually triggers reconnect THEN the process restarts from initial state

---

#### STORY 3: Connection State Tracking

> As a developer, I want connection state tracking so that I can query the health status of each child server.

**Requirement Details:**

1. Each server connection MUST have a tracked state: `connected` | `unhealthy` | `reconnecting` | `failed` | `disconnected`
2. State transitions MUST be logged at INFO level
3. `getServersStatus()` MUST return current state, last health check time, and failure count
4. State MUST be queryable at any time without side effects

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| state | enum | Yes | Current connection state | "connected" |
| lastHealthCheck | ISO timestamp | Yes | Last successful ping time | "2025-07-27T10:30:00Z" |
| consecutiveFailures | number | Yes | Failed pings since last success | 3 |
| lastError | string | No | Last error message | "Connection timeout" |
| reconnectAttempts | number | Yes | Current reconnect attempt count | 2 |

**Acceptance Criteria:**

1. GIVEN a newly connected server WHEN `getServersStatus()` is called THEN state is "connected" with zero failures
2. GIVEN a server with failed ping WHEN state changes THEN log entry is written at INFO level
3. GIVEN a reconnecting server WHEN `getServersStatus()` is called THEN state shows "reconnecting" with attempt count
4. GIVEN a failed server WHEN `getServersStatus()` is called THEN state shows "failed" with total retry count and last error

---

#### STORY 4: Exponential Backoff Configuration

> As a system operator, I want exponential backoff on reconnect so that a failing server is not overwhelmed with reconnect attempts.

**Requirement Details:**

1. Backoff parameters MUST be configurable per-server or globally
2. Default backoff: initial=1s, multiplier=2, max=30s, maxRetries=10
3. Jitter SHOULD be added to prevent thundering herd (±20% randomization)
4. Backoff state MUST reset on successful reconnect

**Acceptance Criteria:**

1. GIVEN default configuration WHEN reconnect sequence starts THEN delays follow 1s, 2s, 4s, 8s, 16s, 30s, 30s...
2. GIVEN custom configuration (initial=2s, multiplier=3) WHEN reconnect starts THEN delays follow 2s, 6s, 18s, 30s...
3. GIVEN jitter enabled WHEN delay is calculated THEN actual delay varies ±20% from calculated value
4. GIVEN a successful reconnect after 5 failures WHEN next failure occurs THEN backoff restarts from 1s

---

#### STORY 5: Health Check Events/Callbacks

> As a developer, I want health check events/callbacks so that I can react to connection state changes.

**Requirement Details:**

1. McpClientManager MUST emit events on state transitions
2. Event types: `server:healthy`, `server:unhealthy`, `server:reconnecting`, `server:reconnected`, `server:failed`
3. Events MUST include server name, previous state, new state, and timestamp
4. Consumers can register listeners via `onServerStateChange(callback)` method

**Acceptance Criteria:**

1. GIVEN a registered listener WHEN server state changes THEN callback is invoked with event data
2. GIVEN multiple listeners WHEN state changes THEN all listeners are notified
3. GIVEN no listeners WHEN state changes THEN no error occurs (fire-and-forget)
4. GIVEN a reconnect success WHEN "server:reconnected" event fires THEN event includes reconnect duration

---

## 3. Dependencies

| Dependency | Type | Related Ticket | Description |
|------------|------|----------------|-------------|
| @modelcontextprotocol/sdk | System | N/A | MCP SDK client providing `Client.listTools()` for health probing |
| McpClientManager.ts | System | N/A | Existing connection management module to be enhanced |
| HealthChecker.ts (extension) | System | N/A | Reference pattern for periodic polling design |
| Node.js Timers | Infrastructure | N/A | `setInterval`/`setTimeout` for scheduling health checks |
| Pino Logger | System | N/A | Existing logger for connection state change logging |

---

## 4. Stakeholders

| Role | Name / Team | Responsibility | Source |
|------|-------------|----------------|--------|
| Developer | Backend Team | Implement health check and reconnect logic | SA4E-37 assignee |
| System Operator | DevOps Team | Monitor connection health, handle permanent failures | Operational concern |
| Architect | SA Agent | Design reconnect strategy and state machine | Technical review |

---

## 5. Risks and Assumptions

### 5.1 Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Health check ping adds overhead to child servers | Medium | Low | Use lightweight `listTools()` call; configurable interval |
| Reconnect storms when multiple servers fail simultaneously | High | Low | Jitter in backoff; stagger health checks |
| Tool re-registration after reconnect may have stale data | Medium | Medium | Full `listTools()` refresh on reconnect; clear old tool mappings |
| Stdio transport may not support graceful reconnect | High | Medium | Handle stdio specifically — may need to respawn process |
| Health check false positives during high load | Medium | Low | Allow configurable timeout per ping; consecutive failure threshold before marking unhealthy |

### 5.2 Assumptions

- `client.listTools()` is a valid and lightweight method to verify connection liveness
- Child MCP servers maintain persistent connections (not stateless HTTP per-request)
- Stdio-based child servers can be reconnected by re-spawning the process
- SSE and StreamableHTTP transports support reconnection with same URL
- The current McpClientManager retains server configuration (URL, command, args) for reconnection purposes

---

## 6. Non-Functional Requirements

| Category | Requirement | Details |
|----------|-------------|---------|
| Performance | Health check must complete within 5 seconds per server | Timeout after 5s → mark as failed ping |
| Performance | Health check must not block tool execution | Run asynchronously, do not hold locks during ping |
| Reliability | System must recover from transient failures within 60 seconds | With default backoff, 3 retries cover ~7 seconds |
| Scalability | Support up to 20 concurrent child server connections | Health checks run in parallel with Promise.allSettled |
| Observability | All state transitions must be logged | Pino logger at INFO level with structured data |
| Configuration | All timing parameters must be configurable | Via server config or environment variables |

---

## 7. Related Tickets

| Ticket Key | Summary | Status | Type | Relationship |
|------------|---------|--------|------|--------------|
| SA4E-37 | Add periodic health check and auto-reconnect for child MCP server connections | In Progress | Task | Main ticket |

---

## 8. Appendix

### Use Case Diagram

![Use Case Diagram](diagrams/use-case.png)

### Glossary

| Term | Definition |
|------|------------|
| Child MCP Server | An external MCP-compliant server managed by McpClientManager (e.g., atlassian, stitch, markitdown) |
| Health Check | A periodic probe (ping) to verify that a connection to a child server is still alive |
| Exponential Backoff | A retry strategy where delay between attempts increases exponentially (1s, 2s, 4s, 8s...) |
| Silent Disconnect | A connection failure that occurs without explicit error notification to the caller |
| Jitter | Random variation added to backoff delay to prevent multiple clients reconnecting simultaneously |
| Transport | The communication protocol layer (stdio, SSE, StreamableHTTP) used to connect to a child server |

### Reference Documents

| Document | Link / Location |
|----------|-----------------|
| McpClientManager.ts | backend/src/modules/orchestration/McpClientManager.ts |
| HealthChecker.ts (extension pattern) | extension/src/connection/HealthChecker.ts |
| MCP SDK Documentation | @modelcontextprotocol/sdk |

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Business Flow | [business-flow.png](diagrams/business-flow.png) | [business-flow.drawio](diagrams/business-flow.drawio) |
| 2 | Use Case Diagram | [use-case.png](diagrams/use-case.png) | [use-case.drawio](diagrams/use-case.drawio) |
