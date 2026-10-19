# CI/CD Setup — SA4E-369: Intra-instance peer messaging (peer/ module)

**Phase:** 4.5 — CI/CD Setup (prepared BEFORE Phase 5 DEV)
**Deliverable:** `.github/workflows/ci-sa4e-369.yml` (additive-only; no existing pipeline file is modified)
**Date:** 2026-10-20 | **Author:** DevOps Agent | **Status:** Prepared, NOT executed (no pipeline run from this ticket)

---

## 1. Overview

SA4E-369 adds a new additive module `extension/src/peer/` (PeerRegistry, PeerBus, PeerTaskManager, AntiLoopGuards, PeerThreadStore, session tools) — pure in-process TypeScript inside the existing extension bundle (TDD §2, §5). No backend, no DB, no container, no environment config (TDD §10: zero-config by design, AC7).

This document describes the per-ticket CI workflow created for the ticket: stages, triggers, artifacts, how the project's quality gates map onto the stages, how to run every gate locally before pushing, and the secrets policy.

## 2. Survey — Existing CI/CD Inventory (read before deciding)

| File | Role | Touched by this ticket? |
|------|------|------------------------|
| `.github/workflows/ci.yml` | Base CI: backend build/test/contract + extension compile/test on push/PR to master/main | ❌ No |
| `.github/workflows/ci-sa4e-191/223/241/332/336/356/358.yml` | Per-ticket CI convention — one additive workflow per feature ticket | ❌ No (pattern reference only) |
| `.github/workflows/publish.yml`, `auto-release.yml` | Release/publish flows | ❌ No (SA4E-369 does NOT publish) |
| `.github/workflows/e2e-tests.yml`, `build-native.yml`, `build-onnxruntime.yml`, `build-push-backend.yml`, `scheduled-prebuild-scan.yml` | Platform/e2e/supply-chain scans | ❌ No |
| `extension/package.json` scripts | `build`/`compile` (tsc), `lint` (eslint), `test`/`test:unit` (vitest), `test:coverage`, `esbuild`/`esbuild-production`, `smoke:bundle`, `package:debug`/`package:prod` (vsce) | ❌ No (consumed as-is) |
| `scripts/check-secrets.sh`, `scripts/check-line-count.sh` | Pre-commit hygiene gates | ❌ No (referenced for local workflow) |
| azure-pipelines / Jenkinsfile | None in repo | ❌ N/A |

**Decision:** follow the established per-ticket convention → create a NEW workflow `ci-sa4e-369.yml` (8th file in the `ci-sa4e-XXX` series, patterned on `ci-sa4e-358.yml`). This is the additive-only option: the base `ci.yml` keeps running unchanged on every push/PR to master/main, and other tickets' workflows are untouched.

**Install strategy:** root workspaces install (`npm install --force` from repo root + `@rolldown/binding-linux-x64-gnu`), identical to `ci.yml` and prior per-ticket workflows — the known lock drift (extension/package.json ahead of package-lock.json) is owned by a separate lock re-sync ticket, so standalone `npm ci` is NOT used.

## 3. Pipeline Stages (`.github/workflows/ci-sa4e-369.yml` → job `extension-peer`)

Matrix `ubuntu-latest` + `windows-latest` (per-ticket convention; peer module is cross-platform pure TS, TDD §9).

| # | Stage | Command | Blocking? | Gate mapping |
|---|-------|---------|-----------|--------------|
| 1 | Install | root workspaces install (see §2) | ✅ | Reproducible build environment |
| 2 | Typecheck | `npm run compile --workspace=extension` | ✅ | **tsc 0 errors** (v1.53.9 baseline) |
| 3 | Lint | `npm run lint --workspace=extension` | ⚠️ continue-on-error | **eslint 0 errors** is the v1.53.9 baseline; pre-existing warnings must not block the ticket (same relaxed policy as SA4E-356/358 — staged cleanliness is enforced by the pre-commit lint-staged hook). New `peer/*` code must be clean. |
| 4 | Unit tests (full suite) | `npm run test --workspace=extension` | ✅ | **389 files / 3,066 tests PASS** baseline (v1.53.9). `vitest.config.ts` include `src/**/__tests__/**/*.test.ts` auto-picks `src/__tests__/peer/*` when DEV lands it (TDD §11.2). |
| 5 | Peer security cases | `npx vitest run` on `envelope.unit.test.ts` + `message-size.unit.test.ts` + `peer-provenance.e2e.test.ts` | ✅ (when armed) | **Security cases:** SEC-01/C1 provenance envelope (header stamped from Registry), SEC-03/C2 `PEER_010` message-size zero-state rejection (pre-guard, rate window untouched), SEC-01/C1 `turnOrigin:'peer'` + approval-gate routing (TDD §7.6). |
| 6 | Bundle | `npm run esbuild-production --workspace=extension` then `npm run smoke:bundle --workspace=extension` | ✅ | **smoke:bundle PASSED** (v1.53.9 gate) — production bundle integrity. |
| 7 | VSIX package | `npx @vscode/vsce package --no-dependencies` (working-directory `extension`) | ✅ | VSIX builds (runs `vscode:prepublish`: esbuild-production + copy-resources + gen-checksums). **NO publish** — `vsce publish` is never invoked. |

### 3.1 RED-BY-DESIGN / arming (Phase 4.5 → Phase 5)

