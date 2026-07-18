# Functional Specification Document (FSD)

## SDLC Agents for Enterprise (SA4E) — SA4E-42: find_tools does not re-index when child MCP server connects late

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-42 |
| Title | find_tools does not re-index when child MCP server connects late |
| Author | BA Agent |
| Version | 1.0 (Draft) |
| Date | 2026-02-14 |
| Status | Enriched — BA business sections + diagrams + TA technical appendix (§12) resolving OI-1..OI-5. Ready for Specification quality gate. |
| Related BRD | BRD-v1-SA4E-42.docx (documents/SA4E-42/BRD.md) |
| Issue Type | Bug |
| Component | MCP orchestration backend (Node.js / Hono) |
| Architecture Pattern | ai-agent |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-14 | BA Agent | Initial FSD draft from BRD (4 user stories). Business sections + diagrams. TA to enrich API contracts, request/response schemas, and pseudocode. |
| 1.1 | 2026-02-14 | TA Agent | Added Technical Appendix §12 resolving OI-1..OI-5 (event contract & subscription lifecycle, scoped upsert/delete SQL, owning-server column decision, concurrency/locking, re-index subscriber pseudocode, IR-1..IR-10). Updated §4.3 data model with explicit `server` column decision. No business-section changes; no requirement deviations. |

---

## 1. Introduction

### 1.1 Purpose

This FSD translates the business requirements in the SA4E-42 BRD into functional specifications for fixing the defect where the `find_tools` semantic index becomes stale when a child MCP server connects after backend startup. It defines the use cases, business rules, data specifications, processing logic, and error handling required so that tool discovery remains consistent with the live set of connected child MCP servers, without a backend restart.

### 1.2 Scope

Per BRD §1.1–§1.2, this specification covers the automatic refresh of the `find_tools` semantic index (`mcp_tools` table) in response to child MCP server connect and disconnect events. It functionally specifies:

- Re-indexing a server's tools when it transitions into `connected` (late connect or auto-reconnect).
- Removing a server's tools when it transitions into `disconnected` / `failed`.
- Idempotent, server-scoped, non-blocking, fail-soft behavior of the refresh.

Out of scope (per BRD): the semantic ranking algorithm / embedding model, the `execute_dynamic_tool` routing path, the health-check / auto-reconnect mechanism itself (SA4E-37 — only consumed here), and any new child servers, transports, or UI.

> **Technical scope note:** The physical event wiring (where the `onServerStateChange` subscription is registered), the exact upsert/delete SQL contract, and the concurrency/locking strategy are now specified in **§12 (Technical Appendix)**. Embedding batch sizing and physical architecture remain for the TDD.

### 1.3 Definitions & Acronyms

| Term | Definition |
|------|------------|
| find_tools | Orchestration tool that performs semantic discovery over the `mcp_tools` index and returns matching tool names + schemas. |
| execute_dynamic_tool | Orchestration wrapper that executes a discovered tool by name, routing to the owning child server via live connection state. |
| semantic index | The `mcp_tools` table (SQLite + ONNX vector embeddings) storing each discoverable tool's name, description, schema, category (owning server), and vector. |
| child MCP server | External MCP server (e.g., atlassian) configured in `orchestration.json`, proxied by the orchestration backend. |
| re-index | Refreshing the `mcp_tools` index (add tools for a newly connected server; remove tools for a disconnected one) in response to state-change events, without restart. |
| connection state-change event | `ServerStateChangeEvent` emitted by the client manager (SA4E-37) via `onServerStateChange`, carrying `serverName`, `previousState`, `newState`, `timestamp`, `error?`. |
| proxied tool | A tool exposed by a child MCP server, tracked in-memory by `McpClientManager` (`getProxiedTools()`), attributed to its owning server. |

### 1.4 References

| Document | Location |
|----------|----------|
| BRD | documents/SA4E-42/BRD.md |
| SA4E Architecture Report | .code-intel/SA4E-ARCHITECTURE.md |
| Dynamic Tool Execution Pattern | .kiro/steering/tool-usage-dynamic.md |
| Startup ingest reference | backend/src/index.ts |
| find_tools handler | backend/src/modules/orchestration/OrchestrationModule.ts |
| Client manager (events + proxied tools) | backend/src/modules/orchestration/McpClientManager.ts |
| Connection state types | backend/src/modules/orchestration/types/health.ts |
| mcp_tools DDL | backend/src/engine/db/schema.ts |

---

## 2. System Overview

### 2.1 System Context Diagram

![System Context](diagrams/system-context.png)

The orchestration backend sits between AI agents (discovery/execution consumers) and the configured child MCP servers. Agents call `find_tools` (reads the `mcp_tools` semantic index) and `execute_dynamic_tool` (routes to the owning child server via the `McpClientManager` live state). Child MCP servers emit connection state changes through the health/auto-reconnect subsystem (SA4E-37); this feature introduces a **Re-index Subscriber** that listens to those events and refreshes the `mcp_tools` index so discovery converges with the live server set.

### 2.2 System Architecture

Components involved (all within the existing backend; no new external systems):

- **Orchestration Module** — hosts `find_tools`, `execute_dynamic_tool`, `orchestration_status` handlers.
- **McpClientManager** — manages child server connections, exposes `onServerStateChange(cb)`, `getProxiedTools()`, `getServerToolCount(name)`, and maintains the tool→server attribution map.
- **Connection State Tracker (SA4E-37)** — emits `ServerStateChangeEvent` on every state transition.
- **Memory Module / `mcp_tools` table** — the semantic index (SQLite + ONNX embeddings) queried by `find_tools`.
- **Embedding Service** — generates the vector embedding for each tool's `name`/`description`.
- **Re-index Subscriber (NEW — functional component introduced by this ticket)** — subscribes to state-change events and applies scoped add/remove operations to the `mcp_tools` index.

Current defect: the index is populated **once** at startup in `backend/src/index.ts` (upsert by tool name). There is no subscription linking `onServerStateChange` to a refresh of the `mcp_tools` table, so late-connected servers never enter the index and disconnected servers' tools are never removed.

---

## 3. Functional Requirements

### 3.1 Feature: Re-index on late child-server connect

**Source:** BRD Story 1

#### 3.1.1 Description

When a child MCP server transitions into `connected` after startup (initial late connect or auto-reconnect), the backend ingests that server's current tools (name, description, schema, embedding vector) into the `mcp_tools` index so `find_tools` can discover them. No restart or manual action is required.

