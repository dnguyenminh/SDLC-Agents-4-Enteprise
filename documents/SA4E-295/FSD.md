# Functional Specification Document (FSD)

## SDLC Agents 4 Enterprise — SA4E-295: SA4E-289.6 – Approval Adapter

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-295 |
| Title | SA4E-289.6 – Approval Adapter |
| Author | TA Agent — Technical Architect |
| Version | 1.0 |
| Date | 2026-09-16 |
| Status | Draft — TA Enriched |
| Related BRD | documents/SA4E-295/BRD.md |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-16 | TA Agent | Initial TA enrichment from BRD and Pi Migration Plan |

---

## 1. Introduction

### 1.1 Purpose
This FSD specifies the functional requirements for the Approval Adapter component within Epic SA4E-289 "Migrate LangGraph Workflow Engine to Pi SDK Option C". The adapter bridges Pi SDK tool execution with the existing extension `ToolApprovalGate` human-in-the-loop approval mechanism, normalizes `tool_use_id` formats, and preserves audit trail without modifying core gate logic.

### 1.2 Scope
- Design and implement `approval-adapter.ts` in `src/pi-workflow/` as per migration plan `documents/pi-migration-plan.md`.
- Bridge Pi SDK tool call results with existing extension approval mechanism.
- Normalize `tool_use_id` format between Pi SDK and extension internals.
- Preserve current approval UX and audit trail.
- Enable phased migration of human approval logic to Pi SDK workflow engine.

Out of scope:
- UI changes for approval display
- Changing `ToolApprovalGate` core approval rules or policies
- Implementing new approval types beyond current LangGraph flow
- Full LangGraph cleanup — handled in SA4E-297

[Implements: BRD §1.1 Scope]

### 1.3 Definitions & Acronyms

| Term | Definition |
|------|------------|
| Approval Adapter | `approval-adapter.ts` component bridging Pi SDK and ToolApprovalGate |
| ToolApprovalGate | Existing human-in-the-loop approval component |
| Pi SDK | `@earendil-works/pi-agent-core` SDK |
| tool_use_id | Identifier for tool call in Pi SDK / extension |
| PiAgent Executor | Single turn executor implemented in SA4E-291 |

### 1.4 References

| Document | Location |
|----------|----------|
| BRD | documents/SA4E-295/BRD.md |
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
        <mxCell id="user" value="User / VS Code Extension" style="shape=actor" vertex="1" parent="1">
          <mxGeometry x="80" y="80" width="120" height="80" as="geometry"/>
        </mxCell>
        <mxCell id="piagent" value="PiAgent Executor" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1">
          <mxGeometry x="300" y="50" width="140" height="80" as="geometry"/>
        </mxCell>
        <mxCell id="adapter" value="Approval Adapter\nsrc/pi-workflow/approval-adapter.ts" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1">
          <mxGeometry x="300" y="180" width="140" height="80" as="geometry"/>
        </mxCell>
        <mxCell id="gate" value="ToolApprovalGate" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1">
          <mxGeometry x="580" y="115" width="140" height="80" as="geometry"/>
        </mxCell>
        <mxCell id="pisdk" value="Pi SDK\n@earendil-works/pi-agent-core" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1">
          <mxGeometry x="80" y="200" width="140" height="80" as="geometry"/>
        </mxCell>
        <mxCell id="e1" edge="1" parent="1" source="user" target="piagent"/>
        <mxCell id="e2" edge="1" parent="1" source="piagent" target="adapter"/>
        <mxCell id="e3" edge="1" parent="1" source="adapter" target="gate"/>
        <mxCell id="e4" edge="1" parent="1" source="piagent" target="pisdk"/>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

### 2.2 System Architecture

Project stack: TypeScript — Hono backend, Svelte 4 + Vite webview, LangGraph orchestration transitioning to Pi SDK.

`src/pi-workflow/` module structure per migration plan:
```
src/pi-workflow/
├── pi-workflow.ts
├── pi-agent-executor.ts
├── phase-router.ts
├── state-adapter.ts
├── approval-adapter.ts   <-- this component
├── checkpointer-adapter.ts
└── types/pi-workflow-state.ts
```

Adapter sits between PiAgent Executor and ToolApprovalGate, performing ID normalization and result translation. No HTTP API exposed; internal module interface.

[Implements: BRD §2.1 High Level Process Map]

---

## 3. Functional Requirements

### 3.1 Feature: Normalize tool_use_id between Pi SDK and Extension

**Source:** BRD Story 1 — Normalize tool_use_id between Pi SDK and Extension
[Implements: PREQ-295-1]

#### 3.1.1 Description
Provide bidirectional mapping between Pi SDK `tool_use_id` and extension internal tool id to ensure human approval requests are correctly correlated across systems.

