# User Guide — SA4E-300 Error Detail Improvement

## Overview
Cải thiện việc hiển thị chi tiết lỗi trong luồng ingest source code từ VS Code Extension sang Knowledge Base. Developer sẽ thấy `error`, `details`, `action` trong Output channel "Kiro Indexer" thay vì thông báo generic.

## Cài đặt
Không cần cài đặt thêm. Mọi thay đổi là backward compatible.

## Cấu hình
- Output channel: `Kiro Indexer`
- Backend endpoints: `/api/index/source`, `/api/index/ingest-docs`, `/api/index/full`
- Headers yêu cầu: `Authorization: Bearer <token>`, `X-Project-Id`

## Sử dụng
1. Trigger ingest từ Extension command palette → "Index Workspace"
2. Khi lỗi xảy ra, mở Output panel → chọn "Kiro Indexer"
3. Thông báo sẽ hiển thị:
   - Error: mô tả ngắn gọn
   - Details: mã lỗi kỹ thuật (ENOSPC, EACCES...)
   - Action: gợi ý khắc phục

## API Reference
### POST /api/index/source
Response success:
```json
{
  "written": 12,
  "skipped": 0,
  "rejected": ["file.ts"],
  "rejectedReasons": [
    {"file":"file.ts","code":"EACCES","message":"Permission denied"}
  ],
  "deps": [],
  "projectId": "proj-123"
}
```
Error response:
```json
{
  "error": "Disk full",
  "details": "ENOSPC: no space left on device",
  "action": "Free up disk space",
  "status": 500
}
```

### POST /api/index/ingest-docs
Response success:
```json
{
  "ingested": 45,
  "errors": 2,
  "total": 47,
  "failedFiles": [
    {"file":"rel/path.md","reason":"ENOSPC disk full"}
  ]
}
```

## Troubleshooting
| Vấn đề | Nguyên nhân | Cách xử lý |
|--------|-------------|------------|
| Disk full ENOSPC | Ổ đĩa Temp đầy | Xóa file tạm, mở rộng dung lượng |
| Permission denied EACCES | Không có quyền ghi | Kiểm tra quyền thư mục Temp |
| Unauthorized 401 | Token hết hạn | Re-authenticate |
| Server busy 429 | Quá tải concurrent | Đợi 2s và thử lại |

## FAQ
**Q: Lỗi có hiển thị stack trace không?**
A: Không. `details` chỉ chứa message và code, không expose stack trace.

**Q: Có thay đổi contract cũ không?**
A: Không. `details`/`action` là optional, `parseIngestResponse` giữ nguyên.
