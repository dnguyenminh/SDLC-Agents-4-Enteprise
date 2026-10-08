# [SA4E-339] Review Report & Remediation Instructions for AI Agents

**Ticket:** SA4E-339 — Fix Automatic Session Compaction Hook in ChatPanelProvider
**Review Date:** 2026-10-07
**Review Type:** Multi-agent document review (6 sub-agents, parallel, read-only)
**Overall Verdict:** 🔴 **NOT READY** — 0/8 review units pass sạch; 1 vòng remediation bắt buộc
**Provenance:** Findings do ba-agent / ta-agent / sa-agent / qa-agent / dev-agent / security-agent trả về; SM chỉ tổng hợp, không sửa nội dung.

---

## 0. Cách dùng tài liệu này (BẮT BUỘC đọc trước khi fix)

Tài liệu này là **work order** cho AI agent nhận fix. Mỗi task có:

| Trường | Ý nghĩa |
|---|---|
| **ID** | Định danh duy nhất — dùng khi báo cáo lại (`DEV-01`, `TDD-02`, …) |
| **Severity** | `Critical` (block release) / `Major` (gate fail) / `Minor` (quality) |
| **Owner** | Agent PHẢI là người sửa (xem Responsibility Matrix trong AGENTS.md) |
| **Evidence** | File + line chứng minh — KHÔNG tự suy đoán, mở file kiểm chứng |
| **Fix** | Hướng sửa cụ thể |
| **AC** | Acceptance Criteria — task chỉ DONE khi đủ |
| **Verify** | Command kiểm chứng bắt buộc |

**Quy tắc chống vi phạm:**
1. ❌ Agent KHÔNG được sửa document/task nằm ngoài cột "Creates/Writes" của mình. Nếu task giao sai owner → trả lời `⛔ Outside my scope` và báo SM.
2. ❌ KHÔNG viết workaround / bypass — sửa root cause (xem skill `no-workaround-rule`).
3. ✅ Trước khi sửa document → `mem_search` KB-first; drawio phải hợp lệ XML (`<mxGraphModel>` cân bằng, không Mermaid).
4. ✅ Sau khi fix → chạy `Verify` của task, dán kết quả thật (không được claim suông).

---

## 1. Tổng kết verdict

| Document | Verdict | Critical | Major | Owner sửa |
|---|---|---|---|---|
| BRD.md | 🟡 PASS-with-fixes | 0 | 5 | **ba-agent** |
| FSD.md | 🔴 FAIL | 2 | 6 | **ta-agent** |
| TDD.md | 🔴 FAIL | 1 | 6 | **sa-agent** |
| STP.md | 🔴 FAIL | 2 | 3 | **qa-agent** |
| STC.md | 🔴 FAIL | 0 | 4 | **qa-agent** |
| TEST-REPORT.md | 🔴 FAIL | 2 | 1 | **qa-agent** |
| Security design (FSD §4) | 🟡 PASS-with-fixes | 0 | 3 | sa-agent + qa-agent |
| Implementability (code) | 🔴 FAIL (TDD) / 🟡 PASS (STC) | 3 | 5 | sa-agent + dev-agent |

**Điểm tích cực (giữ nguyên, KHÔNG sửa lung tung):** wiring `SessionCompactor` → `updateContextUsageAfterTurn` khớp ground-truth; security control trong code sound (`formatSummaryMessage` hardcode `role:'user'`); các số 0.95 / 2 / <70% / ≤300ms nhất quán BRD–FSD–TDD–code; 8 drawio XML hợp lệ, 0 Mermaid.

---

## 2. Cross-cutting Critical (đọc trước — ảnh hưởng mọi task)

### XC-1 🔴 Build đang BROKEN
- **Evidence:** `extension/src/chat-panel/chat-panel-provider.ts:224` → `modelId: engine.getDetectedModelId?.() || "default"` báo `TS2339: Property 'getDetectedModelId' does not exist on type ...`
- **Root cause:** TDD thiết kế phantom API `getDetectedModelId()` — grep toàn codebase: **không có định nghĩa nào** (chỉ có `getDetectedContextWindow()` tại `extension/src/pi-workflow/pi-workflow-adapter.ts:168`).
- **Introduced by:** diff SA4E-339 chưa commit (`extension/src/chat-panel/chat-panel-provider.ts`, +34/−1).
- **Resolution:** task **DEV-01** (code) + **TDD-02** (design) phải khớp nhau — xem Quyết định **D-1**.

