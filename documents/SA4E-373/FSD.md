# Functional Specification Document (FSD)

## SA4E-373 — Fix ide_launch DevToolsActivePort timeout for Kiro

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
| Related BRD | documents/SA4E-373/BRD.md |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-19 | BA Agent | Initiate document — auto-generated from BRD and Jira tickets |

---

## 1. Introduction

### 1.1 Purpose

This FSD specifies the functional behavior required to make ide_launch reliably launch Kiro IDE with custom userDataDir without DevToolsActivePort timeout. It defines use cases, business rules, data specifications, processing logic, error handling, and non-functional requirements derived from BRD SA4E-373.

### 1.2 Scope

Scope is limited to the ide_launch tool's Kiro launch path:
- Monitoring and detection of DevToolsActivePort for Kiro processes
- Support for explicit --remote-debugging-port flag forwarding
- Configurable timeout for port detection
- Validation of userDataDir and remoteDebuggingPort inputs

Out of scope: Modifications to Kiro IDE core source code, changes to other IDE launch mechanisms unrelated to DevToolsActivePort detection, enhancements to userDataDir management beyond launch support.

### 1.3 Definitions & Acronyms

| Term | Definition |
|------|------------|
| DevToolsActivePort | Environment variable / output indicating Chrome DevTools remote debugging port is active |
| userDataDir | Custom directory used by Kiro to store user settings, extensions, and state for isolated launches |
| ide_launch | Internal CLI tool for programmatically launching IDEs and waiting for devtools readiness |
| UAT | User Acceptance Testing |

### 1.4 References

| Document | Location |
|----------|----------|
| BRD | documents/SA4E-373/BRD.md |
| Jira Ticket SA4E-373 | https://jiraassist.atlassian.net/browse/SA4E-373 |

---

## 2. System Overview

### 2.1 System Context Diagram

![System Context](diagrams/system-context.png)

ide_launch interacts with:
- **QA Engineer / Developer** — invokes CLI with parameters
- **Kiro IDE** — launched process, exposes DevToolsActivePort
- **Filesystem** — userDataDir validation and access
- **OS Network Stack** — remote debugging port binding validation

### 2.2 System Architecture

ide_launch is a CLI tool that spawns a child process for Kiro IDE, captures stdout/stderr and environment, monitors for DevToolsActivePort exposure, and returns launch status with port information.

Components:
- **CLI Parser** — parses userDataDir, remoteDebuggingPort, timeoutSeconds
- **Process Launcher** — builds Kiro command line with flags
- **Port Detector** — watches output / IPC for DevToolsActivePort or uses explicit port
- **Validator** — validates path and port availability
- **Reporter** — returns success/failure with structured output

---

## 3. Functional Requirements

### 3.1 Feature: Reliable Kiro launch with custom userDataDir

**Source:** BRD Story 1 — As a QA Engineer, I want ide_launch to successfully launch Kiro with custom userDataDir without DevToolsActivePort timeout so that I can perform manual UAT for SA4E-370

#### 3.1.1 Description

Ensure ide_launch can launch Kiro IDE when userDataDir is custom/isolated and reliably detect DevTools readiness without false timeout errors. If detection by auto-exposure is too slow, fallback to explicit remote debugging port or extended timeout logic.

#### 3.1.2 Use Case

**Use Case ID:** UC-001
**Actor:** QA Engineer
**Preconditions:** Kiro IDE installed, ide_launch tool available, userDataDir path accessible or default
**Postconditions:** Kiro process running, DevTools port reported, ide_launch returns success

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | QA Engineer | | Invokes ide_launch --ide kirol --userDataDir <path> [--remoteDebuggingPort <port>] [--timeout <s>] |
| 2 | | ide_launch | Validates userDataDir accessibility and port availability |
| 3 | | ide_launch | Starts Kiro process with appropriate flags including custom userDataDir |
| 4 | | ide_launch | Monitors process output for DevToolsActivePort or uses explicit port |
| 5 | | ide_launch | Returns success with port info within timeout window |
| 6 | QA Engineer | | Proceeds with manual UAT |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | remoteDebuggingPort provided | Skip auto-detection, assume port is exposed; verify binding before return |
| AF-2 | Port not detected within base 30s | Extend to configurable timeout 60s and retry detection |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | userDataDir not accessible | Return error 'UserDataDir not accessible' |
| EF-2 | Port conflict | Return error 'Remote debugging port already in use' |
| EF-3 | Kiro fails to start | Return error with process exit code and logs |

