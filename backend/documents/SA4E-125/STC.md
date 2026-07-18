# STC — Software Test Cases

**Ticket:** SA4E-125 | **Author:** QA Agent | **Version:** 1.0 | **Total Cases:** 33

**Priority:** P0 = Critical path, P1 = Important, P2 = Nice-to-have

---

## FR-1: Index-based Phase Routing (v2)

### TC-01: Normal advance increments currentPhaseIndex
| Field | Value |
|-------|-------|
| **ID** | TC-01 |
| **Title** | Normal advance increments `currentPhaseIndex` by 1 |
| **Description** | Verify `advancePhaseNode()` increments the index by 1 when the current phase exists and pipeline is running |
| **Preconditions** | `state = { currentPhaseIndex: 0, currentPhase: "design", pipelineDefinition: { phases: [{ id: "design" }, { id: "dev" }, { id: "qa" }] }, pipelineStatus: "running", approvalDecision: null }` |
| **Test Steps** | 1. Call `advancePhaseNode(state)`<br>2. Assert returned `currentPhaseIndex === 1` |
| **Expected Result** | `currentPhaseIndex` incremented to 1, `currentPhase` set to `"dev"` |
| **Priority** | P0 |

### TC-02: routeFromSm reads phase by index
| Field | Value |
|-------|-------|
| **ID** | TC-02 |
| **Title** | `routeFromSm()` reads agent ID by `currentPhaseIndex` |
| **Description** | Verify `routeFromSm()` returns the first `agentIds[0]` of the phase at the current index |
| **Preconditions** | `state = { currentPhaseIndex: 1, currentPhase: "dev", pipelineDefinition: { phases: [{ id: "design", agentIds: ["ba-agent"] }, { id: "dev", agentIds: ["dev-agent"] }] } }` |
| **Test Steps** | 1. Call `routeFromSm(state)`<br>2. Assert return value is `"dev-agent"` |
| **Expected Result** | Returns `"dev-agent"` — reads phase at index 1 |
| **Priority** | P0 |

### TC-03: Pipeline ends when index >= phases.length
| Field | Value |
|-------|-------|
| **ID** | TC-03 |
| **Title** | Pipeline routes to END when `currentPhaseIndex >= phases.length` |
| **Description** | Verify `routeAfterAdvance()` routes to `__end__` when all phases are complete |
| **Preconditions** | `state = { currentPhaseIndex: 3, pipelineDefinition: { phases: [{ id: "a" }, { id: "b" }, { id: "c" }] }, pipelineStatus: "running" }` |
| **Test Steps** | 1. Call `routeAfterAdvance(state)`<br>2. Assert return value is `END` |
| **Expected Result** | Returns `END` — pipeline complete |
| **Priority** | P0 |

---

## FR-2: PipelineDefinition in State (v2)

### TC-04: Per-thread isolation — Thread A swap doesn't affect Thread B
| Field | Value |
|-------|-------|
| **ID** | TC-04 |
| **Title** | Per-thread isolation — hot-swap on Thread A does not affect Thread B |
| **Description** | Verify each thread holds its own `pipelineDefinition` snapshot; Thread A's hot-swap does not mutate Thread B's state |
| **Preconditions** | Thread A: `{ pipelineDefinition: { phases: [{ id: "brd" }] } }`<br>Thread B: `{ pipelineDefinition: { phases: [{ id: "fsd" }] } }` |
| **Test Steps** | 1. Apply hot-swap on Thread A: new phases `[{ id: "ux" }]`<br>2. Assert Thread A's `pipelineDefinition` updated<br>3. Assert Thread B's `pipelineDefinition` unchanged (`[{ id: "fsd" }]`) |
| **Expected Result** | Thread B's pipeline definition is isolated and unchanged |
| **Priority** | P1 |

### TC-05: PipelineDefinition null fallback to agentRegistry
| Field | Value |
|-------|-------|
| **ID** | TC-05 |
| **Title** | Null `pipelineDefinition` falls back to `agentRegistry` |
| **Description** | Verify `routeFromSm()` uses legacy `agentRegistry.getFirstAgentNode()` when `pipelineDefinition` is null |
| **Preconditions** | `state = { pipelineDefinition: null, currentPhase: "design" }`<br>`agentRegistry.getFirstAgentNode("design")` returns `"ba-agent"` |
| **Test Steps** | 1. Call `routeFromSm(state)`<br>2. Assert it calls `agentRegistry.getFirstAgentNode()`<br>3. Assert return value is `"ba-agent"` |
| **Expected Result** | Falls back to legacy registry lookup |
| **Priority** | P1 |

