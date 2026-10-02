# DevOps Pipeline Setup Plan — SA4E-335

## Review backend Dockerfile/docker-compose and create CI to build the Docker image

---

## Document Information

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-335 |
| Title | Review backend Dockerfile/docker-compose and create CI to build Docker image |
| Author | DevOps Agent |
| Version | 1.0 |
| Date | 2026-10-01 |
| Phase | 4.5 — DevOps Pipeline Setup (skeleton/plan BEFORE implementation) |
| Status | Plan draft — NO code committed, NO real secrets |
| Related TDD | TDD-v1-SA4E-335.docx (v1.0) |
| Related FSD | FSD-v1-SA4E-335.docx (v1.1) |
| Related STP | STP-v1-SA4E-335.docx (v1.1) |

> **Scope of this document.** This is a *planning* artifact for Phase 4.5. It defines the
> skeleton and the production-hardening strategy for the three deliverable artifacts
> (`backend/Dockerfile`, `backend/docker-compose.yml`, `.github/workflows/build-push-backend.yml`)
> plus environment-config templates. **No final artifact is written or committed in this phase,
> and no real secret value appears anywhere in this plan — only placeholders.** Implementation
> happens in Phase 5 (DEV), reviewed by TA, then exercised by QA against the STP/STC.

---

## 1. Baseline (verified against the real repository)

Confirmed by reading the actual files on disk:

| Artifact | Current state (verified) | Gap vs TDD production target |
|----------|--------------------------|------------------------------|
| `backend/Dockerfile` | 6 stages (`base`, `deps`, `build`, `production`, `development`, `test`). Base = **`node:22-alpine`** (musl). `production` runtime deps = `apk add git`. Non-root `sa4e` uid/gid 1001. `EXPOSE 48721`. `wget /health` HEALTHCHECK. `CMD ["node","dist/index.js"]`. | Base must move to `node:22-slim` (glibc for `onnxruntime-node`, AD-1). `apk` → `apt-get`. SA4E-44 capability items (AD-6) conditional. |
| `backend/docker-compose.yml` | Dev/test-oriented. `version: "3.9"` (obsolete). `backend.NODE_ENV=development`. **Plaintext** `DATABASE_URL` + `POSTGRES_PASSWORD`. `postgres` publishes `5432:5432`. No compose-level backend healthcheck. No `deploy.resources.limits`. `postgres` has no `restart`. Named volumes `postgres_data`, `code_intel_data` present. `onnx-runtime` under `profiles: [embeddings]`. Misleading "Node.js 20 / PostgreSQL 15" comments. | Close D-1..D-5, D-11, D-12 (see §3). Externalize secrets, add healthcheck/limits/restart, do not publish postgres port in production. |
| `.github/workflows/build-push-backend.yml` | **Does not exist.** `.github/workflows/` contains other per-ticket CI (`ci-sa4e-332.yml`, `ci.yml`, `publish.yml`, etc.). | Create new workflow per §4. Reuse repo conventions: `actions/checkout@v7`, `actions/setup-node@v7`, `concurrency` group, least-privilege `permissions`. |
| `.gitignore` | Ignores `.env`, `.env.*` (keeps `.env.example`). **No `secrets/` rule yet** (Security finding SEC-01, Critical). | Add `backend/secrets/*` ignore rule (keep `*.example`) BEFORE any secret file is created. |

---

## 2. Dockerfile build-target strategy

### 2.1 Target graph (unchanged shape, hardened `production`)

Keep the six-stage layout (AD-2); `production` remains the **sole CI push target**. Build-only
tooling (compilers, dev deps, tests, model-download toolchain) stays out of the runtime image.

```
base ──┬─ deps ───────────────┐
       ├─ build ──────────────┤→ production ★ (CI push target, node:22-slim, non-root)
       ├─ development          (local hot-reload, non-root)
       └─ test                 (in-container vitest, non-root)
```

### 2.2 Build-target decisions

