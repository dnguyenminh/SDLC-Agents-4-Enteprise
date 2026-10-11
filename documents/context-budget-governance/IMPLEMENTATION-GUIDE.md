# Implementation Guide — Context Budget Governance cho Pi Harness

> Tài liệu hướng dẫn chi tiết để một AI/dev khác thực hiện. Mục tiêu: pipeline chạy được trên LLM context nhỏ (~32k), scale linh hoạt theo n_ctx thực tế của model. Nguyên tắc tối thượng: **wire các cơ chế đã có sẵn + có test, KHÔNG tạo workaround mới.**

## 0. Bối cảnh & Root Cause (đọc trước khi code)

### 0.1 Triệu chứng
```
400: request (67468 tokens) exceeds the available context size (65536 tokens)
type: exceed_context_size_error, n_prompt_tokens: 67468, n_ctx: 65536
```
Xảy ra ngay turn 1, trước khi agent đọc bất kỳ file code nào.

### 0.2 Engine thật đang chạy
Pi harness (`@earendil-works/pi-coding-agent` SDK), KHÔNG phải langgraph. Mọi phân tích/sửa đổi phải nhắm vào `extension/src/pi-agent/**` và `extension/src/pi-workflow/**`.

### 0.3 Luồng turn (đã verify)
```
chat-panel-provider.ts
  → pi-workflow-adapter.ts : runTurn → runTurnOnce
      → trySessionTurn()  [SDK path, ƯU TIÊN]
          → pi-agent-session-host.ts : createHost()
              → new piCoding.DefaultResourceLoader({...})   ← ĐIỂM WIRE CHÍNH
              → piCoding.createAgentSession({...})
      → (fallback) engine.executeTurn()  [legacy path]
```

### 0.4 Prompt gửi tới LLM được ghép bởi SDK `DefaultResourceLoader`, gồm:
1. SDK core system prompt (nhỏ)
2. **Toàn bộ `.kiro/steering/*.md` + AGENTS.md** — nạp FULL, không lọc, không cap (~40–60k tokens) ← **thủ phạm nặng nhất**
3. `appendSystemPrompt` (hiện chỉ `buildWorkspaceSystemPrompt`, nhỏ)
4. Conversation history (turn 1 ≈ rỗng)
5. **Tool schemas** (builtin + extension + MCP: jira_*, mem_*, find_tools...) — không cap/filter theo role ← thủ phạm thứ 2

### 0.5 Ba root cause (theo thứ tự tác động)
| # | Root cause | Bằng chứng |
|---|-----------|-----------|
| 1 | Static context (steering + AGENTS.md) nạp full, không budget-gate ở turn 1 | `DefaultResourceLoader` nạp `loadProjectContextFiles()` + steering không cap trong Pi path |
| 2 | Tool schemas không filter theo role | `getSessionToolLoadout()` cố định; MCP tools nạp qua `mcpBridge.listTools()` không cap |
| 3 | n_ctx detect được nhưng không dùng để cắt prompt | `openai-provider.detectContextWindow()` chỉ cập nhật thanh usage UI; `ModelRegistry` là bảng cứng, không có qwen 64k |

### 0.6 Nghịch lý cốt lõi (cơ sở của giải pháp)
Toàn bộ cơ chế đáng lẽ ngăn chặn **đã được viết + có test nhưng CHƯA wired** vào luồng tạo session:
- `context-budget.ts` — `BudgetCalculator`, `ThresholdGate` (REJECT>95%, WARN>85%)
- `prompt-compressor.ts` — `compressPrompt()` (giữ dòng security qua `NON_STRIPPABLE_RE`)
- `role-scope.ts` — `RoleScopeFilter`, `ROLE_SKILL_IDS`
- `agent-configurator.ts` — `ConfiguredResourceLoaderOptions`, skills override, compress, tier
- `model-tier.ts` / `model-router.ts` — `detectModelTier`, `classifyTier` (ngưỡng `SMALL_CONTEXT_WINDOW_THRESHOLD=16384`)
- `session-compactor.ts` — wired 1 phần ở chat-panel (post-turn, chỉ history)