---

## FR-3: Sandboxed Hot-Swap (v2)

### TC-06: Valid spec applies successfully
| Field | Value |
|-------|-------|
| **ID** | TC-06 |
| **Title** | Valid spec with non-empty phases and agentIds applies successfully |
| **Description** | Verify a valid pipeline definition passes all 3 sandbox validation rules and is applied |
| **Preconditions** | Mock LLM extraction returns `{ phases: [{ id: "design", agentIds: ["ba-agent"] }] }` |
| **Test Steps** | 1. Call `handleLiveSpecMutation("/workspace", "spec.md")`<br>2. Assert `return true`<br>3. Assert `graph = null` (rebuild triggered)<br>4. Assert `HOT_SWAP_SUCCESS` emitted to UI |
| **Expected Result** | Hot-swap succeeds, graph marked for rebuild, success event emitted |
| **Priority** | P0 |

### TC-07: Empty phases list rejected
| Field | Value |
|-------|-------|
| **ID** | TC-07 |
| **Title** | Empty `phases` list is rejected with error |
| **Description** | Verify validation rule 1 (non-empty phases) rejects spec with empty phase list |
| **Preconditions** | Mock LLM extraction returns `{ phases: [] }` |
| **Test Steps** | 1. Call `handleLiveSpecMutation("/workspace", "spec.md")`<br>2. Assert `return false`<br>3. Assert `SPEC_COMPILE_ERROR` emitted with `"Empty phase list"` |
| **Expected Result** | Hot-swap rejected, old config preserved, error reported to UI |
| **Priority** | P1 |

### TC-08: Phase missing agentIds rejected
| Field | Value |
|-------|-------|
| **ID** | TC-08 |
| **Title** | Phase without `agentIds` is rejected |
| **Description** | Verify validation rule 2 rejects spec where a phase has empty `agentIds` |
| **Preconditions** | Mock LLM extraction returns `{ phases: [{ id: "design", agentIds: [] }] }` |
| **Test Steps** | 1. Call `handleLiveSpecMutation("/workspace", "spec.md")`<br>2. Assert `return false`<br>3. Assert `SPEC_COMPILE_ERROR` includes `"missing agentIds"` |
| **Expected Result** | Hot-swap rejected, error contains phase ID |
| **Priority** | P1 |

### TC-09: LLM extraction failure reported to UI
| Field | Value |
|-------|-------|
| **ID** | TC-09 |
| **Title** | LLM extraction failure is caught and reported to UI |
| **Description** | Verify when LLM extraction throws, the error is caught, old config preserved, and error emitted |
| **Preconditions** | Mock LLM extraction throws `Error("LLM timeout")` |
| **Test Steps** | 1. Call `handleLiveSpecMutation("/workspace", "spec.md")`<br>2. Assert `return false`<br>3. Assert `SPEC_COMPILE_ERROR` emitted with `"LLM extraction failed"` |
| **Expected Result** | Error caught gracefully, old config preserved |
| **Priority** | P1 |

---

## FR-4: Index Realignment (v3)

### TC-10: Phase reorder — resolvePhaseIndex realigns correctly
| Field | Value |
|-------|-------|
| **ID** | TC-10 |
| **Title** | Phase reorder realigns `currentPhaseIndex` via `resolvePhaseIndex` |
| **Description** | Verify after hot-swap reorders phases, `resolvePhaseIndex()` finds the phase by ID and returns new index |
| **Preconditions** | `state = { currentPhaseIndex: 0, currentPhase: "qa", pipelineDefinition: { phases: [{ id: "dev" }, { id: "qa" }, { id: "design" }] } }`<br>Phase `"qa"` moved from index 2 to index 1 |
| **Test Steps** | 1. Call `resolvePhaseIndex(state)`<br>2. Assert return value is `1` (realigned) |
| **Expected Result** | Returns `1` — self-healing realignment by ID match |
| **Priority** | P0 |

### TC-11: resolvePhaseIndex is pure (no state mutation)
| Field | Value |
|-------|-------|
| **ID** | TC-11 |
| **Title** | `resolvePhaseIndex()` is a pure function — no state mutation |
| **Description** | Verify `resolvePhaseIndex()` does not modify any fields in the input state |
| **Preconditions** | `state = { currentPhaseIndex: 0, currentPhase: "qa", pipelineDefinition: { phases: [{ id: "qa" }] } }`<br>Capture `Object.freeze(state)` clone |
| **Test Steps** | 1. Deep-clone state before call<br>2. Call `resolvePhaseIndex(state)`<br>3. Assert state is deeply equal to original clone |
| **Expected Result** | State unchanged — pure function |
| **Priority** | P1 |

