---
name: file-writing
description: Quy tắc viết file lớn cho tất cả agents. Áp dụng khi tạo documents (BRD, FSD, TDD, STP, STC, UG) hoặc bất kỳ file nào > 200 dòng.
inclusion: auto
---

# File Writing Standards

## 1. Viết documents lớn — Chunking bắt buộc

**LUÔN dùng `stream_write_file`** (MCP tool). Chia thành chunks ≤ 4000 chars:
- Chunk đầu: `mode="write"` (tạo file mới)
- Chunks sau: `mode="append"`

Fallback: Nếu `stream_write_file` fail 1 lần → chuyển `fsWrite` + `fsAppend` ngay. Không retry cùng error.

## 2. Verify sau mỗi lần ghi

Kiểm tra response: `bytes_written == total_size - file_size_before`. Nếu sai → giảm chunk size, retry.

## 3. Logging bắt buộc

Mỗi chunk: `agent_log(START)` → write → `agent_log(DONE)`. Không viết quá 100 dòng giữa 2 lần log.

## 4. DOCX Export

**Quy tắc:**
1. Search KB trước: `kb_search("export markdown docx")`
2. Nếu KB có pattern → làm theo
3. Nếu không → `find_tools("export docx")`, thử nghiệm, ingest kết quả vào KB
4. LUÔN embed images trước khi export (export tool không có filesystem access)
5. KHÔNG dùng CLI tools (pandoc, etc.) — dùng MCP tools
6. Tên file: `{DOC}-v{MAJOR}-{TICKET}.docx`
7. Graceful degradation: tool không available → log WARNING, skip
