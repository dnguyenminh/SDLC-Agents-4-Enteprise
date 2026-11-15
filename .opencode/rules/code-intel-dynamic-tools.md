# MCP server code-intelligence — Dynamic Tools

## 0. Tên server do user đặt — KHÔNG hardcode

MCP server code-intelligence được cấu hình trong `opencode.json`:

- OpenCode V1: `mcp.<server-name>`
- OpenCode V2: `mcp.servers.<server-name>`

`<server-name>` do user chọn. Workspace hiện tại có thể dùng `code-intel`, nhưng agent **KHÔNG được giả định** tên này.

OpenCode expose tool theo tên server:

- **Direct tool mode:** `<server-name>_<tool>` — ví dụ `<server-name>_find_tools`
- **Code Mode (mặc định):** `tools.<server-name>.<tool>` — ví dụ `tools.<server-name>.find_tools`

Trước khi gọi, xác định tên thực tế:

1. Nhìn danh sách tool trong session hiện tại — tìm các capability `find_tools`, `execute_dynamic_tool`, `mem_search`, ...
2. Hoặc đọc `opencode.json` / `.opencode/opencode.json` để tìm server key.
3. Dùng đúng tool ID hiển thị; không tự bịa prefix.

Các tên trong tài liệu này là **tên capability** (suffix), không phải tool ID đầy đủ.

## 1. Tìm kiếm tool — capability `find_tools`

Tìm kiếm theo ngữ nghĩa (semantic) các tool có sẵn phù hợp với ý định:

```
# Direct mode
<server-name>_find_tools(query: "semantic code search across symbols")
<server-name>_find_tools(query: "export drawio diagram to png")
<server-name>_find_tools(query: "ingest knowledge into memory")
<server-name>_find_tools(query: "curated context for a question")

# Code Mode
tools.<server-name>.find_tools(query: "semantic code search across symbols")
```

Kết quả trả về danh sách `toolName` + mô tả. Chọn tool gần nhất với nhu cầu.

## 2. Thực thi tool — capability `execute_dynamic_tool`

Sau khi biết `toolName`, gọi để thực thi:

```
# Direct mode
<server-name>_execute_dynamic_tool(
  toolName: "<exact-name-returned-by-find_tools>",
  arguments: { "file_path": "docs/flow.drawio", "output_path": "docs/flow.png" }
)

# Code Mode
tools.<server-name>.execute_dynamic_tool(
  toolName: "<exact-name-returned-by-find_tools>",
  arguments: { "file_path": "docs/flow.drawio", "output_path": "docs/flow.png" }
)
```

- `toolName`: tên chính xác lấy từ `find_tools`; không tự thêm prefix.
- `arguments`: object JSON chứa tham số của tool đó (xem mô tả trả về ở bước 1).

## Quy trình chuẩn (workflow)

1. Nhận nhu cầu chuyên biệt (vẽ diagram, semantic search, memory ingest/search, doc export...) mà tool tĩnh (`bash`, `read`, `grep`, `glob`, `edit`, `write`) không đáp ứng.
2. Xác định tool ID thực tế của server (direct hoặc Code Mode).
3. Gọi capability `find_tools` để khám phá tên tool chính xác.
4. Gọi capability `execute_dynamic_tool` với `toolName` + `arguments`.
5. Nếu sai tên / thiếu tham số → đọc thông báo lỗi, gọi lại `find_tools` để xác nhận rồi thử lại.

## Các capability phổ biến (tham khảo)

| Capability | Dùng cho |
|------|----------|
| `code_search` | Tìm kiếm full-text trên symbols |
| `get_curated_context` | Truy vấn ngữ nghĩa toàn bộ codebase (code + memory + graph) |
| `mem_search` | Tìm kiếm trong workspace memory (BM25 + vector) |
| `mem_ingest` / `mem_ingest_file` | Lưu knowledge vào memory |
| `drawio_auto_layout` | Tự động sắp xếp layout drawio |
| `drawio_export_png` | Export drawio sang PNG |
| `embed_image` | Nhúng ảnh base64 vào markdown |
| `stream_write_file` | Ghi file lớn trực tiếp xuống disk |
| `agent_log` | Ghi log tiến trình agent |
| `find_tools` | Khám phá danh sách dynamic tool |
| `execute_dynamic_tool` | Thực thi bất kỳ dynamic tool nào đã phát hiện |

## Lưu ý quan trọng

- ⛔ KHÔNG hardcode tên server, prefix, port hoặc URL MCP trong prompt/agent.
- ⛔ LUÔN xác định đúng tool ID từ session hoặc config trước khi gọi.
- ⛔ LUÔN gọi `find_tools` trước khi đoán tên nested tool — đừng tự bịa tên.
- ⛔ Nếu MCP server không kết nối (lỗi connection) → báo lỗi rõ ràng cho user, KHÔNG giả lập kết quả.
- ✅ `arguments` của `execute_dynamic_tool` PHẢI là object, KHÔNG phải JSON string.
- ✅ Khi đã biết tên tool, ưu tiên `execute_dynamic_tool` thay vì gọi tool tĩnh tương đương (vd: vẽ diagram qua drawio tool thay vì tự viết XML).
