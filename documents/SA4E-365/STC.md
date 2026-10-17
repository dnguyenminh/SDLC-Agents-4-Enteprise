# Software Test Cases (STC)

## SDLC Chat Extension — SA4E-365: Forward `thinking_delta` tới ThinkingBlock trên 2 đường streaming

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | [SA4E-365](https://jiraassist.atlassian.net/browse/SA4E-365) |
| Title | [SDLC Chat] Thinking section không hiển thị — thinking_delta của reasoning model bị drop trong pi-event-mapper |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-10-16 |
| Status | Draft — Phase 4 (Test Planning) |
| Related STP | documents/SA4E-365/STP.md (v1.0) |
| Related FSD | documents/SA4E-365/FSD.md (v1.0) — §3 rules, §6.4.1 pseudocode + INV-1..5, §10.3 |
| Related TDD | documents/SA4E-365/TDD.md (v1.0) — §12 test design, §9 error matrix |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-16 | QA Agent | Initiate document — 18 automated TCs (17 từ FSD §10.3/TDD §12.2 + TC-18 từ SR-03) + 6 SIT manual. Numbering giữ nguyên ID FSD/TDD (TC-01..TC-17, có TC-12a/12b) để traceability; bổ sung TC-18 (SR-03) và SIT-01..06 |

---

## Test Case Summary

**Tổng: 24 test cases bắt buộc** = 18 automated (14 UT + 3 IT + 1 Regression) + 6 SIT manual; cộng 1 optional (TC-17) → **25 ID tổng cộng**. Numbering theo FSD §10.3 / TDD §12.2 (18 ID: TC-01..TC-12a/12b..TC-17) + QA additions (TC-18, SIT-01..06).

| Nhóm | Phạm vi | TCs | Level | File test target | Trạng thái file |
|------|---------|-----|-------|------------------|-----------------|
| A | Mapper `thinking_delta` (F1) | TC-01, TC-02 | UT | extension/src/pi-workflow/__tests__/pi-event-mapper.test.ts | **MỚI** |
| B | StreamProtocolAdapter mapping (F8 — G-1/G-3/G-4/SR-03) | TC-04, TC-05, TC-06, TC-07, TC-09, TC-10, TC-11, TC-15, TC-18 | UT | extension/src/chat/engine/__tests__/stream-thinking-mapping.test.ts | **MỚI** |
| C | Engine filter F6 (`toStreamEvent` pass 'thinking') | TC-16 | IT | extension/src/chat/engine/__tests__/stream-error-mapping.test.ts | Mở rộng |
| D | StreamHandler emitThinking (F4 — debounce/buffer/flush) | TC-13 | UT | extension/src/mcp/__tests__/stream-handler-events.test.ts | Mở rộng |
| E | Session host onThinking (F2 — 2 loop) | TC-03 | IT | extension/src/pi-workflow/__tests__/pi-agent-session-host.auto-chunk.test.ts | Mở rộng |
| F | Provider discard + continuation (G-2) | TC-12a, TC-12b | IT / UT | pi-model-fallback.test.ts (mở rộng) / stream-thinking-mapping.test.ts | Mở rộng / MỚI |
| G | Regression — turn không reasoning + full suite | TC-08, TC-14, (TC-17 optional) | UT / Regression | stream-thinking-mapping.test.ts / `npx vitest run` | MỚI / — |
| SIT | Manual IDE verification + SR-06 | SIT-01..SIT-06 | Manual | IDE (VS Code/Kiro) + qwen-text | — |

**Quy ước chung:**
- `S` = streamId của turn (vd `'turn-1'`); mọi EngineStreamEvent dùng shape `{ type:'chat:streamChunk', streamId:S, nodeId:'pi', eventType, content, timestamp:'' }`.
- "batch" = giá trị trả về của **một** lần gọi `handleEngineEvent()` (thứ tự trong mảng = thứ tự postMessage).
- Sequence ký hiệu: `[STREAM_START, THINKING_START, THINKING_TOKEN(a), …]` — loại trừ các message TOOL_* không liên quan.
- INV-1: sau mọi terminal path, `thinkingActive` không còn chứa streamId. INV-2: THINKING_END tối đa 1 lần/chu kỳ. INV-3: THINKING_START luôn kèm ≥1 THINKING_TOKEN khác rỗng. INV-4: THINKING_END trước STREAM_TOKEN/STREAM_ERROR. INV-5: content rỗng → no-op tuyệt đối.

---

## Nhóm A — Mapper `thinking_delta` (pi-event-mapper, F1)

### TC-01: Mapper map thinking_delta chuẩn thành chunk 'thinking'

| Field | Value |
|-------|-------|
| **ID** | TC-01 |
| **Priority** | High |
| **Type** | Functional — Happy Path |
| **Level** | UT (automated — vitest) |
| **File** | extension/src/pi-workflow/__tests__/pi-event-mapper.test.ts (MỚI) |
| **Requirement** | FR-1, FR1-R1, UC-1 step 4, AC1, BR-1 |
| **Preconditions** | `EventCollector` fresh (không chunk nào); không cần mock (pure function) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Gọi `mapAgentEvent({ type:'message_update', assistantMessageEvent: { type:'thinking_delta', delta:'abc' } }, collector)` | Hàm trả về không throw |
| 2 | Kiểm tra `collector.chunks` | Chứa đúng 1 chunk `{ type:'thinking', content:'abc' }` |
| 3 | Kiểm tra `collector.thinking` | `=== 'abc'` (tích lũy đúng) |
| 4 | Lặp thêm thinking_delta 'def' | `collector.thinking === 'abcdef'`; chunks có 2 phần tử thinking theo thứ tự |

**Test Data:** deltas `'abc'`, `'def'` (testdata/mapper-agent-events.csv, row TC-01-a/b)
**Postconditions:** Collector chứa 2 chunk thinking; text/answer không bị đụng đến (0 chunk 'text').

---

### TC-02: Mapper bỏ qua delta rỗng (EF-2)

| Field | Value |
|-------|-------|
| **ID** | TC-02 |
| **Priority** | High |
| **Type** | Functional — Exception Flow |
| **Level** | UT (automated — vitest) |
| **File** | extension/src/pi-workflow/__tests__/pi-event-mapper.test.ts (MỚI) |
| **Requirement** | FR-3, FR3-R1, UC-1 EF-2, AC3, BR-3; INV-5 |
| **Preconditions** | `EventCollector` fresh |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Gọi `mapAgentEvent` với `{ type:'thinking_delta', delta:'' }` | `collector.chunks` **không** có chunk mới (guard `ame.delta` truthy) |
| 2 | Gọi với `{ type:'thinking_delta', delta: undefined }` | Như trên — không chunk |
| 3 | Kiểm tra `collector.thinking` | `=== ''` (không tích lũy) |
| 4 | Gọi tiếp text_delta 'hi' | Chunk 'text' bình thường — mapper không suy giảm chức năng text |

**Test Data:** delta `''`, `undefined` (testdata/mapper-agent-events.csv, row TC-02-a/b)
**Postconditions:** 0 chunk thinking; state sạch.

---
## Nhóm B — StreamProtocolAdapter mapping (F8, G-1/G-3/G-4/SR-03)

> **Setup chung (pattern stream-error-mapping.test.ts):** `new StreamProtocolAdapter()` thật; gọi trực tiếp `adapter.handleEngineEvent(engineEvent)` với object `EngineStreamEvent`; mỗi TC dùng instance mới (beforeEach). State private truy cập khi cần qua `(adapter as unknown as { thinkingActive: Set<string> }).thinkingActive`.

### TC-04: Token text đầu tiên khi thinking đang mở → THINKING_END trước STREAM_TOKEN

| Field | Value |
|-------|-------|
| **ID** | TC-04 |
| **Priority** | High |
| **Type** | Functional — Happy Path |
| **Level** | UT (automated — vitest) |
| **File** | extension/src/chat/engine/__tests__/stream-thinking-mapping.test.ts (MỚI) |
| **Requirement** | FR-2, FR2-R1, FR2-R2, UC-2 Main Flow, AC2, BR-2; INV-2, INV-3, INV-4 |
| **Preconditions** | Adapter mới; streamId `'turn-1'` chưa tồn tại trong state |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `handleEngineEvent` chunk thinking 'a' | batch = `[STREAM_START, THINKING_START, THINKING_TOKEN('a')]` — THINKING_START kèm token đầu tiên (INV-3, FR3-R4) |
| 2 | `handleEngineEvent` chunk thinking 'b' | batch = `[THINKING_TOKEN('b')]` |
| 3 | `handleEngineEvent` chunk thinking 'c' | batch = `[THINKING_TOKEN('c')]` |
| 4 | `handleEngineEvent` chunk token 'hello' | batch = `[THINKING_END, STREAM_TOKEN('hello')]` — **đúng thứ tự** THINKING_END index < STREAM_TOKEN index (INV-4, FR2-R2) |
| 5 | Ghép toàn bộ 4 batch theo thứ tự | Flat sequence: `[STREAM_START, THINKING_START, TOKEN(a), TOKEN(b), TOKEN(c), THINKING_END, STREAM_TOKEN(hello)]` — 7 message, mỗi THINKING_* đúng 1 messageId trùng với STREAM_* (FR5-R1) |
| 6 | Kiểm tra chỉ có 1 THINKING_END trong toàn bộ sequence | INV-2 thỏa |

**Test Data:** testdata/adapter-chunk-sequences.csv rows TC-04-1..4
**Postconditions:** `thinkingActive` rỗng cho 'turn-1' (đóng bởi token).

---

### TC-05: Stream complete khi thinking đang mở → THINKING_END + STREAM_END

| Field | Value |
|-------|-------|
| **ID** | TC-05 |
| **Priority** | High |
| **Type** | Functional — Happy Path (terminal: complete) |
| **Level** | UT (automated — vitest) |
| **File** | extension/src/chat/engine/__tests__/stream-thinking-mapping.test.ts (MỚI) |
| **Requirement** | FR-4, FR4-R1, FR2-R1, UC-4 Main Flow, AC4, BR-4; INV-1, INV-2 |
| **Preconditions** | Adapter mới |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Chunk thinking 'a' rồi thinking 'b' | batch 1 = `[STREAM_START, THINKING_START, TOKEN(a)]`; batch 2 = `[TOKEN(b)]` |
| 2 | `handleEngineEvent` `{ type:'chat:streamComplete', streamId:'turn-1', nodeId:'pi', finalContent:'' }` | batch = `[THINKING_END, STREAM_END]` — THINKING_END trước STREAM_END |
| 3 | Kiểm tra state `thinkingActive` | **Không còn chứa 'turn-1'** (INV-1 — white-box check) |
| 4 | Gửi complete lần nữa cho cùng streamId | THINKING_END **không** lặp (INV-2 — chỉ emit khi lookup hit); không crash |

**Test Data:** testdata/adapter-chunk-sequences.csv rows TC-05-1..3
**Postconditions:** Block đóng sạch; streamId đã cleanup khỏi maps.

---

### TC-06: Chunk error khi thinking đang mở → THINKING_END trước STREAM_ERROR (G-1 fix / SR-01)

| Field | Value |
|-------|-------|
| **ID** | TC-06 |
| **Priority** | High |
| **Type** | Functional — Exception Flow (**fix bắt buộc G-1**) |
| **Level** | UT (automated — vitest) |
| **File** | extension/src/chat/engine/__tests__/stream-thinking-mapping.test.ts (MỚI) |
| **Requirement** | FR-4, **FR4-R3**, UC-4 AF-1, AC4, BR-4, **G-1**, **SR-01** (CWE-459 — incomplete cleanup); INV-1, INV-4 |
| **Preconditions** | Adapter mới; mô phỏng đường `PI_TURN_FAILED`: error chunk KHÔNG có complete theo sau |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Chunk thinking 'a' rồi 'b' | Thinking mở (như TC-05 step 1) |
| 2 | `handleEngineEvent` chunk `{ eventType:'error', content:'turn failed' }` | batch = `[THINKING_END, STREAM_ERROR]` — **THINKING_END phải xuất hiện TRƯỚC STREAM_ERROR trong cùng batch** (INV-4, FR4-R3). ⛔ Fail nếu batch chỉ có `[STREAM_ERROR]` (hiện trạng pre-fix) |
| 3 | Kiểm tra STREAM_ERROR payload | `error.code === 'ENGINE_ERROR'`, `error.message === 'turn failed'`, `retryable === true` — giữ nguyên hành vi hiện có |
| 4 | Kiểm tra state `thinkingActive` | **Không còn chứa 'turn-1'** (INV-1) — error là terminal path, KHÔNG dựa vào complete theo sau |
| 5 | Gửi complete cho cùng streamId sau error | THINKING_END **không** phát lần 2 (lookup miss — INV-2); chỉ `[STREAM_END]` |

**Test Data:** testdata/adapter-chunk-sequences.csv rows TC-06-1..3
**Postconditions:** `thinkingActive` rỗng; messageId mapping còn giữ (error non-orphan — mid-stream giữ mapping như hiện có).

---

### TC-07: Error/complete khi KHÔNG có thinking → 0 THINKING_*

| Field | Value |
|-------|-------|
| **ID** | TC-07 |
| **Priority** | Medium |
| **Type** | Functional — Alternative Flow (terminal không thinking) |
| **Level** | UT (automated — vitest) |
| **File** | extension/src/chat/engine/__tests__/stream-thinking-mapping.test.ts (MỚI) |
| **Requirement** | FR-3, FR3-R1, AC3; TDD §9 row 4/7 |
| **Preconditions** | Adapter mới |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Chunk token 'x' | batch = `[STREAM_START, STREAM_TOKEN('x')]` — không THINKING_* |
| 2 | Chunk error 'boom' | batch = `[STREAM_ERROR]` — không THINKING_END (lookup miss) |
| 3 | Orphan error: streamId lạ `'ghost'` nhận error ngay từ đầu | `[STREAM_START, STREAM_ERROR]` (orphan one-shot cleanup giữ nguyên hiện có) — không crash |
| 4 | Orphan complete: streamId lạ `'ghost2'` nhận complete | `[STREAM_END]` — không crash (xem thêm TC-10) |

**Test Data:** testdata/adapter-chunk-sequences.csv rows TC-07-1..4
**Postconditions:** Không state thừa; luồng TOKEN/ERROR hiện có giữ nguyên (NFR-2).

---

### TC-09: THINKING_TOKEN content rỗng khi block đang mở → no-op (G-3)

| Field | Value |
|-------|-------|
| **ID** | TC-09 |
| **Priority** | Medium |
| **Type** | Boundary / Negative (**fix G-3**) |
| **Level** | UT (automated — vitest) |
| **File** | extension/src/chat/engine/__tests__/stream-thinking-mapping.test.ts (MỚI) |
| **Requirement** | FR-3, **FR3-R3**, ES-4, AC3; INV-5 |
| **Preconditions** | Adapter mới; block thinking đã mở bằng 1 delta hợp lệ |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Chunk thinking 'a' | batch = `[STREAM_START, THINKING_START, TOKEN(a)]` |
| 2 | Chunk thinking `content: ''` | batch = `[]` — **không push THINKING_TOKEN rỗng** (G-3 guard `if (!content) break`) |
| 3 | Chunk thinking `content: undefined` | batch = `[]` |
| 4 | Kiểm tra state `thinkingActive` | Vẫn chứa 'turn-1' (block không đóng bởi delta rỗng) |
| 5 | Chunk token 'x' | batch = `[THINKING_END, STREAM_TOKEN('x')]` — flow tiếp tục bình thường |

**Test Data:** testdata/adapter-chunk-sequences.csv rows TC-09-1..5
**Postconditions:** Không token rỗng nào tới webview; block lifecycle không bị phá.

---

### TC-10: Orphan complete cho streamId lạ → no-op an toàn (G-4)

| Field | Value |
|-------|-------|
| **ID** | TC-10 |
| **Priority** | Medium |
| **Type** | Functional — Exception Flow (orphan, G-4) |
| **Level** | UT (automated — vitest) |
| **File** | extension/src/chat/engine/__tests__/stream-thinking-mapping.test.ts (MỚI) |
| **Requirement** | FR-4, **FR4-R4**, ES-3, AC4, BR-4, **G-4**; INV-2 |
| **Preconditions** | Adapter mới; streamId `'unknown-stream'` chưa từng được xử lý |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `handleEngineEvent` `{ type:'chat:streamComplete', streamId:'unknown-stream', ... }` | batch = `[STREAM_END]` — **không THINKING_END** (lookup miss → skip), không STREAM_START |
| 2 | Kiểm tra không throw | Test pass mà không crash — orphan là no-op an toàn |
| 3 | Kiểm tra state | Không có entry mới cho 'unknown-stream' trong cả 3 collection (cleanup one-shot) |
| 4 | Webview side (khóa hành vi): THINKING_END/STREAM_END cho messageId lạ | `chatStore.endThinking/endStream` no-op map miss, không tạo message rỗng (G-4 defense — chatStore.ts:79-85, 166-173; tham chiếu, không cần test webview mới) |

**Test Data:** testdata/adapter-chunk-sequences.csv row TC-10-1
**Postconditions:** Không bubble rỗng; không state leak.

---

### TC-11: reset() clear cả 3 state — turn sau sạch

| Field | Value |
|-------|-------|
| **ID** | TC-11 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow (terminal: reset) |
| **Level** | UT (automated — vitest) |
| **File** | extension/src/chat/engine/__tests__/stream-thinking-mapping.test.ts (MỚI) |
| **Requirement** | FR-4, FR4-R1, UC-4 AF-4, AC4, BR-4, BR-5; INV-1 |
| **Preconditions** | Adapter mới; thinking đang mở cho 'turn-1' |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Chunk thinking 'a' (mở block) | Như thường lệ |
| 2 | Gọi `adapter.reset()` | Không throw |
| 3 | Kiểm tra state (white-box) | `streamToMessage.size === 0`; `startedStreams.size === 0`; `thinkingActive.size === 0` — **clear cả 3 cùng lúc** (INV-1) |
| 4 | Chunk thinking 'fresh' cho CÙNG streamId 'turn-1' | batch = `[STREAM_START, THINKING_START, THINKING_TOKEN('fresh')]` — hành vi như stream hoàn toàn mới (THINKING_START phát lại vì state đã sạch) |
| 5 | Gửi complete | `[THINKING_END, STREAM_END]` — chu kỳ mới khép kín |

**Test Data:** testdata/adapter-chunk-sequences.csv rows TC-11-1..3
**Postconditions:** Không cross-turn leak (FR5-R3); turn sau start sạch.

---

### TC-15: THINKING_START luôn kèm token — delta rỗng là chunk đầu tiên (FR3-R4)

| Field | Value |
|-------|-------|
| **ID** | TC-15 |
| **Priority** | Medium |
| **Type** | Boundary / Negative (FR3-R4 — cấm THINKING_START "trống") |
| **Level** | UT (automated — vitest) |
| **File** | extension/src/chat/engine/__tests__/stream-thinking-mapping.test.ts (MỚI) |
| **Requirement** | FR-3, **FR3-R4**, UC-3 EF-1, AC3; INV-3, INV-5 |
| **Preconditions** | Adapter mới; block CHƯA mở |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Chunk thinking `content: ''` là chunk ĐẦU TIÊN của streamId | batch **không chứa THINKING_START** và **không chứa THINKING_TOKEN** (0 THINKING_*). Ghi chú: STREAM_START có thể xuất hiện theo flow chunk hiện có — không phải thinking state |
| 2 | Kiểm tra state `thinkingActive` | **Không đổi** — không chứa streamId (no-op tuyệt đối, INV-5) |
| 3 | Chunk thinking 'real' | batch = `[THINKING_START, THINKING_TOKEN('real')]` — THINKING_START chỉ phát KÈM token khác rỗng (INV-3) |

**Test Data:** testdata/adapter-chunk-sequences.csv rows TC-15-1..2
**Postconditions:** Không block rỗng phía webview (FR3-R2).

---

### TC-18: cleanup() idempotent trên cả 3 state (SR-03 — defense-in-depth)

| Field | Value |
|-------|-------|
| **ID** | TC-18 |
| **Priority** | Medium |
| **Type** | Security follow-up (SR-03 — fold cùng PR G-1, SM đã chấp nhận) |
| **Level** | UT (automated — vitest) |
| **File** | extension/src/chat/engine/__tests__/stream-thinking-mapping.test.ts (MỚI) |
| **Requirement** | **SR-03** (CWE-459 — Incomplete Cleanup), FR4-R1/INV-1, FR4-R4 |
| **Preconditions** | Adapter mới; SR-03 fix đã áp dụng: `cleanup()` xóa `thinkingActive` (thêm `this.thinkingActive.delete(streamId)`) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | **Path complete:** thinking 'a' → complete | batch complete = `[THINKING_END, STREAM_END]`; sau đó white-box: cả 3 collection **không còn entry** cho 'turn-1' |
| 2 | **Path orphan error:** streamId 'ghost' nhận error ngay | `[STREAM_START, STREAM_ERROR]`; white-box: 3 collection rỗng cho 'ghost' (one-shot cleanup chạy) |
| 3 | **Idempotency:** thinking 'b' → complete → complete lần 2 (orphan) | Không crash; batch lần 2 = `[STREAM_END]` (không THINKING_END lặp — INV-2); white-box: state vẫn rỗng |
| 4 | **Replay sau terminal:** chunk thinking 'c' cho 'turn-1' sau complete | `[STREAM_START, THINKING_START, TOKEN(c)]` — streamId tái sử dụng được như fresh (không stale state) |

**Test Data:** testdata/adapter-chunk-sequences.csv rows TC-18-1..4
**Postconditions:** INV-1 được enforce tại 1 điểm duy nhất (cleanup) — chống leak tương lai nếu thêm terminal path mới.

---
## Nhóm C — Engine filter F6 (ChatEngineAdapter.toStreamEvent pass 'thinking')

### TC-16: eventType 'thinking' không bị drop qua filter engine

| Field | Value |
|-------|-------|
| **ID** | TC-16 |
| **Priority** | High |
| **Type** | Integration (fan-out qua ChatEngineAdapter) |
| **Level** | IT (automated — vitest) |
| **File** | extension/src/chat/engine/__tests__/stream-error-mapping.test.ts (MỞ RỘNG — tái dùng router/bridge/sessionManager fakes đã có) |
| **Requirement** | FR-1, FR1-R1, F6 (ChatEngineAdapter.ts:241), UC-1 step 7-8, AC1, BR-1 |
| **Preconditions** | `ChatEngineAdapter` với deps fake (pattern stream-error-mapping.test.ts: bridge push vào mảng `posted`); `adapter.initialize()` đã gọi |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `adapter.handleEngineEvent({ type:'chat:streamChunk', streamId:'turn-1', nodeId:'pi', eventType:'thinking', content:'d1', timestamp:'' })` | Không throw |
| 2 | Kiểm tra `posted` | Chứa `THINKING_START` + `THINKING_TOKEN('d1')` — `toStreamEvent` **không drop** eventType 'thinking' (F6) |
| 3 | Gửi tiếp eventType 'thinking' content 'd2' | `posted` thêm `THINKING_TOKEN('d2')` |
| 4 | Gửi eventType 'token' content 'answer' | `posted` thêm `[THINKING_END, STREAM_TOKEN('answer')]` theo đúng thứ tự — chuỗi end-to-end qua engine filter giữ mapping đầy đủ |
| 5 | Kiểm tra messageId | THINKING_* và STREAM_* dùng CÙNG messageId (FR5-R1 — 1 bubble) |

**Test Data:** testdata/engine-filter-events.csv rows TC-16-1..4
**Postconditions:** Toàn bộ chuỗi chunk 'thinking' → THINKING_* hoạt động qua engine layer thật.

---

## Nhóm D — StreamHandler emitThinking (F4 — buffer/debounce/flush-trước-terminal)

### TC-13: emitThinking buffer + debounce 50ms + MAX_BUFFER_SIZE + flush trước terminal

| Field | Value |
|-------|-------|
| **ID** | TC-13 |
| **Priority** | Medium |
| **Type** | Non-Functional — Performance (NFR-1) |
| **Level** | UT (automated — vitest, fake timers) |
| **File** | extension/src/mcp/__tests__/stream-handler-events.test.ts (MỞ RỘNG) |
| **Requirement** | FR-5, FR5-R2, NFR-1, TDD §10; stream-handler.ts:10,15,33-60,64,77,89 |
| **Preconditions** | `vi.useFakeTimers()`; `const emitFn = vi.fn(); const handler = new StreamHandler(emitFn);` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | **(13a — debounce):** Gọi `handler.emitThinking('pi', 'd'+i, 's1')` × 10 trong vòng < 50ms | `emitFn` **chưa** được gọi (buffer giữ, chưa flush) |
| 2 | `vi.advanceTimersByTime(50)` | `emitFn` được gọi — 1 flush batch: đúng 10 message, mỗi message `{ type:'chat:streamChunk', nodeId:'pi', eventType:'thinking', streamId:'s1' }`, **thứ tự giữ nguyên** d0→d9 |
| 3 | **(13b — MAX_BUFFER_SIZE):** Handler mới; gọi `emitThinking` × 101 | Flush **đồng bộ ngay** không cần advance timer — `emitFn` được gọi 101 lần (flush cưỡng bức khi buffer vượt 100, chống postMessage storm) |
| 4 | **(13c — flush trước terminal):** Handler mới; `emitThinking('pi','pending','s2')` rồi `handler.emitComplete('pi', 100, 's2')` | Thứ tự emitFn calls: buffered thinking chunk (chat:streamChunk 'thinking') xuất hiện **trước** event `chat:streamComplete` — điều kiện để INV-4 hoạt động ở adapter |
| 5 | **(13d — mixed):** `emitToken` + `emitThinking` xen kẽ trong cùng window 50ms | Cả 2 nằm trong CÙNG 1 flush batch (chung path `bufferChunk`) — thinking không mở đường postMessage riêng |

**Test Data:** testdata/streamhandler-emit-sequences.csv rows TC-13-a..d
**Postconditions:** Buffer rỗng sau flush; timer cleared. Webview nhận ≤ ~20 batch/s bất kể mật độ delta (NFR-1).

---

## Nhóm E — Session host onThinking (F2 — cả 2 loop: normal + auto-chunk)

### TC-03: promptTurn forward thinking qua onThinking trên cả 2 subscribe loop

| Field | Value |
|-------|-------|
| **ID** | TC-03 |
| **Priority** | High |
| **Type** | Integration (session path) |
| **Level** | IT (automated — vitest) |
| **File** | extension/src/pi-workflow/__tests__/pi-agent-session-host.auto-chunk.test.ts (MỞ RỘNG — hoặc file host mới) |
| **Requirement** | FR-1, FR1-R1, FR1-R2, UC-1 AF-1 (session path), AC1, BR-1; guard `live` (FR5-R3) |
| **Preconditions** | `vi.mock('@earendil-works/pi-coding-agent')` (pattern auto-chunk.test.ts + `vi.hoisted`): `createAgentSession` trả fake session — `subscribe` **capture listener**, `prompt` **emit sự kiện thinking tổng hợp** qua captured listener |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | **(3a — loop thường):** `host.promptTurn('short prompt', onToken, onToolEvent, onThinking)`; fake session emit `message_update` với thinking_delta 't1','t2' rồi text_delta 'hi' | `onThinking` được gọi với **từng delta** theo thứ tự: 't1' rồi 't2' (guard `last.type==='thinking' && last.content`); `onToken` nhận 'hi' sau đó |
| 2 | **(3b — auto-chunk loop):** prompt lớn (≥ ngưỡng auto-chunk — dùng pattern 200 paragraph trong file test hiện có); fake session (chunked runOnce) emit thinking_delta 'c1','c2' | `onThinking` **cũng** được gọi với 'c1','c2' — loop 2 trong `promptTurn` forward thinking như loop 1 (F2 bắt buộc cả 2 chỗ, line 477 + 524) |
| 3 | **(3c — guard delta rỗng):** fake session emit thinking_delta '' | `onThinking` **không** được gọi với chuỗi rỗng (host guard content truthy) |
| 4 | **(3d — guard live):** Sau khi promptTurn kết thúc (turn ended), emit thêm thinking_delta 'late' | `onThinking` **không** được gọi — wiring guard `if (!live) return` drop event trễ (FR5-R3, chống bleed sang turn sau) |

**Test Data:** testdata/session-host-thinking-events.csv rows TC-03-a..d
**Postconditions:** Session path forward thinking đầy đủ; không event trễ lọt qua.

---

## Nhóm F — Provider discard + continuation (G-2 — Phương án B)

### TC-12a: Provider discard chunks của attempt failed (FR5-R4')

| Field | Value |
|-------|-------|
| **ID** | TC-12a |
| **Priority** | High |
| **Type** | Integration (fallback chain — khóa chống rò rỉ G-2) |
| **Level** | IT (automated — vitest) |
| **File** | extension/src/pi-workflow/__tests__/pi-model-fallback.test.ts (MỞ RỘNG — pattern có sẵn) |
| **Requirement** | FR-5, **FR5-R4'** (điểm 1: thinking attempt FAILED không bao giờ tới webview), G-2 (Phương án B — TDD §8), FSD §6.6 |
| **Preconditions** | `PiProvider` với model chain 2 model + mock stream per attempt (pattern pi-model-fallback.test.ts); attempt 1 trả `errorMessage` **retryable** (vd 500) và collector có thinking 'B1'; attempt 2 thành công có thinking 'B2' |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Chạy `provider.runOnce(...)` với chain [model-fail, model-ok] | `runOnce` trả result của **attempt 2** (thành công) |
| 2 | Kiểm tra `result.streamChunks` | Chứa `{ type:'thinking', content:'B2' }` — chỉ chunks của attempt thành công |
| 3 | Kiểm tra không rò rỉ | **Không tồn tại** chunk nào có content 'B1' (attempt failed bị discard tại per-attempt collector — pi-provider.ts:379) |
| 4 | Kiểm tra fallback vẫn hoạt động | Result không chứa error; text chunks attempt 2 đầy đủ |

**Test Data:** testdata/provider-fallback-attempts.csv rows TC-12a-1..2 (attempt-1: thinking 'B1' + error retryable; attempt-2: thinking 'B2' + text)
**Postconditions:** Thinking attempt failed không bao giờ tới webview — chống rò rỉ giữa các attempt ở tầng provider (không cần cơ chế reset — zero protocol change).

---

### TC-12b: Continuation sequence — thinking → token (END) → thinking lần 2 → complete

| Field | Value |
|-------|-------|
| **ID** | TC-12b |
| **Priority** | High |
| **Type** | Functional — Alternative Flow (continuation semantics, khóa 8-message sequence) |
| **Level** | UT (automated — vitest) |
| **File** | extension/src/chat/engine/__tests__/stream-thinking-mapping.test.ts (MỚI) |
| **Requirement** | FR-2, FR2-R3 (TA note), FR-5, G-2 (TDD §8.3), AC2/AC4; INV-1..INV-4 |
| **Preconditions** | Adapter mới — mô phỏng kịch bản session→legacy fallback giữa thinking (thinking sau THINKING_END trong CÙNG turn, cùng streamId) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Chunk thinking 'a' | batch = `[STREAM_START, THINKING_START, TOKEN(a)]` |
| 2 | Chunk token 'x' | batch = `[THINKING_END, STREAM_TOKEN('x')]` |
| 3 | Chunk thinking 'b' | batch = `[THINKING_START, TOKEN(b)]` — **THINKING_START mở lại KHÔNG phải ranh giới attempt** (FR2-R3 TA note); webview `startThinking` sẽ reset content (hành vi SA4E-85 có sẵn) |
| 4 | `chat:streamComplete` | batch = `[THINKING_END, STREAM_END]` |
| 5 | Ghép toàn bộ | Flat sequence (8 message thinking/token + STREAM_START đầu): `[STREAM_START, THINKING_START, TOKEN(a), THINKING_END, STREAM_TOKEN(x), THINKING_START, TOKEN(b), THINKING_END, STREAM_END]` — mỗi THINKING_END đúng 1 lần per chu kỳ (2 chu kỳ), INV-1 giữ ở terminal |
| 6 | Kiểm tra 3 điều CẤM (TDD §8.4) | Không có protocol event ranh giới attempt nào được thêm vào sequence; streamId không đổi suốt turn |

**Test Data:** testdata/adapter-chunk-sequences.csv rows TC-12b-1..4
**Postconditions:** Block lifecycle: mở → đóng → mở lại → đóng; không kẹt state; không kẹt "Thinking...".

---
## Nhóm G — Regression (turn không reasoning + full suite)

### TC-08: Turn tool-only — 0 THINKING_* (AC3 / FR-3)

| Field | Value |
|-------|-------|
| **ID** | TC-08 |
| **Priority** | High |
| **Type** | Functional — Regression (turn không reasoning) |
| **Level** | UT (automated — vitest) |
| **File** | extension/src/chat/engine/__tests__/stream-thinking-mapping.test.ts (MỚI) |
| **Requirement** | FR-3, FR3-R1, FR3-R2, UC-3 Main Flow, AC3, BR-3, NFR-2; INV-3 |
| **Preconditions** | Adapter mới — mô phỏng turn chỉ có tool calls + text (không reasoning) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Gửi chuỗi chunks: `tool_call` × 2, `token` 'working...', `token` 'done' | `thinkingActive` **không bao giờ** chứa streamId |
| 2 | Đếm message THINKING_* trong toàn bộ output | **= 0** — không THINKING_START/TOKEN/END nào (FR3-R1) |
| 3 | `chat:streamComplete` | `[STREAM_END]` — không THINKING_END (lookup miss, INV-2); không block rỗng phía webview (FR3-R2) |
| 4 | Tool events | `TOOL_CALL`/tool messages giữ nguyên hành vi hiện có — change không đụng tool flow |

**Test Data:** testdata/adapter-chunk-sequences.csv rows TC-08-1..3
**Postconditions:** UI không thay đổi với turn không reasoning (AC3) — backward compatible.

---

### TC-14: Regression — toàn bộ vitest suite pass (AC5)

| Field | Value |
|-------|-------|
| **ID** | TC-14 |
| **Priority** | High |
| **Type** | Regression (full suite) |
| **Level** | Regression (automated) |
| **File** | Toàn bộ suite (chat engine + webview + pi-workflow + mcp + services) |
| **Requirement** | NFR-5, **AC5**, G-5; TDD §6.2 |
| **Preconditions** | Phase 5 hoàn tất: G-1/G-3 fix + SR-03 + 6 file test target đã implement; baseline suite đang pass trước change |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Chạy `npx vitest run` (tại workspace root hoặc extension/) | Exit code 0 — toàn bộ suite pass |
| 2 | Đối chiếu số test mới | 6 file target (2 mới + 4 mở rộng) xuất hiện trong kết quả; 0 test fail |
| 3 | Chạy riêng các suite liên quan nếu cần khoanh vùng lỗi: `npx vitest run extension/src/chat/engine`, `.../pi-workflow`, `.../mcp`, `.../webview` | Từng suite pass — chat engine + webview suites không regress (BRD §1.1 scope) |

**Test Data:** — (suite tự chứa)
**Postconditions:** AC5 đạt — không regress.

---

### TC-17 (OPTIONAL): Orphan THINKING_* phía webview — chatStore no-op (G-4 defense)

| Field | Value |
|-------|-------|
| **ID** | TC-17 |
| **Priority** | Low — **OPTIONAL** (TDD §6.2/§10.3: không bắt buộc — assumption BRD §5.2, handlers có sẵn từ SA4E-85) |
| **Type** | Functional — Exception Flow (webview defense) |
| **Level** | UT (automated — vitest, webview store) |
| **File** | extension/src/webview/__tests__/chat-store.test.ts (mở rộng — nếu làm) |
| **Requirement** | FR-4, FR4-R4, G-4 (webview side); chatStore.ts:79-85, 146-173 |
| **Preconditions** | chatStore state không có message với id lạ |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Gọi `startThinking('unknown-id')` / `appendThinkingToken('unknown-id','x')` / `endThinking('unknown-id')` | No-op (map miss) — không crash, **không tạo message mới** trong store |
| 2 | `endStream('unknown-id')` | Chỉ reset `isStreaming` — messages không đổi (chatStore.ts:79-85) |

**Test Data:** —
**Postconditions:** Không bubble rỗng từ orphan webview events.

---

## SIT — Manual IDE Verification (visual/UX — không automate được, TDD §12.3 + §13.1)

> Điều kiện: TC-14 pass; extension đã build (`npm run compile`); model gateway **qwen-text** khả dụng. Evidence screenshot lưu `documents/SA4E-365/evidence/`.

### SIT-01: Build + reload host

| Field | Value |
|-------|-------|
| **ID** | SIT-01 | 
| **Priority** | High |
| **Type** | Manual — Environment |
| **Requirement** | TDD §12.3 step 1, §14.2 |
| **Preconditions** | Code merged; `npm run compile` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | `npm run compile` trong extension/ | Build success, 0 error TS |
| 2 | Reload IDE host ("Developer: Reload Window") | Extension activate không lỗi; SDLC CHAT panel mở bình thường |

**Postconditions:** Extension phiên bản mới chạy trong host.

---

### SIT-02: ThinkingBlock "Thinking..." stream live (AC1)

| Field | Value |
|-------|-------|
| **ID** | SIT-02 |
| **Priority** | High |
| **Type** | Manual — UI/UX (visual) |
| **Requirement** | BR-1, FR-1, **AC1**, UC-1, Story 1 |
| **Preconditions** | SIT-01 pass; model qwen-text đã chọn |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Gửi prompt yêu cầu reasoning trong SDLC CHAT (vd "Phân tích BRD SA4E-365 và nêu 3 rủi ro") | Model trả reasoning_content → SDK phát thinking_delta |
| 2 | Quan sát bubble của turn hiện tại | ThinkingBlock hiển thị **"Thinking..." stream live** — nội dung tăng dần, nằm BÊN TRONG bubble hiện tại, **không tạo bubble mới** (BR-5, FR5-R1) |
| 3 | Quan sát khi reasoning dài | Stream mượt, không lag webview (NFR-1 — debounce 50ms); không postMessage storm |
| 4 | Screenshot evidence | Lưu `evidence/SIT-02-thinking-live.png` |

**Postconditions:** Thinking content hiển thị đúng, ephemeral.

---

### SIT-03: Block collapse thành "Reasoning" khi answer bắt đầu (AC2)

| Field | Value |
|-------|-------|
| **ID** | SIT-03 |
| **Priority** | High |
| **Type** | Manual — UI/UX (visual) |
| **Requirement** | BR-2, FR-2, **AC2**, UC-2, Story 1 |
| **Preconditions** | SIT-02 đang chạy — thinking live |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Chờ token text đầu tiên của answer | THINKING_END phát → block **tự collapse** thành nhãn "Reasoning", nội dung còn xem lại được |
| 2 | Quan sát answer stream | Answer stream chạy bình thường (TOKEN liên tục), cùng bubble |
| 3 | Screenshot evidence | `evidence/SIT-03-collapse-reasoning.png` |

**Postconditions:** Block collapsed; 1 turn = 1 bubble giữ nguyên.

---

### SIT-04: Turn tool-only — không block (AC3)

| Field | Value |
|-------|-------|
| **ID** | SIT-04 |
| **Priority** | High |
| **Type** | Manual — UI/UX (visual) |
| **Requirement** | BR-3, FR-3, **AC3**, UC-3, Story 2 |
| **Preconditions** | SIT-01 pass; model thường (không reasoning) HOẶC prompt tool-only |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Chọn model không reasoning (hoặc prompt chỉ kích hoạt tool) → gửi prompt | Turn hoàn thành bình thường |
| 2 | Quan sát bubble | **Không** ThinkingBlock nào, không block rỗng/loading vô nghĩa — UI giữ nguyên hành vi trước change (NFR-2) |
| 3 | Screenshot evidence | `evidence/SIT-04-no-thinking-block.png` |

**Postconditions:** UI không nhiễu với model không reasoning.

---

### SIT-05: Turn error — block đóng, không kẹt "Thinking..." (AC4, G-1 end-to-end)

| Field | Value |
|-------|-------|
| **ID** | SIT-05 |
| **Priority** | High |
| **Type** | Manual — UI/UX + Reliability |
| **Requirement** | BR-4, FR-4, **AC4**, UC-4, **G-1/SR-01 end-to-end**, ES-1/ES-2, Story 3 |
| **Preconditions** | SIT-02 đang thinking live; khả năng gây error: stop turn / ngắt gateway / prompt gây session timeout |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trong lúc thinking live, gây error (vd stop turn hoặc ngắt network tới gateway) | Turn error — bubble hiện STREAM_ERROR/chat:error như hiện có |
| 2 | Quan sát ThinkingBlock | Block **ở trạng thái đóng** — KHÔNG kẹt "Thinking..." (G-1: THINKING_END trước STREAM_ERROR; timeout path: đóng qua complete) |
| 3 | Gửi turn mới sau error | Turn mới hoạt động bình thường — không state cũ leak (FR5-R3, streamId mới per turn) |
| 4 | Screenshot evidence | `evidence/SIT-05-error-block-closed.png` |

**Postconditions:** Không kẹt UI state sau error (NFR-4); retry được.

---

### SIT-06: SR-06 — Session JSONL có persist reasoning? (manual security check)

| Field | Value |
|-------|-------|
| **ID** | SIT-06 |
| **Priority** | Low |
| **Type** | Manual — Security follow-up (data-at-rest classification) |
| **Requirement** | **SR-06** (SECURITY-REVIEW — Informational, unverified); FSD §7.2 (Internal) |
| **Preconditions** | SIT-02 đã chạy với model reasoning (session file tồn tại) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Lấy đường dẫn session file từ debugLog (pi-workflow-adapter.ts:353) hoặc `getSessionFile()` | Đường dẫn .jsonl trong workspace |
| 2 | Mở file, grep/tìm nội dung reasoning đã hiển thị ở SIT-02 (vd 1 câu đặc trưng từ thinking) | **Kết quả A — KHÔNG có:** SR-06 đóng với evidence (grep 0 match) — extension không persist thinking ✅ |
| 3 | Nếu Có (Kết quả B) | Ghi nhận classification **Internal** cho session file vào docs + notify SM; follow-up cap (SR-02) khi thinking được persist — không blocking |
| 4 | Ghi evidence | `evidence/SIT-06-session-jsonl-check.md` (đường dẫn + grep result) |

**Postconditions:** Data-at-rest classification chính xác; không ảnh hưởng verdict PASS.

---

## Requirements Traceability Matrix (RTM)

### BRD Acceptance Criteria → Test Cases

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| **AC1** — Model trả reasoning → ThinkingBlock live cả 2 đường | BRD §2.3 Story 1 | TC-01, TC-03, TC-16 (+ SIT-02) | ✅ |
| **AC2** — Token text đầu tiên → THINKING_END + collapse | BRD §2.3 Story 1 | TC-04, TC-12b (+ SIT-03) | ✅ |
| **AC3** — Turn không reasoning → UI không đổi | BRD §2.3 Story 2 | TC-02, TC-08, TC-09, TC-15 (+ SIT-04) | ✅ |
| **AC4** — Block luôn đóng khi complete/error | BRD §2.3 Story 3 | TC-05, TC-06, TC-07, TC-10, TC-11 (+ SIT-05) | ✅ |
| **AC5** — Vitest suite không regress | BRD §2.3 Story 3, NFR-5 | TC-14 | ✅ |

### Business Requirements (BRD) → Test Cases

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| BR-1 — Forward thinking_delta cả 2 đường, ThinkingBlock live | BRD §2.1 | TC-01, TC-03, TC-16, SIT-02 | ✅ |
| BR-2 — THINKING_END khi text đầu tiên; collapse "Reasoning" | BRD §2.1 | TC-04, TC-12b, SIT-03 | ✅ |
| BR-3 — Không reasoning → 0 THINKING_*, không block rỗng | BRD §2.1 | TC-02, TC-08, TC-09, TC-15, SIT-04 | ✅ |
| BR-4 — Block luôn đóng khi complete/error | BRD §2.1 | TC-05, TC-06, TC-10, TC-11, SIT-05 | ✅ |
| BR-5 — 1 turn = 1 bubble; thinking thuộc message hiện tại | BRD §2.1 | TC-04 (messageId), TC-12a, TC-12b, TC-16 (messageId), SIT-02 | ✅ |

### Functional Requirements + Rules (FSD) → Test Cases

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| FR-1 (FR1-R1/R2/R3) | FSD §3.1 | TC-01, TC-02, TC-03, TC-16 | ✅ |
| FR-2 (FR2-R1/R2/R3) | FSD §3.2 | TC-04, TC-12b | ✅ |
| FR-3 (FR3-R1..R4) | FSD §3.3 | TC-02, TC-08, TC-09, TC-15 | ✅ |
| FR-4 (FR4-R1..R4) | FSD §3.4 | TC-05, TC-06, TC-07, TC-10, TC-11, TC-18 | ✅ |
| FR-5 (FR5-R1..R4') | FSD §3.5 + §6.6 | TC-12a, TC-12b, TC-13, TC-11 (cross-turn), TC-03d (guard live) | ✅ |

### Gaps / Invariants / Security Findings → Test Cases

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| G-1 (error path đóng block — fix bắt buộc = SR-01) | FSD §2.1, TDD §5.2, SR-01 | **TC-06**, SIT-05 | ✅ |
| G-2 (continuation semantics Phương án B) | FSD §6.6, TDD §8 | TC-12a, TC-12b | ✅ |
| G-3 (guard content rỗng — defense-in-depth) | FSD §3.3, TDD §5.2 | TC-09, TC-15, TC-02 | ✅ |
| G-4 (orphan terminal no-op) | FSD §3.4, TDD §9 row 6-7 | TC-10, TC-07, (TC-17 optional) | ✅ |
| G-5 (unit tests thinking path) | FSD §2.1, NFR-5 | TC-01..TC-18 (toàn bộ nhóm A-F) | ✅ |
| INV-1 (thinkingActive rỗng sau terminal) | FSD §6.4.1 | TC-05, TC-06, TC-10, TC-11, TC-18 | ✅ |
| INV-2 (THINKING_END tối đa 1 lần) | FSD §6.4.1 | TC-04, TC-05, TC-06, TC-10, TC-12b | ✅ |
| INV-3 (START kèm token khác rỗng) | FSD §6.4.1 | TC-04, TC-08, TC-15 | ✅ |
| INV-4 (END trước TOKEN/ERROR) | FSD §6.4.1 | TC-04, TC-06, TC-13c | ✅ |
| INV-5 (delta rỗng no-op tuyệt đối) | FSD §6.4.1 | TC-09, TC-15 | ✅ |
| SR-03 (cleanup idempotent 3 state) | SECURITY-REVIEW SR-03 | **TC-18** | ✅ |
| SR-06 (session JSONL persist reasoning) | SECURITY-REVIEW SR-06 | **SIT-06** | ✅ |
| SR-01 (state leak = G-1) | SECURITY-REVIEW SR-01 | TC-06, TC-11 | ✅ |
| NFR-1 (debounce 50ms + MAX_BUFFER 100 + flush trước terminal) | FSD §8, TDD §10 | TC-13, SIT-02 | ✅ |
| NFR-2 (model không reasoning giữ nguyên) | FSD §8 | TC-08, SIT-04 | ✅ |

**Coverage Summary:**

| Category | Total | Covered | Coverage % |
|----------|-------|---------|------------|
| Acceptance Criteria (AC1–AC5) | 5 | 5 | 100% |
| Business Rules (BR-1..BR-5) | 5 | 5 | 100% |
| Functional Requirements (FR-1..FR-5) | 5 | 5 | 100% |
| Gaps (G-1..G-5) | 5 | 5 | 100% |
| Invariants (INV-1..INV-5) | 5 | 5 | 100% |
| Security findings trong scope (SR-01, SR-03, SR-06) | 3 | 3 | 100% |
| **Overall** | **28** | **28** | **100%** |

> SR-02, SR-04: **Out of scope** (backlog — SECURITY-REVIEW Remediation Priority 3-4) — không cần TC. Terminal paths 11/11 (TDD §9) map đầy đủ — xem STP §10.1.

---

## Appendix

### A. Test Data Files

| File | Dùng cho |
|------|----------|
| documents/SA4E-365/testdata/mapper-agent-events.csv | TC-01, TC-02 |
| documents/SA4E-365/testdata/adapter-chunk-sequences.csv | TC-04..TC-11, TC-12b, TC-15, TC-18 |
| documents/SA4E-365/testdata/engine-filter-events.csv | TC-16 |
| documents/SA4E-365/testdata/streamhandler-emit-sequences.csv | TC-13 |
| documents/SA4E-365/testdata/session-host-thinking-events.csv | TC-03 |
| documents/SA4E-365/testdata/provider-fallback-attempts.csv | TC-12a |
| documents/SA4E-365/testdata/sit-checklist.csv | SIT-01..SIT-06 |

### B. Mock Patterns tham chiếu (đã verify trong repo)

| Pattern | File | Dùng cho |
|---------|------|----------|
| Fake deps + adapter thật | chat/engine/__tests__/stream-error-mapping.test.ts (router/bridge push mảng `posted`) | TC-04..TC-11, TC-15, TC-16, TC-18, TC-12b |
| vi.mock pi-coding-agent + vi.hoisted | pi-workflow/__tests__/pi-agent-session-host.auto-chunk.test.ts | TC-03 |
| StreamHandler(emitFn) | mcp/__tests__/stream-handler-events.test.ts | TC-13 |
| PiProvider mock stream per attempt | pi-workflow/__tests__/pi-model-fallback.test.ts | TC-12a |
| Faux pi-ai provider (optional) | pi-workflow/__tests__/pi-workflow-adapter.e2e.test.ts | E2E-ADAPTER optional (TDD §13.2) |

### C. Lưu ý cho DEV (Phase 5)

1. Test implementation PHẢI khớp mock strategy trong STP §2.3 — không mock `StreamProtocolAdapter`/`StreamHandler`/`mapAgentEvent` (SUT thật); chỉ mock external (SDK, stream gateway).
2. Mỗi test ≤ 20 dòng; file ≤ 200 dòng — tách describe block nếu cần.
3. Comment traceability đầu mỗi test: `// SA4E-365, TC-06 [FR4-R3, INV-1/4, G-1/SR-01]`.
4. Không được thêm bất kỳ protocol event mới nào trong test (3 điều cấm TDD §8.4).
5. `vi.useFakeTimers()` phải restore (`vi.useRealTimers()` trong afterEach) để không nhiễm TC-14.

### D. Environment Configuration

- Lệnh suite: `npx vitest run` — không cần config mới (vitest config hiện có).
- Không DB, không seed, không fixture file — mọi state in-memory per test (TDD §13.3).
- Evidence dir: `documents/SA4E-365/evidence/`.

---

*End of Document — SA4E-365 STC v1.0 (QA Agent, 2026-10-16)*