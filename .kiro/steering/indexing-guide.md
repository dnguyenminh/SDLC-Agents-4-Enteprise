---
inclusion: manual
description: Hướng dẫn index source code và tài liệu vào Knowledge Base. Activate khi user cần setup indexing.
---

# Indexing Guide — Source Code & Documents

## Tổng quan

Hệ thống Code Intelligence cung cấp 2 loại indexing:
1. **Code Indexing** — tự động index source code (classes, functions, interfaces) vào SQLite FTS5
2. **Document Indexing** — thủ công index tài liệu (BRD, FSD, TDD, etc.) vào Memory Knowledge Base

## 1. Code Indexing (Tự động)

MCP server tự động index khi khởi động. Kiểm tra trạng thái:

```
Tool: code_index_status
```

### Re-index thủ công

```
Tool: code_index_status
Arguments: { "reindex": true }
```

### Sync code symbols vào Memory Graph

Sau khi code đã indexed, sync vào memory để agents có thể tìm cross-references:

```
Tool: mem_sync_code
Arguments: {} (sync all classes + interfaces)
```

Hoặc filter theo kind:

```
Tool: mem_sync_code
Arguments: { "kind": "class", "limit": 500 }
```

## 2. Document Indexing (Thủ công)

### Index một tài liệu

```
Tool: mem_ingest_file
Arguments: {
  "file_path": "documents/KSA-14/BRD.md",
  "type": "REQUIREMENT",
  "format": "markdown"
}
```

### Các type phù hợp cho từng loại tài liệu

| Document | Type |
|----------|------|
| BRD | `REQUIREMENT` |
| FSD | `REQUIREMENT` |
| TDD | `ARCHITECTURE` |
| STP/STC | `PROCEDURE` |
| DPG/RLN | `PROCEDURE` |
| Decision records | `DECISION` |
| Error patterns | `ERROR_PATTERN` |
| Lessons learned | `LESSON_LEARNED` |

### Index nhiều tài liệu cùng lúc

Gọi `mem_ingest_file` cho từng file. Ví dụ index toàn bộ ticket KSA-14:

```
mem_ingest_file → documents/KSA-14/BRD.md (type: REQUIREMENT)
mem_ingest_file → documents/KSA-14/FSD.md (type: REQUIREMENT)
mem_ingest_file → documents/KSA-14/TDD.md (type: ARCHITECTURE)
```

## 3. Kiểm tra trạng thái Memory

```
Tool: mem_status
```

Trả về: entry counts, tier breakdown, vector count.

## 4. Tìm kiếm trong Knowledge Base

```
Tool: mem_search
Arguments: { "query": "authentication flow", "detail": true }
```

Filter theo role:

```
Tool: mem_search
Arguments: { "query": "API design", "role": "SA" }
```

## 5. Best Practices

- **Khi nào re-index code**: Sau khi thêm/xóa nhiều files, hoặc sau merge branch lớn
- **Khi nào index documents**: Ngay sau khi tạo/cập nhật BRD, FSD, TDD
- **Khi nào sync code**: Sau re-index, hoặc khi agents cần cross-reference code ↔ documents
- **Consolidate memory**: Chạy `mem_consolidate` định kỳ để promote/demote entries theo access patterns

## 6. Troubleshooting

| Vấn đề | Giải pháp |
|--------|-----------|
| `code_index_status` trả về 0 files | Kiểm tra `--workspace` arg trong mcp.json |
| `mem_search` không tìm thấy document | Chạy `mem_ingest_file` cho document đó |
| Semantic search không hoạt động | Kiểm tra Ollama đang chạy + model đã pull |
| Memory quá nhiều entries cũ | Chạy `mem_consolidate` |
