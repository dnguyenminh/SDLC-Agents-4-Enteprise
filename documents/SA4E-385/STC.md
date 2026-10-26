# Software Test Cases (STC)

## SA4E-385: PeerBus inter-tab agent communication guidance and documentation

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-385 |
| Title | PeerBus inter-tab agent communication guidance and documentation |
| Author | QA Agent – QA Engineer |
| Version | 1.0 |
| Date | 2026-10-26 |
| Status | Draft |
| Related STP | documents/SA4E-385/STP.md (v1.0) |
| Related FSD | documents/SA4E-385/FSD.md (v1.0) |
| Related TDD | documents/SA4E-385/TDD.md (v1.0) |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-26 | QA Agent | Initiate document — auto-generated from FSD use cases, business rules, error codes |

---

## Test Case Summary

| Category | ID Range | Count | Priority |
|----------|----------|-------|----------|
| Functional — Happy Path | TC-001 to TC-009 | 9 | High |
| Functional — Alternative Flows | TC-100 to TC-102 | 3 | High |
| Functional — Exception/Error Flows | TC-200 to TC-209 | 10 | High |
| Business Rule Validation | TC-300 to TC-309 | 10 | High |
| Boundary & Negative Testing | TC-400 to TC-403 | 4 | Medium |
| UI/UX Testing | TC-500 to TC-501 | 2 | Medium |
| Non-Functional (Performance, Security) | TC-600 to TC-602 | 3 | Medium |
| Integration Testing | TC-700 to TC-701 | 2 | High |
| Regression Testing | TC-800 to TC-800 | 1 | Medium |
| **Total** | **TC-001 to TC-800** | **44** | |

---

## 1. Functional Test Cases — Happy Path

### TC-001: peer_list returns all peers with self flag (FR-01, AC-1.1, AC-2.1, AC-3.2)

| Field | Value |
|-------|-------|
| **ID** | TC-001 |
| **Priority** | High |
| **Type** | Functional — Happy Path |
| **Requirement** | FR-01 (BRD.md:§2.4 line 208), AC-1.1 (BRD.md:STORY 1 line 152), AC-2.1 (BRD.md:STORY 2 line 174), AC-3.2 (BRD.md:STORY 3 line 197) |
| **Preconditions** | ≥2 chat tabs open in same window; PeerBus runtime loaded; each tab registered in PeerRegistry with role, capabilities, model, status |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Caller tab invokes `peer_list()` via SM-agent | Returns `{ peers: [...] }` with all registered tabs |
| 2 | Verify each peer entry has tabId, agentName, role, capabilities, model, status, self | All fields present per `PeerInfo` type (`types.ts:40-48`) |
| 3 | Verify caller's own tab has `self: true`, other tabs have `self: false` | Self flag correctly set per `registry.ts:92` |
| 4 | Verify `status` is "idle" or "busy" per peer | Matches `PeerStatus` enum (`types.ts:8`) |

**Test Data:** Two tabs: Tab A (caller, self:true, role:"dev"), Tab B (target, self:false, role:"security", capabilities:["sast"], status:"idle")

**Postconditions:** Caller has complete peer snapshot; can identify target tabId and persona

**Traceability to code:** `tools.ts:37-46` (peer_list tool), `bus.ts:51-54` (list), `registry.ts:84-94` (snapshot)

---

### TC-002: peer_list returns only self when one tab open (FR-01, AC-3.1)

| Field | Value |
|-------|-------|
| **ID** | TC-002 |
| **Priority** | High |
| **Type** | Functional — Happy Path |
| **Requirement** | FR-01 (BRD.md:§2.4 line 208), AC-3.1 (BRD.md:STORY 3 line 196) |
| **Preconditions** | Exactly 1 chat tab open in the window |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Caller tab invokes `peer_list()` | Returns `{ peers: [...] }` with exactly 1 entry |
| 2 | Verify the single entry has `self: true` | `self === true` per `registry.ts:92` |
| 3 | Verify no other tabId present | `peers.length === 1` |

**Test Data:** Single tab registered with status:"idle", role:"dev"

**Postconditions:** Caller knows no send target is available

**Traceability to code:** `bus.ts:51-54`, `registry.ts:84-94`, BRD.md:STORY 3 line 196

---

### TC-003: Blocking peer_send returns taskId, state, reply within 300s (FR-02, AC-1.3)

| Field | Value |
|-------|-------|
| **ID** | TC-003 |
| **Priority** | High |
| **Type** | Functional — Happy Path |
| **Requirement** | FR-02 (BRD.md:§2.4 line 209), AC-1.3 (BRD.md:STORY 1 line 154) |
| **Preconditions** | Tab A (caller) and Tab B (target, status:"idle") both registered; target agent ready to auto-run |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Tab A calls `peer_send(tabB, "Security review of src/auth.ts", async:false)` | Returns `{ taskId, state: "completed", reply, fromTabId: tabA, toTabId: tabB }` |
| 2 | Verify taskId format `t-<uuid>` | Matches `types.ts:74` |
| 3) | Verify reply contains peer agent output | Non-empty string |
| 4 | Verify fromTabId === tabA, toTabId === tabB | Matches call direction per `types.ts:75-76` |

**Test Data:** message="Security review of src/auth.ts" (≤16,000 chars), async=false

**Postconditions:** Task in terminal state "completed"; reply available to caller

**Traceability to code:** `tools.ts:49-81`, `bus.ts:68-73`, `constants.ts:20` (300s timeout), `dispatch.ts:47-50`

---

### TC-004: Async peer_send returns taskId immediately (FR-02, NFR line 272)

| Field | Value |
|-------|-------|
| **ID** | TC-004 |
| **Priority** | High |
| **Type** | Functional — Happy Path |
| **Requirement** | FR-02 (BRD.md:§2.4 line 209), NFR Performance (BRD.md:§6 NFR line 272) |
| **Preconditions** | Tab A (caller) and Tab B (target) both registered |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Tab A calls `peer_send(tabB, "Task", async:true)` | Returns `{ taskId, state: "queued" }` immediately |
| 2 | Verify no blocking wait — call returns before target completes | Response time ≪ 300s |
| 3 | Verify taskId present and non-empty | `taskId` matches `t-<uuid>` format |

**Test Data:** message="Task", async=true

**Postconditions:** taskId available for `peer_status` polling

**Traceability to code:** `bus.ts:71` (async return path), `constants.ts:20`

