# Release Notes (RLN)

## SDLC-Agents-4-Enterprise — SA4E-335: Backend Container Image & CI Build-Push

---

## Release Information

| Field | Value |
|-------|-------|
| Release Version | 1.0 — image published by CI as `sha-<short>` / `latest`; semver tag pending deployment phase |
| Release Date | 2026-10-15 |
| Jira Ticket | SA4E-335 |
| Environment | UAT (current target) |
| Author | DevOps Agent |
| Status | Active |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-15 | DevOps Agent | Initiate document — initial release notes incl. Delta Entry 2026-10-15 (stdio MCP child servers baked into image) |

---

## 1. What's New

### 1.1 Feature Summary

The SA4E backend now ships as a production-hardened container image published
automatically by CI. The image bundles everything the backend needs at runtime —
including (since 2026-10-15) two built-in document-processing helper servers and
an offline multilingual embedding model — so a deployment host needs only Docker.

### 1.2 User-Facing Changes

| # | Change | Description | Impact |
|---|--------|-------------|--------|
| 1 | Container image on registry | Backend is deployed by pulling a pinned image digest; no host-side Node.js/Python setup needed | High |
| 2 | Built-in MCP document servers (Delta 2026-10-15) | Markdown conversion (MarkItDown) and markdown export are available without any host-side installation | Medium |
| 3 | Offline semantic embeddings (Delta 2026-10-15) | Multilingual embedding model baked into the image — semantic search works without internet model downloads | Medium |

### 1.3 Delta Entry — 2026-10-15 (what's new in this image build)

- **Two stdio MCP child servers baked into the image** (new `mcp-python` build
  stage — Dockerfile now has 7 stages):
  - `markitdown-mcp` 0.0.1a7 (PyPI, Microsoft MarkItDown)
  - `markdown-exporter-mcp-local` 0.1.0 (GitHub source, commit-pinned
    `1429b6a9…` — not on npm/PyPI)
- **Embedding model baked by default** (`BAKE_EMBEDDING_MODEL=true`):
  `Xenova/paraphrase-multilingual-MiniLM-L12-v2` (quantized, ~130 MB) at
  `/app/models-cache`; slim builds opt out and mount a volume instead.
- **`mcp>=1.27.0,<2.0.0` pin** for the exporter venv — upstream declares
  `mcp>=1.27.0` unbounded but imports an API removed in mcp 2.x; unconstrained
  installs crash with ModuleNotFoundError (caught by a build-time import probe).
- **No package managers at runtime (SEC-05)**: the production apt layer is
  `python3` only; `pip`/`pip3`/`git`/`pandoc` are absent (pandoc ships inside
  the `pypandoc-binary` wheel); venv pip is stripped during build.

---

## 2. Technical Changes

### 2.1 API Changes

| Type | Endpoint | Description |
|------|----------|-------------|
| None | — | No API surface change in this delta; existing MCP/health endpoints unchanged |

### 2.2 Database Changes

| Type | Object | Description |
|------|--------|-------------|
| None (schema) | — | No migration in this release; backend auto-migrates at startup (idempotent) |
| Data seed (required) | `mcp_servers` | Post-deploy rows with bare commands — see DPG §4.2 / §9.1 |

### 2.3 Configuration Changes

| Property | Change Type | Description |
|----------|-------------|-------------|
| `TRANSFORMERS_CACHE` | New (image ENV) | Points to baked /app/models-cache |
| `PATH` | Modified (image ENV) | Prepends the two venv bin dirs (bare-command spawn) |
| `PYTHONUNBUFFERED` | New (image ENV) | Keeps MCP child stderr streaming |
| Build ARGs | New | `MARKITDOWN_MCP_VERSION`, `MARKDOWN_EXPORTER_MCP_REF`, `BAKE_EMBEDDING_MODEL` |

### 2.4 Infrastructure Changes

| Component | Change | Description |
|-----------|--------|-------------|
| backend/Dockerfile | Modified | 6 → 7 stages; new `mcp-python`; production runtime adds python3 + 2 read-only venvs + models-cache |
| CI workflow | Unchanged | build-push-backend.yml unchanged by this delta (Trivy gate now covers the new layers) |
| docker-compose.yml | Unchanged | No compose change required for the default (baked-model) build |

---

## 3. Bug Fixes

| # | Ticket | Summary | Severity |
|---|--------|---------|----------|
| 1 | SA4E-335 | DEF-001: .dockerignore broke the in-container `test` stage (tests/ + .env.test excluded) | Major |
| 2 | SA4E-335 | DEF-002: DATABASE_URL_FILE not consumed → engine fell back to sqlite in compose | Major |
| 3 | SA4E-335 | DEF-003: ONNX sidecar crash-loop (env gated via two-file overlay) | Major |
| 4 | SA4E-335 | DEF-004: Trivy HIGH findings in bundled npm CLI → npm 11.21.0 bump + same-major patches + Debian CVE upgrades | High |