→ **Fix = wire các cơ chế này vào đúng điểm, không viết hack mới.**

### 0.7 Điểm wire quyết định — SDK đã expose đủ hook
`DefaultResourceLoaderOptions` (xem `node_modules/@earendil-works/pi-coding-agent/dist/core/resource-loader.d.ts`) cung cấp:
```ts
interface DefaultResourceLoaderOptions {
  cwd: string;
  agentDir: string;
  systemPrompt?: string;
  appendSystemPrompt?: string[];
  noContextFiles?: boolean;
  noSkills?: boolean;
  // --- CÁC HOOK CẦN DÙNG ---
  skillsOverride?:        (base) => { skills; diagnostics };
  agentsFilesOverride?:   (base) => { agentsFiles: Array<{path; content}> };
  systemPromptOverride?:  (base: string | undefined) => string | undefined;
  appendSystemPromptOverride?: (base: string[]) => string[];
  // ...
}
```
`createHost()` ở `pi-agent-session-host.ts` đã khởi tạo loader này nhưng **chưa truyền override nào**. Đây là nơi cắm toàn bộ giải pháp.

## 1. Files liên quan (bản đồ sửa đổi)

| File | Vai trò | Cần làm |
|------|---------|---------|
| `extension/src/pi-workflow/pi-agent-session-host.ts` | Tạo session + loader + tool allowlist | **Sửa chính** — wire overrides + budget gate |
| `extension/src/pi-workflow/pi-workflow-adapter.ts` | Điều phối turn, có `detectContextWindowEarly()` | Đảm bảo detect n_ctx trước createHost |
| `extension/src/pi-agent/context-budget.ts` | BudgetCalculator/ThresholdGate (chưa wired) | Dùng lại; mở rộng nếu cần |
| `extension/src/pi-agent/model-registry.ts` | Bảng n_ctx cứng | Thêm entry "qwen"; dùng làm fallback |
| `extension/src/pi-agent/role-scope.ts` | RoleScopeFilter (chưa wired) | Dùng lại |
| `extension/src/pi-agent/prompt-compressor.ts` | compressPrompt (chưa wired) | Dùng lại |
| `extension/src/pi-agent/model-tier.ts` / `model-router.ts` | Tiering (chưa wired) | Dùng lại |
| `extension/src/mcp/providers/openai-provider.ts` | detectContextWindow (meta.n_ctx) | Không sửa logic; chỉ đảm bảo được gọi sớm |
| `extension/src/pi-agent/__tests__/` | Test suite (vitest) | Thêm test mới |

**Quy ước code (bắt buộc theo code-standards.md):** file ≤ 200 dòng, hàm ≤ 20 dòng, tách model vào `models/`, SOLID, TSDoc cho public API, không nuốt exception. Module mới nên nhỏ và đơn trách nhiệm.

## 2. Thứ tự thực hiện (7 tasks, test-first)

Mỗi task phải: (a) viết test trước, (b) implement, (c) `npm test` xanh, (d) để lại increment chạy được. KHÔNG nhảy bước.

### Task 1 — Context Budget Resolver (single source of truth cho n_ctx)

**Mục tiêu:** Trả về `ContextBudget` thật từ model đang chạy, scale theo n_ctx detect-được.

**Việc cần làm:**
1. Tạo `extension/src/pi-agent/context-budget-resolver.ts` (hoặc mở rộng `context-budget.ts` nếu không vượt 200 dòng).
2. Model type trong `extension/src/pi-agent/models/` (ví dụ `ContextBudget.ts`):
   ```ts
   export interface ContextBudget {
     nCtx: number;          // n_ctx thật của model
     reserveOutput: number; // dành cho output
     safetyMargin: number;  // bù under-estimation chars/4 cho CJK/Vietnamese
     staticBudget: number;  // ngân sách cho steering+AGENTS+tools
     historyBudget: number; // ngân sách cho conversation history
   }
   ```
