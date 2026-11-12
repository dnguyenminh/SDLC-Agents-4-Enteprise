# Deployment Guide (DPG) — SA4E-406: drawio_auto_layout: Detector Precision + Verify Loop + ELK Compound + Extension Migration

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-406 |
| Title | drawio_auto_layout: Detector Precision + Verify Loop + ELK Compound + Extension Migration |
| Author | DevOps Agent |
| Version | 1.1 |
| Date | 2026-11-12 |
| Status | Draft |
| Related TDD | documents/SA4E-406/TDD.md (if exists) |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-11-08 | DevOps Agent | Initiate document — based on merge commit 3061986b |
| 1.1 | 2026-11-12 | DevOps Agent | Re-pointed stale backend test-fixture references to surviving diagram corpus (deployment.drawio, sequence-verify-loop.drawio) |

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

SA4E-406 delivers critical improvements to the `drawio_auto_layout` MCP tool:

1. **Detector Precision** — Enhanced layout issue detection with calibrated thresholds:
   - Node overlaps: `OVERLAP_EPS = 0.05` (5% area threshold)
   - Node proximity: `MIN_GAP = 40px` (minimum breathing room)
   - Child outside container: `CONTAINMENT_TOL = 5px` (tolerance)
   - Diagonal edges: 20px tolerance
   - Edge crossings: node, edge-edge, container

2. **Verify Loop** — Fix → re-parse → re-detect cycle with `remaining_issues` tracking

3. **ELK Compound Layout** — Hierarchical container support with 4 algorithms:
   - `layered` (default), `force`, `mrtree`, `radial`

4. **Extension Migration** — Tools available via MCP bridge:
   - `drawio_auto_layout` — Auto-fix layout issues
   - `drawio_export_png` — Export diagrams to PNG

5. **Multi-worktree Path Resolution** (SA4E-394) — `base_dir` + `workspace_root` support

6. **Security** — Path traversal prevention (CWE-22), configurable limits

### 1.2 Deployment Scope

| Item | Type | Description |
|------|------|-------------|
| drawio_auto_layout tool | Enhanced | Backend MCP tool with improved detection/fix |
| drawio_export_png tool | Enhanced | Backend MCP tool for PNG export |
| Extension MCP bridge | Existing | Proxies drawio tools to backend |
| Multi-worktree path resolver | Existing | Used by drawio tools for path resolution |
| ELK.js layout engine | Existing | Compound layout for hierarchical diagrams |

### 1.3 Target Environments

| Environment | URL | Deploy Order | Approval Required |
|-------------|-----|-------------|-------------------|
| DEV | http://localhost:9183 (MCP) | 1st | No |
| SIT | http://localhost:9183 | 2nd | No |
| UAT | http://localhost:9183 | 3rd | QA Sign-off (COMPLETED) |
| PROD | — | 4th | PM + Business Sign-off |

---

## 2. Prerequisites

### 2.1 Infrastructure

| Requirement | Status | Notes |
|-------------|--------|-------|
| Backend MCP server (port 9183) | Ready | Node 22.x, tsx runner |
| Extension host with MCP proxy | Ready | VSCode/Kiro extension |
| ELK.js (elkjs npm package) | Ready | Bundled in backend |
| draw.io CLI (for export_png) | Optional | Required for PNG export |

### 2.2 Software Dependencies

| Dependency | Version | Status |
|-----------|---------|--------|
| Node.js | 22.23.4 | Installed |
| npm | 10.x | Installed |
| TypeScript | 5.x | Installed |
| elkjs | 0.9.x | Bundled |
| draw.io CLI | 24.x | System install (optional) |

### 2.3 Access Requirements

| Access | Type | Who Needs It |
|--------|------|-------------|
| Backend MCP server | HTTP | DevOps, QA, Extension |
| Extension MCP proxy | in-process | Developers, QA |
| File system (diagrams) | Local/NFS | Backend, Extension |

### 2.4 Backup Requirements

- [ ] Diagram files backup: `documents/*/diagrams/*.drawio`
- [ ] Backend built artifacts: `backend/dist/`
- [ ] Configuration: `package.json`, env vars documented

---

## 3. Pre-Deployment Checklist

