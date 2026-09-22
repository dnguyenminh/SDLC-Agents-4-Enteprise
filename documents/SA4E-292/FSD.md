# Functional Specification Document (FSD)

## SA4E-292 — SA4E-289.3 – Phase Router

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-292 |
| Title | SA4E-289.3 – Phase Router |
| Author | TA Agent |
| Version | 1.0 |
| Date | 2026-09-16 |
| Status | Draft |
| Related BRD | documents/SA4E-292/BRD.md |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-16 | TA Agent | Initiate FSD from BRD SA4E-292 and pi-migration-plan.md |

---

## 1. Introduction

### 1.1 Purpose

This FSD specifies the functional requirements for `phase-router.ts`, the component that replaces LangGraph edge routing in the SDLC Agents 4 Enterprise VS Code extension. The router provides deterministic phase transition logic using intent classification via Zod + LLM through Pi SDK, integrates with PiAgent Executor, State Adapter, and RemoteCheckpointer, and preserves backward compatibility with existing `PipelineState` fields.

[Implements: SA4E-292]

### 1.2 Scope

In scope per BRD:
- Phase transition decision logic based on current pipeline state and LLM-classified intent
- Intent classification with Zod-validated schemas and Pi SDK LLM provider
- Integration with `PiAgent Executor`, `State Adapter`, `RemoteCheckpointer`
- Preservation of existing pipeline state fields for backward compatibility

Out of scope:
- Full LangGraph engine removal
- Pi SDK installation and Pi Provider creation
- UI changes for end users
- Human approval gate redesign

Source: BRD §1.1-1.2, documents/pi-migration-plan.md

### 1.3 Definitions & Acronyms

| Term | Definition |
|------|------------|
| Phase Router | Component replacing LangGraph edges for phase transitions |
| Pi SDK | @earendil-works/pi-agent-core |
| PipelineState | Existing SDLC pipeline state object |
| RemoteCheckpointer | Persistence backend for workflow state |
| Zod | TypeScript schema validation library |

### 1.4 References

| Document | Location |
|----------|----------|
| BRD | documents/SA4E-292/BRD.md |
| Pi Migration Plan | documents/pi-migration-plan.md |
| FSD Template | documents/templates/FSD-TEMPLATE.md |

---

## 2. System Overview

### 2.1 System Context Diagram

