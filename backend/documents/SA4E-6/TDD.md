# Technical Design Document (TDD)

## SDLC Agents 4 Enterprise — SA4E-6: Sandbox Execution (MCP Server Bridge)

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-6 |
| Title | Sandbox Execution (MCP Server Bridge) |
| Author | SA Agent |
| Version | 1.0 |
| Date | 2026-07-03 |
| Status | Draft |
| Related BRD | BRD-v1-SA4E-6.docx |
| Related FSD | FSD-v1-SA4E-6.docx |

---

## Author Tracking

| Role | Name - Position | Responsibility |
|------|-----------------|----------------|
| Author | SA Agent – Solution Architect | Create document |
| Peer Reviewer | SM Agent – Scrum Master | Review document |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-03 | SA Agent | Initiate document — TDD for Sandbox Execution module |

---

## Sign-Off

| Name | Signature and date |
|------|--------------------|
| | ☐ I agree and confirm the technical design in this TDD |
| | ☐ I agree and confirm the technical design in this TDD |

---

## 1. Introduction

> **Scope Boundary:** This TDD specifies HOW to implement the Sandbox Execution module. It does NOT repeat functional requirements from FSD — refer to FSD-v1-SA4E-6.docx for use cases, business rules, and data flows. This document focuses on: technology choices, architecture decisions, implementation patterns, and deployment concerns.

### 1.1 Purpose

Design the Sandbox Execution module as a plugin to the Backend MCP Server (SA4E-1). This module enables AI agents (DEV, QA) to execute code in isolated environments (Docker containers or local processes) via 5 MCP tools discoverable through `find_tools`.

### 1.2 Scope

- **SandboxModule** — implements `IModule` interface, integrates into ModuleRegistry
- **ExecutionManager** — orchestrates session lifecycle and command routing
- **DockerExecutor** — container management via `dockerode`
- **LocalExecutor** — host process execution via `child_process`
- **SessionStore** — in-memory session registry with TTL tracking
- **Reaper** — background cleanup timer
- **5 MCP Tools** — sandbox_session, sandbox_exec, sandbox_run, sandbox_install, sandbox_test

### 1.3 Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Language | TypeScript | 5.x |
| Runtime | Node.js | >=18.14 |
| Container SDK | dockerode | ^4.0.0 |
| Process | child_process (Node.js built-in) | N/A |
| Build | esbuild (existing pipeline) | existing |
| Test | Vitest | existing |
| Logger | pino (existing) | existing |
| UUID | crypto.randomUUID() (Node.js built-in) | N/A |

### 1.4 Design Principles

- **Strategy Pattern** — IExecutor interface with Local/Docker implementations
- **Single Responsibility** — Each class has one clear purpose (max 200 lines)
- **Dependency Inversion** — ExecutionManager depends on IExecutor abstraction
- **Plugin Compliance** — Follow existing IModule lifecycle contract exactly
- **Fail-Safe Defaults** — Network disabled, capabilities dropped, resources limited

### 1.5 Constraints

- Must integrate into existing ModuleRegistry (no new server process)
- Must use existing pino logger and esbuild pipeline
- Docker dependency is optional — module degrades to Local mode
- Max 5 concurrent sessions (configurable)
- No persistent state across backend restarts (sessions are ephemeral)

### 1.6 References

| Document | Location |
|----------|----------|
| BRD | BRD-v1-SA4E-6.docx |
| FSD | FSD-v1-SA4E-6.docx |
| SA4E Architecture | .code-intel/SA4E-ARCHITECTURE.md |
| IModule Interface | backend/src/types/module.ts |
| ModuleRegistry | backend/src/modules/ModuleRegistry.ts |
| DeerFlow Reference | https://github.com/bytedance/deer-flow |

---

## 2. System Architecture

### 2.1 Architecture Overview

The Sandbox Execution module integrates as a new plugin in the Backend MCP Server's ModuleRegistry. It follows the same lifecycle pattern as existing modules (MemoryModule, CodeIntelModule, OrchestrationModule).

![Architecture Diagram](diagrams/architecture.png)

**Key Architectural Decisions:**

| # | Decision | Rationale |
|---|----------|-----------|
| AD-1 | In-process module (not separate service) | Avoid network hop; leverage existing auth, logging, tool discovery |
| AD-2 | Strategy pattern for executors | Easy to add K8s executor later without modifying manager |
| AD-3 | In-memory session store | Sessions are ephemeral; no need for DB persistence |
| AD-4 | Lazy Docker connection | Don't fail backend startup if Docker is unavailable |
| AD-5 | Output buffering with cap | Prevent memory exhaustion from verbose commands |

### 2.2 Component Diagram

![Component Diagram](diagrams/component.png)

| Component | Responsibility | Technology |
|-----------|---------------|------------|
| SandboxModule | IModule lifecycle, tool registration, tool routing | TypeScript |
| ExecutionManager | Session CRUD, command dispatch, mode resolution | TypeScript |
| SessionStore | In-memory session registry, TTL tracking | Map + Timer |
| Reaper | Background cleanup of expired sessions | setInterval |
| DockerExecutor | Container create/exec/stop/remove via dockerode | dockerode |
| LocalExecutor | Process spawn/exec/kill via child_process | Node.js built-in |
| OutputBuffer | Stream capture with size limit (1MB) | Buffer/string |
| TestResultParser | Parse test framework output into structured format | Regex |

