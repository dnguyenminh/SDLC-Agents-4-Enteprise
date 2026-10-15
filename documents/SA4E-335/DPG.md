# Deployment Guide (DPG)

## SDLC-Agents-4-Enterprise — SA4E-335: Backend Container Image & CI Build-Push

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-335 |
| Title | Backend Dockerfile + docker-compose production hardening + CI build & push |
| Author | DevOps Agent |
| Version | 1.0 |
| Date | 2026-10-15 |
| Status | Active (ticket at UAT gate) |
| Related Docs | BUILD-AND-REGISTRY.md, TDD.md, FSD.md, UAT-READINESS.md, SECURITY-ASSESSMENT.md |

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-10-15 | DevOps Agent | Initiate document — consolidated from BUILD-AND-REGISTRY.md + verified Dockerfile/compose state; includes Deploy-Notes Delta 2026-10-15 (stdio MCP child servers baked into image) |

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

SA4E-335 containerizes the SA4E backend (Node.js 22 + Hono Code-Intelligence MCP
server) and ships it with a production-hardened compose stack (postgres/pgvector,
Docker secrets, resource limits, healthchecks) plus a CI pipeline that builds and
publishes the image to a container registry on every push. Since 2026-10-15 the
image also bakes two Python stdio MCP child servers and the ONNX embedding model.

### 1.2 Deployment Scope

| Item | Type | Description |
|------|------|-------------|
| `backend/Dockerfile` | Modified | 7-stage multi-stage build (base, deps, build, mcp-python, production, development, test); production = sole CI push target |
| Stdio MCP child servers | New (in image) | `markitdown-mcp` + `markdown-exporter-mcp-local` baked as /opt venvs (Delta 2026-10-15) |
| Embedding model | New (in image) | ONNX quantized model baked into /app/models-cache by default (~130 MB) |
| `backend/docker-compose.yml` | Unchanged by Delta 2026-10-15 | Production-hardened stack: secrets, limits, healthchecks, read-only rootfs |
| CI (build-push-backend.yml) | Unchanged by Delta 2026-10-15 | Build & push on main/tag push + PR validation; Trivy CRITICAL/HIGH gate |
| Database | No schema migration | Backend auto-applies its migrations at startup (idempotent); post-deploy SEED of `mcp_servers` rows REQUIRED (see §9.1) |

### 1.3 Target Environments

| Environment | Deploy Order | Approval Required |
|-------------|--------------|-------------------|
| DEV | 1st | No |
| SIT | 2nd | No |
| UAT | 3rd | QA Sign-off (current phase) |
| PROD | 4th | PM + Business Sign-off |

---

## 2. Prerequisites

### 2.1 Infrastructure

| Requirement | Notes |
|-------------|-------|
| Docker Engine 24+ / Compose v2 | Verified 29.6.1 + Compose v5.2.0 on the UAT host |
| Container registry access | GHCR by default (`ghcr.io/<owner>/<repo>/backend`), repo variables `REGISTRY` / `IMAGE_NAME` |
| Network | Backend publishes to loopback `127.0.0.1:48721` by default (`PUBLISH_HOST`); postgres unpublished (internal network only, SEC-06) |

### 2.2 Software Dependencies

| Dependency | Version | Status |
|-----------|---------|--------|
| Node.js runtime | 22 (in image, digest-pinned `node:22-slim`) | Bundled |
| PostgreSQL + pgvector | pg16 (`pgvector/pgvector:pg16`, digest-pinned) | Compose service |
| Python 3 runtime | In image (interpreter only — NO package managers, §9.2) | Bundled (Delta 2026-10-15) |

### 2.3 Access Requirements

| Access | Type | Who Needs It |
|--------|------|--------------|
| Registry pull | GHCR (or stored token for other registries) | Deploy host |
| DB ops access | psql / `docker compose exec` | DBA / DevOps |
| GitHub Actions | Built-in `GITHUB_TOKEN` for GHCR push | CI only |

### 2.4 Backup Requirements

- [ ] Postgres volume backup (`postgres_data`) before upgrade
- [ ] Previous image digest recorded (`docker images --digests`) for rollback
- [ ] `.env.production` + `secrets/*` preserved on the deploy host (never committed)

---

## 3. Pre-Deployment Checklist

| # | Item | Responsible | Status |
|---|------|-------------|--------|
| 1 | Code merged to `main` and CI Build & Test green | Developer | ☐ |
| 2 | CI "Build & push backend image" run green (Trivy 0 CRITICAL/HIGH) | CI | ☐ |
| 3 | Target image digest recorded (immutable deploy ref) | DevOps | ☐ |
| 4 | Postgres volume backup completed | DBA | ☐ |
| 5 | Secret files present on deploy host (`secrets/postgres_password`, `secrets/database_url`) | DevOps | ☐ |
| 6 | `.env.production` reviewed (limits, PUBLISH_HOST) | DevOps | ☐ |
| 7 | `mcp_servers` seed rows prepared with bare commands (§4.2, §9.1) | DevOps | ☐ |
| 8 | REINDEX plan acknowledged — MANDATORY after deploy (§9.3) | Team | ☐ |
| 9 | Rollback plan reviewed (§8) | Team | ☐ |
| 10 | Deployment window confirmed | PM | ☐ |