#### 3.1.2 Use Case

**Use Case ID:** UC-01 — Discover tools from a late-connecting child server
**Actor:** AI Agent (primary), Child MCP server + Re-index Subscriber (secondary/system)
**Preconditions:**
- Backend is running; a child server (e.g., atlassian) was `disconnected` at startup so its tools are absent from `mcp_tools`.
- SA4E-37 health/auto-reconnect is active and emits state-change events.

**Postconditions:**
- The late-connected server's tools exist in `mcp_tools` with valid schemas and embeddings.
- `find_tools` returns those tools; previously indexed tools remain intact.

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Child server becomes reachable | | atlassian connects after startup. |
| 2 | | McpClientManager | Transitions server to `connected`, registers proxied tools in memory. |
| 3 | | Connection State Tracker | Emits `ServerStateChangeEvent` (newState=`connected`). |
| 4 | | Re-index Subscriber | Receives event; fetches the server's tools via `getProxiedTools()` scoped to the server. |
| 5 | | Embedding Service | Generates embedding vectors for the server's tools. |
| 6 | | Re-index Subscriber | Upserts the server's tools into `mcp_tools` (idempotent, scoped by owning server). |
| 7 | AI Agent | | Calls `find_tools('jira create issue')`. |
| 8 | | find_tools handler | Returns `jira_create_issue` and related tools with schemas. |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | Auto-reconnect (not first connect) | Same flow triggered by a `reconnecting → connected` transition; stale entries for the server are refreshed/replaced rather than duplicated (BR-03). |
| AF-2 | Server already indexed and unchanged | Upsert keyed by tool name results in updates with no duplicates; net index state unchanged (BR-03). |
| AF-3 | Server reconnects with a changed tool set | Tools no longer present are removed and new tools added so the index matches the server's current `tools/list` (BR-04). |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | `tools/list` fetch fails after `connected` | Log error with server name; leave previously indexed tools for that server unchanged; do not crash discovery (BR-06, EH §9). |
| EF-2 | Index write (upsert) fails | Log error; retry on next state-change event; must not affect other servers' tools (BR-05, BR-06). |
| EF-3 | Embedding generation fails for a tool | Log and skip that tool; continue with remaining tools; retry on next event (BR-06). |

#### 3.1.3 Business Rules

See consolidated Business Rules table in §3.5. Primary rules: BR-01, BR-03, BR-04, BR-06, BR-07.

#### 3.1.4 Data Specifications

See consolidated Data Specifications in §4 (`mcp_tools` index schema).

---

### 3.2 Feature: Remove tools on child-server disconnect

**Source:** BRD Story 2

#### 3.2.1 Description

When a child MCP server transitions into `disconnected` / `failed`, the backend removes that server's tools from the `mcp_tools` index so `find_tools` stops returning tools that can no longer be executed. Tools of still-connected servers are unaffected.

#### 3.2.2 Use Case

**Use Case ID:** UC-02 — Stop discovering tools from a disconnected child server
**Actor:** AI Agent (primary), Child MCP server + Re-index Subscriber (secondary/system)
**Preconditions:**
- atlassian is `connected` and its tools are discoverable in `mcp_tools`.

**Postconditions:**
- atlassian tools are removed from `mcp_tools`; other servers' tools remain discoverable.

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Child server drops / is unreachable | | atlassian connection is lost or exhausts retries. |
| 2 | | McpClientManager | Transitions server to `disconnected` (or `failed`); clears in-memory proxied tools for the server. |
| 3 | | Connection State Tracker | Emits `ServerStateChangeEvent` (newState=`disconnected`/`failed`). |
| 4 | | Re-index Subscriber | Receives event; removes `mcp_tools` rows owned by that server only (BR-02, BR-05). |
| 5 | AI Agent | | Calls `find_tools('jira create issue')`. |
| 6 | | find_tools handler | Returns no atlassian tools; other servers' tools still returned. |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | Server transitions to `failed` (max retries exhausted) | Treated the same as `disconnected` for index removal purposes (BR-02). |
| AF-2 | Server was never indexed | Removal is a no-op; no error (BR-06). |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | Index removal fails | Log error with server name; retry on next state-change event; must not delete other servers' tools (BR-05, BR-06, EH §9). |

#### 3.2.3 Business Rules

Primary rules: BR-02, BR-05, BR-06.

---

### 3.3 Feature: Event-driven automatic index refresh

**Source:** BRD Story 3

#### 3.3.1 Description

The refresh logic subscribes to the orchestration connection state-change stream (`onServerStateChange`, SA4E-37). A transition into `connected` triggers a scoped ingest of that server's tools; a transition into `disconnected` / `failed` triggers a scoped removal. Processing is idempotent and scoped per server; a single event causes exactly one incremental refresh for the affected server.

#### 3.3.2 Use Case

**Use Case ID:** UC-03 — Automatic index refresh driven by state-change events
**Actor:** Connection State Tracker (event source), Re-index Subscriber (system)
**Preconditions:**
- The backend has registered a subscription via `onServerStateChange` during initialization.

**Postconditions:**
- The `mcp_tools` index converges to match `orchestration_status` connected tool counts after events settle (BR-08).

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | | Re-index Subscriber | On startup, registers a callback via `onServerStateChange`. |
| 2 | | Connection State Tracker | Emits a state-change event for a server. |
| 3 | | Re-index Subscriber | Routes by `newState`: `connected` → scoped ingest; `disconnected`/`failed` → scoped removal. |
| 4 | | Re-index Subscriber | Applies exactly one incremental refresh for that server (BR-07). |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | Intermediate states (`unhealthy`, `reconnecting`) | No index change; only terminal `connected` / `disconnected` / `failed` transitions trigger refresh actions. |
| AF-2 | Repeated connect/disconnect cycles | Index remains duplicate-free and correct; tool count matches `orchestration_status` after settling (BR-03, BR-08). |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | Callback throws while processing an event | Error is logged with server name; the subscriber continues to process future events (fail-soft, no swallowed exceptions) (BR-06). |

#### 3.3.3 Business Rules

Primary rules: BR-03, BR-05, BR-06, BR-07, BR-08.

---

### 3.4 Feature: Low-latency, non-blocking re-index

**Source:** BRD Story 4

#### 3.4.1 Description

The index refresh runs asynchronously off the request path and does not block in-flight `find_tools` or `execute_dynamic_tool` calls. Newly connected tools become discoverable within the latency target after the `connected` event.

