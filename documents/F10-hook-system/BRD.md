# Business Requirements Document (BRD)

## Kiro IDE Extension — F10: Hook System

---

## Document Information

| Field | Value |
|-------|-------|
| Feature ID | F10 |
| Title | Hook System |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2025-07-03 |
| Status | Draft |
| Architecture Pattern | AI Agent System + Plugin |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-07-03 | BA Agent | Initial document — feature analysis from source code |

---

## 1. Introduction

### 1.1 Scope

The Hook System provides a plugin-style extensibility mechanism for the Kiro AI agent pipeline. It allows users and developers to define custom hooks that fire at specific points in the agent lifecycle (tool invocations, file operations, prompt submissions, task execution) and trigger actions (injecting prompts or running shell commands). Hooks are loaded from `.kiro/hooks/` directory as JSON or `.kiro.hook` files.

### 1.2 Out of Scope

- Hook marketplace / sharing between projects
- Visual hook editor UI
- Hook dependency management (hooks cannot depend on other hooks)
- Hooks for non-LangGraph pipelines (e.g., legacy workflows)
- Custom hook action types beyond `askAgent` and `runCommand`

### 1.3 Preliminary Requirements

- LangGraph pipeline operational (chat panel functional)
- VS Code extension host active with workspace folder
- `.kiro/hooks/` directory structure established
- StreamHandler available for UI event emission

---

## 2. Business Requirements

### 2.1 High Level Process Map

The Hook System intercepts the AI agent pipeline at key checkpoints. When a matching event occurs, the system loads hook definitions, filters applicable hooks, executes their actions, and returns results to the pipeline for continuation or denial.

### 2.2 List of User Stories / Use Cases

| # | Story / Use Case | Priority | Source |
|---|-----------------|----------|--------|
| 1 | As a developer, I want to define hooks that fire before/after tool calls so I can enforce coding standards automatically | MUST HAVE | hook-engine.ts |
| 2 | As a developer, I want hooks to fire when files are created/edited/deleted so I can trigger automated processes | MUST HAVE | hook-engine.ts |
| 3 | As a developer, I want to trigger hooks manually via VS Code commands so I can run custom automations on demand | SHOULD HAVE | hook-commands.ts |
| 4 | As a developer, I want hooks to inject prompts into the AI agent so I can guide agent behavior contextually | MUST HAVE | hook-executor.ts |
| 5 | As a developer, I want hooks to run shell commands so I can integrate external tools into the pipeline | MUST HAVE | hook-executor.ts |
| 6 | As a developer, I want tool-type matching (read/write/shell/web) so I can target hooks by tool category | MUST HAVE | hook-tool-matcher.ts |
| 7 | As a developer, I want file pattern matching (glob) so I can scope file hooks to specific paths | MUST HAVE | hook-tool-matcher.ts |
| 8 | As a developer, I want circular dependency detection so hooks cannot trigger infinite loops | MUST HAVE | hook-events.ts |
| 9 | As a developer, I want hook execution results visible in the chat panel so I can see what hooks fired | SHOULD HAVE | hook-emitter.ts |
| 10 | As a developer, I want hot-reload of hooks without restarting the extension so I can iterate quickly | SHOULD HAVE | hook-loader.ts |

---

### 2.3 Details of User Stories

---

#### Business Flow

![Business Flow](diagrams/business-flow.png)

**Step 1:** User creates/edits hook definition files in `.kiro/hooks/` directory

**Step 2:** Extension loads and validates hook definitions at startup and on reload

**Step 3:** Agent pipeline reaches a checkpoint (pre-tool, post-tool, prompt submit, etc.)

**Step 4:** Hook engine matches applicable hooks by event type, tool category, and file patterns

**Step 5:** Matched hooks execute their actions (askAgent / runCommand)

**Step 6:** Results are emitted to UI and returned to pipeline (injected prompts or denial)

**Step 7:** Pipeline continues with hook-injected context or halts if denied

---

#### STORY 1: Pre/Post Tool Hooks

> As a developer, I want to define hooks that fire before and after tool calls so I can enforce coding standards and trigger follow-up actions automatically.

**Requirement Details:**

1. Hooks with `when.type = "preToolUse"` fire BEFORE any agent tool call is executed
2. Hooks with `when.type = "postToolUse"` fire AFTER a tool call completes
3. PreToolUse hooks can DENY a tool call (preventing execution) or inject additional context
4. PostToolUse hooks can inject follow-up prompts into the agent conversation
5. Tool matching supports: exact tool name, tool category (read/write/shell/web), wildcard (*), regex patterns

**Acceptance Criteria:**

