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

## 1. Introduction

### 1.1 Purpose
Specify technical functional requirements for full integration of PiWorkflow engine built on Pi SDK replacing LangGraph execution engine, preserving human-in-the-loop approval gates.

### 1.2 Scope
PiWorkflow orchestrator in extension/src/pi-workflow/, StateAdapter, ApprovalAdapter, CheckpointerAdapter. Feature toggle workflow.engine='pi'.

### 1.3 Definitions
Pi SDK, PiWorkflow Engine, ToolApprovalGate, RemoteCheckpointer, StateAdapter

### 1.4 References
BRD documents/SA4E-296/BRD.md, Pi Migration Plan documents/pi-migration-plan.md

## 2. System Overview
System Context Diagram and Architecture described per migration plan.

## 3. Functional Requirements
3.1 PiWorkflow Engine Integration End-to-End [Implements: Story 1]
Use Case UC-001, API Contract workflow.execute
3.2 Human Approval Logic Preservation [Implements: Story 2]
Pseudocode handleToolApproval provided
3.3 End-to-End Test Flow Validation [Implements: Story 3]

## 4. Data Model
PipelineState entity with ticketKey, threadId, currentPhase, pipelineStatus, piSessionId, currentAgentId, toolCallCount

## 5. Integration Specifications
Pi SDK bidirectional, RemoteCheckpointer outbound retry 3x

## 6. Processing Logic
Workflow Execution Loop with steps Load, Adapt, Execute, Approval, PhaseRouter, Persist

## 7. Security Requirements
Audit trail approval decisions 1 year retention

## 8. Non-Functional Requirements
Performance ≤15% vs LangGraph, Availability >99%, Scalability ≥10 concurrent

## 9. Error Handling
STATE_MAPPING_ERROR, APPROVAL_TIMEOUT, PI_SDK_ERROR

## 10. Testing Considerations
TC-001..004

## 11. Appendix
TA enrichment completed
