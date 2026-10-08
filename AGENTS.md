# AGENTS.md — SDLC-Agents-4-Enterprise

## Project Overview
Multi-agent SDLC pipeline with specialized agents (BA, TA, SA, QA, DEV, DevOps, UI) coordinated by Scrum Master. Kotlin Multiplatform backend + Kotlin/JS frontend + Python MCP orchestration.

## Key Rules
1. **SM as Entry Point** — Jira ticket → route through SM
2. **Code Standards** — SOLID, 200 lines/file, 20 lines/function, separate models
3. **Draw.io Only** — Never Mermaid
4. **Dynamic Tools** — find_tools → execute_dynamic_tool
5. **Quality Gates** — Verify after each phase
6. **No Workarounds** — Root cause only
7. **Self-Learning** — KB first, ingest after

## Architecture
- Backend: Kotlin/Ktor/SQLDelight/Koin (shared/ + server/)
- Frontend: Kotlin/JS + HTML Templates + Vite
- Orchestration: Python MCP server
- Docs: documents/{TICKET}/ with STATUS.json

## Communication: Vietnamese (user), English (code)


# Always-On SDLC Rules (from .opencode/rules)


---

# Hướng dẫn sử dụng code-intel MCP — Dynamic Tools

MCP server `code-intel` (cấu hình trong `opencode.json` → `mcp.code-intel`) cung cấp các **dynamic tools** — tức là các công cụ được phát hiện và đăng ký lúc runtime, KHÔNG nằm cố định trong system prompt. Do đó, để dùng chúng bạn PHẢI chủ động khám phá tên tool trước khi gọi.

## 1. Tìm kiếm tool — `code-intel_find_tools`

Tìm kiếm theo ngữ nghĩa (semantic) các tool có sẵn phù hợp với ý định:

```
code-intel_find_tools(query: "semantic code search across symbols")
code-intel_find_tools(query: "export drawio diagram to png")
code-intel_find_tools(query: "ingest knowledge into memory")
code-intel_find_tools(query: "curated context for a question")
```

Kết quả trả về danh sách `toolName` + mô tả. Chọn tool gần nhất với nhu cầu.

## 2. Thực thi tool — `code-intel_execute_dynamic_tool`

Sau khi biết `toolName`, gọi để thực thi:

```
code-intel_execute_dynamic_tool(
  toolName: "code_intel_drawio_export_png",
  arguments: { "file_path": "docs/flow.drawio", "output_path": "docs/flow.png" }
)
```

- `toolName`: tên chính xác lấy từ `find_tools` (thường có prefix `code_intel_`).
- `arguments`: object JSON chứa tham số của tool đó (xem mô tả trả về ở bước 1).

## Quy trình chuẩn (workflow)

1. Nhận nhu cầu chuyên biệt (vẽ diagram, semantic search, memory ingest/search, doc export...) mà tool tĩnh (`bash`, `read`, `grep`, `glob`, `edit`, `write`) không đáp ứng.
2. Gọi `code-intel_find_tools(query)` để khám phá tên tool chính xác.
3. Gọi `code-intel_execute_dynamic_tool(toolName, arguments)` để chạy.
4. Nếu sai tên / thiếu tham số → đọc thông báo lỗi, gọi lại `find_tools` để xác nhận rồi thử lại.

## Các tool phổ biến của code-intel (tham khảo)

| Tool | Dùng cho |
|------|----------|
| `code_intel_code_search` | Tìm kiếm full-text trên symbols |
| `code_intel_get_curated_context` | Truy vấn ngữ nghĩa toàn bộ codebase (code + memory + graph) |
| `code_intel_mem_search` | Tìm kiếm trong workspace memory (BM25 + vector) |
| `code_intel_mem_ingest` / `code_intel_mem_ingest_file` | Lưu knowledge vào memory |
| `code_intel_drawio_auto_layout` | Tự động sắp xếp layout drawio |
| `code_intel_drawio_export_png` | Export drawio sang PNG |
| `code_intel_embed_image` | Nhúng ảnh base64 vào markdown |
| `code_intel_execute_dynamic_tool` | Thực thi bất kỳ dynamic tool nào đã phát hiện |
| `code_intel_find_tools` | Khám phá danh sách dynamic tool |

