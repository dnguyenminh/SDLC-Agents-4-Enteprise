# Business Requirements Document (BRD)

## SDLC Agents for Enterprise (SA4E) — SA4E-42: find_tools does not re-index when child MCP server connects late

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-42 |
| Title | find_tools does not re-index when child MCP server connects late |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2026-02-14 |
| Status | Draft |
| Issue Type | Bug |
| Priority | Medium |
| Component | MCP orchestration backend (Node.js / Hono) |
| Labels | find-tools, mcp, orchestration |
| Architecture Pattern | ai-agent |

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
| 1.0 | 2026-02-14 | BA Agent | Initiate document — auto-generated from Jira ticket SA4E-42 |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |

---

## 1. Introduction

### 1.1 Scope

This BRD captures the business requirements for fixing a defect in the **MCP orchestration backend** where the semantic tool index used by `find_tools` becomes stale when a child MCP server connects after backend startup.

The orchestration backend maintains a semantic index (`mcp_tools` table with vector embeddings) of every tool exposed by connected child MCP servers. Agents discover tools through the mandatory two-step pattern: `find_tools` (semantic discovery) followed by `execute_dynamic_tool` (execution). Today, the semantic index is populated only once — during backend startup. When a child MCP server is disconnected at startup and reconnects later, its tools never enter the semantic index. As a result, `find_tools` cannot discover those tools even though the server reports `connected` and `execute_dynamic_tool` works for already-known tool names.

The scope of this change is to make the `find_tools` semantic index **refresh automatically** in response to child MCP server connect and disconnect events, so tool discovery stays consistent with the actual runtime state of connected servers — without requiring a backend restart.

### 1.2 Out of Scope

- Changes to the `find_tools` semantic ranking algorithm, embedding model, or similarity threshold behavior.
- Changes to the `execute_dynamic_tool` execution/routing path (it already works correctly for known tools).
- Changes to the health-check / auto-reconnect mechanism itself (delivered under SA4E-37). This ticket only *consumes* the connection state-change events it emits.
- Adding new child MCP servers or transports.
- UI changes (the orchestration backend is an ai-agent backend with no UI).

### 1.3 Preliminary Requirement

- The child MCP server health-check and auto-reconnect capability (SA4E-37) must be in place, since this fix subscribes to its connection state-change events (`onServerStateChange`).
- A working backend build with the Memory module (KB store, `mcp_tools` table) and Orchestration module (`find_tools`, `execute_dynamic_tool`, `orchestration_status`).

---

## 2. Business Requirements

### 2.1 High Level Process Map

Agents rely on a discover-then-execute contract to use tools that live on child MCP servers:

1. An agent calls `find_tools(query)` to semantically discover candidate tools.
2. The backend ranks tools stored in the `mcp_tools` semantic index and returns matches with their schemas.
3. The agent calls `execute_dynamic_tool(tool_name, arguments)` to run the chosen tool, which the orchestration layer proxies to the owning child server.

This contract breaks when the semantic index and the live set of connected child servers diverge. The desired business outcome is that **tool discovery always reflects the tools currently offered by connected child servers**, regardless of when those servers connected relative to backend startup. Detailed current vs expected behavior is in section 2.3.

### 2.2 List of User Stories / Use Cases

| # | Story / Use Case / Epic | Priority | Source Ticket |
|---|-------------------------|----------|---------------|
| 1 | As an AI agent, I want `find_tools` to discover tools from a child MCP server that connected after startup, so that I can complete tasks without a backend restart. | MUST HAVE | SA4E-42 |
| 2 | As an AI agent, I want `find_tools` to stop returning tools from a child MCP server that has disconnected, so that I do not attempt to execute unavailable tools. | MUST HAVE | SA4E-42 |
| 3 | As a backend developer, I want the semantic index to refresh automatically on child server connect/disconnect events, so that discovery stays consistent without manual intervention or restart. | MUST HAVE | SA4E-42 |
| 4 | As a platform operator, I want re-indexing to be low-latency and non-blocking, so that a reconnecting server does not degrade agent responsiveness. | SHOULD HAVE | SA4E-42 |

---

### 2.3 Details of User Stories

---

#### Business Flow

**Step 1:** Backend starts. The Orchestration module reads `orchestration.json` and attempts to connect to each configured child MCP server (e.g., atlassian).

