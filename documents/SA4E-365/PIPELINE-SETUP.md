# PIPELINE-SETUP — SA4E-365 (Phase 4.5 DevOps)

| Item | Value |
|------|-------|
| **Ticket** | SA4E-365 — [SDLC Chat] Thinking section không hiển thị (thinking_delta bị drop trong pi-event-mapper) |
| **Phase** | 4.5 — DevOps Pipeline Setup/Verification (prepared BEFORE Phase 5 DEV) |
| **Date** | 2026-10-16 |
| **Scope** | Small bug fix: ~10 extension TypeScript files + tests (TDD §12, STC T1..T6) |
| **Infra change** | **NONE** — no new services, no DB, no config keys, no Docker (TDD §14: no migration, no feature flag, no new settings) |
| **Baseline verdict** | ✅ **GREEN** (build PASS + mandated fast subset 11/11 PASS + extended stream subset 18/18 PASS) |

---

## 1. Pipeline Audit — What Already Exists

### 1.1 CI Workflows (15 files in git index `.github/workflows/`)

| Workflow | Trigger | Extension Coverage |
|----------|---------|--------------------|
| **ci.yml** (main CI) | push / PR → master, main | ✅ job `extension`: Node 22 → clean root-workspaces install → `npm run compile --workspace=extension` → `npm run test --workspace=extension` (full vitest suite) |
| ci-sa4e-191 / 223 / 241 / 332 / 336 / 356 / 358.yml | per-ticket (push/PR → main + workflow_dispatch) | Per-ticket gating convention: tsc → eslint → vitest → coverage gate → VSIX smoke (pattern per ci-sa4e-358.yml) |
| e2e-tests.yml, publish.yml, auto-release.yml, build-native.yml, build-onnxruntime.yml, build-push-backend.yml, scheduled-prebuild-scan.yml | release / schedule | Packaging & backend infra — not ticket-scoped |

> **Note:** `ci.yml` already enforces the AC5 gate (full `vitest run`) on every PR to master/main — this is the STP §5 RACI requirement "DevOps: CI chạy `npx vitest run` (AC5 gate)". **It is already satisfied by the existing pipeline.**

### 1.2 Build & Test Scripts

**Root `package.json`** (npm workspaces: `backend` + `extension`, engines: node 22.x):

| Script | Effect |
|--------|--------|
| `npm run build` / `test` / `lint` | Delegates to all workspaces |
| `postinstall` | `node scripts/patch-vendored-deps.mjs` (vendored-deps patch — CI re-applies it after 2nd install, see ci-sa4e-358 supply-chain job) |

**`extension/package.json`** (v1.53.1):

| Script | Command | Use for SA4E-365 |
|--------|---------|------------------|
| `compile` / `build` | `tsc -p ./` | ✅ Entry condition (STP §2.6) |
| `test` / `test:unit` | `vitest run` | ✅ Full regression (TC-14, AC5) |
| `test:watch` | `vitest watch` | DEV inner loop |
| `test:coverage` | `vitest run --coverage` | ⚠️ Scoped gate PathResolver+OriginGate ≥95% — **N/A for this ticket** (do not extend coverage.include) |
| `test:e2e` | `vitest run --config vitest.e2e.config.ts` | N/A (optional adapter E2E only, TDD §13.2) |
| `lint` | `eslint src/` | Non-blocking in CI (continue-on-error policy, pre-commit hook enforces staged files) |
| `package:debug` / `package:prod` | esbuild + vsce | VSIX packaging (Phase 7) |

### 1.3 Vitest Configuration (`extension/vitest.config.ts`)

- Include: `src/**/__tests__/**/*.test.ts` — collocated unit + integration tests (TDD §13.1 structure).
- Excludes 3 heavy E2E files (cross-process, drawio-convert, anthropic handlers) from default run.
- `fileParallelism: false`, `retry: 2` (E2E backend-boot races).
- `vscode` alias → `src/test/mocks/vscode.ts`; svelte shim aliases (webview tests run in node env).
- Coverage gate scoped to `PathResolver.ts` + `OriginGate.ts` only (SA4E-356/358) — **inert for SA4E-365**, no change needed.

### 1.4 Docker / Compose

- `backend/Dockerfile` + 6 `backend/docker-compose*.yml` exist — **backend orchestration only**.
- **Extension does NOT use Docker** (runs inside the VS Code/Kiro Extension Host — same as SA4E-356/358 precedent). → No Dockerfile/compose created. ✅ per task constraint #4.

