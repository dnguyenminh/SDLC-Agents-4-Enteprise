# Software Test Cases (STC)

## SDLC Agents 4 Enterprise — SA4E-354: Pega performance improvements – remove dead endpoints and latency probe caching

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-354 |
| Title | Pega performance improvements – remove dead endpoints and latency probe caching |
| Author | QA Agent |
| Version | 1.0 |
| Date | 2026-10-11 |
| Status | Draft |
| Related STP | STP.md (documents/SA4E-354/STP.md) |
| Related FSD | documents/SA4E-354/FSD.md |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-11 | QA Agent | Initiate document — auto-generated from FSD use cases, business rules, and TDD §11.2 E2E design |

---

## Test Case Summary

IDs are prefixed by test level (per STP §2.1). Template category ranges (TC-001…TC-899) are mapped as: Happy Path → first case(s) of each level; Alternative/Exception Flows → dedicated cases; Business Rules → BR-traced cases; Boundary/Negative → UT-06…UT-11; Integration → IT level; Regression → UT-02/IT-03/SIT-03.

| Level | ID Range | Count | Automated | Priority |
|-------|----------|-------|-----------|----------|
| Property-Based (PBT) | PBT-01…PBT-03 | 3 | ✅ vitest + fast-check | High |
| Unit (UT) | UT-01…UT-11 | 11 | ✅ vitest | High/Medium |
| Integration (IT) | IT-01…IT-03 | 3 | ✅ vitest (real modules + mocked fetch) | High |
| E2E-API | E2E-API-01…E2E-API-03 | 3 | ✅ vitest.e2e.config.ts (full service path) | High |
| E2E-UI | — | 0 | ⛔ N/A (no UI changes — FSD §3.1.5/§3.2.5, TDD §1.2) | — |
| Manual SIT | SIT-01…SIT-03 | 3 | ❌ Manual (real Pega Academy 8b99ujcj) | High |
| **Total** | | **23** | **20 automated (87.0%) / 3 manual (13.0%)** | |

**TDD §11.2 E2E design mapping:** TDD TC-01 Dead endpoints removal → E2E-API-01 (+ UT-01/PBT-01); TDD TC-02 Latency cache hit → E2E-API-02 (+ UT-05); TDD TC-03 Duplicate probe reduction → IT-01 + E2E-API-03.

**Global isolation rule (applies to all PBT/UT/IT/E2E-API cases touching `PegaCrawlHelper`):** `probeLatencyCache` is module-level state. Each test MUST run with an isolated module registry: `vi.resetModules()` then `const helper = await import("../services/PegaCrawlHelper")`. Tests asserting persistence sequence calls within one registry; all other tests reset before each case.

---

## 1. Property-Based Tests (PBT)

**Target file (DEV implements):** `extension/src/__tests__/pega-prefix-resolution.pbt.test.ts` (PBT-01/02), cache property in `extension/src/__tests__/pega-crawl-helper-latency-cache.test.ts` (PBT-03). Generator constraint: base URLs from a valid `https?://host[:port][/path]` template (no raw arbitrary strings).

### PBT-01: Dead endpoints never appear in prefix list for any base URL

| Field | Value |
|-------|-------|
| **ID** | PBT-01 |
| **Priority** | High |
| **Type** | Property-Based |
| **Requirement** | UC-01, BR-01, BRD Story 1 AC-1.1; TDD §11.2 TC-01 |
| **Preconditions** | `vscode` mocked; `sdlcAgents.pegaEndpoint` stubbed per generated URL; isolated `PegaHttpCore` instance; fast-check 100 runs per property |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Generate 100 arbitrary base URLs (e.g., `https://hx7k2m.pega.net/prweb`, `http://localhost:8080/prweb`, `https://8b99ujcj.pega.com`) | Generator produces valid URL strings only |
| 2 | For each URL: configure stub, instantiate `PegaHttpCore`, call `getCustomRestPrefixes()` | Returns `string[]` of length 2 (when `activePrefix === null`) |
| 3 | For each returned prefix, assert: `!p.endsWith("/api/v1")` and `!p.includes("/PRRestService/v1")` | Property holds for ALL 100 samples — zero dead endpoints (BR-01) |
| 4 | For each returned prefix, assert `p.startsWith(base)` and (`p === \`${base}/api/CodeIntelligence/v1\`` or `p === \`${base}/PRRestService/CodeIntelligence/v1\``) | Property holds — only the two valid CodeIntelligence prefixes are ever produced |

**Test Data:** Generated base URLs from fast-check template `https?://{host}(:{port})?/{path}` + fixed sample `https://8b99ujcj.pega.com/prweb` (see `testdata/prefix-resolution-testdata.csv`, rows PBT-01-a/b).
**Postconditions:** No shared state mutated (each run uses fresh core instance).

---

### PBT-02: Prefix closure and activePrefix-first ordering property

| Field | Value |
|-------|-------|
| **ID** | PBT-02 |
| **Priority** | High |
| **Type** | Property-Based |
| **Requirement** | UC-01, BR-02, BRD Story 1 Requirement 2; regression guard for `activePrefix` promotion (O7) |
| **Preconditions** | `vscode` mocked; fast-check 100 runs; two state variants per run: `activePrefix = null` and `activePrefix` = one of the returned prefixes |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | For each generated base URL, call `getCustomRestPrefixes()` with `activePrefix = null` | Returns exactly `[base + "/api/CodeIntelligence/v1", base + "/PRRestService/CodeIntelligence/v1"]` in this order |
| 2 | Set `core.activePrefix = prefixes[k]` (k ∈ {0,1}) and call `getCustomRestPrefixes()` again | `result[0] === core.activePrefix`; the other valid prefix follows; no duplicates (`new Set(result).size === result.length`) |
| 3 | Assert `activePrefix` value itself is always one of the two valid CodeIntelligence prefixes | Never a dead endpoint gets promoted (BR-02) |

**Test Data:** Same generator as PBT-01 (see `testdata/prefix-resolution-testdata.csv`, row PBT-02).
**Postconditions:** Fresh core per run; no leakage.

---

### PBT-03: Cache-key case sensitivity property (distinct operator IDs never share cache entries)

