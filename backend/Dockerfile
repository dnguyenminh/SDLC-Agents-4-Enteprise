# SA4E-44 Backend Dockerfile
# Node.js 20 + Hono backend for Code Intelligence MCP Server
# Using Debian slim instead of Alpine for glibc compatibility (onnxruntime-node requires glibc)
FROM node:20-slim AS base
 
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
FROM node:20-slim AS production
 
WORKDIR /app
 
# Runtime dependencies only
RUN apt-get update && apt-get install -y --no-install-recommends \
    git ca-certificates wget \
    && rm -rf /var/lib/apt/lists/*
 
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
 
# Create non-root user and pre-create writable dirs:
#   /app/.code-intel — DB + config
#   /app/workspaces  — per-tenant workspaces (see SERVER_WORKSPACES_ROOT)
RUN groupadd -g 1001 sa4e && \
    useradd -u 1001 -g sa4e -s /bin/sh sa4e && \
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