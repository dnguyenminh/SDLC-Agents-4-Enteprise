# Build & Registry Guide — SA4E-335 (backend container image)

This document explains how to build the backend Docker image locally and in CI,
how it is published to a container registry, and how to reproduce / verify a
published image. It implements FSD Story 4 (BR-20..BR-23).

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-335 |
| Artifacts | `backend/Dockerfile`, `backend/docker-compose.yml`, `.github/workflows/build-push-backend.yml` |
| Base image | `debian:trixie-slim` (Debian 13, glibc) + official Node 22.23.4 binary tarball (SHA-256 pinned) |
| Runtime | Node.js 22 + Hono MCP server (Code Intelligence), port `48721` |
| Registry (default) | GHCR (`ghcr.io`), configurable via repo variables |

---

## 1. Base-image decision

- **`debian:trixie-slim` (Debian 13, glibc) + official Node 22.23.4 binary tarball** — chosen over `node:22-slim` because Node official images have no trixie variant, so Node is installed from the official tarball. glibc is required because native modules such as `onnxruntime-node` link against glibc; musl/alpine is incompatible (TDD AD-1, BR-02).
- The base image is **pinned by immutable digest** in the Dockerfile build args `DEBIAN_BASE_IMAGE` and `DEBIAN_BASE_DIGEST` (SEC-02). The Node tarball is additionally pinned by SHA-256 (`NODE_TARBALL_SHA256`). Both pins are authoritative.
- **Digest-update process:** bump `DEBIAN_BASE_DIGEST` and `NODE_TARBALL_SHA256` (Dockerfile) and the `postgres` image digest (compose) via Dependabot/Renovate, or manually:

  ```bash
  docker buildx imagetools inspect debian:trixie-slim        # copy the top-level Digest
  # Node tarball SHA-256: fetch from https://nodejs.org/dist/v22.23.4/SHASUMS256.txt
  docker buildx imagetools inspect pgvector/pgvector:pg16
  ```

- The Node tarball is pre-downloaded on the host and `COPY`'ed into the image (it is not downloaded at build time), so the build does not depend on network access to nodejs.org. The tarball SHA-256 is verified inside the container before extraction.

---

## 2. Required runtime dependencies

The `production` runtime image is intentionally minimal (SEC-05):

- **Included:** Node.js 22 runtime, the pruned production `node_modules`
  (`npm ci --omit=dev`), compiled `dist/`.
- **Excluded from runtime:** `git`, `python3`, `make`, `g++` — these build-time
  tools live only in the `base`/`build` stages and are discarded.
- **Health probe:** dependency-free `node -e` HTTP GET to `/health`
  (node:22-slim ships no `wget`, SEC-12).
- **AD-6 capability items** (draw.io CLI/Electron/xvfb, local embedding model,
  `SERVER_WORKSPACES_ROOT`) are **default OFF** (SEC-08). Enable only if the
  runtime genuinely needs diagram export / local embeddings, accepting the
  image-size + attack-surface trade-off.

---

## 3. Build commands (local)

All commands run from the `backend/` directory.

### Prerequisite: download the Node tarball

The Node v22.23.4 tarball is **not committed** (30 MB binary, see `backend/.gitignore`).
Download it before building:

```bash
curl -fsSL -o node-v22.23.4-linux-x64.tar.xz \
  https://nodejs.org/dist/v22.23.4/node-v22.23.4-linux-x64.tar.xz
# Verify SHA-256 against NODE_TARBALL_SHA256 in the Dockerfile:
#   1805bcd35e6815559bd2eb97db438d3fdb0eb3a5e6a977b7c1badca76337e9ce
```

| Target | Command | Purpose |
|--------|---------|---------|
| production (push target) | `docker build --target production -t sa4e-backend:local .` | Runtime image CI publishes |
| development | `docker build --target development -t sa4e-backend-dev:local .` | Hot-reload dev image |
| test | `docker build --target test -t sa4e-backend-test:local .` | In-container vitest |

Run the production image (non-root, `/health` on 48721):

```bash
docker run --rm -p 127.0.0.1:48721:48721 \
  -e DATABASE_ADAPTER=postgresql \
  sa4e-backend:local
# verify:
curl -fsS http://127.0.0.1:48721/health
```

A bare `docker build --target production .` must succeed with no build args
(safe defaults, AD-6 off).

---

## 4. Running the production compose

