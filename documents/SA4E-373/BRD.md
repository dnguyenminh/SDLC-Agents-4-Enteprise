# Business Requirements Document (BRD)

## ide_launch / Kiro — SA4E-373: Fix ide_launch DevToolsActivePort timeout for Kiro

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-373 |
| Title | Fix ide_launch DevToolsActivePort timeout for Kiro |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2026-10-19 |
| Status | Draft |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | BA Agent – Business Analyst | Create document |
| Peer Reviewer |  –  | Review document |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-19 | BA Agent | Initiate document — auto-generated from Jira ticket SA4E-373 and linked tickets |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |

---

## 1. Introduction

### 1.1 Scope

The ide_launch tool fails with error 'IDE did not expose DevToolsActivePort within 30s' when launching Kiro IDE with a custom userDataDir. The requirement is to ensure reliable launch of Kiro under custom userDataDir conditions for manual UAT execution. The solution may involve supporting the --remote-debugging-port flag to explicitly expose DevTools port, or increasing/integrating a configurable timeout with proper port detection. This change unblocks manual UAT for SA4E-370.

### 1.2 Out of Scope

Modifications to Kiro IDE core source code. Changes to other IDE launch mechanisms unrelated to DevToolsActivePort detection. Enhancements to userDataDir management beyond launch support.

### 1.3 Preliminary Requirement

Access to ide_launch implementation and test environment with Kiro installed. Ability to launch Kiro with custom userDataDir for reproduction. No additional preliminary requirements identified.

---

## 2. Business Requirements

### 2.1 High Level Process Map

The QA/Test Automation process requires launching Kiro IDE programmatically via ide_launch tool with isolated userDataDir for clean test sessions. The tool spawns Kiro process, monitors for DevToolsActivePort exposure via standard output / IPC, and signals launch success. Currently the detection times out after 30s under custom userDataDir, blocking subsequent UAT steps.

### 2.2 List of User Stories / Use Cases

| # | Story / Use Case / Epic | Priority | Source Ticket |
|---|-------------------------|----------|---------------|
| 1 | As a QA Engineer, I want ide_launch to successfully launch Kiro with custom userDataDir without DevToolsActivePort timeout so that I can perform manual UAT for SA4E-370 | MUST HAVE | SA4E-373 |
| 2 | As a Developer, I want ide_launch to support explicit --remote-debugging-port configuration for Kiro so that DevTools port exposure is deterministic | SHOULD HAVE | SA4E-373 |

---

### 2.3 Details of User Stories

---

#### Business Flow

**Step 1:** User invokes ide_launch tool targeting Kiro IDE with optional custom userDataDir parameter.

**Step 2:** ide_launch starts Kiro process with appropriate command line arguments.

**Step 3:** ide_launch monitors process output / environment for DevToolsActivePort exposure.

**Step 4:** Upon detection of DevToolsActivePort within timeout window, tool returns success with port info.

**Step 5:** If port not detected, tool previously fails with 'IDE did not expose DevToolsActivePort within 30s'. After fix, tool either succeeds via explicit port flag or extended/retry logic.

> **Note:** Custom userDataDir may delay IDE initialization, increasing time to expose DevToolsActivePort.

---

#### STORY 1: Reliable Kiro launch with custom userDataDir

> As a QA Engineer, I want ide_launch to successfully launch Kiro with custom userDataDir without DevToolsActivePort timeout so that I can perform manual UAT for SA4E-370

**Requirement Details:**

1. ide_launch must successfully launch Kiro IDE when userDataDir is custom/isolated.
2. DevToolsActivePort detection must succeed consistently or be bypassed via explicit remote debugging port.
3. Launch failure due to 'IDE did not expose DevToolsActivePort within 30s' must be eliminated for Kiro.

**Data Fields (if applicable):**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| userDataDir | string | No | Custom user data directory path for isolated Kiro launch | C:\temp\kiro-uat |
| remoteDebuggingPort | integer | No | Explicit port to force remote debugging | 9222 |
| timeoutSeconds | integer | No | Configurable timeout for DevTools port detection | 60 |

**Acceptance Criteria:**

