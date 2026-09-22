# Functional Specification Document (FSD)

## SA4E-297 — SA4E-289.8 – Testing QA & LangGraph Cleanup

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-297 |
| Title | SA4E-289.8 – Testing QA & LangGraph Cleanup |
| Author | BA Agent / TA Enrichment |
| Version | 1.0 |
| Date | 2026-09-16 |
| Status | Draft |
| Related BRD | documents/SA4E-297/BRD.md |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-16 | BA Agent | Initiate document — auto-generated from BRD and Jira tickets |
| 1.1 | 2026-09-16 | TA Agent | Technical enrichment: API contracts, use case flows, diagrams, NFR quantification |

---

## 1. Introduction

### 1.1 Purpose

This FSD specifies functional requirements for testing, QA sign-off, and LangGraph cleanup activities for story SA4E-297, part of Epic SA4E-289 Migrate LangGraph Workflow Engine to Pi SDK Option C. The specification defines test execution procedures, cleanup scope, and sign-off criteria to ensure regression-free migration to PiWorkflow Engine built on `@earendil-works/pi-agent-core`.

[Implements: BRD §1.1 Scope]

### 1.2 Scope

Scope includes execution of unit/integration tests for PiWorkflow Engine modules, QA validation checklist, deprecation and removal of legacy LangGraph artifacts, and knowledge base updates. Technical scope clarified by TA enrichment to include API contracts for test execution tracking and cleanup verification.

Out of scope: new Pi SDK features, production deployment, performance tuning beyond baseline verification.

[Implements: BRD §1.2 Out of Scope]

### 1.3 Definitions & Acronyms

| Term | Definition |
|------|------------|
| Pi SDK | @earendil-works/pi-agent-core — replacement workflow primitives |
| PiWorkflow Engine | New workflow engine built on Pi SDK primitives, located planned at src/pi-workflow/ |
| LangGraph | Previous workflow engine being replaced |
| RemoteCheckpointer | Persistence backend for workflow state, unchanged during migration |
| QA Sign-off | Formal approval by QA Lead confirming migration quality gates met |

<!-- TA enrichment -->
> **TA Note:** Code Intelligence data for `src/pi-workflow/` not found in `.analysis/code-intelligence`. Module structure inferred from documents/pi-migration-plan.md. Technical context not verified against actual codebase.

### 1.4 References

| Document | Location |
|----------|----------|
| BRD | documents/SA4E-297/BRD.md |
| Pi Migration Plan | documents/pi-migration-plan.md |
| FSD Template | documents/templates/FSD-TEMPLATE.md |

---

## 2. System Overview

### 2.1 System Context Diagram

![System Context](diagrams/system-context.png)

The system interacts with QA Engineer, Developer, QA Lead actors, PiWorkflow Engine components, RemoteCheckpointer backend, Knowledge Base, and legacy LangGraph artifacts for cleanup.