**Step 2:** During startup, one child server (atlassian) is unreachable and stays `disconnected`. The remaining servers connect and their tools are ingested into the `mcp_tools` semantic index.

**Step 3:** Later, the atlassian child server becomes reachable. The health/auto-reconnect mechanism (SA4E-37) reconnects it; `orchestration_status` now reports it as `connected` with 72 tools.

**Step 4 (defect):** An agent calls `find_tools('jira create issue')`. Because the semantic index was populated only at startup — before atlassian connected — the query returns **empty tools**. The agent cannot discover `jira_create_issue`.

**Step 5 (defect workaround):** The agent falls back to calling `execute_dynamic_tool` directly with a known tool name (e.g., `jira_create_issue`), which still works because execution routing reads the live client manager, not the stale index.

**Step 6 (expected):** When the child server connect event fires, the backend refreshes the `find_tools` semantic index so the newly available tools are discoverable. `find_tools('jira create issue')` returns the expected tool set. Symmetrically, when a server disconnects, its tools are removed from the index.

> **Note:** The divergence exists because the execution path (`execute_dynamic_tool`) reads live connection state, while the discovery path (`find_tools`) reads a one-time snapshot built at startup. This ticket aligns the discovery path with runtime state.

---

#### STORY 1: Discover tools from a late-connecting child server

> As an AI agent, I want `find_tools` to discover tools from a child MCP server that connected after backend startup, so that I can complete tasks without requiring a backend restart.

**Requirement Details:**

1. When a child MCP server transitions into a `connected` state after startup (initial late connect or auto-reconnect), the backend MUST ingest that server's tools into the `find_tools` semantic index (name, description, schema, embedding vector).
2. After the index refresh completes, `find_tools` queries matching those tools MUST return them with correct schemas.
3. Re-indexing MUST NOT require a backend restart or any manual operator action.

**Current Behavior:**

- `find_tools('jira create issue')` returns empty tools after atlassian reconnects late.
- The tool remains undiscoverable until the backend is restarted.

**Expected Behavior:**

- Once atlassian is `connected` (72 tools), `find_tools('jira create issue')` returns `jira_create_issue` and related tools.

**Acceptance Criteria:**

1. Given atlassian is disconnected at startup, when it later reconnects and `orchestration_status` shows it `connected` with its full tool count, then `find_tools('jira create issue')` returns a non-empty result including `jira_create_issue` within the re-index latency target (see NFR).
2. The returned tool entries include valid, executable schemas usable by `execute_dynamic_tool`.
3. No backend restart is performed at any point during the scenario.
4. Tools that were already discoverable before the reconnect remain discoverable (no regression / no full-index loss).

**Error Handling:**

- If the child server reports `connected` but its `tools/list` fetch fails: the backend logs the error, leaves the previously indexed tools for that server unchanged, and does not crash the discovery path.

---

#### STORY 2: Stop discovering tools from a disconnected child server

> As an AI agent, I want `find_tools` to stop returning tools from a child MCP server that has disconnected, so that I do not attempt to execute tools that are no longer available.

**Requirement Details:**

1. When a child MCP server transitions to `disconnected` / `failed`, the backend MUST remove (or mark unavailable) that server's tools in the `find_tools` semantic index.
2. Tools belonging to still-connected servers MUST remain unaffected.

**Acceptance Criteria:**

1. Given atlassian is connected and its tools are discoverable, when atlassian disconnects, then `find_tools('jira create issue')` no longer returns atlassian tools after the index refresh.
2. Tools from other connected child servers continue to be discoverable and executable.
3. No stale atlassian tools are returned once the disconnect event has been processed.

**Error Handling:**

- If index removal fails for a server, the backend logs the error and retries on the next state-change event; it MUST NOT delete tools of other servers.

---

#### STORY 3: Automatic index refresh driven by connection state-change events

> As a backend developer, I want the semantic index to refresh automatically on child server connect/disconnect events, so that discovery stays consistent without manual intervention.

**Requirement Details:**

1. The re-index logic MUST subscribe to the orchestration connection state-change stream (`onServerStateChange`) already emitted by the client manager (SA4E-37).
2. On a transition into `connected`, the affected server's tools are ingested/updated in the index. On a transition into `disconnected`/`failed`, the affected server's tools are removed.
3. Re-indexing MUST be scoped to the affected server only where feasible, to avoid rebuilding the entire index on every event.
4. The refresh MUST be idempotent — repeated connect events for the same server MUST NOT create duplicate index entries.