#### 3.4.2 Use Case

**Use Case ID:** UC-04 — Non-blocking refresh with latency target
**Actor:** AI Agent (concurrent caller), Re-index Subscriber (system)
**Preconditions:**
- A re-index is triggered by a reconnect while agents are actively calling the backend.

**Postconditions:**
- Concurrent `execute_dynamic_tool` calls for known tools continue to succeed.
- Newly connected tools discoverable within ≤ 5 seconds of the `connected` event (NFR).

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | | Re-index Subscriber | Begins asynchronous refresh on `connected` event. |
| 2 | AI Agent | | Calls `execute_dynamic_tool` for an already-known tool during the refresh. |
| 3 | | execute_dynamic_tool handler | Routes via live connection state; call succeeds unaffected by the refresh. |
| 4 | | Re-index Subscriber | Completes ingest; tools become discoverable within the latency target. |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | Refresh still in progress when `find_tools` is called | `find_tools` returns the current index state; newly connecting tools appear once refresh completes (no blocking wait). |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | Refresh exceeds latency target | Log a warning with server name and elapsed time; tools still become discoverable once complete (observability, NFR). |

#### 3.4.3 Business Rules

Primary rules: BR-09, BR-06.

---

### 3.5 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-01 | On a child server transition into `connected` (late connect or auto-reconnect), the backend MUST ingest that server's current tools (name, description, schema, embedding vector) into the `mcp_tools` index. | BRD Story 1 |
| BR-02 | On a child server transition into `disconnected` or `failed`, the backend MUST remove that server's tools from the `mcp_tools` index. | BRD Story 2 |
| BR-03 | Ingestion MUST be idempotent — repeated `connected` events for the same server MUST NOT create duplicate index entries (upsert keyed by tool name). | BRD Story 3, NFR Idempotency |
| BR-04 | After a refresh, the indexed tool set for a server MUST match the server's current `tools/list` (tools removed upstream are removed from the index; new tools are added). | BRD Story 1 (AF-3) |
| BR-05 | Add/remove operations MUST be strictly scoped to the affected (owning) server; they MUST NOT add, modify, or delete tools belonging to other servers. | BRD Story 2/3, Risk table |
| BR-06 | Event-processing failures (tools/list fetch, embedding, index write/remove) MUST be logged with the server name and MUST NOT halt processing of future events (fail-soft, no swallowed exceptions). On failure, the affected server's prior index state is left unchanged and retried on the next event. | BRD Story 1/2/3 Error Handling, NFR Reliability |
| BR-07 | A single state-change event for one server MUST trigger exactly one incremental refresh for that server (no full-index rebuild per event). | BRD Story 3, Risk table |
| BR-08 | After events settle, the `mcp_tools` tool set MUST converge to match the connected tool counts reported by `orchestration_status` (no stale, no missing tools). | BRD NFR Consistency |
| BR-09 | Refresh MUST run asynchronously and MUST NOT block in-flight `find_tools` / `execute_dynamic_tool` calls. | BRD Story 4, NFR Responsiveness |
| BR-10 | Only terminal transitions (`connected`, `disconnected`, `failed`) trigger index actions; intermediate states (`unhealthy`, `reconnecting`) MUST NOT change the index. | Derived from Story 3 + connection state model (health.ts) |
| BR-11 | Re-index actions SHOULD log add/remove counts per server to allow operators to confirm the refresh occurred. | BRD NFR Observability |

---

## 4. Data Model

> **Note:** Logical data model only. Physical DDL, indexing strategy, and query patterns are specified in the TDD §4. Current DDL is referenced for grounding.

### 4.1 Entity Relationship Diagram

The feature operates on a single persisted entity (`mcp_tools`) plus a transient, in-memory attribution map (tool → owning server) held by `McpClientManager`. No new tables are introduced by this ticket; see §4.3 for a data gap flagged for TA/SA.

### 4.2 Logical Entities

#### Entity: mcp_tools (semantic tool index)

| Attribute | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| id | integer (PK, autoincrement) | Y | — | Surrogate identifier of the index row. |
| name | text (UNIQUE) | Y | BR-01, BR-03 | Tool name; unique across the index; upsert key for idempotency. |
| description | text | Y | BR-01 | Tool description; contributes to the embedding text. |
| schema_json | text (JSON) | Y | BR-01 | The tool's input schema, serialized; returned by `find_tools` for `execute_dynamic_tool`. |
| category | text | N | BR-05 | For proxied tools, holds the owning child server name (set to the server name at registration). Used as the scoping key for add/remove. See §4.3. |
| vector | blob (Float32 embedding) | N | BR-01 | Embedding vector of `name`/`description`, used for cosine-similarity ranking. |

**Relationships:**

| From Entity | To Entity | Cardinality | Description |
|-------------|-----------|-------------|-------------|
| child MCP server | mcp_tools | 1:N | One connected server owns many indexed tools (attributed via `category`). |
| mcp_tools | proxied tool (in-memory) | 1:1 | Each index row corresponds to one proxied tool tracked by `McpClientManager`. |

### 4.3 Data Gap — RESOLVED by TA (see §12.3, OI-3)

The current `mcp_tools` schema has no dedicated `server` column; for proxied tools the owning server is stored in `category` (set to the server name at registration in `McpClientManager.registerServerTools`). BR-05 (scoped-by-server add/remove) therefore relies on `category` as the scoping key.

**TA decision (OI-3):** Add an explicit, additive, nullable `server TEXT` column to `mcp_tools` (plus index `idx_mcp_tools_server`) rather than continuing to overload `category`. Full rationale, migration DDL, and the fallback analysis are in **§12.3**. The logical model below is updated accordingly.

**Updated logical attribute (additive):**

| Attribute | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| server | text (nullable) | N | BR-05 | Owning child-server name for proxied tools; `NULL` for local/core tools. Explicit scoping key for scoped upsert/delete. Populated at ingest/registration; `category` retains its functional-classification meaning. |

---

## 5. Integration Specifications

> **Note:** Business/functional view of internal integration points. Technical event contracts, subscription lifecycle, and threading are for TA/TDD §6.

### 5.1 Internal Integration: Connection State Tracker (SA4E-37)

| Attribute | Value |
|-----------|-------|
| Purpose | Provides connection state-change events that drive the index refresh. |
| Direction | Inbound (events consumed by the Re-index Subscriber). |
| Mechanism | `McpClientManager.onServerStateChange(cb)` returning an unsubscribe handle. |
| Frequency | Event-driven (on each server state transition). |

