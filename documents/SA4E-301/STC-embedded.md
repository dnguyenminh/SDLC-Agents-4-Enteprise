# Software Test Cases (STC) — SA4E-301

## 1. Document Information

| Field | Value |
|-------|-------|
| **Jira Ticket** | SA4E-301 |
| **Author** | QA Agent |
| **Version** | 1.0 |
| **Date** | 2026-09-19 |
| **Status** | Draft |

## 2. Author Tracking

| Role | Name |
|------|------|
| **Author** | QA Agent |
| **Peer Reviewer** | SM Agent |

## 3. Revision History

| Version | Date | Author | Description |
|---------|------|--------|-------------|
| 1.0 | 2026-09-19 | QA Agent | Initial release |

## 4. Sign-Off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| **QA Lead** | QA Agent | __________ | __________ |
| **Scrum Master** | SM Agent | __________ | __________ |

## 5. Test Case ID Convention & Feature Context

> **ID Format:** `TC-{LEVEL}-xx` — LEVEL ∈ {PBT, UT, IT, E2E-API, E2E-CLI, SIT}.
>
> **Feature Context:** Extension indexer option `kiroSdlc.pega.preferLocalOnChecksumMatch` (boolean, default `true`) — local-first rule fetch when the 3-field checksum `sha256(trim(pzInsKey)+"\|"+trim(pxUpdateDateTime)+"\|"+trim(pxSaveDateTime))` matches the catalog; fallback download otherwise; fail-safe — never ingest on mismatch; telemetry counts local-cache hits vs downloads.

## 6. PBT Group (Property-Based Tests) — 6 cases

| ID | Title | Priority | Related AC | Preconditions | Steps | Test Data | Expected Result |
|----|-------|----------|------------|---------------|-------|-----------|-----------------|
| TC-PBT-01 | Checksum determinism — same 3 fields produce identical hash | P1 | AC-4, INV-1 | Checksum function importable; fixture fields defined | 1. Build fixture from 3 fixed fields<br>2. Compute checksum — invocation #1<br>3. Compute checksum — invocation #2 on identical input<br>4. Assert both outputs identical and equal expected checksum | pzInsKey `RULE-OBJ-ACTIVITY WORK- CLAIMCREATE!ACTION`; pxUpdateDateTime `20260919T100000.000 GMT`; pxSaveDateTime `20260919T100000.000 GMT`; expected `33c2f8d923379eefc13669e173a426e88386c6751f2c0a904416cd8e8f7b7f40` (from catalog-rows.csv) | Identical checksum on every invocation; equals `33c2f8d923379eefc13669e173a426e88386c6751f2c0a904416cd8e8f7b7f40` |
| TC-PBT-02 | 3-field formula exactness — hash = sha256 of exactly pzInsKey\|pxUpdateDateTime\|pxSaveDateTime joined by "\|", nothing else | P1 | AC-4 | Reference sha256 implementation available; checksum function available | 1. Build joined string: trim(pzInsKey)+"\|"+trim(pxUpdateDateTime)+"\|"+trim(pxSaveDateTime)<br>2. Compute reference sha256 hex digest of that exact string<br>3. Compute checksum via function under test<br>4. Assert equality; assert no extra field, seed, or salt influences digest | Same fixture as TC-PBT-01; expected `33c2f8d923379eefc13669e173a426e88386c6751f2c0a904416cd8e8f7b7f40` | Function digest matches reference sha256 of the exact joined string; no additional input affects the hash |
| TC-PBT-03 | Whitespace-trim — leading/trailing spaces in the 3 fields trimmed before hashing | P1 | AC-4 | Checksum function available; padded fixture prepared | 1. Create padded fixture with leading/trailing spaces on all 3 fields<br>2. Compute checksum on padded fields<br>3. Compute checksum on trimmed fields<br>4. Assert both digests identical and equal expected | padded ` RULE-OBJ-ACTIVITY WORK- CLAIMCREATE!ACTION ` + ` 20260919T100000.000 GMT ` (both dates padded); trimmed = unpadded versions; expected `33c2f8d923379eefc13669e173a426e88386c6751f2c0a904416cd8e8f7b7f40` | Padded input hashes identical to trimmed input — trim applied before hashing |
| TC-PBT-04 | Lowercase hex output only | P2 | AC-4 | Checksum function available | 1. Compute checksum on fixture<br>2. Assert output matches /^[0-9a-f]{64}$/<br>3. Assert no uppercase A–F characters present | Same fixture as TC-PBT-01; expected `33c2f8d923379eefc13669e173a426e88386c6751f2c0a904416cd8e8f7b7f40` | Output is a 64-character lowercase hex string |
| TC-PBT-05 | Field-order sensitivity — different order produces different hash | P2 | AC-4 | Checksum function available | 1. Compute checksum with order pzInsKey\|pxUpdateDateTime\|pxSaveDateTime<br>2. Compute with reordered fields pxUpdateDateTime\|pxInsKey\|pxSaveDateTime<br>3. Assert the two digests differ | Same fixture as TC-PBT-01; baseline `33c2f8d923379eefc13669e173a426e88386c6751f2c0a904416cd8e8f7b7f40` | Reordered fields yield a different digest — field order is significant |
| TC-PBT-06 | INV-1 — checksum of local rule equals checksum compared against catalogRow | P1 | AC-4 | Local rule fixture + catalogRow loaded; checksum function available | 1. Load local rule fixture; extract 3 fields<br>2. Compute checksum from local fields<br>3. Compare against catalogRow checksum value<br>4. Assert equality — invariant holds for matched rule | pzInsKey `RULE-OBJ-ACTIVITY WORK- CLAIMCREATE!ACTION`; pxUpdateDateTime/pxSaveDateTime `20260919T100000.000 GMT`; catalogRow checksum `33c2f8d923379eefc13669e173a426e88386c6751f2c0a904416cd8e8f7b7f40` | Computed checksum equals catalogRow checksum — local rule is current versus catalog |

