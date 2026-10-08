# [SA4E-339] Software Test Cases (STC)
**Version:** 1.2  
**Status:** Draft (Under Review)  
**Author:** qa-agent  
**Ticket:** SA4E-339  

> **Round 4 changes:** STC-339-05 rewritten with the real 94.5% round-up boundary (finding N-01); added STC-339-12 (BR-07 performance), STC-339-13 (UC-06 non-compact action), STC-339-14 (UC-07 post-compact usage), STC-339-15 (FSD UC-06 `setChatHistory` guard); added RTM (section 3) and test-data index (section 2).

---

## 1. Test Cases

| Case ID | Title | Precondition | Input / Action | Expected Outcome |
|:---|:---|:---|:---|:---|
| **STC-339-01** | Safe Usage (< 80%) No Compaction | Engine has messages (~10% usage) | Call `updateContextUsageAfterTurn()` | Messages remain unchanged, no compaction triggered |
| **STC-339-02** | High Usage (>= 95%) Triggers Compaction | Engine has >2 messages (> 95% token budget) | Call `updateContextUsageAfterTurn()` | Compaction triggers; engine history reduced to Summary + 2 recent messages; usage < 70% |
| **STC-339-03** | Webview Context Meter Broadcast | Compaction completed | Observe `sendToWebview` payload | `type: "tab:contextUpdate"` sent with updated token count and breakdown conforming to FSD contract |
| **STC-339-04** | Error Resilience | Engine throws error on `setChatHistory` | Call `updateContextUsageAfterTurn()` | Error logged silently without crashing extension or breaking chat flow |
| **STC-339-05** | Boundary 94.5% round-up (finding N-01 closed) | Engine has >2 messages. True token usage is **exactly 94.5%**: `total_tokens = 120960`, `max_tokens = 128000`. | Call `updateContextUsageAfterTurn()`. The percentage MUST be produced by the real rounding step `Math.round((total/maxTokens)*100)` (`context-usage-tracker.ts:86`) — i.e. `Math.round(94.5) = 95` — and then passed to `normalizeUsageToFraction(95) = 0.95`. Do **not** hardcode an already-rounded payload that skips the rounding step. | **Compaction TRIGGERS.** Effective trigger boundary is **94.5% of true token usage, not 95%**: `0.95 >= COMPACT_USAGE_THRESHOLD (0.95)` → action `'compact'` → history replaced by summary + 2 recent messages. Control sub-case: true usage **94.4%** (`total_tokens = 120832`) → `Math.round(94.4) = 94` → fraction `0.94` → action `'warn'` → **no** compaction. |
| **STC-339-06** | Exactly 2 messages, usage >=95% | Engine has exactly 2 messages taking >=95% usage. | Call `updateContextUsageAfterTurn()` | KHÔNG compact (Skip compaction). |
| **STC-339-07** | Engine is null | `engine` is null. | Call `updateContextUsageAfterTurn()` | Return early, no throw. |
| **STC-339-08** | `compact()` returns action != compact | `SessionCompactor` returns empty messages or action "none". | Call `updateContextUsageAfterTurn()` | History remains unchanged. |
| **STC-339-09** | SEC-330-01 Role validation | Compaction triggers successfully. | Inspect `result.session.messages` | Summary message MUST have role `'user'` and start with prefix `[compaction]`. Never `'system'`. |
| **STC-339-10** | SEC-330-02 Usage normalization | Usage input is > 1.0 (percent-scale) e.g., 105%. | Inspect input to `SessionMonitor.shouldCompact` | Input is normalized to 1.0 (or within [0, 1]). |
| **STC-339-11** | AC-05 Regression | Pre-existing chat test suite. | Run `npm test` on `__tests__/chat` | 0 test failures. |
| **STC-339-12** | Performance Budget — compaction latency <= 300 ms **[BR-07]** | Real (non-mocked) `SessionCompactor`; a 20-turn session (20 messages) at `usage = 0.96`, `contextWindow = 8192`. | Call `compactor.compact(session)` and read `result.latencyMs`. | `result.latencyMs < 300` — i.e. `expect(result.latencyMs).toBeLessThan(300)` — consistent with `COMPACTION_TIME_BUDGET_MS = 300` (`session-compactor.ts:14`). No timeout, no throw. |
| **STC-339-13** | Non-compact action (`'none'`/`'warn'`) preserves history — work-order UC-06 / FSD UC-05 | Engine has >2 messages; payload usage **below** the warn band (e.g. 10% → action `'none'`) and, in a second run, inside the warn band (e.g. 86% → action `'warn'`). | Call `updateContextUsageAfterTurn()` for both payloads. | `SessionCompactor.compact()` returns `action != 'compact'` (`'none'` or `'warn'`) → `engine.setChatHistory` is **never called**; `engine.getChatHistory()` still returns the ORIGINAL messages, count unchanged (e.g. still 5), no summary message injected, no message truncated. |
| **STC-339-14** | Usage still >= threshold after compaction — work-order UC-07 / FSD UC-07 | Engine has >2 messages; initial payload `percentage >= 95`; after `compact()` returns `action: 'compact'` the refetched payload is **still** `percentage >= 95` (summary messages still huge / `usageAfter` still >= 0.95). | Call `updateContextUsageAfterTurn()` on turn 1, then again on turn 2 with the still-high payload. | Session remains **compact-eligible**: turn 2 re-enters the `shouldCompact(...) === 'compact' && messages.length > 2` branch and `compact()` is invoked again (re-compaction path, no infinite loop within a single call — compaction runs at most once per turn). Payload is refetched after compaction (TDD F-1, `chat-panel-provider.ts:225`) and `tab:contextUpdate` is still broadcast each turn. No crash. |
| **STC-339-15** | Missing `setChatHistory` guard — FSD UC-06 | Engine object has **no** `setChatHistory` method (property absent or not a function); payload `percentage >= 95`; >2 messages. | Call `updateContextUsageAfterTurn()` | Guard `typeof engine.setChatHistory === "function"` (`chat-panel-provider.ts:251`) short-circuits the history write: **no throw**, compaction result still recounted via `contextUsageTracker.updateFromMessages(...)`, and `tab:contextUpdate` is still broadcast. Extension/chat flow stays alive. |

