---
inclusion: manual
description: Python MCP Orchestration architecture reference. Activate when debugging orchestration, find_tools, or execute_dynamic_tool issues.
---

# Python MCP Orchestration — Architecture Guide

## Overview

The Python MCP orchestration layer enables **nested tool discovery and execution** across multiple MCP servers. It acts as a meta-orchestrator: child MCP servers (including other orchestrators) are spawned as subprocesses, and their tools become accessible through a unified `find_tools` / `execute_dynamic_tool` interface.

## Architecture

```
┌─────────────────────────────────────────────────┐
│  AI Agent (Kiro)                                │
│  Calls: find_tools, execute_dynamic_tool        │
└──────────────┬──────────────────────────────────┘
               │ MCP protocol (stdio)
┌──────────────▼──────────────────────────────────┐
│  Python MCP Server (mcp-code-intelligence)      │
│  ┌────────────────────────────────────────────┐ │
│  │ OrchestrationEngine                        │ │
│  │  ├── UnifiedRegistry (search + scoring)    │ │
│  │  ├── RoutingTable (O(1) tool→server map)   │ │
│  │  ├── SmartRouter (timeout propagation)     │ │
│  │  ├── LocalServerManager (subprocess mgmt)  │ │
│  │  └── AutoLogger (KB logging)               │ │
│  └────────────────────────────────────────────┘ │
│                    │                             │
│    ┌───────────────┼───────────────┐             │
│    ▼               ▼               ▼             │
│  Child MCP 1    Child MCP 2    Child MCP N       │
│  (atlassian)    (bridge)       (any server)      │
└──────────────────────────────────────────────────┘
```

## Key Components

### 1. OrchestrationEngine (`orchestration/engine.py`)

Central coordinator. On startup:
1. Spawns all configured child MCP servers as subprocesses
2. Builds routing table (tool → server mapping)
3. Builds delegation list (detects nested orchestrators)
4. Ingests tool definitions into KB for semantic search

### 2. find_tools (`orchestration/meta/find_tools.py`)

**Delegation pattern for nested tool discovery:**

```
find_tools("jira search") →
  1. Search local UnifiedRegistry (tokenized matching)
  2. Delegate to nested orchestrators (servers with their own find_tools)
  3. Register discovered tools in registry + routing table
  4. Fallback: KB semantic search
  5. Return top 10 results ranked by: hits*0.6 + relevance*0.4
```

**Critical behavior:**
- First call discovers tools from nested servers (lazy discovery)
- Subsequent calls find them in local registry (cached)
- Each discovered tool gets registered with `register_nested_tool()` which updates both registry AND routing table

### 3. execute_dynamic_tool (`orchestration/meta/execute_dynamic.py`)

**Routing via bridge pattern:**

```
execute_dynamic_tool("jira_search", {jql: "..."}) →
  1. Check tool_mapping (populated by find_tools)
  2. If mapped → call nested server's execute_dynamic_tool
  3. If not mapped → check fallback chain → single route
  4. Record hit: +1 on execute, +3 on non-error result
```

**Scoring impact:** Tools that return successful results get +3 hits, making them rank higher in future `find_tools` searches.

### 4. Event Loop Architecture

**Problem:** MCP server runs on its own asyncio event loop. Child server calls are async. But `find_tools` and `execute_dynamic_tool` are invoked synchronously by the MCP framework.

**Solution:** Background thread with dedicated event loop.

```python
# engine.py stores reference at startup:
self._orch_loop = asyncio.get_event_loop()

# execute_dynamic.py schedules on that loop from any thread:
future = asyncio.run_coroutine_threadsafe(
    _execute(engine, tool_name, arguments),
    engine._orch_loop
)
result = future.result(timeout=60)
```

**find_tools uses ThreadPoolExecutor** for nested delegation calls:
```python
_DELEGATE_EXECUTOR = concurrent.futures.ThreadPoolExecutor(max_workers=2)
# Submits _run_nested_call which uses run_coroutine_threadsafe
```

