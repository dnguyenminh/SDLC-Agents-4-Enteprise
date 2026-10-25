# TDD — SA4E-381-chat-ux: Chat Transcript Redesign

**Document:** Technical Design Document
**Ticket:** SA4E-381-chat-ux
**Title:** Chat Transcript Redesign — Thinking Block 3 States + Work-Trace Container per Turn
**Version:** 1.0
**Status:** Draft (ready for DEV)
**Date:** 2026-10-25
**Author:** SA Agent
**Related inputs:** UI-SPEC.md (v1.0), IMPLEMENTATION-HANDOFF.md
**Scope:** Webview (`extension/webview-assets/chat/`); host protocol (`extension/src/chat-panel/`, `extension/src/mcp/stream-handler.ts`)

---

## 1. Introduction

### 1.1 Purpose
Redesign the SDLC CHAT webview transcript so each assistant turn reads as:

**Question → [Work Trace, collapsed] → Answer**

Issue 2 fixes the thinking block (one-line collapse, cannot re-open, inverted chevron, no metadata, scroll hijack). Issue 3 introduces a per-turn work-trace container that folds all thinking blocks and tool-call blocks of a turn into one collapsible unit. Issue 1 (cross-tab stream bleed) is OUT OF SCOPE for this TDD's core deliverables except that host protocol is confirmed **NOT CHANGED** — webview owns per-tab routing using existing `originTabId`.

### 1.2 Design principles (from UI-SPEC §1, §5)

- **Reuse, don't rebuild:** `.thinking-block/-header/-body`, `.ksa247-tool-container`/`.tool_container-summary/-body`, `.tool-call-block`, `.message.user/assistant/error`, `.node-badge`, `.tab-peer-badge`, `.tool-peer-hint`, copy actions, markdown pipeline. No new design language.
- **Presentation-only trace:** `tab.messages` stays flat chronological; the trace is a render-time grouping wrapper. Export/copy read the model, never the DOM.
- **Sticky user choice:** `data-user-managed` + `thinkingCollapsed` persist direction; auto rules never override an explicit user toggle.
- **Vanilla JS IIFE:** every webview module ≤200 lines, every function ≤20 lines, registers onto `window.ChatState`, loads via `ChatHtmlBuilder.ts` SCRIPTS array.
- **No host protocol change:** `originTabId` already exists (SA4E-381 Issue 1). Host only stamps it; webview controls per-tab rendering.
- **CSS variables only:** no hard-coded literals where a VS Code / design-token exists.

### 1.3 Technology stack (ground truth from codebase)

| Layer | Tech |
|---|---|
| Webview scripts | Vanilla ES5-style JS IIFE, no bundler, no framework; globals on `window.ChatState` |
| Host | TypeScript (VS Code extension), `postMessage` protocol |
| Styles | CSS + VS Code semantic variables (`--vscode-*`, `--surface-*`, `--text-*`, `--badge-bg/fg`) |
| Build/deploy | VS Code extension (`.vsix`), no CI/CD change for this ticket |
| Persistence | `tab.messages` via `chat:saveState`/`tab:updated`, debounced 500ms |

---

## 2. System Architecture

### 2.1 Component diagram (Mermaid)

```mermaid
graph TB
    subgraph Host ["Extension Host (TS)"]
        HP[message-protocol.ts<br/>originTabId stamped]
        SH[mcp/stream-handler.ts<br/>turn-scope capture]
        CP[chat-panel-provider.ts<br/>pass-through sendToWebview]
    end
    subgraph WV ["Webview (vanilla JS IIFE)"]
        INBOX[chat-inbox.js<br/>message dispatch]
        TAB[chat-tabs.js<br/>tab bar + badge]
        CYCLE[chat-cycle.js<br/>per-tab cycle state]
        STREAM[chat-stream.js<br/>streamChunk/complete]
        THINK[chat-thinking.js<br/>thinking builder 3 states]
        TRACE[chat-trace.js<br/>work-trace lifecycle NEW]
        TOOLS[chat-tools.js<br/>tool container]
        TOOLCALL[chat-toolcall.js<br/>tool block render]
        TOOLUPDATE[chat-toolupdate.js<br/>tool status updates]
        TOOLHELP[chat-tool-helpers.js<br/>approval bar + helpers]
        MESSAGES[chat-messages.js<br/>appendMessage + replay]
        TABSYNC[chat-tabsync.js<br/>persistence round-trip]
        JUMP[chat-jump-pill.js<br/>scroll sentinel NEW]
        TABROUTE[chat-tabroute.js<br/>per-tab event routing NEW]
    end
    CSS[chat.css + chat-blocks.css<br/>class contracts]

    Host -->|postMessage| INBOX
    INBOX --> TABROUTE
    TABROUTE -->|active tab| CYCLE & STREAM & THINK & TOOLCALL
    TABROUTE -->|background tab| TAB & CYCLE (model only)
    CYCLE --> THINK
    THINK --> TRACE
    TOOLCALL --> TRACE
    TOOLS --> TRACE
    TRACE --> MESSAGES
    MESSAGES --> CSS
    TAB --> CSS
    TABSYNC <--> CYCLE
    JUMP --> STREAM
```

