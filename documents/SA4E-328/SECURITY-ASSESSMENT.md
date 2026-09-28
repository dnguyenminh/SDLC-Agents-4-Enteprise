# 🔒 Security Assessment (Phase 5.7 — Code Review) — SA4E-328: Pi Verification Loop + Hallucination Grader

## Document Information

| Field | Value |
|-------|-------|
| Project | SDLC-Agents-4-Enterprise (VS Code extension, Epic SA4E-289) |
| Ticket | SA4E-328 |
| Phase | 5.7 — Post-implementation security assessment |
| Scope (code) | `extension/src/pi-agent/faithfulness.ts`, `hallucination-grader.ts`, `verification-loop.ts`, `faithfulness-metrics.ts`, `async-timeout.ts`; tests `__tests__/{faithfulness,hallucination-grader,verification-loop,verification-loop.integration,faithfulness-metrics}.test.ts` |
| Design baseline | `documents/SA4E-328/TDD.md` v1.0; Phase 3.7 verdict: **APPROVED-WITH-CONDITIONS** (`SECURITY-REVIEW.md`) |
| Date | 2026-09-27 |
| Assessor | Security Agent (static code review, no exploitation) |
| Version | 1.0 |

## Executive Summary

Code confirms the reviewed design exactly, including both fail-closed properties (GRADE_ERROR → score 0; invalid grader output → 0 with clamp to [0,1]) and both weaknesses: the token-overlap rubric participates `source.path` in the grounding token set and accepts any source content (`faithfulness.ts:36-39`) — gameable via poisoned sources (SEC-328-01) — and the verify-timeout path returns the original answer with only the `verified:false` boolean to distinguish it (`verification-loop.ts:66-71`, SEC-328-02). One new code finding (Low): the retry loop's `regenerate` callback is invoked with the *current best* answer but its return is graded against the same untrusted sources with no output cap — a hostile `regenerate` could return unbounded text (bounded only downstream by the consumer). ReDoS review of all regexes: **clean** — lookbehind claim-split and simple token match are linear; no quadratic constructs found in this module.

**Overall Risk Rating: Medium** (control-integrity findings; no exploitable code-execution/data-theft path within the module itself).

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 0 |
| 🟡 Medium | 2 (confirmed from design) |
| 🔵 Low | 2 (1 confirmed + 1 new) |
| ℹ️ Informational | 2 |

## Findings Table (code-verified)

| ID | Severity | Title | File:Line | Status |
|----|----------|-------|-----------|--------|
| SEC-328-01 | Medium | Grounding rubric gameable — `source.path` participates in token set; any content accepted as source; 60% common-token coverage → false "verified" | `faithfulness.ts:36-46` (`sourceTokenSet` joins `${s.path} ${s.excerpt ?? ''}`), `:12` (`GROUNDING_MIN_TOKEN_COVERAGE = 0.6`) | Open — condition for wiring |
| SEC-328-02 | Medium | `VERIFY_TIMEOUT` returns original unverified answer; degraded state not self-describing in payload | `verification-loop.ts:66-71,74-77` | Open — blocking for wiring |
| SEC-328-03 | Low | `issues[]` carry 80-char answer slices — latent content leak if persisted/logged | `faithfulness.ts:62-65` | Open (policy: never log `issues`) |
| SEC-328-04 (new) | Low | `regenerate` callback output unbounded/unvalidated before grading | `verification-loop.ts:79-89` | Open |
| SEC-328-05 | Info | `withTimeout` abandons (does not cancel) underlying work — no AbortSignal | `async-timeout.ts:1-15` | Accepted (hardening) |
| SEC-328-06 | Info | Self-verify retained for medium/large tiers (documented trade-off) | `verification-loop.ts:38-40` | Accepted |

## Detailed Findings (evidence)

### SEC-328-01 — confirmed

```typescript
// faithfulness.ts:36-39 — path + excerpt tokens both count toward grounding
function sourceTokenSet(sources: SourceCitation[]): Set<string> {
  const text = sources.map((s) => `${s.path} ${s.excerpt ?? ''}`).join(' ');
  return new Set(tokenize(text));
}
// :41-46 — 60% overlap of significant tokens = "grounded"
const covered = tokens.filter((t) => sourceTokens.has(t)).length;
return covered / tokens.length >= GROUNDING_MIN_TOKEN_COVERAGE;
```
`SourceCitation` has no provenance validation anywhere in the module; `sources` arrive from the caller (wiring will feed retrieval results — the SA4E-325 attack surface). A planted source whose excerpt contains a claim's ordinary vocabulary marks it grounded; `HallucinationGrader.grade` then returns ≥0.7 and `verified:true`. Also note: a *file path* like `/repo/aws-credentials-guide.ts` contributes its tokens — path names alone can ground claims.

