---
name: mcp-tools-reference
description: Reference of MCP tools — core (direct) vs nested (child servers), parameters, discovery
---

# MCP Tools Reference

> **Server endpoint:** Configured in `.kiro/settings/mcp.json` — port/host may change.
> Current: `http://localhost:9181/mcp` (check mcp.json if you cannot connect).
> For this project's OpenCode MCP server, the port is **48721**.

In OpenCode, tools are available directly in the session by name. Core tools below are exposed on the MCP server with a `code-intel_` prefix (e.g. `mem_search` → `code-intel_mem_search`).

## Core Tools (called directly)

| # | Tool | Description | Required Params | OpenCode Name |
|---|------|-------------|-----------------|---------------|
| 1 | `mem_search` | Hybrid KB search (BM25 + vector + graph) | `query` | `code-intel_mem_search` |
| 2 | `mem_ingest` | Store a knowledge entry into KB | `content` | `code-intel_mem_ingest` |
| 3 | `mem_ingest_file` | Ingest file by path (auto-reads content) | `file_path` | `code-intel_mem_ingest_file` |
| 4 | `code_search` | Full-text search of code symbols (FTS5 porter stemming) | `query` | `code-intel_code_search` |
| 5 | `drawio_auto_layout` | Auto-fix draw.io layout (ELK engine) | `file_path` | `code-intel_drawio_auto_layout` |
| 6 | `drawio_export_png` | Export .drawio → PNG | `file_path` | `code-intel_drawio_export_png` |
| 7 | `get_curated_context` | NL query across code + KB + graph (token-budgeted) | `query` | `code-intel_get_curated_context` |
| 8 | `orchestration_status` | Status of all child MCP servers | _(none)_ | `code-intel_orchestration_status` |
| 9 | `find_tools` | Find tools from child servers by semantic query | `query` | `code-intel_find_tools` |
| 10 | `execute_dynamic_tool` | Execute a tool from child servers | `toolName`, `arguments` | `code-intel_execute_dynamic_tool` |
| 11 | `stream_write_file` | Write/append local file (creates parent dirs) | `file_path`, `content` | `code-intel_stream_write_file` |
| 12 | `embed_image` | Embed local image refs → base64 in markdown | `file_path` | `code-intel_embed_image` |

## Nested Tools (child servers — use find_tools + execute_dynamic_tool)

| Category | Discovery Query | Example Tools |
|----------|-----------------|---------------|
| Jira | `find_tools("jira")` | jira_get_issue, jira_search, jira_create_issue, jira_update_issue, jira_get_transitions, transition_issue |
| Export | `find_tools("export docx")` | export_docx |
| Draw.io | `find_tools("drawio")` | drawio_auto_layout, drawio_export_png |

## Usage

### Core tools — call directly via MCP:
```
mem_search(query: "SA4E-85 BRD", limit: 5, detail: true)  # code-intel_mem_search
code_search(query: "ProviderService", limit: 10)          # code-intel_code_search
```

### Nested tools — 2 steps:
```
# Step 1: Discover
find_tools(query: "jira issue", threshold: 0.3, top_k: 5)  # code-intel_find_tools

# Step 2: Execute
execute_dynamic_tool(toolName: "jira_get_issue", arguments: { "issue_key": "SA4E-85" })  # code-intel_execute_dynamic_tool
```

## Important notes

- `arguments` in `execute_dynamic_tool` MUST be an object, NOT a JSON string
- Core tools are called directly — NO need for `execute_dynamic_tool`
- If a tool returns "Unknown tool" → use `find_tools` to discover the exact name
- If a child server is down → check `orchestration_status`

## Detailed Params

### mem_search
- `query` (required): search query
- `limit`: max results (default 10)
- `tier`: WORKING | EPISODIC | SEMANTIC | PROCEDURAL
- `type`: DECISION | ERROR_PATTERN | ARCHITECTURE | API_DESIGN | REQUIREMENT | LESSON_LEARNED | PROCEDURE | CONTEXT
- `scope`: USER | PROJECT | SHARED | all
- `detail`: true → include content preview

### mem_ingest
- `content` (required): full content
- `summary`: brief summary (auto if omitted)
- `type`: DECISION | ERROR_PATTERN | ARCHITECTURE | API_DESIGN | REQUIREMENT | LESSON_LEARNED | PROCEDURE | CONTEXT
- `scope`: USER | PROJECT | SHARED (default: USER)
- `source`: source identifier (file path, ticket)
- `tags`: comma-separated tags
- `agent_name`: SM | BA | SA | DEV | QA | DevOps

### mem_ingest_file
- `file_path` (required): path to document
- `type`: REQUIREMENT | ARCHITECTURE | DECISION | PROCEDURE | CONTEXT
- `scope`: USER | PROJECT | SHARED
- `format`: markdown | text

### get_curated_context
- `query` (required): natural language query
- `max_tokens`: token budget (default 4000)
- `include_source`: search code (default true)
- `include_memory`: search KB (default true)
- `include_graph`: expand graph (default true)

### drawio_auto_layout
- `file_path` (required): path to .drawio
- `algorithm`: layered | force | mrtree | radial
- `spacing`: node spacing px (default 80)
- `direction`: DOWN | RIGHT | LEFT | UP

### stream_write_file
- `file_path` (required): target path
- `content` (required): content to write
- `mode`: write | append (default: write)