# syntax=docker/dockerfile:1
# =============================================================================
# SA4E-335 Backend Dockerfile — Node.js 22 + Hono Code Intelligence MCP Server
# -----------------------------------------------------------------------------
# Multi-stage build (6 stages): base, deps, build, production, development, test.
# `production` is the SOLE CI push target (TDD AD-2). Build-only tooling never
# reaches the runtime image.
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
RUN npm run build
# (AD-6, conditional) Pre-download embedding model into TRANSFORMERS_CACHE here
# and strip tree-sitter-jsp to keep the build hermetic. DEFAULT OFF (SEC-08):
# enable only when the runtime genuinely needs local embeddings / diagram export.

# -----------------------------------------------------------------------------
# production ★ — runtime image. SOLE CI push target. Minimal surface, non-root.
# No git, no compilers (SEC-05). node:22-slim pinned by digest (SEC-02).
# -----------------------------------------------------------------------------
FROM node:${NODE_VERSION}-slim@${NODE_BASE_DIGEST} AS production
WORKDIR /app

# Runtime copies the pruned production node_modules + compiled dist only.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./

# Non-root runtime user (BR-05). Debian uses groupadd/useradd (not alpine addgroup).
# `-r` = system account, `nologin` shell = no interactive login.
RUN groupadd -g 1001 sa4e \
 && useradd -u 1001 -g sa4e -r -s /usr/sbin/nologin sa4e \
 && mkdir -p /app/.code-intel \
 && chown -R sa4e:sa4e /app
USER sa4e

ENV NODE_ENV=production
ENV PORT=48721

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
