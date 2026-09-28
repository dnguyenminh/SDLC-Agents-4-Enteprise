---
name: steering-backend-structure
description: Backend structure rules for shared/** and server/** TypeScript files.
---

# Backend Code Structure Standard

## Kiến trúc tổng quan

Dự án sử dụng TypeScript + Hono với 2 module backend:
- `shared/` — Business logic dùng chung (interfaces, models, implementations dùng chung)
- `server/` — Hono REST API server (routes, middleware, DI)

## Quy tắc phân chia code giữa shared và server

### shared module (`shared/src/`)
Chứa code dùng chung, KHÔNG phụ thuộc server-specific libraries:
- **Interfaces** — `AuthService.ts`, `RBACEngine.ts`, `KBRepository.ts`, `AIOrchestrator.ts`, `GraphEngine.ts`
- **Data models** — zod schemas, types, enums
- **Business logic implementations** — Nếu KHÔNG cần server libs (ví dụ: `RBACEngineImpl`, `AIOrchestratorImpl`, `ForceDirectedGraphEngine`)
- **DI container modules** — `aiModule`, `jiraModule`, `domainModule`

### shared module database layer (`shared/src/db/`)
Chứa implementations cần database libraries:
- **SQLite/PostgreSQL implementations** — `KBRepositoryImpl.ts` (dùng SQLite driver / pg)
- **Bất kỳ code nào dùng** `fs`, `child_process`, hoặc Node-specific dependencies

### server module (`server/src/`)
Chứa code Hono server, KHÔNG chứa business logic:
- **Routes** — REST API endpoint handlers
- **Middleware** — JWT auth, RBAC interceptors
- **DI** — server DI container tổng hợp
- **Config** — ServerConfig đọc env vars
- **Server-specific implementations** — Nếu cần Hono/server-specific libs (ví dụ: `AuthServiceImpl` cần `jose`/`jsonwebtoken`)

## Package naming convention

```
src/{domain}/
├── {Domain}Interface.ts      # Interface definition
├── {Domain}Impl.ts           # Implementation
├── {Domain}Models.ts          # zod schemas, types, enums (nếu nhiều models)
└── {Domain}Module.ts          # DI module (nếu cần)
```

Ví dụ:
```
src/auth/
├── AuthService.ts             # Interface
├── AuthModels.ts              # AuthenticatedUser, AuthResult, UserRole
src/server/auth/
├── AuthServiceImpl.ts         # Server implementation (JWT)
```

## Quy tắc cho mỗi domain package trong shared

Mỗi domain package PHẢI tách biệt:
- **Interface** riêng 1 file — tên `{Feature}.ts` hoặc `{Feature}Interface.ts`
- **Models** riêng 1 file — tên `{Feature}Models.ts` chứa tất cả zod schemas, types, enums liên quan
- **Implementation** riêng 1 file — tên `{Feature}Impl.ts`
- **DI module** riêng 1 file (nếu cần) — tên `{Feature}Module.ts`

KHÔNG gộp interface + models + implementation vào cùng 1 file.

## Quy tắc cho server routes

Mỗi route group PHẢI nằm trong 1 file riêng tại `server/.../routes/`:
- File name: `{Resource}Routes.ts` (ví dụ: `AuthRoutes.ts`, `ProjectRoutes.ts`)
- Exported function: `export function {resource}Routes(): Hono` (ví dụ: `authRoutes()`, `projectRoutes()`)
- Request/Response DTOs: Khai báo trong cùng file route hoặc file `{Resource}Dtos.ts` riêng nếu phức tạp
- Tất cả routes PHẢI được mount trong `app.ts` qua `configureRoutes()`

## Quy tắc cho server middleware

- Mỗi middleware 1 file tại `server/.../middleware/`
- Sử dụng Hono middleware pattern (`app.use(...)`, `createMiddleware` từ `hono/factory`)
- KHÔNG đặt business logic trong middleware — chỉ gọi shared module services

## Dependency Injection (DI container)

- `shared/` modules: `aiModule`, `jiraModule`, `domainModule` — đăng ký shared dependencies
- `server/` module: `serverModule(config)` — tổng hợp tất cả shared modules + đăng ký server-specific dependencies
- Inject trong routes bằng constructor injection hoặc container `get<T>()`
- KHÔNG tạo instances trực tiếp trong routes — luôn inject qua DI container

## Data model conventions

- Tất cả models truyền qua API PHẢI có zod schema
- Sử dụng `schema.parse()` / `schema.safeParse()` (zod) cho validation
- KHÔNG dùng `as Type` cast — luôn validate bằng zod
- Enum values: `UPPER_SNAKE_CASE`
- Discriminated unions / union types cho polymorphic types (ví dụ: `AuthResult`, `AIResult`)

## Error handling

- Routes: Throw `AppError` cho validation errors (Hono error handler bắt → 400)
- KHÔNG catch-all trong routes — để Hono `app.onError` xử lý
- Business logic: Trả về discriminated union results (Success/Failure) thay vì throw exceptions
- Logging: Dùng pino logger (injected qua context) trong routes, logger trong shared

## Testing conventions

- Unit/integration tests: `shared/src/__tests__/` hoặc `server/src/__tests__/`
- Test file name: `{Feature}.test.ts` hoặc `{Feature}.spec.ts`
- Sử dụng Vitest với `test.each` / property-based helpers
- Fake/Spy implementations cho dependencies (dùng `vi.fn()` / `vi.spyOn`)
- In-memory SQLite (`:memory:`) cho DB tests


---

## ⛔ QUY TẮC UX CHO BACKEND API

### Mọi API response PHẢI cung cấp đủ thông tin cho frontend hiển thị UX tốt

### KHÔNG BAO GIỜ trả về empty result mà không giải thích

```typescript
// ❌ CẤM — Trả về empty array không giải thích
if (issues.length === 0) return [];

// ✅ ĐÚNG — Trả về kèm message hoặc log entry giải thích
if (issues.length === 0) {
    logRepository.addEntry(`No tickets found in project ${projectKey}`);
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
    logger.error(`[Feature] Operation failed: ${(e as Error).message}`, e);
    return c.json({
        error: "Operation failed",
        details: (e as Error).message
    }, 500);
}
```

### Validation errors PHẢI cụ thể

```typescript
// ❌ CẤM — Message chung chung
throw new AppError("Invalid input");

// ✅ ĐÚNG — Message cụ thể cho từng field
throw new AppError("JIRA_HOST must be a valid URL starting with https://");
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