---

## 4. Database Migration

### 4.1 Migration Scripts

This ticket ships **no new migration**. The backend applies its own migrations at
startup (001..004 + idempotent schema-registry ensures, incl. the `mcp_servers`
table from SA4E-215) — verified on both postgresql and sqlite engines.

### 4.2 Post-Deploy Data Seeding (Delta 2026-10-15 — REQUIRED)

Insert one row per stdio MCP child server so orchestration spawns the baked
servers (primary source = DB, `WHERE disabled=0`). Preferred: Admin API/UI
(`POST /api/admin/mcp/servers`). Direct SQL (PostgreSQL syntax):

```sql
INSERT INTO mcp_servers
  (server_id, project_id, name, transport_type, url, command, args, env, disabled, created_at, updated_at)
VALUES
  ('mcp-markitdown', '<PROJECT_ID>', 'markitdown', 'stdio', NULL, 'markitdown-mcp', '[]', '{}', 0, NOW(), NOW()),
  ('mcp-markdown-exporter', '<PROJECT_ID>', 'markdown-exporter', 'stdio', NULL, 'markdown-exporter-mcp-local', '[]', '{}', 0, NOW(), NOW());
```

⚠️ `command` MUST be the bare console-script name (both are on the in-image
PATH). `args`/`env` are text columns — store `'[]'` / `'{}'`. Legacy Windows
configs using `uv` + `--directory C:/projects/...` DO NOT WORK in the container.

### 4.3 Verification Queries

```sql
SELECT name, command, args, disabled FROM mcp_servers WHERE disabled = 0;
-- expect the 2 rows above (plus any pre-existing enabled servers)
```

### 4.4 Rollback Scripts

```sql
UPDATE mcp_servers SET disabled = 1 WHERE server_id IN ('mcp-markitdown', 'mcp-markdown-exporter');
```

---

## 5. Application Deployment

### 5.1 Deployment Steps (compose)

| Step | Action | Command | Verification |
|------|--------|---------|--------------|
| 1 | Pull the pinned image | `docker pull ghcr.io/<owner>/<repo>/backend@sha256:<DIGEST>` | digest resolves |
| 2 | Provision secrets | `cp secrets/postgres_password.example secrets/postgres_password` (same for `database_url`), then edit with REAL values | files exist, git-ignored |
| 3 | Runtime env | `cp .env.production.example .env.production` and review | file exists |
| 4 | Start stack | `docker compose --env-file .env.production up -d` | both containers `healthy` |
| 5 | Health check | `curl -fsS http://127.0.0.1:48721/health` | HTTP 200, modules ready |

To run a specific digest, pin it via a compose override (`image:`) or retag —
do **not** rely on `latest` outside DEV. If `BAKE_EMBEDDING_MODEL=false` was
used for the image, ALSO mount the model-cache volume BEFORE start (§9.4).

---

## 6. Configuration Changes

### 6.1 Runtime Environment (image/compose-baked — no operator action)

| Variable | Value | Source |
|----------|-------|--------|
| `NODE_ENV` | production | compose (D-1) |
| `PORT` | 48721 | compose |
| `DATABASE_URL_FILE` | /run/secrets/database_url | compose (SEC-03) |
| `DATABASE_ADAPTER` | postgresql | compose |
| `TRANSFORMERS_CACHE` | /app/models-cache | Dockerfile ENV |
| `PATH` (prepended) | /opt/markitdown-venv/bin:/opt/markdown-exporter-venv/bin | Dockerfile ENV |
| `PYTHONUNBUFFERED` | 1 | Dockerfile ENV |

### 6.2 Build ARGs (CI / local build only)

See BUILD-AND-REGISTRY.md §8.3 — `MARKITDOWN_MCP_VERSION`,
`MARKDOWN_EXPORTER_MCP_REF`, `BAKE_EMBEDDING_MODEL` (plus pre-existing
`NODE_VERSION`, `NODE_BASE_DIGEST`, `NPM_VERSION`).

### 6.3 Feature Flags

None in this ticket.

---

## 7. Post-Deployment Verification

### 7.1 Health Checks

| Check | Command | Expected | Timeout |
|-------|---------|----------|---------|
| Backend health | `curl -fsS http://127.0.0.1:48721/health` | HTTP 200, `status: healthy`, all modules ready | 30s |
| Postgres | `docker compose ps` | `sa4e-postgres` healthy | 60s |
| MCP child spawn | restart backend after DB seed; check logs | both bare commands spawn, no errors | 60s |

