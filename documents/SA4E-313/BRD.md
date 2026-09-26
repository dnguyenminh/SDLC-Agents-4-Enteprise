# Business Requirements Document (BRD)

## SA4E-313 — Pass IDE workspace root as cwd to Pi SDK session (fix 'unknown workspace')

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-313 |
| Title | Pass IDE workspace root as cwd to Pi SDK session (fix 'unknown workspace') |
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
| 1.0 | 2026-09-24 | BA Agent | Initiate document — auto-generated from Jira ticket SA4E-313 and linked tickets |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |

---

## 1. Introduction

### 1.1 Scope

The embedded Pi chatbox (@earendil-works/pi-coding-agent) currently does not know the current IDE workspace. When a session is created without an explicit cwd, the Pi SDK falls back to process.cwd() which is the process launch directory, not the user's open workspace. This causes built-in tools (ls, read, bash) to resolve against the wrong directory and forces the agent to ask the user "which workspace?".

This change requires passing the IDE workspace root as cwd to both createAgentSession() and SessionManager, sourced from VS Code workspace.workspaceFolders[0].uri.fsPath. With correct cwd, DefaultResourceLoader will auto-discover AGENTS.md/context files walking up from cwd.

### 1.2 Out of Scope

- Changes to Pi SDK core library itself.
- Support for multi-root workspaces beyond picking the first workspace folder.
- Changes to other SDK sessions not created via the VS Code extension.

### 1.3 Preliminary Requirement

- VS Code extension is loaded with an active workspace folder opened.
- Pi SDK version supports cwd parameter in createAgentSession() and SessionManager.inMemory().
- No additional preliminary requirements identified.

---

## 2. Business Requirements

### 2.1 High Level Process Map

Developer opens VS Code workspace → Pi chatbox initializes → createAgentSession() is called with cwd = workspace root → SessionManager constructed with same cwd → Built-in tools resolve relative to workspace root → Agent auto-loads project steering/context files → User can ask workspace-aware questions without manual path input.

### 2.2 List of User Stories / Use Cases

| # | Story / Use Case / Epic | Priority | Source Ticket |
|---|-------------------------|----------|---------------|
| 1 | As a developer, I want the Pi coding agent to automatically use my IDE workspace root as current working directory so that built-in tools operate in the correct project without asking me for path | MUST HAVE | SA4E-313 |

---

### 2.3 Details of User Stories

---

#### Business Flow

**Step 1:** User opens VS Code with a workspace folder.
**Step 2:** Pi extension detects workspace root via workspace.workspaceFolders[0].uri.fsPath.
**Step 3:** Extension calls createAgentSession({ cwd, tools, sessionManager: SessionManager.inMemory(cwd) }).
**Step 4:** SDK initializes session with provided cwd.
**Step 5:** Built-in tools (ls/read/bash/edit/write) resolve paths against cwd.
**Step 6:** DefaultResourceLoader walks up from cwd to discover AGENTS.md/context files.
**Step 7:** Chatbox operates without prompting user for workspace path.

> **Note:** If workspaceFolders is undefined, session should fallback gracefully and log warning.

---

#### STORY 1: Pass IDE workspace root as cwd to Pi SDK session

> As a developer, I want the Pi coding agent to automatically use my IDE workspace root as current working directory so that built-in tools operate in the correct project without asking me for path

**Requirement Details:**

1. createAgentSession() must receive cwd = active IDE workspace root.
2. SessionManager must be constructed with the same cwd via SessionManager.inMemory(cwd).
3. Built-in tools ls/read/bash/edit/write/grep/find must resolve against workspace root.
4. Chatbox must no longer ask user for workspace path.
5. AGENTS.md / context files from workspace root must be auto-loaded.

**Data Fields (if applicable):**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| cwd | string | Yes | Absolute path to IDE workspace root | C:\Users\ASUS\project |
| workspaceFolders | array | Yes | VS Code workspace folders | [{uri:{fsPath:...}}] |

**Acceptance Criteria:**

1. createAgentSession() receives cwd = active IDE workspace root.
2. SessionManager is constructed with the same cwd.
3. Built-in tools (ls/read/bash) resolve against the workspace root.
4. Chatbox no longer asks the user for the workspace path.
5. AGENTS.md / context files from the workspace root are auto-loaded.

**UI Specifications (if applicable):**

| No. | Name | Type | Required | Description | Note |
|-----|------|------|----------|-------------|------|
| 1 | Chatbox input | Text Input | Yes | User input area for prompts | No change |
| 2 | Agent responses | Text Area | Yes | Displays agent output | Should not contain workspace path prompt |

**Validation Rules (if applicable):**

- cwd must be a valid absolute filesystem path.
- workspaceFolders must exist and have at least one entry.

**Error Handling (if applicable):**

- workspaceFolders undefined: Log warning and fallback to process.cwd() with user notification.
- Invalid path: Do not create session; surface error to user.

---

## 3. Dependencies

| Dependency | Type | Related Ticket | Description |
|------------|------|----------------|-------------|
| Pi SDK createAgentSession | System | N/A | SDK must support cwd parameter |
| VS Code workspace API | System | N/A | workspace.workspaceFolders must be accessible |
| Pi Coding Agent Extension | System | SA4E-313 | Extension code modification |

---

## 4. Stakeholders

| Role | Name / Team | Responsibility | Source |
|------|-------------|----------------|--------|
| Reporter | Duc Nguyen Minh | Requirement owner | Jira reporter |
| Developer | TBD | Implementation | Assignee TBD |

---

## 5. Risks and Assumptions

### 5.1 Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Multi-root workspace ambiguity | Medium | Medium | Use first folder; document limitation |
| workspaceFolders undefined in headless mode | Medium | Low | Fallback with warning |

### 5.2 Assumptions

- User always opens VS Code with at least one workspace folder.
- Pi SDK cwd parameter works as documented.

---

## 6. Non-Functional Requirements

| Category | Requirement | Details |
|----------|-------------|---------|
| Performance | Negligible overhead | cwd resolution is synchronous, minimal impact |
| Security | Path sanitization | Ensure cwd is within allowed workspace |
| Scalability | Single workspace | Works per session |
| Availability | No downtime | Change is client-side extension update |

> If no non-functional requirements are identified from the tickets, state: "No specific non-functional requirements identified. To be confirmed with technical team."

---

## 7. Related Tickets

| Ticket Key | Summary | Status | Type | Relationship |
|------------|---------|--------|------|--------------|
| SA4E-313 | Pass IDE workspace root as cwd to Pi SDK session (fix 'unknown workspace') | In Progress | Task | Main ticket |

---

## 8. Appendix

### Glossary

| Term | Definition |
|------|------------|
| cwd | Current working directory passed to Pi SDK |
| Pi SDK | Pi coding agent SDK |
| SessionManager | Pi SDK session manager |

### Reference Documents

| Document | Link / Location |
|----------|-----------------|
| Pi SDK docs | https://pi.dev/docs/latest/sdk |
| Example 05-tools.ts | packages/coding-agent/examples/sdk/05-tools.ts |
| Example 07-context-files.ts | packages/coding-agent/examples/sdk/07-context-files.ts |
