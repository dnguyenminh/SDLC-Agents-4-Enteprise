# Functional Specification Document (FSD)

## Kiro Backend MCP Server — SA4E-18: Tool Visibility Tiers — giảm context bằng cách ẩn tool ít dùng

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-18 |
| Title | Tool Visibility Tiers — giảm context bằng cách ẩn tool ít dùng |
| Author | BA Agent |
| Version | 1.0 |
| Date | 2026-07-07 |
| Status | Draft |
| Related BRD | BRD-v1-SA4E-18.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-07-07 | BA Agent | Initiate document — auto-generated from BRD (documents/SA4E-18/BRD.md) and verified source code |
| 1.1 | 2026-07-08 | TA Agent | Technical enrichment — detailed API contracts (§3.1.6/§3.4.6), CORE_TOOLS config module (§3.2.7), usage tracking design + hooks (§3.3.7), physical DDL (§4.3), internal wiring (§5.3), technical NFRs (§8.1), Open Issues |

---

## 1. Introduction

### 1.1 Purpose

This FSD specifies **how** the Kiro Backend MCP server (`kiro-backend-mcp`) implements a two-tier tool visibility model to reduce LLM context consumption, as required by BRD SA4E-18. It translates the four BRD user stories into concrete Use Cases, Business Rules, data specifications, and error handling that a developer can implement without ambiguity.

The functional intent: the MCP `ListTools` response advertises only a small **CORE** allowlist of tools; all other (**EXTENDED**) tools stay hidden from `ListTools` but remain fully discoverable via `find_tools` and callable via `execute_dynamic_tool` and direct `CallTool`. Per-tool usage is counted for future data-driven re-classification.

### 1.2 Scope

Scope is inherited from BRD SA4E-18 §1.1. Technical clarifications for this FSD:

- The visibility filter is applied at exactly one place: the `ListToolsRequestSchema` handler in `backend/src/server/mcpServer.ts`.
- The core allowlist is a single new configuration source `CORE_TOOLS` (e.g., under `backend/src/config`).
- Usage tracking hooks into two invocation paths: `CallToolRequestSchema` (`mcpServer.ts`) and `execute_dynamic_tool` (`backend/src/modules/orchestration/OrchestrationModule.ts`).
- Usage counts persist in the existing Memory DB (SQLite) owned by `MemoryModule` (`backend/src/modules/memory/MemoryModule.ts`).
- Startup ingestion of the FULL tool set into the `mcp_tools` vector index (`backend/src/index.ts`) is unchanged.

**Out of scope** (per BRD §1.2): auto re-classification algorithm, admin UI, changing tool handlers, per-module opt-in flags, and changes to `find_tools` embedding logic.

### 1.3 Definitions & Acronyms

| Term | Definition |
|------|------------|
| CORE tier | Small allowlisted set of tools kept visible in `ListTools`. |
| EXTENDED tier | All tools hidden from `ListTools` but discoverable/callable dynamically. |
| CORE_TOOLS | Central config allowlist (string[]) defining the CORE tier. |
| ListTools | MCP request returning available tool definitions (handled by `ListToolsRequestSchema`). |
| CallTool | MCP request executing a tool by name (handled by `CallToolRequestSchema`). |
| find_tools | Meta-tool performing semantic search over the `mcp_tools` vector index. |
| execute_dynamic_tool | Meta-tool that resolves and executes any registered tool by name. |
| Meta-tools | `find_tools`, `execute_dynamic_tool`, `orchestration_status` — the discovery/execution pathway that must always be visible. |
| Usage counter | Persistent per-tool `call_count` incremented on each invocation. |
| mcp_tools | SQLite table holding the vector index of the full tool set for `find_tools`. |

### 1.4 References

| Document | Location |
|----------|----------|
| BRD | BRD-v1-SA4E-18.docx (source: documents/SA4E-18/BRD.md) |
| MCP server | backend/src/server/mcpServer.ts |
| Orchestration module | backend/src/modules/orchestration/OrchestrationModule.ts |
| Module registry | backend/src/modules/ModuleRegistry.ts |
| Startup tool ingestion | backend/src/index.ts |
| Memory module (DB) | backend/src/modules/memory/MemoryModule.ts |
| Tool type contract | backend/src/types/tool.ts |
| Dynamic tool execution pattern | .kiro/steering/tool-usage-dynamic.md |

---

## 2. System Overview

### 2.1 System Context Diagram

![System Context](diagrams/system-context.png)
*[Edit in draw.io](diagrams/system-context.drawio)*

The AI Agent/LLM client talks to `kiro-backend-mcp` over MCP (JSON-RPC). Internally, `mcpServer` reads the `CORE_TOOLS` allowlist and filters `ModuleRegistry.getAllToolDefinitions()` for `ListTools`. Hidden tools are discovered through `OrchestrationModule.find_tools` (backed by the `mcp_tools` vector index) and executed through `OrchestrationModule.execute_dynamic_tool` (resolving handlers from `ModuleRegistry.getToolHandlers()`). Every invocation increments a per-tool counter persisted to the Memory DB, non-blocking.

### 2.2 System Architecture

The change is additive and localized:

| Component | File | Change |
|-----------|------|--------|
| MCP `ListTools` handler | `backend/src/server/mcpServer.ts` | Apply `CORE_TOOLS` filter before serializing tools. |
| MCP `CallTool` handler | `backend/src/server/mcpServer.ts` | Increment usage counter on invocation (non-blocking). |
| `execute_dynamic_tool` | `backend/src/modules/orchestration/OrchestrationModule.ts` | Increment usage counter on dynamic execution (non-blocking). |
| Central config | `backend/src/config` (new `CORE_TOOLS`) | Single allowlist source of truth. |
| Usage store | Memory DB via `MemoryModule` | New `tool_usage` table. |
| Startup ingestion | `backend/src/index.ts` | UNCHANGED — full tool set → `mcp_tools`. |