- At Phase 4.5 `extension/src/peer/` does not exist yet (TDD §12 order) → all stages are GREEN: the full-suite stage runs the existing baseline, and Stage 5 reports `SKIP` while `src/__tests__/peer/` is missing (arming pattern of SA4E-356 N-7 / SA4E-358 OriginGate).
- Gates arm automatically when DEV lands C1..C5 + the test suites of TDD §11.2. Do not weaken or bypass any stage to "get green early" — implement TDD §5/§6.
- Stage 5 is RED until the security cases pass; it must be green before Phase 6 exit.

## 4. Triggers & Runtime Settings

| Setting | Value |
|---------|-------|
| `push` | branch `SA4E-369` |
| `pull_request` | target branches `SA4E-369`, `main` (covers PRs opened from the ticket branch) |
| `workflow_dispatch` | manual run from the Actions tab |
| `concurrency` | group `sa4e-369-ci-${{ github.ref }}`, cancel-in-progress |
| `permissions` | `contents: read` only |

## 5. Artifacts

| Artifact | Name | Contents |
|----------|------|----------|
| VSIX (per OS) | `sa4e-369-extension-vsix-<ubuntu|windows>` | `extension/*.vsix` — for review and `kiro --install-extension --force` install testing only. `if-no-files-found: error`. |

No artifact is published to the marketplace; no release tag is created from this workflow.

## 6. Quality Gates → Stages Mapping (verified baseline: hotfix v1.53.9, 2026-10-18)

| Gate (v1.53.9 evidence) | CI stage | Local equivalent |
|--------------------------|----------|------------------|
| Full suite 389 files / 3,066 tests PASS | Stage 4 | `npm run test --workspace=extension` |
| tsc 0 errors | Stage 2 | `npm run compile --workspace=extension` |
| eslint 0 errors | Stage 3 (+ pre-commit lint-staged) | `npm run lint --workspace=extension` |
| smoke:bundle PASSED | Stage 6 | `npm run smoke:bundle --workspace=extension` |
| VSIX packaged (1881 files) + `kiro --install-extension --force` OK | Stage 7 (+ artifact manual install) | `npm run package:prod --workspace=extension` then install |

Security cases (SEC-01/SEC-03 from SECURITY-REVIEW v1.0, TDD v1.1 amendment) are enforced by Stage 5. Live two-tab verification on a real Kiro host (manual CDP UAT) is NOT automatable in CI — Phase 6 manual-web-test scope (TDD §11.5).

## 7. Running Locally BEFORE Push (same order as CI stages)

From repo root (Windows PowerShell — CI uses bash; commands are shell-neutral):

```powershell
# 1. Install (root workspaces — canonical; skip if node_modules is fresh)
npm install --force --no-audit --no-fund

# 2. Typecheck (tsc 0 errors)
npm run compile --workspace=extension

# 3. Lint (0 errors on new peer/ code)
npm run lint --workspace=extension

# 4. Full suite incl. peer/* (baseline 389 files / 3,066 tests)
npm run test --workspace=extension

# 5. Peer security cases (once extension/src/__tests__/peer/ exists)
npx vitest run --cwd extension --root extension src/__tests__/peer/envelope.unit.test.ts src/__tests__/peer/message-size.unit.test.ts src/__tests__/peer/peer-provenance.e2e.test.ts
# (or, from extension/: npx vitest run src/__tests__/peer/envelope.unit.test.ts src/__tests__/peer/message-size.unit.test.ts src/__tests__/peer/peer-provenance.e2e.test.ts)

# 6. Bundle + smoke
npm run esbuild-production --workspace=extension
npm run smoke:bundle --workspace=extension

# 7. VSIX package (no publish)
npm run package:prod --workspace=extension   # or: npx @vscode/vsce package --no-dependencies (cwd: extension)

# 8. (Optional) install-test the produced VSIX
# kiro --install-extension --force extension\<name>.vsix
```

Pre-push hygiene (existing repo hooks/scripts): `bash scripts/check-secrets.sh`, `bash scripts/check-line-count.sh` (≤200 lines/file, code-standards).

Push only after all of the above are green — do not rely on CI to discover failures.

## 8. Secrets Policy

- The workflow requests `contents: read` only and contains **no secrets** — no environment variables, no `${{ secrets.* }}` references.
- **Never hardcode credentials** (tokens, API keys, connection strings) in workflow YAML, package.json scripts, or committed files. Use GitHub repository/environment secrets if a future stage ever needs one, and reference them exclusively as `${{ secrets.NAME }}`.
- The VSIX stage is **package-only**: no `vsce publish`, no marketplace PAT. If publishing is ever required (release flow, `publish.yml`), the PAT must live in GitHub secrets — never in the per-ticket workflow.
- Extension runtime config carries no secrets by design (peer feature is zero-config, TDD §10.1); do not add `.env` files or workspace settings for it.

## 9. Additive-Only Statement & Non-Execution

- Created: `.github/workflows/ci-sa4e-369.yml` + this `CICD-SETUP.md`. Nothing else is modified.
- Existing pipelines (`ci.yml`, all other `ci-sa4e-*.yml`, `publish.yml`, `auto-release.yml`) remain byte-identical.
- This ticket does NOT run the pipeline, deploy, or publish — execution happens on push/PR to the `SA4E-369` branch during Phase 5/6.
- DPG.md (deployment guide) is intentionally NOT created here — that is Phase 7 scope. Rollback strategy is documented in TDD §10.3 (code revert of the self-contained `peer/` module; no data migration exists, BR-12).

## 10. Changelog

| Version | Date | Author | Notes |
|---------|------|--------|-------|
| 1.0 | 2026-10-20 | DevOps Agent | Phase 4.5 — per-ticket CI workflow `ci-sa4e-369.yml` (7 stages, 2-OS matrix, security-cases arming, VSIX package no publish) + this setup document |
