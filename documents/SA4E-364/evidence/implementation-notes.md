# SA4E-364 — Implementation Notes (DEV agent)

Date: 2026-10-16 · Branch: `SA4E-364` · Scope: wire-only fix per TDD v1.0 §5 (12 items)

## 1. Environment

- `npm ci` từ `extension/` → npm workspaces hoist deps lên root `node_modules`
  (`@earendil-works/pi-agent-core@0.99.1`, `fast-check@4.9.0`, `pi-coding-agent@0.99.1` — OK).
  Lock file extension stale (0.80.10) nhưng root lock đã đúng → install thành công.
  Đã revert metadata-only change ở root `package-lock.json` (npm housekeeping, không phải dep change).
- Bổ sung `npm install` ở root lần 2 để cài `@sqlite.org/sqlite-wasm` (backend dep bị thiếu) —
  sửa suite fail `read-method-chain.integration.test.ts` (env issue, không phải code issue).

## 2. Files changed (production — đúng 3 file theo TDD §5)

| File | Anchor thực tế | Thay đổi |
|---|---|---|
| `extension/src/pi-agent/extensions/mcp-bridge-extension.ts` | sau import `McpBridge` (dòng 10); sau `BridgeAuditEntry`; sau `mcpBridgeExtension`, trước export test | +1 import `AgentTool` (type-only); +10 `BridgeToolOptions` = `Pick<BridgeOptions,...>` + JSDoc SEC-324-03; +42 `buildMcpBridgeAgentTools` (20 dòng body — đúng pseudocode §3.4, reuse `createExecuteHandler`/`TOOLS`/`DYNAMIC_TOOL_NAME`, dedupe `seen`, dynamic chỉ emit khi `=== true`) |
| `extension/src/pi-workflow/pi-workflow-adapter.ts` | import sau dòng 22 (`governLegacyTurn`); merge sau vòng last-wins `byName`, trước `const tools =` | +2 import; +11 vòng merge skip-if-exists (guard `byName.has(name)` + `debugLog('[PiWorkflowAdapter] bridge tool skipped (exists): …')` — BR-06/OI-06) |
| `extension/src/pi-workflow/pi-agent-session-host.ts` | import sau dòng 32; `bridgeTools` sau try/catch extNames, trước `const loadout`; dòng `mcpTools`; `customTools` | +3 import (`McpBridge` value cho instanceof — OI-03; builder; `AgentTool` type); +6 `bridgeTools`/`bridgeNames` (instanceof narrow, absent → `[]` + debugLog W-1); ±1 `mcpTools: nameTools([...extNames, ...bridgeNames])`; +7 append bridge tools vào `customTools` qua `toSessionToolDefinition` + FR-09 override `promptSnippet/promptGuidelines = undefined` |

Không đụng các hunks `// SA4E-THINKING:` (đã verify riêng bằng `git diff` — thay đổi của tôi tách bạch).

## 3. Files changed (tests — 2 mới + 2 sửa, theo TDD §8.3 / STC target files)

| File | TCs |
|---|---|
| `extension/src/pi-agent/extensions/__tests__/mcp-bridge-extension.test.ts` (append describe, giữ nguyên 167 dòng) | UT-01, UT-02, UT-03, UT-11, UT-12, UT-13, UT-14, UT-15, UT-16, UT-17, UT-18, PBT-01 (fast-check 200 runs) |
| `extension/src/pi-workflow/__tests__/bridge-wiring-legacy.test.ts` (mới) | UT-04, UT-05, PBT-02 (fast-check 40 runs qua engineSpy thật) |
| `extension/src/pi-workflow/__tests__/bridge-wiring-session.test.ts` (mới) | UT-06, UT-07, UT-08, UT-09, UT-10, IT-03 (real `new McpBridge()` — TDD R-7) |
| `extension/src/mcp/__tests__/mcp-bridge.test.ts` (append) | IT-01, IT-02 (real McpBridge + mock IServerManager) |

## 4. Verification results