**Architecture pattern:** AI-agent system. The primary quality driver is token-budget efficiency, achieved through progressive disclosure (CORE visible, EXTENDED on-demand) while preserving 100% backward compatibility of tool invocation.

**High-level flow:**

![High-Level Flow](diagrams/architecture-flow.png)
*[Edit in draw.io](diagrams/architecture-flow.drawio)*

---

## 3. Functional Requirements

### 3.1 Feature: Filtered ListTools (CORE-only response)

**Source:** BRD Story 1 — Reduce LLM context by returning only core tools in ListTools.

#### 3.1.1 Description

The `ListToolsRequestSchema` handler filters the full tool definition list down to only tools whose `name` is present in the `CORE_TOOLS` allowlist, then serializes the reduced list. All other behavior of the handler (name/description/inputSchema mapping) is unchanged.

#### 3.1.2 Use Case

**Use Case ID:** UC-01
**Actor:** AI Agent / LLM Client
**Preconditions:** Server started; all modules `ready`; `CORE_TOOLS` config loaded; full tool set registered.
**Postconditions:** Client receives only CORE tools; EXTENDED tools omitted.

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Client sends `ListTools` | | MCP request arrives at `ListToolsRequestSchema`. |
| 2 | | System reads allowlist | Handler reads `CORE_TOOLS`. |
| 3 | | System gets definitions | Handler calls `registry.getAllToolDefinitions()` (full set). |
| 4 | | System filters | Keep only tools where `name` ∈ `CORE_TOOLS`. |
| 5 | | System responds | Returns `{ tools: [ ...core only ] }` (8 tools). |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | A CORE_TOOLS name has no matching registered tool | Skip the unmatched name; log a warning (see BR-04); return only matched core tools. |
| AF-2 | CORE_TOOLS contains duplicate names | De-duplicate before matching; output unaffected (BR-08). |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | `CORE_TOOLS` empty/undefined | Fall back to a safe default that still includes the meta-tools (BR-03); log a warning; do not crash. |
| EF-2 | `getAllToolDefinitions()` returns empty (no modules ready) | Return empty tools list; do not crash; upstream module-health issue reported separately. |

**Sequence:**

![Sequence - Filtered ListTools and Dynamic Discovery](diagrams/sequence-listtools.png)
*[Edit in draw.io](diagrams/sequence-listtools.drawio)*

#### 3.1.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-01 | `ListTools` MUST return only tools whose name ∈ `CORE_TOOLS`. | BRD Story 1 AC-1 |
| BR-02 | The CORE set MUST be exactly: `mem_search`, `mem_ingest`, `mem_ingest_file`, `code_search`, `get_curated_context`, `find_tools`, `execute_dynamic_tool`, `orchestration_status`. | BRD Story 1 Req-2 |
| BR-03 | Meta-tools `find_tools`, `execute_dynamic_tool`, `orchestration_status` MUST always be visible, regardless of other config. | BRD Story 1 Req-3 |
| BR-11 | The filter MUST be applied ONLY at `ListTools`; `CallTool` and `execute_dynamic_tool` MUST NOT enforce the allowlist. | BRD Business Flow Note |

#### 3.1.4 Data Specifications

**Input Data:** none (MCP `ListTools` has no business parameters).

**Output Data (per tool entry):**

| Field | Type | Description |
|-------|------|-------------|
| name | string | Tool identifier; used for allowlist matching. |
| description | string | LLM-readable description. |
| inputSchema | object | JSON schema of tool arguments. |

#### 3.1.5 UI Specifications

Not applicable — headless MCP server, no UI.

#### 3.1.6 API Contract (Detailed) <!-- TA enrichment -->

**Endpoint:** JSON-RPC method `tools/list` (MCP `ListToolsRequestSchema`) — `backend/src/server/mcpServer.ts`
**Auth:** Inherits existing MCP transport model — no new auth surface. [Implements: Story 1]

**Request:**

| Field | Type | Notes |
|-------|------|-------|
| jsonrpc | "2.0" | Required by MCP |
| id | number/string | Correlation id |
| method | "tools/list" | Fixed |
| params | object | Empty / ignored (no business params) |

```json
{ "jsonrpc": "2.0", "id": 1, "method": "tools/list", "params": {} }
```

**Response (filtered to CORE only):**

| Field | Type | Description |
|-------|------|-------------|
| result.tools | ToolDef[] | Only tools whose `name` ∈ resolved CORE set (8 entries) |
| result.tools[].name | string | Tool identifier |
| result.tools[].description | string | LLM-readable description (defaults to `''`) |
| result.tools[].inputSchema | object | JSON schema; defaults to `{ type:'object', properties:{} }` |

```json
{
  "jsonrpc": "2.0", "id": 1,
  "result": { "tools": [
    { "name": "mem_search", "description": "...", "inputSchema": { "type": "object", "properties": { "query": { "type": "string" } }, "required": ["query"] } },
    { "name": "find_tools", "description": "Search available tools by semantic query", "inputSchema": { "type": "object", "properties": { "query": { "type": "string" }, "threshold": { "type": "number" }, "top_k": { "type": "number" } }, "required": ["query"] } }
    /* ... 8 CORE tools total; EXTENDED omitted ... */
  ] }
}
```

**Error / edge behavior:**

