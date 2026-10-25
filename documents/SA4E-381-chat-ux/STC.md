# STC — SA4E-381-chat-ux: Chat Transcript Redesign (Test Cases)

**Ticket:** SA4E-381-chat-ux
**Document:** Software Test Cases (STC) — v1.0
**Status:** Draft (Phase 6 Testing — QA)
**Author:** QA Agent
**Date:** 2026-10-25
**Autonomy Level:** L3 (per STATUS.json)

**Traceability:** Every TC maps 1:1 to UI-SPEC AC2-1..AC2-7 (§3.5), AC3-1..AC3-9 (§4.4), cross-cutting §5, and IMPLEMENTATION-HANDOFF regression blast radius groups.

---

## Test Case Numbering Convention

| Range | Category |
|-------|----------|
| TC-001..TC-099 | Functional — Happy Path (AC2/AC3 main flows) |
| TC-100..TC-199 | Functional — Alternative Flows |
| TC-200..TC-299 | Functional — Exception / Error Flows |
| TC-300..TC-399 | Business Rule Validation (BR-XX) |
| TC-400..TC-499 | Boundary & Negative Testing |
| TC-500..TC-599 | UI / UX Testing |
| TC-600..TC-699 | Non-Functional (Performance, Persistence, A11y, Responsive) |
| TC-700..TC-799 | Integration Testing |
| TC-800..TC-899 | Regression Testing |
| E2E-UI-01.. | Automated Playwright E2E-UI (mapped from above) |
| PBT-01.. | Property-Based Tests (fast-check) |

---

## TC-001..TC-099 — Functional — Happy Path (Issue 2: Thinking Block AC2-1..AC2-7)

### TC-001: AC2-1 — Collapsed thinking shows chevron + chars + duration, min-height 28px, hover

| Field | Value |
|-------|-------|
| **ID** | TC-001 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UI-SPEC AC2-1, TDD §4.4 |
| **Preconditions** | Turn completed with thinking content; trace collapsed; webview active |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open transcript with a settled turn containing thinking | Rendered |
| 2 | Locate each cycle's thinking block | Each shows: chevron `▸` + "Thinking" + char count + duration |
| 3 | Verify row height | Header min-height ≥ 28px |
| 4 | Hover over header | Hover background (`--vscode-list-hoverBackground`) visible |
| 5 | Verify body state | `.thinking-body` hidden (`display:none`) |

**Test Data:** thinking text length ≥ 100 chars, cycle duration > 0 ms
**Postconditions:** Block remains collapsed; no state change

---

### TC-002: AC2-2 — Click/Enter/Space expand, aria-expanded="true", chevron ▼

| Field | Value |
|-------|-------|
| **ID** | TC-002 |
| **Priority** | High |
| **Type** | Functional / UI |
| **Requirement** | UI-SPEC AC2-2, TDD §4.6 |
| **Preconditions** | TC-001 passed; thinking block collapsed |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click thinking header | Body expands; content visible |
| 2 | Verify `aria-expanded` | `aria-expanded="true"` on header |
| 3 | Verify chevron | `▼` (pointing down) |
| 4 | Collapse via click again | Body hidden; `aria-expanded="false"`; chevron `▸` |
| 5 | Focus header via Tab | Header receives `:focus-visible` ring |
| 6 | Press Enter while focused | Body toggles expand/collapse |
| 7 | Press Space while focused | Body toggles expand/collapse |

**Test Data:** N/A
**Postconditions:** Block returns to prior state after final toggle

---

### TC-003: AC2-3 — Collapse again, thinkingCollapsed persisted, survives reload

| Field | Value |
|-------|-------|
| **ID** | TC-003 |
| **Priority** | High |
| **Type** | Functional / Persistence |
| **Requirement** | UI-SPEC AC2-3, TDD §4.1, §9 |
| **Preconditions** | TC-002 passed; block expanded |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click thinking header to collapse | `thinkingCollapsed=true` stored |
| 2 | Reload webview (F5) / switch tab and back | Block renders collapsed on replay |
| 3 | Verify `data-user-managed` | Present on entry |
| 4 | Verify chevron | `▸` (collapsed convention) |

**Test Data:** N/A
**Postconditions:** Direction persists across reload

---

### TC-004: AC2-4 — Multi-cycle turn: only trace summary visible, no bare thinking stack

| Field | Value |
|-------|-------|
| **ID** | TC-004 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UI-SPEC AC2-4, AC3-1, TDD §5.1 |
| **Preconditions** | Turn with N ≥ 2 cycles each producing thinking |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Render turn at transcript root | One `.work-trace` per turn |
| 2 | Verify trace collapsed | Only `.trace-summary` line visible |
| 3 | Count bare `.thinking-block` at root | 0 bare thinking lines at root |
| 4 | Expand trace | All N thinking blocks + tool containers inside `.trace-body` |

**Test Data:** N ≥ 2 cycles with thinking
**Postconditions:** Trace groups all thinking; no interleaved debris

---

### TC-005: AC2-5 — Live thinking follow-only-at-bottom, no scroll fight

| Field | Value |
|-------|-------|
| **ID** | TC-005 |
| **Priority** | High |
| **Type** | Functional / Interaction |
| **Requirement** | UI-SPEC AC2-5, TDD §4.5 |
| **Preconditions** | Turn streaming; thinking body expanded |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Stream thinking deltas | Body auto-scrolls only if user at/within 10px of bottom |
| 2 | Manually scroll body up | Auto-follow pauses; ↓ affordance appears at bottom edge |
| 3 | Continue streaming | No scroll jump (no scroll fight) |
| 4 | Scroll back to bottom | Auto-follow resumes |