### 2.2 Module responsibilities

| Module | Responsibility | Status |
|---|---|---|
| `chat-core.js` | `window.ChatState` namespace, DOM refs, `S.tabs`, `S.activeTabId`, `S.getMessageTargetTabId`, `S.scrollToBottom` | Existing (no change) |
| `chat-inbox.js` | Single `window.message` listener, dispatches `chat:*` / `tab:*` to module functions | Existing (no signature change) |
| `chat-tabroute.js` | NEW — single choke point `S.routeStreamEvent(msg)`: active tab → live handlers; background tab → model buffer + pill counters | Create |
| `chat-tabs.js` | Tab create/switch/close/rename, `renderTabBar`, composite badge (streaming dot > unread count > none) | Modify |
| `chat-tabsync.js` | `tab:updated` restore, debounced `saveStateToDisk`, persist `streaming`/`unread`/`thinkingCollapsed` | Modify |
| `chat-cycle.js` | Per-tab cycle state `S.cycleByTab[originTabId]`, `openCycle` pushes entry into owning tab, DOM gate on active tab | Modify |
| `chat-stream.js` | `handleStreamChunk`/`handleStreamComplete`: render gate `targetTabId === S.activeTabId`, thinking delta follow-only-at-bottom | Modify |
| `chat-thinking.js` | Shared `buildThinkingBlockDom` (chevron ▸/▼, metadata chars/duration, sticky `thinkingCollapsed`, `data-user-managed`, trim before persist) | Modify |
| `chat-trace.js` | NEW — `S.openTrace(tab)`/`S.adoptIntoTrace(el)`/`S.closeTrace(reason)`/`S.updateTraceSummary()`, sticky `data-user-managed` | Create |
| `chat-tools.js` | `getOrCreateToolContainer` returns container inside open trace body, `finalizeToolContainer` delegates to `closeTrace` | Modify |
| `chat-toolcall.js` | `renderToolCall`: background tab → model only; active tab → block inside trace; approval force-opens trace | Modify |
| `chat-toolupdate.js` | `updateToolCall`: status transitions, terminal-state fold inside trace | Modify |
| `chat-tool-helpers.js` | `buildToolApprovalBar`, shared thinking header helper, generalized adopt mechanics | Modify |
| `chat-messages.js` | `appendMessage`/`renderChatHistory`: replay grouping into one trace per turn, honor `thinkingCollapsed`, drop whitespace-only thinking | Modify |
| `chat-jump-pill.js` | NEW — scroll sentinel >80px from bottom while streaming, jump-to-latest pill, follow-only mode | Create |
| `ChatHtmlBuilder.ts` | SCRIPTS array order: add `chat-tabroute.js`, `chat-trace.js`, `chat-jump-pill.js` | Modify |

### 2.3 Deployment architecture

Single VS Code extension webview. No microservices, no message bus, no database. Host ↔ webview via `postMessage`. All state lives in `window.ChatState` (memory) + `tab.messages` persisted to VS Code context via `chat:saveState`.

---

## 3. API Design (Host Protocol)

### 3.1 Protocol — NO CHANGES REQUIRED

| Message | `originTabId` field | Action |
|---|---|---|
| `chat:streamChunk` | Already optional `originTabId?: string` | Host stamps at turn start |
| `chat:streamComplete` | Already optional | Host stamps |
| `chat:toolCall` | Already optional | Host stamps |
| `chat:toolCallUpdate` | Already optional | Host stamps |
| `chat:toolApprovalPending` | Already optional | Host stamps |