| Condition | Behavior |
|-----------|----------|
| Unknown core name in CORE_TOOLS | Skipped; `logger.warn` (BR-04); other core tools still returned |
| Duplicate core names | De-duplicated via Set (BR-08) |
| CORE_TOOLS empty/undefined | Fall back to META_TOOLS-only safe default (BR-03/EF-1); warn |
| `getAllToolDefinitions()` empty | Return `{ tools: [] }`; never throw (EF-2) |

---

### 3.2 Feature: Central CORE_TOOLS Allowlist Configuration

**Source:** BRD Story 2 — Central allowlist configuration for the core tool set.

#### 3.2.1 Description

A single configuration constant `CORE_TOOLS` (type `string[]`) defines the CORE tier. The `ListTools` filter reads only from this source. Adding/removing a tool from CORE requires editing only this config — no module code changes (Approach B).

#### 3.2.2 Use Case

**Use Case ID:** UC-02
**Actor:** Platform Maintainer
**Preconditions:** Access to `backend/src/config`; server restartable.
**Postconditions:** Visibility of a tool changes on restart without any module edit.

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Maintainer edits `CORE_TOOLS` | | Adds/removes a tool name in the single config file. |
| 2 | Maintainer restarts server | | Server reloads config. |
| 3 | | System applies allowlist | `ListTools` reflects the new CORE set. |
| 4 | | System keeps callability | Removed tools remain callable via `execute_dynamic_tool`/`CallTool`. |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | Maintainer removes a tool from CORE | Tool disappears from `ListTools` but stays discoverable/callable (BR-11, Story 4). |
| AF-2 | Maintainer adds a tool to CORE | Tool appears in `ListTools` after restart with no module change. |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | Config contains an unknown/misspelled name | Startup logs a warning and continues (BR-04); server does not fail. |
| EF-2 | Config entry is empty string / non-string | Entry rejected by validation (BR-05); log warning; ignore entry. |

#### 3.2.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-04 | An unknown name in `CORE_TOOLS` MUST log a warning and continue (graceful degradation) — never crash startup. | BRD Story 2 Req-4 / AC-3 |
| BR-05 | `CORE_TOOLS` entries MUST be non-empty strings; invalid entries are ignored with a warning. | BRD Story 2 Validation |
| BR-06 | Changing the CORE set MUST require editing only `CORE_TOOLS` (0 per-module edits). | BRD Story 2 Req-3 / AC-4 |
| BR-08 | Duplicate `CORE_TOOLS` entries MUST be de-duplicated with no effect on output. | BRD Story 2 Validation |

#### 3.2.4 Data Specifications

**CORE_TOOLS constant:**

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| CORE_TOOLS | string[] | Yes | Each entry non-empty string; de-duplicated; meta-tools always effectively included | Central allowlist of core tool names. |

**Confirmed initial value:**

```
CORE_TOOLS = [
  "mem_search",
  "mem_ingest",
  "mem_ingest_file",
  "code_search",
  "get_curated_context",
  "find_tools",
  "execute_dynamic_tool",
  "orchestration_status"
]
```

#### 3.2.5 UI Specifications

Not applicable.

#### 3.2.6 API Contract (Functional View)

Not applicable — configuration is code-level, no runtime API in this CR.

#### 3.2.7 Implementation Design — CORE_TOOLS module <!-- TA enrichment -->

**File (new):** `backend/src/config/CoreTools.ts` — dedicated module (SRP; keeps `BackendConfig.ts` focused on env/zod config). Single source of truth (BR-06).

```typescript
// backend/src/config/CoreTools.ts
import type { Logger } from 'pino';

/** Meta-tools that MUST always be visible regardless of config (BR-03). */
export const META_TOOLS: readonly string[] = [
  'find_tools', 'execute_dynamic_tool', 'orchestration_status',
] as const;

/** Central CORE allowlist — edit ONLY here to change ListTools visibility (BR-06). */
export const CORE_TOOLS: readonly string[] = [
  'mem_search', 'mem_ingest', 'mem_ingest_file',
  'code_search', 'get_curated_context',
  'find_tools', 'execute_dynamic_tool', 'orchestration_status',
] as const;

/** Normalize allowlist: drop invalid (BR-05), de-dup (BR-08), always include META_TOOLS (BR-03). Never throws (BR-04). */
export function resolveCoreToolNames(logger?: Logger): Set<string> {
  const src = Array.isArray(CORE_TOOLS) ? CORE_TOOLS : [];
  const valid = src.filter(n => {
    const ok = typeof n === 'string' && n.trim().length > 0;
    if (!ok) logger?.warn({ entry: n }, 'CORE_TOOLS: ignoring invalid entry (BR-05)');
    return ok;
  });
  return new Set<string>([...valid, ...META_TOOLS]);
}
```

**mcpServer import & filter** (`backend/src/server/mcpServer.ts`):

```typescript
import { resolveCoreToolNames } from '../config/CoreTools.js';

const coreNames = resolveCoreToolNames(logger);   // resolved once at server creation
const registered = new Set(tools.map(t => t.name));
for (const name of coreNames) {
  if (!registered.has(name)) logger.warn({ name }, 'CORE_TOOLS name has no registered tool — skipped (BR-04)');
}

server.setRequestHandler(ListToolsRequestSchema, async () => {
  const filtered = tools.filter(t => coreNames.has(t.name));   // BR-01
  return {
    tools: filtered.map(t => ({
      name: t.name,
      description: t.description || '',
      inputSchema: t.inputSchema || { type: 'object', properties: {} },
    })),
  };
});
```

> **TA Note:** No per-module edits needed (BR-06). Filtering happens ONLY here; `CallTool`/`execute_dynamic_tool` do NOT consult the allowlist (BR-11).

