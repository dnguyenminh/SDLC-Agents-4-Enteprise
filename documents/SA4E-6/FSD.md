# Functional Specification Document (FSD)

## SDLC Agents 4 Enterprise — SA4E-6: Sandbox Execution (MCP Server Bridge)

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-6 |
| Title | Sandbox Execution (MCP Server Bridge) |
| Author | BA Agent + TA Agent |
| Version | 1.0 |
| Date | 2026-07-03 |
| Status | Draft |
| Related BRD | BRD-v1-SA4E-6.docx |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | BA Agent - Business Analyst | Create FSD draft (business sections) |
| Technical Reviewer | TA Agent - Technical Analyst | Enrich with API contracts, pseudocode |
| Peer Reviewer | SM Agent - Scrum Master | Review document |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-03 | BA Agent | Initiate document - FSD draft from BRD |
| 1.1 | 2026-07-03 | TA Agent | Technical enrichment - API contracts, pseudocode, NFR targets |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | [ ] I agree and confirm all criteria on this FSD as expected requirements |
| | [ ] I agree and confirm all criteria on this FSD as expected requirements |

---

## 1. Introduction

### 1.1 Purpose

This FSD specifies the functional behavior of the Sandbox Execution module for SDLC Agents 4 Enterprise. It defines how AI agents interact with isolated execution environments (Docker containers or local processes) through the MCP Server Bridge, enabling real code execution, testing, and validation.

### 1.2 Scope

The Sandbox Execution module integrates into the existing Backend MCP Server (SA4E-1) as a new module in the ModuleRegistry. It exposes MCP tools that AI agents (DEV, QA) can discover via `find_tools` and invoke via `execute_dynamic_tool`.

**In Scope:**
- Local execution mode (direct host execution)
- Docker execution mode (isolated containers via dockerode)
- Session management (create, reuse, destroy, TTL-based cleanup)
- Resource limits (memory, CPU, disk, process count)
- Workspace file mounting
- Output streaming (stdout/stderr)
- Automatic container cleanup

**Out of Scope:**
- Kubernetes execution mode (Phase 2)
- Remote/cloud container orchestration
- Multi-tenant sandbox sharing
- GPU-accelerated containers
- Inter-container networking

### 1.3 Definitions and Acronyms

| Term | Definition |
|------|------------|
| MCP | Model Context Protocol - communication protocol between AI agents and tools |
| Sandbox | Isolated execution environment (container or restricted process) |
| dockerode | Node.js SDK for Docker Engine API |
| Session | Persistent sandbox instance maintaining state between commands |
| TTL | Time To Live - duration before automatic cleanup of idle sessions |
| DeerFlow | ByteDance open-source AI agent framework (reference architecture) |
| MCP Server Bridge | Component translating MCP tool calls into sandbox execution commands |
| Reaper | Background process monitoring session lifetimes and cleaning up expired sessions |
| OOM | Out Of Memory - kernel kills process exceeding memory limit |

### 1.4 References

| Document | Location |
|----------|----------|
| BRD | BRD-v1-SA4E-6.docx |
| SA4E Architecture Report | .code-intel/SA4E-ARCHITECTURE.md |
| DeerFlow Sandbox Reference | https://github.com/bytedance/deer-flow |
| Docker Engine API | https://docs.docker.com/engine/api/ |
| dockerode Documentation | https://github.com/apocas/dockerode |
| MCP Protocol Specification | https://modelcontextprotocol.io/ |
| Backend MCP Server (SA4E-1) | SA4E-1 ticket documentation |

---

## 2. System Overview

### 2.1 System Context Diagram

![System Context](diagrams/system-context.png)

The Sandbox Execution module operates within the Backend MCP Server architecture:

- **AI Agents** (DEV, QA) discover sandbox tools via `find_tools` and invoke them via `execute_dynamic_tool`
- **Backend MCP Server** routes tool calls to the SandboxModule via ModuleRegistry
- **SandboxModule** manages execution backends (Local executor, Docker executor)
- **Docker Engine** provides container lifecycle management via dockerode
- **Host Filesystem** provides workspace files for bind-mounting

### 2.2 System Architecture

The SandboxModule follows the existing ModuleRegistry plugin pattern:

1. **SandboxModule** implements `IModule` interface (initialize, shutdown, getToolHandlers, getToolDefinitions)
2. **ExecutionManager** orchestrates session lifecycle and routes commands to appropriate executor
3. **LocalExecutor** handles direct host execution via Node.js child_process
4. **DockerExecutor** handles container-based execution via dockerode
5. **SessionStore** manages active sessions (metadata, TTL tracking, resource usage)
6. **Reaper** background timer cleans up expired sessions

---

## 3. Functional Requirements

### 3.1 Feature: Sandbox Session Management

**Source:** BRD Stories 5, 6, 10

#### 3.1.1 Description

The system manages sandbox sessions - persistent execution environments that maintain state between commands. Sessions can be created with specific configurations (base image, mounts, resource limits), reused for multiple commands, and destroyed explicitly or automatically via TTL expiry.

#### 3.1.2 Use Case: UC-01 Create Sandbox Session

**Use Case ID:** UC-01
**Actor:** AI Agent (DEV/QA)
**Preconditions:** Backend MCP Server running; Docker available (for Docker mode)
**Postconditions:** New session created with unique ID; container running (Docker mode)

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Agent calls sandbox_session with action=create | | Agent requests new session |
| 2 | | Validates parameters | System checks baseImage, mounts, resources |
| 3 | | Determines execution mode | Reads config or request override |
| 4 | | Creates executor instance | Local: spawn shell; Docker: create container |
| 5 | | Applies resource limits | Docker: memory, CPU, disk, pids |
| 6 | | Mounts workspace (if requested) | Bind-mount with exclusion filtering |
| 7 | | Registers session in SessionStore | Assigns sessionId, sets TTL timer |
| 8 | | Returns session metadata | sessionId, mode, status, createdAt |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-01.1 | Docker unavailable + fallback enabled | System logs warning, creates Local session instead |
| AF-01.2 | Custom baseImage specified | System pulls image if not available locally before creating container |
| AF-01.3 | Max sessions reached (5) | System returns error suggesting destroy idle sessions |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-01.1 | Docker daemon not running | Return error: "Docker is not available. Start Docker Desktop or switch to local mode." |
| EF-01.2 | Base image pull fails (network) | Return error: "Cannot pull image {image}. Check network connectivity." |
| EF-01.3 | Resource allocation fails | Return error with specific resource constraint that failed |

#### 3.1.3 Use Case: UC-02 List Active Sessions

**Use Case ID:** UC-02
**Actor:** AI Agent
**Preconditions:** Backend running
**Postconditions:** Agent receives list of all active sessions

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Agent calls sandbox_session with action=list | | Agent requests session list |
| 2 | | Queries SessionStore | Retrieves all active sessions |
| 3 | | Enriches with runtime data | Gets resource usage per session (Docker stats) |
| 4 | | Returns session list | Array of session metadata objects |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-02.1 | No active sessions | Return empty array with message |

#### 3.1.4 Use Case: UC-03 Destroy Session

**Use Case ID:** UC-03
**Actor:** AI Agent
**Preconditions:** Session exists with given sessionId
**Postconditions:** Container stopped and removed; session deregistered

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Agent calls sandbox_session with action=destroy, sessionId | | Agent requests session destruction |
| 2 | | Validates sessionId exists | Lookup in SessionStore |
| 3 | | Stops execution environment | Docker: stop + remove container; Local: kill process |
| 4 | | Cleans up resources | Remove temp files, cancel TTL timer |
| 5 | | Deregisters session | Remove from SessionStore |
| 6 | | Returns confirmation | success: true, destroyedAt timestamp |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-03.1 | Session not found | Return error: "Session {id} not found or already destroyed." |
| EF-03.2 | Container removal fails | Force-remove container, log error, still deregister session |

