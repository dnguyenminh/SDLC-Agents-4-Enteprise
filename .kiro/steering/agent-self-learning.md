---
name: agent-self-learning
description: Quy tắc self-learning cho tất cả agents. Agents phải search KB trước khi làm task, và ingest kinh nghiệm mới vào KB sau khi hoàn thành.
inclusion: auto
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
