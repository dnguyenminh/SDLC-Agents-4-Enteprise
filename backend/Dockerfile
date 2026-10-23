# syntax=docker/dockerfile:1
# =============================================================================
# SA4E-335 Backend Dockerfile — Node.js 22 + Hono Code Intelligence MCP Server
# -----------------------------------------------------------------------------
# Multi-stage build (7 stages): base, deps, build, mcp-python, production,
# development, test. `production` is the SOLE CI push target (TDD AD-2).
# Build-only tooling never reaches the runtime image.
#
# Design decisions (TDD §3.2 / Security Review):
#   - AD-1 : base = node:22-slim (Debian/glibc) so native modules such as
#            onnxruntime-node link against glibc (musl/alpine is incompatible).
#   - SEC-02 (Critical): base image pinned by immutable sha256 DIGEST, not only
#            the mutable tag, to keep the build hermetic/reproducible. The human
#            readable tag is kept as a comment; update the digest via Dependabot/
#            Renovate (see documents/SA4E-335/BUILD-AND-REGISTRY.md).
#   - SEC-05 (High): `git` and the compiler toolchain live ONLY in build-time
#            stages (base/build). The runtime `production` stage installs the
#            minimal runtime surface — no git, no compilers.
#   - BR-05 : non-root user `sa4e` (uid/gid 1001) in production/development/test.
#   - AD-6 : SA4E-44 capability items (draw.io CLI/Electron/xvfb, model pre-cache,
#            SERVER_WORKSPACES_ROOT) are guarded behind build args and DEFAULT OFF
#            (SEC-08) — a bare `docker build --target production .` must succeed.
#   - MCP-1 : two stdio MCP child servers (markitdown-mcp, markdown-exporter-
#             mcp-local) are built into isolated /opt venvs in `mcp-python` and
#             shipped read-only on PATH, so the orchestration module spawns them
#             by bare command name. The runtime gains ONLY the python3
#             interpreter — no pip, no git, no pandoc (SEC-05; pypandoc-binary
#             bundles its own pandoc, onnxruntime ships as a manylinux wheel).
# =============================================================================

# --- Build-time arguments (NO secrets — build args must never carry credentials, BR-17) ---
ARG NODE_VERSION=22
# node:22-slim — pin by digest for a reproducible supply chain (SEC-02).
# Tag kept for readability; the digest is the authoritative pin.
ARG NODE_BASE_DIGEST=sha256:43ac6c60b8f89723f746e8a92ce91abd5017e627ce1ddfe4238355d3a30b772c

# -----------------------------------------------------------------------------
# base — shared workdir + build toolchain (glibc). Build-time only.
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION}-slim@${NODE_BASE_DIGEST} AS base
WORKDIR /app
# Native-module build toolchain (python3/make/g++) + git for build-time fetches.
# Single layer with apt cleanup to keep intermediate layers lean. These packages
# are discarded from the runtime image (they exist only in base/build).
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ git \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*

# -----------------------------------------------------------------------------
# deps — production (runtime) dependencies only.
# -----------------------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
# `npm ci` is hermetic: it installs exactly the locked versions (BR-03).
RUN npm ci --omit=dev

# -----------------------------------------------------------------------------
# build — compile TypeScript -> dist/. Full (dev) dependency set.
# -----------------------------------------------------------------------------
FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
COPY scripts/ ./scripts/
RUN npm run build
# (AD-6, SA4E-44 — now IMPLEMENTED) Pre-download the ONNX embedding model into
# TRANSFORMERS_CACHE so the runtime serves real semantic embeddings fully
# offline. EmbeddingService/OnnxEmbeddingBackend read the same cache dir at
# runtime (config embeddingCacheDir <- env TRANSFORMERS_CACHE). DEFAULT ON —
# semantic search is a core capability; set --build-arg BAKE_EMBEDDING_MODEL=false
# for slim builds (the runtime then logs an error and degrades to the sin-hash
# fallback unless a cache volume is mounted at /app/models-cache). `mkdir -p`
# guarantees the production COPY succeeds even when the download is skipped.
# Fail-fast: the precache script exits non-zero on download/inference errors.
ARG BAKE_EMBEDDING_MODEL=true
RUN mkdir -p /app/models-cache \
 && if [ "$BAKE_EMBEDDING_MODEL" = "true" ]; then \
      TRANSFORMERS_CACHE=/app/models-cache node scripts/precache-embedding-model.mjs; \
    fi