1. Given Kiro launch with custom userDataDir, when ide_launch is invoked, then launch completes without 'IDE did not expose DevToolsActivePort within 30s' error.
2. Given Kiro launch, when --remote-debugging-port is supported, then port is explicitly exposed and detection succeeds within expected time.
3. Manual UAT for SA4E-370 can be initiated using ide_launch without manual workarounds.
4. Existing launches without custom userDataDir continue to work unchanged.

**UI Specifications (if applicable):**

N/A – CLI tool.

**Validation Rules (if applicable):**

- userDataDir path must be accessible and writable.
- remoteDebuggingPort must be within valid TCP range 1024-65535 and not in use.

**Error Handling (if applicable):**

- Invalid userDataDir: Return clear error 'UserDataDir not accessible'.
- Port conflict: Return error 'Remote debugging port already in use'.

---

#### STORY 2: Explicit remote debugging port support

> As a Developer, I want ide_launch to support explicit --remote-debugging-port configuration for Kiro so that DevTools port exposure is deterministic

**Requirement Details:**

1. ide_launch should allow passing --remote-debugging-port flag to Kiro process.
2. When flag is used, DevToolsActivePort detection should rely on configured port rather than waiting for auto-exposure.

**Acceptance Criteria:**

1. ide_launch accepts remoteDebuggingPort parameter and forwards --remote-debugging-port=<port> to Kiro command line.
2. Launch succeeds with remote debugging port explicitly set, regardless of IDE auto-exposure timing.
3. Documentation updated to reflect new parameter.

---

## 3. Dependencies

| Dependency | Type | Related Ticket | Description |
|------------|------|----------------|-------------|
| Kiro IDE launch behavior | System | N/A | IDE must support --remote-debugging-port flag |
| Manual UAT for SA4E-370 | Business | SA4E-370 | Blocked by this fix |
| ide_launch tool codebase | System | SA4E-373 | Code changes required |

---

## 4. Stakeholders

| Role | Name / Team | Responsibility | Source |
|------|-------------|----------------|--------|
| Reporter | Duc Nguyen Minh | Issue reporter | SA4E-373 |
| QA Engineer |  | Manual UAT execution | SA4E-373 |
| Developer |  | ide_launch implementation | SA4E-373 |

---

## 5. Risks and Assumptions

### 5.1 Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Kiro does not support --remote-debugging-port | High | Medium | Increase timeout and add retry logic as fallback |
| Increasing timeout masks underlying performance issue | Medium | Low | Monitor launch duration metrics |
| Port conflict with existing services | Medium | Low | Validate port availability before launch |

### 5.2 Assumptions

- Kiro command line accepts --remote-debugging-port flag similar to Chrome-based IDEs.
- Custom userDataDir increases initialization time but does not prevent DevTools exposure.
- Timeout increase to 60s is acceptable for UAT workflow.

---

## 6. Non-Functional Requirements

| Category | Requirement | Details |
|----------|-------------|---------|
| Performance | Launch detection | DevToolsActivePort detection should complete within 60s for custom userDataDir |
| Security | Port exposure | Remote debugging port should not be exposed externally beyond test environment |
| Availability | Reliability | ide_launch success rate for Kiro with custom userDataDir > 95% |
| Scalability | N/A | No specific non-functional requirements identified |

---

## 7. Related Tickets

| Ticket Key | Summary | Status | Type | Relationship |
|------------|---------|--------|------|--------------|
| SA4E-373 | Fix ide_launch DevToolsActivePort timeout for Kiro | To Do | Bug | Main ticket |
| SA4E-370 | Manual UAT requirement |  |  | Blocked by SA4E-373 |

---

## 8. Appendix

### Glossary

| Term | Definition |
|------|------------|
| DevToolsActivePort | Environment variable / output indicating Chrome DevTools remote debugging port is active |
| userDataDir | Custom directory used by Kiro to store user settings, extensions, and state for isolated launches |
| ide_launch | Internal tool for programmatically launching IDEs and waiting for devtools readiness |

### Reference Documents

| Document | Link / Location |
|----------|-----------------|
| Jira Ticket SA4E-373 | https://jiraassist.atlassian.net/browse/SA4E-373 |