| Item | Plan | TDD / rule |
|------|------|-----------|
| Base image | `base` + `production` → **`node:22-slim`** (Debian glibc). Replace `apk add --no-cache ...` with `apt-get update && apt-get install -y --no-install-recommends python3 make g++ git && apt-get clean && rm -rf /var/lib/apt/lists/*` in a single layer. | AD-1, BR-02, D-6 |
| Base image pinning (hardening) | Recommend pinning the base by **digest** (`node:22-slim@sha256:...`) in addition to the tag, to close Security SEC-02. Flagged as a hardening candidate; final digest resolved at implementation time. | SEC-02 (High) |
| Non-root invariant | `production`/`development`/`test` keep `USER sa4e` (uid/gid 1001) after `chown`. Runtime process never root. On Debian use `groupadd -g 1001 sa4e && useradd -u 1001 -g sa4e -r sa4e` (replaces alpine `addgroup`/`adduser`). | BR-05 |
| Build args (safe defaults) | `ARG NODE_VERSION=22`, `ARG DRAWIO_CLI_VERSION=24.7.8`, `ARG TRANSFORMERS_CACHE=/app/.cache/transformers`, `ARG EMBEDDING_MODEL=<project default>`. Build-time only; **MUST NOT carry secrets**. A bare `docker build --target production .` must still succeed. | AD-6, BR-17 |
| SA4E-44 capability items (conditional-adopt) | draw.io CLI + Electron/X11/xvfb runtime deps, pre-downloaded embedding model into `TRANSFORMERS_CACHE` (copied `build`→`production`), `tree-sitter-jsp` strip, `SERVER_WORKSPACES_ROOT=/app/workspaces`. Guard behind build args; adopt only if the runtime needs diagram export (else defer with a documented image-size rationale — SEC-03). | AD-6, BR-03, BR-04, SEC-03 |
| Hermetic build | Model fetched once in `build` into `TRANSFORMERS_CACHE`, copied into `production`; **zero runtime network fetch**. `tree-sitter-jsp` stripped to avoid non-deterministic fetch. | BR-03, BR-04 |
| Remove `git` from runtime (hardening) | Evaluate dropping `git` from the `production` runtime deps unless a runtime feature requires it (Security SEC-05 — minimize surface). Decision recorded at implementation. | SEC-05 (High) |
| Healthcheck / expose / cmd | Keep verbatim: `EXPOSE 48721`; `HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget --no-verbose --tries=1 --spider http://localhost:48721/health || exit 1`; `CMD ["node","dist/index.js"]`. | §4.3 TDD |
| Risk check | After migration, verify `onnxruntime-node` loads in the slim `production` image (AD-1 risk; QA TC-SMOKE-05). | AD-1 |

### 2.3 Dockerfile skeleton (illustrative — NOT the final file)

```dockerfile
# syntax=docker/dockerfile:1
ARG NODE_VERSION=22
FROM node:${NODE_VERSION}-slim AS base
WORKDIR /app
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ git \
 && apt-get clean && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build
# (AD-6, conditional) ARG TRANSFORMERS_CACHE / EMBEDDING_MODEL → pre-download model here

FROM node:${NODE_VERSION}-slim AS production
WORKDIR /app
# runtime deps only (minimize surface — SEC-05 evaluate dropping git)
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
RUN groupadd -g 1001 sa4e \
 && useradd -u 1001 -g sa4e -r -s /usr/sbin/nologin sa4e \
 && mkdir -p /app/.code-intel \
 && chown -R sa4e:sa4e /app
USER sa4e
ENV NODE_ENV=production
ENV PORT=48721
EXPOSE 48721
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:48721/health || exit 1
CMD ["node", "dist/index.js"]
# development / test stages unchanged in shape (non-root sa4e), apt-get instead of apk
```

---

## 3. docker-compose production-hardening plan

Transform the current dev/test compose into a production-safe form while preserving the working
baseline (pgvector image, named volumes, dev `embeddings` profile).

### 3.1 Change set (discrepancy-driven)

| Key | Current | Target (production) | Discrepancy / Rule |
|-----|---------|---------------------|--------------------|
| top-level `version:` | `"3.9"` | **removed** (obsolete in Compose v2) | D-12 |
| `backend.environment.NODE_ENV` | `development` | **`production`** | D-1 (High), SEC-03 |
| `backend` DB credentials | plaintext `DATABASE_URL` | **`DATABASE_URL_FILE`** → `/run/secrets/database_url` | D-2 (High), BR-08 |
| `postgres.environment.POSTGRES_PASSWORD` | plaintext | **`POSTGRES_PASSWORD_FILE`** → `/run/secrets/postgres_password` | D-2 (High), BR-08 |
| `backend.healthcheck` | absent (image-only) | **compose-level** healthcheck mirroring §4.3 TDD | D-3 (Medium), BR-09 |
| `backend.deploy.resources.limits` | absent | **`cpus` + `memory`** (env-substituted defaults, AF-2) | D-4 (Medium), BR-11 |
| `postgres.deploy.resources.limits` | absent | **`cpus` + `memory`** | D-4 (Medium), BR-11 |
| `postgres.restart` | absent | **`unless-stopped`** | D-5 (Low), BR-10 |
| `postgres` port | `5432:5432` published | **not published** in production (internal network only) | SEC (S-1), §6.4 TDD |
| `backend.restart` | `unless-stopped` | unchanged ✅ | BR-10 |
| named volumes | `postgres_data`, `code_intel_data` | unchanged ✅ | BR-12 |
| `onnx-runtime` | `profiles: [embeddings]` | unchanged ✅ (dev-only, inactive in prod) | BR-13 |
| comments | "Node.js 20 / PostgreSQL 15" | corrected to actual versions | D-11 |

