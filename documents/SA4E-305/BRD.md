# Business Requirements Document (BRD)

## Pi Chat 3-pane Layout Redesign — SA4E-305: SA4E-289.9 - Pi Chat 3-pane Layout Redesign

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-305 |
| Title | SA4E-289.9 - Pi Chat 3-pane Layout Redesign |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2026-09-24 |
| Status | Draft |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | BA Agent – Business Analyst | Create document |
| Peer Reviewer | TBD – TBD | Review document |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-09-24 | BA Agent | Initiate document — auto-generated from Jira ticket SA4E-305 and linked tickets |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |

---

## 1. Introduction

### 1.1 Scope

Redesign Pi chat webview to the 3-pane workflow layout as defined in SA4E-289.9. The redesign covers Toolbar / Left / Center / Right / Input / Status Bar components, plus Approval Panel and Worklist tab integration. The implementation must reuse existing Svelte components/stores, avoid hardcoded session/provider/model per SEC-289-11, use real data via ext<->webview bridge, and follow frontend-structure steering.

Source: SA4E-305 description.

### 1.2 Out of Scope

No explicit out-of-scope items are documented in the Jira ticket. To be confirmed with stakeholders.

### 1.3 Preliminary Requirement

- Fix runtime model-resolution first, as prerequisite.
- Reuse existing Svelte components/stores.
- NO hardcoded session/provider/model (SEC-289-11).
- Real data via extension <-> webview bridge.
- Follow frontend-structure steering.
- Reference specifications: documents/SA4E-289/PI-CHAT-LAYOUT-SPEC.md, documents/SA4E-289/PI-CHAT-UI-LAYOUT-CHECKLIST.md, documents/SA4E-289/*.png/.drawio

---

## 2. Business Requirements

### 2.1 High Level Process Map

The Pi Chat webview UI is redesigned from current layout to a 3-pane workflow layout. The system loads the webview, renders the new layout components in correct regions, binds data via ext<->webview bridge, and provides Approval Panel and Worklist tab functionality within the panes. No functional change to backend workflow logic is implied in this ticket.

### 2.2 List of User Stories / Use Cases

| # | Story / Use Case / Epic | Priority | Source Ticket |
|---|-------------------------|----------|---------------|
| 1 | As a user, I want Pi Chat webview to display a 3-pane workflow layout with Toolbar, Left, Center, Right, Input and Status Bar so that I can work with a structured conversation and approval workflow | MUST HAVE | SA4E-305 |
| 2 | As a user, I want Approval Panel and Worklist tab integrated in the layout so that I can review and manage tasks within the same view | SHOULD HAVE | SA4E-305 |

---

### 2.3 Details of User Stories

---

#### Business Flow

**Step 1:** User opens Pi Chat webview in VS Code extension.

**Step 2:** Application loads redesigned 3-pane layout with Toolbar, Left pane, Center pane, Right pane, Input area, Status Bar.

**Step 3:** Data is fetched via ext<->webview bridge using existing stores/components.

**Step 4:** Approval Panel and Worklist tab are rendered in appropriate pane.

**Step 5:** User interacts with layout; UI state persists according to Svelte stores.

> **Note:** Runtime model-resolution must be fixed prior to implementation.

---

#### STORY 1: 3-pane Layout Redesign

> As a user, I want Pi Chat webview to display a 3-pane workflow layout with Toolbar, Left, Center, Right, Input and Status Bar so that I can work with a structured conversation and approval workflow

**Requirement Details:**

1. Redesign Pi chat webview to 3-pane workflow layout (Toolbar / Left / Center / Right / Input / Status Bar + Approval Panel + Worklist tab).
2. Reuse existing Svelte components/stores; no hardcoded session/provider/model.
3. Real data via extension <-> webview bridge.
4. Follow frontend-structure steering.

**Data Fields (if applicable):**

No information available from the provided tickets.

**Acceptance Criteria:**

No acceptance criteria explicitly documented in Jira ticket SA4E-305. Refer to documents/SA4E-289/PI-CHAT-LAYOUT-SPEC.md and PI-CHAT-UI-LAYOUT-CHECKLIST.md for detailed acceptance criteria.

**UI Specifications (if applicable):**

| No. | Name | Type | Required | Description | Note |
|-----|------|------|----------|-------------|------|
| 1 | Toolbar | Container | Yes | Top bar for actions | Per spec |
| 2 | Left Pane | Container | Yes | Navigation / context | Per spec |
| 3 | Center Pane | Container | Yes | Main chat/workflow area | Per spec |
| 4 | Right Pane | Container | Yes | Details / approval | Per spec |
| 5 | Input | Input | Yes | User input area | Per spec |
| 6 | Status Bar | Container | Yes | Status information | Per spec |
| 7 | Approval Panel | Panel | Yes | Approval workflow UI | Per spec |
| 8 | Worklist Tab | Tab | Yes | Worklist view | Per spec |

**Validation Rules (if applicable):**

No information available from the provided tickets.

**Error Handling (if applicable):**

No information available from the provided tickets.

---

#### STORY 2: Approval Panel and Worklist Integration

> As a user, I want Approval Panel and Worklist tab integrated in the layout so that I can review and manage tasks within the same view

**Requirement Details:**

1. Approval Panel is accessible within the 3-pane layout.
2. Worklist tab is integrated per spec.

**Acceptance Criteria:**

No acceptance criteria explicitly documented in Jira ticket SA4E-305.

**UI Specifications (if applicable):**

No detailed UI specifications available from ticket. Refer to spec documents.

---

## 3. Dependencies

| Dependency | Type | Related Ticket | Description |
|------------|------|----------------|-------------|
| Runtime model-resolution fix | Infrastructure | N/A | Prerequisite before implementation |
| PI-CHAT-LAYOUT-SPEC.md | Document | SA4E-289 | Specification reference |
| PI-CHAT-UI-LAYOUT-CHECKLIST.md | Document | SA4E-289 | Checklist reference |
| Mockups | Document | SA4E-289 | Design reference |
| SEC-289-11 | Compliance | N/A | No hardcoded session/provider/model rule |

---

## 4. Stakeholders

| Role | Name / Team | Responsibility | Source |
|------|-------------|----------------|--------|
| Reporter | Duc Nguyen Minh | Requested change | SA4E-305 reporter |
| Assignee | Unassigned | Implementation | SA4E-305 assignee |
| Product Owner | TBD | Approval | To be confirmed |

---

## 5. Risks and Assumptions

### 5.1 Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Spec documents not accessible | High | Medium | Locate documents/SA4E-289/* before design |
| Runtime model-resolution not fixed | High | Medium | Enforce prerequisite gate |
| Breaking existing Svelte stores | Medium | Medium | Reuse components, follow frontend-structure steering |

### 5.2 Assumptions

- Specification documents exist at documents/SA4E-289/PI-CHAT-LAYOUT-SPEC.md and related paths.
- Existing Svelte components/stores can support 3-pane layout with minimal changes.
- Extension <-> webview bridge is functional for real data.

---

## 6. Non-Functional Requirements

| Category | Requirement | Details |
|----------|-------------|---------|
| Performance | No specific requirement identified | To be confirmed with technical team |
| Security | No hardcoded session/provider/model | SEC-289-11 |
| Scalability | No specific requirement identified | To be confirmed with technical team |
| Availability | No specific requirement identified | To be confirmed with technical team |

> If no non-functional requirements are identified from the tickets, state: "No specific non-functional requirements identified. To be confirmed with technical team."

---

## 7. Related Tickets

| Ticket Key | Summary | Status | Type | Relationship |
|------------|---------|--------|------|--------------|
| SA4E-305 | SA4E-289.9 - Pi Chat 3-pane Layout Redesign | In Progress | Task | Main ticket |
| SA4E-289 | Migrate LangGraph Workflow Engine to Pi SDK (Option C) | N/A | Epic | Parent / context |

---

## 8. Appendix

Any additional details, data mappings, reference documents, or technical notes extracted from the tickets.

### Glossary (if applicable)

| Term | Definition |
|------|------------|
| Pi Chat | Webview chat interface in SDLC Agents VS Code extension |
| 3-pane layout | Toolbar / Left / Center / Right / Input / Status Bar layout |

### Reference Documents

| Document | Link / Location |
|----------|-----------------|
| PI-CHAT-LAYOUT-SPEC.md | documents/SA4E-289/PI-CHAT-LAYOUT-SPEC.md |
| PI-CHAT-UI-LAYOUT-CHECKLIST.md | documents/SA4E-289/PI-CHAT-UI-LAYOUT-CHECKLIST.md |
| Mockups | documents/SA4E-289/*.png/.drawio |
