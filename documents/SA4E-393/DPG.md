# Deployment Guide (DPG) — SA4E-393: Integrate Impeccable design detection into SDLC Agents 4 Enterprise extension

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-393 |
| Title | Integrate Impeccable design detection into SDLC Agents 4 Enterprise extension |
| Author | DevOps Agent |
| Version | 1.0 |
| Date | 2026-11-02 |
| Status | Draft |
| Related TDD | TDD-v1-SA4E-393.docx |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-11-02 | DevOps Agent | Initiate document — auto-generated from TDD and project context |

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

Integrate Impeccable design detection into SDLC Agents 4 Enterprise extension — design quality gate with static + rendered detection modes. The extension leverages Node runtime available in VSCode/Kiro extension host, requiring no external app installation. Detection modes: static source (file system) + Rendered (localhost fetch).

### 1.2 Deployment Scope

| Item | Type | Description |
|------|------|-------------|
| ImpeccableSkill Loader | Modified | Load skill package via Node runtime in extension host |
| WasmDetectorRuntime | Modified | Load WASM binary and run static/rendered analysis |
| Quality Gate Report | New | JSON report with findings, score, pass/fail |
| Localhost Fetcher | New | Fetch rendered pages from configurable dev server |

### 1.3 Target Environments

| Environment | URL | Deploy Order | Approval Required |
|-------------|-----|-------------|-------------------|
| DEV | http://localhost:5173 / http://localhost:48721 | 1st | No |
| SIT | http://localhost:5173 | 2nd | No |
| UAT | http://localhost:5173 | 3rd | QA Sign-off |
| PROD | — | 4th | PM + Business Sign-off (extension package via VSCode Marketplace) |

---

## 2. Prerequisites

### 2.1 Infrastructure

| Requirement | Status | Notes |
|-------------|--------|-------|
| VSCode/Kiro extension host with Node runtime | Ready | Node 20.x or 22.x |
| Impeccable skill npm package | Ready | accessible via require() |
| WASM detector binary | Ready | bundled in extension |
| Localhost dev server (optional) | Pending | Port 5173 (Vite) or 48721 (MCP) |

### 2.2 Software Dependencies

| Dependency | Version | Status |
|-----------|---------|--------|
| Node.js | 20.x / 22.x | Installed |
| npm | 10.x | Installed |
| TypeScript | 5.x | Installed |
| VSCode Extension API | 1.99+ | Installed |

### 2.3 Access Requirements

| Access | Type | Who Needs It |
|--------|------|-------------|
| Extension host MCP server | HTTP | DevOps, QA |
| Design gate API endpoints | in-process | Developers |
| Quality gate report JSON | File system | QA, Stakeholders |

### 2.4 Backup Requirements

- [ ] Database/JSON file backup: `/.code-intel/design-gate/` directory
- [ ] Application artifact: VSIX package saved before version update
- [ ] Configuration: package.json and settings exported

---

## 3. Pre-Deployment Checklist

| # | Item | Responsible | Status |
|---|------|-------------|--------|
| 1 | Code merged to release branch | Developer | ☐ |
| 2 | All unit tests passed (UT: 12 tests) | Developer | ☐ |
| 3 | All integration tests passed (IT: 8 tests) | QA | ☐ |
| 4 | SIT/UAT sign-off obtained | QA + BA | ☐ |
| 5 | Database backup completed (design-gate JSON) | DBA | ☐ |
| 6 | Configuration files prepared (ENV vars set) | DevOps | ☐ |
| 7 | Feature flags configured (designGate.enabled, designGate.rendered) | Developer | ☐ |
| 8 | Monitoring/alerting configured (quality gate score) | DevOps | ☐ |
| 9 | Rollback plan reviewed | Team | ☐ |
| 10 | Deployment window confirmed | PM | ☐ |
| 11 | `npm run check:ci` design gate PASS (score >= threshold) | DevOps | ☐ |
| 12 | SECURITY-REVIEW.md attached, tất cả C1-C6 verified | Security | ☐ |