### 3.2 Secrets block + fail-fast

```yaml
# illustrative — NOT the final file; file paths point at git-ignored placeholders
secrets:
  postgres_password:
    file: ./secrets/postgres_password        # git-ignored; real value provisioned by operator
  database_url:
    file: ./secrets/database_url             # git-ignored; or injected via external secret
```

- `*_FILE` env vars (`POSTGRES_PASSWORD_FILE`, `DATABASE_URL_FILE`) point at the mounted secret;
  the application reads the `_FILE` variant — **never a committed literal**.
- **Fail-fast (UC-02 EF-1):** a missing secret file stops startup with a clear message naming the
  missing secret; there is **no plaintext default fallback**.
- Resource limits are env-substituted (`${BACKEND_CPU_LIMIT:-1.0}` etc.) so operators tune per
  environment without editing the base file (AF-2).

### 3.3 Compose skeleton (illustrative — NOT the final file)

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: sa4e_db
      POSTGRES_USER: sa4e_user
      POSTGRES_PASSWORD_FILE: /run/secrets/postgres_password
    secrets: [postgres_password]
    # NOTE: no "ports:" in production — internal sa4e-network only
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./scripts/db/init.sql:/docker-entrypoint-initdb.d/01-init.sql
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U sa4e_user -d sa4e_db"]
      interval: 5s
      timeout: 3s
      retries: 5
    restart: unless-stopped
    deploy:
      resources:
        limits:
          cpus: "${PG_CPU_LIMIT:-1.0}"
          memory: "${PG_MEM_LIMIT:-1g}"
    networks: [sa4e-network]

  backend:
    build:
      context: .
      dockerfile: Dockerfile
      target: production
    environment:
      NODE_ENV: production
      PORT: 48721
      DATABASE_URL_FILE: /run/secrets/database_url
      DATABASE_ADAPTER: postgresql
      # ... non-secret TASK_WORKER_* / CODE_INTEL_* literals unchanged ...
    secrets: [database_url]
    ports:
      - "48721:48721"
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD-SHELL", "wget --no-verbose --tries=1 --spider http://localhost:48721/health || exit 1"]
      interval: 30s
      timeout: 5s
      start_period: 10s
      retries: 3
    restart: unless-stopped
    deploy:
      resources:
        limits:
          cpus: "${BACKEND_CPU_LIMIT:-1.0}"
          memory: "${BACKEND_MEM_LIMIT:-1g}"
    volumes:
      - code_intel_data:/app/.code-intel
    networks: [sa4e-network]

  onnx-runtime:
    image: mcr.microsoft.com/onnxruntime/server:latest
    profiles: [embeddings]           # dev-only, inactive in production
    networks: [sa4e-network]
    restart: unless-stopped

secrets:
  postgres_password:
    file: ./secrets/postgres_password
  database_url:
    file: ./secrets/database_url

volumes:
  postgres_data:
  code_intel_data:

networks:
  sa4e-network:
    driver: bridge
```

---

## 4. GitHub Actions workflow structure

New file: `.github/workflows/build-push-backend.yml`.

### 4.1 Triggers (`on:`)

| Event | Filter | Behavior | Push? | Rule |
|-------|--------|----------|-------|------|
| `push` | `branches: [main]` | build `production`; tags `sha-<short>` + `latest`; push | Yes | BR-14, BR-16 |
| `push` | `tags: ['v*.*.*']` | build `production`; tags semver (`vX.Y.Z`, `X.Y`, `X`) + `sha-<short>`; push | Yes | BR-14, BR-16 |
| `pull_request` | `branches: [main]` | build `production` only (validate); **no push, no secrets** | No | BR-18/19, AD-7 |
| `workflow_dispatch` | — | manual build-only (optional, matches repo convention) | No | — |

### 4.2 Job structure — single `build-and-push` job

Repo conventions reused: `concurrency` group with `cancel-in-progress`, least-privilege
`permissions`, `actions/checkout@v7`.

```yaml
name: SA4E-335 — Build & push backend image

