---
name: backend-structure
description: Backend Code Structure Standard
---



# Backend Code Structure Standard

## Kiến trúc tổng quan

Dự án sử dụng TypeScript + Hono với cấu trúc backend thống nhất:
- `backend/src/` — TypeScript source, chạy trên Node.js
- `backend/src/server/` — Hono HTTP + MCP Streamable HTTP server (routes, middleware, mcpServer)
- `backend/src/modules/` — Business logic tách theo domain (code-intel, kb-graph, memory, orchestration, pega, analytics, web)
- `backend/src/di/` — Dependency Injection container
- `backend/src/shared/` — Types, utilities dùng chung

## Quy tắc phân chia code giữa server và modules

### server module (`backend/src/server/`)
Chứa code HTTP/MCP layer, KHÔNG chứa business logic:
- **Routes** — Hono route handlers (`HttpServer.ts`, `routes/`)
- **Middleware** — JWT auth, RBAC interceptors (`middleware/`)
- **MCP** — `mcpServer.ts`, `toolUsageTracker.ts`
- **Config** — Config đọc env vars (từ `backend/src/config/`)

### modules (`backend/src/modules/{domain}/`)
Chứa business logic theo từng domain, KHÔNG import từ các module khác trực tiếp (dùng qua DI):
- **Interfaces** — `AuthService`, `RBACEngine`, `KBRepository`, `AIOrchestrator`, `GraphEngine`
- **Data models** — zod schemas, interfaces, enums, types
- **Implementations** — Logic thuần TypeScript, không phụ thuộc framework cụ thể
- **Services** — Business logic, validation, formatting, state management

### shared (`backend/src/shared/`)
- **Types** — DTOs, interfaces, enums dùng chung
- **Utils** — Pure utility functions (không side effects)

## Package naming convention

```
backend/src/shared/{domain}/
├── {Domain}Types.ts        # Interfaces, types, enums
├── {Domain}Schema.ts       # zod schemas (nếu nhiều schemas)
├── {Domain}Service.ts      # Business logic implementation
└── index.ts                # Re-exports
```

Ví dụ:
```
backend/src/modules/kb-graph/
├── kbGraphTypes.ts         # Interfaces, types
├── kbGraphSchema.ts        # zod schemas
├── kbGraphService.ts       # Implementation
└── index.ts                # Re-exports
```

## Quy tắc cho mỗi domain module

Mỗi domain package PHẢI tách biệt:
- **Types/Schemas** riêng 1 file — `{Domain}Types.ts`, `{Domain}Schema.ts`
- **Service** riêng 1 file — `{Domain}Service.ts`
- **Controller/Handler** riêng (nếu cần) — `{Domain}Handler.ts`

KHÔNG gộp types + schemas + service vào cùng 1 file. Mỗi file ≤ 200 dòng.

## Quy tắc cho server routes

Mỗi route group PHẢI nằm trong 1 file riêng tại `backend/src/server/routes/`:
- File name: `{resource}-routes.ts` (ví dụ: `auth-routes.ts`, `project-routes.ts`)
- Export function: `export function authRoutes(app: Hono)` (ví dụ `authRoutes`)
- Request/Response DTOs: Khai báo trong cùng file route hoặc file `{resource}-dto.ts` riêng nếu phức tạp
- Tất cả routes PHẢI được mount trong `HttpServer.ts` qua `configureRoutes(app)`

## Quy tắc cho server middleware

- Mỗi middleware 1 file tại `backend/src/server/middleware/`
- Sử dụng Hono middleware pattern (`app.use('/api/*', handler)`)
- KHÔNG đặt business logic trong middleware — chỉ gọi services từ modules

## Dependency Injection

- Dùng DI container tại `backend/src/di/`
- Modules đăng ký dependencies: services, repositories, clients
- Inject vào routes/handlers qua constructor injection hoặc container lookup
- KHÔNG tạo instances trực tiếp trong routes — luôn inject qua DI container

