# Technical Design Document (TDD)

## Kiro IDE Extension — F10: Hook System

---

## Document Information

| Field | Value |
|-------|-------|
| Feature ID | F10 |
| Title | Hook System |
| Author | SA Agent |
| Version | 1.0 |
| Date | 2025-07-03 |
| Status | Draft |
| Related BRD | BRD-v1-F10.docx |
| Related FSD | FSD-v1-F10.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-07-03 | SA Agent | Initial document — technical design from FSD and source code |

---

## 1. Introduction

### 1.1 Purpose

This TDD specifies the technical implementation of the Hook System — a plugin-style extensibility engine that intercepts the Kiro AI agent pipeline at predefined checkpoints and executes user-defined actions.

### 1.2 Scope

- Module architecture and component interactions
- Class/interface design for all hook system modules
- Event dispatching and execution engine design
- Pattern matching algorithms (tool classification, glob matching)
- Process management for shell command execution
- Integration points with LangGraph pipeline and VS Code APIs

### 1.3 Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Language | TypeScript | 5.x |
| Runtime | Node.js | 20.x |
| Host Platform | VS Code Extension API | 1.85+ |
| Pipeline | LangGraph (custom) | Internal |
| Process Spawn | Node.js child_process | Built-in |
| File System | VS Code workspace.fs | Built-in |

### 1.4 Design Principles

- **Fail-open**: Hook errors never block the agent pipeline
- **Non-blocking**: Hook execution is isolated from pipeline critical path
- **Single Responsibility**: Each module handles one concern (loading, filtering, executing, emitting)
- **Caching**: Hooks loaded once, cached until explicit reload
- **Depth limiting**: Circular dependencies detected and prevented

### 1.5 Constraints

- Must run within VS Code extension host (single-threaded JavaScript)
- Cannot use Worker threads (VS Code extension limitation)
- Hook definitions must be JSON-parseable (no YAML, no TOML)
- Maximum execution time: 60s per hook (enforced)
- Memory: stdout buffer capped at 10KB, log capped at 200 entries

### 1.6 References

| Document | Location |
|----------|----------|
| BRD | BRD-v1-F10.docx |
| FSD | FSD-v1-F10.docx |

---

## 2. System Architecture

### 2.1 Architecture Overview

![Architecture Diagram](diagrams/architecture.png)

The Hook System follows a **Pipeline Interceptor** pattern with these layers:

1. **Loading Layer** — Reads and validates hook definitions from filesystem
2. **Matching Layer** — Classifies tools and matches hooks to events
3. **Execution Layer** — Runs hook actions (prompt resolution or shell commands)
4. **Emission Layer** — Reports hook results to UI via StreamHandler
5. **Command Layer** — Registers VS Code commands for user-triggered hooks

### 2.2 Component Diagram

![Component Diagram](diagrams/component.png)

| Component | Responsibility | Technology |
|-----------|---------------|------------|
| HookEngine | Main orchestrator — fires hooks at pipeline checkpoints | TypeScript class |
| HookLoader | Reads `.kiro/hooks/` files, parses JSON, caches | VS Code workspace.fs |
| HookFilters | Schema validation, event-type filtering | Pure functions |
| HookToolMatcher | Tool classification, toolType matching, glob matching | Pure functions |
| HookExecutor | Executes askAgent/runCommand with timeout | child_process |
| HookEmitter | Emits hook_fired events to StreamHandler | StreamHandler API |
| HookCommands | Registers VS Code commands for userTriggered hooks | VS Code commands API |
| HookEventsManager | Legacy event dispatcher (predecessor, still used) | TypeScript class |

### 2.3 Communication Patterns

| From | To | Protocol | Pattern | Description |
|------|----|----------|---------|-------------|
| LangGraph Pipeline | HookEngine | In-process call | Sync/Async | Pipeline calls firePreToolUse/firePostToolUse |
| HookEngine | HookLoader | In-process call | Async | Loads hooks from cache or disk |
| HookEngine | HookToolMatcher | In-process call | Sync | Classifies tools, matches hooks |
| HookEngine | HookExecutor | In-process call | Async | Executes matched hooks |
| HookEngine | HookEmitter | In-process call | Sync | Emits UI events |
| HookExecutor | child_process | Process spawn | Async | Runs shell commands |
| HookEmitter | StreamHandler | In-process call | Sync | Pushes events to chat panel |
| HookCommands | VS Code API | Extension API | Sync | Registers/disposes commands |