---
### 3.3 Feature: Per-Tool Usage Tracking

**Source:** BRD Story 3 — Per-tool usage tracking for data-driven classification.

#### 3.3.1 Description

Each successful tool invocation increments a persistent per-tool counter. Both invocation paths contribute to the same counter: the `CallTool` handler (`mcpServer.ts`) and `execute_dynamic_tool` (`OrchestrationModule.ts`). The counter is stored in the Memory DB and survives restarts. Tracking is best-effort and MUST NOT block or fail the tool call.

#### 3.3.2 Use Case

**Use Case ID:** UC-03
**Actor:** Operations Engineer (beneficiary); AI Agent (trigger of counting)
**Preconditions:** Memory DB available; `tool_usage` table present.
**Postconditions:** `call_count` for the invoked tool increased by 1; `last_called_at` updated.

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Agent invokes a tool | | Via `CallTool` or `execute_dynamic_tool`. |
| 2 | | System executes handler | Tool logic runs and produces a result. |
| 3 | | System increments counter | `UPSERT tool_usage(tool_name)` → `call_count += 1`, `last_called_at = now`. |
| 4 | | System returns result | Tool result returned to the agent (independent of step 3 outcome). |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | First-ever call of a tool | Insert row with `call_count = 1`. |
| AF-2 | Operator reads usage | Aggregated counts read via existing memory/analytics read path. |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | Usage-counter write fails | Log at warn level; DO NOT propagate; tool result still returned (BR-09). |
| EF-2 | Tool execution itself returns error | Counting policy MUST be consistent (see BR-12: count successful invocations); errors are not counted as successful use. |

**State — tool lifecycle & visibility tier:**

![State - Tool Lifecycle](diagrams/state-tool-lifecycle.png)
*[Edit in draw.io](diagrams/state-tool-lifecycle.drawio)*

#### 3.3.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-07 | Both `CallTool` and `execute_dynamic_tool` paths MUST increment the same per-tool counter. | BRD Story 3 Req-1 / AC-4 |
| BR-09 | Usage-counter write failure MUST be non-blocking: log at warn, never fail the tool call. | BRD Story 3 Req-3 / AC-3 |
| BR-10 | Usage counts MUST persist across restarts (stored in Memory DB). | BRD Story 3 Req-2 / AC-2 |
| BR-12 | A successful invocation MUST increment the counter by exactly 1 (no double counting when both paths are involved in a single logical call). | BRD Story 3 AC-1 |

#### 3.3.4 Data Specifications

**tool_usage (new table in Memory DB):**

| Field | Type | Required | Validation | Description |
|-------|------|----------|------------|-------------|
| tool_name | string (PK) | Yes | Non-empty; matches a registered tool name | Name of the invoked tool. |
| call_count | integer | Yes | ≥ 0; monotonically increasing | Cumulative number of successful invocations. |
| last_called_at | timestamp | No | ISO-8601 | Timestamp of most recent invocation. |

**Output (read path):** list of `{ tool_name, call_count, last_called_at }` for operator inspection.

#### 3.3.5 UI Specifications

Not applicable (counts read via existing memory/analytics tooling).

#### 3.3.6 API Contract (Functional View)

> **Note:** The exact read tool/endpoint and payload shape are deferred to the TDD. Functionally, an operator MUST be able to read aggregated `tool_usage` rows.

#### 3.3.7 Implementation Design — Usage tracking <!-- TA enrichment -->

**MemoryEngine methods (new)** — `backend/src/modules/memory/MemoryEngine.ts`:

```typescript
/** Increment (or insert) per-tool usage counter. Idempotent UPSERT. BR-07/BR-10/BR-12. */
incrementToolUsage(toolName: string): void {
  this.db.prepare(`
    INSERT INTO tool_usage (tool_name, call_count, last_called_at)
    VALUES (?, 1, datetime('now'))
    ON CONFLICT(tool_name) DO UPDATE SET
      call_count = call_count + 1,
      last_called_at = datetime('now')
  `).run(toolName);
}

/** Read usage rows for operator inspection. */
getToolUsage(toolName?: string): Array<{ tool_name: string; call_count: number; last_called_at: string | null }> {
  return toolName
    ? this.db.prepare('SELECT tool_name, call_count, last_called_at FROM tool_usage WHERE tool_name = ?').all(toolName) as any
    : this.db.prepare('SELECT tool_name, call_count, last_called_at FROM tool_usage ORDER BY call_count DESC').all() as any;
}
```

**Non-blocking wrapper (BR-09)** — shared helper used by BOTH invocation paths:

```typescript
// backend/src/server/toolUsageTracker.ts
export function trackToolUsage(registry: ModuleRegistry, logger: Logger, toolName: string): void {
  try {
    const mem = registry.getModule('memory') as MemoryModule | undefined;
    if (mem?.status === 'ready') mem.getEngine().incrementToolUsage(toolName);
  } catch (err) {
    logger.warn({ err, toolName }, 'tool_usage increment failed — non-blocking (BR-09)');
  }
}
```

**CallTool hook** (`mcpServer.ts`, inside `CallToolRequestSchema` after successful handler):

```typescript
const result = await handler(args || {});
if (!result.isError) {                 // BR-12: count only successful invocations
  trackToolUsage(registry, logger, name);   // counts the top-level invoked tool
  // ... existing KB notification logic unchanged ...
}
return result as any;
```

**execute_dynamic_tool hook** (`OrchestrationModule.ts`, after inner handler succeeds):