## Lưu ý quan trọng

- ⛔ LUÔN gọi `find_tools` trước khi đoán tên tool — đừng tự bịa tên.
- ⛔ Nếu MCP `code-intel` không kết nối (lỗi connection) → báo lỗi rõ ràng cho user, KHÔNG giả lập kết quả.
- ✅ Khi đã biết tên tool, ưu tiên `execute_dynamic_tool` thay vì gọi tool tĩnh tương đương (vd: vẽ diagram qua drawio tool thay vì tự viết XML).


---



# Agent Role Boundaries — Responsibility Matrix

## Purpose

This file defines EXACTLY what each agent is responsible for. No agent may perform actions outside its defined scope. Violations are logged and trigger immediate stop.

## Role Matrix

| Agent | Creates/Writes | Reads | CANNOT do |
|-------|---------------|-------|-----------|
| **sm-agent** | STATUS.json, RUN-LOG.md, jira.conf | All files (for verification) | ❌ Write documents, code, diagrams, tests |
| **ba-agent** | BRD.md, FSD.md (draft), diagrams | Jira tickets, KB, code intelligence | ❌ Write TDD, code, tests, DPG |
| **ta-agent** | FSD.md (enrichment only) | BRD, FSD draft, code intelligence | ❌ Write BRD, TDD, code, tests |
| **sa-agent** | TDD.md, DISCREPANCY.md, diagrams | BRD, FSD, KB, code intelligence, DB schema | ❌ Write BRD, FSD, code, tests |
| **qa-agent** | STP.md, STC.md, TEST-REPORT.md, test data CSVs, diagrams | BRD, FSD, TDD, source code | ❌ Write BRD, FSD, TDD, production code |
| **dev-agent** | Source code, unit tests, integration tests, UG.md | TDD, FSD, BRD, KB, code intelligence | ❌ Write BRD, FSD, TDD, STP, DPG |
| **devops-agent** | CI/CD configs (Phase 4.5), DPG.md, RLN.md, Dockerfile, infra configs, diagrams | TDD, FSD, BRD, STP, source code configs | ❌ Write BRD, FSD, TDD, STP, application code |
| **ui-agent** | Wireframes, UI specs, draw.io mockups | FSD, BRD, existing frontend code | ❌ Write backend code, TDD, STP |
| **security-agent** | SECURITY-REVIEW.md (3.7), SECURITY-ASSESSMENT.md (5.7), PENTEST-REPORT.md (6.3), SECURITY-DEPLOY-REVIEW.md (6.7) | TDD, source code, CI/CD configs, Dockerfile, DPG, deps, running app | ❌ Write feature code, fix code (only report findings) |

## SM-Specific Enforcement

### SM is a COORDINATOR — not an implementor

SM's job is to:
1. **Discover** — what phase we're in, what's done, what's next
2. **Decide** — which agent to invoke, with what context
3. **Invoke** — call `invokeSubAgent(name: "{agent}", prompt: "...")` 
4. **Verify** — read the output, check quality gates
5. **Report** — tell user what happened, ask for next step
6. **Transition** — update Jira status, STATUS.json

SM NEVER:
- Writes document content (even "just a quick fix")
- Acts as another agent (even "temporarily")
- Performs code reviews (delegate to dev-agent or qa-agent)
- Generates diagrams (delegate to the responsible agent)

### Violation Detection

If RUN-LOG.md contains any of these patterns, it's a violation:
- `BA (SM acting)` or `SM (BA acting)`
- `SA (SM acting)` or `SM (SA acting)`  
- `QA (SM acting)` or `SM (QA acting)`
- `DEV (SM acting)` or `SM (DEV acting)`
- `DevOps (SM acting)` or `SM (DevOps acting)`
- Any entry where Agent = SM but Action = "Create {document}"
- Any entry where Agent = SM but Action = "Write {code/test}"

