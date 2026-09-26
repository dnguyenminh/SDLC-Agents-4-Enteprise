# Functional Specification Document (FSD)

## SDLC Agents 4 Enterprise VS Code Extension – Pi Workflow Engine — SA4E-296: Integration & Human Approval Logic

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-296 |
| Title | SA4E-289.7 – Integration & Human Approval Logic |
| Author | TA Agent – Technical Architect |
| Version | 1.0 |
| Date | 2026-09-16 |
| Status | Draft |
| Related BRD | documents/SA4E-296/BRD.md |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-16 | TA Agent | Initial TA enrichment from BA draft |

---

## 1. Introduction

### 1.1 Purpose

Specify technical functional requirements for full integration of PiWorkflow engine built on Pi SDK `@earendil-works/pi-agent-core` replacing LangGraph execution engine, while preserving human-in-the-loop approval gates and state checkpointing compatibility with RemoteCheckpointer.

### 1.2 Scope

<!-- TA enrichment -->
**Technical Scope Additions:**
- PiWorkflow orchestrator runs in VS Code Extension `extension/src/pi-workflow/` TypeScript modules
- State mapping PipelineState <-> PiInternalState via StateAdapter
- ApprovalAdapter bridges Pi SDK tool_use_id format to legacy ToolApprovalGate interface
- CheckpointerAdapter ensures Pi state serialization to RemoteCheckpointer backend without schema change
- No removal of LangGraph code in this story; feature toggle enabled via config `workflow.engine = 'pi'`

### 1.3 Definitions & Acronyms

| Term | Definition |
|------|------------|
| Pi SDK | @earendil-works/pi-agent-core |
| PiWorkflow Engine | Custom orchestrator built on Pi SDK primitives replacing LangGraphEngine |
| ToolApprovalGate | Human-in-the-loop approval logic for tool use, preserved behavior including rememberPattern |
| RemoteCheckpointer | Backend persistence for workflow state |
| StateAdapter | Maps PipelineState to PiInternalState and back |

### 1.4 References

| Document | Location |
|----------|----------|
| BRD | documents/SA4E-296/BRD.md |
| Pi Migration Plan | documents/pi-migration-plan.md |

---

## 2. System Overview

### 2.1 System Context Diagram

```xml
<mxfile><diagram name="Context"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="u" value="User" vertex="1" parent="1"/><mxCell id="v" value="VS Code Extension" vertex="1" parent="1"/><mxCell id="p" value="PiWorkflow Engine" vertex="1" parent="1"/><mxCell id="s" value="Pi SDK" vertex="1" parent="1"/><mxCell id="c" value="RemoteCheckpointer" vertex="1" parent="1"/></root></mxGraphModel></diagram></mxfile>
```

### 2.2 System Architecture

Components: pi-workflow.ts, pi-agent-executor.ts, phase-router.ts, state-adapter.ts, approval-adapter.ts, checkpointer-adapter.ts. Tech stack TypeScript, Hono, Svelte 4.

---

## 3. Functional Requirements

### 3.1 Feature: PiWorkflow Engine Integration End-to-End

**Source:** BRD Story 1 [Implements: Story 1]

#### 3.1.1 Description
Connect PiWorkflow engine to SDLC pipeline, replace LangGraphEngine.invoke with workflow.execute.

#### 3.1.2 Use Case UC-001
Actor: Developer
Preconditions: Pi SDK installed, adapters complete
Postconditions: Workflow runs end-to-end using Pi SDK

Main Flow steps 1-7 per BRD.

Business Rules BR-001..003

#### 3.1.6 API Contract
Endpoint workflow.execute(ticketKey, phase, input)
Input ticketKey, phase, input
Output pipelineState, nextPhase, errors

---

### 3.2 Feature: Human Approval Logic Preservation

**Source:** BRD Story 2 [Implements: Story 2]

Pseudocode:
```typescript
function handleToolApproval(toolCall, state) {
  const normalizedId = ApprovalAdapter.normalize(toolCall.tool_use_id);
  if (!ToolApprovalGate.requiresApproval(normalizedId)) return executeTool(toolCall);
  const decision = await waitForUserApproval(normalizedId, {timeoutMs: 600000});
  state.approvalDecision = decision;
  return decision === 'approve' ? executeTool(toolCall) : {skipped:true};
}
```

---

## 4. Data Model

Entity PipelineState with fields ticketKey, threadId, currentPhase, pipelineStatus, piSessionId, currentAgentId, toolCallCount, chatHistory, agentOutputs, errors.

---

## 5. Integration Specifications

Pi SDK bidirectional JSON real-time. RemoteCheckpointer outbound with retry 3x.

---

## 6. Processing Logic

Workflow Execution Loop trigger user start.
Steps Load State, StateAdapter, PiAgentExecutor, Approval check, PhaseRouter, Persist.

---

## 7. Security Requirements

Audit trail approval decisions retained 1 year.

---

## 8. Non-Functional Requirements

Performance ≤15% increase vs LangGraph. Availability checkpoint save >99%. Scalability ≥10 concurrent.

---

## 9. Error Handling

STATE_MAPPING_ERROR pause, APPROVAL_TIMEOUT auto-reject, PI_SDK_ERROR pause.

---

## 10. Testing Considerations

TC-001 E2E, TC-002 Approval approve, TC-003 Timeout, TC-004 Checkpoint resume.

---

## 11. Appendix

Change log: Added API contracts, pseudocode, quantified NFR.

<!-- TA enrichment completed -->