**Data Exchange (event payload — `ServerStateChangeEvent`):**

| Field | Description | Business Rule |
|-------|-------------|---------------|
| serverName | Owning server for the transition; scoping key for refresh. | BR-05 |
| previousState / newState | Connection states; only terminal `newState` values trigger actions. | BR-10 |
| timestamp | When the transition occurred; basis for latency measurement. | BR-09, NFR |
| error (optional) | Error context for failed/disconnected transitions; logged. | BR-06, BR-11 |

### 5.2 Internal Integration: McpClientManager tool source

| Attribute | Value |
|-----------|-------|
| Purpose | Supplies the current proxied tools for a connected server to ingest. |
| Direction | Inbound (queried during a `connected` refresh). |
| Mechanism | `getProxiedTools()` (all servers) + tool→server attribution; `getServerToolCount(name)` for convergence checks. |
| Frequency | On each `connected` event refresh. |

### 5.3 Internal Integration: Memory Module / mcp_tools + Embedding Service

| Attribute | Value |
|-----------|-------|
| Purpose | Persist the refreshed index rows and generate embeddings. |
| Direction | Outbound (writes/deletes to `mcp_tools`); embeddings generated per tool. |
| Mechanism | Upsert by tool name (add/update) and scoped delete (remove), mirroring startup ingest in `index.ts`. |
| Frequency | On each refresh action. |

---

## 6. Processing Logic

### 6.1 Late-connect re-index

**Trigger:** `ServerStateChangeEvent` with `newState = connected`.
**Schedule:** Event-driven, asynchronous (BR-09).
**Input:** `serverName`; the server's proxied tools.
**Output:** Upserted `mcp_tools` rows scoped to the server.

**Processing Steps:**

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Receive `connected` event, extract `serverName`. | If serverName missing/unknown → log, skip (BR-06). |
| 2 | Fetch the server's current proxied tools (scoped). | tools/list fetch fail → log, leave prior index unchanged, retry next event (EF-1, BR-06). |
| 3 | Generate embedding vector per tool. | Embedding fail for a tool → log, skip tool, continue (BR-06). |
| 4 | Upsert each tool into `mcp_tools` (idempotent, keyed by name). | Write fail → log, retry next event; do not affect other servers (BR-05, BR-06). |
| 5 | Remove index rows for the server that are no longer in its tool set. | Ensures index matches current `tools/list` (BR-04). |
| 6 | Log add/update/remove counts for the server. | Observability (BR-11). |

**Sequence Diagram:**

![Sequence — Late-connect Re-index](diagrams/sequence-late-connect.png)

### 6.2 Disconnect removal

**Trigger:** `ServerStateChangeEvent` with `newState = disconnected` or `failed`.
**Schedule:** Event-driven, asynchronous (BR-09).
**Input:** `serverName`.
**Output:** `mcp_tools` rows owned by the server removed.

**Processing Steps:**

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Receive `disconnected`/`failed` event, extract `serverName`. | If serverName missing → log, skip (BR-06). |
| 2 | Delete `mcp_tools` rows scoped to that server only. | Remove fail → log, retry next event; never delete other servers' tools (BR-05, BR-06). |
| 3 | Log removed count for the server. | Observability (BR-11). |

**Sequence Diagram:**

![Sequence — Disconnect Removal](diagrams/sequence-disconnect.png)

### 6.3 Connection state → index action mapping

The state machine (SA4E-37, `health.ts`) governs which transitions trigger index actions. Only terminal transitions act (BR-10).

**State Diagram:**

![State — Connection States to Index Actions](diagrams/state-connection.png)

| State (newState) | Index Action |
|------------------|--------------|
| connected | Scoped ingest/upsert of the server's tools (UC-01). |
| unhealthy | None (transient). |
| reconnecting | None (transient). |
| failed | Scoped removal of the server's tools (UC-02, AF-1). |
| disconnected | Scoped removal of the server's tools (UC-02). |

---

## 7. Security Requirements

> **Note:** Business-level only. This is an internal backend event/index feature with no new external interface or UI.

### 7.1 Authentication & Authorization

| Role | Permissions | Screens/Features |
|------|-------------|-------------------|
| AI Agent (consumer) | Invoke `find_tools`, `execute_dynamic_tool` (existing surface, unchanged). | Discovery + execution tools. |
| Platform Operator | Observe `orchestration_status` and re-index logs. | Operational monitoring. |

No new authentication or authorization surface is introduced. The re-index is an internal reaction to internal events.

### 7.2 Data Sensitivity Classification

| Data Type | Classification | Business Requirement |
|-----------|---------------|---------------------|
| Tool name / description / schema | Internal | Metadata describing tools; no user PII. Standard internal handling. |
| Embedding vector | Internal | Derived numeric representation; no sensitivity beyond internal. |

### 7.3 Audit Trail

| Event | Logged Fields | Retention | Business Reason |
|-------|--------------|-----------|-----------------|
| Re-index add/update | serverName, added/updated count, timestamp | Per existing log retention | Confirm late-connect discovery restored (BR-11). |
| Re-index remove | serverName, removed count, timestamp | Per existing log retention | Confirm stale tools removed on disconnect (BR-11). |
| Re-index failure | serverName, error, phase (fetch/embed/write) | Per existing log retention | Diagnose fail-soft events (BR-06). |

---

## 8. Non-Functional Requirements

> **Note:** Business-level targets carried from BRD §6. Technical implementation for TDD §8–§9.

| Category | Business Requirement | Acceptance Criteria |
|----------|---------------------|---------------------|
| Performance (Re-index latency) | Newly connected server tools discoverable quickly after the `connected` event. | ≤ 5 seconds from event to `find_tools` returning the tools (server with ~72 tools). |
| Availability (No restart) | Refresh occurs at runtime with zero backend restarts. | All UC scenarios pass without any restart. |
| Responsiveness (Non-blocking) | Refresh must not block concurrent discovery/execution. | Concurrent `execute_dynamic_tool` for known tools succeeds during refresh. |
| Consistency | Index converges to match connected tool counts after events settle. | `mcp_tools` count for a server equals `orchestration_status` toolCount. |
| Idempotency | Repeated connect events must not duplicate entries. | Tool count stable across repeated connect/disconnect cycles. |
| Reliability | Event-processing failures logged, never halt future events. | Fail-soft verified; no swallowed exceptions. |
| Observability | Re-index actions logged with per-server counts. | Add/remove counts appear in logs per event. |