**Test Data:** Multiple streaming deltas
**Postconditions:** User scroll control respected

---

### TC-006: AC2-6 — Whitespace-only thinking dropped

| Field | Value |
|-------|-------|
| **ID** | TC-006 |
| **Priority** | Medium |
| **Type** | Functional / Edge Case |
| **Requirement** | UI-SPEC AC2-6, TDD §4.4 |
| **Preconditions** | Cycle with thinking = "   \n\t   " (whitespace only) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Complete turn with whitespace-only thinking | No `.thinking-block` renders for that cycle |
| 2 | Verify `hasThinking` uses `.trim()` | Empty string treated as no thinking |

**Test Data:** thinking = whitespace-only string
**Postconditions:** No phantom thinking block

---

### TC-007: AC2-7 — Keyboard focus-visible, Enter/Space toggle

| Field | Value |
|-------|-------|
| **ID** | TC-007 |
| **Priority** | High |
| **Type** | Functional / A11y |
| **Requirement** | UI-SPEC AC2-7, TDD §4.6, UI-SPEC §5 A11y |
| **Preconditions** | Thinking block present |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Tab-navigate to thinking header | Header focusable (`tabindex="0"`) |
| 2 | Verify `:focus-visible` | Focus ring (`--vscode-focusBorder`) visible |
| 3 | Verify `role="button"` | Exposed to screen readers |
| 4 | Press Enter | Body toggles |
| 5 | Press Space | Body toggles |

**Test Data:** N/A
**Postconditions:** Keyboard-only navigation fully works

---

## TC-100..TC-199 — Functional — Alternative Flows (Issue 3: Work-Trace AC3-1..AC3-9)

### TC-101: AC3-1 — Trace auto-collapse at streamComplete, one summary line

| Field | Value |
|-------|-------|
| **ID** | TC-101 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UI-SPEC AC3-1, TDD §5.2, §5.3 |
| **Preconditions** | Turn complete; `chat:streamComplete` received |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Wait for `chat:streamComplete` | Trace auto-collapses |
| 2 | Verify summary line format | `⚙ Work trace · {N} tools · {duration}s · thinking {k}×` |
| 3 | Count summary lines per turn | Exactly 1 |
| 4 | Verify answer bubble visible | Below trace, at transcript root |

**Test Data:** N tools ≥ 0, thinking k× ≥ 0
**Postconditions:** One collapsed summary line per turn

---

### TC-102: AC3-2 — User toggle sticky, no auto-collapse after turn end

| Field | Value |
|-------|-------|
| **ID** | TC-102 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UI-SPEC AC3-2, TDD §5.2, SA4E-372 R2 |
| **Preconditions** | Turn in progress; trace open |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click trace summary to toggle | `data-user-managed` set |
| 2 | Wait for turn end (`chat:streamComplete`) | Trace keeps user state (no auto-collapse) |
| 3 | Toggle again | State flips; remains sticky |

**Test Data:** N/A
**Postconditions:** Sticky `data-user-managed` honored

---

### TC-103: AC3-3 — Live turn trace open, thinking+tools inside, progress in summary

| Field | Value |
|-------|-------|
| **ID** | TC-103 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UI-SPEC AC3-3, TDD §5.5 |
| **Preconditions** | Turn streaming (live) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Verify trace open during turn | `data-state="running"` |
| 2 | Verify thinking + tool blocks inside `.trace-body` | In stream order |
| 3 | Verify summary live progress | `⚙ Work trace · running… {N} tools · {Ts} ⟳` |

**Test Data:** Multiple tool calls + thinking cycles
**Postconditions:** Live trace reflects in-progress state

---

### TC-104: AC3-4 — Peer rows at root, never inside trace

| Field | Value |
|-------|-------|
| **ID** | TC-104 |
| **Priority** | High |
| **Type** | Functional / Regression (SA4E-369) |
| **Requirement** | UI-SPEC AC3-4, TDD §5.4, IMPLEMENTATION-HANDISS §11.1 |
| **Preconditions** | Peer inbound message arrives during a turn |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Receive peer_send / peer row mid-turn | Peer row renders at transcript root |
| 2 | Verify peer row NOT inside `.work-trace` | 0 peer rows inside trace body |
| 3 | Verify trace intact | Trace body unchanged |

**Test Data:** Peer message with `peer_inbound` role
**Postconditions:** Peer rows never hidden inside collapsed trace

---

### TC-105: AC3-5 — Approval force-opens trace

| Field | Value |
|-------|-------|
| **ID** | TC-105 |
| **Priority** | High |
| **Type** | Functional |
| **Requirement** | UI-SPEC AC3-5, TDD §5.4, IMPLEMENTATION-HANDOFF §11.1 |
| **Preconditions** | Tool requires approval; trace collapsed |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger tool needing approval | Trace force-opens |
| 2 | Verify approval bar visible | `.tool-approval-bar` visible inside trace |
| 3 | Approve/Reject | Action executes; trace remains open until user closes |

**Test Data:** Tool with pending approval
**Postconditions:** Consent visible; trace force-opened

---

### TC-106: AC3-6 — Reload/replay grouping identical, per-block choices honored

| Field | Value |
|-------|-------|
| **ID** | TC-106 |
| **Priority** | High |
| **Type** | Functional / Persistence |
| **Requirement** | UI-SPEC AC3-6, TDD §10.1 |
| **Preconditions** | History with multiple turns; some blocks user-toggled |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Reload webview / re-render history | One trace per turn |
| 2 | Verify grouping identical to live render | Q → trace → A order preserved |
| 3 | Verify per-block `thinkingCollapsed` honored | Each block direction matches user's prior choice |
| 4 | Verify `data-user-managed` honored | Sticky blocks keep state |

