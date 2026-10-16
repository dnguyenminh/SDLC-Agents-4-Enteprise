# SA4E-364 — Findings: SDLC CHAT không nhận MCP tools từ extension

> Điều tra ngày 2026-10-15. Mọi tham chiếu `file:line` lấy từ workspace `C:\projects\kiro\SDLC-Agents-4-Enterprise` (branch `SA4E-363`, commit `cdccd97`).

## 1. Vấn đề

Cửa sổ chat **SDLC CHAT** (webview của extension) hiển thị badge `SDLC PIPELINE connected`, nhưng LLM chạy trong chat **không có bất kỳ MCP tool nào từ extension** trong tool schema:

- Không gọi được `mem_search`, `mem_ingest`, `code_search`, `jira_get_issue` (KB/Jira/code-intelligence)
- Không có `execute_dynamic_tool`
- Picker "Select MCP Tool" (`ChatContextPicker`) chỉ chèn **text mô tả** tool vào prompt — LLM thấy tên tool nhưng không invoke được
- Badge "connected" chỉ phản ánh trạng thái `McpServerManager` (server MCP đang chạy) — không liên quan tới tool pool của agent

## 2. Root cause (verified bằng code)

### 2.1 Tool pool của chat agent được lắp từ 2 đường — đều KHÔNG có MCP tools

**Legacy path** — `extension/src/pi-workflow/pi-workflow-adapter.ts:470-489`:

```ts
const builtinTools = await createWorkspaceTools(this.workspaceRoot);   // builtin coding tools
const ext = await getPiExtensionAgentTools(this.workspaceRoot, ...);   // npm pi extensions
const byName = new Map<string, unknown>();
for (const t of [...(builtinTools as unknown[]), ...extTools]) { ... } // merge 2 nguồn
```

Nguồn `getPiExtensionAgentTools()` chỉ tải các **npm pi extension packages** (`pi-extension-loader.ts:13-20`):
`billion-context-pi`, `pi-web-access`, `@juicesharp/rpiv-todo`, `@juicesharp/rpiv-ask-user-question`, `pi-subagents`, `@cortexkit/aft-pi` — **không có MCP bridge**.

**Session path** — `extension/src/pi-workflow/pi-agent-session-host.ts:310-425`:

- Extensions load qua `DefaultResourceLoader.additionalExtensionPaths = getPiExtensionEntries(workspaceRoot)` (cùng danh sách npm packages trên)
- `customTools` cho `createAgentSession` chỉ có 2 tool: `createWorkspaceInfoTool` + `createReadMethodTool` (dòng 420-423)
- `tools: allowlist` lọc theo tên; `extNames` (dòng 321-322) chỉ lấy tên tool của npm extensions

### 2.2 Bridge extension (SA4E-316) là dead code

`extension/src/pi-agent/extensions/mcp-bridge-extension.ts` — viết đúng mục đích: register 5 tool bridge (`jira_get_issue`, `mem_search`, `mem_ingest`, `code_search`, + `execute_dynamic_tool` opt-in) qua `McpBridge`, kèm allowlist + approval + audit (SEC-324-03).

**Nhưng:** grep toàn bộ `extension/src` → `mcpBridgeExtension` chỉ được import bởi `__tests__/mcp-bridge-extension.test.ts`. **Zero caller trong production.**

### 2.3 McpBridge tồn tại nhưng chỉ dùng cho 2 việc khác

`pi-workflow-adapter.ts:78` — `this.mcpBridge = new McpBridge(opts.mcpManager)`:

| Sử dụng | Vị trí | Vai trò |
|---|---|---|
| Skeleton runtime | `pi-agent-session-host.ts:312` → `skeleton/skeleton-wiring.ts:35-42` | Enrich system prompt (SA4E-360 §6.4), KHÔNG register tool |
| `listAvailableTools()` | `pi-workflow-adapter.ts:157-164` → `chat-panel-provider.ts:70, 203` | **Chỉ đếm token** hiển thị context-usage meter |

### 2.4 Picker MCP cũng không register tool

`extension/src/chat-panel/ChatContextPicker.ts:148-174` — `pickMcp()` fetch `tools/list` từ từng server trong `.kiro/settings/mcp.json` rồi trả về `ContextItem` dạng text `"MCP Tool: name (server: ...)"` — chỉ là context text, không callable.

## 3. Thiết kế fix đề xuất

Nguyên tắc: **tái sử dụng mechanism sẵn có, không tạo wrapper mới** (theo no-workaround-rule).

