# Evidence — Scratchpad, eviction & ngân sách token thật

**Luồng:** Ghi chú làm việc bắt buộc trước mỗi lượt gọi công cụ · tự động loại bỏ nội dung cũ · đếm token bằng tokenizer thật của model
**ES / AC:** ES-10 (scratchpad + S_evict), ES-11 (runtime token budget), AC-17 (tokenizer thật)
**Transcript gốc:** [`evidence/.raw-scratchpad.txt`](.raw-scratchpad.txt) (3 file / 17 test) · [`evidence/.raw-tokenbudget.txt`](.raw-tokenbudget.txt) (9 file / 54 test)
**Nơi chạy:** worktree `SA4E-411` — `…\SA4E-411\backend` và `…\SA4E-411\extension`

---

## 1. Lệnh đã chạy

| # | Exact command | Working dir | Timestamp transcript | Exit code | Kết quả lần chạy lại |
|---|---------------|-------------|----------------------|-----------|----------------------|
| 1 | `npx vitest run src/engine/scratchpad/__tests__/scratchpad.test.ts src/engine/scratchpad/__tests__/eviction.test.ts src/engine/scratchpad/__tests__/token-eviction.integration.test.ts --reporter=verbose` | `backend/` | `2026-11-16T01:52:06+07:00` | **0** | `Test Files 3 passed (3)` · `Tests 17 passed (17)` · `Duration 600ms` |
| 2 | `npx vitest run src/pi-agent/__tests__/acceptance-ac17.test.ts src/pi-agent/__tests__/session-budget-gate.test.ts src/pi-agent/__tests__/budget-gate-runtime-count.test.ts src/pi-agent/__tests__/budget-gate-escalation.test.ts src/pi-agent/__tests__/budget-gate-enforce.test.ts src/pi-agent/__tests__/budget-gate-decisions.test.ts src/pi-agent/__tests__/context-budget-resolver.pbt.test.ts src/pi-agent/__tests__/runtime-tokenizer.test.ts src/pi-agent/__tests__/token-eviction.integration.test.ts --reporter=verbose` | `extension/` | `2026-11-16T01:54:09+07:00` | **0** | `Test Files 9 passed (9)` · `Tests 54 passed (54)` · `Duration 1.98s` |

Timestamp capture exit code cho cả 2 lệnh: `2026-11-16T02:49:31+07:00`.

---

## 2. Output thật — scratchpad & eviction (`.raw-scratchpad.txt`)

```
 RUN  v4.1.12 C:/Users/ASUS/orca/workspaces/SDLC-Agents-4-Enterprise/SA4E-411/backend

 ✓ src/engine/scratchpad/__tests__/scratchpad.test.ts > SA4E-421 scratchpad format > parses all 4 sections + structured DeadEnds/Facts items 3ms
 ✓ src/engine/scratchpad/__tests__/scratchpad.test.ts > SA4E-421 scratchpad format > round-trips through render (parse → render → parse) 0ms
 ✓ src/engine/scratchpad/__tests__/scratchpad.test.ts > SA4E-421 scratchpad format > validation: missing sections / multi-sentence goal / no block → invalid 0ms
 ✓ src/engine/scratchpad/__tests__/scratchpad.test.ts > SA4E-421 scratchpad format > enforced before each tool call (AC): valid tail passes, missing block throws 1ms
 ✓ src/engine/scratchpad/__tests__/scratchpad.test.ts > SA4E-421 scratchpad format > extracts scratchpad-referenced evidence IDs (eviction-exempt, AC) 0ms
 ✓ src/engine/scratchpad/__tests__/token-eviction.integration.test.ts > SA4E-428 scratchpad + eviction under budget pressure > parses the scratchpad and derives the exemption set from evidence refs 2ms
 ✓ src/engine/scratchpad/__tests__/token-eviction.integration.test.ts > SA4E-428 scratchpad + eviction under budget pressure > score formula is exact and protects referenced/in-use entries 0ms
 ✓ src/engine/scratchpad/__tests__/token-eviction.integration.test.ts > SA4E-428 scratchpad + eviction under budget pressure > evicts the un-referenced oldest prefix, keeps scratchpad evidence, no overflow 1ms
 ✓ src/engine/scratchpad/__tests__/token-eviction.integration.test.ts > SA4E-428 scratchpad + eviction under budget pressure > no pressure → no eviction even with a scratchpad exemption set 0ms
 ✓ src/engine/scratchpad/__tests__/eviction.test.ts > SA4E-421 eviction score > S_evict = age×200 + tokens − referenced×1000 (exact formula) 2ms
 ✓ src/engine/scratchpad/__tests__/eviction.test.ts > SA4E-421 batch eviction at 75% budget > below threshold → no eviction, batchTriggered=false 1ms
 ✓ src/engine/scratchpad/__tests__/eviction.test.ts > SA4E-421 batch eviction at 75% budget > at 75% trigger → batch evicts highest-score first down to 70% target (AC) 0ms
 ✓ src/engine/scratchpad/__tests__/eviction.test.ts > SA4E-421 batch eviction at 75% budget > tombstone preserves tool_call_id and clears content (AC) 0ms
 ✓ src/engine/scratchpad/__tests__/eviction.test.ts > SA4E-421 batch eviction at 75% budget > exempts scratchpad-referenced evidence IDs (AC) 1ms
 ✓ src/engine/scratchpad/__tests__/eviction.test.ts > SA4E-421 batch eviction at 75% budget > never evicts code currently in use (AC) 0ms
 ✓ src/engine/scratchpad/__tests__/eviction.test.ts > SA4E-421 batch eviction at 75% budget > referenced-in-last-thought gets −1000 credit (evicted later than unreferenced peer) 0ms
 ✓ src/engine/scratchpad/__tests__/eviction.test.ts > SA4E-421 batch eviction at 75% budget > all-exempt history: nothing evictable, tokens unchanged 0ms

 Test Files  3 passed (3)
      Tests  17 passed (17)
   Start at  01:52:06
   Duration  678ms (transform 68ms, setup 38ms, import 164ms, tests 17ms, environment 0ms)
```