```xml
<!-- TA enrichment -->
<mxfile>
  <diagram name="System Context Diagram">
    <mxGraphModel>
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <mxCell id="2" value="QA Engineer" style="shape=ellipse" vertex="1" parent="1">
          <mxGeometry x="80" y="80" width="120" height="60" as="geometry"/>
        </mxCell>
        <mxCell id="3" value="PiWorkflow Engine" style="rounded=1" vertex="1" parent="1">
          <mxGeometry x="320" y="70" width="140" height="80" as="geometry"/>
        </mxCell>
        <mxCell id="4" value="RemoteCheckpointer" style="rounded=1" vertex="1" parent="1">
          <mxGeometry x="320" y="200" width="140" height="80" as="geometry"/>
        </mxCell>
        <mxCell id="5" value="Knowledge Base" style="rounded=1" vertex="1" parent="1">
          <mxGeometry x="520" y="130" width="140" height="80" as="geometry"/>
        </mxCell>
        <mxCell id="6" value="LangGraph Artifacts" style="shape=parallelogram" vertex="1" parent="1">
          <mxGeometry x="120" y="220" width="140" height="80" as="geometry"/>
        </mxCell>
        <mxCell id="7" edge="1" parent="1" source="2" target="3"/>
        <mxCell id="8" edge="1" parent="1" source="3" target="4"/>
        <mxCell id="9" edge="1" parent="1" source="3" target="5"/>
        <mxCell id="10" edge="1" parent="1" source="3" target="6"/>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

### 2.2 System Architecture

<!-- TA enrichment -->
High-level architecture inferred from Pi Migration Plan Option C:
User Input → Intent Classification → Phase Selection → Agent Assignment → Tool Use Loop via Pi SDK → Phase Transition Check → Persistence via RemoteCheckpointer.

Planned code structure `src/pi-workflow/`:
- pi-workflow.ts — main orchestrator
- pi-agent-executor.ts — single turn executor
- phase-router.ts — phase transitions
- state-adapter.ts — PipelineState ↔ Pi state mapping
- checkpointer-adapter.ts — RemoteCheckpointer adaptation
- approval-adapter.ts — ToolApprovalGate adaptation
- kb-client.ts — KB search via MCP

Project stack: TypeScript, Hono backend, Svelte 4 + Vite webview, LangGraph orchestration legacy, Pi SDK `@earendil-works/pi-agent-core`.

Code Intelligence verification: `.analysis/code-intelligence/project-structure.md` reviewed; pi-workflow module not yet indexed.

---

## 3. Functional Requirements

### 3.1 Feature: Testing QA for PiWorkflow Engine

**Source:** BRD Story 1 — As a QA Engineer, I want to execute unit and integration tests for PiWorkflow Engine so that migration quality is verified
[Implements: Story 1]

#### 3.1.1 Description

Execute unit tests for pi-workflow modules and integration tests for end-to-end SDLC pipeline using Pi SDK workflow engine with RemoteCheckpointer backend. Verify phase transition, state serialization, tool approval gate, streaming and context handling.

#### 3.1.2 Use Case

**Use Case ID:** UC-001
**Actor:** QA Engineer
**Preconditions:** Prerequisites SA4E-290 to SA4E-296 completed and merged; RemoteCheckpointer backend accessible
**Postconditions:** Test results logged, defects created if failures, QA validation checklist updated

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | QA Engineer | | Creates test execution plan covering unit, integration, regression scenarios |
| 2 | | Test Runner | Executes unit tests for pi-workflow/* modules |
| 3 | | Test Runner | Executes integration tests for 7-phase SDLC pipeline |
| 4 | | PiWorkflow Engine | Processes ticket using Pi SDK with RemoteCheckpointer |
| 5 | QA Engineer | | Validates human approval flow, state persistence, phase transitions |
| 6 | | QA System | Logs test results and defects |

<!-- TA enrichment -->
**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | Test skipped | Mark testStatus=SKIPPED, record reason, continue |
| AF-2 | Partial failure | Log defect, continue remaining tests, block sign-off |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | Missing prerequisite | Abort execution with error "Prerequisite SA4E-29x not merged" |
| EF-2 | Checkpointer unavailable | Abort with error, log critical defect |

#### 3.1.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-001 | Unit test coverage for pi-workflow modules >= baseline from epic | BRD §2.3 |
| BR-002 | Integration tests must pass for all 7 SDLC phases | BRD §2.3 |
| BR-003 | Test execution must use same RemoteCheckpointer config as production | BRD §2.3 |
| BR-004 | State fields ticketKey, threadId, currentPhase, pipelineStatus must be preserved | BRD Note |

#### 3.1.4 Data Specifications

**Input Data:**

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| ticketKey | string | Yes | Jira key pattern | Jira ticket key for test execution |
| testCaseId | string | Yes | UT-PI-xxx / IT-PI-xxx | Identifier of test case |
| testStatus | enum | Yes | PASS/FAIL/SKIPPED | Test outcome |

**Output Data:**

| Field | Type | Description |
|-------|------|-------------|
| testCaseId | string | |
| testStatus | enum | |
| defectId | string | Jira defect key if failed |
| executionTimeMs | number | Duration |

#### 3.1.5 UI Specifications

No UI specifications identified. Tests executed via CLI / CI pipeline.

#### 3.1.6 API Contract (Functional View)

<!-- TA enrichment -->
**Endpoint:** `POST /api/v1/tests/execute`
**Purpose:** Trigger test execution for PiWorkflow Engine and record results
**Input Parameters:**

| Parameter | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| ticketKey | string | Y | BR-001 | Target ticket |
| scope | enum | Y | unit/integration/regression | Test scope |
| modules | array[string] | N | | pi-workflow modules list |

**Output Data:**

| Field | Type | Description |
|-------|------|-------------|
| executionId | string | UUID |
| summary | object | passCount, failCount, skippedCount |
| defects | array | Created defect references |

**Business Error Scenarios:**

| Scenario | User Message | Trigger Condition |
|----------|-------------|-------------------|
| Prerequisite missing | "Prerequisite SA4E-29x not completed" | Missing merge status |
| Checkpointer error | "RemoteCheckpointer unavailable" | Backend connection failure |

---

### 3.2 Feature: LangGraph Cleanup

**Source:** BRD Story 2 — As a Developer, I want to deprecate and remove legacy LangGraph code so that codebase is clean and maintainable
[Implements: Story 2]

#### 3.2.1 Description

Identify and deprecate LangGraphEngine, subgraphs, PipelineState legacy parts, remove unused imports and type definitions, update documentation.

#### 3.2.2 Use Case

**Use Case ID:** UC-002
**Actor:** Developer
**Preconditions:** QA tests passed, sign-off pending
**Postconditions:** LangGraph artifacts removed, build succeeds, tests still pass

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Developer | | Identify LangGraphEngine, subgraphs, related utilities |
| 2 | Developer | | Remove imports and type definitions |
| 3 | | Build System | Build succeeds without LangGraph workflow dependencies |
| 4 | | Test Runner | Existing tests pass after cleanup |
| 5 | Developer | | Update documentation |

<!-- TA enrichment -->
**Alternative Flows:**
AF-1 Compilation error → Restore file, analyze dependency, adjust removal scope

**Exception Flows:**
EF-1 Runtime error post removal → Rollback, create defect

#### 3.2.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-005 | Cleanup must preserve backward compatibility for ticket state fields | BRD §2.3 |
| BR-006 | No references to removed LangGraph code remain in src/pi-workflow/ | BRD §2.3 |
| BR-007 | Build succeeds without LangGraph workflow dependencies | BRD §2.3 |

#### 3.2.4 Data Specifications

Input: file paths, grep results
Output: removal report, build status

#### 3.2.5 API Contract

No direct API. Cleanup verified via build and test commands.

---

### 3.3 Feature: QA Sign-off

**Source:** BRD Story 3 — As a QA Lead, I want to complete QA sign-off for Pi SDK migration so that epic can progress to deployment
[Implements: Story 3]

#### 3.3.1 Description

Review test execution reports, verify defect closure, confirm LangGraph cleanup completed, provide sign-off approval.

#### 3.3.2 Use Case

**Use Case ID:** UC-003
**Actor:** QA Lead
**Preconditions:** Test execution completed, cleanup done
**Postconditions:** Sign-off recorded in KB, epic can progress

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | QA Lead | | Review test execution reports |
| 2 | QA Lead | | Verify defect closure |
| 3 | QA Lead | | Confirm LangGraph cleanup completed |
| 4 | QA Lead | | Provide sign-off approval |

**Business Rules:**
BR-008 Sign-off checklist must be completed before epic progression

---

## 4. Data Model

> Logical data model

### 4.1 Entity Relationship Diagram

```xml
<!-- TA enrichment -->
<mxfile>
  <diagram name="ER Diagram">
    <mxGraphModel>
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <mxCell id="2" value="TestCase" style="swimlane" vertex="1" parent="1">
          <mxGeometry x="80" y="80" width="200" height="120" as="geometry"/>
        </mxCell>
        <mxCell id="3" value="Defect" style="swimlane" vertex="1" parent="1">
          <mxGeometry x="340" y="80" width="200" height="120" as="geometry"/>
        </mxCell>
        <mxCell id="4" value="PipelineState" style="swimlane" vertex="1" parent="1">
          <mxGeometry x="80" y="260" width="460" height="120" as="geometry"/>
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