**Test Data:** Multi-turn history
**Postconditions:** Replay == live grouping; per-block choices preserved

---

### TC-107: AC3-7 — Export/copy byte-identical

| Field | Value |
|-------|-------|
| **ID** | TC-107 |
| **Priority** | High |
| **Type** | Functional / Regression |
| **Requirement** | UI-SPEC AC3-7, TDD §10.2, IMPLEMENTATION-HANDOFF §11.1 |
| **Preconditions** | Turn with trace (thinking + tools + bubble) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Export Markdown | Output byte-identical to pre-change build |
| 2 | Export JSON | Output byte-identical to pre-change build |
| 3 | Copy one message | Matches model content |
| 4 | Copy one tool call | Matches model content |

**Test Data:** Same `tab.messages` as baseline
**Postconditions:** Export/copy read model, not DOM; byte-identical

---

### TC-108: AC3-8 — Failed tool shows red ✗ count

| Field | Value |
|-------|-------|
| **ID** | TC-108 |
| **Priority** | Medium |
| **Type** | Functional |
| **Requirement** | UI-SPEC AC3-8, TDD §5.3 |
| **Preconditions** | Turn with ≥1 failed tool |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Complete turn with failed tool | Trace summary appends red `✗ n` |
| 2 | Verify count n | n = number of failed tools |
| 3 | Verify color | Red (reuse `.tc-dot.failed`) |

**Test Data:** ≥1 failed tool entry
**Postconditions:** Failed count visible in summary

---

### TC-109: AC3-9 — Trace summary keyboard

| Field | Value |
|-------|-------|
| **ID** | TC-109 |
| **Priority** | High |
| **Type** | Functional / A11y |
| **Requirement** | UI-SPEC AC3-9, TDD §5.2, UI-SPEC §5 A11y |
| **Preconditions** | Trace summary present |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Tab-navigate to trace summary | Focusable (`tabindex="0"`) |
| 2 | Verify `role="button"` + `aria-expanded` | Synced with body state |
| 3 | Press Enter / Space | Toggles trace body |
| 4 | Verify `:focus-visible` | Focus ring visible |

**Test Data:** N/A
**Postconditions:** Keyboard toggle fully works

---

## TC-200..TC-299 — Functional — Exception / Error Flows

### TC-201: Thinking block — empty thinking entry (no thinking field)

| Field | Value |
|-------|-------|
| **ID** | TC-201 |
| **Priority** | Medium |
| **Type** | Functional / Edge Case |
| **Requirement** | UI-SPEC AC2-6, TDD §4.4 |
| **Preconditions** | Assistant entry with no `thinking` field |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Render entry with `thinking: undefined` | No `.thinking-block` created |
| 2 | Verify trace summary | `thinking 0×` or omitted for that cycle |

**Test Data:** entry.thinking = undefined
**Postconditions:** No phantom block

---

### TC-202: Trace — empty turn (no thinking, no tools)

| Field | Value |
|-------|-------|
| **ID** | TC-202 |
| **Priority** | Medium |
| **Type** | Functional / Edge Case |
| **Requirement** | UI-SPEC AC3-1, IMPLEMENTATION-HANDOFF §11.1 (empty cycles) |
| **Preconditions** | Turn with only answer bubble, no thinking/tools |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Render turn with only bubble | No empty trace summary created |
| 2 | Verify bubble at root | Answer bubble visible at transcript root |

**Test Data:** Turn with content but no thinking/tool entries
**Postconditions:** No empty trace wrapper

---

### TC-203: Reload with stale `streaming:true` tab field

| Field | Value |
|-------|-------|
| **ID** | TC-203 |
| **Priority** | Medium |
| **Type** | Functional / Persistence |
| **Requirement** | UI-SPEC §5 Persistence, TDD §9, IMPLEMENTATION-HANDOFF §4 |
| **Preconditions** | Persisted tab has `streaming: true` but no live stream |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Reload webview | `streaming` resets to `false` |
| 2 | Verify no pill dot | No pulsing violet dot on tab |

**Test Data:** tab.streaming = true (stale)
**Postconditions:** Stale streaming state cleared on restore

---

## TC-300..TC-399 — Business Rule Validation

### TC-301: BR — Chevron convention (collapsed ▸ / expanded ▼)

| Field | Value |
|-------|-------|
| **ID** | TC-301 |
| **Priority** | High |
| **Type** | Business Rule / UI |
| **Requirement** | UI-SPEC §3.2, TDD §4.2 |
| **Preconditions** | Thinking block in collapsed state |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Verify collapsed header | Chevron = `▸` (U+25B6, pointing right) |
| 2 | Expand block | Chevron rotates to `▼` (U+25BC, pointing down) |

**Test Data:** N/A
**Postconditions:** Convention matches VS Code; not inverted

---

### TC-302: BR — min-height 28px on collapsed thinking header

| Field | Value |
|-------|-------|
| **ID** | TC-302 |
| **Priority** | Medium |
| **Type** | Business Rule / UI |
| **Requirement** | UI-SPEC §3.2 State 2, TDD §7.1 `.thinking-header` |
| **Preconditions** | Thinking block collapsed |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Measure collapsed header height | ≥ 28px |

**Test Data:** N/A
**Postconditions:** Hit target large enough to be a control

---

### TC-303: BR — trace summary min-height 30px