## 7. UT Group (Unit Tests) — 11 cases

| ID | Title | Priority | Related AC | Preconditions | Steps | Test Data | Expected Result |
|----|-------|----------|------------|---------------|-------|-----------|-----------------|
| TC-UT-01 | Config declaration — `kiroSdlc.pega.preferLocalOnChecksumMatch` present in extension/package.json contributions | P1 | AC-1 | extension/package.json readable; contributions parsed | 1. Parse extension/package.json<br>2. Locate `kiroSdlc.pega.preferLocalOnChecksumMatch` under contributes.configuration<br>3. Assert type=boolean, default=true, description non-empty | property key `kiroSdlc.pega.preferLocalOnChecksumMatch` | Declaration exists: type boolean, default true, non-empty description |
| TC-UT-02 | Config read returns true when key absent | P1 | BR-1 | Workspace configuration available without the key | 1. Create workspace config WITHOUT `kiroSdlc.pega.preferLocalOnChecksumMatch`<br>2. Read setting via config reader<br>3. Assert returned value is true (default applied) | key absent; expected value `true` | true returned — default true applied |
| TC-UT-03 | Config read returns false when set to false | P1 | AC-5 | Workspace configuration with key set | 1. Set `kiroSdlc.pega.preferLocalOnChecksumMatch` = false in workspace config<br>2. Read setting via config reader<br>3. Assert returned value is false | key = `false` | false returned — local-first disabled |
| TC-UT-04 | Config read returns true when explicitly set | P2 | AC-1 | Workspace configuration with key set | 1. Set `kiroSdlc.pega.preferLocalOnChecksumMatch` = true explicitly<br>2. Read setting via config reader<br>3. Assert returned value is true | key = `true` | true returned |
| TC-UT-05 | Config per-workspace scoping | P2 | BR-1 | Two workspace configurations available | 1. Set key=false in workspace A; leave workspace B unset (default)<br>2. Read setting from workspace A<br>3. Read setting from workspace B<br>4. Assert isolation — no cross-workspace leakage | workspace A key=`false`; workspace B key absent | A returns false, B returns true — per-workspace scoping respected |
| TC-UT-06 | Resolver checksum computation unit | P1 | AC-4 | Resolver module importable; fixture fields defined | 1. Call resolver checksum computation with fixture fields<br>2. Compare against expected digest<br>3. Assert equality | pzInsKey `RULE-OBJ-ACTIVITY WORK- CLAIMCREATE!ACTION`; dates `20260919T100000.000 GMT`; expected `33c2f8d923379eefc13669e173a426e88386c6751f2c0a904416cd8e8f7b7f40` | Digest equals expected checksum |
| TC-UT-07 | Manifest valid — 2 entries resolved | P1 | AC-8 | Temp FS with valid manifest containing 2 entries | 1. Write manifest with 2 valid pzInsKey→relativePath entries<br>2. Run manifest lookup for both keys<br>3. Assert both resolve to correct relativePaths | entry 1 `RULE-OBJ-ACTIVITY WORK- CLAIMCREATE!ACTION`→`rules/Rule-Obj-Activity/ClaimCreate.pega.json`; entry 2 `RULE-OBJ-FLOW WORK- CLAIM!PROCESS`→`rules/Rule-Obj-Flow/ClaimProcess.pega.json` | 2/2 entries resolved to correct relativePaths |
| TC-UT-08 | Manifest missing → fallback to standard derivation, no crash | P1 | AC-8 | Temp FS without manifest file | 1. Ensure manifest file absent<br>2. Run lookup for pzInsKey<br>3. Assert fallback to standard filename derivation used<br>4. Assert no exception thrown | pzInsKey `RULE-OBJ-ACTIVITY WORK- CLAIMCREATE!ACTION` | Fallback derivation path computed; no crash |
| TC-UT-09 | Manifest corrupt → zod error → fallback | P1 | AC-8 | Temp FS with invalid JSON manifest | 1. Write invalid JSON to manifest<br>2. Run lookup<br>3. Assert zod parse error caught internally<br>4. Assert fallback applied; no crash | manifest content `{ invalid-json !!` | Fallback used; no crash |
| TC-UT-10 | Manifest stale-entry → fallback download | P1 | AC-8 | Temp FS with manifest containing stale entry | 1. Write manifest with stale entry (old pxUpdateDateTime `20260101T080000.000 GMT`)<br>2. Run lookup with catalog entry newer (`20260919T153000.000 GMT`)<br>3. Assert fallback download triggered | stale local date `20260101T080000.000 GMT`; catalog date `20260919T153000.000 GMT` | Fallback download triggered for stale entry |
| TC-UT-11 | Uppercase-checksum-compare — case-insensitive comparison | P2 | AC-4 | Catalog row with uppercase-hex checksum variant of same digest | 1. Compute checksum on fixture (lowercase output)<br>2. Compare with catalog row storing same digest in uppercase<br>3. Assert comparison normalizes case and matches | fixture digest `33c2f8d923379eefc13669e173a426e88386c6751f2c0a904416cd8e8f7b7f40`; catalog row uppercase `33C2F8D923379EEFC13669E173A426E88386C6751F2C0A904416CD8E8F7B7F40` | Comparison matches — case normalization applied |

