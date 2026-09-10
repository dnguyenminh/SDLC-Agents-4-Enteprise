# Implementation Request — Start MCP Child Servers từ DB Config (Single Source of Truth)

> **Mục tiêu:** Backend server PHẢI khởi động (connect) các child MCP server dựa trên
> config lưu trong **bảng DB `mcp_servers`**, thay vì file `.code-intel/orchestration.json`.
> Đây là fix **root cause**, KHÔNG workaround.

---

## 1. Bối cảnh / Vấn đề (Root Cause)

Hiện tại tồn tại **HAI hệ thống config MCP song song, không kết nối với nhau**:

| # | Hệ thống | Nguồn dữ liệu | File | Ai dùng |
|---|----------|--------------|------|---------|
| A | File-based | `.code-intel/orchestration.json` | `McpConfigService.ts`, `admin/mcp.ts`, `admin/mcp-crud.ts` | `McpClientManager.initializeAll()` — **đây là nơi thực sự connect child servers** + Admin Web UI |
| B | DB-based | Bảng `mcp_servers` | `server/routes/mcp/servers.ts` (SA4E-215), mount tại `/api/sa4e-215/mcp/servers` | Chỉ CRUD, **KHÔNG có ai đọc để connect** |

**Hệ quả:** Khi user lưu config MCP server vào DB (hệ thống B), `McpClientManager.initializeAll()`
chỉ đọc `orchestration.json` (hệ thống A) → child server không bao giờ được start → UI hiển thị
`disconnected`, `Tools = 0`.

**Yêu cầu:** Hợp nhất về **single source of truth = DB (`mcp_servers`)**. `orchestration.json`
chỉ còn là fallback tùy chọn (đọc khi DB rỗng), hoặc bỏ hẳn tùy quyết định thiết kế (xem Mục 6).

---

## 2. Kiến trúc hiện tại (đã verify)

### Thứ tự khởi động — `backend/src/index.ts`
```
1. loadConfig()
2. initAdapters()                     // DB adapter sẵn sàng ở đây
3. ensureSa4e215Tables()              // tạo bảng mcp_servers, decisions (idempotent)
4. registry.initializeAll()           // → OrchestrationModule.initialize()
                                      //   → McpClientManager.initializeAll()  ← ĐIỂM SỬA
```
➡️ **Quan trọng:** DB adapter (`getDbAdapter()`) ĐÃ sẵn sàng và bảng `mcp_servers` ĐÃ tồn tại
**trước khi** `McpClientManager.initializeAll()` chạy. Nên đọc DB tại đây là an toàn.

### Lifecycle manager — `backend/src/modules/orchestration/McpClientManager.ts`
- `initializeAll()` (dòng ~48-79): đọc `orchestration.json`, loop `connectServer(name, cfg)`.
- `connectServer(name, config)`: tạo transport → `client.connect()` (timeout 10s) → `registerServerTools()`.
- Dùng `ServerConfig` type từ `McpConfigService.ts`.

### Transport — `backend/src/modules/orchestration/health/TransportFactory.ts`
- `type/transportType === 'sse'` → SSE (cần `url`)
- `type/transportType === 'httpStream'` → StreamableHTTP (cần `url`)
- có `command` → Stdio (spawn process với `command`, `args`, `env`)

### Bảng `mcp_servers` — `backend/src/database/schema-registry/sa4e-215.ts`
| Cột | Kiểu | Ghi chú |
|-----|------|---------|
| `server_id` | text PK | `mcp-xxxxxxxx` |
| `project_id` | text NOT NULL | FK logic tới `project_registry` |
| `name` | text NOT NULL | tên server (unique theo project) |
| `transport_type` | text NOT NULL | `stdio` / `sse` / `httpStream` |
| `url` | text | cho sse/httpStream |
| `command` | text | cho stdio |
| `args` | text | **JSON array string** |
| `env` | text | **JSON object string** |
| `disabled` | integer | 0/1 |
| `auto_approve` | text | JSON array string |
| `tools` | text | JSON array string |
| `created_at` / `updated_at` | timestamp | |

- `getDbAdapter()` (async) có: `allAsync`, `getAsync`, `runAsync`, `execAsync`, `isConnected()`.
- Row → object mapping mẫu đã có ở `rowToServer()` trong `server/routes/mcp/servers.ts`.

### DB adapter là **multi-engine** (SQLite mặc định + PostgreSQL) → dùng `getDbAdapter()` async API, KHÔNG import `better-sqlite3` trực tiếp.

---

## 3. Yêu cầu chức năng