| Field | Value |
|-------|-------|
| **ID** | TC-303 |
| **Priority** | Medium |
| **Type** | Business Rule / UI |
| **Requirement** | UI-SPEC §4.2.1, TDD §7.1 `.trace-summary` |
| **Preconditions** | Trace summary present |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Measure trace summary height | ≥ 30px |

**Test Data:** N/A
**Postconditions:** Summary row comfortable hit area

---

### TC-304: BR — metadata computed at settle (chars + duration)

| Field | Value |
|-------|-------|
| **ID** | TC-304 |
| **Priority** | Medium |
| **Type** | Business Rule |
| **Requirement** | UI-SPEC §3.2, TDD §4.3 |
| **Preconditions** | Settled thinking block |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Verify `.thinking-meta` shows chars | `thinkingText.trim().length` |
| 2 | Verify duration | `Date.now() - c.openedAt` at cycle close |

**Test Data:** thinking text ≥ 1 char
**Postconditions:** Metadata accurate at settle time

---

### TC-305: BR — trace summary format

| Field | Value |
|-------|-------|
| **ID** | TC-305 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | UI-SPEC §4.2.1, TDD §5.3 |
| **Preconditions** | Turn complete with tools + thinking |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Verify summary format | `⚙ Work trace · {N} tools · {duration}s · thinking {k}×` |
| 2 | Verify failed count appended | Red `✗ n` if any tool failed |

**Test Data:** N tools, k thinking cycles, n failed
**Postconditions:** Format matches spec exactly

---

### TC-306: BR — sticky `data-user-managed` overrides auto-collapse

| Field | Value |
|-------|-------|
| **ID** | TC-306 |
| **Priority** | High |
| **Type** | Business Rule |
| **Requirement** | UI-SPEC §3.3 / §4.2.2, TDD §5.2, SA4E-372 R2 |
| **Preconditions** | Trace toggled by user mid-turn |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Click trace summary during turn | `data-user-managed` set |
| 2 | Wait for `chat:streamComplete` | Trace keeps user state (no auto-collapse) |

**Test Data:** N/A
**Postconditions:** Sticky override honored

---

### TC-307: BR — trim before persist (whitespace dropped)

| Field | Value |
|-------|-------|
| **ID** | TC-307 |
| **Priority** | Medium |
| **Type** | Business Rule |
| **Requirement** | UI-SPEC §3.2, TDD §4.4 |
| **Preconditions** | Thinking text with leading/trailing whitespace |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Persist thinking = "  hello  " | Stored as "hello" (trimmed) |
| 2 | Chars metadata | Uses trimmed length |

**Test Data:** thinking = "  hello  "
**Postconditions:** No whitespace pollution in persisted data

---

### TC-308: BR — absent field defaults (backward compat)

| Field | Value |
|-------|-------|
| **ID** | TC-308 |
| **Priority** | Medium |
| **Type** | Business Rule / Persistence |
| **Requirement** | UI-SPEC §5 Persistence, TDD §9 |
| **Preconditions** | Older persisted state without `thinkingCollapsed` / `streaming` / `unread` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Load old save (no new fields) | `thinkingCollapsed` defaults false; `streaming` false; `unread` 0 |
| 2 | Render | No crash; defaults applied |

**Test Data:** Legacy tab.messages entry
**Postconditions:** Backward compatible round-trip

---

## TC-400..TC-499 — Boundary & Negative Testing

### TC-401: Boundary — thinking char count at 0 (empty after trim)

| Field | Value |
|-------|-------|
| **ID** | TC-401 |
| **Priority** | Medium |
| **Type** | Boundary |
| **Requirement** | UI-SPEC AC2-6, TDD §4.4 |
| **Preconditions** | Thinking = "" (empty string) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Render cycle with empty thinking | No block; `thinking 0×` |

**Test Data:** thinking = ""
**Postconditions:** Empty thinking dropped

---

### TC-402: Boundary — duration 0 ms (instant cycle)

| Field | Value |
|-------|-------|
| **ID** | TC-402 |
| **Priority** | Low |
| **Type** | Boundary |
| **Requirement** | UI-SPEC AC2-1, TDD §4.3 |
| **Preconditions** | Cycle opened and closed in same tick |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Render settled block | Duration shows "0s" or "0ms"; no crash |

**Test Data:** duration = 0
**Postconditions:** Zero duration handled gracefully

---

### TC-403: Negative — many cycles (N=50) in one turn

| Field | Value |
|-------|-------|
| **ID** | TC-403 |
| **Priority** | Medium |
| **Type** | Negative / Stress |
| **Requirement** | UI-SPEC AC2-4, AC3-1, Performance §5 |
| **Preconditions** | Turn with 50 cycles each with thinking |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Render turn | One trace; 50 thinking blocks inside trace body |
| 2 | Collapse trace | Only summary line; no layout thrash |

**Test Data:** N=50 cycles
**Postconditions:** Performance acceptable; no per-chunk re-create

---

### TC-404: Negative — responsive width 300px (ellipsis on metrics)

| Field | Value |
|-------|-------|
| **ID** | TC-404 |
| **Priority** | Medium |
| **Type** | Boundary / Responsive |
| **Requirement** | UI-SPEC §5 Responsive, TDD §7.1 |
| **Preconditions** | Chat panel width = 300px |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Resize panel to 300px | Trace summary metrics ellipsified (middle) |
| 2 | Verify badges | No badge wraps to second row |

**Test Data:** viewport width 300px
**Postconditions:** Responsive within 300–800px budget

---

### TC-405: Negative — file-size budget ≤200 lines per new module

