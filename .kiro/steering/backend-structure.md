---
inclusion: fileMatch
fileMatchPattern: "shared/**,server/**"
---

# Backend Code Structure Standard

## Kiến trúc tổng quan

Dự án sử dụng Kotlin Multiplatform với 2 module backend:
- `shared/` — Business logic dùng chung (interfaces, models, implementations KMP-compatible)
- `server/` — Ktor REST API server (JVM-only, routes, middleware, DI)

## Quy tắc phân chia code giữa shared và server

### shared module (`shared/src/commonMain/`)
Chứa code KMP-compatible, KHÔNG phụ thuộc JVM-specific libraries:
- **Interfaces** — `AuthService.kt`, `RBACEngine.kt`, `KBRepository.kt`, `AIOrchestrator.kt`, `GraphEngine.kt`
- **Data models** — `@Serializable` data classes, enums, sealed classes
- **Business logic implementations** — Nếu KHÔNG cần JVM libs (ví dụ: `RBACEngineImpl`, `AIOrchestratorImpl`, `ForceDirectedGraphEngine`)
- **Koin modules** — `aiModule`, `jiraModule`, `domainModule`

### shared module JVM (`shared/src/jvmMain/`)
Chứa implementations cần JVM-specific libraries:
- **SQLDelight implementations** — `KBRepositoryImpl.kt` (cần JDBC driver)
- **Bất kỳ code nào dùng** `java.*`, `javax.*`, hoặc JVM-only dependencies

### server module (`server/src/jvmMain/`)
Chứa code Ktor server, KHÔNG chứa business logic:
- **Routes** — REST API endpoint handlers
- **Middleware** — JWT auth, RBAC interceptors
- **DI** — Koin server module tổng hợp
- **Config** — ServerConfig đọc env vars
- **JVM-only implementations** — Nếu cần Ktor/server-specific libs (ví dụ: `AuthServiceImpl` cần `com.auth0:java-jwt`)

## Package naming convention

```
com.assistant.{domain}/
├── {Domain}Interface.kt      # Interface definition
├── {Domain}Impl.kt           # Implementation
├── {Domain}Models.kt          # Data classes, enums (nếu nhiều models)
└── {Domain}Module.kt          # Koin module (nếu cần)
```

Ví dụ:
```
com.assistant.auth/
├── AuthService.kt             # Interface
├── AuthModels.kt              # AuthenticatedUser, AuthResult, UserRole
com.assistant.server.auth/
├── AuthServiceImpl.kt         # JVM implementation (JWT)
```

## Quy tắc cho mỗi domain package trong shared

Mỗi domain package PHẢI tách biệt:
- **Interface** riêng 1 file — tên `{Feature}.kt` hoặc `{Feature}Interface.kt`
- **Models** riêng 1 file — tên `{Feature}Models.kt` chứa tất cả data classes, enums, sealed classes liên quan
- **Implementation** riêng 1 file — tên `{Feature}Impl.kt`
- **Koin module** riêng 1 file (nếu cần) — tên `{Feature}Module.kt`

KHÔNG gộp interface + models + implementation vào cùng 1 file.

## Quy tắc cho server routes

Mỗi route group PHẢI nằm trong 1 file riêng tại `server/.../routes/`:
- File name: `{Resource}Routes.kt` (ví dụ: `AuthRoutes.kt`, `ProjectRoutes.kt`)
- Extension function: `fun Routing.{resource}Routes()` (ví dụ: `fun Routing.authRoutes()`)
- Request/Response DTOs: Khai báo trong cùng file route hoặc file `{Resource}Dtos.kt` riêng nếu phức tạp
- Tất cả routes PHẢI được mount trong `Routing.kt` qua `configureRouting()`

## Quy tắc cho server middleware

- Mỗi middleware 1 file tại `server/.../middleware/`
- Sử dụng Ktor route interceptor pattern (`Route.intercept`)
- KHÔNG đặt business logic trong middleware — chỉ gọi shared module services

## Dependency Injection (Koin)

- `shared/` modules: `aiModule`, `jiraModule`, `domainModule` — đăng ký shared dependencies
- `server/` module: `serverModule(config)` — tổng hợp tất cả shared modules + đăng ký server-specific dependencies
- Inject trong routes bằng `by inject<T>()` từ `org.koin.ktor.ext.inject`
- KHÔNG tạo instances trực tiếp trong routes — luôn inject qua Koin

## Data class conventions

- Tất cả data classes truyền qua API PHẢI có `@Serializable` annotation
- Sử dụng `JsonConfig.instance` (shared config) cho serialization/deserialization
- KHÔNG dùng `Json { }` inline — luôn dùng shared instance
- Enum values: `UPPER_SNAKE_CASE`
- Sealed classes cho polymorphic types (ví dụ: `AuthResult`, `AIResult`)

## Error handling

- Routes: Throw `IllegalArgumentException` cho validation errors (StatusPages bắt → 400)
- KHÔNG catch-all trong routes — để StatusPages xử lý
- Business logic: Return sealed class results (Success/Failure) thay vì throw exceptions
- Logging: Dùng `call.application.log` trong routes, `println`/logger trong shared

## Testing conventions

- Property tests: `server/src/jvmTest/` hoặc `shared/src/jvmTest/`
- Test file name: `{Feature}PropertyTest.kt` hoặc `{Feature}Test.kt`
- Sử dụng Kotest property testing với tối thiểu 100 iterations
- Fake/Spy implementations cho dependencies (không dùng mocking framework)
- In-memory SQLite (`JdbcSqliteDriver.IN_MEMORY`) cho DB tests


---

## ⛔ QUY TẮC UX CHO BACKEND API

### Mọi API response PHẢI cung cấp đủ thông tin cho frontend hiển thị UX tốt

### KHÔNG BAO GIỜ trả về empty result mà không giải thích

```kotlin
// ❌ CẤM — Trả về empty list không giải thích
if (issues.isEmpty()) return emptyList()

// ✅ ĐÚNG — Trả về kèm message hoặc log entry giải thích
if (issues.isEmpty()) {
    logRepository.addEntry("No tickets found in project $projectKey")
    return ScanResult(tickets = emptyList(), message = "No tickets found. Verify project has issues in Jira.")
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

```kotlin
// ❌ CẤM — Catch exception và trả empty, frontend không biết lỗi
} catch (e: Exception) {
    emptyList()
}

// ✅ ĐÚNG — Log lỗi và trả response có thông tin
} catch (e: Exception) {
    application.log.error("[Feature] Operation failed: ${e.message}", e)
    call.respond(HttpStatusCode.InternalServerError, ErrorResponse(
        error = "Operation failed",
        details = e.message
    ))
}
```

### Validation errors PHẢI cụ thể

```kotlin
// ❌ CẤM — Message chung chung
throw IllegalArgumentException("Invalid input")

// ✅ ĐÚNG — Message cụ thể cho từng field
throw IllegalArgumentException("JIRA_HOST must be a valid URL starting with https://")
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