| Field | Value |
|-------|-------|
| **ID** | PBT-03 |
| **Priority** | High |
| **Type** | Property-Based |
| **Requirement** | UC-02, BR-03 (cache key case-sensitive) |
| **Preconditions** | `vi.resetModules()` + dynamic import of `PegaCrawlHelper`; `vscode` mocked; `measureLatency` spied (passthrough, fast stub latency); fast-check 50 runs |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Generate a random operator ID string `op` (alphanumeric + `@`), derive case-variant pair when possible (e.g., `op` vs `op.toUpperCase()`), skip pair when `op === variant` | Pair is distinct in ≥ 1 run of the batch |
| 2 | Call `calibrateFetchConcurrency(clientA, total, log)` with `clientA.getConfiguredUsername() = op` | `measureLatency` invoked once for this operator (2 `getObject` samples) |
| 3 | Call again with `clientB.getConfiguredUsername() = variant` (different case, same letters) | `measureLatency` invoked AGAIN (case-sensitive key → separate cache entry, BR-03) |
| 4 | Call a third time with the original `op` | `measureLatency` NOT invoked (log `🎯 Latency probe cached for {op}`) — original entry was preserved, not overwritten by the variant |

**Test Data:** Generated operator IDs; example fixed pair `SSA@TGB` vs `ssa@tgb` (see `testdata/latency-cache-testdata.csv`, rows PBT-03-a/b/c).
**Postconditions:** Module registry discarded; no cross-test cache state.

---

## 2. Unit Tests (UT)

**Target files (DEV implements):**
- `extension/src/__tests__/pega-http-core-prefixes.test.ts` → UT-01…UT-03, UT-11
- `extension/src/__tests__/pega-crawl-helper-latency-cache.test.ts` → UT-04…UT-10

**Shared fixtures:** `vi.mock("vscode", ...)` returning `pegaEndpoint` / `pegaUsername` per case; `mockSecrets()` as in `pega-codeintel-discovery.test.ts`; `pegaClient` stub = `{ getConfiguredUsername(): string, getObject: vi.fn() }` cast to `PegaHttpClient`.

### UT-01: getCustomRestPrefixes returns only the two valid CodeIntelligence prefixes — no dead endpoints

| Field | Value |
|-------|-------|
| **ID** | UT-01 |
| **Priority** | High |
| **Type** | Functional — Happy Path |
| **Requirement** | UC-01, BR-01, BRD AC-1.1; FSD §10 TC-01; TDD §11.2 TC-01, §3.2 |
| **Preconditions** | `vscode` mocked with `pegaEndpoint = "https://8b99ujcj.pega.com/prweb"`; fresh `PegaHttpCore` with `activePrefix = null` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `core.getCustomRestPrefixes()` | Returns array of exactly 2 entries |
| 2 | Assert `result[0]` | Equals `https://8b99ujcj.pega.com/prweb/api/CodeIntelligence/v1` |
| 3 | Assert `result[1]` | Equals `https://8b99ujcj.pega.com/prweb/PRRestService/CodeIntelligence/v1` |
| 4 | Assert dead endpoints absent: `result.some(p => p.endsWith("/api/v1")) === false` and `result.some(p => p.includes("/PRRestService/v1")) === false` | Both false — `${base}/api/v1` and `${base}/PRRestService/v1` are NOT in the list (BR-01, AC-1.1) |

**Test Data:** Base `https://8b99ujcj.pega.com/prweb`; expected prefixes per `testdata/prefix-resolution-testdata.csv` row UT-01.
**Postconditions:** Prefix list stable; core state untouched.

---

### UT-02: activePrefix is promoted to first position without duplication

| Field | Value |
|-------|-------|
| **ID** | UT-02 |
| **Priority** | High |
| **Type** | Functional — Regression |
| **Requirement** | UC-01, BR-02; TDD §3.2 ("activePrefix is prepended on first successful call"); STP objective O7 |
| **Preconditions** | `vscode` mocked (`pegaEndpoint = "https://8b99ujcj.pega.com/prweb"`); core with `activePrefix = "https://8b99ujcj.pega.com/prweb/PRRestService/CodeIntelligence/v1"` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `core.getCustomRestPrefixes()` | `result[0] === activePrefix` (PRRestService/CodeIntelligence first) |
| 2 | Assert full list | `[".../PRRestService/CodeIntelligence/v1", ".../api/CodeIntelligence/v1"]` — exactly 2 entries, `api/CodeIntelligence/v1` moved to position 1, no duplicate of activePrefix |
| 3 | Assert dead endpoints still absent | No `/api/v1`, no `/PRRestService/v1` (BR-01 holds in promoted state too) |

**Test Data:** As above (see `testdata/prefix-resolution-testdata.csv` row UT-02).
**Postconditions:** Ordering behavior preserved vs pre-change implementation.

---

### UT-03: Trailing slash on configured endpoint is trimmed (data-spec conformance)

| Field | Value |
|-------|-------|
| **ID** | UT-03 |
| **Priority** | Medium |
| **Type** | Boundary / Regression |
| **Requirement** | UC-01 data spec (FSD §3.1.4: `base` must be valid URL); TDD §3.2 (`getPegaEndpoint()` replaces trailing `/`) |
| **Preconditions** | `vscode` mocked with `pegaEndpoint = "https://8b99ujcj.pega.com/prweb/"` (trailing slash) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `core.getCustomRestPrefixes()` | Prefixes contain no `//` artifacts: `https://8b99ujcj.pega.com/prweb/api/CodeIntelligence/v1` (single slash before `api`) |
| 2 | Assert no dead endpoints | `endsWith("/api/v1") === false`, `includes("/PRRestService/v1") === false` |

**Test Data:** Endpoint with trailing slash (see `testdata/prefix-resolution-testdata.csv` row UT-03).
**Postconditions:** Behavior identical to pre-change code.

---

### UT-04: First calibrateFetchConcurrency call is a cache miss — probe runs and populates cache