| Field | Value |
|-------|-------|
| **ID** | TC-405 |
| **Priority** | Medium |
| **Type** | Non-Functional / Budget |
| **Requirement** | UI-SPEC §5 File-size budget, TDD §1.2 |
| **Preconditions** | New modules: chat-tabroute.js, chat-trace.js, chat-jump-pill.js |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Count lines in each new module | ≤ 200 lines each |
| 2 | Count lines per function | ≤ 20 lines each |

**Test Data:** chat-tabroute.js, chat-trace.js, chat-jump-pill.js
**Postconditions:** Budget respected

---

### TC-406: Negative — invalid entry role in trace grouping

| Field | Value |
|-------|-------|
| **ID** | TC-406 |
| **Priority** | Low |
| **Type** | Negative |
| **Requirement** | UI-SPEC AC3-6, TDD §10.1 |
| **Preconditions** | History with unexpected role entry between turns |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Replay history with unknown role | Replay does not crash; trace grouping skips unknown |

**Test Data:** entry.role = "unknown"
**Postconditions:** Graceful degradation

---

## TC-500..TC-599 — UI / UX Testing

### TC-501: Chevron ▸/▼ visual convention (human-eye verification)

| Field | Value |
|-------|-------|
| **ID** | TC-501 |
| **Priority** | Medium |
| **Type** | UI / Visual |
| **Requirement** | UI-SPEC §3.2, TDD §4.2 |
| **Preconditions** | Thinking block collapsed then expanded |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | View collapsed block | Chevron points right `▸` |
| 2 | Expand | Chevron points down `▼` |

**Test Data:** N/A
**Postconditions:** Convention not inverted (fixes R5 from UI-SPEC §3.1)

---

### TC-502: Hover background on collapsed thinking header

| Field | Value |
|-------|-------|
| **ID** | TC-502 |
| **Priority** | Low |
| **Type** | UI / Visual |
| **Requirement** | UI-SPEC §3.2 State 2, TDD §7.1 |
| **Preconditions** | Thinking block collapsed |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Hover over collapsed header | Hover background (`--vscode-list-hoverBackground`) |

**Test Data:** N/A
**Postconditions:** Affordance visible on hover

---

### TC-503: Trace summary hover + focus

| Field | Value |
|-------|-------|
| **ID** | TC-503 |
| **Priority** | Low |
| **Type** | UI / Visual |
| **Requirement** | UI-SPEC §4.2.1, TDD §7.1 `.trace-summary` |
| **Preconditions** | Trace summary present |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Hover / focus trace summary | Hover background + focus ring |

**Test Data:** N/A
**Postconditions:** Interactive affordance clear

---

### TC-504: Violet-tinted trace summary accent

| Field | Value |
|-------|-------|
| **ID** | TC-504 |
| **Priority** | Low |
| **Type** | UI / Visual |
| **Requirement** | UI-SPEC §4.2.1, TDD §7.2 |
| **Preconditions** | Trace summary rendered |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Inspect trace summary text color | Violet-tinted accent (reuse `#a78bfa` family) |

**Test Data:** N/A
**Postconditions:** Color consistent with thinking family

---

### TC-505: Jump-to-latest pill (Issue 1 UX half — out of TDD core scope, documented)

| Field | Value |
|-------|-------|
| **ID** | TC-505 |
| **Priority** | Low |
| **Type** | UI / Out-of-scope note |
| **Requirement** | UI-SPEC §2.3.4 (Issue 1) |
| **Preconditions** | N/A |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | N/A — documented as out of scope for this TDD | N/A |

