# Deployment Guide (DPG)

## SDLC-Agents-4-Enterprise — SA4E-341: [E2E Testing] Serenity/JS + wdio-vscode-service for VSCode-based IDEs (Kiro/Antigravity/Kilo)

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-341 |
| Title | [E2E Testing] Serenity/JS + wdio-vscode-service for VSCode-based IDEs (Kiro/Antigravity/Kilo) |
| Author | DevOps Agent |
| Version | 1.0 |
| Date | 2026-10-09 |
| Status | Draft |
| Related TDD | documents/SA4E-341/TDD.md v1.0 |
| Related STP | documents/SA4E-341/STP.md v1.0 |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-09 | DevOps Agent | Initiate document — auto-generated from TDD v1.0, STP v1.0, and verified e2e/ workspace state (installed skeleton with SPIKE-1 actuals) |

---

## Sign-Off

| Name | Role | Signature and date |
|------|------|--------------------|
| | Dev Lead | ☐ Approved for deployment |
| | QA Lead | ☐ Testing completed |
| | Ops Lead | ☐ Infrastructure ready |

---

## 1. Overview

### 1.1 Feature Summary

SA4E-341 delivers a **BDD E2E testing framework** for VSCode and VSCode-based IDE forks (Kiro, Antigravity IDE, Kilo), built on the stack mandated by the ticket: **WebdriverIO v9 + wdio-vscode-service + Serenity/JS 3 (Cucumber + Screenplay Pattern)**.

This is a **test-infrastructure deliverable** — there is NO server-side deployment, NO database, and NO production-runtime component. The framework is:

- A standalone private npm package at repo root `e2e/` (`@sa4e/e2e`), deliberately NOT registered in the root `workspaces` array (TDD §2.1).
- On-demand tooling: run locally by QA/Dev on a real display, and headless in CI (Linux xvfb — UC-07).
- A static-report producer: every run generates the Serenity BDD HTML report at `e2e/target/site/serenity/index.html` with automatic failure screenshots (UC-06, BR-08).

### 1.2 Deployment Scope

| Item | Type | Description |
|------|------|-------------|
| `e2e/` standalone npm package | New | WDIO v9 + wdio-vscode-service 8 + Serenity/JS 3.48 + Cucumber 13 + tsx loader; config contract `e2e/wdio.conf.ts` (SPIKE-1 actuals) |
| Root `package.json` scripts | Modified (additive) | `test:e2e`, `test:e2e:report`, `test:e2e:clean` — delegate to `--prefix e2e` |
| `.gitignore` | Modified (additive) | `e2e/target/`, `e2e/node_modules/` |
| `.github/workflows/e2e-tests.yml` | New | Headless CI job (Linux xvfb-run) — E2E-only workflow; does not modify any existing pipeline |
| Database | Not applicable | No DB in this epic (TDD §7) |
| Production code (`extension/`, `backend/`) | Unchanged | Framework is additive and non-invasive (FSD §1.1, BR-05) |

### 1.3 Target Environments

| Environment | Location | Deploy Order | Approval Required |
|-------------|----------|-------------|-------------------|
| Local DEV (primary) | QA/Dev workstation — Windows 10+ (or Linux desktop) | 1st | No |
| CI — Linux headless (primary, UC-07) | GitHub Actions runner `ubuntu-latest` + xvfb | 2nd | No (job on push, Autonomy Level 3) |
| CI — Windows (UC-07 AF-1) | Deferred pending SPIKE-4 validation | 3rd | Yes — documented go/no-go decision |

> There is no SIT/UAT/PROD server topology: the Serenity BDD report is static HTML that opens standalone in any browser (UC-06). "PROD" for this deliverable means the committed framework + CI workflow on `main`.

---

## 2. Prerequisites

### 2.1 Infrastructure

| Requirement | Status | Notes |
|-------------|--------|-------|
| Workstation with real display (local runs) | Ready | IDE UI automation requires a display; headless only via xvfb on Linux (UC-07) |
| GitHub Actions runner `ubuntu-latest` (CI headless) | Ready | GitHub-hosted runner — no self-hosted infrastructure required |
| Network access to npm registry | Ready | Required at install time for WDIO/Serenity/Cucumber packages and the Serenity BDD jar |
| IDE binary installed on the machine/runner | Ready | VSCode baseline (`E2E_IDE=code`); Kiro/Antigravity/Kilo per compatibility matrix (UC-03) |

