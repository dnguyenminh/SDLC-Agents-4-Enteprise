# SA4E-28 — Refactor Backend Module (Technical Debt)

> **Lưu ý:** Jira MCP tool không available. File này là plan tạm để thay thế Jira ticket.
> Khi có Jira connection, tạo ticket với thông tin bên dưới.

---

## Thông tin Ticket

| Field | Value |
|-------|-------|
| **Project** | SA4E (SDLC Agents 4 Enterprise) |
| **Issue Type** | Task (Technical Debt) |
| **Summary** | [Backend] Refactor backend module — tách admin.ts, sửa file >200 dòng, xóa dead code |
| **Priority** | Highest |
| **Labels** | `technical-debt`, `backend`, `refactor`, `code-quality` |
| **Phase** | Maintenance / Technical Debt |
| **Component** | Backend |

---

## Description

Backend module cần được refactor để tuân thủ code standards (AGENTS.md). Các issues phát hiện qua code review:

### Critical Issues

1. **Tách `admin.ts` (2590 dòng) thành các route modules riêng**
   - File hiện tại chứa tất cả admin routes trong 1 file (~2590 dòng)
   - Yêu cầu: phân tách thành các module: `routes/admin/users.ts`, `routes/admin/analytics.ts`, `routes/admin/config.ts`, v.v.
   - Tuân thủ single-responsibility principle

2. **Refactor 37 files vượt quá 200 dòng**
   - AGENTS.md quy định file size limit: max 200 lines
   - 37 files backend vượt quá giới hạn này
   - Cần chia nhỏ thành các modules/file theo domain

3. **Sửa swallowed exceptions (`catch {}` rỗng)**
   - Nhiều catch block rỗng (`catch {}`) không xử lý exception
   - Vi phạm AGENTS.md: "NEVER swallow exceptions — every catch block MUST have clear handling"
   - Cần thêm error logging (pino) và xử lý thích hợp

4. **Xóa dead code**
   - `MemoryEngineFull.ts` — file rỗng không có nội dung
   - `logger.ts` — không được import/sử dụng ở bất kỳ đâu
   - Cần xóa các file/unused exports

### High Issues

5. **Xóa route trùng lặp trong `admin.ts`**
   - Route `/admin/tools` được định nghĩa 2 lần với handler khác nhau
   - Gây lỗi runtime (route conflict)
   - Cần consolidate thành 1 route duy nhất

6. **Sửa `ToolValidator.ts` để dùng Zod**
   - Hiện tại dùng manual validation thủ công
   - Zod đã có sẵn trong codebase (dependencies)
   - Cần chuyển sang Zod schemas cho type safety và validation tự động

7. **Consolidate 2 config modules**
   - `src/engine/config.ts` và `src/config/BackendConfig.ts` đều quản lý config
   - Dẫn đến duplicate và inconsistent config values
   - Cần merge thành 1 module config duy nhất

8. **Chuyển `console.error` sang pino logger**
   - Nhiều file dùng `console.error` thay vì logger
   - Cần chuẩn hóa logging qua pino để hỗ trợ log levels, structured logging

### Medium Issues

9. **Giảm `as any` type casts**
   - Type safety bị giảm do dùng `as any` tràn lan
   - Cần thay bằng proper type definitions hoặc type guards

---

## Acceptance Criteria

- [ ] `admin.ts` được tách thành ít nhất 3 route modules
- [ ] Tất cả 37 files >200 dòng được refactor xuống ≤200 dòng
- [ ] Không còn `catch {}` rỗng trong codebase backend
- [ ] `MemoryEngineFull.ts` và unused `logger.ts` được xóa
- [ ] Route trùng lặp trong admin.ts được fixes
- [ ] `ToolValidator.ts` dùng Zod schemas
- [ ] Config modules được consolidate thành 1
- [ ] `console.error` được thay bằng pino logger
- [ ] Giảm thiểu `as any` casts

---

## Technical Approach

1. **Phase 1**: Tách admin.ts → route modules (ưu tiên critical)
2. **Phase 2**: Split files >200 dòng (theo domain)
3. **Phase 3**: Fix swallowed exceptions + add pino logging
4. **Phase 4**: Xóa dead code + consolidate config
5. **Phase 5**: ToolValidator → Zod migration
6. **Phase 6**: Giảm `as any` type casts

---

## Estimated Effort

| Issue | Effort | Dependencies |
|-------|--------|-------------|
| Tách admin.ts | 5 days | None |
| Split 37 files | 8 days | admin.ts split |
| Fix swallowed exceptions | 2 days | None |
| Xóa dead code | 1 day | None |
| Route trùng lặp | 0.5 day | admin.ts split |
| ToolValidator → Zod | 2 days | None |
| Consolidate config | 2 days | None |
| console.error → pino | 1 day | None |
| Giảm `as any` | 3 days | None |

**Total: ~24.5 days**

---

## Được tạo bởi
SM Agent — 2026-07-11