## Sub-Agent Self-Check

Each agent MUST verify it's being asked to do something within its scope:

```
Before starting work:
1. Am I being asked to produce an output listed in my "Creates/Writes" column? → Proceed
2. Am I being asked to produce something in my "CANNOT do" column? → REFUSE and report:
   "⛔ This task is outside my scope. Correct agent: {agent-name}"
3. Am I being asked to modify another agent's output? → Only if explicitly instructed by SM for feedback loop
```

## Cross-Agent Collaboration Rules

| Scenario | Correct Flow | Wrong Flow |
|----------|-------------|------------|
| BRD needs update after SA feedback | SM → invoke ba-agent | SM writes BRD directly |
| Code review needed | SM → invoke dev-agent (standards) + qa-agent (spec) | SM reviews code itself |
| Tests need writing | SM → invoke dev-agent | SM writes test code |
| TDD needs diagrams | SM → invoke sa-agent | SM generates draw.io XML |
| UG needs BA review | SM → invoke ba-agent with review prompt | SM reviews UG itself |
| Deploy guide needed | SM → invoke devops-agent | SM writes DPG |



---



# Dynamic Tool Execution Pattern

## Problem

The MCP server exposes tools from child servers (atlassian, markdown-exporter, etc.) via orchestration. These nested tools are NOT directly callable — they return "Unknown tool" if called directly. Additionally, MCP tools may not be available in the IDE session — the agent MUST bootstrap the connection via HTTP.

## Step 0: Bootstrap MCP Connection (MANDATORY — Every Session Start)

**Trigger:** At session start, OR when any MCP tool call fails with "tool not found" / "not connected".

**Goal:** Establish connection to MCP server and load available tools list via HTTP JSON-RPC.

### 0a. Detect OS and Read MCP URL

Read MCP server URL from `opencode.json` → `mcpServers.code-intelligence.url`
Default: `http://127.0.0.1:9181/mcp`

### 0b. Initialize MCP Session

**Windows (PowerShell):**
```powershell
$body = '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"SDLC-agent","version":"1.0"}},"id":1}'
$response = Invoke-WebRequest -Uri "http://127.0.0.1:9181/mcp" -Method POST -ContentType "application/json" -Body $body -TimeoutSec 10
$response.Content
```

**Linux/Mac (curl):**
```bash
curl -s -X POST http://127.0.0.1:9181/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"SDLC-agent","version":"1.0"}},"id":1}'
```

**Expected response:** JSON with `result.serverInfo` and `result.capabilities`. If error or timeout → server is DOWN.

### 0c. List Available Tools

**Windows (PowerShell):**
```powershell
$body = '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":2}'
$response = Invoke-WebRequest -Uri "http://127.0.0.1:9181/mcp" -Method POST -ContentType "application/json" -Body $body -TimeoutSec 10
$response.Content
```

**Linux/Mac (curl):**
```bash
curl -s -X POST http://127.0.0.1:9181/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":2}'
```

**Expected response:** `result.tools[]` — array of tool objects with `name`, `description`, `inputSchema`.

### 0d. Call a Tool

**Windows (PowerShell):**
```powershell
$body = @{
    jsonrpc = "2.0"
    method = "tools/call"
    params = @{
        name = "mem_search"
        arguments = @{ query = "test"; limit = 5 }
    }
    id = 3
} | ConvertTo-Json -Depth 5
$response = Invoke-WebRequest -Uri "http://127.0.0.1:9181/mcp" -Method POST -ContentType "application/json" -Body $body -TimeoutSec 30
$response.Content
```

**Linux/Mac (curl):**
```bash
curl -s -X POST http://127.0.0.1:9181/mcp \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"mem_search","arguments":{"query":"test","limit":5}},"id":3}'
```

### 0e. Verify Bootstrap Success