---

## 3. Output thật — ngân sách token (`.raw-tokenbudget.txt`, trích các dòng định lượng)

```
 RUN  v4.1.12 C:/Users/ASUS/orca/workspaces/SDLC-Agents-4-Enterprise/SA4E-411/extension

 ✓ src/pi-agent/__tests__/context-budget-resolver.pbt.test.ts > resolveContextBudget property-based tests (STC-300/301/302) > STC-302: BR-03 — split invariants hold for every n in [1, 1,000,000] 0ms
 ✓ src/pi-agent/__tests__/context-budget-resolver.pbt.test.ts > resolveContextBudget property-based tests (STC-300/301/302) > STC-302 spot anchors: 8192 → {656, 3875, 1661}; 32768 → {2622, 19668, 8430} 0ms
stdout | src/pi-agent/__tests__/budget-gate-runtime-count.test.ts > SA4E-422 session gate uses runtime count (real tokenizer drives decisions) > runtime count over budget TRIGGERS the escalation ladder (decision driven by real count)
{"level":"info","msg":"Context budget resolved","modelId":"qwen","source":"provider","nCtx":32768,"reserveOutput":2048,"safetyMargin":2622,"staticBudget":19668,"historyBudget":8430,"timestamp":"2026-11-15T18:54:10.539Z"}
{"level":"info","msg":"PI_GATE_DECISION","decision":"ALLOW","usagePercent":12.29,"staticTokens":1979,"escalations":[],"timestamp":"2026-11-15T18:54:10.541Z"}
{"level":"info","msg":"PI_GATE_ESCALATION","step":"compress","staticTokens":1979,"timestamp":"2026-11-15T18:54:10.541Z"}
{"level":"info","msg":"PI_GATE_DECISION","decision":"ALLOW","usagePercent":12.29,"staticTokens":1979,"escalations":["compress"],"timestamp":"2026-11-15T18:54:10.541Z"}

stderr | src/pi-agent/__tests__/budget-gate-runtime-count.test.ts > SA4E-422 session gate uses runtime count (real tokenizer drives decisions) > REJECT when even the escalation ladder cannot fit the content (fail-safe)
{"level":"info","msg":"PI_GATE_ESCALATION","step":"compress","staticTokens":76976,"timestamp":"2026-11-15T18:54:10.542Z"}
{"level":"info","msg":"PI_GATE_ESCALATION","step":"drop-steering","staticTokens":76976,"timestamp":"2026-11-15T18:54:10.543Z"}
{"level":"info","msg":"PI_GATE_ESCALATION","step":"min-loadout","staticTokens":76886,"timestamp":"2026-11-15T18:54:10.543Z"}
{"level":"info","msg":"PI_GATE_DECISION","decision":"REJECT","usagePercent":240.89,"staticTokens":76886,"escalations":["compress","drop-steering","min-loadout"],"timestamp":"2026-11-15T18:54:10.543Z"}
{"level":"error","msg":"PI_CONTEXT_BUDGET_EXCEEDED","staticTokens":76886,"staticBudget":19668,"nCtx":32768,"timestamp":"2026-11-15T18:54:10.543Z"}

stdout | src/pi-agent/__tests__/budget-gate-runtime-count.test.ts > … > qwen 32k breakdown: real count just under budget → initial measurement is the real one (AC5)
{"level":"info","msg":"PI_GATE_DECISION","decision":"ALLOW","usagePercent":66.12,"staticTokens":19618,"escalations":[],"timestamp":"2026-11-15T18:54:10.543Z"}

 ✓ src/pi-agent/__tests__/budget-gate-enforce.test.ts > … > STC-206: 8k model, huge dense static → throws the EXACT actionable message 3ms
 ✓ src/pi-agent/__tests__/budget-gate-enforce.test.ts > … > STC-207: original incident 67,468 tokens vs n_ctx=65,536 → REJECT — the 400 is structurally impossible 0ms
 ✓ src/pi-agent/__tests__/budget-gate-enforce.test.ts > … > STC-201: degenerate n_ctx=2048 (staticBudget 0) → REJECT with actionable message 0ms
 ✓ src/pi-agent/__tests__/budget-gate-enforce.test.ts > … > ALLOW and WARN never throw 0ms
 ✓ src/pi-agent/__tests__/budget-gate-decisions.test.ts > … > STC-011: qwen 32k with static 7,000 tokens → ALLOW, zero escalation events 3ms
 ✓ src/pi-agent/__tests__/budget-gate-decisions.test.ts > … > STC-012: n_ctx=10,000 with static 7,200 → 92% WARN — proceeds, warning logged 1ms
 ✓ src/pi-agent/__tests__/budget-gate-decisions.test.ts > … > STC-310/401 boundary: static 6500 → ALLOW 0ms
 ✓ src/pi-agent/__tests__/budget-gate-decisions.test.ts > … > STC-310/401 boundary: static 6501 → WARN 0ms
 ✓ src/pi-agent/__tests__/budget-gate-decisions.test.ts > … > STC-310/401 boundary: static 7500 → WARN 0ms
 ✓ src/pi-agent/__tests__/budget-gate-decisions.test.ts > … > STC-310/401 boundary: static 7501 → REJECT 0ms
 ✓ src/pi-agent/__tests__/token-eviction.integration.test.ts > SA4E-428 token budget across model tiers (real resolver + tokenizer) > 8192 → 'small': real count fits staticBudget, no overflow 2ms
 ✓ src/pi-agent/__tests__/token-eviction.integration.test.ts > SA4E-428 token budget across model tiers (real resolver + tokenizer) > 32768 → 'medium': real count fits staticBudget, no overflow 0ms
 ✓ src/pi-agent/__tests__/token-eviction.integration.test.ts > SA4E-428 token budget across model tiers (real resolver + tokenizer) > 128000 → 'large': real count fits staticBudget, no overflow 0ms
 ✓ src/pi-agent/__tests__/token-eviction.integration.test.ts > SA4E-428 budget gate escalation (real session gate) > escalates compress → drop-steering → min-loadout and lands under budget 1ms
 ✓ src/pi-agent/__tests__/token-eviction.integration.test.ts > SA4E-428 budget gate escalation (real session gate) > exhausted ladder → actionable PI_CONTEXT_BUDGET_EXCEEDED (no provider call) 0ms
 ✓ src/pi-agent/__tests__/token-eviction.integration.test.ts > SA4E-428 role-scope token reduction > role filter drops out-of-role skills; unknown role fails open 1ms
 ✓ src/pi-agent/__tests__/token-eviction.integration.test.ts > SA4E-428 role-scope token reduction > scoped steering for a known role measures less static context, security survives 1ms
 ✓ src/pi-agent/__tests__/token-eviction.integration.test.ts > SA4E-428 tool loadout: role filter + schema token cap > BA excludes deploy/git/build tools; DEV keeps them; core+discovery always present 1ms
 ✓ src/pi-agent/__tests__/token-eviction.integration.test.ts > SA4E-428 tool loadout: role filter + schema token cap > explicit cap trims MCP schemas; an unreachable cap flags capExceeded 0ms
 ✓ src/pi-agent/__tests__/runtime-tokenizer.test.ts > SA4E-422 tryRuntimeTokenCount > llama.cpp payload {tokens:[...]} → exact count 2ms
 ✓ src/pi-agent/__tests__/runtime-tokenizer.test.ts > SA4E-422 tryRuntimeTokenCount > fail-open: HTTP error, network throw, timeout, bad payload → null 2ms
 ✓ src/pi-agent/__tests__/acceptance-ac17.test.ts > SA4E-427 AC-17 runtime tokenizer budget > AC-17: real prompt + tool tokens drive the runtime budget decision 3ms
{"level":"info","msg":"Context budget resolved","modelId":"qwen","source":"provider","nCtx":32768,"reserveOutput":2048,"safetyMargin":2622,"staticBudget":19668,"historyBudget":8430,"timestamp":"2026-11-15T18:54:12.017Z"}
{"level":"info","msg":"PI_GATE_DECISION","decision":"ALLOW","usagePercent":25.7,"staticTokens":6375,"escalations":[],"timestamp":"2026-11-15T18:54:12.019Z"}

 Test Files  9 passed (9)
      Tests  54 passed (54)
   Start at  01:54:09
   Duration  2.29s (transform 224ms, setup 0ms, import 944ms, tests 52ms, environment 0ms)
```

