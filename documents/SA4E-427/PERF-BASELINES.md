# SA4E-427 — Acceptance Suite Performance Baselines

**Epic:** SA4E-411 (Code Agent 16K) | **Story:** SA4E-427 | **Date:** 2026-11-09
**Environment:** Windows 11, Node.js 22.23.4, in-memory SQLite, Vitest (node pool)

## 1. Targets

| Target | Threshold | Rationale |
|---|---|---|
| Full AC suite (`npm run test:ac`) | **< 10 s** | Fast feedback gate for CI and pre-commit |
| Any single AC test | **< 2 s** | A slow AC indicates real IO or an accidental full-repo scan |
| Backend full regression | informational | Track drift vs. 463 files / 3,660 tests baseline |

## 2. Measured Baselines

### 2.1 Backend AC suite (`backend/src/engine/acceptance/`)

| File | Tests | Wall time |
|---|---|---|
| `acceptance-ac01-08.test.ts` | 8 | — |
| `acceptance-ac09-12.test.ts` | 4 | — |
| `acceptance-ac13-16.test.ts` | 4 | — |
| **Total** | **16** | **1.6–1.7 s** (transform + setup + tests) |

Per-test timings (Vitest verbose, warm run):

| AC | Time | AC | Time |
|---|---|---|---|
| AC-01 | 71 ms | AC-09 | 47 ms |
| AC-02 | 17 ms | AC-10 | 12 ms |
| AC-03 | 17 ms | AC-11 | 9 ms |
| AC-04 | 10 ms | AC-12 | 11 ms |
| AC-05 | 10 ms | AC-13 | 49 ms |
| AC-06 | 6 ms | AC-14 | 25 ms |
| AC-07 | 9 ms | AC-15 | 7 ms |
| AC-08 | 8 ms | AC-16 | 13 ms |

Slowest tests are the ones that touch the real filesystem (AC-01 pipeline + AC-13/AC-14
staged-patch tmp workspaces) and the multi-snapshot retrieval scan (AC-09) — all well under
the 2 s per-test target.

### 2.2 Extension AC-17 (`extension/src/pi-agent/__tests__/acceptance-ac17.test.ts`)

| Metric | Value |
|---|---|
| Tests | 1 |
| Test time | 5–6 ms |
| File wall time | ~0.4–0.5 s (import + transform) |

The tokenizer is injected via `fetchFn`, so no network is involved; the measured number
(4200) is a synthetic exact count that flows through the real budget-gate path.

## 3. Full Regression Snapshots

| Suite | Files | Tests | Notes |
|---|---|---|---|
| Backend `npm run test:unit` (pre-427) | 463 | 3,660 passed (+2 skipped) | ~187 s |
| Extension `vitest run` (pre-427) | 440 | 3,450 passed (+6 skipped) | — |
| Backend after 427 (measured) | 466 | 3,676 passed (+2 skipped) | +3 AC files, +16 tests; 196.6 s |
| Extension after 427 (measured) | 441 | 3,451 passed (+6 skipped) | +1 AC file, +1 test; 298.9 s (1 file skipped) |

> The “after 427” figures were measured in the same commit as this document; see
> `STATUS.json → regression`.

## 4. Reproduce

```powershell
# Backend AC baseline (verbose per-test timings)
cd backend
npx vitest run src/engine/acceptance/ --reporter=verbose

# Extension AC baseline
cd extension
npx vitest run src/pi-agent/__tests__/acceptance-ac17.test.ts --reporter=verbose

# Full regressions
cd backend  ; npm run test:unit
cd extension ; npx vitest run
```

## 5. Guardrails

- AC tests must not reach the network, the user workspace, or a shared database; any
  test crossing 2 s is treated as a defect (likely accidental IO).
- Perf numbers are recorded per run on developer hardware; CI thresholds use the
  targets in §1, not the exact measured milliseconds.