### TC-12: routeFromSm uses resolvePhaseIndex result
| Field | Value |
|-------|-------|
| **ID** | TC-12 |
| **Title** | `routeFromSm()` calls `resolvePhaseIndex()` instead of raw `currentPhaseIndex` |
| **Description** | Verify `routeFromSm()` delegates to `resolvePhaseIndex()` for index resolution |
| **Preconditions** | `state = { currentPhaseIndex: 0, currentPhase: "qa", pipelineDefinition: { phases: [{ id: "dev" }, { id: "qa" }, { id: "design" }] } }` |
| **Test Steps** | 1. Call `routeFromSm(state)`<br>2. Assert it returns `"qa-agent"` (resolved from realigned index 1, not raw index 0) |
| **Expected Result** | Uses realigned index from `resolvePhaseIndex()` |
| **Priority** | P1 |

---

## FR-5: State Size Optimization (v3)

### TC-13: PipelineDefState excludes prompts/tools/config
| Field | Value |
|-------|-------|
| **ID** | TC-13 |
| **Title** | `PipelineDefPhase` excludes prompts, tools, and config fields |
| **Description** | Verify `PipelineDefPhase` type only contains `id` and `agentIds`, no extra fields |
| **Preconditions** | Full extraction result includes `{ id, agentIds, prompt, tools, config }` |
| **Test Steps** | 1. Construct `PipelineDefState` from full extraction<br>2. Assert each phase has exactly keys `["id", "agentIds"]`<br>3. Assert `prompt`, `tools`, `config` are NOT present |
| **Expected Result** | Only `id` and `agentIds` stored in state |
| **Priority** | P1 |

### TC-14: Checkpoint size ≤ 5KB
| Field | Value |
|-------|-------|
| **ID** | TC-14 |
| **Title** | Checkpoint size for pipeline definition ≤ 5KB |
| **Description** | Verify serialized `PipelineDefState` is within 5KB budget |
| **Preconditions** | `PipelineDefState` with 10 phases (max expected) |
| **Test Steps** | 1. Serialize `PipelineDefState` to JSON<br>2. Calculate byte length<br>3. Assert ≤ 5120 bytes |
| **Expected Result** | Checkpoint size ≤ 5KB |
| **Priority** | P2 |

---

## FR-6: Orphaned Phase Detection & Pause (v4)

### TC-15: resolvePhaseIndex returns -1 for deleted phase
| Field | Value |
|-------|-------|
| **ID** | TC-15 |
| **Title** | `resolvePhaseIndex()` returns -1 when current phase is deleted from config |
| **Description** | Verify orphan detection — phase ID no longer exists in any position |
| **Preconditions** | `state = { currentPhaseIndex: 0, currentPhase: "orphan-phase", pipelineDefinition: { phases: [{ id: "a" }, { id: "b" }] } }` |
| **Test Steps** | 1. Call `resolvePhaseIndex(state)`<br>2. Assert return value is `-1` |
| **Expected Result** | Returns `-1` — phase `"orphan-phase"` not found |
| **Priority** | P0 |

### TC-16: Pipeline pauses with pipelineStatus "paused"
| Field | Value |
|-------|-------|
| **ID** | TC-16 |
| **Title** | Pipeline pauses when orphan detected and no approval decision |
| **Description** | Verify `advancePhaseNode()` sets `pipelineStatus: "paused"` when `idx === -1` and `approvalDecision === null` |
| **Preconditions** | `state = { currentPhaseIndex: 0, currentPhase: "orphan", pipelineDefinition: { phases: [{ id: "a" }] }, pipelineStatus: "running", approvalDecision: null }`<br>`resolvePhaseIndex(state)` returns `-1` |
| **Test Steps** | 1. Call `advancePhaseNode(state)`<br>2. Assert returned `pipelineStatus === "paused"`<br>3. Assert returned `approvalRequired === true` |
| **Expected Result** | Pipeline pauses, awaiting human intervention |
| **Priority** | P0 |