**Remediation (local + cross-module):**
```typescript
// 1) Exclude path tokens from grounding (excerpt-only), 2) weight rare tokens,
// 3) validate provenance at wiring time (contained paths only — see SEC-325-01).
function sourceTokenSet(sources: SourceCitation[]): Set<string> {
  return new Set(tokenize(sources.map((s) => s.excerpt ?? '').join(' '))); // drop path
}
```

### SEC-328-02 — confirmed

```typescript
// verification-loop.ts:66-71
} catch (err) {
  logger.warn('VERIFY_TIMEOUT → return original', { message });
  return { verified: false, revisedAnswer: answer, score: 0, attempts: 0, strategy };
}
```
Payload is indistinguishable from a verified answer apart from the boolean. **Remediation:** make degradation self-describing so a naive consumer cannot silently pass it through:
```typescript
return { verified: false, revisedAnswer: answer, degraded: 'verify-timeout' as const, score: 0, attempts: 0, strategy };
// consumers: if (result.degraded) { /* mark output, skip auto-accept */ }
```

### SEC-328-04 — new

`retryUntilPassOrExhaust` (`:83-88`) calls `this.deps.regenerate(current.answer)` with no length/type check on the returned value before `this.grade(...)` — `grade` → `computeFaithfulness` → `splitClaims` would still work on any string, but an oversized return floods memory/metrics. Cap at the boundary:
```typescript
const next = await this.deps.regenerate(current.answer);
if (typeof next !== 'string' || next.length > 200_000) break; // guard
```

### SEC-328-03 / 05 / 06

`issues.push(\`Ungrounded claim: ${claim.slice(0, 80)}\`)` — answer fragments in result objects; today nothing in this module logs them ✅ (only `message` is logged, `hallucination-grader.ts:36-38`, `verification-loop.ts:68-69`) — keep it that way and document. `withTimeout` correctly avoids unhandled rejections (both branches clear the timer and settle exactly once ✅) but cannot cancel the abandoned grader work — acceptable at 2s/4s caps. Self-verify for non-small tiers is the documented design decision (advisory only).

## Positive Controls Verified in Code ✅

- **Fail-closed grading chain:** grader throw → `score 0` + `GRADE_ERROR` issue (`hallucination-grader.ts:35-39`); invalid shape/non-finite/out-of-range score → 0 (`:42-49`); clamp `Math.min(1, Math.max(0, …))` — a compromised grader function cannot produce a passing score by shape abuse.
- Bounded retry: `maxRetries 1` default; loop condition requires `best.score < threshold && attempts <= max && regenerate` (`verification-loop.ts:83`) — no infinite regeneration.
- Timeout envelopes: 2s grade, 4s verify (`hallucination-grader.ts:6`, `verification-loop.ts:22`); both settle exactly once (no double-settlement races in `async-timeout.ts`).
- **ReDoS review:** `splitClaims` uses `/(?<=[.!?])\s+/` (fixed lookbehind, linear); `tokenize` `/[a-z0-9]+/g` (linear); no nested quantifiers, no dot-all — the compression/faithfulness regex surfaces are clean in this module ✅.
- `evaluateGoldenSet` sequential + bounded by caller dataset; `buildReport` divides only after `total === 0` check (`faithfulness-metrics.ts:35-44`).
- No `eval`/dynamic `require`/`JSON.parse`/secret handling in module ✅.

## Risk Rating

**Medium** — both Mediums are integrity-of-control issues that become user-facing when the wiring ticket surfaces `verified`/`revisedAnswer`. Fix before that wiring (conditions below), otherwise Low.

## Verdict

**APPROVED-WITH-CONDITIONS** — conditions:

1. **(Blocking for wiring)** SEC-328-02: add degraded-state field/marker; wiring consumers must branch on `verified`/`degraded`.
2. (Same PR) SEC-328-01: drop `path` tokens from grounding; require source provenance (workspace-contained) when wiring supplies `sources`; document rubric = coverage, not truth.
3. (Same PR) SEC-328-04 regenerate output guard; SEC-328-03 no-logging policy for `issues` documented.

## Appendix — Methodology & Limitations

- Full reads of 5 source files + 5 test files; regex-by-regex ReDoS analysis; grep for `eval|require(|JSON.parse` (none). Static only — grader behavior against real LLM outputs not dynamically tested.
- Tests cover grader fail-closed cases well (`hallucination-grader.test.ts` asserts GRADE_ERROR → 0 ✅) but **no adversarial tests** exist for source-padding (SEC-328-01) or degraded-payload consumption — recommend adding both.
- The real `regenerate` implementation and `sources` provisioning are wiring-ticket scope — re-review then.
