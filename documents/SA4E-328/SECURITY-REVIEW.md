# 🔒 Security Design Review (Phase 3.7) — SA4E-328: Pi Verification Loop + Hallucination Grader for Small Models

## Document Information

| Field | Value |
|-------|-------|
| Project | SDLC-Agents-4-Enterprise (VS Code extension, Epic SA4E-289) |
| Ticket | SA4E-328 — Verification loop + hallucination grading for small models |
| Scope (design) | `VerificationLoop` (post-`execute_tools` hook, tier-routed strategy: small→external grader, else self-verify; maxRetries 1; verify timeout 4s), `HallucinationGrader` (threshold 0.7, grade timeout 2s, GRADE_ERROR → score 0 fail-closed), deterministic faithfulness rubric (claim split; grounded when ≥60% significant-token overlap with cited sources), `faithfulness-metrics` golden-set evaluation, `withTimeout` primitive |
| Design docs | `documents/SA4E-328/TDD.md` v1.0 (skeleton), `FSD.md`; module layout `extension/src/pi-agent/` |
| Date | 2026-09-27 |
| Assessor | Security Agent (design review; static, no exploitation) |
| Version | 1.0 |

## Executive Summary

SA4E-328 implements a **quality-integrity control**: its outputs (`verified`, `score`) are intended to gate whether small-model answers are trusted. The design gets the fail-closed basics right — grader exceptions/timeouts/invalid output all produce `score = 0` (GRADE_ERROR), scores are clamped to [0,1], and retries are bounded. Routing small models to an *external deterministic* grader (instead of self-verification) is the correct architectural call for the known self-verification weakness of small models.

The security-relevant risks are about **the control being bypassable or fail-open**: (1) the token-overlap rubric is gameable — an attacker who controls *sources* (via poisoned MCP search results, cross-ref SA4E-325) can ground arbitrary claims by padding source excerpts with common tokens, turning the grader into a rubber stamp (false "verified" assurance); (2) `VERIFY_TIMEOUT` returns the **original, unverified answer** — downstream consumers that read `revisedAnswer` without checking `verified` get unverified content with no marker; (3) ungrounded-claim slices (80 chars of answer content) are embedded in `issues` — a latent log/content-leak path if results are ever logged verbatim. No Critical/High; all are design-scoped fixes.

**Overall Risk Rating: Medium**

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 0 |
| 🟡 Medium | 2 |
| 🔵 Low | 2 |
| ℹ️ Informational | 1 |

## Findings Summary Table

| ID | Severity | Title | Location (design) | Recommendation |
|----|----------|-------|-------------------|----------------|
| SEC-328-D1 | Medium | Token-overlap faithfulness rubric is gameable via source padding — poisoned sources ground any claim → false "verified" | Faithfulness rubric (60% token coverage) | Validate sources' provenance (workspace-contained excerpts only); raise coverage threshold; add length-normalized IDF-style weighting; document that `verified` ≠ entailment |
| SEC-328-D2 | Medium | `VERIFY_TIMEOUT` → returns original unverified answer (fail-open) with no marker on the content itself | `VerificationLoop.verify` catch path | Return `verified:false` + **append a machine-readable marker** to `revisedAnswer` (or set a separate field) so downstream cannot silently consume unverified text |
| SEC-328-D3 | Low | `issues[]` embeds 80-char answer slices — content-leak latent path into logs/diagnostics | `computeFaithfulness` | Keep slices in-memory; never log `issues` verbatim; redact if persisted |
| SEC-328-D4 | Low | `withTimeout` abandons (does not cancel) the underlying grader work — no AbortSignal plumbing | `withTimeout` primitive | Add optional `AbortController` propagation when graders support it |
| SEC-328-D5 | Info | Self-verify strategy retained for medium/large tiers — the same model grades itself (accepted design trade-off, documented) | `resolveVerifyStrategy` | Document: self-verify is advisory-only for those tiers |

## Findings by OWASP Top 10 (2021)

- **A04 Insecure Design** — SEC-328-D1 (control integrity), SEC-328-D2 (fail-open degradation).
- **A09 Logging Failures** — SEC-328-D3 (latent).
- **A08 Data Integrity** — SEC-328-D1 (metric integrity).
- **A01/A02/A03/A05/A06/A07/A10** — No issues found ✅ (no auth surface, no crypto, no command/query surfaces, no new dependencies, no network, no deserialization).

## Detailed Findings

### SEC-328-D1: Gameable grounding rubric

The rubric: a claim is *grounded* when ≥60% of its significant tokens (lowercased words, minus stopwords, len>1) appear in the union of `source.path + source.excerpt` tokens. Two gaming vectors: (a) **source poisoning** — an attacker who can plant a source entry (poisoned KB/mem_search content; a file whose *path* contains matching tokens — note `path` participates in the token set) can ground chosen claims; (b) **trivial-token inflation** — claims composed of common code vocabulary ground against almost any source. The control then reports `score ≥ 0.7 → verified`, giving downstream consumers false integrity assurance — worse than no signal if relied upon for security decisions. Mitigations (design): restrict accepted sources to workspace-contained retrievals (ties into SA4E-325 containment), weight tokens by rarity, treat path tokens separately, and explicitly document `verified` as *support-coverage*, not truth.

### SEC-328-D2: Fail-open on verify timeout

On timeout the loop returns `{ verified: false, revisedAnswer: <original>, score: 0 }`. The boolean is honest, but `revisedAnswer` is indistinguishable from a verified answer's payload. Any consumer piping `revisedAnswer` into the session/output without branching on `verified` (an easy integration mistake) silently propagates unverified content. Design fix: make the degraded state self-describing (marker string in `revisedAnswer` or a `degraded: 'verify-timeout'` field) and require consumers to handle it.

## Positive Controls Acknowledged ✅

- Fail-closed grading: exception/timeout/invalid-shape → `score = 0` (`GRADE_ERROR`), never a fabricated pass.
- Score sanitization: non-finite/out-of-range → 0; clamp [0,1], 2-dp rounding.
- Bounded retries (`maxRetries 1` default) with best-attempt retention; timeout envelope (2s grade, 4s verify) around all grader work.
- External deterministic grader for small tiers (removes self-verification bias where it matters most).
- `splitClaims`/`tokenize` are linear, lookbehind-safe regexes (no catastrophic backtracking); stopword set bounds token noise.

## Remediation Priority

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| 1 | SEC-328-D2 degraded-state marker | Low | Prevents silent unverified-content flow |
| 2 | SEC-328-D1 source provenance + weighting + docs | Medium | Restores control integrity |
| 3 | SEC-328-D3 issues redaction policy | Low | Log hygiene |
| 4 | SEC-328-D4/D5 abort plumbing + docs | Low | Robustness |

## Verdict

**APPROVED-WITH-CONDITIONS** — no Critical/High. Conditions: (1) consumers must branch on `verified` AND the degraded state must be self-describing (SEC-328-D2, blocking for the wiring ticket); (2) source-provenance validation for grounding inputs (cross-ref SA4E-325 containment) before `verified` is surfaced to users; (3) document the rubric's semantics ("coverage", not "truth") in TDD/FSD.

## Scope Limitations

- Skeleton TDD; design reconstructed from TDD + FSD + implemented structure (code evidence in `SECURITY-ASSESSMENT.md`).
- The regenerative `regenerate` callback (LLM-backed) is a wiring-time dependency — its prompt handling is out of scope here.