---

## 3. Detailed Design

### 3.1 Module: HookEngine (hook-engine.ts)

**Pattern:** Facade + Mediator

The HookEngine is the main entry point. It coordinates all other modules and exposes a clean API to the LangGraph pipeline.

```typescript
class HookEngine {
  private hooks: HookDefinition[] = [];
  private loaded: boolean = false;
  private executionStack: Set<string> = new Set();
  private executor: HookExecutor;
  private outputChannel: vscode.OutputChannel;

  constructor(workspaceRoot: string);
  async initialize(): Promise<void>;
  async reload(): Promise<void>;
  async firePreToolUse(toolName, args, streamHandler, streamId): Promise<PreToolUseHookResult>;
  async firePostToolUse(toolName, args, toolResult, streamHandler, streamId): Promise<PostToolUseHookResult>;
  async firePromptSubmit(text, streamHandler, streamId?): Promise<string[]>;
  async fireAgentStop(streamHandler, streamId?): Promise<string[]>;
  getHookCount(): number;
  dispose(): void;
}
```

**Key Design Decisions:**

1. **Lazy initialization** — hooks loaded on first fire event, not at construction
2. **Execution stack as Set** — O(1) circular detection
3. **execSafe wrapper** — all hook execution wrapped in try/catch for fail-open behavior
4. **File event chaining** — postToolUse for write tools automatically triggers fileCreated/fileEdited

### 3.2 Module: HookLoader (hook-loader.ts)

**Pattern:** Cache-Aside + Factory

```typescript
// Module-level cache (singleton per extension instance)
let cachedHooks: HookDefinition[] | null = null;

async function loadHooks(workspaceRoot: string, forceReload?: boolean): Promise<HookDefinition[]>;
function clearHookCache(): void;
```

**Key Design Decisions:**

1. **Module-level cache** — simple singleton pattern (no DI needed for one instance)
2. **File enumeration** — VS Code workspace.fs API for cross-platform compatibility
3. **Graceful degradation** — missing directory returns empty array (not error)
4. **Schema-first validation** — invalid files rejected before instantiation

### 3.3 Module: HookFilters (hook-filters.ts)

**Pattern:** Strategy (filtering) + Validator

```typescript
function validateHookSchema(parsed: unknown, fileName: string): HookValidationError[];
function filterHooksByType(hooks: HookDefinition[], eventType: string): HookDefinition[];
function filterPreToolUseHooks(hooks: HookDefinition[], toolCategory: string): HookDefinition[];
function filterFileHooks(hooks: HookDefinition[], eventType, filePath: string): HookDefinition[];
```

**Validation Rules:**

| Field | Rule | Error if |
|-------|------|----------|
| root | Must be object | Not object or null |
| name | Non-empty string | Missing, empty, or non-string |
| version | Non-empty string | Missing or non-string |
| when | Object with valid type | Missing or invalid type |
| when.type | One of 10 valid types | Not in VALID_EVENT_TYPES |
| then | Object with valid type | Missing or invalid type |
| then.type | "askAgent" or "runCommand" | Not in VALID_ACTION_TYPES |
| then.prompt | Required if askAgent | Missing when type=askAgent |
| then.command | Required if runCommand | Missing when type=runCommand |

### 3.4 Module: HookToolMatcher (hook-tool-matcher.ts)

**Pattern:** Strategy (matching) + Classifier

```typescript
const TOOL_CATEGORIES: Record<string, string> = { /* predefined map */ };

function classifyTool(toolName: string): string;
function getMatchingToolHooks(hooks, eventType, toolName, category): HookDefinition[];
function extractFilePath(toolName: string, args: Record<string, unknown>): string | null;
function matchGlob(pattern: string, filePath: string): boolean;
```

**Tool Classification Algorithm:**

```
classifyTool(toolName):
  return TOOL_CATEGORIES[toolName] || "other"
```

**Tool Matching Algorithm:**

```
matchesToolType(hook, toolName, category):
  toolTypes = hook.when.toolTypes
  if (!toolTypes || toolTypes.length === 0) return true  // match all
  return toolTypes.some(pattern =>
    pattern === "*" -> true
    pattern === category -> true
    pattern === toolName -> true
    try RegExp(pattern).test(toolName) catch -> false
  )
```

