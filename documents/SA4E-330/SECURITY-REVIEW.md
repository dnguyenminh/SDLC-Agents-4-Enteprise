# 🔒 Security Design Review (Phase 3.7) — SA4E-330: Pi Session Compaction + Eval Harness for Small Models

## Document Information

| Field | Value |
|-------|-------|
| Project | SDLC-Agents-4-Enterprise (VS Code extension, Epic SA4E-289) |
| Ticket | SA4E-330 — Session compaction and evaluation harness for small models |
| Scope (design) | `SessionMonitor` (compact ≥ 0.95 / warn ≥ 0.85 thresholds), `Summarizer` (intent = first user message ≤150 chars, tools used, lastResponse ≤250 chars), `formatSummaryMessage` (system-role `[compaction]` message), `SessionCompactor` (keep summary + last 2 messages; COMPACT_FAIL → truncate; quality score; 300ms latency budget), `EvalHarness` (golden dataset → runner → keyword coverage; `TASK_SUCCESS_COVERAGE 0.8`, baseline ratio 0.8) |
| Design docs | `documents/SA4E-330/TDD.md` v1.0 (skeleton), `FSD.md`; module layout `extension/src/pi-agent/` |
| Date | 2026-09-27 |
| Assessor | Security Agent (design review; static, no exploitation) |
| Version | 1.0 |

## Executive Summary

The compactor is a context-management control with a prompt-injection twist: its output **rewrites conversation history into a `system`-role message** whose content derives from raw user/assistant text. That is a privilege-elevation primitive for injected content (user-authored text re-labeled as system instruction) and, because the summary format is pipe-delimited with no escaping, a user message containing `| tools:` or `| lastResponse:` can forge summary fields. The trigger contract has a units hazard: thresholds are **fractions** (0.95/0.85) while the rest of the codebase's usage signals are **percent** (ContextUsageTracker, budget gate 95/85) — a caller passing `95` triggers compaction on every turn ("compaction-trigger abuse" → repeated context destruction). The eval harness executes dataset-supplied queries against a live session — an untrusted dataset is arbitrary-prompt execution and unbounded cost; its `id` field is logged on errors (log injection). No Critical/High; all findings are local fixes.

**Overall Risk Rating: Medium**

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 0 |
| 🟡 Medium | 2 |
| 🔵 Low | 1 |
| ℹ️ Informational | 3 |

## Findings Summary Table

| ID | Severity | Title | Location (design) | Recommendation |
|----|----------|-------|-------------------|----------------|
| SEC-330-D1 | Medium | Compaction summary injects raw user/assistant content into a `system`-role message, unescaped, forgeable delimiters (`\|`) → user content elevated to system privilege; summary-field forgery | `Summarizer.summarize` + `formatSummaryMessage` | Escape/sanitize fields; keep compacted history in original roles; prefix with provenance marker; never let summary text carry instructions |
| SEC-330-D2 | Medium | Usage unit-contract ambiguity (fraction 0.95 vs codebase percent 95) + unvalidated caller `usage` → compaction-trigger abuse (perpetual compaction = context DoS) | `SessionMonitor.shouldCompact(usage)` contract | Enforce/validate `0 ≤ usage ≤ 1` (reject >1 as percent-scale misuse); document unit in TDD; normalize at the boundary |
| SEC-330-D3 | Low | Eval harness: untrusted dataset = arbitrary prompt execution + unbounded sequential LLM cost; `id` logged raw on error (log injection) | `EvalHarness(dataset)` + `runCase` | Bound dataset size/case length; validate ids (charset); require explicit operator opt-in for non-default datasets |
| SEC-330-D4 | Info | COMPACT_FAIL silently truncates to last 2 messages (availability fail-safe, quality score 0 marks it) | `SessionCompactor` catch path | Accepted; surface `truncated` flag to user |
| SEC-330-D5 | Info | Repeated-compaction thrash possible when the 2 kept messages alone exceed the window (`estimateUsageAfter` stays ≥ threshold) | `estimateUsageAfter` scaling | Detect no-progress compaction and stop/warn |
| SEC-330-D6 | Info | Metric named `faithfulness` is actually keyword coverage — misleading gate if used for release decisions | `EvalHarness.buildMetrics` | Rename or document |