#### 3.1.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-1 | ide_launch must successfully launch Kiro IDE when userDataDir is custom/isolated | BRD 2.3 Story 1 |
| BR-2 | DevToolsActivePort detection must succeed consistently or be bypassed via explicit remote debugging port | BRD 2.3 Story 1 |
| BR-3 | Launch failure due to 'IDE did not expose DevToolsActivePort within 30s' must be eliminated for Kiro | BRD 2.3 Story 1 |
| BR-4 | userDataDir path must be accessible and writable before launch | BRD 2.3 Story 1 Validation |
| BR-5 | remoteDebuggingPort must be within TCP range 1024-65535 and not in use | BRD 2.3 Story 1 Validation |
| BR-6 | Existing launches without custom userDataDir continue to work unchanged | BRD 2.3 Story 1 AC4 |

#### 3.1.4 Data Specifications

**Input Data:**

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| userDataDir | string | No | Path exists and writable | Custom user data directory for isolated Kiro launch |
| remoteDebuggingPort | integer | No | 1024-65535, not in use | Explicit port to force remote debugging |
| timeoutSeconds | integer | No | >0, max 300 | Configurable timeout for DevTools port detection |
| ide | string | Yes | Enum: kirol | Target IDE identifier |

**Output Data:**

| Field | Type | Description |
|-------|------|-------------|
| launchSuccess | boolean | True if IDE launched and DevTools ready |
| devToolsPort | integer | Detected or configured DevTools port |
| errorMessage | string | Human readable error on failure |
| processPid | integer | PID of launched Kiro process |

#### 3.1.5 UI Specifications

N/A – CLI tool. No UI.

#### 3.1.6 API Contract (Functional View)

**Endpoint:** `ide_launch --ide kirol [--userDataDir <path>] [--remoteDebuggingPort <port>] [--timeout <s>]`
**Purpose:** Launch Kiro IDE and wait for DevTools readiness

**Input Parameters:**

| Parameter | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| userDataDir | string | N | BR-4 | Custom data directory |
| remoteDebuggingPort | integer | N | BR-5 | Explicit debugging port |
| timeoutSeconds | integer | N | - | Detection timeout |

**Output Data:**

| Field | Type | Description |
|-------|------|-------------|
| launchSuccess | boolean | Success flag |
| devToolsPort | integer | Port number |
| errorMessage | string | Error text |

**Business Error Scenarios:**

| Scenario | User Message | Trigger Condition |
|----------|-------------|-------------------|
| Invalid userDataDir | UserDataDir not accessible | Path not exists or not writable |
| Port conflict | Remote debugging port already in use | Port bound by another process |
| Timeout | IDE did not expose DevToolsActivePort within <timeout>s | Port not detected within timeout |

---

### 3.2 Feature: Explicit remote debugging port support

**Source:** BRD Story 2 — As a Developer, I want ide_launch to support explicit --remote-debugging-port configuration for Kiro so that DevTools port exposure is deterministic

#### 3.2.1 Description

Allow ide_launch to accept remoteDebuggingPort parameter and forward --remote-debugging-port flag to Kiro process, making DevTools port exposure deterministic and independent of auto-exposure timing.

#### 3.2.2 Use Case

**Use Case ID:** UC-002
**Actor:** Developer
**Preconditions:** ide_launch supports remoteDebuggingPort flag
**Postconditions:** Kiro launched with explicit debugging port

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Developer | | Invokes ide_launch with --remoteDebuggingPort 9222 |
| 2 | | ide_launch | Validates port availability |
| 3 | | ide_launch | Launches Kiro with --remote-debugging-port=9222 |
| 4 | | ide_launch | Returns success with port 9222 |
| 5 | Developer | | Connects debugger to known port |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | Port unavailable | Return error and suggest alternative port |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | Kiro does not accept flag | Fallback to detection mode with warning |

#### 3.2.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-7 | ide_launch accepts remoteDebuggingPort parameter and forwards --remote-debugging-port=<port> to Kiro command line | BRD 2.3 Story 2 AC1 |
| BR-8 | Launch succeeds with remote debugging port explicitly set regardless of IDE auto-exposure timing | BRD 2.3 Story 2 AC2 |
| BR-9 | Documentation updated to reflect new parameter | BRD 2.3 Story 2 AC3 |

#### 3.2.4 Data Specifications

**Input Data:**

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| remoteDebuggingPort | integer | Yes for this feature | 1024-65535, not in use | Port to forward |

**Output Data:** Same as UC-001

---

## 4. Data Model

> Note: No persistent data store is introduced. Configuration parameters are transient.

### 4.1 Entity Relationship Diagram

![ER Diagram](diagrams/er-diagram.png)

### 4.2 Logical Entities

No persistent entities. Launch request parameters are transient.

---

## 5. Integration Specifications

### 5.1 External System: Kiro IDE

| Attribute | Value |
|-----------|-------|
| Purpose | IDE to be launched and monitored for DevTools readiness |
| Direction | Outbound |
| Data Format | CLI arguments, stdout/stderr |
| Frequency | On-demand |

**Data Exchange:**

