# Functional Specification Document (FSD)

## Kiro IDE Extension — F10: Hook System

---

## Document Information

| Field | Value |
|-------|-------|
| Feature ID | F10 |
| Title | Hook System |
| Author | BA Agent + TA Agent |
| Version | 1.0 |
| Date | 2025-07-03 |
| Status | Draft |
| Related BRD | BRD-v1-F10.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-07-03 | BA + TA | Initial document — functional specification from BRD and source code analysis |

---

## 1. Introduction

### 1.1 Purpose

This FSD specifies the functional behavior of the Hook System — an extensibility mechanism that allows custom logic to be injected into the Kiro AI agent pipeline at predefined checkpoints.

### 1.2 Scope

- Hook definition file loading and validation
- Event-based hook triggering (10 event types)
- Hook action execution (askAgent, runCommand)
- Tool classification and pattern matching
- Circular dependency prevention
- UI event emission for hook visibility
- VS Code command registration for user-triggered hooks

### 1.3 Definitions & Acronyms

| Term | Definition |
|------|------------|
| Hook | A user-defined rule that fires at a pipeline checkpoint and executes an action |
| Event Type | The checkpoint type that triggers a hook (e.g., preToolUse, fileCreated) |
| askAgent | Hook action that injects a prompt into the AI agent's context |
| runCommand | Hook action that executes a shell command |
| Tool Category | Classification of agent tools (read/write/shell/web/other) |
| Glob Pattern | File path pattern using wildcards (*, **) |

### 1.4 References

| Document | Location |
|----------|----------|
| BRD | BRD-v1-F10.docx |
| Source: hook-engine.ts | extension/src/langgraph/hook-engine.ts |
| Source: hook-loader.ts | extension/src/langgraph/hook-loader.ts |
| Source: hook-executor.ts | extension/src/langgraph/hook-executor.ts |

---

## 2. System Overview

### 2.1 System Context Diagram

![System Context](diagrams/system-context.png)

The Hook System operates within the VS Code extension, sitting between the LangGraph Agent Pipeline and external processes. It reads hook definitions from the filesystem, intercepts pipeline events, and either injects prompts back into the agent or spawns shell processes.

### 2.2 System Architecture

The Hook System consists of 7 modules:
1. **HookLoader** — Reads and validates hook definition files
2. **HookFilters** — Schema validation and event-type filtering
3. **HookEngine** — Main orchestrator, fires hooks at pipeline checkpoints
4. **HookExecutor** — Executes askAgent/runCommand actions
5. **HookToolMatcher** — Tool classification and pattern matching
6. **HookEmitter** — Emits execution events to UI
7. **HookCommands** — VS Code command registration for userTriggered hooks

---

## 3. Functional Requirements

### 3.1 Feature: Hook Loading & Validation

**Source:** BRD Story 10 (Hot-Reload)

#### 3.1.1 Description

The system loads hook definition files from `.kiro/hooks/` directory at extension startup and on-demand reload. Files are parsed as JSON, validated against schema, and cached in memory.

#### 3.1.2 Use Case

**Use Case ID:** UC-01
**Actor:** Extension (automatic) / Developer (manual reload)
**Preconditions:** Workspace folder exists with `.kiro/hooks/` directory
**Postconditions:** Valid hooks cached in memory, invalid hooks logged and skipped

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | | System | Scan `.kiro/hooks/` directory for `*.json` and `*.kiro.hook` files |
| 2 | | System | Read each file content |
| 3 | | System | Parse JSON content |
| 4 | | System | Validate against hook schema (name, version, when, then) |
| 5 | | System | If valid and enabled, add to hook cache |
| 6 | | System | Log count of loaded hooks to output channel |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-01 | `.kiro/hooks/` directory doesn't exist | Return empty hooks array, no error |
| AF-02 | Force reload requested | Clear cache first, then re-execute main flow |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-01 | File is not valid JSON | Log error with filename, skip file, continue |
| EF-02 | Schema validation fails | Log validation errors per field, skip file, continue |
| EF-03 | File read permission denied | Log error, skip file, continue |