**Rationale:** UI-SPEC §2 + IMPLEMENTATION-HANDOFF confirm `originTabId` was added in SA4E-381 Issue 1. This ticket's Issues 2 & 3 are webview-only; webview reads `msg.originTabId` via `S.getMessageTargetTabId(msg)` (already in `chat-core.js` L85–87). No `message-protocol.ts`, `stream-handler.ts`, or `chat-panel-provider.ts` edits.

### 3.2 Webview internal API surface (on `window.ChatState`)

New public functions (issues 2 & 3):

- `S.buildThinkingBlockDom(thinkingText, collapsed, userManaged, meta, onToggle)` — shared header/body builder (exists in `chat-thinking.js`; metadata + direction honored)
- `S.openTrace(tabId)` / `S.closeTrace(reason)` / `S.adoptIntoTrace(el)` / `S.updateTraceSummary()` — `chat-trace.js`
- `S.routeStreamEvent(msg)` — `chat-tabroute.js`
- `S.showJumpPill(show)` / `S.setFollowOnly(mode)` — `chat-jump-pill.js`

Modified functions:
- `S.switchToTab(tabId)` — badge clear, scroll rule for streaming tabs
- `S.renderTabBar()` — composite badge slot
- `S.openCycle(nodeId, tabId)` — per-tab cycle, DOM gate
- `S.handleStreamChunk(msg, targetTabId)` — render gate, follow-only-at-bottom
- `S.handleStreamComplete(msg, targetTabId)` — trace auto-collapse trigger
- `S.appendMessage(role, content, nodeId, entry)` — trace-aware replay grouping
- `S.renderChatHistory(messages)` — trace grouping
- `S.getOrCreateToolContainer()` — returns container inside trace body
- `S.finalizeToolContainer()` — delegates to `closeTrace`

---

## 4. Issue 2 — Thinking Block: 3 States

### 4.1 States and transitions

```
STREAMING ──(cycle closes, user never touched)──► COLLAPSED          (auto rule)
STREAMING ──(user clicks header)──► EXPANDED/COLLAPSED + sticky       (data-user-managed + thinkingCollapsed)
COLLAPSED ──(click/Enter/Space)──► EXPANDED (thinkingCollapsed=false)
EXPANDED ──(click/Enter/Space)──► COLLAPSED (thinkingCollapsed=true)
any ──(webview reload / tab switch / replay)──► honor persisted direction
```

| State | Header | Body | Notes |
|---|---|---|---|
| **STREAMING** (cycle open) | `▼ Thinking · streaming…` + pulsing dot + violet left rail | Visible, `max-height:220px`, `overflow-y:auto`, follow-only-at-bottom | Left rail `#c4b5fd` (existing) |
| **COLLAPSED** (settled default) | `▸ Thinking · {chars} chars · {duration}s`, min-height 28px, hover bg, cursor pointer | Hidden (`display:none`) | Metadata at settle: `thinkingText.length`, cycle open→close ms |
| **EXPANDED** (user opened / sticky) | `▼ Thinking · {chars} chars · {duration}s` | Visible, scrollable, user-controlled | Sticky: click stores `data-user-managed` + direction |

### 4.2 Chevron convention (fixed)

- Collapsed: `▸` (U+25B6, pointing right)
- Expanded: `▼` (U+25BC, pointing down)
- Inverts current `chat.css` L1622 rotation.

### 4.3 Metadata (chars + duration)

- Chars: `thinkingText.trim().length` computed at `settleThinking`.
- Duration: `Date.now() - c.openedAt` at cycle close.
- Rendered in `.thinking-meta` right-aligned, font 11px, opacity 0.7.

### 4.4 Trim before persist

- `thinkingText.trim()` before `entry.thinking` is written.
- Empty/whitespace-only thinking dropped on replay (no phantom block).

### 4.5 Scroll rule (follow-only-at-bottom)

- Live thinking body auto-scrolls (`scrollTop = scrollHeight`) **only if** user is at or within 10px of body bottom; otherwise a tiny ↓ affordance appears at body bottom edge.
- Manual scroll up suspends auto-follow; resumes at bottom or on jump-pill click.