## 8. IT Group (Integration Tests) — 12 cases

> **Technique:** REAL temp filesystem + HTTP transport spy (NO all-mock). Local rule files are written to a real temp directory; the HTTP client is wrapped in a spy to count `getRuleByInsKey` calls.

| ID | Title | Priority | Related AC | Preconditions | Steps | Test Data | Expected Result |
|----|-------|----------|------------|---------------|-------|-----------|-----------------|
| TC-IT-01 | Warm-cache match — local file exists + catalog match → 0 getRuleByInsKey calls, local served | P1 | AC-2 | Temp FS seeded with local rule file matching catalog checksum; setting ON; HTTP spy attached | 1. Seed temp FS with local file at relativePath matching catalog (checksum `33c2f8d923379eefc13669e173a426e88386c6751f2c0a904416cd8e8f7b7f40`)<br>2. Run rule fetch for pzInsKey<br>3. Inspect HTTP spy — count `getRuleByInsKey` calls<br>4. Assert 0 remote calls; rule content served from local file | pzInsKey `RULE-OBJ-ACTIVITY WORK- CLAIMCREATE!ACTION`; relativePath `rules/Rule-Obj-Activity/ClaimCreate.pega.json`; catalog checksum `33c2f8d923379eefc13669e173a426e88386c6751f2c0a904416cd8e8f7b7f40` | 0 `getRuleByInsKey` calls; local rule served |
| TC-IT-02 | Stale-rule mismatch — local dates old vs catalog updated → fallback download + warning, never ingest stale | P1 | AC-3, AC-7 | Temp FS seeded with local file having OLD dates; catalog has updated entry; setting ON; HTTP spy attached | 1. Seed local file with pxUpdateDateTime/pxSaveDateTime `20260101T080000.000 GMT`<br>2. Catalog entry updated: dates `20260919T153000.000 GMT`, checksum `695c02b4f8a5d9c0c075d06d3a8db949f17835ba6d4675b49ce08680e5cb6833`<br>3. Run rule fetch for pzInsKey<br>4. Assert fallback download occurred and warning logged<br>5. Assert stale local rule NEVER ingested | pzInsKey `RULE-OBJ-ACTIVITY WORK- CLAIMCREATE!ACTION`; local dates `20260101T080000.000 GMT`; catalog dates `20260919T153000.000 GMT`; catalog checksum `695c02b4f8a5d9c0c075d06d3a8db949f17835ba6d4675b49ce08680e5cb6833` | Fallback download + warning; stale local rule not ingested |
| TC-IT-03 | New rule — no local file → fallback download | P1 | AC-3 | Temp FS empty (no local file); catalog contains rule; setting ON | 1. Ensure temp FS has no local file for pzInsKey<br>2. Run rule fetch<br>3. Assert fallback download triggered<br>4. Assert rule ingested from downloaded content | pzInsKey `RULE-OBJ-ACTIVITY WORK- CLAIMCREATE!ACTION` (absent locally) | Fallback download; rule ingested from download |
| TC-IT-04 | Corrupt local JSON → zod parse error → fallback download, no crash | P1 | AC-7 | Temp FS seeded with invalid JSON at expected relativePath; setting ON | 1. Write invalid JSON (`{ not-valid !!`) to local rule file<br>2. Run rule fetch<br>3. Assert zod parse error caught internally<br>4. Assert fallback download; process does not crash | relativePath `rules/Rule-Obj-Activity/ClaimCreate.pega.json`; corrupt content `{ not-valid !!` | Fallback download; no crash |
| TC-IT-05 | Missing 3 fields in local rule → checksum not computable → fallback | P1 | AC-7 | Temp FS seeded with local JSON missing one of the 3 checksum fields; setting ON | 1. Write local JSON omitting pxSaveDateTime<br>2. Run rule fetch<br>3. Assert checksum not computable from local fields<br>4. Assert fallback download; incomplete local rule never ingested | local JSON with pxInsKey + pxUpdateDateTime only (pxSaveDateTime absent) | Fallback download; incomplete local not ingested |
| TC-IT-06 | EACCES read error → fallback download | P2 | AC-7 | Temp FS seeded with local file; read permission denied (EACCES); setting ON | 1. Deny read permission on local rule file<br>2. Run rule fetch<br>3. Assert read error caught (EACCES)<br>4. Assert fallback download; no crash | relativePath `rules/Rule-Obj-Activity/ClaimCreate.pega.json` (EACCES denied) | Fallback download; no crash |
| TC-IT-07 | Setting OFF → always download, identical to current | P1 | AC-5 | Temp FS seeded with local file MATCHING catalog; setting set false; HTTP spy attached | 1. Set `kiroSdlc.pega.preferLocalOnChecksumMatch` = false<br>2. Seed local file matching catalog checksum<br>3. Run rule fetch<br>4. Assert `getRuleByInsKey` called (always download)<br>5. Assert downloaded content identical to current | key = `false`; catalog checksum `33c2f8d923379eefc13669e173a426e88386c6751f2c0a904416cd8e8f7b7f40` | Always download; content identical to current |
| TC-IT-08 | Warm-cache telemetry — summary + Output line | P1 | AC-6 | Warm-cache batch run completed with known mix (2 local + 1 downloaded) | 1. Run warm-cache batch: 2 rules matched locally, 1 downloaded<br>2. Read summary log output<br>3. Assert telemetry line matches `🏛️ Pega: N rules — X from local cache, Y downloaded` | N=3, X=2, Y=1 | Output exactly `🏛️ Pega: 3 rules — 2 from local cache, 1 downloaded` |
| TC-IT-09 | Manifest written on save — saveRuleFile writes rules/.manifest.json pzInsKey→relativePath | P1 | AC-8 | Temp FS ready; saveRuleFile callable | 1. Call saveRuleFile for a fetched rule<br>2. Read `rules/.manifest.json` from temp FS<br>3. Assert entry pzInsKey→relativePath present and correct | pzInsKey `RULE-OBJ-ACTIVITY WORK- CLAIMCREATE!ACTION`; relativePath `rules/Rule-Obj-Activity/ClaimCreate.pega.json` | `rules/.manifest.json` contains correct pzInsKey→relativePath mapping |
| TC-IT-10 | Warm-cache batch — mixed counts correct | P1 | AC-2, AC-6 | Temp FS seeded: 1 matched local, 1 stale local, 1 missing; setting ON | 1. Seed batch: rule A matched local, rule B stale local, rule C missing<br>2. Run warm-cache batch<br>3. Assert counts: 1 from local cache, 2 downloaded<br>4. Assert telemetry reflects counts | rule A: `RULE-OBJ-ACTIVITY WORK- CLAIMCREATE!ACTION` (match); rule B: stale (`20260101T080000.000 GMT`); rule C: absent locally | Counts correct: 1 local, 2 downloaded; telemetry matches |
| TC-IT-11 | Derivation difference — catalog filename derivation ≠ fetched-rule derivation → manifest lookup robust | P1 | AC-8 | Catalog filename derivation differs from fetched-rule derivation; local file seeded at fetched-rule path; manifest maps pzInsKey | 1. Configure catalog with different filename derivation convention<br>2. Seed local file at fetched-rule derivation path; manifest maps pzInsKey to it<br>3. Run rule fetch<br>4. Assert manifest lookup (not derivation) finds local file; local served | pzInsKey `RULE-OBJ-ACTIVITY WORK- CLAIMCREATE!ACTION`; relativePath `rules/Rule-Obj-Activity/ClaimCreate.pega.json` | Manifest lookup robust — local served despite derivation mismatch |
| TC-IT-12 | Warm-cache end-state — ingestSingleRule called with correct 3-field checksum from local | P1 | AC-4 | Temp FS seeded with matched local rule; ingest spy attached; setting ON | 1. Run warm-cache for matched local rule<br>2. Inspect `ingestSingleRule` call arguments<br>3. Assert 3-field checksum passed equals checksum computed from local file fields | pzInsKey `RULE-OBJ-ACTIVITY WORK- CLAIMCREATE!ACTION`; local dates `20260919T100000.000 GMT`; expected `33c2f8d923379eefc13669e173a426e88386c6751f2c0a904416cd8e8f7b7f40` | `ingestSingleRule` called with correct 3-field checksum from local |

