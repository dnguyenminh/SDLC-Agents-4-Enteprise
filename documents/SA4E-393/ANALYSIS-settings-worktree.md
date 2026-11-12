# ANALYSIS — settings.json worktree (SA4E-393 mục 8)

Chỉ phân tích, không sửa code. Nguồn: TDD.md Addendum 4 Open Issue (a) dòng 1049; `extension/src/utils/runtime-settings.ts`; `extension/src/remote-backend-client.ts`; `.kiro/steering/tool-usage-dynamic.md` (+ bản sao `.opencode/rules/sdlc`, `.code-intel/skills`).

## (a) writeRuntimeSettings chọn workspace thế nào
- `writeRuntimeSettings(workspaceFolder, {port})` ghi `<workspaceFolder>/.code-intel/settings.json` (mcpUrl, port, pid, workspace, startedAt). Gọi 1 lần trong `RemoteBackendClient.startWrapper()` sau `wrapperServer.start(port)`; `clearRuntimeSettings` xoá file ở `disconnect()`.
- `workspaceFolder` là tham số constructor của `RemoteBackendClient` (activation-captured). Base64Proxy lại dùng `vscode.workspace.workspaceFolders?.[0]` (live). Design-gate `resolveWorkspace` cũng dùng `workspaceFolders[0]`.
- Hệ quả: mỗi instance IDE ghi vào đúng 1 folder (folder đầu); multi-root chỉ folder[0], các folder còn lại không có file. Port mặc định setting `mcp.serverPort` = 9181; port thực lấy từ `listeningPort`.
- **Đã xác nhận (đợt 3)**: không có `new RemoteBackendClient(` ở production vì class được re-export dưới alias `McpServerManager` (`extension/src/mcp-server-manager.ts:11`). Chỗ khởi tạo DUY NHẤT ở production: `extension/src/extension/registration/workspace-init.ts:52` — `new McpServerManager(workspaceRoot, outputChannel, runtime.authManager, backendUrl, context.secrets)`. Tham số đầu `workspaceRoot` đến từ `initializeWorkspace(context, workspaceRoot)` (`workspace-init.ts:36`), được gọi tại `extension/src/extension.ts:89` với `const workspaceRoot = getWorkspaceRoot()` (`extension.ts:87`, import từ `activation-helpers.ts:6-9`) = `vscode.workspace.workspaceFolders[0].uri.fsPath` (folder đầu, chụp 1 lần lúc activate; không có folder → không khởi tạo). Constructor lưu thành `this.workspaceFolder` (`remote-backend-client.ts:~53`), dùng cho `writeRuntimeSettings` (`:171`) và `clearRuntimeSettings` (`:121`). Các lần xuất hiện còn lại của `new McpServerManager(` chỉ nằm trong `extension/src/test/*.test.ts`.
- Test cho runtime-settings: đợt 3 thêm characterization test `extension/src/__tests__/runtime-settings.test.ts` (baseline hành vi hiện tại, không đổi code).

## (b) Agent trong worktree resolve mcpUrl, vấn đề cụ thể
- Steering đọc `.code-intel/settings.json` theo đường dẫn tương đối (theo cwd agent), fallback `.kiro/settings/mcp.json`.
- Bằng chứng thực tế trong chính worktree SA4E-393-2:
  - `.code-intel/settings.json`: port 9181, pid 43808, workspace = worktree SA4E-393-2.
  - `.kiro/settings/mcp.json`: url 9181; nhưng e2e D6 (TEST-REPORT-addendum4-e2e-d6.md) dùng 9183 và ghi rõ workspace root thật của instance 9183 = `c:\projects\kiro\SDLC-Agents-4-Enterprise` (không phải worktree).
- Vấn đề: (1) agent ở worktree có thể kết nối instance của workspace khác (root) → `file_path` tương đối và `WORKSPACE_ROOT` bị resolve theo root khác (đã gây "Source path does not exist" ở e2e). (2) File không kiểm chứng: không check pid còn sống, không so `workspace` với cwd; crash không xoá file → stale. (3) Có 2 nguồn (settings.json vs mcp.json) có thể lệch cổng. (4) `clearRuntimeSettings` xoá file không kiểm tra chủ sở hữu (pid), instance này có thể xoá file của instance kia nếu cùng folder.
- Trả lời: CÓ thể đọc settings của workspace/instance khác (qua mcp.json lệch, hoặc cwd khác), và instance trả lời có thể thuộc workspace khác với file đã đọc.

## (c) Đề xuất single source of truth
- SSOT = `<workspace>/.code-intel/settings.json` do instance sở hữu workspace đó ghi; bỏ mcp.json khỏi vai trò resolve (chỉ fallback có cảnh báo).
- Quy tắc xác thực khi đọc: `settings.workspace` == cwd (chuẩn hoá đường dẫn) và pid còn sống; sau `initialize` đối chiếu workspace root server báo (nếu có) rồi mới ghi evidence. Không khớp → báo user, không tự dùng.
- Phía code (làm sau, SA4E-438): ghi/xoá có kiểm tra pid sở hữu; ghi file cho mọi workspace folder (multi-root) hoặc chọn rõ; thêm test cho runtime-settings; lộ workspaceRoot qua `initialize`/health để đối chiếu.

## (d) Blast radius
- Code: `runtime-settings.ts`, `remote-backend-client.ts` (startWrapper/disconnect), có thể `WrapperServer` (lộ workspace). Dùng cho MỌI ticket/mọi agent session, không riêng design-gate.
- Docs/rule: `tool-usage-dynamic.md` ở 3 chỗ (`.kiro/steering`, `.opencode/rules/sdlc`, và skills/steering liên quan `mcp-fallback-http`, `mcp-tools-reference`) — thay đổi hành vi bootstrap của toàn bộ agent.
- Test: chưa có test runtime-settings; cần mới (đọc/ghi/clear, pid, multi-root); `remote-backend-health.test.ts` bị ảnh hưởng nếu đổi constructor/startWrapper.
- Không thuộc design-gate (SA4E-393); không có AC nào của SA4E-393 phụ thuộc vào nó.

## Kết luận
- Thay đổi CODE hoặc sửa steering dùng chung: **STOP** — ảnh hưởng nhiều ticket/kiến trúc bootstrap, thiếu test nền, chưa chứng minh được nơi khởi tạo; chuyển SA4E-438 (đúng với hướng TDD Open Issue (a), Medium).
- Trong scope SA4E-393: **IMPLEMENT-SAFE chỉ ở mức tài liệu** — giữ Open Issue (a), bổ sung bước kiểm tra bắt buộc trước khi ghi gate evidence: đối chiếu `settings.workspace`/pid với cwd, ghi port + workspace root của instance vào evidence (ug-evidence §2). Không đụng code/steering chung.
