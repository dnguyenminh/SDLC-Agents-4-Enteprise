# Functional Specification Document (FSD)

## SA4E-294 — SA4E-289.5 – Checkpointer Adapter

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-294 |
| Title | Checkpointer Adapter |
| Author | TA Agent |
| Version | 1.0 |
| Date | 2026-09-16 |
| Status | Draft |
| Related BRD | documents/SA4E-294/BRD.md |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-16 | TA Agent | Initial technical enrichment from pi-migration-plan and code intelligence |

---

## 1. Introduction

### 1.1 Purpose
<!-- TA enrichment -->
This FSD specifies the functional and technical requirements for the **Checkpointer Adapter** component within the Pi SDK migration initiative (Epic SA4E-289). The adapter provides serialization/deserialization between Pi SDK internal state and the existing RemoteCheckpointer backend (Knowledge Service `/api/v1/threads`). It enables PiWorkflow Engine to persist checkpoints using the current Backend-driven Knowledge Service without modifying the backend schema.

[Implements: SA4E-294]

### 1.2 Scope
- **In Scope:**
  - StateAdapter for PipelineState ↔ PiInternalState mapping
  - CheckpointerAdapter implementation for RemoteCheckpointer compatibility
  - Serialization of Pi session, agent outputs, chat history, tool calls
  - Integration with existing `extension/src/langgraph/core/remote-checkpointer.ts` contract
  - Backward compatibility with existing checkpoints
- **Out of Scope:**
  - Modification of Backend Knowledge Service schema
  - Pi SDK provider implementation (SA4E-294 Step 1)
  - Phase router logic

> **TA Note:** BRD file `documents/SA4E-294/BRD.md` was not found in workspace. Scope derived from Jira description and `documents/pi-migration-plan.md`.

### 1.3 Definitions & Acronyms

| Term | Definition |
|------|------------|
| Pi SDK | `@earendil-works/pi-agent-core` |
| RemoteCheckpointer | Backend-driven checkpoint saver over HTTP `/api/v1/threads` |
| PipelineState | Existing LangGraph state shape used in SDLC pipeline |
| PiInternalState | Pi SDK session/turn state representation |
| KB | Knowledge Base Service |

### 1.4 References

| Document | Location |
|----------|----------|
| Pi Migration Plan | documents/pi-migration-plan.md |
| BRD | documents/SA4E-294/BRD.md (missing) |
| Code Intelligence — Extension Knowledge | .analysis/code-intelligence/modules/extension-knowledge.md |
| Knowledge Module Spec | .analysis/code-intelligence/modules/knowledge.md |

---

## 2. System Overview