### 5. UnifiedRegistry (`orchestration/registry/registry.py`)

- Tokenized search (splits tool names + descriptions into searchable tokens)
- Hit-based ranking: `combined = hits*0.6 + relevance*0.4`
- Fallback chains: same-named tools across servers → try in config order
- Session toggles: enable/disable tools at runtime
- Decay mechanism: prevents runaway hit counts (subtract 500 when > 1000)

### 6. RoutingTable (`orchestration/routing/table.py`)

- O(1) lookup: `tool_name → RouteEntry(server_name)`
- Rebuilt on startup from all child server tools
- Dynamically extended via `add_route()` when nested tools are discovered

### 7. Nested Detection (`orchestration/nested_detection.py`)

Detects child servers that expose `find_tools` or `execute_dynamic_tool` — these are nested orchestrators whose tools can be lazily discovered.

## Configuration

File: `.code-intel/orchestration.json`

```json
{
  "settings": {
    "similarity_threshold": 0.7,
    "auto_log": true
  },
  "mcp_servers": {
    "atlassian": {
      "command": "uvx",
      "args": ["mcp-atlassian", "--jira-url", "..."],
      "timeout": 30000,
      "enabled": true
    }
  }
}
```

## Limitations

1. **Must call `find_tools` before `execute_dynamic_tool` for nested tools** — the mapping is populated lazily on first discovery
2. **Mapping lost on restart** — tool_mapping is in-memory only; after server restart, `find_tools` must be called again to re-discover nested tools
3. **45s timeout on nested find_tools** — if a nested server is slow, delegation times out
4. **60s timeout on execute_dynamic_tool** — hard limit per tool execution
5. **Max 2 concurrent delegation threads** — ThreadPoolExecutor limited to prevent resource exhaustion
6. **Meta-tools filtered from child registration** — `find_tools`, `execute_dynamic_tool`, etc. are not registered as child tools (they're meta-tools handled specially)

## Usage Pattern (for AI Agents)

```
# Step 1: Discover tools (REQUIRED before execute)
find_tools("jira search issues")
→ Returns: [{name: "jira_search", description: "...", input_schema: {...}}, ...]

# Step 2: Execute discovered tool
execute_dynamic_tool(tool_name="jira_search", arguments={jql: "project = KSA"})
→ Returns: {total: 65, issues: [...]}

# Step 3: Subsequent finds are faster (cached in registry)
find_tools("jira comment")
→ Returns from local registry (no nested delegation needed if already discovered)
```

## File Structure

```
orchestration/
├── engine.py              ← Central coordinator
├── config.py              ← Config loading from orchestration.json
├── nested_detection.py    ← Detect nested orchestrators
├── meta/
│   ├── find_tools.py      ← Tool discovery + nested delegation
│   ├── execute_dynamic.py ← Tool execution + routing
│   ├── dispatcher.py      ← Meta-tool dispatch
│   ├── agent_log.py       ← Agent activity logging
│   ├── manage_auto_approve.py ← Auto-approve management
│   └── recursion_guard.py ← Prevent infinite delegation loops
├── registry/
│   ├── registry.py        ← UnifiedRegistry (search + scoring)
│   ├── grouper.py         ← Semantic grouping + fallback chains
│   └── tokenizer.py       ← Token-based search indexing
├── routing/
│   ├── router.py          ← SmartRouter (timeout propagation)
│   └── table.py           ← RoutingTable (O(1) lookup)
├── local/
│   ├── manager.py         ← LocalServerManager (subprocess lifecycle)
│   ├── process.py         ← Individual MCP process wrapper
│   ├── rpc.py             ← JSON-RPC over stdio
│   └── watcher.py         ← Config hot-reload watcher
└── logging/
    └── auto_logger.py     ← Automatic KB logging of tool calls
```