### FR-1 — Repository đọc config từ DB
Tạo `McpServerConfigRepository` (file mới) đọc từ bảng `mcp_servers`:
- `listEnabledServers(projectId?): Promise<ServerConfigWithName[]>`
  - `SELECT * FROM mcp_servers WHERE disabled = 0` (thêm `AND project_id = ?` nếu có filter).
  - Map mỗi row → `ServerConfig` (parse `args`/`env`/`autoApprove`/`tools` từ JSON string).
  - Suy ra `type`/`transportType` từ `transport_type`.
- `getServer(serverId | name, projectId?): Promise<ServerConfigWithName | null>`
- Đặt tại `backend/src/modules/orchestration/McpServerConfigRepository.ts`.
- Dùng `getDbAdapter()` từ `../../admin/admin-db.js`.
- **Xử lý lỗi:** nếu `!adapter.isConnected()` hoặc query fail → log warn + trả `[]` (fail-safe, không crash startup). Ghi log rõ nguyên nhân (theo backend-structure UX rule — không fail silently).

### FR-2 — `initializeAll()` load từ DB
Sửa `McpClientManager.initializeAll()`:
- Thay việc đọc `orchestration.json` bằng gọi `McpServerConfigRepository.listEnabledServers()`.
- Với mỗi server config từ DB → `connectServer(name, config)` (giữ nguyên logic connect + error handling + register-for-retry hiện có).
- Log: `{ count, source: 'db' }` `'Connecting child MCP servers from DB'`.
- **Fallback (tùy chọn, xem Mục 6):** nếu DB rỗng VÀ `orchestration.json` tồn tại → có thể đọc file như cũ, log `source: 'file-fallback'`. Mặc định KHÔNG đọc file nếu DB có dữ liệu.
- **Dependency injection:** repository nên được inject vào `McpClientManager` qua constructor (theo SOLID/DIP), KHÔNG khởi tạo `getDbAdapter()` trực tiếp trong class nếu tránh được. Nếu inject phá vỡ quá nhiều call-site, chấp nhận lazy-import `getDbAdapter` bên trong method — nêu rõ lựa chọn trong PR.

### FR-3 — Admin endpoints đọc từ DB (single source of truth)
`backend/src/server/routes/admin/mcp.ts` và `admin/mcp-crud.ts` hiện đọc/ghi `orchestration.json`.
Cập nhật để đọc **danh sách + trạng thái** từ DB:
- `GET /api/admin/mcp/servers`: liệt kê từ bảng `mcp_servers` (thay vì file), giữ nguyên phần tính `status` (dùng `clientManager.isServerConnected()`) và append server `code-intel` nội bộ.
- `POST /api/admin/mcp/servers/:id/restart`: đọc config server từ DB → `disconnectServer` → `connectServer`.
- Add/Update/Delete (`mcp-crud.ts`): ghi vào DB `mcp_servers` (có thể tái dùng logic của `server/routes/mcp/servers.ts`), KHÔNG ghi file.
- **Lưu ý `project_id`:** Admin UI hiện không truyền `projectId`. Cần quyết định default project (ví dụ lấy project mặc định từ `project_registry`, hoặc dùng project context từ JWT). Nêu rõ cách resolve trong PR. Nếu chỉ có 1 project → dùng project đó.

### FR-4 — Loại bỏ mock logs gây hiểu nhầm
Trong `GET /api/admin/mcp/servers/:id/logs`, hiện sinh **mock logs giả** ("Server started successfully"...) khi chưa có log thật. Bỏ mock logs — trả mảng rỗng hoặc log thật để tránh che giấu lỗi connect.

---

## 4. Yêu cầu phi chức năng

- **No workaround:** không try-both-sources bừa bãi; DB là nguồn chính, file chỉ fallback có kiểm soát.
- **Multi-engine:** chỉ dùng `getDbAdapter()` async API (chạy được cả SQLite + PostgreSQL).
- **Fail-safe startup:** lỗi đọc DB không được làm crash toàn bộ server; log rõ và tiếp tục.
- **Code standards:** file ≤ 200 dòng, hàm ≤ 20 dòng, tách model/types, TSDoc cho public methods, không nuốt exception (log + surface).
- **Không phá test hiện có:** `server/routes/mcp/servers.ts` (SA4E-215) và test của nó phải vẫn xanh.

---

## 5. Tiêu chí nghiệm thu (Acceptance Criteria)

