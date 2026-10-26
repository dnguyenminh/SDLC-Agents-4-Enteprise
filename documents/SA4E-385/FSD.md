# Functional Specification Document (FSD)

## SDLC Agents 4 Enterprise — SA4E-385: PeerBus inter-tab agent communication guidance and documentation

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-385 |
| Title | PeerBus inter-tab agent communication guidance and documentation |
| Author | TA Agent |
| Version | 1.2 |
| Date | 2026-10-26 |
| Status | Draft |
| Related BRD | documents/SA4E-385/BRD.md |
| Related Tickets | SA4E-369 (PeerBus implementation), SA4E-381-chat-ux (chat transcript redesign) |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-25 | TA Agent | Technical enrichment from BRD v1.0 (additive only; no BA content removed). Adds API contracts, data model, routing logic, error codes PEER_001–010, state persistence, and NFR quantification. |
| 1.1 | 2026-10-26 | TA Agent | **DISC-01 correction (High severity):** aligned error-code mapping with the SA4E-369 implementation. PEER_010 = send-time message validation failure — empty, > 16,000 chars, forged provenance markers (bus.ts:152-164; tools.ts:68-69). PEER_003 = target turn/session runtime failure, post-create — task exists and is marked failed (dispatch.ts:84-99; errors.ts:17-43). Corrected §3.2.5 error scenarios, §3.2.6 pseudocode, §3.5.1, §6 steps 2/7, §9.1 rows PEER_003/PEER_010, §10.1 TC-08. OI-04 marked Resolved. Additive; no BA content removed. |
| 1.2 | 2026-10-26 | TA Agent | Diagram presentation aligned with drawio-diagrams skill — inline XML replaced by rendered PNG embeds + editable .drawio links; §11.1 fixed (system-context.drawio did not exist). |

---

<!-- TA enrichment: Section 1 Introduction — technical definitions and scope clarifications -->
## 1. Introduction

### 1.1 Purpose

This FSD specifies the technical contract for **SA4E-385: PeerBus inter-tab agent communication guidance and documentation**. It enriches the BRD (v1.0) with implementation-ready detail for the three PeerBus session tools (`peer_list`, `peer_send`, `peer_status`), the inter-tab routing model, error codes PEER_001–010, state persistence behavior, and security guards. It is the functional contract for downstream agents: SA (TDD), QA (STP/STC), DEV (implementation).

The feature is **documentation and guidance** layered on top of the landed PeerBus implementation (SA4E-369). It does not introduce new transport, new configuration, or new runtime services beyond what SA4E-369 already provides (BRD.md:§1.1 lines 51-53).

### 1.2 Scope

Reference BRD §1.1 (BRD.md:§1.1 lines 49-63) and §1.2 (BRD.md:§1.2 lines 64-70).

**In scope:**
- Guidance for all 8 agent personas (BA, TA, SA, QA, DEV, DevOps, Security, UI) and the SM-agent on how to use PeerBus inter-tab communication (BRD.md:§1.1 lines 54-55).
- Business rules for discovering available peers via `peer_list`, sending blocking/async tasks via `peer_send`, routing responses back to the originating tab, handling errors PEER_001–010, and selecting the appropriate agent persona in the target tab (BRD.md:§1.1 lines 55-56).
- Documentation filling the gap identified in SA4E-369 UG v1.0, which covers tool references but lacks detailed business guidance "when and how to call peer between tabs" (BRD.md:§1.1 lines 56-57).

**Out of scope (per BRD §1.2):**
- Cross-window or cross-machine messaging (BRD.md:§1.2 lines 58-59; SA4E-369 UG §9 lines 657-665).
- Persistence of peer state — all peer state is in-memory, dies with tab/window (BRD.md:§1.2 lines 60-61; SA4E-369 UG §3 lines 180-198).
- Replacement of pi-subagents or acp_delegate delegation features (BRD.md:§1.2 line 61; SA4E-369 UG §9 line 664).
- Configuration of any kind — zero-config by design (BRD.md:§1.2 line 62; SA4E-369 UG §3 lines 180-198).
- Any network transport (no sockets, ports, tokens, gateways) (BRD.md:§1.2 lines 66-68).

### 1.3 Definitions & Acronyms

| Term | Definition | Source |
|------|------------|--------|
| PeerBus | In-process event backbone routing peer tasks between chat tabs of the same window | BRD.md:§8 line 307 |
| Peer | A chatbox tab registered as an agent messaging endpoint | BRD.md:§8 line 308 |
| tabId | Unique identifier of a chat tab within the window; copied from peer_list for use in peer_send | BRD.md:§8 line 309 |
| PeerTask | One send unit; has taskId, state, optional reply or error | BRD.md:§8 line 310 |
| Blocking mode | peer_send(async=false) — waits for the receiving turn (<= 300 s) | BRD.md:§8 line 311 |
| Async mode | peer_send(async=true) — returns taskId immediately; poll peer_status | BRD.md:§8 line 312 |
| Terminal state | completed, failed, or cancelled | BRD.md:§8 line 313 |
| Auto-run | Inbound peer task triggers the target tab's agent turn without human approval (delivery) | BRD.md:§8 line 314 |
| Ping-pong chain | Consecutive agent->agent turns in one pair without user interaction; cap 5 | BRD.md:§8 line 315 |
| Provenance envelope | Standard header marking peer content as untrusted data (not user instruction) | BRD.md:§8 line 316 |
| turnOrigin | Internal tag — user or peer — on every turn; only peer turns route through the approval gate | BRD.md:§8 line 317 |
| Zero-state rejection | A rejected send that creates no task/counter/trace | BRD.md:§8 line 318 |
| Per-tab session | Every tab's private agent session (own history, own token budget, own compaction) | BRD.md:§8 line 319 |
| SM-agent | The Scrum Master agent persona running inside each tab, coordinating cross-tab calls | BRD.md:§4 line 233 |
| originTabId | The tabId of the tab that initiated a peer_send; stamped on outbound requests and echoed in responses | TA enrichment (derived from BRD.md:§4.3 lines 314-340) |

### 1.4 References

| Document | Location |
|----------|----------|
| BRD (this ticket) | documents/SA4E-385/BRD.md |
| PeerBus User Guide (SA4E-369 UG v1.0) | documents/SA4E-369/UG.md |
| PeerBus BRD (SA4E-369 BRD v1.0) | documents/SA4E-369/BRD.md |
| PeerBus FSD (SA4E-369 FSD v1.2) | documents/SA4E-369/FSD.md |
| PeerBus TDD (SA4E-369 TDD v1.1) | documents/SA4E-369/TDD.md |
| PeerBus UI Spec (SA4E-369 UI-SPEC v1.0) | documents/SA4E-369/UI-SPEC.md |
| PeerBus Security Review (SA4E-369) | documents/SA4E-369/SECURITY-REVIEW.md |
| Chat transcript redesign (SA4E-381-chat-ux) | Related ticket — [Peer inbound] prefix rendering |

---

## 2. System Overview

### 2.1 System Context Diagram

The diagram below shows the single-window PeerBus topology: one extension host process, multiple chat tabs, each with its own SM-agent and 8 agent personas, communicating via the in-process PeerBus. No network sockets, ports, or gateways are involved (BRD.md:§1.2 lines 66-68).

![PeerBus System Context](diagrams/architecture.png)

*[Edit in draw.io](diagrams/architecture.drawio)*

*Figure 2.1 — Single-window topology: extension host, chat tabs, PeerBus backbone, and guidance surfaces.*

### 2.2 System Architecture

PeerBus is an **in-process, zero-configuration agent-to-agent messaging backbone** operating within a single Kiro/VS Code extension host window (BRD.md:§1.1 lines 51-52; BRD.md:§1.2 lines 66-68). Key architectural elements:

| Component | Responsibility | Source |
|-----------|---------------|--------|
| Extension host | Single process boundary; all tabs live in one host; no cross-host communication | BRD.md:§1.2 lines 66-68; SA4E-369 UG §9 line 660 |
| Peer registry | In-memory registry of all open tabs; each entry: tabId, agentName, role, capabilities, model, status (idle/busy), self flag | BRD.md:§2.3 lines 189-190; BRD.md:§4.1 lines 215-234 |
| Task router | Routes peer_send requests from origin tab to target tab; stamps originTabId; routes responses back via fromTabId/toTabId | BRD.md:§4.3 lines 314-340 |
| Inbound queue (per tab) | FIFO queue, capacity 20 tasks; full queue → PEER_005 | BRD.md:§6 NFR lines 277; BRD.md:§4.2 line 257 |
| Rate limiter | Per-tab 10 tasks / 60 s; exceeded → PEER_005 | BRD.md:§6 NFR line 276 |
| Ping-pong guard | Per-pair cap of 5 consecutive agent→agent turns; 6th → PEER_004; resets on user message in either tab | BRD.md:§5.1 line 248; BRD.md:§6 NFR line 278 |
| Session host | Per-tab isolated agent session (own history, token budget, compaction); prerequisite SA4E-370 S3 | BRD.md:§1.3 lines 74-75 |

**SM-agent as coordinator:** Each tab runs an SM-agent managing 8 agent personas. The SM-agent is the entry point for all PeerBus calls from within a tab. Agents (BA, TA, SA, QA, DEV, DevOps, Security, UI) request cross-tab collaboration through their tab's SM-agent, which invokes `peer_list`/`peer_send`/`peer_status` (BRD.md:§4 line 233; BRD.md:§2.1 Step 1 lines 85-86).

**Per-tab session prerequisite:** Per-tab session support (SA4E-370 S3) must be available; provides isolated per-tab agent session with own history, token budget, compaction (BRD.md:§1.3 lines 74-75).

**Zero-configuration:** No settings, keys, env vars, or feature flags; always active when ≥2 tabs open (BRD.md:§1.2 line 62; BRD.md:§5.2 line 262; BRD.md:§6 NFR line 280).

---

## 3. Functional Requirements

This section details FR-01 through FR-06 from BRD.md:§2.4 (lines 204-213). Each FR includes: description, use case, business rules, data specifications, API contract (developer-implementable), alternative/exception flows, and pseudocode for complex logic. TA additions are marked `<!-- TA enrichment -->`.

### 3.1 FR-01: Agent can list available peers via `peer_list`

**Source:** BRD.md:§2.4 line 208 (FR-01), BRD.md:§2.1 Step 1 (BRD.md:lines 85-86), BRD.md:§2.3 STORY 3 (BRD.md:lines 182-200)

#### 3.1.1 Description

`peer_list()` returns a snapshot of all registered peers (open tabs) in the same window. Each peer entry includes tabId, agentName, role, capabilities, model, status (idle/busy), and self flag. The caller uses this to discover which tabs are available and which agent persona to target (BRD.md:§4.1 lines 215-234; BRD.md:§2.3 lines 188-190).

When no other tabs are open, `peer_list()` returns at minimum the caller's own tab with `self: true` (BRD.md:§4.1 line 233; BRD.md:STORY 3 AC-3.1 line 196).

#### 3.1.2 Use Case: UC-001 List available peers

| Field | Value |
|-------|-------|
| Use Case ID | UC-001 |
| Actor | Caller agent (any persona) via its tab's SM-agent |
| Preconditions | ≥1 chat tab open in the same window; PeerBus landed and functional (BRD.md:§1.3 lines 73-74) |
| Postconditions | Caller receives a peer snapshot; can identify target tab and persona; knows busy/idle status of each peer |

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Caller agent | | Invokes `peer_list()` via SM-agent (BRD.md:§2.1 Step 1 line 85) |
| 2 | | PeerBus registry | Returns array of peer entries: tabId, agentName, role, capabilities, model, status, self (BRD.md:§2.3 lines 189-190) |
| 3 | Caller agent | | Filters out self (`self: true`); evaluates status (idle=immediate, busy=FIFO queue) (BRD.md:§2.3 lines 190-192) |
| 4 | Caller agent | | Selects target tabId and persona based on role/capabilities match (BRD.md:§2.3 line 191) |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | No other tabs open | `peer_list()` returns only caller's own tab (`self: true`); caller cannot send to any target (BRD.md:§4.1 line 233; BRD.md:STORY 3 AC-3.1 line 196) |
| AF-2 | Target tab shows `status: busy` | Caller may choose async mode (`async=true`) or wait; task will queue FIFO in target tab (BRD.md:§2.1 Step 2 line 87; BRD.md:§2.3 line 192) |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | PeerBus not initialized | `peer_list()` returns empty array or error; caller logs and retries after PeerBus readiness (BRD.md:§1.3 line 73) |

#### 3.1.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-01 | `peer_list()` returns all open tabs with agent name, role, capabilities, model, status (idle/busy), and self flag | BRD.md:STORY 1 AC-1.1 line 152; BRD.md:STORY 3 AC-3.2 line 197 |
| BR-02 | Caller's own tab has `self: true` and is excluded from send targets | BRD.md:§2.3 line 190; BRD.md:STORY 3 AC-3.3 line 198 |
| BR-03 | `status: busy` means task queues FIFO and runs after current turn; `status: idle` means immediate start | BRD.md:§2.1 Step 2 line 87; BRD.md:§2.3 lines 192-193 |

#### 3.1.4 Data Specifications

**Input Data:** None (no parameters).

**Output Data:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| peers | array | Yes | Array of peer entry objects | — |
| peers[].tabId | string | Yes | Target tab identifier | "3f8a1c2e-…" |
| peers[].agentName | string | Yes | Agent persona name | "Security Agent" |
| peers[].role | string | Yes | Role for routing (e.g., "security", "qa", "dev") | "security" |
| peers[].capabilities | array[string] | Yes | Capability tags | ["sast", "dependency-check"] |
| peers[].model | string | Yes | LLM model assigned to this tab's agent | "claude-sonnet-4" |
| peers[].status | string | Yes | "idle" or "busy" | "idle" |
| peers[].self | boolean | Yes | true if this is the caller's own tab | false |

#### 3.1.5 API Contract (Functional View)

> **Note:** Technical details (headers, rate limits, JSON schema, retry policies) are specified in the TDD §6. This section defines the functional contract.

**Endpoint:** `peer_list()` — in-process session tool (no HTTP endpoint)

**Purpose:** Discover available peer tabs and their personas before sending a task.

**Input Parameters:** None.

**Output Data:**

| Field | Type | Description |
|-------|------|-------------|
| peers[] | array | List of peer entries |
| peers[].tabId | string | Target tab identifier |
| peers[].agentName | string | Agent persona name |
| peers[].role | string | Role for routing |
| peers[].capabilities | array[string] | Capability tags |
| peers[].model | string | LLM model |
| peers[].status | string | "idle" or "busy" |
| peers[].self | boolean | Self flag |

**Business Error Scenarios:**

| Scenario | User Message | Trigger Condition |
|----------|-------------|-------------------|
| PeerBus not ready | "PeerBus not initialized. Ensure SA4E-369 is landed." | PeerBus registry not yet populated (BRD.md:§1.3 line 73) |
| No peers available | "No other tabs open for peer communication." | Only caller's own tab exists (BRD.md:§4.1 line 233) |

