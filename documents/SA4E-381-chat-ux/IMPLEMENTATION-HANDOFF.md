# IMPLEMENTATION-HANDOFF — SA4E-381-chat-ux (Transcript Redesign)

**Audience:** DEV agent (Phase 5). **Companion doc:** `UI-SPEC.md` (acceptance criteria live there).
**Rule of engagement:** this document separates **host/protocol work** (DEV, TypeScript) from **webview work** (DOM/CSS, vanilla JS) per issue, estimates complexity, and lists regression blast radii. Code conventions: file ≤200 lines, function ≤20 lines. NO framework — vanilla JS modules on `window.ChatState`.

---

## Work Map (one glance)

| Issue | Host (TS) | Webview JS | CSS | Est. complexity | Risk |
|---|---|---|---|---|---|
| 1 — cross-tab stream bleed | **HIGH** (protocol + routing + per-tab session state) | **HIGH** (per-tab cycle state, badge, jump pill) | Low | 3–4 d | replay, export, working bar |
| 2 — thinking block | Low (persist direction field) | Medium (builder unification, metadata, scroll rule) | Low | 1–1.5 d | replay sticky state |
| 3 — work-trace container | Low (turn-end event already exists) | **HIGH** (adoption/generalization of containers, replay grouping) | Medium | 2.5–3 d | export/copy, approval bars, peer rows |

Suggested order: **Issue 2 → Issue 3 → Issue 1.** 2 and 3 are independent of the protocol change; doing them first shrinks the DOM surface that Issue 1's per-tab buffering must cover.

---

## Issue 1 — Cross-Tab Stream Bleed

### DEV (host, TypeScript)

| File | Change |
|---|---|
| `extension/src/chat-panel/message-protocol.ts` | Add `originTabId: string` to `chat:streamChunk`, `chat:streamComplete`, `chat:toolCall`, `chat:toolCallUpdate`, `chat:toolApprovalPending` (L94–115 block). Optional field keeps old senders compatible |
| `extension/src/mcp/stream-handler.ts` | Stamp `originTabId` on every emitted event (all 7 `chat:streamChunk` emitters L45–169 + complete path). The turn's tab id must be captured at **turn start** (session/turn scope, not at emit time) |
| `extension/src/chat-panel/chat-panel-provider.ts` (+ `chat-panel-provider/*`) | Route pass-through: ensure `sendToWebview` preserves the new field; associate the active engine session with `tabId` at `chat:userMessage` handling |

### Webview (vanilla JS)

| File | Change |
|---|---|
| `chat-inbox.js` | No signature change; handlers receive `msg.originTabId` |
| **NEW `chat-tabroute.js`** (≤200 lines) | Single choke point: `S.routeStreamEvent(msg)` → if `msg.originTabId === S.activeTabId` call the existing live handlers unchanged; else update the **per-tab stream buffer** (model entries + counters + `tab.streaming=true`) and the pill. All stream/tool handlers call it first |
| `chat-cycle.js` | Cycle state becomes **per tab**: `S.currentCycle` → `S.cycleByTab[originTabId]`. `openCycle` pushes entries into `S.getTab(originTabId)` (today: active tab, L77–81). DOM-building calls are skipped entirely in background mode (no `ensureBubble`/`ensureThinking`/tool DOM) |
| `chat-stream.js` | `handleStreamChunk` splits: buffer-only path (background) vs render path (active). Thinking/token buffers mutate `c.entry` regardless — replay on tab focus already reads the model |
| `chat-toolcall.js` | Background mode: persist tool entry into origin tab model (L187–207 currently uses active tab) **without** DOM render |
| `chat-tabs.js` | `renderTabBar`: render composite badge (priority: streaming dot > unread count > none). `switchToTab`: clear `tab.unread` (like `peerUnread`, L38–41); if target `tab.streaming`, ignore saved `scrollPosition` and jump to bottom |
| `chat-tabsync.js` | Persist/restore `tab.streaming` / `tab.unread`; on restore, stale `streaming:true` (no live stream) resets to false |
| **NEW `chat-jump-pill.js`** + CSS | Scroll sentinel: track `messagesEl` scroll; show/hide pill (>80px from bottom && streaming); click → bottom + resume auto-follow. `S.scrollToBottom` gains "follow-only" mode honoring the sentinel (touches `chat-stream.js` L57 and thinking body scroll L53–54) |