---

### 3.2 Feature: Command Execution

**Source:** BRD Stories 1, 3, 9

#### 3.2.1 Description

The core feature - agents execute arbitrary bash commands inside sandbox sessions. Commands run with timeout protection, output streaming, and structured result reporting.

#### 3.2.2 Use Case: UC-04 Execute Bash Command

**Use Case ID:** UC-04
**Actor:** AI Agent (DEV/QA)
**Preconditions:** Active session exists (or will be auto-created)
**Postconditions:** Command executed; result returned with exit code, stdout, stderr

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Agent calls sandbox_exec with command, sessionId | | Agent submits command |
| 2 | | Validates input (command not empty, timeout valid) | Input validation |
| 3 | | Resolves session (existing or auto-create) | Lookup or create session |
| 4 | | Sets up timeout timer | Default 300s, max 600s |
| 5 | | Executes command in session environment | Docker: docker exec; Local: child_process.spawn |
| 6 | | Captures stdout/stderr streams | Buffer with size limit (1MB per stream) |
| 7 | | Waits for completion or timeout | Process exit or timeout trigger |
| 8 | | Returns structured result | exitCode, stdout, stderr, duration, truncated flag |
| 9 | | Updates session lastActivity timestamp | Resets TTL countdown |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-04.1 | No sessionId provided | Auto-create ephemeral session with defaults, execute, return sessionId |
| AF-04.2 | Output exceeds 1MB | Truncate to last 1MB, set truncated=true |
| AF-04.3 | Binary output detected | Replace with "[binary output, N bytes]" indicator |
| AF-04.4 | workdir specified | Execute in specified working directory within container |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-04.1 | Command timeout | Kill process (SIGKILL), return partial output + exitCode=-1 + error="timeout" |
| EF-04.2 | Container OOM killed | Detect exit code 137, return error="memory limit exceeded (512MB)" |
| EF-04.3 | Session not found | Return error: "Session {id} not found. Create a new session first." |
| EF-04.4 | Container not running | Detect stopped state, return error with suggestion to create new session |

#### 3.2.3 Use Case: UC-05 Run Code File

**Use Case ID:** UC-05
**Actor:** AI Agent
**Preconditions:** Session exists; file exists in container filesystem
**Postconditions:** Code executed with appropriate runtime; result returned

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Agent calls sandbox_run with file, runtime, sessionId | | Agent requests code execution |
| 2 | | Validates file exists in container | Check via exec: test -f {file} |
| 3 | | Maps runtime to execution command | node, python, tsx, java, sh |
| 4 | | Constructs full command | e.g., `npx tsx /workspace/src/main.ts` |
| 5 | | Delegates to sandbox_exec internally | Same execution flow as UC-04 |
| 6 | | Returns result | exitCode, stdout (program output), stderr (compile errors) |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-05.1 | TypeScript file | Use `npx tsx` for direct execution without separate compile step |
| AF-05.2 | Java file | Use `gradle run` or `javac + java` based on project structure |
| AF-05.3 | Runtime arguments provided | Append args to execution command |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-05.1 | File not found | Return error: "File not found: {file}" |
| EF-05.2 | Runtime not installed | Return error: "Runtime {runtime} not available. Use sandbox_install to install it." |
| EF-05.3 | Compilation error | Return stderr with line numbers, exitCode != 0 |

---

### 3.3 Feature: Package Installation

**Source:** BRD Story 2

#### 3.3.1 Description

Agents can install packages (npm, pip, apt) in sandbox sessions. Installed packages persist within the session for subsequent commands.

#### 3.3.2 Use Case: UC-06 Install Packages

**Use Case ID:** UC-06
**Actor:** AI Agent
**Preconditions:** Active session exists
**Postconditions:** Packages installed and available for use in session

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Agent calls sandbox_install with manager, packages, sessionId | | Install request |
| 2 | | Validates package manager supported | npm, pip, apt |
| 3 | | Constructs install command | npm install {packages}; pip install {packages}; apt-get install -y {packages} |
| 4 | | Applies additional flags | e.g., --save-dev for npm |
| 5 | | Delegates to sandbox_exec internally | Execute install command |
| 6 | | Returns install result | exitCode, stdout (install progress), stderr (errors) |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-06.1 | Multiple packages | Single install command with all packages |
| AF-06.2 | apt manager | Prepend `apt-get update` if first apt usage in session |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-06.1 | Package not found | Return package manager error output verbatim |
| EF-06.2 | Network unavailable (no-network container) | Return error: "Network access required for package installation. Create session with network=true." |
| EF-06.3 | Disk space exhausted | Return error: "Disk limit exceeded. Increase session disk limit or clean up." |

---

### 3.4 Feature: Test Suite Execution

**Source:** BRD Story 4

#### 3.4.1 Description

Specialized tool for running test suites with structured result parsing. Supports major test frameworks and returns results in a machine-readable format agents can interpret.

#### 3.4.2 Use Case: UC-07 Run Test Suite

**Use Case ID:** UC-07
**Actor:** AI Agent (QA)
**Preconditions:** Session exists; test framework installed; test files present
**Postconditions:** Test results returned in structured format

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Agent calls sandbox_test with framework, sessionId | | Test execution request |
| 2 | | Maps framework to test command | vitest run, jest, pytest, ./gradlew test |
| 3 | | Applies test path filter (if specified) | --testPathPattern for jest, -k for pytest |
| 4 | | Applies coverage flag | --coverage for vitest/jest, --cov for pytest |
| 5 | | Applies config file override | --config {configFile} |
| 6 | | Executes test command via sandbox_exec | Delegates to UC-04 |
| 7 | | Parses test output into structured format | Regex-based parsing of framework output |
| 8 | | Returns structured result | status, total, passed, failed, skipped, failures[], coverage |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-07.1 | Specific test file | Add path to test command |
| AF-07.2 | Coverage requested | Add coverage flag, parse coverage summary |
| AF-07.3 | Custom config file | Override default config path |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-07.1 | Framework not installed | Return error with suggestion: "Install {framework} first: sandbox_install(npm, [{framework}])" |
| EF-07.2 | No test files found | Return result with total=0, message="No test files matching pattern" |
| EF-07.3 | Test process crashes (not test failure) | Return error with crash details vs structured test failure |

---

### 3.5 Feature: Resource Management

**Source:** BRD Stories 7, 8

#### 3.5.1 Description

Each sandbox session operates within configurable resource constraints. Resource limits prevent runaway processes from impacting host system stability.

#### 3.5.2 Use Case: UC-08 Apply Resource Limits

**Use Case ID:** UC-08
**Actor:** System (automatic on session creation)
**Preconditions:** Docker mode; session being created
**Postconditions:** Container running with enforced resource limits

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | | Receives resource config from session create request | Defaults or custom |
| 2 | | Maps to Docker HostConfig | Memory, CpuQuota, PidsLimit, DiskQuota |
| 3 | | Applies security profile | Drop capabilities, seccomp, no-new-privileges |
| 4 | | Creates container with limits | dockerode createContainer with HostConfig |
| 5 | | Starts container | dockerode container.start() |
| 6 | | Verifies limits applied | Inspect container for resource config |