**Glob Matching Algorithm:**

```
matchGlob(pattern, filePath):
  normalize filePath: replace \ with /
  convert glob to regex:
    . -> \.
    ** -> .*
    * -> [^/]*
  return regex.test(fullPath) || regex.test(partialPath)
```

**File Path Extraction Priority:**

1. `args.path` (for fs_write, str_replace)
2. `args.file_path` (for embed_images)
3. `args.targetFile` (for delete_file)

### 3.5 Module: HookExecutor (hook-executor.ts)

**Pattern:** Command + Template Method

```typescript
class HookExecutor {
  private outputChannel: vscode.OutputChannel;
  private defaultTimeout: number; // 60000ms

  async execute(hook: HookDefinition, context: HookContext): Promise<HookResult>;
  private async executeAskAgent(hook, context, start): Promise<HookResult>;
  private async executeRunCommand(hook, context, start): Promise<HookResult>;
  private substitutePlaceholders(template: string, context: HookContext): string;
  private detectDenial(result: string): string | null;
  private killProcess(pid: number | undefined): void;
}
```

**askAgent Execution Flow:**

```
1. Read prompt from hook.then.prompt
2. Substitute placeholders ({{toolName}}, {{toolArgs}}, {{toolResult}}, {{nodeName}})
3. If context.toolResult exists, check for denial patterns
4. Return {status: "completed", output: resolvedPrompt}
   OR {status: "denied", error: denialPattern}
```

**runCommand Execution Flow:**

```
1. Read command from hook.then.command
2. Substitute placeholders
3. spawn(command, [], {shell: true, cwd: workspaceRoot, env: process.env})
4. Set timeout timer (60s)
5. Capture stdout (max 10KB), stderr (max 5KB)
6. On close: return based on exit code
   - code 0 -> "completed"
   - code != 0 -> "failed"
   - timeout -> "timed_out" (SIGTERM, then SIGKILL after 5s)
```

**Denial Detection:**

```
DENIAL_PATTERNS = ["FORBIDDEN", "DENY", "ACCESS_DENIED", "PERMISSION DENIED"]
detectDenial(result):
  upper = result.toUpperCase()
  for pattern in DENIAL_PATTERNS:
    if upper.includes(pattern) -> return pattern
  return null
```

### 3.6 Module: HookEmitter (hook-emitter.ts)

**Pattern:** Observer (publish)

```typescript
function emitHookFired(
  streamHandler: StreamHandler,
  streamId: string,
  hook: HookDefinition,
  event: string,
  toolName: string | undefined,
  result: HookResult,
  duration: number
): void;
```

**Event Payload:**

```json
{
  "type": "chat:toolCall",
  "toolCall": {
    "id": "hook-{timestamp}-{random4}",
    "name": "hook_fired",
    "args": { "hookName": "...", "event": "...", "toolName": "...", "action": "..." },
    "status": "completed|failed",
    "result": "output (max 200 chars)",
    "duration": 123
  }
}
```

### 3.7 Module: HookCommands (hook-commands.ts)

**Pattern:** Command + Registry

```typescript
class HookCommands implements vscode.Disposable {
  private disposables: vscode.Disposable[] = [];
  private executor: HookExecutor;

  async registerCommands(): Promise<void>;
  async getRegisteredCommands(): Promise<string[]>;
  private sanitizeName(name: string): string;
  dispose(): void;
}
```

**Name Sanitization Algorithm:**

```
sanitizeName(name):
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
```

---

## 4. Class Diagram

![Class Diagram](diagrams/class-diagram.png)

### 4.1 Interface Definitions