#### 3.1.2 Use Case

**Use Case ID:** UC-295-01
**Actor:** Developer / System
**Preconditions:** Pi SDK tool call issued, session active, ToolApprovalGate available
**Postconditions:** Normalized IDs stored in session mapping, audit log entry created

**Main Flow:**
| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | PiAgent Executor | | Issues tool call with piToolUseId |
| 2 | | Approval Adapter | Receives piToolUseId, sessionId, ticketKey |
| 3 | | Approval Adapter | Calls piToExtensionId mapping |
| 4 | | Approval Adapter | Stores mapping in session map, logs event |
| 5 | | Approval Adapter | Returns extensionToolId to caller |

**Alternative Flows:**
| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | Mapping already exists | Overwrite with latest, log duplicate |

**Exception Flows:**
| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | Missing piToolUseId | Return error ADAPTER-001, log warning |
| EF-2 | Invalid format | Log warning, return error to agent executor |

#### 3.1.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-295-01 | tool_use_id must be non-empty string | BRD §Story 1 Validation Rules |
| BR-295-02 | sessionId must match active Pi session | BRD §Story 1 Validation Rules |
| BR-295-03 | Round-trip conversion pi→extension→pi yields original pi id | BRD §Story 1 Acceptance Criteria 2 |

#### 3.1.4 Data Specifications

**Input Data:**
| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| piToolUseId | string | Yes | non-empty, pattern pi_... | Pi SDK tool_use_id |
| extensionToolId | string | No | non-empty | Extension internal tool id |
| sessionId | string | Yes | UUID v4 | Pi session id |
| ticketKey | string | Yes | SA4E-### | Jira ticket key |

**Output Data:**
| Field | Type | Description |
|-------|------|-------------|
| extensionToolId | string | Normalized extension id |
| mappingId | string | Internal mapping reference |
| timestamp | string | ISO 8601 log timestamp |

#### 3.1.6 API Contract (Functional View)

> **Note:** Internal module interface, not HTTP. TA enrichment for developer implementability.

**Interface:** `ApprovalAdapter`

**Method:** `normalizeId(piToolUseId: string, sessionId: string, ticketKey: string): string`
**Purpose:** Convert Pi SDK tool_use_id to extension internal id

**Input Parameters:**
| Parameter | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| piToolUseId | string | Yes | BR-295-01 | Pi SDK identifier |
| sessionId | string | Yes | BR-295-02 | Active session |
| ticketKey | string | Yes | — | Correlation key |

**Output Data:**
| Field | Type | Description |
|-------|------|-------------|
| extensionToolId | string | Mapped extension id |

**Business Error Scenarios:**
| Scenario | User Message | Trigger Condition |
|----------|-------------|-------------------|
| ADAPTER-001 | Missing tool_use_id | piToolUseId empty |
| ADAPTER-002 | Invalid session | sessionId not active |

<!-- TA enrichment -->

### 3.2 Feature: Integrate ToolApprovalGate via Adapter

**Source:** BRD Story 2 — Integrate ToolApprovalGate via Adapter
[Implements: PREQ-295-2]

#### 3.2.1 Description
Expose `requestApproval(toolCall)` compatible with Pi SDK agent loop, delegate to existing `ToolApprovalGate.evaluate()`, and map approval result to Pi SDK `toolResult` structure.

#### 3.2.2 Use Case

**Use Case ID:** UC-295-02
**Actor:** System / PiAgent Executor
**Preconditions:** Tool call requires human approval per policy
**Postconditions:** Approval decision returned to Pi agent in correct format

**Main Flow:**
| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | PiAgent Executor | | Calls adapter.requestApproval(toolCall) |
| 2 | | Approval Adapter | Normalizes id, builds context |
| 3 | | Approval Adapter | Calls ToolApprovalGate.evaluate() |
| 4 | ToolApprovalGate | | Evaluates policy, returns decision |
| 5 | | Approval Adapter | Translates decision to Pi toolResult |
| 6 | | PiAgent Executor | Continues execution |

**Alternative Flows:**
| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | Approval requires input | Adapter returns pending, agent waits |

**Exception Flows:**
| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | Gate timeout | Retry once, then fail open with audit log |
| EF-2 | Gate error | Log error, return rejection to Pi |

#### 3.2.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-295-04 | Adapter must not modify ToolApprovalGate core logic | BRD §1.2 Out of Scope |
| BR-295-05 | Approved result must be returned in Pi SDK format | BRD Story 2 Acceptance Criteria 2 |

#### 3.2.4 Data Specifications

**Input Data:**
| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| toolCall | object | Yes | — | Pi SDK tool call payload |
| piToolUseId | string | Yes | — | Pi identifier |
| context | object | Yes | — | Session + ticket context |