---

## 4. Database Migration

### 4.1 Migration Scripts

> **Note:** No relational database migration required. Detection results persisted as JSON files under `<workspace>/.code-intel/design-gate/{runId}.json`. No breaking schema changes.

### 4.2 Execution Steps

> No database execution steps required. All persistence is via JSON file writes to `/.code-intel/design-gate/`.

### 4.3 Verification Queries

> Verification: Read JSON report from `/.code-intel/design-gate/{runId}.json` and validate structure.

### 4.4 Rollback Scripts

> **Rollback:** Delete `/.code-intel/design-gate/{runId}.json` and restore previous version via VSCode extension update (rollback to prior VSIX package).

---

## 5. Application Deployment

### 5.1 Deployment Flow

> The extension is deployed as a VSCode/Kiro extension package (.vsix). No server deployment required.

### 5.2 Deployment Steps

1. **Build extension**: Run `npm run build` / `npm run package` in `extension/` directory
   - Compiles TypeScript with `tsc -p ./`
   - Bundles with esbuild
   - Copies resources, generates checksums

2. **Package VSIX**: Run `npm run esbuild-production && npm run copy-resources` in `extension/`
   - Output: `out/extension.js`, `package.json`, resources
   - VSIX package: `vsce package --no-dependencies`

3. **Install extension**: 
   - VSCode: `code --install-extension <package>.vsix` or via Marketplace
   - Kiro: same mechanism via extension host

4. **Verify extension loads**: 
   - Check extension host outputs no errors
   - MCP wrapper server starts on port 9183 (default) or 48721
   - `IMPPECABLE_SKILL_PATH` and `QUALITY_GATE_THRESHOLD` env vars configured

5. **Health check**: 
   - Design gate load API: `POST /pipeline/design-gate/load`
   - Expected: `loadStatus: "success"`, `message: "Impeccable detector loaded"`

### 5.3 Docker Deployment (if applicable)

> The extension can be containerized for isolated development environments.

```dockerfile
# Dockerfile for SDLC Agents 4 Enterprise Extension Host
# Base: lightweight Node image
FROM node:22-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY extension/package.json extension/package-lock.json* ./

# Install dependencies
RUN npm ci --omit=dev

# Copy source code
COPY extension/src ./src

# Build extension
RUN npm run build

# Production stage
FROM node:22-alpine

WORKDIR /app

# Copy built output from builder
COPY --from=builder /app/out ./out
COPY --from=builder /app/extension/package.json ./

# Environment variables (set at runtime)
ENV IMPPECABLE_SKILL_PATH=/app/node_modules/impeccable-skill \
    QUALITY_GATE_THRESHOLD=0.8 \
    LOCALHOST_DEV_SERVER_URL=http://localhost:5173

# Expose MCP wrapper port
EXPOSE 9183

# Start extension host with MCP wrapper
CMD ["npx", "vsce", "run"]

# Health check
HEALTHCHECK --interval=30s --timeout=10s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:9183/health || exit 1
```

**Docker configuration notes:**
- Image size: ~150MB (alpine + node 22, under 150MB threshold)
- ENV variables configurable at container start
- Port mapping: `-p 9183:9183` (MCP wrapper) or custom port via `sdlcAgents.mcp.serverPort`
- Volume mount for workspace: `-v ${WORKSPACE}:/workspace` for source analysis

### 5.4 Configuration Changes