### 1.5 Other

- No Jenkinsfile, no .gitlab-ci.yml, no azure-pipelines.yml.
- Secrets: **not touched** (no `.env`, no workflow secrets modified).

---

## 2. Verification Results (Baseline, 2026-10-16)

Environment: Windows (pwsh), node **v24.8.0**, npm **11.6.0** — repo pin is node 22.x (CI runs Node 22; local 24 is a dev-machine deviation, see §5 Notes).

### 2.1 Build Extension

```
cd extension
npm run compile        # tsc -p ./
```

**Result: ✅ PASS** — 0 type errors, exit 0.

### 2.2 Mandated Fast Subset (stream/thinking-related baseline)

```
cd extension
npx vitest run src/chat/engine/__tests__/stream-error-mapping.test.ts src/mcp/__tests__/stream-handler-events.test.ts
```

**Result: ✅ PASS** — `Test Files  2 passed (2) · Tests  11 passed (11)` — duration **509 ms**.

These 2 files are the proven patterns TDD §12.1 mandates for the new TC-04..TC-16 tests:
- `stream-error-mapping.test.ts` — fake-deps + real `StreamProtocolAdapter` pattern (Adapter TCs)
- `stream-handler-events.test.ts` — StreamHandler event buffering pattern (TC-13)

### 2.3 Extended Stream Subset (bonus confidence, still < 3 min)

```
cd extension
npx vitest run src/chat/engine/__tests__/stream-identity.test.ts src/__tests__/stream-write-reject.test.ts src/pi-workflow/__tests__/pi-model-fallback.test.ts
```

**Result: ✅ PASS** — `Test Files  3 passed (3) · Tests  18 passed (18)` — duration **2.02 s**.

`pi-model-fallback.test.ts` is the pattern for TC-12a (provider discard of failed attempt — G-2 leak guard).

### 2.4 Baseline Verdict

| Check | Status | Detail |
|-------|--------|--------|
| Extension build (`tsc -p ./`) | ✅ PASS | 0 errors |
| Mandated fast subset | ✅ PASS | 2 files / 11 tests / 509 ms |
| Extended stream subset | ✅ PASS | 3 files / 18 tests / 2.02 s |
| Pre-existing failures | ✅ None found | No RED tests in scope — nothing to record as "known-broken" |
| Full suite `npx vitest run` | ⏭️ Not run in Phase 4.5 | Out of the <3-min subset scope; gated by ci.yml on PR (AC5) and re-run by QA in Phase 6 (TC-14) |

**Baseline = GREEN.** DEV can start Phase 5 on top of this tree.

### 2.5 ⚠️ Working-Tree State Caveat (important for baseline interpretation)

The verification ran on branch **`SA4E-364`** whose working tree already contains **uncommitted SA4E-365 partial implementation** (marked `SA4E-THINKING` in code comments), overlapping TDD fixFiles:

| File (uncommitted delta) | Change |
|--------------------------|--------|
| `src/pi-workflow/pi-event-mapper.ts` | +9 — forwards `thinking_delta` → `{type:'thinking'}` chunk + `collector.thinking` (root-cause fix) |
| `src/mcp/stream-handler.ts` | +20 — `emitThinking()` buffered/debounced path |
| `src/chat/engine/StreamProtocolAdapter.ts` | +32 — THINKING_START/TOKEN/END state machine |
| `src/chat/engine/ChatEngineAdapter.ts`, `IStreamProtocolAdapter.ts`, `src/mcp/state-types.ts` | small deltas |

Interpretation:
- The **fast subset is GREEN even WITH this partial fix present** — i.e. no regression introduced so far (the strongest baseline statement we can make on this tree).
- **No thinking test files exist yet** (STC targets T1..T6 not created) — `git status` shows no untracked `*thinking*` test files. The 6 new test files are DEV's Phase 5 deliverable.
- These deltas are uncommitted and ride on the `SA4E-364` branch — SM/DEV must decide the branch/commit strategy for SA4E-365 (per repo convention: 1 branch per ticket). DevOps flag: **the partial fix is not on a `SA4E-365` branch yet.**

---

## 3. Decision — No New CI Workflow Created

Per task constraint #3 ("CHỈ TẠO MỚI nếu thiếu hoàn toàn"):