```bash
cd backend
# 1. Provision git-ignored secret files from the templates (SEC-01):
cp secrets/postgres_password.example secrets/postgres_password
cp secrets/database_url.example      secrets/database_url
#    edit both files and set REAL values (never commit them).
# 2. (optional) non-secret runtime env:
cp .env.production.example .env.production
# 3. start:
docker compose --env-file .env.production up -d
```

Hardening in the production compose:

- Credentials via Docker secrets (`POSTGRES_PASSWORD_FILE`, `DATABASE_URL_FILE`) —
  **fail-fast** if a secret file is missing; no plaintext fallback (BR-08, D-2).
- `NODE_ENV=production` (D-1); CPU/memory limits (D-4); compose-level healthcheck
  (D-3); `postgres` + `backend` `restart: unless-stopped` (D-5).
- `postgres` port is **not published** (internal `sa4e-network` only, SEC-06);
  `backend` publishes to loopback by default (`PUBLISH_HOST=127.0.0.1`, SEC-07).
- `backend`: `read_only` root FS + `tmpfs:/tmp`, `cap_drop: [ALL]`,
  `no-new-privileges` (SEC-09).

---

## 5. CI build & publish

Workflow: `.github/workflows/build-push-backend.yml`.

| Trigger | Behavior | Push? |
|---------|----------|-------|
| `push` to `main`/`master` | build `production`, tag `sha-<short>` + `latest`, push | Yes |
| `push` tag `v*.*.*` | build `production`, tag semver (`vX.Y.Z`, `X.Y`, `X`) + `sha-<short>`, push | Yes |
| `pull_request` | build `production` only (validate) — no push, no secrets | No |
| `workflow_dispatch` | manual build & push | Yes |

Pipeline order (fail-visible, BR-19): checkout → derive tags → setup buildx →
**login (push events only)** → build & push (single buildx `--push`) →
**Trivy scan (fail on CRITICAL/HIGH)** → verify digest. Any non-zero step ends
the run RED and nothing partial is accepted.

### Authentication (CI secrets only, BR-17/18)

- **GHCR (default):** uses the built-in `GITHUB_TOKEN` — no stored secret needed.
  Credentials are passed by `docker/login-action` and masked; never echoed,
  never placed in a build `ARG`/`ENV`, never `COPY`-ed into a layer.
- Registry login + push run **only on non-PR events** (`if: github.event_name !=
  'pull_request'`), so fork PRs never receive push credentials (SEC-13).
- Third-party actions are pinned by commit SHA (SEC-13).

---

## 6. Registry name, image path, tag scheme, pull command

| Config | Default | Override |
|--------|---------|----------|
| `REGISTRY` (repo variable) | `ghcr.io` | Docker Hub: `docker.io`; ECR: `<acct>.dkr.ecr.<region>.amazonaws.com` |
| `IMAGE_NAME` (repo variable) | `<owner>/<repo>/backend` | any registry path |

**Tag scheme (semver + commit SHA):**

| Tag | Example | When | Meaning |
|-----|---------|------|---------|
| `sha-<short>` | `sha-a1b2c3d` | every push build | immutable commit mapping (BR-16) |
| `vMAJOR.MINOR.PATCH` | `v1.46.2` | semver tag push | released version |
| `MAJOR.MINOR`, `MAJOR` | `1.46`, `1` | semver tag push | moving convenience tags |
| `latest` | `latest` | push to default branch only | newest build (never from a PR) |
| `@sha256:<digest>` | `@sha256:…` | always (implicit) | content-addressable deploy ref |

**Pull commands:**

```bash
# by tag
docker pull ghcr.io/<owner>/<repo>/backend:sha-a1b2c3d
docker pull ghcr.io/<owner>/<repo>/backend:v1.46.2
# by digest (recommended for deploys — immutable)
docker pull ghcr.io/<owner>/<repo>/backend@sha256:<digest>
```

### Targeting a non-GHCR registry (BR-20 as config, no code change)

1. Set repo variables `REGISTRY` and `IMAGE_NAME`.
2. Docker Hub: add `REGISTRY_USERNAME` / `REGISTRY_TOKEN` secrets and point the
   login step at them. ECR: use OIDC role assumption. The default GHCR path
   needs no stored secret.

---

## 7. Reproducing / verifying a published image

```bash
# resolve the digest for a published tag
docker buildx imagetools inspect ghcr.io/<owner>/<repo>/backend:v1.46.2

# rebuild the same source revision locally and compare
git checkout <commit-of-sha-tag>
docker build --target production -t sa4e-backend:verify backend/

# confirm it runs non-root and answers /health
docker run --rm -p 127.0.0.1:48721:48721 sa4e-backend:verify
curl -fsS http://127.0.0.1:48721/health
```