```typescript
// Core Types (hook-loader.ts)
interface HookDefinition {
  name: string;
  version: string;
  description?: string;
  enabled: boolean;
  when: HookTrigger;
  then: HookAction;
  filePath: string;
}

interface HookTrigger {
  type: "promptSubmit" | "agentStop" | "preToolUse" | "postToolUse"
    | "fileEdited" | "fileCreated" | "fileDeleted" | "userTriggered"
    | "preTaskExecution" | "postTaskExecution";
  patterns?: string[];
  toolTypes?: string[];
}

interface HookAction {
  type: "askAgent" | "runCommand";
  prompt?: string;
  command?: string;
}

// Executor Types (hook-executor.ts)
interface HookContext {
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  toolResult?: string;
  nodeName?: string;
  inputState?: unknown;
  taskOutput?: unknown;
  duration?: number;
}

interface HookResult {
  status: "completed" | "failed" | "timed_out" | "denied";
  output?: string;
  modifiedParams?: Record<string, unknown>;
  error?: string;
  duration: number;
}

// Engine Result Types (hook-engine.ts)
interface PreToolUseHookResult {
  denied: boolean;
  hookName?: string;
  reason?: string;
  injectedPrompts: string[];
}

interface PostToolUseHookResult {
  injectedPrompts: string[];
}

// Validation Types (hook-filters.ts)
interface HookValidationError {
  file: string;
  field: string;
  message: string;
}
```

---

## 5. Error Handling

### 5.1 Error Strategy: Fail-Open

| Layer | Error Behavior | Rationale |
|-------|---------------|-----------|
| HookLoader | Skip invalid files, log error, continue | One bad hook should not break others |
| HookEngine | Wrap each hook execution in try/catch | Pipeline must never crash |
| HookExecutor | Return "failed" status, capture error message | Caller decides how to handle |
| HookToolMatcher | Invalid regex returns false (no match) | Malformed pattern should not crash |
| HookCommands | Show warning message on failure | User notification without crash |

### 5.2 Error Logging

| Component | Output Channel | Log Level |
|-----------|---------------|-----------|
| HookLoader | "Kiro SDLC Hooks" | ERROR for parse failures, INFO for load count |
| HookEngine | "Kiro Hooks Engine" | ERROR via debugError() |
| HookExecutor | OutputChannel (injected) | ERROR for failures, HOOK for executions |
| HookEventsManager | OutputChannel (injected) | WARN for circular skips |

---

## 6. Integration Design

### 6.1 Integration with LangGraph Pipeline

The HookEngine is instantiated by the LangGraph pipeline setup and called at checkpoints:

```typescript
// In pipeline node execution:
const preResult = await hookEngine.firePreToolUse(toolName, args, streamHandler, streamId);
if (preResult.denied) {
  return { denied: true, reason: preResult.reason };
}
messages.push(...preResult.injectedPrompts.map(p => ({role: "system", content: p})));

// Execute tool...

const postResult = await hookEngine.firePostToolUse(toolName, args, result, streamHandler, streamId);
messages.push(...postResult.injectedPrompts.map(p => ({role: "system", content: p})));
```

### 6.2 Integration with VS Code Extension Lifecycle

```typescript
// In extension.ts activate():
const hookEngine = new HookEngine(workspaceRoot);
const hookCommands = new HookCommands(workspaceRoot, outputChannel);
await hookCommands.registerCommands();

// In extension.ts deactivate():
hookEngine.dispose();
hookCommands.dispose();
```

---

## 7. Security Design

### 7.1 Threat Model

| Threat | Risk Level | Mitigation |
|--------|-----------|------------|
| Malicious hook file in workspace | Low | Same trust as source code |
| Command injection via placeholders | Medium | Values truncated, but shell=true allows chaining |
| ReDoS via regex patterns | Low | try/catch around RegExp, timeout on matching |
| Memory exhaustion (large stdout) | Low | Stdout capped at 10KB, stderr at 5KB |
| Fork bomb via runCommand | Low | Timeout kills process tree after 60s |

### 7.2 Input Validation

| Input | Validation | Sanitization |
|-------|-----------|--------------|
| Hook JSON files | Schema validation before use | Invalid files rejected |
| toolTypes regex | Wrapped in try/catch | Invalid regex = no match |
| Placeholder values | None | Truncated (1000 chars for args/result) |
| Shell commands | None | Template substitution only |

---

## 8. Performance Design

### 8.1 Caching Strategy

| Cache | What | TTL | Eviction | Technology |
|-------|------|-----|----------|------------|
| Hook definitions | Parsed HookDefinition[] | Until reload | Manual (clearHookCache) | Module-level variable |
| Execution log | HookLogEntry[] | Indefinite | Trim to 100 when > 200 | In-memory array |

### 8.2 Performance Targets