### 2.2 Software Dependencies

| Dependency | Version | Status |
|-----------|---------|--------|
| Node.js | 22.x (root `engines` field) | Installed — verify with `node --version` |
| npm | Bundled with Node 22.x | Installed |
| Java runtime (JDK/JRE) | 8+ | **Required for the Serenity BDD HTML report** — the `serenity-bdd` service renders HTML via a Java-based jar downloaded by `@serenity-js/serenity-bdd` postinstall (TDD OI-4). Fallback if unavailable: raw `serenity-summary.json` |
| IDE under test | VSCode 1.85.0+ baseline; forks per UC-03 matrix | VSCode installed; fork availability decided by SPIKE-1/UC-03 |
| xvfb (Linux CI only) | system package | Installed by the CI workflow (`apt-get install -y xvfb`); install hint on missing (FSD §7.1, TDD §9 row 8) |

### 2.3 Access Requirements

| Access | Type | Who Needs It |
|--------|------|-------------|
| Repo `main` branch | Read (clone/pull) | QA + Dev team |
| GitHub Actions | Enabled on the repo | Automated (workflow on push to `main` — UC-07) |
| IDE installation rights | Local admin (Windows) / sudo (Linux) | QA + Dev team |
| No credentials/tokens required | N/A | The committed `e2e/` config contains NO secrets (BR-02, gate G5) — env vars only (§6.1) |

### 2.4 Backup Requirements

No database backup applies (no DB in this epic). Before destructive local actions:

- [ ] Report artifacts preserved if needed: copy `e2e/target/site/serenity/` before running `npm run test:e2e:clean` (clean deletes `e2e/target/` recursively)
- [ ] Local env setup (IDE paths) recorded outside the repo (uncommitted `.env` or shell profile — BR-01)
- [ ] Committed framework files are recoverable from git history (revert path — §8)

---

## 3. Pre-Deployment Checklist

| # | Item | Responsible | Status |
|---|------|-------------|--------|
| 1 | `e2e/` skeleton committed to `main` (TDD gate G1) | Developer | ☐ |
| 2 | e2e unit tests passed: `npm run test:unit --prefix e2e` | Developer | ☐ |
| 3 | Existing suites regression-checked (extension vitest + backend tests): `npm test` | QA | ☐ |
| 4 | IDE binaries installed and paths verified (VSCode baseline + forks per UC-03) | QA | ☐ |
| 5 | Java runtime 8+ present (HTML report render — TDD OI-4), or fallback decision recorded | DevOps | ☐ |
| 6 | Environment variables prepared per §6.1 (E2E_IDE, E2E_IDE_BINARY_PATH, ...) — never committed (BR-01) | QA/Dev | ☐ |
| 7 | `.github/workflows/e2e-tests.yml` validated (YAML parse + trigger paths) | DevOps | ☐ |
| 8 | xvfb available on CI runner (auto-installed by workflow; fail-fast check inside job) | DevOps | ☐ |
| 9 | SPIKE-1..4 go/no-go decisions recorded in `documents/SA4E-341/spikes/` (BR-07) | QA/SA | ☐ |
| 10 | Rollback plan reviewed (§8) | Team | ☐ |

---

## 4. Database Migration

**Not applicable.** SA4E-341 has no database (TDD §7.1: "No database in this epic"). The only persisted data are Gherkin feature files, environment-variable configuration, committed spike artifacts, and generated report artifacts. No migration or rollback SQL exists for this epic.

---

## 5. Framework Setup & Deployment

### 5.1 Deployment Flow

```text
[Setup] npm --prefix e2e install  →  [Configure] env vars (§6.1)  →  [Run] npm run test:e2e
    →  WDIO runner spawns IDE (wdio-vscode-service, CDP)  →  Cucumber + Serenity/JS execute Gherkin scenarios
    →  Serenity BDD HTML report → e2e/target/site/serenity/  →  [Verify] open index.html (§7)
CI path: push to main → .github/workflows/e2e-tests.yml (Linux + xvfb-run, headless) → artifact upload (§5.6)
```