---

### TC-005: Blocking peer_send to busy target queues FIFO (FR-02, AC-1.6)

| Field | Value |
|-------|-------|
| **ID** | TC-005 |
| **Priority** | High |
| **Type** | Functional — Happy Path |
| **Requirement** | FR-02 (BRD.md:§2.4 line 209), AC-1.6 (BRD.md:STORY 1 line 157) |
| **Preconditions** | Tab B status:"busy"; Tab A calls peer_send to Tab B |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Tab A calls `peer_send(tabB, "Task", async:false)` | Task accepted with state:"queued" |
| 2 | Verify task enters Tab B's inbound queue (FIFO, cap 20) | Queue position reflects order |
| 3 | Verify Tab B remains marked busy during queue | `bus.isBusy(tabB) === true` |

**Test Data:** message="Task", target busy

**Postconditions:** Task queued; will run after current turn completes

**Traceability to code:** `bus.ts:112-115` (queue cap), `dispatch.ts:17-36` (FIFO drain), BRD.md:STORY 1 line 157

---

### TC-006: Response delivered only to originating tab with fromTabId/toTabId (FR-03, AC-1.4, AC-1.5, AC-2.5)

| Field | Value |
|-------|-------|
| **ID** | TC-006 |
| **Priority** | High |
| **Type** | Functional — Happy Path |
| **Requirement** | FR-03 (BRD.md:§2.4 line 210), AC-1.4 (BRD.md:STORY 1 line 155), AC-1.5 (BRD.md:STORY 1 line 156), AC-2.5 (BRD.md:STORY 2 line 178) |
| **Preconditions** | peer_send completed from Tab A to Tab B |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Tab A calls `peer_status(taskId)` | Returns `{ fromTabId: tabB, toTabId: tabA }` |
| 2 | Verify fromTabId === target tab (Tab B) | Response source = target |
| 3 | Verify toTabId === origin tab (Tab A) | Response destination = origin |
| 4 | Verify Tab C (third tab) cannot poll this task (non-owner) | Tab C gets PEER_008 |

**Test Data:** taskId from TC-003, three tabs A/B/C

**Postconditions:** Response isolated to originating tab; wrong-tab mixing prevented

**Traceability to code:** `bus.ts:57-65` (owner check :60-61), `types.ts:125-126`, BRD.md:§4.3 lines 330-340

---

### TC-007: Response not mixed with other tabs' traffic (FR-03, risk line 252)

| Field | Value |
|-------|-------|
| **ID** | TC-007 |
| **Priority** | High |
| **Type** | Functional — Happy Path |
| **Requirement** | FR-03 (BRD.md:§2.4 line 210), Risk "Wrong tab response" (BRD.md:§5.1 line 252) |
| **Preconditions** | Two concurrent peer_sends from different origin tabs to same target |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Tab A sends task1 to Tab B (async) | Returns taskId1 |
| 2 | Tab C sends task2 to Tab B (async) | Returns taskId2 |
| 3 | Tab A polls `peer_status(taskId1)` | Returns fromTabId:tabB, toTabId:tabA — not task2 data |
| 4 | Tab C polls `peer_status(taskId2)` | Returns fromTabId:tabB, toTabId:tabC — not task1 data |

**Test Data:** Two distinct taskIds, three tabs

**Postconditions:** Each origin tab receives only its own response

**Traceability to code:** `bus.ts:60-61` (owner check), `types.ts:125-126`

---

### TC-008: peer_list shows busy/idle status before sending (FR-04, AC-3.4)

| Field | Value |
|-------|-------|
| **ID** | TC-008 |
| **Priority** | High |
| **Type** | Functional — Happy Path |
| **Requirement** | FR-04 (BRD.md:§2.4 line 211), AC-3.4 (BRD.md:STORY 3 line 199) |
| **Preconditions** | Tab B registered with status:"busy" |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Caller invokes `peer_list()` | Tab B entry shows `status: "busy"` |
| 2 | Caller reads status and decides blocking vs async | Caller can choose async=true for busy target |
| 3 | Caller invokes `peer_send` with chosen mode | Send proceeds with correct async flag |

**Test Data:** Tab B status:"busy"

**Postconditions:** Caller has status information before sending

**Traceability to code:** `registry.ts:84-94` (status field), `types.ts:46` (PeerInfo.status)

---

### TC-009: Select appropriate agent persona via role/capabilities (FR-06, AC-1.2, AC-3.5)

| Field | Value |
|-------|-------|
| **ID** | TC-009 |
| **Priority** | High |
| **Type** | Functional — Happy Path |
| **Requirement** | FR-06 (BRD.md:§2.4 line 213), AC-1.2 (BRD.md:STORY 1 line 153), AC-3.5 (BRD.md:STORY 3 line 200) |
| **Preconditions** | peer_list returned peers with role and capabilities |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Caller invokes `peer_list()` | Peer entries include `role` and `capabilities` fields |
| 2 | Caller matches task need to role (e.g., security review → role:"security") | Target tab selected by role match |
| 3 | Caller copies tabId from peer_list output | tabId usable in `peer_send` |
| 4 | Caller sends to selected tab | Task routed to tab running matching persona |

**Test Data:** Peer entries: {role:"security", capabilities:["sast"]}, {role:"qa", capabilities:["test-review"]}

**Postconditions:** Task sent to tab running appropriate persona

**Traceability to code:** `types.ts:40-48` (PeerInfo.role/capabilities), `tools.ts:37-46`

---

## 2. Functional Test Cases — Alternative Flows

### TC-100: peer_list with no other tabs — AF-1 (AC-3.1)