| Command | Kết quả |
|---|---|
| `npm test` (full suite, cuối) | **301/304 files pass · 2946/2950 tests pass** (~129s). 10 file trọng điểm SIT-01 xanh: `mcp-bridge-extension`, `tool-loadout-{roles,invariants,cap,estimator}`, `pi-agent-session-host` (+auto-chunk), `adapter-legacy-governance`, `adapter-wiring-session/gate`, `mcp-bridge`, `read-method-chain.integration`. 33/33 test mới pass |
| `npm run build` (tsc -p ./) | **0 lỗi** (exit 0) |
| `npm run lint` (eslint src/) | **0 error** (exit 0) |

### 4 failure còn lại — KHÔNG thuộc ticket này (pre-existing/concurrent WIP)

| File | Test | Nguyên nhân |
|---|---|---|
| `pi-session-routing.test.ts` | "cloud provider with key routes to the session path" | Hunk `// SA4E-THINKING:` thêm callback thứ 4 vào `host.promptTurn(...)` (adapter) — test cũ expect 3 args. SA4E-THINKING hunk đã tồn tại trước khi ticket bắt đầu; test assert `promptTurn` không liên quan thay đổi SA4E-364 (test mock toàn bộ session-host module) |
| `PegaBfsPipeline.auth-dead.test.ts` | UT-08, UT-09 | File WIP SA4E-362 (TDZ `showWarningMessage` trong test của họ), xuất hiện trong working tree GIỮA session của tôi (concurrent agent) |
| `PegaStreamIngester.auth-retry.test.ts` | PBT-01 | File WIP SA4E-362 (property fail), cùng nguyên nhân |

Cả 3 file nằm ngoài module-graph của mọi thay đổi SA4E-364 (Pega services không import pi-workflow/pi-agent/mcp; session-routing mock toàn bộ session-host). Được agent SA4E-362 sở hữu và đang tự sửa.

## 5. Deviations từ TDD/STC

1. **UT-16 timeout text**: STC expect `…timed out after 60000ms.` (có dấu chấm) — thực tế `McpToolTimeoutError.message` (mcp-bridge.ts:179) KHÔNG có dấu chấm; handler truyền `err.message` nguyên văn. Test assert theo code thật (`toContain('timed out after 60000ms')`) + ghi chú trong test. EC-6 format không đổi được trong wire-only ticket (không sửa handler).
2. **Cast `{ ...options, audit } as unknown as BridgeOptions`** trong builder: TS bắt buộc vì `BridgeOptions` require `serverManager` trong khi `BridgeToolOptions` là Pick<> — handler chỉ đọc 3 field được pick, cast an toàn (comment trong code). TDD pseudocode không vẽ cast.
3. **PBT-02 numRuns = 40** (STC chỉ định 200 cho PBT-01; PBT-02 mỗi run = 1 adapter turn thật) — đủ strength, giữ suite nhanh.
4. **UT-02 step 5** (so shape với `getPiExtensionAgentTools()`): bỏ qua — npm pi extensions không load được trong unit env; shape đã pin qua 5 field bắt buộc + type `AgentTool` của pi-agent-core.
5. **UT-10 step 5** (SDK filter link khi escalate): assert qua semantics của loadout minimal (`result.minimal === true` + bridge names vắng khỏi allowlist) + comment — không trigger được escalation thật qua host mà không fixture over-budget lớn.
6. STC target file cho IT-01/IT-02 = append `mcp-bridge.test.ts` — đã làm đúng.

## 6. AC coverage (map sang test đã chạy)

| AC | Automated cover | Manual còn lại (UAT) |
|---|---|---|
| AC-1 | UT-01, UT-04, UT-05 (legacy); UT-06 (session) | E2E-UI-01 |
| AC-2 | UT-03 (execute success, `content[0].type==='text'`, `details.success`) | E2E-UI-01 (hiển thị MCP_TOOL_RESULT trên webview) |
| AC-3 | UT-11, UT-12 (builder registry) + assert registry-level trong UT-04/UT-06 (tránh bẫy DISCOVERY_TOOLS) | — |
| AC-4 | UT-13 (EC-5), UT-16 (EC-6/7), IT-01 (real bridge, fail-closed <50ms) | E2E-UI-02, E2E-UI-04 (recovery) |
| AC-5 | UT-08 (cap, N-1/N-3), UT-09 (role BA/QA), UT-10 (minimal drop) | E2E-UI-03 (log) |
| AC-6 | Full suite (mục 4) + regression files xanh | — |
