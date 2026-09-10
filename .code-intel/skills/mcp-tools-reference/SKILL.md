---
name: mcp-tools-reference
description: MCP Tools Reference
---



# MCP Tools Reference

> **Server endpoint:** Configured in `opencode.json` — port/host có thể thay đổi.  
> Hiện tại: `http://localhost:9181/mcp` (kiểm tra mcp.json nếu không kết nối được).

## Core Tools (gọi trực tiếp)

| # | Tool | Mô tả | Required Params |
|---|------|--------|-----------------|
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

## Nested Tools (child servers — dùng find_tools + execute_dynamic_tool)

| Category | Discovery Query | Ví dụ Tools |
|----------|----------------|-------------|
| Jira | `find_tools("jira")` | jira_get_issue, jira_search, jira_create_issue, jira_update_issue, jira_get_transitions, transition_issue |
| Export | `find_tools("export docx")` | export_docx |
| Draw.io | `find_tools("drawio")` | drawio_auto_layout, drawio_export_png |

## Cách dùng

### Core tools — gọi trực tiếp qua MCP:
```
mem_search(query: "SA4E-85 BRD", limit: 5, detail: true)
code_search(query: "ProviderService", limit: 10)
```

### Nested tools — 2 bước:
```
# Step 1: Discover
find_tools(query: "jira issue", threshold: 0.3, top_k: 5)

# Step 2: Execute
execute_dynamic_tool(toolName: "jira_get_issue", arguments: { "issue_key": "SA4E-85" })
```

## Lưu ý quan trọng

- `arguments` trong `execute_dynamic_tool` PHẢI là object, KHÔNG phải JSON string
- Core tools gọi trực tiếp — KHÔNG cần `execute_dynamic_tool`
- Nếu tool trả "Unknown tool" → dùng `find_tools` để discover tên chính xác
- Nếu child server chết → check `orchestration_status`

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


