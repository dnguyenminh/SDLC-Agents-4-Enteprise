# 🔒 Security Design Review (Phase 3.7) — SA4E-329: Pi Model Routing and Fallback (small → large)

## Document Information

| Field | Value |
|-------|-------|
| Project | SDLC-Agents-4-Enterprise (VS Code extension, Epic SA4E-289) |
| Ticket | SA4E-329 — Model routing with small-first strategy and fallback to large model |
| Scope (design) | `ModelRouter` (small-first routing by registry context window ≤16384; `shouldEscalate` on confidence + per-session escalation budget), `ConfidenceScorer` (structured `confidence:` extraction + hedging/confident-phrase heuristics), `FallbackHandler` (escalation apply/block, cost ceiling ≤ +30%, diagnostics trail), `RoutingPolicy` constants (threshold 0.75, maxEscalations 1/session, maxRetries 1) |
| Design docs | `documents/SA4E-329/TDD.md` v1.0 (skeleton), `FSD.md`; module layout `extension/src/pi-agent/` |
| Date | 2026-09-27 |
| Assessor | Security Agent (design review; static, no exploitation) |
| Version | 1.0 |

## Executive Summary

SA4E-329's escalation gate is a **quality/cost control**, not a security boundary — but a weak gate creates real cost-DoS and quality-integrity exposure. The design is well-bounded on paper: 1 escalation per session, +30% cost ceiling, retry cap, and a diagnostics trail. The central weakness is the **confidence oracle**: the score is derived from the answer text itself, including a *self-declared* `confidence: 0.9` pattern — meaning the artifact being graded controls its own grade. Combined with a default heuristic of 0.8 against a 0.75 threshold, almost any answer (even hedging-free garbage) is "confident", so the small→large fallback almost never fires — the control is effectively inert, which defeats the ticket's purpose and masks small-model failures. Secondary items: unknown-model routing errors keep the requested model (fail-open to a possibly nonexistent model), cost-ceiling treats unregistered from-models as cost-0 (bypasses the ceiling), and diagnostics strings interpolate model ids (log injection class).

**Overall Risk Rating: Medium**

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 0 |
| 🟡 Medium | 1 |
| 🔵 Low | 3 |
| ℹ️ Informational | 2 |

## Findings Summary Table

| ID | Severity | Title | Location (design) | Recommendation |
|----|----------|-------|-------------------|----------------|
| SEC-329-D1 | Medium | Confidence self-certification + lenient default (0.8 > threshold 0.75) → escalation gate effectively never triggers; poisoned/overconfident answers self-pass | `ConfidenceScorer.parseStructuredConfidence` + `heuristicScore` + `DEFAULT_ROUTING_POLICY.confidenceThreshold` | Do not trust answer-embedded confidence for gate decisions; require model-emitted structured metadata channel; raise default heuristic below threshold or make hedging detection the pass criterion |
| SEC-329-D2 | Low | Routing error path echoes requested model id into reason → log injection / diagnostics pollution (unbounded id from settings) | `ModelRouter.route` catch → `routeErrorDecision` | Sanitize ids (charset + length cap) before interpolation |
| SEC-329-D3 | Low | Cost ceiling bypassed when from-model unregistered (`fromCost <= 0 → allow`) | `FallbackHandler.withinCostCeiling` | Unknown from-cost → block escalation (fail-closed) or use escalationModel ceiling only |
| SEC-329-D4 | Info | `classifyTier` unknown model → 'small' (availability-friendly default) | `ModelRouter.classifyTier` | Acceptable; document |
| SEC-329-D5 | Info | `routingTimeoutMs: 100` defined in policy but unused by `ModelRouter` (dead config) | `RoutingPolicy` | Wire it or remove |

## Findings by OWASP Top 10 (2021)

- **A04 Insecure Design** — SEC-329-D1 (control effectiveness), SEC-329-D3 (guard bypass).
- **A09 Logging Failures** — SEC-329-D2 (log injection class; the router otherwise logs *query length only*, not content ✅).
- **A01/A02/A03/A05/A06/A07/A08/A10** — No issues found ✅ (no auth surface, no crypto, no command surfaces, no new dependencies, no network egress, no deserialization in this module).

## Detailed Findings

### SEC-329-D1: Self-certifying confidence oracle

Design flow: `answer` (LLM output, potentially carrying injected text from poisoned context) → `ConfidenceScorer.score(answer)` → if ≥ 0.75, no escalation. Two failure modes: (a) `parseStructuredConfidence` finds `confidence: 1.0` *inside the answer* and trusts it — a prompt-injected answer can self-certify; (b) the heuristic returns 0.8 for any answer lacking the 10 hedging phrases — above the 0.75 threshold, so even a subtly-wrong answer passes. Result: the "fallback to large model" control this ticket delivers is ~always in the allow direction; cost is saved but quality failures ship silently, and any consumer believing "escalation happened when needed" holds false assurance. Fix: decouple the signal from the graded artifact (structured metadata side-channel from the model, or grader-based confidence like SA4E-328's faithfulness score), and set defaults so that "no signal" ≠ "confident".

### SEC-329-D2 / D3 — small guards

- Sanitize model ids at the logging boundary (charset `[^a-zA-Z0-9._:-]` → `?`, cap 128) — same pattern as SEC-324-11.
- `withinCostCeiling(from, to)`: if `registry.get(from)` is undefined → `fromCost = 0` → `fromCost <= 0` → allow. A mistyped/unregistered model silently skips the cost guard. Fail-closed: if either model is unregistered, block or use a conservative ceiling.

## Positive Controls Acknowledged ✅

- Hard escalation budget: `maxEscalationsPerSession: 1` — no escalation loops/storms; counter enforced before applying (`checkEscalationBudget`).
- Cost ceiling concept (+30%) with registry-sourced costs; diagnostics trail (`RoutingDiagnostic[]` with timestamps, from/to/reason) for audit.
- `shouldEscalate` logs the decision (info) including confidence and reason — auditable.
- Router logs `query.length` (not query content) in decisions — content stays out of logs by design ✅.
- Retry policy bounded (`maxRetries: 1`).

## Remediation Priority

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| 1 | SEC-329-D1 confidence channel redesign | Medium | Restores the escalation control the ticket exists to provide |
| 2 | SEC-329-D3 fail-closed cost ceiling | Low | Closes guard bypass |
| 3 | SEC-329-D2 id sanitization | Low | Log hygiene |

## Verdict

**APPROVED-WITH-CONDITIONS** — no Critical/High. Conditions: (1) redesign the confidence source before the routing gate is relied on in production wiring (blocking for the wiring ticket — otherwise remove the gate rather than ship false assurance); (2) fail-closed cost ceiling; (3) id sanitization in logs. If only heuristics can be kept short-term, threshold must exceed the default heuristic (e.g. threshold 0.85 > default 0.8) so hedging-free-but-wrong answers still escalate.

## Scope Limitations

- Skeleton TDD; design reconstructed from TDD + FSD + implemented structure (code evidence in `SECURITY-ASSESSMENT.md`).
- Actual model invocation, retry execution, and session handoff are wiring-ticket scope; this module is pure decision logic.