3. Thứ tự resolve n_ctx (fallback chain):
   - `provider.getDetectedContextWindow()` (ưu tiên — meta.n_ctx thật)
   - `ModelRegistry.get(modelId)?.contextWindow`
   - default an toàn `8192` — **TUYỆT ĐỐI KHÔNG trả 0** (0 = unbounded = root cause gây tràn)
4. Công thức: `safetyMargin = ceil(nCtx * 0.08)` (bù chars/4 under-estimate với tiếng Việt/CJK). `usable = nCtx - reserveOutput - safetyMargin`. Chia `staticBudget ≈ 70% usable`, `historyBudget ≈ 30% usable` (điều chỉnh theo tier ở Task 6).
5. Thêm entry vào `DEFAULT_MODEL_REGISTRY_ENTRIES` trong `model-registry.ts`:
   ```ts
   { modelId: 'qwen', contextWindow: 32768, maxOutput: 2048, costPer1k: 0, speed: 'medium', thinkingMap: { low: 256, medium: 512, high: 1024 } },
   ```

**Test (`__tests__/context-budget-resolver.test.ts`):**
- n_ctx=32768 (detected) → staticBudget/historyBudget đúng công thức.
- detect fail → dùng registry contextWindow.
- registry miss → default 8192, KHÔNG BAO GIỜ 0/unbounded.
- safetyMargin áp dụng đúng (8%).

**Demo:** Gọi resolver với qwen 32k → log breakdown `{nCtx:32768, reserveOutput, safetyMargin, staticBudget, historyBudget}` chính xác.

### Task 2 — Wire RoleScopeFilter + skills/steering override (static trimming theo role)

**Mục tiêu:** Cắt steering + skills theo role/phase ngay tại điểm tạo session.

**Việc cần làm:**
1. Trong `pi-agent-session-host.ts:createHost()`, lấy `role` + `phase` từ `PipelineState` (đã có qua `executeTurn(state, chatInput, 'sm-agent', ...)`). Truyền `role`/`phase` vào `SessionHostOptions`.
2. Truyền vào `DefaultResourceLoader`:
   ```ts
   skillsOverride: (base) => ({
     ...base,
     skills: new RoleScopeFilter().filterSkills(role, base.skills),
   }),
   appendSystemPromptOverride: (base) => scopedSteering(base, role, phase, budget),
   ```
3. Viết helper `scopedSteering()` (module riêng, ≤200 dòng): map `phase → steering files cần thiết` (ví dụ phase requirements → chỉ phase-1-requirements + shared-*; không nạp phase-2..7). Áp cap theo `budget.staticBudget` (Task 1). Drop theo priority, **giữ dòng security** (dùng `NON_STRIPPABLE_RE` từ prompt-compressor).
4. Giữ fallback an toàn: `RoleScopeFilter.isAllowed()` trả `true` nếu role lạ → không mất skill/tool ngoài ý muốn.

**Test:**
- role=BA → chỉ giữ skills có token ba/brd/fsd/requirement/specification.
- role unknown → giữ tất cả (không hồi quy).
- steering vượt cap → drop low-priority, dòng security sống sót.

**Demo:** Session role=BA log số skills/steering giảm so với role=SM; tổng static tokens giảm rõ.

### Task 3 — Wire prompt-compressor vào AGENTS.md + steering (compression có điều kiện)

**Mục tiêu:** Nén AGENTS.md + steering bằng `compressPrompt()` khi static context vượt budget.

**Việc cần làm:**
1. Truyền `agentsFilesOverride`:
   ```ts
   agentsFilesOverride: (base) => ({
     agentsFiles: base.agentsFiles.map(f => ({
       ...f,
       content: shouldCompress ? compressPrompt(f.content) : f.content,
     })),
   }),
   ```
2. `shouldCompress` quyết định bởi `BudgetCalculator`: chỉ nén khi static đo được > `budget.staticBudget`, hoặc tier = small/compressed (Task 6). Model lớn (budget dư) → KHÔNG nén (giữ nguyên thông tin).
3. Áp compression cho cả steering trong `scopedSteering()` (Task 2) cùng điều kiện.