---

## 4. Bảng diễn giải

| Dòng output | Người dùng thấy gì | Ý nghĩa |
|-------------|--------------------|---------|
| `parses all 4 sections + structured DeadEnds/Facts items 3ms` | Ghi chú làm việc có **4 mục**: Goal, DeadEnds, Facts, Plan | Agent luôn biết mục tiêu, đường đã chết, sự thật đã tìm, bước kế tiếp |
| `enforced before each tool call (AC): valid tail passes, missing block throws 1ms` | Thiếu khối ghi chú → lệnh **bị chặn** | Không cho agent “quên” mục tiêu giữa chừng |
| `round-trips through render (parse → render → parse) 0ms` | Ghi chú giữ nguyên nội dung qua vòng đọc/ghi | Ghi chú không bị bóp méo khi lưu lại |
| `S_evict = age×200 + tokens − referenced×1000 (exact formula) 2ms` | Công thức ưu tiên loại bỏ **đúng như thiết kế** | Cái nào “cũ + nặng + không còn được nhắc” bị loại trước |
| `at 75% trigger → batch evicts highest-score first down to 70% target (AC) 0ms` | Vượt **75%** ngân sách → loại hàng loạt về mức **70%** | Có “đường đi về” an toàn, không chờ tới lúc vỡ |
| `below threshold → no eviction, batchTriggered=false 1ms` | Dưới 75% → **không** loại gì cả | Không mất context vô ích khi còn dư nhiều |
| `tombstone preserves tool_call_id and clears content (AC) 0ms` | Nội dung bị xoá nhưng **giữ lại mã lượt gọi** | Vẫn truy ngược được “lượt nào đã bị loại” |
| `exempts scratchpad-referenced evidence IDs (AC) 1ms` | Bằng chứng đang được nhắc trong ghi chú → **miễn bị loại** | Không mất đúng thứ agent đang dùng |
| `never evicts code currently in use (AC) 0ms` | Mã đang được dùng → **không bị loại** | An toàn cho luồng đang chạy |
| `referenced-in-last-thought gets −1000 credit` | Mục vừa được nhắc → điểm ưu tiên **−1000** | Ưu tiên giữ thứ vừa dùng |
| `all-exempt history: nothing evictable, tokens unchanged 0ms` | Mọi mục đều được miễn → **không loại gì** | Không phá hỏng trạng thái khi không cần dọn |
| `Context budget resolved … nCtx:32768, reserveOutput:2048, safetyMargin:2622, staticBudget:19668, historyBudget:8430` | Ngân sách được tính từ **n_ctx thật của model**: 32768 → giữ chỗ **2622**, ngân sách tĩnh **19668**, ngân sách lịch sử **8430** | Không dùng bảng token ước lượng — đọc số liệu thật của model đang chạy |
| `STC-302 spot anchors: 8192 → {656, 3875, 1661}; 32768 → {2622, 19668, 8430}` | Với model 8192 token → `{656, 3875, 1661}`; model 32768 → `{2622, 19668, 8430}` | Ngân sách tự co giãn theo model, kiểm chứng bằng property-based test (100 lần chạy) |
| `PI_GATE_DECISION … decision:"ALLOW", usagePercent:12.29, staticTokens:1979, escalations:[]` | Dùng **12.29%**, quyết định **ALLOW**, **không** can thiệp | Lượt hỏi đi bình thường, không bị cắt bớt |
| `PI_GATE_ESCALATION step:"compress"` → `PI_GATE_DECISION … escalations:["compress"]` | Vượt ngân sách → bước 1 **compress** (nén) | Cắt bớt nhưng vẫn giữ câu trả lời đúng |
| `PI_GATE_ESCALATION step:"compress" → "drop-steering" → "min-loadout"` | Bước 2 **drop-steering**, bước 3 **min-loadout** | Thang leo thu gọn dần, đo lại sau mỗi bước |
| `PI_GATE_DECISION … decision:"REJECT", usagePercent:240.89, staticTokens:76886, escalations:["compress","drop-steering","min-loadout"]` | Dùng **240.89%** (76886 token) → **REJECT** | Không gửi lượt hỏi chắc chắn bị lỗi 400 từ provider |
| `PI_CONTEXT_BUDGET_EXCEEDED, staticTokens:76886, staticBudget:19668, nCtx:32768` | Báo lỗi kèm **3 con số** cụ thể | Bạn biết chính xác vượt bao nhiêu và ngân sách là bao nhiêu |
| `STC-207: original incident 67,468 tokens vs n_ctx=65,536 → REJECT — the 400 is structurally impossible` | Vụ lỗi thật (**67.468 token vs 65.536**) nay **bị chặn trước** | Chặn ở tầng extension, không đợi tới lúc provider trả 400 |
| `STC-201: degenerate n_ctx=2048 (staticBudget 0) → REJECT with actionable message` | Model quá nhỏ → báo lỗi **rõ ràng** | Không im lặng hỏi vài trăm token rồi mới vỡ |
| `ALLOW and WARN never throw 0ms` | Ở mức cảnh báo → **không** làm hỏng lượt | Cảnh báo không chặn bạn làm việc |
| `static 6500 → ALLOW` · `6501 → WARN` · `7500 → WARN` · `7501 → REJECT` | Ranh giới quyết định chính xác **6500/6501** và **7500/7501** | Hành vi xác định, không “lúc này lúc kia” |
| `8192 → 'small'` · `32768 → 'medium'` · `128000 → 'large'` | Phân khúc model **small / medium / large** theo `n_ctx` thật | Ngân sách theo đúng cấu hình model của bạn |
| `role filter drops out-of-role skills; unknown role fails open 1ms` | Bộ lọc vai trò loại skill ngoài vai trò; vai trò lạ → **fail open** | Mỗi vai trò chỉ mang phần bối cảnh liên quan |
| `BA excludes deploy/git/build tools; DEV keeps them; core+discovery always present 1ms` | Vai trò BA **không** mang công cụ deploy/git/build; DEV **có** | Không lãng phí token vào công cụ không dùng |
| `explicit cap trims MCP schemas; an unreachable cap flags capExceeded 0ms` | Có **trần** cho schema công cụ MCP; trần không khả thi → cờ `capExceeded` | Bạn được cảnh báo thay vì âm thầm vượt trần |
| `tryRuntimeTokenCount > llama.cpp payload {tokens:[...]} → exact count 2ms` | Tokenizer thật trả về **số token chính xác** | Không còn “ước lượng chars/4” |
| `fail-open: HTTP error, network throw, timeout, bad payload → null 2ms` | Tokenizer lỗi → trả `null` (không ném lỗi) | Lượt hỏi không vỡ chỉ vì tokenizer không kết nối được |
| `AC-17: real prompt + tool tokens drive the runtime budget decision 3ms` + `usagePercent:25.7, staticTokens:6375, decision:"ALLOW"` | AC-17 đạt: quyết định dựa trên token **thật** của prompt + tool (6375 token, 25.7%) | Tiêu chí nghiệm thu ngân sách token được xác nhận |
| `Test Files 3 passed (3)` / `Tests 17 passed (17)` | **17/17** test xanh (scratchpad + eviction) | — |
| `Test Files 9 passed (9)` / `Tests 54 passed (54)` | **54/54** test xanh (ngân sách token) | — |

---

## 5. Phạm vi & giới hạn

- Luồng này không có màn hình UI; evidence là transcript thật của engine trong worktree.
- Số liệu `nCtx / staticBudget / historyBudget` lấy từ provider config `qwen` trong transcript; nếu bạn dùng model khác thì các con số này sẽ khác — công thức thì không đổi.
- `PI_CONTEXT_BUDGET_EXCEEDED` là **mã lỗi hiển thị cho người dùng**, không phải mã nội bộ của API.