---

## 9. Error Handling (User-Facing)

> **Note:** "User" here is the AI agent consumer and the platform operator. Technical log levels/destinations for TDD §9.

### 9.1 Error Scenarios

| Scenario | Severity | Message / Signal | Expected Behavior |
|----------|----------|------------------|-------------------|
| `tools/list` fetch fails after a `connected` event | Warning | Log: "re-index fetch failed for {server}" | Prior indexed tools for the server left unchanged; discovery path stays up; retried on next event (BR-06, UC-01 EF-1). |
| Index write (upsert) fails during ingest | Warning | Log: "re-index write failed for {server}" | Log and retry next event; other servers' tools untouched (BR-05, BR-06, UC-01 EF-2). |
| Embedding generation fails for a tool | Info/Warning | Log: "embedding failed for {tool} ({server})" | Skip the tool, continue with others; retried next event (BR-06, UC-01 EF-3). |
| Index removal fails on disconnect | Warning | Log: "re-index remove failed for {server}" | Log and retry next event; never delete other servers' tools (BR-05, BR-06, UC-02 EF-1). |
| Callback throws while handling an event | Warning | Log: "state-change handler error for {server}" | Subscriber continues processing future events (fail-soft, BR-06, UC-03 EF-1). |
| Refresh exceeds latency target | Info | Log: "re-index for {server} took {ms}ms (> target)" | Tools still become discoverable once complete; flagged for observability (UC-04 EF-1). |
| `find_tools` called mid-refresh | Info | Normal response | Returns current index state without blocking; new tools appear after refresh completes (BR-09, UC-04 AF-1). |

### 9.2 Notification Requirements

| Event | Who is Notified | Channel | Timing |
|-------|----------------|---------|--------|
| Re-index add/remove success | Platform Operator | Backend logs | Immediate (per event) |
| Re-index failure (any phase) | Platform Operator | Backend logs (warning) | Immediate (per event) |

---

## 10. Testing Considerations

### 10.1 Test Scenarios

| ID | Scenario | Input | Expected Output | Priority |
|----|----------|-------|-----------------|----------|
| TC-01 | Late connect makes tools discoverable | atlassian disconnected at startup, then connects | `find_tools('jira create issue')` returns `jira_create_issue` within ≤5s; no restart | High |
| TC-02 | Previously indexed tools survive a late connect | Other servers connected at startup | Their tools remain discoverable after atlassian late-connect refresh | High |
| TC-03 | Disconnect removes tools | atlassian connected then disconnects | `find_tools` no longer returns atlassian tools; other servers' tools remain | High |
| TC-04 | `failed` state removes tools | atlassian exhausts max retries → `failed` | atlassian tools removed from index | Medium |
| TC-05 | Idempotent repeated connects | Multiple connect events for same server | No duplicate rows; count matches `orchestration_status` | High |
| TC-06 | Scoped operations | Connect/disconnect one server | Other servers' tools never added/removed by the event | High |
| TC-07 | Non-blocking refresh | Concurrent `execute_dynamic_tool` during refresh | Known-tool execution succeeds throughout | Medium |
| TC-08 | Fail-soft on fetch error | Force `tools/list` failure on connect | Error logged; prior index unchanged; future events still processed | Medium |
| TC-09 | Convergence after cycles | Repeated connect/disconnect cycles | Final index tool set matches connected counts | Medium |

---

## 12. Technical Appendix (TA Enrichment)

> **Author:** TA Agent. **Scope:** Resolves OI-1..OI-5 and adds the integration detail DEV needs to implement SA4E-42. Grounded in the actual code: `backend/src/index.ts`, `OrchestrationModule.ts`, `McpClientManager.ts`, `types/health.ts`, `engine/db/schema.ts`. No TDD/architecture content and no production code — pseudocode and contracts only.

### 12.1 OI-1 — Event contract & subscription lifecycle

#### 12.1.1 Event contract (`ServerStateChangeEvent`)

Emitted by `ConnectionStateTracker` and surfaced through `McpClientManager.onServerStateChange(cb)`. Exact shape from `types/health.ts`:

| Field | Type | Nullable | Meaning / use by subscriber |
|-------|------|----------|------------------------------|
| `serverName` | `string` | N | Owning server; the scoping key for every add/remove (BR-05). |
| `previousState` | `ConnectionState` | N | Prior state; used only for logging/diagnostics. |
| `newState` | `ConnectionState` | N | Drives routing: `connected` → ingest; `disconnected`/`failed` → remove; others → no-op (BR-10). |
| `timestamp` | `string` (ISO-8601) | N | Basis for latency measurement vs the ≤5s target (BR-09/NFR). |
| `error` | `string` | Y | Present on `unhealthy`/`failed`/`disconnected`; logged (BR-06/BR-11). |
| `reconnectDuration` | `number` (ms) | Y | Present on reconnect transitions; log as observability signal. |

`ConnectionState` enum: `connected | unhealthy | reconnecting | failed | disconnected`.

Subscription API (from `McpClientManager`):

```ts
onServerStateChange(cb: ServerStateChangeCallback): Unsubscribe
// ServerStateChangeCallback = (event: ServerStateChangeEvent) => void
// Unsubscribe = () => void   ← MUST be retained and called on shutdown
```

#### 12.1.2 Which transitions actually fire (from `VALID_TRANSITIONS` + call sites)

| newState | Emitted from (code path) | Index action |
|----------|--------------------------|--------------|
| `connected` | `connectServer` (startup/late), `handleReconnectSuccess` (auto-reconnect) | Scoped ingest (UC-01) |
| `unhealthy` | `handlePingFailed` after threshold breach | None (BR-10) |
| `reconnecting` | `handlePingFailed`, `reconnectServer` | None (BR-10) |
| `failed` | `handleMaxRetriesExhausted` | Scoped removal (UC-02 AF-1) |
| `disconnected` | `disconnectServer` (manual/shutdown) | Scoped removal (UC-02) |

#### 12.1.3 Subscription lifecycle — DECISION

**Register the subscription inside `OrchestrationModule.initialize()`, AFTER `await this.clientManager.initializeAll()` and `this.clientManager.startHealthMonitor()`. NOT in `index.ts`.**

Rationale (grounded in code):

