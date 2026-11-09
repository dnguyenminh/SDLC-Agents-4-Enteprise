# SA4E-427 — Acceptance Criteria Matrix

**Epic:** SA4E-411 (Code Agent 16K) | **Story:** SA4E-427 | **Date:** 2026-11-09
**Reference:** 16K Code Agent Architecture §19 (17 mandatory acceptance criteria)

## 1. Summary

| Metric | Value |
|---|---|
| Acceptance criteria covered | **17 / 17** |
| Backend AC tests | 16 / 16 passing |
| Extension AC tests | 1 / 1 passing |
| Backend AC suite runtime | 1.6–1.7 s |
| AC gate command | `npm run test:ac` (root, backend, extension) |

Every AC is executed against a real migrated database (migration V6, in-memory SQLite)
or the real extension budget-gate modules — no mocks of the system under test.
The shared fixture `backend/src/engine/acceptance/__tests__/ac-fixtures.ts` provides
two repositories, five commits (including a merge commit and a delete commit),
eight snapshots (six READY, two PENDING) and two embedding models on one snapshot.

## 2. Criterion → Test → Evidence

| AC | Criterion (§19) | Test file | Test name | Evidence produced |
|---|---|---|---|---|
| 01 | Re-index same commit with new adapter keeps old snapshot intact | `acceptance-ac01-08.test.ts` | `AC-01 re-index same commit with a new adapter → old snapshot intact` | Pipeline builds S6 to READY; S1 remains READY with unchanged symbol/chunk counts; S6 contains only the new adapter output |
| 02 | 2 embedding models on the same snapshot, no vector mixing | `acceptance-ac01-08.test.ts` | `AC-02 two embedding models on the same snapshot → no vector mixing` | `local-minilm` returns only `es1` chunks; `other-model` returns only `es1b` chunk |
| 03 | Chat pinned to old commit queries after branch moves | `acceptance-ac01-08.test.ts` | `AC-03 chat pinned to old commit keeps querying it after branch head moves` | Branch head resolves S2; session pin resolves S1/c1; symbol lookup returns `s-auth1` |
| 04 | Rename: old & new paths correct at respective commits | `acceptance-ac01-08.test.ts` | `AC-04 rename: old path correct at old commit, new path at new commit` | `src/old/auth.ts` at S1/c1; `src/new/auth.ts` at S2/c2 and S3/merge |
| 05 | Delete: queryable at old commit, not at new commit | `acceptance-ac01-08.test.ts` | `AC-05 delete: queryable at the old commit, absent at the delete commit` | `AuthService` found in S1, absent in S4; deleted path missing from delete-commit revisions |
| 06 | Merge commit with multiple parents indexed correctly | `acceptance-ac01-08.test.ts` | `AC-06 merge commit with two parents is indexed correctly` | `git_commit_parent` order `[c1, c2]`; S3 READY on c3; symbols resolve on S3 |
| 07 | Every artifact belongs to its required snapshot | `acceptance-ac01-08.test.ts` | `AC-07 every artifact belongs to its required snapshot (DB-enforced)` | All symbol/chunk/embedding snapshot ids exist; cross-snapshot parent insert and cross-repo chat pin are rejected by DB triggers |
| 08 | Vector query never leaks across repo/snapshot | `acceptance-ac01-08.test.ts` | `AC-08 vector/lexical queries never leak across snapshot or repository` | S1 returns only its own chunks (no ch2/ch3/ch5); S5 (repo-2) returns only `ch5`; lexical search scoped per snapshot |
| 09 | Filtered ANN recall + result-count on multi-snapshot data | `acceptance-ac09-12.test.ts` | `AC-09 filtered recall + result-count on the multi-snapshot dataset` | Filter-first retrieval: recall@2 = 1.0; exact per-snapshot counts `{S1:2, S2:1, S3:1, S5:1}` |
| 10 | Semantic re-run after dependency/classpath change | `acceptance-ac09-12.test.ts` | `AC-10 semantic re-run after dependency/classpath change (source unchanged)` | E→F re-ran; S7 READY with new `config_fingerprint` on the same commit; source hashes unchanged; S1 untouched |
| 11 | Dependency failure does not cascade fake semantic coverage | `acceptance-ac09-12.test.ts` | `AC-11 dependency failure → no fake semantic coverage cascade` | Java coverage = `failed` (never `supported`); F never ran for java; snapshot still publishes READY (soft language failure) |
| 12 | Agent restart resumes from persisted plan/step | `acceptance-ac09-12.test.ts` | `AC-12 agent restart → resume from persisted plan/step/approval` | `summarizeForResume` returns objective, APPROVED plan, next step index 1, pending approval; a fresh service instance resumes with zero in-memory state |
| 13 | Patch rejects stale base hash or path traversal | `acceptance-ac13-16.test.ts` | `AC-13 patch rejects stale base hash and path traversal` | `STALE_BASE` and `PATH_INVALID` rejections; original file bytes untouched |
| 14 | Original working tree unchanged before approval | `acceptance-ac13-16.test.ts` | `AC-14 original working tree unchanged before approval (AC #14)` | Fingerprint identical after staging and after blocked apply (`NOT_APPROVED`); changes only after APPROVED decision |
| 15 | Sandbox: no workspace escape, no unrestricted network | `acceptance-ac13-16.test.ts` | `AC-15 sandbox: no workspace escape, no unrestricted network` | Absolute path, `..`, NUL byte rejected; shell metachars rejected; `--` separator inserted; network denied by default; registry allowlist matches exact host only; container limits validated |
| 16 | SSE reconnect + replay → no duplicate / missing events | `acceptance-ac13-16.test.ts` | `AC-16 SSE reconnect + replay → no duplicate, no missing` | Ids `[1..7]`; disconnect after id 3 then replay via Last-Event-ID yields combined sequence with 0 duplicates and 0 gaps |
| 17 | Real tokenizer prompt/tool counting under runtime budget | `extension/src/pi-agent/__tests__/acceptance-ac17.test.ts` | `AC-17: real prompt + tool tokens drive the runtime budget decision` | llama.cpp `/tokenize` count (4200) replaces the estimate; budget decision computed from real count + base prompt + tool schema tokens |

## 3. SA4E Integration Checks

| Check (§19 tail) | Result |
|---|---|
| No SM full-pipeline regression | `npm run test:unit` (backend) and full extension suite green — see `PERF-BASELINES.md` |
| `tsc` / vitest green | `tsc --noEmit` clean (backend, extension); all suites green |
| No unauthorized production config changes | Only test-scoped additions (`package.json` `test:ac` scripts) + `documents/SA4E-427/`; no runtime/config files modified |

## 4. Regression & Gates

```
# Backend AC gate
cd backend && npm run test:ac        # 3 files, 16 tests

# Extension AC gate
cd extension && npm run test:ac      # 1 file, 1 test

# Combined from repository root
npm run test:ac                      # backend && extension
```

## 5. Notes and Known Deviations

- **AC-09 (ANN recall):** SQLite MVP executes an exact cosine scan (ADR-001); recall is
  therefore 100 % on the pinned set. The HNSW/pgvector upgrade path keeps the same
  filter-first contract, so this test remains the recall oracle when ANN lands.
- **AC-07** exercises the DB-level ownership triggers (same-snapshot parent, chat pin)
  in addition to application-level filtering — defense in depth.
- **AC-15** validates the policy layer (path/arg/network/limits). Container-runtime
  enforcement itself is deployment configuration, out of scope for this suite.
- **AC-17** lives in the extension workspace because the budget gate is an extension
  concern; the backend suite is not aware of the tokenizer endpoint.