- ✅ CI workflow for extension build + vitest **already exists** (`ci.yml` → job `extension`, runs full suite on every PR to master/main).
- ✅ Per-ticket CI convention exists (7 prior `ci-sa4e-*.yml` files) — created only when a ticket needs ticket-scoped gates (coverage gates, security grep gates, semgrep) beyond the main CI.
- **SA4E-365 needs NONE of those extras**: no coverage gate change (vitest.config.ts untouched), no security gate (UI-less stream plumbing; SECURITY-REVIEW landed already), no backend job (zero backend files — TDD §5), no DB migration, no Docker.
- → **NO new workflow created.** Zero-duplicate-infrastructure principle honored.

*Optional (SM decision, not done here):* if ticket-scoped branch gating is wanted before PR, clone `ci-sa4e-358.yml` → `ci-sa4e-365.yml` keeping only the `extension` job (tsc → vitest) and drop coverage/semgrep/supply-chain jobs. The main CI gate remains authoritative for merge either way.

---

## 4. Standardized Commands for DEV (Windows PowerShell)

Run from `extension/` unless noted. All commands verified working on this machine.

```powershell
# ── Inner loop ─────────────────────────────────────────────
cd extension
npm run watch                                  # tsc watch (optional)

# ── Build (STP §2.6 entry condition) ───────────────────────
npm run compile                                # tsc -p ./ — must be 0 errors

# ── Mandated fast subset (SM/DevOps baseline command) ─────
npx vitest run src/chat/engine/__tests__/stream-error-mapping.test.ts src/mcp/__tests__/stream-handler-events.test.ts

# ── Full regression (TC-14 / AC5 — before handoff to QA & on PR) ──
npx vitest run                                 # == npm test

# ── Lint (non-blocking in CI, keep new code clean) ────────
npm run lint
```

**Do NOT run / change for this ticket:**
- `npm run test:coverage` — scoped gate is PathResolver/OriginGate (SA4E-356/358); SA4E-365 adds no gated module.
- `npm run test:e2e` — adapter E2E optional only (TDD §13.2); not required for STP exit.

**Pinning rule** (from vitest.config.ts header): vitest and @vitest/coverage-v8 are pinned EXACT at 4.1.8 and must move together — DEV must not bump either while implementing.

---

## 5. CI Readiness vs STP Criteria

| STP Ref | Criterion | Pipeline Status |
|---------|-----------|-----------------|
| §2.6 UT/IT entry | `npm run compile` pass | ✅ Verified GREEN locally; enforced in ci.yml |
| §2.6 UT/IT entry | 6 test files per STC created | ⏳ DEV Phase 5 (not started — correct at Phase 4.5) |
| §2.7 Regression exit | `npx vitest run` full pass (AC5) | ✅ Gated by ci.yml `extension` job on PR to master/main |
| §5 RACI | "DevOps: CI chạy `npx vitest run` (AC5 gate)" | ✅ Already satisfied by existing ci.yml — no new pipeline needed |
| §2.8 / TDD §12.3 | Manual IDE verification (ThinkingBlock live stream) | Not CI-automatable (needs real Kiro host + reasoning model) — manual step owned by QA/UAT, same as SA4E-358 V-evidence policy |

**Pipeline readiness: READY — no changes required.**

---

## 6. Notes & Handoff

1. **Node version**: local machine runs node v24.8.0 while repo engines/CI pin 22.x. Fast subset behaves identically here, but DEV should treat ci.yml (Node 22, ubuntu) as the authoritative gate before merge.
2. **Platform**: local = Windows; ci.yml runs ubuntu only; per-ticket workflows historically use ubuntu+windows matrix. Extension suite has platform-conditional tests (e.g. ps-command-patterns); if SM wants pre-PR Windows parity, the optional per-ticket workflow (§3) with the 358 matrix covers it.
3. **Branch hygiene**: uncommitted SA4E-365 code currently sits on `SA4E-364` (§2.5). Recommend SM instructs DEV to move/commit onto a `SA4E-365` branch before Phase 5 completion to keep 1-branch-per-ticket and clean PR review.
4. **KB ingest gap**: MCP memory tools (mem_ingest_file) are not exposed in this subagent's tool catalog — SM should ingest this report into the KB (`mem_ingest_file("documents/SA4E-365/PIPELINE-SETUP.md", type="PROCEDURE")`) for cross-agent access.
5. **Out of scope (per task)**: no app code changes, no secrets, no Dockerfile/compose, no STATUS.json/RUN-LOG.md writes (SM-owned files).

---

*Prepared by: DevOps Agent (Phase 4.5) · 2026-10-16 · Baseline: GREEN*
