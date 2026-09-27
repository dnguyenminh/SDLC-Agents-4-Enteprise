# 🔒 Security Assessment (Phase 5.7 — Code Review) — SA4E-327: Pi Task Decomposition + Map-Reduce

## Document Information

| Field | Value |
|-------|-------|
| Project | SDLC-Agents-4-Enterprise (VS Code extension, Epic SA4E-289) |
| Ticket | SA4E-327 |
| Phase | 5.7 — Post-implementation security assessment |
| Scope (code) | `extension/src/pi-agent/task-decomposer.ts`; `map-reduce/` — `p-limit.ts`, `circuit-breaker.ts`, `map-reduce-orchestrator.ts`, `large-query-processor.ts`, `types.ts`; tests `map-reduce/__tests__/*`, `task-decomposer` in `map-reduce/__tests__/task-decomposer.test.ts` |
| Design baseline | `documents/SA4E-327/TDD.md` v1.0; Phase 3.7 verdict: **APPROVED-WITH-CONDITIONS** (`SECURITY-REVIEW.md`) |
| Date | 2026-09-27 |
| Assessor | Security Agent (static code review, no exploitation) |
| Version | 1.0 |

## Executive Summary

The implementation is faithful to the resource-bounded design and **no Critical/High findings exist**. All 3 substantive design findings are confirmed in code with exact lines: the breaker is instance-scoped and defaulted inside the orchestrator (`map-reduce-orchestrator.ts:36`), `SubAgentResponse` fields are trusted verbatim (`map-reduce-orchestrator.ts:88-97`), and `map-reduce://batch-N` virtual paths are emitted into `ContextFile.path` (`large-query-processor.ts:72`). Two new informational code findings: `pLimit` has a benign queue-jumping window (fairness, not security) and `CircuitBreaker.recordSuccess` in `half-open` closes on the *first* success without probation (standard-but-loose). DoS posture is otherwise strong: every loop in the module is bounded by config constants, and the reduce-fallback concatenation is mathematically capped (≤10 partials).

**Overall Risk Rating: Low-Medium**

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 0 |
| 🟡 Medium | 2 (confirmed from design) |
| 🔵 Low | 1 (confirmed) |
| ℹ️ Informational | 4 (2 design + 2 new) |

## Findings Table (code-verified)

| ID | Severity | Title | File:Line | Status |
|----|----------|-------|-----------|--------|
| SEC-327-01 | Medium | Circuit breaker per-instance default → resets per query; cross-query cost/DoS protection void ("breaker bypass by re-instantiation") | `map-reduce-orchestrator.ts:34-37` (`deps.breaker ?? new CircuitBreaker(...)`); wiring: `LargeQueryProcessor`/`ContextRetriever` constructed per use | Open — blocking for wiring |
| SEC-327-02 | Medium | Sub-agent outputs trusted unvalidated (`summary` unbounded, `tokens`/`confidence` untyped-checked) → context/metric poisoning by subverted sub-agent | `map-reduce-orchestrator.ts:81-103,105-115` | Open |
| SEC-327-03 | Low | `map-reduce://batch-N` virtual paths in `ContextFile.path` — contract trap for any file-reading consumer | `large-query-processor.ts:64-79` | Open |
| SEC-327-04 | Info | `subQuery` embeds raw query text per batch (inherited injection surface; user-owned input) | `task-decomposer.ts:33-46` | Accepted (document) |
| SEC-327-05 | Info | Map-reduce inherits uncontained scan root from SA4E-325 (`scanner.listSourceFiles(deps.rootDir)`) | `large-query-processor.ts:34-36` | Track with SEC-325-01/07 |
| SEC-327-06 (new) | Info | `pLimit` queue-fairness window: a new call admitted while `active < concurrency` can jump queued waiters (no starvation risk at parallelism 5) | `map-reduce/p-limit.ts:14-27` | Accepted |
| SEC-327-07 (new) | Info | Breaker `recordSuccess` closes `half-open` on first success (no probation window) — flapping upstream can flap the breaker | `map-reduce/circuit-breaker.ts:27-30` | Hardening |

## Detailed Findings (evidence)

### SEC-327-01 — confirmed

```typescript
// map-reduce-orchestrator.ts:34-37
constructor(private readonly deps: MapReduceOrchestratorDeps) {
  this.config = { ...DEFAULT_MAP_REDUCE_CONFIG, ...deps.config };
  this.breaker = deps.breaker ?? new CircuitBreaker({ threshold: 3, cooldownMs: 60_000 });
}
```
Nothing in `LargeQueryProcessor` (`large-query-processor.ts:12-18`) or `ContextRetrieverDeps` supplies a shared breaker; each construction resets `state='closed', failures=0`. Consequence: a dead sub-agent still receives full batch fan-out (200 files → 10 batches × 2 attempts × 30s timeout) **on every query**, the exact cascade the breaker was designed to stop.
**Remediation:** own the breaker at processor/session scope:
```typescript
// large-query-processor.ts
export class LargeQueryProcessor {
  private readonly breaker = new CircuitBreaker({ threshold: 3, cooldownMs: 60_000 }); // shared per processor
  // … pass into orchestrator deps at construction:
  //   new MapReduceOrchestrator({ subAgent, decomposer, breaker: this.breaker, config })
}
```
Keep processor instances per-workspace (not per-call) in the eventual wiring.