### XC-2 🔴 TEST-REPORT "19/19 PASSED" không có bằng chứng
- **Evidence:** `documents/SA4E-339/TEST-REPORT.md:13`. Dev-agent chạy verify: đúng 19 test nhưng thuộc `extension/src/chat-panel/__tests__/context-usage-tracker.test.ts` (suite pre-existing của SA4E-182, **0 relation** tới compaction). `rg "SA4E-339|STC-339" extension/src --glob "*.test.ts"` → **0 matches**.
- **Resolution:** task **QA-02** — chỉ được viết lại SAU khi test thật chạy pass (task DEV-03).

### XC-3 🔴 Implementation = partial, không phải done
- Code wiring đúng đường nhưng build đỏ, 0 test của ticket → `STATUS.json` để `implementation: blocked`.
- **Resolution:** DEV-01 → DEV-03 → QA-02 theo đúng thứ tự §5.

### D-1 ⚖️ Quyết định design bắt buộc (SM/ sa + ta đồng thuận TRƯỚC khi fix)
| Tùy chọn | Hành động | Chọn khi |
|---|---|---|
| **D-1a (khuyến nghị)** | Bỏ `getDetectedModelId` — dùng giá trị mặc định hoặc accessor model-id ĐÃ tồn tại (dev tra cứu trước); TDD cập nhật design tương ứng | Không có yêu cầu thật cần modelId |
| **D-1b** | Thêm method `getDetectedModelId()` vào engine/adapter (root-cause fix) + TDD mô tả đầy đủ contract | Compaction thực sự cần modelId (vd. Summarizer chọn model-specific prompt) |

→ Task **TDD-02** và **DEV-01** PHẢI dùng chung một tùy chọn. Chưa chọn → không ai được commit.

### D-2 ⚖️ Quyết định công thức `usageFraction`
- **FSD §2.1** nói `payload.total.tokens / payload.maxTokens`; **TDD §2.3 + code** dùng `normalizeUsageToFraction(payload.total.percentage)` (round → có thể kích hoạt ở 94.5%).
- `normalizeUsageToFraction` ALSO là control **SEC-330-02** (từ chối/normalize giá trị > 1.0) → **khuyến nghị: giữ code, sửa FSD và BRD khớp code** (D-2a). Nếu chọn D-2b (sửa code) thì phải làm lại cả security test.
- Owner quyết định: **ta-agent** (FSD) + **sa-agent** (TDD) đề xuất, **SM** chốt.

---

## 3. Remediation Tasks

### R1 — dev-agent (P0 — làm trước, block cả pipeline)

#### DEV-01 🔴 Critical — Fix build TS2339
- **File:** `extension/src/chat-panel/chat-panel-provider.ts:224`
- **Problem:** `engine.getDetectedModelId?.()` — method không tồn tại trên type → `tsc` fail (optional-call không cứu được property không có trên type).
- **Fix:** Theo Quyết định **D-1**:
  - D-1a: thay bằng giá trị mặc định ổn định (`"default"`) hoặc accessor model-id đã tồn tại (tra cứu engine interface trước — **KHÔNG bịa API mới**).
  - D-1b: bổ sung method thật vào engine interface + adapter (`extension/src/pi-workflow/pi-workflow-adapter.ts`), có contract rõ ràng.
- **AC:** `npm run compile` (tsc -p ./) trong `extension/` exit 0; không còn reference `getDetectedModelId` nào (hoặc đã có định nghĩa thật).
- **Verify:** `cd extension && npx tsc --noEmit` → 0 error.

#### DEV-02 🟠 Major — Giữ nguyên 2 khối logic SA4E-182
- **Evidence:** `chat-panel-provider.ts:191-214` — block đếm **steering tokens** (`steeringCounted`) và **MCP tool definitions** (`toolDefinitionsCounted`).
- **Problem:** TDD §2.3 pseudocode viết lại TOÀN BỘ method → implement literal sẽ **mất 2 khối này** (regression SA4E-182).
- **Fix:** Chỉ chèn khối compaction (sau dòng compute `usageFraction`), KHÔNG xóa 2 block trên. Khi review TDD mới (task TDD-03) phải xác nhận pseudocode thể hiện insertion-point, không phải full replacement.
- **AC:** diff cuối cùng vẫn giữ nguyên `steeringCounted` / `toolDefinitionsCounted` logic.