### TC-17: routeAfterAdvance routes to END when paused
| Field | Value |
|-------|-------|
| **ID** | TC-17 |
| **Title** | `routeAfterAdvance()` routes to END when `pipelineStatus === "paused"` |
| **Description** | Verify the routing function terminates the graph loop when pipeline is paused |
| **Preconditions** | `state = { pipelineStatus: "paused", currentPhaseIndex: 0, pipelineDefinition: { phases: [{ id: "a" }] } }` |
| **Test Steps** | 1. Call `routeAfterAdvance(state)`<br>2. Assert return value is `END` |
| **Expected Result** | Routes to `END` — pipeline waits for human input |
| **Priority** | P0 |

### TC-18: No agentRegistry fallback for orphaned phase
| Field | Value |
|-------|-------|
| **ID** | TC-18 |
| **Title** | `routeFromSm()` does NOT use `agentRegistry` fallback when orphaned |
| **Description** | Verify `routeFromSm()` returns `"advance_phase"` instead of consulting `agentRegistry` when `resolvePhaseIndex` returns -1 |
| **Preconditions** | `state = { pipelineDefinition: { phases: [{ id: "a", agentIds: ["ba-agent"] }] }, currentPhaseIndex: 0, currentPhase: "orphan" }`<br>Mocks: `resolvePhaseIndex()` returns `-1` |
| **Test Steps** | 1. Call `routeFromSm(state)`<br>2. Assert return value is `"advance_phase"`<br>3. Assert `agentRegistry.getFirstAgentNode()` is NOT called |
| **Expected Result** | Returns `"advance_phase"` — no fallback to registry |
| **Priority** | P0 |

---

## FR-7: Skip/Cancel Phase Decisions (v5)

### TC-19: handleApproval("skip") sets pipelineStatus "running"
| Field | Value |
|-------|-------|
| **ID** | TC-19 |
| **Title** | `handleApproval("skip")` sets `pipelineStatus: "running"` |
| **Description** | Verify skip decision transitions pipeline from paused back to running |
| **Preconditions** | Thread ID with `pipelineStatus: "paused"` state |
| **Test Steps** | 1. Call `handleApproval(threadId, "skip")`<br>2. Assert state update sets `pipelineStatus: "running"`<br>3. Assert `approvalDecision: "skip"` |
| **Expected Result** | Pipeline resumes as running with skip decision recorded |
| **Priority** | P0 |

### TC-20: handleApproval("cancel") sets pipelineStatus "cancelled"
| Field | Value |
|-------|-------|
| **ID** | TC-20 |
| **Title** | `handleApproval("cancel")` sets `pipelineStatus: "cancelled"` |
| **Description** | Verify cancel decision terminates the pipeline |
| **Preconditions** | Thread ID with `pipelineStatus: "paused"` state |
| **Test Steps** | 1. Call `handleApproval(threadId, "cancel")`<br>2. Assert state update sets `pipelineStatus: "cancelled"` |
| **Expected Result** | Pipeline terminated |
| **Priority** | P0 |

### TC-21: Skip repositions index to phase at old position
| Field | Value |
|-------|-------|
| **ID** | TC-21 |
| **Title** | Skip repositions `currentPhaseIndex` to the phase at the old index position |
| **Description** | Verify `advancePhaseNode()` with `"skip"` sets index to `state.currentPhaseIndex` (old position), not `idx+1` |
| **Preconditions** | `state = { currentPhaseIndex: 1, currentPhase: "orphan", pipelineDefinition: { phases: [{ id: "a" }, { id: "c" }, { id: "d" }] }, approvalDecision: "skip", pipelineStatus: "running" }`<br>`resolvePhaseIndex()` returns `-1` |
| **Test Steps** | 1. Call `advancePhaseNode(state)`<br>2. Assert returned `currentPhaseIndex === 1`<br>3. Assert returned `currentPhase === "c"` |
| **Expected Result** | Index stays at old position (1), phase `"c"` becomes current |
| **Priority** | P0 |

---

## FR-8: 3-Layer Skip Fix (v5)

### TC-22: Layer 1 — routeFromSm returns "advance_phase" when orphaned
| Field | Value |
|-------|-------|
| **ID** | TC-22 |
| **Title** | Layer 1: `routeFromSm()` returns `"advance_phase"` for orphaned phase |
| **Description** | Verify `routeFromSm` returns `"advance_phase"` (not agentRegistry) when `resolvePhaseIndex` is -1 |
| **Preconditions** | `state = { pipelineDefinition: { phases: [{ id: "a" }] }, currentPhaseIndex: 0, currentPhase: "ghost" }`<br>`resolvePhaseIndex` returns `-1` |
| **Test Steps** | 1. Call `routeFromSm(state)`<br>2. Assert return value is `"advance_phase"` |
| **Expected Result** | Routes to `advance_phase` node, NOT to an agent |
| **Priority** | P0 |

