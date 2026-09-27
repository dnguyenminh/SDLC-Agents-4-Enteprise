# 🔒 Security Design Review (Phase 3.7) — SA4E-327: Pi Task Decomposition + Map-Reduce for Large Repo Queries

## Document Information

| Field | Value |
|-------|-------|
| Project | SDLC-Agents-4-Enterprise (VS Code extension, Epic SA4E-289) |
| Ticket | SA4E-327 — Task decomposition + Map-Reduce processing for large repo queries |
| Scope (design) | `TaskDecomposer` (file batching: 20 files/batch, 4000 tokens/batch cap), `MapReduceOrchestrator` (parallel map with pLimit(5), 30s batch timeout, 1 retry, CircuitBreaker threshold 3 / cooldown 60s), `LargeQueryProcessor` (GLOBAL/STRUCTURAL intents, minFiles gate, 200-file cap, 6000-token result budget), `SubAgentClient` contract (`summarizeBatch`/`synthesize`) |
| Design docs | `documents/SA4E-327/TDD.md` v1.0 (skeleton), `FSD.md`; module layout `extension/src/pi-agent/map-reduce/`, `task-decomposer.ts` |
| Date | 2026-09-27 |
| Assessor | Security Agent (design review; static, no exploitation) |
| Version | 1.0 |

## Executive Summary

The Map-Reduce design is resource-disciplined by construction: bounded batches (≤200 files scanned, 20/batch), bounded concurrency (5), bounded retries (1) with backoff, 30s per-batch timeout, a 6000-token result budget, and a circuit breaker to stop cascading sub-agent failures. This review found **no Critical or High issues**. The residual risks are (1) the circuit breaker's protection scope — a per-orchestrator instance resets failure state every query, so the "breaker" only protects within a single run and can be trivially bypassed by re-instantiation ("circuit-breaker bypass" threat); (2) unconditional trust of `SubAgentClient` outputs (`summary`, `tokens`, `confidence`) which flow into session context with no schema/size validation at the boundary; (3) `map-reduce://` pseudo-paths placed into `contextFiles[].path` — a contract mismatch with any consumer that treats paths as readable files.

**Overall Risk Rating: Medium-Low**

| Severity | Count |
|----------|-------|
| 🔴 Critical | 0 |
| 🟠 High | 0 |
| 🟡 Medium | 2 |
| 🔵 Low | 1 |
| ℹ️ Informational | 2 |

## Findings Summary Table

| ID | Severity | Title | Location (design) | Recommendation |
|----|----------|-------|-------------------|----------------|
| SEC-327-D1 | Medium | Circuit breaker is per-orchestrator-instance → failure state resets each query; cross-query DoS protection is void | `MapReduceOrchestrator` constructor default `new CircuitBreaker(...)` | Share one breaker per workspace/session (singleton via DI); document the scope |
| SEC-327-D2 | Medium | `SubAgentClient` outputs (`summary`/`tokens`/`confidence`) trusted without validation — oversized/NaN/typed-field confusion flows into context & metrics | `SubAgentClient` contract; `PartialSummary` | Validate at boundary: type checks, summary length cap, finite confidence clamp [0,1] |
| SEC-327-D3 | Low | `map-reduce://batch-N` pseudo-URIs placed in `contextFiles[].path` — consumers treating paths as files will error or (if a handler is added) become a new sink | `LargeQueryProcessor.buildContextFiles` | Use a `virtual:` scheme + explicit tier marker; ensure session-side consumers skip virtual paths |
| SEC-327-D4 | Info | `subQuery` embeds raw user query into each batch prompt — inherited prompt-injection surface (query is the user's own) | `TaskDecomposer.splitIntoBatches` | Acceptable; document that batch prompts must never be executed as instructions |
| SEC-327-D5 | Info | Scanner feeding map-reduce inherits SA4E-325's uncontained-rootDir issue | `LargeQueryProcessor.process` → `FileScanner` | Enforce workspace-root containment (cross-ref SEC-325-01/D7) |

## Findings by OWASP Top 10 (2021)

- **A04 Insecure Design** — SEC-327-D1 (protection-mechanism scope), SEC-327-D2 (unvalidated trust boundary).
- **A08 Data Integrity** — SEC-327-D2, SEC-327-D3.
- **A03 Injection** — SEC-327-D4 (inherited, informational).
- **A01/A02/A05/A06/A07/A09/A10** — No issues found ✅ (no auth surface, no crypto, no new deps, no network beyond inherited MCP search, no secrets in design).

## Detailed Findings

### SEC-327-D1: Circuit breaker lifetime vs. bypass by re-instantiation

The design places the breaker inside the orchestrator with a default constructor. If a new `MapReduceOrchestrator` is created per retrieval (the natural wiring given `ContextRetrieverDeps.largeQueryProcessor`), the breaker starts `closed` for every query — consecutive failures across queries never accumulate, so a persistent sub-agent outage produces full-cost retries on *every* query (cost/DoS amplification the breaker was meant to stop). Fix at design level: breaker owned by `LargeQueryProcessor` (or session scope) and injected into the orchestrator; the DI seam (`deps.breaker?`) already exists in the code — make its use mandatory.

### SEC-327-D2: Unvalidated sub-agent responses

`SubAgentResponse { summary: string; tokens: number; confidence: number }` is produced by the LLM-backed sub-agent and consumed as-is: `summary` joins the reduce prompt and session context; `confidence` feeds metrics. A misbehaving/subverted sub-agent (e.g., via poisoned retrieval content, cross-ref SA4E-325-01) can return a 10 MB "summary" (memory/latency) or `NaN` confidence (metric corruption). Boundary validation (types, length ≤ subAgentTokenCap×4 chars, `Number.isFinite` + clamp) closes this without trusting the producer.

## Positive Controls Acknowledged ✅

- Bounded everything: `batchSize 20`, `parallelism 5`, `retriesPerBatch 1` + 200ms backoff, `batchTimeoutMs 30_000`, `maxFiles 200`, `subAgentTokenCap 4000`, result `tokenBudget 6000` (`DEFAULT_MAP_REDUCE_CONFIG`).
- `pLimit` guards concurrent map execution (prevents worker flood); breaker skip prevents batch cascade within a run.
- `TaskDecomposer` validates `batchSize` (integer ≥ 1) and non-array `files` (fail-safe single batch); path dedupe normalizes separators/case.
- Reduce failure degrades to concatenation of partials — bounded by the 200-file/20-per-batch math (≤10 partials × 4000 tokens).

## Remediation Priority

| Priority | Finding | Effort | Impact |
|----------|---------|--------|--------|
| 1 | SEC-327-D1 shared breaker | Low | Restores cross-query DoS/cost protection |
| 2 | SEC-327-D2 boundary validation | Low | Blocks oversized/invalid sub-agent output |
| 3 | SEC-327-D3 virtual-path contract | Low | Prevents future sink misuse |

## Verdict

**APPROVED-WITH-CONDITIONS** — no Critical/High. Conditions: (1) hoist the circuit breaker to processor/session scope before production wiring (blocking for epic wiring); (2) add `SubAgentResponse` boundary validation; (3) tag `map-reduce://` paths as virtual in the `ContextFile` contract and confirm the Pi-session consumer skips them.

## Scope Limitations

- Skeleton TDD; design reconstructed from TDD + FSD + implemented structure (code evidence in `SECURITY-ASSESSMENT.md`).
- The real `SubAgentClient` implementation (LLM-backed summarize/synthesize) is not yet wired in this ticket — its own prompt/output handling will need review at the wiring ticket.