**Test Data:** N/A
**Postconditions:** N/A (Issue 1 UX half not in this ticket's DOD)

---

## TC-600..TC-699 — Non-Functional (Performance, Persistence, A11y, Responsive)

### TC-601: Performance — trace wrapper not re-created per chunk

| Field | Value |
|-------|-------|
| **ID** | TC-601 |
| **Priority** | High |
| **Type** | Non-Functional / Performance |
| **Requirement** | UI-SPEC §5 Performance, TDD §6 |
| **Preconditions** | Streaming turn with multiple chunks |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Stream multiple chunks | Trace wrapper created once; adoption reuses parent-node checks |
| 2 | Measure layout | No layout thrash |

**Test Data:** Multiple streamChunk events
**Postconditions:** Stable trace wrapper across chunks

---

### TC-602: Persistence — `thinkingCollapsed` round-trips saveState/tab:updated

| Field | Value |
|-------|-------|
| **ID** | TC-602 |
| **Priority** | High |
| **Type** | Non-Functional / Persistence |
| **Requirement** | UI-SPEC §5 Persistence, TDD §9 |
| **Preconditions** | User toggled thinking block |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Toggle thinking block | `thinkingCollapsed` set |
| 2 | Save state (`chat:saveState`) | Field persisted |
| 3 | Reload (`tab:updated` restore) | Direction honored on replay |

**Test Data:** thinkingCollapsed = true/false
**Postconditions:** Round-trip lossless

---

### TC-603: Persistence — `streaming`/`unread` tab fields round-trip

| Field | Value |
|-------|-------|
| **ID** | TC-603 |
| **Priority** | Medium |
| **Type** | Non-Functional / Persistence |
| **Requirement** | UI-SPEC §5 Persistence, TDD §9 |
| **Preconditions** | Tab has `streaming`/`unread` fields |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Save state with tab fields | Fields persisted |
| 2 | Restore | Fields restored; stale `streaming:true` → false |

**Test Data:** tab.streaming, tab.unread
**Postconditions:** Tab fields round-trip safely

---

### TC-604: A11y — role=button, aria-expanded on all new interactive rows

| Field | Value |
|-------|-------|
| **ID** | TC-604 |
| **Priority** | High |
| **Type** | Non-Functional / Accessibility |
| **Requirement** | UI-SPEC §5 A11y, TDD §4.6, §5.2 |
| **Preconditions** | Thinking header + trace summary present |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Inspect thinking header | `role="button"`, `aria-expanded="true\|false"` |
| 2 | Inspect trace summary | `role="button"`, `aria-expanded="true\|false"` |

**Test Data:** N/A
**Postconditions:** Screen-reader accessible

---

### TC-605: A11y — keyboard toggle Enter/Space + focus-visible

| Field | Value |
|-------|-------|
| **ID** | TC-605 |
| **Priority** | High |
| **Type** | Non-Functional / Accessibility |
| **Requirement** | UI-SPEC AC2-7, AC3-9, TDD §4.6 |
| **Preconditions** | Interactive headers focused |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Tab to header; press Enter/Space | Toggles |
| 2 | Verify `:focus-visible` ring | `--vscode-focusBorder` visible |

**Test Data:** N/A
**Postconditions:** Keyboard-only navigation works

---

### TC-606: A11y — badge info mirrored into aria-label (color not sole signal)

| Field | Value |
|-------|-------|
| **ID** | TC-606 |
| **Priority** | Medium |
| **Type** | Non-Functional / Accessibility |
| **Requirement** | UI-SPEC §5 A11y |
| **Preconditions** | Tab status badge present |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Inspect tab button `aria-label` | Includes "streaming in background" or "N new messages" |

**Test Data:** N/A
**Postconditions:** Color never sole signal

---

### TC-607: Responsive — 300–800px width, ellipsis on metrics

| Field | Value |
|-------|-------|
| **ID** | TC-607 |
| **Priority** | Medium |
| **Type** | Non-Functional / Responsive |
| **Requirement** | UI-SPEC §5 Responsive, TDD §7.1 |
| **Preconditions** | Viewport 300px and 800px |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Resize to 300px | Metrics span ellipsified |
| 2 | Resize to 800px | Full metrics visible |
| 3 | Verify badges | No second-row wrap |

**Test Data:** viewport 300px / 800px
**Postconditions:** Responsive within budget

---

### TC-608: File-size budget — new modules ≤200 lines, functions ≤20 lines

| Field | Value |
|-------|-------|
| **ID** | TC-608 |
| **Priority** | Medium |
| **Type** | Non-Functional / Budget |
| **Requirement** | UI-SPEC §5 File-size budget, TDD §1.2 |
| **Preconditions** | chat-tabroute.js, chat-trace.js, chat-jump-pill.js |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Count lines per new module | ≤ 200 |
| 2 | Count lines per function | ≤ 20 |

**Test Data:** New webview modules
**Postconditions:** Budget respected

---

## TC-700..TC-799 — Integration Testing

### TC-701: Integration — trace grouping with thinking + tool blocks in stream order

| Field | Value |
|-------|-------|
| **ID** | TC-701 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | UI-SPEC AC3-3, TDD §5.5 |
| **Preconditions** | Turn with interleaved thinking + tool calls |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Stream turn with thinking + tools | Both adopted into trace body in stream order |
| 2 | Verify order preserved | Q → think → tool → bubble per cycle |

**Test Data:** Interleaved thinking/tool entries
**Postconditions:** Stream order preserved inside trace

---

### TC-702: Integration — adoption mechanics (`openTrace`/`adoptIntoTrace`/`closeTrace`)

| Field | Value |
|-------|-------|
| **ID** | TC-702 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | UI-SPEC §4.2.2, TDD §5.5 |
| **Preconditions** | Turn start → middle → end |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Turn start | `openTrace` creates wrapper |
| 2 | Mid-turn | `adoptIntoTrace` moves elements into body |
| 3 | Turn end | `closeTrace` seals metrics, auto-collapse unless sticky |

**Test Data:** Full turn lifecycle
**Postconditions:** Trace lifecycle correct

---

### TC-703: Integration — replay grouping one trace per turn

| Field | Value |
|-------|-------|
| **ID** | TC-703 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | UI-SPEC AC3-6, TDD §10.1 |
| **Preconditions** | Multi-turn history |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Replay history | One trace per turn |
| 2 | Verify boundary | User message ⇒ new trace; sealed at next user message |

**Test Data:** Multi-turn history
**Postconditions:** Grouping identical to live render

---

### TC-704: Integration — export/copy read model not DOM

| Field | Value |
|-------|-------|
| **ID** | TC-704 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | UI-SPEC AC3-7, TDD §10.2 |
| **Preconditions** | Turn with trace (elements moved into trace) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Export Markdown/JSON | Reads `tab.messages`, byte-identical to baseline |
| 2 | Copy message/tool | Listeners travel with moved nodes |

**Test Data:** Same `tab.messages` as baseline
**Postconditions:** DOM-independent; byte-identical

---

## TC-800..TC-899 — Regression Testing

### TC-801: Regression — export/copy byte-identical (blast radius group 1)

| Field | Value |
|-------|-------|
| **ID** | TC-801 |
| **Priority** | High |
| **Type** | Regression |
| **Requirement** | IMPLEMENTATION-HANDOFF §11.1, UI-SPEC AC3-7 |
| **Preconditions** | Pre-change baseline export available |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Export Markdown + JSON | Byte-identical to pre-change build |
| 2 | Copy one message | Matches model |
| 3 | Copy one tool call | Matches model |

**Test Data:** Baseline tab.messages
**Postconditions:** No export/copy regression

---

### TC-802: Regression — peer rows at root (blast radius group: SA4E-369)

| Field | Value |
|-------|-------|
| **ID** | TC-802 |
| **Priority** | High |
| **Type** | Regression |
| **Requirement** | UI-SPEC AC3-4, IMPLEMENTATION-HANDOFF §11.1 |
| **Preconditions** | Peer inbound during turn |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Receive peer message | Peer row at transcript root |
| 2 | Verify not inside trace | 0 peer rows in `.trace-body` |

**Test Data:** peer_inbound entry
**Postconditions:** Peer feature intact

---

### TC-803: Regression — approval bars (blast radius group)

| Field | Value |
|-------|-------|
| **ID** | TC-803 |
| **Priority** | High |
| **Type** | Regression |
| **Requirement** | UI-SPEC AC3-5, IMPLEMENTATION-HANDOFF §11.1 |
| **Preconditions** | Tool requiring approval |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger approval | Trace force-opens; approval bar visible |
| 2 | Approve/Reject | Action works |

**Test Data:** Tool with pending approval
**Postconditions:** Approval flow intact

---

### TC-804: Regression — empty cycles (blast radius group)

| Field | Value |
|-------|-------|
| **ID** | TC-804 |
| **Priority** | Medium |
| **Type** | Regression |
| **Requirement** | IMPLEMENTATION-HANDOFF §11.1, UI-SPEC AC3-1 |
| **Preconditions** | Tool-only trailing cycle |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Render tool-only cycle | No empty trace summary kept |

**Test Data:** Cycle with tool but no thinking
**Postconditions:** No empty trace wrapper

---

### TC-805: Regression — context compaction / graphviz smoke test

| Field | Value |
|-------|-------|
| **ID** | TC-805 |
| **Priority** | Low |
| **Type** | Regression / Smoke |
| **Requirement** | IMPLEMENTATION-HANDOFF §11.1 |
| **Preconditions** | Context compaction / graphviz active |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Trigger compaction / graphviz render | Transcript root unaffected; trace intact |

**Test Data:** N/A
**Postconditions:** No interference with compaction/graphviz

---

## E2E-UI — Automated Playwright E2E-UI (mapped from STC)

| E2E-UI ID | Maps to | Title | File | Traces To |
|-----------|---------|-------|------|-----------|
| E2E-UI-01 | TC-001 | Collapsed thinking: chevron+chars+duration, min-height 28px, hover | `tests/e2e/thinking-block.ui.e2e.test.ts` | AC2-1 |
| E2E-UI-02 | TC-002 | Click/Enter/Space expand, aria-expanded, chevron ▼ | `tests/e2e/thinking-block.ui.e2e.test.ts` | AC2-2 |
| E2E-UI-03 | TC-003 | Collapse again, thinkingCollapsed persisted, survives reload | `tests/e2e/thinking-block.ui.e2e.test.ts` | AC2-3 |
| E2E-UI-04 | TC-004 | Multi-cycle: only trace summary visible, no bare thinking stack | `tests/e2e/work-trace.ui.e2e.test.ts` | AC2-4, AC3-1 |
| E2E-UI-05 | TC-005 | Live thinking follow-only-at-bottom, no scroll fight | `tests/e2e/thinking-block.ui.e2e.test.ts` | AC2-5 |
| E2E-UI-06 | TC-006 | Whitespace-only thinking dropped | `tests/e2e/thinking-block.ui.e2e.test.ts` | AC2-6 |
| E2E-UI-07 | TC-007 | Keyboard focus-visible, Enter/Space toggle | `tests/e2e/thinking-block.ui.e2e.test.ts` | AC2-7 |
| E2E-UI-08 | TC-101 | Trace auto-collapse at streamComplete, one summary line | `tests/e2e/work-trace.ui.e2e.test.ts` | AC3-1 |
| E2E-UI-09 | TC-102 | Trace sticky: user toggle persists across turn end | `tests/e2e/work-trace.ui.e2e.test.ts` | AC3-2 |
| E2E-UI-10 | TC-103 | Live turn trace open, thinking+tools inside, progress | `tests/e2e/work-trace.ui.e2e.test.ts` | AC3-3 |
| E2E-UI-11 | TC-104 | Peer rows at root, never inside trace | `tests/e2e/work-trace.ui.e2e.test.ts` | AC3-4 |
| E2E-UI-12 | TC-105 | Approval force-opens trace | `tests/e2e/work-trace.ui.e2e.test.ts` | AC3-5 |
| E2E-UI-13 | TC-106 | Reload/replay grouping identical, per-block choices | `tests/e2e/work-trace.ui.e2e.test.ts` | AC3-6 |
| E2E-UI-14 | TC-107 | Export/copy byte-identical | `tests/e2e/export-copy.ui.e2e.test.ts` | AC3-7 |
| E2E-UI-15 | TC-108 | Failed tool shows red ✗ count | `tests/e2e/work-trace.ui.e2e.test.ts` | AC3-8 |
| E2E-UI-16 | TC-109 | Trace summary keyboard | `tests/e2e/work-trace.ui.e2e.test.ts` | AC3-9 |
| E2E-UI-17 | TC-701 | Integration: trace grouping stream order | `tests/e2e/work-trace.ui.e2e.test.ts` | AC3-3 |
| E2E-UI-18 | TC-702 | Integration: openTrace/adoptIntoTrace/closeTrace | `tests/e2e/work-trace.ui.e2e.test.ts` | TDD §5.5 |
| E2E-UI-19 | TC-703 | Integration: replay grouping one trace per turn | `tests/e2e/work-trace.ui.e2e.test.ts` | AC3-6 |
| E2E-UI-20 | TC-704 | Integration: export/copy read model not DOM | `tests/e2e/export-copy.ui.e2e.test.ts` | AC3-7 |
| E2E-UI-21 | TC-801 | Regression: export/copy byte-identical | `tests/e2e/export-copy.ui.e2e.test.ts` | AC3-7 |
| E2E-UI-22 | TC-802 | Regression: peer rows at root | `tests/e2e/work-trace.ui.e2e.test.ts` | AC3-4 |
| E2E-UI-23 | TC-803 | Regression: approval bars | `tests/e2e/work-trace.ui.e2e.test.ts` | AC3-5 |
| E2E-UI-24 | TC-804 | Regression: empty cycles | `tests/e2e/work-trace.ui.e2e.test.ts` | AC3-1 |

**Reuses (existing helpers):**
- `sendMessage(tabId, text)`, `switchTab(tabId)`, `waitForStreamComplete(tabId)`
- `clickTraceSummary(selector)`, `clickThinkingHeader(selector)`
- `assertTraceCollapsed(selector)`, `assertTraceExpanded(selector)`
- `exportConversation(format)`, `copyMessage(selector)`, `copyTool(selector)`

---

## PBT — Property-Based Tests (fast-check)

| PBT ID | Property | Generator | Traces To |
|--------|----------|-----------|-----------|
| PBT-01 | Whitespace-only thinking → no block | random whitespace strings | AC2-6 |
| PBT-02 | thinkingCollapsed round-trips save/reload | boolean + random text | AC2-3, AC3-6 |
| PBT-03 | Multi-cycle N → exactly 1 trace summary | N ∈ [1,100] cycles | AC2-4, AC3-1 |
| PBT-04 | trace summary format invariant | random tool counts/durations | AC3-1, AC3-5 |
| PBT-05 | Chevron convention ▸/▼ follows collapsed state | boolean collapsed state | AC2-1, AC2-2 |
| PBT-06 | Sticky `data-user-managed` survives N toggles | N ∈ [1,50] toggles | AC3-2 |

---

## Requirements Traceability Matrix (RTM)

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| AC2-1 | UI-SPEC §3.5 | TC-001, TC-301, TC-302, E2E-UI-01, PBT-05 | ✅ |
| AC2-2 | UI-SPEC §3.5 | TC-002, E2E-UI-02 | ✅ |
| AC2-3 | UI-SPEC §3.5 | TC-003, TC-306, E2E-UI-03, PBT-02 | ✅ |
| AC2-4 | UI-SPEC §3.5 | TC-004, E2E-UI-04, PBT-03 | ✅ |
| AC2-5 | UI-SPEC §3.5 | TC-005, E2E-UI-05 | ✅ |
| AC2-6 | UI-SPEC §3.5 | TC-006, TC-201, TC-401, E2E-UI-06, PBT-01 | ✅ |
| AC2-7 | UI-SPEC §3.5 | TC-007, TC-605, E2E-UI-07 | ✅ |
| AC3-1 | UI-SPEC §4.4 | TC-101, TC-202, TC-402, TC-804, E2E-UI-04/08, PBT-03/04 | ✅ |
| AC3-2 | UI-SPEC §4.4 | TC-102, TC-306, E2E-UI-09, PBT-06 | ✅ |
| AC3-3 | UI-SPEC §4.4 | TC-103, TC-701, TC-702, E2E-UI-10/17/18 | ✅ |
| AC3-4 | UI-SPEC §4.4 | TC-104, TC-802, E2E-UI-11/22 | ✅ |
| AC3-5 | UI-SPEC §4.4 | TC-105, TC-803, E2E-UI-12/23 | ✅ |
| AC3-6 | UI-SPEC §4.4 | TC-106, TC-703, TC-406, E2E-UI-13/19 | ✅ |
| AC3-7 | UI-SPEC §4.4 | TC-107, TC-704, TC-801, E2E-UI-14/20/21 | ✅ |
| AC3-8 | UI-SPEC §4.4 | TC-108, E2E-UI-15 | ✅ |
| AC3-9 | UI-SPEC §4.4 | TC-109, TC-605, E2E-UI-16 | ✅ |
| §5 Performance | UI-SPEC §5 | TC-601, TC-403 | ✅ |
| §5 Persistence | UI-SPEC §5 | TC-602, TC-603, TC-308, PBT-02 | ✅ |
| §5 A11y | UI-SPEC §5 | TC-604, TC-605, TC-606 | ✅ |
| §5 Responsive | UI-SPEC §5 | TC-404, TC-607 | ✅ |
| §5 File-size budget | UI-SPEC §5 | TC-405, TC-608 | ✅ |
| Regression: export/copy | IMPLEMENTATION-HANDOFF §11.1 | TC-801, E2E-UI-21 | ✅ |
| Regression: peer rows (SA4E-369) | IMPLEMENTATION-HANDOFF §11.1 | TC-802, E2E-UI-22 | ✅ |
| Regression: approval bars | IMPLEMENTATION-HANDOFF §11.1 | TC-803, E2E-UI-23 | ✅ |
| Regression: empty cycles | IMPLEMENTATION-HANDOFF §11.1 | TC-804, E2E-UI-24 | ✅ |
| Regression: context compaction/graphviz | IMPLEMENTATION-HANDOFF §11.1 | TC-805 | ✅ |

**Coverage: 100% of AC2-1..AC2-7, AC3-1..AC3-9, §5 cross-cutting, and all regression blast radius groups.**

---

**End of STC.** See `TEST-REPORT.md` for execution results.

---

---

---

---

---