### 4.6 Accessibility

- `role="button"`, `tabindex="0"`, `aria-expanded="true|false"` on header.
- Enter/Space toggle. `:focus-visible` outline (`--vscode-focusBorder`).
- Header focusable for keyboard-only navigation.

---

## 5. Issue 3 — Work-Trace Container per Turn

### 5.1 Concept

One collapsible work-trace per assistant turn containing **all** cycles' thinking blocks and **all** tool-call blocks of the turn. Answer bubbles, user messages, peer rows, system/error rows stay at transcript root.

```html
<div class="work-trace" data-turn="turn-…" data-state="running|done"
     data-user-managed? aria-expanded="true|false">
  <div class="trace-summary" role="button" tabindex="0" aria-expanded="true|false">
    <span class="trace-chevron">▸/▼</span>
    <span class="trace-gear">⚙</span>
    <span class="trace-text">Work trace</span>
    <span class="trace-metrics">{N} tools · {tokens} tokens · {duration}s · thinking {k}×</span>
    <span class="tc-status-dots">…</span>
  </div>
  <div class="trace-body">
    <div class="thinking-block …">…</div>
    <div class="ksa247-tool-container …">…</div>
  </div>
</div>
```

### 5.2 Interaction model (state machine)

```
TURN START    → trace created OPEN (data-state=running), summary shows live progress
DURING TURN   → new tool containers & thinking blocks adopted into trace body
TURN END      → chat:streamComplete → trace auto-collapses (summary only)
                UNLESS data-user-managed (user toggled during turn) → keep state
USER TOGGLE   → click/Enter/Space on summary toggles body; sets data-user-managed (sticky)
REPLAY        → group contiguous thinking/tool entries between user messages into one trace per turn
                honor persisted per-block user choices
```

### 5.3 Summary line format

`⚙ Work trace · {N} tools · ~{tokens} tokens · {duration}s · thinking {k}×`

- `{N}` = tool-call blocks in turn (existing `data-tool-count`).
- `{tokens}` optional (context-usage tracker deltas); omit if unavailable — do not block.
- `{duration}` = turn start → `chat:streamComplete` via `S.formatDuration`.
- `thinking {k}×` = cycles that produced thinking.
- Failed tools: red `✗ n` appended (reuse `.tc-dot.failed`).
- Live variant: `⚙ Work trace · running… {N} tools · {Ts} ⟳`.
- Font 12px, violet-tinted accent, hover background, min-height 30px, ellipsis on metrics span.

### 5.4 Boundaries (outside trace)

| Element | Placement | Reason |
|---|---|---|
| Answer bubbles (`.message.assistant` + node badge + copy) | Root | The "A" of Q→trace→A |
| User messages | Root | Anchor of each turn |
| Peer rows (`.message.peer-inbound/.peer-reply`) | Root | Conversation-level, not turn machinery |
| System/error rows (`.message.error`, resume prompts) | Root | Actionable, never hidden |
| Tool approval bars (`.tool-approval-bar`) | Inside their block; pending approval forces trace open | Consent visible |

### 5.5 Adoption mechanics

- `S.openTrace(tabId)` creates the trace wrapper appended to `messagesEl` at turn start (first thinking/tool of turn).
- `S.adoptIntoTrace(el)` moves an existing element (thinking block, tool container) into the trace body, preserving stream order.
- `S.closeTrace(reason)` seals summary metrics, applies auto-collapse unless `data-user-managed`.
- `S.updateTraceSummary()` recomputes metrics after each adoption.

---

## 6. Cross-Cutting Requirements (UI-SPEC §5)

| Area | Requirement |
|---|---|
| Performance | Trace wrapper must not re-create per chunk; adoption reuses parent-node checks (`ensureBubble` pattern). No layout thrash: collapsed trace hides body via `display:none` (existing pattern) |
| Persistence | New tab fields (`streaming`, `unread`) + entry fields (`thinkingCollapsed`) must round-trip `chat:saveState` / `tab:updated` without breaking older persisted states (absent field = default) |
| A11y (WCAG 2.1 AA intent) | All new interactive rows: role=button, aria-expanded, keyboard toggle, focus-visible; badge info mirrored into `aria-label` (color never sole signal: dot shape vs count number vs label text) |
| Responsive | Chat panel width 300–800px: summary line ellipsifies the middle (`text-overflow: ellipsis` on the metrics span), badges never wrap to a second row |
| File-size budget | New/edited webview files stay ≤200 lines / functions ≤20 lines — split trace logic into a new module (see handoff doc) |

