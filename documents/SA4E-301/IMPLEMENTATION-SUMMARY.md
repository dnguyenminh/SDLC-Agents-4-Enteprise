# SA4E-301 — Implementation Summary: prefer-local-on-checksum-match

## Scope
Added `kiroSdlc.pega.preferLocalOnChecksumMatch` (boolean, default **true**, Pega workspace only). When enabled, the Pega BFS index run resolves each rule from the local workspace **BEFORE** the `getRuleByInsKey` network call; a local file whose `computePegaChecksum` (3-field sha256) matches the catalog checksum is served locally — the network download is skipped. Any miss (file missing / unreadable / invalid JSON / missing identity fields / checksum mismatch) falls back to the standard download path. Setting OFF → behavior identical to pre-SA4E-301.

## Files Created
- `extension/src/models/PegaLocalRuleModels.ts` — zod schemas (`LocalRuleJsonSchema` with pzInsKey + ≥1 timestamp refine + passthrough, `RuleManifestSchema` for `rules/.manifest.json`), discriminated result types (`LocalRuleHit` / `LocalRuleMiss` / `LocalRuleResult`), `MANIFEST_RELATIVE_PATH`. Re-exported from `models/index.ts`.
- `extension/src/services/PegaLocalRuleResolver.ts` — `readRuleManifest` (tolerant async read → `{}` on missing/corrupt), `resolveLocalRulePath` (manifest-first, stale-entry falls through, fallback = standard safeClass/safeName derivation), `readLocalRuleIfChecksumMatches` (read → zod validate → 3-field checksum on local rule → case-normalized compare; never throws for expected failures; empty catalog checksum = miss).
- `extension/src/services/__tests__/PegaLocalRuleResolver.test.ts` — TC-UT-06..11 (checksum vector verified against documented `33c2f8d9…`, computed in-test with node crypto; manifest valid-2-entries / missing / corrupt / stale-entry; uppercase-compare; empty-checksum miss). Real temp fs.
- `extension/src/services/__tests__/PegaBfsIndexer.preferLocalConfig.test.ts` — TC-UT-01..05 (package.json declaration parse; config-read default-true/false/explicit; per-workspace scoping via `kiroSdlc` section).
- `extension/src/services/__tests__/PegaBfsIndexer.preferLocal.it.test.ts` — TC-IT-01..12 with REAL temp filesystem + real pipeline; HTTP boundary spied (counted `PegaHttpClient` mock + spy on real `PegaStreamIngester.ingestSingleRule`): warm-cache 0-network, stale-mismatch fallback (stale never ingested), new rule, corrupt JSON, missing-3-fields, EACCES (chmod-when-platform-allows, skip-with-warning on win32), setting-OFF, telemetry line, manifest-written-on-save, mixed batch counts, derivation-difference (manifest lookup robust), INV-1 3-field checksum to ingest.

## Files Modified
- `extension/package.json` — new setting `kiroSdlc.pega.preferLocalOnChecksumMatch` beside `kiroSdlc.pega.useCatalogExport` (boolean, default true, English description).
- `extension/src/services/PegaCrawlHelper.ts` — extracted `sanitizePegaClass` / `sanitizePegaName` (exported, canonical) + private `resolveRuleName`; `saveRuleFile` now calls `updateRuleManifest` after the file write.
- `extension/src/services/PegaBfsPipeline.ts` — `FetchedRule.source?: "local" | "downloaded"`, `BfsCounters.localServed/downloaded`, `PipelineOptions.resolveLocalBeforeFetch` hook; supplier consults the resolver per item before the network fetch (`serveLocally`, throws → miss, fail-safe); drain counts by source.
- `extension/src/services/PegaBfsIndexer.ts` — `readPipelineConfig` (exported) gains `preferLocalOnChecksumMatch` (default true); `BfsIndexResult` gains `localServed/downloaded`; `run()` wires the resolver hook only when the setting is ON; `resolveLocalForItem` + `logTelemetry` helpers; summary + Output channel line `🏛️ Pega: N rules — X from local cache, Y downloaded`.
- `extension/src/services/PegaCatalogIndexer.ts` — `CatalogIndexResult` gains `localServed/downloaded`; telemetry propagated to the final summary/output channel (`[Catalog] 🏛️ Pega: …`).
- `extension/src/models/index.ts` — re-exports of the new models.

## Key Decisions
1. **Local check placement — pipeline supplier, not `ingestOne`.** The actual `getRuleByInsKey` network call lives in `PegaCrawlHelper.fetchRulesInParallel` (invoked by `PegaBfsPipeline.supply`), not in `ingestOne` which already receives fetched rules. Placing the resolver hook at supply time is the only placement where a checksum match genuinely skips the network (required by TC-IT-01 "0 network calls"). The logic stays inside `PegaBfsIndexer` (`resolveLocalForItem`) per the TDD's class design.
2. **Checksum invariant INV-1 preserved.** The checksum sent to ingest is always the 3-field `computePegaChecksum`: for local-served rules the catalog checksum (verified equal to the local rule's own 3-field hash, case-normalized); for downloaded rules the catalog/interpolated checksum as before.
3. **Fail-safe.** Empty catalog checksum → miss (cannot prove match); resolver throws → miss; manifest write failure → warning only; corrupt/stale manifest → derivation fallback; stale local content is NEVER ingested.
4. **Manifest format**: `rules/.manifest.json` = flat `{pzInsKey: relativePath}` (forward slashes, OS-agnostic), zod-validated, self-healing on corrupt content, written idempotently by `saveRuleFile`.
5. **IT test dedup set**: constructs the pure `DiskBackedSet` directly — `createPegaDedupSet` uses a lazy `require('vscode')` that vitest aliases don't intercept at runtime.

## Verification
- `npm run compile` (tsc, extension/): ✅ PASS
- `npm test` (vitest, extension/): ✅ PASS — 172 files, **1824 tests passed**, 3 skipped (pre-existing), 21 todo
- `npx eslint` on all changed files: ✅ 0 errors (test files ignored by eslint config per existing pattern)
- New tests: 25 (7 resolver UT + 5 config UT + 1 extra checksum-sensitivity + 12 IT)
