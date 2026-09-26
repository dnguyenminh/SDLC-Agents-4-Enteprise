# Functional Specification Document (FSD)

## SA4E-293 — State Adapter

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-293 |
| Title | SA4E-289.4 – State Adapter |
| Author | TA Agent |
| Version | 1.0 |
| Date | 2026-09-16 |
| Status | Draft |
| Related BRD | documents/SA4E-293/BRD.md |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-16 | TA Agent | Initial technical enrichment from BRD |

---

## 1. Introduction

### 1.1 Purpose
Specify technical design and implementation details for State Adapter enabling bidirectional mapping between existing `PipelineState` used by LangGraph workflow engine and Pi SDK internal state for SDLC Agents 4 Enterprise VS Code extension.

### 1.2 Scope
<!-- TA enrichment -->
Reference BRD scope with technical clarifications:
- Implements `state-adapter.ts` with `toPiState` and `fromPiState`
- Defines `types/pi-workflow-state.ts` extended schema
- Adds fields `piSessionId`, `currentAgentId`, `toolCallCount`
- Maintains backward compatibility with RemoteCheckpointer
- Tech stack: TypeScript, Hono backend, Svelte 4 + Vite webview, LangGraph orchestration, Python FastAPI auxiliary services [Implements: PREQ-001]

Out of scope: workflow execution engine, phase router, UI changes, LangGraph removal.

### 1.3 Definitions & Acronyms

| Term | Definition |
|------|------------|
| PipelineState | Existing LangGraph workflow state object |
| PiInternalState | State representation compatible with Pi SDK `@earendil-works/pi-agent-core` |
| State Adapter | Component mapping between PipelineState and PiInternalState |
| RemoteCheckpointer | Backend for workflow checkpoint persistence |

### 1.4 References

| Document | Location |
|----------|----------|
| BRD | documents/SA4E-293/BRD.md |
| Pi Migration Plan | documents/pi-migration-plan.md |
| FSD Template | documents/templates/FSD-TEMPLATE.md |

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
          <mxGeometry x="200" y="200" width="160" height="80" as="geometry"/>
        </mxCell>
        <mxCell id="3" value="State Adapter" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1">
          <mxGeometry x="200" y="320" width="160" height="80" as="geometry"/>
        </mxCell>
        <mxCell id="4" value="Pi SDK" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1">
          <mxGeometry x="480" y="320" width="160" height="80" as="geometry"/>
        </mxCell>
        <mxCell id="5" value="RemoteCheckpointer" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1">
          <mxGeometry x="200" y="440" width="160" height="80" as="geometry"/>
        </mxCell>
        <mxCell id="6" value="LangGraph PipelineState" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1">
          <mxGeometry x="-120" y="320" width="160" height="80" as="geometry"/>
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

State Adapter sits at boundary between legacy PipelineState and Pi SDK state.

### 2.2 System Architecture
<!-- TA enrichment -->
Extension layer `src/pi-workflow/state-adapter.ts` provides mapping. Backend remains unchanged for RemoteCheckpointer persistence. TypeScript types defined in `src/pi-workflow/types/pi-workflow-state.ts`. Integration with Pi SDK via `@earendil-works/pi-agent-core`.

---

## 3. Functional Requirements

### 3.1 Feature: Bidirectional State Mapping

**Source:** BRD Story 1

#### 3.1.1 Description
Implement class with `toPiState` and `fromPiState` ensuring lossless round-trip for core fields.

#### 3.1.2 Use Case

**Use Case ID:** UC-001
**Actor:** Developer / PiAgent Executor
**Preconditions:** PipelineState exists, RemoteCheckpointer operational
**Postconditions:** PiInternalState created, ready for Pi SDK execution

**Main Flow:**
| Step | Actor | System | Description |
|------|-------|--------|-------------|
|1|Developer| |Load PipelineState from checkpointer|
|2| |StateAdapter.toPiState|Map fields, inject piSessionId/currentAgentId/toolCallCount|
|3| |PiAgent|Execute turn with PiInternalState|
|4| |StateAdapter.fromPiState|Map back to PipelineState|
|5| |RemoteCheckpointer|Persist updated PipelineState|

**Alternative Flows:**
| ID | Condition | Steps |
|----|-----------|-------|
|AF-1|Missing optional Pi fields|Initialize defaults: piSessionId=UUID, toolCallCount=0|

**Exception Flows:**
| ID | Condition | Steps |
|----|-----------|-------|
|EF-1|Missing required field ticketKey|Log error, throw StateMappingError|

#### 3.1.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
|BR-001|ticketKey must match `[A-Z]+-\d+`|BRD 1.3|
|BR-002|toolCallCount >=0 integer|BRD 1.3|
|BR-003|Round-trip conversion lossless for core fields|BRD Story1 AC4|

#### 3.1.4 Data Specifications

**Input Data:**
| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
|ticketKey|string|Yes|Regex|[A-Z]+-\d+|
|threadId|string|Yes|||
|currentPhase|string|Yes|||
|pipelineStatus|string|Yes|||
|piSessionId|string|No|non-empty||
|currentAgentId|string|No|||
|toolCallCount|number|No|>=0||

**Output Data:**
Same schema as input with Pi fields populated.

#### 3.1.5 API Contract (Functional View)
<!-- TA enrichment -->
Internal TypeScript interface, not HTTP.

**Method:** `toPiState(pipelineState: PipelineState): PiInternalState`
**Purpose:** Convert legacy state to Pi SDK compatible state
**Input Parameters:**
| Parameter | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
|pipelineState|PipelineState|Y|BR-001|Source state|

**Output Data:**
| Field | Type | Description |
|-------|------|-------------|
|piState|PiInternalState|Mapped state|