1. GIVEN a hook with `when.type = "preToolUse"` and `toolTypes: ["write"]`, WHEN the agent calls `fs_write`, THEN the hook fires before execution
2. GIVEN a preToolUse hook that detects a denial pattern, WHEN it returns denied status, THEN the tool call is blocked and the agent receives the denial reason
3. GIVEN a hook with `toolTypes: ["*"]`, WHEN any tool is called, THEN the hook fires
4. GIVEN a hook with `toolTypes: ["fs_write"]`, WHEN `fs_write` is called, THEN it matches by exact name
5. GIVEN a hook with `toolTypes: ["str_.*"]`, WHEN `str_replace` is called, THEN it matches by regex

---

#### STORY 2: File Event Hooks

> As a developer, I want hooks to fire when files are created, edited, or deleted so I can trigger automated processes like indexing or validation.

**Requirement Details:**

1. Hooks with `when.type = "fileCreated"` fire when a write tool creates a new file
2. Hooks with `when.type = "fileEdited"` fire when a write tool modifies an existing file
3. Hooks with `when.type = "fileDeleted"` fire when `delete_file` is called
4. File hooks support glob patterns in `when.patterns` to scope to specific file types/paths
5. If no patterns specified, hook fires for ALL file events of that type

**Data Fields:**

| Field | Type | Required | Description | Example |
|-------|------|----------|-------------|---------|
| when.type | string | Yes | Event type | "fileCreated" |
| when.patterns | string[] | No | Glob patterns to match file paths | ["**/*.ts", "src/**/*.kt"] |

**Acceptance Criteria:**

