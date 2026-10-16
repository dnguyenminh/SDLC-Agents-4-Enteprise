# 🔒 Security Assessment — Phase 5.7 (Code Review)

| Field | Value |
|-------|-------|
| Ticket | SA4E-362 — [Pega Ingest] Refresh-on-401 cho ingest path |
| Review type | Post-implementation security code review (static) |
| Inputs | SECURITY-REVIEW.md v1.0 (APPROVED-WITH-CONDITIONS), IMPLEMENTATION-NOTES.md, uncommitted diff of 13 production files + 6 test files (51 tests) |
| Date / Assessor | 2026-10-16 — Security Agent |
| Verdict | **APPROVED-WITH-CONDITIONS** (1 Low condition; 12/12 checkpoints otherwise verified) |

## 1. Phase-5.7 Checkpoints (12) — Verification Matrix

| # | Checkpoint | Result | Evidence (file:line) |
|---|-----------|--------|----------------------|
| 1 | Grep log leak: 0 token/Authorization/refresh_token in log/throw strings | ✅ PASS | grep 11 changed files → 0 matches; retry logs contain only endpoint + action (backend-auth-headers.ts:66,72; BackendHttpPoster.ts:61,64); UT-05 asserts logs exclude token values (PegaStreamIngester.auth-retry.test.ts:152-154) |
| 2 | Retry rebuilds headers+body; makeBody() new stream per attempt; duplex:'half' both sends | ✅ PASS | PegaStreamIngester.ts:144-159 (factory), :161-173 (per-attempt headers+body); UT-04 asserts 2 distinct ReadableStream instances + duplex both (test:118-124) |
| 3 | Exactly-once: retry still 401 → NO 2nd refresh; refresh ≤1/request (fetch ≤2) | ✅ PASS | withAuthRetry single send(fresh), no loop (backend-auth-headers.ts:69-73); UT-14 (test:182-192); PBT-01 fc.asyncProperty 100 runs, invariants fetch≤2 / refresh≤1 / refresh-only-on-401 (test:213-260) |
| 4 | instanceof IngestAuthError BEFORE generic catch in ingestAndDiscover | ✅ PASS | PegaBfsIndexer.ts:284 (instanceof first; generic handling at :301-306 only after) |
| 5 | pollUntilComplete rebuilds headers per iteration + X-Project-Id | ✅ PASS | PegaStreamIngester.ts:202-206 (authHeaders(projectId) inside send closure, fresh token per attempt) |
| 6 | BackendHttpPoster runtime discrimination; legacy () => string NO refresh; retry rebuilds ONLY Authorization; 3 legacy tests untouched | ✅ PASS | BackendHttpPoster.ts:29-40 (typeof checks), :65 (Authorization-only rebuild); git diff = +41/-0 → legacy 3 tests intact; UT-10a/b/c added |
| 7 | SchemaIndexer sends buildBackendAuthHeaders (Bearer + X-Project-Id, BR-5); anonymous mode unbroken | ✅ PASS | PegaSchemaIndexer.ts diff: baseHeaders = buildBackendAuthHeaders() + per-attempt Bearer override; UT-13 asserts Authorization present on call #1 AND fresh on call #2 (PegaSchemaIndexer.auth.test.ts:59-64); live probe: /api/v1/pega/check-rule без token → 401 AUTH_REQUIRED (jwtAuth enforced) |
| 8 | GAP 4: refresh success updates this.token; adapter returns undefined on dead refresh (no throw) | ✅ PASS | IndexingService.ingestAuthProvider(): `if (fresh) this.token = fresh`, catch → undefined; UT-11 ×3 (fresh-2 readback, unwired → undefined, throw → undefined) |
| 9 | SEC-01 applied: literal union 'auth'\|null on all 4 surfaces | ✅ PASS | PipelineOptions.shouldStop (:64), BfsRunResult.stopReason (:70), field stopReason (:86) PegaBfsPipeline.ts; BfsIndexResult.stopReason (PegaBfsIndexer.ts:104); wiring `"auth" as const` (PegaBfsIndexer.ts:199); log label fixed "paused due to auth" (PegaBfsPipeline.ts:128) |
| 10 | SEC-02 applied: 401 body/message truncated to 200 chars | ⚠️ PASS w/ note | truncate() PegaStreamIngester.ts:102-104; applied at :180 (submitJob 401 body) + :286 (envelope error.message); poll 401 fixed message (:211); SEC-02 test locks cap (auth-retry.test.ts:195-210). **Deviation: no newline strip** → SECA-01 (Low) |
| 11 | No new storage outside AuthManager; provider not serializable | ✅ PASS | grep secrets.store/globalState/workspaceState/persist in changed files → 0; token remains SecretStorage + in-memory cache; provider = live closure references only |
| 12 | REG-13: 0 static-token paths to /api/v1/pega/* outside withAuthRetry | ✅ PASS | grep getTokenSync/__authTokenProvider: remaining hits = AuthManager (internal), CommandRegistrar:49-68 (adapter + manual command), IndexingService provider internals, Discovery:79 + CatalogIndexer:150 (globalThis fallback, overridden when provider wired), server-types.ts (interface), tests. PegaMcpTools debt documented (SECA-04) |

## 2. SEC-01 / SEC-02 — Code Evidence

**SEC-01 (stopReason literal union) — IMPLEMENTED.** Free-form strings can no longer flow through the stop channel: the shouldStop contract, BfsRunResult, pipeline field, and BfsIndexResult are all typed `"auth" | null`; the wiring site returns `"auth" as const`; the run() log label is a fixed literal. Any future non-literal reason = compile error. Cross-checked: PegaCatalogIndexer compares `=== "auth"` (type-safe) and logs a fixed message.

**SEC-02 (401 body truncation) — IMPLEMENTED with 1 deviation.** Both 401 throw sites embed ≤200 chars via `truncate()` (contract prefixes "Ingest submit failed: HTTP …" / "Ingest failed: …" unchanged; non-401 errors untouched). Deviation: checkpoint 10 also required **strip newline** — implementation truncates length only (see SECA-01).

## 3. New-Code Security Review (changed surface only)

| Area | Assessment |
|------|-----------|
| Token leak paths (logs/exceptions/telemetry) | ✅ None. Token values appear ONLY inside `Authorization` header values; 0 log/throw/telemetry statements reference them. IngestAuthError never embeds the token |
| Error messages | ✅ Bounded (200 chars) for 401 paths; non-401 pre-existing behavior preserved; fixed Vietnamese notification string (no interpolation) |
| URL construction | ✅ All URLs = config backendUrl + hardcoded path constants; no user-supplied strings concatenated into fetch URLs. jobId (backend-controlled, trusted origin) interpolated into poll path — see SECA-02 (defense-in-depth) |
| IngestAuthProvider exposure | ✅ In-memory interface passed to internal services only; closures read live token (no token copy); not persisted, not exposed to webview (BasePanel provider unchanged) |
| X-Project-Id handling | ✅ Identity header sent consistently (authHeaders(), buildBackendAuthHeaders, poll rebuild); backend scopes writes by JWT identity — not an authz boundary by itself |
| Secrets storage | ✅ None added (checkpoint 11) |
| HTTPS assumption | ⚠️ Pre-existing SEC-03: `sdlcAgents.backendUrl` defaults http://localhost:48721; no scheme enforcement (unchanged by this diff — SECA-03, ticket riêng) |
| Retry bounds | ✅ fetch ≤2, refresh ≤1 per request (PBT-01); refresh dedupe via refreshInFlight (UT-12); poll cadence 3000ms unchanged; drainDiscard deviation is liveness-safe (each buffered item taken exactly once; supplier parked on push() is woken by take(); no double-decrement, no hang) |

## 4. OWASP Check (changed surface)

- **A01 Broken Access Control** — ✅ No issue. Authorization is JWT (server-side); extension change adds identity headers, removes none. Live probe: unauthenticated POST → 401 AUTH_REQUIRED. No bypass introduced; refresh-retry reuses the same authenticated identity.
- **A02 Cryptographic Failures** — N/A. No crypto code added/changed; token handling delegates to AuthManager (SecretStorage, OS keychain).
- **A05 Security Misconfiguration** — ✅ Fixed, not weakened: schema/generate now sends Authorization on a jwtAuth-enforced route (HttpServer.ts:111 `app.use('/api/v1/pega/*', jwtAuth)` — verified live: 401 AUTH_REQUIRED). Anonymous mode (`return anonymous()`) unaffected.
- **A07 Identification & Authentication Failures** — ✅ Refresh flow is bounded and fail-safe: refresh only on 401, exactly once per request, deduped; dead refresh → typed error → graceful stop + clear guidance, no auto-login (BR-3), no retry storm. Network errors never trigger refresh.
- **A09 Security Logging & Monitoring Failures** — ✅ No tokens in logs (checkpoint 1); auth-state transitions logged with fixed labels; one ⛔ log + one notification per run (BR-6 guard). Remaining: SECA-01 newline hygiene.

## 5. Findings

| ID | Severity | Finding | Location | Status |
|----|----------|---------|----------|--------|
| SECA-01 | Low | truncate() caps length but does NOT strip CR/LF (checkpoint 10 deviation): multi-line 401 body → multi-line error message → OutputChannel log noise (bounded 200 chars; not exploitable — hygiene only) | PegaStreamIngester.ts:102-104 | Open (condition) |
| SECA-02 | Informational | jobId from backend 202 embedded un-encoded in poll URL path; source is the trusted backend itself, no user input — defense-in-depth suggestion: `encodeURIComponent(jobId)` | PegaStreamIngester.ts:195 | Open (nice-to-have) |
| SECA-03 | Informational | Pre-existing (SEC-03, 3.7): no http://→https warning for backendUrl; unchanged by this diff | PegaHttpCore.ts (pre-existing) | Out of scope |
| SECA-04 | Informational | Pre-existing (SEC-04, 3.7): PegaMcpTools not wired to IngestAuthProvider (documented debt, TDD §2.9) | PegaMcpTools.ts | Out of scope |

No Critical/High/Medium findings. No fabricated issues; all findings traceable to code.

## 6. Verdict

**APPROVED-WITH-CONDITIONS.** All 12 checkpoints verified with code+test evidence; SEC-01 fully applied; SEC-02 applied except newline stripping. Single condition (SECA-01, ~1 line + test tweak): change truncate() to `value.replace(/[\r\n]+/g, " ").slice(0, 200)` (or SM explicitly accepts the deviation). Everything else is merge-ready from a security standpoint.

---
*Security Assessment v1.0 — Security Agent, 2026-10-16. Static analysis + 1 non-destructive live probe (unauthenticated 401 check). No exploitation attempted; no code modified.*