1. **Export hàm thuần** từ `mcp-bridge-extension.ts`:
   ```ts
   buildMcpBridgeAgentTools(bridge: McpBridge, options?: BridgeOptions): AgentTool[]
   ```
   - Trả về `AgentTool[]` của `pi-agent-core` (shape khớp `getPiExtensionAgentTools().tools`)
   - Tái dùng đúng `TOOLS`, `validateParams`, `TOOL_ALLOWLIST`, `DYNAMIC_TOOL_NAME`, `bridgeRequiresApproval`, audit log — **KHÔNG duplicate allowlist**
   - `execute` handler gọi `bridge.callTool(name, params)`, bắt `McpServerNotRunningError` → trả error text (fail-safe, không crash turn)
2. **Wire legacy path** — `pi-workflow-adapter.ts` sau dòng 477:
   ```ts
   const bridgeTools = buildMcpBridgeAgentTools(this.mcpBridge, { serverManager: opts.mcpManager });
   // merge vào byName cùng builtinTools + extTools
   ```
3. **Wire session path** — `pi-agent-session-host.ts`:
   - Thêm bridge tools vào `customTools` (dòng 420-423) qua `toSessionToolDefinition`
   - Thêm tên bridge tools vào `mcpTools` của `buildSessionToolLoadout` (dòng 329-336) → tự chịu role filter + schema-token cap (SA4E-355)

### Ràng buộc bảo mật (giữ nguyên hiện trạng)

- `execute_dynamic_tool` mặc định **deny** — chỉ xuất hiện khi opt-in `allowDynamicChaining=true` (SEC-324-03)
- Approval hook + audit log cho tool nhạy cảm (`mem_ingest`, dynamic chaining)
- Fail-closed: `McpBridge` require `IServerManager` thật, không fallback hardcoded URL (SEC-332-09)

## 4. Acceptance criteria

| # | Tiêu chí |
|---|---|
| AC-1 | Session SDLC CHAT (cả 2 path) expose ≥4 tool bridge `jira_get_issue, mem_search, mem_ingest, code_search` trong tool schema gửi LLM |
| AC-2 | Từ chat, LLM gọi được `mem_search` và kết quả hiển thị qua `MCP_TOOL_RESULT` trên webview |
| AC-3 | `execute_dynamic_tool` KHÔNG có trong tool schema trừ khi opt-in |
| AC-4 | MCP server stopped → chat vẫn hoạt động; tool call trả error text rõ ràng |
| AC-5 | Bridge tools chịu role filter + schema-token cap ở session path |
| AC-6 | Unit test cho wiring cả 2 path; suite hiện có không regression |

## 5. Verification steps

1. `npm test` trong `extension/` — toàn bộ pass (đặc biệt `mcp-bridge-extension.test.ts`, `tool-loadout-*.test.ts`, `pi-agent-session-host.test.ts`)
2. Build + load extension vào Kiro/VSCode, mở SDLC CHAT, yêu cầu *"search KB: personalized rules"* → LLM gọi `mem_search` thành công, kết quả về webview
3. Debug log `[PiWorkflowAdapter]` / `[PiSessionHost]` hiển thị bridge tools trong allowlist/tool count
4. Stop MCP server → chat vẫn trả lời; tool call trả error text thay vì treo/crash

## 6. Related tickets

| Ticket | Quan hệ |
|---|---|
| SA4E-316 | Bridge extension gốc (chưa từng được wire) |
| SA4E-333 / SA4E-334 | Pi extension runtime — 2 đường tool assembly |
| SA4E-355 | Role-aware loadout + schema-token cap |
| SA4E-360 | Skeleton runtime + Pi SDK gateway |

## 7. Ghi chú riêng (khác ticket)

`extension/src/services/WrapperServer.ts:19` — `MAX_BODY_SIZE = 1024 * 1024` (1MB) **chưa fix**: body >1MB qua HTTP gateway bị `req.destroy()` → client thấy "connection forcibly closed" thay vì JSON-RPC 413. Đã điều tra riêng ngày 2026-10-15 (thử nghiệm: 1MB ✅, 1.5MB ✅, 2MB ❌; backend bodyLimit 100MB + MCP SDK transport 4MB không phải thủ phạm). Đề xuất fix riêng: nâng lên 64MB + trả 413 JSON-RPC sạch qua `sendError()`. Không gộp vào SA4E-364 để giữ scope sạch.