### 5.2 Local Setup — Windows 10+ (PowerShell)

| Step | Action | Command | Verification |
|------|--------|---------|-------------|
| 1 | Clone/pull the repo | `git clone https://github.com/dnguyenminh/SDLC-Agents-4-Enteprise.git` (or `git pull` on an existing clone) | `git log --oneline -1` shows the SA4E-341 commit |
| 2 | **Install e2e dependencies (explicit opt-in — NOT a workspace)** | `npm --prefix e2e install` | `Test-Path e2e\node_modules\@wdio\cli` is `True` |
| 3 | Verify Node version | `node --version` | `v22.x` |
| 4 | Verify Java (HTML report render) | `java -version` | Version 8+ printed; if missing, install JDK 8+ or plan the `serenity-summary.json` fallback (§2.2) |
| 5 | Set env vars (session scope) | `$env:E2E_IDE = "code"`; `$env:E2E_IDE_BINARY_PATH = "C:\Users\{user}\AppData\Local\Programs\Microsoft VS Code\Code.exe"`; `$env:E2E_HEADLESS = "false"` | `echo $env:E2E_IDE` prints the value |
| 6 | Run e2e unit tests first (fast sanity) | `npm run test:unit --prefix e2e` | All suites green (exit 0) |

> **Note (TDD §2.1):** do NOT rely on a blanket `npm install` at the repo root to install `e2e/` — the root `workspaces` array is `["backend", "extension"]` only. Step 2 (explicit `--prefix e2e install`) is mandatory.

### 5.3 Local Setup — Linux (bash)

| Step | Action | Command | Verification |
|------|--------|---------|-------------|
| 1 | Clone/pull the repo | `git clone https://github.com/dnguyenminh/SDLC-Agents-4-Enteprise.git` | `git log --oneline -1` |
| 2 | Install e2e dependencies | `npm --prefix e2e install` | `test -d e2e/node_modules/@wdio/cli && echo OK` |
| 3 | Install xvfb (only needed for headless runs) | `sudo apt-get install -y xvfb` | `which xvfb-run` prints a path |
| 4 | Verify Java (HTML report render) | `java -version` | Version 8+ printed |
| 5 | Set env vars | `export E2E_IDE=code`; `export E2E_IDE_BINARY_PATH=/usr/share/code/code`; `export E2E_HEADLESS=false` | `echo $E2E_IDE` |
| 6 | Run e2e unit tests first | `npm run test:unit --prefix e2e` | Exit 0 |