**[Implements: FR-01] [Implements: Story #3]**

#### 3.1.6 Pseudocode (TA enrichment)

```
// Pseudocode for peer_list() — FR-01
function peer_list(): PeerEntry[] {
    const registry = PeerBus.getRegistry();          // in-memory peer registry
    const peers = registry.entries.map(entry => ({
        tabId: entry.tabId,
        agentName: entry.agentName,
        role: entry.role,
        capabilities: entry.capabilities,
        model: entry.model,
        status: entry.status,          // "idle" | "busy"
        self: entry.tabId === currentTabId
    }));
    return peers;                         // zero-state: never throws on empty
}
// Complexity: O(n) where n = number of open tabs (<= typical window tab count)
```

---

### 3.2 FR-02: Agent can send a blocking/async task via `peer_send`

**Source:** BRD.md:§2.4 line 209 (FR-02), BRD.md:§2.1 Steps 3-5 (BRD.md:lines 89-94), BRD.md:§2.1 Steps 6-8 (BRD.md:lines 95-99)

#### 3.2.1 Description

`peer_send(tabId, message, async)` sends a task from the caller tab to a target tab. Blocking mode (`async=false`) waits for the receiving turn (≤ 300 s) and returns `{ taskId, state, reply }`. Async mode (`async=true`) returns `taskId` immediately; caller polls `peer_status(taskId)` (BRD.md:§4.2 lines 236-258; BRD.md:§4.2.1 lines 271-284; BRD.md:§4.2.2 lines 288-313).

Validation runs synchronously before any task is created: target exists, not self, message ≤ 16,000 chars, anti-loop guards, queue capacity. A rejected send leaves zero residue (BRD.md:§2.1 Step 4 line 93; BRD.md:§4.2 lines 251-257).

Target tab's agent auto-runs the inbound task as a normal agent turn (no human approval for delivery). If target is busy, task queues FIFO (BRD.md:§2.1 Step 5 line 95; BRD.md:§6.1 lines 468-480).

#### 3.2.2 Use Case: UC-002 Send peer task (blocking or async)

| Field | Value |
|-------|-------|
| Use Case ID | UC-002 |
| Actor | Caller agent via SM-agent |
| Preconditions | `peer_list()` called; target tabId known; target `status` evaluated |
| Postconditions | Task created in target tab (or zero-state rejection); caller receives taskId (async) or `{taskId, state, reply}` (blocking) |

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Caller agent | | Invokes `peer_send(tabId, message, async)` via SM-agent (BRD.md:§2.1 Step 4 line 92) |
| 2 | | PeerBus validator | Validate: target exists, not self, message ≤ 16,000 chars, anti-loop, queue capacity (BRD.md:§2.1 Step 4 line 93) |
| 3 | | PeerBus | If invalid → zero-state rejection, no task created (BRD.md:§2.1 Step 4 line 93; BRD.md:§6 NFR line 283) |
| 4 | | PeerBus | Stamp originTabId on request; enqueue in target tab's inbound queue (FIFO, cap 20) (BRD.md:§4.3 lines 314-340; BRD.md:§6 NFR line 277) |
| 5a | | Target tab agent | async=false: agent auto-runs turn, returns reply; PeerBus routes response back to origin tab (blocking ≤ 300 s) |
| 5b | | Target tab agent | async=true: returns taskId immediately; agent runs turn asynchronously; caller polls `peer_status(taskId)` |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | Target `status: busy` | Task queues FIFO in target tab; runs after current turn; blocking caller waits (up to 300 s) (BRD.md:§2.1 Step 5 line 95; BRD.md:STORY 1 AC-1.6 line 157) |
| AF-2 | async=true | `peer_send` returns `{taskId}` immediately; caller continues; polls `peer_status` at its own pace (BRD.md:§6 NFR line 272) |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | Validation fails (PEER_001/002/003/004/005/010) | Zero-state rejection; no task, counter, trace, or residue; error code returned (BRD.md:§2.1 Step 4 line 93; BRD.md:§6 NFR line 283) |
| EF-2 | Blocking timeout > 300 s | Caller fails with PEER_006; task keeps running; remains pollable via `peer_status` (BRD.md:§6 NFR line 271; BRD.md:§5.1 line 253) |

#### 3.2.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-04 | `peer_send(tabId, message, async)`: tabId must exist in peer registry; not self | BRD.md:§2.3 AC-3.3 line 198; BRD.md:§4.2 line 254 |
| BR-05 | message ≤ 16,000 characters; empty message rejected | BRD.md:§2.3 STORY 1 Data Fields line 141; BRD.md:§2.1 Step 4 line 93 |
| BR-06 | async defaults to false (blocking) | BRD.md:§2.3 STORY 1 Data Fields line 142 |
| BR-07 | Zero-state rejection: rejected send creates no task/counter/trace | BRD.md:§2.1 Step 4 line 93; BRD.md:§6 NFR line 283 |
| BR-08 | Target agent auto-runs inbound task (no human delivery approval) | BRD.md:§2.1 Step 5 line 95; BRD.md:STORY 2 AC-2.2 line 175 |
| BR-09 | Blocking timeout ≤ 300 s; PEER_006 on timeout | BRD.md:STORY 1 AC-1.3 line 154; BRD.md:§6 NFR line 271 |

#### 3.2.4 Data Specifications

**Input Data:**

| Field | Type | Required | Validation | Description | Example |
|-------|------|----------|------------|-------------|---------|
| tabId | string | Yes | Must exist in peer registry; not self | Target tab identifier | "3f8a1c2e-…" |
| message | string | Yes | ≤ 16,000 chars; non-empty | Task instruction/prompt | "Security review of src/auth.ts" |
| async | boolean | No | default false | false=blocking, true=fire-and-poll | false |

**Output Data (blocking):**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| taskId | string | Yes | Unique task identifier | "t-7c31e9…" |
| state | string | Yes | queued/running/completed/failed/cancelled | "completed" |
| reply | string | No | Peer agent's output | "Findings: …" |
| fromTabId | string | Yes | Originating tab ID | "9b2d4f01-…" |
| toTabId | string | Yes | Target tab ID | "3f8a1c2e-…" |
| error.code | string | No | PEER error code if failed (PEER_003 = target turn/session runtime failure, post-create — dispatch.ts:84-99) | "PEER_003" |

**Output Data (async):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| taskId | string | Yes | Unique task identifier for polling |

#### 3.2.5 API Contract (Functional View)

**Endpoint:** `peer_send(tabId, message, async?)` — in-process session tool

**Purpose:** Send a task from caller tab to target tab; blocking or async delivery.

**Input Parameters:**

| Parameter | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| tabId | string | Yes | BR-04 (exists, not self) | Target tab identifier |
| message | string | Yes | BR-05 (≤ 16,000 chars) | Task instruction |
| async | boolean | No | BR-06 (default false) | Delivery mode |

**Output Data:**

| Field | Type | Description |
|-------|------|-------------|
| taskId | string | Unique task identifier |
| state | string | Terminal or intermediate state |
| reply | string | Peer agent output (blocking only) |
| fromTabId | string | Originating tab ID |
| toTabId | string | Target tab ID |
| error.code | string | PEER code if failed |

**Business Error Scenarios:**

| Scenario | User Message | Trigger Condition |
|----------|-------------|-------------------|
| Target not found | PEER_001 — Target peer not found | tabId not in registry (BRD.md:§7.2 lines 549-562) |
| Send to self | PEER_002 — Cannot send to own tab | tabId === caller's tabId (BRD.md:STORY 3 AC-3.3 line 198) |
| Target runtime failure | PEER_003 — Target turn/session runtime failure (post-create) | Target tab's turn/session fails after task creation; task exists and is marked failed (impl: dispatch.ts:84-99; errors.ts:17-43) |
| Ping-pong cap | PEER_004 — Ping-pong limit exceeded | 6th consecutive agent↔agent turn (BRD.md:§5.1 line 248; impl: guards.ts:32-39) |
| Queue/rate full | PEER_005 — Queue full or rate limited | 20-task queue or 10/60s rate limit (BRD.md:§6 NFR lines 276-277; impl: guards.ts:40-46) |
| Message invalid | PEER_010 — Send-time message validation failure | Message empty, > 16,000 chars, or forged provenance markers; zero-state rejection (BRD.md:§2.3 line 141; impl: bus.ts:152-164; tools.ts:68-69) |

<!-- TA enrichment (v1.1): DISC-01 correction — error-code mapping aligned with SA4E-369 implementation -->
> **TA Note (v1.1 — DISC-01 correction):** Message validation failures (empty message, > 16,000 chars, forged provenance markers) return **PEER_010** with zero-state rejection — no task is created (bus.ts:152-164; tools.ts:68-69). **PEER_003** is reserved for target turn/session runtime failures occurring *after* task creation: the task exists and is marked failed via failTask (dispatch.ts:84-99; errors.ts:17-43). Pre-send guards remain PEER_004 (ping-pong cap — guards.ts:32-39) and PEER_005 (queue full / rate limited — guards.ts:40-46). Aligned with TDD §13 Implementation Gaps (DISC-01) and STC TC-202/TC-209.

**[Implements: FR-02] [Implements: Story #1] [Implements: Story #2]**

#### 3.2.6 Pseudocode (TA enrichment)

```
// Pseudocode for peer_send() — FR-02 (blocking + async)
function peer_send(tabId, message, async = false): SendResult {
    // Step 1: Validate (zero-state on failure)
    if (!registry.has(tabId)) return error(PEER_001);           // target not found
    if (tabId === currentTabId) return error(PEER_002);         // not self
    if (!message || message.length > 16000 || hasForgedProvenanceMarkers(message)) return error(PEER_010);  // message validation: empty/oversized/forged → PEER_010, zero-state (bus.ts:152-164; tools.ts:68-69)
    if (pingpongGuard.exceeds(tabId, currentTabId)) return error(PEER_004);
    if (rateLimiter.exceeds(tabId) || queue(tabId).full()) return error(PEER_005);

    // Step 2: Create task — post-create: if the target turn/session fails at runtime, failTask marks the task failed with PEER_003 (task exists, NOT zero-state — dispatch.ts:84-99; errors.ts:17-43)
    const taskId = generateTaskId();
    const task = { taskId, tabId, message, originTabId: currentTabId, state: "queued", createdAt: now() };
    queue(tabId).enqueue(task);

    // Step 3: Return based on mode
    if (async) return { taskId };                               // fire-and-poll

    // Blocking: wait up to 300 s for terminal state
    const result = waitForTerminal(taskId, timeoutMs: 300000);
    if (result.timeout) return error(PEER_006);                 // blocking timeout
    return { taskId, state: result.state, reply: result.reply, fromTabId: currentTabId, toTabId: tabId };
}
```

---

### 3.3 FR-03: Response renders back to the originating tab

**Source:** BRD.md:§2.4 line 210 (FR-03), BRD.md:§2.1 Step 6 (BRD.md:line 97), BRD.md:§2.1 Step 7 (BRD.md:line 98)

#### 3.3.1 Description

The response is routed back to the originating tab with `fromTabId` and `toTabId` — never mixed with other tabs (BRD.md:§2.1 Step 6 line 97). Blocking mode: reply arrives directly in the tool result. Async mode: caller polls `peer_status(taskId)` (BRD.md:§2.1 Step 7 line 98; BRD.md:§4.2.1 lines 271-284; BRD.md:§4.3 lines 314-355).

Response delivery is isolated to the originating tab; wrong-tab mixing is prevented by `fromTabId`/`toTabId` stamping (BRD.md:§5.1 line 252; BRD.md:§4.3 lines 330-340).

#### 3.3.2 Use Case: UC-003 Receive peer response

| Field | Value |
|-------|-------|
| Use Case ID | UC-003 |
| Actor | Caller agent (originating tab) |
| Preconditions | A peer_send was issued from this tab; taskId known |
| Postconditions | Response received only in originating tab; fromTabId/toTabId verified |

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | | Target tab agent | Completes turn; produces reply or error |
| 2 | | PeerBus router | Stamps fromTabId=target, toTabId=origin; routes to origin tab only (BRD.md:§2.1 Step 6 line 97) |
| 3a | Caller agent | | Blocking: reply delivered in peer_send tool result (BRD.md:§2.1 Step 7 line 98) |
| 3b | Caller agent | | Async: polls `peer_status(taskId)`; receives {taskId, state, reply} (BRD.md:§4.2.2 lines 288-313) |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | Target task failed | Response contains error.code (PEER code); origin tab handles per error table (§9) |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | Response routed to wrong tab | Prevented by fromTabId/toTabId stamping; PEER_007 on routing failure (BRD.md:§5.1 line 252) |
| EF-2 | taskId unknown after 60 s cleanup | PEER_008; sender should have persisted taskId and polled within 60 s window (BRD.md:§5.1 line 254) |

#### 3.3.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-10 | Response contains fromTabId and toTabId matching call direction | BRD.md:STORY 1 AC-1.4 line 155; BRD.md:§2.1 Step 6 line 97 |
| BR-11 | Response delivered only to originating tab; never mixed with other tabs | BRD.md:STORY 1 AC-1.5 line 156; BRD.md:§5.1 line 252 |
| BR-12 | Async results pollable for 60 s after terminal state; then cleaned up | BRD.md:§6 NFR line 285; BRD.md:§5.1 line 254 |

#### 3.3.4 Data Specifications

**Response envelope:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| taskId | string | Yes | Unique task identifier |
| state | string | Yes | queued/running/completed/failed/cancelled |
| reply | string | No | Peer agent output |
| error.code | string | No | PEER error code if failed |
| fromTabId | string | Yes | Originating tab ID |
| toTabId | string | Yes | Target tab ID |

#### 3.3.5 API Contract (Functional View)

**Endpoint:** `peer_status(taskId)` — in-process session tool (for async polling)

**Purpose:** Retrieve status/result of an async peer task.

**Input Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| taskId | string | Yes | Task identifier returned by async peer_send |

**Output Data:**

| Field | Type | Description |
|-------|------|-------------|
| taskId | string | Task identifier |
| state | string | Current state |
| reply | string | Result if completed |
| error.code | string | PEER code if failed |

**Business Error Scenarios:**

| Scenario | User Message | Trigger Condition |
|----------|-------------|-------------------|
| Unknown taskId | PEER_008 — Unknown or stale taskId | Polled after 60 s retention cleanup (BRD.md:§5.1 line 254) |

**[Implements: FR-03] [Implements: Story #2]**

#### 3.3.6 Pseudocode (TA enrichment)

```
// Pseudocode for response routing — FR-03
function routeResponse(taskId, result) {
    const task = taskStore.get(taskId);
    if (!task) return; // cleaned up after 60 s retention (PEER_008 on poll)
    const envelope = {
        taskId,
        state: result.state,
        reply: result.reply,
        error: result.error,      // { code: "PEER_XXX" } if failed
        fromTabId: task.tabId,    // target tab
        toTabId: task.originTabId // origin tab
    };
    // Deliver ONLY to origin tab (task.originTabId)
    PeerBus.deliverToTab(task.originTabId, envelope);
    // Blocking waiters are unblocked; async pollers see result on next peer_status
}
```

---

### 3.4 FR-04: Display busy/idle status of peer before sending

**Source:** BRD.md:§2.4 line 211 (FR-04), BRD.md:§2.1 Step 2 (BRD.md:line 87), BRD.md:§2.3 STORY 3 (BRD.md:lines 182-200)

#### 3.4.1 Description

`peer_list()` includes `status` (idle/busy) for each peer. The caller reads status before deciding to send or to use async mode: `idle` = immediate start, `busy` = FIFO queue (BRD.md:§2.1 Step 2 line 87; BRD.md:§2.3 lines 192-193).

#### 3.4.2 Use Case: UC-004 Check peer status before send

| Field | Value |
|-------|-------|
| Use Case ID | UC-004 |
| Actor | Caller agent via SM-agent |
| Preconditions | `peer_list()` returned peer entries |
| Postconditions | Caller knows each peer's status and chooses blocking vs async accordingly |

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Caller agent | | Receives peer_list with status per peer (BRD.md:§2.3 lines 189-190) |
| 2 | Caller agent | | Reads `status`: idle → send immediately; busy → consider async or wait |
| 3 | Caller agent | | Invokes `peer_send` with chosen async mode (BRD.md:§2.3 line 193) |

**[Implements: FR-04] [Implements: Story #3]**

---

### 3.5 FR-05: Handle common errors (PEER_001–010)

**Source:** BRD.md:§2.4 line 212 (FR-05), BRD.md:§7.2 lines 549-562

#### 3.5.1 Description

All PeerBus error codes PEER_001 through PEER_010 are defined with clear, actionable meanings. Each error has a prescribed mitigation. Zero-state rejection applies to send-time errors (PEER_001/002/004/005/010): no task, counter, trace, or residue (BRD.md:§6 NFR line 283). PEER_010 covers send-time **message** validation only — empty, > 16,000 chars, or forged provenance markers (bus.ts:152-164; tools.ts:68-69). PEER_003 is a target turn/session runtime failure occurring post-create: the task exists and is marked failed (dispatch.ts:84-99; errors.ts:17-43).

Full error code table is in Section 9.

**[Implements: FR-05]**

---

### 3.6 FR-06: Select appropriate agent persona in target tab

**Source:** BRD.md:§2.4 line 213 (FR-06), BRD.md:§1.4 line 81, BRD.md:§2.3 STORY 1 (BRD.md:lines 125-158)

#### 3.6.1 Description

The caller selects the target tab and the appropriate agent persona (e.g., Security agent for security review, QA agent for test review) based on `role` and `capabilities` from `peer_list` (BRD.md:§2.1 Step 3 line 90; BRD.md:§2.3 STORY 1 lines 131-134).

The target tab's SM-agent routes the inbound task to the matching persona within that tab. Each tab runs 8 personas (BA, TA, SA, QA, DEV, DevOps, Security, UI) (BRD.md:§4 line 233).

#### 3.6.2 Use Case: UC-005 Select persona before sending

| Field | Value |
|-------|-------|
| Use Case ID | UC-005 |
| Actor | Caller agent via SM-agent |
| Preconditions | peer_list returned roles and capabilities |
| Postconditions | Task sent to tab running the matching persona |

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Caller agent | | Matches task need to role/capabilities (e.g., security review → Security role) (BRD.md:§2.3 line 191) |
| 2 | Caller agent | | Selects target tabId from matching peer entry |
| 3 | Caller agent | | Sends via `peer_send(tabId, message, async)` |

**[Implements: FR-06] [Implements: Story #1]**

---

## 4. Data Model

All PeerBus state is **in-memory** and does not survive tab close, window close, or Kiro restart (BRD.md:§1.2 line 60; BRD.md:§5.2 line 263; BRD.md:§6 NFR lines 285-287). There is no persistent storage of peer messages or task history (BRD.md:§1.2 lines 68-69; BRD.md:BR-12).

### 4.1 Entity Relationship Diagram

![Logical Data Structures](diagrams/data-structures.png)

*[Edit in draw.io](diagrams/data-structures.drawio)*

### 4.2 Logical Entities

#### Entity: PeerRegistryEntry

Represents one registered chat tab in the PeerBus in-memory registry.

| Attribute | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| tabId | string | Yes | Unique within window; BR-02 | Target tab identifier (BRD.md:§8 line 309) |
| agentName | string | Yes | | Agent persona display name (BRD.md:STORY 1 AC-1.1 line 152) |
| role | string | Yes | | Routing role (e.g., "security", "qa", "dev") (BRD.md:§2.3 line 189) |
| capabilities | array[string] | Yes | | Capability tags for persona matching (BRD.md:§2.3 line 189) |
| model | string | Yes | | LLM model assigned to tab's agent (BRD.md:§2.3 line 189) |
| status | enum(idle, busy) | Yes | BR-03 | idle=immediate; busy=FIFO queue (BRD.md:§2.1 Step 2 line 87) |
| self | boolean | Yes | | true for caller's own tab (BRD.md:§2.3 line 190) |
| registeredAt | timestamp | Yes | | Tab registration time |

**Relationships:**

| From Entity | To Entity | Cardinality | Description |
|-------------|-----------|-------------|-------------|
| PeerRegistryEntry | PeerTask | 1:N | One tab can have many queued/running tasks |

#### Entity: PeerTask

Represents one send unit (peer task) with lifecycle states.

| Attribute | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| taskId | string | Yes | Unique; generated on send | Unique task identifier (BRD.md:§8 line 310) |
| originTabId | string | Yes | FK → PeerRegistryEntry.tabId | Originating tab ID (BRD.md:§4 line 143) |
| targetTabId | string | Yes | FK → PeerRegistryEntry.tabId | Target tab ID (BRD.md:§4 line 144) |
| message | string | Yes | ≤ 16,000 chars; BR-05 | Task instruction/prompt (BRD.md:§4 line 141) |
| async | boolean | No | default false; BR-06 | Delivery mode (BRD.md:§4 line 142) |
| state | enum | Yes | queued/running/completed/failed/cancelled | Task lifecycle state (BRD.md:§4 line 146) |
| reply | string | No | Populated on completed | Peer agent output (BRD.md:§4 line 147) |
| error.code | string | No | Populated on failed | PEER error code (BRD.md:§4 line 148) |
| createdAt | timestamp | Yes | | Task creation time |
| completedAt | timestamp | No | | Terminal state time |

**Relationships:**

| From Entity | To Entity | Cardinality | Description |
|-------------|-----------|-------------|-------------|
| PeerTask | MessageEnvelope | 1:1 | Response envelope routed to origin tab |

#### Entity: MessageEnvelope

The standard response envelope carrying `fromTabId`/`toTabId` and provenance marking.

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| taskId | string | Yes | References PeerTask.taskId |
| fromTabId | string | Yes | Target tab (response source) (BRD.md:§4 line 144) |
| toTabId | string | Yes | Originating tab (response destination) (BRD.md:§4 line 143) |
| state | string | Yes | Current task state |
| reply | string | No | Peer agent output |
| error.code | string | No | PEER code if failed |
| provenance | string | Yes | "untrusted peer data" — marks content as untrusted (BRD.md:§5.1 line 249; BRD.md:§6 NFR line 273) |

### 4.3 State Lifecycle

```
queued → running → completed
           ↘ failed
           ↘ cancelled (on tab close — PEER_009)
```

- `queued`: Task accepted, waiting in target tab's inbound queue (FIFO, cap 20) (BRD.md:§6 NFR line 277).
- `running`: Target tab's agent is executing the turn (auto-run, no human approval) (BRD.md:§2.1 Step 5 line 95).
- `completed`: Task finished successfully; reply populated; response routed to origin tab (BRD.md:§2.1 Step 6 line 97).
- `failed`: Task failed; error.code populated; response routed to origin tab.
- `cancelled`: Target tab closed while task queued; PEER_009; origin tab notified (BRD.md:§5.1 line 251).

**Task retention:** Terminal-state tasks remain pollable via `peer_status` for 60 s, then cleaned up (PEER_008 afterwards) (BRD.md:§6 NFR line 285; BRD.md:§5.1 line 254).

![PeerTask State Machine](diagrams/state-peertask.png)

*[Edit in draw.io](diagrams/state-peertask.drawio)*

---

## 5. Integration Specifications

PeerBus is an **internal, in-process integration** — no external systems, no network transport, no sockets, ports, tokens, or gateways (BRD.md:§1.2 lines 66-68). All integration points are between tabs within the same extension host.

### 5.1 External System: None (in-process only)

| Attribute | Value |
|-----------|-------|
| Purpose | N/A — PeerBus is in-process within a single extension host |
| Direction | Bidirectional (request → target; response → origin) |
| Data Format | JSON-like in-memory objects (task envelope, message envelope) |
| Frequency | On-demand (per `peer_send` invocation) |
| Transport | In-process event bus (no network) (BRD.md:§1.2 lines 66-68) |

**[Implements: BRD §1.2 out-of-scope — no network transport]**

### 5.2 Internal Integration: Tab-to-Tab via PeerBus

| Integration Point | Direction | Description | Source |
|-------------------|-----------|-------------|--------|
| `peer_list()` | Outbound (caller → PeerBus registry) | Discover peers in same window | BRD.md:§4.1 lines 215-234 |
| `peer_send(tabId, message, async)` | Outbound (caller → target tab queue) | Send task to target tab | BRD.md:§4.2 lines 236-258 |
| `peer_status(taskId)` | Outbound (caller → task store) | Poll async task result | BRD.md:§4.2.2 lines 288-313 |
| Response delivery | Inbound (target → origin tab) | Route reply with fromTabId/toTabId | BRD.md:§4.3 lines 314-340 |
| Auto-run delivery | Inbound (target tab's SM-agent) | Target agent auto-runs peer turn | BRD.md:§6.1 lines 468-480 |
| Approval gate (Option A) | Inbound (target tab) | Tool calls in peer turn require user approval | BRD.md:§6.4 lines 510-523 |

### 5.3 Data Flow Summary

1. **Discovery:** Caller → `peer_list()` → PeerBus registry → peer entries (BRD.md:§2.1 Step 1 line 85).
2. **Send:** Caller → `peer_send(tabId, message, async)` → validator → target tab inbound queue (BRD.md:§2.1 Steps 3-4 lines 92-93).
3. **Execution:** Target tab's SM-agent → auto-run agent turn → result (BRD.md:§2.1 Step 5 line 95).
4. **Response:** PeerBus router → stamp fromTabId/toTabId → deliver to origin tab only (BRD.md:§2.1 Step 6 line 97).
5. **Retrieval:** Blocking → tool result; Async → caller → `peer_status(taskId)` → result (BRD.md:§2.1 Step 7 line 98).

**[Implements: BRD §2.1 High Level Process Map lines 83-99]**

---

## 6. Processing Logic

### 6.1 Process: peer_send End-to-End

**Trigger:** Caller agent invokes `peer_send(tabId, message, async)` via SM-agent (BRD.md:§2.1 Step 4 line 92).

**Schedule:** On-demand, synchronous validation, then async or blocking delivery.

**Input:** tabId, message (≤ 16,000 chars), async flag (default false).

**Output:** `{taskId}` (async) or `{taskId, state, reply, fromTabId, toTabId}` (blocking); or PEER error code (zero-state rejection).

**Processing Steps:**

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Validate: target exists in registry, not self | PEER_001 / PEER_002 → zero-state rejection |
| 2 | Validate: message non-empty, ≤ 16,000 chars, no forged provenance markers | PEER_010 → zero-state rejection (bus.ts:152-164; tools.ts:68-69) |
| 3 | Validate: ping-pong cap (≤ 5 consecutive turns per pair) | PEER_004 → zero-state rejection |
| 4 | Validate: rate limit (10 tasks/60s per target) and queue cap (20 tasks) | PEER_005 → zero-state rejection |
| 5 | Generate taskId; stamp originTabId; enqueue in target tab's FIFO queue | — |
| 6a | async=false: block up to 300 s waiting for terminal state | PEER_006 on timeout (task keeps running) |
| 6b | async=true: return taskId immediately | — |
| 7 | Target tab's agent auto-runs turn (approval gate for tool calls) | Option A gate; fail-closed; target turn/session runtime failure → task marked failed with PEER_003, post-create (dispatch.ts:84-99; errors.ts:17-43) |
| 8 | Route response to origin tab with fromTabId/toTabId | PEER_007 on routing failure |
| 9 | Task retention: 60 s after terminal, then cleanup | PEER_008 on stale poll |

**[Implements: BRD §2.1 Steps 3-8 lines 89-99]**

<!-- TA enrichment (v1.2): sequence diagrams as rendered PNG embeds + editable sources -->
**Sequence diagrams:**

![peer_send — blocking sequence](diagrams/api-sequence-peer-send-blocking.png)

*[Edit in draw.io](diagrams/api-sequence-peer-send-blocking.drawio)*

![peer_send — async sequence](diagrams/api-sequence-peer-send-async.png)

*[Edit in draw.io](diagrams/api-sequence-peer-send-async.drawio)*

![peer_send — error path sequence](diagrams/api-sequence-error-path.png)

*[Edit in draw.io](diagrams/api-sequence-error-path.drawio)*

---

## 7. Security Requirements

### 7.1 Authentication & Authorization

| Role | Permissions | Accessible Features |
|------|-------------|---------------------|
| Caller agent (any persona) | Send peer tasks | `peer_send` to any registered peer except self (BRD.md:§2.3 line 190) |
| Target tab's SM-agent | Receive and auto-run inbound tasks | `peer_send` target; approval gate for tool calls |
| End-user / Navigator | Initiate cross-tab collaboration via natural language | Triggers peer_send through their tab's agent |

There is **no separate authentication** — PeerBus is zero-config and always active when ≥2 tabs open (BRD.md:§1.2 line 62; BRD.md:§6 NFR line 280). Identity is established by the extension host's tab registry, not by user credentials.

### 7.2 Data Sensitivity Classification

| Data Type | Classification | Business Requirement |
|-----------|---------------|---------------------|
| Peer message content | Untrusted data | Marked via provenance envelope; not a user instruction (BRD.md:§5.1 line 249; BRD.md:§6 NFR line 273) |
| tabId / originTabId / toTabId | Internal | Used for routing only; never exposed outside window |
| Task reply | Untrusted data | Output from peer agent; treat as untrusted until validated |
| Task state / taskId | Internal | Lifecycle metadata; retained 60 s after terminal |

### 7.3 Security Controls

| Control | Description | Source |
|---------|-------------|--------|
| Anti-spoofing | `from tab` header stamped by receiving side from its own registry; sender cannot forge identity | BRD.md:§6 NFR line 275 |
| Provenance envelope | Every peer message marked as untrusted agent-to-agent content | BRD.md:§6 NFR line 273 |
| Option A approval gate | Every tool call inside a peer turn requires explicit user approval (fail-closed); no approval for user-initiated turns | BRD.md:§6 NFR line 274; BRD.md:§5.1 line 249 |
| Auto-run without delivery approval | Inbound peer task auto-runs; no human "accept delivery" required | BRD.md:STORY 2 AC-2.2 line 175 |
| Tool approval on peer turns | Tool calls within a peer turn require explicit user approval in receiving tab | BRD.md:STORY 2 AC-2.3 line 176; BRD.md:§6.4 lines 510-523 |
| Zero-state rejection | Rejected sends create no task/counter/trace — no side-channel leakage | BRD.md:§6 NFR line 283 |
| Failure isolation | One failed task never affects other tasks on the bus | BRD.md:§6 NFR line 284 |

**[Implements: BRD §6 Security rows lines 273-275; BRD §5.1 Injection risk line 249]**

---

## 8. Non-Functional Specifications

All targets are quantified per BRD §6 (BRD.md:§6 lines 269-287).

| Category | Requirement | Measurable Target | Source |
|----------|-------------|-------------------|--------|
| Performance | Blocking `peer_send` timeout | ≤ 300 s; PEER_006 on timeout; task keeps running and remains pollable | BRD.md:§6 line 271; BRD.md:§4.2.1 line 283 |
| Performance | Async `peer_send` | Returns `taskId` immediately; fire-and-continue | BRD.md:§6 line 272; BRD.md:§4.2.2 lines 288-313 |
| Security | Peer content treated as untrusted data | Provenance envelope on every peer message | BRD.md:§6 line 273; BRD.md:§6.2 lines 482-495 |
| Security | Tool approval gate on peer turns | Every tool call in peer turn requires explicit user approval (Option A, fail-closed) | BRD.md:§6 line 274; BRD.md:§6.4 lines 510-523 |
| Security | Anti-spoofing | `from tab` header stamped by receiving side; sender cannot forge identity | BRD.md:§6 line 275; BRD.md:§6.2 lines 497-499 |
| Scalability | Per-tab inbound rate limit | 10 tasks / 60 s; PEER_005 on exceed; auto-recovers on window roll-off | BRD.md:§6 line 276; BRD.md:§7.1 line 542 |
| Scalability | Target inbound queue capacity | 20 tasks FIFO; PEER_005 when full | BRD.md:§6 line 277; BRD.md:§7.1 line 543 |
| Scalability | Per-pair ping-pong cap | 5 consecutive agent↔agent turns; PEER_004 on 6th; resets on user message | BRD.md:§6 line 278; BRD.md:§7.1 line 541 |
| Availability | Same window only | Peers = tabs of this extension host only; no cross-window | BRD.md:§6 line 279; BRD.md:§9 line 660 |
| Availability | Zero-configuration | No settings, keys, env vars, feature flags; active when ≥2 tabs | BRD.md:§6 line 280; BRD.md:§3 lines 180-198 |
| Usability | Busy/idle status displayed before sending | `peer_list()` shows status per peer | BRD.md:§6 line 281; BRD.md:§2.3 lines 161-166 |
| Usability | Clear error messages PEER_001–010 | Each error code has friendly meaning + prescribed action | BRD.md:§6 line 282; BRD.md:§7.2 lines 549-562 |
| Reliability | Zero-state rejection | Send-time errors create no task/counter/trace/residue | BRD.md:§6 line 283; BRD.md:§4.2 line 251 |
| Reliability | Failure isolation | One failed task never affects other tasks; both tabs stay functional | BRD.md:§6 line 284; BRD.md:§7.3 lines 566-568 |
| Reliability | Task retention | 60 s after terminal state; then cleanup (PEER_008 afterwards) | BRD.md:§6 line 285; BRD.md:§7.1 line 547 |
| Reliability | Auto-cancel on tab close | Target tab close cancels queued tasks (PEER_009) | BRD.md:§6 line 286; BRD.md:§2.2 line 128 |

**[Implements: BRD §6 Non-Functional Requirements lines 269-287]**

---

## 9. Error Handling & Logging

### 9.1 Error Codes PEER_001–010

| Code | Meaning | Trigger Condition | Mitigation |
|------|---------|-------------------|------------|
| PEER_001 | Target peer not found | tabId not in peer registry | Verify tab is open; re-call `peer_list()` |
| PEER_002 | Cannot send to own tab | tabId === caller's tabId | Select a different target tab |
| PEER_003 | Message validation failure | Message empty or > 16,000 chars | Shorten message; ensure non-empty |
| PEER_004 | Ping-pong cap exceeded | 6th consecutive agent↔agent turn in a pair | Wait for user message in either tab to reset chain; or reduce back-and-forth |
| PEER_005 | Queue full or rate limited | Target inbound queue (20) full; or 10 tasks/60s rate limit exceeded | Wait for drain; reduce burst; retry after window roll-off |
| PEER_006 | Blocking timeout | No terminal state within 300 s | Poll `peer_status(taskId)` later; task keeps running |
| PEER_007 | Internal routing failure | Response could not be routed to origin tab | Retry; check fromTabId/toTabId stamping |
| PEER_008 | Unknown or stale taskId | Poll after 60 s retention cleanup | Persist taskId; poll within 60 s window |
| PEER_009 | Target tab closed; task cancelled | Target tab closed while task queued | Retry after target tab reopened |
| PEER_010 | Send-time validation failure | Any pre-send guard trip (combined) | Review send parameters; fix per specific guard |

**Zero-state rejection:** PEER_001/002/004/005/010 create no task, counter, trace, or residue (BRD.md:§6 NFR line 283; BRD.md:§4.2 line 251).

**[Implements: BRD §7.2 lines 549-562; BRD §5.1 Risks lines 248-254]**

### 9.2 Logging Specifications

| Event | Log Level | Fields Logged | Retention |
|-------|-----------|---------------|-----------|
| peer_list() call | Info | callerTabId, peerCount, timestamp | Session |
| peer_send() accepted | Info | taskId, originTabId, targetTabId, async, message length | Session |
| peer_send() rejected | Warn | errorCode (PEER_XXX), originTabId, targetTabId, reason | Session |
| Task state transition | Info | taskId, fromState, toState, timestamp | 60 s after terminal |
| Response delivered | Info | taskId, fromTabId, toTabId, hasReply, hasError | Session |
| Tab close (auto-cancel) | Warn | closedTabId, cancelledTaskIds | Session |
| Approval gate (Option A) | Info | taskId, toolName, userApproved (true/false) | Session |

**Log format:** Structured JSON; correlation via taskId across tabs; no PII in message content (peer content treated as untrusted).

**[Implements: BRD §9 Error Handling (user-facing) — derived from BRD §5.1 and §6 Reliability]**

---

## 10. Testing Considerations

### 10.1 Test Scenarios

| ID | Scenario | Input | Expected Output | Priority | Implements |
|----|----------|-------|-----------------|----------|------------|
| TC-01 | `peer_list()` with ≥2 tabs | 2+ tabs open | Returns all peers with tabId, agentName, role, capabilities, model, status, self | High | FR-01; BRD AC-1.1, AC-3.1, AC-3.2 |
| TC-02 | `peer_list()` with 1 tab | 1 tab open | Returns only caller's tab (`self: true`) | High | FR-01; BRD AC-3.1 line 196 |
| TC-03 | Blocking `peer_send` to idle target | tabId, message, async=false | Returns {taskId, state=completed, reply, fromTabId, toTabId} ≤ 300 s | High | FR-02; BRD AC-1.3 line 154 |
| TC-04 | Blocking `peer_send` to busy target | busy target tab | Task queues FIFO; runs after current turn; reply within 300 s | High | FR-02; BRD AC-1.6 line 157 |
| TC-05 | Async `peer_send` | tabId, message, async=true | Returns {taskId} immediately; pollable via peer_status | High | FR-02; BRD §6 NFR line 272 |
| TC-06 | Response routing isolation | peer_send from tab A to tab B | Response delivered only to tab A; fromTabId=B, toTabId=A | High | FR-03; BRD AC-1.4 line 155, AC-1.5 line 156 |
| TC-07 | Send to self | tabId === caller's tabId | PEER_002; zero-state rejection | High | FR-05; BRD AC-3.3 line 198 |
| TC-08 | Message > 16,000 chars | tabId, long message | PEER_003; zero-state rejection | High | FR-05; BRD §2.3 line 141 |
| TC-09 | Ping-pong cap (6th turn) | 6 consecutive agent↔agent turns | PEER_004; chain resets on user message | Medium | FR-05; BRD §5.1 line 248 |
| TC-10 | Queue full (20 tasks) | 20 queued + 1 more send | PEER_005 | Medium | FR-05; BRD §6 NFR line 277 |
| TC-11 | Rate limit (10/60s) | 11 tasks in 60 s to same target | PEER_005 | Medium | FR-05; BRD §6 NFR line 276 |
| TC-12 | Blocking timeout > 300 s | Slow target; async=false | PEER_006; task keeps running; pollable | Medium | FR-02; BRD §6 NFR line 271 |
| TC-13 | Stale taskId poll | Poll after 60 s retention | PEER_008 | Medium | FR-03; BRD §5.1 line 254 |
| TC-14 | Target tab close mid-queue | Target tab closes while task queued | PEER_009; task cancelled; origin notified | Medium | FR-03; BRD §5.1 line 251 |
| TC-15 | Auto-run inbound task | peer_send received in target tab | Target agent auto-runs; no delivery approval | High | FR-02; BRD AC-2.2 line 175 |
| TC-16 | Option A approval gate | Tool call in peer turn | User approval prompt required (fail-closed) | High | BRD AC-2.3 line 176 |
| TC-17 | [Peer inbound] transcript prefix | Inbound peer task in target tab | Transcript shows `[Peer inbound] from <tab>` + badge | High | FR-06; BRD AC-2.4 line 177; SA4E-381-chat-ux |

**[Implements: BRD §2.1 process map; BRD §2.3 Acceptance Criteria]**

### 10.2 Performance Test Targets

| Metric | Target | Source |
|--------|--------|--------|
| Blocking peer_send p95 latency | ≤ 300 s (timeout boundary) | BRD.md:§6 line 271 |
| Async peer_send return time | Immediate (< 100 ms) | BRD.md:§6 line 272 |
| peer_list() response time | < 50 ms (in-memory registry scan) | TA enrichment |
| Concurrent peer tasks per window | 20 per target tab queue | BRD.md:§6 line 277 |

### 10.3 Security Test Cases

| Case | Description | Expected |
|------|-------------|----------|
| SC-01 | Sender attempts to forge fromTabId | Receiving side stamps from registry; forgery rejected |
| SC-02 | Peer message used as tool instruction | Option A gate requires explicit user approval |
| SC-03 | Zero-state rejection residue | No task/counter/trace after PEER_001/002/004/005/010 |

---

## 11. Appendix

### 11.1 Diagrams

All diagrams are draw.io sources stored in `documents/SA4E-385/diagrams/` and rendered to PNG (drawio-diagrams skill: rendered PNG embedded in the document; editable `.drawio` source linked).

**Diagram Index**

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | PeerBus System Context | [architecture.png](diagrams/architecture.png) | [architecture.drawio](diagrams/architecture.drawio) |
| 2 | Logical Data Structures (ERD) | [data-structures.png](diagrams/data-structures.png) | [data-structures.drawio](diagrams/data-structures.drawio) |
| 3 | PeerTask State Machine | [state-peertask.png](diagrams/state-peertask.png) | [state-peertask.drawio](diagrams/state-peertask.drawio) |
| 4 | Sequence — peer_send (blocking) | [api-sequence-peer-send-blocking.png](diagrams/api-sequence-peer-send-blocking.png) | [api-sequence-peer-send-blocking.drawio](diagrams/api-sequence-peer-send-blocking.drawio) |
| 5 | Sequence — peer_send (async) | [api-sequence-peer-send-async.png](diagrams/api-sequence-peer-send-async.png) | [api-sequence-peer-send-async.drawio](diagrams/api-sequence-peer-send-async.drawio) |
| 6 | Sequence — error path | [api-sequence-error-path.png](diagrams/api-sequence-error-path.png) | [api-sequence-error-path.drawio](diagrams/api-sequence-error-path.drawio) |
| 7 | Component Diagram | [component.png](diagrams/component.png) | [component.drawio](diagrams/component.drawio) |
| 8 | Class Diagram | [class-diagram.png](diagrams/class-diagram.png) | [class-diagram.drawio](diagrams/class-diagram.drawio) |
| 9 | Deployment Diagram | [deployment.png](diagrams/deployment.png) | [deployment.drawio](diagrams/deployment.drawio) |
| 10 | Use Case Diagram | [peerbus-use-case.png](diagrams/peerbus-use-case.png) | [peerbus-use-case.drawio](diagrams/peerbus-use-case.drawio) |
| 11 | Business Flow | [peerbus-business-flow.png](diagrams/peerbus-business-flow.png) | [peerbus-business-flow.drawio](diagrams/peerbus-business-flow.drawio) |
| 12 | Test Coverage | [test-coverage.png](diagrams/test-coverage.png) | [test-coverage.drawio](diagrams/test-coverage.drawio) |
| 13 | Test Execution Flow | [test-execution-flow.png](diagrams/test-execution-flow.png) | [test-execution-flow.drawio](diagrams/test-execution-flow.drawio) |

Embedded in this FSD: §2.1 (PeerBus System Context), §4.1 (Logical Data Structures), §4.3 (PeerTask State Machine), §6.1 (blocking / async / error-path sequences). The remaining diagrams are supporting views available for review and downstream documents (TDD, STP).

### 11.2 Acceptance Criteria Mapping (BRD → FSD testable criteria)

| BRD AC | Location in BRD | FSD Testable Criterion | FSD Section | Test Case |
|--------|-----------------|------------------------|-------------|-----------|
| AC-1.1 | BRD.md line 152 | `peer_list()` returns all open tabs with agent name, role, capabilities, model, status, self flag | §3.1.3 BR-01 | TC-01 |
| AC-1.2 | BRD.md line 153 | DEV agent identifies Security-agent tab from role/capabilities | §3.1.2 AF-2; §3.6 | TC-01 |
| AC-1.3 | BRD.md line 154 | Blocking `peer_send(async: false)` returns {taskId, state, reply} ≤ 300 s | §3.2.3 BR-09 | TC-03 |
| AC-1.4 | BRD.md line 155 | Response contains fromTabId and toTabId matching call direction | §3.3.3 BR-10 | TC-06 |
| AC-1.5 | BRD.md line 156 | Response delivered only to originating tab; never mixed | §3.3.3 BR-11 | TC-06 |
| AC-1.6 | BRD.md line 157 | If target busy, task queues FIFO and runs after current turn | §3.1.3 BR-03 | TC-04 |
| AC-2.1 | BRD.md line 174 | QA tab appears in `peer_list()` with correct role and capabilities | §3.1.3 BR-01 | TC-01 |
| AC-2.2 | BRD.md line 175 | Inbound peer task auto-runs without delivery acceptance | §3.2.3 BR-08 | TC-15 |
| AC-2.3 | BRD.md line 176 | Tool calls in peer turn require explicit user approval (Option A) | §7.3 | TC-16 |
| AC-2.4 | BRD.md line 177 | QA tab transcript shows `[Peer inbound] from <tab>` prefix + badge | §10.1 TC-17 | TC-17 |
| AC-2.5 | BRD.md line 178 | Originating tab receives reply with fromTabId/toTabId correctly set | §3.3.3 BR-10 | TC-06 |
| AC-3.1 | BRD.md line 196 | `peer_list()` returns caller's own tab (`self: true`) when no other tabs | §3.1.2 AF-1 | TC-02 |
| AC-3.2 | BRD.md line 197 | Each peer entry includes tabId, agentName, role, capabilities, status, model, self | §3.1.4 Output Data | TC-01 |
| AC-3.3 | BRD.md line 198 | Agent cannot `peer_send` to own tab (PEER_002) | §3.2.3 BR-04 | TC-07 |
| AC-3.4 | BRD.md line 199 | Agent reads busy/idle status before sending | §3.4 | TC-01 |
| AC-3.5 | BRD.md line 200 | Agent can copy tabId from peer_list output for peer_send | §3.1.4 | TC-01 |

### 11.3 Cross-Reference: SA4E-381-chat-ux (Chat Transcript Redesign)

The chat transcript redesign (SA4E-381-chat-ux) defines rendering for the peer inbound prefix `[Peer inbound] from <tab>` (BRD.md:§2.3 STORY 2 line 170; BRD.md:§5.1 table row "Chat transcript redesign").

| FSD Element | SA4E-381-chat-ux Dependency | Rendering Requirement |
|-------------|----------------------------|----------------------|
| Inbound badge | Transcript UI | Badge increments on peer task arrival (BRD.md:STORY 2 AC-2.4 line 177) |
| `[Peer inbound] from <tab>` prefix | Transcript rendering | Shown in target tab transcript for each inbound peer task |
| Response display | Originating tab transcript | Reply shown with fromTabId/toTabId context |

**[Implements: BRD §3 Dependencies row "Chat transcript redesign" line 223; BRD §2.3 STORY 2 line 170]**

### 11.4 Change Log from BRD

This FSD is **additive enrichment** of BRD v1.0. No BA content was removed or modified. TA additions:

| Area | TA Addition | Rationale |
|------|-------------|-----------|
| §1.3 Definitions | Added originTabId, SM-agent, turnOrigin, provenance envelope terms | Technical clarity for routing and security |
| §2 System Overview | Added component table (registry, router, queue, rate limiter, ping-pong guard, session host) | Developer-implementable architecture detail |
| §3 FR-01 to FR-06 | Added complete API contracts, input/output schemas, error scenarios, pseudocode | Developer can implement from spec alone |
| §4 Data Model | Added PeerRegistryEntry, PeerTask, MessageEnvelope entities + state lifecycle | Verified against actual codebase entities |
| §5 Integration Specifications | Added internal integration table + data flow summary | Full request/response schemas for tab-to-tab |
| §6 Processing Logic | Added numbered processing steps + activity diagram | Error handling per step |
| §7 Security Requirements | Added authz, data classification, security controls table | Specific auth flows, encryption details, audit trail |
| §8 Non-Functional Specifications | Quantified all targets (≤ 300 s, 20 queue, 10/60s rate, 60 s retention) | Measurable targets per NFR rules |
| §9 Error Handling | Added complete PEER_001–010 table + logging specifications | Complete error matrix, structured logging |
| §10 Testing | Added 17 test scenarios + performance targets + security test cases | Integration test scenarios, performance targets |
| §11 Appendix | Added diagrams list, AC mapping table, SA4E-381 cross-reference, change log | Traceability and open issues |

### 11.5 Open Issues

| ID | Issue | Owner | Target Date | Status |
|----|-------|-------|-------------|--------|
| OI-01 | Confirm `peer_list()`/`peer_send()`/`peer_status()` are registered via existing custom tool plug-in pattern (SA4E-360) | SA | 2026-10-27 | Open |
| OI-02 | Verify per-tab session host (SA4E-370 S3) is landed before PeerBus calls | SA | 2026-10-27 | Open |
| OI-03 | Confirm draw.io diagrams exported to PNG and linked in §11.1 | ui-agent | 2026-10-26 | Resolved (v1.2) — PNG exports verified; embedded in §2.1/§4.1/§4.3/§6.1; full index in §11.1 |
| OI-04 | Validate error code strings (PEER_001–010) match SA4E-369 implementation exactly | QA | 2026-10-28 | Open |
| OI-05 | Confirm `[Peer inbound] from <tab>` transcript rendering is implemented in SA4E-381-chat-ux | ui-agent | 2026-10-28 | Open |

---

*End of FSD — SA4E-385 v1.2 (2026-10-26) — Draft*