### 4.2 Logical Entities

#### Entity: TestCase
| Attribute | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| testCaseId | string | Y | | UT-PI-xxx |
| ticketKey | string | Y | | |
| testStatus | enum | Y | | PASS/FAIL/SKIPPED |
| executionTimeMs | number | N | | |

#### Entity: PipelineState
| Attribute | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| ticketKey | string | Y | BR-004 | |
| threadId | string | Y | BR-004 | |
| currentPhase | string | Y | BR-004 | |
| pipelineStatus | string | Y | BR-004 | |
| piSessionId | string | N | | Pi SDK session |
| currentAgentId | string | N | | |

<!-- TA enrichment -->
> **TA Note:** Physical schema not verified; StateAdapter mapping defined in pi-migration-plan.md.

---

## 5. Integration Specifications

### 5.1 External System: RemoteCheckpointer

| Attribute | Value |
|-----------|-------|
| Purpose | Persist workflow state |
| Direction | Bidirectional |
| Data Format | JSON |
| Frequency | Real-time |

**Data Exchange:**

| Our Data | External Data | Direction | Business Rule |
|----------|--------------|-----------|---------------|
| PipelineState | Checkpoint | Send/Receive | StateAdapter serialization |

### 5.2 External System: Knowledge Base

| Attribute | Value |
|-----------|-------|
| Purpose | Store test results, sign-off records |
| Direction | Outbound |
| Data Format | JSON |

