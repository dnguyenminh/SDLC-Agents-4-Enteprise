# Business Requirements Document (BRD)

## SDLC Agents 4 Enterprise — SA4E-6: Sandbox Execution (MCP Server Bridge)

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-6 |
| Title | Sandbox Execution (MCP Server Bridge) |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2026-07-03 |
| Status | Draft |
| Related BRD | BRD-v1-SA4E-6.docx |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | BA Agent – Business Analyst | Create document |
| Peer Reviewer | SM Agent – Scrum Master | Review document |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-03 | BA Agent | Initiate document — auto-generated from Jira ticket SA4E-6 |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |
| | ☐ I agree and confirm all criteria on this BRD as expected requirements |

---

## 1. Introduction

### 1.1 Scope

This change request implements a **Sandbox Execution** capability for SDLC Agents 4 Enterprise. The feature creates an MCP Server Bridge that connects the VS Code Extension to isolated Docker containers, enabling AI agents to execute real code (bash commands, package installation, compilation, test running) in a secure, sandboxed environment.

The sandbox system is the most critical component of the **Option C Hybrid Architecture** — it enables agents to move beyond document generation into actual code execution, testing, and validation within isolated environments.

**Reference Architecture:** ByteDance DeerFlow sandbox system (https://github.com/bytedance/deer-flow)

### 1.2 Out of Scope

- Kubernetes execution mode (Phase 2 — future ticket)
- Remote/cloud container orchestration
- Multi-tenant sandbox sharing between users
- GPU-accelerated containers
- Custom base image marketplace
- Container networking between sandboxes (inter-container communication)

### 1.3 Preliminary Requirement

- Docker Desktop installed and running on developer machine (for Docker mode)
- Node.js >= 18.14 runtime (for Local mode)
- Backend MCP Server running (port 48721)
- Extension connected to backend via MCP StreamableHTTP
- `dockerode` npm package available

---

## 2. Business Requirements

### 2.1 High Level Process Map

The sandbox execution system provides three execution modes with escalating isolation levels:

1. **Local Mode** — Direct execution on host machine (development/trusted scenarios)
2. **Docker Mode** — Isolated container execution via `dockerode` (standard isolation)
3. **Kubernetes Mode** — Pod-based execution for production environments (future Phase 2)

An MCP Server Bridge acts as the intermediary, routing execution requests from AI agents through the appropriate execution backend while maintaining security boundaries, resource limits, and session state.

![Business Flow](diagrams/business-flow.png)

### 2.2 List of User Stories / Use Cases

| # | Story / Use Case | Priority | Source Ticket |
|---|------------------|----------|---------------|
| 1 | As an AI agent, I want to execute bash commands in an isolated container so that I can run code safely without affecting the host system | MUST HAVE | SA4E-6 |
| 2 | As an AI agent, I want to install npm/pip packages in a sandbox so that I can set up the execution environment for code testing | MUST HAVE | SA4E-6 |
| 3 | As an AI agent, I want to compile and run code in a sandbox so that I can validate implementations before committing | MUST HAVE | SA4E-6 |
| 4 | As an AI agent, I want to run test suites in a sandbox so that I can verify code quality without local environment pollution | MUST HAVE | SA4E-6 |
| 5 | As a developer, I want to choose between Local/Docker execution modes so that I can balance speed vs. isolation based on my needs | SHOULD HAVE | SA4E-6 |
| 6 | As a developer, I want sandbox sessions to persist state between commands so that I can build up environment incrementally | MUST HAVE | SA4E-6 |
| 7 | As a developer, I want resource limits on sandbox containers so that runaway processes cannot consume all system resources | MUST HAVE | SA4E-6 |
| 8 | As a developer, I want to mount workspace files into the sandbox so that agents can work with my actual project code | SHOULD HAVE | SA4E-6 |
| 9 | As an AI agent, I want to read execution output (stdout/stderr) so that I can interpret results and make decisions | MUST HAVE | SA4E-6 |
| 10 | As a developer, I want automatic container cleanup after session timeout so that unused containers don't consume resources | SHOULD HAVE | SA4E-6 |

---

### 2.3 Details of User Stories

---

#### Business Flow

**Step 1:** AI agent (e.g., DEV agent, QA agent) issues an execution request via MCP tool call (e.g., `sandbox_exec`, `sandbox_install`, `sandbox_run_tests`)

**Step 2:** MCP Server Bridge receives the request and determines execution mode (Local/Docker) based on configuration

**Step 3:** If Docker mode and no active session exists, Bridge creates a new container from the configured base image with resource limits applied

**Step 4:** Bridge executes the command inside the container (or locally), capturing stdout/stderr streams

**Step 5:** Bridge returns execution result (exit code, stdout, stderr, timing) to the requesting agent

**Step 6:** Agent interprets result and decides next action (fix code, run more commands, report success/failure)

**Step 7:** Session remains alive for subsequent commands until explicit cleanup or timeout

> **Note:** All execution happens asynchronously. Long-running commands have configurable timeouts (default 300s). Agents receive streaming output for real-time monitoring.

---

#### STORY 1: Execute Bash Commands in Isolated Container

> As an AI agent, I want to execute bash commands in an isolated container so that I can run code safely without affecting the host system.

**Requirement Details:**

1. Agent can invoke `sandbox_exec` MCP tool with a bash command string
2. Command executes inside an isolated Docker container (Docker mode) or directly on host (Local mode)
3. Container provides standard Linux environment (Ubuntu-based or Alpine)
4. Agent receives real-time stdout/stderr streaming
5. Exit code is returned upon command completion
6. Commands have configurable timeout (default: 300s, max: 600s)

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| command | string | Yes | Bash command to execute | `npm test` |
| workdir | string | No | Working directory inside container | `/workspace/src` |
| timeout | number | No | Timeout in seconds (default 300) | `120` |
| sessionId | string | No | Reuse existing session | `sess_abc123` |
| env | object | No | Environment variables | `{"NODE_ENV": "test"}` |

**Acceptance Criteria:**

1. Given an agent sends `sandbox_exec` with command `echo "hello"`, the sandbox returns stdout `hello\n` with exit code 0
2. Given a command exceeds timeout, the sandbox kills the process and returns exit code -1 with timeout error message
3. Given Docker mode is configured but Docker is not running, the sandbox returns a clear error message indicating Docker is unavailable
4. Given a command produces stderr output, both stdout and stderr are captured and returned separately
5. Given an invalid command, the sandbox returns the shell error with appropriate exit code

**Validation Rules:**

- Command string must not be empty
- Timeout must be between 1 and 600 seconds
- Session ID, if provided, must reference an active session

**Error Handling:**

- Docker not available: Return error with suggestion to start Docker or switch to Local mode
- Container creation failed: Return error with Docker daemon status
- Command timeout: Kill process, return partial output with timeout indicator
- Container OOM killed: Return error with resource limit exceeded message

---

#### STORY 2: Install Packages in Sandbox

> As an AI agent, I want to install npm/pip packages in a sandbox so that I can set up the execution environment for code testing.

**Requirement Details:**

1. Agent can invoke `sandbox_install` MCP tool with package manager and package list
2. Supported package managers: npm, pip, apt-get
3. Installation happens inside the active sandbox session (persists for subsequent commands)
4. Agent receives installation progress/output in real-time
5. Failed installations return detailed error messages

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| manager | enum | Yes | Package manager (npm/pip/apt) | `npm` |
| packages | string[] | Yes | List of packages to install | `["express", "jest"]` |
| sessionId | string | Yes | Target sandbox session | `sess_abc123` |
| flags | string | No | Additional flags for package manager | `--save-dev` |

**Acceptance Criteria:**

1. Given `sandbox_install` with manager `npm` and packages `["lodash"]`, lodash is available for import in subsequent `sandbox_exec` commands within the same session
2. Given an invalid package name, the installation fails gracefully with the package manager's error output
3. Given `apt` manager, package installation uses `apt-get install -y` with no interactive prompts
4. Given multiple packages, all are installed in a single operation

**Error Handling:**

- Package not found: Return package manager error output
- Network error (no internet in container): Return connectivity error with suggestion
- Disk space exhausted: Return storage limit error

---

#### STORY 3: Compile and Run Code in Sandbox

> As an AI agent, I want to compile and run code in a sandbox so that I can validate implementations before committing.

**Requirement Details:**

1. Agent can invoke `sandbox_run` MCP tool with file path and runtime
2. Supported runtimes: Node.js, Python, TypeScript (via tsx), Java (via gradle), Shell
3. Source code is either mounted from workspace or written to container via prior `sandbox_exec`
4. Compilation errors are captured and returned with line numbers
5. Runtime errors (exceptions, panics) are captured with stack traces

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| file | string | Yes | Path to file inside container | `/workspace/src/main.ts` |
| runtime | enum | Yes | Execution runtime | `node` |
| args | string[] | No | Runtime arguments | `["--experimental-modules"]` |
| sessionId | string | Yes | Target sandbox session | `sess_abc123` |

**Acceptance Criteria:**

1. Given a valid TypeScript file, `sandbox_run` compiles and executes it, returning output
2. Given a file with syntax errors, compilation error with line number is returned
3. Given a runtime exception, stack trace is captured in stderr
4. Given a file that doesn't exist, a clear "file not found" error is returned

---

#### STORY 4: Run Test Suites in Sandbox

> As an AI agent, I want to run test suites in a sandbox so that I can verify code quality without local environment pollution.

**Requirement Details:**

1. Agent can invoke `sandbox_test` MCP tool specifying test framework and test path
2. Supported frameworks: Jest, Vitest, Pytest, JUnit/Gradle, Mocha
3. Test results are parsed and returned in structured format (pass/fail counts, failed test details)
4. Coverage reports are generated when requested
5. Test execution respects the project's existing configuration (jest.config, vitest.config, etc.)

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| framework | enum | Yes | Test framework | `vitest` |
| testPath | string | No | Specific test file/directory | `src/__tests__/` |
| coverage | boolean | No | Generate coverage report | `true` |
| sessionId | string | Yes | Target sandbox session | `sess_abc123` |
| configFile | string | No | Custom config file path | `vitest.config.ts` |

**Acceptance Criteria:**

1. Given a project with Vitest tests, `sandbox_test` runs all tests and returns structured results (total, passed, failed, skipped)
2. Given specific test path, only tests in that path are executed
3. Given `coverage: true`, coverage summary is included in the response
4. Given all tests pass, result status is "success"; given any test fails, status is "failure" with details of failed tests
5. Given test framework is not installed in session, returns error suggesting `sandbox_install` first

---

#### STORY 5: Choose Execution Mode (Local/Docker)

> As a developer, I want to choose between Local/Docker execution modes so that I can balance speed vs. isolation based on my needs.

**Requirement Details:**

1. Execution mode is configured in backend settings (config file or environment variable)
2. Local mode executes commands directly on host — faster but no isolation
3. Docker mode creates isolated containers — slower startup but full isolation
4. Mode can be overridden per-request via optional parameter
5. Default mode is Docker (safer)

**Acceptance Criteria:**

1. Given default config is "docker", all sandbox commands use Docker unless overridden
2. Given mode override "local" in request, command executes on host directly
3. Given Docker is not available and mode is "docker", system falls back to local with warning (configurable: fallback vs. error)
4. Mode setting persists across extension restarts

---

#### STORY 6: Persistent Session State

> As a developer, I want sandbox sessions to persist state between commands so that I can build up environment incrementally.

**Requirement Details:**

1. Each sandbox session maintains state (installed packages, files created, env vars set)
2. Sessions are identified by unique session ID
3. Sessions have configurable TTL (default: 30 minutes of inactivity)
4. Agents can explicitly create, reuse, and destroy sessions
5. Session state is NOT persisted across backend restarts (ephemeral)

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| action | enum | Yes | Session action (create/destroy/list) | `create` |
| sessionId | string | Conditional | Required for destroy | `sess_abc123` |
| baseImage | string | No | Docker image for new session | `node:20-slim` |
| mounts | object[] | No | Workspace paths to mount | `[{src: "/workspace", dst: "/code"}]` |
| resources | object | No | Resource limits | `{memory: "512m", cpu: "1.0"}` |

**Acceptance Criteria:**

1. Given `sandbox_session(action: "create")`, a new session is created and session ID returned
2. Given a session exists, subsequent commands with that session ID execute in the same container with all prior state intact
3. Given a session is idle for longer than TTL, it is automatically destroyed and container removed
4. Given `sandbox_session(action: "list")`, all active sessions are returned with metadata (created time, last activity, resource usage)
5. Given `sandbox_session(action: "destroy")`, the container is stopped and removed immediately

---

#### STORY 7: Resource Limits on Containers

> As a developer, I want resource limits on sandbox containers so that runaway processes cannot consume all system resources.

**Requirement Details:**

1. Each container has configurable resource limits: memory, CPU, disk, process count
2. Default limits: 512MB memory, 1 CPU core, 1GB disk, 100 max processes
3. Containers exceeding limits are killed with informative error
4. Resource usage is trackable per session

**Acceptance Criteria:**

1. Given default configuration, containers are created with 512MB memory limit
2. Given a process allocates > 512MB memory, the container is OOM-killed and agent receives "memory limit exceeded" error
3. Given custom resource limits in session create request, those limits override defaults
4. Given a fork bomb or excessive process creation, the process limit prevents system impact

---

#### STORY 8: Mount Workspace Files into Sandbox

> As a developer, I want to mount workspace files into the sandbox so that agents can work with my actual project code.

**Requirement Details:**

1. Workspace directory (or subdirectories) can be bind-mounted into the container
2. Mounts are read-write by default (configurable to read-only)
3. File changes made inside the container are reflected in the workspace
4. Sensitive files (.env, secrets) are excluded from mounts by default
5. Mount paths are configurable per session

**Acceptance Criteria:**

1. Given workspace mount configured, agent can read project source files inside the container
2. Given agent modifies a file inside the container, the change is visible in VS Code workspace
3. Given `.env` file exists in workspace, it is NOT mounted unless explicitly included
4. Given read-only mount, write attempts inside container return permission error

---

#### STORY 9: Read Execution Output (stdout/stderr)

> As an AI agent, I want to read execution output (stdout/stderr) so that I can interpret results and make decisions.

**Requirement Details:**

1. All command output (stdout and stderr) is captured and returned to the agent
2. Output is returned in structured format with clear separation of stdout/stderr
3. For long-running commands, output is streamed incrementally (not buffered until completion)
4. Output size is bounded (max 1MB per stream) to prevent context overflow
5. Binary output is detected and truncated with indicator

**Data Fields (Response):**

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| exitCode | number | Process exit code | `0` |
| stdout | string | Standard output text | `"hello world\n"` |
| stderr | string | Standard error text | `""` |
| duration | number | Execution time in ms | `1523` |
| truncated | boolean | Whether output was truncated | `false` |
| sessionId | string | Session used for execution | `sess_abc123` |

**Acceptance Criteria:**

1. Given a command that writes to both stdout and stderr, both streams are captured separately
2. Given output exceeds 1MB, it is truncated with `truncated: true` flag and last 1MB retained
3. Given a streaming command (e.g., `tail -f`), output is delivered incrementally to the agent
4. Given binary output detected (non-UTF8), output is replaced with "[binary output, N bytes]" indicator

---

#### STORY 10: Automatic Container Cleanup

> As a developer, I want automatic container cleanup after session timeout so that unused containers don't consume resources.

**Requirement Details:**

1. Background reaper process monitors all active sessions
2. Sessions idle for longer than TTL are automatically destroyed
3. On backend shutdown, all containers are gracefully stopped
4. Orphaned containers (from crashed backend) are cleaned up on next startup
5. Cleanup logs are available for debugging

**Acceptance Criteria:**

1. Given a session idle for 30 minutes (default TTL), the container is automatically stopped and removed
2. Given backend process is killed (SIGKILL), next startup detects orphaned containers and removes them
3. Given backend graceful shutdown (SIGTERM), all active containers are stopped before exit
4. Given cleanup fails (Docker API error), error is logged and retry scheduled

---

## 3. Dependencies

| Dependency | Type | Related Ticket | Description |
|------------|------|----------------|-------------|
| Docker Engine | Infrastructure | N/A | Required for Docker execution mode. Docker Desktop or Docker Engine must be installed |
| dockerode | System | N/A | Node.js Docker SDK for container management (npm package) |
| Backend MCP Server | System | SA4E-1 | Sandbox module integrates into existing backend module registry |
| OrchestrationModule | System | SA4E-1 | Sandbox tools registered via module system, discoverable via find_tools |
| VS Code Extension | System | SA4E-1 | Agent invokes sandbox tools via MCP bridge |
| Tree-sitter (optional) | System | SA4E-1 | For parsing execution output in structured format |

---

## 4. Stakeholders

| Role | Name / Team | Responsibility | Source |
|------|-------------|----------------|--------|
| Product Owner | SA4E Team Lead | Approve requirements, prioritize features | Ticket reporter |
| Developer | Backend Dev | Implement sandbox module | Assigned developer |
| QA | QA Agent | Verify sandbox isolation and security | Pipeline |
| DevOps | DevOps Agent | Deployment and container configuration | Pipeline |
| End User | AI Agents (DEV, QA) | Primary consumers of sandbox execution | System |

---

## 5. Risks and Assumptions

### 5.1 Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Container escape vulnerability | High | Low | Use rootless containers, drop all capabilities, apply seccomp profiles |
| Resource exhaustion (Docker fills disk) | High | Medium | Implement disk quotas, automatic image pruning, session TTL |
| Docker not available on target machine | Medium | Medium | Provide Local mode fallback, clear error messages |
| Network access from container enables data exfiltration | High | Low | Default no-network policy, whitelist approach for network access |
| Long-running containers impact system performance | Medium | Medium | Resource limits (CPU, memory), session TTL, max concurrent sessions |
| Workspace mount exposes sensitive files | High | Medium | Default exclusion list (.env, .git/credentials), configurable allow/deny lists |

### 5.2 Assumptions

- Docker Desktop or Docker Engine is installed on the developer's machine (for Docker mode)
- The backend server has sufficient permissions to manage Docker containers (docker group membership or rootless Docker)
- Agents will use sandbox tools responsibly — timeout and resource limits are safety nets, not primary control mechanisms
- Network connectivity is available for package installation (containers may need internet access for npm/pip install)
- Host filesystem performance is adequate for bind-mount I/O (SSD recommended)
- Single-user environment — no multi-tenant isolation needed at this phase

---

## 6. Non-Functional Requirements

| Category | Requirement | Details |
|----------|-------------|---------|
| Performance | Container startup < 3 seconds | Using pre-pulled base images, container reuse via sessions |
| Performance | Command execution overhead < 100ms | Overhead of MCP bridge + Docker exec vs. direct execution |
| Performance | Output streaming latency < 200ms | Real-time output delivery to agent |
| Security | Container isolation (no host access) | Drop all Linux capabilities except minimal set, no privileged mode |
| Security | Network isolation by default | No network access unless explicitly enabled per-session |
| Security | Sensitive file protection | Auto-exclude .env, credentials, private keys from mounts |
| Scalability | Max 5 concurrent sessions | Default limit, configurable per developer machine resources |
| Scalability | Session state up to 1GB disk | Per-container disk limit |
| Reliability | Graceful degradation to Local mode | When Docker unavailable, fall back to local execution with warning |
| Reliability | Automatic orphan cleanup | Detect and remove containers from crashed/killed backend |
| Availability | Backend restart does not lose session config | Session metadata stored in SQLite, containers reconnected on startup |
| Observability | Execution metrics (duration, exit code, resource usage) | Logged per command for debugging and optimization |

---

## 7. Related Tickets

| Ticket Key | Summary | Status | Type | Relationship |
|------------|---------|--------|------|--------------|
| SA4E-6 | Sandbox Execution (MCP Server Bridge) | In Progress | Story | Main ticket |
| SA4E-1 | Backend MCP Server (Core Infrastructure) | Done | Story | Foundation — module registry, tool discovery |
| SA4E-5 | Code Intelligence Module | Done | Story | Related — agents use code intelligence + sandbox together |
| SA4E-7 | Web Search & Research Tools | To Do | Story | Sibling feature — extends agent capabilities |

---

## 8. Appendix

### Glossary

| Term | Definition |
|------|------------|
| MCP | Model Context Protocol — communication protocol between AI agents and tools |
| Sandbox | Isolated execution environment (container or restricted process) |
| dockerode | Node.js SDK for Docker Engine API |
| Session | A persistent sandbox instance that maintains state between commands |
| TTL | Time To Live — duration before automatic cleanup of idle sessions |
| DeerFlow | ByteDance's open-source AI agent framework with sandbox execution (reference architecture) |
| MCP Server Bridge | Component that translates MCP tool calls into sandbox execution commands |

### Reference Documents

| Document | Link / Location |
|----------|-----------------|
| DeerFlow Sandbox Reference | https://github.com/bytedance/deer-flow |
| Docker Engine API | https://docs.docker.com/engine/api/ |
| dockerode Documentation | https://github.com/apocas/dockerode |
| MCP Protocol Specification | https://modelcontextprotocol.io/ |
| SA4E Architecture Report | .code-intel/SA4E-ARCHITECTURE.md |
| LangGraph vs DeerFlow Analysis | documents/analysis/langgraph-vs-deerflow-report.md |

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Business Flow | [business-flow.png](diagrams/business-flow.png) | [business-flow.drawio](diagrams/business-flow.drawio) |
| 2 | Use Case Diagram | [use-case.png](diagrams/use-case.png) | [use-case.drawio](diagrams/use-case.drawio) |