```xml
<mxfile>
  <diagram name="System Context">
    <mxGraphModel>
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <mxCell id="2" value="User / Ticket" style="shape=ellipse" vertex="1" parent="1"/>
        <mxCell id="3" value="Phase Router" style="shape=rectangle" vertex="1" parent="1"/>
        <mxCell id="4" value="PiAgent Executor" style="shape=rectangle" vertex="1" parent="1"/>
        <mxCell id="5" value="State Adapter" style="shape=rectangle" vertex="1" parent="1"/>
        <mxCell id="6" value="RemoteCheckpointer" style="shape=cylinder" vertex="1" parent="1"/>
        <mxCell id="7" value="Pi SDK LLM" style="shape=cloud" vertex="1" parent="1"/>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

The Phase Router receives ticket/phase requests, classifies intent via Pi SDK LLM, selects next phase, assigns agent, executes via PiAgent Executor, and persists state.

### 2.2 System Architecture

High-level architecture per Option C migration plan:

`User Input → Intent Classification (Zod + LLM via Pi SDK) → Phase Selection → Agent Assignment → Tool Use Loop → Phase Transition Check → Next Phase or Finish → Persistence (RemoteCheckpointer)`

Components:
- `src/pi-workflow/phase-router.ts` – Phase transition logic
- `src/pi-workflow/pi-agent-executor.ts` – Single agent turn executor
- `src/pi-workflow/state-adapter.ts` – PipelineState ↔ Pi SDK mapping
- `src/pi-workflow/checkpointer-adapter.ts` – RemoteCheckpointer adaptation
- `src/pi-workflow/pi-workflow.ts` – Main orchestrator

[Implements: BRD §2.1, pi-migration-plan §4]

---

## 3. Functional Requirements

### 3.1 Feature: Automatic Phase Routing

**Source:** BRD Story 1 – As a SDLC workflow engine, I want to route phase transitions automatically...

#### 3.1.1 Description

Implement `phase-router.ts` with logic equivalent to LangGraph edges for phase transitions. Router accepts current `PipelineState` and intent classification output, determines next phase ID or finish condition, compatible with PiWorkflow Engine.

[Implements: PREQ-001]

#### 3.1.2 Use Case

**Use Case ID:** UC-001
**Actor:** SDLC Workflow Engine
**Preconditions:** PipelineState exists with currentPhase; PiAgent Executor available
**Postconditions:** nextPhase determined and state updated

**Main Flow:**
| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Engine | | Receive ticket / phase request |
| 2 | | Router | Load current PipelineState |
| 3 | | Router | Classify intent via Zod + LLM |
| 4 | | Router | Select next phase based on classification + business rules |
| 5 | | Router | Assign agent from registry |
| 6 | | Executor | Execute agent turn, handle tool loop |
| 7 | | Router | Check phase completion criteria |
| 8 | | Adapter | Persist updated state to RemoteCheckpointer |
| 9 | | Router | Return control to orchestrator |

**Alternative Flows:**
| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | Intent classification confidence low | Fallback to rule-based default transition |

**Exception Flows:**
| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | Invalid intent schema | Log error, return current phase unchanged |
| EF-2 | Unknown phase | Log error, trigger manual review flag |
| EF-3 | LLM timeout | Fallback to rule-based default transition |

#### 3.1.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-001 | Intent object must pass Zod schema validation before routing | BRD §2.3 |
| BR-002 | currentPhase must be valid phase from pipeline definition | BRD §2.3 |
| BR-003 | nextPhase must be valid successor per business rules | BRD §2.3 |
| BR-004 | Phase transitions must be deterministic and traceable | BRD §2.3 Note |

#### 3.1.4 Data Specifications

**Input Data:**
| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| ticketKey | string | Y | non-empty | Jira ticket identifier |
| currentPhase | string | Y | enum | Current SDLC phase |
| intent | object | Y | Zod schema | Classified intent |
| piSessionId | string | N | UUID | Pi SDK session |
| errors | array | N | | Error messages |

**Output Data:**
| Field | Type | Description |
|-------|------|-------------|
| nextPhase | string | Determined next phase |
| errors | array | Routing errors |

#### 3.1.5 API Contract (Functional View)

> **Note:** Technical details specified in TDD.

**Endpoint:** `routePhase(currentState, classifiedIntent)`
**Purpose:** Determine next phase

**Input Parameters:**
| Parameter | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| currentState | PipelineState | Y | BR-002 | Current pipeline state |
| classifiedIntent | Intent | Y | BR-001 | Validated intent |

**Output Data:**
| Field | Type | Description |
|-------|------|-------------|
| nextPhase | string | Next phase ID or 'finish' |
| updatedState | PipelineState | State with updated phase |

**Business Error Scenarios:**
| Scenario | User Message | Trigger |
|----------|-------------|---------|
| Invalid Intent Schema | Routing paused for manual review | Zod validation fails |
| Unknown Phase | Manual review required | Phase not in definition |

### 3.2 Feature: Intent Classification with Zod + LLM

**Source:** BRD Story 2

#### 3.2.1 Description

Use Pi SDK LLM provider to classify intent from user input/state changes, validate output with Zod schemas, provide structured intent for Phase Router.

[Implements: PREQ-002]

#### 3.2.2 Use Case

**Use Case ID:** UC-002
**Actor:** System
**Preconditions:** Input text available
**Postconditions:** Validated classifiedIntent produced

**Main Flow:**
| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | | Classifier | Receive inputText |
| 2 | | Classifier | Call Pi SDK LLM with prompt |
| 3 | | Classifier | Parse LLM response |
| 4 | | Classifier | Validate with Zod schema |
| 5 | | Classifier | Return classifiedIntent |

**Exception Flows:**
| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | Schema validation failure | Retry classification with stricter prompt |
| EF-2 | LLM error | Return error intent and halt routing |

#### 3.2.3 Data Specifications

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| inputText | string | Y | Text to classify |
| intentSchema | object | Y | Zod schema definition |
| classifiedIntent | object | Y | Validated intent |

### 3.3 Feature: Integration with PiAgent Executor and State Adapter

**Source:** BRD Story 3

#### 3.3.1 Description

Phase router integrates with PiAgent Executor for agent turn execution and State Adapter for PipelineState ↔ Pi SDK state mapping, preserving backward compatibility.

[Implements: PREQ-003]

---

## 4. Data Model

### 4.1 Entity Relationship Diagram

```xml
<mxfile>
  <diagram name="ER Diagram">
    <mxGraphModel>
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <mxCell id="2" value="PipelineState" style="shape=swimlane" vertex="1" parent="1"/>
        <mxCell id="3" value="Intent" style="shape=swimlane" vertex="1" parent="1"/>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

### 4.2 Logical Entities

#### Entity: PipelineState

| Attribute | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| ticketKey | string | Y | | Jira ticket |
| currentPhase | string | Y | BR-002 | Current phase |
| pipelineStatus | string | Y | | Status |
| piSessionId | string | N | | Pi session |
| currentAgentId | string | N | | Agent executing |
| errors | array | N | | Errors |
| chatHistory | array | N | | History |