### 2.3 Communication Patterns

| From | To | Protocol | Pattern | Description |
|------|----|----------|---------|-------------|
| AI Agent | Backend MCP Server | StreamableHTTP | Sync request/response | Tool calls via MCP |
| SandboxModule | Docker Engine | Unix socket / TCP | Async (dockerode) | Container lifecycle |
| SandboxModule | Host OS | child_process | Async (spawn) | Local execution |
| Reaper | SessionStore | In-process | Timer callback | Periodic cleanup |

---
## 3. API Design (MCP Tools)

> **Prerequisite:** Functional API contracts (parameters, business rules, use case mapping) are in FSD §3. This section specifies JSON schemas, error codes, and technical implementation details.

### 3.1 Tool Overview

| # | Tool Name | Description | Implements |
|---|-----------|-------------|------------|
| 1 | sandbox_session | Create, list, destroy sandbox sessions | UC-01, UC-02, UC-03 |
| 2 | sandbox_exec | Execute bash commands in session | UC-04 |
| 3 | sandbox_run | Run code files with appropriate runtime | UC-05 |
| 4 | sandbox_install | Install packages via npm/pip/apt | UC-06 |
| 5 | sandbox_test | Run test suites with structured output | UC-07 |

All tools are registered in category `'sandbox'` and discoverable via `find_tools("sandbox")`.

---

### 3.2 Tool: sandbox_session

**Implements:** UC-01 (Create), UC-02 (List), UC-03 (Destroy)

**Input Schema:**

```json
{
  "type": "object",
  "properties": {
    "action": { "type": "string", "enum": ["create", "list", "destroy"] },
    "sessionId": { "type": "string", "description": "Required for destroy" },
    "config": {
      "type": "object",
      "properties": {
        "mode": { "type": "string", "enum": ["local", "docker"], "default": "docker" },
        "baseImage": { "type": "string", "default": "node:20-slim" },
        "mounts": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "source": { "type": "string" },
              "target": { "type": "string", "default": "/workspace" },
              "readOnly": { "type": "boolean", "default": false }
            },
            "required": ["source"]
          }
        },
        "resources": {
          "type": "object",
          "properties": {
            "memory": { "type": "string", "default": "512m" },
            "cpu": { "type": "string", "default": "1.0" },
            "disk": { "type": "string", "default": "1g" },
            "pidsLimit": { "type": "number", "default": 100 }
          }
        },
        "network": { "type": "boolean", "default": false },
        "ttl": { "type": "number", "default": 1800, "description": "TTL in seconds" },
        "env": { "type": "object", "additionalProperties": { "type": "string" } }
      }
    }
  },
  "required": ["action"]
}
```

**Response — action=create (success):**

```json
{
  "content": [{
    "type": "text",
    "text": "{\"sessionId\":\"sess_a1b2c3d4\",\"mode\":\"docker\",\"status\":\"running\",\"baseImage\":\"node:20-slim\",\"createdAt\":\"2026-07-03T10:00:00Z\",\"ttl\":1800}"
  }],
  "isError": false
}
```

**Response — action=list:**

```json
{
  "content": [{
    "type": "text",
    "text": "{\"sessions\":[{\"sessionId\":\"sess_a1b2c3d4\",\"mode\":\"docker\",\"status\":\"running\",\"createdAt\":\"...\",\"lastActivity\":\"...\",\"idleSeconds\":120}]}"
  }],
  "isError": false
}
```

**Error Responses:**

| Condition | Error Code | Message |
|-----------|-----------|---------|
| Docker unavailable (no fallback) | DOCKER_UNAVAILABLE | Docker is not available. Start Docker Desktop or set sandbox.fallbackToLocal=true |
| Max sessions reached | MAX_SESSIONS | Maximum 5 concurrent sessions. Destroy idle sessions first. |
| Session not found (destroy) | SESSION_NOT_FOUND | Session {id} not found or already destroyed. |
| Image pull failed | IMAGE_PULL_FAILED | Cannot pull image {image}. Check network connectivity. |

---

### 3.3 Tool: sandbox_exec

**Implements:** UC-04

**Input Schema:**

```json
{
  "type": "object",
  "properties": {
    "command": { "type": "string", "minLength": 1 },
    "sessionId": { "type": "string", "description": "If omitted, auto-creates ephemeral session" },
    "workdir": { "type": "string", "description": "Working directory inside sandbox" },
    "timeout": { "type": "number", "default": 300, "minimum": 1, "maximum": 600 },
    "env": { "type": "object", "additionalProperties": { "type": "string" } }
  },
  "required": ["command"]
}
```

**Response (success):**

```json
{
  "content": [{
    "type": "text",
    "text": "{\"exitCode\":0,\"stdout\":\"hello world\\n\",\"stderr\":\"\",\"duration\":45,\"truncated\":false,\"sessionId\":\"sess_a1b2c3d4\",\"timedOut\":false}"
  }],
  "isError": false
}
```

**Error Responses:**