## Findings by OWASP Top 10 (2021)

- **A03 Injection (LLM01 Prompt Injection)** — SEC-330-D1 (role-elevation of user content), SEC-330-D3 (dataset-driven prompt execution).
- **A04 Insecure Design** — SEC-330-D2 (unit contract), SEC-330-D5.
- **A09 Logging Failures** — SEC-330-D3 (id log injection).
- **A01/A02/A05/A06/A07/A08/A10** — No issues found ✅ (no auth, no crypto, no new deps, no network beyond the session itself, no deserialization).

## Detailed Findings

### SEC-330-D1: Role elevation + field forgery in the compaction summary

Design: after compaction, the session's history is `[system: "[compaction] intent: {first-user-150-chars} | tools: {…} | lastResponse: {assistant-250-chars}"] + last-2-messages`. Two problems: (1) the *intent* fragment is verbatim user text — anything the user (or an injected document they pasted) wrote now sits in a message labeled `system`, which models treat as higher-authority; (2) fields are joined with `|` and not escaped, so a first-user-message containing `| tools: rm -rf | lastResponse: …` forges the summary structure. Compounding: compaction *preserves* attacker text while discarding surrounding context — the classic injection-persistence amplifier. Fix: (a) escape delimiters/newlines in all three fields; (b) prefer re-emitting summary content as a `user`-role or clearly-marked metadata block rather than `system`; (c) cap and neutralize control phrases; (d) keep `[compaction]` provenance prefix (already designed ✅).

### SEC-330-D2: Trigger-contract units and validation

`shouldCompact(usage)` expects a fraction, but the extension's existing usage signals are percentages (e.g. `ContextUsageTracker.pct`, budget gate's 95/85). A wiring mistake (passing `95`) makes `usage >= 0.95` true every turn → compact every turn → summary-only history (quality collapse; a soft DoS on the user's own session). The design should validate input (`> 1.0` → reject or rescale with a warn) and state the unit unambiguously in the contract.

### SEC-330-D3: Eval harness trust boundary

`EvalHarness(runner, dataset)` — dataset entries supply `query` strings executed verbatim against a live session and `id` strings logged on failure. A dataset from an untrusted source (file, issue, another agent) is arbitrary prompt execution with the session's authority plus unbounded sequential cost (no case-count or per-case length caps). Fix: bound `dataset.length`, cap query length, validate `id` charset, and require the default golden set unless an operator explicitly opts in.

## Positive Controls Acknowledged ✅

- Compaction caps: intent 150 / lastResponse 250 chars; kept messages = 2; latency budget 300ms (measured, not enforced — fine for a soft target).
- COMPACT_FAIL fail-safe truncation marked `truncated: true` + `qualityScore: 0` — degraded state is at least *recorded*.
- `qualityScore` requires presence of intent/tools/lastResponse only when the source session had them — sensible null-handling (no divide-by-zero).
- Eval: sequential bounded runner; error cases skipped and counted; `compareWithBaseline` guards division by zero; baseline ratio threshold explicit.

## Remediation Priority

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| 1 | SEC-330-D1 escaping + role strategy | Low | Blocks role-elevation injection persistence |
| 2 | SEC-330-D2 usage validation/normalization | Low | Blocks trigger abuse |
| 3 | SEC-330-D3 dataset bounds + id validation | Low | Cost/injection containment |
| 4 | D4–D6 documentation/flags | Low | Hygiene |

## Verdict

**APPROVED-WITH-CONDITIONS** — no Critical/High. Conditions: (1) SEC-330-D1 escaping + non-system role (or explicit neutralization) must land before the compactor is wired into live sessions (blocking for the wiring ticket); (2) SEC-330-D2 input validation at the same time; (3) SEC-330-D3 dataset bounding if the harness is ever fed non-default datasets.

## Scope Limitations

- Skeleton TDD; design reconstructed from TDD + FSD + implemented structure (code evidence in `SECURITY-ASSESSMENT.md`).
- The real summarizer (LLM-backed intent extraction) is a future wiring concern — this design's deterministic Summarizer is what ships now.