| Field | Value |
|-------|-------|
| **ID** | UT-04 |
| **Priority** | High |
| **Type** | Functional — Happy Path |
| **Requirement** | UC-02 main flow steps 2–5, BR-05 (populate on success), BRD AC-2.1; FSD §10 TC-03; TDD §3.3 logic steps 1–5 |
| **Preconditions** | `vi.resetModules()` + dynamic import of `PegaCrawlHelper` (empty cache); `pegaClient` stub: `getConfiguredUsername() → "SSA@TGB"`, `getObject → vi.fn(async () => ({ pxObjClass: "DATA-ADMIN-OPERATOR-ID" }))`; `log` collects lines |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `await calibrateFetchConcurrency(pegaClient, 500, log)` | Resolves with `number` concurrency ≥ 1 |
| 2 | Assert `pegaClient.getObject` call count | Exactly 2 calls (one `measureLatency` run with `sampleCount = 2`), both with `("DATA-ADMIN-OPERATOR-ID", "SSA@TGB", "@baseclass")` |
| 3 | Assert log lines | Contains `[Pega Indexer] 🎯 Auto-tuned: latency=` … `→ FETCH_CONCURRENCY recomputed` and `→ FETCH_CONCURRENCY={n}` |
| 4 | Call `calibrateFetchConcurrency` a second time (same client) | `getObject` count stays 2 — proves step 1 populated the cache (AC-2.1, BR-05) |

**Test Data:** operatorId `SSA@TGB`, totalItems 500 (see `testdata/latency-cache-testdata.csv` row UT-04).
**Postconditions:** Cache contains `SSA@TGB → latency`; discarded with module registry.

---

### UT-05: Second call for the same operator is a cache hit — no probe, exact log line

| Field | Value |
|-------|-------|
| **ID** | UT-05 |
| **Priority** | High |
| **Type** | Functional — Alternative Flow (UC-02 AF-1) |
| **Requirement** | UC-02 AF-1, BR-04, BRD AC-2.2; FSD §10 TC-04; TDD §11.2 TC-02, §3.3 step 6 ("Cache hit → log Latency probe cached for {operatorId}") |
| **Preconditions** | Isolated module registry; cache pre-warmed by one prior `calibrateFetchConcurrency` call for `SSA@TGB` (per UT-04) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Reset `getObject` spy counters; call `await calibrateFetchConcurrency(pegaClient, 500, log)` (2nd invocation, same operator) | Resolves with a concurrency number |
| 2 | Assert `pegaClient.getObject` was NOT called | Call count === 0 — no duplicate probe (BR-04) |
| 3 | Assert log contains the exact fragment | `[Pega Indexer] 🎯 Latency probe cached for SSA@TGB` (AC-2.2, TDD §9.1 log spec) |
| 4 | Assert no `Auto-tuned: ... recomputed` measure line, but `→ FETCH_CONCURRENCY={n}` line present | Cached latency still drives concurrency computation |

**Test Data:** operatorId `SSA@TGB` (see `testdata/latency-cache-testdata.csv` row UT-05).
**Postconditions:** Cache unchanged; still exactly 1 probe for the operator in this session.

---

### UT-06: Cache key is case-sensitive — SSA@TGB and ssa@tgb probe independently

| Field | Value |
|-------|-------|
| **ID** | UT-06 |
| **Priority** | High |
| **Type** | Negative / Business Rule |
| **Requirement** | UC-02, BR-03 (FSD §3.2.3: "Cache key must be operator ID string, case-sensitive") |
| **Preconditions** | Isolated module registry (empty cache); two client stubs with usernames `SSA@TGB` and `ssa@tgb` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `calibrateFetchConcurrency(clientUpper, 100, log)` | Probe runs: 2 `getObject` calls with `SSA@TGB` |
| 2 | Call `calibrateFetchConcurrency(clientLower, 100, log)` | Probe runs AGAIN: 2 `getObject` calls with `ssa@tgb` — separate cache entry (BR-03) |
| 3 | Call again with `clientUpper` | No new `getObject` call; log `🎯 Latency probe cached for SSA@TGB` |

**Test Data:** `SSA@TGB` vs `ssa@tgb` (see `testdata/latency-cache-testdata.csv` row UT-06).
**Postconditions:** Two independent cache entries in the isolated registry.

---

### UT-07: No operator configured — probe skipped, default concurrency returned

| Field | Value |
|-------|-------|
| **ID** | UT-07 |
| **Priority** | High |
| **Type** | Functional — Exception Flow (UC-02 EF-1) |
| **Requirement** | UC-02 EF-1; FSD §9.1 ("Cache miss with no operator → Info logged → Skip probe"); TDD §3.3 error responses; SA4E-241 fail-safe behavior |
| **Preconditions** | Isolated module registry; `pegaClient.getConfiguredUsername() → ""` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `await calibrateFetchConcurrency(pegaClient, 300, log)` | Resolves with default `10` (module initial `FETCH_CONCURRENCY`) |
| 2 | Assert `pegaClient.getObject` never called | Call count === 0 |
| 3 | Assert log contains | `[Pega Indexer] ⚠️ No pegaUsername configured — skipping latency probe, using default FETCH_CONCURRENCY=10` |
| 4 | Call twice more | Still no probe and no cache entry created for empty key |

**Test Data:** Empty `pegaUsername` (see `testdata/latency-cache-testdata.csv` row UT-07).
**Postconditions:** Cache remains empty; no crash.

---

### UT-08: measureLatency failure — warning logged, default returned, cache NOT populated (retry next call)

| Field | Value |
|-------|-------|
| **ID** | UT-08 |
| **Priority** | High |
| **Type** | Functional — Exception Flow (UC-02 EF-2 / AF-2), BR-05 |
| **Requirement** | UC-02 AF-2 + EF-2; FSD §9.1 ("Latency probe failed → Warning logged → Use default concurrency"); BR-05 ("Cache must be populated only on successful measurement") |
| **Preconditions** | Isolated module registry; `vi.mock("../services/concurrency-tuner")` where `measureLatency` is replaced by `vi.fn(async () => { throw new Error("probe boom"); })` and `computeOptimalConcurrency` passes through to the real implementation |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `await calibrateFetchConcurrency(pegaClient, 300, log)` | Resolves (does NOT throw) with default `10` |
| 2 | Assert log contains | `[Pega Indexer] ⚠️ Latency probe failed — using default FETCH_CONCURRENCY=10` |
| 3 | Call again with a now-resolving `measureLatency` | Probe RETRIES (BR-05: failed measurement must not poison the cache) — `measureLatency` mock invoked a 2nd time and succeeds |
| 4 | Assert second-call logs | `🎯 Auto-tuned: latency=` line present; cache now populated (3rd call → cache hit) |