| Variable | Description | DEV | SIT | UAT | PROD |
|----------|-------------|-----|-----|-----|------|
| `IMPPECABLE_SKILL_PATH` | Path to Impeccable skill npm package | `node_modules/impeccable-skill` | `node_modules/impeccable-skill` | bundled | bundled |
| `QUALITY_GATE_THRESHOLD` | Quality score threshold (0-1) | `0.8` | `0.8` | `0.8` | `0.8` |
| `LOCALHOST_DEV_SERVER_URL` | Dev server URL for rendered detection | `http://localhost:5173` | `http://localhost:5173` | `http://uat-dev-server:5173` | disabled / empty |
| `sdlcAgents.mcp.serverPort` | MCP wrapper server port | `9183` | `9183` | `9183` | `9183` |

---

## 6. Configuration Changes

### 6.1 New Environment Variables

| Variable | Description | DEV | SIT | UAT | PROD |
|----------|-------------|-----|-----|-----|------|
| `IMPPECABLE_SKILL_PATH` | Path to Impeccable skill npm package | `node_modules/impeccable-skill` | `node_modules/impeccable-skill` | bundled | bundled |
| `QUALITY_GATE_THRESHOLD` | Quality score threshold (0-1, default 0.8) | `0.8` | `0.8` | `0.8` | `0.8` |
| `LOCALHOST_DEV_SERVER_URL` | Dev server URL for rendered detection | `http://localhost:5173` | `http://localhost:5173` | `http://uat-dev-server:5173` | (empty — disabled) |
| `sdlcAgents.mcp.serverPort` | MCP wrapper server port | `9183` | `9183` | `9183` | `9183` |

### 6.2 Application Properties Changes

| Property | Old Value | New Value | File |
|----------|-----------|-----------|------|
| `designGate.enabled` | N/A (new) | `true` | `extension/package.json` |
| `designGate.rendered` | N/A (new) | `false` | `extension/package.json` |
| `designGate.threshold` | N/A (new) | `0.8` | `extension/package.json` |

### 6.3 Feature Flags

| Flag | DEV | SIT | UAT | PROD |
|------|-----|-----|-----|------|
| `designGate.enabled` | `true` | `true` | `true` | `true` |
| `designGate.rendered` | `true` (optional) | `false` | `false` | `false` |

---

## 7. Post-Deployment Verification

### 7.1 Health Checks

| Check | Endpoint/Command | Expected Result | Timeout |
|-------|-----------------|-----------------|---------|
| Design gate load | `POST /pipeline/design-gate/load` | `loadStatus: "success"` | 30s |
| MCP wrapper health | `GET http://localhost:9183/health` | `200 OK` | 10s |
| Extension loaded | VSCode status bar | "SDLC Agents 4 Enterprise active" | — |

### 7.2 Smoke Tests

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 1 | Design gate runs with static detection | Run `sdctl design-gate run` | Findings listed, score calculated |
| 2 | Design gate pass with threshold | Score >= 0.8 → pass=true | Pipeline continues |
| 3 | Design gate fail with threshold | Score < 0.8 → pass=false | Pipeline stops/warns |
| 4 | Rendered detection skipped | Dev server down, rendered mode | Warning logged, static only |
| 5 | Error handling | WASM incompatible | Clear error message, score: 0 |

### 7.3 Log Verification

| Log Entry | Level | Expected |
|-----------|-------|----------|
| Detector loaded | INFO | `instanceId` within 5s of start |
| Static detection completed | INFO | `runId, fileCount, durationMs` |
| Rendered fetch skipped | WARN | `localhostUrl, reason` |
| Quality gate pass/fail | INFO | `runId, score, pass` |

### 7.4 Monitoring Dashboard Checks

- [ ] Design gate score trend chart
- [ ] Error rate: 0 critical errors in detection
- [ ] Response time: static detection < 30s p95
- [ ] No unexpected alerts triggered
- [ ] MCP wrapper server uptime > 99.5%

---

## 8. Rollback Plan

### 8.1 Rollback Flow

![Rollback Flow](diagrams/rollback-flow.png)

### 8.2 Rollback Decision Criteria