```typescript
const result = await handler(toolArgs);
if (this.registry && !result.isError) {
  trackToolUsage(this.registry, this.logger, toolName);  // counts the RESOLVED inner tool
}
return result;
// (apply the same after clientManager.executeTool(...) for proxied child-server tools)
```

> **TA Note (BR-12 — no double count):** In the dynamic path the client calls `tools/call` with `name = "execute_dynamic_tool"`, so the CallTool hook increments `execute_dynamic_tool`, while the orchestration hook increments the *inner* `toolName`. Different rows → the inner tool counted exactly once. Direct `CallTool(hiddenTool)` increments `hiddenTool` once. Errors never counted.

---

### 3.4 Feature: Backward-Compatible Discoverability & Callability of Hidden Tools

**Source:** BRD Story 4 — Preserve full discoverability and callability of hidden tools.

#### 3.4.1 Description

Reducing `ListTools` visibility MUST NOT reduce capability. All tools (including EXTENDED) remain ingested into `mcp_tools` at startup, discoverable via `find_tools`, and callable via `execute_dynamic_tool` and direct `CallTool`. No allowlist enforcement occurs on any execution path.

#### 3.4.2 Use Case

**Use Case ID:** UC-04
**Actor:** AI Agent / LLM Client
**Preconditions:** Full tool set ingested into `mcp_tools`; handlers resolvable via `registry.getToolHandlers()`.
**Postconditions:** A hidden tool is found and executed with identical results to pre-change behavior.

**Main Flow:**

| Step | Actor | System | Description |
|------|-------|--------|-------------|
| 1 | Agent needs a hidden capability | | Capability not in the CORE list. |
| 2 | Agent calls `find_tools(query)` | | Semantic search request. |
| 3 | | System searches index | `OrchestrationModule.find_tools` scores `mcp_tools` vectors; returns top matches with name + schema. |
| 4 | Agent calls `execute_dynamic_tool(name, args)` | | Passes discovered name + args (object). |
| 5 | | System resolves handler | `registry.getToolHandlers().get(name)` executes; result returned. |
| 6 | | System increments counter | Per BR-07. |

**Alternative Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| AF-1 | Agent already knows the hidden tool name | Skip `find_tools`; call `execute_dynamic_tool` directly. |
| AF-2 | Hidden tool called via direct `CallTool` name | Executes normally — no "Unknown tool" introduced by the visibility change (BR-11). |
| AF-3 | Tool owned by a child MCP server | `execute_dynamic_tool` proxies via `clientManager` (existing behavior, unchanged). |

**Exception Flows:**

| ID | Condition | Steps |
|----|-----------|-------|
| EF-1 | `find_tools` weak match returns nothing relevant | Agent lowers threshold (0.3) / rephrases (per tool-usage-dynamic pattern); retry. |
| EF-2 | `execute_dynamic_tool` name not found in registry | Return `isError: true` "Tool {name} not found or not ready" (existing behavior). |
| EF-3 | Child server DEAD | `execute_dynamic_tool` returns proxy error; agent checks `orchestration_status` (existing behavior). |

#### 3.4.3 Business Rules

| Rule ID | Rule | Source |
|---------|------|--------|
| BR-13 | All tools (incl. EXTENDED) MUST be ingested into `mcp_tools` at startup so `find_tools` can return them. | BRD Story 4 Req-1 / AC-1 |
| BR-14 | `execute_dynamic_tool` MUST resolve and execute any registered tool by name regardless of tier. | BRD Story 4 Req-2 / AC-2 |
| BR-15 | Direct `CallTool` MUST still execute any registered tool name (no allowlist enforcement on execution). | BRD Story 4 Req-3 / AC-3 |
| BR-16 | 100% of previously-working tool invocations MUST continue to work (0 regressions). | BRD Story 4 AC-4 |

#### 3.4.4 Data Specifications

**find_tools output (per match):** `{ name: string, description: string, schema: object, score: number }` (unchanged).
**execute_dynamic_tool input:** `{ toolName | tool_name: string, arguments: object }` — `arguments` MUST be an object, not a JSON string.

#### 3.4.5 UI Specifications

Not applicable.

#### 3.4.6 API Contract (Detailed — unchanged behavior, documented) <!-- TA enrichment -->

**find_tools** (CORE, directly callable) — `tools/call` name `find_tools`:

| Arg | Type | Req | Default | Notes |
|-----|------|-----|---------|-------|
| query | string | Yes | — | Semantic query |
| threshold | number | No | (client-side; not enforced server-side today) | Match cutoff |
| top_k | number | No | 5 | Max results |

Response `content[0].text` = JSON `{ "tools": [ { "name","description","schema","score" } ], "query" }` (cosine-similarity ranked over `mcp_tools`).

**execute_dynamic_tool** (CORE, directly callable) — `tools/call` name `execute_dynamic_tool`:

| Arg | Type | Req | Notes |
|-----|------|-----|-------|
| toolName \| tool_name | string | Yes | Either accepted (code reads `args.toolName || args.tool_name`) |
| arguments | object | Yes | MUST be an object, not a JSON string |

Resolution order: if `clientManager.ownsTool(toolName)` → proxy to child server; else `registry.getToolHandlers().get(toolName)`. Not found → `{ isError: true, content:[{text:"Tool {name} not found or not ready."}] }` (EF-2). [Implements: BR-13, BR-14, BR-15, BR-16]

> **TA Note:** This CR changes NEITHER contract. It only adds the post-success usage hook inside `execute_dynamic_tool`.

---
## 4. Data Model

> **Note:** Physical DDL, indexes and migration plan are deferred to the TDD §4. This is the logical model.

### 4.1 Entity Relationship Diagram

