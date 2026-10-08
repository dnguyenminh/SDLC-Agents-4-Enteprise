# [SA4E-339] Business Requirements Document (BRD)
**Version:** 1.1  
**Status:** Draft (Needs Revision)  
**Author:** ba-agent  
**Ticket:** SA4E-339

## 1. Issue Overview
- **Ticket Key**: SA4E-339
- **Project**: SDLC Agents 4 Enterprise (SA4E)
- **Issue Type**: Bug
- **Priority**: High
- **Component**: Extension (`extension/src/chat-panel`, `extension/src/pi-workflow`)
- **Summary**: Automatic session compaction (`SessionCompactor`) is not wired into `updateContextUsageAfterTurn` in `ChatPanelProvider`. When LLM responses or tool outputs push token consumption to >=95%, the chat session overflows and shows a red `Context window is full. Start new tab` banner instead of compacting automatically.

## 2. Root Cause Analysis
1. `SessionCompactor` (`extension/src/pi-agent/session-compactor.ts`) implements compaction logic (summarizing conversation history when usage `>= COMPACT_USAGE_THRESHOLD` (0.95), defined at `session-compactor.ts:11`).
2. `ChatPanelProvider` (`extension/src/chat-panel/chat-panel-provider.ts`) tracks context usage in `updateContextUsageAfterTurn()`, but only sends usage statistics to the webview UI without triggering `SessionCompactor`.
3. `pi-context-pipeline.ts` delegates auto-compression to external context handlers, which are empty if no extension handler is registered, returning un-compacted messages.

## 3. Acceptance Criteria
- [x] **AC-01**: `ChatPanelProvider` must instantiate/consult `SessionCompactor` during `updateContextUsageAfterTurn()`. *(Status: verified — field `private sessionCompactor` at `chat-panel-provider.ts:28`, consulted at `:249`; STC-339-04 PASSED per TEST-REPORT v1.2.)*
- [x] **AC-02**: When total usage fraction is `>= COMPACT_USAGE_THRESHOLD` (0.95, defined in `session-compactor.ts`), `SessionCompactor.compact()` must execute automatically. *(Status: verified — trigger at `chat-panel-provider.ts:221`; STC-339-01/02/05/06/07/08 PASSED per TEST-REPORT v1.2; boundary case STC-339-05 still uses input 95 instead of 94.5 — finding N-01, owner dev-agent.)*
- [x] **AC-03**: The compacted summary + `RECENT_MESSAGES_KEPT` (2 messages) must replace active session messages and update the engine's chat history. *(Status: verified — `setChatHistory` at `chat-panel-provider.ts:251-252`; STC-339-06/08 PASSED per TEST-REPORT v1.2.)*
- [x] **AC-04**: The webview context meter must update to reflect the reduced token count (<70% target usage) without forcing the user to open a new tab. *(Status: verified — `tab:contextUpdate` broadcast at `chat-panel-provider.ts:230`; STC-339-03 PASSED per TEST-REPORT v1.2.)*
- [ ] **AC-05**: All tests in `extension/src/__tests__/chat` AND the new `extension/src/chat-panel/__tests__/chat-panel-provider.compaction.test.ts` pass (mapping AC ↔ STC ↔ test name). *(Status: PARTIAL — full suite is green (249 files / 2395 tests / 0 fail) and TEST-REPORT v1.2 lists a mapping, but the AC-05 regression case STC-339-11 is still a placeholder assertion `expect(true).toBe(true)` at `chat-panel-provider.compaction.test.ts:245` (blocker DEV-B1c open). AC-05 cannot be signed off until the placeholder is replaced by a real assertion.)*

