# Software Test Cases (STC)

## SDLC Agents 4 Enterprise — SA4E-364: [SDLC Chat] Wire MCP tools của extension vào chat agent (mcp-bridge-extension là dead code)

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-364 |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-10-16 |
| Status | Draft (pending BA review gate) |
| Inputs | BRD.md v1.0 (AC-1..AC-6), FSD.md v1.1 (UC-01..04, FR-01..09, BR-01..08, §3.5 API Contracts, §7 EC-1..EC-7, §8.1 Test path per AC), SA4E-364-FINDINGS.md §5 (verification steps) |
| Test Plan | documents/SA4E-364/STP.md v1.0 (counts khớp: 30 TCs) |

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-16 | QA Agent | Initiate STC — 30 TCs (PBT-2, UT-18, IT-3, E2E-UI-4 manual, SIT-3); RTM 100% AC/FR/BR/EC/UC; 5 CSV test data covering 30/30 TC IDs; assert AC-3 trên tool registry theo bẫy FSD §8.1. TDD cross-check (TDD.md ra mắt giữa chừng): target files sync theo TDD checklist #10/#11/#12; mock module đúng tên `pi-extension-runtime`; engineSpy pattern — test intent + counts KHÔNG đổi |

---

## 1. Conventions (match existing test style)