#### DEV-03 🔴 Critical — Viết unit/integration test cho SA4E-339
- **Dependency:** SAU khi **QA-03** (STC chốt) — viết test đúng spec, không tự bịa case.
- **File đề xuất:** `extension/src/chat-panel/__tests__/chat-panel-provider.compaction.test.ts` (thư mục `__tests__` này ĐÃ tồn tại với 8 test files; STP ghi sai path — xem QA-01).
- **Requirement:** cover tối thiểu STC-339-01…08 (sau khi QA mở rộng), map rõ test name → STC ID.
- **AC:** mọi STC case có ≥1 test thật; `npm test` pass; 0 test skip/only.
- **Verify:** `cd extension && npx vitest run src/chat-panel/__tests__/chat-panel-provider.compaction.test.ts`.

---

### R2 — sa-agent (TDD)

#### TDD-01 🔴 Critical — Thiếu §Security Design
- **Fix:** Thêm section **Security Design** mô tả: SEC-330-01 (summary MUST role `'user'` + prefix `[compaction]`, cấm role `'system'`), SEC-330-02 (usage MUST normalize về `[0,1]`, reject > 1.0), reference tới `formatSummaryMessage` / `normalizeUsageToFraction` trong `extension/src/pi-agent/session-compactor.ts`.
- **AC:** mọi control trong FSD §4 đều có counterpart trong TDD; ID SEC-330-01/02 được trích nguồn (xem TDD-06).

#### TDD-02 🔴 Critical — Phantom API `getDetectedModelId`
- **Evidence:** TDD §2.3 dòng `modelId: engine.getDetectedModelId?.() || "default"` — không tồn tại trong codebase → là nguồn gốc XC-1.
- **Fix:** Theo **D-1** (dùng chung với DEV-01). Nếu D-1a → xóa khỏi pseudocode. Nếu D-1b → bổ sung contract đầy đủ (định nghĩa, return type, khi nào undefined).
- **AC:** pseudocode TDD compile được nếu bấm nguyên si (dev verify).

#### TDD-03 🔴 Critical — Pseudocode vi phạm 20 dòng/function + mất logic SA4E-182
- **Evidence:** TDD §2.3 hàm ~69 dòng; viết lại full method.
- **Fix:** (1) Viết lại dưới dạng **insertion points** + helper functions tách riêng (≤20 dòng/func): ví dụ `buildCompactableSession(...)`, `applyCompactionAndRecount(...)`; (2) thể hiện rõ 2 block SA4E-182 giữ nguyên; (3) giữ guard `setChatHistory` (code thật check `typeof ... === "function"` — TDD mô tả thiếu).
- **AC:** mỗi function trong pseudocode ≤20 dòng; có ghi chú "SA4E-182 blocks preserved (steering + MCP tool counting)".

#### TDD-04 🟠 Major — Thiếu Error Handling / Implementation Checklist / Diagram Index
- **Fix:** Thêm: (a) **Error Handling** — mọi step nằm trong try/catch, lỗi log `debugLog` non-fatal (khớp code `chat-panel-provider.ts:263-265`); (b) **Implementation Checklist** (checkbox theo AC-01…05); (c) **Diagram Index** (bảng Figure → file `.drawio`).
- **AC:** đủ 3 section; checklist map 1-1 sang BRD AC.

#### TDD-05 🟠 Major — Threshold hardcode ≠ FSD `SessionMonitor.shouldCompact()`
- **Evidence:** TDD + code hardcode `usageFraction >= 0.95`; FSD §2.1 yêu cầu `SessionMonitor.shouldCompact(usageFraction)` (API THẬT tồn tại: `session-compactor.ts:74`, threshold `COMPACT_USAGE_THRESHOLD = 0.95` tại dòng 11).
- **Fix:** Khuyến nghị sửa **code + TDD** dùng `SessionMonitor.shouldCompact()` / hằng `COMPACT_USAGE_THRESHOLD` (single source of truth, chống drift); nếu giữ hardcode thì phải sửa FSD tương ứng (thông qua D-2).
- **AC:** không còn magic number `0.95` rải rác — tham chiếu 1 hằng số/API duy nhất; FSD/TDD/code khớp nhau.

