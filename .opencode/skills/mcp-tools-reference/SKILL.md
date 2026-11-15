---
name: mcp-tools-reference
description: MCP Tools Reference
---



# MCP Tools Reference

> **Server name và endpoint do user cấu hình** trong `opencode.json` (V1: `mcp.<name>`, V2: `mcp.servers.<name>`) hoặc trong runtime `.code-intel/settings.json`.
> KHÔNG hardcode tên server, port hoặc URL.
>
> OpenCode expose tool theo tên server:
> - Direct mode: `<server>_<tool>`
> - Code Mode: `tools.<server>.<tool>`
>
> Các tên dưới đây là **capability suffix**; dùng đúng tool ID hiển thị trong session hiện tại.

## Core Capabilities (gọi trực tiếp, không qua `execute_dynamic_tool`)

| # | Capability | Mô tả | Required Params |
|---|------------|--------|-----------------|
| 1 | `mem_search` | Hybrid search KB (BM25 + vector + graph) | `query` |
| 2 | `mem_ingest` | Lưu knowledge entry vào KB | `content` |
| 3 | `mem_ingest_file` | Ingest file theo path (auto-read content) | `file_path` |
| 4 | `code_search` | Full-text search code symbols (FTS5 porter stemming) | `query` |
| 5 | `drawio_auto_layout` | Auto-fix layout draw.io (ELK engine) | `file_path` |
| 6 | `drawio_export_png` | Export .drawio → PNG | `file_path` |
| 7 | `get_curated_context` | NL query across code + KB + graph (token-budgeted) | `query` |
| 8 | `orchestration_status` | Status tất cả child MCP servers | _(none)_ |
| 9 | `find_tools` | Tìm tools từ child servers theo semantic query | `query` |
| 10 | `execute_dynamic_tool` | Thực thi tool từ child servers | `toolName`, `arguments` |
| 11 | `stream_write_file` | Write/append file local (creates parent dirs) | `file_path`, `content` |
| 12 | `embed_image` | Embed local image refs → base64 trong markdown | `file_path` |
| 13 | `agent_log` | Ghi log tiến trình agent | `ticket_key`, `agent_name`, `step`, `status`, `message` |

## Nested Tools (child servers — dùng `find_tools` + `execute_dynamic_tool`)

| Category | Discovery Query | Ví dụ Tools |
|----------|----------------|-------------|
| Jira | `find_tools("jira")` | jira_get_issue, jira_search, jira_create_issue, jira_update_issue, jira_get_transitions, transition_issue |
| Export | `find_tools("export docx")` | export_docx |
| Draw.io | `find_tools("drawio")` | drawio_auto_layout, drawio_export_png |

## Cách dùng

### Core capabilities — gọi qua tool ID thực tế:

```
# Direct mode (ví dụ; prefix phụ thuộc tên server do user đặt)
<server>_mem_search(query: "SA4E-85 BRD", limit: 5, detail: true)
<server>_code_search(query: "ProviderService", limit: 10)

# Code Mode
tools.<server>.mem_search(query: "SA4E-85 BRD", limit: 5, detail: true)
```

### Nested tools — 2 bước:

```
# Step 1: Discover
<server>_find_tools(query: "jira issue", threshold: 0.3, top_k: 5)

# Step 2: Execute
<server>_execute_dynamic_tool(toolName: "jira_get_issue", arguments: { "issue_key": "SA4E-85" })
```

## Lưu ý quan trọng

- `arguments` trong `execute_dynamic_tool` PHẢI là object, KHÔNG phải JSON string
- Core capabilities gọi trực tiếp qua tool ID của server — KHÔNG cần `execute_dynamic_tool`
- Nếu tool trả "Unknown tool" → dùng `find_tools` để discover tên chính xác
- Nếu child server chết → check `orchestration_status`
- Nếu capability không có trong tool list → MCP server chưa kết nối hoặc user chưa cấu hình server; báo user, KHÔNG tự bịa tool ID
- KHÔNG hardcode tên server/prefix/port/URL trong prompt hoặc script

## Params chi tiết

### mem_search
- `query` (required): Search query
- `limit`: Max results (default 10)
- `tier`: WORKING | EPISODIC | SEMANTIC | PROCEDURAL
- `type`: DECISION | ERROR_PATTERN | ARCHITECTURE | API_DESIGN | REQUIREMENT | LESSON_LEARNED | PROCEDURE | CONTEXT
- `scope`: USER | PROJECT | SHARED | all
- `detail`: true → include content preview

### mem_ingest
- `content` (required): Full content
- `summary`: Brief summary (auto if omitted)
- `type`: DECISION | ERROR_PATTERN | ARCHITECTURE | API_DESIGN | REQUIREMENT | LESSON_LEARNED | PROCEDURE | CONTEXT
- `scope`: USER | PROJECT | SHARED (default: USER)
- `source`: Source identifier (file path, ticket)
- `tags`: Comma-separated tags
- `agent_name`: SM | BA | SA | DEV | QA | DevOps

### mem_ingest_file
- `file_path` (required): Path to document
- `type`: REQUIREMENT | ARCHITECTURE | DECISION | PROCEDURE | CONTEXT
- `scope`: USER | PROJECT | SHARED
- `format`: markdown | text

### get_curated_context
- `query` (required): Natural language query
- `max_tokens`: Token budget (default 4000)
- `include_source`: Search code (default true)
- `include_memory`: Search KB (default true)
- `include_graph`: Expand graph (default true)

### drawio_auto_layout
- `file_path` (required): Path to .drawio
- `algorithm`: layered | force | mrtree | radial
- `spacing`: Node spacing px (default 80)
- `direction`: DOWN | RIGHT | LEFT | UP

### stream_write_file
- `file_path` (required): Target path
- `content` (required): Content to write
- `mode`: write | append (default: write)