After `tools/list`:
- If response contains `result.tools` with ≥1 tool → ✅ MCP Connected
- If connection refused / timeout → ❌ Server DOWN — report to user
- If `tools/list` returns empty → ⚠️ Server running but no tools loaded

**Log bootstrap result:**
```
🔧 MCP Bootstrap:
- Server: http://127.0.0.1:9181/mcp — {CONNECTED/DOWN}
- Tools loaded: {N} tools
- Core tools: {list first 5}
```

### 0f. Session Header for Streaming (SSE/HTTP Stream)

For servers using `httpStream` transport, the initial `initialize` call may return an SSE stream. Handle with:

**Windows (PowerShell — single request/response mode):**
```powershell
$headers = @{ "Accept" = "application/json" }
$response = Invoke-WebRequest -Uri "http://127.0.0.1:9181/mcp" -Method POST -ContentType "application/json" -Headers $headers -Body $body -TimeoutSec 10
```

---

## Step 1: Discover Tools with `find_tools`

Once MCP is connected (Step 0 passed), use `find_tools` to discover nested tools from child servers:

**Via HTTP:**
```powershell
$body = @{
    jsonrpc = "2.0"
    method = "tools/call"
    params = @{
        name = "find_tools"
        arguments = @{ query = "jira issue"; threshold = 0.3; top_k = 5 }
    }
    id = 4
} | ConvertTo-Json -Depth 5
Invoke-WebRequest -Uri "http://127.0.0.1:9181/mcp" -Method POST -ContentType "application/json" -Body $body -TimeoutSec 10
```

**If MCP tools are available natively in IDE:**
```
find_tools(query: "jira issue", threshold: 0.3, top_k: 5)
```

This returns available tool names and their schemas.

## Step 2: Execute with `execute_dynamic_tool`

**Via HTTP:**
```powershell
$body = @{
    jsonrpc = "2.0"
    method = "tools/call"
    params = @{
        name = "execute_dynamic_tool"
        arguments = @{
            tool_name = "jira_get_issue"
            arguments = @{ issue_key = "KSA-123"; fields = "summary,description" }
        }
    }
    id = 5
} | ConvertTo-Json -Depth 5
Invoke-WebRequest -Uri "http://127.0.0.1:9181/mcp" -Method POST -ContentType "application/json" -Body $body -TimeoutSec 30
```

**If MCP tools are available natively:**
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
| Memory/KB | `find_tools("memory")` | mem_search, mem_ingest, mem_graph |
| Code | `find_tools("code")` | code_search, code_symbols, code_context |

## Rules

1. **ALWAYS run Step 0 (Bootstrap)** at session start or when tools are unavailable
2. **NEVER** call nested tools directly (they will return "Unknown tool")
3. **ALWAYS** use `execute_dynamic_tool` as the execution wrapper for nested tools
4. **Arguments must be objects** — `{"issue_key": "X"}` not `"{\"issue_key\": \"X\"}"`
5. If a tool fails with "Unknown tool", check if it needs `toggle_tool` first
6. Core tools (mem_search, mem_ingest, find_tools, code_search, agent_log) are directly callable — no need for execute_dynamic_tool
7. **Fallback to HTTP** — if IDE MCP integration is unavailable, use PowerShell/curl commands from Step 0

## Error Recovery

| Error | Action |
|-------|--------|
| Connection refused (Step 0) | Server DOWN → start server: `npx tsx backend/src/index.ts` |
| Schema validation error | Check argument types against inputSchema from find_tools |
| Tool not found on server | Child server may be DEAD → check `orchestration_status` |
| Timeout | Retry once with simpler arguments |
| Empty tools/list | Server running but plugins not loaded → check orchestration_status |

## Server Startup (if DOWN)

**Windows (PowerShell):**
```powershell
$env:CODE_INTEL_PORT = "9186"
$env:CODE_INTEL_WORKSPACE = "."
Start-Process -NoNewWindow npx -ArgumentList "tsx", "backend\src\index.ts" -WorkingDirectory "."
```