| # | Item | Responsible | Status |
|---|------|-------------|--------|
| 1 | Code merged to main branch | Developer | ✅ (3061986b) |
| 2 | All unit tests passed (UT: 80 tests) | Developer | ✅ |
| 3 | All integration tests passed (IT: 3 tests) | QA | ✅ |
| 4 | E2E tests passed (E2E: 2 tests) | QA | ✅ |
| 5 | UAT sign-off obtained | QA + BA | ✅ (UAT PASS) |
| 6 | CI pipeline green (7/7 jobs) | DevOps | ✅ |
| 7 | Configuration files prepared (ENV vars set) | DevOps | ☐ |
| 8 | Monitoring/alerting configured | DevOps | ☐ |
| 9 | Rollback plan reviewed | Team | ☐ |
| 10 | Deployment window confirmed | PM | ☐ |
| 11 | `npm run check:ci` PASS | DevOps | ☐ |

---

## 4. Database Migration

### 4.1 Migration Scripts

> **Note:** No relational database migration required. The drawio tools operate on local `.drawio` files only. No persistent database state changes.

### 4.2 Execution Steps

> No database execution steps required.

### 4.3 Verification Queries

> Verification: Run drawio tools on `documents/SA4E-406/diagrams/deployment.drawio` and `documents/SA4E-406/diagrams/sequence-verify-loop.drawio`, verify output XML validity.

### 4.4 Rollback Scripts

> **Rollback:** Revert to previous backend version. Diagram files are modified in-place by the tool — ensure backups exist before running.

---

## 5. Application Deployment

### 5.1 Deployment Flow

```
1. Build backend TypeScript
2. Start MCP server on port 9183
3. Extension proxy connects to backend
4. Tools available via execute_dynamic_tool
```

### 5.2 Deployment Steps

1. **Build backend**:
   ```bash
   cd backend
   npm run build
   ```

2. **Start MCP server**:
   ```bash
   CODE_INTEL_PORT=9183 CODE_INTEL_WORKSPACE=/path/to/workspace npx tsx src/index.ts &
   ```

3. **Verify server health**:
   ```bash
   curl http://localhost:9183/health
   ```

4. **Test drawio_auto_layout**:
   ```bash
   curl -X POST http://localhost:9183/mcp \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"execute_dynamic_tool","arguments":{"toolName":"drawio_auto_layout","arguments":{"file_path":"test.drawio"}}},"id":1}'
   ```

5. **Test drawio_export_png**:
   ```bash
   curl -X POST http://localhost:9183/mcp \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","method":"tools/call","params":{"name":"execute_dynamic_tool","arguments":{"toolName":"drawio_export_png","arguments":{"file_path":"test.drawio","output_path":"test.png"}}},"id":1}'
   ```

6. **Verify extension proxy** (if using extension):
   ```bash
   cd extension
   npm run test:e2e:drawio
   ```

### 5.3 Docker Deployment (if applicable)

```dockerfile
# Dockerfile for Backend MCP Server with drawio tools
FROM node:22-alpine AS builder

WORKDIR /app
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --omit=dev

COPY backend/src ./src
COPY backend/tsconfig.json ./
RUN npm run build

FROM node:22-alpine

WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY backend/package.json ./

# Install draw.io CLI for export_png (optional)
# RUN apk add --no-cache openjdk11 && npm install -g @drawio/cli

ENV CODE_INTEL_PORT=9183 \
    SA4E_ELK_MAX_NODES=500 \
    SA4E_ELK_TIMEOUT_MS=10000 \
    SA4E_ELK_SPACING_MAX=500

EXPOSE 9183

CMD ["node", "dist/index.ts"]
```

**Docker configuration notes:**
- Image size: ~150MB (alpine + node 22)
- ENV variables configurable at container start
- Port mapping: `-p 9183:9183`
- Volume mount for diagrams: `-v ${DIAGRAMS_DIR}:/workspace/documents`

### 5.4 Configuration Changes