on:
  push:
    branches: [main]
    tags: ["v*.*.*"]
  pull_request:
    branches: [main]
  workflow_dispatch:

concurrency:
  group: sa4e-335-build-push-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read      # read source
  packages: write     # push to GHCR

env:
  REGISTRY: ${{ vars.REGISTRY || 'ghcr.io' }}
  IMAGE_NAME: ${{ vars.IMAGE_NAME || format('{0}/backend', github.repository) }}
  BUILD_TARGET: production
  BUILD_CONTEXT: backend

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    steps:
      # 1. Checkout (fetch-depth: 0 so semver tags resolve)
      - uses: actions/checkout@v7
        with: { fetch-depth: 0 }

      # 2. Derive tags/labels (sha-<short>, semver, latest on main only)
      - id: meta
        uses: docker/metadata-action@v5
        with:
          images: ${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}
          tags: |
            type=sha,prefix=sha-,format=short
            type=semver,pattern=v{{version}}
            type=semver,pattern={{major}}.{{minor}}
            type=semver,pattern={{major}}
            type=raw,value=latest,enable=${{ github.ref == 'refs/heads/main' }}

      # 3. Setup Buildx (registry layer cache)
      - uses: docker/setup-buildx-action@v3

      # 4. Registry login — PUSH JOBS ONLY (gated after a successful build graph)
      - if: github.event_name != 'pull_request'
        uses: docker/login-action@v3
        with:
          registry: ${{ env.REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}   # GHCR default; masked, never printed

      # 5. Build & push (single buildx invocation → built image == pushed image)
      - id: build
        uses: docker/build-push-action@v6
        with:
          context: ${{ env.BUILD_CONTEXT }}
          file: ${{ env.BUILD_CONTEXT }}/Dockerfile
          target: ${{ env.BUILD_TARGET }}
          push: ${{ github.event_name != 'pull_request' }}
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
          cache-from: type=gha
          cache-to: type=gha,mode=max

      # 6. Verify digest present (push incomplete → red)
      - if: github.event_name != 'pull_request'
        run: |
          test -n "${{ steps.build.outputs.digest }}" || { echo "::error::missing image digest — push incomplete"; exit 1; }
          echo "image=${{ env.REGISTRY }}/${{ env.IMAGE_NAME }}@${{ steps.build.outputs.digest }}"

      # 7. (SEC-04, recommended) Trivy image scan gate — fail on CRITICAL/HIGH
      #    Added as a hardening job/step; final gate severity decided at implementation.
```

### 4.3 Tag scheme (semver + SHA)

| Tag form | Example | When | Meaning |
|----------|---------|------|---------|
| `sha-<short>` | `sha-a1b2c3d` | every push build | immutable commit mapping (BR-16) |
| `vMAJOR.MINOR.PATCH` | `v1.4.0` | semver tag push | released version |
| `MAJOR.MINOR`, `MAJOR` | `1.4`, `1` | semver tag push | moving convenience tags |
| `latest` | `latest` | push to `main` only | newest main build (never from a PR) |
| `<digest>` | `sha256:…` | always (implicit) | content-addressable pull for deploys |

### 4.4 Fail-visible & registry login via CI secrets

- Any non-zero step ends the run **red** and pushes nothing (BR-19). Build failure (EF-1),
  auth failure (EF-2/EF-4), push failure (EF-3), and missing-digest (EF-3) all surface red on the
  commit/PR.
- Registry login happens **after** the build graph and **only** on non-PR events, so a broken build
  never touches secrets and fork PRs never see push credentials (AD-7, BR-18).
- Credentials come **only** from the CI secret store (`GITHUB_TOKEN` for GHCR; `REGISTRY_USERNAME`/
  `REGISTRY_TOKEN` or OIDC for other registries), passed by the action over stdin and masked. No
  credential is ever echoed, `COPY`-ed into a layer, or placed in a build `ARG`/`ENV` (BR-17, BR-18).
- Registry host/path are repo **variables** (`REGISTRY`, `IMAGE_NAME`), so the registry decision
  (BR-20) is configuration, not code (AD-4).

---

## 5. Environment-config templates (placeholders only — NO real secrets)

All files below are **templates/placeholders**. Real secret files live only on the operator host
and are **git-ignored**. Create the `.gitignore` rule BEFORE any real secret file exists (SEC-01).

### 5.1 `.gitignore` addition (apply first)

```gitignore
# SA4E-335 — Docker secrets (never commit real credentials)
backend/secrets/*
!backend/secrets/*.example
```

### 5.2 `backend/secrets/postgres_password.example`

```text
# TEMPLATE ONLY — copy to ./secrets/postgres_password (git-ignored) and set a real value.
# A single line containing the PostgreSQL password. No surrounding quotes, no trailing newline semantics.
CHANGE_ME_PLACEHOLDER
```

### 5.3 `backend/secrets/database_url.example`

```text
# TEMPLATE ONLY — copy to ./secrets/database_url (git-ignored) and set a real value.
# Format: postgresql://<user>:<password>@postgres:5432/<db>
postgresql://sa4e_user:CHANGE_ME_PLACEHOLDER@postgres:5432/sa4e_db
```

### 5.4 `backend/.env.production.example`

```text
# TEMPLATE ONLY — non-secret production runtime defaults. Copy to .env.production (git-ignored).
# Secrets are provisioned via Docker secrets (*_FILE), NOT here.
NODE_ENV=production
PORT=48721
DATABASE_ADAPTER=postgresql
# Resource limits (compose env-substitution; tune per environment)
BACKEND_CPU_LIMIT=1.0
BACKEND_MEM_LIMIT=1g
PG_CPU_LIMIT=1.0
PG_MEM_LIMIT=1g
```

### 5.5 CI secret/variable reference (configured in GitHub, not in the repo)

| Name | Kind | Default | Purpose |
|------|------|---------|---------|
| `REGISTRY` | repo variable | `ghcr.io` | registry host (BR-20 as config) |
| `IMAGE_NAME` | repo variable | `<owner>/<repo>/backend` | full image path |
| `GITHUB_TOKEN` | built-in secret | — | GHCR login (no stored secret needed) |
| `REGISTRY_USERNAME` / `REGISTRY_TOKEN` | repo secret | — | Docker Hub login (only if GHCR not chosen) |
| `AWS_*` / OIDC role | repo secret / OIDC | — | ECR login (only if ECR chosen) |

> No value for any secret appears in this plan or in any committed file — placeholders only.

---

## 6. Security findings carried into implementation

From `SECURITY-REVIEW.md` (Phase 3.7) — tracked so DEV/implementation addresses them:

| ID | Severity | Item | Where handled in this plan |
|----|----------|------|----------------------------|
| SEC-01 | Critical | Secret files not git-ignored | §5.1 — add `backend/secrets/*` ignore rule first |
| SEC-02 | Critical | Base image pinned by mutable tag, not digest | §2.2 — pin base by digest at implementation |
| SEC-03 | High | Live compose plaintext creds + `NODE_ENV=development` | §3.1 — D-1/D-2 fixes |
| SEC-04 | High | No required CVE/dependency scan gate | §4.2 step 7 — Trivy scan gate (recommended) |
| SEC-05 | High | `git` in production runtime stage | §2.2 — evaluate dropping `git` from runtime |

---

## 7. Phase 4.5 exit checklist

| # | Item | Status |
|---|------|--------|
| 1 | Dockerfile build-target strategy defined (multi-stage, `production` target, `node:22-slim`) | ✅ §2 |
| 2 | docker-compose production-hardening plan (secrets, CPU/memory limits, healthcheck, restart) | ✅ §3 |
| 3 | GitHub Actions workflow structure (jobs, triggers, semver+SHA tags, CI-secret registry login, fail-visible) | ✅ §4 |
| 4 | Environment-config templates (placeholders only, NO real secrets) | ✅ §5 |
| 5 | Security findings mapped into implementation plan | ✅ §6 |
| 6 | NO real secret value anywhere in this plan | ✅ verified — placeholders only |
| 7 | NO artifact committed in this phase (plan only; implementation = Phase 5) | ✅ |

> **Handoff to Phase 5 (Implementation):** DEV implements the three artifacts per this plan and the
> TDD §7 implementation checklist; TA reviews for design conformance; QA then executes the STP/STC
> (50 cases, 100% RTM) against the built/pushed image and the production compose.

---

## 8. References

| Document | Location |
|----------|----------|
| TDD | TDD-v1-SA4E-335.docx |
| FSD | FSD-v1-SA4E-335.docx |
| STP | STP-v1-SA4E-335.docx |
| Security Review | SECURITY-REVIEW.md |
| Current Dockerfile | backend/Dockerfile |
| Current docker-compose | backend/docker-compose.yml |
| Repo CI conventions | .github/workflows/ci-sa4e-332.yml, ci.yml, publish.yml |
