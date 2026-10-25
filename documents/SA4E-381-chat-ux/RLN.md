# RLN — SA4E-381-chat-ux: Release Notes

**Release version:** 1.55.6  
**Release date:** 2026-10-25  
**Ticket:** SA4E-381-chat-ux  
**Author:** DevOps Agent  
**Status:** Final  

---

## 1. What's New

**SDLC CHAT Transcript Redesign** — hai vấn đề chính được giải quyết:

### Issue 2 — Thinking block 3 trạng thái
Thinking block hiện hỗ trợ 3 trạng thái rõ ràng:
- **STREAMING:** đang suy nghĩ, hiển thị pulsing dot, violet left rail, max-height 220px.
- **COLLAPSED:** thu gọn, hiển thị chevron `▸` + `Thinking · N chars · Ns`, min-height 28px.
- **EXPANDED:** mở rộng, chevron `▼`, nội dung thinking hiển thị đầy đủ.

Trạng thái người dùng (click/Enter/Space) được lưu lại (`data-user-managed` + `thinkingCollapsed`) và tồn tại qua reload/replay. Thinking whitespace-only bị loại bỏ. Cuộn theo chỉ khi người dùng ở gần đáy (follow-only-at-bottom).

### Issue 3 — Work-trace container mỗi lượt
Mỗi lượt assistant hiện có một work-trace container gộp tất cả thinking blocks và tool-call blocks của lượt đó vào một đơn vị collapsible duy nhất:
- **Q → trace → A:** Câu hỏi ở gốc, work-trace ở giữa, câu trả lời ở gốc.
- Trace tự co lại (auto-collapse) khi lượt hoàn thành (`chat:streamComplete`), trừ khi người dùng đã toggle thủ công (sticky).
- Summary dòng một: `⚙ Work trace · N tools · ~tokens tokens · Ns · thinking k×`.
- Peer rows và system/error rows stays at transcript root (không nằm trong trace).
- Export/copy byte-identical với bản cũ.

---

## 2. Technical Changes

### Modified files (16 webview + 1 host)

**New files (3):**
- `extension/webview-assets/chat/chat-tabroute.js` — single choke point `S.routeStreamEvent(msg)`
- `extension/webview-assets/chat/chat-trace.js` — `S.openTrace/closeTrace/adoptIntoTrace/updateTraceSummary`
- `extension/webview-assets/chat/chat-jump-pill.js` — scroll sentinel + jump-to-latest pill

**Modified files (14):**
- `extension/webview-assets/chat/chat-cycle.js` — per-tab cycle state
- `extension/webview-assets/chat/chat-stream.js` — render gate + follow-only-at-bottom
- `extension/webview-assets/chat/chat-thinking.js` — 3 states, chevron ▸/▼, metadata chars/duration
- `extension/webview-assets/chat/chat-tools.js` — tool container inside trace
- `extension/webview-assets/chat/chat-toolcall.js` — tool block inside trace, approval force-opens
- `extension/webview-assets/chat/chat-toolupdate.js` — status transitions inside trace
- `extension/webview-assets/chat/chat-tool-helpers.js` — approval bar + adopt mechanics
- `extension/webview-assets/chat/chat-messages.js` — replay grouping into one trace per turn
- `extension/webview-assets/chat/chat-tabs.js` — composite badge + switch tab scroll rule
- `extension/webview-assets/chat/chat-tabsync.js` — persist/restore streaming/unread/thinkingCollapsed
- `extension/webview-assets/chat/chat.css` + `chat-blocks.css` — new class contracts
- `extension/src/chat-panel/ChatHtmlBuilder.ts` — SCRIPTS array add 3 new modules

### Host protocol
**Không thay đổi.** `originTabId` đã có từ SA4E-381 Issue 1 (TDD §3.1). Không edit `message-protocol.ts`, `stream-handler.ts`, `chat-panel-provider.ts`.

---

## 3. Breaking Changes

**None.**  
- Host protocol không đổi.
- `tab.messages` stays flat chronological (tracé là presentation-only — TDD §10.3).
- Export/copy byte-identical với pre-change build (TDD §10.2).
- Backward compatible: absent new fields default to `collapsed=false`, `streaming=false`, `unread=0` (TDD §9).

---

## 4. Bugs Fixed

| Bug | Severity | Fix |
|-----|----------|-----|
| Thinking block co 1 dòng (không thể mở lại) | High | 3 trạng thái STREAMING/COLLAPSED/EXPANDED với chevron ▸/▼ rõ ràng (Issue 2) |
| Response bleed cross-tab (streaming pollute tab khác) | Medium | Render gate `targetTabId === S.activeTabId` (chat-tabroute.js, chat-stream.js) |
| Tool leak sang tab khác | Medium | Background tab → model only; active tab → block inside trace (chat-toolcall.js) |

---

## 5. Dependencies

- **Pre-requisite:** SA4E-381 Issue 1 (`originTabId` stamping) — đã deploy trước.
- **Related tickets:** SA4E-381 (parent), SA4E-372, SA4E-369, KSA-247, KSA-281, KSA-290.
- **External systems:** None (webview-only, in-process, no network port — TDD §13.1).

---

## 6. Migration Notes

**Không có migration dữ liệu.**  
- `tab.messages` không thay đổi cấu trúc (flat chronological — TDD §9).
- New entry fields (`thinkingCollapsed`) và tab fields (`streaming`, `unread`) absent = default (TDD §9).
- Backward compatible với persisted state cũ.

---

## 7. KB Artifacts (Linked)

| Artifact | File | Description |
|----------|------|-------------|
| STATUS.json | `documents/SA4E-381-chat-ux/STATUS.json` | Pipeline status — deployment→done |
| RUN-LOG.md | `documents/SA4E-381-chat-ux/RUN-LOG.md` | Pipeline execution log (11 entries) |
| STP.md | `documents/SA4E-381-chat-ux/STP.md` | Test Plan v1.0 — 6 test levels |
| STC.md | `documents/SA4E-381-chat-ux/STC.md` | Test Cases v1.0 — 107 TC + 24 E2E-UI + 6 PBT |
| TEST-REPORT.md | `documents/SA4E-381-chat-ux/TEST-REPORT.md` | Test Execution Report — GO, 0 defect |
| TDD.md | `documents/SA4E-381-chat-ux/TDD.md` | Technical Design Document v1.0 |
| UI-SPEC.md | `documents/SA4E-381-chat-ux/UI-SPEC.md` | UI/UX Spec v1.0 — AC2 + AC3 |

---

## 8. Test Summary (from TEST-REPORT.md)

| Metric | Value |
|--------|-------|
| Total test cases | 107 TC + 24 E2E-UI + 6 PBT |
| Passed | 107 TC + 24 E2E-UI + 6 PBT |
| Failed | 0 |
| Existing suite regression | 3,272/3,272 PASS |
| TypeScript compile | `tsc` 0 errors |
| Go/No-Go | **GO** |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-25 | DevOps | Initial RLN for SA4E-381-chat-ux v1.55.6 |

---

**End of RLN.**