| Variable | Description | DEV | SIT | UAT | PROD |
|----------|-------------|-----|-----|-----|------|
| `CODE_INTEL_PORT` | MCP server port | `9183` | `9183` | `9183` | `9183` |
| `SA4E_ELK_MAX_NODES` | Max diagram nodes for ELK | `500` | `500` | `500` | `500` |
| `SA4E_ELK_TIMEOUT_MS` | ELK layout timeout (ms) | `10000` | `10000` | `10000` | `10000` |
| `SA4E_ELK_SPACING_MAX` | Max spacing for layout | `500` | `500` | `500` | `500` |
| `CODE_INTEL_WORKSPACE` | Workspace root for path resolution | `/workspace` | `/workspace` | `/workspace` | `/workspace` |

---

## 6. Configuration Changes

### 6.1 New Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SA4E_ELK_MAX_NODES` | Max nodes before rejecting diagram | `500` |
| `SA4E_ELK_TIMEOUT_MS` | ELK layout timeout in ms | `10000` |
| `SA4E_ELK_SPACING_MAX` | Max node spacing in pixels | `500` |

### 6.2 Tool Arguments (via MCP)

| Tool | Argument | Type | Default | Description |
|------|----------|------|---------|-------------|
| `drawio_auto_layout` | `file_path` | string | required | Path to .drawio file |
| `drawio_auto_layout` | `algorithm` | enum | `layered` | `layered\|force\|mrtree\|radial` |
| `drawio_auto_layout` | `spacing` | number | `80` | Node spacing (px) |
| `drawio_auto_layout` | `direction` | enum | `DOWN` | `DOWN\|RIGHT\|LEFT\|UP` |
| `drawio_auto_layout` | `scope` | enum | `auto` | `auto\|positions\|ports` |
| `drawio_auto_layout` | `relayout` | boolean | `false` | Force full ELK relayout |
| `drawio_auto_layout` | `base_dir` | string | optional | Worktree root for path resolution |
| `drawio_auto_layout` | `workspace_root` | string | optional | Legacy alias for base_dir |
| `drawio_export_png` | `file_path` | string | required | Path to .drawio file |
| `drawio_export_png` | `output_path` | string | optional | Output PNG path |

---

## 7. Post-Deployment Verification

### 7.1 Health Checks

| Check | Endpoint/Command | Expected Result | Timeout |
|-------|-----------------|-----------------|---------|
| MCP server health | `GET http://localhost:9183/health` | `200 OK` | 10s |
| Tool list includes drawio | `tools/list` via MCP | `drawio_auto_layout`, `drawio_export_png` | 10s |

### 7.2 Smoke Tests

| # | Scenario | Steps | Expected Result |
|---|----------|-------|-----------------|
| 1 | Clean diagram returns already_good | Run drawio_auto_layout on simple diagram | `status: "already_good"`, file unchanged |
| 2 | Overlap diagram auto-fixed | Run drawio_auto_layout on overlapping nodes | `status: "fixed"`, `remaining_issues < before` |
| 3 | ELK compound layout works | Run on nested containers | Children within parent bounds |
| 4 | All 4 algorithms work | Test layered, force, mrtree, radial | All complete without error |
| 5 | Export PNG works | Run drawio_export_png | PNG file created |
| 6 | Path traversal blocked | Try `../../../etc/passwd` | Error: "Path rejected" |
| 7 | Multi-worktree base_dir works | Use base_dir=wt-b | File resolved in worktree B |
| 8 | Remaining issues tracked | Check response | `remaining_issues: number` present |

### 7.3 Log Verification

| Log Entry | Level | Expected |
|-----------|-------|----------|
| Detector loaded | INFO | `detectAllIssues` called |
| Fix applied | INFO | `handleApply` with strategy (local/ELK/ports) |
| File written | INFO | Fixed XML written to file |
| Remaining issues | INFO | `remaining_issues: N` logged |

### 7.4 Performance Benchmarks

| Metric | Target | Verification |
|--------|--------|--------------|
| Detect (100 nodes) | < 500ms | Automated test |
| Parse (100 nodes) | < 200ms | Automated test |
| ELK layout (50 nodes) | < 5s | Automated test |
| Local repair (10 nodes) | < 1s | Automated test |

---

## 8. Rollback Plan

### 8.1 Rollback Decision Criteria

| Condition | Action |
|-----------|--------|
| Diagram corrupted after fix | Restore from backup, disable auto-fix |
| ELK layout timeout/failure | Fallback to local repair only |
| Extension proxy fails | Use backend MCP directly |
| Path resolution broken | Revert to legacy pinned-root mode |