**Output Data:**
| Field | Type | Description |
|-------|------|-------------|
| toolResult | object | Pi SDK compatible result |
| decision | enum | approved / rejected / pending |
| auditId | string | Audit trail reference |

#### 3.2.6 API Contract (Functional View)

**Method:** `requestApproval(toolCall: PiToolCall): Promise<PiToolResult>`
**Purpose:** Request human approval through existing gate

**Input Parameters:**
| Parameter | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| toolCall | PiToolCall | Yes | — | Tool call from Pi agent |
| sessionId | string | Yes | BR-295-02 | Session correlation |

**Output Data:**
| Field | Type | Description |
|-------|------|-------------|
| toolResult.content | any | Tool output or error |
| toolResult.isApproved | boolean | Approval status |
| toolResult.auditRef | string | Audit reference |

**Business Error Scenarios:**
| Scenario | User Message | Trigger Condition |
|----------|-------------|-------------------|
| ADAPTER-003 | Approval gate timeout | Gate does not respond within 5s |
| ADAPTER-004 | Mapping failure | ID normalization fails |

Pseudocode for complex logic:
```typescript
// Pseudocode for [Implements: PREQ-295-2]
async function requestApproval(toolCall: PiToolCall): Promise<PiToolResult> {
  // Step 1: Validate input
  if (!toolCall.tool_use_id) throw new AdapterError('ADAPTER-001');
  
  // Step 2: Normalize id
  const extId = piToExtensionId(toolCall.tool_use_id, sessionId);
  
  // Step 3: Build gate context
  const context = { extId, ticketKey, sessionId, toolCall };
  
  // Step 4: Call existing gate
  const decision = await ToolApprovalGate.evaluate(context);
  
  // Step 5: Translate to Pi format
  return extensionToPiResult(decision, toolCall.tool_use_id);
}
```

<!-- TA enrichment -->

---

## 4. Data Model

> **Note:** Logical data model for adapter session mapping. Physical persistence via Checkpointer Adapter.

### 4.1 Entity Relationship Diagram

```xml
<mxfile>
  <diagram name="ER">
    <mxGraphModel>
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <mxCell id="mapping" value="ToolIdMapping" style="shape=swimlane" vertex="1" parent="1">
          <mxGeometry x="80" y="80" width="260" height="140" as="geometry"/>
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
```

### 4.2 Logical Entities

#### Entity: ToolIdMapping

| Attribute | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| piToolUseId | string | Yes | BR-295-01 | Pi SDK identifier |
| extensionToolId | string | Yes | — | Extension internal id |
| sessionId | string | Yes | BR-295-02 | Pi session |
| ticketKey | string | Yes | — | Correlation |
| createdAt | datetime | Yes | — | Mapping creation |

**Relationships:**
| From Entity | To Entity | Cardinality | Description |
|-------------|-----------|-------------|-------------|
| ToolIdMapping | Pi Session | N:1 | Multiple mappings per session |
| ToolIdMapping | ToolApprovalGate | N:1 | Mappings reference gate decisions |

<!-- TA enrichment: indexes -->
- Index on (sessionId, piToolUseId) for fast lookup
- TTL cleanup after session end

---

## 5. Integration Specifications

### 5.1 External System: ToolApprovalGate

| Attribute | Value |
|-----------|-------|
| Purpose | Human-in-the-loop approval policy enforcement |
| Direction | Outbound |
| Data Format | In-memory object / TypeScript interface |
| Frequency | Real-time per tool call |

**Data Exchange:**
| Our Data | External Data | Direction | Business Rule |
|----------|--------------|-----------|---------------|
| extensionToolId | toolId | Send | Normalized id |
| sessionId | sessionId | Send | Correlation |
| toolCall | toolContext | Send | — |
| decision | approvalResult | Receive | — |

**Authentication:** In-process, no auth required.
**Retry Policy:** One retry on timeout, then fail open with audit log.
**Error Handling:** Gate errors logged, mapped to ADAPTER-003.

[Implements: BRD §3 Dependencies]

### 5.2 External System: Pi SDK Agent

| Attribute | Value |
|-----------|-------|
| Purpose | Tool execution orchestration |
| Direction | Bidirectional |
| Data Format | JSON / TypeScript |
| Frequency | Real-time |

**Data Exchange:**
| Our Data | External Data | Direction | Business Rule |
|----------|--------------|-----------|---------------|
| piToolUseId | tool_use_id | Receive | — |
| toolResult | PiToolResult | Send | Format compliance |

---

## 6. Processing Logic

### 6.1 Approval Request Processing

**Trigger:** PiAgent Executor issues tool call requiring approval
**Input:** PiToolCall, sessionId, ticketKey
**Output:** PiToolResult

