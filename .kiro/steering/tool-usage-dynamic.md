---
targets: langgraph
inclusion: always
title: Tool Usage - Dynamic Tool Execution Pattern
priority: 10
---

# Dynamic Tool Execution Pattern

## Problem

The MCP server exposes tools from child servers (atlassian, markdown-exporter, etc.) via orchestration. These nested tools are NOT directly callable — they return "Unknown tool" if called directly.

## Solution: 2-Step Pattern

### Step 1: Discover tools with `find_tools`

```
find_tools(query: "jira issue", threshold: 0.3, top_k: 5)
```

This returns available tool names and their schemas.

### Step 2: Execute with `execute_dynamic_tool`

```
execute_dynamic_tool(
  tool_name: "jira_get_issue",
  arguments: { "issue_key": "KSA-123", "fields": "summary,description" }
)
```

**CRITICAL:** The `arguments` field MUST be an object (not a JSON string).

## Common Tool Categories

| Category | Discovery Query | Example Tools |
|----------|----------------|---------------|
| Jira | `find_tools("jira")` | jira_get_issue, jira_search, jira_create_issue |
| Export | `find_tools("export docx")` | export_docx, embed_images |
| Draw.io | `find_tools("drawio")` | drawio_auto_layout, drawio_export_png |

## Rules

1. **NEVER** call nested tools directly (they will return "Unknown tool")
2. **ALWAYS** use `execute_dynamic_tool` as the execution wrapper
3. **Arguments must be objects** — `{"issue_key": "X"}` not `"{\"issue_key\": \"X\"}"`
4. If a tool fails with "Unknown tool", check if it needs `toggle_tool` first
5. Core tools (mem_search, mem_ingest, find_tools, code_search, agent_log) are directly callable — no need for execute_dynamic_tool

## Error Recovery

If `execute_dynamic_tool` returns an error:
- Schema validation error → check argument types against inputSchema from find_tools
- Tool not found on server → the child server may be DEAD, check `orchestration_status`
- Timeout → retry once with simpler arguments