#### 3.1.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-01 | Only `.json` and `.kiro.hook` files are loaded | hook-loader.ts |
| BR-02 | Hooks with `enabled: false` are excluded from cache | hook-loader.ts |
| BR-03 | Hook cache persists until explicit reload or extension restart | hook-loader.ts |
| BR-04 | Invalid hooks never block valid hooks from loading | hook-loader.ts |

#### 3.1.4 Data Specifications

**Input Data — Hook Definition File:**

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| name | string | Yes | Non-empty, trimmed | Human-readable hook name |
| version | string | Yes | Non-empty | Semantic version of hook definition |
| description | string | No | — | Human-readable description |
| enabled | boolean | No | Default: true | Whether hook is active |
| when | object | Yes | Must have valid `type` | Trigger configuration |
| when.type | string | Yes | One of 10 valid event types | Event type that triggers this hook |
| when.patterns | string[] | No | — | Glob patterns for file events |
| when.toolTypes | string[] | No | — | Tool categories/names/regex for tool events |
| then | object | Yes | Must have valid `type` | Action configuration |
| then.type | string | Yes | "askAgent" or "runCommand" | Action type |
| then.prompt | string | Conditional | Required if type=askAgent | Prompt template with placeholders |
| then.command | string | Conditional | Required if type=runCommand | Shell command template |

**Valid Event Types:**

| Event Type | Category | Description |
|------------|----------|-------------|
| promptSubmit | Agent Lifecycle | User submits a prompt to the agent |
| agentStop | Agent Lifecycle | Agent finishes execution |
| preToolUse | Tool Lifecycle | Before agent executes a tool |
| postToolUse | Tool Lifecycle | After agent executes a tool |
| fileCreated | File System | A write tool creates a new file |
| fileEdited | File System | A write tool modifies an existing file |
| fileDeleted | File System | A delete tool removes a file |
| userTriggered | Manual | User explicitly runs hook via VS Code command |
| preTaskExecution | Task Lifecycle | Before a workflow task/node executes |
| postTaskExecution | Task Lifecycle | After a workflow task/node completes |

---

### 3.2 Feature: Pre-Tool Hook Execution

**Source:** BRD Story 1

#### 3.2.1 Description

Before any agent tool call executes, the system checks for matching preToolUse hooks. If matched, hooks can inject additional context or deny the tool call entirely.

#### 3.2.2 Use Case

**Use Case ID:** UC-02
**Actor:** AI Agent Pipeline
**Preconditions:** Hooks loaded, agent about to call a tool
**Postconditions:** Tool call proceeds (possibly with injected context) or is denied

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Pipeline | | Requests preToolUse check with toolName and args |
| 2 | | Engine | Initialize hooks if not loaded |
| 3 | | Engine | Classify tool into category (read/write/shell/web/other) |
| 4 | | Engine | Filter hooks: type=preToolUse AND toolTypes match |
| 5 | | Engine | For each matching hook, check circular dependency |
| 6 | | Executor | Execute hook action (askAgent or runCommand) |
| 7 | | Emitter | Emit hook_fired event to UI |
| 8 | | Engine | Collect injected prompts from askAgent hooks |
| 9 | | Engine | Return result: {denied: false, injectedPrompts: [...]} |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-01 | No matching hooks | Return immediately: {denied: false, injectedPrompts: []} |
| AF-02 | Hook is circular (already in execution stack) | Skip hook, log warning, continue to next |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-01 | Hook execution throws error | Log error, skip hook, continue (non-blocking) |
| EF-02 | askAgent detects denial pattern in context | Return {denied: true, hookName, reason} |

#### 3.2.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-05 | PreToolUse can deny tool calls | hook-engine.ts |
| BR-06 | Denial patterns: FORBIDDEN, DENY, ACCESS_DENIED, PERMISSION DENIED | hook-executor.ts |
| BR-07 | Multiple hooks execute sequentially; first denial wins | hook-engine.ts |
| BR-08 | Hook errors never block tool execution (fail-open) | hook-engine.ts |

#### 3.2.4 API Contract (Functional View)

**Internal API:** `HookEngine.firePreToolUse(toolName, args, streamHandler, streamId)`