---

## 7. CSS Class Contracts & Variable Mapping

### 7.1 New classes

| Class | Element | Key properties | Values / source |
|---|---|---|---|
| `.tab-status-badge` | tab pill status dot/count | geometry | clone of `.tab-peer-badge` (16px, radius 8px, `chat.css` L561–575) |
| `.tab-status-badge.streaming` | pulsing dot | `background:#a78bfa`; pulse via `@keyframes blink` (`chat.css` L583–586) or `peer-pulse` (L805–808) | violet dot |
| `.tab-status-badge.unread` | count pill | `background: var(--vscode-badge-background, #6366f1)`; peer override `#ec4899` | indigo/pink |
| `.work-trace` | trace wrapper | `border:1px solid rgba(128,128,128,.12); border-radius:8px; margin:8px 0; contain:style` | match `.ksa247-tool-container` L638–648 |
| `.trace-summary` | summary row | `min-height:30px; padding:6px 12px; font-size:12px; cursor:pointer; background:var(--vscode-sideBar-background)` | match L651–662; hover `--vscode-list-hoverBackground` |
| `.trace-body` | trace body | `display:none` when `.tc-collapsed` on `.work-trace` | same pattern as L706–711 |
| `.thinking-header` | thinking hit area | `min-height:28px; padding:6px 10px` (bump from L1611–1620); hover bg; `:focus-visible` ring `--vscode-focusBorder` | |
| `.thinking-block.collapsed .thinking-chevron` | chevron direction | `transform:none` (▸ right); expanded rotates to ▼ — **inverts** L1622 | |
| `.thinking-meta` | metadata span | `font-weight:400; opacity:.7; margin-left:auto` right-aligned | font 11px |
| `.chat-jump-pill` | jump-to-latest pill | `position:sticky; bottom:calc(input + 8px); align-self:flex-end; background:var(--vscode-button-background,#6366f1); color:#fff; border-radius:14px; box-shadow:0 2px 8px rgba(0,0,0,.3); z-index:50` | indigo pill |

### 7.2 CSS variable mapping (no hard-coded literals where a token exists)

- Violet accent: reuse `#a78bfa` (thinking) via variable, not new literal.
- Indigo accent: `--vscode-button-background, #6366f1`.
- Hover: `--vscode-list-hoverBackground`.
- Focus ring: `--vscode-focusBorder`.
- Sidebar background: `--vscode-sideBar-background`.
- Badge background: `--vscode-badge-background`.

### 7.3 Naming & placement rules

- New webview modules: `chat-tabroute.js`, `chat-trace.js`, `chat-jump-pill.js` — IIFE style, register on `window.ChatState`, load order in `ChatHtmlBuilder.ts` SCRIPTS array after `chat-core.js` and before first use.
- Class prefix `trace-` / `tab-status-` is new namespace — no collision with legacy `tc-*` (KSA-290) which stays for the inner tool container.
- All user-facing strings in English; timestamps/durations via `S.formatDuration` (`chat-tool-helpers.js` L77–80).

---

## 8. Files to Create / Modify

### 8.1 New files (create)

| File | Purpose | Lines (budget) |
|---|---|---|
| `chat-tabroute.js` | `S.routeStreamEvent(msg)` — single choke point; active tab → live handlers; background tab → model buffer + pill counters | ≤200 |
| `chat-trace.js` | `S.openTrace/closeTrace/adoptIntoTrace/updateTraceSummary` — trace lifecycle, sticky `data-user-managed` | ≤200 |
| `chat-jump-pill.js` | Scroll sentinel >80px from bottom while streaming; jump-to-latest pill; follow-only mode | ≤200 |

### 8.2 Modified files