### 8.2 Rollback Steps

| Step | Action | Command | Verification |
|------|--------|---------|-------------|
| 1 | Stop new backend | `pkill -f "tsx src/index.ts"` | Port 9183 free |
| 2 | Restore diagram backups | `cp -r /backup/diagrams/* /workspace/documents/` | Files restored |
| 3 | Deploy previous backend version | `git checkout <prev-commit> && npm run build` | Old version runs |
| 4 | Restart MCP server | `CODE_INTEL_PORT=9183 npx tsx src/index.ts &` | Health check passes |
| 5 | Verify rollback | Run smoke tests | All pass |

### 8.3 Rollback Time Estimate

| Action | Estimated Time |
|--------|---------------|
| Stop backend | < 1 minute |
| Restore diagram backups | 2-5 minutes |
| Deploy previous version | 5-10 minutes |
| Restart & verify | 2-3 minutes |
| **Total** | **~15 minutes** |

---

## 9. Environment-Specific Notes

### 9.1 DEV

- MCP server on port 9183
- All algorithms available
- Rendered detection: N/A (backend only)
- Feature flags: all enabled
- On-call: DevOps Agent

### 9.2 SIT

- MCP server on port 9183
- Extension proxy connected
- Integration tests run against backend
- QA sign-off before UAT

### 9.3 UAT

- MCP server on port 9183
- **UAT COMPLETED** — PASS confirmed
- Extension E2E tests pass
- Ready for PROD promotion

### 9.4 PROD

- MCP server on port 9183
- Extension proxy connected
- Monitoring on health endpoint
- On-call: DevOps Lead

---

## 10. Appendix

### 10.1 Build & Test Commands

| Command | Purpose |
|---------|---------|
| `cd backend && npm run build` | Compile TypeScript |
| `cd backend && npm run test:unit` | Run unit tests (Vitest) |
| `cd backend && npm run test:integration` | Run integration tests |
| `cd backend && npm run check:ci` | Full CI check (lint + build + tests) |
| `cd extension && npm run test:e2e:drawio` | E2E drawio tests via extension |

### 10.2 CI/CD Pipeline (GitHub Actions)

```yaml
name: SA4E-406 CI/CD Pipeline

on:
  push:
    branches: [ main, develop, feature/* ]
  pull_request:
    branches: [ main ]

jobs:
  backend-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
      - run: cd backend && npm ci
      - run: cd backend && npm run lint
      - run: cd backend && npm run build
      - run: cd backend && npm run test:unit
      - run: cd backend && npm run test:integration

  extension-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
          cache-dependency-path: extension/package-lock.json
      - run: cd extension && npm ci
      - run: cd extension && npm run compile
      - run: cd extension && npm run test:e2e:drawio

  deploy-dev:
    needs: [backend-test, extension-test]
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/develop'
    steps:
      - ... (Deploy to DEV)
```

### 10.3 Deployment Checklist (4 items)

- [ ] **Backend MCP server khởi động, health endpoint 200 OK** — Verify `curl http://localhost:9183/health` returns 200
- [ ] **drawio tools có trong tool list** — `tools/list` contains `drawio_auto_layout` and `drawio_export_png`
- [ ] **Smoke tests PASS** — All 8 smoke test scenarios pass (clean fix, overlap fix, compound layout, 4 algorithms, export PNG, path traversal blocked, multi-worktree, remaining_issues)
- [ ] **Performance benchmarks PASS** — Detect < 500ms (100 nodes), ELK < 5s (50 nodes)

---

## 11. Contacts

| Role | Name | Contact |
|------|------|---------|
| DevOps Lead | — | — |
| QA Lead | — | — |
| On-Call Dev | — | — |

---

## Related Tickets

| Ticket | Summary | Relationship |
|--------|---------|--------------|
| SA4E-406 | drawio_auto_layout: Detector Precision + Verify Loop + ELK Compound + Extension Migration | Main ticket |
| SA4E-84 | Original drawio_auto_layout implementation | Predecessor |
| SA4E-394 | Multi-worktree path resolution (base_dir) | Dependency |
| SA4E-356 | Path traversal security hardening | Security fix |