### 2.1 System Context Diagram
```xml
<mxfile>
  <diagram name="Context Diagram">
    <mxGraphModel>
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <mxCell id="2" value="VS Code Extension" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1">
          <mxGeometry x="200" y="120" width="160" height="80" as="geometry"/>
        </mxCell>
        <mxCell id="3" value="PiWorkflow Engine" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1">
          <mxGeometry x="200" y="250" width="160" height="80" as="geometry"/>
        </mxCell>
        <mxCell id="4" value="Checkpointer Adapter" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1">
          <mxGeometry x="500" y="250" width="160" height="80" as="geometry"/>
        </mxCell>
        <mxCell id="5" value="RemoteCheckpointer" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1">
          <mxGeometry x="800" y="250" width="160" height="80" as="geometry"/>
        </mxCell>
        <mxCell id="6" value="Knowledge Service" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1">
          <mxGeometry x="800" y="120" width="160" height="80" as="geometry"/>
        </mxCell>
        <mxCell id="7" edge="1" parent="1" source="2" target="3"/>
        <mxCell id="8" edge="1" parent="1" source="3" target="4"/>
        <mxCell id="9" edge="1" parent="1" source="4" target="5"/>
        <mxCell id="10" edge="1" parent="1" source="5" target="6"/>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

The Checkpointer Adapter sits between PiWorkflow Engine and the existing RemoteCheckpointer to translate Pi state into the Checkpoint schema consumed by Knowledge Service.

### 2.2 System Architecture
PiWorkflow Engine executes agent turns via Pi SDK. StateAdapter converts `PipelineState` to `PiInternalState` for execution and back. CheckpointerAdapter implements `BaseCheckpointSaver` interface:
- `getTuple(threadId)` → deserialize from KB
- `put(threadId, checkpoint)` → serialize to KB
- `putWrites` / `list` / `deleteThread`

Existing `extension/src/langgraph/core/remote-checkpointer.ts` remains unchanged; adapter wraps Pi state for compatibility.

---

## 3. Functional Requirements

### 3.1 Feature: Checkpointer Adapter for Pi State

**Source:** SA4E-294, pi-migration-plan §3 checkpointer-adapter.ts

#### 3.1.1 Description
Provide serialization/deserialization layer enabling Pi SDK session state to be persisted via RemoteCheckpointer backend. Adapter must maintain backward compatibility with existing `PipelineState` fields: `ticketKey`, `threadId`, `currentPhase`, `pipelineStatus`, `chatHistory`, `agentOutputs`, `errors`.

New fields: `piSessionId`, `currentAgentId`, `toolCallCount`.

#### 3.1.2 Use Case

**Use Case ID:** UC-001
**Actor:** PiWorkflow Engine
**Preconditions:** Thread exists in Knowledge Service, PiAgent instance active
**Postconditions:** Checkpoint persisted with Pi state encoded

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | PiWorkflow Engine | | Request checkpoint save after agent turn |
| 2 | | Checkpointer Adapter | Convert PiInternalState → PipelineState via StateAdapter |
| 3 | | Checkpointer Adapter | Serialize to SaveCheckpointInput |
| 4 | | RemoteCheckpointer | PUT /api/v1/threads/{threadId}/checkpoint |
| 5 | | Knowledge Service | Persist checkpoint, increment version |
| 6 | | Checkpointer Adapter | Return success with version |

**Alternative Flows:**
| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | State serialization error | Adapter returns EF-001 |

**Exception Flows:**
| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | KB unreachable | Wrap in KbUnreachableError, retry with backoff, fail after 3 attempts |

#### 3.1.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-001 | Checkpoint version must monotonically increase per thread | KnowledgeService |
| BR-002 | `threadId` must be UUID v4 | models.ts UUID_V4_REGEX |
| BR-003 | Workspace binding enforced via X-Project-Id / JWT wid | SECURITY-REVIEW #18 |
| BR-004 | Checkpoint body never logged, only thread_id/version | SECURITY-REVIEW #19 |

#### 3.1.4 Data Specifications
**Input Data:**

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| threadId | string | Y | UUID v4 | Knowledge thread identifier |
| piSessionId | string | Y | non-empty | Pi SDK session ID |
| pipelineState | object | Y | - | Full PipelineState |
| metadata | object | N | - | LangGraph metadata |

**Output Data:**

| Field | Type | Description |
|-------|------|-------------|
| version | number | Checkpoint version |
| checkpoint | object | Serialized state |

#### 3.1.5 API Contract (Functional View)
> **Note:** Technical details in TDD.

**Endpoint:** `PUT /api/v1/threads/{threadId}/checkpoint`
**Purpose:** Persist Pi-adapted checkpoint

**Input Parameters:**

| Parameter | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| threadId | path | Y | BR-002 | UUID |
| checkpoint | body | Y | - | Serialized Pi state |
| metadata | body | N | - | Execution metadata |

**Output Data:**

| Field | Type | Description |
|-------|------|-------------|
| version | number | New version |
| lastUpdatedAt | string | ISO timestamp |

**Business Error Scenarios:**

| Scenario | User Message | Trigger Condition |
|----------|-------------|-------------------|
| THREAD_NOT_FOUND | Thread not found | Invalid threadId or workspace mismatch |
| PAYLOAD_TOO_LARGE | Checkpoint too large | >10MB body limit |
| KB_UNREACHABLE | Service unavailable | Network error |

---

## 4. Data Model

### 4.1 Entity Relationship Diagram
```xml
<mxfile>
  <diagram name="Data Model">
    <mxGraphModel>
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <mxCell id="2" value="PipelineState" vertex="1" parent="1">
          <mxGeometry x="100" y="100" width="140" height="80" as="geometry"/>
        </mxCell>
        <mxCell id="3" value="PiInternalState" vertex="1" parent="1">
          <mxGeometry x="400" y="100" width="140" height="80" as="geometry"/>
        </mxCell>
        <mxCell id="4" value="Checkpoint" vertex="1" parent="1">
          <mxGeometry x="250" y="300" width="140" height="80" as="geometry"/>
        </mxCell>
        <mxCell id="5" edge="1" parent="1" source="2" target="3"/>
        <mxCell id="6" edge="1" parent="1" source="2" target="4"/>
        <mxCell id="7" edge="1" parent="1" source="3" target="4"/>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

### 4.2 Logical Entities

#### Entity: PipelineState
| Attribute | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| ticketKey | string | Y | - | Jira ticket |
| threadId | string | Y | UUID v4 | KB thread |
| currentPhase | string | Y | - | SDLC phase |
| piSessionId | string | N | - | Pi session |
| chatHistory | array | N | - | Messages |

**Relationships:**
| From | To | Cardinality | Description |
|------|----|-------------|-------------|
| PipelineState | Checkpoint | 1:1 | State persisted |

---

## 5. Integration Specifications

### 5.1 External System: Knowledge Service

