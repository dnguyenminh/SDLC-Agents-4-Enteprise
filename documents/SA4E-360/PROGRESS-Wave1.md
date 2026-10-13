# SA4E-360 — Wave 1 Progress (T1-T2 + security helpers)

**Date:** 2026-10-14 · **Status:** DONE · **Commit:** see git log `SA4E-360: Wave 1`

## State: DONE

### Tasks completed
- **T1** — `skeleton-types.ts` (contracts C-360-S1), `skeleton-truncator.ts`
  (module-priority drop, incremental O(parts) accounting — SEC-360-02 #2,
  500-drop hard cap — SEC-360-02 #3, REJECT/DEGRADED semantics per TRC-04/05).
- **T1 security** — `secret-redaction.ts` (redactSecretLike deny-list —
  SEC-360-01 #1; stripControlChars — SEC-360-07; isSecretFileName exclusion —
  SEC-360-01 #2), `skeleton-renderer.ts` (renderCorpusWithGlobalBudget —
  SEC-360-02 #1 remaining-global-budget; sanitizeSignatureLine — redact BEFORE
  trimSignature; sanitizeRawHead — redaction inside token trim).
  `symbol-outline-extractor.ts`: exported `trimSignature` (additive only).
- **T2** — `index-freshness-checker.ts` (stat→hash→reindex ladder,
  retry-once, 30s cooldown — SEC-360-03 #2, never throws).

### Tests (38 new, all green)
- UT-01..05 (truncator), UT-06..10 (freshness), UT-30/UT-31/UT-34 (redaction)
- PBT-04..07 (truncation properties), PBT-08 (signature normalization),
  PBT-09 (redaction completeness), PBT-10 (global incremental budget + O(parts))
- Full extension suite: **2,846 passed / 0 failed**

### Files created
- extension/src/pi-workflow/skeleton/skeleton-types.ts
- extension/src/pi-workflow/skeleton/skeleton-truncator.ts
- extension/src/pi-workflow/skeleton/skeleton-renderer.ts
- extension/src/pi-workflow/skeleton/secret-redaction.ts
- extension/src/pi-workflow/skeleton/index-freshness-checker.ts
- extension/src/pi-workflow/skeleton/__tests__/{skeleton-truncator,secret-redaction,index-freshness-checker}.test.ts
- extension/src/pi-workflow/skeleton/__tests__/{skeleton-truncator,secret-redaction,skeleton-render}.property.test.ts

### Files modified
- extension/src/pi-agent/context-retrieval/symbol-outline-extractor.ts (+export trimSignature)

## Remaining (next waves)
- **Wave 2** — T3 (QueryLayer.locateSymbol + code_symbol_locate + sanitizeLikeQuery SEC-360-05),
  T4 (SymbolLocator + read-method-tool C-360-R1/R2 + MAX_SLICE SEC-360-06),
  T5 (code_extract_signatures + backend containment twin SEC-360-04),
  T6 (SkeletonProvider: corpus, fallback ladder, OI-2 fingerprint cache, secret-file exclusion).
- **Wave 3** — T7 (FunctionalMapProvider + workspace-info-tool extension),
  T8 (createHost wire deltas ①-⑦, READ_ONLY_TOOLS, adapter bridge DI),
  T9 (E2E: skeleton-agentic + read-method-chain IT + backend E2E-API suite).

## Next session entry point
Run Wave 2 backend work first: `backend/src/engine/query/query-layer.ts` +locateSymbol,
then `tools/code-locate.ts`, `tools/code-extract.ts`, register-tools wiring.