### TC-23: Layer 2 — advancePhaseNode handles skip/cancel
| Field | Value |
|-------|-------|
| **ID** | TC-23 |
| **Title** | Layer 2: `advancePhaseNode()` handles `"skip"` and `"cancel"` decisions |
| **Description** | Verify `advancePhaseNode()` branches correctly for skip vs cancel when orphaned |
| **Preconditions** | Skip: `state = { ..., approvalDecision: "skip" }` (idx=-1)<br>Cancel: `state = { ..., approvalDecision: "cancel" }` (idx=-1) |
| **Test Steps** | 1. Call with `"skip"` → assert `pipelineStatus: "running"`, `currentPhaseIndex` set to old position<br>2. Call with `"cancel"` → assert `pipelineStatus: "cancelled"` |
| **Expected Result** | Skip resumes with repositioned index; Cancel terminates |
| **Priority** | P0 |

### TC-24: Layer 3 — buildSmTargets includes "advance_phase"
| Field | Value |
|-------|-------|
| **ID** | TC-24 |
| **Title** | Layer 3: `buildSmTargets()` map includes `"advance_phase"` key |
| **Description** | Verify the SM routing target map contains `advance_phase` as a valid destination |
| **Preconditions** | `buildSmTargets()` called during graph construction |
| **Test Steps** | 1. Call `buildSmTargets()`<br>2. Assert returned map includes `"advance_phase": "advance_phase"` |
| **Expected Result** | Map includes `advance_phase` as a routing target |
| **Priority** | P1 |

### TC-25: Full skip flow — -1 to next phase
| Field | Value |
|-------|-------|
| **ID** | TC-25 |
| **Title** | Full skip flow: `-1 → advance_phase → reposition → next phase runs` |
| **Description** | End-to-end verification of all 3 layers working together |
| **Preconditions** | `state = { pipelineDefinition: { phases: [{ id: "a" }, { id: "b" }] }, currentPhaseIndex: 0, currentPhase: "orphan", approvalDecision: "skip", pipelineStatus: "running" }` |
| **Test Steps** | 1. `resolvePhaseIndex(state)` → `-1`<br>2. `routeFromSm(state)` → `"advance_phase"`<br>3. `advancePhaseNode(state)` → `{ currentPhaseIndex: 0, currentPhase: "a" }`<br>4. `routeAfterAdvance(updatedState)` → `"sm"` |
| **Expected Result** | Pipeline progresses to phase `"a"` at index 0 |
| **Priority** | P0 |

---

## FR-9: Ghost Context Barrier (v6)

### TC-26: Barrier message uses role "system" with ChatMessage type
| Field | Value |
|-------|-------|
| **ID** | TC-26 |
| **Title** | Barrier message uses `role: "system"` and type `ChatMessage` |
| **Description** | Verify the barrier is a `ChatMessage` (not LangChain `SystemMessage`) with `role: "system"` |
| **Preconditions** | State with `approvalDecision: "skip"` and orphaned phase |
| **Test Steps** | 1. Call `advancePhaseNode(state)` with skip<br>2. Get barrier from returned `chatHistory[-1]`<br>3. Assert `barrier.role === "system"`<br>4. Assert `barrier.id` exists and matches `ctx-{ts}-{uuid8}` pattern |
| **Expected Result** | Barrier is a `ChatMessage` with system role and unique ID |
| **Priority** | P0 |

### TC-27: Barrier appends to chatHistory (immutable spread)
| Field | Value |
|-------|-------|
| **ID** | TC-27 |
| **Title** | Barrier appends to `chatHistory` via immutable spread |
| **Description** | Verify existing messages are preserved and barrier is appended (not replacing) |
| **Preconditions** | `state.chatHistory = [{ id: "msg-1", role: "user", content: "hello", timestamp: "..." }]` |
| **Test Steps** | 1. Call `advancePhaseNode(state)` with skip<br>2. Assert returned `chatHistory.length === 2`<br>3. Assert returned `chatHistory[0].id === "msg-1"` (preserved)<br>4. Assert returned `chatHistory[1].role === "system"` (barrier appended) |
| **Expected Result** | Historical message preserved, barrier appended as new entry |
| **Priority** | P1 |