# -----------------------------------------------------------------------------
# mcp-python — builds the two stdio MCP child servers into isolated /opt venvs.
# The orchestration module (McpClientManager → TransportFactory) spawns stdio
# children by bare `command` name resolved on the PATH inherited by the backend
# process (documents/MCP-DB-CONFIG-REQUEST.md §9), so each server ships as a
# venv console script that production/development put on PATH:
#   /opt/markitdown-venv/bin/markitdown-mcp                (Microsoft MarkItDown)
#   /opt/markdown-exporter-venv/bin/markdown-exporter-mcp-local
# Both servers are Python — markdown-exporter-mcp-local is NOT published to
# npm or PyPI (GitHub source only), so npm packaging is impossible by design.
# This stage derives from the SAME pinned node base as the runtime, so venv
# interpreters and native manylinux wheels (onnxruntime via markitdown[all]/
# magika, PyMuPDF, pillow, pandas; pypandoc-binary bundles pandoc → no apt
# pandoc needed) match the runtime ABI. `git` exists only here (SEC-05).
# -----------------------------------------------------------------------------
FROM base AS mcp-python
ARG MARKITDOWN_MCP_VERSION=0.0.1a7
# markdown-exporter-mcp-local has no PyPI release — pin the exact upstream
# commit (main @ 2026-04-07) for a hermetic build (git-source analogue of SEC-02).
ARG MARKDOWN_EXPORTER_MCP_REF=1429b6a94767a709f7f5119219ca5951042d9d3c
# SA4E-360 follow-up: Debian's python3-venv/ensurepip bundles setuptools
# 66.1.1 into EVERY venv it creates, and setuptools itself VENDORS
# jaraco.context/wheel under setuptools/_vendor — Trivy flags BOTH layers:
#   - setuptools 66.1.1 (ensurepip bundle): CVE-2024-6345 (fix 70.0.0) +
#     CVE-2025-47273 (fix 78.1.1) — 2 HIGH per venv
#   - setuptools 78.1.1 (first bump): vendored jaraco.context 5.3.0
#     (CVE-2026-23949, fix 6.1.0) + vendored wheel 0.45.1 (CVE-2026-24049,
#     fix 0.46.2) — 2 more HIGH per venv, surfaced by a fresh Trivy DB
# 84.0.0 clears all four: it is free of the two setuptools CVEs and vendors
# jaraco.context 6.1.0 + wheel 0.46.3 (>= both fix versions). setuptools >=81
# removed pkg_resources; a grep of both /opt venvs (SA4E-360) showed NO
# runtime package imports pkg_resources — only setuptools internals and
# unreachable onnxruntime benchmark scripts — so the removal is safe here.
# The version is asserted via importlib.metadata (robust across setuptools
# versions). Drop the override once the pinned base image bundles a fixed
# setuptools.
ARG SETUPTOOLS_VERSION=84.0.0
# SA4E-360 follow-up (continued, v1.55.3): Trivy 2026-10-23 flags BOTH venvs —
#   - certifi 2026.7.22 (pulled via requests): GHSA-6q48-6c7w-9gw2 CRITICAL
#     (compromised emSign intermediate CA keys), fix 2026.10.19
#   - pillow 12.3.0: 55 CVEs (CRITICAL+HIGH, e.g. CVE-2026-112393/112403/112900,
#     fixes in 13.0.0) — markitdown[all] pulls pillow into BOTH venvs
# Force-upgrade both to fixed versions after the main install; the
# pillow~=12.1.1 upstream-pin conflict warning stays EXPECTED and non-fatal
# (same PEP 440 pattern documented below). Probes fail the build on drift.
ARG CERTIFI_VERSION=2026.10.19
ARG PILLOW_VERSION=13.0.0
# `python3` already exists in base (build toolchain); only the venv/ensurepip
# support is missing. One venv per server: independent dependency trees that
# are pinned, upgraded and Trivy-scanned separately.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3-venv \
 && rm -rf /var/lib/apt/lists/*
RUN python3 -m venv /opt/markitdown-venv \
 && /opt/markitdown-venv/bin/pip install --no-cache-dir \
      "markitdown-mcp==${MARKITDOWN_MCP_VERSION}" \
 && test -x /opt/markitdown-venv/bin/markitdown-mcp \
 && /opt/markitdown-venv/bin/python -c "import markitdown_mcp" \
 && /opt/markitdown-venv/bin/pip install --no-cache-dir "setuptools==${SETUPTOOLS_VERSION}" \
 && /opt/markitdown-venv/bin/python -c "from importlib.metadata import version; assert version('setuptools') == '${SETUPTOOLS_VERSION}'" \
 && /opt/markitdown-venv/bin/pip install --no-cache-dir "certifi==${CERTIFI_VERSION}" "pillow==${PILLOW_VERSION}" \
 && /opt/markitdown-venv/bin/python -c "from importlib.metadata import version; assert version('certifi') == '${CERTIFI_VERSION}' and version('pillow') == '${PILLOW_VERSION}'" \
 && /opt/markitdown-venv/bin/python -m pip uninstall -y pip
# `mcp<2` constraint: upstream declares `mcp>=1.27.0` (unbounded) but its code
# imports `mcp.server.fastmcp` — an API REMOVED in mcp 2.x (FastMCP → MCPServer).
# The import probe below fails the build on exactly this class of drift
# (verified: unconstrained pip resolved mcp 2.3.0 → ModuleNotFoundError).
# `pillow` override (SA4E-360, bumped v1.55.3 to 13.0.0): upstream pins
# `pillow~=12.1.1`, which resolves to 12.1.1 — carrying HIGH CVEs that fail the
# production Trivy gate. PEP 440 `~=12.1.1` means >=12.1.1,<12.2, so it does
# NOT admit the fixed 12.3.0/13.0.0. The force-upgrade AFTER the main install
# therefore triggers a pip metadata conflict warning ("markdown-exporter-mcp-local
# 0.1.0 requires pillow~=12.1.1 ... incompatible") — EXPECTED and non-fatal:
# pip installs the requested version and exits 0. Trivy reads the installed
# version's metadata, clearing the CVEs. The importlib.metadata probe fails the
# build if resolution ever regresses. Remove this override once upstream
# releases an officially fixed pin (e.g. pillow~=13).
RUN python3 -m venv /opt/markdown-exporter-venv \
 && /opt/markdown-exporter-venv/bin/pip install --no-cache-dir \
      "markdown-exporter-mcp-local @ git+https://github.com/Zac-Chen-2001/markdown-exporter-mcp-local@${MARKDOWN_EXPORTER_MCP_REF}" \
      "mcp>=1.27.0,<2.0.0" \
 && test -x /opt/markdown-exporter-venv/bin/markdown-exporter-mcp-local \
 && /opt/markdown-exporter-venv/bin/python -c "import markdown_exporter_mcp.server, md_exporter" \
 && /opt/markdown-exporter-venv/bin/pip install --no-cache-dir "pillow==${PILLOW_VERSION}" "certifi==${CERTIFI_VERSION}" \
 && /opt/markdown-exporter-venv/bin/python -c "from importlib.metadata import version; assert version('pillow') == '${PILLOW_VERSION}' and version('certifi') == '${CERTIFI_VERSION}'" \
 && /opt/markdown-exporter-venv/bin/pip install --no-cache-dir "setuptools==${SETUPTOOLS_VERSION}" \
 && /opt/markdown-exporter-venv/bin/python -c "from importlib.metadata import version; assert version('setuptools') == '${SETUPTOOLS_VERSION}'" \
 && /opt/markdown-exporter-venv/bin/python -m pip uninstall -y pip
# Both venvs are copied root-owned READ-ONLY; stripping their bundled pip keeps
# the runtime image free of ANY package manager (SEC-05) and out of Trivy scans.

# -----------------------------------------------------------------------------
# production ★ — runtime image. SOLE CI push target. Minimal surface, non-root.
# No git, no compilers (SEC-05). node:22-slim pinned by digest (SEC-02).
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION}-slim@${NODE_BASE_DIGEST} AS production
WORKDIR /app

# SA4E-335 DEF-004 — CI Trivy gate (CRITICAL,HIGH + ignore-unfixed) counts the
# npm CLI that the base image bundles under /usr/local/lib/node_modules/npm.
# Those copies (pacote, sigstore, brace-expansion, picomatch, ip-address,
# undici) are NOT reachable from backend/package-lock.json, and the pinned
# node:22-slim digest is already the latest — so the fix is to bump the CLI
# itself (10.9.9 → NPM_VERSION: pacote/sigstore majors land on patched lines)
# and refresh the two packages upstream has not re-released yet, using
# same-major PATCH releases only (5.0.9→5.0.12, 6.28.0→6.28.1).
# npm/npx stay installed: the sandbox module's local-mode fallback (UC-06)
# shells out to them at runtime, so removing the CLI would be a regression.
# Build stages keep the base npm for `npm ci` — only the runtime CLI moves.
# The trailing probes fail the build if either patch broke module resolution
# or the CLI itself.
ARG NPM_VERSION=11.21.0
RUN npm install -g npm@${NPM_VERSION} --no-audit --no-fund --loglevel=error \
  && NM=/usr/local/lib/node_modules/npm/node_modules \
  && for entry in "brace-expansion 5.0.12" "undici 6.28.1"; do \
       name=$(echo "$entry" | cut -d ' ' -f1); ver=$(echo "$entry" | cut -d ' ' -f2); \
       tgz=$(npm pack "${name}@${ver}" --pack-destination /tmp --silent); \
       rm -rf "${NM}/${name}"; mkdir -p "${NM}/${name}"; \
       tar -xzf "/tmp/${tgz}" -C "${NM}/${name}" --strip-components=1; \
     done \
  && rm -rf /tmp/*.tgz \
  && node -e "require('${NM}/brace-expansion'); require('${NM}/undici')" \
  && npm --version \
  # SEC-04: upgrade Debian packages to fix CVE-2026-103111 (libpcre2-8-0 HIGH)
  # and the perl CVE set found by Trivy on 2026-10-10 (CVE-2026-13221 CRITICAL,
  # CVE-2026-42497 HIGH, CVE-2026-42496, CVE-2026-8376, CVE-2026-48962,
  # CVE-2026-57432, CVE-2026-57433 — perl-base/perl-modules in node:XX-slim)
  && apt-get update \
  && apt-get upgrade -y --no-install-recommends libpcre2-8-0 perl-base perl-modules-5.36 \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

# Runtime copies the pruned production node_modules + compiled dist only.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./

# (AD-6, SA4E-44) Baked ONNX embedding model cache from the `build` stage.
# Read-only at runtime (read_only rootfs in compose) — a cache hit needs no
# writes; with BAKE_EMBEDDING_MODEL=false the dir is empty and the runtime
# degrades to the logged hash fallback (mount a volume here to allow download).
COPY --from=build /app/models-cache ./models-cache
ENV TRANSFORMERS_CACHE=/app/models-cache

# --- Stdio MCP child servers (spawned by orchestration via bare command) ----
# Python runtime only — pip/venv tooling and git stay out of the image (SEC-05).
# The venv trees built in `mcp-python` are copied root-owned read-only
# (world-executable: the non-root backend can execute but not modify its own
# child servers). In-container `mcp_servers` DB rows can use bare commands:
#   { "command": "markitdown-mcp", "args": [] }
#   { "command": "markdown-exporter-mcp-local", "args": [] }
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 \
 && apt-get clean \
 && rm -rf /var/lib/apt/lists/*
COPY --from=mcp-python /opt/markitdown-venv /opt/markitdown-venv
COPY --from=mcp-python /opt/markdown-exporter-venv /opt/markdown-exporter-venv
# Console scripts resolve on the PATH inherited by the backend process and its
# stdio children; PYTHONUNBUFFERED keeps stderr logs streaming (no MCP breakage).
ENV PATH="/opt/markitdown-venv/bin:/opt/markdown-exporter-venv/bin:${PATH}"
ENV PYTHONUNBUFFERED=1

# Non-root runtime user (BR-05). Debian uses groupadd/useradd (not alpine addgroup).
# `-r` = system account, `nologin` shell = no interactive login.
RUN groupadd -g 1001 sa4e \
 && useradd -u 1001 -g sa4e -r -s /usr/sbin/nologin sa4e \
 && mkdir -p /app/.code-intel \
 && chown -R sa4e:sa4e /app \
 && mkdir -p /home/sa4e \
 && chmod -R 777 /home/sa4e
 
USER sa4e

ENV NODE_ENV=production
ENV PORT=48721

# SA4E-99 backpressure — max concurrent /api/index/source upload requests.
# Startup default only: hot-reloadable at runtime via the admin UI
# (Configuration → indexLimit.maxConcurrent — persisted, applied instantly via
# EventBus), and overridable per container with `docker run -e INDEX_CONCURRENCY_LIMIT=N`.
# 8 absorbs cloud DB/disk latency (local default stays 3) without unbounded flood.
ENV INDEX_CONCURRENCY_LIMIT=8

EXPOSE 48721

# Dependency-free health probe (SEC-12): node:22-slim does not ship `wget`, so a
# wget-based probe would silently fail. Use node's built-in http client instead.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:'+(process.env.PORT||48721)+'/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/index.js"]

# -----------------------------------------------------------------------------
# development — hot reload (tsx watch) for local dev. Non-root user.
# Build: docker compose -f docker-compose.yml -f docker-compose.dev.yml up
# -----------------------------------------------------------------------------
FROM base AS development
WORKDIR /app
ENV NODE_ENV=development
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
# (AD-6) Same baked embedding-model cache as production — dev containers embed
# with the real ONNX model instead of the sin-hash fallback.
COPY --from=build /app/models-cache ./models-cache
ENV TRANSFORMERS_CACHE=/app/models-cache
# Stdio MCP child servers — same venvs as production (see mcp-python stage);
# `base` already carries python3, so only the venv copies + PATH are needed.
COPY --from=mcp-python /opt/markitdown-venv /opt/markitdown-venv
COPY --from=mcp-python /opt/markdown-exporter-venv /opt/markdown-exporter-venv
ENV PATH="/opt/markitdown-venv/bin:/opt/markdown-exporter-venv/bin:${PATH}"
ENV PYTHONUNBUFFERED=1
RUN groupadd -g 1001 sa4e \
 && useradd -u 1001 -g sa4e -r -s /usr/sbin/nologin sa4e \
 && chown -R sa4e:sa4e /app
USER sa4e
EXPOSE 48721
CMD ["npx", "tsx", "watch", "--ignore", ".code-intel/**", "src/index.ts"]

# -----------------------------------------------------------------------------
# test — runs the vitest unit suite inside the container (non-root).
# Build: docker build --target test -t sa4e-backend-test .
# Run:   docker run --rm sa4e-backend-test
# -----------------------------------------------------------------------------
FROM base AS test
WORKDIR /app
ENV NODE_ENV=test
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
COPY tests/ ./tests/
COPY .env.test ./
RUN groupadd -g 1001 sa4e \
 && useradd -u 1001 -g sa4e -r -s /usr/sbin/nologin sa4e \
 && chown -R sa4e:sa4e /app
USER sa4e
CMD ["npx", "vitest", "run"]