**Input Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| toolName | string | Yes | Name of the tool being called |
| args | Record<string, unknown> | Yes | Tool call arguments |
| streamHandler | StreamHandler | Yes | For UI event emission |
| streamId | string | Yes | Current stream identifier |

**Output Data:**

| Field | Type | Description |
|-------|------|-------------|
| denied | boolean | Whether any hook denied the tool call |
| hookName | string? | Name of denying hook (if denied) |
| reason | string? | Denial reason (if denied) |
| injectedPrompts | string[] | Prompts to inject into agent context |

---

### 3.3 Feature: Post-Tool Hook Execution

**Source:** BRD Story 1

#### 3.3.1 Description

After a tool call completes, the system fires postToolUse hooks. Additionally, if the tool was a "write" category tool, the system also fires file event hooks (fileCreated or fileEdited) for the affected file.

#### 3.3.2 Use Case

**Use Case ID:** UC-03
**Actor:** AI Agent Pipeline
**Preconditions:** Tool call completed successfully
**Postconditions:** Post-tool hooks executed, file event hooks fired if applicable

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Pipeline | | Reports tool completion with toolName, args, result |
| 2 | | Engine | Classify tool, find matching postToolUse hooks |
| 3 | | Engine | Execute each matching hook with full context |
| 4 | | Engine | If tool category is "write", extract file path from args |
| 5 | | Engine | Determine event type: fs_write/stream_write_file → fileCreated, others → fileEdited |
| 6 | | Engine | Find matching file hooks by glob patterns |
| 7 | | Engine | Execute file hooks |
| 8 | | Engine | Return collected injected prompts |

#### 3.3.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-09 | Write tools trigger file events automatically | hook-engine.ts |
| BR-10 | fs_write and stream_write_file map to fileCreated | hook-engine.ts |
| BR-11 | str_replace and fs_append map to fileEdited | hook-engine.ts |
| BR-12 | File path extracted from args.path, args.file_path, or args.targetFile | hook-tool-matcher.ts |

---

### 3.4 Feature: Prompt Submit & Agent Stop Hooks

**Source:** BRD Stories 4, 9

#### 3.4.1 Description

Hooks can fire when a user submits a prompt to the agent or when the agent completes its execution cycle.

#### 3.4.2 Use Case

**Use Case ID:** UC-04
**Actor:** AI Agent Pipeline
**Preconditions:** User submits prompt (promptSubmit) or agent finishes (agentStop)
**Postconditions:** Matching hooks execute, prompts injected if applicable

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Pipeline | | Fires event with context (text for promptSubmit, empty for agentStop) |
| 2 | | Engine | Filter hooks by event type |
| 3 | | Engine | Execute each matching hook safely |
| 4 | | Engine | Collect askAgent outputs as injected prompts |
| 5 | | Engine | Return collected prompts array |

---

### 3.5 Feature: Tool Type Classification & Matching

**Source:** BRD Story 6

#### 3.5.1 Description

The system classifies each tool into a category and matches hooks based on toolTypes patterns.

#### 3.5.2 Use Case

**Use Case ID:** UC-05
**Actor:** Hook Engine (internal)
**Preconditions:** Tool name known, hooks loaded
**Postconditions:** Matching hooks identified

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | | Matcher | Look up toolName in TOOL_CATEGORIES map |
| 2 | | Matcher | If found, return category; otherwise "other" |
| 3 | | Matcher | For each hook, check toolTypes array |
| 4 | | Matcher | Match by: wildcard(*), category, exact name, or regex |
| 5 | | Matcher | Return list of matching hooks |

#### 3.5.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-13 | Tool categories are predefined, not configurable | hook-tool-matcher.ts |
| BR-14 | Empty or missing toolTypes means "match all tools" | hook-tool-matcher.ts |
| BR-15 | Regex patterns wrapped in try/catch; invalid regex = no match | hook-tool-matcher.ts |
| BR-16 | Matching order: wildcard → category → exact name → regex | hook-tool-matcher.ts |

---

### 3.6 Feature: File Pattern (Glob) Matching

**Source:** BRD Story 7

#### 3.6.1 Description

File event hooks use glob patterns to match specific file paths.