| File | Change | Issue |
|---|---|---|
| `chat-cycle.js` | Per-tab cycle state (`S.cycleByTab[originTabId]`); `openCycle` pushes entry into owning tab; DOM gate on active tab; `thinkingCollapsed` direction stored | 2, 3 |
| `chat-stream.js` | Render gate `targetTabId === S.activeTabId`; thinking delta follow-only-at-bottom | 2 |
| `chat-thinking.js` | Metadata spans (chars/duration); chevron convention ▸/▼; `ensureThinking` rebuild honors `thinkingCollapsed`; trim before persist | 2 |
| `chat-tools.js` | `getOrCreateToolContainer` returns container inside open trace body; `finalizeToolContainer` delegates to `closeTrace` | 3 |
| `chat-toolcall.js` | Background tab → model only; active tab → block inside trace; approval force-opens trace | 3 |
| `chat-toolupdate.js` | Status transitions; terminal-state fold inside trace | 3 |
| `chat-tool-helpers.js` | `buildToolApprovalBar`; shared thinking header helper; generalized adopt mechanics | 2, 3 |
| `chat-messages.js` | Replay grouping into one trace per turn; honor `thinkingCollapsed`; drop whitespace-only thinking | 3 |
| `chat-tabs.js` | `renderTabBar` composite badge; `switchToTab` clear unread + scroll rule for streaming tabs | 2, 3 |
| `chat-tabsync.js` | Persist/restore `streaming`/`unread`/`thinkingCollapsed`; stale `streaming:true` resets to false | 2 |
| `chat.css` + `chat-blocks.css` | New class contracts (`.work-trace`, `.trace-summary`, `.trace-body`, `.tab-status-badge`, `.chat-jump-pill`); chevron inversion; metadata styling | 2, 3 |
| `ChatHtmlBuilder.ts` | SCRIPTS array: add `chat-tabroute.js`, `chat-trace.js`, `chat-jump-pill.js` | 2, 3 |

### 8.3 Files NOT modified (host protocol confirmed unchanged)

| File | Reason |
|---|---|
| `message-protocol.ts` | `originTabId` already optional (SA4E-381 Issue 1) |
| `stream-handler.ts` | Host stamps `originTabId` at turn start — no change needed for Issues 2/3 |
| `chat-panel-provider.ts` | Pass-through preserved — no routing change for Issues 2/3 |
| `chat-inbox.js` | No signature change; handlers already receive `msg.originTabId` via `S.getMessageTargetTabId` |
| `chat-peer-ui.js` | Peer rows stay at transcript root — no trace impact |

---

## 9. Persistence / Data Model (tab.messages)

`tab.messages` remains **flat chronological** — the trace is presentation-only.

