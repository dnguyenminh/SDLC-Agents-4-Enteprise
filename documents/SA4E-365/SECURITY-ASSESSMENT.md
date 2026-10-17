# 🔒 Security Assessment Report — SA4E-365 (Phase 5.7 Code Review)

## Document Information

| Field | Value |
|-------|-------|
| Project | SDLC Agents 4 Enterprise — Extension (SDLC CHAT) |
| Ticket | [SA4E-365](https://jiraassist.atlassian.net/browse/SA4E-365) — Forward `thinking_delta` to webview ThinkingBlock |
| Phase | 5.7 — Security Code Review (post-implementation) |
| Scope | Commit `498f9c1` trên branch `SA4E-365` ("fix(chat): forward thinking_delta...") — 17 files, +628/−37. Diff-only audit (không re-audit toàn repo) |
| Baseline | Diff `5194d8d..498f9c1` · Design review: documents/SA4E-365/SECURITY-REVIEW.md v1.0 (Phase 3.7, verdict PASS) |
| Date | 2026-10-16 |
| Assessor | Security Agent (static code review — không dynamic test) |
| Version | 1.0 |

---

## Executive Summary

Implement của SA4E-365 về **mặt bảo mật luồng thinking là đúng thiết kế và sạch**: G-1 đóng thinking block trước STREAM_ERROR đúng thứ tự INV-4, G-3 guard delta rỗng ở **mọi hop** của chuỗi F1–F8, SR-03 cleanup idempotent trên cả 3 state map, không có XSS surface mới (0 innerHTML/{@html} trong diff), không log thinking content, không thêm dependency, không đổi trust boundary. SR-01 và SR-03 từ Phase 3.7 **chính thức CLOSED** bằng code + test (TC-04/05/09/15).

Tuy nhiên, review phát hiện **1 finding High ngoài phạm vi chức năng nhưng nằm trong diff**: commit `498f9c1` chứa các hunk của SA4E-364 (wiring MCP bridge tools vào `pi-agent-session-host.ts` và `pi-workflow-adapter.ts`) và **import/gọi `buildMcpBridgeAgentTools` — một export KHÔNG tồn tại trong cây source của commit này**. Hàm chỉ được định nghĩa ở commit `180b150` trên branch `SA4E-364` (không phải ancestor của `498f9c1`). Hệ quả: `tsc -p ./` (build script) và `esbuild --production` (vscode:prepublish) đều **fail**, và runtime legacy chat path sẽ TypeError. Claim "2990 tests GREEN" chỉ giải thích được do vitest (esbuild transform, no typecheck, lazy ESM binding) chịu được missing named export cho tới khi hàm được gọi. Đây là lỗi **software/data integrity (A08)** — commit không self-contained, không build được độc lập → blocker cho Phase 6.

Ngoài ra, **SR-06 được nâng từ Potential → VERIFIED**: kiểm chứng trực tiếp source SDK `@earendil-works/pi-coding-agent` (đã có trong node_modules, khác với thời điểm Phase 3.7) cho thấy session JSONL tại `.pi/sessions/` **persist reasoning content** (ThinkingContent trong AssistantMessage được JSON.stringify nguyên vẹn), đồng thời `.pi/sessions/` **không nằm trong .gitignore** → rủi ro commit transcript (chứa prompt + reasoning + tool results) vào VCS.

**Overall Risk Rating: MEDIUM** (riêng luồng thinking: LOW; blocker là integrity của commit)

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 1 (F-1 — build integrity / cross-branch leakage) |
| 🟡 Medium | 1 (F-2 — reasoning persisted + gitignore gap, SR-06 verified) |
| 🔵 Low | 2 (F-3, F-4) |
| ℹ️ Informational | 2 (F-5, F-6) |

---

## Verdict

> ## ❌ **FAIL — DEV fix required trước khi proceed Phase 6**
>
> **Lý do duy nhất:** F-1 (High) — commit `498f9c1` không tự build được (`tsc`/`esbuild` fail do thiếu export `buildMcpBridgeAgentTools`; hàm nằm trên branch `SA4E-364`, không phải ancestor). Một commit broken-build không thể là nền cho Phase 6 Testing (STP/STC chạy trên artifact nào?).
>
> **Phần security của luồng thinking: PASS chất lượng.** Toàn bộ 7 trọng tâm check của luồng THINKING_* đều đạt; SR-01/SR-03 đã closed đúng spec TDD §5.2. Sau khi DEV fix F-1 (merge/rebase SA4E-364 vào trước, hoặc strip các hunk SA4E-364 khỏi commit), **không cần re-review toàn bộ** — chỉ cần delta-check: `git merge-base --is-ancestor 180b150 <new-commit>` + chạy `npm run compile` xanh → tự động PASS, proceed Phase 6.

---

## Đối chiếu SR từ Phase 3.7 — Closure Status

| SR | Nội dung Phase 3.7 | Status tại 498f9c1 | Bằng chứng |
|----|--------------------|--------------------|------------|
| **SR-01** (Medium) | G-1: error path không đóng thinkingActive → state leak (CWE-459) | ✅ **CLOSED** | `StreamProtocolAdapter.ts:84-89` — error branch xóa `thinkingActive` + emit `THINKING_END` **trước** `STREAM_ERROR` (đúng spec TDD §5.2, INV-4). Wired cho PI_TURN_FAILED qua `ChatEngineAdapter.ts:268-277` (chat:error → eventType 'error' với `lastStreamId`). Test: TC-05 + `stream-error-mapping.test.ts` (+21 dòng) |
| **SR-03** (Low) | cleanup() xóa thinkingActive (defense-in-depth) | ✅ **CLOSED** | `StreamProtocolAdapter.ts:182-185` — `this.thinkingActive.delete(streamId)` trong `cleanup()`, comment cite đúng SR-03/CWE-459 |
| **SR-02** (Low) | Không cap thinking chars — accepted risk | ⏸ Open-accepted (đúng quyết định TDD §11.1, không thuộc scope diff này) | Không có code cap — như thiết kế |
| **SR-04** (Low) | reset() dead code — backlog | ⏸ **Vẫn Open** (pre-existing, đã thống nhất backlog riêng) | Grep production call site tại 498f9c1: không có. `reset()` giờ clear cả thinkingActive (:64) — đúng nhưng vẫn chưa được wire |
| **SR-05** (Info) | messageValidator chỉ validate discriminant | ⏸ Không thay đổi (không cần hành động — đã kết luận Phase 3.7) | `messageValidator.ts:16-17` có THINKING_TOKEN/END trong EXTENSION_MESSAGE_TYPES (direction ext→webview) |
| **SR-06** (Info/Potential) | SDK session JSONL có thể persist reasoning — chưa kiểm chứng | ⚠️ **VERIFIED — promoted thành finding F-2 (Medium)** | Xem Finding F-2 |

---

## Kết quả 7 trọng tâm check (theo yêu cầu)

### 1. OWASP/XSS — ✅ PASS
Diff **không giới thiệu** bất kỳ `innerHTML`/`v-html`/`{@html}` mới nào (verify: toàn bộ 17 file thuộc extension-side + tests; grep webview tại 498f9c1: duy nhất `DiagramBlock.svelte:68` `{@html sanitizedSvg}` và `ContextMenuView.ts` — pre-existing, ngoài diff). THINKING_TOKEN render qua Svelte text interpolation (`ThinkingBlock.svelte` — không đổi trong diff) + CSP nonce + `connect-src 'none'` (2 lớp, verified Phase 3.7). Reasoning chứa `<script>` render thuần text — vô hại.

### 2. Input validation (G-3) — ✅ PASS, không có bypass path
Guard tồn tại ở **mọi hop**, bất biến INV-3/5 giữ vững:
- `pi-event-mapper.ts:121` — `if (ame && ame.type === 'thinking_delta' && ame.delta)` (delta rỗng không vào collector/chunks)
- `pi-agent-session-host.ts:495` + `:542` — `if (last?.type === 'thinking' && last.content)` (cả 2 loop)
- `pi-workflow-adapter.ts:313` + `:537` — `chunk.content` truthy check (cả streaming + legacy loop)
- `StreamProtocolAdapter.ts:103` — `if (!event.content) return messages;` — **absolute no-op**, THINKING_START chỉ mở khi delta đầu tiên non-empty
- Test: TC-09 (undefined/empty → `[]`, block stays open), TC-15 (leading empty không mở block)

Edge case còn lại (informational, xem F-5): delta truthy-nhưng-không-phải-string (runtime anomaly từ SDK) sẽ render `[object Object]` — cosmetic, sender là trusted extension host.

### 3. Secrets/logging — ✅ PASS
Diff chỉ thêm **2 debugLog**, cả hai chỉ metadata: `[PiSessionHost] mcp bridge absent...` (`pi-agent-session-host.ts:339`) và `[PiWorkflowAdapter] bridge tool skipped (exists): ${name}` (`pi-workflow-adapter.ts:501` — tool NAME, không phải args/result). **Không có dòng nào log thinking content, token, hoặc param values.** Scan toàn bộ added lines: duy nhất test fixture `apiKey: 'k'` (dummy). `debugError('[PiWorkflowAdapter] turn failed', err)` là context (pre-existing).

### 4. State/memory (thinkingActive lifecycle) — ✅ PASS (INV-1 đầy đủ)
| Path | thinkingActive sau path | Bằng chứng @498f9c1 |
|------|------------------------|---------------------|
| Error (mọi variant, kể cả PI_TURN_FAILED) | Đóng: THINKING_END **trước** STREAM_ERROR | StreamProtocolAdapter.ts:87-89 |
| Complete (thinking mở hoặc không) | Đóng: THINKING_END trước STREAM_END | :127-129 |
| First answer token | Đóng: THINKING_END trước STREAM_TOKEN | :112-114 |
| Orphan error | cleanup() xóa (idempotent) | :185 |
| reset() | Clear cả 3 map | :64 — nhưng vẫn dead code (SR-04, backlog) |

**Leak path còn lại:** PI_TURN_FAILED mid-turn vẫn giữ `streamToMessage`/`startedStreams` entries — **pre-existing, đúng SR-04 backlog** (thinkingActive đã được G-1 fix đóng). Không leak mới do diff này.

### 5. Error handling — ✅ PASS (1 Low ghi nhận)
STREAM_ERROR message = `${code}: ${message}` trong đó message = `(err as Error).message` từ PI_TURN_FAILED (`pi-workflow-adapter.ts:545-547`) — **không đổi trong diff** (pre-existing). Có thể chứa provider URL/internal path nhưng chỉ hiển thị cho chính user local (cùng trust boundary với webview) → F-3 (Low, hardening). Không credentials trong error paths của diff.

### 6. Dependencies — ✅ PASS (zero new package)
17 file của commit: **không có package.json/package-lock.json**. Không typosquatting surface mới. *(Nhưng xem F-1 — dependency nội bộ liên-branch bị lệch.)*

### 7. SR-06 — ⚠️ VERIFIED (Potential → thực chất)
Kiểm chứng **trực tiếp trên source SDK** `@earendil-works/pi-coding-agent` (node_modules đã có mặt — khác thời điểm Phase 3.7):
- `dist/core/session-manager.js` — `appendMessage(message)` → `JSON.stringify({type:'message', ..., message})` → `appendFileSync(sessionFile)` (dòng ~812): **persist nguyên vẹn message object**
- `pi-ai/dist/types.d.ts:266` — `AssistantMessage.content` chứa `ThinkingContent` blocks `{type:'thinking', thinking: string, thinkingSignature?}`
- Session dir: `workspaceRoot/.pi/sessions` (`pi-agent-session-host.ts` — `path.join(workspaceRoot, '.pi', 'sessions')`); file JSONL được tạo khi user gửi message đầu tiên
- **`.pi/` KHÔNG có trong .gitignore** (`git check-ignore` fail; hiện chỉ `.pi/mcp.json` được track)

→ Kết luận: **reasoning ĐƯỢC persist vào disk trong workspace, và directory đó có thể bị commit nhầm vào VCS** → Finding F-2 (Medium). Đây không phải regression của diff (SDK behavior + pre-existing), nhưng SR-06 follow-up đã được yêu cầu verify và giờ đã verified.

---
## Detailed Findings

### Finding F-1: Commit import/gọi `buildMcpBridgeAgentTools` không tồn tại trong cây source — broken build + cross-branch contamination

| Attribute | Value |
|-----------|-------|
| **Severity** | 🟠 High |
| **OWASP Category** | A08:2021 — Software and Data Integrity Failures |
| **CWE** | CWE-705: Improper Operational Control of Resource; CWE-1357: Reliance on Uncontrolled Component (cross-branch) |
| **CVSS Score** | 7.1 (AV:L/AC:L/PR:L/UI:N/S:U/C:N/I:L/A:H) — build/packaging fail + legacy chat path DoS |
| **Location** | extension/src/pi-workflow/pi-agent-session-host.ts:36,338 · extension/src/pi-workflow/pi-workflow-adapter.ts:24,497 |
| **Status** | **Open — blocker verdict** |

**Description:**
Commit `498f9c1` (message: "fix(chat): forward thinking_delta...") còn chứa các hunk wiring SA4E-364 (MCP bridge tools). Hai file thêm `import { buildMcpBridgeAgentTools } from '../pi-agent/extensions/mcp-bridge-extension'` và gọi hàm này — nhưng **export đó không tồn tại** trong `mcp-bridge-extension.ts` tại commit này (blob `1c6dfdb`, verify 2 lần bằng `git cat-file`: 0 match cho `buildMcpBridgeAgentTools`, kể cả case-insensitive). Hàm được định nghĩa ở commit `180b150` ("SA4E-364: wire MCP bridge tools...") — `git merge-base --is-ancestor 180b150 498f9c1` = **không phải ancestor**; `git branch --contains 180b150` = chỉ `SA4E-364`/origin.

**Evidence:**
```typescript
// pi-workflow-adapter.ts:24 + :497 @498f9c1 — import + gọi không điều kiện
import { buildMcpBridgeAgentTools } from '../pi-agent/extensions/mcp-bridge-extension';
...
const bridgeTools = buildMcpBridgeAgentTools(this.mcpBridge); // ← TypeError/TS2305

// pi-agent-session-host.ts:36 + :337-338 — có short-circuit nên latent
import { buildMcpBridgeAgentTools } from '../pi-agent/extensions/mcp-bridge-extension';
const bridgeTools: AgentTool[] =
  opts.mcpBridge instanceof McpBridge ? buildMcpBridgeAgentTools(opts.mcpBridge) : [];

// mcp-bridge-extension.ts @498f9c1 (blob 1c6dfdb) — exports thực tế:
// BridgeOptions, BridgeAuditEntry, bridgeRequiresApproval,
// default mcpBridgeExtension, { createExecuteHandler, TOOLS }
// → KHÔNG có buildMcpBridgeAgentTools
```

**Tại sao tests vẫn "GREEN" (2990) nhưng build fail:**
- `extension/package.json`: `"build": "tsc -p ./"` → **TS2305** (Module has no exported member) → fail chắc chắn.
- `"vscode:prepublish"` → `esbuild-production` → esbuild bundling **fail** với missing named export ("No matching export").
- vitest dùng esbuild transform + vite-node lazy binding: named import thiếu chỉ thành `undefined`; `session-host` short-circuit bởi `instanceof McpBridge` (tests không truyền bridge → không gọi) → suite pass. Legacy path (`:497`) gọi không điều kiện — chỉ cần 1 test đi qua legacy executeTurn là nổ.

**Impact:**
1. Commit không self-contained: `npm run compile`, `vsce package` đều fail → không tạo được artifact cho Phase 6/7.
2. Runtime (nếu build vòng được typecheck): mọi legacy chat turn fail TypeError → PI_TURN_FAILED — mất chức năng chat.
3. Process integrity: commit message scope (SA4E-365) ≠ nội dung (chứa SA4E-364 hunks) → traceability/reviewability giảm; CI không chạy typecheck nên để lọt.

**Remediation (chọn 1, khuyến nghị 1):**
```bash
# Option 1 (khuyến nghị): đưa định nghĩa vào branch — rebase/merge SA4E-364 trước
git merge-base --is-ancestor 180b150 <fixed-commit> && echo "F-1 RESOLVED"
# Option 2: strip các hunk SA4E-364 khỏi commit (giữ commit thuần SA4E-365)
```
Và **bắt buộc thêm CI gate**: chạy `tsc --noEmit` (hoặc `npm run compile`) trong CI — vitest-only không bắt được missing export.

**References:** OWASP A08; CWE-1357; esbuild named-export semantics; TS2305.

---

### Finding F-2: Reasoning (thinking) được SDK persist vào session JSONL trong workspace + `.pi/sessions` không gitignored (SR-06 VERIFIED)

| Attribute | Value |
|-----------|-------|
| **Severity** | 🟡 Medium |
| **OWASP Category** | A02:2021 — Cryptographic Failures (cleartext data-at-rest); A05 (config hygiene) |
| **CWE** | CWE-312: Cleartext Storage of Sensitive Information; CWE-538: Insertion of Sensitive Information into Externally-Accessible File (git) |
| **CVSS Score** | 5.5 (AV:L/AC:L/PR:L/UI:N/S:U/C:H/I:N/A:N) |
| **Location** | SDK `node_modules/@earendil-works/pi-coding-agent/dist/core/session-manager.js` (~:812, appendMessage/JSON.stringify) · session dir `.pi/sessions` (pi-agent-session-host.ts) · `.gitignore` (thiếu entry) |
| **Status** | Open (mới — SR-06 promoted từ Potential sau khi verify SDK source) |

**Description:**
Phase 3.7 đánh dấu SR-06 là Potential vì không kiểm chứng được SDK. Hiện node_modules có sẵn → đã verify source-level: `SessionManager.appendMessage` serialize **nguyên vẹn** AssistantMessage — và `AssistantMessage.content` có kiểu `ThinkingContent` (`{type:'thinking', thinking: string}`, `pi-ai/dist/types.d.ts:266`). Mỗi turn reasoning sẽ ghi thinking text vào `workspaceRoot/.pi/sessions/*.jsonl` (file tạo từ user message đầu tiên). Đồng thời `.pi/` không được ignore — chỉ `.pi/mcp.json` (config local, không secret) được track; các session JSONL sẽ xuất hiện untracked và dễ bị `git add -A` commit lên remote (chứa prompt user + reasoning + tool results — dữ liệu classification Internal).

**Impact:** Leakage reasoning/code/ticket nội bộ ra VCS organization nếu commit nhầm; reasoning tồn tại cleartext trên disk (same-user local — chấp nhận được, nhưng cần classification rõ).

**Remediation:**
```gitignore
# .gitignore — F-2 fix
.pi/sessions/
```
Ghi nhận classification: session file = Internal (docs); cân nhắc retention/cleanup khi dispose host; follow-up upstream (SDK) nếu cần redact thinking khi persist.

**References:** CWE-312, CWE-538; SECURITY-REVIEW.md SR-06.

---

### Finding F-3: PI_TURN_FAILED error message forward nguyên `err.message` về webview (pre-existing, unchanged)

| Attribute | Value |
|-----------|-------|
| **Severity** | 🔵 Low |
| **OWASP Category** | A05:2021 — Security Misconfiguration (info disclosure) |
| **CWE** | CWE-209: Generation of Error Message Containing Sensitive Information |
| **CVSS Score** | 3.1 (AV:L/AC:L/PR:L/UI:N/S:U/C:L/I:N/A:N) |
| **Location** | extension/src/pi-workflow/pi-workflow-adapter.ts:545-547 → ChatEngineAdapter.ts:275 |
| **Status** | Open (pre-existing — không thuộc blast-radius diff, ghi nhận hardening) |

**Description:** `message: (err as Error).message` có thể chứa provider URL/internal path; hiển thị trong webview cho chính user local — trust boundary không đổi, không credentials. Ghi nhận để align theo hướng error-code map khi có dịp (không block).

---

### Finding F-4: `reset()` vẫn dead code trong production (SR-04 — backlog, unchanged)

| Attribute | Value |
|-----------|-------|
| **Severity** | 🔵 Low |
| **OWASP Category** | A04:2021 — Insecure Design; CWE-459 |
| **CVSS Score** | 3.1 |
| **Location** | extension/src/chat/engine/StreamProtocolAdapter.ts:61-65 (định nghĩa); không có production call site @498f9c1 (grep verified) |
| **Status** | Open — đúng kế hoạch backlog Phase 3.7 (pre-existing) |

**Description:** `reset()` giờ clear cả `thinkingActive` (:64) — đúng — nhưng vẫn chỉ test gọi nó. Leak `streamToMessage`/`startedStreams` trên PI_TURN_FAILED non-orphan vẫn tích lũy chậm. Giữ nguyên quyết định backlog (cần design ranh giới turn riêng, không gộp PR này).

---

### Finding F-5 (Informational): `appendThinkingToken` nối chuỗi token chưa validate shape

`chatStore.ts:156-163` — token undefined sẽ nối chuỗi "undefined"; delta non-string truthy (runtime anomaly) render `[object Object]`. Sender là trusted extension host trong cùng process; messageValidator chặn webview→ext (`direction split`). Cosmetic — không inject được. Không cần hành động (khớp SR-05).

### Finding F-6 (Informational — ghi nhận tích cực): các hunk SA4E-364 lọt vào commit mang security controls tốt

Prompt-metadata override (`promptSnippet/promptGuidelines: undefined` — session-host :435-442) **giảm prompt-injection surface** từ tool metadata; `instanceof McpBridge` narrow → fail-safe `[]`; skip-if-exists (BR-06) chống tool shadowing; bridge kế thừa SEC-324-03 (allowlist + approval + audit, không log param values). Chỉ trích duy nhất: cross-branch contamination (F-1).

---

## Findings by OWASP Top 10 (2021)

| Category | Kết luận |
|----------|----------|
| A01 — Broken Access Control | No issues ✅ — THINKING_* ext→webview only; validator direction split; cùng quyền với answer stream |
| A02 — Cryptographic Failures | **F-2 (Medium)** — reasoning cleartext-at-rest trong session JSONL + gitignore gap |
| A03 — Injection | No issues ✅ — 0 innerHTML/{@html} mới; Svelte escape + CSP nonce 2 lớp |
| A04 — Insecure Design | F-4 (Low, pre-existing backlog) — reset() dead code |
| A05 — Security Misconfiguration | F-3 (Low) — error message chi tiết về webview local |
| A06 — Vulnerable/Outdated Components | No issues ✅ — zero new dependency |
| A07 — AuthN/AuthZ Failures | N/A — không có auth surface mới |
| A08 — Software & Data Integrity | **F-1 (High)** — broken self-containment/cross-branch leakage |
| A09 — Logging & Monitoring Failures | No issues ✅ — debugLog metadata-only; 0 thinking content logged |
| A10 — SSRF | N/A — không outbound request mới |

---

## Remediation Priority

| # | Finding | Action | Effort | Blocking? |
|---|---------|--------|--------|-----------|
| 1 | **F-1** | Rebase/merge SA4E-364 (đưa `180b150` vào ancestor) hoặc strip hunk SA4E-364 khỏi commit; chạy `npm run compile` xanh; **thêm CI typecheck gate** | Low | **CÓ — verdict FAIL** |
| 2 | **F-2** | Thêm `.pi/sessions/` vào .gitignore + ghi nhận classification Internal | Low (1 dòng) | Không (khuyến nghị gộp ngay) |
| 3 | F-3 | Error-code mapping thay raw err.message (ticket riêng) | Medium | Không |
| 4 | F-4 | Wire reset() tại ranh giới turn (backlog SR-04, design riêng) | Medium | Không |

---

## Recommendations Summary

### Immediate (block Phase 6)
1. **Fix F-1**: đảm bảo `buildMcpBridgeAgentTools` tồn tại trong cây branch SA4E-365 (merge SA4E-364 trước) hoặc remove các hunk SA4E-364 khỏi commit; verify `git merge-base --is-ancestor 180b150 <new>` + `npm run compile` + full suite xanh trên CI **có typecheck**.
2. Sau fix: delta re-review (chỉ F-1) — luồng thinking đã PASS, không cần re-audit.

### Short-term
1. **F-2**: gitignore `.pi/sessions/`; ghi classification Internal cho session JSONL vào docs.
2. Fold SR-04 design (wire reset) vào backlog Q-next như đã thống nhất.

### Long-term
1. F-3: stable error-code surface cho webview (loại bỏ raw err.message).
2. Cân nhắc SDK upstream: redact/optional thinking khi persist session; CR khi thinking bắt đầu được persist bởi extension (SR-02 follow-up `MAX_THINKING_CHARS`).

---

## Appendix

### A. Methodology
- Diff-only static review: `git diff 5194d8d..498f9c1` (17 files) + đọc context pre-existing tại các line chạm.
- Verify blob-level bằng `git cat-file`/`git ls-tree` cho claim missing-export; `git merge-base`/`git branch --contains` cho cross-branch analysis.
- SDK verification: đọc source `@earendil-works/pi-coding-agent` + `pi-ai` type defs trong node_modules (khác Phase 3.7 — lúc đó chưa có node_modules).
- Grep toàn cây tại 498f9c1 cho: innerHTML/{@html}, debugLog content, secrets patterns, reset() call sites.
- **Không** chạy tsc/esbuild thực tế (working tree đang ở branch khác SA4E-362) — kết luận F-1 dựa trên bằng chứng blob + import/export analysis (deterministic: TS2305 + esbuild "No matching export" là semantics cố định, không heuristic).
- Không dynamic testing/pentest (phạm vi Phase 5.7).

### B. Scope Limitations
- Đánh giá runtime memory/perf dựa trên đọc code (debounce/buffer verified Phase 3.7, không đổi trong diff).
- Không kiểm chứng runtime hành vi SDK persist (đọc source, không chạy session thực).
- Chưa test các panel webview khác; hạ tầng VS Code/Electron ngoài scope.

### C. Glossary
- **INV-x**: Invariants TDD §4.2 (INV-1: thinkingActive rỗng sau terminal; INV-2: không double-close; INV-3: START kèm ≥1 token; INV-4: THINKING_END trước terminal message; INV-5: 0 empty token)
- **G-x**: Gap ID FSD/TDD (G-1 error path; G-3 empty guard) · **SR-x**: Finding Phase 3.7
- **CWE/CVSS/OWASP**: chuẩn phân loại/punto đánh giá rủi ro

---

*End of Document — SA4E-365 SECURITY-ASSESSMENT v1.0 (Security Agent, 2026-10-16)*