#### 3.6.2 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-17 | Backslashes normalized to forward slashes before matching | hook-tool-matcher.ts |
| BR-18 | `*` matches any characters except `/` | hook-tool-matcher.ts |
| BR-19 | `**` matches any characters including `/` (recursive) | hook-tool-matcher.ts |
| BR-20 | `.` in patterns is literal (escaped to `\.`) | hook-tool-matcher.ts |
| BR-21 | Match checked against both full path (^...$) and contains | hook-tool-matcher.ts |
| BR-22 | If no patterns defined, all file paths match | hook-filters.ts |

---

### 3.7 Feature: Hook Action Execution

**Source:** BRD Stories 4, 5

#### 3.7.1 Description

The Hook Executor performs two action types: askAgent (prompt injection) and runCommand (shell execution).

#### 3.7.2 Use Case — askAgent

**Use Case ID:** UC-06
**Actor:** Hook Engine
**Preconditions:** Hook matched with then.type = "askAgent"
**Postconditions:** Resolved prompt returned (or denial detected)

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | | Executor | Read prompt template from hook definition |
| 2 | | Executor | Substitute placeholders: {{toolName}}, {{toolArgs}}, {{toolResult}}, {{nodeName}} |
| 3 | | Executor | Truncate toolArgs to 1000 chars, toolResult to 1000 chars |
| 4 | | Executor | Check for denial patterns in toolResult (if present) |
| 5 | | Executor | Return {status: "completed", output: resolvedPrompt} |

#### 3.7.3 Use Case — runCommand

**Use Case ID:** UC-07
**Actor:** Hook Engine
**Preconditions:** Hook matched with then.type = "runCommand"
**Postconditions:** Command executed, result captured

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | | Executor | Read command template from hook definition |
| 2 | | Executor | Substitute placeholders |
| 3 | | Executor | Spawn child process (shell=true, cwd=workspace root) |
| 4 | | Executor | Capture stdout (max 10KB) and stderr (max 5KB) |
| 5 | | Executor | Wait for process exit or timeout |
| 6 | | Executor | Return {status, output: stdout, error: stderr, duration} |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-03 | Timeout (60s) | Send SIGTERM, wait 5s, send SIGKILL. Return status: "timed_out" |
| EF-04 | Non-zero exit code | Return status: "failed", error = stderr or exit code |
| EF-05 | Process spawn error | Return status: "failed", error = error message |

#### 3.7.4 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-23 | Placeholder {{toolArgs}} is JSON.stringify truncated to 1000 chars | hook-executor.ts |
| BR-24 | Placeholder {{toolResult}} truncated to 1000 chars | hook-executor.ts |
| BR-25 | runCommand timeout default: 60 seconds | hook-executor.ts |
| BR-26 | SIGTERM first, SIGKILL after 5s grace period | hook-executor.ts |
| BR-27 | stdout capped at 10KB, stderr at 5KB | hook-executor.ts |
| BR-28 | Process environment inherits from process.env | hook-executor.ts |
| BR-29 | No prompt defined for askAgent → status "failed" | hook-executor.ts |
| BR-30 | No command defined for runCommand → status "failed" | hook-executor.ts |

---

### 3.8 Feature: Circular Dependency Detection

**Source:** BRD Story 8

#### 3.8.1 Description

The system prevents hooks from triggering infinite execution loops.

#### 3.8.2 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-31 | Execution stack tracks hook names currently running | hook-engine.ts |
| BR-32 | Hook in execution stack → skip (not error) | hook-engine.ts |
| BR-33 | Execution stack size >= maxDepth (3) → skip all | hook-events.ts |
| BR-34 | Skipped hooks logged as WARN | hook-events.ts |

---

### 3.9 Feature: User-Triggered Hooks (VS Code Commands)

**Source:** BRD Story 3

#### 3.9.1 Description

Hooks with `when.type = "userTriggered"` are registered as VS Code commands that users can invoke manually.

#### 3.9.2 Use Case

