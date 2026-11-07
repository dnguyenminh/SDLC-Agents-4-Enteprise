# Dockerfile for SDLC Agents 4 Enterprise Extension Host
# SA4E-393: Integrate Impeccable design detection
# Criteria: lightweight, < 150MB

# ============================================================
# Build Stage
# ============================================================
FROM node:22-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files for both root and extension
COPY extension/package.json /app/extension/package.json
COPY extension/package-lock.json /app/extension/package-lock.json*

# Install dependencies (production only for lean image)
RUN npm ci --omit=dev && npm run build

# Copy source code
COPY extension/src /app/extension/src

# Build the extension (esbuild + resources)
RUN npm run esbuild-production && npm run copy-resources

# ============================================================
# Production Stage
# ============================================================
FROM node:22-alpine

# Set working directory
WORKDIR /app

# Copy built output from builder stage
COPY --from=builder /app/out /app/out
COPY --from=builder /app/extension/package.json /app/extension/package.json
COPY --from=builder /app/extension/node_modules /app/extension/node_modules

# Copy built extension output
COPY --from=builder /app/extension/out /app/out
COPY --from=builder /app/extension/esbuild*.js /app/
COPY --from=builder /app/extension/vitest*.toml /app/ 2>/dev/null || true

# Environment variables (set at container runtime, override as needed)
ENV IMPPECABLE_SKILL_PATH=/app/node_modules/impeccable-skill \
    QUALITY_GATE_THRESHOLD=0.8 \
    LOCALHOST_DEV_SERVER_URL=http://localhost:5173 \
    NODE_ENV=production

# Expose MCP wrapper port (default 9183, configurable via sdlcAgents.mcp.serverPort)
EXPOSE 9183

# Start extension host with MCP wrapper
# Uses the vsce-run mechanism or direct execution
ENTRYPOINT ["npx", "vsce", "run"]

# Health check: verify MCP wrapper is responding
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:9183/health || \
  curl --fail --silent --max-time 10 http://localhost:9183/health || exit 1

# ============================================================
# Image Size Expectation: ~100-130MB (node:22-alpine + deps)
# ============================================================