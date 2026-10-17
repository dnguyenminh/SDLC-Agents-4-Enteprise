# 🔒 Security Design Review — SA4E-365 (Phase 3.7)

## Document Information

| Field | Value |
|-------|-------|
| Project | SDLC Agents 4 Enterprise — Extension (SDLC CHAT) |
| Ticket | [SA4E-365](https://jiraassist.atlassian.net/browse/SA4E-365) — Forward `thinking_delta` tới ThinkingBlock (2 đường streaming) |
| Phase | 3.7 — Security Design Review (trước Phase 4 Test Planning) |
| Scope | Thiết kế truyền **streaming text** (model reasoning) qua chuỗi 8 điểm F1–F8: pi-event-mapper → pi-agent-session-host / pi-workflow-adapter → stream-handler → ChatEngineAdapter → StreamProtocolAdapter → webview ThinkingBlock. **Không có auth/DB/API/dependency mới** |
| Documents Reviewed | TDD.md v1.0 (2026-10-16), STATUS.json (fixFiles), mã nguồn hiện hành của 10 fixFiles + webview handlers + validator + CSP |
| Date | 2026-10-16 |
| Assessor | Security Agent (static design review — không dynamic test) |
| Version | 1.0 |

---

## Executive Summary

Thiết kế SA4E-365 là một **pure data-forwarding change**: nối tiếp `thinking_delta` đã được SDK chuẩn hóa qua chuỗi adapter đến webview, không mở protocol event mới, không thêm dependency, không đổi trust boundary. Toàn bộ chuỗi đã được đối chiếu trực tiếp với mã nguồn hiện hành (2026-10-16).

**Kết quả tổng thể: tích cực.** Không phát hiện Critical/High. Các kiểm soát cốt lõi đều có thật trong code và khớp thiết kế TDD: Svelte text interpolation escape mặc định (`ThinkingBlock.svelte:74`), CSP nonce-based + `connect-src 'none'` của chat webview (`ChatHtmlBuilder.ts:23`), debounce 50ms + `MAX_BUFFER_SIZE 100` + flush-trước-terminal chống postMessage storm (`stream-handler.ts:10,15,54-57`), guard `live` chống cross-turn bleed (`pi-workflow-adapter.ts:296-313`), và per-attempt collector discard chống rò rỉ thinking giữa các attempt fallback (`pi-provider.ts:379`).

**Một finding Medium đáng chú ý (SR-01):** error path của `StreamProtocolAdapter` hiện không đóng `thinkingActive` (gap **G-1** mà TDD đã xếp loại High — fix bắt buộc). Xét dưới góc độ security, đây là **incomplete cleanup / state leak**: trên đường `PI_TURN_FAILED` (`pi-workflow-adapter.ts:545-548` phát `chat:error` mà **không** có `chat:streamComplete` theo sau), entry `streamId` còn kẹt trong `thinkingActive` vĩnh viễn — gây (1) webview block kẹt "Thinking..." và (2) tăng trưởng bộ nhớ chậm trong extension host dài hạn. Việc fix G-1 theo TDD **đồng thời chính là fix security** cho finding này. Ngoài ra phát hiện `reset()` của adapter **không có call site production** (SR-04) — làm mọi leak path trở nên vĩnh viễn thay vì được dọn mỗi turn.

Không có finding nào buộc SA phải sửa thiết kế TDD. Verdict: **PASS — proceed Phase 4**, kèm 2 khuyến nghị hardening Low (SR-02, SR-03) có thể fold vào cùng PR G-1 mà không đổi thiết kế.

**Overall Risk Rating: LOW** (với điều kiện G-1 được implement đúng như TDD đã bắt buộc)

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 0 |
| 🟡 Medium | 1 (SR-01 — trùng G-1, đã có trong TDD) |
| 🔵 Low | 3 (SR-02, SR-03, SR-04) |
| ℹ️ Informational | 3 (SR-05, SR-06, + ghi chú doc Svelte version) |

---

## Scope & Methodology

| Mục | Nội dung |
|-----|----------|
| Kiểu review | Static design review (Phase 3.7) — đối chiếu TDD ↔ mã nguồn hiện hành |
| Mã đã đọc | pi-event-mapper.ts, pi-agent-session-host.ts (L440-549), pi-workflow-adapter.ts (L290-369, L505-564), pi-provider.ts (L318-417), stream-handler.ts (toàn bộ), state-types.ts, ChatEngineAdapter.ts (L1-283), IStreamProtocolAdapter.ts, StreamProtocolAdapter.ts (toàn bộ), ThinkingBlock.svelte (toàn bộ), ChatMessage.svelte (thinking flow), ChatMessageList.svelte, messageListener.ts (toàn bộ), chatStore.ts (L100-173), messageValidator.ts (toàn bộ), ChatHtmlBuilder.ts (CSP), STATUS.json, extension/package.json |
| Không nằm trong scope | Dynamic/pentest, runtime memory profiling, hạ tầng VS Code/Electron, SDK nội bộ @earendil-works (không có node_modules để kiểm chứng — xem SR-06), các panel webview khác (login/pega-ingester/settings — chỉ dùng làm đối chiếu CSP) |
| Framework tham chiếu | OWASP Top 10 (2021), OWASP ASVS 4.0 (V5 validation, V14 config), CWE |

---

## Findings by OWASP Top 10 (2021)

| Category | Kết luận |
|----------|----------|
| A01:2021 — Broken Access Control | No issues found ✅ — THINKING_* chỉ theo hướng Extension Host → Webview (`messageValidator.ts:10-26` EXTENSION_MESSAGE_TYPES); webview không thể inject/invoke thinking; cùng quyền với answer stream hiện có (FSD §7.1) |
| A02:2021 — Cryptographic Failures | No issues found ✅ — không có crypto mới; `crypto.randomUUID()` chỉ dùng làm messageId (đúng mục đích); không secret trong chuỗi stream |
| A03:2021 — Injection | No issues found ✅ — XSS được chặn 2 lớp: Svelte escape mặc định + CSP nonce (chi tiết SR/XSS-VERIFIED). Không SQL/command/path operations trong chuỗi |
| A04:2021 — Insecure Design | **1 Medium (SR-01)** — incomplete cleanup trên terminal path error; **1 Low (SR-04)** — `reset()` dead code |
| A05:2021 — Security Misconfiguration | **2 Low (SR-02, SR-03)** — thiếu length cap cho thinking (đã được TDD ghi nhận là accepted risk); `cleanup()` thiếu xóa `thinkingActive` (defense-in-depth) |
| A06:2021 — Vulnerable and Outdated Components | No issues found ✅ — zero new dependency (STATUS.json fixFiles không chứa package.json) |
| A07:2021 — Identification and Authentication Failures | Not applicable — không có auth surface mới |
| A08:2021 — Software and Data Integrity Failures | No issues found ✅ — postMessage payload là plain string, structured clone, không eval/deserialize |
| A09:2021 — Security Logging and Monitoring Failures | No issues found ✅ — debugLog chỉ ghi metadata (độ dài, số tool, duration), không log thinking content (chi tiết §Logging) |
| A10:2021 — SSRF | Not applicable — không có outbound request mới |

---

## Detailed Findings

### Finding SR-01: State leak `thinkingActive` (kèm stream maps) trên terminal path error không có complete — xác nhận G-1 là fix bắt buộc

| Attribute | Value |
|-----------|-------|
| **Severity** | Medium (góc nhìn security; TDD xếp G-1 High về chức năng — hai đánh giá **đồng hướng**, cùng một fix) |
| **OWASP Category** | A04:2021 — Insecure Design (resource/state lifecycle) |
| **CWE** | CWE-459: Incomplete Cleanup; CWE-401: Missing Release of Memory after Effective Lifetime |
| **CVSS Score** | 5.2 (AV:L/AC:L/PR:L/UI:N/S:U/C:N/I:N/A:L) |
| **Location** | extension/src/chat/engine/StreamProtocolAdapter.ts:88-97 (gap); nguồn rò: pi-workflow-adapter.ts:545-548 |
| **Status** | Open — **đã có fix bắt buộc trong TDD (G-1, §5.2/§6.1)** |

**Description:**
Nhánh `case 'error'` của `handleChunk` hiện không xóa `streamId` khỏi `thinkingActive` và không emit `THINKING_END`. Trên đường lỗi mà **không** có `chat:streamComplete` theo sau, entry streamId bị giữ vĩnh viễn vì `reset()` không được gọi ở đâu trong production (xem SR-04).

**Evidence:**
```typescript
// StreamProtocolAdapter.ts:88-97 — hiện trạng: error path KHÔNG đụng thinkingActive
if (event.eventType === 'error') {
  messages.push({ type: 'STREAM_ERROR', messageId,
    error: { code: 'ENGINE_ERROR', message: event.content, retryable: true } });
  // Orphan errors ... one-shot: clean up immediately ...
  // Mid-stream errors keep their mapping — the turn's own complete will clean up.
  if (isOrphan) this.cleanup(event.streamId);   // ← cleanup() cũng không xóa thinkingActive (SR-03)
}

// pi-workflow-adapter.ts:545-548 — PI_TURN_FAILED: chỉ chat:error, KHÔNG emitComplete
} catch (err) {
  debugError('[PiWorkflowAdapter] turn failed', err as Error);
  this.onEvent({ type: 'chat:error', code: 'PI_TURN_FAILED', message: ..., retryable: true } as ChatExtToWebviewMessage);
}
```
Đối chiếu: các terminal path khác đều an toàn — `PI_SESSION_TIMEOUT` (`pi-workflow-adapter.ts:331-339`) và budget-exceeded (`L360-368`) đều `emitComplete` **trước** `chat:error`; legacy path luôn `emitComplete` (`L529`). **Duy nhất `PI_TURN_FAILED`** là leak path — khớp chính xác bảng Error Handling Matrix row 3 của TDD §9.

**Impact:**
1. **UX/security-adjacent:** webview block kẹt trạng thái "Thinking..." (isThinkingActive=true) — người dùng bị kích động tâm lý sai về trạng thái turn.
2. **Memory:** mỗi turn fail rò 3 entry (streamToMessage + startedStreams + thinkingActive ≈ ~150 bytes/turn). Tần suất thấp (lỗi infra session) nhưng **tích lũy vô hạn** trong extension host dài hạn vì không có `reset()` nào chạy. Rò 1 entry`thinkingActive` còn có nghĩa: nếu một streamId cũ (không thể tái xuất do UUID) — thuần túy garbage, không có nguy cơ cross-turn confusion vì `turnStreamId` mới per turn (`pi-workflow-adapter.ts:449`).

**Remediation:** Đã có sẵn trong TDD §5.2 (G-1) — KHÔNG cần thiết kế mới:
```typescript
case 'error': {                                          // ── G-1 fix (TDD §5.2)
  if (this.thinkingActive.has(event.streamId)) {
    this.thinkingActive.delete(event.streamId);
    messages.push({ type: 'THINKING_END', messageId });  // TRƯỚC STREAM_ERROR (INV-4)
  }
  messages.push({ type: 'STREAM_ERROR', messageId, error: {...} });
  if (isOrphan) this.cleanup(event.streamId);
  break;
}
```
Fix này đóng cả leak `thinkingActive` lẫn UX. (Lưu ý: leak `streamToMessage`/`startedStreams` trên cùng path này là **pre-existing**, ngoài blast-radius của change — xem SR-04.)

**References:** CWE-459, CWE-401; TDD §7.2, §9 (row 3).

---

### Finding SR-02: Không có length cap cho thinking content (đối chiếu `MAX_TOOL_RESULT_CHARS = 16000`) — accepted risk cần ghi nhận follow-up

| Attribute | Value |
|-----------|-------|
| **Severity** | Low |
| **OWASP Category** | A05:2021 — Security Misconfiguration (thiếu hardening); CWE-770: Allocation of Resources Without Limits |
| **CVSS Score** | 3.3 |
| **Location** | extension/src/pi-workflow/pi-event-mapper.ts:121-124 (accumulator không cap); webview/stores/chatStore.ts:156-163 (string không cap) |
| **Status** | Open — accepted risk **đã được TDD §11.1 lập luận và quyết định** |

**Description:**
`collector.thinking` và `message.thinking` (webview) tích lũy không giới hạn. Đối chiếu: tool result có cap 16,000 chars (`pi-event-mapper.ts:31-37`) nhưng thinking và answer text đều không cap.

**Impact — đã được triệt tiêu bởi các kiểm soát hiện có (đánh giá: chấp nhận được):**
1. **Bounded bởi model, không phải attacker-controlled tùy ý:** maxTokens của reasoning bị chặn bởi model registry (`pi-agent/model-registry.ts` thinkingMap — max 16,384 tokens ≈ ~64KB text). Nguồn duy nhất là model gateway do **chính user cấu hình** — không có attacker direct input.
2. **Extension host memory:** buffer StreamHandler ≤ 100 message (`stream-handler.ts:54-57`), flush cưỡng bức — bounded.
3. **Webview render:** mỗi batch (`≤20/s` nhờ debounce 50ms) re-render `<pre>{content}</pre>` full-text → O(n²) tích lũy trên duration stream. Với 64KB worst-case vẫn chấp nhận được trong iframe VS Code; không cross-user impact.
4. **Secret echo:** nếu reasoning echo secret (API key đọc qua tool), content chỉ hiển thị cho **chính user local** trong IDE của họ — cùng trust boundary với answer text (cũng không cap) và tool result (đã cap). Ephemeral: không persist bởi extension code, không log.

**Remediation (khuyến nghị, không blocking):** đồng ý với quyết định TDD (không cap giữa stream — cắt đục nội dung live, phá UX, không giảm risk thực). Ghi nhận **follow-up khi thinking được persist** (out-of-scope hiện tại): thêm `MAX_THINKING_CHARS` (vd 64,000) tại `chatStore.appendThinkingToken` — cap ở webview không phá streaming, chỉ ngừng append:
```typescript
// follow-up — KHÔNG thuộc scope SA4E-365
const MAX_THINKING_CHARS = 64_000;
export function appendThinkingToken(messageId: string, token: string): void {
  chatState.update((s) => ({ ...s, messages: s.messages.map((m) =>
    m.id === messageId && (m.thinking ?? '').length < MAX_THINKING_CHARS
      ? { ...m, thinking: (m.thinking ?? '') + token } : m) }));
}
```

**References:** CWE-770; TDD §11.1.

---

### Finding SR-03: `cleanup()` không xóa `thinkingActive` — defense-in-depth 1 dòng, khuyến nghị fold vào PR G-1

| Attribute | Value |
|-----------|-------|
| **Severity** | Low |
| **OWASP Category** | A05:2021 — Security Misconfiguration; CWE-459: Incomplete Cleanup |
| **CVSS Score** | 2.7 |
| **Location** | extension/src/chat/engine/StreamProtocolAdapter.ts:184-187 |
| **Status** | Open — khuyến nghị (không bắt buộc) |

**Description:**
`cleanup()` xóa `streamToMessage` + `startedStreams` nhưng **không** xóa `thinkingActive`:
```typescript
private cleanup(streamId: string): void {
  this.streamToMessage.delete(streamId);
  this.startedStreams.delete(streamId);
  // ← không có this.thinkingActive.delete(streamId)
}
```
**Phân tích hiện trạng — KHÔNG phải leak đang hoạt động:** mọi terminal path hôm nay đều xóa `thinkingActive` **trước** khi `cleanup()` chạy (handleComplete L122-126; orphan error không thể có entry vì chưa từng xử lý chunk nào cho streamId đó → `startedStreams` không chứa id → `isOrphan=true` từ đầu). Tức là INV-1 vẫn giữ.

**Impact:** Fragility, không exploitable. Nếu tương lai thêm một terminal path mới gọi `cleanup()` mà quên đóng thinking block trước — leak tái xuất im lặng. Đây chính là kiểu "single point of forgetting" mà P-3 (idempotent terminal) muốn loại bỏ.

**Remediation:** +1 dòng, tùy chọn fold cùng PR G-1 (không đổi thiết kế, không đổi protocol):
```typescript
private cleanup(streamId: string): void {
  this.streamToMessage.delete(streamId);
  this.startedStreams.delete(streamId);
  this.thinkingActive.delete(streamId);   // defense-in-depth: invariant INV-1 tại 1 điểm duy nhất
}
```
Sau khi có dòng này, TDD cần cập nhật 1 câu ở §5.2/§6.1: cleanup idempotent trên cả 3 state. (Non-blocking với verdict PASS.)

---

### Finding SR-04: `StreamProtocolAdapter.reset()` là dead code trong production — leak pre-existing trên PI_TURN_FAILED path trở nên vĩnh viễn

| Attribute | Value |
|-----------|-------|
| **Severity** | Low (pre-existing — không do change này gây ra, không block SA4E-365) |
| **OWASP Category** | A04:2021 — Insecure Design; CWE-459 |
| **CVSS Score** | 3.1 |
| **Location** | extension/src/chat/engine/StreamProtocolAdapter.ts:61-65 (định nghĩa); không có call site production (grep toàn `extension/src`) |
| **Status** | Open — ghi nhận cho backlog, ngoài blast-radius change |

**Description:**
`reset()` xóa cả 3 state (kể cả `thinkingActive`) nhưng chỉ được gọi trong test. Tìm kiếm `streamAdapter.reset`/`.reset()` toàn `extension/src` chỉ thấy: `TokenBuffer.reset()` (`PostMessageBridge.ts:44`), `ProxyAgentFactory.reset()`, và các test files.

**Impact:** Mỗi turn fail qua PI_TURN_FAILED rò vĩnh viễn entries trong `streamToMessage` + `startedStreams` (SR-01 đã fix phần `thinkingActive`). Tần suất thấp, kích thước nhỏ (~100 bytes/turn) nhưng unbounded theo thời gian uptime của extension host.

**Remediation (backlog, ngoài scope TDD hiện tại):** wire `reset()` tại ranh giới turn mới (vd đầu `invokeChat` của PiWorkflowAdapter qua engine adapter, hoặc lifecycle của ChatEngineAdapter), hoặc gọi `cleanup(streamId)` trong error path non-orphan khi turn đã kết thúc. Cần design riêng (xác định ranh giới "turn mới" đúng với continuation semantics G-2) — **không gộp vào PR bug fix này** để tránh scope creep.

---

### Finding SR-05 (Informational): `messageValidator` chỉ validate discriminant, không validate payload shape THINKING_*

| Attribute | Value |
|-----------|-------|
| **Severity** | Informational |
| **OWASP Category** | A03:2021 (không exploitable trong luồng này) |
| **Location** | extension/src/chat/router/messageValidator.ts:55-57 |

**Description:** `isValidMessageType` chỉ kiểm tra `type` ∈ Set, không kiểm tra `messageId`/`token` là string. Tuy nhiên sender của THINKING_* là **chính extension host code của mình** (trusted sender trong cùng process) — không có kẻ tấn công có thể gửi message này vào webview (VS Code webview iframe chỉ nhận message từ extension host). Handler webview `appendThinkingToken(msg.messageId, msg.token)` với token undefined sẽ nối chuỗi "undefined" — cosmetic, không inject được. **Không cần hành động.** (Hướng webview→extension có validator + direction split — tốt.)

---

### Finding SR-06 (Informational — Potential, chưa kiểm chứng được): Session file của pi-ai SDK có thể persist reasoning

| Attribute | Value |
|-----------|-------|
| **Severity** | Informational |
| **OWASP Category** | A02:2021 (data-at-rest) / A09:2021 |
| **Location** | SDK `@earendil-works/pi-coding-agent` — session JSONL (`getSessionFile()`, pi-agent-session-host.ts:443) |

**Description:** `debugLog` ghi ra **đường dẫn session file** (`pi-workflow-adapter.ts:353`). Nếu SDK serialize full assistant message (kể cả `reasoning_content`) vào session JSONL trong workspace, reasoning (có thể chứa chi tiết code/ticket nội bộ theo classification Internal của TDD §11.1) sẽ nằm trên disk. **Trạng thái kiểm chứng:** node_modules không có sẵn trong workspace để grep SDK — đánh giá này là **Potential, unverified**. Extension code của change này chắc chắn không persist thinking (store.save chỉ chứa chatHistory user/assistant text — `pi-workflow-adapter.ts:347-351`).

**Hành động khuyến nghị (follow-up, không blocking):** QA/DEV kiểm tra 1 session file thực tế sau khi chạy reasoning model — nếu reasoning có trong JSONL, ghi nhận vào dữ liệu classification của extension (session file = Internal, nằm trong workspace). Không ảnh hưởng verdict.

---

## Verification Checklist — 6 Trọng tâm Review (theo yêu cầu)

### 1. Data Exposure — ✅ PASS (1 Low ghi nhận)

| Câu hỏi | Bằng chứng | Kết luận |
|---------|-----------|----------|
| Thinking có chứa secret/API key nếu model echo? | Content hiển thị chỉ cho **chính user local** trong IDE của họ; cùng trust boundary với answer text (không cap) và tool result (cap 16KB — `pi-event-mapper.ts:31`); ephemeral — extension không persist (`store.save` chỉ chatHistory text — `pi-workflow-adapter.ts:347-351`), không log full content | Risk Low, chấp nhận được trong scope này |
| Trust boundary ext-host → webview? | VS Code webview là iframe sandboxed; THINKING_* chỉ ext→webview (`messageValidator.ts` direction split — webview không gửi được THINKING_* ngược); payload plain string qua structured clone, không eval | Boundary không thay đổi so với answer stream hiện có ✅ |
| Cần sanitize/length cap? | Sanitize: KHÔNG cần (sẽ thấy ở mục XSS — Svelte escape đủ). Cap: TDD §11.1 quyết định không cap — **đồng ý**,理由: (1) bounded bởi model thinkingMap ≤16,384 tokens; (2) cap giữa stream cắt đục live content phá UX; (3) nhất quán với answer stream. Đã ghi nhận thành SR-02 (Low, follow-up khi có persist) | Không block |

### 2. XSS — ✅ PASS (verified 2 lớp)

| Lớp | Bằng chứng |
|-----|-----------|
| Svelte escaping | `ThinkingBlock.svelte:74` — `<pre class="thinking-text">{content}</pre>` là **text interpolation** — Svelte compile thành `textContent`, tự động escape; **không có `{@html}`** trong ThinkingBlock/ChatMessage/ChatMessageList (grep toàn webview: duy nhất `DiagramBlock.svelte:68` dùng `{@html sanitizedSvg}` — pre-existing, đã sanitize, ngoài scope) |
| CSP defense-in-depth | `ChatHtmlBuilder.ts:23` — `default-src 'none'; script-src 'nonce-...'; style-src {cspSource} 'unsafe-inline'; img-src ...; connect-src 'none'` — kể cả escape thất bại: không script chạy (nonce), không exfiltrate network (connect-src 'none') |
| Model-controlled injection | Reasoning chứa `<script>`/`<img onerror>` → render thuần text, vô hại |

### 3. DoS / Performance — ✅ PASS (verified)

| Cơ chế | Bằng chứng | Đánh giá |
|--------|-----------|----------|
| Debounce 50ms | `stream-handler.ts:15,193-196` — max ~20 batch postMessage/s bất kể mật độ delta | Đủ — chống postMessage storm (NFR-1) |
| MAX_BUFFER_SIZE 100 | `stream-handler.ts:10,54-57` — flush sync khi vượt, chống tràn buffer | Đủ |
| Flush trước terminal | `stream-handler.ts:64,77,89` (emitStatus/emitComplete/emitError đều flush() trước) — giữ INV-4 ordering | Đúng — điều kiện để THINKING_END trước STREAM_TOKEN/ERROR |
| Cap tổng thinking chars | Xem SR-02 — không có, nhưng bounded bởi model maxTokens (≤~64KB) | Chấp nhận (Low) |
| Webview re-render | 20 batch/s × O(messages) map — hợp lý cho kích thước chat thông thường | OK |

### 4. Memory / Leak — ⚠️ PASS WITH FINDING (SR-01 Medium + SR-03/SR-04 Low)

| Path | `thinkingActive` sau path | Bằng chứng |
|------|---------------------------|-----------|
| Complete sau answer | Rỗng (lookup miss) | StreamProtocolAdapter.ts:122-126 |
| Complete khi thinking mở | Xóa + THINKING_END | StreamProtocolAdapter.ts:122-125 |
| PI_SESSION_TIMEOUT | Đóng qua complete (emitComplete trước chat:error) | pi-workflow-adapter.ts:331-339 |
| Budget exceeded | Đóng qua complete | pi-workflow-adapter.ts:360-368 |
| **PI_TURN_FAILED** | **KẸT (G-1 gap)** — fix bắt buộc theo TDD | pi-workflow-adapter.ts:545-548 + StreamProtocolAdapter.ts:88-97 |
| reset() | Clear cả 3 — nhưng **không có call site production** (SR-04) | StreamProtocolAdapter.ts:61-65 |
| Crash mid-turn (extension host die) | Toàn bộ state in-memory biến mất cùng process — tự dọn | Không leak vượt quá process lifecycle |
| Webview `thinking` string | `startThinking` reset về `''` (chatStore.ts:146-153); giữ content sau endThinking — cùng lifecycle với answer text, không persist | OK |

### 5. Logging — ✅ PASS (không data leak)

| Điểm kiểm | Bằng chứng |
|-----------|-----------|
| debugLog content | Chỉ metadata: `via=session/legacy`, `tools=N`, `text=Nch` (độ dài), duration, session file path — `pi-workflow-adapter.ts:353,516`; `pi-provider.ts:336,343,346,359` — **không log thinking content** |
| store.save / telemetry | chatHistory chỉ user + assistant text — thinking KHÔNG được persist bởi extension code |
| Lưu ý SR-06 | Potential: SDK session JSONL có thể chứa reasoning (unverified — node_modules không có để kiểm chứng); follow-up check 1 file thực tế |

### 6. Dependency — ✅ PASS (zero new dependency)

| Điểm kiểm | Bằng chứng |
|-----------|-----------|
| fixFiles | STATUS.json:33-44 — 10 file source, **không có package.json/package-lock** → không thêm dependency, không đổi version |
| Contracts | Dùng sẵn: `PiStreamChunk` ('thinking' đã có — pi-provider-types.ts), `StreamEventType` (state-types.ts:12), `StreamChunkEvent.eventType` (IStreamProtocolAdapter.ts:36), THINKING_* messages (messages.ts:102-104, từ SA4E-85) |
| Supply chain | Không có tên dependency mới → không typosquatting surface mới ✅ |

---

## Remediation Priority

| Priority | Finding | Effort | Impact | Blocking? |
|----------|---------|--------|--------|-----------|
| 1 | **SR-01 = G-1**: đóng thinking block trên error path (TDD §5.2 đã spec) | Low (+3 dòng trong PR đã định) | Chống block kẹt "Thinking..." + leak state; invariant INV-1 đầy đủ | **Có — đã bắt buộc trong TDD** |
| 2 | **SR-03**: `cleanup()` xóa `thinkingActive` (+1 dòng, defense-in-depth) | Low | INV-1 enforcement tại 1 điểm duy nhất; chống leak tương lai | Không (khuyến nghị fold cùng PR G-1) |
| 3 | **SR-02**: cap thinking chars khi persist (follow-up ticket) | Low | Hardening data exposure khi thinking ra khỏi ephemeral | Không — out-of-scope hiện tại |
| 4 | **SR-04**: wire `reset()` tại ranh giới turn (backlog riêng) | Medium | Chống tích lũy state vô hạn trên đường PI_TURN_FAILED | Không — pre-existing, ngoài blast-radius |
| 5 | **SR-06**: verify session file có chứa reasoning | Low (1 manual check) | Data-at-rest classification chính xác | Không |

---

## Recommendations Summary

### Immediate (trước khi implement — đã có trong TDD)
1. Implement **G-1** đúng spec TDD §5.2 (THINKING_END trước STREAM_ERROR, cùng batch) — đồng thời chính là fix security SR-01.
2. Implement **G-3** guard `if (!content) break;` — defense-in-depth ranh giới cuối trước webview (INV-5).

### Short-term (khuyến nghị, non-blocking)
1. **SR-03**: thêm `this.thinkingActive.delete(streamId)` vào `cleanup()` — 1 dòng, fold cùng PR G-1; cập nhật 1 câu TDD §5.2.
2. **SR-06**: sau khi DEV chạy model reasoning, kiểm tra session JSONL — nếu có reasoning, ghi nhận classification (Internal) vào docs.

### Long-term (backlog)
1. **SR-04**: thiết kế lifecycle `reset()` đúng ranh giới turn (cần tôn trọng continuation semantics G-2 — không reset giữa các attempt cùng turn).
2. **SR-02**: khi thinking được persist (ticket tương lai), thêm `MAX_THINKING_CHARS` ở webview layer.
3. Ghi chú doc: `extension/package.json:522` có `svelte: ^5.56.10` (devDeps) trong khi TDD §1.4 ghi "Svelte 4" — ThinkingBlock dùng legacy syntax (tương thích Svelte 5); nên đồng bộ mô tả stack trong TDD khi có dịp cập nhật (không phải security issue).

---

## Verdict

> ## ✅ **PASS — proceed Phase 4 (Test Planning)**
>
> Thiết kế SA4E-365 **không giới thiệu surface tấn công mới**: zero protocol change, zero dependency mới, zero trust-boundary expansion; webview render được bảo vệ 2 lớp (Svelte escape + CSP nonce); postMessage path có debounce + buffer bound; logging sạch.
>
> **Điều kiện kèm theo (non-blocking với thiết kế, bắt buộc với implementation):**
> - **G-1 phải được implement đúng TDD §5.2** — đây đồng thời là remediation của finding Medium duy nhất (SR-01). QA phải khóa bằng TC-06 (INV-1/INV-4).
> - Khuyến nghị fold **SR-03** (+1 dòng `cleanup()`) vào cùng PR — không đổi thiết kế, không cần SA update TDD ngoài 1 câu note.

---

## Appendix

### A. Methodology
- Static design review: đối chiếu TDD v1.0 ↔ mã nguồn hiện hành (đọc trực tiếp 15+ file, line-verified mọi claim trọng yếu của TDD).
- OWASP Top 10 (2021) mapping, CWE classification, CVSS v3.1 scoring (local-impact vector).
- Trust-boundary analysis theo mô hình VS Code Extension Host ↔ Webview iframe.
- **Không** thực hiện dynamic testing/pentest (đúng phạm vi Phase 3.7 — security code review runtime sẽ ở Phase 6.x).

### B. Scope Limitations
- Không kiểm chứng được SDK nội bộ `@earendil-works/*` (node_modules không có trong workspace) — SR-06 đánh dấu Potential/unverified.
- Không đo runtime memory/perf — đánh giá DoS dựa trên đọc code (debounce/buffer/model caps).
- Các panel webview khác (login, pega-ingester, settings) chỉ dùng đối chiếu CSP, không audit toàn diện.

### C. Glossary
- **CWE**: Common Weakness Enumeration — **CVSS**: Common Vulnerability Scoring System
- **INV-x**: Invariants trong TDD §4.2 (INV-1: thinkingActive rỗng sau terminal path...)
- **G-x**: Gap ID từ FSD/TDD (G-1: error path không đóng block; G-3: guard content rỗng...)

---

*End of Document — SA4E-365 SECURITY-REVIEW v1.0 (Security Agent, 2026-10-16)*