**Use Case ID:** UC-08
**Actor:** Developer
**Preconditions:** Hook loaded with when.type = "userTriggered", enabled = true
**Postconditions:** VS Code command registered and executable

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | | HookCommands | Load all hooks, filter userTriggered |
| 2 | | HookCommands | For each, generate command ID: `kiro-sdlc.hook.{sanitized-name}` |
| 3 | | HookCommands | Register VS Code command |
| 4 | Developer | | Invokes command (command palette, keybinding, etc.) |
| 5 | | HookCommands | Execute hook action via HookExecutor |
| 6 | | HookCommands | Show status bar message (success) or warning (failure) |

#### 3.9.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-35 | Name sanitization: lowercase, non-alphanum → hyphen, trim hyphens | hook-commands.ts |
| BR-36 | Previous command registrations disposed before re-register | hook-commands.ts |
| BR-37 | Disabled hooks do not get commands registered | hook-commands.ts |

---

### 3.10 Feature: Hook Execution Visibility (UI Emission)

**Source:** BRD Story 9

#### 3.10.1 Description

Every hook execution emits a `chat:toolCall` event to the chat panel UI so users can see what hooks fired.

#### 3.10.2 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-38 | Emit type: "chat:toolCall" with name "hook_fired" | hook-emitter.ts |
| BR-39 | Event ID format: `hook-{timestamp}-{random4chars}` | hook-emitter.ts |
| BR-40 | Result output truncated to 200 chars in event | hook-emitter.ts |
| BR-41 | Status mapping: completed→completed, failed→failed, timed_out→failed, denied→completed | hook-emitter.ts |
| BR-42 | Event args: hookName, event, toolName, action | hook-emitter.ts |

---

## 4. Data Model

### 4.1 Entity Relationship

The Hook System is primarily stateless with in-memory caching. No persistent database storage.

#### Entity: HookDefinition

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| name | string | Yes | Unique hook identifier |
| version | string | Yes | Hook schema version |
| description | string | No | Human description |
| enabled | boolean | Yes | Active flag (default true) |
| when | HookTrigger | Yes | Trigger configuration |
| then | HookAction | Yes | Action configuration |
| filePath | string | Yes | Source file path (auto-set) |

#### Entity: HookTrigger

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| type | HookEventType | Yes | One of 10 event types |
| patterns | string[] | No | Glob patterns for file matching |
| toolTypes | string[] | No | Tool category/name/regex patterns |

#### Entity: HookAction

| Attribute | Type | Required | Description |
|-----------|------|----------|-------------|
| type | "askAgent" or "runCommand" | Yes | Action type |
| prompt | string | Conditional | Template for askAgent |
| command | string | Conditional | Template for runCommand |

#### Entity: HookResult

| Attribute | Type | Description |
|-----------|------|-------------|
| status | "completed" / "failed" / "timed_out" / "denied" | Execution outcome |
| output | string? | Stdout or resolved prompt |
| error | string? | Error message |
| duration | number | Execution time in ms |

#### Entity: HookContext

| Attribute | Type | Description |
|-----------|------|-------------|
| toolName | string? | Current tool name |
| toolArgs | Record<string, unknown>? | Tool arguments |
| toolResult | string? | Tool execution result |
| nodeName | string? | Workflow node name |
| inputState | unknown? | Task input state |
| taskOutput | unknown? | Task output |
| duration | number? | Task duration |

---

## 5. Integration Specifications

### 5.1 External System: LangGraph Pipeline

| Attribute | Value |
|-----------|-------|
| Purpose | Hook system intercepts pipeline at checkpoints |
| Direction | Bidirectional |
| Data Format | TypeScript interfaces (in-process) |
| Frequency | Real-time (every tool call, prompt, task) |

### 5.2 External System: VS Code Extension Host

| Attribute | Value |
|-----------|-------|
| Purpose | Command registration, file system access, output channels |
| Direction | Bidirectional |
| Data Format | VS Code API |
| Frequency | On-demand |

### 5.3 External System: Node.js child_process

| Attribute | Value |
|-----------|-------|
| Purpose | Execute runCommand hook actions |
| Direction | Outbound |
| Data Format | Shell commands (string) |
| Frequency | Per runCommand hook execution |

---

## 6. Processing Logic

### 6.1 Hook Matching Process

**Trigger:** Pipeline checkpoint reached
**Input:** Event type, tool name (optional), file path (optional)
**Output:** List of matching hooks

