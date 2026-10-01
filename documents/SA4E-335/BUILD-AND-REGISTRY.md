# Build & Registry Guide — SA4E-335 (backend container image)

This document explains how to build the backend Docker image locally and in CI,
how it is published to a container registry, and how to reproduce / verify a
published image. It implements FSD Story 4 (BR-20..BR-23).

| Field | Value |
|-------|-------|
| Jira Ticket | SA4E-335 |
| Artifacts | `backend/Dockerfile`, `backend/docker-compose.yml`, `.github/workflows/build-push-backend.yml` |
| Base image | `node:22-slim` (Debian/glibc), pinned by digest |
| Runtime | Node.js 22 + Hono MCP server (Code Intelligence), port `48721` |
| Registry (default) | GHCR (`ghcr.io`), configurable via repo variables |

---

## 1. Base-image decision

- **`node:22-slim` (Debian, glibc)** — chosen over `node:22-alpine` (musl) because
  native modules such as `onnxruntime-node` require glibc; musl is incompatible
  (TDD AD-1, BR-02).
- The base image is **pinned by immutable digest** in the Dockerfile build arg
  `NODE_BASE_DIGEST` (SEC-02). The readable tag (`node:22-slim`) is kept as a
  comment. `pgvector/pgvector:pg16` in compose is likewise digest-pinned.
- **Digest-update process:** bump `NODE_BASE_DIGEST` (Dockerfile) and the
  `postgres` image digest (compose) via Dependabot/Renovate, or manually:

  ```bash
  docker buildx imagetools inspect node:22-slim        # copy the top-level Digest
  docker buildx imagetools inspect pgvector/pgvector:pg16
  ```

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
