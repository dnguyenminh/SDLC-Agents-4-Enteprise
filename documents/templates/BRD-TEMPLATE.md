# Business Requirements Document (BRD)

## {SYSTEM_NAME} — {TICKET_KEY}: {TICKET_SUMMARY}

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | {TICKET_KEY} |
| Title | {TICKET_SUMMARY} |
| Author | BA Agent |
| Version | 1.0 |
| Date | {CURRENT_DATE} |
| Status | Draft |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | {AUTHOR_NAME} – {AUTHOR_POSITION} | Create document |
| Peer Reviewer | {REVIEWER_NAME} – {REVIEWER_POSITION} | Review document |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | {CURRENT_DATE} | BA Agent | Initiate document — auto-generated from Jira ticket {TICKET_KEY} and linked tickets |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |

---

## 1. Introduction

### 1.1 Scope

{Describe the scope of this change request based on the main Jira ticket description and objectives.}

### 1.2 Out of Scope

{List items explicitly excluded from this CR. If not available from tickets, state: "To be confirmed with stakeholders."}

### 1.3 Preliminary Requirement

{List any prerequisites or dependencies that must be in place before implementation. If not available, state: "No additional preliminary requirements identified."}

---

## 2. Business Requirements

### 2.1 High Level Process Map

{Provide a high-level description of the business process. Reference the detailed business flow in section 2.3 if applicable.}

### 2.2 List of User Stories / Use Cases

| # | Story / Use Case / Epic | Priority | Source Ticket |
|---|-------------------------|----------|---------------|
| 1 | {User story in format: As a [role], I want [goal] so that [benefit]} | {MUST HAVE / SHOULD HAVE / COULD HAVE} | {TICKET_KEY} |
| 2 | {Next user story} | {Priority} | {LINKED_TICKET_KEY} |

---

### 2.3 Details of User Stories

---

#### Business Flow

{Describe the end-to-end business flow step by step. Use the following format:}

**Step 1:** {Description of the first step}

**Step 2:** {Description of the second step}

**Step N:** {Continue until the flow is complete}

> **Note:** {Add any important notes or conditions about the flow}

---

#### STORY 1: {Story Title}

> {User story statement: As a [role], I want [goal] so that [benefit]}

**Requirement Details:**

1. {Detailed requirement description extracted from Jira ticket}
2. {Additional requirement details}

**Data Fields (if applicable):**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| {FIELD_NAME} | {Data type} | {Yes/No} | {Description} | {Example value} |

**Acceptance Criteria:**

1. {Acceptance criterion 1 — extracted from Jira ticket}
2. {Acceptance criterion 2}

**UI Specifications (if applicable):**

| No. | Name | Type | Required | Description | Note |
|-----|------|------|----------|-------------|------|
| 1 | {Element name} | {Button/Label/Dropdown/Input/etc.} | {Yes/No} | {Description} | {Additional notes} |

**Validation Rules (if applicable):**

- {Rule 1}
- {Rule 2}

**Error Handling (if applicable):**

- {Error scenario 1}: {System behavior}
- {Error scenario 2}: {System behavior}

---

#### STORY 2: {Story Title}

> {User story statement}

**Requirement Details:**

{Repeat the same structure as Story 1 for each user story}

**Acceptance Criteria:**

{List acceptance criteria}

---

{Repeat for additional stories as needed}

---

## 3. Dependencies

| Dependency | Type | Related Ticket | Description |
|------------|------|----------------|-------------|
| {Dependency name} | {System/Infrastructure/External/Compliance} | {TICKET_KEY or N/A} | {Description} |

---

## 4. Stakeholders

| Role | Name / Team | Responsibility | Source |
|------|-------------|----------------|--------|
| {Role} | {Name or Team extracted from Jira} | {Responsibility} | {Ticket assignee/reporter/watcher} |

---

## 5. Risks and Assumptions

### 5.1 Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| {Risk description} | {High/Medium/Low} | {High/Medium/Low} | {Mitigation strategy} |

### 5.2 Assumptions

- {Assumption 1}
- {Assumption 2}

---

## 6. Non-Functional Requirements

| Category | Requirement | Details |
|----------|-------------|---------|
| Performance | {Requirement} | {Details if available from tickets} |
| Security | {Requirement} | {Details} |
| Scalability | {Requirement} | {Details} |
| Availability | {Requirement} | {Details} |

> If no non-functional requirements are identified from the tickets, state: "No specific non-functional requirements identified. To be confirmed with technical team."

---

## 7. Related Tickets

| Ticket Key | Summary | Status | Type | Relationship |
|------------|---------|--------|------|--------------|
| {TICKET_KEY} | {Summary} | {Status} | {Story/Bug/Task/Epic} | Main ticket |
| {LINKED_KEY} | {Summary} | {Status} | {Type} | {blocks/is blocked by/relates to/subtask of/etc.} |

---

## 8. Appendix

{Any additional details, data mappings, reference documents, or technical notes extracted from the tickets.}

### Glossary (if applicable)

| Term | Definition |
|------|------------|
| {Term} | {Definition} |

### Reference Documents

| Document | Link / Location |
|----------|-----------------|
| {Document name} | {URL or path} |