## 9. E2E-API Group — 4 cases

| ID | Title | Priority | Related AC | Preconditions | Steps | Test Data | Expected Result |
|----|-------|----------|------------|---------------|-------|-----------|-----------------|
| TC-E2E-API-01 | Local-hit full lifecycle vs ingest API | P1 | AC-2, AC-4 | Local cache seeded with rule matching catalog; ingest API reachable | 1. Seed local cache with matched rule<br>2. Trigger indexer ingest against ingest API<br>3. Assert lifecycle completes using local rule (no download)<br>4. Assert payload checksum = local 3-field sha256 | catalog checksum `33c2f8d923379eefc13669e173a426e88386c6751f2c0a904416cd8e8f7b7f40` | Lifecycle completes from local; payload checksum = `33c2f8d923379eefc13669e173a426e88386c6751f2c0a904416cd8e8f7b7f40` |
| TC-E2E-API-02 | Local-miss fallback vs ingest API | P1 | AC-3 | Empty local cache; catalog contains rule; ingest API reachable | 1. Ensure local cache empty<br>2. Trigger indexer ingest against ingest API<br>3. Assert fallback download used<br>4. Assert rule ingested from downloaded content | pzInsKey `RULE-OBJ-ACTIVITY WORK- CLAIMCREATE!ACTION` (absent locally) | Fallback download; ingest succeeds |
| TC-E2E-API-03 | Mixed batch — local hits + misses + telemetry | P1 | AC-2, AC-3, AC-6 | Batch of rules: 1 local hit, 1 local miss; ingest API reachable | 1. Seed batch: rule A local hit, rule B local miss<br>2. Trigger batch ingest against ingest API<br>3. Assert rule A served from local, rule B downloaded<br>4. Assert telemetry counts reflect mix | rule A: `RULE-OBJ-ACTIVITY WORK- CLAIMCREATE!ACTION` (local hit); rule B: local miss | 1 local + 1 downloaded; telemetry correct |
| TC-E2E-API-04 | INV-1 end-to-end — ingest payload checksum = 3-field sha256 | P1 | AC-4, INV-1 | Indexer + ingest API running | 1. Capture ingest API payload<br>2. Recompute 3-field sha256 from payload pzInsKey/pxUpdateDateTime/pxSaveDateTime<br>3. Assert payload checksum equals recomputed value | expected formula: sha256(trim(pzInsKey)+"\|"+trim(pxUpdateDateTime)+"\|"+trim(pxSaveDateTime)) | Payload checksum = 3-field sha256 of payload fields |