### 1.1 Ground-truth reference for STC-339-12 (BR-07 perf)

The performance assertion already exists in the real test suite — reuse it verbatim, do not invent a new threshold:

- **File:** `extension/src/pi-agent/__tests__/session-compactor.test.ts`
- **Test:** `FSD 12.5: compaction completes under 300ms` (lines 123-126)
- **Assertion:**
  ```ts
  const result: CompactionResult = compactor.compact(buildSession(twentyTurns()));
  expect(result.latencyMs).toBeLessThan(300);
  ```
- **Constant:** `export const COMPACTION_TIME_BUDGET_MS = 300;` (`extension/src/pi-agent/session-compactor.ts:14`)

> Note: the file lives under `src/pi-agent/__tests__/`, **not** `src/chat-panel/__tests__/` — the ticket-level compaction wiring tests live in `extension/src/chat-panel/__tests__/chat-panel-provider.compaction.test.ts`, while the `SessionCompactor` perf/quality tests live in `src/pi-agent/__tests__/session-compactor.test.ts`.

### 1.2 Boundary semantics for STC-339-05 (D-2a: keep code, align docs)

Ground-truth chain (`code == TDD == FSD` after D-2a):

| Step | Location | Formula | Example (94.5%) |
|---|---|---|---|
| 1 | `context-usage-tracker.ts:86` | `percentage = Math.min(100, Math.round((total/maxTokens) * 100))` | `Math.round(94.5) = 95` → `95` |
| 2 | `chat-panel-provider.ts:218` | `usageFraction = normalizeUsageToFraction(percentage)` = `percentage / 100` | `95 / 100 = 0.95` |
| 3 | `session-compactor.ts:83` | `usage >= COMPACT_USAGE_THRESHOLD (0.95)` → `'compact'` | `0.95 >= 0.95` → **`'compact'`** |

**Effective input boundary = 94.5% true usage** (inclusive). Any true usage in `[94.5%, 95%)` rounds **up** to 95 and triggers compaction; `94.4%` rounds to 94 and only `'warn'`. This is why the boundary case is 94.5% and **not** 95%.

---

## 2. Test Data

Test data files live in `testdata/compaction-data.csv` (one row per test case / boundary control).

| test_case_id | true_usage_percent | payload_percentage | total_tokens | max_tokens | message_count | expected_action | expected_result |
|---|---|---|---|---|---|---|---|
| STC-339-01 | 10 | 10 | 12800 | 128000 | 5 | none | History unchanged; `compact()` not called |
| STC-339-02 | 97.66 | 98 | 125000 | 128000 | 5 | compact | History = summary + 2 recent messages; usage after < 70% |
| STC-339-03 | 97.66 | 98 | 125000 | 128000 | 5 | compact | `tab:contextUpdate` broadcast with `tokenCount`, `maxTokens`, `breakdown` |
| STC-339-04 | 97.66 | 98 | 125000 | 128000 | 5 | compact | `setChatHistory` throws → caught, non-fatal, no crash |
| STC-339-05 | **94.5** | **95** (after `Math.round`) | **120960** | **128000** | 5 | compact | Round-up: 94.5 → 95 → 0.95 → COMPACT |
| STC-339-05-CTRL | **94.4** | **94** (after `Math.round`) | **120832** | **128000** | 5 | warn | Just below boundary → no compaction |
| STC-339-06 | 97.66 | 98 | 125000 | 128000 | **2** | — | No compaction (`messages.length > 2` false) |
| STC-339-07 | 97.66 | 98 | 125000 | 128000 | 5 | — | `engine = null` → early return, no throw |
| STC-339-08 | 97.66 | 98 | 125000 | 128000 | 5 | none (mocked) | `setChatHistory` not called; history unchanged |
| STC-339-09 | 97.66 | 98 | 125000 | 128000 | 5 | compact | Summary message `role === 'user'` and `content` starts with `[compaction]` |
| STC-339-10 | 105 (percent-scale) | 105 | 134400 | 128000 | 5 | compact/normalize | `normalizeUsageToFraction(150)` in `[0, 1]`; `> 100 → 1` |
| STC-339-11 | n/a (regression) | n/a | n/a | n/a | n/a | n/a | `npm test` → 0 failures (26 files / 178 tests in `src/__tests__/chat`) |
| STC-339-12 | 96 | 96 | 122880 | 128000 | 20 | compact | `result.latencyMs < 300` |
| STC-339-13 | 10 (run A) / 86 (run B) | 10 / 86 | 12800 / 110080 | 128000 | 5 | none / warn | History unchanged; message count still 5 |
| STC-339-14 | 97.66 → still 97.66 after compact | 98 → 98 | 125000 | 128000 | 5 | compact (twice) | Re-eligible on turn 2; `compact()` called again; payload refetched |
| STC-339-15 | 97.66 | 98 | 125000 | 128000 | 5 | compact | Guard skips history write; no throw; recount + broadcast still happen |