### SEC-327-02 — confirmed

```typescript
// map-reduce-orchestrator.ts:88-97 — response fields used verbatim
this.breaker.recordSuccess();
return { batchId: batch.id, partial: { batchId: batch.id, summary: response.summary,
  tokens: response.tokens, confidence: response.confidence } };
```
No type/length/finite checks anywhere on `SubAgentResponse` (`types.ts:8-12`); `reduce` concatenates summaries on synthesize failure (`:113`). **Remediation:** validate at the boundary:
```typescript
private sanitizePartial(batchId: string, r: SubAgentResponse): PartialSummary {
  const summary = typeof r?.summary === 'string' ? r.summary.slice(0, this.config.subAgentTokenCap * 4) : '';
  const tokens = Number.isFinite(r?.tokens) && (r.tokens as number) >= 0 ? Math.floor(r.tokens) : 0;
  const confidence = Number.isFinite(r?.confidence) ? Math.min(1, Math.max(0, r.confidence)) : 0;
  return { batchId, summary, tokens, confidence };
}
```

### SEC-327-03 — confirmed

`large-query-processor.ts:72` emits `path: \`map-reduce://${partial.batchId}\``. `batchId` is internally generated (`batch-${n}`), so no injection today ✅ — the risk is contract: `session-factory.ts:36` forwards `contextFiles.map(f => f.path)` to `sdk.createAgentSession`; any consumer that resolves/reads these strings will misbehave. **Remediation:** keep the scheme but assert in session wiring: `if (f.path.startsWith('map-reduce://')) skip file-read` (or add `virtual: true` to `ContextFile`).

### SEC-327-06 / 07 — informational

`p-limit.ts:15-18`: between `active -= 1` + `queue.shift()?.()` (finally block) and the queued promise resuming on the microtask queue, a fresh `limit()` call seeing `active < concurrency` runs immediately — queue-jumping under contention. Harmless at parallelism 5 with ≤10 batches. `circuit-breaker.ts:27-30`: `recordSuccess` resets `failures=0` and closes even from `half-open` with a single success — consider requiring N successes in half-open before closing (standard hardening).

## Positive Controls Verified in Code ✅

- All bounds implemented as designed: `DEFAULT_MAP_REDUCE_CONFIG` (`types.ts:36-44`) — batchSize 20, parallelism 5, timeout 30s, retries 1, backoff 200ms, maxFiles 200, token cap 4000.
- `pLimit` throws `RangeError` on invalid concurrency (`p-limit.ts:8-10`); `active`/`pending` correctly tracked; `finally` guarantees slot release (no leak on throw).
- Breaker math correct: threshold ≥, cooldown monotonic via `Date.now()`, `open()` resets failure count (no double-open), `canProceed` half-open transition only after cooldown (`circuit-breaker.ts:19-43`).
- `withTimeout` wraps every `summarizeBatch` call (`map-reduce-orchestrator.ts:83-87`) — no unbounded awaits; `mapBatch` caps attempts at `retriesPerBatch + 1` (`:71-78`).
- `TaskDecomposer.decompose` fail-safe: invalid batchSize → single batch; non-array files → single batch; dedupe normalizes `\` and case (`task-decomposer.ts:16-31,53-62`) — no path mutation, only dedup keys.
- `LargeQueryProcessor` gates: intent allow-list `['GLOBAL','STRUCTURAL']` (`:33`), `minFiles` threshold (`:37`), result budget slicing (`buildContextFiles`, `:64-79`) — total tokens bounded.
- No `eval`/dynamic `require`/`JSON.parse` of untrusted data in module; no user-controlled string reaches `exec`/`spawn` (module is pure orchestration) ✅.

## Risk Rating

**Low-Medium** — module is bounded and defensive; the two Mediums are wiring-scoped and must be closed at the production-wiring ticket (shared breaker; response validation).

## Verdict

**APPROVED-WITH-CONDITIONS** — code acceptable as shipped (test-only instantiation). Conditions:

1. **(Blocking for wiring)** SEC-327-01: hoist/shared breaker instance at processor/session scope.
2. (Same PR) SEC-327-02 boundary validation of `SubAgentResponse`.
3. (Wiring PR) SEC-327-03: virtual-path contract assertion in session consumption.
4. (Optional) SEC-327-07 half-open probation.

## Appendix — Methodology & Limitations

- Full reads of 6 source files + 5 test files; grep verification for breaker wiring (`deps.breaker`), `require(`/`eval` (none). No runtime testing.
- Tests cover breaker state machine, p-limit concurrency, decomposer edge cases, orchestrator timeouts/skips — **no security test cases** (recommend: assert breaker shared across two `process()` calls; assert 10 MB summary truncated at boundary).
- The concrete `SubAgentClient` (LLM-backed) implementation is outside this ticket — its review belongs to the wiring ticket.