| Condition | Error Code | Message |
|-----------|-----------|---------|
| Command timeout | EXEC_TIMEOUT | Command timed out after {timeout}s. Process killed. |
| OOM killed | OOM_KILLED | Memory limit exceeded (512MB). Increase session memory or optimize command. |
| Session not found | SESSION_NOT_FOUND | Session {id} not found. Create a new session first. |
| Container stopped | CONTAINER_STOPPED | Container is not running. Create a new session. |

---

### 3.4 Tool: sandbox_run

**Implements:** UC-05

**Input Schema:**

```json
{
  "type": "object",
  "properties": {
    "file": { "type": "string", "description": "Path to file inside container" },
    "runtime": { "type": "string", "enum": ["node", "python", "tsx", "java", "sh"] },
    "args": { "type": "array", "items": { "type": "string" } },
    "sessionId": { "type": "string" },
    "timeout": { "type": "number", "default": 300 }
  },
  "required": ["file", "runtime", "sessionId"]
}
```

**Runtime Mapping:**

| Runtime | Command Template |
|---------|-----------------|
| node | `node {file} {args}` |
| python | `python3 {file} {args}` |
| tsx | `npx tsx {file} {args}` |
| java | `gradle run` or `javac {file} && java {class}` |
| sh | `bash {file} {args}` |

---

### 3.5 Tool: sandbox_install

**Implements:** UC-06

**Input Schema:**

```json
{
  "type": "object",
  "properties": {
    "manager": { "type": "string", "enum": ["npm", "pip", "apt"] },
    "packages": { "type": "array", "items": { "type": "string" }, "minItems": 1 },
    "sessionId": { "type": "string" },
    "flags": { "type": "string", "description": "Additional flags (e.g. --save-dev)" }
  },
  "required": ["manager", "packages", "sessionId"]
}
```

**Manager Command Mapping:**

| Manager | Command |
|---------|---------|
| npm | `npm install {flags} {packages.join(' ')}` |
| pip | `pip install {packages.join(' ')}` |
| apt | `apt-get update && apt-get install -y {packages.join(' ')}` |

---

### 3.6 Tool: sandbox_test

**Implements:** UC-07

**Input Schema:**

```json
{
  "type": "object",
  "properties": {
    "framework": { "type": "string", "enum": ["vitest", "jest", "pytest", "gradle", "mocha"] },
    "sessionId": { "type": "string" },
    "testPath": { "type": "string" },
    "coverage": { "type": "boolean", "default": false },
    "configFile": { "type": "string" }
  },
  "required": ["framework", "sessionId"]
}
```

**Response (structured test result):**

```json
{
  "content": [{
    "type": "text",
    "text": "{\"status\":\"failure\",\"total\":15,\"passed\":12,\"failed\":2,\"skipped\":1,\"failures\":[{\"test\":\"should validate input\",\"message\":\"Expected true, got false\",\"file\":\"src/__tests__/validator.test.ts\",\"line\":42}],\"coverage\":{\"statements\":85.2,\"branches\":72.1,\"functions\":90.0,\"lines\":84.8},\"duration\":3200,\"exitCode\":1}"
  }],
  "isError": false
}
```

---
## 4. Data Model (In-Memory)

> **Prerequisite:** Logical data model is defined in FSD §4. This section specifies TypeScript interfaces and storage implementation.

### 4.1 Core Interfaces

```typescript
// models/Session.ts
export interface Session {
  sessionId: string;           // crypto.randomUUID() prefixed with 'sess_'
  mode: ExecutionMode;
  status: SessionStatus;
  containerId?: string;        // Docker container ID (Docker mode only)
  baseImage: string;           // Default: 'node:20-slim'
  mounts: Mount[];
  resources: ResourceLimits;
  networkEnabled: boolean;
  createdAt: Date;
  lastActivity: Date;
  ttl: number;                 // Seconds, default 1800
  env: Record<string, string>;
}

export type ExecutionMode = 'local' | 'docker';
export type SessionStatus = 'creating' | 'running' | 'stopping' | 'destroyed';

// models/Mount.ts
export interface Mount {
  source: string;              // Host filesystem path
  target: string;              // Container path, default '/workspace'
  readOnly: boolean;           // Default: false
  excludePatterns: string[];   // Default: ['.env', '*.pem', '*.key', '.git/credentials']
}

// models/ResourceLimits.ts
export interface ResourceLimits {
  memory: string;    // Default: '512m' → 536870912 bytes
  cpu: string;       // Default: '1.0' → CpuQuota=100000
  disk: string;      // Default: '1g'
  pidsLimit: number; // Default: 100
}

// models/ExecutionResult.ts
export interface ExecutionResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;      // milliseconds
  truncated: boolean;
  sessionId: string;
  timedOut: boolean;
}

// models/TestResult.ts (extends ExecutionResult)
export interface TestResult extends ExecutionResult {
  status: 'success' | 'failure' | 'error';
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  failures: TestFailure[];
  coverage?: CoverageSummary;
}

export interface TestFailure {
  test: string;
  message: string;
  file?: string;
  line?: number;
}

export interface CoverageSummary {
  statements: number;
  branches: number;
  functions: number;
  lines: number;
}
```

### 4.2 Storage Strategy

