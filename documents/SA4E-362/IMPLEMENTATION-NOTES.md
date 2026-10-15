# SA4E-362 — Implementation Notes (Phase 5, DEV agent)

Date: 2026-10-16 · Branch: SA4E-362 (worktree actually on SA4E-364 with concurrent WIP — SM handles git) · No commits made by DEV.

## 1. Files Changed (13 production files, +423/−123 LOC per git diff --stat)

| File | Change (TDD ref) | Δ LOC |
|---|---|---|
| `src/utils/backend-auth-headers.ts` | §2.1: `IngestAuthProvider` + `withAuthRetry()` shared helper (GIỮ `ITokenProvider`/`buildBackendAuthHeaders`) | +48 |
| `src/services/PegaStreamIngester.ts` | §2.2: `IngestAuthError` (status field) + `authHeaders()` + `fetchWithAuthRetry()` + `makeBody()` factory + 3 call sites; `pollUntilComplete` headers rebuilt per-request; messages preserved | +164/− |
| `src/services/bounded-channel.ts` | §2.10: `get size()` | +2 |
| `src/services/PegaBfsPipeline.ts` | §2.3: `shouldStop?` + `BfsRunResult` + `checkStop()` + supply/consume stop checks + **drainDiscard** (deviation, §3) | +68 |
| `src/services/PegaBfsIndexer.ts` | §2.4: `auth` rename, `authDead`/`authNotified`, catch `instanceof IngestAuthError` → 1 log ⛔ + 1 `showWarningMessage`, `shouldStop: () => authDead ? 'auth' : null`, `BfsIndexResult.stopReason?` | +41 |
| `src/services/PegaCatalogIndexer.ts` | §2.5: rename, thread to BFS + `BackendHttpPoster` (globalThis fallback preserved), log `⏸️ Paused due to auth` | +19 |
| `src/services/PegaProjectIndexer.ts` | §2.6: rename; both `PegaStreamIngester` sites (resolveDataTables + ingestRules) | +7/− |
| `src/services/IndexingService.ts` | §2.7: `ingestAuthProvider()` (GAP 4: `this.token = fresh`); wired at Catalog/Project + FR-7 Schema/Discovery | +33 |
| `src/code-intel/delta/BackendHttpPoster.ts` | §2.8: union `(() => string) \| IngestAuthProvider` + runtime discrimination + refresh-on-401 single retry; 3 legacy tests untouched | +50 |
| `src/services/pega/PegaBackendClient.ts` | §2.9 T-1: `postBackend` + 5 exports take optional trailing `auth?`, wrapped in `withAuthRetry` | +43 |
| `src/services/PegaCodeIntelDiscovery.ts` | §2.9 T-2: `auth?` param, fetch wrapped, `AbortSignal.timeout` per-attempt | +28 |
| `src/services/PegaSchemaIndexer.ts` | §2.9 T-3: `auth?` param + **Authorization header added** (root-cause) + refresh-on-401 | +20 |
| `src/services/PegaHttpClient.ts` | pass-through optional `auth?` on 5 backend wrappers | +15 |

Test files (Vitest, STC v1.1): `PegaStreamIngester.auth-retry.test.ts` (213 L; UT-01..07, UT-14, PBT-01 via **fc.asyncProperty**), `PegaBfsPipeline.auth-dead.test.ts` (132 L; UT-08/09 through real Indexer→Pipeline→Ingester), `BackendHttpPoster.test.ts` (+UT-10a/b/c, legacy 3 untouched), `IndexingService.ingest-auth.test.ts` (57 L; UT-11), `auth-manager.test.ts` (+UT-12 dedupe describe), `PegaSchemaIndexer.auth.test.ts` (58 L; UT-13).

## 2. Key Decisions / Deviations from TDD

1. **drainDiscard deadlock guard (PegaBfsPipeline.consume)** — TDD gap fix, allowed by DoD #3: with a full channel (backpressure) and ALL consumers exiting on stop, a supplier parked on `push()` could never be woken → `run()` hangs forever (violates BR-4/FSD UC-4). On stop, consumers drain buffered items WITHOUT ingesting or counting them as skipped; discarded count feeds the run() log (`buffered discarded: N` more accurate than TDD's `channel.size` which is 0 after drain). Semantics of FSD FR-4 fully preserved (remaining ≠ skipped, in-flight completes).
2. **PBT-01 uses `fc.asyncProperty`** (STC says fast-check; `fc.property` is sync and would not await the Promise → false-fail). fast-check ^4.9.0 already in devDependencies — no new dependency.
3. **UT-08 assert `stopReason === 'auth'` + `aborted` stays null** per TDD §5 sync note (supersedes STC v1.1 "aborted=true").
4. **IndexingService also wires SchemaIndexer + CodeIntelDiscovery** (§2.7 Đổi 4, FR-7 SHOULD) — implemented as specified.
5. UT-06: without auth provider, a 401 envelope still raises `IngestAuthError` (message unchanged) — per TDD §2.2 Đổi 8 code path; STC "401 trả nguyên trạng" holds at message level.