**Test Data:** operatorId `SSA@TGB`; forced `measureLatency` rejection (see `testdata/latency-cache-testdata.csv` row UT-08).
**Postconditions:** After recovery, cache populated exactly once; no stale failure state.

---

### UT-09: Sample-level getObject rejection is tolerated (fail-safe probe) — latency still measured and cached

| Field | Value |
|-------|-------|
| **ID** | UT-09 |
| **Priority** | Medium |
| **Type** | Functional — Documented fail-safe behavior |
| **Requirement** | UC-02 AF-2/EF-2 (two-tier per BA adjudication 2026-10-11): Tier 1 sample-level reject → tolerated + latency cached (CORRECT per SA4E-241 fail-safe design); Tier 2 measureLatency overall throw → no cache + default concurrency (covered by UT-08) |
| **Preconditions** | Isolated module registry; `pegaClient.getObject = vi.fn(async () => { throw new Error("ECONNREFUSED"); })` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `await calibrateFetchConcurrency(pegaClient, 300, log)` | Resolves with concurrency ≥ 1 (no throw) |
| 2 | Assert `getObject` called exactly 2 times (both rejected and swallowed by sample wrapper) | Sample tolerance honored; `measureLatency` completes with near-0 latency |
| 3 | Assert log | `🎯 Auto-tuned: latency=0ms → FETCH_CONCURRENCY={n}` variant present; NO `Latency probe failed` warning |
| 4 | Call again | Cache hit (`🎯 Latency probe cached for SSA@TGB`). Cache populated after sample-level failure is EXPECTED behavior (adjudicated) — cached near-0 latency is an accepted trade-off; do NOT raise defect |

**Test Data:** operatorId `SSA@TGB`, rejecting getObject (see `testdata/latency-cache-testdata.csv` row UT-09).
**Postconditions:** Cache holds near-0 latency entry in isolated registry. Residual risk accepted: cached ≈0ms latency → computeOptimalConcurrency falls back to cFloor, bounded by totalItems and maxServerConnections=15 (per BRD §5.1)

---

### UT-10: Concurrency output respects totalItems and maxServerConnections caps

| Field | Value |
|-------|-------|
| **ID** | UT-10 |
| **Priority** | Medium |
| **Type** | Boundary / Non-Functional (TDD §8.2, §8.3) |
| **Requirement** | UC-02 output spec (FSD §3.2.4); TDD §8.2 ("Max server connections capped at 15 via computeOptimalConcurrency"); NFR scalability (BRD §6) |
| **Preconditions** | Isolated module registry; resolving `getObject` stub; fixed small `measureLatency` (e.g., spy returning 50ms) to make math deterministic |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `calibrateFetchConcurrency(pegaClient, 1, log)` with tiny latency | Returns `1` — capped by `totalItems` (boundary min) |
| 2 | Call with `totalItems = 100000` and tiny latency | Returns `≤ 15` — capped by `maxServerConnections = 15` (boundary max, TDD §8.2) |
| 3 | Assert both results are integers ≥ 1 | No zero/negative concurrency in any case |

**Test Data:** totalItems 1 and 100000; latency stub 50ms (see `testdata/latency-cache-testdata.csv` row UT-10-a/b).
**Postconditions:** Bounds verified; cache contains one entry.

---

### UT-11: Empty prefix list — fail-loud error per BA adjudication (spec-corrected)

| Field | Value |
|-------|-------|
| **ID** | UT-11 |
| **Priority** | High |
| **Type** | Functional — Exception Flow (UC-01 AF-1 / EF-1) |
| **Requirement** | UC-01 AF-1/EF-1 (spec-corrected per BA adjudication 2026-10-11 — empty prefix list = internal error condition, fail-loud expected); FSD §3.1.2 EF-1 to be updated by BA/SA |
| **Preconditions** | Core stub (cast) whose `getCustomRestPrefixes()` returns `[]` (defensive contract trigger — real implementation can only produce this if endpoint resolution degrades); consumer under test = `PegaRuleReadClient.getRuleByInsKey` |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `getRuleByInsKey(coreWithEmptyPrefixes, "RULE-HTML-SECTION @BASECLASS PZBULKACTIONS #20180713T134741.673 GMT")` | Consumer throws fail-loud with clear `Rule not found: {insKey}` error and logs — adjudicated as CORRECT behavior; NO silent fallback, no request emitted |
| 2 | Observe behavior | Confirm throw + clear log; do NOT raise code defect (BA adjudicated spec correction) |
| 3 | Assert no request was issued to any dead endpoint during the fallback attempt | URL audit stays clean regardless of branch taken (BR-01) |

**Test Data:** insKey `RULE-HTML-SECTION @BASECLASS PZBULKACTIONS #20180713T134741.673 GMT`; empty prefix stub (see `testdata/prefix-resolution-testdata.csv` row UT-11).
**Postconditions:** Case PASSES when fail-loud throw occurs (spec-corrected expectation)

---

## 3. Integration Tests (IT)

**Target file (DEV implements):** `extension/src/__tests__/pega-latency-cache.integration.test.ts`
**Technique:** REAL modules (`PegaCrawlHelper`, `concurrency-tuner`, `PegaHttpCore`, `PegaRuleReadClient`, `parallel-utils`) in-process — only `vscode` and `global.fetch` are mocked. `vi.mock("../services/concurrency-tuner")` is allowed ONLY as a passthrough spy wrapper when counting `measureLatency` invocations (IT-01); the real implementation must still execute.

### IT-01: Cross-pipeline probe deduplication — measureLatency invoked exactly once across both indexers