| Data | Storage | Lifetime | Recovery |
|------|---------|----------|----------|
| Session metadata | In-memory Map<string, Session> | Backend process lifetime | Not persisted — recreate on restart |
| Container state | Docker Engine | Until container removed | Orphan recovery on startup |
| Execution output | Response only (not stored) | Single request/response | Not recoverable |
| Config | backend config file | Persistent | File-based |

### 4.3 Configuration Schema

```typescript
// Part of backend config (engine/config.ts extension)
export interface SandboxConfig {
  defaultMode: ExecutionMode;           // 'docker' | 'local'
  fallbackToLocal: boolean;             // Default: true
  maxSessions: number;                  // Default: 5
  defaultTtl: number;                   // Default: 1800 (seconds)
  defaultImage: string;                 // Default: 'node:20-slim'
  defaultResources: ResourceLimits;
  reaperIntervalMs: number;             // Default: 60000 (60s)
  dockerSocket?: string;                // Default: undefined (dockerode auto-detect)
  mountExcludePatterns: string[];       // Default: ['.env', '*.pem', '*.key', '.git/credentials']
  maxOutputBytes: number;               // Default: 1048576 (1MB)
  commandTimeoutDefault: number;        // Default: 300 (seconds)
  commandTimeoutMax: number;            // Default: 600 (seconds)
}
```

---
## 5. Class / Module Design

### 5.1 Package Structure

```
backend/src/modules/sandbox/
├── SandboxModule.ts           # IModule implementation (entry point)
├── ExecutionManager.ts        # Session lifecycle + command routing
├── SessionStore.ts            # In-memory session registry
├── Reaper.ts                  # TTL cleanup timer
├── executors/
│   ├── IExecutor.ts           # Strategy interface
│   ├── DockerExecutor.ts      # Docker implementation
│   └── LocalExecutor.ts       # Local process implementation
├── parsers/
│   ├── TestResultParser.ts    # Test output parsing
│   └── OutputBuffer.ts        # Stream capture with size limit
├── models/
│   ├── Session.ts             # Session interface + types
│   ├── Mount.ts               # Mount configuration
│   ├── ResourceLimits.ts      # Resource limits interface
│   ├── ExecutionResult.ts     # Command execution result
│   └── TestResult.ts          # Structured test result
├── config/
│   └── SandboxConfig.ts       # Configuration schema + defaults
├── tools/
│   ├── tool-definitions.ts    # MCP tool schemas (5 tools)
│   └── tool-handlers.ts       # Tool handler implementations
└── __tests__/
    ├── SandboxModule.test.ts
    ├── ExecutionManager.test.ts
    ├── DockerExecutor.test.ts
    ├── LocalExecutor.test.ts
    ├── SessionStore.test.ts
    ├── Reaper.test.ts
    └── TestResultParser.test.ts
```

### 5.2 Key Interfaces

```typescript
// executors/IExecutor.ts
export interface IExecutor {
  readonly mode: ExecutionMode;
  
  createSession(config: SessionCreateConfig): Promise<Session>;
  destroySession(session: Session): Promise<void>;
  
  execute(session: Session, command: string, options: ExecOptions): Promise<ExecutionResult>;
  
  isAvailable(): Promise<boolean>;
}

export interface SessionCreateConfig {
  baseImage: string;
  mounts: Mount[];
  resources: ResourceLimits;
  networkEnabled: boolean;
  env: Record<string, string>;
}

export interface ExecOptions {
  workdir?: string;
  timeout: number;
  env?: Record<string, string>;
}
```

```typescript
// ExecutionManager.ts
export interface IExecutionManager {
  createSession(config: Partial<SessionCreateConfig>): Promise<Session>;
  listSessions(): SessionInfo[];
  destroySession(sessionId: string): Promise<void>;
  execute(sessionId: string | undefined, command: string, options: ExecOptions): Promise<ExecutionResult>;
  shutdown(): Promise<void>;
}
```

### 5.3 Class Diagram

![Class Diagram](diagrams/class-sandbox.png)

### 5.4 Design Patterns

| Pattern | Where Used | Rationale |
|---------|-----------|-----------|
| Strategy | IExecutor → DockerExecutor / LocalExecutor | Swap execution backend without modifying manager |
| Factory Method | ExecutionManager.createExecutor() | Mode-based executor instantiation |
| Observer | Reaper observes SessionStore | Decouple cleanup logic from session management |
| Facade | SandboxModule tool handlers | Simplify complex ExecutionManager API for MCP tools |
| Template Method | IExecutor.execute() flow | Common pre/post steps (timeout, output capture) |

### 5.5 Key Implementation Details

#### SandboxModule (IModule implementation)

```typescript
export class SandboxModule implements IModule {
  readonly name = 'sandbox';
  private _status: ModuleStatus = 'initializing';
  private manager: ExecutionManager;
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger.child({ module: this.name });
    this.manager = new ExecutionManager(this.logger);
  }

  get status(): ModuleStatus { return this._status; }

  async initialize(): Promise<void> {
    await this.manager.initialize();
    this._status = 'ready';
  }

  async shutdown(): Promise<void> {
    await this.manager.shutdown();
    this._status = 'stopped';
  }

  getToolHandlers(): Map<string, ToolHandler> { /* see §3 */ }
  getToolDefinitions(): ToolDefinition[] { /* see §3 */ }
}
```

