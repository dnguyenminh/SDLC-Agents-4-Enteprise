# Business Requirements Document (BRD)
## SA4E-375: PROJECT_NOT_REGISTERED khi index vào KB

### 1. Mục tiêu kinh doanh
Đảm bảo các luồng index dữ liệu vào Knowledge Base (KB) không bị lỗi `PROJECT_NOT_REGISTERED`. Hiện tại khi extension thực hiện index qua MCP tool calls hoặc IndexerHttpClient, server trả về 404 với code `PROJECT_NOT_REGISTERED` nếu project chưa được đăng ký trong `project_registry`. Điều này gây gián đoạn workflow index và làm giảm trải nghiệm người dùng.

### 2. Vấn đề hiện tại
- `ensureProjectRegistered` guard trên admin routes kiểm tra `project_registry` và trả về lỗi nếu không tồn tại.
- Auto-register chỉ được triển khai cho `IndexerHttpClient` (SA4E-215) với flag `_autoRegisterAttempted` chỉ cho phép thử một lần.
- `projectId` được derive bằng random UUID component (`crypto.randomUUID().slice(0,8)`) dẫn tới ID thay đổi mỗi lần nếu không có git remote, gây không ổn định.
- MCP tool calls và các client khác không có auto-register, dẫn tới lỗi khi index vào KB.
- Server không tự động upsert project khi nhận request.

### 3. Yêu cầu kinh doanh
- Cho phép index vào KB thành công ngay cả khi project chưa được đăng ký trước đó.
- Đảm bảo projectId ổn định, có thể derive lặp lại cùng một giá trị cho cùng workspace.
- Hạn chế can thiệp thủ công từ người dùng.
- Không làm phá vỡ multi-tenant isolation.

### 4. Phạm vi
- Backend: project registry, `ensureProjectRegistered` guard.
- Extension: IndexerHttpClientChain, MCP tool calls, project-id derivation.
- Không thay đổi API công khai hiện tại, chỉ bổ sung hành vi auto-register/upsert.

### 5. Tiêu chí chấp nhận
- Index document qua IndexerHttpClient không còn lỗi PROJECT_NOT_REGISTERED.
- MCP tool calls index vào KB tự động đăng ký project nếu chưa tồn tại.
- projectId được persist trong `.code-intel/project.json` và không thay đổi giữa các lần chạy.
- Không tạo duplicate project khi auto-register nhiều lần.