The change introduces one new logical entity (`tool_usage`) and reuses the existing `mcp_tools` index entity. There is no enforced foreign key; `tool_usage.tool_name` logically references a registered tool name / `mcp_tools.name`.

![Data Model ERD](diagrams/data-model-erd.png)
*[Edit in draw.io](diagrams/data-model-erd.drawio)*

### 4.2 Logical Entities

#### Entity: tool_usage (NEW)

| Attribute | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| tool_name | string (PK) | Yes | BR-05, BR-07 | Name of the invoked tool. |
| call_count | integer | Yes | BR-12 | Cumulative successful invocations. |
| last_called_at | timestamp | No | — | Most recent invocation time. |

#### Entity: mcp_tools (EXISTING — unchanged)

| Attribute | Type | Required | Business Rule | Description |
|-----------|------|----------|---------------|-------------|
| id | integer (PK) | Yes | — | Auto id. |
| name | string | Yes | BR-13 | Tool name (used by find_tools + CORE match). |
| description | string | Yes | — | Tool description. |
| schema_json | string | Yes | — | Serialized input schema. |
| category | string | No | — | Tool category. |
| vector | blob | Yes | BR-13 | Embedding for semantic search. |

**Relationships:**

| From Entity | To Entity | Cardinality | Description |
|-------------|-----------|-------------|-------------|
| CORE_TOOLS (config) | mcp_tools | selects subset | Names in CORE_TOOLS mark which tools are visible in ListTools. |
| mcp_tools | tool_usage | 1 : 0..1 | Each tool may accumulate one usage row keyed by name. |

### 4.3 Physical DDL — tool_usage (NEW) <!-- TA enrichment -->

**Location:** append to `SCHEMA_V1` in `backend/src/engine/db/schema.ts`, immediately after the `mcp_tools` table. Idempotent (`IF NOT EXISTS`), re-applied every startup — **no schema_version bump required**.

```sql
-- Per-tool usage counters (SA4E-18)
CREATE TABLE IF NOT EXISTS tool_usage (
  tool_name      TEXT PRIMARY KEY,
  call_count     INTEGER NOT NULL DEFAULT 0,
  last_called_at TEXT
);
```

**UPSERT (increment):**

```sql
INSERT INTO tool_usage (tool_name, call_count, last_called_at)
VALUES (?, 1, datetime('now'))
ON CONFLICT(tool_name) DO UPDATE SET
  call_count = call_count + 1,
  last_called_at = datetime('now');
```

**Notes / consistency review:**
- `tool_name` PK gives O(1) upsert; no secondary index needed at this scale (~60 tools).
- No FK to `mcp_tools(name)` — `mcp_tools` uses autoincrement `id` PK with `UNIQUE(name)`; a logical (non-enforced) reference by name is intentional. Rows may exist for proxied child-server tools not present as CORE.
- Same shared DB as `mcp_tools` (verified: `index.ts` + `find_tools` both use `memoryModule.getEngine().getDb()`), so counts persist across restarts (BR-10).

---

## 5. Integration Specifications

> **Note:** This CR does not add new external integrations. It relies on internal components only. Technical connection details deferred to TDD §6.

### 5.1 Internal Component: Memory DB (SQLite via MemoryModule)

| Attribute | Value |
|-----------|-------|
| Purpose | Persist per-tool usage counts (survives restarts). |
| Direction | Bidirectional (write on invocation, read for operators). |
| Data Format | SQLite rows. |
| Frequency | Write: per tool call (non-blocking). Read: on-demand. |

**Data Exchange:**

| Our Data | Store | Direction | Business Rule |
|----------|-------|-----------|---------------|
| tool_name, call_count, last_called_at | tool_usage table | Write (UPSERT) | BR-07, BR-09, BR-10 |
| aggregated usage | tool_usage table | Read | BR-10 |

### 5.2 Internal Component: mcp_tools Vector Index

| Attribute | Value |
|-----------|-------|
| Purpose | Keep the FULL tool set discoverable via find_tools. |
| Direction | Write at startup (index.ts), read at find_tools. |
| Data Format | SQLite rows with float32 vector blobs. |
| Frequency | Build once at startup; read on each find_tools. |

### 5.3 Internal Wiring — usage store access <!-- TA enrichment -->

No new DI container or constructor changes required:

| Consumer | How it reaches the store | Change |
|----------|--------------------------|--------|
| `mcpServer` CallTool | Already receives `registry` + `logger`; resolves `registry.getModule('memory')` lazily inside the handler | Add `trackToolUsage(...)` call on success |
| `OrchestrationModule.execute_dynamic_tool` | Already holds `this.registry` + `this.logger` | Add `trackToolUsage(...)` on success (native + proxied branches) |
| `MemoryEngine` | Owns the shared `better-sqlite3` handle | Add `incrementToolUsage` / `getToolUsage` |

**Rationale:** lazy `getModule('memory')` resolution keeps the change additive and avoids ordering coupling (memory module is `ready` before the HTTP server starts, per `index.ts`). If memory is not `ready`, the wrapper silently no-ops + warns (BR-09) — the tool call still returns normally.

---

## 6. Processing Logic

### 6.1 ListTools Filtering

**Trigger:** MCP `ListTools` request.
**Schedule:** On demand.
**Input:** Full tool definitions from `registry.getAllToolDefinitions()`; `CORE_TOOLS` allowlist.
**Output:** Filtered tool list (CORE only).

**Processing Steps:**

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Load/normalize `CORE_TOOLS` (de-dup, drop invalid entries). | Invalid entry → warn + skip (BR-05). |
| 2 | Get full definitions. | Empty → return empty list (EF-2). |
| 3 | Filter by `name ∈ CORE_TOOLS`. | Unknown core name → warn + skip (BR-04). |
| 4 | Serialize and return. | On serialization error → propagate MCP error (existing behavior). |