**Method:** `fromPiState(piState: PiInternalState): PipelineState`
**Purpose:** Reconstruct legacy state

**Business Error Scenarios:**
| Scenario | User Message | Trigger Condition |
|----------|-------------|-------------------|
|StateMappingError|Mapping failed: missing required field|Required field absent|

### 3.2 Feature: Pi-Specific State Fields

**Source:** BRD Story 2

#### 3.2.1 Description
Extend schema with optional Pi fields with defaults.

#### 3.2.2 Use Case
**Use Case ID:** UC-002
**Actor:** System
**Preconditions:** State adapter invoked
**Postconditions:** Fields persisted across checkpoints

**Main Flow:**
1. Check piSessionId existence
2. Generate UUID if missing
3. Increment toolCallCount per turn
4. Persist via RemoteCheckpointer

**Exception Flows:**
EF-1: Serialization failure → log warning, return original state

---

## 4. Data Model

### 4.1 Logical Entities

#### Entity: PipelineState / PiInternalState

| Attribute | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
|ticketKey|string|Y|BR-001|Jira ticket|
|threadId|string|Y||Execution thread|
|currentPhase|string|Y||SDLC phase|
|pipelineStatus|string|Y||running/completed|
|piSessionId|string|N||Pi session|
|currentAgentId|string|N||Agent executing|
|toolCallCount|number|N|>=0|Tool calls|
|chatHistory|array|Y||Conversation|
|agentOutputs|object|Y||Outputs|
|errors|array|N||Error list|

**TA Note:** Physical persistence via RemoteCheckpointer SQLite/PostgreSQL. No new table, extends existing JSON blob.

---

## 5. Integration Specifications

### 5.1 External System: Pi SDK
| Attribute | Value |
|-----------|-------|
|Purpose|Workflow execution|
|Direction|Bidirectional|
|Data Format|JSON|
|Frequency|Real-time|

**Data Exchange:**
| Our Data | External Data | Direction | Business Rule |
|----------|--------------|-----------|---------------|
|PipelineState|PiInternalState|Send|Mapping via adapter|
|PiInternalState|PipelineState|Receive|Mapping via adapter|

**TA enrichment:** Retry policy not applicable; synchronous in-process mapping. Error handling via StateMappingError.

### 5.2 External System: RemoteCheckpointer
Backward compatible serialization. Ensure JSON schema allows additional fields.

---

## 6. Processing Logic

### 6.1 State Round-Trip Conversion

**Trigger:** PiAgent execution start/end
**Input:** PipelineState
**Output:** Updated PipelineState

**Processing Steps:**
| Step | Description | Error Handling |
|------|-------------|----------------|
|1|Validate required fields|Throw StateMappingError|
|2|Map core fields 1:1|Log warning on type mismatch|
|3|Inject/default Pi fields|Generate UUID if missing|
|4|Return PiInternalState||

**Pseudocode:**
```typescript
// Pseudocode for UC-001
class StateAdapter {
  toPiState(state: PipelineState): PiInternalState {
    validate(state);
    const piSessionId = state.piSessionId ?? uuidv4();
    return {
      ...state,
      piSessionId,
      currentAgentId: state.currentAgentId ?? null,
      toolCallCount: state.toolCallCount ?? 0
    };
  }
  
  fromPiState(piState: PiInternalState): PipelineState {
    return {
      ticketKey: piState.ticketKey,
      threadId: piState.threadId,
      currentPhase: piState.currentPhase,
      pipelineStatus: piState.pipelineStatus,
      piSessionId: piState.piSessionId,
      currentAgentId: piState.currentAgentId,
      toolCallCount: piState.toolCallCount,
      chatHistory: piState.chatHistory,
      agentOutputs: piState.agentOutputs,
      errors: piState.errors
    };
  }
}
```

---

## 7. Security Requirements

### 7.1 Authentication & Authorization
State data persisted via existing RemoteCheckpointer security. No new auth.

### 7.2 Data Sensitivity
State contains ticket data → Internal classification. Persisted via existing secure channel.

---

## 8. Non-Functional Requirements

| Category | Business Requirement | Acceptance Criteria |
|----------|---------------------|---------------------|
|Performance|State mapping latency|<5ms per conversion p95|
|Availability|Adapter reliability|99.9% success rate|
|Scalability|State size|Support up to 5MB per ticket|
|Security|Confidentiality|Inherit RemoteCheckpointer security|

<!-- TA enrichment -->

---

## 9. Error Handling & Logging

### 9.1 Error Scenarios
| Scenario | Severity | User Message | Expected Behavior |
|----------|----------|-------------|-------------------|
|Missing required field|Critical|Mapping failed|Throw StateMappingError, log error|
|Serialization failure|Warning|Checkpoint save failed|Log warning, return original state|

Logging format: structured JSON via Pino logger.

---

## 10. Testing Considerations

| ID | Scenario | Input | Expected Output | Priority |
|----|----------|-------|-----------------|----------|
|TC-001|Round-trip conversion|Valid PipelineState|Equivalent PipelineState|High|
|TC-002|Missing optional Pi fields|State without piSessionId|Default generated|High|
|TC-003|Large state 5MB|5MB state|Mapping <5ms|Medium|

---

## 11. Appendix

### Diagrams
| Diagram | File |
|---------|------|
|Context Diagram|context.drawio|
|Data Flow|data-flow.drawio|

**TA Note:** Technical context from code intelligence confirmed TypeScript stack. Project structure indicates extension src/pi-workflow pending creation. Open Issue: Verify Pi SDK PiInternalState schema stability with vendor docs. Owner: SA Agent, Target: 2026-09-20.

**Implements:** BRD SA4E-293 Stories 1-3, Pi Migration Plan Option C
