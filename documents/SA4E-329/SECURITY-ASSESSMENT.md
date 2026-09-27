# 🔒 Security Assessment (Phase 5.7 — Code Review) — SA4E-329: Pi Model Routing and Fallback

## Document Information

| Field | Value |
|-------|-------|
| Project | SDLC-Agents-4-Enterprise (VS Code extension, Epic SA4E-289) |
| Ticket | SA4E-329 |
| Phase | 5.7 — Post-implementation security assessment |
| Scope (code) | `extension/src/pi-agent/model-router.ts`, `confidence-scorer.ts`, `fallback-handler.ts`, `routing-policy.ts`; tests `__tests__/{model-router,confidence-scorer,fallback-handler}.test.ts` |
| Design baseline | `documents/SA4E-329/TDD.md` v1.0; Phase 3.7 verdict: **APPROVED-WITH-CONDITIONS** (`SECURITY-REVIEW.md`) |
| Date | 2026-09-27 |
| Assessor | Security Agent (static code review, no exploitation) |
| Version | 1.0 |

## Executive Summary

Code confirms the design findings precisely, including the inert-gate math: `ConfidenceScorer.heuristicScore` returns **0.8 by default** against `confidenceThreshold: 0.75` (`routing-policy.ts:14`), and `parseStructuredConfidence` trusts a `confidence: N` pattern embedded in the answer itself (`confidence-scorer.ts:35-41`) — so the escalation path fires only when an answer literally contains one of 10 hedging phrases. A prompt-injected answer containing `confidence: 1.0` self-certifies at 1.0. The budget/ceiling machinery itself is correctly coded (escalation count enforced; diagnostics appended; `ThinkingLevelMapper` re-used for target `maxTokens`), with two confirmed guard gaps: cost ceiling allows escalation when the from-model is unregistered (`fallback-handler.ts:101-103`), and error/model ids are interpolated unsanitized into reasons that are logged and persisted in diagnostics (`model-router.ts:80-87`, log-injection class shared with SEC-324-11). One new Info: `escalate()`'s catch keeps the original session silently on ANY internal error — correct availability behavior, but the ESCALATE_FAIL diagnostic embeds raw `err.message`.

No Critical/High. Module contains no network calls, no file I/O, no crypto, no deserialization — pure decision logic ✅.

**Overall Risk Rating: Medium** (control-integrity), **Low** for direct exploitability.

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 0 |
| 🟡 Medium | 1 (confirmed from design) |
| 🔵 Low | 3 (2 confirmed + 1 new) |
| ℹ️ Informational | 2 |

## Findings Table (code-verified)

| ID | Severity | Title | File:Line | Status |
|----|----------|-------|-----------|--------|
| SEC-329-01 | Medium | Confidence self-certification + default 0.8 > threshold 0.75 → escalation gate near-inert; injected `confidence: 1.0` self-passes | `confidence-scorer.ts:24-28,34-41,43-52`; `routing-policy.ts:14`; consumed at `model-router.ts:48-61` | Open — blocking for wiring |
| SEC-329-02 | Low | Cost-ceiling bypass when from-model unregistered (`fromCost <= 0 → allow`) | `fallback-handler.ts:98-105` | Open |
| SEC-329-03 | Low | Model ids echoed unsanitized into reasons/logs (log-injection class; unbounded id) | `model-router.ts:69,75,84`; `fallback-handler.ts:47` | Open |
| SEC-329-04 (new) | Low | `escalate()` catch-all embeds raw `err.message` into diagnostics + logs | `fallback-handler.ts:38-50` | Open |
| SEC-329-05 | Info | `routingTimeoutMs: 100` unused (dead policy field) | `routing-policy.ts:17` | Open |
| SEC-329-06 | Info | Unknown model in `classifyTier`/`route` → 'small' + keep-requested (availability default) | `model-router.ts:80-87,93-99` | Accepted (document) |

## Detailed Findings (evidence)

### SEC-329-01 — confirmed