#### DockerExecutor Key Flows

```typescript
export class DockerExecutor implements IExecutor {
  readonly mode = 'docker' as const;
  private docker: Docker;  // dockerode instance

  async createSession(config: SessionCreateConfig): Promise<Session> {
    // 1. Pull image if not available locally
    // 2. Create container with HostConfig:
    //    - Memory: parseMemory(config.resources.memory)
    //    - CpuQuota: parseCpu(config.resources.cpu) * 100000
    //    - PidsLimit: config.resources.pidsLimit
    //    - NetworkMode: config.networkEnabled ? 'bridge' : 'none'
    //    - Binds: filterMounts(config.mounts)
    //    - SecurityOpt: ['no-new-privileges:true']
    //    - CapDrop: ['ALL']
    //    - Labels: { 'sa4e-sandbox': 'true', 'sa4e-session': sessionId }
    // 3. Start container
    // 4. Return Session object
  }

  async execute(session: Session, command: string, options: ExecOptions): Promise<ExecutionResult> {
    // 1. Create exec instance: container.exec({ Cmd: ['bash', '-c', command], ... })
    // 2. Start exec with output stream attach
    // 3. Capture stdout/stderr with OutputBuffer (1MB cap)
    // 4. Apply timeout (setTimeout → exec.kill if not done)
    // 5. Wait for completion, get exit code via exec.inspect()
    // 6. Return ExecutionResult
  }

  async destroySession(session: Session): Promise<void> {
    // 1. container.stop({ t: 10 }) — 10s grace period
    // 2. container.remove({ force: true })
  }

  async isAvailable(): Promise<boolean> {
    // docker.ping() — returns true if Docker daemon responds
  }
}
```

#### LocalExecutor Key Flows

```typescript
export class LocalExecutor implements IExecutor {
  readonly mode = 'local' as const;
  private processes: Map<string, ChildProcess> = new Map();

  async createSession(config: SessionCreateConfig): Promise<Session> {
    // 1. Validate: no resource limits enforcement in local mode (log warning)
    // 2. Create session metadata (no container)
    // 3. Return Session with status='running'
  }

  async execute(session: Session, command: string, options: ExecOptions): Promise<ExecutionResult> {
    // 1. spawn('bash', ['-c', command], { cwd: options.workdir, env, timeout })
    // 2. Capture stdout/stderr with OutputBuffer
    // 3. Handle timeout via AbortController
    // 4. Return ExecutionResult
  }

  async isAvailable(): Promise<boolean> {
    return true;  // Always available
  }
}
```

### 5.6 Error Handling

| Exception | Error Code | When Thrown |
|-----------|-----------|------------|
| DockerUnavailableError | DOCKER_UNAVAILABLE | Docker daemon not responding + fallback disabled |
| MaxSessionsError | MAX_SESSIONS | SessionStore.count >= maxSessions |
| SessionNotFoundError | SESSION_NOT_FOUND | sessionId not in SessionStore |
| ExecTimeoutError | EXEC_TIMEOUT | Command exceeded timeout |
| OomKilledError | OOM_KILLED | Container exit code 137 detected |
| ImagePullError | IMAGE_PULL_FAILED | dockerode pull fails (network/not found) |
| MountError | MOUNT_FAILED | Source path doesn't exist or permission denied |

All errors extend a base `SandboxError` class:

```typescript
export class SandboxError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>
  ) {
    super(message);
    this.name = 'SandboxError';
  }
}
```

---
## 6. Integration Design

### 6.1 External System: Docker Engine

| Attribute | Value |
|-----------|-------|
| Protocol | Unix socket `/var/run/docker.sock` (Linux/Mac) or named pipe `//./pipe/docker_engine` (Windows) |
| SDK | dockerode ^4.0.0 |
| Authentication | None (local socket) |
| Timeout | Container operations: 30s; Exec operations: command timeout + 5s buffer |
| Retry Policy | Image pull: 2 retries with 5s backoff; Container ops: no retry (fail fast) |
| Circuit Breaker | Not needed (local service, fast fail on connection refused) |

**Docker API Operations Used:**

| Operation | dockerode Method | When |
|-----------|-----------------|------|
| Health check | docker.ping() | initialize(), isAvailable() |
| Pull image | docker.pull(image) | createSession (if image not local) |
| Create container | docker.createContainer(opts) | createSession |
| Start container | container.start() | createSession |
| Create exec | container.exec(opts) | execute |
| Start exec | exec.start(opts) | execute |
| Inspect exec | exec.inspect() | execute (get exit code) |
| Stop container | container.stop({ t: 10 }) | destroySession |
| Remove container | container.remove({ force: true }) | destroySession |
| List containers | docker.listContainers({ filters }) | orphan recovery |

**Security Configuration (HostConfig):**

```typescript
const hostConfig: Docker.HostConfig = {
  Memory: parseBytes(resources.memory),     // 536870912 for '512m'
  CpuQuota: Math.floor(parseFloat(resources.cpu) * 100000),
  PidsLimit: resources.pidsLimit,
  NetworkMode: networkEnabled ? 'bridge' : 'none',
  Binds: mounts.map(m => `${m.source}:${m.target}:${m.readOnly ? 'ro' : 'rw'}`),
  SecurityOpt: ['no-new-privileges:true'],
  CapDrop: ['ALL'],
  ReadonlyRootfs: false,  // Need write for package install
};
```