| Operation | Target | Measurement |
|-----------|--------|-------------|
| loadHooks (cached) | < 1ms | Array reference return |
| loadHooks (cold) | < 100ms | File I/O + JSON parse |
| classifyTool | < 0.1ms | O(1) map lookup |
| matchGlob | < 1ms | Regex compilation + test |
| firePreToolUse (0 hooks match) | < 5ms | Filter + return |
| firePreToolUse (5 hooks match) | < 500ms | Sequential execution |
| runCommand execution | < 60s | Enforced timeout |

---

## 9. Monitoring & Observability

### 9.1 Logging

| Log Event | Level | Fields | Destination |
|-----------|-------|--------|-------------|
| Hooks loaded | INFO | count | "Kiro SDLC Hooks" output channel |
| Hook executed | HOOK | name, action, duration | OutputChannel (injected) |
| Hook failed | ERROR | name, error message | OutputChannel + debugError |
| Hook timed out | HOOK | name, timeout value | OutputChannel |
| Circular hook skipped | WARN | hook name | OutputChannel |
| Invalid hook file | ERROR/WARN | filename, validation errors | "Kiro SDLC Hooks" |

### 9.2 Metrics (via Execution Log)

| Metric | Type | Description |
|--------|------|-------------|
| hookName | String | Which hook fired |
| eventType | String | What event triggered it |
| timestamp | Number | When it fired |
| result | String | completed/failed/timed_out/denied |
| duration | Number | How long it took (ms) |

---

## 10. Deployment Considerations

### 10.1 Feature Configuration

| Property | Default | Description |
|----------|---------|-------------|
| hooks.enabled | true | Master switch for hook system |
| hooks.maxDepth | 3 | Maximum hook execution chain depth |
| hooks.timeout | 60000 | Default timeout for runCommand (ms) |

### 10.2 File Structure

```
.kiro/hooks/
├── *.json           # Hook definitions (JSON format)
├── *.kiro.hook      # Hook definitions (alternative extension)
└── *.sh             # Helper scripts (referenced by runCommand hooks)
```

### 10.3 Rollback Strategy

Hook system is fully file-based:
- **Disable a hook:** Set `"enabled": false` in the hook file
- **Disable all hooks:** Delete or rename `.kiro/hooks/` directory
- **Rollback:** `git checkout -- .kiro/hooks/` restores previous hook definitions
- **Extension rollback:** Previous extension version has previous hook engine code

---

## 11. Implementation Checklist

### Files (All Existing)

| # | File | Description |
|---|------|-------------|
| 1 | extension/src/langgraph/hook-engine.ts | Main orchestrator |
| 2 | extension/src/langgraph/hook-loader.ts | File loading + caching |
| 3 | extension/src/langgraph/hook-filters.ts | Validation + filtering |
| 4 | extension/src/langgraph/hook-tool-matcher.ts | Tool classification + matching |
| 5 | extension/src/langgraph/hook-executor.ts | Action execution |
| 6 | extension/src/langgraph/hook-emitter.ts | UI event emission |
| 7 | extension/src/langgraph/hook-commands.ts | VS Code command registration |
| 8 | extension/src/langgraph/hook-events.ts | Legacy event manager |

### Integration Points

| # | File | Integration |
|---|------|-------------|
| 1 | extension/src/langgraph/langgraph-engine.ts | Call hookEngine.firePreToolUse/firePostToolUse |
| 2 | extension/src/extension.ts | Instantiate HookEngine, HookCommands |
| 3 | extension/src/langgraph/stream-handler.ts | Receive emitted hook events |

---

## 12. Appendix

### Glossary

| Term | Definition |
|------|------------|
| Fail-open | Error in hook = pipeline continues (not blocked) |
| Execution stack | Set tracking currently-running hooks for circular detection |
| Placeholder | Template variable ({{toolName}}) substituted at runtime |
| Tool category | Classification of tools into groups (read/write/shell/web/other) |

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | Architecture Overview | [architecture.png](diagrams/architecture.png) | [architecture.drawio](diagrams/architecture.drawio) |
| 2 | Component Diagram | [component.png](diagrams/component.png) | [component.drawio](diagrams/component.drawio) |
| 3 | Class Diagram | [class-diagram.png](diagrams/class-diagram.png) | [class-diagram.drawio](diagrams/class-diagram.drawio) |