**Linux/Mac:**
```bash
CODE_INTEL_PORT=9186 CODE_INTEL_WORKSPACE=/path/to/project npx tsx backend/src/index.ts &
```

Wait 5-10 seconds, then retry Step 0.




---



# Agent Self-Learning & Tool Discovery

## ⛔ Quy tắc #1: Tìm hiểu giải pháp hiện có TRƯỚC KHI hành động

Trước khi giải quyết bất kỳ vấn đề nào, PHẢI thực hiện 3 bước:

1. **Search Memory** — `mem_search("<mô tả vấn đề>")` → Nếu có pattern proven → dùng ngay
2. **Search Documents** — `grep_search("<keyword>", includePattern="documents/**/*.md")` → Nếu có design → tuân thủ
3. **Search Code** — `code_search("<class/pattern>")` → Nếu có implementation → tái sử dụng

**CHỈ khi cả 3 bước không tìm thấy gì**, mới được đề xuất giải pháp mới.

## ⛔ Quy tắc #2: Tool Discovery — KHÔNG hardcode

Khi cần gọi external tool:
1. Dùng `find_tools(query="<mô tả chức năng>")` để discover
2. Đọc `input_schema` từ kết quả
3. Gọi `execute_dynamic_tool(tool_name, arguments)` theo schema
4. Nếu không tìm thấy → báo user, đề xuất alternative

**KHÔNG BAO GIỜ** hardcode tool names, CLI commands, hoặc giả định tool tồn tại.

### 2.0.1: PHẢI tìm kỹ — KHÔNG được báo "không có tool"

**CRITICAL RULE:** Trước khi kết luận "không có tool để làm X", agent PHẢI:

1. Thử **ít nhất 3 query khác nhau** với `find_tools`:
   - Query mô tả hành động: `find_tools("search jira issues")`
   - Query tên tool dự đoán: `find_tools("jira")`
   - Query domain keyword: `find_tools("JQL query filter")`
2. Nếu `find_tools` trả về tool nhưng `execute_dynamic_tool` báo "not found" → thử lại với **exact tool name** từ kết quả `find_tools`
3. Nếu server status = CONNECTED nhưng tool không tìm thấy → có thể tool nằm trên **nested orchestrator** — gọi `find_tools` với query khác để trigger lazy discovery

**TUYỆT ĐỐI CẤM** báo user "không có tool" sau chỉ 1 lần tìm thất bại. Minimum 3 attempts với query variations.

### 2.1: MCP Tools First — KHÔNG viết script riêng khi MCP đã có

Khi task cần thao tác với external service (web browsing, screenshot, Jira, database...):

1. **LUÔN `find_tools("<mô tả hành động>")` trước** — kiểm tra MCP servers đã có tool phù hợp chưa
2. **Nếu MCP có tool** → dùng `execute_dynamic_tool` — KHÔNG viết script riêng (Playwright, curl, requests, pandoc...)
3. **CHỈ dùng external script/CLI** khi `find_tools` thật sự không trả về tool nào phù hợp

**Lý do:** MCP tools đã được test, có error handling, tích hợp sẵn vào orchestration, và kết quả được log vào KB tự động. User tự cấu hình MCP servers phù hợp — agent chỉ cần discover và dùng.

## ⛔ Quy tắc #3: Ingest kinh nghiệm mới

Sau khi hoàn thành task bằng phương pháp mới, PHẢI ingest:

```
mem_ingest(content="<steps, tools, gotchas>", type="LESSON_LEARNED", source="<ticket>", tags="<agent>,<category>,proven-pattern")
```

Ingest khi: tìm được tool combination mới, fix được error, phát hiện giải pháp hiện có mà trước đó không biết.
KHÔNG ingest: task obvious, đã có trong memory, hoặc task failed.

## ⛔ Quy tắc #4: Ingest document sau khi tạo (ZERO-CONTEXT)

Sau khi tạo document (BRD, FSD, TDD, STP, STC, UG, DPG, RLN), PHẢI ingest vào memory:

```
mem_ingest_file(file_path="documents/{TICKET}/{DOC}.md", type="REQUIREMENT|ARCHITECTURE|PROCEDURE")
```

**KHÔNG BAO GIỜ** dùng pattern cũ: readFile(skipPruning=true) → kb_ingest(content=FULL_TEXT).
Tool `mem_ingest_file` chỉ tốn ~80 tokens (server tự đọc file từ disk).

## ⛔ Quy tắc #5: Đọc context qua Memory (tiết kiệm tokens)

Khi cần đọc document của ticket khác (BRD, FSD, TDD...):

```
mem_search("<nội dung cần tìm>", detail=true)   → ~1,500 tokens (relevant chunks)
mem_get(id=<entry_id>)                           → Full content 1 entry
```

**KHÔNG** dùng `readFile(documents/{TICKET}/BRD.md, skipPruning=true)` = ~6,000 tokens.
**CHỈ** dùng readFile khi mem_search trả empty (document chưa được ingest).

## ⛔ Quy tắc #6: Phân biệt tools theo prefix

| Prefix | Server | Khi nào dùng |
|--------|--------|-------------|
| `kb_*` | Orchestrator (remote) | Jira ticket data, cross-project team KB |
| `mem_*` | Code-Intelligence (local) | Local documents, decisions, error patterns |
| `code_*` | Code-Intelligence (local) | AST parsing, symbol search, code analysis |

- Jira ticket info → `kb_ingest`, `kb_search` (qua orchestrator)
- Local documents (BRD/FSD/TDD...) → `mem_ingest_file`, `mem_search`
- Code patterns → `code_search`, `code_symbols`

## ⛔ Quy tắc #7: Load Personalized Rules từ KB đầu session

Ở lượt đầu tiên của mỗi session chat, PHẢI search KB để load user's personalized rules:

```
mem_search("personalized rules preferences conventions", type="PROCEDURE", detail=true)
```

- Nếu tìm thấy entries → tuân thủ như steering rules trong suốt session
- Rules từ KB có priority thấp hơn steering files (nếu conflict → steering wins)
- Personalized rules bao gồm: coding preferences, naming conventions cá nhân, workflow habits, tool preferences

**Khi nào ingest personalized rule mới:**
- User nói "nhớ rằng...", "luôn luôn...", "đừng bao giờ...", "tôi thích..."
- Ingest với: `mem_ingest(content="<rule>", type="PROCEDURE", source="user-preference", tags="personalized,rule,preference")`

## ⛔ Quy tắc #8: Chống giải pháp manh mún

1. **KHÔNG tạo wrapper/helper mới** nếu hệ thống đã có mechanism (dù đang broken → fix root cause)
2. **KHÔNG bypass** bằng workaround khi root cause có thể fix
3. **Mọi giải pháp mới PHẢI tương thích** architecture hiện có (đọc TDD/FSD trước nếu không chắc)
4. **Memory offline ≠ bỏ qua tìm hiểu** — vẫn PHẢI search documents và code



---



# Pega Knowledge Base Search Cascade

## Purpose

Pega rules (1,349+ nodes) are stored across TWO data layers:
1. **Memory KB** — text entries with BM25 search (tags: `pega,rule`, `pega,data`, `pega,schema`, `pega,ast`)
2. **Graph DB** — nodes with label/type/tier + edges (relationships between rules)

Using only `mem_search` misses graph-structured data. This cascade ensures ALL agents find Pega knowledge.

## When to Use

- Searching for Pega rule definitions (Activity, Flow, Data Transform, Decision Table)
- Exploring class hierarchy (`Work-`, `Data-`, `Rule-Obj-`)
- Finding relationships between rules (who calls whom, inheritance)
- Investigating Flow steps, connectors, or schema/field definitions

Do NOT use for: general project KB, code intelligence, or non-Pega searches.

---

## ⚠️ Current Limitation: Graph Edges = 0