#### TDD-06 🟠 Major — Nguồn gốc ID SEC-330 chưa trích dẫn
- **Problem:** SEC-330-01/02 kế thừa từ SA4E-330 nhưng không trích nguồn (vi phạm convention `SEC-{ticket}`).
- **Fix:** Ghi rõ "inherited from SA4E-330 §Security" kèm link document, hoặc đổi sang `SEC-339-01/02` và cập nhật đồng bộ FSD + STC.
- **AC:** ID nhất quán across FSD/TDD/STC + có nguồn gốc.

---

### R3 — ta-agent (FSD)

#### FSD-01 🔴 Critical — Thiếu Use Cases (exception flows)
- **Fix:** Thêm section **Use Cases**最少 các case: UC-01 usage < ngưỡng → không compact; UC-02 usage ≥ 0.95 & >2 messages → compact thành công; UC-03 usage ≥ 0.95 nhưng ≤2 messages → KHÔNG compact; UC-04 engine null → return sớm; UC-05 `compact()` trả action ≠ 'compact' / messages rỗng → giữ nguyên history; UC-06 `setChatHistory` không tồn tại (guard) → skip + log; UC-07 compact thành công nhưng usage vẫn ≥ ngưỡng (summary vẫn lớn) → hành vi?; UC-08 lỗi xảy ra → non-fatal, chat không crash. Mỗi UC có: Actor, Trigger, Main flow, Exception flow, Expected result.
- **AC:** mọi nhánh code trong `updateContextUsageAfterTurn` (dòng 168-266) đều được 1 UC mô tả.

#### FSD-02 🔴 Critical — Thiếu Business Rules table
- **Fix:** Bảng BR-01…BR-0n, mỗi rule có ID, mô tả, `[Implements: AC-0x]`, priority. Ghi tối thiểu: BR ngưỡng 0.95; BR giữ 2 messages (`RECENT_MESSAGES_KEPT`); BR summary <70% target; BR role `'user'` + prefix `[compaction]`; BR normalize `[0,1]`; BR ≤300ms; BR non-fatal error.
- **AC:** mọi BR trace được ≥1 AC; mọi AC có ≥1 BR.

#### FSD-03 🟠 Major — Công thức `usageFraction` lệch code (Quyết định D-2)
- **Fix:** Theo D-2 (khuyến nghị D-2a): sửa §2.1 thành `usageFraction = normalizeUsageToFraction(payload.total.percentage)` với note đây là SEC-330-02 control; xóa công thức `tokens/maxTokens` hoặc ghi là approximation.
- **AC:** FSD == TDD == code về mặt công thức và boundary (94.5% vs 95% — phải nêu rõ behavior thật).

#### FSD-04 🟠 Major — Thiếu API contracts
- **Fix:** Bổ sung: (a) I/O của `SessionCompactor.compact(session: CompactableSession): CompactResult` (input fields, `action`, `tokensSaved`, `session.messages`); (b) contract payload `tab:contextUpdate` (`tabId`, `tokenCount`, `maxTokens`, `breakdown.{conversation,mcpTools,steering}`) — đối chiếu code `chat-panel-provider.ts:250-262`.
- **AC:** dev build test từ contract FSD không cần đoán.

#### FSD-05 🟠 Major — Thiếu Use Case/AC-05 trace + template deviation
- **Fix:** Thêm bảng traceability FSD ↔ BRD AC-01…05; reference AC-05 (test suite) trong scope; trả template chuẩn (header, section numbering).
- **AC:** 5/5 AC có line trong FSD.

#### FSD-06 🟠 Major — Header "Approved" sai sự thật
- **Evidence:** `FSD.md:3` `Status: Approved` trong khi verdict FAIL.
- **Fix:** Đổi sang `Status: Draft (Needs Revision)` và bump version; CẢM ƠN không sửa các header khác trước khi fix xong (BRD/TDD/STP/STC/TEST-REPORT cùng lỗi — owner respective).
- **AC:** không doc nào đang FAIL mà khai `Approved`.