### 6.2 Internal System: ModuleRegistry Integration

**Registration (in backend/src/index.ts):**

```typescript
import { SandboxModule } from './modules/sandbox/SandboxModule.js';

// In server initialization:
const sandboxModule = new SandboxModule(logger);
registry.register(sandboxModule);
```

**Tool Discovery Integration:**

After module initialization, SandboxModule's 5 tools are:
1. Available via `registry.getToolHandlers()` for direct execution
2. Ingested into `mcp_tools` table with ONNX embeddings for `find_tools` semantic search

```typescript
// Embedding registration happens in server.ts after all modules init
for (const def of registry.getAllToolDefinitions()) {
  const embedding = await embeddingService.generateEmbedding(
    `${def.name} ${def.description}`
  );
  db.prepare(`INSERT OR REPLACE INTO mcp_tools (name, description, schema_json, vector, category) VALUES (?,?,?,?,?)`)
    .run(def.name, def.description, JSON.stringify(def.inputSchema), Buffer.from(new Float32Array(embedding).buffer), def.category);
}
```

### 6.3 Sequence Diagrams

#### Session Creation Flow

![Session Creation Sequence](diagrams/sequence-session-creation.png)

#### Command Execution Flow

![Command Execution Sequence](diagrams/sequence-command-execution.png)

---
## 7. Security Design

> **Prerequisite:** Business security requirements are in FSD §3.5 (BR-07, BR-08, BR-12). This section specifies implementation.

### 7.1 Container Isolation

| Security Layer | Implementation | Purpose |
|----------------|---------------|---------|
| Capability Drop | `CapDrop: ['ALL']` | No privileged syscalls |
| No New Privileges | `SecurityOpt: ['no-new-privileges:true']` | Prevent privilege escalation |
| Network Isolation | `NetworkMode: 'none'` (default) | No data exfiltration |
| Non-root User | Container user = node (UID 1000) | Reduce attack surface |
| Resource Limits | Memory, CPU, PIDs, Disk | Prevent DoS on host |

### 7.2 Mount Security

**Default Exclude Patterns:**

```typescript
const DEFAULT_EXCLUDE = [
  '.env',
  '.env.*',
  '*.pem',
  '*.key',
  '*.p12',
  '.git/credentials',
  '.ssh/',
  '.aws/',
  'node_modules/.cache/*/secrets*',
];
```

**Mount Filtering Algorithm:**

```typescript
function filterMounts(mounts: Mount[], excludePatterns: string[]): string[] {
  return mounts.map(mount => {
    // For Docker bind mounts, exclusion happens via .dockerignore-style
    // We create a temp directory with symlinks minus excluded files
    // OR use volume + copy (more secure but slower)
    
    // Simplified: warn user that excluded files won't be accessible
    return `${mount.source}:${mount.target}:${mount.readOnly ? 'ro' : 'rw'}`;
  });
}
```

**Note:** True file-level exclusion within a bind mount is not natively supported by Docker. Implementation uses a pre-mount validation step that checks if excluded patterns exist in the source directory and logs warnings. For strict security, use read-only mounts with explicit include lists.

### 7.3 Input Validation

| Input | Validation | Sanitization |
|-------|-----------|--------------|
| command (sandbox_exec) | Non-empty string, max 10KB | No sanitization (agent responsible) |
| sessionId | UUID v4 format with 'sess_' prefix | Strict regex match |
| baseImage | Docker image reference format | Reject shell metacharacters |
| mount source path | Absolute path, must exist | Resolve symlinks, check within allowed roots |
| timeout | 1-600 integer | Clamp to range |
| packages (install) | Array of strings, no shell metacharacters | Reject `;`, `&&`, `\|`, backticks |

### 7.4 Local Mode Security Considerations

⚠️ **Local mode provides NO isolation.** Commands execute directly on the host with the backend process's permissions. This is acceptable for development but MUST NOT be used in shared/production environments.

Mitigations in local mode:
- Timeout enforcement via AbortController
- Output size cap (1MB)
- Process kill on timeout (SIGKILL after SIGTERM grace period)
- No resource limits (OS-level only)

---
## 8. Performance & Scalability

### 8.1 Performance Targets

| Operation | Target | Measurement | Notes |
|-----------|--------|-------------|-------|
| Session creation (Docker, pre-pulled image) | < 3s | Time from API call to status=running | Cold start with image pull excluded |
| Session creation (Local) | < 50ms | Time from API call to status=running | No container overhead |
| Command execution overhead | < 100ms | MCP bridge + Docker exec setup | Excludes command itself |
| Output streaming latency | < 200ms | First byte from command to agent | Buffered in 4KB chunks |
| Session destroy | < 5s | Time from API call to container removed | 10s grace + force kill |
| Reaper cycle | < 100ms | Time to scan all sessions and destroy expired | O(n) where n ≤ 5 |

### 8.2 Resource Constraints