---

## 6. Processing Logic

### 6.1 Test Execution Process

**Trigger:** QA Engineer initiates test run
**Input:** ticketKey, scope
**Output:** execution summary, defects

**Processing Steps:**

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Validate prerequisites | Abort if missing |
| 2 | Run unit tests | Log failures |
| 3 | Run integration tests | Log failures |
| 4 | Validate state persistence | Defect if mismatch |
| 5 | Generate report | Store in KB |

```xml
<!-- TA enrichment -->
<mxfile>
  <diagram name="Data Flow Diagram">
    <mxGraphModel>
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <mxCell id="2" value="QA Engineer" vertex="1" parent="1"><mxGeometry x="40" y="80" width="100" height="60" as="geometry"/></mxCell>
        <mxCell id="3" value="Test Runner" vertex="1" parent="1"><mxGeometry x="250" y="80" width="100" height="60" as="geometry"/></mxCell>
        <mxCell id="4" value="PiWorkflow Engine" vertex="1" parent="1"><mxGeometry x="250" y="200" width="100" height="60" as="geometry"/></mxCell>
        <mxCell id="5" value="RemoteCheckpointer" vertex="1" parent="1"><mxGeometry x="480" y="140" width="120" height="60" as="geometry"/></mxCell>
        <mxCell id="6" edge="1" parent="1" source="2" target="3"/>
        <mxCell id="7" edge="1" parent="1" source="3" target="4"/>
        <mxCell id="8" edge="1" parent="1" source="4" target="5"/>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

---

## 7. Security Requirements

### 7.1 Authentication & Authorization

| Role | Permissions | Screens/Features |
|------|-------------|-------------------|
| QA Engineer | Execute tests, view results | Test execution |
| Developer | Cleanup code, view build | Source repository |
| QA Lead | Sign-off | QA sign-off checklist |

### 7.2 Data Sensitivity Classification

| Data Type | Classification | Business Requirement |
|-----------|----------------|----------------------|
| Test results | Internal | Internal audit |
| PipelineState | Confidential | Contains ticket data |

---

## 8. Non-Functional Requirements

| Category | Business Requirement | Acceptance Criteria |
|----------|---------------------|---------------------|
| Performance | Test execution should not exceed baseline | Unit tests < 2 min per module, Integration tests < 10 min |
| Availability | QA sign-off process available | 99% availability during business hours |
| Data Retention | Test results retained | 1 year retention in KB |

<!-- TA enrichment -->
> **TA Note:** Performance targets quantified based on typical CI pipeline; confirm with DevOps.

---

## 9. Error Handling (User-Facing)

### 9.1 Error Scenarios

| Scenario | Severity | User Message | Expected Behavior |
|----------|----------|-------------|-------------------|
| Prerequisite missing | Critical | "Prerequisite SA4E-29x not completed" | Abort execution |
| Checkpointer unavailable | Critical | "RemoteCheckpointer unavailable" | Create critical defect |
| Build failure after cleanup | Critical | "Build failed after LangGraph removal" | Rollback and alert |

---

## 10. Testing Considerations

### 10.1 Test Scenarios

| ID | Scenario | Input | Expected Output | Priority |
|----|----------|-------|-----------------|----------|
| TC-001 | Unit test pi-workflow modules | All modules | PASS >= baseline | High |
| TC-002 | Integration test 7 phases | End-to-end ticket | Phase transitions correct | High |
| TC-003 | State persistence | Save/load state | ticketKey preserved | High |
| TC-004 | LangGraph cleanup build | Remove artifacts | Build succeeds | High |

---

## 11. Appendix

### Diagrams

| Diagram | File |
|---------|------|
| System Context | diagrams/system-context.png |
| Data Flow | diagrams/data-flow.png |
| ER Diagram | diagrams/er-diagram.png |
| Integration Architecture | diagrams/integration-architecture.png |

### Change Log from BRD

- Added API contract for test execution trigger
- Added quantified NFR targets
- Added alternative/exception flows for use cases
- Added pseudocode placeholders for StateAdapter mapping
- Marked technical context unverified due to missing code intelligence for pi-workflow module

<!-- TA enrichment -->
**Open Issues:**
- OI-001: Verify pi-workflow module structure in codebase — Owner: DEV, Target: 2026-09-20
- OI-002: Confirm test coverage baseline from epic — Owner: QA Lead, Target: 2026-09-18
- OI-003: Validate RemoteCheckpointer config parity — Owner: DevOps, Target: 2026-09-19

---