---

### R4 — ba-agent (BRD)

#### BRD-01 🟠 Major — AC-02 từ "exceeds" → ">="
- **Evidence:** `BRD.md:18` "exceeds `COMPACT_USAGE_THRESHOLD` (0.95)" nhưng code/TDD là `>= 0.95`.
- **Fix:** "When total usage fraction is `>= COMPACT_USAGE_THRESHOLD` (0.95, defined in `session-compactor.ts`)".
- **AC:** AC-02 match boundary trong code.

#### BRD-02 🟠 Major — AC-05 trỏ suite không test compaction
- **Evidence:** `BRD.md:21` → `extension/src/__tests__/chat` (folder CÓ thật, 26 files) nhưng không file nào cover compaction.
- **Fix:** Làm rõ: AC-05 = "All tests in `extension/src/__tests__/chat` AND the new `extension/src/chat-panel/__tests__/chat-panel-provider.compaction.test.ts` pass (mapping AC ↔ STC ↔ test name)".
- **AC:** AC-05 có thể verify được sau DEV-03.

#### BRD-03 🟠 Major — Thiếu Dependencies / NFR / Diagram Index
- **Fix:** Thêm: **Dependencies** (`SessionCompactor`, `ContextUsageTracker`, `PiWorkflowAdapter`); **NFR** (latency ≤300ms, non-fatal error, usage sau compact <70%); **Diagram Index** (2 figures → `diagrams/use-case.drawio`, `diagrams/business-flow.drawio`).
- **AC:** đủ 3 section.

#### BRD-04 🟠 Major — Traceability BRD ↔ FSD thiếu
- **Fix:** Thêm bảng trace (AC-01…05 → FSD section → TDD section → STC ID). Owner khác sửa phần của họ, ba-agent giữ bảng ở BRD và báo SM khi thiếu ô.
- **AC:** 5 AC trace đủ 4 cột.

#### BRD-05 🟠 Major — Test path mâu thuẫn với STP
- **Evidence:** BRD AC-05 `__tests__/chat` (tồn tại) vs STP target `chat-panel/__tests__/chat-panel-provider.test.ts` (**không tồn tại**).
- **Fix:** BRD giữ path đúng; STP phải sửa theo (task QA-01) — ba-agent chỉ cần ensure BRD nêu đích danh file test mới.
- **AC:** BRD + STP chỉ ra CÙNG một đường dẫn hợp lệ.

---

### R5 — qa-agent (STP / STC / TEST-REPORT)

#### QA-01 🔴 Critical — STP là stub 19 dòng
- **Evidence:** `STP.md` — 0/6 test levels, không RTM, không entry/exit criteria, target file sai.
- **Fix:** Viết lại STP đầy đủ:
  1. **Test levels** (6): Unit, Integration, System, Regression, Security, Performance — mỗi level: scope, kỹ thuật, tool.
  2. **RTM** (Requirement → Test Case) với AC-01…05 + SEC-330-01/02.
  3. **Entry/Exit criteria.**
  4. **Target path sửa** → `extension/src/chat-panel/__tests__/` (8 files hiện có, gồm `context-usage-tracker.test.ts`) + file test MỚI cho compaction.
  5. **Test diagrams BẮT BUỘC:** `diagrams/test-coverage.drawio` + `diagrams/test-execution-flow.drawio` (drawio-only, XML hợp lệ, export PNG, có trong Diagram Index).
  6. Testdata: `testdata/*.csv`.
- **AC:** exit criteria match "0 test fail + mọi STC map 1-1"; drawio pass XML validation.

#### QA-02 🔴 Critical — TEST-REPORT 19/19 sai sự thật
- **Evidence:** `TEST-REPORT.md:13`; 19 test thực chất là `context-usage-tracker.test.ts` (suite cũ SA4E-182); 0 test chứa `SA4E-339`/`STC-339`.
- **Fix:** **KHÔNG sửa số liệu theo kiểu tăng/giảm** — viết lại SAU DEV-03 với: ngày chạy thật, command thật + output, bảng map `STC ID → test file::test name → PASSED/FAILED`, pass rate tính từ test CỦA ticket. Nếu chưa chạy → Status: `Draft — pending test execution`.
- **AC:** mỗi dòng PASSED trỏ được tới test name verify được; không claim nào không có evidence.