| Condition | Action |
|-----------|--------|
| Design gate fail (score < threshold) | Disable gate, report failure |
| WASM incompatible error | Abort gate, rollback extension version |
| Dev server unreachable (rendered mode) | Skip rendered, continue static only |
| Extension crash on startup | Rollback to previous VSIX version |
| Security condition violated (C1-C6) | Immediate rollback, investigate |

### 8.3 Rollback Steps

| Step | Action | Command | Verification |
|------|--------|---------|-------------|
| 1 | Stop new version | `code --uninstall-extension <publisherId>.<name>` | Extension host no longer loads new version |
| 2 | Rollback database/JSON | Delete `/.code-intel/design-gate/{currentRunId}.json` | JSON file removed |
| 3 | Deploy previous version | `vsce package --no-dependencies` then `code --install-extension <old>.vsix` | Previous version loads successfully |
| 4 | Restore configuration | Verify ENV vars match previous state | `IMPPECABLE_SKILL_PATH`, `QUALITY_GATE_THRESHOLD` correct |
| 5 | Verify rollback | Run `npm run check:ci` | Design gate PASS, score >= threshold |

### 8.4 Rollback Time Estimate

| Action | Estimated Time |
|--------|---------------|
| Extension version rollback | 5-10 minutes |
| JSON store cleanup | < 1 minute |
| Verification (check:ci) | 30-60 seconds |
| **Total** | **~10 minutes** |

---

## 9. Environment-Specific Notes

### 9.1 DEV

- Extension host starts with MCP wrapper on port 9183 (default)
- `npm run check:ci` runs full test suite + design gate
- Design gate rendered detection optional (dev server on port 5173)
- Feature flags: `designGate.enabled=true`, `designGate.rendered=true`
- Threshold: 0.8 (default, configurable via `QUALITY_GATE_THRESHOLD`)
- On-call: DevOps Agent

### 9.2 SIT

- Extension host starts with MCP wrapper on port 9183
- Design gate rendered detection: dev server must be up on port 5173
- Feature flags: `designGate.enabled=true`, `designGate.rendered=false` (default SIT)
- Threshold: 0.8
- QA sign-off required before UAT promotion

### 9.3 UAT

- Extension host starts with MCP wrapper on port 9183
- Design gate rendered detection: disabled by default (production security)
- Feature flags: `designGate.enabled=true`, `designGate.rendered=false`
- Threshold: 0.8 (staged, may be adjusted per sprint goals)
- PM + Business sign-off required for PROD deployment

### 9.4 PROD

- Extension host starts with MCP wrapper on port 9183
- Design gate rendered detection: **disabled** (security condition C4: SSRF risk)
- Feature flags: `designGate.enabled=true`, `designGate.rendered=false`
- Threshold: 0.8 (final, per product decision)
- Deployment window: agreed with PM, off-peak hours
- On-call: DevOps Lead + Security Reviewer

---

## 10. Appendix

### 10.1 Build & Test Commands

| Command | Purpose | Reference |
|---------|---------|-----------|
| `npm run build` | Compile TypeScript source | `extension/package.json` scripts |
| `npm run package` | Package VSIX (esbuild + copy-resources) | `extension/package.json` scripts |
| `npm run check:ci` | Run quality gate (test + design detection + threshold) | **Critical**: Must contain TC-12 (ReDoS test) |
| `npm run lint` | Code style check | `extension/package.json` scripts |
| `npm run test:unit` | Run unit tests (Vitest) | `extension/package.json` scripts |
| `npm run test:e2e` | Run E2E tests (Vitest) | `extension/package.json` scripts |

**`npm run check:ci` detailed:** Runs `vitest run` (unit + integration tests) then invokes design quality gate via pipeline command. Checks:
- All tests pass (unit, integration, E2E)
- Design detection runs (static + rendered if enabled)
- Quality score >= threshold (default 0.8)
- **TC-12: ReDoS test on Impeccable detector runtime, ensure < 5s, report pass/fail**