```typescript
// confidence-scorer.ts:35-37 — the graded answer declares its own score
const match = answer.match(/confidence"?\s*[:=]\s*([01](?:\.\d+)?)/i);
// :43-52 — default pass mark for any non-hedging answer
if (HEDGING_PATTERNS.some((p) => text.includes(p))) return 0.3;
if (CONFIDENT_MARKERS.some((p) => text.includes(p))) return 0.9;
return 0.8;   // ← vs routing-policy.ts:14 confidenceThreshold: 0.75 → pass
```
Exploit sketch (realistic once retrieval is wired): poisoned retrieval content (SA4E-325 chain) leaks `confidence: 1.0` into a small model's answer; `shouldEscalate` sees 1.0 ≥ 0.75 → never escalates → the low-quality/injected answer ships as final. Even without injection, 0.8 default > 0.75 threshold means the gate only catches explicit hedges.
**Remediation:**
```typescript
// 1) Gate decisions must NOT read answer-embedded confidence:
score(answer: string, meta?: { declaredConfidence?: number }): number {
  if (meta?.declaredConfidence !== undefined) return clamp01(meta.declaredConfidence); // trusted channel only
  // 2) make "no signal" fail toward escalation:
  return ConfidenceScorer.heuristicScore(answer); // and set policy threshold 0.85 > 0.8 default
}
// 3) longer term: use faithfulness score (SA4E-328) as the escalation signal.
```

### SEC-329-02 — confirmed

```typescript
// fallback-handler.ts:99-103
const fromCost = this.registry.get(from)?.costPer1k ?? 0;
const toCost = this.registry.get(to)?.costPer1k ?? 0;
if (fromCost <= 0) return true;   // unregistered from-model → ceiling skipped
```
**Remediation:** `if (!this.registry.get(from)) return false;` — fail-closed when costs are unknown (or compute ceiling from `to` model alone vs session budget).

### SEC-329-03 / 04 — confirmed / new

`MODEL_NOT_FOUND: '${requested}'` and `ROUTE_ERROR: kept original '${requested}' (${err.message})` interpolate the raw requested id; `ESCALATE_FAIL: ${(err).message}` likewise. Ids come from settings/session config — sanitize before interpolation:
```typescript
function sanitizeId(raw: string): string {
  return String(raw ?? '').slice(0, 128).replace(/[^a-zA-Z0-9._:-]/g, '?') || 'unknown';
}
```
Use in `routeErrorDecision`, `buildRouteDecision` reason strings, and `FallbackHandler.diagnostic`.

### SEC-329-05 / 06 — informational

`routingTimeoutMs` is never referenced by `ModelRouter` (grep-verified) — wire it around `shouldEscalate`/route or delete to avoid config drift. Unknown-model → 'small' default is intentional availability behavior; documented here.

## Positive Controls Verified in Code ✅

- Escalation budget enforced **before** applying (`fallback-handler.ts:56-57`), counter incremented exactly on apply (`:90`); diagnostics appended on both block and apply — complete audit trail (`:64-68,91-94`).
- `applyEscalation` re-derives `maxTokens` via the registry-backed `ThinkingLevelMapper` — no trust of caller-provided token counts (`:72-73`).
- Router failure path is keep-original (never route to an arbitrary model on error) ✅; decision logs include reason + model but **not** query content — only `query.length` (`model-router.ts:75`).
- `classifyTier` pure registry math (≤16384 → small); no network/IO in module; `Score` sanitization absent but threshold comparisons are numeric-only (no string coercion into decisions).
- `keywordCoverage`-style numeric guards correct; `compareWithBaseline` divides only when `baseline.taskSuccess > 0` (adjacent eval module).

## Risk Rating

**Medium** as a control-integrity issue (the ticket's core guarantee is currently unenforceable); **Low** direct exploitability (no data paths, local logic only).

## Verdict

**APPROVED-WITH-CONDITIONS** — conditions:

1. **(Blocking for wiring)** SEC-329-01: remove answer-embedded confidence from gate decisions and re-base thresholds (default heuristic must score *below* the escalation threshold); preferred long-term: use SA4E-328's faithfulness score as the escalation signal.
2. (Same PR) SEC-329-02 fail-closed cost ceiling; SEC-329-03/04 id/message sanitization.
3. (Follow-up) SEC-329-05 dead-config cleanup.

## Appendix — Methodology & Limitations

- Full reads of 4 source files + 3 test files; greps: `routingTimeoutMs` usage, `confidence` pattern, registry lookups. Static only.
- Tests assert routing/escalation behavior but encode the current (weak) confidence semantics as expected behavior — recommend adding adversarial tests: answer containing `confidence: 1.0` must NOT block escalation once remediated; unregistered from-model must block escalation.
- Real model call/retry mechanics are outside this module (wiring ticket).