**Processing Steps:**
| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Validate piToolUseId non-empty | ADAPTER-001 |
| 2 | Normalize id pi→extension | Log warning on duplicate |
| 3 | Build approval context | — |
| 4 | Call ToolApprovalGate.evaluate() | Retry once on timeout |
| 5 | Translate decision to Pi format | Log translation errors |
| 6 | Persist mapping via Checkpointer Adapter | Log persistence failure |

**Activity Diagram:** See System Context diagram above.

Pseudocode for id normalization:
```typescript
function piToExtensionId(piId: string, sessionId: string): string {
  const key = `${sessionId}:${piId}`;
  if (map.has(key)) {
    logger.warn('Duplicate mapping', { key });
    return map.get(key)!;
  }
  const extId = `ext_${crypto.randomUUID()}`;
  map.set(key, extId);
  logger.info('Normalized id', { piId, extId, sessionId });
  return extId;
}
```

<!-- TA enrichment -->

---

## 7. Security Requirements

### 7.1 Authentication & Authorization
Internal module. No external auth. Access controlled by extension process boundary.

### 7.2 Data Sensitivity Classification

| Data Type | Classification | Business Requirement |
|-----------|---------------|---------------------|
| tool_use_id | Internal | No sensitive data in logs per BRD NFR Security |
| sessionId | Internal | Mask in logs |
| approval decision | Confidential | Audit trail required |

### 7.3 Audit Trail

| Event | Logged Fields | Retention | Business Reason |
|-------|--------------|-----------|-----------------|
| id normalization | piToolUseId, extensionToolId, sessionId, ticketKey | 90 days | Compliance |
| approval request | toolCall name, decision, timestamp | 90 days | Audit |
| gate timeout | sessionId, toolCall id | 90 days | Troubleshooting |

[Implements: BRD §6 Non-Functional Requirements Security]

---

## 8. Non-Functional Specifications

| Category | Business Requirement | Acceptance Criteria |
|----------|---------------------|---------------------|
| Performance | Adapter latency | < 10ms per tool call [Implements: BRD §6] |
| Availability | Concurrent sessions | Support 100+ parallel sessions [Implements: BRD §6] |
| Scalability | Memory usage | Mapping map bounded by active sessions, cleanup on session end |
| Security | Id mapping | No sensitive data in logs [Implements: BRD §6] |

<!-- TA enrichment: quantified targets -->

---

## 9. Error Handling & Logging

### 9.1 Error Scenarios

| Scenario | Severity | User Message | Expected Behavior |
|----------|----------|-------------|-------------------|
| ADAPTER-001 | Critical | Missing tool_use_id | Reject request, log error |
| ADAPTER-002 | Warning | Invalid session | Return error to agent executor |
| ADAPTER-003 | Warning | Approval gate timeout | Retry once, fail open with audit |
| ADAPTER-004 | Error | Mapping failure | Log and propagate error |

### 9.2 Notification Requirements

| Event | Who is Notified | Channel | Timing |
|-------|----------------|---------|--------|
| Gate timeout | Dev team | Log | Immediate |
| Duplicate mapping | Dev team | Log | Immediate |

Structured logging format: JSON with fields `level`, `timestamp`, `ticketKey`, `sessionId`, `event`, `piToolUseId`, `extensionToolId`.

---

## 10. Testing Considerations

### 10.1 Test Scenarios

| ID | Scenario | Input | Expected Output | Priority |
|----|----------|-------|-----------------|----------|
| TC-295-01 | Normalize id round-trip | pi_abc123 | extension id → pi_abc123 | High |
| TC-295-02 | Missing id error | empty piToolUseId | ADAPTER-001 | High |
| TC-295-03 | Gate approval success | toolCall approved | PiToolResult approved | High |
| TC-295-04 | Gate timeout retry | gate delay >5s | Retry once then fail open | Medium |
| TC-295-05 | Concurrent sessions | 100 parallel mappings | No collision | Medium |

Integration test: Verify ToolApprovalGate unchanged, adapter isolates changes per [Implements: BRD §1.2].

---

## 11. Appendix

### Diagrams

| Diagram | File |
|---------|------|
| System Context | diagrams/system-context.drawio |
| ER Logical | diagrams/er.drawio |

### Change Log from BRD
- Added TA enrichment: API contracts, pseudocode, error codes ADAPTER-001..004, quantified NFRs, structured logging spec.
- Verified against Pi Migration Plan `src/pi-workflow/approval-adapter.ts` location.
- No deviations from BRD functional scope.

### Open Issues
| Issue | Owner | Target Date |
|-------|-------|-------------|
| Confirm ToolApprovalGate.evaluate() signature | Dev Team | 2026-09-20 |
| Define log retention policy with Security | Security Agent | 2026-09-25 |

<!-- TA enrichment -->

---

**End of FSD**