| Field | Value |
|-------|-------|
| **ID** | TC-100 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Requirement** | AF-1 (FSD.md:§3.1.2 line 199), AC-3.1 (BRD.md:STORY 3 line 196) |
| **Preconditions** | Only 1 chat tab open (caller's own tab) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Caller invokes `peer_list()` | Returns only caller's own tab with `self: true` |
| 2 | Verify no send target available | `peers.length === 1` |

**Test Data:** Single tab registered

**Postconditions:** Caller knows no inter-tab messaging possible

**Traceability to code:** `registry.ts:84-94`, BRD.md:STORY 3 line 196

---

### TC-101: Target busy — task queues FIFO, blocking caller waits (AF-2, AC-1.6)

| Field | Value |
|-------|-------|
| **ID** | TC-101 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Requirement** | AF-2 (FSD.md:§3.1.2 line 200), AC-1.6 (BRD.md:STORY 1 line 157) |
| **Preconditions** | Tab B status:"busy"; Tab A calls blocking peer_send |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Tab B set to busy (running another turn) | `bus.isBusy(tabB) === true` |
| 2 | Tab A calls `peer_send(tabB, "Task", async:false)` | Task accepted, state:"queued" |
| 3 | Tab B completes current turn, becomes idle | `bus.isBusy(tabB) === false` |
| 4 | Queued task auto-runs (FIFO drain) | Task transitions to "completed" |

**Test Data:** message="Task", target initially busy

**Postconditions:** Task queued then executed after current turn

**Traceability to code:** `dispatch.ts:17-36` (FIFO), `bus.ts:81-82` (markBusy/setStatus)

---

### TC-102: Inbound peer task auto-runs without delivery approval (AC-2.2)

| Field | Value |
|-------|-------|
| **ID** | TC-102 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow |
| **Requirement** | AC-2.2 (BRD.md:STORY 2 line 175) |
| **Preconditions** | Tab A sends peer task to Tab B |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Tab A calls `peer_send(tabB, "Task", async:false)` | Task accepted |
| 2 | Tab B's agent auto-runs the turn | No "accept delivery" prompt required |
| 3 | Task completes and response returns to Tab A | Response received |

**Test Data:** message="Task"

**Postconditions:** Auto-run delivery confirmed; no human delivery approval needed

**Traceability to code:** `dispatch.ts:39-55` (auto-run), BRD.md:STORY 2 line 175

---

## 3. Functional Test Cases — Exception/Error Flows

### TC-200: PEER_001 — Target peer not found (FR-05, FSD §9.1 line 887)

| Field | Value |
|-------|-------|
| **ID** | TC-200 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | PEER_001 (FSD.md:§9.1 line 887), FR-05 (BRD.md:§2.4 line 212) |
| **Preconditions** | Tab A calls `peer_send` with a tabId not in the registry |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Tab A calls `peer_send("nonexistent-tab", "msg", async:false)` | Returns `{ error: { code: "PEER_001", message: ... } }` |
| 2 | Verify zero-state rejection — no task created | `bus.tasks.get(taskId)` returns undefined; no queue entry |
| 3 | Verify error message mentions target tab | Message per `errors.ts:18-19` |

**Test Data:** tabId="nonexistent-tab", message="test"

**Postconditions:** No task, counter, trace, or residue created (zero-state)

**Traceability to code:** `bus.ts:148-150` (PEER_001), `bus.ts:146-165` (zero-state), `errors.ts:18-19`

---

### TC-201: PEER_002 — Cannot send to own tab (FR-05, AC-3.3, FSD §9.1 line 888)

| Field | Value |
|-------|-------|
| **ID** | TC-201 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | PEER_002 (FSD.md:§9.1 line 888), AC-3.3 (BRD.md:STORY 3 line 198), FR-05 |
| **Preconditions** | Tab A calls `peer_send` with tabId === caller's own tabId |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Tab A calls `peer_send(tabA, "msg", async:false)` | Returns `{ error: { code: "PEER_002", message: ... } }` |
| 2 | Verify zero-state rejection — no task created | No queue entry, no task object |
| 3 | Verify error message | `Cannot send a peer task to the same tab.` (`errors.ts:20`) |

**Test Data:** tabId = caller's own tabId

**Postconditions:** Self-send rejected with zero state

**Traceability to code:** `bus.ts:151` (PEER_002), BRD.md:STORY 3 line 198

---

### TC-202: PEER_003 — Target turn/session runtime failure (FR-05, FSD §9.1 line 889)

| Field | Value |
|-------|-------|
| **ID** | TC-202 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | PEER_003 (FSD.md:§9.1 line 889), FR-05 |
| **Preconditions** | peer_send accepted, task created, target turn fails at runtime |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Tab A calls `peer_send(tabB, "msg", async:false)` | Task created, state:"queued" |
| 2 | Target turn execution fails (e.g., model error) | Task transitions to "failed" |
| 3 | Response to Tab A contains `error.code: "PEER_003"` | Error per `dispatch.ts:90` |
| 4 | Verify task object WAS created (PEER_003 is NOT zero-state) | `bus.tasks.get(taskId)` returns failed task |

**Test Data:** message="msg", target turn forced to fail

**Postconditions:** Task in failed state with PEER_003; origin notified

**Traceability to code:** `dispatch.ts:84-99` (failTask PEER_003), `bus.ts:72` (blocking returns error)

> **Note on DISC-01:** Per TDD §13 DISC-01, PEER_003 is a target turn/runtime failure — NOT message validation. Message validation (empty/oversized) uses PEER_010. See TC-209 and TC-400/TC-401.

---

### TC-203: PEER_004 — Ping-pong cap exceeded (FR-05, FSD §9.1 line 890)

| Field | Value |
|-------|-------|
| **ID** | TC-203 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | PEER_004 (FSD.md:§9.1 line 890), FR-05 |
| **Preconditions** | Pair (Tab A, Tab B) has 5 consecutive agent→agent turns; 6th send attempted |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Simulate 5 consecutive agent turns between Tab A and Tab B | Guard chain = 5 (`guards.ts:32`) |
| 2 | Tab A calls `peer_send(tabB, "msg", async:false)` (6th turn) | Returns `{ error: { code: "PEER_004", ... } }` |
| 3 | Verify zero-state — no task created | No queue entry |
| 4 | Verify chain resets on user message in either tab | After user message, send succeeds |

**Test Data:** 5 prior agent turns in pair

**Postconditions:** 6th turn rejected; chain resettable by user message

**Traceability to code:** `guards.ts:32-39` (PEER_004), `constants.ts:8` (MAX_PINGPONG_TURNS=5), `bus.ts:110-111`

---

### TC-204: PEER_005 — Queue full or rate limited (FR-05, FSD §9.1 line 891)

| Field | Value |
|-------|-------|
| **ID** | TC-204 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | PEER_005 (FSD.md:§9.1 line 891), FR-05 |
| **Preconditions** | Target Tab B inbound queue has 20 tasks OR rate limit 10/60s exceeded |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Fill Tab B's inbound queue to 20 tasks OR send 11 tasks in 60s | Queue full or rate exceeded |
| 2 | Tab A calls `peer_send(tabB, "msg", async:false)` | Returns `{ error: { code: "PEER_005", ... } }` |
| 3 | Verify zero-state — no task created | No additional queue entry |
| 4 | Verify error distinguishes rate vs queue | Message per `errors.ts:24-27` |

**Test Data:** 20 queued tasks or burst of 11 sends

**Postconditions:** Send refused; sender waits for drain or window roll-off

**Traceability to code:** `guards.ts:41-46` (rate), `bus.ts:112-115` (queue), `constants.ts:11-14,23`

---

### TC-205: PEER_006 — Blocking timeout > 300s (FR-05, FSD §9.1 line 892)

| Field | Value |
|-------|-------|
| **ID** | TC-205 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | PEER_006 (FSD.md:§9.1 line 892), FR-05 |
| **Preconditions** | Tab A calls blocking peer_send; target task does not complete within 300s |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Tab A calls `peer_send(tabB, "long-task", async:false)` | Caller blocks |
| 2 | Simulate no terminal state within 300s (use fake timers) | Caller rejected with `{ error: { code: "PEER_006", ... } }` |
| 3 | Verify task keeps running on target side | Task still pollable via `peer_status` |
| 4 | Verify caller can poll `peer_status(taskId)` later | Returns eventual state |

**Test Data:** message="long-task", async=false

**Postconditions:** Caller gets PEER_006; task survives and remains pollable

**Traceability to code:** `bus.ts:72` (awaitTerminal timeout), `constants.ts:20` (300s), `bus.ts:57-65` (peer_status)

---

### TC-206: PEER_007 — Internal routing/governance failure (FR-05, FSD §9.1 line 893)

| Field | Value |
|-------|-------|
| **ID** | TC-206 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | PEER_007 (FSD.md:§9.1 line 893), FR-05 |
| **Preconditions** | Target turn rejected by context governance |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Tab A calls `peer_send(tabB, "msg", async:false)` | Task created |
| 2 | Target turn rejected by governance (PI_* / governance / budget reason) | Task fails with `error.code: "PEER_007"` |
| 3 | Verify error message curated | Message per `errors.ts:30-31` |
| 4 | Verify task object created (PEER_007 is NOT zero-state) | Task in failed state |

**Test Data:** message that triggers governance rejection

**Postconditions:** Task failed with PEER_007; governance authoritative

**Traceability to code:** `dispatch.ts:88-89` (PEER_007), `errors.ts:30-31`

---

### TC-207: PEER_008 — Unknown or stale taskId (FR-05, FSD §9.1 line 894)

| Field | Value |
|-------|-------|
| **ID** | TC-207 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | PEER_008 (FSD.md:§9.1 line 894), FR-05 |
| **Preconditions** | taskId unknown (never created) or stale (after 60s retention cleanup) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Caller polls `peer_status("nonexistent-task")` | Returns `{ error: { code: "PEER_008", ... } }` |
| 2 | Verify no existence oracle — non-owner also gets PEER_008 | Other tab polling same taskId gets PEER_008 |
| 3 | Verify error message | `Unknown peer task ${taskId}.` (`errors.ts:32`) |

**Test Data:** taskId="nonexistent-task" or stale taskId

**Postconditions:** Caller notified taskId unknown; no information leaked about other tabs' tasks

**Traceability to code:** `bus.ts:60-62` (PEER_008 owner check), DISC-04 (TDD §13)

---

### TC-208: PEER_009 — Target tab closed; task cancelled (FR-05, FSD §9.1 line 895)

| Field | Value |
|-------|-------|
| **ID** | TC-208 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | PEER_009 (FSD.md:§9.1 line 895), FR-05 |
| **Preconditions** | Tab B has queued tasks; Tab B is closed |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Tab A sends task to Tab B (queued, not yet running) | Task in queue |
| 2 | Simulate Tab B close (`bus.handleTabClosed(tabB)`) | Queued tasks cancelled with PEER_009 |
| 3 | Verify Tab A notified | Origin tab receives cancellation |
| 4 | Verify single cleanup point — no orphan state | `bus.handleTabClosed` is sole cleanup (`bus.ts:81-84`) |

**Test Data:** queued task to Tab B

**Postconditions:** Tasks cancelled; origin notified; no orphan state

**Traceability to code:** `bus.ts:81-84` (handleTabClosed), `errors.ts:33` (PEER_009 message)

---

### TC-209: PEER_010 — Send-time validation failure (empty, oversized, forged markers) (FR-05, FSD §9.1 line 896)

| Field | Value |
|-------|-------|
| **ID** | TC-209 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Requirement** | PEER_010 (FSD.md:§9.1 line 896), FR-05 |
| **Preconditions** | Tab A calls `peer_send` with invalid message |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send empty message | Returns `{ error: { code: "PEER_010", message: "Peer message is empty..." } }` |
| 2 | Send message > 16,000 chars | Returns `{ error: { code: "PEER_010", ... } }` |
| 3 | Send message with forged provenance markers | Returns `{ error: { code: "PEER_010", ... } }` |
| 4 | Verify zero-state for all three — no task created | No queue entry, no task object |

**Test Data:** empty "", 16001-char string, string containing `--- begin peer content ---`

**Postconditions:** All invalid sends rejected zero-state with PEER_010

**Traceability to code:** `bus.ts:152-164` (assertSendable), `tools.ts:68-69` (pre-check), `envelope.ts:28-30` (forgery), `errors.ts:34-42`

> **Note on DISC-01:** Per TDD §13 DISC-01, FSD §3.2.5 misattributes message validation to PEER_003. Implementation uses PEER_010 for empty/oversized/forgery (`bus.ts:152-164`, `tools.ts:68-69`). PEER_003 is target turn failure only (`dispatch.ts:90`). QA asserts implementation behavior.

---

## 4. Business Rule Validation

### TC-300: BR-01 — peer_list returns all required fields (BR-01, FSD §3.1.3 line 212)

| Field | Value |
|-------|-------|
| **ID** | TC-300 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-01 (FSD.md:§3.1.3 line 212), BRD.md:STORY 1 AC-1.1 line 152 |
| **Preconditions** | ≥2 tabs registered with full PeerRegistryEntry data |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Caller invokes `peer_list()` | Each peer entry has tabId, agentName, role, capabilities, model, status, self |
| 2 | Verify all 7 fields present per `PeerInfo` type | Matches `types.ts:40-48` |

**Test Data:** Full PeerRegistryEntry for each tab

**Postconditions:** All peer fields present and correctly typed

**Traceability to code:** `registry.ts:84-94`, `types.ts:40-48`

---

### TC-301: BR-02 — Self tab excluded from send targets (BR-02, FSD §3.1.3 line 213)

| Field | Value |
|-------|-------|
| **ID** | TC-301 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-02 (FSD.md:§3.1.3 line 213), BRD.md:STORY 3 line 190 |
| **Preconditions** | Caller tab registered with self:true |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Caller invokes `peer_list()` | Own tab has `self: true` |
| 2 | Caller attempts `peer_send(ownTabId, "msg")` | Rejected with PEER_002 |
| 3 | Verify self flag set relative to caller | `registry.ts:92` `entry.tabId === callerTabId` |

**Test Data:** Caller's own tabId

**Postconditions:** Self cannot be a send target

**Traceability to code:** `registry.ts:92` (self flag), `bus.ts:151` (PEER_002)

---

### TC-302: BR-03 — busy means FIFO queue, idle means immediate start (BR-03, FSD §3.1.3 line 214)

| Field | Value |
|-------|-------|
| **ID** | TC-302 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-03 (FSD.md:§3.1.3 line 214), BRD.md:§2.1 Step 2 line 87 |
| **Preconditions** | Tab B status:"idle"; Tab C status:"busy" |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send to Tab B (idle) | Task starts immediately (state transitions quickly) |
| 2 | Send to Tab C (busy) | Task queues (state:"queued" until idle) |
| 3 | Verify status read from peer_list before send | `PeerInfo.status` field populated |

**Test Data:** Two targets with different status

**Postconditions:** Idle target starts immediately; busy target queues FIFO

**Traceability to code:** `registry.ts:84-94` (status field), `dispatch.ts:17-36` (busy/idle)

---

### TC-303: BR-04 — tabId must exist and not be self (BR-04, FSD §3.2.3 line 337)

| Field | Value |
|-------|-------|
| **ID** | TC-303 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-04 (FSD.md:§3.2.3 line 337), BRD.md:STORY 3 AC-3.3 line 198 |
| **Preconditions** | Invalid tabId and self tabId |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send to non-existent tabId | PEER_001 |
| 2 | Send to own tabId | PEER_002 |
| 3 | Verify zero-state for both | No task created |

**Test Data:** Invalid tabId, own tabId

**Postconditions:** Both invalid targets rejected zero-state

**Traceability to code:** `bus.ts:148-151` (PEER_001, PEER_002)

---

### TC-304: BR-05 — message ≤ 16,000 chars; empty rejected (BR-05, FSD §3.2.3 line 338)

| Field | Value |
|-------|-------|
| **ID** | TC-304 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-05 (FSD.md:§3.2.3 line 338), BRD.md:STORY 1 line 141 |
| **Preconditions** | Empty message and 16,001-char message |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send empty message | PEER_010 (zero-state) |
| 2 | Send 16,001-char message | PEER_010 (zero-state) |
| 3 | Send 16,000-char message | Accepted (boundary) |

**Test Data:** "", 16001 chars, 16000 chars

**Postconditions:** Message size enforced; empty rejected; 16,000 accepted

**Traceability to code:** `bus.ts:152-159`, `constants.ts:29` (16,000)

---

### TC-305: BR-06 — async defaults to false (blocking) (BR-06, FSD §3.2.3 line 339)

| Field | Value |
|-------|-------|
| **ID** | TC-305 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-06 (FSD.md:§3.2.3 line 339), BRD.md:STORY 1 line 142 |
| **Preconditions** | peer_send called without async parameter |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Caller calls `peer_send(tabB, "msg")` without async | Treated as blocking (async=false) |
| 2 | Verify call waits for terminal state | Returns `{taskId, state, reply}` not just `{taskId}` |

**Test Data:** message="msg", async omitted

**Postconditions:** Default mode is blocking

**Traceability to code:** `tools.ts:72` (`p.async ? 'async' : 'blocking'`)

---

### TC-306: BR-07 — Zero-state rejection creates no residue (BR-07, FSD §3.2.3 line 340)

| Field | Value |
|-------|-------|
| **ID** | TC-306 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-07 (FSD.md:§3.2.3 line 340), BRD.md:§6 NFR line 283 |
| **Preconditions** | PEER_001/002/004/005/010 rejection scenarios |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger PEER_001 (missing tab) | No task, counter, trace, residue |
| 2 | Trigger PEER_002 (self-send) | No task, counter, trace, residue |
| 3 | Trigger PEER_004 (ping-pong cap) | No task, counter, trace, residue |
| 4 | Verify guards committed only after all rejection points passed | `guards.ts` I-2 check+commit one tick |

**Test Data:** Various rejection triggers

**Postconditions:** Zero-state confirmed for all send-time rejections

**Traceability to code:** `bus.ts:146-165`, `guards.ts` I-2, I-7

---

### TC-307: BR-08 — Target agent auto-runs inbound task (BR-08, FSD §3.2.3 line 341)

| Field | Value |
|-------|-------|
| **ID** | TC-307 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-08 (FSD.md:§3.2.3 line 341), BRD.md:STORY 2 AC-2.2 line 175 |
| **Preconditions** | peer_send accepted; target tab agent available |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Tab A sends peer task to Tab B | Task enqueued |
| 2 | Tab B agent auto-runs turn | No human "accept delivery" required |
| 3 | Verify turnOrigin === 'peer' on task | `types.ts:81` turnOrigin field |

**Test Data:** message="task"

**Postconditions:** Auto-run confirmed; turnOrigin tagged 'peer'

**Traceability to code:** `dispatch.ts:39-55`, `types.ts:81` (turnOrigin)

---

### TC-308: BR-09 — Blocking timeout ≤ 300s; PEER_006 on timeout (BR-09, FSD §3.2.3 line 342)

| Field | Value |
|-------|-------|
| **ID** | TC-308 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-09 (FSD.md:§3.2.3 line 342), BRD.md:STORY 1 AC-1.3 line 154 |
| **Preconditions** | Blocking peer_send with task not completing |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Caller blocks on peer_send (async=false) | Waits up to 300s |
| 2 | Simulate timeout (fake timers, 300s) | PEER_006 returned to caller |
| 3 | Verify task keeps running on target | Task still pollable via peer_status |

**Test Data:** message that never completes

**Postconditions:** Caller gets PEER_006; task survives timeout

**Traceability to code:** `bus.ts:72`, `constants.ts:20` (300,000ms)

---

### TC-309: BR-10/BR-11/BR-12 — Response routing + retention (BR-10, BR-11, BR-12, FSD §3.3.3 lines 483-485)

| Field | Value |
|-------|-------|
| **ID** | TC-309 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | BR-10 (FSD §3.3.3 line 483), BR-11 (line 484), BR-12 (line 485) |
| **Preconditions** | Completed peer task |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Verify response has fromTabId and toTabId | `types.ts:125-126` |
| 2 | Verify response delivered only to origin tab | Non-owner gets PEER_008 |
| 3 | Verify terminal task pollable for 60s then cleaned up | `constants.ts:26` (60s retention) |

**Test Data:** Completed task

**Postconditions:** Response routed correctly; retention enforced

**Traceability to code:** `bus.ts:60-61`, `types.ts:125-126`, `constants.ts:26`

---

## 5. Boundary & Negative Testing

### TC-400: Message length boundary — 0, 1, 16000, 16001 chars

| Field | Value |
|-------|-------|
| **ID** | TC-400 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | BR-05 (FSD §3.2.3 line 338), constants.ts:29 |
| **Preconditions** | peer_send with various message lengths |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send message length 0 | PEER_010 (empty) |
| 2 | Send message length 1 | Accepted |
| 3 | Send message length 16,000 | Accepted (boundary) |
| 4 | Send message length 16,001 | PEER_010 (oversized) |

**Test Data:** "", "a", 16000-char string, 16001-char string

**Postconditions:** Boundaries correctly enforced

**Traceability to code:** `bus.ts:152-159`, `constants.ts:29`

---

### TC-401: Non-owner peer_status gets PEER_008 (no existence oracle)

| Field | Value |
|-------|-------|
| **ID** | TC-401 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | DISC-04 (TDD §13), bus.ts:60-61 |
| **Preconditions** | Task created by Tab A; Tab C (non-owner) polls |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Tab A creates task via peer_send | taskId generated |
| 2 | Tab C calls `peer_status(taskId)` | PEER_008 (same as unknown taskId) |
| 3 | Verify no existence oracle — Tab C cannot distinguish unknown vs not-owner | Same error code |

**Test Data:** taskId from Tab A, Tab C as non-owner

**Postconditions:** Non-owner gets PEER_008; no information leakage

**Traceability to code:** `bus.ts:60-61`, DISC-04

---

### TC-402: Tab close mid-task — PEER_009 on queued task

| Field | Value |
|-------|-------|
| **ID** | TC-402 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | PEER_009 (FSD §9.1 line 895), BRD.md:§5.1 line 251 |
| **Preconditions** | Task queued in target tab; target tab closes |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Queue task to Tab B | Task in inbound queue |
| 2 | Simulate Tab B close | Queued tasks cancelled with PEER_009 |
| 3 | Verify origin tab notified | Cancellation propagated |

**Test Data:** Queued task

**Postconditions:** Task cancelled; origin notified; no orphan state

**Traceability to code:** `bus.ts:81-84`, `errors.ts:33`

---

### TC-403: Forged provenance markers rejected (PEER_010_FORGERY)

| Field | Value |
|-------|-------|
| **ID** | TC-403 |
| **Priority** | Medium |
| **Type** | Boundary / Negative |
| **Requirement** | PEER_010 forgery (FSD §9.1 line 896), SEC-01 L0 |
| **Preconditions** | Message contains peer framing markers |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Send message with `--- begin peer content ---` | PEER_010 (forgery) |
| 2 | Send message with `--- [PEER INBOUND` header | PEER_010 (forgery) |
| 3 | Verify zero-state — no task created | No queue entry |

**Test Data:** Messages with forged markers

**Postconditions:** Forged markers rejected zero-state

**Traceability to code:** `envelope.ts:28-30`, `bus.ts:162-164`, `errors.ts:40-42`

---

## 6. UI/UX Testing

### TC-500: Badge increments + "[Peer inbound] from …" prefix rendered (FR-03 visibility, AC-2.4)

| Field | Value |
|-------|-------|
| **ID** | TC-500 |
| **Priority** | Medium |
| **Type** | UI/UX |
| **Requirement** | AC-2.4 (BRD.md:STORY 2 line 177), FR-03 (BRD.md:§2.4 line 210) |
| **Preconditions** | Peer inbound event emitted to receiving tab's webview |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Simulate `peer:inbound` event to Tab B's webview | Badge dot increments on Tab B's tab pill |
| 2 | Verify "[Peer inbound] from tab …" prefix row added to transcript | Prefix per `chat-peer-ui.js:50-53` |
| 3 | Verify badge clears when user focuses Tab B | Badge cleared on `switchToTab` |

**Test Data:** PeerInboundEvent with fromTabId, taskId, preview

**Postconditions:** Badge and prefix rendered correctly

**Traceability to code:** `chat-peer-ui.js:44-58`, `peer-inbound-bridge.ts:29-40`, `bus.ts:140` (emit peer:inbound)

---

### TC-501: peer:turn-settled reply row rendered below prefix

| Field | Value |
|-------|-------|
| **ID** | TC-501 |
| **Priority** | Medium |
| **Type** | UI/UX |
| **Requirement** | AC-2.4 (BRD.md:STORY 2 line 177), FR-03 |
| **Preconditions** | Peer turn completed; `peer:turn-settled` event emitted |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Simulate `peer:turn-settled` event (ok:true) | Reply row appended below prefix row |
| 2 | Simulate `peer:turn-settled` event (ok:false) | Curated failure row: `[Peer task failed — PEER_XXX: message]` |
| 3 | Verify reply wrapped in [PEER REPLY] untrusted frame | `envelope.ts:59-66` wrapPeerReply |

**Test Data:** PeerTurnSettledEvent with ok/text/error

**Postconditions:** Reply row rendered; failure curated

**Traceability to code:** `chat-peer-ui.js:61-73`, `dispatch.ts:47-50,98`, `envelope.ts:59-66`

---

## 7. Non-Functional Testing

### TC-600: Blocking peer_send performance — completes within 300s (NFR Performance)

| Field | Value |
|-------|-------|
| **ID** | TC-600 |
| **Priority** | Medium |
| **Type** | Non-Functional — Performance |
| **Requirement** | NFR Performance (BRD.md:§6 NFR line 271), constants.ts:20 |
| **Preconditions** | Blocking peer_send with target completing normally |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Tab A calls `peer_send(tabB, "msg", async:false)` | Caller blocks |
| 2 | Measure time until response received | Response time ≤ 300s for normal completion |
| 3 | Verify PEER_006 only on actual timeout (not normal completion) | No false PEER_006 |

**Test Data:** Normal task completion

**Postconditions:** Blocking call completes within timeout

**Traceability to code:** `bus.ts:72`, `constants.ts:20` (300,000ms), `task-manager.ts awaitTerminal`

---

### TC-601: Approval gate fail-closed — peer turn tool calls blocked without approval (Security)

| Field | Value |
|-------|-------|
| **ID** | TC-601 |
| **Priority** | Medium |
| **Type** | Non-Functional — Security |
| **Requirement** | AC-2.3 (BRD.md:STORY 2 line 176), FSD §7.3 line 844-845, TDD §8.2 |
| **Preconditions** | Peer turn with turnOrigin === 'peer'; approval gate handler present |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Peer turn attempts tool call | Gate requests user approval |
| 2 | User rejects approval | Tool call blocked; turn terminated |
| 3 | Verify fail-closed — no gate handler = tool calls blocked | `approval.ts:51-53` |
| 4 | Verify user turns NOT affected (turnOrigin === 'user') | `approval.ts:50` |

**Test Data:** Peer turn with tool call

**Postconditions:** Approval gate fail-closed; user turns byte-identical

**Traceability to code:** `approval.ts:40-69`, `peer-approval.ts:61-78`, `constants.ts:33` (30s timeout)

---

### TC-602: Provenance envelope marks peer content as untrusted (Security)

| Field | Value |
|-------|-------|
| **ID** | TC-602 |
| **Priority** | Medium |
| **Type** | Non-Functional — Security |
| **Requirement** | NFR Security (BRD.md:§6 NFR line 273), FSD §7.2 line 833 |
| **Preconditions** | Peer message sent between tabs |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Verify peer prompt wrapped in provenance envelope | `[PEER INBOUND — untrusted agent-to-agent content]` header |
| 2 | Verify peer reply wrapped in [PEER REPLY] frame | `envelope.ts:59-66` wrapPeerReply |
| 3 | Verify header stamped from receiving bus's own registry (anti-spoof) | `dispatch.ts:71-82` envelopeHeader |

**Test Data:** Peer message content

**Postconditions:** All peer content framed as untrusted; anti-spoofing enforced

**Traceability to code:** `envelope.ts:33-44,59-66`, `dispatch.ts:71-82`

---

## 8. Integration Testing

### TC-700: End-to-end tab-to-tab flow: peer_list → peer_send → response → peer_status

| Field | Value |
|-------|-------|
| **ID** | TC-700 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | FR-01, FR-02, FR-03 (BRD.md:§2.4 lines 208-210) |
| **Preconditions** | Two tabs registered; real PeerBus modules |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Tab A calls `peer_list()` | Discovers Tab B with tabId, role, status |
| 2 | Tab A calls `peer_send(tabB, "msg", async:false)` | Task created, delivered, executed |
| 3 | Tab A receives response with fromTabId/toTabId | Response routed to origin only |
| 4 | Tab A polls `peer_status(taskId)` | Returns completed state with reply |

**Test Data:** Full inter-tab flow

**Postconditions:** Complete E2E flow verified end-to-end

**Traceability to code:** `tools.ts:37-118`, `bus.ts:51-73`, `dispatch.ts:17-55`

---

### TC-701: Response isolation — origin-only delivery across multiple tabs

| Field | Value |
|-------|-------|
| **ID** | TC-701 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | FR-03 (BRD.md:§2.4 line 210), Risk line 252 |
| **Preconditions** | Three tabs A, B, C; A and C both send to B |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Tab A sends task1 to Tab B | taskId1 |
| 2 | Tab C sends task2 to Tab B | taskId2 |
| 3 | Tab A polls peer_status(taskId1) | toTabId:tabA (not tabC) |
| 4 | Tab C polls peer_status(taskId2) | toTabId:tabC (not tabA) |
| 5 | Tab A cannot see task2 data | PEER_008 for task2 |

**Test Data:** Two concurrent sends to same target

**Postconditions:** Response isolation confirmed; no cross-tab mixing

**Traceability to code:** `bus.ts:60-61` (owner check), `types.ts:125-126`

---

## 9. Regression Testing

### TC-800: Existing PeerBus test suites remain green

| Field | Value |
|-------|-------|
| **ID** | TC-800 |
| **Priority** | Medium |
| **Type** | Regression |
| **Requirement** | SA4E-369 existing tests (TDD §10) |
| **Preconditions** | Existing SA4E-369 test suite present |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run existing SA4E-369 unit + integration tests | All tests pass |
| 2 | Verify no regressions from SA4E-385 guidance-layer additions | No test failures introduced |

**Test Data:** Existing test fixtures

**Postconditions:** Zero regressions in existing PeerBus test coverage

**Traceability to code:** SA4E-369 TDD §10; existing `extension/src/__tests__/peer/`

---

## 10. Requirements Traceability Matrix (RTM)

| Requirement | Source | Test Cases | Status |
|-------------|--------|------------|--------|
| FR-01 | BRD.md:§2.4 line 208 | TC-001, TC-002, TC-100, TC-300 | Covered |
| FR-02 | BRD.md:§2.4 line 209 | TC-003, TC-004, TC-005, TC-101, TC-400, TC-700 | Covered |
| FR-03 | BRD.md:§2.4 line 210 | TC-006, TC-007, TC-205, TC-500, TC-501, TC-700, TC-701 | Covered |
| FR-04 | BRD.md:§2.4 line 211 | TC-008, TC-302 | Covered |
| FR-05 | BRD.md:§2.4 line 212 | TC-200, TC-201, TC-202, TC-203, TC-204, TC-205, TC-206, TC-207, TC-208, TC-209, TC-305..TC-309 | Covered |
| FR-06 | BRD.md:§2.4 line 213 | TC-009, TC-300 | Covered |
| AC-1.1 | BRD.md:STORY 1 line 152 | TC-001, TC-300 | Covered |
| AC-1.2 | BRD.md:STORY 1 line 153 | TC-009 | Covered |
| AC-1.3 | BRD.md:STORY 1 line 154 | TC-003, TC-600 | Covered |
| AC-1.4 | BRD.md:STORY 1 line 155 | TC-006 | Covered |
| AC-1.5 | BRD.md:STORY 1 line 156 | TC-007, TC-701 | Covered |
| AC-1.6 | BRD.md:STORY 1 line 157 | TC-005, TC-101 | Covered |
| AC-2.1 | BRD.md:STORY 2 line 174 | TC-001 | Covered |
| AC-2.2 | BRD.md:STORY 2 line 175 | TC-102, TC-307 | Covered |
| AC-2.3 | BRD.md:STORY 2 line 176 | TC-601 | Covered |
| AC-2.4 | BRD.md:STORY 2 line 177 | TC-500, TC-501 | Covered |
| AC-2.5 | BRD.md:STORY 2 line 178 | TC-006 | Covered |
| AC-3.1 | BRD.md:STORY 3 line 196 | TC-100 | Covered |
| AC-3.2 | BRD.md:STORY 3 line 197 | TC-001 | Covered |
| AC-3.3 | BRD.md:STORY 3 line 198 | TC-201, TC-301 | Covered |
| AC-3.4 | BRD.md:STORY 3 line 199 | TC-008 | Covered |
| AC-3.5 | BRD.md:STORY 3 line 200 | TC-009 | Covered |
| PEER_001 | FSD.md:§9.1 line 887 | TC-200 | Covered |
| PEER_002 | FSD.md:§9.1 line 888 | TC-201 | Covered |
| PEER_003 | FSD.md:§9.1 line 889 | TC-202 | Covered |
| PEER_004 | FSD.md:§9.1 line 890 | TC-203 | Covered |
| PEER_005 | FSD.md:§9.1 line 891 | TC-204 | Covered |
| PEER_006 | FSD.md:§9.1 line 892 | TC-205 | Covered |
| PEER_007 | FSD.md:§9.1 line 893 | TC-206 | Covered |
| PEER_008 | FSD.md:§9.1 line 894 | TC-207 | Covered |
| PEER_009 | FSD.md:§9.1 line 895 | TC-208 | Covered |
| PEER_010 | FSD.md:§9.1 line 896 | TC-209 | Covered |
| BR-01 | FSD.md:§3.1.3 line 212 | TC-300 | Covered |
| BR-02 | FSD.md:§3.1.3 line 213 | TC-301 | Covered |
| BR-03 | FSD.md:§3.1.3 line 214 | TC-302 | Covered |
| BR-04 | FSD.md:§3.2.3 line 337 | TC-303 | Covered |
| BR-05 | FSD.md:§3.2.3 line 338 | TC-304 | Covered |
| BR-06 | FSD.md:§3.2.3 line 339 | TC-305 | Covered |
| BR-07 | FSD.md:§3.2.3 line 340 | TC-306 | Covered |
| BR-08 | FSD.md:§3.2.3 line 341 | TC-307 | Covered |
| BR-09 | FSD.md:§3.2.3 line 342 | TC-308 | Covered |
| BR-10 | FSD.md:§3.3.3 line 483 | TC-309 | Covered |
| BR-11 | FSD.md:§3.3.3 line 484 | TC-309 | Covered |
| BR-12 | FSD.md:§3.3.3 line 485 | TC-309 | Covered |

### Coverage Summary

| Category | Total | Covered | Coverage % |
|----------|-------|---------|------------|
| Functional Requirements (FR-01..06) | 6 | 6 | 100% |
| Acceptance Criteria (AC-1.1..AC-3.5) | 15 | 15 | 100% |
| Error Codes (PEER_001..010) | 10 | 10 | 100% |
| Business Rules (BR-01..BR-12) | 12 | 12 | 100% |
| **Overall** | **43** | **43** | **100%** |

---

## 11. Appendix

### 11.1 Test Data CSV Files

Located at `documents/SA4E-385/testdata/`:

| File | Description | Related TC IDs |
|------|-------------|----------------|
| `pre-seeded-peers.csv` | Baseline peer tab identities (tabId, role, status, capabilities) | TC-001, TC-002, TC-008, TC-009 |
| `create-peer-task-testdata.csv` | Valid + invalid peer_send inputs (message, async, tabId) | TC-003..TC-005, TC-200..TC-209, TC-400 |
| `peer-status-poll-testdata.csv` | Async polling scenarios (taskId, expected state, owner/non-owner) | TC-004, TC-006, TC-205, TC-207, TC-401 |
| `error-code-testdata.csv` | One row per PEER_001–010 with expected message | TC-200..TC-209 |
| `boundary-testdata.csv` | Message length boundaries (0, 1, 16000, 16001) | TC-400, TC-403 |

### 11.2 DISC Items Requiring Clarification

| ID | Issue | Impact | Required Action |
|----|-------|--------|-----------------|
| DISC-01 | FSD §3.2.5 attributes message validation to PEER_003; implementation uses PEER_010 | High | BA/TA to correct FSD §3.2.5 and §9.1 before STC sign-off |
| DISC-02 | FSD §9.1 PEER_010 described as "any pre-send guard trip"; implementation limits to message validation | Low | Clarify FSD §9.1 (documentation only) |
| DISC-03 | FSD uses `originTabId`; runtime uses `fromTabId` | Low | Document alignment (no code change) |
| DISC-04 | Non-owner peer_status gets PEER_008 (no existence oracle) | Low | Documented in TC-207, TC-401 (no code change) |
| DISC-05 | MessageEnvelope fromTabId/toTabId perspective differs (caller vs receiver view) | Low | Document perspective (no code change) |

### 11.3 Decisions Needed from SM Before Phase 5

1. **DISC-01 resolution:** Confirm BA/TA will correct FSD §3.2.5 and §9.1 to map message validation → PEER_010 (not PEER_003) before dev-agent begins implementation guidance work.
2. **Test harness two-tab simulation:** Confirm whether the vitest harness can simulate ≥2 tabs for inter-tab tests, or if mocks are required.
3. **Manual SIT execution:** Confirm if SM will request manual SIT execution on localhost VS Code extension host (badge, prefix, approval dialog verification).

---

*End of STC — SA4E-385 v1.0 (2026-10-26)*