**As of now, graph nodes exist but edges (relationships) have NOT been populated yet.**
- `mem_graph(action: "neighbors")` will return empty until Edge Population (KB-02) is complete.
- Until then, use Step 4 (grep_search) as the primary relationship discovery method.
- After KB-02 completes, Step 3 will become functional.

---

## Quick Path — `get_curated_context`

For simple queries where you need a fast answer combining text + graph:

```
get_curated_context(query: "GetActionsListForWorkList activity", max_tokens: 4000)
```

This searches code symbols + KB + graph in one call. Use this FIRST for simple lookups.
Only use the full 4-step cascade when `get_curated_context` returns insufficient results.

---

## 4-Step Cascade

### Step 1: Text Search — `mem_search` (Direct)

```
mem_search(query: "ProcessClaim", limit: 10)
```

> ⛔ Do NOT use `type: "PEGA_RULE"` — this type does not exist in the schema.
> Valid types: DECISION, ERROR_PATTERN, ARCHITECTURE, API_DESIGN, REQUIREMENT, LESSON_LEARNED, PROCEDURE, CONTEXT.
> For Pega rules, omit `type` or use tags-based filtering in results.

If 0 results or insufficient → Step 2.

### Step 2: Graph Label Search — `kb_graph_query` (via execute_dynamic_tool)

```
execute_dynamic_tool(
  toolName: "kb_graph_query",
  arguments: { "query": "ProcessClaim", "type": "FUNCTION", "limit": 20 }
)
```

> ⛔ Note: argument key is `toolName` (camelCase), NOT `tool_name`.

**Node type mapping:**

| Pega Artifact | Graph Type |
|---------------|------------|
| Activity / Flow / DT / Data Transform | `ACTIVITY` or `FUNCTION` |
| Class (Work-/Data-) | `CLASS` |
| Property | `PROPERTY` |
| Schema/Field docs | `DOCUMENT` |

If nodes found → note the node `id` (string format like `pega:Rule-Obj-Activity:Assign-:GetActionsListForWorkList`).
If 0 nodes → Step 4.

### Step 3: Expand Neighbors — `mem_graph` (Direct)

> ⚠️ **CURRENTLY NON-FUNCTIONAL** — edges=0. Skip to Step 4 until KB-02 (Edge Population) is complete.

```
mem_graph(action: "neighbors", node_id: <numeric_integer_id>)
```

> Note: `mem_graph` requires a NUMERIC node_id (integer), not the string ID from kb_graph_query.

### Step 4: Fallback — File Search (PRIMARY for relationships until KB-02)

```
grep_search(query: "ProcessClaim", includePattern: "rules/**/*.pega.json")
```

**To find callers of an Activity:**
```
grep_search(query: "MyActivityName", includePattern: "rules/Rule-Obj-Flow/*.pega.json")
```

**To find what an Activity references:**
Read the Activity's own `.pega.json` file → parse `pxRuleReferences[]` array.

---

## Error Handling

| Error | Cause | Action |
|-------|-------|--------|
| `mem_search` returns 0 | Rule not in text KB | Continue to Step 2 |
| `kb_graph_query` returns 0 nodes | Rule not indexed in graph | Continue to Step 4 |
| `mem_graph` returns empty neighbors | edges=0 (KB-02 pending) | Use Step 4 (grep) |
| `execute_dynamic_tool` → "Unknown tool" | Tool not discovered | Run `find_tools("kb_graph")` first |
| `grep_search` returns 0 | Rule not in local workspace | Check if rule is OOTB (platform-only) |

---

## Tool Discovery Prerequisite

Before using nested tools, verify availability:

```
find_tools(query: "kb_graph", threshold: 0.3, top_k: 5)
```

If `kb_graph_query` NOT found → Orchestrator may need restart. Check:
```
orchestration_status()
```

---

## Common Query Examples

### Find Activity by Name