### 6.2 Usage Increment

**Trigger:** Successful tool invocation via `CallTool` or `execute_dynamic_tool`.
**Schedule:** On demand.
**Input:** `tool_name`.
**Output:** Updated `tool_usage` row.

**Processing Steps:**

| Step | Description | Error Handling |
|------|-------------|----------------|
| 1 | Resolve tool result (must succeed to count — BR-12). | Tool error → do not count. |
| 2 | UPSERT `tool_usage`: insert(count=1) or update(count+1, last_called_at=now). | Write failure → warn + swallow (BR-09), never fail the call. |
| 3 | Return tool result to caller. | Independent of step 2 result. |

**Activity Diagram:** see System Context (§2.1) and Sequence (§3.1.2).

---

## 7. Security Requirements

> **Note:** Business-level only; technical controls deferred to TDD §7.

### 7.1 Authentication & Authorization

| Role | Permissions | Features |
|------|-------------|----------|
| AI Agent / LLM | Invoke tools (CORE directly; EXTENDED via discovery+execute) | ListTools, CallTool, find_tools, execute_dynamic_tool |
| Platform Maintainer | Edit `CORE_TOOLS` config | Visibility control (code-level) |
| Operations Engineer | Read usage counts | tool_usage read path |

> No new authentication surface is introduced. The MCP transport's existing access model is unchanged. **Security note:** because hidden tools remain fully callable, visibility tiers are a context-optimization mechanism, NOT an access-control mechanism — do not treat EXTENDED as a permission boundary.

### 7.2 Data Sensitivity Classification

| Data Type | Classification | Business Requirement |
|-----------|---------------|---------------------|
| CORE_TOOLS config | Internal | Non-sensitive; source-controlled. |
| tool_usage counts | Internal | Operational metric; no PII. |

### 7.3 Audit Trail

| Event | Logged Fields | Retention | Business Reason |
|-------|--------------|-----------|-----------------|
| Unknown core name at startup | tool name, warning | Log retention policy | Diagnose misconfigured allowlist (BR-04). |
| Usage write failure | tool name, error | Log retention policy | Detect tracking degradation (BR-09). |

---

## 8. Non-Functional Requirements

> **Note:** Technical implementation deferred to TDD §8–§9.

| Category | Business Requirement | Acceptance Criteria |
|----------|---------------------|---------------------|
| Performance (Context) | Reduce ListTools token footprint | ≥ 70% reduction vs ~60-tool baseline (→ 8 core tools). |
| Compatibility | 100% backward compatibility | 0 regressions; every previously-callable tool still callable. |
| Discoverability | Hidden tools findable | 100% of hidden tools returnable by find_tools for a relevant query. |
| Performance (Latency) | No added call latency | Usage tracking < 5 ms overhead per call; non-blocking. |
| Maintainability | Single point of change | Exactly one config source (CORE_TOOLS); 0 per-module edits. |
| Reliability | Graceful degradation | Unknown core names / usage-write failures never crash or fail calls. |
| Observability | Usage metrics | Per-tool cumulative call_count persisted and readable. |

### 8.1 Technical NFR Detail <!-- TA enrichment -->

| Category | Target (quantified) | Verification |
|----------|---------------------|--------------|
| Usage-write overhead | < 5 ms p95 per call; single indexed UPSERT on PK; synchronous but try/catch-wrapped | Micro-benchmark UPSERT vs baseline |
| ListTools payload | ~60 tools → 8 core; ≥ 70% serialized-byte reduction | Compare serialized `tools/list` before/after |
| Filter cost | O(n) over tool list with `Set.has`; n≈60, <1 ms | Unit timing |
| Reliability | 0 startup failures on bad/duplicate/empty CORE_TOOLS | TC-06/TC-07 + EF-1 |
| Persistence | call_count survives restart (shared WAL SQLite) | TC-12 |

> **TA Note:** Usage write is synchronous within the handler but exception-isolated; if <5 ms cannot be met under load, defer to `queueMicrotask` fire-and-forget (Open Issue OI-2).

---

## 9. Error Handling (User-Facing)

> **Note:** For an AI-agent system the "user" is the calling LLM/agent. Technical logging specs deferred to TDD §9.

### 9.1 Error Scenarios

| Scenario | Severity | Agent-Facing Behavior | Expected Recovery |
|----------|----------|-----------------------|-------------------|
| Needed tool not in ListTools | Info | Tool simply absent from CORE list | Use find_tools then execute_dynamic_tool. |
| find_tools returns weak/no match | Warning | Empty or low-score results | Lower threshold to 0.3, rephrase query, retry. |
| execute_dynamic_tool name not found | Warning | `isError: true`, "Tool {name} not found or not ready" | Re-run find_tools to get correct name. |
| Child server DEAD (proxied tool) | Warning | Proxy error text | Check orchestration_status; retry. |
| Unknown name in CORE_TOOLS | Info (server log) | No agent impact | Maintainer fixes config; warning logged (BR-04). |
| Usage-counter write fails | Info (server log) | No agent impact; result still returned | None required (non-blocking, BR-09). |

### 9.2 Notification Requirements

| Event | Who is Notified | Channel | Timing |
|-------|----------------|---------|--------|
| Unknown core name | Maintainer/Ops | Server log (warn) | At startup / on ListTools |
| Usage write failure | Ops | Server log (warn) | On failure |

---

## 10. Testing Considerations

### 10.1 Test Scenarios