| Resource | Limit | Scope | Enforcement |
|----------|-------|-------|-------------|
| Memory per container | 512MB (default) | Per session | Docker OOM killer |
| CPU per container | 1 core (default) | Per session | Docker CpuQuota |
| Disk per container | 1GB (default) | Per session | Docker storage driver |
| PIDs per container | 100 (default) | Per session | Docker PidsLimit |
| Concurrent sessions | 5 (default) | Per backend instance | SessionStore check |
| Output buffer | 1MB per stream | Per command | OutputBuffer class |
| Command timeout | 300s default, 600s max | Per command | Timer + process kill |

### 8.3 Optimization Strategies

| Strategy | Implementation | Benefit |
|----------|---------------|---------|
| Pre-pulled images | Document required images in DPG | Avoid pull latency at session create |
| Container reuse | Sessions persist between commands | No per-command container startup |
| Output streaming | Pipe stdout/stderr chunks to buffer | Low memory footprint |
| Lazy Docker init | Connect to Docker only on first sandbox tool call | No startup penalty if sandbox unused |
| Session TTL | Auto-destroy idle sessions | Free resources automatically |

---

## 9. Monitoring & Observability

### 9.1 Logging

| Log Event | Level | Fields | When |
|-----------|-------|--------|------|
| Session created | INFO | sessionId, mode, baseImage | After container starts |
| Session destroyed | INFO | sessionId, reason (explicit/ttl/shutdown) | After container removed |
| Command executed | INFO | sessionId, command (truncated 100 chars), exitCode, duration | After command completes |
| Command timeout | WARN | sessionId, command, timeout | When timeout fires |
| OOM kill detected | WARN | sessionId, memory limit | Exit code 137 |
| Docker unavailable | WARN | error message | On ping failure |
| Orphan recovered | INFO | containerId, labels | On startup cleanup |
| Reaper cycle | DEBUG | sessionCount, expired, destroyed | Every reaper tick |

### 9.2 Metrics (Structured Logging)

| Metric | Type | Description |
|--------|------|-------------|
| sandbox.sessions.active | Gauge | Current active session count |
| sandbox.sessions.created | Counter | Total sessions created |
| sandbox.sessions.destroyed | Counter | Total sessions destroyed (by reason) |
| sandbox.exec.duration | Histogram | Command execution duration (ms) |
| sandbox.exec.timeout | Counter | Commands that timed out |
| sandbox.exec.oom | Counter | OOM kills detected |
| sandbox.docker.available | Gauge | 1 if Docker available, 0 if not |

### 9.3 Health Check

SandboxModule contributes to backend health endpoint:

```json
{
  "sandbox": {
    "status": "ready",
    "activeSessions": 2,
    "dockerAvailable": true,
    "reaperRunning": true
  }
}
```

---
## 10. Deployment Considerations

### 10.1 Dependencies to Install

| Package | Version | Purpose | Dev Only |
|---------|---------|---------|----------|
| dockerode | ^4.0.0 | Docker Engine SDK | No |
| @types/dockerode | ^3.3.x | TypeScript types | Yes |

**No other new dependencies required.** All other capabilities (child_process, crypto, timers) are Node.js built-ins.

### 10.2 Configuration

Add to backend config file:

```yaml
sandbox:
  defaultMode: docker           # 'docker' | 'local'
  fallbackToLocal: true         # Fall back to local if Docker unavailable
  maxSessions: 5
  defaultTtl: 1800              # 30 minutes
  defaultImage: "node:20-slim"
  reaperIntervalMs: 60000       # 60 seconds
  maxOutputBytes: 1048576       # 1MB
  commandTimeoutDefault: 300    # 5 minutes
  commandTimeoutMax: 600        # 10 minutes
  mountExcludePatterns:
    - ".env"
    - "*.pem"
    - "*.key"
    - ".git/credentials"
    - ".ssh/"
    - ".aws/"
  defaultResources:
    memory: "512m"
    cpu: "1.0"
    disk: "1g"
    pidsLimit: 100
```

### 10.3 Prerequisites

| Prerequisite | Required For | Check Command |
|-------------|-------------|---------------|
| Docker Desktop / Engine | Docker mode | `docker version` |
| Docker socket accessible | Docker mode | `docker ps` (no permission error) |
| Node.js >= 18.14 | All modes | `node --version` |
| Pre-pull base image | Fast Docker session create | `docker pull node:20-slim` |

### 10.4 Feature Flags

| Flag | Default | Description |
|------|---------|-------------|
| sandbox.enabled | true | Master kill switch for sandbox module |
| sandbox.docker.enabled | true | Enable Docker executor |
| sandbox.local.enabled | true | Enable Local executor |

### 10.5 Rollback Strategy

Module is isolated within ModuleRegistry. Rollback:
1. Remove `SandboxModule` registration from `backend/src/index.ts`
2. Remove `backend/src/modules/sandbox/` directory
3. Remove `dockerode` from package.json
4. Rebuild — no other modules affected

No database migrations. No schema changes. No external service dependencies that persist.

---

## 11. Implementation Checklist

### 11.1 Files to Create