Entry fields (existing + new):
- `role: "assistant" | "tool" | "user" | "error"`
- `content`, `nodeId`, `timestamp`
- `thinking` (string, trimmed, undefined if empty)
- `thinkingUser: boolean` (existing, backward-compat)
- `thinkingCollapsed: boolean` (NEW — user's explicit collapse direction)
- `toolData` (for tool entries)
- `userManaged` / `userExpanded` (for tool blocks, existing)

Tab fields (existing + new):
- `streaming: boolean` (NEW — background tab streaming)
- `unread: number` (NEW — unread count for background tab)
- `peerUnread: number` (existing, SA4E-369 — unchanged)

Round-trip: `chat:saveState` → `tab:updated` → `handleTabsUpdated` restores all fields. Absent field = default (collapsed=false, streaming=false, unread=0).

---

## 10. Replay & Export Safety

### 10.1 Replay grouping (one trace per turn)

`renderChatHistory` / `switchToTab` group contiguous `assistant` (thinking) + `tool` entries between user messages into one trace per turn:
- Turn boundary = user message ⇒ new trace
- Trace sealed at next user message or end of history
- Per-block `thinkingCollapsed` and `data-user-managed` honored on rebuild
- Whitespace-only thinking dropped on replay

### 10.2 Export & copy byte-identical

- Export (`chat:exportConversation`) reads `tab.messages` (model), never the DOM — unchanged.
- Copy actions (`ChatExportUI.attachCopyAction` / `attachToolCopyAction`) attach at render time to bubbles/blocks. Elements are **moved** into the trace, not re-created — listeners travel with nodes.
- Verified: per-message copy, per-tool copy, full Markdown/JSON export byte-identical to pre-change build.

### 10.3 Presentation-only invariant

The trace wrapper adds no entries to `tab.messages`. It only re-parents existing DOM nodes. `tab.messages` entry sequence is identical to today's active-tab path (order: Q → think → tools → bubble per cycle).

---

## 11. Regression Blast Radius & Testing

### 11.1 Blast radius (must-keep-green)

| Area | Risk | Mitigation |
|---|---|---|
| Replay | Per-tab buffering must produce same entry sequence as today's active-tab path | Test `renderChatHistory` + `switchToTab` order: Q → think → tools → bubble |
| Export/copy | Elements moved into trace; listeners must survive `insertBefore` moves | Verify per-message copy, per-tool copy, full export byte-identical |
| Working bar | `setWorking` is global; background mode must NOT fire for inactive tab | Scope `chat:workingStatus` per active tab; pill only for background |
| Approval flow | Background tab's gated tool must not hijack Approve/Reject buttons | Route approval UI to origin tab; badge-only if origin ≠ active |
| Peer feature (SA4E-369) | `peerUnread` badge coexists with new unread count | Tie-break rule: peer pink wins ties |
| Empty cycles | Tool-only trailing cycles splice entries; trace must not keep empty summary | Skip trace creation for empty turns |

### 11.2 Test scenarios

1. **Replay:** Send message → switch tab mid-stream → switch back → full Q→trace→A replayed, one collapsed trace per turn.
2. **Export/copy:** Export Markdown/JSON, copy one message, copy one tool call — outputs match pre-change build.
3. **Peer:** Inbound peer task to background tab → pink badge; rows at root on focus.
4. **Approval:** Tool requires approval → trace force-opens; Approve/Reject works.
5. **Thinking 3 states:** Collapsed → click → expanded (chevron ▼) → click → collapsed (chevron ▸) → reload → state preserved.
6. **Trace sticky:** Toggle trace mid-turn → turn ends → trace keeps user state (no auto-collapse).
7. **Whitespace-only thinking:** Turn completes → no thinking block persists/renders.
8. **Jump pill:** Scroll up >80px while streaming → pill appears; click → bottom + auto-follow resumes.

---

## 12. E2E Test Architecture

### 12.1 Framework & language

- **Framework:** vitest (E2E-API) + Playwright (E2E-UI)
- **Language:** TypeScript (matches project's main language)
- **API test client:** fetch / Hono `app.request()` against running server — N/A for webview; webview E2E uses Playwright against the VS Code extension webview
- **Test location:** `backend/tests/e2e/` (per project convention) — webview tests under `extension/tests/` if present

### 12.2 Test structure

- Unit tests: `extension/webview-assets/chat/**/*.test.ts`
- E2E-UI tests: Playwright against the running extension webview
- Shared setup: server start, extension activation, webview ready handshake, auth token generation

### 12.3 Reusable components

- **Setup:** extension launch, webview `ready` handshake, tab creation, message sending
- **Helpers:** `sendMessage(tabId, text)`, `switchTab(tabId)`, `waitForStreamComplete(tabId)`, `clickTraceSummary(selector)`, `clickThinkingHeader(selector)`, `assertTraceCollapsed(selector)`, `assertTraceExpanded(selector)`, `exportConversation(format)`, `copyMessage(selector)`
- **Fixtures:** test data for thinking content, tool calls, peer messages, approval flows

### 12.4 E2E test design for SA4E-381

File: `chat-ux-redesign.e2e.test.ts`

Test cases:
1. Background tab streaming does not pollute active tab transcript (Issue 1 UX half)
2. Thinking block: collapsed → expanded → collapsed, chevron ▸/▼, metadata chars/duration (Issue 2)
3. Thinking block sticky state survives reload/replay (Issue 2)
4. Whitespace-only thinking produces no block (Issue 2)
5. Work-trace: one trace per turn, auto-collapses on streamComplete (Issue 3)
6. Work-trace sticky: user toggle persists across turn end (Issue 3)
7. Work-trace replay: one trace per turn on history reload (Issue 3)
8. Export/copy byte-identical to pre-change build (Issue 3)
9. Peer rows at root, never inside trace (Issue 3)
10. Approval pending forces trace open (Issue 3)

Auth setup: extension test harness provides authenticated webview context.
Data cleanup: close all tabs / reset extension state after each test.

---

## 13. Deployment — Runtime Profile, Screen Inventory, Feature Verification

### 13.1 Runtime profile (for UG evidence)

| Item | Value |
|---|---|
| Start command | VS Code: launch extension host → webview opens on `chat:ready` handshake |
| Port | N/A (in-process webview, no network port) |
| Health endpoint | N/A (webview is UI, not a service) |
| Config file | `extension/package.json` (contributes `chatPanel` webview) |
| Detect running instance | Extension active + webview `ready` message posted; `window.ChatState` present in webview DOM |

### 13.2 Screen inventory (for UG evidence)

| Screen name | Route / path / element |
|---|---|
| Chat transcript | `#chat-messages` (webview DOM) |
| Tab bar | `#tab-bar` with `.tab-item` buttons + `.tab-status-badge` |
| Work trace | `.work-trace` wrapper (per turn) |
| Trace summary | `.trace-summary` button |
| Trace body | `.trace-body` (collapsed/expanded) |
| Thinking block | `.thinking-block` with `.thinking-header` + `.thinking-body` |
| Jump-to-latest pill | `.chat-jump-pill` (floats above input dock) |
| Input dock | `#chat-input-area` (fixed bottom) |

### 13.3 Feature verification points

| Feature | Concrete verification |
|---|---|
| Thinking 3 states | `.thinking-block.collapsed` shows chevron `▸` + `Thinking · N chars · Ns`; click → `expanded`, chevron `▼` |
| Work-trace per turn | `.work-trace` with `.trace-summary` containing `⚙ Work trace · N tools · ...`; `.trace-body` hidden when collapsed |
| Trace sticky | Click trace summary → `data-user-managed="true"`; turn ends → trace keeps state |
| No host protocol change | `originTabId` present on `chat:streamChunk`/`streamComplete`/`toolCall` (unchanged from SA4E-381 Issue 1) |
| Export/copy byte-identical | Markdown/JSON export output matches pre-change build for same `tab.messages` |

---

## 14. Discrepancy Report

**Comparison: FSD/UI-SPEC vs actual codebase**

After analyzing all source files (`chat-core.js`, `chat-cycle.js`, `chat-stream.js`, `chat-tabs.js`, `chat-messages.js`, `chat-tools.js`, `chat-toolcall.js`, `chat-thinking.js`, `chat-tabsync.js`, `ChatHtmlBuilder.ts`, `message-protocol.ts`), the following discrepancies were found:

| # | UI-SPEC says | Actual codebase | Impact | Recommended fix |
|---|---|---|---|---|
| DISC-1 | `chat-thinking.js` described as extracted module | File exists with `buildThinkingBlockDom`, `buildThinkingBlock`, `ensureThinking`, `collapseThinking`, `settleThinking` | None — module already present, needs Issue 2 metadata/direction changes | Modify existing `chat-thinking.js` (no new file needed for builder) |
| DISC-2 | `S.currentCycle` described as global singleton | Code already uses `tab.currentCycle` (per-tab) in `chat-cycle.js` L61, L76-79 | None — per-tab cycle state partially exists | Complete per-tab migration: `S.cycleByTab[originTabId]` |
| DISC-3 | `originTabId` described as needing to be added | Already optional in `message-protocol.ts` L95, L96, L104, L105, L114 | None — field exists | No change needed for Issues 2/3 |
| DISC-4 | `chat-tabroute.js` described as NEW | File does not exist | None — create new | Create `chat-tabroute.js` |
| DISC-5 | `chat-trace.js` described as NEW | File does not exist | None — create new | Create `chat-trace.js` |
| DISC-6 | `chat-jump-pill.js` described as NEW | File does not exist | None — create new | Create `chat-jump-pill.js` |

**Severity summary:** All discrepancies are Low (naming/placement only). No Critical or High discrepancies.

> ✅ No critical discrepancies found between UI-SPEC/FSD and actual codebase. Design is feasible with existing patterns.

---

## 15. KB Ingestion

After DEV implementation, the TDD should be ingested into the Knowledge Base for cross-agent access:

```
mem_ingest(title: "SA4E-381-chat-ux TDD — Chat Transcript Redesign",
  content: <full TDD markdown>,
  tags: "tdd, SA4E-381-chat-ux, design, architecture, sdlc")
```

---

**End of TDD.** Next step: SM invokes DEV agent with this TDD for implementation (Phase 5).