**Test:**
- AGENTS.md có `<!-- -->`, example blocks → compressed nhỏ hơn; dòng "security/never/do not/important/warning" sống sót (`NON_STRIPPABLE_RE`).
- budget dư → `compressPrompt` KHÔNG được gọi (content nguyên vẹn).

**Demo:** qwen 32k → AGENTS.md+steering giảm X% tokens; model 128k → không nén.

### Task 4 — Tool loadout filtering theo role + cap schema

**Mục tiêu:** Giảm số tool schema nạp vào prompt theo role, có cap.

**Việc cần làm:**
1. Mở rộng `getSessionToolLoadout()` thành role-aware: map role → nhóm tool cần thiết. LUÔN giữ core file tools (`read/write/edit/grep/find/ls/shell`) + `find_tools`/`execute_dynamic_tool` (để discover tool ngoài loadout khi cần — đúng pattern `tool-usage-dynamic`).
   - BA/SA: không cần git/deploy tools.
   - DEV/DevOps: cần git/build/deploy.
2. Với MCP tools (jira_*, mem_*...): áp cap + ưu tiên theo phase. Đo schema tokens bằng `estimateTokenCount`/`estimateToolSchemaTokens`, trừ vào `staticBudget`.
3. Nếu loadout thiếu tool mà agent cần → agent dùng `find_tools` + `execute_dynamic_tool` (không nạp sẵn full schema).

**Test:**
- role=BA → loadout không chứa deploy tools, luôn chứa core + find_tools.
- role=DEV → chứa git/build tools.
- tổng tool schema tokens ≤ cap.

**Demo:** Session SM vs DEV có loadout khác nhau; tool schema tokens ≤ cap.

### Task 5 — Budget Gate trước khi tạo/gửi session (fail-safe)

**Mục tiêu:** Không bao giờ gửi prompt tràn n_ctx; escalate hoặc báo lỗi actionable.

**Việc cần làm:**
1. Đảm bảo `detectContextWindowEarly()` chạy **TRƯỚC** `createHost()` assemble static context (gọi trong `runTurnOnce` hoặc đầu `createHost` nếu chưa detect).
2. Sau khi assemble static (system + steering + AGENTS + tools), dùng `BudgetCalculator` + `ThresholdGate` (`context-budget.ts`) đo tổng.
3. Nếu static > `staticBudget`, escalate theo thứ tự:
   1. Bật tier compressed (Task 3/6)
   2. Drop steering priority thấp nhất (Task 2)
   3. Giảm tool loadout xuống min (Task 4)
4. Nếu vẫn vượt tuyệt đối → emit `chat:error` actionable (KHÔNG gửi request):
   ```
   PI_CONTEXT_BUDGET_EXCEEDED: static context {N} tokens vượt budget {M}
   cho model n_ctx={K}. Giảm steering/tools hoặc dùng model context lớn hơn.
   ```
   → Thay thế lỗi 400 `exceed_context_size_error` khó hiểu.

**Test:**
- static vượt budget → escalate đúng thứ tự compressed → drop steering → min tools.
- vượt tuyệt đối → trả `PI_CONTEXT_BUDGET_EXCEEDED`, KHÔNG gọi provider.
- detect n_ctx chạy trước gate.

**Demo:** Ép steering lớn + n_ctx=8k → gate kích hoạt, hiển thị lỗi actionable thay vì 400.

### Task 6 — Model Tiering (scale theo context size)

**Mục tiêu:** Điều chỉnh mức compression + loadout theo tier model (hoàn tất "scale linh hoạt").

**Việc cần làm:**
1. Wire `detectModelTier(modelId)` + `classifyTier(contextWindow)` (ngưỡng `SMALL_CONTEXT_WINDOW_THRESHOLD=16384`).
2. Mapping hành vi:
   - small (≤16384): compressed variant + role-scoped tối đa + loadout tối thiểu + staticBudget nghiêng về tools/steering tối giản.
   - medium: nới compression, loadout vừa.
   - large (≥128k): no compression, loadout đầy đủ.