## 10. E2E-CLI Group — 2 cases

| ID | Title | Priority | Related AC | Preconditions | Steps | Test Data | Expected Result |
|----|-------|----------|------------|---------------|-------|-----------|-----------------|
| TC-E2E-CLI-01 | kiroSdlc.indexWorkspace ON — completes, summary logged | P1 | AC-6 | Extension built; workspace with Pega rules; setting ON (default) | 1. Run `kiroSdlc.indexWorkspace` with setting ON<br>2. Wait for completion<br>3. Assert command completes without error<br>4. Assert summary logged (counts local vs downloaded) | setting = `true` | Command completes; summary with local/downloaded counts logged |
| TC-E2E-CLI-02 | kiroSdlc.indexWorkspace OFF — identical to current | P1 | AC-5 | Extension built; workspace with Pega rules; setting false | 1. Set `kiroSdlc.pega.preferLocalOnChecksumMatch` = false<br>2. Run `kiroSdlc.indexWorkspace`<br>3. Assert behavior identical to current (always download)<br>4. Assert no local-first path taken | setting = `false` | Identical to current behavior — always download |

## 11. SIT Group (Manual System Integration Tests) — 4 cases

| ID | Title | Priority | Related AC | Preconditions | Steps | Test Data | Expected Result |
|----|-------|----------|------------|---------------|-------|-----------|-----------------|
| TC-SIT-01 | Full index — warm cache: counts + no-regression | P1 | AC-2, AC-3, AC-6 | Workspace pre-indexed (warm cache present); extension installed | 1. Run full `kiroSdlc.indexWorkspace` on warm cache<br>2. Observe telemetry counts<br>3. Compare counts against expected majority-local split<br>4. Verify no regression vs baseline indexing results | warm cache present; expected: majority from local cache | Majority of rules served from local cache; counts consistent; no regression |
| TC-SIT-02 | Full index — cold cache: fallback path | P1 | AC-3 | Workspace WITHOUT cache (cold); extension installed | 1. Clear local cache<br>2. Run full `kiroSdlc.indexWorkspace`<br>3. Observe all rules downloaded (fallback path)<br>4. Verify index completes successfully | cold cache (empty local) | All rules downloaded via fallback; index completes |
| TC-SIT-03 | Build + tests pass in extension/ | P1 | AC-9 | extension/ dependencies installed | 1. Run `npm run build` in extension/<br>2. Run `npm test` in extension/<br>3. Assert build succeeds with no errors<br>4. Assert all tests pass | commands: `npm run build`, `npm test` | Build succeeds; all tests pass |
| TC-SIT-04 | Corrupt local file in real workspace — fail-safe | P1 | AC-7 | Real workspace with corrupt local rule file planted | 1. Plant corrupt JSON at local rule path in real workspace<br>2. Run `kiroSdlc.indexWorkspace`<br>3. Assert corrupt file skipped / fallback download used<br>4. Assert indexing completes without crash | corrupt content `{ not-valid !!` at local rule path | Fail-safe: corrupt file skipped, fallback used, no crash |