**Acceptance Criteria:**

1. A single `connected` event for one server triggers exactly one incremental re-index for that server's tools.
2. Repeated connect/disconnect cycles for the same server leave the index in a correct, duplicate-free state (verified by tool count matching `orchestration_status`).
3. Events for one server do not remove or duplicate tools owned by another server.
4. The behavior is covered by automated tests that simulate late connect and disconnect without a restart.

**Error Handling:**

- Event processing errors are logged with the server name and do not stop future events from being processed (fail-soft, no swallowed exceptions).

---

#### STORY 4: Low-latency, non-blocking re-index

> As a platform operator, I want re-indexing to be low-latency and non-blocking, so that a reconnecting child server does not degrade agent responsiveness.

**Requirement Details:**

1. Index refresh MUST run asynchronously and MUST NOT block in-flight `find_tools` or `execute_dynamic_tool` calls.
2. The time from a `connected` event to the tools being discoverable MUST meet the re-index latency target (see NFR).

**Acceptance Criteria:**

1. During a re-index triggered by a reconnect, concurrent `execute_dynamic_tool` calls for already-known tools continue to succeed.
2. Newly connected tools become discoverable within the latency target after the `connected` event.

---

## 3. Dependencies

| Dependency | Type | Related Ticket | Description |
|------------|------|----------------|-------------|
| Child MCP server health-check & auto-reconnect | System | SA4E-37 | Provides the `onServerStateChange` connection state-change events this fix subscribes to. |
| Memory module `mcp_tools` table + embeddings | System | N/A | Semantic index storage (SQLite + ONNX vector embeddings) that must be updated on events. |
| Orchestration module (`find_tools`, `execute_dynamic_tool`, `orchestration_status`) | System | N/A | Discovery/execution surface impacted by the defect. |
| `orchestration.json` configuration | Infrastructure | N/A | Defines the child MCP servers and transports. |

---

## 4. Stakeholders

| Role | Name / Team | Responsibility | Source |
|------|-------------|----------------|--------|
| Reporter | SA4E Platform Team | Reported the discovery inconsistency | Ticket reporter |
| Backend Developer | MCP Orchestration Team | Implement re-index on state-change events | Component owner |
| AI Agents (consumers) | SDLC pipeline agents (BA/SA/DEV/QA/...) | Consume `find_tools` for tool discovery | Downstream consumers |
| Platform Operator | DevOps | Runs backend, monitors orchestration status | Ticket watcher |

---

## 5. Risks and Assumptions

### 5.1 Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Full index rebuild on every event causes latency spikes | Medium | Medium | Scope re-index to the affected server (incremental) rather than rebuilding all tools. |
| Race condition between reconnect event and `tools/list` fetch produces partial index | Medium | Medium | Only ingest after tools are fetched; make ingestion idempotent and retry on next event. |
| Duplicate index entries after repeated connect cycles | Medium | Medium | Upsert by tool name; idempotent ingestion keyed on server + tool name. |
| Disconnect removal accidentally deletes another server's tools | High | Low | Delete strictly scoped by owning server identifier. |
| Event stream not firing for the very first late connect | High | Low | Verify events fire for both initial late connect and subsequent auto-reconnect. |

### 5.2 Assumptions

- The client manager reliably emits state-change events for connect, disconnect, and reconnect (SA4E-37).
- Each proxied tool can be attributed to its owning child server for scoped add/remove.
- `execute_dynamic_tool` continues to route via live connection state and is unaffected by index changes.
- The embedding generation cost per tool is small enough to meet the latency target for a typical server (tens of tools).

---

## 6. Non-Functional Requirements

| Category | Requirement | Details |
|----------|-------------|---------|
| Performance (Re-index latency) | Newly connected server tools discoverable within ≤ 5 seconds of the `connected` event | Measured from state-change event to `find_tools` returning the tools; target for a server with ~72 tools. |
| Availability (No restart) | Re-index MUST occur at runtime with zero backend restarts | Restart-free is a hard acceptance condition for all stories. |
| Responsiveness (Non-blocking) | Re-index MUST NOT block concurrent `find_tools` / `execute_dynamic_tool` calls | Runs asynchronously off the request path. |
| Consistency | Index tool set MUST converge to match `orchestration_status` connected tool counts after events settle | No stale (disconnected) and no missing (late-connected) tools. |
| Idempotency | Repeated connect events MUST NOT create duplicate index entries | Upsert keyed by server + tool name. |
| Reliability | Event-processing failures MUST be logged and MUST NOT halt future event processing | Fail-soft; no swallowed exceptions. |
| Observability | Re-index actions (add/remove counts per server) SHOULD be logged | Enables operators to confirm index refresh occurred. |