### Split summary
- **Protocol/routing = DEV (host).** Webview routing logic is also DEV (state machine, buffers) — it is *not* CSS-only.
- **Badge + jump pill visuals = pure CSS** (`.tab-status-badge`, variants; reuse `.tab-peer-badge` geometry `chat.css` L561–575).

### Regression blast radius (must-keep-green)
- **Replay:** `renderChatHistory` / `switchToTab` re-render from `tab.messages` — per-tab buffering must produce the same entry sequence as today's active-tab path (order: Q → think → tools → bubble per cycle).
- **Export/copy:** host-side export reads tab model — untouched; verify background-buffered turns export identically.
- **Working bar:** `setWorking` is global; in background mode it must NOT fire for the inactive tab (only pill). Verify `chat:workingStatus` also gains `originTabId` or is scoped per active tab.
- **Approval flow:** `chat:toolApprovalPending` for a background tab must raise that tab's pill (count/unread) and MUST NOT show Approve/Reject buttons over the wrong tab's input. Simplest v1: route approval UI to origin tab; if origin ≠ active, badge-only + auto-open on focus.
- **Peer feature (SA4E-369):** `peerUnread` badge logic coexists; test tie-break rule (pink wins).

---

## Issue 2 — Thinking Block 3 States

### DEV (host)
| File | Change |
|---|---|
| none required | (persisted fields are webview-owned in `tab.messages`) |

### Webview (vanilla JS)
| File | Change |
|---|---|
| `chat-cycle.js` | `buildThinkingBlock`: add metadata spans (chars/duration placeholders), store direction: click sets `c.thinkingUser=true` **and** `c.thinkingCollapsed=!(now expanded)`; `settleThinking` fills real counts (`thinkingText.length`, cycle open→close ms); `ensureThinking` rebuild honors `thinkingCollapsed` (fixes expand-always bug L117–128); trim `thinkingText` before persist (L161 area: `hasThinking` uses trimmed value) |
| `chat-messages.js` | Replay path (L38–61): same header builder (share one `S.buildThinkingHeader(entry)` helper in `chat-tool-helpers.js` or new small module); honor `entry.thinkingCollapsed`; drop whitespace-only thinking |
| `chat-stream.js` | Thinking delta scroll: only when user at body bottom (sentinel from jump-pill module reused at body level) |

### CSS
| File | Change |
|---|---|
| `chat.css` L1602–1633 + `chat-blocks.css` | `min-height:28px` header, hover bg, `:focus-visible`, chevron convention (collapsed ▸ / expanded ▼ — swap L1622 rotation), metadata span styling, keep `max-height:220px` scroll body, remove collapsed label dim (keep contrast) |

### Regression blast radius
- **Replay sticky state:** old persisted entries have `thinkingUser` but no `thinkingCollapsed` — default mapping: `thinkingUser && !collapsed-field` → expanded (current intent), others collapsed. Must not change today's visual defaults for existing saves.
- **SA4E-372 R4:** persistence round-trip of new field via `saveStateToDisk` — verify with one save/reload cycle.
- **Think-only cycles** (SA4E-372 R3): empty-bubble logic must still render thinking-only turns.

---

## Issue 3 — Work-Trace Container per Turn

### DEV (host)
| File | Change |
|---|---|
| none required | Turn boundary signal already exists (`chat:streamComplete`). Optional phase-2: token count in metadata (from context-usage tracker) |