- **MockBridge:** `{ callTool: vi.fn() } as unknown as McpBridge` (pattern `mcp-bridge-extension.test.ts:35-37`) — đủ cho UT; IT dùng `new McpBridge(mockManager)` thật.
- **Module mocks:** `vi.hoisted` + `vi.mock('vscode', ...)` (adapter-legacy-governance.test.ts:23-30); mock `../pi-extension-runtime` (module chứa `getPiExtensionAgentTools` — tên đúng theo TDD checklist #4/#10, KHÔNG phải pi-extension-loader); **engineSpy** = `vi.spyOn((adapter as any).engine, 'executeTurn')` (adapter-legacy-governance.test.ts:77-83); session test phải dùng `new McpBridge(...)` THẬT từ cùng module (không vi.mock mcp-bridge — TDD R-7, bắt buộc cho `instanceof` narrow); `afterEach: vi.restoreAllMocks()`.
- **Assert AC-3 (BẮT BUỘC):** assert trên **danh sách tool được build/registered** (return của `buildMcpBridgeAgentTools` / `customTools` / tool registry) — TUYỆT ĐỐI KHÔNG assert trên mảng allowlist string của session host, vì `DISCOVERY_TOOLS` (tool-loadout.ts:18) luôn chứa tên `execute_dynamic_tool` dù tool không register (bẫy FSD §8.1 / OI-04).
- **Naming trong test:** giữ convention `STC: TC-xxx` comment như test hiện có của SA4E-316 khi DEV thêm case mới.
- **Signature nguồn:** `buildMcpBridgeAgentTools(bridge: McpBridge, options?: BridgeToolOptions): AgentTool[]` (FSD §3.5.1). Nếu DEV/TDD đặt tên khác → STC sync pass, test intent không đổi.
- **Vitest discovery:** mọi test file mới đặt trong `src/**/__tests__/` (vitest.config.ts include) — auto-discovered, không đổi config.
- **Số liệu đo:** IT-01 đo latency bằng `performance.now()` quanh `await execute()` — assert < 50ms chỉ là sanity (N-4), không phải load test.

## 2. RTM Summary

Trace đầy đủ (AC/FR/BR/EC/UC → TC) xem **STP §4** — tóm tắt: 6/6 AC ✅, 9/9 FR ✅, 8/8 BR ✅, 7/7 EC ✅, 4/4 UC ✅ = **100% coverage**. Mọi TC dưới đây có cột Requirement trace ngược về FSD/BRD.

---

## 3. Test Cases

### Level legend

| Prefix | Level | Automation |
|--------|-------|------------|
| PBT-xx | Property-Based (fast-check) | Automated (vitest) |
| UT-xx | Unit | Automated (vitest) |
| IT-xx | Integration (real McpBridge + mock IServerManager) | Automated (vitest) |
| E2E-UI-xx | Manual UAT — Extension Development Host | **Manual** |
| SIT-xx | Regression suite + build | Automated (npm test / npm run build) |
| E2E-API | N/A — extension không expose HTTP API mới (STP §1.2) | — |

Target files (sync theo TDD Implementation Checklist — DEV có thể gộp/split miễn trong src/**/__tests__/):

| File (sync theo TDD checklist #10/#11/#12) | Chứa TC |
|--------------|---------|
| extension/src/pi-agent/extensions/__tests__/mcp-bridge-extension.test.ts (TDD file #12 — append describe, giữ nguyên 167 dòng hiện có) | UT-01..03, UT-11..18, PBT-01 |
| extension/src/pi-workflow/__tests__/bridge-wiring-legacy.test.ts (TDD file #10 — mới ~95 dòng, pattern engineSpy adapter-legacy-governance.test.ts:77-83) | UT-04, UT-05, PBT-02 |
| extension/src/pi-workflow/__tests__/bridge-wiring-session.test.ts (TDD file #11 — mới ~120 dòng, mock @earendil-works/pi-coding-agent pi-agent-session-host.test.ts:34-58; dùng new McpBridge() thật — TDD R-7) | UT-06..10, IT-03 |
| extension/src/mcp/__tests__/mcp-bridge.test.ts (append — QA bổ sung test-only ngoài 3 file test TDD) | IT-01, IT-02 |
| Hiện có (không đổi) | SIT-01..03 (suite run) |

---

### PBT-01: Property — buildMcpBridgeAgentTools mọi tổ hợp options

| Field | Value |
|-------|-------|
| **ID** | PBT-01 |
| **Priority** | P1 |
| **Type** | Functional — Automated (vitest + fast-check) |
| **Requirement** | AC-1, AC-3, FR-01, FR-05, BR-02; UC-03 AF-1 |
| **Precondition** | Fix đã export `buildMcpBridgeAgentTools`; import `TOOLS` thật từ tool-definitions.ts |
| **Target file** | mcp-bridge-extension.test.ts — append describe `buildMcpBridgeAgentTools (SA4E-364)` (TDD file #12) |

**Steps (property `fc.property`):**

| Step | Action | Expected |
|------|--------|----------|
| 1 | Sinh arbitrary `optIn: boolean | undefined` + `auditLog?` + `approvalHook?` (fast-check arbitrary, 200 runs) | — |
| 2 | Gọi `buildMcpBridgeAgentTools(mockBridge, options)` | KHÔNG throw với mọi tổ hợp |
| 3 | Assert names | LUÔN chứa `jira_get_issue, mem_search, mem_ingest, code_search` |
| 4 | Assert dynamic | chứa `execute_dynamic_tool` ⟺ `allowDynamicChaining === true` (assert trên returned array — KHÔNG phải allowlist string) |
| 5 | Assert unique | `new Set(names).size === names.length` |
| 6 | Assert không side-effect | `mockBridge.callTool` không được gọi lúc build (0 network — N-6) |

**Test Data:** testdata/bridge-tool-inventory.csv (dòng PBT-01).
**Postcondition:** không thay đổi state nào (hàm thuần).

---

### PBT-02: Property — merge skip-if-exists: bridge không bao giờ đè entry hiện có

| Field | Value |
|-------|-------|
| **ID** | PBT-02 |
| **Priority** | P1 |
| **Type** | Functional — Automated (vitest + fast-check) |
| **Requirement** | AC-1, AC-6, FR-02, BR-06; UC-01 AF-1 |
| **Precondition** | Merge logic của legacy path khả dụng (inline vòng merge hoặc helper DEV tạo — test theo seam đã chốt ở sync pass) |
| **Target file** | bridge-wiring-legacy.test.ts (TDD file #10) |

**Steps (property):**

| Step | Action | Expected |
|------|--------|----------|
| 1 | Sinh arbitrary pool tên có sẵn (fast-check: mảng tên unique, có thể chứa 0..4 tên trùng với bridge tools) map vào sentinel objects | — |
| 2 | Merge `bridgeTools = buildMcpBridgeAgentTools(mockBridge)` theo pseudocode FSD §3.5.3 (guard `!byName.has(name)`) | — |
| 3 | Assert reference | MỌI entry có sẵn giữ NGUYÊN sentinel reference (không bị ghi đè — kể cả tên trùng) |
| 4 | Assert bổ sung | Bridge tool chỉ xuất hiện với tên CHƯA có trong pool; sau merge pool.size = pool_trước + số bridge names mới |
| 5 | Assert đầy đủ | Nếu pool không chứa tên nào của bridge → đủ 4 bridge names sau merge |

**Test Data:** testdata/wiring-merge-scenarios.csv (dòng PBT-02).
**Postcondition:** —

---

### UT-01: buildMcpBridgeAgentTools trả đúng 4 tool bridge

| Field | Value |
|-------|-------|
| **ID** | UT-01 |
| **Priority** | P1 |
| **Type** | Functional — Automated (vitest) |
| **Requirement** | FR-01, AC-1; UC-01/UC-02 step 3-4 |
| **Precondition** | Hàm đã export từ mcp-bridge-extension.ts |
| **Target file** | mcp-bridge-extension.test.ts — append describe `buildMcpBridgeAgentTools (SA4E-364)` (TDD file #12) |

**Steps:**

| Step | Action | Expected |
|------|--------|----------|
| 1 | `const tools = buildMcpBridgeAgentTools(mockBridge)` (không options) | trả `AgentTool[]` |
| 2 | Assert `tools.length` | === 4 |
| 3 | Assert `tools.map(t => t.name).sort()` | === `['code_search','jira_get_issue','mem_ingest','mem_search']` |
| 4 | Assert KHÔNG chứa | `'execute_dynamic_tool'` (wiring production không opt-in — OI-04) |

**Test Data:** testdata/bridge-tool-inventory.csv (UT-01).
**Postcondition:** —

---

### UT-02: Shape AgentTool khớp pi-agent-core — parameters passthrough từ TOOLS

| Field | Value |
|-------|-------|
| **ID** | UT-02 |
| **Priority** | P1 |
| **Type** | Functional — Automated (vitest) |
| **Requirement** | FR-01, BR-01, AC-1 |
| **Precondition** | như UT-01 |
| **Target file** | mcp-bridge-extension.test.ts — append describe `buildMcpBridgeAgentTools (SA4E-364)` (TDD file #12) |

**Steps:**

| Step | Action | Expected |
|------|--------|----------|
| 1 | Với mỗi tool trong kết quả UT-01 | có đủ `{ name, label, description, parameters, execute }` |
| 2 | Assert `parameters` | là CHÍNH XÁC object từ `TOOLS` cùng tên (`toBe` same-reference — chứng minh tái dùng BR-01, không clone/sửa schema) |
| 3 | Assert `label`/`description` | khớp `TOOLS` (vd `mem_search` label 'Memory Search') |
| 4 | Assert `execute` | là function; signature async nhận (id, params) |
| 5 | So sánh shape với tool của `getPiExtensionAgentTools()` (nếu khả dụng trong test env) | cùng tập field bắt buộc — shape khớp pi-agent-core (FSD §3.5.1) |

**Test Data:** testdata/bridge-tool-inventory.csv (UT-02 — label/description từng tool).
**Postcondition:** —

---

### UT-03: execute success — mem_search qua mockBridge + audit auto-approved không log param values

| Field | Value |
|-------|-------|
| **ID** | UT-03 |
| **Priority** | P1 |
| **Type** | Functional — Automated (vitest) |
| **Requirement** | FR-01, FR-06, FR-07, AC-2 (unit path); UC-01 step 6-8 |
| **Precondition** | mockBridge = { callTool: vi.fn().mockResolvedValue('KB results: personalized rules -> ...') }; auditLog spy |
| **Target file** | mcp-bridge-extension.test.ts — append describe `buildMcpBridgeAgentTools (SA4E-364)` (TDD file #12) |

**Steps:**

| Step | Action | Expected |
|------|--------|----------|
| 1 | Lấy tool `mem_search` từ `buildMcpBridgeAgentTools(mockBridge, { auditLog: spy })` | — |
| 2 | `await tool.execute('id-1', { query: 'personalized rules', limit: 5 })` | KHÔNG throw |
| 3 | Assert `mockBridge.callTool` | được gọi đúng 1 lần với `('mem_search', { query: 'personalized rules', limit: 5 })` |
| 4 | Assert result | `content[0].type === 'text'`; `content[0].text` chứa 'personalized rules'; `details.success === true`; `details.toolName === 'mem_search'` |
| 5 | Assert audit | spy được gọi 1 lần: `{ toolName: 'mem_search', argKeys: ['query','limit'], decision: 'auto-approved' }` |
| 6 | Assert no-param-leak | `JSON.stringify(spy.mock.calls[0][0])` KHÔNG chứa 'personalized rules' (chỉ argKeys — BR-04/N-7) |

**Test Data:** testdata/bridge-tool-call-params.csv (UT-03).
**Postcondition:** —

---

### UT-04: Legacy wiring — merge byName chứa bridge tools; trùng tên → skip + warn, tool hiện có thắng

| Field | Value |
|-------|-------|
| **ID** | UT-04 |
| **Priority** | P1 |
| **Type** | Functional — Automated (vitest) |
| **Requirement** | FR-02, BR-06, AC-1, AC-6; UC-01 step 3 + AF-1 |
| **Precondition** | vi.mock `vscode` + `getPiExtensionAgentTools` trả 1 ext tool TRÙNG TÊN `mem_search` (sentinel object) + 1 ext tool `aft_hoist_tool`; drive legacy turn qua seam đã dùng trong adapter-legacy-governance.test.ts |
| **Target file** | bridge-wiring-legacy.test.ts (TDD file #10) |

**Steps:**

| Step | Action | Expected |
|------|--------|----------|
| 1 | Khởi tạo adapter với mocked deps (engine spy, store, streamHandler) như pattern hiện có | — |
| 2 | Gửi chat input để chạy legacy turn | — |
| 3 | Capture `engine.executeTurn` input.tools (hoặc seam tương đương) | chứa 4 bridge names TRỪ `mem_search` (bị skip) + `aft_hoist_tool` + builtin tools |
| 4 | Assert collision | mọi instance `mem_search` trong tools là sentinel ext object (ext thắng — bridge KHÔNG đè, khác last-wins vòng builtin/ext — OI-06) |
| 5 | Assert không phá | `aft_hoist_tool` giữ nguyên reference (AFT hoist không bị phá — BR-06) |
| 6 | Assert log | debugLog/console chứa warn `bridge tool skipped (exists): mem_search` |

**Test Data:** testdata/wiring-merge-scenarios.csv (UT-04).
**Postcondition:** —

---

### UT-05: Legacy wiring — extension runtime fail (extTools rỗng) → bridge tools vẫn được merge

| Field | Value |
|-------|-------|
| **ID** | UT-05 |
| **Priority** | P2 |
| **Type** | Functional — Automated (vitest) |
| **Requirement** | FR-02, UC-01 AF-2 |
| **Precondition** | vi.mock `getPiExtensionAgentTools` throw Error('extension runtime fail') |
| **Target file** | bridge-wiring-legacy.test.ts (TDD file #10) |

**Steps:**

| Step | Action | Expected |
|------|--------|----------|
| 1 | Chạy legacy turn như UT-04 | turn KHÔNG crash vì ext fail (catch hiện có — adapter:486-488) |
| 2 | Capture tools | chứa ĐỦ 4 bridge names + builtin tools; KHÔNG có ext tools |
| 3 | Assert độc lập | wiring bridge không phụ thuộc npm extensions (AF-2 UC-01) |

**Test Data:** testdata/wiring-merge-scenarios.csv (UT-05).
**Postcondition:** —

---

### UT-06: Session wiring — customTools chứa 2 tool hiện có + 4 bridge ToolDefinition

| Field | Value |
|-------|-------|
| **ID** | UT-06 |
| **Priority** | P1 |
| **Type** | Functional — Automated (vitest) |
| **Requirement** | FR-03, AC-1; UC-02 step 7 |
| **Precondition** | Mock `piCoding.createAgentSession` capture input (pattern pi-agent-session-host.test.ts); bridge tools build từ real/smock bridge |
| **Target file** | bridge-wiring-session.test.ts (TDD file #11) |

**Steps:**

| Step | Action | Expected |
|------|--------|----------|
| 1 | Chạy session host init với opts.mcpBridge = mock/smock McpBridge | — |
| 2 | Capture `customTools` từ createAgentSession input | — |
| 3 | Assert names | chứa `get_workspace_info`, `read_method` (2 tool hiện có) + 4 bridge names |
| 4 | Assert shape | mỗi bridge entry có `{ name, label, description, parameters, execute }` ToolDefinition (qua `toSessionToolDefinition`) |
| 5 | Assert allowlist | `tools` param chứa 4 bridge names (SDK `isAllowedTool` lọc theo allowlist — FR-03 code-verified) |

**Test Data:** testdata/wiring-merge-scenarios.csv (UT-06).
**Postcondition:** —

---

### UT-07: FR-09 — bridge ToolDefinition có promptSnippet/promptGuidelines = undefined (override tại call site)

| Field | Value |
|-------|-------|
| **ID** | UT-07 |
| **Priority** | P1 |
| **Type** | Functional — Automated (vitest) |
| **Requirement** | FR-09, AC-1/AC-2 (chất lượng schema) |
| **Precondition** | như UT-06 (capture customTools) |
| **Target file** | bridge-wiring-session.test.ts (TDD file #11) |

**Steps:**

| Step | Action | Expected |
|------|--------|----------|
| 1 | Với mỗi bridge entry trong customTools | — |
| 2 | Assert `promptSnippet` | === undefined (KHÔNG phải 'Workspace orientation' hardcode của converter — gap FR-09) |
| 3 | Assert `promptGuidelines` | === undefined (KHÔNG chứa 'Call get_workspace_info first...') |
| 4 | Assert không lây lan | workspace_info/read_method entries GIỮ NGUYÊN promptSnippet/promptGuidelines của chúng (override chỉ tại call site cho bridge tools) |

**Test Data:** testdata/wiring-merge-scenarios.csv (UT-07).
**Postcondition:** —

---

### UT-08: Session loadout — bridge names vào mcpTools; loadout chứa 4 tên; schemaTokens tăng đúng

| Field | Value |
|-------|-------|
| **ID** | UT-08 |
| **Priority** | P1 |
| **Type** | Functional — Automated (vitest) |
| **Requirement** | FR-03, FR-04, AC-5; UC-02 step 5 |
| **Precondition** | Import thật `buildSessionToolLoadout`/`nameTools` từ tool-loadout.ts |
| **Target file** | bridge-wiring-session.test.ts (TDD file #11) |

**Steps:**

| Step | Action | Expected |
|------|--------|----------|
| 1 | Baseline: `buildSessionToolLoadout({ mcpTools: nameTools(extNames), role: 'SM', schemaTokenCap })` | ghi lại loadout + schemaTokens |
| 2 | Thêm bridge: `mcpTools: nameTools([...extNames, ...bridgeNames])` (bridgeNames = 4 tên) | — |
| 3 | Assert loadout | chứa đủ 4 bridge names (role SM = '*' full pool) |
| 4 | Assert schemaTokens | tăng đúng `tokensOf(nameTools(bridgeNames))` (name-only estimate — N-3) và ≤ schemaTokenCap (N-1) |
| 5 | Assert core | CORE_FILE_TOOLS + discovery vẫn có mặt |

**Test Data:** testdata/loadout-role-scenarios.csv (UT-08).
**Postcondition:** —

---

### UT-09: Role filter — role BA lọc code_search, giữ jira_/mem_; role QA giữ code_search

| Field | Value |
|-------|-------|
| **ID** | UT-09 |
| **Priority** | P2 |
| **Type** | Functional — Automated (vitest) |
| **Requirement** | FR-04, AC-5; UC-02 AF-2 |
| **Precondition** | như UT-08 |
| **Target file** | bridge-wiring-session.test.ts (TDD file #11) |

**Steps:**

| Step | Action | Expected |
|------|--------|----------|
| 1 | `buildSessionToolLoadout({ mcpTools: nameTools(bridgeNames), role: 'BA', ... })` | — |
| 2 | Assert | `code_search` KHÔNG có trong loadout (prefix `code_` ∉ ROLE_TOOL_PREFIXES.BA = docs_/mem_/jira_) |
| 3 | Assert | `jira_get_issue`, `mem_search`, `mem_ingest` có mặt |
| 4 | Đổi role 'QA' | `code_search` CÓ mặt (ROLE_TOOL_PREFIXES.QA chứa code_) |
| 5 | Role undefined | full pool (BR-07 fail-open — hành vi SA4E-355 giữ nguyên) |

**Test Data:** testdata/loadout-role-scenarios.csv (UT-09).
**Postcondition:** —

---

### UT-10: Escalation minimal — bridge names bị drop, core tools giữ nguyên

| Field | Value |
|-------|-------|
| **ID** | UT-10 |
| **Priority** | P2 |
| **Type** | Functional — Automated (vitest) |
| **Requirement** | BR-07, AC-5, FR-08; UC-02 AF-1 |
| **Precondition** | như UT-08 |
| **Target file** | bridge-wiring-session.test.ts (TDD file #11) |

**Steps:**

| Step | Action | Expected |
|------|--------|----------|
| 1 | `buildSessionToolLoadout({ mcpTools: nameTools(bridgeNames), minimal: true })` | — |
| 2 | Assert loadout | CHỈ còn core + discovery; KHÔNG có bridge names nào (AF-1 UC-02 — bridge drop đúng thiết kế) |
| 3 | Assert core | 6 CORE_FILE_TOOLS + find_tools + execute_dynamic_tool (tên trong discovery) vẫn nguyên |
| 4 | Assert minimal flag | `result.minimal === true` |
| 5 | Liên kết wiring | allowlist rơi về `[...baseTools]` → SDK lọc customTools → bridge tools không expose (assert qua seam allowlist nếu test qua host) |

**Test Data:** testdata/loadout-role-scenarios.csv (UT-10).
**Postcondition:** —

---

### UT-11: AC-3 mặc định — build KHÔNG chứa execute_dynamic_tool (assert trên tool registry)

| Field | Value |
|-------|-------|
| **ID** | UT-11 |
| **Priority** | P1 |
| **Type** | Functional/Security — Automated (vitest) |
| **Requirement** | FR-05, AC-3, EC-1 (wiring-level); UC-03 AF-1; OI-04 |
| **Precondition** | mockBridge sẵn sàng; ⚠️ assert trên returned array — KHÔNG phải mảng allowlist string (bẫy DISCOVERY_TOOLS) |
| **Target file** | mcp-bridge-extension.test.ts — append describe `buildMcpBridgeAgentTools (SA4E-364)` (TDD file #12) |

**Steps:**

| Step | Action | Expected |
|------|--------|----------|
| 1 | `const tools = buildMcpBridgeAgentTools(mockBridge)` — KHÔNG truyền options | — |
| 2 | Assert names | KHÔNG chứa `'execute_dynamic_tool'` |
| 3 | Assert đủ 4 concrete | 4 tool bridge có mặt (dynamic vắng không ảnh hưởng các tool khác) |
| 4 | Double-check target | Ghi comment trong test: assert target là tool registry/build output, không phải allowlist string của session host |

**Test Data:** testdata/bridge-tool-inventory.csv (UT-11).
**Postcondition:** —

---

### UT-12: AC-3 opt-in — allowDynamicChaining: true → 5 tools

| Field | Value |
|-------|-------|
| **ID** | UT-12 |
| **Priority** | P2 |
| **Type** | Functional/Security — Automated (vitest) |
| **Requirement** | FR-05, AC-3; UC-03 step 1 |
| **Precondition** | như UT-11 |
| **Target file** | mcp-bridge-extension.test.ts — append describe `buildMcpBridgeAgentTools (SA4E-364)` (TDD file #12) |

**Steps:**

| Step | Action | Expected |
|------|--------|----------|
| 1 | `buildMcpBridgeAgentTools(mockBridge, { allowDynamicChaining: true })` | — |
| 2 | Assert | chứa `'execute_dynamic_tool'` (tools.length === 5) |
| 3 | Assert opt-in ngữ nghĩa | `allowDynamicChaining: false` / `0` / undefined → KHÔNG chứa (chỉ `=== true` mới opt-in — FSD §3.5.2 guard `!== true`) |

**Test Data:** testdata/bridge-tool-inventory.csv (UT-12).
**Postcondition:** —

---

### UT-13: AC-4 — McpServerNotRunningError → error text chính xác, không throw

| Field | Value |
|-------|-------|
| **ID** | UT-13 |
| **Priority** | P1 |
| **Type** | Functional — Automated (vitest) |
| **Requirement** | FR-07, BR-08, AC-4, EC-5; UC-04 step 2-3 |
| **Precondition** | mockBridge.callTool `mockRejectedValue(new McpServerNotRunningError('MCP Server is not running.'))` (pattern mcp-bridge-extension.test.ts:66-70) |
| **Target file** | mcp-bridge-extension.test.ts — append describe `buildMcpBridgeAgentTools (SA4E-364)` (TDD file #12) |

**Steps:**

| Step | Action | Expected |
|------|--------|----------|
| 1 | Lấy tool `mem_search`; `const result = await tool.execute('id-2', { query: 'personalized rules' })` | promise RESOLVE (không reject — handler bắt mọi error) |
| 2 | Assert text | `content[0].text === 'Error invoking mem_search: MCP Server is not running.'` (message chính xác FSD EC-5) |
| 3 | Assert details | `details.error === 'mcp_error'`; `details.toolName === 'mem_search'` |
| 4 | Assert turn-safe | handler không re-throw → turn tiếp tục được (BR-08) |

**Test Data:** testdata/bridge-tool-call-params.csv (UT-13).
**Postcondition:** —

---

### UT-14: EC-2 — validateParams fail (thiếu required / string quá 4000 chars)

| Field | Value |
|-------|-------|
| **ID** | UT-14 |
| **Priority** | P2 |
| **Type** | Functional — Automated (vitest) |
| **Requirement** | BR-05, EC-2, FR-08 |
| **Precondition** | tool mem_search (required: query) từ build output |
| **Target file** | mcp-bridge-extension.test.ts — append describe `buildMcpBridgeAgentTools (SA4E-364)` (TDD file #12) |

**Steps:**

| Step | Action | Expected |
|------|--------|----------|
| 1 | `execute('id-3', {})` (thiếu query) | text bắt đầu `'Validation failed: '`; `details.error === 'validation'`; callTool KHÔNG được gọi |
| 2 | `execute('id-4', { query: 'x'.repeat(4001) })` | validation fail (MAX_STRING_PARAM_LENGTH 4000) |
| 3 | `execute('id-5', { query: 'x'.repeat(4000) })` | validation PASS → đi tiếp tới callTool (boundary đúng chiều) |
| 4 | Không audit | validation fail KHÔNG ghi audit (fail trước approval — FSD EC-2 ghi chú) |

**Test Data:** testdata/bridge-tool-call-params.csv (UT-14 — đủ 3 dòng boundary).
**Postcondition:** —

---

### UT-15: EC-4 — approvalHook trả false → approval_denied + audit 'denied'

| Field | Value |
|-------|-------|
| **ID** | UT-15 |
| **Priority** | P2 |
| **Type** | Functional/Security — Automated (vitest) |
| **Requirement** | FR-06, BR-04, EC-4; UC-03 EF-2 |
| **Precondition** | tool `mem_ingest` (requires approval) + options `{ approvalHook: async () => false, auditLog: spy }` |
| **Target file** | mcp-bridge-extension.test.ts — append describe `buildMcpBridgeAgentTools (SA4E-364)` (TDD file #12) |

**Steps:**

| Step | Action | Expected |
|------|--------|----------|
| 1 | `await tool.execute('id-6', { content: 'lesson learned text' })` | resolve |
| 2 | Assert text | `'Tool call denied by approval: mem_ingest'` |
| 3 | Assert details | `details.error === 'approval_denied'` |
| 4 | Assert callTool | KHÔNG được gọi |
| 5 | Assert audit | 1 entry `{ toolName: 'mem_ingest', argKeys: ['content'], decision: 'denied' }`; không chứa 'lesson learned text' |

**Test Data:** testdata/bridge-tool-call-params.csv (UT-15).
**Postcondition:** —

---

### UT-16: EC-6 + EC-7 — timeout & generic error → error text đúng dạng

| Field | Value |
|-------|-------|
| **ID** | UT-16 |
| **Priority** | P2 |
| **Type** | Functional — Automated (vitest) |
| **Requirement** | FR-07, FR-08, EC-6, EC-7; UC-04 AF-1 |
| **Precondition** | mockBridge.callTool configurable reject |
| **Target file** | mcp-bridge-extension.test.ts — append describe `buildMcpBridgeAgentTools (SA4E-364)` (TDD file #12) |

**Steps:**

| Step | Action | Expected |
|------|--------|----------|
| 1 | callTool rejects `new McpToolTimeoutError("MCP tool 'mem_search' timed out after 60000ms.")` | text `'Error invoking mem_search: MCP tool 'mem_search' timed out after 60000ms.'`; details.error 'mcp_error' |
| 2 | callTool rejects `new Error('HTTP 500 from MCP server')` | text `'Error invoking mem_search: HTTP 500 from MCP server'`; details.error 'mcp_error' |
| 3 | Cả 2 nhánh | promise resolve (không crash turn — BR-08); audit đã ghi 'auto-approved' trước call |

**Test Data:** testdata/bridge-tool-call-params.csv (UT-16).
**Postcondition:** —

---

### UT-17: EC-1 defense-in-depth — handler execute_dynamic_tool không opt-in → chaining_denied text

| Field | Value |
|-------|-------|
| **ID** | UT-17 |
| **Priority** | P3 |
| **Type** | Security — Automated (vitest) |
| **Requirement** | FR-05, BR-02, EC-1; UC-03 AF-1 |
| **Precondition** | Lớp bảo vệ thứ 2: nếu tool vẫn bị gọi khi chưa opt-in (handler tạo trực tiếp — reuse `createExecuteHandler` hiện có) |
| **Target file** | mcp-bridge-extension.test.ts — append describe `buildMcpBridgeAgentTools (SA4E-364)` (TDD file #12) |

**Steps:**

| Step | Action | Expected |
|------|--------|----------|
| 1 | `createExecuteHandler(mockBridge, 'execute_dynamic_tool', { required: ['tool_name'] })` (không options) | — |
| 2 | `await handler('id-7', { tool_name: 'code_search', arguments: { query: 'x' } })` | text `'Dynamic tool chaining is disabled: execute_dynamic_tool requires explicit opt-in'` |
| 3 | Assert details + audit | `details.error === 'chaining_denied'`; audit entry `{ toolName: 'execute_dynamic_tool', argKeys: [], decision: 'denied' }` |
| 4 | Assert callTool | KHÔNG được gọi |

**Test Data:** testdata/bridge-tool-call-params.csv (UT-17).
**Postcondition:** — (case bảo vệ hiện có của handler — regression khi wiring)

---

### UT-18: EC-3 — opt-in nhưng chained target ngoài TOOL_ALLOWLIST → denied

| Field | Value |
|-------|-------|
| **ID** | UT-18 |
| **Priority** | P2 |
| **Type** | Security — Automated (vitest) |
| **Requirement** | BR-02, FR-05, EC-3; UC-03 EF-1 |
| **Precondition** | handler dynamic với `{ allowDynamicChaining: true }` |
| **Target file** | mcp-bridge-extension.test.ts — append describe `buildMcpBridgeAgentTools (SA4E-364)` (TDD file #12) |

**Steps:**

| Step | Action | Expected |
|------|--------|----------|
| 1 | `await handler('id-8', { tool_name: 'shell_execute', arguments: {} })` | text `"Dynamic tool chaining denied: 'shell_execute' is not allowlisted"` |
| 2 | Assert details + audit | `details.error === 'chaining_denied'`, `details.target === 'shell_execute'`; audit decision 'denied' |
| 3 | Control case | `tool_name: 'mem_ingest'` (∈ TOOL_ALLOWLIST) → đi qua, callTool được gọi với ('execute_dynamic_tool', params) (khớp pattern test hiện có :127-136) |

**Test Data:** testdata/bridge-tool-call-params.csv (UT-18).
**Postcondition:** —

---

### IT-01: Integration — real McpBridge + mock IServerManager stopped → fail-closed error text, < 50ms

| Field | Value |
|-------|-------|
| **ID** | IT-01 |
| **Priority** | P1 |
| **Type** | Functional/Reliability — Automated (vitest) |
| **Requirement** | AC-4, BR-03, BR-08, EC-5, N-4; UC-04 |
| **Precondition** | `const bridge = new McpBridge(mockManager)` với mockManager thật interface (`status: 'stopped'`, invokeTool spy); KHÔNG mock reject ở callTool — để error thật phát sinh từ bridge (isAvailable check) |
| **Target file** | mcp-bridge.test.ts — append (QA bổ sung test-only ngoài 3 file TDD; bridge thật + mock IServerManager) |

**Steps:**

| Step | Action | Expected |
|------|--------|----------|
| 1 | `const tools = buildMcpBridgeAgentTools(bridge)` — bridge THẬT | 4 tools |
| 2 | `const t0 = performance.now(); const r = await tools.find(mem_search).execute('it-1', { query: 'personalized rules' }); const dt = performance.now() - t0` | — |
| 3 | Assert r | `content[0].text === 'Error invoking mem_search: MCP Server is not running.'`; `details.error === 'mcp_error'` |
| 4 | Assert fail-closed | `mockManager.invokeTool` KHÔNG được gọi (bridge chặn local — không network) |
| 5 | Assert N-4 sanity | `dt < 50` (ms) — error path không network |

**Test Data:** testdata/bridge-tool-call-params.csv (IT-01).
**Postcondition:** —

---

### IT-02: Integration — real McpBridge + manager running → success qua transport thật

| Field | Value |
|-------|-------|
| **ID** | IT-02 |
| **Priority** | P1 |
| **Type** | Functional — Automated (vitest) |
| **Requirement** | FR-07, AC-1, AC-2 (unit-integration path); UC-01 step 6-8 |
| **Precondition** | mockManager `{ status: 'running', invokeTool: vi.fn().mockResolvedValue('KB hits: 3 entries about personalized rules') }`; bridge thật |
| **Target file** | mcp-bridge.test.ts — append (QA bổ sung test-only ngoài 3 file TDD; bridge thật + mock IServerManager) |

**Steps:**

| Step | Action | Expected |
|------|--------|----------|
| 1 | execute `mem_search` với `{ query: 'personalized rules' }` | resolve |
| 2 | Assert text | chứa 'personalized rules' (result qua `invokeTool` thật của bridge — bao gồm interceptResponse path) |
| 3 | Assert delegate | `invokeTool` được gọi với ('mem_search', params deep-cloned) |
| 4 | Assert details | `details.success === true` |

**Test Data:** testdata/bridge-tool-call-params.csv (IT-02).
**Postcondition:** —

---

### IT-03: Integration — session host type-guard: real McpBridge → 4 tools; absent/sai kiểu → [] fail-safe

| Field | Value |
|-------|-------|
| **ID** | IT-03 |
| **Priority** | P2 |
| **Type** | Functional — Automated (vitest) |
| **Requirement** | FR-03, OI-03, BR-03, AC-1; SA4E-360 "bridge-absent ⇒ DEGRADED" |
| **Precondition** | Mock `createAgentSession` capture customTools (pattern pi-agent-session-host.test.ts) |
| **Target file** | bridge-wiring-session.test.ts (TDD file #11) |

**Steps:**

| Step | Action | Expected |
|------|--------|----------|
| 1 | Case A: opts.mcpBridge = `new McpBridge(mockManager)` (instance thật) | customTools chứa 4 bridge entries (type-guard `instanceof McpBridge` pass) |
| 2 | Case B: opts.mcpBridge = undefined | customTools KHÔNG có bridge entries; session VẪN tạo thành công (fail-safe degraded — không throw) |
| 3 | Case C: opts.mcpBridge = `{}` (object lạ, không phải McpBridge) | như Case B (type-guard chặn) |
| 4 | Assert cả 3 case | budget gate vẫn chạy; không crash host init |

**Test Data:** testdata/wiring-merge-scenarios.csv (IT-03).
**Postcondition:** —

---

### E2E-UI-01: UAT — chat "search KB: personalized rules" → mem_search chạy, MCP_TOOL_RESULT hiển thị

| Field | Value |
|-------|-------|
| **ID** | E2E-UI-01 |
| **Priority** | P1 |
| **Type** | Functional — **Manual UAT** (findings §5 step 2) |
| **Requirement** | AC-1, AC-2; UC-01/UC-02 main flow; BRD Success Metrics #2/#3 |
| **Precondition** | Extension build + loaded (Extension Development Host F5 hoặc VSIX); LLM provider + API key configured; MCP server (code-intel) running — badge SDLC PIPELINE connected |
| **Evidence** | documents/SA4E-364/evidence/E2E-UI-01-mem-search.png |

**Steps:**

| Step | Action | Expected |
|------|--------|----------|
| 1 | Mở SDLC CHAT panel | badge `SDLC PIPELINE connected` hiển thị |
| 2 | Gửi đúng prompt: `search KB: personalized rules` | — |
| 3 | Quan sát tool call trong chat | LLM gọi `mem_search` (hiển thị tool call item); KHÔNG chỉ chèn text mô tả như picker cũ |
| 4 | Quan sát kết quả | event `MCP_TOOL_RESULT` hiển thị kết quả search KB trong webview |
| 5 | Quan sát reply | LLM soạn reply dựa trên kết quả (trích được ít nhất 1 rule/lesson từ KB) |
| 6 | Lặp lại 1 lệnh Jira: `đọc issue SA4E-364 trên Jira` | `jira_get_issue` được gọi với issue_key='SA4E-364'; result hiển thị (mở rộng AC-1 — tool khác mem_search cũng hoạt động) |

**Test Data:** testdata/uat-steps.csv (E2E-UI-01).
**Postcondition:** conversation lưu; không lỗi console.

---

### E2E-UI-02: UAT — MCP server stopped → chat hoạt động, error text rõ ràng

| Field | Value |
|-------|-------|
| **ID** | E2E-UI-02 |
| **Priority** | P1 |
| **Type** | Reliability — **Manual UAT** (findings §5 step 4) |
| **Requirement** | AC-4, BR-08, EC-5; UC-04 main |
| **Precondition** | như E2E-UI-01; sau đó STOP MCP server (shutdown code-intel server / toggle enableMcpServer) |
| **Evidence** | documents/SA4E-364/evidence/E2E-UI-02-server-stopped.png |

**Steps:**

| Step | Action | Expected |
|------|--------|----------|
| 1 | Stop MCP server; xác nhận badge trạng thái server thay đổi (hoặc log [McpServerManager] stopped) | — |
| 2 | Gửi: `search KB: personalized rules` | LLM VẪN nhận được tool schema (wiring không phụ thuộc trạng thái server — UC-04 precondition) |
| 3 | Quan sát tool call | tool call xảy ra; result là text `Error invoking mem_search: MCP Server is not running.` hiển thị như text thường trong reply |
| 4 | Quan sát chat | LLM trả lời graceful (vd gợi ý start server); chat KHÔNG crash, KHÔNG treo, cursor không blink vô hạn |
| 5 | Gửi 1 câu không cần tool (vd "hello") | chat trả lời bình thường (turn không bị hỏng bởi error trước) |

**Test Data:** testdata/uat-steps.csv (E2E-UI-02).
**Postcondition:** server vẫn stopped (dành cho E2E-UI-04).

---

### E2E-UI-03: UAT — debug log xác nhận wiring cả 2 path

| Field | Value |
|-------|-------|
| **ID** | E2E-UI-03 |
| **Priority** | P2 |
| **Type** | Functional — **Manual UAT** (findings §5 step 3) |
| **Requirement** | AC-1, AC-6 (wiring evidence); BRD §10 step 3 |
| **Precondition** | Extension Development Host với output channel debug ([PiWorkflowAdapter] / [PiSessionHost]) |
| **Evidence** | documents/SA4E-364/evidence/E2E-UI-03-debug-logs.png |

**Steps:**

| Step | Action | Expected |
|------|--------|----------|
| 1 | Bật debug logs; mở SDLC CHAT; gửi 1 message đi qua session path | log `[PiSessionHost] tool allowlist: N names` — N bao gồm 4 bridge names (hoặc bridge names xuất hiện trong allowlist) |
| 2 | Ép legacy path (nếu có thể — session fail) hoặc đọc log adapter turn | log `[Chat] turn via=legacy ... tools=M` — M tăng +4 so với trước fix (không có collision) |
| 3 | Ghi nhận | KHÔNG có log `bridge tool skipped (exists)` trong môi trường sạch (chỉ xuất hiện khi collision thật) |

**Test Data:** testdata/uat-steps.csv (E2E-UI-03).
**Postcondition:** —

---

### E2E-UI-04: UAT — recovery: server start lại giữa conversation → tool call kế tiếp thành công

| Field | Value |
|-------|-------|
| **ID** | E2E-UI-04 |
| **Priority** | P3 |
| **Type** | Reliability — **Manual UAT** (EF-1 UC-04) |
| **Requirement** | AC-4, UC-04 EF-1 |
| **Precondition** | ngay sau E2E-UI-02 (server stopped, conversation còn mở) |
| **Evidence** | documents/SA4E-364/evidence/E2E-UI-04-recovery.png |

**Steps:**

| Step | Action | Expected |
|------|--------|----------|
| 1 | Start lại MCP server (không reload window, không mở lại chat) | badge/log xác nhận running |
| 2 | Gửi lại: `search KB: personalized rules` | tool call THÀNH CÔNG ngay lần đầu; MCP_TOOL_RESULT hiển thị kết quả |
| 3 | Quan sát | KHÔNG cần restart chat/extension — recovery in-place |

**Test Data:** testdata/uat-steps.csv (E2E-UI-04).
**Postcondition:** —

---

### SIT-01: Full suite regression — npm test toàn bộ pass

| Field | Value |
|-------|-------|
| **ID** | SIT-01 |
| **Priority** | P1 |
| **Type** | Regression — Automated (vitest run) |
| **Requirement** | AC-6, FR-08, BR-01/BR-03 (suite hiện có); BRD Success Metrics #1 |
| **Precondition** | Phase A pass; extension/ deps installed; working tree sạch các hunk SA4E-THINKING |

**Steps:**

| Step | Action | Expected |
|------|--------|----------|
| 1 | `cd extension && npm test` | exit code 0; 0 fail, 0 skip mới |
| 2 | Kiểm tra file trọng điểm xanh | mcp-bridge-extension.test.ts; tool-loadout-roles/invariants/cap/estimator.test.ts; pi-agent-session-host.test.ts; adapter-legacy-governance.test.ts; mcp-bridge.test.ts |
| 3 | Kiểm tra regression bảo mật hiện có | các test SEC-324-03 (allowlist/deny dynamic/approval/audit) trong mcp-bridge-extension.test.ts vẫn pass — wiring không làm hỏng lớp bảo vệ cũ |
| 4 | Ghi kết quả | tổng số tests passed/failed vào TEST-REPORT |

**Test Data:** testdata/uat-steps.csv (SIT-01).
**Postcondition:** —

---

### SIT-02: Build pass — tsc 0 lỗi

| Field | Value |
|-------|-------|
| **ID** | SIT-02 |
| **Priority** | P1 |
| **Type** | Regression — Automated (tsc) |
| **Requirement** | FR-01 (signature compile), AC-6 |
| **Precondition** | như SIT-01 |

**Steps:**

| Step | Action | Expected |
|------|--------|----------|
| 1 | `cd extension && npm run build` | exit 0; 0 TS error |
| 2 | Verify export | `buildMcpBridgeAgentTools` xuất hiện trong compile output (out/ hoặc d.ts) — signature khớp FSD §3.5.1 |

**Test Data:** testdata/uat-steps.csv (SIT-02).
**Postcondition:** —

---

### SIT-03: Invariant governance + hành vi hiện có giữ nguyên (N-1, N-7, N-8)

| Field | Value |
|-------|-------|
| **ID** | SIT-03 |
| **Priority** | P2 |
| **Type** | Non-Functional — Automated (trong suite run SIT-01) |
| **Requirement** | AC-5 (N-1), FR-06 (N-7), N-8 (0 thay đổi hành vi hiện có) |
| **Precondition** | SIT-01 đã chạy |

**Steps:**

| Step | Action | Expected |
|------|--------|----------|
| 1 | Xác nhận tool-loadout-invariants.test.ts pass | invariant `schemaTokenCap = floor(staticBudget × 0.25)` giữ nguyên (N-1) |
| 2 | Xác nhận audit tests (mcp-bridge-extension.test.ts phần audit) pass | audit ghi mọi decision, không log param values (N-7) |
| 3 | Xác nhận skeleton/context-usage tests (SA4E-360/SA4E-355) pass | listAvailableTools meter + skeleton enrichment không đổi (N-8, OI-05) |
| 4 | Đối chiếu số test mới | tổng số test tăng đúng bằng số case STC mới thêm (PBT+UT+IT); không test nào bị bỏ/xóa |

**Test Data:** testdata/uat-steps.csv (SIT-03).
**Postcondition:** —

---

## 4. CSV Test Data

Toàn bộ 30/30 TC ID xuất hiện trong ít nhất 1 file tại `documents/SA4E-364/testdata/`:

| File | Nội dung | TCs covered |
|------|----------|-------------|
| bridge-tool-inventory.csv | 5 tool bridge: tên, required params, approval?, opt-in expectation | UT-01, UT-02, UT-11, UT-12, PBT-01 |
| bridge-tool-call-params.csv | Params JSON + expected text/details/error cho execute path (valid + EC-1..EC-7 + boundary 4000/4001) | UT-03, UT-13..UT-18, IT-01, IT-02 |
| wiring-merge-scenarios.csv | Legacy/session wiring scenarios (collision, ext rỗng, customTools, type-guard) | UT-04..UT-07, IT-03, PBT-02 |
| loadout-role-scenarios.csv | Role/phase × bridge names → expected kept/dropped + schemaTokens | UT-08, UT-09, UT-10 |
| uat-steps.csv | 4 manual UAT + 3 SIT steps + evidence paths | E2E-UI-01..04, SIT-01..03 |

---

## 5. Ghi chú cho DEV/QA (sync pass)

1. **Thứ tự implement test gợi ý:** UT-01..03 (nền tảng) → UT-11..12 (AC-3) → UT-13..18 (error contract) → UT-04..05 (legacy) → UT-06..10 (session) → IT-01..03 → PBT-01..02.
2. **Nếu DEV đặt tên helper khác** (vd gộp merge vào hàm riêng) → cập nhật Target file/Seam trong STC, giữ nguyên assert intent.
3. **Cấm "test pass ảo":** UT-04/UT-06 phải assert qua seam thật (executeTurn input / createAgentSession input), không gọi lại hàm build rồi tự assert mảng tự tạo.
4. **AC-3:** nhắc lại lần 3 — assert trên tool registry/build output; DISCOVERY_TOOLS luôn chứa tên execute_dynamic_tool → assert trên allowlist string là SAI.
5. **TDD cross-check ĐÃ XONG** (TDD.md ra mắt giữa chừng — xem STP §1.5.1): target files + module mock name đã sync; 8/10 điểm aligned, 2 deviation đã sửa. Test intent + counts 30 TCs KHÔNG đổi.