---

## 4. Known Issues & Limitations

| # | Issue | Impact | Workaround | Target Fix |
|---|-------|--------|------------|------------|
| 1 | MCP child servers spawn ONLY from DB config | Without `mcp_servers` rows the servers never start inside the container | Seed bare-command rows post-deploy (DPG §4.2) | Follow-up config tooling |
| 2 | Legacy uv/Windows-path MCP configs fail in container | Older config entries using `uv --directory C:/...` cannot spawn | Replace with bare commands | N/A (by design) |
| 3 | REINDEX mandatory after deploy | Old hash-based vectors are incompatible with ONNX vectors — cross-generation comparison is forbidden | Full workspace reindex via code-intel pipeline (one-time) | One-time migration action |
| 4 | Two-lockfile sync rule | Backend dep changes must update BOTH the root workspace lock AND backend/package-lock.json, or Docker builds install stale deps | `npm install` (root) + `npm install --package-lock-only --workspaces=false` (in backend/) | Process rule |
| 5 | `model_cache` volume not pre-declared in compose | Slim builds (`BAKE_EMBEDDING_MODEL=false`) fail compose validation if only the service mount is added | Declare the named volume in an override (DPG §9.4) | Follow-up compose tweak |

---

## 5. Dependencies

### 5.1 Pre-requisite Releases

| Release | Status | Required Before |
|---------|--------|-----------------|
| SA4E-215 (`mcp_servers` table + admin routes) | Merged | This release (DB config source for MCP spawn) |

### 5.2 External System Changes

| System | Change Required | Status |
|--------|-----------------|--------|
| GHCR | Repo variables `REGISTRY` / `IMAGE_NAME` set (lowercase) | Done |

---

## 6. Migration Notes

### 6.1 Data Migration

| Migration | Description | Automated | Estimated Time |
|-----------|-------------|-----------|----------------|
| `mcp_servers` seed | 2 rows with bare commands (markitdown, markdown-exporter) | No (SQL / Admin API) | < 5 min |
| Full REINDEX | Regenerate all stored vectors with the ONNX backend | Yes (code-intel indexing pipeline, operator-triggered) | Depends on workspace size |

### 6.2 Breaking Changes

| Change | Impact | Migration Path |
|--------|--------|----------------|
| Vector generation backend (hash → ONNX) | Old vectors must NOT be compared or mixed with new ONNX vectors | Full reindex after deploy (§6.1) |

### 6.3 Backward Compatibility

API and DB schema are fully backward compatible. Older images simply never
spawn `mcp_servers` bare-command rows whose commands they do not ship. The only
behavioral break is the vector-space generation (§6.2) — resolved by reindex.

---

## 7. Testing Summary

| Test Level | Total | Passed | Failed | Blocked | Pass Rate |
|-----------|-------|--------|--------|---------|-----------|
| STC v1.2 (config/build/integration/smoke/CI/security) | 49 | 39 | 0 | 10 | 100% of runnable (10 blocked: GitHub-runner-only evidence) |
| Pentest (Phase 6.3) | PASS | — | — | — | Risk LOW |
| Image build verification (2026-10-15) | 3 checks | 3 | 0 | 0 | `docker build --check` clean; production build SUCCESS; stdio smoke 2/2 (markitdown + markdown-exporter) |

---

## 8. Deployment Instructions

See `documents/SA4E-335/DPG.md` (§5 deployment steps, §9 deploy-notes delta).

Quick reference: pull pinned digest → provision secrets → `docker compose up -d`
→ seed `mcp_servers` rows (bare commands) → verify `/health` → run FULL REINDEX.

---

## 9. Rollback Plan

Repin the previous image digest in a compose override and `up -d` (DPG §8).
No DB migration rollback is required; optionally set `disabled=1` on the seeded
MCP rows. **Estimated rollback time:** < 10 minutes.

---

## 10. Contacts

| Role | Name | Responsibility |
|------|------|----------------|
| DevOps | DevOps Agent (SDLC pipeline) | Deployment execution |
| Release Manager | SM Agent | Release coordination |

---

## 11. Approval

| Role | Name | Date | Signature |
|------|------|------|-----------|
| Dev Lead | | | ☐ Approved |
| QA Lead | | | ☐ Approved |
| Business Owner | | | ☐ Approved |
| Release Manager | | | ☐ Approved |