| Field | Value |
|-------|-------|
| **ID** | IT-01 |
| **Priority** | High |
| **Type** | Integration |
| **Requirement** | UC-02 main flow steps 1–8, BR-04, BRD AC-2.3; FSD §10 TC-05; TDD §11.2 TC-03 ("assert measureLatency invoked once"), §8.1 |
| **Preconditions** | `vi.resetModules()` + dynamic import of real `PegaCrawlHelper`; `concurrency-tuner` passthrough-spied; client stub `SSA@TGB` with resolving `getObject`; call sequence mirrors the two real call sites: `PegaProjectIndexer.ts:91` (`calibrateFetchConcurrency(pegaClient, crawlSet.length, log)`) then `PegaBfsIndexer.ts:172` (`calibrateFetchConcurrency(pegaClient, initialCount, log)`) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Invoke call-site #1 (project indexer params: totalItems = 500) | `measureLatency` spy invoked **exactly 1** time; `getObject` probe samples = 2 |
| 2 | Invoke call-site #2 (BFS indexer params: totalItems = 200) against the SAME module registry (simulates shared in-process cache) | `measureLatency` spy STILL invoked exactly 1 time in total — no second probe (BR-04, AC-2.3) |
| 3 | Assert log of call #2 | `🎯 Latency probe cached for SSA@TGB` |
| 4 | Assert both calls return a valid concurrency | Both ≥ 1; BFS call computed from the SAME cached latency value |

**Test Data:** operatorId `SSA@TGB`; totalItems 500 → 200 (see `testdata/latency-cache-testdata.csv` row IT-01).
**Postconditions:** In isolated registry: 1 probe, 2 cache-reuse events possible; registry discarded.

---

### IT-02: fetchRulesInParallel consumes the calibrated concurrency (max in-flight ≤ returned value)

| Field | Value |
|-------|-------|
| **ID** | IT-02 |
| **Priority** | Medium |
| **Type** | Integration |
| **Requirement** | UC-02 main flow step 8 + output spec (FSD §3.2.4 `FETCH_CONCURRENCY`); UC-02 postcondition "Indexing proceeds with calibrated concurrency" |
| **Preconditions** | Isolated registry; calibration run with slow `getObject` stub (e.g., `await delay(30)` per sample → measured latency ≈ 30ms, totalItems = 500 → deterministic concurrency C from real `computeOptimalConcurrency`); `fetchRulesInParallel` chunk of 20 items, each item fetched via `getObject` stub that tracks concurrent in-flight counter (increment on entry, decrement on exit, record max) |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run `calibrateFetchConcurrency` → capture returned value `C` | `C` ≥ 1 (and ≤ 15 per TDD §8.2) |
| 2 | Run `fetchRulesInParallel(chunkOf20, pegaClient, log)` with the tracked stub | Completes with `fetched.length === 20`, `serverError === null` |
| 3 | Assert recorded max in-flight | `maxInflight ≤ C` (calibrated concurrency actually throttles the parallel fetch) AND `maxInflight > 1` (parallelism actually applied, not serialized) |

**Test Data:** 20 CrawlPlanItem fixtures (`pxObjClass: "Rule-Obj-Activity"`, `pyClassName: "TGB-HRApps-Work"`, `pyRuleName: "Rule{i}"`, `insKey: "RULE-OBJ-ACTIVITY TGB-HRAPPS-WORK RULE{i}"`) (see `testdata/latency-cache-testdata.csv` row IT-02).
**Postconditions:** Throttle contract validated end-to-end within the module family.

---

### IT-03: Real read-path prefix failover — 404 on first valid prefix, success on second, zero dead-endpoint requests

| Field | Value |
|-------|-------|
| **ID** | IT-03 |
| **Priority** | High |
| **Type** | Integration / Regression |
| **Requirement** | UC-01 main flow steps 2–5, BR-02, BRD AC-1.2 (integration level); TDD §3.2 (`activePrefix` prepended on first success); STP objective O7 |
| **Preconditions** | Real `PegaHttpCore` with `vscode` stub `pegaEndpoint = "https://8b99ujcj.pega.com/prweb"`, `activePrefix = null`; real `getRuleByInsKey`; `global.fetch` scripted: any URL on `.../api/CodeIntelligence/v1/rules/instance` → HTTP 404, any URL on `.../PRRestService/CodeIntelligence/v1/rules/instance` → HTTP 200 with full-rule JSON body; every requested URL recorded |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Call `await getRuleByInsKey(core, "RULE-HTML-SECTION @BASECLASS PZBULKACTIONS #20180713T134741.673 GMT")` | Resolves with the rule JSON from the 2nd prefix |
| 2 | Assert recorded request URLs | First attempt hits `.../prweb/api/CodeIntelligence/v1/rules/instance?...` (404 → continue), second hits `.../prweb/PRRestService/CodeIntelligence/v1/rules/instance?...` (200) |
| 3 | Assert NO recorded URL contains `/api/v1` or `/PRRestService/v1` | Zero dead-endpoint probes issued on the failover path (AC-1.2, BR-01) |
| 4 | Assert `core.activePrefix` | Now equals `.../PRRestService/CodeIntelligence/v1` (promotion on success, TDD §3.2) |

**Test Data:** insKey + scripted 404/200 responses (see `testdata/prefix-resolution-testdata.csv` row IT-03).
**Postconditions:** `activePrefix` locked to the working prefix; subsequent calls hit it first.

---

## 4. E2E-API Tests

**Target file (DEV implements):** `extension/src/__tests__/pega-prefix-cache.e2e.test.ts`, registered in `vitest.e2e.config.ts` include globs (run via `npm run test:e2e`).
**Technique:** Full service path with real `PegaHttpClient` + `PegaHttpCore` + `PegaCrawlHelper` + read clients; only `vscode` config/secrets and `global.fetch` are stubbed to emulate Pega Academy `8b99ujcj` behavior (404 on dead endpoints as observed in production logs).

### E2E-API-01: Full-stack URL audit — dead endpoints never requested on the rules path (TDD TC-01)

