# Business Requirements Document (BRD)

## JiraAssist Extension — SA4E-229: Implement jira_download_attachment tool to fix 403 error when fetching attachments

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-229 |
| Title | Implement jira_download_attachment tool to fix 403 error when fetching attachments |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2026-08-28 |
| Status | Draft |

---

## 1. Introduction

### 1.1 Scope
Implement a `jira_download_attachment` tool that uses the extension's authenticated session to fetch and return the content of an attachment by its ID or URL. Current tools can list attachments via `jira_get_attachments`, but there is no tool to download actual content. Using `webfetch` with provided attachment URL returns 403 Forbidden due to missing authentication headers.

### 1.2 Out of Scope
- Changing Jira attachment storage backend.
- Adding new attachment upload capabilities.

### 1.3 Preliminary Requirement
- Existing authenticated MCP session to JiraAssist.
- `jira_get_attachments` tool working.

---

## 2. Business Requirements

### 2.1 High Level Process Map
User requests attachment content → SM invokes `jira_download_attachment` tool → tool uses authenticated session to fetch binary/text content → returns content to caller.

### 2.2 List of User Stories / Use Cases

| # | Story / Use Case / Epic | Priority | Source Ticket |
|---|-------------------------|----------|---------------|
| 1 | As a developer, I want to download attachment content via authenticated session so that I can process files without 403 errors | MUST HAVE | SA4E-229 |
| 2 | As a developer, I want to download attachment by ID so that I can reference attachments programmatically | MUST HAVE | SA4E-229 |
| 3 | As a developer, I want to download attachment by URL so that I can use existing URLs from `jira_get_attachments` | SHOULD HAVE | SA4E-229 |

---

### 2.3 Details of User Stories

#### Business Flow

**Step 1:** User calls `jira_download_attachment` with attachment ID or URL.
**Step 2:** Tool resolves ID to URL if needed.
**Step 3:** Tool performs GET request using authenticated session.
**Step 4:** Tool returns content and metadata.
**Step 5:** Caller processes content.

##### STORY 1: Download attachment content via authenticated session

> As a developer, I want to download attachment content via authenticated session so that I can process files without 403 errors

**Requirement Details:**
1. Tool must use existing authenticated session to JiraAssist.
2. Tool must accept attachment ID or URL.
3. Tool must return content as base64 or text depending on mime type.

**Acceptance Criteria:**
1. Calling tool with valid attachment ID returns content with HTTP 200.
2. No 403 Forbidden error occurs.
3. Content type is correctly identified.

##### STORY 2: Download by ID

> As a developer, I want to download attachment by ID so that I can reference attachments programmatically

**Requirement Details:**
1. Accept parameter `attachment_id`.
2. Resolve to URL via Jira API.

**Acceptance Criteria:**
1. Valid ID returns content.
2. Invalid ID returns clear error message.

##### STORY 3: Download by URL

> As a developer, I want to download attachment by URL so that I can use existing URLs from `jira_get_attachments`

**Requirement Details:**
1. Accept parameter `attachment_url`.
2. Perform authenticated fetch.

**Acceptance Criteria:**
1. Valid URL returns content.
2. Unauthorized URL returns error.

---

## 3. Dependencies

| Dependency | Type | Related Ticket | Description |
|------------|------|----------------|-------------|
| jira_get_attachments | System | SA4E-229 | Provides attachment metadata |

---

## 4. Stakeholders

| Role | Name / Team | Responsibility | Source |
|------|-------------|----------------|--------|
| Product Owner | - | Define requirement | SA4E-229 |

---

## 5. Risks and Assumptions

### 5.1 Risks
| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Attachment size too large | Medium | Medium | Stream content, limit size |

### 5.2 Assumptions
- Authenticated session is available.

---

## 6. Non-Functional Requirements

| Category | Requirement | Details |
|----------|-------------|---------|
| Performance | Response time < 5s for attachments <10MB | - |
| Security | Use existing auth, no credential leakage | - |

---

## 7. Related Tickets

| Ticket Key | Summary | Status | Type | Relationship |
|------------|---------|--------|------|--------------|
| SA4E-229 | Implement jira_download_attachment tool to fix 403 error when fetching attachments | In Progress | Story | Main ticket |

---

## 8. Appendix

### Diagram Index
| # | Diagram | Image | Source |
|---|---------|-------|--------|
| 1 | Business Flow | diagrams/business-flow.png | diagrams/business-flow.drawio |
| 2 | Use Case | diagrams/use-case.png | diagrams/use-case.drawio |
