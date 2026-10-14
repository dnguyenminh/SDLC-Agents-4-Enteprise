# SA4E-360 — Fresh Test Execution Evidence Summary (2026-10-14)

Executed by: QA Agent — Phase 6 fresh execution (no reliance on prior reports).

## 1. Extension full suite — `cd extension && npm test` (vitest run)

```
 Test Files  298 passed (298)
      Tests  2896 passed (2896)
   Start at  12:13:53
   Duration  254.10s (transform 14.32s, setup 0ms, import 111.60s, tests 71.68s, environment 6.57s)
```

Result: 0 failed. Matches STP/PROGRESS-Wave3 expectation (~298 files / 2,896 tests).

## 2. Backend unit suite — `cd backend && npm test` (vitest run)

```
 Test Files  330 passed | 1 skipped (331)
      Tests  3461 passed | 19 skipped (3480)
   Duration  198.41s (transform 17.75s, setup 2.27s, import 61.80s, tests 58.36s, environment 22ms)
```

Result: 0 failed. Larger than the Wave-3 note (303 files / 3,319) — the suite grew with
post-Wave-3 tests (e.g., body-embeddings, indexing-engine-register migrations); the delta
is pre-existing + newly landed suites, none SA4E-360-scoped failures. The 1 skipped file /
19 skipped tests are environment-conditional (Testcontainers/Docker-optional) suites, none
in SA4E-360 scope.

## 3. Backend E2E-API suite — `npm run test:e2e-api` (real loopback server, vitest.e2e.config.ts)

```
[E2E Setup] Temp data dir: C:\Users\ASUS\AppData\Local\Temp\sa4e-e2e-momUt7
[E2E Setup] Using free port: 60317
[E2E Setup] Server ready on port 60317
 Test Files  8 passed (8)
      Tests  180 passed (180)
   Duration  38.90s
[E2E Teardown] Server stopped / temp dir cleaned
```

Result: 0 failed. Real server bootstrap SUCCEEDED in this environment (dynamic port,
isolated temp DB — production .code-intel/ untouched). The `git-miner` warning in the log
is a non-fatal background-feature log inside the isolated temp dir (not a git repo) and
affects no test.

## 4. Focused SA4E-360 suites (exact ticket-scoped counts)

### 4.1 Extension focused — `npx vitest run src/pi-workflow/skeleton/`

```
 Test Files  12 passed (12)
      Tests  88 passed (88)
   Duration  10.74s
```

Per-file breakdown (all ✓):

| File | Tests | STC coverage |
|------|-------|--------------|
| skeleton-truncator.test.ts | 9 | UT-01..05 |
| index-freshness-checker.test.ts | 7 | UT-06..10 |
| skeleton-provider.test.ts | 9 | UT-11..16 |
| read-method-tool.test.ts | 20 | UT-17..25 |
| functional-map-provider.test.ts | 5 | UT-26..29 |
| secret-redaction.test.ts | 9 | UT-30..34 |
| skeleton-truncator.property.test.ts | 6 | PBT-04..07, PBT-10 |
| skeleton-render.property.test.ts | 4 | PBT-08 |
| secret-redaction.property.test.ts | 3 | PBT-09 |
| skeleton-wiring.integration.test.ts | 8 | IT-01..03, IT-07..10 |
| read-method-chain.integration.test.ts | 6 | IT-04..06, IT-11, IT-12 |
| skeleton-agentic.e2e.test.ts | 2 | TC-360-01, TC-360-20 (FSD §10.1) |

### 4.2 Backend focused — code-locate-tool + code-extract + code-locate (QueryLayer)

```
 Test Files  3 passed (3)
      Tests  26 passed (26)
   Duration  1.07s
```

Covers T3/T5 unit scope: locateSymbol SQL semantics (exact match, enclosing-type scope,
tenant fail-closed, limit clamp, classMethods bounded-10, engine-agnostic adapter path),
SEC-360-05 sanitizeLikeQuery on findSymbols/listModulesWithPatterns, tool registrations.

