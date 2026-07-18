# SA4E-44 Backend Dockerfile
# Node.js 20 + Hono backend for Code Intelligence MCP Server
FROM node:20-alpine AS base

WORKDIR /app

# Install dependencies for native modules (better-sqlite3, onnxruntime-node)
RUN apk add --no-cache python3 make g++ git

# --- Dependencies stage ---
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# --- Build stage ---
FROM base AS build
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# --- Production stage ---
FROM node:20-alpine AS production

WORKDIR /app

# Runtime dependencies only
RUN apk add --no-cache git

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./

# Create non-root user
RUN addgroup -g 1001 -S sa4e && \
    adduser -S sa4e -u 1001 -G sa4e && \
    mkdir -p /app/.code-intel && \
    chown -R sa4e:sa4e /app

USER sa4e

ENV NODE_ENV=production
ENV PORT=48721

EXPOSE 48721

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:48721/health || exit 1

CMD ["node", "dist/index.js"]