**Processing Steps:**

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Load hooks from cache (or initialize if first call) | Return empty on load failure |
| 2 | Filter by event type | No hooks → return empty |
| 3 | If tool event: classify tool, match by toolTypes | Invalid regex → skip pattern |
| 4 | If file event: match by glob patterns | Invalid glob → skip pattern |
| 5 | Return matched hook list | — |

### 6.2 Placeholder Substitution Process

**Trigger:** Hook action execution
**Input:** Template string, HookContext
**Output:** Resolved string

| Placeholder | Source | Truncation |
|-------------|--------|-----------|
| {{toolName}} | context.toolName | None |
| {{toolArgs}} | JSON.stringify(context.toolArgs) | 1000 chars |
| {{toolResult}} | context.toolResult | 1000 chars |
| {{nodeName}} | context.nodeName | None |

---

## 7. Security Requirements

### 7.1 Trust Model

| Data Type | Classification | Requirement |
|-----------|---------------|-------------|
| Hook definition files | Trusted | Same trust as workspace code |
| runCommand output | Internal | Not exposed outside extension |
| Placeholder values | Untrusted (from tool results) | Truncated to prevent overflow |

### 7.2 Risks Mitigated

- **No arbitrary code execution from external input** — hooks are local files authored by workspace owner
- **No network access** — hooks run locally (shell commands have normal user permissions)
- **Truncation prevents context overflow** — placeholder substitution limits prevent memory issues

---

## 8. Non-Functional Requirements

| Category | Requirement | Acceptance Criteria |
|----------|-------------|---------------------|
| Performance | Hook loading < 100ms (50 hooks) | Measured via performance.now() |
| Performance | Hook matching < 5ms per event | No heavy computation in matching |
| Reliability | Zero pipeline crashes from hooks | All hook execution in try/catch |
| Timeout | Shell commands timeout at 60s | Process killed after timeout |
| Memory | Execution log capped at 200 entries | Trimmed to 100 when exceeded |
| Memory | Stdout capped at 10KB per command | Truncated during capture |

---

## 9. Error Handling (User-Facing)

### 9.1 Error Scenarios

| Scenario | Severity | User Message | Expected Behavior |
|----------|----------|-------------|-------------------|
| Invalid hook JSON | Warning | Log to "Kiro SDLC Hooks" output channel | Hook skipped, others load normally |
| Hook execution timeout | Warning | Emitted as hook_fired event with status "failed" | Pipeline continues |
| Circular hook detected | Warning | Log to output channel | Hook skipped silently |
| runCommand fails (non-zero exit) | Info | Emitted as hook_fired event with status "failed" | Pipeline continues |
| preToolUse denial | Info | Emitted as hook_fired event | Tool call blocked, agent informed |

---

## 10. State Diagram

![Hook Execution State](diagrams/state-hook-execution.png)

Hook execution follows this state machine:
- **Idle** → hook not yet triggered
- **Matching** → engine checking if hook matches event
- **Executing** → action running (askAgent resolving or runCommand spawned)
- **Completed** → success, output available
- **Failed** → error occurred, logged
- **Timed Out** → command exceeded timeout
- **Denied** → preToolUse detected denial pattern
- **Skipped** → circular dependency detected

---

## 11. Appendix

### Sequence Diagram — preToolUse Flow

![Sequence preToolUse](diagrams/sequence-pre-tool-use.png)

### Sequence Diagram — File Event Flow

![Sequence File Event](diagrams/sequence-file-event.png)

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | System Context | [system-context.png](diagrams/system-context.png) | [system-context.drawio](diagrams/system-context.drawio) |
| 2 | Sequence — preToolUse | [sequence-pre-tool-use.png](diagrams/sequence-pre-tool-use.png) | [sequence-pre-tool-use.drawio](diagrams/sequence-pre-tool-use.drawio) |
| 3 | Sequence — File Event | [sequence-file-event.png](diagrams/sequence-file-event.png) | [sequence-file-event.drawio](diagrams/sequence-file-event.drawio) |
| 4 | State — Hook Execution | [state-hook-execution.png](diagrams/state-hook-execution.png) | [state-hook-execution.drawio](diagrams/state-hook-execution.drawio) |