**Business Rules:**

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-01 | Default memory limit: 512MB per container | BRD Story 7 |
| BR-02 | Default CPU limit: 1 core (CpuQuota=100000) | BRD Story 7 |
| BR-03 | Default disk limit: 1GB per container | BRD Story 7 |
| BR-04 | Default max processes: 100 (PidsLimit) | BRD Story 7 |
| BR-05 | Max concurrent sessions: 5 (configurable) | BRD NFR |
| BR-06 | Default session TTL: 30 minutes of inactivity | BRD Story 6 |
| BR-07 | Network isolation by default (no network unless explicitly enabled) | BRD NFR |
| BR-08 | Sensitive files (.env, .git/credentials, private keys) excluded from mounts by default | BRD Story 8 |
| BR-09 | Mount mode defaults to read-write (configurable to read-only) | BRD Story 8 |
| BR-10 | Output stream max size: 1MB per stream (stdout/stderr) | BRD Story 9 |
| BR-11 | Command timeout default: 300s, max: 600s | BRD Story 1 |
| BR-12 | Containers are non-privileged, all capabilities dropped except minimal set | BRD Risk mitigation |

#### 3.5.3 Use Case: UC-09 Mount Workspace Files

**Use Case ID:** UC-09
**Actor:** AI Agent (via session creation)
**Preconditions:** Docker mode; workspace path exists
**Postconditions:** Workspace directory accessible inside container

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Agent specifies mounts in session create | | Mount configuration provided |
| 2 | | Validates source paths exist | Check host filesystem |
| 3 | | Applies exclusion filter | Remove .env, .git/credentials, *.pem, *.key from mount |
| 4 | | Configures bind mount | Source: host path, Target: container path, Mode: rw or ro |
| 5 | | Attaches mount to container config | Added to HostConfig.Binds |
| 6 | | Returns mount info in session metadata | List of active mounts |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-09.1 | Source path not found | Return error: "Mount source path not found: {path}" |
| EF-09.2 | Permission denied on host path | Return error: "Cannot access path: {path}. Check permissions." |

---

### 3.6 Feature: Automatic Cleanup

**Source:** BRD Story 10

#### 3.6.1 Description

Background reaper process ensures containers do not accumulate indefinitely. Handles idle session cleanup, graceful shutdown, and orphan recovery.

#### 3.6.2 Use Case: UC-10 TTL-Based Session Cleanup

**Use Case ID:** UC-10
**Actor:** System (Reaper timer)
**Preconditions:** Sessions exist in SessionStore
**Postconditions:** Expired sessions destroyed; resources freed

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | | Reaper timer fires (every 60 seconds) | Periodic check |
| 2 | | Scans SessionStore for expired sessions | lastActivity + TTL < now |
| 3 | | For each expired session: destroy | Same flow as UC-03 |
| 4 | | Logs cleanup activity | Session ID, TTL, idle duration |

#### 3.6.3 Use Case: UC-11 Orphan Container Recovery

**Use Case ID:** UC-11
**Actor:** System (on startup)
**Preconditions:** Backend starting up
**Postconditions:** Any orphaned containers from previous crash are removed

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | | Backend starts SandboxModule initialization | Module lifecycle |
| 2 | | Lists all Docker containers with label `sa4e-sandbox=true` | Docker API query |
| 3 | | Compares with SessionStore (empty on fresh start) | Identify orphans |
| 4 | | Stops and removes orphaned containers | docker stop + rm |
| 5 | | Logs recovery activity | Count of orphans cleaned |

#### 3.6.4 Use Case: UC-12 Graceful Shutdown

**Use Case ID:** UC-12
**Actor:** System (on SIGTERM/SIGINT)
**Preconditions:** Backend receiving shutdown signal
**Postconditions:** All active containers stopped gracefully

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | | Shutdown signal received | Process lifecycle |
| 2 | | SandboxModule.shutdown() called by ModuleRegistry | Module lifecycle hook |
| 3 | | Stops reaper timer | Cancel interval |
| 4 | | Iterates all active sessions | From SessionStore |
| 5 | | Stops each container (10s grace period) | docker stop with timeout |
| 6 | | Removes containers | docker rm |
| 7 | | Logs shutdown complete | Session count cleaned |

---

### 3.7 Feature: Execution Mode Selection

**Source:** BRD Story 5

#### 3.7.1 Description

Developers choose between Local and Docker execution modes. Local mode offers speed with no isolation; Docker mode offers full isolation with slight startup overhead.

#### 3.7.2 Use Case: UC-13 Mode Selection and Fallback

**Use Case ID:** UC-13
**Actor:** Developer (via configuration) / AI Agent (via request override)
**Preconditions:** Backend running
**Postconditions:** Execution routed to correct backend

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | | Reads default mode from config | `sandbox.defaultMode: docker` |
| 2 | Agent request includes mode override | | Optional per-request override |
| 3 | | Resolves effective mode | Override > config default |
| 4 | | Validates mode available | Docker: check daemon; Local: always available |
| 5 | | Routes to appropriate executor | DockerExecutor or LocalExecutor |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-13.1 | Docker unavailable + fallback=true (config) | Log warning, route to LocalExecutor |
| AF-13.2 | Docker unavailable + fallback=false | Return error, do not fall back |

---

## 4. Data Model

### 4.1 Logical Entities

#### Entity: Session

| Attribute | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| sessionId | string (UUID v4) | Yes | Auto-generated | Unique session identifier |
| mode | enum(local, docker) | Yes | BR-07 | Execution mode |
| status | enum(creating, running, stopping, destroyed) | Yes | | Current lifecycle state |
| containerId | string | Docker only | | Docker container ID |
| baseImage | string | Docker only | Default: node:20-slim | Docker image used |
| mounts | Mount[] | No | BR-08, BR-09 | Workspace mount configurations |
| resources | ResourceLimits | Yes | BR-01 to BR-04 | Resource constraints |
| networkEnabled | boolean | Yes | BR-07 | Default: false |
| createdAt | timestamp | Yes | | Session creation time |
| lastActivity | timestamp | Yes | BR-06 | Last command execution time |
| ttl | number (seconds) | Yes | BR-06 | Default: 1800 (30 min) |
| env | Record<string, string> | No | | Environment variables set |

#### Entity: Mount

| Attribute | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| source | string | Yes | | Host filesystem path |
| target | string | Yes | | Container filesystem path |
| readOnly | boolean | No | BR-09 | Default: false (read-write) |
| excludePatterns | string[] | No | BR-08 | Patterns to exclude from mount |

#### Entity: ResourceLimits

| Attribute | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| memory | string | No | BR-01 | Default: "512m" |
| cpu | string | No | BR-02 | Default: "1.0" (1 core) |
| disk | string | No | BR-03 | Default: "1g" |
| pidsLimit | number | No | BR-04 | Default: 100 |

#### Entity: ExecutionResult

| Attribute | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| exitCode | number | Yes | | Process exit code (0=success) |
| stdout | string | Yes | BR-10 | Standard output (max 1MB) |
| stderr | string | Yes | BR-10 | Standard error (max 1MB) |
| duration | number | Yes | | Execution time in milliseconds |
| truncated | boolean | Yes | BR-10 | Whether output was truncated |
| sessionId | string | Yes | | Session used for execution |
| timedOut | boolean | No | BR-11 | Whether command timed out |

#### Entity: TestResult (extends ExecutionResult)

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| status | enum(success, failure, error) | Yes | Overall test status |
| total | number | Yes | Total test count |
| passed | number | Yes | Passed test count |
| failed | number | Yes | Failed test count |
| skipped | number | Yes | Skipped test count |
| failures | TestFailure[] | No | Details of failed tests |
| coverage | CoverageSummary | No | Coverage report (if requested) |

**Relationships:**

| From Entity | To Entity | Cardinality | Description |
|-------------|-----------|-------------|-------------|
| Session | Mount | 1:N | Session can have multiple workspace mounts |
| Session | ResourceLimits | 1:1 | Each session has one resource config |
| Session | ExecutionResult | 1:N | Session produces multiple execution results |

---

## 5. Integration Specifications

### 5.1 External System: Docker Engine