## 12. Summary & Traceability

### 12.1 Test Cases Summary

| Level | Count | Automated | Manual |
|-------|-------|-----------|--------|
| PBT | 6 | 6 | 0 |
| UT | 11 | 11 | 0 |
| IT | 12 | 12 | 0 |
| E2E-API | 4 | 4 | 0 |
| E2E-CLI | 2 | 2 | 0 |
| SIT | 4 | 0 | 4 |
| **Total** | **39** | **35 (90%)** | **4 (10%)** |

### 12.2 Requirements Traceability Matrix (RTM) — 100% coverage (9/9 ACs)

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| AC-1 | BRD SA4E-301 | TC-UT-01, TC-UT-04 | ✅ |
| AC-2 | BRD SA4E-301 | TC-IT-01, TC-IT-10, TC-E2E-API-01, TC-E2E-API-03, TC-SIT-01 | ✅ |
| AC-3 | BRD SA4E-301 | TC-IT-02, TC-IT-03, TC-E2E-API-02, TC-E2E-API-03, TC-SIT-02 | ✅ |
| AC-4 | BRD SA4E-301 | TC-PBT-01…06, TC-UT-06, TC-UT-11, TC-IT-12, TC-E2E-API-01, TC-E2E-API-04 | ✅ |
| AC-5 | BRD SA4E-301 | TC-UT-03, TC-IT-07, TC-E2E-CLI-02 | ✅ |
| AC-6 | BRD SA4E-301 | TC-IT-08, TC-IT-10, TC-E2E-API-03, TC-E2E-CLI-01, TC-SIT-01 | ✅ |
| AC-7 | BRD SA4E-301 | TC-IT-02, TC-IT-04, TC-IT-05, TC-IT-06, TC-SIT-04 | ✅ |
| AC-8 | BRD SA4E-301 | TC-UT-07, TC-UT-08, TC-UT-09, TC-UT-10, TC-IT-09, TC-IT-11 | ✅ |
| AC-9 | BRD SA4E-301 | TC-SIT-03 | ✅ |
| BR-1 | FSD SA4E-301 | TC-UT-02, TC-UT-05 | ✅ |
| INV-1 | BRD SA4E-301 | TC-PBT-01, TC-PBT-06, TC-E2E-API-04 | ✅ |

### 12.3 Test Data Traceability

Test data CSVs: `documents/SA4E-301/testdata/` — every test case ID above traces to at least one CSV row in that directory (exact values per STC, e.g. checksums `33c2f8d923379eefc13669e173a426e88386c6751f2c0a904416cd8e8f7b7f40`, `695c02b4f8a5d9c0c075d06d3a8db949f17835ba6d4675b49ce08680e5cb6833`).