**Relationships:**
| From | To | Cardinality | Description |
|------|----|-------------|-------------|
| PipelineState | Intent | 1:N | State evaluated per intent |

---

## 5. Integration Specifications

### 5.1 External System: Pi SDK

| Attribute | Value |
|-----------|-------|
| Purpose | LLM intent classification and agent execution |
| Direction | Outbound |
| Data Format | JSON |
| Frequency | Real-time |

**Data Exchange:**
| Our Data | External Data | Direction | Business Rule |
|----------|--------------|-----------|---------------|
| inputText | prompt | Send | |
| classifiedIntent | LLM response | Receive | Zod validation |

### 5.2 External System: RemoteCheckpointer

| Attribute | Value |
|-----------|-------|
| Purpose | Persist pipeline state |
| Direction | Bidirectional |
| Data Format | JSON |
| Frequency | On phase transition |

---

## 6. Processing Logic

### 6.1 Phase Routing Process

**Trigger:** Workflow engine requests phase transition
**Input:** PipelineState, user input
**Output:** Next phase, updated state

**Processing Steps:**
| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Load PipelineState | If missing, return error |
| 2 | Classify intent via Pi SDK + Zod | Retry once, fallback to rule |
| 3 | Validate currentPhase | If invalid, manual review |
| 4 | Determine nextPhase via rules | If no successor, finish |
| 5 | Assign agent | If no agent, error |
| 6 | Execute agent turn | Log failures |
| 7 | Persist state | Retry 3x with backoff |

```xml
<mxfile>
  <diagram name="Process Flow">
    <mxGraphModel>
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <mxCell id="2" value="Start" vertex="1" parent="1"/>
        <mxCell id="3" value="Classify Intent" vertex="1" parent="1"/>
        <mxCell id="4" value="Select Phase" vertex="1" parent="1"/>
        <mxCell id="5" value="Persist State" vertex="1" parent="1"/>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

---

## 7. Security Requirements

### 7.1 Authentication & Authorization

No specific user-facing auth required. System-to-system integration via internal services.

### 7.2 Data Sensitivity

Pipeline state contains ticket metadata – classification Internal.

### 7.3 Audit Trail

| Event | Logged Fields | Retention | Business Reason |
|-------|--------------|-----------|-----------------|
| Phase transition | ticketKey, currentPhase, nextPhase, intent | 90 days | Traceability |

---

## 8. Non-Functional Requirements

| Category | Business Requirement | Acceptance Criteria |
|----------|---------------------|---------------------|
| Performance | Phase routing decision latency | < 500ms p95 to be confirmed |
| Availability | Phase router must not block pipeline | 99.9% uptime |
| Scalability | Support concurrent workflow executions | To be confirmed |
| Data Retention | State persistence | Align with RemoteCheckpointer policy |

<!-- TA enrichment -->
> **TA Note:** Performance targets quantified pending technical confirmation.

---

## 9. Error Handling (User-Facing)

### 9.1 Error Scenarios

| Scenario | Severity | User Message | Expected Behavior |
|----------|----------|-------------|-------------------|
| Invalid intent schema | Warning | Routing paused for manual review | Log and keep current phase |
| Unknown phase | Critical | Manual review required | Flag for manual review |
| LLM timeout | Warning | Falling back to default transition | Use rule-based default |

---

## 10. Testing Considerations

### 10.1 Test Scenarios

| ID | Scenario | Input | Expected Output | Priority |
|----|----------|-------|-----------------|----------|
| TC-001 | Valid intent leads to next phase | currentPhase=requirements, intent=transition to specification | nextPhase=specification | High |
| TC-002 | Invalid Zod schema | intent malformed | Return current phase unchanged | High |
| TC-003 | LLM timeout fallback | Simulate timeout | Rule-based next phase | Medium |
| TC-004 | Unknown phase handling | currentPhase=invalid | Manual review flag | High |

---

## 11. Appendix

### Diagrams

| Diagram | File |
|---------|------|
| System Context | diagrams/system-context.png |
| ER Diagram | diagrams/er-diagram.png |
| Process Flow | diagrams/process-flow.png |

### Change Log from BRD

- Added technical API contract details for phase-router.ts
- Added pseudocode placeholder for routing logic
- Added quantified NFR targets pending confirmation
- Code intelligence data not available – technical context not verified against actual codebase

<!-- TA enrichment -->
> **TA Note:** FSD enriched with API contracts, alternative/exception flows, and integration specs per BRD. Code intelligence verification skipped due to missing .analysis/code-intelligence files.