Because the base image is digest-pinned and dependencies are lockfile-pinned
(`npm ci`), a rebuild of the same source revision is reproducible; the published
`sha-<short>` tag and `sha256` digest map the running container back to one
source commit (BR-16).

---

## 8. Delta — 2026-10-15: stdio MCP child servers baked into the image (7 stages)

> Documentation-only delta appended by devops-agent. Where this section conflicts
> with §1–§7, **this section supersedes** (those sections describe the pre-MCP image).

### 8.1 What changed

`backend/Dockerfile` grew from 6 to **7 stages** and the production runtime now
ships two Python stdio MCP child servers plus the ONNX embedding model:

- New stage **`mcp-python`** builds two independent venvs from the same pinned
  `node:22-slim` base (venv interpreters and native manylinux wheels match the
  runtime ABI):
  - `/opt/markitdown-venv` — `markitdown-mcp==0.0.1a7` (PyPI, Microsoft MarkItDown)
  - `/opt/markdown-exporter-venv` — `markdown-exporter-mcp-local 0.1.0` from
    GitHub `Zac-Chen-2001/markdown-exporter-mcp-local`, pinned to commit
    `1429b6a94767a709f7f5119219ca5951042d9d3c` — **NOT published to npm/PyPI**
- `production`: apt installs **`python3` only** (no pip/pip3/git/pandoc — SEC-05;
  pandoc ships inside the `pypandoc-binary` wheel), copies both venvs
  **root-owned read-only**, sets `PATH` (bare commands) + `PYTHONUNBUFFERED=1`.
  Venv `pip` is uninstalled during build → **zero package managers at runtime**.
- `development`: parity (same venv copies + ENV).
- Embedding model bake is now **default ON** (§2 said "default OFF" — superseded).

### 8.2 Stage map (8 stages)

| # | Stage | Role |
|---|-------|------|
| 1 | `node-runtime` | Shared Node runtime: Debian trixie + official Node 22.23.4 tarball (SHA-256 verified), curl/xz purged after install (build-time only) |
| 2 | `base` | Shared workdir + build toolchain (python3/make/g++/git) on trixie-based node-runtime (build-time only) |
| 3 | `deps` | `npm ci --omit=dev` → pruned production `node_modules` |
| 4 | `build` | Full `npm ci` + `tsc` → `dist/`; bakes the ONNX model into `/app/models-cache` when `BAKE_EMBEDDING_MODEL=true` |
| 5 | `mcp-python` | Builds the two stdio MCP venvs under `/opt/*` (`git` used here only, SEC-05) |
| 6 | `production` ★ | Sole CI push target — runtime: node_modules + dist + models-cache + python3 + 2 read-only venvs; npm CLI bump (DEF-004) + Debian CVE upgrades (SEC-04) |
| 7 | `development` | Hot-reload image (tsx watch), MCP venv parity |
| 8 | `test` | In-container vitest |

### 8.3 New build ARGs

| ARG | Default | Purpose |
|-----|---------|---------|
| `NODE_VERSION` | `22.23.4` | Node.js version (unchanged from before) |
| `DEBIAN_BASE_IMAGE` | `debian:trixie-slim` | Debian 13 trixie base image (SEC-02) |
| `DEBIAN_BASE_DIGEST` | `sha256:a72b4433de1cf7d6bae0c4cee74d0547f58601a643b3375f070c51600d63b6b2` | Debian trixie digest pin (SEC-02) |
| `NODE_TARBALL_SHA256` | `1805bcd35e6815559bd2eb97db438d3fdb0eb3a5e6a977b7c1badca76337e9ce` | Node v22.23.4 linux-x64 tarball SHA-256 (SEC-02) |
| `MARKITDOWN_MCP_VERSION` | `0.0.1a8` | PyPI version pin for markitdown-mcp |
| `MARKDOWN_EXPORTER_MCP_REF` | `1429b6a94767a709f7f5119219ca5951042d9d3c` | Upstream commit pin (hermetic git-source analogue of SEC-02) |
| `BAKE_EMBEDDING_MODEL` | `true` | Bakes `Xenova/paraphrase-multilingual-MiniLM-L12-v2` (quantized, ~130 MB) into `/app/models-cache` (`ENV TRANSFORMERS_CACHE=/app/models-cache`). `false` → slim build; mount a volume (§8.7) |