| Attribute | Value |
|-----------|-------|
| Purpose | Provide isolated container runtime for sandbox execution |
| Direction | Outbound (Backend -> Docker) |
| Protocol | Unix socket (/var/run/docker.sock) or TCP (tcp://localhost:2375) |
| SDK | dockerode (Node.js) |
| Frequency | On-demand (session create, exec, destroy) |

**Data Exchange:**

| Our Data | Docker API | Direction | Business Rule |
|----------|-----------|-----------|---------------|
| baseImage | Image reference | Send (pull/create) | Default node:20-slim |
| resources | HostConfig (Memory, CpuQuota, PidsLimit) | Send (create) | BR-01 to BR-04 |
| mounts | HostConfig.Binds | Send (create) | BR-08, BR-09 |
| command | Cmd in exec | Send (exec) | Command execution |
| stdout/stderr | Stream attach | Receive (exec) | BR-10 |
| container status | Container.inspect | Receive (status check) | Health monitoring |

### 5.2 External System: Host Filesystem

| Attribute | Value |
|-----------|-------|
| Purpose | Workspace file access for agents |
| Direction | Bidirectional (read workspace, write results) |
| Protocol | Direct filesystem (Node.js fs) |
| Frequency | On session create (mount), on exec (local mode) |

### 5.3 Internal System: Backend ModuleRegistry

| Attribute | Value |
|-----------|-------|
| Purpose | Plugin registration and tool routing |
| Direction | Bidirectional |
| Protocol | In-process TypeScript interface (IModule) |
| Frequency | On startup (register), on tool call (handle) |

**Integration Contract:**

| Interface Method | SandboxModule Implementation |
|-----------------|------------------------------|
| initialize() | Connect to Docker, start reaper, recover orphans |
| shutdown() | Stop reaper, destroy all sessions, disconnect Docker |
| getToolDefinitions() | Return 5 tool schemas (session, exec, run, install, test) |
| getToolHandlers() | Return handler map for each tool |

### 5.4 Internal System: ONNX Embeddings (Tool Discovery)

| Attribute | Value |
|-----------|-------|
| Purpose | Semantic tool discovery via find_tools |
| Direction | Outbound (tools registered with embeddings) |
| Protocol | SQLite mcp_tools table with vector column |
| Frequency | On module initialization (register tools) |

---

## 6. Processing Logic

### 6.1 Session Lifecycle Management

**Trigger:** MCP tool call to sandbox_session
**Input:** action (create/list/destroy), optional configuration
**Output:** Session metadata or list

**State Machine:**

`creating` -> `running` -> `stopping` -> `destroyed`

| Transition | Trigger | Action |
|-----------|---------|--------|
| -> creating | sandbox_session(create) | Validate config, allocate resources |
| creating -> running | Container started successfully | Register in SessionStore, start TTL |
| running -> stopping | sandbox_session(destroy) OR TTL expired | Stop container gracefully |
| stopping -> destroyed | Container removed | Deregister, free resources |
| creating -> destroyed | Creation failed | Cleanup partial resources |

![Session State Diagram](diagrams/state-session-lifecycle.png)

### 6.2 Command Execution Pipeline

**Trigger:** MCP tool call to sandbox_exec, sandbox_run, sandbox_install, sandbox_test
**Input:** Command string + session reference
**Output:** ExecutionResult

**Processing Steps:**

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Validate input parameters | Return validation error immediately |
| 2 | Resolve session (lookup or auto-create) | Return session not found error |
| 3 | Check session status == running | Return session not running error |
| 4 | Start timeout timer | Timer fires -> kill process |
| 5 | Execute command in environment | Capture spawn errors |
| 6 | Stream stdout/stderr with size check | Truncate at 1MB |
| 7 | Wait for exit or timeout | Handle both cases |
| 8 | Build ExecutionResult | Include all metadata |
| 9 | Update session lastActivity | Reset TTL countdown |
| 10 | Return result to agent | Structured response |

**Pseudocode:**

`	ypescript
async function executeCommand(params: ExecParams): Promise<ExecutionResult> {
  // Step 1: Validate
  validateExecParams(params);
  
  // Step 2: Resolve session
  const session = params.sessionId 
    ? sessionStore.get(params.sessionId)
    : await createEphemeralSession();
  if (!session) throw new SessionNotFoundError(params.sessionId);
  
  // Step 3: Check status
  if (session.status !== 'running') throw new SessionNotRunningError(session.sessionId);
  
  // Step 4-7: Execute with timeout
  const timeout = Math.min(params.timeout || 300, 600) * 1000;
  const executor = session.mode === 'docker' ? dockerExecutor : localExecutor;
  
  const result = await withTimeout(
    executor.exec(session, params.command, { 
      workdir: params.workdir,
      env: params.env 
    }),
    timeout
  );
  
  // Step 8: Build result
  const execResult: ExecutionResult = {
    exitCode: result.timedOut ? -1 : result.exitCode,
    stdout: truncateOutput(result.stdout, MAX_OUTPUT_SIZE),
    stderr: truncateOutput(result.stderr, MAX_OUTPUT_SIZE),
    duration: result.duration,
    truncated: result.stdout.length > MAX_OUTPUT_SIZE || result.stderr.length > MAX_OUTPUT_SIZE,
    sessionId: session.sessionId,
    timedOut: result.timedOut || false
  };
  
  // Step 9: Update activity
  sessionStore.touch(session.sessionId);
  
  return execResult;
}
`

### 6.3 Reaper Process

**Trigger:** Interval timer (every 60 seconds)
**Input:** Current time + SessionStore entries
**Output:** Destroyed expired sessions

**Pseudocode:**

`	ypescript
function reaperTick(): void {
  const now = Date.now();
  for (const session of sessionStore.getAll()) {
    const idleMs = now - session.lastActivity.getTime();
    if (idleMs > session.ttl * 1000) {
      logger.info({ sessionId: session.sessionId, idleMs }, 'Reaping expired session');
      destroySession(session.sessionId).catch(err => {
        logger.error({ err, sessionId: session.sessionId }, 'Reaper: destroy failed');
      });
    }
  }
}
`

### 6.4 Orphan Recovery (Startup)

**Trigger:** SandboxModule.initialize()
**Input:** Docker container list with label filter
**Output:** Orphaned containers removed

**Pseudocode:**

`	ypescript
async function recoverOrphans(): Promise<void> {
  const containers = await docker.listContainers({
    all: true,
    filters: { label: ['sa4e-sandbox=true'] }
  });
  
  for (const container of containers) {
    const exists = sessionStore.has(container.Id);
    if (!exists) {
      logger.warn({ containerId: container.Id }, 'Removing orphaned sandbox container');
      const c = docker.getContainer(container.Id);
      await c.stop({ t: 5 }).catch(() => {}); // ignore already stopped
      await c.remove({ force: true });
    }
  }
}
`

---

## 7. Security Requirements

### 7.1 Authentication and Authorization

| Role | Permissions | Context |
|------|-------------|---------|
| AI Agent (DEV/QA) | Execute commands, manage sessions | Via MCP tool calls through Backend |
| Backend Process | Docker API access, filesystem access | Runs with Docker group membership |
| Container Process | Limited execution within sandbox | Runs as non-root user (uid 1000) |

### 7.2 Container Security Hardening

| Security Control | Implementation | Business Rule |
|-----------------|----------------|---------------|
| Non-privileged execution | `--privileged=false`, user=1000:1000 | BR-12 |
| Capability drop | Drop ALL, add only: CHOWN, SETUID, SETGID, NET_BIND_SERVICE | BR-12 |
| No new privileges | `--security-opt=no-new-privileges` | BR-12 |
| Seccomp profile | Default Docker seccomp profile (blocks 44+ syscalls) | BR-12 |
| Network isolation | `--network=none` by default | BR-07 |
| Read-only root filesystem | `--read-only` with tmpfs for /tmp, /var/tmp | BR-12 |
| No inter-container communication | No shared Docker network | Out of scope |

### 7.3 Data Sensitivity

| Data Type | Classification | Business Requirement |
|-----------|---------------|---------------------|
| Workspace source code | Internal | Accessible via mount (developer's own code) |
| .env files, credentials | Restricted | BR-08: Excluded from mounts by default |
| Container execution output | Internal | Returned to agent, not persisted long-term |
| Docker socket access | Restricted | Backend process only, not exposed to containers |

### 7.4 Audit Trail

| Event | Logged Fields | Retention | Business Reason |
|-------|--------------|-----------|-----------------|
| Session created | sessionId, mode, image, resources, mounts | 30 days | Debugging, security audit |
| Command executed | sessionId, command (first 200 chars), exitCode, duration | 30 days | Debugging, resource tracking |
| Session destroyed | sessionId, reason (manual/TTL/shutdown), lifetime | 30 days | Resource monitoring |
| Security violation | sessionId, event type, details | 90 days | Security investigation |

---

## 8. Non-Functional Requirements

| Category | Business Requirement | Acceptance Criteria | Technical Note |
|----------|---------------------|---------------------|----------------|
| Performance | Container startup fast enough for interactive use | Startup < 3 seconds (pre-pulled images) | Use image cache, avoid pull on every create |
| Performance | Minimal overhead for command execution | MCP bridge overhead < 100ms vs direct execution | Measure round-trip time |
| Performance | Real-time output for developer experience | Streaming latency < 200ms | Use Docker attach streams |
| Reliability | System recovers from crashes cleanly | Orphan containers cleaned on startup | UC-11 orphan recovery |
| Reliability | Graceful degradation when Docker unavailable | Fall back to local mode with warning | UC-13 AF-13.1 |
| Scalability | Support developer working on multiple features | Max 5 concurrent sessions | BR-05, configurable |
| Scalability | Individual session has enough disk for typical project | 1GB disk per session | BR-03 |
| Security | Containers cannot escape to host | No privileged mode, all caps dropped | BR-12 |
| Security | Network access controlled | Default no-network | BR-07 |
| Availability | Backend restart reconnects to existing containers | Session metadata in SQLite | Reconnect on initialize |
| Observability | All operations traceable | Structured logging with sessionId correlation | pino logger |
| Observability | Resource usage visible | Docker stats available per session | UC-02 list sessions |

---

## 9. Error Handling (User-Facing)

### 9.1 Error Scenarios

| Scenario | Severity | User Message | Expected Behavior |
|----------|----------|-------------|-------------------|
| Docker not running | Warning | "Docker is not available. Start Docker Desktop or use mode=local." | Agent can switch to local mode |
| Container creation failed | Error | "Failed to create sandbox: {docker error}. Check Docker status." | Agent retries or reports to user |
| Command timeout (300s) | Warning | "Command timed out after {timeout}s. Process killed." | Partial output available |
| Memory limit exceeded | Error | "Process killed: memory limit exceeded (512MB). Increase session memory or optimize code." | Agent adjusts approach |
| Session not found | Warning | "Session {id} expired or not found. Create a new session." | Agent creates new session |
| Disk limit exceeded | Error | "Disk limit exceeded (1GB). Clean up files or increase limit." | Agent cleans up or recreates |
| Mount path not found | Error | "Cannot mount {path}: path does not exist." | Agent corrects path |
| Network unavailable | Warning | "No network access in this session. Create session with network=true for package installation." | Agent recreates session with network |
| Max sessions reached | Warning | "Maximum 5 sessions active. Destroy idle sessions first." | Agent destroys unused sessions |
| Binary output | Info | "[binary output, {N} bytes] - Use file operations to read binary data." | Agent uses file tools instead |

### 9.2 Error Codes

| Code | Name | HTTP Status (if applicable) | Description |
|------|------|----------------------------|-------------|
| SANDBOX_DOCKER_UNAVAILABLE | Docker not available | N/A (MCP tool error) | Docker daemon not reachable |
| SANDBOX_SESSION_NOT_FOUND | Session not found | N/A | SessionId does not map to active session |
| SANDBOX_SESSION_LIMIT | Max sessions reached | N/A | Cannot create more sessions |
| SANDBOX_TIMEOUT | Command timeout | N/A | Command exceeded configured timeout |
| SANDBOX_OOM | Out of memory | N/A | Container killed by OOM |
| SANDBOX_DISK_FULL | Disk limit exceeded | N/A | Container filesystem full |
| SANDBOX_NETWORK_DENIED | Network not available | N/A | Session created without network access |
| SANDBOX_INVALID_INPUT | Validation error | N/A | Missing or invalid parameters |
| SANDBOX_EXEC_FAILED | Execution error | N/A | Unexpected execution failure |
| SANDBOX_IMAGE_PULL_FAILED | Image pull failed | N/A | Cannot pull requested Docker image |

---

## 10. API Contracts (Functional View)

> **Note:** These define functional behavior. Technical schemas (full JSON Schema, headers) will be specified in TDD.

### 10.1 Tool: sandbox_session

**Purpose:** Manage sandbox session lifecycle

**Input Parameters:**

| Parameter | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| action | enum(create, list, destroy) | Yes | | Session action to perform |
| sessionId | string | destroy only | | Target session to destroy |
| baseImage | string | No | Default: node:20-slim | Docker image for new session |
| mode | enum(local, docker) | No | Config default | Override execution mode |
| mounts | Mount[] | No | BR-08 | Workspace paths to mount |
| resources | ResourceLimits | No | BR-01-04 | Resource constraints |
| networkEnabled | boolean | No | BR-07, default: false | Enable network access |
| ttl | number | No | BR-06, default: 1800 | Session TTL in seconds |
| env | Record<string, string> | No | | Initial environment variables |

**Output Data (create):**

| Field | Type | Description |
|-------|------|-------------|
| sessionId | string | Generated session ID |
| mode | string | Effective execution mode |
| status | string | "running" |
| baseImage | string | Image used |
| createdAt | string (ISO 8601) | Creation timestamp |
| resources | ResourceLimits | Applied resource limits |

**Output Data (list):**

| Field | Type | Description |
|-------|------|-------------|
| sessions | SessionInfo[] | Array of active session metadata |
| count | number | Total active sessions |

**Output Data (destroy):**

| Field | Type | Description |
|-------|------|-------------|
| success | boolean | Whether destruction succeeded |
| sessionId | string | Destroyed session ID |
| destroyedAt | string (ISO 8601) | Destruction timestamp |

**Business Error Scenarios:**

| Scenario | User Message | Trigger Condition |
|----------|-------------|-------------------|
| Docker unavailable | "Docker is not available..." | mode=docker, Docker daemon unreachable |
| Max sessions | "Maximum 5 sessions active..." | 5 sessions already exist |
| Session not found | "Session {id} not found..." | destroy with invalid sessionId |
| Image pull failed | "Cannot pull image..." | Network error during image pull |

### 10.2 Tool: sandbox_exec

**Purpose:** Execute bash command in sandbox

**Input Parameters:**

| Parameter | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| command | string | Yes | Not empty | Bash command to execute |
| sessionId | string | No | Auto-create if absent | Target session |
| workdir | string | No | | Working directory in container |
| timeout | number | No | BR-11: default 300, max 600 | Timeout in seconds |
| env | Record<string, string> | No | | Additional env vars for this command |

**Output Data:**

| Field | Type | Description |
|-------|------|-------------|
| exitCode | number | Process exit code (0=success, -1=timeout) |
| stdout | string | Standard output (max 1MB) |
| stderr | string | Standard error (max 1MB) |
| duration | number | Execution time in milliseconds |
| truncated | boolean | Whether output was truncated |
| sessionId | string | Session used |
| timedOut | boolean | Whether command timed out |

### 10.3 Tool: sandbox_run

**Purpose:** Run code file with specific runtime

**Input Parameters:**

| Parameter | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| file | string | Yes | Must exist in container | Path to source file |
| runtime | enum(node, python, tsx, java, sh) | Yes | | Execution runtime |
| args | string[] | No | | Runtime arguments |
| sessionId | string | Yes | | Target session |
| timeout | number | No | BR-11 | Timeout in seconds |

**Output Data:** Same as sandbox_exec (ExecutionResult)

### 10.4 Tool: sandbox_install

**Purpose:** Install packages in sandbox session

**Input Parameters:**

| Parameter | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| manager | enum(npm, pip, apt) | Yes | | Package manager to use |
| packages | string[] | Yes | At least 1 package | Packages to install |
| sessionId | string | Yes | | Target session |
| flags | string | No | | Additional flags (e.g., --save-dev) |

**Output Data:** Same as sandbox_exec (ExecutionResult — install command output)

### 10.5 Tool: sandbox_test

**Purpose:** Run test suite with structured result parsing

**Input Parameters:**

| Parameter | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| framework | enum(vitest, jest, pytest, gradle, mocha) | Yes | | Test framework |
| testPath | string | No | | Specific test file/directory |
| coverage | boolean | No | Default: false | Generate coverage report |
| sessionId | string | Yes | | Target session |
| configFile | string | No | | Custom config file path |
| timeout | number | No | Default: 600 | Test timeout (longer default) |

**Output Data:**

| Field | Type | Description |
|-------|------|-------------|
| status | enum(success, failure, error) | Overall test result |
| total | number | Total test count |
| passed | number | Passed count |
| failed | number | Failed count |
| skipped | number | Skipped count |
| failures | TestFailure[] | Failed test details (name, message, stack) |
| coverage | CoverageSummary | Lines/branches/functions % (if requested) |
| duration | number | Total test duration ms |
| sessionId | string | Session used |
| rawOutput | string | Raw framework output (truncated to 1MB) |

---

## 11. Sequence Diagrams

### 11.1 Command Execution Flow

![Sequence - Command Execution](diagrams/sequence-command-execution.png)

`
Agent -> Backend MCP: execute_dynamic_tool("sandbox_exec", {command, sessionId})
Backend MCP -> ModuleRegistry: route to SandboxModule handler
ModuleRegistry -> SandboxModule: handleToolCall("sandbox_exec", params)
SandboxModule -> SessionStore: getSession(sessionId)
SessionStore --> SandboxModule: session (mode=docker, containerId)
SandboxModule -> DockerExecutor: exec(session, command, options)
DockerExecutor -> Docker API: container.exec({Cmd: ["/bin/sh", "-c", command]})
Docker API --> DockerExecutor: exec instance
DockerExecutor -> Docker API: exec.start({hijack: true})
Docker API --> DockerExecutor: stream (stdout + stderr multiplexed)
DockerExecutor -> DockerExecutor: demux streams, buffer output, check size limit
DockerExecutor --> SandboxModule: {exitCode, stdout, stderr, duration}
SandboxModule -> SessionStore: touch(sessionId) // reset TTL
SandboxModule --> ModuleRegistry: ExecutionResult
ModuleRegistry --> Backend MCP: tool result
Backend MCP --> Agent: ExecutionResult JSON
`

### 11.2 Session Creation Flow

![Sequence - Session Creation](diagrams/sequence-session-creation.png)

`
Agent -> Backend MCP: execute_dynamic_tool("sandbox_session", {action: "create", ...})
Backend MCP -> SandboxModule: handleToolCall("sandbox_session", params)
SandboxModule -> SandboxModule: validateCreateParams(params)
SandboxModule -> SandboxModule: checkSessionLimit() // max 5
SandboxModule -> ExecutionManager: createSession(config)
ExecutionManager -> DockerExecutor: create(config)
DockerExecutor -> Docker API: docker.createContainer({Image, HostConfig, Labels})
Docker API --> DockerExecutor: container object
DockerExecutor -> Docker API: container.start()
Docker API --> DockerExecutor: started
DockerExecutor --> ExecutionManager: {containerId, status: running}
ExecutionManager -> SessionStore: register(session)
SessionStore --> ExecutionManager: sessionId
ExecutionManager --> SandboxModule: SessionMetadata
SandboxModule --> Backend MCP: {sessionId, mode, status, createdAt, ...}
Backend MCP --> Agent: session metadata JSON
`

---

## 12. Configuration

### 12.1 Sandbox Module Configuration

Configuration managed in backend config (`src/engine/config.ts` pattern):

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| sandbox.enabled | boolean | true | Enable/disable sandbox module |
| sandbox.defaultMode | enum | "docker" | Default execution mode |
| sandbox.fallbackToLocal | boolean | true | Fall back to local if Docker unavailable |
| sandbox.maxSessions | number | 5 | Maximum concurrent sessions |
| sandbox.defaultTtl | number | 1800 | Default session TTL (seconds) |
| sandbox.defaultImage | string | "node:20-slim" | Default Docker base image |
| sandbox.defaultMemory | string | "512m" | Default memory limit |
| sandbox.defaultCpu | string | "1.0" | Default CPU limit (cores) |
| sandbox.defaultDisk | string | "1g" | Default disk limit |
| sandbox.defaultPidsLimit | number | 100 | Default max processes |
| sandbox.commandTimeout | number | 300 | Default command timeout (seconds) |
| sandbox.maxCommandTimeout | number | 600 | Maximum allowed timeout |
| sandbox.outputMaxSize | number | 1048576 | Max output size per stream (bytes) |
| sandbox.reaperInterval | number | 60000 | Reaper check interval (ms) |
| sandbox.networkDefault | boolean | false | Default network access |
| sandbox.mountExclusions | string[] | [".env", ".git/credentials", "*.pem", "*.key"] | Default mount exclusions |
| sandbox.containerLabels | Record | {"sa4e-sandbox": "true"} | Labels for container identification |
| sandbox.dockerSocket | string | "/var/run/docker.sock" | Docker socket path |

### 12.2 Mount Exclusion Patterns

Default exclusion list (files never mounted unless explicitly overridden):

| Pattern | Reason |
|---------|--------|
| .env | Environment secrets |
| .env.* | Environment variant files |
| *.pem | Private keys |
| *.key | Private keys |
| .git/credentials | Git credentials |
| .ssh/ | SSH keys |
| .aws/ | AWS credentials |
| .docker/config.json | Docker registry auth |

---

## 13. Testing Considerations

### 13.1 Test Scenarios

| ID | Scenario | Input | Expected Output | Priority |
|----|----------|-------|-----------------|----------|
| TC-01 | Create Docker session with defaults | action=create | sessionId returned, container running | High |
| TC-02 | Execute simple command | echo "hello" | exitCode=0, stdout="hello\n" | High |
| TC-03 | Command timeout | sleep 999, timeout=2 | exitCode=-1, timedOut=true | High |
| TC-04 | Install npm package | manager=npm, packages=[lodash] | exitCode=0, package available | High |
| TC-05 | Run test suite | framework=vitest | Structured test results | High |
| TC-06 | Session TTL expiry | Wait > TTL | Session auto-destroyed | Medium |
| TC-07 | Output truncation | Command producing >1MB | truncated=true, last 1MB kept | Medium |
| TC-08 | Mount workspace | mounts=[{src, dst}] | Files visible in container | High |
| TC-09 | Resource limit (OOM) | Allocate >512MB | exitCode=137, OOM error | High |
| TC-10 | Docker unavailable + fallback | mode=docker, Docker off | Falls back to local with warning | Medium |
| TC-11 | Session persistence | Install pkg, then use it | Package available in next command | High |
| TC-12 | Graceful shutdown | SIGTERM backend | All containers stopped | Medium |
| TC-13 | Orphan recovery | Kill backend, restart | Orphan containers cleaned | Medium |
| TC-14 | Max sessions limit | Create 6th session | Error: max sessions reached | Medium |
| TC-15 | Sensitive file exclusion | Mount workspace with .env | .env not accessible in container | High |
| TC-16 | Local mode execution | mode=local, command | Executes on host directly | High |
| TC-17 | Binary output detection | cat /bin/ls | "[binary output, N bytes]" | Low |
| TC-18 | Network isolation | curl google.com (no network session) | Network error returned | High |
| TC-19 | List sessions with stats | action=list | Session metadata with resource usage | Medium |
| TC-20 | Concurrent commands same session | 2 commands simultaneously | Both execute (sequential in container) | Medium |

---

## 14. Appendix

### 14.1 Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | System Context | [system-context.png](diagrams/system-context.png) | [system-context.drawio](diagrams/system-context.drawio) |
| 2 | Sequence - Command Execution | [sequence-command-execution.png](diagrams/sequence-command-execution.png) | [sequence-command-execution.drawio](diagrams/sequence-command-execution.drawio) |
| 3 | Sequence - Session Creation | [sequence-session-creation.png](diagrams/sequence-session-creation.png) | [sequence-session-creation.drawio](diagrams/sequence-session-creation.drawio) |
| 4 | State - Session Lifecycle | [state-session-lifecycle.png](diagrams/state-session-lifecycle.png) | [state-session-lifecycle.drawio](diagrams/state-session-lifecycle.drawio) |

### 14.2 Change Log from BRD

| BRD Requirement | FSD Clarification |
|----------------|-------------------|
| Story 1: Execute bash commands | Detailed as UC-04 with full flow, timeout handling, output truncation |
| Story 5: Choose mode | Clarified fallback behavior configurable (not always automatic) |
| Story 6: Persistent sessions | Added auto-create ephemeral session when no sessionId provided |
| Story 9: Read output | Added binary output detection and streaming behavior |
| Story 10: Auto cleanup | Added orphan recovery on startup (crash resilience) |

### 14.3 Open Issues

| # | Issue | Impact | Status |
|---|-------|--------|--------|
| 1 | Should sessions survive backend restart? | If yes, need container reconnection logic | Decision: Yes (metadata in memory, reconnect on init) |
| 2 | Should Local mode use cgroups for resource limits? | Without cgroups, local mode has no resource enforcement | Decision: No (Local mode is trust-based, Docker for isolation) |
| 3 | Streaming output via MCP - does current MCP SDK support streaming responses? | If not, full output buffered until completion | Research needed during TDD |
| 4 | Should sandbox_test parse all framework outputs or return raw? | Structured results more useful but harder to maintain parsers | Decision: Parse common formats, include rawOutput as fallback |

---

---

## 15. Technical Enrichment (TA Review)

> **Added by TA Agent** — This section supplements the business FSD with technical implementation depth.

### 15.1 MCP Tool JSON Schemas (Full Definition)

#### sandbox_session — Input Schema

`json
{
  "name": "sandbox_session",
  "description": "Manage sandbox execution sessions. Create isolated environments for code execution, list active sessions, or destroy completed sessions.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "action": {
        "type": "string",
        "enum": ["create", "list", "destroy"],
        "description": "Session lifecycle action"
      },
      "sessionId": {
        "type": "string",
        "pattern": "^sess_[a-f0-9]{12}$",
        "description": "Session ID (required for destroy)"
      },
      "baseImage": {
        "type": "string",
        "default": "node:20-slim",
        "description": "Docker image for new session"
      },
      "mode": {
        "type": "string",
        "enum": ["local", "docker"],
        "description": "Execution mode override"
      },
      "mounts": {
        "type": "array",
        "items": {
          "type": "object",
          "properties": {
            "source": { "type": "string", "description": "Host path" },
            "target": { "type": "string", "description": "Container path" },
            "readOnly": { "type": "boolean", "default": false }
          },
          "required": ["source", "target"]
        }
      },
      "resources": {
        "type": "object",
        "properties": {
          "memory": { "type": "string", "default": "512m", "pattern": "^\\d+[mgk]$" },
          "cpu": { "type": "string", "default": "1.0" },
          "disk": { "type": "string", "default": "1g", "pattern": "^\\d+[mgk]$" },
          "pidsLimit": { "type": "integer", "default": 100, "minimum": 10, "maximum": 1000 }
        }
      },
      "networkEnabled": {
        "type": "boolean",
        "default": false,
        "description": "Enable network access in container"
      },
      "ttl": {
        "type": "integer",
        "default": 1800,
        "minimum": 60,
        "maximum": 7200,
        "description": "Session TTL in seconds"
      },
      "env": {
        "type": "object",
        "additionalProperties": { "type": "string" },
        "description": "Environment variables"
      }
    },
    "required": ["action"],
    "if": { "properties": { "action": { "const": "destroy" } } },
    "then": { "required": ["action", "sessionId"] }
  }
}
`

#### sandbox_exec — Input Schema

`json
{
  "name": "sandbox_exec",
  "description": "Execute a bash command in a sandbox session. Returns stdout, stderr, exit code, and timing.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "command": {
        "type": "string",
        "minLength": 1,
        "maxLength": 10000,
        "description": "Bash command to execute"
      },
      "sessionId": {
        "type": "string",
        "pattern": "^sess_[a-f0-9]{12}$",
        "description": "Target session (auto-creates ephemeral if omitted)"
      },
      "workdir": {
        "type": "string",
        "description": "Working directory inside container"
      },
      "timeout": {
        "type": "integer",
        "default": 300,
        "minimum": 1,
        "maximum": 600,
        "description": "Command timeout in seconds"
      },
      "env": {
        "type": "object",
        "additionalProperties": { "type": "string" },
        "description": "Additional environment variables for this command"
      }
    },
    "required": ["command"]
  }
}
`

#### sandbox_run — Input Schema

`json
{
  "name": "sandbox_run",
  "description": "Run a source code file with a specific runtime. Handles compilation and execution.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "file": {
        "type": "string",
        "minLength": 1,
        "description": "Path to source file inside container"
      },
      "runtime": {
        "type": "string",
        "enum": ["node", "python", "tsx", "java", "sh"],
        "description": "Execution runtime"
      },
      "args": {
        "type": "array",
        "items": { "type": "string" },
        "description": "Runtime arguments"
      },
      "sessionId": {
        "type": "string",
        "pattern": "^sess_[a-f0-9]{12}$"
      },
      "timeout": {
        "type": "integer",
        "default": 300,
        "minimum": 1,
        "maximum": 600
      }
    },
    "required": ["file", "runtime", "sessionId"]
  }
}
`

#### sandbox_install — Input Schema

`json
{
  "name": "sandbox_install",
  "description": "Install packages in a sandbox session using npm, pip, or apt.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "manager": {
        "type": "string",
        "enum": ["npm", "pip", "apt"],
        "description": "Package manager"
      },
      "packages": {
        "type": "array",
        "items": { "type": "string" },
        "minItems": 1,
        "description": "Package names to install"
      },
      "sessionId": {
        "type": "string",
        "pattern": "^sess_[a-f0-9]{12}$"
      },
      "flags": {
        "type": "string",
        "description": "Additional flags (e.g., --save-dev)"
      }
    },
    "required": ["manager", "packages", "sessionId"]
  }
}
`

#### sandbox_test — Input Schema

`json
{
  "name": "sandbox_test",
  "description": "Run test suite with structured result parsing. Returns pass/fail counts and failure details.",
  "inputSchema": {
    "type": "object",
    "properties": {
      "framework": {
        "type": "string",
        "enum": ["vitest", "jest", "pytest", "gradle", "mocha"],
        "description": "Test framework"
      },
      "testPath": {
        "type": "string",
        "description": "Specific test file or directory"
      },
      "coverage": {
        "type": "boolean",
        "default": false,
        "description": "Generate coverage report"
      },
      "sessionId": {
        "type": "string",
        "pattern": "^sess_[a-f0-9]{12}$"
      },
      "configFile": {
        "type": "string",
        "description": "Custom config file path"
      },
      "timeout": {
        "type": "integer",
        "default": 600,
        "minimum": 1,
        "maximum": 1800
      }
    },
    "required": ["framework", "sessionId"]
  }
}
`

### 15.2 Docker Container Configuration (Technical Detail)

**Container Create Options (dockerode API):**

`	ypescript
const createOptions: Docker.ContainerCreateOptions = {
  Image: config.baseImage || 'node:20-slim',
  Cmd: ['/bin/sh'],  // Keep container alive with shell
  Tty: false,
  OpenStdin: true,
  AttachStdin: true,
  AttachStdout: true,
  AttachStderr: true,
  WorkingDir: '/workspace',
  Labels: {
    'sa4e-sandbox': 'true',
    'sa4e-session-id': sessionId,
    'sa4e-created-at': new Date().toISOString()
  },
  HostConfig: {
    Memory: parseMemoryLimit(config.resources.memory),     // 512MB = 536870912
    MemorySwap: parseMemoryLimit(config.resources.memory), // No swap
    CpuQuota: parseCpuLimit(config.resources.cpu) * 100000, // 1.0 = 100000
    CpuPeriod: 100000,
    PidsLimit: config.resources.pidsLimit || 100,
    NetworkMode: config.networkEnabled ? 'bridge' : 'none',
    Binds: buildMountBinds(config.mounts),
    SecurityOpt: ['no-new-privileges'],
    CapDrop: ['ALL'],
    CapAdd: ['CHOWN', 'SETUID', 'SETGID', 'NET_BIND_SERVICE'],
    ReadonlyRootfs: false,  // Need writable for package install
    Tmpfs: {
      '/tmp': 'rw,noexec,nosuid,size=100m',
      '/var/tmp': 'rw,noexec,nosuid,size=50m'
    }
  }
};
`

### 15.3 Output Stream Demultiplexing

Docker multiplexes stdout/stderr in a single stream with 8-byte header per frame:

`
[STREAM_TYPE(1)][0][0][0][SIZE(4)][PAYLOAD(SIZE)]
STREAM_TYPE: 1=stdout, 2=stderr
`

**Pseudocode for demux:**

`	ypescript
function demuxDockerStream(stream: NodeJS.ReadableStream): { stdout: string; stderr: string } {
  const buffers = { stdout: [] as Buffer[], stderr: [] as Buffer[] };
  let totalStdout = 0, totalStderr = 0;
  
  for await (const chunk of stream) {
    let offset = 0;
    while (offset < chunk.length) {
      const streamType = chunk[offset];      // byte 0: 1=stdout, 2=stderr
      const frameSize = chunk.readUInt32BE(offset + 4); // bytes 4-7: payload size
      const payload = chunk.slice(offset + 8, offset + 8 + frameSize);
      
      if (streamType === 1 && totalStdout < MAX_OUTPUT_SIZE) {
        buffers.stdout.push(payload);
        totalStdout += payload.length;
      } else if (streamType === 2 && totalStderr < MAX_OUTPUT_SIZE) {
        buffers.stderr.push(payload);
        totalStderr += payload.length;
      }
      offset += 8 + frameSize;
    }
  }
  
  return {
    stdout: Buffer.concat(buffers.stdout).toString('utf-8'),
    stderr: Buffer.concat(buffers.stderr).toString('utf-8')
  };
}
`

### 15.4 Test Result Parsing (Framework-Specific)

**Vitest/Jest output parsing regex patterns:**

`	ypescript
const VITEST_SUMMARY = /Tests\s+(\d+)\s+passed.*?(\d+)\s+failed.*?(\d+)\s+total/;
const VITEST_FAILURE = /FAIL\s+(.+?)\s*\n\s*[×✗]\s+(.+?)\n([\s\S]*?)(?=\n\s*[×✓]|\n\nTest Files)/g;
const PYTEST_SUMMARY = /(\d+) passed(?:,\s*(\d+) failed)?(?:,\s*(\d+) skipped)?/;
const GRADLE_SUMMARY = /(\d+) tests completed, (\d+) failed/;
`

### 15.5 NFR Quantified Targets (Technical)

| Metric | Target | Measurement Method | Alert Threshold |
|--------|--------|-------------------|-----------------|
| Container startup time | < 3s (pre-pulled) | Timer from createContainer to start complete | > 5s → warn log |
| Container startup time | < 30s (with pull) | Timer including image pull | > 60s → timeout error |
| MCP bridge overhead | < 100ms | Duration minus Docker exec time | > 200ms → perf warning |
| Stream latency | < 200ms | Time from Docker output to MCP response | > 500ms → investigate |
| Reaper interval accuracy | ±5s | Timer drift measurement | > 30s drift → restart timer |
| Session create rate | 5 sessions / 10s max | Rate limiter | Reject if exceeded |
| Memory per module | < 50MB base | process.memoryUsage() delta | > 100MB → investigate |
| Orphan recovery time | < 10s on startup | Timer from module init to cleanup complete | > 30s → warn |

### 15.6 Error Recovery Strategies

| Error Type | Detection | Recovery Strategy | Max Retries |
|-----------|-----------|-------------------|-------------|
| Docker daemon disconnect | ECONNREFUSED on socket | Reconnect with exp. backoff (1s, 2s, 4s) | 3 |
| Container exit (unexpected) | Exec returns without explicit stop | Mark session as destroyed, notify caller | 0 |
| Image pull timeout | 60s timeout on pull operation | Return error, suggest pre-pulling | 1 |
| OOM kill | Exit code 137 | Return structured error, session still usable | 0 |
| Disk full | Exit code + "no space left" in stderr | Return error, suggest cleanup | 0 |
| Exec timeout | Timer fires | SIGKILL process, return partial output | 0 |
| SessionStore corruption | TypeError on access | Rebuild from Docker container list | 1 |

### 15.7 Concurrency Model

- **Single-threaded Node.js**: All operations async/await, no thread safety concerns
- **One session = one container**: No shared state between sessions
- **Sequential exec per session**: Docker exec is sequential per container (no parallel commands in same container)
- **Parallel sessions**: Multiple sessions can run simultaneously (up to maxSessions)
- **Reaper isolation**: Reaper runs in same event loop, uses setInterval — non-blocking iteration

### 15.8 MCP Tool Registration (Implementation Note)

The SandboxModule must register its 5 tools with descriptions and schemas that enable semantic discovery via ind_tools. Agent typically discovers tools with queries like:

- "execute code in sandbox" → matches sandbox_exec
- "run tests isolated" → matches sandbox_test  
- "install packages" → matches sandbox_install
- "create execution environment" → matches sandbox_session

Tool descriptions should be optimized for embedding similarity with these natural-language queries.

### 15.9 Open Technical Decisions (TA Notes)

| # | Decision | Options | Recommendation | Impact |
|---|----------|---------|----------------|--------|
| 1 | Session ID format | UUID v4 vs custom prefix | Custom: sess_ + 12 hex chars (shorter, recognizable) | Low |
| 2 | Docker socket detection | Check socket vs try-connect | Try-connect with 2s timeout (handles remote Docker too) | Medium |
| 3 | Output encoding | UTF-8 only vs detect encoding | UTF-8 with binary detection (check for null bytes in first 512 bytes) | Low |
| 4 | Streaming support | Full streaming vs buffered | Phase 1: Buffered (simpler). Phase 2: Add streaming if MCP SDK supports it | Medium |
| 5 | Container user | root vs non-root | Non-root (uid 1000) for security, BUT some packages need root for install → use --user root for install commands only | High |

---
