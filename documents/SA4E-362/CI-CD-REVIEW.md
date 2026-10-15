# CI/CD Review — SA4E-362 (Phase 4.5)

**Date:** 2026-10-15 | **Scope:** Verify CI/build pipeline covers VS Code extension bug-fix files
**Branch:** SA4E-362 (review only — no code/config changes committed)

## What Exists

| Artifact | Location | Status |
|---|---|---|
| GitHub Actions | `.github/workflows/` | ❌ NONE — no active workflow anywhere in repo |
| GitLab / Jenkins / Azure | repo root | ❌ NONE |
| Draft CI workflow | `documents/SA4E-242/ci-cd-extension.yml` | 📄 Document artifact (SA4E-242): compile + lint + test:unit + VSIX package — never installed as an active workflow |
| Backend CI composite | `backend/package.json` → `check:ci` | ✅ lint + lint:lines + build + test:unit + test:contract — backend only, not extension |

## What Runs (local gates, extension/)

- `npm run compile` (`tsc -p ./`, strict:true) — includes all `src/**` production files. Type-checks the 7 target files (`PegaStreamIngester`, `PegaBfsIndexer`, `PegaBfsPipeline`, `PegaCatalogIndexer`, `PegaProjectIndexer`, `IndexingService`, `code-intel/delta/BackendHttpPoster.ts`); WILL catch the `authManager → IngestAuthProvider` signature change as a compile error.
- `npm run test:unit` (`vitest run`) — `vitest.config.ts` include `src/**/__tests__/**/*.test.ts` auto-discovers new tests in `src/services/__tests__/` and `src/code-intel/delta/__tests__/`. No config change needed for the 13 new cases.
- `npm run lint` — eslint covers `src/**/*.ts` incl. `__tests__` (relaxed: only `no-restricted-imports` as error). Not a signature gate; tsc is.

## Gaps Found

1. **No hosted CI** — nothing runs extension tests/build on push/PR. NOT a blocker: the 13 new tests execute locally via `npm run test:unit`. Per phase rules, no new pipeline file created (hosted CI gates merges; it is not required to run the tests).
2. **tsc excludes `src/**/__tests__`** (`extension/tsconfig.json:14`) — new test files are not type-checked by `tsc`; errors surface at vitest runtime instead. Pre-existing design, acceptable.
3. **SA4E-242 draft never activated** — recommend installing as `.github/workflows/extension-ci.yml` in a dedicated CI ticket (out of scope for this bug fix).

## Verdict: READY

- No pipeline edit required — new tests auto-discovered by existing vitest include pattern.
- Signature-change gate = `npm run compile` (tsc strict) + `npm run test:unit`. Dev MUST run both before merge; SM enforces in quality gate.