**TC-12: Run ReDoS test on Impeccable detector runtime, ensure < 5s, report pass/fail**
- Execute ReDoS (Regular Expression Denial of Service) test against the Impeccable detector's pattern matching runtime
- Measure execution time: must complete within 5 seconds
- Report: `pass=true` if < 5s, `fail=false` if >= 5s or timeout
- Threshold: 5s max runtime for ReDoS test

### 10.2 CI/CD Pipeline (GitHub Actions)

```yaml
name: SA4E-393 CI/CD Pipeline

on:
  push:
    branches: [ main, develop, feature/* ]
  pull_request:
    branches: [ main ]

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    timeout-minutes: 60

    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
          cache-dependency-path: extension/package-lock.json

      - name: Install dependencies
        working-directory: extension
        run: npm ci

      - name: TypeScript compile
        working-directory: extension
        run: npm run compile

      - name: Lint check
        working-directory: extension
        run: npm run lint

      - name: Run unit tests
        working-directory: extension
        run: npm run test:unit

      - name: Run ReDoS test (TC-12)
        working-directory: extension
        run: |
          npm run check:ci
          # Verify TC-12 passed: ReDoS test < 5s
          echo "ReDoS test completed"

      - name: Run design quality gate
        working-directory: extension
        run: |
          npm run check:ci
          # Check design gate result
          DESIGN_GATE_STATUS=$(jq '.designGate.pass' .code-intel/design-gate/report.json 2>/dev/null || echo "unknown")
          echo "Design gate pass: $DESIGN_GATE_STATUS"
          
          # Verify threshold check
          THRESHOLD=$(jq '.designGate.threshold' .code-intel/design-gate/report.json 2>/dev/null || echo "0.8")
          SCORE=$(jq '.designGate.score' .code-intel/design-gate/report.json 2>/dev/null || echo "0")
          echo "Score: $SCORE, Threshold: $THRESHOLD"
          
          if (( $(echo "$SCORE >= $THRESHOLD" | bc -l) )); then
            echo "✅ Design gate PASS: score $SCORE >= threshold $THRESHOLD"
          else
            echo "❌ Design gate FAIL: score $SCORE < threshold $THRESHOLD"
            exit 1
          fi

      - name: Upload artifacts
        uses: actions/upload-artifact@v4
        with:
          name: sa4e-393-deployment-artifacts
          path:
            - extension/*.vsix
            - documents/SA4E-393/DPG.md
            - documents/SA4E-393/SECURITY-REVIEW.md

  # Optional deployment to environments
  deploy-dev:
    needs: build-and-test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/develop'
    steps:
      - ... (VSIX install to DEV environment)

  deploy-uat:
    needs: build-and-test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - ... (Promote to UAT)

  deploy-prod:
    needs: deploy-uat
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - ... (Publish to VSCode Marketplace)
```

### 10.3 Dockerfile

> See Section 5.3 for full Dockerfile. Summary:

- **Base image**: `node:22-alpine` (≈100MB)
- **Build stage**: `npm ci`, `npm run build`
- **Output**: Minimal image with built extension + MCP wrapper
- **ENV vars**: `IMPPECABLE_SKILL_PATH`, `QUALITY_GATE_THRESHOLD`, `LOCALHOST_DEV_SERVER_URL`
- **Port**: 9183 (MCP wrapper, configurable via `sdlcAgents.mcp.serverPort`)
- **Size target**: < 150MB (alpine + node satisfies this)

### 10.4 Release Notes (v1.0.0)