### 7.2 Smoke Tests

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 1 | Health endpoint | `curl /health` | 200 + tools_loaded > 0 |
| 2 | MCP stdio child | trigger a markdown conversion / export task via the app | tool responds, no spawn error in logs |
| 3 | Embeddings | trigger semantic search | ONNX cache hit (no model download attempt), results returned |

### 7.3 Log Verification

| Log Entry | Level | Expected |
|-----------|-------|----------|
| `Backend MCP Server ready` | INFO | within ~10s of start |
| `[engine-adapter] Active engine: postgresql` | INFO | with DATABASE_URL_FILE set |
| MCP child server stderr (JSON-RPC) | INFO | streaming (PYTHONUNBUFFERED=1) |
| pip/git invocations | — | must NOT appear (absent from image, §9.2) |

---

## 8. Rollback Plan

### 8.1 Decision Criteria

| Condition | Action |
|-----------|--------|
| Health check fails after deploy | Immediate rollback (repin previous digest) |
| Error rate increase > 5% | Immediate rollback |
| MCP child servers fail to spawn (bad config) | Fix DB rows first (§4.2) — image rollback not required |
| Embedding quality regression | Rollback image; then re-evaluate §9.3 reindex state |

### 8.2 Rollback Steps

| Step | Action | Command | Verification |
|------|--------|---------|--------------|
| 1 | Record current (broken) digest | `docker images --digests` | for post-mortem |
| 2 | Repin previous digest in override | `image: ghcr.io/<owner>/<repo>/backend@sha256:<PREV_DIGEST>` | `docker compose config` validates |
| 3 | Redeploy | `docker compose --env-file .env.production up -d` | containers healthy |
| 4 | Disable MCP rows if implicated | SQL in §4.4 | query returns 0 enabled |
| 5 | Verify | `curl /health` | HTTP 200 |

Database: no migration to roll back for this ticket; the seeded `mcp_servers`
rows are backward-compatible with previous images (commands they do not ship
are simply never spawned).

---

## 9. Deploy Notes Delta — 2026-10-15 (MANDATORY READING)

> Delta for the image build that bakes the two stdio MCP child servers + the
> ONNX embedding model (details: BUILD-AND-REGISTRY.md §8).

### 9.1 Post-deploy DB config REQUIRED for MCP spawn

The backend does NOT run the MCP child servers itself — it spawns them from
config. Primary source: DB table `mcp_servers` (`WHERE disabled=0`);
`orchestration.json` is only a file-fallback when the DB is empty
(`documents/MCP-DB-CONFIG-REQUEST.md`). Seed rows with **bare commands** (§4.2):
`{"command": "markitdown-mcp", "args": []}` and
`{"command": "markdown-exporter-mcp-local", "args": []}`.

⚠️ TRAP: legacy Windows configs using `uv` + `--directory C:/projects/...`
FAIL in the container (no uv, no Windows paths).

### 9.2 python3 present — NO package managers (SEC-05)

The runtime image contains the `python3` interpreter ONLY. `pip`, `pip3`,
`git`, `pandoc` are ABSENT; the venvs' bundled `pip` was stripped at build
time. Any operational procedure assuming pip/git inside the backend container
fails by design.

### 9.3 REINDEX MANDATORY after this deploy

The embedding backend switched to the baked ONNX model
(`Xenova/paraphrase-multilingual-MiniLM-L12-v2`). **Vectors produced by the
old hash-based backend are NOT compatible with ONNX vectors — never compare or
mix vector generations.** After deploying, run a FULL reindex of the workspace
(code-intel indexing pipeline) so every stored vector is regenerated by the
same ONNX backend before any semantic search result is trusted.

### 9.4 Slim-build model-cache volume option

`BAKE_EMBEDDING_MODEL=false` produces a slim image (~130 MB lighter) but then a
**writable named volume must be mounted** at `/app/models-cache` for runtime
model download. The base compose file mentions this mount in a comment but does
NOT pre-declare the `model_cache` volume — compose validation fails on an
undeclared named volume, so add BOTH the service mount AND the top-level volume
declaration in an override file (BUILD-AND-REGISTRY.md §8.7).

---

## 10. Appendix

### References

| Doc | Purpose |
|-----|---------|
| documents/SA4E-335/BUILD-AND-REGISTRY.md | Build commands, tag scheme, image verification, Delta 2026-10-15 |
| documents/MCP-DB-CONFIG-REQUEST.md | mcp_servers single-source-of-truth + spawn model |
| documents/SA4E-335/UAT-READINESS.md | UAT gate evidence |
| documents/SA4E-335/SECURITY-ASSESSMENT.md | SEC-01..13 controls |

### Related Tickets

| Ticket | Relationship |
|--------|--------------|
| SA4E-215 | `mcp_servers` schema + admin routes |
| SA4E-44 | AD-6 capability items (model-cache origin) |