| Attribute | Value |
|-----------|-------|
| Purpose | Persistent checkpoint storage |
| Direction | Bidirectional |
| Data Format | JSON |
| Frequency | Real-time on phase transition |

**Data Exchange:**
| Our Data | External Data | Direction | Business Rule |
|----------|--------------|-----------|---------------|
| SaveCheckpointInput | Checkpoint row | Send | BR-001 |
| threadId | thread_id | Send | BR-002 |

Retry policy: 3 attempts with exponential backoff 200ms→800ms. Circuit breaker after 5 failures.

---

## 6. Processing Logic

### 6.1 Serialize Pi State to Checkpoint

**Trigger:** PiWorkflow Engine completes agent turn
**Input:** PiInternalState, PipelineState
**Output:** SaveCheckpointInput

**Processing Steps:**
| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Validate threadId UUID v4 | EF-001 invalid format |
| 2 | StateAdapter.toPipelineState | Log serialization error |
| 3 | Extract chatHistory → messages | Skip empty |
| 4 | Build SaveCheckpointInput | Validate size <10MB |
| 5 | Call RemoteCheckpointer.put | Retry on KbUnreachableError |

**Activity Diagram:**
```xml
<mxfile>
  <diagram name="Process Flow">
    <mxGraphModel>
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <mxCell id="2" value="Start" vertex="1" parent="1"/>
        <mxCell id="3" value="Validate" vertex="1" parent="1"/>
        <mxCell id="4" value="Serialize" vertex="1" parent="1"/>
        <mxCell id="5" value="PUT Checkpoint" vertex="1" parent="1"/>
        <mxCell id="6" value="End" vertex="1" parent="1"/>
        <mxCell id="7" edge="1" parent="1" source="2" target="3"/>
        <mxCell id="8" edge="1" parent="1" source="3" target="4"/>
        <mxCell id="9" edge="1" parent="1" source="4" target="5"/>
        <mxCell id="10" edge="1" parent="1" source="5" target="6"/>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

**Pseudocode:**
```typescript
// Pseudocode for [Implements: SA4E-294]
function putCheckpoint(threadId: string, piState: PiInternalState): Promise<Checkpoint> {
    validateUuid(threadId); // BR-002
    const pipelineState = stateAdapter.fromPiState(piState);
    const input = serializeToSaveCheckpointInput(pipelineState);
    if (input.size > 10 * 1024 * 1024) throw new PayloadTooLargeError();
    return remoteCheckpointer.put(threadId, input);
}
```

---

## 7. Security Requirements

### 7.1 Authentication & Authorization

| Role | Permissions | Screens/Features |
|------|-------------|-------------------|
| Developer | Read/Write checkpoints | Extension |
| System | Full access | Backend service |

Workspace binding enforced per Finding #18.

### 7.2 Data Sensitivity Classification

| Data Type | Classification | Business Requirement |
|-----------|----------------|----------------------|
| Checkpoint state | Internal | Contains agent outputs |
| Thread metadata | Internal | Workspace scoped |

### 7.3 Audit Trail

| Event | Logged Fields | Retention | Business Reason |
|-------|--------------|-----------|-----------------|
| CHECKPOINT_SAVED | thread_id, version | 90 days | Debugging |

---

## 8. Non-Functional Specifications

| Category | Business Requirement | Acceptance Criteria |
|----------|---------------------|---------------------|
| Performance | Checkpoint save latency | <500ms p95 |
| Availability | KB service uptime | 99.9% |
| Scalability | Concurrent threads | 1,000 threads |
| Data Retention | Checkpoint history | 30 versions/thread |

---

## 9. Error Handling & Logging

### 9.1 Error Scenarios

| Scenario | Severity | User Message | Expected Behavior |
|----------|----------|-------------|-------------------|
| KB_UNREACHABLE | Warning | Service temporarily unavailable | Retry, show recoverable error |
| SERIALIZATION_ERROR | Critical | State save failed | Log error, abort phase |

Structured logging: JSON, fields `threadId`, `version`, `durationMs`.

---

## 10. Testing Considerations

### 10.1 Test Scenarios

| ID | Scenario | Input | Expected Output | Priority |
|----|----------|-------|-----------------|----------|
| TC-001 | Save Pi state | Valid PiInternalState | Checkpoint version incremented | High |
| TC-002 | Invalid UUID | threadId malformed | 404 THREAD_NOT_FOUND | High |
| TC-003 | KB unreachable | Network error | KbUnreachableError after retries | Medium |

---

## 11. Appendix

### Diagrams
| Diagram | File |
|---------|------|
| Context | diagrams/context.drawio |
| Data Model | diagrams/data-model.drawio |

### Change Log from BRD
BRD missing; scope derived from Jira SA4E-294 and pi-migration-plan.md §3 checkpointer-adapter.ts.

---

<!-- TA enrichment completed -->