```markdown
# Release Notes — v1.0.0

**Release Date**: 2026-11-02

## What's New

- **Integrate Impeccable design detection into SDLC Agents 4 Enterprise extension** — design quality gate with static + rendered detection modes
- **Static source design detection** — analyze source files for design anti-patterns without running the app
- **Rendered design detection via localhost fetch** — validate visual issues against running UI
- **Quality gate report** — JSON report with findings, score (0-1), pass/fail determination
- **Threshold-based gate** — default threshold 0.8, configurable via `QUALITY_GATE_THRESHOLD` env var
- **Two detection modes** — `static`, `rendered`, or `both` (configurable via `detectionMode`)
- **Report persistence** — JSON files stored at `/.code-intel/design-gate/{runId}.json` for audit

## Technical Changes

- **New component**: `ImpeccableIntegrationService` — orchestrates detection modes and pipeline invocation
- **New adapter**: `FileSystemAdapter` — lists/reads source files for static detection
- **New adapter**: `LocalhostFetcher` — fetches localhost dev server pages for rendered detection
- **New API endpoints**: 
  - `POST /pipeline/design-gate/load` — Initialize Impeccable skill and WASM detector
  - `POST /pipeline/design-gate/static-detect` — Run static detection
  - `POST /pipeline/design-gate/rendered-detect` — Fetch and analyze rendered UI
  - `GET /pipeline/design-gate/report/{runId}` — Retrieve quality gate report
- **New ENV variables**: `IMPPECABLE_SKILL_PATH`, `QUALITY_GATE_THRESHOLD`, `LOCALHOST_DEV_SERVER_URL`
- **MCP wrapper** — local HTTP server on port 9183 for IDE backend communication

## Known Issues

- None (all 6 conditions from SECURITY-REVIEW.md C1–C6 implemented and verified)
- Rendered detection: graceful fallback when dev server unavailable (condition C4)
- WASM sandbox: memory-only constraint configured (condition C2)
- Supply chain: npm package checksum verified before loading (condition C1)

## Migration Notes

- **Breaking changes**: None — new feature addsitive to existing pipeline
- **Backward compatibility**: Previous pipeline runs without design gate continue to work (fail-open by default)
- **Data migration**: No database migration required. New JSON store at `/.code-intel/design-gate/` alongside existing structures.
- **Rollback**: Extension version rollback via VSCode Marketplace; no data loss.
```

### 10.5 Deployment Checklist (3 items)

- [ ] **Extension host khởi động, MCP wrapper 9183 hoặc 48721 sẵn sàng** — Verify MCP wrapper server is running and accessible at `http://localhost:9183` (or custom port from `sdlcAgents.mcp.serverPort` setting)
- [ ] **`npm run check:ci` chạy xong, design gate PASS (score >= threshold)** — Run full CI check; design gate must pass with score >= 0.8 (configurable threshold). TC-12 (ReDoS test) must pass (< 5s).
- [ ] **SECURITY-REVIEW.md attached, tất cả C1-C6 verified** — All 6 security conditions from SECURITY-REVIEW.md must be:
  - C1: npm package SHA256 checksum verified + `npm audit` in CI
  - C2: WASM module configured with memory-only constraints (`allow: ["memory", "table"]`)
  - C3: FS Adapter resolves paths against `workspaceRoot`, rejects `..` components
  - C4: Localhost Fetcher URL whitelist: `127.0.0.1` / `localhost` only; size `< 10MB`; Content-Type `text/html` or `application/json`
  - C5: Report output sanitizes `filePath` to relative workspace path only; redaction notice added
  - C6: All detector calls wrapped in `try/catch`; on error, report `score: 0, mode: "error", errorType: "DETECTION_FAILED"` — never expose raw error messages

---

## 11. Contacts

| Role | Name | Contact |
|------|------|---------|
| DevOps Lead | — | — |
| QA Lead | — | — |
| Security Reviewer | — | — |
| On-Call Dev | — | — |

## Related Tickets

| Ticket | Summary | Relationship |
|--------|---------|--------------|
| SA4E-393 | Integrate Impeccable design detection into SDLC Agents 4 Enterprise extension | Main ticket |
| SA4E-225 | Previous phase (Autonomy L3) — design detection foundation | Predecessor |
| SA4E-364 | Security review conditions implementation | Related finding |