3. Budget resolver (Task 1) nhận tier để chọn chế độ.
4. **KHÔNG tự đổi model** (tránh ngạc nhiên) — chỉ đổi mức compression/scope theo context size của model user đã chọn.

**Test:**
- contextWindow=8192 → small mode (compressed + min loadout).
- 32768 → medium/small theo ngưỡng.
- 128000 → large (no compression, full loadout).

**Demo:** Cùng codebase, switch 8k/32k/128k → mức compression + loadout tự điều chỉnh, không tràn.

### Task 7 — Integration test harness + Manual E2E qwen 32k

**Mục tiêu:** Chứng minh end-to-end "chạy được trên 32k" + không hồi quy.

**Việc cần làm:**
1. Integration test `__tests__/context-governance.integration.test.ts`: dựng session giả lập n_ctx ∈ {8192, 32768, 128000}, assert tổng prompt (static + tool + 1 user msg) < budget tương ứng.
2. Regression test: role=SM full pipeline KHÔNG mất tool thiết yếu.
3. Manual E2E checklist (ghi vào tài liệu):
   - Cấu hình qwen local n_ctx=32768 (hoặc 65536) qua llama-server.
   - Chọn model qwen trong UI.
   - Gửi "Hãy review source code".
   - **Pass:** không còn `exceed_context_size_error`; thanh context usage phản ánh đúng; agent chạy được turn 1 + tool call đầu tiên.
4. Dọn mọi file tạm tạo khi test.

**Demo:** `npm test` xanh cho suite context-governance + E2E manual qwen 32k gửi review không tràn context.

## 3. Verification tổng

- **Build:** chạy `tsc` / build extension sau mỗi task; sửa lỗi compile trước khi tiếp.
- **Unit/Integration:** `npm test` (vitest, config `vitest.config.ts`). Mỗi task phải xanh.
- **Manual E2E:** qwen 32k thật qua UI (Task 7).
- **An toàn:** không sửa production config, không commit secret. Tạo branch theo convention nếu commit.

## 4. Checklist Definition of Done

- [ ] n_ctx thật được resolve và dùng để tính budget (không bao giờ unbounded/0).
- [ ] "qwen" có trong ModelRegistry làm fallback.
- [ ] Steering + skills + tools scoped theo role/phase.
- [ ] AGENTS.md + steering nén có điều kiện, dòng security sống sót.
- [ ] Budget gate chặn prompt tràn, trả lỗi actionable thay vì 400.
- [ ] Tiering điều chỉnh hành vi theo context size (8k/32k/128k).
- [ ] Integration test 3 context size pass + regression SM pass.
- [ ] Manual E2E qwen 32k: "Hãy review source code" không tràn context.
- [ ] Mọi thay đổi là wire cơ chế có sẵn — không workaround mới.
- [ ] Code tuân code-standards (≤200 dòng/file, ≤20 dòng/hàm, SOLID, TSDoc, không nuốt exception).

## 5. Cảnh báo cho AI thực hiện

1. **Đừng nhắm vào langgraph** (`extension/out/langgraph/**`) — engine đó KHÔNG chạy. Chỉ sửa Pi harness.
2. **Đừng viết compressor/budget/tier/role-filter mới** — chúng đã tồn tại trong `pi-agent/`. Nhiệm vụ là WIRE.
3. **Điểm wire = `DefaultResourceLoader` options trong `createHost()`** + budget gate quanh nó.
4. **Đọc code trước khi sửa.** Verify chữ ký thực tế của `RoleScopeFilter.filterSkills`, `compressPrompt`, `BudgetCalculator`, `detectModelTier`, và `DefaultResourceLoaderOptions` trong `.d.ts` trước khi gọi.
5. **Giữ fallback an toàn:** role lạ → không mất tool; detect fail → registry → default 8192.