## 3. Test Results

- `npm run compile`: **exit 0, zero errors**.
- `npm run test:unit`: **2949/2950 passed** (304 files). New/updated tests all green: UT-01..UT-14, PBT-01, UT-10d (3 legacy BackendHttpPoster), REG-13 partial.
- **1 pre-existing failure (NOT this change-set):** `pi-workflow/__tests__/pi-session-routing.test.ts` — caused by concurrent session's uncommitted WIP on `pi-workflow-adapter.ts` (verified: passes on `git stash` HEAD; test imports zero SA4E-362 files; file outside this ticket's scope — no-workaround rule, left for SA4E-364 owner).

## 4. REG-13 Audit (grep getTokenSync/__authTokenProvider, excl. AuthManager/tests/utils)

0 static-token paths to `/api/v1/pega/*` remain in MUST scope — all HTTP consumers route through `withAuthRetry`: StreamIngester (3 sites), BackendHttpPoster, PegaBackendClient (5 endpoints), CodeIntelDiscovery, SchemaIndexer. Remaining hits are benign: `CommandRegistrar.ts:49/:51` = the AuthManager→provider adapter feeding `refreshTokenFn`; `:66-78` = manual user "Refresh Token" command (not an HTTP path); `IndexingService`/`StreamIngester` internal provider reads; `CatalogIndexer:150` = globalThis fallback only when NO provider (documented back-compat); `server-types.ts` interface only. **Known debt (documented, per TDD §2.9):** `PegaMcpTools` unchanged — no auth provider available in MCP context.

## 5. Known Limitations

- **KB ingest failed:** `mem_ingest` via MCP `http://127.0.0.1:9183/mcp` returned `-32603 fetch failed` twice (orchestrator-internal error; anti-loop rule → stopped). Summary text preserved in this file — SM please re-ingest when the MCP server recovers.
- E2E-API-01..04 / SIT-01/02 remain manual (per STC — covered-by-SIT), not executed here.
- Concurrent SA4E-364 WIP shares this worktree; its 1 failing test is outside SA4E-362 scope and untouched.
## 6. Security conditions applied (3.7 Security Design Review — APPROVED-WITH-CONDITIONS, 2026-10-16)

- **SEC-01 — stopReason/shouldStop narrowed to literal union:** PipelineOptions.shouldStop?: () => "auth" | null; BfsRunResult.stopReason: "auth" | null; pipeline field stopReason: "auth" | null; BfsIndexResult.stopReason?: "auth" | null; PegaBfsIndexer wiring returns "auth" as const; pipeline run() log label fixed to "paused due to auth" (only remaining literal). PegaCatalogIndexer === "auth" comparison unchanged and type-safe. Free-form strings can no longer flow through the stop channel.
- **SEC-02 — IngestAuthError message truncation:** new private 	runcate() helper (<=20 lines/function) in PegaStreamIngester; 401 body (submitJob error path) and envelope rror.message (ingestSingleRule) are capped at 200 characters before being embedded in IngestAuthError. Contract message prefixes unchanged ("Ingest submit failed: HTTP ...", "Ingest failed: ..."); non-auth errors untouched. New test SEC-02 in PegaStreamIngester.auth-retry.test.ts locks the 200-char cap.
- **Re-verification:** 
pm run compile -> exit 0. 
pm run test:unit -> **2963/2964 passed** (305 files) — sole failure remains the known pre-existing pi-session-routing.test.ts (concurrent SA4E-364 WIP on pi-workflow-adapter.ts, untouched per scope). SA4E-362 test files: **51/51 green** (UT-01..14, PBT-01, UT-10a-d, UT-11, UT-12, UT-13, SEC-02).

## 7. Round 2 review fixes (security assessment + code review, 2026-10-16)

- **SECA-01 (Low, security):** PegaStreamIngester.truncate() now sanitizes BEFORE capping — alue.replace(/[\r\n]+/g, " ").slice(0, 200) — so a multi-line 401 body can no longer inject forged log lines into IngestAuthError messages. Both throw sites (submitJob body, ingestSingleRule envelope) inherit the fix. SEC-02 test extended with a multi-line 401 body assertion (message contains no CR/LF; newlines collapse to single spaces).
- **CR-01 (Minor, code review):** PegaProjectIndexer.crawlPlan (~:68) now threads 	his.auth into pegaClient.crawlPlan(...) (the FR-7 SHOULD gap) — same pattern as the 2 PegaStreamIngester sites (:117, :348). New P2 test PegaBackendClient.crawl-plan-auth.test.ts locks the mechanism: 401 → refresh exactly once → retry with fresh Bearer on /api/v1/pega/crawl-plan.
- **Re-test:** 
pm run compile -> exit 0. Targeted: PegaStreamIngester.auth-retry (15) + PegaBackendClient.crawl-plan-auth (1) + BackendHttpPoster (4) = 20/20 green. Full 
pm run test:unit -> **2986/2986 passed (306 files) — ALL GREEN** (the previously-failing pi-session-routing.test.ts now passes: concurrent SA4E-364 session fixed their WIP).
