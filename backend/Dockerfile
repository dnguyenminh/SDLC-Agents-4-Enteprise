# SA4E backend — multi-stage image
# Targets:
#   build      — full deps + TypeScript build output in dist/
#   test       — build + dev/test tooling (tests/, .env.test) for image-based runs
#   production — runtime only: package.json + trimmed node_modules + dist

# ---------- Stage: build ----------
FROM node:22-alpine AS build
WORKDIR /usr/src/app

# Install ALL dependencies — dev deps (tsc) are required to compile.
COPY package*.json ./
RUN npm install

# Copy sources (config first to leverage layer caching).
COPY tsconfig*.json ./
COPY src ./src
COPY scripts ./scripts

RUN npm run build

# Trim devDependencies so downstream stages ship a small runtime graph.
RUN npm prune --omit=dev

# ---------- Stage: test ----------
FROM build AS test
# .dockerignore re-includes tests/ and .env.test for this stage (SA4E-335 DEF-001).
WORKDIR /usr/src/app
COPY tests ./tests
COPY .env.test ./
CMD ["npm", "run", "check:ci"]

# ---------- Stage: production ----------
FROM node:22-alpine AS production
WORKDIR /usr/src/app
ENV NODE_ENV=production

# SEC-04 supply-chain hardening: the stock node:22-alpine bundles an npm/yarn
# with known HIGH CVEs (2026-11). Runtime never uses yarn — strip it; patch
# global npm to current so the image's npm tree is clean for the Trivy gate.
RUN npm install -g npm@latest && rm -rf /opt/yarn*

COPY --from=build /usr/src/app/package*.json ./
COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist

EXPOSE 48721
CMD ["npm", "start"]