---

## 7. Related Tickets

| Ticket Key | Summary | Status | Type | Relationship |
|------------|---------|--------|------|--------------|
| SA4E-42 | find_tools does not re-index when child MCP server connects late | Open | Bug | Main ticket |
| SA4E-37 | Child MCP server health check & auto-reconnect | Done | Story | Provides connection state-change events consumed by this fix |

---

## 8. Appendix

**Reproduction Steps (from ticket):**

1. Start backend while the atlassian child MCP server is unavailable/disconnected.
2. Bring the atlassian MCP server up so it reconnects; confirm `orchestration_status` shows it `connected` with 72 tools.
3. Call `find_tools('jira create issue')` → observe it returns **empty tools** (defect).
4. Call `execute_dynamic_tool` with a known tool name (e.g., `jira_create_issue`) → observe it still works.
5. Restart the backend → `find_tools('jira create issue')` now returns the tool (confirming the index is only built at startup).

**Impact:** Agents cannot discover tools of a child server that connects late. Any workflow relying on semantic discovery (rather than hard-coded tool names) fails until the backend is restarted, breaking the standard discover-then-execute contract for that server.

**Workaround (temporary):** Call `execute_dynamic_tool` directly with a known tool name. This bypasses discovery and only works if the agent already knows the exact tool name.

**Technical Reference (grounding, non-binding for design):**
- `backend/src/index.ts` — tools are ingested into `mcp_tools` once at startup using `orchestrationModule.getClientManager().getProxiedTools()`.
- `backend/src/modules/orchestration/OrchestrationModule.ts` — `find_tools` handler queries the `mcp_tools` table.
- `backend/src/modules/orchestration/McpClientManager.ts` — exposes `onServerStateChange(cb)` (SA4E-37) and `getProxiedTools()`, the natural hook point for triggering a re-index.

### Diagrams

![Business Flow](diagrams/business-flow.png)

![Use Case](diagrams/use-case.png)

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Business Flow — find_tools re-index on child server events | [business-flow.png](diagrams/business-flow.png) | [business-flow.drawio](diagrams/business-flow.drawio) |
| 2 | Use Case — Tool discovery consistency | [use-case.png](diagrams/use-case.png) | [use-case.drawio](diagrams/use-case.drawio) |

### Glossary

| Term | Definition | Avoid |
|------|------------|-------|
| find_tools | The orchestration backend tool that performs semantic discovery of available child-server tools by embedding the query and ranking entries in the `mcp_tools` index. Returns tool names and schemas. | search_tools, query_tools, tool_lookup |
| semantic index | The `mcp_tools` table (SQLite + ONNX vector embeddings) that stores each discoverable tool's name, description, schema, and vector, used by `find_tools` for cosine-similarity ranking. | cache, tool list, catalog |
| child MCP server | An external MCP server (e.g., atlassian) configured in `orchestration.json` whose tools are proxied by the orchestration backend. Has a transport type and connection state. | plugin, extension, sub-server, connector |
| orchestration | The backend module/subsystem that manages child MCP server connections, proxies tool calls, and exposes `find_tools`, `execute_dynamic_tool`, and `orchestration_status`. | routing, gateway, dispatcher |
| execute_dynamic_tool | The orchestration wrapper tool that executes a discovered tool by name, routing the call to the owning child server via live connection state. | call_tool, run_tool, invoke |
| re-index | The act of refreshing the `find_tools` semantic index (adding tools for a newly connected server, removing tools for a disconnected one) in response to connection state-change events, without restarting the backend. | rebuild, refresh-all, resync |
| connection state-change event | An event emitted by the client manager (SA4E-37) when a child server transitions between states (connected, unhealthy, reconnecting, failed, disconnected), subscribed via `onServerStateChange`. | ping, heartbeat, signal |

### Reference Documents

| Document | Link / Location |
|----------|-----------------|
| SA4E Architecture Report | .code-intel/SA4E-ARCHITECTURE.md |
| Dynamic Tool Execution Pattern | .kiro/steering/tool-usage-dynamic.md |