## Data conventions

- Tất cả dữ liệu truyền qua API/MCP PHẢI validate bằng zod schemas
- Dùng `safeParse` cho dữ liệu từ external source
- Dùng shared schema instance — KHÔNG tạo schema inline trong function
- Enum values: `UPPER_SNAKE_CASE`
- Dùng TypeScript discriminated unions cho polymorphic types (ví dụ: `AuthResult`, `AIResult`)

## Error handling

- Routes: Throw validation errors (Hono error handler bắt → 400/4xx)
- KHÔNG catch-all trong routes — để error handler middleware xử lý
- Business logic: Trả result objects (Success/Failure) thay vì throw exceptions khi cần xử lý fallback
- Logging: Dùng Pino logger (`backend/src/config/`) — logger.error cho failures, logger.info cho business events

## Testing conventions

- Unit/Integration tests: `backend/src/**/__tests__/` dùng Vitest
- Test file name: `{Feature}.test.ts`
- Dùng property-style test với `fast-check` khi cần (có trong devDependencies)
- Fake/Spy implementations cho dependencies (không cần mocking framework phức tạp)
- In-memory SQLite (`better-sqlite3` `:memory:`) hoặc DB mocks cho DB tests
- E2E API: `vitest run --config vitest.e2e.config.ts`; E2E UI: `npx playwright test`


---

## ⛔ QUY TẮC UX CHO BACKEND API

### Mọi API response PHẢI cung cấp đủ thông tin cho frontend hiển thị UX tốt

### KHÔNG BAO GIỜ trả về empty result mà không giải thích

```typescript
// ❌ CẤM — Trả về empty list không giải thích
if (issues.length === 0) return [];

// ✅ ĐÚNG — Trả về kèm message hoặc log entry giải thích
if (issues.length === 0) {
  logRepository.addEntry("No tickets found in project $projectKey");
  return { tickets: [], message: "No tickets found. Verify project has issues in Jira." };
}
```

### Error responses PHẢI có cấu trúc nhất quán

Mọi error response PHẢI dùng format:
```json
{
    "error": "Mô tả lỗi ngắn gọn",
    "details": "Chi tiết kỹ thuật (optional)",
    "action": "Hành động gợi ý cho user (optional)"
}
```

### API KHÔNG ĐƯỢC fail silently

```typescript
// ❌ CẤM — Catch exception và trả empty, frontend không biết lỗi
} catch (e) {
  return [];
}

// ✅ ĐÚNG — Log lỗi và trả response có thông tin
} catch (e) {
  logger.error(`[Feature] Operation failed: ${e.message}`, e);
  return c.json({
    error: "Operation failed",
    details: e.message
  }, 500);
}
```

### Validation errors PHẢI cụ thể

```typescript
// ❌ CẤM — Message chung chung
throw new ValidationError("Invalid input");

// ✅ ĐÚNG — Message cụ thể cho từng field
throw new ValidationError("JIRA_HOST must be a valid URL starting with https://");
```

### Long operations PHẢI có status tracking

Mọi operation chạy lâu (scan, analysis, sync) PHẢI:
1. Trả về trạng thái ngay lập tức (202 Accepted hoặc status object)
2. Cung cấp endpoint polling để frontend theo dõi tiến trình
3. Log mỗi bước vào database để frontend hiển thị chi tiết
4. Khi hoàn tất với kết quả bất thường (0 items, partial failure) → ghi log entry giải thích nguyên nhân

### Jira API integration

- KHÔNG dùng `/rest/api/3/search` (đã deprecated, trả 410 Gone)
- Dùng `/rest/api/3/search/jql` cho search queries
- Dùng `/rest/api/3/issue/{key}` cho single issue
- Dùng `/rest/api/3/project` cho project list
- Mọi Jira API call PHẢI log kết quả (success count hoặc error message)
- Khi Jira API trả lỗi → trả response có message cụ thể cho frontend, KHÔNG trả empty silently