1. GIVEN a hook with `patterns: ["**/*.drawio"]`, WHEN a `.drawio` file is created, THEN the hook fires
2. GIVEN a hook with `patterns: ["**/*.ts"]`, WHEN a `.kt` file is created, THEN the hook does NOT fire
3. GIVEN a hook with no patterns, WHEN any file is created, THEN the hook fires
4. GIVEN the tool `fs_write` creates a NEW file (path didn't exist), THEN event type is "fileCreated"
5. GIVEN the tool `str_replace` modifies an existing file, THEN event type is "fileEdited"

---

#### STORY 3: User-Triggered Hooks (VS Code Commands)

> As a developer, I want to trigger hooks manually via VS Code commands so I can run custom automations on demand.

**Requirement Details:**

1. Hooks with `when.type = "userTriggered"` are registered as VS Code commands
2. Command ID format: `kiro-sdlc.hook.{sanitized-hook-name}`
3. Hook name is sanitized: lowercase, non-alphanumeric replaced with hyphens
4. Commands are re-registered on hook reload
5. Execution result shown via status bar message (success) or warning dialog (failure)

**Acceptance Criteria:**

1. GIVEN a hook named "Run Linter", WHEN extension activates, THEN command `kiro-sdlc.hook.run-linter` is registered
2. GIVEN a user-triggered hook, WHEN user executes the command, THEN the hook's action runs
3. GIVEN a hook that is disabled (`enabled: false`), THEN no command is registered for it

---

#### STORY 4: askAgent Action (Prompt Injection)

> As a developer, I want hooks to inject prompts into the AI agent conversation so I can guide agent behavior contextually.

**Requirement Details:**

1. Action type `askAgent` resolves a prompt template and returns it to the pipeline
2. Prompt templates support placeholders: `{{toolName}}`, `{{toolArgs}}`, `{{toolResult}}`, `{{nodeName}}`
3. Placeholders are substituted with actual runtime values (truncated to prevent context overflow)
4. `toolArgs` truncated to 1000 chars, `toolResult` truncated to 1000 chars
5. Injected prompts are added to the agent's next processing step

**Acceptance Criteria:**

1. GIVEN a hook with prompt "Review {{toolName}} output: {{toolResult}}", WHEN the tool "fs_write" completes with result "file created", THEN injected prompt is "Review fs_write output: file created"
2. GIVEN `toolResult` exceeding 1000 chars, THEN only first 1000 chars are substituted
3. GIVEN a promptSubmit hook with askAgent action, WHEN user submits a prompt, THEN the hook's prompt is added to the agent context

---

#### STORY 5: runCommand Action (Shell Execution)

> As a developer, I want hooks to run shell commands so I can integrate external tools and scripts into the pipeline.

**Requirement Details:**

1. Action type `runCommand` spawns a child process with the resolved command
2. Command templates support the same placeholders as askAgent
3. Process runs in workspace root directory
4. Default timeout: 60 seconds (SIGTERM then SIGKILL after 5s grace)
5. Stdout captured (max 10KB), stderr captured (max 5KB)
6. Non-zero exit code = failed status
7. Hook failures never crash the pipeline (non-blocking)

**Acceptance Criteria:**

1. GIVEN a hook with command "npm run lint -- {{toolArgs}}", WHEN triggered, THEN the resolved command runs in workspace root
2. GIVEN a command exceeding 60s timeout, THEN process receives SIGTERM, then SIGKILL after 5s
3. GIVEN a command that exits with code 1, THEN hook result status is "failed" with stderr as error
4. GIVEN any hook execution error, THEN the main pipeline continues uninterrupted

---

#### STORY 6: Tool Type Classification & Matching

> As a developer, I want tool-type matching so I can target hooks by category rather than individual tool names.

**Requirement Details:**

1. Tool categories: `read`, `write`, `shell`, `web`, `spec`, `other`
2. Classification map is predefined in the extension
3. `toolTypes` field in hook definition supports: exact category, exact tool name, wildcard `*`, regex patterns
4. If `toolTypes` is empty or undefined, hook matches ALL tools

**Tool Category Map:**

| Category | Tools |
|----------|-------|
| read | readFile, read_file, read_code, read_files, grep_search, file_search, list_directory, get_diagnostics, get_process_output |
| write | fs_write, str_replace, fs_append, delete_file, stream_write_file |
| shell | execute_pwsh, control_pwsh_process |
| web | web_search, fetch_url |
| other | Any unclassified tool |

**Acceptance Criteria:**

1. GIVEN `toolTypes: ["write"]`, WHEN `fs_write` is called, THEN hook matches (category match)
2. GIVEN `toolTypes: ["fs_write"]`, WHEN `fs_write` is called, THEN hook matches (exact name match)
3. GIVEN `toolTypes: ["fs_.*"]`, WHEN `fs_append` is called, THEN hook matches (regex match)
4. GIVEN `toolTypes: ["*"]`, WHEN any tool is called, THEN hook matches (wildcard)
5. GIVEN `toolTypes` is undefined, WHEN any tool is called, THEN hook matches (default: all)

---

#### STORY 7: File Pattern (Glob) Matching

> As a developer, I want glob pattern matching for file hooks so I can scope them to specific paths and extensions.

**Requirement Details:**

1. `when.patterns` accepts an array of glob patterns
2. Supported glob syntax: `*` (single segment), `**` (recursive), `.` (literal dot)
3. Path normalized to forward slashes before matching
4. Match is checked against full path AND partial path (contains)
5. If patterns array is empty or not provided, all files match

**Acceptance Criteria:**

1. GIVEN pattern `**/*.ts`, WHEN file path is `src/utils/helper.ts`, THEN matches
2. GIVEN pattern `src/**/*.kt`, WHEN file path is `backend/model/User.kt`, THEN does NOT match
3. GIVEN pattern `*.drawio`, WHEN file path is `documents/F10/diagrams/arch.drawio`, THEN matches (contains)
4. GIVEN multiple patterns `["**/*.ts", "**/*.tsx"]`, WHEN file is `.tsx`, THEN matches (any pattern)

---

#### STORY 8: Circular Dependency Detection

> As a developer, I want the system to detect and prevent circular hook execution so hooks cannot trigger infinite loops.

**Requirement Details:**

1. Execution stack tracks currently-running hook names
2. If a hook is already in the execution stack, it is skipped
3. Maximum execution depth (default: 3) prevents deep hook chains
4. Skipped hooks are logged as warnings in the output channel
5. Execution log maintained (max 200 entries, trimmed to last 100)

**Acceptance Criteria:**

1. GIVEN hook A triggers hook A (self-reference), THEN second invocation is skipped with warning
2. GIVEN hook chain A->B->C->D (depth 4, max 3), THEN D is skipped
3. GIVEN circular detection skips a hook, THEN warning is logged to output channel

---

#### STORY 9: Hook Execution Visibility (UI Emission)

> As a developer, I want hook execution results visible in the chat panel so I can see what hooks fired and their outcomes.

**Requirement Details:**

1. Every hook execution emits a `chat:toolCall` event via StreamHandler
2. Event includes: hook name, event type, tool name, action type, status, result preview (200 chars), duration
3. Status maps: completed->"completed", failed->"failed", timed_out->"failed", denied->"completed"
4. Unique ID generated per emission: `hook-{timestamp}-{random}`

**Acceptance Criteria:**

1. GIVEN a hook fires successfully, THEN a toolCall event with status "completed" appears in chat panel
2. GIVEN a hook times out, THEN a toolCall event with status "failed" appears
3. GIVEN a preToolUse hook denies, THEN a toolCall event with status "completed" and denial info appears

---

#### STORY 10: Hook Hot-Reload

> As a developer, I want to reload hooks without restarting the extension so I can iterate quickly on hook definitions.

**Requirement Details:**

1. `clearHookCache()` invalidates the in-memory cache
2. Next `loadHooks()` call re-reads all files from `.kiro/hooks/`
3. `HookEngine.reload()` method combines cache clear + re-initialize
4. Invalid hooks are skipped with logged errors (don't block valid hooks)
5. Hook count reported after reload

**Acceptance Criteria:**

1. GIVEN a new hook file added to `.kiro/hooks/`, WHEN reload is triggered, THEN new hook is available
2. GIVEN a hook file removed, WHEN reload is triggered, THEN hook no longer fires
3. GIVEN an invalid JSON hook file, WHEN loaded, THEN it is skipped and error logged

---

## 3. Dependencies

| Dependency | Type | Description |
|------------|------|-------------|
| LangGraph Pipeline | System | Hook engine integrates into pipeline checkpoints |
| VS Code Extension API | System | Commands registration, OutputChannel, workspace.fs |
| StreamHandler | System | UI event emission for hook visibility |
| Node.js child_process | System | Shell command execution for runCommand |
| .kiro/hooks/ directory | Infrastructure | Hook definition file storage |

---

## 4. Stakeholders

| Role | Team | Responsibility |
|------|------|----------------|
| Extension Developer | Kiro Platform | Implement and maintain hook system |
| Hook Author | End User / Dev | Define custom hooks for their projects |
| AI Agent Pipeline | System | Consume hook results (prompts, denials) |

---

## 5. Risks and Assumptions

### 5.1 Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Malicious runCommand hooks | High | Low | Hooks run in user workspace context (same trust as VS Code tasks) |
| Hook timeout blocking pipeline | Medium | Medium | 60s timeout with kill, non-blocking design |
| Excessive hook count degrading performance | Medium | Low | Caching, max depth limit, execution log trim |
| Regex patterns causing ReDoS | Low | Low | Try/catch around RegExp, skip on error |

### 5.2 Assumptions

- Users have sufficient permissions to execute shell commands in their workspace
- `.kiro/hooks/` directory is within the workspace root
- Hooks are authored by trusted workspace users (not external untrusted input)
- VS Code extension host is active and stable
- JSON parsing is sufficient for hook definition format

---

## 6. Non-Functional Requirements

| Category | Requirement | Details |
|----------|-------------|---------|
| Performance | Hook loading < 100ms for up to 50 hooks | Cached after first load |
| Performance | Individual hook execution < 60s | Enforced timeout with SIGTERM/SIGKILL |
| Reliability | Hook failures never crash pipeline | All executions wrapped in try/catch |
| Reliability | Circular hooks detected and skipped | Max depth 3, execution stack tracking |
| Scalability | Support up to 50+ hook definitions | Caching with on-demand reload |
| Observability | All hook executions logged | OutputChannel + execution log (200 entries) |
| Security | Command injection via placeholders mitigated | Values truncated, shell=true with workspace env |

---

## 7. Related Tickets

| Ticket Key | Summary | Type | Relationship |
|------------|---------|------|--------------|
| KSA-242 | Hook Loader Implementation | Story | Foundation — file loading |
| KSA-249 | Hook Events & Executor | Story | Core — event dispatch + execution |
| KSA-280 | Unified Hook Engine | Story | Integration — pipeline integration |

---

## 8. Appendix

### Hook Definition Schema

```json
{
  "name": "string (required)",
  "version": "string (required)",
  "description": "string (optional)",
  "enabled": "boolean (default: true)",
  "when": {
    "type": "promptSubmit | agentStop | preToolUse | postToolUse | fileEdited | fileCreated | fileDeleted | userTriggered | preTaskExecution | postTaskExecution",
    "patterns": ["glob patterns (optional, for file events)"],
    "toolTypes": ["tool category/name/regex (optional, for tool events)"]
  },
  "then": {
    "type": "askAgent | runCommand",
    "prompt": "string (required for askAgent)",
    "command": "string (required for runCommand)"
  }
}
```

### Supported Event Types

| Event Type | Trigger Point | Available Context |
|------------|--------------|-------------------|
| promptSubmit | User submits a prompt | text |
| agentStop | Agent finishes execution | (none) |
| preToolUse | Before tool execution | toolName, toolArgs |
| postToolUse | After tool execution | toolName, toolArgs, toolResult |
| fileCreated | Write tool creates new file | filePath |
| fileEdited | Write tool modifies file | filePath |
| fileDeleted | Delete tool removes file | filePath |
| userTriggered | User runs VS Code command | (none) |
| preTaskExecution | Before task/workflow step | nodeName, inputState |
| postTaskExecution | After task/workflow step | nodeName, taskOutput, duration |

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Business Flow | [business-flow.png](diagrams/business-flow.png) | [business-flow.drawio](diagrams/business-flow.drawio) |
| 2 | Use Case Diagram | [use-case.png](diagrams/use-case.png) | [use-case.drawio](diagrams/use-case.drawio) |