| Field | Value |
|-------|-------|
| **ID** | E2E-API-01 |
| **Priority** | High |
| **Type** | Automated (vitest + fetch stub) — E2E-API |
| **File** | extension/src/\_\_tests\_\_/pega-prefix-cache.e2e.test.ts |
| **Requirement** | BRD AC-1.1 + AC-1.2; UC-01, BR-01; FSD §10 TC-01 + TC-02; TDD §11.2 TC-01 |
| **Preconditions** | `vscode` stub: `pegaEndpoint = "https://8b99ujcj.pega.com/prweb"`, `pegaUsername = "SSA@TGB"`; real `PegaHttpClient` built on stubbed SecretStorage; `global.fetch` scripted per real Academy behavior: dead-endpoint URL shapes → would be 404 (asserted never called), valid prefixes → 200 fixtures; all request URLs captured |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Drive a representative read sequence through the real client: `getRuleByInsKey(...)` + a rules list call (`PegaRuleListClient` path using `getCustomRestPrefixes()`) | Both resolve successfully via the valid prefixes |
| 2 | Audit ALL captured URLs: `url.includes("/api/v1")` | 0 occurrences — `${base}/api/v1` never requested (AC-1.1) |
| 3 | Audit ALL captured URLs: `url.includes("/PRRestService/v1")` | 0 occurrences — `${base}/PRRestService/v1` never requested (substring-safe: valid prefix `PRRestService/CodeIntelligence/v1` does not contain it) |
| 4 | Assert both valid prefixes were attempted at least once across the sequence | `${base}/api/CodeIntelligence/v1` and `${base}/PRRestService/CodeIntelligence/v1` present in captured URLs |

**Test Data:** See `testdata/prefix-resolution-testdata.csv` row E2E-API-01.
**Postconditions:** No state leakage (fresh module registry); URL audit exported to TEST-REPORT evidence.

---

### E2E-API-02: Full calibration cycle — first run measures and caches, second run reuses with zero probe HTTP calls (TDD TC-02)

| Field | Value |
|-------|-------|
| **ID** | E2E-API-02 |
| **Priority** | High |
| **Type** | Automated (vitest + fetch stub) — E2E-API |
| **File** | extension/src/\_\_tests\_\_/pega-prefix-cache.e2e.test.ts |
| **Requirement** | BRD AC-2.1 + AC-2.2; UC-02, BR-04, BR-05; FSD §10 TC-03 + TC-04; TDD §11.2 TC-02, §8.3 (cached probe target < 1ms — asserted as zero extra network calls) |
| **Preconditions** | Isolated registry; real `PegaHttpClient` (`SSA@TGB`); fetch stub: `DATA-ADMIN-OPERATOR-ID` object requests → 200 after 20ms delay; probe HTTP calls counted by URL pattern |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run #1 (simulates `PegaProjectIndexer` start): `calibrateFetchConcurrency(client, 500, log)` | Probe HTTP call count = **2** (one `measureLatency`, sampleCount 2); log `🎯 Auto-tuned: latency=` |
| 2 | Reset counter; Run #2 (simulates `PegaBfsIndexer` start): `calibrateFetchConcurrency(client, 200, log)` | Probe HTTP call count added = **0** — cached value reused with no network round-trip (AC-2.2, TDD §8.3 proxy assertion) |
| 3 | Assert run #2 log | `🎯 Latency probe cached for SSA@TGB` |
| 4 | Assert no rules/query fixture requests were consumed by run #2 | Run #2 issues only concurrency computation, no Academy calls |

**Test Data:** See `testdata/latency-cache-testdata.csv` row E2E-API-02.
**Postconditions:** Cache holds exactly one entry for `SSA@TGB` in this registry.

---

### E2E-API-03: Duplicate probe reduction across two indexer pipelines (TDD TC-03)

| Field | Value |
|-------|-------|
| **ID** | E2E-API-03 |
| **Priority** | High |
| **Type** | Automated (vitest + fetch stub) — E2E-API |
| **File** | extension/src/\_\_tests\_\_/pega-prefix-cache.e2e.test.ts |
| **Requirement** | BRD AC-2.3; UC-02; FSD §10 TC-05; TDD §11.2 TC-03, §8.1 ("Previously SSA@TGB incurred 16 duplicate calls; target 1 per session") |
| **Preconditions** | Isolated registry; one real `PegaHttpClient` shared by both simulated pipelines; fetch stub counts ALL requests whose URL contains `DATA-ADMIN-OPERATOR-ID` (probe requests) and returns 200 after 10ms; fixture rules/query responses 200 |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Simulate pipeline sequence in ONE process: project-indexer calibration → BFS calibration (mirrors `PegaProjectIndexer.ts:91` + `PegaBfsIndexer.ts:172`) | Both complete |
| 2 | Count total `DATA-ADMIN-OPERATOR-ID` HTTP requests | Exactly **2** (1 probe session × sampleCount 2) — versus 4 with the pre-fix duplicated behavior (2 independent probes × 2 samples) |
| 3 | Assert `measureLatency` effective sessions | 1 (via invocation spy or inferred from probe count) |
| 4 | Assert second calibration log | `🎯 Latency probe cached for SSA@TGB` — no `Auto-tuned: ... recomputed` line from a fresh measurement |

**Test Data:** operatorId `SSA@TGB`; baseline comparison constant = 4 duplicated probe requests pre-fix (see `testdata/latency-cache-testdata.csv` row E2E-API-03).
**Postconditions:** Reduction proven at HTTP level; the real-instance 16→N reduction is separately validated by SIT-02.

---

## 5. E2E-UI Tests

**⛔ Not applicable — 0 cases.** SA4E-354 modifies only extension service-layer modules (`PegaHttpCore`, `PegaCrawlHelper`). FSD §3.1.5 and §3.2.5 declare UI Specifications "N/A", and TDD §1.2 places UI modifications out of scope. No Playwright suite is planned; if UI behavior ever depends on these services, it will be covered under a separate ticket's STC.

---

## 6. Manual SIT Tests (real Pega Academy 8b99ujcj)

**Environment:** VS Code with the extension loaded (F5 launch), `sdlcAgents.pegaEndpoint = "https://8b99ujcj.pega.com/prweb"`, `sdlcAgents.pegaUsername = "SSA@TGB"`, credentials in SecretStorage. Evidence: screenshots of the Output channel (`Pega Indexer` / `PegaHttpClient`) saved to `documents/SA4E-354/evidence/`.

### SIT-01: No 404 probes for dead endpoints on real Pega Academy