### TC-28: Barrier states skipped phase, void requests, and current phase
| Field | Value |
|-------|-------|
| **ID** | TC-28 |
| **Title** | Barrier content contains skipped phase, void declaration, and current phase |
| **Description** | Verify the barrier message content includes all three required pieces of information |
| **Preconditions** | Skip from phase `"design"` to phase `"qa"` |
| **Test Steps** | 1. Call `advancePhaseNode(state)` where skip transitions from `"design"` to `"qa"`<br>2. Assert barrier content includes `"design"` (skipped phase)<br>3. Assert barrier content includes `"void"` or equivalent<br>4. Assert barrier content includes `"qa"` (current phase) |
| **Expected Result** | Barrier clearly states which phase was skipped, that requests are void, and the current phase |
| **Priority** | P1 |

### TC-29: No barrier injected for normal transitions
| Field | Value |
|-------|-------|
| **ID** | TC-29 |
| **Title** | No barrier injected for normal (non-orphan) transitions |
| **Description** | Verify `advancePhaseNode()` does NOT inject a barrier when advancing normally |
| **Preconditions** | `state = { currentPhaseIndex: 0, currentPhase: "design", pipelineDefinition: { phases: [{ id: "design" }, { id: "qa" }] }, pipelineStatus: "running", approvalDecision: null, chatHistory: [] }` |
| **Test Steps** | 1. Call `advancePhaseNode(state)`<br>2. Assert returned `chatHistory` is empty (no barrier) |
| **Expected Result** | No barrier for normal advance — context bleeding is intended |
| **Priority** | P1 |

### TC-30: Message ID format: ctx-{timestamp}-{uuid8}
| Field | Value |
|-------|-------|
| **ID** | TC-30 |
| **Title** | Barrier message ID matches `ctx-{timestamp}-{uuid8}` format |
| **Description** | Verify the barrier ID follows the required format with timestamp and 8-char UUID |
| **Preconditions** | State with skip decision |
| **Test Steps** | 1. Call `advancePhaseNode(state)` with skip<br>2. Get barrier ID<br>3. Assert it matches regex `/^ctx-\d+-[0-9a-f]{8}$/` |
| **Expected Result** | ID conforms to `ctx-{timestamp}-{uuid8}` |
| **Priority** | P2 |

---

## Edge Cases

### TC-31: Out-of-bounds index clamping
| Field | Value |
|-------|-------|
| **ID** | TC-31 |
| **Title** | Out-of-bounds `currentPhaseIndex` is clamped |
| **Description** | Verify `advancePhaseNode()` clamps index to `pd.phases.length - 1` when it exceeds bounds |
| **Preconditions** | `state = { currentPhaseIndex: 5, pipelineDefinition: { phases: [{ id: "a" }, { id: "b" }] }, pipelineStatus: "running" }` |
| **Test Steps** | 1. Call `advancePhaseNode(state)`<br>2. Assert `currentPhaseIndex` clamped (or `stepStatus` set to `"ALL_DONE"`) |
| **Expected Result** | Graceful handling — either clamped to last phase or marked done |
| **Priority** | P2 |

### TC-32: Concurrent hot-swap on different threads
| Field | Value |
|-------|-------|
| **ID** | TC-32 |
| **Title** | Concurrent hot-swap on Thread A and Thread B does not cause race |
| **Description** | Verify two simultaneous hot-swaps on different threads each apply correctly without cross-contamination |
| **Preconditions** | Thread A using `spec-A.md`, Thread B using `spec-B.md` |
| **Test Steps** | 1. Trigger hot-swap on Thread A (spec-A.md) and Thread B (spec-B.md) concurrently<br>2. Assert Thread A's pipeline config updated from spec-A.md<br>3. Assert Thread B's pipeline config updated from spec-B.md |
| **Expected Result** | Both hot-swaps succeed independently |
| **Priority** | P1 |

### TC-33: Approval timeout — pipeline stays paused
| Field | Value |
|-------|-------|
| **ID** | TC-33 |
| **Title** | No automatic decision on timeout — pipeline stays `paused` |
| **Description** | Verify the pipeline does not auto-advance or auto-cancel; it must wait for explicit user input |
| **Preconditions** | State in `paused` status with `approvalDecision: null` |
| **Test Steps** | 1. Simulate timeout (no call to `handleApproval()`)<br>2. Assert `pipelineStatus` remains `"paused"`<br>3. Assert `approvalDecision` remains `null` |
| **Expected Result** | Pipeline stays paused indefinitely until explicit human decision |
| **Priority** | P2 |

---