#### QA-03 🔴 Critical — STC thiếu case (chỉ 4 happy-path)
- **Fix:** Mở rộng tối thiểu các case sau (dev sẽ viết test theo STC này):
  | ID | Case | Expected |
  |---|---|---|
  | STC-339-01 | Usage < 80% | Không compact (giữ) |
  | STC-339-02 | Usage ≥ 95%, >2 messages | Compact → Summary + 2 msg, usage < 70% (giữ) |
  | STC-339-03 | Broadcast `tab:contextUpdate` | Payload đúng contract (giữ) |
  | STC-339-04 | `setChatHistory` ném lỗi | Non-fatal, không crash (giữ) |
  | STC-339-05 | **Boundary 0.945 (94.5%)** | Theo behavior đã chốt ở D-2 — nêu rõ |
  | STC-339-06 | **Exactly 2 messages, usage ≥95%** | KHÔNG compact |
  | STC-339-07 | **Engine null** | Return sớm, không throw |
  | STC-339-08 | **`compact()` trả action ≠ compact / messages rỗng** | History giữ nguyên |
  | STC-339-09 | **SEC-330-01**: summary message role | Luôn `'user'` + prefix `[compaction]`, không bao giờ `'system'` |
  | STC-339-10 | **SEC-330-02**: usage input > 1.0 (percent-scale) | Bị normalize/reject theo contract |
  | STC-339-11 | **AC-05 regression**: toàn bộ `__tests__/chat` | 0 fail |
- **Fix kèm:** test data cụ thể (số tokens, số messages — không ghi "large messages" chung chung); thêm `testdata/*.csv`.
- **AC:** mọi AC-01…05 + SEC-330-01/02 có ≥1 STC; không còn input mơ hồ.

#### QA-04 🟠 Major — Thiếu evidence structure trong report
- **Fix:** Template report: Summary → Environment (os, node, vitest version) → Execution log (command + timestamp) → Mapping table → Failures (nếu có) → Verdict. Kèm screenshot/output file nếu có.

---

### R6 — security-agent (re-review — làm SAU R2, R5)

#### SEC-RE-01 🟠 Major — Re-review sau khi TDD có §Security Design
- **Check:** TDD mô tả đủ SEC-330-01/02, role whitelist, prefix `[compaction]`, normalize contract, chống injection/residual text, summary chaining (đã raise ở vòng 1: 5 Minor + 1 Info).
- **AC:**输出 `SECURITY-REVIEW` addendum: PASS / FAIL với findings mới.

#### SEC-RE-02 🟠 Major — Verify STC có security cases
- **Check:** STC-339-09/10 tồn tại và đủ mạnh (test thực sự assert role/prefix/normalize — không chỉ assert "no crash").

---

## 4. Cross-document inconsistencies (owner theo cột cuối)

| # | Mâu thuẫn | Chiều | Resolution | Owner |
|---|---|---|---|---|
| 1 | Test path: BRD `__tests__/chat` ✅ vs STP `chat-panel/__tests__/chat-panel-provider.test.ts` ❌ | BRD ↔ STP | Giữ BRD; STP sửa path về `chat-panel/__tests__/` + nêu file test mới | qa-agent |
| 2 | `usageFraction`: FSD `tokens/maxTokens` vs TDD/code `normalizeUsageToFraction(percentage)` → boundary 95% vs 94.5% | FSD ↔ TDD/code | Quyết định **D-2** (khuyến nghị D-2a: sửa doc khớp code) | ta-agent + sa-agent |
| 3 | FSD yêu cầu `SessionMonitor.shouldCompact()` — code hardcode `0.95` | FSD ↔ code | Task **TDD-05** — dùng API/hằng số duy nhất | sa-agent + dev-agent |
| 4 | ID `SEC-330-01/02` kế thừa SA4E-330 không trích nguồn | FSD ↔ SA4E-330 | Task **TDD-06** | sa-agent |
| 5 | Header "Approved" ở mọi doc trong khi đang review FAIL | Docs ↔ STATUS | Task **FSD-06** +各 owner sửa doc mình | tất cả owner |
| 6 | TDD thiếu guard `setChatHistory` + 2 khối SA4E-182 mà code thật có | TDD ↔ code | Task **TDD-03** | sa-agent |