| Field | Value |
|-------|-------|
| **ID** | SIT-01 |
| **Priority** | High |
| **Type** | Manual SIT — Functional on real instance |
| **Requirement** | BRD AC-1.2; UC-01 main flow step 5; FSD §10 TC-02 |
| **Preconditions** | Extension built with SA4E-354 changes; workspace trusted; credentials valid; Output channel visible |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run **Pega: Index Project** (PegaProjectIndexer) on the configured Pega Academy project | Indexing starts; rules/query calls proceed |
| 2 | Search the Output channel log for `api/v1` and `PRRestService/v1` (dead shapes) | **0 log lines** showing a request to `${base}/api/v1/...` or `${base}/PRRestService/v1/...` (in particular no `=> HTTP 404` for those paths) |
| 3 | Confirm valid-prefix traffic | Requests observed only on `/api/CodeIntelligence/v1/...` and/or `/PRRestService/CodeIntelligence/v1/...` |
| 4 | Capture evidence | Screenshot `evidence/SIT-01-no-404-dead-endpoints.png` |

**Test Data:** Project with a known rule set (same project as the pre-fix baseline run that exhibited the 404 spam).
**Postconditions:** Baseline comparison recorded in TEST-REPORT.

---

### SIT-02: Cached latency probe observable across both pipelines on real instance

| Field | Value |
|-------|-------|
| **ID** | SIT-02 |
| **Priority** | High |
| **Type** | Manual SIT — Performance behavior on real instance |
| **Requirement** | BRD AC-2.2 + AC-2.3; UC-02 AF-1; FSD §10 TC-04 + TC-05; TDD §8.1 (16 duplicate calls → target 1 per session) |
| **Preconditions** | Same environment as SIT-01; both indexer entry points available; note the pre-fix baseline: `SSA@TGB` incurred 16 duplicate `rules/query` calls from independent probes |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run **PegaProjectIndexer** indexing | Log contains exactly one `🎯 Auto-tuned: latency={n}ms → FETCH_CONCURRENCY={c}` line for `SSA@TGB` |
| 2 | Immediately run **PegaBfsIndexer** indexing (same session) | Log contains `🎯 Latency probe cached for SSA@TGB` and NO second `Auto-tuned: latency=... recomputed` measurement line |
| 3 | Count operator-probe requests across both runs (from `📡 POST/GET` log lines targeting `DATA-ADMIN-OPERATOR-ID`) | Total ≤ 2 (one probe session); dramatically below the 16-duplicate-calls baseline scenario (AC-2.3) |
| 4 | Capture evidence | Screenshot `evidence/SIT-02-cached-probe-log.png` + log excerpt pasted into TEST-REPORT |

**Test Data:** Operator `SSA@TGB`; same project/workspace as baseline.
**Postconditions:** Reduction figure recorded for TEST-REPORT metrics.

---

### SIT-03: Regression — indexing still completes end-to-end with unchanged results

| Field | Value |
|-------|-------|
| **ID** | SIT-03 |
| **Priority** | High |
| **Type** | Manual SIT — Regression |
| **Requirement** | BRD §1.2 scope guard ("no functional changes to indexing accuracy"); O7; FSD §2.2 read-path contract |
| **Preconditions** | Pre-change baseline run results available (rule count, saved files, ingest summary) for the same project |

**Test Steps:**

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Run a full index (Project indexer) on the same project as baseline | Indexing completes without fatal errors |
| 2 | Compare counts vs pre-change baseline | Rules discovered/fetched/saved/ingested counts match baseline (±0 expected; only probe-related log volume decreases) |
| 3 | Spot-check saved rule files | `rules/{Class}/{Name}.pega.json` files exist and contain full rule JSON (no truncation change) |
| 4 | Capture evidence | Screenshot `evidence/SIT-03-index-summary.png` |

**Test Data:** Identical project/workspace as the baseline run.
**Postconditions:** Zero functional regression confirmed; TEST-REPORT regression section filled.

---

## 7. Requirements Traceability Matrix (RTM)

### 7.1 BRD Acceptance Criteria → Test Cases

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| AC-1.1 Dead endpoints removed from `getCustomRestPrefixes()` | BRD §2.3 Story 1 AC 1 | PBT-01, UT-01, E2E-API-01 | ✅ |
| AC-1.2 No 404 probes issued for `/api/v1` and `/PRRestService/v1` on Pega Academy | BRD §2.3 Story 1 AC 2 | IT-03, E2E-API-01, SIT-01 | ✅ |
| AC-1.3 SDLC documents created (BRD, FSD, TDD) | BRD §2.3 Story 1 AC 3 | Process artifact — BRD/FSD/TDD exist in `documents/SA4E-354/`; STP + STC (this document set) complete the set; verified at BA review gate | ✅ (process) |
| AC-2.1 `probeLatencyCache` implemented and populated on first probe | BRD §2.3 Story 2 AC 1 | UT-04, E2E-API-02 | ✅ |
| AC-2.2 Subsequent runs reuse cached latency (log "Latency probe cached") | BRD §2.3 Story 2 AC 2 | UT-05, E2E-API-02, SIT-02 | ✅ |
| AC-2.3 Duplicate rules/query calls reduced for same operator (16 → reduced) | BRD §2.3 Story 2 AC 3 | IT-01, E2E-API-03, SIT-02 | ✅ |
| AC-2.4 Memory ingestion completed | BRD §2.3 Story 2 AC 4 | Process artifact — QA ingests STP/STC into workspace KB after approval (`mem_ingest_file`) | ✅ (process) |

### 7.2 FSD Use Cases → Test Cases

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| UC-01 Remove dead endpoints from prefix resolution | FSD §3.1.2 | PBT-01, PBT-02, UT-01, UT-02, UT-03, UT-11, IT-03, E2E-API-01, SIT-01 | ✅ |
| UC-02 Cache latency probes per operator ID | FSD §3.2.2 | PBT-03, UT-04…UT-10, IT-01, IT-02, E2E-API-02, E2E-API-03, SIT-02 | ✅ |