| Our Data | External Data | Direction | Business Rule |
|----------|--------------|-----------|---------------|
| userDataDir | --user-data-dir | Send | BR-4 |
| remoteDebuggingPort | --remote-debugging-port | Send | BR-7 |
| Process stdout | DevToolsActivePort | Receive | BR-2 |

---

## 6. Processing Logic

### 6.1 IDE Launch with DevTools Detection

**Trigger:** CLI invocation of ide_launch for Kiro
**Schedule:** On-demand
**Input:** userDataDir, remoteDebuggingPort, timeoutSeconds
**Output:** launchSuccess, devToolsPort, errorMessage

**Processing Steps:**

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Parse CLI arguments | Invalid args -> usage message |
| 2 | Validate userDataDir accessibility | Not accessible -> error 'UserDataDir not accessible' |
| 3 | Validate remoteDebuggingPort availability | In use -> error 'Remote debugging port already in use' |
| 4 | Build Kiro command line with flags | Build failure -> error |
| 5 | Start Kiro process | Start failure -> error with exit code |
| 6 | If remoteDebuggingPort set, assume port ready after process start, verify binding | Binding fails -> error |
| 7 | Else monitor output for DevToolsActivePort up to timeoutSeconds | Timeout -> error 'IDE did not expose DevToolsActivePort within Xs' |
| 8 | Return success with port info | - |

**Activity Diagram:**

![Process Flow - IDE Launch](diagrams/process-ide-launch.png)

---

## 7. Security Requirements

### 7.1 Authentication & Authorization

| Role | Permissions | Screens/Features |
|------|-------------|-------------------|
| QA Engineer | Execute ide_launch | CLI |
| Developer | Configure and execute ide_launch | CLI |

### 7.2 Data Sensitivity Classification

| Data Type | Classification | Business Requirement |
|-----------|---------------|---------------------|
| userDataDir path | Internal | Test isolation |
| Remote debugging port | Internal | Should not be exposed externally beyond test environment |

### 7.3 Audit Trail

| Event | Logged Fields | Retention | Business Reason |
|-------|--------------|-----------|-----------------|
| Launch attempt | user, ide, userDataDir, port, success | 30 days | Troubleshooting |

---

## 8. Non-Functional Requirements

| Category | Business Requirement | Acceptance Criteria |
|----------|---------------------|---------------------|
| Performance | Launch detection | DevToolsActivePort detection completes within 60s for custom userDataDir |
| Security | Port exposure | Remote debugging port not exposed externally beyond test environment |
| Availability | Reliability | ide_launch success rate for Kiro with custom userDataDir > 95% |
| Scalability | N/A | No specific requirements |

---

## 9. Error Handling (User-Facing)

### 9.1 Error Scenarios

| Scenario | Severity | User Message | Expected Behavior |
|----------|----------|-------------|-------------------|
| UserDataDir not accessible | Critical | UserDataDir not accessible | Abort launch, show path |
| Port already in use | Warning | Remote debugging port already in use | Abort launch, suggest alternative |
| DevTools timeout | Critical | IDE did not expose DevToolsActivePort within Xs | Abort launch, provide logs |
| Kiro start failure | Critical | Failed to start Kiro IDE | Abort launch, show exit code |

### 9.2 Notification Requirements

| Event | Who is Notified | Channel | Timing |
|-------|----------------|---------|--------|
| Launch failure | Invoking user | CLI stdout/stderr | Immediate |

---

## 10. Testing Considerations

### 10.1 Test Scenarios

| ID | Scenario | Input | Expected Output | Priority |
|----|----------|-------|-----------------|----------|
| TC-001 | Launch Kiro with custom userDataDir | userDataDir=C:\temp\kiro-uat | launchSuccess=true, port returned | High |
| TC-002 | Launch with explicit remoteDebuggingPort | remoteDebuggingPort=9222 | Port forwarded, launchSuccess=true | High |
| TC-003 | Invalid userDataDir | userDataDir=invalid path | Error 'UserDataDir not accessible' | Medium |
| TC-004 | Port conflict | remoteDebuggingPort already bound | Error 'Remote debugging port already in use' | Medium |
| TC-005 | Timeout scenario | Slow IDE start, timeout 10s | Timeout error after 10s | Medium |
| TC-006 | Default launch without custom dir | No userDataDir | Launch succeeds unchanged | High |

---

## 11. Appendix

### Diagrams

| Diagram | File |
|---------|------|
| System Context | [system-context.png](diagrams/system-context.png) |
| Process Flow - IDE Launch | [process-ide-launch.png](diagrams/process-ide-launch.png) |

### Change Log from BRD

- Functional specification adds explicit use cases UC-001 and UC-002 with main/alternative/exception flows
- Business rules formalized as BR-1 to BR-9
- Processing logic for IDE launch with DevTools detection defined in Section 6
- API contract defined at functional level for CLI parameters
- No persistent data model required; parameters are transient