---

## 5. Thứ tự thực thi (dependency-aware)

```
BƯỚC 0 — Quyết định (blocking): SM chốt D-1, D-2 với sa/ta
   │
BƯỚC 1 — Song song (independent):
   ├── dev-agent   : DEV-01 (fix build), DEV-02 (giữ SA4E-182)
   ├── ta-agent    : FSD-01…FSD-06
   ├── sa-agent    : TDD-01…TDD-06   (dùng D-1/D-2)
   └── ba-agent    : BRD-01…BRD-05
   │
BƯỚC 2 — Sau khi BRD/FSD/TDD chốt:
   └── qa-agent    : QA-01 (STP + diagrams + testdata), QA-03 (mở rộng STC)
   │
BƯỚC 3 — Sau khi STC chốt:
   └── dev-agent   : DEV-03 (viết test thật) → `npm test` green
   │
BƯỚC 4 — Test xong:
   └── qa-agent    : QA-02 (TEST-REPORT với evidence thật), QA-04
   │
BƯỚC 5 — Song song:
   ├── security-agent : SEC-RE-01, SEC-RE-02
   └── dev + qa       : code review (standards vs spec)
   │
BƯỚC 6 — SM re-review → quality gates → cập nhật STATUS.json/RUN-LOG → báo user
```

**Parallelizable:** Bước 1 (4 agent song song). **Không được vượt:** Bước 3 trước Bước 2, Bước 4 trước Bước 5.

---

## 6. Verification commands (dán output THẬT vào báo cáo)

```powershell
# Build (bắt buộc — XC-1)
cd extension; npx tsc --noEmit            # mong đợi: 0 error

# Lint
cd extension; npm run lint

# Tests — toàn bộ suite
cd extension; npm test                     # vitest run

# Tests — của ticket này
cd extension; npx vitest run src/chat-panel/__tests__/chat-panel-provider.compaction.test.ts

# Chứng minh không còn phantom API / claim vô căn cứ
rg -n "getDetectedModelId" extension/src           # D-1a → 0 match (hoặc có definition thật nếu D-1b)
rg -n "SA4E-339|STC-339" extension/src --glob "*.test.ts"   # phải >0 sau DEV-03

# Drawio XML validation (mọi file drawio mới/sửa)
# → có <mxGraphModel> ... </mxGraphModel> cân bằng, không self-closing edge, không Mermaid
```

---

## 7. Definition of Done (cả vòng remediation)

- [x] `npx tsc --noEmit` → 0 error (XC-1 đóng)
- [x] `npm test` → 0 fail, có test map tới mọi STC-339-*
- [x] FSD có Use Cases + Business Rules + contracts; TDD có Security Design + ≤20 dòng/func + insertion-point
- [x] STP đầy đủ 6 levels + RTM + 2 drawio diagrams + testdata CSVs
- [x] TEST-REPORT có evidence thật (command + date + mapping), không claim suông
- [x] 0 doc FAIL nào còn khai `Status: Approved`
- [x] 6 inconsistency trong §4 đã resolved (cột Resolution = done)
- [x] security-agent re-review PASS
- [x] SM re-review → verdict ≥ PASS-with-fixes cho mọi unit → update `STATUS.json` + `RUN-LOG.md`

---

## 8. Agent nhận task — checklist khởi chạy

```
1. Đọc §0 (quy tắc scope) + §3 task của MÌNH (bỏ qua task khác).
2. Đọc Evidence trước khi sửa — mở file, đối chiếu line.
3. Nếu task thuộc owner khác → trả lời: "⛔ Outside my scope. Correct agent: {tên}".
4. Fix → chạy Verify §6 → dán output thật vào report trả về cho SM.
5. Ghi nhận KB: mem_ingest_file(documents/SA4E-339/{DOC}.md) sau khi sửa.
6. Trả về SM: danh sách task ID đã DONE + AC check + verify output + blocker (nếu có).
```