| ID | Scenario | Input | Expected Output | Priority |
|----|----------|-------|-----------------|----------|
| TC-01 | ListTools returns only CORE | ListTools request | Exactly 8 CORE tools, no others (BR-01/02) | High |
| TC-02 | Meta-tools always visible | ListTools request | find_tools, execute_dynamic_tool, orchestration_status present (BR-03) | High |
| TC-03 | Token reduction | Serialized ListTools before/after | ≥ 70% smaller payload | High |
| TC-04 | Add to CORE via config | Edit CORE_TOOLS + restart | New tool appears in ListTools, no module edit (BR-06) | High |
| TC-05 | Remove from CORE via config | Edit CORE_TOOLS + restart | Tool absent from ListTools but callable (AF-1/BR-11) | High |
| TC-06 | Unknown core name | CORE_TOOLS has bad name + restart | Warning logged, startup succeeds (BR-04) | High |
| TC-07 | Duplicate core names | CORE_TOOLS has duplicates | De-duplicated, output unaffected (BR-08) | Medium |
| TC-08 | Hidden tool discoverable | find_tools(relevant query) | Hidden tool returned with name + schema (BR-13) | High |
| TC-09 | Hidden tool executable (dynamic) | execute_dynamic_tool(hidden name, args) | Same result as pre-change (BR-14) | High |
| TC-10 | Hidden tool executable (direct) | CallTool(hidden name) | Executes, no "Unknown tool" (BR-11/15) | High |
| TC-11 | Usage increments both paths | Call via CallTool and execute_dynamic_tool | call_count reflects both (BR-07) | High |
| TC-12 | Usage persists across restart | Invoke N times, restart, read | call_count preserved (BR-10) | High |
| TC-13 | Usage write failure non-blocking | Simulate DB write failure | Tool result still returned (BR-09) | High |
| TC-14 | Full regression of tool calls | Invoke all previously-working tools | 100% still work (BR-16) | High |

---

## 11. Appendix

### Diagrams

| Diagram | File |
|---------|------|
| System Context | [system-context.png](diagrams/system-context.png) |
| Sequence — Filtered ListTools + Discovery | [sequence-listtools.png](diagrams/sequence-listtools.png) |
| State — Tool Lifecycle & Visibility Tier | [state-tool-lifecycle.png](diagrams/state-tool-lifecycle.png) |

### Diagram Index

| # | Diagram | Image | Source (editable) |
|---|---------|-------|-------------------|
| 1 | System Context | [system-context.png](diagrams/system-context.png) | [system-context.drawio](diagrams/system-context.drawio) |
| 2 | Sequence — ListTools Filtered + Dynamic Discovery | [sequence-listtools.png](diagrams/sequence-listtools.png) | [sequence-listtools.drawio](diagrams/sequence-listtools.drawio) |
| 3 | State — Tool Lifecycle & Visibility Tier | [state-tool-lifecycle.png](diagrams/state-tool-lifecycle.png) | [state-tool-lifecycle.drawio](diagrams/state-tool-lifecycle.drawio) |

### Requirements Traceability (BRD → FSD)

| BRD Story | FSD Feature | Use Case | Business Rules |
|-----------|-------------|----------|----------------|
| Story 1 (filtered ListTools) | §3.1 | UC-01 | BR-01, BR-02, BR-03, BR-11 |
| Story 2 (central allowlist) | §3.2 | UC-02 | BR-04, BR-05, BR-06, BR-08 |
| Story 3 (usage tracking) | §3.3 | UC-03 | BR-07, BR-09, BR-10, BR-12 |
| Story 4 (backward compat) | §3.4 | UC-04 | BR-13, BR-14, BR-15, BR-16 |

### API Contracts (Detailed) — COMPLETED (TA) <!-- TA enrichment -->

Detailed contracts are now inline in the FSD:
- `tools/list` filtered response → §3.1.6
- CORE_TOOLS config module + filter pseudocode → §3.2.7
- Usage tracking (MemoryEngine methods, UPSERT, non-blocking wrapper, both hooks) → §3.3.7 + §4.3
- find_tools / execute_dynamic_tool (unchanged, documented) → §3.4.6
- Internal wiring → §5.3

### Open Issues (TA) <!-- TA enrichment -->

| ID | Issue | Owner | Target | Status |
|----|-------|-------|--------|--------|
| OI-1 | Concrete operator read path for `tool_usage` (dedicated tool vs. Analytics endpoint) not yet chosen | SA / TA | TDD phase | Open |
| OI-2 | Sync UPSERT vs `queueMicrotask` fire-and-forget if <5 ms overhead target missed under load | SA | TDD / perf test | Open |
| OI-3 | Whether to count the `execute_dynamic_tool` meta-wrapper itself (currently yes, distinct row) | BA + TA | FSD sign-off | Open |
| OI-4 | Proxied child-server tools in `tool_usage` have no CORE mapping — confirm acceptable (EXTENDED-only) | TA | TDD phase | Open |

### Data Model / NFR Consistency Review (TA) <!-- TA enrichment -->

- ✅ `tool_usage` matches BA §4.2 logical entity; DDL added in §4.3.
- ✅ `mcp_tools` confirmed unchanged; startup ingestion in `index.ts` untouched (BR-13).
- ✅ Filtering isolated to `ListToolsRequestSchema` (BR-11); execution paths do not enforce allowlist.
- ⚠️ `last_called_at` stored as `datetime('now')` UTC text (SQLite); documented for operator readers.

### Change Log from BRD

- No functional deviations from BRD. Added logical `tool_usage` entity, RTM, and explicit security clarification that visibility tiers are NOT an access-control boundary.