### Webview (vanilla JS)
| File | Change |
|---|---|
| **NEW `chat-trace.js`** (≤200 lines) | Trace lifecycle: `S.openTrace(tab)` / `S.adoptIntoTrace(el)` / `S.closeTrace(reason)` / `S.updateTraceSummary()`. Owns summary metrics (tools count, duration, thinking×, failed count) and the sticky `data-user-managed` rule (mirror `applyContainerCollapse`, `chat-tools.js` L79–88) |
| `chat-tools.js` | `getOrCreateToolContainer` returns container **inside the open trace body** (or is replaced by trace-owned creation — decision at implementation; keep KSA-247 summary card intact inside). `finalizeToolContainer` delegates to `closeTrace` at turn end |
| `chat-tool-helpers.js` | `adoptPreCycleContainers` / `placeAdoptedContainers` (L146–193) generalized: adoption target = open trace body instead of raw `messagesEl` |
| `chat-cycle.js` | `buildThinkingBlock` output appended to open trace body; `closeCycle` no longer needs root-level positioning |
| `chat-tabs.js` / `chat-messages.js` | Replay grouping: contiguous thinking/tool entries between user messages rebuild into one trace per turn (extract shared `S.replayTurn(messages)` used by both renderers to avoid duplication) |
| `chat-toolcall.js` | Approval force-open: pending approval bar opens its **trace** (L178–183 logic moves up a level) |

### CSS
| File | Change |
|---|---|
| `chat.css` (append) | `.work-trace` (reuse `.ksa247-tool-container` border/radius feel, violet-tinted summary), `.trace-summary` (min-height 30px, hover, focus), `.trace-body` (display:none when collapsed), `.trace-summary .failed-count` (red). Keep `contain: style` isolation on the wrapper |

### Regression blast radius (highest of the three — test first)
- **Export/copy:** elements are MOVED into the trace, never re-created; `ChatExportUI.attachCopyAction` bindings survive `insertBefore` moves (listeners travel with nodes) — verify per-message copy + per-tool copy + full export byte-identical.
- **Peer rows (SA4E-369):** `handlePeerInbound` appends to `messagesEl` root (`chat-peer-ui.js` L23) — must never land inside a trace; add a render-order test with peer rows between turns.
- **Approval bars:** force-open trace when consent pending (AC3-5) — cover in manual test.
- **Empty cycles:** tool-only trailing cycles splice entries (`chat-cycle.js` L169–177) — trace must not keep an empty summary for them.
- **Context compaction / graph viz** touch transcript root only — smoke-test.

---

## Suggested Manual Test Script (happy path, after all three)

1. Send message in tab A → switch to tab B: tab B clean, tab A pill = violet dot.
2. Wait for completion: tab A pill = unread "2". Focus tab A: badge clears, full Q→trace→A replayed, one collapsed trace line per turn.
3. Click trace line: body opens with thinking blocks + tool cards (per-block chevrons work). Click again: collapses. Reload: state preserved.
4. Mid-stream in active tab, scroll up: Jump-to-latest pill appears; click returns to follow mode.
5. Trigger a tool approval: trace force-opens; Approve works.
6. Peer test: inbound peer task to tab A while in tab B: pink badge; rows at root on focus.
7. Export Markdown + copy one message + copy one tool call: outputs match pre-change build.

---

## Effort & Sequencing Summary

| Step | Items | Est. |
|---|---|---|
| 1 | Issue 2 (thinking block) + CSS | 1–1.5 d |
| 2 | Issue 3 (trace container + replay grouping) | 2.5–3 d |
| 3 | Issue 1 (protocol `originTabId` + per-tab routing + badge + jump pill) | 3–4 d |
| 4 | Cross-cutting regression pass (replay/export/copy/peer/approval) | 1 d |
| | **Total** | **≈ 7.5–9.5 d** |

Risk note: Issue 1 is the only change touching the extension↔webview protocol; it ships last so the DOM redesign lands on stable routing. If scope must shrink, Issue 1's *UX half* (badge + jump pill) can ship independently of the routing fix only as a partial mitigation — NOT recommended as the ticket's definition of done (bleed remains).