```
get_curated_context(query: "GetActionsListForWorkList activity Assign")
mem_search(query: "GetActionsListForWorkList", limit: 5)
execute_dynamic_tool(toolName: "kb_graph_query", arguments: { "query": "GetActionsListForWorkList" })
grep_search(query: "GetActionsListForWorkList", includePattern: "rules/Rule-Obj-Flow/*.pega.json")
```

### Find Class Hierarchy

```
execute_dynamic_tool(toolName: "kb_graph_query", arguments: { "query": "Work-Claim", "type": "CLASS" })
grep_search(query: "pyDerivesFrom", includePattern: "rules/Rule-Obj-Class/Work-Claim*.pega.json")
```

---

## Edge Types (functional after KB-02)

| Edge Type | Meaning | Source → Target |
|-----------|---------|-----------------|
| CALLS | Flow invokes Activity | Flow → Activity |
| USES | Rule references Property | Activity → Property |
| INHERITS | Class extends Class | Child Class → Parent Class |
| BELONGS_TO | Rule is owned by Class | Activity → Class |
| REFERENCES | Generic reference | Activity → Class/Property |

---

## Tool Reference

| Tool | Callable | Purpose |
|------|----------|---------|
| `mem_search` | Direct | Text/BM25 search across KB entries |
| `mem_graph` | Direct | Navigate graph edges (needs numeric node_id) |
| `get_curated_context` | Direct | Combined search: code + KB + graph |
| `kb_graph_query` | `execute_dynamic_tool` | Fuzzy label search on graph nodes |
| `kb_graph_add_edge` | `execute_dynamic_tool` | Add relationship between nodes |
| `code_search` | Direct | Search source code symbols |
| `grep_search` | Direct | Regex search on raw rule JSON files |
| `find_tools` | Direct | Discover nested tool names |

---

## Rules for All Agents

1. **Try `get_curated_context` first** for simple lookups
2. **ALWAYS start cascade with `mem_search`** — fastest text search
3. **NEVER stop at Step 1 if 0 results** — graph has 1,349+ nodes
4. **Use `toolName` (camelCase)** in `execute_dynamic_tool`
5. **Step 3 is non-functional until KB-02** — use grep_search for relationships
6. **Verify tools exist** with `find_tools("kb_graph")` before first use
7. **Ingest new knowledge** when discovered:
   ```
   mem_ingest(content: "...", type: "CONTEXT", tags: "pega,rule,{class}")
   ```



---

# SDLC Guardrails (agent-enforced)

Các kiểm tra sau được AGENT (LLM) thực hiện — không qua code cứng — nên dễ chỉnh sửa và portable trên mọi máy. Agent áp dụng chúng theo ngữ cảnh, không bắt buộc máy móc.

## 1. Drawio XML validation
Trước khi export hoặc commit một file `.drawio`, tự kiểm tra XML hợp lệ:
- Phải có thẻ gốc `<mxGraphModel>` và `</mxGraphModel>` tương ứng.
- Mọi thẻ phải cân bằng (mỗi `<tag>` có `</tag>`, hoặc tự đóng `<tag/>`).
- Nếu không hợp lệ → sửa trước khi export; không commit drawio lỗi.

## 2. Code-index freshness
Trước các phase SA (Design) và DEV (Implementation), đảm bảo code-intel index đang mới. Nếu codebase thay đổi nhiều, chạy lại indexer. Dùng code-intel dynamic tools (`find_tools` → `execute_dynamic_tool`) để query/refresh.

## 3. KB-first
Trước khi viết hoặc cập nhật bất kỳ document nào (BRD/FSD/TDD/STP/STC/UG/DPG/RLN), tìm kiếm knowledge base trước (`mem_search`) để tái dùng context và tránh trùng lặp.

## 4. Version-sync check
Khi bump version / tạo git tag, đảm bảo tag, package version, và README changelog nhất quán. Không tag nếu mismatch.

## 5. Memory sync
Sau khi sửa source code, ingest/cập nhật memory liên quan (`mem_ingest` / `mem_ingest_file`) để các agent khác cùng hưởng lợi.

