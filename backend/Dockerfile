# SA4E-44 Backend Dockerfile
# Node.js 22 + Hono backend for Code Intelligence MCP Server
# Using Debian slim instead of Alpine for glibc compatibility (onnxruntime-node requires glibc)
FROM node:22-slim AS base

WORKDIR /app

# Install dependencies for native modules (better-sqlite3, onnxruntime-node)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Skip Playwright's postinstall browser download — read_webpage tool works via
# dynamic import; browsers can be installed by the user on-demand if needed.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

# --- Dependencies stage ---
FROM base AS deps
COPY package.json ./
COPY package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# --- Build stage ---
FROM base AS build
COPY package.json ./
COPY package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY tsconfig.json ./
COPY src/ ./src/
COPY scripts/ ./scripts/
RUN npm run build

# Pre-download embedding model into image so it works offline
ENV TRANSFORMERS_CACHE=/app/.hf-cache
RUN node scripts/preload-models.mjs || echo "preload-models skipped. Models will load at runtime."

# --- Production stage ---
FROM node:22-slim AS production

WORKDIR /app

# Runtime dependencies only
RUN apt-get update && apt-get install -y --no-install-recommends \
    git ca-certificates wget \
    && rm -rf /var/lib/apt/lists/*

# draw.io CLI + Electron runtime dependencies (for drawio_export_png tool)
# Electron requires X11 libs + virtual framebuffer (xvfb) to render headless in Docker
# libasound2t64 is the amd64 Bookworm name; arm64 keeps the original libasound2
ARG DRAWIO_VERSION=24.7.8
RUN apt-get update \
    && ARCH=$(dpkg --print-architecture) \
    && ALSA_PKG=$(if [ "$ARCH" = "amd64" ]; then echo "libasound2t64"; else echo "libasound2"; fi) \
    && apt-get install -y --no-install-recommends \
        xvfb \
        xauth \
        libgbm1 \
        "$ALSA_PKG" \
        libatk1.0-0 \
        libatk-bridge2.0-0 \
        libcups2 \
        libdrm2 \
        libglib2.0-0 \
        libgtk-3-0 \
        libnspr4 \
        libnss3 \
        libx11-xcb1 \
        libxcomposite1 \
        libxdamage1 \
        libxrandr2 \
        libxss1 \
        libxtst6 \
        fonts-liberation \
    && wget -q -O /tmp/drawio.deb \
       "https://github.com/jgraph/drawio-desktop/releases/download/v${DRAWIO_VERSION}/drawio-${ARCH}-${DRAWIO_VERSION}.deb" \
    && apt-get install -y --no-install-recommends /tmp/drawio.deb \
    && rm /tmp/drawio.deb \
    && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./

# Create non-root user and pre-create writable dirs:
#   /app/.code-intel — DB + config
#   /app/workspaces  — per-tenant workspaces (see SERVER_WORKSPACES_ROOT)
RUN groupadd -g 1001 sa4e && \
    useradd -u 1001 -g sa4e -m -s /bin/sh sa4e && \
    mkdir -p /app/.code-intel /app/workspaces && \
    chown -R sa4e:sa4e /app

# Default server-controlled workspace root — one dir per projectId lives here.
ENV SERVER_WORKSPACES_ROOT=/app/workspaces

USER sa4e

ENV NODE_ENV=production
ENV PORT=48721

EXPOSE 48721

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:48721/health || exit 1

CMD ["node", "dist/index.js"]

# -----------------------------------------------------------------------------
# Development stage — hot reload (tsx watch) for local dev. Non-root user.
# Build: docker compose -f docker-compose.yml -f docker-compose.dev.yml up
# -----------------------------------------------------------------------------
FROM base AS development
WORKDIR /app
ENV NODE_ENV=development
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN addgroup -g 1001 -S sa4e && \
    adduser -S sa4e -u 1001 -G sa4e && \
    chown -R sa4e:sa4e /app
USER sa4e
EXPOSE 48721
CMD ["npx", "tsx", "watch", "--ignore", ".code-intel/**", "src/index.ts"]

# -----------------------------------------------------------------------------
# Test stage — runs the vitest unit suite inside the container (non-root).
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
RUN addgroup -g 1001 -S sa4e && \
    adduser -S sa4e -u 1001 -G sa4e && \
    chown -R sa4e:sa4e /app
USER sa4e
CMD ["npx", "vitest", "run"]