Pre-existing ARGs unchanged: `NPM_VERSION` (DEF-004 npm CLI bump, 11.21.0).

### 8.4 Production image contents inventory

| Path / aspect | Content | Notes |
|---------------|---------|-------|
| `/app/models-cache` | `model_quantized.onnx` + `config.json` (~130 MB) | Baked by default; read-only rootfs OK (cache hits need no writes) |
| `/opt/markitdown-venv` | markitdown-mcp venv (Python 3.13.5) | root-owned, read-only, pip stripped |
| `/opt/markdown-exporter-venv` | markdown-exporter-mcp-local venv (Python 3.13.5) | same hardening |
| `/usr/local` | Node 22.23.4 (official tarball, SHA-256 verified) | bin/node, bin/npm, bin/npx, lib/node_modules/npm |
| apt layer | `python3` only (trixie 3.13.5) | pip/pip3/git/pandoc **ABSENT** at runtime (SEC-05); curl/xz absent (purged from node-runtime) |
| OS | Debian 13 trixie-slim | glibc; onnxruntime-node/manylinux wheels compatible |
| ENV | `PATH=/opt/markitdown-venv/bin:/opt/markdown-exporter-venv/bin:…`, `PYTHONUNBUFFERED=1`, `TRANSFORMERS_CACHE=/app/models-cache` | bare commands resolve under user `sa4e` (BR-05) and its stdio children |

### 8.5 `mcp>=1.27.0,<2.0.0` constraint rationale

`markdown-exporter-mcp-local` upstream declares `mcp>=1.27.0` **unbounded**, but
its code imports `mcp.server.fastmcp` — an API **removed in mcp 2.x** (FastMCP →
MCPServer). Unconstrained pip resolves `mcp 2.3.0` → `ModuleNotFoundError` at
runtime. The Dockerfile therefore pins `mcp>=1.27.0,<2.0.0` and adds an import
probe (`markdown_exporter_mcp.server`, `md_exporter`) that fails the build on
exactly this class of drift.

### 8.6 Lockfile sync workflow — TWO-LOCKFILE TRAP

Repo root = npm workspaces (`backend`, `extension`), but
`backend/package-lock.json` is an **INDEPENDENT lockfile** consumed verbatim by
the Dockerfile `npm ci`. When changing backend dependencies, sync BOTH:

```bash
# 1. root workspace lockfile (root CI/test runs)
npm install

# 2. backend standalone lockfile (what Docker npm ci reads)
cd backend
npm install --package-lock-only --workspaces=false
```

Skipping step 2 makes the image build install stale/different dependency
versions than the ones local (root-workspace) tests exercised.

### 8.7 Slim-build option (BAKE_EMBEDDING_MODEL=false)

```bash
docker build --target production --build-arg BAKE_EMBEDDING_MODEL=false -t sa4e-backend:slim .
```

The runtime then logs an error and degrades to the sin-hash fallback unless a
writable volume is mounted at `/app/models-cache`:

```yaml
# compose override — NOTE: the named volume MUST be declared. Compose
# validation fails on an undeclared named volume; the base compose file
# mentions the mount in a comment but does NOT pre-declare model_cache.
services:
  backend:
    volumes:
      - model_cache:/app/models-cache
volumes:
  model_cache: {}
```

### 8.8 Spawn model (who starts the MCP servers)

The backend does **not** run the servers itself — it spawns them from config.
Primary source: DB table `mcp_servers` WHERE `disabled=0`
(`documents/MCP-DB-CONFIG-REQUEST.md`; `.code-intel/orchestration.json` is a
file-fallback when the DB is empty). In-container rows use **bare commands**:

| name | transport_type | command | args |
|------|----------------|---------|------|
| markitdown | stdio | `markitdown-mcp` | `[]` |
| markdown-exporter | stdio | `markdown-exporter-mcp-local` | `[]` |

⚠️ TRAP: legacy Windows configs spawning via `uv` + `--directory C:/projects/…`
**FAIL in the container** (no uv, no host paths). Bare commands only.

### 8.9 Verification evidence (2026-10-15)

- `docker build --check` — no warnings.
- Full `docker build --target production` — SUCCESS.
- stdio smoke test (JSON-RPC `initialize` over stdin, spawned as bare commands
  exactly like orchestration does):
  - `markitdown-mcp` → `serverInfo.name = "markitdown"`
  - `markdown-exporter-mcp-local` → `serverInfo.name = "markdown-exporter"`

  (exporter venv resolved `mcp 1.30.0` under the `<2.0.0` constraint)