1. **Ownership** — `OrchestrationModule` already holds both collaborators the subscriber needs: `this.clientManager` (event source + `getProxiedTools()`) and `this.registry` (to lazily resolve the `memory` module's DB at event time). `index.ts` is a one-shot bootstrap and should not own a long-lived runtime subscription.
2. **Avoids double-ingest of the startup burst** — During `clientManager.initializeAll()`, each successful `connectServer` calls `stateTracker.transition(name, 'connected')`, which fires a `connected` event. If the subscriber were registered *before* `initializeAll()`, it would race with the one-shot startup ingest in `index.ts` (which runs after `registry.initializeAll()`), causing duplicate work. Registering *after* `initializeAll()` means the startup connect-burst is handled solely by the `index.ts` ingest, and the subscriber handles only **runtime** transitions (late connect, auto-reconnect, disconnect, failed). This preserves BR-03 idempotency by construction.
3. **Memory-module readiness** — Modules initialize in parallel (`registry.initializeAll()`), so `memory` may not be `ready` while `orchestration.initialize()` runs. The subscriber callback therefore MUST resolve the DB **lazily at event time** (`registry.getModule('memory')`, check `status === 'ready'`), never capture it at registration. Runtime events always fire well after startup, so `memory` is ready by then.
4. **Clean teardown** — Store the returned `Unsubscribe` handle as a field (e.g., `private unsubscribeStateChange?: Unsubscribe`) and invoke it in `OrchestrationModule.shutdown()` before `clientManager.shutdownAll()`.

> **⚠️ Ordering nuance DEV MUST honor (from code):** In `connectServer` the state transitions to `connected` **before** `registerServerTools()` runs, whereas in `handleReconnectSuccess` tools are registered **before** the `connected` transition. Because the subscriber is registered after `initializeAll()`, it only ever observes the reconnect path at runtime — where `getProxiedTools()` is already populated for the server when the event fires. The subscriber should still be defensive: if the filtered proxied-tool set for a `connected` event is empty, treat it as a no-op (do not delete) and rely on the next event, per BR-06.

---

### 12.2 OI-2 — SQL contract (scoped upsert & scoped delete)

Reuses the exact column set and upsert shape of the startup ingest in `index.ts`, extended with the explicit `server` scoping key (OI-3, §12.3). All statements are prepared statements with bound parameters (no string interpolation).

#### 12.2.1 Scoped upsert (on `connected`) — idempotent, keyed by unique `name`

```sql
-- 1) Probe (per tool)
SELECT id FROM mcp_tools WHERE name = @name;

-- 2a) INSERT when absent
INSERT INTO mcp_tools (name, description, schema_json, category, server, vector)
VALUES (@name, @description, @schema_json, @category, @server, @vector);

-- 2b) UPDATE when present (idempotent refresh — BR-03)
UPDATE mcp_tools
   SET description = @description,
       schema_json = @schema_json,
       category    = @category,
       server      = @server,
       vector      = @vector
 WHERE id = @id;
```

- `@category` = owning server name (unchanged from current proxied-tool behavior, kept for backward compatibility of `find_tools`).
- `@server` = owning server name (new explicit scoping key).
- `@vector` = `Buffer.from(new Float32Array(await EmbeddingService.getInstance().generateEmbedding(text)).buffer)`, where `text = \`Tool: ${name}\nDescription: ${description}\`` (identical to `index.ts`).

#### 12.2.2 Prune tools removed upstream (BR-04) — after upserting the current set

```sql
-- Remove rows for this server whose name is no longer in the current tool set.
-- Placeholders (?, ?, ...) are generated to match the current tool-name count.
DELETE FROM mcp_tools
 WHERE server = @server
   AND name NOT IN (/* @name_1, @name_2, ... current tool names */);
```

Edge case: if the server currently exposes **zero** tools on a `connected` event (unexpected), skip the prune (empty `NOT IN` is unsafe) and log per BR-06 — do not wipe the server's rows.

#### 12.2.3 Scoped delete (on `disconnected` / `failed`) — BR-02, BR-05

```sql
DELETE FROM mcp_tools WHERE server = @server;
```

Returns affected-row count for the observability log (BR-11). No-op when the server was never indexed (AF-2) — zero rows deleted, no error.

#### 12.2.4 Atomicity

Wrap the full per-server operation (all upserts + the prune for `connected`, or the single delete for `disconnected`/`failed`) in one `better-sqlite3` `db.transaction(...)`, mirroring `ingestTools` in `index.ts`. Embedding generation is async and MUST complete **before** opening the transaction (better-sqlite3 transactions are synchronous and must not `await`). This holds the write lock only briefly and never across an `await`.

---

### 12.3 OI-3 — Owning-server column: DECISION

**Recommendation: Add an explicit, additive, nullable `server TEXT` column to `mcp_tools` (with a supporting index). Do NOT keep overloading `category`.**

**Migration DDL (additive, backward-compatible — follows the SA4E-41 `project_id` precedent already in `schema.ts`):**

```sql
ALTER TABLE mcp_tools ADD COLUMN server TEXT;              -- NULL for local/core tools
CREATE INDEX IF NOT EXISTS idx_mcp_tools_server ON mcp_tools(server);
```

Also update the base DDL in `schema.ts` so fresh installs include the column:

```sql
CREATE TABLE IF NOT EXISTS mcp_tools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  schema_json TEXT NOT NULL,
  category TEXT,
  server TEXT,          -- SA4E-42: explicit owning child-server (NULL = local/core tool)
  vector BLOB
);
```

**Rationale:**

| # | Reason |
|---|--------|
| 1 | **Removes semantic overloading.** For core tools `category` is a functional class (`orchestration`, `general`, ...); for proxied tools `index.ts`/`registerServerTools` overload it with the server name. A dedicated `server` column separates these two concerns cleanly. |
| 2 | **Makes BR-05 safe by construction.** `DELETE ... WHERE server = ?` can never match a local/core tool (their `server` is `NULL`). Relying on `category = <serverName>` risks matching a core tool whose functional category coincidentally equals a server name — the schema does not prevent that collision. For a defect ticket whose core requirement is *strictly scoped* deletes, eliminating that latent risk is the correct call. |
| 3 | **Indexable scoped operations.** `idx_mcp_tools_server` makes scoped delete/prune index-backed; today `getServerToolCount` does an O(n) in-memory scan of `toolsToServer`. |
| 4 | **Additive & low-risk.** New nullable column + `IF NOT EXISTS` index. `find_tools` uses `SELECT *` and ignores unknown columns, so no read-path change. Startup ingest and `registerServerTools` simply also set `server`. |

**Fallback (reuse `category`) — acceptable but NOT recommended:** functionally works today because live server names (`atlassian`, `markdown-exporter`) don't collide with core categories, and requires no migration. Rejected because the safety of BR-05 would depend on an unenforced naming assumption rather than the schema.

**Attribution touch-points to update when adopting `server`:**
- `index.ts` startup ingest: set `server = tool.category` for proxied tools, `server = NULL` for `registry.getAllToolDefinitions()` (local) tools.
- `McpClientManager.registerServerTools`: continue setting `category: name`; the re-index subscriber sets `server = name` at upsert time (it already knows `serverName` from the event).

---

### 12.4 OI-4 — Concurrency / locking

**Runtime model (from code):** the backend is single-threaded (Node event loop) and `better-sqlite3` is synchronous, so individual SQL statements and `db.transaction(...)` blocks cannot interleave. The real hazard is **`await` interleaving** between event handlers: embedding generation and `client.listTools()`/`getProxiedTools()` reads yield the loop, so two handlers for the **same** server (e.g., `connected` quickly followed by `disconnected`, or reconnect-flapping) can interleave at `await` points and apply writes out of order (e.g., a delete landing between another event's upserts).

**Strategy — per-server serialized queue (async mutex) + latest-state guard + debounce:**

| Mechanism | Rule |
|-----------|------|
| **Per-server serialization** | Maintain `Map<serverName, Promise>` — a promise chain per server. Each incoming event appends its task to that server's chain, so tasks for one server run strictly sequentially. **Different servers run concurrently** (safe: disjoint `server` scopes, BR-05). |
| **Debounce / coalesce** | Collapse rapid repeated events for the same server within a short window (recommend **250 ms**) so connect/disconnect flapping yields one refresh for the latest terminal state (supports BR-07). |
| **Latest-state guard (staleness check)** | At the start of a task, re-read `clientManager` live state (`isServerConnected(serverName)` / `getServersStatus()`). If it no longer matches the event's `newState`, **skip** — a newer event's task will reconcile. Prevents acting on stale events. |
| **Atomic write** | The per-server upsert+prune (or delete) runs inside one `db.transaction(...)` (§12.2.4). |
| **Fail-soft isolation** | A throw inside one server's task is caught, logged with `serverName` + phase, and MUST NOT reject the shared subscriber callback or block other servers' chains (BR-06). |

This satisfies BR-07 (one incremental refresh per settled event), BR-05 (scope isolation), and BR-09 (all work is async, off the `find_tools`/`execute_dynamic_tool` request path).

---

### 12.5 OI-5 — Re-index subscriber pseudocode

> Pseudocode only (not production code). Illustrates registration, routing, per-server serialization, and the connect/disconnect handlers. Encapsulate as a `ReindexSubscriber` collaborator owned by `OrchestrationModule` (keeps files within the code-standards size limits).

```text
# ---- Registration (in OrchestrationModule.initialize, AFTER initializeAll + startHealthMonitor) ----
function registerReindexSubscriber(clientManager, registry, logger):
    perServerChain = Map<string, Promise>          # async mutex per server
    debounceTimers = Map<string, Timer>

    unsubscribe = clientManager.onServerStateChange(event ->
        # Only terminal states act (BR-10)
        if event.newState not in {connected, disconnected, failed}: return

        # Debounce/coalesce rapid flapping for the same server (BR-07)
        clearTimer(debounceTimers[event.serverName])
        debounceTimers[event.serverName] = setTimer(250ms, () ->
            enqueue(event.serverName, () -> handleEvent(event, clientManager, registry, logger))
        )
    )
    store unsubscribe on module   # called in shutdown()

# ---- Per-server serialized queue ----
function enqueue(serverName, task):
    prev = perServerChain[serverName] or resolvedPromise()
    next = prev.then(task).catch(err ->
        logger.warn({server: serverName, err}, "state-change handler error")  # BR-06 fail-soft
    )
    perServerChain[serverName] = next

# ---- Event router ----
function handleEvent(event, clientManager, registry, logger):
    memory = registry.getModule('memory')
    if memory is null or memory.status != 'ready':
        logger.warn({server: event.serverName}, "memory not ready; skip, will retry next event"); return   # BR-06
    db = memory.getEngine().getDb()

    started = now()
    if event.newState == connected:
        # Latest-state guard: ignore stale event (OI-4)
        if not clientManager.isServerConnected(event.serverName): return
        reindexConnected(db, clientManager, event.serverName, logger)
    else:   # disconnected | failed
        if clientManager.isServerConnected(event.serverName): return   # superseded by a newer connect
        reindexRemoved(db, event.serverName, logger)
    elapsed = now() - started
    if elapsed > 5000ms: logger.info({server: event.serverName, ms: elapsed}, "re-index exceeded target")  # UC-04 EF-1

# ---- Connect handler (UC-01): scoped upsert + prune ----
function reindexConnected(db, clientManager, serverName, logger):
    tools = clientManager.getProxiedTools().filter(t -> t.category == serverName)
    if tools.isEmpty():
        logger.warn({server: serverName}, "no proxied tools on connect; no-op")   # defensive (§12.1.3)
        return

    # Async work FIRST (must not await inside the transaction)
    prepared = []
    for tool in tools:
        try:
            text   = "Tool: " + tool.name + "\nDescription: " + tool.description
            vector = Buffer.from(Float32Array(await embeddingService.generateEmbedding(text)))
            prepared.push({ name: tool.name, description: tool.description,
                            schema_json: JSON.stringify(tool.inputSchema or {}),
                            category: serverName, server: serverName, vector })
        except e:
            logger.warn({server: serverName, tool: tool.name, err: e}, "embedding failed; skip tool")  # BR-06 (EF-3)

    if prepared.isEmpty(): return
    currentNames = prepared.map(p -> p.name)

    # Atomic scoped write (BR-03 upsert, BR-04 prune, BR-05 scope)
    tx = db.transaction(items ->
        for it in items:
            existing = db.prepare("SELECT id FROM mcp_tools WHERE name = ?").get(it.name)
            if existing is null:
                db.prepare("INSERT INTO mcp_tools (name, description, schema_json, category, server, vector) VALUES (?,?,?,?,?,?)")
                  .run(it.name, it.description, it.schema_json, it.category, it.server, it.vector)
            else:
                db.prepare("UPDATE mcp_tools SET description=?, schema_json=?, category=?, server=?, vector=? WHERE id=?")
                  .run(it.description, it.schema_json, it.category, it.server, it.vector, existing.id)
        # prune tools removed upstream (skip if empty set)
        placeholders = join("?", ",", count=currentNames.length)
        db.prepare("DELETE FROM mcp_tools WHERE server = ? AND name NOT IN (" + placeholders + ")")
          .run(serverName, ...currentNames)
    )
    try:
        tx(prepared)
        logger.info({server: serverName, upserted: prepared.length}, "re-index add/update done")  # BR-11
    except e:
        logger.warn({server: serverName, err: e}, "re-index write failed; retry next event")       # BR-06 (EF-2)

# ---- Disconnect/failed handler (UC-02): scoped delete ----
function reindexRemoved(db, serverName, logger):
    try:
        info = db.prepare("DELETE FROM mcp_tools WHERE server = ?").run(serverName)
        logger.info({server: serverName, removed: info.changes}, "re-index remove done")            # BR-11
    except e:
        logger.warn({server: serverName, err: e}, "re-index remove failed; retry next event")       # BR-06 (UC-02 EF-1)
```

---

### 12.6 Integration Requirements (consolidated for DEV)

| # | Requirement | Source / Grounding | Rules |
|---|-------------|--------------------|-------|
| IR-1 | Subscribe to `clientManager.onServerStateChange(cb)` in `OrchestrationModule.initialize()` after `initializeAll()`+`startHealthMonitor()`; retain `Unsubscribe`; call it in `shutdown()`. | §12.1.3; `McpClientManager.onServerStateChange` | BR-07, BR-09 |
| IR-2 | Route by `event.newState`: `connected`→ingest, `disconnected`/`failed`→remove, else no-op. | §12.1.2; `VALID_TRANSITIONS` | BR-01, BR-02, BR-10 |
| IR-3 | Read the server's tools from `clientManager.getProxiedTools()` filtered by `category === serverName` (no separate `tools/list` call needed at runtime; reconnect path pre-populates them). | §12.1.3; `registerServerTools`, `handleReconnectSuccess` | BR-01, BR-04 |
| IR-4 | Generate embeddings via `EmbeddingService.getInstance().generateEmbedding(text)` with `text = "Tool: {name}\nDescription: {description}"`; store as `Buffer.from(new Float32Array(vector).buffer)`. | `index.ts` startup ingest | BR-01 |
| IR-5 | Persist via scoped upsert + prune (connect) or scoped delete (disconnect/failed) using the SQL in §12.2, inside one `db.transaction`. | §12.2; `ingestTools` in `index.ts` | BR-03, BR-04, BR-05 |
| IR-6 | Add `server` column + `idx_mcp_tools_server` (additive migration) and populate it at ingest/registration. | §12.3; SA4E-41 `project_id` precedent | BR-05 |
| IR-7 | Serialize per-server work (async mutex), debounce 250 ms, and apply a latest-state guard against `clientManager` before writing. | §12.4 | BR-05, BR-07 |
| IR-8 | Resolve the `memory` module DB lazily at event time; if not `ready`, log and skip (retry on next event). Never capture the DB at registration. | §12.1.3; parallel `registry.initializeAll()` | BR-06 |
| IR-9 | Fail-soft: catch/log every phase (embed/write/remove) with `serverName`; never reject the shared callback or block other servers. Log add/update/remove counts. | §12.4, §12.5 | BR-06, BR-11 |
| IR-10 | Do not expose proxied tools flatly at root (`getToolDefinitions` intentionally omits them); discovery stays via `find_tools`. | `OrchestrationModule.getToolDefinitions` comment | Scope guard |

---

## 11. Appendix

### Diagrams

| Diagram | File |
|---------|------|
| System Context | [system-context.png](diagrams/system-context.png) |
| Sequence — Late-connect Re-index | [sequence-late-connect.png](diagrams/sequence-late-connect.png) |
| Sequence — Disconnect Removal | [sequence-disconnect.png](diagrams/sequence-disconnect.png) |
| State — Connection States to Index Actions | [state-connection.png](diagrams/state-connection.png) |

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | System Context | [system-context.png](diagrams/system-context.png) | [system-context.drawio](diagrams/system-context.drawio) |
| 2 | Sequence — Late-connect Re-index | [sequence-late-connect.png](diagrams/sequence-late-connect.png) | [sequence-late-connect.drawio](diagrams/sequence-late-connect.drawio) |
| 3 | Sequence — Disconnect Removal | [sequence-disconnect.png](diagrams/sequence-disconnect.png) | [sequence-disconnect.drawio](diagrams/sequence-disconnect.drawio) |
| 4 | State — Connection States to Index Actions | [state-connection.png](diagrams/state-connection.png) | [state-connection.drawio](diagrams/state-connection.drawio) |

### Open Items for TA Enrichment — ALL RESOLVED

| # | Item | Status | Resolution |
|---|------|--------|------------|
| OI-1 | API/event contract detail | ✅ Resolved | §12.1 — full `ServerStateChangeEvent` contract; subscribe in `OrchestrationModule.initialize()` **after** `initializeAll()` (not `index.ts`) to avoid double-ingesting the startup burst; lazy DB resolution; unsubscribe on shutdown. |
| OI-2 | Upsert/delete SQL contract | ✅ Resolved | §12.2 — scoped upsert (probe→INSERT/UPDATE), BR-04 prune (`NOT IN`), scoped delete (`WHERE server = ?`), all wrapped in one `db.transaction`. |
| OI-3 | Owning-server column | ✅ Resolved | §12.3 — **DECISION: add explicit `server TEXT` column + `idx_mcp_tools_server`** (additive migration, SA4E-41 precedent). Reusing `category` is only a fragile fallback. §4.3 updated. |
| OI-4 | Concurrency / locking | ✅ Resolved | §12.4 — per-server async mutex (promise chain), 250 ms debounce, latest-state guard vs live `clientManager` state, atomic transaction. |
| OI-5 | Pseudocode | ✅ Resolved | §12.5 — registration + router + connect/disconnect handler pseudocode. Integration checklist in §12.6 (IR-1..IR-10). |

### Change Log from BRD

- No requirement deviations. UC-01..UC-04 map 1:1 to BRD Stories 1–4. BR-10 and BR-11 are derived clarifications from the SA4E-37 state model (`health.ts`) and the BRD Observability NFR respectively; both are consistent with BRD intent.