CSV file: `testdata/compaction-data.csv`.

---

## 3. Requirements Traceability Matrix (RTM)

### 3.1 BRD Acceptance Criteria

| Requirement | Source | Test Cases | Coverage |
|---|---|---|---|
| AC-01 — integrate `SessionCompactor` without crashing | BRD §2.1 / FSD §4 (BR-06, BR-07) | STC-339-04, STC-339-12, STC-339-15 | ✅ |
| AC-02 — trigger compaction when usage >= threshold | BRD §2.1 / FSD §3 (UC-02), §4 (BR-01) | STC-339-01, STC-339-02, STC-339-05, STC-339-06, STC-339-07, STC-339-14 | ✅ |
| AC-03 — history reduced to summary + 2 recent messages | BRD §2.1 / FSD §3 (UC-02), §4 (BR-02) | STC-339-02, STC-339-06, STC-339-08, STC-339-13 | ✅ |
| AC-04 — update webview `tab:contextUpdate` with reduced usage | BRD §2.1 / FSD §4 (BR-03), §5.2 | STC-339-03, STC-339-14 | ✅ |
| AC-05 — test suite passes (regression) | BRD §2.1 / FSD §1.2 | STC-339-11 | ✅ |

### 3.2 FSD Business Rules

| Requirement | Source | Test Cases | Coverage |
|---|---|---|---|
| BR-01 — trigger when usage >= 0.95 | FSD §4 | STC-339-01, STC-339-02, STC-339-05, STC-339-06, STC-339-14 | ✅ |
| BR-02 — keep 2 recent messages | FSD §4 | STC-339-02, STC-339-06 | ✅ |
| BR-03 — usage after compaction < 70% | FSD §4 | STC-339-02 | ✅ |
| BR-04 — summary role `'user'` + prefix `[compaction]` | FSD §4 (SEC-330-01) | STC-339-09 | ✅ |
| BR-05 — usage normalized to `[0, 1]` | FSD §4 (SEC-330-02) | STC-339-10 | ✅ |
| BR-06 — compaction is non-fatal | FSD §4 | STC-339-04, STC-339-15 | ✅ |
| BR-07 — compaction latency <= 300 ms | FSD §4 | **STC-339-12** | ✅ |

### 3.3 FSD Use Cases

| Requirement | Source | Test Cases | Coverage |
|---|---|---|---|
| UC-01 — usage < threshold, do not compact | FSD §3 | STC-339-01 | ✅ |
| UC-02 — usage >= 0.95 and messages > 2, compact | FSD §3 | STC-339-02, STC-339-05 | ✅ |
| UC-03 — usage >= 0.95 but messages <= 2, skip | FSD §3 | STC-339-06 | ✅ |
| UC-04 — engine null, return early | FSD §3 | STC-339-07 | ✅ |
| UC-05 — `compact()` action != `compact` or empty, keep history *(work-order UC-06)* | FSD §3 | STC-339-08, **STC-339-13** | ✅ |
| UC-06 — `setChatHistory` missing, skip update + no crash | FSD §3 | **STC-339-15** | ✅ |
| UC-07 — usage still >= threshold after successful compaction *(work-order UC-07)* | FSD §3 | **STC-339-14** | ✅ |
| UC-08 — generic error during compaction, non-fatal | FSD §3 | STC-339-04 | ✅ |

### 3.4 Security Controls

| Requirement | Source | Test Cases | Coverage |
|---|---|---|---|
| SEC-330-01 — role elevation prevention | FSD §8.1 / TDD §4 | STC-339-09 | ✅ |
| SEC-330-02 — usage scale contract | FSD §8.2 / TDD §4 | STC-339-10 | ✅ |

**RTM coverage: 5/5 AC · 7/7 BR · 8/8 UC · 2/2 SEC = 100%.**