### 7.3 FSD Business Rules → Test Cases

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| BR-01 Prefix list must not contain `${base}/api/v1` or `${base}/PRRestService/v1` | FSD §3.1.3 | PBT-01, UT-01, UT-02, E2E-API-01 | ✅ |
| BR-02 Prefix list contains only valid endpoints for 8b99ujcj | FSD §3.1.3 | PBT-02, UT-02, UT-03, IT-03 | ✅ |
| BR-03 Cache key = operator ID string, case-sensitive | FSD §3.2.3 | PBT-03, UT-06 | ✅ |
| BR-04 Subsequent calls for same operator reuse cached latency | FSD §3.2.3 | UT-05, IT-01, E2E-API-02 | ✅ |
| BR-05 Cache populated only on successful measurement | FSD §3.2.3 | UT-04 (success → populated), UT-08 (failure → not populated + retry) | ✅ |

### 7.4 FSD Flows & Error Scenarios → Test Cases

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| UC-01 AF-1 / EF-1 Empty prefix list → fail-loud error (spec-corrected per BA adjudication 2026-10-11) | FSD §3.1.2, §9.1 | UT-11 | ✅ |
| UC-02 AF-1 Cache hit → reuse cached latency | FSD §3.2.2 | UT-05, E2E-API-02 | ✅ |
| UC-02 AF-2 / EF-2 Measurement fails → no cache, default concurrency | FSD §3.2.2, §9.1 | UT-08 | ✅ |
| UC-02 EF-1 No operator configured → skip probe, default | FSD §3.2.2, §9.1 | UT-07 | ✅ |
| Sample-level getObject rejection (fail-safe probe, TDD §3.3 "2 attempts") | TDD §3.3 | UT-09 | ✅ |

### 7.5 FSD §10 Test Scenarios & TDD §11.2 E2E Design → Test Cases

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| FSD TC-01 Dead endpoints removed | FSD §10.1 | UT-01, PBT-01, E2E-API-01 | ✅ |
| FSD TC-02 No 404 probes | FSD §10.1 | E2E-API-01, SIT-01 | ✅ |
| FSD TC-03 Cache first probe | FSD §10.1 | UT-04, E2E-API-02 | ✅ |
| FSD TC-04 Cache hit reuse | FSD §10.1 | UT-05, E2E-API-02, SIT-02 | ✅ |
| FSD TC-05 Duplicate calls reduced | FSD §10.1 | IT-01, E2E-API-03, SIT-02 | ✅ |
| TDD TC-01 Dead endpoints removal (E2E) | TDD §11.2 | E2E-API-01 | ✅ |
| TDD TC-02 Latency cache hit (E2E) | TDD §11.2 | E2E-API-02 | ✅ |
| TDD TC-03 Duplicate probe reduction (E2E) | TDD §11.2 | IT-01 + E2E-API-03 | ✅ |

### 7.6 Non-Functional Requirements → Test Cases

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| NFR-P1 Reduce duplicate rules/query calls (16 → 1/session) | BRD §6, FSD §8 | IT-01, E2E-API-03, SIT-02 | ✅ |
| NFR-P2 Eliminate permanent 404 probes | BRD §6, FSD §8 | E2E-API-01, SIT-01 | ✅ |
| NFR-P3 Cached probe < 1ms (TDD §8.3) | TDD §8.3 | E2E-API-02 (zero-network proxy assertion) | ✅ |
| NFR-S1 Concurrency caps (maxServerConnections 15, totalItems) | TDD §8.2 | UT-10, IT-02 | ✅ |
| NFR-A1 No downtime / code-only change | BRD §6 | SIT-03 (indexing completes) | ✅ |

**Coverage Summary:**

| Category | Total | Covered | Coverage % |
|----------|-------|---------|------------|
| BRD Acceptance Criteria | 7 | 7 | 100% |
| FSD Use Cases | 2 | 2 | 100% |
| FSD Business Rules | 5 | 5 | 100% |
| FSD Flows / Error Scenarios | 5 | 5 | 100% |
| FSD §10 Scenarios + TDD §11.2 E2E | 8 | 8 | 100% |
| NFRs | 5 | 5 | 100% |
| **Overall** | **32** | **32** | **100%** |

**Reverse check:** every one of the 23 test cases traces to at least one requirement above (no orphan cases). UT-11 traces to FSD UC-01 AF-1/EF-1 and carries an explicit implementation-gap adjudication note.

---

## 8. Appendix

### 8.1 Test Data Setup Pattern (Vitest isolation for module-level cache)

```ts
// Required isolation pattern for every case touching PegaCrawlHelper:
beforeEach(() => { vi.resetModules(); vi.stubGlobal("fetch", fetchMock); });
async function loadHelper() { return await import("../services/PegaCrawlHelper"); }
// Sequence-persistence cases (UT-04/05, IT-01, E2E-API-02/03) call loadHelper()
// ONCE and reuse the registry across the sequence; all other cases reload per test.
```

Fixtures: `mockSecrets()` (see `pega-codeintel-discovery.test.ts`); `pegaClient` stub `{ getConfiguredUsername, getObject }`; scripted `fetch` per case's CSV row.

### 8.2 Test Data Files

| File | Test Cases Covered |
|------|--------------------|
| testdata/pre-seeded-data.csv | Environment constants used by all cases (base URLs, operators, valid/dead prefixes, defaults) |
| testdata/prefix-resolution-testdata.csv | PBT-01, PBT-02, UT-01, UT-02, UT-03, UT-11, IT-03, E2E-API-01, SIT-01, SIT-03 |
| testdata/latency-cache-testdata.csv | PBT-03, UT-04…UT-10, IT-01, IT-02, E2E-API-02, E2E-API-03, SIT-02 |

### 8.3 Environment Configuration (SIT)

```json
// VS Code settings.json (workspace)
{
  "sdlcAgents.pegaEndpoint": "https://8b99ujcj.pega.com/prweb",
  "sdlcAgents.pegaUsername": "SSA@TGB"
}
// Password: VS Code SecretStorage (workspace-scoped key), entered manually by QA.
```

Automated levels require NO network: `global.fetch` is stubbed; Pega Academy is only needed for SIT-01…SIT-03.

### 8.4 Evidence Directory

`documents/SA4E-354/evidence/` — QA stores SIT screenshots here during execution (`SIT-01-no-404-dead-endpoints.png`, `SIT-02-cached-probe-log.png`, `SIT-03-index-summary.png`).