1. Thêm 1 row vào `mcp_servers` (ví dụ `markdown-exporter-local`, stdio, `disabled=0`) → **restart server** → child server đó connect thành công, UI hiển thị `running` + số tools > 0.
2. `orchestration.json` KHÔNG tồn tại (hoặc rỗng) → server vẫn start được các child server từ DB.
3. Set `disabled=1` trong DB → server đó KHÔNG connect, UI hiển thị `stopped`.
4. `GET /api/admin/mcp/servers` trả danh sách khớp với các row trong `mcp_servers` (+ `code-intel` nội bộ).
5. Nút **Restart** trên Admin UI đọc config từ DB và reconnect được.
6. `logs` endpoint không còn trả mock logs giả.
7. `npm run build` (trong `backend/`) pass; các test SA4E-215 hiện có vẫn pass.

---

## 6. Quyết định cần chốt trước khi code (hỏi user nếu cần)

1. **`orchestration.json` fallback:** giữ làm fallback khi DB rỗng, hay bỏ hẳn? (Đề xuất: giữ fallback đọc-only để không phá môi trường cũ, log rõ `source`.)
2. **`project_id` scoping cho Admin UI:** resolve project mặc định thế nào khi UI không gửi `projectId`? (Đề xuất: dùng project mặc định trong `project_registry`; nếu nhiều project cần bổ sung selector.)
3. **Hợp nhất 2 nhóm endpoint** (`/api/admin/mcp/*` file-based cũ vs `/api/sa4e-215/mcp/servers` DB-based): có gộp về một không? (Đề xuất: cho `admin/mcp*` dùng chung repository DB, giữ URL cũ để không phá UI.)

---

## 7. Danh sách file liên quan (ranked)

| # | File | Vai trò | Hành động |
|---|------|---------|-----------|
| 1 | `backend/src/modules/orchestration/McpClientManager.ts` | Lifecycle connect child servers | Sửa `initializeAll()` đọc từ DB |
| 2 | `backend/src/modules/orchestration/McpServerConfigRepository.ts` | (mới) đọc `mcp_servers` | Tạo mới |
| 3 | `backend/src/server/routes/admin/mcp.ts` | List/restart/logs endpoints | Đọc từ DB, bỏ mock logs |
| 4 | `backend/src/server/routes/admin/mcp-crud.ts` | Add/update/delete | Ghi vào DB |
| 5 | `backend/src/server/routes/mcp/servers.ts` | CRUD DB có sẵn (SA4E-215) | Tham chiếu `rowToServer()` để tái dùng mapping |
| 6 | `backend/src/database/schema-registry/sa4e-215.ts` | Schema `mcp_servers` | Chỉ đọc (không đổi) |
| 7 | `backend/src/modules/orchestration/McpConfigService.ts` | `ServerConfig` type + file ops | Tái dùng type; cân nhắc deprecate file ops |
| 8 | `backend/src/modules/orchestration/health/TransportFactory.ts` | Tạo transport | Chỉ đọc (không đổi) |
| 9 | `backend/src/index.ts` | Thứ tự init | Chỉ đọc (xác nhận DB ready trước modules) |

---

## 8. Gợi ý mapping row → ServerConfig (tham khảo `rowToServer`)

```ts
// row (snake_case, JSON string columns) → ServerConfig (camelCase, parsed)
{
  name: row.name,
  type: row.transport_type,
  transportType: row.transport_type,
  url: row.url ?? undefined,
  command: row.command ?? undefined,
  args: row.args ? JSON.parse(row.args) : [],
  env: row.env ? JSON.parse(row.env) : {},
  disabled: !!row.disabled,
  autoApprove: row.auto_approve ? JSON.parse(row.auto_approve) : [],
}
```
> **Cẩn thận:** parse JSON phải `try/catch` — dữ liệu DB có thể lỗi format; log warn và bỏ qua server đó thay vì crash.

---

## 9. Lưu ý bẫy đã phát hiện (từ dữ liệu thực)

- Trong `orchestration.json` cũ, `args` của `markdown-exporter-local` bị **bọc dấu ngoặc kép thừa**
  (`"\"--directory\""`) khiến `uv` nhận sai argument → spawn fail. Khi migrate/nhập vào DB, args PHẢI là
  mảng sạch: `["--directory", "C:/projects/python/markdown-exporter-mcp-local", "run", "markdown-exporter-mcp-local"]`.
- `markitdown` (command trần) không có trong PATH của backend → dùng `uvx markitdown-mcp` hoặc đường dẫn đầy đủ.
- Với stdio, "start" = spawn process → command PHẢI nằm trong PATH mà tiến trình backend kế thừa.