> **Note:** for a headless local run on Linux, prefix the test command with `xvfb-run -a` (§5.4) or export `DISPLAY=:99` with a running `Xvfb :99` process. `E2E_IDE_BINARY_PATH` must point to the actual executable, not a wrapper script that execs (verify with the IDE's `--version` flag).

### 5.4 Running the E2E Tests

| Purpose | Command (repo root) | Command (inside e2e/) | Notes |
|---------|--------------------|-----------------------|-------|
| Full E2E run (launches the IDE) | `npm run test:e2e` | `npm run test:e2e` (equivalently `npx wdio run wdio.conf.ts`) | Underlying command per TDD §5.1: `wdio run e2e/wdio.conf.ts` — resolved via `e2e/package.json` script `"test:e2e": "wdio run wdio.conf.ts"` |
| Headless run (Linux) | `xvfb-run -a npm run test:e2e` | `xvfb-run -a npm run test:e2e` | Also set `E2E_HEADLESS=true` so `wdio.conf.ts` adds `--disable-gpu`/`--no-sandbox` vscodeArgs (UC-07) |
| Clean previous report artifacts | `npm run test:e2e:clean` | same | Deletes `e2e/target/` recursively (safe — no DB, §2.4) |
| Regenerate/serve report only | `npm run test:e2e:report` | same | Windows: opens `target\site\serenity\index.html` via `start` — see Known Issue in RLN (Windows-only command) |
| Target a single feature | `npx wdio run wdio.conf.ts --spec ./features/smoke/launch.feature` (from `e2e/`) | same | Use during SPIKE/diagnosis only |

Run behavior (from `e2e/wdio.conf.ts`, SPIKE-1 actuals):

- Env validation runs at module load — invalid/missing `E2E_IDE` or `E2E_IDE_BINARY_PATH` aborts the run BEFORE the IDE launch with `EnvConfigError` (BR-01 fail fast).
- IDE sessions are serialized (`maxInstances: 1`); per-scenario retry = 2 (BR-03); IDE-connection retry = 1 with a 120s launch budget.
- Every failed step gets an automatic screenshot via the Serenity `Photographer` (BR-08); a capture failure never masks the original failure (TDD §9 row 5).
- Exit code: 0 on a fully green run; non-zero on any failure after retries.

### 5.5 Viewing the Serenity BDD HTML Report

| Environment | Command | Report Location |
|-------------|---------|-----------------|
| Windows local | `npm run test:e2e:report` (from repo root) — or double-click the file | `e2e\target\site\serenity\index.html` |
| Linux local | `xdg-open e2e/target/site/serenity/index.html` | `e2e/target/site/serenity/index.html` |
| CI (GitHub Actions) | Download the `serenity-report` artifact from the run page, unzip, open `index.html` in any browser | `e2e/target/site/serenity/` (uploaded with `if: always()` — pass OR fail, UC-07) |

Report contents (UC-06, TDD §7.4): `index.html` (entry point, standalone — no server required), `pages/` (per-scenario result pages + embedded failure screenshots), `serenity-summary.json` (raw JSON results — fallback evidence if the HTML render fails, TDD §9 row 6).

### 5.6 CI Deployment (GitHub Actions — headless Linux, UC-07)

Artifact: `.github/workflows/e2e-tests.yml` (new, E2E-only — no existing pipeline was modified; the repo previously had no `.github/` directory).

| Property | Value |
|----------|-------|
| Trigger | `push` to `main` + `pull_request` + `workflow_dispatch`, path-filtered to `e2e/**`, `extension/src/webview/**`, `extension/package.json`, and the workflow file itself |
| Runner | `ubuntu-latest` (GitHub-hosted) |
| Headless mode | `xvfb-run -a npm run test:e2e` with `E2E_HEADLESS=true`, `E2E_IDE=code` (VSCode baseline) |
| Caching | npm cache (setup-node) + `e2e/node_modules` keyed on `e2e/package-lock.json` hash |
| Java | Temurin JDK 17 (`setup-java`) — for the Serenity BDD HTML render (TDD OI-4) |
| IDE binary | Assumed preinstalled on GitHub-hosted runners — resolved via `command -v code` with an apt `.deb` install fallback (see Assumptions below) |
| Artifacts | `serenity-report` (HTML + screenshots) and `e2e-logs` (WDIO output) uploaded with `if: always()`, retention 14 days |
| Timeout | 30 min job cap — inside the job, the WDIO connection budget is 120s and the BR-06 stage budget is 15 min for up to 50 scenarios |
| Concurrency | Grouped per ref — a new push cancels a superseded in-progress run |

The job fails fast if xvfb is missing (validates `xvfb-run` presence BEFORE test execution — TDD §9 row 8) and publishes IDE/WDIO logs as artifacts on timeout (UC-07 EF-2).

---

## 6. Configuration Changes

### 6.1 Environment Variables (BR-01, TDD §7.2)

| Variable | Required | Values / Validation | Purpose | Local example (NEVER committed) |
|----------|----------|--------------------|---------|--------------------------------|
| `E2E_IDE` | Yes | `kiro` / `code` / `antigravity` / `kilo` (enum-validated, fail fast) | Target IDE type for wdio-vscode-service | `code` |
| `E2E_IDE_BINARY_PATH` | Yes | Must exist on the machine/runner; fail fast if missing | Path to the IDE executable | Windows: `C:\Users\{user}\AppData\Local\Programs\Microsoft VS Code\Code.exe` — Linux: `/usr/share/code/code` |
| `E2E_BASE_URL` | No | Must exist if provided (`existsSync`) | Workspace/folder opened by the IDE under test | `C:\projects\kiro\SDLC-Agents-4-Enterprise` |
| `E2E_HEADLESS` | Yes (CI) | `true` / `false` | Adds `--disable-gpu`/`--no-sandbox` vscodeArgs (UC-07) | `true` in CI |
| `E2E_FAIL_FAST` | No | `true` / `false` | Drives Cucumber `failFast` | `false` |
| `DISPLAY` | Yes (Linux headless) | e.g., `:99` (set by `xvfb-run -a`) | xvfb virtual display (UC-07) | `:99` |
| `CI` | Yes (CI) | `true` (set by GitHub Actions) | Drives `logLevel: info` for diagnosis (FSD §5.2) | `true` |

> **Rule (BR-02):** the committed `e2e/` configuration contains NO secrets and NO machine-specific paths (gate G5, TDD §8.4). Values above are per-machine examples only.

### 6.2 Configuration File Changes

| File | Change | Notes |
|------|--------|-------|
| `package.json` (root) | Scripts added: `"test:e2e"`, `"test:e2e:report"`, `"test:e2e:clean"` → `npm run ... --prefix e2e` | `workspaces` array unchanged `["backend", "extension"]` (TDD §8.2) |
| `.gitignore` | Added `e2e/target/`, `e2e/node_modules/` | Report artifacts and E2E deps never committed (TDD §8.2) |
| `e2e/package.json` | New standalone private package `@sa4e/e2e` — devDependencies per TDD §3.1 (pinned: WDIO ^9.32, Serenity ^3.48.2, Cucumber ^13.3, wdio-vscode-service ^8.0.0, tsx) | NOT in root workspaces (TDD §2.1) |
| `e2e/wdio.conf.ts` | New config contract — SPIKE-1 actuals: capability key `wdio:vscodeOptions`, binary option `binary`, `serenity` config key, `requireModule: ['tsx/cjs']` | Deviates from the FSD §5.2 sketch as sanctioned by TDD OI-5 |

### 6.3 Feature-Flag Settings

No feature flags are required. The framework is enabled by its presence: `npm run test:e2e` is opt-in and never runs implicitly (root `npm test` runs `--workspaces` only, which excludes `e2e/` — TDD §2.1).

### 6.4 External System Connection Strings

| System | Connection | Notes |
|--------|-----------|-------|
| IDE under test | WebDriver/CDP — launched by wdio-vscode-service with `--extensionDevelopmentPath`, CDP port, isolated `userSettings` | No static connection string; CDP port is ephemeral per session |
| npm Registry | HTTPS registry configured by npm | Required at install only |

---

## 7. Post-Deployment Verification

### 7.1 Health Checks

| Check | Command | Expected Result | Timeout |
|-------|---------|-----------------|---------|
| Node runtime | `node --version` | `v22.x` | 5s |
| e2e deps installed | `Test-Path e2e\node_modules\@wdio\cli` (PS) / `test -d e2e/node_modules/@wdio/cli` (bash) | True / OK | 5s |
| Java (HTML render) | `java -version` | 8+ | 5s |
| Env validation (fail fast — BR-01) | `npm run test:e2e` WITHOUT env vars set | Aborts with `EnvConfigError` naming `E2E_IDE`, exit code non-zero, BEFORE IDE launch | 15s |
| CI workflow valid | `actionlint` or YAML parse of `.github/workflows/e2e-tests.yml` | Parses cleanly, no errors | 10s |

### 7.2 Smoke Tests

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 1 | IDE launch smoke (UC-01/UC-03 evidence) | Set env vars (§6.1) → `npx wdio run wdio.conf.ts --spec ./features/smoke/launch.feature` (from `e2e/`) | Workbench ready, scenario green, exit 0 |
| 2 | Report artifact generated (UC-06) | After any run → open `e2e/target/site/serenity/index.html` | Report opens standalone, scenario listed, no server required |
| 3 | Existing suites unaffected (BR-05, TDD gate G2) | `npm test` (root) | Extension vitest + backend tests pass; no IDE launched by the blanket run |

### 7.3 Log Verification

| Log Entry | Level | Expected | Location |
|-----------|-------|----------|----------|
| `EnvConfigError` on invalid env | ERROR | Aborts BEFORE IDE launch, names the offending env var + setup instructions (BR-01) | Console |
| WDIO session start (IDE spawn) | INFO (CI) / WARN (local) | IDE binary path in launch args — acceptable, not a secret (TDD §10.1) | Console / CI job log |
| Serenity BDD report render | INFO | `serenity-summary.json` written after the run (UC-06) | `e2e/target/site/serenity/` |
| Failure screenshots | — | Every failed step has a screenshot in `pages/` (BR-08) | `e2e/target/site/serenity/pages/` |
| No ERROR/FATAL during a green run | — | Zero ERROR entries on a fully passing run | CI job log / console |

### 7.4 Monitoring Dashboard

- [ ] GitHub Actions run page shows the E2E workflow status (pass/fail per push to `main` — UC-07)
- [ ] `serenity-report` artifact published on every run (pass OR fail)
- [ ] BR-06 budget respected: CI stage ≤ 15 minutes for up to 50 scenarios; report render < 60s
- [ ] Flaky rate below 5% over 10 consecutive runs (TDD gate G3); persistent flakiness → defect ticket, never masked (BR-03)

---

## 8. Rollback Plan

### 8.1 Rollback Flow

```text
[Issue detected] → severity decision (§8.2)
  → Critical: revert the offending commit(s) on main (git revert) → verify smoke (§7.2) → re-deploy CI
  → Local-only: npm run test:e2e:clean (artifacts) and/or rm -rf e2e/node_modules + re-install (deps)
  → CI-only: disable/adjust .github/workflows/e2e-tests.yml trigger (workflow_dispatch only) → verify workflow parse
  → Verify rollback → Success: close / Fail: escalate to Dev Lead
```

### 8.2 Rollback Decision Criteria

| Condition | Action |
|-----------|--------|
| Framework change breaks existing suites (`npm test` red — TDD gate G2) | Immediate revert of the offending commit on `main` |
| CI job blocks the team (all-red / hours of instability) | Switch the workflow trigger to `workflow_dispatch` only while diagnosing |
| Env-config regression (fail-fast no longer aborts before IDE launch — BR-01) | Immediate revert + QA re-test of §7.1 health check 4 |
| Report artifacts missing on failures (UC-06/BR-08 regression) | Revert + QA re-test of §7.2 smoke 2 |
| Minor report rendering glitch | Hotfix — no rollback |
| Local-only dependency corruption | `npm run test:e2e:clean` + reinstall `e2e/node_modules` — no code rollback |

### 8.3 Rollback Steps

| Step | Action | Command | Verification |
|------|--------|---------|--------------|
| 1 | Identify the offending commit | `git log --oneline -10 -- e2e/ .github/workflows/e2e-tests.yml package.json` | Commit found |
| 2 | Revert it on `main` (no force-push) | `git revert <commit> && git push origin main` | CI runs green on the revert commit |
| 3 | Rollback CI (if the workflow itself is the problem) | Edit `.github/workflows/e2e-tests.yml` → `on: workflow_dispatch` only | YAML parses; job no longer triggers on push |
| 4 | Clean local artifacts/deps (if local-only) | `npm run test:e2e:clean` and/or `rm -rf e2e/node_modules && npm --prefix e2e install` | `npm run test:e2e` green again |
| 5 | Verify rollback | Re-run smoke tests (§7.2) | Scenarios 1–3 pass; existing suites still green |

### 8.4 Rollback Time Estimate

| Action | Estimated Time |
|--------|---------------|
| Git revert + push | 5 minutes |
| CI trigger adjustment | 5 minutes |
| Local artifact/deps cleanup + reinstall | 10 minutes |
| Verification (smoke + existing suites) | 15 minutes |
| **Total** | **≈ 35 minutes** |

---

## 9. Environment-Specific Notes

### 9.1 Local DEV — Windows 10+

- `E2E_IDE_BINARY_PATH` example: `C:\Users\{user}\AppData\Local\Programs\Microsoft VS Code\Code.exe` — verify with the IDE's version flag; never committed (BR-01).
- `npm run test:e2e:report` uses the Windows `start` command (`target\site\serenity\index.html`) — Windows-only (known issue, see RLN §4).
- Fork IDEs (Kiro/Antigravity/Kilo) install per-user by default; record each fork's binary path in the compatibility matrix (UC-03) before running `E2E_IDE=kiro|antigravity|kilo`.
- IDE launch uses the real display; do NOT set `E2E_HEADLESS=true` on Windows until SPIKE-4 validates it (UC-07 AF-1).

### 9.2 CI — Linux headless (primary, UC-07)

- GitHub Actions workflow: `.github/workflows/e2e-tests.yml` — runner `ubuntu-latest`, `xvfb-run -a` wrapper, `E2E_HEADLESS=true`, `E2E_IDE=code` (VSCode baseline).
- The workflow auto-installs xvfb and validates its presence BEFORE test execution (fail fast — TDD §9 row 8).
- Java (Temurin 17) installed for the Serenity BDD HTML render (TDD OI-4); if a Java-free runner is mandated later, the fallback is raw `serenity-summary.json` (UC-06 AF-1) — record the decision in the spike findings register (BR-07).
- IDE/WDIO logs are uploaded as artifacts on every run including timeouts (UC-07 EF-2).
- VSCode on GitHub-hosted runners may require `--no-sandbox` (added automatically by `wdio.conf.ts` when `E2E_HEADLESS=true`).

### 9.3 CI — Windows (UC-07 AF-1)

- **Status: DEFERRED** pending SPIKE-4 validation (BRD risk 4).
- If validated later: reuse `.github/workflows/e2e-tests.yml` structure with a `windows-latest` job, remove the xvfb wrapper, install VSCode + Java via Chocolatey/`setup-java`, keep artifacts identical.
- Any go/no-go decision must be recorded in `documents/SA4E-341/spikes/` (BR-07).

### 9.4 PROD (Committed Framework on `main`)

- **Deployment Window:** regular push to `main` (Autonomy Level 3); CI job runs on push — UC-07.
- **Approval Required From:** Dev Lead (code review) + QA Lead (green suites).
- **Communication Plan:** QA team notified when the framework lands on `main`; report artifact location shared.
- **On-Call Contact:** DevOps Agent (SDLC pipeline).

---

## 10. Appendix

### Contacts

| Role | Name | Contact |
|------|------|---------|
| DevOps Lead | DevOps Agent (SDLC pipeline) | Via Jira SA4E-341 |
| QA Lead | QA Agent (SDLC pipeline) | Via Jira SA4E-341 |
| On-Call Dev | Dev Agent (SDLC pipeline) | Via Jira SA4E-341 |

### Related Tickets

| Ticket | Summary | Relationship |
|--------|---------|-------------|
| SA4E-341 | [E2E Testing] Serenity/JS + wdio-vscode-service for VSCode-based IDEs | Main ticket |
| SA4E-340 | Serenity/JS evaluation spike (BACKLOG/DISCOVERY) | Predecessor spike |
| SA4E-349 | (parallel ticket) | Unrelated to this deliverable — do not couple |

### Assumptions Recorded (CI workflow)

1. The CI workflow targets the TDD §5.1/§7.2 contract: env vars `E2E_IDE`, `E2E_IDE_BINARY_PATH`, `E2E_HEADLESS`; run command `npm run test:e2e` → `wdio run wdio.conf.ts` (via `e2e/package.json`). If the dev-agent's scripts change shape, update the workflow steps accordingly.
2. GitHub-hosted `ubuntu-latest` runners are assumed to have VSCode preinstalled; the workflow resolves the binary via `command -v code` with an apt `.deb` install fallback. If neither path yields an executable, the job fails fast with a clear message.
3. Java (Temurin 17) is assumed acceptable on the CI runner for the Serenity BDD HTML render (TDD OI-4) — fallback documented.
4. The `e2e/package-lock.json` committed with the skeleton is used for the npm cache key; if the lockfile is regenerated with different pinned versions, the cache key self-invalidates (hash-based).

*End of DPG — SA4E-341 v1.0.*

---

## CI Headless Trigger (P2) — update 2026-10-10
- Điều kiện: commit + push branch main (hiện thay đổi chưa commit — CI chỉ chạy sau push)
- Trigger: GitHub Actions auto on push/PR (paths e2e/**); hoặc `gh workflow run e2e-tests.yml` nếu có workflow_dispatch
- Xem kết quả: `gh run list --workflow=e2e-tests.yml`; artifact Serenity report
- Local verification: YAML valid, jobs (setup-node, npm ci, vitest, xvfb-run wdio, artifact) đúng