### 4.3 Backend focused E2E — sa4e-360-tools.e2e.test.ts (real server)

```
 Test Files  1 passed (1)
      Tests  7 passed (7)
   Duration  5.27s
```

STC mapping: E2E-API-01 (tools/list), 02+03 (locate lifecycle: exact / ambiguous /
not_found+classMethods), 05 (extract happy path), 06+07 (fail-soft batch + backend
containment twin BV-03..07), 09 (tenant isolation), 11 (LIKE sanitize), 12 (p95 ≤ 300 ms).

## 5. Governance regression (SA4E-355 baseline) — gate per STP §2.2

Focused governance+context run (`npx vitest run src/pi-agent/ src/pi-workflow/skeleton/`):

```
 Test Files  81 passed (81)
      Tests  610 passed (610)
   Duration  31.15s
```

Includes (all ✓): context-budget-resolver PBT spot anchors (32768 → {2622, 19668, 8430}),
STC-111 65k oracle (65536 → {5243, 40771, 17474}), PiAgentSessionHost conditional
compression wiring (SA4E-355 Task 3), SessionTier boundary matrix (Task 6), identity
passthrough contract — governance plane UNTOUCHED, SA4E-360 identity-passthrough behavior
preserved when sections are degraded/empty.

## 6. Security test names (evidence for SEC-360-01..07)

From verbose run (sa4e360-focused-ext-verbose.log), all ✓:

- **SEC-360-01**: PBT-09 ×3 (completeness, no-over-redaction, idempotent);
  redactSecretLike deny-list families + case-insensitive assignments;
  isSecretFileName exclusion ×2; UT-32/UT-33 secret-in-signature / secret-in-RAW_HEAD.
- **SEC-360-02**: PBT-10 ×2 ("measuredSoFar never exceeds cap at any file boundary;
  measure calls stay O(parts)" + "completes 150 RAW_HEAD-class parts well under 1s").
- **SEC-360-03 (#2)**: UT-10 "blocks repeat re-index calls within the 30s cooldown window".
- **SEC-360-04**: UT-24 (absolute-outside → zero bytes read; dotdot rejected; control
  resolves) + E2E-API-06/07 fail-soft hostile paths (absolute, null-byte, UNC, dotdot
  → skipped[], only control file contributes signatures).
- **SEC-360-05**: E2E-API-11 "treats % literally; clean prefixes preserved" +
  QueryLayer UT (name=% stays literal, no wildcard escalation).
- **SEC-360-06**: UT-25 "5000-line symbol → ok, sliceTruncated, totalLines 5000,
  ≤ 2000 lines read".
- **SEC-360-07**: stripControlChars ×3 (U+200B/U+202E/C0 stripped; legit identifiers
  unaffected; end-to-end sanitizeCodeText).

## 7. Metrics (M1–M6) automated evidence

| Metric | Target | Automated evidence | Result |
|--------|--------|--------------------|--------|
| M1 skeleton coverage | ≥ 95% | IT-12 (real corpus query, fixture 20 exported symbols) | ✓ ≥ 95% |
| M2 hit-rate top-5 | ≥ 80% | IT-11 golden set 12 queries (11 ok + 1 designed miss = 91.7%) | ✓ 91.7% |
| M4 locate p95 | ≤ 300 ms | E2E-API-12 real server | ✓ ≤ 300 ms |
| M5 zero overflow | 0 × exceed | TC-360-01 @32k + TC-360-20 multi-turn + IT-03/IT-05 | ✓ 0 exceed |
| M6 skeleton share | ≤ 70% staticBudget | PBT-07 + IT-02 (13,767/19,668 = 0.70 @32k) | ✓ ≤ 0.70 |
| M3 findings parity | ≥ 80% | SIT-06 (manual — NOT RUN, requires llama-server) | NOT RUN |