## 4. Proposed Technical Fix
- **Target File**: `extension/src/chat-panel/chat-panel-provider.ts`
- **Method**: Modify `updateContextUsageAfterTurn()` to evaluate `SessionMonitor.shouldCompact(usageFraction)` — single source of truth for the threshold is `COMPACT_USAGE_THRESHOLD = 0.95` in `session-compactor.ts` (no separate hardcoded literal).
- **Execution Flow**:
  1. Calculate `usageFraction = normalizeUsageToFraction(payload.total.percentage)` — the percent-scale signal from `ContextUsageTracker` is normalized to a fraction in `[0, 1]` (this IS the SEC-330-02 control). Per decision **D-2a** this is THE specified formula; the previous raw token-ratio approximation (`tokens` ÷ `maxTokens`) is retired and must not be used.
     - *Boundary note (true behavior)*: `ContextUsageTracker` computes `percentage = Math.round((tokens / maxTokens) * 100)` (integer percent), so a true usage of **94.5%** rounds up to 95 → `0.95` → compaction can activate from 94.5% actual usage, while the guard itself compares against `COMPACT_USAGE_THRESHOLD` (0.95). Boundary case covered by STC-339-05.
  2. If `SessionMonitor.shouldCompact(usageFraction) === 'compact'` (i.e. `usageFraction >= COMPACT_USAGE_THRESHOLD` (0.95)) **and** `messages.length > RECENT_MESSAGES_KEPT` (2), invoke `this.sessionCompactor.compact(session)`.
  3. Update `engine.setChatHistory(compactedMessages)` and send `tab:contextUpdate` to webview.

## 5. Non-Functional Requirements (NFR)
- **NFR-01**: Performance latency for compaction operations MUST be $\le 300\text{ms}$.
- **NFR-02**: Errors during compaction MUST be non-fatal and must not crash the chat view.
- **NFR-03**: The usage after successful compaction should target $<70\%$ of the context window.

## 6. Dependencies
- `SessionCompactor`
- `ContextUsageTracker`
- `PiWorkflowAdapter`

## 7. Traceability Matrix

| BRD AC | FSD Section | TDD Section | STC ID |
|---|---|---|---|
| AC-01 | §2.1, §4 (BR-06, BR-07) | §2.2 (property `sessionCompactor`), §2.3 (Insertion Points) | STC-339-04 |
| AC-02 | §3 (UC-02), §4 (BR-01) | §2.3 (Insertion Point 1 — trigger) | STC-339-01, STC-339-02, STC-339-05, STC-339-06, STC-339-07, STC-339-08 |
| AC-03 | §3 (UC-02), §4 (BR-02) | §2.3 (Insertion Point 3 — `applyCompactionAndRecount`) | STC-339-06, STC-339-08 |
| AC-04 | §4 (BR-03), §5.2 | §2.3 (Insertion Point 1 — `tab:contextUpdate` + recount) | STC-339-03 |
| AC-05 | §1.2 | §5 (Implementation Checklist — AC-05) | STC-339-11 |
| SEC-330-01 *(inherited from SA4E-330)* | §4 (BR-04), §8 | §4 (Security Design) | STC-339-09 |
| SEC-330-02 *(inherited from SA4E-330)* | §4 (BR-05), §8 | §4 (Security Design) | STC-339-10 |

*Section references verified against the actual headings of `FSD.md` (§1 Overview, §2 Component Specifications → §2.1 ChatPanelProvider / §2.2 SessionCompactor, §3 Use Cases, §4 Business Rules, §5 API Contracts → §5.1/§5.2, §6 Traceability, §7 Diagrams, §8 Security & Quality Requirements) and `TDD.md` (§1 Architecture → §1.1 Diagram Index, §2 Implementation Specifications → §2.1 Imports / §2.2 Property Addition / §2.3 updateContextUsageAfterTurn Insertion Points, §3 Error Handling, §4 Security Design, §5 Implementation Checklist). STC IDs aligned with the RTM in `STP.md` §4 (all 11 STC-339-01…11 now referenced).*

## 8. Requirements Diagrams

### 8.1 Diagram Index
| Figure | Name | File | Description |
|---|---|---|---|
| Figure 1 | Use Case Diagram | `diagrams/use-case.png` (`.drawio`) | Use Case Diagram for Context Window Monitoring & Auto-Compaction. |
| Figure 2 | Business Flow Diagram | `diagrams/business-flow.png` (`.drawio`) | Business Process Flow of Auto-Compaction. |

*(Please see the generated diagrams in the `diagrams/` folder)*