| # | File | Lines (est.) | Priority |
|---|------|-------------|----------|
| 1 | `modules/sandbox/models/Session.ts` | 30 | P0 |
| 2 | `modules/sandbox/models/Mount.ts` | 15 | P0 |
| 3 | `modules/sandbox/models/ResourceLimits.ts` | 15 | P0 |
| 4 | `modules/sandbox/models/ExecutionResult.ts` | 20 | P0 |
| 5 | `modules/sandbox/models/TestResult.ts` | 25 | P0 |
| 6 | `modules/sandbox/config/SandboxConfig.ts` | 40 | P0 |
| 7 | `modules/sandbox/executors/IExecutor.ts` | 25 | P0 |
| 8 | `modules/sandbox/executors/DockerExecutor.ts` | 180 | P0 |
| 9 | `modules/sandbox/executors/LocalExecutor.ts` | 120 | P0 |
| 10 | `modules/sandbox/SessionStore.ts` | 60 | P0 |
| 11 | `modules/sandbox/Reaper.ts` | 50 | P0 |
| 12 | `modules/sandbox/ExecutionManager.ts` | 180 | P0 |
| 13 | `modules/sandbox/parsers/OutputBuffer.ts` | 40 | P0 |
| 14 | `modules/sandbox/parsers/TestResultParser.ts` | 100 | P1 |
| 15 | `modules/sandbox/tools/tool-definitions.ts` | 80 | P0 |
| 16 | `modules/sandbox/tools/tool-handlers.ts` | 150 | P0 |
| 17 | `modules/sandbox/SandboxModule.ts` | 60 | P0 |
| 18 | `modules/sandbox/errors.ts` | 40 | P0 |

### 11.2 Files to Modify

| # | File | Change | Impact |
|---|------|--------|--------|
| 1 | `backend/src/index.ts` | Add SandboxModule registration | Low — 3 lines |
| 2 | `backend/package.json` | Add dockerode dependency | Low |
| 3 | `backend/src/types/tool.ts` | Add 'sandbox' to category union | Low — 1 line |

### 11.3 Implementation Order

```
Phase 1: Foundation (Day 1)
  1. Models (Session, Mount, ResourceLimits, ExecutionResult)
  2. Config (SandboxConfig with defaults)
  3. Errors (SandboxError + specific errors)
  4. IExecutor interface

Phase 2: Executors (Day 2-3)
  5. OutputBuffer (stream capture)
  6. LocalExecutor (simpler, test first)
  7. DockerExecutor (complex, depends on dockerode)
  
Phase 3: Session Management (Day 3-4)
  8. SessionStore
  9. Reaper
  10. ExecutionManager

Phase 4: MCP Integration (Day 4-5)
  11. Tool definitions (5 tool schemas)
  12. Tool handlers (routing to ExecutionManager)
  13. SandboxModule (IModule lifecycle)
  14. Registration in index.ts

Phase 5: Test Parsing (Day 5)
  15. TestResultParser (Vitest, Jest, Pytest patterns)

Phase 6: Testing (Day 5-7)
  16. Unit tests for each class
  17. Integration tests with Docker
```

---
## 12. Appendix

### Glossary

| Term | Definition |
|------|------------|
| MCP | Model Context Protocol — agent-tool communication standard |
| IModule | Backend plugin interface (initialize, shutdown, getToolHandlers, getToolDefinitions) |
| ModuleRegistry | Plugin manager that registers and initializes all backend modules |
| dockerode | Node.js SDK for Docker Engine API |
| HostConfig | Docker container configuration for resource limits and security |
| Reaper | Background timer that destroys sessions exceeding TTL |
| OutputBuffer | Stream capture utility with configurable size cap |
| Strategy Pattern | Design pattern where algorithm (executor) is selected at runtime |

### Open Questions

| # | Question | Status | Answer |
|---|----------|--------|--------|
| 1 | Should we support custom Dockerfiles for session images? | Deferred | Phase 2 — custom images via pre-built |
| 2 | Should output streaming use Server-Sent Events? | Resolved | No — MCP request/response is sufficient. Agent polls for long commands. |
| 3 | Should sessions survive backend restart? | Resolved | No — sessions are ephemeral. Orphan cleanup handles crash recovery. |
| 4 | K8s executor design? | Deferred | Separate ticket, same IExecutor interface |

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Architecture Overview | [architecture.png](diagrams/architecture.png) | [architecture.drawio](diagrams/architecture.drawio) |
| 2 | Component Diagram | [component.png](diagrams/component.png) | [component.drawio](diagrams/component.drawio) |
| 3 | Class Diagram | [class-sandbox.png](diagrams/class-sandbox.png) | [class-sandbox.drawio](diagrams/class-sandbox.drawio) |
| 4 | Session Creation Sequence | [sequence-session-creation.png](diagrams/sequence-session-creation.png) | [sequence-session-creation.drawio](diagrams/sequence-session-creation.drawio) |
| 5 | Command Execution Sequence | [sequence-command-execution.png](diagrams/sequence-command-execution.png) | [sequence-command-execution.drawio](diagrams/sequence-command-execution.drawio) |
| 6 | Session Lifecycle State | [state-session-lifecycle.png](diagrams/state-session-lifecycle.png) | [state-session-lifecycle.drawio](diagrams/state-session-lifecycle.drawio) |
